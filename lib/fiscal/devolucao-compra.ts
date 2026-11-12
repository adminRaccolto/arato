// O que pode ser devolvido numa NF de compra. A entrega de compra para entrega futura (5116/5117, tipo "remessa") deu
// entrada no estoque, então devolve como as demais. O simples faturamento (VEF) não movimentou produto: fica de fora.
export const podeDevolverNf = (tipoEntrada: string | null | undefined) =>
  ["insumos", "pecas", "custo_direto", "imobilizado", "remessa"].includes(tipoEntrada ?? "");

export const itemDevolvivel = (i: { insumo_id?: string | null; tipo_apropiacao?: string | null }) =>
  (!!i.insumo_id && (i.tipo_apropiacao === "estoque" || i.tipo_apropiacao === "remessa")) || i.tipo_apropiacao === "direto";

// IE de quem comprou, no XML da NF recebida: é por ela que a devolução sai.
export const ieDoDestinatarioNoXml = (xml: string | null | undefined): string | null =>
  xml?.match(/<dest\b[\s\S]*?<IE>\s*(\d+)\s*<\/IE>[\s\S]*?<\/dest>/)?.[1] ?? null;

export const municipioDoDestinatarioNoXml = (xml: string | null | undefined): string | null =>
  xml?.match(/<dest\b[\s\S]*?<xMun>([^<]+)<\/xMun>[\s\S]*?<\/dest>/)?.[1] ?? null;

const nomeSemAcento = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();

// IE emitente da devolução: a da NF de origem; sem ela, a única do município do comprador; senão a única do titular.
// Com várias e sem indicação, ninguém adivinha.
export function ieDaDevolucao<T extends { ie: string; municipio?: string | null }>(ies: T[], ieOrigem: string | null | undefined, municipioOrigem?: string | null): T | null {
  const dig = (ieOrigem ?? "").replace(/\D/g, "");
  const daOrigem = dig ? ies.find(i => i.ie.replace(/\D/g, "") === dig) : undefined;
  if (daOrigem) return daOrigem;
  const doMunicipio = municipioOrigem ? ies.filter(i => nomeSemAcento(i.municipio ?? "") === nomeSemAcento(municipioOrigem)) : [];
  if (doMunicipio.length === 1) return doMunicipio[0];
  return ies.length === 1 ? ies[0] : null;
}

// NF de onde saem os títulos a abater: a própria e, numa entrega, os simples faturamentos que ela baixou (lá está o CP).
export const nfsDosTitulos = (nfOrigemId: string, baixas: { vef_nf_entrada_id: string | null }[]) =>
  [...new Set([nfOrigemId, ...baixas.map(b => b.vef_nf_entrada_id).filter((id): id is string => !!id)])];

// ── Valor cheio × desconto × líquido na NF de devolução ──────────────────────────────────────────────────────────────
// A devolução repete a NF de origem: cada produto sai pelo valor cheio (vProd) com o desconto destacado (vDesc), e o
// líquido é o que volta ao produtor. Antes o líquido ia como preço do produto e o desconto sumia da nota.
// De onde vem o desconto de cada item, nesta ordem:
//   1. o XML da NF de origem (vDesc de cada <det>), quando todos os itens do sistema casam com um <det>;
//   2. o desconto do cabeçalho (nf_entradas.valor_desconto), rateado pelo valor de cada item;
//   3. a diferença entre a soma dos itens e o total da NF, quando a NF fecha abaixo da soma (NFs antigas sem o campo).
// Acréscimo no total (IPI, frete, ST) continua embutido no preço, como antes: a devolução fecha na mesma proporção da NF.

export type DetNfe = { xProd: string; qCom: number; vProd: number; vDesc: number };

const tag = (bloco: string, nome: string) => bloco.match(new RegExp(`<${nome}>([^<]*)</${nome}>`))?.[1] ?? "";

/** Produtos do XML da NF-e, na ordem dos <det>. */
export function itensDoXmlNfe(xml: string | null | undefined): DetNfe[] {
  if (!xml) return [];
  return [...xml.matchAll(/<det\b[^>]*>([\s\S]*?)<\/det>/g)].map(m => {
    const prod = m[1].match(/<prod>([\s\S]*?)<\/prod>/)?.[1] ?? "";
    return { xProd: tag(prod, "xProd").trim(), qCom: Number(tag(prod, "qCom")) || 0, vProd: Number(tag(prod, "vProd")) || 0, vDesc: Number(tag(prod, "vDesc")) || 0 };
  });
}

