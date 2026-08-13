/**
 * POST /api/financeiro/lancamentos
 * Retorna lançamentos (CP/CR) filtrados por fazendas, período e tipo.
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

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as {
      fazenda_ids: string[];
      data_inicio:  string;
      data_fim:     string;
      tipo?:        "pagar" | "receber";
    };

    if (!body.fazenda_ids?.length) {
      return NextResponse.json({ ok: true, lancamentos: [] });
    }

    const PAGE = 1000;
    const sb = admin();
    let all: unknown[] = [];
    let from = 0;

    while (true) {
      let q = sb
        .from("lancamentos")
        .select("*")
        .in("fazenda_id", body.fazenda_ids)
        .gte("data_vencimento", body.data_inicio)
        .lte("data_vencimento", body.data_fim)
        .order("data_vencimento")
        .range(from, from + PAGE - 1);

      if (body.tipo) q = q.eq("tipo", body.tipo);

      const { data, error } = await q;
      if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });

      all = all.concat(data ?? []);
      if (!data || data.length < PAGE) break;
      from += PAGE;
    }

    return NextResponse.json({ ok: true, lancamentos: all });
  } catch (e) {
    console.error("[api/financeiro/lancamentos]", e);
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
