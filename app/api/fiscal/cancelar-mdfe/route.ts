/**
 * POST /api/fiscal/cancelar-mdfe — evento oficial 110111 na SEFAZ e só então marca o MDF-e como
 * cancelado no banco (nunca o contrário: cancelar só localmente deixava o manifesto válido na SEFAZ).
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { cancelarMDFePorChave } from "../../../../lib/mdfe/cancelamento";
import { validateFazendaAccess } from "../../../../lib/api-auth";

export const runtime = "nodejs";
export const preferredRegion = ["gru1"];

export async function POST(req: NextRequest) {
  try {
    const b = await req.json() as { fazenda_id?: string; mdfe_id?: string; justificativa?: string };
    if (!b.fazenda_id || !b.mdfe_id) return NextResponse.json({ sucesso: false, cStat: "400", xMotivo: "fazenda_id e mdfe_id são obrigatórios" }, { status: 400 });
    const acesso = await validateFazendaAccess(b.fazenda_id, req.headers.get("authorization") ?? undefined);
    if (!acesso.ok) return NextResponse.json({ sucesso: false, cStat: "403", xMotivo: acesso.error }, { status: acesso.status });

    const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
    const { data: m } = await db.from("mdfes").select("id, status, chave_acesso, protocolo_autorizacao").eq("id", b.mdfe_id).maybeSingle();
    if (!m) return NextResponse.json({ sucesso: false, cStat: "404", xMotivo: "MDF-e não encontrado." }, { status: 404 });
    if (m.status === "encerrado") return NextResponse.json({ sucesso: false, cStat: "VALIDACAO_LOCAL", xMotivo: "MDF-e já encerrado — não pode mais ser cancelado." }, { status: 422 });
    if (m.status === "cancelado") return NextResponse.json({ sucesso: true, cStat: "OK", xMotivo: "MDF-e já estava cancelado." });

    const r = await cancelarMDFePorChave(b.fazenda_id, {
      chave: (m.chave_acesso as string) ?? "", protocolo: (m.protocolo_autorizacao as string) ?? "", justificativa: b.justificativa ?? "",
    });
    if (r.sucesso) await db.from("mdfes").update({ status: "cancelado" }).eq("id", b.mdfe_id);
    return NextResponse.json(r, { status: r.sucesso ? 200 : 422 });
  } catch (err) {
    console.error("[cancelar-mdfe]", err);
    return NextResponse.json({ sucesso: false, cStat: "500", xMotivo: String(err) }, { status: 500 });
  }
}
