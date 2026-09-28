# Duplicidade, persistência e vínculos de registros

Análise complementar de 28/09/2026. “BP” foi interpretado como banco de dados pelo contexto do pedido.

Há falhas concretas nos quatro grupos solicitados: o sistema permite algumas duplicidades, pode retirar da tela registros que não foram excluídos, pode exibir alterações não persistidas e pode quebrar vínculos durante operações compostas.

Esta é uma análise de código e de comportamentos reproduzidos com o cliente Supabase instalado e respostas simuladas. **Não foi consultado o banco real; portanto, não há contagem de duplicatas ou identificação de registros de produção já corrompidos.** Um risco demonstrado no código não prova que a condição já ocorreu com um registro específico. Nenhum dado foi alterado.

## 1. Liberdade de duplicidade

### D01 — Insumos: duplicidade é expressamente permitida pelo usuário

[lib/db.ts:421](/Users/ginomigotto/agrofield/lib/db.ts:421)

`criarInsumo` procura nomes normalizados semelhantes na conta e pergunta se o usuário quer cadastrar mesmo assim. Se confirmar, insere outro registro. A verificação usa os registros retornados pela consulta, sem paginação explícita nesse trecho, e não constitui bloqueio atômico.

**Consequência:** duas identidades para um mesmo produto podem fragmentar estoque, custo médio e histórico. Nomes iguais também podem representar produtos legítimos diferentes; não é seguro impedir ou unir apenas pelo nome.

**Regra indicada:** definir a identidade comercial por atributos relevantes — produto, formulação/concentração, unidade e apresentação, por exemplo. Usar alerta para semelhança; bloquear a repetição da identidade definida ou exigir justificativa e permissão para exceções.

### D02 — Pessoas: proteção na criação, mas não na atualização nem contra concorrência

[lib/db.ts:1618](/Users/ginomigotto/agrofield/lib/db.ts:1618)

A criação procura CPF/CNPJ nas fazendas da conta e oferece reutilização do cadastro existente. Isso é uma proteção positiva. Porém:

- A consulta ignora `error`; uma falha pode ser interpretada como ausência de cadastro.
- Dois usuários podem consultar antes de qualquer inserção e ambos prosseguirem.
- `atualizarPessoa` não repete a validação de CPF/CNPJ: pode alterar uma pessoa para o documento de outra.
- Não foi encontrada nos SQLs examinados uma garantia de unicidade equivalente por conta e documento normalizado. Os índices efetivamente instalados precisam ser consultados.

**Regra indicada:** documento normalizado e escopo de conta garantidos no servidor/banco, contemplando cadastros sem documento e as exceções reais do negócio. Não usar a mesma regra automaticamente para produtores: um CPF pode participar de arranjos distintos, que precisam de modelagem própria.

### D03 — CP/CR: verificação parcial no formulário, sem garantia universal

[validação na tela](/Users/ginomigotto/agrofield/app/financeiro/pagar/page.tsx:1063), [buscarLancamentoDuplicado](/Users/ginomigotto/agrofield/lib/db.ts:889), [inserção por API](/Users/ginomigotto/agrofield/app/api/lancamentos/route.ts:18)

A tela bloqueia quando encontra o mesmo fornecedor e número de documento na mesma fazenda, desconsiderando cancelados. Sem pessoa ou documento, não verifica. Erro de consulta resulta em ausência de duplicata. Outras inserções por API não passam necessariamente por esse formulário.

**Consequência:** há proteção de interface, mas ela não cobre concorrência, falha de consulta, documento repetido em outra fazenda da conta ou caminhos alternativos de criação.

**Regra indicada:** idempotência da origem. Parcelas legítimas de um mesmo documento precisam de número de parcela/identidade própria; um UNIQUE ingênuo só por fornecedor e documento impediria parcelamentos válidos.

### D04 — Contratos: confirmação concorrente pode gerar dois CRs

[app/api/contratos/confirmar/route.ts:77](/Users/ginomigotto/agrofield/app/api/contratos/confirmar/route.ts:77)

O número é calculado por `count + 1`, e o CR é criado depois de observar `lancamento_cr_id` vazio. Duas chamadas podem observar o mesmo estado. Excluir um contrato numerado também torna `count + 1` inadequado para reservar números.

