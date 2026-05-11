import { createBrowserClient } from "@supabase/ssr";

const url  = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const key  = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createBrowserClient(url, key);

// ————————————————————————————————————————
// Tipos do banco (espelham as tabelas abaixo)
// ————————————————————————————————————————

export type Conta = {
  id: string;
  nome: string;
  tipo: "pf" | "pj" | "grupo";
  onboarding_ativo?: boolean;
  created_at?: string;
};

export type Fazenda = {
  id: string;
  nome: string;
  conta_id?: string;      // FK contas — tenant raiz
  // Vínculo: Fazenda pode pertencer a um Produtor diretamente (PF/parceria)
  // OU a uma Empresa (PJ). Preencha um ou ambos conforme a realidade do cliente.
  produtor_id?: string;   // FK produtores — vínculo direto (PF ou parceria sem empresa)
  empresa_id?: string;    // FK empresas — vínculo via entidade jurídica
  cnpj?: string;
  // Certidões / documentos rurais
  car?: string;
  car_vencimento?: string;
  itr?: string;
  itr_vencimento?: string;
  ccir?: string;
  ccir_vencimento?: string;
  nirf?: string;
  municipio: string;
  estado: string;
  area_total_ha: number;
  // Endereço
  cep?: string;
  logradouro?: string;
  numero_end?: string;
  complemento?: string;
  bairro?: string;
  // Legado — arrendamento simples (substituído por tabela arrendamentos)
  arrendada?: boolean;
  arrendamento_proprietario?: string;
  arrendamento_valor_sc_ha?: number;
  arrendamento_valor_brl_ha?: number;
  arrendamento_area_ha?: number;
  arrendamento_inicio?: string;
  arrendamento_vencimento?: string;
  arrendamento_renovacao_auto?: boolean;
  owner_user_id?: string;
  created_at?: string;
};

export type Arrendamento = {
  id: string;
  fazenda_id: string;
  proprietario_id?: string;     // FK pessoas (arrendante/locador)
  proprietario_nome?: string;   // fallback textual
  area_ha: number;
  forma_pagamento: "sc_soja" | "sc_milho" | "sc_soja_milho" | "brl";
  sc_ha?: number;               // sacas/ha/ano — formas em sacas
  valor_brl?: number;           // R$/ha/ano — forma BRL
  ano_safra_id?: string;        // FK anos_safra (referência para cálculo)
  inicio?: string;
  vencimento?: string;
  renovacao_auto?: boolean;
  observacao?: string;
  // Agricultores responsáveis (locatários) — impacta LCDPR e split de lancamentos
  produtor_id?: string | null;  // FK produtores — agricultor principal
  produtor_id_2?: string | null;// FK produtores — segundo agricultor (contrato conjunto)
  created_at?: string;
};

export type ArrendamentoMatricula = {
  id: string;
  arrendamento_id: string;
  fazenda_id: string;
  numero: string;
  area_ha?: number;
  cartorio?: string;
  created_at?: string;
};

export type Talhao = {
  id: string;
  fazenda_id: string;
  nome: string;
  area_ha: number;
  tipo_solo?: string;
  lat?: number;
  lng?: number;
  created_at?: string;
};

export type Safra = {
  id: string;
  fazenda_id: string;
  talhao_id?: string;
  cultura: string;
  ano_agricola: string;
  ano_safra_id?: string;   // FK anos_safra.id
  ciclo_id?: string;       // FK ciclos.id
  status: "planejada" | "em_andamento" | "colhida" | "cancelada";
  area_ha: number;
  data_plantio?: string;
  data_colheita?: string;
  produtividade_sc_ha?: number;
  created_at?: string;
};

export type Insumo = {
  id: string;
  fazenda_id: string;
  // "insumo" = insumos agrícolas; "produto" = peças, material, escritório, consumo geral
  tipo: "insumo" | "produto";
  nome: string;
  categoria:
    // insumos agrícolas
    | "semente" | "fertilizante" | "defensivo" | "inoculante" | "produto_agricola" | "combustivel"
    // produtos gerais
    | "peca" | "material" | "uso_consumo" | "escritorio"
    // shared
    | "outros";
  subgrupo?: string;
  grupo_id?: string;     // FK grupos_insumos
  unidade: "kg" | "g" | "L" | "mL" | "sc" | "t" | "un" | "m" | "m2" | "cx" | "pc" | "par" | "outros";
  fabricante?: string;
  estoque: number;
  estoque_minimo: number;
  valor_unitario: number;
  custo_medio?: number;
  deposito_id?: string;  // depósito padrão onde este item é armazenado
  bomba_id?: string;     // bomba de combustível associada (só para categoria combustivel)
  lote?: string;
  validade?: string;
  created_at?: string;
};

export type MovimentacaoEstoque = {
  id: string;
  insumo_id: string;
  fazenda_id: string;
  tipo: "entrada" | "saida" | "ajuste";
  motivo?: "compra" | "ajuste_saldo" | "baixa_uso" | "baixa_perda" | "transferencia" | "inventario" | "outros";
  quantidade: number;
  valor_unitario?: number;        // preço unitário da entrada (compra)
  custo_unitario_na_baixa?: number; // custo médio dos últimos 6 meses no momento da saída
  data: string;
  talhao?: string;
  safra?: string;
  operacao?: string;
  nf_entrada?: string;
  deposito_id?: string;
  observacao?: string;
  auto: boolean;
  created_at?: string;
};

