// Fase 1 — operações gerenciais por CLIENTE (30/10/2026). O "Carregar padrão" copiava a lista inteira de OGs para cada
// fazenda (até 25 cópias de "SALÁRIOS - FAZ" num mesmo cliente) e os documentos apontam para cópias diferentes. Para
// cada cliente e cada classificação fica UMA OG do cliente (conta_id preenchido, fazenda_id vazio): a cópia mais usada.
// Permissões somadas (se alguma cópia permite, a OG permite); fica ativa se alguma cópia estiver ativa; conta
// contábil/LCDPR da escolhida (ou da primeira cópia que tiver). Todos os documentos que apontam para as outras cópias
// (ou para a OG global da mesma classificação) passam a apontar para a OG do cliente; as cópias saem.
// As OGs globais (fazenda e cliente vazios) continuam como modelo do sistema.
//
// Uso: node --env-file=.env.local scripts/og-unificar-por-cliente.mjs [--conta <id>] [--aplicar]
//   sem --aplicar: simulação (nada é gravado); grava o plano em backup/og_unificar_plano_<data>.json
import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";

const arg = k => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null; };
const aplicar = process.argv.includes("--aplicar");
const soConta = arg("--conta");
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const hoje = new Date().toISOString().slice(0, 10);

async function todos(tabela, sel, filtro = q => q) {
  let out = [], i = 0;
  for (;;) {
    const { data, error } = await filtro(sb.from(tabela).select(sel)).order("id").range(i, i + 999);
    if (error) throw new Error(`${tabela}: ${error.message}`);
    out = out.concat(data); if (data.length < 1000) break; i += 1000;
  }
  return out;
}

// Tabelas que guardam id de OG (levantado do esquema da API em 30/10/2026)
const REFS = [
  ["lancamentos", "operacao_gerencial_id"], ["empresa_lancamentos", "operacao_gerencial_id"],
  ["nf_entradas", "operacao_gerencial_id"], ["nf_entrada_itens", "operacao_gerencial_id"],
  ["nf_servicos", "operacao_gerencial_id"], ["cte_entradas", "operacao_gerencial_id"],
  ["previsoes_gasto", "operacao_gerencial_id"], ["apoio_lancamentos", "operacao_gerencial_id"],
  ["operacoes_tesouraria", "operacao_gerencial_id"], ["regras_classificacao_nf", "operacao_gerencial_id"],
  ["operacao_cfop_fiscal", "operacao_gerencial_id"], ["nf_importada_itens_sieg", "og_id"],
  ["pessoas", "og_padrao_id"], ["adiantamentos_aplicacoes", "og_anterior"],
];
const BOOLS_OU = ["permite_notas_fiscais", "permite_cp_cr", "permite_adiantamentos", "permite_tesouraria", "permite_baixas", "permite_custo_produto",
  "permite_contrato_financeiro", "permite_estoque", "permite_pedidos_venda", "permite_manutencao", "permite_energia_eletrica", "permite_combustivel",
  "gerar_financeiro", "gerar_financeiro_gerencial", "informa_complemento"];
const TEXTOS = ["conta_debito", "conta_credito", "tipo_lcdpr", "codigo_lcdpr", "historico_tesouraria_id", "historico_tesouraria_nome", "escopo_cc", "natureza_receita", "obs_legal"];
const COMPARAR = ["descricao", "tipo", "inativo", ...BOOLS_OU, ...TEXTOS];

const fazendas = await todos("fazendas", "id, nome, conta_id");
const contaDaFazenda = new Map(fazendas.map(f => [f.id, f.conta_id]));
const contas = new Map((await todos("contas", "id, nome")).map(c => [c.id, c.nome]));
const ogs = await todos("operacoes_gerenciais", "*");
const porId = new Map(ogs.map(o => [o.id, o]));
console.log(`OGs: ${ogs.length} (globais ${ogs.filter(o => !o.fazenda_id && !o.conta_id).length})`);

