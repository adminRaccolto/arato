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
export function calcIRRF(bruto: number, inss: number): number {
  const base = bruto - inss;
  const faixas = [
    { lim: 2259.20, a: 0,     ded: 0       },
    { lim: 2826.65, a: 0.075, ded: 169.44  },
    { lim: 3751.05, a: 0.15,  ded: 381.44  },
    { lim: 4664.68, a: 0.225, ded: 662.77  },
    { lim: Infinity,a: 0.275, ded: 896.00  },
  ];
  for (const f of faixas) {
    if (base <= f.lim) return Math.max(0, Math.round((base * f.a - f.ded) * 100) / 100);
  }
  return 0;
}

// Líquido do holerite: bruto − INSS − IRRF (estimativa; o valor pode ser corrigido na tela)
export function liquidoCarteira(bruto: number): number {
  if (!(bruto > 0)) return 0;
  const inss = calcINSS(bruto);
  return Math.round((bruto - inss - calcIRRF(bruto, inss)) * 100) / 100;
}
