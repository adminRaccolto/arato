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

// Regra de manutenção: descrever o estado atual, sem histórico de correções e sem nome de cliente; data só quando ela define o que o cliente vê em registros antigos. Tarefa nova entra no Guia por tarefa.
export const CONHECIMENTO_OLIVIA = `
# Base de Conhecimento — Arato
Reconstruída em 07/10/2026 a partir de levantamento de código (snapshot 06/10/2026) + árvore de menu real.

Este documento descreve o que o sistema Arato Web faz **hoje**, verificado contra o código quando a afirmação tem consequência financeira ou fiscal. Não é um histórico de mudanças. Onde o comportamento real é mais limitado do que o texto de alguma tela sugere (automação "de mentirinha", registro só local), isso está dito explicitamente — nunca omita essa ressalva ao responder.


---

## Guia por tarefa — comece por aqui
Responda com estes passos quando a pergunta for "como faço" ou "onde fica". Os nomes de botão e aba são os da tela. Quando a pergunta casar com um item, use o caminho e o botão exatamente como aqui.

**Cadastrar fornecedor, cliente, comprador, transportadora ou banco:** Cadastros → Entidades → Pessoas e Entidades, botão + Nova Pessoa. Com CNPJ, o botão ao lado do campo busca os dados na Receita.
**Cadastrar produtor:** Cadastros → Entidades → Produtores, botão + Novo Produtor.
**Cadastrar fazenda ou talhão:** Cadastros → Entidades → Fazendas e Talhões, botão + Nova Fazenda; o talhão fica dentro da fazenda.
**Criar ciclo ou safra:** Produção → Planejamento → Safras e Ciclos.

**NF de produtos à mão ou por XML:** Documentos Fiscais → Notas de Entrada → Notas de Terceiro, botão + Nova NF de Produtos.
**Processar nota que já chegou pelo SIEG:** Documentos Fiscais → Notas de Entrada → Notas de Terceiro, filtre Status = Pendente, clique na nota, confira e processe. Só ao processar entram estoque e Contas a Pagar.
**Desfazer nota processada:** Documentos Fiscais → Notas de Entrada → Notas de Terceiro, clique na nota, botão ↺ Estornar. Nenhum título dela pode estar pago, conciliado ou em borderô.
**Nota com status Transferência:** é nota de transferência emitida no Arato que voltou pelo SIEG. O estoque já foi movimentado pela transferência; não precisa processar.

**Registrar plantio:** Produção → Operações de Campo → Plantio, botão + Registrar Plantio.
**Registrar pulverização:** Produção → Operações de Campo → Pulverização Terrestre, botão + Registrar Aplicação. Se foi de avião: Produção → Operações de Campo → Aplicação Aérea.
**Registrar colheita:** Produção → Colheita → Colheita, botão + Nova Colheita. Depois, em cada colheita, + Romaneio: primeiro o peso bruto, quando o caminhão chega carregado; depois a tara, com o caminhão vazio, e o depósito. A entrada no estoque acontece só ao confirmar com a tara.

**Pedido de compra:** Comercial & Logística → Compras → Pedido de Compras, botão + Novo Pedido.
**Transferir insumo ou semente entre fazendas:** Comercial & Logística → Estoque → Transferência entre Fazendas, botão + Nova Transferência. A tela pede Fazenda Origem, Depósito Origem, fazenda e depósito de destino e os itens (+ Adicionar Item).
**Saldo por depósito:** Comercial & Logística → Relatórios → Posição de Insumos, aba Relatórios, opção Saldo por Depósito.
**Histórico de entradas e saídas de um produto:** Comercial & Logística → Relatórios → Kardex (Ficha de Estoque).

**Contrato de venda de grãos:** Comercial & Logística → Comercialização → Contratos de Grãos.
**Emitir nota de venda:** Documentos Fiscais → Notas de Saída → Notas de Venda, botão + Nova NF-e. Confirmar contrato não emite a nota.
**Remessa para armazém:** Documentos Fiscais → Remessas e Retornos → Remessas (armazém, máquinas), botão + Nova Remessa.
**CT-e:** Documentos Fiscais → Transporte → CT-e — Conhecimento de Transporte, botão + Emitir CT-e.
**MDF-e, manifesto de carga:** Documentos Fiscais → Transporte → MDF-e — Manifesto de Cargas, botão + Emitir MDF-e.

**Conta a pagar sem nota, como um boleto:** Financeiro → Contas a Pagar / Receber → Contas a Pagar, botão + Novo Lançamento.
**Pagar vários títulos:** Financeiro → Contas a Pagar / Receber → Contas a Pagar, marque os títulos e use ✓ Baixar em Lote.
**Desfazer pagamento de borderô:** use Estornar no borderô. Ele volta a ficar em aberto, com os mesmos títulos.
**Conferir extrato, OFX:** Financeiro → Tesouraria → Conciliação Bancária.
**Fatura do cartão:** Financeiro → Cartões de Crédito → Cartões de Crédito, botão 💰 Pagar Fatura, com a fatura Fechada.
**Previsão de gasto:** Financeiro → Contas a Pagar / Receber → Previsão de Gastos, botão + Nova Previsão.
**Financiamento:** Financeiro → Complemento Financeiro → Contratos Financeiros, botão + Novo Contrato.

**LCDPR:** Fiscal → Obrigações → LCDPR. O arquivo é baixado na aba Exportação. Os dados do imóvel e do contador ficam na aba Cadastro LCDPR. O LCDPR é só de produtor pessoa física: empresa com CNPJ não entrega por aqui. Gerar o arquivo não transmite à Receita.

**Importar planilha e fazer backup:** quem faz é a equipe Raccolto; o cliente não vê essas telas. Oriente a falar com a Raccolto.
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

## MENU
O mapa oficial do menu vem no fim destas instruções. O que aparece para cada usuário depende do papel dele e dos módulos da conta.

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

**Transferência de estoque — itens sem saldo**: o seletor de item da transferência lista também os itens sem saldo, marcados "sem saldo" e depois dos que têm saldo. A transferência pode ser emitida mesmo assim, e a saída é lançada na fazenda de origem (o saldo dela pode ficar negativo).
**Notas de Terceiro — Nº documento**: o filtro "Nº documento" na barra de filtros busca pelo número da NF, NFS-e ou CT-e. Filtra na hora, sem clicar em Atualizar, e ignora zeros à esquerda e pontuação. O campo Buscar continua procurando por número, participante ou chave, mas só ao clicar em Atualizar ou apertar Enter.

**Pedido de Compra: unidade do item**: o item do pedido usa sempre a unidade do cadastro do item (a mesma da NF e do estoque) e não dá para trocar. Pedido antigo em outra unidade (ex.: bag com item em kg) mostra o botão "pedido em bag · usar kg". Com conversão segura (t ↔ kg, g ↔ kg, mL ↔ L, lt = L) o botão converte quantidade e preço. Sem conversão (bag, saca, bombona, dose, un) ele só troca a unidade, e a quantidade precisa ser redigitada na unidade do cadastro. Em NFs Vinculadas, a linha cuja unidade não converte mostra "Pedido em bag, NF em kg — sem conversão; ajuste o pedido", sem % nem saldo. A entrega dessa linha não é somada enquanto o pedido não for ajustado.

**Pedido de Compra × NF de outro emitente**: na NF de entrada, ao escolher um pedido cujo fornecedor é outra empresa (raiz do CNPJ diferente da do emitente da NF), o sistema pede confirmação. Isso só vale na compra por conta e ordem: pedido feito com a revenda e NF emitida pela fábrica ou mineradora. O emitente da NF nunca é trocado, e o título a pagar fica com o fornecedor do pedido. Filial do mesmo CNPJ conta como a mesma empresa e aparece com ★ na lista de pedidos. Dentro do pedido (NFs Vinculadas), a lista mostra só as NFs processadas, com a etiqueta "outro emitente" quando for o caso. NFs ainda pendentes ligadas ao pedido aparecem numa linha de aviso e não contam como entregue. Se o vínculo estiver errado, abra a NF e use Desvincular.

### Cadastros → Pessoas e Entidades
Fornecedor, cliente, prestador, transportador, arrendante. **É do cliente (conta), não de uma fazenda** — um fornecedor cadastrado a partir de qualquer fazenda aparece em todas as fazendas do mesmo cliente, e o sistema evita cadastro duplicado pelo CPF/CNPJ em toda a conta, não só na fazenda ativa. Não oriente o usuário a recadastrar um fornecedor "porque ele não aparece nesta fazenda" — se ele existe em qualquer fazenda do mesmo cliente, já deveria aparecer; isso é sinal de algo a investigar, não comportamento esperado. **Um cadastro por CPF/CNPJ no cliente** (com a Seção 371 rodada): o banco recusa gravar um CPF/CNPJ que já existe em outro cadastro do mesmo cliente, com ou sem máscara, com a mensagem "Já existe um cadastro com este CPF/CNPJ neste cliente: <nome>. Use o cadastro existente." A importação de pessoas marca essas linhas como duplicado, e a NF/SIEG que traria um fornecedor já cadastrado usa o cadastro existente. Os cadastros repetidos antigos foram juntados num só (vínculos de títulos, NFs, contratos e pedidos passam para o que ficou; nome = razão social da NF mais recente). Caso legítimo de dois cadastros com o mesmo documento só pelo suporte Raccolto.

O botão "..." ao lado do CNPJ (no modal Editar/Novo Pessoa) busca dados públicos pra auto-preencher nome/endereço, via rota própria do servidor ("/api/cadastros/consultar-cnpj") — tenta a BrasilAPI primeiro e, se ela estiver fora do ar ou no limite de consultas (erro 5xx/429), tenta a ReceitaWS automaticamente antes de desistir (roda no servidor, não no navegador, porque a ReceitaWS não aceita chamada direta do navegador — CORS). Erro "404" significa que o CNPJ realmente não existe na Receita; "400" é dígito verificador errado — nesses dois casos não adianta tentar de novo, é o cadastro que está errado.

### Cadastros → Insumos: desativar sem excluir
Cada linha das listas de Insumos (e dos demais itens do estoque) tem um botão Desativar. Um insumo desativado deixa de aparecer nos seletores de uso: Nota de Entrada, Pedido de Compra, Notas Próprias, Transferência de Estoque e as operações de lavoura (Plantio, Adubação, Correção, Pulverização, Aplicação Aérea, Tratamento de Sementes). O histórico, o Kardex, a Posição de estoque e as telas de Cadastros continuam mostrando o item normalmente. Se o item já estava selecionado numa nota ou pedido aberto, ele continua aparecendo nesse campo até ser trocado. O botão vira Reativar para o item voltar aos seletores. Uso típico: depois de converter semente de kg para bag, desativar o cadastro antigo em kg para ninguém usar por engano. Atenção: desativar um item que ainda tem saldo impede escolhê-lo em transferências.

### Produção → Planejamento → Safras e Ciclos
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

## Funcionamento por tema
Como cada área funciona hoje. Para o passo a passo das tarefas comuns, use antes o Guia por tarefa.

### Notas de entrada: NF de produtos, NFS-e, SIEG
**Captura e processamento:** captura (XML, SIEG ou digitação manual) e processamento são fases distintas. Nota "capturada" ou "classificada" pelo SIEG não gera estoque nem CP até ser processada. No processamento, cada item vai para estoque, direto para uma máquina ou direto para um centro de custo (Apropriação Direta), conforme a Operação Gerencial do cabeçalho. Produto sem unidade compatível com o cadastro pode usar "Conversão manual (livre)": digite o total já na unidade do insumo. No processamento de NF (Insumos, Peças com Estoque), o seletor do item do catálogo tem busca por texto. Nunca edite direto o cabeçalho de uma nota já processada.

**Filtros, busca e ordenação (Documentos Fiscais):** os filtros Tipo (NF de Produtos, NF de Serviços, CT-e), Status, Tipo de Entrada (Insumos, Combustível, Peças/Manut., Consumo, Aprop. Direta, VEF, Entrega VEF, Devolução), Origem (Manual, XML, Sieg, Leitor) e Destinatário aceitam várias escolhas; "Limpar seleção" tira o filtro. Destinatário tem caixa de texto para buscar pelo nome. Há filtro de período. Clique no nome da coluna (Emissão, Número, Série, Emitente, Destinatário, CFOP, Entrada, Tipo, Origem, Operação NF, Valor, Status) para ordenar; outro clique inverte (seta ▲▼). Padrão: emissão mais recente primeiro. O campo Buscar tem seletor (Tudo, Nº da NF, Emitente, Destinatário, Chave) e filtra enquanto digita; Nº da NF compara só os dígitos, sem zeros à esquerda; nome também acha pelo CNPJ.

**Sincronização com o SIEG:** configuração única por cliente, em Configurações → Integrações → Sieg. O Arato busca às 7h e às 13h (Brasília) as NF-e de entrada e NFS-e emitidas contra os CPF/CNPJ cadastrados ali. Entram como NF pendente (sem estoque nem financeiro até processar), na fazenda do destinatário (produtor dono da fazenda ou empresa do CNPJ). Nota em fazenda inesperada: confira se o CPF/CNPJ do destinatário está no produtor/empresa certo. O botão Sincronizar busca na hora ou por período. Notas já importadas são ignoradas pela chave de acesso. Nota recém-emitida pode demorar, pois o SIEG só a recebe depois da SEFAZ. O SIEG nunca marca nota como processada: quem processa é o usuário.

**Cancelamento de NF-e pelo emitente:** a sincronização do SIEG busca os cancelamentos da SEFAZ no mesmo período das notas. NF-e pendente vira Cancelada sozinha. NF-e já processada não muda de status: recebe na observação CANCELADA PELO EMITENTE NA SEFAZ — verifique se precisa estornar, e o resultado da sincronização avisa. Cancelamentos de notas antigas só são vistos se o evento chegar ao SIEG dentro do período sincronizado.

**Cancelamento de NFS-e pelo prestador:** reconhecido quando vem no XML (bloco de cancelamento ABRASF, situação Cancelada da prefeitura ou evento 101101 da NFS-e nacional). Nota pendente vira Cancelada e sai dos pendentes. Nota processada não é mexida: recebe na observação [CANCELADA PELO PRESTADOR — estorne o lançamento] e aparece no resultado da sincronização. Pendentes com cancelamento não reconhecido: sincronize de novo as NFS-e com período que cubra a data delas. Se o SIEG não trouxer o cancelamento no XML daquela prefeitura, cancele manualmente.

**Relatório NFs Canceladas pelo Emitente (Documentos Fiscais → Relatórios):** escolha o período em que o cancelamento chegou ao SIEG e clique Gerar. Três grupos: canceladas já processadas (estorne a nota), canceladas ainda pendentes (não processar; botão Marcar N como canceladas, com confirmação) e já canceladas no Arato. Para cada nota: data do cancelamento (NFS-e não traz), data do processamento e coluna Cancelou: Antes da entrada = já estava cancelada na SEFAZ quando foi processada; Depois da entrada = o emitente cancelou depois. Coluna NF substituta: outra NF válida do mesmo CPF/CNPJ emitente, emitida no mesmo dia ou até 90 dias depois, com valor até 10% diferente (a de valor mais próximo; cada NF substitui uma cancelada só). Sem substituta aparece Sem substituta — cobrar fornecedor. É indicação automática; confira antes de cobrar. Filtro Só sem NF substituta; o topo mostra quantas estão sem substituta e o valor. NFS-e canceladas entram pela data da prestação. O relatório nunca altera as processadas. Exporta PDF e Excel (com coluna Cobrar fornecedor). Se demorar demais, use período menor.

**Relatório de Processamento de NF e NFS-e:** em Documentos Fiscais → Relatórios → Processamento de NF e NFS-e. Mostra notas processadas no período de emissão: uma linha por item de NF de Produtos (com Operação Gerencial e Centro de Custo do item ou, sem eles, os do cabeçalho) e uma por NFS-e. Filtros: tipo, Operação Gerencial (grupo traz as filhas), Centro de Custo (ou Sem centro de custo), produto, número da NF e fornecedor (nome ou CNPJ). O topo mostra linhas, notas, total e linhas sem OG ou sem centro de custo. Botões Imprimir / PDF e Excel (abas Resumo e Processamento).

**Chave de acesso sem XML:** ao ler a chave, o Arato procura o XML já guardado em qualquer fazenda do cliente; se não achar, consulta a SEFAZ, que confirma a nota mas não entrega o XML completo a terceiros. A mensagem pede para importar o XML do fornecedor (opção XML) ou sincronizar o SIEG do período da emissão. Não é erro do fornecedor.

**I.E. do Produtor e combustível:** ao abrir uma NF (XML, chave ou SIEG), a I.E. do Produtor é escolhida sozinha quando a IE do destinatário é uma das IEs ativas do produtor; escolha manual nunca é trocada. Em NF de Insumos/Combustíveis com Operação Gerencial de compra de combustível, "É Combustível" é marcado sozinho e aparece o seletor de Bomba/Tanque, filtrado pela "Fazenda da descarga" (começa na fazenda da IE escolhida ou, sem ela, na da NF). Esse seletor permite qualquer fazenda do cliente com bomba. Trocar a fazenda limpa a bomba escolhida.

**Cadastro de fornecedor/prestador na nota:** acima e à direita do seletor de fornecedor, o rótulo Cadastro Fornecedor aparece quando o emitente não está vinculado a um cadastro; abre o popup já com CNPJ e nome da NF. Para CNPJ, a Receita Federal preenche razão social, endereço, telefone, e-mail, inscrição estadual e código IBGE; para CPF não há consulta. Ao cadastrar, o fornecedor fica selecionado na NF. No Passo 1 da NFS-e, o botão Cadastro Fornecedor aparece ao lado de Prestador — do cadastro e, ao salvar, seleciona o prestador.

**Peças / Manutenção com Apropriação "Estoque":** cada item normalmente vai direto para uma máquina, mas a Apropriação do item pode ser trocada para "Estoque". Aí aparece, embaixo de Descrição, um seletor de insumo do catálogo (com "+" para cadastrar). Sem insumo escolhido, o processamento bloqueia com "associe um insumo... antes de processar".

**Máquina para todos os itens:** na NF com Apropriação Direta de manutenção, o quadro Máquina(s) para todos os itens permite escolher máquinas com percentual (somando 100%) e aplicar com Aplicar a todos os itens. Substitui o rateio de cada item, que pode ser ajustado depois.

**Máquinas e Equipamentos (Imobilizado):** tipo de entrada para compra de máquina, veículo, implemento ou equipamento (inclusive usado, mesmo com CFOP 5102). A Operação Gerencial vem como AQUISIÇÃO DE MAQ. / EQUIP. / IMPLEM. (CAPEX — fora da DRE; pode trocar), a NF não entra no estoque e gera Contas a Pagar normalmente. Na coluna "Máquina / Equipamento (cadastro)" escolha: "➕ Cadastrar nova máquina com este item" (padrão — cria em Cadastros → Patrimônio → Máquinas e Veículos com nome do item, tipo deduzido da descrição, nº da NF, data de emissão e valor de aquisição), uma máquina já cadastrada (recebe NF, data e valor se em branco) ou "não vincular". Reprocessar não cria a máquina de novo; estornar não a apaga. NF com CFOP 1551/2551/1556/2556 já abre nesse tipo. Também tem o "↩ Devolver".

**Ciclo e dados do CP:** o dropdown de Ciclo (aba Operações, com ano safra) mostra os ciclos da fazenda da NF, não da fazenda ativa. O CP (produtor ou Empresa/PJ) leva operação gerencial, centro de custo, ano safra e ciclo da tela; o que faltar vem da NF. No relatório CP/CR, título sem operação gerencial própria mostra a da NF de origem.

**Parcelamento com Pedido de Compra:** se a NF vinculada a Pedido de Compra estiver como "Parcelado" com 2 ou mais parcelas na aba Operações, o sistema cria as parcelas sem reaproveitar o lançamento do pedido (lançamento do pedido sem NF vinculada é apagado). Sem parcelamento, o lançamento do pedido é reaproveitado.

**Quando a NF gera Contas a Pagar, pelo CFOP:** remessa de entrega futura (5116/5117/6116/6117) é processada normalmente, mas SEM CP — o CP vem da NF de simples faturamento (5922/6922). Comodato (5908/5909), conserto (5915/5916), demonstração (5912/5913), industrialização (5901/5902), armazém geral/depósito (5905/5906/5907/5934) e vasilhame (5920/5921), e equivalentes 6xxx/1xxx/2xxx, também não geram CP; a janela avisa "Processar sem Contas a Pagar?". CFOP 5949/6949 pergunta "Esta NF é uma compra a pagar?": Sim gera CP; Cancelar oferece processar sem CP. No lote, NF com 5949 é recusada (processe individualmente). Ao processar simples faturamento com remessas do mesmo fornecedor já com CP em aberto, aparece "Atenção: CP em dobro" com NFs e valor, para apagar esses títulos se forem do mesmo pedido.

**CFOP 5554/6554:** remessa de bem do ativo para uso fora; normalmente sem cobrança. A tela mostra aviso e, ao processar, pergunta se foi compra: "Sim" gera CP e exige Operação Gerencial; "não" processa sem CP. Não entram no Processar em Lote. Na tela antiga de NF de Produtos, processa sem CP, sem perguntar. Remessa de máquina de terceiro: responda "não".

**Operação Gerencial sem Contas a Pagar:** em Configurações → Operações Gerenciais, aba Telas / Módulos, marque só "Notas Fiscais de Entrada" e deixe "Contas a Pagar / Receber" desmarcado. A NF processada com ela entra no estoque e custos, sem título no CP; no individual pede confirmação. Com as duas marcadas, gera CP normalmente.

**Compra para entrega futura (VEF):** 1) A NF de simples faturamento (5922/6922) é processada com Tipo de Entrada "Entrega Futura (VEF)" (já abre assim pelo CFOP; com outro tipo, aviso com botão para corrigir): gera CP e os produtos ficam como saldo de terceiro, sem entrar no estoque próprio. 2) Cada remessa (5116/5117) é processada como "Entrega de compra futura": sem CP; o painel "Faturamento(s) que esta remessa entrega" lista o que falta entregar — já marcados os referenciados no XML (ou todos) — e baixa do mais antigo para o mais novo; o produto entra no depósito escolhido. Se passar do saldo (ou não houver faturamento), o sistema avisa. 3) Documentos Fiscais → Entregas Futuras mostra comprado, entregue e falta por produto, situação (Aguardando entrega, Parcial, Entregue) e, pela seta, as remessas. Estornar a remessa devolve o saldo; o faturamento só é estornado depois das remessas.

**Processar em Lote (Documentos Fiscais → Notas de Terceiro):** marque as NFs pendentes e clique ⚡ Processar em lote. Só um fornecedor (mesmo CPF/CNPJ); com diferentes, o sistema avisa e pede para separar. Campos: Tipo (manter, Estoque/Insumos ou Apropriação Direta), Vencimento, Ano Safra, Ciclo, Operação Gerencial, Centro de Custo, Depósito e Pedido de Compra. Campo em branco mantém o da NF. Pedidos do mesmo fornecedor vêm primeiro (★); pedido de outra empresa pede confirmação (conta e ordem). O pedido preenche ano safra, ciclo e vencimento vazios e o fornecedor do título passa a ser o do pedido. Apropriação Direta processa e gera CP (vencimento do lote ou parcelas do XML); cada NF precisa de Operação Gerencial, Centro de Custo e Ano Safra, senão fica pendente. NF de retorno (5906/6906, 1554…) é recusada e vai para Retornos. Estoque/Insumos: processa (estoque + CP) as NFs de Insumos Agrícolas com todos os itens associados ao catálogo — o sistema associa sozinho o item com histórico (mesma descrição e unidade, mesmo fornecedor, um único insumo e mesma conversão). Valem as travas do individual: unidade igual à do cadastro, linha e saldo do pedido (exceção só com justificativa na Observação da NF), lotes de semente com peso, Operação Gerencial e Ano Safra. Estoque nunca leva centro de custo. Ficam pendentes as que não passam, as de Peças, Combustível e VEF e as sem tipo com "não alterar"; o resumo diz o motivo.

**Enviar para Aprovação:** ativada pela equipe Raccolto em Admin → Módulos (NF de Entrada — Enviar para Aprovação); padrão desligada. Ligada, ao processar aparece o seletor "Enviar para Aprovação", sempre desmarcado. Marcado, a NF fica processada e o CP nasce na hora, mas estoque, princípio ativo, bomba, manutenção, abastecimento e baixa da entrega futura ficam para a confirmação. A NF aparece em Documentos Fiscais → Notas Pendentes de Confirmação, com os dias de espera. Em "Confirmar entrega" informe a data da entrega (vira a data da movimentação de estoque); o CP não muda. Enquanto aguarda, não conta como entrega no Pedido de Compra e não pode ser devolvida; pode ser estornada.

**NF duplicada:** NF repetida é recusada pela chave ou por número, série e fornecedor, em qualquer fazenda da conta (manual, XML, SIEG e WhatsApp). O aviso informa número, status, origem e fazenda da existente e traz o botão Abrir a NF existente. Caso típico: a nota já veio pelo Sieg pendente — abra e processe, sem importar o XML de novo. Cópia duplicada não pode ser processada se outra já estiver processada; a cópia pode ser excluída. NF destinada a transportadora: o CP do produtor aparece Cancelado com Movido do CP do produtor e o CP novo fica na Empresa — não é duplicidade.

**Limpar Duplicatas (NF de entrada):** mostra quantas cópias serão removidas e pede confirmação. Duplicada = mesma chave ou mesmo número, série e CNPJ do fornecedor, de qualquer origem, inclusive em fazenda sem cadastro. Nunca remove NF processada nem cópia com título a pagar, pedido de compra ou estoque; informa quantas ficaram.

**NFS-e repetida:** reconhecida em qualquer fazenda com mesmo número (sem zeros à esquerda), mesmo CNPJ/CPF do prestador e prestação a até 45 dias; a série é ignorada; a mesma chave também identifica. No SIEG, reimporta só com Forçar re-importação e nunca cria segunda; no manual, a tela recusa e informa qual existe. Limpar Duplicatas, na tela de NFS-e, mostra a contagem antes, nunca remove processada nem cópia com título, e mantém a processada ou a mais antiga.

**NFS-e tomada por Empresa:** o CP vai para o financeiro da Empresa. Se já há título de NFS-e com mesmo número e prestador nela, não cria outro. Prestadores diferentes com o mesmo número têm cada um seu CP.

**Tomador da NFS-e:** vem do bloco do tomador no XML; sem ele, vale o CPF/CNPJ do cliente buscado no SIEG. O CNPJ do prestador nunca é gravado como tomador.

**Estorno, reabertura e exclusão:** NF processada não processa de novo: o aviso pede para estornar antes. O botão é Reabrir (estornar), que desfaz estoque, título a pagar e pendências fiscais e volta a NF a pendente. Para estornar ou excluir NF de Produtos ou NFS-e, nenhum título (produtor ou Empresa) pode estar pago, parcialmente pago, conciliado ou em borderô; o sistema recusa e informa qual título e o que desfazer: estornar a baixa no Contas a Pagar, desfazer a conciliação ou tirar do borderô. O estorno e a exclusão removem todos os títulos da nota.

**Devolução de Compra:** o botão "↩ Devolver" (card da NF em Documentos Fiscais ou modal da NF processada) emite NF-e de devolução na SEFAZ (CFOP 5201/6201 por padrão; também 5202/6202 com ST, 5556/6556 uso ou consumo e 5413/6413 uso ou consumo com ST). Só em NF processada de Insumos, Peças / Manut., Aprop. Direta ou Máquinas e Equipamentos.

**Devolução — CFOP:** o CFOP do cabeçalho aplica a todos os itens e é sugerido pelo da compra (1556→5556, 2556→6556, 1407→5413, 2407→6413, 1403/1102→5202, 2403/2102→6202, 2201/2101→6201); sem correspondência, 5201; pode trocar. Cada produto tem seu CFOP (coluna CFOP deste produto), ajustável. Natureza única (Devolução de Compra). Todos os CFOPs devem ser 5xxx ou todos 6xxx; misturar é bloqueado.

**Devolução — itens:** entram itens de estoque e de Apropriação Direta; item lançado direto em máquina como maquinário não entra. A quantidade é limitada ao saldo não devolvido. Item de estoque dá saída no estoque. Item de Apropriação Direta reverte o custo proporcional no DRE e nos custos do ciclo, e reduz abastecimento ou manutenção de máquina na mesma proporção.

**Devolução — encontro de contas:** o valor devolvido abate os títulos em aberto da NF original (das últimas parcelas para as primeiras), sem caixa — o CP fica Baixado/Parcial com forma "Compensação (devolução)" e observação "Compensado com a devolução NF …"; só o que sobrar continua a receber do fornecedor. Cancelar ou estornar a devolução restaura os CPs.

**Devolução — status:** devolvida por inteiro aparece como "Devolvida" (filtro Status → Devolvida); parcial continua "Processada". Estoque, custos e relatórios contam compra e devolução; devolução não é cancelamento e aparece como NF própria ligada à compra.

**Devolução — destinatário:** endereço/IBGE vem do cadastro de Pessoas; faltando, é completado pelo CEP. O erro "Código IBGE... não informado" aparece se nem o CEP estiver cadastrado.

**Devolução emitida em outro sistema:** na janela Devolver, escolha "Já emitida em outro sistema — só registrar" e informe nº da NF de devolução (obrigatório), série (se vazia, sai da chave) e chave (opcional). Marque quantidades e CFOP e clique "↩ Registrar Devolução": o Arato NÃO transmite à SEFAZ — só registra (saída do estoque ou estorno do custo, título a receber) e a NF aparece no Monitor de NF-e emitidas como emitida fora. NCM não é exigido.

**Entrada de Nota Própria:** nota emitida por você em outro sistema, que não é remessa nem retorno. Pelo XML, preenche número, série, chave, data, natureza, valor, emitente, destinatário e itens (NCM e CFOP). Com chave, entra também no Monitor de NF-e Emitidas; excluir tira do Monitor. Pode só arquivar ou dar baixa no estoque. Não gera CP/CR. CFOP de remessa (5905, 6905, 5901, 5915, 5934, 5949…) não salva: use Remessas (opção NF já emitida em outro sistema).

**Nota Própria por chave de acesso:** na aba Chave de Acesso, Consultar confirma a situação na SEFAZ (certificado A1) e tenta baixar o XML pela Distribuição DF-e para preencher data, valor, destinatário e itens. Se a SEFAZ não entregar, preenche só número, série, chave e CNPJ do emitente e mostra aviso amarelo: complete manualmente ou use a aba XML.

**Devolução, encontro de contas:** o título a receber da devolução fica baixado no valor compensado com os CPs da NF original; só o que sobrar (parcela da compra já paga) continua a receber do fornecedor.

**Data da última sincronização do SIEG:** não avança se uma nota falhar ao salvar, ou se a busca for feita pelo botão Sincronizar com período escolhido.

### Notas de saída e faturamento
**Produtos Agrícolas começam vazios:** nada é criado sozinho. Em Cadastros → Produtos Agrícolas, use Carregar Padrões para trazer a lista padrão ou + Novo Produto para cadastrar um. O ciclo precisa de um produto para a colheita entrar no estoque.

**Produtos Agrícolas e item da NF de venda:** o cadastro em Cadastros → Produtos Agrícolas define nome, NCM e unidade do item da NF de venda. NCM é obrigatório (8 dígitos); o campo sugere o NCM de referência pelo nome. "↺ Carregar Padrões" cadastra os produtos padrão que faltam e preenche NCM vazio dos existentes; nunca troca NCM já preenchido. No Faturamento (NF pelo contrato), o produto do contrato é ligado pelo nome ao cadastro do cliente (todas as fazendas), e a NF sai com nome e NCM do cadastro. Sem produto cadastrado ou sem NCM, a NF usa o NCM de referência de grão e aparece um aviso ao lado de "Itens da Nota" pedindo o cadastro. Na venda avulsa (Documentos Fiscais → Notas de Saída → Notas de Venda), o campo Item sugere os produtos do cadastro e preenche NCM e unidade.

**NCMs de referência** (grão para venda, não semente; confirmar com o contador): Soja 1201.90.00, Milho 1005.90.10, Trigo 1001.99.00, Sorgo 1007.90.00, Arroz em casca 1006.10.92, Algodão em pluma 5201.00.10, Caroço de algodão 1207.29.00.

**Inscrição Estadual na emissão:** nas Notas de Venda, no Faturamento e na Transferência, a NF-e sai pela fazenda da IE escolhida, que define endereço, série e numeração. Produtor com mais de uma IE precisa escolher. No Faturamento não há seletor "Fazenda Emitente": a tela mostra "Emite pela fazenda: …" abaixo da IE. Na Transferência, a origem é a fazenda da IE de origem e o destino é escolhido. CT-e e MDF-e ficam na fazenda da empresa emitente.

**Faturar contrato com ou sem romaneio:** o romaneio não é obrigatório. Em Notas de Venda → Nova NF → contrato, ou no botão "Faturar" do contrato, escolha um romaneio ou "Faturar direto, sem romaneio", informando o peso em kg ("Peso aproximado" vem marcado). Essa marca aparece na lista como "Direto · peso aproximado" e não entra no texto da NF-e. A NF direta não baixa o saldo a entregar do contrato. Se o romaneio da carga for registrado depois, o sistema avisa que já existe NF direta. O preço sai por kg do item do contrato; contrato em dólar é convertido pela cotação do contrato ou PTAX do dia, com aviso para conferir.

**Contas a Receber no faturamento:** em contrato com recebimento por carga, o Contas a Receber nasce da NF-e autorizada, exceto na NF com "Peso aproximado", em que nasce quando o romaneio é ligado à NF. Nos demais contratos, nasce do romaneio.

**Peso aproximado (sem balança):** a NF com "Peso aproximado" não gera Contas a Receber nem consome o contrato. Quando o recebedor enviar o romaneio, lance-o no contrato (+ Romaneio) e escolha a NF em "Romaneio do recebedor: NF aproximada desta carga" (se houver uma só em aberto, já vem escolhida). O peso real é o Peso Classificado Destino, se preenchido; senão, o peso do romaneio. Ao salvar, o contrato é consumido e o Contas a Receber nasce pelo peso real, e o romaneio fica faturado na NF, sem o botão Faturar.

**NF complementar:** se veio mais peso, o sistema oferece a NF complementar (referenciando a original, com a diferença em kg e o preço da NF); também disponível em "＋ Complemento" em Notas de Venda. Em contrato com recebimento por carga, o complemento autorizado gera o CR da diferença; nos demais, não gera outro CR. "Emitir Complementar" no Monitor abre a mesma tela, com quantidade e valor a informar. Se veio menos peso, a NF fica marcada em vermelho e o título sai pelo peso real, mas o sistema não emite documento fiscal: não há regra definida; confirme com o contador.

**Duplicar NF-e:** em Documentos Fiscais → Notas de Venda, "⧉ Duplicar" aparece em NF-e de saída autorizada, cancelada, rejeitada ou denegada; no Monitor NF-e Emitidas, só nas autorizadas. Nota que referencia outra (retorno, complementar, devolução) não duplica. A cópia nasce como Rascunho, sem ir à SEFAZ, e abre para edição: "Salvar rascunho" guarda (volte por "✏ Editar e transmitir"); "Emitir NF-e" transmite com número novo; "Excluir" apaga. Traz destinatário, itens, CFOP, observações, transporte e contrato; não traz chave, protocolo, romaneio nem peso aproximado. Cópias de notas antigas podem vir sem produtor, IE ou transporte; confira.

**Transporte na NF-e:** transportadora (nome, CPF/CNPJ, IE, endereço) e veículo (placa, UF, RNTRC) saem no XML e no DANFE, no quadro Transportador / Volumes Transportados, em Notas de Venda, Faturamento de grãos, transferência de estoque e Transferência de Máquinas e Equipamentos. Nesta última, o bloco Transporte tem: Frete por conta (0 remetente, 1 destinatário, 2 terceiros, 9 sem transporte), transportadora do cadastro (Fretes e Transporte → Cadastros), veículo do cadastro (preenche placa, UF, transportadora e motorista habitual) ou placa digitada. O motorista vai nas informações complementares (a NF-e não tem campo de motorista). Na NF-e de retorno, o bloco aparece em Registrar Retorno/Devolução.

**Textos automáticos na NF-e:** os textos de ICMS diferido, base reduzida e Funrural (Configurações → Sistema → Parâmetros Fiscais (NF-e) → aba Fiscal) só entram em nota de venda: CFOPs 5.1xx/6.1xx (exceto 5151/5152/6151/6152), 5.4xx/6.4xx, 5501/5502/6501/6502 e 5922/6922. Não entram em remessa, retorno, transferência, 5949/6949 nem devolução. O "texto complementar livre" entra em todas. NF-e já autorizada não muda.

**Série e número já existentes:** se a SEFAZ recusa porque série e número já existem, a nota não foi emitida; o sistema tenta automaticamente outro número. Se não achar número livre, avisa que a nota NÃO foi emitida: ajuste o próximo número da IE em Configurações → Sistema → Parâmetros Fiscais (NF-e) → aba Fiscal. Duas IEs do mesmo CPF/CNPJ na mesma série dividem a numeração. Nas Notas de Venda, o motivo da recusa aparece abaixo do número. Se a tela disser "Sem resposta confirmada", atualize a lista antes de emitir de novo.

**DANFE:** "↗ DANFE" de qualquer documento fiscal imprime a logo da conta no quadro do emitente, só se houver logo cadastrada (Configurações ou upload inicial); sem logo, sai só o texto. No Monitor de NF-e Emitidas, Imprimir DANFE abre o PDF no navegador e ⬇ DANFE em PDF baixa o arquivo DANFE NF <número>.pdf. Emitente pessoa física (produtor) mostra o CPF no campo CNPJ / CPF.

**Devolução de compra:** toda NF-e de devolução de compra aparece em Fiscal, Monitor de NF-e Emitidas (natureza Devolução de Compra), onde se vê o DANFE e se cancela. O CFOP dos itens é sugerido pelo CFOP da NF recebida, mesmo em CFOP de saída (5102 sugere 5202, 5405 sugere 5411). Com mais de uma IE, a tela mostra "IE emitente" com a IE de destino do XML de origem; sem ela, usa a IE do município do comprador; sem isso, é preciso escolher. Confira a IE: ela define o estabelecimento e a série.

**Cancelar devolução de compra:** cancelada no Monitor e aceita pela SEFAZ, a devolução é desfeita: o estoque volta, o título a receber do fornecedor é excluído (se já baixado, o sistema avisa para estornar a baixa) e o saldo devolvido na NF de origem é liberado para nova devolução com a NF-e correta. Custos de Apropriação Direta de abastecimento ou manutenção de máquina reduzidos pela devolução não são restaurados automaticamente.

**Devolução da entrega futura:** a NF de entrega (5116/5117) precisa estar processada para mostrar ↩ Devolver. CFOP sugerido 5201/5202 (6201/6202 fora do estado), editável. O produto sai do estoque e o valor abate o Contas a Pagar do simples faturamento ligado; o que sobrar fica a receber do fornecedor. O saldo a entregar não muda. A NF de simples faturamento (5922/6922) não tem Devolver.

**Cancelamento e CC-e com várias IEs:** cancelar ou corrigir NF-e não exige escolher a IE; na emissão, a escolha é obrigatória.

**Duplicar nota antiga:** em ⧉ Duplicar, a cópia de nota emitida antes de 03/11/2026 pode vir sem produtor, IE ou transporte; confira esses campos antes de clicar em Emitir NF-e.

### Transferências, remessas e retornos
**Onde ficam:** Remessas e Retornos ficam só no menu Documentos Fiscais (Remessas e Retornos; Notas Próprias em Notas de Entrada); o menu Fiscal não tem esses atalhos. Compra, remessa e retorno ficam em telas separadas.

**Nova Remessa (armazém):** para mercadoria enviada a armazém geral, depósito ou condomínio logístico. Em + Nova Remessa, escolha Emitir NF-e de remessa pelo Arato ou NF já emitida em outro sistema (número, série, chave e XML opcional, que preenche itens e armazém). Os itens vêm da NF de entrada de origem (opcional) ou do cadastro, na unidade do estoque. Escolha o armazém (destinatário), o depósito de origem e o depósito do armazém (tipo armazém de terceiro ligado ao armazém; se não existir, o link cria). CFOP sugerido: 5905 (mesma UF) ou 6905. Ao salvar, o estoque passa do depósito próprio para o depósito do armazém (continua do cliente; o total não muda) e a NF entra no Monitor. Remessa de insumo é feita na tela Remessas, não pelo wizard de Notas de Venda.

**Emitir NF Remessa:** o botão na NF de entrada processada abre Documentos Fiscais → Remessas e Retornos → Remessas com a + Nova Remessa ligada a essa NF (itens, depósito de origem e valor vêm dela). Na NF de entrada, o tipo "Entrega de compra futura" é entrega de compra para entrega futura (VEF) já faturada, não remessa para armazém.

**Valor com desconto:** com a NF de compra de origem escolhida, o valor unitário vem líquido do desconto: o desconto do cabeçalho é rateado pelos itens, proporcional ao valor de cada um.

**Remessa para industrialização:** CFOP 5901/6901 (por encomenda) ou 5924/6924 (por conta e ordem do adquirente) sai com CST 50 — ICMS suspenso —, sem base nem imposto; os retornos do industrializador (5902/6902, 5903/6903, 5925/6925) também. Ao digitar o CFOP, a natureza é sugerida (ex.: 5901 → "Remessa para industrialização por encomenda"; 5915 → conserto). O campo "CST do ICMS" tem Automático pelo CFOP (mostra qual será) ou 040, 041, 050, 051 à mão. O CST 050 também existe nas Notas de Venda. O industrializador precisa ter IE no cadastro de Pessoas.

**IE emitente (armazém):** com mais de uma Inscrição Estadual, a NF-e de remessa e de retorno mostra o campo "IE emitente (estabelecimento)", com a série NF-e de cada IE. Vem sugerida a IE com série da fazenda do depósito de origem (remessa) ou da fazenda da remessa (retorno). IE "sem série" não deixa emitir — configure em Configurações → Sistema → Parâmetros Fiscais (NF-e) → aba Fiscal → Inscrições Estaduais. O erro "Série "" inválida para emitente CPF" indica IE sem série.

**Lista e volume:** a lista de Remessas mostra Remetido, Já voltou, Falta voltar e o DANFE; embaixo, o volume na unidade dos itens (ex.: 7.340 KG; unidades diferentes somadas por unidade). Abrindo a remessa (▶), cada produto mostra remetido, já voltou e falta voltar. O retorno registra o valor; o volume que voltou é proporcional (quantidade × valor retornado ÷ valor remetido), igual ao movimentado no estoque.

**Busca:** em Remessas, por armazém, número, chave, produto, CFOP ou número da NF de retorno. Em Retornos, a busca no topo filtra todas as listas por número, chave, armazém ou emitente, produto ou máquina.

**Excluir remessa:** remessa Aguardando retorno tem o botão Excluir na linha. Excluir devolve os itens do depósito do armazém ao de origem e, se a NF foi emitida fora do Arato, tira o registro do Monitor de NF-e. NF-e emitida pelo Arato e autorizada precisa ser cancelada antes no Monitor de NF-e (até 24h após a autorização). Remessa com retorno registrado não pode ser excluída: desfaça o retorno em Retornos antes.

**Retorno recebido do armazém:** a NF de retorno (CFOP 5906/6906, 5907/6907, 1906/2906, 1907/2907, via SIEG, XML ou digitada) aparece sozinha em NF de retorno recebidas. Em Processar retorno, escolha a remessa (obrigatório; se não aparece, registre-a antes em Remessas, inclusive NF emitida em outro sistema), o depósito de volta, associe os itens ao cadastro e confira a quantidade na unidade do estoque. Não gera CP nem usa pedido de compra; a tela de NF de entrada recusa essas notas e abre Retornos.

**Retorno emitido por você:** em Remessas aguardando retorno, use Emitir retorno (NF-e pelo Arato, com transporte) ou Retorno emitido fora (número, série, chave).

**Estoque do retorno:** sai do depósito do armazém e entra no depósito escolhido; remessa antiga (que deu baixa no estoque) só dá entrada.

**Retorno parcial:** a remessa acumula o que voltou e só fica Retornada quando volta tudo. No retorno emitido por você, valor menor que o que falta devolve os itens na mesma proporção.

**Várias remessas na mesma NF de retorno:** em Processar retorno, a remessa é escolhida numa lista com marcação: já vêm marcadas as remessas referenciadas no XML (senão, a única aberta do mesmo armazém), e as referenciadas e do mesmo armazém aparecem primeiro. O valor é rateado da remessa mais antiga para a mais nova, até o saldo de cada uma, e pode ser ajustado por linha; a soma tem de bater com o valor da NF e nenhuma remessa pode passar do próprio saldo (a tela avisa e não deixa processar). Cada remessa recebe sua parte no Já retornado (Retornada quando zera) e aparece no histórico dela. Na janela de retorno a partir de Remessas, o bloco "Devolver na mesma NF outras remessas deste armazém" inclui outras remessas abertas do mesmo armazém (mesma fazenda e CFOP de retorno), cada uma com seu valor; a NF-e leva os itens de todas e referencia todas as chaves (um NFref por remessa).

**Máquinas e equipamentos:** conserto, comodato, demonstração e transferência de bem entre fazendas ficam na aba Máquinas e equipamentos da tela Remessas. Em Retornos, a seção Máquinas e equipamentos lista a NF de retorno de máquina recebida (CFOP 1554/2554/1555/2555): escolha a remessa e Registrar retorno (sem CP e sem estoque); e as máquinas aguardando retorno, com link para emitir ou registrar o retorno. A tela de NF de entrada recusa essas notas e abre Retornos.

**Destinatário e IE (máquinas):** em conserto, comodato etc., o destinatário vem de Pessoas e a IE do destinatário vem preenchida e editável. Sem IE, a NF-e sai como não contribuinte. A IE não pode ser incluída por carta de correção: se o destinatário é contribuinte, cancele no Monitor (até 24 horas da autorização) e emita de novo.

**Transferência de máquina entre fazendas:** com o motivo "Transferência entre fazendas", escolha o produtor do cliente e uma IE ativa dele (com uma só, já vem marcada). O endereço da nota vem da IE. Sem IE ativa, cadastre em Cadastros → Produtores. Não é possível emitir para a mesma IE do emitente. O CFOP muda de 5xxx para 6xxx com destino em outro estado, e a tela mostra o CFOP usado.

**IE emitente (máquinas):** com mais de uma IE, remessa e retorno de máquina mostram o campo "IE emitente", com a série de cada uma, sugerindo a IE da fazenda onde a máquina está. Erro de série inválida: escolha outra IE ou configure a série em Configurações → Sistema → Parâmetros Fiscais (NF-e) → aba Fiscal → Inscrições Estaduais.

**DANFE e cancelamento (máquinas):** as NF-e de remessa e retorno entram no Monitor de NF-e Emitidas (DANFE, cancelamento, carta de correção). Na lista, os botões 🖨 DANFE e 🖨 DANFE retorno abrem o mesmo PDF. Cancelar a NF-e de remessa marca a transferência como Cancelada; cancelar a de retorno volta para Emitida (aguardando novo retorno).

**Devolução de máquina de terceiro (CFOP 5.555/6.555):** NF que quem recebeu a máquina emite de volta ao dono, referente à remessa 5554/6554 (mesmo estado 5.555; outro estado 6.555). Não use "Nova NF-e de Venda" da tela Fiscal — Documentos Eletrônicos: não tem esse CFOP nem envia a NF referenciada. Devolução simbólica (máquina fica onde está): confirme antes com o contador. Antes: (1) em Cadastros → Pessoas, complete o dono com CNPJ, IE, endereço, CEP e código IBGE; (2) em Configurações → Sistema → Parâmetros Fiscais (NF-e) → aba Fiscal, confira o próximo número da IE emitente. Em Documentos Fiscais → Notas de Venda → nova nota → Avulsa — Venda: aba Produtor, quem devolve e a IE; aba Destinatário, o dono; aba Operações/CFOP, Natureza "Devolução de bem do ativo de terceiro", que preenche o CST 050 (só exibição); aba Transportador, frete 9 — Sem frete se a máquina não circula, sem transportadora e placa; aba Fiscal, a chave de 44 dígitos da NF de remessa; aba Obs./Adic., o texto do contador citando o número da NF de remessa. Nos Itens da Nota, um item por máquina trocando todos os campos (o item novo vem como Soja): descrição com série e chassi, NCM, quantidade 1, unidade un e o valor da NF de remessa. Clique em Emitir NF-e e confirme. A nota autorizada deve ter o CFOP escolhido, CST 050, ICMS zerado e a chave referenciada; não movimenta estoque nem financeiro. Se a SEFAZ recusar, a nota fica rejeitada com o motivo na tela; corrija por "↺ Corrigir e reenviar" nas Notas de Venda. Rejeição 210 é IE do destinatário inválida: confira os dígitos com a nota de remessa e confirme com o contador se há IE. Cancelamento só no prazo da SEFAZ (a tela informa 24 horas). Esse caminho não controla a máquina de terceiro nem liga a devolução à remessa em Remessas e Retornos → Máquinas.

**Transferência de estoque e fazenda dona do produto:** o estoque é por fazenda dentro de cada depósito, e um depósito pode guardar produto de outra fazenda do cliente. A saída sai da fazenda escolhida no item (campo Sai de); senão da fazenda de origem, se tiver saldo; senão da única com saldo. Com mais de uma fazenda com saldo e nenhuma escolhida, a transferência é recusada pedindo a escolha. Sem saldo em nenhuma, sai da fazenda de origem com aviso. Abaixo de cada item, Neste depósito mostra o saldo de cada fazenda.

**Placa e motorista:** em Transferência entre Fazendas e Transferência de Máquinas, podem vir do cadastro ou ser digitados. Na NF-e, a placa vai no bloco de transporte e o motorista nas informações complementares. Em produtos, digitar a placa com frete "Sem frete" muda o frete para "Emitente" (pode trocar). O digitado vale só para aquela nota e não cria cadastro.

**Nota de transferência vinda do SIEG:** nota de transferência emitida no Arato que volta pelo SIEG aparece em Documentos Fiscais com status Transferência, sem opção de processar (o estoque já foi movimentado). Nota CFOP 5152 Pendente não foi reconhecida como transferência do Arato. Nas Movimentações de uma fazenda aparecem também movimentos em depósito dela, com "Saldo de: [fazenda]" quando o saldo é de outra. Saldo e Kardex contam por fazenda.

**Transferência sem fazenda em Sai de:** a saída é lançada na fazenda de origem somente se ela tiver saldo suficiente no depósito de origem; senão, na única fazenda com saldo.

**Várias remessas na mesma NF de retorno:** a saída do depósito do armazém é feita por remessa, na proporção do valor atribuído a cada uma. A remessa fica Retornada quando o saldo zera e parcial se sobra saldo.

**Remessa já emitida:** a regra do valor com desconto vale só para remessas novas; NF-e de remessa já emitida não muda. Na opção Emitir NF-e de remessa pelo Arato, a emissão tem o campo de emitente e o bloco de transporte.

### CT-e, MDF-e e fretes
**CT-e de frete contratado (SIEG):** a sincronização do SIEG (automática ou pelo botão Sincronizar SIEG em Documentos Fiscais) baixa os CT-e em que o CPF/CNPJ monitorado é o TOMADOR (quem paga o frete). Eles entram em Documentos Fiscais, filtro CT-e, como Pendente. Requer que o SIEG esteja capturando CT-e do CNPJ. CT-e emitido pela própria conta em Fretes e Transporte não entra de novo.

**CT-e de frete lançado à mão:** em Documentos Fiscais, o botão "+ CT-e de Frete" lança um CT-e recebido que não veio do SIEG:
- Importar XML: os dados são lidos do arquivo.
- Digitar dados: chave de acesso de 44 dígitos (conferida pelo dígito verificador; dela saem o CNPJ da transportadora, o número e a série, que podem ser corrigidos), transportadora, emissão, origem e destino, carga, peso, valor do frete e, opcionalmente, as chaves das NF-e transportadas.

CT-e já lançado (pelo SIEG ou à mão) ou emitido pela própria conta não entra de novo. Depois de lançado, abre a janela de processamento. CT-e lançado à mão e ainda pendente pode ser excluído (botão Excluir na janela); o que veio do SIEG não.

**Processamento do CT-e de frete:** clicar no CT-e abre a janela do frete (transportadora, tomador, origem e destino, carga, peso, NF-e transportadas e valor). Escolha quem paga (produtor ou empresa; sugerido pelo CNPJ do tomador), a operação gerencial (sugerida pelo produto: FRETES PRODUÇÃO para grãos, FRETES SEMENTES, FRETES CORRETIVOS ou FRETES DIVERSOS), o vencimento (sugerido: emissão + 30 dias), ano safra, ciclo e centro de custo. Processar e lançar CP gera o título no Contas a Pagar no nome da transportadora (incluída em Pessoas se ainda não existir), com o valor a receber do CT-e.

**Estorno e cancelamento do CT-e de frete:** Estornar apaga o título, se ainda não foi pago, conciliado nem posto em borderô, e o CT-e volta a pendente. CT-e cancelado pelo emitente: se pendente, vira Cancelado; se já processado, recebe aviso para estornar.

**Tomador "Outros":** em Transporte → CT-e, o campo Tomador do Serviço tem Remetente, Destinatário, Expedidor, Recebedor e Outros (terceiro). Em Outros, abre o bloco Tomador do serviço (Outros) para nome, CNPJ/CPF (obrigatório), IE e endereço, com atalho para escolher de Produtores ou Pessoas. A IE do tomador define o indicador de contribuinte (XML com toma4), e o DACTE e o CR do frete mostram esse tomador.

**Endereços no CT-e:** na tela do CT-e, abaixo de Emitente, Remetente e Destinatário aparece o endereço como vai no XML, só para leitura: para corrigir, altere o cadastro (Cadastros, Empresas, para a transportadora; Pessoas ou Produtores, para os demais). Remetente ou Destinatário sem endereço no cadastro saem como "ZONA RURAL", "S/N". Expedidor, Recebedor e Tomador (Outros) têm o endereço digitado no próprio CT-e.

**Código IBGE do município:** se o cadastro da transportadora não tem o código IBGE, o sistema o encontra pela cidade e UF. Se não reconhecer a cidade, avisa antes de transmitir e o número do CT-e não é consumido: confira cidade e UF em Cadastros, Empresas, ou informe o Código IBGE em Parâmetros do Sistema, Fiscal. Os campos de IBGE da tela do CT-e são da origem e do destino, não do emitente.

**Rejeição 215:** a rejeição 215 ("Falha no Schema XML") aponta dado em formato inválido no XML, sem dizer qual campo.

**Carta de correção do CT-e:** em Fretes e Transporte, CT-e, o CT-e autorizado tem o botão Carta de correção. Escolha o que corrigir (Observações, Produto predominante, Outras características da carga, Chave da NF-e com o número do item, ou outro grupo e campo), informe o novo valor e transmita. Até 20 correções por carta e 20 cartas por CT-e; as registradas aparecem na janela. A carta não pode corrigir valores, base de cálculo ou alíquota do imposto, quantidade, tomador, remetente, destinatário, emitente nem a data de emissão: nesses casos emita um CT-e substituto.

**CT-e substituto:** em Fretes e Transporte, CT-e, use o botão Substituir na linha do CT-e autorizado. Abre um novo rascunho com os dados do original; corrija (marque A correção altera o tomador quando for o caso) e transmita. O XML sai com tpCTe 3 e a chave do original em infCteSub. Ao autorizar, o original fica Substituído, o financeiro dele (a receber e a pagar) é cancelado e o do substituto é lançado. O original precisa estar autorizado, e a SEFAZ confere o prazo para substituir. Também dá para escolher Tipo do CT-e igual a Substituto na tela Emitir CT-e: escolha um CT-e autorizado da lista ou Outro sistema e informe a chave de 44 dígitos do original emitido fora do Arato (nesse caso o financeiro do original não é alterado). A lista mostra a etiqueta Substituto no novo e Substituído no original. Se a correção for de valor ou dados que o substituto não admite, a SEFAZ rejeita e o rascunho continua editável.

**Arquivo guardado do CT-e e MDF-e:** o arquivo de cada CT-e e MDF-e autorizado traz o documento assinado e o protocolo. Os mais antigos podem guardar só o protocolo, sem afetar a autorização na SEFAZ.

**Arquivo guardado:** cada CT-e e MDF-e autorizado guarda o documento assinado e o protocolo. Os emitidos antes de 04/11/2026 guardam só o protocolo; a autorização deles na SEFAZ não é afetada.

### Estoque e insumos
**Saldo de estoque:** o saldo de cada item é a soma das suas movimentações (entradas, saídas e ajustes); não existe saldo digitado no cadastro. Item cadastrado já com estoque gera a movimentação "estoque inicial"; itens que tinham saldo só no cadastro têm a movimentação "Saldo inicial (migração)". Na Posição de Estoque, com uma fazenda escolhida, o saldo é o daquela fazenda; em Todas as fazendas, é o consolidado do cliente. Para corrigir um saldo, lance um ajuste (± Mov.); nunca edite o número do estoque.

**Cadastro de item:** cada insumo ou produto existe uma vez só no cliente, valendo para todas as fazendas; o estoque de cada fazenda fica nas movimentações dela. O sistema não aceita cadastrar de novo um item com o mesmo nome (ignorando acento, maiúsculas e pontuação) no mesmo cliente; use o item existente. Na mesclagem de repetidos, o item que fica recebe todo o histórico (movimentações, NFs, pedidos, operações) e os repetidos ficam inativos com a marca de mesclado, sem perda de saldo em nenhuma fazenda. Importação de insumos com item que o cliente já tem lança o saldo da planilha como estoque inicial naquela fazenda, no item existente.

**Possíveis duplicados:** em Comercial & Logística → Relatórios → Posição de Insumos → aba Possíveis Duplicados, o catálogo é revisado para o cliente inteiro (sem seletor de fazenda; o mesmo item cadastrado em duas fazendas também é duplicado). Etiquetas: **Nome igual** (mesmo nome ignorando acento, maiúsculas, pontuação e artigos) e **Nome parecido** (nomes muito próximos ou um contido no outro, como SEM SOJA CG 7681 × SEMENTE SOJA CG 7681, sempre com os mesmos números; variedade ou concentração diferente, como CG 7681 × CG 7682 ou 480 × 720, nunca se juntam). Cada linha mostra fazenda, unidade e estoque. Descartar = não é duplicado; Corrigido = já mesclado. "Mostrar também os já descartados" traz os grupos descartados, com quem e quando descartou; o botão Reabrir devolve o grupo à lista.

**Usuário nas movimentações:** toda movimentação de estoque grava quem disparou a rotina, inclusive as automáticas (NF, transferência, operação de lavoura, abastecimento). O Kardex e a tela de Movimentações mostram esse nome; sem registro, aparece não registrado.

**Transferência entre depósitos (sem NF):** em Comercial & Logística → Relatórios → Posição de Insumos, botão de movimentação, Tipo "Transferência entre depósitos (sem NF)". Informe item, quantidade, depósito de origem e de destino (cada um com o saldo do item); só depósitos da mesma fazenda. Entre fazendas diferentes, use Comercial & Logística → Estoque → Transferência entre Fazendas, com NF. O saldo total do item não muda, só onde ele está. Se a quantidade passar do saldo do depósito de origem, o sistema avisa antes de gravar. No extrato aparece como Transferência, com a rota (origem → destino) na observação.

**Texto das transferências:** nas movimentações, no Kardex e no histórico por item, a entrada aparece como "recebido de [depósito de origem]" e a saída como "enviado para [depósito de destino]". Saída negativa na origem, entrada positiva no destino.

**Operações não geram Conta a Pagar:** pulverização, plantio, adubação, correção de solo, tratamento, recomendação agronômica executada, consumo pelo App Campo, operação lançada pelo WhatsApp e abastecimento em bomba própria só baixam o estoque, ao custo médio do produto na hora da baixa (custo que vai para o DRE do ciclo). A Conta a Pagar nasce só da entrada de NF ou NFS, para estoque ou como apropriação direta. Abastecimento em posto externo também não gera CP: ele vem quando a NF do posto for lançada (pelo WhatsApp, fica como pendência fiscal aguardando essa NF). Compra informada pelo WhatsApp não dá entrada no estoque nem gera CP: fica em Pendências Fiscais aguardando a NF, e estoque e CP entram uma vez só, pela NF. A tela de Abastecimento não tem a opção "Gerar Conta a Pagar".

**Auditor Fiscal × Físico:** em Comercial & Logística → Relatórios → Auditor Fiscal × Físico, compara, por insumo, o estoque fiscal com o físico. Fiscal = NFs de entrada processadas (itens ligados ao cadastro) + NF de transferência entre fazendas emitida (entra no destino, sai da origem) − devolução de compra; NF de retorno ou remessa de armazém não entra. Físico = soma das movimentações. A Diferença (físico − fiscal) é aberta nas colunas: Consumo, Ajustes, Apropriação direta, Entrada sem NF, Transferência sem NF, Perdas, Remessa/retorno e NF × estoque (NF processada que não movimentou o estoque, movimentou em dobro ou em quantidade diferente). Situação: Não fecha (NF × estoque diferente de zero ou físico negativo), Atenção (entrada/transferência sem NF ou físico acima do fiscal), Explicado (só consumo, ajustes e apropriação direta). Abre no Consolidado; por fazenda, NF lançada numa fazenda com o produto estocado em outra aparece como diferença nas duas e se anula no consolidado. Filtros: posição até uma data, fazenda, situação e busca; exporta XLSX. Só leitura.

**Rastreabilidade do Item:** em Comercial & Logística → Relatórios → Rastreabilidade do Item, escolha o insumo e o período. O diagrama mostra, da esquerda para a direita: origens (NF de cada fornecedor, Saldo anterior ao período, Ajustes/saldo inicial, Produção própria, Entrada sem NF), depósitos (com transferências e remessas entre eles) e destinos (Consumo por ciclo ou por operação, Abastecimento, Perdas, Ajustes (−), Devolução ao fornecedor, Outras saídas), terminando no Saldo final de cada depósito. A largura da faixa é a quantidade; passar o mouse destaca o caminho. Transferência cancelada não aparece. Embaixo ficam a tabela de saldo por depósito (saldo no início, entradas, saídas, saldo pelo caminho e, quando a data final é hoje, o saldo do sistema para conferir) e a lista dos trechos. A faixa "Transferência recebida/enviada (sem par)" indica transferência sem o lançamento correspondente no outro depósito. Só leitura.

**Auditor Fiscal × Físico, colunas da Diferença:** Consumo = operações de lavoura e abastecimento; Ajustes = ajuste, inventário, saldo inicial e migração; Apropriação direta = item da NF que não foi para o estoque.

**Saldo e ordem:** o saldo do item é recalculado a cada movimentação lançada, alterada ou apagada. Nas movimentações, no Kardex e no histórico por item, os movimentos do mesmo dia seguem a ordem de gravação, com a saída antes da entrada, então o saldo por linha não oscila.

**Transferência entre depósitos (sem NF):** grava juntas a saída no depósito de origem e a entrada no de destino. Na Rastreabilidade do Item, o par é achado pela referência TRF/Remessa ou por terem sido gravadas juntas; sem par, aparece a faixa "Transferência recebida/enviada (sem par)".

### Pedido de compra
**Fluxo de caixa:** ao aprovar um pedido, o Contas a Pagar ganha um título do pedido com o valor total, que alimenta o fluxo de caixa projetado. Cada NF vinculada ao pedido e processada gera seu próprio título, e o título do pedido passa a valer só o saldo (total do pedido menos as NFs processadas). Quando as NFs cobrem o pedido, o título do pedido é cancelado automaticamente (observação *Saldo do pedido zerado pelas NFs vinculadas*); se uma NF for estornada ou excluída, o título é reativado. O pedido barter não entra nessa regra. Total do pedido digitado errado gera saldo errado: corrija o total no pedido.

**Pedido em US$:** o saldo do título fica em dólar, com cada NF (sempre em reais) convertida pela PTAX do dia da emissão. Sobra de até 2% do total é diferença de câmbio e o título é encerrado; acima disso, o saldo fica em aberto. Sem PTAX para alguma NF, o título não é alterado.

**Total do item:** na lista de itens do pedido, a coluna Total pode ser digitada (depois de informar a quantidade); o valor unitário passa a ser total ÷ quantidade + desconto unitário. O valor unitário aceita até 8 casas decimais e a quantidade até 4.

**Exclusão do pedido:** no ✕ do pedido, o sistema lista as NFs de entrada ligadas a ele. Se nenhuma está processada (só pendente ou cancelada), pergunta se deve desvincular a NF e excluir o pedido; a NF continua em Documentos Fiscais, sem pedido. Se há NF processada, o pedido não pode ser excluído: estorne a NF em Documentos Fiscais antes.

**Relatório Sintético:** em Comercial & Logística → Relatórios → Pedidos de Compra, Abrir Filtro e Gerar, visão Por Pedido, tipo Sintético (padrão), PDF. Cada pedido traz:
- nº, fornecedor, situação, produtor e IE, fazenda, safra, emissão, vencimento (o da última parcela), valor total, atendido, pago e a pagar;
- produtos com quantidade total, atendida, cancelada, saldo e valor atendido;
- parcelas do pedido e das NFs vinculadas, com origem (Pedido ou NF nº), volume da NF (na unidade do produto no pedido, ex.: 48,000 t; item sem conversão segura sai na unidade da NF), vencimento, valor, pago, saldo e situação.

Os filtros usados aparecem no topo.

**Relatório Analítico:** gera uma página por pedido com as NFs detalhadas.

**Menus de relatórios:** nos menus Comercial e Financeiro, os relatórios ficam agrupados por tela de origem, com separador.

**Relatório Sintético:** o campo atendido é o valor das quantidades entregues; pago e a pagar são somados das parcelas do financeiro (títulos do pedido e das NFs vinculadas).

### Contas a Pagar e a Receber: lançamento e grid
**Sequência de campos no lançamento:** CP, CR e Tesouraria seguem a ordem: 1) Produtor ou Empresa; 2) Fornecedor/Cliente e documento; 3) Operação Gerencial e Descrição; 4) Valor e Vencimento; 5) Forma de pagamento e Conta; 6) Ano Safra, Ciclo e Centro de Custo; 7) extras (juros/multa, veículo, mão de obra, parcelas, previsão); Observação no fim. Não há campo Fazenda: o título fica na fazenda do produtor escolhido (Tesouraria: na fazenda da conta bancária).

**Ano Safra obrigatório:** em Pedido de Compra, NF de Produtos (Documentos Fiscais), NFS-e (ao processar), Processar em Lote (cada NF com ano safra próprio ou o do lote), Contas a Pagar e a Receber (inclusive Empresa), Apoio Financeiro, Adiantamentos de fornecedor, pagamento de Arrendamento, Contrato de Compra de Terra, Contrato de Comercialização de Grãos e Abastecimento. Vem preenchido com o ano safra vigente, com asterisco; salvar sem ele é bloqueado com aviso. Nas operações de lavoura (plantio, adubação, pulverização, correção, colheita) vem do ciclo escolhido. Lançamentos antigos sem ano safra continuam existindo; ao editá-los o sistema pede o ano safra.

**Cadastro rápido de fornecedor/cliente:** no Novo lançamento de Contas a Pagar, o rótulo Cadastro Fornecedor (no CR, Cadastro Cliente) fica acima e à direita do seletor da pessoa, nos lados Produtor e Empresa. Abre o popup da NF com o documento em branco: digite o CNPJ e clique em Consultar para a Receita Federal preencher. Ao salvar, a pessoa já fica selecionada.

**Aba Adicionais (CP, lado Produtor):** % Juros a.m., % Multa, % Desc. pontualidade; Veículo/Máquina; e, com operação gerencial Mão de Obra (2.01.01.10), Funcionário/Prestador, Tipo, Unidade e Quantidade.

**Edição de título:** ao editar título do produtor, a tela carrega Talhão, Produtor, Ano Safra, Ciclo, Série do documento e, se a forma de pagamento for cartão, o cartão. Título de parcelamento mostra o selo Parcela N/total. Contas a Pagar completa Ano Safra e Produtor vazios com os da data de vencimento e do funcionário.

**Parcelar título já lançado:** abra o título em Editar, escolha Condição de Pagamento Parcelado, informe nº de parcelas e frequência, clique em Gerar, ajuste datas e valores na grade se precisar e use Salvar e dividir em N parcelas. A 1ª parcela é o próprio título e as demais são criadas no mesmo agrupamento (Produtor e Empresa); nada é apagado nem duplicado. O total pode diferir do original (juros ou desconto); o arredondamento vai na última parcela. Só vale para título em aberto, sem baixa, conciliação nem borderô, que não seja parcela de outro parcelamento nem em sacas (barter). No CP, cada parcela pode ter safra e ciclo próprios.

**Produtor do título:** CP e CR têm a coluna Produtor (em título de Empresa, o nome da empresa), o campo no popup e o filtro Produtor, válidos também para baixados. Ao processar NF de entrada sem escolher produtor, o CP recebe o produtor cujo CPF/CNPJ é o do destinatário; com dois produtores de mesmo documento usa o da fazenda da NF, e sem desempate fica em branco. O CP de NFS-e leva o produtor quando o tomador é produtor. Títulos sem produtor ficam em branco até serem preenchidos (edição ou rotina de preenchimento).

**Títulos de Empresa:** no CP mostram o Nº e o Nº NF (sem NF, o documento informado), e o filtro de Nº NF os encontra. No Monitor de Auditoria, a tabela CP / CR Empresa registra quem lançou, alterou, baixou ou excluiu cada título de Empresa.

**Previsões:** títulos de previsão (Previsão de Gastos e salários de folha em rascunho) aparecem em itálico, cinza e com faixa tracejada à esquerda; o mouse sobre a linha mostra o tipo e o Status é "Previsto". Não são dívida real: não têm Baixar, não entram em Baixar em lote nem Criar Borderô e não aparecem na Conciliação Bancária. No lugar de Baixar aparece ⚡ Efetivar, que abre o título como Real para conferir e salvar; ao editar um previsto, ⚡ Efetivar muda para Real antes de salvar. Salário em rascunho vira real fechando a folha. O atalho "Previsões" mostra só eles. No rodapé, somam à parte (Previsões não efetivadas), fora do Saldo em aberto.

**Baixa:** valor pago + ajustes (desconto/juros) frente ao saldo define baixa total ou parcial. No CP, título manual sem NF abre Vincular Nota Fiscal à Baixa (busca NF-e/NFS-e pendentes; "Baixar sem NF" segue direto); títulos de NF, folha, contratos, impostos e similares pulam essa etapa. A janela tem o bloco Classificação (fornecedor/cliente, ano safra, ciclo, operação gerencial; no CP, a caixa de salvar como padrão do fornecedor). Título em sacas (barter) abre como Confirmar entrega (barter).

**Baixa parcial:** a janela pede a nova data de vencimento do saldo.

**Reabrir:** desfaz a baixa e volta o título para aberto/vencido.

**Quem fez a baixa:** no CP e CR, o mouse sobre a coluna Baixa (data) ou Status de título baixado/parcial mostra "Baixado por <usuário> em <data e hora>"; rotina automática aparece como "processo automático (sem usuário)".

**Excluir:** o Excluir (janela do título) e o 🗑 Excluir da barra de seleção (títulos marcados) só excluem lançamento manual, em aberto ou vencido, sem documento fiscal. Títulos de folha, contrato, arrendamento, consórcio etc. não aparecem para exclusão: desfaz-se pela tela de origem. No lote, os não manuais são pulados e a confirmação diz quantos ficaram de fora; com tipos misturados, o botão mostra entre parênteses quantos serão excluídos.

**Excluir título de NF processada:** títulos de NF de Produtos ou NFS-e processada (produtor ou Empresa, todas as parcelas) não podem ser excluídos pelo CP/CR nem pelas telas de Empresa; o sistema mostra o nº da nota e o caminho: se pago, desfazer a baixa; depois, em Documentos Fiscais, abrir a nota e clicar em Estornar. O estorno exclui os títulos junto com o estoque e a nota volta a pendente, podendo ser corrigida e processada de novo.

**Período de vencimento:** "Vencimento de" e "até" filtram exatamente o que mostram. A tela abre em Em aberto (inclui vencidos e parciais), sem data inicial e com "até" = hoje + 60 dias. Sem período escolhido à mão, a busca por fornecedor/cliente ou nº de NF e os atalhos Barter/Contratos financeiros/Compra de terra olham todas as datas (campos de data ficam vazios); escolher data faz ela valer na busca. Limpar filtros tira todas as datas.

**Atalhos de status:** Em aberto, Todos, Vencidos, Vencendo (7 dias), Parciais, Baixados, Barter, Contratos financeiros, Compra de terra e Previsões. O status em aberto aparece como "Aberto" em telas e relatórios.

**Filtros:** Origem, Status e Moeda (Real, Dólar, Barter) aceitam seleção múltipla; nada marcado mostra todos. O filtro Produtor fica no bloco de filtros. Não há campo Buscar: cada coluna tem filtro sob o cabeçalho — "contém" em texto e data dd/mm; número exato, >n, <n ou faixa n-m em Valor, Pago, Saldo e Dias. Nº NF busca pelo número da nota (no CP, o borderô aparece se algum título dele tem essa NF). Fornecedor (Cliente, no CR) procura pelo nome; título sem fornecedor é achado pela descrição, e título de NF também pelo emitente da nota (útil com dois cadastros de nomes diferentes para o mesmo CNPJ). "Limpar filtros" limpa todos, inclusive Moeda e filtros de coluna.

**Colunas do grid:** visíveis, ordem e largura são guardadas por usuário. Se uma coluna sumir, clique com o botão direito no cabeçalho e use Restaurar padrão. "Lançado via" mostra se veio de pedido, nota, contrato, folha ou manual.

**Títulos em dólar:** o grid mostra o valor em reais (cotação do lançamento; sem ela, PTAX do dia, marcada "· PTAX") e abaixo o valor em US$. Pago, Saldo e o detalhe usam US$; os totais somam em reais.

**Contas a Receber:** indicadores, busca, filtros e painel de borderô seguem o CP. Ao clicar em um borderô, o painel mostra saldo em aberto, vencimento do saldo e as ações ver NFs, confirmar recebimento, receber saldo restante, estornar e cancelar. Atualizar recarrega títulos e borderôs.

**Conciliação Bancária:** classifica cada linha do OFX como alta/média/bloqueado/nenhum (tolerância 0,02; janela de 7 dias; alta até 2 dias de diferença). Alta pode aplicar automaticamente; média é sugestão para revisão manual. O popup do OFX vinculado lista Produtor/Empresa e Documento de origem de cada título, a conta com o titular, e avisa pago por outro titular quando o titular difere do dono do título. A coluna Produtor mostra o titular da conta de baixa se baixado e o produtor do título se em aberto.

**Relatório CP/CR:** a coluna Produtor mostra o produtor ou, em título de Empresa (PJ), a empresa. O Excel traz Nº da NF e Operação Gerencial.

**Alertas & Pendências do painel inicial:** CP e CR vencidos, vencendo hoje, amanhã, em 2–3 dias e na semana seguem o critério do grid: títulos do produtor e da Empresa, status Aberto/Vencido/Parcial, saldo em reais, sem previsões nem barter, sem corte de data para vencidos. O "ver" abre o CP/CR já filtrado com o mesmo total. Número alto indica vencidos não baixados (pagos fora do sistema, parcelas de contrato financeiro ou manuais antigos): baixe ou exclua no CP/CR.

**Auditoria de títulos de Empresa:** no Monitor de Auditoria, a tabela CP / CR Empresa só tem registro das ações a partir de 23/10/2026.

**Atalho Previsões:** mostra só os títulos de previsão e respeita o período de vencimento escolhido.

### Baixa, parcial, borderô e estorno
**Limite da baixa:** a baixa nunca passa do valor do título. Em Contas a Pagar, Contas a Receber e no financeiro da Empresa (inclusive ao aceitar sugestão na Conciliação), o sistema recusa valor pago que, somado ao já pago, passe do valor do título. Juros e multa só ampliam o limite quando informados na própria baixa (limite = valor + multa + juros − desconto). Sem eles, pagar a mais é recusado com a mensagem de informar juros ou multa ou corrigir o valor. Em dólar, o limite usa a cotação do título.

**Baixa com desconto:** com desconto (ex.: antecipação), o valor pago é menor que o do título, mas o título fica Baixado e quitado. A coluna Saldo de título baixado é sempre zero, na tela e no relatório de CP/CR. O desconto aparece no detalhe da baixa.

**Baixa de título em dólar:** aparece "Cotação do pagamento", com a cotação do título ou a PTAX atual sugerida. Troque pela cotação real do dia: o valor em reais é recalculado e a cotação fica gravada no título.

**Pagamento parcial (Contas a Pagar, produtor e Empresa):** o título fica Baixado com o valor pago (marcado como parcial). Nasce um título novo Em aberto com o saldo, ligado à mesma NF, fornecedor e classificação. Na janela de baixa, o campo Vencimento do saldo define o vencimento do título novo (vazio = mantém o atual). Vale para qualquer forma de baixa (tela do CP, conciliação bancária, adiantamento). Na conciliação, cada parte é um título comum, com o valor exato do pagamento e a marca parcial. Ao selecionar uma parte, aparece o Histórico do título, com todas as partes (pagas e em aberto) e a soma igual ao valor original. Juros e multa entram no último pagamento. Ficam fora da divisão: título em dólar, parcela de contrato financeiro e Contas a Receber. Título em borderô é dividido junto com o borderô.

**Adiantamento a fornecedor na baixa:** vale ao baixar título do produtor em Contas a Pagar (inclusive o gerado por NF de entrada). Se o fornecedor tem adiantamento com saldo na mesma moeda, a janela de baixa mostra o quadro Adiantamento disponível deste fornecedor e o botão Aplicar. O valor sugerido é o menor entre o saldo do adiantamento e o do título, editável para uso parcial. A aplicação abate o título e reduz o saldo do adiantamento:
- se cobrir o título inteiro, ele fica baixado sem movimento bancário;
- se cobrir só parte, o valor a pagar pelo banco é recalculado.

A sobra continua disponível para outros títulos do mesmo fornecedor. Só quita título do mesmo fornecedor (mesmo cadastro ou mesmo CPF/CNPJ); o sistema recusa outra combinação. O título precisa ter o fornecedor (pessoa) preenchido e não pode ser barter.

**Adiantamento de funcionário:** pode quitar título do produtor de qualquer fornecedor, de qualquer produtor do mesmo cliente (ex.: conta da farmácia do funcionário com NF em nome do produtor). Na janela de baixa, abra Pagar com adiantamento de funcionário, escolha o adiantamento (mostra o saldo) e o valor, e clique em Aplicar. Não sai dinheiro de novo:
- o título é baixado sem conta bancária;
- passa para a OG Adiantamento para funcionário (sai da despesa da fazenda);
- recebe na observação de quem foi o adiantamento.

O adiantamento continua pendente e é descontado na folha ou na gratificação. A sobra pode pagar outro título. Só vale para título do produtor (não da Empresa), em reais.

**Previsões:** salário em previsão (folha em rascunho) não pode ser baixado nem conciliado: feche a folha antes, e o fechamento gera o título real. Previsão da Previsão de Gastos também não é paga direto: abra o título e clique em ⚡ Efetivar. Outra previsão lançada à mão vira título real automaticamente ao ser paga. Se a folha tiver salários em previsão já pagos, Fechar Folha os transforma em reais sem reabrir.

**Folha de PJ:** mostra o nome da empresa empregadora e, abaixo, o produtor vinculado aos funcionários.

**Conta bancária na baixa em lote e no borderô:** os modais "Baixar em Lote" e "Confirmar Pagamento do Borderô" listam as contas bancárias de todas as fazendas do cliente, igual à baixa individual. Lote com títulos de mais de uma fazenda encontra a conta de qualquer uma delas.

**Borderô (pagamento/recebimento em lote):** o borderô é o título e representa o documento de pagamento real (ex.: o boleto mensal de um posto somando várias NFs do mês). Pagamento parcial, juros, multa e desconto são sempre do borderô inteiro, com um valor só por borderô, nunca de uma NF/item dentro dele. Funciona igual em Contas a Pagar e Contas a Receber.

**Criar Borderô:** agrupa os títulos (NFs) selecionados sem baixar (fica "pendente"). No Contas a Pagar, o borderô é de um fornecedor só: com fornecedores diferentes selecionados, o sistema recusa e orienta usar Baixar em Lote. O modal mostra o fornecedor, e a descrição padrão é "Borderô FORNECEDOR — N NFs". Campos:
- Descrição;
- Nº do título (referência do documento, ex.: número do boleto, distinta da descrição);
- Data de vencimento do borderô (opcional).

A lista de NFs (número + valor) é só informativa, não editável. Título de pessoal sem fornecedor cadastrado (salário, férias, rescisão, 13º) tem o funcionário como fornecedor, e a coluna Fornecedor mostra o nome dele. Salário e férias do mesmo funcionário podem ir no mesmo borderô.

**Borderô no grid:** aparece como linha colorida (amarela pendente, verde pago) com as colunas Fornecedor, Nº, Descrição (Borderô · N NFs), Vencimento, Baixa, Valor, Pago, Saldo, Conta e Status (Borderô pendente/parcial/pago). Com mais de um fornecedor, aparece "Vários (N)". As ações (Ver NFs, Confirmar Pagamento/Recebimento, Cancelar, Estornar) abrem ao clicar na linha (botão Ver). A linha obedece aos filtros. Os títulos do borderô ficam dentro dele, não soltos no grid; depois de confirmado, o borderô vira uma única linha de borderô pago.

No Contas a Pagar, o filtro padrão é Aberto, então borderô pago não aparece: a tela avisa quantos estão fora, e o botão "Mostrar pagos" inclui o status Baixado. O filtro de período usa o vencimento do borderô; sem ele, o último vencimento dos títulos; sem títulos, a data do pagamento. Borderô pago sem nenhum título ligado deve ser conferido com o extrato: encaminhe à equipe Raccolto.

**Confirmar Pagamento/Confirmar Recebimento:** é o passo que baixa o borderô. Nele você define:
- data real e conta bancária;
- Valor a pagar/receber (padrão = soma das NFs; editável para menos = pagamento parcial do borderô inteiro);
- Juros, Multa e Desconto, um campo cada, sobre o título e não por NF.

O sistema rateia esses valores entre as NFs proporcionalmente; o usuário não edita esse rateio.

**Pagamento parcial de borderô (Contas a Pagar):** Valor a pagar menor que o saldo divide o borderô. Ele fica Pago com o valor pago (no grid: "Borderô pago · parcial"). Nasce um borderô novo Em aberto com o saldo, com o mesmo fornecedor, as mesmas NFs e o vencimento de Novo vencimento do saldo (vazio = mantém o atual). Cada NF é dividida na proporção do seu saldo: a parte paga fica no borderô pago e a parte em aberto vai para o borderô do saldo.

Juros e multa ficam desabilitados no pagamento parcial e entram no pagamento que quita o saldo; o desconto pode ser dado no parcial. Na conciliação, cada borderô pago é uma linha com o valor exato que saiu do banco e a marca parcial. Ao selecioná-lo, aparece o Histórico do borderô, com todas as partes e a soma igual ao valor original. Estornar o borderô pago devolve as partes pagas dele como títulos em aberto fora de borderô; o borderô do saldo continua como está. No Contas a Receber, e em borderô com pagamento acumulado sem essa divisão, o saldo fica no mesmo borderô.

**Cancelar e Estornar borderô:** Cancelar desfaz o agrupamento de um borderô pendente sem baixar nada. Estornar desfaz só o pagamento de um borderô confirmado: ele volta a ficar em aberto, com os mesmos títulos, sem data e conta de pagamento, e pode ser pago de novo. Pagamentos feitos antes de o título entrar no borderô são preservados, e as linhas do extrato ligadas aos títulos voltam a ficar pendentes para conciliar. Para soltar os títulos, use Cancelar no borderô já estornado. Título pago em borderô não é reaberto sozinho: use Estornar no borderô.

**Parcial em registros antigos:** no Contas a Receber, e em borderô que já tinha pagamento acumulado antes de existir a divisão do pagamento parcial, o saldo fica no mesmo borderô.

### Conciliação bancária
**Borderô:** aparece como uma linha só (selo BORDERÔ, "ver títulos"), inclusive com títulos da Empresa. Vale o que saiu do banco: principal pago + juros + multa − desconto, não a soma das NFs. Borderô já pago no Contas a Pagar e ainda não conciliado aparece também na aba CP/CR em aberto, pela data do pagamento.

**Pagamento em parcelas:** título pago em parcelas no Contas a Pagar aceita uma linha do extrato por pagamento. Cada linha é comparada com o valor pago que ainda não tem linha, não com o total, e só vincula, sem somar ao pago. Depois da primeira linha, o título aparece nas abas Baixados e CP/CR abertos com "falta vincular R$ X" e segue selecionável até as linhas cobrirem todo o valor pago. A primeira linha é feita pela aba Baixados. Num título parcial, se a linha não bater exatamente com o valor pago sem linha, o sistema pergunta: OK = parte do pagamento já lançado (só vincula); Cancelar = pagamento novo (soma ao pago).

**Sugestão de conciliação:** considera o nome de quem recebeu (quando a descrição da linha o traz), depois valor e data. Cada título é sugerido a uma linha só. Título de salário não é sugerido para linha com nome de outra pessoa e, sem nome confirmado, nunca concilia sozinho: fica como sugestão para conferir. Para os demais títulos, o nome só dá prioridade. Conciliações já gravadas não mudam. Se a linha não sugere título, use "Vincular".

**Relação dos títulos:** na Conciliação Bancária, clique no texto com seta (→ descrição do título) abaixo de uma linha conciliada para abrir um popup com todos os CPs e CRs ligados (tipo, fornecedor ou cliente, descrição, vencimento, baixa, status e valor, com saldo no rodapé). Útil em lote ou borderô.

**Filtro de data no Extrato OFX:** o painel do extrato tem filtro Data, de/até, que limita as linhas mostradas sem alterar o importado.

**OFX importado de novo (mesmo período):** linha que já existe na conta com mesma data, valor, tipo e descrição não entra de novo, mesmo com FITID diferente. Transações reais iguais no mesmo dia (ex.: duas tarifas iguais) continuam separadas.

**Gravação da conciliação:** se a baixa de algum lançamento falhar, o sistema avisa erro e esse lançamento não é marcado como conciliado.

**Erro ao salvar a conciliação:** se aparecer "Não foi possível salvar a conciliação", anote o texto da linha Motivo para o suporte.

**Extrato × Contas a Pagar/Receber divergentes:** o botão Verificar divergências, na tela de Conciliação, mostra quantas diferenças existem: vínculo com título excluído, título sem a marca de conciliado, extrato conciliado com título em aberto, título conciliado sem linha de extrato. Ao confirmar, o sistema marca os títulos, baixa o título quando o valor bate com a linha (com data e conta da linha) ou devolve a linha a Pendente quando não bate. Regra: o vínculo da linha do extrato manda; a marca no título é consequência. Reabrir (estornar) uma baixa ou excluir um título também solta a linha do extrato.

**Gravação da conciliação:** a linha do extrato só fica conciliada depois que todos os lançamentos envolvidos forem atualizados com sucesso. Se a baixa de algum falhar, o sistema avisa erro, esse lançamento não é marcado como conciliado e a linha do extrato não fica conciliada.

### Cartão de crédito
**Lançamento de CP no cartão:** Ao escolher a Forma de Pagamento "Cartão de Crédito" no lançamento de CP, aparece o seletor do cartão (cadastrado em Financeiro → Cartões de Crédito), de preenchimento obrigatório. O lançamento recebe status próprio de cartão e **não aparece no grid de Contas a Pagar** (não é saldo em aberto do fornecedor/produtor).

**Conta bancária e fatura:** O lançamento no cartão **não movimenta conta bancária nem conciliação**. O valor vai para a fatura do cartão daquela competência (mês/ano calculado pelo dia de fechamento cadastrado no cartão), somando com os demais lançamentos no cartão.

**Recorrência e parcelamento:** Cartão de Crédito não é compatível com a condição "Recorrência". Para dividir em várias faturas, use "Parcelado" com a grade editável — cada parcela cai na fatura do seu mês.

**DRE:** O lançamento conta no DRE normalmente pela Operação Gerencial escolhida, na data da compra. Só o regime de caixa fica represado até a fatura ser paga.

**NF de entrada paga no cartão:** Na NF (Documentos Fiscais → Notas de Terceiro), em Pagamento e Classificação, a Forma de Pagamento tem "Cartão de Crédito"; ao escolher, aparece o seletor do cartão (obrigatório). Ao processar a NF, em vez de CP em aberto, cada parcela vira um título no cartão, na fatura do mês da sua data. Vale para NF do produtor; para NF destinada a Empresa o sistema avisa que ainda não há cartão, e no Contas a Pagar da Empresa a opção não aparece.

**Total da fatura, estorno e exclusão:** O total da fatura é sempre a soma dos seus títulos. Estornar ou excluir uma NF paga no cartão tira o valor da fatura automaticamente. Numa fatura já paga, os títulos não podem ser alterados nem excluídos; ajuste com lançamento novo na próxima fatura.

### Previsão de gastos
**Onde fica:** Financeiro → Previsão de Gastos (Previsto × Realizado).

**Lançar previsão:** informe Operação Gerencial (obrigatória; pode ser OG de grupo), valor e vencimento. Opcionais: fornecedor, ciclo, centro de custo e se o gasto é do Produtor ou da Empresa.

**Recorrência:** marque Repetir e informe quantidade e periodicidade (Mensal, Bimestral, Trimestral, Semestral ou Anual). O grid mostra as parcelas, com data editável. Mudar 1º vencimento, quantidade ou periodicidade refaz o grid e descarta as datas alteradas. Só vão para o Contas a Pagar ao salvar.

**Contas a Pagar e fluxo de caixa:** cada previsão entra no CP e no fluxo de caixa como previsão.

**Consumir a previsão:**
- NF de Entrada: campo "Consumir previsão", acima dos botões de processar;
- lançamento manual de CP: campo "Consumir previsão" no modal;
- Efetivar no título de previsão no CP (vale o valor editado).

A previsão fica Cumprida, sai do CP e do fluxo, e o título real entra no lugar.

**Diferença entre previsto e real:** vai para a aba Decisão do Gestor:
- Efetivar: vira desvio e sai do caixa;
- Manter saldo: a sobra segue prevista para consumo posterior.

Sem decisão, a sobra continua como previsão no caixa.

**Tolerância:** diferenças pequenas são efetivadas automaticamente pela tolerância (% do previsto ou R$, vale o maior), configurada na aba Decisão do Gestor. Padrão: zero.

**Previsões vencidas:** previsões em aberto com vencimento passado aparecem na aba Previsões Vencidas:
- Alterar data: continua prevista;
- Efetivar: encerra sem gasto e o saldo vira desvio.

**Editar e cancelar:** linhas nunca são apagadas. Só antes de qualquer consumo é possível Editar ou Cancelar; a cancelada sai do Previsto.

**Aba Previsto × Realizado:** por OG (pode abrir por mês): Previsto, Realizado, Desvio e % realizado com semáforo (verde até 100%, amarelo até 110%, vermelho acima). O Realizado soma todos os títulos reais da OG (produtor e empresa), com ou sem previsão; gasto sem previsão aparece marcado "sem previsão". Leitura por data de vencimento, lançamento (competência) ou pagamento (caixa). Exporta para Excel.

**Folha de pagamento:** a folha em rascunho gera previsões (origem Folha), uma por funcionário, mais FGTS e INSS Patronal. Ao Fechar Folha, os títulos reais as consomem, com a mesma regra da diferença.

**Fora do módulo:** contratos financeiros e arrendamentos não entram na Previsão de Gastos.

### Tesouraria, mútuo e aplicações
**Filtros da Tesouraria:** Em Financeiro → Tesouraria, acima da lista, há os filtros Buscar (descrição, operação, conta, observação ou valor), Operação, Tipo (Entradas/Saídas), Status (Aberto/Baixado), Conta e Data de/até. Os cartões Total Entradas, Total Saídas e Lançamentos em Aberto mostram só o que está filtrado. Limpar tira todos os filtros.

**Lançamento de Mútuo:** Em Financeiro → Tesouraria, use o botão "Lançamento de Mútuo" ou a operação de mesmo nome no Novo Lançamento.

**Novo mútuo:** Na aba Novo mútuo, informe Quem empresta e Quem recebe (lista com produtores, empresas do cliente e fornecedores/pessoas), a conta bancária de cada lado que é do cliente, o valor, a data e, opcionalmente, o vencimento previsto e os juros % a.m. Para cada lado do cliente nasce um título já pago na categoria Mútuo, fora do LCDPR: saída para quem empresta e entrada para quem recebe. Produtor fica no CP/CR do produtor; empresa, no CP/CR da Empresa. Se um lado é de fora (fornecedor/pessoa), só o lado do cliente entra no caixa.

**Devolução (encontro de contas):** Na aba Devolução, escolha o mútuo em aberto (Quem → Quem | data | valor | saldo), o valor (não passa do saldo) e as contas. Nascem a saída de quem devolve e a entrada de quem recebe, o saldo é abatido e o mútuo fica Quitado quando o saldo zera.

**Mútuos em aberto:** O quadro "Mútuos em aberto", abaixo do grid, mostra cada mútuo com suas devoluções e saldo, com os botões Devolução, Excluir (só para mútuo sem devolução) e Desfazer devolução (só se os títulos não estiverem conciliados).

**Operações Gerenciais nos seletores:** Cada Operação Gerencial aparece uma vez nos seletores de Lançamento de Tesouraria, Operações de Tesouraria, Estoque e Auditoria de Classificação; vale a versão do cliente, não o modelo do sistema. Duas operações do mesmo cliente com o mesmo código, mas com nomes diferentes, são cadastros distintos: nesse caso, altere o código de uma delas.

### Contratos financeiros, consórcios e seguros
**Indexador e taxa (Taxa Fixa + Variável):** o Indexador é um campo aberto com sugestões (CDI, IPCA, SELIC, TR, TJLP, TLP, TFB, TFBD, INPC, IGP-M, PTAX) e aceita a sigla do contrato. A Taxa do indexador a.a. (%) vem do histórico do sistema quando existe (CDI, IPCA…); para os outros (TFB, TFBD do BNDES), é digitada ou lida do PDF. Ela entra na TEF (taxa do indexador + juros fixos).

**Leitura do PDF pela IA e credor:** o indexador vem com a sigla do documento e a taxa, quando informada. A data do contrato também é lida do fecho da cédula. O credor é localizado pelo CNPJ; sem cadastro, é criado como Instituição Financeira com o nome do PDF. O botão Buscar do credor faz o mesmo, com o nome da Receita.

**Produtor e lista de contratos:** o contrato financeiro não tem seletor de fazenda; é do cliente e do produtor tomador (campo Produtor responsável). A lista mostra Instituição Financeira, Nº da Cédula e Descrição em colunas separadas e filtra por produtor.

**IOF e tarifas financiados:** quando o banco soma IOF/tarifas ao valor contratado e deposita só o líquido, informe em Principal → Taxas e custos o IOF financiado (R$) e as Tarifas/seguro financiados (R$) (a leitura por IA preenche esses campos e o valor liberado). Na aba Liberação, data e valor líquido já vêm preenchidos. Em Adicionar, o sistema registra a liberação do líquido e lança o IOF (operação gerencial IOF) e as tarifas (Tarifas bancárias) como despesa, com a captação correspondente, já baixados e conciliados na mesma data. O caixa fica só com o líquido, a dívida no valor contratado e o Saldo a liberar zerado. Se a liberação já existia sem o IOF, use Lançar IOF/tarifas financiados. Excluir a parcela do IOF apaga também o CP dela.

**Liberação em dólar:** a entrada no Contas a Receber fica em R$, pela cotação do contrato. Sem cotação, o sistema pede para informar na aba Principal.

**Liberação direta ao fornecedor:** quando o banco paga o fornecedor (ex.: máquina quitada por FINAME/CCB), em Contratos Financeiros → contrato → aba Liberação, clique "🏦 Liberação direta ao fornecedor (quitar CP)". Escolha a data, a conta (de preferência a conta transitória — não há movimento de caixa) e marque os títulos a pagar em aberto que o banco pagou (busca por fornecedor, descrição ou nº do documento). O valor a quitar vem com o saldo de cada um e pode ser menor (o resto continua em aberto). As máquinas das NFs desses títulos já vêm marcadas para alienação (pode tirar ou acrescentar). Ao confirmar: os títulos ficam Baixados (ou Parciais) com forma de pagamento "Financiamento", já conciliados e com a observação "Quitado pelo financiamento …"; nasce a captação (CR "Liberação direta ao fornecedor", já baixado) e a linha "Direto ao fornecedor (CP quitado)", que conta no total liberado; cada máquina marcada ganha a garantia Alienação Fiduciária (1º grau) na aba Garantias e Status de financiamento "Financiado". As parcelas continuam na aba Pagamento (Calcular → Lançar no CP). O ✕ da linha desfaz tudo. Na DRE a compra continua como investimento e só os juros entram como despesa; no LCDPR a conta transitória vira o código 999.

**Cálculo das parcelas:** segue o sistema de amortização do contrato (Price, SAC, SACRE). Usar cronograma do PDF separa juros e amortização de cada parcela pela taxa implícita do cronograma da cédula, com saldo devedor. Calcular só monta o cronograma.

**Juros pagos:** na aba Pagamento, com Periodicidade trimestral, semestral ou anual aparece o campo "Juros pagos". "Junto com a amortização" é o padrão. Escolha uma frequência menor (ex.: Semestral com periodicidade Anual) quando o banco cobra juros no meio do período: gera uma parcela só de juros e outra de juros + capital. Nesse caso, a Data 1º Pagamento é a da 1ª parcela (a de juros).

**Carência total (capitaliza):** cada período da carência mostra na coluna Juros o juro do período, marcado "+ US$/R$ X capitalizado", sem pagamento (Valor Parcela 0, não gera CP) e somado ao saldo devedor. Nas parcelas de pagamento, a parte que quita esse juro sai da Amortização e entra em Juros ("inclui X capitalizado"). O CP sai com o título de Juros pelo valor real, e DRE, Endividamento e BI mostram o juro real. O campo vira "Data 1º Pagto. (após carência)": informe a data do primeiro pagamento de verdade; a carência é colocada antes dela (ex.: contrato de 24/06/2025, carência de 36 meses anual, 1º pagamento 20/06/2029 → carência 20/06/2026, 2027 e 2028). Contrato já lançado: clique Calcular Parcelas de novo (ou Repartir juros × amortização) e depois Salvar Parcelas e Lançar no CP. Sem a permissão necessária, o cálculo avisa e não mexe no cronograma.

**Editar parcelas:** na aba Pagamento, com Editar parcelas ligado, Valor da Parcela = Amortização + Juros + Encargos. Os dois últimos campos digitados ficam como digitados e o terceiro é recalculado (destacado em azul): amortização + juros → valor; valor + amortização → juros; valor + juros → amortização. Mexendo só em um: amortização ou juros mudam o valor; o valor muda a amortização (mantendo os juros e recalculando o saldo adiante). Se algo ficar negativo, o campo fica vermelho e não salva. Parcela paga fica travada.

**Repartir juros × amortização:** em Pagamento, refaz a divisão das parcelas não pagas, mantendo o valor de cada uma; depois use Salvar Parcelas e Lançar no CP. Parcelas pagas não mudam.

**Lançar no CP:** as parcelas só vão para o Contas a Pagar em Salvar Parcelas e Lançar no CP, que lança todas as parcelas em aberto, inclusive as de vencimento passado (aparecem vencidas e precisam de baixa manual no Contas a Pagar, com a conta e a data reais). Não duplica; parcela com pagamento real (conta, conciliação ou borderô) não é relançada e o sistema avisa; títulos da Liberação (IOF/tarifas financiados) não são apagados. A lista marca os pendentes com "Parcelas não lançadas no CP", e ao sair de um deles o sistema oferece lançar.

**Data de parcela paga:** mudar a data de uma parcela paga e salvar mantém o título pago, sem criar outro. Se o valor também mudar, o sistema não reconhece o pagamento: confira o Contas a Pagar depois de salvar.

**Aditivo de Repactuação:** em Contratos Financeiros → aba Aditivos, o tipo Repactuação adia todo o contrato. Informe data, descrição e Períodos a adiar (1 por padrão). Cada parcela em aberto anda esse número de períodos na periodicidade do contrato (ex.: anual com 1 período = +12 meses). A confirmação mostra quantas parcelas mudam e a nova data da última. O vencimento no Contas a Pagar muda junto, e o vencimento final do contrato vira o da última parcela. Parcelas pagas e títulos pagos, em borderô ou conciliados não mudam. Os valores não são alterados: se o banco recalculou juros, ajuste na aba Pagamento. Os outros tipos (prorrogação, renegociação, capitalização…) só registram o termo.

**Refinanciamento / consolidação (N→1):** na aba Principal da cédula nova, quadro "Esta cédula liquida os contratos" (pode ser preenchido no lançamento). Para cada contrato antigo, escolha no seletor com busca (Instituição | Nº da cédula | Descrição). Duas formas:
- "Passa pela conta": lance a liberação total em Liberação e informe o valor debitado no extrato (sugerido: saldo devedor), a conta debitada (sugerida: conta de pagamento do antigo) e a data. Os títulos são baixados nessa conta e o que sobrar fica disponível.
- "Interna no banco": informe só valor e data da quitação; os títulos são baixados sem conta e essa parte aparece em Liberação como "Liquidação interna (sem caixa)". Se a cédula for maior, o saldo aparece em "Saldo a liberar" e deve ser lançado em Liberação.
Os títulos do antigo são baixados somando exatamente o valor da quitação; juros futuros não cobrados saem como desconto. Título do antigo em borderô não pago bloqueia até o borderô ser confirmado ou estornado. Para desfazer, use Desvincular: estorna as baixas (as conciliadas ou alteradas depois ficam como estão).

**Contrato refinanciado:** fica com status Refinanciado e observação "Liquidado no refinanciamento pela cédula X". Não deixa refazer o cronograma e não entra no Endividamento nem no saldo do BI.

**Seguros / Apólices:** as apólices são do cliente e aparecem para todos os usuários dele e para a equipe Raccolto. Se a lista não carregar, a tela mostra o motivo em vermelho; peça o texto dessa mensagem ao usuário.

**Seguradora e produtor da apólice:** a seguradora é escolhida no cadastro de Pessoas (+ Cadastrar cria uma nova) e é o fornecedor dos títulos do prêmio. Título de seguro sem fornecedor no grid: abra a apólice em Editar, escolha a seguradora e salve. O campo Produtor define produtor e fazenda dos títulos. Em apólice em andamento, parcelas vencidas entram em aberto no Contas a Pagar e o usuário faz a baixa manual.

**Lançar Apólice com IA:** add-on liberado pela Raccolto em Admin → Módulos. Em Financeiro → Complemento Financeiro → Seguros / Apólices, no quadro "Lançar Apólice com IA", envie o PDF; a IA lê nº da apólice, seguradora, corretora e contato, ramo (máquinas, automóvel, rural, patrimonial, vida, responsabilidade civil), bem segurado, importância segurada, prêmio total, vigência e parcelas, e abre o formulário preenchido. Máquina/veículo é vinculado pelo chassi, placa ou nº de série; seguro rural, à fazenda pelo local do risco; vida, ao produtor pelo CPF. Franquia, coberturas e segurado ficam na observação. Confira e clique em Salvar: as parcelas viram Contas a Pagar com a operação gerencial do ramo. O PDF não é anexado sozinho: depois de salvar, anexe na aba Anexo.

**Parcelas 100 vezes maiores:** em Contratos Financeiros → aba Pagamento, contrato com parcelas editadas (Editar parcelas) até 21/10/2026 pode estar com valores 100 vezes maiores. Confira e corrija, depois use Salvar Parcelas e Lançar no CP.

**Refinanciamento ("Esta cédula liquida os contratos"):** os títulos a pagar do contrato antigo são baixados somando exatamente o valor da quitação. São pagas as amortizações e os juros vencidos; a diferença paga os juros do período; os juros futuros não cobrados saem como desconto. O valor debitado sugerido é o saldo devedor do contrato antigo: amortizações a pagar, o que falta das parcelas parciais e os juros vencidos.

### Folha de pagamento
**Uma folha por empregador:** ao gerar a folha de um mês, o sistema cria uma folha para cada fazenda + empregador (empresa/CNPJ ou produtor/CPF) dos funcionários, cada um com seus encargos (FGTS, INSS patronal) e títulos no Contas a Pagar. Ex.: funcionários de duas empresas na mesma fazenda geram duas folhas. Se um funcionário caiu na folha errada, corrija o Empregador no cadastro dele.

**Lista de folhas por mês:** uma linha por mês. Se o mês tem mais de um empregador, Abrir mostra cada um, e é lá que se edita; Fechar Folha e Excluir na linha do mês valem para todos. Salários saem um título por funcionário; FGTS e INSS Patronal, separados por empregador. A lista mostra "Fechado · X de Y pagos" e vira "Pago" quando todos os salários estão baixados.

**Data de pagamento:** ao gerar ou editar uma folha há o campo Data de pagamento (vencimento). A sugestão é o mesmo dia da última folha (ou dia 5) no mês seguinte à competência. Ao fechar, o CP de salário de cada funcionário nasce com essa data. Gerando vários meses de uma vez, a data vale para o primeiro mês e os demais repetem o dia no mês seguinte de cada competência (dia 31 em mês curto vira o último dia). Depois de fechada, a data não é editada na folha: ajuste o vencimento no Contas a Pagar.

**Pgto. previsto:** coluna da grade de lançamento. Em folha fechada mostra o vencimento real do CP de salário de cada funcionário; em rascunho, o dia 05 do mês seguinte à competência (competência 07/2026 → pagamento 05/08/2026). FGTS e INSS patronal vencem dia 20 do mês seguinte.

**Salário líquido e complemento:** a coluna Complemento é valor pago por fora, sem INSS/IRRF/FGTS. O Sal. Líquido é exatamente o que vai para o Contas a Pagar: bruto − INSS − IRRF − outros descontos − adiantamentos + benefícios + complemento. Ao reabrir uma folha em rascunho, salário base, complemento e benefícios são atualizados pelo cadastro; gratificação e outros descontos são mantidos.

**Horas extras:** a coluna Horas Extras tem horas 50% (dias normais) e horas 100% (domingos e feriados) do mês. Valor da hora = salário base da carteira ÷ 220 h; HE 50% = horas × valor da hora × 1,5; HE 100% = horas × valor da hora × 2; DSR = total das HE ÷ dias úteis do mês × (domingos + feriados nacionais do mês). Valor e DSR aparecem embaixo dos campos, entram no Bruto (sofrem INSS, IRRF, FGTS e INSS patronal) e no título do salário no CP. O complemento não entra na base da hora. Funciona no rascunho e na folha fechada (com ⟳ Reprocessar Folha, nos salários não pagos). Feriado municipal não entra no DSR automático. A média de horas extras no 13º é ajustada à mão na base do 13º.

**Observação dos outros descontos:** na grade (do produtor e da Empresa), embaixo de Outros Desc., há o campo Observação (ex.: farmácia, dias não trabalhados, empréstimo). Com desconto e observação vazia, fica destacado em amarelo, mas não é obrigatório. Ao lançar a folha, o título do salário no CP recebe na Observação "Outros descontos R$ X: texto".

**Encargos no cadastro do funcionário:** os percentuais de Encargos trabalhistas (FGTS, INSS Empregador, SAT/RAT, Sistema S, provisões) aceitam zero, e o zero é respeitado. FGTS = % de FGTS sobre o bruto; INSS patronal (só Empresa/PJ) = INSS Empregador + SAT/RAT + Sistema S sobre o bruto. Produtor rural PF não gera INSS Patronal (usa Funrural à parte). Zerados, a folha não cria CP de FGTS/INSS patronal; os lançamentos são manuais. Se FGTS, INSS Empregador, SAT/RAT e Sistema S estiverem TODOS zerados, a folha também não desconta INSS nem IRRF do trabalhador e o CP de salário sai pelo valor cheio (base + gratificação + complemento + benefícios − adiantamentos − outros descontos). Com qualquer percentual preenchido, INSS e IRRF são calculados pela tabela. Rascunho recalcula com o cadastro atual ao reabrir; folha fechada não muda. Sem percentual salvo, usa o padrão (FGTS 8% e INSS patronal 28%).

**Adiantamento de salário:** lançado só na aba Adiantamentos (a grade não tem coluna de Adiantamento). É obrigatório escolher a conta bancária de onde saiu o dinheiro. O CP nasce na hora, ligado ao empregador do funcionário, já baixado nessa conta na data do adiantamento, entrando no fluxo de caixa. Se a baixa automática falhar, o CP fica em aberto e a tela avisa. É por competência (mês/ano) e pode ser retroativo. O desconto é a soma dos adiantamentos pendentes da competência da folha ou sem competência; o Sal. Líquido mostra já desconta adiant. Valor digitado ou copiado de outra folha não é considerado; adiantamento de outra competência não é descontado. Ao fechar, todo adiantamento pendente (da competência ou sem competência), inclusive lançado depois de salvar a folha, é descontado e passa para Descontado.

**Corrigir adiantamento descontado:** em Folha → Adiantamentos, o botão Corrigir aparece para quem tem a rotina Reprocessar Folha. Informe os dados certos e o motivo e confira a prévia. Salário pago não é alterado: a diferença vira título a pagar ou desconto em outra competência. Se o CP do adiantamento estiver baixado, estorne a baixa no Contas a Pagar, corrija e baixe de novo.

**Adiantamento de gratificação:** em Financeiro, Folha de Pagamento, aba Adiantamentos, Tipo de adiantamento = Gratificação. Informe a competência em que a gratificação será paga: o valor é descontado na folha desse mês. A gratificação precisa estar lançada antes, na mesma competência, na aba Gratificações (ou no cadastro do funcionário, aba Premiações, quando não houver na folha). A soma dos adiantamentos de gratificação não pode passar do valor lançado; o excedente não é tratado pelo sistema e deve ser lançado manualmente como empréstimo a terceiros. A tela mostra gratificação lançada, já adiantado e disponível.

**Extrato de gratificação:** na aba Gratificações, o Extrato de adiantamentos de gratificação mostra por funcionário e competência a gratificação, cada adiantamento (data, descrição, valor, se já descontado) com saldo após cada um e o saldo a pagar; filtro por funcionário e total no fim.

**Previsões da folha em rascunho:** ao salvar, o sistema lança no CP e no fluxo de caixa uma PREVISÃO por funcionário (líquido), mais FGTS e, para empresa, INSS Patronal, com o vencimento da folha. As previsões são refeitas ao salvar, replicar ou reabrir a folha e ao lançar, editar ou cancelar adiantamento; edição feita direto no CP é perdida nesse caso. Abrir a lista não refaz nada: linha sem previsão só ganha título ao salvar. Se outra operação estiver atualizando a folha e demorar, o sistema avisa para tentar de novo. Previsões repetidas sem ligação com a folha: não some como salário a pagar e encaminhe à equipe Raccolto.

**Fechar Folha:** cada previsão vira título real: vale o valor editado no CP, se houver; senão, o líquido recalculado (com adiantamentos pendentes). Título já efetivado fica como está. O fechamento verifica duplicidade por competência/funcionário antes de gerar os CPs (salário líquido, FGTS e, se Empresa/PJ, INSS Patronal).

**Títulos de salário no Contas a Pagar:** nascem com o funcionário, o produtor ou empresa dele e o Ano Safra da data de vencimento, com Lançado via Folha de Pagamento. A coluna Fornecedor mostra o nome do funcionário quando não há fornecedor cadastrado. Título sem Ano Safra ou Produtor abre na edição com o Ano Safra do vencimento e o produtor do funcionário. Funcionário sem Produtor ou Empresa no cadastro (coluna Produtor / Empresa da lista de Funcionários) gera título sem vínculo: preencha no cadastro.

**Situação do pagamento na folha:** na folha fechada, a coluna Pgto. / CP mostra por funcionário: Pago (com data da baixa), Parcial (quanto falta), Aberto no CP ou Previsão. Acima da grade, o resumo: salários pagos, total pago e total em aberto. Excluir o título no CP deixa a linha sem título; reprocessar cria um novo. Se salário pago não aparecer como pago, encaminhe à equipe Raccolto com competência e funcionário.

**Folha fechada — Reprocessar Folha:** ajustes (adiantamento esquecido, gratificação, outros descontos, funcionário incluído ou retirado) são feitos pelo botão ⟳ Reprocessar Folha. Ele mostra uma prévia e, ao confirmar, altera no CP só os títulos cujo valor mudou (com observação de quem, quando e valor antes → depois), cria título para funcionário incluído e encargo que faltava e cancela o título de quem saiu se ainda em aberto. Adiantamentos pendentes da competência (ou sem competência), inclusive posteriores ao fechamento, são descontados e passam a Descontado. Título já pago (baixado, parcial, em borderô ou conciliado) nunca é alterado: se o valor novo for maior, a prévia avisa para reabrir (estornar) o título no CP e reprocessar; se for menor, ou o funcionário saiu com salário pago, a diferença vira Desconto de devolução, com valor e competência escolhidos pelo operador, descontado na folha daquela competência (aparece na aba Adiantamentos). Fica no histórico da folha e no Monitor de Auditoria.

**Linhas da folha fechada:** linha com salário já pago (pago, parcial, em borderô ou conciliado) fica cinza e travada: não dá para mudar gratificação nem outros descontos, nem tirar da folha. Nos salários em aberto, gratificação, outros descontos e observação ficam editáveis, e o Reprocessar Folha atualiza o título no CP. Se salário, complemento ou benefícios mudaram no cadastro após o fechamento, as linhas não pagas já vêm com o valor novo (um aviso lista quem mudou); clique em ⟳ Reprocessar Folha para gravar no CP.

**Permissão de reprocessar:** Configurações → Usuários e Permissões → Folha de Pagamento → Reprocessar. Grupo sem a Folha configurada pode reprocessar; grupo configurado sem Reprocessar vê a folha fechada travada.

**Reabrir:** ↩ Reabrir (refazer do zero) é opção secundária: volta a folha para rascunho, apaga os títulos reais e relança como previsão.

**Excluir folha:** botão Excluir na lista (e dentro da folha) apaga a folha, os funcionários e, em cascata, os títulos do CP (previsões ou reais). Se algum título foi baixado em borderô, a exclusão é bloqueada até estornar o borderô. Adiantamentos Descontado voltam a Pendente.

**Exportar XLSX:** com a folha aberta, botão ⬇ Exportar XLSX (ao lado das sub-abas Funcionários/Resumo). Planilha formatada com uma linha por funcionário: Empregador, Funcionário, Cargo, Salário Base, Gratificação, horas extras (50%/100%, valor e DSR), Bruto, INSS, IRRF, Adiantamentos, Outros Descontos e Motivo dos Descontos, Total Descontos, Complemento, Vale Transporte, Vale Refeição, Outros Benefícios, Salário Líquido, INSS Patronal, FGTS, data de pagamento e Situação no CP (Pago com data, Parcial com quanto falta, Aberto no CP, Previsão ou Rascunho quando ainda não gerou CP), mais linha de TOTAL. O arquivo leva mês, empregador e nome do cliente.

**Férias:** em Cadastros, Funcionários, Editar, aba Férias, + Lançar férias abre a concessão no período mais antigo em aberto; sem nenhum período (ex.: sem data de admissão), cria um período avulso e abre mesmo assim. O botão Conceder aparece em qualquer período não concedido ou gozado (inclusive em formação, o que equivale a antecipar férias). A concessão calcula férias + 1/3 e abono e lança o CP com o Ano Safra do vencimento e o produtor ou empresa do funcionário; depois dá para Marcar gozada ou Cancelar a concessão (apaga o CP em aberto).

**Férias, rescisão e premiação:** têm fluxos próprios com cálculo específico; o valor deve ser conferido pelo responsável trabalhista/contábil antes de ser considerado definitivo.

**Observação dos outros descontos:** aparece na linha expandida do funcionário na grade da folha. O título do salário no Contas a Pagar recebe na Observação "Outros descontos R$ X: texto" na previsão do rascunho, no Fechar Folha e no ⟳ Reprocessar Folha.

**Previsões repetidas antigas:** criadas antes de 04/11/2026, podem existir no Contas a Pagar como títulos sem ligação com a folha. Não some esses valores como salário a pagar e encaminhe à equipe Raccolto.

### Cadastros: pessoas, produtores, fazendas, empresas
**Cadastro de pessoa incompleto:** cadastro criado por importação, SIEG ou telas secundárias é completado sozinho em até 15 minutos, com código IBGE e, para CNPJ, dados da Receita. Só preenche campo vazio. CPF sem CEP nem cidade continua precisando de digitação. Em Cadastros → Pessoas e Entidades, o botão Buscar segue disponível para um cadastro específico.

**Sem fazenda ativa:** o sistema não guarda "fazenda ativa" por usuário; o ativo é o cliente. A fazenda não é perguntada nos lançamentos, vem do que o usuário escolhe:
- **Produtor:** contratos, consórcios, CP/CR do produtor, NF de entrada.
- **Empresa:** CP/CR e folha de empresa.
- **Funcionário:** adiantamento/gratificação; férias usam a fazenda do funcionário.
- **Conta bancária:** extrato da conciliação, tesouraria.

No LCDPR, o título vai para o livro PF ou PJ conforme a fazenda do produtor/empresa.

**Fazenda física da operação:**
- **NF de entrada:** o estoque entra na fazenda do DEPÓSITO de cada item; a fazenda fiscal segue a IE do produtor e pode ser outra.
- **Recomendação agronômica e algodão** (operações, armadilhas, módulos, beneficiamento): fazenda do ciclo escolhido.
- **Transferência de máquina:** fazenda onde a máquina está cadastrada.
- **Pesagem avulsa:** seletor "Fazenda da balança".

**Dados de todas as fazendas:** cadastros, listas e lançamentos do cliente valem e aparecem em todas as fazendas. Os parâmetros Fiscal, CT-e, MDF-e, LCDPR, Contabilidade e Automações são do cliente.

**Operações gerenciais por cliente:** cada cliente tem sua cópia. Editar uma OG em Configurações → Operações Gerenciais vale só para aquele cliente e substitui por completo o modelo padrão de mesmo código. As listas (NF, CP/CR, tesouraria, estoque) mostram a versão do cliente; se ela não estiver habilitada para a tela, não aparece ali (o padrão não entra no lugar).

**Funções do funcionário:** em Cadastros → Funcionários, a aba Funções guarda as funções do cliente. A função de contratação vem dessa lista e é a usada na folha e no eSocial. Funções secundárias são internas e não entram na folha. Função em uso não pode ser excluída.

**Motorista vindo do funcionário:** quem tem função marcada "Esta função dirige caminhão" (principal ou secundária) aparece em Transporte → Motoristas com a etiqueta "Pré-cadastro · falta CNH" até a CNH ser preenchida lá. Não é autônomo, então não pede CIOT. Se o funcionário for desligado ou perder a função, o motorista fica inativo.

### Lavoura: planejamento, ciclos e operações
**Nova Recomendação Agronômica:** escolha o Tipo de Operação no topo e avance com Próximo pelas abas Geral, Talhões, Produtos e Condições. O botão Salvar Recomendação fica na aba Condições. Ao editar uma recomendação existente, o botão de salvar aparece em todas as abas.

**Ciclos por cliente ou por fazenda:** cada ciclo pertence a uma fazenda. Comercialização de Grãos, Contas a Pagar e a Receber, NF de Produtos, Previsão de Gastos, Apoio e Estoque de Grãos listam os ciclos de todas as fazendas do cliente, com a fazenda no nome. Plantio, pulverização, colheita, adubação e demais operações de lavoura listam os ciclos por fazenda.

**Custo do ciclo:** o custo conta para o ciclo escolhido, mesmo lançado em outra fazenda. No DRE filtrado por fazenda, ele aparece na fazenda do ciclo.

**Ciclo ativo:** é o que tem a data de hoje entre o início e o fim dele.

**Ciclos no Painel, Pragas e Hedge:** a busca do Painel procura pela descrição do ciclo. Pragas e Doenças e Hedge listam os ciclos com a safra. O Hedge usa a área plantada do ciclo.

### Contratos de grãos, arrendamento e compra de terra
**Aditivo de contrato de venda:** abra o contrato em Comercial & Logística → Contratos de Grãos e use a aba Aditivos. Cada aditivo muda uma coisa só: quantidade, preço, prazo de entrega, pagamento, local de entrega, comprador ou outros, com PDF opcional. Depois que o contrato confirmado tem romaneio ou NF, quantidade, preço e comprador só mudam por aditivo. Preço novo vale para o saldo ainda sem NF; NF já emitida não muda, e correção nela é por NF complementar. A quantidade não pode ficar abaixo do já entregue ou faturado. O título a receber acompanha, salvo se já tiver recebimento, borderô ou conciliação: nesse caso o ajuste é em Contas a Receber. Volume e preço juntos não são aditivo: use Novo contrato pelo saldo, que cria um contrato novo ligado ao original, e o original fica só com o que já foi entregue ou faturado. O mesmo vale para trocar o comprador depois da entrega. Fixação de preço não é aditivo.

**Baixa de parcela em reais:** Em Contratos de Arrendamento, o botão ✓ Baixar de uma parcela em reais abre a janela Baixar pagamento do arrendamento, com data, valor pago e conta bancária (obrigatória). O sistema cria o título no Contas a Pagar, se a parcela ainda não tiver, e baixa o título nessa conta: ele aparece no Contas a Pagar como pago, entra no fluxo de caixa realizado e na conciliação.

**Fornecedor e produtor do título:** O título tem o proprietário como fornecedor e o produtor do contrato. Se o arrendamento não tiver produtor preenchido, o título fica sem produtor: preencha o produtor no contrato de arrendamento.

**Parcelas em sacas:** A baixa é feita por sacas entregues.

### Relatórios financeiros e fluxo de caixa
**Financeiro por Classificação:** há dois tipos. Analítico: lançamentos separados por OG (operação gerencial), em detalhe, com subtotal. Sintético: uma linha por OG com a soma do período (quantidade de lançamentos, entradas, saídas e saldo). PDF e Excel seguem o tipo escolhido. As OGs saem ordenadas pelo código da classificação, com código e nome. Títulos sem OG ficam em grupos "Sem OG — categoria", sempre por último.

**CP / CR — produtor e empresas:** os relatórios CP / CR e Gastos por Classificação somam produtor e empresas; o filtro Empresa vale para os dois. O DRE é tratado à parte.

**CP / CR — gerar o relatório:** em Financeiro → Relatórios → CP / CR, clique em Abrir filtro e gerar e escolha:
- vencimento (de/até; vazio traz tudo);
- tipo (CR, CP ou todos);
- Status, Categoria, Produtor e Conta bancária: seleção múltipla com pesquisa (nenhum marcado = todos); Conta bancária lista as contas de todas as fazendas da conta;
- parte do nome do fornecedor;
- Fornecedor / Cliente do cadastro: pesquisa por nome ou CNPJ/CPF em Pessoas, com marcação de vários (só entram títulos vinculados ao cadastro);
- emissão: PDF abre em tela para imprimir; XLSX baixa o arquivo.

O relatório sai direto, sem abrir a tela com todos os registros. Se nada atender ao filtro, o sistema avisa. A consulta ao vivo (grid com filtros, colunas e agrupamentos) fica no link Consultar em tela.

**CP / CR — período por:** Vencimento (padrão) ou Data da baixa, que só traz o que tem baixa no período. Se uma conta paga não aparece, ela pode vencer em outra data: escolha Data da baixa.

**CP / CR — colunas do relatório:** em Abrir filtro e gerar, seção Colunas do relatório, marque as colunas e ordene com ↑ ↓. Vale para PDF e XLSX e fica salvo por usuário (tela ao vivo e grid têm colunas próprias). Disponíveis: Tipo, Fornecedor, Nº NF, Emissão, Vencimento, Valor, Status, Data Pgto, Valor Pago, Moeda, Forma Pgto, Op. Gerencial, Produtor, Observação, Categoria, Saldo em aberto, Dias para vencer (negativo = atraso), Venc. original e Conta bancária. A caixa Mostrar a conta bancária (de pagamento) no relatório liga a coluna Conta bancária.

**CP / CR — agrupamento:** em Agrupamento, marque os níveis (Produtor/Empresa, Operação gerencial, Mês de vencimento, Categoria, Tipo, Status, Fornecedor/Cliente, Conta bancária) e ordene com ↑ ↓; o 1º é o principal. PDF e Excel saem com cabeçalho e subtotal por grupo e Total geral (somando Valor, Valor pago e Saldo quando essas colunas estão no relatório; CP entra negativo). Sem nível marcado, a lista sai simples, ordenada por vencimento.

**CP / CR — Imprimir / PDF:** gera relatório próprio (resumo dos filtros, totais de CR, CP, vencidos e baixados, e tabela com as colunas visíveis), sem filtros e botões da tela. O cabeçalho informa o escopo: Todas as fazendas da conta (soma todas, não só a ativa no topo) ou os produtores marcados no filtro Produtor. Agrupamentos da tela não são impressos; a lista sai plana.

**CP / CR — XLSX:** Emissão, Vencimento e Data de Pagamento saem como data (dd/mm/aaaa), não texto: filtram, ordenam e entram em fórmulas e tabelas dinâmicas.

**Impressão de DFC e Posição por Conta:** Imprimir / PDF gera relatório próprio, sem filtros e botões da tela. DFC: categorias por mês do exercício (realizados ou realizados + previstos, conforme a chave da tela), resultado do mês e saldo acumulado. Posição por Conta: saldos atual e projetado por conta e totais. O cabeçalho informa o escopo (todas as fazendas da conta).

**Fluxo de Caixa — Considerar atrasados?:** no Fluxo de Caixa diário, o resumo dos CP e CR vencidos e não baixados antes da data inicial fica à direita da linha de filtros, junto da caixa Considerar atrasados?. Desligada (padrão), o saldo inicial é só a soma dos saldos das contas. Ligada, é saldos das contas + CR atrasados − CP atrasados; o acumulado parte desse valor e o PDF explica a composição. Os atrasados respeitam os filtros de Produtores/Contas e de Moeda e não aparecem no tipo Realizado. Mensal e Anual não têm essa opção.

**Fluxo de Caixa — previsões:** previsões em aberto, inclusive as criadas no Contas a Pagar e as da folha, entram nas saídas e no saldo do Fluxo de Caixa Previsto; no Realizado, não. O botão "Previsões" liga e desliga no fluxo diário. A tela mostra quantas previsões e o valor no período; o dia com previsão tem a marca "prev" e, ao abri-lo, a linha aparece como "Previsão" (ou "Previsão · Folha", "Previsão · Recorrente"). No mensal e anual, o valor fica somado na categoria e o subtítulo informa quanto é previsão. Previsão vencida antes do início do período não entra no saldo, nem com "Considerar atrasados" ligado: um aviso mostra quantas são e o valor, com link para Previsão de Gastos → Previsões Vencidas ou Contas a Pagar, onde o gestor dá nova data ou efetiva.

**Fluxo de Caixa — cores:** no fluxo diário, na tela e no PDF, pedido de compra aparece em azul, previsão em verde e o restante em preto. Saldo negativo continua em vermelho. O Excel não tem cores.

**Contas a Pagar — pedidos de compra:** o atalho Pedidos de compra mostra os títulos de pedido em qualquer data, sem os cancelados. Sem esse atalho, vale o período padrão da tela, de hoje até 60 dias. Título de pedido traz a marca Pedido de Compra na descrição.

**Pedido de Compra — controle de valor:** ao abrir NFs Vinculadas ou Entregas do pedido, o painel Controle de Valor mostra valor do pedido, valor entregue, saldo a entregar e percentual. Pedido com NF soma as NFs processadas; pedido sem NF soma as entregas registradas. Pedido em dólar converte cada NF pela PTAX do dia da emissão. Quantidade cancelada ao encerrar sai do saldo.

**Adiantamento a fornecedor — pedido de compra:** em Financeiro, Adiantamentos a Fornecedores, o campo Pedido de Compra é opcional. Escolher o pedido preenche o fornecedor. O adiantamento já lançado pode ser ligado ao abrir os detalhes dele. O valor aparece como Adiantado no Controle de Valor do pedido. O adiantamento reduz o título do pedido no Contas a Pagar e no Fluxo de Caixa, só pelo crédito ainda não aplicado. Ao aplicar o crédito em uma NF, o título do pedido volta a subir, porque o pagamento dessa NF já usou o adiantamento. O motivo da redução aparece abaixo da descrição do título e no Controle de Valor. Desligar o pedido ou cancelar o adiantamento refaz o cálculo.

**Insumos — unidade bag:** a unidade bag está disponível no Catálogo de Insumos, em qualquer categoria, e no cadastro rápido do pedido de compra, da NF e do estoque.

**Fluxo de Caixa — Excel:** em Financeiro → Relatórios Financeiros → Fluxo de Caixa, o botão ⬇ Excel, ao lado de Imprimir / PDF, exporta a visão aberta com os filtros da tela.
- Diário: aba Resumo (escopo, período, tipo, saldo inicial com a composição quando Considerar atrasados? está ligado, totais e saldo final) e aba Fluxo Diário com uma linha por lançamento (data, fornecedor/pagador, descrição, origem, situação, entrada, saída e saldo acumulado), do saldo inicial aos totais.
- Mensal e Anual: aba Resumo e aba com categorias nas linhas e meses (ou anos) nas colunas, separando Entradas e Saídas, com Total Entradas, Total Saídas, Saldo do mês/ano e Saldo Acumulado.

Valores saem como número (somáveis), negativos em vermelho.

**Manutenção de Veículos e Máquinas:** não tem seletor de fazenda. Mostra a frota de todas as fazendas do cliente (a fazenda de cada máquina aparece ao lado do tipo quando há mais de uma) e os ciclos do filtro Por Safra/Ciclo de todas as fazendas. O título do PDF e do Excel usa o nome do cliente.

**Capacidade de Pagamento:** aba do BI exclusiva da equipe Raccolto. Se o cliente perguntar, explique que é uma análise da consultoria. É visão de caixa, não gerencial: todos os compromissos que vencem no período, inclusive o principal do custeio, são comparados com o caixa operacional projetado (receita menos custo).

**Excel do Fluxo de Caixa diário:** na aba Fluxo Diário, a coluna de data sai como data do Excel, e não como texto.

### DRE, custos e resultados
**Geração da DRE:** a DRE pode ser gerada consolidada por ano safra ou por ciclo.

**Itens que geram estoque:** insumos, peças e combustível de bomba NÃO entram pelo Contas a Pagar; entram pelo consumo (plantio, adubação, pulverização, correção de solo, abastecimento, manutenção). O custo é gravado no momento do consumo e não muda se a DRE for reemitida depois.

**Apropriação direta:** administrativo, serviços, mecanização terceirizada, assessoria, análises, despesas financeiras e outras entram pelo Contas a Pagar, pela classificação (operação gerencial), no ano safra indicado no título. Sem ano safra indicado, vale o vencimento. Em NF com itens dos dois tipos, só a parte de apropriação direta entra.

**Mão de obra:** vem da folha fechada da competência: bruto, complemento salarial e encargos patronais (FGTS e INSS patronal). Adiantamentos e CP de salário não somam de novo. O ano safra da folha é gravado pelo sistema a partir da competência.

**Arrendamento:** vem dos contratos pagos. Em sacas, vale sacas pagas × preço médio ponderado de venda do produto no ano safra; sem venda, vale o preço de referência do pagamento.

**Manutenção e combustível:** manutenção vem do histórico de manutenção das máquinas; combustível, dos abastecimentos.

**Custos sem ciclo:** custos sem ciclo apontado aparecem na coluna Sem ciclo (aguarda rateio) enquanto a regra de rateio entre ciclos não é definida. No consolidado por ano safra, eles somam normalmente.

**Fora do resultado:** compra de insumo, imobilizado (CAPEX) e títulos sem classificação reconhecida não entram na DRE.

### Parâmetros fiscais, CFOP e rejeições SEFAZ
**Onde ficam os CFOPs:** na tela de Nota de Venda/Remessa (Documentos Fiscais) e no Faturamento, o campo CFOP traz os grupos Remessas e Devoluções. A devolução feita a partir de uma NF de entrada (botão Devolver) também oferece os CFOPs de devolução por item.

**Remessa simbólica para armazenagem (5.934/6.934):** usada para a remessa simbólica de mercadoria depositada em armazém. Fica no grupo Remessas e sai com ICMS CST 41.

**Outra saída não especificada (5.949/6.949):** no grupo Remessas, como Outra Saída de Mercadoria Não Especificada (5.949 interna, 6.949 interestadual). Usada quando a saída não é venda e não tem CFOP próprio. Sai com ICMS não tributado (CST 41) e o texto legal correspondente.

**Devolução de compra de uso ou consumo (5.556/6.556):** fica no grupo Devoluções e sai com ICMS CST 20, que exige redução da base de cálculo. Ao escolher esse CFOP, na emissão ou no item da janela Devolver, aparecem os campos Redução da base (%), obrigatório, e Alíquota ICMS (%), que assume 17% na operação interna ou 12% na interestadual quando fica vazio.

**Modelos de operação:** os modelos Remessa Simbólica para Armazenagem e Devolução de Compra, Uso/Consumo ficam em Configurações, Operações Fiscais.

**Emitente fiscal:** CPF/CNPJ, nome e endereço do emitente vêm do cadastro do produtor ou da empresa. Em Configurações → Sistema → Parâmetros Fiscais (NF-e) → aba Fiscal ficam certificado, série, numeração e tributação; os campos que vêm do cadastro aparecem travados. Para corrigir nome ou endereço na nota, altere em Cadastros. O endereço da IE escolhida tem prioridade sobre o endereço geral do cadastro. Se a nota disser que o titular não está cadastrado, cadastre-o em Produtores ou Empresas. Se a nota pedir para escolher o emitente, é porque o cliente tem mais de um.

**Série por IE:** a série e a numeração de cada IE ficam em Configurações → Sistema → Parâmetros Fiscais (NF-e) → aba Fiscal, no cartão do produtor dono da IE. Um mesmo CPF pode ter mais de um cartão (por exemplo, "FULANO" e "FULANO E OUTROS"), e cada IE aparece só no cartão do seu produtor. Se a série está configurada e o erro continua, confira se foi salva no cartão certo.

### Usuários, acesso e login
**Telas de configuração:** Parâmetros Fiscais, Operações Fiscais, Operações Gerenciais, Plano de Contas, Regras de Rateio, Classificação Automática, Taxas de Referência e Contabilidade só aparecem para o usuário cujo grupo tem a permissão marcada, em Configurações → Usuários e Permissões. Não depende do plano. Usuário sem grupo não vê essas telas. A equipe Raccolto vê tudo.

**Usuários e grupos de permissão:** usuários e grupos de permissão são do cliente e valem para todas as fazendas. O botão de acesso da equipe Raccolto (Configurações → Usuários e Permissões) liga/desliga o acesso em todas as fazendas de uma vez.

**Acesso aos dados:** cada usuário só vê os dados do próprio cliente. Se uma tela ficar vazia para quem via os dados, ou aparecer "Acesso negado" em tela usada normalmente, encaminhe à equipe Raccolto informando a tela e o usuário.

**Cobrança da mensalidade:** gerar cobrança exige estar logado no cliente. O valor é o da assinatura; só a equipe Raccolto informa outro valor.

**Monitor de Auditoria – como ler:** em Configurações → Usuários → Auditoria. Cada linha é uma ação (Quem · O que aconteceu · Onde). Selo amarelo Ação do usuário: o que a pessoa fez; azul Automático: o que o sistema fez como consequência (título gerado pela NF, pedido marcado como entregue, título do pedido cancelado, vínculos gravados). As consequências aparecem embaixo da ação (↳ e mais N consequências), com detalhe ao abrir a linha. Valor alterado aparece riscado com o novo ao lado.

**Quem fez a ação:** ações do servidor a pedido de um usuário (processar NF, fechar folha, baixar, conciliar, aprovar pedido) registram o nome dele. Ocultar Sistema esconde só o que o sistema fez sozinho (rotinas automáticas, como os crons noturnos).

**Filtros e carregamento:** De/Até, Tabela e Ação recarregam a lista na hora; Busca procura no que já foi carregado. Ao escolher uma Tabela, surgem filtros próprios: CP/CR (fornecedor/cliente, descrição, documento, valor de/até), Contratos de Grãos (nº, comprador, produto, quantidade), Pedidos de Compra (nº, fornecedor, valor), além de Contratos Financeiros, Folha e Romaneios. Carrega até 500 eventos por vez (Carregar mais traz os próximos).

**Cancelamentos:** a ação Cancelamento mostra quem cancelou títulos do CP/CR, contratos e pedidos, com selo roxo Cancelado. Títulos de Pedido de Compra são cancelados automaticamente quando as NFs vinculadas cobrem o pedido; aí aparece quem processou a NF, e a observação diz Saldo do pedido zerado pelas NFs vinculadas.

**NFs de entrada e de serviço:** registra lançamento, importação pelo SIEG, processamento, estorno, cancelamento e exclusão. Ao processar, a linha principal é Processou a NF …, com as consequências embaixo (títulos gerados, pedido recalculado, título do pedido encerrado).

**Auditoria, ações do servidor:** antes de 21/10/2026, ações feitas pelo servidor a pedido do usuário (processar NF, fechar folha, baixar, conciliar, aprovar pedido) aparecem como Sistema, sem o nome. Só a partir dessa data o nome de quem pediu é registrado.

**Auditoria, tabela escolhida:** além dos filtros próprios, aparecem colunas próprias dela na lista (em CP/CR: fornecedor/cliente, descrição, documento e valor).

### Interface, menus e suporte
**Tela diferente do esperado ou erro de banco:** se uma tela aparece diferente do esperado ou com erro de banco (por exemplo, uma versão antiga do Contas a Pagar com a mensagem "Could not find a relationship between pagamento_lote_itens and lancamentos"), a aba do navegador provavelmente está com uma versão antiga do sistema. Recarregue a página com Ctrl+Shift+R (no Mac, Cmd+Shift+R). O sistema confere a versão quando você volta para a aba e, se houver versão nova, recarrega sozinho ao trocar de tela.

**Chat da Olívia:** ao enviar uma mensagem pelo balão da Olívia, a conversa é criada na hora do envio. Se algo falhar, a Olívia mostra o motivo no próprio chat.

**Suporte Remoto:** em Ajuda → Suporte Remoto você baixa o RustDesk, programa de acesso remoto que usa o servidor próprio da Arato (suporte.arato.agr.br).
- Windows: o botão Baixar suporte remoto entrega o arquivo já configurado. O nome longo começando por rustdesk-host= é o que liga ao servidor; não renomeie. Basta abrir e passar ao atendente o ID e a senha que aparecem.
- Mac: escolha o botão do seu tipo de Mac (chip Apple ou Intel), instale, autorize Gravação de Tela e Acessibilidade, clique em Copiar configuração no Arato e, nas configurações do RustDesk, vá em Rede → Desbloquear → ícone Importar configuração do servidor. O rodapé deve mostrar Pronto.
- O acesso só ocorre com o ID e a senha informados por você, e você pode desconectar a qualquer momento.

**Janelas (popups):** janelas (modais) não fecham ao clicar no fundo escurecido; fecham só pelos botões da própria janela (Cancelar, Fechar, Salvar). Menus de contexto e listas suspensas fecham ao clicar fora.

**Fazendas:** não existe "fazenda ativa" nem "fazenda padrão" do usuário. O ativo é o cliente: as telas buscam em todas as fazendas dele e cada registro vai para a fazenda do que foi escolhido. Não é preciso trocar de fazenda: a lista já mostra todas, e nos lançamentos a fazenda vem do produtor/empresa/conta/IE/depósito escolhido. Relatórios mostram o nome do cliente.

**Painel Mercado:** o dólar spot vem de cotação ao vivo, com fontes de reserva. A PTAX é a última publicada pelo Banco Central (a do dia sai por volta das 13h; fim de semana e feriado mantêm a anterior). "dados aprox." significa que o spot não veio da fonte ao vivo: é a PTAX ou a última cotação guardada.

### Outros
**Verificações de Dados (BI, aba Auditoria):** a aba Auditoria do BI, em Verificações de Dados, olha todas as fazendas do cliente e verifica:
- romaneios de venda sem NF há mais de 3 dias;
- romaneios de entrada parados na pesagem (sem tara) há mais de 3 dias;
- NF processada com unidade diferente do cadastro e sem fator de conversão;
- estoque negativo;
- saídas manuais de estoque sem safra/ciclo (ficam fora do DRE);
- contratos financeiros ativos sem título no CP.

Cada card mostra a quantidade, os itens e onde corrigir. Se uma verificação falhar, o card mostra "não verificado" com o motivo, nunca ✓.

**Cadastros duplicados:** ficam em Comercial & Logística → Relatórios → Posição de Insumos → aba Possíveis Duplicados.

### NFS-e (nota de serviço): como lançar
Quando perguntarem como lançar uma NFS-e, pergunte primeiro se a nota já apareceu no painel, porque o caminho muda. Sempre explique os dois casos.
1. **A nota já chegou pelo SIEG (o caso mais comum, inclusive NFS-e emitida no Sistema Nacional, e também as de prefeitura lidas pelo SIEG):** o Arato busca sozinho às 7h e às 13h e deixa a nota pendente, sem financeiro. Abra Documentos Fiscais → Notas de Entrada → Notas de Terceiro, filtre Tipo = NF de Serviços e Status = Pendente, clique na nota e em Abrir NFS. Confira os passos, informe Ano Safra e Operação Gerencial e clique em ✓ Processar NF. Só aí o título vai para o Contas a Pagar. Não lance de novo à mão: a nota viraria repetida. Se ela ainda não chegou, o botão de sincronizar da mesma tela busca na hora.
2. **A nota não veio pelo SIEG:** na mesma tela, botão + Nova NF de Serviço.
Separada da nota de produtos — wizard Prestador → Serviço (código LC 116/2003: a lista tem todos os itens da lei, agrupados por grupo, com busca por código ou nome — ex.: "médic" acha 4.01 Medicina; código vindo da prefeitura/SIEG em outro formato, como 04.02.01, é reconhecido como 4.02; código fora da lista vai em Outro código) → Tributação (ISS e retenções federais: PIS, COFINS, CSLL, IRRF, INSS). O tomador normalmente é a própria fazenda/produtor contratante.

### Comercial & Logística → Faturamento / NF-e de Saída
**Série e número da NF-e de saída (corrigido 13/10/2026)**: a série e o número vêm sempre de Configurações → Sistema → Parâmetros Fiscais (NF-e) → aba Fiscal do emitente e da inscrição estadual escolhidos (campos Série NF-e e Próx. Número NF-e). O campo Série da tela mostra Auto e não é editável. Ao salvar o rascunho (status Processando), a nota já fica com a série e o número de Parâmetros; o número definitivo é reservado na transmissão para a SEFAZ e a série real também é gravada na nota ao autorizar. Antes disso, rascunhos novos apareciam com série 1 e número sequencial local, sem relação com a configuração. Rascunhos antigos criados nesse formato são corrigidos sozinhos quando transmitidos. Se a série ou o número aparecerem errados, conferir Configurações → Sistema → Parâmetros Fiscais (NF-e) → aba Fiscal → NF-e da IE correta.
Tela de emissão das NF-e da própria fazenda/produtor (nunca de documentos de terceiro — isso é em Documentos Fiscais → Notas de Terceiro). "+Nova NF-e" abre 3 formas de iniciar: **Por Contrato** (puxa dados de um contrato de grãos confirmado), **Avulsa — Venda** (venda sem contrato, CFOP 6.501/6.101/5.101 etc.) e **Remessa** (depósito em armazém geral 6.905/5.905, entrega futura 6.117 ou venda à ordem 6.119) — essa é a remessa de **produto agrícola** (grão) para armazém geral, diferente da "Emitir NF Remessa" de insumo descrita acima (aquela parte de uma NF de Entrada; esta parte de um contrato/venda avulsa de grão).

**Retorno de Armazém Geral** (trazer de volta o grão enviado por uma Remessa): não é mais um card genérico de "Devolução/Retorno" que caía num formulário de venda — hoje é um botão **"↩ Retorno"** que aparece direto na linha de qualquer NF de Remessa (CFOP 6.905/5.905) autorizada, na tabela da própria tela de Faturamento. Clicar nele pré-preenche tudo a partir da remessa original (destinatário, itens, CFOP espelhado 6.906/5.906, referência à chave da NF de remessa) — só confirma e emite. Depois de retornada, a linha mostra "✓ Retornada" no lugar do botão (não dá pra retornar a mesma remessa duas vezes). O card "Retorno de Armazém Geral" no "+Nova NF-e" é um atalho que lista as remessas autorizadas aguardando retorno e abre o mesmo fluxo. **Devolução de mercadoria comprada ou vendida não é emitida aqui** — devolução de compra é em Documentos Fiscais → Notas de Terceiro (botão "↩ Devolver", ver acima); devolução de venda (cliente devolvendo grão) é recebida como documento de terceiro, não emitida pela fazenda.

### Comercial & Logística → Transferência entre Fazendas
Fluxo: Rascunho → Emitir NF → (Confirmar Entrada, se não automática). CFOP correto: 5.151/6.151 para mercadoria de **produção própria**; 5.152/6.152 para mercadoria **adquirida de terceiros**. O catálogo do insumo (nome, categoria, unidade) é compartilhado por toda a conta; o saldo/estoque é sempre calculado por fazenda. Cancelamento de NF já autorizada só é possível dentro de 24h (regra da SEFAZ) e exige justificativa.

**Replicar (⧉):** disponível em qualquer transferência, de qualquer status. Abre uma cópia nova (rascunho), totalmente editável — inclusive os itens: dá para adicionar, remover e trocar insumo/quantidade/custo livremente antes de emitir de novo. Não altera nem referencia a transferência original.

O seletor de Insumo, por item, tem busca por texto (digite parte do nome pra filtrar) — útil quando o catálogo da fazenda tem muitos itens cadastrados.

### Comercial & Logística → Contratos de Grãos
Status: aberto → parcial → encerrado / cancelado. Confirmar o contrato atribui número e cria o CR quando há valor — **não emite NF-e** (isso é uma ação separada). Romaneio de entrega atualiza o saldo do contrato e o status automaticamente. Adiantamento de cliente gera CR já baixado, que abate contra o CR de cada entrega futura (FIFO, do mais antigo primeiro).

**Recebimento por carga (29/10/2026)**: no modal do contrato, a opção "Recebimento por carga" (com "Prazo após a NF", em dias) serve para o comprador que paga carga a carga. O CR do contrato continua sendo criado ao confirmar, com o valor total, vencendo na "Data limite de pagamento" — ele é a previsão no fluxo de caixa. Cada NF-e de venda vinculada ao contrato abate desse CR o valor da carga (sacas da NF × preço do contrato, na moeda do contrato — por isso funciona também em contrato em US$) e vira um CR próprio, "Venda — comprador (Contrato X · NF n)", com o valor da NF em R$, vencendo na data da NF + o prazo. Quando o total abatido chega ao valor do contrato, o CR do contrato zera e fica cancelado; se as cargas passarem do valor, o sistema avisa. A NF-e emitida pelo Faturamento a partir do contrato entra sozinha; a NF emitida fora do sistema (importada / nota própria) é vinculada no painel "Faturamentos por carga" do modal do contrato: escolha a NF (a busca mostra as NF-es de saída autorizadas do mesmo CNPJ do comprador; "outros destinatários" mostra todas) e clique Vincular. Se a NF não tiver unidade em kg/sc/t, informe o valor a abater (obrigatório no contrato em US$). "Desvincular" — ou cancelar a NF-e na SEFAZ — apaga o CR da carga (se ainda não foi recebido) e devolve o valor ao CR do contrato; CR da carga já recebido precisa ter a baixa estornada antes. Nesse modo o romaneio não gera CR (quem gera é a NF). Se o CR do contrato já teve recebimento, ele não é abatido. Adiantamento de cliente ainda não abate o CR do contrato nesse modo. Requer a Seção 388.

### Comercial & Logística → Compromissos em Grãos
Relatório somente leitura: reúne contratos de grãos originados de arrendamento, compra de terra e barter, com progresso de entrega por commodity.

### Comercial & Logística → Expedição de Grãos
Rotas mutuamente exclusivas por carga: Transbordo sem NF · Transbordo com Remessa (CFOP 5905) · Direto ao Comprador (CFOP 6101). Pipeline: rascunho → em_trânsito → entregue → corrigindo_peso → encerrada. **O "Emitir MDF-e" desta tela é simulado** (ver seção acima) — para MDF-e real, use o módulo de Transporte. Divergência de peso acima de 1% no destino sinaliza necessidade de NF complementar.

### Comercial & Logística → Fretes e Transporte → CT-e e MDF-e
Este é o MDF-e e CT-e reais, que transmitem à SEFAZ — inclusive o MDF-e aberto a partir da Expedição de Grãos cai aqui para a emissão de verdade. Exigem emitente com certificado A1 configurado. Situação tributária do CT-e segue regra por UF (intraestadual → CST 51 diferido; interestadual → CST 00 ou 20). Transferência entre estabelecimentos do mesmo titular usa CST 41 (não tributado); venda usa CST 51 (diferido) — nunca o mesmo CST para as duas operações. Desde 05/01/2026, emitentes Lucro Presumido/Real são obrigados a destacar IBS/CBS no CT-e (Simples Nacional e MEI são dispensados) — configurável em Configurações → Sistema → Parâmetros Fiscais (NF-e) → aba CT-e. **Cavalo, implementos e conjuntos**: em Fretes e Transporte → Transportadoras e Veículos, cada veículo tem o Tipo de cadastro — Cavalo (tração, puxa sozinho ou com carretas) ou Implemento (carreta/reboque) — e o Nº de eixos. A aba Conjuntos monta o cavalo com até 3 implementos, na ordem do engate (1º atrás do cavalo); um cavalo ou implemento só pode estar em um conjunto montado por vez, e "Desmontar" libera os veículos sem mexer em documentos já emitidos. No CT-e e no MDF-e o campo Veículo lista os conjuntos montados e, à parte, os cavalos sem implemento (implemento sozinho não aparece). Ao escolher o conjunto: o MDF-e leva as carretas como reboque (placa, tara, capacidade e tipo de carroceria de cada uma — tara e capacidade do implemento são obrigatórias), com tipo de rodado "cavalo mecânico"; o CIOT recebe as placas das carretas e os eixos do cadastro, sem digitar; a lista e a impressão do MDF-e mostram as placas das carretas. O documento guarda as carretas daquela viagem — desmontar o conjunto depois não muda o que já foi emitido. **Conjunto e motorista sem cadastro**: o campo Veículo do CT-e e do MDF-e também tem a opção "Digitar placas (conjunto sem cadastro)" — placa, UF e tara do cavalo e até 3 carretas (placa, UF, tara e capacidade); no CT-e só as placas são obrigatórias, no MDF-e também UF, tara e capacidade. O motorista pode ser escolhido do cadastro (o CPF vem do cadastro) ou digitado com nome e CPF. Escolhendo conjunto ou cavalo cadastrado, o motorista habitual do cavalo vem preenchido. O conjunto digitado no CT-e é levado ao MDF-e que seleciona esse CT-e. **Tara/capacidade na transmissão do MDF-e**: se o cavalo estiver sem tara ou alguma carreta sem tara ou capacidade (carreta cadastrada sozinha pelas placas digitadas no CT-e nasce sem esses dados), ao clicar em transmitir abre a janela "Falta tara/capacidade" com cada placa; preenchidos, os valores ficam salvos no cadastro do veículo e o MDF-e segue para a SEFAZ. **MDF-e transmitido não é editável**: depois de autorizado (ou encerrado/cancelado), salvar o MDF-e não altera mais nenhum dado do documento — só grava o CIOT, quando gerado depois da autorização. O MDF-e autorizado sem CIOT não leva o CIOT no XML: o CIOT gerado depois fica só registrado no sistema. **Encerrar MDF-e**: o encerramento é no destino — a janela abre com o município e a UF de destino do CT-e vinculado (com vários, o do último documento), e o usuário pode trocar antes de confirmar. MDF-e sem CT-e vinculado abre com o município em branco para digitar.

### Financeiro → Cartões de Crédito
Três abas: **Cartões** (cadastro — titular, bandeira, banco, 4 últimos dígitos, dia de fechamento e de vencimento da fatura, limite), **Faturas** (uma por cartão/mês, acumula os lançamentos que escolheram aquele cartão como forma de pagamento) e **Conciliação** (compara o extrato importado do banco/operadora contra os lançamentos da fatura — hoje é só uma ferramenta de comparação na tela, não fica salvo se a pessoa sair da aba).

Fatura tem 3 status: **Aberta** (ainda recebendo lançamentos), **Fechada** (o sistema fecha sozinha quando a data de fechamento passa — checado toda vez que a tela de Cartões é aberta, não é um cron em segundo plano) e **Paga**. O botão "🔒 Fechar fatura"/"🔓 Reabrir fatura" também permite fazer isso manualmente antes/depois da data. Não existe criação manual da próxima fatura — ela nasce sozinha no primeiro lançamento novo daquela competência.

**"💰 Pagar fatura"** (só aparece em fatura Fechada) é o único evento que move dinheiro de verdade neste fluxo inteiro: pede conta bancária + data, e gera UM lançamento consolidado, já baixado, pelo valor total da fatura — esse sim entra em conciliação bancária normal. Os lançamentos individuais que formaram a fatura não mudam em nada (continuam com status "cartao" pra sempre, servindo de detalhe/auditoria do que compôs aquele total).

**Pagar com cartão na baixa e estorno no cartão (28/10/2026)**: (1) NF de entrada com forma de pagamento Cartão de Crédito: os títulos já nascem na fatura do cartão escolhido (pela data da compra). (2) Na janela Baixar Lançamento do Contas a Pagar há "💳 Pagar com cartão de crédito": escolha o cartão e clique em Lançar no cartão — o título vai para a fatura da data da baixa (se ela já fechou, para a próxima aberta), sai do Contas a Pagar e não mexe no banco; o dinheiro sai ao pagar a fatura. Vale para título do produtor em reais, sem pagamento parcial, borderô ou conciliação. (3) Estorno de compra no cartão sempre pede confirmação de como aconteceu: botão Estornar em cada compra da fatura (Cartões de Crédito → Faturas) e, no estorno de NF paga no cartão, a janela aparece sozinha. Opções: Retirar da fatura (só com a fatura aberta — a operadora ainda não cobrou; o título volta ao Contas a Pagar em aberto, ou no estorno da NF sai junto com ela); Crédito em fatura seguinte (a operadora devolve como crédito: entra na fatura escolhida como valor a abater, em verde com sinal −, e a fatura fica menor); Reembolso em dinheiro (o valor volta por PIX/depósito: entra no Contas a Receber do fornecedor com a data prevista, para baixar quando chegar). Fatura fechada ou paga não permite retirar (já foi cobrado). No estorno de NF com compra já cobrada, o título continua na fatura (sem a NF) e o crédito ou reembolso é lançado. Pode-se informar valor parcial no estorno pela fatura. O crédito de estorno não aparece no Contas a Receber. Requer a Seção 385. Ainda não vale para títulos da Empresa (só produtor).

### Financeiro → Folha de Pagamento → aba 13º Salário
**13º Salário (29/10/2026)**: fica dentro da Folha de Pagamento, na aba 🎁 13º Salário (ao lado de Gratificações) — não tem mais menu próprio; o endereço antigo leva direto para a aba. Escolha o ano. A tela lista os funcionários ativos (quem foi demitido recebe o 13º proporcional na rescisão) com: Avos — meses do ano com 15 dias ou mais trabalhados, contados da admissão (ex.: admitido em 04/08 → 5/12; em 19/06 → 6/12, junho não conta); Base — salário da carteira ou, escolhendo "Salário + complemento" no seletor Base do 13º, salário + complemento salarial do cadastro (ao trocar, recalcula quem ainda não teve a 1ª parcela lançada; a escolha fica lembrada no navegador); a base ainda pode ser ajustada à mão antes de lançar (média de horas extras e variáveis); 13º bruto = base ÷ 12 × avos; 1ª parcela = metade do bruto, sem descontos; INSS e IRRF calculados sobre o 13º inteiro pela tabela da folha (estimativa — confirmar com o contador); 2ª parcela = bruto − INSS − IRRF − 1ª. Lançar 1ª parcela (vencimento sugerido 30/11) e Lançar 2ª parcela (20/12) criam um título por funcionário no Contas a Pagar, no nome do funcionário, categoria Pessoal / 13º Salário, operação 13º SALÁRIO - FAZ ou - ADM pela área de trabalho; marcando funcionários, só os marcados são lançados. Cada parcela mostra A lançar, Aberto, Parcial ou Pago (pelo título do CP); "estornar" apaga o título ainda não pago e libera a parcela (a 1ª só depois da 2ª). Depois de lançada a 1ª, base e avos ficam travados. Requer a Seção 386.

### Fiscal → GNRE e eSocial Rural
Ver seção "O que é simulado" acima — hoje são controle de status local, sem transmissão oficial comprovada.

### Fiscal → LCDPR / SPED ECD
Geram o arquivo a partir dos lançamentos classificados (vínculo de atividade, entidade contábil PF/PJ) — gerar o arquivo aqui **não é o mesmo que transmitir** à Receita Federal. O SPED pode pular lançamentos sem Operação Gerencial com conta de débito/crédito configurada — revise a prévia antes de considerar completo.

### Fiscal → Obrigações → IBS / CBS — 2027
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

**"Código IBGE do município do emitente não configurado" mesmo com o endereço certo em Configurações → Sistema → Parâmetros Fiscais (NF-e) → aba Fiscal**: bug corrigido (09/10/2026). Quando o emitente tem uma Inscrição Estadual ativa (Cadastros → Produtores → IEs), a emissão usa o endereço dessa IE — mas se a IE tiver sido cadastrada sem repetir o município/IBGE (comum, já que o endereço "de verdade" normalmente só é preenchido em Configurações → Sistema → Parâmetros Fiscais (NF-e) → aba Fiscal), o sistema sobrescrevia o IBGE correto por um vazio vindo da IE, incondicionalmente. Agora cada campo de endereço (IBGE, município, CEP, logradouro, número, complemento, bairro) só vem da IE quando ela de fato tiver esse campo preenchido — senão usa o de Configurações → Sistema → Parâmetros Fiscais (NF-e) → aba Fiscal. Isso batia em toda primeira emissão de cliente novo, não era específico de nenhuma conta.

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
