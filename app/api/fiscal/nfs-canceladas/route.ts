/**
 * POST /api/fiscal/nfs-canceladas
 * Relatório (só leitura) de notas canceladas pelo emitente que estão no Arato fora do status Cancelada:
 *  - NF-e: eventos de cancelamento (110111) registrados no SIEG no período, cruzados pela chave de acesso com as NFs
 *    de entrada de todas as fazendas do cliente;
 *  - NFS-e: notas já processadas que a sincronização marcou como canceladas pelo prestador (a pendente ela já cancela).
 * Não altera nenhuma nota.
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "../../../../lib/supabase-servidor";
import { baixarEventosCancelamentoSieg, parseEventoCancelamentoXml, credenciaisEnv, credenciaisValidas } from "../../../../lib/sieg";
import { exigirAcessoFazenda } from "../../../../lib/api-auth";

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
  cancelada_em: string;
  valor: number;
  status: string;
  tem_financeiro: boolean;
};

const dig = (s: unknown) => String(s ?? "").replace(/\D/g, "");

export async function POST(req: NextRequest) {
  try {
    const { fazenda_id, data_inicio, data_fim } = await req.json() as { fazenda_id: string; data_inicio: string; data_fim: string };
    const negado = await exigirAcessoFazenda(req, fazenda_id);
    if (negado) return negado;
    if (!data_inicio || !data_fim) return NextResponse.json({ erro: "Informe o período." }, { status: 400 });

    const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
    const { data: faz } = await db.from("fazendas").select("conta_id").eq("id", fazenda_id).maybeSingle();
    const { data: fazRows } = faz?.conta_id ? await db.from("fazendas").select("id").eq("conta_id", faz.conta_id) : { data: null };
    const fazendaIds = fazRows?.length ? fazRows.map(f => f.id as string) : [fazenda_id];

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
            if (chave) canceladaEm.set(chave, (xml.match(/<dhEvento>([^<]+)<\/dhEvento>/)?.[1] ?? "").slice(0, 10));
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
        if (n.status === "cancelada") { jaCanceladas++; continue; }
        linhas.push({
          id: n.id, tipo: "NF-e", fazenda_id: n.fazenda_id, numero: n.numero ?? "", serie: n.serie ?? "", chave: n.chave_acesso,
          emitente: n.emitente_nome ?? "", emitente_cnpj: n.emitente_cnpj ?? "", emissao: n.data_emissao ?? "",
          cancelada_em: canceladaEm.get(n.chave_acesso) ?? "", valor: Number(n.valor_total ?? 0), status: n.status,
          tem_financeiro: !!(n.lancamento_id || n.emp_lancamento_id),
        });
      }
    }

    // NFS-e processadas que o prestador cancelou (a sincronização deixa o aviso na observação)
    const { data: servicos, error: sErr } = await db.from("nf_servicos")
      .select("id, fazenda_id, numero_nf, serie, chave_nfse, prestador_nome, prestador_cnpj, data_prestacao, valor_servico, status, lancamento_id")
      .in("fazenda_id", fazendaIds).eq("status", "processada").ilike("observacao", "%CANCELADA PELO PRESTADOR%")
      .order("id").limit(1000);
    if (sErr) throw sErr;
    for (const s of servicos ?? []) linhas.push({
      id: s.id, tipo: "NFS-e", fazenda_id: s.fazenda_id, numero: s.numero_nf ?? "", serie: s.serie ?? "", chave: s.chave_nfse ?? "",
      emitente: s.prestador_nome ?? "", emitente_cnpj: s.prestador_cnpj ?? "", emissao: s.data_prestacao ?? "",
      cancelada_em: "", valor: Number(s.valor_servico ?? 0), status: s.status, tem_financeiro: !!s.lancamento_id,
    });

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
