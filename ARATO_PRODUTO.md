# Arato — o produto como está implementado hoje

> Levantamento feito a partir do código deste repositório (`agrofield`) e de consultas de leitura ao banco de
> produção, em 27/10/2026. O App Campo foi conferido no repositório separado `arato-campo`.
> Serve de base para o site e o material de marketing: só está aqui o que existe no código.
> O que está incompleto, simulado, em teste ou só planejado está marcado.
>
> **Legenda de status**
> - **Pronto**: tela completa e com uso real em produção (há registros de clientes no banco).
> - **Em teste**: tela completa, mas com pouco ou nenhum uso real até agora. Funciona no código, falta validação em campo.
> - **Incompleto / simulado**: a tela existe, mas uma parte importante não faz o que o nome sugere.
> - **Planejado**: aparece em lista de módulos ou documentação, sem tela no sistema.
>
> **Números de uso citados** são contagens de registros no banco de produção em 27/10/2026, somando todos os
> clientes (11 contas, 25 fazendas: 22 em MT, 2 no PA, 1 em GO).

---

## 1. Visão geral

O Arato é um sistema de gestão para fazendas de grãos, usado pelo navegador, sem instalação.
Ele junta num lugar só o financeiro (contas a pagar e receber, banco, folha, dívidas), o fiscal (notas de compra
capturadas automaticamente, emissão de NF-e, CT-e e MDF-e, LCDPR), a lavoura (operações, estoque de insumos, custos)
e a comercialização de grãos (contratos, faturamento, expedição).
A ideia central é o sistema fazer sozinho o que dá: as notas de compra chegam pelo SIEG, viram contas a pagar ao
processar, e o extrato bancário se concilia com os títulos.
Uma assistente com IA (Olívia) tira dúvidas de uso dentro do sistema.

---

## 2. Módulos e funcionalidades

### 2.1 Início (painel)
- **Tela:** `/`
- **O que faz:** painel com cotações ao vivo (soja e milho em Chicago e na B3, algodão, dólar comercial e PTAX),
  indicação de bolsa aberta ou fechada e busca rápida por título, contrato, ciclo, insumo e pessoa.
- **Status:** pronto.

### 2.2 Cadastros
- **Tela:** `/cadastros`, organizada em abas.
- **O que faz:**
  - entidades: pessoas e fornecedores, produtores, fazendas e talhões (com matrículas, certidões CAR/ITR/CCIR e
    arrendamentos), funcionários, empresas e imóveis urbanos;
  - agrícola: catálogo de insumos, produtos agrícolas, itens gerais, depósitos e armazéns, combustíveis e bombas,
    grupos de insumos, culturas, princípios ativos e unidades de medida;
  - patrimônio: máquinas e veículos, benfeitorias, bens;
  - financeiro: contas bancárias, centros de custo, histórico fiscal (CFOP), formas de pagamento;
  - safras e ciclos, padrões de classificação de grãos.
- **Automático:** endereço pelo CEP (ViaCEP, BrasilAPI), dados de empresa pelo CNPJ (ReceitaWS, BrasilAPI) e um
  cadastro por CPF/CNPJ por cliente.
- **Status:** pronto. Há 2.110 insumos e 167 talhões cadastrados.

### 2.3 Produção (lavoura)

| Funcionalidade | Tela | Status |
|---|---|---|
| Planejamento de safra (orçamento, planejado × realizado, agenda) | `/lavoura/planejamento` | Em teste (nenhum orçamento gravado) |
| Plantio | `/lavoura/plantio` | Em teste (3 registros) |
| Adubação de base | `/lavoura/adubacao` | Pronto (80 registros) |
| Correção de solo | `/lavoura/correcao` | Em teste (3 registros) |
| Pulverização terrestre | `/lavoura/pulverizacao` | Pronto (120 registros) |
| Aplicação aérea | `/lavoura/aerea` | Em teste (nenhum registro) |
| Tratamento de sementes | `/lavoura/tratamento-sementes` | Em teste (uso não confirmado) |
| Recomendações agronômicas | `/lavoura/recomendacoes`, `/lavoura/execucao` | Em teste (3 registros) |
| Pragas e doenças (monitoramento) | `/lavoura/pragas` | Em teste (3 registros) |
| Pluviometria | `/lavoura/pluviometria` | Em teste (nenhuma leitura) |
| Mapa de talhões (envio de arquivo KML por talhão, mapa Leaflet) | `/mapa` | Em teste |
| Colheita própria com romaneio (peso bruto, tara, classificação) | `/lavoura/colheita` | Em teste (1 colheita, 2 romaneios) |
| Abastecimento de máquinas | `/estoque/abastecimento` | Pronto (68 registros) |
| Manutenção e custo por máquina | `/relatorios/manutencao` | Pronto (uso não medido) |
| Relatório de aplicações por ciclo (PDF, Excel, envio por WhatsApp) | `/lavoura/relatorios/aplicacoes` | Pronto |

- **Regra:** a operação de campo baixa o insumo do estoque pelo custo médio e nunca gera conta a pagar.

**Algodão (add-on vendido à parte)** — tela `/algodao`, com 6 abas:
- safra e operações: regulador de crescimento e desfolha;
- monitoramento de bicudo: armadilhas, com alerta a partir de 8 capturas por armadilha por semana;
- colheita e módulos;
- algodoeira e beneficiamento: rendimento de pluma, fardos e caroço;
- HVI e qualidade;
- posição de algodão: cotação ICE e valor do estoque de pluma.

**Status do Algodão:** em teste (nenhum módulo nem captura de bicudo registrados).

### 2.4 Estoque
- **Telas:**
  - posição de insumos `/estoque`;
  - kardex `/estoque/kardex`;
  - estoque de grãos `/estoque/graos`;
  - transferência entre fazendas `/estoque/transferencias`;
  - romaneios de entrada `/estoque/romaneio-entrada`;
  - pesagem avulsa `/balanca/pesagem-avulsa`.
