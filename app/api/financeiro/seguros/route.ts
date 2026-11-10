/**
 * POST /api/financeiro/seguros
 * Salva (INSERT ou UPDATE) uma apólice de seguro, lançamentos de prêmio e parcelas.
 * Usa service_role_key — imune a JWT expirado e RLS.
 */
import { falharSeErro } from "../../../../lib/db-util";
import { hojeLocal } from "../../../../lib/data-local";
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "../../../../lib/supabase-servidor";
import { exigirAcessoRegistro, exigirAcessoFazenda } from "../../../../lib/api-auth";

const admin = () =>
  createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

function gerarParcelasPremio(
  inicio: string,
  premioAnual: number,
  forma: string,
): Array<{ data_vencimento: string; valor: number }> {
  const base = new Date(inicio + "T12:00:00");
  const add = (d: Date, m: number) => {
    const n = new Date(d);
    n.setMonth(n.getMonth() + m);
    return n.toISOString().slice(0, 10);
  };
  switch (forma) {
    case "unica":      return [{ data_vencimento: inicio, valor: premioAnual }];
    case "semestral":  return [0, 6].map(m => ({ data_vencimento: add(base, m), valor: premioAnual / 2 }));
    case "trimestral": return [0, 3, 6, 9].map(m => ({ data_vencimento: add(base, m), valor: premioAnual / 4 }));
    case "mensal":     return Array.from({ length: 12 }, (_, m) => ({ data_vencimento: add(base, m), valor: premioAnual / 12 }));
    default:           return [{ data_vencimento: inicio, valor: premioAnual }];
  }
}

const RAMO_OG: Record<string, string> = {
  rural:                  "2.03.03.004",
  vida:                   "2.01.01.10.020",
  patrimonial:            "2.03.03.002",
  automovel:              "2.03.03.003",
  responsabilidade_civil: "2.03.03.001",
  maquinas:               "2.03.03.001",
  outro:                  "2.03.03.001",
};

const RAMO_LABEL: Record<string, string> = {
  rural: "Rural / Agrícola", vida: "Vida", patrimonial: "Patrimonial",
  automovel: "Automóvel", responsabilidade_civil: "Resp. Civil",
  maquinas: "Máquinas/Equip.", outro: "Outro",
};

type SbAdmin = ReturnType<typeof admin>;

async function ogDoRamo(sb: SbAdmin, fazendaId: string, ramo: string): Promise<string | null> {
  const og = RAMO_OG[ramo] ?? "2.03.03.001";
  // OG é do cliente (conta): a cópia dele, senão o modelo global — antes buscava pela fazenda e, com as OGs
  // unificadas por cliente (30/10/2026), o prêmio ficava sem operação gerencial
  const { data: fzOg } = await sb.from("fazendas").select("conta_id").eq("id", fazendaId).maybeSingle();
  const { data: ogRows } = await sb.from("operacoes_gerenciais").select("id, conta_id, fazenda_id").eq("classificacao", og)
    .or(fzOg?.conta_id ? `conta_id.eq.${fzOg.conta_id},fazenda_id.eq.${fazendaId},and(conta_id.is.null,fazenda_id.is.null)` : `fazenda_id.eq.${fazendaId},and(conta_id.is.null,fazenda_id.is.null)`);
  const ogEscolhida = (ogRows ?? []).sort((x, y) => (y.conta_id ? 2 : y.fazenda_id ? 1 : 0) - (x.conta_id ? 2 : x.fazenda_id ? 1 : 0) || x.id.localeCompare(y.id))[0];
  return ogEscolhida?.id ?? null;
}

