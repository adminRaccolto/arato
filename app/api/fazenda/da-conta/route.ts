import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

// Retorna todas as fazendas da conta do cliente ativo (identificado via fazenda_id)
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

    const body = await req.json() as { fazenda_id?: string; conta_id?: string };

    const admin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    );

    let contaId = body.conta_id ?? null;

    // Se não veio conta_id, resolve a partir da fazenda_id
    if (!contaId && body.fazenda_id) {
      const { data: faz } = await admin
        .from("fazendas")
        .select("conta_id, owner_user_id")
        .eq("id", body.fazenda_id)
        .maybeSingle();
      contaId = faz?.conta_id ?? null;
      if (!contaId && faz?.owner_user_id) {
        // Conta legada sem conta_id — busca conta pelo perfil do owner
        const { data: pf } = await admin
          .from("perfis")
          .select("conta_id")
          .eq("user_id", faz.owner_user_id)
          .maybeSingle();
        contaId = pf?.conta_id ?? null;
      }
    }

    if (!contaId) {
      // Sem conta identificada — retorna só a fazenda específica
      if (!body.fazenda_id) return NextResponse.json({ ok: true, fazendas: [] });
      const { data } = await admin.from("fazendas").select("*").eq("id", body.fazenda_id);
      return NextResponse.json({ ok: true, fazendas: data ?? [] });
    }

    const { data, error } = await admin
      .from("fazendas")
      .select("*")
      .eq("conta_id", contaId)
      .order("nome");

    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, fazendas: data ?? [], conta_id: contaId });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
