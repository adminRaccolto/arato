import { exigirAcessoRegistro } from "../../../../lib/api-auth";
import { titulosBloqueiamEstorno, excluirTitulosDaNf } from "../../../../lib/financeiro/titulos-nf";
import { bloqueioVefComRemessas, desfazerVinculosDaNf } from "../../../../lib/fiscal/estorno-vinculos";
import { ajustarSaldoPedidoNoFC } from "../../../../lib/financeiro/saldo-pedido";
import { ptaxDoDia } from "../../../../lib/financeiro/ptax";
import { falharSeErro } from "../../../../lib/db-util";
import { NextRequest, NextResponse } from "next/server";
import { alocarEntregaPorLinha, statusPorEntrega } from "../../../../lib/compras/entrega-pedido";
import { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "../../../../lib/supabase-servidor";


// Pedido "fiscal" nunca passa por registrarEntrega; a quantidade entregue
// vem das NFs processadas vinculadas a ele. Sem recalcular aqui, excluir a
// única NF de um pedido deixava ele "entregue" fantasma pra sempre.
async function recalcularEntregaPedidoFiscal(sb: SupabaseClient, pedido_id: string | null | undefined): Promise<void> {
  if (!pedido_id) return;
  const { data: ped } = await sb.from("pedidos_compra").select("status").eq("id", pedido_id).maybeSingle();
  if (!ped) return;
  // Nunca promove rascunho pra aprovado nem reabre um pedido cancelado.
  if (ped.status === "rascunho" || ped.status === "cancelado") return;

  const { data: itens } = await sb.from("pedidos_compra_itens").select("id, insumo_id, quantidade, qtd_cancelada, qtd_entregue, unidade").eq("pedido_id", pedido_id);
  if (!itens?.length) return;

  // Gate por NF de verdade vinculada, não pela flag `fiscal` (pode estar
  // desatualizada — ver lib/db.ts recalcularEntregaPedidoFiscal, achado 01/10/2026).
  const { data: nfsVinculadas } = await sb.from("nf_entradas").select("id, status").eq("pedido_compra_id", pedido_id);
  if (!nfsVinculadas?.length) return;
  const nfIds = nfsVinculadas.filter(n => n.status === "processada").map(n => n.id);

  let nfItens: { insumo_id: string | null; pedido_item_id: string | null; quantidade: number; unidade: string | null }[] = [];
  if (nfIds.length) {
    const { data } = await sb.from("nf_entrada_itens").select("insumo_id, pedido_item_id, quantidade, unidade").in("nf_entrada_id", nfIds);
    nfItens = data ?? [];
  }

  const entregaPorLinha = alocarEntregaPorLinha(itens, nfItens);

  for (const it of itens) {
    const novaQtd = entregaPorLinha.get(it.id) ?? 0;
    if (Math.abs(novaQtd - (it.qtd_entregue ?? 0)) > 0.001) {
      await sb.from("pedidos_compra_itens").update({ qtd_entregue: novaQtd }).eq("id", it.id);
    }
  }

  const novoStatus = statusPorEntrega(itens, entregaPorLinha, nfIds.length > 0);
  await sb.from("pedidos_compra").update({ status: novoStatus }).eq("id", pedido_id);
}

// POST /api/compras/excluir-nf
// Exclusão total e segura de uma NF de entrada + todos os registros dependentes.
// Usa service_role_key — imune a JWT expirado e RLS.
export async function POST(req: NextRequest) {
  try {
    const { nf_id, fazenda_id } = (await req.json()) as { nf_id: string; fazenda_id: string };

    const negado = await exigirAcessoRegistro(req, "nf_entradas", nf_id);
    if (negado) return negado;
    if (!nf_id || !fazenda_id) {
      return NextResponse.json({ error: "nf_id e fazenda_id obrigatórios" }, { status: 400 });
    }

    const sb = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );

    // 0. Título pago/conciliado/em borderô (produtor ou Empresa) impede a exclusão — checado ANTES de reverter qualquer coisa
    const bloqueioExcl = await titulosBloqueiamEstorno(sb, nf_id);
    if (bloqueioExcl) return NextResponse.json({ error: bloqueioExcl }, { status: 409 });
    // Vínculos fora do estoque/CP (retorno na remessa de armazém, saldo de entrega futura) — mesmo do estorno
    const bloqVefExcl = await bloqueioVefComRemessas(sb, nf_id);
    if (bloqVefExcl) return NextResponse.json({ error: bloqVefExcl }, { status: 409 });
    const { data: nfVincE } = await sb.from("nf_entradas").select("id, numero, chave_acesso, fazenda_id, status").eq("id", nf_id).maybeSingle();
    // Só NF processada mexeu em remessa/saldo — cópia pendente (duplicada do SIEG, mesma chave) não desfaz nada
    if (nfVincE && nfVincE.status === "processada") await desfazerVinculosDaNf(sb, nfVincE as { id: string; numero: string | null; chave_acesso: string | null; fazenda_id: string });

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
      await falharSeErro(sb.from("movimentacoes_estoque").delete().in("nf_entrada_item_id", itemIds), "excluir movimentacoes_estoque");
      await falharSeErro(sb.from("historico_manutencao").delete().in("nf_entrada_item_id", itemIds), "excluir historico_manutencao");
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
      await falharSeErro(sb.from("movimentacoes_pa").delete().eq("nf_entrada_id", nf_id), "excluir movimentacoes_pa");
    }

    // 4. Estoque de terceiros
    await falharSeErro(sb.from("estoque_terceiros").delete().eq("nf_entrada_id", nf_id), "excluir estoque_terceiros");
    // 5. Lançamento financeiro (CP)
    const { data: nfRow } = await sb
      .from("nf_entradas")
      .select("lancamento_id, pedido_compra_id")
      .eq("id", nf_id)
      .single();

    // Todos os títulos da NF (parcelas e Empresa), não só o primeiro — a checagem de bloqueio já foi feita no início
    await excluirTitulosDaNf(sb, nf_id);

    // 6. Pendências fiscais (criadas pelo fluxo WhatsApp)
    // Só quando a NF tinha título: .eq("lancamento_id", "") quebrava (uuid inválido) e a exclusão parava no meio,
    // depois de já ter apagado estoque e títulos — a NF ficava "processada" sem nada.
    if (nfRow?.lancamento_id) await falharSeErro(sb.from("pendencias_fiscais").delete().eq("lancamento_id", nfRow.lancamento_id), "excluir pendencias_fiscais");
    await falharSeErro(sb.from("pendencias_fiscais").delete().eq("nf_entrada_id", nf_id), "excluir pendencias_fiscais");
    // 7. Itens da NF
    await falharSeErro(sb.from("nf_entrada_itens").delete().eq("nf_entrada_id", nf_id), "excluir nf_entrada_itens");
    // 8. Registro da NF
    const { error: errDel } = await sb
      .from("nf_entradas")
      .delete()
      .eq("id", nf_id)
      .eq("fazenda_id", fazenda_id);

    if (errDel) throw new Error(`Erro ao excluir NF: ${errDel.message}`);

    // NF excluída pode ter sido a única entrega de um pedido fiscal —
    // recalcula pra não ficar "entregue" fantasma.
    if (nfRow?.pedido_compra_id) await recalcularEntregaPedidoFiscal(sb, nfRow.pedido_compra_id);
    if (nfRow?.pedido_compra_id) await ajustarSaldoPedidoNoFC(sb, nfRow.pedido_compra_id, ptaxDoDia).catch(() => {});

    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Erro desconhecido";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
