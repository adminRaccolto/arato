/**
 * Saldo do Pedido de Compra no Fluxo de Caixa.
 *
 * Ao aprovar um pedido nasce um título a pagar "do pedido" (origem pedido_compra) com o valor TOTAL, que alimenta o
 * fluxo de caixa projetado. As NFs vinculadas e processadas geram seus próprios títulos no Contas a Pagar — então o
 * título do pedido passa a valer só o SALDO: total do pedido menos o total das NFs processadas. Saldo zerado
 * (ou negativo) = título do pedido cancelado; se uma NF for estornada, o saldo volta e o título é reativado.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

export const MARCA_SALDO_ZERADO = "[Saldo do pedido zerado pelas NFs vinculadas]";
const r2 = (n: number) => Math.round(n * 100) / 100;

/** Saldo do pedido ainda não coberto por NF (nunca negativo). */
export function saldoDoPedido(totalPedido: number, totalNfsProcessadas: number): number {
  return Math.max(0, r2((Number(totalPedido) || 0) - (Number(totalNfsProcessadas) || 0)));
}

export async function ajustarSaldoPedidoNoFC(cli: SupabaseClient, pedidoId: string | null | undefined): Promise<void> {
  if (!pedidoId) return;
  const { data: ped } = await cli.from("pedidos_compra").select("id, status, total_financeiro, lancamento_id").eq("id", pedidoId).maybeSingle();
  if (!ped?.lancamento_id || ped.status === "cancelado" || ped.status === "rascunho") return;
  const { data: lanc } = await cli.from("lancamentos")
    .select("id, valor, status, moeda, origem_lancamento, nf_entrada_id, observacao").eq("id", ped.lancamento_id).maybeSingle();
  // Só o título "puro" do pedido: o que já virou título de NF (nf_entrada_id) ou foi pago não é mexido; barter fica fora
  if (!lanc || lanc.origem_lancamento !== "pedido_compra" || lanc.nf_entrada_id || lanc.moeda === "barter") return;

  const { data: nfs } = await cli.from("nf_entradas").select("valor_total").eq("pedido_compra_id", pedidoId).eq("status", "processada");
  const somaNfs = (nfs ?? []).reduce((s, n) => s + Number(n.valor_total || 0), 0);
  const saldo = saldoDoPedido(Number(ped.total_financeiro), somaNfs);

  const aberto = ["em_aberto", "vencido", "vencendo"].includes(lanc.status);
  const zeradoPorNos = lanc.status === "cancelado" && String(lanc.observacao ?? "").includes(MARCA_SALDO_ZERADO);
  if (saldo <= 0.01) {
    if (aberto) await cli.from("lancamentos").update({ status: "cancelado", observacao: MARCA_SALDO_ZERADO }).eq("id", lanc.id);
  } else if (aberto && Math.abs(saldo - Number(lanc.valor)) > 0.005) {
    await cli.from("lancamentos").update({ valor: saldo }).eq("id", lanc.id);
  } else if (zeradoPorNos) {
    await cli.from("lancamentos").update({ status: "em_aberto", valor: saldo, observacao: null }).eq("id", lanc.id);
  }
}
