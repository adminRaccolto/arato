import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const admin = () =>
  createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

// POST /api/financeiro/consorcios
// Se body.id estiver presente → UPDATE; senão → INSERT.
// Usa service_role_key — imune a JWT expirado e RLS.
export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as {
      id?: string;
      fazenda_id: string;
      administradora: string;
      numero_cota: string;
      grupo?: string;
      tipo_bem: string;
      descricao_bem?: string;
      valor_credito: number;
      valor_parcela_mensal: number;
      total_parcelas: number;
      parcelas_pagas: number;
      data_inicio: string;
      status: string;
      observacao?: string | null;
    };

    if (!body.fazenda_id) {
      return NextResponse.json({ error: "fazenda_id obrigatório" }, { status: 400 });
    }

    const sb = admin();

    if (body.id) {
      const { id, ...payload } = body;
      const { error } = await sb.from("consorcios").update(payload).eq("id", id);
      if (error) return NextResponse.json({ error: error.message }, { status: 400 });
      return NextResponse.json({ ok: true, id });
    } else {
      const { data, error } = await sb
        .from("consorcios")
        .insert(body)
        .select("id")
        .single();
      if (error) return NextResponse.json({ error: error.message }, { status: 400 });
      return NextResponse.json({ ok: true, id: data.id });
    }
  } catch (e) {
    console.error("[api/financeiro/consorcios]", e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
