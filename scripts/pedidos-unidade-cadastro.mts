// Pedidos de compra antigos com o item numa unidade diferente da do cadastro (27/10/2026).
// Grafia diferente (lt/L, ton/t) → só a unidade; conversão segura (t ↔ kg) → quantidade, preço, desconto e cancelado
// convertidos (total do item não muda); sem conversão (bag, bombona, dose, un) → não mexe, a tela pede o ajuste.
// Depois recalcula a entrega (pelas NFs processadas, já com a regra nova) e o status dos pedidos afetados.
// Uso: npx tsx scripts/pedidos-unidade-cadastro.mts            (prévia, nada gravado)
//      npx tsx scripts/pedidos-unidade-cadastro.mts --aplicar  (backup em backup/pedidos_unidade_<data>.json)
import fs from "fs"; import { createClient } from "@supabase/supabase-js";
import { fatorUnidade, unidadePadrao } from "../lib/estoque/unidades.ts";
import { alocarEntregaPorLinha, statusPorEntrega } from "../lib/compras/entrega-pedido.ts";
const env = Object.fromEntries(fs.readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n").filter(l => l.includes("="))
  .map(l => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, "")]; }));
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const APLICAR = process.argv.includes("--aplicar");
async function todas(t: string, c: string, f = (q: any) => q) { const o: any[] = []; for (let d = 0; ; d += 1000) { const { data, error } = await f(sb.from(t).select(c)).order("id").range(d, d + 999); if (error) throw error; o.push(...data!); if (data!.length < 1000) return o; } }
const r4 = (n: number) => Math.round(n * 1e4) / 1e4, r6 = (n: number) => Math.round(n * 1e6) / 1e6;

const itens = await todas("pedidos_compra_itens", "*");
const insumos = new Map((await todas("insumos", "id,unidade")).map((i: any) => [i.id, i.unidade]));
const nfsPorPedido = new Map<string, any[]>();
for (const n of await todas("nf_entradas", "id,pedido_compra_id,status", q => q.not("pedido_compra_id", "is", null)))
  nfsPorPedido.set(n.pedido_compra_id, [...(nfsPorPedido.get(n.pedido_compra_id) ?? []), n]);

const alteracoes: { id: string; pedido_id: string; antes: any; depois: any }[] = [];
const pedidosAfetados = new Set<string>();
for (const it of itens) {
  const unCad = insumos.get(it.insumo_id);
  if (!unCad || it.unidade === unCad) continue;
  if (nfsPorPedido.has(it.pedido_id)) pedidosAfetados.add(it.pedido_id);
  const f = unidadePadrao(it.unidade) === unidadePadrao(unCad) ? 1 : fatorUnidade(it.unidade, unCad);
  if (f === null) continue;
  const temNf = nfsPorPedido.has(it.pedido_id);
  const depois: any = { unidade: unCad };
  if (f !== 1) Object.assign(depois, {
    quantidade: r4(it.quantidade * f), valor_unitario: r6(it.valor_unitario / f), desconto_unitario: r6((it.desconto_unitario ?? 0) / f),
    qtd_cancelada: r4((it.qtd_cancelada ?? 0) * f), ...(temNf ? {} : { qtd_entregue: r4((it.qtd_entregue ?? 0) * f) }),
  });
  alteracoes.push({ id: it.id, pedido_id: it.pedido_id, antes: it, depois });
}
console.log(`Itens a ajustar: ${alteracoes.length} (${alteracoes.filter(a => a.depois.quantidade === undefined).length} só a grafia, ${alteracoes.filter(a => a.depois.quantidade !== undefined).length} convertidos)`);

// Entrega e status recalculados nos pedidos com NF que tinham alguma linha em unidade diferente
const mudStatus: any[] = [], mudEntrega: any[] = [];
const pedidos = new Map((await todas("pedidos_compra", "id,status,nr_pedido,numero")).map((p: any) => [p.id, p]));
for (const pid of pedidosAfetados) {
  const ped = pedidos.get(pid); if (!ped || ["rascunho", "cancelado"].includes(ped.status)) continue;
  const linhas = itens.filter(i => i.pedido_id === pid).map(i => ({ ...i, ...(alteracoes.find(a => a.id === i.id)?.depois ?? {}) }));
  const proc = (nfsPorPedido.get(pid) ?? []).filter(n => n.status === "processada").map(n => n.id);
  const nfItens = proc.length ? await todas("nf_entrada_itens", "id,insumo_id,pedido_item_id,quantidade,unidade", q => q.in("nf_entrada_id", proc)) : [];
  const ent = alocarEntregaPorLinha(linhas, nfItens);
  for (const l of linhas) { const nova = r4(ent.get(l.id) ?? 0); if (Math.abs(nova - (l.qtd_entregue ?? 0)) > 0.001) mudEntrega.push({ id: l.id, pedido_id: pid, de: l.qtd_entregue, para: nova, nome: l.nome_item, un: l.unidade }); l.qtd_entregue = nova; }
  const novo = statusPorEntrega(linhas, new Map(linhas.map(l => [l.id, l.qtd_entregue ?? 0])), proc.length > 0);
  if (novo !== ped.status) mudStatus.push({ id: pid, pedido: ped.nr_pedido ?? ped.numero, de: ped.status, para: novo });
}
console.log(`Entregas recalculadas: ${mudEntrega.length} linha(s); status que mudam: ${mudStatus.length}`);
for (const m of mudStatus) console.log(`  pedido ${m.pedido}: ${m.de} → ${m.para}`);

if (!APLICAR) { console.log("Prévia — nada gravado. Use --aplicar."); process.exit(0); }
const arq = new URL(`../backup/pedidos_unidade_${new Date().toISOString().slice(0, 10)}_${Date.now()}.json`, import.meta.url);
fs.writeFileSync(arq, JSON.stringify({ itens: alteracoes.map(a => a.antes), status: mudStatus, entregas: mudEntrega }, null, 1));
for (const a of alteracoes) { const { error } = await sb.from("pedidos_compra_itens").update(a.depois).eq("id", a.id); if (error) throw error; }
for (const m of mudEntrega) { const { error } = await sb.from("pedidos_compra_itens").update({ qtd_entregue: m.para }).eq("id", m.id); if (error) throw error; }
for (const m of mudStatus) { const { error } = await sb.from("pedidos_compra").update({ status: m.para }).eq("id", m.id); if (error) throw error; }
console.log(`Gravado. Backup: ${arq.pathname}`);
