import { centavos, GRUPOS_RESULTADO, type ItemResultado } from "./apuracao";

export const BASES_CUSTO = [
  { id: "realizado", label: "Realizado" },
  { id: "previsto", label: "Previsto" },
  { id: "total", label: "Realizado + previsto" },
] as const;
export type BaseCusto = (typeof BASES_CUSTO)[number]["id"];
export const GRUPOS_CUSTO = GRUPOS_RESULTADO.filter(
  ([grupo]) => !grupo.startsWith("receita"),
).map(([grupo, nome]) => ({
  grupo,
  nome: grupo === "deducoes" ? "Tributos e deduções" : nome,
}));
const grupos = new Set<string>(GRUPOS_CUSTO.map((g) => g.grupo));
export function itensCusto(
  itens: ItemResultado[],
  base: BaseCusto = "total",
  grupo?: string,
) {
  return itens.filter(
    (i) =>
      grupos.has(i.grupo) &&
      (!grupo || i.grupo === grupo) &&
      (base === "total" || (base === "previsto" ? !!i.previsto : !i.previsto)),
  );
}
export const efeitoNoCusto = (i: ItemResultado) =>
  i.grupo === "descontos" ? -i.valor : i.valor;
export function somaCustos(
  itens: ItemResultado[],
  base: BaseCusto = "total",
  grupo?: string,
) {
  return centavos(
    itensCusto(itens, base, grupo).reduce((s, i) => s + efeitoNoCusto(i), 0),
  );
}
export function totaisCustos(itens: ItemResultado[]) {
  const realizado = somaCustos(itens, "realizado"),
    previsto = somaCustos(itens, "previsto");
  return { realizado, previsto, total: centavos(realizado + previsto) };
}
