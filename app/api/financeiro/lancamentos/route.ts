/**
 * POST /api/financeiro/lancamentos
 * Retorna lançamentos (CP/CR) filtrados por fazendas, período e tipo.
 * Usa service_role_key — imune a JWT expirado e RLS.
 *
 * Para CP (tipo=pagar): inclui automaticamente itens vencidos não-pagos
 * anteriores ao período, para que o badge "Vencidos" nunca mostre 0 incorreto.
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
        .order("data_vencimento")
        .range(from, from + PAGE - 1);

      if (body.tipo) q = q.eq("tipo", body.tipo);

      // CP: inclui itens no período OU vencidos não-pagos fora do período.
      // CR: mantém filtro estrito de período (sem carregar receitas antigas automaticamente).
      if (body.tipo === "pagar") {
        q = q.or(
          `and(data_vencimento.gte.${body.data_inicio},data_vencimento.lte.${body.data_fim}),and(data_vencimento.lt.${body.data_inicio},status.neq.baixado)`
        );
      } else {
        q = q.gte("data_vencimento", body.data_inicio).lte("data_vencimento", body.data_fim);
      }

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

// PATCH /api/financeiro/lancamentos — atualiza um lançamento (service_role, imune a JWT/RLS)
export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json() as { id: string; patch: Record<string, unknown> };
    if (!body.id || !body.patch) {
      return NextResponse.json({ ok: false, error: "id e patch são obrigatórios" }, { status: 400 });
    }
    const sb = admin();
    const { error, count } = await sb.from("lancamentos").update(body.patch, { count: "exact" }).eq("id", body.id);
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
    if (!count) return NextResponse.json({ ok: false, error: "Lançamento não encontrado ou sem permissão" }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[api/financeiro/lancamentos PATCH]", e);
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
