import { NextRequest, NextResponse } from "next/server";
import { extrairConsorcio } from "../../../../lib/extrair-consorcio";
import { getSessionUser } from "../../../../lib/api-auth";

export async function POST(req: NextRequest) {
  try {
    const user = await getSessionUser();
    if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

    const form = await req.formData();
    const file = form.get("file") as File | null;
    if (!file) return NextResponse.json({ error: "Nenhum arquivo enviado." }, { status: 400 });
    if (file.type !== "application/pdf") return NextResponse.json({ error: "Envie um arquivo PDF." }, { status: 400 });
    if (file.size > 20 * 1024 * 1024)
      return NextResponse.json({ error: "PDF muito grande (máx. 20MB)." }, { status: 400 });

    const base64 = Buffer.from(await file.arrayBuffer()).toString("base64");
    try {
      const resultado = await extrairConsorcio(base64);
      if (!resultado) return NextResponse.json({ error: "Não foi possível extrair dados do PDF." }, { status: 422 });
      return NextResponse.json(resultado);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[api/ai/extrair-consorcio]", msg);
      return NextResponse.json({ error: `Erro ao processar PDF: ${msg}` }, { status: 422 });
    }
  } catch (err) {
    console.error("[api/ai/extrair-consorcio] request parse error", err);
    return NextResponse.json({ error: "Erro interno ao processar o PDF." }, { status: 500 });
  }
}
