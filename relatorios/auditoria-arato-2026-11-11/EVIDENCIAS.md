# Evidências e reexecução

Prioridades: **P0** = tratar antes de ampliar uso do caminho afetado; **P1** = integridade financeira/operacional ou confirmação errada; **P2** = consistência de interface, escala e manutenção. Prioridade não é uma afirmação de prejuízo já ocorrido.

## Cenários reproduzidos

As funções foram extraídas das fontes reais com a API de TypeScript. Banco, relógio e chamadas externas foram controlados no laboratório. Os controles de acesso simulados liberam apenas a origem indicada no cenário; os testes de referência relacionada demonstram a ausência de validação do destino dentro do handler, sem acessar dados reais.

| Cenário | Prioridade | Evidência no código | Resultado reproduzido / ajuste necessário |
|---|---|---|---|
| AUD-01 | P1 | [lib/financeiro/titulos.ts:34](/Users/ginomigotto/agrofield/lib/financeiro/titulos.ts:34); uso em [app/financeiro/relatorios/page.tsx:2107](/Users/ginomigotto/agrofield/app/financeiro/relatorios/page.tsx:2107) | Cancelado antigo vira vencido. Preservar estados terminais antes de calcular vencimento. |
| AUD-02 | P1 | [app/financeiro/pagar/page.tsx:132](/Users/ginomigotto/agrofield/app/financeiro/pagar/page.tsx:132), `:1248`, `:1309` | Natureza real continua previsão por causa da origem. Separar origem histórica de natureza atual. |
| AUD-03 | P1 | [app/api/compras/gerar-cp/route.ts:45](/Users/ginomigotto/agrofield/app/api/compras/gerar-cp/route.ts:45) | Falha de update devolve HTTP 200/ok. Conferir erro e linha atualizada. |
| AUD-04 | P0 | [app/api/compras/gerar-cp/route.ts:32](/Users/ginomigotto/agrofield/app/api/compras/gerar-cp/route.ts:32), `:63` | Pedido autorizado aceita fazenda de destino diferente. Derivar origem no servidor e validar todas as referências. |
| AUD-05 | P1 | [app/api/compras/gerar-cp/route.ts:92](/Users/ginomigotto/agrofield/app/api/compras/gerar-cp/route.ts:92), `:104` | CP criado sem vínculo; repetir gera segundo CP. Criar e vincular em transação com idempotência. |
| AUD-06 | P1 | [app/api/compras/nf-update/route.ts:59](/Users/ginomigotto/agrofield/app/api/compras/nf-update/route.ts:59) | Zero linhas afetadas, porém `updated: 1`. Retornar contagem real e conflito explícito. |
| AUD-07 | P1 | [lib/db.ts:834](/Users/ginomigotto/agrofield/lib/db.ts:834), `criarMovimentacaoManual` | Movimento recusado termina sem erro. Confirmar inserção e preservar consistência do estoque. |
| AUD-08 | P1 | [lib/db.ts:2275](/Users/ginomigotto/agrofield/lib/db.ts:2275); chamadas em [app/fiscal/esocial/page.tsx:215](/Users/ginomigotto/agrofield/app/fiscal/esocial/page.tsx:215) e [app/cadastros/page.tsx:2429](/Users/ginomigotto/agrofield/app/cadastros/page.tsx:2429) | Contador de salários sobe apesar de insert recusado. Não confundir essa rotina paralela com o fechamento principal. |
| AUD-09 | P0 | [app/fiscal/esocial/page.tsx:203](/Users/ginomigotto/agrofield/app/fiscal/esocial/page.tsx:203) | Protocolo baseado em relógio e status transmitido sem chamada externa. Usar recibo oficial ou identificar a função como preparação/simulação. |
| AUD-10 | P1 | [app/api/financeiro/baixar/route.ts](/Users/ginomigotto/agrofield/app/api/financeiro/baixar/route.ts), ramo `baixar` | Valor negativo chega à persistência. Validar número finito/positivo no servidor e restrição compatível no banco. |
| AUD-11 | P1 | [app/api/financeiro/baixar/route.ts](/Users/ginomigotto/agrofield/app/api/financeiro/baixar/route.ts), ramo `reabrir`; [app/api/empresa-lancamentos/baixar/route.ts:64](/Users/ginomigotto/agrofield/app/api/empresa-lancamentos/baixar/route.ts:64) | Estorno conserva encargos no produtor e limpa na empresa. Definir semântica única e preservar histórico do pagamento. |
| AUD-12 | P1 | [app/api/financeiro/baixar/route.ts](/Users/ginomigotto/agrofield/app/api/financeiro/baixar/route.ts), cálculo `jaPago + valor_pago_agora` | Duas baixas confirmadas perdem uma soma. Trava/CAS e requisição idempotente. |
| AUD-13 | P1 | [lib/financeiro/previsoes-server.ts:128](/Users/ginomigotto/agrofield/lib/financeiro/previsoes-server.ts:128) | Consumo inserido antes da falha de atualização; reenvio duplica. Transação e chave única da efetivação. |
| AUD-14 | P1 | Mesmo consumo; `supabase_migrations.sql:16947` | Duas solicitações usam o mesmo saldo. Revalidar estado sob trava. |
| AUD-15 | P2 | [lib/auditoria/saude/regras.ts:196](/Users/ginomigotto/agrofield/lib/auditoria/saude/regras.ts:196); view em `supabase_migrations.sql:12393` | Auditor ignora ajuste que o saldo oficial considera. Compartilhar o cálculo. |
| AUD-16 | P1 | [lib/financeiro/previsoes-server.ts:95](/Users/ginomigotto/agrofield/lib/financeiro/previsoes-server.ts:95) | Previsão fica gravada quando a criação do CP falha. Persistência conjunta. |
| AUD-17 | P2 | [app/financeiro/pagar/page.tsx:1248](/Users/ginomigotto/agrofield/app/financeiro/pagar/page.tsx:1248) | Vazio vira undefined e some do JSON; valor antigo permanece. PATCH com null explícito. |
| AUD-18 | P2 | [app/financeiro/previsoes/page.tsx:143](/Users/ginomigotto/agrofield/app/financeiro/previsoes/page.tsx:143); [components/SelectBusca.tsx:73](/Users/ginomigotto/agrofield/components/SelectBusca.tsx:73) | Deduplicação elimina ID salvo; rótulo desaparece. Preservar referência histórica e identidade das opções. |
| AUD-19 | P1 | [app/financeiro/pagar/page.tsx:429](/Users/ginomigotto/agrofield/app/financeiro/pagar/page.tsx:429); padrão análogo no CR | Resposta antiga de borderôs substitui o cliente atual. Geração/abort por contexto em todas as cargas relacionadas. |
| AUD-20 | P2 | [lib/db.ts:1345](/Users/ginomigotto/agrofield/lib/db.ts:1345), `:1358`, `:1370` | Com teto 1000, lista 1001 devolve 1000. Paginar com ordem estável; ocorrência atual por esse limite não comprovada. |
| AUD-21 | P0 | [app/api/campo/abastecimento-acao/route.ts:72](/Users/ginomigotto/agrofield/app/api/campo/abastecimento-acao/route.ts:72) e consultas seguintes | Autoriza fazenda enviada, usa dono da bomba sem validar. Conferir bomba, abastecimento, máquina e demais referências. |
| AUD-22 | P1 | Mesmo endpoint, ramo `editar`, a partir de `:102` | Abastecimento muda para 200 L e movimento fica 100 L. Vínculo explícito e edição transacional dos movimentos. |
| AUD-23 | P2 | [app/api/folha/salvar/route.ts:763](/Users/ginomigotto/agrofield/app/api/folha/salvar/route.ts:763), antes do retorno de `simular` | Simulação de reprocessamento grava vínculo de encargo. Simulação não pode executar escrita. |
| AUD-24 | P1 | [app/api/folha/salvar/route.ts:859](/Users/ginomigotto/agrofield/app/api/folha/salvar/route.ts:859) | Falha no segundo salário deixa o primeiro efetivado e folha em rascunho. Fechamento atômico com trava da folha. |
| AUD-25 | P1 | [app/api/asaas/webhook/route.ts:55](/Users/ginomigotto/agrofield/app/api/asaas/webhook/route.ts:55) e atualizações seguintes | Evento recebe HTTP 200 apesar de falha de persistência. Inbox durável e confirmação após commit. |
| AUD-26 | P1 | Mesmo webhook, ramos de pagamento/atraso | Entrega fora de ordem regride conta paga para inadimplente. Ordenação/versionamento ou reconciliação com origem. |
| AUD-27 | P2 | [app/financeiro/pagar/page.tsx:496](/Users/ginomigotto/agrofield/app/financeiro/pagar/page.tsx:496); controles de colunas em `:2262` | Filtro permanece ao ocultar coluna. Mostrar todos os filtros ativos ou remover com feedback explícito. |

