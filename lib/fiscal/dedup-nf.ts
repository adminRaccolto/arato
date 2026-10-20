/**
 * Plano de limpeza de NFs de entrada duplicadas (função pura — o servidor só busca os dados e executa o plano).
 *
 * Duplicada = mesma chave de acesso OU mesmo número + série + CNPJ do fornecedor (quando as duas cópias têm chave, a chave decide).
 * Segurança: NF processada nunca é removida; só sai cópia PENDENTE sem vínculo (título, pedido, estoque).
 * Em cada grupo fica a melhor cópia: processada > com vínculo > em fazenda da conta > a mais antiga.
 */
export type NfDup = {
  id: string; numero: string | null; serie: string | null; chave_acesso: string | null; emitente_cnpj: string | null;
  emitente_nome?: string | null; fazenda_id: string; created_at: string; status: string;
  lancamento_id?: string | null; emp_lancamento_id?: string | null; pedido_compra_id?: string | null;
};
const dig = (s: unknown) => String(s ?? "").replace(/\D/g, "");

export function planejarLimpeza(nfs: NfDup[], comVinculo: ReadonlySet<string>, naConta: ReadonlySet<string>) {
  const ordenadas = [...nfs].sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id));
  const k2 = (n: NfDup) => `${n.numero ?? ""}|${n.serie ?? ""}|${dig(n.emitente_cnpj)}`;
  const grupoPorNumero = new Map<string, string>();
  for (const n of ordenadas) {
    const c = dig(n.chave_acesso);
    if (c.length === 44 && n.numero && dig(n.emitente_cnpj).length >= 11 && !grupoPorNumero.has(k2(n))) grupoPorNumero.set(k2(n), `c:${c}`);
  }
  const grupos = new Map<string, NfDup[]>();
  for (const n of ordenadas) {
    const c = dig(n.chave_acesso);
    let g: string;
    if (c.length === 44) g = `c:${c}`;
    else if (n.numero && dig(n.emitente_cnpj).length >= 11) g = grupoPorNumero.get(k2(n)) ?? `n:${k2(n)}`;
    else continue;
    const arr = grupos.get(g); if (arr) arr.push(n); else grupos.set(g, [n]);
  }
  const temVinculo = (n: NfDup) => comVinculo.has(n.id) || !!n.lancamento_id || !!n.emp_lancamento_id || !!n.pedido_compra_id;
  const remover: string[] = [];
  const detalhe: { grupo: string; mantida: string; removidas: string[]; mantidas_por_vinculo: string[] }[] = [];
  let gruposDuplicados = 0, mantidasPorVinculo = 0;
  for (const [g, arr] of grupos) {
    if (arr.length < 2) continue;
    gruposDuplicados++;
    const ordem = [...arr].sort((a, b) => {
      const pa = a.status === "processada" ? 0 : 1, pb = b.status === "processada" ? 0 : 1; if (pa !== pb) return pa - pb;
      const va = temVinculo(a) ? 0 : 1, vb = temVinculo(b) ? 0 : 1; if (va !== vb) return va - vb;
      const ca = naConta.has(a.fazenda_id) ? 0 : 1, cb = naConta.has(b.fazenda_id) ? 0 : 1; if (ca !== cb) return ca - cb;
      return a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id);
    });
    const manter = ordem[0];
    const candidatas = ordem.slice(1).filter(n => n.status !== "processada");
    const rem = candidatas.filter(n => !temVinculo(n));
    const presas = candidatas.filter(n => temVinculo(n));
    mantidasPorVinculo += presas.length;
    remover.push(...rem.map(n => n.id));
    detalhe.push({ grupo: g, mantida: manter.id, removidas: rem.map(n => n.id), mantidas_por_vinculo: presas.map(n => n.id) });
  }
  return { remover, gruposDuplicados, mantidasPorVinculo, detalhe };
}
