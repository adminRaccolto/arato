# Correções dos relatórios de Resultados — 18/11/2026

## Entrega

A DRE Agrícola, Margens por Safra, Custos Totais, Custo por Hectare e Produtividade compartilham a mesma apuração e os mesmos filtros. As rotas do menu foram preservadas. A DRE compara ciclos em colunas, com fazenda no cabeçalho, total consolidado e coluna para valores sem ciclo. As visões consolidada e individual continuam disponíveis.

O relatório informa a base da receita escolhida: títulos reais do CR, contratos confirmados ou estimativa explícita da colheita aprovada pelo preço do orçamento. Não troca de base por falta de receita. Não presume preço da saca, cotação ou alíquota tributária. O regime apresentado é de competência gerencial, não uma demonstração exclusiva das movimentações bancárias.

## Apuração e rastreabilidade

- Consumos agrícolas usam os valores históricos registrados nas operações aprovadas. Consumos manuais usam o custo unitário registrado no movimento, sem consultar o preço atual para recompor o passado.
- Compras de estoque não são somadas novamente pelo CP. Na NF de produtos, a apropriação direta respeita a proporção de cada parcela; devoluções processadas reduzem essa parte proporcionalmente. Devoluções canceladas não são deduzidas.
- Abastecimentos e manutenção entram por sua apropriação. NFS-e já apropriada à máquina não é novamente somada pelo CP, inclusive parcelas e títulos de empresa. A identificação de empresa distingue prestadores que usam o mesmo número de nota.
- Folhas fechadas/pagas entram pelo bruto, complemento e encargos. Seus títulos vinculados são excluídos da contagem adicional. Lançamentos de pessoal fora desses vínculos são sinalizados para conferir possível duplicidade.
- Principal de empréstimo, adiantamentos, tesouraria, CAPEX e cancelamentos ficam fora do resultado. Juros e descontos da baixa são considerados independentemente da exclusão do principal. Juros recebidos são receita financeira; descontos concedidos reduzem a receita.
- Previsões aparecem separadamente. Despesas de empresa entram na apuração agrícola quando possuem safra ou ciclo explicitamente apontado; o relatório por empresa mantém seu próprio universo de títulos.
- Apontamento explícito a um ciclo não é perdido por divergência do ano no título. Regras por área usam todos os ciclos elegíveis, sem redistribuir o custo ao ocultar uma coluna. Anos de mesmo nome com IDs distintos são tratados como a mesma safra para rateio.
- Rateios por centro, ancestrais, fazenda, percentuais e regras globais conservam os centavos. Regras ausentes, concorrentes ou inválidas mantêm o valor pendente. Auxiliares sem principal válido e resíduos de absorção não desaparecem.
- EBITDA precede depreciação e resultado financeiro. Prejuízos preservam seu sinal. Indicadores consolidados são recalculados com as bases somadas; ausência de base aparece como travessão.
- A composição de cada valor pode ser consultada na tela e exportada para Excel. Filtros alterados invalidam o relatório anterior e suas exportações. Trocas de contexto descartam respostas antigas.

## Outros relatórios

**DRE por empresa:** fim real do mês, conversão histórica, exclusão de previsões/cancelamentos/principal, classificação pela OG, folha pelo custo bruto e separação da depreciação. IRPJ e CSLL não são estimados por alíquotas fixas. A apresentação identifica o resultado como gerencial, com os tributos efetivamente lançados.

**Gastos por Classificação:** seleção vazia retorna vazio; cancelados dependem de seleção expressa; títulos de empresa são consultados no período no servidor e preservam natureza/cotação. Bases de período por vencimento, lançamento ou baixa. Filtro por reais/previsões e valores convertidos em BRL. Referências e agrupamentos sem OG usam a mesma chave.

**Aplicações:** cabeçalhos paginados e filtrados por operação, período, ciclo e talhão; itens consultados somente pelos cabeçalhos selecionados. Contagem distinta de operações, área única por ciclo/talhão e indicação de itens sem área. As mesmas bases são usadas nos agrupamentos e nas exportações. Referências de todas as páginas são carregadas e protegidas contra respostas de contexto anterior.

**Manutenção:** paginação, seleção vazia sem UUID fictício, erros explícitos e proteção contra resultados antigos. Safra/ciclo delimitam o período do serviço; não são apresentados como vínculo de apropriação que o registro não possui.

## Verificação

- `npm test`: **1.079 testes aprovados**.
- Regressões específicas de Resultados: **37 testes aprovados**, incluindo rateios, câmbio, sinal do prejuízo, competência, notas parceladas, devoluções, máquina, folha, principal/encargos, páginas e falhas.
- `npm run build`: concluído, incluindo a verificação do layout operacional.
- ESLint nos arquivos de relatórios e apuração alterados: sem erros ou avisos.
- Conferência visual: Padrão e Novo, em 1440 e 393 pixels, com dados sintéticos.

 As consultas do novo carregador foram exercitadas com cliente Supabase simulado, incluindo falha em página posterior e mais de mil registros. A tabela real foi renderizada em navegador em 1440 e 393 pixels, nos layouts Padrão e Novo; a rolagem fica contida e a coluna fixa no celular mede 160 pixels.

Não foram executadas emissões, baixas ou alterações de dados de clientes. Não é necessária seção SQL para esta entrega. A validação visual usa dados sintéticos; não substitui a homologação autenticada com os dados e permissões de cada cliente. Custo/cotação/classificação histórica ausentes permanecem pendências explícitas, sem saneamento ou reconstrução automática.
