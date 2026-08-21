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
import { createClient }              from "@supabase/supabase-js";
import { baixarXmlsSieg, credenciaisEnv, credenciaisValidas, parseNFeXml } from "../../../lib/sieg";

export const runtime = "nodejs";

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

// Extrai AAMM da chave NF-e (posição 3-6) → datas de busca
function datasDoChave(chave: string): { inicio: string; fim: string } {
  const aa = chave.substring(2, 4); // ano 2 dígitos
  const mm = chave.substring(4, 6); // mês
  const ano = parseInt(aa) + 2000;
  const mes = parseInt(mm);
  const inicio = new Date(ano, mes - 1, 1);
  const fim    = new Date(ano, mes,     0);   // último dia do mês
  const toISO  = (d: Date) => d.toISOString().replace(/\..*/, "") + ".000Z";
  return { inicio: toISO(inicio), fim: toISO(fim) };
}

// Extrai CNPJ emitente da chave NF-e (posição 6-19)
function cnpjEmitenteDaChave(chave: string): string {
  return chave.substring(6, 20);
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
    const { inicio, fim } = datasDoChave(chave);
    const cnpjEmit = cnpjEmitenteDaChave(chave);

    // Baixa XMLs do mês da emissão filtrado pelo emitente
    const xmls = await baixarXmlsSieg(siegCreds, {
      TipoXml:          1,
      DataEmissaoInicio: inicio,
      DataEmissaoFim:    fim,
      CnpjEmit:         cnpjEmit,
    });

    // Encontra o XML com a chave exata
    for (const xml of xmls) {
      const parsed = parseNFeXml(xml);
      if (parsed?.chave === chave) {
        // Salva no Storage para próximas consultas
        await sb.storage.from("arquivos").upload(xmlPath, xml, {
          contentType: "application/xml", upsert: true,
        });
        return new NextResponse(xml, { headers: { "Content-Type": "application/xml" } });
      }
    }

    // 2b. Tenta filtrar por CNPJ destinatário (NF em nome do produtor)
    // Busca o CNPJ da fazenda nas configurações
    const { data: cfgRow } = await sb.from("configuracoes_modulo")
      .select("config")
      .eq("fazenda_id", fazendaId)
      .like("modulo", "fiscal%")
      .limit(1)
      .maybeSingle();
    const cnpjDest = ((cfgRow?.config as Record<string,string>)?.cpf_cnpj_emitente ?? "").replace(/\D/g, "");

    if (cnpjDest && cnpjDest !== cnpjEmit) {
      const xmlsDest = await baixarXmlsSieg(siegCreds, {
        TipoXml:          1,
        DataEmissaoInicio: inicio,
        DataEmissaoFim:    fim,
        CnpjDest:         cnpjDest,
        CnpjEmit:         cnpjEmit,
      });
      for (const xml of xmlsDest) {
        const parsed = parseNFeXml(xml);
        if (parsed?.chave === chave) {
          await sb.storage.from("arquivos").upload(xmlPath, xml, {
            contentType: "application/xml", upsert: true,
          });
          return new NextResponse(xml, { headers: { "Content-Type": "application/xml" } });
        }
      }
    }

    return new NextResponse("NF não encontrada no Sieg", { status: 404 });
  } catch (e) {
    console.error("[api/sieg]", e);
    return new NextResponse(`Erro na consulta Sieg: ${String(e)}`, { status: 502 });
  }
}