- **O que faz:**
  - saldo por depósito e por fazenda, com custo médio ponderado;
  - entrada automática pela NF de compra processada;
  - baixa pelas operações de campo;
  - transferência entre fazendas, com emissão de NF de transferência.
- **Status:** pronto (1.946 movimentações, 79 transferências). Pesagem avulsa em teste (6 registros).

### 2.5 Compras
- **Telas:**
  - pedidos de compra `/compras`;
  - relatório de pedidos `/relatorios/pedidos-compra`.
- **O que faz:**
  - pedido em rascunho → aprovado → entregue, com controle do que já chegou por item, pelas NFs;
  - pagamento em barter (troca por grãos), que gera um compromisso em grãos;
  - relatório sintético e analítico em PDF e Excel.
- **Status:** pronto (224 pedidos).

### 2.6 Documentos fiscais de entrada (notas de terceiro)
- **Tela:** `/fiscal/documentos`. Um grid único com NF de produtos, NFS-e (serviços) e CT-e (fretes).
- **O que faz:**
  - as notas chegam sozinhas pelo SIEG;
  - processar a NF de produtos dá entrada no estoque, lança o contas a pagar (com o parcelamento da nota) e
    classifica por operação gerencial, safra e ciclo;
  - processamento em lote;
  - reclassificação depois de processada;
  - devolução de compra (emite a NF-e de devolução);
  - manifestação do destinatário;
  - alerta de NF cancelada pelo emitente;
  - relatórios de processamento e de NFs canceladas.
- **NFS-e:** código de serviço com a lista completa da LC 116/2003, ISS e retenções federais.
- **CT-e de frete contratado:** entra pelo SIEG e, ao processar, gera o contas a pagar da transportadora. Recurso
  novo: 3 CT-e importados até hoje, nenhum processado ainda.
- **Status:** NF de produtos e NFS-e prontos (5.795 NF e 3.766 NFS-e no banco). CT-e de entrada em teste.

### 2.7 Remessas e retornos
- **Telas:** remessas `/fiscal/remessas` (abas Mercadorias e Máquinas e equipamentos) e retornos `/fiscal/retornos`.
- **O que faz:**
  - remessa para armazém geral, depósito ou condomínio logístico, emitida pelo Arato ou registrada quando emitida
    em outro sistema;
  - o estoque é transferido para o depósito do armazém;
  - retorno parcial ou total, recebido ou emitido;
  - remessa de máquina para conserto, comodato ou transferência.
- **Status:** em teste (recurso de 27/10/2026, 4 remessas e 2 transferências de máquina registradas).

### 2.8 Comercialização de grãos
- **Telas:**
  - contratos `/contratos`;
  - faturamento e NF-e de saída `/comercial/faturamento`;
  - expedição `/expedicao`;
  - romaneios de saída `/relatorios/romaneios?aba=saida`;
  - compromissos em grãos `/contratos/compromissos-graos`;
  - arrendamento `/contratos/arrendamento`;
  - compra de terra `/contratos/compra-terra`;
  - migração de NF entre contratos `/contratos/migrar-nf`.
- **O que faz:**
  - contrato de venda com preço fixo em R$ ou US$, a fixar (basis) ou barter, com itens, entregas e saldo;
  - faturamento com emissão de NF-e;
  - expedição por carga em três rotas: transbordo sem NF, transbordo com remessa e direto ao comprador;
  - correção de peso no destino;
  - arrendamento pago em sacas ou em R$, com parcelas automáticas;
  - compra de terra com parcelas em sacas, que viram contratos de grãos;
  - relatório de compromissos em grãos (arrendamento, barter, compra de terra).
- **Status:** contratos e arrendamentos prontos (511 contratos, 70 arrendamentos). Expedição em teste (3 cargas).

### 2.9 Financeiro
| Funcionalidade | Tela | Status |
|---|---|---|
| Contas a pagar (baixa total ou parcial, borderô, baixa em lote, adiantamentos, cartão, exclusão em lote de lançamento manual) | `/financeiro/pagar` | Pronto (17.702 títulos) |
| Contas a receber | `/financeiro/receber` | Pronto |
| Financeiro separado por empresa (CP/CR, folha, DRE por empresa) | `/empresas/pagar`, `/empresas/receber`, `/financeiro/empresas` | Pronto (593 títulos) |
| Conciliação bancária por OFX (sugestões automáticas, borderô como uma linha, pagamento parcial) | `/financeiro/conciliacao` | Pronto (2.914 linhas de extrato) |
| Borderô (um fornecedor, pagamento parcial divide o borderô) | dentro de Contas a Pagar | Pronto (405 borderôs) |
| Folha de pagamento (produtor e empresa, adiantamentos, gratificações, reprocessamento) | `/financeiro/folha`, `/empresas/folha` | Pronto (116 folhas) |
| Previsão de gastos (previsto × realizado) | `/financeiro/previsoes` | Pronto (1.261 previsões) |
| Adiantamentos a fornecedores | `/financeiro/adiantamentos` | Pronto |
| Cartões de crédito (fatura, pagar fatura) | `/financeiro/cartoes` | Pronto (5 cartões) |
| Contratos financeiros (cédulas rurais, SAC/PRICE, cronograma) | `/financeiro/contratos` | Pronto (103 contratos) |
| Endividamento (por vencimento, contratos em US$ convertidos pela PTAX) | `/financeiro/endividamento` | Pronto |
| Consórcios | `/financeiro/consorcios` | Pronto (40) |
| Seguros e apólices | `/financeiro/seguros` | Pronto (22) |
| Tesouraria, mútuos entre empresas, aplicações financeiras | `/financeiro/tesouraria`, `/financeiro/tesouraria/mutuo`, `/financeiro/aplicacoes` | Em teste (nenhum mútuo nem aplicação registrados) |
| Apoio financeiro (add-on) | `/financeiro/apoio` | Em teste (nenhuma baixa registrada) |
| Relatórios: CP/CR, fluxo de caixa previsto e realizado, posição bancária, posição de comercialização, gastos por classificação | `/financeiro/relatorios`, `/relatorios/financeiro-classificacao` | Pronto |

