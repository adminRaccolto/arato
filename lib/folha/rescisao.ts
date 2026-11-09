// Rescisão — impostos, complemento e descontos automáticos (regras puras, sem banco).
//
// Decisão do dono (09/11/2026): verbas e impostos sobre o SALÁRIO BASE; o complemento salarial entra só no valor pago,
// numa linha própria, sem impostos. Incidência padrão:
//  - INSS: saldo de salário; 13º em cálculo separado. Aviso indenizado e férias indenizadas não têm INSS.
//  - IRRF: saldo de salário (menos o INSS dele); 13º em cálculo separado. Aviso e férias indenizadas são isentos.
//  - FGTS do mês da rescisão: 8% sobre saldo de salário, aviso prévio indenizado e 13º.
// Tudo é sugestão: a tela permite editar cada linha.
import { calcINSS, calcIRRF } from "../folha-calculo.ts";

export type Verba = { codigo: string; descricao: string; valor: number; tipo: "provento" | "desconto"; nota?: string };

const r2 = (n: number) => Math.round(n * 100) / 100;
const valorDe = (verbas: Verba[], codigo: string) => verbas.filter(v => v.codigo === codigo).reduce((s, v) => s + v.valor, 0);

/** Impostos das verbas calculadas sobre o salário base. */
export function impostosRescisao(verbasBase: Verba[]) {
  const saldo = valorDe(verbasBase, "saldo"), decimo = valorDe(verbasBase, "13"), aviso = valorDe(verbasBase, "aviso");
  const inssSaldo = calcINSS(saldo), inss13 = calcINSS(decimo);
  return {
    inssSaldo, irrfSaldo: calcIRRF(saldo, inssSaldo),
    inss13, irrf13: calcIRRF(decimo, inss13),
    baseFgts: r2(saldo + aviso + decimo), fgtsMes: r2((saldo + aviso + decimo) * 0.08),
  };
}

/** Complemento salarial a pagar: a mesma rescisão calculada sobre o complemento (só proventos), sem impostos. */
export function valorComplemento(verbasDoComplemento: Verba[]) {
  return r2(verbasDoComplemento.filter(v => v.tipo === "provento").reduce((s, v) => s + v.valor, 0));
}

/** 13º já lançado no ano do desligamento (1ª e, se houver, 2ª parcela): sai da rescisão. */
export function decimoJaPago(reg: { parcela1_valor?: number | null; parcela1_lancamento_id?: string | null; parcela2_valor?: number | null; parcela2_lancamento_id?: string | null } | null | undefined) {
  if (!reg) return 0;
  return r2((reg.parcela1_lancamento_id ? Number(reg.parcela1_valor ?? 0) : 0) + (reg.parcela2_lancamento_id ? Number(reg.parcela2_valor ?? 0) : 0));
}

/** Linhas de desconto e de complemento que entram depois das verbas do salário base. */
export function linhasAutomaticas(p: { complemento: number; impostos: ReturnType<typeof impostosRescisao>; adiantamentos: number; decimoPago: number }): Verba[] {
  const l: Verba[] = [];
  if (p.complemento > 0) l.push({ codigo: "complemento", descricao: "Complemento salarial (sobre saldo, aviso, 13º e férias)", valor: p.complemento, tipo: "provento", nota: "Sem INSS, IRRF e FGTS" });
  if (p.impostos.inssSaldo > 0) l.push({ codigo: "inss_saldo", descricao: "INSS sobre saldo de salário", valor: p.impostos.inssSaldo, tipo: "desconto" });
  if (p.impostos.irrfSaldo > 0) l.push({ codigo: "irrf_saldo", descricao: "IRRF sobre saldo de salário", valor: p.impostos.irrfSaldo, tipo: "desconto" });
  if (p.impostos.inss13 > 0) l.push({ codigo: "inss_13", descricao: "INSS sobre 13º salário", valor: p.impostos.inss13, tipo: "desconto" });
  if (p.impostos.irrf13 > 0) l.push({ codigo: "irrf_13", descricao: "IRRF sobre 13º salário", valor: p.impostos.irrf13, tipo: "desconto" });
  if (p.decimoPago > 0) l.push({ codigo: "13_pago", descricao: "13º salário já pago no ano", valor: p.decimoPago, tipo: "desconto" });
  if (p.adiantamentos > 0) l.push({ codigo: "adiantamentos", descricao: "Adiantamentos pendentes", valor: p.adiantamentos, tipo: "desconto" });
  return l;
}

export function totaisRescisao(verbas: Verba[]) {
  const proventos = r2(verbas.filter(v => v.tipo === "provento").reduce((s, v) => s + v.valor, 0));
  const descontos = r2(verbas.filter(v => v.tipo === "desconto").reduce((s, v) => s + v.valor, 0));
  return { proventos, descontos, liquido: r2(proventos - descontos) };
}

/** Multa rescisória: percentual sobre o saldo do FGTS somado ao FGTS do mês da rescisão. */
export const multaFgts = (saldoFgts: number, fgtsMes: number, pct: number) => r2((Math.max(0, saldoFgts) + Math.max(0, fgtsMes)) * pct);
