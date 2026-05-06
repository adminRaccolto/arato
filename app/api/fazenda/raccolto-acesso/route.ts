import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

export async function POST(req: Request) {
  try {
    // Verifica sessão do usuário
    const cookieStore = await cookies();
    const supabaseUser = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { cookies: { getAll: () => cookieStore.getAll() } }
    );

    const { data: { user }, error: authErr } = await supabaseUser.auth.getUser();
    if (authErr || !user) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
    }

    const { fazenda_id, ativo } = await req.json();
    if (!fazenda_id || typeof ativo !== "boolean") {
      return NextResponse.json({ error: "Parâmetros inválidos" }, { status: 400 });
    }

    // Verifica que o usuário pertence à conta que tem esta fazenda
    const supabase = adminClient();
    const { data: perfil } = await supabase
      .from("perfis")
      .select("conta_id, role")
      .eq("user_id", user.id)
      .single();

    if (!perfil) {
      return NextResponse.json({ error: "Acesso negado" }, { status: 403 });
    }

    // Raccotlo pode atualizar qualquer fazenda
    if (perfil.role !== "raccotlo") {
      // Cliente só pode atualizar fazendas da própria conta
      const { data: fazenda } = await supabase
        .from("fazendas")
        .select("conta_id")
        .eq("id", fazenda_id)
        .single();

      if (!fazenda || fazenda.conta_id !== perfil.conta_id) {
        return NextResponse.json({ error: "Acesso negado" }, { status: 403 });
      }
    }

    // Atualiza com service role (ignora RLS)
    const { error } = await supabase
      .from("fazendas")
      .update({ raccolto_acesso: ativo })
      .eq("id", fazenda_id);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ ok: true, raccolto_acesso: ativo });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
