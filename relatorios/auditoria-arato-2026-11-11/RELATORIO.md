# Auditoria técnica do Arato — 11/11/2026

O sistema apresenta falhas reais de integridade e de confirmação das operações. A dificuldade relatada pelo usuário tem sustentação no código e em reproduções: há caminhos que anunciam sucesso sem gravar, operações compostas que podem parar pela metade, regras diferentes para o mesmo conceito financeiro e filtros que continuam atuando sem indicação visível.

A prioridade é corrigir as garantias de gravação, autorização, efetivação e estorno. Melhorar apenas as telas deixaria essas causas em funcionamento.

Esta entrega contém investigação, testes e proposta de correção. Nenhuma rotina do aplicativo foi corrigida e nenhuma migration, reparação financeira, emissão fiscal ou transmissão oficial foi executada no ambiente real por esta auditoria. Os arquivos novos estão nesta pasta; as extrações com identificadores reais ficaram no diretório privado `backup/auditoria-arato-2026-11-11/`, ignorado pelo Git.

## O que foi efetivamente examinado

Foi feito inventário estático de 643 arquivos de aplicação, 181 arquivos de rotas de API e 148 páginas. Isso orientou uma revisão manual concentrada nas fronteiras entre módulos: tela → API → banco → espelho → grid/relatório, além de integrações e tarefas automáticas.

Foram executados:

- A suíte configurada no projeto e a compilação de produção.
- Os 14 arquivos de testes encontrados fora do comando habitual, com carregador adequado para TypeScript/TSX.
- **27 cenários de reprodução**, usando funções extraídas das fontes reais com dependências controladas. Não são 27 causas independentes: alguns demonstram manifestações diferentes da mesma falha.
- Dois testes adicionais em PostgreSQL isolado em memória, com o SQL real de gatilho e tabela de consumos.
- Três testes de renderização dos componentes reais: apresentação padrão, apresentação nova e seletor com valor histórico ausente das opções.
- Leituras autenticadas da base atual, com um cliente que **recusa qualquer método diferente de GET/HEAD**. O coletor que grava achados não foi chamado.

As reproduções simulam falha de banco, reenvio, respostas fora de ordem e concorrência. Demonstram o comportamento do código sob essas condições; não substituem um teste de todos os gatilhos e permissões instalados em produção. Os dois testes SQL complementam especificamente a divisão parcial e a ausência de unicidade nos consumos.

Não foi feito um percurso autenticado completo de todas as 148 telas no navegador, nem uma execução real de cada método das 181 rotas. As duas apresentações receberam verificação de componentes, não certificação integral de navegação. SEFAZ, ANTT, eSocial, Asaas e WhatsApp não receberam transmissões, pagamentos, mensagens ou eventos reais de teste. Não houve validação jurídica das regras tributárias ou trabalhistas.

O inventário e os resultados estão em [dados/](./dados/). Os cenários executáveis estão em [ferramentas/](./ferramentas/). O [plano de correção](./PLANO-DE-CORRECAO.md) define a sequência e os critérios de aceite.

| Verificação | Resultado da execução |
|---|---|
| `npm test` | 639 testes passaram. |
| 14 arquivos fora do comando habitual | 83 casos executados: 80 passaram e três falharam por invocação inadequada de componentes com hooks. |
| Laboratório de defeitos + SQL real isolado | 29 testes passaram: 27 demonstram os cenários e dois conferem o SQL. “Passar” aqui significa reproduzir o defeito, não aprovar seu comportamento. |
| Componentes nas duas apresentações | Três testes passaram, usando renderização correta. |
| Compilação de produção | Compilação, TypeScript e geração de páginas concluídos. |
| Lint | 511 erros e 563 avisos na coleta; precisam de classificação, pois não são todos falhas funcionais. |

