/**
 * Planilha XLSX formatada (30/10/2026): o `xlsx` comum ignora estilos, então cabeçalho em negrito/cor não saía.
 * `xlsx-js-style` é a mesma API do SheetJS com estilos de célula. Uso:
 *   const XLSX = await import("xlsx-js-style");
 *   const ws = planilhaFormatada(XLSX, linhas, { horas: ["HE 50% (h)"], totalNaUltima: true });
 */
import type * as XLSXStyle from "xlsx-js-style";

type Lib = typeof XLSXStyle;
export type OpcoesPlanilha = {
  /** Colunas numéricas que não são dinheiro (quantidade, horas): formato 0,00 sem R$. */
  horas?: string[];
  /** Última linha é o TOTAL: em negrito, com fundo. */
  totalNaUltima?: boolean;
  /** Colunas de texto com largura fixa (wch). As demais são calculadas pelo conteúdo. */
  larguras?: Record<string, number>;
};

const AZUL = "1A4870";
const BORDA = { style: "thin", color: { rgb: "DDE2EE" } } as const;
export const FORMATO_MOEDA = '"R$" #,##0.00;[Red]-"R$" #,##0.00';
export const FORMATO_NUM = "#,##0.00";

export function planilhaFormatada(XLSX: Lib, linhas: Record<string, unknown>[], op: OpcoesPlanilha = {}) {
  const ws = XLSX.utils.json_to_sheet(linhas);
  const cab = Object.keys(linhas[0] ?? {});
  const ref = XLSX.utils.decode_range(ws["!ref"] ?? "A1");
  const horas = new Set(op.horas ?? []);
  for (let c = 0; c <= ref.e.c; c++) {
    const nome = cab[c];
    for (let r = 0; r <= ref.e.r; r++) {
      const cel = ws[XLSX.utils.encode_cell({ r, c })];
      if (!cel) continue;
      if (r === 0) {
        cel.s = { font: { bold: true, color: { rgb: "FFFFFF" } }, fill: { fgColor: { rgb: AZUL } },
          alignment: { vertical: "center", horizontal: "center", wrapText: true }, border: { top: BORDA, bottom: BORDA, left: BORDA, right: BORDA } };
        continue;
      }
      const total = op.totalNaUltima && r === ref.e.r;
      if (cel.t === "n") cel.z = horas.has(nome) ? FORMATO_NUM : FORMATO_MOEDA;
      cel.s = { border: { bottom: BORDA },
        ...(total ? { font: { bold: true }, fill: { fgColor: { rgb: "D5E8F5" } } } : r % 2 === 0 ? { fill: { fgColor: { rgb: "F4F6FA" } } } : {}),
        ...(cel.t === "n" ? { alignment: { horizontal: "right" } } : {}) };
    }
  }
  // largura: o maior entre o cabeçalho e os valores (texto como aparece; número com R$ e milhar)
  ws["!cols"] = cab.map(nome => {
    if (op.larguras?.[nome]) return { wch: op.larguras[nome] };
    const maior = linhas.reduce((m, l) => {
      const v = l[nome];
      const txt = typeof v === "number" ? v.toLocaleString("pt-BR", { minimumFractionDigits: 2 }) + "   " : String(v ?? "");
      return Math.max(m, txt.length);
    }, 0);
    return { wch: Math.min(45, Math.max(10, maior + 2, Math.ceil(nome.length * 0.9))) };
  });
  ws["!rows"] = [{ hpt: 30 }];
  ws["!autofilter"] = { ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: Math.max(0, ref.e.r - (op.totalNaUltima ? 1 : 0)), c: ref.e.c } }) };
  return ws;
}
