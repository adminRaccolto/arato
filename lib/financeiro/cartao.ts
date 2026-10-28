// Cartão de Crédito no Contas a Pagar — regras puras e operações com o banco (cliente passado como parâmetro, para
// servir tanto à tela quanto às rotas com service role).
//
// Título "no cartão" = status 'cartao' + fatura_cartao_id: não é saldo do fornecedor nem saída do banco; o dinheiro só
// sai ao pagar a fatura. Estorno de compra no cartão depende da fatura:
//  - aberta: a operadora ainda não cobrou → dá para retirar o título da fatura;
//  - fechada/paga: já foi cobrado → o estorno vem como CRÉDITO numa fatura seguinte (título 'receber' no cartão, que
//    abate o total — Seção 385) ou como REEMBOLSO em dinheiro (Contas a Receber em aberto).
import type { SupabaseClient } from "@supabase/supabase-js";

export type CartaoBasico = { id: string; titular?: string | null; dia_fechamento: number; dia_vencimento: number; conta_id?: string | null; fazenda_id?: string | null };
export type ModoEstornoCartao = "retirar" | "credito" | "reembolso";

/** Competência (mês/ano) da fatura em que entra uma compra feita em `dataCompra`. */
export function competenciaFatura(cartao: Pick<CartaoBasico, "dia_fechamento">, dataCompra: string): { mes: number; ano: number } {
  const d = new Date(dataCompra + "T12:00:00");
  if (d.getDate() <= cartao.dia_fechamento) return { mes: d.getMonth() + 1, ano: d.getFullYear() };
  const prox = new Date(d.getFullYear(), d.getMonth() + 1, 1);
  return { mes: prox.getMonth() + 1, ano: prox.getFullYear() };
}

/** Datas de fechamento (no mês da competência) e vencimento (no mês seguinte). */
export function datasCompetencia(cartao: Pick<CartaoBasico, "dia_fechamento" | "dia_vencimento">, mes: number, ano: number) {
  const diaFech = Math.min(cartao.dia_fechamento, new Date(ano, mes, 0).getDate());
  const dataFechamento = `${ano}-${String(mes).padStart(2, "0")}-${String(diaFech).padStart(2, "0")}`;
  const mesVenc = mes === 12 ? 1 : mes + 1;
  const anoVenc = mes === 12 ? ano + 1 : ano;
  const diaVenc = Math.min(cartao.dia_vencimento, new Date(anoVenc, mesVenc, 0).getDate());
  const dataVencimento = `${anoVenc}-${String(mesVenc).padStart(2, "0")}-${String(diaVenc).padStart(2, "0")}`;
  return { dataFechamento, dataVencimento };
}

/** Competência seguinte a uma dada (crédito de estorno entra na próxima fatura, por padrão). */
export function competenciaSeguinte(mes: number, ano: number) {
  return mes === 12 ? { mes: 1, ano: ano + 1 } : { mes: mes + 1, ano };
}

/** O que o usuário pode escolher ao estornar uma compra no cartão, conforme a situação da fatura. */
export function modosEstornoPermitidos(statusFatura: string | null | undefined): ModoEstornoCartao[] {
  return statusFatura === "aberta" ? ["retirar", "credito", "reembolso"] : ["credito", "reembolso"];
}

/** Obtém (ou cria) a fatura da competência do cartão. Fatura já paga não recebe lançamento novo. */
export async function faturaDaCompetencia(sb: SupabaseClient, cartao: CartaoBasico, mes: number, ano: number, contaId: string, fazendaId: string) {
  const { dataFechamento, dataVencimento } = datasCompetencia(cartao, mes, ano);
  const { data: ja } = await sb.from("faturas_cartao").select("*").eq("cartao_id", cartao.id).eq("mes", mes).eq("ano", ano).maybeSingle();
  if (ja) {
    if (ja.status === "paga") throw new Error(`A fatura ${String(mes).padStart(2, "0")}/${ano} deste cartão já foi paga — escolha outra.`);
    return ja as { id: string; status: string; mes: number; ano: number };
  }
  const { data, error } = await sb.from("faturas_cartao").insert({
    cartao_id: cartao.id, conta_id: contaId, fazenda_id: fazendaId, mes, ano, data_fechamento: dataFechamento, data_vencimento: dataVencimento,
  }).select("*").single();
  if (error) throw error;
  return data as { id: string; status: string; mes: number; ano: number };
}

const r2 = (n: number) => Math.round(n * 100) / 100;

export async function contaDaFazenda(sb: SupabaseClient, fazendaId: string) {
  const { data } = await sb.from("fazendas").select("conta_id").eq("id", fazendaId).maybeSingle();
  return (data?.conta_id as string | null) ?? null;
}