### 2.10 Resultados e custos
- **Telas:**
  - DRE agrícola `/custos?aba=dre`;
  - margens por safra `/relatorios/dre`;
  - custos totais, custo por hectare e produtividade `/custos`;
  - regras de rateio `/configuracoes/rateio`.
- **O que faz:**
  - DRE com receita, deduções (Funrural 1,5% + SENAR 0,2%), custo dos produtos (pelo custo de baixa do estoque),
    despesas gerais e financeiras;
  - ponto de equilíbrio em sacas por hectare e ROI;
  - rateio de custos por ano safra.
- **Status:** pronto. O uso real depende da qualidade dos lançamentos de cada cliente.

### 2.11 BI e análises
- **Tela:** `/bi`. Acesso pelo menu lateral de atalhos; restrito à equipe Raccolto e aos perfis com a permissão.
- **Abas:**
  - painel executivo, produção, custos e insumos, comercialização e financeiro;
  - câmbio/USD;
  - recursos de terceiros e evolução do endividamento;
  - sensibilidade e proteção de margem;
  - auditorias (classificação, safra/ciclo, consistência).
- **Status:** pronto como tela. A profundidade de cada aba depende dos dados lançados.

### 2.12 Proteção de margem e hedge (add-on)
Detalhado na seção 3. **Status:** em teste. A tela é completa, mas nenhuma fixação foi registrada em produção.

### 2.13 Fiscal (emissão e obrigações)
Detalhado na seção 4.

### 2.14 Configurações e administração
- **Configurações do cliente:**
  - parâmetros fiscais da NF-e e certificado digital `/configuracoes/modulos`;
  - operações gerenciais e plano de contas;
  - classificação automática;
  - taxas de referência;
  - contabilidade;
  - usuários e permissões `/configuracoes/usuarios`;
  - auditoria `/configuracoes/auditoria`.
- **Área da equipe Raccolto:**
  - integrações, automações, importações (planilha), backup e restauração, bot de WhatsApp;
  - painel de clientes, planos e módulos, onboarding, saúde dos dados, logs, manual `/admin/*`;
  - modo BPO, para atender vários clientes `/bpo/*`, `/seletor-cliente`.
- **Status:** pronto.

### 2.15 Ajuda
- **Telas:**
  - Central de atualizações (changelog) `/atualizacoes`;
  - aprendizado (conteúdo de treinamento) `/learning`;
  - suporte com a Olívia `/suporte` e janela flutuante em todas as telas;
  - suporte remoto (servidor RustDesk próprio) `/ajuda/suporte-remoto`.
- **Status:** pronto.

### 2.16 Módulos planejados (sem tela)
- **Cerealista, Sementes e Pecuário:** aparecem como add-ons em `/admin/modulos`, mas não há telas desses módulos
  no código. Uma rota genérica (`app/[modulo]/page.tsx`) mostra "Módulo … em construção".
- **Triangulação de NF:** a tela `/fiscal/triangulacao` existe, mas o item está desabilitado no menu.

---

## 3. Comercialização e margem

Há duas partes diferentes: o **contrato de venda real** (comercialização) e a **ferramenta de proteção de margem**
(simulação e controle de fixações).

### 3.1 Contrato de venda (`/contratos`)
- **Modalidade de preço:** fixo (em R$/sc ou US$/sc), "a fixar / basis" ou barter.
- **Contrato em US$:** mostra a conversão em R$/sc pela PTAX do dia anterior.
- **Indicadores:** quantidade, entregue, saldo, valor financeiro e valor total.
- **Relatório:** posição de comercialização em Financeiro → Relatórios.
- **O que não existe no contrato:** campos separados de Chicago, prêmio ou frete na formação do preço. O preço é
  digitado (fixo) ou marcado como a fixar.

### 3.2 Proteção de margem e hedge (`/comercial/hedge`, também como aba no BI)
Add-on (`protecao_margem`), com 7 abas: Cockpit, Precificador, Sensibilidade, Busca de Margem, Escala,
Histórico e Despesas.

**Como o preço é calculado (Precificador)** — código em `app/comercial/hedge/page.tsx`, função `calcPreco`:
1. **Preço no porto (R$/sc)** = (Chicago + prêmio, em centavos de dólar por bushel) ÷ 100 × fator × câmbio.
   - Fator soja: 2,2046 bushels por saca de 60 kg.
   - Fator milho: 2,3621.
2. **Preço líquido** = preço no porto − frete − despesas de originação. As despesas de originação são a soma das
   despesas cadastradas por cultura e porto; sem cadastro, o sistema usa R$ 6,50/sc fixo.
3. Se marcado, desconta **Funrural (1,5%) + SENAR (0,2%)** do preço líquido.
4. **Margem do produtor** = preço líquido final − custo por saca, que é digitado. Aparece em R$/sc e em % sobre o custo.

**O que pode ser fixado** — registro de fixações por componente, com quantidade em sacas, valor e data:
- **Componentes:** BOARD (Chicago), PRÊMIO, CÂMBIO e FRETE.
- **Instrumentos:** venda física, NDF, call, put, futuro de dólar B3 e swap.
- Para cada componente, o sistema mostra o **% já fixado** sobre a produção estimada do ciclo (área ×
  produtividade esperada) e o **valor médio fixado**.

**Outros indicadores:**
- **Sensibilidade:** matriz de margem variando dois eixos entre Chicago, câmbio, prêmio e frete, com cores de
  negativo a confortável.
