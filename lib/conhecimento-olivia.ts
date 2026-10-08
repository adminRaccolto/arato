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

### Produção → Planejamento
Orçamento por ciclo (itens por categoria: sementes, fertilizantes, defensivos, correção de solo, operações, arrendamento, outros), comparativo planejado × realizado com desvio por categoria, e agenda de operações do ciclo. Ano-safra é da conta inteira — um "2025/2026" vale para todas as fazendas do cliente, não precisa recriar por propriedade.

### Produção → Plantio
Seletor em cascata obrigatório: Produtor → Fazenda → Ano-safra → Ciclo → Talhão. Informe área, data, semente/dose, produtividade e preço esperados. Ao salvar, dá baixa no estoque de sementes (dose × área) e registra o custo no Kardex e no próprio registro do plantio — **sem criar CP** (ver seção acima).

### Produção → Pulverização Terrestre / Aplicação Aérea
Tipos: herbicida, fungicida, inseticida, nematicida, acaricida, fertilizante foliar, regulador, dessecação, outros. Dá baixa de cada produto no estoque (dose × área) e calcula o custo total da aplicação — **sem criar CP** na Pulverização Terrestre. Aplicação Aérea: confira sempre no Kardex se a baixa ocorreu, não garanta que é automática.

### Produção → Adubação de Base / Correção de Solo
Registram consumo de fertilizante/corretivo e dão baixa de estoque, sem CP nova (mesmo motivo do Plantio). Correção de Solo trabalha normalmente em toneladas e converte para a unidade do cadastro do insumo (referência 60 kg = 1 saca quando a conversão usa sc).

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

**Relatório de Pedidos de Compra** (Comercial & Logística → Relatórios → Pedidos de Compra — rota própria "/relatorios/pedidos-compra", não vive mais dentro de Financeiro → Relatórios Financeiros): além de fornecedor, status, ano safra e período, tem filtro por **Grupo** e **Item (insumo)** — útil pra achar em qual pedido um produto específico está, sem precisar abrir pedido por pedido. Item é filtrado em cascata pelo Grupo escolhido. Tem duas Visões: **Por Pedido** (padrão — 1 página por pedido, com os itens e as NFs vinculadas daquele pedido) e **Consolidado por Insumo** (soma, por insumo, a quantidade pedida/entregue/cancelada/saldo e o valor total em TODOS os pedidos que contêm aquele item dentro do filtro aplicado, com o número de pedidos diferentes envolvidos; em modo Detalhado mostra também a lista desses pedidos por item). Na visão por Pedido, o filtro de Grupo/Item só restringe quais PEDIDOS aparecem — dentro de cada pedido encontrado continuam aparecendo todos os itens dele. Na visão Consolidado por Insumo, quando um Item ou Grupo é escolhido, só entram na soma os itens daquele insumo mesmo que o pedido também tenha outros produtos (e só entram itens vinculados a um insumo do catálogo — item avulso sem insumo_id não aparece). O cabeçalho do PDF mostra a logo e o nome do cliente (conta), não mais um nome genérico fixo.

### Documentos Fiscais → Notas de Terceiro (NF de Produtos)
Captura (XML, SIEG ou digitação manual) e processamento são fases distintas — uma nota "capturada" ou "classificada" pelo SIEG ainda não gerou estoque nem CP até ser processada de fato. No processamento, cada item pode ir para estoque, direto para uma máquina ou direto para um centro de custo (Apropriação Direta), conforme a Operação Gerencial escolhida no cabeçalho. Produto sem unidade compatível com o cadastro pode usar "Conversão manual (livre)" — você digita o total já na unidade do insumo. Para desfazer uma nota processada, use Estornar antes de reprocessar (reverte estoque, CP e pendências fiscais) — nunca edite o cabeçalho de uma nota já processada direto.

**Devolução de Compra**: botão "↩ Devolver" (card da NF em Documentos Fiscais, ou dentro do modal da NF já processada) emite uma NF-e de devolução de verdade na SEFAZ (saída, de volta ao fornecedor, CFOP 5201/6201). Só aparece em NF processada do tipo **Insumos** ou **Peças / Manut.** — os dois tipos que podem apropriar item em estoque. Mesmo aparecendo, só entram na lista de devolução os itens que foram de fato pro estoque (tipo_apropiacao = estoque); item lançado direto numa máquina ou por Apropriação Direta (centro de custo) não tem o que devolver do estoque, então não aparece na lista — nesse caso o ajuste é por Reclassificar ou Estornar, não por Devolução. O destinatário da NF de devolução (o fornecedor) busca endereço/IBGE do cadastro de Pessoas; se faltar lá mas o CEP estiver preenchido, completa automaticamente pelo CEP antes de emitir — erro "Código IBGE... não informado" ainda pode aparecer se nem o CEP estiver cadastrado.

**Peças / Manutenção com Apropriação "Estoque"**: nesse tipo de NF, cada item normalmente é vinculado a uma máquina (vai direto pro maquinário, não pro estoque) — mas a Apropriação do item pode ser trocada pra "Estoque" quando a peça entra pro estoque em vez de ser consumida direto. Quando isso acontece, aparece um seletor de insumo do catálogo (com botão "+" pra cadastrar um novo na hora) embaixo do campo Descrição — exatamente como no tipo Insumos. Sem escolher um insumo ali, o processamento bloqueia com o erro "associe um insumo... antes de processar".

