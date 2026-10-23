// POST /api/bi/auditoria { conta_id } — verificações de dados do cliente para a aba BI → Auditoria.
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "../../../../lib/supabase-servidor";
import { exigirAcessoConta } from "../../../../lib/api-auth";
import { verificacoesDoCliente } from "../../../../lib/auditoria/bi/carregar";

export const maxDuration = 120;

export async function POST(req: NextRequest) {
  const { conta_id } = await req.json().catch(() => ({})) as { conta_id?: string };
  const negado = await exigirAcessoConta(req, conta_id);
  if (negado) return negado;
  try {
    const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
    const verificacoes = await verificacoesDoCliente(sb, conta_id!);
    return NextResponse.json({ ok: true, verificacoes, em: new Date().toISOString() });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
