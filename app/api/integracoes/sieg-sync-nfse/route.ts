/**
 * POST /api/integracoes/sieg-sync-nfse
 * Busca NFS-e (TipoXml: 3) no Sieg DFe Monitor e importa como NF de Serviço.
 *
 * Estratégia de CNPJ:
 *   1. Tenta com CnpjTom=<cnpj> (filtra pelo tomador no SIEG)
 *   2. Se retornar 0 XMLs, tenta sem filtro e filtra client-side pelo CNPJ do tomador no XML
 *   Isso garante compatibilidade com versões do SIEG que não suportam CnpjTom para NFSe.
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
    const m = xml.match(new RegExp(`<${tag}(?:\\s[^>]*)?>([^<]*)</${tag}>`, "i"));
    if (m) return m[1].trim();
  }
  return "";
}

function block(xml: string, ...tags: string[]): string {
  for (const tag of tags) {
    const m = xml.match(new RegExp(`<${tag}(?:\\s[^>]*)?>[\\s\\S]*?</${tag}>`, "i"));
    if (m) return m[0];
  }
  return "";
}

function parseMoney(s: string): number {
  if (!s) return 0;
  // "1.234,56" → 1234.56  |  "1234.56" → 1234.56
  const clean = s.replace(/[^\d,.-]/g, "");
  // Se tem vírgula como separador decimal (pt-BR)
  if (/,\d{1,2}$/.test(clean)) {
    return parseFloat(clean.replace(/\./g, "").replace(",", ".")) || 0;
  }
  return parseFloat(clean) || 0;
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
    // ── Número (múltiplos formatos municipais) ───────────────────────────────
    const numero =
      tv(xml, "Numero", "NumeroNfse", "nNfse", "NfseNumero", "NumeroNF", "nNF",
         "numeroNfse", "numero_nfse") ||
      // alguns XMLs usam atributo: <Nfse Numero="123">
      (xml.match(/Numero=["'](\d+)["']/i)?.[1] ?? "");
    if (!numero) return null;

    // ── Data de emissão ──────────────────────────────────────────────────────
    const dhEmi =
      tv(xml, "DataEmissaoNfse", "DataEmissao", "dataEmissao", "dhEmi", "DhEmi",
         "DataEmissaoRps", "Data", "dtEmissao", "dtNfse");
    if (!dhEmi) return null;
    const data_emissao = dhEmi.slice(0, 10); // YYYY-MM-DD

    // ── Chave de acesso ──────────────────────────────────────────────────────
    const chave =
      tv(xml, "CodigoVerificacao", "ChaveNfse", "chave_nfse", "Codigo",
         "CodVerificacao", "codigoVerificacao") ||
      `${numero}-${data_emissao}`;

    // ── Prestador ────────────────────────────────────────────────────────────
    const prestBlock = block(xml, "PrestadorServico", "Prestador", "DadosPrestador",
                             "InfPrestador", "prestador");
    const idPrest    = block(prestBlock || xml, "IdentificacaoPrestador", "CpfCnpjPrestador",
                             "Cnpj", "identificacaoPrestador");
    const prestador_cnpj =
      tv(idPrest || prestBlock || xml, "Cnpj", "Cpf", "CpfCnpj", "cnpj", "cpf")
        .replace(/\D/g, "");
    const prestador_nome =
      tv(prestBlock || xml, "RazaoSocial", "xNome", "NomeEmpresarial", "razaoSocial",
         "Nome", "nomeEmpresarial");

    // ── Tomador ──────────────────────────────────────────────────────────────
    const tomBlock   = block(xml, "TomadorServico", "Tomador", "DadosTomador",
                             "InfTomador", "tomador");
    const idTom      = block(tomBlock || xml, "IdentificacaoTomador", "CpfCnpjTomador",
                             "identificacaoTomador");
    const tomador_cnpj =
      tv(idTom || tomBlock || xml, "Cnpj", "Cpf", "CpfCnpj", "cnpj", "cpf")
        .replace(/\D/g, "");
    const tomador_nome =
      tv(tomBlock || xml, "RazaoSocial", "xNome", "RazaoSocialTomador", "razaoSocial",
         "Nome", "nomeTomador");

    // ── Município ────────────────────────────────────────────────────────────
    const municipio =
      tv(xml, "MunicipioIncidencia", "CodigoMunicipio", "Municipio", "cMunFG",
         "municipio", "municipioIncidencia");

    // ── Bloco de serviço / valores ───────────────────────────────────────────
    const servBlock = block(xml, "Servico", "DeclaracaoPrestacaoServico", "InfNfse",
                             "servico", "DadosServico");
    const valBlock  = block(servBlock || xml, "Valores", "ValoresNfse", "valores");

    const discriminacao =
      tv(servBlock || xml, "Discriminacao", "Descricao", "xDiscriminacao",
         "discriminacao", "descricao");
    const codigo_servico =
      tv(servBlock || xml, "ItemListaServico", "CodigoTributacaoMunicipio",
         "CodigoServico", "cServTribMun", "itemListaServico", "codigoServico");

    const valor_servico  = parseMoney(tv(valBlock || servBlock || xml,
      "ValorServicos", "ValorServico", "vServicos", "valorServico", "valor_servico"));
    const valor_deducoes = parseMoney(tv(valBlock || servBlock || xml,
      "ValorDeducoes", "Deducoes", "vDeducoes", "valorDeducoes"));
    const aliquota_raw   = tv(valBlock || servBlock || xml,
      "Aliquota", "AliquotaISS", "vAliq", "aliquota", "aliquotaIss");
    const aliquota_iss   = parseFloat(aliquota_raw || "0");
    const valor_iss      = parseMoney(tv(valBlock || servBlock || xml,
      "ValorIss", "ValorISS", "vIss", "valorIss", "valorISS"));

    const issRetidoRaw   = tv(valBlock || servBlock || xml,
      "IssRetido", "issRetido", "RetencaoIss", "retencaoIss");
    const iss_retido     = issRetidoRaw === "1"
      || issRetidoRaw.toLowerCase() === "true"
      || issRetidoRaw === "S"
      || issRetidoRaw === "s";

    const valor_inss  = parseMoney(tv(valBlock || servBlock || xml,
      "ValorInss", "vInss", "valorInss", "ValorRetInss"));
    const valor_ir    = parseMoney(tv(valBlock || servBlock || xml,
      "ValorIr", "ValorIR", "vIR", "valorIr", "ValorRetIr"));
    const valor_liq_raw = tv(valBlock || servBlock || xml,
      "ValorLiquidoNfse", "ValorLiquido", "vLiq", "valorLiquido", "valorLiquidoNfse");
    const valor_liquido = parseMoney(valor_liq_raw)
      || Math.max(0, valor_servico - valor_iss * (iss_retido ? 1 : 0) - valor_inss - valor_ir);

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
    const { fazenda_id, data_inicio: dataInicioParam, data_fim: dataFimParam,
            force_reimport: forceReimport } = body;
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
        { erro: "Credenciais SIEG incompletas. Configure SIEG_API_KEY, SIEG_SECRET_KEY e SIEG_CLIENTE_ID." },
        { status: 500 }
      );
    }

    // ── CNPJs monitorados ─────────────────────────────────────────────────────
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
    const umAnoAtras   = new Date(Date.now() - 365 * 86_400_000).toISOString();
    const uploadInicio = dataInicioParam ? toISO(dataInicioParam) : (cfg.ultima_sync_nfse_ts ?? umAnoAtras);
    const uploadFim    = dataFimParam
      ? toISO(dataFimParam).replace("T00:00:00.000Z", "T23:59:59.999Z")
      : new Date().toISOString();

    console.log(`[sieg-sync-nfse] fazenda=${fazenda_id} cnpjs=${cnpjs.join(",")} periodo=${uploadInicio.slice(0,10)}→${uploadFim.slice(0,10)}`);

    // ── 3. Buscar NFSe ────────────────────────────────────────────────────────
    // Tenta primeiro com CnpjTom; se retornar 0, tenta sem filtro (SIEG pode
    // não suportar CnpjTom para TipoXml:3 em algumas versões).
    const xmlsNfse: { xml: string; cnpj_tomador: string }[] = [];

    for (const cnpj of cnpjs) {
      let docs: string[] = [];
      try {
        docs = await baixarXmlsSiegChunked(siegCreds, {
          TipoXml:          3,
          DataUploadInicio: uploadInicio,
          DataUploadFim:    uploadFim,
          CnpjTom:          cnpj,
        });
        console.log(`[sieg-sync-nfse] CnpjTom=${cnpj}: ${docs.length} XMLs`);
      } catch (e) {
        return NextResponse.json({ erro: `Falha SIEG (CnpjTom=${cnpj}): ${e}` }, { status: 502 });
      }

      // Fallback: sem filtro de CNPJ → filtra client-side pelo tomador no XML
      if (docs.length === 0) {
        console.log(`[sieg-sync-nfse] 0 XMLs com CnpjTom — tentando sem filtro CNPJ`);
        try {
          const docsAll = await baixarXmlsSiegChunked(siegCreds, {
            TipoXml:          3,
            DataUploadInicio: uploadInicio,
            DataUploadFim:    uploadFim,
          });
          console.log(`[sieg-sync-nfse] sem filtro CNPJ: ${docsAll.length} XMLs`);
          // Filtra pelo CNPJ do tomador dentro do XML
          for (const xml of docsAll) {
            const tomBlock = xml.match(/<TomadorServico[\s\S]*?<\/TomadorServico>/i)?.[0]
              ?? xml.match(/<Tomador[\s\S]*?<\/Tomador>/i)?.[0] ?? "";
            const cnpjTom = (tomBlock.match(/<Cnpj>(\d+)<\/Cnpj>/i)?.[1] ?? "")
              || (tomBlock.match(/<CpfCnpj>(\d+)<\/CpfCnpj>/i)?.[1] ?? "");
            if (cnpjTom === cnpj || cnpjTom.slice(-8) === cnpj.slice(-8)) {
              xmlsNfse.push({ xml, cnpj_tomador: cnpj });
            }
          }
          console.log(`[sieg-sync-nfse] após filtro client-side: ${xmlsNfse.length} XMLs para cnpj=${cnpj}`);
        } catch (e2) {
          console.warn(`[sieg-sync-nfse] fallback sem CNPJ também falhou: ${e2}`);
          // Continua com 0 — não é erro fatal
        }
      } else {
        for (const xml of docs) xmlsNfse.push({ xml, cnpj_tomador: cnpj });
      }
    }

    console.log(`[sieg-sync-nfse] total XMLs NFSe: ${xmlsNfse.length}`);

    // ── 4. Processar cada XML ─────────────────────────────────────────────────
    let importadas  = 0;
    let duplicadas  = 0;
    const erros: string[] = [];

    for (const { xml, cnpj_tomador } of xmlsNfse) {
      const nfse = parseNfseXml(xml);
      if (!nfse) {
        // Loga trecho do XML para diagnóstico
        const trecho = xml.slice(0, 200).replace(/\n/g, " ");
        erros.push(`Parse falhou: ${trecho}`);
        console.warn(`[sieg-sync-nfse] parse null — XML: ${trecho}`);
        continue;
      }

      // Dedup: chave_nfse (se tiver) ou numero+data+prestador
      let dup = null as { id: string; status: string } | null;
      if (nfse.chave && !nfse.chave.includes("-")) {
        // chave real (44 dígitos ou código de verificação)
        const { data: d } = await db
          .from("nf_servicos").select("id, status")
          .eq("fazenda_id", fazenda_id).eq("chave_nfse", nfse.chave).maybeSingle();
        dup = d;
      } else {
        // fallback: numero + data_prestacao
        const { data: d } = await db
          .from("nf_servicos").select("id, status")
          .eq("fazenda_id", fazenda_id)
          .eq("numero_nf", nfse.numero)
          .eq("data_prestacao", nfse.data_emissao)
          .eq("prestador_cnpj", nfse.prestador_cnpj || "")
          .maybeSingle();
        dup = d;
      }

      if (dup) {
        if (!forceReimport) { duplicadas++; continue; }
        await db.from("nf_servicos").update({
          chave_nfse:          nfse.chave || undefined,
          numero_nf:           nfse.numero,
          data_prestacao:      nfse.data_emissao,
          competencia:         nfse.data_emissao.substring(0, 7),
          prestador_nome:      nfse.prestador_nome || "Prestador SIEG",
          prestador_cnpj:      nfse.prestador_cnpj || null,
          municipio_prestacao: nfse.municipio || null,
          discriminacao:       nfse.discriminacao || null,
          codigo_servico:      nfse.codigo_servico || null,
          valor_servico:       nfse.valor_servico,
          valor_deducoes:      nfse.valor_deducoes,
          valor_base_iss:      Math.max(0, nfse.valor_servico - nfse.valor_deducoes),
          aliquota_iss:        nfse.aliquota_iss,
          valor_iss:           nfse.valor_iss,
          iss_retido:          nfse.iss_retido,
          valor_inss:          nfse.valor_inss,
          valor_ir:            nfse.valor_ir,
          valor_outras_retencoes: 0,
          valor_liquido:       nfse.valor_liquido,
          observacao:          `Re-importado via Sieg em ${new Date().toLocaleDateString("pt-BR")}`,
        }).eq("id", dup.id);
        importadas++;
        continue;
      }

      const { error: insErr } = await db.from("nf_servicos").insert({
        fazenda_id,
        numero_nf:           nfse.numero,
        serie:               "NFS",
        chave_nfse:          nfse.chave || undefined,
        prestador_nome:      nfse.prestador_nome || "Prestador SIEG",
        prestador_cnpj:      nfse.prestador_cnpj || null,
        municipio_prestacao: nfse.municipio || null,
        data_prestacao:      nfse.data_emissao,
        competencia:         nfse.data_emissao.substring(0, 7),
        codigo_servico:      nfse.codigo_servico || null,
        discriminacao:       nfse.discriminacao || null,
        valor_servico:       nfse.valor_servico,
        valor_deducoes:      nfse.valor_deducoes,
        valor_base_iss:      Math.max(0, nfse.valor_servico - nfse.valor_deducoes),
        aliquota_iss:        nfse.aliquota_iss,
        valor_iss:           nfse.valor_iss,
        iss_retido:          nfse.iss_retido,
        valor_inss:          nfse.valor_inss,
        valor_ir:            nfse.valor_ir,
        valor_outras_retencoes: 0,
        valor_liquido:       nfse.valor_liquido,
        status:              "pendente",
        origem:              "api",
        observacao:          `Importado via Sieg DFe em ${new Date().toLocaleDateString("pt-BR")} — Tomador: ${cnpj_tomador}`,
      });

      if (insErr) {
        erros.push(`NFSe ${nfse.numero}: ${insErr.message}`);
        console.error(`[sieg-sync-nfse] insert error: ${insErr.message}`);
        continue;
      }
      importadas++;
    }

    // ── 5. Atualizar timestamp ────────────────────────────────────────────────
    if (importadas > 0 || xmlsNfse.length > 0) {
      await db.from("configuracoes_modulo").upsert({
        fazenda_id,
        modulo: "sieg",
        config: { ...cfg, ultima_sync_nfse_ts: new Date().toISOString() },
      });
    }

    console.log(`[sieg-sync-nfse] resultado: importadas=${importadas} duplicadas=${duplicadas} erros=${erros.length}`);

    return NextResponse.json({
      sucesso:    true,
      importadas,
      duplicadas,
      total_xmls: xmlsNfse.length,
      erros:      erros.slice(0, 10),
    });

  } catch (err) {
    console.error("[sieg-sync-nfse]", err);
    return NextResponse.json({ erro: String(err) }, { status: 500 });
  }
}
