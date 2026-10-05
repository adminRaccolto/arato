import { NextRequest, NextResponse } from "next/server";
import { PDFDocument } from "pdf-lib";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Junta os DANFEs de várias NFs em um único PDF, para imprimir em um só diálogo.
// Cada DANFE é gerado pela rota /api/fiscal/danfe (a mesma do botão individual).
export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as { itens?: { chave: string; fazenda_id: string }[] };
    const itens = (body.itens ?? []).filter(i => i.chave && i.fazenda_id).slice(0, 100);
    if (itens.length === 0) return NextResponse.json({ ok: false, error: "Nenhuma NF com chave de acesso selecionada" }, { status: 400 });

    const origem = new URL(req.url).origin;
    const pdfFinal = await PDFDocument.create();
    const falhas: string[] = [];

    for (const it of itens) {
      const url = `${origem}/api/fiscal/danfe?chave=${encodeURIComponent(it.chave)}&fazenda_id=${encodeURIComponent(it.fazenda_id)}`;
      const res = await fetch(url);
      const ct = res.headers.get("content-type") ?? "";
      if (!res.ok || !ct.includes("application/pdf")) { falhas.push(it.chave); continue; }
      const bytes = new Uint8Array(await res.arrayBuffer());
      const pdf = await PDFDocument.load(bytes);
      const paginas = await pdfFinal.copyPages(pdf, pdf.getPageIndices());
      paginas.forEach(p => pdfFinal.addPage(p));
    }

    if (pdfFinal.getPageCount() === 0) {
      return NextResponse.json({ ok: false, error: "Nenhum DANFE pôde ser gerado", falhas }, { status: 422 });
    }
    const out = await pdfFinal.save();
    return new NextResponse(Buffer.from(out), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": "inline; filename=\"danfes.pdf\"",
        ...(falhas.length ? { "X-Danfes-Falhas": String(falhas.length) } : {}),
      },
    });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
