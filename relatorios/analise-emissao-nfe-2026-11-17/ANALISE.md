# Emissão de NF-e: avulsa, contrato, remessa e painel

Data: 17/11/2026 — America/Cuiaba.

Continuação: a padronização das telas foi implementada na entrega descrita em [PADRONIZACAO.md](PADRONIZACAO.md).

## Diagnóstico

A venda avulsa e a venda por contrato já usam `app/comercial/faturamento/page.tsx`, com as mesmas abas. O contrato acrescenta uma etapa de escolha da origem e preenche produtor, destinatário, preço, produto e romaneio. A tela de remessa (`app/fiscal/remessas/page.tsx`) é independente, com seleção de depósitos e registro logístico após autorização.

Havia também um terceiro formulário no painel (`app/fiscal/page.tsx`): ao transmitir um rascunho de venda, ele reconstruía apenas parte dos dados da nota. Essa passagem podia perder escolhas, e a edição preenchia as datas com o dia atual. Além disso, o botão de salvar rascunho da venda só aparecia se a nota já fosse um rascunho, como nas cópias de notas anteriores.

## Comparação dos campos e das responsabilidades

| Grupo | Avulsa | Contrato | Remessa |
|---|---|---|---|
| Emitente, estabelecimento/IE, ambiente e numeração | Comum | Mesmo formulário | Mesmo conceito, controles próprios |
| Destinatário, CPF/CNPJ, IE, endereço e município | Comum | Preenchimento pelo comprador | Destino geralmente ligado ao armazém |
| Itens, NCM, unidade, quantidade e preço | Cadastro de produtos agrícolas | Produto/preço e peso da origem | Item ligado ao estoque e ao depósito |
| Natureza, CFOP, CST, operação fiscal e observações | Campos fiscais do formulário | Mesmos campos | Controles fiscais próprios |
| Transporte, placa e modalidade do frete | Aba Transportador | Mesma aba | Componente de seleção de transporte/motorista |
| Referência de outra NF e finalidade | Conforme a operação | Complemento quando aplicável | Remessa/retorno conforme a operação |
| Contrato, romaneio, preço e peso aproximado | Sem vínculo obrigatório | Específicos da origem comercial | Não substituem depósitos |
| Depósito de origem/destino e transferência de estoque | Sem registro logístico de remessa | Não substituem o romaneio | Específicos; registro somente após autorização |
| Rascunho, espelho, editar e transmitir pelo painel | Implementados nesta entrega | Implementados no formulário compartilhado | Fluxo existente preservado |

Os três fluxos precisam de um núcleo fiscal comum, mas não de todas as mesmas exigências operacionais. Um depósito não deve virar campo obrigatório da venda, nem o contrato deve ser exigido na remessa.

## Correção implementada

- O formulário compartilhado permite **Salvar e enviar ao painel** em uma nova nota, com produtor/IE, destinatário e pelo menos um produto identificado.
- Guarda o estado completo do formulário, os itens digitados e o corpo de emissão. Reabrir restaura datas, seleções, CST, operação fiscal, referências, transporte, vínculos e campos complementares, em vez de deduzi-los parcialmente.
- O painel oferece espelho, editar, transmitir e excluir os novos rascunhos. Editar retorna ao formulário de origem; transmitir usa o corpo guardado, acrescentando o ID real da nota.
- Espelho e emissão imediata usam a mesma montagem do corpo guardado para transmissão posterior.
- O salvamento usa um ID estável e uma transação com bloqueio da nota. Repetir a gravação mantém o mesmo registro; operações fiscais em andamento ou concluídas impedem edição/exclusão. Não se reserva número fiscal definitivo ao salvar.
- Salvar não chama a SEFAZ, não cria CR e não registra remessa/estoque. Vínculos fiscais, de contrato/carga, romaneio e nota original são tratados depois da autorização, conforme a origem.
- Resposta incerta da emissão orienta conferir a operação existente. Falha de vínculo depois de autorizar é mostrada como pendência; não é motivo para emitir outra nota.
- Rascunhos anteriores sem o novo conteúdo completo continuam com sua recuperação existente. A entrega não reconstrói dados que nunca foram guardados.

## Limites encontrados e proposta de padronização visual

Guardar o formulário inteiro não significa que todos os seus campos já sejam enviados ao XML. No formulário de venda, peso/volumes, data/hora de saída, textos livres de retirada/entrega e diversos campos internos não estão integralmente mapeados no corpo de emissão atual. O transporte básico já enviado (transportadora, documento, IE, endereço, placa e UF) é preservado. A entrega mantém o corpo fiscal existente; não acrescenta grupos XML sem validar suas estruturas e regras.

Proposta para a próxima padronização: usar um único conjunto de seções **Emitente**, **Destinatário**, **Itens e tributos**, **Transporte**, **Referências e observações**, e um rodapé comum **Espelho / Salvar e enviar ao painel / Emitir agora**. Manter uma seção **Origem da operação** que varie entre contrato/romaneio e depósitos/remessa. Componentes comuns devem montar um único modelo de emissão, com validação por operação; a revisão de campos hoje apenas internos deve acompanhar essa extração.

Esta entrega corrige o fluxo de rascunho e a preservação dos dados. Não reescreve a tela especializada de remessa nem conclui a unificação visual completa. Os componentes e atributos dos layouts Padrão e Novo foram preservados.

## Validação e ativação

- Testes de unidade com rede/banco simulados para preservação do corpo, campos, salvamento, transmissão, rejeição, incerteza, vínculos e falhas posteriores à autorização.
- Testes com PostgreSQL embarcado executando a função SQL real: repetição sem duplicar, atualização, exclusão, estados ativos/terminais e isolamento por RLS.
- Regressões fiscais de CST, duplicação, remessa, classificação e integridade.
- A função `fiscal_rascunho_nfe` está na **Seção 458** de `supabase_migrations.sql`. Deve estar aplicada antes de usar a versão que depende dela. Não foi executada em banco remoto nesta entrega.
- Nenhuma NF foi transmitida de verdade durante os testes. Homologação com certificado e implantação não fazem parte da validação local.

Resultados locais: **75 testes aprovados** na seleção acima; build de produção concluído; verificador dos layouts aprovado. O lint dos arquivos novos passou. Nas duas telas alteradas, os 26 erros de lint já existentes têm exatamente as mesmas regras/mensagens do HEAD anterior (2 na emissão e 24 no painel). O `tsc --noEmit` geral também apontou 12 erros anteriores de tipagem em testes de ICMS/inativação, sem erro nos arquivos novos ou nas telas alteradas; a compilação de produção do Next concluiu sua verificação de tipos.
