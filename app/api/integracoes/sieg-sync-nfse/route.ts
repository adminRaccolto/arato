/**
 * POST /api/integracoes/sieg-sync-nfse
 * Busca NFS-e (TipoXml: 3) no Sieg DFe Monitor e importa como NF de Serviço.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient }              from "@supabase/supabase-js";
import { baixarXmlsSieg, baixarXmlsSiegChunked, credenciaisEnv, credenciaisValidas } from "../../../../lib/sieg";

const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

export const runtime    = "nodejs";
export const maxDuration = 300; // 5 min — necessário para downloads grandes do SIEG

function sb() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

// ── Parser NFSe (ABRASF v1/v2 + variantes municipais) ─────────────────────────

function tv(xml: string, ...tags: string[]): string {
  for (const tag of tags) {
    const re = new RegExp(`<${tag}(?:\\s[^>]*)?>([^<]*)</${tag}>`, "i");
    const m  = xml.match(re);
    if (m) return m[1].trim();
  }
  return "";
}

function blk(xml: string, ...tags: string[]): string {
  for (const tag of tags) {
    const re = new RegExp(`<${tag}(?:\\s[^>]*)?>[\\s\\S]*?</${tag}>`, "i");
    const m  = xml.match(re);
    if (m) return m[0];
  }
  return "";
}

function money(s: string): number {
  if (!s) return 0;
  const c = s.replace(/[^\d,.-]/g, "");
  if (/,\d{1,2}$/.test(c)) return parseFloat(c.replace(/\./g, "").replace(",", ".")) || 0;
  return parseFloat(c) || 0;
}

interface Nfse {
  chave: string; numero: string; data_emissao: string;
  prestador_cnpj: string; prestador_nome: string;
  tomador_cnpj: string; municipio: string; discriminacao: string;
  codigo_servico: string; valor_servico: number; valor_deducoes: number;
  aliquota_iss: number; valor_iss: number; iss_retido: boolean;
  valor_inss: number; valor_ir: number; valor_liquido: number;
}

function parseNfse(xml: string): Nfse | null {
  try {
    const numero = tv(xml,
      "Numero", "NumeroNfse", "nNfse", "NfseNumero", "NumeroNF", "nNF") ||
      (xml.match(/Numero=["'](\d+)["']/i)?.[1] ?? "");
    if (!numero) return null;

    const dhEmi = tv(xml,
      "DataEmissaoNfse", "DataEmissao", "dataEmissao", "dhEmi", "DhEmi",
      "DataEmissaoRps", "Data", "dtEmissao", "dtNfse");
    if (!dhEmi) return null;
    const data_emissao = dhEmi.slice(0, 10);

    const chave = tv(xml,
      "CodigoVerificacao", "ChaveNfse", "chave_nfse", "Codigo",
      "CodVerificacao", "codigoVerificacao") || `${numero}-${data_emissao}`;

    const pBlk = blk(xml, "PrestadorServico", "Prestador", "DadosPrestador", "prestador");
    const pId  = blk(pBlk || xml, "IdentificacaoPrestador", "CpfCnpjPrestador", "identificacaoPrestador");
    const prestador_cnpj = tv(pId || pBlk || xml, "Cnpj", "Cpf", "CpfCnpj", "cnpj", "cpf").replace(/\D/g, "");
    const prestador_nome = tv(pBlk || xml, "RazaoSocial", "xNome", "NomeEmpresarial", "razaoSocial", "Nome");

    const tBlk = blk(xml, "TomadorServico", "Tomador", "DadosTomador", "tomador");
    const tId  = blk(tBlk || xml, "IdentificacaoTomador", "CpfCnpjTomador", "identificacaoTomador");
    const tomador_cnpj = tv(tId || tBlk || xml, "Cnpj", "Cpf", "CpfCnpj", "cnpj", "cpf").replace(/\D/g, "");

    const municipio = tv(xml, "MunicipioIncidencia", "CodigoMunicipio", "Municipio", "cMunFG", "municipio");

    const sBlk = blk(xml, "Servico", "DeclaracaoPrestacaoServico", "InfNfse", "servico", "DadosServico");
    const vBlk = blk(sBlk || xml, "Valores", "ValoresNfse", "valores");

    const discriminacao   = tv(sBlk || xml, "Discriminacao", "Descricao", "xDiscriminacao", "discriminacao");
    const codigo_servico  = tv(sBlk || xml, "ItemListaServico", "CodigoTributacaoMunicipio", "CodigoServico", "itemListaServico", "codigoServico");
    const valor_servico   = money(tv(vBlk || sBlk || xml, "ValorServicos", "ValorServico", "vServicos", "valorServico"));
    const valor_deducoes  = money(tv(vBlk || sBlk || xml, "ValorDeducoes", "Deducoes", "vDeducoes", "valorDeducoes"));
    const aliquota_raw    = tv(vBlk || sBlk || xml, "Aliquota", "AliquotaISS", "vAliq", "aliquota");
    const aliquota_iss    = parseFloat(aliquota_raw || "0");
    const valor_iss       = money(tv(vBlk || sBlk || xml, "ValorIss", "ValorISS", "vIss", "valorIss"));
    const issRaw          = tv(vBlk || sBlk || xml, "IssRetido", "issRetido", "RetencaoIss", "retencaoIss");
    const iss_retido      = issRaw === "1" || issRaw.toLowerCase() === "true" || issRaw === "S" || issRaw === "s";
    const valor_inss      = money(tv(vBlk || sBlk || xml, "ValorInss", "vInss", "valorInss", "ValorRetInss"));
    const valor_ir        = money(tv(vBlk || sBlk || xml, "ValorIr", "ValorIR", "vIR", "valorIr"));
    const vlRaw           = tv(vBlk || sBlk || xml, "ValorLiquidoNfse", "ValorLiquido", "vLiq", "valorLiquido");
    const valor_liquido   = money(vlRaw) || Math.max(0, valor_servico - valor_iss * (iss_retido ? 1 : 0) - valor_inss - valor_ir);

    return {
      chave, numero, data_emissao, prestador_cnpj, prestador_nome,
      tomador_cnpj, municipio, discriminacao, codigo_servico,
      valor_servico, valor_deducoes, aliquota_iss, valor_iss,
      iss_retido, valor_inss, valor_ir, valor_liquido,
    };
  } catch { return null; }
}

// ── Handler ────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as {
      fazenda_id: string; data_inicio?: string; data_fim?: string; force_reimport?: boolean;
    };
    const { fazenda_id, data_inicio: dtIni, data_fim: dtFim, force_reimport: force } = body;
    if (!fazenda_id) return NextResponse.json({ erro: "fazenda_id obrigatório" }, { status: 400 });

    const db = sb();

    const { data: row } = await db
      .from("configuracoes_modulo").select("config")
      .eq("fazenda_id", fazenda_id).eq("modulo", "sieg").maybeSingle();
    const cfg = (row?.config ?? {}) as Record<string, string>;

    const siegCreds = credenciaisEnv();
    if (!credenciaisValidas(siegCreds)) {
      return NextResponse.json({ erro: "Credenciais SIEG incompletas (SIEG_API_KEY / SIEG_SECRET_KEY / SIEG_CLIENTE_ID)." }, { status: 500 });
    }

    // ── CNPJs monitorados ─────────────────────────────────────────────────────
    let cnpjs: string[] = [];
    if (Array.isArray(cfg.cnpjs_destino)) {
      cnpjs = (cfg.cnpjs_destino as unknown as string[]).map(c => c.replace(/\D/g, "")).filter(Boolean);
    } else if (cfg.cnpj_destino) {
      cnpjs = [cfg.cnpj_destino.replace(/\D/g, "")];
    }
    if (cnpjs.length === 0) {
      const { data: fr } = await db
        .from("configuracoes_modulo").select("config")
        .eq("fazenda_id", fazenda_id).like("modulo", "fiscal%").limit(1);
      const doc = (fr?.[0]?.config as Record<string, string> | undefined)?.cpf_cnpj_emitente?.replace(/\D/g, "");
      if (doc) cnpjs = [doc];
    }
    if (cnpjs.length === 0) {
      return NextResponse.json({ erro: "Nenhum CPF/CNPJ configurado — acesse Configurações → Integrações → Sieg." }, { status: 400 });
    }

    // ── Período ───────────────────────────────────────────────────────────────
    const toISO   = (d: string) => d.length === 10 ? d + "T00:00:00.000Z" : d;
    // Padrão 30 dias (não 1 ano) para a primeira sync ser rápida
    const trintaDias = new Date(Date.now() - 30 * 86_400_000).toISOString();
    const iniStr  = dtIni ? toISO(dtIni) : (cfg.ultima_sync_nfse_ts ?? trintaDias);
    const fimStr  = dtFim ? toISO(dtFim).replace("T00:00:00.000Z", "T23:59:59.999Z") : new Date().toISOString();

    console.log(`[nfse] fazenda=${fazenda_id} cnpjs=${cnpjs.join(",")} ${iniStr.slice(0,10)}→${fimStr.slice(0,10)}`);

    // ── Buscar XMLs no SIEG ───────────────────────────────────────────────────
    // Estratégia em 5 níveis (NFSe no SIEG pode ser indexada de formas diferentes):
    // 1. CnpjTom  + DataUpload  (tomador — padrão ABRASF)
    // 2. CnpjDest + DataUpload  (destinatário — variante de alguns provedores)
    // 3. CnpjTom  + DataEmissao (tomador por data de emissão — alguns municípios usam DataEmissao no índice)
    // 4. CnpjDest + DataEmissao (destinatário por data de emissão)
    // 5. Fallback geral (sem filtro CNPJ) + filtro client-side — limite: 30d com force, 15d sem force
    const xmlsList: Array<{ xml: string; cnpj: string }> = [];
    let importadas = 0;
    let duplicadas = 0;
    const erros: string[] = [];
    const diagnostico: string[] = [];

    for (const cnpj of cnpjs) {
      let docs: string[] = [];
      const tentativas: string[] = [];

      // helper: tenta um nível, registra resultado na lista de tentativas
      const tentar = async (label: string, params: Parameters<typeof baixarXmlsSiegChunked>[1]) => {
        if (docs.length > 0) return; // já encontrou — pula
        await sleep(tentativas.length === 0 ? 0 : 800);
        try {
          const r = await baixarXmlsSiegChunked(siegCreds, params);
          tentativas.push(`${label}: ${r.length} XML${r.length !== 1 ? "s" : ""}`);
          console.log(`[nfse] ${label} cnpj=${cnpj}: ${r.length} XMLs`);
          if (r.length > 0) docs = r;
        } catch (e) {
          tentativas.push(`${label}: ERRO (${String(e).slice(0, 60)})`);
          console.warn(`[nfse] ${label} falhou: ${e}`);
        }
      };

      await tentar("CnpjTom+DataUpload",   { TipoXml: 3, DataUploadInicio: iniStr, DataUploadFim: fimStr, CnpjTom: cnpj });
      await tentar("CnpjDest+DataUpload",  { TipoXml: 3, DataUploadInicio: iniStr, DataUploadFim: fimStr, CnpjDest: cnpj });
      await tentar("CnpjTom+DataEmissao",  { TipoXml: 3, DataEmissaoInicio: iniStr, DataEmissaoFim: fimStr, CnpjTom: cnpj });
      await tentar("CnpjDest+DataEmissao", { TipoXml: 3, DataEmissaoInicio: iniStr, DataEmissaoFim: fimStr, CnpjDest: cnpj });

      // Nível 5 — Fallback geral sem filtro CNPJ + filtro client-side no XML
      if (docs.length === 0) {
        const diffDias = (new Date(fimStr).getTime() - new Date(iniStr).getTime()) / 86_400_000;
        const limiteFallback = force ? 30 : 15;
        if (diffDias > limiteFallback) {
          tentativas.push(`Fallback: período ${Math.ceil(diffDias)}d > limite ${limiteFallback}d — não executado`);
        } else {
          await sleep(800);
          let allXmls: string[] = [];
          try {
            allXmls = await baixarXmlsSiegChunked(siegCreds, { TipoXml: 3, DataUploadInicio: iniStr, DataUploadFim: fimStr });
            if (allXmls.length === 0) {
              await sleep(800);
              allXmls = await baixarXmlsSiegChunked(siegCreds, { TipoXml: 3, DataEmissaoInicio: iniStr, DataEmissaoFim: fimStr });
            }
          } catch (e) {
            tentativas.push(`Fallback: ERRO (${String(e).slice(0, 60)})`);
          }
          // filtra client-side pelo CNPJ do tomador no XML
          for (const xml of allXmls) {
            const tBlk = blk(xml, "TomadorServico", "Tomador", "DadosTomador");
            const tId  = blk(tBlk || xml, "IdentificacaoTomador", "CpfCnpjTomador");
            const cTom = tv(tId || tBlk || xml, "Cnpj", "Cpf", "CpfCnpj", "cnpj", "cpf").replace(/\D/g, "");
            if (cTom === cnpj) docs.push(xml);
          }
          tentativas.push(`Fallback(${allXmls.length} total → ${docs.length} com CNPJ ${cnpj})`);
          console.log(`[nfse] Fallback: ${allXmls.length} total → ${docs.length} para CNPJ ${cnpj}`);
        }
      }

      // Diagnóstico sempre gerado (independente do resultado)
      const resumo = docs.length > 0
        ? `✓ ${docs.length} XMLs — CNPJ ${cnpj} | período ${iniStr.slice(0,10)}→${fimStr.slice(0,10)}`
        : `✗ 0 XMLs — CNPJ buscado: ${cnpj} | período ${iniStr.slice(0,10)}→${fimStr.slice(0,10)}`;
      diagnostico.push(`${resumo} | tentativas: ${tentativas.join(" | ")}`);
      console.log(`[nfse] diagnóstico CNPJ ${cnpj}: ${tentativas.join(" ; ")}`);

      for (const xml of docs) xmlsList.push({ xml, cnpj });
    }

    console.log(`[nfse] total XMLs: ${xmlsList.length}`);

    // ── Processar XMLs ────────────────────────────────────────────────────────

    for (const { xml, cnpj } of xmlsList) {
      const nfse = parseNfse(xml);
      if (!nfse) {
        const trecho = xml.slice(0, 150).replace(/\s+/g, " ");
        erros.push(`Parse falhou: ${trecho}`);
        console.warn(`[nfse] parse null: ${trecho}`);
        continue;
      }

      // Verificar duplicata
      const { data: existing } = await db
        .from("nf_servicos").select("id")
        .eq("fazenda_id", fazenda_id)
        .eq("numero_nf", nfse.numero)
        .eq("prestador_cnpj", nfse.prestador_cnpj || "")
        .eq("data_prestacao", nfse.data_emissao)
        .maybeSingle();

      if (existing) {
        if (!force) { duplicadas++; continue; }
        await db.from("nf_servicos").update({
          chave_nfse:          nfse.chave.includes("-") ? null : nfse.chave,
          prestador_nome:      nfse.prestador_nome || "Prestador SIEG",
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
        }).eq("id", (existing as { id: string }).id);
        importadas++;
        continue;
      }

      const { error: insErr } = await db.from("nf_servicos").insert({
        fazenda_id,
        numero_nf:           nfse.numero,
        serie:               "NFS",
        chave_nfse:          nfse.chave.includes("-") ? null : nfse.chave,
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
        observacao:          `Importado via Sieg DFe em ${new Date().toLocaleDateString("pt-BR")} — Tomador: ${cnpj}`,
      });

      if (insErr) {
        erros.push(`NFSe ${nfse.numero}: ${insErr.message}`);
        continue;
      }
      importadas++;
    }

    if (importadas > 0 || xmlsList.length > 0) {
      await db.from("configuracoes_modulo").upsert({
        fazenda_id, modulo: "sieg",
        config: { ...cfg, ultima_sync_nfse_ts: new Date().toISOString() },
      });
    }

    console.log(`[nfse] importadas=${importadas} duplicadas=${duplicadas} erros=${erros.length}`);

    return NextResponse.json({
      sucesso: true, importadas, duplicadas,
      total_xmls: xmlsList.length,
      erros: erros.slice(0, 10),
      diagnostico,
    });

  } catch (err) {
    console.error("[sieg-sync-nfse]", err);
    return NextResponse.json({ erro: String(err) }, { status: 500 });
  }
}