Não foram coletados planos `EXPLAIN ANALYZE`, métricas de latência por usuário ou todos os logs históricos do runtime. A coleta paginada de estado atual levou aproximadamente 13,6 segundos para 67 requisições no conjunto de contas; isso é tempo do coletor de auditoria, não medição de abertura do grid. Não atribuo lentidão geral a uma consulta específica sem essa medição adicional.

## Diagnóstico das causas

### 1. Confirmação da interface não está vinculada à confirmação da gravação

Há chamadas Supabase em que o retorno `{ error }` é ignorado. O cliente normalmente resolve a promessa com um objeto de erro; ele não necessariamente lança uma exceção. Por isso, colocar a chamada dentro de `try/catch` não basta.

Reproduções concretas:

- Atualizar o financeiro de um pedido: banco recusa a alteração, mas a API retorna `ok: true` e HTTP 200. O valor solicitado era 200; o persistido continuou 100. **AUD-03**.
- Atualizar uma NF com um filtro que não encontra a linha: retorna `updated: 1`, embora nenhuma linha tenha sido alterada. Esse número conta campos enviados, não registros atualizados. **AUD-06**.
- Lançar movimentação manual de estoque: a inserção pode falhar e a função terminar normalmente, sem movimento registrado. **AUD-07**.
- Processar salários pela rotina acessível em Cadastros/eSocial: o contador anuncia um salário gerado mesmo com a inserção recusada. Essa é uma rotina paralela à tela principal da folha. **AUD-08**.
- Receber webhook Asaas: as atualizações podem falhar e o evento ser reconhecido com HTTP 200. **AUD-25**.

Isso explica diretamente parte dos relatos de “fiz tudo, mas não registrou”. Para cada comando, sucesso precisa significar transação concluída, identificador retornado e resultado persistido verificável.

O levantamento identificou **604 escritas com resultado ignorado**. Esse número é uma lista de candidatos para revisão, não a contagem de defeitos comprovados. Há atualizações auxiliares e limpezas que podem ter tratamento em outra camada.

### 2. Operações financeiras compostas não compartilham uma transação

Em vários caminhos, o aplicativo grava a origem, depois o título, depois o vínculo, depois o status. Cada etapa é uma chamada independente. Quando uma falha, as anteriores permanecem.

Foram reproduzidos:

- Pedido gera CP, falha ao guardar o vínculo e uma nova tentativa gera outro CP. As duas respostas anunciam sucesso. **AUD-05**.
- Previsão é criada, mas a criação do título falha; sobra a previsão sem sua representação financeira. **AUD-16**.
- Consumo da previsão é inserido antes da atualização do saldo. Se a conclusão falhar, a tentativa seguinte insere outro consumo. **AUD-13**.
- No fechamento da folha, o primeiro salário vira real, o segundo falha e a folha continua em rascunho, com salários em estados diferentes. **AUD-24**.

O processamento de NF de produtos também contém limpeza, movimentações, apropriações, financeiro e atualização final da nota em chamadas separadas. Há defesas contra duplicação e conferências de erro em partes do caminho, mas elas não tornam a operação inteira atômica. Falhar no final não desfaz automaticamente estoque e financeiro já gravados.

A rotina nova de borderô e as transações recentes de adiantamentos já oferecem padrões melhores para reaproveitar. A proposta é migrar as operações críticas gradualmente para comandos transacionais, sem reconstruir todas as telas.

### 3. Concorrência e repetição ainda podem mudar valores

Na baixa genérica do produtor, o servidor lê `valor_pago`, soma o valor recebido e grava o novo total absoluto. Não há nessa operação uma reserva do título, comparação de versão ou identificação única da solicitação.

No teste, havia 100 pagos. Duas requisições de mais 100 confirmaram sucesso. O total final foi **200**, quando deveria ser **300**. **AUD-12**. O gatilho real de divisão parcial foi exercitado separadamente: em um parcial antigo ele não impede essa atualização perdida.

