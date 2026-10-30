/**
 * Refinanciamento / consolidação de contratos financeiros (1→1 ou N→1) — 30/10/2026.
 *
 * O banco deposita a cédula nova e, no mesmo dia, debita da conta a liquidação de cada contrato antigo (no extrato:
 * + liberação, − liquidação do contrato A, − liquidação do contrato B). Por isso os títulos a pagar do contrato antigo
 * são BAIXADOS na conta indicada pelo valor que o banco debitou — cada débito do extrato tem o seu título para conciliar:
 * amortizações e juros já vencidos primeiro; o que sobra paga os juros do período; os juros futuros que o banco não
 * cobrou (liquidação antecipada) saem como desconto. O que já foi pago antes não muda.
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
  moeda?: string | null;
  cotacao_usd?: number | null;
  data_baixa?: string | null;
  conta_bancaria?: string | null;
  valor_desconto?: number | null;
  valor_juros?: number | null;
};

/** Estado do título antes do refinanciamento — guardado para o Desvincular devolver tudo como estava.
 *  `acao: "baixado"` = liquidação (atual). Sem `acao` = vínculos antigos, em que o título era cancelado/encerrado. */
export type TituloAntes = {
  id: string; status: string | null; valor: number | null; valor_pago?: number | null; observacao: string | null;
  acao?: "baixado"; data_baixa?: string | null; conta_bancaria?: string | null; valor_desconto?: number | null;
  valor_juros?: number | null; pago_depois?: number;
};

export type ItemLiquidacao = { titulo: TituloOrigem; pago: number; desconto: number; juros: number };
export type Liquidacao = {
  itens: ItemLiquidacao[];
  /** Em borderô ainda não pago: não mexe (o borderô quebraria) — o usuário resolve o borderô antes. */
  emBordero: TituloOrigem[];
  total: number;
};

const r2 = (n: number) => Math.round(n * 100) / 100;
const ABERTOS = new Set(["em_aberto", "vencido", "vencendo", "parcial"]);
const ehEncargo = (d: string | null) => /— (Juros|Encargos)\b|\bIOF\b|Tarifa/i.test(d ?? "");

/** O que falta pagar, em R$ (valor_pago é sempre em reais; título em dólar usa a cotação dele, como na baixa). */
export const restante = (t: Pick<TituloOrigem, "valor" | "valor_pago" | "moeda" | "cotacao_usd">) => {
  const valor = t.moeda === "USD" ? (Number(t.valor) || 0) * (Number(t.cotacao_usd) || 5.12) : (Number(t.valor) || 0);
  return Math.max(0, r2(valor - (Number(t.valor_pago) || 0)));
};
const aPagar = (t: TituloOrigem) => t.tipo === "pagar" && ABERTOS.has(t.status ?? "") && restante(t) > 0.009;
const porVenc = (a: TituloOrigem, b: TituloOrigem) => (a.data_vencimento ?? "").localeCompare(b.data_vencimento ?? "") || a.id.localeCompare(b.id);

/**
 * Saldo devedor sugerido da origem na data: amortizações ainda não pagas (inclusive o que falta das parciais) + juros/
 * encargos já vencidos e não pagos. Juros de parcelas futuras não entram. É sugestão: vale o valor debitado pelo banco.
 */
export function saldoDevedorOrigem(titulos: TituloOrigem[], data: string): number {
  return r2(titulos.filter(aPagar).reduce((s, t) => {
    if (ehEncargo(t.descricao) && (t.data_vencimento ?? "") > data) return s;
    return s + restante(t);
  }, 0));
}

/**
 * Reparte o valor debitado pelo banco entre os títulos a pagar da origem, na ordem: amortizações, juros já vencidos,
 * juros futuros (por vencimento). O que não chega a um título vira desconto; o que passa de toda a dívida entra como
 * juros no último título.
 */
export function planejarLiquidacao(titulos: TituloOrigem[], valor: number, data: string): Liquidacao {
  const abertos = titulos.filter(aPagar);
  const emBordero = abertos.filter(t => !!t.lote_id);
  const livres = abertos.filter(t => !t.lote_id);
  const amort = livres.filter(t => !ehEncargo(t.descricao)).sort(porVenc);
  const encVencidos = livres.filter(t => ehEncargo(t.descricao) && (t.data_vencimento ?? "") <= data).sort(porVenc);
  const encFuturos = livres.filter(t => ehEncargo(t.descricao) && (t.data_vencimento ?? "") > data).sort(porVenc);
  let resta = r2(Math.max(0, valor));
  const itens: ItemLiquidacao[] = [...amort, ...encVencidos, ...encFuturos].map(t => {
    const deve = restante(t);
    const pago = r2(Math.min(deve, resta));
    resta = r2(resta - pago);
    return { titulo: t, pago, desconto: r2(deve - pago), juros: 0 };
  });
  if (resta > 0.009 && itens.length) {
    const ult = itens[itens.length - 1];
    ult.pago = r2(ult.pago + resta); ult.juros = resta;
  }
  return { itens, emBordero, total: r2(itens.reduce((s, i) => s + i.pago, 0)) };
}

export const notaRefinanciamento = (obs: string | null | undefined, cedula: string) =>
  [obs?.trim(), `Liquidado no refinanciamento pela cédula ${cedula}`].filter(Boolean).join(" · ");

/**
 * Desvincular: só devolve o título que continua do jeito que o refinanciamento deixou. Liquidação: baixado com o
 * mesmo valor pago e ainda não conciliado. Vínculos antigos: cancelado, ou baixado no valor que já estava pago.
 */
export function podeRestaurar(atual: Pick<TituloOrigem, "status" | "valor" | "valor_pago"> & { conciliado?: boolean | null }, antes: TituloAntes): boolean {
  if (antes.acao === "baixado") {
    return atual.status === "baixado" && !atual.conciliado && Math.abs((Number(atual.valor_pago) || 0) - (antes.pago_depois ?? 0)) < 0.01;
  }
  if (antes.status === "parcial") {
    const pagoAntes = Number(antes.valor_pago) || 0;
    return atual.status === "baixado" && Math.abs((Number(atual.valor) || 0) - pagoAntes) < 0.01 && Math.abs((Number(atual.valor_pago) || 0) - pagoAntes) < 0.01;
  }
  return atual.status === "cancelado";
}
