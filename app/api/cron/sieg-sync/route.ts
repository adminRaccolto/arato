/**
 * GET /api/cron/sieg-sync
 * Cron 2× ao dia: 11h UTC (8h BRT) e 20h UTC (17h BRT)
 *
 * Para cada fazenda com automação SIEG ativa (configuracoes_automacao):
 * 1. Consulta API SIEG via lib/sieg.ts (paginada, NF-e + NF-Se)
 * 2. Baixa XMLs novos (não existentes em nf_importadas_sieg)
 * 3. Verifica/cria fornecedor em pessoas
 * 4. Cria Conta a Pagar em lancamentos
 * 5. Arquiva XML no Supabase Storage (bucket "arquivos")
 * 6. Tenta classificar itens via regras_classificacao_nf
 * 7. NFs/itens não classificados ficam status="pendente" → tela de Pendências
 */

import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse }     from "next/server";
import { baixarXmlsSieg, parseNFeXml }  from "../../../../lib/sieg";

export const runtime = "nodejs";

function sb() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

// ── Tipos locais ──────────────────────────────────────────────

type Regra = {
  id: string;
  cnpj_emitente?: string | null;
  ncm?: string | null;
  descricao_contem?: string | null;
  insumo_id?: string | null;
  categoria?: string | null;
  centro_custo_id?: string | null;
  qtd_aplicacoes?: number;
};

function matchRegra(regras: Regra[], cnpj: string, ncm: string, descricao: string): Regra | null {
  const limpo = (s: string) => s.replace(/\D/g, "");
  for (const r of regras) {
    const okCnpj  = !r.cnpj_emitente  || limpo(r.cnpj_emitente) === limpo(cnpj);
    const okNcm   = !r.ncm            || r.ncm === ncm;
    const okDesc  = !r.descricao_contem || descricao.toLowerCase().includes(r.descricao_contem.toLowerCase());
    if (okCnpj && okNcm && okDesc) return r;
  }
  return null;
}

// ── Sincronização de uma fazenda ──────────────────────────────

