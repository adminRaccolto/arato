# Correções da auditoria — lote 1

Data: 11/11/2026. Alterações do aplicativo locais, sem commit ou publicação. O usuário informou que aplicou as seções SQL 434–439; a conferência posterior do agente foi somente de leitura. Este arquivo acompanha o relatório original; não o substitui e não declara a auditoria inteira encerrada.

## Alterações entregues

| Área / achados | Comportamento corrigido e limite |
|---|---|
| Status — AUD-01/02 | Estados pago, baixado, parcial, cancelado e cartão são preservados pelo classificador compartilhado. No CP, natureza real prevalece sobre origem histórica previsão. |
| Pedido — AUD-03/04/05 | Geração do financeiro trava o pedido e grava título + vínculo na mesma transação. Falha não confirma sucesso; geração concorrente reaproveita o título. Fazendas, fornecedor e demais referências precisam pertencer ao cliente correto. Mais de um título histórico candidato exige conferência. |
| Metadados da NF — AUD-06 | Confere a fazenda real, valida referências e exige exatamente uma linha atualizada; zero linhas retorna conflito. Não é ainda a transação de processamento completo de uma NF. |
| Estoque — AUD-07 | Movimento manual confirmado pela API e pelo comando transacional. Ajuste absoluto usa o saldo da fazenda/depósito selecionado, inclusive o grupo sem depósito; a tela apresenta esse mesmo local. Não grava diretamente um saldo consolidado antes da movimentação. |
| Folha alternativa — AUD-08 | Leitura, verificação de duplicidade e inserção de salário recusadas pelo banco interrompem o processo; contador não anuncia salários cuja gravação falhou. O gerador alternativo continua sendo uma rotina antiga, diferente do fechamento transacional. |
| eSocial — AUD-09 | A ação passou a orientar o envio oficial. Não fabrica protocolo nem marca como transmitido um evento sem transmissão. A integração oficial continua pendente. |
| Baixa PF/PJ — AUD-10/11/12 | Comando comum no banco, com trava do título e identificação de requisição. Recusa valores inválidos, excesso, referências de outro cliente e baixa avulsa de título em borderô. Estorno limpa encargos, banco e conciliação na mesma transação, preservando o valor da parte original. |
| Pagamentos parciais | Saldo considera o principal, separando dinheiro pago de juros, multa e desconto. Partes novas conservam a soma do principal. Em parciais legados acumulados, os encargos anteriores são preservados. Barter continua permitindo confirmar entrega sem banco. Parcelas antigas de contrato sem backlink continuam sincronizadas, respeitando os estados permitidos no cronograma. |
| Previsões — AUD-13/14/16 | Criação da previsão e título, consumo e atualização do saldo, edição e decisões passam por comandos transacionais. Consumo repetido pelo mesmo documento não duplica. Efetivar o próprio CP atualiza os campos e consome a previsão na mesma transação, verificando o valor convertido. |
| Auditor de estoque — AUD-15 | Considera ajustes assinados no saldo, assim como o controle oficial. Preserva também câmbio e linhagem ao carregar títulos PJ. |
| Edição — AUD-17/18 | CP/CR enviam null explícito para limpar campos removíveis. Opções de previsão preservam IDs distintos com o mesmo rótulo/classificação; vínculos históricos ausentes da lista ficam identificáveis. A correção não abrange todos os seletores do sistema. |
| Grids — AUD-19/20/27 | Carregamentos de borderôs descartam resposta de contexto antigo; consultas de lotes e contratos são paginadas. CP/CR mostram filtros de colunas ocultas e permitem removê-los. Erros de metadados e da fonte PJ dos relatórios deixam de produzir resultado silenciosamente incompleto. |
| Abastecimento — AUD-21/22 | Bomba, combustível e destino são validados no cliente. Criação, edição e exclusão atualizam registro, bomba e movimento na mesma transação. O movimento recebe FK explícita; legado só é associado se existir um candidato único. Ambiguidade ou vínculo alterado é recusado para conferência. |
| Folha — AUD-23/24 | Simulação de reprocessamento não grava vínculo de encargo. Fechamento da folha passa a ser uma transação por empregador: salários, encargos, adiantamentos, previsões e vínculos confirmam juntos. Usa os valores já calculados, preservando complemento e tratamento das bases existentes. Não é validação trabalhista/tributária dos cálculos. |
| Asaas — AUD-25/26 | Consulta o estado atual do provedor; pagamento, conta, assinatura e registro idempotente do evento confirmam juntos. Falha retorna 503. Evento de atraso não regride pagamento já confirmado. Pagamento sem cadastro local é recusado para nova entrega, sem ativar conta por referência solta. |
| Integrações — REV-04/05/07, parcial | SIEG usa cache por credencial, autenticação compartilhada entre chamadas simultâneas e renovação após 401. Erro de contagem não vira zero documentos. Asaas/SIEG e transportes fiscais recebem prazos; NF-e/CT-e/MDF-e usam raízes públicas + ICP-Brasil com validação TLS. Recuperação durável após autorização externa continua pendente. |
| Administração — REV-06/08 | Hooks passam a manter a mesma ordem. A saúde dos dados sinaliza última execução incompleta e último sucesso disponível. Histórico de exclusões usa projeção menor e índice específico; falha de coleta continua sendo erro, não resolução de achados. |

