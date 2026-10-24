// Fase 2 do item por cliente — mesclar cadastros repetidos de insumo/produto num só item por cliente.
//
// Plano (padrão, só leitura): agrupa os cadastros repetidos de cada cliente (nome igual e nome parecido — mesmas regras
// de Estoque → Possíveis Duplicados), escolhe o item que fica (o com mais movimentações; empate: o mais antigo) e marca o
// que não pode ser mesclado (unidade ou tipo diferente). Gera backup/mesclagem_plano_<conta>_<data>.xlsx e .json.
// Aplicar: chama fn_mesclar_insumos (Seção 366) grupo a grupo — cada grupo é tudo ou nada no banco, e o resultado
// (ids das mesclagens) fica em backup/mesclagem_feita_<conta>_<data>.json para desfazer com --desfazer.
//
// Uso:
//   node scripts/estoque-mesclar-itens.mjs --conta=<uuid>                                   (plano)
//   node scripts/estoque-mesclar-itens.mjs --conta=<uuid> --plano=<json> --aplicar --exatos (só os de nome igual)
//   node scripts/estoque-mesclar-itens.mjs --conta=<uuid> --plano=<json> --aplicar --grupos=1,4,7
//   node scripts/estoque-mesclar-itens.mjs --desfazer=<mesclagem_id>
import fs from "fs";
import * as XLSX from "xlsx/xlsx.mjs";
import { createClient } from "@supabase/supabase-js";
import { gruposDuplicados } from "../lib/estoque/duplicados.ts";

XLSX.set_fs(fs);
const args = Object.fromEntries(process.argv.slice(2).map(a => { const [k, v] = a.replace(/^--/, "").split("="); return [k, v ?? true]; }));
const env = Object.fromEntries(fs.readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n").filter(l => l.includes("="))
  .map(l => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, "")]; }));
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const hoje = new Date().toISOString().slice(0, 10);
const dirBackup = new URL("../backup/", import.meta.url);
fs.mkdirSync(dirBackup, { recursive: true });

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
  const { data, error } = await sb.rpc("fn_desfazer_mesclagem", { p_mesclagem: args.desfazer });
  if (error) throw new Error(error.message);
  console.log("Mesclagem desfeita:", data);
  process.exit(0);
}
if (!args.conta) { console.error("Informe --conta=<uuid>."); process.exit(1); }

const { data: conta } = await sb.from("contas").select("id, nome").eq("id", args.conta).single();
const fazendas = await todas("fazendas", "id, nome", q => q.eq("conta_id", conta.id));
const nomeFaz = id => fazendas.find(f => f.id === id)?.nome ?? "?";

if (args.aplicar) {
  if (!args.plano) { console.error("Aplicar exige --plano=<arquivo .json do plano>."); process.exit(1); }
  const plano = JSON.parse(fs.readFileSync(args.plano, "utf8"));
  if (plano.conta_id !== conta.id) { console.error("O plano é de outro cliente."); process.exit(1); }
  const escolhidos = args.grupos ? new Set(String(args.grupos).split(",").map(Number)) : null;
  const alvo = plano.grupos.filter(g => g.mesclavel && (escolhidos ? escolhidos.has(g.n) : args.exatos ? g.criterio === "exato" : args.todos));
  if (!alvo.length) { console.error("Nenhum grupo selecionado (use --exatos, --todos ou --grupos=)."); process.exit(1); }
  const feitos = [];
  for (const g of alvo) {
    const { data, error } = await sb.rpc("fn_mesclar_insumos", { p_destino: g.destino.id, p_origens: g.origens.map(o => o.id), p_feito_por: "script estoque-mesclar-itens" });
    const linha = { n: g.n, item: g.destino.nome, origens: g.origens.map(o => `${o.nome} (${o.fazenda})`), ...(error ? { erro: error.message } : data) };
    feitos.push(linha);
    console.log(error ? `✗ #${g.n} ${g.destino.nome}: ${error.message}` : `✓ #${g.n} ${g.destino.nome} ← ${g.origens.length} cadastro(s), ${data.linhas_alteradas} linha(s)`);
  }
  const arq = new URL(`mesclagem_feita_${conta.id.slice(0, 8)}_${hoje}_${Date.now()}.json`, dirBackup);
  fs.writeFileSync(arq, JSON.stringify({ conta: conta.nome, conta_id: conta.id, feitos }, null, 1));
  console.log(`\n${feitos.filter(f => !f.erro).length} grupo(s) mesclado(s), ${feitos.filter(f => f.erro).length} recusado(s). Registro: ${arq.pathname}`);
  process.exit(0);
}

