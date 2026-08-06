import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// POST /api/compras/excluir-nf
// Exclusão total e segura de uma NF de entrada + todos os registros dependentes.
// Usa service_role_key — imune a JWT expirado e RLS.
export async function POST(req: NextRequest) {
  try {
    const { nf_id, fazenda_id } = (await req.json()) as { nf_id: string; fazenda_id: string };
    if (!nf_id || !fazenda_id) {
      return NextResponse.json({ error: "nf_id e fazenda_id obrigatórios" }, { status: 400 });
    }

    const sb = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );

    // 1. Buscar itens da NF
    const { data: itens } = await sb
      .from("nf_entrada_itens")
      .select("id, insumo_id, quantidade")
      .eq("nf_entrada_id", nf_id);

    const itemIds = (itens ?? []).map(i => i.id as string);

    // 2. Reverter movimentações de estoque de insumos
    if (itemIds.length > 0) {
      const { data: movs } = await sb
        .from("movimentacoes_estoque")
        .select("insumo_id, quantidade")
        .in("nf_entrada_item_id", itemIds)
        .eq("tipo", "entrada");

      for (const mov of movs ?? []) {
        const { data: ins } = await sb
          .from("insumos")
          .select("estoque")
          .eq("id", mov.insumo_id)
          .single();
        if (ins) {
          await sb
            .from("insumos")
            .update({ estoque: Math.max(0, (ins.estoque as number) - (mov.quantidade as number)) })
            .eq("id", mov.insumo_id);
        }
      }
      await sb.from("movimentacoes_estoque").delete().in("nf_entrada_item_id", itemIds);
      await sb.from("historico_manutencao").delete().in("nf_entrada_item_id", itemIds);
    }

    // 3. Reverter movimentações PA (Princípios Ativos)
    const { data: movsPA } = await sb
      .from("movimentacoes_pa")
      .select("*")
      .eq("nf_entrada_id", nf_id)
      .eq("tipo", "entrada");

    if (movsPA?.length) {
      for (const m of movsPA) {
        const { data: s } = await sb
          .from("pa_saldos")
          .select("saldo_atual")
          .eq("fazenda_id", m.fazenda_id)
          .eq("principio_ativo_id", m.principio_ativo_id)
          .maybeSingle();
        await sb.from("pa_saldos").upsert(
          {
            fazenda_id: m.fazenda_id,
            principio_ativo_id: m.principio_ativo_id,
            saldo_atual: Math.max(0, Number(s?.saldo_atual ?? 0) - Number(m.quantidade)),
            updated_at: new Date().toISOString(),
          },
          { onConflict: "fazenda_id,principio_ativo_id" },
        );
      }
      await sb.from("movimentacoes_pa").delete().eq("nf_entrada_id", nf_id);
    }

    // 4. Estoque de terceiros
    await sb.from("estoque_terceiros").delete().eq("nf_entrada_id", nf_id);

    // 5. Lançamento financeiro (CP)
    const { data: nfRow } = await sb
      .from("nf_entradas")
      .select("lancamento_id")
      .eq("id", nf_id)
      .single();

    if (nfRow?.lancamento_id) {
      await sb.from("lancamentos").delete().eq("id", nfRow.lancamento_id);
    }

    // 6. Pendências fiscais (criadas pelo fluxo WhatsApp)
    await sb.from("pendencias_fiscais").delete().eq("lancamento_id", nfRow?.lancamento_id ?? "").neq("lancamento_id", "");
    await sb.from("pendencias_fiscais").delete().eq("nf_entrada_id", nf_id);

    // 7. Itens da NF
    await sb.from("nf_entrada_itens").delete().eq("nf_entrada_id", nf_id);

    // 8. Registro da NF
    const { error: errDel } = await sb
      .from("nf_entradas")
      .delete()
      .eq("id", nf_id)
      .eq("fazenda_id", fazenda_id);

    if (errDel) throw new Error(`Erro ao excluir NF: ${errDel.message}`);

    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Erro desconhecido";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
