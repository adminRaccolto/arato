// Resolve o cliente (conta_id) do usuário logado para as rotas de Conciliação.
// Rotas usam service_role (ignoram RLS), então a autorização é feita aqui.
import { createClient } from "@supabase/supabase-js";
import { getSessionUser } from "./api-auth";

export const adminSb = () =>
  createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

export type Tenant =
  | { ok: true; userId: string; contaId: string; fazendaIds: string[] }
  | { ok: false; status: number; error: string };

export async function resolverTenant(contaIdParam?: string | null): Promise<Tenant> {
  const user = await getSessionUser();
  if (!user) return { ok: false, status: 401, error: "Não autenticado" };
  const sb = adminSb();
  const { data: perfil } = await sb.from("perfis").select("conta_id, role").eq("user_id", user.id).maybeSingle();
  const raccotlo = !!perfil?.role?.startsWith("raccotlo");
  const contaId = raccotlo ? (contaIdParam || perfil?.conta_id) : perfil?.conta_id;
  if (!contaId) return { ok: false, status: 403, error: "Perfil sem conta vinculada" };
  const { data: faz } = await sb.from("fazendas").select("id").eq("conta_id", contaId);
  return { ok: true, userId: user.id, contaId, fazendaIds: (faz ?? []).map(f => f.id as string) };
}

// Tabela ainda não criada (migração pendente)?
export const tabelaAusente = (e: { code?: string; message?: string } | null | undefined) =>
  !!e && (e.code === "42P01" || e.code === "PGRST205" || /does not exist|schema cache/i.test(e.message ?? ""));
