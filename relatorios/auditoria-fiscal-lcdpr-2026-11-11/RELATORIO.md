# Auditoria do LCDPR, configuração fiscal, operações gerenciais e SEFAZ

Data: 11/11/2026. Escopo: Arato, código local e conferência de dados por leitura. Base de código ao encerrar: `7cb5eb23f712d0500f57d54f1d1f347dd7024503`.

## Parecer

**Há falhas de integridade confirmadas. A configuração exibida nem sempre determina o XML emitido; a seleção de produtor não restringe corretamente o LCDPR; e existem operações fiscais que podem concluir externamente sem confirmação durável no Arato.** Também foram reproduzidas falhas de validação de titularidade nas rotas que usam a chave de serviço.

Os problemas não se resumem a certificado vencido ou indisponibilidade da SEFAZ. Há decisões locais que explicam sintomas como campo que volta vazio, cadastro aparentemente salvo, documento ausente, rejeição atribuída ao certificado e valores divergentes entre tela, financeiro e exportação.

Esta auditoria produziu **41 cenários reproduzíveis** com funções reais e dependências simuladas. Os testes da auditoria documentam o comportamento defeituoso atual: passarem significa que o defeito foi reproduzido. Separadamente, os **768 testes existentes passaram**, assim como a checagem TypeScript. A suíte atual, portanto, não cobre suficientemente as invariantes aqui demonstradas.

Não foram alterados código da aplicação, dados, configurações, certificados ou migrações. Não houve emissão, cancelamento, manifestação, distribuição autenticada nem teste de exploração em produção. Os novos arquivos são relatório, ferramentas de auditoria e evidências. Não houve commit ou publicação nesta etapa.

## Método, alcance e limites

Foram inventariados 138 arquivos de aplicação relacionados ao escopo, incluindo 29 rotas de API e 26 páginas. O rastreamento incluiu LCDPR, SPED contábil, planos contábeis, parâmetros fiscais, NCM, CFOP, operações fiscais e gerenciais, cadastros de produtor/empresa/imóvel/banco, contratos, faturamento, NF-e, CT-e, MDF-e, certificados, consulta e distribuição de documentos, reclassificação e efeitos de cancelamento no financeiro/estoque.

A inspeção da base utilizou projeções explícitas e paginação por GET, com 49 consultas iniciais e 22 complementares registradas. A conferência abrangeu 11 contas, 25 fazendas, 20.023 lançamentos financeiros, 4.554 operações gerenciais, 2.040 vínculos OG/CFOP, 73 operações fiscais e 404 documentos de saída/transporte. A leitura com credencial de serviço mede consistência dos dados; não demonstra, por si só, o que cada perfil de usuário consegue ler sob RLS.

Os testes executam trechos/funções reais e constroem XMLs em memória, com dados sintéticos. Autenticação, Supabase e serviços externos são simulados nos cenários de falha. Isso demonstra ausência de validações e divergências locais sem transmitir documentos. Não substitui homologação por UF/regime, validação integral por XSD/PVA, medição da disponibilidade real do autorizador ou cálculo de imposto devido por documento histórico.

Os dois layouts compartilham as páginas e serviços examinados em boa parte desses fluxos. Não foi realizada uma matriz visual automatizada dos dois layouts em navegador. Qualquer correção deverá validar ambos, incluindo troca de cliente/emitente e navegação entre módulos.

Os dados privados de apoio permanecem em `backup/auditoria-fiscal-lcdpr-2026-11-11/`, ignorado pelo Git. Os arquivos em `dados/` contêm agregados, esquema, inventário de código e exemplos sintéticos; não incluem CPF, senha ou material de certificado de clientes.

## 1. LCDPR: titularidade, origem e exportação

### 1.1. O CPF selecionado não delimita os movimentos

**Prioridade P0 — LC-01, LC-02 e LC-03.** Em `app/lcdpr/page.tsx:513`, `entradasExport` considera período e fator de participação, mas não filtra a titularidade do produtor. A geração usa o CPF selecionado no cabeçalho. O mesmo conjunto alimenta TXT, planilha e relatório.

