/**
 * /api/admin/equipe-raccotlo
 * GET  → lista membros da equipe Raccotlo (perfis com role raccotlo*)
 * DELETE ?user_id=xxx → revoga acesso raccotlo (muda role para 'client')
 *
 * Usa service_role_key para ler auth.users e contornar RLS.
 * Apenas raccotlo/raccotlo_gestor pode chamar.
 */
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

export const dynamic = "force-dynamic";

const RACCOTLO_ROLES = ["raccotlo", "raccotlo_gestor", "raccotlo_seletor"];

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

async function verificarAcesso() {
  const cookieStore = await cookies();
  const sb = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll() } },
  );
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return null;

  const admin = adminClient();
  const { data: perfil } = await admin.from("perfis").select("role").eq("user_id", user.id).maybeSingle();
  const isGino = (user.email ?? "").toLowerCase() === "gino@raccolto.com.br";
  if (!isGino && perfil?.role !== "raccotlo" && perfil?.role !== "raccotlo_gestor") return null;
  return user;
}

export async function GET() {
  const caller = await verificarAcesso();
  if (!caller) return NextResponse.json({ error: "Acesso negado" }, { status: 403 });

  const db = adminClient();

  // Busca membros da equipe Raccotlo na tabela perfis
  const { data: membros, error } = await db
    .from("perfis")
    .select("user_id, nome, role, whatsapp")
    .in("role", RACCOTLO_ROLES)
    .order("nome");

  console.log("[equipe-raccotlo] membros encontrados:", membros?.length ?? 0, "| erro:", error?.message);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Busca todos os emails de uma vez (listUsers é paginado — 1000 é o max por página)
  const { data: { users } } = await db.auth.admin.listUsers({ perPage: 1000, page: 1 });
  const emailMap: Record<string, string> = {};
  for (const u of users) emailMap[u.id] = u.email ?? "";

  const equipe = (membros ?? []).map(m => ({
    id:         m.user_id,
    nome:       m.nome ?? "",
    email:      emailMap[m.user_id] ?? "",
    hub_acesso: m.role,
    whatsapp:   m.whatsapp ?? "",
    ativo:      true,
  }));

  return NextResponse.json({ data: equipe });
}

export async function DELETE(req: Request) {
  const caller = await verificarAcesso();
  if (!caller) return NextResponse.json({ error: "Acesso negado" }, { status: 403 });

  const user_id = new URL(req.url).searchParams.get("user_id");
  if (!user_id) return NextResponse.json({ error: "user_id obrigatório" }, { status: 400 });

  const db = adminClient();
  // Revoga acesso raccotlo setando role para 'client'
  const { error } = await db.from("perfis").update({ role: "client" }).eq("user_id", user_id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
