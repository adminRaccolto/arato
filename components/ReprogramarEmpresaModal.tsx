"use client";
import { useState } from "react";
import type { EmpresaLancamento } from "../lib/supabase";

const fmtBRL = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const inp = { width: "100%", padding: "8px 10px", border: "0.5px solid #DDE2EE", borderRadius: 8, fontSize: 13, boxSizing: "border-box" as const, background: "#fff" };
const lbl = { display: "block", fontSize: 10, fontWeight: 600, color: "#555", textTransform: "uppercase" as const, letterSpacing: "0.05em", marginBottom: 4 };

// Reprogramar vencimento — mesma regra do CP/CR do produtor (guarda o vencimento original em data_prorrogacao)
export default function ReprogramarEmpresaModal({ lanc, onClose, onDone }: {
  lanc: EmpresaLancamento; onClose: () => void; onDone: () => void;
}) {
  const [novaData, setNovaData] = useState(lanc.data_vencimento);
  const [novoValor, setNovoValor] = useState("");
  const [obs, setObs] = useState("");
  const [saving, setSaving] = useState(false);
  const [erro, setErro] = useState("");
  const fmtD = (iso: string) => { const [y, m, d] = iso.split("-"); return `${d}/${m}/${y}`; };

  async function salvar() {
    setErro("");
    if (!novaData) { setErro("Informe a nova data de vencimento."); return; }
    const v = novoValor ? parseFloat(novoValor.replace(/\./g, "").replace(",", ".")) : undefined;
    setSaving(true);
    try {
      const r = await fetch("/api/empresa-lancamentos/baixar", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ acao: "reprogramar", lancamento_id: lanc.id, nova_data: novaData, novo_valor: v, observacao: obs.trim() || undefined }),
      });
      const j = await r.json();
      if (!j.ok) { setErro(j.error ?? "Erro ao reprogramar"); return; }
      onDone();
    } catch (e) { setErro(e instanceof Error ? e.message : String(e)); }
    finally { setSaving(false); }
  }

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.45)", zIndex: 1100, display: "flex", alignItems: "center", justifyContent: "center" }} onClick={onClose}>
      <div style={{ background: "#fff", borderRadius: 12, padding: "24px 28px", width: "min(96vw,420px)" }} onClick={e => e.stopPropagation()}>
        <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 2 }}>📅 Reprogramar Vencimento</div>
        <div style={{ fontSize: 11, color: "#555", marginBottom: 14, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{lanc.descricao}</div>
        <div style={{ background: "#F4F6FA", borderRadius: 8, padding: "10px 14px", marginBottom: 16, display: "flex", gap: 16, fontSize: 11, color: "#555" }}>
          <div>Data atual: <strong style={{ color: "#E24B4A" }}>{fmtD(lanc.data_vencimento)}</strong></div>
          <div>Valor atual: <strong>{fmtBRL(lanc.valor)}</strong></div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div><label style={lbl}>Nova data de vencimento *</label><input type="date" style={inp} value={novaData} onChange={e => setNovaData(e.target.value)} /></div>
          <div><label style={lbl}>Novo valor (deixe em branco para manter)</label><input style={inp} placeholder={lanc.valor.toFixed(2).replace(".", ",")} value={novoValor} onChange={e => setNovoValor(e.target.value)} /></div>
          <div><label style={lbl}>Motivo / Observação</label><input style={inp} placeholder="Ex.: Acordado com fornecedor" value={obs} onChange={e => setObs(e.target.value)} /></div>
        </div>
        {erro && <div style={{ marginTop: 12, color: "#E24B4A", fontSize: 12 }}>{erro}</div>}
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 20 }}>
          <button onClick={onClose} style={{ padding: "8px 18px", borderRadius: 8, border: "0.5px solid #DDE2EE", background: "transparent", fontSize: 13, cursor: "pointer" }}>Cancelar</button>
          <button onClick={salvar} disabled={saving || !novaData} style={{ padding: "8px 18px", borderRadius: 8, border: "none", background: "#1A4870", color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer", opacity: saving ? 0.5 : 1 }}>{saving ? "Salvando..." : "Confirmar Reprogramação"}</button>
        </div>
      </div>
    </div>
  );
}
