// Unidades de medida: grafias diferentes da mesma unidade e conversões seguras entre elas.
// Usado para comparar o que foi pedido (pedido de compra) com o que entrou (NF, sempre na unidade do cadastro do item).

const SINONIMOS: Record<string, string> = {
  l: "l", lt: "l", lts: "l", litro: "l", litros: "l",
  ml: "ml",
  kg: "kg", kgs: "kg", quilo: "kg", quilos: "kg",
  g: "g", gr: "g", grama: "g", gramas: "g",
  t: "t", ton: "t", tn: "t", tonelada: "t", toneladas: "t",
  un: "un", und: "un", unid: "un", unidade: "un", pc: "un", pç: "un",
  sc: "sc", saca: "sc", sacas: "sc",
  bag: "bag", bags: "bag", bg: "bag",
};

/** Unidade na grafia padrão ("LT", "Lt", "litros" → "l"; "ton" → "t"). Desconhecida volta em minúsculas. */
export function unidadePadrao(u?: string | null): string {
  const k = String(u ?? "").trim().toLowerCase();
  return SINONIMOS[k] ?? k;
}

// Fator para a unidade base de cada grandeza (massa em kg, volume em l)
const BASE: Record<string, { grandeza: "massa" | "volume"; fator: number }> = {
  g: { grandeza: "massa", fator: 0.001 }, kg: { grandeza: "massa", fator: 1 }, t: { grandeza: "massa", fator: 1000 },
  ml: { grandeza: "volume", fator: 0.001 }, l: { grandeza: "volume", fator: 1 },
};

/**
 * Quanto vale 1 unidade `de` em unidades `para` (t → kg = 1000; lt → L = 1). null quando não há conversão segura
 * (bag, saca, bombona, dose, un…: dependem do peso/volume de cada embalagem).
 */
export function fatorUnidade(de?: string | null, para?: string | null): number | null {
  const a = unidadePadrao(de), b = unidadePadrao(para);
  if (!a || !b) return null;
  if (a === b) return 1;
  const x = BASE[a], y = BASE[b];
  if (!x || !y || x.grandeza !== y.grandeza) return null;
  return x.fator / y.fator;
}