No teste, produtor A tem receita de R$ 100 e produtor B de R$ 900. A exportação identificada com o CPF A contém R$ 1.000. O imóvel de B, ausente dos imóveis exportados para A, é substituído silenciosamente pelo primeiro imóvel do arquivo (`page.tsx:727`). O fator de 50% também alcança os dois movimentos, produzindo R$ 50 e R$ 450.

Esse último resultado não pode ser corrigido com um rateio global diferente: é necessário distinguir propriedade exclusiva, exploração compartilhada e critério de participação de cada movimento. A escolha “Todos” também usa o primeiro CPF para identificar o arquivo; não gera automaticamente um arquivo separado por contribuinte.

Na base, cinco contas têm mais de um titular entre os movimentos elegíveis de 2026. Isso demonstra exposição ao cenário; não foi feita uma entrega real para comprovar que algum arquivo incorreto já foi transmitido.

### 1.2. O filtro decide a natureza fiscal por texto e por estado do título

**Prioridade P1 — LC-04, LC-05 e LC-06.** O filtro de `page.tsx:356` exclui descrições que contenham nomes de produtores/empresas da conta, sem exigir uma ligação estrutural com transferência ou mútuo. Uma venda rural sintética que menciona uma empresa do grupo desaparece do livro. Há 20 movimentos atuais excluídos somente pelo critério de nome; a análise agregada não permite afirmar que os 20 sejam exclusões erradas.

O filtro aceita `baixado` e `parcial`, mas não verifica `natureza='previsao'` nem distingue a compensação do adiantamento que originou o desembolso. Passaram pelo cenário sintético uma previsão paga e uma compensação. Na base atual foram encontradas seis compensações elegíveis e nenhuma previsão paga elegível.

