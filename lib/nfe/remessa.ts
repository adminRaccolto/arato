// Regras puras da NF de saída montada a partir de outra NF (remessa) e do emitente escolhido.
const centavos = (v: number) => Math.round(v * 100);

/**
 * Rateia o desconto do cabeçalho da NF de origem pelos itens, proporcional ao valor de cada um.
 * A base é o valor dos produtos da NF (quando informado) — assim, levar só parte dos itens leva só
 * a parte do desconto deles. Com todos os itens, a soma fecha no centavo (sobra vai no maior item).
 */
export function ratearDescontoNf(desconto: number, valorProdutos: number, valoresItens: number[]): number[] {
  const somaItens = valoresItens.reduce((s, v) => s + v, 0);
  const base = valorProdutos > 0 ? valorProdutos : somaItens;
  if (!(desconto > 0) || !(base > 0)) return valoresItens.map(() => 0);
  const rateado = valoresItens.map(v => centavos((desconto * v) / base));
  if (Math.abs(base - somaItens) < 0.01 && rateado.length) {
    const sobra = centavos(desconto) - rateado.reduce((s, v) => s + v, 0);
    const maior = valoresItens.indexOf(Math.max(...valoresItens));
    rateado[maior] += sobra;
  }
  return rateado.map(v => v / 100);
}

/** Emitente (módulo fiscal) cujo CPF/CNPJ é o do produtor — nota própria sai sempre em nome do produtor escolhido. */
export function emissorDoProdutor(cpfCnpjProdutor: string | null | undefined, emissores: { key: string }[], cfgs: Record<string, Record<string, string>>): string | null {
  const doc = (cpfCnpjProdutor ?? "").replace(/\D/g, "");
  if (!doc) return null;
  const achados = emissores.filter(e => (cfgs[e.key]?.cpf_cnpj_emitente ?? "").replace(/\D/g, "") === doc);
  return achados.length ? achados[0].key : null;
}
