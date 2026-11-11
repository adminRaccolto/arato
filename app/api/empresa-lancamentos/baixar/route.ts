import { NextRequest, NextResponse } from "next/server";
import { createClient } from "../../../../lib/supabase-servidor";
import { exigirAcessoRegistro } from "../../../../lib/api-auth";
import { comandoTitulo } from "../../../../lib/financeiro/comando-server";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as Record<string, unknown> & { acao: string; lancamento_id: string };
    const negado = await exigirAcessoRegistro(req, "empresa_lancamentos", body.lancamento_id);
    if (negado) return negado;
    if (!["baixar", "reabrir", "reprogramar"].includes(body.acao)) return NextResponse.json({ ok: false, error: "Ação inválida." }, { status: 400 });
    const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
    return NextResponse.json(await comandoTitulo(sb, req, "empresa_lancamentos", body.lancamento_id, body.acao, body));
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 400 });
  }
}
