// Definição dos planos SaaS do Arato
// Fonte de verdade: tabela `planos` no Supabase (editável pelo admin)
// Este arquivo contém os defaults e helpers de feature flags.

export type PlanoId = "essencial" | "gestao" | "performance";

export interface Plano {
  id: PlanoId;
  nome: string;
  descricao: string;
  preco_mensal: number;
  trial_dias: number;
  limite_usuarios: number | null;
  destaque: boolean;
  modulos: string[];
  features_marketing: string[];
}

// Defaults locais (fallback enquanto o DB não carregar)
export const PLANOS_DEFAULT: Record<PlanoId, Plano> = {
  essencial: {
    id: "essencial",
    nome: "Essencial",
    descricao: "Para quem está começando a digitalizar a fazenda",
    preco_mensal: 387,
    trial_dias: 14,
    limite_usuarios: 2,
    destaque: false,
    modulos: [
      "cadastros","propriedades",
      "lavoura_plantio","lavoura_pulv","lavoura_colheita","lavoura_plan",
      "estoque","fin_pagar","fin_receber","custos","fin_relatorios","configuracoes",
    ],
    features_marketing: [
      "Cadastros completos (fazendas, talhões, insumos)",
      "Lavoura completa (plantio, pulverização, colheita)",
      "Estoque básico",
      "Contas a Pagar e Receber",
      "DRE Agrícola",
      "Relatório de Aplicações",
      "2 usuários",
      "Suporte por e-mail",
    ],
  },
  gestao: {
    id: "gestao",
    nome: "Gestão",
    descricao: "Para quem vende grãos e controla o financeiro completo",
    preco_mensal: 1197,
    trial_dias: 14,
    limite_usuarios: 5,
    destaque: true,
    modulos: [
      "cadastros","propriedades",
      "lavoura_plantio","lavoura_pulv","lavoura_colheita","lavoura_plan",
      "estoque","fin_pagar","fin_receber","custos","fin_relatorios","configuracoes",
      "contratos","expedicao","arrendamento",
      "compras","nf_entrada","nf_servico",
      "fin_contratos","fin_tesouraria","fin_seguros",
      "transporte","usuarios",
    ],
    features_marketing: [
      "Tudo do Essencial",
      "Comercialização de Grãos (contratos + expedição)",
      "Compras e Pedidos",
      "NF de Entrada (Produtos e Serviços)",
      "Financeiro completo (tesouraria, seguros)",
      "Contratos de Arrendamento",
      "CT-e e MDF-e",
      "5 usuários",
      "Suporte prioritário",
    ],
  },
  performance: {
    id: "performance",
    nome: "Performance",
    descricao: "Para grandes operações com controle fiscal e BI avançado",
    preco_mensal: 1787,
    trial_dias: 14,
    limite_usuarios: null,
    destaque: false,
    modulos: [
      "cadastros","propriedades",
      "lavoura_plantio","lavoura_pulv","lavoura_colheita","lavoura_plan",
      "estoque","fin_pagar","fin_receber","custos","fin_relatorios","configuracoes",
      "contratos","expedicao","arrendamento",
      "compras","nf_entrada","nf_servico",
      "fin_contratos","fin_tesouraria","fin_seguros",
      "transporte","usuarios",
      "fiscal_nfe","fiscal_sped","bi",
    ],
    features_marketing: [
      "Tudo do Gestão",
      "Emissão de NF-e (integração SEFAZ)",
      "SPED ECD e LCDPR",
      "eSocial Rural",
      "BI — Raccotlo Intelligence",
      "Usuários ilimitados",
      "Suporte prioritário + WhatsApp",
    ],
  },
};

export function planoInclui(planoId: PlanoId | null | undefined, modulo: string): boolean {
  if (!planoId) return false;
  return PLANOS_DEFAULT[planoId]?.modulos.includes(modulo) ?? false;
}

export function fmtPreco(v: number): string {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

