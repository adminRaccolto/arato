/**
 * Teto de uma baixa: ninguém paga/recebe mais do que o título vale.
 *
 * `valor_pago` acumulado ≤ valor do título (em R$) + multa + juros − desconto. Juros e multa só contam quando o
 * usuário os informou (guardados em valor_multa / valor_juros), então "pagou a mais" sem justificativa é recusado.
 */
export type LimiteBaixaTitulo = {
  valor: number | null | undefined;
  moeda?: string | null;
  cotacao_usd?: number | null;
  valor_multa?: number | null;
  valor_juros?: number | null;
  valor_desconto?: number | null;
};

const r2 = (n: number) => Math.round(n * 100) / 100;

export function limiteBaixa(t: LimiteBaixaTitulo): number {
  const base = t.moeda === "USD" ? (Number(t.valor) || 0) * (Number(t.cotacao_usd) || 5.12) : (Number(t.valor) || 0);
  return r2(base + (Number(t.valor_multa) || 0) + (Number(t.valor_juros) || 0) - (Number(t.valor_desconto) || 0));
}

/** true quando o total pago passaria do teto (tolerância de 1 centavo). */
export function excedeLimiteBaixa(t: LimiteBaixaTitulo, totalPagoDepois: number, tolerancia = 0.011): boolean {
  return r2(totalPagoDepois) - limiteBaixa(t) > tolerancia;
}

export function mensagemExcesso(t: LimiteBaixaTitulo, totalPagoDepois: number): string {
  const fmt = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  return `O valor pago (${fmt(r2(totalPagoDepois))}) é maior que o valor do título (${fmt(limiteBaixa(t))}). ` +
    `Se há juros ou multa, informe-os na baixa; se não, corrija o valor.`;
}