export type Lancamento = {
  id: string;
  fazenda_id: string;
  tipo: "receber" | "pagar";
  moeda: "BRL" | "USD" | "barter";
  descricao: string;
  categoria: string;
  data_lancamento: string;
  data_vencimento: string;
  data_baixa?: string;
  data_prorrogacao?: string;
  valor: number;
  valor_pago?: number;
  status: "em_aberto" | "vencido" | "vencendo" | "baixado";
  auto: boolean;
  // Parcelamento
  num_parcela?: number;
  total_parcelas?: number;
  agrupador?: string;
  // LCDPR — Livro Caixa Digital do Produtor Rural
  tipo_documento_lcdpr?: "RECIBO" | "NF" | "DUPLICATA" | "CHEQUE" | "PIX" | "TED" | "OUTROS";
  // Encargos
  juros_pct?: number;
  multa_pct?: number;
  desconto_pontualidade_pct?: number;
  // Moedas / barter
  cotacao_usd?: number;
  sacas?: number;
  cultura_barter?: string;
  preco_saca_barter?: number;
  // Vínculos
  nfe_numero?: string;
  nf_entrada_id?: string;  // FK nf_entradas — vínculo fiscal real (LCDPR/SPED)
  chave_xml?: string;
  conta_bancaria?: string;
  safra_id?: string;
  ano_safra_id?: string;
  ciclo_id?: string;       // FK ciclos.id — ciclo/empreendimento vinculado
  produtor_id?: string;
  pessoa_id?: string;      // FK pessoas — cliente (CR) ou fornecedor (CP)
  operacao_id?: string;
  talhao?: string;
  centro_custo?: string;
  observacao?: string;
  moeda_pagamento?: "BRL" | "USD";
  lote_id?: string;           // FK pagamento_lotes.id — quando baixado em lote
  // Planejamento — Previsão vs Real
  natureza?: "real" | "previsao";   // "previsao" = rascunho de planejamento, pode ser confirmado
  // Contabilidade — LCDPR + SPED ECD
  vinculo_atividade?: "rural" | "pessoa_fisica" | "investimento" | "nao_tributavel";
  entidade_contabil?: "pf" | "pj";  // qual entidade contabiliza (PF/CNPJ ou PJ/CNPJ)
  // Rastreabilidade — de onde veio o lançamento
  origem_lancamento?: "nf_entrada" | "nf_saida" | "pedido_compra" | "arrendamento" | "tesouraria" | "plantio" | "contrato_financeiro" | "manual";
  pedido_compra_id?: string;          // FK pedidos_compra.id — quando gerado por pedido de compra
  operacao_gerencial_id?: string;     // FK operacoes_gerenciais.id — vínculo contábil (débito/crédito)
  forma_pagamento?: string;
  created_at?: string;
};

// ── Pagamento em Lote (Borderô) ────────────────────────────
export type PagamentoLote = {
  id: string;
  fazenda_id: string;
  tipo: "pagar" | "receber";
  conta_bancaria?: string;
  data_pagamento: string;
  valor_total: number;
  descricao?: string;
  conciliado?: boolean;
  created_at?: string;
  itens?: PagamentoLoteItem[];
};

export type PagamentoLoteItem = {
  id: string;
  lote_id: string;
  lancamento_id: string;
  valor_pago: number;
  created_at?: string;
};

export type Contrato = {
  id: string;
  fazenda_id: string;
  numero: string;
  num_lancamento?: number;
  // Cabeçalho
  safra?: string;          // descrição textual (ex: "25/26")
  ano_safra_id?: string;   // FK anos_safra.id
  ciclo_id?: string;       // FK ciclos.id — Empreendimento/Ciclo
  autorizacao?: "pendente" | "autorizada" | "recusada";
  confirmado?: boolean;
  a_fixar?: boolean;
  tipo?: "venda" | "compra" | "barter" | "troca";
  venda_a_ordem?: boolean;
  // Partes
  produtor_id?: string;
  produtor_nome?: string;
  pessoa_id?: string;        // cliente / comprador (FK pessoas)
  comprador: string;         // nome livre (compatibilidade)
  nr_contrato_cliente?: string;
  contato_broker?: string;
  grupo_vendedor?: string;
  vendedor?: string;
  // Produto principal (compatibilidade)
  produto: string;
  modalidade: "fixo" | "a_fixar" | "barter";
  moeda: "BRL" | "USD";
  preco: number;
  quantidade_sc: number;
  entregue_sc: number;
  // Logística
  saldo_tipo?: "peso_saida" | "peso_entrada";
  frete?: "destinatario" | "remetente" | "cif" | "fob" | "sem_frete";
  valor_frete?: number;
  natureza_operacao?: string;
  cfop?: string;
  deposito_carregamento?: string;
  deposito_fiscal?: boolean;
  // Adicionais
  propriedade?: string;
  empreendimento?: string;
  seguradora?: string;
  corretora?: string;
  cte_numero?: string;
  terceiro?: string;
  observacao_interna?: string;  // não vai na NF
  // Datas / Status
  data_contrato?: string;
  data_entrega: string;
  data_pagamento?: string;      // prazo de pagamento → gera CR quando confirmado
  lancamento_cr_id?: string;    // FK lancamentos.id do CR gerado automaticamente
  status: "aberto" | "parcial" | "encerrado" | "cancelado";
  observacao?: string;
  // Comprometimento de arrendamento (não gera financeiro)
  is_arrendamento?: boolean;    // true = comprometimento de grãos de arrendamento
  arrendamento_id?: string;     // FK arrendamentos.id
  // Cessão — produtor cede o recebível a um fornecedor para quitar débito
  dado_em_cessao?: boolean;
  cessao_fornecedor_id?: string;   // FK pessoas.id
  cessao_fornecedor_nome?: string; // nome do fornecedor (desnormalizado)
  cessao_data?: string;            // data em que a cessão foi formalizada
  cessao_obs?: string;
  created_at?: string;
};

export type ContratoCessaoDebito = {
  id: string;
  contrato_id: string;
  fazenda_id: string;
  lancamento_id: string;
  valor_cessao: number;
  obs?: string;
  created_at?: string;
};

export type ContratoItem = {
  id: string;
  contrato_id: string;
  fazenda_id: string;
  tipo?: string;            // "Produto", "Serviço", etc.
  produto: string;
  unidade: "sc" | "kg" | "ton" | "@";
  quantidade: number;
  valor_unitario: number;
  valor_total?: number;
  moeda?: "BRL" | "USD";
  classificacao?: string;  // "Umid 14% / Impur 1% / Avar 0%"
  created_at?: string;
};

