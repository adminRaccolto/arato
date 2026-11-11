// BI → Câmbio / USD: exposição cambial (o que ainda vai sair e entrar em dólar), regras puras testadas em cambio.test.ts.
//  - Títulos em USD (CP e CR) ainda em aberto: sem pagos, cancelados, de cartão e previsões; parcial conta só o que falta.
//  - Contrato de grãos em USD: se já tem título a receber/pagar ligado a ele, o título é que vale (é atualizado conforme os
//    romaneios são faturados); sem título, entra o saldo não entregue pelo item do contrato (US$ do item × fração não
//    entregue). Nunca os dois, para não contar duas vezes.
//  - Parcelas em aberto de contratos financeiros em USD (amortização + juros + despesas) são saída.

const r2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;
const num = (v: unknown) => Number(v ?? 0) || 0;

export type TituloUsd = {
  id: string; tipo: string; moeda: string; status: string; natureza?: string | null; valor: number; valor_pago?: number | null;
  data_vencimento: string; descricao?: string | null; contrato_id?: string | null; pessoas?: { nome?: string | null } | null;
};
export type ContratoUsd = {
  id: string; moeda?: string | null; status?: string | null; is_arrendamento?: boolean | null; tipo?: string | null; preco?: number | null;
  quantidade_sc?: number | null; entregue_sc?: number | null; data_pagamento?: string | null; data_entrega?: string | null;
  numero?: string | null; comprador?: string | null; produto?: string | null;
};
export type ItemContratoUsd = { contrato_id: string; moeda?: string | null; valor_total?: number | null };
export type ParcelaUsd = { contrato_id: string; data_vencimento?: string | null; status?: string | null; amortizacao?: number | null; juros?: number | null; despesas_acessorios?: number | null; num_parcela?: number | null };
export type ContratoFinUsd = { id: string; moeda?: string | null; status?: string | null; descricao?: string | null; credor?: string | null };

export type Origem = "titulo" | "contrato" | "financiamento";
export type MovUsd = { data: string; tipo: "cp" | "cr"; valor: number; desc: string; contraparte: string; origem: Origem; atraso: boolean };

const FECHADOS = new Set(["baixado", "cancelado", "cartao"]);

/** Contraparte: cadastro de pessoa; sem cadastro, o texto depois do "—" da descrição. */
export function contraparteDe(t: { pessoas?: { nome?: string | null } | null; descricao?: string | null }): string {
  const n = t.pessoas?.nome?.trim();
  if (n) return n;
  const d = String(t.descricao ?? "");
  const i = d.lastIndexOf("—");
  return (i >= 0 ? d.slice(i + 1) : d).replace(/\(.*\)\s*$/, "").trim() || "—";
}

/** Título em USD ainda em aberto? (valor que falta; zero = fora) */
export function abertoUsd(t: TituloUsd): number {
  if (t.moeda !== "USD" || FECHADOS.has(t.status) || t.natureza === "previsao") return 0;
  return Math.max(0, r2(num(t.valor) - num(t.valor_pago)));
}

