/**
 * POST /api/financeiro/persistir-extrato
 *
 * Persiste o estado de conciliação do extrato OFX no banco.
 * Usa service_role_key — imune a JWT expirado e RLS.
 *
 * Resolve o bug de N-to-1 desconciliando no refresh:
 * fire-and-forget com supabase client-side falha silenciosamente
 * quando o JWT expira; esta rota garante a gravação.
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const admin = () =>
  createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as {
      id:          string;
      linhas:      unknown[];
      conciliados: number;
      pendentes:   number;
      lancamento_ids_conciliados?: string[];  // IDs a marcar como conciliado=true
      lancamento_ids_desconciliados?: string[];  // IDs a marcar como conciliado=false
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

    // 2. Marca lancamentos como conciliado=true (quando vinculados)
    if (body.lancamento_ids_conciliados?.length) {
      await sb.from("lancamentos")
        .update({ conciliado: true })
        .in("id", body.lancamento_ids_conciliados);
    }

    // 3. Marca lancamentos como conciliado=false (quando desvinculados)
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