No consumo de previsões, duas requisições puderam consumir 100 cada sobre uma previsão de 100. **AUD-14**. O schema real de consumos aceita repetir o mesmo vínculo previsão/lançamento; a tabela não resolve a falta de idempotência da API.

O ajuste deve incluir transação, trava da origem, revalidação do saldo dentro da trava e chave única de requisição. Impedir clique duplo no navegador ajuda a operação, mas não protege contra reenvio, duas abas ou dois usuários.

### 4. Origem e estado atual estão misturados

Na tela de CP, `ehPrevisao` considera previsão tanto `natureza = previsao` quanto `origem_lancamento = previsao`. Ao efetivar, o formulário passa a natureza para `real`, preservando a origem histórica.

Consequência: o título efetivado continua sendo reconhecido como previsão pela interface. **AUD-02**. A conferência atual encontrou **cinco títulos com essa combinação** de natureza real e origem previsão. Isso confirma a existência de registros que percorrem a condição problemática; não prova a história individual de conversão de cada um.

A origem deve registrar de onde o título veio. A natureza deve dizer se ele é previsão ou obrigação efetiva. O status de pagamento deve ser uma dimensão separada. A autorização de baixa não pode depender de uma confusão entre essas três informações.

Existem diferenças legítimas: uma previsão de folha exige fechamento; um adiantamento tem controle próprio; um pedido ainda pode representar uma projeção. Essas regras precisam ser explícitas e compartilhadas, para a experiência não variar acidentalmente entre as origens.

### 5. Status e estorno têm definições diferentes por caminho

O classificador usado nos relatórios preserva `baixado` e `parcial`, mas pode transformar `cancelado` em `vencido` conforme a data. **AUD-01**. O CP usa outro classificador, que preserva cancelado. Assim, a mesma informação pode receber classificações diferentes entre grid e relatório.

Também foi reproduzido que reabrir um título do produtor conserva juros/desconto anteriores, enquanto a rotina de empresa os limpa. **AUD-11**. Esse comportamento pode afetar saldo, nova baixa e relatórios; deve haver uma regra única sobre o que pertence ao título e o que pertence ao pagamento estornado.

A baixa do produtor aceita valor negativo até a atualização do banco. **AUD-10**. O teste com o gatilho real mostra que ele não bloqueia essa entrada. O schema local revisado não oferece uma proteção geral equivalente à validação que falta nessa API. Isso não foi tentado em produção.

### 6. Há divergência entre abastecimento e movimentação de estoque

No endpoint de edição de abastecimento, a quantidade e o total do abastecimento são alterados e a bomba recebe a diferença de litros. A movimentação de estoque correspondente não é atualizada nesse caminho.

No teste: o abastecimento passou de 100 para **200 litros**, enquanto a saída registrada no estoque permaneceu em **100 litros**. **AUD-22**. A revisão das migrations locais não encontrou um gatilho de abastecimentos que recompusesse essa movimentação nesse fluxo.

Na criação, também existem gravações relacionadas cujos erros são ignorados. Um abastecimento pode existir e a baixa do combustível falhar. A associação do combustível pelo nome da bomba/insumo merece revisão adicional: identificação textual não é uma chave confiável para apropriação.

O correto é vincular explicitamente o movimento ao abastecimento e aplicar criação, edição e estorno na mesma transação. O CP continua obedecendo à regra já definida pelo usuário: consumo não cria outra dívida, pois o financeiro nasce da compra/NF.

### 7. Valores gravados podem parecer vazios na edição

Há duas causas distintas reproduzidas:

1. Na previsão de gastos, operações gerenciais são deduplicadas por classificação e centros de custo por código/nome. Isso pode eliminar o **ID efetivamente salvo**, mantendo uma cópia de outra fazenda. O seletor procura por ID e mostra o placeholder quando não encontra a opção. O valor pode continuar correto no banco e aparecer no relatório. **AUD-18**, confirmado também na renderização do `SelectBusca` real.
2. Na edição de CP, vários campos vazios são enviados como `undefined`. A serialização JSON elimina essas propriedades. Assim, limpar centro de custo, observação ou outro campo pode preservar o valor anterior no banco. **AUD-17**.