export type Romaneio = {
  id: string;
  contrato_id: string;
  fazenda_id: string;
  numero: string;
  placa: string;
  peso_bruto_kg: number;
  tara_kg: number;
  peso_liquido_kg: number;
  // Classificação do grão no romaneio de expedição
  umidade_pct?: number;           // % umidade medida
  umidade_padrao_pct?: number;    // padrão: 14% soja, 14.5% milho, 12% algodão…
  desconto_umidade_kg?: number;   // PL × (U – Upad) / (100 – Upad)
  impureza_pct?: number;          // % impureza/sujeira medida
  impureza_padrao_pct?: number;   // tolerância padrão por commodity
  desconto_impureza_kg?: number;  // PL × (I – Ipad) / 100
  avariados_pct?: number;         // % grãos avariados medidos (total — soma dos sub)
  avariados_padrao_pct?: number;  // tolerância padrão por commodity
  desconto_avariados_kg?: number; // PL × (A – Apad) / 100
  peso_classificado_kg?: number;  // PL – total descontos
  sacas: number;                  // peso_classificado / kg_saca
  data: string;
  nfe_numero?: string;
  nfe_status?: "gerando" | "autorizada" | "cancelada" | "rejeitada";
  nfe_chave?: string;
  // Classificação detalhada — sub-parâmetros de avariados
  ph_hl?: number;                 // Peso Hectolítrico (kg/hl)
  ardidos_pct?: number;           // ardidos / queimados (soja) ou ardidos+brotados (milho)
  mofados_pct?: number;
  fermentados_pct?: number;
  germinados_pct?: number;
  esverdeados_pct?: number;       // soja: grãos imaturos/esverdeados
  quebrados_pct?: number;
  carunchados_pct?: number;       // milho: carunchados e atacados por insetos
  outros_avariados_pct?: number;
  // Peso recebido pelo comprador (pós-entrega)
  peso_liquido_destino?: number;  // balança do comprador (kg)
  peso_class_destino?: number;    // peso classificado pelo comprador (kg)
  sacas_faturadas?: number;       // sacas na NF do comprador
  diferenca_kg?: number;          // peso_class_saida − peso_class_destino
  diferenca_pct?: number;         // diferença percentual
  obs_divergencia?: string;       // justificativa para divergência
  created_at?: string;
};

export type Operacao = {
  id: string;
  safra_id: string;
  talhao_id?: string;
  nome: string;
  tipo: string;
  data_prev?: string;
  data_real?: string;
  status: "pendente" | "em_andamento" | "concluida" | "cancelada";
  custo_ha?: number;
  auto: boolean;
  created_at?: string;
};

export type NotaFiscal = {
  id: string;
  fazenda_id: string;
  numero: string;
  serie: string;
  tipo: "saida" | "entrada";
  cfop: string;
  natureza: string;
  destinatario: string;
  cnpj_destinatario?: string;
  valor_total: number;
  data_emissao: string;
  status: "autorizada" | "cancelada" | "rejeitada" | "denegada" | "em_digitacao";
  chave_acesso?: string;
  xml_url?: string;
  danfe_url?: string;
  observacao?: string;  // infCpl — Informações Complementares (textos legais: ICMS Diferido, Funrural, etc.)
  auto: boolean;
  created_at?: string;
};

export type Simulacao = {
  id: string;
  fazenda_id: string;
  tipo: "receber" | "pagar";
  descricao: string;
  data: string;
  valor: number;
  ativa: boolean;
  created_at?: string;
};

export type Produtor = {
  id: string;
  fazenda_id: string;
  conta_id?: string;      // FK contas — usado para listar produtores de toda a conta
  nome: string;
  tipo: "pf" | "pj";
  cpf_cnpj?: string;
  incra?: string;         // Certificado INCRA (posse/assentamento)
  inscricao_est?: string;
  email?: string;
  telefone?: string;
  // Endereço
  cep?: string;
  logradouro?: string;
  numero?: string;
  complemento?: string;
  bairro?: string;
  municipio?: string;
  estado?: string;
  created_at?: string;
};

export type MatriculaImovel = {
  id: string;
  fazenda_id: string;
  produtor_id?: string;
  numero: string;
  cartorio?: string;
  area_ha?: number;
  descricao?: string;
  em_garantia: boolean;
  garantia_banco?: string;
  garantia_valor?: number;
  garantia_vencimento?: string;
  created_at?: string;
};

export type Pessoa = {
  id: string;
  fazenda_id: string;
  nome: string;
  tipo: "pf" | "pj";
  cliente: boolean;
  fornecedor: boolean;
  cpf_cnpj?: string;
  inscricao_est?: string;
  email?: string;
  telefone?: string;
  // Endereço completo
  cep?: string;
  logradouro?: string;
  numero?: string;
  complemento?: string;
  bairro?: string;
  municipio?: string;
  estado?: string;
  // Contato adicional
  nome_contato?: string;
  telefone_contato?: string;
  // Pagamento (fornecedor)
  banco_nome?: string;
  banco_agencia?: string;
  banco_conta?: string;
  banco_tipo?: string;   // corrente | poupanca | pagamento
  pix_chave?: string;
  pix_tipo?: string;     // cpf | cnpj | email | telefone | aleatoria
  // Tributação
  regime_tributario?: string;
  cnae?: string;
  situacao_cadastral?: string;
  // Subcategorias de classificação (ex: "Fornecedor de Insumos", "Arrendante", custom...)
  subcategorias?: string[];
  created_at?: string;
};

export type AnoSafra = {
  id: string;
  fazenda_id: string;
  descricao: string;
  data_inicio: string;
  data_fim: string;
  created_at?: string;
};

