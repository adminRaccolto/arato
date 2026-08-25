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
      let nivelEncontrado = "";

      // Nível 1 — CnpjTom + DataUpload
      try {
        docs = await baixarXmlsSiegChunked(siegCreds, {
          TipoXml: 3, DataUploadInicio: iniStr, DataUploadFim: fimStr, CnpjTom: cnpj,
        });
        console.log(`[nfse] CnpjTom+DataUpload=${cnpj}: ${docs.length} XMLs`);
        if (docs.length > 0) nivelEncontrado = "CnpjTom+DataUpload";
      } catch (e) {
        console.warn(`[nfse] Nível 1 falhou: ${e}`);
      }

      // Nível 2 — CnpjDest + DataUpload
      if (docs.length === 0) {
        await sleep(1000);
        try {
          docs = await baixarXmlsSiegChunked(siegCreds, {
            TipoXml: 3, DataUploadInicio: iniStr, DataUploadFim: fimStr, CnpjDest: cnpj,
          });
          console.log(`[nfse] CnpjDest+DataUpload=${cnpj}: ${docs.length} XMLs`);
          if (docs.length > 0) nivelEncontrado = "CnpjDest+DataUpload";
        } catch (e) {
          console.warn(`[nfse] Nível 2 falhou: ${e}`);
        }
      }

      // Nível 3 — CnpjTom + DataEmissao
      // Alguns municípios enviam ao SIEG com DataEmissao diferente de DataUpload
      if (docs.length === 0) {
        await sleep(1000);
        try {
          docs = await baixarXmlsSiegChunked(siegCreds, {
            TipoXml: 3, DataEmissaoInicio: iniStr, DataEmissaoFim: fimStr, CnpjTom: cnpj,
          });
          console.log(`[nfse] CnpjTom+DataEmissao=${cnpj}: ${docs.length} XMLs`);
          if (docs.length > 0) nivelEncontrado = "CnpjTom+DataEmissao";
        } catch (e) {
          console.warn(`[nfse] Nível 3 falhou: ${e}`);
        }
      }

      // Nível 4 — CnpjDest + DataEmissao
      if (docs.length === 0) {
        await sleep(1000);
        try {
          docs = await baixarXmlsSiegChunked(siegCreds, {
            TipoXml: 3, DataEmissaoInicio: iniStr, DataEmissaoFim: fimStr, CnpjDest: cnpj,
          });
          console.log(`[nfse] CnpjDest+DataEmissao=${cnpj}: ${docs.length} XMLs`);
          if (docs.length > 0) nivelEncontrado = "CnpjDest+DataEmissao";
        } catch (e) {
          console.warn(`[nfse] Nível 4 falhou: ${e}`);
        }
      }

      // Nível 5 — Fallback geral: sem filtro CNPJ + filtro client-side
      // force_reimport aumenta o limite para 30 dias (ao custo de mais tempo)
      if (docs.length === 0) {
        const diffDias = (new Date(fimStr).getTime() - new Date(iniStr).getTime()) / 86_400_000;
        const limiteFallback = force ? 30 : 15;
        if (diffDias > limiteFallback) {
          const msg = `CNPJ ${cnpj}: nenhuma NFS-e encontrada em nenhum dos 4 filtros SIEG. Período (${Math.ceil(diffDias)} dias) excede limite do fallback geral (${limiteFallback} dias). Tente um período menor ou verifique o CNPJ configurado em Integrações.`;
          console.warn(`[nfse] ${msg}`);
          erros.push(msg);
          diagnostico.push(`CNPJ ${cnpj}: todos os níveis retornaram 0 XMLs. CNPJ buscado: ${cnpj}. Período: ${iniStr.slice(0,10)} → ${fimStr.slice(0,10)}`);
        } else {
          await sleep(1000);
          console.log(`[nfse] Fallback geral para CNPJ ${cnpj} (${Math.ceil(diffDias)} dias, limite=${limiteFallback}d)…`);
          try {
            // Tenta DataUpload primeiro, depois DataEmissao no fallback
            let all = await baixarXmlsSiegChunked(siegCreds, {
              TipoXml: 3, DataUploadInicio: iniStr, DataUploadFim: fimStr,
            });
            if (all.length === 0) {
              await sleep(1000);
              all = await baixarXmlsSiegChunked(siegCreds, {
                TipoXml: 3, DataEmissaoInicio: iniStr, DataEmissaoFim: fimStr,
              });
            }
            console.log(`[nfse] Fallback: ${all.length} XMLs total`);
            for (const xml of all) {
              const tBlk = blk(xml, "TomadorServico", "Tomador", "DadosTomador");
              const tId  = blk(tBlk || xml, "IdentificacaoTomador", "CpfCnpjTomador");
              const cTom = tv(tId || tBlk || xml, "Cnpj", "Cpf", "CpfCnpj", "cnpj", "cpf").replace(/\D/g, "");
              if (cTom === cnpj) docs.push(xml);
            }
            console.log(`[nfse] Fallback filtrado: ${docs.length} XMLs para CNPJ ${cnpj}`);
            if (docs.length > 0) nivelEncontrado = "Fallback+FiltroClienteSide";
            else diagnostico.push(`CNPJ ${cnpj}: fallback geral encontrou ${all.length} XMLs mas nenhum com tomador=${cnpj}. Verifique se o CNPJ está correto.`);
          } catch (e2) {
            console.warn(`[nfse] Fallback falhou: ${e2}`);
          }
        }
      }

      if (docs.length > 0) diagnostico.push(`CNPJ ${cnpj}: ${docs.length} XMLs via ${nivelEncontrado}`);
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
