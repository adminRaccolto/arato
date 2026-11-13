# Inativação do funcionário e previsões da folha

13/11/2026. Correção local; não aplicada no banco de produção nesta etapa.

## Regra confirmada

Ao inativar, retirar todas as previsões não movimentadas dos rascunhos, inclusive a competência atual e rascunhos antigos. Não exigir data de demissão: a demissão/rescisão será processada depois pela rotina própria.

## Alteração

- Atualização do cadastro e retirada das previsões ocorrem na mesma transação. Uma falha reverte ambos.
- Retira a linha do funcionário dos rascunhos e cancela seu título previsto, preservando no histórico os valores anteriores. Recalcula bruto, líquido, FGTS e INSS patronal a partir das linhas restantes.
- Encerra a previsão correspondente no módulo de Previsão de Gastos para impedir que continue projetando saída de caixa.
- Folha fechada/paga e título real, pago, parcial, conciliado, em borderô, cartão ou contrato financeiro são preservados. Família de título com parte paga e previsão já consumida também são protegidas.
- Se um salário/encargo protegido exigir ajuste, a rotina mantém seu valor e vínculo; não estima estorno de obrigação real.
- Ao salvar/reabrir rascunho, a sincronização confere novamente os inativos antes de ler as linhas. Títulos protegidos não ganham previsão duplicada.
- Inclusão em lote desconsidera o inativo quando a tela ficou aberta antes da inativação, preservando a inclusão dos demais funcionários, recalculando os totais e informando o ocorrido.
- A rescisão posterior pode criar normalmente seus títulos reais.

Cancelados permanecem disponíveis no histórico e podem aparecer no filtro de cancelados ou em “Todos”; não compõem o saldo previsto/a pagar. Nenhum pagamento realizado é apagado.

## Aplicação

Executar **a seção 446 inteira** de `supabase_migrations.sql` antes de publicar o código. Requer as seções 432 e 438 e as tabelas existentes da folha/financeiro.

A seção regulariza também funcionários já inativos que ainda têm linhas nos rascunhos, usando os mesmos bloqueios e histórico. Não procura títulos avulsos antigos por aproximação de nome/descrição nem cancela registros reais. Se houver sincronização de folha em andamento, interrompe a aplicação/inativação com mensagem para tentar novamente após a conclusão.

## Verificação

- 839 testes aprovados, incluindo 24 testes adicionais de inativação, proteção financeira e integração da sincronização.
- PostgreSQL embarcado PGlite: retirada em várias competências, encargos restantes/zerados, proteção de pagamentos e famílias, regularização dos já inativos, repetição idempotente, isolamento entre clientes e rollback por falha intermediária.
- Funções reais da API com dependências simuladas: limpeza antes da leitura das linhas, interrupção quando a migração está ausente, não recriação de previsão e preservação de título real/vínculo.
- Build de produção inclui TypeScript e a verificação da integração dos layouts Padrão e Novo Layout. Não houve teste manual autenticado de navegador nem alteração de dados reais.