// Referências: quantas vezes cada OG é usada e por quem (para reapontar e escolher a mais usada)
const usos = new Map();
const linhasRef = {};
for (const [t, c] of REFS) {
  const rows = await todos(t, `id, ${c}${t === "operacoes_gerenciais" ? "" : ""}`, q => q.not(c, "is", null)).catch(e => { console.log("  aviso:", e.message); return []; });
  linhasRef[`${t}.${c}`] = rows;
  for (const r of rows) usos.set(r[c], (usos.get(r[c]) ?? 0) + 1);
}
for (const o of ogs) if (o.parent_id) usos.set(o.parent_id, (usos.get(o.parent_id) ?? 0) + 1);

// Clientes: OG do cliente = conta_id; cópia de fazenda → cliente da fazenda
const contaDe = o => o.conta_id ?? (o.fazenda_id ? contaDaFazenda.get(o.fazenda_id) : null);
const grupos = new Map();
for (const o of ogs) {
  const conta = contaDe(o);
  if (!conta || (soConta && conta !== soConta)) continue;
  // Mesma classificação E mesmo nome (sem diferença de maiúscula/acento): cópias com o mesmo código mas significado
  // diferente (ex.: "REEMBOLSO DE FUNCIONÁRIO" × "Copa e Cozinha") ficam separadas — não reclassifica documento
  const nome = String(o.descricao ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/\s+/g, " ").trim();
  const k = `${conta}|${o.classificacao ?? `#${o.id}`}|${nome}`;
  (grupos.get(k) ?? grupos.set(k, []).get(k)).push(o);
}
const globalPorClass = new Map(ogs.filter(o => !o.fazenda_id && !o.conta_id).map(o => [o.classificacao, o]));

const remap = new Map();          // id antigo → id da OG do cliente
const atualizarOg = [];           // OGs escolhidas: campos novos
const apagar = [];                // cópias que saem
const divergencias = [];
const resumoConta = {};
for (const [k, lista] of grupos) {
  const [conta, classif] = k.split("|");
  // Escolhida: a que já é do cliente; senão a mais usada; desempate pelo id
  const ordenada = [...lista].sort((a, b) => (b.conta_id ? 1 : 0) - (a.conta_id ? 1 : 0) || (usos.get(b.id) ?? 0) - (usos.get(a.id) ?? 0) || a.id.localeCompare(b.id));
  const esc = ordenada[0];
  const ativas = lista.filter(o => !o.inativo);
  const base = ativas.length ? ativas : lista;
  const campos = { conta_id: conta, fazenda_id: null, inativo: ativas.length === 0 };
  for (const b of BOOLS_OU) campos[b] = base.some(o => o[b] === true) ? true : (esc[b] ?? null);
  for (const t of TEXTOS) campos[t] = esc[t] ?? base.find(o => o[t] != null && o[t] !== "")?.[t] ?? null;
  atualizarOg.push({ id: esc.id, antes: Object.fromEntries(Object.keys(campos).map(c => [c, esc[c] ?? null]).concat([["parent_id", esc.parent_id]])), campos });
  for (const o of lista) if (o.id !== esc.id) { remap.set(o.id, esc.id); apagar.push(o); }
  // A OG global da mesma classificação, usada pelos documentos deste cliente, também passa para a OG do cliente
  const g = classif && globalPorClass.get(classif);
  const nomeG = g ? String(g.descricao ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/\s+/g, " ").trim() : "";
  if (g && nomeG === k.split("|")[2]) remap.set(`${conta}|${g.id}`, esc.id);
  const diffs = COMPARAR.filter(c => new Set(lista.map(o => JSON.stringify(o[c] ?? null))).size > 1);
  if (diffs.length && lista.length > 1) divergencias.push({ conta: contas.get(conta) ?? conta, classificacao: classif, descricoes: [...new Set(lista.map(o => o.descricao))], campos: diffs, copias: lista.length });
  const r = resumoConta[contas.get(conta) ?? conta] ??= { ogs_cliente: 0, copias_saem: 0 };
  r.ogs_cliente++; r.copias_saem += lista.length - 1;
}

