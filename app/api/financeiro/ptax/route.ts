/** GET /api/financeiro/ptax?data=AAAA-MM-DD — PTAX de venda do dia (ou do dia útil anterior). */
import { NextRequest, NextResponse } from "next/server";
import { ptaxDoDia } from "../../../../lib/financeiro/ptax";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const data = req.nextUrl.searchParams.get("data") ?? "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) return NextResponse.json({ ptax: null, erro: "data inválida" }, { status: 400 });
  return NextResponse.json({ ptax: await ptaxDoDia(data) });
}
