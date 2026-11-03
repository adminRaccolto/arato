// Liberações em aberto de contratos em dólar gravadas como US$: o banco deposita em reais. Converte o título para R$ pela
// cotação do contrato; contrato sem cotação usa a informada (decisão do dono, 03/11/2026: 5,05) e passa a tê-la.
// Títulos baixados ou sem parcela de liberação não são alterados, só listados. Os do Flávio ficam de fora: ele revisa antes.
// Uso: node --env-file=.env.local scripts/contratos-usd-liberacoes.mjs [--aplicar]
import { createClient } from "@supabase/supabase-js";
import { writeFileSync } from "fs";

const COTACAO_PADRAO = 5.05;
const aplicar = process.argv.includes("--aplicar");
const r2 = n => Math.round(n * 100) / 100;
const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const { data: contratos, error } = await s.from("contratos_financeiros").select("id, numero_contrato, fazenda_id, cotacao_usd, valor_cotacao").eq("moeda", "USD");
if (error) throw error;
const porId = new Map(contratos.map(c => [c.id, c]));
const { data: flavio } = await s.from("contas").select("id").ilike("nome", "Flávio%");
const { data: fazendasFlavio } = await s.from("fazendas").select("id").in("conta_id", (flavio ?? []).map(c => c.id));
const doFlavio = new Set((fazendasFlavio ?? []).map(f => f.id));
const { data: titulos } = await s.from("lancamentos").select("id, contrato_financeiro_id, valor, moeda, status, conciliado").in("contrato_financeiro_id", contratos.map(c => c.id)).eq("tipo", "receber").eq("moeda", "USD");
const { data: parcelas } = await s.from("parcelas_liberacao").select("id, lancamento_id, valor_liberado, valor_liberado_brl").in("contrato_id", contratos.map(c => c.id));
const parcelaDe = new Map((parcelas ?? []).map(p => [p.lancamento_id, p]));

const planos = [], fora = [];
for (const t of titulos ?? []) {
  const c = porId.get(t.contrato_financeiro_id);
  const p = parcelaDe.get(t.id);
  if (doFlavio.has(c.fazenda_id)) { fora.push(`${c.numero_contrato}: do Flávio, US$ ${t.valor}`); continue; }
  if (t.status === "baixado" || t.conciliado) { fora.push(`${c.numero_contrato}: baixado, US$ ${t.valor}`); continue; }
  if (!p) { fora.push(`${c.numero_contrato}: sem parcela de liberação, ${t.valor}`); continue; }
  const propria = Number(c.valor_cotacao) || Number(c.cotacao_usd) || null;
  const cotacao = propria ?? COTACAO_PADRAO;
  planos.push({ titulo: t.id, parcela: p.id, contrato: c.id, numero: c.numero_contrato, usd: t.valor, cotacao, propria: !!propria, valor: r2(t.valor * cotacao) });
}
for (const p of planos) console.log(`${p.numero}: US$ ${p.usd} × ${p.cotacao}${p.propria ? " (do contrato)" : ""} = R$ ${p.valor}`);
console.log(`\nNão alterados (${fora.length}):\n  ${fora.join("\n  ")}`);
if (!aplicar) { console.log("\nNada foi alterado. Para aplicar, rode com --aplicar."); process.exit(0); }

const arquivo = `backup/contratos_usd_liberacoes_${Date.now()}.json`;
writeFileSync(arquivo, JSON.stringify(planos, null, 1));
for (const p of planos) {
  const { error: eT } = await s.from("lancamentos").update({ moeda: "BRL", valor: p.valor }).eq("id", p.titulo);
  if (eT) throw eT;
  const { error: eP } = await s.from("parcelas_liberacao").update({ valor_liberado_brl: p.valor }).eq("id", p.parcela);
  if (eP) throw eP;
  if (!p.propria) {
    const { error: eC } = await s.from("contratos_financeiros").update({ valor_cotacao: p.cotacao }).eq("id", p.contrato);
    if (eC) throw eC;
  }
}
console.log(`\n${planos.length} título(s) convertidos. Cópia para desfazer: ${arquivo}`);