**Regra indicada:** número reservado atomicamente e confirmação transacional com origem financeira única. Nova chamada para o mesmo evento deve recuperar o resultado anterior.

### D05 — Parcelamento pode ficar incompleto; reenviar pode repetir as primeiras parcelas

[lib/db.ts:942](/Users/ginomigotto/agrofield/lib/db.ts:942)

`criarParcelamento` gera um agrupador novo e insere cada parcela separadamente. Se a quarta falhar, as três primeiras não são revertidas. Uma nova chamada gera outro agrupador e pode inserir novamente essas parcelas. Dependendo do consumidor, a verificação de duplicidade pode bloquear a tentativa de recuperação sem completar as faltantes.

**Regra indicada:** criar o conjunto em transação, com chave estável da solicitação e unicidade por origem/parcela. Testar falha na parcela intermediária.

### D06 — Fatura de cartão: cabeçalho único não impede somar a mesma operação duas vezes

[lib/db.ts:7290](/Users/ginomigotto/agrofield/lib/db.ts:7290), [uso na baixa](/Users/ginomigotto/agrofield/app/financeiro/pagar/page.tsx:737), [UNIQUE da fatura](/Users/ginomigotto/agrofield/supabase_migrations.sql:11132)

Existe UNIQUE de cartão/mês/ano e upsert do cabeçalho. Entretanto, a função incrementa o valor da fatura a cada chamada e só depois vincula o lançamento. Não verifica ali se aquela operação já foi incorporada. O update do vínculo ignora erros.

A baixa do título acontece antes da vinculação à fatura. Se essa segunda etapa falhar, o título pode estar baixado sem vínculo. O fallback para RPC ausente também é ineficaz: `.throwOnError()` lança antes de executar `if (errUpd)`. Não foi localizada a criação de `incrementar_fatura_cartao` nos SQLs examinados; a existência no banco precisa ser confirmada.

**Regra indicada:** evento de pagamento/cartão com ID próprio, inclusão única e total derivado/reconciliado; baixa e vínculo na mesma operação transacional. Pagamentos parciais legítimos precisam continuar possíveis.

## 2. Exclusão que acontece na tela, mas pode não acontecer no banco

### E01 — Hedge, parâmetros fiscais e classificação ignoram o erro de exclusão

Exemplos concretos:

| Tela | Trecho | Comportamento |
|---|---|---|
| Hedge — fixações | [linha 586](/Users/ginomigotto/agrofield/app/comercial/hedge/page.tsx:586) | `.delete().then(() => setFixacoes(...))` sem inspecionar resultado |
| Hedge — curvas | [linha 1095](/Users/ginomigotto/agrofield/app/comercial/hedge/page.tsx:1095) | Remove da lista na resolução da chamada, mesmo com `error` |
| Hedge — despesas | [linha 1133](/Users/ginomigotto/agrofield/app/comercial/hedge/page.tsx:1133) | Mesmo padrão |
| Parâmetros — NCM | [linha 823](/Users/ginomigotto/agrofield/app/configuracoes/modulos/page.tsx:823) | Aguarda DELETE, ignora erro e filtra o estado local |
| Parâmetros — operação fiscal | [linha 853](/Users/ginomigotto/agrofield/app/configuracoes/modulos/page.tsx:853) | Mesmo padrão |
| Classificação automática | [linha 218](/Users/ginomigotto/agrofield/app/configuracoes/classificacao/page.tsx:218) | Mesmo padrão |

**Reprodução em homologação:** provocar uma rejeição por FK/permissão e excluir. A tela pode retirar a linha; ao recarregar, ela reaparece. Um erro de rede lançado como exceção tem comportamento diferente: o achado refere-se principalmente ao erro devolvido no objeto de resposta.

**Correção:** verificar `error` e os IDs efetivamente excluídos antes de alterar a lista. Se usar atualização otimista, reverter o estado e avisar quando o servidor não confirmar.

### E02 — Abastecimento pode desaparecer da tela com estoque divergente

[app/estoque/abastecimento/page.tsx:286](/Users/ginomigotto/agrofield/app/estoque/abastecimento/page.tsx:286)