// Gera (ou regenera) as parcelas de prêmio + lançamentos de CP de uma apólice.
// Usado tanto na criação quanto na edição — extraído pra função única pra não
// ter duas cópias da mesma lógica podendo divergir.
async function gerarParcelasEDespesas(
  sb: SbAdmin,
  apoliceId: string,
  payload: Record<string, unknown>,
  parcelasExplicitas: Array<{ data_vencimento: string; valor: number }> | undefined,
  ramoLabelIn: string | undefined,
  today: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const fazendaId = String(payload.fazenda_id ?? "");
  const ramo = String(payload.ramo ?? "outro");
  const seguradora = String(payload.seguradora ?? "");
  const premioAnual = Number(payload.premio_anual ?? 0);
  const forma = String(payload.forma_pagamento_premio ?? "unica");
  const inicio = String(payload.data_inicio_vigencia ?? today);
  const numeroApolice = String(payload.numero_apolice ?? "");
  const ramoLabel = ramoLabelIn ?? RAMO_LABEL[ramo] ?? ramo;

  const ogId = await ogDoRamo(sb, fazendaId, ramo);

  const parcelas = parcelasExplicitas && parcelasExplicitas.length > 0
    ? parcelasExplicitas
    : gerarParcelasPremio(inicio, premioAnual, forma);

  const lancRows = parcelas.map((parc, i) => ({
    fazenda_id: fazendaId,
    tipo: "pagar",
    descricao: `Prêmio Seguro ${seguradora} — ${ramoLabel} — Parcela ${i + 1}/${parcelas.length}`,
    categoria: `Prêmio de Seguro (${ramoLabel})`,
    operacao_gerencial_id: ogId,
    pessoa_id: (payload.seguradora_pessoa_id as string | null | undefined) ?? null, // fornecedor no grid do CP
    produtor_id: (payload.produtor_id as string | null | undefined) ?? null,
    data_lancamento: parc.data_vencimento,
    data_vencimento: parc.data_vencimento,
    valor: parc.valor,
    // Parcela vencida entra em aberto (aparece vencida no CP): quem baixa é o usuário, com a conta e a data reais
    status: "em_aberto",
    auto: true,
    origem_lancamento: "seguro",
    numero_documento: numeroApolice,
  }));

  const { data: lancs, error: lancError } = await sb.from("lancamentos").insert(lancRows).select("id, data_vencimento");
  if (lancError) {
    console.error("[API seguros] lancamentos insert error:", lancError);
    return { ok: false, error: `Erro ao criar lançamentos CP: ${lancError.message}` };
  }

  if (lancs && lancs.length > 0) {
    const premioRows = parcelas.map((parc, i) => ({
      apolice_id: apoliceId,
      fazenda_id: fazendaId,
      data_vencimento: parc.data_vencimento,
      valor: parc.valor,
      pago: false,
      lancamento_id: lancs[i]?.id ?? null,
    }));
    const { error: premioError } = await sb.from("pagamentos_premio_seguro").insert(premioRows);
    if (premioError) console.error("[API seguros] pagamentos_premio_seguro insert error:", premioError);
  }
  return { ok: true };
}

// Lista apólices, prêmios e sinistros do cliente. Passa pelo servidor com a mesma checagem de acesso do salvamento:
// lida direto do navegador, a regra da tabela recusava quem não tem a conta no perfil (equipe Raccolto/BPO) ou está com
// a sessão vencida, e a tela mostrava "Nenhuma apólice cadastrada" com as apólices salvas no banco.
export async function GET(req: NextRequest) {
  try {
    const fazendaId = req.nextUrl.searchParams.get("fazenda_id");
    const negado = await exigirAcessoFazenda(req, fazendaId);
    if (negado) return negado;
    const sb = admin();
    const { data: fz } = await sb.from("fazendas").select("conta_id").eq("id", fazendaId!).maybeSingle();
    const consulta = sb.from("apolices_seguro").select("*").order("data_fim_vigencia").order("id");
    const { data: apolices, error } = await (fz?.conta_id ? consulta.eq("conta_id", fz.conta_id) : consulta.eq("fazenda_id", fazendaId!));
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    const ids = (apolices ?? []).map(a => a.id as string);
    const [premios, sinistros] = ids.length ? await Promise.all([
      sb.from("pagamentos_premio_seguro").select("*").in("apolice_id", ids).order("data_vencimento"),
      sb.from("sinistros_seguro").select("*").in("apolice_id", ids).order("data_ocorrencia", { ascending: false }),
    ]) : [{ data: [], error: null }, { data: [], error: null }];
    const erroFilho = premios.error ?? sinistros.error;
    if (erroFilho) return NextResponse.json({ ok: false, error: erroFilho.message }, { status: 500 });
    return NextResponse.json({ ok: true, apolices: apolices ?? [], premios: premios.data ?? [], sinistros: sinistros.data ?? [] });
  } catch (e: unknown) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "Erro ao carregar." }, { status: 500 });
  }
}

