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

  // 1. Localiza o xml_storage_path — tenta nf_importadas_sieg primeiro, depois nf_entradas
  let xmlStoragePath: string | null = null;
  let nfStatus: string | null = null;

  // 1a. nf_importadas_sieg (cron de sincronização automática)
  {
    let q = db.from("nf_importadas_sieg").select("xml_storage_path, status").eq("chave_acesso", chave);
    if (fazenda_id) q = q.eq("fazenda_id", fazenda_id);
    const { data, error } = await q.maybeSingle();
    if (error) return NextResponse.json({ erro: error.message }, { status: 500 });
    if (data?.xml_storage_path) { xmlStoragePath = data.xml_storage_path; nfStatus = data.status; }
  }

  // 1b. nf_entradas (sync manual / reimport) — ignora erro se coluna ainda não existe
  if (!xmlStoragePath) {
    try {
      let q = db.from("nf_entradas").select("xml_storage_path, status").eq("chave_acesso", chave);
      if (fazenda_id) q = q.eq("fazenda_id", fazenda_id);
      const { data } = await q.maybeSingle();
      if (data?.xml_storage_path) { xmlStoragePath = data.xml_storage_path; nfStatus = data.status; }
    } catch { /* coluna pode não existir ainda — migration pendente */ }
  }

  if (!xmlStoragePath) {
    return NextResponse.json(
      { erro: "XML não encontrado. Use o botão '↻ Re-import.' na lista para baixar o XML desta NF do SIEG." },
      { status: 404 }
    );
  }

  // 2. Baixa o XML do Supabase Storage
  const { data: xmlBlob, error: errStorage } = await db.storage
    .from("arquivos")
    .download(xmlStoragePath);

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
      cancelada: nfStatus === "cancelada",
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
