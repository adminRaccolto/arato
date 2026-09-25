"use client";
// Mostra a(s) linha(s) do extrato OFX com que um lançamento foi conciliado (Conciliação Bancária).
// Antes, na janela de CP/CR o lançamento conciliado só exibia a etiqueta "OFX" — sem dizer com qual
// linha do extrato (data, descrição, valor, conta) ele foi conciliado.
import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

type Linha = { id: string; fitid: string | null; data: string | null; descricao: string | null; valor: number | null; tipo: string | null; conta_nome: string | null; conciliado: boolean | null };

const fmtBRL = (v: number | null) => v == null ? "—" : v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fmtData = (d: string | null) => d ? d.slice(0, 10).split("-").reverse().join("/") : "—";

export default function ConciliacaoOfxInfo({ lancamentoId, conciliado }: { lancamentoId: string; conciliado?: boolean | null }) {
  const [linhas, setLinhas] = useState<Linha[] | null>(null);
  useEffect(() => {
    let cancelado = false;
    setLinhas(null);
    supabase.from("extrato_transacoes")
      .select("id,fitid,data,descricao,valor,tipo,conta_nome,conciliado")
      .or(`lancamento_id.eq.${lancamentoId},lancamento_ids.cs.{${lancamentoId}}`)
      .then(({ data }) => { if (!cancelado) setLinhas((data ?? []) as Linha[]); });
    return () => { cancelado = true; };
  }, [lancamentoId]);

  if (linhas === null) return null;
  if (linhas.length === 0) {
    if (!conciliado) return null;
    return (
      <div style={{ background: "#FBF3E0", border: "0.5px solid #C9921B", borderRadius: 8, padding: "8px 12px", fontSize: 12, color: "#7A5400", marginBottom: 12 }}>
        Marcado como conciliado, mas <strong>nenhuma linha do extrato OFX</strong> está ligada a este lançamento (conciliação fantasma). Abra Conciliação Bancária → Conferência para revincular.
      </div>
    );
  }
  return (
    <div style={{ background: "#F0FDF4", border: "0.5px solid #16A34A60", borderRadius: 8, padding: "10px 12px", marginBottom: 12 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: "#166534", textTransform: "uppercase", letterSpacing: ".04em", marginBottom: 6 }}>
        Conciliado com {linhas.length === 1 ? "a linha do extrato OFX" : `${linhas.length} linhas do extrato OFX`}
      </div>
      {linhas.map(l => (
        <div key={l.id} style={{ display: "grid", gridTemplateColumns: "84px 1fr 110px", gap: 10, fontSize: 12, padding: "3px 0", alignItems: "baseline" }}>
          <span style={{ color: "var(--text-2)", fontFamily: "monospace" }}>{fmtData(l.data)}</span>
          <span style={{ color: "var(--text-1)" }}>
            {l.descricao ?? "—"}
            <span style={{ display: "block", fontSize: 10, color: "var(--text-3)" }}>{l.conta_nome ?? "conta não informada"}{l.fitid ? ` · FITID ${l.fitid}` : ""}</span>
          </span>
          <span style={{ textAlign: "right", fontWeight: 600, color: (l.tipo === "debito" || (l.valor ?? 0) < 0) ? "#A32D2D" : "#166534" }}>{fmtBRL(l.valor)}</span>
        </div>
      ))}
    </div>
  );
}
