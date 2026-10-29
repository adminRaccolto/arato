// Liberação de financiamento DIRETO AO FORNECEDOR (29/10/2026): o banco paga o fornecedor e o dinheiro não passa pela
// conta do produtor. O(s) CP(s) da compra são quitados "pelo financiamento" (sem caixa, na conta transitória) e nasce a
// captação do contrato no mesmo valor. Regras puras de quanto cada CP recebe e como ele volta no estorno.

export type CpQuitavel = { id: string; valor: number; valor_pago: number | null; status: string; data_vencimento: string };

const r2 = (n: number) => Math.round(n * 100) / 100;
export const saldoCp = (cp: CpQuitavel) => r2(Number(cp.valor) - Number(cp.valor_pago ?? 0));

/** Situação do CP depois de receber `valor` do financiamento. Erro se passa do saldo. */
export function quitarCp(cp: CpQuitavel, valor: number): { valor_pago: number; status: "baixado" | "parcial" } | { erro: string } {
  const v = r2(valor);
  if (!(v > 0)) return { erro: "Valor a quitar precisa ser maior que zero." };
  if (v > saldoCp(cp) + 0.01) return { erro: `Valor maior que o saldo do título (${saldoCp(cp).toFixed(2)}).` };
  const pago = r2(Number(cp.valor_pago ?? 0) + v);
  return { valor_pago: pago, status: pago >= Number(cp.valor) - 0.01 ? "baixado" : "parcial" };
}

/** Situação do CP ao desfazer a quitação de `valor` (estorno da liberação). */
export function desfazerQuitacao(cp: CpQuitavel, valor: number, hoje: string): { valor_pago: number | null; status: string; data_baixa_nula: boolean } {
  const pago = Math.max(0, r2(Number(cp.valor_pago ?? 0) - valor));
  if (pago > 0.005) return { valor_pago: pago, status: "parcial", data_baixa_nula: false };
  return { valor_pago: null, status: cp.data_vencimento < hoje ? "vencido" : "em_aberto", data_baixa_nula: true };
}
