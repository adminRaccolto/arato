# Plano de correção — fiscal, LCDPR e operações gerenciais

Data: 11/11/2026. **Plano aprovado; implementação local registrada em [CORRECOES.md](CORRECOES.md), com migrações necessárias, testes e limites ainda pendentes.** O detalhamento abaixo preserva os critérios da auditoria original. Evidências da versão anterior em [RELATORIO.md](RELATORIO.md) e [EVIDENCIAS.md](EVIDENCIAS.md).

## Ordem de execução

| Etapa | Objetivo | Achados principais | Dependência |
|---|---|---|---|
| 1 | Garantir titularidade e autorização por referência | SEG-01/02/03, SEF-05, CFG-03 | Primeiro lote. |
| 2 | Tornar o LCDPR confiável por CPF e evento | LC-01 a LC-11, CFG-04 | Identidade correta e regra de apropriação definida. |
| 3 | Fazer o parâmetro efetivamente governar o documento | TRI-01 a TRI-07, CFG-01/02, EST-01/02/07/08/09 | Matriz fiscal validada com responsável tributário. |
| 4 | Numeração, autorização, persistência e distribuição recuperáveis | SEF-01 a SEF-04, SEF-06 a SEF-10, EST-04/05 | Identidade e contratos da etapa 1. Pode avançar em paralelo com etapa 2. |
| 5 | Unificar OG, referências e reclassificação | OG-01 a OG-05, EST-03 | Transações/validação de referências comuns. |
| 6 | Entrega contábil ECD e conferência histórica | ECD-01, lacunas de dados | Eventos consistentes e escopo contábil definidos. |

Não há estimativa de dias neste documento: homologação, diversidade de operações e qualidade do legado condicionam o esforço. Cada lote deve ter revisão, testes e resultado verificável, evitando uma troca simultânea de todos os fluxos.

## Etapa 1 — Identidade como vínculo derivado, não escolha implícita

Na emissão CT-e, buscar/autorizar o CT-e e derivar sua fazenda, cliente e emitente antes de chamar o serviço. Na emissão MDF-e, eliminar a independência entre `mdfe_id` e `fazenda_id`; rejeitar contexto incompatível. Nas APIs que recebem OG, centro de custo, pessoa, produtor, empresa ou banco, verificar todas as referências no mesmo cliente autorizado.

Na NF-e, titular explicitamente escolhido e não resolvido deve produzir erro claro. Não continuar com módulo antigo. Carregar somente a configuração do contexto atual, limpar estado anterior e ignorar respostas tardias de outro contexto. Campo selecionado pelo usuário deve preservar a identidade no payload, no serviço, no certificado e no XML.

**Aceite:** sessões A/B simuladas não conseguem combinar IDs entre clientes; documento/emitente divergente não chega à transmissão. Trocar cliente/emitente durante carga lenta não mantém dados anteriores. Validar perfis de acesso em integração separada, sem usar a credencial de serviço como prova de RLS.

## Etapa 2 — LCDPR por contribuinte e origem econômica

Criar uma consulta/serviço que entregue movimentos do declarante, com vínculo explícito a produtor, imóvel, participante, origem e evento de caixa. O CPF não pode ser só um rótulo da exportação. “Todos” deve ser uma visão gerencial ou gerar arquivos individuais; não identificar o consolidado com o primeiro CPF.

Definir a participação por movimento/imóvel/titular. Preservar 100% das operações exclusivas; só ratear onde houver exploração compartilhada explicitamente cadastrada. Não escolher o primeiro imóvel para referências ausentes. Movimentos sem imóvel/titular devem ir a uma conferência com motivo e correção rastreável.

Usar data e valor de cada evento real de pagamento/recebimento. Preservar partes de pagamentos históricos; não reconstruir diferentes exercícios usando somente total pago acumulado e última data. Definir com o responsável fiscal o tratamento de adiantamento, compensação, barter, financiamento, transferência e tributo; deduplicar pelo evento, não por uma palavra na descrição.

Persistir inclusão manual/importação com autoria, justificativa, origem, revisão e prevenção de importação duplicada. Informar erros de gravação e confirmar que o registro retornou do banco. Evitar autosalvamento por tecla sem controle de ordem/conflito. Incluir bancos históricos utilizados no período, distinguindo inativo de inválido.

Separar saldo financeiro exibido de resultado anual do demonstrativo fiscal. Validar cadastro de declarante/imóveis, participantes condicionais `0045`, conta com DV somente em formato aceito, CPF/CNPJ, códigos e datas. Aplicar sanitização a todos os campos de texto. TXT, XLSX e PDF devem usar a mesma seleção validada.