As regras financeiras ficam nos comandos compartilhados. As adaptações mantêm os componentes dos layouts Padrão e Novo Layout.

## Banco: ordem de aplicação antes da publicação

**Situação atual:** seções 434–439 aplicadas pelo usuário. Conferência de leitura em 11/11/2026 confirmou as dez funções no catálogo PostgREST, as duas tabelas de controle e a coluna `movimentacoes_estoque.abastecimento_id`. Evidência: `dados/schema-correcoes-aplicado.json`. A consulta não executou funções financeiras, não testou gravações nem verificou os corpos SQL/índices. As instruções de ordem abaixo ficam como referência para outros ambientes.

As seções estão somente em `supabase_migrations.sql`; os testes executam esses mesmos trechos, sem cópia paralela.

| Seção | Conteúdo |
|---|---|
| 434 | Registro de requisições, validação de referências, baixa/estorno/reprogramação PF/PJ, principal de parcial e geração do financeiro do pedido. |
| 435 | Comandos de previsão e sincronização do título. Requer 434. |
| 436 | Abastecimento transacional e vínculo com movimentação. Requer 434. |
| 437 | Eventos Asaas, processamento idempotente e confirmação após commit. |
| 438 | Fechamento transacional da folha. Usa estruturas e auxiliares das seções anteriores, incluindo 432 e 435. |
| 439 | Movimento manual e ajuste por local; índice de exclusões financeiras do auditor. Exige o gatilho de estoque derivado da seção 365 ativo e requer 434. |

Aplicar as seções **434 a 439, inteiras e nessa ordem**, em ambiente com as migrações anteriores já aplicadas. Não executar novamente o arquivo histórico inteiro. Cada seção tem BEGIN/COMMIT e notificação do PostgREST. Funções que escrevem com SECURITY DEFINER ficam restritas a service_role, alcançadas por APIs autenticadas que validam acesso à origem.

Publicar o aplicativo depois da aplicação e validação do schema. Sem as novas funções, as APIs recusam a operação com indicação da seção necessária; não fazem fallback para gravações separadas. O SQL não reconcilia automaticamente títulos, previsões, pagamentos ou estoques antigos.

## Verificação

