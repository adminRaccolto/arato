// Padrão visual dos relatórios impressos (23/10/2026) — o mesmo do relatório de Pedidos de Compra (sintético):
// tabelas leves (cabeçalho de coluna sem faixa escura, linhas finas), totais e agrupamentos em cinza claro, caixas
// de destaque claras e a logo Arato pequena no rodapé de cada página impressa. Cada relatório mantém o próprio
// cabeçalho e os próprios campos. Usado por lib/print.ts e pelos relatórios que montam o HTML por conta própria
// (aplicarPadraoRelatorio).

/** Regras do padrão para o conteúdo dentro de .rt-conteudo. Os relatórios montam tabelas com estilos inline;
 *  o !important os traz para o padrão sem precisar reescrever cada tabela. */
export const CSS_PADRAO_RELATORIO = `
.rt-filtros{display:flex;flex-wrap:wrap;gap:6px 22px;padding:7px 0;border-bottom:0.5px solid #DDE2EE;margin:-6px 0 14px;font-size:8pt;color:#1a1a1a}
.rt-filtros b{color:#6B7A90;font-weight:600}
.rt-conteudo table{border-collapse:collapse!important}
.rt-conteudo thead tr,.rt-conteudo thead th{background:transparent!important}
.rt-conteudo th{color:#1a1a1a!important;border:none!important;border-bottom:0.5px solid #C9D1DD!important;font-weight:700!important}
.rt-conteudo td{border-left:none!important;border-right:none!important;border-top:none!important;border-bottom:0.5px solid #EEF1F6!important}
.rt-conteudo tfoot tr,.rt-conteudo tfoot td,.rt-conteudo tfoot th,
.rt-conteudo [style*="background:#1A4870"],.rt-conteudo [style*="background: #1A4870"],.rt-conteudo [style*="background:#111111"],.rt-conteudo [style*="background: #111111"],
.rt-conteudo [style*="background:#111;"],.rt-conteudo [style*="background:#0B2D50"],.rt-conteudo [style*="background:#2A2A2A"],.rt-conteudo [style*="background:#0C447C"],
.rt-conteudo [style*="background:rgb(26, 72, 112)"],.rt-conteudo [style*="background:rgb(17, 17, 17)"]{background:#F4F6FA!important;color:#1a1a1a!important}
.rt-conteudo [style*="background:#1A4870"] *,.rt-conteudo [style*="background: #1A4870"] *,.rt-conteudo [style*="background:#111111"] *,.rt-conteudo [style*="background: #111111"] *,
.rt-conteudo [style*="background:#111;"] *,.rt-conteudo [style*="background:#0B2D50"] *,.rt-conteudo [style*="background:#2A2A2A"] *,.rt-conteudo [style*="background:#0C447C"] *{color:#1a1a1a!important}
.rt-conteudo tfoot td,.rt-conteudo tfoot th{font-weight:700!important;border-top:0.5px solid #C9D1DD!important}
.rt-wrap{width:100%;border-collapse:collapse}
.rt-wrap>tbody>tr>td,.rt-wrap>tfoot>tr>td{padding:0;border:none!important}
.rt-rodape,.rt-espaco{display:none}
@media print{
  @page{margin-bottom:6mm}
  .rt-espaco{display:block;height:9mm}
  .rt-rodape{display:flex;position:fixed;bottom:0;left:0;right:0;height:7mm;justify-content:center;align-items:center;gap:5px;font-size:6pt;color:#9AA4B2;border-top:0.5px solid #E5E9F0;background:#fff}
  .rt-rodape img{height:8px}
}`;

const esc = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export function htmlFiltros(filtros: { rotulo: string; valor: string }[]): string {
  const f = filtros.filter(x => x.valor);
  return f.length ? `<div class="rt-filtros">${f.map(x => `<span><b>${esc(x.rotulo)}:</b> ${esc(x.valor)}</span>`).join("")}</div>` : "";
}

export function htmlRodapeArato(origem: string, texto = "Arato · Gestão Agrícola"): string {
  return `<div class="rt-rodape"><img src="${origem}/logo_Arato_Nova.png" alt="Arato" onerror="this.style.display='none'"><span>${esc(texto)}</span></div>`;
}

/** Abre a folha (tabela que reserva o espaço do rodapé em cada página) — fechar com FECHA_FOLHA. */
export const ABRE_FOLHA = `<table class="rt-wrap"><tfoot><tr><td><div class="rt-espaco"></div></td></tr></tfoot><tbody><tr><td class="rt-conteudo">`;
export const FECHA_FOLHA = `</td></tr></tbody></table>`;

/**
 * Aplica o padrão a um documento HTML completo já montado pelo relatório: injeta o CSS (depois do CSS do relatório,
 * para valer), envolve o conteúdo do <body> na folha com rodapé e acrescenta a logo Arato no rodapé de cada página.
 * A barra de ferramentas de pré-visualização (.rt-toolbar / .toolbar), se existir no início do body, fica fora da folha.
 */
export function aplicarPadraoRelatorio(documento: string, origem: string, textoRodape?: string): string {
  let doc = documento.includes("</head>") ? documento.replace("</head>", `<style>${CSS_PADRAO_RELATORIO}</style></head>`) : `<style>${CSS_PADRAO_RELATORIO}</style>${documento}`;
  const abre = doc.search(/<body[^>]*>/i);
  const fecha = doc.toLowerCase().lastIndexOf("</body>");
  if (abre < 0 || fecha < 0) return doc + htmlRodapeArato(origem, textoRodape);
  const fimTagBody = doc.indexOf(">", abre) + 1;
  let corpo = doc.slice(fimTagBody, fecha);
  // Mantém a barra de ferramentas (sticky na tela, escondida na impressão) fora da folha
  let toolbar = "";
  const m = corpo.match(/^\s*<div class="(?:rt-toolbar|toolbar|no-print)[^"]*"[\s\S]*?<\/div>\s*(?:<\/div>\s*)?/);
  if (m && /window\.print|Imprimir/.test(m[0])) { toolbar = m[0]; corpo = corpo.slice(m[0].length); }
  return doc.slice(0, fimTagBody) + toolbar + ABRE_FOLHA + corpo + FECHA_FOLHA + htmlRodapeArato(origem, textoRodape) + doc.slice(fecha);
}
