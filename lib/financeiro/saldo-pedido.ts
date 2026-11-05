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

type AdiantamentoSaldo = { valor: unknown; valor_aplicado?: unknown; moeda?: string | null; cotacao_usd?: unknown; data_emissao?: string | null };

/**
 * Crédito ainda disponível dos adiantamentos ligados ao pedido, na moeda do título. Só conta o que não foi aplicado: o
 * valor aplicado já quitou o título de uma NF, e abatê-lo de novo tiraria do caixa um pagamento que ainda vai sair.
 * null = falta a cotação de algum adiantamento (quem chama não mexe no título).
 */
export async function saldoAdiantamentosNaMoeda(
  adiantamentos: AdiantamentoSaldo[], moeda: string | null | undefined, ptax: (data: string) => Promise<number | null>,
): Promise<number | null> {
  const destinoUSD = moeda === "USD";
  let soma = 0;
  for (const a of adiantamentos) {
    const v = Math.max(0, Number(a.valor || 0) - Number(a.valor_aplicado || 0));
    if (v <= 0) continue;
    const origemUSD = a.moeda === "USD";
    if (origemUSD === destinoUSD) { soma += v; continue; }
    const cot = (origemUSD ? Number(a.cotacao_usd) || 0 : 0) || (a.data_emissao ? await ptax(String(a.data_emissao).slice(0, 10)) : null);
    if (!cot) return null;
    soma += origemUSD ? v * cot : v / cot;
  }
  return r2(soma);
}

const PREFIXO_MOTIVO = "[Saldo do pedido]";
const fmtMoeda = (v: number, moeda?: string | null) => `${moeda === "USD" ? "US$" : "R$"} ${v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** Motivo da redução do título do pedido, gravado na observação e mostrado no CP. null = título ainda vale o total. */
export function motivoSaldoPedido(d: { total: number; nfs: number; adiantamentos: number; saldo: number; moeda?: string | null }): string | null {
  if (d.nfs <= 0 && d.adiantamentos <= 0) return null;
  const partes = [`Total ${fmtMoeda(d.total, d.moeda)}`];
  if (d.nfs > 0) partes.push(`NFs processadas ${fmtMoeda(d.nfs, d.moeda)}`);
  if (d.adiantamentos > 0) partes.push(`adiantamentos ${fmtMoeda(d.adiantamentos, d.moeda)}`);
  return `${PREFIXO_MOTIVO} ${partes.join(" − ")} = ${fmtMoeda(d.saldo, d.moeda)}`;
}
/** Tira da observação só o que o sistema escreveu: o texto digitado pelo usuário continua. */
export function observacaoSemMotivo(obs: unknown): string {
  return String(obs ?? "").split("\n").filter(l => !l.startsWith(PREFIXO_MOTIVO) && !l.includes(MARCA_SALDO_ZERADO)).join("\n").trim();
}
/** Linha do motivo dentro da observação do título, para mostrar na tela. */
export function motivoDaObservacao(obs: unknown): string | null {
  return String(obs ?? "").split("\n").find(l => l.startsWith(PREFIXO_MOTIVO))?.slice(PREFIXO_MOTIVO.length).trim() ?? null;
}

type LinhaValor = { quantidade: number; qtd_entregue?: number | null; qtd_cancelada?: number | null; valor_unitario?: number | null; desconto_unitario?: number | null };
const unitarioLiquido = (l: LinhaValor) => (Number(l.valor_unitario) || 0) - (Number(l.desconto_unitario) || 0);

/** Valor entregue pelas entregas manuais (pedido sem NF vinculada): quantidade entregue x valor líquido da linha. */
export function valorEntreguePorLinhas(linhas: LinhaValor[]): number {
  return r2(linhas.reduce((s, l) => s + (Number(l.qtd_entregue) || 0) * unitarioLiquido(l), 0));
}
/** Valor das quantidades canceladas ao encerrar o pedido: deixa de ser saldo a entregar. */
export function valorCanceladoPorLinhas(linhas: LinhaValor[]): number {
  return r2(linhas.reduce((s, l) => s + (Number(l.qtd_cancelada) || 0) * unitarioLiquido(l), 0));
}
/** Painel de valor do pedido: entregue, cancelado, saldo a entregar e % sobre o que continua valendo. */
export function resumoValorPedido(total: number, entregue: number, cancelado = 0) {
  const valido = Math.max(0, r2((Number(total) || 0) - (Number(cancelado) || 0)));
  const ent = r2(Number(entregue) || 0);
  return { total: r2(Number(total) || 0), entregue: ent, cancelado: r2(Number(cancelado) || 0), saldo: saldoDoPedido(valido, ent), pct: valido > 0 ? Math.round((ent / valido) * 100) : 0 };
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
  // Adiantamento ligado ao pedido (Seção 419) já saiu ou vai sair por título próprio: abate o saldo para não contar duas vezes.
  // Sem a seção, a consulta falha e vale só o abatimento das NFs.
  const { data: adts } = await cli.from("adiantamentos_fornecedor")
    .select("valor, valor_aplicado, moeda, cotacao_usd, data_emissao").eq("pedido_compra_id", pedidoId).neq("status", "cancelado");
  const somaAdiant = await saldoAdiantamentosNaMoeda(adts ?? [], lanc.moeda, ptax ?? (async () => null));
  if (somaAdiant === null) return;
  let saldoBruto = saldoDoPedido(Number(ped.total_financeiro), somaNfs + somaAdiant);
  if (lanc.moeda === "USD" && saldoBruto <= Number(ped.total_financeiro) * TOLERANCIA_CAMBIO + 0.005) saldoBruto = 0;
  const saldo = saldoBruto;

  const aberto = ["em_aberto", "vencido", "vencendo"].includes(lanc.status);
  const zeradoPorNos = lanc.status === "cancelado" && String(lanc.observacao ?? "").includes(MARCA_SALDO_ZERADO);
  const motivo = motivoSaldoPedido({ total: Number(ped.total_financeiro), nfs: somaNfs, adiantamentos: somaAdiant, saldo, moeda: lanc.moeda });
  const obsUsuario = observacaoSemMotivo(lanc.observacao);
  const obsComMotivo = [obsUsuario, motivo].filter(Boolean).join("\n") || null;
  if (saldo <= 0.01) {
    if (aberto) await cli.from("lancamentos").update({ status: "cancelado", observacao: [obsUsuario, MARCA_SALDO_ZERADO, motivo].filter(Boolean).join("\n") }).eq("id", lanc.id);
  } else if (aberto && (Math.abs(saldo - Number(lanc.valor)) > 0.005 || (lanc.observacao ?? null) !== obsComMotivo)) {
    await cli.from("lancamentos").update({ valor: saldo, observacao: obsComMotivo }).eq("id", lanc.id);
  } else if (zeradoPorNos) {
    await cli.from("lancamentos").update({ status: "em_aberto", valor: saldo, observacao: obsComMotivo }).eq("id", lanc.id);
  }
}
