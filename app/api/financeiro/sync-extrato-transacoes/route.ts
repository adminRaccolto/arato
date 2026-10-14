/**
 * POST /api/financeiro/sync-extrato-transacoes
 *
 * Mantém extrato_transacoes (a fonte que a tela de Conciliação lê) em dia com o extrato.
 * Roda no servidor com service_role: gravar direto do navegador dependia da RLS e do JWT do
 * usuário — para usuários sem conta_id no perfil (BPO/seletor) ou com JWT vencido o upsert era
 * recusado e a conciliação inteira era revertida na tela ("Não foi possível salvar a conciliação").
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getRequestUser, validateFazendaAccess } from "../../../../lib/api-auth";
import { ajustarVinculosParaFk, linhaMudou } from "../../../../lib/financeiro/conciliacao";

const admin = () =>
  createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } });

type Linha = {
  id: string; data: string; descricao: string; valor: number; tipo: "credito" | "debito";
  conciliado: boolean; lancamento_id?: string; lancamento_ids?: string[]; lancamento_desc?: string; lancamento_valor?: number;
  origem_vinculo?: string | null; confianca?: string | null; regra_id?: string | null;
  sugestao_lancamento_id?: string | null; sugestao_motivo?: string | null;
};
type Existente = {
  fitid: string; valor: number; conciliado: boolean; lancamento_id: string | null; lancamento_ids: string[] | null;
  lancamento_desc: string | null; lancamento_valor: number | null; primeiro_extrato_id: string | null;
  ultimo_extrato_id?: string | null; origem_vinculo?: string | null; confianca?: string | null; regra_id?: string | null;
};

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as {
      fazenda_id: string; conta_id: string | null; conta_nome?: string | null;
      linhas: Linha[]; extrato_id: string; modo: "import" | "acao"; colunas_novas?: boolean;
    };
    const { fazenda_id, conta_id, linhas, modo } = body;
    const COLUNAS_NOVAS = !!body.colunas_novas;
    if (!fazenda_id || !Array.isArray(linhas)) return NextResponse.json({ ok: false, error: "dados inválidos" }, { status: 400 });
    if (!linhas.length) return NextResponse.json({ ok: true });
    if (!conta_id) return NextResponse.json({ ok: false, error: "extrato sem conta bancária vinculada" }, { status: 400 });

    const user = await getRequestUser(req.headers.get("authorization"));
    if (!user) return NextResponse.json({ ok: false, error: "Não autenticado" }, { status: 401 });
    const sb = admin();

    // A conta bancária tem que pertencer à mesma conta de cliente da fazenda informada
    const acessoFaz = await validateFazendaAccess(fazenda_id, req.headers.get("authorization") ?? undefined);
    if (!acessoFaz.ok) return NextResponse.json({ ok: false, error: acessoFaz.error }, { status: acessoFaz.status });
    const { data: cb } = await sb.from("contas_bancarias").select("fazenda_id").eq("id", conta_id).maybeSingle();
    if (!cb) return NextResponse.json({ ok: false, error: "conta bancária não encontrada" }, { status: 404 });
    if (cb.fazenda_id !== fazenda_id) {
      const acessoConta = await validateFazendaAccess(cb.fazenda_id as string, req.headers.get("authorization") ?? undefined);
      if (!acessoConta.ok) return NextResponse.json({ ok: false, error: acessoConta.error }, { status: acessoConta.status });
    }

    // primeiro_/ultimo_extrato_id têm FK para extratos_bancarios: só um id que existe lá pode ser gravado
    const extratoId = body.extrato_id;
    const idExtratoValido = extratoId && !extratoId.startsWith("virtual-") ? extratoId : null;
    const vistos = new Set<string>();
    const unicas = linhas.filter(l => (vistos.has(l.id) ? false : (vistos.add(l.id), true)));

    const LOTE = 150;
    const mapaExistente = new Map<string, Existente>();
    for (let i = 0; i < unicas.length; i += LOTE) {
      const { data, error } = await sb.from("extrato_transacoes")
        .select("fitid, valor, conciliado, lancamento_id, lancamento_ids, lancamento_desc, lancamento_valor, primeiro_extrato_id, ultimo_extrato_id" + (COLUNAS_NOVAS ? ", origem_vinculo, confianca, regra_id" : ""))
        .eq("conta_bancaria_id", conta_id).in("fitid", unicas.slice(i, i + LOTE).map(l => l.id));
      if (error) return NextResponse.json({ ok: false, error: `leitura: ${error.message}` }, { status: 500 });
      for (const e of ((data ?? []) as unknown as Existente[])) mapaExistente.set(e.fitid, e);
    }

    const rows = unicas.map(l => {
      const ex = mapaExistente.get(l.id);
      // Só confia que é a mesma transação se o valor bater (FITID instável em alguns bancos)
      const mesmaTransacao = !ex || Math.abs(ex.valor - l.valor) < 0.01;
      // Import nunca regride: se já estava conciliado, preserva o vínculo existente
      const preservar = modo === "import" && mesmaTransacao && ex?.conciliado && !l.conciliado;
      return {
        fazenda_id,
        conta_bancaria_id: conta_id,
        conta_nome: body.conta_nome ?? null,
        fitid: l.id, data: l.data, descricao: l.descricao, valor: l.valor, tipo: l.tipo,
        conciliado: preservar ? true : l.conciliado,
        lancamento_id: preservar ? (ex?.lancamento_id ?? null) : (l.lancamento_id ?? null),
        lancamento_ids: preservar ? (ex?.lancamento_ids ?? null) : (l.lancamento_ids ?? null),
        lancamento_desc: preservar ? (ex?.lancamento_desc ?? null) : (l.lancamento_desc ?? null),
        lancamento_valor: preservar ? (ex?.lancamento_valor ?? null) : (l.lancamento_valor ?? null),
        primeiro_extrato_id: ex?.primeiro_extrato_id ?? idExtratoValido,
        ultimo_extrato_id: idExtratoValido ?? ex?.ultimo_extrato_id ?? null,
        updated_at: new Date().toISOString(),
        ...(COLUNAS_NOVAS ? {
          origem_vinculo: preservar ? (ex?.origem_vinculo ?? null) : (l.conciliado ? (l.origem_vinculo ?? "manual") : null),
          confianca: preservar ? (ex?.confianca ?? null) : (l.conciliado ? (l.confianca ?? null) : null),
          regra_id: preservar ? (ex?.regra_id ?? null) : (l.conciliado ? (l.regra_id ?? null) : null),
          sugestao_lancamento_id: l.conciliado || preservar ? null : (l.sugestao_lancamento_id ?? null),
          sugestao_motivo: l.conciliado || preservar ? null : (l.sugestao_motivo ?? null),
        } : {}),
      };
    });

    // lancamento_id tem FK para lancamentos: título de EMPRESA (empresa_lancamentos) não existe lá e a gravação
    // inteira era recusada ("violates foreign key constraint extrato_transacoes_lancamento_id_fkey"). Para esses,
    // o vínculo fica só em lancamento_ids (sem FK), que é o que a tela e os gatilhos já leem primeiro.
    const candidatos = Array.from(new Set(rows.map(r => r.lancamento_id).filter((x): x is string => !!x)));
    const existentesLanc = new Set<string>();
    for (let i = 0; i < candidatos.length; i += 150) {
      const { data } = await sb.from("lancamentos").select("id").in("id", candidatos.slice(i, i + 150));
      for (const l of data ?? []) existentesLanc.add(l.id as string);
    }
    ajustarVinculosParaFk(rows, existentesLanc);

    // Ação (aceitar/vincular): grava só as linhas que MUDARAM. Antes regravava o extrato inteiro (centenas de
    // linhas) a cada clique e o gatilho de sincronização (Seção 339) rodava em cada uma — "Aceitar todas" estourava.
    const aGravar = modo === "acao" ? rows.filter(r => linhaMudou(mapaExistente.get(r.fitid), r, COLUNAS_NOVAS)) : rows;
    for (let i = 0; i < aGravar.length; i += LOTE) {
      const { error } = await sb.from("extrato_transacoes").upsert(aGravar.slice(i, i + LOTE), { onConflict: "conta_bancaria_id,fitid" });
      if (error) return NextResponse.json({ ok: false, error: `gravação: ${error.message}` }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
