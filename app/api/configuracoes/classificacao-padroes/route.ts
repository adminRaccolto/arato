import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization") ?? "";
    const jwt = authHeader.replace(/^Bearer\s+/i, "");
    if (!jwt) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

    const { data: { user }, error: authErr } = await supabaseAdmin.auth.getUser(jwt);
    if (authErr || !user) return NextResponse.json({ error: "Token inválido" }, { status: 401 });

    const body = await req.json();
    const { fazenda_id, rows } = body ?? {};
    if (!fazenda_id || !Array.isArray(rows) || rows.length === 0) {
      return NextResponse.json({ error: "Parâmetros inválidos" }, { status: 400 });
    }

    // Verifica que a fazenda pertence à conta do usuário (ou é raccotlo)
    const { data: perfil } = await supabaseAdmin
      .from("perfis")
      .select("conta_id, role")
      .eq("user_id", user.id)
      .single();

    if (!perfil) return NextResponse.json({ error: "Perfil não encontrado" }, { status: 403 });

    if (perfil.role !== "raccotlo") {
      const { data: fazenda } = await supabaseAdmin
        .from("fazendas")
        .select("id")
        .eq("id", fazenda_id)
        .eq("conta_id", perfil.conta_id)
        .single();
      if (!fazenda) return NextResponse.json({ error: "Fazenda não pertence à conta" }, { status: 403 });
    }

    // Verifica NCMs já existentes para não duplicar
    const { data: existentes } = await supabaseAdmin
      .from("regras_classificacao_nf")
      .select("ncm")
      .eq("fazenda_id", fazenda_id);
    const ncmsExistentes = new Set((existentes ?? []).map((r: { ncm?: string }) => r.ncm).filter(Boolean));

    const novos = rows.filter((r: { ncm?: string }) => !ncmsExistentes.has(r.ncm));
    if (novos.length === 0) {
      return NextResponse.json({ inseridos: 0, msg: "Todos os padrões já estão cadastrados." });
    }

    const payload = novos.map((r: Record<string, unknown>) => ({ ...r, fazenda_id }));
    const { error: errIns } = await supabaseAdmin.from("regras_classificacao_nf").insert(payload);
    if (errIns) return NextResponse.json({ error: errIns.message }, { status: 500 });

    return NextResponse.json({ inseridos: novos.length });
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