**Não se recomenda excluir toda compensação ou todo movimento sem banco.** A origem econômica e fiscal do evento precisa ser definida para evitar omissão ou contagem dupla. O manual admite situações de numerário em trânsito; o código `999` não significa automaticamente lançamento irregular. Essa distinção consta no [manual oficial do LCDPR](https://www.gov.br/receitafederal/pt-br/assuntos/orientacao-tributaria/declaracoes-e-demonstrativos/lcdpr-livro-caixa-digital-do-produtor-rural/manual-de-preenchimento-do-lcdpr-1-3).

A data usa `data_baixa ?? data_vencimento ?? data_lancamento`. Na amostra, **146 dos 5.282 movimentos elegíveis não têm data de baixa**; o exercício está sendo determinado por outro campo. Há também 14 sem titular resolvido. Pagamentos parciais históricos acumulados em uma linha exigem atenção: total pago e última data não reconstituem os pagamentos de exercícios diferentes. As novas partes separadas reduzem esse problema, mas não reconstituem automaticamente o legado.

### 1.3. Há problemas de leiaute e validação anterior à exportação

**Prioridade P1 — LC-07, LC-08, LC-09 e LC-11.** A exportação anual usa o saldo inicial livre da tela, que também é compartilhado entre titulares. O teste com saldo de R$ 500 e receita de janeiro de R$ 100 exporta saldo de R$ 600. Para o demonstrativo anual, o manual estabelece início em zero. Não se deve transportar o saldo financeiro/bancário para esse resultado fiscal. [Manual LCDPR, Q100](https://www.gov.br/receitafederal/pt-br/assuntos/orientacao-tributaria/declaracoes-e-demonstrativos/lcdpr-livro-caixa-digital-do-produtor-rural/manual-de-preenchimento-do-lcdpr-1-3).

A tela avisa sobre exploração coletiva, mas permite baixar um arquivo sem os participantes `0045` quando necessários. O número de documento com `|` desloca as colunas; uma quebra de linha no histórico permanece dentro do registro. Em `0050`, o DV da conta é concatenado com hífen, apesar de `NUM_CONTA` ser numérico na planilha oficial. A sanitização/validação precisa abranger todos os campos, e não somente o histórico. [Leiaute oficial LCDPR 1.3](https://www.gov.br/receitafederal/pt-br/centrais-de-conteudo/publicacoes/documentos-tecnicos/lcdpr/leiaute-lcdpr-1-3).

A geração também usa o endereço da primeira fazenda para identificar o declarante; não há verificação de que seja seu endereço cadastral. `0040` utiliza `itr`, sem aproveitar `nirf`, e falta validação cadastral abrangente. Nos 25 imóveis lidos, os campos locais de CAEPF e de CAFIR/ITR/NIRF estão vazios. A obrigação desses campos depende da situação do imóvel e da exploração; não equivale a afirmar que 25 declarações foram rejeitadas.

Não foi encontrado cadastro de contador nessa coleta. Os dados do contador são opcionais no leiaute; essa ausência isolada não é um defeito fiscal.

Há 759 movimentos elegíveis cujo banco não foi resolvido para o cadastro carregado. O gerador os transforma em `999`. A lista carrega somente bancos ativos, o que também pode apagar o vínculo de banco histórico que venha a ser desativado. É necessário distinguir conta histórica válida, caixa, trânsito e referência ausente antes de classificar esses movimentos como erro. [Pontos de atenção da Receita](https://www.gov.br/receitafederal/pt-br/assuntos/orientacao-tributaria/declaracoes-e-demonstrativos/lcdpr-livro-caixa-digital-do-produtor-rural/pontos-de-atencao-no-preenchimento.pdf).

### 1.4. Lançamento manual/importação e salvamentos

**Prioridade P1 — LC-10 e CFG-04.** `adicionarManual` e a importação de planilha alimentam apenas o estado React. O lançamento manual parece fazer parte do livro, mas desaparece ao recarregar ou trocar o contexto. Falta persistência identificável e auditável, ou uma indicação explícita de simulação temporária.

`salvarConfig`, `salvarContador` e `salvarFaz` não tratam adequadamente o retorno de erro da escrita. Foi reproduzida a exibição de quota nova após gravação recusada. Há leituras auxiliares sem tratamento de erro e sem garantia de paginação completa, particularmente pessoas/bancos; dados ausentes não podem virar silenciosamente CPF vazio ou código de trânsito.

## 2. Configuração fiscal e cálculo tributário

### 2.1. O cadastro não é a única fonte da regra efetivamente emitida

**Prioridade P1 — TRI-01, TRI-02, TRI-03 e TRI-07.** A tela permite cadastrar ICMS, PIS/COFINS e outros parâmetros em NCM e operações fiscais. Contudo, o caminho de emissão NF-e consulta o NCM principalmente para IBS/CBS (`lib/nfe/index.ts:592`); a construção do ICMS e PIS/COFINS segue regras fixas no builder.

Reproduções:

- item interestadual com `pICMS=7` produz `12.00` no grupo ICMS00;
- PIS/COFINS produzem CST `07`, independentemente de outra escolha fiscal no contexto;
- emitente CNPJ com CRT `1` produz ICMS00/CST normal, sem CSOSN;
- falha técnica na consulta do NCM, com IBS/CBS ativado, é tratada como ausência de cadastro: escolhe CST `410`/classe de fallback e continua o envio simulado.

O ponto central é a divergência entre parâmetro e resultado. Este relatório não prescreve uma alíquota, CST ou classe tributária única para toda operação. CRT, UF, destinatário, mercadoria, finalidade, benefício, data e enquadramento devem integrar a regra. O MOC prevê validações específicas para a relação CRT/CST/CSOSN. [MOC NF-e, Anexo I](https://www.confaz.fazenda.gov.br/legislacao/arquivo-manuais/moc7-anexo-i-leiaute-e-rv.pdf).

Existem tabelas paralelas que não fecham o circuito: não foram encontrados consumidores de `listarOperacoesFiscais` nem de `buscarCstPorCfop` no código rastreado. As naturezas de contratos/faturamento/fiscal continuam definidas por listas locais. Alterar essas tabelas não assegura alteração da emissão.

O helper `lib/operacoes-fiscais.ts:34` ainda ordena por `grupo`, coluna inexistente no banco atual; a GET correspondente retorna `42703`. **Esse helper não tem chamadores localizados.** A listagem ativa de parâmetros ordena por nome e essa falha não prova que a tela de configuração esteja atualmente quebrada. O problema é uma integração inconclusa e incompatibilidade de contrato que reapareceria ao ativar o helper.

### 2.2. Totais e validação de entrada

**Prioridade P1 — TRI-04, TRI-05 e TRI-06.** O builder aceita quantidade negativa e produz total de produto negativo. As rotas não executam uma validação tributária completa antes de reservar o número.

Os totais são calculados com precisão diferente daquela que chega a cada item. Em três itens de R$ 0,05 com 12% de ICMS, o XML apresenta R$ 0,01 por item, mas R$ 0,02 no total, em vez da soma R$ 0,03. Em dez itens de R$ 1,00 com IBS UF 0,1%, os itens apresentam zero e o total R$ 0,01. Não é uma escolha legal de alíquota: é uma inconsistência aritmética reproduzível no próprio XML.

### 2.3. Salvar pode falhar, deslocar o cadastro ou restaurar estado antigo

**Prioridade P1 — CFG-01, CFG-02 e CFG-03.** `salvarNcm` e `salvarOp` não conferem o erro antes de fechar o modal/recarregar. O teste simula recusa de gravação e o modal fecha sem persistir. A edição de NCM de outra fazenda da mesma conta regrava `fazenda_id` com a fazenda ativa, mudando o proprietário técnico do registro.

A carga de parâmetros faz `setCfgs(prev => ({ ...map, ...prev }))`: o estado anterior prevalece sobre o banco. Na troca de cliente, foi reproduzido ambiente de produção antigo sobre uma configuração de homologação recém-carregada, retendo também módulo de emitente anterior. Falta limpar o contexto e descartar respostas de cargas antigas.

Os salvamentos genéricos de configuração **tratam alguns erros**, mas enviam o JSON completo carregado no navegador. Não há precondição de versão. Uma tela aberta antes de uma emissão pode salvar de volta um `numero_inicial` antigo ou outros campos de configuração já atualizados. A fonte mutável do contador não deveria ser esse mesmo JSON editável.

Na base: nove grupos duplicados de configuração fiscal/CT-e/MDF-e por conta/módulo; dois com diferenças em campos operacionais; e dois grupos de NCM com regras divergentes. Duplicação não é, sozinha, erro: há resolução de precedência em alguns serviços. O problema é a multiplicidade de resoluções e a possibilidade de salvar uma cópia diferente daquela usada na emissão. A configuração atual não comprova a regra aplicada em notas antigas.

### 2.4. Outros limites funcionais

O indicador de Funrural acrescenta texto complementar; não representa, por si só, cálculo e retenção financeira automática. O usuário precisa conseguir distinguir uma observação fiscal de uma retenção executada.

O XML NF-e usa a data/hora de geração (`lib/nfe/builder.ts:406`), enquanto a tela pode guardar uma data de emissão informada. O caminho auditado não transporta essa data para `dhEmi`. Isso exige conferência entre documento local, XML e relatórios.

IBS/CBS possui defaults por ano corrente do servidor e comportamentos distintos entre NF-e e CT-e para regime/ativação. Não há evidência suficiente de uma matriz de regras versionada por vigência e cenário. As mudanças de notas técnicas precisam de testes por versão, ambiente e data; alteração de comunicado não deve ser interpretada como regra já vigente em todos os ambientes. Referência de acompanhamento: [Portal Nacional da NF-e — informes oficiais](https://www.nfe.fazenda.gov.br/portal/informe.aspx?ehCTG=false).

## 3. Operações gerenciais e contabilidade

### 3.1. O vínculo pode existir no banco e desaparecer no seletor

**Prioridade P1 — OG-01 a OG-05.** O helper principal deduplica operações globais, da conta e legadas, preservando `ids_equivalentes`. Consumidores que usam apenas `op.id` perdem a correspondência visual de um ID legado, embora o dado permaneça gravado. Essa é uma causa concreta de “edição com campo vazio, relatório com dado”. Não significa que todos os consumidores ignorem equivalências.

O helper antigo `listarOperacoesGerenciaisAtivas` filtra ativos/permissões antes de escolher a cópia válida. No teste, desativar a cópia do cliente permite que o modelo global ativo apareça novamente. O helper mais novo `AtivasDaConta` já trata essa precedência de maneira diferente. Dois caminhos com o mesmo propósito continuam produzindo listas distintas.

Campos opcionais apagados no formulário são enviados como `undefined`; a serialização os omite em vez de enviar `null`. A conta contábil antiga permanece salva. `atualizarOperacaoGerencial` trata erro, mas não confirma linha afetada: atualização de ID inexistente conclui sem erro no teste.

Na reclassificação de NF processada, NF, CP e títulos de empresa são alterados em chamadas separadas (`app/api/fiscal/reclassificar-nf/route.ts`). Se a segunda falha, o endpoint retorna erro, mas a NF já ficou com OG nova e o CP com a antiga. Também não valida a conta da OG/centro de custo informados antes de escrever com a chave de serviço; ver SEG-03.

### 3.2. Classificação gerencial não fecha a classificação fiscal/contábil

O campo de “tipo LCDPR” da OG usa opções que não correspondem diretamente aos códigos documentais oficiais; o exportador usa seu próprio mapeamento e não o consome. Campos e planos com nomes parecidos geram expectativa de controle sem governar o resultado final.

Das 547 OG referenciadas nos lançamentos, 523 estão no escopo da conta e 24 são globais; 413 não têm o par débito/crédito completo. Uma OG gerencial não precisa obrigatoriamente ser uma partida contábil pronta. A falha é a exportação assumir esse vínculo sem garantir sua existência ou explicitar a limitação.

### 3.3. O arquivo apresentado como SPED ECD não é uma ECD consistente

**Prioridade P1 — ECD-01.** `app/fiscal/sped-contabil/page.tsx` declara leiaute `10` e coloca movimentos em `I150/I155`. Esses registros são de saldos periódicos; os lançamentos e partidas pertencem a `I200/I250`. Além disso, o formatador usa ponto decimal. O manual oficial atualizado em janeiro de 2026 mantém leiaute 9 e define vírgula para os campos monetários. Esses erros foram confirmados pela geração real em memória e confronto documental. [Manual oficial ECD 9 — janeiro/2026](https://www.gov.br/sped/pt-br/assuntos/escrituracoes-digitais/ecd/manuais-e-documentos-tecnicos/manual_de_orientacao_da_ecd_leiaute_9_janeiro_2026.pdf).

Há problemas anteriores à serialização: consulta por `data_lancamento` e exportação por `data_baixa`, exclusão apenas de status `em_aberto`, leituras sem paginação completa/tratamento de erro e busca de OG somente por fazenda. Esta última ignora justamente as OG da conta e globais. Reproduzindo a seleção da tela para 2026 na base, os **60 lançamentos selecionáveis têm OG fora do escopo dessa busca**; 54 também não têm contas débito/crédito completas. Nenhum dos 60 estava cancelado ou não pago na amostra, embora o filtro permita isso em outros dados.

Ajustar somente o número do leiaute não resolve. É necessário definir origem contábil, período, saldos, partidas, plano de contas, demonstrações e validação oficial. Um arquivo formado apenas de baixas financeiras não se torna escrituração completa por mudar a extensão ou o cabeçalho.

## 4. Comunicação com SEFAZ, certificados e recuperação

### 4.1. Numeração não está reservada de modo atômico

**Prioridade P1 — SEF-01, SEF-02 e SEF-03.** NF-e e CT-e leem um contador de JSON e fazem update separado; o retorno da escrita nem sempre é conferido. MDF-e calcula o número antes do envio e o avança posteriormente. Não há reserva única por emitente/modelo/série/ambiente e documento.

Dois pedidos simultâneos receberam número 10 no teste NF-e. CT-e continuou com número 10 após erro simulado na gravação do contador. Dois rascunhos MDF-e receberam o mesmo número. Isso cria colisão, rejeição e tentativas difíceis de rastrear. Uma emissão rejeitada pode exigir tratamento de número; o ajuste não deve simplesmente decrementar contador nem reutilizar sequência sem conferir a situação fiscal.

### 4.2. Autorização externa e sucesso local são estados diferentes

**Prioridade P1 — SEF-04 e SEF-06.** CT-e pode retornar sucesso após autorização simulada mesmo com falha no update local; o documento continuou como rascunho. Faltam estados duráveis para “enviado”, “resultado desconhecido”, “autorizado a persistir” e recuperação idempotente.

Na NF-e assíncrona, `103` desencadeia uma espera e uma única consulta. Se o retorno for `105`, termina sem preservar o recibo no resultado final. Repetir todo o processo de emissão sem antes recuperar a situação da mesma chave não é um tratamento confiável de timeout/retorno pendente.

O cancelamento externo e as reversões locais de devolução/financeiro/estoque também ocorrem em passos distintos; `reverterDevolucaoCompra` contém escritas obrigatórias sem checagem de erro. Esse último achado foi rastreado estaticamente, sem cancelar nota ou reverter estoque nesta auditoria. O cancelamento autorizado na SEFAZ não pode ser “desfeito” localmente para simular uma transação distribuída: os efeitos locais precisam de uma fila de recuperação.

### 4.3. Ainda existem caminhos de certificado/rede incompatíveis entre si

**Prioridade P1 — SEF-05, SEF-07 e SEF-08.** O carregador central já valida formato, senha, validade temporal e identidade do titular; os transmissores principais de NF-e, CT-e e MDF-e já têm verificação TLS e limite de 45 segundos. Essas melhorias estão presentes e devem ser preservadas.

Entretanto, `lib/sefaz-consulta.ts:87` ainda usa `rejectUnauthorized: false` e não define timeout/abort. A consulta carrega vários certificados válidos, mas escolhe o primeiro que abre e tenta a rede apenas com ele. Se a autenticação falhar, não chega ao segundo candidato. Não se recomenda um rodízio cego de certificados: o serviço precisa resolver a identidade/representação adequada e distinguir erro de certificado, autorização, rede e conteúdo.

No endpoint de NF-e, uma falha ao resolver o titular explicitamente escolhido é capturada e permite continuar com o módulo anterior recebido no corpo. O teste mostrou emitente anterior sendo passado ao serviço apesar do novo titular solicitado. Esse fallback deve falhar com clareza, sem trocar a identidade do documento.

O teste de conexão disponível na configuração consulta **status do CT-e em MT**, com configuração/certificado de CT-e. Esse resultado não certifica funcionamento da emissão NF-e, de outra UF ou de outro modelo. O auxiliar de consulta NF-e também usa URL de produção SVRS em parte do caminho de homologação não MT. São diferenças de código a corrigir/validar por serviço, não prova de indisponibilidade real do autorizador naquele instante.

A tabela de versões canônicas de certificado existe, mas está vazia na coleta. **Isso não significa ausência de certificados válidos**: o sistema mantém leitura das configurações legadas. Não foram baixados A1 nem abertas senhas reais, portanto não foi produzido um diagnóstico de validade de cada certificado cadastrado.

### 4.4. Distribuição pode deixar documentos para trás

**Prioridade P1 — SEF-09 e SEF-10.** `/api/cte/distribuicao` avança o último NSU mesmo quando falha ao salvar um documento recebido. O teste retornou `ok: true` e um documento contado, com zero documentos persistidos e cursor avançado. A próxima consulta normal não busca novamente o documento que ficou para trás.

O parser de `docZip` descarta o documento que não consegue descomprimir, sem devolver uma pendência estruturada. Se houver documentos legíveis na mesma resposta, a rota pode avançar além do ilegível. Se todos falharem, o `break` atual impede esse avanço; não foi atribuído ao código um comportamento mais amplo que o demonstrado. O transporte dessa distribuição não tem limite próprio de requisição.

Eventos que não são XML completo de CT-e são ignorados nesse fluxo. Isso delimita o que a sincronização atual entrega: receber documentos não equivale a manter todos os eventos/status fiscais sincronizados.

## 5. Autorização de rotas e isolamento entre clientes

**Prioridade P0 — SEG-01, SEG-02 e SEG-03.** A presença de uma chamada de autenticação na rota não garante a autorização de todos os identificadores usados depois.

| Rota | O que é validado | Lacuna reproduzida |
|---|---|---|
| Emissão CT-e | Fazenda do corpo | `cte_id` independente é atualizado por ID com chave de serviço, sem conferir sua fazenda. No laboratório, autenticação de A permitiu alterar CT-e sintético de B. |
| Emissão MDF-e | Documento indicado | `fazenda_id` independente segue para a resolução de configuração/certificado. O teste do handler aceitou contexto B com documento autorizado A; não houve transmissão completa nesse cenário. |
| Reclassificar NF | Acesso à NF e fazenda da NF | OG/centro de custo não são validados como pertencentes ao mesmo cliente antes da escrita. O teste aceitou OG sintética de B na NF de A. |

São achados do código e laboratório, não prova de acesso indevido ocorrido em produção. O serviço deve derivar o contexto a partir do registro autorizado e validar todas as referências; não confiar em pares independentes de IDs enviados pela tela.

Também há dependência ampla da permissão de acesso à fazenda, sem uma matriz uniforme de permissões por ação fiscal. A autorização de emissão/cancelamento/exportação por perfil necessita teste com sessões reais de perfis distintos; não foi presumida uma exposição efetiva apenas por inspeção.

## 6. Conferência dos documentos existentes

| Universo lido | Resultado relevante |
|---|---|
| 232 NF-e locais | 142 autorizadas, 62 rejeitadas, 27 canceladas e uma em digitação. |
| 142 NF-e autorizadas locais | 39 sem `xml_url`, 37 sem protocolo no campo examinado e cinco sem chave. Os conjuntos podem se sobrepor. |
| 92 CT-e | 80 autorizados e 12 cancelados; os 80 autorizados têm chave, protocolo e URL nos campos examinados. |
| 80 MDF-e | 58 encerrados, 17 autorizados e cinco cancelados; os 17 autorizados têm chave, protocolo e URL. |

Esses números não medem rejeições ocorridas em determinado período de implantação, nem permitem atribuir causa a um certificado. Importações, registros manuais e estruturas históricas podem explicar parte das lacunas. Ausência de URL não prova ausência do XML no Storage. Ausência de protocolo local não prova falta de autorização na SEFAZ. Os MDF-e encerrados não estão incluídos no subconjunto de 17 autorizados dessa contagem.

A correção histórica deve confrontar registro, XML, protocolo e situação consultada de cada chave, registrando a origem da evidência. Não se deve preencher chave/protocolo por aproximação, converter status em massa ou reemitir notas apenas porque o cadastro local está incompleto.

## 7. Prioridade e critério de conclusão

Primeiro: fechar lacunas de titularidade/autorização e impedir que ausência de parâmetro/erro técnico mude silenciosamente o titular ou a tributação. Corrigir o isolamento do LCDPR antes de usá-lo para uma entrega oficial.

Depois: unificar as regras fiscais efetivamente consumidas, confirmar persistência, reservar números de forma concorrente e recuperar emissões/distribuição por documento/evento. Em paralelo, reparar a semântica das OG, os campos apagáveis e os consumidores de IDs equivalentes.

ECD deve ser tratada como uma entrega contábil específica, com validação oficial e participação do responsável contábil, e não como uma alteração cosmética do exportador atual. Os históricos precisam de uma frente separada, com simulação e evidências por registro.

O detalhamento de implantação e critérios de aceite está em [PLANO-DE-CORRECAO.md](PLANO-DE-CORRECAO.md). Os cenários e referências de código estão em [EVIDENCIAS.md](EVIDENCIAS.md). A conclusão técnica de uma correção exige que esses cenários passem a afirmar o resultado correto, que a suíte existente continue passando e que a homologação cubra os dois layouts, múltiplos titulares e os serviços fiscais efetivamente usados.
