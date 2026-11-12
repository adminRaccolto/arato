# Correções implementadas — fiscal, LCDPR, OG e SEFAZ

11/11/2026. Implementação local sobre `7cb5eb23f712d0500f57d54f1d1f347dd7024503`, após aprovação do relatório. Sem commit, publicação, alteração de dados de produção ou transmissão fiscal nesta etapa.

O [relatório](RELATORIO.md) e as [evidências](EVIDENCIAS.md) descrevem a versão anterior e foram preservados como referência. Este documento registra o que mudou e os limites da entrega. Aprovação do relatório não foi interpretada como autorização para corrigir documentos históricos ou transmitir eventos em massa.

## Mudanças no comportamento

| Frente / achados | Resultado implementado |
|---|---|
| Titularidade — SEG-01/02/03, SEF-05 | CT-e/MDF-e conferem documento e fazenda antes de configuração, certificado ou rede. Titular explicitamente escolhido na NF-e não é substituído após erro. OG, centro e demais referências passam por validação de cliente nas operações corrigidas. |
| LCDPR — LC-01/02/03 | Seleção efetiva por CPF; valores exclusivos permanecem integrais. Participação só alcança movimentos compartilhados do imóvel. Sem substituição de imóvel ausente pelo primeiro cadastrado. “Todos” permanece visão gerencial; TXT exige contribuinte individual. |
| LCDPR — LC-04/05/06 | Removida exclusão por nome na descrição. Data efetiva e valor do evento de caixa determinam período/valor. Previsões, compensação específica de adiantamento, parcial histórico acumulado e dados ambíguos têm motivos de conferência. Não se presume a cronologia dos pagamentos antigos. |
| LCDPR — LC-07/08/09/11 | TXT anual inicia em zero; Q100/Q200 usam os mesmos valores. Validação de CPF/CNPJ, endereço, imóveis, participantes condicionais 0045, CAEPF quando aplicável, datas, bancos e campos numéricos. Textos não deslocam registros por `|` ou quebras de linha. DV bancário sem hífen. |
| LCDPR — LC-10, CFG-04 | Inclusão/importação persistida com autoria. Reenvio e mesma linha do arquivo não duplicam registros. Alteração/exclusão têm versão, histórico e motivo na exclusão. Erro de banco não encerra salvamento como sucesso. |
| Banco e relatórios LCDPR | Carregamento inclui bancos inativos históricos e paginação completa. Contas do titular principal não são atribuídas automaticamente ao parceiro; cotitular cadastrado é considerado. Conta desconhecida bloqueia TXT; trânsito documentado usa 999. TXT/XLSX/PDF partem da mesma seleção; impressão escapa texto HTML. |
| Configuração — CFG-01/02/03 | Trocar cliente limpa contexto e descarta respostas atrasadas. Cadastro mantém sua fazenda original, verifica linha afetada e versão, conserva modal em caso de erro. Salvamento genérico compara a configuração anterior e preserva certificado/contador alterados pelo serviço. |
| Tributação — TRI-01/02/03/07 | Resolvedor consome operação fiscal, NCM e vínculo OG/CFOP aplicáveis. ICMS/PIS/COFINS informados chegam ao builder. CSOSN compatível com o regime nos grupos suportados. Erro na consulta de regra não vira isenção IBS/CBS. |
| Tributação — TRI-04/05/06 | Quantidades, descontos, percentuais, códigos e bases são validados antes da reserva/transmissão. Total monetário soma valores arredondados dos itens, inclusive IBS/CBS. |
| Data e regra aplicada | Data informada segue ao XML NF-e/CT-e. Cadastros têm vigência e controle de versão; regras NCM de períodos distintos podem coexistir. Regras divergentes aplicáveis bloqueiam a emissão. A operação guarda o retrato da regra aplicada. |
| Operações fiscais | Seleção explícita nas entradas fiscal/comercial, variáveis dos textos complementares e preservação do vínculo no documento. Helper não depende mais da coluna inexistente `grupo`. Funrural é identificado como texto, sem promessa de retenção financeira automática. |
| OG — OG-01/02/03/04/05 | Helper antigo usa a mesma precedência da conta; cópia inativa não reaparece por meio do global. Limpeza envia `null`; atualização inexistente falha. Seletores principais de CP/CR/NF aceitam IDs equivalentes. Reclassificação NF/CP/PJ ocorre em transação com auditoria e validação de cliente. |
| Contabilidade — ECD-01 | Removido o TXT apresentado como ECD sem escrituração completa. A tela entrega **CSV auxiliar de preparação contábil**, com origem, datas de caixa e pendências explícitas. OG da conta/globais e fontes PF/PJ são consideradas, sem inventar contas. Parcerias exportam os rateios salvos em CSV. |
| Numeração — SEF-01/02/03 | Reserva atômica por cliente/titular/modelo/série/ambiente e requisição idempotente para NF-e/CT-e/MDF-e. JSON de configuração deixa de ser a fonte única de concorrência. Número reservado não é devolvido silenciosamente ao contador. |
| Emissão — SEF-04/06 | Operação e XML assinado/chave ficam duráveis antes do envio. Retorno distingue rejeição, pendência, autorização e sincronização local pendente. Recibo é preservado; 103/105 e incerteza não provocam nova emissão automática. |
| Recuperação fiscal | Quadro “Emissões em conferência” compartilhado nas telas fiscal/comercial/CT-e/MDF-e. Recuperação consulta a mesma chave, usa exclusão concorrente e conclui persistência local. Não retransmite nem troca o número automaticamente. Nota recuperada conserva campos esperados pela edição. |
| Certificados/rede — SEF-07/08 | Consulta auxiliar verifica TLS, cadeia e prazo de resposta. Seleção respeita documento do titular e par arquivo/senha correspondente. Revalidação de caminho usa a rotina canônica de certificado, sem sobrescrever credenciais pelo JSON genérico da tela. |
| Endpoints/diagnóstico | Mapa NF-e de produção/homologação unificado por UF, usado em transmissão e consultas. Teste de conexão identifica serviço/modelo/UF/ambiente; status CT-e/MT não é apresentado como prova de NF-e. |
| Eventos/cancelamento NF-e | Reserva e sequência de CC-e persistidas antes do envio. Evento aceito externamente permanece comprovado mesmo se falhar o ajuste local. Retomada faz consulta/conclusão, sem retransmissão automática. Titular/UF derivam da chave; ambiente original registrado prevalece sobre configuração posterior. Documentos cancelados/encerrados não são reabertos por resposta atrasada. |
| Distribuição — SEF-09/10 | Resposta é guardada por NSU antes do cursor avançar. Falha de gravação/ZIP não é silenciosamente contada como sucesso. Cursor monotônico, separado por ambiente; documentos de outros tipos ficam na caixa de entrada durável. Prazo de rede e processamento limitado por rodada. |

