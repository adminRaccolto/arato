// Adiantamento de funcionário usado como pagamento de outra conta do CP (Folha → Adiantamentos → "Usar como pagamento").
// A regra que grava é a do banco (Seção 451, folha_usar_adiantamento); aqui fica o que a tela precisa saber antes:
// em que modo o uso acontece, quanto do adiantamento está disponível e se algo impede o uso.

export type ModoUsoAdiantamento = "abate_adiantamento" | "quita_conta";

export type AdiantamentoParaUso = { valor: number; valor_aplicado_cp?: number | null; status: string; tipo?: string | null };
export type TituloDoAdiantamento = { status: string; valor: number; valor_pago?: number | null; lote_id?: string | null } | null;

export type SituacaoUso = { modo: ModoUsoAdiantamento; disponivel: number; bloqueio: string | null };

const r2 = (v: number) => Math.round(v * 100) / 100;

/**
 * Título do adiantamento ainda com saldo em aberto → o uso abate esse título (a conta escolhida segue para o banco).
 * Título já pago (adiantamentos antigos, que nasciam baixados) → o uso quita a conta escolhida sem saída de caixa.
 */
export function situacaoUsoAdiantamento(a: AdiantamentoParaUso, t: TituloDoAdiantamento): SituacaoUso {
  const saldoAdi = r2(Number(a.valor) - Number(a.valor_aplicado_cp ?? 0));
  const abertoTitulo = t && ["em_aberto", "vencido", "parcial"].includes(t.status) ? r2(Number(t.valor) - Number(t.valor_pago ?? 0)) : 0;
  const modo: ModoUsoAdiantamento = abertoTitulo > 0 ? "abate_adiantamento" : "quita_conta";
  const disponivel = Math.max(0, modo === "abate_adiantamento" ? Math.min(saldoAdi, abertoTitulo) : saldoAdi);
  let bloqueio: string | null = null;
  if (a.status === "cancelado" || a.tipo === "devolucao") bloqueio = "Adiantamento não disponível.";
  else if (modo === "abate_adiantamento" && t?.lote_id) bloqueio = "O título do adiantamento está num borderô. Tire do borderô ou pague o borderô antes de usar.";
  else if (disponivel <= 0) bloqueio = "O adiantamento não tem saldo para usar.";
  return { modo, disponivel: r2(disponivel), bloqueio };
}

export const TEXTO_MODO: Record<ModoUsoAdiantamento, string> = {
  abate_adiantamento: "O título do adiantamento no CP diminui no valor da conta escolhida, sem saída de caixa. A conta escolhida continua em aberto e é paga normalmente pelo banco, agora como adiantamento para o funcionário.",
  quita_conta: "Este adiantamento já foi pago. A conta escolhida é quitada com ele, sem nova saída de caixa, e passa a ser adiantamento para o funcionário.",
};
