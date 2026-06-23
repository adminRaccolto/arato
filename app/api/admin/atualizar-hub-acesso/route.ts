/**
 * POST /api/admin/atualizar-hub-acesso
 * Atualiza o role (hub_acesso) de um usuário Raccotlo no perfil.
 * Requer role raccotlo ou raccotlo_gestor.
 */
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const cookieStore = await cookies();
    const supabaseUser = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { cookies: { getAll: () => cookieStore.getAll() } },
    );
    const { data: { user }, error: authErr } = await supabaseUser.auth.getUser();
    if (authErr || !user) return NextResponse.json({ ok: false, error: "Não autenticado" }, { status: 401 });

    const admin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    );

    const { data: perfil } = await admin.from("perfis").select("role").eq("user_id", user.id).maybeSingle();
    const isGino = (user.email ?? "").toLowerCase() === "gino@raccolto.com.br";
    if (!isGino && perfil?.role !== "raccotlo" && perfil?.role !== "raccotlo_gestor") {
      return NextResponse.json({ ok: false, error: "Acesso restrito" }, { status: 403 });
    }

    const { email, hub_acesso } = await req.json() as { email: string; hub_acesso: string };
    if (!email || !hub_acesso) return NextResponse.json({ ok: false, error: "Parâmetros inválidos" }, { status: 400 });

    // Não permite rebaixar o superadmin gino
    if (email.toLowerCase() === "gino@raccolto.com.br") {
      return NextResponse.json({ ok: false, error: "Não é possível alterar o acesso do superadmin." }, { status: 403 });
    }

    // Busca o user_id pelo email
    const { data: lista } = await admin.auth.admin.listUsers();
    const target = lista?.users.find(u => u.email?.toLowerCase() === email.toLowerCase());
    if (!target) return NextResponse.json({ ok: false, error: "Usuário não encontrado" }, { status: 404 });

    const { error } = await admin.from("perfis").update({ role: hub_acesso }).eq("user_id", target.id);
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
