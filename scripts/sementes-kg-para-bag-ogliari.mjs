// Conversão das sementes do Grupo Ogliari de kg para bag (decisões do dono em 04/11/2026).
// Prévia:   node --env-file=.env.local scripts/sementes-kg-para-bag-ogliari.mjs
// Aplicar:  node --env-file=.env.local scripts/sementes-kg-para-bag-ogliari.mjs --aplicar
// Não mexe em CP, no valor das NFs nem no documento fiscal. Cópia de segurança em backup/ antes de gravar.
import { createClient } from "@supabase/supabase-js";
import { writeFileSync } from "node:fs";

const APLICAR = process.argv.includes("--aplicar");
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const CONTA = "2fd25be6-924f-40fb-852f-b6624393a68e";
const HOJE = "2026-11-04";

// Peso do bag por lote, das anotações das NFs de compra (infCpl / infAdProd)
const PESO = { SQ32L28: 912, SQ32L27: 895, SQ32L04: 707, SQ32L18: 12774 / 18, SQ32L16: 707, SQ32L05: 906, SQ34L12: 923, SQ32L03: 717, SQ32L15: 712, SQ34L02: 916,
  SQ32L10: 678, SQ16L02: 895, SQ16L07: 891, SQ16L06: 903, SQ19L31: 1206, SQ19L30: 1209, SQ25L02: 870, SQ26L03: 888, SQ27L01: 981, SQ34L105: 1114, SQ37L04: 904,
  IT8263118: 1110, "8082261998": 810, "8082262205": 1025, "8082262029": 1005, "8081262385": 785, PS79802555526: 730, G269MJ8408: 807 };
// Sem lote na movimentação: variedade de lote único
const PESO_VARIEDADE = { "SEM. SOJA BRS 284": 1114, "SEMENTE SOJA UFVS-77C10": 1206 };
// Casos conferidos um a um: [transferência, nome kg, lote ou "", kg] -> bags
const FIXOS = [
  ["*", "SEM. DE SOJA BRS 8381", "SQ32L07", 5538, 6],      // lote digitado errado; 6 x 923 (SQ34L12)
  ["*", "SEMENTE SOJA CG 7681", "SQ32L07", 5434, 6],       // lote digitado errado
  ["*", "SEMENTE SOJA CG 7681", "", 5370, 6],              // 6 x 895
  ["*", "SEMENTE SOJA CG 7681", "", 900, 1],
  ["*", "SEMENTE SOJA CG 7681", "", 891, 1],               // transferência cancelada, sem lote; saldo líquido zero
  ["*", "SEM. DE SOJA BRS 8381", "", 5436, 6],             // transferência cancelada, sem lote; saldo líquido zero
  ["*", "SEM. DE SOJA BRS 8381", "", 5538, 6],             // transferência cancelada, sem lote; saldo líquido zero
  ["TRF-283411", "SEM. DE SOJA BRS 8381", "SQ34L12", 1, 1],  // bag digitado como kg
  ["TRF-502849", "SEM. DE SOJA C24452", "", 5, 5],           // bag digitado como kg
  ["TRF-121976", "SEM. DE SOJA C24452", "SQ25L02", 5, 5],    // bag digitado como kg; lote é da TMG 24450
];
const TROCA_VARIEDADE = { "TRF-121976": { "SEM. DE SOJA C24452": "SEM: DE SOJA TMG 24450" } };
// Mesma carga lançada mais de uma vez: fica uma só
const DUPLICADAS = {
  "TRF-666754": "NF 4 emitida em homologação, sem valor fiscal: a carga real é a da NF 6 (TRF-860223)",
  "TRF-617138": "NF 5 emitida em homologação, sem valor fiscal: a carga real é a da NF 6 (TRF-860223)",
  "NF-1297": "Registro retroativo em dobro: a carga da NF 1297 já está na TRF-462655",
};
const SEM_NF = ["SEM DE SOJA BRS 7583", "SEM: DE SOJA TMG 24452", "SEM: SOJA TMG 24451", "SEM: SOJA77C10", "SEMENTE SOJA BRS 579 - S1 - 6,00 - BAG"];
// Pedido entregue parte por NF em kg (convertida aqui) e parte por NF já em bag sem vínculo com o pedido
const BAGS_JA_ENTREGUES = { "SEMENTE SOJA CG 7681": 34 /* NF 8920 */, "SEMENTE SOJA UFVS-77C10": 9 /* NF 8933 */ };
const UNIDADE_ERRADA = "SEMENTE SOJA BRS 579 - S1 - 6,00 - BAG";

