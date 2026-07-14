// Motor conversacional — Claude com tool use
// O modelo decide o que perguntar, quais dados buscar e como responder.
// Zero menus fixos, zero classificador de intenção, zero máquina de estados.
import Anthropic from "@anthropic-ai/sdk";
import {
  consultaContasPagarSemana, consultaContasAtrasadas,
  consultaProximoVencimentoMoeda, consultaContasReceberMes,
  consultaSaldoProjetado, consultaGastoCategoria,
  consultaArrendamentosVencer, consultaSacasComprometidas,
  consultaEstoqueProduto, consultaEstoqueMinimo,
  consultaStatusLavoura, consultaProdutividade, consultaDRESumario,
} from "./whatsapp-consultas";
import { executarInsercao } from "./whatsapp-inserir";
import type { FluxoNome } from "./whatsapp-flows";

const claude = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ── Definição das ferramentas expostas ao Claude ────────────────────────────
const TOOLS: Anthropic.Tool[] = [
  {
    name: "consultar_contas_pagar",
    description: "Consulta contas a pagar: vencimentos da semana, contas atrasadas, próximo vencimento por moeda (dólar, euro), ou gasto por categoria (combustivel, defensivos, etc).",
    input_schema: {
      type: "object" as const,
      properties: {
        tipo: {
          type: "string",
          enum: ["semana", "atrasadas", "por_moeda", "por_categoria"],
          description: "Tipo de consulta",
        },
        moeda: { type: "string", description: "USD, EUR etc — só quando tipo=por_moeda" },
        categoria: { type: "string", description: "Ex: combustivel, defensivos, sementes — só quando tipo=por_categoria" },
      },
      required: ["tipo"],
    },
  },
  {
    name: "consultar_contas_receber",
    description: "Consulta contas a receber do mês.",
    input_schema: { type: "object" as const, properties: {}, required: [] },
  },
  {
    name: "consultar_saldo_projetado",
    description: "Mostra o saldo financeiro projetado até o fim do mês.",
    input_schema: { type: "object" as const, properties: {}, required: [] },
  },
  {
    name: "consultar_estoque",
    description: "Consulta estoque de insumos. Sem produto retorna itens abaixo do mínimo. Com produto busca um item específico.",
    input_schema: {
      type: "object" as const,
      properties: {
        produto: { type: "string", description: "Nome do produto/insumo a buscar (opcional)" },
      },
      required: [],
    },
  },
  {
    name: "consultar_contratos",
    description: "Consulta contratos de comercialização de grãos: sacas comprometidas por commodity e safra.",
    input_schema: {
      type: "object" as const,
      properties: {
        commodity: { type: "string", description: "soja, milho, algodao etc (opcional)" },
        safra: { type: "string", description: "Ex: 2024/2025 (opcional)" },
      },
      required: [],
    },
  },
  {
    name: "consultar_lavoura",
    description: "Consulta status das lavouras e talhões em andamento, ou produtividade da safra.",
    input_schema: {
      type: "object" as const,
      properties: {
        tipo: {
          type: "string",
          enum: ["status", "produtividade"],
          description: "status = operações em andamento; produtividade = sacas por ha",
        },
      },
      required: ["tipo"],
    },
  },
  {
    name: "consultar_arrendamentos",
    description: "Lista arrendamentos com vencimentos próximos.",
    input_schema: { type: "object" as const, properties: {}, required: [] },
  },
  {
    name: "consultar_dre",
    description: "Mostra o resultado econômico (DRE) da safra atual: receita, custos, margem.",
    input_schema: { type: "object" as const, properties: {}, required: [] },
  },
  {
    name: "registrar_abastecimento",
    description: "Registra abastecimento de combustível. REGRA CRÍTICA: se o usuário mencionar bomba da fazenda (interna), NÃO peça valor/preço — chame imediatamente com os dados que tiver; a ferramenta usa o custo médio do estoque automaticamente e NÃO gera CP. Só peça valor para postos externos. `valor` NUNCA é coletado antes de chamar — a ferramenta solicita se for necessário.",
    input_schema: {
      type: "object" as const,
      properties: {
        produto: { type: "string", description: "diesel s10, gasolina, etanol, arla etc" },
        quantidade: { type: "number", description: "Litros abastecidos" },
        valor: { type: "number", description: "Valor total em R$. SÓ para posto externo. Para bomba interna da fazenda NÃO preencher — o sistema usa o custo do estoque." },
        veiculo: { type: "string", description: "Número do patrimônio ou identificador da máquina/carro. Os números são únicos em toda a frota (não se repetem entre tratores e carros). Exemplos: 'Maquina 1' → veiculo='1'; 'Carro 30' → veiculo='30'; 'trator 5' → veiculo='5'. Extraia APENAS o número quando o usuário usar 'Maquina N' ou 'Carro N'." },
        bomba_nome: { type: "string", description: "Nome da bomba ou posto usado. **OBRIGATÓRIO** — sempre informe (ex: 'Bomba Fazenda', 'Posto Shell'). Pergunta ao usuário antes de chamar se não foi mencionado." },
        tipo_destino: { type: "string", enum: ["estoque", "direto"], description: "'estoque': comprou para repor o tanque interno da fazenda (deduz estoque). 'direto': abasteceu em posto externo ou direto na máquina sem passar pelo estoque — não há dedução de estoque. Padrão: direto." },
        vencimento: { type: "string", description: "Data de vencimento: hoje, amanhã, dd/mm/aaaa ou 'à vista'" },
        ja_pago: { type: "string", enum: ["sim", "nao"], description: "PAGAMENTO já feito (dinheiro transferido). Use 'sim' quando o usuário disser que já pagou, é à vista, pagou em dinheiro, débito ou PIX. IMPORTANTE: 'ja_pago' refere-se ao dinheiro pago, NÃO à nota fiscal — mesmo que a NF chegue depois, se o dinheiro já saiu use 'sim'." },
        forma_pagamento: { type: "string", description: "Forma de pagamento: dinheiro, PIX, débito, boleto etc" },
        conta_bancaria: { type: "string", description: "Nome da conta bancária usada para pagamento (ex: Sicredi, Bradesco, Caixa, Caixa Fazenda). Só preencha quando o usuário mencionar a conta." },
      },
      required: ["produto", "bomba_nome"],
    },
  },
  {
    name: "registrar_operacao_lavoura",
    description: "Registra uma operação de lavoura: pulverização, adubação, plantio ou correção de solo.",
    input_schema: {
      type: "object" as const,
      properties: {
        tipo_op: { type: "string", enum: ["pulverizacao", "adubacao", "plantio", "correcao_solo"], description: "Tipo de operação" },
        tipo_produto: { type: "string", enum: ["herbicida", "fungicida", "inseticida", "nematicida", "acaricida", "fertilizante_foliar", "regulador", "dessecacao", "outros"], description: "Tipo do produto aplicado (para pulverização)" },
        talhao: { type: "string", description: "Nome ou número do talhão" },
        produto: { type: "string", description: "Nome do insumo/produto aplicado" },
        dose: { type: "number", description: "Dose aplicada numericamente" },
        unidade: { type: "string", description: "L/ha, ml/ha, kg/ha, g/ha, sc/ha, etc" },
        area_ha: { type: "number", description: "Área em hectares onde a operação foi realizada" },
        ciclo: { type: "string", description: "Nome, descrição ou número do ciclo/safra (ex: 'milho safrinha', 'ciclo 2', 'soja 25/26')" },
        data_op: { type: "string", description: "Data da operação: hoje, ontem, ou dd/mm/aaaa" },
      },
      required: ["tipo_op", "talhao", "produto"],
    },
  },
  {
    name: "registrar_conta_pagar",
    description: "Lança uma conta a pagar no financeiro. Use ja_pago=sim quando o usuário diz que já pagou ou é à vista. Chame com os dados disponíveis — a ferramenta pede o que faltar.",
    input_schema: {
      type: "object" as const,
      properties: {
        descricao: { type: "string", description: "Descrição da conta" },
        valor: { type: "number", description: "Valor em R$" },
        vencimento: { type: "string", description: "Data de vencimento: hoje, amanhã, ou dd/mm/aaaa" },
        fornecedor: { type: "string", description: "Nome do fornecedor (opcional)" },
        categoria: { type: "string", description: "combustivel, defensivos, fertilizantes, arrendamento, manutencao, outros (opcional)" },
        ja_pago: { type: "string", enum: ["sim", "nao"], description: "Use 'sim' quando já foi pago, é à vista ou o usuário pede para lançar como pago/baixado" },
        conta_bancaria: { type: "string", description: "Nome da conta bancária usada para pagamento (ex: Sicredi, Bradesco, Caixa). Só preencha quando o usuário mencionar a conta." },
      },
      required: ["descricao"],
    },
  },
  {
    name: "registrar_conta_receber",
    description: "Lança uma conta a receber no financeiro. Chame com os dados disponíveis — a ferramenta pede o que faltar.",
    input_schema: {
      type: "object" as const,
      properties: {
        descricao: { type: "string", description: "Descrição da receita" },
        valor: { type: "number", description: "Valor em R$" },
        vencimento: { type: "string", description: "Data de recebimento: hoje, amanhã, ou dd/mm/aaaa" },
        cliente: { type: "string", description: "Nome do cliente/comprador (opcional)" },
        conta_bancaria: { type: "string", description: "Nome da conta bancária onde o recebimento será creditado (ex: Sicredi, Bradesco). Só preencha quando o usuário mencionar a conta." },
        ja_recebido: { type: "string", enum: ["sim", "nao"], description: "Use 'sim' quando o usuário disser que já recebeu / já caiu na conta. CR será lançado como baixado." },
      },
      required: ["descricao"],
    },
  },
  {
    name: "vincular_nf",
    description: "Vincula uma nota fiscal (NF-e) a um lançamento de Contas a Pagar existente. Use quando o usuário informar que chegou a nota fiscal de uma compra anterior (ex: 'chegou a NF 001234 do abastecimento').",
    input_schema: {
      type: "object" as const,
      properties: {
        nf_numero:   { type: "string", description: "Número da nota fiscal (ex: 001234)" },
        nf_emitente: { type: "string", description: "Nome do emitente/fornecedor (ex: Posto Shell, Agroloja)" },
        busca:       { type: "string", description: "Trecho da descrição do lançamento para localizar o CP correto (ex: 'abastecimento diesel', 'posto')" },
      },
      required: ["nf_numero"],
    },
  },
  {
    name: "registrar_nf_compra",
    description: "Registra uma NF de compra extraída de foto ou PDF. SEMPRE chame com confirmado=false primeiro para mostrar preview. Só use confirmado=true após o usuário dizer 'sim'/'confirmo'. Esta ferramenta faz TUDO: (1) cadastra fornecedor automaticamente se não existir, (2) cadastra produto no estoque se não existir, (3) lança entrada no estoque, (4) lança Conta a Pagar no financeiro. Use esta ferramenta quando o usuário pedir para cadastrar fornecedor+produto+estoque+financeiro a partir de uma NF.",
    input_schema: {
      type: "object" as const,
      properties: {
        razao_social:    { type: "string",  description: "Razão social do emitente/fornecedor" },
        cnpj_emitente:   { type: "string",  description: "CNPJ do emitente (apenas dígitos ou formatado)" },
        numero_nf:       { type: "string",  description: "Número da nota fiscal" },
        data_emissao:    { type: "string",  description: "Data de emissão no formato YYYY-MM-DD" },
        valor_total:     { type: "number",  description: "Valor total da nota em R$" },
        vencimento:      { type: "string",  description: "Data de vencimento para CP: hoje, amanhã, dd/mm/aaaa" },
        confirmado:      { type: "boolean", description: "false = apenas preview (padrão). true = salvar no sistema. Só use true após o usuário confirmar." },
        tipo_nf:         { type: "string", enum: ["produto", "servico"], description: "Tipo da nota: 'produto' = NF-e de mercadorias/insumos físicos (sementes, fertilizantes, peças, equipamentos, combustível). 'servico' = NFS-e ou nota de serviços (consultoria, honorários, manutenção, TI, contabilidade, assessoria). Analise o emitente e os itens para decidir." },
        itens: {
          type: "array",
          description: "Lista de itens da nota fiscal",
          items: {
            type: "object" as const,
            properties: {
              descricao:      { type: "string", description: "Descrição do produto/serviço" },
              quantidade:     { type: "number", description: "Quantidade" },
              unidade:        { type: "string", description: "Unidade (PC, UN, KG, L etc)" },
              valor_unitario: { type: "number", description: "Valor unitário em R$" },
            },
            required: ["descricao"],
          },
        },
      },
      required: ["razao_social", "valor_total"],
    },
  },
  {
    name: "cadastrar_fornecedor",
    description: "Cadastra um fornecedor (Pessoa) na fazenda. Use quando o usuário pedir para cadastrar um fornecedor, parceiro comercial ou prestador de serviço sem estar no contexto de uma NF.",
    input_schema: {
      type: "object" as const,
      properties: {
        nome:     { type: "string", description: "Nome ou razão social do fornecedor" },
        cnpj:     { type: "string", description: "CNPJ (14 dígitos) ou CPF (11 dígitos)" },
        telefone: { type: "string", description: "Telefone de contato (opcional)" },
        email:    { type: "string", description: "E-mail (opcional)" },
      },
      required: ["nome"],
    },
  },
  {
    name: "cadastrar_insumo",
    description: "Cadastra um produto/insumo no estoque da fazenda. Use quando o usuário pedir para cadastrar um produto, insumo, semente, fertilizante, defensivo ou qualquer item no estoque, sem estar no contexto de uma NF.",
    input_schema: {
      type: "object" as const,
      properties: {
        nome:             { type: "string", description: "Nome do produto/insumo" },
        unidade:          { type: "string", description: "Unidade de medida: kg, L, mL, g, t, sc, un, cx, pc etc" },
        categoria:        { type: "string", description: "semente, fertilizante, defensivo, combustivel, inoculante, outros (opcional — inferido automaticamente se omitido)" },
        valor_unitario:   { type: "number", description: "Preço unitário em R$ (opcional)" },
        estoque_inicial:  { type: "number", description: "Quantidade inicial em estoque (opcional, padrão 0)" },
      },
      required: ["nome"],
    },
  },
  {
    name: "registrar_contrato_graos",
    description: "Registra um contrato de comercialização de grãos (venda de soja, milho, algodão etc). SEMPRE chame com confirmado=false primeiro para mostrar o resumo. Só use confirmado=true após o usuário confirmar com 'sim'. Captura: número do contrato, comprador, CNPJ do comprador, safra, quantidade em sacas, preço (R$ ou US$), data de entrega, prazo de pagamento, dados bancários e local de entrega.",
    input_schema: {
      type: "object" as const,
      properties: {
        numero:           { type: "string",  description: "Número do contrato (ex: 4600089605/2027)" },
        comprador:        { type: "string",  description: "Nome da empresa compradora" },
        comprador_cnpj:   { type: "string",  description: "CNPJ do comprador (opcional)" },
        vendedor_cpf:     { type: "string",  description: "CPF ou nome do vendedor/produtor (opcional)" },
        produto:          { type: "string",  description: "Commodity: Soja, Milho, Milho 2ª, Algodão, Sorgo, Trigo" },
        safra:            { type: "string",  description: "Safra do contrato: ex '26/27', '2026/2027'" },
        quantidade_sc:    { type: "number",  description: "Quantidade em sacas de 60kg" },
        preco:            { type: "number",  description: "Preço por saca (número puro, sem símbolo)" },
        moeda:            { type: "string",  enum: ["BRL", "USD"], description: "Moeda do preço: BRL (reais) ou USD (dólar)" },
        modalidade:       { type: "string",  enum: ["fixo", "a_fixar", "barter"], description: "fixo = preço travado; a_fixar = preço a definir; barter = troca por insumos. Padrão: fixo se tiver preço." },
        data_entrega:     { type: "string",  description: "Data de entrega: dd/mm/aaaa" },
        data_pagamento:   { type: "string",  description: "Prazo de pagamento: dd/mm/aaaa" },
        dados_bancarios:  { type: "string",  description: "Dados bancários para recebimento (banco, agência, conta)" },
        local_entrega:    { type: "string",  description: "Local/destino de entrega da mercadoria" },
        data_contrato:    { type: "string",  description: "Data de assinatura do contrato: dd/mm/aaaa" },
        confirmado:       { type: "boolean", description: "false = mostra resumo para confirmar (padrão). true = salva no sistema após confirmação do usuário." },
      },
      required: ["comprador", "produto", "quantidade_sc"],
    },
  },
  {
    name: "registrar_recomendacao_agronomica",
    description: "Registra uma Receita/Recomendação Agronômica no sistema. Use quando o agrônomo enviar uma receita de pulverização, adubação, plantio, correção de solo ou tratamento de sementes. Capture todos os dados da recomendação e mostre o resumo (confirmado=false) antes de salvar. Só salva com confirmado=true após o usuário confirmar.",
    input_schema: {
      type: "object" as const,
      properties: {
        tipo:               { type: "string", enum: ["pulverizacao","adubacao","plantio","correcao_solo","tratamento_sementes","colheita"], description: "Tipo de operação recomendada" },
        agronomo_nome:      { type: "string", description: "Nome do agrônomo responsável pela recomendação" },
        agronomo_crea:      { type: "string", description: "Número do CREA do agrônomo (opcional)" },
        codigo:             { type: "string", description: "Código/número da receita ou recomendação (opcional)" },
        data_recomendacao:  { type: "string", description: "Data da recomendação: dd/mm/aaaa ou 'hoje'" },
        data_prevista_inicio: { type: "string", description: "Data prevista para início da operação: dd/mm/aaaa" },
        data_prevista_fim:    { type: "string", description: "Data prevista para fim da operação: dd/mm/aaaa" },
        talhoes: {
          type: "array",
          description: "Lista de talhões/áreas onde a operação será realizada",
          items: {
            type: "object",
            properties: {
              nome:    { type: "string",  description: "Nome ou identificação do talhão" },
              area_ha: { type: "number",  description: "Área em hectares" },
            },
          },
        },
        produtos: {
          type: "array",
          description: "Produtos/insumos recomendados com dose e unidade",
          items: {
            type: "object",
            properties: {
              produto: { type: "string", description: "Nome do produto/insumo" },
              dose:    { type: "number", description: "Dose por hectare (número)" },
              unidade: { type: "string", description: "Unidade da dose: L/ha, kg/ha, ml/ha, g/ha, sc/ha" },
            },
          },
        },
        // Condições de aplicação (pulverização)
        vazao_lha:       { type: "number", description: "Vazão em L/ha (pulverização)" },
        cap_tanque_l:    { type: "number", description: "Capacidade do tanque em litros (pulverização)" },
        bico:            { type: "string", description: "Tipo de bico pulverizador (ex: TT110015)" },
        pressao_min:     { type: "number", description: "Pressão mínima (bar)" },
        pressao_max:     { type: "number", description: "Pressão máxima (bar)" },
        ph_min:          { type: "number", description: "pH mínimo da calda" },
        ph_max:          { type: "number", description: "pH máximo da calda" },
        velocidade_min:  { type: "number", description: "Velocidade mínima de aplicação (km/h)" },
        velocidade_max:  { type: "number", description: "Velocidade máxima de aplicação (km/h)" },
        vento_max:       { type: "number", description: "Velocidade máxima do vento (km/h)" },
        umidade_min:     { type: "number", description: "Umidade relativa mínima (%)" },
        umidade_max:     { type: "number", description: "Umidade relativa máxima (%)" },
        temperatura_min: { type: "number", description: "Temperatura mínima (°C)" },
        temperatura_max: { type: "number", description: "Temperatura máxima (°C)" },
        observacoes:     { type: "string", description: "Observações gerais da recomendação" },
        confirmado:      { type: "boolean", description: "false = mostra resumo (padrão). true = salva após confirmação do usuário." },
      },
      required: ["tipo", "agronomo_nome"],
    },
  },
  {
    name: "registrar_romaneio",
    description: "Registra um romaneio de saída/colheita de grãos. SEMPRE chame com confirmado=false primeiro para mostrar o resumo. Só use confirmado=true após o usuário confirmar com 'sim'. Quando o usuário enviar foto de um ticket de balança: extraia commodity, placa, peso bruto, tara, umidade e impureza da imagem. Sempre pergunte (ou extraia) a safra/ciclo — sem ela o romaneio fica perdido. Pergunte também sobre o contrato se não mencionado.",
    input_schema: {
      type: "object" as const,
      properties: {
        commodity:  { type: "string", description: "Produto: soja, milho, algodão, sorgo, trigo" },
        talhao:     { type: "string", description: "Nome ou número do talhão de origem (se visível no ticket ou mencionado)" },
        placa:      { type: "string", description: "Placa do caminhão (ex: ABC1D23)" },
        peso_bruto: { type: "number", description: "Peso bruto em kg" },
        tara:       { type: "number", description: "Tara do veículo em kg" },
        umidade:    { type: "number", description: "Umidade em % — extraia do ticket se visível (ex: 13.5)" },
        impureza:   { type: "number", description: "Impureza/materiais estranhos em % — extraia do ticket se visível" },
        safra:      { type: "string", description: "Safra/ciclo: ex '2025/2026', '25/26', 'soja 25/26'. OBRIGATÓRIO — pergunte ao usuário se não estiver na foto ou no contexto." },
        contrato:   { type: "string", description: "Número do contrato de venda ou nome do comprador. Pergunte se não foi mencionado — vincula a entrega ao contrato correto." },
        destino:    { type: "string", description: "Destino da carga: nome do armazém, cooperativa ou comprador (opcional)" },
        data:       { type: "string", description: "Data do romaneio: hoje, ontem, dd/mm/aaaa. Padrão: hoje" },
        confirmado: { type: "boolean", description: "false = mostra resumo para confirmar (padrão). true = salva no sistema após o usuário confirmar com 'sim'." },
      },
      required: ["commodity", "placa", "peso_bruto", "tara", "safra"],
    },
  },
];

