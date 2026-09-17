/**
 * POST /api/financeiro/seguros
 * Salva (INSERT ou UPDATE) uma apólice de seguro, lançamentos de prêmio e parcelas.
 * Usa service_role_key — imune a JWT expirado e RLS.
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

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

  const og = RAMO_OG[ramo] ?? "2.03.03.001";
  const { data: ogRow } = await sb.from("operacoes_gerenciais")
    .select("id").eq("fazenda_id", fazendaId).eq("classificacao", og).maybeSingle();
  const ogId = ogRow?.id ?? null;

  const parcelas = parcelasExplicitas && parcelasExplicitas.length > 0
    ? parcelasExplicitas
    : gerarParcelasPremio(inicio, premioAnual, forma);

  const lancRows = parcelas.map((parc, i) => ({
    fazenda_id: fazendaId,
    tipo: "pagar",
    descricao: `Prêmio Seguro ${seguradora} — ${ramoLabel} — Parcela ${i + 1}/${parcelas.length}`,
    categoria: `Prêmio de Seguro (${ramoLabel})`,
    operacao_gerencial_id: ogId,
    data_lancamento: parc.data_vencimento,
    data_vencimento: parc.data_vencimento,
    valor: parc.valor,
    status: parc.data_vencimento < today ? "baixado" : "em_aberto",
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
      pago: parc.data_vencimento < today,
      lancamento_id: lancs[i]?.id ?? null,
    }));
    const { error: premioError } = await sb.from("pagamentos_premio_seguro").insert(premioRows);
    if (premioError) console.error("[API seguros] pagamentos_premio_seguro insert error:", premioError);
  }
  return { ok: true };
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as {
      apolice_id?: string;
      payload: Record<string, unknown>;
      gerar_parcelas: boolean;
      parcelas_explicitas?: Array<{ data_vencimento: string; valor: number }>;
      ramo_label?: string;
    };

    const sb = admin();
    const today = new Date().toISOString().slice(0, 10);

    let apoliceId: string;

    if (body.apolice_id) {
      // Edição
      const { error } = await sb.from("apolices_seguro").update(body.payload).eq("id", body.apolice_id);
      if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
      apoliceId = body.apolice_id;

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
          await sb.from("lancamentos").delete().in("id", lancIdsNaoPagos).neq("status", "baixado");
        }
        if (naoPagas.length) {
          await sb.from("pagamentos_premio_seguro").delete().in("id", naoPagas.map(p => p.id));
        }

        const res = await gerarParcelasEDespesas(sb, apoliceId, body.payload, body.parcelas_explicitas, body.ramo_label, today);
        if (!res.ok) return NextResponse.json(res, { status: 500 });
      }
    } else {
      // Inserção
      const { data, error } = await sb.from("apolices_seguro").insert(body.payload).select("id").single();
      if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
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
