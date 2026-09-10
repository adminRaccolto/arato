// Verificações do painel de alertas — compartilhadas entre app/controller/page.tsx
// e app/bi/page.tsx. Antes desta extração as duas telas mantinham cópias
// independentes da mesma lógica (rodarChecks / rodarChecksBI), com risco real de
// divergirem silenciosamente a cada correção futura.
import { supabase } from "./supabase";
import { upsertAlertaController } from "./db";

export async function rodarChecksController(fazenda_id: string): Promise<void> {
  const hoje = new Date();

  // ── Fiscal: Certificado A1 ──────────────────────────────
  try {
    const { data: config } = await supabase
      .from("configuracoes_modulo")
      .select("valor")
      .eq("fazenda_id", fazenda_id)
      .eq("modulo", "fiscal")
      .single();
    const cert = config?.valor?.cert_validade;
    if (cert) {
      const venc = new Date(cert);
      const dias = Math.ceil((venc.getTime() - hoje.getTime()) / 86400000);
      if (dias <= 30) {
        await upsertAlertaController({
          fazenda_id,
          categoria: "Fiscal",
          severidade: dias <= 7 ? "critico" : dias <= 15 ? "alto" : "medio",
          titulo: "Certificado A1 vencendo",
          descricao: `O certificado digital A1 vence em ${dias} dias (${venc.toLocaleDateString("pt-BR")}). Sem certificado válido, não é possível emitir NF-e.`,
          suggested_action: "Renove o certificado A1 junto à Autoridade Certificadora (AC).",
          check_key: "fiscal_cert_a1_vencimento",
          affected_id: fazenda_id,
          resolved_at: undefined,
          acknowledged_at: undefined,
          acknowledged_by: undefined,
        });
      }
    }
  } catch (_) { /* configuração não encontrada */ }

  // ── Financeiro: CP vencidas ─────────────────────────────
  try {
    const { data: cps } = await supabase
      .from("lancamentos")
      .select("id, descricao, valor, data_vencimento")
      .eq("fazenda_id", fazenda_id)
      .eq("tipo", "pagar")
      .eq("status", "previsto")
      .lt("data_vencimento", hoje.toISOString().slice(0, 10));

    if (cps && cps.length > 0) {
      const total = cps.reduce((s: number, l: { valor: number }) => s + (l.valor ?? 0), 0);
      await upsertAlertaController({
        fazenda_id,
        categoria: "Financeiro",
        severidade: cps.length > 3 ? "critico" : "alto",
        titulo: `${cps.length} conta${cps.length > 1 ? "s" : ""} a pagar vencida${cps.length > 1 ? "s" : ""}`,
        descricao: `Existem ${cps.length} lançamentos de débito vencidos sem baixa, totalizando R$ ${total.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}.`,
        suggested_action: "Acesse Financeiro → Contas a Pagar para registrar as baixas.",
        check_key: "financeiro_cp_vencidas",
        affected_id: fazenda_id,
        resolved_at: undefined,
        acknowledged_at: undefined,
        acknowledged_by: undefined,
      });
    }
  } catch (_) { /* tabela não encontrada */ }

  // ── Financeiro: CR vencidas ─────────────────────────────
  try {
    const { data: crs } = await supabase
      .from("lancamentos")
      .select("id, descricao, valor, data_vencimento")
      .eq("fazenda_id", fazenda_id)
      .eq("tipo", "receber")
      .eq("status", "previsto")
      .lt("data_vencimento", hoje.toISOString().slice(0, 10));

    if (crs && crs.length > 0) {
      const total = crs.reduce((s: number, l: { valor: number }) => s + (l.valor ?? 0), 0);
      await upsertAlertaController({
        fazenda_id,
        categoria: "Financeiro",
        severidade: "medio",
        titulo: `${crs.length} conta${crs.length > 1 ? "s" : ""} a receber vencida${crs.length > 1 ? "s" : ""}`,
        descricao: `Existem ${crs.length} recebíveis vencidos sem baixa, totalizando R$ ${total.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}.`,
        suggested_action: "Acesse Financeiro → Contas a Receber e verifique cada lançamento.",
        check_key: "financeiro_cr_vencidas",
        affected_id: fazenda_id,
        resolved_at: undefined,
        acknowledged_at: undefined,
        acknowledged_by: undefined,
      });
    }
  } catch (_) { /* ignora */ }

  // ── Arrendamentos: parcelas vencendo em 15 dias ─────────
  try {
    const em15 = new Date(hoje.getTime() + 15 * 86400000).toISOString().slice(0, 10);
    const { data: parcs } = await supabase
      .from("arrendamento_pagamentos")
      .select("id, arrendamento_id, data_vencimento, valor_previsto")
      .eq("fazenda_id", fazenda_id)
      .eq("status", "pendente")
      .lte("data_vencimento", em15)
      .gte("data_vencimento", hoje.toISOString().slice(0, 10));

    if (parcs && parcs.length > 0) {
      await upsertAlertaController({
        fazenda_id,
        categoria: "Arrendamentos",
        severidade: "medio",
        titulo: `${parcs.length} parcela${parcs.length > 1 ? "s" : ""} de arrendamento vencendo`,
        descricao: `Há ${parcs.length} parcela${parcs.length > 1 ? "s" : ""} de arrendamento vencendo nos próximos 15 dias.`,
        suggested_action: "Acesse Comercial → Contratos de Arrendamento → aba Pagamentos.",
        check_key: "arrendamentos_parcelas_vencendo",
        affected_id: fazenda_id,
        resolved_at: undefined,
        acknowledged_at: undefined,
        acknowledged_by: undefined,
      });
    }
  } catch (_) { /* ignora */ }

  // ── Estoque: produtos abaixo do mínimo ──────────────────
  try {
    const { data: prods } = await supabase
      .from("insumos")
      .select("id, nome, estoque, estoque_minimo")
      .eq("fazenda_id", fazenda_id)
      .not("estoque_minimo", "is", null);

    const abaixo = (prods ?? []).filter((p: { estoque: number; estoque_minimo: number }) =>
      p.estoque !== null && p.estoque_minimo !== null && p.estoque < p.estoque_minimo
    );
    if (abaixo.length > 0) {
      await upsertAlertaController({
        fazenda_id,
        categoria: "Estoque",
        severidade: "medio",
        titulo: `${abaixo.length} produto${abaixo.length > 1 ? "s" : ""} abaixo do estoque mínimo`,
        descricao: `Os seguintes produtos estão abaixo do mínimo: ${abaixo.slice(0, 3).map((p: { nome: string }) => p.nome).join(", ")}${abaixo.length > 3 ? ` e mais ${abaixo.length - 3}` : ""}.`,
        suggested_action: "Acesse Estoque → Posição para ver a lista completa e crie pedidos de compra.",
        check_key: "estoque_abaixo_minimo",
        affected_id: fazenda_id,
        resolved_at: undefined,
        acknowledged_at: undefined,
        acknowledged_by: undefined,
      });
    }
  } catch (_) { /* ignora */ }
}