// ── Executor das ferramentas ────────────────────────────────────────────────
async function executarFerramenta(
  nome: string,
  input: Record<string, unknown>,
  fazendaId: string,
  usuarioId: string,
  usuarioNome: string,
  usuarioWhatsapp: string,
): Promise<string> {
  try {
    switch (nome) {
      case "consultar_contas_pagar": {
        const tipo = String(input.tipo ?? "semana");
        if (tipo === "atrasadas") return consultaContasAtrasadas(fazendaId);
        if (tipo === "por_moeda" && input.moeda) return consultaProximoVencimentoMoeda(fazendaId, String(input.moeda));
        if (tipo === "por_categoria" && input.categoria) return consultaGastoCategoria(fazendaId, String(input.categoria));
        return consultaContasPagarSemana(fazendaId);
      }
      case "consultar_contas_receber":
        return consultaContasReceberMes(fazendaId);
      case "consultar_saldo_projetado":
        return consultaSaldoProjetado(fazendaId);
      case "consultar_estoque":
        if (input.produto) return consultaEstoqueProduto(fazendaId, String(input.produto));
        return consultaEstoqueMinimo(fazendaId);
      case "consultar_contratos":
        return consultaSacasComprometidas(
          fazendaId,
          input.commodity ? String(input.commodity) : undefined,
          input.safra ? String(input.safra) : undefined,
        );
      case "consultar_lavoura":
        if (String(input.tipo ?? "") === "produtividade") return consultaProdutividade(fazendaId);
        return consultaStatusLavoura(fazendaId);
      case "consultar_arrendamentos":
        return consultaArrendamentosVencer(fazendaId);
      case "consultar_dre":
        return consultaDRESumario(fazendaId);

      case "registrar_abastecimento": {
        const res = await executarInsercao("abastecimento", {
          produto: input.produto,
          quantidade: input.quantidade,
          valor: input.valor,
          veiculo: input.veiculo,
          bomba_nome: input.bomba_nome ?? "",
          tipo_destino: input.tipo_destino ?? "direto",
          vencimento: input.vencimento ?? "hoje",
          ja_pago: input.ja_pago ?? "nao",
          forma_pagamento: input.forma_pagamento ?? "",
          conta_bancaria: input.conta_bancaria ?? "",
          tem_nf: "nao",
        }, fazendaId, usuarioId, usuarioNome, usuarioWhatsapp);
        return res.mensagem;
      }
      case "registrar_operacao_lavoura": {
        const res = await executarInsercao("operacao_lavoura", {
          tipo_op: String(input.tipo_op ?? "pulverizacao"),
          tipo_produto: String(input.tipo_produto ?? "herbicida"),
          talhao: input.talhao,
          produto: input.produto,
          dose: input.dose ?? 0,
          unidade: input.unidade ?? "L/ha",
          area_ha: input.area_ha ?? 0,
          ciclo: input.ciclo ?? "",
          data_op: input.data_op ?? "hoje",
        }, fazendaId, usuarioId, usuarioNome, usuarioWhatsapp);
        return res.mensagem;
      }
      case "registrar_conta_pagar": {
        const res = await executarInsercao("lancar_cp", {
          descricao: input.descricao,
          valor: input.valor,
          vencimento: input.vencimento,
          fornecedor: input.fornecedor ?? "",
          categoria: input.categoria ?? "outros",
          ja_pago: input.ja_pago ?? "nao",
          conta_bancaria: input.conta_bancaria ?? "",
        }, fazendaId, usuarioId, usuarioNome, usuarioWhatsapp);
        return res.mensagem;
      }
      case "registrar_conta_receber": {
        const res = await executarInsercao("lancar_cr", {
          descricao: input.descricao,
          valor: input.valor,
          vencimento: input.vencimento,
          cliente: input.cliente ?? "",
          conta_bancaria: input.conta_bancaria ?? "",
          ja_recebido: input.ja_recebido ?? "nao",
        }, fazendaId, usuarioId, usuarioNome, usuarioWhatsapp);
        return res.mensagem;
      }
      case "registrar_nf_compra": {
        const res = await executarInsercao("nf_compra_foto", {
          razao_social:  input.razao_social,
          cnpj_emitente: input.cnpj_emitente ?? "",
          numero_nf:     input.numero_nf ?? "",
          data_emissao:  input.data_emissao ?? "",
          valor_total:   input.valor_total ?? 0,
          vencimento:    input.vencimento ?? "hoje",
          itens:         input.itens ?? [],
          confirmado:    input.confirmado === true,
        }, fazendaId, usuarioId, usuarioNome, usuarioWhatsapp);
        return res.mensagem;
      }
      case "vincular_nf": {
        const res = await executarInsercao("vincular_nf", {
          nf_numero:   input.nf_numero,
          nf_emitente: input.nf_emitente ?? "",
          busca:       input.busca ?? "",
        }, fazendaId, usuarioId, usuarioNome, usuarioWhatsapp);
        return res.mensagem;
      }
      case "cadastrar_fornecedor": {
        const res = await executarInsercao("cadastrar_fornecedor", {
          nome:     input.nome,
          cnpj:     input.cnpj ?? "",
          telefone: input.telefone ?? "",
          email:    input.email ?? "",
        }, fazendaId, usuarioId, usuarioNome, usuarioWhatsapp);
        return res.mensagem;
      }
      case "cadastrar_insumo": {
        const res = await executarInsercao("cadastrar_insumo", {
          nome:            input.nome,
          unidade:         input.unidade ?? "un",
          categoria:       input.categoria ?? "",
          valor_unitario:  input.valor_unitario ?? 0,
          estoque_inicial: input.estoque_inicial ?? 0,
        }, fazendaId, usuarioId, usuarioNome, usuarioWhatsapp);
        return res.mensagem;
      }
      case "registrar_contrato_graos": {
        const res = await executarInsercao("contrato_graos", {
          numero:          input.numero ?? "",
          comprador:       input.comprador,
          comprador_cnpj:  input.comprador_cnpj ?? "",
          vendedor_cpf:    input.vendedor_cpf ?? "",
          produto:         input.produto,
          safra:           input.safra ?? "",
          quantidade_sc:   input.quantidade_sc,
          preco:           input.preco ?? 0,
          moeda:           input.moeda ?? "BRL",
          modalidade:      input.modalidade ?? "",
          data_entrega:    input.data_entrega ?? "",
          data_pagamento:  input.data_pagamento ?? "",
          dados_bancarios: input.dados_bancarios ?? "",
          local_entrega:   input.local_entrega ?? "",
          data_contrato:   input.data_contrato ?? "",
          confirmado:      input.confirmado === true,
        }, fazendaId, usuarioId, usuarioNome, usuarioWhatsapp);
        return res.mensagem;
      }
      case "registrar_romaneio": {
        const res = await executarInsercao("registrar_romaneio", {
          commodity:  input.commodity ?? "soja",
          talhao:     input.talhao ?? "",
          placa:      input.placa ?? "",
          peso_bruto: input.peso_bruto ?? 0,
          tara:       input.tara ?? 0,
          umidade:    input.umidade ?? null,
          impureza:   input.impureza ?? null,
          safra:      input.safra ?? "",
          contrato:   input.contrato ?? "",
          destino:    input.destino ?? "",
          data:       input.data ?? "hoje",
          confirmado: input.confirmado === true,
        }, fazendaId, usuarioId, usuarioNome, usuarioWhatsapp);
        return res.mensagem;
      }
      case "registrar_recomendacao_agronomica": {
        const res = await executarInsercao("recomendacao_agronomica", {
          tipo:               input.tipo ?? "pulverizacao",
          agronomo_nome:      input.agronomo_nome ?? "",
          agronomo_crea:      input.agronomo_crea ?? "",
          codigo:             input.codigo ?? "",
          data_recomendacao:  input.data_recomendacao ?? "hoje",
          data_prevista_inicio: input.data_prevista_inicio ?? "",
          data_prevista_fim:    input.data_prevista_fim ?? "",
          talhoes:            input.talhoes ?? [],
          produtos:           input.produtos ?? [],
          vazao_lha:          input.vazao_lha ?? null,
          cap_tanque_l:       input.cap_tanque_l ?? null,
          bico:               input.bico ?? "",
          pressao_min:        input.pressao_min ?? null,
          pressao_max:        input.pressao_max ?? null,
          ph_min:             input.ph_min ?? null,
          ph_max:             input.ph_max ?? null,
          velocidade_min:     input.velocidade_min ?? null,
          velocidade_max:     input.velocidade_max ?? null,
          vento_max:          input.vento_max ?? null,
          umidade_min:        input.umidade_min ?? null,
          umidade_max:        input.umidade_max ?? null,
          temperatura_min:    input.temperatura_min ?? null,
          temperatura_max:    input.temperatura_max ?? null,
          observacoes:        input.observacoes ?? "",
          confirmado:         input.confirmado === true,
        }, fazendaId, usuarioId, usuarioNome, usuarioWhatsapp);
        return res.mensagem;
      }
      default:
        return "Ferramenta não reconhecida.";
    }
  } catch (err) {
    console.error(`[CLAUDE-TOOL] erro em ${nome}:`, err);
    return `Erro ao executar ${nome}: ${String(err)}`;
  }
}

