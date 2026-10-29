# CIOT

A reserva do número em produção usa o endpoint da biblioteca oficial
`GeradorCIOTShared.dll`, distribuída pela ANTT em
<https://appservices.antt.gov.br/pefServices/Downloads/GeradorCIOT_DLL.zip>
e vinculada na página de [documentos técnicos](https://www.gov.br/antt/pt-br/assuntos/cargas/ciot-para-todos-1/documentos-tecnicos).

- Configure `ANTT_GERADOR_CHAVE` no ambiente do servidor com a chave de integração
  distribuída nessa biblioteca. Não use prefixo `NEXT_PUBLIC_`.
- O gerador recebe `POST /token` com `{}` e header `chave`, seguido de
  `POST /gerar` com `{cpfCnpj}` e `Authorization: Bearer ...`.
- O certificado A1 e a chave privada não são enviados ao gerador. Declaração,
  consulta, cancelamento e encerramento continuam no PEF com mTLS.
- Homologação permanece no endpoint de homologação existente; nunca se usa
  o gerador de produção como fallback para testes.
- Não repetir reservas automaticamente após falha de transporte.

A correção de 29/10/2026 foi verificada com autenticação real no gerador e
consulta de situação no PEF de produção, sem emitir uma operação de teste.
