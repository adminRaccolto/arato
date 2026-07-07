import React, { useState, useRef, useCallback } from "react";

/**
 * Hook para redimensionamento de colunas de tabela via drag, estilo Excel.
 *
 * Uso:
 *   const { w, startResize } = useColumnResize({ fornecedor: 280, valor: 110 });
 *
 *   <th style={{ width: w("fornecedor"), position: "relative", userSelect: "none" }}>
 *     Fornecedor
 *     <ResizeHandle onMouseDown={startResize("fornecedor")} />
 *   </th>
 */

const MIN_WIDTH = 40;

export function useColumnResize(initial: Record<string, number>) {
  const [widths, setWidths] = useState<Record<string, number>>(initial);
  const widthsRef = useRef(widths);
  widthsRef.current = widths;

  // startResize é estável (deps vazias) — lê largura atual via ref
  const startResize = useCallback(
    (key: string) => (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const startX = e.clientX;
      const startW = widthsRef.current[key] ?? 100;

      function onMove(ev: MouseEvent) {
        const newW = Math.max(MIN_WIDTH, startW + ev.clientX - startX);
        setWidths(prev => ({ ...prev, [key]: newW }));
      }

      function onUp() {
        document.removeEventListener("mousemove", onMove);
        document.removeEventListener("mouseup", onUp);
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
      }

      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);
    },
    [],
  );

  // Atalho: w("key") retorna a largura atual como número
  const w = useCallback((key: string) => widths[key] ?? 100, [widths]);

  return { widths, w, startResize };
}

/** Handle de redimensionamento — colocar dentro do <th> */
export function ResizeHandle({ onMouseDown }: { onMouseDown: (e: React.MouseEvent) => void }) {
  return (
    <div
      onMouseDown={onMouseDown}
      style={{
        position: "absolute",
        right: 0,
        top: 0,
        bottom: 0,
        width: 6,
        cursor: "col-resize",
        zIndex: 1,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
      onMouseEnter={e => {
        (e.currentTarget as HTMLDivElement).style.background = "rgba(26,72,112,0.18)";
      }}
      onMouseLeave={e => {
        (e.currentTarget as HTMLDivElement).style.background = "transparent";
      }}
    />
  );
}
