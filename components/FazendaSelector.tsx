"use client";
import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

interface Props {
  contaId: string | null;
  value: string | null;
  onChange: (id: string) => void;
  style?: React.CSSProperties;
}

export default function FazendaSelector({ contaId, value, onChange, style }: Props) {
  const [fazendas, setFazendas] = useState<{ id: string; nome: string }[]>([]);

  useEffect(() => {
    if (!contaId) return;
    supabase
      .from("fazendas")
      .select("id, nome")
      .eq("conta_id", contaId)
      .order("nome")
      .then(({ data }) => { if (data?.length) setFazendas(data); });
  }, [contaId]);

  const wrapper: React.CSSProperties = {
    display: "flex", alignItems: "center", gap: 6,
    background: "#F0F6FB", border: "0.5px solid #1A4870",
    borderRadius: 8, padding: "6px 12px", ...style,
  };
  const lbl: React.CSSProperties = { fontSize: 11, color: "#555", fontWeight: 600, whiteSpace: "nowrap" };
  const val: React.CSSProperties = { fontSize: 13, fontWeight: 700, color: "#1A4870" };
  const sel: React.CSSProperties = {
    fontSize: 13, fontWeight: 700, color: "#1A4870", background: "transparent",
    border: "none", outline: "none", cursor: "pointer",
  };

  if (fazendas.length <= 1) {
    return (
      <span style={wrapper}>
        <span style={lbl}>Fazenda</span>
        <span style={val}>{fazendas[0]?.nome ?? "—"}</span>
      </span>
    );
  }

  return (
    <span style={wrapper}>
      <span style={lbl}>Fazenda</span>
      <select value={value ?? ""} onChange={e => onChange(e.target.value)} style={sel}>
        {fazendas.map(f => <option key={f.id} value={f.id}>{f.nome}</option>)}
      </select>
      <span style={{ fontSize: 10, color: "#1A4870" }}>▼</span>
    </span>
  );
}
