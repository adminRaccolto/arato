// Vínculos que o estorno/exclusão de uma NF de entrada precisa desfazer além do estoque e do CP (29/10/2026):
//  1. NF de RETORNO de armazém: o processamento registrou o retorno na(s) remessa(s) (lista de retornos, "já voltou",
//     status Retornada) e tirou a mercadoria do depósito do armazém. Achado real: NF 14647 estornada continuava ligada
//     à remessa 3125 (R$ 64.998 a mais em "já voltou").
//  2. NF de REMESSA de entrega futura: a baixa do saldo de terceiro (faturamento/VEF) volta ao saldo (Seção 387).
//  3. NF de FATURAMENTO (VEF) com remessas já recebidas: não pode ser estornada antes das remessas.
import type { SupabaseClient } from "@supabase/supabase-js";
import { statusSaldoVef } from "../estoque/entrega-futura";

type Remessa = { id: string; fazenda_id: string; status: string; valor_total: number | null; valor_retornado: number | null; itens_json: unknown;
  retornos: { numero: string; chave?: string | null; data?: string | null; valor: number; emitente?: string | null }[] | null;
  nf_retorno_chave: string | null; nf_retorno_numero: string | null; deposito_terceiro_id: string | null; destinatario_nome: string; observacao: string | null };

const r2 = (n: number) => Math.round(n * 100) / 100;
const valorRemetido = (r: Remessa) => {
  const its = Array.isArray(r.itens_json) ? (r.itens_json as { valor_total?: number }[]) : [];
  const s = its.reduce((t, i) => t + Number(i.valor_total ?? 0), 0);
  return s > 0 ? s : Number(r.valor_total ?? 0);
};

/** Mensagem se a NF é faturamento de entrega futura com remessas já recebidas (estorne as remessas antes). */
export async function bloqueioVefComRemessas(sb: SupabaseClient, nfId: string): Promise<string | null> {
  const { data, error } = await sb.from("estoque_terceiros_baixas").select("remessa_nf_entrada_id").eq("vef_nf_entrada_id", nfId);
  if (error || !data?.length) return null;
  const ids = [...new Set(data.map(d => d.remessa_nf_entrada_id as string))];
  const { data: nfs } = await sb.from("nf_entradas").select("numero").in("id", ids);
  return `Esta NF é o faturamento de uma compra para entrega futura e já tem remessa(s) recebida(s) (NF ${(nfs ?? []).map(n => n.numero).join(", ")}). Estorne as remessas antes.`;
}

/** Desfaz o que a NF fez em remessas de armazém (retorno) e em saldos de entrega futura (remessa). Devolve um resumo. */
export async function desfazerVinculosDaNf(sb: SupabaseClient, nf: { id: string; numero: string | null; chave_acesso: string | null; fazenda_id: string }): Promise<string[]> {
  const feito: string[] = [];
  // 1. Retorno de armazém: tira esta NF das remessas que ela devolveu
  const chave = (nf.chave_acesso ?? "").replace(/\D/g, "") || null;
  const { data: fz } = await sb.from("fazendas").select("conta_id").eq("id", nf.fazenda_id).maybeSingle();
  const { data: rems } = fz?.conta_id
    ? await sb.from("nf_remessas_logisticas").select("*").eq("conta_id", fz.conta_id)
    : await sb.from("nf_remessas_logisticas").select("*").eq("fazenda_id", nf.fazenda_id);
  for (const rem of (rems ?? []) as Remessa[]) {
    const lista = rem.retornos ?? [];
    const meus = lista.filter(x => (chave && x.chave === chave) || (!x.chave && !chave && x.numero === nf.numero));
    if (!meus.length) continue;
    const resto = lista.filter(x => !meus.includes(x));
    const retornado = r2(Math.max(0, Number(rem.valor_retornado ?? 0) - meus.reduce((t, x) => t + Number(x.valor ?? 0), 0)));
    const ultimo = resto[resto.length - 1];
    const ehOUltimo = (chave && rem.nf_retorno_chave === chave) || rem.nf_retorno_numero === nf.numero;
    await sb.from("nf_remessas_logisticas").update({
      retornos: resto, valor_retornado: retornado,
      status: rem.status === "retornada" && retornado < valorRemetido(rem) - 0.01 ? "emitida" : rem.status,
      ...(ehOUltimo ? { nf_retorno_chave: ultimo?.chave ?? null, nf_retorno_numero: ultimo?.numero ?? null, nf_retorno_data: ultimo?.data ?? null } : {}),
      observacao: [rem.observacao, `Retorno NF ${nf.numero} estornado`].filter(Boolean).join(" | "),
    }).eq("id", rem.id);
    // Saída do depósito do armazém lançada pelo retorno desta NF
    if (rem.deposito_terceiro_id) {
      const motivo = `Retorno NF ${nf.numero} ← ${rem.destinatario_nome}`.slice(0, 200);
      await sb.from("movimentacoes_estoque").delete().eq("deposito_id", rem.deposito_terceiro_id).eq("tipo", "saida").eq("motivo", motivo).is("nf_entrada_id", null);
    }
    feito.push(`retorno tirado da remessa`);
  }
  // 2. Remessa de entrega futura: devolve ao faturamento o que esta NF baixou
  const { data: baixas, error: eB } = await sb.from("estoque_terceiros_baixas").select("id, estoque_terceiro_id, quantidade").eq("remessa_nf_entrada_id", nf.id);
  if (!eB && baixas?.length) {
    for (const b of baixas) {
      const { data: et } = await sb.from("estoque_terceiros").select("id, quantidade_saldo, quantidade_original").eq("id", b.estoque_terceiro_id).maybeSingle();
      if (!et) continue;
      const saldo = Math.min(Number(et.quantidade_original), Math.round((Number(et.quantidade_saldo) + Number(b.quantidade)) * 10000) / 10000);
      await sb.from("estoque_terceiros").update({ quantidade_saldo: saldo, status: statusSaldoVef(Number(et.quantidade_original), saldo) }).eq("id", et.id);
    }
    await sb.from("estoque_terceiros_baixas").delete().eq("remessa_nf_entrada_id", nf.id);
    feito.push("saldo de entrega futura devolvido ao faturamento");
  }
  return feito;
}
