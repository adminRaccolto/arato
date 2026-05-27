// Utilitário de pré-visualização de impressão
// Abre uma nova aba com toolbar RacTech + botão de impressora.
// Usar em TODOS os relatórios no lugar de window.print() direto.

export type PrintOrientation = "portrait" | "landscape";

/**
 * Abre uma nova aba com pré-visualização A4 do conteúdo HTML fornecido.
 * A nova aba tem uma barra fixa com botão "Imprimir / Salvar PDF".
 *
 * @param titulo  Título do documento (aparece na toolbar e no <title>)
 * @param html    Conteúdo HTML da página (sem <html>/<head>/<body>)
 * @param orientation  "landscape" (padrão) | "portrait"
 * @param subtitulo  Subtítulo opcional exibido na toolbar
 */
export function abrirPreviewImpressao(
  titulo: string,
  html: string,
  orientation: PrintOrientation = "landscape",
  subtitulo?: string,
): void {
  const win = window.open("", "_blank");
  if (!win) {
    alert("Permita popups neste site para visualizar o documento de impressão.");
    return;
  }

  const pageSize = orientation === "landscape" ? "A4 landscape" : "A4 portrait";
  const pageWidth = orientation === "landscape" ? "297mm" : "210mm";

  win.document.write(`<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>RacTech — ${titulo}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: system-ui, -apple-system, sans-serif; background: #D1D5DB; color: #1a1a1a; }
    .rt-toolbar {
      position: sticky; top: 0; background: #1A4870;
      padding: 10px 24px; display: flex; align-items: center;
      justify-content: space-between; z-index: 100;
      box-shadow: 0 2px 8px rgba(0,0,0,.25);
    }
    .rt-toolbar-left { display: flex; flex-direction: column; gap: 1px; }
    .rt-toolbar-title { color: #fff; font-size: 14px; font-weight: 700; }
    .rt-toolbar-sub { color: rgba(255,255,255,.6); font-size: 11px; }
    .rt-btn-print {
      display: flex; align-items: center; gap: 8px;
      background: #fff; color: #1A4870; border: none;
      padding: 9px 22px; border-radius: 8px; font-size: 13px;
      font-weight: 700; cursor: pointer; flex-shrink: 0;
      transition: background .15s;
    }
    .rt-btn-print:hover { background: #f0f5fa; }
    .rt-page-wrapper { display: flex; justify-content: center; padding: 28px 20px 40px; }
    .rt-page {
      background: #fff; width: ${pageWidth};
      padding: 14mm 16mm;
      box-shadow: 0 4px 24px rgba(0,0,0,.18);
    }
    /* Ocultar elementos marcados como no-print no conteúdo clonado */
    .no-print { display: none !important; }
    @media print {
      @page { size: ${pageSize}; margin: 12mm 14mm; }
      body { background: #fff; }
      .rt-toolbar { display: none !important; }
      .rt-page-wrapper { padding: 0; }
      .rt-page { box-shadow: none; width: 100%; padding: 0; }
    }
  </style>
</head>
<body>
  <div class="rt-toolbar">
    <div class="rt-toolbar-left">
      <span class="rt-toolbar-title">RacTech — ${titulo}</span>
      ${subtitulo ? `<span class="rt-toolbar-sub">${subtitulo}</span>` : ""}
    </div>
    <button class="rt-btn-print" onclick="window.print()">
      &#128438;&nbsp; Imprimir / Salvar PDF
    </button>
  </div>
  <div class="rt-page-wrapper">
    <div class="rt-page">
      ${html}
    </div>
  </div>
</body>
</html>`);
  win.document.close();
}
