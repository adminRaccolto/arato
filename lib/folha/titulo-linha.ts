// Ligação entre a linha da folha e o título do salário no Contas a Pagar.

// Ao regravar a linha: o título recém-criado tem prioridade, e um id de título que não existe mais nunca é mantido.
export function tituloDaLinha(anterior: string | null | undefined, novo: string | null | undefined, existentes: { has(id: string): boolean }): string | null {
  if (novo) return novo;
  return anterior && existentes.has(anterior) ? anterior : null;
}

// Situação da folha fechada conforme os títulos: "Pago" só quando todos os salários estão baixados.
export function rotuloPagamentoFolha(total: number, pagos: number): { txt: string; quitada: boolean } {
  if (total > 0 && pagos >= total) return { txt: "Pago", quitada: true };
  return { txt: `Fechado · ${pagos} de ${total} pagos`, quitada: false };
}