// ── Histórico de conversa (últimas N trocas) ────────────────────────────────
export type Mensagem = { role: "user" | "assistant"; content: string };

// ── Detecta intenção de registro para forçar tool_choice: any ───────────────
// Sem isso, Claude pode fabricar ✅ sem chamar a ferramenta (stop_reason=end_turn)
function deveForcarFerramenta(texto: string, historico: Mensagem[]): boolean {
  const t = texto.toLowerCase().trim();

  // Foto de NF injetada → sempre força ferramenta
  if (t.includes("[usuário enviou uma imagem. dados extraídos:")) return true;

  const kw = [
    "plantio", "plantei", "plantou", "plantar", "fiz o plantio",
    "pulveriz", "apliquei", "aplicou", "aplicar", "apliquei herbicida",
    "apliquei fungicida", "apliquei inseticida",
    "abasteç", "abasteceu", "abasteci", "abastecimento",
    "adub", "fertiliz",
    "correção de solo", "calcário", "calcario", "gessagem", "gesso agrícola",
    "registrar", "registrei", "registrou", "lançar", "lançamento",
    "conta a pagar", "cp de", "cr de", "conta a receber",
    "comprei", "compra de", "paguei", "recebi", "gastei",
    "cadastrar", "cadastra ", "cadastre", "cadastrei",
    "contrato de venda", "contrato de grão", "contrato de soja", "contrato de milho",
    "contrato de algodão", "vender soja", "vender milho", "fechei contrato",
    "fechamos contrato", "novo contrato", "registrar contrato",
    "recomendação", "recomendacao", "receita agronômica", "receita agronomica",
    "rec técnica", "rec tecnica", "prescrição", "prescricao", "agronomo recomenda",
    "agrônomo recomenda", "crea", "receita de aplicação", "receita de aplicacao",
    "romaneio", "ticket balança", "ticket balanca", "peso bruto", "tara caminhão", "tara caminhao",
    "saída de grão", "saida de grao", "embarque", "expedição de grão", "expedicao de grao",
  ];
  if (kw.some(k => t.includes(k))) return true;

  // Histórico: último turno do assistente fez pergunta → usuário respondendo
  const ultimoAss = [...historico].reverse().find(m => m.role === "assistant");
  const ultimoTxt = typeof ultimoAss?.content === "string" ? ultimoAss.content : "";
  if (ultimoTxt.includes("❓")) return true;

  // Usuário confirmando preview de qualquer fluxo ("sim", "confirmo", "pode registrar", "ok registra")
  const confirma = /^(sim|confirmo|confirmar|pode|pode registrar|ok|registra|isso|correto|certo|pode salvar|salva)[\s!.]*$/.test(t);
  const temPreview = ultimoTxt.includes("Confirma?") || ultimoTxt.includes("para registrar") || ultimoTxt.includes("para salvar");
  if (confirma && temPreview) return true;

  return false;
}

