/**
 * POST /api/admin/atualizar-role-usuario
 * Atualiza o role (campo | client) de um usuário pertencente à mesma conta do caller.
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

    // Verifica conta do caller
    const { data: callerPerfil } = await admin.from("perfis").select("conta_id, role").eq("user_id", user.id).maybeSingle();
    const callerRole = callerPerfil?.role ?? "";
    const isRaccotlo = ["raccotlo", "raccotlo_gestor"].includes(callerRole);
    const callerContaId = callerPerfil?.conta_id;
    if (!callerContaId && !isRaccotlo) {
      return NextResponse.json({ ok: false, error: "Sem permissão" }, { status: 403 });
    }

    const { auth_user_id, role } = await req.json() as { auth_user_id: string; role: string };
    if (!auth_user_id || !["campo", "client"].includes(role)) {
      return NextResponse.json({ ok: false, error: "Parâmetros inválidos" }, { status: 400 });
    }

    // Verifica que o usuário alvo pertence à mesma conta (ou raccotlo pode tudo)
    if (!isRaccotlo) {
      const { data: targetPerfil } = await admin.from("perfis").select("conta_id").eq("user_id", auth_user_id).maybeSingle();
      if (targetPerfil?.conta_id !== callerContaId) {
        return NextResponse.json({ ok: false, error: "Usuário não pertence à sua conta" }, { status: 403 });
      }
    }

    const { error } = await admin.from("perfis").update({ role }).eq("user_id", auth_user_id);
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
