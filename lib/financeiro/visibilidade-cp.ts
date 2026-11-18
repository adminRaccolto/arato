export type OrigemTituloCP = {
  id: string; origem_tabela: string; origem_lancamento?: string | null;
  categoria?: string | null; adiantamento_fornecedor?: boolean;
  nf_entrada_id?: string | null; nfe_numero?: string | null;
};
/** Pedido tem controle próprio; a dívida da NF continua no CP. Adiantamento a fornecedor voltou ao grid em 18/11/2026
 *  (pedido do dono): baixa e estorno pelo CP usam a mesma rotina da tela de Adiantamentos. */
export function exibirNoCP(t: OrigemTituloCP): boolean {
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