As linhas são referências da coleta. Alterações simultâneas podem deslocá-las; os nomes de função e ramos identificam o ponto mesmo após deslocamento.

## Constatações por revisão de código / consulta, sem reprodução integral do incidente

| ID | Prioridade | Evidência | Limite da conclusão |
|---|---|---|---|
| REV-01 | P1 | [lib/db.ts:3046](/Users/ginomigotto/agrofield/lib/db.ts:3046) e `:3327`, processamento de NF | Existem múltiplas chamadas para estoque/apropriação/CP/status. Não se forçou uma NF real a falhar no final. |
| REV-02 | P1 | [app/financeiro/relatorios/page.tsx:423](/Users/ginomigotto/agrofield/app/financeiro/relatorios/page.tsx:423) e `:443` | PJ pode virar lista vazia em erro, e a carga externa engole erro. Não foi medida uma omissão real em relatório do cliente. |
| REV-03 | P1 | [lib/cte/index.ts:438](/Users/ginomigotto/agrofield/lib/cte/index.ts:438); [lib/mdfe/index.ts:430](/Users/ginomigotto/agrofield/lib/mdfe/index.ts:430) | Erros de armazenamento/status após autorização seguem para log. Não foi emitido documento real no ensaio. |
| REV-04 | P1 | [lib/nfe/transmitter.ts:148](/Users/ginomigotto/agrofield/lib/nfe/transmitter.ts:148) | Sem timeout próprio; verificação TLS desativada para `.gov.br`. Não foi realizado ataque nem desligada validação nesta auditoria. |
| REV-05 | P2 | [lib/sieg.ts:46](/Users/ginomigotto/agrofield/lib/sieg.ts:46), `:246`; [lib/asaas.ts:17](/Users/ginomigotto/agrofield/lib/asaas.ts:17) | Limite de espera de retry não limita duração da requisição. JWT não é invalidado por 401 no helper. Não atribui incidentes concretos ao fornecedor. |
| REV-06 | P2 | [app/admin/dados/page.tsx:63](/Users/ginomigotto/agrofield/app/admin/dados/page.tsx:63), `:73`, `:99` | Hooks depois de retorno condicional. Lint confirma violação; transição de perfil no navegador não foi exercitada. |
| REV-07 | P1 | [lib/auditoria/saude/executar.ts:29](/Users/ginomigotto/agrofield/lib/auditoria/saude/executar.ts:29), `:46` | Timeout do coletor reproduzido em leitura; cinco falhas nas últimas dez execuções gravadas. |
| REV-08 | P2 | Mesmo coletor, mapeamento PJ e contagens | Cotação/linhagem anuladas; contagem não é prova de paridade. Comparação independente por campos teve zero divergências. |
| REV-09 | P2 | `package.json`, comando `test`; testes de interface fora do comando | 14 arquivos fora da suíte habitual. Três casos falham pelo modo de invocar componente com hooks. |
| REV-10 | P2 | `supabase_migrations.sql` e retornos compatíveis com schema antigo | Aplicação aceita esquemas diferentes em vários caminhos. Disponibilidade e versão de todas as migrations em produção não foram certificadas. |

