/**
 * POST /api/cte/distribuicao
 * NT 2015.002 — baixa CT-e de terceiros da SEFAZ nacional (CTeDistribuicaoDFe).
 * Pagina automaticamente até não ter mais documentos novos.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "../../../../lib/supabase-servidor";
import { carregarCertificadoEmitente } from "../../../../lib/nfe/certificado-emitente";
import { resolverConfigCTe } from "../../../../lib/cte/config";
import {
  consultarDFeInteresse,
  extrairMetaCTe,
  type AmbienteDist,
} from "../../../../lib/cte/distribuicao";
import { exigirAcessoFazenda } from "../../../../lib/api-auth";

export const runtime        = "nodejs";
export const preferredRegion = ["gru1"];
export const maxDuration     = 60;

function sb() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}


async function lerUltNSU(fazendaId:string,chave:string,ambiente:AmbienteDist): Promise<string> {
  const { data, error } = await sb()
    .from("configuracoes_modulo")
    .select("config")
    .eq("fazenda_id", fazendaId)
    .eq("modulo", chave)
    .maybeSingle();
  if(error)throw error;
  if(data?.config?.ambiente && data.config.ambiente!==ambiente)throw new Error("Cursor de outro ambiente. Confira o histórico da distribuição.");
  return (data?.config as { ult_nsu?: string } | undefined)?.ult_nsu ?? "000000000000000";
}

async function salvarUltNSU(fazendaId:string,chave:string,nsu:string,ambiente:AmbienteDist){
  const {error}=await sb().rpc("fiscal_avancar_nsu",{p_fazenda:fazendaId,p_modulo:chave,p_nsu:nsu,p_ambiente:ambiente});if(error)throw error;
}

export async function POST(req: NextRequest) {
  try {
    const body                 = await req.json() as { fazenda_id: string; forcar_zero?: boolean };
    const { fazenda_id, forcar_zero } = body;

    if (!fazenda_id) return NextResponse.json({ erro: "fazenda_id obrigatório" }, { status: 400 });
    const negado = await exigirAcessoFazenda(req, fazenda_id);
    if (negado) return negado;

    // ── Resolve configuração e certificado ────────────────────────────────────
    const cfg = await resolverConfigCTe(fazenda_id);
    if (!cfg) return NextResponse.json({ erro: "Configuração CT-e não encontrada" }, { status: 422 });

    const { fiscalConfig, emitenteDigits, cteConfig } = cfg;
    const {pem}=await carregarCertificadoEmitente(sb(),fazenda_id,emitenteDigits || fiscalConfig.cpf_cnpj_emitente || '');

    const ambiente: AmbienteDist =
      (cteConfig.ambiente ?? fiscalConfig.ambiente ?? "homologacao") === "producao"
        ? "producao"
        : "homologacao";

    const cnpj = emitenteDigits.padStart(14, "0");
    const cUF  = cteConfig.cuf ?? fiscalConfig.cuf ?? "51";

    const chaveNSU=ambiente==="producao"?`dist_cte_${cnpj}`:`dist_cte_${cnpj}_homologacao`;

    // ── Paginação: consulta até não ter mais documentos ───────────────────────
    let ultNSU   = forcar_zero ? "000000000000000" : await lerUltNSU(fazenda_id,chaveNSU,ambiente);
    let totalDocs = 0;
    let recebidos=0;let outrosTipos=0;
    let novoUltNSU = ultNSU;
    const erros: string[] = [];
    const docTypes: Record<string, number> = {};

    const limite=Date.now()+40_000;let temMaisPaginas=false;
    for (let pagina = 0; pagina < 10 && Date.now()<limite; pagina++) {
      const resultado = await consultarDFeInteresse({ cnpj, cUF, ambiente, ultNSU, pem });
      const { cStat, xMotivo, ultNSU: nsuRetornado, maxNSU, docs } = resultado;

      if (!["137", "138"].includes(cStat)) {
        return NextResponse.json({
          aviso: `SEFAZ retornou cStat ${cStat}: ${xMotivo}`,
          cStat,
          xMotivo,
        }, { status: 200 });
      }

      if (docs.length === 0) break;

      // ── Persiste cada documento recebido ─────────────────────────────────
      for (const doc of docs) {
        const schema = doc.schema ?? "";
        // Inbox durável inclui eventos e tipos ainda não interpretados pela tela.
        const guardado=await sb().from("fiscal_distribuicao_documentos").upsert({fazenda_id,documento:cnpj,ambiente,nsu:doc.nsu,schema_sefaz:schema,xml_raw:doc.xml},{onConflict:"fazenda_id,documento,ambiente,nsu"});
        if(guardado.error)throw new Error(`NSU ${doc.nsu}: falha ao guardar documento; cursor preservado. ${guardado.error.message}`);
        recebidos++;
        docTypes[schema] = (docTypes[schema] ?? 0) + 1;

        if (!schema.startsWith("procCTe") && !schema.startsWith("cteProc") && !schema.startsWith("CTe")) {
          // Eventos, procEventoCTe, etc.: registra mas não insere em cte_recebidos
          outrosTipos++;continue;
        }

        const meta = extrairMetaCTe(doc.xml);

        const { error } = await sb().from("cte_recebidos").upsert(
          {
            fazenda_id,
            nsu:               doc.nsu,
            schema_sefaz:      schema,
            chave_acesso:      meta.chave_acesso,
            numero_cte:        meta.numero_cte ? parseInt(meta.numero_cte) : null,
            serie:             meta.serie ? parseInt(meta.serie) : null,
            data_emissao:      meta.data_emissao,
            emitente_cnpj:     meta.emitente_cnpj,
            emitente_nome:     meta.emitente_nome,
            remetente_cnpj:    meta.remetente_cnpj,
            remetente_nome:    meta.remetente_nome,
            destinatario_cnpj: meta.destinatario_cnpj,
            destinatario_nome: meta.destinatario_nome,
            municipio_origem:  meta.municipio_origem,
            uf_origem:         meta.uf_origem,
            municipio_destino: meta.municipio_destino,
            uf_destino:        meta.uf_destino,
            valor_frete:       meta.valor_frete,
            valor_mercadoria:  meta.valor_mercadoria,
            produto_descricao: meta.produto_descricao,
            xml_raw:           doc.xml,
            ambiente,
          },
          { onConflict: "fazenda_id,nsu" },
        );

        if (error) throw new Error(`NSU ${doc.nsu} não gravado: ${error.message}. Repita a sincronização; o cursor foi preservado.`);
        totalDocs++;
      }

      novoUltNSU = nsuRetornado ?? maxNSU ?? ultNSU;

      // Avança NSU e verifica se há mais
      const temMais = nsuRetornado !== maxNSU && parseInt(nsuRetornado) < parseInt(maxNSU);
      temMaisPaginas=temMais;
      await salvarUltNSU(fazenda_id,chaveNSU,novoUltNSU,ambiente);
      ultNSU        = novoUltNSU;
      if (!temMais) break;
    }

    // ── Persiste o último NSU processado ─────────────────────────────────────
    if (novoUltNSU !== (forcar_zero ? "000000000000000" : await lerUltNSU(fazenda_id,chaveNSU,ambiente))) {
      await salvarUltNSU(fazenda_id,chaveNSU,novoUltNSU,ambiente);
    }

    return NextResponse.json({
      ok: true,
      totalDocs,recebidos,outrosTipos,preservados:recebidos,temMais:temMaisPaginas,
      ultNSU: novoUltNSU,
      docTypes,
      erros,
      ambiente,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[CT-e Dist]", msg);
    return NextResponse.json({ erro: msg }, { status: 500 });
  }
}
