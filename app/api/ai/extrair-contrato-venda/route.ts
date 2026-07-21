import { NextRequest, NextResponse } from "next/server";
import { extrairContratoVenda } from "@/lib/extrair-contrato-venda";

export const maxDuration = 120;

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("pdf") as File | null;

    if (!file) {
      return NextResponse.json({ error: "Nenhum arquivo recebido." }, { status: 400 });
    }

    // Aceita PDF por tipo MIME ou por extensão
    const isPdf = file.type === "application/pdf"
      || file.name.toLowerCase().endsWith(".pdf")
      || file.type === "application/octet-stream";

    if (!isPdf) {
      return NextResponse.json({ error: "Envie um arquivo PDF válido." }, { status: 400 });
    }

    const buffer = await file.arrayBuffer();
    if (buffer.byteLength > 10 * 1024 * 1024) {
      return NextResponse.json({ error: "PDF muito grande. Limite: 10 MB." }, { status: 413 });
    }

    const base64 = Buffer.from(buffer).toString("base64");
    const { extraido, rawText } = await extrairContratoVenda(base64);

    return NextResponse.json({ extraido, rawText });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[extrair-contrato-venda]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