export type ItemOrigemValor = { id: string; descricao_nf?: string | null; descricao_produto: string; quantidade: number; valor_total: number };
export type ValorUnitDevolucao = { unitBruto: number; unitLiquido: number };
export type ValoresDevolucao = {
  porItem: Record<string, ValorUnitDevolucao>;
  fonte: "xml" | "cabecalho" | "total" | "nenhum";
  descontoNf: number;     // desconto total da NF de origem considerado
  fatorAcrescimo: number; // > 1 quando o total da NF tem acréscimo (IPI, frete, ST) embutido no preço devolvido
};

const nomeNorm = (s: string | null | undefined) => (s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/\s+/g, " ").trim();
const n = (v: unknown) => Number(v) || 0;

/** Desconto de cada item pelo XML; null se algum item não casar com um <det> (aí vale o rateio do cabeçalho). */
function descontosDoXml(itens: ItemOrigemValor[], dets: DetNfe[]): Record<string, number> | null {
  if (!dets.length) return null;
  const usados = new Set<number>();
  const out: Record<string, number> = {};
  for (const it of itens) {
    const perto = (d: DetNfe) => Math.abs(d.vProd - n(it.valor_total)) <= 0.05;
    const nomes = [nomeNorm(it.descricao_nf), nomeNorm(it.descricao_produto)].filter(Boolean);
    let idx = dets.findIndex((d, i) => !usados.has(i) && perto(d) && nomes.includes(nomeNorm(d.xProd)));
    if (idx < 0) idx = dets.findIndex((d, i) => !usados.has(i) && perto(d));
    if (idx < 0) return null;
    usados.add(idx);
    out[it.id] = dets[idx].vDesc;
  }
  return out;
}

export function valoresDaDevolucao(
  itens: ItemOrigemValor[],
  nf: { valor_total?: number | null; valor_desconto?: number | null },
  dets?: DetNfe[] | null,
): ValoresDevolucao {
  const soma = itens.reduce((s, i) => s + n(i.valor_total), 0);
  let fonte: ValoresDevolucao["fonte"] = "nenhum";
  let desc: Record<string, number> = Object.fromEntries(itens.map(i => [i.id, 0]));
  const doXml = descontosDoXml(itens, dets ?? []);
  if (doXml && Object.values(doXml).some(v => v > 0)) { desc = doXml; fonte = "xml"; }
  else if (n(nf.valor_desconto) > 0 && soma > 0) {
    desc = Object.fromEntries(itens.map(i => [i.id, n(i.valor_total) * n(nf.valor_desconto) / soma]));
    fonte = "cabecalho";
  }
  const somaLiq = itens.reduce((s, i) => s + n(i.valor_total) - desc[i.id], 0);
  const total = n(nf.valor_total);
  const r = somaLiq > 0 && total > 0 ? total / somaLiq : 1;
  if (fonte === "nenhum" && r < 0.9995) fonte = "total";
  const porItem: Record<string, ValorUnitDevolucao> = {};
  let descontoNf = 0;
  for (const it of itens) {
    const q = n(it.quantidade);
    const g = n(it.valor_total);
    const liq = (g - desc[it.id]) * r;
    // Total abaixo da soma: a diferença também é desconto (valor cheio fica o do item). Acima: acréscimo embutido no preço.
    const bruto = r > 1 ? g * r : g;
    descontoNf += bruto - liq;
    porItem[it.id] = q > 0 ? { unitBruto: bruto / q, unitLiquido: liq / q } : { unitBruto: 0, unitLiquido: 0 };
  }
  return { porItem, fonte, descontoNf: Math.round(descontoNf * 100) / 100, fatorAcrescimo: r > 1 ? r : 1 };
}

/** Item da NF-e de devolução: valor cheio por unidade + desconto do item, fechando no líquido devolvido. */
export function precoEDescontoDoItem(qtd: number, unitBruto: number, valorLiquido: number): { valor_unitario: number; valor_desconto: number } {
  const bruto = Math.round(qtd * unitBruto * 100) / 100;
  const liq = Math.round(valorLiquido * 100) / 100;
  const d = Math.round((bruto - liq) * 100) / 100;
  // Sem desconto (ou bruto menor por arredondamento): o líquido vai como preço, como antes
  if (d < 0.01 || unitBruto <= 0) return { valor_unitario: qtd > 0 ? liq / qtd : 0, valor_desconto: 0 };
  return { valor_unitario: unitBruto, valor_desconto: d };
}