export type Ciclo = {
  id: string;
  ano_safra_id: string;
  fazenda_id: string;
  descricao: string;
  cultura: string;
  data_inicio: string;
  data_fim: string;
  produtividade_esperada_sc_ha?: number | null; // sc/ha esperado na colheita
  preco_esperado_sc?: number | null;            // R$/sc médio esperado na venda
  area_plantada_ha?: number | null;             // soma dos talhões vinculados (calculado)
  created_at?: string;
};

export type CicloTalhao = {
  id: string;
  ciclo_id: string;
  talhao_id: string;
  fazenda_id: string;
  area_plantada_ha: number;
  created_at?: string;
};

export type Maquina = {
  id: string;
  fazenda_id: string;
  nome: string;
  tipo: "trator" | "colheitadeira" | "pulverizador" | "plantadeira" | "caminhao" | "carro" | "implemento" | "outro";
  marca?: string;
  modelo?: string;
  ano?: number;
  patrimonio?: string;
  chassi?: string;
  horimetro_atual?: number;
  // Seguro
  seguro_seguradora?: string;
  seguro_corretora?: string;
  seguro_numero_apolice?: string;
  seguro_data_contratacao?: string;
  seguro_vencimento_apolice?: string;
  seguro_premio?: number;
  ativa: boolean;
  created_at?: string;
};

export type BombaCombustivel = {
  id: string;
  fazenda_id: string;
  nome: string;
  combustivel: "diesel_s10" | "diesel_s500" | "gasolina" | "etanol" | "arla";
  capacidade_l?: number;
  estoque_atual_l: number;
  consume_estoque: boolean;
  ativa: boolean;
  created_at?: string;
};

export type Funcionario = {
  id: string;
  fazenda_id: string;
  nome: string;
  cpf?: string;
  tipo: "clt" | "diarista" | "empreiteiro" | "outro";
  funcao?: string;
  data_admissao?: string;
  ativo: boolean;
  created_at?: string;
};

export type GrupoUsuario = {
  id: string;
  nome: string;
  descricao?: string;
  permissoes: Record<string, string>;
  created_at?: string;
};

export type Usuario = {
  id: string;
  auth_user_id?: string;
  grupo_id?: string;
  nome: string;
  email: string;
  whatsapp?: string;
  ativo: boolean;
  created_at?: string;
};

export type Empresa = {
  id: string;
  // Empresa sempre pertence a um Produtor (o dono/sócio/investidor)
  produtor_id?: string;   // FK produtores — proprietário/sócio principal
  fazenda_id: string;     // fazenda de referência (multi-tenant)
  // Identificação
  nome: string;           // nome fantasia
  razao_social?: string;
  tipo: "pf" | "pj";
  cpf_cnpj?: string;
  inscricao_est?: string;
  regime_tributario?: string; // Produtor Rural PJ, Simples, Lucro Presumido…
  // Localização
  municipio?: string;
  estado?: string;
  // Registros rurais (vinculados à empresa operadora)
  car?: string;           // Cadastro Ambiental Rural
  nirf?: string;          // Número do Imóvel na Receita Federal
  itr?: string;           // Número do imóvel no ITR
  // Contato
  email?: string;
  email_relatorios?: string; // e-mail para envio de relatórios automáticos
  telefone?: string;
  created_at?: string;
};

export type ContaBancaria = {
  id: string;
  empresa_id?: string | null;
  fazenda_id: string;
  nome: string;
  banco?: string;
  agencia?: string;
  conta?: string;
  moeda: "BRL" | "USD";
  ativa: boolean;
  tipo_conta: "corrente" | "investimento" | "caixa" | "transitoria";
  saldo_inicial?: number;
  produtor_id?: string | null;  // FK produtores — conta pertence a este produtor (LCDPR)
  created_at?: string;
};

export type Deposito = {
  id: string;
  fazenda_id: string;
  nome: string;
  tipo: "insumo_fazenda" | "armazem_fazenda" | "almoxarifado" | "oficina" | "terceiro" | "armazem_terceiro";
  capacidade_sc?: number;
  ativo: boolean;
  descricao?: string;   // texto livre — usado para depósitos de terceiro
  pessoa_id?: string;   // FK pessoas — vínculo com o cliente/fornecedor
  created_at?: string;
};

export type HistoricoManutencao = {
  id: string;
  fazenda_id: string;
  maquina_id: string;
  data: string;
  tipo: "preventiva" | "corretiva" | "revisao" | "outro";
  descricao: string;
  custo?: number;
  nf_entrada_item_id?: string;
  created_at?: string;
};

export type NfEntrada = {
  id: string;
  fazenda_id: string;
  numero: string;
  serie: string;
  chave_acesso?: string;
  emitente_nome: string;
  emitente_cnpj?: string;
  pessoa_id?: string;             // vínculo ao cadastro de Pessoas
  data_emissao: string;
  data_entrada?: string;
  valor_total: number;
  natureza?: string;
  cfop?: string;
  status: "digitando" | "pendente" | "processada" | "cancelada";
  xml_content?: string;
  lancamento_id?: string;
  observacao?: string;
  // Campos da v2
  origem?: "manual" | "xml" | "sieg";
  tipo_entrada?: "consumo" | "insumos" | "custo_direto" | "vef" | "remessa" | "devolucao_compra";
  nf_origem_id?: string;           // NF que está sendo devolvida (devolucao_compra)
  pedido_compra_id?: string;
  operacao_gerencial_id?: string; // para consumo direto
  centro_custo_id?: string;       // para consumo direto
  data_vencimento_cp?: string;    // vencimento da CP gerada
  deposito_destino_id?: string;   // para remessa: depósito operacional destino
  // Contabilidade — LCDPR + SPED ECD
  vinculo_atividade?: "rural" | "pessoa_fisica" | "investimento" | "nao_tributavel";
  entidade_contabil?: "pf" | "pj";
  created_at?: string;
};

