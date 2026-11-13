<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## Central de Atualizações

Toda correção, melhoria ou novidade entregue deve incluir um resumo em `app/atualizacoes/page.tsx`, na lista `RELEASES`, junto com as alterações do código e antes do commit.

- Seguir o padrão existente: versão única, data, título, módulos e itens com tipo e texto.
- Colocar novas versões no início; ao completar registros anteriores, preservar a ordem cronológica e evitar duplicar itens já registrados.
- Usar a data local de America/Cuiaba e escrever em português, explicando o resultado e como o cliente utiliza a mudança.
- Registrar somente comportamentos implementados. Não apresentar homologação, publicação ou saneamento histórico pendentes como concluídos.
- Não expor credenciais, dados privados de clientes, detalhes internos de segurança ou instruções de migração no texto destinado ao usuário do produto.

## Commits ao concluir entregas

Ao concluir e validar uma entrega, efetuar o commit automaticamente, incluindo seu resumo na Central de Atualizações. Não aguardar um novo pedido de commit.

- Exceção: se o usuário pedir para acumular atualizações e commitar de uma vez, manter as alterações sem commit até ele solicitar a consolidação.
- Incluir somente os arquivos relacionados à entrega; preservar alterações não relacionadas que já estiverem no workspace.
- Informar o hash e um resumo do commit ao concluir. Esta regra autoriza o commit local; push e publicação seguem as instruções do usuário.
