/**
 * Plano de contas padrão × plano de cada cliente. O modelo do sistema tem fazenda_id e conta_id vazios; a operação do
 * cliente tem conta_id. Sincronizar só acrescenta o código que falta: o que o cliente já tem nunca é alterado.
 */

export type OperacaoModelo = { id: string; classificacao: string; parent_id?: string | null; fazenda_id?: string | null; conta_id?: string | null };

export function ehModelo(op: Pick<OperacaoModelo, "fazenda_id" | "conta_id">): boolean {
  return !op.fazenda_id && !op.conta_id;
}

export function operacoesFaltando<T extends OperacaoModelo>(modelos: readonly T[], codigosDoCliente: Iterable<string>): T[] {
  const ja = new Set(codigosDoCliente);
  return modelos.filter(m => !ja.has(m.classificacao));
}

/**
 * Pai de cada operação recém-criada: o modelo guarda o id do pai no próprio modelo, e no cliente o pai é a operação com
 * o mesmo código. Devolve só as ligações que dá para resolver.
 */
export function ligacoesDePai<T extends OperacaoModelo>(novos: readonly T[], modelos: readonly T[], idPorCodigoNoCliente: ReadonlyMap<string, string>): { id: string; parent_id: string }[] {
  const codigoDoModelo = new Map(modelos.map(m => [m.id, m.classificacao]));
  const out: { id: string; parent_id: string }[] = [];
  for (const n of novos) {
    if (!n.parent_id) continue;
    const codigoPai = codigoDoModelo.get(n.parent_id);
    const id = idPorCodigoNoCliente.get(n.classificacao);
    const parent_id = codigoPai ? idPorCodigoNoCliente.get(codigoPai) : undefined;
    if (id && parent_id) out.push({ id, parent_id });
  }
  return out;
}
