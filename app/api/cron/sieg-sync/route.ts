/**
 * GET /api/cron/sieg-sync
 * Cron diário (11h UTC = 8h BRT): sincroniza NF-e do Sieg para todas as fazendas
 * que têm cnpj_destino configurado em configuracoes_modulo modulo="sieg".
 *
 * A API Key Sieg é global (process.env.SIEG_API_KEY — gerenciada pela Raccolto).
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

async function syncFazenda(db: ReturnType<typeof sb>, fazenda_id: string, apiKey: string): Promise<{
  importados: number; duplicados: number; erros: number;
}> {
  const { data: row } = await db
    .from("configuracoes_modulo")
    .select("config")
    .eq("fazenda_id", fazenda_id)
    .eq("modulo", "sieg")
    .maybeSingle();

  const cfg = (row?.config ?? {}) as Record<string, string>;
  const cnpjDest = cfg.cnpj_destino?.replace(/\D/g, "");
  if (!cnpjDest) return { importados: 0, duplicados: 0, erros: 0 };

  const trintaDiasAtras = new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10);
  const dataInicio = cfg.ultima_sync_data ?? trintaDiasAtras;
  const dataFim    = new Date().toISOString();

  let xmlsNFe: string[];
  try {
    xmlsNFe = await baixarXmlsSieg(apiKey, {
      XmlType: 1, DataEmissaoInicio: dataInicio, DataEmissaoFim: dataFim, CnpjDest: cnpjDest,
    });
  } catch {
    return { importados: 0, duplicados: 0, erros: 1 };
  }

  let importados = 0, duplicados = 0, erros = 0;

  for (const xml of xmlsNFe) {
    const nfe = parseNFeXml(xml);
    if (!nfe?.numero || !nfe.data_emissao) { erros++; continue; }

    const { data: dup } = await db.from("nf_entradas").select("id")
      .eq("fazenda_id", fazenda_id).eq("chave_acesso", nfe.chave).maybeSingle();
    if (dup) { duplicados++; continue; }

    const { data: nfRow, error: nfErr } = await db.from("nf_entradas").insert({
      fazenda_id,
      numero: nfe.numero, serie: nfe.serie, chave_acesso: nfe.chave,
      data_emissao: nfe.data_emissao, emitente_nome: nfe.nome_emitente,
      emitente_cnpj: nfe.cnpj_emitente, valor_total: nfe.valor_total,
      natureza: nfe.natureza, cfop: nfe.cfop,
      status: "pendente", origem: "sieg",
      observacao: `Importado via Sieg (cron) em ${new Date().toLocaleDateString("pt-BR")}`,
    }).select("id").single();

    if (nfErr || !nfRow) { erros++; continue; }

    if (nfe.itens.length > 0) {
      await db.from("nf_entrada_itens").insert(
        nfe.itens.map(item => ({
          nf_entrada_id: nfRow.id, fazenda_id,
          descricao_produto: item.descricao, descricao_nf: item.descricao,
          ncm: item.ncm || null, cfop: item.cfop || nfe.cfop || null,
          unidade: item.unidade || "UN", unidade_nf: item.unidade || "UN",
          quantidade: item.quantidade, valor_unitario: item.valor_unitario,
          valor_total: item.valor_total, tipo_apropiacao: "estoque", alerta_preco: false,
        }))
      );
    }
    importados++;
  }

  // Atualizar última sync
  await db.from("configuracoes_modulo").upsert({
    fazenda_id, modulo: "sieg",
    config: {
      ...cfg,
      ultima_sync_data: new Date().toISOString().slice(0, 10),
      ultima_sync_ts:   new Date().toISOString(),
      total_importado:  String((parseInt(cfg.total_importado || "0") + importados)),
    },
  });

  return { importados, duplicados, erros };
}

export async function GET(req: NextRequest) {
  // Vercel injeta Authorization automaticamente nos crons; em dev, permite sem secret
  const auth = req.headers.get("authorization");
  if (process.env.CRON_SECRET && auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ erro: "Não autorizado" }, { status: 401 });
  }

  const apiKey = process.env.SIEG_API_KEY ?? "";
  if (!apiKey) {
    return NextResponse.json({ erro: "SIEG_API_KEY não configurada" }, { status: 500 });
  }

  const db = sb();

  // Buscar todas as fazendas com Sieg configurado
  const { data: rows } = await db
    .from("configuracoes_modulo")
    .select("fazenda_id, config")
    .eq("modulo", "sieg");

  const fazendas = (rows ?? []).filter(r => {
    const c = r.config as Record<string, string>;
    return !!(c.cnpj_destino?.replace(/\D/g, ""));
  });

  const resumo: Record<string, { importados: number; duplicados: number; erros: number }> = {};

  for (const { fazenda_id } of fazendas) {
    resumo[fazenda_id] = await syncFazenda(db, fazenda_id, apiKey);
  }

  const totais = Object.values(resumo).reduce(
    (acc, r) => ({ importados: acc.importados + r.importados, duplicados: acc.duplicados + r.duplicados, erros: acc.erros + r.erros }),
    { importados: 0, duplicados: 0, erros: 0 }
  );

  console.log(`[cron/sieg-sync] ${fazendas.length} fazendas — ${totais.importados} importadas, ${totais.duplicados} duplicadas, ${totais.erros} erros`);

  return NextResponse.json({ sucesso: true, fazendas: fazendas.length, ...totais, detalhe: resumo });
}
