// Processar e Baixar (23/11/2026): regras para trocar um título lançado à mão pelo título da NF processada a partir dele.
// Usado pela rota app/api/financeiro/titulos/substituir-por-nf.

export type TituloManual = {
  tipo: string | null; status: string | null; valor_pago: number | string | null; lote_id: string | null;
  conciliado: boolean | null; fatura_cartao_id: string | null; nf_entrada_id: string | null; origem_lancamento: string | null;
};

const ABERTOS = new Set(["em_aberto", "vencido", "vencendo", "pendente"]);

/** Motivo para recusar a troca; null = pode trocar. */
export function motivoSubstituirPorNf(p: {
  titulo: TituloManual; pagamentosFilhos: number[]; statusNf: string; mesmoCliente: boolean; titulosDaNf: number;
}): string | null {
  const t = p.titulo;
  if (t.tipo !== "pagar") return "Só títulos do Contas a Pagar.";
  if (t.nf_entrada_id || (t.origem_lancamento && t.origem_lancamento !== "manual")) return "Este título não foi lançado à mão: ele já vem de um documento.";
  if (!ABERTOS.has(String(t.status ?? ""))) return "O título não está em aberto.";
  if (Number(t.valor_pago ?? 0) > 0 || p.pagamentosFilhos.some(v => v > 0)) return "O título já tem pagamento. Estorne antes de trocar pelo título da NF.";
  if (t.lote_id) return "O título está em um borderô. Tire do borderô antes.";
  if (t.conciliado) return "O título está conciliado com o extrato.";
  if (t.fatura_cartao_id) return "O título está numa fatura de cartão.";
  if (!p.mesmoCliente) return "A NF é de outro cliente.";
  if (p.statusNf !== "processada") return "A NF ainda não foi processada.";
  if (p.titulosDaNf === 0) return "A NF foi processada sem gerar título no Contas a Pagar (ex.: pagamento já feito ou sem financeiro). O título manual foi mantido; confira antes de baixar.";
  return null;
}

export function observacaoSubstituido(anterior: string | null | undefined, tipo: "nf" | "nfse", numero: string): string {
  const nota = `Substituído pelo título da ${tipo === "nf" ? "NF" : "NFS-e"} ${numero || "(sem número)"}, processada pelo Contas a Pagar em ${new Date().toLocaleDateString("pt-BR", { timeZone: "America/Cuiaba" })}.`;
  return [String(anterior ?? "").trim(), nota].filter(Boolean).join("\n");
}