Carregar apenas opções ativas também pode ocultar referências históricas. A edição deve carregar a opção salva, mesmo inativa, e identificá-la como histórica. Para limpar, a API deve receber `null` explícito quando o campo admitir remoção.

### 8. Grids podem receber respostas antigas e filtros invisíveis

A carga principal do CP possui controle de sequência, mas a carga auxiliar de borderôs não aplica a mesma proteção. No teste, o usuário mudou do cliente A para B; a resposta de B chegou primeiro e a de A depois. A lista terminou mostrando os borderôs de A. **AUD-19**. O padrão também exige revisão no CR e em telas com efeitos de carregamento semelhantes.

Na filtragem por coluna, ocultar a coluna não remove seu filtro. O registro continua excluído e a caixa de filtro deixa de ser exibida. **AUD-27**. A solução pode preservar o filtro, desde que ele permaneça visível em um resumo de filtros ativos; alternativamente, a ação de ocultar deve avisar e limpar esse filtro.

O relatório financeiro contém ainda um caminho que converte falha ao carregar títulos de empresa em `[]`, e um `catch` externo vazio. Isso permite uma aparência de relatório completo com a parcela de empresas ausente ou dados anteriores mantidos. **Revisão de código; não foi forçada uma indisponibilidade em produção.**

### 9. Há consultas sem paginação com limite silencioso

`listarBorderosPagos`, `listarBorderosPendentes`, `listarPagamentoLotes` e `listarContratos` não paginam. Quando o backend limita o resultado a 1.000 linhas, os registros seguintes ficam de fora sem uma indicação de incompletude.

O teste com 1.001 borderôs e teto de 1.000 retornou somente 1.000. **AUD-20**. A base consultada tinha **450 borderôs ao todo**; portanto, não atribuo a esse limite o desaparecimento atual dos borderôs. É uma falha reproduzida sob volume, com condição de ocorrência conhecida.

O inventário contém 1.069 candidatos a leitura sem limite/paginação. Consultas de cadastro pequeno, agregações ou restrições por outros campos podem ser adequadas; cada caso precisa ser classificado. Não seria correto declarar todos esses pontos defeituosos.

## Segurança e integrações

### Autorização incompleta de referências relacionadas — prioridade máxima

Dois caminhos com chave de serviço validam uma origem e utilizam uma referência de destino que não foi conferida contra o mesmo cliente:

- Gerar CP de pedido: autoriza acesso ao pedido, mas utiliza `body.fazenda_id` para criar o financeiro, sem derivá-lo do pedido ou validar a igualdade. **AUD-04**.
- Criar/editar abastecimento: autoriza a fazenda enviada, mas consulta a bomba e, na edição, o abastecimento por ID, sem conferir o proprietário desses registros. **AUD-21**.

O laboratório demonstrou que referências de fazendas diferentes chegam à gravação. A proteção de RLS não substitui essa conferência quando o cliente usa `service_role`. Não foi tentada uma alteração em cliente real nem uma exploração de produção. O alcance final deve ser validado em homologação com dois clientes e as mesmas constraints/policies de produção.

Não encontrei fundamento para afirmar que as 181 rotas estejam abertas. O inventário de autenticação foi revisado para reconhecer as guardas existentes; os quatro endpoints restantes sem sinal são preços públicos, PTAX e versão. Autenticação presente também não prova autorização correta de cada ação ou referência.

### O comando “Transmitir” de eSocial não transmite

Em [app/fiscal/esocial/page.tsx](/Users/ginomigotto/agrofield/app/fiscal/esocial/page.tsx), o comando cria um protocolo `ES` seguido de dígitos do relógio e atualiza o registro local para `transmitido`. Não há chamada ao serviço oficial nesse comando. **AUD-09**.

