import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "./supabase-servidor";
import { cookies } from "next/headers";
import { isRaccotloAdmin } from "./raccotlo-auth";

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

/**
 * Retorna o user autenticado via cookies da sessão do browser.
 * Retorna null se não autenticado ou sessão inválida.
 */
export async function getSessionUser() {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: () => {},
      },
    },
  );
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

/**
 * Usuário da requisição: token Bearer enviado pelo cliente (renovado no navegador — não expira com a aba
 * ociosa) ou, na falta dele, o cookie de sessão. Retorna null se nenhum for válido.
 */
export async function getRequestUser(authHeader?: string | null) {
  const token = (authHeader ?? "").replace(/^Bearer\s+/i, "").trim();
  if (token) {
    const { data: { user } } = await adminClient().auth.getUser(token);
    if (user) return user;
  }
  return getSessionUser();
}

/**
 * Exige uma sessão de administrador interno para operações globais.
 * Endpoints que administram a instância WhatsApp, por exemplo, não podem ser
 * liberados a clientes somente porque eles possuem uma sessão válida.
 */
export async function requireRaccotloAdmin(): Promise<
  | { ok: true; userId: string }
  | { ok: false; status: 401 | 403; error: string }
> {
  const user = await getSessionUser();
  if (!user) return { ok: false, status: 401, error: "Não autenticado" };

  const { data: perfil } = await adminClient()
    .from("perfis")
    .select("role")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!isRaccotloAdmin(perfil?.role, user.email)) {
    return { ok: false, status: 403, error: "Acesso administrativo restrito" };
  }

  return { ok: true, userId: user.id };
}

/**
 * Valida que o usuário autenticado tem acesso à fazenda solicitada.
 * Raccotlo bypassa a verificação.
 * Retorna { ok: true } ou { ok: false, status: 401|403 }
 */
export async function validateFazendaAccess(
  fazenda_id: string,
  authHeader?: string,
): Promise<{ ok: true; userId: string } | { ok: false; status: number; error: string }> {
  // Tenta obter usuário via Authorization header (Bearer token) ou cookies
  let userId: string | null = null;

  if (authHeader) {
    const token = authHeader.replace("Bearer ", "").trim();
    if (token) {
      const { data: { user } } = await adminClient().auth.getUser(token);
      if (user) { userId = user.id; }
    }
  }

  if (!userId) {
    const user = await getSessionUser();
    if (user) { userId = user.id; }
  }

  if (!userId) return { ok: false, status: 401, error: "Não autenticado" };

  const { data: perfil } = await adminClient()
    .from("perfis")
    .select("conta_id, role")
    .eq("user_id", userId)
    .maybeSingle();

  if (perfil?.role?.startsWith("raccotlo")) return { ok: true, userId };

  if (!perfil?.conta_id) return { ok: false, status: 403, error: "Perfil sem conta vinculada" };

  const { data: fazenda } = await adminClient()
    .from("fazendas")
    .select("conta_id")
    .eq("id", fazenda_id)
    .maybeSingle();

  if (!fazenda || fazenda.conta_id !== perfil.conta_id) {
    return { ok: false, status: 403, error: "Acesso negado a esta fazenda" };
  }

  return { ok: true, userId };
}

// ── Guardas curtas para rotas de API (23/10/2026) ───────────────────────────────────────────────────────────────
// Várias rotas de NF/CT-e/MDF-e aceitavam pedidos sem login. Estas funções devolvem a resposta de erro (401/403/404)
// ou null quando o acesso é permitido. Use a verificação pelo REGISTRO (a NF, o CT-e...) sempre que a rota mexer num
// registro: validar só a fazenda informada no corpo deixaria alguém mandar a própria fazenda com o id de outro cliente.

const auth = (req: Request) => req.headers.get("authorization") ?? undefined;

/** Exige login e acesso à fazenda informada. */
export async function exigirAcessoFazenda(req: Request, fazendaId: string | null | undefined): Promise<NextResponse | null> {
  if (!fazendaId) return NextResponse.json({ ok: false, error: "fazenda_id obrigatório" }, { status: 400 });
  const r = await validateFazendaAccess(fazendaId, auth(req));
  return r.ok ? null : NextResponse.json({ ok: false, error: r.error }, { status: r.status });
}

/** Exige login e acesso à fazenda dona do registro (tabela.id → fazenda_id). */
export async function exigirAcessoRegistro(req: Request, tabela: string, id: string | null | undefined): Promise<NextResponse | null> {
  if (!id) return NextResponse.json({ ok: false, error: "id do registro obrigatório" }, { status: 400 });
  const { data } = await adminClient().from(tabela).select("fazenda_id").eq("id", id).maybeSingle();
  if (!data) {
    // registro inexistente: ainda exige login para não revelar nada a quem não está autenticado
    const u = await getRequestUser(auth(req));
    return u ? NextResponse.json({ ok: false, error: "Registro não encontrado" }, { status: 404 }) : NextResponse.json({ ok: false, error: "Não autenticado" }, { status: 401 });
  }
  return exigirAcessoFazenda(req, (data as { fazenda_id: string }).fazenda_id);
}

/** Exige só estar logado (rotas sem registro nem fazenda definidos). */
export async function exigirLogin(req: Request): Promise<NextResponse | null> {
  const u = await getRequestUser(auth(req));
  return u ? null : NextResponse.json({ ok: false, error: "Não autenticado" }, { status: 401 });
}
