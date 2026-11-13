/** Saldo de abertura separado dos movimentos do período. Desligado, o fluxo parte de zero. */
export function saldoInicialFluxo(considerar: boolean, saldoContas: number, crAtrasados = 0, cpAtrasados = 0): number {
  return considerar ? Math.round((saldoContas + crAtrasados - cpAtrasados + Number.EPSILON) * 100) / 100 : 0;
}