async function syncFazenda(
  db: SupabaseClient,
  fazendaId: string,
  apiKey: string,
  cnpjs: string[]
): Promise<{ importadas: number; classificadas: number; pendentes: number; erros: number }> {

  // Última data importada (ou 30 dias atrás)
  const { data: last } = await db
    .from("nf_importadas_sieg")
    .select("created_at")
    .eq("fazenda_id", fazendaId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const dtIni = last?.created_at
    ? new Date(new Date(last.created_at).getTime() - 2 * 86400000).toISOString()   // -2 dias de segurança
    : new Date(Date.now() - 30 * 86400000).toISOString();
  const dtFim = new Date().toISOString();

  // Carrega regras de classificação
  const { data: regrasRaw } = await db
    .from("regras_classificacao_nf")
    .select("id, cnpj_emitente, ncm, descricao_contem, insumo_id, categoria, centro_custo_id, qtd_aplicacoes")
    .eq("fazenda_id", fazendaId)
    .eq("ativo", true);
  const regras = (regrasRaw ?? []) as Regra[];

  let importadas = 0, classificadas = 0, pendentes = 0, erros = 0;

  for (const cnpj of cnpjs) {
    let xmls: string[] = [];
    try {
      xmls = await baixarXmlsSieg(apiKey, {
        XmlType: 1,
        DataUploadInicio: dtIni,
        DataUploadFim:    dtFim,
        CnpjDest:         cnpj,
      });
    } catch (e) {
      console.error(`[sieg] erro ao baixar XMLs para fazenda ${fazendaId} cnpj ${cnpj}:`, e);
      erros++;
      continue;
    }

    for (const xml of xmls) {
      const nfe = parseNFeXml(xml);
      if (!nfe?.chave) { erros++; continue; }

      // Verifica duplicata
      const { data: dup } = await db
        .from("nf_importadas_sieg")
        .select("id")
        .eq("fazenda_id", fazendaId)
        .eq("chave_acesso", nfe.chave)
        .maybeSingle();
      if (dup) continue;

      // Arquiva XML
      const xmlPath = `nfs-sieg/${fazendaId}/${nfe.chave}.xml`;
      await db.storage.from("arquivos").upload(xmlPath, xml, {
        contentType: "application/xml",
        upsert: true,
      });

      // Verifica/cria fornecedor
      let pessoaId: string | null = null;
      const cnpjEmit = nfe.cnpj_emitente.replace(/\D/g, "");
      if (cnpjEmit) {
        const { data: pes } = await db
          .from("pessoas")
          .select("id")
          .eq("fazenda_id", fazendaId)
          .eq("cpf_cnpj", cnpjEmit)
          .maybeSingle();
        if (pes) {
          pessoaId = pes.id;
        } else {
          const { data: nova } = await db.from("pessoas").insert({
            fazenda_id:     fazendaId,
            nome:           nfe.nome_emitente || cnpjEmit,
            cpf_cnpj:       cnpjEmit,
            tipo:           "fornecedor",
            importado_sieg: true,
          }).select("id").maybeSingle();
          pessoaId = nova?.id ?? null;
        }
      }

      // Cria Conta a Pagar
      let cpId: string | null = null;
      if ((nfe.valor_total ?? 0) > 0 && pessoaId) {
        const vencimento = new Date(Date.now() + 30 * 86400000).toISOString().substring(0, 10);
        const { data: cp } = await db.from("lancamentos").insert({
          fazenda_id:       fazendaId,
          tipo:             "pagar",
          descricao:        `NF ${nfe.numero}/${nfe.serie} — ${nfe.nome_emitente || cnpjEmit}`,
          valor:            nfe.valor_total,
          data_vencimento:  vencimento,
          data_competencia: nfe.data_emissao || null,
          pessoa_id:        pessoaId,
          status:           "pendente",
          origem:           "sieg",
          nf_chave:         nfe.chave,
          nf_numero:        nfe.numero,
          nf_serie:         nfe.serie,
        }).select("id").maybeSingle();
        cpId = cp?.id ?? null;
      }

      // Insere NF
      const { data: nfReg, error: nfErr } = await db.from("nf_importadas_sieg").insert({
        fazenda_id:       fazendaId,
        chave_acesso:     nfe.chave,
        numero:           nfe.numero     || null,
        serie:            nfe.serie      || null,
        data_emissao:     nfe.data_emissao || null,
        cnpj_emitente:    nfe.cnpj_emitente,
        nome_emitente:    nfe.nome_emitente || null,
        valor_total:      nfe.valor_total,
        xml_storage_path: xmlPath,
        status:           "pendente",
        pessoa_id:        pessoaId,
        cp_id:            cpId,
      }).select("id").maybeSingle();

      if (nfErr || !nfReg) { erros++; continue; }

      // Insere itens + tenta classificar
      let todosOk = nfe.itens.length > 0;

      for (const item of nfe.itens) {
        const regra = matchRegra(regras, nfe.cnpj_emitente, item.ncm, item.descricao);
        if (!regra) todosOk = false;

        await db.from("nf_importada_itens_sieg").insert({
          nf_id:                        nfReg.id,
          numero_item:                  item.num,
          codigo_produto:               item.codigo   || null,
          descricao:                    item.descricao,
          ncm:                          item.ncm      || null,
          cfop:                         item.cfop     || null,
          quantidade:                   item.quantidade,
          unidade:                      item.unidade  || null,
          valor_unitario:               item.valor_unitario,
          valor_total:                  item.valor_total,
          insumo_id:                    regra?.insumo_id       ?? null,
          categoria:                    regra?.categoria       ?? null,
          centro_custo_id:              regra?.centro_custo_id ?? null,
          classificado_automaticamente: !!regra,
          regra_id:                     regra?.id              ?? null,
          status_item:                  regra ? "classificado" : "pendente",
        });

        if (regra) {
          await db.from("regras_classificacao_nf").update({
            ultima_aplicacao: new Date().toISOString(),
            qtd_aplicacoes:   (regra.qtd_aplicacoes ?? 0) + 1,
          }).eq("id", regra.id);
        }
      }

      const statusFinal = todosOk ? "classificada" : "pendente";
      await db.from("nf_importadas_sieg").update({ status: statusFinal }).eq("id", nfReg.id);

      importadas++;
      if (statusFinal === "classificada") classificadas++;
      else pendentes++;
    }
  }

  return { importadas, classificadas, pendentes, erros };
}

// ── Handler HTTP ──────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ erro: "Não autorizado" }, { status: 401 });
    }
  }

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) {
    return NextResponse.json({ erro: "SUPABASE_SERVICE_ROLE_KEY não configurado" }, { status: 500 });
  }

  const db = sb();

  // Busca fazendas com SIEG ativo
  const { data: cfgList } = await db
    .from("configuracoes_automacao")
    .select("fazenda_id, config")
    .eq("automacao_id", "sieg-sync")
    .eq("ativa", true);

  if (!cfgList || cfgList.length === 0) {
    return NextResponse.json({ ok: true, msg: "Nenhuma fazenda com SIEG ativo", importadas: 0 });
  }

  // API key global (env) ou por fazenda (config)
  const globalKey = process.env.SIEG_API_KEY ?? "";

  const resumo: Record<string, { importadas: number; classificadas: number; pendentes: number; erros: number }> = {};

  for (const row of cfgList) {
    const fazendaId = row.fazenda_id as string;
    const cfg       = (row.config ?? {}) as Record<string, string>;
    const apiKey    = cfg.api_key || globalKey;
    const cnpjs     = (cfg.cnpjs ?? cfg.cnpj ?? "")
      .split(",").map((c: string) => c.replace(/\D/g, "")).filter(Boolean);

    if (!apiKey || cnpjs.length === 0) continue;

    resumo[fazendaId] = await syncFazenda(db, fazendaId, apiKey, cnpjs);
  }

  const tot = (k: keyof typeof resumo[string]) =>
    Object.values(resumo).reduce((s, r) => s + r[k], 0);

  console.log(`[sieg-sync] ${Object.keys(resumo).length} fazendas — importadas=${tot("importadas")} classificadas=${tot("classificadas")} pendentes=${tot("pendentes")} erros=${tot("erros")}`);

  return NextResponse.json({
    ok:           true,
    msg:          `${tot("importadas")} NF(s) importada(s): ${tot("classificadas")} classificadas, ${tot("pendentes")} pendentes, ${tot("erros")} erros`,
    fazendas:     Object.keys(resumo).length,
    importadas:   tot("importadas"),
    classificadas: tot("classificadas"),
    pendentes:    tot("pendentes"),
    erros:        tot("erros"),
    detalhe:      resumo,
  });
}
