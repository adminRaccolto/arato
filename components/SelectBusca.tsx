"use client";
import { useState, useEffect, useRef, useCallback } from "react";

export interface SelectBuscaOption {
  value: string;
  label: string;
  group?: string;
}

interface Props {
  value: string;
  onChange: (value: string) => void;
  options: SelectBuscaOption[];
  placeholder?: string;
  style?: React.CSSProperties;
  disabled?: boolean;
}

export default function SelectBusca({ value, onChange, options, placeholder = "— Selecionar —", style, disabled }: Props) {
  const [aberto, setAberto] = useState(false);
  const [busca, setBusca] = useState("");
  const [pos, setPos] = useState({ top: 0, left: 0, width: 0 });
  const triggerRef = useRef<HTMLDivElement>(null);
  const inputRef   = useRef<HTMLInputElement>(null);
  const dropId     = useRef(`sb_${Math.random().toString(36).slice(2)}`).current;

  const fechar = useCallback(() => { setAberto(false); setBusca(""); }, []);

  useEffect(() => {
    if (!aberto) return;
    const onDown = (e: MouseEvent) => {
      const drop = document.getElementById(dropId);
      if (!triggerRef.current?.contains(e.target as Node) && !drop?.contains(e.target as Node)) fechar();
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") fechar(); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey); };
  }, [aberto, fechar, dropId]);

  useEffect(() => { if (aberto) setTimeout(() => inputRef.current?.focus(), 30); }, [aberto]);

  const abrir = () => {
    if (disabled) return;
    const rect = triggerRef.current?.getBoundingClientRect();
    if (rect) {
      const spaceBelow = window.innerHeight - rect.bottom;
      const spaceAbove = rect.top;
      const dropH = Math.min(340, options.length * 31 + 60);
      const top = spaceBelow >= dropH || spaceBelow >= spaceAbove
        ? rect.bottom + 2
        : rect.top - dropH - 2;
      setPos({ top, left: rect.left, width: rect.width });
    }
    setAberto(v => !v);
    setBusca("");
  };

  const filtradas = busca.trim()
    ? options.filter(o => o.label.toLowerCase().includes(busca.toLowerCase()))
    : options;

  const grupos: Record<string, SelectBuscaOption[]> = {};
  const semGrupo: SelectBuscaOption[] = [];
  for (const o of filtradas) {
    if (o.group) (grupos[o.group] = grupos[o.group] ?? []).push(o);
    else semGrupo.push(o);
  }
  const hasGroups = Object.keys(grupos).length > 0;

  const selectedLabel = options.find(o => o.value === value)?.label;

  const selectOption = (v: string) => { onChange(v); fechar(); };

  const fontSize = (style?.fontSize as number | string | undefined) ?? 13;

  return (
    <>
      <div
        ref={triggerRef}
        onClick={abrir}
        style={{
          ...style,
          cursor: disabled ? "not-allowed" : "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          userSelect: "none",
          opacity: disabled ? 0.5 : 1,
          background: aberto ? "#EDF3FA" : (style?.background ?? "#fff"),
          transition: "background 0.1s",
        }}
      >
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize, color: selectedLabel ? "#1a1a1a" : "#aaa", flex: 1, minWidth: 0 }}>
          {selectedLabel ?? placeholder}
        </span>
        <span style={{ flexShrink: 0, marginLeft: 6, color: "#888", fontSize: 9, lineHeight: 1 }}>{aberto ? "▲" : "▼"}</span>
      </div>

      {aberto && typeof window !== "undefined" && (
        <div
          id={dropId}
          style={{
            position: "fixed",
            top: pos.top,
            left: pos.left,
            width: Math.max(pos.width, 300),
            zIndex: 99999,
            background: "#fff",
            border: "0.5px solid #C8D4E8",
            borderRadius: 8,
            boxShadow: "0 8px 32px rgba(0,0,0,0.18)",
            overflow: "hidden",
            display: "flex",
            flexDirection: "column",
            maxHeight: 340,
          }}
        >
          {/* Campo de busca embutido */}
          <div style={{ padding: "8px 10px", borderBottom: "0.5px solid #E8EEF6", background: "#F8FAFD", flexShrink: 0 }}>
            <input
              ref={inputRef}
              value={busca}
              onChange={e => setBusca(e.target.value)}
              placeholder="Filtrar…"
              style={{ width: "100%", border: "0.5px solid #C8D4E8", borderRadius: 6, padding: "5px 9px", fontSize: 12, outline: "none", background: "#fff", boxSizing: "border-box" }}
            />
          </div>

          {/* Lista de opções */}
          <div style={{ overflowY: "auto", flex: 1 }}>
            {/* Opção vazia */}
            <div
              onClick={() => selectOption("")}
              style={{ padding: "7px 12px", fontSize: 12, color: "#aaa", cursor: "pointer", borderBottom: "0.5px solid #F0F4FA", fontStyle: "italic" }}
              onMouseEnter={e => (e.currentTarget.style.background = "#F0F4FA")}
              onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
            >
              {placeholder}
            </div>

            {filtradas.length === 0 && (
              <div style={{ padding: "14px 12px", textAlign: "center", color: "#aaa", fontSize: 12 }}>Nenhum resultado para "{busca}"</div>
            )}

            {hasGroups
              ? Object.entries(grupos).map(([grupo, items]) => (
                  <div key={grupo}>
                    <div style={{ padding: "5px 12px 3px", fontSize: 10, fontWeight: 700, color: "#1A4870", textTransform: "uppercase", letterSpacing: "0.07em", background: "#F3F7FC", borderTop: "0.5px solid #E0EAF6" }}>
                      {grupo}
                    </div>
                    {items.map(o => <OptionRow key={o.value} o={o} selected={o.value === value} onSelect={selectOption} />)}
                  </div>
                ))
              : semGrupo.map(o => <OptionRow key={o.value} o={o} selected={o.value === value} onSelect={selectOption} />)
            }
          </div>
        </div>
      )}
    </>
  );
}

function OptionRow({ o, selected, onSelect }: { o: SelectBuscaOption; selected: boolean; onSelect: (v: string) => void }) {
  return (
    <div
      onClick={() => onSelect(o.value)}
      style={{
        padding: "7px 12px 7px 16px",
        fontSize: 12,
        color: selected ? "#0B2D50" : "#1a1a1a",
        background: selected ? "#D5E8F5" : "transparent",
        cursor: "pointer",
        borderBottom: "0.5px solid #F4F6FA",
        fontWeight: selected ? 600 : 400,
        transition: "background 0.08s",
      }}
      onMouseEnter={e => { if (!selected) e.currentTarget.style.background = "#EDF3FA"; }}
      onMouseLeave={e => { if (!selected) e.currentTarget.style.background = selected ? "#D5E8F5" : "transparent"; }}
    >
      {o.label}
    </div>
  );
}
