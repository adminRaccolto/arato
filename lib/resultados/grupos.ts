// Classificação compartilhada pelos relatórios, sem dependência do banco.
export const DRE_GRUPOS: Record<
  string,
  { label: string; grupo: string; ordem: number }
> = {
  "1.01.01.01": {
    label: "Venda Produção Agrícola",
    grupo: "receita_bruta",
    ordem: 1,
  },
  "1.01.01.02": {
    label: "Venda Produção Pecuária",
    grupo: "receita_bruta",
    ordem: 2,
  },
  "1.01.01.03": { label: "Armazenagem", grupo: "receita_bruta", ordem: 3 },
  "1.01.02": {
    label: "Receitas Transportes",
    grupo: "receita_bruta",
    ordem: 4,
  },
  "1.02.01.01": { label: "Outras Receitas", grupo: "receita_nao_op", ordem: 5 },
  "1.02.01.02": {
    label: "Venda Imobilizado",
    grupo: "receita_nao_op",
    ordem: 6,
  },
  "1.03": {
    label: "Receitas Financeiras",
    grupo: "receita_financeira",
    ordem: 7,
  },
  "1.01.01.05": { label: "Deduções Receita", grupo: "deducoes", ordem: 10 },
  "2.01.01.01": { label: "Insumos", grupo: "cpv_insumos", ordem: 20 },
  "2.01.01.02": { label: "Combustíveis", grupo: "cpv_combustivel", ordem: 21 },
  "2.01.01.03": {
    label: "Manutenção e Reparos",
    grupo: "cpv_manutencao",
    ordem: 22,
  },
  "2.01.01.04": {
    label: "Despesas Agricultura",
    grupo: "cpv_agricultura",
    ordem: 23,
  },
  "2.01.01.05": {
    label: "Despesas Pecuárias",
    grupo: "cpv_pecuaria",
    ordem: 24,
  },
  "2.01.01.06": {
    label: "Produção de Sementes",
    grupo: "cpv_outros",
    ordem: 25,
  },
  "2.01.01.07": { label: "Fretes", grupo: "cpv_fretes", ordem: 26 },
  "2.01.01.08": {
    label: "Máq. Terceirizadas",
    grupo: "cpv_mecanizacao",
    ordem: 27,
  },
  "2.01.01.09": { label: "Adiantamentos", grupo: "cpv_outros", ordem: 28 },
  "2.01.01.10": { label: "RH Fazenda", grupo: "cpv_rh_faz", ordem: 29 },
  "2.01.02.01.01": { label: "Despesas Adm.", grupo: "desp_adm", ordem: 40 },
  "2.01.02.01.02": {
    label: "Serviços Terceiros",
    grupo: "desp_adm",
    ordem: 41,
  },
  "2.01.02.01.03": {
    label: "RH Administrativo",
    grupo: "desp_rh_adm",
    ordem: 42,
  },
  "2.01.02.01.04": {
    label: "Impostos e Taxas",
    grupo: "desp_impostos",
    ordem: 43,
  },
  "2.01.02.01.05": {
    label: "Frota de Veículos",
    grupo: "desp_frota",
    ordem: 44,
  },
  "2.01.02.01.06": {
    label: "Tecnologia da Informação",
    grupo: "desp_adm",
    ordem: 45,
  },
  "2.02.01.02": {
    label: "Financiamentos / Custeio",
    grupo: "juros_custeio",
    ordem: 50,
  },
  "2.02.01.03": {
    label: "Juros e Encargos",
    grupo: "desp_financeira",
    ordem: 51,
  },
  // Investimentos = CAPEX (ativação de ativo) — não entra no resultado do DRE
  "2.03.01": {
    label: "Investimentos (CAPEX)",
    grupo: "investimentos",
    ordem: 60,
  }, // excluído do DRE (ativo imobilizado)
  // Depreciação = despesa operacional — reduz EBITDA → EBIT
  "2.03.02": {
    label: "Depreciações e Perdas",
    grupo: "depreciacao",
    ordem: 48,
  }, // despesa operacional — antes das financeiras
  "2.03.03": { label: "Seguros", grupo: "desp_adm", ordem: 45 },
  // Juros sobre patrimônio = custo de oportunidade do capital imobilizado — despesa financeira
  "2.03.04": {
    label: "Juros sobre Patrimônio",
    grupo: "desp_financeira",
    ordem: 52,
  },
  // ── Classificações específicas com grupo próprio no DRE (mais específico que a entrada pai) ──
  "2.01.01.04.001": {
    label: "Arrendamento Agrícola",
    grupo: "arrendamento",
    ordem: 35,
  },
  "2.01.01.05.004": {
    label: "Arrendamento Pecuário",
    grupo: "arrendamento",
    ordem: 36,
  },
  "2.03.03.004": {
    label: "Seguro Agrícola (Lavoura)",
    grupo: "seguro_lavoura",
    ordem: 46,
  },
  "2.01.02.01.02.004": {
    label: "Assistência Técnica",
    grupo: "assistencia_tecnica",
    ordem: 47,
  },
};

// Retorna o grupo DRE de uma classificação (match por prefixo)
export function getDreGrupo(classificacao: string): string {
  // Tentar do mais específico ao mais geral
  const partes = classificacao.split(".");
  for (let n = partes.length; n >= 1; n--) {
    const prefix = partes.slice(0, n).join(".");
    if (DRE_GRUPOS[prefix]) return DRE_GRUPOS[prefix].grupo;
  }
  return "outros";
}