// ── Processador principal ───────────────────────────────────────────────────
export type IAResult = { texto: string; pendingContrato?: Record<string, unknown> };

export async function processarMensagemIA(
  texto: string,
  contexto: { fazendaId: string; fazendaNome: string; usuarioId: string; usuarioNome?: string; usuarioWhatsapp?: string },
  historico: Mensagem[],
  imagem?: { base64: string; mime: string },
): Promise<IAResult> {
  const { fazendaId, fazendaNome, usuarioId, usuarioNome = "", usuarioWhatsapp = "" } = contexto;
  const hoje = new Date().toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long", year: "numeric" });

  const systemPrompt = `Você é o *Arato*, assistente de gestão agrícola da fazenda *${fazendaNome}*, operando via WhatsApp.
Hoje é ${hoje}.

Seu papel: ajudar o produtor a consultar informações do ERP e registrar operações do dia a dia.

REGRA #1 — NUNCA RESPONDA ANTES DE CHAMAR A FERRAMENTA:
Quando o usuário mencionar plantio, pulverização, adubação, abastecimento, conta a pagar, conta a receber — chame a ferramenta ANTES de gerar qualquer texto de confirmação.
- Chame a ferramenta IMEDIATAMENTE com os dados que tiver, mesmo que incompletos.
- NÃO faça perguntas antes de chamar a ferramenta. Chame primeiro, a ferramenta pergunta o que falta.
- Se a ferramenta retornar ❓pergunta, repasse a pergunta ao usuário.
- Quando o usuário responder, chame a ferramenta NOVAMENTE com TODOS os dados acumulados (anteriores + novos).
- NUNCA GERE ✅ POR CONTA PRÓPRIA. Só confirme "registrado" quando a ferramenta retornar ✅ no resultado.

REGRA #2 — COPIE O RESULTADO DA FERRAMENTA EXATAMENTE:
- Quando a ferramenta retornar texto, copie-o PALAVRA POR PALAVRA para o usuário.
- NÃO reformate, NÃO crie novas listas, NÃO adicione campos como "Tipo:", "Ciclo:", "Área:", "Data:".
- Se a ferramenta retornou "✅ Pulverização registrada!\n• Talhão: X\n• Produto: Y", escreva exatamente isso.
- ABSOLUTAMENTE PROIBIDO: gerar "✅ Pronto! Operação registrada:" ou qualquer ✅ com lista de campos de entrada sem que a ferramenta tenha executado e retornado esse texto.

REGRA #3 — ABASTECIMENTO COM BOMBA INTERNA:
- Se o usuário mencionar "bomba fazenda", "tanque fazenda", "bomba interna" ou qualquer bomba da propriedade:
  → Chame a ferramenta registrar_abastecimento IMEDIATAMENTE sem perguntar preço, valor ou custo.
  → A ferramenta usa o custo médio do estoque automaticamente. Sem CP gerado.
- NUNCA pergunte "Qual o valor?" ou "Qual o preço por litro?" para bomba interna.
- Se a ferramenta retornar ❓ pedindo nome da bomba → repasse a pergunta. Para qualquer outra resposta ❓ → repasse sem reformular.

REGRA #4 — ja_pago vs nota fiscal:
- ja_pago="sim" = dinheiro já saiu da conta. "paguei em dinheiro/pix/débito/à vista" → ja_pago="sim".
- Nota fiscal é separada — pode chegar depois. Não afeta ja_pago.

REGRA #5 — CONTEXTO CONTÍNUO:
- Ao responder, leia o histórico completo da conversa.
- Se a ferramenta pediu uma informação e o usuário respondeu, use os dados acumulados na próxima chamada.
- NUNCA peça novamente algo que o usuário já informou.

REGRA #6 — FOTO DE NOTA FISCAL:
Quando o usuário enviar uma imagem/PDF ou pedir para registrar uma NF de compra:
- LEIA a imagem/PDF para extrair: razão social, CNPJ, número da NF, data de emissão, valor total, itens (descrição/quantidade/unidade/valor).
- CLASSIFIQUE o tipo da nota no campo tipo_nf ANTES de chamar a ferramenta:
  • tipo_nf="produto" → NF-e de mercadorias físicas: sementes, fertilizantes, defensivos, peças, combustível, equipamentos, embalagens. O emitente é uma empresa que vende produtos físicos. O documento tem DANFE, CFOP de compra (ex: 1101, 1201, 1102).
  • tipo_nf="servico" → NFS-e ou nota de serviços: consultoria, honorários, assessoria, manutenção, serviços de TI, contabilidade, jurídico, marketing, frete avulso. O emitente é um prestador de serviços. O documento pode ter cabeçalho "Nota Fiscal de Serviços Eletrônica" ou "NFS-e". Os itens descrevem atividades intangíveis.
  • Dúvida: prefira "produto" apenas quando houver itens claramente físicos e quantificáveis (kg, L, unidades de produto). Uma empresa de consultoria nunca emite NF-e de produto.
- IMEDIATAMENTE chame registrar_nf_compra com confirmado=false, todos os dados extraídos, tipo_nf classificado + vencimento do texto do usuário (se mencionado) ou "hoje".
- Mesmo que a imagem esteja girada, torta ou parcialmente legível — use os dados parciais. NUNCA diga "não consigo ler" ou "não tenho essa função".
- NF de PRODUTO → cadastra fornecedor, cadastra produtos no estoque, lança entrada no estoque, cria Conta a Pagar.
- NF de SERVIÇO → cadastra prestador, registra na aba NF de Serviços, cria Conta a Pagar. NÃO movimenta estoque.
- Quando usuário responder "sim", "confirmo" ou similar → chame com confirmado=true e os MESMOS dados.
- Se a imagem vier junto com texto ("vencimento 30/05/2026", "conta caixa") → use essas informações nos campos.

REGRA #7 — CADASTRO SEM NF:
- Se o usuário pedir para cadastrar um fornecedor sem foto/NF → use cadastrar_fornecedor.
- Se o usuário pedir para cadastrar um produto/insumo no estoque sem foto/NF → use cadastrar_insumo.
- NUNCA diga "não tenho essa função" para cadastros. Sempre use a ferramenta correta.

REGRA #8 — CONTRATO DE COMERCIALIZAÇÃO DE GRÃOS:
- Quando o usuário enviar foto/PDF de um contrato de venda de grãos (soja, milho, algodão), ou descrever os termos de um contrato verbalmente/em texto:
  → LEIA o documento (se for imagem/PDF) e extraia: número do contrato, compradora, CNPJ da compradora, CPF/nome do vendedor, commodity, safra, quantidade de sacas, preço por saca, moeda (R$ ou US$), data de entrega, prazo de pagamento, dados bancários, local de entrega, data de assinatura.
  → Chame registrar_contrato_graos com confirmado=false imediatamente.
  → NÃO diga "não tenho campos para isso" — A FERRAMENTA TEM TODOS OS CAMPOS.
  → Quando o usuário confirmar com "sim", chame novamente com confirmado=true e os MESMOS dados.
- Campos de preço em dólar: preencha moeda="USD" e o número puro em preco (ex: 20.50, não "US$ 20,50").
- "convertido pela PTAX" indica que moeda=USD — registre assim, o sistema gerencia a conversão.
- Contrato de arrendamento ≠ contrato de venda de grãos — para arrendamento use registrar_conta_pagar com categoria="arrendamento".

REGRA #9 — PEDIDO DE COMPRA ≠ NOTA FISCAL:
- Um PEDIDO DE COMPRA (purchase order, PO, ordem de compra) é um documento ANTES da entrega — não é uma NF.
  Sinais visuais: título "PEDIDO DE COMPRA", "ORDEM DE COMPRA", "PO Nº", sem CNPJ emitente/destinatário completo, sem CHAVE DE ACESSO, sem "DANFE", sem numeração fiscal.
- Uma NOTA FISCAL (NF-e, NF de entrada) é um documento APÓS a entrega — tem CNPJ, número de NF, chave de acesso 44 dígitos, valor total.
- Se o documento enviado for um PEDIDO DE COMPRA e NÃO uma NF:
  → NÃO chame registrar_nf_compra
  → Responda: "📋 Parece um *pedido de compra*, não uma NF fiscal. Deseja que eu registre uma Conta a Pagar com os dados desse pedido? Ou aguardamos a NF chegar para lançar o estoque?"
  → Se o usuário confirmar que quer lançar o CP → use registrar_conta_pagar com os dados do pedido.
- Se não tiver certeza se é NF ou pedido: pergunte ao usuário antes de chamar qualquer ferramenta.

REGRA #10 — RECOMENDAÇÃO AGRONÔMICA:
- Quando o agrônomo enviar uma receita/recomendação agronômica (texto descrevendo produtos, doses, talhões, condições de aplicação, CREA):
  → Leia o documento/texto e extraia: tipo de operação, nome e CREA do agrônomo, código da receita, data, talhões e áreas, produtos e doses, condições de aplicação.
  → Chame registrar_recomendacao_agronomica com confirmado=false para mostrar o resumo.
  → Quando o usuário confirmar com "sim", chame novamente com confirmado=true.
- Campo talhoes: array JSON [{nome: "Talhão A-01", area_ha: 45.0}, ...] — extraia nomes e áreas do texto.
- Campo produtos: array JSON [{produto: "Herbicida X", dose: 1.5, unidade: "L/ha"}, ...] — extraia todos os produtos.
- Para pulverização, capture também: vazão (L/ha), bico, pressão (min/max), pH calda, velocidade (min/max), vento máximo, umidade (min/max), temperatura (min/max).
- Se o documento for uma foto/PDF de receita agronômica → leia o documento e chame a ferramenta com todos os dados extraídos.

REGRA #11 — ROMANEIO POR FOTO (ticket de balança):
- Quando o usuário enviar foto de um *ticket de balança* (romaneio físico), ou mencionar pesos de saída de grãos:
  → LEIA a imagem e extraia: commodity, placa, peso bruto, tara, umidade, impureza (o que estiver visível).
  → Se a safra/ciclo *não estiver na foto* e *não for mencionada no texto*, pergunte ANTES de chamar a ferramenta: "❓ Qual a safra desse romaneio? (ex: Soja 25/26, Milho 2ª 25/26)"
  → Se o contrato *não for mencionado*, inclua no texto de confirmação: "Deseja vincular a um contrato de venda? (informe o número ou o comprador)"
  → Chame registrar_romaneio com confirmado=false mostrando o resumo completo.
  → Quando o usuário confirmar com "sim", chame novamente com confirmado=true e os MESMOS dados.
- Romaneio de saída ≠ romaneio de colheita interna (colhedora). Para colheita no campo use registrar_operacao_lavoura.
- NUNCA registre um romaneio sem safra/ciclo definido — peça ao usuário se não estiver disponível.

REGRA #12 — DÚVIDAS SOBRE O SISTEMA (como usar o Arato):
Quando o usuário perguntar "como faço X", "onde fica Y", "como configuro Z" ou pedir ajuda para navegar no sistema, responda com guia passo a passo usando os caminhos reais de menu.

*Caminhos principais:*
• Dashboard — visão geral, preços de mercado, alertas ativos
• Lavoura → Plantio / Pulverização / Adubação / Colheita / Planejamento / Relatórios
• Comercial → Contratos de Grãos / Romaneio / Expedição / Arrendamentos
• Financeiro → Fluxo de Caixa / CP / CR / Contratos Financeiros / Tesouraria / Seguros
• Compras & Estoque → Pedidos de Compra / NF de Produtos / NF de Serviços / Pendências de Classificação / Regras de Classificação
• Fiscal → NF-e Emitidas / GNRE / eSocial / SPED ECD
• Relatórios → DRE Agrícola / Aplicações por Ciclo / BI de Grãos
• Cadastros → Fazendas / Produtores / Pessoas / Ciclos / Insumos / Depósitos / Padrões de Classificação
• Configurações → Automações / Parâmetros do Sistema / Classificação / Importações / Rateio

*Fluxos mais perguntados:*
1. Emitir NF-e: Configurações → Parâmetros do Sistema → preencher CNPJ, IE, série, certificado A1 → ao confirmar contrato de grãos a NF-e é gerada automaticamente
2. Configurar SIEG: Configurações → Automações → card SIEG → inserir API Key + CNPJs → ativar toggle
3. Registrar colheita: Lavoura → Colheita → + Novo Romaneio → talhão, ciclo, peso bruto, tara, classificação ABIOVE
4. Lançar CP manual: Financeiro → CP → + Nova → descrição, valor, vencimento, categoria, conta bancária
5. Ver DRE: Relatórios → DRE Agrícola → selecionar ano safra e ciclos → exportar PDF
6. Cadastrar arrendamento: Cadastros → Fazendas → abrir fazenda → aba Arrendamentos → + Novo
7. Configurar alertas de vencimento: Configurações → Automações → ativar "Alertas de Vencimento" + preencher e-mail
8. Baixar CP: Financeiro → CP → na linha → botão Baixar → data e conta bancária
9. Ciclo não aparece: ciclos são criados em Cadastros → Ciclos (não em Safras — tabela legada)
10. Parâmetros fiscais: Configurações → Parâmetros do Sistema → aba Fiscal

*Erros frequentes:*
• NF-e rejeitada: checar IE do destinatário, CFOP correto, e se certificado A1 não venceu (Fiscal → NF-e Emitidas mostra o código de erro)
• SIEG não importa NFs: verificar API Key e CNPJs em Configurações → Automações → SIEG
• Romaneio sem sacas: classificação ABIOVE incompleta — preencher umidade, impureza e avariados
• Usuário sem acesso: verificar permissões em Configurações → Usuários

Para dúvidas fiscais complexas (ICMS diferido, eSocial rural, SPED ECD): explique o que o Arato faz automaticamente e oriente a confirmar com o contador para detalhes específicos.

COMPORTAMENTO GERAL:
- Seu nome é Arato. Responda em português, direto e prático.
- Use formatação WhatsApp: *negrito*, _itálico_, listas com •
- Para consultas (não registros): use as ferramentas de consulta.
- Se o produtor cumprimentar sem intenção clara, apresente-se brevemente (3-4 linhas).
- Nunca invente dados financeiros. Se não souber, use as ferramentas.
- Quando o usuário disser "cancelar" ou "sair", encerre educadamente.`;

  // Monta conteúdo da mensagem — com imagem ou PDF se presente
  let userContent: string | Anthropic.ContentBlockParam[];
  if (imagem) {
    const mediaBlock: Anthropic.ContentBlockParam =
      imagem.mime === "application/pdf"
        ? {
            type: "document",
            source: { type: "base64", media_type: "application/pdf", data: imagem.base64 },
          } as unknown as Anthropic.ContentBlockParam
        : (() => {
            const supportedMime = ["image/jpeg", "image/png", "image/gif", "image/webp"];
            const mime = supportedMime.includes(imagem.mime) ? imagem.mime : "image/jpeg";
            return {
              type: "image",
              source: { type: "base64", media_type: mime as "image/jpeg" | "image/png" | "image/gif" | "image/webp", data: imagem.base64 },
            };
          })();
    userContent = [
      mediaBlock,
      ...(texto ? [{ type: "text" as const, text: texto }] : []),
    ];
  } else {
    userContent = texto;
  }

  const messages: Anthropic.MessageParam[] = [
    ...historico.map(m => ({ role: m.role, content: m.content })),
    { role: "user", content: userContent },
  ];

  // Força tool_choice=any quando detecta intenção de registro
  // Isso impede Claude de gerar ✅ sem chamar a ferramenta (stop_reason=end_turn)
  const forcaTool = imagem ? true : deveForcarFerramenta(texto, historico);
  const toolChoice = forcaTool
    ? { type: "any" as const }
    : { type: "auto" as const };
  if (forcaTool) console.log("[CLAUDE] tool_choice=any (intenção de registro detectada)");

  // Primeira chamada — Claude pode chamar ferramentas
  let response = await claude.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 2048,
    system: systemPrompt,
    tools: TOOLS,
    tool_choice: toolChoice,
    messages,
  });

  console.log(`[CLAUDE] stop=${response.stop_reason} blocks=${response.content.length}`);
  if (response.stop_reason !== "tool_use") {
    const txt = response.content.filter(b => b.type === "text").map(b => (b as Anthropic.TextBlock).text).join("").slice(0, 300);
    console.log(`[CLAUDE] texto: ${txt}`);
  }

  // Loop de tool use — Claude pode chamar múltiplas ferramentas
  let ultimosResultados: string[] = [];
  let iteracoes = 0;
  let pendingContrato: Record<string, unknown> | undefined;

  while (response.stop_reason === "tool_use" && iteracoes < 6) {
    iteracoes++;
    const assistantContent = response.content;
    const toolResults: Anthropic.ToolResultBlockParam[] = [];
    ultimosResultados = [];

    for (const block of assistantContent) {
      if (block.type === "tool_use") {
        const inp = block.input as Record<string, unknown>;
        console.log(`[CLAUDE-TOOL] chamando ${block.name}:`, JSON.stringify(inp).slice(0, 120));

        // Captura os dados do contrato antes de executar — serão salvos na sessão
        // para que a confirmação "sim" do usuário possa reusar diretamente sem depender
        // do Claude reconstituir os dados a partir do preview
        if (block.name === "registrar_contrato_graos" && inp.confirmado === false) {
          pendingContrato = inp;
        }

        const resultado = await executarFerramenta(
          block.name,
          inp,
          fazendaId,
          usuarioId,
          usuarioNome,
          usuarioWhatsapp,
        );
        toolResults.push({ type: "tool_result", tool_use_id: block.id, content: resultado });
        ultimosResultados.push(resultado);
      }
    }

    // Próxima chamada com os resultados das ferramentas
    response = await claude.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 2048,
      system: systemPrompt,
      tools: TOOLS,
      messages: [
        ...messages,
        { role: "assistant", content: assistantContent },
        { role: "user", content: toolResults },
      ],
    });
  }

  const texto_resposta = response.content
    .filter(b => b.type === "text")
    .map(b => (b as Anthropic.TextBlock).text)
    .join("\n")
    .trim();

  // Fallback: se Claude não gerou texto mas executou ferramentas, encaminha o resultado diretamente
  if (!texto_resposta) {
    console.error("[CLAUDE] resposta vazia. stop_reason:", response.stop_reason, "iteracoes:", iteracoes, "ultimo_resultado:", ultimosResultados[0]?.slice(0, 100));
    if (ultimosResultados.length > 0) return { texto: ultimosResultados.join("\n\n"), pendingContrato };
  }

  return { texto: texto_resposta || "Não consegui processar. Tente novamente.", pendingContrato };
}
