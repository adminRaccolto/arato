"use client";
import { useState, useEffect, useRef } from "react";

export interface ProdutorComboItem {
  id: string;
  nome: string;
  inscricao_est?: string | null;
  municipio?: string | null;
  estado?: string | null;
  cpf_cnpj?: string | null;
  tipo?: string | null;
}

interface Props {
  produtores: ProdutorComboItem[];
  value: string;
  onChange: (id: string) => void;
  placeholder?: string;
  excludeId?: string;
  /** largura mínima do dropdown — padrão 460px */
  dropdownMinWidth?: number;
}

export default function ProdutorCombo({
  produtores, value, onChange,
  placeholder = "Não especificado",
  excludeId,
  dropdownMinWidth = 460,
}: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const opts = excludeId ? produtores.filter(p => p.id !== excludeId) : produtores;
  const sel = produtores.find(p => p.id === value) ?? null;

  useEffect(() => {
    if (!open) return;
    function close(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  const triggerStyle: React.CSSProperties = {
    width: "100%", textAlign: "left", padding: "6px 10px",
    border: "0.5px solid #C9C9C9", borderRadius: 8, background: "var(--bg-card)",
    cursor: "pointer", fontSize: 13, color: sel ? "var(--text-1)" : "var(--text-3)",
    display: "flex", justifyContent: "space-between", alignItems: "center",
    fontFamily: "inherit",
  };

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button type="button" style={triggerStyle} onClick={() => setOpen(o => !o)}>
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", paddingRight: 6 }}>
          {sel ? sel.nome : placeholder}
        </span>
        <span style={{ fontSize: 10, color: "var(--text-3)", flexShrink: 0 }}>▾</span>
      </button>

      {/* Resumo fixo após seleção */}
      {sel && (
        <div style={{
          marginTop: 4, padding: "5px 10px", borderRadius: 6,
          background: "#D5E8F5", display: "flex", gap: 16, flexWrap: "wrap",
          fontSize: 11, color: "#0B2D50",
        }}>
          <span style={{ fontWeight: 600 }}>{sel.nome}</span>
          {sel.inscricao_est && <span>IE: <strong>{sel.inscricao_est}</strong></span>}
          {sel.cpf_cnpj && !sel.inscricao_est && <span>CPF/CNPJ: <strong>{sel.cpf_cnpj}</strong></span>}
          {(sel.municipio || sel.estado) && (
            <span style={{ color: "var(--text-2)" }}>{[sel.municipio, sel.estado].filter(Boolean).join(" / ")}</span>
          )}
        </div>
      )}

      {open && (
        <div style={{
          position: "absolute", top: "calc(100% + 2px)", left: 0,
          minWidth: dropdownMinWidth,
          background: "var(--bg-card)", border: "0.5px solid #C9C9C9", borderRadius: 8,
          boxShadow: "0 4px 16px rgba(0,0,0,0.14)", zIndex: 600,
          maxHeight: 300, overflowY: "auto",
        }}>
          {/* Cabeçalho colunas */}
          <div style={{
            display: "grid", gridTemplateColumns: "1fr 160px",
            padding: "5px 10px", background: "var(--bg-page)",
            borderBottom: "0.5px solid var(--border)",
            fontSize: 11, fontWeight: 600, color: "var(--text-2)",
            position: "sticky", top: 0, zIndex: 1,
          }}>
            <span>Nome</span>
            <span>IE</span>
          </div>

          {/* Opção vazia */}
          <div
            onClick={() => { onChange(""); setOpen(false); }}
            style={{
              display: "grid", gridTemplateColumns: "1fr 160px",
              padding: "7px 10px", cursor: "pointer",
              background: value === "" ? "#EBF4FF" : "transparent",
              borderBottom: "0.5px solid #F0F0F0", fontSize: 13, color: "var(--text-3)",
            }}
            onMouseEnter={e => { if (value !== "") e.currentTarget.style.background = "#F8FAFB"; }}
            onMouseLeave={e => { e.currentTarget.style.background = value === "" ? "#EBF4FF" : "transparent"; }}
          >
            <span>{placeholder}</span><span>—</span>
          </div>

          {/* Linhas */}
          {opts.map(p => {
            const selected = p.id === value;
            return (
              <div
                key={p.id}
                onClick={() => { onChange(p.id); setOpen(false); }}
                style={{
                  display: "grid", gridTemplateColumns: "1fr 160px",
                  padding: "7px 10px", cursor: "pointer",
                  background: selected ? "#D5E8F5" : "transparent",
                  borderBottom: "0.5px solid #F0F0F0",
                }}
                onMouseEnter={e => { if (!selected) e.currentTarget.style.background = "var(--bg-page)"; }}
                onMouseLeave={e => { e.currentTarget.style.background = selected ? "#D5E8F5" : "transparent"; }}
              >
                <span style={{
                  fontSize: 13, fontWeight: selected ? 600 : 400, color: "var(--text-1)",
                  paddingRight: 12,
                }}>
                  {p.nome}
                </span>
                <span style={{ fontSize: 12, color: selected ? "#0B2D50" : "var(--text-2)", fontWeight: selected ? 600 : 400 }}>
                  {p.inscricao_est || "—"}
                </span>
              </div>
            );
          })}

          {opts.length === 0 && (
            <div style={{ padding: 12, fontSize: 13, color: "var(--text-3)", textAlign: "center" }}>
              Nenhum produtor disponível
            </div>
          )}
        </div>
      )}
    </div>
  );
}
