import { NextRequest, NextResponse } from "next/server";
import { createClient, SupabaseClient } from "@supabase/supabase-js";

// Espelha lib/db.ts:alocarEntregaPorLinha — duplicado aqui pelo mesmo motivo
// do resto do arquivo (client de service_role, não o anônimo do browser).
// Pedido pode ter o mesmo produto em mais de uma linha (embalagens ou valor
// fiscal por unidade diferentes) — calcular a entrega só por insumo_id
// (somar tudo e aplicar o mesmo total em cada linha) fazia uma linha passar
// de 100% enquanto a outra, sem nenhuma entrega de verdade, mostrava o
// mesmo número. Prioriza o vínculo exato (nf_entrada_itens.pedido_item_id,
// escolhido na Associação de Produtos quando há ambiguidade); cai no
// fallback por insumo_id (preenche as linhas em ordem) só pra itens sem
// esse vínculo.
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

// Pedido "fiscal" nunca passa por registrarEntrega — a quantidade entregue
// vem das NFs processadas vinculadas a ele; sem recalcular aqui, o pedido
// ficava travado em "aprovado" (ou "entregue" fantasma após estorno) mesmo
// depois do estorno reverter a entrega.
async function recalcularEntregaPedidoFiscal(sb: SupabaseClient, pedido_id: string | null | undefined): Promise<void> {
  if (!pedido_id) return;
  const { data: ped } = await sb.from("pedidos_compra").select("fiscal, status").eq("id", pedido_id).maybeSingle();
  if (!ped?.fiscal) return;
  // Nunca promove rascunho pra aprovado nem reabre um pedido cancelado.
  if (ped.status === "rascunho" || ped.status === "cancelado") return;

  const { data: itens } = await sb.from("pedidos_compra_itens").select("id, insumo_id, quantidade, qtd_cancelada, qtd_entregue").eq("pedido_id", pedido_id);
  if (!itens?.length) return;

  const { data: nfs } = await sb.from("nf_entradas").select("id").eq("pedido_compra_id", pedido_id).eq("status", "processada");
  const nfIds = (nfs ?? []).map(n => n.id);

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

// POST /api/compras/estornar-nf
// Usa service_role_key — imune a JWT expirado e RLS.
// Reverte todo o processamento de uma NF: estoque, movimentações PA, CP, itens.
//
// Corrigido (set/2026, caso real NF 26967): esta rota tinha sua própria versão
// da limpeza, diferente da de lib/db.ts (estornarNfProcessamento) — duas cópias
// da mesma lógica, cada uma podendo divergir e ter bugs próprios. Foi exatamente
// essa divergência que causou duplicação real de estoque e financeiro: aqui a
// limpeza de movimentações só olhava nf_entrada_item_id (vira órfã e some da
// limpeza se o item for recriado com outro id no meio de uma falha), e não
// existia a limpeza de pedidos_compra.lancamento_id, que causava violação da FK
// nf_entradas_lancamento_id_fkey ao reprocessar. As duas cópias não foram
// unificadas em uma só (lib/db.ts usa o client anônimo do browser, incompatível
// com o service_role que esta rota precisa) — mas as duas agora têm a mesma
// lógica corrigida.
export async function POST(req: NextRequest) {
  try {
    const { nf_id } = (await req.json()) as { nf_id: string };
    if (!nf_id) return NextResponse.json({ error: "nf_id obrigatório" }, { status: 400 });

    const sb = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );

    // 1. Reverter movimentações de estoque — por nf_entrada_id (link direto, nunca
    //    fica nulo), não mais só por nf_entrada_item_id.
    const { data: movs } = await sb
      .from("movimentacoes_estoque")
      .select("id, insumo_id, quantidade, tipo")
      .eq("nf_entrada_id", nf_id);

    for (const mov of movs ?? []) {
      if (!mov.insumo_id) continue;
      const { data: ins } = await sb.from("insumos").select("estoque").eq("id", mov.insumo_id).single();
      if (ins) {
        const delta = mov.tipo === "entrada" ? -mov.quantidade : mov.quantidade;
        await sb.from("insumos").update({ estoque: (ins.estoque as number) + delta }).eq("id", mov.insumo_id);
      }
    }
    if (movs?.length) {
      await sb.from("movimentacoes_estoque").delete().eq("nf_entrada_id", nf_id);
    }

    // historico_manutencao (peças/manutenção) ainda só linka por item_id
    const { data: itens } = await sb.from("nf_entrada_itens").select("id").eq("nf_entrada_id", nf_id);
    const itemIds = (itens ?? []).map(i => i.id as string);
    if (itemIds.length > 0) {
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

    // 5. Lançamento(s) financeiro(s) (CP) — inclui parcelas (por nf_entrada_id) e o
    //    fallback do id único legado, igual a lib/db.ts.
    await sb.from("lancamentos").delete().eq("nf_entrada_id", nf_id);
    const { data: nfRow } = await sb
      .from("nf_entradas")
      .select("lancamento_id, pedido_compra_id")
      .eq("id", nf_id)
      .single();

    if (nfRow?.lancamento_id) {
      await sb.from("lancamentos").delete().eq("id", nfRow.lancamento_id);
    }
    // Limpa pedidos_compra.lancamento_id se apontava justamente pro lançamento que
    // acabamos de apagar — senão o reprocessamento tenta "atualizar" um id
    // inexistente e viola a FK nf_entradas_lancamento_id_fkey (causa raiz real do
    // caso NF 26967).
    if (nfRow?.pedido_compra_id) {
      const { data: pedRow } = await sb.from("pedidos_compra").select("lancamento_id").eq("id", nfRow.pedido_compra_id).single();
      if (pedRow?.lancamento_id && pedRow.lancamento_id === nfRow.lancamento_id) {
        await sb.from("pedidos_compra").update({ lancamento_id: null }).eq("id", nfRow.pedido_compra_id);
      }
    }

    // 6. Itens → depois status para pendente e desvincular do pedido de compra
    await sb.from("nf_entrada_itens").delete().eq("nf_entrada_id", nf_id);

    const { error: errStatus } = await sb
      .from("nf_entradas")
      .update({ status: "pendente", lancamento_id: null, pedido_compra_id: null })
      .eq("id", nf_id);

    if (errStatus) throw new Error(`Erro ao atualizar status: ${errStatus.message}`);

    // Estorno reverte a entrega — pedido fiscal pode voltar de "entregue"/
    // "parcialmente_entregue" pra "aprovado".
    if (nfRow?.pedido_compra_id) await recalcularEntregaPedidoFiscal(sb, nfRow.pedido_compra_id);

    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Erro desconhecido";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
