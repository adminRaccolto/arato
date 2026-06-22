import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

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
  let userEmail: string | null = null;

  if (authHeader) {
    const token = authHeader.replace("Bearer ", "").trim();
    if (token) {
      const { data: { user } } = await admin.auth.getUser(token);
      if (user) { userId = user.id; userEmail = user.email ?? null; }
    }
  }

  if (!userId) {
    const user = await getSessionUser();
    if (user) { userId = user.id; userEmail = user.email ?? null; }
  }

  if (!userId) return { ok: false, status: 401, error: "Não autenticado" };

  // Raccotlo bypassa verificação de tenant
  if ((userEmail ?? "").toLowerCase().endsWith("@raccolto.com.br")) {
    return { ok: true, userId };
  }

  const { data: perfil } = await admin
    .from("perfis")
    .select("conta_id, role")
    .eq("user_id", userId)
    .maybeSingle();

  if (perfil?.role === "raccotlo") return { ok: true, userId };

  if (!perfil?.conta_id) return { ok: false, status: 403, error: "Perfil sem conta vinculada" };

  const { data: fazenda } = await admin
    .from("fazendas")
    .select("conta_id")
    .eq("id", fazenda_id)
    .maybeSingle();

  if (!fazenda || fazenda.conta_id !== perfil.conta_id) {
    return { ok: false, status: 403, error: "Acesso negado a esta fazenda" };
  }

  return { ok: true, userId };
}
