/**
 * POST /api/admin/buscar-auth-user
 * Retorna o auth_user_id (UUID) de um usuário pelo email.
 * Usado para vincular usuários criados manualmente à conta Auth.
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

    const { email } = await req.json() as { email: string };
    if (!email) return NextResponse.json({ ok: false, error: "Email obrigatório" }, { status: 400 });

    const { data: lista } = await admin.auth.admin.listUsers();
    const target = lista?.users.find(u => u.email?.toLowerCase() === email.toLowerCase());
    if (!target) return NextResponse.json({ ok: false, auth_user_id: null });

    return NextResponse.json({ ok: true, auth_user_id: target.id });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
