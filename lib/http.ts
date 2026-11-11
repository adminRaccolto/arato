/** Prazo da requisição inteira, incluindo conexão. Não repete gravações automaticamente. */
export function fetchComTimeout(input: string | URL | Request, init: RequestInit = {}, prazoMs = 30_000): Promise<Response> {
  const timeout = AbortSignal.timeout(prazoMs);
  const signal = init.signal ? AbortSignal.any([init.signal, timeout]) : timeout;
  return fetch(input, { ...init, signal });
}
