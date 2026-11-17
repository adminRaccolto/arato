# Integrações e transição — gestão exclusiva do Arato

Data: 17/11/2026 — America/Cuiaba.

Estado: especificação; conectores, contas e automações não foram ativados.

## Decisões confirmadas

- Aplicação administrativa separada, conectada ao Arato.
- Canais de aquisição: Instagram, site, WhatsApp e Google.
- Cobranças atuais: Asaas vinculado ao MentoraSys.

## 1. Captação e atribuição

| Canal | Entrada proposta | Resultado no CRM | Dependências a verificar |
|---|---|---|---|
| Site | Formulário atual, com entrega ao novo CRM | Lead, contato, atividade e tarefa de retorno | Endpoint do novo CRM e confirmação durável de recebimento |
| Instagram | Links identificados para site/WhatsApp; conector de mensagens/lead ads quando disponível na conta | Origem, campanha e vínculo da interação com o contato | Tipo de conta, uso de anúncios e permissões do aplicativo Meta |
| WhatsApp | Eventos de mensagens e de entrega da plataforma oficial ou do provedor contratado | Histórico comercial, responsável e oportunidade ligada ao contato | Número empresarial, modalidade atual e acesso à integração |
| Google | Origem orgânica ou campanha identificada no site; lead forms por webhook quando usados no Google Ads | Lead com referência de campanha/formulário e oportunidade | Uso real de Ads e identificação das contas/campanhas |

Esses quatro canais foram confirmados; ainda não foi confirmado que existem anúncios, formulários nativos de anúncios, conta profissional do Instagram ou WhatsApp com API. Os conectores avançados devem ser habilitados conforme o que existe, sem tratar toda visita, clique ou seguidor como lead identificado.

### Separação da origem e do canal de contato

Exemplo: a pessoa encontra o Arato no Instagram, acessa o site e inicia uma conversa no WhatsApp.

Guardar separadamente:

- Origem de aquisição: Instagram.
- Ponto de conversão: site/botão para WhatsApp.
- Canal de atendimento: WhatsApp.
- Campanha e referências disponíveis, sem inventar os valores ausentes.
- Primeiro e último contato atribuíveis, responsável, data, consentimento/contexto informado e próximo retorno.

Assim, a venda não aparece apenas como “WhatsApp” quando a aquisição veio do Instagram ou do Google. Um clique no botão representa intenção de contato; o início de uma conversa ou envio do formulário é outro evento.

### Evidência no site atual

Foi lido `arato-site/app/api/contato/route.ts`, sem alterar o projeto ou suas configurações.

O endpoint já encaminha nome, telefone, empresa, origem e informações de autorização de contato para um webhook configurável no servidor. Isso permite reaproveitar o formulário.

No corpo encaminhado por essa rota, não foram encontrados identificadores de campanha/UTM nem um identificador estável do envio para repetição. Essa observação é específica à rota lida; não confirma o estado de uma publicação remota ou de todas as ferramentas de medição do site.

Mudanças propostas para a integração:

1. Receber o formato atual no novo CRM para uma transição compatível.
2. Acrescentar versão do evento, identificador do envio e referências de campanha disponíveis.
3. Confirmar ao site somente após guardar o evento/lead de forma durável.
4. Repetir entregas sem duplicar o lead; não usar apenas nome ou telefone como identificador do evento.
5. Preservar contatos e oportunidades distintos: a mesma pessoa pode voltar a negociar em outro momento.

## 2. Asaas atual e MentoraSys

A proposta inicial é manter a conta Asaas atual e os identificadores existentes, transferindo a gestão das operações do Arato para a nova aplicação. Separar a aplicação não significa recriar clientes, assinaturas ou cobranças no provedor.

A conta precisa ser identificada na implantação. Se houver necessidade de mudar de conta Asaas, o procedimento deve ser redesenhado, pois os identificadores e recorrências precisam ser tratados no contexto da conta correta.

### Inventário antes da transferência

Relacionar cada contrato/assinatura do Arato com:

- `conta_id` no Arato;
- identificador de origem no MentoraSys;
- identificação da conta Asaas;
- cliente e assinatura no Asaas, quando existentes;
- cobranças já geradas, períodos correspondentes, situação e recebimentos;
- próximo período ainda não faturado;
- responsável pela geração atual da cobrança;
- responsável pelas notificações ao cliente.

O vínculo deve identificar a contratação do Arato. Não basta selecionar todos os pagamentos de um cliente Asaas: um mesmo pagador pode comprar outros serviços administrados pelo MentoraSys.

### Um único gerador por assinatura

