// Chamadas do navegador para as rotas do próprio sistema (/api/...) passam a levar o token de acesso da sessão
// (Authorization: Bearer). As rotas aceitam o token ou o cookie de sessão (lib/api-auth.ts getRequestUser), mas a maioria
// das telas só mandava o cookie — com a aba aberta por muito tempo o cookie vence e a ação falha com "Não autenticado"
// (achado real 28/10/2026, baixa de CP). O token vem de supabase.auth.getSession(), que o renova quando expirou.
import { supabase } from "./supabase";

const MARCA = "__aratoFetchComToken";

function ehRotaInterna(input: RequestInfo | URL): boolean {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  if (url.startsWith("/api/")) return true;
  try { const u = new URL(url, window.location.origin); return u.origin === window.location.origin && u.pathname.startsWith("/api/"); }
  catch { return false; }
}

export function instalarFetchComToken() {
  if (typeof window === "undefined") return;
  const w = window as unknown as Record<string, unknown>;
  if (w[MARCA]) return;
  w[MARCA] = true;
  const original = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    if (!ehRotaInterna(input)) return original(input, init);
    const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
    if (!headers.has("authorization")) {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.access_token) headers.set("authorization", `Bearer ${session.access_token}`);
      } catch { /* sem sessão: segue só com o cookie */ }
    }
    return original(input, { ...init, headers });
  };
}
