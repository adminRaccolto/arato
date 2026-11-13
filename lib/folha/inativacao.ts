export type TituloPrevisaoFolha = {
  natureza?: string | null; status?: string | null; valor_pago?: number | null;
  conciliado?: boolean | null; lote_id?: string | null; contrato_financeiro_id?: string | null;
  fatura_cartao_id?: string | null; titulo_origem_id?: string | null; data_baixa?: string | null;
};

/** Título já efetivado ou movimentado conserva valor, vínculo e histórico. */
export function preservarTituloDaFolha(t: TituloPrevisaoFolha): boolean {
  return t.natureza !== "previsao" || !["em_aberto", "vencido", "vencendo", "cancelado"].includes(t.status ?? "")
    || Number(t.valor_pago ?? 0) !== 0 || !!t.conciliado || !!t.lote_id || !!t.contrato_financeiro_id
    || !!t.fatura_cartao_id || !!t.titulo_origem_id || !!t.data_baixa;
}