**Aceite:** arquivo A não contém eventos exclusivos de B; Q100 referencia somente imóveis/contas válidos; soma de Q100/Q200 e relatório confere por CPF/mês/ano; saldo anual inicia em zero; não há fallback de imóvel; dois pagamentos em anos diferentes não migram de exercício; quota não altera operação exclusiva; campos inválidos impedem exportação oficial com indicação objetiva. Validar pelo leiaute e ferramenta oficial disponível, sem confundir simples leitura por planilha com conformidade.

## Etapa 3 — Uma regra tributária consumida e versionada

Mapear as operações efetivamente suportadas antes de conectar os cadastros à emissão. Criar um contrato único para enquadramento por emitente, regime, UF, finalidade, operação, produto/NCM, destinatário e vigência. Registrar o retrato da regra aplicada no documento, preservando auditoria de mudanças posteriores.

Desativar a aparência de parâmetro efetivo para campos não consumidos ou completar sua integração. Unificar as naturezas hoje repetidas em fiscal/contratos/faturamento e a relação OG/CFOP, com compatibilidade de dados legados. Corrigir o contrato de `operacoes_fiscais` antes de tornar ativo o helper que exige `grupo`; não criar colunas apenas para satisfazer código morto sem definir o modelo.

Passar ao builder a regra resolvida de ICMS, CSOSN/CST, PIS/COFINS e IBS/CBS. Eliminar fallback fiscal provocado por erro técnico: consulta recusada não é isenção/não incidência. Campos legais e valores não podem ser inferidos de um cadastro ausente. Validar combinações, percentuais, quantidades e bases antes de reservar número.

Calcular cada valor monetário na precisão de emissão e totalizar esses valores, com uma política de arredondamento consistente e testes de resíduos. Distinguir observação de retenção financeira, especialmente Funrural. Definir a data de emissão entre formulário, registro e XML de modo explícito.

Configuração administrativa deve ter versão/controle de concorrência. O contador deixa de ser campo regravável junto ao JSON inteiro. Salvamentos de NCM/operação preservam o proprietário correto, confirmam retorno e permanecem abertos em caso de erro. Resolver duplicidades por comparação e precedência documentada, sem sobrescrever a configuração histórica presumida.

**Aceite:** alteração de uma regra consumida aparece no XML de homologação correspondente; CRT e grupo ICMS são compatíveis; alíquotas específicas chegam ao XML; PIS/COFINS não são fixos indevidamente; soma dos itens é igual ao total; erro NCM bloqueia com diagnóstico; tela antiga não regride contador/configuração. Matriz de testes por modelo/UF/regime/finalidade/data, XSD/versão de NT e casos validados pelo responsável fiscal.

## Etapa 4 — Ciclo fiscal recuperável

Reservar numeração em transação com unicidade por titular/modelo/série/ambiente e vínculo ao documento. Duas solicitações do mesmo documento devem compartilhar uma operação idempotente; documentos diferentes não podem receber a mesma reserva. A reserva precisa ter histórico e tratamento fiscal próprio para rejeição, inutilização e resultado incerto.

Antes da transmissão, guardar operação, XML assinado/hash, chave, número, ambiente e estado. Persistir recibo e protocolo. Em timeout/103/105, consultar a mesma operação/chave antes de autorizar nova emissão. Separar erro HTTP, erro SOAP, rejeição de regra, pendência, indisponibilidade e autorização com persistência local pendente.

Guardar autorização e XML em armazenamento durável, com recuperação de falha posterior. O front pode mostrar “autorizado, sincronização local pendente”, mas não retornar sucesso integral e perder o documento. Cancelamento/eventos aceitos externamente precisam de recuperação dos efeitos locais e trilha própria; não tentar tornar a SEFAZ parte de um rollback de banco.

Unificar transporte seguro e timeout por serviço. Corrigir a consulta auxiliar sem validação TLS; manter verificação de cadeia e identidade já presente nos transmissores principais. Resolver certificado do titular adequado, com versão/fingerprint e diagnóstico de falha, preservando a compatibilidade legada até migração conferida. Não misturar senhas/arquivos de titulares e não experimentar identidades indiscriminadamente.

Diagnóstico deve indicar qual serviço/modelo/UF/ambiente/emitente foi testado. Um status CT-e/MT não comprova emissão NF-e. Testar endpoints de homologação separadamente dos de produção, sem emissão real nesta fase.

