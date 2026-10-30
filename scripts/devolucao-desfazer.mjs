// Desfaz uma devolução de compra registrada contra a NF errada (caso 30/10/2026: devolução 772 ligada à 158602, mas
// ela devolveu a 157115). A NF de compra fica processada como estava antes da devolução: os CPs que a devolução
// compensou voltam a dever, o título a receber da devolução é apagado, a NF de devolução sai do sistema (itens,
// movimentos de estoque, registro no Monitor de NF-e) e a marca "Devolvida" da compra é refeita.
// Uso: node --env-file=.env.local scripts/devolucao-desfazer.mjs --nf <nº da devolução> --origem <nº da NF de compra> [--aplicar]
import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
import { atualizarSituacaoDevolucao, desfazerCompensacaoDevolucao } from "../lib/fiscal/devolucao-compensacao.ts";

const arg = k => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null; };
const aplicar = process.argv.includes("--aplicar");
const numDev = arg("--nf"), numOrig = arg("--origem");
if (!numDev || !numOrig) { console.error("Informe --nf <devolução> e --origem <NF de compra>."); process.exit(1); }
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const { data: devs } = await sb.from("nf_entradas").select("*").eq("numero", numDev).eq("tipo_entrada", "devolucao_compra");
const cand = [];
for (const d of devs ?? []) {
  const { data: o } = await sb.from("nf_entradas").select("id, numero, status").eq("id", d.nf_origem_id).maybeSingle();
  if (o?.numero === numOrig) cand.push({ dev: d, orig: o });
}
if (cand.length !== 1) { console.error(`Esperava 1 devolução ${numDev} ligada à NF ${numOrig}; achei ${cand.length}.`); process.exit(1); }
const { dev, orig } = cand[0];
const [{ data: lancDev }, { data: itensDev }, { data: movsDev }, { data: monitor }, { data: cpsOrig }] = await Promise.all([
  sb.from("lancamentos").select("*").eq("nf_entrada_id", dev.id),
  sb.from("nf_entrada_itens").select("*").eq("nf_entrada_id", dev.id),
  sb.from("movimentacoes_estoque").select("*").eq("nf_entrada_id", dev.id),
  sb.from("notas_fiscais").select("*").contains("dados_nf_json", { devolucao_nf_entrada_id: dev.id }),
  sb.from("lancamentos").select("id, valor, valor_pago, status, forma_pagamento").eq("nf_entrada_id", orig.id).eq("tipo", "pagar"),
]);
const pagos = (lancDev ?? []).filter(l => l.conta_bancaria || l.lote_id || (l.conciliado && !(dev.compensacoes ?? []).length));
console.log(`Devolução NF ${dev.numero} (R$ ${dev.valor_total}) → NF de compra ${orig.numero} (${orig.status})`);
console.log(`  CPs da compra hoje: ${(cpsOrig ?? []).map(c => `${c.valor} ${c.status}${c.forma_pagamento ? ` (${c.forma_pagamento})` : ""}`).join(" | ")}`);
console.log(`  Compensações a desfazer: ${(dev.compensacoes ?? []).length} · títulos da devolução: ${(lancDev ?? []).length} · itens: ${(itensDev ?? []).length} · movimentos de estoque: ${(movsDev ?? []).length} · Monitor de NF-e: ${(monitor ?? []).length}`);
if (pagos.length) { console.error("O título a receber da devolução tem baixa real (conta/borderô) — estorne a baixa antes."); process.exit(1); }
if (!aplicar) { console.log("Simulação. Rode com --aplicar (backup em backup/)."); process.exit(0); }

fs.mkdirSync("backup", { recursive: true });
const arq = `backup/devolucao_desfazer_${numDev}_${new Date().toISOString().slice(0, 10)}.json`;
fs.writeFileSync(arq, JSON.stringify({ dev, orig, lancDev, itensDev, movsDev, monitor, cpsOrig }, null, 1));

// 1. CPs da compra voltam como estavam antes da compensação
const n = await desfazerCompensacaoDevolucao(sb, dev.id);
console.log(`  ${n} compensação(ões) desfeita(s).`);
// 2. Estoque: a devolução deu saída — devolve a quantidade ao insumo e apaga os movimentos
for (const m of movsDev ?? []) {
  if (!m.insumo_id) continue;
  const { data: ins } = await sb.from("insumos").select("estoque").eq("id", m.insumo_id).maybeSingle();
  if (ins) await sb.from("insumos").update({ estoque: (Number(ins.estoque) || 0) + (m.tipo === "saida" ? Number(m.quantidade) : -Number(m.quantidade)) }).eq("id", m.insumo_id);
}
if ((movsDev ?? []).length) await sb.from("movimentacoes_estoque").delete().eq("nf_entrada_id", dev.id);
// 3. Título a receber, itens, Monitor de NF-e e a própria NF de devolução
await sb.from("lancamentos").delete().eq("nf_entrada_id", dev.id);
await sb.from("nf_entrada_itens").delete().eq("nf_entrada_id", dev.id);
for (const m of monitor ?? []) await sb.from("notas_fiscais").delete().eq("id", m.id);
const { error } = await sb.from("nf_entradas").delete().eq("id", dev.id);
if (error) throw error;
// 4. Marca "Devolvida" da compra
console.log(`  Situação da NF ${orig.numero}: ${await atualizarSituacaoDevolucao(sb, orig.id) ?? "sem devolução"}`);
const { data: depois } = await sb.from("lancamentos").select("valor, valor_pago, status").eq("nf_entrada_id", orig.id).eq("tipo", "pagar");
console.log(`  CPs da compra agora: ${(depois ?? []).map(c => `${c.valor} ${c.status}`).join(" | ")}`);
console.log(`Feito. Backup: ${arq}`);