async function tudo(t, sel, filtro) {
  const o = [];
  for (let d = 0; ; d += 1000) {
    let q = sb.from(t).select(sel); if (filtro) q = filtro(q);
    const { data, error } = await q.order("id").range(d, d + 999);
    if (error) throw new Error(`${t}: ${error.message}`);
    o.push(...data); if (data.length < 1000) break;
  }
  return o;
}
const r2 = n => Math.round(n * 100) / 100;
const lote = s => (s ?? "").trim().toUpperCase();
const sinal = m => (m.tipo === "saida" ? -1 : 1) * Number(m.quantidade);

const fazendas = await tudo("fazendas", "id,nome", q => q.eq("conta_id", CONTA));
const nomeFaz = Object.fromEntries(fazendas.map(f => [f.id, f.nome]));
const ids = fazendas.map(f => f.id);
const deps = await tudo("depositos", "id,nome", q => q.in("fazenda_id", ids));
const nomeDep = Object.fromEntries(deps.map(d => [d.id, d.nome]));
const sementes = await tudo("insumos", "id,nome,unidade,estoque,custo_medio", q => q.eq("categoria", "semente").in("fazenda_id", ids));
const kgs = sementes.filter(i => (i.unidade === "kg") && !/crotalaria/i.test(i.nome));
const porNome = Object.fromEntries(sementes.map(i => [i.nome, i]));
const bagDe = nome => porNome[`${nome} - BAG`];
const movs = await tudo("movimentacoes_estoque", "*", q => q.in("insumo_id", kgs.map(i => i.id)));
const kgNome = Object.fromEntries(kgs.map(i => [i.id, i.nome]));
const trfDe = m => m.motivo?.match(/(TRF-\d+|NF-\d+)/)?.[1] ?? null;

const erros = [], inversos = [], updates = [], ajustes = [], fracoes = [];
function bagsDe(m) {
  const nome = kgNome[m.insumo_id], l = lote(m.lote_semente), q = Number(m.quantidade), trf = trfDe(m);
  const fixo = FIXOS.find(f => (f[0] === "*" || f[0] === trf) && f[1] === nome && f[2] === l && f[3] === q);
  if (fixo) return fixo[4];
  const peso = PESO[l] ?? PESO_VARIEDADE[nome];
  return peso ? r2(q / peso) : null;
}
for (const m of movs) {
  const nome = kgNome[m.insumo_id];
  if (SEM_NF.includes(nome)) {
    if (m.motivo !== "acerto_migracao_saldo") erros.push(`${nome}: movimento inesperado ${m.motivo}`);
    ajustes.push({ insumo_id: m.insumo_id, fazenda_id: m.fazenda_id, deposito_id: m.deposito_id, tipo: "ajuste", motivo: "ajuste_saldo", quantidade: -Number(m.quantidade), data: HOJE, valor_unitario: m.valor_unitario, auto: true,
      observacao: "Saldo inicial de 24/10 sem nota e sem semente física: zerado na conversão para bag, a pedido do dono (04/11/2026)" });
    continue;
  }
  if (!m.nf_entrada_id && !trfDe(m)) { erros.push(`${nome}: movimento sem NF nem transferência (${m.motivo})`); continue; }
  const bags = bagsDe(m);
  if (bags == null) { erros.push(`${nome}: sem peso para lote "${m.lote_semente}" (${m.quantidade} kg, ${m.motivo})`); continue; }
  const destinoNome = TROCA_VARIEDADE[trfDe(m)]?.[nome] ?? nome;
  const bag = bagDe(destinoNome);
  if (!bag) { erros.push(`${destinoNome}: sem cadastro em bag`); continue; }
  if (bags !== Math.round(bags)) fracoes.push(`${nome} | ${m.lote_semente ?? "-"} | ${m.quantidade} kg = ${bags} bags | ${m.motivo}`);
  const q = Number(m.quantidade);
  const novo = { insumo_id: bag.id, quantidade: bags, valor_unitario: m.valor_unitario == null ? null : r2(Number(m.valor_unitario) * q / bags), custo_unitario_na_baixa: m.custo_unitario_na_baixa == null ? null : r2(Number(m.custo_unitario_na_baixa) * q / bags) };
  updates.push({ id: m.id, de: { insumo_id: m.insumo_id, quantidade: q, valor_unitario: m.valor_unitario, custo_unitario_na_baixa: m.custo_unitario_na_baixa }, para: novo, trf: trfDe(m), m });
  const trf = trfDe(m);
  if (trf && DUPLICADAS[trf] && !/cancelamento/i.test(m.motivo ?? "")) {
    inversos.push({ insumo_id: bag.id, fazenda_id: m.fazenda_id, deposito_id: m.deposito_id, tipo: m.tipo === "saida" ? "entrada" : "saida", motivo: `Cancelamento — Transferência ${trf}`, quantidade: bags, data: HOJE, valor_unitario: novo.valor_unitario, lote_semente: m.lote_semente, auto: true, observacao: DUPLICADAS[trf] });
  }
}