A exclusão remove pendências/CP, repõe estoque da bomba e exclui o abastecimento em chamadas independentes. Nenhuma dessas respostas é verificada nesse fluxo. O estoque e a lista são atualizados localmente mesmo que alguma etapa falhe.

**Cenário:** a reposição da bomba tem sucesso, o DELETE do abastecimento falha e a tela o oculta. Depois de recarregar, o usuário exclui novamente e pode repor o combustível outra vez. A reposição também usa o saldo carregado na tela, que pode estar desatualizado.

**Correção:** estorno único, atômico e calculado no banco, com proteção para CP já pago/conciliado e confirmação das quantidades afetadas.

### E03 — Arrendamentos e parcelas são removidos visualmente apesar de falhas intermediárias

[app/contratos/arrendamento/page.tsx:831](/Users/ginomigotto/agrofield/app/contratos/arrendamento/page.tsx:831)

As rotinas excluem cargas, contratos e parcelas; depois filtram os estados React e retornam `true` sem inspecionar as respostas de escrita. A consulta que detecta embarque também não trata seu erro como bloqueio.

**Consequência:** aparente exclusão total com dados remanescentes, ou exclusão parcial com perda de filhos e permanência do pai.

**Correção:** validação de bloqueios e exclusão/estorno no servidor em uma transação, com resultado detalhado e erro que não seja confundido com lista vazia.

### E04 — Verificar apenas `error` ainda não prova que a linha foi excluída

[excluirLancamento](/Users/ginomigotto/agrofield/lib/db.ts:906), [excluirFazenda](/Users/ginomigotto/agrofield/lib/db.ts:185)

Essas funções tratam erros explícitos, o que é melhor que E01. Porém, não verificam a quantidade/identidade de linhas afetadas. Um filtro que não encontra a linha pode retornar sucesso com zero exclusões; políticas de visibilidade também podem produzir esse resultado dependendo da configuração.

**Correção:** obter a linha/ID excluído ou contagem confiável no escopo autorizado. Distinguir “excluído”, “já ausente” e “não autorizado” sem vazar dados de outra conta. Reconciliar a tela após a operação.

## 3. Registros ou alterações apenas na tela

### T01 — Previsões da rota `/financeiro` não são persistidas

[estado inicial](/Users/ginomigotto/agrofield/app/financeiro/page.tsx:225), [salvarPrevisao](/Users/ginomigotto/agrofield/app/financeiro/page.tsx:382)

O botão de salvar gera um UUID e faz apenas `setPrevisoes`. Não grava no Supabase nem em armazenamento local nesse fluxo. As previsões entram nos totais da página e suas exclusões também são apenas locais. Recarregar/desmontar a página perde essas previsões.

**Distinção:** converter uma previsão em CP chama `criarLancamento`, que persiste. Este achado é da rota específica `/financeiro`; não deve ser generalizado às simulações de outras páginas.

**Correção:** persistir previsões por conta com estado próprio ou identificar explicitamente a ferramenta como simulação temporária antes de aceitar entrada de dados.

### T02 — Área plantada do talhão pode aparecer salva sem UPDATE executado

[lib/db.ts:201](/Users/ginomigotto/agrofield/lib/db.ts:201), [uso na tela](/Users/ginomigotto/agrofield/app/cadastros/page.tsx:1664)

Se a RPC `set_talhao_area_plantada` falhar, o fallback constrói um UPDATE sem `await` nem `.then()`. No cliente instalado, a requisição é executada ao consumir o objeto thenable; construir o builder sozinho não envia a escrita. A criação devolve o valor informado pelo usuário, e a edição mescla o payload no estado local.

**Consequência:** o talhão pode existir no banco, mas a área plantada mostrada na tela diverge. Não é correto dizer que o talhão inteiro não foi criado: a falha específica está nesse campo.

**Correção:** aguardar e validar o fallback; retornar os valores confirmados pelo banco, não os valores presumidos pelo formulário.

### T03 — Alterar regra e salvar operação fiscal podem aparentar sucesso sem persistência

[toggle de classificação](/Users/ginomigotto/agrofield/app/configuracoes/classificacao/page.tsx:213), [salvar operação](/Users/ginomigotto/agrofield/app/configuracoes/modulos/page.tsx:843)

