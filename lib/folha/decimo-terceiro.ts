// 13º salário (gratificação natalina) — cálculo do controle e das parcelas.
//  - Avos: 1/12 por mês do ano em que o funcionário trabalhou 15 dias ou mais (admissão/demissão no meio do mês).
//  - Bruto = base ÷ 12 × avos. Base = salário da carteira (o usuário pode ajustar, ex.: média de variáveis).
//  - 1ª parcela (até 30/11): % escolhido do bruto (padrão e mínimo legal 50%), sem descontos; nunca acima de bruto − INSS − IRRF.
//  - 2ª parcela (até 20/12): bruto − INSS − IRRF − 1ª parcela. Os impostos incidem sobre o 13º da base sem o complemento salarial.
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

/** Mínimo legal da 1ª parcela: metade (Lei 4.749/65, art. 2º). Pagar mais na 1ª é permitido. */
export const PCT_PRIMEIRA_MINIMO = 50;

export type CalculoDecimo = {
  bruto: number; brutoTributavel: number; parcela1: number; inss: number; irrf: number; parcela2: number;
  /** % da 1ª parcela efetivamente aplicado (pode ficar abaixo do pedido quando bate no teto). */
  pct1: number;
  /** Teto da 1ª: bruto − INSS − IRRF. Acima disso a 2ª não teria de onde descontar os impostos. */
  teto1: number;
  /** true quando o % pedido passou do teto e a 1ª foi limitada a ele. */
  limitada: boolean;
};

/** Valor da 1ª parcela pelo % escolhido, limitado ao teto (bruto − INSS − IRRF). */
export function valorPrimeira(bruto: number, inss: number, irrf: number, pct = PCT_PRIMEIRA_MINIMO): { valor: number; teto: number; limitada: boolean } {
  const p = Math.max(0, Math.min(100, Number.isFinite(pct) ? pct : PCT_PRIMEIRA_MINIMO));
  const teto = Math.max(0, r2(bruto - inss - irrf));
  const pedido = r2(bruto * p / 100);
  return pedido > teto ? { valor: teto, teto, limitada: true } : { valor: pedido, teto, limitada: false };
}

/**
 * `complemento`: parte da base que entra no 13º a pagar, mas não no cálculo de INSS e IRRF.
 * `pct1`: % do 13º bruto pago na 1ª parcela (padrão 50%). Os descontos ficam todos na 2ª, como manda a lei.
 */
export function calcularDecimo(base: number, avos: number, complemento = 0, pct1 = PCT_PRIMEIRA_MINIMO): CalculoDecimo {
  const fracao = Math.max(0, Math.min(12, avos)) / 12;
  const bruto = r2(Math.max(0, base) * fracao);
  const brutoTributavel = r2(Math.max(0, base - Math.max(0, complemento)) * fracao);
  const inss = calcINSS(brutoTributavel);
  const irrf = calcIRRF(brutoTributavel, inss);
  const p1 = valorPrimeira(bruto, inss, irrf, pct1);
  const pct = bruto > 0 ? r2(p1.valor / bruto * 100) : Math.max(0, Math.min(100, pct1));
  return { bruto, brutoTributavel, parcela1: p1.valor, inss, irrf, parcela2: Math.max(0, r2(bruto - inss - irrf - p1.valor)), pct1: pct, teto1: p1.teto, limitada: p1.limitada };
}
