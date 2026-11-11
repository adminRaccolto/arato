import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { createClient } from "../../../../lib/supabase-servidor";
import { exigirAcessoFazenda } from "../../../../lib/api-auth";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const negado = await exigirAcessoFazenda(req, body.fazenda_id);
    if (negado) return negado;
    if (!["criar", "editar", "excluir"].includes(body.acao)) return NextResponse.json({ ok: false, erro: "Ação inválida." }, { status: 400 });
    const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
    const { data, error } = await sb.rpc("abastecimento_comando_atomico", {
      p_fazenda: body.fazenda_id, p_dados: body, p_requisicao: req.headers.get("x-arato-requisicao") || randomUUID(),
    });
    if (error) return NextResponse.json({ ok: false, erro: error.code === "PGRST202" ? "Execute a Seção 436 do supabase_migrations.sql para registrar o abastecimento com segurança." : error.message }, { status: 400 });
    if (!data?.ok) throw new Error("Abastecimento não confirmado.");
    return NextResponse.json(data);
  } catch (e) {
    return NextResponse.json({ ok: false, erro: e instanceof Error ? e.message : String(e) }, { status: 400 });
  }
}
