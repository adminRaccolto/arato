/**
 * POST /api/fiscal/nfs-canceladas
 * Relatório (só leitura) de notas canceladas pelo emitente que estão no Arato fora do status Cancelada:
 *  - NF-e: eventos de cancelamento (110111) registrados no SIEG no período, cruzados pela chave de acesso com as NFs
 *    de entrada de todas as fazendas do cliente;
 *  - NFS-e: notas já processadas que a sincronização marcou como canceladas pelo prestador (a pendente ela já cancela).
 * A consulta não altera nenhuma nota. Com `marcar_ids`, marca como Cancelada as NF-e pendentes escolhidas na tela
 * (só pendente/digitando, só do cliente — processada nunca muda aqui: tem CP e estoque, o caminho é estornar).
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "../../../../lib/supabase-servidor";
import { baixarEventosCancelamentoSieg, parseEventoCancelamentoXml, credenciaisEnv, credenciaisValidas } from "../../../../lib/sieg";
import { exigirAcessoFazenda } from "../../../../lib/api-auth";
import { casarSubstitutas, momentoDoCancelamento, PRAZO_SUBSTITUTA_DIAS, type NfRef } from "../../../../lib/fiscal/nf-substituta";

export const runtime = "nodejs";
export const maxDuration = 300;

type NfCancelada = {
  id: string;
  tipo: "NF-e" | "NFS-e";
  fazenda_id: string;
  numero: string;
  serie: string;
  chave: string;
  emitente: string;
  emitente_cnpj: string;
  emissao: string;
  cancelada_em: string;          // data/hora do evento de cancelamento (NF-e); NFS-e não traz
  valor: number;
  status: string;
  tem_financeiro: boolean;
  processada_em: string | null;  // auditoria (desde 22/10/2026) ou criação do título no CP, gerado no processamento
  momento: "antes" | "depois" | null;   // emitente cancelou antes ou depois da entrada no Arato
  substituta: { numero: string; emissao: string; valor: number; status: string } | null;
  lancamento_id: string | null;
  emp_lancamento_id: string | null;
};

const dig = (s: unknown) => String(s ?? "").replace(/\D/g, "");
// CPF/CNPJ gravado com ou sem máscara: busca pelas duas grafias
const grafias = (d: string) => [d, d.length === 14 ? `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`
  : d.length === 11 ? `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}` : d];
const diasAntes = (iso: string, n: number) => new Date(new Date(`${iso}T00:00:00Z`).getTime() - n * 86_400_000).toISOString().slice(0, 10);

export async function POST(req: NextRequest) {
  try {
    const { fazenda_id, data_inicio, data_fim, marcar_ids } = await req.json() as { fazenda_id: string; data_inicio: string; data_fim: string; marcar_ids?: string[] };
    const negado = await exigirAcessoFazenda(req, fazenda_id);
    if (negado) return negado;

    const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
    const { data: faz } = await db.from("fazendas").select("conta_id").eq("id", fazenda_id).maybeSingle();
    const { data: fazRows } = faz?.conta_id ? await db.from("fazendas").select("id").eq("conta_id", faz.conta_id) : { data: null };
    const fazendaIds = fazRows?.length ? fazRows.map(f => f.id as string) : [fazenda_id];

    if (Array.isArray(marcar_ids)) {
      const obs = `Cancelada pelo emitente na SEFAZ (marcada pelo relatório de NFs canceladas em ${new Date().toLocaleDateString("pt-BR")})`;
      let marcadas = 0;
      for (let i = 0; i < marcar_ids.length; i += 200) {
        const { data, error } = await db.from("nf_entradas").update({ status: "cancelada" })
          .in("id", marcar_ids.slice(i, i + 200)).in("fazenda_id", fazendaIds).in("status", ["pendente", "digitando"]).select("id, observacao");
        if (error) throw error;
        for (const n of data ?? []) {
          await db.from("nf_entradas").update({ observacao: [n.observacao, obs].filter(Boolean).join(" | ") }).eq("id", n.id);
          marcadas++;
        }
      }
      return NextResponse.json({ marcadas });
    }
    if (!data_inicio || !data_fim) return NextResponse.json({ erro: "Informe o período." }, { status: 400 });

    // CPFs/CNPJs monitorados no SIEG em qualquer fazenda do cliente
    const { data: cfgs } = await db.from("configuracoes_modulo").select("config").in("fazenda_id", fazendaIds).eq("modulo", "sieg");
    const cnpjs = [...new Set((cfgs ?? []).flatMap(r => {
      const c = (r.config ?? {}) as { cnpjs_destino?: string[]; cnpj_destino?: string };
      return Array.isArray(c.cnpjs_destino) ? c.cnpjs_destino : c.cnpj_destino ? [c.cnpj_destino] : [];
    }).map(dig).filter(Boolean))];

    const avisos: string[] = [];
    const canceladaEm = new Map<string, string>();
    const creds = credenciaisEnv();
    if (!credenciaisValidas(creds)) avisos.push("Credenciais do SIEG ausentes — NF-e não consultadas.");
    else if (!cnpjs.length) avisos.push("Nenhum CPF/CNPJ configurado no SIEG — NF-e não consultadas.");
    else {
      for (const cnpj of cnpjs) {
        try {
          const eventos = await baixarEventosCancelamentoSieg(creds, {
            TipoXml: 1, CnpjDest: cnpj,
            DataUploadInicio: `${data_inicio}T00:00:00.000Z`, DataUploadFim: `${data_fim}T23:59:59.999Z`,
          });
          for (const xml of eventos) {
            const chave = parseEventoCancelamentoXml(xml);
            if (chave) canceladaEm.set(chave, xml.match(/<dhEvento>([^<]+)<\/dhEvento>/)?.[1] ?? "");
          }
        } catch (e) {
          avisos.push(`Cancelamentos de ${cnpj} não consultados: ${String(e).replace(/^Error: /, "").slice(0, 200)}`);
        }
      }
    }

    const linhas: NfCancelada[] = [];
    const chaves = [...canceladaEm.keys()];
    let jaCanceladas = 0;
    const chavesNoArato = new Set<string>();
    for (let i = 0; i < chaves.length; i += 200) {
      const { data, error } = await db.from("nf_entradas")
        .select("id, fazenda_id, numero, serie, chave_acesso, emitente_nome, emitente_cnpj, data_emissao, valor_total, status, lancamento_id, emp_lancamento_id")
        .in("fazenda_id", fazendaIds).in("chave_acesso", chaves.slice(i, i + 200));
      if (error) throw error;
      for (const n of data ?? []) {
        chavesNoArato.add(n.chave_acesso);
        if (n.status === "cancelada") jaCanceladas++;
        linhas.push({
          id: n.id, tipo: "NF-e", fazenda_id: n.fazenda_id, numero: n.numero ?? "", serie: n.serie ?? "", chave: n.chave_acesso,
          emitente: n.emitente_nome ?? "", emitente_cnpj: n.emitente_cnpj ?? "", emissao: n.data_emissao ?? "",
          cancelada_em: canceladaEm.get(n.chave_acesso) ?? "", valor: Number(n.valor_total ?? 0), status: n.status,
          tem_financeiro: !!(n.lancamento_id || n.emp_lancamento_id),
          processada_em: null, momento: null, substituta: null, lancamento_id: n.lancamento_id ?? null, emp_lancamento_id: n.emp_lancamento_id ?? null,
        });
      }
    }

    // NFS-e que o prestador cancelou (a sincronização marca a pendente como cancelada e deixa aviso na processada).
    // Sem data do evento: entram as de prestação no período (com 90 dias de folga para trás).
    const { data: servicos, error: sErr } = await db.from("nf_servicos")
      .select("id, fazenda_id, numero_nf, serie, chave_nfse, prestador_nome, prestador_cnpj, data_prestacao, valor_servico, status, lancamento_id")
      .in("fazenda_id", fazendaIds).ilike("observacao", "%cancelada pelo prestador%")
      .gte("data_prestacao", diasAntes(data_inicio, PRAZO_SUBSTITUTA_DIAS)).lte("data_prestacao", data_fim)
      .order("id").limit(1000);
    if (sErr) throw sErr;
    for (const s of servicos ?? []) linhas.push({
      id: s.id, tipo: "NFS-e", fazenda_id: s.fazenda_id, numero: s.numero_nf ?? "", serie: s.serie ?? "", chave: s.chave_nfse ?? "",
      emitente: s.prestador_nome ?? "", emitente_cnpj: s.prestador_cnpj ?? "", emissao: s.data_prestacao ?? "",
      cancelada_em: "", valor: Number(s.valor_servico ?? 0), status: s.status, tem_financeiro: !!s.lancamento_id,
      processada_em: null, momento: null, substituta: null, lancamento_id: s.lancamento_id ?? null, emp_lancamento_id: null,
    });

    // Quando cada nota foi processada: auditoria (registra desde 22/10/2026); antes disso, a criação do título no CP,
    // que nasce no processamento
    const processadaEm = new Map<string, string>();
    const ids = linhas.map(l => l.id);
    for (let i = 0; i < ids.length; i += 200) {
      const { data } = await db.from("audit_log").select("registro_id, created_at")
        .in("tabela", ["nf_entradas", "nf_servicos"]).in("registro_id", ids.slice(i, i + 200))
        .eq("dados_depois->>status", "processada").contains("campos_alterados", ["status"]).order("created_at");
      for (const a of data ?? []) if (!processadaEm.has(a.registro_id as string)) processadaEm.set(a.registro_id as string, a.created_at as string);
    }
    for (const [tabela, campo] of [["lancamentos", "lancamento_id"], ["empresa_lancamentos", "emp_lancamento_id"]] as const) {
      const porTitulo = new Map(linhas.filter(l => !processadaEm.has(l.id) && l[campo]).map(l => [l[campo] as string, l.id]));
      const tIds = [...porTitulo.keys()];
      for (let i = 0; i < tIds.length; i += 200) {
        const { data } = await db.from(tabela).select("id, created_at").in("id", tIds.slice(i, i + 200));
        for (const t of data ?? []) processadaEm.set(porTitulo.get(t.id as string)!, t.created_at as string);
      }
    }

    // NF substituta: outra NF válida do mesmo emitente, emitida até 90 dias depois, com valor até 10% diferente
    const candidatas: { nfe: NfRef[]; nfse: NfRef[] } = { nfe: [], nfse: [] };
    const minEmissao = linhas.map(l => l.emissao).filter(Boolean).sort()[0];
    for (const tipo of ["NF-e", "NFS-e"] as const) {
      const docs = [...new Set(linhas.filter(l => l.tipo === tipo).map(l => dig(l.emitente_cnpj)).filter(Boolean))].flatMap(grafias);
      for (let i = 0; i < docs.length && minEmissao; i += 100) {
        const lote = docs.slice(i, i + 100);
        for (let de = 0; ; de += 1000) {
          const q = tipo === "NF-e"
            ? db.from("nf_entradas").select("id, numero, emitente_cnpj, data_emissao, valor_total, status, chave_acesso").in("emitente_cnpj", lote).gte("data_emissao", minEmissao)
            : db.from("nf_servicos").select("id, numero_nf, prestador_cnpj, data_prestacao, valor_servico, status, chave_nfse").in("prestador_cnpj", lote).gte("data_prestacao", minEmissao);
          const { data, error } = await q.in("fazenda_id", fazendaIds).order("id").range(de, de + 999);
          if (error) throw error;
          for (const r of (data ?? []) as Record<string, unknown>[]) (tipo === "NF-e" ? candidatas.nfe : candidatas.nfse).push(tipo === "NF-e"
            ? { id: String(r.id), cnpj: String(r.emitente_cnpj ?? ""), numero: String(r.numero ?? ""), emissao: String(r.data_emissao ?? ""), valor: Number(r.valor_total ?? 0), status: String(r.status), chave: (r.chave_acesso as string) ?? null }
            : { id: String(r.id), cnpj: String(r.prestador_cnpj ?? ""), numero: String(r.numero_nf ?? ""), emissao: String(r.data_prestacao ?? ""), valor: Number(r.valor_servico ?? 0), status: String(r.status), chave: (r.chave_nfse as string) ?? null });
          if (!data || data.length < 1000) break;
        }
      }
    }
    const subs = new Map<string, NfRef>();
    for (const tipo of ["NF-e", "NFS-e"] as const) {
      const canc = linhas.filter(l => l.tipo === tipo).map(l => ({ id: l.id, cnpj: l.emitente_cnpj, numero: l.numero, emissao: l.emissao, valor: l.valor, status: "cancelada", chave: l.chave || null }));
      for (const [id, sub] of casarSubstitutas(canc, tipo === "NF-e" ? candidatas.nfe : candidatas.nfse)) subs.set(id, sub);
    }
    for (const l of linhas) {
      l.processada_em = processadaEm.get(l.id) ?? null;
      l.momento = momentoDoCancelamento(l.cancelada_em, l.processada_em);
      const sub = subs.get(l.id);
      l.substituta = sub ? { numero: sub.numero, emissao: sub.emissao, valor: sub.valor, status: sub.status } : null;
    }

    return NextResponse.json({
      linhas,
      eventos_sieg: canceladaEm.size,
      ja_canceladas: jaCanceladas,
      fora_do_arato: chaves.filter(c => !chavesNoArato.has(c)).length,
      avisos,
    });
  } catch (e) {
    console.error("[nfs-canceladas]", e);
    return NextResponse.json({ erro: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
