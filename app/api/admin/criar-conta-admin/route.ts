/**
 * POST /api/admin/criar-conta-admin
 * Cria uma conta SaaS para um cliente que ainda não tem conta,
 * e vincula as fazendas do produtor à nova conta.
 * Usa service_role_key para bypassar RLS.
 */
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    // ── 1. Auth raccotlo ──────────────────────────────────────────────────────
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

    const admin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    );

    const { data: perfil } = await admin
      .from("perfis")
      .select("role")
      .eq("user_id", user.id)
      .maybeSingle();

    const isGino = (user.email ?? "").toLowerCase() === "gino@raccolto.com.br";
    if (!isGino && perfil?.role !== "raccotlo" && perfil?.role !== "raccotlo_gestor") {
      return NextResponse.json({ ok: false, error: "Acesso restrito" }, { status: 403 });
    }

    // ── 2. Criar conta ────────────────────────────────────────────────────────
    const body = await req.json() as {
      nome: string;
      tipo: string;
      status: string;
      pacote: string;
      valor_mensalidade: number;
      data_inicio: string;
      fazenda_ids: string[];
    };

    const { data: novaConta, error: contaErr } = await admin
      .from("contas")
      .insert({
        nome: body.nome,
        tipo: body.tipo,
        status: body.status,
        pacote: body.pacote,
        valor_mensalidade: body.valor_mensalidade,
        data_inicio: body.data_inicio,
      })
      .select()
      .single();

    if (contaErr || !novaConta) {
      return NextResponse.json({ ok: false, error: contaErr?.message ?? "Erro ao criar conta" }, { status: 500 });
    }

    // ── 3. Vincular fazendas à nova conta ─────────────────────────────────────
    for (const fazId of body.fazenda_ids ?? []) {
      await admin.from("fazendas").update({ conta_id: novaConta.id }).eq("id", fazId);
    }

    return NextResponse.json({ ok: true, conta: novaConta });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
