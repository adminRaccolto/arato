// Pessoas (fornecedores/clientes) repetidas pelo mesmo CPF/CNPJ dentro do cliente → um cadastro só (Seção 371).
//
// Plano (padrão, só leitura): agrupa por cliente + dígitos do CPF/CNPJ, escolhe o cadastro que fica (o com mais
// vínculos — títulos, NFs, contratos, pedidos...; empate: o mais antigo) e gera backup/pessoas_plano_<conta>_<data>.xlsx
// e .json. Aplicar: chama fn_mesclar_pessoas grupo a grupo — cada grupo é tudo ou nada no banco; o resultado (ids das
// mesclagens) fica em backup/pessoas_mesclagem_feita_<conta>_<data>.json para desfazer com --desfazer.
//
// Uso:
//   node scripts/pessoas-mesclar.mjs                                    (plano de todos os clientes)
//   node scripts/pessoas-mesclar.mjs --conta=<uuid>                     (plano de um cliente)
//   node scripts/pessoas-mesclar.mjs --plano=<json> --aplicar [--grupos=1,4,7]
//   node scripts/pessoas-mesclar.mjs --desfazer=<mesclagem_id>
import fs from "fs";
import * as XLSX from "xlsx/xlsx.mjs";
import { createClient } from "@supabase/supabase-js";

XLSX.set_fs(fs);
const args = Object.fromEntries(process.argv.slice(2).map(a => { const [k, v] = a.replace(/^--/, "").split("="); return [k, v ?? true]; }));
const env = Object.fromEntries(fs.readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n").filter(l => l.includes("="))
  .map(l => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, "")]; }));
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const hoje = new Date().toISOString().slice(0, 10);
const dirBackup = new URL("../backup/", import.meta.url);
fs.mkdirSync(dirBackup, { recursive: true });
const doc = v => String(v ?? "").replace(/\D/g, "");

async function todas(tabela, colunas, filtro = q => q) {
  const out = [];
  for (let de = 0; ; de += 1000) {
    const { data, error } = await filtro(sb.from(tabela).select(colunas)).order("id").range(de, de + 999);
    if (error) throw new Error(`${tabela}: ${error.message}`);
    out.push(...data);
    if (data.length < 1000) return out;
  }
}

if (args.desfazer) {
  const { data, error } = await sb.rpc("fn_desfazer_mesclagem_pessoas", { p_mesclagem: args.desfazer });
  if (error) throw new Error(error.message);
  console.log("Mesclagem desfeita:", data);
  process.exit(0);
}

if (args.aplicar) {
  if (!args.plano) { console.error("Aplicar exige --plano=<arquivo .json do plano>."); process.exit(1); }
  const plano = JSON.parse(fs.readFileSync(args.plano, "utf8"));
  const escolhidos = args.grupos ? new Set(String(args.grupos).split(",").map(Number)) : null;
  const alvo = plano.grupos.filter(g => escolhidos ? escolhidos.has(g.n) : !g.nao_mesclar);
  const feitos = [];
  for (const g of alvo) {
    const { data, error } = await sb.rpc("fn_mesclar_pessoas", { p_destino: g.destino.id, p_origens: g.origens.map(o => o.id), p_feito_por: "script pessoas-mesclar", p_nome: g.nome_final ?? null });
    feitos.push({ n: g.n, cliente: g.cliente, documento: g.documento, fica: g.nome_final ?? g.destino.nome, saem: g.origens.map(o => o.nome), ...(error ? { erro: error.message } : data) });
    console.log(error ? `✗ #${g.n} ${g.destino.nome}: ${error.message}` : `✓ #${g.n} ${g.destino.nome} ← ${g.origens.length} cadastro(s), ${data.linhas_alteradas} vínculo(s)`);
  }
  const arq = new URL(`pessoas_mesclagem_feita_${hoje}_${Date.now()}.json`, dirBackup);
  fs.writeFileSync(arq, JSON.stringify({ plano: args.plano, feitos }, null, 1));
  console.log(`\n${feitos.filter(f => !f.erro).length} grupo(s) mesclado(s), ${feitos.filter(f => f.erro).length} recusado(s). Registro: ${arq.pathname}`);
  process.exit(0);
}

// ── Plano ──
const contas = await todas("contas", "id, nome", q => args.conta ? q.eq("id", args.conta) : q);
const nomeConta = new Map(contas.map(c => [c.id, c.nome]));
const pessoas = (await todas("pessoas", "*", q => args.conta ? q.eq("conta_id", args.conta) : q.not("conta_id", "is", null)))
  .filter(p => nomeConta.has(p.conta_id) && doc(p.cpf_cnpj).length >= 11 && !p.duplicado_autorizado);
const porChave = new Map();
for (const p of pessoas) { const k = `${p.conta_id}|${doc(p.cpf_cnpj)}`; porChave.set(k, [...(porChave.get(k) ?? []), p]); }
const grupos = [...porChave.values()].filter(v => v.length > 1);
const ids = grupos.flat().map(p => p.id);

