import type { SupabaseClient } from "@supabase/supabase-js";

/** Título USD: guarda `valor` em dólar e a cotação (PTAX) usada no lançamento. */
export type TituloMoeda = { id: string; origem_tabela: string; moeda: string | null };

export const ehUSD = (moeda?: string | null) => String(moeda ?? "").toUpperCase() === "USD";

export const fmtBRLn = (v?: number | null) => (v ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
export const fmtUSDn = (v?: number | null) => `US$ ${(v ?? 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** Formata no símbolo da moeda do título (R$ ou US$). */
export const fmtNaMoeda = (v: number | null | undefined, moeda?: string | null) => (ehUSD(moeda) ? fmtUSDn(v) : fmtBRLn(v));

/** Cotação a aplicar: a do lançamento; sem ela, a PTAX corrente; sem nenhuma, null. */
export function cotacaoEfetiva(cotacaoTitulo?: number | null, ptax?: number | null): number | null {
  if (cotacaoTitulo && cotacaoTitulo > 0) return cotacaoTitulo;
  if (ptax && ptax > 0) return ptax;
  return null;
}

/** Valor em reais de um valor do título: BRL passa direto, USD multiplica pela cotação (null se não houver). */
export function valorEmReais(valor: number | null | undefined, moeda: string | null | undefined, cotacao: number | null): number | null {
  const v = valor ?? 0;
  if (!ehUSD(moeda)) return v;
  return cotacao ? Math.round(v * cotacao * 100) / 100 : null;
}

/** Busca a cotação gravada em cada título USD (rel_lancamentos não a espelha). */
export async function carregarCotacoesUSD(db: SupabaseClient, titulos: TituloMoeda[]): Promise<Map<string, number>> {
  const mapa = new Map<string, number>();
  for (const origem of ["lancamentos", "empresa_lancamentos"] as const) {
    const ids = titulos.filter(t => t.origem_tabela === origem && ehUSD(t.moeda)).map(t => t.id);
    for (let i = 0; i < ids.length; i += 200) {
      const { data, error } = await db.from(origem).select("id, cotacao_usd").in("id", ids.slice(i, i + 200));
      if (error) throw error;
      for (const r of data ?? []) if (Number(r.cotacao_usd) > 0) mapa.set(r.id as string, Number(r.cotacao_usd));
    }
  }
  return mapa;
}
