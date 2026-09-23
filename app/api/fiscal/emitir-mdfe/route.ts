/**
 * POST /api/fiscal/emitir-mdfe
 * Recebe o id do MDF-e (já salvo como rascunho) e a fazenda, executa build → assina → transmite
 * de verdade pra SEFAZ (via SVRS, autorizador nacional do MDF-e) e retorna o resultado.
 */

import { NextRequest, NextResponse } from "next/server";
import { emitirMDFe } from "../../../../lib/mdfe/index";

export const runtime = "nodejs";
export const preferredRegion = ["gru1"];

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as { fazenda_id?: string; mdfe_id?: string };
    if (!body.fazenda_id || !body.mdfe_id) {
      return NextResponse.json({ sucesso: false, cStat: "400", xMotivo: "fazenda_id e mdfe_id são obrigatórios" }, { status: 400 });
    }
    const resultado = await emitirMDFe(body.fazenda_id, body.mdfe_id);
    return NextResponse.json(resultado, { status: resultado.sucesso ? 200 : 422 });
  } catch (err) {
    console.error("[emitir-mdfe]", err);
    return NextResponse.json({ sucesso: false, cStat: "500", xMotivo: String(err) }, { status: 500 });
  }
}
