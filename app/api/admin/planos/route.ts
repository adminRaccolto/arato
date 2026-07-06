import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { PLANOS_DEFAULT } from "../../../../lib/planos";
import type { PlanoId } from "../../../../lib/planos";

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

// GET /api/admin/planos — retorna planos com preços do banco (fallback defaults)
export async function GET() {
  const sb = adminClient();
  const { data } = await sb.from("planos_config").select("plano_id, preco_mensal");

  const overrides: Partial<Record<PlanoId, number>> = {};
  (data ?? []).forEach((row: { plano_id: string; preco_mensal: number }) => {
    overrides[row.plano_id as PlanoId] = row.preco_mensal;
  });

  const precos: Record<PlanoId, number> = {
    essencial:   overrides.essencial   ?? PLANOS_DEFAULT.essencial.preco_mensal,
    gestao:      overrides.gestao      ?? PLANOS_DEFAULT.gestao.preco_mensal,
    performance: overrides.performance ?? PLANOS_DEFAULT.performance.preco_mensal,
  };

  return NextResponse.json(precos);
}

// PUT /api/admin/planos — salva preço de um plano no banco
export async function PUT(request: Request) {
  const sb = adminClient();
  const body = await request.json() as { plano_id: PlanoId; preco_mensal: number };

  if (!body.plano_id || !body.preco_mensal) {
    return NextResponse.json({ error: "plano_id e preco_mensal são obrigatórios" }, { status: 400 });
  }

  const { error } = await sb.from("planos_config").upsert(
    { plano_id: body.plano_id, preco_mensal: body.preco_mensal, updated_at: new Date().toISOString() },
    { onConflict: "plano_id" }
  );

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
