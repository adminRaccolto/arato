import type { SupabaseClient } from "@supabase/supabase-js";

export const FORMA_COMPENSACAO_FORNECEDOR = "Compensação de adiantamento a fornecedor";
export const geraMovimentoBancario = (l: { forma_pagamento?: string | null }) => l.forma_pagamento !== FORMA_COMPENSACAO_FORNECEDOR;

type Pagamento = { valor: number; valor_pago?: number | null; status: string; moeda?: string | null; cotacao_usd?: number | null; valor_desconto?: number | null; valor_juros?: number | null; valor_multa?: number | null; forma_pagamento?: string | null };
const r2 = (v: number) => Math.round(v * 100) / 100;
/** Crédito em moeda de origem. Desconto, multa e juros não são dinheiro adiantado. */
export function principalPago(p: Pagamento): number {
  if (!["baixado", "pago", "parcial"].includes(p.status) || p.forma_pagamento === FORMA_COMPENSACAO_FORNECEDOR) return 0;
  const cot = p.moeda === "USD" ? Number(p.cotacao_usd) : 1;
  if (!(cot > 0)) return 0;
  const pago = p.valor_pago == null && ["baixado", "pago"].includes(p.status) ? p.valor * cot - Number(p.valor_desconto ?? 0) : Number(p.valor_pago ?? 0);
  return r2(Math.min(Number(p.valor), Math.max(0, pago - Number(p.valor_juros ?? 0) - Number(p.valor_multa ?? 0)) / cot));
}
export function creditoPago(valor: number, aplicado: number, pagamentos: Pagamento[]): number {
  return r2(Math.max(0, Math.min(valor, pagamentos.reduce((s, p) => s + principalPago(p), 0)) - aplicado));
}

/** Enriquece o grid sem depender de novas colunas no espelho rel_lancamentos. */
export async function carregarAdiantamentosTitulos<T extends { id: string; origem_tabela: string }>(db: SupabaseClient, titulos: T[]): Promise<(T & { adiantamento_fornecedor?: boolean; pedido_compra_id?: string | null; pedido_numero?: string | null; nf_entrada_id?: string | null })[]> {
  const metadados = new Map<string, { adiantamento_fornecedor?: boolean; pedido_compra_id?: string | null; pedido_numero?: string | null; nf_entrada_id?: string | null }>();
  const ids = titulos.filter(t => t.origem_tabela === "lancamentos").map(t => t.id);
  for (let i = 0; i < ids.length; i += 150) {
    const lote = ids.slice(i, i + 150);
    const { data, error } = await db.from("lancamentos").select("id,pedido_compra_id,titulo_origem_id,nf_entrada_id").in("id", lote);
    if (error) throw error;
    const linhas = data ?? [];
    const raizes = [...new Set(linhas.map(l => l.titulo_origem_id || l.id))];
    const { data: adts, error: erroAdts } = await db.from("adiantamentos_fornecedor").select("lancamento_id,pedido_compra_id").in("lancamento_id", [...new Set([...lote, ...raizes])]);
    if (erroAdts) throw erroAdts;
    const nfIds = [...new Set(linhas.map(l => l.nf_entrada_id).filter(Boolean))];
    const { data: nfs, error: erroNfs } = nfIds.length ? await db.from("nf_entradas").select("id,pedido_compra_id").in("id", nfIds) : { data: [], error: null };
    if (erroNfs) throw erroNfs;
    const pedidos = [...new Set(linhas.map(l => {
      const a = adts?.find(a => a.lancamento_id === l.id || a.lancamento_id === l.titulo_origem_id);
      const pedido = a?.pedido_compra_id ?? l.pedido_compra_id ?? nfs?.find(n => n.id === l.nf_entrada_id)?.pedido_compra_id;
      metadados.set(l.id, { adiantamento_fornecedor: !!a, pedido_compra_id: pedido, nf_entrada_id: l.nf_entrada_id ?? null });
      return pedido;
    }).filter(Boolean))];
    if (pedidos.length) {
      const { data: ps, error: erroPs } = await db.from("pedidos_compra").select("id,nr_pedido").in("id", pedidos);
      if (erroPs) throw erroPs;
      for (const l of linhas) {
        const m = metadados.get(l.id)!;
        m.pedido_numero = ps?.find(p => p.id === m.pedido_compra_id)?.nr_pedido?.toString() ?? null;
      }
    }
  }
  return titulos.map(t => ({ ...t, ...metadados.get(t.id) }));
}

export type PagamentoAdiantamento = Pagamento & {
  id: string; titulo_origem_id?: string | null; data_baixa?: string | null; data_vencimento?: string | null;
  conta_bancaria?: string | null; lote_id?: string | null;
};
export function saldoPagamentoAdiantamento(p: Pagamento): number | null {
  if (!["em_aberto", "vencido", "vencendo", "parcial"].includes(p.status)) return 0;
  const pago = Number(p.valor_pago ?? 0);
  const cot = p.moeda === "USD" ? Number(p.cotacao_usd) : 1;
  if (pago > 0 && !(cot > 0)) return null;
  const principal = Math.max(0, pago - Number(p.valor_juros ?? 0) - Number(p.valor_multa ?? 0) + Number(p.valor_desconto ?? 0));
  return r2(Math.max(0, Number(p.valor) - (principal > 0 ? principal / cot : 0)));
}
export async function carregarPagamentosAdiantamentos<T extends { lancamento_id?: string; valor: number }>(db: SupabaseClient, adiantamentos: T[]): Promise<(T & { pagamentos: PagamentoAdiantamento[]; saldo_a_pagar: number | null })[]> {
  const ids = [...new Set(adiantamentos.map(a => a.lancamento_id).filter((id): id is string => !!id))];
  const pagamentos: PagamentoAdiantamento[] = [];
  for (let i=0; i<ids.length; i+=100) {
    const lote=ids.slice(i,i+100).join(",");
    for (let de=0;;de+=1000) {
      const { data, error } = await db.from("lancamentos")
        .select("id,titulo_origem_id,valor,valor_pago,status,moeda,cotacao_usd,valor_juros,valor_multa,valor_desconto,forma_pagamento,data_baixa,data_vencimento,conta_bancaria,lote_id")
        .or(`id.in.(${lote}),titulo_origem_id.in.(${lote})`).order("id").range(de,de+999);
      if (error) throw error;
      pagamentos.push(...(data ?? []) as PagamentoAdiantamento[]);
      if (!data || data.length<1000) break;
    }
  }
  return adiantamentos.map(a => {
    const partes = pagamentos.filter(p => p.id===a.lancamento_id || (!!a.lancamento_id && p.titulo_origem_id===a.lancamento_id));
    const saldos=partes.map(saldoPagamentoAdiantamento);
    return {...a,pagamentos:partes,saldo_a_pagar:saldos.some(s=>s===null)?null:r2(saldos.reduce<number>((v,s)=>v+(s ?? 0),0))};
  });
}