O toggle muda `ativo` localmente sem validar o UPDATE. O formulário de operação fiscal ignora erro de INSERT/UPDATE e fecha o modal após a tentativa de recarga.

**Distinção:** no segundo caso pode haver descarte silencioso do formulário, não necessariamente uma linha fictícia na lista, pois existe uma consulta posterior. Ambos falham em informar com segurança se o comando foi aplicado.

**Correção:** só concluir a ação após confirmação de persistência; manter os dados preenchidos e apresentar o erro quando a gravação falhar.

## 4. Registros quebrados, incompletos ou com identidade perdida

### Q01 — Salvar produtor recria as IEs e quebra referências aos IDs anteriores

[formulário](/Users/ginomigotto/agrofield/app/cadastros/page.tsx:1222), [salvarIEsDoProdutor](/Users/ginomigotto/agrofield/lib/db.ts:1463), [FK de contratos](/Users/ginomigotto/agrofield/supabase_migrations.sql:7316), [FK de arrendamentos](/Users/ginomigotto/agrofield/supabase_migrations.sql:10256), [configuração fiscal por IE](/Users/ginomigotto/agrofield/lib/nfe/index.ts:149)

O formulário não envia os IDs das IEs existentes. A função apaga todas as IEs do produtor e insere novamente, gerando novos UUIDs. Nos SQLs, contratos e arrendamentos referenciam IE com `ON DELETE SET NULL`; a configuração fiscal incorpora o UUID antigo no texto de `modulo` (`__ie_<id>`).

**Consequência quando essas definições estão instaladas:** mesmo salvar sem alterar o número da IE pode limpar vínculos fiscais e deixar configurações sem a IE correspondente. Se DELETE/INSERT falharem, os erros são ignorados e o modal fecha; pode haver perda, duplicação ou alteração não aplicada.

**Correção prioritária:** preservar IDs; atualizar IEs existentes, inserir somente novas e inativar/remover apenas as explicitamente excluídas. Executar em transação e proteger IEs já usadas. Reconciliar configurações antigas por identidade fiscal validada, sem adivinhar vínculos pelo nome.

### Q02 — Substituir filhos com DELETE + INSERT pode deixar o pai vazio ou duplicar filhos

[salvarItensContrato](/Users/ginomigotto/agrofield/lib/db.ts:1292), [salvarCessaoDebitos](/Users/ginomigotto/agrofield/lib/db.ts:1314), [excluirContrato](/Users/ginomigotto/agrofield/lib/db.ts:1243)

O DELETE inicial não é verificado e não compartilha uma transação com a próxima escrita. Se excluir e a reinserção falhar, o contrato perde itens. Se a exclusão falhar e a inserção for permitida, podem coexistir itens antigos e novos, sujeito às constraints reais. Na exclusão de contrato, os itens podem desaparecer antes de o DELETE do pai ser recusado por outra dependência.

**Correção:** gravar o agregado em transação e preservar IDs de filhos quando outras entidades dependem deles.

### Q03 — Excluir pessoa pode romper vínculos antes de a exclusão falhar

[lib/db.ts:1654](/Users/ginomigotto/agrofield/lib/db.ts:1654)

A função limpa `pessoa_id` em contratos financeiros, contratos, NF de entrada e `prestador_id` em NF de serviço antes de excluir a pessoa. As limpezas não têm erro tratado nem rollback.

**Cenário:** uma dependência adicional impede a exclusão final; a pessoa continua cadastrada, mas alguns documentos já perderam o vínculo. São registros semanticamente quebrados mesmo sem FK órfã.

**Correção:** inativar pessoas com histórico ou executar migração de vínculos explicitamente autorizada. Não limpar referências apenas para contornar restrições de exclusão.

### Q04 — Operação de campo pode ser considerada sincronizada sem seus itens

[app/api/campo/sync/route.ts:55](/Users/ginomigotto/agrofield/app/api/campo/sync/route.ts:55)

Pulverização/adubação grava cabeçalho e depois itens. Se os itens falham, o cabeçalho permanece com `origem_op_id`. Na tentativa seguinte, a existência do cabeçalho encerra o processamento como sucesso, sem recuperar os itens.