// ── Configuração Contábil (SPED ECD) ─────────────────────────
// Uma configuração por entidade (PF/PJ) dentro da fazenda
export type ConfigContabilidade = {
  id: string;
  fazenda_id: string;
  entidade: "pf" | "pj";           // qual entidade este config descreve
  tipo_escrituracao: "G" | "R" | "B"; // G=Diário, R=Razão Auxiliar, B=Balancete
  nome_empresarial: string;
  cnpj?: string;
  cpf?: string;
  uf?: string;
  cod_municipio_ibge?: string;
  nome_municipio?: string;
  ie?: string;
  nire?: string;
  nr_livro?: string;
  nome_livro?: string;
  nr_tipo_livro?: "1" | "2" | "3"; // 1=Diário+Balancete, 2=Razão, 3=Razão+Balancete
  ind_sit_ini?: "0" | "1" | "2" | "3" | "4"; // 0=Normal, 1=Abertura, 2=Cisão, etc.
  // Responsável técnico (contador)
  resp_nome?: string;
  resp_cpf?: string;
  resp_crc?: string;
  resp_email?: string;
  // Termos
  termo_abertura?: string;
  termo_encerramento?: string;
  ativo: boolean;
  created_at?: string;
};

export type NfEntradaItem = {
  id: string;
  nf_entrada_id: string;
  fazenda_id: string;
  insumo_id?: string;
  deposito_id?: string;
  bomba_id?: string;
  maquina_id?: string;
  descricao_produto: string;
  descricao_nf?: string;          // descrição original da NF (antes da associação)
  ncm?: string;
  cfop?: string;
  unidade: string;
  unidade_nf?: string;            // unidade original da NF
  fator_conversao?: number;       // fator se unidade_nf ≠ unidade do cadastro
  quantidade: number;
  valor_unitario: number;
  valor_total: number;
  tipo_apropiacao: "estoque" | "maquinario" | "direto" | "terceiro" | "vef" | "remessa";
  centro_custo_id?: string;
  alerta_preco: boolean;
  created_at?: string;
};

export type NfServico = {
  id: string;
  fazenda_id: string;
  numero_nf: string;
  serie: string;
  chave_nfse?: string;
  prestador_id?: string;
  prestador_nome: string;
  prestador_cnpj?: string;
  municipio_prestacao?: string;
  data_prestacao: string;
  competencia?: string;           // YYYY-MM
  codigo_servico?: string;        // código LC 116/2003 ou municipal
  cnae?: string;
  discriminacao?: string;
  valor_servico: number;
  valor_deducoes: number;
  valor_base_iss: number;
  aliquota_iss: number;
  valor_iss: number;
  iss_retido: boolean;
  valor_inss: number;
  valor_ir: number;
  valor_outras_retencoes: number;
  valor_liquido: number;
  operacao_gerencial_id?: string;
  centro_custo_id?: string;
  ano_safra_id?: string;
  pedido_compra_id?: string;
  data_vencimento_cp?: string;
  status: "digitando" | "pendente" | "processada" | "cancelada";
  origem: "manual" | "xml" | "api";
  observacao?: string;
  created_at?: string;
};

export type PadraoClassificacao = {
  id: string;
  fazenda_id: string;
  commodity: string;
  nome_padrao: string;
  ativo: boolean;
  umidade_padrao: number;
  impureza_padrao: number;
  avariados_padrao: number;
  ardidos_max?: number;
  mofados_max?: number;
  esverdeados_max?: number;
  quebrados_max?: number;
  ph_minimo?: number;
  carunchados_max?: number;
  kg_saca: number;
  created_at?: string;
};

export type ContratoFinanceiro = {
  id: string;
  fazenda_id: string;
  codigo?: string;
  pessoa_id?: string;            // credor vinculado a cadastro de pessoas
  safra_id?: string;
  descricao: string;
  credor: string;                // nome livre (fallback quando pessoa_id não definido)
  tipo: "custeio" | "investimento" | "securitizacao" | "cpr" | "egf" | "outros";
  tipo_calculo: "sac" | "price" | "outros";
  linha_credito?: string;        // PRONAF, PRONAMP, FCO, BNDES, Livre…
  moeda: "BRL" | "USD";
  valor_financiado: number;
  valor_cotacao?: number;
  valor_financiado_brl?: number;
  data_contrato: string;
  numero_documento?: string;
  taxa_juros_aa?: number;        // taxa de juros anual (%)
  taxa_juros_am?: number;        // taxa de juros mensal (%)
  iof_pct?: number;              // IOF (%)
  tac_valor?: number;            // TAC — Tarifa de Abertura de Crédito (R$)
  outros_custos?: number;        // outros custos fixos da operação (R$)
  conta_liberacao_id?: string;   // FK contas_bancarias — onde cai o crédito
  conta_pagamento_id?: string;   // FK contas_bancarias — onde debitam as parcelas
  forma_pagamento?: string;
  local_pagamento?: string;
  carencia_meses?: number;
  periodicidade_meses?: number;          // 1=mensal, 6=semestral, 12=anual
  carencia_tipo?: "so_juros" | "total";  // so_juros: paga só juros; total: juros capitalizam
  crescimento_pct?: number;              // % de crescimento por período (null = parcelas fixas)
  rateio_por_vencimento: boolean;
  fiscal: boolean;
  observacao?: string;
  produtor_id?: string | null;   // FK produtores — agricultor responsável pelo contrato (LCDPR)
  status: "ativo" | "quitado" | "cancelado";
  created_at?: string;
};

export type ParcelaLiberacao = {
  id: string;
  contrato_id: string;
  fazenda_id: string;
  num_parcela: number;
  data_liberacao: string;
  valor_liberado: number;
  valor_liberado_brl?: number;
  lancamento_id?: string;
  created_at?: string;
};

export type ParcelaPagamento = {
  id: string;
  contrato_id: string;
  fazenda_id: string;
  num_parcela: number;
  data_vencimento: string;
  amortizacao: number;
  juros: number;
  despesas_acessorios: number;
  valor_parcela: number;
  saldo_devedor: number;
  lancamento_id?: string;
  status: "em_aberto" | "pago" | "vencido";
  created_at?: string;
};

