import { titulosBloqueiamEstorno, excluirTitulosDaNf } from "../../../../lib/financeiro/titulos-nf";
import { ajustarSaldoPedidoNoFC } from "../../../../lib/financeiro/saldo-pedido";
import { ptaxDoDia } from "../../../../lib/financeiro/ptax";
import { falharSeErro } from "../../../../lib/db-util";
import { NextRequest, NextResponse } from "next/server";
import { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "../../../../lib/supabase-servidor";

// Espelha lib/db.ts:alocarEntregaPorLinha — pedido pode ter o mesmo produto
// em mais de uma linha (embalagens ou valor fiscal por unidade diferentes);
// calcular a entrega só por insumo_id (somar tudo e aplicar o mesmo total em
// cada linha) fazia uma linha passar de 100% enquanto a outra, sem nenhuma
// entrega de verdade, mostrava o mesmo número. Prioriza o vínculo exato
// (nf_entrada_itens.pedido_item_id, escolhido na Associação de Produtos
// quando há ambiguidade); cai no fallback por insumo_id (preenche as linhas
// em ordem) só pra itens sem esse vínculo.
function alocarEntregaPorLinha(
  linhas: { id: string; insumo_id?: string | null; quantidade: number }[],
  nfItens: { insumo_id?: string | null; pedido_item_id?: string | null; quantidade: number }[],
): Map<string, number> {
  const entregue = new Map<string, number>();
  const porInsumo = new Map<string, typeof linhas>();
  for (const l of linhas) {
    if (!l.insumo_id) continue;
    entregue.set(l.id, 0);
    const grupo = porInsumo.get(l.insumo_id);
    if (grupo) grupo.push(l);
    else porInsumo.set(l.insumo_id, [l]);
  }

  const naoVinculadoPorInsumo = new Map<string, number>();
  for (const nf of nfItens) {
    if (!nf.insumo_id) continue;
    if (nf.pedido_item_id && entregue.has(nf.pedido_item_id)) {
      entregue.set(nf.pedido_item_id, (entregue.get(nf.pedido_item_id) ?? 0) + nf.quantidade);
    } else {
      naoVinculadoPorInsumo.set(nf.insumo_id, (naoVinculadoPorInsumo.get(nf.insumo_id) ?? 0) + nf.quantidade);
    }
  }

  for (const [insumoId, linhasDoProduto] of porInsumo) {
    let restante = naoVinculadoPorInsumo.get(insumoId) ?? 0;
    if (restante <= 0) continue;
    for (const l of linhasDoProduto) {
      if (restante <= 0) break;
      const jaAlocado = entregue.get(l.id) ?? 0;
      const capacidade = Math.max(0, l.quantidade - jaAlocado);
      const aplicar = Math.min(restante, capacidade);
      entregue.set(l.id, jaAlocado + aplicar);
      restante -= aplicar;
    }
    if (restante > 0 && linhasDoProduto.length > 0) {
      const ultima = linhasDoProduto[linhasDoProduto.length - 1];
      entregue.set(ultima.id, (entregue.get(ultima.id) ?? 0) + restante);
    }
  }

  return entregue;
}

// Pedido "fiscal" nunca passa por registrarEntrega; a quantidade entregue
// vem das NFs processadas vinculadas a ele. Sem recalcular aqui, excluir a
// única NF de um pedido deixava ele "entregue" fantasma pra sempre.
async function recalcularEntregaPedidoFiscal(sb: SupabaseClient, pedido_id: string | null | undefined): Promise<void> {
  if (!pedido_id) return;
  const { data: ped } = await sb.from("pedidos_compra").select("status").eq("id", pedido_id).maybeSingle();
  if (!ped) return;
  // Nunca promove rascunho pra aprovado nem reabre um pedido cancelado.
  if (ped.status === "rascunho" || ped.status === "cancelado") return;

  const { data: itens } = await sb.from("pedidos_compra_itens").select("id, insumo_id, quantidade, qtd_cancelada, qtd_entregue").eq("pedido_id", pedido_id);
  if (!itens?.length) return;

  // Gate por NF de verdade vinculada, não pela flag `fiscal` (pode estar
  // desatualizada — ver lib/db.ts recalcularEntregaPedidoFiscal, achado 01/10/2026).
  const { data: nfsVinculadas } = await sb.from("nf_entradas").select("id, status").eq("pedido_compra_id", pedido_id);
  if (!nfsVinculadas?.length) return;
  const nfIds = nfsVinculadas.filter(n => n.status === "processada").map(n => n.id);

  let nfItens: { insumo_id: string | null; pedido_item_id: string | null; quantidade: number }[] = [];
  if (nfIds.length) {
    const { data } = await sb.from("nf_entrada_itens").select("insumo_id, pedido_item_id, quantidade").in("nf_entrada_id", nfIds);
    nfItens = data ?? [];
  }

  const entregaPorLinha = alocarEntregaPorLinha(itens, nfItens);

  for (const it of itens) {
    const novaQtd = entregaPorLinha.get(it.id) ?? 0;
    if (Math.abs(novaQtd - (it.qtd_entregue ?? 0)) > 0.001) {
      await sb.from("pedidos_compra_itens").update({ qtd_entregue: novaQtd }).eq("id", it.id);
    }
  }

  const todoEntregue = itens.every(it => (entregaPorLinha.get(it.id) ?? 0) >= (it.quantidade - (it.qtd_cancelada ?? 0)));
  const algumEntregue = itens.some(it => (entregaPorLinha.get(it.id) ?? 0) > 0);
  const novoStatus = todoEntregue ? "entregue" : algumEntregue ? "parcialmente_entregue" : "aprovado";
  await sb.from("pedidos_compra").update({ status: novoStatus }).eq("id", pedido_id);
}

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

    // 0. Título pago/conciliado/em borderô (produtor ou Empresa) impede a exclusão — checado ANTES de reverter qualquer coisa
    const bloqueioExcl = await titulosBloqueiamEstorno(sb, nf_id);
    if (bloqueioExcl) return NextResponse.json({ error: bloqueioExcl }, { status: 409 });

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
