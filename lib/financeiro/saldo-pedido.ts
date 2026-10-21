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
/** Pedido em dólar: sobra até esta fração do total é diferença de câmbio (pedido fechado num câmbio, NFs em outro). */
export const TOLERANCIA_CAMBIO = 0.02;
const r2 = (n: number) => Math.round(n * 100) / 100;

/** Saldo do pedido ainda não coberto por NF (nunca negativo). */
export function saldoDoPedido(totalPedido: number, totalNfsProcessadas: number): number {
  return Math.max(0, r2((Number(totalPedido) || 0) - (Number(totalNfsProcessadas) || 0)));
}

/**
 * Total das NFs na moeda do título do pedido. As NFs são sempre em reais: pedido em dólar converte cada NF pela PTAX do
 * dia da emissão (antes comparava dólar com real e cancelava o título do pedido com saldo ainda em aberto).
 * null = falta a cotação de alguma NF (quem chama não mexe no título).
 */
export async function totalNfsNaMoeda(
  nfs: { valor_total: unknown; data_emissao?: string | null; data_entrada?: string | null }[],
  moeda: string | null | undefined,
  ptax: (data: string) => Promise<number | null>,
): Promise<number | null> {
  let soma = 0;
  for (const n of nfs) {
    const v = Number(n.valor_total || 0);
    if (moeda !== "USD") { soma += v; continue; }
    const data = String(n.data_emissao ?? n.data_entrada ?? "").slice(0, 10);
    const cot = data ? await ptax(data) : null;
    if (!cot) return null;
    soma += v / cot;
  }
  return r2(soma);
}

export async function ajustarSaldoPedidoNoFC(
  cli: SupabaseClient, pedidoId: string | null | undefined,
  ptax?: (data: string) => Promise<number | null>,   // obrigatório para pedido em dólar (lib/financeiro/ptax)
): Promise<void> {
  if (!pedidoId) return;
  const { data: ped } = await cli.from("pedidos_compra").select("id, status, total_financeiro, lancamento_id").eq("id", pedidoId).maybeSingle();
  if (!ped?.lancamento_id || ped.status === "cancelado" || ped.status === "rascunho") return;
  const { data: lanc } = await cli.from("lancamentos")
    .select("id, valor, status, moeda, origem_lancamento, nf_entrada_id, observacao").eq("id", ped.lancamento_id).maybeSingle();
  // Só o título "puro" do pedido: o que já virou título de NF (nf_entrada_id) ou foi pago não é mexido; barter fica fora
  if (!lanc || lanc.origem_lancamento !== "pedido_compra" || lanc.nf_entrada_id || lanc.moeda === "barter") return;

  const { data: nfs } = await cli.from("nf_entradas").select("valor_total, data_emissao, data_entrada").eq("pedido_compra_id", pedidoId).eq("status", "processada");
  const somaNfs = await totalNfsNaMoeda(nfs ?? [], lanc.moeda, ptax ?? (async () => null));
  if (somaNfs === null) return;   // sem PTAX de alguma NF: não mexe no título (melhor manter o saldo do que zerar errado)
  // Pedido em dólar: sobra de até 2% do total é diferença de câmbio entre o pedido e as NFs, não saldo a faturar
  let saldoBruto = saldoDoPedido(Number(ped.total_financeiro), somaNfs);
  if (lanc.moeda === "USD" && saldoBruto <= Number(ped.total_financeiro) * TOLERANCIA_CAMBIO + 0.005) saldoBruto = 0;
  const saldo = saldoBruto;

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
