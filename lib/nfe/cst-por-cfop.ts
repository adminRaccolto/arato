/**
 * lib/nfe/cst-por-cfop.ts
 * Fonte ÚNICA da regra de CST do ICMS por CFOP na NF-e, usada pelo gerador do XML (lib/nfe/builder.ts)
 * e por todas as telas/impressões — antes cada tela tinha sua própria cópia ("0/51" pra todo CFOP 5xxx)
 * e a DANFE reimpressa/preview voltava a mostrar CST 51 em transferência.
 *
 * Regra do dono (especialista fiscal): TRANSFERÊNCIA entre estabelecimentos do mesmo titular →
 * CST 41 (não tributado). CST 51 (diferido, Decreto MT 4.540/2004) é da VENDA interna.
 */
export const CFOPS_TRANSFERENCIA = new Set(["5151", "6151", "5152", "6152", "5409", "6409", "5410", "6410", "5949", "6949"]);

export const ehTransferencia = (cfop?: string | null): boolean => CFOPS_TRANSFERENCIA.has(String(cfop ?? "").replace(/\D/g, "").slice(0, 4));

/** CST de exibição com origem (3 dígitos), como aparece na DANFE (coluna O/CST). */
export function cstExibicaoPorCfop(cfop?: string | null): string {
  const cod = String(cfop ?? "").replace(/\D/g, "");
  const p4 = cod.slice(0, 4);
  if (cod.startsWith("7")) return "041";
  if (p4 === "5905" || p4 === "6905") return "041";
  if (p4 === "5501" || p4 === "6501") return "040";
  if (CFOPS_TRANSFERENCIA.has(p4)) return "041";
  if (cod.startsWith("5") || cod.startsWith("1")) return "051";
  return "000";
}
