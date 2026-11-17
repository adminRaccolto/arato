# Padronização dos formulários de emissão de NF-e

Entrega de 17/11/2026, continuação de `ANALISE.md`.

## Resultado

Venda avulsa, faturamento por contrato e remessa de mercadorias agora usam o componente `components/fiscal/EditorNfe.tsx`. Compartilham título, moldura, dimensões, estilos, seis abas, navegação e rodapé. O formulário da venda continua sendo usado também para seus modos de devolução, retorno e complemento.

| Aba | Venda avulsa / contrato | Remessa |
|---|---|---|
| Emitente | Produtor, IE, safra, modelo, série e data de emissão | Emitente, IE/série e data da remessa |
| Destinatário | Cadastro e dados editáveis de documento/endereço | Armazém e conferência de CPF/CNPJ, IE e endereço do cadastro; busca de IE existente preservada |
| Itens e tributos | Natureza, CFOP, CST, alíquota/redução e itens agrícolas | Operação, natureza, CFOP, CST e produtos na unidade do estoque |
| Transporte | Frete, transportadora, documento, IE, endereço/município, placa, pesos, volumes e saída | Frete, transportadora e veículo do cadastro, placa e motorista |
| Referências e observações | Referência fiscal, documentos auxiliares e observações/classificação | NF de entrada de referência e informações complementares |
| Origem da operação | Contrato, romaneio, data do lançamento e locais de retirada/entrega | Emissão pelo Arato ou nota externa, NF de entrada, XML externo e depósitos |

As abas têm bordas leves, seleção visível e navegação Anterior/Próxima. Setas, Home e End também navegam pelo cabeçalho. O total permanece no rodapé, e os itens deixam de ocupar uma área fixa em todas as abas da venda. Em telas pequenas, abas e comandos se distribuem em linhas; tabelas de itens conservam rolagem horizontal.

O rodapé usa a mesma ordem de comandos: **Espelho**, **Salvar e enviar ao painel**, **Emitir agora**. Na edição de uma remessa pendente, o comando de emissão imediata continua indisponível: salvam-se as alterações da mesma nota para transmitir pelo painel. Uma nota externa oferece **Registrar remessa**, preservando sua rotina.

## Preservação das rotinas

- Os estados dos campos e dos itens permanecem nas páginas de origem, e não dentro das abas. Trocar de aba não cria outra nota nem limpa dados.
- Os campos existentes foram conferidos antes/depois; nenhum controle de valor ou seleção foi removido. Os campos de endereço, número e município da transportadora na venda passaram a ter controles visíveis; já faziam parte dos dados salvos e do corpo de transporte.
- A escolha de contrato/romaneio e o retorno às etapas de origem continuam disponíveis. Depósitos, unidades de estoque, NF externa e XML da remessa permanecem exclusivos da operação correspondente.
- A montagem dos payloads fiscais, a gravação de rascunhos, a emissão, os vínculos de contrato/CR e o registro de estoque não foram reimplementados. Foram comparados os métodos anteriores e atuais: fora os comandos de navegação para apontar campos inválidos, os corpos das funções mantêm o comportamento anterior.
- Validações básicas levam à aba do campo ausente, incluindo emitente/IE, destinatário, itens e depósitos.
- O componente compartilhado usa `OperationalButton`, atributos operacionais e variáveis de tema, preservando Padrão e Novo.

Esta padronização é de apresentação e navegação. Os limites de mapeamento de campos internos para XML identificados em `ANALISE.md` continuam fora desta entrega. Não há alteração em cálculo tributário, reserva de numeração, comunicação com a SEFAZ ou regras de estoque.

## Validação

- **94 testes aprovados**: navegação e comandos do editor, renderização nos dois modos de apresentação, bloqueio dos comandos durante operação, nota externa, edição de remessa, regressões de rascunho, CST, remessa, duplicação, classificação, integridade fiscal e interfaces/layouts.
- Build de produção do Next concluído.
- Lint dos arquivos desta entrega sem erros; as sete advertências restantes nas páginas já existiam. Os dois erros antigos de aspas no texto do grid foram corrigidos ao reorganizá-lo.
- `scripts/verify-operational-layout.mjs` aprovado.
- Conferência visual em Chromium da estrutura compartilhada com conteúdo de exemplo, nos tamanhos 1440×1000 e 390×844, em Padrão e Novo: seis abas, modal dentro da tela e comandos do rodapé acessíveis. Não se trata de um teste autenticado completo contra o banco real.
- Nenhuma nota foi emitida e nenhum estoque/financeiro foi alterado durante a validação. A mudança não exige nova seção SQL.

Central de Atualizações: versão `2026.11.17-s`.
