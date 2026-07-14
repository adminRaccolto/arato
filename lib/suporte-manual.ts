/**
 * Manual Operacional do Arato
 * Importado pelo sistema de suporte para responder perguntas de uso.
 * Gerado automaticamente — não editar manualmente.
 */

export const MANUAL_OPERACIONAL = `
# Manual Operacional — Arato

Este manual descreve como usar cada módulo do sistema Arato.
Leia a seção correspondente ao que você precisa fazer.

---

## CONCEITOS ESSENCIAIS

**Saca (sc):** 60 kg. Unidade padrão para soja, milho e trigo.
**Arroba (@):** 15 kg. Unidade padrão para algodão e boi.
**Ciclo:** É a "safra operacional" — soja 2025/2026, milho 2ª 2025/2026, etc. Toda operação (plantio, pulverização, colheita) é vinculada a um ciclo. A tabela "Safras" está vazia no sistema — use sempre "Ciclos".
**CP:** Conta a Pagar. **CR:** Conta a Receber.
**Talhão:** Subdivisão da fazenda. Unidade básica de plantio.
**OG (Operação Gerencial):** Classificação contábil de uma transação — vincula o lançamento ao plano de contas.
**CFOP:** Código fiscal obrigatório na NF-e que descreve a natureza da operação (ex: 6101 = venda de produção para outro estado).
**NCM:** Código de classificação do produto (ex: 1201.10.00 = soja em grão).
**DANFE:** Documento impresso que acompanha a NF-e no transporte.
**Romaneio:** Documento de pesagem de caminhão (peso bruto, tara, peso líquido).
**Barter:** Troca de insumos por grãos. Aparece como modalidade de pagamento em CP.
**LCDPR:** Livro Caixa Digital do Produtor Rural — obrigação da Receita Federal para PF.
**SIEG:** Serviço externo que importa automaticamente NF-e e NFS-e recebidas pela fazenda.
**MDF-e:** Manifesto Eletrônico de Documentos Fiscais — obrigatório no transporte de carga.
**CT-e:** Conhecimento de Transporte Eletrônico.

**Cor azul no sistema** = ação automática (o sistema fez).
**Cor mostarda no sistema** = ação manual (o usuário fez).

---

## MÓDULO 1 — DASHBOARD

**Caminho:** Menu inicial (tela que abre ao fazer login)

### O que faz
Mostra um resumo geral da fazenda: alertas de vencimento, resumo financeiro da semana, preços de mercado ao vivo e acesso rápido a ações pendentes.

### Painéis disponíveis

**Preços de mercado (atualização automática a cada 5 minutos):**
- Soja CBOT em US$/sc e R$/sc
- Milho CBOT em US$/sc e R$/sc
- Algodão ICE em ¢/lb e R$/@
- Dólar (USD/BRL)
- Indicadores de mercado aberto/fechado

**Alertas de vencimento:**
- Crítico (vermelho): vencendo hoje ou vencido
- Alto (laranja): vencendo em até 3 dias
- Médio (azul): vencendo em até 7 dias
- Tipos de alerta: Conta a Pagar, Conta a Receber, Arrendamento, Certificado A1, Contrato de Grãos, Estoque Mínimo, Seguro

**Resumo financeiro da semana:**
- CP em aberto total
- CR em aberto total
- CP vencendo esta semana
- CR vencendo esta semana

**Busca global:** Campo de busca no topo que encontra lançamentos, contratos, ciclos, insumos e pessoas em toda a fazenda.

### O que é automático
- Preços de mercado: atualizados automaticamente via API pública (CBOT, Yahoo Finance, AwesomeAPI)
- Alertas: calculados automaticamente com base nas datas de vencimento dos lançamentos

---

## MÓDULO 2 — PROPRIEDADES (Fazendas e Talhões)

**Caminho:** Menu superior → **Propriedades**

### O que faz
Exibe um mapa resumido de todas as fazendas e seus talhões. É uma tela de leitura — o cadastro é feito em Cadastros.

### Informações exibidas
- Número de fazendas ativas
- Área total em hectares (ha)
- Número de talhões
- Quantidade de talhões com GPS cadastrado
- Alerta se a soma da área dos talhões for menor que a área total da fazenda (hectares sem talhão definido)

### Ações disponíveis
- **+ Nova Fazenda** → leva para **Cadastros → Fazendas**
- **Editar fazenda** → leva para **Cadastros → Fazendas**
- **+ Novo Talhão** → leva para **Cadastros → Fazendas**

### Pré-requisito
Para aparecer dados aqui, é necessário cadastrar fazenda e talhões em **Cadastros → Fazendas**.

---

## MÓDULO 3 — LAVOURA / PLANEJAMENTO AGRÍCOLA

**Caminho:** Menu superior → **Lavoura** → **Planejamento Agrícola**

### O que faz
Mostra todos os ciclos (safras operacionais) da fazenda, permite criar novos ciclos e acompanhar o andamento das operações.

### Abas disponíveis
1. **Ciclos** — lista e gerencia os ciclos
2. **Análise** — análise de produtividade e custos por ciclo

### Ciclos — conceito
Um ciclo representa uma cultura plantada em uma safra. Exemplo: "Soja 2025/2026" ou "Milho 2ª 2025/2026".

**Culturas disponíveis:** Soja, Milho 1ª, Milho 2ª (Safrinha), Algodão, Trigo, Sorgo

**Status do ciclo:**
- planejada: ciclo criado, sem operações concluídas
- em_andamento: pelo menos uma operação concluída
- colhida: colheita registrada
- cancelada: ciclo cancelado

### Como criar um ciclo
1. Clique em **+ Novo Ciclo**
2. Preencha: Ano Safra (*), Cultura (*), Descrição (*), Área total prevista (ha), Produtividade esperada (sc/ha), Preço esperado (R$/sc ou US$/sc)
3. Clique em Salvar

**Pré-requisito:** Ter o Ano Safra cadastrado em **Cadastros → Safras & Ciclos**.

### Ações sobre um ciclo
- **+ Lançar Operação** — abre modal para registrar uma operação manualmente (data, tipo, área, custo/ha)
- **Concluir Operação** — marca operação como realizada; o ciclo passa automaticamente para "em_andamento"
- **Registrar Colheita** — informa produtividade real (sc/ha) e data de colheita; ciclo passa para "colhida"

### O que é automático
- Ao concluir uma operação, o status do ciclo muda automaticamente
- Ao registrar a colheita, o ciclo fecha automaticamente

---

## MÓDULO 4 — LAVOURA / PLANTIO

**Caminho:** Menu superior → **Lavoura** → **Plantio**

### O que faz
Registra o plantio de cada talhão dentro de um ciclo. Gera baixa automática no estoque de sementes e lança a Conta a Pagar de sementes.

### Seletor em cascata (obrigatório preencher em ordem)
Produtor (*) → Fazenda (*) → Ano Safra (*) → Ciclo (*) → Talhão (*)

### Campos do plantio
- **Área plantada (ha)** (*) — área efetiva do talhão plantado
- **Data de plantio** (*) — data real do plantio
- **Semente usada** — seleciona do estoque de insumos (tipo Semente)
- **Variedade** — nome da cultivar (ex: M5917IPRO)
- **Dose (kg/ha)** — dose de semente por hectare
- **Data prevista de colheita** — estimativa
- **Produtividade esperada (sc/ha)** — meta de produtividade
- **Preço esperado (R$/sc)** — preço de venda esperado para projeções
- **Observação**

### Cálculos automáticos
- Quantidade total de semente = dose (kg/ha) × área (ha)
- Custo de sementes = quantidade × custo médio do estoque

### O que é automático ao salvar
1. Baixa automática do estoque de sementes (quantidade calculada)
2. Lançamento de Conta a Pagar "Custo de Sementes" vinculado ao ciclo

### Estatísticas exibidas
- Talhões plantados no ciclo
- Área total plantada no ciclo
- Receita esperada total (área × produtividade esperada × preço esperado)

### Erros comuns
- **"Semente não encontrada no estoque"** — cadastre o insumo em **Estoque → NF Entrada** ou **Cadastros → Insumos**
- **"Estoque insuficiente"** — verifique o saldo em **Estoque → Posição**

---

## MÓDULO 5 — LAVOURA / PULVERIZAÇÃO

**Caminho:** Menu superior → **Lavoura** → **Pulverização**

### O que faz
Registra aplicações de defensivos, fertilizantes foliares e outros produtos em talhões. Gera baixa automática no estoque e lança CP de defensivos.

### Seletor em cascata (obrigatório preencher em ordem)
Produtor (*) → Fazenda (*) → Ano Safra (*) → Ciclo (*) → Talhão (*)

### Campos principais
- **Tipo de operação** (*): herbicida, fungicida, inseticida, nematicida, acaricida, fertilizante_foliar, regulador, dessecação, outros
- **Momento de aplicação:** pré-emergência, pós-emergência, dessecação
- **Estádio fenológico:** VE, V1... V6, R1... R8, Pós-emergência, Pré-emergência
- **Data da aplicação** (*)
- **Área aplicada (ha)** (*)
- **Capacidade do tanque (L)** — volume do tanque do pulverizador
- **Vazão (L/ha)** — volume de calda por hectare
- **Número de tanques** — calculado automaticamente: total de calda / capacidade do tanque

### Grid de produtos (pode adicionar múltiplos)
- Produto (select do estoque) — dose por hectare — unidade

### O que é automático ao salvar
1. Baixa automática de cada produto no estoque (dose × área)
2. Lançamento de CP "Defensivos Agrícolas" com o custo total

### Erros comuns
- **Produto não aparece no select** — insumo não cadastrado ou sem estoque; use **Estoque → NF Entrada**

---

## MÓDULO 6 — LAVOURA / COLHEITA PRÓPRIA

**Caminho:** Menu superior → **Lavoura** → **Colheita Própria**

### O que faz
Registra os romaneios de colheita (pesagem de cada caminhão) e calcula o peso classificado descontando umidade, impureza e avariados conforme padrões ABIOVE.

### Processo em 2 etapas

**Etapa 1 — Criar registro de colheita:**
1. Selecione Fazenda, Ciclo, Talhão
2. Informe: área colhida (ha), data
3. Salve o registro

**Etapa 2 — Adicionar romaneios (um por caminhão):**
1. Clique em **+ Romaneio**
2. Preencha: número do romaneio, placa do caminhão (*), peso bruto (kg) (*), tara (kg)
3. Informe os parâmetros de classificação:
   - **Umidade (%)** — padrão: soja 14%, milho 14,5%, algodão 12%
   - **Impureza (%)** — padrão: soja 1%, milho 1%, algodão 1,5%
   - **Avariados (%)** — calculado como soma dos sub-parâmetros: ardidos, mofados, fermentados, germinados, esverdeados, quebrados, carunchados
4. O sistema calcula automaticamente os descontos e o peso classificado final

### Fórmulas de classificação (exibidas ao vivo)
- Peso líquido = peso bruto - tara
- Desconto umidade = PL × (U - U_padrão) / (100 - U_padrão)
- Desconto impureza = PL × excesso / 100
- Desconto avariados = PL × excesso / 100
- Peso classificado = PL - desconto umidade - desconto impureza - desconto avariados
- Sacas líquidas = peso classificado / 60

### Finalizar Colheita
Após adicionar todos os romaneios, clique em **Finalizar Colheita**. O sistema:
1. Calcula o total de sacas líquidas
2. Registra entrada automática no estoque (grão colhido)
3. Atualiza a produtividade real do ciclo (sc/ha)

---

## MÓDULO 7 — LAVOURA / ADUBAÇÃO DE BASE

**Caminho:** Menu superior → **Lavoura** → **Adubação de Base**

### O que faz
Registra aplicações de fertilizantes sólidos antes ou durante o plantio. Gera baixa de estoque e CP de fertilizantes.

### Campos principais
- Seletor em cascata: Produtor → Fazenda → Ano Safra → Ciclo → Talhão
- Tipo: sólido, líquido
- Fórmula NPK (ex: 0-20-20)
- Produto (select do estoque), dose (kg/ha ou L/ha), área (ha)
- Data da aplicação

---

## MÓDULO 8 — LAVOURA / CORREÇÃO DE SOLO

**Caminho:** Menu superior → **Lavoura** → **Correção de Solo**

### O que faz
Registra aplicações de calcário, gesso e outros corretivos de solo. Similar à adubação de base.

### Campos principais
- Seletor em cascata: Produtor → Fazenda → Ano Safra → Ciclo → Talhão
- Produto corretivo (calcário, gesso, etc.), dose (ton/ha), área (ha)
- Data da aplicação

---

## MÓDULO 9 — LAVOURA / RELATÓRIO DE APLICAÇÕES

**Caminho:** Menu superior → **Lavoura** → **Relatórios** → **Aplicações por Ciclo**

### O que faz
Relatório consolidado de todas as aplicações (pulverizações, adubações) por safra/ciclo, com exportação para PDF, XLSX e WhatsApp.

### Filtros disponíveis
- Ano Safra, Ciclos (múltiplos), Talhões (múltiplos)
- Tipos de operação (herbicida, fungicida, etc.)
- Período (data início / data fim)
- Produto específico
- Agrupamento: detalhado / por insumo / por grupo+subgrupo / por talhão / por tipo de operação

### Cards de resumo
- Total de aplicações no período
- Área total aplicada (ha)
- Custo total das aplicações
- Custo médio por hectare

### Exportação
- **PDF** — layout A4 paisagem com logo, cabeçalho, tabela, rodapé. Use o botão **Imprimir PDF**.
- **XLSX** — planilha com 2 abas (Resumo e Dados detalhados). Gerado via SheetJS.
- **WhatsApp** — gera XLSX, faz upload para o Supabase Storage e abre link wa.me com mensagem pré-formatada.

---

## MÓDULO 10 — CONTRATOS DE GRÃOS (Comercialização)

**Caminho:** Menu superior → **Comercial** → **Contratos de Grãos**

### O que faz
Gestão de contratos de venda de grãos (soja, milho, algodão, etc.) com compradores. Controla volumes contratados, entregues e saldo disponível.

### Abas da lista
- **Contratos** — lista de contratos com filtros por status, produto, safra
- **Expedição** — romaneios e embarques vinculados
- **Posição** — balanço geral: quanto está contratado, entregue e disponível por produto

### Status do contrato
- aberto: nenhuma entrega ainda
- parcial: parte entregue
- encerrado: entrega completa
- cancelado: contrato cancelado

### Produtos disponíveis
Soja, Milho 1ª, Milho 2ª (Safrinha), Algodão, Sorgo, Trigo, Feijão

### Como criar um contrato

**Aba Principal:**
- **Nº Lançamento** (auto-gerado), **Nº Contrato** (*), **Safra** (*)
- **Autorização** — código de autorização do comprador
- **Tipo** — Normal, À Fixar, Venda a Ordem
- Flags: Confirmado, À Fixar, Venda a Ordem
- **Produtor** (*), **Cliente/Comprador** (*), Nº Contrato Cliente
- **Modalidade de Preço** — fixo, a fixar, basis, prêmio
- **Natureza da Operação** (*) — com CFOP preenchido automaticamente:
  - VFE-PF (Venda p/ Fora do Estado - Produtor Físico) → CFOP 6501 (soja/milho via trading)
  - VPE-PF → CFOP 6101 (algodão e outros)
  - Remessa p/ Depósito → CFOP 5905
  - Devolução → CFOP 5201/6201
- **Produto** (*), **Quantidade (sc ou @)** (*), **Preço** (*), **Moeda** (BRL ou USD)
- **Frete** — CIF, FOB, por conta terceiros, próprio, sem frete

**Aba Adicionais:**
- Propriedade (fazenda de origem), Empreendimento (ciclo)
- Seguradora, Corretora
- Depósito de Carregamento, Depósito Fiscal
- Observações públicas e internas

### Romaneio de entrega
1. No contrato, clique em **+ Romaneio**
2. Preencha: número, data, placa, peso bruto (kg) (*), tara (kg)
3. Classificação por commodity:
   - **Soja (ABIOVE):** umidade, impureza, avariados (ardidos, mofados, fermentados, germinados, esverdeados, quebrados, carunchados)
   - **Milho (IN MAPA 60/2011):** umidade, impureza, avariados, chochos, ardidos, fermentados
4. Peso balança de origem vs peso destino — sistema calcula divergência em kg e %
5. Se divergência > tolerância configurada: alerta de NF Complementar

### Encerramento em lote
Selecione vários contratos e clique em **Encerrar Selecionados** para finalizar em massa por safra.

### O que é automático
- CFOP preenchido automaticamente ao escolher Natureza da Operação
- Saldo do contrato atualizado automaticamente a cada romaneio
- Status mudado para "parcial" ou "encerrado" conforme entrega acumulada

---

## MÓDULO 11 — EXPEDIÇÃO DE GRÃOS

**Caminho:** Menu superior → **Comercial** → **Expedição de Grãos**

### O que faz
Controla a logística de saída de grãos: criação de cargas, emissão de MDF-e, acompanhamento de status de entrega e correção de peso no destino.

### Rotas de expedição (mutuamente exclusivas por carga)
1. **Transbordo sem NF** — movimentação interna entre armazéns, sem documento fiscal
2. **Transbordo com Remessa (CFOP 5905)** — remessa para depósito de terceiro
3. **Direto ao Comprador (CFOP 6101)** — entrega direta ao comprador final

### Pipeline de status de uma carga
rascunho → em_transito → entregue → corrigindo_peso → encerrada

### Como criar uma carga
1. Clique em **+ Nova Carga**
2. Informe: contrato, produto, rota, destino, transportadora, veículo, motorista
3. Pesos: peso bruto (kg), tara (kg), peso líquido; ou informar peso aproximado
4. Salve como rascunho

### Emitir MDF-e
1. Na carga, clique em **Emitir MDF-e**
2. Preencha: UF início, UF fim, percurso, CIOT (se aplicável)
3. Confirme → status muda para "em_transito" automaticamente

### Gerar NF-e
- Clique em **Gerar NF-e** na carga (disponível conforme rota)
- CFOP preenchido automaticamente: 5905 (remessa) ou 6101 (venda)

### Correção de peso no destino
1. Carga chega ao comprador com peso diferente
2. Clique em **Corrigir Peso**
3. Informe o peso líquido medido no destino
4. Sistema calcula divergência automaticamente
5. Se divergência > 1% (ou tolerância configurada): nota de alerta "NF COMPLEMENTAR NECESSÁRIA"

---

## MÓDULO 12 — CONTRATOS DE ARRENDAMENTO

**Caminho:** Menu superior → **Comercial** → **Contratos de Arrendamento**

### O que faz
Gerencia contratos de arrendamento de terra: controla parcelas a pagar, gera vencimentos automáticos e alerta com 15 dias de antecedência.

### Abas disponíveis
- **Lista** — todos os arrendamentos com cards expansíveis e tabela de pagamentos inline
- **Pagamentos** — filtro por ano safra e status, baixa individual
- **Próximos Vencimentos** — calendário de 12 meses; parcelas urgentes (≤15 dias) destacadas

### Formas de pagamento
- **sc_soja** — X sacas de soja (gera compromisso de entrega de grãos)
- **sc_milho** — X sacas de milho
- **sc_soja_milho** — mistura de soja e milho
- **brl** — valor em reais (gera CP no fluxo de caixa)

**Lógica de negócio:**
- Pagamento em sacas → gera contrato de grãos automaticamente (compromete volume de produção)
- Pagamento em BRL → lança Conta a Pagar no fluxo de caixa

### Como registrar um pagamento
1. Na aba Pagamentos, localize a parcela
2. Clique em **Baixar**
3. Confirme data e valor pago
4. Status muda para "pago"

### O que é automático
- Geração de parcelas anuais ao criar o arrendamento (função gerarParcelas)
- Alerta de vencimento 15 dias antes
- Lançamento de CP ao criar parcelas em BRL

---

## MÓDULO 13 — FLUXO DE CAIXA

**Caminho:** Menu superior → **Financeiro** → **Fluxo de Caixa**

### O que faz
Visão consolidada de todas as entradas e saídas de dinheiro da fazenda, com projeção futura e filtros por período, conta bancária e moeda.

### Abas disponíveis
- **Lançamentos** — lista de todos os lançamentos com filtros
- **Fluxo** — análise do fluxo de caixa com sub-abas:
  - Horizontal: saldo acumulado semana a semana
  - Vertical: composição de receitas e despesas por categoria
  - Realizado vs Projetado: comparativo do que foi pago vs previsto
- **Conciliação** — importação de extrato OFX para conciliar com lançamentos

### Filtros na aba Lançamentos
- Todos / A Receber / A Pagar / Vencidos / Baixados / Barter
- Período: padrão 12 meses passados a 10 meses futuros
- Conta bancária
- Moeda (BRL / USD / Barter)
- Busca por descrição

### Moedas suportadas
- BRL (reais)
- USD (dólares — convertidos para BRL pela cotação informada ou padrão)
- Barter (sacas de soja/milho — exibido em sc)

### Conciliação OFX
1. Clique em **Importar Extrato OFX**
2. Faça upload do arquivo .ofx baixado do banco
3. O sistema identifica automaticamente lançamentos correspondentes
4. Confirme os vínculos ou crie lançamentos manualmente para os não reconhecidos

### Simulações
Clique em **+ Simulação** para criar um lançamento hipotético e ver o impacto no fluxo sem salvar como real.

---

## MÓDULO 14 — CONTAS A RECEBER

**Caminho:** Menu superior → **Financeiro** → **Contas a Receber**

### O que faz
Gerencia todas as receitas previstas e realizadas: vendas de grãos, prestação de serviços, captações, etc.

### Filtros de status
- aberto, vencido, vencendo (próx. 7 dias), baixado, barter, previsão, todos

### Como criar uma CR
1. Clique em **+ Nova CR**
2. Preencha (seletor em cascata): Produtor → Fazenda → Ano Safra → Ciclo (opcional) → Talhão (opcional)
3. Campos obrigatórios:
   - **Descrição** (*) — ex: "Venda de Soja Contrato 001"
   - **Valor** (*) e **Moeda** (BRL / USD / barter)
   - **Data de vencimento** (*)
   - **Categoria** — Venda de grãos, Prestação de serviços, Arrendamento recebido, Captação de Custeio, etc.
4. Campos opcionais: Forma de recebimento, Conta bancária, OG (Operação Gerencial), Centro de Custo, Observação, Produtor, Vínculo de Atividade (rural/PF/investimento)

### Como dar baixa (registrar recebimento)
1. Localize o lançamento na lista
2. Clique em **Baixar**
3. Informe a data de recebimento real
4. Confirme

### Parcelamento
1. No modal de criação, marque **Parcelado**
2. Informe número de parcelas e periodicidade
3. O sistema gera todas as parcelas automaticamente com datas calculadas

### Baixa em lote (borderô)
1. Selecione múltiplos lançamentos
2. Clique em **Baixar Selecionados**
3. Informe a data de recebimento

### Origens automáticas (badge azul)
- **NF Saída** — CR gerada automaticamente ao emitir NF-e de venda
- **Arrendamento** — CR gerada pelo módulo de arrendamento
- **Contrato Financeiro** — captação de crédito
- **Plantio** — vinculado a operação de lavoura

---

## MÓDULO 15 — CONTAS A PAGAR

**Caminho:** Menu superior → **Financeiro** → **Contas a Pagar**

### O que faz
Gerencia todas as despesas da fazenda: insumos, combustível, frete, arrendamento, manutenção, impostos, parcelas de financiamento, etc.

### Filtros de status
- aberto, vencido, vencendo (próx. 7 dias), baixado, barter, previsão, todos

### Categorias de CP
- **Insumos:** Sementes, Fertilizantes, Defensivos Agrícolas, Inoculante, Adjuvante, Herbicida, Fungicida, Inseticida, Nematicida, Outros Insumos
- **Combustível e Lubrificantes**
- **Serviços Agrícolas** (empreitadas)
- **Fretes**
- **Arrendamento de Terra**
- **Manutenção e Reparos**
- **Impostos e Taxas** (ITR, INCRA, etc.)
- **Juros e Encargos Financeiros**
- **Pagamentos:** Custeio, Investimento, Empréstimo
- **Seguro** (prêmio de apólice)
- **Consórcio**
- **Administração e Gestão**
- **Outros**

### Como criar uma CP
1. Clique em **+ Nova CP**
2. Seletor em cascata: Produtor → Fazenda → Ano Safra → Ciclo → Talhão (conforme necessário)
3. **Aba Principal** (*):
   - Descrição (*), Valor (*), Moeda (BRL / USD / barter), Vencimento (*), Categoria (*)
   - LCDPR: tipo de documento para o Livro Caixa Digital
4. **Aba Adicionais:**
   - Forma de pagamento, Conta de pagamento (banco), OG, Centro de Custo
   - Produtor, Ciclo, Talhão (vínculos para rateio)
   - Natureza: real ou previsão
   - Encargos: juros (%), multa (%), desconto (%)
   - Meses diferido (diferimento de ICMS)
   - Observação
5. Salvar

### Parcelamento
Marque **Parcelado**, informe número de parcelas e data da primeira. O sistema gera todas as parcelas.

### Baixa em lote (borderô de pagamentos)
1. Filtre por fornecedor ou período
2. Selecione os lançamentos
3. Clique em **Borderô** → informe data de pagamento e conta debitada

### Reclassificar
CP já criada pode ter a categoria/OG alterada sem tocar nos lançamentos contábeis. Use **Reclassificar**.

### Origens automáticas (badge azul)
- **NF Entrada** — CP gerada ao processar uma NF de compra no módulo de Estoque
- **Plantio** — "Custo de Sementes" gerado pelo módulo de Plantio
- **Pulverização** — "Defensivos Agrícolas" gerado pelo módulo de Pulverização
- **Arrendamento** — CP gerada pelo módulo de arrendamento (quando em BRL)
- **Pedido Compra** — ao aprovar um pedido de compra
- **SIEG** — CP gerada automaticamente pela importação automática de NF-e

---

## MÓDULO 16 — CONTRATOS FINANCEIROS (Crédito Rural)

**Caminho:** Menu superior → **Financeiro** → **Contratos Financeiros**

### O que faz
Gerencia empréstimos, financiamentos e linhas de crédito rural (PRONAF, PRONAMP, FCO, Finame, CPR, etc.), com cálculo automático de amortização (SAC, PRICE ou parcelas crescentes).

### Tipos de contrato
- Custeio, Investimento, Securitização, CPR (Cédula de Produto Rural), EGF, Outros

### Linhas de crédito disponíveis
PRONAF, PRONAMP, FCO Rural, FNO Rural, FNE Rural, BNDES/ABC, BNDES Finame, PCA (Armazéns), Custeio Livre, Custeio SNCR, CPR Física, CPR Financeira, EGF, Crédito Rural Outros, Financiamento Livre, Outros

### Como criar um contrato financeiro

**Aba Principal:**
- Fazenda (*), Descrição (*), Credor (banco/agência) (*), Tipo (*), Linha de Crédito
- Valor Financiado (*), Moeda, Data do Contrato (*), Número do Documento
- Taxa de Juros aa (%) → convertida automaticamente para am (%)
- IOF (%), TAC, Outros Custos
- Conta de Liberação (banco onde entra o dinheiro), Conta de Pagamento

**Configuração de Amortização:**
- **Tipo de Cálculo:** SAC (amortização constante), PRICE (parcela constante), Crescentes (parcelas crescentes com % de crescimento)
- Número de Parcelas, Periodicidade (mensal, trimestral, semestral, anual)
- Carência (meses): tipo "só juros" ou "total" (capitaliza o principal)
- Data da Primeira Parcela
- Botão **Gerar Parcelas** → sistema calcula toda a tabela Price/SAC automaticamente

**Aba Liberação:**
- Parcelas de liberação (quando o dinheiro é liberado em etapas)

**Aba Pagamento:**
- Tabela de amortização gerada automaticamente (editável)
- Baixa individual de parcelas

**Aba Garantias:**
- Tipo de garantia: Alienação Fiduciária, Hipoteca, Penhor Rural, Aval, Nota Promissória, CPR como Garantia, Cessão de Recebíveis, Outros
- Tipo de bem: Imóvel Rural, Imóvel Urbano, Máquina/Veículo, Semovente, Produto Agrícola, Outro
- Grau: 1°, 2°, 3°
- Valor de Avaliação

**Aba Centro de Custo:**
Rateio entre fazendas/ciclos com percentual por linha

**Aba Aditivos:**
Registro de aditivos contratuais (prorrogação, novação, etc.)

**Aba Movimentações:**
Histórico de todas as baixas realizadas

### Importação em lote
Clique em **Importar Contratos** para subir um arquivo padronizado com múltiplos contratos e suas tabelas de amortização.

---

## MÓDULO 17 — TESOURARIA

**Caminho:** Menu superior → **Financeiro** → **Tesouraria**

### O que faz
Lançamentos avulsos que não são CP ou CR tradicionais: transferências entre contas, mútuo entre empresas, ajustes de saldo, taxas bancárias, aplicações e resgates financeiros.

### Tipos de operação
- Mútuo entre Empresas — empréstimo entre PJ do grupo
- Seguros — pagamento de prêmios
- Consórcio — parcelas de consórcio
- Ajuste de Saldo — correção de saldo de conta bancária
- Transferência entre Contas — movimentação interna
- Taxa Bancária — tarifas e tarifas bancárias
- Aplicação Financeira — saída para investimento
- Resgate de Aplicação — retorno de investimento
- Outros

### Como lançar
1. Clique em **+ Lançamento Tesouraria**
2. Selecione o tipo de operação
3. Informe: conta de origem, conta de destino (se aplicável), valor, data, descrição
4. Para ajuste de saldo: informe saldo atual e saldo correto (sistema calcula diferença)
5. Salve

---

## MÓDULO 18 — SEGUROS

**Caminho:** Menu superior → **Financeiro** → **Seguros**

### O que faz
Gerencia apólices de seguro da fazenda: rural, vida, patrimonial, automóvel, responsabilidade civil, máquinas e outros. Controla prêmios e sinistros.

### Ramos de seguro disponíveis
rural, vida, patrimonial, automóvel, responsabilidade civil, máquinas, outro

### Como cadastrar uma apólice
1. Clique em **+ Nova Apólice**
2. Preencha:
   - Número da Apólice (*), Seguradora (*), Ramo (*), Objeto Segurado (*)
   - Importância Segurada (*) — valor máximo de cobertura
   - Prêmio Anual (*), Forma de Pagamento do Prêmio
   - Vigência: Data Início (*), Data Fim (*)
   - Corretora, Contato do Corretor, Observação
3. Salve

### Prêmios
Após criar a apólice, o sistema gera automaticamente as parcelas de prêmio conforme a forma de pagamento. Registre cada pagamento clicando em **Pagar**.

### Sinistros
Na apólice, clique em **+ Sinistro**. Informe: data da ocorrência, descrição, valor reclamado, número de protocolo. Acompanhe o status: aberto → em_análise → pago / negado.

### Alertas
- O sistema alerta automaticamente quando uma apólice está vencendo (7 dias antes)
- Apólices vencidas aparecem com status "vencida" em vermelho

---

## MÓDULO 19 — CONSÓRCIOS

**Caminho:** Menu superior → **Financeiro** → **Consórcios**

### O que faz
Gerencia cotas de consórcio de máquinas, imóveis e outros bens. Controla parcelas mensais, contemplação e migração para financiamento.

### Como cadastrar um consórcio
1. Clique em **+ Novo Consórcio**
2. Preencha: administradora, bem objeto, valor do crédito, número de parcelas, valor da parcela, data de início
3. Salve

### Contemplação
Quando a cota for contemplada, clique em **Registrar Contemplação**.
- Informe: data, tipo (sorteio ou lance), valor da carta de crédito
- O sistema migra automaticamente para "Consórcio Contemplado" e pode gerar um contrato financeiro equivalente

---

## MÓDULO 20 — ENDIVIDAMENTO

**Caminho:** Menu superior → **Financeiro** → **Endividamento**

### O que faz
Visão consolidada do endividamento total da fazenda por credor, tipo e ano de vencimento das parcelas. Permite análise de concentração de dívida no tempo.

### Filtros
- Produtor, Status (ativo/quitado/cancelado), Moeda
- Intervalo de anos (ex: 2025 a 2030)
- Atalhos: Próx. 12 meses / 3 anos / 5 anos / Tudo
- Mostrar apenas parcelas em aberto (padrão) ou todas

### Estrutura da tabela
- Linha N1 (clicável): totais por tipo (Custeio, Investimento, Compra de Terra, Consórcio, etc.)
- Linha N2 (expande ao clicar N1): contratos individuais do tipo
- Linha N3 (expande ao clicar N2): parcelas individuais do contrato
- Colunas: um ano por coluna, com valores de amortização + juros
- Coluna atual destacada em azul; anos futuros em cinza com label "proj."

### Tipos de endividamento
Custeio, Investimento, Securitização, CPR, EGF, Compra de Terra, Compra de Imóvel, Consórcio Contemplado, Consórcio Não Contemplado, Outros

### Impressão
Botão **Imprimir** gera PDF multi-página com tabela completa.

---

## MÓDULO 21 — ESTOQUE

**Caminho:** Menu superior → **Compras & Estoque** → **Estoque**

### O que faz
Controla o estoque de insumos (sementes, fertilizantes, defensivos, combustível), equipamentos e grãos. Registra entradas por NF e baixas automáticas pelas operações de campo.

### Abas disponíveis
1. **Posição** — saldo atual por produto com filtros e valor total
2. **NF Entrada** — lançamento de notas fiscais de compra de insumos
3. **Terceiros** — estoque em armazém de terceiros (por fornecedor/depositário)
4. **Movimentações** — histórico completo de entradas e saídas com filtros
5. **Relatórios** — sub-aba Kardex (rastreamento produto a produto)

### Aba Posição
- Filtrar por categoria: Sementes, Fertilizantes, Defensivos, Combustível, Grãos, Outros
- Busca por nome do produto
- Badge vermelho: produto abaixo do estoque mínimo
- Valor total em estoque (custo médio × saldo)

### Aba NF Entrada — como lançar uma nota fiscal de compra

**Modo XML (recomendado):**
1. Clique em **Lançar NF de Entrada**
2. Clique em **Carregar XML**
3. Selecione o arquivo .xml da NF-e
4. O sistema preenche automaticamente: fornecedor, CNPJ, número da NF, data, valor total
5. Na etapa 2, verifique o vínculo de cada item da NF com o produto no estoque:
   - O sistema tenta associar automaticamente por nome similar
   - Corrija manualmente se necessário
6. Para cada item, informe o tipo de alocação:
   - **Estoque** — entra no estoque para uso posterior
   - **VEF (remessa)** — CFOP 1922/2922 — estoque em fazenda de terceiro
   - **Remessa** — CFOP 1116/1117 — remessa para depósito
7. Clique em **Processar NF**

**Modo Manual:**
1. Clique em **Lançar NF de Entrada**
2. Preencha manualmente: fornecedor, CNPJ, número, série, data, valor
3. Na etapa 2, adicione os itens manualmente (produto, quantidade, valor unitário)
4. Clique em **Processar NF**

**O que é automático ao processar a NF:**
1. Entrada no estoque pelo custo médio ponderado
2. Lançamento de CP vinculado à nota
3. Atualização do custo médio do produto

**Alerta de preço:** se o valor unitário da NF for 10% maior que o custo médio atual, o sistema exibe alerta antes de confirmar.

---

## MÓDULO 22 — PEDIDOS DE COMPRA

**Caminho:** Menu superior → **Compras & Estoque** → **Pedidos de Compra**

### O que faz
Controla o processo de compra de insumos: da criação do pedido (rascunho) até a confirmação de entrega, gerando automaticamente a NF de entrada ao receber.

### Status do pedido
rascunho → aprovado → parcialmente_entregue → entregue / cancelado

### Como criar um pedido

**Aba Principal:**
- Fazenda (*), Data (*), Fornecedor (*), Tipo (produto / serviço / ambos)
- Fiscal: emite NF? Sim/Não
- Cotação da moeda (para pedidos em USD), Possui Ordem de Compra, Entrega única ou fracionada

**Aba Itens / Serviços / CC:**
- Adicione itens com: produto/insumo (*), quantidade (*), unidade, preço unitário, total
- Serviços: descrição, valor
- CC: rateio por Centro de Custo

**Aba Desconto:**
- Antecipação: juros (%) e desconto de antecipação (%)
- Desconto de pontualidade (%)
- Desconto adicional (% ou valor fixo)
- Frete

**Aba Entrega:**
- Data prevista, endereço de entrega
- Após criação: registre entrega item a item com quantidade efetiva recebida
- Barra de progresso por item
- Status muda automaticamente conforme entrega acumulada

**Aba Cobrança:**
- Forma de pagamento, suporte a barter, data de vencimento

**Aba Documentos:**
- Anexo de cotações, ordens de compra, etc.

---

## MÓDULO 23 — NF DE ENTRADA DE PRODUTOS

**Caminho:** Menu superior → **Compras & Estoque** → **NF de Produtos**

### O que faz
Lança notas fiscais de compra de produtos (mercadorias) com CFOP, NCM e movimentação de estoque. Separado da NF de Serviços.

### Campos da NF de Produtos
- Fornecedor, CNPJ, IE, Número da NF, Série, CFOP, Natureza da Operação
- Data de emissão, Data de entrada
- Itens: descrição, NCM, CFOP do item, quantidade, unidade, valor unitário
- Impostos: ICMS CST/alíq, PIS CST/alíq, COFINS CST/alíq
- Vínculo de Atividade (rural / PF / investimento / não tributável)
- Entidade Contábil (PF produtor ou PJ empresa)

---

## MÓDULO 24 — NF DE SERVIÇOS (NFS-e)

**Caminho:** Menu superior → **Compras & Estoque** → **NF de Serviços**

### O que faz
Lança notas fiscais de serviços recebidos (NFS-e) com código LC 116/2003 e cálculo de ISS e retenções federais. Completamente separado de NF de produtos.

### Wizard em 3 passos

**Passo 1 — Prestador:**
- Prestador (select do cadastro de Pessoas), CNPJ, Município de prestação
- Regime de tributação: Simples Nacional, Lucro Presumido, etc.

**Passo 2 — Serviço:**
- Número da NFS-e, Data, Código do serviço LC 116/2003 (13 opções)
- Discriminação dos serviços (texto livre)
- Valor dos serviços, Deduções

**Passo 3 — Tributação:**
- ISS: alíquota (%), valor calculado automaticamente
- Retenções federais: PIS, COFINS, CSLL, IRRF, INSS (se aplicável)
- Valor líquido = valor serviços - retenções

---

## MÓDULO 25 — NF-e / FISCAL (Notas Fiscais de Venda)

**Caminho:** Menu superior → **Fiscal** → **NF-e**

### O que faz
Emissão, acompanhamento e gestão de Notas Fiscais Eletrônicas de saída (venda de grãos). Inclui DANFE, cancelamento, devolução e NF complementar.

### Abas disponíveis
1. **Venda** — NF-e de venda de produção
2. **Devolução** — NF-e de devolução
3. **Cancelamento** — NF-e canceladas
4. **Complemento** — NF Complementar (correção de valor)
5. **Certificado** — informações e vencimento do Certificado A1
6. **Contingência** — emissão em contingência (SEFAZ fora do ar)

### Como emitir uma NF-e de venda

**Aba Produtor:**
- Selecione o produtor emitente (PF ou PJ) — CNPJ/CPF, IE, endereço preenchidos automaticamente

**Aba Destinatário:**
- Selecione o comprador do cadastro de Pessoas
- Tipo: PJ (CNPJ) ou PF (CPF)
- Indicador IE: contribuinte / isento / não contribuinte

**Aba Operações:**
- Natureza da Operação (*) — com CFOP auto-preenchido (ex: VFE-PF → CFOP 6501)
- Produto (*): Soja (NCM 1201.10.00), Milho (NCM 1005.10.90), Algodão (NCM 5201.00.20), Trigo (NCM 1001.99.00)
- Quantidade, Unidade, Preço Unitário, Valor Total
- ICMS CST e alíquota (preenchidos pelas configurações de tributação)
- PIS/COFINS CST (geralmente CST 06 — alíquota zero para grãos)

**Aba Transportador:**
- Modalidade de Frete: CIF, FOB, por conta terceiros, próprio (remetente/destinatário), sem frete
- Transportadora (CNPJ, IE), Veículo (placa, UF), RNTRC

**Aba Retirada:**
- Endereço de retirada da mercadoria (se diferente do emitente)

**Aba Fiscal:**
- Ambiente: Produção ou Homologação (teste)
- Série, Número, Data/Hora de emissão
- Forma de emissão: Normal (1), SVC-AN (5), SVC-RS (6) — contingência

**Aba Observações:**
- Informações complementares (infCpl) — preenchidas automaticamente conforme Natureza da Operação
- Texto legal obrigatório de ICMS diferido, PIS/COFINS zero, etc.

**Aba Pontualidade:**
- Desconto de pontualidade (%)

### Transmitir a NF-e
1. Clique em **Transmitir SEFAZ**
2. O sistema assina com o Certificado A1 e envia para a SEFAZ
3. Status muda para "autorizada" (protocolo verde) ou "rejeitada" (código de erro)

### Imprimir DANFE
Na NF autorizada, clique em **DANFE** → abre janela de impressão do browser.

### Cancelar NF-e
1. Na lista, clique em **Cancelar** na NF desejada
2. Informe a justificativa de cancelamento (mínimo 15 caracteres)
3. O sistema envia o evento de cancelamento para a SEFAZ

### Erros comuns
- **Rejeição 202 — Chave NF-e já utilizada:** número de NF duplicado. Avance o número nas configurações.
- **Rejeição 561 — Certificado expirado:** renove o Certificado A1 e recarregue nas configurações.
- **Rejeição 165 — Certificado inválido:** verifique se o certificado está no ambiente correto (prod/homol).
- **SEFAZ fora do ar:** use a aba **Contingência** para emitir em modo offline.

### Certificado A1
Aba **Certificado** exibe: nome, validade, dias restantes e status. O sistema alerta 30, 15, 7 e 1 dia antes do vencimento.

---

## MÓDULO 26 — TRIBUTAÇÃO NCM

**Caminho:** Menu superior → **Configurações** → **Parâmetros do Sistema** → aba **Tributação NCM**

### O que faz
Define as alíquotas e CSTs por NCM para preenchimento automático nas NF-e. Inclui presets para Mato Grosso.

### Presets disponíveis (botão "Carregar Presets MT")
- **Soja em grão (NCM 12019000):** ICMS 051 interno / 020 interestadual (base 61,11%) / PIS-COFINS CST 06 (zero)
- **Milho em grão (NCM 10059010):** mesmas regras da soja
- **Algodão em pluma (NCM 52010020):** ICMS 041 (não tributado) / PIS-COFINS CST 06 (zero)
- **Algodão em caroço (NCM 12072900):** ICMS 051/020 / PIS-COFINS CST 06

### IBS/CBS (Reforma Tributária)
Campo para ativar destaque de IBS e CBS na NF-e. Manter desativado enquanto não obrigatório.

---

## MÓDULO 27 — LCDPR (Livro Caixa Digital do Produtor Rural)

**Caminho:** Menu superior → **Fiscal** → **LCDPR**

### O que faz
Gera o Livro Caixa Digital do Produtor Rural, obrigação da Receita Federal para produtores rurais PF. Exporta arquivo no formato exigido pelo programa GCAP/LCDPR.

### Abas disponíveis
1. **Livro** — entradas manuais e importadas dos lançamentos
2. **Resumo** — totais de receitas e despesas por código LCDPR
3. **Exportação** — gerar arquivo para entrega à Receita Federal

### Códigos LCDPR — Receitas
- 101: Venda de produto rural
- 102: Prestação de serviços rurais
- 103: Recursos de financiamento rural recebidos
- 104: Ressarcimento do ITR
- 199: Outras receitas rurais

### Códigos LCDPR — Despesas
- 201: Custeio da atividade rural
- 202: Investimento na atividade rural
- 203: Amortização de financiamento rural
- 204: Pagamento de ITR
- 205: Outros impostos e taxas
- 299: Outras despesas rurais

### Mapeamento automático
O sistema atribui o código LCDPR automaticamente com base na categoria e descrição do lançamento:
- "Venda de grãos" / "Venda de soja" / "Venda de milho" → 101
- "Insumos" / "Sementes" / "Fertilizantes" / "Defensivos" → 201
- "Máquinas" / "Investimento" → 202
- "Amortização" → 203
- "ITR" → 104

### Filtro de atividade rural
Apenas lançamentos com **Vínculo de Atividade = rural** entram no LCDPR. Configure esse campo ao criar CP/CR.

### Exportar
1. Selecione o exercício (ano)
2. Revise os lançamentos na aba Livro
3. Clique em **Exportar** → baixa o arquivo texto no formato da Receita Federal

---

## MÓDULO 28 — SPED ECD (Contabilidade Digital)

**Caminho:** Menu superior → **Fiscal** → **SPED Contábil**

### O que faz
Gera o arquivo SPED ECD (Escrituração Contábil Digital) no Leiaute 10, compatível com o PGE da Receita Federal e sistemas contábeis como Domínio.

### Pré-requisito
- Configurar os parâmetros contábeis em **Configurações → Parâmetros de Contabilidade**:
  - Método de escrituração (G/R/B)
  - Dados do livro (número, data)
  - Responsável técnico (contador, CRC)
  - Termos de abertura e encerramento
- Ter lançamentos com **Entidade Contábil** (pf/pj) e **OG** (Operação Gerencial) configurados
- OG deve ter conta débito e conta crédito definidas no plano de contas

### Como gerar o SPED ECD
1. Selecione o exercício (ano)
2. Selecione a Entidade Contábil (PF ou PJ)
3. Clique em **Gerar Preview** — exibe quantos lançamentos foram incluídos e quais foram ignorados (sem conta configurada)
4. Revise o preview
5. Clique em **Baixar Arquivo** → download do arquivo .txt
6. Transmita pelo PGE (Programa Gerador de Escrituração) da Receita Federal

### Lançamentos ignorados
Lançamentos sem OG configurada ou sem contas débito/crédito no plano de contas são excluídos. O preview lista quais foram ignorados para que você possa corrigir.

---

## MÓDULO 29 — TRANSPORTE / CT-e

**Caminho:** Menu superior → **Transporte** → **CT-e**

### O que faz
Emite Conhecimentos de Transporte Eletrônico para frota própria da fazenda (motoristas CLT vinculados à fazenda, sem CIOT).

### Campos do CT-e
- Número CT-e, Série, Data de emissão (*)
- CFOP, Natureza da Operação
- Tomador (quem paga o frete): remetente, destinatário, expedidor ou recebedor
- Remetente: nome, CNPJ (ou select do cadastro)
- Destinatário: nome, CNPJ (ou select do cadastro)
- Origem: município/UF de saída (*), Destino: município/UF chegada (*)
- Produto: descrição (*), NCM, quantidade, unidade, peso bruto (kg), peso líquido (kg)
- Valor da mercadoria, Valor do frete (*)
- ICMS: base de cálculo, alíquota, valor
- Veículo (select do cadastro de Transportes), Motorista (select do cadastro de Transportes)
- NF-e vinculada (chave de acesso)
- Observação

### Status do CT-e
rascunho → autorizado → cancelado

### Pré-requisito
- Veículos e motoristas cadastrados em **Configurações → Parâmetros do Sistema → Transportes**
- Certificado A1 configurado (ou CT-e usa o mesmo certificado da NF-e se não configurado separado)

---

## MÓDULO 30 — TRANSPORTE / MDF-e

**Caminho:** Menu superior → **Transporte** → **MDF-e**

### O que faz
Emite o Manifesto Eletrônico de Documentos Fiscais, obrigatório no transporte interestadual e intermunicipal de cargas.

### Campos do MDF-e
- Série, Número, Data de emissão
- UF de Início (*), UF de Fim (*), Percurso (lista de UFs intermediárias)
- RNTRC, Tipo de Emitente
- Seleção dos documentos: CT-e autorizados e NF-e avulsas a incluir no manifesto
- CIOT (Código Identificador da Operação de Transporte) — para frete pago
- Informações do veículo e condutor

---

## MÓDULO 31 — BI (Business Intelligence)

**Caminho:** Menu superior → **BI** (ou acessado pelo ícone do gráfico)

### O que faz
Painel analítico com visão estratégica da fazenda: posição de grãos, evolução de endividamento, custos por insumo, comparativos de safra.

### Abas disponíveis
1. **Posição de Grãos** — balanço da produção: projetada vs comprometida vs livre
2. **Custos & Insumos** — análise de gastos por categoria e produto por ciclo
3. **Recursos de Terceiros** — saldo de dívidas financeiras por categoria
4. **Evolução de Endividamento** — projeção de desembolso futuro ano a ano

### Aba Posição de Grãos
Barra visual mostrando:
- **Vermelho:** sacas comprometidas com arrendamento (pagamento em grãos)
- **Laranja:** sacas comprometidas com barter
- **Azul:** sacas fixadas em contratos de venda
- **Verde:** sacas livres (disponíveis para comercializar)
- **Roxo (barra separada):** sacas equivalentes às dívidas financeiras

### Aba Custos & Insumos
- Selecione o ciclo
- Filtros por grupo de custo: Sementes, Fertilizantes, Defensivos, Operações, Arrendamento, Mão de Obra, Encargos Financeiros, Outros
- Custo por hectare comparado ao benchmark MT (Soja: R$ 5.800/ha; Milho: R$ 3.500/ha; Algodão: R$ 8.500/ha)
- Ranking de produtos por gasto total

### Aba Evolução de Endividamento
- 4 linhas: Endividamento acumulado / Captação / Amortização / Juros e encargos
- Colunas = (ano atual − 3) até último vencimento de parcela
- Coluna atual destacada em azul; futuras projetadas em cinza
- Análise automática: tendência, custo financeiro %, pico de desembolso, projeção de quitação
- Filtro por grupos: Linhas de Crédito, Consórcio Contemplado, Consórcio Não Contemplado, Compra de Imóvel/Terra

---

## MÓDULO 32 — DRE AGRÍCOLA

**Caminho:** Menu superior → **Relatórios** → **DRE Agrícola**

### O que faz
Demonstração do Resultado do Exercício adaptada para fazenda: mostra receitas, custos e resultado por safra/ciclo com análise de ponto de equilíbrio e ROI.

### Filtros
- Fazenda (todas ou específica)
- Ano Agrícola (selecione o label da safra)
- Ciclos: botões toggle para selecionar quais culturas incluir
- Modo: Consolidado (tudo junto) ou Individual (um card por ciclo)

### Estrutura do DRE
1. **Receita Bruta** — contratos confirmados/encerrados; ou sacas × preço esperado se sem contrato
2. **Deduções** — Funrural (1,5%) + SENAR (0,2%)
3. **Receita Líquida**
4. **Custo dos Produtos Vendidos (CPV):**
   - Sementes (de plantios)
   - Fertilizantes (de adubações)
   - Defensivos (de pulverizações)
   - Correção de Solo
   - Operações Mecanizadas
   - Combustível
   - Manutenção
5. **Lucro Bruto**
6. **Despesas Operacionais:**
   - Arrendamento de Terra
   - Mão de Obra
   - Administrativo
   - Seguro de Lavoura
   - Assistência Técnica
7. **EBITDA**
8. **Despesas Financeiras:**
   - Juros de Custeio
   - Juros Outros
9. **Resultado Líquido**

### KPI Cards
- Receita Total, Custo Total, Resultado Líquido, Margem (%), Produtividade (sc/ha), EBITDA

### Análise visual
- **Composição de custos:** barras por categoria
- **Ponto de equilíbrio (PE):** calculado como Custo Total ÷ Preço médio por saca; exibe em sc/ha e folga acima do PE
- **ROI:** Resultado Líquido ÷ Custo Total × 100

### Impressão
Botão **Imprimir** → layout A4 paisagem com filtros aplicados.

---

## MÓDULO 33 — MÓDULO ALGODÃO (Add-on)

**Caminho:** Menu superior → **Algodão**

### Pré-requisito
Módulo Algodão precisa estar habilitado para a conta. Solicite ativação se não aparecer no menu.

### Abas disponíveis
1. **Safra & Operações** — ciclos de algodão, stat cards, operações especiais
2. **Bicudo** — controle de armadilhas e capturas
3. **Módulos** — rastreamento de módulos do campo à algodoeira
4. **Algodoeira** — registro de beneficiamento por lote
5. **HVI & Qualidade** — laudos de qualidade da pluma
6. **Posição** — cockpit com preço ICE/CBOT ao vivo e posição de estoque

### Aba Bicudo (Bicudo do Algodoeiro)
- Cadastrar armadilhas por talhão
- Registrar leituras semanais (capturas por armadilha)
- **Alerta automático:** ≥ 8 capturas/armadilha/semana → alert vermelho de risco alto
- Histórico de capturas em gráfico

### Aba Módulos (campo → algodoeira)
Status dos módulos: campo → em_transporte → entregue
- Ao criar um módulo: informar talhão, colhedora, peso estimado
- Ao transportar: placa, data
- Ao entregar: romaneio na algodoeira

### Aba Algodoeira (Beneficiamento)
- Selecione a algodoeira (do cadastro de Pessoas)
- Informe: lote, data de entrada, módulos entregues
- Resultados: rendimento pluma (%), fardos, peso pluma (kg), caroço (kg)
- **Semáforo de rendimento:** < 38% = vermelho, 38–40% = amarelo, ≥ 40% = verde
- Custo de beneficiamento (R$ por arroba)

### Aba HVI & Qualidade
Laudo por lote com 11 parâmetros HVI (High Volume Instrument) com semáforo por parâmetro conforme referências MT:
- Comprimento (UHML), Uniformidade (Uni%), Resistência (Str g/tex), Micronaire (Mic), Reflectância (Rd), Amarelamento (+b), Índice de Fiabilidade (SFI%), Maturidade (Mat%), Finura (HS), Índice de Consistência (CSP), Impureza (Leaf)
- Prêmio/Desconto calculado automaticamente sobre o preço ICE

### Aba Posição
- Preço ICE/CBOT ao vivo em ¢/lb convertido para R$/@
- Valor total do estoque de pluma em R$
- Fluxo de produção: talhões → módulos → algodoeiras
- Posição por algodoeira: módulos entregues, fardos beneficiados, pluma disponível

---

## MÓDULO 34 — CADASTROS

**Caminho:** Menu superior → **Cadastros**

### O que faz
Centraliza todos os cadastros mestres do sistema. Qualquer entidade que precisa ser selecionada em outros módulos precisa estar cadastrada aqui primeiro.

### Grupos de abas

**Cadastros Gerais:**
- **Produtores** — donos da produção (PF ou PJ). Campos: nome (*), CPF/CNPJ (*), IE, e-mail, telefone, endereço. Busca automática de CEP via ViaCEP. Sub-aba: Inscrições Estaduais (por UF).
- **Fazendas** — propriedades rurais. Modal com 7 sub-abas:
  - Geral: nome (*), município (*), estado (*), área total (ha), CAR, NIRF, CCIR; endereço com CEP → ViaCEP
  - Matrículas: lista de matrículas do imóvel, comparativo de área (matriculado vs total)
  - CARs: Cadastro Ambiental Rural com vencimentos
  - NIRFs: Número do Imóvel na Receita Federal
  - ITRs: dados do ITR por ano
  - CCIRs: Certificado de Cadastro de Imóvel Rural com vencimentos
  - Arrendamentos: contratos de arrendamento vinculados à fazenda
- **Funcionários** — colaboradores CLT/PJ. Sub-abas: dados pessoais, remuneração, premiações, férias.
- **Pessoas** — fornecedores, compradores, parceiros, arrendantes. Campos: nome, CPF/CNPJ, tipo (fornecedor, comprador, arrendante, transportadora, etc.), contato, endereço. Subcategoria "Arrendante" necessária para aparecer no dropdown de arrendamentos.
- **Imóveis Urbanos** — imóveis não rurais da família/empresa.

**Cadastros Técnicos:**
- **Safras & Ciclos (Anos Safra)** — cria os anos agrícolas (ex: "2025/2026") e os ciclos dentro de cada ano (ex: "Soja 2025/2026"). Ciclos são obrigatórios antes de qualquer operação de lavoura.
- **Insumos** — produtos de uso no campo: sementes, fertilizantes, defensivos, etc. Campos: nome (*), categoria (*), unidade (*), estoque mínimo, custo médio, princ. ativo.
- **Produtos** — itens comercializados.
- **Itens** — itens genéricos.
- **Depósitos** — armazéns, silos, tulhas, galpões. Campos: nome, tipo, capacidade (sc).
- **Máquinas** — frota da fazenda. Sub-abas: geral (placa, tipo, modelo, ano), aquisição (valor, financiamento), seguro.
- **Combustíveis** — bombas de abastecimento da fazenda. Campos: nome, produto (diesel/gasolina), localização.
- **Grupos de Insumo / Subgrupos** — hierarquia de classificação de insumos.
- **Culturas** — define as culturas com fator de conversão kg (60 para grãos, 15 para algodão). Usado nos cálculos de sc/@.
- **Padrões de Classificação** — tabelas configuráveis de parâmetros por commodity. Botão "Carregar Padrões Oficiais" carrega ABIOVE (soja) e IN MAPA 60/2011 (milho).
- **Princípios Ativos** — base de dados de moléculas defensivos.
- **Unidades de Medida** — kg, L, sc, @, ton, etc.

**Financeiro:**
- **Centros de Custo** — hierarquia de CC para rateio de despesas.
- **Operações Gerenciais (OG)** — classificação contábil de lançamentos. Modal com abas: principal (nome, tipo), estoque (impacta estoque?), fiscal (CFOP, NCM), financeiro (impacta CP/CR?), contabilidade (conta débito/crédito), CFOP.
- **Histórico Fiscal** — lista de CFOPs usados.
- **Formas de Pagamento** — PIX, boleto, transferência, etc.
- **Contas Bancárias** — contas da fazenda com banco, agência, conta, tipo.

---

## MÓDULO 35 — AUTOMAÇÕES

**Caminho:** Menu superior → **Configurações** → **Automações**

### O que faz
Painel de controle das automações que o sistema executa automaticamente. Permite ativar/desativar e executar manualmente para testes.

### Automações disponíveis

**1. Alertas de Vencimento** (categoria: Alertas)
- Horário: todo dia às 7h BRT
- O que faz: verifica CP, CR, arrendamentos e Certificado A1 vencendo nos próximos 7 dias; envia e-mail de alerta com tabelas por urgência (crítico/alto/médio)
- Para ativar: ligue o toggle; configure e-mail em Integrações

**2. Relatório Semanal** (categoria: Relatórios)
- Horário: toda segunda-feira às 7h BRT
- O que faz: envia e-mail com resumo financeiro da semana (CP/CR a vencer, vencidos, saldo projetado, preços de mercado, contratos ativos, operações de lavoura)
- Para ativar: ligue o toggle

**3. Atualização de Preços** (categoria: Mercado)
- Horário: todo dia às 7h BRT (+ ao vivo a cada 5 min no Dashboard)
- O que faz: atualiza cotações CBOT Soja/Milho/Algodão e USD/BRL
- Funciona automaticamente ao abrir o Dashboard — não precisa de configuração

**4. Importação Automática SIEG** (categoria: Fiscal)
- Horário: 2× ao dia — 8h e 17h BRT
- O que faz: consulta a API SIEG, baixa NF-e e NFS-e recebidas; cria fornecedor automaticamente se novo; lança CP; arquiva XML; classifica itens por regras
- Para ativar: clique em **Configurar SIEG** e informe a API Key do SIEG e os CNPJs da fazenda

### Como testar manualmente
Clique em **Executar** em qualquer automação para disparar imediatamente (útil para verificar se e-mails chegam).

### Configuração de e-mail
Informe o Resend API Key e o e-mail remetente em **Configurações → Parâmetros do Sistema → Integrações**.

---

## MÓDULO 36 — PARÂMETROS DO SISTEMA

**Caminho:** Menu superior → **Configurações** → **Parâmetros do Sistema**

### O que faz
Configurações globais do sistema: dados fiscais do emitente, certificado digital, parâmetros de expedição, transportes, integrações.

### Abas disponíveis

**Aba Aparência:**
- Logo da fazenda, cores, nome exibido

**Aba Fiscal — NF-e:**
- Ambiente: Produção ou Homologação (sempre use Homologação para testes)
- Série NF-e, Próximo Número
- CPF/CNPJ Emitente (*), Razão Social/Nome (*)
- Inscrição Estadual, Inscrição Municipal
- CRT (Regime Tributário): 1-Simples Nacional, 2-SN Excesso, 3-Regime Normal, 4-MEI
- Certificado A1: caminho no Supabase Storage, Senha

**Aba Tributação NCM:**
- Tabela de NCMs com todas as alíquotas (ver Módulo 26 — Tributação NCM)

**Aba Operações Fiscais:**
- CFOPs padrão de venda dentro do estado, venda fora do estado, remessa para depósito

**Aba CT-e:**
- Ambiente, Série, Número inicial, RNTRC do transportador
- Certificado A1 do CT-e (opcional — usa o da NF-e se vazio)

**Aba MDF-e:**
- Ambiente, Série, Número inicial, RNTRC emitente, Tipo Emitente (Autônomo/ETC/CTC)
- UF Início padrão, UF Fim padrão

**Aba Transportes:**
- CRUD completo de **Transportadoras** (CNPJ, razão social, RNTRC, UF)
- CRUD completo de **Veículos** (placa, tipo, tara, capacidade, RNTRC)
- CRUD completo de **Motoristas** (nome, CPF, CNH, validade CNH — alerta se vencendo)

**Aba Integrações:**
- Resend API Key, E-mail Remetente (para automações de e-mail)
- WhatsApp API URL, Token, Instância (para automações de WhatsApp)

**Aba Expedição:**
- Peso Aproximado padrão (%) — estimativa de peso quando peso real não disponível
- Tolerância de Divergência (%) — acima disso, alerta de NF Complementar
- Gerar NF Remessa automaticamente: Sim/Não
- Bucket Supabase para XMLs

### Importante
Todas as configurações são salvas por fazenda. Um novo cliente deve preencher essas configurações antes de emitir a primeira NF-e.

---

## MÓDULO 37 — REGRAS DE RATEIO

**Caminho:** Menu superior → **Configurações** → **Regras de Rateio**

### O que faz
Define como os custos são distribuídos (rateados) entre ciclos (culturas) quando uma despesa atende a múltiplas culturas.

### Como criar uma regra
1. Selecione o Ano Safra
2. Clique em **+ Nova Regra**
3. Selecione quais tipos de custo esta regra abrange (checkboxes: Sementes, Fertilizantes, Defensivos, Combustível, etc.)
4. Defina a proporção: ex. 50% Soja / 50% Milho (barra visual em tempo real)
5. Salve

### Regra de exceção
Para tipos de custo com proporção diferente da regra principal, crie uma **Regra de Exceção** separada para aquele tipo específico.

---

## MÓDULO 38 — IMPORTAÇÃO DE DADOS

**Caminho:** Menu superior → **Configurações** → **Importação**

### O que faz
Permite importar dados em massa via planilha XLSX: pessoas, CP, CR, insumos, produtos, máquinas, contratos financeiros, arrendamentos, contratos de venda, produtores, fazendas e talhões.

### Abas disponíveis
- **Pessoas** — clientes, fornecedores, parceiros
- **CP** — Contas a Pagar em lote
- **CR** — Contas a Receber em lote
- **Insumos** — cadastro de insumos em massa
- **Produtos** — itens comercializados
- **Máquinas** — frota
- **Contratos Financeiros** — financiamentos e crédito
- **Arrendamentos** — contratos de arrendamento
- **Contratos de Venda** — contratos de grãos (tabela contratos)
- **Produtores** — produtores rurais
- **Fazendas** — propriedades rurais
- **Talhões** — subdivisões das fazendas

### Processo de importação (igual para todas as abas)
1. Clique em **Baixar Template** para obter o modelo XLSX
2. Preencha a planilha respeitando as colunas do template
3. Arraste o arquivo para a zona de upload (ou clique para selecionar)
4. O sistema valida cada linha e exibe:
   - Verde: ok para importar
   - Vermelho: erro (campo obrigatório faltando, formato inválido, etc.)
   - Amarelo: duplicado encontrado
5. Revise os erros, corrija no arquivo se necessário
6. Clique em **Importar** para confirmar as linhas válidas
7. Um resumo final mostra: importados / erros / duplicados ignorados

### Campos obrigatórios (marcados com * no template)
Variam por aba — o template inclui uma linha de instruções na segunda linha.

### Lookups automáticos
Campos como "Fazenda" (por nome), "Safra" (por descrição), "Ciclo" (por descrição) são resolvidos automaticamente durante a importação.

---

## PERGUNTAS FREQUENTES

**P: O sistema não mostra as fazendas. O que faço?**
R: Verifique se você está logado com o usuário correto e se a fazenda está cadastrada em **Cadastros → Fazendas**. Se a fazenda existir mas não aparecer, entre em contato com o suporte.

**P: Como troco de fazenda ativa?**
R: No canto superior direito do TopNav, clique no nome da fazenda. Se você tiver mais de uma fazenda na sua conta, aparece um dropdown para selecionar. Se não aparecer, você tem apenas uma fazenda cadastrada.

**P: Os ciclos não aparecem no select de lavoura.**
R: Ciclos precisam estar cadastrados em **Cadastros → Safras & Ciclos (Anos Safra)**. Primeiro crie o Ano Safra (ex: "2025/2026"), depois crie os ciclos dentro dele.

**P: A NF-e foi rejeitada pela SEFAZ. O que fazer?**
R: Veja o código de rejeição:
- 202: número duplicado → avance o número nas configurações
- 561: certificado expirado → renove o Certificado A1
- 206: CNPJ/CPF inválido → verifique os dados do emitente ou destinatário
- 999: erro interno SEFAZ → aguarde e tente novamente

**P: O estoque baixou errado depois de um plantio.**
R: Verifique em **Estoque → Movimentações** qual baixa foi feita. Se necessário, crie um lançamento de ajuste manual (entrada no estoque) e refaça o plantio corretamente.

**P: O LCDPR está vazio mesmo tendo lançamentos.**
R: Somente lançamentos com **Vínculo de Atividade = rural** aparecem no LCDPR. Edite os lançamentos e defina esse campo.

**P: Como funciona o custo médio no estoque?**
R: O sistema usa custo médio ponderado. Ao dar entrada por NF, o novo custo médio é calculado como: (saldo atual × custo_médio_atual + quantidade_entrada × custo_unitário_NF) ÷ (saldo atual + quantidade_entrada).

**P: Posso usar o sistema em homologação (teste) antes de emitir NF-e real?**
R: Sim. Em **Configurações → Parâmetros do Sistema → Fiscal**, mude o Ambiente para "Homologação". As NF-e emitidas em homologação são enviadas para o ambiente de testes da SEFAZ e não têm validade fiscal.

**P: As automações de e-mail não estão chegando.**
R: Verifique: (1) a automação está ativada em **Configurações → Automações**; (2) o Resend API Key está configurado em **Configurações → Parâmetros do Sistema → Integrações**; (3) o domínio de e-mail está verificado no painel da Resend; (4) clique em **Executar** manualmente e veja se há mensagem de erro.

**P: Como importar NF-e recebidas automaticamente?**
R: Configure a integração SIEG em **Configurações → Automações → Configurar SIEG**. Informe a API Key do SIEG e os CNPJs da fazenda. A importação ocorrerá automaticamente 2× ao dia.

**P: O que é "vínculo de atividade" num lançamento?**
R: Classifica se o lançamento pertence à atividade rural (PF produtor rural), à PJ empresa, a um investimento ou é não tributável. Usado para o LCDPR (filtro: "rural") e para o SPED ECD (filtro: "pj" ou "pf").

**P: Como configurar um novo cliente no sistema?**
R: O administrador (raccotlo) cria o usuário via painel admin. O novo cliente deve então: (1) fazer login, (2) ir em **Cadastros → Fazendas** e criar sua fazenda, (3) preencher **Parâmetros do Sistema** com dados fiscais e certificado A1, (4) criar os Ciclos e Talhões, (5) começar a operar.

---

## REFERÊNCIA RÁPIDA — CAMINHOS DO MENU

| O que fazer | Caminho |
|---|---|
| Ver alertas e preços | Dashboard |
| Ver fazendas e talhões | Propriedades |
| Criar/ver ciclos de lavoura | Lavoura → Planejamento Agrícola |
| Registrar plantio | Lavoura → Plantio |
| Registrar pulverização | Lavoura → Pulverização |
| Registrar adubação | Lavoura → Adubação de Base |
| Registrar correção de solo | Lavoura → Correção de Solo |
| Registrar colheita | Lavoura → Colheita Própria |
| Ver relatório de aplicações | Lavoura → Relatórios → Aplicações por Ciclo |
| Criar contrato de venda de grãos | Comercial → Contratos de Grãos |
| Controlar expedição | Comercial → Expedição de Grãos |
| Gerenciar arrendamentos | Comercial → Contratos de Arrendamento |
| Ver fluxo de caixa | Financeiro → Fluxo de Caixa |
| Lançar contas a receber | Financeiro → Contas a Receber |
| Lançar contas a pagar | Financeiro → Contas a Pagar |
| Gerenciar financiamentos | Financeiro → Contratos Financeiros |
| Lançamentos de tesouraria | Financeiro → Tesouraria |
| Gerenciar seguros | Financeiro → Seguros |
| Gerenciar consórcios | Financeiro → Consórcios |
| Ver endividamento total | Financeiro → Endividamento |
| Ver posição de estoque | Compras & Estoque → Estoque |
| Dar entrada em NF de insumos | Compras & Estoque → Estoque → NF Entrada |
| Criar pedido de compra | Compras & Estoque → Pedidos de Compra |
| Lançar NF de produtos recebida | Compras & Estoque → NF de Produtos |
| Lançar NF de serviços recebida | Compras & Estoque → NF de Serviços |
| Emitir NF-e de venda | Fiscal → NF-e |
| Gerar LCDPR | Fiscal → LCDPR |
| Gerar SPED ECD | Fiscal → SPED Contábil |
| Emitir CT-e | Transporte → CT-e |
| Emitir MDF-e | Transporte → MDF-e |
| Análise estratégica | BI |
| Ver DRE | Relatórios → DRE Agrícola |
| Módulo algodão | Algodão |
| Configurar automações | Configurações → Automações |
| Configurar NF-e e fiscal | Configurações → Parâmetros do Sistema |
| Cadastrar fazendas | Cadastros → Fazendas |
| Cadastrar ciclos e safras | Cadastros → Safras & Ciclos |
| Cadastrar insumos | Cadastros → Insumos |
| Cadastrar pessoas/fornecedores | Cadastros → Pessoas |
| Cadastrar contas bancárias | Cadastros → Contas Bancárias |
| Importar dados em massa | Configurações → Importação |
| Definir regras de rateio | Configurações → Regras de Rateio |
`;