- **Busca de margem:** dada uma margem desejada em R$/sc, calcula o Chicago necessário e o câmbio necessário.
- **Escala:** metas de % vendido por marco da safra (pré-plantio 20%, plantio 35%, floração 50%, colheita 70%,
  pós-colheita 100%, editáveis).
- **Histórico:** curvas de mercado gravadas.
- **Despesas:** frete, taxa de porto, classificação, quebra, comissão e seguro, por cultura e por porto
  (Paranaguá, Santos, Miritituba, São Francisco do Sul, Itacoatiara, Barcarena).

**De onde vêm os dados de mercado** (`app/api/precos/route.ts` e o robô `app/api/cron/curva-mercado`):

| Dado | Fonte | Observação |
|---|---|---|
| Soja, milho e algodão em Chicago | Yahoo Finance (ZS=F, ZC=F, CT=F) | Atraso de cerca de 15 min; a tela atualiza a cada 30 s |
| Milho B3 | Yahoo Finance (contratos CCM e WCO) | Quando não há cotação, usa estimativa a partir de Chicago |
| Dólar comercial | AwesomeAPI | Se falhar, usa a PTAX |
| Dólar PTAX | Banco Central (API Olinda) | |
| Taxas de referência | Banco Central (API SGS) | Robô mensal |
| CEPEA soja Paranaguá e milho Campinas | Tabela `curva_mercado` | **Não há busca automática do CEPEA no código**: o valor só existe se alguém o gravar |
| Prêmio implícito | Calculado: CEPEA ÷ câmbio ÷ fator − Chicago | Depende do CEPEA gravado |
| Curva de mercado diária | Robô de segunda a sexta, às 22h UTC (Yahoo) | 201 registros no banco |

**Status:** em teste. Nenhuma fixação registrada em produção. Ferramenta pensada para uso do consultor Raccolto,
com resumo para o produtor (anotação interna; a restrição de acesso no código é pelo add-on, e algumas ações só
aparecem para a equipe Raccolto).

---

## 4. Fiscal

### 4.1 NF-e (modelo 55)
- **Emissão própria:** assinatura com certificado A1 e transmissão direta à SEFAZ, sem intermediário (código
  próprio em `lib/nfe`, `app/api/fiscal/emitir-nfe`).
- **Onde se emite:**
  - venda e faturamento de contrato (`/comercial/faturamento`);
  - transferência entre fazendas;
  - remessa e retorno de armazém;
  - remessa de máquinas;
  - devolução de compra.
- **Eventos:**
  - cancelamento;
  - carta de correção (CC-e), também no CT-e.
  - **Inutilização de numeração não existe:** procurei em `app/` e `lib/` e só há um texto de aviso.
- **DANFE em PDF:** no Monitor de NF-e Emitidas (`/fiscal`), com download.
- **Contingência:** a tela de emissão tem campos de contingência e o aviso do prazo de 168 horas para transmitir.
  O fluxo completo de contingência não foi confirmado.
- **Estados com endereço de SEFAZ configurado** (`lib/nfe/transmitter.ts`):
  - autorizador próprio: MT, SP, MG, RS (SVRS), PR, BA, PE, AM;
  - pela SVAN: AC, MA, PA, PI;
  - qualquer outra UF cai no SVRS (Sefaz Virtual do RS).
    - GO e MS, que têm autorizador próprio, **não estão configurados**: emissão nesses estados não confirmada.
- **Uso real:** todas as NF-e autorizadas em produção são de **MT** (69 autorizadas, 18 canceladas, 29 rejeitadas).
  Os demais estados nunca foram testados em produção.
- **Automático:**
  - CFOP e texto legal pela natureza da operação;
  - CST de ICMS pelo CFOP;
  - CFOP 5905 ou 6905 conforme a UF do destinatário;
  - local de entrega nas informações complementares;
  - consulta de cadastro (IE) na SEFAZ;
  - alerta de certificado A1 vencendo (robô diário).

### 4.2 Outros documentos emitidos
| Documento | Situação |
|---|---|
| **CT-e** (transporte) | Emissão real com assinatura e transmissão (`lib/cte`). Uso real em MT: 52 autorizados e 12 cancelados. Gera o contas a receber da transportadora e o contas a pagar do tomador quando é do mesmo cliente. |
| **MDF-e** (manifesto) | Emissão real, encerramento e cancelamento (`lib/mdfe`), com regra de CIOT. Uso real: 52 manifestos. |
| **GNRE** | Tela de registro e controle de guias (`/fiscal/gnre`). **Não transmite** ao portal GNRE; nenhuma guia registrada. |
| **NFS-e própria** (emitir nota de serviço) | **Não existe.** Só entrada de NFS-e de terceiros. |
| **NFC-e** e outros modelos | **Não existem** no código. |

### 4.3 Documentos recebidos (captura)
- **SIEG:** sincronização automática duas vezes ao dia mais o botão manual. Traz:
  - NF-e em que o cliente é destinatário;
  - NFS-e;
  - CT-e em que o cliente é o tomador (recurso de 27/10/2026);
  - eventos de cancelamento.
- **Classificação automática** dos itens da NF: regras do cliente e, quando nenhuma regra casa, sugestão por IA.
- **Manifestação do destinatário:** ciência, confirmação, desconhecimento e operação não realizada, via SIEG.
- **Entrada manual:** por XML ou chave de acesso.

