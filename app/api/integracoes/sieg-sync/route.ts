/**
 * POST /api/integracoes/sieg-sync
 * Busca documentos novos no Sieg DFe Monitor e importa como NF de Entrada.
 *
 * A API Key Sieg é GLOBAL (Raccolto) — lida de process.env.SIEG_API_KEY.
 * Cada fazenda filtra pelo próprio CNPJ/CPF (cnpj_destino em configuracoes_modulo).
 *
 * Retorna: { importados_nfe, duplicados_nfe, erros, total_xmls }
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient }              from "@supabase/supabase-js";
import { baixarXmlsSieg, parseNFeXml, credenciaisEnv, credenciaisValidas } from "../../../../lib/sieg";

export const runtime = "nodejs";

// GET — health check / validação de URL pelo portal Sieg
export async function GET() {
  return Response.json({
    servico: "Arato — Integração Sieg DFe Monitor",
    status:  "ativo",
    metodo:  "POST",
    descricao: "Endpoint de importação de NF-e via Sieg DFe Monitor. Envie POST com { fazenda_id } para acionar a sincronização.",
    documentacao: "https://web.arato.agr.br",
  });
}

function sb() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as { fazenda_id: string; data_inicio?: string; data_fim?: string; force_reimport?: boolean; chaves_acesso?: string[] };
    const { fazenda_id, data_inicio: dataInicioParam, data_fim: dataFimParam, force_reimport: forceReimport, chaves_acesso: chavesAcesso } = body;
    if (!fazenda_id) return NextResponse.json({ erro: "fazenda_id obrigatório" }, { status: 400 });

    const db = sb();

    // ── 1. Config desta fazenda ──────────────────────────────────────────────
    const { data: row } = await db
      .from("configuracoes_modulo")
      .select("config")
      .eq("fazenda_id", fazenda_id)
      .eq("modulo", "sieg")
      .maybeSingle();

    const cfg = (row?.config ?? {}) as Record<string, string>;

    // ── Credenciais SIEG (env global) ────────────────────────────────────────
    const siegCreds = credenciaisEnv();
    if (!credenciaisValidas(siegCreds)) {
      return NextResponse.json(
        { erro: "Credenciais SIEG incompletas. Configure SIEG_API_KEY, SIEG_SECRET_KEY e SIEG_CLIENTE_ID nas variáveis de ambiente da Vercel." },
        { status: 500 }
      );
    }
    console.log(`[sieg-sync] clienteId=${siegCreds.clienteId} apiKey=...${siegCreds.apiKey.slice(-6)}`);

    // CPFs/CNPJs monitorados — suporta array (novo) e string única (legado)
    let cnpjs: string[] = [];
    if (Array.isArray(cfg.cnpjs_destino)) {
      cnpjs = (cfg.cnpjs_destino as unknown as string[]).map(c => c.replace(/\D/g, "")).filter(Boolean);
    } else if (cfg.cnpj_destino) {
      cnpjs = [cfg.cnpj_destino.replace(/\D/g, "")];
    }

    if (cnpjs.length === 0) {
      // Tenta auto-detectar do módulo fiscal
      const { data: fiscalRows } = await db
        .from("configuracoes_modulo")
        .select("config")
        .eq("fazenda_id", fazenda_id)
        .like("modulo", "fiscal%")
        .limit(1);
      const doc = (fiscalRows?.[0]?.config as Record<string, string>)?.cpf_cnpj_emitente?.replace(/\D/g, "");
      if (doc) cnpjs = [doc];
    }

    if (cnpjs.length === 0) {
      return NextResponse.json(
        { erro: "Nenhum CPF/CNPJ configurado — acesse Configurações → Integrações → Sieg." },
        { status: 400 }
      );
    }

    // Data inicial: última sync ou 365 dias atrás (sempre datetime completo — API Sieg exige)
    // Pode ser sobrescrita pelo parâmetro data_inicio enviado no body da requisição
    const toISO = (d: string) => d.length === 10 ? d + "T00:00:00.000Z" : d;
    const dataInicioOverride = dataInicioParam ? toISO(dataInicioParam) : null;
    const umAnoAtras = new Date(Date.now() - 365 * 86_400_000).toISOString();
    const uploadInicio = dataInicioOverride ?? (
      (cfg.ultima_sync_ts ?? cfg.ultima_sync_data)
        ? toISO(cfg.ultima_sync_ts ?? cfg.ultima_sync_data!)
        : umAnoAtras
    );
    const uploadFim = dataFimParam ? toISO(dataFimParam).replace("T00:00:00.000Z", "T23:59:59.999Z") : new Date().toISOString();

    // ── 2. Buscar NF-e no Sieg para cada CPF/CNPJ ───────────────────────────
    const xmlsNFe: { xml: string; cnpj_destino: string }[] = [];
    for (const cnpj of cnpjs) {
      try {
        const docs = await baixarXmlsSieg(siegCreds, {
          TipoXml: 1,
          DataUploadInicio: uploadInicio,
          DataUploadFim:    uploadFim,
          CnpjDest:         cnpj,
        });
        for (const xml of docs) xmlsNFe.push({ xml, cnpj_destino: cnpj });
      } catch (e) {
        return NextResponse.json({ erro: `Falha na comunicação com Sieg (${cnpj}): ${e}` }, { status: 502 });
      }
    }

    // ── 3. Processar cada XML ────────────────────────────────────────────────
    let importados_nfe = 0;
    let duplicados_nfe = 0;
    const erros: string[] = [];

    for (const { xml, cnpj_destino } of xmlsNFe) {
      const nfe = parseNFeXml(xml);
      if (!nfe) { erros.push("XML sem Id NFe válido"); continue; }
      if (!nfe.numero || !nfe.data_emissao) { erros.push(`NF ${nfe.chave}: campos obrigatórios ausentes`); continue; }

      // Filtro por chaves específicas (re-importação pontual)
      if (chavesAcesso && chavesAcesso.length > 0 && !chavesAcesso.includes(nfe.chave)) continue;

      // Verificar duplicata pela chave de acesso
      const { data: dup } = await db
        .from("nf_entradas")
        .select("id, status")
        .eq("fazenda_id", fazenda_id)
        .eq("chave_acesso", nfe.chave)
        .maybeSingle();

      const itensPayload = nfe.itens.map(item => ({
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
      }));

      if (dup) {
        if (!forceReimport) { duplicados_nfe++; continue; }
        // Re-importação forçada: atualiza cabeçalho e, se ainda pendente, recria itens
        await db.from("nf_entradas").update({
          numero:        nfe.numero,
          serie:         nfe.serie,
          data_emissao:  nfe.data_emissao,
          emitente_nome: nfe.nome_emitente,
          emitente_cnpj: nfe.cnpj_emitente,
          valor_total:   nfe.valor_total,
          natureza:      nfe.natureza,
          cfop:          nfe.cfop,
          cnpj_destino,
          observacao:    `Re-importado via Sieg DFe em ${new Date().toLocaleDateString("pt-BR")}${nfe.ie_emitente ? ` — IE: ${nfe.ie_emitente}` : ""}`,
        }).eq("id", dup.id);
        if (dup.status === "pendente" && itensPayload.length > 0) {
          await db.from("nf_entrada_itens").delete().eq("nf_entrada_id", dup.id);
          await db.from("nf_entrada_itens").insert(itensPayload.map(it => ({ ...it, nf_entrada_id: dup.id })));
        }
        importados_nfe++;
        continue;
      }

      // Inserir NF nova
      const { data: nfRow, error: nfErr } = await db
        .from("nf_entradas")
        .insert({
          fazenda_id,
          numero:        nfe.numero,
          serie:         nfe.serie,
          chave_acesso:  nfe.chave,
          data_emissao:  nfe.data_emissao,
          emitente_nome: nfe.nome_emitente,
          emitente_cnpj: nfe.cnpj_emitente,
          valor_total:   nfe.valor_total,
          natureza:      nfe.natureza,
          cfop:          nfe.cfop,
          cnpj_destino,
          status:        "pendente",
          origem:        "sieg",
          observacao:    `Importado via Sieg DFe em ${new Date().toLocaleDateString("pt-BR")}${nfe.ie_emitente ? ` — IE: ${nfe.ie_emitente}` : ""}`,
        })
        .select("id")
        .single();

      if (nfErr || !nfRow) {
        erros.push(`NF ${nfe.numero} (…${nfe.chave.slice(-8)}): ${nfErr?.message ?? "erro ao salvar"}`);
        continue;
      }

      // Inserir itens
      if (itensPayload.length > 0) {
        const { error: iErr } = await db.from("nf_entrada_itens").insert(
          itensPayload.map(it => ({ ...it, nf_entrada_id: nfRow.id }))
        );
        if (iErr) erros.push(`Itens NF ${nfe.numero}: ${iErr.message}`);
      }

      importados_nfe++;
    }

    // ── 4. Persistir última sync ─────────────────────────────────────────────
    const novoCfg = {
      ...cfg,
      cnpjs_destino:    cnpjs,
      ultima_sync_data: new Date().toISOString().slice(0, 10),
      ultima_sync_ts:   new Date().toISOString(),
      total_importado:  String((parseInt(String(cfg.total_importado || "0")) + importados_nfe)),
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
