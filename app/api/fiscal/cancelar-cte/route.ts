/** POST /api/fiscal/cancelar-cte — evento oficial 110111 na SEFAZ. */
import { NextRequest, NextResponse } from "next/server";
import { cancelarCTeEmitido } from "../../../../lib/cte/index";

export const runtime = "nodejs";
export const preferredRegion = ["gru1"];
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as {
      fazenda_id?: string;
      cte_id?: string;
      emitente_cnpj?: string | null;
      chave_acesso?: string | null;
      protocolo_autorizacao?: string | null;
      justificativa?: string;
    };
    if (!body.fazenda_id || !body.cte_id || !body.chave_acesso) {
      return NextResponse.json({ sucesso: false, cStat: "VALIDACAO_LOCAL", xMotivo: "fazenda_id, cte_id e chave_acesso são obrigatórios." }, { status: 400 });
    }
    const resultado = await cancelarCTeEmitido(body.fazenda_id, {
      cte_id: body.cte_id,
      emitente_cnpj: body.emitente_cnpj,
      chave_acesso: body.chave_acesso,
      protocolo_autorizacao: body.protocolo_autorizacao,
      justificativa: body.justificativa ?? "",
    });
    return NextResponse.json(resultado, { status: resultado.sucesso ? 200 : 422 });
  } catch (error) {
    console.error("[cancelar-cte]", error);
    return NextResponse.json({ sucesso: false, cStat: "ERRO_TECNICO", xMotivo: String(error) }, { status: 500 });
  }
}
