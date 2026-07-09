// Utilitário de pré-visualização de impressão
// Abre uma nova aba com toolbar Arato + botão de impressora.
// Usar em TODOS os relatórios no lugar de window.print() direto.

export type PrintOrientation = "portrait" | "landscape";

export interface PrintOptions {
  orientation?: PrintOrientation;
  /** Subtítulo exibido na toolbar de pré-visualização */
  subtitulo?: string;
  /** Nome da fazenda — aparece no cabeçalho do relatório e no rodapé */
  fazenda?: string;
  /** Data de geração — padrão: agora */
  dataGeracao?: string;
}

/**
 * Abre uma nova aba com pré-visualização A4 do conteúdo HTML fornecido.
 * Gera cabeçalho e rodapé Arato automaticamente.
 *
 * @param titulo  Título do documento
 * @param html    Conteúdo HTML da área de dados (sem <html>/<head>/<body>)
 * @param opts    Opções (orientação, fazenda, subtítulo)
 *
 * Assinatura legada ainda suportada:
 *   abrirPreviewImpressao(titulo, html, orientation, subtitulo)
 */
export function abrirPreviewImpressao(
  titulo: string,
  html: string,
  optsOrOrientation?: PrintOrientation | PrintOptions,
  subtituloLegacy?: string,
): void {
  // Compatibilidade com assinatura antiga (string como 3º argumento)
  let opts: PrintOptions = {};
  if (typeof optsOrOrientation === "string") {
    opts = { orientation: optsOrOrientation, subtitulo: subtituloLegacy };
  } else if (optsOrOrientation) {
    opts = optsOrOrientation;
  }

  const orientation = opts.orientation ?? "landscape";
  const pageSize    = orientation === "landscape" ? "A4 landscape" : "A4 portrait";
  const pageWidth   = orientation === "landscape" ? "297mm" : "210mm";
  const dataGeracao = opts.dataGeracao ?? new Date().toLocaleDateString("pt-BR", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });

  const win = window.open("", "_blank");
  if (!win) {
    alert("Permita popups neste site para visualizar o documento de impressão.");
    return;
  }

  win.document.write(`<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Arato — ${titulo}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: system-ui, -apple-system, sans-serif; background: #D1D5DB; color: #1a1a1a; }

    /* ── Toolbar de pré-visualização (some no print) ── */
    .rt-toolbar {
      position: sticky; top: 0; background: #1A4870;
      padding: 10px 24px; display: flex; align-items: center;
      justify-content: space-between; z-index: 100;
      box-shadow: 0 2px 8px rgba(0,0,0,.25);
    }
    .rt-toolbar-left  { display: flex; align-items: center; gap: 14px; }
    .rt-toolbar-logo  { font-size: 17px; font-weight: 800; color: #fff; letter-spacing: -0.4px; }
    .rt-toolbar-sep   { width: 1px; height: 18px; background: rgba(255,255,255,.3); }
    .rt-toolbar-info  { display: flex; flex-direction: column; gap: 1px; }
    .rt-toolbar-title { color: #fff; font-size: 13px; font-weight: 600; }
    .rt-toolbar-sub   { color: rgba(255,255,255,.6); font-size: 11px; }
    .rt-btn-print {
      display: flex; align-items: center; gap: 8px;
      background: #fff; color: #1A4870; border: none;
      padding: 9px 22px; border-radius: 8px; font-size: 13px;
      font-weight: 700; cursor: pointer; flex-shrink: 0;
      transition: background .15s;
    }
    .rt-btn-print:hover { background: #f0f5fa; }

    /* ── Folha A4 ── */
    .rt-page-wrapper { display: flex; justify-content: center; padding: 28px 20px 40px; }
    .rt-page {
      background: #fff;
      width: ${pageWidth};
      padding: 14mm 16mm;
      box-shadow: 0 4px 24px rgba(0,0,0,.18);
    }

    /* ── Cabeçalho do relatório (dentro da folha) ── */
    .rt-rep-header {
      display: flex; justify-content: space-between; align-items: flex-end;
      border-bottom: 2px solid #1A4870; padding-bottom: 10px; margin-bottom: 16px;
    }
    .rt-rep-logo    { font-size: 24px; font-weight: 800; color: #1A4870; letter-spacing: -0.6px; line-height: 1; }
    .rt-rep-tag     { font-size: 9px; color: #888; margin-top: 2px; }
    .rt-rep-meta    { text-align: right; }
    .rt-rep-title   { font-size: 14px; font-weight: 700; color: #1a1a1a; }
    .rt-rep-fazenda { font-size: 12px; color: #555; margin-top: 3px; }
    .rt-rep-date    { font-size: 10px; color: #aaa; margin-top: 4px; }

    /* ── Rodapé do relatório ── */
    .rt-rep-footer {
      margin-top: 18px; padding-top: 8px;
      border-top: 0.5px solid #DDE2EE;
      display: flex; justify-content: space-between;
      font-size: 9px; color: #aaa;
    }

    /* Ocultar elementos marcados como no-print no conteúdo clonado */
    .no-print { display: none !important; }

    /* ── Auto-fit: tabelas largas são escaladas para caber na página ── */
    .auto-fit-table { overflow-x: hidden; }
    .auto-fit-table table { transform-origin: top left; }

    @media print {
      @page { size: ${pageSize}; margin: 10mm 12mm; }
      body { background: #fff; }
      .rt-toolbar { display: none !important; }
      .rt-page-wrapper { padding: 0; }
      .rt-page { box-shadow: none; width: 100%; padding: 0; }
    }
  </style>
  <script>
    (function () {
      function fitTables() {
        var page = document.querySelector('.rt-page');
        if (!page) return;
        var pageW = page.clientWidth || page.offsetWidth;
        page.querySelectorAll('.auto-fit-table').forEach(function (wrapper) {
          var table = wrapper.querySelector('table');
          if (!table) return;
          // Reset primeiro para medir tamanho real
          table.style.transform = '';
          wrapper.style.height = '';
          var tableW = table.scrollWidth;
          if (tableW > pageW && pageW > 0) {
            var scale = pageW / tableW;
            table.style.transform = 'scale(' + scale + ')';
            table.style.transformOrigin = 'top left';
            // Corrige a altura do wrapper (scale não afeta o flow)
            wrapper.style.height = (table.offsetHeight * scale) + 'px';
          }
        });
      }
      document.addEventListener('DOMContentLoaded', fitTables);
      window.addEventListener('resize', fitTables);
      // Garante a escala certa no momento do print
      window.addEventListener('beforeprint', fitTables);
      if (window.matchMedia) {
        window.matchMedia('print').addEventListener('change', function (e) {
          if (e.matches) fitTables();
        });
      }
    })();
  </script>
</head>
<body>
  <!-- Toolbar de pré-visualização -->
  <div class="rt-toolbar">
    <div class="rt-toolbar-left">
      <span class="rt-toolbar-logo">Arato</span>
      <span class="rt-toolbar-sep"></span>
      <div class="rt-toolbar-info">
        <span class="rt-toolbar-title">${titulo}</span>
        ${opts.subtitulo ? `<span class="rt-toolbar-sub">${opts.subtitulo}</span>` : ""}
      </div>
    </div>
    <button class="rt-btn-print" onclick="window.print()">
      &#128438;&nbsp; Imprimir / Salvar PDF
    </button>
  </div>

  <!-- Folha A4 -->
  <div class="rt-page-wrapper">
    <div class="rt-page">

      <!-- Cabeçalho do relatório -->
      <div class="rt-rep-header">
        <div>
          <div class="rt-rep-logo">Arato</div>
          <div class="rt-rep-tag">Gestão Agrícola · menos cliques, mais campo</div>
        </div>
        <div class="rt-rep-meta">
          <div class="rt-rep-title">${titulo}</div>
          ${opts.fazenda ? `<div class="rt-rep-fazenda">${opts.fazenda}</div>` : ""}
          <div class="rt-rep-date">Gerado em ${dataGeracao}</div>
        </div>
      </div>

      <!-- Conteúdo do relatório -->
      ${html}

      <!-- Rodapé do relatório -->
      <div class="rt-rep-footer">
        <span>Arato — Gestão Agrícola</span>
        <span>${opts.fazenda ?? ""}</span>
        <span>${dataGeracao}</span>
      </div>

    </div>
  </div>
</body>
</html>`);
  win.document.close();
}