No teste, o status virou transmitido com **zero chamadas externas**. A consulta efetuada na produção retornou zero eventos com esse status, portanto não há evidência nesta auditoria de transmissões reais já declaradas falsamente. O defeito é alcançável no código e precisa ser tratado como prioridade máxima de confiança: retirar a promessa de transmissão ou concluir a integração e guardar recibo oficial verificável.

### Comunicação fiscal pode concluir externamente e falhar internamente

Na emissão de CT-e e MDF-e, uma autorização pode ocorrer e a gravação local de status/protocolo falhar. Esses erros são registrados no log, mas o retorno ainda pode indicar sucesso da autorização. Falha ao guardar XML também é tratada apenas por log nesses caminhos.

É correto preservar o fato de que a SEFAZ autorizou; o problema é não haver um estado operacional claro para **“autorizado externamente, persistência local pendente”**, com recuperação durável e bloqueio de reenvio até consultar a situação. Alterar simplesmente o retorno para “falhou” criaria outro risco operacional.

O transporte SOAP de NF-e não define timeout próprio nesse helper. Há também validação TLS desativada dinamicamente para hosts terminados em `.gov.br`. Isso merece correção com cadeia de confiança adequada e teste de comunicação; não basta inverter uma opção sem validar os autorizadores utilizados. O código de CT-e/MDF-e usa caminhos diferentes, o que ajuda a explicar diferenças de comportamento entre documentos.

Não foi simulada uma autorização real seguida de perda de banco, nem foram medidos incidentes do autorizador. Os achados acima são do controle do fluxo no código, não uma atribuição de toda falha externa a certificado.

### SIEG e Asaas precisam de controles distintos de falha

- SIEG: existe retry para HTTP 429, mas não há limite de duração por requisição no helper de fetch. O limite comentado de 10 segundos é uma espera entre tentativas, não timeout de rede. O JWT permanece em memória por 23 horas, sem invalidação por 401 nesse helper; rotação/revogação de credenciais exige tratamento. As credenciais usadas pelos chamadores atuais são globais; esta auditoria não concluiu vazamento de tokens entre clientes.
- Asaas: webhook com token possui proteção de entrada e recusa configuração ausente em produção. Porém, pode reconhecer erro de persistência como sucesso (**AUD-25**) e aceitar evento atrasado de inadimplência depois do pagamento, regredindo pagamento/conta (**AUD-26**, ocorrência real não comprovada).
- ANTT: o cliente revisado possui timeout de 45 segundos e evita repetição automática de gravações incertas. É um comportamento útil para uniformizar os outros conectores. Os testes adicionais locais passaram nessa área, sem comunicação real com a ANTT.
- WhatsApp/importações: foram inventariadas escritas compostas e resultados ignorados; continuam como pontos de revisão e teste específico. Não há nesta entrega prova de uma perda real causada por mensagem/importação particular.

## O que os dados atuais mostram

As consultas aconteceram com o sistema em uso. São leituras em momentos próximos, **não um snapshot transacional único**. Diferenças de contagens entre coletas podem refletir trabalho simultâneo. Para reparar registros será necessário revalidar cada alvo dentro da transação de correção.

