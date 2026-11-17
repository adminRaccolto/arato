// Quais títulos do CP entram em Custos Totais (17/11/2026). A tela somava tudo: título cancelado (um pedido de
// R$ 33,7 bilhões digitado errado e cancelado), previsão, devolução do principal de empréstimo (Pagamento de Custeio /
// Financiamento — dívida, não custo), movimento de tesouraria e compra de insumo com a categoria genérica "Insumos"
// (que já entra pelo consumo do estoque — contava duas vezes).

export type TituloCusto = { status?: string | null; categoria?: string | null; origem_lancamento?: string | null; natureza?: string | null };

// Principal de empréstimo e movimentos de caixa: não são custo de produção (juros e IOF continuam como custo financeiro)
const NAO_CUSTO = /^(pagamento de (custeio|financiamento|securitiza|cpr|egf|empr)|capta[cç][aã]o|ajuste de saldo|transfer|adiantamento)/i;

/** O título entra como custo? Fora: cancelado, previsão, tesouraria, principal de empréstimo e movimentos de caixa. */
export function entraNoCusto(t: TituloCusto): boolean {
  if (t.status === "cancelado") return false;
  if (t.natureza === "previsao" || t.origem_lancamento === "previsao" || t.origem_lancamento === "tesouraria") return false;
  return !NAO_CUSTO.test((t.categoria ?? "").trim());
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
