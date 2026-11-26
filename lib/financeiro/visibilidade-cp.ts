export type OrigemTituloCP = {
  id: string; origem_tabela: string; origem_lancamento?: string | null;
  categoria?: string | null; adiantamento_fornecedor?: boolean; adiantamento_aplicado?: boolean;
  nf_entrada_id?: string | null; nfe_numero?: string | null;
};
/** Pedido tem controle próprio; a dívida da NF continua no CP. Adiantamento a fornecedor voltou ao grid em 18/11/2026
 *  (pedido do dono): baixa e estorno pelo CP usam a mesma rotina da tela de Adiantamentos. Depois de todo usado em NF
 *  (status "aplicado"), sai do grid (25/11/2026) — continua na tela de Adiantamentos e no razão. */
/** Movimento entre contas do próprio cliente lançado pela Tesouraria (transferência, aplicação/resgate, ajuste de saldo):
 *  não é dívida nem recebível. Fica só na Tesouraria e na conciliação; fora do grid do CP e do CR (26/11/2026 — uma
 *  transferência de R$ 1 mi foi "reaberta" pelo CP e virou título vencido). Taxa, IOF/IR, seguro e consórcio continuam. */
export const CATEGORIAS_MOVIMENTO_ENTRE_CONTAS = new Set([
  "Transferência entre Contas", "Aplicação Financeira", "Aporte em Aplicação Financeira",
  "Resgate de Aplicação Financeira", "Resgate de Aplicação", "Ajuste de Saldo",
]);
export function movimentoEntreContas(t: { origem_lancamento?: string | null; categoria?: string | null }): boolean {
  return t.origem_lancamento === "tesouraria" && CATEGORIAS_MOVIMENTO_ENTRE_CONTAS.has(String(t.categoria ?? "").trim());
}
export function exibirNoCP(t: OrigemTituloCP): boolean {
  if (t.adiantamento_aplicado) return false;
  if (movimentoEntreContas(t)) return false;
  const temNF = !!t.nf_entrada_id || !!t.nfe_numero;
  return t.origem_lancamento !== "pedido_compra" || temNF;
}
export function exibirBorderoNoCP(b: { itens?: { lancamento_id: string; origem_tabela?: string | null }[] }, titulos: OrigemTituloCP[]): boolean {
  const conhecidos = new Map(titulos.map(t => [`${t.origem_tabela}:${t.id}`, t]));
  const itens = b.itens ?? [];
  // Borderô antigo sem títulos identificáveis permanece acessível. Um misto conserva a obrigação das NFs.
  return !itens.length || itens.some(i => {
    const t = conhecidos.get(`${i.origem_tabela ?? "lancamentos"}:${i.lancamento_id}`);
    return !t || exibirNoCP(t);
  });
}
