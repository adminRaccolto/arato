// Uma NF de retorno pode devolver mercadoria de várias remessas (ex.: duas NF de remessa do mesmo produto para o mesmo
// armazém). O valor da NF é rateado entre as remessas escolhidas — da mais antiga para a mais nova, até o saldo de cada
// uma — e as quantidades de cada produto seguem a mesma proporção do valor (como já acontece no retorno parcial).

export type RemessaSaldo = { id: string; saldo: number; data?: string | null };
export type Alocacao = { id: string; valor: number };

const r2 = (n: number) => Math.round(n * 100) / 100;
const r4 = (n: number) => Math.round(n * 10000) / 10000;

/** Sugestão de rateio do valor do retorno: mais antiga primeiro, até o saldo de cada remessa. */
export function ratearRetorno(valorRetorno: number, remessas: RemessaSaldo[]): Alocacao[] {
  let resta = r2(valorRetorno);
  const ordem = [...remessas].sort((a, b) => (a.data ?? "").localeCompare(b.data ?? ""));
  const out = new Map<string, number>();
  for (const r of ordem) {
    const v = r2(Math.max(0, Math.min(resta, r.saldo)));
    out.set(r.id, v);
    resta = r2(resta - v);
  }
  // Sobrou (NF maior que o saldo das remessas): fica na última, para o aviso de "acima do saldo" aparecer
  if (resta > 0.005 && ordem.length) out.set(ordem[ordem.length - 1].id, r2((out.get(ordem[ordem.length - 1].id) ?? 0) + resta));
  return remessas.map(r => ({ id: r.id, valor: out.get(r.id) ?? 0 }));
}

/** Problemas do rateio: soma diferente do valor da NF, remessa acima do saldo ou sem valor. Vazio = pode confirmar. */
export function problemasRateio(valorRetorno: number, remessas: RemessaSaldo[], alocacoes: Alocacao[]): string[] {
  const erros: string[] = [];
  const soma = r2(alocacoes.reduce((s, a) => s + a.valor, 0));
  if (Math.abs(soma - r2(valorRetorno)) > 0.01) erros.push(`a soma das remessas (R$ ${soma.toFixed(2)}) é diferente do valor do retorno (R$ ${r2(valorRetorno).toFixed(2)})`);
  for (const a of alocacoes) {
    const r = remessas.find(x => x.id === a.id);
    if (!(a.valor > 0)) erros.push("toda remessa marcada precisa de um valor");
    else if (r && a.valor > r.saldo + 0.01) erros.push(`valor acima do saldo de uma remessa (saldo R$ ${r.saldo.toFixed(2)})`);
  }
  return [...new Set(erros)];
}

/** Quantidades de cada produto que voltam por remessa, na proporção do valor alocado a ela. */
export function quantidadesPorRemessa(itens: { insumo_id: string; quantidade: number }[], valorRetorno: number, alocacoes: Alocacao[]) {
  const total = alocacoes.reduce((s, a) => s + a.valor, 0) || valorRetorno || 1;
  return alocacoes.map(a => ({
    id: a.id,
    itens: itens.map(i => ({ insumo_id: i.insumo_id, quantidade: r4(i.quantidade * (a.valor / total)) })).filter(i => i.quantidade > 0),
  }));
}

/** Chaves das NF-e referenciadas no XML (<refNFe>), sem repetir. */
export function chavesReferenciadas(xml: string | null | undefined): string[] {
  return [...new Set([...(xml ?? "").matchAll(/<refNFe>(\d{44})<\/refNFe>/g)].map(m => m[1]))];
}
