# Plano de correção e critérios de aceite

Andamento em 11/11/2026: o primeiro lote de correções foi implementado localmente, sem commit. Veja [CORRECOES.md](CORRECOES.md) para o escopo efetivamente corrigido, as seções SQL 434–439, a validação e os itens que continuam pendentes. O plano abaixo continua sendo a referência completa; não está integralmente concluído.

O objetivo é recuperar confiança sem mudar novamente o fluxo de trabalho do usuário. As telas padrão e nova devem consumir os mesmos comandos e resultados. Ajustes visuais podem acompanhar os blocos, mas não devem introduzir uma segunda regra de negócio.

Atualização do banco: usuário informou a aplicação das seções 434–439. A conferência somente de leitura confirmou dez funções e as estruturas novas expostas no PostgREST. O aplicativo continua sem commit/publicação.

## Bloco 1 — Autorização e veracidade da confirmação

**Abrange:** AUD-03/04/06/07/08/09/21/25.

Derivar fazenda/conta da origem no servidor. Validar acesso a todos os registros relacionados e a compatibilidade entre seus clientes antes de qualquer escrita. A autorização deve compreender registro, ação e referências de destino, mesmo com `service_role`.

Conferir `error` em cada escrita obrigatória e exigir linha retornada. Distinguir: comando concluído; conflito/nenhuma linha; falha definitiva; resultado externo ainda a recuperar. Mostrar identificador da operação concluída. Nenhum contador de sucesso pode subir antes de confirmar persistência.

O comando atual de transmissão de eSocial deve deixar de afirmar transmissão oficial até existir integração e recibo verificável.

**Aceite:** dois clientes de teste; usuário sem acesso não lê nem altera destino; fonte A/destino B é recusado antes de gravar; falha de escrita não devolve sucesso; comando de transmissão só apresenta recibo vindo da integração.

## Bloco 2 — Transações, reenvio e concorrência

**Abrange:** AUD-05/10/12/13/14/16/24 e REV-01.

Criar comandos específicos no banco/servidor para gerar financeiro do pedido, criar/consumir previsão, fechar/reabrir folha e efetivar NF. Cada comando deve:

1. Receber uma chave de requisição estável entre tentativas.
2. Autorizar e travar a origem; reler os saldos e estados dentro da transação.
3. Validar valores finitos, positivos e compatíveis com moeda/encargos.
4. Persistir efeitos obrigatórios e vínculos na mesma transação.
5. Guardar resultado por requisição e devolvê-lo no reenvio.
6. Rejeitar a reutilização da chave com dados diferentes.

Reaproveitar o desenho de borderô/adiantamento recente. Não alterar todas as rotas de uma vez. Manter adaptadores das telas atuais para os novos comandos até concluir a equivalência.

**Aceite:** falha induzida após cada etapa não deixa saldo/vínculo parcial; duas requisições simultâneas não perdem pagamento nem consomem o mesmo saldo; repetir a solicitação devolve a mesma operação; soma de principal pago e saldo conserva o principal original.

## Bloco 3 — Regra comum do financeiro

**Abrange:** AUD-01/02/11 e coerência CP/CR/Fluxo de Caixa/relatórios.

Formalizar um único contrato para origem histórica, natureza, estado de pagamento, vencimento, moeda e visibilidade. Traduzir os vocabulários PF/PJ nas bordas. Estados cancelado/pago/cartão não podem ganhar outro significado apenas pela data.

Manter as regras já decididas: pedido e adiantamento de fornecedor têm controles próprios; o CP mostra a obrigação adequada; o Fluxo de Caixa representa a saída prevista/efetiva sem duplicar pedido, adiantamento e NF; título do cartão representa composição da fatura, sem outra saída bancária.

Estorno deve preservar valor original e histórico. Juros, multa e desconto precisam pertencer explicitamente à negociação ou ao evento de pagamento. Não limpar ou conservar esses valores por acidente dependendo da tabela de origem.