export type GarantiaContrato = {
  id: string;
  contrato_id: string;
  fazenda_id: string;
  matricula_id?: string;
  descricao: string;
  valor_avaliacao?: number;
  created_at?: string;
};

export type CentroCustoContrato = {
  id: string;
  contrato_id: string;
  descricao: string;
  percentual: number;
  valor: number;
  created_at?: string;
};

// ─────────────────────────────────────────────────────────────
// MÓDULO LAVOURA — Plantio, Pulverização, Colheita
// ─────────────────────────────────────────────────────────────

export type CorrecaoSolo = {
  id: string;
  fazenda_id: string;
  ciclo_id: string;
  safra_id?: string;
  talhao_id?: string;
  finalidade: "calcario" | "gesso" | "micronutrientes" | "organico" | "outros";
  area_ha: number;
  data_aplicacao: string;
  observacao?: string;
  custo_total?: number;
  lancamento_id?: string;
  created_at?: string;
};

export type CorrecaoSoloItem = {
  id: string;
  correcao_id: string;
  fazenda_id: string;
  insumo_id?: string;
  produto_nome?: string;
  dose_ton_ha?: number;
  quantidade_ton?: number;
  valor_unitario?: number;
  custo_total?: number;
  created_at?: string;
};

export type AdubacaoBase = {
  id: string;
  fazenda_id: string;
  ciclo_id: string;
  safra_id?: string;
  talhao_id?: string;
  modalidade: "convencional" | "sulco" | "broadcast" | "foliar" | "fertirrigacao";
  area_ha: number;
  data_aplicacao: string;
  observacao?: string;
  custo_total?: number;
  lancamento_id?: string;
  created_at?: string;
};

export type AdubacaoBaseItem = {
  id: string;
  adubacao_id: string;
  fazenda_id: string;
  insumo_id?: string;
  produto_nome?: string;
  dose_kg_ha?: number;
  quantidade_kg?: number;
  valor_unitario?: number;
  custo_total?: number;
  created_at?: string;
};

export type Plantio = {
  id: string;
  fazenda_id: string;
  ciclo_id: string;
  safra_id?: string;
  talhao_id: string;
  insumo_id?: string;                   // semente (FK insumos)
  variedade?: string;                   // nome da cultivar
  area_ha: number;
  dose_kg_ha?: number;                  // dose de semente kg/ha
  quantidade_kg?: number;               // total = dose_kg_ha × area_ha
  data_plantio: string;
  data_colheita_prevista?: string;
  produtividade_esperada_sc_ha?: number;
  preco_esperado_sc?: number;           // R$/sc (para faturamento esperado)
  moeda?: "BRL" | "USD";
  custo_sementes?: number;              // calculado: quantidade_kg × valor_unitario
  observacao?: string;
  lancamento_id?: string;              // CP gerado automaticamente
  created_at?: string;
};

export type PulverizacaoOp = {
  id: string;
  fazenda_id: string;
  ciclo_id: string;
  safra_id?: string;
  talhao_id?: string;
  tipo: "herbicida" | "fungicida" | "inseticida" | "nematicida" | "acaricida" | "fertilizante_foliar" | "regulador" | "dessecacao" | "outros";
  pre_pos?: "pre" | "pos" | "dessecacao" | null;
  estadio_fenologico?: string;          // V1, V2, R1, R3... ou BBCH
  data_inicio: string;
  data_fim?: string;
  area_ha: number;
  cap_tanque_l?: number;
  vazao_l_ha?: number;
  num_tanques?: number;
  calda_total_l?: number;               // calculado: cap_tanque × num_tanques
  custo_total?: number;                 // soma dos itens
  observacao?: string;
  fiscal: boolean;
  created_at?: string;
};

export type PulverizacaoItem = {
  id: string;
  pulverizacao_id: string;
  fazenda_id: string;
  insumo_id: string;
  nome_produto: string;                 // nome do insumo (obrigatório no banco)
  dose_ha: number;                      // dose por ha (L/ha, kg/ha, g/ha)
  unidade: string;
  total_consumido: number;              // dose_ha × area_ha
  valor_unitario: number;
  custo_ha: number;                     // valor_unitario × dose_ha
  custo_total: number;                  // custo_ha × area_ha
  created_at?: string;
};

export type ColheitaRegistro = {
  id: string;
  fazenda_id: string;
  ciclo_id: string;
  safra_id?: string;
  talhao_id?: string;
  data_colheita: string;
  deposito_id?: string;                 // armazém de destino
  produto: string;                      // soja, milho, algodao…
  variedade?: string;
  area_ha?: number;
  total_kg_bruto: number;               // soma romaneios peso_liquido_kg (antes classificação)
  total_kg_classificado: number;        // após descontos umidade/avariados/impureza
  total_sacas: number;                  // total_kg_classificado / 60
  umidade_media?: number;               // % média dos romaneios
  impureza_media?: number;              // % média
  avariados_media?: number;             // % média
  produtividade_sc_ha?: number;         // total_sacas / area_ha
  observacao?: string;
  created_at?: string;
};

export type ColheitaRomaneio = {
  id: string;
  colheita_id: string;
  fazenda_id: string;
  numero?: string;                      // nº do romaneio
  placa: string;                        // placa do caminhão
  peso_bruto_kg: number;
  tara_kg: number;
  peso_liquido_kg: number;              // bruto - tara
  // Classificação do grão
  umidade_pct?: number;                 // % umidade medida
  umidade_padrao_pct?: number;          // padrão: 14% soja, 15% milho
  desconto_umidade_kg?: number;         // ((U - U_pad) / (100 - U_pad)) × PL
  impureza_pct?: number;                // % impureza / sujeira
  desconto_impureza_kg?: number;        // impureza_pct/100 × PL
  avariados_pct?: number;               // % grãos avariados
  desconto_avariados_kg?: number;       // avariados_pct/100 × PL (acima da tolerância)
  peso_classificado_kg: number;         // PL - D_umidade - D_impureza - D_avariados
  sacas: number;                        // peso_classificado_kg / 60
  data?: string;
  created_at?: string;
};

