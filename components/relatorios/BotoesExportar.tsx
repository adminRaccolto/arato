"use client";
// Botões PDF e Excel de um relatório (18/11/2026). O relatório entrega a definição (lib/relatorios/tabela-exportavel.ts)
// já com o que está na tela; o PDF usa o padrão de impressão Arato (lib/print.ts) e a planilha o xlsx formatado.
import { useState } from "react";
import { OperationalButton } from "../OperationalUI";
import { useClienteRelatorio } from "../useClienteRelatorio";
import { abrirPreviewImpressao, nomeRelatorio } from "../../lib/print";
import { planilhaFormatada } from "../../lib/relatorios/xlsx-estilo";
import { colunasSemMoeda, htmlRelatorio, linhasPlanilha, nomeAba, type RelatorioExport } from "../../lib/relatorios/tabela-exportavel";

const btn = { padding: "7px 14px", border: "0.5px solid var(--border)", borderRadius: 8, background: "var(--bg-page)", color: "var(--text-2)", fontSize: 13, fontWeight: 600, cursor: "pointer" } as const;

export default function BotoesExportar({ gerar, disabled }: { gerar: () => RelatorioExport; disabled?: boolean }) {
  const cliente = useClienteRelatorio();
  const [gerandoXlsx, setGerandoXlsx] = useState(false);

  function pdf() {
    const r = gerar();
    abrirPreviewImpressao(r.titulo, htmlRelatorio(r), {
      orientation: r.orientacao ?? "landscape", fazenda: cliente ?? undefined, filtros: r.filtros,
      nomeArquivo: nomeRelatorio(r.tipoArquivo, cliente),
    });
  }

  async function excel() {
    setGerandoXlsx(true);
    try {
      const r = gerar();
      const XLSX = await import("xlsx-js-style");
      const wb = XLSX.utils.book_new();
      const abas = r.planilhas ?? r.secoes.map((s, i) => ({ ...s, nome: s.titulo || (r.secoes.length > 1 ? `Tabela ${i + 1}` : "Dados") }));
      const usados = new Set<string>();
      for (const a of abas) {
        const linhas = linhasPlanilha(a);
        const ws = linhas.length ? planilhaFormatada(XLSX, linhas, { horas: colunasSemMoeda(a), totalNaUltima: !!a.total })
          : XLSX.utils.aoa_to_sheet([a.colunas.map(c => c.rotulo)]);
        let nome = nomeAba(a.nome), n = 2;
        while (usados.has(nome)) nome = nomeAba(`${a.nome.slice(0, 27)} ${n++}`);
        usados.add(nome);
        XLSX.utils.book_append_sheet(wb, ws, nome);
      }
      if (r.filtros?.some(f => f.valor)) {
        XLSX.utils.book_append_sheet(wb, planilhaFormatada(XLSX, r.filtros.filter(f => f.valor).map(f => ({ Filtro: f.rotulo, Valor: f.valor }))), "Filtros");
      }
      XLSX.writeFile(wb, `${nomeRelatorio(r.tipoArquivo, cliente)}.xlsx`);
    } catch (e) {
      alert(`Não foi possível gerar a planilha: ${e instanceof Error ? e.message : e}`);
    } finally { setGerandoXlsx(false); }
  }

  return (
    <div className="no-print" style={{ display: "flex", gap: 8 }}>
      <OperationalButton data-arato-button="secondary" onClick={pdf} disabled={disabled} style={{ ...btn, opacity: disabled ? 0.5 : 1 }} title="Abre a impressão em A4; dá para salvar como PDF">🖨 PDF</OperationalButton>
      <OperationalButton data-arato-button="secondary" onClick={excel} disabled={disabled || gerandoXlsx} style={{ ...btn, opacity: disabled || gerandoXlsx ? 0.5 : 1 }}>{gerandoXlsx ? "Gerando…" : "⬇ Excel"}</OperationalButton>
    </div>
  );
}
