/**
 * Filtro por coluna do grid de CP/CR (linha de filtros sob o cabeçalho).
 * Texto: contém, sem acento nem caixa. Números: valor exato ("1500,50"), ">1000", "<1000" ou faixa "1000-2000".
 */
const sem = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

const numero = (s: string): number | null => {
  const t = s.trim().replace(/\s/g, "").replace(/^r\$|^us\$/i, "");
  if (!t) return null;
  const n = Number(t.includes(",") ? t.replace(/\./g, "").replace(",", ".") : t);
  return Number.isFinite(n) ? n : null;
};

export function casaFiltroTexto(celula: string | null | undefined, filtro: string): boolean {
  const f = sem(filtro);
  if (!f) return true;
  return sem(String(celula ?? "")).includes(f);
}

export function casaFiltroNumero(valor: number | null | undefined, filtro: string): boolean {
  const f = filtro.trim();
  if (!f) return true;
  if (valor == null) return false;
  const v = Math.round(valor * 100) / 100;
  if (f.startsWith(">")) { const n = numero(f.slice(1)); return n == null || v > n; }
  if (f.startsWith("<")) { const n = numero(f.slice(1)); return n == null || v < n; }
  const faixa = f.match(/^(.+?)\s*(?:-|a|até)\s*(.+)$/i);
  if (faixa) {
    const a = numero(faixa[1]), b = numero(faixa[2]);
    if (a != null && b != null) return v >= Math.min(a, b) && v <= Math.max(a, b);
  }
  const n = numero(f);
  return n == null ? true : Math.abs(v - n) < 0.005;
}
