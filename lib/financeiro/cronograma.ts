/**
 * Repartição de JUROS × AMORTIZAÇÃO de um cronograma de pagamentos já conhecido (ex.: o da própria cédula).
 *
 * A cédula traz a prestação de cada vencimento; o que o sistema precisa é separar, em cada prestação, quanto é
 * juro (despesa financeira) e quanto é principal (baixa da dívida). Descobre-se a taxa por período implícita que
 * zera o saldo no último pagamento (como a TIR de um financiamento) e aplica-se parcela a parcela:
 *   juros_k = saldo_{k-1} × taxa;   amortização_k = prestação_k − juros_k;   saldo_k = saldo_{k-1} − amortização_k.
 * Serve para Price, SAC, SACRE ou qualquer sequência de prestações. Se a soma das prestações não passa do principal
 * (sem juros), tudo é amortização.
 */
export type LinhaCronograma = { juros: number; amortizacao: number; saldo: number };

const r2 = (n: number) => Math.round(n * 100) / 100;

function saldoFinal(principal: number, valores: number[], taxa: number): number {
  let s = principal;
  for (const v of valores) s = s * (1 + taxa) - v;
  return s;
}

export function repartirCronograma(principal: number, valores: number[]): { taxaPeriodo: number; linhas: LinhaCronograma[] } {
  const pg = valores.map(v => Math.max(0, Number(v) || 0));
  const total = pg.reduce((s, v) => s + v, 0);
  if (!(principal > 0) || pg.length === 0 || total <= principal + 0.005) {
    // sem juros embutidos: tudo é principal
    let saldo = principal;
    return { taxaPeriodo: 0, linhas: pg.map(v => { saldo = Math.max(0, r2(saldo - v)); return { juros: 0, amortizacao: v, saldo }; }) };
  }
  // saldoFinal cresce com a taxa; em 0 é negativo (total > principal). Acha o zero por bisseção.
  let lo = 0, hi = 1;
  while (saldoFinal(principal, pg, hi) < 0 && hi < 1000) hi *= 2;
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    if (saldoFinal(principal, pg, mid) < 0) lo = mid; else hi = mid;
  }
  const taxa = (lo + hi) / 2;
  const linhas: LinhaCronograma[] = [];
  let saldo = principal;
  pg.forEach((v, i) => {
    const ultima = i === pg.length - 1;
    let juros = r2(saldo * taxa);
    let amort = r2(v - juros);
    if (amort < 0) { amort = 0; juros = r2(v); }          // prestação menor que o juro do período (capitalização)
    if (ultima) { amort = r2(saldo); juros = r2(v - amort); } // a última fecha o saldo (absorve o arredondamento)
    saldo = Math.max(0, r2(saldo - amort));
    linhas.push({ juros, amortizacao: amort, saldo });
  });
  return { taxaPeriodo: taxa, linhas };
}
