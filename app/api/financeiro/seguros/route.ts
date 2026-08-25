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
    } else {
      // Inserção
      const { data, error } = await sb.from("apolices_seguro").insert(body.payload).select("id").single();
      if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
      apoliceId = data.id;

      if (body.gerar_parcelas) {
        const p = body.payload;
        const fazendaId = String(p.fazenda_id ?? "");
        const ramo = String(p.ramo ?? "outro");
        const seguradora = String(p.seguradora ?? "");
        const premioAnual = Number(p.premio_anual ?? 0);
        const forma = String(p.forma_pagamento_premio ?? "unica");
        const inicio = String(p.data_inicio_vigencia ?? today);
        const numeroApolice = String(p.numero_apolice ?? "");
        const ramoLabel = body.ramo_label ?? RAMO_LABEL[ramo] ?? ramo;

        // Busca operacao_gerencial pelo classificacao_id
        const og = RAMO_OG[ramo] ?? "2.03.03.001";
        const { data: ogRow } = await sb.from("operacoes_gerenciais")
          .select("id").eq("fazenda_id", fazendaId).eq("classificacao", og).maybeSingle();
        const ogId = ogRow?.id ?? null;

        const parcelas = body.parcelas_explicitas && body.parcelas_explicitas.length > 0
          ? body.parcelas_explicitas
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

        const { data: lancs } = await sb.from("lancamentos").insert(lancRows).select("id, data_vencimento");

        if (lancs && lancs.length > 0) {
          const premioRows = parcelas.map((parc, i) => ({
            apolice_id: apoliceId,
            fazenda_id: fazendaId,
            data_vencimento: parc.data_vencimento,
            valor: parc.valor,
            pago: parc.data_vencimento < today,
            lancamento_id: lancs[i]?.id ?? null,
          }));
          await sb.from("pagamentos_premio_seguro").insert(premioRows);
        }
      }
    }

    return NextResponse.json({ ok: true, apolice_id: apoliceId });
  } catch (e) {
    console.error("[API seguros]", e);
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
