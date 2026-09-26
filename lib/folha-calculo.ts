// Cálculos de folha do empregado (mesma tabela usada na Folha de Pagamento).
export function calcINSS(bruto: number): number {
  const faixas = [
    { limite: 1518.00, a: 0.075 },
    { limite: 2793.88, a: 0.09  },
    { limite: 4190.83, a: 0.12  },
    { limite: 8157.41, a: 0.14  },
  ];
  let inss = 0, anterior = 0;
  for (const f of faixas) {
    if (bruto <= anterior) break;
    inss += (Math.min(bruto, f.limite) - anterior) * f.a;
    anterior = f.limite;
    if (bruto <= f.limite) break;
  }
  return Math.round(inss * 100) / 100;
}
// IRRF mensal (regra vigente desde jan/2026, Lei 15.270/2025): isenção total para rendimento tributável
// até R$ 5.000,00; redutor decrescente entre R$ 5.000,01 e R$ 7.350,00; acima disso, tabela progressiva
// normal. A base é o bruto menos o maior entre o INSS e o desconto simplificado (R$ 607,20).
export function calcIRRF(bruto: number, inss: number): number {
  if (bruto <= 5000) return 0;
  const base = bruto - Math.max(inss, 607.20);
  const faixas = [
    { lim: 2428.80, a: 0,     ded: 0      },
    { lim: 2826.65, a: 0.075, ded: 182.16 },
    { lim: 3751.05, a: 0.15,  ded: 394.16 },
    { lim: 4664.68, a: 0.225, ded: 675.49 },
    { lim: Infinity, a: 0.275, ded: 908.73 },
  ];
  const f = faixas.find(x => base <= x.lim)!;
  let imposto = Math.max(0, base * f.a - f.ded);
  if (bruto <= 7350) imposto = Math.max(0, imposto - (978.62 - 0.133145 * bruto));
  return Math.round(imposto * 100) / 100;
}
// Líquido do holerite: bruto − INSS − IRRF (estimativa; o valor pode ser corrigido na tela)
export function liquidoCarteira(bruto: number): number {
  if (!(bruto > 0)) return 0;
  const inss = calcINSS(bruto);
  return Math.round((bruto - inss - calcIRRF(bruto, inss)) * 100) / 100;
}
