// Reprocessa uma pendência operacional após o usuário vincular o insumo correto
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { converterUnidade } from "../../../../lib/whatsapp-inserir";

function sb() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

const catMap: Record<string, string> = {
  pulverizacao:  "Insumos — Defensivos",
  adubacao:      "Insumos — Fertilizantes",
  plantio:       "Insumos — Sementes",
  correcao_solo: "Insumos — Corretivos",
};

const tipoLabel: Record<string, string> = {
  pulverizacao:  "Pulverização",
  adubacao:      "Adubação",
  plantio:       "Plantio",
  correcao_solo: "Correção de Solo",
};

export async function POST(req: NextRequest) {
  let body: { pendenciaId?: string; insumoId?: string; fazendaId?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ ok: false, mensagem: "JSON inválido." }, { status: 400 }); }

  const { pendenciaId, insumoId, fazendaId } = body;
  if (!pendenciaId || !insumoId || !fazendaId) {
    return NextResponse.json({ ok: false, mensagem: "Parâmetros obrigatórios ausentes." }, { status: 400 });
  }

  console.log("[PEND-REPROCESS] pendencia:", pendenciaId, "insumo:", insumoId, "fazenda:", fazendaId);

  try {
    // ── Carrega pendência ────────────────────────────────────────────────────
    const { data: pend } = await sb().from("pendencias_operacionais")
      .select("*").eq("id", pendenciaId).eq("fazenda_id", fazendaId).single();
    if (!pend) return NextResponse.json({ ok: false, mensagem: "Pendência não encontrada." }, { status: 404 });
    if (pend.status !== "pendente") return NextResponse.json({ ok: false, mensagem: "Pendência já resolvida ou cancelada." });

    // ── Carrega insumo ───────────────────────────────────────────────────────
    const { data: insumo } = await sb().from("insumos")
      .select("id, nome, unidade, custo_medio, valor_unitario, estoque")
      .eq("id", insumoId).single();
    if (!insumo) return NextResponse.json({ ok: false, mensagem: "Insumo não encontrado." }, { status: 404 });

    const d           = pend.dados_originais as Record<string, unknown>;
    const doseNum     = Number(d.dose ?? 0);
    const areaHa      = Number(d.area_ha ?? 0);
    const unidUsuario = String(d.unidade ?? "");
    const unidInsumo  = String(insumo.unidade ?? "kg");
    const dataOp      = String(d.data_op ?? new Date().toISOString().split("T")[0]);
    const cicloId     = String(d.ciclo_id ?? "") || null;
    const tipoOp      = String(d.tipo_op ?? pend.subtipo ?? "");
    const operacaoId  = String(pend.operacao_id ?? "");

    if (!operacaoId) return NextResponse.json({ ok: false, mensagem: "operacao_id ausente na pendência." });

    // ── Recalcula ────────────────────────────────────────────────────────────
    const doseNativa  = converterUnidade(doseNum, unidUsuario, unidInsumo);
    const totalNativo = doseNativa * areaHa;
    const custoMedio  = Number(insumo.custo_medio ?? insumo.valor_unitario ?? 0);
    const custoHa     = doseNativa * custoMedio;
    const custoTotal  = totalNativo * custoMedio;

    console.log("[PEND-REPROCESS] tipo:", tipoOp, "dose:", doseNativa, unidInsumo, "× area:", areaHa, "= total:", totalNativo, "custo:", custoTotal);

    // ── Reprocessa por tipo ──────────────────────────────────────────────────
    if (tipoOp === "pulverizacao") {
      const { error: e } = await sb().from("pulverizacao_itens").insert({
        pulverizacao_id: operacaoId, fazenda_id: fazendaId,
        insumo_id: insumo.id, nome_produto: insumo.nome,
        dose_ha: doseNativa, unidade: unidInsumo,
        valor_unitario: custoMedio, custo_ha: custoHa,
        total_consumido: totalNativo, custo_total: custoTotal,
      });
      if (e) console.error("[PEND] pulverizacao_itens:", e.message);
      await sb().from("pulverizacoes").update({ custo_total: custoTotal }).eq("id", operacaoId);
    }

    if (tipoOp === "adubacao") {
      const totalKg = converterUnidade(totalNativo, unidInsumo, "kg");
      const { error: e } = await sb().from("adubacoes_base_itens").insert({
        adubacao_id: operacaoId, fazenda_id: fazendaId,
        insumo_id: insumo.id, produto_nome: insumo.nome,
        dose_kg_ha: doseNativa, quantidade_kg: totalKg,
        valor_unitario: custoMedio, custo_total: custoTotal,
      });
      if (e) console.error("[PEND] adubacoes_base_itens:", e.message);
      await sb().from("adubacoes_base").update({ custo_total: custoTotal }).eq("id", operacaoId);
    }

    if (tipoOp === "plantio") {
      const quantidadeKg = converterUnidade(totalNativo, unidInsumo, "kg");
      const { error: e } = await sb().from("plantios").update({
        insumo_id: insumo.id, variedade: insumo.nome,
        dose_kg_ha: doseNativa, quantidade_kg: quantidadeKg, custo_sementes: custoTotal,
      }).eq("id", operacaoId);
      if (e) console.error("[PEND] plantios update:", e.message);
    }

    if (tipoOp === "correcao_solo") {
      const doseTha  = converterUnidade(doseNativa, unidInsumo, "t");
      const totalTon = converterUnidade(totalNativo, unidInsumo, "t");
      const { error: e } = await sb().from("correcoes_solo_itens").insert({
        correcao_id: operacaoId, fazenda_id: fazendaId,
        insumo_id: insumo.id, produto_nome: insumo.nome,
        dose_ton_ha: doseTha, quantidade_ton: totalTon,
        valor_unitario: custoMedio, custo_total: custoTotal,
      });
      if (e) console.error("[PEND] correcoes_solo_itens:", e.message);
      await sb().from("correcoes_solo").update({ custo_total: custoTotal }).eq("id", operacaoId);
    }

    // ── Baixa de estoque ─────────────────────────────────────────────────────
    const novoEstoque = Math.max(0, Number(insumo.estoque ?? 0) - totalNativo);
    await sb().from("insumos").update({ estoque: novoEstoque }).eq("id", insumo.id);
    await sb().from("movimentacoes_estoque").insert({
      fazenda_id: fazendaId, insumo_id: insumo.id,
      tipo: "saida", motivo: "baixa_uso", quantidade: totalNativo, data: dataOp,
      safra: cicloId, operacao: tipoOp,
      observacao: `${tipoLabel[tipoOp] ?? tipoOp} — ${insumo.nome} (pendência resolvida)`, auto: true,
    });

    // ── Lançamento CP ────────────────────────────────────────────────────────
    if (custoTotal > 0) {
      await sb().from("lancamentos").insert({
        fazenda_id: fazendaId, tipo: "pagar", moeda: "BRL",
        descricao: `${tipoLabel[tipoOp] ?? tipoOp} — ${insumo.nome}`,
        categoria: catMap[tipoOp] ?? "Insumos",
        data_lancamento: new Date().toISOString().split("T")[0],
        data_vencimento: dataOp, valor: custoTotal,
        safra_id: cicloId, status: "em_aberto",
      });
    }

    // ── Resolve pendência ────────────────────────────────────────────────────
    await sb().from("pendencias_operacionais").update({
      status: "resolvida",
      resolvido_em: new Date().toISOString(),
    }).eq("id", pendenciaId);

    const fmtBRL = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
    console.log("[PEND-REPROCESS] OK — custo:", custoTotal);
    return NextResponse.json({
      ok: true,
      mensagem: `Reprocessado com ${insumo.nome}: ${totalNativo.toFixed(2)} ${unidInsumo} consumidos${custoTotal > 0 ? `, custo ${fmtBRL(custoTotal)}` : ""}.`,
    });

  } catch (err) {
    console.error("[PEND-REPROCESS] erro inesperado:", err);
    return NextResponse.json({ ok: false, mensagem: `Erro interno: ${String(err)}` }, { status: 500 });
  }
}