**Aceite:** mesma matriz de títulos produz os mesmos status e saldos no CP, CR, relatório, fluxo e conciliação, respeitando a finalidade de cada visão. Executar BRL/USD, pago/parcial/cancelado, previsão efetivada, cartão, pedido, adiantamento, NF parcelada e borderô.

## Bloco 4 — Estoque e apropriação rastreáveis

**Abrange:** AUD-07/22 e processamento de NF/abastecimentos.

Vincular explicitamente abastecimento → movimentação e bomba → insumo de combustível. Criação, edição e estorno devem recompor o delta correto, depósito, fazenda, máquina, safra e ciclo. Evitar buscar identidade de insumo por trechos do nome.

Manter as apropriações de NF de produtos e NFS-e coerentes com o custo bruto do serviço/mercadoria, sem duplicar custo por baixa financeira. Não alterar o modelo fiscal/tributário sem validação de negócio específica.

**Aceite:** editar 100 L para 200 L altera em exatamente 100 L a saída correspondente; editar novamente ou reenviar não duplica; estornar devolve o delta correto; NF recusada no final não deixa lançamento operacional apresentado como concluído.

## Bloco 5 — Edição, grids e filtros

**Abrange:** AUD-17/18/19/20/27 e REV-02/06.

Carregar o cadastro selecionado por ID, mesmo inativo ou fora da lista normal, com indicação histórica. Não deduplicar IDs persistidos como se fossem apenas rótulos. Enviar `null` explícito para campos removíveis.

Aplicar geração da carga/contexto e descarte de resposta antiga a todos os carregamentos relacionados, inclusive borderôs, opções e totais. Ao trocar cliente, limpar ou marcar os dados anteriores enquanto a nova carga não termina. Falha de uma origem deve produzir erro visível de consulta incompleta.

Mostrar filtros ativos mesmo quando a coluna está oculta. Explicar qual período está efetivamente aplicado; evitar atalho “Todos” ser interpretado como remoção de outros filtros quando só muda status. Paginar consultas de volume e informar alcance do resultado/seleção.

Corrigir hooks condicionais na administração. Exercitar padrão e novo layout com os mesmos cenários de seleção, edição e filtros; a camada visual não deve alterar resultados de negócio.

**Aceite:** salvar/reabrir conserva todos os campos; limpar um campo o deixa vazio após recarga; ID histórico é visível; resposta de A nunca aparece em B; ocultar coluna não esconde a existência do filtro; teste com mais de 1.000 registros não perde títulos; erro PJ não é apresentado como relatório completo.

## Bloco 6 — Integrações recuperáveis e monitoramento

**Abrange:** AUD-09/15/25/26, REV-03/04/05/07/08.

Para operações externas, guardar a intenção antes do envio e o resultado por documento/requisição. Distinguir rejeição do serviço, falha anterior ao envio, resultado incerto e autorização externa com persistência local pendente. Em resultado incerto, consultar a situação antes de reenviar.

Definir timeout por etapa e duração total. Aplicar retry somente onde for seguro, com espera limitada e tratamento de 401/429/5xx. Validar a cadeia TLS utilizada por cada autorizador. Guardar XML/recibo em recuperação durável quando a autorização já ocorreu.

No webhook, persistir primeiro o evento recebido de forma idempotente. Processar com política para eventos atrasados, consultar a origem quando necessário e só reconhecer a entrega depois do commit que a torna recuperável.

O auditor deve compartilhar cálculos oficiais, preservar câmbio/linhagem e usar consultas históricas que não excedam o tempo. Mostrar último sucesso, cobertura de regras e erro da última tentativa. Evitar marcar achados como resolvidos quando a coleta estiver incompleta.

**Aceite:** simular timeout antes/depois de autorização, falha de storage e banco, webhook duplicado/fora de ordem, token expirado e 429; cada caso termina recuperável e sem duplicar operação. Auditor completa a coleta em homologação com volume representativo e acusa indisponibilidade claramente.