### 4.4 Obrigações acessórias
| Obrigação | Situação |
|---|---|
| **LCDPR** | Gerador do arquivo no leiaute oficial 1.3 (registros 0000, 0010, 0030, 0040, 0050, Q100, Q200, 9999), com cadastro do contador. O registro 0045 (parceiros e condôminos) **não está implementado**. Tela `/lcdpr`. |
| **SPED ECD (contábil)** | Gera arquivo .txt (blocos 0, I e 9) a partir dos lançamentos e das contas contábeis das operações gerenciais. **Sem demonstrações contábeis** (J001 só marcador). Transmissão pelo PGE da Receita, fora do sistema. Uso real não confirmado. |
| **eSocial Rural** | Tela de eventos (`/fiscal/esocial`). **O botão Transmitir é simulado**: grava um protocolo fictício, não envia ao governo. Nenhum evento registrado. |
| **IBS/CBS (Reforma Tributária)** | **Simulação** de impacto com alíquotas configuráveis (`/ibs`). Não calcula nem emite tributos. |
| **Parcerias e grupos econômicos** | Tela de cadastro (`/parcerias`). Uso não confirmado. |

---

## 5. Inteligência artificial

Todas as funções usam modelos Claude, da Anthropic (a maioria o Claude Haiku). A transcrição de áudio usa o Whisper,
da OpenAI. As chaves de API estão configuradas em produção.

| Função | O que faz de fato | Onde | Status |
|---|---|---|---|
| **Olívia (suporte)** | Chat que responde dúvidas de uso do sistema com base no manual interno (`lib/conhecimento-olivia.ts`). Não executa ações nem consulta dados do cliente. | Janela flutuante, `/suporte` | Pronto (167 conversas) |
| **Classificação de itens de NF** | Quando nenhuma regra do cliente reconhece o item de uma NF importada, sugere a classificação com nível de confiança. Confiança alta ou média classifica sozinho; baixa fica pendente com sugestão. | Sincronização SIEG | Pronto |
| **Extração de cédula de crédito rural** (add-on) | Lê o PDF da cédula e preenche o contrato financeiro: credor, valores, datas, cronograma de parcelas e produtor (pelo CPF). | `/financeiro/contratos` | Pronto como recurso; uso não medido |
| **Extração de contrato de venda, pedido de compra e extrato de consórcio** (add-ons) | Lê o PDF e preenche o cadastro correspondente. | Contratos, Compras, Consórcios | Uso não confirmado |
| **Agente de WhatsApp** | Conversa livre, com o modelo escolhendo ferramentas, por texto, áudio ou foto. Consultas: contas a pagar e receber, saldo projetado, estoque, contratos, lavoura, arrendamentos, DRE, fluxo de caixa. Registros: abastecimento, operação de lavoura, conta a pagar e a receber, NF de compra (por foto), fornecedor, insumo, contrato de grãos, romaneio, recomendação agronômica. | `lib/whatsapp-claude.ts`, webhook `/api/whatsapp/webhook` (Evolution API) | Em teste. Código e chaves existem, mas não confirmei uso real (não encontrei tabela de mensagens com registros) |
| **Agente de implantação** | Conversa de onboarding do cliente pelo WhatsApp (Claude Sonnet). | `/admin/onboarding`, `/api/agente/implantar` | Em teste |
| **Sugestão de produtor em títulos sem produtor** | Ferramenta interna da equipe Raccolto. | `/admin/cp-produtor` | Interno |

**Não existe no código:**
- IA de recomendação agronômica;
- previsão de produtividade ou de preço;
- "análise preditiva" de custos.

---

## 6. Uso no campo

- **O Arato principal** é web e responsivo, usado pelo navegador no computador, tablet ou celular. **Não funciona
  offline.** Existe uma página "sem conexão" (`/offline`), mas não há fila de lançamentos offline neste repositório:
  o módulo de campo antigo que havia aqui foi removido.
- **App Campo** (produto separado, repositório `arato-campo`, endereço `campo.arato.agr.br`):
  - **Para quem:** operador de campo (tratorista, encarregado), com login por PIN.
  - **Formato:** app de celular instalável (PWA), com service worker.
  - **Offline:** sim. Os lançamentos ficam numa fila no aparelho (`localStorage`) e sincronizam quando há sinal,
    sem duplicar. Fotos também ficam guardadas offline.
  - **Telas:**
    - tarefas a partir de recomendações (pulverização, adubação, corretivo, plantio);
    - lançamentos avulsos (plantio, pulverização, adubação, corretivo, colheita);
    - abastecimento;
    - monitoramento;
    - aprovações do gerente de campo.
  - **Aprovação:** o lançamento do operador só vale depois de aprovado por um gestor.
  - **Venda:** vendido à parte, só para contas Arato existentes. Cobrança manual.
  - **Gestão de operadores:** feita pelo próprio cliente em Configurações → Usuários.
  - **Status:** em teste. Não confirmei uso real por operadores.

---

## 7. Usuários e acesso

- **Estrutura multiempresa e multifazenda:**
  - cada cliente é uma **conta**, que pode ter várias fazendas, vários produtores (CPF/CNPJ) e várias empresas;
  - as telas trabalham com o cliente inteiro, com seletor de fazenda quando o dado é de uma propriedade (estoque,
    talhões, notas);
  - quem tem mais de uma fazenda troca a fazenda ativa no topo da tela.
- **Perfis de acesso** (`components/AuthProvider.tsx`):
  - **usuário do cliente;**
  - **equipe Raccolto**, com níveis gestor, operacional e seletor, e acesso a vários clientes;
  - **BPO**, para escritórios que atendem vários clientes, com troca de cliente;
  - **assistente.**
- **Permissões:**
  - grupos de usuário com permissão por módulo e por ação: visualizar, criar, editar, excluir e aprovar, mais ações
    específicas como "reprocessar folha" (`/configuracoes/usuarios`);
  - limite de usuários por plano (2, 5 ou ilimitado).
- **Isolamento entre clientes:** feito por regras de segurança no banco (RLS do Postgres). Ver o risco na seção 13.

---

## 8. Integrações existentes

