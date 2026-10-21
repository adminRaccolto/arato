// Cliente Supabase das rotas do servidor (service_role) que leva junto QUEM fez a ação.
// A chave de serviço não carrega usuário, então a auditoria (fn_audit_log) gravava "Sistema" em tudo que passava por
// rota do servidor (NF processada, folha, baixa, conciliação...). Aqui cada chamada ao banco envia o cabeçalho
// x-arato-usuario com o id do usuário da requisição (token Bearer ou cookie de sessão), lido na hora da chamada.
// O banco usa esse cabeçalho só quando não há usuário no JWT (Seção 353). Fora de uma requisição (cron) não envia nada.
import { createClient as criarClienteSupabase } from "@supabase/supabase-js";

function subDoJwt(jwt: string | null | undefined): string | null {
  try {
    const partes = String(jwt ?? "").split(".");
    if (partes.length < 2) return null;
    const json = JSON.parse(Buffer.from(partes[1].replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8"));
    return typeof json.sub === "string" && /^[0-9a-f-]{36}$/i.test(json.sub) ? json.sub : null;
  } catch { return null; }
}

/** Token da sessão no cookie do Supabase (sb-<projeto>-auth-token, às vezes em pedaços .0/.1 e com prefixo base64-). */
function tokenDoCookie(todos: { name: string; value: string }[]): string | null {
  const auth = todos.filter(c => /^sb-.+-auth-token(\.\d+)?$/.test(c.name)).sort((a, b) => a.name.localeCompare(b.name));
  if (!auth.length) return null;
  let bruto = auth.map(c => c.value).join("");
  try {
    if (bruto.startsWith("base64-")) bruto = Buffer.from(bruto.slice(7), "base64").toString("utf8");
    const j = JSON.parse(decodeURIComponent(bruto));
    return (Array.isArray(j) ? j[0] : j?.access_token) ?? null;
  } catch { return null; }
}

export async function usuarioDaRequisicao(): Promise<string | null> {
  try {
    const { headers, cookies } = await import("next/headers");
    const h = await headers();
    const bearer = (h.get("authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
    const doBearer = subDoJwt(bearer);
    if (doBearer) return doBearer;
    return subDoJwt(tokenDoCookie((await cookies()).getAll()));
  } catch {
    return null;   // fora de uma requisição (cron, script)
  }
}

const fetchComUsuario = (base?: typeof fetch): typeof fetch => async (input, init) => {
  const uid = await usuarioDaRequisicao();
  if (!uid) return (base ?? fetch)(input, init);
  const h = new Headers(init?.headers);
  h.set("x-arato-usuario", uid);
  return (base ?? fetch)(input, { ...init, headers: h });
};

/** Mesma assinatura do createClient do supabase-js, com o usuário da requisição em cada chamada. */
export const createClient = ((url: string, key: string, options?: Record<string, unknown>) => {
  const global = (options?.global ?? {}) as { fetch?: typeof fetch } & Record<string, unknown>;
  return criarClienteSupabase(url, key, { ...(options ?? {}), global: { ...global, fetch: fetchComUsuario(global.fetch) } } as never);
}) as typeof criarClienteSupabase;