| Conferência | Resultado | Interpretação |
|---|---:|---|
| Fontes financeiras × `rel_lancamentos` | 20.777 × 20.777; zero diferenças nos campos comparados | Não há evidência de defeito geral de espelhamento nessa coleta. Não compara todos os campos possíveis, nomes de cadastro e histórico. |
| Natureza real com origem previsão | 5 títulos | Combinação que o CP classifica incorretamente como previsão. |
| Previsões abertas com saldo | 2.550 | Zero sem título correspondente nessa coleta. A falha de criação foi reproduzida, mas não se manifestou como previsão aberta órfã nesse recorte. |
| Saldo de previsão diferente do valor do título | 8 | Seis recorrências e duas folhas; edição manual pode ser exceção autorizada. Reconciliar antes de corrigir. |
| Consumos da mesma previsão para o mesmo destino | zero grupos repetidos | A duplicação foi reproduzida em laboratório, sem ocorrência encontrada por esse critério na coleta atual. |
| Composição de borderôs sem vínculo recíproco | 59 itens em 11 borderôs | 37 apontam para título em outro lote; 16 para título ausente; seis para título sem lote. Exige revisão da família e do histórico de estornos/divisões. Não declarar todos duplicados nem apagar automaticamente. |
| Títulos com lote, mas sem item correspondente | zero | O desvio encontrado está no sentido oposto da associação. |
| Saldos negativos de estoque | 179 grupos de item/fazenda/depósito | Recalculados incluindo ajustes assinados; não equivalem a 179 perdas ou 179 produtos distintos. |
| Auditor interno, últimas dez execuções | cinco falhas | Todas as falhas consultadas registram timeout de `audit_log`. |

Na coleta anterior, as regras existentes sinalizaram ainda:

- 20 NF-e processadas sem título identificado e uma NFS-e nessa condição.
- 34 títulos com pagamento acima do valor segundo a regra do auditor; seis diferenças de até R$ 1 e 28 maiores. Todos os 34 identificados nessa classificação estavam em BRL.
- Uma NF pendente ainda ligada a título, um status financeiro suspeito e dois grupos de chave de NF repetida.
- Oito documentos classificados pelo auditor como guia lançada como NFS-e.

Esses são **alvos de conferência**, não uma demonstração de dívida omitida, pagamento indevido ou prejuízo. É necessário conferir decisão de não gerar CP, natureza da operação, apropriação, parcelas, baixa, encargos, vínculo com pedido e histórico. Não somei os valores dos alertas como “perda financeira”. A mesma operação pode participar de mais de uma regra.

Os identificadores para a conferência ficaram nas extrações privadas. Os arquivos desta pasta trazem agregados sem nomes de funcionários, CPF/CNPJ, credenciais ou identificadores reais dos títulos.

## O próprio auditor precisa de ajuste

A execução do coletor original falhou com `audit_log: canceling statement due to statement timeout`. Para conferir a base atual, foram mantidas as leituras de estado e **omitidas explicitamente as duas buscas históricas de exclusões**. Os achados históricos dependentes dessas buscas não foram certificados.

Outros limites encontrados:

- A regra de estoque negativo ignora movimentos de ajuste, embora a view oficial os considere. O cenário entrada 100, saída 150 e ajuste +100 gera saldo oficial +50 e alerta do auditor de -50. **AUD-15**. Na base atual, incluir os ajustes manteve os mesmos 179 grupos negativos; não atribuo esses alertas atuais a esse defeito sem evidência.
- O coletor de títulos de empresa preenche cotação e origem da divisão com `null`, reduzindo a qualidade de regras que dependem de câmbio e famílias de títulos.
- O teste de espelhamento do auditor compara contagens. Mesma quantidade não garante mesmos IDs ou valores. Nesta auditoria foi acrescentada uma comparação por registro/campos, que não encontrou diferenças no recorte definido.
- Falha na própria gravação da execução do auditor também não é conferida pelo executor em todos os caminhos.

O painel de saúde precisa mostrar execução incompleta, data do último sucesso e regras efetivamente avaliadas. Falha de coleta não pode parecer ausência de divergência.

## Por que as atualizações continuam introduzindo problemas

O projeto possui bons testes localizados, mas ainda não cobre de forma suficiente os contratos entre módulos. Há funções chamadas “únicas” que convivem com classificadores locais, caminhos paralelos de folha/baixa e normalizações diferentes de produtor e empresa.

A compilação não roda a suíte de testes automaticamente; o `prebuild` atual verifica integração de layout e gera compatibilidade visual. Não foi encontrado workflow de CI versionado em `.github` no recorte examinado. Isso não prova ausência de verificações configuradas fora do repositório.

