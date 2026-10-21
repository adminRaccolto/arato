// PTAX (dólar de venda do Banco Central) de uma data. Sem cotação no dia (fim de semana/feriado), usa o dia útil anterior.
const cache = new Map<string, number | null>();

export async function ptaxDoDia(dataISO: string): Promise<number | null> {
  const chave = dataISO.slice(0, 10);
  if (cache.has(chave)) return cache.get(chave)!;
  const base = new Date(`${chave}T12:00:00`);
  if (Number.isNaN(base.getTime())) return null;
  for (let i = 0; i < 7; i++) {
    const d = new Date(base.getTime() - i * 86_400_000);
    const mm = String(d.getMonth() + 1).padStart(2, "0"), dd = String(d.getDate()).padStart(2, "0"), yyyy = d.getFullYear();
    try {
      const res = await fetch(`https://olinda.bcb.gov.br/olinda/servico/PTAX/versao/v1/odata/CotacaoDolarDia(dataCotacao=@d)?@d='${mm}-${dd}-${yyyy}'&$top=1&$format=json&$select=cotacaoVenda`, { signal: AbortSignal.timeout(6000) });
      if (!res.ok) continue;
      const json = await res.json() as { value?: { cotacaoVenda?: number }[] };
      const v = json?.value?.[0]?.cotacaoVenda;
      if (v && v > 0) { const r = Math.round(v * 10000) / 10000; cache.set(chave, r); return r; }
    } catch { /* tenta o dia anterior */ }
  }
  cache.set(chave, null);
  return null;
}

/** No navegador a consulta passa pela rota do servidor (o Banco Central pode bloquear chamada direta do navegador). */
export async function ptaxDoDiaQualquerLado(dataISO: string): Promise<number | null> {
  if (typeof window === "undefined") return ptaxDoDia(dataISO);
  const chave = dataISO.slice(0, 10);
  if (cache.has(chave)) return cache.get(chave)!;
  try {
    const r = await fetch(`/api/financeiro/ptax?data=${chave}`);
    const j = await r.json() as { ptax?: number | null };
    const v = typeof j.ptax === "number" && j.ptax > 0 ? j.ptax : null;
    cache.set(chave, v);
    return v;
  } catch { return null; }
}