- Se a recorrência já for gerada pelo Asaas, a nova aplicação acompanha as cobranças dessa assinatura; não recria a recorrência nem cria mensalidades paralelas.
- Se o MentoraSys gerar cobranças avulsas a cada período, a nova aplicação assume somente os períodos posteriores à data de corte, após desligar a geração antiga para aqueles contratos.
- O cron de cobrança já existente no Arato também deve entrar no inventário, para não se tornar um terceiro gerador do mesmo período.
- Cancelar ou alterar uma assinatura não deve modificar automaticamente cobranças históricas já pagas. Cobranças pendentes e obrigações já existentes seguem regras próprias.

### Sincronização e notificações

O novo consumidor de eventos deve usar o identificador do evento e do recurso no Asaas para tratar repetição. Eventos desconhecidos ou de outros serviços ficam separados para conferência; não devem alterar contratos Arato por mera coincidência de nome ou pagador.

No início, acompanhar eventos e conciliar os dados em modo de conferência. Esse modo não cria cobranças, altera acesso ao Arato ou envia mensagens.

Escolher um responsável por cada tipo/canal de aviso: Asaas, MentoraSys ou nova aplicação. A configuração deve impedir o envio de duas faturas ou dois lembretes equivalentes por sistemas diferentes.

A disponibilidade e a configuração de webhooks devem ser verificadas na conta existente, preservando os endpoints que atendem outros serviços do MentoraSys.

## 3. Contratos dos conectores

Todos os conectores devem normalizar os dados para eventos internos versionados. O recebimento do webhook e seu processamento de negócio são etapas distintas.

| Conector | Chave para repetição | Ação permitida ao receber |
|---|---|---|
| Site | Origem + identificador estável do envio | Guardar lead/atividade e enfileirar distribuição |
| Instagram | Conta profissional + identificador do evento/mensagem/lead | Guardar interação e vincular contato; enriquecer origem quando houver evidência |
| WhatsApp | Conta/número empresarial + identificador da mensagem/evento | Atualizar histórico e estado da mensagem; preservar eventos repetidos |
| Google lead form | Conta/formulário + identificador do lead | Guardar lead com referência da campanha e versão original do evento |
| Asaas | Conta do provedor + ID do evento; recursos vinculados pelos IDs originais | Conciliar fatura/pagamento mapeados, sem gerar outra cobrança ao receber confirmação |
| Arato | ID da conta + ID/versão do evento | Atualizar representação administrativa do cliente e confirmar comandos autorizados |

A falha no processamento deve ficar visível e permitir repetição controlada. Envio de mensagem, ativação de licença e criação de cobrança precisam de comandos próprios e auditáveis; não podem ser consequências não rastreadas de uma tentativa repetida de importar dados.

## 4. Ordem de implementação

1. Aplicação própria, acesso da equipe, ficha de cliente e ligação somente de leitura ao Arato.
2. CRM, contatos, oportunidades, tarefas e conector do formulário do site com identificação de origem.
3. Atribuição Instagram/Google e integração oficial do WhatsApp conforme as contas disponíveis; acrescentar Direct/lead ads quando aplicáveis.
4. Propostas, contratos, assinatura comercial, calendário e alertas de renovação.
5. Importação e conciliação das operações Arato já existentes no Asaas/MentoraSys.
6. Piloto de faturamento e notificações após definir o gerador único e a data de corte.
7. Despesas, resultado, comissões, retenção e demais indicadores previstos em `PROPOSTA.md`.

Critérios de validação: quatro origens distinguíveis; repetição de um evento sem duplicidade; cliente existente associado à conta correta; histórico pago importado sem nova cobrança; próxima competência faturada uma única vez; mensagens com situação confirmada; demais produtos do MentoraSys preservados.

## Fontes primárias consultadas

- [Meta — WhatsApp Business Platform](https://developers.facebook.com/documentation/business-messaging/whatsapp/overview): APIs empresariais, autenticação, mensagens e webhooks.
- [Meta — Instagram Messaging](https://developers.facebook.com/documentation/business-messaging/instagram-messaging/changelog/): recursos e eventos da integração de mensagens para contas profissionais; configuração conforme a modalidade vigente.
- [Google — Lead Form Webhook](https://developers.google.com/google-ads/webhook/docs/overview): envio de leads de formulários de anúncios ao CRM por webhook.
- [Asaas — Introdução a cobranças](https://docs.asaas.com/docs/guia-de-cobrancas): cliente, cobrança, confirmação por eventos e estratégia de comunicação sem avisos duplicados.
- [Asaas — Webhooks e eventos](https://docs.asaas.com/docs/webhooks-e-eventos): sincronização e processamento de mudanças posteriores à criação da cobrança.
