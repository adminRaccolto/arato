/**
 * POST /api/financeiro/cartao — Cartão de Crédito no Contas a Pagar (produtor).
 *   pagar_titulo:    título em aberto pago com cartão → vai para a fatura da compra (status 'cartao'); sai do CP e não
 *                    movimenta o banco (o dinheiro sai ao pagar a fatura). Fatura da competência já fechada/paga → próxima.
 *   estornar_titulo: estorno de compra no cartão, com o modo confirmado pelo usuário:
 *                      retirar   — só com a fatura aberta: o título volta ao Contas a Pagar em aberto;
 *                      credito   — crédito numa fatura seguinte (título 'receber' no cartão, abate o total — Seção 385);
 *                      reembolso — reembolso em dinheiro: Contas a Receber em aberto do fornecedor.
 *   titulos_nf:      títulos de uma NF que estão no cartão, com a situação da fatura (para o estorno da NF pedir confirmação).
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "../../../../lib/supabase-servidor";
import { exigirAcessoRegistro } from "../../../../lib/api-auth";
import { aplicarEstornoCartao, competenciaFatura, competenciaSeguinte, contaDaFazenda, faturaDaCompetencia, type CartaoBasico, type ModoEstornoCartao } from "../../../../lib/financeiro/cartao";

export const runtime = "nodejs";
const admin = () => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { autoRefreshToken: false, persistSession: false } });
const erro = (msg: string, status = 400) => NextResponse.json({ ok: false, error: msg }, { status });

type Corpo = {
  acao: "pagar_titulo" | "estornar_titulo" | "titulos_nf";
  lancamento_id?: string; nf_id?: string;
  cartao_id?: string; data_compra?: string;
  modo?: ModoEstornoCartao; valor?: number; mes?: number; ano?: number; data_reembolso?: string; observacao?: string;
};

export async function POST(req: NextRequest) {
  try {
    const b = await req.json() as Corpo;
    const sb = admin();

    if (b.acao === "titulos_nf") {
      if (!b.nf_id) return erro("nf_id obrigatório");
      const negado = await exigirAcessoRegistro(req, "nf_entradas", b.nf_id);
      if (negado) return negado;
      const { data: ts } = await sb.from("lancamentos").select("id, descricao, valor, fatura_cartao_id").eq("nf_entrada_id", b.nf_id).eq("status", "cartao");
      const fatIds = [...new Set((ts ?? []).map(t => t.fatura_cartao_id).filter(Boolean))] as string[];
      const { data: fats } = fatIds.length ? await sb.from("faturas_cartao").select("id, status, mes, ano").in("id", fatIds) : { data: [] };
      return NextResponse.json({ ok: true, titulos: (ts ?? []).map(t => ({ ...t, fatura: (fats ?? []).find(f => f.id === t.fatura_cartao_id) ?? null })) });
    }

    if (!b.lancamento_id) return erro("lancamento_id obrigatório");
    const negado = await exigirAcessoRegistro(req, "lancamentos", b.lancamento_id);
    if (negado) return negado;
    const { data: t } = await sb.from("lancamentos").select("*").eq("id", b.lancamento_id).maybeSingle();
    if (!t) return erro("Título não encontrado.", 404);

    if (b.acao === "pagar_titulo") {
      if (t.tipo !== "pagar" || !["em_aberto", "vencido", "vencendo"].includes(t.status)) return erro("Só título a pagar em aberto pode ir para o cartão.");
      if ((t.moeda ?? "BRL") !== "BRL") return erro("Título em dólar ou em sacas não vai para o cartão.");
      if (Number(t.valor_pago ?? 0) > 0 || t.lote_id || t.conciliado) return erro("Título com pagamento parcial, em borderô ou conciliado não vai para o cartão.");
      if (!b.cartao_id) return erro("Escolha o cartão.");
      const dataCompra = b.data_compra && /^\d{4}-\d{2}-\d{2}$/.test(b.data_compra) ? b.data_compra : new Date().toISOString().slice(0, 10);
      const { data: cartao } = await sb.from("cartoes_credito").select("*").eq("id", b.cartao_id).maybeSingle();
      if (!cartao) return erro("Cartão não encontrado.", 404);
      const contaId = await contaDaFazenda(sb, t.fazenda_id);
      if (cartao.conta_id && contaId && cartao.conta_id !== contaId) return erro("Esse cartão é de outro cliente.", 403);
      // Fatura da data da compra; se ela já fechou (ou foi paga), a compra entra na próxima
      let comp = competenciaFatura(cartao as CartaoBasico, dataCompra);
      let fat: { id: string; status: string; mes: number; ano: number } | null = null;
      for (let i = 0; i < 6; i++) {
        try { fat = await faturaDaCompetencia(sb, cartao as CartaoBasico, comp.mes, comp.ano, contaId ?? cartao.conta_id, t.fazenda_id); }
        catch { fat = null; }
        if (fat && fat.status === "aberta") break;
        comp = competenciaSeguinte(comp.mes, comp.ano);
      }
      if (!fat || fat.status !== "aberta") return erro("Nenhuma fatura aberta encontrada para esse cartão.");
      const { error } = await sb.from("lancamentos").update({
        status: "cartao", cartao_id: cartao.id, fatura_cartao_id: fat.id, forma_pagamento: "Cartão de Crédito",
        observacao: [t.observacao, `Pago com cartão ${cartao.titular ?? ""} em ${dataCompra.split("-").reverse().join("/")}`].filter(Boolean).join(" · "),
      }).eq("id", t.id).in("status", ["em_aberto", "vencido", "vencendo"]);
      if (error) return erro(error.message, 500);
      return NextResponse.json({ ok: true, fatura: `${String(fat.mes).padStart(2, "0")}/${fat.ano}` });
    }

    if (b.acao === "estornar_titulo") {
      if (t.status !== "cartao" || !t.fatura_cartao_id) return erro("Este título não está no cartão.");
      if (!b.modo) return erro("Confirme como o estorno aconteceu.");
      const feito = await aplicarEstornoCartao(sb, t, b.modo, { valor: b.valor, mes: b.mes, ano: b.ano, data_reembolso: b.data_reembolso, observacao: b.observacao });
      return NextResponse.json({ ok: true, feito });
    }

    return erro("Ação inválida");
  } catch (e) {
    return erro(e instanceof Error ? e.message : String(e), 500);
  }
}
