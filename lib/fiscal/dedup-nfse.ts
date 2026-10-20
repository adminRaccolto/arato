/**
 * NFS-e repetida: mesma nota = mesmo número + mesmo CNPJ/CPF do prestador (só dígitos), em qualquer fazenda da conta,
 * com a data da prestação a até 45 dias uma da outra (data digitada errada) — datas muito distantes são notas diferentes
 * (a numeração de algumas prefeituras recomeça todo ano). Número comparado sem zeros à esquerda; a série é ignorada (o SIEG grava "NFS" e a tela
 * sugere "1" — nenhuma das duas é a série real). A mesma chave/código de verificação também identifica a mesma nota.
 * Função pura: usada pelo SIEG, pelo lançamento manual e pela limpeza.
 */
export type NfseDup = {
  id: string; fazenda_id: string; numero_nf: string | null; serie?: string | null; prestador_cnpj: string | null; prestador_nome?: string | null;
  data_prestacao: string | null; chave_nfse?: string | null; status: string; created_at: string;
  lancamento_id?: string | null; pedido_compra_id?: string | null;
};
export const JANELA_DIAS_NFSE = 45;
const dig = (s: unknown) => String(s ?? "").replace(/\D/g, "");
const numNorm = (s: unknown) => String(s ?? "").trim().replace(/^0+(?=\d)/, "");
const dias = (a: string, b: string) => Math.abs(new Date(`${a.slice(0, 10)}T12:00:00`).getTime() - new Date(`${b.slice(0, 10)}T12:00:00`).getTime()) / 86400000;

export function mesmaNfse(a: NfseDup, b: NfseDup): boolean {
  if (a.id === b.id) return false;
  if (a.status === "cancelada" || b.status === "cancelada") return false;
  const ca = String(a.chave_nfse ?? "").trim(), cb = String(b.chave_nfse ?? "").trim();
  if (ca && cb && ca === cb) return true;
  const pa = dig(a.prestador_cnpj), pb = dig(b.prestador_cnpj);
  if (pa.length < 11 || pa !== pb) return false;
  if (!numNorm(a.numero_nf) || numNorm(a.numero_nf) !== numNorm(b.numero_nf)) return false;
  if (a.data_prestacao && b.data_prestacao && dias(a.data_prestacao, b.data_prestacao) > JANELA_DIAS_NFSE) return false;
  return true;
}

/** Plano de limpeza: grupos de mesma nota; fica a melhor cópia; só sai cópia PENDENTE sem vínculo (nunca processada). */
export function planejarLimpezaNfse(nfs: NfseDup[], naConta: ReadonlySet<string>) {
  const ord = [...nfs].filter(n => n.status !== "cancelada").sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id));
  // agrupamento por componentes conexos (mesmaNfse é simétrica); O(n²) só dentro de cada número
  const porNumero = new Map<string, NfseDup[]>();
  for (const n of ord) { const k = numNorm(n.numero_nf); if (!k) continue; const arr = porNumero.get(k); if (arr) arr.push(n); else porNumero.set(k, [n]); }
  const grupos: NfseDup[][] = [];
  for (const arr of porNumero.values()) {
    if (arr.length < 2) continue;
    const visto = new Set<string>();
    for (const n of arr) {
      if (visto.has(n.id)) continue;
      const comp: NfseDup[] = []; const fila = [n]; visto.add(n.id);
      while (fila.length) { const x = fila.pop()!; comp.push(x); for (const y of arr) if (!visto.has(y.id) && mesmaNfse(x, y)) { visto.add(y.id); fila.push(y); } }
      if (comp.length > 1) grupos.push(comp);
    }
  }
  const temVinculo = (n: NfseDup) => !!n.lancamento_id || !!n.pedido_compra_id;
  const remover: string[] = []; let mantidasPorVinculo = 0;
  for (const g of grupos) {
    const ordem = [...g].sort((a, b) => {
      const pa = a.status === "processada" ? 0 : 1, pb = b.status === "processada" ? 0 : 1; if (pa !== pb) return pa - pb;
      const va = temVinculo(a) ? 0 : 1, vb = temVinculo(b) ? 0 : 1; if (va !== vb) return va - vb;
      const ca = naConta.has(a.fazenda_id) ? 0 : 1, cb = naConta.has(b.fazenda_id) ? 0 : 1; if (ca !== cb) return ca - cb;
      return a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id);
    });
    const cand = ordem.slice(1).filter(n => n.status !== "processada");
    mantidasPorVinculo += cand.filter(temVinculo).length;
    remover.push(...cand.filter(n => !temVinculo(n)).map(n => n.id));
  }
  return { remover, gruposDuplicados: grupos.length, mantidasPorVinculo };
}