- `npm test`: comando ampliado para incluir 14 arquivos anteriormente fora da lista, além das regressões novas de API, interface e SQL.
- `lib/financeiro/integridade-sql.test.mjs`: PostgreSQL isolado com PGlite, executando as seções reais. Exercita concorrência, reenvio, referências de outros clientes, falha induzida, conservação de principal, contrato, barter, previsões, combustível, ajuste por local, webhook e fechamento da folha. O schema de teste reproduz os CHECKs relevantes; não é cópia completa de todos os gatilhos de produção.
- `lib/auditoria/correcoes-regressao.test.mjs`: funções reais com dependências controladas; descarte de resposta antiga, mais de 1.000 registros, limpeza de campos, autorização, falhas HTTP, simulação sem escrita, autenticação SIEG, timeout e parâmetros TLS.
- `npx tsc --noEmit --incremental false`: verificação de tipos.
- `npm run build`: compilação de produção e verificações de integração dos layouts do prebuild. Testes dos componentes usam renderização React válida, incluindo os dois layouts.
- Conexão TLS sem certificado de cliente e sem envio fiscal: servidores `nfe.sefaz.mt.gov.br`, `nfe.svrs.rs.gov.br` e `mdfe.svrs.rs.gov.br` validaram a cadeia com o conjunto de CAs adotado. Isso não comprova autorização fiscal ou funcionamento de todos os autorizadores.
- Os testes `relatorios/.../ferramentas/reproducoes.test.mjs` registram o comportamento defeituoso do diagnóstico original. São evidência histórica; não integram a suíte corrente e seus asserts antigos não devem ser usados como aceite das correções.

Resultado final: **768 testes aprovados, nenhuma falha**, tipos e compilação de produção aprovados. Os detalhes e hashes ficam em `dados/validacao-correcoes.json`.

## Trabalho ainda necessário

1. **Processamento completo de NF de produtos:** converter o conjunto de gravações obrigatórias de estoque, financeiro, parcelas, rateios e estado da nota para uma transação compatível com cada tipo de entrada. A atualização de metadados corrigida não resolve esse fluxo inteiro.
2. **Resultado fiscal externo e persistência local:** guardar intenção, resultado e recuperação durável quando houver autorização na SEFAZ e falha posterior de banco/storage. Não reenviar emissão para resolver uma resposta incerta sem consultar a situação.
3. **Folha além do fechamento:** reabertura, reprocessamento aplicado, exclusão e aplicação de adiantamento de funcionário a CP ainda têm trechos com múltiplas gravações. Simulação e fechamento foram corrigidos; esses demais percursos precisam de transação própria e testes de concorrência entre operações diferentes.
4. **Grids e filtros dos demais módulos:** ampliar proteção contra respostas antigas e campos históricos para todas as telas; validar opções auxiliares e totalizadores no contexto correto. As mudanças deste lote concentram-se no financeiro e nas telas citadas.
5. **Relatórios e caixa:** completar a matriz por origem/estado/moeda, especialmente consumo de previsão por NF, relatórios previsto × realizado e famílias antigas. Algumas consultas auxiliares fora das áreas corrigidas ainda precisam de paginação e tratamento estrito de erro.
6. **Dados históricos:** conferir individualmente os candidatos do relatório original (previsões/títulos, famílias de borderô e saldos). Nenhum pagamento ou estoque real foi alterado nesta implementação.
7. **Homologação ponta a ponta:** operar com sessão real e cadastros de teste nos dois layouts, em ambiente com o schema novo. Confirmar reflexos em CP/CR, relatório, caixa e conciliação; testar integração oficial com credenciais de homologação. Não foram executadas emissões, pagamentos ou mutações no ambiente real.
8. **Publicação e monitoramento:** consolidar CI, identificar versão/schema publicado e medir a coleta do auditor com volume representativo. O novo índice e a consulta reduzida ainda precisam dessa medição após aplicação.

Este lote reduz causas reproduzidas de perda de informação e confirmação incorreta. A conclusão do trabalho exige os percursos e a conferência histórica acima; a aprovação de testes locais não equivale a declarar todo o Arato livre de falhas.
