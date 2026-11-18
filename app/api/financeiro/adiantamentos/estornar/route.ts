import { NextRequest, NextResponse } from "next/server";
import { exigirAcessoRegistro } from "../../../../../lib/api-auth";
import { createClient } from "../../../../../lib/supabase-servidor";

// Estorna um pagamento do adiantamento a fornecedor (Seção 459). Usado pela tela de Adiantamentos e pelo Reabrir do CP.
export async function POST(req: NextRequest) {
  try {
    const p = await req.json() as { lancamento_id?: string };
    if (!p.lancamento_id) return NextResponse.json({ ok: false, error: "Informe o pagamento a estornar." }, { status: 400 });
    const negado = await exigirAcessoRegistro(req, "lancamentos", p.lancamento_id);
    if (negado) return negado;
    const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
    const { data, error } = await sb.rpc("estornar_pagamento_adiantamento", { p_pagamento: p.lancamento_id });
    if (error) return NextResponse.json({ ok: false, error: error.code === "PGRST202" ? "Execute a Seção 459 do supabase_migrations.sql para estornar pagamentos de adiantamento." : error.message }, { status: 400 });
    return NextResponse.json(data);
  } catch (e: unknown) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "Erro ao estornar o pagamento do adiantamento." }, { status: 500 });
  }
}