export type EstoqueTerceiro = {
  id: string;
  fazenda_id: string;
  insumo_id?: string;
  descricao: string;
  terceiro_nome: string;
  terceiro_cnpj?: string;
  nf_entrada_id?: string;
  deposito_id?: string;   // FK depositos — depósito de terceiro vinculado ao fornecedor
  safra?: string;
  quantidade_original: number;
  quantidade_saldo: number;
  status: "aberto" | "parcial" | "encerrado";
  created_at?: string;
};

// ————————————————————————————————————————
// Tabelas Auxiliares (dados mestres)
// ————————————————————————————————————————

export type GrupoInsumo = {
  id: string;
  fazenda_id: string;
  nome: string;
  cor?: string;        // hex para identificação visual
  created_at?: string;
};

export type SubgrupoInsumo = {
  id: string;
  fazenda_id: string;
  grupo_id: string;
  nome: string;
  created_at?: string;
};

export type TipoPessoa = {
  id: string;
  fazenda_id: string;
  nome: string;        // Cliente, Fornecedor, Transportador, Prestador, Banco…
  descricao?: string;
  created_at?: string;
};

export type CentroCusto = {
  id: string;
  fazenda_id: string;
  codigo?: string;     // ex: "1.1.01"
  nome: string;
  tipo: "receita" | "despesa" | "neutro";
  parent_id?: string;  // hierarquia: centro pai
  manutencao_maquinas?: boolean;
  created_at?: string;
};

export type CategoriaLancamento = {
  id: string;
  fazenda_id: string;
  nome: string;
  tipo: "pagar" | "receber" | "ambos";
  created_at?: string;
};

// ── Pedidos de Compra ──────────────────────────────────────────
export type PedidoCompra = {
  id: string;
  fazenda_id: string;
  numero?: number;
  operacao?: string;
  safra_texto?: string;
  ciclo_id?: string;
  aprovador?: string;
  nr_pedido?: string;
  nr_solicitacao?: string;
  data_registro: string;
  tipo?: string;
  fiscal?: boolean;
  fornecedor_id?: string;
  nr_pedido_fornecedor?: string;
  cotacao_moeda?: string;
  variacao_cambial?: number;
  deposito_previsao?: string;
  contato_fornecedor?: string;
  operacao_nf?: string;
  forma_pagamento_nf?: string;
  possui_ordem_compra?: boolean;
  // Desconto/Juros
  antecipacao_juros_pct?: number;
  desc_antecipacao_pct?: number;
  desc_pontualidade_pct?: number;
  acrescimos_valor?: number;
  desconto_pct?: number;
  desconto_valor?: number;
  frete_tipo?: string;
  frete_total?: number;
  comprador_id?: string;
  // Entrega
  entrega_unica?: boolean;
  previsao_entrega_unica?: string;
  data_entrega_total?: string;
  transportador?: string;
  propriedade_entrega?: string;
  endereco_entrega?: string;
  cidade_entrega?: string;
  // Safra e vencimento
  ano_safra_id?: string;
  data_vencimento?: string;
  // Meio de pagamento
  meio_pagamento?: "barter" | "pix" | "transferencia" | "boleto";
  barter_ciclo_id?: string;
  barter_ano_safra_id?: string;
  // Status
  status: "rascunho" | "aprovado" | "parcialmente_entregue" | "entregue" | "cancelado";
  observacao?: string;
  total_financeiro?: number;
  total_produtos_servicos?: number;
  lancamento_id?: string;
  created_at?: string;
};

export type PedidoCompraItem = {
  id: string;
  pedido_id: string;
  fazenda_id: string;
  tipo_item: "produto" | "servico";
  insumo_id?: string;
  nome_item: string;
  unidade: string;
  quantidade: number;
  valor_unitario: number;
  valor_total?: number;
  qtd_cancelada?: number;
  qtd_entregue?: number;
  centro_custo_id?: string;
  created_at?: string;
};

export type PedidoCompraEntrega = {
  id: string;
  pedido_id: string;
  item_id?: string;
  fazenda_id: string;
  nf_entrada_id?: string;
  data_entrega: string;
  quantidade_entregue: number;
  valor_entregue?: number;
  observacao?: string;
  created_at?: string;
};

// ── Regras de Rateio ──────────────────────────────────────────
export type RateioRegra = {
  id: string;
  fazenda_id: string;
  ano_safra_id: string;       // regra válida para este ano safra
  centro_custo_id: string;    // CC de origem que será distribuído
  nome: string;
  descricao?: string;
  ativo?: boolean;
  created_at?: string;
  // linhas carregadas em memória (não coluna do banco)
  linhas?: RateioRegraLinha[];
};

export type RateioRegraLinha = {
  id: string;
  regra_id: string;
  ciclo_id?: string;          // null = overhead sem ciclo específico
  percentual: number;         // 0–100; soma das linhas deve ser 100
  descricao?: string;
  ordem?: number;
  created_at?: string;
};

// ── Rateio Global (inter-fazendas) ────────────────────────────
export type RateioGlobal = {
  id: string;
  conta_id: string;
  ano_safra_label: string;        // "2025/2026" — label, não FK
  centro_custo_id?: string;
  nome: string;
  descricao?: string;
  ativo?: boolean;
  created_at?: string;
  // carregados em memória
  fazendas?: RateioGlobalFazenda[];
};

export type RateioGlobalFazenda = {
  id: string;
  regra_global_id: string;
  fazenda_id: string;
  percentual: number;
  ordem?: number;
  created_at?: string;
  // carregados em memória
  ciclos?: RateioGlobalCiclo[];
};

export type RateioGlobalCiclo = {
  id: string;
  rateio_fazenda_id: string;
  ciclo_id: string;
  percentual: number;
  descricao?: string;
  ordem?: number;
  created_at?: string;
};

