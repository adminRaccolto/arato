import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { validateFazendaAccess } from "../../../lib/api-auth";

const sb = () =>
  createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );

// Mesma normalização de lib/db.ts (criarInsumo) — mantidas em sincronia.
// Sem confirm() nesta rota (sem contexto de navegador): em vez de bloquear,
// reaproveita o insumo já existente para não criar duplicado silenciosamente.
function normalizarNomeInsumo(nome: string): string {
  return nome
    .toLowerCase()
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\b(de|do|da|dos|das)\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    if (!body.fazenda_id) return NextResponse.json({ erro: "fazenda_id obrigatório" }, { status: 400 });

    const acesso = await validateFazendaAccess(body.fazenda_id, req.headers.get("authorization") ?? undefined);
    if (!acesso.ok) return NextResponse.json({ erro: acesso.error }, { status: acesso.status });

    const supabase = sb();

    if (body.nome) {
      const { data: existentes } = await supabase.from("insumos").select("*").eq("fazenda_id", body.fazenda_id);
      const alvoNorm = normalizarNomeInsumo(body.nome);
      const parecido = (existentes ?? []).find(e => normalizarNomeInsumo(e.nome) === alvoNorm);
      if (parecido) return NextResponse.json({ ...parecido, _reaproveitado: true });
    }

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

    const { data: atual } = await supabase
      .from("insumos")
      .select("estoque, fazenda_id")
      .eq("id", id)
      .maybeSingle();

    if (!atual) return NextResponse.json({ erro: "Insumo não encontrado" }, { status: 404 });

    const acesso = await validateFazendaAccess(atual.fazenda_id, req.headers.get("authorization") ?? undefined);
    if (!acesso.ok) return NextResponse.json({ erro: acesso.error }, { status: acesso.status });

    // Se o campo estoque está sendo alterado, registrar ajuste de saldo
    if ("estoque" in payload) {
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

    const supabase = sb();
    const { data: atual } = await supabase.from("insumos").select("fazenda_id").eq("id", id).maybeSingle();
    if (!atual) return NextResponse.json({ erro: "Insumo não encontrado" }, { status: 404 });

    const acesso = await validateFazendaAccess(atual.fazenda_id, req.headers.get("authorization") ?? undefined);
    if (!acesso.ok) return NextResponse.json({ erro: acesso.error }, { status: acesso.status });

    const { error } = await supabase.from("insumos").delete().eq("id", id);
    if (error) return NextResponse.json({ erro: error.message }, { status: 400 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ erro: String(e) }, { status: 500 });
  }
}
