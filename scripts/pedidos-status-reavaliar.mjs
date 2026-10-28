// Reavalia o status dos pedidos de compra aprovados/parcialmente entregues pela entrega registrada nos itens
// (mesma regra de statusPorEntrega). Achado 28/10/2026: salvar o pedido gravava "Aprovado" por cima do status das
// entregas (pedido 46316 100% entregue ficou Aprovado). Uso: node --env-file=.env.local scripts/pedidos-status-reavaliar.mjs [--aplicar]
import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
import { statusPorEntrega } from "../lib/compras/entrega-pedido.ts";

const aplicar = process.argv.includes("--aplicar");
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const todos = async (t, sel, f) => { const out = []; for (let i = 0; ; i += 1000) { const { data, error } = await f(sb.from(t).select(sel)).order("id").range(i, i + 999); if (error) throw error; out.push(...data); if (data.length < 1000) break; } return out; };

const peds = await todos("pedidos_compra", "id, nr_pedido, numero, status", q => q.in("status", ["aprovado", "parcialmente_entregue", "entregue"]));
const mudar = [];
for (let k = 0; k < peds.length; k += 200) {
  const lote = peds.slice(k, k + 200);
  const itens = await todos("pedidos_compra_itens", "id, pedido_id, quantidade, qtd_entregue, qtd_cancelada", q => q.in("pedido_id", lote.map(p => p.id)));
  const nfs = await todos("nf_entradas", "id, pedido_compra_id", q => q.in("pedido_compra_id", lote.map(p => p.id)).eq("status", "processada"));
  for (const p of lote) {
    const its = itens.filter(i => i.pedido_id === p.id);
    if (!its.length) continue;
    const novo = statusPorEntrega(its, new Map(its.map(i => [i.id, Number(i.qtd_entregue ?? 0)])), nfs.some(n => n.pedido_compra_id === p.id));
    if (novo !== p.status) mudar.push({ id: p.id, pedido: p.nr_pedido ?? p.numero, de: p.status, para: novo });
  }
}
for (const m of mudar) console.log(`Pedido ${m.pedido}: ${m.de} → ${m.para}`);
console.log(`${mudar.length} pedido(s) com status diferente da entrega.`);
if (!aplicar) { console.log("Simulação. Rode com --aplicar para corrigir (backup em backup/)."); process.exit(0); }
fs.mkdirSync("backup", { recursive: true });
fs.writeFileSync(`backup/pedidos_status_${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(mudar, null, 1));
for (const m of mudar) { const { error } = await sb.from("pedidos_compra").update({ status: m.para }).eq("id", m.id).eq("status", m.de); if (error) throw error; }
console.log("Corrigido.");
