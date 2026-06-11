import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { seedCfopsFiscais } from "../../../lib/seedOperacoesGerenciais";

export async function POST(req: Request) {
  try {
    // ── 1. Verifica autenticação ──────────────────────────────────────────────
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

    const body = await req.json() as { fazenda_id: string };
    if (!body.fazenda_id) {
      return NextResponse.json({ ok: false, error: "fazenda_id é obrigatório" }, { status: 400 });
    }

    // ── 2. Usa service role para contornar RLS ────────────────────────────────
    const adminClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    );

    const resultado = await seedCfopsFiscais(body.fazenda_id, adminClient);
    return NextResponse.json({ ok: true, ...resultado });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
