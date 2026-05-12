/**
 * POST /api/integracoes/sieg-sync
 * Busca documentos novos no Sieg DFe Monitor e importa como NF de Entrada.
 * Retorna: { importados_nfe, duplicados_nfe, erros, total_xmls }
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient }              from "@supabase/supabase-js";
import { baixarXmlsSieg, parseNFeXml } from "../../../../lib/sieg";

export const runtime = "nodejs";

function sb() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as { fazenda_id: string };
    const { fazenda_id } = body;
    if (!fazenda_id) return NextResponse.json({ erro: "fazenda_id obrigatório" }, { status: 400 });

    const db = sb();

    // ── 1. Carregar config Sieg ──────────────────────────────────────────────
    const { data: row } = await db
      .from("configuracoes_modulo")
      .select("config")
      .eq("fazenda_id", fazenda_id)
      .eq("modulo", "sieg")
      .maybeSingle();

    const cfg = (row?.config ?? {}) as Record<string, string>;

    const apiKey = cfg.api_key ?? "";
    if (!apiKey) return NextResponse.json({ erro: "API Key Sieg não configurada — acesse Configurações → Integrações → Sieg" }, { status: 400 });

    const cnpjDest  = cfg.cnpj_destino  || undefined;
    // Data inicial: última sync ou 30 dias atrás
    const trintaDiasAtras = new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10);
    const dataInicio = cfg.ultima_sync_data ?? trintaDiasAtras;
    const dataFim    = new Date().toISOString();

    // ── 2. Buscar NF-e no Sieg ───────────────────────────────────────────────
    let xmlsNFe: string[];
    try {
      xmlsNFe = await baixarXmlsSieg(apiKey, {
        XmlType:           1,
        DataEmissaoInicio: dataInicio,
        DataEmissaoFim:    dataFim,
        CnpjDest:          cnpjDest,
      });
    } catch (e) {
      return NextResponse.json({ erro: `Falha na comunicação com Sieg: ${e}` }, { status: 502 });
    }

    // ── 3. Processar cada XML ────────────────────────────────────────────────
    let importados_nfe = 0;
    let duplicados_nfe = 0;
    const erros: string[] = [];

    for (const xml of xmlsNFe) {
      const nfe = parseNFeXml(xml);
      if (!nfe) { erros.push("XML sem Id NFe válido"); continue; }
      if (!nfe.numero || !nfe.data_emissao) { erros.push(`NF ${nfe.chave}: campos obrigatórios ausentes`); continue; }

      // Verificar duplicata pela chave de acesso
      const { data: dup } = await db
        .from("nf_entradas")
        .select("id")
        .eq("fazenda_id", fazenda_id)
        .eq("chave_acesso", nfe.chave)
        .maybeSingle();

      if (dup) { duplicados_nfe++; continue; }

      // Inserir NF de Entrada
      const { data: nfRow, error: nfErr } = await db
        .from("nf_entradas")
        .insert({
          fazenda_id,
          numero:          nfe.numero,
          serie:           nfe.serie,
          chave_acesso:    nfe.chave,
          data_emissao:    nfe.data_emissao,
          emitente_nome:   nfe.nome_emitente,
          emitente_cnpj:   nfe.cnpj_emitente,
          valor_total:     nfe.valor_total,
          natureza:        nfe.natureza,
          cfop:            nfe.cfop,
          status:          "pendente",
          origem:          "sieg",
          observacao:      `Importado via Sieg DFe em ${new Date().toLocaleDateString("pt-BR")} — IE: ${nfe.ie_emitente || "—"}`,
        })
        .select("id")
        .single();

      if (nfErr || !nfRow) {
        erros.push(`NF ${nfe.numero} (${nfe.chave.slice(-8)}): ${nfErr?.message ?? "erro ao salvar"}`);
        continue;
      }

      // Inserir itens da NF
      if (nfe.itens.length > 0) {
        const { error: iErr } = await db.from("nf_entrada_itens").insert(
          nfe.itens.map(item => ({
            nf_entrada_id:     nfRow.id,
            fazenda_id,
            descricao_produto: item.descricao,
            descricao_nf:      item.descricao,
            ncm:               item.ncm   || null,
            cfop:              item.cfop  || nfe.cfop || null,
            unidade:           item.unidade || "UN",
            unidade_nf:        item.unidade || "UN",
            quantidade:        item.quantidade,
            valor_unitario:    item.valor_unitario,
            valor_total:       item.valor_total,
            tipo_apropiacao:   "estoque",
            alerta_preco:      false,
          }))
        );
        if (iErr) erros.push(`Itens NF ${nfe.numero}: ${iErr.message}`);
      }

      importados_nfe++;
    }

    // ── 4. Atualizar config com data/hora da última sync ─────────────────────
    const novoCfg: Record<string, string> = {
      ...cfg,
      ultima_sync_data:   new Date().toISOString().slice(0, 10),
      ultima_sync_ts:     new Date().toISOString(),
      total_importado:    String((parseInt(cfg.total_importado || "0") + importados_nfe)),
    };

    await db
      .from("configuracoes_modulo")
      .upsert({ fazenda_id, modulo: "sieg", config: novoCfg });

    return NextResponse.json({
      sucesso:       true,
      importados_nfe,
      duplicados_nfe,
      total_xmls:    xmlsNFe.length,
      erros:         erros.slice(0, 20),
    });

  } catch (err) {
    console.error("[sieg-sync]", err);
    return NextResponse.json({ erro: String(err) }, { status: 500 });
  }
}
