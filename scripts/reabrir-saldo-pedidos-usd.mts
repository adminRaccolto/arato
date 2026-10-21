// Pedidos em dólar cancelados por engano pela regra do saldo (comparava US$ do pedido com R$ das NFs).
// Uso: npx tsx scripts/reabrir-saldo-pedidos-usd.mts          → prévia (não grava)
//      npx tsx scripts/reabrir-saldo-pedidos-usd.mts exec     → grava (backup em backup/reabrir_saldo_pedidos_usd_<data>.json)
import fs from "fs";
for (const l of fs.readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")) { const i = l.indexOf("="); if (i > 0 && !l.startsWith("#")) process.env[l.slice(0, i).trim()] ??= l.slice(i + 1).trim().replace(/^["']|["']$/g, ""); }
const { createClient } = await import("@supabase/supabase-js");
const { totalNfsNaMoeda, saldoDoPedido, MARCA_SALDO_ZERADO, TOLERANCIA_CAMBIO } = await import("../lib/financeiro/saldo-pedido.ts");
const { ptaxDoDia } = await import("../lib/financeiro/ptax.ts");
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const exec = process.argv[2] === "exec";

const { data: lancs } = await sb.from("lancamentos").select("*").eq("origem_lancamento", "pedido_compra").eq("moeda", "USD").eq("status", "cancelado").ilike("observacao", `%${MARCA_SALDO_ZERADO}%`);
const plano: { lanc: any; ped: any; saldo: number; nfsUsd: number; nfsBrl: number }[] = [];
for (const l of lancs ?? []) {
  const { data: ped } = await sb.from("pedidos_compra").select("id, numero, nr_pedido_fornecedor, total_financeiro, status").eq("lancamento_id", l.id).maybeSingle();
  if (!ped || ped.status === "cancelado") continue;
  const { data: nfs } = await sb.from("nf_entradas").select("valor_total, data_emissao, data_entrada").eq("pedido_compra_id", ped.id).eq("status", "processada");
  const usd = await totalNfsNaMoeda(nfs ?? [], "USD", ptaxDoDia);
  if (usd === null) { console.log(`pedido ${ped.numero}: sem PTAX de alguma NF — fica como está`); continue; }
  let saldo = saldoDoPedido(Number(ped.total_financeiro), usd);
  if (saldo <= Number(ped.total_financeiro) * TOLERANCIA_CAMBIO + 0.005) saldo = 0;   // diferença de câmbio
  const brl = (nfs ?? []).reduce((t, n) => t + Number(n.valor_total || 0), 0);
  console.log(`pedido ${ped.numero} (forn. ${ped.nr_pedido_fornecedor ?? "-"}): total US$ ${ped.total_financeiro} · NFs R$ ${brl.toFixed(2)} = US$ ${usd} · saldo US$ ${saldo} ${saldo > 0.01 ? "→ REABRIR" : "(coberto, fica cancelado)"}`);
  if (saldo > 0.01) plano.push({ lanc: l, ped, saldo, nfsUsd: usd, nfsBrl: brl });
}
console.log(`\n${plano.length} título(s) a reabrir com o saldo em dólar.`);
if (exec && plano.length) {
  fs.mkdirSync(new URL("../backup/", import.meta.url), { recursive: true });
  const arq = new URL(`../backup/reabrir_saldo_pedidos_usd_${new Date().toISOString().slice(0, 10)}.json`, import.meta.url);
  fs.writeFileSync(arq, JSON.stringify(plano.map(p => p.lanc), null, 2));
  for (const p of plano) {
    const { error } = await sb.from("lancamentos").update({ status: "em_aberto", valor: p.saldo, observacao: null }).eq("id", p.lanc.id).eq("status", "cancelado");
    console.log(error ? `erro ${p.ped.numero}: ${error.message}` : `reaberto pedido ${p.ped.numero}: US$ ${p.saldo}`);
  }
  console.log(`backup: ${arq.pathname}`);
}
