/**
 * POST /api/nfe/xml-por-chave
 * Consulta a SEFAZ pela chave de acesso (44 dígitos) e devolve o XML completo
 * para o frontend parsear com parsearXmlNfe — usado na entrada de NF de Estoque
 * via leitor de código de barras.
 */
import { NextRequest, NextResponse } from "next/server";
import { consultarNfePorChave } from "../../../../lib/sefaz-consulta";

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

  const resultado = await consultarNfePorChave(chave, fazendaId, ambiente);

  if (!resultado.ok) {
    return NextResponse.json({ ok: false, erro: resultado.erro ?? resultado.xMotivo ?? "Erro na consulta SEFAZ" });
  }

  return NextResponse.json({
    ok: true,
    xmlCompleto: resultado.xmlCompleto ?? resultado.nfeXml,
    cStat: resultado.cStat,
    xMotivo: resultado.xMotivo,
  });
}