| Integração | Para quê | Situação |
|---|---|---|
| **SEFAZ** (webservices) | Emissão de NF-e, CT-e e MDF-e, eventos, consulta de cadastro | Em produção (MT) |
| **SIEG** (DFe Monitor) | Captura de NF-e, NFS-e e CT-e recebidos, eventos de cancelamento, manifestação | Em produção |
| **Banco Central** | PTAX (API Olinda) e taxas de referência (API SGS) | Em produção |
| **Yahoo Finance** | Cotações de Chicago (soja, milho, algodão) e milho B3 | Em produção (fonte não oficial e com atraso) |
| **AwesomeAPI** | Dólar comercial | Em produção |
| **Bancos** | Importação de extrato **OFX** para conciliação; código COMPE usado em arquivos | OFX em produção. **Não há integração direta com API de banco**, nem Open Finance, nem envio automático de CNAB |
| **Resend** (e-mail) | Alertas de vencimento (diário), relatório semanal (segunda-feira), cobrança | Chaves configuradas |
| **WhatsApp** (Evolution API) | Agente de IA e envio de relatórios | Chaves configuradas; uso real não confirmado |
| **Anthropic (Claude)** e **OpenAI (Whisper)** | IA (seção 5) | Configurado |
| **ViaCEP, BrasilAPI, ReceitaWS** | Endereço por CEP e dados por CNPJ | Em produção |
| **ANTT** | Consulta relacionada a frete e transportador (PEF) | Uso não confirmado |
| **Asaas** | Cobrança das mensalidades (PIX) | Código existe, mas **não há chave do Asaas configurada em produção**: cobrança automática não está ativa |
| **RustDesk** (servidor próprio) | Suporte remoto ao computador do cliente | Em produção |
| **B3** | Não há integração direta com a B3; a cotação de milho B3 vem do Yahoo Finance | — |

---

## 9. Segurança e dados

- **Autenticação:**
  - login com e-mail e senha e recuperação de senha por e-mail (Supabase Auth);
  - **não há autenticação em dois fatores** nem login por Google ou Microsoft.
- **Onde ficam os dados:** banco PostgreSQL no Supabase; arquivos (XML de notas, PDFs, certificados, backups) no
  armazenamento do Supabase. O sistema roda na Vercel.
- **Isolamento entre clientes:** regras de acesso por conta no banco (RLS). As tabelas mais sensíveis já foram
  corrigidas, mas outras ainda têm regras amplas (ver seção 13).
- **Certificado digital A1:** o arquivo fica num armazenamento privado. A **senha do certificado fica gravada nas
  configurações do cliente no banco, sem criptografia própria da aplicação**. Não encontrei criptografia em nível de
  aplicação no código; a criptografia em repouso do Supabase é da plataforma, não confirmada aqui.
- **Backup:**
  - automático diário de cerca de 40 tabelas principais, por fazenda, em arquivo JSON no armazenamento do Supabase;
  - **guardado por 5 dias**;
  - tela de backup e restauração, só para a equipe Raccolto.
  - Backups da própria plataforma Supabase dependem do plano contratado: não confirmado.
- **Auditoria:** registro de alterações (`audit_log`, 70 mil registros) e tela de auditoria. Há ainda verificações
  diárias de consistência dos dados (robô) e o painel "Saúde dos dados", da equipe Raccolto.
- **Exportação pelo usuário:** relatórios em PDF e Excel na maioria das telas de relatório; XML e DANFE das notas.
  **Não existe exportação completa dos dados do cliente** feita pelo próprio cliente.
- **LGPD:**
  - **não encontrei no código** política de privacidade, termos de uso, registro de consentimento, nem rotina de
    exclusão ou anonimização de dados pessoais a pedido do titular;
  - procurei por "LGPD", "privacidade", "termos" em `app/`, `components/` e `lib/`: só aparecem textos de permissão
    de usuário.

---

## 10. Planos, limites e cobrança

- **Planos** (`lib/planos.ts`; também há tabela de planos editável no painel admin):

| Plano | Preço mensal | Usuários | O que inclui |
|---|---|---|---|
| **Essencial** | R$ 387 | 2 | Cadastros, lavoura (plantio, pulverização, colheita, planejamento), contas a pagar e receber |
| **Gestão** | R$ 1.197 | 5 | Tudo do Essencial + comercialização, expedição, arrendamento, compras, NF de entrada (produtos e serviços), DRE e custos, financeiro completo (tesouraria, seguros, contratos financeiros, apoio financeiro), CT-e e MDF-e, usuários |
| **Performance** | R$ 1.787 | Ilimitado | Tudo do Gestão + emissão de NF-e, SPED e LCDPR, eSocial, automações, agente WhatsApp |

- **Teste grátis:** 14 dias, sem cartão. A página pública de planos está em `/planos`, e o cadastro em `/cadastro`.
- **Add-ons vendidos à parte**, habilitados por conta em `/admin/modulos`:
  - com tela: Algodão, Apoio Financeiro, IA de cédula, IA de contrato de venda, IA de pedido de compra, IA de
    consórcio e Proteção de Margem & Hedge;
  - **sem tela: Cerealista, Sementes e Pecuário.**
- **Cobrança:**
  - há robô diário de inadimplência e geração de cobrança via Asaas, com PIX;
  - **a chave do Asaas não está configurada em produção**, então a cobrança automática não está funcionando hoje;
  - o App Campo e os add-ons de IA são cobrados manualmente pelo consultor.
- **Atenção para o marketing:**
  - o plano Performance promete "eSocial Rural", mas a transmissão do eSocial é simulada (seção 4.4);
  - "Agente WhatsApp" está em teste (seção 5).

---

## 11. Stack técnica e hospedagem

