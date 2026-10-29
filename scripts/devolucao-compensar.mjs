// Encontro de contas das devoluções de compra já registradas (antes de 29/10/2026 a devolução gerava título a receber
// e deixava os CPs da NF original em aberto). Para cada devolução processada SEM compensação feita: abate os CPs em
// aberto da NF original e baixa o título a receber no valor compensado (mesma regra de lib/fiscal/devolucao-compensacao.ts).
// Só devoluções cujo título a receber ainda está em aberto e sem pagamento. Requer a Seção 393.
// Uso: node --env-file=.env.local scripts/devolucao-compensar.mjs [--aplicar] [--nf <numero da devolução>]
import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
import { compensarDevolucao } from "../lib/fiscal/devolucao-compensacao.ts";

const aplicar = process.argv.includes("--aplicar");
const iNf = process.argv.indexOf("--nf"); const soNf = iNf > 0 ? process.argv[iNf + 1] : null;
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
let q = sb.from("nf_entradas").select("id, numero, nf_origem_id, valor_total, data_emissao, compensacoes, fazenda_id").eq("tipo_entrada", "devolucao_compra").eq("status", "processada").not("nf_origem_id", "is", null);
if (soNf) q = q.eq("numero", soNf);
const { data: devs, error } = await q;
if (error) { console.error(error.message.includes("compensacoes") ? "Rode a Seção 393 antes." : error.message); process.exit(1); }
const plano = [];
for (const d of devs) {
  if (d.compensacoes) continue;
  const { data: cr } = await sb.from("lancamentos").select("id, status, valor_pago, valor").eq("nf_entrada_id", d.id).eq("tipo", "receber").maybeSingle();
  if (!cr || cr.status !== "em_aberto" || Number(cr.valor_pago ?? 0) > 0) continue;
  const { data: cps } = await sb.from("lancamentos").select("id, valor, valor_pago, status").eq("nf_entrada_id", d.nf_origem_id).eq("tipo", "pagar").in("status", ["em_aberto", "vencido", "vencendo", "parcial"]);
  const aberto = (cps ?? []).reduce((t, c) => t + Number(c.valor) - Number(c.valor_pago ?? 0), 0);
  if (aberto <= 0.005) continue;
  plano.push({ d, cr, cps, aberto });
  console.log(`Devolução NF ${d.numero} (R$ ${Number(d.valor_total).toFixed(2)}): CPs da compra em aberto R$ ${aberto.toFixed(2)} em ${cps.length} título(s) → compensa R$ ${Math.min(aberto, Number(d.valor_total)).toFixed(2)}`);
}
console.log(`${plano.length} devolução(ões) a compensar.`);
if (!aplicar) { console.log("Simulação. Rode com --aplicar (backup em backup/)."); process.exit(0); }
fs.mkdirSync("backup", { recursive: true });
const arq = `backup/devolucao_compensar_${new Date().toISOString().slice(0, 10)}.json`;
fs.writeFileSync(arq, JSON.stringify(plano.map(p => ({ devolucao: p.d, cr: p.cr, cps: p.cps })), null, 1));
for (const p of plano) {
  const r = await compensarDevolucao(sb, { nfDevId: p.d.id, nfOrigemId: p.d.nf_origem_id, numeroDev: p.d.numero, valor: Number(p.d.valor_total), data: p.d.data_emissao, crId: p.cr.id });
  console.log(`NF ${p.d.numero}: compensado R$ ${r.compensado.toFixed(2)} em ${r.titulos} título(s)`);
}
console.log(`Feito. Backup: ${arq}`);
