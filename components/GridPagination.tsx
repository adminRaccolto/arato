"use client";

import { useState } from "react";
import { gridPage } from "../lib/grid-pagination";

export function useGridPagination<T>(rows: T[], filterKey: string) {
  const [selection, setSelection] = useState({ page: 1, size: 100, filterKey });
  // Reset the stored cursor too, so restoring an earlier filter cannot restore
  // an old page and silently skip its first results.
  if (selection.filterKey !== filterKey) setSelection({ page: 1, size: selection.size, filterKey });
  const range = gridPage(rows.length, selection.filterKey === filterKey ? selection.page : 1, selection.size);
  return {
    ...range,
    rows: rows.slice(range.offset, range.end),
    setPage: (page: number) => setSelection({ page, size: selection.size, filterKey }),
    setSize: (size: number) => setSelection({ page: 1, size, filterKey }),
  };
}

type Pagination = ReturnType<typeof useGridPagination>;
export default function GridPagination({ pagination }: { pagination: Pagination }) {
  if (pagination.total <= 100) return null;
  const button = { padding: "6px 10px", border: "1px solid var(--border-control)", borderRadius: 6, background: "var(--bg-card)", color: "var(--text-1)", cursor: "pointer" };
  return <nav className="arato-grid-pagination" aria-label="Paginação dos títulos" style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "12px 72px 48px 4px", fontSize: 12, color: "var(--text-2)" }}>
    <span role="status">{pagination.offset + 1}–{pagination.end} de {pagination.total.toLocaleString("pt-BR")} registros</span>
    <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
      <label>Por página <select aria-label="Registros por página" value={pagination.size} onChange={event => pagination.setSize(Number(event.target.value))} style={button}>
        <option value={100}>100</option><option value={200}>200</option><option value={500}>500</option>
      </select></label>
      <button type="button" style={button} disabled={pagination.page === 1} onClick={() => pagination.setPage(pagination.page - 1)}>Anterior</button>
      <span>Página {pagination.page} de {pagination.pages}</span>
      <button type="button" style={button} disabled={pagination.page === pagination.pages} onClick={() => pagination.setPage(pagination.page + 1)}>Próxima</button>
    </div>
  </nav>;
}
