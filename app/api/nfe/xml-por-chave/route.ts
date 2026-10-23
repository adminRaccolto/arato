/**
 * POST /api/nfe/xml-por-chave
 * Devolve o XML completo de uma NF-e pela chave de acesso (44 dígitos).
 * Fluxo:
 *   1. Procura no Storage (nfs-sieg/{fazenda_id}/{chave}.xml) — sem certificado
 *   2. Consulta SEFAZ como fallback (requer A1 configurado)
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "../../../../lib/supabase-servidor";
import { consultarNfePorChave } from "../../../../lib/sefaz-consulta";
import { exigirAcessoFazenda } from "../../../../lib/api-auth";

export async function POST(req: NextRequest) {
  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
  let body: { fazendaId?: string; chaveAcesso?: string; ambiente?: "producao" | "homologacao" };
  try { body = await req.json(); } catch {
    return NextResponse.json({ ok: false, erro: "Body inválido" }, { status: 400 });
  }

  const { fazendaId, chaveAcesso, ambiente = "producao" } = body;

  if (!fazendaId) return NextResponse.json({ ok: false, erro: "fazendaId obrigatório" }, { status: 400 });
  const negado = await exigirAcessoFazenda(req, fazendaId);
  if (negado) return negado;
  if (!chaveAcesso) return NextResponse.json({ ok: false, erro: "chaveAcesso obrigatória" }, { status: 400 });

  const chave = chaveAcesso.replace(/\D/g, "");
  if (chave.length !== 44) {
    return NextResponse.json({ ok: false, erro: "Chave de acesso inválida — deve ter exatamente 44 dígitos." }, { status: 400 });
  }

  // ── 1. XML já guardado no Arato, em qualquer fazenda da conta ─────────────
  // (a mesma nota pode ter chegado pelo SIEG em outra fazenda do cliente, ou já existir em nf_entradas)
  const { data: faz } = await supabaseAdmin.from("fazendas").select("conta_id").eq("id", fazendaId).maybeSingle();
  const { data: fazConta } = faz?.conta_id
    ? await supabaseAdmin.from("fazendas").select("id").eq("conta_id", faz.conta_id)
    : { data: [{ id: fazendaId }] };
  const fids = [fazendaId, ...(fazConta ?? []).map(f => f.id as string).filter(id => id !== fazendaId)];
  const ehNfe = (x?: string | null) => !!x && (x.includes("<NFe") || x.includes("<nfeProc"));

  const { data: nfExistente } = await supabaseAdmin.from("nf_entradas").select("xml_content, xml_storage_path")
    .eq("chave_acesso", chave).in("fazenda_id", fids).not("xml_content", "is", null).limit(1).maybeSingle();
  if (ehNfe(nfExistente?.xml_content)) return NextResponse.json({ ok: true, xmlCompleto: nfExistente!.xml_content, fonte: "arato" });

  const caminhos = [nfExistente?.xml_storage_path, ...fids.flatMap(id => [`nfs-sieg/${id}/${chave}.xml`, `${id}/nfe_entradas/${chave}.xml`])].filter((c): c is string => !!c);
  for (const caminho of caminhos) {
    try {
      const { data: blob, error: storErr } = await supabaseAdmin.storage.from("arquivos").download(caminho);
      if (!storErr && blob) {
        const xmlText = await blob.text();
        if (ehNfe(xmlText)) return NextResponse.json({ ok: true, xmlCompleto: xmlText, fonte: "storage" });
      }
    } catch { /* tenta o próximo caminho */ }
  }
  const xmlPath = `nfs-sieg/${fazendaId}/${chave}.xml`;

  // ── 2. Fallback: consulta SEFAZ ────────────────────────────────────────────
  const resultado = await consultarNfePorChave(chave, fazendaId, ambiente);

  if (!resultado.ok) {
    return NextResponse.json({ ok: false, erro: resultado.erro ?? resultado.xMotivo ?? "Erro na consulta SEFAZ" });
  }

  const xmlCompleto = resultado.xmlCompleto ?? resultado.nfeXml ?? "";
  // A Consulta de Situação da SEFAZ confirma que a nota existe, mas não devolve o XML a terceiros.
  if (!xmlCompleto) {
    return NextResponse.json({
      ok: false,
      cStat: resultado.cStat,
      erro: `A SEFAZ confirmou a nota (${resultado.cStat ?? ""} ${resultado.xMotivo ?? ""}`.trim() + `), mas não entrega o XML completo pela chave. A nota ainda não chegou ao Arato pelo SIEG. Importe o XML enviado pelo fornecedor (opção XML) ou sincronize o SIEG do período da emissão e abra a nota em Documentos Fiscais.`,
    });
  }

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
