// CFOPs de bem do ativo imobilizado na NF de ENTRADA.
// COMPRA: investimento (CAPEX) — gera CP e OG de aquisição de máquinas/equipamentos.
export const CFOPS_COMPRA_BEM = new Set(["1551", "1556", "2551", "2556", "5554", "6554"]);
// RETORNO/ENTRADA de bem (sem cobrança): retorno de bem que saiu para uso fora, entrada de bem de terceiro
// (comodato) e transferência de bem entre estabelecimentos — não gera Contas a Pagar nem estoque.
export const CFOPS_BEM_SEM_PAGAMENTO = new Set(["1552", "2552", "1554", "2554", "1555", "2555"]);
// Retornos que podem baixar uma remessa aberta em Fiscal → Transferência de Máquinas
// (o módulo usa 1555 como CFOP de retorno de comodato; o fisco usa 1554 — aceitamos os dois).
export const CFOPS_RETORNO_DE_REMESSA = new Set(["1554", "2554", "1555", "2555"]);
export const ehBemImobilizado = (cfop?: string | null) => {
  const c = (cfop ?? "").trim();
  return CFOPS_COMPRA_BEM.has(c) || CFOPS_BEM_SEM_PAGAMENTO.has(c);
};