// Documentos a reapontar (cópias → OG do cliente; global → OG do cliente, só nos documentos daquele cliente)
const fazendaDoDoc = {};   // tabela → id → fazenda (para o caso da global)
const reapontar = [];
for (const [chave, rows] of Object.entries(linhasRef)) {
  const [t, c] = chave.split(".");
  for (const r of rows) {
    let novo = remap.get(r[c]);
    if (!novo && globalPorClass.size && porId.get(r[c]) && !porId.get(r[c]).fazenda_id && !porId.get(r[c]).conta_id) {
      fazendaDoDoc[t] ??= null;
      reapontar.push({ t, c, id: r.id, de: r[c], global: true });
      continue;
    }
    if (novo && novo !== r[c]) reapontar.push({ t, c, id: r.id, de: r[c], para: novo });
  }
}
// Documentos que apontam para a OG global: descobre o cliente pelo fazenda_id do documento
const globaisPorTabela = {};
for (const x of reapontar.filter(x => x.global)) (globaisPorTabela[x.t] ??= []).push(x);
for (const [t, lista] of Object.entries(globaisPorTabela)) {
  const ids = lista.map(x => x.id);
  const faz = new Map();
  for (let i = 0; i < ids.length; i += 200) {
    const { data, error } = await sb.from(t).select("id, fazenda_id").in("id", ids.slice(i, i + 200));
    if (error) break;
    for (const d of data ?? []) faz.set(d.id, d.fazenda_id);
  }
  for (const x of lista) { const conta = contaDaFazenda.get(faz.get(x.id)); x.para = conta ? remap.get(`${conta}|${x.de}`) : undefined; }
}
const finais = reapontar.filter(x => x.para && x.para !== x.de);
const porTabela = {}; for (const x of finais) porTabela[`${x.t}.${x.c}`] = (porTabela[`${x.t}.${x.c}`] ?? 0) + 1;
// Hierarquia: parent_id das OGs que ficam aponta para a OG do cliente do pai
const parents = [];
for (const u of atualizarOg) { const p = porId.get(u.id).parent_id; const novo = p && (remap.get(p) ?? null); if (novo && novo !== p) parents.push({ id: u.id, de: p, para: novo }); }

const porClass = new Map();
for (const k of grupos.keys()) { const [c, cl] = k.split("|"); const kk = `${c}|${cl}`; porClass.set(kk, [...(porClass.get(kk) ?? []), k.split("|")[2]]); }
const mesmoCodigoNomeDiferente = [...porClass.entries()].filter(([, n]) => n.length > 1).map(([kk, n]) => ({ conta: contas.get(kk.split("|")[0]) ?? kk.split("|")[0], classificacao: kk.split("|")[1], nomes: n }));
console.log(`\nPor cliente (OGs do cliente que ficam / cópias que saem):`);
console.table(resumoConta);
console.log(`Documentos a reapontar: ${finais.length}`); console.table(porTabela);
console.log(`Hierarquia (pai da OG) a reapontar: ${parents.length}`);
console.log(`Mesmo código com nomes diferentes no mesmo cliente (ficam separadas, para revisar): ${mesmoCodigoNomeDiferente.length}`);
for (const m of mesmoCodigoNomeDiferente) console.log(`  ${m.conta} · ${m.classificacao}: ${m.nomes.join(" | ")}`);
console.log(`Classificações cujas cópias divergem entre si: ${divergencias.length}`);
for (const d of divergencias.filter(d => d.campos.some(f => !/historico_tesouraria/.test(f))).slice(0, 15)) console.log(`  ${d.conta} · ${d.classificacao} (${d.copias} cópias) · ${d.campos.join(", ")}${d.descricoes.length > 1 ? ` · nomes: ${d.descricoes.join(" | ")}` : ""}`);
fs.mkdirSync("backup", { recursive: true });
const arqPlano = `backup/og_unificar_plano_${hoje}.json`;
fs.writeFileSync(arqPlano, JSON.stringify({ resumoConta, porTabela, mesmoCodigoNomeDiferente, divergencias, atualizarOg, apagar: apagar.map(o => o.id), parents, reapontar: finais }, null, 1));
console.log(`\nPlano completo: ${arqPlano}`);
if (!aplicar) { console.log("Simulação — nada foi gravado. Rode com --aplicar para executar (backup completo antes)."); process.exit(0); }

