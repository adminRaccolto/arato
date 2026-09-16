/**
 * Cache TTL em memória (client-side) para dados de catálogo/cadastro que
 * mudam raramente mas eram buscados do zero a cada navegação de tela —
 * fazendas, produtores, pessoas, empresas, contas bancárias, anos-safra,
 * centros de custo, operações gerenciais, formas de pagamento, grupos e
 * subgrupos de insumo, tipos de pessoa, cartões.
 *
 * NUNCA usar para dados transacionais (lançamentos, NFs, estoque, operações
 * de lavoura, contratos) — esses precisam estar sempre atualizados na tela.
 *
 * Vive só na aba do navegador (módulo client-side comum) — some sozinho ao
 * recarregar a página, não é compartilhado entre usuários nem persistido.
 */

type Entry<T> = { value: T; expires: number };

const store = new Map<string, Entry<unknown>>();
const TTL_PADRAO_MS = 45_000;

export async function cached<T>(key: string, fetcher: () => Promise<T>, ttlMs: number = TTL_PADRAO_MS): Promise<T> {
  const hit = store.get(key);
  if (hit && hit.expires > Date.now()) return hit.value as T;
  const value = await fetcher();
  store.set(key, { value, expires: Date.now() + ttlMs });
  return value;
}

// Limpa todas as entradas de um prefixo (ex: "fazendas") — chamado depois de
// criar/atualizar/excluir um registro do tipo, pra próxima leitura vir fresca
// em vez de esperar o TTL expirar.
export function invalidateCache(prefix: string): void {
  for (const k of store.keys()) {
    if (k === prefix || k.startsWith(`${prefix}:`)) store.delete(k);
  }
}