// Vínculos de cada cadastro (para escolher o que fica)
const VINCULOS = [
  ["lancamentos", "pessoa_id"], ["empresa_lancamentos", "pessoa_id"], ["nf_entradas", "pessoa_id"], ["nf_servicos", "prestador_id"],
  ["nf_importadas_sieg", "pessoa_id"], ["contratos", "pessoa_id"], ["contratos_financeiros", "pessoa_id"], ["pedidos_compra", "fornecedor_id"],
  ["romaneios_entrada", "pessoa_id"], ["arrendamentos", "proprietario_id"], ["previsoes_gasto", "pessoa_id"], ["conciliacao_regras", "pessoa_id"],
  ["faturas_fornecedor", "pessoa_id"], ["adiantamentos_fornecedor", "pessoa_id"], ["ctes", "remetente_id"], ["ctes", "destinatario_id"],
  ["depositos", "pessoa_id"], ["maquinas", "proprietario_id"], ["veiculos", "proprietario_id"],
];
const nVinc = new Map();
for (const [t, c] of VINCULOS) {
  for (let k = 0; k < ids.length; k += 150) {
    for (const r of await todas(t, `id, ${c}`, q => q.in(c, ids.slice(k, k + 150)))) nVinc.set(r[c], (nVinc.get(r[c]) ?? 0) + 1);
  }
}
// Nome que fica: a razão social da NF de entrada mais recente do CPF/CNPJ (vem da SEFAZ); sem NF, o nome mais completo.
const ultimaNF = new Map();
for (let k = 0; k < ids.length; k += 150) {
  for (const n of await todas("nf_entradas", "id, pessoa_id, emitente_nome, data_emissao", q => q.in("pessoa_id", ids.slice(k, k + 150)))) {
    const d = doc(pessoas.find(p => p.id === n.pessoa_id)?.cpf_cnpj);
    if (n.emitente_nome && (!ultimaNF.get(d) || String(n.data_emissao) > ultimaNF.get(d).data)) ultimaNF.set(d, { nome: n.emitente_nome, data: String(n.data_emissao) });
  }
}
const decodificar = s => String(s ?? "").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
// Mesmo CPF/CNPJ com empresas claramente diferentes = erro de cadastro, não repetição — fica de fora (corrigir o documento)
const NAO_MESCLAR = new Set(["73643959000208"]);
const preenchidos = p => ["inscricao_est", "email", "telefone", "logradouro", "municipio", "banco_conta", "pix_chave", "municipio_ibge"].filter(c => p[c]).length;
const fmt = p => ({ id: p.id, nome: p.nome, cpf_cnpj: p.cpf_cnpj, ie: p.inscricao_est, vinculos: nVinc.get(p.id) ?? 0, criado: String(p.created_at).slice(0, 10) });
const linhas = grupos.map(v => v.sort((a, b) => (nVinc.get(b.id) ?? 0) - (nVinc.get(a.id) ?? 0) || preenchidos(b) - preenchidos(a)
    || String(a.created_at).localeCompare(String(b.created_at))))
  .sort((a, b) => nomeConta.get(a[0].conta_id).localeCompare(nomeConta.get(b[0].conta_id)) || a[0].nome.localeCompare(b[0].nome))
  .map((v, i) => {
    const norm = s => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/[^A-Z0-9]/g, "");
    return { n: i + 1, cliente: nomeConta.get(v[0].conta_id), conta_id: v[0].conta_id, documento: doc(v[0].cpf_cnpj),
      nomes_diferentes: new Set(v.map(p => norm(p.nome))).size > 1, destino: fmt(v[0]), origens: v.slice(1).map(fmt),
      nome_final: (() => { const nf = decodificar(ultimaNF.get(doc(v[0].cpf_cnpj))?.nome); if (nf) return nf;
        const maior = v.map(p => decodificar(p.nome)).sort((a, b) => b.length - a.length)[0]; return maior !== v[0].nome ? maior : null; })(),
      ...(NAO_MESCLAR.has(doc(v[0].cpf_cnpj)) ? { nao_mesclar: "empresas diferentes com o mesmo CNPJ — corrigir o cadastro" } : {}) };
  });

const base = `pessoas_plano_${args.conta ? String(args.conta).slice(0, 8) : "todos"}_${hoje}`;
fs.writeFileSync(new URL(`${base}.json`, dirBackup), JSON.stringify({ gerado_em: new Date().toISOString(), grupos: linhas }, null, 1));
const wb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(linhas.flatMap(g => [g.destino, ...g.origens].map((p, k) => ({
  grupo: g.n, cliente: g.cliente, cpf_cnpj: p.cpf_cnpj, papel: k === 0 ? "FICA" : "mescla no que fica", nome: p.nome, ie: p.ie,
  vinculos: p.vinculos, criado_em: p.criado, nome_que_fica: k === 0 ? (g.nome_final ?? p.nome) : "", fora: g.nao_mesclar ?? "",
})))), "Plano");
XLSX.writeFile(wb, new URL(`${base}.xlsx`, dirBackup).pathname);
const porCliente = {};
for (const g of linhas) porCliente[g.cliente] = (porCliente[g.cliente] ?? 0) + 1;
console.log(`${linhas.length} grupo(s); ${linhas.reduce((s, g) => s + g.origens.length, 0)} cadastro(s) sairiam; nomes diferentes em ${linhas.filter(g => g.nomes_diferentes).length}.`, porCliente);
console.log(`Plano: backup/${base}.xlsx e .json — nada foi gravado.`);
