/**
 * Catálogo da limpeza seletiva (Dados & Limpeza). Cada item lista as tabelas na ordem de apagar: filhas primeiro.
 * Quem resolve a linha de cada cliente é o banco (fn_limpar_dados): fazenda_id, conta_id ou a chave da tabela-mãe.
 * A tela e a rota usam este mesmo catálogo; a rota nunca aceita nome de tabela vindo do navegador.
 */

export type SubItemLimpeza = {
  id: string;
  label: string;
  icon: string;
  /** Tabela que dá o número mostrado ao lado do item. */
  contar: string;
  tabelas: string[];
  aviso?: string;
  /** Filtro adicional, como o tipo do item no cadastro de insumos. */
  filtro?: Record<string, string>;
};

export type GrupoLimpeza = { id: string; label: string; icon: string; cor: string; bg: string; subitens: SubItemLimpeza[] };

export const GRUPOS_LIMPEZA: GrupoLimpeza[] = [
  {
    id: "financeiro", label: "Financeiro", icon: "💰", cor: "#E24B4A", bg: "#FFF0F0",
    subitens: [
      { id: "lancamentos", label: "Lançamentos CP/CR do produtor", icon: "📄", contar: "lancamentos", tabelas: ["pagamento_lote_itens", "pagamento_lotes", "lancamentos"], aviso: "Faça antes de limpar contratos, folha e cartões, se eles também forem sair." },
      { id: "empresa_lancamentos", label: "Lançamentos CP/CR de Empresa", icon: "🏢", contar: "empresa_lancamentos", tabelas: ["empresa_lancamentos"] },
      { id: "extrato", label: "Extratos e conciliação bancária", icon: "🏦", contar: "extrato_transacoes", tabelas: ["conciliacao_pendencias", "historico_conciliacao", "extrato_transacoes", "extratos_bancarios"] },
      { id: "contratos_fin", label: "Contratos Financeiros", icon: "🏦", contar: "contratos_financeiros", tabelas: ["parcelas_pagamento", "parcelas_liberacao", "garantias_contrato", "aditivos_contrato", "contrato_cessao_debitos", "contratos_refinanciamento", "contratos_financeiros"] },
      { id: "mutuo", label: "Mútuos", icon: "↔️", contar: "mutuos", tabelas: ["pagamentos_mutuo", "mutuos"] },
      { id: "consorcios", label: "Consórcios", icon: "🎯", contar: "consorcios", tabelas: ["consorcio_lances", "parcelas_consorcio", "consorcios"] },
      { id: "seguros", label: "Apólices de Seguro", icon: "🛡️", contar: "apolices_seguro", tabelas: ["pagamentos_premio_seguro", "sinistros_seguro", "apolices_seguro"] },
      { id: "taxas", label: "Taxas Bancárias", icon: "🏛️", contar: "taxas_bancarias", tabelas: ["taxas_bancarias"] },
      { id: "cartoes", label: "Cartões de Crédito", icon: "💳", contar: "cartoes_credito", tabelas: ["faturas_cartao", "cartoes_credito"], aviso: "Limpe os Lançamentos antes: títulos pagos no cartão apontam para a fatura." },
      { id: "previsoes", label: "Previsão de Gastos", icon: "🔮", contar: "previsoes_gasto", tabelas: ["previsoes_gasto_consumos", "previsoes_gasto"] },
      { id: "folha", label: "Folha de Pagamento", icon: "🧾", contar: "folha_pagamento", tabelas: ["adiantamentos_salario", "funcionarios_premiacoes", "funcionario_premiacoes", "decimo_terceiro", "funcionario_ferias", "funcionario_rescisoes", "folha_pagamento"] },
      { id: "adiantamentos", label: "Adiantamentos a fornecedor e de cliente", icon: "💸", contar: "adiantamentos_fornecedor", tabelas: ["aplicacoes_adiantamento", "adiantamentos_aplicacoes", "adiantamentos_fornecedor", "adiantamentos_cliente"] },
      { id: "tesouraria", label: "Tesouraria e Aplicações Financeiras", icon: "📊", contar: "operacoes_tesouraria", tabelas: ["aplicacao_movimentos", "aplicacoes_financeiras", "operacoes_tesouraria"] },
      { id: "apoio", label: "Apoio Financeiro", icon: "💼", contar: "apoio_lancamentos", tabelas: ["apoio_baixas", "apoio_lancamentos"] },
    ],
  },
  {
    id: "comercial", label: "Comercialização", icon: "📋", cor: "#C9921B", bg: "#FBF3E0",
    subitens: [
      { id: "contratos", label: "Contratos de Venda/Compra", icon: "📝", contar: "contratos", tabelas: ["contratos_aditivos", "contrato_faturamentos", "barter_compromissos", "fixacoes_hedge", "contrato_itens", "contratos"] },
      { id: "romaneios", label: "Romaneios e pesagens avulsas", icon: "⚖️", contar: "romaneios", tabelas: ["pesagens_avulsas", "romaneios"] },
      { id: "notas_saida", label: "Notas de saída (NF-e emitidas)", icon: "🧾", contar: "notas_fiscais", tabelas: ["nfe_cartas_correcao", "gnre_guias", "notas_fiscais"], aviso: "NF-e autorizada na SEFAZ continua lá: isto só apaga o registro no sistema." },
      { id: "expedicao", label: "Expedição · CT-e · MDF-e", icon: "🚛", contar: "cargas_expedicao", tabelas: ["acertos_frete", "cte_cartas_correcao", "cte_entradas", "cte_recebidos", "cargas_expedicao", "ctes", "mdfes", "mdfe"] },
      { id: "compra_terra", label: "Compra de Terra", icon: "🏞️", contar: "contratos_compra_terra", tabelas: ["cct_pagamentos", "contratos_compra_terra"] },
    ],
  },
  {
    id: "lavoura", label: "Lavoura", icon: "🌾", cor: "#16A34A", bg: "#DCFCE7",
    subitens: [
      { id: "plantios", label: "Plantios", icon: "🌱", contar: "plantios", tabelas: ["plantios"] },
      { id: "pulverizacoes", label: "Pulverizações", icon: "💨", contar: "pulverizacoes", tabelas: ["pulverizacao_itens", "pulverizacoes"] },
      { id: "aereas", label: "Aplicações Aéreas", icon: "✈️", contar: "aplicacoes_aereas", tabelas: ["aplicacoes_aereas_itens", "aplicacoes_aereas"] },
      { id: "tratamento", label: "Tratamento de Sementes", icon: "🧪", contar: "tratamento_sementes", tabelas: ["tratamento_sementes", "tratamento_receitas"] },
      { id: "colheitas", label: "Colheitas", icon: "🚜", contar: "colheitas", tabelas: ["colheita_romaneios", "romaneios_entrada", "colheitas"] },
      { id: "adubacoes", label: "Adubações de Base", icon: "🌿", contar: "adubacoes_base", tabelas: ["adubacoes_base_itens", "adubacoes_base"] },
      { id: "correcoes", label: "Correções de Solo", icon: "🪨", contar: "correcoes_solo", tabelas: ["correcoes_solo_itens", "correcoes_solo"] },
      { id: "orcamentos", label: "Orçamentos de Safra", icon: "📊", contar: "orcamentos", tabelas: ["orcamento_itens", "orcamentos"] },
      { id: "monitoramento", label: "Monitoramento de Pragas", icon: "🐛", contar: "monitoramento_pragas", tabelas: ["monitoramento_pragas"] },
      { id: "recomendacoes", label: "Recomendações Agronômicas", icon: "📝", contar: "recomendacoes", tabelas: ["recomendacoes_adubacao", "recomendacoes_corretivo", "recomendacoes_plantio", "recomendacoes_pulverizacao", "recomendacoes_tecnicas", "recomendacoes"] },
      { id: "algodao", label: "Algodão", icon: "🌱", contar: "algodao_modulos", tabelas: ["algodao_laudos_hvi", "algodao_beneficiamentos", "algodao_modulos", "algodao_operacoes_especiais", "bicudo_capturas", "bicudo_armadilhas"] },
      { id: "pluviometria", label: "Pluviometria", icon: "🌧️", contar: "leituras_pluviometricas", tabelas: ["leituras_pluviometricas"] },
    ],
  },
  {
    id: "arrendamentos", label: "Arrendamentos", icon: "📜", cor: "#6B7280", bg: "#F3F4F6",
    subitens: [
      { id: "arrendamentos", label: "Contratos de Arrendamento", icon: "📋", contar: "arrendamentos", tabelas: ["arrendamento_pagamentos", "arrendamento_matriculas", "arrendamentos"] },
    ],
  },
  {
    id: "estoque", label: "Estoque & Compras", icon: "📦", cor: "#444444", bg: "#F2F2F2",
    subitens: [
      { id: "nf_entradas", label: "NFs de Entrada", icon: "🧾", contar: "nf_entradas", tabelas: ["nf_remessas_logisticas", "migracoes_nf", "nf_entrada_itens", "nf_entradas"] },
      { id: "nf_servicos", label: "NFs de Serviço", icon: "🧾", contar: "nf_servicos", tabelas: ["nf_servicos"] },
      { id: "sieg", label: "Notas capturadas do SIEG", icon: "📥", contar: "nf_importadas_sieg", tabelas: ["nf_importadas_sieg"] },
      { id: "movimentacoes", label: "Movimentações de Estoque", icon: "📈", contar: "movimentacoes_estoque", tabelas: ["estoque_terceiros_baixas", "estoque_terceiros", "movimentacoes_pa", "pa_saldos", "movimentacoes_estoque"], aviso: "Apagar as movimentações zera o saldo dos itens, porque o saldo é a soma delas." },
      { id: "pedidos", label: "Pedidos de Compra", icon: "🛒", contar: "pedidos_compra", tabelas: ["pedidos_compra_entregas", "pedidos_compra_itens", "pedidos_compra"] },
      { id: "zeramento", label: "Zeramento de Estoque", icon: "🔢", contar: "insumos", tabelas: [], aviso: "Lança um ajuste por item e depósito até o saldo ficar zero. O cadastro e o histórico continuam, e os ajustes aparecem no Kardex." },
    ],
  },
  {
    id: "cadastros", label: "Cadastros", icon: "👤", cor: "#7C3AED", bg: "#F5F3FF",
    subitens: [
      { id: "pessoas", label: "Pessoas", icon: "👥", contar: "pessoas", tabelas: ["pessoas"], aviso: "Exclua Financeiro e Comercial antes: registros financeiros referenciam Pessoas." },
      { id: "produtores", label: "Produtores", icon: "🧑‍🌾", contar: "produtores", tabelas: ["produtor_inscricoes_estaduais", "produtores"] },
      { id: "insumos_cat", label: "Insumos (sementes/defensivos/fertilizantes)", icon: "🌱", contar: "insumos", tabelas: ["insumos"], filtro: { tipo: "insumo" }, aviso: "Exclua as Movimentações de Estoque antes: elas referenciam os insumos." },
      { id: "itens_gerais", label: "Itens Gerais (peças/materiais/consumo)", icon: "📦", contar: "insumos", tabelas: ["insumos"], filtro: { tipo: "produto" }, aviso: "Exclua as Movimentações de Estoque antes: elas referenciam os itens." },
      { id: "maquinas", label: "Máquinas & Veículos", icon: "🚜", contar: "maquinas", tabelas: ["abastecimentos", "historico_manutencao", "transferencias_maquinas", "bombas_combustivel", "maquinas"] },
      { id: "transporte", label: "Transportadoras, veículos e motoristas", icon: "🚛", contar: "transportadoras", tabelas: ["conjuntos_veiculos", "veiculos", "motoristas", "transportadoras"] },
      { id: "depositos", label: "Depósitos / Silos", icon: "🏚️", contar: "depositos", tabelas: ["depositos"] },
      { id: "funcionarios", label: "Funcionários", icon: "🧑‍🔧", contar: "funcionarios", tabelas: ["esocial_eventos", "esocial_trabalhadores", "funcionarios"], aviso: "Limpe a Folha de Pagamento antes." },
      { id: "empresas", label: "Empresas", icon: "🏢", contar: "empresas", tabelas: ["empresas"], aviso: "Limpe os Lançamentos de Empresa antes." },
      { id: "contas_bancarias", label: "Contas Bancárias", icon: "🏦", contar: "contas_bancarias", tabelas: ["contas_bancarias"], aviso: "Limpe Extratos e Lançamentos antes." },
      { id: "patrimonio", label: "Benfeitorias, bens e imóveis urbanos", icon: "🏠", contar: "benfeitorias", tabelas: ["benfeitorias", "bens", "imoveis_urbanos"] },
    ],
  },
  {
    id: "auxiliares", label: "Tabelas Auxiliares", icon: "📋", cor: "#6366F1", bg: "#EEF2FF",
    subitens: [
      { id: "grupos_insumos", label: "Grupos & Subgrupos de Insumo", icon: "📂", contar: "grupos_insumos", tabelas: ["subgrupos_insumos", "grupos_insumos"] },
      { id: "centros_custo", label: "Centros de Custo", icon: "🎯", contar: "centros_custo", tabelas: ["centros_custo"] },
      { id: "categorias_lancamento", label: "Categorias de Lançamento", icon: "🏷️", contar: "categorias_lancamento", tabelas: ["categorias_lancamento"] },
      { id: "tipos_pessoa", label: "Tipos de Pessoa", icon: "👤", contar: "tipos_pessoa", tabelas: ["tipos_pessoa"] },
      { id: "operacoes_gerenciais", label: "Operações Gerenciais (plano)", icon: "⚙️", contar: "operacoes_gerenciais", tabelas: ["operacoes_gerenciais"], aviso: "O plano é do cliente: só é apagado com \"Todas as fazendas\" escolhido." },
      { id: "padroes_classificacao", label: "Padrões de Classificação", icon: "⚖️", contar: "padroes_classificacao", tabelas: ["padroes_classificacao"] },
    ],
  },
  {
    id: "estrutura", label: "Estrutura", icon: "🗺️", cor: "#0D0D0D", bg: "#E8E8E8",
    subitens: [
      { id: "talhoes", label: "Talhões", icon: "📐", contar: "talhoes", tabelas: ["ciclo_talhoes", "talhoes"], aviso: "Exclua Lavoura antes: operações de lavoura dependem de talhões." },
      { id: "ciclos", label: "Ciclos de Produção", icon: "🔄", contar: "ciclos", tabelas: ["ciclo_talhoes", "ciclos"], aviso: "Exclua Lavoura antes: operações dependem de ciclos." },
      { id: "anos_safra", label: "Anos Safra", icon: "📅", contar: "anos_safra", tabelas: ["anos_safra"] },
      { id: "matriculas", label: "Matrículas de Imóvel", icon: "🏛️", contar: "matriculas_imoveis", tabelas: ["matriculas_imoveis"] },
    ],
  },
];

export const chaveLimpeza = (grupoId: string, subId: string) => `${grupoId}/${subId}`;

export function itemLimpeza(chave: string): { grupo: GrupoLimpeza; sub: SubItemLimpeza } | null {
  for (const grupo of GRUPOS_LIMPEZA) {
    for (const sub of grupo.subitens) if (chaveLimpeza(grupo.id, sub.id) === chave) return { grupo, sub };
  }
  return null;
}
