import { NextRequest, NextResponse } from "next/server";
import { extrairContratoVenda } from "@/lib/extrair-contrato-venda";

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("pdf") as File | null;

    if (!file || file.type !== "application/pdf") {
      return NextResponse.json({ error: "Envie um arquivo PDF válido." }, { status: 400 });
    }

    const buffer = await file.arrayBuffer();
    const base64 = Buffer.from(buffer).toString("base64");

    const extraido = await extrairContratoVenda(base64);

    return NextResponse.json({ extraido });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
