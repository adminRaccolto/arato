# Custos Totais — desembolsos operacionais

Entrega de 18/11/2026, substituindo, somente em Custos Totais, a apresentação de realizado/previsto derivada da DRE.

## Regra de apuração

- Consulta paginada de `lancamentos` e `empresa_lancamentos`, por fazendas autorizadas, tipo pagar e data de baixa/pagamento dentro do intervalo solicitado. Não usa vencimento ou competência para atribuir o pagamento ao período. A safra apenas preenche o intervalo de datas.
- O valor pago está em BRL, inclusive no título em USD. Usa esse valor, retirando juros/multa efetivamente registrados na baixa. O desconto já reduziu a saída de caixa. Uma baixa integral antiga sem valor pago explícito usa o nominal com a cotação histórica registrada, encargos e desconto; sem dados válidos, exige conferência.
- A classificação operacional segue a OG e, para títulos antigos sem OG, categorias reconhecidas. Exclui depreciação, amortização, investimentos, principal e despesas financeiras, transferências, tributos sobre resultado, previsões e liquidações sem desembolso. Despesas sem classificação suficiente ficam identificadas para conferência, fora do total operacional.
- Compras de insumos e despesas com pessoal entram pelas suas baixas financeiras, sem adicionar consumo de estoque ou valores da folha em competência. Adiantamentos operacionais pagos entram pelo desembolso; sua compensação posterior não movimenta caixa novamente.
- Títulos de borderô conservam seus valores individuais de baixa. Não se soma o cabeçalho nem se faz média entre os títulos.
- Faturas integralmente quitadas usam os valores das compras que compõem a fatura, somente quando a composição coincide com o principal desembolsado. Atribui o custo a cada compra/ciclo e classifica cada item, sem duplicar o cabeçalho. Composição ausente ou divergente permanece para conferência.
- Não rateia os pagamentos entre ciclos. Sem ciclo continua no total geral e tem grupo próprio na visão por ciclo. Funciona sem safra ou ciclos cadastrados.

## Apresentação e exportação

Painel com total operacional, parcelas com/sem ciclo, categorias com participação e lista paginada de pagamentos. Visão por ciclo usa seletores com valores, sem estrutura de DRE. Selecionar uma categoria abre sua composição; o resumo continua mostrando todo o ciclo/período selecionado. PDF e Excel respeitam o campo **Formato do relatório**: **Sintético** (padrão) traz o resumo, sem relações individuais de pagamentos, pendências ou exclusões; **Detalhado** acrescenta a relação completa do detalhe selecionado e os itens para conferência. No sintético, as quantidades de pagamentos pendentes e fora do escopo continuam informadas. A consulta na tela conserva os detalhes em ambos os formatos.

Alterar datas, fazenda ou cliente invalida o resultado/exportação anterior. Respostas de consultas antigas não substituem o resultado de filtros novos. Falha de consulta ou página interrompe a geração inteira, em vez de apresentar uma origem como zero.

## Validação

- 23 testes novos de apuração, consultas e apresentação, incluindo datas, BRL/USD, desconto/encargos, parcelas separadas, parcial acumulado, borderô de 100/200, adiantamento/compensação, classificação, fatura mista, paginação acima de mil linhas, erros e impressão completa.
- Suíte completa: 1.111 testes aprovados.
- ESLint dos arquivos alterados e build de produção aprovados.
- Navegador Chromium com componentes/CSS reais e dados fictícios: layouts Padrão e Novo em 1440 e 393 px; total, seleção por ciclo/sem ciclo, composição por categoria, paginação e fichas, sem erro de JavaScript ou transbordamento horizontal da página.
- `tsc --noEmit` geral continua apontando os 13 erros preexistentes em testes fiscais e de inativação da folha; nenhum diagnóstico nos novos arquivos. O build do aplicativo passa.
- Complemento Sintético/Detalhado: 68 testes dos relatórios aprovados e build aprovado. No navegador, o componente completo foi exercitado nos dois layouts e nas larguras de 1440/393 px, com captura do conteúdo enviado ao PDF e leitura dos arquivos Excel efetivamente baixados: sintético somente com Resumo; detalhado com os 51 pagamentos de teste, inclusive os da segunda página, e itens de conferência. Os totais são idênticos nos dois formatos.

## Limites de dados históricos

Um título parcial antigo pode acumular pagamentos de várias datas em um único valor. Sem separação das partes não há informação suficiente para reconstruir o desembolso de cada período; fica para conferência, com seu valor conhecido e motivo. Nenhum dado histórico é modificado por este relatório. Pagamentos sem classificação operacional também não são presumidos como custo, mas são apresentados para revisão. Não houve saneamento de dados, execução de migração, push ou publicação nesta entrega.
