/**
 * POST /api/transporte/cte-salvar
 * Salva (insert ou update) um CT-e usando service_role_key para contornar
 * o problema de JWT expirado que bloqueia writes diretos via anon key.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { validateFazendaAccess } from "../../../../lib/api-auth";

export const runtime = "nodejs";

function sb() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as {
      fazenda_id: string;
      cte_id?: string;
      payload: Record<string, unknown>;
    };

    const { fazenda_id, cte_id, payload } = body;
    if (!fazenda_id) return NextResponse.json({ erro: "fazenda_id obrigatório" }, { status: 400 });

    const access = await validateFazendaAccess(fazenda_id, req.headers.get("authorization") ?? undefined);
    if (!access.ok) return NextResponse.json({ erro: access.error }, { status: access.status });

    const db = sb();

    if (cte_id) {
      // UPDATE
      const { error } = await db.from("ctes").update(payload).eq("id", cte_id).eq("fazenda_id", fazenda_id);
      if (error) return NextResponse.json({ erro: error.message, code: error.code }, { status: 400 });
      return NextResponse.json({ sucesso: true, operacao: "update" });
    } else {
      // INSERT
      const { data, error } = await db.from("ctes").insert({ ...payload, fazenda_id }).select("id").single();
      if (error) return NextResponse.json({ erro: error.message, code: error.code }, { status: 400 });
      return NextResponse.json({ sucesso: true, operacao: "insert", id: data?.id });
    }
  } catch (err) {
    console.error("[cte-salvar]", err);
    return NextResponse.json({ erro: String(err) }, { status: 500 });
  }
}
