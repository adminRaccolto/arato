"use client";
import { useEffect, useRef, useState } from "react";
import type { ColDef } from "../hooks/useColunasGrid";

interface Props {
  x: number;
  y: number;
  colunas: ColDef[];
  ordemTodas: string[];        // todas as colunas em ordem (inclusive ocultas)
  visiveis: Record<string, boolean>;
  onToggle: (key: string) => void;
  onMover: (from: number, to: number) => void;
  onResetar: () => void;
  onClose: () => void;
}

export default function ContextMenuColunas({
  x, y, colunas, ordemTodas, visiveis, onToggle, onMover, onResetar, onClose,
}: Props) {
  const ref      = useRef<HTMLDivElement>(null);
  const dragIdx  = useRef<number | null>(null);
  const [dragOver, setDragOver] = useState<number | null>(null);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    function esc(e: KeyboardEvent) { if (e.key === "Escape") onClose(); }
    document.addEventListener("mousedown", handler);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", handler);
      document.removeEventListener("keydown", esc);
    };
  }, [onClose]);

  // Posição ajustada para não sair da tela
  const menuW  = 240;
  const left   = typeof window !== "undefined" ? Math.min(x, window.innerWidth - menuW - 8) : x;
  const top    = typeof window !== "undefined" ? Math.min(y, window.innerHeight - 520) : y;

  // Constrói lista na ordem atual, separando fixas (sempre visíveis, não movíveis)
  const fixas     = colunas.filter(c => c.fixo);
  const colMap    = Object.fromEntries(colunas.map(c => [c.key, c]));
  const opcionais = ordemTodas.map(k => colMap[k]).filter(c => c && !c.fixo);
  const ativas    = opcionais.filter(c => visiveis[c.key] !== false).length;

  function mover(idx: number, dir: -1 | 1) {
    const toIdx = idx + dir;
    if (toIdx < 0 || toIdx >= opcionais.length) return;
    // converte índice em opcionais para índice em ordemTodas
    const fromKey = opcionais[idx].key;
    const toKey   = opcionais[toIdx].key;
    const fromAll = ordemTodas.indexOf(fromKey);
    const toAll   = ordemTodas.indexOf(toKey);
    onMover(fromAll, toAll);
  }

  // Drag-and-drop dentro do painel
  function onDragStart(idx: number) { dragIdx.current = idx; }
  function onDragEnter(idx: number) { setDragOver(idx); }
  function onDragEnd() {
    if (dragIdx.current !== null && dragOver !== null && dragIdx.current !== dragOver) {
      const fromKey = opcionais[dragIdx.current].key;
      const toKey   = opcionais[dragOver].key;
      onMover(ordemTodas.indexOf(fromKey), ordemTodas.indexOf(toKey));
    }
    dragIdx.current = null;
    setDragOver(null);
  }

  return (
    <div
      ref={ref}
      style={{
        position: "fixed", left, top,
        zIndex: 9999,
        background: "var(--bg-card)",
        border: "0.5px solid var(--border)",
        borderRadius: 10,
        boxShadow: "0 8px 32px rgba(0,0,0,0.16)",
        width: menuW,
        fontFamily: "system-ui, sans-serif",
        display: "flex",
        flexDirection: "column",
        maxHeight: 520,
      }}
      onContextMenu={e => e.preventDefault()}
    >
      {/* Cabeçalho */}
      <div style={{ padding: "10px 14px 8px", borderBottom: "0.5px solid var(--border-table)", display: "flex", justifyContent: "space-between", alignItems: "center", flexShrink: 0 }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: "var(--text-1)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
          Colunas
        </span>
        <span style={{ fontSize: 10, color: "var(--text-3)" }}>{ativas}/{opcionais.length} visíveis</span>
      </div>

      {/* Colunas fixas */}
      {fixas.length > 0 && (
        <div style={{ padding: "6px 14px 2px", flexShrink: 0 }}>
          {fixas.map(c => (
            <div key={c.key} style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 0", opacity: 0.45 }}>
              <div style={{ width: 14, height: 14, borderRadius: 3, background: "#111111", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <svg width="9" height="9" viewBox="0 0 9 9"><polyline points="1,4.5 3.5,7 8,2" fill="none" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
              </div>
              <span style={{ fontSize: 12, color: "var(--text-2)", flex: 1 }}>{c.label}</span>
              <span style={{ fontSize: 9, color: "var(--text-muted)" }}>fixo</span>
            </div>
          ))}
        </div>
      )}

      {fixas.length > 0 && <div style={{ height: "0.5px", background: "var(--border-table)", margin: "4px 0", flexShrink: 0 }} />}

      {/* Colunas opcionais — reordenáveis */}
      <div style={{ flex: 1, overflowY: "auto", padding: "4px 10px 8px" }}>
        {opcionais.map((c, idx) => {
          const ativa    = visiveis[c.key] !== false;
          const isDragOv = dragOver === idx;
          return (
            <div
              key={c.key}
              draggable
              onDragStart={() => onDragStart(idx)}
              onDragEnter={() => onDragEnter(idx)}
              onDragEnd={onDragEnd}
              onDragOver={e => e.preventDefault()}
              style={{
                display: "flex", alignItems: "center", gap: 6, padding: "4px 2px",
                cursor: "grab",
                userSelect: "none",
                borderRadius: 6,
                background: isDragOv ? "var(--bg-tag)" : "transparent",
                borderTop: isDragOv ? "1.5px solid #1A4870" : "1.5px solid transparent",
                transition: "background 0.1s",
              }}
            >
              {/* Grip drag */}
              <svg width="10" height="14" viewBox="0 0 10 14" style={{ color: "var(--text-muted)", flexShrink: 0 }}>
                <circle cx="3" cy="3"  r="1.2" fill="currentColor"/>
                <circle cx="7" cy="3"  r="1.2" fill="currentColor"/>
                <circle cx="3" cy="7"  r="1.2" fill="currentColor"/>
                <circle cx="7" cy="7"  r="1.2" fill="currentColor"/>
                <circle cx="3" cy="11" r="1.2" fill="currentColor"/>
                <circle cx="7" cy="11" r="1.2" fill="currentColor"/>
              </svg>

              {/* Checkbox visibilidade */}
              <div
                onClick={e => { e.stopPropagation(); onToggle(c.key); }}
                style={{
                  width: 14, height: 14, borderRadius: 3, flexShrink: 0,
                  background: ativa ? "#1A4870" : "var(--bg-card)",
                  border: ativa ? "none" : "1.5px solid #BCC8D8",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  cursor: "pointer",
                  transition: "background 0.12s",
                }}
              >
                {ativa && <svg width="9" height="9" viewBox="0 0 9 9"><polyline points="1,4.5 3.5,7 8,2" fill="none" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>}
              </div>

              {/* Label */}
              <span
                onClick={e => { e.stopPropagation(); onToggle(c.key); }}
                style={{ fontSize: 12, color: ativa ? "var(--text-1)" : "var(--text-3)", flex: 1, cursor: "pointer" }}
              >
                {c.label}
              </span>

              {/* Botões ↑↓ */}
              <div style={{ display: "flex", flexDirection: "column", gap: 1, flexShrink: 0 }}>
                <button
                  onClick={e => { e.stopPropagation(); mover(idx, -1); }}
                  disabled={idx === 0}
                  style={{ width: 16, height: 12, fontSize: 8, padding: 0, border: "none", background: "transparent", cursor: idx === 0 ? "default" : "pointer", color: idx === 0 ? "var(--text-muted)" : "var(--text-2)", lineHeight: 1, display: "flex", alignItems: "center", justifyContent: "center" }}
                  title="Mover para cima"
                >▲</button>
                <button
                  onClick={e => { e.stopPropagation(); mover(idx, 1); }}
                  disabled={idx === opcionais.length - 1}
                  style={{ width: 16, height: 12, fontSize: 8, padding: 0, border: "none", background: "transparent", cursor: idx === opcionais.length - 1 ? "default" : "pointer", color: idx === opcionais.length - 1 ? "var(--text-muted)" : "var(--text-2)", lineHeight: 1, display: "flex", alignItems: "center", justifyContent: "center" }}
                  title="Mover para baixo"
                >▼</button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Rodapé */}
      <div style={{ borderTop: "0.5px solid var(--border-table)", padding: "6px 10px", display: "flex", gap: 6, flexShrink: 0 }}>
        <button
          onClick={() => { opcionais.forEach(c => { if (visiveis[c.key] === false) onToggle(c.key); }); }}
          style={{ flex: 1, padding: "5px 0", fontSize: 11, color: "#1A4870", background: "#D5E8F5", border: "none", borderRadius: 5, cursor: "pointer", fontWeight: 600 }}
        >
          Mostrar todas
        </button>
        <button
          onClick={onResetar}
          style={{ flex: 1, padding: "5px 0", fontSize: 11, color: "var(--text-2)", background: "var(--bg-page)", border: "0.5px solid var(--border)", borderRadius: 5, cursor: "pointer" }}
          title="Restaurar ordem e visibilidade padrão"
        >
          Resetar
        </button>
        <button
          onClick={onClose}
          style={{ padding: "5px 10px", fontSize: 11, color: "var(--text-2)", background: "var(--bg-page)", border: "0.5px solid var(--border)", borderRadius: 5, cursor: "pointer" }}
        >
          ✕
        </button>
      </div>
    </div>
  );
}