## Comandos de reexecução sem banco real

Executar na raiz do projeto, com as dependências já instaladas:

```sh
node relatorios/auditoria-arato-2026-11-11/ferramentas/inventario.mjs
node --test relatorios/auditoria-arato-2026-11-11/ferramentas/reproducoes.test.mjs relatorios/auditoria-arato-2026-11-11/ferramentas/verificacoes-sql.test.mjs
node --import ./relatorios/auditoria-arato-2026-11-11/ferramentas/loader.mjs --test relatorios/auditoria-arato-2026-11-11/ferramentas/componentes.test.tsx
npm test
npm run build
```

Os testes de reprodução **passam quando demonstram o comportamento defeituoso atual**. Depois da correção, devem ser convertidos em regressões que afirmem o comportamento esperado. Não adicionar as asserções atuais à barreira de publicação como se legitimassem o defeito.

O carregador TS/TSX serve apenas ao laboratório. Não muda a configuração de compilação, imports ou runtime do aplicativo. Os testes com banco real/serviços externos não devem ser misturados a esses comandos.

## Arquivos de dados

- `dados/resumo.json`: inventário e candidatos estáticos; não é uma contagem de bugs.
- `dados/rotas.json`: métodos e sinais encontrados por arquivo de API.
- `dados/consultas.json`: chamadas de leitura/escrita e localização.
- `dados/funcoes.json`, `dados/sinais.json`: índices de revisão.
- `dados/reproducoes.json`: resultado dos 27 cenários, sem dados reais.
- `dados/conferencia-resumo.json`: regras existentes aplicadas à base atual sem varredura histórica de exclusões.
- `dados/conferencia-cruzada.json`: comparação financeira por campos, previsão, borderôs e estoque.
- `dados/alertas-qualificados.json`: classificação dos alvos de conferência.
- `dados/validacao.json`: resultados de execução e delimitação das versões examinadas.

As consultas da base atual usam chave de serviço apenas dentro dos scripts privados. Nenhum segredo foi copiado para esta pasta. Os scripts recusam POST/PATCH/DELETE; não invocam RPCs de negócio que possam gravar.