## Migrações necessárias antes da aplicação atualizada

Executar **cada seção inteira de `supabase_migrations.sql`, na ordem 440 → 445**, no mesmo banco usado pela aplicação. As seções 434–439 continuam sendo pré-requisitos; não foram modificadas nesta entrega. Não executar novamente o arquivo inteiro com todas as migrações históricas.

| Seção | Conteúdo |
|---|---|
| 440 | Auditoria fiscal sanitizada, reclassificação transacional e configuração com comparação do estado anterior. |
| 441 | Movimentos próprios do LCDPR, participantes do imóvel, autoria, deduplicação de importação e edição/exclusão com versão. |
| 442 | Reserva de numeração, operação fiscal durável, XML/retornos e caixa de entrada/cursor da distribuição. |
| 443 | Vigência/versão de NCM e operações, convivência de NCM em períodos distintos, exclusão concorrente da recuperação e vínculo da NF persistida. |
| 444 | Gravação idempotente por chave e proteção do estado final dos documentos. Registro externo sem prova não é tratado como autorização conferida. |
| 445 | Diário de cancelamento/CC-e NF-e e conclusão local transacional dos eventos. |

Essas seções criam a infraestrutura e as novas funções. **Não foram aplicadas no banco real nesta etapa.** Não reclassificam lançamentos antigos, recalculam impostos, recompõem quotas ou regularizam numeração histórica automaticamente.

## Validação executada

