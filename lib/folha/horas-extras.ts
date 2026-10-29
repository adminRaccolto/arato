// Horas extras na folha (29/10/2026). Por funcionário e competência:
//  - valor da hora = salário base (carteira) ÷ jornada mensal (220 h, padrão CLT / trabalhador rural 44 h semanais)
//  - HE 50% = horas × valor da hora × 1,5   ·   HE 100% (domingos/feriados) = horas × valor da hora × 2
//  - DSR sobre horas extras (Súmula 172 TST, vale para o rural) = total das HE ÷ dias úteis × (domingos + feriados)
// Dias úteis = segunda a sábado que não são feriado nacional. As HE e o DSR entram no salário bruto e sofrem
// INSS, IRRF, FGTS e INSS patronal como o salário.

export const JORNADA_MENSAL_PADRAO = 220;

const r2 = (n: number) => Math.round(n * 100) / 100;

/** Domingo de Páscoa (algoritmo de Meeus/Butcher). */
function pascoa(ano: number): Date {
  const a = ano % 19, b = Math.floor(ano / 100), c = ano % 100, d = Math.floor(b / 4), e = b % 4;
  const f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mes = Math.floor((h + l - 7 * m + 114) / 31), dia = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(ano, mes - 1, dia));
}

/** Feriados nacionais do ano (AAAA-MM-DD): fixos + Sexta-feira Santa. */
export function feriadosNacionais(ano: number): Set<string> {
  const fixos = ["01-01", "04-21", "05-01", "09-07", "10-12", "11-02", "11-15", "11-20", "12-25"].map(d => `${ano}-${d}`);
  const sexta = pascoa(ano); sexta.setUTCDate(sexta.getUTCDate() - 2);
  return new Set([...fixos, sexta.toISOString().slice(0, 10)]);
}

/** Dias úteis (seg–sáb, fora feriado) e domingos + feriados da competência "AAAA-MM". */
export function diasDaCompetencia(competencia: string): { uteis: number; descanso: number } {
  const [ano, mes] = competencia.split("-").map(Number);
  if (!ano || !mes) return { uteis: 0, descanso: 0 };
  const fer = feriadosNacionais(ano);
  let uteis = 0, descanso = 0;
  const dias = new Date(Date.UTC(ano, mes, 0)).getUTCDate();
  for (let d = 1; d <= dias; d++) {
    const dt = new Date(Date.UTC(ano, mes - 1, d));
    const iso = dt.toISOString().slice(0, 10);
    if (dt.getUTCDay() === 0 || fer.has(iso)) descanso++; else uteis++;
  }
  return { uteis, descanso };
}

export type CalculoHE = { valor_hora: number; valor_50: number; valor_100: number; he_valor: number; he_dsr: number };

export function calcularHorasExtras(p: { salario_base: number; horas_50?: number | null; horas_100?: number | null; competencia: string; jornada?: number | null }): CalculoHE {
  const jornada = Number(p.jornada) > 0 ? Number(p.jornada) : JORNADA_MENSAL_PADRAO;
  const vh = Math.max(0, Number(p.salario_base) || 0) / jornada;
  const v50 = r2(Math.max(0, Number(p.horas_50) || 0) * vh * 1.5);
  const v100 = r2(Math.max(0, Number(p.horas_100) || 0) * vh * 2);
  const he = r2(v50 + v100);
  const { uteis, descanso } = diasDaCompetencia(p.competencia);
  const dsr = he > 0 && uteis > 0 ? r2(he / uteis * descanso) : 0;
  return { valor_hora: r2(vh), valor_50: v50, valor_100: v100, he_valor: he, he_dsr: dsr };
}