**Correção:** idempotência por agregado completo, com transação ou estado de processamento retomável. A existência de UNIQUE em `origem_op_id` é positiva, mas não prova que os filhos tenham sido gravados.

### Q05 — Limpeza de “duplicados” pode apagar registros legítimos ou pagos

[app/api/bi/excluir-duplicatas/route.ts:51](/Users/ginomigotto/agrofield/app/api/bi/excluir-duplicatas/route.ts:51)

A rotina agrupa por contrato financeiro, vencimento, categoria, valor e tipo. Mantém o mais antigo e apaga os demais. Não consulta número da parcela, origem única, status de pagamento ou conciliação para decidir qual preservar.

**Consequência:** semelhança de campos é tratada como prova de duplicidade. Um título pago mais recente pode ser apagado, se as constraints permitirem; duas obrigações legítimas podem compartilhar os mesmos valores.

**Correção prioritária:** não usar essa limpeza como reparo automático geral. Classificar candidatos, examinar pagamento/origem/vínculos e aplicar fusão ou estorno rastreável após validação. Não apagar por menor `created_at` apenas.

## Proteções existentes que devem ser preservadas

- `nf_importadas_sieg` tem UNIQUE por fazenda/chave de acesso no [SQL](/Users/ginomigotto/agrofield/supabase_migrations.sql:4263). Isso protege essa tabela/escopo; não demonstra proteção universal em todas as tabelas de notas.
- Faturas têm UNIQUE por cartão/mês/ano. O problema D06 está nos efeitos posteriores, não na ausência desse índice.
- Operações offline web possuem índices únicos de `origem_op_id` na [migração](/Users/ginomigotto/agrofield/supabase_migrations.sql:12056). Ainda é necessário garantir completude dos filhos.
- Algumas exclusões, como `excluirRomaneio`, verificam HTTP/erro. Isso não torna transacional a exclusão com o recálculo do contrato no servidor.

## O que considerar duplicado

| Registro | Identidade/regra a definir | Não basta comparar |
|---|---|---|
| Pessoa | Conta + documento normalizado, com política para exceções | Nome |
| Insumo | Identidade comercial, unidade/apresentação e atributos relevantes | Nome normalizado apenas |
| NF-e | Chave de acesso válida + escopo de escrituração/empresa | Número isolado |
| Título | Origem + parcela + natureza do efeito financeiro | Valor e vencimento |
| Pagamento | ID único do evento e referência externa quando existir | Valor/data apenas |
| Operação offline | UUID estável da operação completa | UUID só do cabeçalho |
| IE | Identidade fiscal e contexto do titular, preservando UUID | Apagar/recriar para atualizar |

UUID novo impede colisão da chave primária, mas **não impede duplicar o mesmo fato de negócio**.

## Verificações executadas e conclusão operacional

Foram executadas três verificações com o cliente Supabase instalado e `fetch` simulado, sem conexão externa:

1. UPDATE construído sem `await/then` não dispara requisição: confirmado.
2. DELETE com resposta de erro ainda executa `.then()` se o callback não verificar `error`: confirmado.
3. DELETE com zero linhas retornadas pode ter `error = null`: confirmado.

Essas verificações demonstram os mecanismos; não substituem testes completos das telas. Não foi necessário recompilar a aplicação, pois somente este relatório foi criado.

Para determinar quais dados **já estão afetados**, falta consultar o banco em modo leitura: constraints/índices/triggers ativos; títulos repetidos por origem; parcelamentos com menos itens que o previsto; contratos/arrendamentos sem IE apesar de histórico; configurações `__ie_` sem IE existente; operações sincronizadas sem itens; saldo da fatura versus eventos vinculados; pessoas/documentos desvinculados. Quantidades e nomes não podem ser inferidos dos comentários do código.

Prioridade de correção: **Q01 e Q05**, depois **E02/E03 e Q02/Q03**, seguidos de **D04–D06/Q04**, **T01–T03** e padronização de todas as mutações. Cada operação deve distinguir quatro resultados: aplicada, rejeitada, já aplicada e resultado desconhecido. Timeout exige reconciliação antes de reenviar; não deve ser tratado automaticamente como “não gravou”.