Distribuição deve guardar cada documento ou pendência antes de avançar um cursor contínuo. Falha de escrita/ZIP fica recuperável por NSU, com contagem de recebidos, persistidos, ignorados por tipo e pendentes. Não apresentar recebidos como salvos. Recuperar os NSU afetados dentro das possibilidades do serviço, sem reiniciar repetidamente toda a distribuição ou provocar bloqueio por consumo.

**Aceite:** teste de concorrência não duplica número; erro de banco não confirma reserva inexistente; timeout não produz uma segunda nota por reflexo; 105 conserva recibo e continua recuperação; autorização seguida de indisponibilidade local reaparece corretamente; evento externo não deixa ajuste local perdido; NSU com falha não é ultrapassado sem pendência durável; requisições têm prazo e servidor TLS validado.

## Etapa 5 — OG e reclassificação consistentes

Escolher a cópia válida global/conta/fazenda antes de aplicar filtro de ativo/permissão, em todos os helpers. Resolver IDs equivalentes para exibição/edição sem trocar automaticamente as referências históricas. Unificar os contratos dos seletores e testar as principais telas consumidoras.

Enviar `null` para limpeza intencional e preservar campos omitidos deliberadamente. Confirmar linha afetada/versão em edição. Validar a titularidade de OG/centro e reclassificar NF, CP e lançamentos de empresa numa transação com auditoria; não permitir metade do vínculo alterado.

Separar mapeamento gerencial, documental LCDPR, tributário e contábil. Expor claramente o que é usado em cada saída. A existência de uma OG não autoriza inventar conta de débito/crédito ou enquadramento tributário.

**Aceite:** OG inativa do cliente não volta pelo modelo global; permissão retirada não reaparece de outra cópia; edição de registro antigo mostra seu rótulo; limpar vínculo realmente o remove; update de registro inexistente falha; erro intermediário não deixa NF/CP divergentes; referências de outro cliente são recusadas.

## Etapa 6 — ECD e revisão do legado

Delimitar a finalidade da entrega contábil com o responsável: origem das partidas, saldos de abertura/encerramento, competência, plano de contas, demonstrações e demais registros exigidos. Reimplementar a serialização no leiaute aplicável e validar em PVA. Corrigir somente cabeçalho e separador não é suficiente.

Corrigir a seleção de OG da conta/globais, período e fontes contábeis; tornar omissões explícitas e impedir apresentação de arquivo incompleto como entrega validada. Decidir se o módulo será uma exportação auxiliar ao contador ou um gerador efetivo de ECD, com critérios distintos.

Para dados existentes, produzir listas privadas por registro, sem alterações automáticas iniciais:

1. LCDPR: titular, imóvel, quotas, baixas sem data, eventos parciais em anos diferentes, compensações e banco não resolvido.
2. NF-e autorizadas locais incompletas: confronto de chave, XML, protocolo e consulta fiscal autorizada, distinguindo importação/registro manual e emissão real.
3. Configurações/NCM duplicados: comparar precedência e vigência; identificar qual regra/certificado foi efetivamente usado quando existir evidência.
4. OG: referências equivalentes, campos a limpar, contas contábeis faltantes e reclassificações parciais.
5. Distribuição: falhas de salvamento/ZIP e lacunas de sequência identificáveis em logs e documentos.

Correções históricas devem ter prévia, evidência de origem, antes/depois e rollback local quando cabível. Não reemitir nota autorizada, inventar protocolo, redistribuir valores ou transmitir retificação em massa com base apenas nesses agregados. Quando houver obrigação já entregue, a necessidade de retificação é uma decisão documental com o responsável fiscal/contábil.

## Validação comum a todos os lotes

Manter os 768 testes existentes e acrescentar testes de aceitação das invariantes corrigidas. Cobrir falha e retomada, dupla submissão, concorrência, resposta tardia após troca de cliente, atualização sem linha afetada, dado legado, valor arredondado e referências de outro cliente. Os 41 testes desta auditoria são o ponto de partida, não a contagem máxima necessária.

Validar as telas nos layouts Padrão e Novo Layout, nos tamanhos usados pelos operadores. Confirmar equivalência de dados entre grid, edição, relatório, XML e exportação, sem depender apenas de o botão “Salvar” ter encerrado o modal.

Homologação externa deve usar dados de teste, configuração de homologação e certificado apropriado. Implantação pode ser feita por etapas, preservando contratos e formato de resposta onde possível. Registrar a versão aplicada, monitorar falhas de persistência/recuperação e comparar os dados antes/depois. Não existe, nesta auditoria, uma autorização implícita para transmissão ou saneamento fiscal histórico.
