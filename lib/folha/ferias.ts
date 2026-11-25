const r2 = (v: number) => Math.round((v + Number.EPSILON) * 100) / 100;
export const DIAS_DIREITO_FERIAS = [30, 24, 18, 12] as const;
export const limiteAbonoFerias = (diasDireito: number) => Math.floor(diasDireito / 3);

export function dataFerias(data: string, deslocamento: number) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) return "";
  const d = new Date(`${data}T12:00:00Z`);
  if (!Number.isFinite(d.getTime()) || d.toISOString().slice(0, 10) !== data) return "";
  d.setUTCDate(d.getUTCDate() + deslocamento);
  return d.toISOString().slice(0, 10);
}

export function calcularFerias(salario: number, diasGozo: number, abono: boolean, diasAbono: number) {
  const dia = salario / 30;
  const ferias = r2(dia * diasGozo), tercoFerias = r2(ferias / 3);
  const valAbono = abono ? r2(dia * diasAbono) : 0, tercoAbono = abono ? r2(valAbono / 3) : 0;
  return { ferias, tercoFerias, valAbono, tercoAbono, totalFerias: r2(ferias + tercoFerias),
    totalAbono: r2(valAbono + tercoAbono), total: r2(ferias + tercoFerias + valAbono + tercoAbono) };
}

export type ConcessaoFerias = {
  inicio: string; fim: string; dias: number; diasDireito?: number;
  abono: boolean; diasAbono: number; solicitacaoAbono?: string;
  valorFerias: number; valorAbono: number; dataPagamento: string;
};
/** Compartilhada pelo formulário e pela gravação, antes de criar qualquer CP. */
export function validarConcessaoFerias(p: ConcessaoFerias, salario: number): string | null {
  const direito = p.diasDireito ?? 30;
  if (!DIAS_DIREITO_FERIAS.some(n => n === direito)) return "Selecione os dias de direito do período: 30, 24, 18 ou 12.";
  if (!Number.isFinite(salario) || salario <= 0) return "Informe o salário de referência no cadastro do funcionário.";
  if (!Number.isInteger(p.dias) || p.dias < 1 || p.dias > direito) return `Informe dias de descanso inteiros entre 1 e ${direito}.`;
  if (p.abono && (!Number.isInteger(p.diasAbono) || p.diasAbono < 1 || p.diasAbono > limiteAbonoFerias(direito))) {
    return `A venda deve ser de 1 a ${limiteAbonoFerias(direito)} dias (um terço dos ${direito} dias de direito).`;
  }
  if (p.dias + (p.abono ? p.diasAbono : 0) > direito) return `Descanso e dias vendidos não podem ultrapassar ${direito} dias.`;
  if (!dataFerias(p.inicio, 0)) return "Informe uma data válida para o início das férias.";
  if (p.fim !== dataFerias(p.inicio, p.dias - 1)) return "O fim das férias deve corresponder aos dias de descanso.";
  if (!dataFerias(p.dataPagamento, 0)) return "Informe uma data válida para o pagamento.";
  if (p.abono && p.solicitacaoAbono && !dataFerias(p.solicitacaoAbono, 0)) return "Informe uma data válida para a solicitação da venda de dias.";
  if (!Number.isFinite(p.valorFerias) || p.valorFerias <= 0 || !Number.isFinite(p.valorAbono) || p.valorAbono < 0
      || (p.abono && p.valorAbono <= 0)) return "Informe valores válidos e positivos para as férias e, quando houver venda, para o abono.";
  return null;
}
