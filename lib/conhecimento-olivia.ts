/**
 * Base de Conhecimento Operacional — Olívia
 *
 * Reconstruída do zero em 07/10/2026, substituindo o antigo lib/suporte-manual.ts
 * (removido — continha afirmações desatualizadas que nunca foram reconferidas
 * contra o código depois de escritas, acumuladas sessão após sessão).
 *
 * Fonte primária desta versão:
 *   - documentacao/mapeamento-2026-10-06/MANUAL-ARATO-WEB.md e PONTOS-DE-ATENCAO.md
 *     (levantamento independente feito por leitura de código + esquema do banco,
 *     snapshot de 06/10/2026, sem execução de operação real para validar)
 *   - components/TopNav.tsx (árvore de menu real, lida diretamente — mais atual
 *     que o snapshot acima para qualquer mudança feita depois de 06/10/2026)
 *   - Verificação direta por leitura de código nos pontos de maior risco
 *     (lib/db.ts, app/api/contratos/confirmar/route.ts, app/fiscal/esocial/page.tsx,
 *     app/fiscal/gnre/page.tsx, app/expedicao/page.tsx)
 *
 * Disciplina para manter este arquivo confiável (o motivo da reconstrução):
 *   1. Isto descreve o ESTADO ATUAL do sistema, não um histórico de correções.
 *      Não adicione aqui "corrigido em DD/MM — antes fazia X, agora faz Y".
 *      Mudou o comportamento? Reescreva a frase para o novo estado, não acrescente
 *      uma nota por cima da antiga.
 *   2. Antes de escrever que algo "é automático", "gera X" ou "transmite para Y",
 *      confirme lendo a função que executa a ação — não descreva a partir do
 *      card/texto da tela nem da intenção original da funcionalidade.
 *   3. Se não há certeza de um comportamento, escreva isso explicitamente
 *      ("confira no sistema" / "não verificado") em vez de arriscar uma resposta
 *      confiante. Uma resposta incerta e honesta é sempre melhor que uma errada
 *      e confiante.
 *   4. Nunca escreva CNPJ, CPF ou qualquer identificador fiscal de exemplo neste
 *      arquivo além dos já confirmados em app/api/suporte/chat/route.ts.
 */

