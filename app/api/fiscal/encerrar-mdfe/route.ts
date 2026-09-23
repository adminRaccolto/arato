/**
 * POST /api/fiscal/encerrar-mdfe
 * Encerra um MDF-e de verdade na SEFAZ (evento 110112). Aceita chave/protocolo diretos (MDF-e
 * emitido fora do sistema) ou mdfe_id (busca chave/protocolo no banco e atualiza o status).
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { encerrarMDFePorChave } from "../../../../lib/mdfe/encerramento";

export const runtime = "nodejs";
export const preferredRegion = ["gru1"];

export async function POST(req: NextRequest) {
  try {
    const b = await req.json() as { fazenda_id?: string; mdfe_id?: string; chave?: string; protocolo?: string; data_enc?: string; uf_enc?: string; cmun_enc?: string; municipio_enc?: string };
    if (!b.fazenda_id) return NextResponse.json({ sucesso: false, cStat: "400", xMotivo: "fazenda_id obrigatório" }, { status: 400 });
    const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

    let chave = b.chave ?? "", protocolo = b.protocolo ?? "";
    if (b.mdfe_id) {
      const { data: m } = await db.from("mdfes").select("chave_acesso, protocolo_autorizacao").eq("id", b.mdfe_id).maybeSingle();
      if (!m) return NextResponse.json({ sucesso: false, cStat: "404", xMotivo: "MDF-e não encontrado." }, { status: 404 });
      chave = (m.chave_acesso as string) ?? ""; protocolo = (m.protocolo_autorizacao as string) ?? "";
    }
    const r = await encerrarMDFePorChave(b.fazenda_id, {
      chave, protocolo, dataEnc: b.data_enc ?? new Date().toISOString().slice(0, 10),
      ufEnc: b.uf_enc ?? "MT", cMunEnc: b.cmun_enc ?? "",
    });
    if (r.sucesso && b.mdfe_id) {
      await db.from("mdfes").update({
        status: "encerrado", data_encerramento: b.data_enc, municipio_encerramento: b.municipio_enc, uf_encerramento: b.uf_enc,
      }).eq("id", b.mdfe_id);
    }
    return NextResponse.json(r, { status: r.sucesso ? 200 : 422 });
  } catch (err) {
    console.error("[encerrar-mdfe]", err);
    return NextResponse.json({ sucesso: false, cStat: "500", xMotivo: String(err) }, { status: 500 });
  }
}
