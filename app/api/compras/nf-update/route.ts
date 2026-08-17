import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const admin = () =>
  createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

// POST /api/compras/nf-update
// Atualiza campos de metadados de uma NF de entrada usando service_role_key,
// imune a JWT expirado e RLS. Usado antes do processamento para garantir que
// data_vencimento_cp, produtor_id e tipo_entrada estejam persistidos.
export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as {
      id: string;
      fazenda_id: string;
      data_vencimento_cp?: string | null;
      forma_pagamento?: string | null;
      tipo_entrada?: string;
      produtor_id?: string | null;
      ie_produtor?: string | null;
      operacao_gerencial_id?: string | null;
      centro_custo_id?: string | null;
      ano_safra_id?: string | null;
      ciclo_id?: string | null;
      pedido_compra_id?: string | null;
      observacao?: string | null;
    };

    if (!body.id || !body.fazenda_id) {
      return NextResponse.json({ error: "id e fazenda_id obrigatórios" }, { status: 400 });
    }

    const update: Record<string, unknown> = {};
    if (body.data_vencimento_cp !== undefined) update.data_vencimento_cp = body.data_vencimento_cp || null;
    if (body.forma_pagamento    !== undefined) update.forma_pagamento    = body.forma_pagamento    || null;
    if (body.tipo_entrada !== undefined) update.tipo_entrada = body.tipo_entrada;
    if (body.produtor_id !== undefined) update.produtor_id = body.produtor_id || null;
    if (body.ie_produtor !== undefined) update.ie_produtor = body.ie_produtor || null;
    if (body.operacao_gerencial_id !== undefined) update.operacao_gerencial_id = body.operacao_gerencial_id || null;
    if (body.centro_custo_id !== undefined) update.centro_custo_id = body.centro_custo_id || null;
    if (body.ano_safra_id !== undefined) update.ano_safra_id = body.ano_safra_id || null;
    if (body.ciclo_id !== undefined) update.ciclo_id = body.ciclo_id || null;
    if (body.pedido_compra_id !== undefined) update.pedido_compra_id = body.pedido_compra_id || null;
    if (body.observacao !== undefined) update.observacao = body.observacao || null;

    if (Object.keys(update).length === 0) {
      return NextResponse.json({ ok: true, updated: 0 });
    }

    const { error } = await admin()
      .from("nf_entradas")
      .update(update)
      .eq("id", body.id)
      .eq("fazenda_id", body.fazenda_id);

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ ok: true, updated: Object.keys(update).length });
  } catch (e) {
    console.error("[api/compras/nf-update]", e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