- `npm test`: **809 testes, 809 aprovados, zero falhas**; eram 768 na base auditada.
- Testes novos em `lib/fiscal/correcoes.test.ts`, `fluxos-regressao.test.mjs` e `integridade-sql.test.mjs`.
- Regras puras, builders e funções reais extraídas com dependências simuladas: titularidade, certificados, leitura recusada, gravação sem linha afetada, conflito, parametrização, arredondamento, recuperação e seleção/exportação LCDPR.
- SQL 440–445 executado no PostgreSQL embarcado PGlite: rollback em falha intermediária, referências de outro cliente, idempotência, reservas distintas, XML antes do envio, recuperação concorrente, configuração/certificado, versões, importação e evento externo com falha local. Não equivale a testar as políticas de produção com todas as sessões reais.
- `npm run build`: compilação de produção e TypeScript. O `prebuild` verifica a integração dos layouts Padrão/Novo Layout e gera a compatibilidade de tema.
- `git diff --check`: sem erros de whitespace.

Os 41 cenários em `ferramentas/reproducoes.test.mjs` continuam arquivados como reprodução da versão anterior. Eles afirmam defeitos antigos; **não são os testes de aceite da implementação atual**. Não sobrescrever os resultados originais para apresentar o comportamento novo como evidência antiga.

## Limites e trabalho que continua separado

1. **Homologação fiscal externa:** nenhuma emissão, CC-e, consulta autenticada, cancelamento ou distribuição real foi executada. Validar XML/XSD e cenários de homologação das UFs/modelos/regimes efetivamente usados com certificado apropriado. O mapa foi confrontado com o [portal oficial de serviços NF-e](https://dfe-portal.svrs.rs.gov.br/Nfe/Servicos), sem testar cada endpoint autenticado.
2. **Matriz tributária:** a integração passa a respeitar os cadastros nos grupos implementados. Não é uma matriz universal de todas as situações fiscais. ICMS normal 00/20/40/41/50/51/60, CSOSN 102/103/300/400/500 e IBS/CBS 000/200/410 são os grupos atualmente tratados; situações que exigem outros grupos completos devem ser implementadas/homologadas, sem produzir grupo aproximado. Permanecem regras CFOP legadas e listas de naturezas em módulos antigos; não houve unificação integral de todas elas nesta entrega.
3. **Regras de enquadramento:** defaults/benefícios e exceções legais precisam de validação pelo responsável tributário. Retenção financeira de Funrural, enquadramento de adiantamento/barter/financiamento e códigos gerenciais legados do LCDPR não foram transformados em regras legais universais. O campo legado “Tipo Doc. LCDPR” da OG não substitui o tipo documental do lançamento.
4. **ECD:** não foi implementado um novo gerador de ECD. CSV auxiliar resolve a apresentação de arquivo incompleto como escrituração; ECD completa continua exigindo partidas, competência, saldos, plano de contas, demonstrações e PVA.
5. **Legado:** notas autorizadas sem prova completa, NSUs historicamente ultrapassados, duplicidades de configuração, baixas acumuladas, titular/imóvel/banco ausente e quotas de exercícios passados precisam de conferência por registro. Esta entrega não os saneou. Documentos externos sem protocolo/chave são sinalizados para conferência, sem fabricar prova fiscal.
6. **Cancelamentos complexos:** compensações históricas e apropriações diretas sem fotografia anterior permanecem em pendência para ajuste controlado. O evento externo não é perdido, mas os valores internos não são recompostos por estimativa. Eventos recebidos na distribuição estão duráveis; isso não significa sincronização automática de todos os tipos de eventos CT-e/MDF-e.
7. **Perfis e interfaces:** controles de cliente/registro foram fortalecidos nas rotas corrigidas. Uma matriz uniforme de permissão por ação e a revisão de todos os seletores legados ainda exigem trabalho próprio. Não foi feita homologação visual interativa em navegador autenticado nos dois layouts; a verificação de integração e os testes de componentes não a substituem.

## Conferência de implantação

Depois de aplicar as seções e publicar a versão, validar no ambiente de homologação: troca de cliente com carregamento em andamento; salvar em duas abas; operação por CPF/empresa; NCM com vigência; reclassificação refletida no CP; LCDPR anual por CPF; primeira emissão e consulta posterior; falha simulada de persistência/retomada; evento aceito e ajuste local pendente; distribuição interrompida e retomada. Fazer a mesma conferência operacional nos dois layouts.

Nenhum desses passos autoriza reemissão de nota antiga, reutilização de número, retificação de declaração ou acerto fiscal em massa.
