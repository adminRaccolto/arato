// API route: extrai dados de cédula/contrato financeiro de um PDF
// Usado pelo modal de Novo Contrato Financeiro na web
import { NextRequest, NextResponse } from "next/server";
import { extrairCedula } from "../../../../lib/extrair-cedula";

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const file = form.get("file") as File | null;
    if (!file) return NextResponse.json({ error: "Nenhum arquivo enviado." }, { status: 400 });
    if (file.type !== "application/pdf") return NextResponse.json({ error: "Envie um arquivo PDF." }, { status: 400 });

    // Limite: 20MB
    if (file.size > 20 * 1024 * 1024)
      return NextResponse.json({ error: "PDF muito grande (máx. 20MB)." }, { status: 400 });

    const buffer = await file.arrayBuffer();
    const base64 = Buffer.from(buffer).toString("base64");

    const resultado = await extrairCedula(base64);
    if (!resultado) return NextResponse.json({ error: "Não foi possível extrair dados do PDF." }, { status: 422 });

    return NextResponse.json(resultado);
  } catch (err) {
    console.error("[api/ai/extrair-cedula]", err);
    return NextResponse.json({ error: "Erro interno ao processar o PDF." }, { status: 500 });
  }
}
