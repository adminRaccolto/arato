// Operações de banco do recebimento por carga (ver lib/contratos/recebimento-carga.ts). Rodam no servidor, com o
// cliente service role: vincular uma NF-e de venda ao contrato (CR da carga + abatimento do guarda-chuva) e desfazer.
import type { SupabaseClient } from "@supabase/supabase-js";
import { hojeLocal } from "../data-local";
import { kgSacaDoProduto, sacasDaNf, saldoGuardaChuva, valorAbatimento, vencimentoCarga, type ItemNf } from "./recebimento-carga";

const r2 = (n: number) => Math.round(n * 100) / 100;
const PAGO = new Set(["baixado", "parcial", "liquidado"]);

export type ResultadoCarga = { ok: true; cr_id: string | null; abatido: number; aviso?: string } | { ok: false; error: string };

/** Vincula a NF-e de venda (notas_fiscais, saída autorizada) ao contrato com recebimento por carga. Idempotente. */
export async function faturarCarga(sb: SupabaseClient, contratoId: string, notaId: string, valorAbatidoManual?: number | null): Promise<ResultadoCarga> {
  const { data: ja } = await sb.from("contrato_faturamentos").select("id, contrato_id, cr_lancamento_id, valor_abatido").eq("nota_fiscal_id", notaId).maybeSingle();
  if (ja) return ja.contrato_id === contratoId ? { ok: true, cr_id: ja.cr_lancamento_id, abatido: Number(ja.valor_abatido) } : { ok: false, error: "Esta NF-e já está vinculada a outro contrato." };

  const { data: c, error: eC } = await sb.from("contratos")
    .select("id, numero, fazenda_id, produto, preco, moeda, comprador, pessoa_id, ciclo_id, ano_safra_id, lancamento_cr_id, recebimento_por_carga, prazo_pagamento_dias")
    .eq("id", contratoId).maybeSingle();
  if (eC || !c) return { ok: false, error: eC?.message ?? "Contrato não encontrado." };
  if (!c.recebimento_por_carga) return { ok: false, error: "O contrato não está com recebimento por carga." };
  const { data: nf } = await sb.from("notas_fiscais").select("id, fazenda_id, numero, tipo, status, valor_total, data_emissao, itens_json, dados_nf_json").eq("id", notaId).maybeSingle();
  if (!nf) return { ok: false, error: "NF-e não encontrada." };
  if (nf.tipo !== "saida" || nf.status !== "autorizada") return { ok: false, error: "Só NF-e de saída autorizada pode ser vinculada ao contrato." };

  const valorNf = r2(Number(nf.valor_total) || 0);
  const sacas = sacasDaNf(nf.itens_json as ItemNf[], kgSacaDoProduto(c.produto));
  const abatimento = valorAbatidoManual != null && valorAbatidoManual > 0 ? r2(valorAbatidoManual) : valorAbatimento(c, sacas, valorNf);
  if (abatimento == null) return { ok: false, error: "Não consegui ler as sacas da NF (unidade dos itens) para abater do contrato em US$. Informe o valor a abater." };

  // Guarda-chuva: abate o que couber; se já foi recebido (baixado/parcial), não mexe
  let abatido = 0, aviso: string | undefined;
  const { data: guarda } = c.lancamento_cr_id
    ? await sb.from("lancamentos").select("id, valor, valor_pago, status, operacao_gerencial_id, observacao").eq("id", c.lancamento_cr_id).maybeSingle()
    : { data: null };
  if (guarda && !PAGO.has(guarda.status) && !(Number(guarda.valor_pago) > 0)) {
    const novo = saldoGuardaChuva(Number(guarda.status === "cancelado" ? 0 : guarda.valor), abatimento);
    abatido = r2(Math.min(abatimento, Number(guarda.status === "cancelado" ? 0 : guarda.valor)));
    if (novo.excedente > 0) aviso = `As cargas faturadas passaram do valor do contrato em ${novo.excedente.toFixed(2)} (${c.moeda ?? "BRL"}).`;
    const { error } = await sb.from("lancamentos").update({ valor: novo.valor, status: novo.status }).eq("id", guarda.id);
    if (error) return { ok: false, error: `Não consegui abater o CR do contrato: ${error.message}` };
  } else if (guarda) {
    aviso = "O CR do contrato já tem recebimento — o valor da carga não foi abatido dele.";
  } else {
    aviso = "O contrato não tem CR (confirme o contrato) — só o CR da carga foi criado.";
  }

  // CR da carga, pelo valor da NF
  const pessoa = c.pessoa_id ? (await sb.from("pessoas").select("nome").eq("id", c.pessoa_id).maybeSingle()).data : null;
  const comprador = (pessoa?.nome ?? c.comprador ?? "").split(" ").slice(0, 4).join(" ");
  const dataNf = String(nf.data_emissao ?? hojeLocal()).slice(0, 10);
  const { data: cr, error: eCr } = await sb.from("lancamentos").insert({
    fazenda_id: c.fazenda_id, tipo: "receber",
    descricao: `Venda — ${comprador} (Contrato ${c.numero ?? ""} · NF ${nf.numero})`,
    categoria: "Receita Grãos",
    operacao_gerencial_id: guarda?.operacao_gerencial_id ?? null,
    data_lancamento: dataNf, data_vencimento: vencimentoCarga(dataNf, c.prazo_pagamento_dias),
    valor: valorNf, moeda: "BRL", status: "em_aberto",
    contrato_id: c.id, pessoa_id: c.pessoa_id ?? null, ciclo_id: c.ciclo_id ?? null, ano_safra_id: c.ano_safra_id ?? null,
    numero_documento: nf.numero, tipo_documento_lcdpr: "NF", auto: true,
    observacao: `Carga faturada NF ${nf.numero}${sacas != null ? ` · ${sacas.toFixed(2)} sc` : ""} · abatido do contrato: ${abatido.toFixed(2)} ${c.moeda ?? "BRL"}`,
  }).select("id").single();
  if (eCr) {
    if (guarda && abatido > 0) await sb.from("lancamentos").update({ valor: r2(Number(guarda.status === "cancelado" ? 0 : guarda.valor)), status: guarda.status }).eq("id", guarda.id);
    return { ok: false, error: `CR da carga não criado: ${eCr.message}` };
  }
  const { data: fz } = await sb.from("fazendas").select("conta_id").eq("id", c.fazenda_id).maybeSingle();
  const { error: eV } = await sb.from("contrato_faturamentos").insert({
    conta_id: fz?.conta_id ?? null, fazenda_id: c.fazenda_id, contrato_id: c.id, nota_fiscal_id: nf.id,
    quantidade_sc: sacas, valor_nf: valorNf, valor_abatido: abatido, cr_lancamento_id: cr.id,
  });
  if (eV) return { ok: false, error: `Vínculo não gravado (rode a Seção 388): ${eV.message}` };
  return { ok: true, cr_id: cr.id, abatido, aviso };
}

