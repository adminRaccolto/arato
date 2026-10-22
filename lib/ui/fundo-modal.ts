// Fundo escurecido de popup/modal: elemento fixo que cobre a tela e tem cor de fundo visível.
// Camadas transparentes de tela cheia (usadas para fechar menus de contexto/dropdowns) não contam.
export type MedidasFundo = { position: string; backgroundColor: string; width: number; height: number; vw: number; vh: number; temFilhos: boolean };

function alfa(cor: string): number {
  const c = cor.trim().toLowerCase();
  if (!c || c === "transparent") return 0;
  const m = c.match(/^rgba?\(([^)]+)\)$/);
  if (!m) return 1;
  const partes = m[1].split(/[\s,/]+/).filter(Boolean);
  if (partes.length < 4) return 1;
  const a = partes[3].endsWith("%") ? parseFloat(partes[3]) / 100 : parseFloat(partes[3]);
  return Number.isFinite(a) ? a : 1;
}

export function ehFundoDeModal(m: MedidasFundo): boolean {
  return m.position === "fixed" && m.temFilhos && alfa(m.backgroundColor) > 0.05
    && m.width >= m.vw * 0.9 && m.height >= m.vh * 0.9;
}
