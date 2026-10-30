// Restaura um contrato financeiro excluído a partir do histórico de auditoria (audit_log): o contrato (mesmo id) e os
// títulos do CP apagados junto (mesmos ids). O cronograma (parcelas_pagamento) não é auditado: é reconstruído a partir
// dos títulos — cada "Parcela N" com a soma de Amortização + Juros, vencimento e saldo devedor. Liberações, garantias,
// centros de custo e aditivos não são auditados e não voltam.
// Uso: node --env-file=.env.local scripts/contrato-financeiro-restaurar.mjs --id <id do contrato> [--aplicar]
import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";

const i = process.argv.indexOf("--id"); const id = i > 0 ? process.argv[i + 1] : null;
const aplicar = process.argv.includes("--aplicar");
if (!id) { console.error("Informe --id <id do contrato>."); process.exit(1); }
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const r2 = n => Math.round(n * 100) / 100;

// Se o contrato já voltou (restauração interrompida antes), só recria o que falta
const { data: ja } = await sb.from("contratos_financeiros").select("id").eq("id", id).maybeSingle();
const { data: delC } = await sb.from("audit_log").select("dados_antes, created_at").eq("tabela", "contratos_financeiros").eq("acao", "DELETE").eq("registro_id", id).order("created_at", { ascending: false }).limit(1).maybeSingle();
if (!delC?.dados_antes) { console.error("Exclusão do contrato não encontrada no histórico."); process.exit(1); }
const contrato = delC.dados_antes;
// Títulos apagados junto (mesmo minuto da exclusão) ligados ao contrato
const t0 = new Date(new Date(delC.created_at).getTime() - 5 * 60e3).toISOString();
const t1 = new Date(new Date(delC.created_at).getTime() + 5 * 60e3).toISOString();
const { data: delL } = await sb.from("audit_log").select("registro_id, dados_antes").eq("tabela", "lancamentos").eq("acao", "DELETE").gte("created_at", t0).lte("created_at", t1);
const titulos = (delL ?? []).map(x => x.dados_antes).filter(l => l?.contrato_financeiro_id === id);
const ids = titulos.map(t => t.id);
const { data: existentes } = ids.length ? await sb.from("lancamentos").select("id").in("id", ids) : { data: [] };
const novos = titulos.filter(t => !(existentes ?? []).some(e => e.id === t.id));

// Cronograma a partir dos títulos "— Parcela N — Amortização/Juros/Encargos"
const porParcela = new Map();
for (const t of titulos) {
  const m = String(t.descricao ?? "").match(/Parcela (\d+)(?: — (Amortização|Juros|Encargos))?/);
  if (!m) continue;
  const n = Number(m[1]);
  const p = porParcela.get(n) ?? { num_parcela: n, data_vencimento: t.data_vencimento, amortizacao: 0, juros: 0, despesas_acessorios: 0, lancamento_id: null };
  const v = Number(t.valor) || 0;
  if (m[2] === "Juros") p.juros = r2(p.juros + v);
  else if (m[2] === "Encargos") p.despesas_acessorios = r2(p.despesas_acessorios + v);
  else { p.amortizacao = r2(p.amortizacao + v); p.lancamento_id = t.id; }
  porParcela.set(n, p);
}
const parcelas = [...porParcela.values()].sort((a, b) => a.num_parcela - b.num_parcela);
let saldo = r2(Number(contrato.valor_financiado ?? 0) || parcelas.reduce((s, p) => s + p.amortizacao, 0));
for (const p of parcelas) { saldo = Math.max(0, r2(saldo - p.amortizacao)); p.saldo_devedor = saldo; p.valor_parcela = r2(p.amortizacao + p.juros + p.despesas_acessorios); }

console.log(`Contrato "${contrato.descricao}" nº ${contrato.numero_contrato ?? "—"} · ${contrato.credor ?? ""} · R$ ${contrato.valor_total} (excluído em ${delC.created_at})`);
console.log(`Títulos a recriar: ${novos.length} de ${titulos.length} · Parcelas do cronograma: ${parcelas.length}`);
for (const p of parcelas) console.log(`  ${p.num_parcela} · ${p.data_vencimento} · amort ${p.amortizacao} · juros ${p.juros} · parcela ${p.valor_parcela} · saldo ${p.saldo_devedor}`);
if (!aplicar) { console.log("Simulação. Rode com --aplicar (cópia do que será gravado em backup/)."); process.exit(0); }

fs.mkdirSync("backup", { recursive: true });
const arq = `backup/contrato_restaurado_${id}_${new Date().toISOString().slice(0, 10)}.json`;
fs.writeFileSync(arq, JSON.stringify({ contrato, titulos, parcelas }, null, 1));
if (!ja) { const { error: eC } = await sb.from("contratos_financeiros").insert(contrato); if (eC) throw new Error(`Contrato: ${eC.message}`); }
// "numero" do título é gerado pelo banco (sequência) — não pode ser gravado
if (novos.length) { const { error } = await sb.from("lancamentos").insert(novos.map(({ numero: _n, ...t }) => t)); if (error) throw new Error(`Títulos: ${error.message}`); }
const { count: jaParc } = await sb.from("parcelas_pagamento").select("id", { count: "exact", head: true }).eq("contrato_id", id);
if (parcelas.length && !jaParc) {
  const { error } = await sb.from("parcelas_pagamento").insert(parcelas.map(p => ({ ...p, contrato_id: id, fazenda_id: contrato.fazenda_id, status: "em_aberto" })));
  if (error) throw new Error(`Parcelas: ${error.message}`);
}
console.log(`Restaurado. Cópia: ${arq}`);
