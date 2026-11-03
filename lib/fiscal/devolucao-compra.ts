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
