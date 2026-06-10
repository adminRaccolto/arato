import { supabase } from "./supabase";

export type OnboardingStep = {
  id: number;
  titulo: string;
  subtitulo: string;
  instrucoes: string[];
  path: string;
  pathLabel: string;
  minStep: number;
  /** Se true, só a equipe Raccolto pode marcar como concluído — sem botões para o cliente */
  apenasRaccolto?: boolean;
  check: (fazendaId: string, contaId: string) => Promise<boolean>;
};

export const ONBOARDING_STEPS: OnboardingStep[] = [
  {
    id: 1,
    titulo: "Liberação pela equipe Raccolto",
    subtitulo: "A equipe Raccolto verifica seus dados e libera o acesso completo ao sistema",
    instrucoes: [
      "Este passo é realizado pela equipe Raccolto — você não precisa fazer nada.",
      "Após a confirmação do seu cadastro, a equipe liberará sua conta e você poderá prosseguir com a configuração.",
      "Qualquer dúvida, entre em contato com seu consultor.",
    ],
    path: "",
    pathLabel: "",
    minStep: 1,
    apenasRaccolto: true,
    check: async (_fazendaId, contaId) => {
      const { data } = await supabase
        .from("contas")
        .select("liberado_raccolto")
        .eq("id", contaId)
        .maybeSingle();
      return !!(data as { liberado_raccolto?: boolean } | null)?.liberado_raccolto;
    },
  },
  {
    id: 2,
    titulo: "Cadastrar Talhões",
    subtitulo: "Divida sua fazenda em talhões — a unidade básica de plantio",
    instrucoes: [
      "Acesse Cadastros → Fazendas & Talhões no menu.",
      "Clique na sua fazenda para expandi-la e depois em '+ Novo Talhão'.",
      "Informe o nome do talhão (ex: T1, Talhão Norte), a área em hectares e o tipo de solo.",
      "Adicione as coordenadas GPS para georreferenciamento (opcional, mas recomendado).",
      "Cadastre todos os talhões da fazenda. Talhões são usados em plantio, pulverização, colheita e relatórios.",
    ],
    path: "/cadastros?tab=fazendas",
    pathLabel: "Ir para Fazendas & Talhões",
    minStep: 2,
    check: async (fazendaId) => {
      const { count } = await supabase
        .from("talhoes")
        .select("*", { count: "exact", head: true })
        .eq("fazenda_id", fazendaId);
      return (count ?? 0) >= 1;
    },
  },
  {
    id: 3,
    titulo: "Cadastrar Funcionários",
    subtitulo: "Registre quem executa as operações na propriedade",
    instrucoes: [
      "Acesse Cadastros → Funcionários.",
      "Clique em '+ Novo Funcionário' e preencha nome, CPF e função (ex: Operador, Tratorista, Agrônomo).",
      "Funcionários são vinculados às operações de lavoura (plantio, pulverização, colheita).",
      "Cadastre pelo menos o responsável principal pelas operações de campo.",
    ],
    path: "/cadastros?tab=funcionarios",
    pathLabel: "Ir para Funcionários",
    minStep: 3,
    check: async (fazendaId) => {
      const { count } = await supabase
        .from("funcionarios")
        .select("*", { count: "exact", head: true })
        .eq("fazenda_id", fazendaId);
      return (count ?? 0) >= 1;
    },
  },
  {
    id: 4,
    titulo: "Cadastrar Safra e Ciclo",
    subtitulo: "Defina o período agrícola e a cultura que será plantada",
    instrucoes: [
      "Acesse Cadastros → Safras.",
      "Crie um Ano Safra (ex: 2024/2025) — representa o período agrícola anual.",
      "Dentro do ano safra, crie um Ciclo informando a cultura (Soja, Milho, Algodão) e o talhão.",
      "Cada ciclo é uma cultura específica em um ano safra. Você pode ter vários ciclos por ano (ex: Soja 1ª + Milho 2ª safrinha).",
      "Os ciclos são usados em todas as operações: plantio, adubação, pulverização, colheita e relatórios de custo.",
    ],
    path: "/cadastros?tab=safras",
    pathLabel: "Ir para Safras & Ciclos",
    minStep: 4,
    check: async (fazendaId) => {
      const { count } = await supabase
        .from("ciclos")
        .select("*", { count: "exact", head: true })
        .eq("fazenda_id", fazendaId);
      return (count ?? 0) >= 1;
    },
  },
  {
    id: 5,
    titulo: "Cadastrar Pessoas",
    subtitulo: "Registre fornecedores, prestadores e parceiros da fazenda",
    instrucoes: [
      "Acesse Cadastros → Pessoas.",
      "Cadastre fornecedores de insumos, prestadores de serviço, transportadoras e arrendantes.",
      "Informe nome, CPF/CNPJ, e-mail e telefone. Adicione os dados bancários para facilitar os pagamentos.",
      "Pessoas são usadas em contas a pagar, pedidos de compra, contratos de arrendamento e emissão de NF-e.",
      "Cadastre pelo menos os fornecedores principais com quem você já trabalha.",
    ],
    path: "/cadastros?tab=pessoas",
    pathLabel: "Ir para Pessoas",
    minStep: 5,
    check: async (fazendaId) => {
      const { count } = await supabase
        .from("pessoas")
        .select("*", { count: "exact", head: true })
        .eq("fazenda_id", fazendaId);
      return (count ?? 0) >= 1;
    },
  },
  {
    id: 6,
    titulo: "Cadastrar Insumos",
    subtitulo: "Monte o catálogo de produtos que você usa na fazenda",
    instrucoes: [
      "Acesse Cadastros → Insumos.",
      "Cadastre sementes, fertilizantes, defensivos agrícolas e outros insumos.",
      "Informe nome, categoria, unidade de medida e custo médio por unidade.",
      "Insumos são usados nos pedidos de compra, operações de lavoura e controle de estoque.",
      "Você pode importar insumos via NF de Entrada mais tarde — os produtos serão adicionados automaticamente.",
    ],
    path: "/cadastros?tab=insumos",
    pathLabel: "Ir para Insumos",
    minStep: 6,
    check: async (fazendaId) => {
      const { count } = await supabase
        .from("insumos")
        .select("*", { count: "exact", head: true })
        .eq("fazenda_id", fazendaId);
      return (count ?? 0) >= 1;
    },
  },
  {
    id: 7,
    titulo: "Cadastrar Conta Bancária",
    subtitulo: "Vincule a conta bancária da fazenda para controlar o fluxo de caixa",
    instrucoes: [
      "Acesse Cadastros → Contas Bancárias.",
      "Informe banco, agência, número da conta e tipo (corrente, poupança, caixa).",
      "A conta bancária é usada para registrar pagamentos, recebimentos e para a conciliação bancária automática (importação OFX).",
      "Cadastre todas as contas que movimentam recursos da fazenda.",
    ],
    path: "/cadastros?tab=contas_bancarias",
    pathLabel: "Ir para Contas Bancárias",
    minStep: 7,
    check: async (fazendaId) => {
      const { count } = await supabase
        .from("contas_bancarias")
        .select("*", { count: "exact", head: true })
        .eq("fazenda_id", fazendaId);
      return (count ?? 0) >= 1;
    },
  },
  {
    id: 8,
    titulo: "Configurar Parâmetros Fiscais",
    subtitulo: "Prepare o sistema para emissão de NF-e e documentos fiscais",
    instrucoes: [
      "Acesse Configurações → Parâmetros do Sistema → aba Fiscal.",
      "Informe o CNPJ do emitente, Inscrição Estadual, Inscrição Municipal (se houver), UF e código IBGE do município.",
      "Defina o ambiente: Homologação para testes, Produção para notas reais.",
      "Configure o Regime Tributário (CRT): Simples Nacional, Lucro Presumido ou Lucro Real.",
      "O certificado digital A1 (.pfx) pode ser carregado aqui. O sistema avisa 30 dias antes do vencimento.",
      "Após configurar, você poderá emitir NF-e de venda, NF de remessa e CT-e diretamente pelo sistema.",
    ],
    path: "/configuracoes/modulos",
    pathLabel: "Ir para Parâmetros Fiscais",
    minStep: 8,
    check: async (fazendaId) => {
      const { data } = await supabase
        .from("configuracoes_modulo")
        .select("id")
        .eq("fazenda_id", fazendaId)
        .eq("modulo", "fiscal")
        .maybeSingle();
      return !!data;
    },
  },
];

export const TOTAL_STEPS = ONBOARDING_STEPS.length;

export async function calcularStepsCompletos(fazendaId: string, contaId: string): Promise<number> {
  let completos = 0;
  for (const step of ONBOARDING_STEPS) {
    const done = await step.check(fazendaId, contaId);
    if (done) completos++;
    else break;
  }
  return completos;
}