export const CONHECIMENTO_OLIVIA = `
# Base de Conhecimento — Arato
Reconstruída em 07/10/2026 a partir de levantamento de código (snapshot 06/10/2026) + árvore de menu real.

Este documento descreve o que o sistema Arato Web faz **hoje**, verificado contra o código quando a afirmação tem consequência financeira ou fiscal. Não é um histórico de mudanças. Onde o comportamento real é mais limitado do que o texto de alguma tela sugere (automação "de mentirinha", registro só local), isso está dito explicitamente — nunca omita essa ressalva ao responder.

---

## PRINCÍPIO DE HONESTIDADE

Prefira dizer "não tenho certeza, confira no sistema ou com o contador" a arriscar um número, um CNPJ, uma regra fiscal ou um comportamento que você não consegue confirmar neste documento. Isso vale especialmente para:
- CNPJ, CPF, IE ou qualquer identificador fiscal de terceiros (nunca invente; veja a lista de referência confirmada no prompt principal)
- Se uma automação realmente dispara sozinha ou só existe como registro de status local (veja a seção "O que é simulado / só registro local" abaixo — é a mais importante deste documento)
- Alíquotas, prazos legais e regras tributárias específicas (Funrural, IRRF, INSS, IBS/CBS) — sempre recomende confirmar com o contador antes de uma decisão real

---

## CONCEITOS ESSENCIAIS

**Saca (sc):** 60 kg — unidade padrão de soja, milho, trigo.
**Arroba (@):** 15 kg — unidade padrão de algodão e boi.
**Conta:** a organização/cliente do sistema — pode reunir várias fazendas e produtores.
**Produtor:** pessoa/entidade rural relacionada às operações e documentos.
**Fazenda:** propriedade/contexto operacional escolhido na tela.
**Ano-safra:** período agrícola de referência (ex.: "2025/2026") — é da conta inteira, não só de uma fazenda.
**Ciclo:** cultivo dentro de um ano-safra (ex.: "Soja 2025/2026") — toda operação de campo se vincula a um ciclo. A tabela "Safras" antiga está vazia; o que vale é Ciclos.
**Talhão:** subdivisão operacional da fazenda — unidade básica de plantio.
**CP / CR:** Conta a Pagar / Conta a Receber.
**OG (Operação Gerencial):** classificação que liga um lançamento ao plano de contas — define onde ele aparece no DRE.
**Rateio:** distribuição de um custo entre mais de um destino (talhão, ciclo, fazenda).
**Kardex:** histórico de entradas e saídas de um produto no estoque.
**Romaneio:** registro de pesagem e identificação de uma carga (bruto, tara, líquido).
**CFOP / NCM / CST:** códigos fiscais de operação, produto e tributação, usados na classificação de cada documento.
**NF-e / CT-e / MDF-e:** documentos eletrônicos de mercadoria, transporte e manifesto de carga.
**SIEG:** integração que captura automaticamente documentos fiscais destinados ao CNPJ/CPF do cliente.
**LCDPR / SPED:** livros/arquivos fiscais ou contábeis — gerar o arquivo aqui não significa que ele foi transmitido à Receita.

**Cor azul = o sistema fez (automático). Cor mostarda = o usuário fez (ação manual).**

**Campo de valor (R$, kg, %, etc.) — digitação natural, não "centavos primeiro"**: desde 09/10/2026 todo campo numérico mascarado do sistema (componente InputNumerico, usado em praticamente todo lançamento de valor) digita como um campo de texto comum — os dígitos entram da esquerda pra direita, o ponto de milhar aparece sozinho a cada 3 dígitos, e os decimais só surgem quando o próprio usuário digita a vírgula (ex.: digitar "1000" mostra "1.000"; digitar "1000,5" mostra "1.000,5"). Antes era o padrão "centavos primeiro" (preenche da direita pra esquerda, como calculadora) — se um usuário comentar que "antes era diferente", é essa mudança, não um bug.

**Campo de data — digitação fluida, sem precisar de Tab**: também desde 09/10/2026, todo campo de data (componente InputData) deixou de ser o campo de data nativo do navegador (que exige Tab ou acerto exato de 2 dígitos pra pular de dia→mês→ano) e virou um campo de texto mascarado dd/mm/aaaa — digita os 8 números em sequência, sem Tab, sem clicar em nada; as barras aparecem sozinhas. O botão "Hoje" ao lado continua igual.

---

## VOCÊ (OLÍVIA) É UM BALÃO FLUTUANTE

Desde 07/10/2026 você não fica mais numa tela própria (antigo /suporte, antigo item "Suporte IA" em Ajuda). Você é um balão fixo no canto inferior direito da tela, visível em qualquer página do sistema. O usuário clica para abrir a conversa, ela fica aberta por cima de qualquer tela enquanto ele navega e vai fazendo o que você orientou, e só fecha quando ele clica no ×. Se perguntarem "onde te encontro" ou "sumiu o suporte", explique isso.

---

## ESTRUTURA REAL DO MENU

O menu superior tem 10 grupos (ordem real da barra): **Início, Cadastros, Produção, Documentos Fiscais, Comercial & Logística, Financeiro, Fiscal, Resultados, Configurações, Ajuda.** O que aparece para cada usuário depende do papel dele, dos módulos habilitados na conta e do plano contratado — um item sumido pode ser permissão, não exclusão. Não garanta que um menu existe sem considerar isso.

### Cadastros
Entidades: Pessoas e Entidades · Produtores · Fazendas e Talhões · Funcionários · Empresas · Imóveis Urbanos
Agrícola: Catálogo de Insumos · Produtos Agrícolas · Itens Gerais · Depósitos & Armazéns · Combustíveis & Bombas · Grupos de Insumos · Culturas · Princípios Ativos · Unidades de Medida
Patrimônio: Máquinas e Veículos · Benfeitorias · Bens (Alienação)
Financeiro: Contas Bancárias · Centros de Custo · Histórico Fiscal (CFOPs) · Formas de Pagamento

### Produção
Planejamento: Planejamento de Safra · Safras e Ciclos · Orçamento Planejado × Realizado
Operações de Campo: Plantio · Adubação de Base · Correção de Solo · Pulverização Terrestre · Aplicação Aérea · Tratamento de Sementes
Monitoramento: Mapa de Talhões · Recomendações Agronômicas · Pragas & Doenças · Pluviometria
Colheita: Colheita · Romaneios de Produção · Classificação de Grãos
Máquinas: Máquinas e Veículos · Abastecimento de Máquinas · Manutenções · Custos por Máquina
Algodão (add-on opcional): Safra & Operações · Monitoramento de Bicudo · Colheita & Módulos · Algodoeira/Beneficiamento · HVI & Qualidade · Posição de Algodão

### Documentos Fiscais
Notas de Entrada: Notas de Terceiro (/fiscal/documentos) · Notas Próprias · Retorno de Insumo · Retorno de Máquinas e Equipamentos · Retorno de Produto Agrícola
Notas de Saída: Notas de Venda · Notas de Transferência · Remessa
Transporte: CT-e · MDF-e

### Comercial & Logística
Compras: Pedido de Compras
Estoque: Transferência entre Fazendas · Romaneios de Terceiros
Integração de Documentos: Notas Capturadas (SIEG) · Ligar/Desligar SIEG
Comercialização: Contratos de Grãos · Migração de NF entre Contratos · Compromissos em Grãos · Faturamento/NF-e de Saída · Compra de Terra · Contratos de Arrendamento
Expedição: Expedição de Grãos · Cargas em Trânsito · Romaneios de Saída
Fretes e Transporte: Acerto de Frete (TAC) · CT-e · MDF-e · Transportadoras/Veículos
Balança: Pesagem Avulsa
Relatórios: Posição de Insumos · Kardex · Estoque de Grãos · Pedidos de Compra · Pendências de Classificação

### Financeiro
Contas a Pagar/Receber: Contas a Pagar · Contas a Receber · Adiantamentos a Fornecedores · Folha de Pagamento · Folha de Pagamento — Empresa
Tesouraria: Lançamento de Tesouraria · Operações de Tesouraria · Mútuos entre Empresas · Aplicações Financeiras · Conciliação Bancária
Relatórios Financeiros: Fluxo de Caixa Previsto/Realizado · CP/CR — Contas · Posição Bancária · Pedidos de Compra · Posição de Comercialização · Endividamento · Gastos por Classificação
Complemento Financeiro: Contratos Financeiros · Apoio Financeiro · Seguros/Apólices · Consórcios
Cartões de Crédito

### Fiscal
Emissão e Controle: Monitor NF-e Emitidas · Pendências Fiscais · GNRE · Remessas Logísticas · Entrada de Nota Própria · Transferência de Máquinas/Equip. · Triangulação de NF (desabilitado) · Certificado Digital
Obrigações: LCDPR · SPED ECD — Contábil · eSocial Rural · IBS/CBS — 2027 · Parcerias & Grupos · Operações Fiscais

### Resultados
Resultado Econômico: DRE Agrícola · Margens por Safra · DRE por Empresa
Custos: Custos Totais · Custo/ha · Regras de Rateio · Aplicações por Ciclo · Manutenção de Máquinas
Desempenho: Produtividade · Gastos por Classificação

### Configurações
Sistema: Parâmetros Fiscais (NF-e) · Operações Fiscais/CFOP · Operações Gerenciais · Plano de Contas · Regras de Rateio · Classificação Automática · Taxas de Referência · Contabilidade
Usuários: Usuários e Permissões · Auditoria
Raccolto (administrativo): Integrações · Bot IA — WhatsApp · Automações · Importações · Backup & Restauração · Alertas do Sistema · Log do Sistema · Manual do Proprietário

### Ajuda
Aprendizado (/learning). Suporte IA não fica mais aqui — veja a seção do balão acima.

---

## O QUE É SIMULADO / SÓ REGISTRO LOCAL (leia isto antes de responder sobre automação)

Estes pontos foram confirmados lendo o código de execução, não o texto da tela. Se o usuário perguntar sobre qualquer um destes, avise explicitamente que não é uma transmissão oficial:

- **eSocial Rural** (Fiscal → Obrigações → eSocial Rural): o botão "Transmitir" gera um número de protocolo local a partir do horário do computador e marca o evento como "transmitido" no banco — **não há envio ao eSocial oficial** nessa ação hoje. Não trate esse protocolo como comprovante legal.
- **GNRE** (Fiscal → Emissão e Controle → GNRE): "Emitir" e "Registrar pagamento" só atualizam o status no banco (emitida/paga) — **não há chamada ao serviço oficial de GNRE**. O status da tela não comprova guia emitida nem recolhida.
- **MDF-e a partir da Expedição de Grãos**: o botão "MDF-e" leva para a emissão real no módulo Transporte, com a NF-e da carga já pré-selecionada — a transmissão à SEFAZ acontece lá (assinatura, certificado, protocolo); quando autorizado, a carga na Expedição é atualizada automaticamente (número, chave, status). Transbordo sem NF não tem MDF-e disponível: sem NF-e/CT-e vinculado não há documento fiscal para o manifesto referenciar, e a lei exige pelo menos um.
- **Backup & Restauração** (Configurações → Backup & Restauração): existe tela e rotina declarada de backup diário agendado, mas o endpoint do cron correspondente não foi localizado no levantamento — não dê isso como garantido sem o dono confirmar que está funcionando de fato.
- **Cartões de funcionalidade em telas "em construção"**: alguns módulos ainda exibem textos descritivos de automações que não necessariamente já estão ligadas a uma rotina real. Quando não tiver certeza de que uma automação descrita numa tela realmente dispara, não garanta que sim.
- **Confirmar um Contrato de Grãos não emite NF-e automaticamente.** A confirmação atribui número ao contrato e cria o CR (se houver valor), só isso. A emissão de NF-e é uma ação separada, em Faturamento/NF-e de Saída (Comercial & Logística) ou Documentos Fiscais → Notas de Venda.
- **Plantio e Pulverização Terrestre não lançam Conta a Pagar.** Os dois dão baixa no estoque do insumo usado e registram o custo correspondente (no Kardex e no custo da própria operação), mas não criam um CP novo — isso é proposital: o insumo já foi pago (ou já virou CP) na nota de compra; criar outro CP aqui duplicaria a dívida. Se o usuário perguntar "por que meu plantio não gerou conta a pagar", essa é a resposta correta — não é falha.
- **Aplicação Aérea**: a tela de salvamento encontrada não chama necessariamente a mesma rotina automática de baixa de estoque das operações diretas (Plantio/Pulverização/Adubação/Correção). Não garanta baixa idêntica sem o usuário confirmar no Kardex.

---

## MÓDULOS — O QUE CADA UM FAZ

### Cadastros → Pessoas e Entidades
Fornecedor, cliente, prestador, transportador, arrendante. **É do cliente (conta), não de uma fazenda** — um fornecedor cadastrado a partir de qualquer fazenda aparece em todas as fazendas do mesmo cliente, e o sistema evita cadastro duplicado pelo CPF/CNPJ em toda a conta, não só na fazenda ativa. Não oriente o usuário a recadastrar um fornecedor "porque ele não aparece nesta fazenda" — se ele existe em qualquer fazenda do mesmo cliente, já deveria aparecer; isso é sinal de algo a investigar, não comportamento esperado.

O botão "..." ao lado do CNPJ (no modal Editar/Novo Pessoa) busca dados públicos pra auto-preencher nome/endereço, via rota própria do servidor ("/api/cadastros/consultar-cnpj") — tenta a BrasilAPI primeiro e, se ela estiver fora do ar ou no limite de consultas (erro 5xx/429), tenta a ReceitaWS automaticamente antes de desistir (roda no servidor, não no navegador, porque a ReceitaWS não aceita chamada direta do navegador — CORS). Erro "404" significa que o CNPJ realmente não existe na Receita; "400" é dígito verificador errado — nesses dois casos não adianta tentar de novo, é o cadastro que está errado.

### Cadastros → Insumos: desativar sem excluir
Cada linha das listas de Insumos (e dos demais itens do estoque) tem um botão Desativar. Um insumo desativado deixa de aparecer nos seletores de uso: Nota de Entrada, Pedido de Compra, Notas Próprias, Transferência de Estoque e as operações de lavoura (Plantio, Adubação, Correção, Pulverização, Aplicação Aérea, Tratamento de Sementes). O histórico, o Kardex, a Posição de estoque e as telas de Cadastros continuam mostrando o item normalmente. Se o item já estava selecionado numa nota ou pedido aberto, ele continua aparecendo nesse campo até ser trocado. O botão vira Reativar para o item voltar aos seletores. Uso típico: depois de converter semente de kg para bag, desativar o cadastro antigo em kg para ninguém usar por engano. Atenção: desativar um item que ainda tem saldo impede escolhê-lo em transferências.

### Cadastros → Safras & Ciclos
Ano Safra é do cliente inteiro (vale pra todas as fazendas); Ciclo é específico de uma fazenda (campo "Fazenda" obrigatório no modal). **Ciclo Auxiliar** (toggle no topo do modal de Novo Ciclo) é usado pra cultura de cobertura/adubação verde sem receita própria — os custos dela são somados ao DRE de um Ciclo Principal escolhido, com um % de absorção configurável. Ao escolher o Ciclo Principal, Início/Fim do ciclo auxiliar vêm pré-preenchidos com as mesmas datas dele (editável) — é o caso normal de consórcio, onde as duas culturas ocupam a mesma área ao mesmo tempo.

O campo Cultura do ciclo (principal ou auxiliar) vem do cadastro de Cadastros → Culturas, filtrado pela categoria certa: ciclo principal só mostra culturas com categoria diferente de "Cobertura de Solo"; ciclo auxiliar só mostra as que têm categoria = "Cobertura de Solo". Se aparecer "nenhuma cultura de cobertura cadastrada", a cultura de cobertura (Milheto, Crotalária, Braquiária, etc.) precisa ser criada primeiro em Cadastros → Culturas → "+ Nova Cultura", com essa categoria.

**Consórcio (09/10/2026, precisa da Migration Seção 336 rodada)**: checkbox "Consórcio" na seção do Ciclo Auxiliar — marca que ele ocupa a MESMA área do Ciclo Principal ao mesmo tempo (ex.: Crotalária plantada junto com o Milho Verão, não depois dele). Sem marcar, o cálculo de disponibilidade de talhão soma a área do ciclo principal como "já ocupada" e trava o auxiliar em 0 ha disponível em todo talhão — marcando o Consórcio, a área do ciclo principal deixa de contar como ocupação pra esse auxiliar, liberando os mesmos talhões.

### Produção → Planejamento
Orçamento por ciclo (itens por categoria: sementes, fertilizantes, defensivos, correção de solo, operações, arrendamento, outros), comparativo planejado × realizado com desvio por categoria, e agenda de operações do ciclo. Ano-safra é da conta inteira — um "2025/2026" vale para todas as fazendas do cliente, não precisa recriar por propriedade.

### Produção → Plantio
Seletor em cascata obrigatório: Produtor → Fazenda → Ano-safra → Ciclo → Talhão. Informe área, data, semente/dose, produtividade e preço esperados. Ao salvar, dá baixa no estoque de sementes (dose × área) e registra o custo no Kardex e no próprio registro do plantio — **sem criar CP** (ver seção acima).

### Produção → Pulverização Terrestre / Aplicação Aérea
Tipos: herbicida, fungicida, inseticida, nematicida, acaricida, fertilizante foliar, regulador, dessecação, outros. Dá baixa de cada produto no estoque (dose × área) e calcula o custo total da aplicação — **sem criar CP** na Pulverização Terrestre. Aplicação Aérea: confira sempre no Kardex se a baixa ocorreu, não garanta que é automática.

Na grade de "Produtos Aplicados" (Pulverização Terrestre), a coluna **Total** também é editável — digitando o total aplicado o sistema calcula a dose/ha sozinho (total ÷ área), igual a digitar a dose calcula o total (dose × área). Os dois campos sempre ficam consistentes entre si; só funciona com a Área (ha) já preenchida, já que é ela que faz a conversão entre os dois.

### Produção → Adubação de Base / Correção de Solo
Registram consumo de fertilizante/corretivo e dão baixa de estoque, sem CP nova (mesmo motivo do Plantio). Correção de Solo trabalha normalmente em toneladas e converte para a unidade do cadastro do insumo (referência 60 kg = 1 saca quando a conversão usa sc).

**Adubação de Base — grid com colunas separadas e detalhe 13/10/2026**: a lista mostra as colunas Fazenda, Ano Safra, Ciclo e Talhão separadas (nessa ordem), e clicar numa linha abre um popup com os dados da aplicação e os produtos com dose, quantidade total e custo. O popup tem botão Editar.

**Adubação de Base — 2 bugs corrigidos 09/10/2026**: (1) a coluna "Safra / Talhão" do grid aparecia sempre em branco ("—") pra qualquer registro — a lista de aplicações já é conta-wide (mostra todas as fazendas juntas), mas a busca do nome do ciclo/talhão pra exibir só olhava a fazenda ativa da sessão; corrigido pra buscar em todas as fazendas da conta. (2) não existia botão de editar um lançamento já feito, só excluir — adicionado "✎ Editar" por linha, reabre o mesmo formulário preenchido; salvar a edição reverte o estoque do lançamento antigo e grava um novo no lugar (mesmo efeito de uma edição de verdade). Mesma classe de problema (grid sem editar, nem pra Plantio/Pulverização/Correção de Solo/Colheita Própria) — só Adubação de Base foi corrigida até agora, reportar se o dono pedir as outras.

### Produção → Tratamento de Sementes
Estados: planejada → em tratamento → concluída / cancelada. A baixa de estoque só acontece se a opção "baixar estoque" for marcada ao concluir — não é automática por padrão.

### Produção → Monitoramento (Mapa, Recomendações, Pragas, Pluviometria)
Registros de campo por talhão/data. Um registro de monitoramento (praga, chuva) não cria sozinho uma aplicação — são rotinas independentes.

### Produção → Colheita
Fluxo em 2 etapas: (1) crie o registro de colheita com fazenda/ciclo/talhão/área/data; (2) adicione romaneios por caminhão (placa, peso bruto, tara) com classificação por commodity — Soja segue parâmetros ABIOVE (umidade padrão 14%, impureza padrão 1%, avariados agregando ardidos/mofados/fermentados/germinados/esverdeados/quebrados/carunchados); Milho segue IN MAPA 60/2011 (umidade padrão 14,5%, impureza, avariados, chochos, ardidos, fermentados). Confirmar a entrada dá baixa bruto-menos-tara no estoque e atualiza a produtividade do ciclo — salvar como rascunho não é o mesmo que confirmar.

### Produção → Máquinas
Cadastro de máquinas/veículos é por fazenda, mas o seletor em outras telas (NF, Seguros, Contratos Financeiros) busca em todas as fazendas da conta. Abastecimento de combustível dá baixa automática no estoque da bomba/insumo e pode vincular a um Ano-safra/Ciclo (opcional). Manutenções e Custos por Máquina são relatórios de histórico.

### Produção → Algodão (add-on opcional)
Só aparece para contas com o módulo habilitado. Safra & Operações (defolhação, regulador de crescimento), Monitoramento de Bicudo (armadilhas por talhão, alerta automático a partir de 8 capturas/armadilha/semana), Colheita & Módulos (campo → transporte → algodoeira), Algodoeira/Beneficiamento (rendimento de pluma), HVI & Qualidade (laudo por lote, 11 parâmetros USDA/HVI) e Posição de Algodão (preço ICE/CBOT, valor do estoque de pluma).

### Comercial & Logística → Pedido de Compras
Status: rascunho → aprovado → parcialmente entregue → entregue / cancelado. Pedido aprovado com valor e sem CP vinculado pode gerar o CP automaticamente ao processar a NF de entrada relacionada — confira o campo "lancamento_id" antes de lançar manualmente, para não duplicar. Pedido com NF de entrada vinculada não pode ser excluído — use status Cancelado. Pagamento em barter gera um título em moeda "barter" e, se houver volume comprometido, um contrato de entrega de grãos vinculado ao próprio pedido.

**Bug corrigido 09/10/2026 — pedido com várias NFs (entrega parcial) apagava o CP das anteriores**: quando um pedido já tinha "lancamento_id" (de uma NF processada antes) e chegava outra NF pro MESMO pedido, o sistema reaproveitava esse lançamento e sobrescrevia valor/descrição/nf_entrada_id com os dados da nova NF — cada NF nova apagava o CP da anterior, deixando só a última NF processada com saldo em aberto de verdade (achado num pedido de corretivo com 10 NFs da Centro Oeste Mineração, só a última tinha CP; as outras 9 ficaram com "lancamento_id" fantasma, apontando pro lançamento que já era de outra NF). Corrigido em processarNfEntrada (lib/db.ts): só reaproveita o lançamento do pedido se ele ainda não tiver dono (nf_entrada_id nulo) ou já for desta mesma NF; senão, a NF ganha um lançamento novo e independente — cada NF entregue contra o pedido passa a ter seu próprio CP. Backfill das NFs já afetadas por esse bug (achadas em 6 contas, ~R$13,2 milhões de CP que não aparecia no grid) é tarefa separada, pendente de autorização do dono antes de rodar em conta de cliente real.

**Relatório de Pedidos de Compra** (Comercial & Logística → Relatórios → Pedidos de Compra — rota própria "/relatorios/pedidos-compra", não vive mais dentro de Financeiro → Relatórios Financeiros): além de fornecedor, status, ano safra e período, tem filtro por **Grupo** e **Item (insumo)** — útil pra achar em qual pedido um produto específico está, sem precisar abrir pedido por pedido. Item é filtrado em cascata pelo Grupo escolhido. Tem duas Visões: **Por Pedido** (padrão — 1 página por pedido, com os itens e as NFs vinculadas daquele pedido) e **Consolidado por Insumo** (soma, por insumo, a quantidade pedida/entregue/cancelada/saldo e o valor total em TODOS os pedidos que contêm aquele item dentro do filtro aplicado, com o número de pedidos diferentes envolvidos; em modo Detalhado mostra também a lista desses pedidos por item). Na visão por Pedido, o filtro de Grupo/Item só restringe quais PEDIDOS aparecem — dentro de cada pedido encontrado continuam aparecendo todos os itens dele. Na visão Consolidado por Insumo, quando um Item ou Grupo é escolhido, só entram na soma os itens daquele insumo mesmo que o pedido também tenha outros produtos (e só entram itens vinculados a um insumo do catálogo — item avulso sem insumo_id não aparece). O cabeçalho do PDF mostra a logo e o nome do cliente (conta), não mais um nome genérico fixo.

### Documentos Fiscais → Notas de Terceiro (NF de Produtos)
A barra de filtros tem, além de Tipo (NF/NFS/CT-e), busca e período: **Status**, **Tipo de Entrada** (Insumos, Combustível, Peças/Manut., Consumo, Aprop. Direta, VEF, Remessa, Devolução) e **Origem** (Manual, XML, Sieg, Leitor) — os três como dropdown com caixa de múltipla seleção (marca vários valores, "Limpar seleção" tira o filtro). Tipo de Entrada e Origem eram só badges na lista antes, sem filtro.

Captura (XML, SIEG ou digitação manual) e processamento são fases distintas — uma nota "capturada" ou "classificada" pelo SIEG ainda não gerou estoque nem CP até ser processada de fato. No processamento, cada item pode ir para estoque, direto para uma máquina ou direto para um centro de custo (Apropriação Direta), conforme a Operação Gerencial escolhida no cabeçalho. Produto sem unidade compatível com o cadastro pode usar "Conversão manual (livre)" — você digita o total já na unidade do insumo. Para desfazer uma nota processada, use Estornar antes de reprocessar (reverte estoque, CP e pendências fiscais) — nunca edite o cabeçalho de uma nota já processada direto.

**DANFE com a logo do cliente**: o botão "↗ DANFE" (de qualquer documento fiscal — NF de entrada, devolução, remessa, NF-e emitida) busca a logo cadastrada na conta e a imprime no canto da identificação do emitente. A logo só aparece se a conta tiver logo cadastrada (Configurações ou upload inicial do cliente) — sem logo, sai só o texto, sem erro nenhum.

**Devolução de Compra**: botão "↩ Devolver" (card da NF em Documentos Fiscais, ou dentro do modal da NF já processada) emite uma NF-e de devolução de verdade na SEFAZ (saída, de volta ao fornecedor, CFOP 5201/6201 por padrão; a lista também oferece 5202/6202 com substituição tributária, 5556/6556 para material de uso ou consumo e 5413/6413 para uso ou consumo com substituição tributária). O CFOP já vem sugerido pelo da compra (1556 sugere 5556, 2556 sugere 6556, 1407 sugere 5413, 2407 sugere 6413, 1403/1102 sugerem 5202, 2403/2102 sugerem 6202, 2201/2101 sugerem 6201); sem correspondência vale 5201, e dá para trocar. Cada produto da NF de devolução tem o seu próprio CFOP (coluna CFOP deste produto, na lista de itens da janela Devolver; o CFOP escolhido fica gravado no item da NF de devolução). O CFOP de cada produto já vem sugerido pelo CFOP que o próprio item tinha na NF de compra (1556 sugere 5556, 2556 sugere 6556, 1407 sugere 5413 etc.): o CFOP do cabeçalho da tela é só o padrão que se aplica a todos os itens de uma vez, e depois dá para ajustar item a item, por exemplo um item de uso ou consumo com 5556 e outro com 5202. A natureza da operação é uma só (Devolução de Compra). Todos os CFOPs da mesma NF precisam ser do mesmo grupo, 5xxx (dentro do estado) ou 6xxx (interestadual), porque a NF tem um só destino; o sistema bloqueia se misturar. Só aparece em NF processada do tipo **Insumos**, **Peças / Manut.** ou **Aprop. Direta**. Entram na lista de devolução os itens que foram pro estoque e também os de Apropriação Direta (marcados na lista como Aprop. Direta); item lançado direto numa máquina como maquinário não entra. Informe a quantidade a devolver por item da NF; o sistema limita ao saldo ainda não devolvido (devoluções anteriores já feitas pelo sistema são descontadas). Item de estoque dá saída no estoque. Item de Apropriação Direta reverte o custo proporcional à quantidade devolvida: no DRE e nos custos do ciclo o valor devolvido abate o custo do item, e quando o item virou abastecimento ou manutenção de máquina o custo desse registro é reduzido na mesma proporção. O título a pagar da NF original não é alterado: a devolução gera um título a receber do fornecedor. Requer a Seção 345 do supabase_migrations.sql. O destinatário da NF de devolução (o fornecedor) busca endereço/IBGE do cadastro de Pessoas; se faltar lá mas o CEP estiver preenchido, completa automaticamente pelo CEP antes de emitir — erro "Código IBGE... não informado" ainda pode aparecer se nem o CEP estiver cadastrado.

**Peças / Manutenção com Apropriação "Estoque"**: nesse tipo de NF, cada item normalmente é vinculado a uma máquina (vai direto pro maquinário, não pro estoque) — mas a Apropriação do item pode ser trocada pra "Estoque" quando a peça entra pro estoque em vez de ser consumida direto. Quando isso acontece, aparece um seletor de insumo do catálogo (com botão "+" pra cadastrar um novo na hora) embaixo do campo Descrição — exatamente como no tipo Insumos. Sem escolher um insumo ali, o processamento bloqueia com o erro "associe um insumo... antes de processar".

**Bug corrigido 09/10/2026 — seletor de Ciclo na NF não mostrava todos os ciclos cadastrados**: o dropdown de Ciclo (aba Operações, quando a NF está vinculada a um ano safra) filtrava pela fazenda ATIVA da sessão (TopNav), não pela fazenda DONA da própria NF — como Documentos Fiscais lista NFs de todas as fazendas da conta de uma vez, abrir uma NF de uma fazenda diferente da ativa escondia os ciclos certos (mostrava os da fazenda ativa, ou nenhum). Corrigido: agora usa sempre a fazenda da NF sendo editada.

**Emitir NF Remessa**: abre o wizard de Notas de Venda pré-preenchido a partir da NF de Entrada de origem — Produtor remetente já vem selecionado (é quem recebeu a mercadoria naquela NF, agora remetendo pro armazém/depósito), itens de estoque pré-carregados, CFOP começa em 6.905 (interestadual) e troca sozinho pra 5.905 assim que o Destinatário (armazém) escolhido tiver a mesma UF do emitente — nos dois casos a lista de CFOP nesse modo mostra só os códigos de remessa (6.905/5.905/6.117/6.119), sem opções de venda/devolução que não se aplicam aqui. Ao escolher o Destinatário no catálogo de Pessoas, se o cadastro tiver CEP mas faltar endereço ou código IBGE, o sistema busca automaticamente pelo CEP (ViaCEP) pra completar.

Na aba Retirada/Entrega, "Local de Retirada" e "Local de Entrega" são seletores dos Depósitos cadastrados (com opção "✎ Outro" pra digitar livre quando o local não é um depósito do cadastro). Em modo Remessa, os dois vêm pré-preenchidos sozinhos: Retirada = o depósito onde a mercadoria ficou guardada ao dar entrada na NF original; Entrega = o Depósito de Terceiro já vinculado ao CNPJ do Destinatário escolhido, se existir um cadastrado. Só muda automaticamente se o campo ainda estiver vazio — escolha manual do usuário nunca é sobrescrita.

### Documentos Fiscais → Notas de Serviço (NFS-e)
Separada da nota de produtos — wizard Prestador → Serviço (código LC 116/2003) → Tributação (ISS e retenções federais: PIS, COFINS, CSLL, IRRF, INSS). O tomador normalmente é a própria fazenda/produtor contratante.

### Comercial & Logística → Faturamento / NF-e de Saída
**Série e número da NF-e de saída (corrigido 13/10/2026)**: a série e o número vêm sempre de Parâmetros → Fiscal do emitente e da inscrição estadual escolhidos (campos Série NF-e e Próx. Número NF-e). O campo Série da tela mostra Auto e não é editável. Ao salvar o rascunho (status Processando), a nota já fica com a série e o número de Parâmetros; o número definitivo é reservado na transmissão para a SEFAZ e a série real também é gravada na nota ao autorizar. Antes disso, rascunhos novos apareciam com série 1 e número sequencial local, sem relação com a configuração. Rascunhos antigos criados nesse formato são corrigidos sozinhos quando transmitidos. Se a série ou o número aparecerem errados, conferir Parâmetros → Fiscal → NF-e da IE correta.
Tela de emissão das NF-e da própria fazenda/produtor (nunca de documentos de terceiro — isso é em Documentos Fiscais → Notas de Terceiro). "+Nova NF-e" abre 3 formas de iniciar: **Por Contrato** (puxa dados de um contrato de grãos confirmado), **Avulsa — Venda** (venda sem contrato, CFOP 6.501/6.101/5.101 etc.) e **Remessa** (depósito em armazém geral 6.905/5.905, entrega futura 6.117 ou venda à ordem 6.119) — essa é a remessa de **produto agrícola** (grão) para armazém geral, diferente da "Emitir NF Remessa" de insumo descrita acima (aquela parte de uma NF de Entrada; esta parte de um contrato/venda avulsa de grão).

**Retorno de Armazém Geral** (trazer de volta o grão enviado por uma Remessa): não é mais um card genérico de "Devolução/Retorno" que caía num formulário de venda — hoje é um botão **"↩ Retorno"** que aparece direto na linha de qualquer NF de Remessa (CFOP 6.905/5.905) autorizada, na tabela da própria tela de Faturamento. Clicar nele pré-preenche tudo a partir da remessa original (destinatário, itens, CFOP espelhado 6.906/5.906, referência à chave da NF de remessa) — só confirma e emite. Depois de retornada, a linha mostra "✓ Retornada" no lugar do botão (não dá pra retornar a mesma remessa duas vezes). O card "Retorno de Armazém Geral" no "+Nova NF-e" é um atalho que lista as remessas autorizadas aguardando retorno e abre o mesmo fluxo. **Devolução de mercadoria comprada ou vendida não é emitida aqui** — devolução de compra é em Documentos Fiscais → Notas de Terceiro (botão "↩ Devolver", ver acima); devolução de venda (cliente devolvendo grão) é recebida como documento de terceiro, não emitida pela fazenda.

### Comercial & Logística → Transferência entre Fazendas
Fluxo: Rascunho → Emitir NF → (Confirmar Entrada, se não automática). CFOP correto: 5.151/6.151 para mercadoria de **produção própria**; 5.152/6.152 para mercadoria **adquirida de terceiros**. O catálogo do insumo (nome, categoria, unidade) é compartilhado por toda a conta; o saldo/estoque é sempre calculado por fazenda. Cancelamento de NF já autorizada só é possível dentro de 24h (regra da SEFAZ) e exige justificativa.

**Replicar (⧉):** disponível em qualquer transferência, de qualquer status. Abre uma cópia nova (rascunho), totalmente editável — inclusive os itens: dá para adicionar, remover e trocar insumo/quantidade/custo livremente antes de emitir de novo. Não altera nem referencia a transferência original.

O seletor de Insumo, por item, tem busca por texto (digite parte do nome pra filtrar) — útil quando o catálogo da fazenda tem muitos itens cadastrados.

### Comercial & Logística → Contratos de Grãos
Status: aberto → parcial → encerrado / cancelado. Confirmar o contrato atribui número e cria o CR quando há valor — **não emite NF-e** (isso é uma ação separada). Romaneio de entrega atualiza o saldo do contrato e o status automaticamente. Adiantamento de cliente gera CR já baixado, que abate contra o CR de cada entrega futura (FIFO, do mais antigo primeiro).

### Comercial & Logística → Compromissos em Grãos
Relatório somente leitura: reúne contratos de grãos originados de arrendamento, compra de terra e barter, com progresso de entrega por commodity.

### Comercial & Logística → Expedição de Grãos
Rotas mutuamente exclusivas por carga: Transbordo sem NF · Transbordo com Remessa (CFOP 5905) · Direto ao Comprador (CFOP 6101). Pipeline: rascunho → em_trânsito → entregue → corrigindo_peso → encerrada. **O "Emitir MDF-e" desta tela é simulado** (ver seção acima) — para MDF-e real, use o módulo de Transporte. Divergência de peso acima de 1% no destino sinaliza necessidade de NF complementar.

### Comercial & Logística → CT-e / MDF-e (Transporte)
Este é o MDF-e e CT-e reais, que transmitem à SEFAZ — inclusive o MDF-e aberto a partir da Expedição de Grãos cai aqui para a emissão de verdade. Exigem emitente com certificado A1 configurado. Situação tributária do CT-e segue regra por UF (intraestadual → CST 51 diferido; interestadual → CST 00 ou 20). Transferência entre estabelecimentos do mesmo titular usa CST 41 (não tributado); venda usa CST 51 (diferido) — nunca o mesmo CST para as duas operações. Desde 05/01/2026, emitentes Lucro Presumido/Real são obrigados a destacar IBS/CBS no CT-e (Simples Nacional e MEI são dispensados) — configurável em Parâmetros → CT-e.

### Financeiro → Contas a Pagar / Contas a Receber
**Tela antiga/erro em tela que já mudou (13/10/2026)**: se uma tela aparecer diferente do esperado ou com erro de banco (por exemplo o Contas a Pagar antigo, com a mensagem "Could not find a relationship between pagamento_lote_itens and lancamentos"), a aba do navegador provavelmente está com uma versão antiga do sistema. Solução: recarregar a página (Ctrl+Shift+R, ou Cmd+Shift+R no Mac). O sistema agora confere a versão quando você volta para a aba e recarrega sozinho ao trocar de tela se houver versão nova.

**Olívia não envia mensagem (corrigido 13/10/2026)**: o botão de enviar do balão da Olívia não fazia nada quando a conversa não tinha sido criada ao abrir (acontecia com usuário sem conta vinculada, como a equipe Raccolto atendendo um cliente, ou com sessão vencida). Agora a conversa é criada pelo servidor na hora do envio e, se algo falhar, a Olívia mostra o motivo no próprio chat em vez de ficar parada.

**Cadastro de fornecedor direto da NF (15/10/2026)**: na entrada da NF, acima e à direita do seletor de fornecedor, o rótulo pequeno Cadastro Fornecedor aparece quando o emitente da NF ainda não está vinculado a um cadastro. Ele abre o popup de cadastro já com o CNPJ e o nome da NF; para CNPJ o sistema consulta a Receita Federal e preenche razão social, endereço, telefone, e-mail, inscrição estadual e código IBGE, e você edita só o que precisar. Para CPF não há consulta pública: o popup abre com o CPF e o nome da NF. Ao cadastrar, o fornecedor já fica selecionado na NF.

**Relatório CP/CR por janela de filtro (19/10/2026)**: em Financeiro → Relatórios → CP / CR, clique em Abrir filtro e gerar. Na janela escolha o vencimento (de/até; vazio traz tudo), o tipo (CR, CP ou todos), os status, categorias e produtores marcando as caixas (nenhuma marcada = todos), parte do nome do fornecedor e a emissão: PDF abre em tela para imprimir e XLSX baixa o arquivo. Ao confirmar o relatório sai direto, sem abrir a tela com todos os registros. Se nenhum lançamento atender ao filtro, o sistema avisa. A consulta ao vivo (grid com filtros, colunas e agrupamentos) continua pelo link Consultar em tela.

**Produtor nos títulos (19/10/2026)**: no relatório CP/CR, a coluna Produtor mostra o produtor do título e, em título de Empresa (PJ), o nome da empresa dona. Ao processar NF de entrada sem escolher o produtor, o CP recebe o produtor da conta cujo CPF/CNPJ é o do destinatário da NF; com dois produtores de mesmo documento usa o da fazenda da NF, e sem desempate seguro fica em branco. O CP de NFS-e leva o produtor quando o tomador é um produtor. Títulos antigos sem produtor continuam em branco até serem preenchidos (edição do título ou rotina de preenchimento).

**Juros × amortização nas parcelas dos Contratos Financeiros (19/10/2026)**: (1) Ao clicar em Usar cronograma do PDF, o sistema separa em cada parcela o juros e a amortização pela taxa implícita do cronograma da cédula (a taxa por período que zera o saldo no último vencimento), com saldo devedor; antes a prestação inteira ia para amortização e os juros ficavam em zero. (2) O sistema de amortização do contrato (Price, SAC, SACRE) vem da coluna tipo_amortizacao; antes uma coluna antiga com padrão SAC fazia contratos Price abrirem e calcularem como SAC. (3) Editar o Valor da Parcela mantém os juros do período e ajusta a amortização, recalculando o saldo devedor adiante. (4) Em Pagamento, o botão Repartir juros × amortização refaz a divisão das parcelas não pagas de contratos antigos, mantendo o valor de cada parcela; depois use Salvar Parcelas e Lançar no CP para recriar os lançamentos em aberto. Parcelas já pagas não são alteradas.

**IOF e tarifas financiados nos Contratos Financeiros (19/10/2026)**: em cédulas em que o banco soma IOF/tarifas ao valor contratado e deposita só o líquido (contratado 206.972,70 = liberado 200.000,00 + IOF 6.972,70), informe em Principal → Taxas e custos o IOF financiado (R$) e as Tarifas/seguro financiados (R$); a leitura por IA preenche esses campos e o valor liberado. Na aba Liberação, a data e o valor líquido liberado já vêm preenchidos; ao clicar em Adicionar, o sistema registra a liberação do líquido e lança o IOF (operação gerencial IOF) e as tarifas (Tarifas bancárias) como despesa, com a captação correspondente, ambos já baixados na mesma data e conciliados, então o caixa da conta de liberação continua sendo só o líquido, a dívida fica no valor contratado e o Saldo a liberar fica zerado. Se a liberação já existia sem o IOF, o botão Lançar IOF/tarifas financiados faz o lançamento. Excluir a parcela do IOF apaga também o CP dela. Exige a Seção 349 do banco.

**Sincronização com o SIEG (19/10/2026)**: o Arato busca sozinho no SIEG, às 7h e às 13h (Brasília), as NF-e de entrada e as NFS-e emitidas contra os CPF/CNPJ cadastrados em Configurações → Integrações → Sieg; entram como NF pendente (sem estoque nem financeiro até processar). Por conta é usada a fazenda com a sincronização manual mais recente. O botão de sincronizar da tela continua valendo para buscar na hora ou por período. A próxima busca começa 1 dia antes do fim da anterior; notas já importadas são ignoradas pela chave de acesso. Se uma nota falhar ao salvar ou a busca for por período escolhido, a data de última sincronização não avança. O SIEG só entrega a nota depois que a SEFAZ a repassa a ele, então uma nota recém-emitida pode levar algum tempo para aparecer.

**Produtor em CP/CR e na Conciliação (19/10/2026)**: (1) Em Contas a Pagar e a Receber há a coluna Produtor (nome do produtor dono do título; em títulos de Empresa, o nome da empresa), o campo no popup do título e o filtro Produtor no bloco de filtros, que valem também para títulos baixados. (2) Na Conciliação Bancária, o popup aberto ao clicar no OFX vinculado lista Produtor/Empresa e Documento de origem de cada título, a conta do extrato com o titular, e avisa pago por outro titular quando o titular da conta é diferente do dono do título (empresa pagando conta de outra, CPF pagando conta de PJ). A coluna Produtor da lista de títulos mostra o titular da conta de baixa quando já baixado e o produtor do título quando em aberto. (3) A exportação Excel do relatório CP/CR busca no banco o Nº da NF e a Operação Gerencial de cada título; antes saíam em branco.

**Impressão de DFC e Posição por Conta (19/10/2026)**: Imprimir / PDF nessas abas gera relatório próprio, sem os filtros e botões da tela. DFC sai com as categorias por mês do exercício (realizados ou realizados + previstos, conforme a chave da tela), resultado do mês e saldo acumulado; Posição por Conta sai com os saldos atual e projetado por conta e totais. O cabeçalho informa o escopo (todas as fazendas da conta).

**Impressão do relatório CP/CR (19/10/2026)**: em Financeiro → Relatórios → CP / CR, Imprimir / PDF gera um relatório próprio (resumo dos filtros, totais de CR, CP, vencidos e baixados, e a tabela com as colunas visíveis), sem os filtros e botões da tela. O cabeçalho informa o escopo: Todas as fazendas da conta (os relatórios somam todas as fazendas, não só a ativa no topo) ou os produtores marcados no filtro Produtor. Agrupamentos da tela não são impressos; a lista sai plana.

**Filtro de Moeda em CP/CR (19/10/2026)**: o bloco de filtros de Contas a Pagar e a Receber tem o campo Moeda (Real, Dólar, Barter), de seleção múltipla; vazio mostra todas. Em CP, \"Limpar filtros\" também o limpa.

**Recursos de CP/CR restaurados (19/10/2026)**: (1) Efetivar: ao editar um lançamento previsto aparece ⚡ Efetivar, que muda para Real antes de salvar. (2) Baixa do CP: título lançado à mão e sem NF abre Vincular Nota Fiscal à Baixa (busca NF-e/NFS-e pendentes; "Baixar sem NF" segue direto); títulos de NF, folha, contratos, impostos e similares não passam por essa etapa. (3) Na janela de baixa há o bloco Classificação (fornecedor/cliente, ano safra, ciclo, operação gerencial; no CP, a caixa de salvar como padrão do fornecedor) e, em baixa parcial, a nova data de vencimento do saldo. (4) CP, aba Adicionais (lado Produtor): % Juros a.m., % Multa, % Desc. pontualidade; Veículo/Máquina; e, quando a operação gerencial é Mão de Obra (2.01.01.10), Funcionário/Prestador, Tipo, Unidade e Quantidade. (5) CP parcelado: cada parcela pode ter safra e ciclo próprios (rateio por vencimento). (6) Atalhos de status acima dos filtros: Todos, Vencidos, Vencendo (7 dias), Parciais, Baixados, Barter, Contratos financeiros, Compra de terra. (7) Título em sacas (barter) abre a baixa como Confirmar entrega (barter).

**Dólar e filtro de Valor em CP/CR (19/10/2026)**: no grid de Contas a Pagar e a Receber, o lançamento em dólar mostra o valor em reais (cotação gravada no lançamento; sem ela, a PTAX do dia, marcada com "· PTAX") e abaixo, menor, o valor em US$. Pago, Saldo e o detalhe usam o símbolo US$ nesses títulos, e os totais do filtro somam em reais. Sob o cabeçalho da coluna Valor há um filtro que aceita número exato, >n, <n ou faixa n-m; \"Limpar filtros\" também o limpa (os demais filtros ficam na barra acima).

**Tomador "Outros" no CT-e (19/10/2026)**: em Transporte → CT-e, o campo Tomador do Serviço tem as opções Remetente, Destinatário, Expedidor, Recebedor e Outros (terceiro). Em Outros, abre o bloco Tomador do serviço (Outros) para informar nome, CNPJ/CPF (obrigatório), IE e endereço, com atalho para escolher de Produtores ou Pessoas. O XML usa o grupo toma4 (tomador 4), a IE do tomador define o indicador de contribuinte, e o DACTE e o CR do frete mostram esse tomador. Exige a Seção 348 do banco.

**CFOPs 5934/6934 e 5556/6556 na emissão (15/10/2026)**: na tela de Nota de Venda/Remessa (Documentos Fiscais) e no Faturamento, o campo CFOP traz, em Remessas, 5.934/6.934 (remessa simbólica para armazenagem, ICMS CST 41) e, em Devoluções, 5.556/6.556 (devolução de compra de uso ou consumo, ICMS CST 20). Ao escolher 5.556/6.556 aparecem Redução da base (%), obrigatória, e Alíquota ICMS (%), que assume 17% interna ou 12% interestadual quando vazia. A devolução feita a partir de uma NF de entrada (botão Devolver) já oferecia esses CFOPs por item.

**Cadastro rápido no lançamento de CP e CR (15/10/2026)**: no Novo lançamento de Contas a Pagar o rótulo pequeno Cadastro Fornecedor (e, em Contas a Receber, Cadastro Cliente) fica acima e à direita do seletor da pessoa, nos dois lados (Produtor e Empresa). Abre o mesmo popup da NF, com o documento em branco: digite o CNPJ e clique em Consultar para a Receita Federal preencher os dados. Ao salvar, a pessoa já fica selecionada no lançamento.

**CFOP 5934 e 5556 (15/10/2026)**: a remessa simbólica de mercadoria depositada em armazém (CFOP 5934/6934) sai com ICMS CST 041; a devolução de compra de material de uso ou consumo (CFOP 5556/6556) sai com ICMS CST 020, que exige a redução da base de cálculo: na janela Devolver, o item com esse CFOP mostra os campos Redução da base % (obrigatório) e Alíquota ICMS % (padrão 17% interno e 12% interestadual). Os dois modelos de operação (Remessa Simbólica para Armazenagem e Devolução de Compra, Uso/Consumo) também estão em Configurações, Operações Fiscais.

**Conciliação: relação dos títulos (15/10/2026)**: na Conciliação Bancária, clicar no texto com seta (→ descrição do título) abaixo de uma linha do extrato conciliada abre um popup com todos os CPs e CRs ligados àquela conciliação (tipo, fornecedor ou cliente, descrição, vencimento, baixa, status e valor, com o saldo no rodapé). Serve principalmente para a conciliação em lote ou borderô, em que uma linha do extrato cobre vários títulos.

**Adiantamento na baixa: valor editável (15/10/2026)**: no quadro Adiantamento disponível deste fornecedor, o valor a aplicar é editável para permitir o uso parcial do adiantamento; o saldo que sobra continua disponível para outros títulos do mesmo fornecedor.

**Usar adiantamento a fornecedor na baixa (15/10/2026)**: ao baixar um título do produtor em Contas a Pagar (inclusive o gerado por uma NF de entrada), se o fornecedor do título tem adiantamento com saldo (na mesma moeda), a janela de baixa mostra o quadro Adiantamento disponível deste fornecedor, com o valor sugerido (o menor entre o saldo do adiantamento e o saldo do título), que pode ser ajustado, e o botão Aplicar. A aplicação abate o título (total ou parcial) e reduz o saldo do adiantamento; se cobrir o título inteiro, ele fica baixado sem movimento bancário; se cobrir só parte, o valor a pagar pelo banco é recalculado. O título precisa ter o fornecedor (pessoa) preenchido e não pode ser barter. Esta função existia na tela antiga e tinha se perdido na tela unificada de Contas a Pagar.

**Edição de título no Contas a Pagar e a Receber abre completa (15/10/2026)**: ao editar um título do produtor, a tela agora carrega do registro todos os campos que ele tem: Fazenda e Talhão (além de Produtor, Ano Safra e Ciclo), Série do documento e, quando a forma de pagamento é cartão, o cartão. A Série digitada passa a ser gravada (antes o campo aparecia mas nunca era salvo). Título que faz parte de um parcelamento mostra no cabeçalho da edição o selo Parcela N/total. Contas a Pagar também completa Ano Safra e Produtor vazios com os da data de vencimento e do funcionário.

**Títulos de salário no Contas a Pagar (15/10/2026)**: o CP de salário gerado pela Folha de Pagamento agora nasce com o funcionário, o produtor ou a empresa dele e o Ano Safra da data de vencimento, e aparece com Lançado via Folha de Pagamento. A coluna Fornecedor mostra o nome do funcionário (que está na descrição) quando o título não tem fornecedor cadastrado. Ao abrir um título antigo que veio sem Ano Safra ou sem Produtor, a tela de edição já abre com o Ano Safra da data de vencimento e o produtor do funcionário, em vez de campos vazios. Títulos de folha anteriores foram completados (origem, funcionário, ano safra e, onde o funcionário tem vínculo cadastrado, produtor ou empresa). Funcionário sem Produtor ou Empresa no cadastro (coluna Produtor / Empresa da lista de Funcionários) continua gerando título sem esse vínculo: preencha no cadastro.

**Estorno e exclusão de NF desfazem todos os títulos (15/10/2026)**: ao estornar uma NF de entrada processada, o sistema agora remove os títulos a pagar dela de verdade, tanto do produtor (inclusive todas as parcelas) quanto da Empresa (NF destinada a transportadora); antes só os do produtor eram removidos e o título da Empresa ficava para trás, duplicando o valor ao processar de novo. Excluir uma NF também remove todos os títulos, e não só o primeiro. Se algum título da NF já foi baixado, conciliado com o extrato ou está em borderô, o estorno e a exclusão são recusados antes de mexer em qualquer coisa, com a mensagem do que precisa ser desfeito primeiro.

**Devolução no Monitor de NF-e Emitidas e cancelamento (14/10/2026)**: toda NF-e de devolução de compra emitida passa a aparecer também em Fiscal, Monitor de NF-e Emitidas (natureza Devolução de Compra), onde dá para ver o DANFE e cancelar. Ao cancelar a NF-e de devolução no Monitor e a SEFAZ aceitar, o sistema desfaz a devolução: devolve ao estoque o que tinha saído, exclui o título a receber do fornecedor (se ainda em aberto; se já baixado, avisa para estornar a baixa), retira os itens da devolução e libera de novo o saldo devolvido na NF de origem, que então pode ser devolvido com a NF-e correta (por exemplo, com o CFOP certo de cada produto). Custos de Apropriação Direta ligados a abastecimento ou manutenção de máquina que a devolução tinha reduzido não são restaurados automaticamente. Para os CFOPs de cada produto, o campo CFOP da lista de itens vem sugerido pelo CFOP do item na NF recebida, inclusive quando o fornecedor emitiu em CFOP de saída (5102 sugere 5202, 5405 sugere 5411).

**Pedido de Compra no Fluxo de Caixa (14/10/2026)**: ao aprovar um pedido, o Contas a Pagar ganha um título do pedido com o valor total, que alimenta o fluxo de caixa projetado. Cada NF vinculada ao pedido e processada gera o seu próprio título e o título do pedido passa a valer só o saldo: total do pedido menos o total das NFs processadas. Quando as NFs cobrem o pedido, o título do pedido é cancelado automaticamente (observação Saldo do pedido zerado pelas NFs vinculadas); se uma NF for estornada ou excluída, o saldo volta e o título é reativado. Antes, a primeira NF assumia o título do pedido e o saldo ainda não faturado sumia do fluxo. O pedido barter não entra nessa regra. Se o total do pedido estiver digitado errado (por exemplo com três zeros a mais), o saldo também fica errado: corrija o total no pedido.

**Lançar férias (14/10/2026)**: em Cadastros, Funcionários, Editar, aba Férias, o botão + Lançar férias abre a concessão no período mais antigo ainda em aberto; se o funcionário não tem nenhum período (por exemplo, sem data de admissão), o sistema cria um período avulso e abre a concessão mesmo assim. Cada linha da lista também tem o botão Conceder em qualquer período que ainda não foi concedido ou gozado (inclusive um período ainda em formação, o que equivale a antecipar férias). A concessão calcula férias mais 1/3 e abono, lança o Contas a Pagar com o Ano Safra da data de vencimento e o produtor ou a empresa do funcionário, e depois dá para Marcar gozada ou Cancelar a concessão (apaga o CP em aberto).

**Baixa nunca passa do valor do título (14/10/2026)**: o sistema recusa baixar, em Contas a Pagar, Contas a Receber e no financeiro da Empresa (inclusive ao aceitar sugestão na Conciliação), um valor pago que, somado ao que já foi pago, passe do valor do título. Juros e multa só ampliam o limite quando informados na própria baixa (limite igual ao valor mais multa mais juros menos desconto); sem eles, pagar a mais é recusado com a mensagem de informar juros ou multa ou corrigir o valor. Em dólar, o limite usa a cotação do título. Baixas antigas acima do valor continuam como estão e a auditoria diária as conta.

**Parcelar um título que já está no Contas a Pagar (14/10/2026)**: para um título lançado com vencimento único e depois negociado em parcelas, abra-o em Editar, escolha Condição de Pagamento Parcelado, informe o número de parcelas e a frequência, clique em Gerar, ajuste datas e valores na grade se precisar e use o botão Salvar e dividir em N parcelas. A 1ª parcela é o próprio título (editado) e as demais são criadas com o mesmo agrupamento, para Produtor e para Empresa; nada é apagado nem duplicado. Dá para parcelar com total diferente do original (juros ou desconto da negociação): ajuste os valores na grade. Só vale para título em aberto, sem baixa, conciliação nem borderô, que ainda não seja parcela de outro parcelamento e que não seja em sacas (barter). A diferença de arredondamento vai na última parcela.

**NF já processada não processa de novo (14/10/2026)**: tentar processar (individual ou em lote) uma NF que já está processada mostra o aviso para estornar antes; o estorno reverte estoque e financeiro e a NF volta a pendente. Se o título a pagar da NF já foi baixado ou conciliado, o estorno e o reprocessamento param com a mensagem de desfazer primeiro a baixa ou a conciliação, em vez de deixar o título antigo e criar outro ao lado.

**NF duplicada (14/10/2026)**: ao lançar uma NF de Produtos nova (manual ou por XML) com chave de acesso que já existe no sistema, em qualquer fazenda do cliente, o sistema bloqueia e informa o número, o status e a origem da NF existente. O caso típico é a nota que já chegou pelo Sieg e está pendente: abra a existente em Documentos Fiscais e processe-a, sem importar o XML de novo. Cada nota fica com um só registro, com estoque e financeiro uma vez só. Quando a NF é destinada a uma empresa transportadora, o CP do produtor aparece como Cancelado com a observação Movido do CP do produtor e o CP novo fica no financeiro da Empresa: são os dois lados da mesma mudança, não uma duplicidade.

**Entrada de Nota Própria por chave de acesso (14/10/2026)**: na aba Chave de Acesso, o botão Consultar confirma a situação da NF-e na SEFAZ (usa o certificado A1 configurado) e tenta baixar o XML completo pela Distribuição DF-e para preencher data, valor, destinatário e itens. A consulta de situação sozinha só devolve o protocolo, sem os dados da nota. Se a SEFAZ não entregar o XML para esse CNPJ, o sistema preenche apenas o que a própria chave informa (número, série, chave e CNPJ do emitente) e mostra um aviso amarelo: complete o restante manualmente ou use a aba XML com o arquivo da nota.

**Encargos zerados no cadastro do funcionário (14/10/2026)**: os percentuais de Encargos trabalhistas do cadastro (FGTS, INSS Empregador, SAT/RAT, Sistema S, provisões) aceitam zero e o zero é respeitado: antes, salvar com zero devolvia o padrão (8, 20, 1, 5,8, 8,33, 11,11) e a folha ignorava o cadastro. Agora a folha usa o cadastro: FGTS = percentual de FGTS sobre o bruto; INSS patronal (só funcionário de Empresa) = INSS Empregador + SAT/RAT + Sistema S sobre o bruto. Zerando tudo, a folha gera FGTS e INSS patronal zerados e não cria CP para eles; os lançamentos passam a ser manuais. Em folha em rascunho, reabrir recalcula com o cadastro atual; folha fechada não muda. Se FGTS, INSS Empregador, SAT/RAT e Sistema S estiverem TODOS zerados no cadastro, o funcionário é tratado como sem imposto automático (lançamentos manuais): a folha também não desconta INSS nem IRRF do trabalhador e o CP de salário sai pelo valor cheio (base mais gratificação mais complemento mais benefícios, menos adiantamentos e outros descontos). Com qualquer percentual preenchido, INSS e IRRF do funcionário seguem calculados pela tabela. Folha em rascunho recalcula ao reabrir; folha fechada não muda. Cadastros antigos sem percentual salvo continuam com o padrão antigo (FGTS 8% e INSS patronal 28%).

**Adiantamento de gratificação (14/10/2026)**: em Financeiro, Folha de Pagamento, aba Adiantamentos, o campo Tipo de adiantamento aceita Gratificação. Nesse caso informe a competência da gratificação (o mês em que ela será paga na folha): o valor adiantado é descontado na folha desse mês. A gratificação precisa estar lançada antes no cadastro do funcionário, aba Premiações, para a mesma competência. A soma dos adiantamentos de gratificação da competência não pode passar do valor lançado; o excedente não é tratado pelo sistema e deve ser lançado manualmente como empréstimo a terceiros. A tela mostra gratificação lançada, já adiantado e disponível. Requer a Seção 344 do supabase_migrations.sql.

**Carta de correção do CT-e (13/10/2026)**: em Fretes e Transporte, CT-e, o CT-e autorizado tem o botão Carta de correção. Escolha o que corrigir (Observações, Produto predominante, Outras características da carga, Chave da NF-e com o número do item, ou outro grupo e campo), informe o novo valor e transmita; cada carta aceita até 20 correções e o CT-e aceita até 20 cartas, e as já registradas aparecem na própria janela. A carta não pode corrigir valores, base de cálculo ou alíquota do imposto, quantidade, tomador, remetente, destinatário, emitente nem a data de emissão: nesses casos emita um CT-e substituto. Requer a Seção 343 do supabase_migrations.sql.

**CT-e substituto (13/10/2026)**: para corrigir um CT-e já autorizado, em Fretes e Transporte, CT-e, use o botão Substituir na linha do CT-e autorizado. O sistema abre um novo rascunho com os dados do original; corrija o que precisar (marque A correção altera o tomador quando for o caso) e transmita. O XML sai com tpCTe 3 e a chave do original no grupo infCteSub. Ao autorizar, o original passa a Substituído, o financeiro dele (a receber e a pagar) é cancelado e o do substituto é lançado. O original precisa estar autorizado, e a SEFAZ confere o prazo permitido para substituir. Também dá para escolher Tipo do CT-e igual a Substituto direto na tela Emitir CT-e: escolha um CT-e autorizado da lista (preenche os dados) ou Outro sistema e informe a chave de 44 dígitos do original emitido fora do Arato (nesse caso nada do financeiro do original é alterado). A lista mostra a etiqueta Substituto no novo e Substituído no original. Se a correção for de valor ou dados que o CT-e substituto não admite, a SEFAZ rejeita e o rascunho continua editável. Requer a Seção 342 do supabase_migrations.sql.

**Ano Safra obrigatório (13/10/2026)**: o Ano Safra passou a ser obrigatório nas telas onde ele é informado em um lançamento: Pedido de Compra, NF de Produtos (Documentos Fiscais) e NFS-e (ao processar), Processar em Lote (cada NF precisa ter ano safra próprio ou o do lote), Contas a Pagar e a Receber (inclusive títulos de Empresa), Apoio Financeiro, Adiantamentos de fornecedor, pagamento de Arrendamento, Contrato de Compra de Terra, Contrato de Comercialização de Grãos e Abastecimento. O campo vem preenchido com o ano safra vigente e o rótulo mostra asterisco; salvar sem ano safra é bloqueado com aviso. Nas operações de lavoura (plantio, adubação, pulverização, correção, colheita) o ano safra já vem do ciclo escolhido. Lançamentos antigos sem ano safra continuam existindo; ao editá-los o sistema pede o ano safra.

**Financeiro por Classificação — Analítico e Sintético (13/10/2026)**: o relatório tem dois tipos. Analítico: gastos separados por OG (operação gerencial), cada OG com os seus lançamentos em detalhe e o subtotal. Sintético: uma linha por OG com a soma do período (quantidade de lançamentos, entradas, saídas e saldo), sem detalhes; o PDF e o Excel acompanham o tipo escolhido. As OGs aparecem ordenadas pelo código da classificação e mostram código e nome. Títulos sem OG ficam em grupos "Sem OG — categoria", sempre por último, para você ver o que falta classificar.

**Relatório Manutenção de Veículos e Máquinas (13/10/2026)**: não tem mais seletor de fazenda. Ele mostra a frota de todas as fazendas do cliente juntas (a fazenda de cada máquina aparece ao lado do tipo quando o cliente tem mais de uma), os ciclos do filtro Por Safra/Ciclo de todas as fazendas, e o título do PDF e do Excel usa o nome do cliente.

**DRE por ano safra (reformulada em 13/10/2026)**: a DRE pode ser gerada consolidada por ano safra ou por ciclo. Regras de origem dos custos: (1) tudo que gera estoque (insumos, peças, combustível de bomba) NÃO entra pelo Contas a Pagar, entra pelo consumo (plantio, adubação, pulverização, correção de solo, abastecimento, manutenção), com o custo gravado no momento do consumo (não muda se a DRE for reemitida depois). (2) Apropriação direta (administrativo, serviços, mecanização terceirizada, assessoria, análises, despesas financeiras e outras) entra pelo Contas a Pagar, pela classificação (operação gerencial), no ano safra indicado no título; sem ano safra indicado vale o vencimento. Em NF com itens dos dois tipos, só a parte de apropriação direta entra. (3) Mão de obra vem da folha fechada da competência: bruto, complemento salarial e encargos patronais (FGTS e INSS patronal); adiantamentos e CP de salário não somam de novo. O ano safra da folha é gravado pelo sistema a partir da competência. (4) Arrendamento vem dos contratos pagos; em sacas, vale sacas pagas × preço médio ponderado de venda do produto no ano safra (sem venda, o preço de referência do pagamento). (5) Manutenção vem do histórico de manutenção das máquinas e combustível dos abastecimentos. Custos sem ciclo apontado aparecem na coluna Sem ciclo (aguarda rateio) enquanto a regra de rateio entre ciclos não é definida; no consolidado por ano safra eles somam normalmente. Compra de insumo, imobilizado (CAPEX) e títulos sem classificação reconhecida ficam fora do resultado.

**Relatório CP / CR — Contas e Fluxo de Caixa com Empresas (13/10/2026)**: o relatório lia só a tabela de lançamentos do produtor, então mostrava apenas os CP/CR de empresa antigos e nenhum dos lançados depois (que ficam na tabela de títulos de empresa). Agora o relatório soma produtor e empresa (o filtro Empresa funciona para os dois). O relatório Gastos por Classificação também soma produtor e empresa (e passou a paginar: períodos longos perdiam títulos após a linha 1.000). O DRE é tratado à parte.

**Filtros e colunas do Contas a Pagar (atualizado 13/10/2026)**: Origem e Status agora são listas suspensas com caixas de seleção múltipla (nada marcado = todos), e os campos de data de vencimento têm largura fixa. A configuração de colunas (visíveis, ordem e largura) é guardada por usuário. Larguras absurdas gravadas por um arraste de coluna que ficou preso (soltar o mouse fora da janela) são descartadas ao abrir a tela, e o arraste agora termina sozinho quando o botão do mouse já foi solto. Se alguma coluna sumir, clique com o botão direito no cabeçalho e use Restaurar padrão.
Lançamento pode vir de pedido, nota, contrato, folha ou ser manual — a coluna "Lançado via" mostra qual. Baixa compara valor pago + ajustes (desconto/juros) contra o saldo do título para decidir se fica total ou parcial. Reabrir desfaz os dados da baixa e volta para aberto/vencido. Conciliação bancária classifica cada linha do OFX como alta/média/bloqueado/nenhum (tolerância de valor 0,02; janela de 7 dias, alta considera até 2 dias de diferença) — alta pode aplicar automaticamente; média é só sugestão para revisão manual.

**Parcelamento (Condição de Pagamento) ao processar NF — bug corrigido 09/10/2026**: quando a NF estava vinculada a um Pedido de Compra que já tinha um lançamento salvo, o sistema sempre reaproveitava (atualizava) esse único lançamento — mesmo que o usuário tivesse configurado "Parcelado" com 2+ parcelas na aba Operações da NF. O parcelamento era silenciosamente ignorado e o CP saía como título único. Corrigido em processarNfEntrada (lib/db.ts): se a NF for parcelada, nunca reaproveita o lançamento do pedido — cria as parcelas normalmente, e se o pedido já tinha um lançamento "placeholder" sem nenhuma NF vinculada ainda, ele é apagado para não sobrar duplicado.

**Extrato × CP divergentes (13/10/2026)**: na tela de Conciliação, o botão Verificar divergências compara o que está conciliado no extrato com o Contas a Pagar/Receber e mostra quantas diferenças existem (vínculo com título excluído, título sem a marca de conciliado, extrato conciliado com título ainda em aberto, título marcado como conciliado sem linha de extrato). Ao confirmar, corrige: marca os títulos, baixa o título quando o valor bate com a linha (data e conta da linha) ou devolve a linha a Pendente quando não bate. A regra é: o vínculo da linha do extrato manda, a marca no título é consequência. Reabrir (estornar) uma baixa agora também solta a linha do extrato, e a Seção 339 do supabase_migrations.sql cria gatilhos no banco que mantêm os dois lados em sincronia em qualquer tela, inclusive ao excluir um título.

**Erro ao salvar a conciliação (corrigido 13/10/2026)**: a gravação do espelho do extrato agora roda no servidor, então usuários BPO/seletor e sessões antigas não perdem mais a conciliação. Se ainda aparecer "Não foi possível salvar a conciliação", o aviso traz a linha Motivo com o texto do erro; anote esse texto para o suporte.

**Conciliação bancária: dessincronia entre extrato e lançamento — bug corrigido 09/10/2026**: a rota que grava uma conciliação fazia vários updates em sequência (lançamentos, depois o registro do extrato) sem serem atômicos. Se um update de lançamento falhasse no meio do caminho, a rota corretamente avisava erro — mas o registro do extrato já tinha sido gravado como conciliado ANTES da falha, e não voltava atrás. Resultado: o extrato aparecia conciliado, o lançamento (sistema) não. O mesmo problema causava o sintoma "saldo restante de um pagamento parcial não aparece pra conciliar, diz que já está conciliado" — se a baixa (valor_pago/status) falhava mas o "conciliado=true" ainda assim era gravado, o lançamento ficava marcado como totalmente resolvido sem de fato ter sido baixado. Corrigido: a gravação do extrato como conciliado agora só acontece depois que TODOS os lançamentos envolvidos foram atualizados com sucesso; um lançamento cuja baixa falhar nunca mais é marcado conciliado=true.

**Borderô (pagamento/recebimento em lote) — o borderô É o título.** Não confunda o borderô com um simples agrupador de NFs: ele representa o documento de pagamento real (ex: o boleto mensal que um posto de combustível emite somando várias NFs do mês). Por isso, pagamento parcial, juros, multa e desconto são sempre do TÍTULO INTEIRO — um valor só por borderô — nunca de uma NF/item individual dentro dele.

- **Criar Borderô:** agrupa os títulos (NFs) selecionados, ainda sem baixar (fica "pendente"). Campos do título: Descrição, Nº do título (referência do documento agregador — ex: o número do boleto — distinta da descrição), Data de vencimento do borderô (opcional). A lista de NFs mostradas é só informativa (número da NF + valor) — não editável aqui.
- **Confirmar Pagamento/Confirmar Recebimento:** o passo que de fato baixa o título — define data real + conta bancária, e tem UM campo de Valor a pagar/receber (default = soma das NFs, editável pra menos = pagamento parcial do título inteiro), e UM campo cada de Juros, Multa e Desconto (sobre o título, não por NF). O sistema rateia esse valor/juros/multa/desconto proporcionalmente entre as NFs por trás (pelo peso de cada uma), só pra manter o status individual de cada lançamento coerente nos relatórios — o usuário nunca edita esse rateio diretamente.
- **Depois de confirmado**, o borderô aparece no grid principal como um único banner "✅ BORDERÔ PAGO" (mesmo lugar onde aparecia "📋 BORDERÔ PENDENTE") — as NFs que fazem parte dele somem da lista solta, porque o título pago é a unidade que importa, não cada NF individualmente. Isso vale tanto em Contas a Pagar quanto em Contas a Receber.
- "Cancelar" desfaz o agrupamento de um borderô pendente sem baixar nada. "Estornar" reverte um borderô já confirmado/pago — os títulos voltam a ficar soltos e em aberto, sem data/conta de pagamento.

**Baixa/Confirmação de Borderô em lote e Conta Bancária — bug corrigido 09/10/2026**: os modais "Baixar em Lote" e "Confirmar Pagamento do Borderô" listavam conta bancária só da fazenda ativa da sessão, não de toda a conta do cliente — como o grid de Contas a Pagar/Receber é conta-wide (mostra títulos de todas as fazendas juntos), um lote com títulos de mais de uma fazenda não achava a conta certa das outras fazendas na lista. Corrigido: a lista de contas agora é conta-wide nos dois modais, igual já era no modal de baixa individual.

**Forma de Pagamento = Cartão de Crédito.** Ao escolher essa forma de pagamento no lançamento (CP), aparece um seletor de qual cartão (cadastrado em Financeiro → Cartões de Crédito) — selecionar é obrigatório. Esse lançamento recebe um status próprio ("cartao") que **some do grid de Contas a Pagar** (não é saldo em aberto do fornecedor/produtor) e **não movimenta conta bancária nem conciliação agora** — o valor vai pra fatura do cartão daquela competência (mês/ano calculado pelo dia de fechamento cadastrado no cartão), acumulando com os demais lançamentos no cartão. Não é compatível com a condição "Recorrência" (use "Parcelado" com a grade editável se precisar dividir em várias faturas — cada parcela cai na fatura do seu próprio mês). O lançamento continua contando pro DRE normalmente pela Operação Gerencial escolhida, na data da compra — só o regime de caixa fica represado até a fatura ser paga.

### Financeiro → Cartões de Crédito
Três abas: **Cartões** (cadastro — titular, bandeira, banco, 4 últimos dígitos, dia de fechamento e de vencimento da fatura, limite), **Faturas** (uma por cartão/mês, acumula os lançamentos que escolheram aquele cartão como forma de pagamento) e **Conciliação** (compara o extrato importado do banco/operadora contra os lançamentos da fatura — hoje é só uma ferramenta de comparação na tela, não fica salvo se a pessoa sair da aba).

Fatura tem 3 status: **Aberta** (ainda recebendo lançamentos), **Fechada** (o sistema fecha sozinha quando a data de fechamento passa — checado toda vez que a tela de Cartões é aberta, não é um cron em segundo plano) e **Paga**. O botão "🔒 Fechar fatura"/"🔓 Reabrir fatura" também permite fazer isso manualmente antes/depois da data. Não existe criação manual da próxima fatura — ela nasce sozinha no primeiro lançamento novo daquela competência.

**"💰 Pagar fatura"** (só aparece em fatura Fechada) é o único evento que move dinheiro de verdade neste fluxo inteiro: pede conta bancária + data, e gera UM lançamento consolidado, já baixado, pelo valor total da fatura — esse sim entra em conciliação bancária normal. Os lançamentos individuais que formaram a fatura não mudam em nada (continuam com status "cartao" pra sempre, servindo de detalhe/auditoria do que compôs aquele total).

### Financeiro → Folha de Pagamento
**Data de pagamento escolhida ao gerar a folha (13/10/2026)**: ao gerar ou editar uma folha existe o campo Data de pagamento (vencimento). Cada cliente escolhe a data conforme a sua operação; a sugestão é o mesmo dia do mês usado na última folha (ou dia 5) no mês seguinte à competência. Ao fechar a folha, o CP de salário de cada funcionário nasce com essa data. Se a folha gerar vários meses de uma vez, a data informada vale para o primeiro mês e os demais repetem o mesmo dia no mês seguinte de cada competência (dia 31 em mês curto vira o último dia do mês). Depois de fechada, a data não é editada na folha: ajuste o vencimento no Contas a Pagar. Requer a Seção 341 do supabase_migrations.sql; sem ela o sistema usa o padrão dia 5 do mês seguinte.

**Data de pagamento prevista na grade da folha (13/10/2026)**: a grade de lançamento da folha tem a coluna Pgto. previsto. Em folha fechada mostra o vencimento real do Contas a Pagar de salário de cada funcionário; em folha em rascunho mostra o dia 05 do MÊS SEGUINTE à competência (competência 07/2026 → pagamento 05/08/2026), que é o vencimento que o fechamento usa. A competência é o mês trabalhado e o pagamento é sempre no mês seguinte; o FGTS e o INSS patronal vencem dia 20 do mês seguinte. As folhas já fechadas tiveram os CPs de salário ainda em aberto corrigidos para esse vencimento; os já baixados não foram alterados.

**Complemento salarial na grade da folha (13/10/2026)**: a grade de lançamento da folha ganhou a coluna Complemento (valor pago por fora, sem INSS/IRRF/FGTS) e o Sal. Líquido mostra exatamente o que vai para o Contas a Pagar de cada funcionário: bruto − INSS − IRRF − outros descontos − adiantamentos + benefícios + complemento. Ao reabrir uma folha em rascunho, salário base, complemento e benefícios são atualizados a partir do cadastro do funcionário (a folha salva era uma foto antiga e mostrava valores desatualizados); gratificação e outros descontos da folha são mantidos.

**Adiantamento de salário (atualizado 13/10/2026)**: ao registrar o adiantamento (aba Adiantamentos) é obrigatório escolher a conta bancária de onde saiu o dinheiro. O CP nasce na hora, já ligado ao empregador (empresa ou produtor) do funcionário e já baixado nessa conta, na data do adiantamento, para entrar no fluxo de caixa. Não precisa esperar fechar a folha. A grade de lançamento da folha não tem mais coluna de Adiantamento: adiantamento só é lançado na aba Adiantamentos, e a folha desconta sozinha os pendentes do funcionário (a célula do Sal. Líquido mostra já desconta adiant. quando houver). Ao fechar a folha, todo adiantamento pendente do funcionário (da competência ou sem competência definida) é descontado automaticamente do salário líquido, inclusive os lançados depois de a folha ter sido salva, e passa para Descontado. Se a baixa automática falhar, o CP fica em aberto em Contas a Pagar e a tela avisa.
Por competência (mês/ano), pode ser retroativa. A rotina de fechamento verifica duplicidade por competência/funcionário antes de gerar os CPs (salário líquido, FGTS e, se o empregador for Empresa/PJ, também INSS Patronal — produtor rural PF não gera INSS Patronal, usa Funrural à parte). Férias, rescisão e premiação têm fluxos próprios com cálculo específico — sempre proponha conferência do responsável trabalhista/contábil antes de considerar o valor definitivo.

### Fiscal → GNRE e eSocial Rural
Ver seção "O que é simulado" acima — hoje são controle de status local, sem transmissão oficial comprovada.

### Fiscal → LCDPR / SPED ECD
Geram o arquivo a partir dos lançamentos classificados (vínculo de atividade, entidade contábil PF/PJ) — gerar o arquivo aqui **não é o mesmo que transmitir** à Receita Federal. O SPED pode pular lançamentos sem Operação Gerencial com conta de débito/crédito configurada — revise a prévia antes de considerar completo.

### Fiscal → IBS/CBS — 2027
Telas de simulação e parametrização da Reforma Tributária — são ferramentas de cálculo/configuração, não prova de obrigação legal cumprida. Sempre recomende confirmar com o contador antes de uma decisão real baseada nessas simulações.

### Resultados → DRE Agrícola / Custos / Produtividade
DRE separa receita bruta, deduções (Funrural, SENAR), CPV (sementes/fertilizantes/defensivos/correção — vindos do custo de baixa de estoque das operações, não de CP novo), despesas gerais/administrativas e financeiras. Ponto de equilíbrio = custo total ÷ preço médio por saca. Um total de relatório pode excluir registros fora do filtro ou sem classificação — confira origem e período antes de comparar números entre relatórios diferentes (saldo financeiro, custo de consumo e valor de estoque não são a mesma grandeza).

### Configurações → Automações
Horários declarados em vercel.json (convertidos para horário de Cuiabá): marcar vencidos 05h, alertas de vencimento 06h, relatório semanal segunda 06h, SIEG 07h, cobrança 07h, backup 02h, curva de mercado dias úteis 18h, atualizar taxas todo dia 1 às 06h. Um horário declarado não garante envio de e-mail/WhatsApp de fato — isso depende de credenciais e serviço externo configurados; se o usuário disser que não recebeu um alerta, oriente a conferir a configuração de e-mail/integrações antes de assumir que é bug.

### Usuário é deslogado sozinho, sem motivo aparente
Caso real confirmado 08/10/2026: a causa era o relógio do computador do usuário estar desacertado (adiantado ou atrasado) — a sessão compara o token com o horário local do navegador, e um relógio errado faz o navegador achar que a sessão expirou numa hora errada, derrubando o login mesmo com tudo certo do lado do sistema. Desde então, o sistema mostra um banner automático (🕐, topo da tela) quando detecta esse desacerto (diferença maior que 3 minutos comparando com o horário do servidor). Se o usuário relatar logout sem motivo e o banner não tiver aparecido, oriente a conferir se a data/hora do computador está correta e sincronizando automaticamente antes de levantar qualquer outra hipótese.

---

## PERGUNTAS FREQUENTES

**"Confirmar um contrato de grãos emite a NF-e sozinho?"**
Não. Confirmar só atribui o número do contrato e cria o CR (se houver valor). A NF-e é emitida à parte, em Faturamento/NF-e de Saída ou Documentos Fiscais → Notas de Venda.

**"Por que meu plantio (ou pulverização) não gerou conta a pagar?"**
É assim de propósito. O insumo já foi pago (ou virou CP) quando entrou pela nota de compra. Plantar/pulverizar só consome o que já é do produtor — criar um CP novo aqui duplicaria a dívida. O custo entra no DRE pelo valor da baixa de estoque, não por um CP novo.

**"Emiti um MDF-e pela Expedição, isso é oficial?"**
Sim — o botão "MDF-e" da Expedição leva até a emissão real no módulo Transporte (CT-e/MDF-e), com a NF-e já pré-selecionada; a transmissão à SEFAZ acontece lá, e a carga na Expedição é atualizada sozinha quando autorizado. Exceção: transbordo sem NF não tem MDF-e disponível, porque não existe documento fiscal para o manifesto referenciar.

**"Transmiti um evento de eSocial / emiti uma GNRE, está valendo?"**
Hoje, não com confiança — as duas ações disponíveis só atualizam o status no banco do Arato; não foi confirmada chamada ao serviço oficial correspondente. Trate como controle interno, não como comprovante legal, e avise o usuário disso.

**"Como registro a colheita?"**
Produção → Colheita → crie o registro (fazenda/ciclo/talhão/área/data), depois adicione um romaneio por caminhão com peso bruto, tara e classificação ABIOVE (soja) ou IN MAPA 60/2011 (milho). Confirmar a colheita dá entrada no estoque e atualiza a produtividade real do ciclo.

**"Como lanço uma NF de compra de insumos?"**
Documentos Fiscais → Notas de Terceiro → carregue o XML (recomendado) ou digite manualmente, associe cada item a um insumo do catálogo e processe. Processar é o que efetivamente dá entrada no estoque e gera o CP — capturar ou classificar sozinho não basta.

**"Como configuro a emissão de NF-e?"**
Configurações → Parâmetros Fiscais (NF-e): preencha CNPJ/IE do emitente, série e ambiente (homologação ou produção), e configure o Certificado Digital A1. Sem isso a emissão não funciona.

**"↺ Preencher do Cadastro"** (dentro do card de cada emitente): puxa nome, documento e endereço do cadastro de Produtor/Empresa e já grava direto — não é preciso clicar em "Salvar Parâmetros" depois. Inscrição Municipal não vem desse botão (o cadastro de Produtor não tem esse campo) — precisa digitar manualmente quando o emitente tiver.

**"Código IBGE do município do emitente não configurado" mesmo com o endereço certo em Parâmetros → Fiscal**: bug corrigido (09/10/2026). Quando o emitente tem uma Inscrição Estadual ativa (Cadastros → Produtores → IEs), a emissão usa o endereço dessa IE — mas se a IE tiver sido cadastrada sem repetir o município/IBGE (comum, já que o endereço "de verdade" normalmente só é preenchido em Parâmetros → Fiscal), o sistema sobrescrevia o IBGE correto por um vazio vindo da IE, incondicionalmente. Agora cada campo de endereço (IBGE, município, CEP, logradouro, número, complemento, bairro) só vem da IE quando ela de fato tiver esse campo preenchido — senão usa o de Parâmetros → Fiscal. Isso batia em toda primeira emissão de cliente novo, não era específico de nenhuma conta.

**"Como importo o extrato bancário (OFX)?"**
Financeiro → Conciliação Bancária → escolha a conta certa e importe o arquivo. O sistema classifica cada linha como alta/média/bloqueado/nenhum confiança de vínculo — revise as de confiança média antes de confirmar, e trate separadamente as sem candidato.

**"O que é o SIEG?"**
Integração que captura automaticamente, direto da SEFAZ, os documentos fiscais emitidos contra o CNPJ/CPF cadastrado da fazenda, e tenta classificar sozinho usando regras já cadastradas. Documento "capturado" ou "classificado" ainda não é a mesma coisa que processado — confirme sempre se já virou estoque/CP de fato.

**"Por que um lançamento do LCDPR aparece com conta '999'?"**
Contas do tipo caixa/trânsito usam os códigos especiais 000/999 no registro do LCDPR, por determinação do próprio manual oficial da Receita Federal — não é erro.

**"O que é 'vínculo de atividade' num lançamento?"**
Classifica o lançamento como rural, pessoa física, investimento ou não tributável — define se ele entra no LCDPR (que filtra só "rural") e em qual livro contábil (PF ou PJ, conforme a entidade contábil da fazenda).

---

## DIAGNÓSTICO RÁPIDO DE PROBLEMAS

| Sintoma | Primeira verificação |
|---|---|
| Menu ou módulo sumiu | Papel do usuário, plano/add-on da conta, estágio do cadastro inicial — não assuma que foi excluído |
| Cadastro não aparece numa lista | Conta/fazenda/vínculo certo e filtros aplicados na tela |
| Ciclo não aparece no seletor | Confira se o Ano-safra certo está vinculado ao Ciclo |
| Estoque não mudou após uma operação | Confira se a operação foi processada/confirmada (rascunho não baixa estoque) e olhe o Kardex |
| CP duplicada | Confira se já existe o campo "lancamento_id" vindo do pedido/nota antes de lançar manualmente |
| CR de contrato não apareceu | Confira se o contrato foi de fato confirmado e se tinha valor |
| Nota capturada (SIEG) parada como pendente | Falta classificar e processar — captura e classificação não processam sozinhas |
| Documento fiscal rejeitado pela SEFAZ | Leia a mensagem de retorno e corrija o cadastro apontado — não troque só o status no banco |
| Conciliação bancária bloqueada | Confira conta/titular, natureza (crédito/débito) e se já havia vínculo anterior |
| Relatório com números diferentes de outro | Confira se período, filtro, classificação e status são exatamente os mesmos nos dois |
| Alerta ou e-mail automático não chegou | Confira a configuração de e-mail/integrações antes de considerar bug |
| "Emiti" GNRE/eSocial e quer confirmar oficialmente | Hoje é só status local — não há confirmação oficial para checar dentro do Arato |

---

## LIMITAÇÕES DESTE DOCUMENTO

Baseado em leitura de código e configuração até 06-07/10/2026, sem execução de operação real para validar cada automação em produção. Comportamento pode ter mudado depois dessa data. Se uma resposta sua aqui parecer contradizer o que o usuário está vendo na tela, confie no que a tela mostra, avise que pode ter mudado, e sugira que o dono do sistema atualize este documento.
`;