// Itens de NF, de transferência e de pedido
const itensNf = await tudo("nf_entrada_itens", "id,nf_entrada_id,insumo_id,quantidade,valor_total,unidade,fator_conversao,pedido_item_id", q => q.in("insumo_id", kgs.map(i => i.id)));
const updItensNf = [];
for (const it of itensNf) {
  const mv = updates.filter(u => u.m.nf_entrada_id === it.nf_entrada_id && u.m.insumo_id === it.insumo_id && u.m.tipo === "entrada");
  const bags = r2(mv.reduce((s, u) => s + u.para.quantidade, 0));
  const kg = mv.reduce((s, u) => s + u.de.quantidade, 0);
  if (!bags || kg !== Number(it.quantidade)) { erros.push(`Item de NF ${it.id}: movimentos somam ${kg} kg e o item tem ${it.quantidade} kg`); continue; }
  updItensNf.push({ id: it.id, de: it, para: { insumo_id: bagDe(kgNome[it.insumo_id]).id, unidade: "bag", quantidade: bags, valor_unitario: Number(it.valor_total) / bags, fator_conversao: Number(it.quantidade) / bags }, pedido_item_id: it.pedido_item_id });
}
const transf = await tudo("transferencias_estoque", "id,numero,status,observacao", q => q.in("fazenda_origem_id", ids));
const numeroT = Object.fromEntries(transf.map(t => [t.id, t.numero]));
const itensT = await tudo("transferencias_estoque_itens", "*", q => q.in("insumo_id", kgs.map(i => i.id)));
const updItensT = [];
for (const it of itensT) {
  const trf = numeroT[it.transferencia_id];
  if (!trf) { erros.push(`Item de transferência ${it.id} de outra conta`); continue; }
  const b = bagsDe({ insumo_id: it.insumo_id, lote_semente: it.lote_semente, quantidade: it.quantidade, motivo: `Transferência ${trf}` });
  const nome = TROCA_VARIEDADE[trf]?.[kgNome[it.insumo_id]] ?? kgNome[it.insumo_id];
  if (b == null || !bagDe(nome)) { erros.push(`Item de ${trf}: ${kgNome[it.insumo_id]} lote "${it.lote_semente}" ${it.quantidade} kg sem conversão`); continue; }
  updItensT.push({ id: it.id, de: it, para: { insumo_id: bagDe(nome).id, quantidade: b, unidade_medida: "bag", custo_unitario: it.custo_unitario == null ? null : r2(Number(it.custo_unitario) * Number(it.quantidade) / b) } });
}
// Pedido: só o que já foi entregue por NF. Item ainda sem entrega continua como está e entra na lista de pendências.
const pedIds = [...new Set(updItensNf.map(u => u.pedido_item_id).filter(Boolean))];
const pedItens = pedIds.length ? await tudo("pedidos_compra_itens", "*", q => q.in("id", pedIds)) : [];
const updPed = [];
for (const p of pedItens) {
  const { data: ligados } = await sb.from("nf_entrada_itens").select("id,quantidade,unidade").eq("pedido_item_id", p.id);
  const nomeItem = sementes.find(i => i.id === p.insumo_id)?.nome;
  const bags = r2((BAGS_JA_ENTREGUES[nomeItem] ?? 0) + (ligados ?? []).reduce((s, l) => { const u = updItensNf.find(x => x.id === l.id); return s + (u ? u.para.quantidade : /bag/i.test(l.unidade ?? "") ? Number(l.quantidade) : 0); }, 0));
  if (!bags) continue;
  updPed.push({ id: p.id, de: p, para: { insumo_id: updItensNf.find(u => u.pedido_item_id === p.id).para.insumo_id, unidade: "bag", quantidade: bags, qtd_entregue: bags, valor_unitario: Number(p.quantidade) * Number(p.valor_unitario) / bags } });
}
const pedPend = (await tudo("pedidos_compra_itens", "id,nome_item,quantidade,unidade,qtd_entregue", q => q.in("insumo_id", kgs.map(i => i.id)))).filter(p => !updPed.some(u => u.id === p.id));

