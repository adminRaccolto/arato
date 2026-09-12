/**
 * Manual Operacional do Arato — Olívia
 * Gerado a partir do mapa real do TopNav e das páginas existentes.
 * Atualizar sempre que uma tela for criada, removida ou renomeada.
 * Última revisão: setembro/2026
 */

export const MANUAL_OPERACIONAL = `
# Manual Operacional — Arato
Versão: setembro/2026

Este manual descreve como navegar e usar cada módulo do Arato.
A Olívia usa este documento para responder perguntas de usuários.

---

## CONCEITOS ESSENCIAIS

**Saca (sc):** 60 kg. Unidade padrão de grãos (soja, milho, trigo).
**Arroba (@):** 15 kg. Unidade padrão de algodão e boi.
**Ciclo:** Safra operacional — ex: "Soja 2025/2026", "Milho 2ª 2025/2026". Toda operação de campo é vinculada a um ciclo. A tabela "Safras" está vazia — use sempre "Ciclos".
**CP:** Conta a Pagar. **CR:** Conta a Receber.
**Talhão:** Subdivisão operacional da fazenda. Unidade básica de plantio.
**OG:** Operação Gerencial — vincula o lançamento ao plano de contas.
**CFOP:** Código fiscal da operação (ex: 6501 = venda soja para outro estado).
**Romaneio:** Documento de pesagem de caminhão (bruto, tara, líquido).
**Barter:** Troca de insumos por grãos.
**LCDPR:** Livro Caixa Digital do Produtor Rural (obrigação Receita Federal para PF).
**SIEG:** Serviço que captura automaticamente NF-e emitidas para o CNPJ/CPF da fazenda.
**MDF-e:** Manifesto Eletrônico de Documentos Fiscais — obrigatório no transporte de carga.
**CT-e:** Conhecimento de Transporte Eletrônico.

**Cor azul = ação automática (sistema fez). Cor mostarda = ação manual (usuário fez).**

---

## ESTRUTURA DO MENU (navegação real do sistema)

O menu superior do Arato tem os seguintes grupos principais:

1. **Lavoura** — operações de campo e planejamento agrícola
2. **Compras & Estoque** — pedidos, NFs de entrada, estoque
3. **Comercial & Logística** — contratos, expedição, transporte, balança
4. **Financeiro** — CP, CR, fluxo de caixa, tesouraria, relatórios
5. **Fiscal** — NF-e emitidas, LCDPR, SPED
6. **Resultados** — DRE, custos, produtividade
7. **Configurações** — cadastros, parâmetros, usuários
8. **Ajuda** — aprendizado e Suporte IA (esta tela)

---

## MÓDULO 1 — DASHBOARD

**Caminho:** Tela inicial após o login.

**O que faz:** Resumo geral da fazenda com preços de mercado ao vivo, alertas de vencimento e resumo financeiro.

**Preços de mercado (atualização automática a cada 5 min):**
- Soja CBOT em US$/sc e R$/sc
- Milho CBOT em US$/sc e R$/sc
- Algodão ICE em ¢/lb e R$/@
- Dólar (USD/BRL)

**Alertas de vencimento:**
- Vermelho (crítico): vencendo hoje ou vencido
- Laranja (alto): vencendo em até 3 dias
- Azul (médio): vencendo em até 7 dias
- Tipos monitorados: CP, CR, Arrendamento, Certificado A1, Contrato de Grãos, Estoque Mínimo, Seguro

---

## MÓDULO 2 — LAVOURA → PLANEJAMENTO

### 2.1 Planejamento de Safra
**Caminho:** Lavoura → Planejamento → Planejamento de Safra

Gerencia ciclos agrícolas com orçamento, comparativo planejado×realizado e agenda de operações.

**Abas:**
- **Orçamento** — itens por categoria (sementes, fertilizantes, defensivos, correção de solo, operações, arrendamento, outros); mostra custo/ha, receita esperada e margem estimada.
- **Comparativo Planejado×Realizado** — desvio por categoria com barra de progresso.
- **Agenda** — cronograma de operações do ciclo selecionado.

### 2.2 Safras e Ciclos
**Caminho:** Lavoura → Planejamento → Safras e Ciclos

Cadastra anos safra e ciclos. Todo lançamento de campo exige um ciclo previamente cadastrado aqui.

### 2.3 Orçamento Planejado × Realizado
**Caminho:** Lavoura → Planejamento → Orçamento Planejado × Realizado

Atalho direto para a aba Comparativo do Planejamento de Safra.

---

## MÓDULO 3 — LAVOURA → OPERAÇÕES DE CAMPO

### 3.1 Plantio
**Caminho:** Lavoura → Operações de Campo → Plantio

Registra o plantio por talhão. Gera baixa automática no estoque de sementes e lança CP de sementes.

**Seletor em cascata (obrigatório em ordem):** Produtor → Fazenda → Ano Safra → Ciclo → Talhão

**Campos:** área plantada (ha), data, semente (select do estoque), variedade, dose (kg/ha), data prevista colheita, produtividade esperada (sc/ha), preço esperado (R$/sc).

**Automático ao salvar:**
1. Baixa no estoque de sementes (dose × área)
2. CP "Custo de Sementes" vinculada ao ciclo

### 3.2 Adubação de Base
**Caminho:** Lavoura → Operações de Campo → Adubação de Base

Registra aplicações de fertilizantes sólidos ou líquidos antes ou durante o plantio. Gera baixa de estoque e CP de fertilizantes.

### 3.3 Correção de Solo
**Caminho:** Lavoura → Operações de Campo → Correção de Solo

Registra aplicações de calcário, gesso e corretivos de solo. Gera baixa de estoque e lançamento de custo.

### 3.4 Pulverização Terrestre
**Caminho:** Lavoura → Operações de Campo → Pulverização Terrestre

Registra aplicações de defensivos e fertilizantes foliares. Gera baixa de estoque e CP de defensivos.

**Tipos de operação:** herbicida, fungicida, inseticida, nematicida, acaricida, fertilizante foliar, regulador, dessecação, outros.

**Automático ao salvar:**
1. Baixa de cada produto no estoque (dose × área)
2. CP "Defensivos Agrícolas"

### 3.5 Aplicação Aérea
**Caminho:** Lavoura → Operações de Campo → Aplicação Aérea

Registra aplicações realizadas por aeronaves agrícolas. Mesmos campos da pulverização terrestre.

### 3.6 Tratamento de Sementes
**Caminho:** Lavoura → Operações de Campo → Tratamento de Sementes

Registra tratamentos com fungicidas, inseticidas e inoculantes aplicados às sementes antes do plantio.

---

## MÓDULO 4 — LAVOURA → MONITORAMENTO

### 4.1 Mapa de Talhões
**Caminho:** Lavoura → Monitoramento → Mapa de Talhões

Visualização dos talhões com suas coordenadas GPS cadastradas.

### 4.2 Recomendações Agronômicas
**Caminho:** Lavoura → Monitoramento → Recomendações Agronômicas

Registro de laudos e recomendações do agrônomo responsável pela fazenda.

### 4.3 Pragas & Doenças
**Caminho:** Lavoura → Monitoramento → Pragas & Doenças

Monitoramento de ocorrência de pragas e doenças por talhão.

### 4.4 Pluviometria
**Caminho:** Lavoura → Monitoramento → Pluviometria

Registro de índices pluviométricos por fazenda e talhão.

---

## MÓDULO 5 — LAVOURA → COLHEITA

### 5.1 Colheita
**Caminho:** Lavoura → Colheita → Colheita

Registra romaneios de colheita (pesagem de cada caminhão) com classificação de grãos.

**Processo em 2 etapas:**
1. Crie o registro de colheita: fazenda, ciclo, talhão, área colhida (ha), data.
2. Adicione romaneios (um por caminhão):
   - Placa (*), Peso bruto (kg) (*), Tara (kg)
   - Classificação por commodity:
     - **Soja (ABIOVE):** umidade (padrão 14%), impureza (padrão 1%), avariados (ardidos+mofados+fermentados+germinados+esverdeados+quebrados+carunchados)
     - **Milho (IN MAPA 60/2011):** umidade (padrão 14,5%), impureza, avariados, chochos, ardidos, fermentados
3. Clique em **Finalizar Colheita** → o sistema registra entrada no estoque e atualiza a produtividade real do ciclo.

**Importante:** A Pesagem Avulsa de carga NÃO vinculada à colheita deve ser feita em **Comercial & Logística → Balança → Pesagem Avulsa**.

### 5.2 Romaneios de Produção
**Caminho:** Lavoura → Colheita → Romaneios de Produção

Lista todos os romaneios de entrada de produção (grãos colhidos e armazenados).

### 5.3 Classificação de Grãos
**Caminho:** Lavoura → Colheita → Classificação de Grãos

Gerencia padrões de classificação por commodity (parâmetros ABIOVE para soja, IN MAPA 60/2011 para milho).

---

## MÓDULO 6 — LAVOURA → MÁQUINAS

### 6.1 Máquinas e Veículos
**Caminho:** Lavoura → Máquinas → Máquinas e Veículos

Cadastro de tratores, colheitadeiras, caminhões e outros equipamentos da fazenda.

### 6.2 Manutenções
**Caminho:** Lavoura → Máquinas → Manutenções

Histórico de manutenções preventivas e corretivas por máquina.

### 6.3 Custos por Máquina
**Caminho:** Lavoura → Máquinas → Custos por Máquina

Relatório de gastos de manutenção e combustível agrupados por equipamento.

---

## MÓDULO 7 — LAVOURA → ALGODÃO (Add-on opcional)

**Disponível apenas para contas com o add-on Algodão habilitado.**
**Caminho:** Lavoura → Algodão → (aba desejada)

**Abas disponíveis:**
- **Safra & Operações** — operações especiais como defolhação e regulador de crescimento (NAWF, % abertura maçãs).
- **Monitoramento de Bicudo** — armadilhas por talhão, leituras semanais; alerta automático ≥ 8 capturas/armadilha/semana.
- **Colheita & Módulos** — rastreamento campo → transporte → algodoeira.
- **Algodoeira / Beneficiamento** — lotes com rendimento de pluma (semáforo < 38% / 38-40% / ≥ 40%).
- **HVI & Qualidade** — laudo por lote com 11 parâmetros USDA/HVI vs referências MT.
- **Posição de Algodão** — preço ICE/CBOT ao vivo (¢/lb e R$/@), valor do estoque de pluma, posição por algodoeira.

---

## MÓDULO 8 — COMPRAS & ESTOQUE → COMPRAS

### 8.1 Pedidos de Compra
**Caminho:** Compras & Estoque → Compras → Pedidos de Compra

Controla o processo de compra de insumos do rascunho até a entrega, gerando automaticamente NF de entrada ao receber.

**Status:** rascunho → aprovado → parcialmente_entregue → entregue / cancelado

**Abas do pedido:** Principal (fazenda, fornecedor, produtor responsável com IE, fiscal), Itens/Serviços/CC, Desconto, Entregas (pedidos não-fiscais) ou NFs Vinculadas (pedidos fiscais), Cobrança, Documentos.

**Atenção:** Pedidos com NFs de entrada vinculadas não podem ser excluídos — use status "Cancelado".

### 8.2 NF de Produtos
**Caminho:** Compras & Estoque → Compras → NF de Produtos

Lança notas fiscais de compra de produtos (insumos, materiais) com entrada no estoque e geração automática de CP.

**Fluxo:** Upload XML (recomendado) ou modo manual → Cabeçalho (fornecedor, CNPJ, número, CFOP, vínculo de atividade, entidade contábil, depósito padrão) → Itens & Processamento (associar produtos ao catálogo).

**Auto-preenchimento por CNPJ:** ao importar XML, o fornecedor é preenchido automaticamente se o CNPJ estiver cadastrado em Pessoas.

**Integração SIEG:** botão "Sincronizar SIEG" importa NFs recebidas automaticamente do serviço de captura de XML.

**Botões por status:**
- Pendente: Processar, Excluir
- Processada: Ver, DANFE, Devolver, Reclassificar, Estornar, Excluir
- Para desfazer: use **Estornar** — reverte estoque, CP e pendências fiscais antes de excluir.

### 8.3 NF de Serviços (NFS-e)
**Caminho:** Compras & Estoque → Compras → NF de Serviços

Lança notas fiscais de serviços recebidos (NFS-e). Completamente separado da NF de produtos.

**Wizard 3 passos:** Prestador → Serviço (código LC 116/2003, discriminação, valor) → Tributação (ISS, retenções federais: PIS, COFINS, CSLL, IRRF, INSS).

### 8.4 Pendências de Classificação
**Caminho:** Compras & Estoque → Compras → Pendências de Classificação

Lista NFs capturadas pelo SIEG aguardando classificação gerencial (categoria e OG).

---

## MÓDULO 9 — COMPRAS & ESTOQUE → ESTOQUE

### 9.1 Posição de Estoque
**Caminho:** Compras & Estoque → Estoque → Posição de Estoque

Saldo atual por produto. Filtros: categoria, depósito, busca por nome. Badge vermelho = abaixo do mínimo.

### 9.2 Kardex (Ficha de Estoque)
**Caminho:** Compras & Estoque → Estoque → Kardex (Ficha de Estoque)

Rastreamento completo de entradas e saídas de um produto específico, com saldo e custo médio a cada movimentação.

- **Filtros:** insumo (obrigatório), depósito (opcional), período, fazenda (mostra todos os depósitos da conta).
- **Colunas:** Data · Tipo · Operação · Origem · Quantidade · Saldo Acumulado · Depósito · Usuário.
- **Coluna Origem:** exibe ícone e link contextual — 📄 NF (link para NF), 🌱 Aplicação em campo (ciclo), 🔄 Transferência, ⛽ Abastecimento, 🌿 Baixa de uso, ⚠ Perda, ⚙ Ajuste de saldo, 📦 Inventário.
- **Coluna Usuário:** nome do operador que lançou, ou "Sistema" para lançamentos automáticos.

### 9.3 Movimentação por Produto (Posição de Insumos)
**Caminho:** Compras & Estoque → Estoque → Posição de Insumos → painel "Movimentação por Produto"

Histórico filtrado de movimentações do produto selecionado, com as mesmas colunas Origem e Usuário do Kardex.

### 9.4 Transferências entre Fazendas
**Caminho:** Compras & Estoque → Estoque de Insumos → Transferência entre Fazendas

Registra movimentação de insumos entre fazendas da mesma conta com emissão de NF de transferência.

**Fluxo em 2 etapas:**
1. Clique em **+ Nova Transferência**, preencha origem, destino, CFOP, itens e salve → a transferência fica como **Rascunho**.
2. Na tabela, revise os dados e clique em **Emitir NF** para emitir a nota. Após emitida, o botão muda para **DANFE** e **Confirmar Entrada** (se entrada não for automática).

**CFOP:** selecionável entre 5 opções; padrão é 5152/6152 (mercadoria adquirida de terceiros, sem ST). O prefixo 5 (mesmo estado) ou 6 (inter-estadual) é calculado automaticamente pelos estados das fazendas.

**Botões na tabela por status:**
- Rascunho: Visualizar · **Emitir NF** · Cancelar
- Emitida: Visualizar NF · DANFE · Confirmar Entrada (se não automático) · Cancelar
- Entrada Confirmada / Cancelada: Visualizar NF

### 9.4 Abastecimento de Máquinas
**Caminho:** Compras & Estoque → Estoque → Abastecimento de Máquinas

Registra abastecimentos de combustível por máquina, com baixa automática no estoque.

### 9.5 Romaneios de Terceiros
**Caminho:** Compras & Estoque → Estoque → Romaneios de Terceiros

Romaneios de entrada de grãos em armazéns de terceiros (depositário externo).

---

## MÓDULO 10 — COMPRAS & ESTOQUE → INTEGRAÇÃO DE DOCUMENTOS

### 10.1 Notas Capturadas (SIEG)
**Caminho:** Compras & Estoque → Integração de Documentos → Notas Capturadas (SIEG)

Central de classificação das NF-e capturadas automaticamente pelo SIEG. Permite classificar rapidamente por operação gerencial e categoria antes de processar.

### 10.2 Ligar / Desligar SIEG
**Caminho:** Compras & Estoque → Integração de Documentos → ⚡ Ligar / Desligar SIEG

Atalho para a tela de Automações onde o SIEG pode ser ativado ou desativado.

---

## MÓDULO 11 — COMERCIAL & LOGÍSTICA → COMERCIALIZAÇÃO

### 11.1 Contratos de Grãos
**Caminho:** Comercial & Logística → Comercialização → Contratos de Grãos

Gerencia contratos de venda de grãos (soja, milho, algodão) com compradores.

**Status:** aberto → parcial → encerrado / cancelado

**Add-on IA (ia_contrato_venda):** ao criar um contrato, clique em "Selecionar PDF" para que o Arato extraia automaticamente os dados do contrato assinado pela trading (comprador, vendedor, produto, volume, preço, datas, CFOP).

**Romaneio de entrega:** No contrato, clique em **+ Romaneio**. Preencha placa (*), peso bruto (*), tara e classificação por commodity.

**Automático:**
- CFOP preenchido ao escolher Natureza da Operação
- Saldo do contrato atualizado a cada romaneio
- Status "parcial" ou "encerrado" calculado automaticamente

### 11.2 Compromissos em Grãos
**Caminho:** Comercial & Logística → Comercialização → Compromissos em Grãos

Relatório read-only de contratos de grãos originados de arrendamentos, compras de terra e barter. Mostra KPIs totais e por commodity com barra de progresso de entrega.

### 11.3 Faturamento / NF-e de Saída
**Caminho:** Comercial & Logística → Comercialização → Faturamento / NF-e de Saída

Emissão de NF-e de venda de grãos. Integrada com contratos — ao emitir gera CR automaticamente.

### 11.4 Compra de Terra
**Caminho:** Comercial & Logística → Comercialização → Compra de Terra

Gerencia contratos de compra de propriedades rurais com parcelas a prazo (BRL ou sacas de grãos).

### 11.5 Contratos de Arrendamento
**Caminho:** Comercial & Logística → Comercialização → Contratos de Arrendamento

Gerencia arrendamentos de terra: controla parcelas, vencimentos e pagamentos.

**Abas:** Lista → Pagamentos → Próximos Vencimentos (calendário 12 meses; alerta ≤ 15 dias).

**Formas de pagamento:**
- sc_soja / sc_milho / sc_soja_milho → gera contrato de grãos (compromete produção)
- BRL → lança CP no financeiro

---

## MÓDULO 12 — COMERCIAL & LOGÍSTICA → EXPEDIÇÃO

### 12.1 Expedição de Grãos
**Caminho:** Comercial & Logística → Expedição → Expedição de Grãos

Controla a logística de saída de grãos: cargas, MDF-e, status de entrega e correção de peso no destino.

**Rotas (mutuamente exclusivas por carga):**
1. Transbordo sem NF — movimentação interna, sem documento fiscal
2. Transbordo com Remessa (CFOP 5905) — remessa para depósito de terceiro
3. Direto ao Comprador (CFOP 6101) — entrega direta ao comprador

**Pipeline de status:** rascunho → em_transito → entregue → corrigindo_peso → encerrada

**Emitir MDF-e:** Clique em "Emitir MDF-e" → UF início/fim, percurso, CIOT → status muda para "em_transito".
**Correção de peso:** divergência > 1% gera alerta "NF COMPLEMENTAR NECESSÁRIA".

### 12.2 Cargas em Trânsito
**Caminho:** Comercial & Logística → Expedição → Cargas em Trânsito

Filtro rápido da Expedição exibindo apenas cargas com status "em_transito".

### 12.3 Romaneios de Saída
**Caminho:** Comercial & Logística → Expedição → Romaneios de Saída

Relatório de todos os romaneios de saída de grãos (entregas a compradores e armazéns).

---

## MÓDULO 13 — COMERCIAL & LOGÍSTICA → FRETES E TRANSPORTE

### 13.1 Acerto de Frete (TAC)
**Caminho:** Comercial & Logística → Fretes e Transporte → Acerto de Frete (TAC)

Gerencia acertos financeiros com transportadores autônomos (TAC/ANTT).

### 13.2 CT-e — Conhecimento de Transporte
**Caminho:** Comercial & Logística → Fretes e Transporte → CT-e

Emissão de CT-e para frota própria (motoristas CLT, sem CIOT).

### 13.3 MDF-e — Manifesto de Cargas
**Caminho:** Comercial & Logística → Fretes e Transporte → MDF-e

Emissão de MDF-e com seleção de CT-e autorizados e NF-e avulsas.

### 13.4 Transportadoras / Veículos
**Caminho:** Comercial & Logística → Fretes e Transporte → Transportadoras / Veículos

Cadastro de transportadoras, veículos (tipos de caminhão) e motoristas. Alerta automático de CNH vencendo.

---

## MÓDULO 14 — COMERCIAL & LOGÍSTICA → BALANÇA

### 14.1 Pesagem Avulsa
**Caminho:** Comercial & Logística → Balança → Pesagem Avulsa

Pesagem de cargas não vinculadas à colheita nem a contrato de entrega. Ticket salvo em banco de dados, em 2 etapas.

**Tipos de pesagem:**
- **Neutra** — pesagem simples sem classificação de entrada ou saída.
- **Entrada** — caminhão chega CARREGADO: 1ª pesagem = Peso Bruto → 2ª pesagem = Tara (após descarregar). Peso líquido = Bruto − Tara.
- **Saída** — caminhão chega VAZIO: 1ª pesagem = Tara → 2ª pesagem = Peso Bruto (após carregar). Peso líquido = Bruto − Tara.

**Fluxo completo:**
1. Clique em **+ Nova Pesagem (Tara)**
2. Selecione o tipo (Entrada / Saída / Neutra)
3. Preencha: placa, motorista, produto, fornecedor/cliente e o 1º peso (conforme o tipo)
4. O ticket fica na aba **Em Andamento** aguardando a 2ª pesagem
5. Quando o caminhão terminar, clique no ticket → **⚖ Pesar Bruto** (Saída/Neutra) ou **⚖ Pesar Tara** (Entrada)
6. O peso líquido é calculado automaticamente e o ticket é finalizado

**Modos de entrada de peso (em cada campo):**
- **✏ Manual** — campo numérico digitado pelo operador.
- **🔌 Balança** — leitura automática via porta serial (Web Serial API). Requer Google Chrome ou Microsoft Edge. Protocolos suportados: Toledo Prix/Prix Fit, Filizola MK-III/PDV, Urano UR-E, RS-232 genérico. Configuração padrão: 9600 baud, 8N1.

**Atenção:** Para pesagem durante a colheita (romaneio de produção), use **Lavoura → Colheita → Colheita**.

---

## MÓDULO 15 — FINANCEIRO → ATIVIDADE RURAL (PRODUTOR)

### 15.1 Contas a Pagar
**Caminho:** Financeiro → Atividade Rural → Contas a Pagar

Gerencia despesas do produtor rural (pessoa física — CPF).

**Abas de status:** Aberto / Vencido / Vencendo / Baixado / Parcial / Barter / Previsão / Todos

**Origem automática (badge azul):** NF Entrada, Plantio (sementes), Pulverização (defensivos), Arrendamento, Pedido Compra, SIEG.

**Criação manual:** Produtor → Fazenda → Ano Safra → Ciclo → Descrição (*), Valor (*), Moeda (BRL/USD/barter), Vencimento (*), Categoria (*), OG, Centro de Custo, Vínculo de Atividade, Entidade Contábil.

**Baixa parcial:** valor pago < total → status "parcial" (badge amarelo). O saldo permanece no mesmo registro — baixe o restante clicando novamente no ícone de baixa.

**CP em dólar:** campo "Cotação (R$/US$)" não é automático — abra a CP, preencha a cotação e salve.

**Reprogramar vencimento:** Ícone 📅 na linha → nova data → a observação recebe "[Reprogramado para DD/MM/AAAA]" automaticamente.

### 15.2 Contas a Receber
**Caminho:** Financeiro → Atividade Rural → Contas a Receber

Gerencia receitas previstas e realizadas do produtor rural.

**Filtros:** aberto / vencido / vencendo / baixado / barter / previsão / todos

**Origem automática (badge azul):** NF Saída, Arrendamento, Contrato Financeiro, Plantio.

### 15.3 Adiantamentos a Fornecedores
**Caminho:** Financeiro → Atividade Rural → Adiantamentos a Fornecedores

Registra pagamentos antecipados a fornecedores antes da entrega do produto ou serviço.

### 15.4 Folha de Pagamento
**Caminho:** Financeiro → Atividade Rural → Folha de Pagamento

Gerencia folha de pagamento dos funcionários vinculados ao produtor rural (CPF).

---

## MÓDULO 16 — FINANCEIRO → EMPRESA (CNPJ)

### 16.1 Contas a Pagar — Empresa
**Caminho:** Financeiro → Empresa → Contas a Pagar — Empresa

CP da pessoa jurídica (empresa com CNPJ). Mesma funcionalidade da CP do produtor.

### 16.2 Contas a Receber — Empresa
**Caminho:** Financeiro → Empresa → Contas a Receber — Empresa

CR da pessoa jurídica.

### 16.3 Folha de Pagamento — Empresa
**Caminho:** Financeiro → Empresa → Folha de Pagamento — Empresa

Folha de pagamento dos funcionários da empresa (CNPJ).

### 16.4 Cartões de Crédito
**Caminho:** Financeiro → Empresa → Cartões de Crédito

Gerencia gastos em cartões de crédito corporativos.

---

## MÓDULO 17 — FINANCEIRO → TESOURARIA

### 17.1 Lançamento de Tesouraria
**Caminho:** Financeiro → Tesouraria → Lançamento de Tesouraria

Lançamentos avulsos não CP/CR: transferências entre contas, ajustes de saldo, taxas bancárias, aplicações e resgates.

### 17.2 Operações de Tesouraria
**Caminho:** Financeiro → Tesouraria → Operações de Tesouraria

Lista e detalhe de todas as operações de tesouraria realizadas.

### 17.3 Mútuos entre Empresas
**Caminho:** Financeiro → Tesouraria → Mútuos entre Empresas

Registra empréstimos entre empresas do grupo (PJ ↔ PJ).

### 17.4 Aplicações Financeiras
**Caminho:** Financeiro → Tesouraria → Aplicações Financeiras

Gerencia aplicações e resgates em fundos, CDBs e outros investimentos.

### 17.5 Conciliação Bancária
**Caminho:** Financeiro → Tesouraria → Conciliação Bancária

Concilia lançamentos do sistema com o extrato OFX importado do banco.

**Layout:** painel esquerdo (CP/CR em aberto) + painel direito (extrato OFX).

**Como usar:**
1. Clique em "Importar Extrato OFX" no painel direito → upload do arquivo .ofx do banco
2. O sistema tenta casar automaticamente por valor (±R$ 0,02) e data (±7 dias)
3. Confirme os vínculos automáticos ou faça vínculos manuais clicando em "Vincular"

**Borderô (um débito para vários lançamentos):** Clique em "Vincular" → selecione múltiplos lançamentos no painel esquerdo → Confirmar.

**Persistência:** o extrato OFX fica salvo no banco entre sessões. Para trocar: clique em "Remover Extrato".

---

## MÓDULO 18 — FINANCEIRO → RELATÓRIOS FINANCEIROS

### 18.1 Fluxo de Caixa Previsto
**Caminho:** Financeiro → Relatórios Financeiros → Fluxo de Caixa Previsto

Projeção de entradas e saídas baseada em lançamentos em aberto.

**Modos:** Diário (grid dia a dia) e Mensal (colunas por mês no período selecionado).
**Filtros:** produtor(es), conta(s) bancária(s), período (De/Até). Botões "Selecionar Todos Produtores" e "Selecionar Todas Contas" disponíveis para agilizar.
**Padrão:** início = hoje, fim = hoje + 12 meses.

### 18.2 Fluxo de Caixa Realizado
**Caminho:** Financeiro → Relatórios Financeiros → Fluxo de Caixa Realizado

Fluxo de caixa baseado apenas em lançamentos já baixados (realizados).

### 18.3 CP / CR — Contas
**Caminho:** Financeiro → Relatórios Financeiros → CP / CR — Contas

Relatório consolidado de CP e CR por período, categoria e conta bancária.

### 18.4 Posição Bancária
**Caminho:** Financeiro → Relatórios Financeiros → Posição Bancária

Saldo atual de cada conta bancária com histórico de movimentos.

### 18.5 Endividamento
**Caminho:** Financeiro → Relatórios Financeiros → Endividamento

Visão consolidada do endividamento total por credor, tipo e ano de vencimento das parcelas.

**Estrutura:** N1 (clicável = tipo) → N2 (expande = contratos) → N3 (expande = parcelas individuais). Colunas = um ano por coluna.
**Filtros:** produtor, status, moeda, intervalo de anos (atalhos: 12 meses / 3 anos / 5 anos / Tudo).
**Bloco Compra de Imóveis:** tabela adicional (cabeçalho marrom) aparece quando há parcelas de compra de terra cadastradas.

### 18.6 Gastos por Classificação
**Caminho:** Financeiro → Relatórios Financeiros → Gastos por Classificação

Relatório de despesas agrupadas por Operação Gerencial e categoria financeira.

---

## MÓDULO 19 — CONFIGURAÇÕES → COMPLEMENTO FINANCEIRO

### 19.1 Contratos Financeiros (Crédito Rural)
**Caminho:** Configurações → Complemento Financeiro → Contratos Financeiros

Gerencia empréstimos, financiamentos e linhas de crédito rural (PRONAF, PRONAMP, FCO, Finame, CPR, etc.).

**Add-on IA (ia_cedula):** banner "Anexe o PDF da Cédula" aparece quando habilitado. O sistema extrai automaticamente credor, tipo, valor, taxa, sistema de amortização, datas e cronograma de parcelas.

**Sistemas de amortização:** SAC (amortização constante), PRICE (parcela constante), Crescentes (com % de crescimento).

**Abas:** Principal, Liberação, Pagamento (tabela de amortização + baixas), Garantias, Centro de Custo, Aditivos, Movimentações.

### 19.2 Apoio Financeiro
**Caminho:** Configurações → Complemento Financeiro → Apoio Financeiro

Ferramenta exclusiva Raccolto para projeções e estimativas financeiras. Os lançamentos aparecem no Fluxo de Caixa com badge laranja "Apoio Financeiro" — não entram no sistema oficial.

### 19.3 Seguros / Apólices
**Caminho:** Configurações → Complemento Financeiro → Seguros / Apólices

Gerencia apólices de seguro (rural, vida, patrimonial, automóvel, máquinas). Controla prêmios e sinistros. Alerta automático de vencimento 7 dias antes.

### 19.4 Consórcios
**Caminho:** Configurações → Complemento Financeiro → Consórcios

Gerencia cotas de consórcio com cronograma de parcelas e CPs automáticas.

**Após editar dados:** use o botão **Regenerar Parcelas e CPs** para recalcular o cronograma (disponível apenas no modo edição).

---

## MÓDULO 20 — FISCAL → EMISSÃO E CONTROLE

### 20.1 Monitor NF-e Emitidas
**Caminho:** Fiscal → Emissão e Controle → Monitor NF-e Emitidas

Lista todas as NF-e emitidas pela fazenda. Status: autorizada, cancelada, denegada. Acesso ao DANFE e XML.

### 20.2 Pendências Fiscais
**Caminho:** Fiscal → Emissão e Controle → Pendências Fiscais

NF-e com pendências: rejeitadas pela SEFAZ, sem número de autorização, inutilizações pendentes.

### 20.3 GNRE
**Caminho:** Fiscal → Emissão e Controle → GNRE

Guia Nacional de Recolhimento de Tributos Estaduais para operações interestaduais (DIFAL, ST).

### 20.4 Remessas Logísticas
**Caminho:** Fiscal → Emissão e Controle → Remessas Logísticas

NF-e de remessa para armazéns e depósitos (CFOP 5905/6905).

### 20.5 Certificado Digital
**Caminho:** Fiscal → Emissão e Controle → Certificado Digital

Gerencia o certificado A1 usado para assinar NF-e. Alerta de vencimento 30/15/7/1 dia antes.

---

## MÓDULO 21 — FISCAL → OBRIGAÇÕES

### 21.1 LCDPR
**Caminho:** Fiscal → Obrigações → LCDPR

Gerador do Livro Caixa Digital do Produtor Rural — obrigação anual da Receita Federal para produtores Pessoa Física (CPF), entregue junto com a Declaração de Imposto de Renda até 30/04 do ano seguinte. Segue o leiaute oficial 1.3 (Anexo ao Ato Declaratório Executivo COPES nº 1/2020).

**Como funciona:** o sistema lê automaticamente todos os lançamentos já baixados no Financeiro com entidade contábil "PF" e vínculo de atividade "Rural" (ou em branco) no ano selecionado — não é preciso lançar nada manualmente, exceto dados históricos anteriores ao uso do sistema.

**Abas:**
- **Livro Caixa** — lista cronológica dos lançamentos do ano com saldo acumulado. A coluna "Doc." permite ajustar o tipo de documento (Nota Fiscal, Fatura, Recibo, Contrato, Folha de Pagamento, Outros) quando necessário.
- **Produtores e Participações** — configura o % de participação de cada CPF quando o imóvel é de condomínio ou parceria (mais de um titular). Ao exportar para um produtor específico, os valores são multiplicados automaticamente pela sua quota-parte.
- **Cadastro LCDPR** — cadastro dos dados que a Receita exige e que não fazem parte do dia a dia operacional: CAEPF e tipo de exploração de cada fazenda (individual, condomínio, arrendado, parceria, comodato ou outros), contas bancárias vinculadas e os dados do contador responsável (nome, CPF/CNPJ, CRC, e-mail, telefone). **Preencha esta aba antes da primeira exportação** — sem isso, esses campos saem em branco no arquivo.
- **Importação** — lança dados históricos via planilha Excel/CSV (útil para anos anteriores à adoção do sistema).
- **Exportação** — gera o arquivo .txt oficial por produtor, por ano ou por mês; também exporta em Excel para conferência antes do envio.

**Contas bancárias:** contas do tipo "espécie" (dinheiro em caixa) ou "trânsito" (sem conta bancária identificada) entram no arquivo com os códigos especiais que a própria Receita prevê para esses casos (000 e 999) — não é erro, é o comportamento correto do leiaute oficial.

**Importante:** o gerador é só leitura — não altera nenhum lançamento do Financeiro. Gerar o arquivo também não corrige declarações de anos anteriores já entregues à Receita.

**Ainda não implementado:** o registro de parceiros/condôminos (obrigatório quando a exploração do imóvel é coletiva) não é gerado automaticamente — se a fazenda tiver essa situação, é preciso complementar o arquivo manualmente antes de enviar.

### 21.2 SPED ECD — Contábil
**Caminho:** Fiscal → Obrigações → SPED ECD — Contábil

Gerador do arquivo SPED ECD (leiaute 10) para pessoas jurídicas (CNPJ). Exporta blocos 0, I e 9 compatíveis com PGE da Receita Federal.

### 21.3 eSocial Rural
**Caminho:** Fiscal → Obrigações → eSocial Rural

Geração de eventos trabalhistas rurais para o eSocial (23 eventos S-1.0).

### 21.4 IBS / CBS — 2027
**Caminho:** Fiscal → Obrigações → IBS / CBS — 2027

Preparação para a Reforma Tributária com vigência em 2027.

### 21.5 Parcerias & Grupos
**Caminho:** Fiscal → Obrigações → Parcerias & Grupos

Gerencia operações entre empresas do mesmo grupo econômico para fins fiscais.

### 21.6 Operações Fiscais
**Caminho:** Fiscal → Obrigações → Operações Fiscais

Parâmetros de CFOP padrão por tipo de operação (venda, remessa, devolução, etc.).

---

## MÓDULO 22 — RESULTADOS

### 22.1 DRE Agrícola
**Caminho:** Resultados → Resultado Econômico → DRE Agrícola

Demonstração de Resultado do Exercício por safra/ciclo.

**Blocos:** Receita Bruta → Deduções (Funrural 1,5% + SENAR 0,2%) → CPV → DGA (Despesas Gerais e Administrativas: RH/Serviços/Adm) → Despesas Financeiras.

**KPIs:** Receita Total, Custo Total, Resultado Líquido, Margem, Produtividade (sc/ha), EBITDA.

**Ponto de equilíbrio:** custo total / preço médio por saca. Folga em sc/ha exibida graficamente.

### 22.2 Margens por Safra
**Caminho:** Resultados → Resultado Econômico → Margens por Safra

Comparativo de margens entre ciclos e culturas.

### 22.3 Custos Totais
**Caminho:** Resultados → Custos → Custos Totais

Consolidação de todos os custos por safra com agrupamento por categoria.

### 22.4 Custo / ha
**Caminho:** Resultados → Custos → Custo / ha

Análise de custo por hectare por talhão e ciclo.

### 22.5 Regras de Rateio
**Caminho:** Resultados → Custos → Regras de Rateio

Define como custos comuns são rateados entre ciclos por proporção configurável.

### 22.6 Aplicações por Ciclo
**Caminho:** Resultados → Custos → Aplicações por Ciclo

Relatório consolidado de aplicações (pulverizações, adubações) por safra/ciclo. Exportação PDF, XLSX e WhatsApp.

### 22.7 Manutenção de Máquinas
**Caminho:** Resultados → Custos → Manutenção de Máquinas

Relatório de custos de manutenção por máquina e período.

### 22.8 Produtividade
**Caminho:** Resultados → Desempenho → Produtividade

Análise de produtividade real vs esperada por talhão e ciclo (sc/ha).

### 22.9 Gastos por Classificação
**Caminho:** Resultados → Desempenho → Gastos por Classificação

Despesas agrupadas por Operação Gerencial.

---

## MÓDULO 23 — CONFIGURAÇÕES → CADASTROS

### 23.1 Pessoas e Entidades
**Caminho:** Configurações → Cadastros → Pessoas e Entidades

Cadastro de compradores, fornecedores, transportadoras, arrendantes e outras entidades externas (CNPJ/CPF, IE, PIX, dados bancários, subcategoria).

### 23.2 Produtores
**Caminho:** Configurações → Cadastros → Produtores

Cadastro dos produtores rurais com CPF/CNPJ, inscrições estaduais por estado (IE), dados bancários.

**Consulta Sintegra (🔎 ao lado da IE):** na aba "Inscrições Estaduais" do produtor, tanto ao adicionar uma nova IE quanto ao editar o endereço de uma já cadastrada, existe um botão 🔎 que consulta o cadastro de contribuintes direto na SEFAZ (webservice CadConsultaCadastro4) e preenche automaticamente nome, endereço, município e código IBGE a partir da IE digitada — funciona para IEs de MT, GO, MS, SP, BA e TO; demais estados retornam aviso de "UF ainda não implementada" (adicionados sob demanda). Exige que a fazenda já tenha um certificado A1 configurado em Parâmetros → Fiscal (qualquer certificado válido serve, não precisa ser do próprio produtor consultado — a consulta de cadastro é um serviço de busca pública da SEFAZ, não uma emissão de documento).

**"Fazenda ou Empresa vinculada" na IE:** ao adicionar uma Inscrição Estadual, o campo de vínculo lista tanto as Fazendas da conta quanto as Empresas (PJ) já cadastradas para aquele produtor — uma IE pode pertencer a uma propriedade física (fazenda) ou a uma empresa do produtor, nunca as duas ao mesmo tempo. Isso importa porque telas que buscam "a IE certa" para uma operação (venda de grãos, arrendamento) filtram por esse vínculo.

### 23.3 Fazendas e Talhões
**Caminho:** Configurações → Cadastros → Fazendas e Talhões

Cadastro completo de fazendas (dados gerais, matrículas, certidões CAR/ITR/CCIR, arrendamentos) e talhões com GPS.

### 23.4 Funcionários
**Caminho:** Configurações → Cadastros → Funcionários

Cadastro de funcionários para folha de pagamento (produtor PF e empresa PJ).

### 23.5 Catálogo de Insumos
**Caminho:** Configurações → Cadastros → Catálogo de Insumos

Cadastro de sementes, fertilizantes, defensivos, corretivos e outros insumos com custo médio, estoque mínimo e unidade.

### 23.6 Itens Gerais
**Caminho:** Configurações → Cadastros → Itens Gerais

Produtos e serviços que não são insumos agrícolas (peças, ferramentas, materiais de escritório).

### 23.7 Depósitos & Armazéns
**Caminho:** Configurações → Cadastros → Depósitos & Armazéns

Cadastro de armazéns, silos, tulhas, galpões e outros depósitos físicos.

### 23.8 Contas Bancárias
**Caminho:** Configurações → Cadastros → Contas Bancárias

Cadastro das contas bancárias da fazenda para vinculação com CP/CR e conciliação OFX.

---

## MÓDULO 24 — CONFIGURAÇÕES → SISTEMA

### 24.1 Parâmetros Fiscais (NF-e)
**Caminho:** Configurações → Sistema → Parâmetros Fiscais (NF-e)

Configura ambiente (homologação/produção), série, CNPJ emitente, IE, UF, código IBGE do município, CRT, CFOPs padrão, CSTs, NCMs por commodity, caminho do certificado A1.

### 24.2 Operações Fiscais / CFOP
**Caminho:** Configurações → Sistema → Operações Fiscais / CFOP

Tabela de CFOP padrão por tipo de operação fiscal.

### 24.3 Operações Gerenciais
**Caminho:** Configurações → Sistema → Operações Gerenciais

Plano de contas gerencial — associa cada tipo de lançamento a uma conta no plano de contas.

### 24.4 Plano de Contas
**Caminho:** Configurações → Sistema → Plano de Contas

Hierarquia de contas gerenciais (grupos, subgrupos, contas analíticas).

### 24.5 Classificação Automática
**Caminho:** Configurações → Sistema → Classificação Automática

Regras automáticas para classificar NFs capturadas pelo SIEG por categoria e OG (baseadas em CNPJ, palavras-chave, CFOP).

### 24.6 Taxas de Referência
**Caminho:** Configurações → Sistema → Taxas de Referência

Parâmetros financeiros: SELIC, IGP-M, IPCA, CDI — usados em cálculos de correção monetária.

### 24.7 Contabilidade
**Caminho:** Configurações → Sistema → Contabilidade

Parâmetros contábeis por entidade (PF/PJ): método de escrituração (G/R/B), dados do livro, responsável técnico, termos de abertura/encerramento.

---

## MÓDULO 25 — CONFIGURAÇÕES → USUÁRIOS

### 25.1 Usuários e Permissões
**Caminho:** Configurações → Usuários → Usuários e Permissões

Gerencia usuários da conta: criação, e-mail, senha, permissões por módulo.

### 25.2 Auditoria
**Caminho:** Configurações → Usuários → Auditoria

Log de todas as ações realizadas por cada usuário no sistema (quem fez o quê e quando).

---

## PERGUNTAS FREQUENTES

### Como faço uma pesagem avulsa de carga?
Acesse **Comercial & Logística → Balança → Pesagem Avulsa**. Clique em "+ Nova Pesagem (Tara)", selecione o tipo (Entrada/Saída/Neutra), preencha os dados e o 1º peso. O ticket fica em "Em Andamento" para registrar a 2ª pesagem quando o caminhão voltar.

### Qual a diferença entre Pesagem Entrada e Pesagem Saída?
- **Entrada:** caminhão chega carregado. 1ª pesagem = Peso Bruto. 2ª pesagem = Tara (após descarregar). Líquido = Bruto − Tara.
- **Saída:** caminhão chega vazio. 1ª pesagem = Tara. 2ª pesagem = Peso Bruto (após carregar). Líquido = Bruto − Tara.

### Como registro a colheita de soja?
Acesse **Lavoura → Colheita → Colheita**. Crie o registro de colheita (fazenda, ciclo, talhão, área, data). Adicione um romaneio por caminhão (placa, peso bruto, tara, classificação ABIOVE). Clique em "Finalizar Colheita" ao terminar.

### Como lanço uma NF de compra de insumos?
Acesse **Compras & Estoque → Compras → NF de Produtos**. Clique em "Lançar NF de Entrada", carregue o XML (recomendado) ou preencha manualmente. Associe os itens ao catálogo de insumos e clique em "Processar NF".

### Como crio um contrato de venda de grãos?
Acesse **Comercial & Logística → Comercialização → Contratos de Grãos**. Clique em "Novo Contrato", preencha produtor, comprador, produto, quantidade, preço, natureza da operação (CFOP preenchido automaticamente) e salve.

### Onde configuro os parâmetros da NF-e?
Acesse **Configurações → Sistema → Parâmetros Fiscais (NF-e)**. Preencha ambiente, série, CNPJ emitente, IE, UF, IBGE, CRT, CFOPs e NCMs por commodity.

### Como importo o extrato OFX do banco?
Acesse **Financeiro → Tesouraria → Conciliação Bancária**. Clique em "Importar Extrato OFX" no painel direito, faça upload do arquivo .ofx e confirme os vínculos automáticos ou faça-os manualmente.

### Como vejo o fluxo de caixa futuro?
Acesse **Financeiro → Relatórios Financeiros → Fluxo de Caixa Previsto**. Padrão: hoje a +12 meses. Use os botões "Selecionar Todos Produtores" e "Selecionar Todas Contas" para agilizar.

### Como conecto uma balança física?
Na tela de **Pesagem Avulsa** (Comercial & Logística → Balança), clique no toggle "🔌 Balança" no campo de peso. Requer Google Chrome ou Microsoft Edge. Selecione a porta serial, clique "Conectar" e o peso aparece em tempo real.

### Onde cadastro compradores e fornecedores?
Acesse **Configurações → Cadastros → Pessoas e Entidades**.

### Como adiciono uma nova fazenda?
Acesse **Configurações → Cadastros → Fazendas e Talhões**. Clique em "+ Nova Fazenda".

### O que é o SIEG?
Serviço que captura automaticamente todas as NF-e emitidas contra o CNPJ/CPF da fazenda. As notas aparecem em **Compras & Estoque → Integração de Documentos → Notas Capturadas (SIEG)** para serem classificadas e processadas. Para ativar/desativar: **Compras & Estoque → Integração de Documentos → ⚡ Ligar / Desligar SIEG**.

### Como gero o arquivo do LCDPR?
Acesse **Fiscal → Obrigações → LCDPR**. Antes da primeira exportação, preencha a aba "Cadastro LCDPR" com CAEPF e tipo de exploração de cada fazenda e os dados do contador responsável. Depois vá em "Exportação", escolha o produtor e o período (ano ou mês) e clique em "Gerar e baixar".

### Por que um lançamento do LCDPR aparece com o código de conta "999"?
"999" é o código oficial da Receita Federal para "numerário em trânsito" — usado quando o lançamento não tem uma conta bancária cadastrada vinculada a ele. Não é um erro; é a forma prevista pelo próprio leiaute oficial para esses casos. Para vincular a uma conta real, cadastre-a em **Configurações → Cadastros → Contas Bancárias** e associe o lançamento a ela no Financeiro.

### O que é "vínculo de atividade"?
Campo que classifica o lançamento para fins fiscais:
- **Atividade Rural** — entra no LCDPR (produtor PF)
- **Pessoa Física** — despesa pessoal (não é rural)
- **Investimento** — CAPEX / imobilizado
- **Não tributável** — operação isenta

---

## ERROS COMUNS E SOLUÇÕES

| Erro | Causa | Solução |
|---|---|---|
| "Semente não encontrada" ao registrar plantio | Insumo não está no estoque | Lançar NF de entrada ou cadastrar em Catálogo de Insumos |
| "Estoque insuficiente" | Saldo zerado ou negativo | Verificar Posição de Estoque e lançar entrada |
| CP em USD sem conversão | Cotação não informada | Abrir a CP, informar cotação no campo e salvar |
| Fornecedor não preenchido automaticamente pelo SIEG | CNPJ não cadastrado em Pessoas | Cadastrar o fornecedor em Configurações → Cadastros → Pessoas e Entidades |
| NF não pode ser reprocessada | Proteção contra duplicação | Usar botão "Estornar" antes de reprocessar |
| Consórcio não aparece em CP | Parcelas com data passada | Ir para aba "Vencidos" em Contas a Pagar |
| Balança não conecta | Browser incompatível | Usar Google Chrome ou Microsoft Edge |
| Pedido de compra não pode ser excluído | Tem NFs de entrada vinculadas | Usar status "Cancelado" em vez de excluir |
| "Ciclo não encontrado" ao registrar operação | Ciclo não cadastrado | Cadastrar em Configurações → Cadastros → Safras e Ciclos |
| CP não aparece no Fluxo de Caixa | Produtor ou conta bancária não selecionados no filtro | Usar os botões "Selecionar Todos" nos filtros |
`;
