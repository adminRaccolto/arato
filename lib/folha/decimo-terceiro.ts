// 13º salário (gratificação natalina) — cálculo do controle e das parcelas.
//  - Avos: 1/12 por mês do ano em que o funcionário trabalhou 15 dias ou mais (admissão/demissão no meio do mês).
//  - Bruto = base ÷ 12 × avos. Base = salário da carteira (o usuário pode ajustar, ex.: média de variáveis).
//  - 1ª parcela (até 30/11): metade do bruto, sem descontos.
//  - 2ª parcela (até 20/12): bruto − INSS − IRRF (calculados sobre o 13º inteiro) − 1ª parcela.
// INSS e IRRF usam as mesmas tabelas da folha (lib/folha-calculo) — estimativa, que pode ser corrigida na tela.
import { calcINSS, calcIRRF } from "../folha-calculo.ts";

const r2 = (n: number) => Math.round(n * 100) / 100;

/** Avos do 13º no ano: meses com 15 dias ou mais trabalhados entre a admissão e a demissão (ou 31/12). */
export function avosDecimo(admissao: string | null | undefined, demissao: string | null | undefined, ano: number): number {
  const inicioAno = new Date(Date.UTC(ano, 0, 1)), fimAno = new Date(Date.UTC(ano, 11, 31));
  const adm = admissao ? new Date(admissao + "T00:00:00Z") : inicioAno;
  const dem = demissao ? new Date(demissao + "T00:00:00Z") : fimAno;
  const ini = adm > inicioAno ? adm : inicioAno, fim = dem < fimAno ? dem : fimAno;
  if (fim < ini) return 0;
  let avos = 0;
  for (let m = 0; m < 12; m++) {
    const primeiro = new Date(Date.UTC(ano, m, 1)), ultimo = new Date(Date.UTC(ano, m + 1, 0));
    const a = ini > primeiro ? ini : primeiro, b = fim < ultimo ? fim : ultimo;
    if (b < a) continue;
    const dias = Math.round((b.getTime() - a.getTime()) / 86_400_000) + 1;
    if (dias >= 15) avos++;
  }
  return avos;
}

export type CalculoDecimo = { bruto: number; parcela1: number; inss: number; irrf: number; parcela2: number };

export function calcularDecimo(base: number, avos: number): CalculoDecimo {
  const bruto = r2((Math.max(0, base) / 12) * Math.max(0, Math.min(12, avos)));
  const parcela1 = r2(bruto / 2);
  const inss = calcINSS(bruto);
  const irrf = calcIRRF(bruto, inss);
  return { bruto, parcela1, inss, irrf, parcela2: Math.max(0, r2(bruto - inss - irrf - parcela1)) };
}
