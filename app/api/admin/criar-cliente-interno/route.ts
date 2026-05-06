import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { criarClienteCompleto, CriarClientePayload } from "../../../../lib/criarClienteCompleto";

// Proxy interno — valida sessão raccotlo e chama a lógica de criação diretamente,
// sem HTTP round-trip (self-request não é confiável em serverless).

export async function POST(req: Request) {
  try {
    // ── 1. Verificar sessão e role raccotlo ──
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

    const adminSupa = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );
    const { data: perfil } = await adminSupa
      .from("perfis")
      .select("role")
      .eq("user_id", user.id)
      .single();

    if (perfil?.role !== "raccotlo") {
      return NextResponse.json({ ok: false, error: "Acesso restrito à equipe Raccolto" }, { status: 403 });
    }

    // ── 2. Chamar a lógica de criação diretamente ──
    const body = await req.json() as CriarClientePayload;
    const result = await criarClienteCompleto(body);
    return NextResponse.json(result);
  } catch (err) {
    console.error("[criar-cliente-interno] ERRO:", String(err));
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
