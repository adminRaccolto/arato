import type { Lancamento, PagamentoLote } from "../supabase.ts";

export type LinhaBorderoRelatorio = Lancamento & {
  bordero?: { id: string; titulos: Lancamento[]; quantidade: number; filtrado: boolean; divergente: boolean };
};
const r2 = (v: number) => Math.round((v + Number.EPSILON) * 100) / 100;
export const pagoDeTituloRelatorio = (t: Lancamento, cotacao: number) => t.valor_pago ?? (t.status === "baixado"
  ? brl(t,cotacao) + (t.valor_juros ?? 0) + (t.valor_multa ?? 0) - (t.valor_desconto ?? 0) : 0);
const brl = (t: Lancamento, cotacao: number) => t.valor * (t.moeda === "USD" ? t.cotacao_usd ?? cotacao : 1);

/** Aplica a data do documento de pagamento sem perder os demais atributos usados nos filtros. */
export function datasBorderosRelatorio(titulos: Lancamento[], borderos: PagamentoLote[]): Lancamento[] {
  const mapa = new Map(borderos.map(b => [b.id, b]));
  return titulos.map(t => {
    const b = t.lote_id ? mapa.get(t.lote_id) : undefined;
    return b ? { ...t, data_vencimento: b.data_vencimento || t.data_vencimento,
      data_baixa: b.data_pagamento || t.data_baixa, conta_bancaria: b.conta_bancaria || t.conta_bancaria } : t;
  });
}

/** Um agrupador ocupa a linha das contas selecionadas; detalhes não entram novamente nos totais.
 * Filtros de OG/produtor/fornecedor continuam sendo aplicados aos títulos reais antes de agrupá-los.
 */
export function agruparBorderosRelatorio(filtrados: Lancamento[], todos: Lancamento[], borderos: PagamentoLote[], cotacao: number): LinhaBorderoRelatorio[] {
  const mapa = new Map(borderos.map(b => [b.id, b]));
  const composicao = new Map<string, Lancamento[]>();
  const selecionados = new Map<string, Lancamento[]>();
  const adicionar = (mapa: Map<string,Lancamento[]>, id: string, titulo: Lancamento) => {
    const lista=mapa.get(id); if(lista) lista.push(titulo); else mapa.set(id,[titulo]);
  };
  for (const t of todos) if (t.lote_id) adicionar(composicao,t.lote_id,t);
  for (const t of filtrados) if (t.lote_id && mapa.has(t.lote_id)) adicionar(selecionados,t.lote_id,t);
  const saida: LinhaBorderoRelatorio[] = [];
  const vistos = new Set<string>();
  for (const t of filtrados) {
    const b = t.lote_id ? mapa.get(t.lote_id) : undefined;
    if (!b) { saida.push(t); continue; }
    if (vistos.has(b.id)) continue;
    vistos.add(b.id);
    const itens = selecionados.get(b.id)!;
    const todosItens = composicao.get(b.id) ?? itens;
    const filtrado = itens.length !== todosItens.length;
    const valor = r2(itens.reduce((s, i) => s + brl(i, cotacao), 0));
    const pago = r2(itens.reduce((s, i) => s + pagoDeTituloRelatorio(i,cotacao), 0));
    const juros = r2(itens.reduce((s, i) => s + (i.valor_juros ?? 0), 0));
    const multa = r2(itens.reduce((s, i) => s + (i.valor_multa ?? 0), 0));
    const desconto = r2(itens.reduce((s, i) => s + (i.valor_desconto ?? 0), 0));
    const principal = r2(pago - juros - multa + desconto);
    const unico = <K extends keyof Lancamento>(campo: K): Lancamento[K] | undefined => itens.every(i => i[campo] === itens[0][campo]) ? itens[0][campo] : undefined;
    const detalhes = itens.map(i => `${i.numero_documento || i.nfe_numero || i.descricao}: R$ ${brl(i,cotacao).toFixed(2)}; pago R$ ${pagoDeTituloRelatorio(i,cotacao).toFixed(2)}`).join(" | ");
    const divergente = Math.abs(r2(todosItens.reduce((s, i) => s + brl(i,cotacao),0))-b.valor_total)>0.01;
    saida.push({ ...t, id:`bordero:${b.id}`, moeda:"BRL", cotacao_usd:1,
      descricao:`Borderô ${b.numero_titulo || b.descricao || b.id.slice(0,8)}${filtrado ? " (itens filtrados)" : ""}`,
      numero_documento:b.numero_titulo || "Borderô", nfe_numero:undefined,
      valor,valor_pago:pago,valor_juros:juros,valor_multa:multa,valor_desconto:desconto,
      status:principal >= valor ? "baixado" : principal > 0 ? "parcial" : "em_aberto",
      data_vencimento:b.data_vencimento || itens.map(i=>i.data_vencimento).filter(Boolean).sort()[0],
      data_baixa:b.data_pagamento || undefined,conta_bancaria:b.conta_bancaria || unico("conta_bancaria"),
      produtor_id:unico("produtor_id"),empresa_id:unico("empresa_id"),pessoa_id:unico("pessoa_id"),
      categoria:unico("categoria") ?? "Diversas",operacao_gerencial_id:unico("operacao_gerencial_id"),
      forma_pagamento:"Borderô",observacao:detalhes,
      bordero:{id:b.id,titulos:itens,quantidade:todosItens.length,filtrado,divergente},
    });
  }
  return saida;
}
