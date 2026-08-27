/**
 * POST /api/financeiro/persistir-extrato
 *
 * Persiste o estado de conciliação do extrato OFX no banco.
 * Usa service_role_key — imune a JWT expirado e RLS.
 *
 * Também baixa lançamentos (status=baixado) via service_role_key para
 * evitar falhas silenciosas por JWT expirado no caso N:1 (bordero).
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const admin = () =>
  createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

type BaixarItem = {
  id: string;
  data_baixa: string;
  valor_pago: number;
};

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as {
      id:          string;
      linhas:      unknown[];
      conciliados: number;
      pendentes:   number;
      lancamento_ids_conciliados?:   string[];   // IDs a marcar como conciliado=true
      lancamento_ids_desconciliados?: string[];  // IDs a marcar como conciliado=false
      baixar?: BaixarItem[];  // Lançamentos a baixar (status→baixado) via service_role
    };

    if (!body.id) {
      return NextResponse.json({ ok: false, error: "id é obrigatório" }, { status: 400 });
    }

    const sb = admin();

    // 1. Atualiza extrato
    const { error } = await sb
      .from("extratos_bancarios")
      .update({ linhas: body.linhas, conciliados: body.conciliados, pendentes: body.pendentes })
      .eq("id", body.id);

    if (error) {
      console.error("[persistir-extrato] erro ao atualizar extrato:", error.message);
      return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
    }

    // 2. Baixa lançamentos (N:1 bordero) — usa service_role para evitar JWT expirado
    if (body.baixar?.length) {
      await Promise.all(
        body.baixar.map(item =>
          sb.from("lancamentos").update({
            status:     "baixado",
            data_baixa: item.data_baixa,
            valor_pago: item.valor_pago,
          }).eq("id", item.id)
        )
      );
    }

    // 3. Marca lancamentos como conciliado=true (quando vinculados)
    if (body.lancamento_ids_conciliados?.length) {
      await sb.from("lancamentos")
        .update({ conciliado: true })
        .in("id", body.lancamento_ids_conciliados);
    }

    // 4. Marca lancamentos como conciliado=false (quando desvinculados)
    if (body.lancamento_ids_desconciliados?.length) {
      await sb.from("lancamentos")
        .update({ conciliado: false })
        .in("id", body.lancamento_ids_desconciliados);
    }

    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[persistir-extrato]", msg);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
