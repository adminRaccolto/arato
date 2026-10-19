/**
 * IOF/tarifas FINANCIADOS numa cédula: valor contratado = valor liberado (depositado) + despesas embutidas.
 * Ex.: CCB Sicoob 826134 — contratado 206.972,70 = liberado 200.000,00 + IOF 6.972,70.
 * Se a cédula não detalha a despesa, a diferença entre contratado e liberado é tratada como despesa financiada:
 * IOF quando a cédula informa IOF %, tarifas caso contrário.
 */
export type EntradaDespesas = {
  valor_financiado?: number | null; valor_liberado?: number | null;
  valor_iof?: number | null; valor_tarifas?: number | null; iof_pct?: number | null;
};
const r2 = (n: number) => Math.round(n * 100) / 100;

export function derivarDespesasFinanciadas(d: EntradaDespesas): { iof: number; tarifas: number; liberadoLiquido: number } {
  const vf = Number(d.valor_financiado) || 0;
  let iof = Number(d.valor_iof) || 0;
  let tarifas = Number(d.valor_tarifas) || 0;
  const lib = d.valor_liberado != null ? Number(d.valor_liberado) : null;
  if (lib != null && vf > lib + 0.009 && iof + tarifas < 0.01) {
    const dif = r2(vf - lib);
    if (d.iof_pct) iof = dif; else tarifas = dif;
  }
  const liberadoLiquido = lib != null ? lib : (vf > 0 ? r2(vf - iof - tarifas) : 0);
  return { iof: r2(iof), tarifas: r2(tarifas), liberadoLiquido: r2(liberadoLiquido) };
}
