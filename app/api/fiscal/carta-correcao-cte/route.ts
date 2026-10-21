/**
 * POST /api/fiscal/carta-correcao-cte — Carta de Correção do CT-e (evento 110110) na SEFAZ.
 * GET  /api/fiscal/carta-correcao-cte?fazenda_id=&cte_id= — histórico de cartas do CT-e.
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "../../../../lib/supabase-servidor";
import { emitirCartaCorrecaoCTe } from "../../../../lib/cte/index";
import { validateFazendaAccess } from "../../../../lib/api-auth";

export const runtime = "nodejs";
export const preferredRegion = ["gru1"];
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const fazendaId = req.nextUrl.searchParams.get("fazenda_id");
  const cteId = req.nextUrl.searchParams.get("cte_id");
  if (!fazendaId || !cteId) return NextResponse.json({ erro: "fazenda_id e cte_id são obrigatórios" }, { status: 400 });
  const access = await validateFazendaAccess(fazendaId, req.headers.get("authorization") ?? undefined);
  if (!access.ok) return NextResponse.json({ erro: access.error }, { status: access.status });
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const { data, error } = await db.from("cte_cartas_correcao").select("*").eq("cte_id", cteId).eq("fazenda_id", fazendaId).order("n_seq").order("created_at");
  if (error) return NextResponse.json({ cartas: [], erro: error.message });
  return NextResponse.json({ cartas: data ?? [] });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as {
      fazenda_id?: string; cte_id?: string; emitente_cnpj?: string | null; chave_acesso?: string | null;
      correcoes?: { grupo: string; campo: string; valor: string; item?: string }[];
    };
    if (!body.fazenda_id || !body.cte_id || !body.chave_acesso || !body.correcoes?.length) {
      return NextResponse.json({ sucesso: false, cStat: "VALIDACAO_LOCAL", xMotivo: "fazenda_id, cte_id, chave_acesso e ao menos uma correção são obrigatórios." }, { status: 400 });
    }
    const access = await validateFazendaAccess(body.fazenda_id, req.headers.get("authorization") ?? undefined);
    if (!access.ok) return NextResponse.json({ sucesso: false, cStat: "ACESSO", xMotivo: access.error }, { status: access.status });
    const resultado = await emitirCartaCorrecaoCTe(body.fazenda_id, {
      cte_id: body.cte_id, emitente_cnpj: body.emitente_cnpj, chave_acesso: body.chave_acesso, correcoes: body.correcoes,
    });
    return NextResponse.json(resultado, { status: resultado.sucesso ? 200 : 422 });
  } catch (error) {
    console.error("[carta-correcao-cte]", error);
    return NextResponse.json({ sucesso: false, cStat: "ERRO_TECNICO", xMotivo: String(error) }, { status: 500 });
  }
}