// ── Plano ──
const insumos = (await todas("insumos", "*", q => q.in("fazenda_id", fazendas.map(f => f.id)))).filter(i => !i.mesclado_em);
const ids = insumos.map(i => i.id);
const nMov = new Map();
for (let k = 0; k < ids.length; k += 200) {
  for (const m of await todas("movimentacoes_estoque", "id, insumo_id", q => q.in("insumo_id", ids.slice(k, k + 200)))) nMov.set(m.insumo_id, (nMov.get(m.insumo_id) ?? 0) + 1);
}
const { data: rev } = await sb.from("insumos_duplicados_revisados").select("chave_normalizada, status, revisado_por").eq("conta_id", conta.id);
const revisado = new Map((rev ?? []).map(r => [r.chave_normalizada, r]));
// Considera também os grupos já descartados (o cadastro é do cliente: mesmo nome em fazendas diferentes é duplicado)
const grupos = gruposDuplicados(insumos.map(i => ({ ...i })), new Set());
const porId = new Map(insumos.map(i => [i.id, i]));
const unid = u => (u ?? "").trim().toLowerCase();
const linhasPlano = grupos.map((g, idx) => {
  const itens = g.itens.map(x => porId.get(x.id)).sort((a, b) => (nMov.get(b.id) ?? 0) - (nMov.get(a.id) ?? 0) || String(a.created_at).localeCompare(String(b.created_at)));
  const destino = itens[0];
  const unidades = new Set(itens.map(i => unid(i.unidade)));
  const tipos = new Set(itens.map(i => i.tipo ?? "insumo"));
  const motivo = unidades.size > 1 ? `unidades diferentes (${[...new Set(itens.map(i => i.unidade))].join(" × ")})` : tipos.size > 1 ? "insumo × produto" : "";
  const fmt = i => ({ id: i.id, nome: i.nome, fazenda: nomeFaz(i.fazenda_id), unidade: i.unidade, estoque: i.estoque, movimentacoes: nMov.get(i.id) ?? 0 });
  return {
    n: idx + 1, criterio: g.criterio, chave: g.chave, mesclavel: !motivo, motivo,
    ja_descartado: revisado.get(g.chave)?.status === "descartado" ? `sim (${revisado.get(g.chave)?.revisado_por ?? ""})` : "",
    destino: fmt(destino), origens: itens.slice(1).map(fmt),
  };
});
const base = `mesclagem_plano_${conta.id.slice(0, 8)}_${hoje}`;
fs.writeFileSync(new URL(`${base}.json`, dirBackup), JSON.stringify({ conta: conta.nome, conta_id: conta.id, gerado_em: new Date().toISOString(), grupos: linhasPlano }, null, 1));
const linhasXlsx = linhasPlano.flatMap(g => [g.destino, ...g.origens].map((i, k) => ({
  grupo: g.n, criterio: g.criterio === "exato" ? "Nome igual" : "Nome parecido", papel: k === 0 ? "FICA" : "mescla no que fica",
  item: i.nome, fazenda: i.fazenda, unidade: i.unidade, saldo: i.estoque, movimentacoes: i.movimentacoes,
  pode_mesclar: g.mesclavel ? "sim" : `NÃO — ${g.motivo}`, ja_descartado_antes: g.ja_descartado,
})));
const wb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(linhasXlsx), "Plano");
XLSX.writeFile(wb, new URL(`${base}.xlsx`, dirBackup).pathname);
const ex = linhasPlano.filter(g => g.criterio === "exato"), si = linhasPlano.filter(g => g.criterio === "semelhanca");
console.log(`${conta.nome}: ${linhasPlano.length} grupo(s) — nome igual ${ex.length} (${ex.filter(g => g.mesclavel).length} mescláveis), nome parecido ${si.length} (${si.filter(g => g.mesclavel).length} mescláveis); ${linhasPlano.reduce((s, g) => s + g.origens.length, 0)} cadastro(s) sairiam.`);
console.log(`Plano: backup/${base}.xlsx e .json — nada foi gravado.`);
