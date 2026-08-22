/**
 * POST /api/nfe/xml-por-chave
 * Devolve o XML completo de uma NF-e pela chave de acesso (44 dígitos).
 * Fluxo:
 *   1. Procura no Storage (nfs-sieg/{fazenda_id}/{chave}.xml) — sem certificado
 *   2. Consulta SEFAZ como fallback (requer A1 configurado)
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { consultarNfePorChave } from "../../../../lib/sefaz-consulta";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: NextRequest) {
  let body: { fazendaId?: string; chaveAcesso?: string; ambiente?: "producao" | "homologacao" };
  try { body = await req.json(); } catch {
    return NextResponse.json({ ok: false, erro: "Body inválido" }, { status: 400 });
  }

  const { fazendaId, chaveAcesso, ambiente = "producao" } = body;

  if (!fazendaId) return NextResponse.json({ ok: false, erro: "fazendaId obrigatório" }, { status: 400 });
  if (!chaveAcesso) return NextResponse.json({ ok: false, erro: "chaveAcesso obrigatória" }, { status: 400 });

  const chave = chaveAcesso.replace(/\D/g, "");
  if (chave.length !== 44) {
    return NextResponse.json({ ok: false, erro: "Chave de acesso inválida — deve ter exatamente 44 dígitos." }, { status: 400 });
  }

  // ── 1. Tenta buscar no Storage (SIEG salva aqui ao sincronizar) ────────────
  const xmlPath = `nfs-sieg/${fazendaId}/${chave}.xml`;
  try {
    const { data: blob, error: storErr } = await supabaseAdmin.storage
      .from("arquivos")
      .download(xmlPath);

    if (!storErr && blob) {
      const xmlText = await blob.text();
      if (xmlText && (xmlText.includes("<NFe") || xmlText.includes("<nfeProc"))) {
        return NextResponse.json({ ok: true, xmlCompleto: xmlText, fonte: "storage" });
      }
    }
  } catch {
    // Storage não disponível — segue para SEFAZ
  }

  // ── 2. Fallback: consulta SEFAZ ────────────────────────────────────────────
  const resultado = await consultarNfePorChave(chave, fazendaId, ambiente);

  if (!resultado.ok) {
    return NextResponse.json({ ok: false, erro: resultado.erro ?? resultado.xMotivo ?? "Erro na consulta SEFAZ" });
  }

  const xmlCompleto = resultado.xmlCompleto ?? resultado.nfeXml ?? "";

  // Salva no Storage para consultas futuras (evita nova ida à SEFAZ)
  if (xmlCompleto) {
    supabaseAdmin.storage
      .from("arquivos")
      .upload(xmlPath, Buffer.from(xmlCompleto, "utf-8"), { contentType: "application/xml", upsert: true })
      .catch(() => { /* falha silenciosa — não bloqueia retorno */ });
  }

  return NextResponse.json({
    ok: true,
    xmlCompleto,
    cStat: resultado.cStat,
    xMotivo: resultado.xMotivo,
    fonte: "sefaz",
  });
}
