import type { ColDef } from "../hooks/useColunasGrid";
export const MONEY_COLUMNS = ["checkbox", "vencimento", "pessoa", "nf", "origem", "status", "valor", "saldo", "acoes"];
const WIDTHS: Record<string, number> = { vencimento: 105, pessoa: 210, nf: 95, origem: 140, status: 100, valor: 115, saldo: 115, acoes: 90 };
export function modernMoneyColumns(columns: ColDef[]): ColDef[] {
  const all = [...columns, { key: "acoes", label: "Ações", fixo: true }];
  const index = (key: string) => { const i = MONEY_COLUMNS.indexOf(key); return i < 0 ? MONEY_COLUMNS.length + columns.findIndex(c => c.key === key) : i; };
  return all.map(c => ({ ...c, largura: WIDTHS[c.key] ?? c.largura })).sort((a, b) => index(a.key) - index(b.key));
}
