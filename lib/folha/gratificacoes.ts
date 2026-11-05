/** O que já foi abatido do título separado da gratificação não é descontado novamente no salário. */
export function descontoNoSalario(a: { valor?: number | null; descontado_gratificacao_cp?: number | null }): number {
  return Math.max(0, Math.round((Number(a.valor ?? 0) - Number(a.descontado_gratificacao_cp ?? 0)) * 100) / 100);
}