Dos 118 arquivos de teste encontrados em `app/lib/components`, 104 estão no comando habitual. Ao executar os outros 14 com suporte a TSX e sintaxe TypeScript, três casos de `original-interface.test.tsx` falham por chamar componentes com hooks como funções comuns. Isso é um teste desatualizado/inadequado ao contrato atual; não é, isoladamente, uma falha da tela em produção. Os componentes passaram quando renderizados corretamente no laboratório da auditoria.

O lint também não está em condição de funcionar como barreira confiável de publicação: a coleta apontou 511 erros e 563 avisos. Muitos são de estilo/tipagem. Há, contudo, violações funcionais relevantes: em [app/admin/dados/page.tsx](/Users/ginomigotto/agrofield/app/admin/dados/page.tsx), um retorno condicionado ao perfil acontece antes de `useCallback` e `useEffect`. Se o perfil mudar durante a inicialização, a ordem de hooks muda e pode interromper a tela. Esse último caso foi identificado pelo lint e pela revisão de código; não foi reproduzido com uma sessão administrativa real.

O workspace recebeu alterações externas enquanto a auditoria estava em andamento. O início usava HEAD `6351a065`; posteriormente entraram ajustes em limpeza administrativa e CST de NF-e, e o fechamento da documentação encontrou HEAD `22270434`. Os resultados de teste devem ser lidos com seus horários: a compilação terminou antes desse último commit, portanto não o certifica. O arquivo de validação e o manifesto SHA-256 registram o recorte examinado. O endpoint público de versão retornou um deployment ID, sem hash de commit, insuficiente para identificar com certeza o código publicado.

## O que já funciona como proteção e deve ser preservado

- O espelhamento financeiro por registro estava coerente nos campos comparados.
- A suíte existente já exercita várias regras de baixa, moeda, adiantamentos, folha, fiscal e contratos.
- O borderô recente utiliza uma operação SQL atômica e fotografias de antes/depois para estorno. Isso não corrige por si só dados históricos anteriores.
- Há rotinas recentes de adiantamentos com idempotência e validação transacional. É necessário verificar a disponibilidade das migrations correspondentes antes de avaliar o comportamento publicado.
- Pedidos, adiantamentos de fornecedores e títulos em cartão podem ficar fora do CP por regra deliberada. Isso não significa exclusão do financeiro ou do Fluxo de Caixa. A tela deve explicar a situação e oferecer acesso à origem.
- As apresentações padrão e nova preservaram tabela, conteúdo e comando nos testes de componentes. A revisão de regras deve atender às duas; não deve criar duas implementações financeiras diferentes.

## Proposta de ajuste

O trabalho deve avançar em blocos com critérios verificáveis:

1. Fechar as autorizações de origem/destino e eliminar confirmações fictícias.
2. Tornar criação, efetivação, baixa e estorno operações atômicas e idempotentes, começando por financeiro, previsão, folha e abastecimento.
3. Compartilhar as regras de estado, natureza, moeda e visibilidade entre APIs, grids, relatórios e Fluxo de Caixa.
4. Corrigir hidratação dos formulários, limpeza explícita de campos, respostas antigas e filtros ocultos.
5. Criar recuperação de integrações incertas e reparar o auditor antes de usá-lo para saneamento automático.
6. Reconciliar os registros já afetados com plano por registro, simulação realmente sem escrita e validação dos valores antes/depois.
7. Exigir testes de falha, concorrência, reenvio e equivalência entre telas como condição de publicação.

O [plano detalhado](./PLANO-DE-CORRECAO.md) mantém os fluxos de operação e as duas apresentações, muda as garantias de execução e define como verificar cada bloco. Os [pontos de código e reproduções](./EVIDENCIAS.md) permitem revisar cada conclusão antes de implementar.