/** Desfaz o vínculo: apaga o CR da carga (se não recebido) e devolve o abatido ao guarda-chuva. */
export async function desfazerCarga(sb: SupabaseClient, notaId: string): Promise<{ ok: boolean; mensagem?: string }> {
  const { data: v, error } = await sb.from("contrato_faturamentos").select("*").eq("nota_fiscal_id", notaId).maybeSingle();
  if (error || !v) return { ok: true };
  if (v.cr_lancamento_id) {
    const { data: cr } = await sb.from("lancamentos").select("id, status, valor_pago").eq("id", v.cr_lancamento_id).maybeSingle();
    if (cr && (PAGO.has(cr.status) || Number(cr.valor_pago) > 0))
      return { ok: false, mensagem: "O CR desta carga já tem recebimento — estorne a baixa no Contas a Receber antes de desvincular a NF do contrato." };
    if (cr) await sb.from("lancamentos").delete().eq("id", cr.id);
  }
  const { data: c } = await sb.from("contratos").select("lancamento_cr_id").eq("id", v.contrato_id).maybeSingle();
  if (c?.lancamento_cr_id && Number(v.valor_abatido) > 0) {
    const { data: g } = await sb.from("lancamentos").select("id, valor, status").eq("id", c.lancamento_cr_id).maybeSingle();
    if (g && !PAGO.has(g.status)) {
      const novo = saldoGuardaChuva(Number(g.status === "cancelado" ? 0 : g.valor), -Number(v.valor_abatido));
      await sb.from("lancamentos").update({ valor: novo.valor, status: novo.status }).eq("id", g.id);
    }
  }
  await sb.from("contrato_faturamentos").delete().eq("id", v.id);
  return { ok: true, mensagem: "NF desvinculada do contrato: CR da carga apagado e valor devolvido ao CR do contrato." };
}
