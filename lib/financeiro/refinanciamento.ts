/**
 * Refinanciamento / consolidação de contratos financeiros (1→1 ou N→1) — 30/10/2026.
 *
 * Ao vincular um contrato de origem à cédula nova, a dívida antiga passa a ser a nova: o saldo devedor da origem é
 * incorporado e os títulos dela que ainda estavam a pagar deixam de existir no Contas a Pagar (senão a dívida aparece
 * em dobro no CP e no fluxo de caixa). O que já foi pago não muda.
 */

export type TituloOrigem = {
  id: string;
  tipo: string | null;
  status: string | null;
  valor: number | null;
  valor_pago: number | null;
  data_vencimento: string | null;
  descricao: string | null;
  observacao?: string | null;
  lote_id?: string | null;
};

/** Estado do título antes do refinanciamento — guardado para o Desvincular devolver tudo como estava. */
export type TituloAntes = { id: string; status: string | null; valor: number | null; valor_pago?: number | null; observacao: string | null };

export type Encerramento = {
  /** Em aberto/vencidos sem nada pago: viram cancelado. */
  cancelar: TituloOrigem[];
  /** Parciais: ficam com o que já foi pago e são baixados (o restante entra no saldo refinanciado). */
  encerrarParcial: TituloOrigem[];
  /** Em borderô ainda não pago: não mexe (o borderô quebraria) — o usuário resolve o borderô antes. */
  emBordero: TituloOrigem[];
};

const r2 = (n: number) => Math.round(n * 100) / 100;
const ABERTOS = new Set(["em_aberto", "vencido", "vencendo", "parcial"]);
const ehEncargo = (d: string | null) => /— (Juros|Encargos)\b|\bIOF\b|Tarifa/i.test(d ?? "");

export const restante = (t: Pick<TituloOrigem, "valor" | "valor_pago">) => Math.max(0, r2((Number(t.valor) || 0) - (Number(t.valor_pago) || 0)));
const aPagar = (t: TituloOrigem) => t.tipo === "pagar" && ABERTOS.has(t.status ?? "") && restante(t) > 0.009;

/**
 * Saldo devedor sugerido da origem na data do refinanciamento: amortizações ainda não pagas (inclusive o que falta
 * das parciais) + juros/encargos já vencidos e não pagos. Juros de parcelas futuras não entram — o banco recalcula
 * na cédula nova. É uma sugestão: o valor informado pelo banco prevalece.
 */
export function saldoDevedorOrigem(titulos: TituloOrigem[], data: string): number {
  return r2(titulos.filter(aPagar).reduce((s, t) => {
    if (ehEncargo(t.descricao) && (t.data_vencimento ?? "") > data) return s;
    return s + restante(t);
  }, 0));
}

/** O que fazer com cada título a pagar da origem. */
export function planejarEncerramento(titulos: TituloOrigem[]): Encerramento {
  const r: Encerramento = { cancelar: [], encerrarParcial: [], emBordero: [] };
  for (const t of titulos.filter(aPagar)) {
    if (t.lote_id) r.emBordero.push(t);
    else if ((Number(t.valor_pago) || 0) > 0.009) r.encerrarParcial.push(t);
    else r.cancelar.push(t);
  }
  return r;
}

export const notaRefinanciamento = (obs: string | null | undefined, cedula: string) =>
  [obs?.trim(), `Refinanciado pela cédula ${cedula}`].filter(Boolean).join(" · ");

/**
 * Desvincular: só devolve o título que continua do jeito que o refinanciamento deixou (cancelado, ou baixado no valor
 * pago). Se alguém mexeu nele depois, fica como está.
 */
export function podeRestaurar(atual: Pick<TituloOrigem, "status" | "valor" | "valor_pago">, antes: TituloAntes): boolean {
  if (antes.status === "parcial") {
    const pagoAntes = Number(antes.valor_pago) || 0;
    return atual.status === "baixado" && Math.abs((Number(atual.valor) || 0) - pagoAntes) < 0.01 && Math.abs((Number(atual.valor_pago) || 0) - pagoAntes) < 0.01;
  }
  return atual.status === "cancelado";
}
