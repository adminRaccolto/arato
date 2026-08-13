/**
 * POST /api/integracoes/sieg-sync-nfse
 * Busca NFS-e (TipoXml: 3) no Sieg DFe Monitor e importa como NF de Serviço.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient }              from "@supabase/supabase-js";
import { baixarXmlsSiegChunked, credenciaisEnv, credenciaisValidas } from "../../../../lib/sieg";

export const runtime = "nodejs";

function sb() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

// ── Parser best-effort para NFSe (ABRASF v1/v2 + variantes municipais) ────────

function tv(xml: string, ...tags: string[]): string {
  for (const tag of tags) {
    const m = xml.match(new RegExp(`<${tag}(?:\\s[^>]*)?>([^<]*)</${tag}>`));
    if (m) return m[1].trim();
  }
  return "";
}

function block(xml: string, ...tags: string[]): string {
  for (const tag of tags) {
    const m = xml.match(new RegExp(`<${tag}(?:\\s[^>]*)?>[\\s\\S]*?</${tag}>`));
    if (m) return m[0];
  }
  return "";
}

interface NfseParseResult {
  chave:             string;
  numero:            string;
  data_emissao:      string;
  prestador_cnpj:    string;
  prestador_nome:    string;
  tomador_cnpj:      string;
  tomador_nome:      string;
  municipio:         string;
  discriminacao:     string;
  codigo_servico:    string;
  valor_servico:     number;
  valor_deducoes:    number;
  aliquota_iss:      number;
  valor_iss:         number;
  iss_retido:        boolean;
  valor_inss:        number;
  valor_ir:          number;
  valor_liquido:     number;
}

function parseNfseXml(xml: string): NfseParseResult | null {
  try {
    // Número — vários nomes de tag possíveis
    const numero = tv(xml, "Numero", "nNfse", "NumeroNfse", "NfseNumero") || tv(xml, "nNF");
    if (!numero) return null;

    // Data de emissão
    const dhEmi = tv(xml, "DataEmissaoNfse", "DataEmissao", "dhEmi", "DhEmi", "DataEmissaoRps");
    if (!dhEmi) return null;
    const data_emissao = dhEmi.slice(0, 10);

    // Chave de acesso (nem sempre presente em NFSe municipal)
    const chave = tv(xml, "CodigoVerificacao", "ChaveNfse", "chave_nfse", "Codigo") || `${numero}-${data_emissao}`;

    // Prestador
    const prestadorBlock = block(xml, "PrestadorServico", "Prestador", "DadosPrestador");
    const identPrest      = block(prestadorBlock || xml, "IdentificacaoPrestador", "CpfCnpjPrestador");
    const prestador_cnpj  = tv(identPrest || prestadorBlock || xml, "Cnpj", "Cpf", "CpfCnpj").replace(/\D/g, "");
    const prestador_nome  = tv(prestadorBlock || xml, "RazaoSocial", "xNome", "NomeEmpresarial");

    // Tomador
    const tomadorBlock  = block(xml, "TomadorServico", "Tomador", "DadosTomador");
    const identTom      = block(tomadorBlock || xml, "IdentificacaoTomador", "CpfCnpjTomador");
    const tomador_cnpj  = tv(identTom || tomadorBlock || xml, "Cnpj", "Cpf", "CpfCnpj").replace(/\D/g, "");
    const tomador_nome  = tv(tomadorBlock || xml, "RazaoSocial", "xNome", "RazaoSocialTomador");

    // Município de prestação
    const municipio = tv(xml, "MunicipioIncidencia", "CodigoMunicipio", "Municipio", "cMunFG");

    // Bloco de serviço
    const servicoBlock = block(xml, "Servico", "DeclaracaoPrestacaoServico", "InfNfse", "ListaNfse");
    const valoresBlock = block(servicoBlock || xml, "Valores", "ValoresNfse");

    const discriminacao  = tv(servicoBlock || xml, "Discriminacao", "Descricao", "xDiscriminacao");
    const codigo_servico = tv(servicoBlock || xml, "ItemListaServico", "CodigoTributacaoMunicipio", "CodigoServico", "cServTribMun");

    const valor_servico  = parseFloat(tv(valoresBlock || servicoBlock || xml, "ValorServicos", "ValorServico", "vServicos") || "0");
    const valor_deducoes = parseFloat(tv(valoresBlock || servicoBlock || xml, "ValorDeducoes", "Deducoes", "vDeducoes") || "0");
    const aliquotaRaw    = tv(valoresBlock || servicoBlock || xml, "Aliquota", "AliquotaISS", "vAliq");
    const aliquota_iss   = parseFloat(aliquotaRaw || "0");
    const valor_iss      = parseFloat(tv(valoresBlock || servicoBlock || xml, "ValorIss", "ValorISS", "vIss") || "0");
    const issRetidoRaw   = tv(valoresBlock || servicoBlock || xml, "IssRetido", "issRetido", "RetencaoIss");
    const iss_retido     = issRetidoRaw === "1" || issRetidoRaw.toLowerCase() === "true" || issRetidoRaw === "S";
    const valor_inss     = parseFloat(tv(valoresBlock || servicoBlock || xml, "ValorInss", "vInss") || "0");
    const valor_ir       = parseFloat(tv(valoresBlock || servicoBlock || xml, "ValorIr", "ValorIR", "vIR") || "0");
    const valor_liquido  = parseFloat(tv(valoresBlock || servicoBlock || xml, "ValorLiquidoNfse", "ValorLiquido", "vLiq") || "0") || Math.max(0, valor_servico - valor_iss * (iss_retido ? 1 : 0) - valor_inss - valor_ir);

    return {
      chave, numero, data_emissao,
      prestador_cnpj, prestador_nome,
      tomador_cnpj, tomador_nome,
      municipio, discriminacao, codigo_servico,
      valor_servico, valor_deducoes, aliquota_iss, valor_iss,
      iss_retido, valor_inss, valor_ir, valor_liquido,
    };
  } catch {
    return null;
  }
}

// ── Handler POST ───────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as {
      fazenda_id:     string;
      data_inicio?:   string;
      data_fim?:      string;
      force_reimport?: boolean;
    };
    const { fazenda_id, data_inicio: dataInicioParam, data_fim: dataFimParam, force_reimport: forceReimport } = body;
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

    // ── Credenciais SIEG ──────────────────────────────────────────────────────
    const siegCreds = credenciaisEnv();
    if (!credenciaisValidas(siegCreds)) {
      return NextResponse.json(
        { erro: "Credenciais SIEG incompletas. Configure SIEG_API_KEY, SIEG_SECRET_KEY e SIEG_CLIENTE_ID nas variáveis de ambiente da Vercel." },
        { status: 500 }
      );
    }

    // CPF/CNPJ do tomador (quem recebe o serviço = a fazenda)
    let cnpjs: string[] = [];
    if (Array.isArray(cfg.cnpjs_destino)) {
      cnpjs = (cfg.cnpjs_destino as unknown as string[]).map(c => c.replace(/\D/g, "")).filter(Boolean);
    } else if (cfg.cnpj_destino) {
      cnpjs = [cfg.cnpj_destino.replace(/\D/g, "")];
    }

    if (cnpjs.length === 0) {
      const { data: fiscalRows } = await db
        .from("configuracoes_modulo").select("config")
        .eq("fazenda_id", fazenda_id).like("modulo", "fiscal%").limit(1);
      const doc = (fiscalRows?.[0]?.config as Record<string, string>)?.cpf_cnpj_emitente?.replace(/\D/g, "");
      if (doc) cnpjs = [doc];
    }

    if (cnpjs.length === 0) {
      return NextResponse.json(
        { erro: "Nenhum CPF/CNPJ configurado — acesse Configurações → Integrações → Sieg." },
        { status: 400 }
      );
    }

    // ── 2. Período ────────────────────────────────────────────────────────────
    const toISO = (d: string) => d.length === 10 ? d + "T00:00:00.000Z" : d;
    const umAnoAtras    = new Date(Date.now() - 365 * 86_400_000).toISOString();
    const uploadInicio  = dataInicioParam ? toISO(dataInicioParam) : (cfg.ultima_sync_nfse_ts ?? umAnoAtras);
    const uploadFim     = dataFimParam    ? toISO(dataFimParam).replace("T00:00:00.000Z", "T23:59:59.999Z") : new Date().toISOString();

    // ── 3. Buscar NFSe para cada CNPJ ─────────────────────────────────────────
    const xmlsNfse: { xml: string; cnpj_tomador: string }[] = [];
    for (const cnpj of cnpjs) {
      try {
        const docs = await baixarXmlsSiegChunked(siegCreds, {
          TipoXml:          3,   // NFSe
          DataUploadInicio: uploadInicio,
          DataUploadFim:    uploadFim,
          CnpjTom:          cnpj, // tomador = a empresa/fazenda que contratou o serviço
        });
        for (const xml of docs) xmlsNfse.push({ xml, cnpj_tomador: cnpj });
      } catch (e) {
        return NextResponse.json({ erro: `Falha na comunicação com Sieg (${cnpj}): ${e}` }, { status: 502 });
      }
    }

    // ── 4. Processar cada XML ─────────────────────────────────────────────────
    let importadas  = 0;
    let duplicadas  = 0;
    const erros: string[] = [];

    for (const { xml, cnpj_tomador } of xmlsNfse) {
      const nfse = parseNfseXml(xml);
      if (!nfse) { erros.push("XML sem número NFSe válido"); continue; }

      // Verificar duplicata pela chave
      const { data: dup } = await db
        .from("nf_servicos")
        .select("id, status")
        .eq("fazenda_id", fazenda_id)
        .eq("chave_nfse", nfse.chave)
        .maybeSingle();

      if (dup) {
        if (!forceReimport) { duplicadas++; continue; }
        // Re-importação forçada
        await db.from("nf_servicos").update({
          numero_nf:          nfse.numero,
          data_prestacao:     nfse.data_emissao,
          competencia:        nfse.data_emissao.substring(0, 7),
          prestador_nome:     nfse.prestador_nome,
          prestador_cnpj:     nfse.prestador_cnpj,
          municipio_prestacao: nfse.municipio,
          discriminacao:      nfse.discriminacao,
          codigo_servico:     nfse.codigo_servico || null,
          valor_servico:      nfse.valor_servico,
          valor_deducoes:     nfse.valor_deducoes,
          valor_base_iss:     Math.max(0, nfse.valor_servico - nfse.valor_deducoes),
          aliquota_iss:       nfse.aliquota_iss,
          valor_iss:          nfse.valor_iss,
          iss_retido:         nfse.iss_retido,
          valor_inss:         nfse.valor_inss,
          valor_ir:           nfse.valor_ir,
          valor_outras_retencoes: 0,
          valor_liquido:      nfse.valor_liquido,
          observacao:         `Re-importado via Sieg em ${new Date().toLocaleDateString("pt-BR")}`,
        }).eq("id", dup.id);
        importadas++;
        continue;
      }

      // Inserir nova NFSe
      const { error: insErr } = await db.from("nf_servicos").insert({
        fazenda_id,
        numero_nf:          nfse.numero,
        serie:              "NFS",
        chave_nfse:         nfse.chave,
        prestador_nome:     nfse.prestador_nome || "Prestador SIEG",
        prestador_cnpj:     nfse.prestador_cnpj || null,
        municipio_prestacao: nfse.municipio || null,
        data_prestacao:     nfse.data_emissao,
        competencia:        nfse.data_emissao.substring(0, 7),
        codigo_servico:     nfse.codigo_servico || null,
        discriminacao:      nfse.discriminacao || null,
        valor_servico:      nfse.valor_servico,
        valor_deducoes:     nfse.valor_deducoes,
        valor_base_iss:     Math.max(0, nfse.valor_servico - nfse.valor_deducoes),
        aliquota_iss:       nfse.aliquota_iss,
        valor_iss:          nfse.valor_iss,
        iss_retido:         nfse.iss_retido,
        valor_inss:         nfse.valor_inss,
        valor_ir:           nfse.valor_ir,
        valor_outras_retencoes: 0,
        valor_liquido:      nfse.valor_liquido,
        status:             "pendente",
        origem:             "api",
        observacao:         `Importado via Sieg DFe em ${new Date().toLocaleDateString("pt-BR")} — Tomador: ${cnpj_tomador}`,
      });

      if (insErr) { erros.push(`NFSe ${nfse.numero}: ${insErr.message}`); continue; }
      importadas++;
    }

    // ── 5. Atualizar timestamp da última sync de NFSe ─────────────────────────
    await db.from("configuracoes_modulo").upsert({
      fazenda_id,
      modulo: "sieg",
      config: { ...cfg, ultima_sync_nfse_ts: new Date().toISOString() },
    });

    return NextResponse.json({
      sucesso:   true,
      importadas,
      duplicadas,
      total_xmls: xmlsNfse.length,
      erros:     erros.slice(0, 20),
    });

  } catch (err) {
    console.error("[sieg-sync-nfse]", err);
    return NextResponse.json({ erro: String(err) }, { status: 500 });
  }
}
