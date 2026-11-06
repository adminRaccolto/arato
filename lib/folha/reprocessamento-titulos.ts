type Titulo = {
  id: string; titulo_origem_id?: string | null; valor?: number | null;
  valor_pago?: number | null; status?: string | null; lote_id?: string | null;
  conciliado?: boolean | null;
};
/** O título pago e o saldo desmembrado formam uma obrigação única na comparação com a folha. */
export function titulosParaReprocessamento<T extends Titulo>(raizes: string[], titulos: T[]): Map<string, T> {
  const mapa = new Map<string, T>();
  const centavos = (v: number) => Math.round(v * 100) / 100;
  for (const id of new Set(raizes)) {
    const raiz = titulos.find(t => t.id === id);
    const partes = titulos.filter(t => (t.id === id || t.titulo_origem_id === id) && t.status !== "cancelado");
    if (!raiz && partes.length) throw new Error("Há parcelas de salário sem o título original. Corrija o vínculo antes de reprocessar.");
    if (!raiz || !partes.length) continue;
    const paga = partes.find(t => ["baixado", "pago", "parcial"].includes(t.status ?? "") || Number(t.valor_pago ?? 0) > 0);
    mapa.set(id, { ...raiz,
      valor: centavos(partes.reduce((s, t) => s + Number(t.valor ?? 0), 0)),
      valor_pago: centavos(partes.reduce((s, t) => s + Number(t.valor_pago ?? (["baixado", "pago"].includes(t.status ?? "") ? t.valor : 0) ?? 0), 0)),
      status: paga ? (raiz.status === "baixado" ? "baixado" : "parcial") : raiz.status,
      lote_id: partes.find(t => t.lote_id)?.lote_id ?? null,
      conciliado: partes.some(t => t.conciliado),
    });
  }
  return mapa;
}