/** Aplica o estorno de uma compra no cartão (usado aqui e no estorno da NF). Devolve a descrição do que foi feito. */
export async function aplicarEstornoCartao(sb: SupabaseClient, t: Record<string, unknown>, modo: ModoEstornoCartao,
  opts: { valor?: number; mes?: number; ano?: number; data_reembolso?: string; observacao?: string; manterTitulo?: boolean }): Promise<string> {
  const { data: fat } = await sb.from("faturas_cartao").select("id, status, mes, ano, cartao_id").eq("id", t.fatura_cartao_id as string).maybeSingle();
  if (!fat) throw new Error("Fatura do título não encontrada.");
  if (!modosEstornoPermitidos(fat.status as string).includes(modo))
    throw new Error("A fatura deste título já fechou ou foi paga: a operadora já cobrou. Escolha crédito em fatura seguinte ou reembolso em dinheiro.");
  const valor = r2(opts.valor && opts.valor > 0 ? Math.min(opts.valor, Number(t.valor)) : Number(t.valor));
  const obs = [opts.observacao?.trim(), `Estorno da compra no cartão: ${t.descricao ?? ""}`].filter(Boolean).join(" · ");

  if (modo === "retirar") {
    if (opts.manterTitulo === false) return "retirado da fatura";
    const hoje = new Date().toISOString().slice(0, 10);
    const { error } = await sb.from("lancamentos").update({
      status: (t.data_vencimento as string) < hoje ? "vencido" : "em_aberto", cartao_id: null, fatura_cartao_id: null,
    }).eq("id", t.id as string);
    if (error) throw error;
    return "retirado da fatura e devolvido ao Contas a Pagar em aberto";
  }
  const base = {
    fazenda_id: t.fazenda_id, tipo: "receber", moeda: "BRL", valor, pessoa_id: t.pessoa_id ?? null,
    operacao_gerencial_id: t.operacao_gerencial_id ?? null, ano_safra_id: t.ano_safra_id ?? null, ciclo_id: t.ciclo_id ?? null,
    centro_custo_id: t.centro_custo_id ?? null, produtor_id: t.produtor_id ?? null, categoria: "Estorno de compra no cartão",
    auto: true, natureza: "real", observacao: `${obs} (título ${String(t.id).slice(0, 8)})`,
  };
  if (modo === "credito") {
    const { data: cartao } = await sb.from("cartoes_credito").select("*").eq("id", fat.cartao_id as string).maybeSingle();
    if (!cartao) throw new Error("Cartão do título não encontrado.");
    const comp = opts.mes && opts.ano ? { mes: opts.mes, ano: opts.ano } : competenciaSeguinte(fat.mes as number, fat.ano as number);
    const contaId = await contaDaFazenda(sb, t.fazenda_id as string);
    const destino = await faturaDaCompetencia(sb, cartao as CartaoBasico, comp.mes, comp.ano, contaId ?? (cartao.conta_id as string), t.fazenda_id as string);
    if (destino.id === fat.id) throw new Error("O crédito precisa ir para uma fatura seguinte, não para a mesma.");
    if (destino.status !== "aberta") throw new Error(`A fatura ${String(comp.mes).padStart(2, "0")}/${comp.ano} já fechou — escolha uma fatura ainda aberta para o crédito.`);
    const { error } = await sb.from("lancamentos").insert({
      ...base, descricao: `Crédito de estorno no cartão — ${t.descricao ?? ""}`.slice(0, 200), status: "cartao",
      cartao_id: cartao.id, fatura_cartao_id: destino.id, data_lancamento: new Date().toISOString().slice(0, 10),
      data_vencimento: new Date().toISOString().slice(0, 10), origem_lancamento: "cartao_fatura", forma_pagamento: "Cartão de Crédito",
    });
    if (error) throw error;
    return `crédito de R$ ${valor.toFixed(2).replace(".", ",")} lançado na fatura ${String(comp.mes).padStart(2, "0")}/${comp.ano}`;
  }
  // reembolso em dinheiro
  const venc = opts.data_reembolso && /^\d{4}-\d{2}-\d{2}$/.test(opts.data_reembolso) ? opts.data_reembolso : new Date().toISOString().slice(0, 10);
  const { error } = await sb.from("lancamentos").insert({
    ...base, descricao: `Reembolso de compra no cartão — ${t.descricao ?? ""}`.slice(0, 200), status: "em_aberto",
    data_lancamento: new Date().toISOString().slice(0, 10), data_vencimento: venc, origem_lancamento: "manual",
  });
  if (error) throw error;
  return `reembolso de R$ ${valor.toFixed(2).replace(".", ",")} lançado no Contas a Receber (vence ${venc.split("-").reverse().join("/")})`;
}