// ── Aplicar ──────────────────────────────────────────────────────────────────
const arqBkp = `backup/og_unificar_backup_${hoje}_${Date.now()}.json`;
fs.writeFileSync(arqBkp, JSON.stringify({ ogs: ogs.filter(o => contaDe(o) && (!soConta || contaDe(o) === soConta)), reapontar: finais, parents }, null, 1));
console.log(`Backup: ${arqBkp}`);
// 1. OG escolhida vira do cliente
for (const u of atualizarOg) { const { error } = await sb.from("operacoes_gerenciais").update(u.campos).eq("id", u.id); if (error) throw new Error(`OG ${u.id}: ${error.message}`); }
// 2. Documentos (agrupados por destino para atualizar em lote)
const lotes = new Map();
for (const x of finais) { const k = `${x.t}|${x.c}|${x.para}`; (lotes.get(k) ?? lotes.set(k, []).get(k)).push(x.id); }
let feitos = 0;
for (const [k, ids] of lotes) {
  const [t, c, para] = k.split("|");
  for (let i = 0; i < ids.length; i += 200) {
    const { error } = await sb.from(t).update({ [c]: para }).in("id", ids.slice(i, i + 200));
    if (error) {
      // CFOP por operação: a OG do cliente já tem o mesmo CFOP → a linha repetida da cópia sai
      if (t === "operacao_cfop_fiscal") { await sb.from(t).delete().in("id", ids.slice(i, i + 200)); continue; }
      throw new Error(`${t}.${c}: ${error.message}`);
    }
    feitos += Math.min(200, ids.length - i);
  }
}
console.log(`Documentos reapontados: ${feitos}`);
// 3. Hierarquia
for (const p of parents) await sb.from("operacoes_gerenciais").update({ parent_id: p.para }).eq("id", p.id);
// 4. Cópias saem (filhas antes dos pais)
const ordemApagar = [...apagar].sort((a, b) => (b.classificacao ?? "").length - (a.classificacao ?? "").length);
await sb.from("operacoes_gerenciais").update({ parent_id: null }).in("id", ordemApagar.map(o => o.id).slice(0, 0));
let apagadas = 0, falhas = [];
for (let i = 0; i < ordemApagar.length; i += 200) {
  const ids = ordemApagar.slice(i, i + 200).map(o => o.id);
  await sb.from("operacoes_gerenciais").update({ parent_id: null }).in("id", ids);
  const { error } = await sb.from("operacoes_gerenciais").delete().in("id", ids);
  if (error) { for (const id of ids) { const { error: e1 } = await sb.from("operacoes_gerenciais").delete().eq("id", id); if (e1) falhas.push(`${id}: ${e1.message}`); else apagadas++; } }
  else apagadas += ids.length;
}
console.log(`Cópias apagadas: ${apagadas}${falhas.length ? ` · não apagadas (ainda referenciadas): ${falhas.length}` : ""}`);
if (falhas.length) { fs.writeFileSync(`backup/og_unificar_falhas_${hoje}.json`, JSON.stringify(falhas, null, 1)); console.log(falhas.slice(0, 5).join("\n")); }
console.log("Feito.");
