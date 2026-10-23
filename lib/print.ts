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
  /** Nome sugerido ao salvar o PDF (padrão TIPO_CLIENTE_INTERVALO — use nomeRelatorio) */
  nomeArquivo?: string;
  /** Linha de filtros sob o cabeçalho (ex.: [{ rotulo: "Período", valor: "01/09 a 30/09" }]) */
  filtros?: { rotulo: string; valor: string }[];
}

const dataNome = (iso?: string | null) => {
  const t = String(iso ?? "").slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(t) ? t.split("-").reverse().join("-") : t;
};

/**
 * Nome padrão dos relatórios (PDF e Excel): TIPO DE RELATÓRIO_CLIENTE_INTERVALO DE DATAS, em maiúsculas.
 * Ex.: nomeRelatorio("CP CR", "Grupo Ogliari", "2026-09-01", "2026-09-30") → "CP CR_GRUPO OGLIARI_01-09-2026 A 30-09-2026".
 * Sem datas, usa `intervalo` (ex.: "SAFRA 2025-2026") ou a data de hoje. Tira caracteres que o sistema de arquivos não aceita.
 */
export function nomeRelatorio(tipo: string, cliente?: string | null, de?: string | null, ate?: string | null, intervalo?: string): string {
  const per = intervalo
    ?? (de && ate ? `${dataNome(de)} A ${dataNome(ate)}` : de ? `A PARTIR DE ${dataNome(de)}` : ate ? `ATE ${dataNome(ate)}` : dataNome(new Date().toISOString()));
  const limpo = (t: string) => t.replace(/[\\/:*?"<>|]+/g, "-").replace(/\s*—\s*/g, " ").replace(/\s+/g, " ").trim().toUpperCase();
  return [tipo, cliente || "", per].map(limpo).filter(Boolean).join("_");
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
  const dataGeracao = opts.dataGeracao ?? new Date().toLocaleDateString("pt-BR", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });

  const win = window.open("", "_blank");
  if (!win) {
    alert("Permita popups neste site para visualizar o documento de impressão.");
    return;
  }
  win.document.write(montarHtmlImpressao(titulo, html, { ...opts, orientation }, dataGeracao, typeof window !== "undefined" ? window.location.origin : ""));
  win.document.close();
}

/** HTML completo da pré-visualização (separado de abrirPreviewImpressao para poder ser testado/renderizado fora da tela). */
export function montarHtmlImpressao(titulo: string, html: string, opts: PrintOptions, dataGeracao: string, origem: string): string {
  const orientation = opts.orientation ?? "landscape";
  const pageSize    = orientation === "landscape" ? "A4 landscape" : "A4 portrait";
  const pageWidth   = orientation === "landscape" ? "297mm" : "210mm";
  const esc = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const filtros = (opts.filtros ?? []).filter(f => f.valor);
  return (`<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${opts.nomeArquivo ?? `Arato — ${titulo}`}</title>
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

    /* ── Padrão visual dos relatórios (23/10/2026, mesmo do relatório de Pedidos de Compra): tabelas leves,
       cabeçalho de coluna sem faixa escura, totais em cinza claro. Os relatórios montam as tabelas com estilos
       próprios inline; as regras !important abaixo os trazem para o padrão sem precisar mexer em cada um. ── */
    .rt-filtros { display:flex; flex-wrap:wrap; gap:6px 22px; padding:7px 0; border-bottom:0.5px solid #DDE2EE; margin:-6px 0 14px; font-size:8pt; color:#1a1a1a; }
    .rt-filtros b { color:#6B7A90; font-weight:600; }
    .rt-conteudo table { border-collapse: collapse !important; }
    .rt-conteudo thead tr, .rt-conteudo thead th { background: transparent !important; }
    .rt-conteudo th { color: #1a1a1a !important; border: none !important; border-bottom: 0.5px solid #C9D1DD !important; font-weight: 700 !important; }
    .rt-conteudo td { border-left: none !important; border-right: none !important; border-top: none !important; border-bottom: 0.5px solid #EEF1F6 !important; }
    .rt-conteudo tfoot tr, .rt-conteudo tfoot td, .rt-conteudo tfoot th,
    .rt-conteudo tr[style*="#1A4870"], .rt-conteudo tr[style*="#111111"], .rt-conteudo tr[style*="#0B2D50"], .rt-conteudo tr[style*="#2A2A2A"],
    .rt-conteudo tr[style*="26, 72, 112"], .rt-conteudo tr[style*="17, 17, 17"],
    .rt-conteudo td[style*="background:#1A4870"], .rt-conteudo td[style*="background:#111111"], .rt-conteudo th[style*="background:#1A4870"], .rt-conteudo th[style*="background:#111111"] {
      background: #F4F6FA !important; color: #1a1a1a !important;
    }
    .rt-conteudo tr[style*="#1A4870"] td, .rt-conteudo tr[style*="#1A4870"] th, .rt-conteudo tr[style*="#111111"] td, .rt-conteudo tr[style*="#111111"] th,
    .rt-conteudo tr[style*="#0B2D50"] td, .rt-conteudo tr[style*="#2A2A2A"] td, .rt-conteudo tr[style*="26, 72, 112"] td, .rt-conteudo tr[style*="17, 17, 17"] td { color: #1a1a1a !important; }
    .rt-conteudo tfoot td, .rt-conteudo tfoot th { font-weight: 700 !important; border-top: 0.5px solid #C9D1DD !important; }

    /* ── Rodapé: logo Arato pequena em cada página impressa. Fica fixo no fim da página; o tfoot vazio da tabela
       que envolve a folha se repete em toda página e reserva o espaço, para o conteúdo não passar por baixo. ── */
    .rt-wrap { width: 100%; border-collapse: collapse; }
    .rt-wrap > tbody > tr > td, .rt-wrap > tfoot > tr > td { padding: 0; border: none !important; }
    .rt-rodape, .rt-espaco { display: none; }

    /* Ocultar elementos marcados como no-print no conteúdo clonado */
    .no-print { display: none !important; }

    /* ── Auto-fit: tabelas largas são escaladas para caber na página ── */
    .auto-fit-table { overflow-x: hidden; }
    .auto-fit-table table { transform-origin: top left; }

    @media print {
      @page { size: ${pageSize}; margin: 10mm 12mm 6mm; }
      body { background: #fff; }
      .rt-toolbar { display: none !important; }
      .rt-page-wrapper { padding: 0; }
      .rt-page { box-shadow: none; width: 100%; padding: 0; }
      .rt-espaco { display: block; height: 9mm; }
      .rt-rodape { display: flex; position: fixed; bottom: 0; left: 0; right: 0; height: 7mm; justify-content: center; align-items: center; gap: 5px; font-size: 6pt; color: #9AA4B2; border-top: 0.5px solid #E5E9F0; background: #fff; }
      .rt-rodape img { height: 8px; }
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
    <table class="rt-wrap"><tfoot><tr><td><div class="rt-espaco"></div></td></tr></tfoot><tbody><tr><td>

      <!-- Cabeçalho do relatório -->
      <div class="rt-rep-header">
        <div>
          <img src="${origem}/logo_Arato_Nova.png" alt="Arato" style="height:36px;object-fit:contain;display:block;" onerror="this.style.display='none';this.nextSibling.style.display='block';" />
          <div class="rt-rep-logo" style="display:none;">Arato</div>
          <div class="rt-rep-tag">Gestão Agrícola · menos cliques, mais campo</div>
        </div>
        <div class="rt-rep-meta">
          <div class="rt-rep-title">${titulo}</div>
          ${opts.fazenda ? `<div class="rt-rep-fazenda">${opts.fazenda}</div>` : ""}
          <div class="rt-rep-date">Gerado em ${dataGeracao}</div>
        </div>
      </div>

      ${filtros.length ? `<div class="rt-filtros">${filtros.map(f => `<span><b>${esc(f.rotulo)}:</b> ${esc(f.valor)}</span>`).join("")}</div>` : ""}

      <!-- Conteúdo do relatório -->
      <div class="rt-conteudo">${html}</div>

    </td></tr></tbody></table>
    </div>
  </div>
  <div class="rt-rodape"><img src="${origem}/logo_Arato_Nova.png" alt="Arato" onerror="this.style.display='none'"><span>Arato · Gestão Agrícola${opts.fazenda ? ` · ${esc(opts.fazenda)}` : ""} · ${dataGeracao}</span></div>
</body>
</html>`);
}
