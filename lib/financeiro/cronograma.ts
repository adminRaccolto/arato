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
export type LinhaCronograma = { juros: number; amortizacao: number; saldo: number; juros_capitalizado?: number; juros_cap_pago?: number };

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
    let cap = 0;
    // prestação menor que o juro do período: o que falta capitaliza (soma ao saldo; não é pago agora)
    if (amort < 0) { cap = r2(-amort); amort = 0; juros = r2(v); }
    if (ultima) { amort = r2(saldo); juros = r2(v - amort); cap = 0; } // a última fecha o saldo (absorve o arredondamento)
    saldo = Math.max(0, r2(saldo + cap - amort));
    linhas.push({ juros, amortizacao: amort, saldo, juros_capitalizado: cap });
  });
  return { taxaPeriodo: taxa, linhas: separarCapitalizado(linhas) };
}

/**
 * Juros capitalizados (carência total, 29/10/2026): o juro do período sem pagamento vai para `juros_capitalizado` e
 * soma ao saldo, mas não é amortização. Quando as parcelas depois pagam esse saldo maior, a parte que quita juro
 * capitalizado sai da amortização e entra em `juros` (marcada em `juros_cap_pago`), proporcional à amortização de
 * cada parcela. Assim a soma das amortizações = principal e a soma de `juros` = todo o juro pago — o CP e a DRE
 * mostram o custo financeiro real. A última parcela absorve o arredondamento.
 */
export function separarCapitalizado<T extends { amortizacao: number; juros: number; juros_capitalizado?: number; juros_cap_pago?: number }>(ps: T[]): T[] {
  const totalCap = r2(ps.reduce((t, p) => t + (Number(p.juros_capitalizado) || 0), 0));
  if (totalCap <= 0) return ps.map(p => ({ ...p, juros_capitalizado: Number(p.juros_capitalizado) || 0, juros_cap_pago: Number(p.juros_cap_pago) || 0 }));
  const somaAmort = ps.reduce((t, p) => t + (Number(p.amortizacao) || 0), 0);
  if (somaAmort <= 0) return ps;
  const fr = Math.min(1, totalCap / somaAmort);
  let distribuido = 0;
  const idxUltima = ps.map((p, i) => (Number(p.amortizacao) > 0 ? i : -1)).filter(i => i >= 0).pop() ?? -1;
  return ps.map((p, i) => {
    const a = Number(p.amortizacao) || 0;
    if (a <= 0) return { ...p, juros_cap_pago: 0 };
    const cp = i === idxUltima ? r2(totalCap - distribuido) : r2(a * fr);
    distribuido = r2(distribuido + cp);
    return { ...p, amortizacao: r2(a - cp), juros: r2((Number(p.juros) || 0) + cp), juros_cap_pago: cp };
  });
}

/**
 * Juros pagos com mais frequência que a amortização (30/10/2026): ex. amortização anual e juros semestrais — uma
 * parcela só de juros no meio do período e outra de juros + capital no fim. Recebe o cronograma por período de
 * amortização (sem datas) e intercala as parcelas de juros: em cada período, k = mesesAmort ÷ mesesJuros parcelas;
 * as k−1 primeiras pagam só o juro do sub-período sobre o saldo, a última paga o juro do sub-período + a amortização.
 * O juro de cada sub-período é o saldo × taxa composta do sub-período (pago, não capitaliza). Parcelas de carência que
 * capitalizam (sem pagamento) ficam inteiras. `dataPrimeiro` é a data do 1º PAGAMENTO (a 1ª parcela de juros).
 */
type LinhaPeriodo = { num_parcela: number; data_vencimento: string; amortizacao: number; juros: number; valor_parcela: number; saldo_devedor: number; juros_capitalizado?: number; despesas_acessorios?: number };
const somarMesesIso = (iso: string, meses: number) => {
  const d = new Date(`${iso}T12:00:00`);
  d.setMonth(d.getMonth() + meses);
  return d.toISOString().slice(0, 10);
};
export function intercalarJuros<T extends LinhaPeriodo>(base: T[], o: { taxaMensal: number; mesesAmort: number; mesesJuros: number; dataPrimeiro: string }): T[] {
  const k = o.mesesAmort / o.mesesJuros;
  if (!(o.mesesJuros > 0) || !Number.isInteger(k) || k <= 1) throw new Error("A periodicidade dos juros precisa dividir a da amortização (ex.: juros semestrais com amortização anual).");
  const iSub = Math.pow(1 + o.taxaMensal, o.mesesJuros) - 1;
  const capitaliza = (p: T) => (Number(p.valor_parcela) || 0) === 0 && (Number(p.juros_capitalizado) || 0) > 0;
  const nCap = base.findIndex(p => !capitaliza(p)) < 0 ? base.length : base.findIndex(p => !capitaliza(p));
  const out: T[] = [];
  base.forEach((p, r) => {
    // carência que capitaliza: fecha nos aniversários da amortização, antes do 1º período pago
    if (capitaliza(p)) { out.push({ ...p, data_vencimento: somarMesesIso(o.dataPrimeiro, (k - 1) * o.mesesJuros - (nCap - r) * o.mesesAmort) }); return; }
    const saldoAntes = (Number(p.saldo_devedor) || 0) + (Number(p.amortizacao) || 0);
    const dataAmort = somarMesesIso(o.dataPrimeiro, (k - 1) * o.mesesJuros + (r - nCap) * o.mesesAmort);
    for (let j = 1; j <= k; j++) {
      const juros = saldoAntes * iSub;
      const ultima = j === k;
      const amort = ultima ? Number(p.amortizacao) || 0 : 0;
      out.push({
        ...p, juros, amortizacao: amort, valor_parcela: juros + amort,
        saldo_devedor: ultima ? Number(p.saldo_devedor) || 0 : saldoAntes, juros_capitalizado: 0,
        data_vencimento: somarMesesIso(dataAmort, -(k - j) * o.mesesJuros),
      });
    }
  });
  return out.map((p, i) => ({ ...p, num_parcela: i + 1 }));
}
