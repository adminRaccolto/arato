import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

// Garante que o usuário autenticado tem uma conta e um perfil vinculado.
// Usado no onboarding do primeiro login — substitui criarContaTenant() no cliente.
export async function POST(req: Request) {
  try {
    const cookieStore = await cookies();
    const supabaseUser = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { cookies: { getAll: () => cookieStore.getAll() } },
    );
    const { data: { user }, error: authErr } = await supabaseUser.auth.getUser();
    if (authErr || !user) {
      return NextResponse.json({ ok: false, error: "Não autenticado" }, { status: 401 });
    }

    const body = await req.json() as { fazenda_id: string; nome?: string };
    if (!body.fazenda_id) {
      return NextResponse.json({ ok: false, error: "fazenda_id obrigatório" }, { status: 400 });
    }

    const admin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    );

    // 1. Verifica se o perfil já tem conta_id
    const { data: perfil } = await admin
      .from("perfis")
      .select("conta_id, nome")
      .eq("user_id", user.id)
      .maybeSingle();

    let contaId: string = (perfil as { conta_id?: string } | null)?.conta_id ?? "";

    // 2. Cria conta se ainda não existe
    if (!contaId) {
      const nomeConta = body.nome
        || (perfil as { nome?: string } | null)?.nome
        || user.email
        || "Minha Conta";

      const { data: novaConta, error: errConta } = await admin
        .from("contas")
        .insert({ nome: nomeConta, tipo: "pf" })
        .select()
        .single();

      if (errConta || !novaConta) {
        return NextResponse.json({ ok: false, error: errConta?.message ?? "Erro ao criar conta" }, { status: 500 });
      }
      contaId = novaConta.id;
    }

    // 3. Vincula fazenda à conta (caso ainda não esteja)
    await admin
      .from("fazendas")
      .update({ conta_id: contaId })
      .eq("id", body.fazenda_id)
      .is("conta_id", null);

    // 4. Upsert do perfil com fazenda e conta ativos
    await admin
      .from("perfis")
      .upsert(
        { user_id: user.id, fazenda_id: body.fazenda_id, conta_id: contaId, nome: user.email },
        { onConflict: "user_id" },
      );

    return NextResponse.json({ ok: true, conta_id: contaId });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