- **Código:** Next.js 16 (App Router), React 19, TypeScript.
- **Interface:** estilos próprios, sem biblioteca de UI. Mapas com Leaflet, PDF com jsPDF, Excel com SheetJS.
- **Dados:** banco PostgreSQL e autenticação no Supabase.
- **Hospedagem:** Vercel, com 11 rotinas automáticas agendadas (cron).
- **Fiscal:** assinatura e transmissão escritas no próprio sistema (xml-crypto, node-forge), sem biblioteca fiscal
  terceirizada.
- **Endereços:**
  - sistema: `web.arato.agr.br`;
  - App Campo: `campo.arato.agr.br`;
  - hotsite de vendas: `www.arato.agr.br` e `arato.agr.br`. Em 27/10/2026, o `arato.agr.br` ainda apontava para uma
    versão antiga do sistema, em correção.

---

## 12. Diferenciais visíveis no código

1. **Captura automática de notas pelo SIEG**, com NF-e, NFS-e e CT-e de frete chegando sozinhos, classificação
   automática dos itens (com IA de apoio) e aviso quando o fornecedor cancela a nota.
2. **Emissão fiscal própria** de NF-e, CT-e e MDF-e, com transmissão direta à SEFAZ, em uso real em MT.
3. **Conciliação bancária** que entende borderô (vários títulos num pagamento só) e pagamento parcial.
4. **Pagamento parcial que divide o título**, inclusive no borderô: cada pagamento vira um título com o valor
   exato, o que facilita a conciliação.
5. **Multiempresa e multifazenda de verdade:** produtor pessoa física e empresas do grupo no mesmo cliente, com
   financeiro separado por empresa e LCDPR por produtor.
6. **Visão de dívida completa:** contratos financeiros com cronograma (inclusive leitura do PDF da cédula por IA),
   consórcios, seguros, endividamento por vencimento com conversão pela PTAX.
7. **Comercialização ligada ao resto:** contrato → faturamento com NF-e → expedição com CT-e e MDF-e → contas a
   receber. Arrendamento e compra de terra pagos em sacas viram compromissos em grãos.
8. **Ferramenta de margem** (add-on), que separa Chicago, prêmio, câmbio e frete, com percentual fixado por
   componente, matriz de sensibilidade e busca de margem.
9. **Previsão de gastos** (previsto × realizado) e folha de pagamento integradas ao contas a pagar.
10. **App Campo separado com modo offline** e aprovação do gestor.
11. **Assistente Olívia** dentro do sistema e changelog aberto ao cliente.

---

## 13. Limitações e riscos — não prometer no marketing

1. **eSocial:** a transmissão é simulada. Não prometer "envio do eSocial".
2. **IBS/CBS:** é só simulação de impacto.
3. **GNRE:** só registro de guias, sem emissão nem transmissão.
4. **NF-e fora de MT:** só MT foi usado em produção. GO e MS não têm o autorizador configurado (cairiam no SVRS e
   devem falhar). Outros estados estão configurados, mas nunca foram testados.
5. **Não emite NFS-e nem NFC-e, e não faz inutilização de numeração de NF-e.**
6. **Sem integração bancária direta** (API de banco, Open Finance, envio de CNAB): a conciliação é por importação
   de arquivo OFX.
7. **CEPEA e prêmio implícito** não são buscados automaticamente. Chicago vem do Yahoo Finance, com atraso de cerca
   de 15 minutos e sem garantia de fonte oficial.
8. **O Arato principal não funciona offline.** O offline é só no App Campo.
9. **Agente de WhatsApp e agente de implantação:** em teste, sem uso real confirmado.
10. **Cerealista, Sementes e Pecuário:** não existem. Triangulação de NF: tela desabilitada.
11. **Cobrança automática:** desligada (Asaas sem chave em produção).
12. **Segurança:**
    - sem login em dois fatores;
    - a senha do certificado A1 fica no banco sem criptografia da aplicação;
    - cerca de 70 tabelas ainda têm regra de acesso ampla entre usuários autenticados (as mais sensíveis já foram
      corrigidas; está em anotação interna, não reconferi tabela por tabela agora).
    - Não prometer "certificação de segurança" nem "criptografia de ponta a ponta".
13. **LGPD:** não há política de privacidade, termos de uso, consentimento nem rotina de exclusão no sistema.
14. **Backup:** guardado por apenas 5 dias e só das tabelas principais.
15. **Exportação completa dos dados pelo cliente:** não existe.
16. **Módulos com pouco uso real** (tratar como novidade ou em validação):
    - plantio, colheita própria e romaneio de colheita;
    - expedição;
    - pluviometria, pragas, recomendações, mapa e aplicação aérea;
    - orçamento de safra;
    - algodão;
    - hedge;
    - remessas e retornos;
    - CT-e de entrada;
    - mútuos e aplicações.
17. **SPED ECD:** gera o arquivo sem demonstrações contábeis. O uso real não está confirmado.
18. **Status geral:** o próprio projeto registra que a emissão de NF-e deve começar em homologação para cliente novo.
    Há clientes reais usando o financeiro e o fiscal de entrada, mas a escala ainda é pequena (11 contas).

---

## 14. Telas para fotografar

**Principais (sugestão de prioridade para o site)**

| # | Tela | Caminho |
|---|---|---|
| 1 | Início (cotações e busca) | `/` |
| 2 | Documentos fiscais (notas capturadas pelo SIEG) | `/fiscal/documentos` |
| 3 | Contas a pagar (grid, borderô) | `/financeiro/pagar` |
| 4 | Conciliação bancária | `/financeiro/conciliacao` |
| 5 | Endividamento | `/financeiro/endividamento` |
| 6 | Contratos de grãos | `/contratos` |
| 7 | Faturamento / NF-e de saída | `/comercial/faturamento` |
| 8 | Monitor de NF-e emitidas e DANFE | `/fiscal` |
| 9 | CT-e e MDF-e | `/transporte/cte`, `/transporte/mdfe` |
| 10 | DRE agrícola e custos | `/custos?aba=dre`, `/custos?aba=custoha` |
| 11 | BI (painel executivo) | `/bi` |
| 12 | Proteção de margem (precificador e sensibilidade) | `/comercial/hedge` |
| 13 | Pulverização | `/lavoura/pulverizacao` |
| 14 | Estoque e kardex | `/estoque`, `/estoque/kardex` |
| 15 | Folha de pagamento | `/financeiro/folha` |
| 16 | Contratos financeiros (com leitura da cédula) | `/financeiro/contratos` |
| 17 | LCDPR | `/lcdpr` |
| 18 | Olívia (janela de suporte) | qualquer tela |
| 19 | Planos (página pública) | `/planos` |
| 20 | App Campo (celular) | `campo.arato.agr.br` |

