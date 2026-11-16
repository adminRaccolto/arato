export function segundosRetryAfter(valor: string | null, agora = Date.now()): number {
  if (!valor?.trim()) return 60;
  const segundos = Number(valor);
  const espera = Number.isFinite(segundos) ? segundos : (Date.parse(valor) - agora) / 1000;
  return Number.isFinite(espera) ? Math.max(1, Math.ceil(espera)) : 60;
}

export function apresentarDiagnosticoSieg(status: number, etapa = "baixar-xmls") {
  if (status === 429) return { tipo: "aviso", situacao: "limite_requisicoes", titulo: "Limite de consultas atingido", mensagem: "O SIEG recebeu muitas requisições. Aguarde o prazo indicado antes de testar novamente. Este retorno não confirma nem rejeita a credencial." };
  if (status >= 200 && status < 300) return { tipo: "sucesso", situacao: "autenticado", titulo: "Acesso confirmado", mensagem: "O SIEG aceitou a autenticação e a consulta de documentos." };
  if (status === 404 && etapa === "baixar-xmls") return { tipo: "aviso", situacao: "sem_documentos", titulo: "Consulta sem documentos", mensagem: "O SIEG não localizou documentos nesta janela de teste. Esse resultado não deve ser apresentado como chave inválida." };
  if (status === 401 || status === 403) return { tipo: "erro", situacao: "acesso_recusado", titulo: "Acesso recusado pelo SIEG", mensagem: "Verifique as credenciais ativas da integração e as permissões de acesso no SIEG." };
  return { tipo: "erro", situacao: "indisponivel", titulo: status ? "Consulta indisponível" : "Falha de comunicação", mensagem: "Não foi possível concluir o teste. Tente novamente mais tarde; a validade da credencial não foi confirmada." };
}