// ── Operações Gerenciais / Plano de Contas ───────────────────
// Equivalente ao "Cadastro de Operações" do Agrosoft
export type OperacaoGerencial = {
  id: string;
  fazenda_id: string;
  classificacao: string;        // ex: "1.01.01.01.001"
  descricao: string;
  tipo: "receita" | "despesa";
  parent_id?: string;           // hierarquia de plano de contas
  tipo_lcdpr?: string;          // "1-NF", "2-Recibo", "3-Folha", "4-Pró-Labore", "5-Outros"
  inativo?: boolean;
  informa_complemento?: boolean;

  // ── Aba Principal — Lançamentos nas telas ──
  permite_notas_fiscais?: boolean;
  permite_cp_cr?: boolean;
  permite_adiantamentos?: boolean;
  permite_tesouraria?: boolean;
  permite_baixas?: boolean;
  permite_custo_produto?: boolean;
  permite_contrato_financeiro?: boolean;

  // ── Aba Principal — Lançamentos específicos ──
  permite_estoque?: boolean;
  permite_pedidos_venda?: boolean;
  permite_manutencao?: boolean;
  marcar_fiscal_padrao?: boolean;
  permite_energia_eletrica?: boolean;

  // ── Aba Estoque ──
  operacao_estoque?: "entrada" | "saida" | "neutra";
  tipo_item_estoque?: string;
  tipo_custo_estoque?: "gasto" | "ajuste" | "contrato" | "nenhum";

  // ── Aba Fiscal ──
  obs_legal?: string;
  natureza_receita?: string;
  // Impostos: "icms","funrural","fethab1","fethab2","iagro","senar","cbs","ibs_estadual"
  impostos?: string[];

  // ── Aba Financeiro/Custos ──
  gerar_financeiro?: boolean;
  gerar_financeiro_gerencial?: boolean;
  valida_propriedade?: boolean;
  custo_absorcao?: boolean;
  custo_abc?: boolean;
  atualizar_custo_estoque?: boolean;
  manutencao_reparos?: boolean;
  gerar_depreciacao?: boolean;

  // ── Aba Configuração Plano de Contas ──
  tipo_formula?: "baixas" | "tesouraria" | "adiantamentos";
  modelo_contabil?: string;

  // ── Aba Contabilidade ──
  conta_debito?: string;    // código da conta contábil de débito
  conta_credito?: string;   // código da conta contábil de crédito

  created_at?: string;
};

// ── Operações de Compra (simples) ────────────────────────────
// Campo "Operação" nos pedidos de compra — tipo simples, diferente do Plano de Contas
export type OperacaoCompra = {
  id: string;
  fazenda_id: string;
  nome: string;
  tipo: "pedido" | "nf" | "ambos";   // onde aparece: só pedido, só NF, ou ambos
  descricao?: string;
  ativo?: boolean;
  created_at?: string;
};

// ── Formas de Pagamento ───────────────────────────────────────
export type FormaPagamento = {
  id: string;
  fazenda_id: string;
  nome: string;      // "À Vista", "30 dias", "30/60 dias" …
  parcelas?: number;
  dias?: string;     // "30/60/90" — intervalo livre
  descricao?: string;
  ativo?: boolean;
  created_at?: string;
};

// ── Regras de Classificação Automática ───────────────────────
// Sugerem operação gerencial + CC quando uma NF é lançada
export type RegraClassificacao = {
  id: string;
  fazenda_id: string;
  nome: string;
  // Critérios de match — todos os preenchidos devem bater (AND)
  fornecedor_cnpj?: string;         // CNPJ exato (normalizado, só dígitos)
  fornecedor_nome_contem?: string;  // substring case-insensitive no nome
  ncm?: string;                     // começa com este código NCM
  cfop?: string;                    // começa com este CFOP
  descricao_contem?: string;        // item.descricao_nf contém (case-insensitive)
  // Sugestões aplicadas quando a regra bate
  operacao_gerencial_id?: string;
  centro_custo_id?: string;
  // Meta
  prioridade?: number;              // maior = mais alta; empate → created_at mais recente
  ativo?: boolean;
  created_at?: string;
};

// ── Learning / Aprendizagem ───────────────────────────────────
export type LearningProgress = {
  id: string;
  fazenda_id: string;
  user_id: string;
  lesson_id: string;
  completed: boolean;
  completed_at?: string;
  created_at?: string;
};

// ── Controller / Alertas ──────────────────────────────────────
export type ControllerAlerta = {
  id: string;
  fazenda_id: string;
  categoria: "Fiscal" | "Financeiro" | "Contratos" | "Lavoura" | "Cadastros" | "Estoque" | "Arrendamentos";
  severidade: "critico" | "alto" | "medio" | "baixo";
  titulo: string;
  descricao: string;
  affected_id?: string;
  affected_module?: string;
  suggested_action?: string;
  check_key: string;
  first_seen_at?: string;
  acknowledged_at?: string;
  acknowledged_by?: string;
  resolved_at?: string;
  created_at?: string;
};

// ── Suporte IA ────────────────────────────────────────────────
export type SuporteConversa = {
  id: string;
  fazenda_id: string;
  user_id: string;
  titulo?: string;
  created_at?: string;
  updated_at?: string;
};

export type SuporteMensagem = {
  id: string;
  conversa_id: string;
  fazenda_id: string;
  role: "user" | "assistant";
  content: string;
  created_at?: string;
};

// ── Pendências Operacionais (bot) ─────────────────────────────
export type PendenciaOperacional = {
  id: string;
  fazenda_id: string;
  tipo: string;
  subtipo?: string;
  status: "pendente" | "resolvida" | "cancelada";
  motivo?: string;
  descricao?: string;
  dados_originais: Record<string, unknown>;
  operacao_id?: string;
  produto_nome_pendente?: string;
  talhao_nome_pendente?: string;
  origem?: string;
  usuario_nome?: string;
  usuario_whatsapp?: string;
  criado_em?: string;
  resolvido_em?: string;
};