**Lista completa por área**

- **Cadastros:** `/cadastros`. Abas por `?tab=`:
  - pessoas, produtores, fazendas, funcionarios, empresas, imoveis_urbanos;
  - insumos, produtos, itens, depositos, combustivel, grupos_insumo, culturas, principios_ativos, unidades_medida;
  - maquinas, benfeitorias, bens;
  - contas_bancarias, centros_custo, historico_fiscal, formas_pagamento;
  - safras, padroes_classificacao.
- **Produção:**
  - planejamento e operações: `/lavoura/planejamento`, `/lavoura/plantio`, `/lavoura/adubacao`, `/lavoura/correcao`,
    `/lavoura/pulverizacao`, `/lavoura/aerea`, `/lavoura/tratamento-sementes`;
  - monitoramento: `/mapa`, `/lavoura/recomendacoes`, `/lavoura/execucao`, `/lavoura/pragas`, `/lavoura/pluviometria`;
  - colheita e máquinas: `/lavoura/colheita`, `/estoque/romaneio-entrada`, `/estoque/abastecimento`,
    `/relatorios/manutencao`;
  - relatório e algodão: `/lavoura/relatorios/aplicacoes`, `/algodao`.
- **Documentos fiscais:**
  - `/fiscal/documentos`, `/fiscal/notas-proprias`;
  - `/fiscal/remessas`, `/fiscal/retornos`;
  - `/fiscal/relatorio-processamento`, `/fiscal/relatorio-canceladas`, `/fiscal/manifestacao`.
- **Comercial e logística:**
  - compras e estoque: `/compras`, `/relatorios/pedidos-compra`, `/estoque`, `/estoque/kardex`, `/estoque/graos`,
    `/estoque/transferencias`;
  - comercialização: `/contratos`, `/contratos/migrar-nf`, `/contratos/compromissos-graos`, `/contratos/compra-terra`,
    `/contratos/arrendamento`, `/comercial/faturamento`, `/comercial/hedge`;
  - expedição e transporte: `/expedicao`, `/relatorios/romaneios`, `/transporte/acerto-frete`, `/transporte/cte`,
    `/transporte/mdfe`, `/transporte/cadastros`, `/balanca/pesagem-avulsa`;
  - pendências: `/financeiro/pendencias-nf`.
- **Financeiro:**
  - contas e folha: `/financeiro/pagar`, `/financeiro/receber`, `/financeiro/adiantamentos`, `/financeiro/folha`,
    `/financeiro/previsoes`, `/empresas/folha`, `/empresas/pagar`, `/empresas/receber`;
  - tesouraria: `/financeiro/tesouraria`, `/financeiro/tesouraria/operacoes`, `/financeiro/tesouraria/mutuo`,
    `/financeiro/aplicacoes`, `/financeiro/conciliacao`;
  - relatórios e dívidas: `/financeiro/relatorios`, `/relatorios/financeiro-classificacao`, `/financeiro/endividamento`,
    `/financeiro/contratos`, `/financeiro/apoio`, `/financeiro/seguros`, `/financeiro/consorcios`;
  - cartões e empresas: `/financeiro/cartoes`, `/financeiro/pagar/faturas`, `/financeiro/empresas`.
- **Fiscal:**
  - `/fiscal` (monitor e certificado), `/fiscal/pendencias`, `/fiscal/gnre`, `/fiscal/triangulacao` (desabilitada);
  - `/lcdpr`, `/fiscal/sped-contabil`, `/fiscal/esocial`, `/ibs`, `/parcerias`.
- **Resultados:** `/custos` (abas dre, custostotais, custoha, produtividade), `/relatorios/dre`, `/configuracoes/rateio`.
- **BI e controle:**
  - `/bi`, `/controller`, `/pendencias/operacionais`;
  - `/auditoria/classificacao`, `/auditoria/safra-ciclo`.
- **Configurações:**
  - `/configuracoes/modulos`, `/configuracoes/operacoes-gerenciais`, `/configuracoes/plano-contas`;
  - `/configuracoes/classificacao`, `/configuracoes/financeiras/taxas`, `/configuracoes/contabilidade`;
  - `/configuracoes/usuarios`, `/configuracoes/auditoria`.
  - Só equipe Raccolto: `/configuracoes/integracoes`, `/configuracoes/automacoes`, `/configuracoes/importacao`,
    `/configuracoes/backup`, `/configuracoes/bot`.
- **Ajuda:** `/atualizacoes`, `/learning`, `/suporte`, `/ajuda/suporte-remoto`.
- **Públicas:** `/planos`, `/cadastro`, `/login`.
- **Equipe Raccolto (não fotografar para o cliente):**
  - `/admin`, `/admin/clientes`, `/admin/modulos`, `/admin/planos`, `/admin/faturamento`;
  - `/admin/onboarding`, `/admin/saude-dados`, `/admin/campo`, `/admin/logs`, `/admin/manual`;
  - `/bpo/admin`, `/seletor-cliente`, `/raccotlo`.

> Dica: use a conta de demonstração (Fazenda Agape) para as fotos, para não expor dados de clientes reais.