export function movimentosUsd(p: {
  titulos: TituloUsd[]; contratos: ContratoUsd[]; itens: ItemContratoUsd[]; cfContratos: ContratoFinUsd[]; cfParcelas: ParcelaUsd[]; hoje: string;
}): MovUsd[] {
  const out: MovUsd[] = [];
  const atraso = (d: string) => d < p.hoje;
  for (const t of p.titulos) {
    const v = abertoUsd(t);
    if (!v || !t.data_vencimento) continue;
    out.push({ data: t.data_vencimento, tipo: t.tipo === "pagar" ? "cp" : "cr", valor: v, desc: t.descricao || "—", contraparte: contraparteDe(t), origem: "titulo", atraso: atraso(t.data_vencimento) });
  }
  // Contratos com título ligado (qualquer situação, menos cancelado) já estão representados pelos títulos
  const comTitulo = new Set(p.titulos.filter(t => t.contrato_id && t.status !== "cancelado").map(t => t.contrato_id as string));
  for (const c of p.contratos) {
    if (c.moeda !== "USD" || c.status === "cancelado" || c.status === "encerrado" || c.is_arrendamento || comTitulo.has(c.id)) continue;
    const data = c.data_pagamento || c.data_entrega;
    if (!data) continue;
    const itens = p.itens.filter(i => i.contrato_id === c.id && (i.moeda ?? "USD") === "USD");
    const qtd = num(c.quantidade_sc), entregue = num(c.entregue_sc);
    const fracao = qtd > 0 ? Math.max(0, 1 - entregue / qtd) : 1;
    // Sem item: preço por saca × quantidade guardada em kg (convenção antiga)
    const total = itens.length ? itens.reduce((s, i) => s + num(i.valor_total), 0) : num(c.preco) * qtd / 60;
    const v = r2(total * fracao);
    if (!v) continue;
    out.push({ data, tipo: c.tipo === "compra" ? "cp" : "cr", valor: v, desc: `Contrato ${c.numero ?? "—"}${c.produto ? ` — ${c.produto}` : ""} (saldo a entregar)`, contraparte: c.comprador || "—", origem: "contrato", atraso: atraso(data) });
  }
  const cfUsd = new Map(p.cfContratos.filter(c => c.moeda === "USD" && c.status !== "cancelado").map(c => [c.id, c]));
  for (const pa of p.cfParcelas) {
    const cf = cfUsd.get(pa.contrato_id);
    if (!cf || pa.status === "pago" || !pa.data_vencimento) continue;
    const v = r2(num(pa.amortizacao) + num(pa.juros) + num(pa.despesas_acessorios));
    if (!v) continue;
    out.push({ data: pa.data_vencimento, tipo: "cp", valor: v, desc: `${cf.descricao ?? "Contrato financeiro"} — parcela ${pa.num_parcela ?? ""}`.trim(), contraparte: cf.credor || cf.descricao || "—", origem: "financiamento", atraso: atraso(pa.data_vencimento) });
  }
  return out.sort((a, b) => a.data.localeCompare(b.data));
}

export type LinhaMes = { mes: string; cp: number; cr: number; saldo: number; acumulado: number };
/** Exposição por mês, com saldo acumulado (positivo = mais dólar entrando que saindo). */
export function porMesUsd(ms: MovUsd[]): LinhaMes[] {
  const m = new Map<string, { cp: number; cr: number }>();
  for (const x of ms) { const k = x.data.slice(0, 7); const e = m.get(k) ?? { cp: 0, cr: 0 }; e[x.tipo] = r2(e[x.tipo] + x.valor); m.set(k, e); }
  let ac = 0;
  return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([mes, e]) => { const saldo = r2(e.cr - e.cp); ac = r2(ac + saldo); return { mes, cp: e.cp, cr: e.cr, saldo, acumulado: ac }; });
}

export type LinhaContraparte = { nome: string; tipo: "cp" | "cr"; valor: number; titulos: number; proximo: string; atraso: number };
/** Exposição por fornecedor (CP) e por comprador/credor (CR), maiores primeiro. */
export function porContraparteUsd(ms: MovUsd[]): LinhaContraparte[] {
  const m = new Map<string, LinhaContraparte>();
  for (const x of ms) {
    const k = `${x.tipo}|${x.contraparte.toUpperCase()}`;
    const e = m.get(k) ?? { nome: x.contraparte, tipo: x.tipo, valor: 0, titulos: 0, proximo: "", atraso: 0 };
    e.valor = r2(e.valor + x.valor); e.titulos++;
    if (x.atraso) e.atraso = r2(e.atraso + x.valor);
    else if (!e.proximo || x.data < e.proximo) e.proximo = x.data;
    m.set(k, e);
  }
  return [...m.values()].sort((a, b) => b.valor - a.valor);
}

/** Datas em que sai mais dólar do que entra. */
export function datasDescasadas(ms: MovUsd[]): string[] {
  const m = new Map<string, number>();
  for (const x of ms) m.set(x.data, r2((m.get(x.data) ?? 0) + (x.tipo === "cr" ? x.valor : -x.valor)));
  return [...m.entries()].filter(([, s]) => s < 0).map(([d]) => d).sort();
}
