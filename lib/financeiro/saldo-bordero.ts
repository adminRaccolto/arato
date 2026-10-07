import type { PagamentoLote } from "../supabase";

export const arredondarMoeda = (v: number) => Math.round((v + Number.EPSILON) * 100) / 100;

/** valor_pago do cabeçalho é o principal liquidado (inclui o desconto).
 * Caixa efetivo = principal + juros + multa - desconto, como no formulário.
 * Borderôs legados sem valor_pago eram quitados integralmente.
 */
export function resumoBordero(b: Pick<PagamentoLote, "status" | "valor_total" | "valor_pago">) {
  const liquidado = arredondarMoeda(b.valor_pago ?? (b.status === "pago" ? b.valor_total : 0));
  const saldo = arredondarMoeda(Math.max(0, b.valor_total - liquidado));
  const status = saldo === 0 ? "baixado" : liquidado > 0 ? "parcial" : "em_aberto";
  return { liquidado, saldo, status } as const;
}

export type ValoresPagamentoBordero = {
  valor_pago?: number; valor_juros?: number; valor_multa?: number; valor_desconto?: number;
  novo_vencimento_saldo?: string;
};
export function acumularPagamentoBordero(b: PagamentoLote, pagamento: ValoresPagamentoBordero) {
  const atual = resumoBordero(b);
  if (atual.saldo === 0) throw new Error("Este borderô já está quitado.");
  const principal = pagamento.valor_pago ?? atual.saldo;
  const juros = pagamento.valor_juros ?? 0;
  const multa = pagamento.valor_multa ?? 0;
  const desconto = pagamento.valor_desconto ?? 0;
  if ([principal, juros, multa, desconto].some(v => !Number.isFinite(v) || v < 0) || principal <= 0)
    throw new Error("Informe um valor de pagamento maior que zero e encargos válidos.");
  if (arredondarMoeda(principal) > atual.saldo) throw new Error("O pagamento supera o saldo em aberto do borderô.");
  if (desconto > principal) throw new Error("O desconto não pode superar o principal deste pagamento.");
  const liquidado = arredondarMoeda(atual.liquidado + principal);
  const saldo = arredondarMoeda(Math.max(0, b.valor_total - liquidado));
  let novoVencimento = "";
  if (saldo > 0 && pagamento.novo_vencimento_saldo !== undefined) {
    const valor = pagamento.novo_vencimento_saldo;
    if (typeof valor !== "string") throw new Error("Informe uma data válida para o vencimento do saldo.");
    novoVencimento = valor.trim();
    if (novoVencimento) {
      const data = new Date(`${novoVencimento}T00:00:00Z`);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(novoVencimento) || !Number.isFinite(data.getTime()) || data.toISOString().slice(0, 10) !== novoVencimento)
        throw new Error("Informe uma data válida para o vencimento do saldo.");
    }
  }
  return {
    principal: arredondarMoeda(principal), juros: arredondarMoeda(juros), multa: arredondarMoeda(multa), desconto: arredondarMoeda(desconto),
    saldo,
    patch: {
      ...(novoVencimento ? { data_vencimento: novoVencimento } : {}),
      // O banco aceita pendente/pago. Parcial é determinado pelo saldo,
      // permitindo corrigir também os registros antigos marcados como pagos.
      status: liquidado >= arredondarMoeda(b.valor_total) ? "pago" : "pendente",
      valor_pago: liquidado,
      valor_juros: arredondarMoeda((b.valor_juros ?? 0) + juros),
      valor_multa: arredondarMoeda((b.valor_multa ?? 0) + multa),
      valor_desconto: arredondarMoeda((b.valor_desconto ?? 0) + desconto),
    },
  };
}

/** Rateio em centavos, com distribuição dos resíduos para conservar o total. */
export function ratearMoeda(total: number, pesos: number[]) {
  const centavos = Math.round(total * 100);
  const soma = pesos.reduce((s, p) => s + p, 0);
  if (!Number.isFinite(total) || total < 0 || !pesos.length || soma <= 0 || pesos.some(p => !Number.isFinite(p) || p < 0))
    throw new Error("Não foi possível ratear o pagamento entre os títulos do borderô.");
  const valores = pesos.map(p => Math.floor(centavos * p / soma));
  const ordem = pesos.map((p, i) => ({ i, resto: centavos * p / soma - valores[i] })).sort((a, b) => b.resto - a.resto);
  const restantes = centavos - valores.reduce((s, p) => s + p, 0);
  for (let i = 0; i < restantes; i++) valores[ordem[i].i]++;
  return valores.map(v => v / 100);
}