**Emitir NF Remessa**: abre o wizard de Notas de Venda pré-preenchido a partir da NF de Entrada de origem — Produtor remetente já vem selecionado (é quem recebeu a mercadoria naquela NF, agora remetendo pro armazém/depósito), itens de estoque pré-carregados, CFOP começa em 6.905 (interestadual) e troca sozinho pra 5.905 assim que o Destinatário (armazém) escolhido tiver a mesma UF do emitente — nos dois casos a lista de CFOP nesse modo mostra só os códigos de remessa (6.905/5.905/6.117/6.119), sem opções de venda/devolução que não se aplicam aqui. Ao escolher o Destinatário no catálogo de Pessoas, se o cadastro tiver CEP mas faltar endereço ou código IBGE, o sistema busca automaticamente pelo CEP (ViaCEP) pra completar.

### Documentos Fiscais → Notas de Serviço (NFS-e)
Separada da nota de produtos — wizard Prestador → Serviço (código LC 116/2003) → Tributação (ISS e retenções federais: PIS, COFINS, CSLL, IRRF, INSS). O tomador normalmente é a própria fazenda/produtor contratante.

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
Lançamento pode vir de pedido, nota, contrato, folha ou ser manual — a coluna "Lançado via" mostra qual. Baixa compara valor pago + ajustes (desconto/juros) contra o saldo do título para decidir se fica total ou parcial. Reabrir desfaz os dados da baixa e volta para aberto/vencido. Conciliação bancária classifica cada linha do OFX como alta/média/bloqueado/nenhum (tolerância de valor 0,02; janela de 7 dias, alta considera até 2 dias de diferença) — alta pode aplicar automaticamente; média é só sugestão para revisão manual.

**Borderô (pagamento/recebimento em lote) — o borderô É o título.** Não confunda o borderô com um simples agrupador de NFs: ele representa o documento de pagamento real (ex: o boleto mensal que um posto de combustível emite somando várias NFs do mês). Por isso, pagamento parcial, juros, multa e desconto são sempre do TÍTULO INTEIRO — um valor só por borderô — nunca de uma NF/item individual dentro dele.

- **Criar Borderô:** agrupa os títulos (NFs) selecionados, ainda sem baixar (fica "pendente"). Campos do título: Descrição, Nº do título (referência do documento agregador — ex: o número do boleto — distinta da descrição), Data de vencimento do borderô (opcional). A lista de NFs mostradas é só informativa (número da NF + valor) — não editável aqui.
- **Confirmar Pagamento/Confirmar Recebimento:** o passo que de fato baixa o título — define data real + conta bancária, e tem UM campo de Valor a pagar/receber (default = soma das NFs, editável pra menos = pagamento parcial do título inteiro), e UM campo cada de Juros, Multa e Desconto (sobre o título, não por NF). O sistema rateia esse valor/juros/multa/desconto proporcionalmente entre as NFs por trás (pelo peso de cada uma), só pra manter o status individual de cada lançamento coerente nos relatórios — o usuário nunca edita esse rateio diretamente.
- **Depois de confirmado**, o borderô aparece no grid principal como um único banner "✅ BORDERÔ PAGO" (mesmo lugar onde aparecia "📋 BORDERÔ PENDENTE") — as NFs que fazem parte dele somem da lista solta, porque o título pago é a unidade que importa, não cada NF individualmente. Isso vale tanto em Contas a Pagar quanto em Contas a Receber.
- "Cancelar" desfaz o agrupamento de um borderô pendente sem baixar nada. "Estornar" reverte um borderô já confirmado/pago — os títulos voltam a ficar soltos e em aberto, sem data/conta de pagamento.

**Forma de Pagamento = Cartão de Crédito.** Ao escolher essa forma de pagamento no lançamento (CP), aparece um seletor de qual cartão (cadastrado em Financeiro → Cartões de Crédito) — selecionar é obrigatório. Esse lançamento recebe um status próprio ("cartao") que **some do grid de Contas a Pagar** (não é saldo em aberto do fornecedor/produtor) e **não movimenta conta bancária nem conciliação agora** — o valor vai pra fatura do cartão daquela competência (mês/ano calculado pelo dia de fechamento cadastrado no cartão), acumulando com os demais lançamentos no cartão. Não é compatível com a condição "Recorrência" (use "Parcelado" com a grade editável se precisar dividir em várias faturas — cada parcela cai na fatura do seu próprio mês). O lançamento continua contando pro DRE normalmente pela Operação Gerencial escolhida, na data da compra — só o regime de caixa fica represado até a fatura ser paga.

### Financeiro → Cartões de Crédito
Três abas: **Cartões** (cadastro — titular, bandeira, banco, 4 últimos dígitos, dia de fechamento e de vencimento da fatura, limite), **Faturas** (uma por cartão/mês, acumula os lançamentos que escolheram aquele cartão como forma de pagamento) e **Conciliação** (compara o extrato importado do banco/operadora contra os lançamentos da fatura — hoje é só uma ferramenta de comparação na tela, não fica salvo se a pessoa sair da aba).

Fatura tem 3 status: **Aberta** (ainda recebendo lançamentos), **Fechada** (o sistema fecha sozinha quando a data de fechamento passa — checado toda vez que a tela de Cartões é aberta, não é um cron em segundo plano) e **Paga**. O botão "🔒 Fechar fatura"/"🔓 Reabrir fatura" também permite fazer isso manualmente antes/depois da data. Não existe criação manual da próxima fatura — ela nasce sozinha no primeiro lançamento novo daquela competência.

**"💰 Pagar fatura"** (só aparece em fatura Fechada) é o único evento que move dinheiro de verdade neste fluxo inteiro: pede conta bancária + data, e gera UM lançamento consolidado, já baixado, pelo valor total da fatura — esse sim entra em conciliação bancária normal. Os lançamentos individuais que formaram a fatura não mudam em nada (continuam com status "cartao" pra sempre, servindo de detalhe/auditoria do que compôs aquele total).

### Financeiro → Folha de Pagamento
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
