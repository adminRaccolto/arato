import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const sb = () =>
  createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const supabase = sb();
    const { data, error } = await supabase.from("insumos").insert(body).select().single();
    if (error) return NextResponse.json({ erro: error.message }, { status: 400 });

    // Cria movimentação de entrada para o saldo inicial, se houver.
    // Sem esse registro, a aba de movimentações mostraria saldo negativo
    // (só saídas sem a entrada correspondente) e a reconciliação destruiria o saldo.
    const estoqueInicial = Number(body.estoque ?? 0);
    if (estoqueInicial > 0) {
      await supabase.from("movimentacoes_estoque").insert({
        insumo_id:  data.id,
        fazenda_id: body.fazenda_id,
        tipo:       "entrada",
        motivo:     "estoque_inicial",
        quantidade: estoqueInicial,
        data:       new Date().toISOString().slice(0, 10),
        observacao: "Saldo inicial cadastrado",
        auto:       true,
      });
    }

    return NextResponse.json(data);
  } catch (e) {
    return NextResponse.json({ erro: String(e) }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    const { id, ...payload } = body as { id: string; [key: string]: unknown };
    if (!id) return NextResponse.json({ erro: "id obrigatório" }, { status: 400 });

    const supabase = sb();

    // Se o campo estoque está sendo alterado, registrar ajuste de saldo
    if ("estoque" in payload) {
      const { data: atual } = await supabase
        .from("insumos")
        .select("estoque, fazenda_id")
        .eq("id", id)
        .single();

      if (atual) {
        const delta = Number(payload.estoque ?? 0) - Number(atual.estoque ?? 0);
        if (delta !== 0) {
          await supabase.from("movimentacoes_estoque").insert({
            insumo_id:  id,
            fazenda_id: atual.fazenda_id,
            tipo:       delta > 0 ? "entrada" : "saida",
            motivo:     "ajuste_manual",
            quantidade: Math.abs(delta),
            data:       new Date().toISOString().slice(0, 10),
            observacao: "Ajuste via cadastro de insumos",
            auto:       false,
          });
        }
      }
    }

    const { error } = await supabase.from("insumos").update(payload).eq("id", id);
    if (error) return NextResponse.json({ erro: error.message }, { status: 400 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ erro: String(e) }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = await Promise.resolve(new URL(req.url));
    const id = searchParams.get("id");
    if (!id) return NextResponse.json({ erro: "id obrigatório" }, { status: 400 });
    const { error } = await sb().from("insumos").delete().eq("id", id);
    if (error) return NextResponse.json({ erro: error.message }, { status: 400 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ erro: String(e) }, { status: 500 });
  }
}
