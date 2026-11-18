// Relatório exportável (18/11/2026): a mesma definição gera a impressão em PDF (lib/print.ts, padrão Arato) e a planilha
// XLSX (lib/relatorios/xlsx-estilo.ts). Criado para os relatórios do Estoque, que só tinham a tela.

export type TipoColuna = "texto" | "numero" | "moeda" | "percentual" | "data";
export type ColunaExport = { rotulo: string; tipo?: TipoColuna };
export type Celula = string | number | null | undefined;

/** Uma tabela. Na impressão cada seção é um bloco com título; na planilha cada `planilha` vira uma aba. */
export type TabelaExport = { titulo?: string; colunas: ColunaExport[]; linhas: Celula[][]; total?: Celula[] };

export type RelatorioExport = {
  /** Título no cabeçalho do PDF */
  titulo: string;
  /** Tipo no nome do arquivo (nomeRelatorio): "ESTOQUE POSICAO FINANCEIRA" → ESTOQUE POSICAO FINANCEIRA_CLIENTE_DATA */
  tipoArquivo: string;
  filtros?: { rotulo: string; valor: string }[];
  orientacao?: "portrait" | "landscape";
  /** Destaques acima das tabelas na impressão (ex.: Total em estoque) */
  resumo?: { rotulo: string; valor: string }[];
  /** Tabelas da impressão */
  secoes: TabelaExport[];
  /** Abas da planilha; sem isso, cada seção vira uma aba */
  planilhas?: (TabelaExport & { nome: string })[];
};

const esc = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const dataBR = (v: string) => (/^\d{4}-\d{2}-\d{2}/.test(v) ? v.slice(0, 10).split("-").reverse().join("/") : v);

/** Valor como aparece na impressão. */
export function textoCelula(v: Celula, tipo: TipoColuna = "texto"): string {
  if (v == null || v === "") return "";
  if (typeof v === "number") {
    if (tipo === "moeda") return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
    if (tipo === "percentual") return `${v.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
    return v.toLocaleString("pt-BR", { maximumFractionDigits: 3 });
  }
  return tipo === "data" ? dataBR(v) : v;
}

const alinhamento = (tipo?: TipoColuna) => (tipo === "numero" || tipo === "moeda" || tipo === "percentual" ? "right" : "left");

function htmlTabela(t: TabelaExport): string {
  const th = t.colunas.map(c => `<th style="text-align:${alinhamento(c.tipo)};padding:4px 6px;font-size:8pt">${esc(c.rotulo)}</th>`).join("");
  const td = (l: Celula[], negrito = false) => t.colunas.map((c, i) =>
    `<td style="text-align:${alinhamento(c.tipo)};padding:3px 6px;font-size:8pt;${negrito ? "font-weight:700;" : ""}${typeof l[i] === "number" && (l[i] as number) < 0 ? "color:#B42318;" : ""}">${esc(textoCelula(l[i], c.tipo))}</td>`).join("");
  const corpo = t.linhas.length ? t.linhas.map(l => `<tr>${td(l)}</tr>`).join("") : `<tr><td colspan="${t.colunas.length}" style="padding:8px;font-size:8pt;color:#666">Nenhum registro.</td></tr>`;
  const total = t.total ? `<tfoot><tr>${td(t.total, true)}</tr></tfoot>` : "";
  const titulo = t.titulo ? `<div style="font-size:9.5pt;font-weight:700;margin:12px 0 4px">${esc(t.titulo)}</div>` : "";
  return `${titulo}<table style="width:100%;border-collapse:collapse;margin-bottom:6px"><thead><tr>${th}</tr></thead><tbody>${corpo}</tbody>${total}</table>`;
}

/** Conteúdo da impressão (vai dentro do layout de lib/print.ts). */
export function htmlRelatorio(r: RelatorioExport): string {
  const resumo = r.resumo?.length
    ? `<div style="display:flex;gap:10px;margin-bottom:10px">${r.resumo.map(x => `<div style="border:0.5px solid #DDE2EE;border-radius:6px;padding:6px 10px;background:#F4F6FA"><div style="font-size:7pt;color:#555">${esc(x.rotulo)}</div><div style="font-size:11pt;font-weight:700">${esc(x.valor)}</div></div>`).join("")}</div>`
    : "";
  return resumo + r.secoes.map(htmlTabela).join("");
}

/** Linhas da aba da planilha: chave = rótulo da coluna; número continua número (a planilha formata). */
export function linhasPlanilha(t: TabelaExport): Record<string, unknown>[] {
  const linha = (l: Celula[]) => Object.fromEntries(t.colunas.map((c, i) => {
    const v = l[i];
    return [c.rotulo, v == null ? "" : typeof v === "number" ? v : c.tipo === "data" ? dataBR(v) : v];
  }));
  return [...t.linhas.map(linha), ...(t.total ? [linha(t.total)] : [])];
}

/** Colunas numéricas que não são dinheiro (planilhaFormatada formata número como R$ por padrão). */
export const colunasSemMoeda = (t: TabelaExport) => t.colunas.filter(c => c.tipo === "numero" || c.tipo === "percentual").map(c => c.rotulo);

/** Nome de aba válido no Excel: até 31 caracteres, sem : \ / ? * [ ]. */
export const nomeAba = (n: string) => (n.replace(/[:\\/?*[\]]/g, "-").trim() || "Dados").slice(0, 31);
