// Apaga os Contas a Pagar EM ABERTO gerados por NFs que não são compra (decisão do dono 29/10/2026: "apagar CPs, não
// mexer no que foi pago"):
//  - remessa de compra para entrega futura (CFOP 5116) da Agroquima, cujo CP já veio do simples faturamento NF 9759;
//  - remessa em comodato (CFOP 6908) da Momesso NF 27871;
//  - NF em garantia (CFOP 5949) da RZK NF 158717.
// Fica intacto: título pago (baixado ou parcial), conciliado, em borderô ou no cartão. Três Tentos fica de fora (o CP da
// remessa é o único do débito enquanto o faturamento não é processado).
// Uso: node --env-file=.env.local scripts/cp-remessas-apagar.mjs [--aplicar]
import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";

const aplicar = process.argv.includes("--aplicar");
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const ALVOS = [
  { numero: "9568", emitente: "AGROQUIMA", cfop: "5116" },
  { numero: "9574", emitente: "AGROQUIMA", cfop: "5116" },
  { numero: "9673", emitente: "AGROQUIMA", cfop: "5116" },
  { numero: "27871", emitente: "MOMESSO", cfop: "6908" },
  { numero: "158717", emitente: "RZK", cfop: "5949" },
];

const plano = [];
for (const a of ALVOS) {
  const { data: nfs, error } = await sb.from("nf_entradas").select("id, numero, emitente_nome, cfop, status, lancamento_id")
    .eq("numero", a.numero).ilike("emitente_nome", `%${a.emitente}%`).eq("status", "processada");
  if (error) throw error;
  const nf = (nfs ?? []).filter(n => String(n.cfop ?? "").replace(/\D/g, "") === a.cfop);
  if (nf.length !== 1) { console.log(`NF ${a.numero} ${a.emitente}: ${nf.length} NFs processadas encontradas — pulada`); continue; }
  const { data: ts } = await sb.from("lancamentos").select("id, descricao, valor, valor_pago, status, conciliado, lote_id, fatura_cartao_id, data_vencimento")
    .eq("nf_entrada_id", nf[0].id).eq("tipo", "pagar").neq("status", "cancelado");
  for (const t of ts ?? []) {
    const aberto = ["em_aberto", "vencido", "vencendo"].includes(t.status) && !(Number(t.valor_pago ?? 0) > 0) && !t.conciliado && !t.lote_id && !t.fatura_cartao_id;
    plano.push({ nf: nf[0], t, apagar: aberto });
  }
}
for (const p of plano) console.log(`${p.apagar ? "APAGA " : "mantém"} | NF ${p.nf.numero} ${p.nf.emitente_nome} | ${p.t.status} R$ ${p.t.valor} venc ${p.t.data_vencimento}${Number(p.t.valor_pago ?? 0) > 0 ? ` (pago ${p.t.valor_pago})` : ""}`);
const apagar = plano.filter(p => p.apagar);
console.log(`\nA apagar: ${apagar.length} título(s), R$ ${apagar.reduce((s, p) => s + Number(p.t.valor), 0).toFixed(2)} · mantidos: ${plano.length - apagar.length}`);
if (!aplicar) { console.log("Simulação. Rode com --aplicar para apagar (backup em backup/)."); process.exit(0); }

fs.mkdirSync("backup", { recursive: true });
const arq = `backup/cp_remessas_apagar_${new Date().toISOString().slice(0, 10)}.json`;
fs.writeFileSync(arq, JSON.stringify(apagar.map(p => ({ nf: p.nf, titulo: p.t })), null, 1));
// Ponteiro da NF para um título apagado (FK) é solto antes
for (const p of apagar) if (p.nf.lancamento_id === p.t.id) await sb.from("nf_entradas").update({ lancamento_id: null }).eq("id", p.nf.id);
const ids = apagar.map(p => p.t.id);
const { error: e } = await sb.from("lancamentos").delete().in("id", ids).in("status", ["em_aberto", "vencido", "vencendo"]);
if (e) throw e;
console.log(`Apagados ${ids.length} título(s). Backup: ${arq}`);
