"use client";
import { useEffect, useRef } from "react";
import type { ColDef } from "../hooks/useColunasGrid";

interface Props {
  x: number;
  y: number;
  colunas: ColDef[];
  visiveis: Record<string, boolean>;
  onToggle: (key: string) => void;
  onClose: () => void;
}

export default function ContextMenuColunas({ x, y, colunas, visiveis, onToggle, onClose }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    function esc(e: KeyboardEvent) { if (e.key === "Escape") onClose(); }
    document.addEventListener("mousedown", handler);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", handler); document.removeEventListener("keydown", esc); };
  }, [onClose]);

  // Ajustar posição para não sair da tela
  const maxX = typeof window !== "undefined" ? window.innerWidth - 220 : x;
  const maxY = typeof window !== "undefined" ? window.innerHeight - (colunas.length * 34 + 60) : y;

  const opcionais = colunas.filter(c => !c.fixo);
  const fixas    = colunas.filter(c => c.fixo);
  const ativas   = opcionais.filter(c => visiveis[c.key] !== false).length;

  return (
    <div
      ref={ref}
      style={{
        position: "fixed",
        left: Math.min(x, maxX),
        top: Math.min(y, maxY),
        zIndex: 9999,
        background: "#fff",
        border: "0.5px solid #DDE2EE",
        borderRadius: 10,
        boxShadow: "0 8px 32px rgba(0,0,0,0.14)",
        minWidth: 210,
        overflow: "hidden",
        fontFamily: "system-ui, sans-serif",
      }}
      onContextMenu={e => e.preventDefault()}
    >
      {/* Cabeçalho */}
      <div style={{ padding: "10px 14px 8px", borderBottom: "0.5px solid #EEF0F6", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: "#1A4870", textTransform: "uppercase", letterSpacing: "0.06em" }}>
          Colunas visíveis
        </span>
        <span style={{ fontSize: 10, color: "#888" }}>{ativas}/{opcionais.length}</span>
      </div>

      {/* Colunas fixas (informativo) */}
      {fixas.length > 0 && (
        <div style={{ padding: "6px 14px 2px" }}>
          {fixas.map(c => (
            <div key={c.key} style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 0", opacity: 0.45 }}>
              <div style={{ width: 14, height: 14, borderRadius: 3, background: "#1A4870", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <svg width="9" height="9" viewBox="0 0 9 9"><polyline points="1,4.5 3.5,7 8,2" fill="none" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
              </div>
              <span style={{ fontSize: 12, color: "#555" }}>{c.label}</span>
              <span style={{ fontSize: 10, color: "#aaa", marginLeft: "auto" }}>fixo</span>
            </div>
          ))}
        </div>
      )}

      {/* Divisor */}
      {fixas.length > 0 && <div style={{ height: "0.5px", background: "#EEF0F6", margin: "4px 0" }} />}

      {/* Colunas opcionais */}
      <div style={{ padding: "4px 14px 8px", maxHeight: 320, overflowY: "auto" }}>
        {opcionais.map(c => {
          const ativa = visiveis[c.key] !== false;
          return (
            <div
              key={c.key}
              onClick={() => onToggle(c.key)}
              style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 0", cursor: "pointer", userSelect: "none" }}
              onMouseEnter={e => (e.currentTarget.style.opacity = "0.7")}
              onMouseLeave={e => (e.currentTarget.style.opacity = "1")}
            >
              <div style={{
                width: 14, height: 14, borderRadius: 3, flexShrink: 0,
                background: ativa ? "#1A4870" : "#fff",
                border: ativa ? "none" : "1.5px solid #BCC8D8",
                display: "flex", alignItems: "center", justifyContent: "center",
                transition: "background 0.12s",
              }}>
                {ativa && <svg width="9" height="9" viewBox="0 0 9 9"><polyline points="1,4.5 3.5,7 8,2" fill="none" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>}
              </div>
              <span style={{ fontSize: 12, color: ativa ? "#1a1a1a" : "#888" }}>{c.label}</span>
            </div>
          );
        })}
      </div>

      {/* Rodapé */}
      <div style={{ borderTop: "0.5px solid #EEF0F6", padding: "6px 14px", display: "flex", gap: 8 }}>
        <button
          onClick={() => { opcionais.forEach(c => { if (visiveis[c.key] === false) onToggle(c.key); }); }}
          style={{ flex: 1, padding: "4px 0", fontSize: 11, color: "#1A4870", background: "#EEF4FB", border: "none", borderRadius: 5, cursor: "pointer", fontWeight: 600 }}
        >
          Mostrar todas
        </button>
        <button
          onClick={onClose}
          style={{ flex: 1, padding: "4px 0", fontSize: 11, color: "#555", background: "#F4F6FA", border: "none", borderRadius: 5, cursor: "pointer" }}
        >
          Fechar
        </button>
      </div>
    </div>
  );
}
