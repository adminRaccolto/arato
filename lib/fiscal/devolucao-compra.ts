// O que pode ser devolvido numa NF de compra. A entrega de compra para entrega futura (5116/5117, tipo "remessa") deu
// entrada no estoque, então devolve como as demais. O simples faturamento (VEF) não movimentou produto: fica de fora.
export const podeDevolverNf = (tipoEntrada: string | null | undefined) =>
  ["insumos", "pecas", "custo_direto", "imobilizado", "remessa"].includes(tipoEntrada ?? "");

export const itemDevolvivel = (i: { insumo_id?: string | null; tipo_apropiacao?: string | null }) =>
  (!!i.insumo_id && (i.tipo_apropiacao === "estoque" || i.tipo_apropiacao === "remessa")) || i.tipo_apropiacao === "direto";

// NF de onde saem os títulos a abater: a própria e, numa entrega, os simples faturamentos que ela baixou (lá está o CP).
export const nfsDosTitulos = (nfOrigemId: string, baixas: { vef_nf_entrada_id: string | null }[]) =>
  [...new Set([nfOrigemId, ...baixas.map(b => b.vef_nf_entrada_id).filter((id): id is string => !!id)])];
