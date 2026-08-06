// API route: extrai dados de pedido de compra / orçamento / cotação de um PDF
// Usado pelo modal de Novo Pedido de Compra na web (add-on ia_pedido_compra)
import { NextRequest, NextResponse } from "next/server";
import { extrairPedidoCompra } from "../../../../lib/extrair-pedido-compra";
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

    const buffer = await file.arrayBuffer();
    const base64 = Buffer.from(buffer).toString("base64");

    const resultado = await extrairPedidoCompra(base64);
    if (!resultado) return NextResponse.json({ error: "Não foi possível extrair dados do PDF." }, { status: 422 });

    return NextResponse.json(resultado);
  } catch (err) {
    console.error("[api/ai/extrair-pedido-compra]", err);
    return NextResponse.json({ error: "Erro interno ao processar o PDF." }, { status: 500 });
  }
}
