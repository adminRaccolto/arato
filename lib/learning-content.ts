// ────────────────────────────────────────────────────────────
// RacTech — Conteúdo do Módulo de Aprendizagem (Arato Academy)
// ────────────────────────────────────────────────────────────

export type Licao = {
  id: string;
  titulo: string;
  duracao: string; // ex: "5 min"
  tipo: "leitura" | "video" | "pratica" | "quiz";
  conteudo: string; // HTML/Markdown
  dica?: string;
};

export type Modulo = {
  id: string;
  numero: number;
  titulo: string;
  descricao: string;
  icone: string;
  cor: string; // hex
  licoes: Licao[];
};

export type Fase = {
  id: string;
  numero: number;
  titulo: string;
  subtitulo: string;
  modulos: Modulo[];
};

export const FASES: Fase[] = [
  // ── FASE 0 — Bem-vindo ao Arato ──────────────────────────
  {
    id: "fase-0",
    numero: 0,
    titulo: "Bem-vindo ao Arato",
    subtitulo: "Primeiros passos e configuração inicial",
    modulos: [
      {
        id: "mod-0-1",
        numero: 1,
        titulo: "O que é o Arato",
        descricao: "Entenda a filosofia e como o sistema vai trabalhar por você",
        icone: "🌿",
        cor: "#1A4870",
        licoes: [
          {
            id: "lc-0-1-1",
            titulo: "Filosofia: o sistema trabalha por você",
            duracao: "3 min",
            tipo: "leitura",
            conteudo: `
## O Arato é diferente

A maioria dos sistemas de gestão exige que você faça tudo manualmente: emita cada nota, registre cada lançamento, verifique cada vencimento.

**O Arato inverte essa lógica.**

### Azul = o sistema fez. Mostarda = você fez.

Ao longo do sistema você verá elementos em duas cores principais:
- **Azul (#1A4870)** — ação automática. O Arato executou sem que você precisasse pedir.
- **Mostarda (#C9921B)** — ação manual. Você interagiu e o sistema registrou.

### Exemplos práticos

| Situação | Como era antes | Como é no Arato |
|---|---|---|
| Venda de grão confirmada | Emitir NF-e manualmente | NF-e gerada e transmitida automaticamente |
| Conta vencendo | Verificar todo dia | Alerta 7, 3 e 1 dia antes |
| Preço da soja | Pesquisar em outro site | Atualizado às 7h no dashboard |
| Relatório mensal | Gerar manualmente | Enviado por e-mail toda segunda |

### A pergunta que guia tudo

Ao usar qualquer funcionalidade, sempre pergunte:
> **"O sistema pode fazer isso automaticamente?"**

Se sim → já está automatizado. Se não → 1 clique, nunca mais.
            `,
            dica: "Explore o Dashboard para ver as automações em tempo real.",
          },
          {
            id: "lc-0-1-2",
            titulo: "Navegação: TopNav e módulos",
            duracao: "4 min",
            tipo: "leitura",
            conteudo: `
## Como navegar no Arato

O Arato usa uma barra de navegação horizontal no topo da tela, com dois níveis:

### Faixa superior (branca)
- **Logo Arato** — clique para voltar ao Dashboard
- **Fazenda ativa** — mostra qual fazenda está selecionada no momento
- **Usuário** — seu nome e botão de logout

### Faixa de navegação (azul)
Os módulos são agrupados por área:

| Grupo | O que contém |
|---|---|
| **Lavoura** | Safras, plantio, pulverização, colheita, relatórios |
| **Estoque** | Posição, NF entrada, movimentações |
| **Compras** | Pedidos, NF produtos, NF serviços |
| **Comercial** | Contratos de grãos, expedição, arrendamentos |
| **Financeiro** | Fluxo de caixa, contas a pagar, contas a receber |
| **Fiscal** | NF-e emitidas, parâmetros |
| **Relatórios** | DRE, aplicações por ciclo, relatórios financeiros |
| **Configurações** | Automações, rateio, parâmetros do sistema |
| **Ajuda** | Este módulo de aprendizagem, Controller, Suporte IA |

### Dica de produtividade
Cada grupo tem um dropdown com sub-itens. Passe o mouse para ver todas as opções sem precisar abrir a página.
            `,
            dica: "Passe o mouse sobre cada item do menu para ver o que está disponível.",
          },
        ],
      },
      {
        id: "mod-0-2",
        numero: 2,
        titulo: "Configuração inicial",
        descricao: "Configure sua fazenda, usuários e parâmetros fiscais",
        icone: "⚙️",
        cor: "#1A4870",
        licoes: [
          {
            id: "lc-0-2-1",
            titulo: "Cadastrando sua fazenda",
            duracao: "6 min",
            tipo: "pratica",
            conteudo: `
## Cadastro de Fazenda — passo a passo

Vá em **Cadastros** → aba **Fazendas** → botão **+ Fazenda**.

### Aba Dados Gerais
Preencha os campos obrigatórios:
- **Nome/Razão Social** — nome completo da fazenda (ex: "Fazenda Bela Vista")
- **CPF/CNPJ** — documento do produtor rural
- **NIRF** — Número do Imóvel na Receita Federal (consta no ITR)
- **Endereço** — use o CEP para preenchimento automático

### Aba Matrículas
Cada fazenda pode ter uma ou mais matrículas em cartório (glebas):
- Informe o número da matrícula, cartório e área em hectares
- O sistema compara a soma das matrículas com a área total cadastrada

### Aba Certidões
- **CAR** — Cadastro Ambiental Rural (obrigatório por lei)
- **ITR** — data de emissão e vencimento do último ITR
- **CCIR** — Certificado de Cadastro de Imóvel Rural

### Aba Arrendamentos
Se parte da área é arrendada de terceiros:
- Selecione o proprietário (cadastrado em Pessoas)
- Informe a área arrendada e a forma de pagamento (sacas ou R$)
- O sistema gera os lançamentos financeiros automaticamente

> **Importante:** Arrendamentos em sacas criam compromisso em grãos (afeta a comercialização). Arrendamentos em R$ criam conta a pagar no financeiro.
            `,
            dica: "O CEP preenche automaticamente cidade, estado e endereço via ViaCEP.",
          },
          {
            id: "lc-0-2-2",
            titulo: "Parâmetros fiscais",
            duracao: "5 min",
            tipo: "pratica",
            conteudo: `
## Configurando os Parâmetros Fiscais

Vá em **Configurações** → **Parâmetros do Sistema** → aba **Fiscal**.

### Por que isso é importante
Esses parâmetros são usados em **todas** as notas fiscais emitidas. Configure uma vez e esqueça.

### Campos obrigatórios para emissão de NF-e

| Campo | O que é | Exemplo |
|---|---|---|
| Ambiente | Homologação (testes) ou Produção | Produção |
| CNPJ Emitente | CNPJ da fazenda/empresa | 00.000.000/0001-00 |
| Inscrição Estadual | IE cadastrada na SEFAZ/MT | 123456789 |
| Inscrição Municipal | Só se for prestador de serviços | — |
| UF | Estado da fazenda | MT |
| Código IBGE | Município (7 dígitos) | 5108402 (Nova Mutum) |
| CRT | Regime tributário | 1 = Simples, 3 = Lucro Real |

### CFOPs mais usados em MT
- **6.101** — Venda de produção do estabelecimento (saída interestadual)
- **5.101** — Venda de produção do estabelecimento (saída intraestadual)
- **6.501** — Remessa para armazenagem (transbordo para silo)
- **6.905** — Remessa para depósito fechado (armazém terceiro)

### NCMs por commodity
- Soja: **1201.10.00**
- Milho: **1005.90.10**
- Algodão pluma: **5201.00.20**

> **Nota:** O certificado A1 (arquivo .pfx) precisa ser enviado ao servidor. Use o campo "Caminho do Certificado A1" para informar a localização.
            `,
            dica: "Configure primeiro em Homologação para testar sem impacto fiscal real.",
          },
        ],
      },
    ],
  },

  // ── FASE 1 — Lavoura e Safras ──────────────────────────────
  {
    id: "fase-1",
    numero: 1,
    titulo: "Lavoura e Safras",
    subtitulo: "Gerencie safras, operações e colheita",
    modulos: [
      {
        id: "mod-1-1",
        numero: 1,
        titulo: "Cadastros de Lavoura",
        descricao: "Talhões, anos safra e ciclos — a base de tudo",
        icone: "🌱",
        cor: "#16A34A",
        licoes: [
          {
            id: "lc-1-1-1",
            titulo: "Entendendo Talhões",
            duracao: "4 min",
            tipo: "leitura",
            conteudo: `
## O que é um Talhão

O **talhão** é a menor unidade operacional de uma fazenda. É a subdivisão física onde o plantio acontece.

### Por que os talhões importam
- Toda operação (plantio, pulverização, colheita) é registrada **por talhão**
- Produtividade, custo e resultado são calculados **por talhão**
- Histórico de solo e aplicações fica armazenado **por talhão**

### Dados de um talhão
| Campo | Descrição |
|---|---|
| Nome | Identificador (ex: "T01 — Gleba Norte") |
| Área (ha) | Área em hectares — base de todos os cálculos |
| Tipo de solo | Argiloso, arenoso, misto |
| Coordenadas GPS | Lat/Lon do centróide do talhão |
| Fazenda | Qual fazenda pertence |

### Cadastrando talhões
Vá em **Propriedades** → selecione a fazenda → botão **+ Talhão**.

> **Dica:** Nomear com prefixo numérico (T01, T02...) facilita a ordenação e a leitura nos relatórios.
            `,
          },
          {
            id: "lc-1-1-2",
            titulo: "Anos Safra e Ciclos",
            duracao: "5 min",
            tipo: "leitura",
            conteudo: `
## Anos Safra e Ciclos

No Arato, o controle de lavoura é feito em dois níveis:

### Ano Safra
O período agrícola anual. No Centro-Oeste, começa em outubro e termina em setembro do ano seguinte.

Exemplos:
- **2024/2025** — plantio out/2024, colheita mar/2025
- **2025/2026** — plantio out/2025, colheita mar/2026

Para cadastrar: **Cadastros** → aba **Safras & Ciclos** → **Ano Safra** → **+ Ano Safra**.

### Ciclo (Empreendimento)
O ciclo é a combinação de **cultura + talhões** dentro de um ano safra.

| Exemplo de Ciclo | Cultura | Talhões | Área total |
|---|---|---|---|
| Soja 2024/25 — Bloco A | Soja | T01, T02, T03 | 450 ha |
| Milho 2ª 2024/25 — Bloco A | Milho 2ª | T01, T02 | 300 ha |
| Algodão 2024/25 | Algodão | T04, T05 | 200 ha |

> **Importante:** As operações (plantio, pulv, colheita) são sempre vinculadas a um **ciclo**, não a uma safra genérica.

### Fluxo correto
1. Crie o **Ano Safra** (ex: 2025/2026)
2. Crie os **Ciclos** para esse ano (um por cultura/área)
3. Registre as operações vinculando ao ciclo correto
            `,
            dica: "Crie os ciclos antes de iniciar qualquer registro de operação.",
          },
        ],
      },
      {
        id: "mod-1-2",
        numero: 2,
        titulo: "Operações de Campo",
        descricao: "Plantio, pulverização, adubação e colheita",
        icone: "🚜",
        cor: "#16A34A",
        licoes: [
          {
            id: "lc-1-2-1",
            titulo: "Registrando o Plantio",
            duracao: "6 min",
            tipo: "pratica",
            conteudo: `
## Como registrar o Plantio

Vá em **Lavoura** → **Plantio** → **+ Novo Plantio**.

### Informações obrigatórias
- **Ciclo** — selecione o ciclo do ano safra correto
- **Talhão** — qual área será plantada
- **Data do plantio**
- **Área plantada (ha)** — pode ser menor que a área total do talhão
- **Cultura** — soja, milho 1ª, milho 2ª, algodão...

### Insumos utilizados
Para cada insumo no plantio:
- Selecione o produto do cadastro de insumos
- Informe a dose por hectare (kg/ha ou L/ha)
- O sistema calcula a quantidade total automaticamente
- O custo é calculado pelo **custo médio ponderado** do estoque

### O que o sistema faz automaticamente
✅ Baixa os insumos do estoque
✅ Lança o custo no CPV do ciclo
✅ Registra no histórico do talhão

### Populares em MT
- **Soja**: plantio entre 15/out e 15/nov. Densidade: 14-18 sementes/m.
- **Milho 2ª**: plantio entre 20/jan e 20/fev (janela crítica!).
- **Algodão**: plantio entre 20/dez e 20/jan.
            `,
          },
          {
            id: "lc-1-2-2",
            titulo: "Registrando Pulverizações",
            duracao: "5 min",
            tipo: "pratica",
            conteudo: `
## Como registrar Pulverizações

Vá em **Lavoura** → **Pulverização** → **+ Nova Pulverização**.

### Categorias de aplicação
- **Herbicida** — controle de plantas daninhas
- **Fungicida** — controle de doenças (ferrugem asiática, cercospora...)
- **Inseticida** — controle de pragas (lagarta, percevejo, mosca-branca...)
- **Fertilizante Foliar** — nutrição via folha (boro, zinco, molibdênio...)
- **Inoculante** — fixação biológica de nitrogênio (pré-plantio)
- **Bioestimulante** — promotores de crescimento

### Dados da aplicação
- **Data** — quando foi aplicado
- **Ciclo e talhão(s)** — pode aplicar em múltiplos talhões de uma vez
- **Volume de calda** (L/ha) — padrão 100-150 L/ha em soja
- **Equipamento** — pulverizador autopropelido ou barra (do cadastro de máquinas)

### Para cada produto
| Campo | Exemplo |
|---|---|
| Produto | Roundup Original DI |
| Dose | 2,0 L/ha |
| Quantidade total | Calculado (dose × área) |
| Unidade | L, kg, g |

### Relatório de aplicações
Após lançar as pulverizações, veja o resumo em **Lavoura** → **Relatórios** → **Aplicações por Ciclo**.
            `,
            dica: "O relatório de aplicações pode ser exportado para Excel e enviado por WhatsApp.",
          },
          {
            id: "lc-1-2-3",
            titulo: "Registrando a Colheita",
            duracao: "7 min",
            tipo: "pratica",
            conteudo: `
## Como registrar a Colheita

Vá em **Lavoura** → **Colheita** → **+ Nova Colheita**.

### Romaneio de colheita
O romaneio é o documento de controle de pesagem na colheita.

Para cada carga (caminhão):
1. **Peso bruto** — peso do caminhão cheio na balança
2. **Tara** — peso do caminhão vazio
3. **Peso líquido** = Peso bruto − Tara
4. **Classificação** — análise do grão coletada no laboratório

### Classificação ABIOVE (Soja)
| Parâmetro | Limite | Desconto |
|---|---|---|
| Umidade | ≤ 14% | % acima desconta no peso |
| Impureza | ≤ 1% | % acima desconta no peso |
| Avariados total | ≤ 8% | % acima desconta no peso |
| Ardidos/Queimados | ≤ 2% | Classificação inferior |

> O sistema calcula os descontos automaticamente e mostra o **peso líquido recebido** após classificação.

### O que o sistema faz automaticamente
✅ Entrada no estoque (sacas de soja/milho)
✅ Lança a produtividade no ciclo (sc/ha)
✅ Fecha o custo por saca colhida
✅ Disponibiliza para comercialização

### Produtividade média em Nova Mutum - MT
- Soja: 60–65 sc/ha (bom), 70+ sc/ha (excelente)
- Milho 2ª: 120–140 sc/ha
- Algodão: 250–300 @/ha
            `,
          },
        ],
      },
    ],
  },

  // ── FASE 2 — Estoque e Compras ──────────────────────────────
  {
    id: "fase-2",
    numero: 2,
    titulo: "Estoque e Compras",
    subtitulo: "Controle de insumos e entradas de notas",
    modulos: [
      {
        id: "mod-2-1",
        numero: 1,
        titulo: "Gestão de Estoque",
        descricao: "Posição, movimentações e custo médio",
        icone: "📦",
        cor: "#C9921B",
        licoes: [
          {
            id: "lc-2-1-1",
            titulo: "Entendendo o Custo Médio Ponderado",
            duracao: "5 min",
            tipo: "leitura",
            conteudo: `
## Custo Médio Ponderado (CMP)

O Arato usa o método de **Custo Médio Ponderado** para valorizar o estoque. É o método mais utilizado no agronegócio brasileiro.

### Como funciona

Cada vez que você recebe uma NF de entrada, o sistema recalcula o custo médio:

\`\`\`
Novo CMP = (Qtd. atual × CMP atual + Qtd. entrada × Preço entrada)
           ÷ (Qtd. atual + Qtd. entrada)
\`\`\`

### Exemplo prático

| Evento | Qtd | Preço unit | CMP |
|---|---|---|---|
| Estoque inicial | 1.000 L | R$ 10,00 | R$ 10,00 |
| Entrada NF | 500 L | R$ 12,00 | R$ 10,67 |
| Saída para lavoura | 300 L | — | R$ 10,67 |
| Estoque restante | 1.200 L | — | R$ 10,67 |

### Por que isso importa
- O custo lançado no DRE usa o CMP do momento do consumo
- Compras mais baratas reduzem o CMP e melhoram a margem
- Você pode ver o CMP de cada produto na tela de Estoque → Posição
            `,
          },
          {
            id: "lc-2-1-2",
            titulo: "Entrada de NF — passo a passo",
            duracao: "7 min",
            tipo: "pratica",
            conteudo: `
## Lançando NF de Entrada

Vá em **Compras** → **NF de Produtos** → **+ Nova NF**.

### Passo 1: Identificação
Você pode importar automaticamente digitando o XML da NF-e ou lançar manualmente:
- **CNPJ Emitente** — fornecedor
- **Número e Série** — da nota fiscal
- **Data de emissão**
- **Chave de acesso** (44 dígitos)

### Passo 2: Itens
Para cada item da nota:
- Produto do cadastro (ou novo)
- Quantidade e unidade
- Valor unitário e total

### Passo 3: Distribuição
Cada item pode ter um destino:
| Destino | Quando usar |
|---|---|
| **Estoque** | Insumos que vão para o depósito |
| **Consumo Direto** | Vai direto para a lavoura (pequenos volumes) |
| **Maquinário** | Peça ou serviço vinculado a uma máquina |
| **Terceiros** | Material entregue em propriedade de terceiro |

### O que o sistema faz automaticamente
✅ Atualiza o custo médio ponderado do produto
✅ Aumenta o saldo em estoque
✅ Gera conta a pagar (se prazo > 0)
✅ Registra no histórico da máquina (se manutenção)
            `,
            dica: "Alerta automático se o preço unitário for 10% acima do CMP atual.",
          },
        ],
      },
      {
        id: "mod-2-2",
        numero: 2,
        titulo: "Pedidos de Compra",
        descricao: "Do rascunho à entrega — controle completo",
        icone: "🛒",
        cor: "#C9921B",
        licoes: [
          {
            id: "lc-2-2-1",
            titulo: "Fluxo do Pedido de Compra",
            duracao: "5 min",
            tipo: "leitura",
            conteudo: `
## Ciclo de vida de um Pedido de Compra

**Rascunho → Aprovado → Em entrega → Entregue**

### 1. Rascunho
Você ou sua equipe cria o pedido com fornecedor, itens e condições de pagamento.
Ainda não impacta o financeiro nem o estoque.

### 2. Aprovado
O pedido foi confirmado com o fornecedor. O sistema pode gerar uma conta a pagar prevista.

### 3. Em entrega (parcial)
Quando a NF de entrada é lançada e não cobre 100% do pedido.
Você vê uma **barra de progresso** mostrando o % já entregue por item.

### 4. Entregue
Todos os itens foram recebidos. O status fecha automaticamente quando 100% dos itens tiverem NF de entrada vinculada.

### Vantagens do pedido de compra
- Controle de prazo de entrega por item
- Rastreabilidade pedido ↔ NF de entrada
- Histórico de negociação com fornecedores
- Base para análise de desempenho de fornecedores

Vá em **Compras** → **Pedidos de Compra** para começar.
            `,
          },
        ],
      },
    ],
  },

  // ── FASE 3 — Comercialização ───────────────────────────────
  {
    id: "fase-3",
    numero: 3,
    titulo: "Comercialização de Grãos",
    subtitulo: "Contratos, romaneio e expedição",
    modulos: [
      {
        id: "mod-3-1",
        numero: 1,
        titulo: "Contratos de Grãos",
        descricao: "Do contrato à NF-e de venda",
        icone: "📋",
        cor: "#378ADD",
        licoes: [
          {
            id: "lc-3-1-1",
            titulo: "Tipos de contrato e modalidades",
            duracao: "5 min",
            tipo: "leitura",
            conteudo: `
## Tipos de Contrato de Venda de Grãos

### Quanto ao preço
| Modalidade | Descrição |
|---|---|
| **Fixo (R$)** | Preço travado em reais no momento da assinatura |
| **Fixo (USD)** | Preço travado em dólares (proteção cambial) |
| **À Fixar** | Volume comprometido, preço a definir depois |
| **Basis** | Preço = CBOT ± prêmio (basis) |

### Quanto ao tipo de operação
| Tipo | CFOP | Quando usar |
|---|---|---|
| Venda direta | 6.101 | Grão vai direto para o comprador |
| Remessa para armazenagem | 6.501 / 5.501 | Grão vai para silo de terceiro |
| Venda a ordem | 6.120 | Comprador já tem o grão em armazém |

### Fluxo completo de uma venda
1. Contrato assinado com a trading (Bunge, Amaggi, Cargill...)
2. Confirmação do contrato no Arato
3. Embarques gerados (romaneios de caminhão)
4. NF-e gerada automaticamente ao confirmar o romaneio
5. Expedição registrada (MDF-e se necessário)
6. Conta a receber gerada automaticamente

> **Regra importante:** A NF-e de venda só pode ser emitida **depois** do romaneio completo (peso bruto + tara + peso líquido informados).
            `,
          },
          {
            id: "lc-3-1-2",
            titulo: "Lançando um Contrato",
            duracao: "7 min",
            tipo: "pratica",
            conteudo: `
## Como lançar um Contrato de Venda

Vá em **Comercial** → **Contratos de Grãos** → **+ Novo Contrato**.

### Aba Principal
| Campo | Descrição |
|---|---|
| Nº Contrato | Número do contrato com a trading |
| Safra/Ciclo | A qual ciclo este contrato está vinculado |
| Tipo | Compra ou Venda |
| Confirmado | Marque quando o contrato estiver assinado |
| Produtor | Quem está vendendo |
| Cliente | A trading compradora |
| Modalidade de preço | Fixo R$, Fixo USD, À Fixar, Basis |
| Valor total (R$) | Valor financeiro do contrato |

### Grid de itens
Para cada lote/produto:
- Produto (ex: Soja Grão — NCM 1201.10.00)
- Quantidade (sacas)
- Preço unitário (R$/sc ou USD/sc)
- CFOP (preenchido automaticamente pela Natureza da Operação)

### Aba Adicionais
- Depósito de carregamento (origem do grão)
- Depósito fiscal (para remessas)
- Transportadora e dados de frete

### Após confirmar o contrato
O sistema move o saldo de grãos do campo "Livre" para "Comprometido" automaticamente.
            `,
          },
        ],
      },
    ],
  },

  // ── FASE 4 — Financeiro ────────────────────────────────────
  {
    id: "fase-4",
    numero: 4,
    titulo: "Financeiro",
    subtitulo: "Fluxo de caixa, CP e CR",
    modulos: [
      {
        id: "mod-4-1",
        numero: 1,
        titulo: "Contas a Pagar e Receber",
        descricao: "Lançamentos, vencimentos e baixas",
        icone: "💰",
        cor: "#1A4870",
        licoes: [
          {
            id: "lc-4-1-1",
            titulo: "Estrutura do Lançamento Financeiro",
            duracao: "5 min",
            tipo: "leitura",
            conteudo: `
## Anatomia de um Lançamento Financeiro

Todo lançamento no Arato tem os mesmos campos fundamentais:

### Campos obrigatórios
| Campo | Descrição |
|---|---|
| Tipo | Débito (saída) ou Crédito (entrada) |
| Descrição | Texto livre explicando o lançamento |
| Valor | Valor em R$ ou USD |
| Vencimento | Data de pagamento/recebimento |
| Conta bancária | Qual conta será movimentada |
| Categoria | Plano de contas (ex: 3.01.001 — Herbicidas) |
| Status | Previsto → Pago/Recebido |

### Lançamentos automáticos vs manuais
**Automáticos (azul)** — gerados pelo sistema ao confirmar outra ação:
- Contrato de grãos confirmado → CR (conta a receber)
- NF de entrada lançada → CP (conta a pagar)
- Arrendamento cadastrado → CP (parcelas do ano)

**Manuais (mostarda)** — você lança diretamente em CP ou CR:
- Despesas de campo sem NF
- Receitas diversas
- Transferências entre contas

### O Plano de Contas
O plano de contas hierárquico organiza todas as movimentações:
- **1.xxx** — Receitas
- **2.xxx** — Custos variáveis (CPV)
- **3.xxx** — Despesas operacionais
- **4.xxx** — Despesas financeiras

Configure em **Cadastros** → **Tabelas Auxiliares** → **Plano de Contas**.
            `,
          },
          {
            id: "lc-4-1-2",
            titulo: "Alertas de vencimento automáticos",
            duracao: "3 min",
            tipo: "leitura",
            conteudo: `
## Alertas de Vencimento

O Arato verifica diariamente todas as contas a pagar e receber e envia alertas por e-mail.

### Quando os alertas são enviados
| Prazo | Urgência | Cor |
|---|---|---|
| 7 dias | Médio | Azul info |
| 3 dias | Alto | Laranja |
| 1 dia | Crítico | Vermelho |
| Vencido | Urgente | Vermelho escuro |

### O que o e-mail contém
- Tabela de vencimentos agrupada por urgência
- Valor total de CP e CR da semana
- Saldo projetado na conta bancária
- Alertas de certificado A1 (30/15/7/1 dias antes)

### Configurar destinatários
Os e-mails são enviados para todos os usuários cadastrados com acesso à fazenda.
Configure em **Configurações** → **Automações** → card "Alertas de Vencimento".

> **Dica:** Você pode disparar o alerta manualmente para testar. Vá em Configurações → Automações → botão "Executar agora".
            `,
          },
        ],
      },
    ],
  },

  // ── FASE 5 — Fiscal ────────────────────────────────────────
  {
    id: "fase-5",
    numero: 5,
    titulo: "Fiscal e NF-e",
    subtitulo: "Emissão, transmissão e armazenamento",
    modulos: [
      {
        id: "mod-5-1",
        numero: 1,
        titulo: "NF-e no Agronegócio",
        descricao: "CFOP, CST, ICMS Diferido e Funrural",
        icone: "📄",
        cor: "#E24B4A",
        licoes: [
          {
            id: "lc-5-1-1",
            titulo: "CFOP: o código que define a operação",
            duracao: "5 min",
            tipo: "leitura",
            conteudo: `
## O que é o CFOP

O **Código Fiscal de Operações e Prestações (CFOP)** define a natureza de cada operação fiscal. É obrigatório em toda NF-e.

### Estrutura do CFOP
- **1.xxx** — Entradas dentro do estado
- **2.xxx** — Entradas de outro estado
- **5.xxx** — Saídas dentro do estado
- **6.xxx** — Saídas para outro estado (mais comum no agronegócio de MT)

### CFOPs mais usados em MT
| CFOP | Descrição | Quando usar |
|---|---|---|
| **6.101** | Venda de produção do estabelecimento | Venda de soja/milho/algodão para trading de outro estado |
| **5.101** | Venda de produção (intraestadual) | Venda para compradores dentro do MT |
| **6.501** | Remessa para armazenagem em depósito fechado | Transbordo para silo fora do MT |
| **5.501** | Remessa para armazenagem (intraestadual) | Transbordo para silo dentro do MT |
| **6.905** | Remessa para depósito fechado ou armazém geral | Grão em custódia fora do estado |
| **1.101** | Compra para industrialização | Entrada de insumos |
| **1.102** | Compra para comercialização | Entrada de produtos para revenda |

> **No Arato:** O CFOP é preenchido automaticamente quando você seleciona a "Natureza da Operação" no contrato.
            `,
          },
          {
            id: "lc-5-1-2",
            titulo: "ICMS Diferido em MT",
            duracao: "6 min",
            tipo: "leitura",
            conteudo: `
## ICMS Diferido — o benefício fiscal de Mato Grosso

O **diferimento do ICMS** é um dos principais benefícios fiscais para produtores rurais em MT.

### O que é diferimento
Em vez de pagar o ICMS no momento da saída, o pagamento é "adiado" para a próxima etapa da cadeia.

### Como funciona na prática
1. Produtor rural vende soja para trading em MT → ICMS diferido (0% na NF)
2. A trading, ao industrializar ou exportar, "assume" o ICMS diferido
3. Na exportação, há imunidade (não paga ICMS) → o diferimento "cai"

### Benefício real
**O produtor rural em MT paga ICMS = 0% na venda de soja/milho/algodão.**

### Como configurar no Arato
Em **Parâmetros do Sistema** → aba **Fiscal**:
- CST padrão para saídas: **090** (ICMS Simples Nacional) ou **050** (suspensão/diferimento)
- O Arato aplicará automaticamente em toda NF-e de saída

### Funrural
Além do ICMS, há a contribuição previdenciária rural:
- **1,5%** sobre a receita bruta para pessoa física (CPF)
- **1,5%** para pessoa jurídica + **0,2% SENAR**
- O Arato calcula e exibe o Funrural em cada contrato
            `,
            dica: "Consulte seu contador para confirmar o regime tributário e os benefícios aplicáveis à sua fazenda.",
          },
        ],
      },
    ],
  },

  // ── FASE 6 — Relatórios e DRE ──────────────────────────────
  {
    id: "fase-6",
    numero: 6,
    titulo: "Relatórios e DRE",
    subtitulo: "Análise de resultado e tomada de decisão",
    modulos: [
      {
        id: "mod-6-1",
        numero: 1,
        titulo: "DRE Agrícola",
        descricao: "Resultado por safra e análise de ponto de equilíbrio",
        icone: "📊",
        cor: "#1A4870",
        licoes: [
          {
            id: "lc-6-1-1",
            titulo: "Lendo o DRE Agrícola",
            duracao: "6 min",
            tipo: "leitura",
            conteudo: `
## Demonstrativo de Resultado da Safra

O **DRE Agrícola** mostra o resultado financeiro de cada safra (ciclo).

### Estrutura do DRE

\`\`\`
(+) Receita Bruta
    Vendas realizadas (contratos confirmados)
    Outras receitas (indenizações, subvenções)

(-) Deduções
    Funrural (1,5%)
    SENAR (0,2%)
    FETHAB (MT)

(=) Receita Líquida

(-) Custo dos Produtos Vendidos (CPV)
    Sementes
    Fertilizantes
    Defensivos
    Correção de Solo
    Operações Mecanizadas

(-) Despesas Operacionais
    Arrendamento
    Mão de obra
    Depreciação
    Combustível

(-) Despesas Financeiras
    Juros de custeio
    IOF

(=) Resultado Operacional (EBITDA)

(=) Resultado Líquido
\`\`\`

### Como acessar
Vá em **Relatórios** → **DRE Agrícola**, selecione o ano safra e os ciclos.

### Indicadores importantes
| Indicador | Fórmula | O que indica |
|---|---|---|
| Margem bruta | Receita líquida / Receita bruta | % que fica após deduções |
| Custo por hectare | CPV / Área total | Custo de produção/ha |
| Custo por saca | CPV / Sacas produzidas | Custo de produção/sc |
| Ponto de equilíbrio | Custo total / Preço médio/sc | Sc/ha para cobrir custos |
| ROI da safra | Resultado / Custo × 100 | Retorno sobre investimento |
            `,
          },
        ],
      },
    ],
  },

  // ── FASE 7 — Controller e Automações ──────────────────────
  {
    id: "fase-7",
    numero: 7,
    titulo: "Controller e Automações",
    subtitulo: "Alertas inteligentes e controles automáticos",
    modulos: [
      {
        id: "mod-7-1",
        numero: 1,
        titulo: "O Controller",
        descricao: "Como o sistema monitora e alerta sobre problemas",
        icone: "🎯",
        cor: "#C9921B",
        licoes: [
          {
            id: "lc-7-1-1",
            titulo: "O que é o Controller",
            duracao: "4 min",
            tipo: "leitura",
            conteudo: `
## Controller — o auditor automático do Arato

O **Controller** é um módulo que verifica continuamente a consistência dos seus dados e alerta sobre problemas antes que causem prejuízos.

### Como funciona
A cada 24 horas (ou quando você acionar manualmente), o Controller executa dezenas de verificações:

#### Fiscal
- NF-e emitidas sem chave de autorização
- Notas em situação de rejeição
- Certificado A1 vencendo em menos de 30 dias

#### Financeiro
- Contas a pagar vencidas sem baixa
- Contas a receber vencidas
- Diferença entre saldo bancário e saldo no sistema

#### Contratos
- Contratos confirmados sem embarque há mais de 30 dias
- Prazo de entrega de contratos expirado
- Saldo de grãos negativo (mais comprometido do que disponível)

#### Lavoura
- Ciclos em andamento sem registro de operação há mais de 20 dias
- Talhões sem ciclo ativo na safra corrente

#### Arrendamentos
- Parcelas de arrendamento vencendo em 15 dias

### Severidades
| Cor | Nível | Ação sugerida |
|---|---|---|
| 🔴 Vermelho | Crítico | Ação imediata necessária |
| 🟠 Laranja | Alto | Resolver em 48h |
| 🟡 Amarelo | Médio | Monitorar |
| 🔵 Azul | Baixo | Informativo |

### Acessar o Controller
Vá em **Ajuda** → **Controller** para ver todos os alertas ativos.
            `,
          },
        ],
      },
    ],
  },
];

// ── Helpers ─────────────────────────────────────────────────

export function totalLicoes(): number {
  return FASES.reduce((acc, f) => acc + f.modulos.reduce((a, m) => a + m.licoes.length, 0), 0);
}

export function getLicaoPorId(lesson_id: string): { licao: Licao; modulo: Modulo; fase: Fase } | null {
  for (const fase of FASES) {
    for (const modulo of fase.modulos) {
      for (const licao of modulo.licoes) {
        if (licao.id === lesson_id) return { licao, modulo, fase };
      }
    }
  }
  return null;
}

export function porcentagemConcluida(completedIds: Set<string>): number {
  const total = totalLicoes();
  if (total === 0) return 0;
  return Math.round((completedIds.size / total) * 100);
}