// Quadro final em bags: saldo atual em bag + convertido - duplicadas
const bagsMov = await tudo("movimentacoes_estoque", "id,insumo_id,tipo,quantidade,fazenda_id,deposito_id", q => q.in("insumo_id", sementes.filter(i => i.unidade === "bag").map(i => i.id)));
const quadro = {};
const nomeBag = Object.fromEntries(sementes.map(i => [i.id, i.nome.replace(/ - BAG$/, "")]));
const soma = (ins, f, d, v) => { const g = (quadro[nomeBag[ins]] ??= {}); const k = `${nomeFaz[f]} / ${nomeDep[d] ?? "sem depósito"}`; g[k] = r2((g[k] ?? 0) + v); };
// A transferência em kg saiu de uma fazenda que não tem o bag (o bag da mesma compra está na Frei Galvão, no Depósito Santa Rita,
// de onde a carga saiu de fato). A saída convertida passa para lá, para a conversão não criar saldo negativo.
const FREI = fazendas.find(f => f.nome === "Fazenda Frei Galvão").id;
const DEP_SR = deps.find(d => d.nome === "Depósito Santa Rita").id;
const saldo = new Map();
const chave = (i, f, d) => `${i}|${f}|${d}`;
const mexe = (i, f, d, v) => saldo.set(chave(i, f, d), (saldo.get(chave(i, f, d)) ?? 0) + v);
for (const m of bagsMov) mexe(m.insumo_id, m.fazenda_id, m.deposito_id, sinal(m));
for (const u of updates) mexe(u.para.insumo_id, u.m.fazenda_id, u.m.deposito_id, (u.m.tipo === "saida" ? -1 : 1) * u.para.quantidade);
for (const m of inversos) mexe(m.insumo_id, m.fazenda_id, m.deposito_id, sinal(m));
const repontados = [];
for (const u of updates) {
  if (u.m.tipo !== "saida" || /cancelamento/i.test(u.m.motivo ?? "") || DUPLICADAS[u.trf]) continue;
  const i = u.para.insumo_id, q = u.para.quantidade;
  if ((saldo.get(chave(i, u.m.fazenda_id, u.m.deposito_id)) ?? 0) >= -0.001) continue;
  if (u.m.fazenda_id === FREI && u.m.deposito_id === DEP_SR) continue;
  if ((saldo.get(chave(i, FREI, DEP_SR)) ?? 0) < q - 0.001) continue;
  mexe(i, u.m.fazenda_id, u.m.deposito_id, q); mexe(i, FREI, DEP_SR, -q);
  u.para.fazenda_id = FREI; u.para.deposito_id = DEP_SR;
  repontados.push(`${nomeBag[i]} | ${q} bags | ${u.trf} | de ${nomeFaz[u.m.fazenda_id]} / ${nomeDep[u.m.deposito_id] ?? "sem"}`);
}
for (const [k, v] of saldo) { const [i, f, d] = k.split("|"); soma(i, f, d === "null" ? null : d, v); }