## Bloco 7 — Conferência e reparação dos registros existentes

Corrigir primeiro as causas, depois os dados. Usar as extrações privadas como lista de investigação, não como uma lista automática de UPDATE/DELETE.

Para cada reparação: identificar documento/família/origem; confrontar histórico e pagamento bancário; produzir plano sem escrita; guardar antes/depois; revalidar os alvos dentro da transação; aplicar apenas alvos cujo estado ainda coincida; conferir conservação dos valores e saídas entre relatórios.

Prioridade de conferência: cinco títulos com natureza real/origem previsão; 59 vínculos de itens em 11 borderôs; oito diferenças previsão/título; alertas de pagamentos; documentos sem título identificado; estoques negativos. Tratar exceções deliberadas separadamente das falhas.

**Aceite:** usuário/revisor consegue examinar cada alvo e o motivo; simulação não grava; reenvio não reaplica; histórico e conciliação permanecem rastreáveis; nenhum registro pago é apagado para “fazer bater” um total.

## Bloco 8 — Publicação com regressão controlada

Consolidar o comando de testes, corrigir os testes de interface fora do contrato atual e separar testes rápidos, integração SQL e percursos de navegador. Transformar as reproduções desta auditoria em regressões do comportamento correto.

Exigir por mudança: testes da área alterada, cenários dos módulos consumidores e smoke test dos dois layouts. Versionar migrations com verificação de compatibilidade; publicar app/schema em ordem definida e retornar hash do commit no endpoint de versão.

Manter CI versionado ou documentar o equivalente externo, com compilação, testes e lint funcional como barreira. Separar dívida de estilo de violações que interrompem execução. Para dados e integrações, manter ambiente de homologação representativo e validar restauração de backup sem tocar na produção.

**Aceite:** correção de CP inclui fluxo/relatório/conciliação; correção de folha inclui previsão/CP/reabertura; correção fiscal inclui estoque/custos/financeiro/status; falha de qualquer contrato bloqueia a publicação. O commit, o schema requerido e os resultados ficam associados à versão publicada.

## Matriz mínima de regressão

| Área | Percursos obrigatórios |
|---|---|
| Financeiro PF/PJ | Criar, editar, limpar campo, parcelar, efetivar previsão, baixar integral/parcial, reabrir, reprogramar, conciliar, relatório e fluxo. |
| Borderô | Compor PF/PJ, baixar valores individuais exatos, encargos, parcial, saldo, estornar, cancelar, consultar história antiga sem alterar original. |
| Pedidos/adiantamentos | Sem pedido/com pedido, previsto/pago, aplicação por fornecedor/moeda/pedido, NF parcial, saldo e Fluxo de Caixa sem dupla contagem. |
| Folha | Por empregador, competência, salário/complemento, benefícios/descontos, gratificação separada, adiantamentos, encargos, fechamento, reabertura, reprocessamento e divergências. |
| Fiscal de entrada | Manual/XML/SIEG, NF de produtos/NFS-e, duplicidade, parcelas, cartão, apropriação máquina, entrega futura, devolução e estorno. |
| Estoque/campo | Entrada, saída, ajuste assinado, transferência, abastecimento e edição/estorno, depósito/safra/ciclo/máquina e saldo. |
| Comercial/contratos | Pedido/barter, contrato/aditivo, romaneio/recebimento, faturamento, CR, previsão e BI. |
| Transporte | CT-e/MDF-e, titular/ambiente/certificado, autorização, cancelamento, armazenamento e recuperação do resultado externo. |
| Interface | Padrão/novo, troca de cliente com carga lenta, histórico inativo, filtros combinados/colunas ocultas, paginação e erros visíveis. |
| Segurança | Sem login, sem permissão da ação, ID de outro cliente, destino divergente, lote com referências mistas e reenvio de solicitação. |

Esta é a sequência proposta para implementação posterior. Os blocos não foram executados como correções nesta auditoria.