// Sinistro e pagamento de prêmio: sempre conferindo que a apólice é de quem está pedindo.
async function salvarSinistro(req: NextRequest, sb: SbAdmin, id: string | undefined, payload: Record<string, unknown>) {
  const apoliceId = payload.apolice_id as string | undefined;
  const negado = await exigirAcessoRegistro(req, "apolices_seguro", apoliceId);
  if (negado) return negado;
  const { error } = id
    ? await sb.from("sinistros_seguro").update(payload).eq("id", id).eq("apolice_id", apoliceId!)
    : await sb.from("sinistros_seguro").insert(payload);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

async function pagarPremio(req: NextRequest, sb: SbAdmin, premioId: string | undefined, dataPagamento: string | undefined) {
  if (!premioId || !dataPagamento) return NextResponse.json({ ok: false, error: "Prêmio e data são obrigatórios." }, { status: 400 });
  const { data: premio } = await sb.from("pagamentos_premio_seguro").select("*").eq("id", premioId).maybeSingle();
  if (!premio) return NextResponse.json({ ok: false, error: "Prêmio não encontrado." }, { status: 404 });
  const negado = await exigirAcessoRegistro(req, "apolices_seguro", premio.apolice_id as string);
  if (negado) return negado;
  const { data: apolice } = await sb.from("apolices_seguro").select("*").eq("id", premio.apolice_id as string).single();
  if (premio.lancamento_id) {
    // Baixa o lançamento já existente
    const { error } = await sb.from("lancamentos").update({ status: "baixado", data_baixa: dataPagamento }).eq("id", premio.lancamento_id as string);
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  } else {
    // Lançamento CP não existia — cria agora
    const ramo = String(apolice?.ramo ?? "outro");
    const label = RAMO_LABEL[ramo] ?? ramo;
    const { data: lanc, error } = await sb.from("lancamentos").insert({
      fazenda_id: apolice?.fazenda_id, tipo: "pagar",
      descricao: `Prêmio Seguro ${apolice?.seguradora} — ${label}`,
      categoria: `Prêmio de Seguro (${label})`,
      operacao_gerencial_id: await ogDoRamo(sb, String(apolice?.fazenda_id ?? ""), ramo),
      data_lancamento: dataPagamento,
      data_vencimento: premio.data_vencimento,
      valor: premio.valor,
      status: "baixado", data_baixa: dataPagamento,
      auto: false, origem_lancamento: "seguro",
      numero_documento: apolice?.numero_apolice,
      pessoa_id: apolice?.seguradora_pessoa_id ?? null,
      produtor_id: apolice?.produtor_id ?? null,
    }).select("id").single();
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    const { error: eVinc } = await sb.from("pagamentos_premio_seguro").update({ lancamento_id: lanc.id }).eq("id", premioId);
    if (eVinc) return NextResponse.json({ ok: false, error: eVinc.message }, { status: 500 });
  }
  const { error: ePago } = await sb.from("pagamentos_premio_seguro").update({ pago: true, data_pagamento: dataPagamento }).eq("id", premioId);
  if (ePago) return NextResponse.json({ ok: false, error: ePago.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

// Exclui a apólice com prêmios e sinistros (cascata no banco) e os títulos de prêmio ainda em aberto no CP.
// Se algum prêmio já foi pago, baixado, conciliado ou está em borderô, não exclui: o pagamento tem de ser estornado antes.
async function excluirApolice(req: NextRequest, sb: SbAdmin, apoliceId?: string) {
  if (!apoliceId) return NextResponse.json({ ok: false, error: "Apólice não informada." }, { status: 400 });
  const negado = await exigirAcessoRegistro(req, "apolices_seguro", apoliceId);
  if (negado) return negado;
  const { data: premios, error: ePr } = await sb.from("pagamentos_premio_seguro").select("id, pago, lancamento_id").eq("apolice_id", apoliceId);
  if (ePr) throw ePr;
  const lancIds = (premios ?? []).map(p => p.lancamento_id as string | null).filter((x): x is string => !!x);
  const { data: lancs, error: eL } = lancIds.length
    ? await sb.from("lancamentos").select("id, status, valor_pago, conciliado, lote_id").in("id", lancIds)
    : { data: [] as { id: string; status: string; valor_pago: number | null; conciliado: boolean | null; lote_id: string | null }[], error: null };
  if (eL) throw eL;
  const travados = (lancs ?? []).filter(l => !["em_aberto", "vencido", "vencendo"].includes(String(l.status)) || Number(l.valor_pago ?? 0) > 0 || l.conciliado || l.lote_id);
  const pagos = (premios ?? []).filter(p => p.pago).length;
  if (travados.length || pagos) {
    return NextResponse.json({ ok: false, error: `Esta apólice tem ${Math.max(travados.length, pagos)} prêmio(s) já pago(s), conciliado(s) ou em borderô. Estorne esses pagamentos no Contas a Pagar antes de excluir.` }, { status: 409 });
  }
  if (lancIds.length) await falharSeErro(sb.from("lancamentos").delete().in("id", lancIds), "excluir títulos do prêmio");
  await falharSeErro(sb.from("apolices_seguro").delete().eq("id", apoliceId), "excluir apólice");
  return NextResponse.json({ ok: true, titulos_excluidos: lancIds.length });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as {
      acao?: "salvar_sinistro" | "pagar_premio" | "excluir_apolice";
      id?: string;
      premio_id?: string;
      data_pagamento?: string;
      apolice_id?: string;
      payload: Record<string, unknown>;
      gerar_parcelas: boolean;
      parcelas_explicitas?: Array<{ data_vencimento: string; valor: number }>;
      ramo_label?: string;
    };

    const sb = admin();
    if (body.acao === "salvar_sinistro") return await salvarSinistro(req, sb, body.id, body.payload ?? {});
    if (body.acao === "pagar_premio") return await pagarPremio(req, sb, body.premio_id, body.data_pagamento);
    if (body.acao === "excluir_apolice") return await excluirApolice(req, sb, body.apolice_id);
    const today = hojeLocal();
    // Apólice existente: tem de ser do cliente; fazenda do payload (nova ou trocada) também.
    const fazPayload = body.payload?.fazenda_id as string | undefined;
    const negado = (body.apolice_id ? await exigirAcessoRegistro(req, "apolices_seguro", body.apolice_id) : null)
      ?? (fazPayload || !body.apolice_id ? await exigirAcessoFazenda(req, fazPayload) : null);
    if (negado) return negado;
    // A seguradora escolhida tem de ser cadastro de quem está pedindo
    const pessoaSeguradora = body.payload?.seguradora_pessoa_id as string | null | undefined;
    if (pessoaSeguradora) {
      const negadoPessoa = await exigirAcessoRegistro(req, "pessoas", pessoaSeguradora);
      if (negadoPessoa) return negadoPessoa;
    }
    const produtorApolice = body.payload?.produtor_id as string | null | undefined;
    if (produtorApolice) {
      const negadoProdutor = await exigirAcessoRegistro(req, "produtores", produtorApolice);
      if (negadoProdutor) return negadoProdutor;
    }
    // Seções 404/405 ainda não rodadas: grava a apólice sem as colunas novas em vez de falhar
    const semColuna = (e: { code?: string; message?: string } | null) => e?.code === "PGRST204" || !!e?.message?.includes("seguradora_pessoa_id") || !!e?.message?.includes("produtor_id");
    const { seguradora_pessoa_id: _sp, produtor_id: _pr, ...payloadSemColuna } = body.payload ?? {};
    void _sp; void _pr;

    let apoliceId: string;

    if (body.apolice_id) {
      // Edição
      let { error } = await sb.from("apolices_seguro").update(body.payload).eq("id", body.apolice_id);
      if (error && semColuna(error)) ({ error } = await sb.from("apolices_seguro").update(payloadSemColuna).eq("id", body.apolice_id));
      if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
      apoliceId = body.apolice_id;

      // Títulos já gerados (inclusive pagos) recebem a seguradora como fornecedor e o produtor; só muda o vínculo, nunca valor ou baixa
      if (pessoaSeguradora || produtorApolice) {
        const { data: premiosApolice } = await sb.from("pagamentos_premio_seguro").select("lancamento_id").eq("apolice_id", apoliceId);
        const idsLanc = (premiosApolice ?? []).map(p => p.lancamento_id).filter((id): id is string => !!id);
        const vinculos = { ...(pessoaSeguradora ? { pessoa_id: pessoaSeguradora } : {}), ...(produtorApolice ? { produtor_id: produtorApolice } : {}) };
        if (idsLanc.length) await falharSeErro(sb.from("lancamentos").update(vinculos).in("id", idsLanc), "vincular fornecedor e produtor");
      }

      if (body.gerar_parcelas) {
        // Regenerar cronograma: apaga só o que ainda NÃO foi pago (parcelas
        // já quitadas e seus lançamentos "baixado" ficam intocados — o
        // front-end já confirmou com o usuário antes de mandar essa flag).
        const { data: antigas } = await sb
          .from("pagamentos_premio_seguro")
          .select("id, lancamento_id, pago")
          .eq("apolice_id", apoliceId);
        const naoPagas = (antigas ?? []).filter(p => !p.pago);
        const lancIdsNaoPagos = naoPagas.map(p => p.lancamento_id).filter((id): id is string => !!id);
        if (lancIdsNaoPagos.length) {
          await falharSeErro(sb.from("lancamentos").delete().in("id", lancIdsNaoPagos).neq("status", "baixado"), "excluir lancamentos");
        }
        if (naoPagas.length) {
          await falharSeErro(sb.from("pagamentos_premio_seguro").delete().in("id", naoPagas.map(p => p.id)), "excluir pagamentos_premio_seguro");
        }

        const res = await gerarParcelasEDespesas(sb, apoliceId, body.payload, body.parcelas_explicitas, body.ramo_label, today);
        if (!res.ok) return NextResponse.json(res, { status: 500 });
      }
    } else {
      // Inserção
      let { data, error } = await sb.from("apolices_seguro").insert(body.payload).select("id").single();
      if (error && semColuna(error)) ({ data, error } = await sb.from("apolices_seguro").insert(payloadSemColuna).select("id").single());
      if (error || !data) return NextResponse.json({ ok: false, error: error?.message ?? "Erro ao salvar." }, { status: 500 });
      apoliceId = data.id;

      if (body.gerar_parcelas) {
        const res = await gerarParcelasEDespesas(sb, apoliceId, body.payload, body.parcelas_explicitas, body.ramo_label, today);
        if (!res.ok) return NextResponse.json(res, { status: 500 });
      }
    }

    return NextResponse.json({ ok: true, apolice_id: apoliceId });
  } catch (e) {
    console.error("[API seguros]", e);
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