console.log(APLICAR ? "=== APLICANDO ===" : "=== PRÉVIA, nada foi gravado ===");
console.log(`Movimentos convertidos: ${updates.length} | estornos de carga duplicada: ${inversos.length} | saldos sem nota zerados: ${ajustes.length}`);
console.log(`Itens: NF ${updItensNf.length} | transferência ${updItensT.length} | pedido ${updPed.length}`);
console.log("\nERROS (precisam estar vazios para aplicar):"); erros.forEach(e => console.log("  " + e)); if (!erros.length) console.log("  nenhum");
console.log("\nFRAÇÕES DE BAG:"); [...new Set(fracoes)].forEach(f => console.log("  " + f));
console.log("\nSAÍDAS passadas para Frei Galvão / Depósito Santa Rita:"); repontados.forEach(r => console.log("  " + r));
console.log("\nPEDIDOS que seguem em kg:"); pedPend.forEach(p => console.log(`  ${p.nome_item} | ${p.quantidade} ${p.unidade} | entregue ${p.qtd_entregue}`));
console.log("\nPEDIDOS convertidos:"); updPed.forEach(u => console.log(`  ${u.de.nome_item} | ${u.de.quantidade} kg -> ${u.para.quantidade} bags`));
console.log("\nSALDO FINAL EM BAGS:");
for (const [v, g] of Object.entries(quadro).sort()) {
  const linhas = Object.entries(g).filter(([, q]) => Math.abs(q) > 0.001);
  if (!linhas.length) continue;
  console.log(`  ${v}: total ${r2(linhas.reduce((s, [, q]) => s + q, 0))}`);
  for (const [k, q] of linhas) console.log(`      ${k}: ${q}`);
}

if (!APLICAR) process.exit(0);
if (erros.length) { console.error("Há erros: nada foi gravado."); process.exit(1); }
const carimbo = new Date().toISOString().replace(/\D/g, "").slice(0, 14);
writeFileSync(`backup/sementes_kg_bag_ogliari_${carimbo}.json`, JSON.stringify({ movs, itensNf, itensT, pedItens, sementes, transf: transf.filter(t => DUPLICADAS[t.numero]) }, null, 1));
const ok = (r, o) => { if (r.error) throw new Error(`${o}: ${r.error.message}`); };
for (const u of updates) ok(await sb.from("movimentacoes_estoque").update(u.para).eq("id", u.id), "mov");
for (const u of updItensNf) ok(await sb.from("nf_entrada_itens").update(u.para).eq("id", u.id), "item nf");
for (const u of updItensT) ok(await sb.from("transferencias_estoque_itens").update(u.para).eq("id", u.id), "item transf");
for (const u of updPed) ok(await sb.from("pedidos_compra_itens").update(u.para).eq("id", u.id), "pedido");
if (inversos.length) ok(await sb.from("movimentacoes_estoque").insert(inversos), "estornos");
if (ajustes.length) ok(await sb.from("movimentacoes_estoque").insert(ajustes), "ajustes");
for (const t of transf.filter(t => DUPLICADAS[t.numero])) ok(await sb.from("transferencias_estoque").update({ status: "cancelada", observacao: [t.observacao, DUPLICADAS[t.numero]].filter(Boolean).join(" | ") }).eq("id", t.id), "transf");
ok(await sb.from("insumos").update({ unidade: "bag" }).eq("id", porNome[UNIDADE_ERRADA].id), "unidade");
// Custo médio do bag: valor das entradas por NF / bags dessas entradas
for (const id of new Set(updates.map(u => u.para.insumo_id))) {
  const { data: es } = await sb.from("movimentacoes_estoque").select("quantidade,valor_unitario").eq("insumo_id", id).eq("tipo", "entrada").not("nf_entrada_id", "is", null);
  const q = (es ?? []).reduce((s, e) => s + Number(e.quantidade), 0);
  const v = (es ?? []).reduce((s, e) => s + Number(e.quantidade) * Number(e.valor_unitario ?? 0), 0);
  if (q > 0 && v > 0) ok(await sb.from("insumos").update({ custo_medio: v / q }).eq("id", id), "custo");
}
const conf = await tudo("insumos", "nome,estoque", q => q.in("id", kgs.map(i => i.id)));
console.log("\nConferência, kg com saldo:", conf.filter(i => Math.abs(Number(i.estoque)) > 0.001));
console.log("Cópia de segurança em backup/.");
