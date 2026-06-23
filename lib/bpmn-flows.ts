// lib/bpmn-flows.ts — Fluxos BPMN do sistema Arato (renderizados com Mermaid)

export type FluxoBPMN = {
  id: string;
  titulo: string;
  descricao: string;
  modulo: string;
  corModulo: string;
  icone: string;
  alertas: string[]; // tarefas preditivas automáticas destacadas
  diagram: string;   // definição Mermaid (flowchart TD)
};

// Legenda de cores usada em todos os diagramas
// Mostarda (#C9921B) = ação manual do usuário
// Azul (#1A4870)     = ação automática do sistema
// Vermelho (#E24B4A) = alerta / tarefa preditiva
// Verde (#16A34A)    = estado positivo / encerramento
// Cinza              = gateway de decisão

export const FLUXOS_BPMN: FluxoBPMN[] = [

  // ─── 1. ONBOARDING ──────────────────────────────────────────────────────
  {
    id: "onboarding",
    titulo: "Configuração Inicial",
    descricao: "Primeiros passos para colocar o sistema em operação plena",
    modulo: "Configurações",
    corModulo: "#378ADD",
    icone: "⚙️",
    alertas: [
      "Certificado A1 deve ser configurado ANTES de emitir qualquer NF-e",
      "CNPJ da fazenda é obrigatório para a automação SIEG funcionar",
      "Configure Resend (e-mail) para receber alertas automáticos de vencimento",
      "Ative a automação SIEG para não precisar inserir NFs de entrada manualmente",
    ],
    diagram: `flowchart TD
    S([🚀 Novo Cliente — Início])

    subgraph PARAM["⚙️ PARÂMETROS DO SISTEMA"]
        direction TB
        A1["Configurações › Parâmetros\nCNPJ emitente · IE · Série NF-e · Ambiente SEFAZ (homolog/prod)"]
        A2["Certificado Digital A1\nCaminho do arquivo .pfx + senha"]
        A3["Integrações\nResend API Key · SIEG API Key · WhatsApp URL/Token"]
    end

    subgraph CADAST["📋 CADASTROS BASE"]
        direction TB
        B1["Produtores\nNome, CPF/CNPJ, IE por estado"]
        B2["Fazendas e Talhões\nCNPJ, CAR, NIRF, área em ha, GPS"]
        B3["Pessoas\nClientes, fornecedores, transportadoras, bancos"]
        B4["Insumos\nSementes, fertilizantes, defensivos, combustíveis"]
        B5["Depósitos\nArmazéns, silos, tulhas, galpões"]
    end

    subgraph AUTOM["⚡ AUTOMAÇÕES — ativar 1 vez, funciona para sempre"]
        direction TB
        C1[/"SIEG — baixa XMLs de NF automaticamente 2× por dia\n8h e 17h BRT — cria CP e movimenta estoque"/]
        C2[/"Alertas de Vencimento — CP, CR e arrendamentos\n7 dias · 3 dias · 1 dia antes do vencimento"/]
        C3[/"Cotações de Mercado — CBOT, B3, USD/BRL\natualizadas às 7h todo dia útil"/]
        C4[/"Relatório Semanal — CP/CR da semana\ne-mail automático toda segunda às 7h"/]
    end

    S --> A1 --> A2 --> A3 --> B1
    B1 --> B2 --> B3 --> B4 --> B5 --> C1
    C1 --> C2 --> C3 --> C4 --> FIM

    FIM([✅ Sistema pronto para operar])

    classDef usuario fill:#FBF3E0,stroke:#C9921B,color:#5C3A00,stroke-width:1.5px
    classDef sistema fill:#D5E8F5,stroke:#1A4870,color:#0B2D50,stroke-width:1.5px
    classDef fim fill:#EAF3DE,stroke:#16A34A,color:#1A5C38,stroke-width:1.5px
    class A1,A2,A3,B1,B2,B3,B4,B5 usuario
    class C1,C2,C3,C4 sistema
    class S,FIM fim`,
  },

  // ─── 2. CICLO AGRÍCOLA ──────────────────────────────────────────────────
  {
    id: "ciclo-agricola",
    titulo: "Ciclo Agrícola Completo",
    descricao: "Do cadastro do ciclo até a colheita e entrada no estoque",
    modulo: "Lavoura",
    corModulo: "#16A34A",
    icone: "🌱",
    alertas: [
      "Ao cadastrar um ciclo, o cronograma de operações é gerado automaticamente",
      "Alerta de janela de colheita enviado com base na data de plantio",
      "Toda operação lançada atualiza o DRE em tempo real",
      "Entrada no estoque ocorre automaticamente ao finalizar o romaneio",
    ],
    diagram: `flowchart TD
    S([🌱 Início da Safra])

    subgraph PLAN["📅 PLANEJAMENTO"]
        direction TB
        A1["Cadastrar Ciclo\nLavoura › Cadastros › Ciclos\nciclo + cultura + talhões + ano safra"]
        A2[/"Sistema gera Cronograma\noperações com datas estimadas"/]
        A3["Criar Orçamento por Ciclo\ncusto estimado por categoria (sementes, NPK, defensivos...)"]
    end

    subgraph OPS["🚜 OPERAÇÕES DE CAMPO"]
        direction TB
        B1["Lançar Plantio\ndata · semente · dose/ha · talhão · área plantada"]
        B2[/"Custo de semente registrado no DRE automaticamente"/]
        B3["Lançar Adubação de Base\nNPK · dose · modalidade · talhão"]
        B4[/"Custo de fertilizante registrado no DRE automaticamente"/]
        B5{"Novas\nPulverizações?"}
        B6["Lançar Pulverização\nproduto · dose · área · data · operador"]
        B7[/"Custo de defensivo registrado no DRE automaticamente"/]
    end

    subgraph COLH["🌾 COLHEITA"]
        direction TB
        C1[/"⏰ Alerta: Janela de colheita prevista\nbaseada na data de plantio + dias ciclo da cultura"/]
        C2["Registrar Romaneio\npeso bruto + tara + classificação ABIOVE por commodity"]
        C3[/"Descontos automáticos calculados\numidade · impureza · avariados (soma dos sub-parâmetros)"/]
        C4[/"Entrada em Estoque\nsacas líquidas lançadas automaticamente no depósito"/]
    end

    subgraph RES["📊 RESULTADO"]
        direction TB
        D1[/"DRE Agrícola atualizado\ncusto/ha · produtividade · margem · ponto de equilíbrio"/]
        D2[/"Relatório de Aplicações\ndisponível para exportar XLSX e PDF"/]
    end

    S --> A1 --> A2 --> A3 --> B1
    B1 --> B2 --> B3 --> B4 --> B5
    B5 -- Sim --> B6 --> B7 --> B5
    B5 -- Não --> C1 --> C2 --> C3 --> C4 --> D1 --> D2 --> FIM

    FIM([✅ Produção Registrada no Estoque])

    classDef usuario fill:#FBF3E0,stroke:#C9921B,color:#5C3A00,stroke-width:1.5px
    classDef sistema fill:#D5E8F5,stroke:#1A4870,color:#0B2D50,stroke-width:1.5px
    classDef alerta fill:#FCEBEB,stroke:#E24B4A,color:#791F1F,stroke-width:1.5px
    classDef fim fill:#EAF3DE,stroke:#16A34A,color:#1A5C38,stroke-width:1.5px
    classDef gw fill:#F4F6FA,stroke:#999,color:#333,stroke-width:1px
    class A1,A3,B1,B3,B6,C2 usuario
    class A2,B2,B4,B7,C3,C4,D1,D2 sistema
    class C1 alerta
    class S,FIM fim
    class B5 gw`,
  },

  // ─── 3. COMERCIALIZAÇÃO ─────────────────────────────────────────────────
  {
    id: "comercializacao",
    titulo: "Comercialização de Grãos",
    descricao: "Do contrato de venda à entrega, NF-e e recebimento",
    modulo: "Comercial",
    corModulo: "#C9921B",
    icone: "📋",
    alertas: [
      "Contratos 'À Fixar' aparecem no Dashboard com cotação CBOT/B3 ao lado",
      "CR é lançado automaticamente ao confirmar o contrato",
      "NF-e é gerada e transmitida automaticamente ao finalizar o romaneio",
      "Saldo entregue e status do contrato são atualizados após cada romaneio",
    ],
    diagram: `flowchart TD
    S([📋 Novo Contrato de Venda])

    subgraph CONT["📝 CONTRATO"]
        direction TB
        A1["Cadastrar Contrato\nComercial › Contratos de Grãos › + Novo\nComprador · Produto · Quantidade kg · Data entrega"]
        A2{"Modalidade\nde Preço?"}
        A3[/"Dashboard — Cotações ao vivo\nCBOT · B3 · USD/BRL atualizados às 7h"/]
        A4["Fixar Preço\nR$/sc ou USD/sc + câmbio de referência"]
        A5["Confirmar Contrato\nstatus muda para Ativo"]
        A6[/"CR lançado automaticamente\nno Financeiro › Contas a Receber"/]
    end

    subgraph ROM["⚖️ ROMANEIO E EXPEDIÇÃO"]
        direction TB
        B1["Registrar Romaneio\npeso bruto + tara + classificação ABIOVE"]
        B2[/"Sacas líquidas calculadas\ne saldo do contrato atualizado"/]
        B3{"Modalidade\nde Frete?"}
        B4["Emitir MDF-e\nTransportadora · motorista · UF percurso"]
        B5[/"MDF-e autorizado SEFAZ\ncarga liberada para trânsito"/]
        B6["Gerar NF-e de Saída\nCFOP 6101 direto · 5905 transbordo"]
        B7[/"NF-e transmitida e autorizada\nXML arquivado · DANFE gerado"/]
        BERR[/"⚠️ Alerta: Rejeição SEFAZ\nCódigo de erro — corrigir e reenviar"/]
    end

    subgraph ENC["✅ ENCERRAMENTO"]
        direction TB
        C1{"Contrato\nEncerrado?"}
        C2[/"CR baixado ao receber\npagamento do comprador"/]
    end

    S --> A1 --> A2
    A2 -- "Preço Fixo R$/sc" --> A5
    A2 -- "À Fixar / Basis / USD" --> A3 --> A4 --> A5
    A5 --> A6 --> B1
    B1 --> B2 --> B3
    B3 -- "CIF — comprador\npaga frete" --> B4 --> B5 --> B6
    B3 -- "FOB — produtor\npaga frete" --> B6
    B6 --> B7
    B7 -.->|Rejeição| BERR -.->|Corrigir| B6
    B7 --> C1
    C1 -- "Não — mais romaneios" --> B1
    C1 -- Sim --> C2 --> FIM

    FIM([✅ Contrato Encerrado e Recebido])

    classDef usuario fill:#FBF3E0,stroke:#C9921B,color:#5C3A00,stroke-width:1.5px
    classDef sistema fill:#D5E8F5,stroke:#1A4870,color:#0B2D50,stroke-width:1.5px
    classDef alerta fill:#FCEBEB,stroke:#E24B4A,color:#791F1F,stroke-width:1.5px
    classDef fim fill:#EAF3DE,stroke:#16A34A,color:#1A5C38,stroke-width:1.5px
    classDef gw fill:#F4F6FA,stroke:#999,color:#333,stroke-width:1px
    class A1,A4,A5,B1,B4,B6 usuario
    class A3,A6,B2,B5,B7,C2 sistema
    class BERR alerta
    class S,FIM fim
    class A2,B3,C1 gw`,
  },

  // ─── 4. FINANCEIRO CP/CR ────────────────────────────────────────────────
  {
    id: "financeiro",
    titulo: "Gestão Financeira — CP e CR",
    descricao: "Contas a pagar, contas a receber, conciliação bancária",
    modulo: "Financeiro",
    corModulo: "#1A4870",
    icone: "💰",
    alertas: [
      "Alertas de vencimento enviados 7, 3 e 1 dia antes por e-mail",
      "CP via SIEG é criado automaticamente ao importar NF-e de fornecedor",
      "Parcelas de contratos financeiros (SAC/PRICE) geradas automaticamente",
      "Conciliação OFX pode ser importada do banco para fechar automaticamente",
    ],
    diagram: `flowchart TD
    subgraph ORIGEM_CP["🔵 ORIGENS DO CP — várias fontes geram CP automaticamente"]
        direction LR
        CP_M["CP Manual\nFinanceiro › CP › + Novo\ncategoria · valor · vencimento · parcelas"]
        CP_SIEG[/"CP via SIEG\nNF de fornecedor baixada automática\nclassificada por regra CNPJ+NCM"/]
        CP_ARR[/"CP via Arrendamento\nparcela anual gerada ao cadastrar\narrendamento em R$ ou R$/ha"/]
        CP_FIN[/"CP via Contrato Financeiro\nSAC · PRICE · BULLET · EGF\namortizações geradas automaticamente"/]
    end

    subgraph GESTAO_CP["📋 GESTÃO DO CP"]
        direction TB
        CP1{"Status?"}
        CP2[/"⏰ Alerta: CP vencendo\n7 dias · 3 dias · 1 dia antes — e-mail automático"/]
        CP3{"Baixa?"}
        CP4["Baixa Individual\nData de pagamento + conta bancária"]
        CP5["Borderô\nVários CP — mesmo banco e data — em lote"]
        CP6[/"Fluxo de Caixa\natualizado automaticamente"/]
    end

    subgraph ORIGEM_CR["🟢 ORIGENS DO CR"]
        direction LR
        CR_M["CR Manual\nFinanceiro › CR › + Novo"]
        CR_G[/"CR via Contrato de Grãos\ngerado ao confirmar contrato — valor total"/]
    end

    subgraph GESTAO_CR["📋 GESTÃO DO CR"]
        direction TB
        CR1[/"⏰ Alerta: CR vencendo\n7 dias · 3 dias · 1 dia antes — e-mail automático"/]
        CR2["Baixa do CR\nValor recebido + conta bancária"]
        CR3[/"Fluxo de Caixa\natualizado automaticamente"/]
    end

    subgraph CONCIL["🏦 CONCILIAÇÃO OFX"]
        direction TB
        OFX1["Importar Extrato Bancário OFX\nFinanceiro › Fluxo de Caixa › Importar OFX"]
        OFX2[/"Sistema concilia lançamentos\ncom CP/CR abertos automaticamente"/]
        OFX3{"Todos\nconciliados?"}
        OFX4["Classificar manualmente\nlançamentos sem match"]
    end

    CP_M & CP_SIEG & CP_ARR & CP_FIN --> CP1
    CP1 -- "A vencer" --> CP2 --> CP3
    CP1 -- "Vencido" --> CP3
    CP3 -- "Individual" --> CP4 --> CP6
    CP3 -- "Em lote" --> CP5 --> CP6

    CR_M & CR_G --> CR1 --> CR2 --> CR3

    CP6 & CR3 --> OFX1 --> OFX2 --> OFX3
    OFX3 -- Sim --> FIM([✅ Caixa Conciliado])
    OFX3 -- Não --> OFX4 --> FIM

    classDef usuario fill:#FBF3E0,stroke:#C9921B,color:#5C3A00,stroke-width:1.5px
    classDef sistema fill:#D5E8F5,stroke:#1A4870,color:#0B2D50,stroke-width:1.5px
    classDef alerta fill:#FCEBEB,stroke:#E24B4A,color:#791F1F,stroke-width:1.5px
    classDef fim fill:#EAF3DE,stroke:#16A34A,color:#1A5C38,stroke-width:1.5px
    classDef gw fill:#F4F6FA,stroke:#999,color:#333,stroke-width:1px
    class CP_M,CP4,CP5,CR_M,CR2,OFX1,OFX4 usuario
    class CP_SIEG,CP_ARR,CP_FIN,CP6,CR_G,CR3,OFX2 sistema
    class CP2,CR1 alerta
    class FIM fim
    class CP1,CP3,OFX3 gw`,
  },

  // ─── 5. AUTOMAÇÃO SIEG ──────────────────────────────────────────────────
  {
    id: "sieg",
    titulo: "Automação SIEG — NF de Entrada",
    descricao: "Importação automática de NFs de fornecedores via API SIEG",
    modulo: "Compras",
    corModulo: "#7C3AED",
    icone: "🤖",
    alertas: [
      "NFs importadas 2× por dia: 8h e 17h BRT (sem ação do usuário)",
      "NFs sem classificação automática aparecem em fila de pendências",
      "Ao classificar uma NF manualmente, o sistema sugere criar regra automática",
      "Cada regra criada elimina trabalho manual para todos os NFs futuros desse fornecedor",
    ],
    diagram: `flowchart TD
    S([📄 Fornecedor emite NF-e\npara o CNPJ da fazenda])

    subgraph AUTO["⚡ PROCESSAMENTO AUTOMÁTICO — 2× por dia"]
        direction TB
        A1[/"SIEG baixa XMLs das NFs\npor CNPJ da fazenda — 8h e 17h BRT"/]
        A2[/"Sistema processa cada NF\nextra CNPJ emissor · NCM · valor · descrição"/]
        A3{"Regra de\nclassificação\nexiste?"}
        A4[/"Match encontrado\nCNPJ emissor + NCM + texto na descrição"/]
        A5[/"CP criado automaticamente\nCategoria · insumo · centro de custo"/]
        A6[/"Estoque atualizado\nse NCM de insumo (semente, defensivo, fertilizante)"/]
    end

    subgraph PEND["👤 FILA DE PENDÊNCIAS — ação do usuário"]
        direction TB
        B1[/"Sem match — NF vai para fila\nCompras › Pendências de Classificação"/]
        B2[/"⏰ Alerta para o usuário\nNFs aguardando classificação manual"/]
        B3["Usuário classifica\nCategoria · insumo · centro de custo · CP"]
        B4{"Criar regra\nautomática?"}
        B5[/"Regra criada em\nConfiguração › Regras de Classificação\nCNPJ + NCM → mesma categoria sempre"/]
    end

    S --> A1 --> A2 --> A3
    A3 -- "Regra existe" --> A4 --> A5 --> A6 --> FIM
    A3 -- "Sem match" --> B1 --> B2 --> B3 --> B4
    B4 -- "Sim — criar regra" --> B5 --> FIM
    B4 -- "Não — só essa vez" --> FIM

    FIM([✅ CP lançado e Estoque atualizado])

    classDef usuario fill:#FBF3E0,stroke:#C9921B,color:#5C3A00,stroke-width:1.5px
    classDef sistema fill:#D5E8F5,stroke:#1A4870,color:#0B2D50,stroke-width:1.5px
    classDef alerta fill:#FCEBEB,stroke:#E24B4A,color:#791F1F,stroke-width:1.5px
    classDef fim fill:#EAF3DE,stroke:#16A34A,color:#1A5C38,stroke-width:1.5px
    classDef gw fill:#F4F6FA,stroke:#999,color:#333,stroke-width:1px
    class B3 usuario
    class A1,A2,A4,A5,A6,B1,B5 sistema
    class B2 alerta
    class S,FIM fim
    class A3,B4 gw`,
  },

  // ─── 6. NF-e FISCAL ─────────────────────────────────────────────────────
  {
    id: "nfe",
    titulo: "Emissão de NF-e Fiscal",
    descricao: "Emissão, transmissão SEFAZ, autorização e arquivamento do XML",
    modulo: "Fiscal",
    corModulo: "#E24B4A",
    icone: "🧾",
    alertas: [
      "NF-e gerada automaticamente ao confirmar contrato de grãos",
      "ICMS Diferido MT (0%) aplicado automaticamente para produtor rural",
      "Funrural calculado automaticamente: 1,5% INSS + 0,2% SENAR",
      "Alerta de vencimento do Certificado A1: 30, 15, 7 e 1 dia antes",
    ],
    diagram: `flowchart TD
    S(["📝 Origem da NF-e\nContrato de Grãos ou Emissão Manual"])

    subgraph ORIGEM["🔀 ORIGEM"]
        direction TB
        A1{"De onde\nvem a NF-e?"}
        A2[/"NF-e gerada automaticamente\nao confirmar contrato de grãos\nFiscal › NF-e Emitidas — aparece pronta"/]
        A3["NF-e Manual\nFiscal › NF-e Emitidas › + Nova"]
        A4["Preencher Dados\nDestinatário · itens · CFOP · NCM · CST · transporte"]
    end

    subgraph TRIBUT["💲 TRIBUTAÇÃO AUTOMÁTICA"]
        direction TB
        T1[/"ICMS Diferido MT aplicado\n0% para produtor rural — automático"/]
        T2[/"Funrural calculado\n1,5% INSS + 0,2% SENAR sobre receita bruta"/]
        T3[/"Informações complementares (infCpl)\ntexto legal obrigatório preenchido automaticamente"/]
    end

    subgraph SEFAZ["🏛️ TRANSMISSÃO SEFAZ"]
        direction TB
        E1["Transmitir à SEFAZ\ncertificado A1 assina o XML digitalmente"]
        E2{"SEFAZ\nAutorizou?"}
        E3[/"XML baixado e arquivado\nStorage Supabase — obrigação fiscal 5 anos"/]
        E4[/"DANFE PDF gerado\nautomaticamente para impressão/envio"/]
        E5[/"CR atualizado\nse origem for venda de grãos"/]
        EERR[/"⚠️ Alerta de Rejeição\ncódigo de erro SEFAZ + motivo detalhado"/]
        E6{"Tipo de\nerro?"}
        E7["Corrigir dados\ne retransmitir"]
        E8["Cancelar NF-e\nse denegação ou erro grave"]
    end

    S --> A1
    A1 -- "Contrato de Grãos confirmado" --> A2 --> T1
    A1 -- "Emissão manual" --> A3 --> A4 --> T1
    T1 --> T2 --> T3 --> E1
    E1 --> E2
    E2 -- "Autorizada ✓" --> E3 --> E4 --> E5 --> FIM
    E2 -- "Rejeitada ✗" --> EERR --> E6
    E6 -- "Corrigível\n(dado inválido, IE, etc)" --> E7 --> E1
    E6 -- "Grave\n(denegação)" --> E8 --> FIM2

    FIM([✅ NF-e Autorizada e Arquivada])
    FIM2([❌ NF-e Cancelada — Inutilizar Numeração])

    classDef usuario fill:#FBF3E0,stroke:#C9921B,color:#5C3A00,stroke-width:1.5px
    classDef sistema fill:#D5E8F5,stroke:#1A4870,color:#0B2D50,stroke-width:1.5px
    classDef alerta fill:#FCEBEB,stroke:#E24B4A,color:#791F1F,stroke-width:1.5px
    classDef fim fill:#EAF3DE,stroke:#16A34A,color:#1A5C38,stroke-width:1.5px
    classDef fimruim fill:#FCEBEB,stroke:#E24B4A,color:#791F1F,stroke-width:1.5px
    classDef gw fill:#F4F6FA,stroke:#999,color:#333,stroke-width:1px
    class A3,A4,E1,E7,E8 usuario
    class A2,T1,T2,T3,E3,E4,E5 sistema
    class EERR alerta
    class FIM fim
    class FIM2 fimruim
    class A1,E2,E6 gw`,
  },

  // ─── 7. ARRENDAMENTOS ───────────────────────────────────────────────────
  {
    id: "arrendamentos",
    titulo: "Gestão de Arrendamentos",
    descricao: "Contratos de arrendamento rural com pagamento em sacas ou reais",
    modulo: "Comercial",
    corModulo: "#16A34A",
    icone: "🤝",
    alertas: [
      "Alerta de vencimento de parcela: 15 dias e 1 dia antes",
      "Arrendamento em sacas gera automaticamente compromisso de entrega de grãos",
      "Arrendamento em R$ gera automaticamente CP no Financeiro",
      "Custo de arrendamento entra automaticamente no DRE da safra",
    ],
    diagram: `flowchart TD
    S([🤝 Fazenda com Área Arrendada])

    subgraph CAD["📝 CADASTRO DO ARRENDAMENTO"]
        direction TB
        A1["Cadastrar Arrendamento\nCadastros › Fazendas › aba Arrendamentos › + Novo"]
        A2["Definir Contrato\nProprietário da terra · área arrendada · datas de vigência"]
        A3{"Forma de\nPagamento?"}
    end

    subgraph SACAS["🌾 PAGAMENTO EM SACAS — compromisso de grãos"]
        direction TB
        B1[/"Gera contrato de grãos compromisso\nComercial › Contratos — aparece automaticamente"/]
        B2[/"Volume comprometido\ndeduzido da posição disponível para venda"/]
        B3["Acertar entrega de sacas\nComercial › Contratos › Romaneio"]
    end

    subgraph REAIS["💰 PAGAMENTO EM REAIS — fluxo financeiro"]
        direction TB
        C1[/"Gera CP automático no Financeiro\nparcela anual com vencimento definido"/]
        C2["Baixar CP\nFinanceiro › Contas a Pagar › Baixar"]
    end

    subgraph VENC["⏰ CONTROLE DE VENCIMENTOS"]
        direction TB
        D1[/"⏰ Alerta automático\n15 dias e 1 dia antes do vencimento"/]
        D2["Ver Vencimentos\nComercial › Arrendamentos › aba Próximos Vencimentos"]
    end

    subgraph DRE["📊 IMPACTO NO DRE"]
        direction TB
        E1[/"Custo de arrendamento\nlançado automaticamente no DRE da safra"/]
        E2[/"Custo/ha de arrendamento\nvisível no comparativo Planejado × Realizado"/]
    end

    S --> A1 --> A2 --> A3
    A3 -- "Sacas de soja / milho\nou combinação" --> B1 --> B2 --> D1
    A3 -- "Reais por hectare\nR$ por ha por safra" --> C1 --> D1

    D1 --> D2
    D2 --> B3 & C2
    B3 & C2 --> E1 --> E2 --> FIM

    FIM(["✅ Parcela paga — DRE atualizado\nRenovar para próxima safra?"])

    classDef usuario fill:#FBF3E0,stroke:#C9921B,color:#5C3A00,stroke-width:1.5px
    classDef sistema fill:#D5E8F5,stroke:#1A4870,color:#0B2D50,stroke-width:1.5px
    classDef alerta fill:#FCEBEB,stroke:#E24B4A,color:#791F1F,stroke-width:1.5px
    classDef fim fill:#EAF3DE,stroke:#16A34A,color:#1A5C38,stroke-width:1.5px
    classDef gw fill:#F4F6FA,stroke:#999,color:#333,stroke-width:1px
    class A1,A2,B3,C2,D2 usuario
    class B1,B2,C1,E1,E2 sistema
    class D1 alerta
    class S,FIM fim
    class A3 gw`,
  },
];
