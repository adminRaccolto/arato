/**
 * POST /api/transporte/excluir-rascunho
 * Exclui um CT-e ou MDF-e que ainda é RASCUNHO. Nunca apaga documento autorizado, cancelado ou
 * com protocolo de autorização — esses têm valor fiscal e só saem por cancelamento/encerramento.
 * service_role_key (imune ao JWT expirado) com validação de acesso à fazenda do registro.
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { validateFazendaAccess } from "../../../../lib/api-auth";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const { tabela, id } = await req.json() as { tabela?: "ctes" | "mdfes"; id?: string };
    if ((tabela !== "ctes" && tabela !== "mdfes") || !id) return NextResponse.json({ erro: "tabela (ctes|mdfes) e id obrigatórios" }, { status: 400 });
    const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
    const { data: reg } = await db.from(tabela).select("id, fazenda_id, status, protocolo_autorizacao").eq("id", id).maybeSingle();
    if (!reg) return NextResponse.json({ erro: "Registro não encontrado" }, { status: 404 });
    const acesso = await validateFazendaAccess(reg.fazenda_id as string, req.headers.get("authorization") ?? undefined);
    if (!acesso.ok) return NextResponse.json({ erro: acesso.error }, { status: acesso.status });
    if (reg.status !== "rascunho" || reg.protocolo_autorizacao) {
      return NextResponse.json({ erro: "Só é possível excluir rascunho que nunca foi autorizado pela SEFAZ. Documento autorizado se cancela (CT-e) ou se encerra/cancela (MDF-e)." }, { status: 422 });
    }
    const { error } = await db.from(tabela).delete().eq("id", id);
    if (error) return NextResponse.json({ erro: error.message }, { status: 400 });
    return NextResponse.json({ sucesso: true });
  } catch (e) {
    return NextResponse.json({ erro: String(e) }, { status: 500 });
  }
}
