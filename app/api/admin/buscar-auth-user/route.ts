/**
 * POST /api/admin/buscar-auth-user
 * Retorna o auth_user_id (UUID) de um usuário pelo email.
 * Usado para vincular usuários criados manualmente à conta Auth.
 */
import { NextResponse } from "next/server";
import { createClient } from "../../../../lib/supabase-servidor";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { acessoDoUsuario } from "../../../../lib/api-auth";

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

    // Percorre todas as páginas: a primeira só traz 50 usuários, e os demais pareciam não existir
    let target: { id: string; email?: string } | undefined;
    for (let page = 1; !target; page++) {
      const { data: lista } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
      target = lista?.users.find(u => u.email?.toLowerCase() === email.toLowerCase());
      if (!lista?.users.length || lista.users.length < 1000) break;
    }
    if (!target) return NextResponse.json({ ok: false, auth_user_id: null });

    // Só devolve login do mesmo cliente, ou ainda sem cliente (vínculo de usuário criado à mão)
    const acesso = await acessoDoUsuario(user.id, user.email);
    if (!acesso.raccolto) {
      const { data: perfilAlvo } = await admin.from("perfis").select("conta_id").eq("user_id", target.id).maybeSingle();
      if (perfilAlvo?.conta_id && !acesso.contas.includes(perfilAlvo.conta_id as string)) {
        return NextResponse.json({ ok: false, auth_user_id: null });
      }
    }

    return NextResponse.json({ ok: true, auth_user_id: target.id });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
