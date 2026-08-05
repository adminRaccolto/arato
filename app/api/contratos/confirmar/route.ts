import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const admin = () =>
  createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

// POST /api/contratos/confirmar
// Atribui num_lancamento e cria CR quando contrato é confirmado.
// Usa service_role_key para bypassar RLS (JWT do browser pode estar expirado).
export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as {
      contrato_id: string;
      fazenda_id: string;
      valor_total: number;
      moeda: string;
      pessoa_id?: string;
      comprador?: string;
      numero?: string;
      ciclo_id?: string;
      ano_safra_id?: string;
      data_pagamento?: string;
      data_entrega?: string;
      lancamento_cr_id?: string;
    };

    const sb = admin();

    // ── 1. Atribuir num_lancamento se ainda não tem ───────────────────────────
    const { data: contrato } = await sb
      .from("contratos")
      .select("id, num_lancamento, lancamento_cr_id, fazenda_id")
      .eq("id", body.contrato_id)
      .single();

    if (!contrato) return NextResponse.json({ error: "Contrato não encontrado" }, { status: 404 });

    let numLancamento = contrato.num_lancamento as number | null;

    if (!numLancamento) {
      // Próximo número sequencial por fazenda
      const { count } = await sb
        .from("contratos")
        .select("*", { count: "exact", head: true })
        .eq("fazenda_id", contrato.fazenda_id)
        .not("num_lancamento", "is", null);

      numLancamento = (count ?? 0) + 1;

      await sb
        .from("contratos")
        .update({ num_lancamento: numLancamento })
        .eq("id", body.contrato_id);
    }

    // ── 2. Criar CR se ainda não existe ──────────────────────────────────────
    let crId = contrato.lancamento_cr_id as string | null;

    if (!crId && body.valor_total > 0) {
      const compradorNome = body.comprador ?? "";
      const dataRef =
        body.data_pagamento ||
        body.data_entrega ||
        new Date().toISOString().split("T")[0];

      // Monta payload base — sem colunas opcionais que podem não existir no DB
      const crPayload: Record<string, unknown> = {
        fazenda_id: body.fazenda_id,
        tipo: "receber",
        descricao: `Pedido de Venda — ${compradorNome} (Contrato ${body.numero ?? body.contrato_id.slice(-6)})`,
        categoria: "Pedido de Venda — Grãos",
        data_lancamento: new Date().toISOString().split("T")[0],
        data_vencimento: dataRef,
        valor: body.valor_total,
        moeda: body.moeda,
        status: "em_aberto",          // em_aberto é seguro em qualquer constraint
        pessoa_id: body.pessoa_id || null,
        observacao: "Pedido de Venda gerado ao confirmar contrato. Será atualizado conforme romaneios faturados.",
      };

      // Colunas adicionadas em migrations específicas — só inclui se a coluna existir
      // (evita erros de schema se a migration não foi executada ainda)
      if (body.ciclo_id) crPayload.ciclo_id = body.ciclo_id;
      if (body.ano_safra_id) crPayload.ano_safra_id = body.ano_safra_id;

      // Tenta incluir contrato_id (Seção 80 pode não ter sido executada)
      const { data: crRow, error: crErr } = await sb
        .from("lancamentos")
        .insert({ ...crPayload, contrato_id: body.contrato_id })
        .select("id")
        .single();

      // Se falhar por contrato_id não existir, tenta sem ele
      if (crErr && crErr.message.includes("contrato_id")) {
        const { data: crRow2, error: crErr2 } = await sb
          .from("lancamentos")
          .insert(crPayload)
          .select("id")
          .single();

        if (crErr2) {
          return NextResponse.json({
            error: `CR não criado: ${crErr2.message}`,
            num_lancamento: numLancamento,
          }, { status: 207 });
        }
        crId = crRow2?.id ?? null;
      } else if (crErr) {
        return NextResponse.json({
          error: `CR não criado: ${crErr.message}`,
          num_lancamento: numLancamento,
        }, { status: 207 });
      } else {
        crId = crRow?.id ?? null;
      }

      if (crId) {
        await sb
          .from("contratos")
          .update({ lancamento_cr_id: crId })
          .eq("id", body.contrato_id);
      }
    }

    return NextResponse.json({
      ok: true,
      num_lancamento: numLancamento,
      lancamento_cr_id: crId,
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
