import { NextRequest, NextResponse } from "next/server";
import { createClient } from "../../../../lib/supabase-servidor";
import { exigirAcessoRegistro } from "../../../../lib/api-auth";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { acao, lote_id, data_pagamento, conta_bancaria } = body;
    if (!lote_id || !["confirmar", "estornar", "cancelar"].includes(acao))
      return NextResponse.json({ ok: false, error: "Informe o borderô e uma ação válida." }, { status: 400 });
    const negado = await exigirAcessoRegistro(req, "pagamento_lotes", lote_id);
    if (negado) return negado;
    const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } });
    // Pagamento, composição, estorno e extrato são gravados na mesma transação no banco.
    const { data, error } = await sb.rpc("bordero_acao_atomica", {
      p_lote: lote_id, p_acao: acao, p_data: data_pagamento || null, p_conta: conta_bancaria || null,
      p_titulo: body.titulo ?? {},
    });
    if (error) {
      const migracao = error.code === "PGRST202" || error.code === "42883";
      return NextResponse.json({ ok: false, error: migracao
        ? "Execute a Seção 428 das migrações para ativar a baixa segura de borderôs."
        : error.message }, { status: migracao ? 503 : 409 });
    }
    return NextResponse.json(data);
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
