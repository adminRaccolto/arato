/**
 * Manual Operacional do Arato — Olívia
 * Gerado a partir do mapa real do TopNav e das páginas existentes.
 * Atualizar sempre que uma tela for criada, removida ou renomeada.
 * Última revisão: 16/09/2026 (g)
 */

export const MANUAL_OPERACIONAL = `
# Manual Operacional — Arato
Versão: setembro/2026 (rev. 14/09)

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

**Botão Voltar:** no canto superior esquerdo do topo, ao lado da logo, em toda tela do sistema (exceto no Dashboard) — leva direto pra tela anterior, sem precisar navegar pelo menu de novo.

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

**Ano Safra é da conta, não da fazenda:** um mesmo "Ano Safra" (ex: "2026/2027") vale para todas as fazendas do cliente — não é preciso recriar por propriedade. Se o Ano Safra não aparecer no seletor ao registrar uma operação, o ciclo provavelmente não está vinculado ao ano safra certo.

Os Ciclos cadastrados dentro de um Ano Safra também aparecem para qualquer fazenda da mesma conta, não só para a fazenda que estava ativa quando o ciclo foi criado — um ciclo cadastrado em uma propriedade aparece normalmente ao consultar o mesmo Ano Safra estando em outra fazenda do grupo.

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

Registra aplicações de fertilizantes sólidos ou líquidos antes ou durante o plantio. Gera baixa de estoque do(s) fertilizante(s) usado(s) — não cria CP nova (o custo já entrou via a NF de compra do insumo; o custo pro DRE/Custos Totais vem do valor da baixa de estoque, não de um lançamento financeiro novo).

Bug corrigido em 15/09/2026: a baixa de estoque dessa operação não estava sendo gravada no histórico (Kardex) nem entrando no custo do DRE/Custos Totais desde 08/09 — o saldo do insumo sempre esteve certo, só o rastro/custo é que sumia. Corrigido, com backfill das baixas que faltaram.

### 3.3 Correção de Solo
**Caminho:** Lavoura → Operações de Campo → Correção de Solo

Registra aplicações de calcário, gesso e corretivos de solo. Gera baixa de estoque do(s) insumo(s) — mesma lógica da Adubação de Base acima, sem CP nova (custo já contabilizado na compra).

Mesmo bug e mesma correção de 15/09/2026 descrita em Adubação de Base (3.2) — também afetava Correção de Solo.

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

**Seletor de veículo/máquina vazio em conta com várias fazendas (correção 18/09/2026):** máquina é cadastrada numa fazenda só, mas o seletor (na Apropriação Direta de NF, aqui mesmo, em Seguros, Contratos Financeiros etc.) só listava as da fazenda ativa de quem está vendo a tela — em conta com várias fazendas, um seletor podia aparecer vazio mesmo a conta tendo centenas de máquinas cadastradas em outra fazenda. Corrigido: a lista agora busca em todas as fazendas da conta.

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

**Avanço automático de status:** em pedido "Fiscal" (vinculado a NF, aba "NFs Vinculadas"), o status avança sozinho para "Parcialmente Entregue"/"Entregue" ao processar uma NF de Produtos vinculada — não precisa de nenhuma ação manual. Estornar ou excluir a NF reverte o status automaticamente.

**Encerrar Pedido (ajuste de divergência):** pedido "Parcialmente Entregue" ganha o botão "🔒 Encerrar Pedido" dentro do modal Entregas/NFs Vinculadas. Abre uma tela com o saldo em aberto de cada item (pré-preenchido pra cancelar o resíduo inteiro) e um campo de motivo obrigatório — pensado pra pequenas divergências reais (peso de carga na balança, casas decimais), não pra cancelar entregas grandes. Ao confirmar: cancela o saldo escolhido por item (soma em cima do que já estava cancelado, nunca sobrescreve — não mexe no que já foi entregue), grava o motivo na observação do pedido com carimbo de data, e o pedido fecha como "Entregue". Item com saldo maior que 5% do pedido aparece com aviso em vermelho — não bloqueia, só chama atenção antes de confirmar algo grande demais.

**Atenção:** Pedidos com NFs de entrada vinculadas não podem ser excluídos — use status "Cancelado".

**Centro de Custo no lançamento de itens:** a lista de Centros de Custo mostrada ao lançar um item é da conta inteira (todas as fazendas do cliente), não só da fazenda ativa no momento — importante em contas com mais de uma fazenda, onde cada uma pode ter seus próprios centros de custo cadastrados.

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

**Filtro por Produtor:** em contas com mais de um produtor cadastrado, o filtro "Produtor" aparece na barra de filtros (mostra nome + CPF/CNPJ, útil quando há nomes parecidos). A busca por texto também aceita CPF/CNPJ digitado (com ou sem pontuação), além de número e nome do emitente. O filtro casa pelo CPF/CNPJ do destinatário da nota — funciona corretamente mesmo se o mesmo produtor tiver mais de um cadastro na tela de Produtores (duplicado por nome diferente com o mesmo documento).

**Produto obrigatório por item:** todo item que vai para o estoque (ou VEF/remessa/estoque de terceiros) precisa estar associado a um insumo ou princípio ativo do catálogo antes de clicar em "Processar" — sem isso o sistema bloqueia o processamento com uma mensagem indicando qual item falta associar. Antes o item sem associação era só um aviso e ficava de fora silenciosamente (a NF processava com valor de itens maior que o efetivamente lançado no estoque/CP). Item que não é produto de estoque (frete, taxa, serviço embutido na NF) usa o toggle "💸 C. Custo" em vez de "📦 Estoque" — esse não exige produto, só centro de custo.

**Conversão de Unidade nunca altera a NF original:** quando um item vem numa embalagem que precisa de conversão pra entrar certo no estoque (ex: "1X20L" — 1 unidade = 20 litros), o sistema converte a quantidade só para o lançamento no estoque. A quantidade e o preço por unidade **como o fornecedor emitiu** ficam guardados separadamente e nunca são sobrescritos pela conversão — importante porque uma NF de Devolução contra essa NF precisa bater com o documento original do fornecedor, não com o valor já convertido. Ao devolver, a tela mostra "NF original: X un" como referência abaixo do nome do produto sempre que o item teve conversão — use isso pra conferir contra a nota física antes de informar a quantidade a devolver (que continua sendo em unidade de estoque, igual à coluna "Unidade").

**Produto duplicado no pedido vinculado (17/09/2026):** quando o pedido de compra tem o mesmo produto em mais de uma linha (embalagens diferentes, ou valor fiscal por unidade diferente), a tela de Itens & Processamento mostra um segundo select "⚠ qual linha do pedido?" abaixo do produto, listando cada linha candidata com quantidade/saldo — obrigatório escolher antes de processar. Sem essa indicação, o sistema não sabia qual linha específica a NF estava atendendo e replicava o mesmo percentual de entrega nas duas (uma passava de 100%, a outra ficava travada em 0% mesmo recebendo produto de verdade). Produto sem ambiguidade (só uma linha daquele produto no pedido) continua funcionando exatamente como antes, sem pedir nada a mais.

**Apropriação Direta unificada, Centro de Custo removido da entrada de estoque (correção 17/09/2026):** existiam dois jeitos de lançar um item sem entrada no estoque — o tipo de entrada "Apropriação Direta" (NF inteira) e um toggle "📦 Estoque / 💸 C. Custo" por item dentro do modo "Insumos / Estoque" (que também pedia Centro de Custo por item, com os modos "Global" e "Por produto"). Os dois caminhos e o toggle por item foram removidos — agora só existe o tipo de entrada "Apropriação Direta" pra isso. Além disso, item que vai pro estoque (qualquer modo) não pede mais Centro de Custo: a apropriação de custo é no consumo (quando o insumo sai do estoque pra uma operação de plantio/pulverização/adubação, já vinculada a um talhão/ciclo), não na compra — um mesmo lote pode até ser usado em mais de um talhão depois, então não tem como saber o CC certo no momento da entrada. O Centro de Custo continua existindo normalmente pros outros tipos de entrada (Apropriação Direta, Peças, VEF, Remessa) e como tag financeira do CP no cabeçalho da NF.

**A Operação Gerencial decide o modo do item; CC obrigatório (18/09/2026):** o checkbox "É combustível?" e a exigência de marcar o Centro de Custo como "manutenção de máquinas" foram removidos — agora é a Operação Gerencial escolhida no cabeçalho (obrigatória antes de avançar para os itens) que decide como cada item é lançado, já que uma NF é sempre homogênea (nota de posto = combustível; nota de peças = manutenção; nota de mercado = outra categoria qualquer): **OG marcada "Combustível e Lubrificantes"** → item só pede o veículo que abasteceu; **OG marcada "Manutenção e Reparos"** → item permite ratear entre várias frotas por percentual, sempre somando 100%; **qualquer outra OG** → item pede o Centro de Custo, que agora é **obrigatório** (antes era opcional, ficava "sem CC"). A marcação "Combustível e Lubrificantes" é feita na própria Operação Gerencial (Configurações → Operações Gerenciais) — as duas OGs padrão do catálogo global já vêm marcadas; se você criou uma OG própria de combustível, marque essa opção nela.

**Aplicar Centro de Custo a todos os itens de uma vez (18/09/2026):** em Apropriação Direta / Peças / VEF / Remessa, depois de escolher o CC no bloco "Centro de custo do lançamento" (Passo 2 — Itens), aparece o botão "↓ Aplicar este centro de custo a todos os itens" — preenche o CC de cada item da NF numa tacada só, em vez de repetir a mesma seleção item por item (comum em NF de mercado com 20+ itens do mesmo CC). Item que precisa de um CC diferente pode ser ajustado individualmente depois, sem perder o que já foi preenchido nos outros.

**Centro de Custo no Passo 2 e frota opcional (21/09/2026):** o seletor de Centro de Custo saiu do Passo 1 (Cabeçalho) e passou para o topo do Passo 2 — Itens, sempre visível — o checkbox "Vincular a um centro de custo?" foi removido. A ideia é decidir o CC vendo os itens da NF, já que é isso que mostra se é ou não apropriação direta. O processo é o mesmo de antes. Na Apropriação Direta de manutenção, o rateio por frota deixou de ser obrigatório: o operador decide se informa a máquina. Sem máquina, o custo entra normalmente no CC de Manutenção de Máquinas, mas não aparece no relatório de custo por frota. Se informar máquinas, o rateio ainda precisa somar 100%; linhas em branco são ignoradas. Em combustível, o veículo continua obrigatório (alimenta o histórico de abastecimento).

**Apropriação Direta nunca exige produto do catálogo (correção 18/09/2026):** um item de NF do tipo Apropriação Direta estava caindo, em alguns casos (item importado de XML/SIEG, ou NF que trocou de tipo depois de criada), no mesmo bloqueio da entrada "Insumos/Estoque" — "associe um insumo ou princípio ativo do catálogo antes de processar". Não devia: Apropriação Direta é justamente o tipo de NF pra lançar despesa sem vincular a produto de estoque (combustível, manutenção, centro de custo). Corrigido — item de Apropriação Direta nunca exige produto, em nenhum caso.

**Combustível na Apropriação Direta agora alimenta o histórico de abastecimento do veículo (18/09/2026):** ao marcar o item como combustível (OG "Combustível e Lubrificantes"), além do veículo, agora também é pedido o hodômetro/horímetro — data, tipo de combustível, valor por litro e valor total já vêm da própria NF. Ao processar, o sistema lança um registro no histórico de abastecimento do veículo (mesma tabela que o abastecimento pela bomba em Lavoura → Máquinas usa) com a quantidade em litros e o valor, e atualiza o horímetro/hodômetro atual da máquina — sem precisar lançar esse abastecimento de novo manualmente. Corrigido também: a OG "GASTO COMBUSTÍVEL - CUSTO FAZENDA" (usada por vários clientes pra combustível comprado direto no posto) não estava marcada como "Combustível e Lubrificantes" — corrigida.

**Combustível por veículo e rateio de peças entre frotas, na Apropriação Direta (17/09/2026):** no item de uma NF do tipo Apropriação Direta, o checkbox "⛽ É combustível?" abre um seletor de veículo — pra diesel/combustível comprado direto no posto (não vem numa bomba/estoque próprio da fazenda, então não é o mesmo fluxo do abastecimento pela bomba em Estoque). É só marcação pra controle de custo por frota — não gera nenhuma movimentação de estoque nem baixa de bomba. Separadamente, quando o Centro de Custo escolhido no item é de manutenção de máquinas, aparece um editor de "Rateio de custo por frota": adiciona quantas máquinas quiser, cada uma com um percentual manual do valor do item — o rateio precisa somar exatamente 100% pra processar a NF (deixe o rateio vazio se não quiser vincular a nenhuma máquina). Cada máquina do rateio gera seu próprio registro no histórico de manutenção, já com o custo proporcional ao percentual — aparece em Relatórios → Manutenção, agrupado por máquina, junto com o restante do custo de manutenção da frota.

### 8.3 NF de Serviços (NFS-e)
**Caminho:** Compras & Estoque → Compras → NF de Serviços

**Mesma lista de Operações Gerenciais da NF de Produtos (21/09/2026):** o seletor de Operação Gerencial da NF de Serviços mostrava só as operações marcadas como "permite NF" (cerca de 30% do plano), enquanto a NF de Produtos e Contas a Pagar mostravam todas as despesas que permitem CP/CR — por isso serviços como Domínio/Hospedagem, Deslocamento/Viagem ou Assessorias não apareciam ao lançar uma NFS-e. As duas notas agora usam exatamente a mesma lista (a O.G. escolhida na nota vira a O.G. do CP), buscando em todas as fazendas da conta, e o seletor da NF de Serviços ganhou busca por texto.

Lança notas fiscais de serviços recebidos (NFS-e). Completamente separado da NF de produtos.

**Wizard 3 passos:** Prestador → Serviço (código LC 116/2003, discriminação, valor) → Tributação (ISS, retenções federais: PIS, COFINS, CSLL, IRRF, INSS).

**Tomador do serviço:** normalmente é a própria fazenda/produtor que contratou (advogado, agrônomo, contador), não um terceiro do cadastro de Pessoas — o sistema busca automaticamente em Produtores e Empresas pelo CNPJ/CPF antes de cair no cadastro de Pessoas.

**Filtro por Produtor/Tomador:** em contas com mais de um produtor, o filtro "Produtor/Tomador" aparece na barra de filtros; a busca por texto também aceita CPF/CNPJ do tomador ou do prestador.

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

Histórico filtrado de movimentações do produto selecionado, com as mesmas colunas Origem e Usuário do Kardex. A coluna "NF" mostra o número real da nota (não mais o código interno) — resolvida a partir da NF de entrada vinculada à movimentação.

### 9.3b Saldo por Lote
**Caminho:** Compras & Estoque → Estoque → Relatórios → Saldo por Lote

Consulta o saldo de uma semente por lote — escolha a semente (e opcionalmente um depósito) e clique em Buscar. Mostra, por lote: entradas, saídas, saldo atual e data da última movimentação. Antes essa informação só aparecia embutida nos seletores de lote (transferência, plantio, tratamento de sementes); agora também dá pra consultar direto.

O seletor de semente lista as de **todas as fazendas da conta** (não só a fazenda selecionada no topo da tela) — mostra o nome da fazenda ao lado quando há mais de uma, já que lote de semente é rotineiramente transferido entre propriedades.

### 9.4 Transferências entre Fazendas
**Caminho:** Compras & Estoque → Estoque de Insumos → Transferência entre Fazendas

Registra movimentação de insumos entre fazendas da mesma conta com emissão de NF de transferência.

**Fluxo em 2 etapas:**
1. Clique em **+ Nova Transferência**, preencha origem, destino, CFOP, itens e salve → a transferência fica como **Rascunho**.
2. Na tabela, revise os dados e clique em **Emitir NF** para emitir a nota. Após emitida, o botão muda para **DANFE** e **Confirmar Entrada** (se entrada não for automática).

**CFOP:** selecionável entre 5 opções; padrão é 5152/6152 (mercadoria adquirida de terceiros, sem ST). O prefixo 5 (mesmo estado) ou 6 (inter-estadual) é calculado automaticamente pelos estados das fazendas.

**Transportadora e veículo:** os campos de transportadora/placa preenchidos na transferência aparecem de verdade na NF e no DANFE.

**Botões na tabela por status:**
- Rascunho: Visualizar · **Emitir NF** · Cancelar
- Emitida: Visualizar NF · DANFE · Confirmar Entrada (se não automático) · Cancelar
- Entrada Confirmada / Cancelada: Visualizar NF

**CNPJ/CPF e IE do Destinatário:** vêm pré-preenchidos com o cadastro fiscal da fazenda de destino, mas são editáveis — a entrada pode ser numa IE diferente da do produtor responsável pelo depósito. Os dois campos são de texto livre com sugestão (aceitam digitar qualquer coisa): o CNPJ/CPF sugere os produtores cadastrados na conta; ao digitar/escolher um documento que bate com um produtor, o campo IE passa a sugerir as IEs daquele produtor já mostrando o município de cada uma — útil quando o mesmo produtor tem IEs em municípios diferentes.

**CNPJ/CPF e IE do Emitente (Origem):** mesmo padrão do Destinatário, só que do lado de quem emite. Vêm pré-preenchidos com o titular padrão cadastrado na fazenda de origem, mas são editáveis — a fazenda é só o local físico do estoque, não necessariamente quem responde fiscalmente por aquela transferência específica (ex: fazenda arrendada, depósito compartilhado entre produtores).

**Cancelar uma transferência:**
- Se a NF ainda não foi autorizada pela SEFAZ (rascunho): cancela direto, sem exigências.
- Se a NF já foi autorizada: pede uma justificativa (mínimo 15 caracteres) e envia o **cancelamento oficial à SEFAZ** — só depois de confirmado, o sistema reverte o estoque (devolve o saldo pro depósito de origem, e desfaz a entrada no destino se houve). Sem isso a nota continuaria valendo do lado de fora mesmo cancelada aqui dentro.
- **Prazo:** só é possível cancelar dentro de **24h** da autorização (regra da SEFAZ). Depois disso, o sistema bloqueia e é preciso emitir uma NF de devolução/estorno pra reverter a operação, ou uma Carta de Correção para erros simples de cadastro.

**NF já emitida no sistema anterior (implantação, 17/09/2026):** no modal de Nova Transferência, checkbox "📋 Esta NF de remessa já foi emitida no sistema anterior" — libera campos pra informar nº da NF, série, chave de acesso (opcional) e data de emissão reais. Ao salvar, cria só a movimentação de estoque (saída origem + entrada destino) com esses dados históricos — nunca chama a SEFAZ, nunca passa pelo fluxo normal Rascunho → Emitir NF. Uso: cliente que migrou pro Arato e já tinha remessas emitidas no ERP antigo antes da implantação.

### 9.4 Abastecimento de Máquinas
**Caminho:** Produção → Máquinas (submenu) → Abastecimento de Máquinas

Registra abastecimentos de combustível por máquina, com baixa automática no estoque. Depois de passar por Suprimentos → Estoque de Grãos e pelo topo do menu Produção, ficou reunido dentro do submenu "Máquinas" (junto de Máquinas e Veículos, Manutenções e Custos por Máquina) — esse submenu aparece com uma seta ▶ no menu Produção.

**Campo Safra/Ciclo:** cada abastecimento pode ser vinculado a um Ano Safra e Ciclo (mesmo seletor em cascata usado em outras telas — Ciclo filtra pelo Ano Safra escolhido). Serve pra separar o custo de combustível por safra no Orçamento Planejado × Realizado; aparece como coluna no histórico. Campo opcional — abastecimento sem vínculo continua funcionando normalmente.

**Seleção de Máquina com busca:** o campo "Máquina" no formulário permite digitar para filtrar a lista (mesmo componente usado em Financeiro e NF de Produtos) — antes era um select comum sem busca.

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

**Adiantamentos de cliente:** dentro do contrato, aba Adiantamentos — registra um valor recebido do comprador antes da entrega. Gera um CR já baixado (é dinheiro que já entrou de fato) e fica disponível pra abater automaticamente (FIFO, do adiantamento mais antigo primeiro) contra o CR de cada romaneio/entrega futura do mesmo contrato.

**Correção 18/09/2026:** o CR gerado por um adiantamento de cliente estava sendo gravado com status "liquidado" — valor que não existe no sistema — e por isso nunca aparecia em nenhuma tela que lê status baixado/parcial: Contas a Receber, Conciliação Bancária e o Livro Caixa do LCDPR. Corrigido pra gravar como "baixado", com data e valor do recebimento — agora entra no LCDPR como receita na data em que o dinheiro de fato entrou.

### 11.2 Compromissos em Grãos
**Caminho:** Comercial & Logística → Comercialização → Compromissos em Grãos

Relatório read-only de contratos de grãos originados de arrendamentos, compras de terra e barter. Mostra KPIs totais e por commodity com barra de progresso de entrega.

### 11.3 Faturamento / NF-e de Saída
**Caminho:** Comercial & Logística → Comercialização → Faturamento / NF-e de Saída

Emissão de NF-e de venda de grãos. Integrada com contratos — ao emitir gera CR automaticamente.

**Seletor de Safra/Ano vazio em conta com várias fazendas (correção 18/09/2026):** o seletor "Safra / Ano" na NF-e Avulsa só listava as safras cadastradas na fazenda emitente escolhida — em conta com várias fazendas, se as safras foram cadastradas noutra fazenda da mesma conta, o seletor aparecia vazio mesmo elas existindo. Corrigido pra buscar em toda a conta.

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

**Correção 17/09/2026 — pagamento manual em BRL não lançava CP:** "Gerar Parcelas" (o gerador em lote, por safra) já lançava o CP normalmente. Mas adicionar ou editar uma parcela BRL manualmente (aba Pagamentos → "+ Novo Pagamento" ou editar uma existente) só salvava a parcela nesta tela — nunca criava o lançamento em Contas a Pagar, mesmo pra contratos em dinheiro. Corrigido: salvar uma parcela BRL manual agora cria (ou, se já tiver, atualiza) o CP correspondente, com status refletindo o status escolhido na tela (Pendente→Em aberto, Pago→Baixado, Parcial→Parcial).

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

**Aviso de título já lançado (17/09/2026):** ao salvar um lançamento manual com o mesmo fornecedor/cliente (mesma pessoa cadastrada) e o mesmo número de documento de um título já existente (não cancelado) na mesma fazenda, o sistema mostra "Título já lançado" antes de salvar, com botão "OK" (cancela e volta pro formulário) e "Ver documento" (abre o lançamento existente pra conferir). Só funciona quando o fornecedor/cliente está vinculado via cadastro — lançamento sem pessoa vinculada (só descrição em texto livre) não tem como ser comparado. NFs, Pedidos de Compra e parcelas de Contrato Financeiro/Seguro/Consórcio (lançados automaticamente) não passam por esse aviso — já têm seu próprio controle de duplicidade.

**Entidade Contábil no lançamento (17/09/2026):** campo "Entidade Contábil (LCDPR/SPED)" no formulário — "Padrão da fazenda" (comportamento de sempre), "Pessoa Física" ou "Pessoa Jurídica". Decide se esse título entra no LCDPR (PF) ou no SPED ECD (PJ) — pela origem cadastrada do título, nunca pela conta bancária usada na baixa/recebimento. Use quando uma CP/CR de origem PF for paga/recebida pela conta ou fluxo de uma fazenda PJ (ou o contrário) — sem esse campo, o sistema sempre herdava a entidade da fazenda vinculada, sem chance de corrigir caso a caso.

**Sinalizador de 3 cores no lugar dos textos coloridos (18/09/2026):** a coluna Vencimento não mostra mais "Xd atraso"/"Amanhã"/"7d" em negrito e colorido embaixo da data — em vez disso, a primeira coluna do grid tem um pequeno círculo (verde = a vencer, amarelo = vence nos próximos 7 dias, vermelho = vencido) e existe uma coluna "Dias" com o número de dias até o vencimento (negativo se já venceu), sempre em preto, sem negrito.

**Baixa parcial:** valor pago < total → status "parcial" (badge amarelo). O saldo permanece no mesmo registro — baixe o restante clicando novamente no ícone de baixa.

**CP em dólar:** campo "Cotação (R$/US$)" não é automático — abra a CP, preencha a cotação e salve.

**Reprogramar vencimento:** Ícone 📅 na linha → nova data → a observação recebe "[Reprogramado para DD/MM/AAAA]" automaticamente.

**Correção 17/09/2026 — borderô "vazio" que não excluía:** cancelar/estornar/confirmar um borderô agora passa por uma rota do servidor (imune a sessão expirada) — antes, em sessões mais longas, a exclusão podia falhar silenciosamente e o borderô ficava como uma "casca vazia" (0 títulos, mas o card continuava na lista, geralmente com o texto antigo tipo "— 12 títulos" ainda no nome, porque esse texto é só um rótulo salvo na criação, não é recalculado). Se um card assim aparecer, clique em Cancelar de novo — agora deve funcionar.

**Borderô (selo "BDR"):** pagamento em lote de vários títulos de uma vez. Na aba Baixados, o borderô aparece em uma linha só, com o nome do(s) fornecedor(es)/cliente(s) dos títulos que ele paga (não mais um texto genérico "Borderô DD/MM — N títulos"); clique na linha para expandir e ver os títulos individuais. O filtro "Fornecedor / Cliente" também funciona sobre os borderôs pagos.

**Baixar em Lote (17/09/2026):** ao selecionar vários títulos e clicar em "Baixar em Lote", o modal agora tem colunas editáveis de Multa, Juros e Desconto por título — o valor final ("A pagar"/"A receber") é recalculado na hora, a partir do saldo restante de cada título (não perde o que já tinha sido pago num título parcial). Esses valores ficam guardados no lançamento para consulta futura.

**Usar Adiantamento na baixa (18/09/2026):** ao abrir "Registrar pagamento" de um CP, se o fornecedor daquele título tiver adiantamento em aberto (mesma moeda), aparece o bloco "💰 Adiantamento disponível deste fornecedor" com o saldo e um campo pra informar quanto aplicar. Clicar em "Aplicar" abate esse valor do CP na hora — sem precisar escolher conta bancária pra essa parte, já que é crédito pago antes — e reduz o saldo do adiantamento. Se o valor aplicado cobrir o CP inteiro, ele já fica baixado e o modal fecha; se for parcial, o campo "Valor do pagamento" se ajusta automaticamente pro que ainda falta pagar via banco. Antes disso, aplicar um adiantamento só dava pra fazer na tela própria de Adiantamentos, e mesmo lá não abatia nenhum CP de verdade — só ficava um registro informativo, desconectado do lançamento real.

**Correção 18/09/2026:** em conta com mais de uma fazenda, o bloco de adiantamento disponível não aparecia se a fazenda ativa no topo da tela fosse diferente da fazenda do próprio CP sendo baixado — a busca usava a fazenda ativa em vez da fazenda do lançamento. Corrigido.

### 15.2 Contas a Receber
**Caminho:** Financeiro → Atividade Rural → Contas a Receber

Gerencia receitas previstas e realizadas do produtor rural.

**Filtros:** aberto / vencido / vencendo / baixado / barter / previsão / todos

**Origem automática (badge azul):** NF Saída, Arrendamento, Contrato Financeiro, Plantio.

### 15.3 Adiantamentos a Fornecedores
**Caminho:** Financeiro → Atividade Rural → Adiantamentos a Fornecedores

Registra pagamentos antecipados a fornecedores antes da entrega do produto ou serviço.

**Dois jeitos de "Aplicar" um adiantamento:** o botão "Aplicar" aqui nesta tela continua existindo — registra uma anotação no histórico do adiantamento (valor, data, NF opcional), útil como controle informativo, mas **não abate nenhum CP**. Pra de fato usar o saldo do adiantamento como pagamento de um CP real, aplique direto na baixa do CP (Contas a Pagar → Registrar pagamento → bloco "💰 Adiantamento disponível", novidade 18/09/2026) — essa via já reduz o saldo do adiantamento E o saldo do CP juntos.

### 15.4 Folha de Pagamento
**Caminho:** Financeiro → Atividade Rural → Folha de Pagamento

Ao montar uma folha nova, a tela mostra TODOS os funcionários ativos da conta (de qualquer fazenda, vinculados a Empresa/PJ ou a Produtor Rural/CPF) numa lista única pra seleção. Ao salvar, o sistema separa automaticamente em uma folha por empregador — uma por Empresa e uma por Produtor Rural — nunca mistura funcionários de produtores diferentes numa mesma folha. Cada folha salva mostra o nome do empregador (empresa ou produtor) na lista.

**Fechar folha:** gera CP do salário líquido de cada funcionário, mais a CP de FGTS. Se o empregador for uma Empresa (PJ), gera também a CP de INSS Patronal. Produtor Rural (CPF) não gera INSS Patronal — o produtor recolhe Funrural em vez disso, calculado fora da folha (não é a mesma coisa que INSS Patronal).
**Reabrir folha:** exclui as CPs geradas (salário, FGTS e INSS Patronal), reverte adiantamentos descontados e volta a folha pra rascunho. Bloqueado se algum CP já foi baixado em borderô — nesse caso, estorne o borderô primeiro.
**Correção 15/09/2026:** a lista de folhas e as ações de fechar/reabrir usavam a fazenda ativa no topo da tela, não a da própria folha — trocar de fazenda podia fazer folhas já lançadas "sumirem" da lista, ou até gerar uma folha rascunho duplicada pra mesma competência. Corrigido.

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

Folha de pagamento dos funcionários da empresa (CNPJ) selecionada no topo da tela. Fechar folha gera CP do salário líquido por funcionário, mais FGTS e INSS Patronal (aqui sempre gera os dois, já que o empregador é Empresa).

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

**Nunca mais casa CP de um titular com extrato de outro (correção 18/09/2026):** em conta com vários titulares (cada um com contas bancárias próprias — sócios, empresas do grupo), a conciliação automática ao importar o OFX não checava se o titular do CP era o mesmo titular da conta bancária — bastava o valor bater pra conciliar sozinho, mesmo entre titulares diferentes. Agora bloqueia: só concilia automaticamente quando o titular do lançamento é o mesmo da conta (ou quando o lançamento não tem titular cadastrado — não dá pra provar divergência). Na conciliação manual (aba CP/CR em Aberto e na lista de vincular), quando os titulares são diferentes a descrição aparece em cinza com "≠" na frente — não bloqueia (é escolha do usuário), só sinaliza.

**Corte de 600 lançamentos escondia até 58% da conta (correção grave, 18/09/2026):** a tela carregava só os 600 lançamentos mais recentes de toda a conta (todas as fazendas/produtores somados) — em conta grande, a maioria dos lançamentos mais antigos ficava fora da memória da tela por completo, tanto pra sugestão de correspondência quanto pra qualquer lista. Confirmado com dado real: conta com 1.438 lançamentos, só 600 carregavam. Corrigido pra buscar todos, paginado — contribui pra explicar casos de conciliação com valor errado e itens que pareciam "desconciliar" ao recarregar a tela.

**Tela travando/lenta em conta com histórico grande; exclusão de extrato sem efeito (correção 18/09/2026):** a aba "CP/CR em Aberto" recalculava a sugestão de correspondência escaneando todo o extrato pra cada lançamento em aberto, sem guardar o resultado — em conta com muito lançamento e muita transação de extrato acumulada, isso deixava a tela pesada, podendo travar o navegador ao recarregar. Corrigido pra indexar o extrato por valor antes de comparar. Também corrigido: excluir um extrato importado (🗑) podia falhar silenciosamente com sessão mais antiga — agora passa por uma rota do servidor imune a esse tipo de falha.

**Baixa automática não acontecia ao importar (correção 18/09/2026):** quando o OFX conciliava um lançamento automaticamente ao importar (sem o usuário clicar em nada), o sistema marcava a transação como conciliada mas nunca baixava o lançamento — ficava "em aberto" mesmo já vinculado a uma transação real do banco. Achado em produção em várias contas/bancos diferentes, não um banco específico. O caminho manual ("✓ Conciliar e Baixar" na aba CP/CR em Aberto) já baixava certo; agora o caminho automático (o que a maioria das transações segue) também baixa.

**Aba Histórico travava a tela ao abrir (correção grave, 18/09/2026):** entrar na aba "Histórico" pela primeira vez quebrava a página inteira ("This page couldn't load"). Causa: um erro de programação (hook do React chamado num lugar que o React não permite). Corrigido.

**Sugestão de correspondência em "CP/CR em Aberto" ignorava a data (correção 18/09/2026):** casava só por valor — com mais de uma transação de mesmo valor no extrato (comum em compras recorrentes), podia sugerir a errada. Agora exige estar dentro de 15 dias do vencimento e prioriza a mais próxima.

**FITID de alguns bancos não é estável (correção 18/09/2026):** bancos cujo identificador de transação (FITID) é "data + sequência do dia" em vez de um código realmente único do banco (ex: Cresol) podiam, ao reimportar um período sobreposto, herdar a conciliação de uma transação antiga pra uma transação diferente que calhou de cair na mesma posição. Agora só preserva a conciliação anterior se o valor bater com o que já estava salvo.

**Reconstrução 17/09/2026 — visão contínua por conta (fim da fragmentação):** antes, cada importação de OFX virava um card isolado na tela — um cliente que importava o extrato várias vezes por semana (períodos sobrepostos ou seguidos) acabava com vários cards da mesma conta, e uma transação já conciliada num import podia reaparecer como "não conciliado" ao abrir outro. Isso não existe mais: agora a tela mostra uma única conciliação contínua por conta bancária + período, não importa quantos arquivos OFX já foram importados. A antiga lista de cards foi substituída por um seletor "Conta bancária + Período → Ver conciliação".

**Como usar:**
1. Selecione a conta bancária no topo da tela
2. Clique em "Importar OFX" → upload do arquivo .ofx do banco — a importação já mescla direto na conciliação contínua daquela conta (reimportar um período que se sobrepõe a um já importado não é mais bloqueado; o sistema funde os dados e nunca desfaz uma conciliação já feita)
3. Ajuste o período (De/Até) se precisar ver um intervalo maior e clique em "Ver conciliação →"
4. O sistema tenta casar automaticamente por valor (±R$ 0,02) e data (±7 dias)
5. Confirme os vínculos automáticos ou faça vínculos manuais clicando em "Vincular"

**Aba Histórico:** virou um log de auditoria das importações (quem importou, quando, qual arquivo OFX) — não é mais o lugar onde a conciliação em si é editada. O botão "Ver conciliação" nela abre a visão contínua atualizada da mesma conta/período, nunca um retrato congelado de quando o arquivo foi importado.

**Borderô (um débito para vários lançamentos):** Clique em "Vincular" → selecione múltiplos lançamentos no painel esquerdo → Confirmar. Corrigido um bug em que a linha podia aparecer conciliada e, segundos depois, voltar sozinha para "Pendente" sem ninguém desvincular — a tela agora só dá a conciliação por concluída depois de confirmar que a gravação no banco terminou.

**Lançamento CP/CR agrupado (o inverso do borderô — várias linhas do extrato para um único lançamento):** útil quando o mesmo tipo de cobrança aparece várias vezes no mesmo dia (ex: vários pedágios). Marque o checkbox de cada linha pendente do extrato que quer agrupar (mesmo dia, mesmo tipo — crédito ou débito), clique em "Lançar CP/CR agrupado", preencha descrição e operação gerencial. O sistema cria um único CP/CR (valor = soma das linhas) já baixado, e concilia todas as linhas selecionadas contra ele.

**Busca por valor:** campo "Buscar por valor" ao lado da busca por descrição/FITID — aceita valor parcial ("67") ou completo ("67,17").

**Sub-aba "CP/CR em Aberto":** dentro de um extrato aberto, mostra os lançamentos ainda não baixados cruzados com as linhas pendentes desse extrato (por valor e direção). O botão "Conciliar e Baixar" concilia e baixa em um clique, já na conta bancária e na data da transação bancária — sem precisar sair procurando o lançamento manualmente no painel esquerdo.

**Persistência:** o extrato OFX fica salvo no banco entre sessões. Para trocar: clique em "Remover Extrato".

**Lançamentos sem correspondência no extrato** aparecem com fundo cinza no painel esquerdo, facilitando ver rapidamente o que ainda não bateu com o banco.

---

## MÓDULO 18 — FINANCEIRO → RELATÓRIOS FINANCEIROS



**Regras de conciliação e confiança do vínculo (21/09/2026):**
- **Confiança do casamento automático.** Ao importar o OFX, cada linha recebe um nível. **Alta** (valor exato, conta e titular conferem, data em até 2 dias, um único candidato): concilia e baixa sozinha, com a data e o valor do banco. **Média** (por exemplo, data entre 3 e 7 dias, mais de um lançamento com o mesmo valor, lançamento sem titular ou de outro titular): vira uma **sugestão** — a linha mostra o lançamento provável e o motivo, e você aceita com um clique ("✓ Aceitar") ou descarta ("✕"); há "Aceitar todas as sugestões" no topo. **Bloqueado**: nunca casa sozinho (lançamento já conciliado com outra linha, já baixado em outra conta bancária, em dólar/grão). **Sem candidato**: fica pendente.
- **Regras de conciliação** (aba **Regras**): informe um texto que aparece no histórico do extrato (ex.: "cobranca de iof", "tarifa pacote de servicos", "juros cheque inadimplente"), a natureza (débito/crédito), a conta (ou todas) e o que fazer — **lançar** com Operação Gerencial, centro de custo e pessoa, ou **transferência** para outra conta. No import, toda linha pendente que casa com uma regra vira um lançamento já classificado e conciliado, sem você abrir nada. Também dá para criar a regra na própria linha: **+ Tesouraria → "Fazer o mesmo sempre que o extrato disser algo como isto"**. O botão **⚙ Aplicar regras às pendentes** roda as regras nas linhas já importadas. A O.G. da regra é aplicada na fazenda da conta bancária; se ela não existir nessa fazenda, a linha fica pendente e o resumo avisa.
- **Etiquetas em cada linha:** Regra, Exato, Sugestão aceita ou Manual (mais a confiança), para você filtrar o que o sistema fez sozinho e o que foi manual.
- **Resumo após importar:** quantas linhas foram conciliadas por regra, por casamento exato, quantas são sugestões e quantas ficaram pendentes.
- **Conta correta:** ao vincular um lançamento que já foi baixado em **outra** conta, o sistema pergunta se você quer mover a baixa para a conta do extrato; lançamento já conciliado com outra linha não pode ser reaproveitado. Na lista da esquerda, cada lançamento mostra "✓ Conciliado" e "Nesta conta" / "Baixado em <conta>" / "Baixado sem conta".
- **Soma confere:** ao ligar vários lançamentos (borderô) a uma linha, o painel mostra "Linha × Lançamentos × Diferença". Diferença acima de R$ 0,02 só confirma com um motivo (juros, multa, desconto); a baixa de um lançamento único usa o valor real do banco.
- **Fechamento da conta:** no topo do extrato, "Conta fechada" (verde) quando o movimento líquido do extrato é igual ao movimento líquido baixado nesta conta no período; senão, mostra a diferença.
- Requer a migração **Seção 277**. Enquanto ela não for executada, tudo segue funcionando como antes, apenas sem regras e sem sugestões.

**Auditoria e correções da Conciliação (21/09/2026):**
- **Um lançamento, uma linha:** o casamento automático ao importar o OFX podia ligar o mesmo CP a várias linhas do extrato (ex.: um CP de R$ 5.000 ligado a 5 débitos de R$ 5.000), e as demais linhas nunca ganhavam lançamento — era a principal causa das contas desconciliadas. Agora cada lançamento só casa com uma linha, não casa com lançamento já conciliado, com lançamento já baixado por outra conta bancária, nem com lançamento em dólar/grão.
- **Extrato não some mais:** a gravação das transações passou a ser o primeiro passo do import (se falhar, nada é baixado e você é avisado); lotes grandes não perdem mais conciliações existentes; a visão da conta lê todas as transações do período (antes cortava em 1.000). Se uma ação não for gravada, a tela volta ao estado anterior em vez de continuar mostrando "conciliado".
- **Lançamentos do painel esquerdo:** depois de importar, lançamentos já baixados deixavam de aparecer até recarregar a página. Corrigido. Lançamento baixado sem conta bancária agora aparece e recebe a conta do extrato ao ser conciliado.
- **Aba Inconsistências:** mostra só o que realmente ainda está pendente em alguma conta (antes contava também linhas já conciliadas). O card do Dashboard segue a mesma regra e o botão "Lançar" foi trocado por "Conciliar", que abre esta tela — o atalho criava lançamento sem Operação Gerencial e, em linha já conciliada, duplicava a despesa.
- **Lançamento criado pela conciliação (tarifa, IOF, juros, agrupado):** agora exige Operação Gerencial e nasce com a conta bancária do extrato, a fazenda e o titular dessa conta.
- Arquivos OFX em Windows-1252 (Cresol/BB) agora mantêm acentos; FITID repetido no mesmo arquivo não derruba mais o import.
- Segurança: a rota que grava a conciliação passou a exigir sessão e conferir que os lançamentos são da sua conta.

### 18.1 Fluxo de Caixa Previsto
**Caminho:** Financeiro → Relatórios Financeiros → Fluxo de Caixa Previsto

Projeção de entradas e saídas baseada em lançamentos em aberto.

**Modos:** Diário (grid dia a dia) e Mensal (colunas por mês no período selecionado).
**Filtros:** produtor(es), conta(s) bancária(s), período (De/Até). Botões "Selecionar Todos Produtores" e "Selecionar Todas Contas" disponíveis para agilizar.
**Padrão:** início = hoje, fim = hoje + 12 meses.

**Simulador de Cenários:** botão que abre um popup para lançar entradas/saídas hipotéticas (ex: "e se esse contrato fechar?") sem virar lançamento real — soma no saldo projetado só enquanto a simulação estiver marcada como ativa (checkbox por linha). É salvo no banco por conta (conta_id): qualquer usuário autorizado do mesmo cliente vê e edita as mesmas simulações, de qualquer computador — não é mais por navegador/login de quem lançou. Tem impressão dedicada ("Simulador de Cenários").

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

Tem duas abas: **Evolução por Ano** (padrão) e **Condições Contratuais**.

**Aba Evolução por Ano** — visão consolidada do endividamento total por credor, tipo e ano de vencimento das parcelas.
**Estrutura:** N1 (clicável = tipo) → N2 (expande = contratos) → N3 (expande = parcelas individuais). Colunas = um ano por coluna.
**Filtros:** produtor, status, moeda, intervalo de anos (atalhos: 12 meses / 3 anos / 5 anos / Tudo).
**Bloco Compra de Imóveis:** tabela adicional (cabeçalho marrom) aparece quando há parcelas de compra de terra cadastradas.

**Aba Condições Contratuais** — uma linha por contrato, com as colunas: Entidade (credor), Operação (descrição + tipo), Valor, Tipo de Amortização (SAC/PRICE/Crescente), Taxa de Juros (fixa a.a. ou indexador+spread quando variável), Indexador, CET, Valor do Juros (soma dos juros de todas as parcelas) e Valor da Parcela (próxima parcela em aberto, ou a mais antiga se todas já pagas). Respeita os mesmos filtros de produtor/status/moeda da outra aba.
**CET (Custo Efetivo Total):** não é a taxa de juros nominal — é calculado de verdade pela TIR (XIRR) do fluxo de caixa real do contrato: valor líquido recebido na contratação (já descontando IOF, TAC e outros custos) contra cada parcela na sua data de vencimento. Aparece "—" quando o contrato não tem parcelas cadastradas ou o cálculo não converge (fluxo sem raiz válida).
**Taxa de Juros estimada (≈, em itálico):** alguns contratos foram importados de PDF/planilha sem a taxa nominal ter sido capturada no cadastro. Nesses casos a coluna mostra uma taxa estimada, calculada pela TIR do fluxo valor financiado × cronograma de parcelas (sem descontar IOF/TAC, diferente do CET) — é uma aproximação, não a taxa contratual real. Para trocar pela taxa real, edite o contrato em Configurações → Complemento Financeiro → Contratos Financeiros.

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

**Registrar Pagamento de uma parcela:** baixa o(s) lançamento(s) de CP reais (amortização/juros/encargos, gerados ao calcular o cronograma) — não só marca a parcela como paga na tela. Se a parcela não tiver um lançamento vinculado diretamente (comum em parcelas antigas), o sistema localiza os lançamentos certos pela combinação contrato + data de vencimento e baixa todos. "Reabrir Parcela" funciona da mesma forma, reabrindo o(s) lançamento(s) de CP correspondente(s).

**Calcular parcelas não lança mais em CP na hora (correção 17/09/2026):** antes, clicar em "Calcular" (ou "Usar cronograma do PDF") já criava os lançamentos de CP imediatamente, sem chance de revisar. Agora esses botões só montam/atualizam a tabela de parcelas — o CP só é criado (ou recriado, se já existia e ainda não foi baixado) ao clicar no botão explícito **"💾 Salvar Parcelas e Lançar no CP"**, que aparece sempre que há parcelas na tabela.

**Editar parcelas manualmente:** checkbox "Editar parcelas" acima da tabela libera edição das colunas Amortização e Juros (Vencimento e Valor da Parcela já eram editáveis mesmo sem o checkbox). Depois de editar, clique em "Salvar Parcelas e Lançar no CP" pra confirmar — sem isso, o ajuste fica só na tela. Atenção: clicar em "Calcular" de novo depois de editar recalcula a tabela do zero pelo método SAC/PRICE/SACRE e descarta os ajustes manuais não salvos.

### 19.2 Apoio Financeiro
**Caminho:** Configurações → Complemento Financeiro → Apoio Financeiro

**Seletor de Operação Gerencial (21/09/2026):** agora mostra a mesma lista de Contas a Pagar, filtrada pelo tipo do lançamento (A Pagar = despesas, A Receber = receitas), com a classificação e busca por texto. Antes misturava receitas e despesas, só com o nome, e só da fazenda ativa. Ao trocar o tipo, a operação escolhida é limpa para não ficar uma operação de receita num lançamento a pagar.

Ferramenta exclusiva Raccolto para projeções e estimativas financeiras. Os lançamentos aparecem no Fluxo de Caixa com badge laranja "Apoio Financeiro" — não entram no sistema oficial.

### 19.3 Seguros / Apólices
**Caminho:** Configurações → Complemento Financeiro → Seguros / Apólices

Gerencia apólices de seguro (rural, vida, patrimonial, automóvel, máquinas). Controla prêmios e sinistros. Alerta automático de vencimento 7 dias antes.

Ao cadastrar uma apólice nova com prêmio "Parcelado" ou "À Vista", o sistema gera automaticamente o(s) lançamento(s) de CP (Conta a Pagar) das parcelas do prêmio, vinculados à apólice.

**Gerar/regenerar parcelas ao editar:** na aba "Financeiro" da edição, mexer no toggle À Vista/Parcelado ou clicar em "Gerar" e depois salvar recalcula o cronograma de parcelas + CP. Parcelas já pagas nunca são apagadas ou alteradas — só as que ainda não foram pagas são substituídas. Se a apólice já tem parcela lançada, o sistema pede confirmação antes de salvar ("Essa ação substituirá as parcelas lançadas no financeiro. Salvar mesmo assim?"). Editar outros campos (ex: corretora, observação) sem tocar na aba Financeiro nunca mexe nas parcelas.

### 19.4 Consórcios
**Caminho:** Configurações → Complemento Financeiro → Consórcios

Gerencia cotas de consórcio com cronograma de parcelas e CPs automáticas.

**Após editar dados:** use o botão **Regenerar Parcelas e CPs** para recalcular o cronograma (disponível apenas no modo edição).

---

## MÓDULO 20 — FISCAL → EMISSÃO E CONTROLE

### 20.1 Monitor NF-e Emitidas
**Caminho:** Fiscal → Emissão e Controle → Monitor NF-e Emitidas

Lista todas as NF-e emitidas pela fazenda — incluindo NF de venda/faturamento e NF de Transferência entre Fazendas. Status: autorizada, cancelada, denegada. Acesso ao DANFE e XML.

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

**Como funciona:** o sistema lê automaticamente todos os lançamentos já baixados (status "Baixado" ou "Parcial") no Financeiro com entidade contábil "PF" e vínculo de atividade "Rural" (ou em branco) no ano selecionado — não é preciso lançar nada manualmente, exceto dados históricos anteriores ao uso do sistema. **Baixa parcial (17/09/2026):** entra pelo valor efetivamente pago (campo valor_pago) na data da baixa, não pelo valor total do título — regime de caixa é sobre dinheiro que realmente se moveu, não sobre o título estar 100% liquidado. Atenção: se um título for pago em mais de uma baixa parcial em datas/meses diferentes, o sistema hoje guarda só a data da baixa MAIS RECENTE e o valor ACUMULADO total pago — o Livro Caixa mostra o total na data da última baixa, não separado por mês de cada parcela paga.

**Abas:**
- **Livro Caixa** — lista cronológica dos lançamentos do ano com saldo acumulado. A coluna "Doc." permite ajustar o tipo de documento (Nota Fiscal, Fatura, Recibo, Contrato, Folha de Pagamento, Outros) quando necessário.
- **Produtores e Participações** — configura o % de participação de cada CPF quando o imóvel é de condomínio ou parceria (mais de um titular). Ao exportar para um produtor específico, os valores são multiplicados automaticamente pela sua quota-parte.
- **Cadastro LCDPR** — cadastro dos dados que a Receita exige e que não fazem parte do dia a dia operacional: CAEPF e tipo de exploração de cada fazenda (individual, condomínio, arrendado, parceria, comodato ou outros), contas bancárias vinculadas e os dados do contador responsável (nome, CPF/CNPJ, CRC, e-mail, telefone). **Preencha esta aba antes da primeira exportação** — sem isso, esses campos saem em branco no arquivo.
- **Auditoria (18/09/2026)** — lista todo lançamento baixado/parcial de fazenda Pessoa Física no ano selecionado, comparado contra o que de fato entra no Livro Caixa. Todo item que fica de fora mostra o motivo exato: Entidade Contábil do próprio lançamento = PJ, titular do lançamento (produtor_id) é uma empresa (CNPJ), categoria interna (Mútuo entre Empresas / Transferência entre Contas), descrição citando outro produtor/empresa da mesma conta, vínculo de atividade diferente de "Rural", ou baixa de apoio (não é caixa próprio do titular). Cartões de resumo com total pago / no LCDPR / fora do LCDPR, e filtro (Fora do LCDPR / No LCDPR / Todos). A tabela tem coluna "Produtor" (titular do lançamento, direto ou herdado da fazenda) e um filtro por mês de competência, ao lado dos outros filtros. Serve pra validar item a item se cada exclusão está certa (ex: realmente é um mútuo interno) ou é um dado de cadastro pra corrigir (ex: Entidade Contábil errada, vínculo de atividade errado).
- **Importação** — lança dados históricos via planilha Excel/CSV (útil para anos anteriores à adoção do sistema).
- **Exportação** — gera o arquivo .txt oficial (o que realmente é entregue à Receita) por produtor, por ano ou por mês. Também tem Excel e um relatório em PDF (identificação do cliente, Imóveis Rurais, Contas Bancárias, Livro Caixa completo com saldo corrente, em layout A4) — os dois são só para conferência, nunca substituem o .txt no envio. As 3 exportações são exclusivas de Pessoa Física, como a lei exige — não há mais seleção de Empresa (PJ) aqui (revertido em 17/09/2026: a origem PF/PJ de um lançamento agora é resolvida pelo campo Entidade Contábil no próprio lançamento — ver Módulo 15 — em vez de precisar de uma visão em separado pra Empresa). Com "Todos os Produtores" selecionado, o Livro Caixa do relatório ganha uma coluna extra "Produtor" pra deixar claro de quem é cada lançamento (some quando um produtor específico é selecionado — aí já é óbvio). O PDF e o Excel (só eles, não o .txt oficial nem a tela) têm também uma coluna "O.G." com a Operação Gerencial de cada lançamento (17/09/2026).

**Cabeçalho do PDF com todos os produtores e participação (18/09/2026):** com "Todos os Produtores" selecionado, o cabeçalho do PDF agora traz uma tabela com nome, CPF e % de distribuição de cada produtor PF configurado na aba Produtores e Participações, mais a soma (deve ser 100%). Antes, nesse modo, o cabeçalho só dizia "Todos os Produtores" e CPF "—", sem identificar quem eram os titulares nem a quota de cada um. Com um produtor específico selecionado, o cabeçalho continua mostrando só o nome, CPF e a quota-parte dele.

**Coluna O.G. em branco (correção 21/09/2026):** a coluna "O.G." do PDF/Excel buscava só as Operações Gerenciais globais da conta, mas elas são gravadas por fazenda — por isso várias linhas saíam com "—" mesmo tendo operação vinculada. Corrigido. Se uma linha continuar com "—", é porque o lançamento realmente não tem Operação Gerencial (comum em IOF e tarifas bancárias vindos da Conciliação): classifique-o em Contas a Pagar/Receber.

**Operação Gerencial de Cota Capital (21/09/2026):** nova OG 2.02.01.02.014 — DÉBITO REF. A COTA CAPITAL, usada quando o produtor integraliza cotas de capital em cooperativa (ex.: "Plano Int Capital-Cota" no extrato do Sicredi). Foi criada em todos os planos de contas e passa a vir no plano de novas fazendas. Ela ainda não tem conta contábil de débito/crédito configurada — se a contabilidade precisar, configure em Cadastros → Operações Gerenciais.

**Contas bancárias:** contas do tipo "espécie" (dinheiro em caixa) ou "trânsito" (sem conta bancária identificada) entram no arquivo com os códigos especiais que a própria Receita prevê para esses casos (000 e 999) — não é erro, é o comportamento correto do leiaute oficial.

**Correção (18/09/2026) — receitas parciais e antigas desaparecendo:** o filtro que validava entrada no LCDPR estava muito rigoroso: rejeitava qualquer lançamento com campo entidade_contabil preenchido com "pj", mas TAMBÉM rejeitava lançamentos onde esse campo era NULL (vazio). Receitas parciais (status="parcial") e qualquer NF/CR criados antes da Seção 76 (que adicionou esse campo em 14/09/2026) tinham entidade_contabil = NULL e sumiam do Livro Caixa. Corrigido: NULL é tratado como "pf" por padrão — só rejeita quando explicitamente preenchido com "pj". Receitas parciais agora entram no LCDPR pelo valor_pago (não pelo valor total) na data_baixa, como deveria ser no regime de caixa.

**Correção de dados (18/09/2026) — fazenda cadastrada errado como PJ sumindo do LCDPR:** a fazenda "Armazem Santa Rita" (Grupo Ogliari) estava com o campo Entidade Contábil do cadastro marcado como "pj", embora fosse propriedade pessoal do produtor (sem CNPJ — o CPF fiscal já cadastrado na fazenda era do próprio produtor, uma contradição que ajudou a identificar o erro). Isso contaminou 165 lançamentos dessa fazenda via herança automática, incluindo 46 receitas e 73 despesas já baixadas/parciais somando R$ 4,29 milhões, todas invisíveis no LCDPR mesmo sendo do titular PF. Corrigido: fazenda e os 165 lançamentos passaram de PJ para PF, retroativo, com snapshot de rollback salvo. Se aparecer de novo uma fazenda sumindo do LCDPR, o primeiro lugar a checar é Cadastros → Fazendas → Entidade Contábil — e comparar com o CPF/CNPJ fiscal cadastrado ali: CPF (11 dígitos) com Entidade Contábil = PJ é sinal de erro de cadastro.

**Transferências internas não entram no Livro Caixa:** lançamentos categorizados como "Mútuo entre Empresas" ou "Transferência entre Contas" (Financeiro → Tesouraria, e também PIX importado do extrato entre contas de produtores/empresas diferentes da mesma conta) não são receita nem despesa de verdade, então não aparecem no Livro Caixa do LCDPR nem em nenhuma exportação. Como camada extra, um lançamento cujo histórico mencione o nome de outro produtor/empresa da própria conta (comum em PIX sem cadastro vinculado) também é excluído automaticamente.

**Removido (17/09/2026) — checkbox "Excluir receitas de produtores PJ":** existia na aba Exportação pra remover do Livro Caixa receitas atribuídas a um "produtor" que no cadastro é na verdade uma empresa (CNPJ). Removido junto com a reversão da visão de Empresa (PJ) no Relatório PDF, mas a exclusão em si **continua acontecendo — só ficou automática e obrigatória, em vez de um checkbox opcional**: qualquer lançamento cujo titular (campo Produtor do lançamento, ou o titular padrão da fazenda quando o lançamento não tem um específico) seja uma empresa nunca entra no LCDPR, sempre, porque LCDPR é exclusivo de Pessoa Física. **Correção 17/09/2026 (mesmo dia):** essa exclusão automática ficou faltando na primeira versão da correção — só o campo Entidade Contábil do lançamento (Módulo 15) era checado, e ele reflete a entidade padrão da FAZENDA (herdada automaticamente), não a do titular específico marcado no lançamento; um lançamento podia ter Entidade Contábil = PF (porque a fazenda é PF) mas titular PJ (ex: uma transportadora do grupo cadastrada em Produtores só pra lançar custos dela no sistema) e continuava aparecendo no Livro Caixa. Corrigido: agora os dois critérios são checados — Entidade Contábil = PF **e** titular não-PJ.

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

**Filtro de Ciclos:** dropdown com busca — mostra uma tabela com checkbox, Fazenda e Ciclo (+ área) por linha, útil quando ciclos de fazendas diferentes têm nomes parecidos (ex: "Soja 2026/2027" repetido em várias propriedades). Botões "Todos"/"Limpar" dentro do dropdown.

### 22.4 Custo / ha
**Caminho:** Resultados → Custos → Custo / ha

Análise de custo por hectare por talhão e ciclo.

### 22.5 Regras de Rateio
**Caminho:** Resultados → Custos → Regras de Rateio

Define como custos comuns são rateados entre ciclos por proporção configurável.

### 22.6 Aplicações por Ciclo
**Caminho:** Resultados → Custos → Aplicações por Ciclo

Relatório consolidado de aplicações (pulverizações, adubações) por safra/ciclo. Exportação PDF, XLSX e WhatsApp.

**Filtro de Talhões:** botão "Selecionar todos"/"Limpar seleção" — evita marcar um talhão de cada vez quando o relatório precisa cobrir a fazenda inteira.

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

**Consulta Sintegra (🔎 ao lado da IE):** na aba "Inscrições Estaduais" do produtor, tanto ao adicionar uma nova IE quanto ao editar o endereço de uma já cadastrada, existe um botão 🔎 que consulta o cadastro de contribuintes direto na SEFAZ (webservice CadConsultaCadastro4) e preenche automaticamente nome, endereço, município e código IBGE a partir da IE digitada — funciona para IEs de MT, GO, MS, SP, BA e TO; demais estados retornam aviso de "UF ainda não implementada" (adicionados sob demanda). Exige que a conta já tenha um certificado A1 configurado em Parâmetros → Fiscal (qualquer certificado válido de qualquer fazenda da conta serve, não precisa ser do próprio produtor consultado nem da fazenda vinculada àquela IE específica — a consulta de cadastro é um serviço de busca pública da SEFAZ, não uma emissão de documento).

**"Nenhum certificado configurado" mesmo tendo (correção 18/09/2026):** em conta com várias fazendas, se o certificado A1 foi configurado numa fazenda diferente da que está vinculada àquela IE específica, a consulta dizia que não havia certificado — a busca olhava só a fazenda da IE, não a conta toda. Corrigido: agora procura em qualquer fazenda da conta antes de desistir.

**"Fazenda ou Empresa vinculada" na IE:** ao adicionar uma Inscrição Estadual, o campo de vínculo lista tanto as Fazendas da conta quanto as Empresas (PJ) já cadastradas para aquele produtor — uma IE pode pertencer a uma propriedade física (fazenda) ou a uma empresa do produtor, nunca as duas ao mesmo tempo. Isso importa porque telas que buscam "a IE certa" para uma operação (venda de grãos, arrendamento) filtram por esse vínculo.

### 23.3 Fazendas e Talhões
**Caminho:** Configurações → Cadastros → Fazendas e Talhões

Cadastro completo de fazendas (dados gerais, matrículas, certidões CAR/ITR/CCIR, arrendamentos) e talhões com GPS.

### 23.4 Funcionários
**Caminho:** Configurações → Cadastros → Funcionários

Cadastro de funcionários para folha de pagamento (produtor PF e empresa PJ) — mostra os de todas as fazendas da conta, não só a fazenda ativa (corrigido 15/09/2026: a lista ficava vazia dependendo de qual fazenda estava ativa no topo da tela).

### 23.5 Catálogo de Insumos
**Caminho:** Configurações → Cadastros → Catálogo de Insumos

Cadastro de sementes, fertilizantes, defensivos, corretivos e outros insumos com custo médio, estoque mínimo e unidade.

**Correção 18/09/2026:** se o salvamento de um item (aqui, em Produtos, ou em Itens Gerais) falhasse por qualquer motivo, a mensagem de erro era escrita atrás do próprio modal aberto — na prática, invisível: parecia que nada tinha acontecido, sem indicar o que deu errado. Corrigido pra mostrar o erro dentro do modal.

### 23.6 Itens Gerais
**Caminho:** Configurações → Cadastros → Itens Gerais

Produtos e serviços que não são insumos agrícolas (peças, ferramentas, materiais de escritório).

Quando a Subcategoria escolhida é "Peças e Manutenção", o cadastro libera dois campos extras: Número de Série (do fabricante) e Foto do Produto (upload de imagem) — úteis para identificar peças parecidas visualmente ou controlar garantia por número de série. Ambos aparecem também na listagem do item.

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

**Emitentes (produtores/empresas) e a lista de configurações são do cliente inteiro, não da fazenda selecionada no momento** — a lista de emitentes e o ambiente SEFAZ (Homologação/Produção) aparecem iguais não importa qual fazenda esteja ativa no topo da tela. Se a tela aparecer com "Nenhum emitente cadastrado" quando você sabe que já cadastrou algum, é sinal de bug de regressão (não normal) — cheque se a busca de produtores/empresas/configuracoes_modulo voltou a ficar filtrada por fazenda_id antes de suspeitar de perda de dados.

### 24.2 Operações Fiscais / CFOP
**Caminho:** Configurações → Sistema → Operações Fiscais / CFOP

Tabela de CFOP padrão por tipo de operação fiscal.

### 24.3 Operações Gerenciais
**Caminho:** Configurações → Sistema → Operações Gerenciais

Plano de contas gerencial — associa cada tipo de lançamento a uma conta no plano de contas.

**Duplicar (17/09/2026):** botão ⧉ ao lado de Editar/Excluir em cada operação — abre como "Nova Operação Gerencial" com toda a configuração igual (tipo, permissões de tela, contas de débito/crédito, LCDPR etc.), só com o código em branco (obrigatório ser único) e "(cópia)" no final da descrição, como lembrete de ajustar antes de salvar. Útil pra criar uma operação exclusiva do cliente parecida com uma que já existe, sem preencher tudo de novo. Mesmo padrão que já existia em Admin → Padrões de OG (Raccolto), agora também aqui, na tela onde o próprio cliente cria suas operações.

**Operação criada só aparecia pra quem criou (correção 17/09/2026):** criar uma Operação Gerencial nova gravava com a fazenda ativa de quem estava criando, em vez de vincular à conta como um todo. Numa conta com várias fazendas, isso fazia a operação nunca aparecer pra outros usuários do cliente — só pra quem criou (e pra usuários Raccolto, que têm acesso irrestrito e por isso não notavam o problema). Corrigido: criar agora sempre vincula à conta inteira. Precisou também de uma correção no banco (leitura) pra alcançar operações já criadas com esse problema antes da correção.

**Nova opção "Combustível e Lubrificantes" (18/09/2026):** checkbox na aba Telas/Módulos, ao lado de "Manutenção e Reparos" — marca a OG como sendo de combustível. Usada pela NF de Produtos → Apropriação Direta pra decidir automaticamente que o item só precisa do veículo que abasteceu (ver Módulo 8.2). As duas OGs padrão do catálogo global de combustível já saem marcadas.

**Operação criada não aparecia pra ninguém, em contas com muitas fazendas (correção 17/09/2026):** o carregamento da lista (aqui e em qualquer seletor de OG do sistema — NF, CP/CR, Tesouraria, Estoque) buscava tudo numa página só, e o banco corta silenciosamente em 1.000 linhas por página quando não pedimos as páginas seguintes. Contas com bastante fazenda somam facilmente mais de 1.000 operações entre o catálogo global e o legado por fazenda, então qualquer operação que ficasse depois desse corte (pela ordem alfabética do código) simplesmente não aparecia pra nenhum usuário — não era falta de permissão, era corte de paginação. As 3 rotinas que carregam Operações Gerenciais agora buscam todas as páginas.

### 24.4 Plano de Contas
**Caminho:** Configurações → Sistema → Plano de Contas

Hierarquia de contas gerenciais (grupos, subgrupos, contas analíticas).

**"Plano de Contas não cadastrado" mesmo já tendo cadastrado (correção 17/09/2026):** em conta com várias fazendas, o Plano de Contas normalmente é cadastrado uma vez só, numa fazenda. A leitura (aqui e no aviso que aparece na aba Contabilidade de Operações Gerenciais) olhava só a fazenda ativa do usuário — se o usuário logado estava com outra fazenda da mesma conta ativa (comum quando a conta tem 2+ fazendas e cada usuário fica com a que abriu por último), o sistema não achava o plano e avisava que não existia. Corrigido pra buscar em todas as fazendas da conta, igual já funciona pra Operações Gerenciais. Cadastrar/editar uma conta contábil continua gravando na fazenda ativa de quem está editando — se isso um dia criar duplicidade entre fazendas da mesma conta, é sinal de que vale migrar o Plano de Contas pra ser por conta desde a gravação, não só na leitura.

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

**"0 usuários"/"0 grupos" em conta com várias fazendas (correção 18/09/2026):** usuário e grupo de acesso são cadastrados numa fazenda só, mas valem pra conta inteira — igual Operações Gerenciais e Plano de Contas. Até aqui a leitura olhava só a fazenda ativa de quem está vendo a tela; se os usuários foram cadastrados numa fazenda diferente (comum quando a conta tem várias fazendas e cada sessão fica com uma ativa diferente), a tela mostrava "0 usuários" mesmo a conta tendo usuários cadastrados de verdade. Corrigido: a lista agora busca em todas as fazendas da conta.

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

O CNPJ monitorado pode estar configurado em qualquer fazenda da conta — o botão "Sincronizar SIEG" (tanto em NF de Produtos quanto em NF de Serviço) busca em todas as fazendas da conta, não só na fazenda selecionada no momento na tela.

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
