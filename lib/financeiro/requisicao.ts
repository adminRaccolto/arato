// Mantém a chave quando a resposta se perde. Uma confirmação permite uma nova ação legítima.
const pendentes = new Map<string, string>();
export async function fetchFinanceiro(input: string, init: RequestInit): Promise<Response> {
  const assinatura = `${input}|${String(init.body ?? "")}`;
  const chave = pendentes.get(assinatura) ?? crypto.randomUUID();
  pendentes.set(assinatura, chave);
  const headers = new Headers(init.headers);
  headers.set("x-arato-requisicao", chave);
  const response = await fetch(input, { ...init, headers });
  // Não consumir o corpo do chamador. JSON inválido/resposta interrompida mantém a identificação para repetir.
  const result = await response.clone().json();
  if (result.ok === true || response.status < 500) pendentes.delete(assinatura);
  return response;
}
