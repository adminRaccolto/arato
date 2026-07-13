import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";

export async function GET(req: NextRequest) {
  const chave      = req.nextUrl.searchParams.get("chave")?.replace(/\D/g, "") ?? "";
  const fazenda_id = req.nextUrl.searchParams.get("fazenda_id") ?? "";

  if (!chave || chave.length !== 44) {
    return NextResponse.json({ erro: "Chave de acesso inválida (44 dígitos necessários)" }, { status: 400 });
  }
  if (!SERVICE_KEY || !SUPABASE_URL) {
    return NextResponse.json({ erro: "Configuração do servidor incompleta" }, { status: 500 });
  }

  const db = createClient(SUPABASE_URL, SERVICE_KEY);

  // 1. Localiza registro SIEG pelo chave de acesso
  let query = db
    .from("nf_importadas_sieg")
    .select("xml_storage_path, status")
    .eq("chave_acesso", chave);
  if (fazenda_id) query = query.eq("fazenda_id", fazenda_id);
  const { data: nfReg, error: errNf } = await query.maybeSingle();

  if (errNf) {
    return NextResponse.json({ erro: errNf.message }, { status: 500 });
  }
  if (!nfReg?.xml_storage_path) {
    return NextResponse.json(
      { erro: "XML não encontrado no Storage. A NF pode ter sido importada antes do armazenamento de XMLs ser ativado." },
      { status: 404 }
    );
  }

  // 2. Baixa o XML do Supabase Storage
  const { data: xmlBlob, error: errStorage } = await db.storage
    .from("arquivos")
    .download(nfReg.xml_storage_path);

  if (errStorage || !xmlBlob) {
    return NextResponse.json(
      { erro: `Erro ao baixar XML do Storage: ${errStorage?.message ?? "arquivo não encontrado"}` },
      { status: 500 }
    );
  }

  const xmlContent = await xmlBlob.text();

  // 3. Gera o DANFE em PDF
  try {
    const { gerarPDF } = await import("nfe-danfe-pdf");

    const pdfDoc = await gerarPDF(xmlContent, {
      cancelada: nfReg.status === "cancelada",
    });

    // Converte o PDFDocument (stream) em Buffer
    const chunks: Buffer[] = [];
    const pdfBuffer = await new Promise<Buffer>((resolve, reject) => {
      pdfDoc.on("data",  (chunk: Buffer) => chunks.push(chunk));
      pdfDoc.on("end",   () => resolve(Buffer.concat(chunks)));
      pdfDoc.on("error", reject);
      pdfDoc.end();
    });

    return new NextResponse(pdfBuffer.buffer as ArrayBuffer, {
      status: 200,
      headers: {
        "Content-Type":        "application/pdf",
        "Content-Disposition": `inline; filename="DANFE-${chave}.pdf"`,
        "Cache-Control":       "private, max-age=300",
      },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { erro: `Erro ao gerar DANFE: ${msg}` },
      { status: 500 }
    );
  }
}
