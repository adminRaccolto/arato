/**
 * GET /api/sieg?chave=44digitos&fazenda_id=xxx
 *
 * Busca o XML de uma NF-e por chave de acesso, usando o Sieg como fonte.
 * Fluxo:
 *   1. Procura no Storage (nfs-sieg/{fazendaId}/{chave}.xml) — sem certificado, instantâneo
 *   2. Chama sieg-sync com a chave específica para baixar do Sieg e salvar no Storage
 *   3. Retorna o XML diretamente (não JSON) — compatível com parsearXml() no cliente
 *
 * O fazenda_id vem do header x-fazenda-id ou query param fazenda_id.
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "../../../lib/supabase-servidor";
import { buscarXmlNfePorChaveSieg, credenciaisEnv, credenciaisValidas } from "../../../lib/sieg";
import { exigirAcessoFazenda } from "../../../lib/api-auth";

export const runtime = "nodejs";

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const chave     = (searchParams.get("chave") ?? "").replace(/\D/g, "");
  const fazendaId = searchParams.get("fazenda_id") ?? req.headers.get("x-fazenda-id") ?? "";

  if (chave.length !== 44) {
    return new NextResponse("Chave de acesso inválida — deve ter 44 dígitos.", { status: 400 });
  }
  if (!fazendaId) {
    return new NextResponse("fazenda_id obrigatório.", { status: 400 });
  }
  const negado = await exigirAcessoFazenda(req, fazendaId);
  if (negado) return negado;

  const sb = adminClient();

  // ── 1. Tenta buscar no Storage ─────────────────────────────────────────────
  const xmlPath = `nfs-sieg/${fazendaId}/${chave}.xml`;
  try {
    const { data: blob, error: storErr } = await sb.storage.from("arquivos").download(xmlPath);
    if (!storErr && blob) {
      const xmlText = await blob.text();
      if (xmlText && (xmlText.includes("<NFe") || xmlText.includes("<nfeProc"))) {
        return new NextResponse(xmlText, {
          headers: { "Content-Type": "application/xml" },
        });
      }
    }
  } catch { /* segue para Sieg */ }

  // ── 2. Tenta buscar diretamente no Sieg API ────────────────────────────────
  const siegCreds = credenciaisEnv();
  if (!credenciaisValidas(siegCreds)) {
    return new NextResponse("Credenciais Sieg não configuradas.", { status: 503 });
  }

  try {
    // Mês da emissão (inteiro, com folga) pelo emitente e depois pelos CPF/CNPJ do cliente (lib/sieg buscarXmlNfePorChaveSieg)
    const { data: faz } = await sb.from("fazendas").select("conta_id").eq("id", fazendaId).maybeSingle();
    const { data: fzs } = faz?.conta_id ? await sb.from("fazendas").select("id").eq("conta_id", faz.conta_id) : { data: [{ id: fazendaId }] };
    const fids = (fzs ?? []).map(f => f.id as string);
    const filtro = faz?.conta_id ? `conta_id.eq.${faz.conta_id},fazenda_id.in.(${fids.join(",")})` : `fazenda_id.in.(${fids.join(",")})`;
    const [{ data: prods }, { data: emps }] = await Promise.all([
      sb.from("produtores").select("cpf_cnpj").or(filtro),
      sb.from("empresas").select("cpf_cnpj").or(filtro),
    ]);
    const docs = [...new Set([...(prods ?? []), ...(emps ?? [])].map(p => String(p.cpf_cnpj ?? "").replace(/\D/g, "")).filter(Boolean))];
    const xml = await buscarXmlNfePorChaveSieg(siegCreds, chave, docs);
    if (xml) {
      await sb.storage.from("arquivos").upload(xmlPath, xml, { contentType: "application/xml", upsert: true });
      return new NextResponse(xml, { headers: { "Content-Type": "application/xml" } });
    }
    return new NextResponse("NF não encontrada no SIEG: a conta SIEG da Raccolto não tem esta nota (procurado pelo emitente e pelos CPF/CNPJ do cliente no mês da emissão). Importe o XML do fornecedor (opção XML).", { status: 404 });
  } catch (e) {
    console.error("[api/sieg]", e);
    return new NextResponse(`Erro na consulta Sieg: ${String(e)}`, { status: 502 });
  }
}
