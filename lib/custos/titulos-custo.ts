// Quais títulos do CP entram em Custos Totais (17/11/2026). A tela somava tudo: título cancelado (um pedido de
// R$ 33,7 bilhões digitado errado e cancelado), previsão, devolução do principal de empréstimo (Pagamento de Custeio /
// Financiamento — dívida, não custo), movimento de tesouraria e compra de insumo com a categoria genérica "Insumos"
// (que já entra pelo consumo do estoque — contava duas vezes).

export type TituloCusto = { status?: string | null; categoria?: string | null; origem_lancamento?: string | null; natureza?: string | null };

// Principal de empréstimo e movimentos de caixa: não são custo de produção (juros e IOF continuam como custo financeiro)
// Aplicação, aporte e resgate de aplicação financeira: dinheiro mudando de conta, não custo nem receita — também quando o
// título antigo foi gravado com origem "manual" pela conciliação (26/11/2026)
const NAO_CUSTO = /^(pagamento (?:de )?(custeio|financiamento|securitiza|cpr|egf|empr)|capta[cç][aã]o|ajuste de saldo|transfer|adiantamento|aplica[cç][aã]o financeira|aporte em aplica|resgate de aplica)/i;

/**
 * O título entra como custo? Fora: cancelado, previsão, tesouraria, principal de empréstimo e movimentos de caixa.
 * Previsão é pela natureza: a previsão efetivada no CP vira o mesmo título com natureza "real" e continua com origem
 * "previsao" — é gasto feito e entra (antes a origem tirava esses títulos do custo).
 */
export function entraNoCusto(t: TituloCusto): boolean {
  if (t.status === "cancelado") return false;
  if (t.natureza === "previsao" || t.origem_lancamento === "tesouraria") return false;
  return !NAO_CUSTO.test((t.categoria ?? "").trim());
}

/** Previsão ainda a realizar (linha "Previsto" de Custos Totais, fora do custo): natureza previsão, não cancelada nem paga. */
export function ehPrevisaoAberta(t: TituloCusto): boolean {
  return t.natureza === "previsao" && !["cancelado", "baixado", "pago", "parcial"].includes(String(t.status ?? ""));
}

const INSUMO_CATS = new Set([
  "Insumos — Sementes", "Insumos — Fertilizantes", "Insumos — Defensivos", "Insumos — Inoculantes", "Insumos — Corretivos",
  "Custo de Sementes", "Defensivos Agrícolas", "Insumos / Fertilizantes", "Insumos / Corretivos", "Fertilizantes", "Insumos Agrícolas",
]);

/** Compra de insumo: já entra pelo consumo do estoque (custo médio na baixa), não pode somar de novo pelo título. */
export function ehCompraDeInsumo(categoria: string | null | undefined): boolean {
  const c = (categoria ?? "").trim();
  return INSUMO_CATS.has(c) || /^insumos?\b/i.test(c);
}
