import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

export async function POST(req: NextRequest) {
  try {
    // Validate input
    const body = await req.json();
    const { contrato_financeiro_id, data_vencimento, categoria, valor } = body ?? {};
    if (!contrato_financeiro_id || !data_vencimento || !categoria || valor === undefined) {
      return NextResponse.json({ error: "Parâmetros obrigatórios ausentes" }, { status: 400 });
    }

    // Get fazenda_id from JWT — never from request body
    const authHeader = req.headers.get("authorization") ?? "";
    const jwt = authHeader.replace(/^Bearer\s+/i, "");
    if (!jwt) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

    const { data: { user }, error: authErr } = await supabaseAdmin.auth.getUser(jwt);
    if (authErr || !user) return NextResponse.json({ error: "Token inválido" }, { status: 401 });

    const { data: perfil, error: perfilErr } = await supabaseAdmin
      .from("perfis")
      .select("fazenda_id, role")
      .eq("user_id", user.id)
      .single();

    if (perfilErr || !perfil) return NextResponse.json({ error: "Perfil não encontrado" }, { status: 403 });
    if (perfil.role !== "raccotlo") return NextResponse.json({ error: "Sem permissão" }, { status: 403 });

    // Raccotlo pode operar em qualquer fazenda — busca o contrato pelo ID e usa a fazenda_id do próprio contrato
    const { data: contrato, error: contratoErr } = await supabaseAdmin
      .from("contratos_financeiros")
      .select("id, fazenda_id")
      .eq("id", contrato_financeiro_id)
      .single();

    if (contratoErr || !contrato) {
      return NextResponse.json({ error: "Contrato não encontrado" }, { status: 404 });
    }

    const fazendaId = contrato.fazenda_id as string;

    // Fetch all duplicate lancamentos for this contrato / data / categoria / valor
    const { data: lancamentos, error: listErr } = await supabaseAdmin
      .from("lancamentos")
      .select("id, created_at")
      .eq("fazenda_id", fazendaId)
      .eq("contrato_financeiro_id", contrato_financeiro_id)
      .eq("data_vencimento", data_vencimento)
      .eq("categoria", categoria)
      .eq("valor", valor)
      .eq("tipo", "pagar")
      .order("created_at", { ascending: true });

    if (listErr) return NextResponse.json({ error: listErr.message }, { status: 500 });
    if (!lancamentos || lancamentos.length <= 1) {
      return NextResponse.json({ deletados: 0, message: "Sem duplicatas encontradas" });
    }

    // Keep the oldest, delete the rest
    const [, ...extras] = lancamentos;
    const idsParaDeletar = extras.map((l: { id: string }) => l.id);

    const { error: deleteErr } = await supabaseAdmin
      .from("lancamentos")
      .delete()
      .in("id", idsParaDeletar)
      .eq("fazenda_id", fazendaId); // double filter for safety

    if (deleteErr) return NextResponse.json({ error: deleteErr.message }, { status: 500 });

    return NextResponse.json({ deletados: idsParaDeletar.length });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
