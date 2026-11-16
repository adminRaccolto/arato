"use client";
import { useState, type CSSProperties } from "react";
import { prepararConsultaSieg } from "../../lib/fiscal/sieg-consulta";
import { resumoRespostaSieg } from "../../lib/fiscal/sieg-sincronizacao";
import InputData from "../InputData";
import { OperationalButton } from "../OperationalUI";

export type NotaLocalizadaSieg = { id: string; numero: string; data_emissao: string };
const input: CSSProperties = { width: "100%", boxSizing: "border-box", padding: "9px 10px", fontSize: 13, borderRadius: 8, border: "1px solid var(--border-table)", background: "var(--bg-input)", color: "var(--text-1)" };
const label: CSSProperties = { display: "block", fontSize: 12, marginBottom: 5, color: "var(--text-2)" };

export default function ModalRecuperarNfSieg({ fazendaId, numeroInicial = "", onClose, onLocalizada }: {
  fazendaId: string; numeroInicial?: string; onClose: () => void; onLocalizada: (nota: NotaLocalizadaSieg) => void;
}) {
  const [modo, setModo] = useState<"numero" | "chave">("numero");
  const [numero, setNumero] = useState(/^\d{1,9}$/.test(numeroInicial.trim()) ? numeroInicial.trim() : "");
  const [cnpj, setCnpj] = useState("");
  const [serie, setSerie] = useState("");
  const [data, setData] = useState("");
  const [chave, setChave] = useState("");
  const [buscando, setBuscando] = useState(false);
  const [mensagem, setMensagem] = useState("");
  async function localizar() {
    setMensagem("");
    const consulta = modo === "chave" ? { chaves_acesso: [chave.replace(/\D/g, "")] }
      : { numero_nf: numero, cnpj_emitente: cnpj, serie: serie || undefined, data_inicio: data, data_fim: data };
    try { prepararConsultaSieg(consulta); }
    catch (e) { setMensagem((e as Error).message); return; }
    setBuscando(true);
    try {
      const r = await fetch("/api/integracoes/sieg-sync", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fazenda_id: fazendaId, ...consulta, force_reimport: true }) });
      let j: Record<string, unknown>;
      try { j = await r.json(); } catch { throw new Error(`Resposta inválida (HTTP ${r.status}). Tente novamente.`); }
      if (!r.ok || j.erro) throw new Error(String(j.erro || `Falha na consulta (HTTP ${r.status}).`));
      const resumo = resumoRespostaSieg(j);
      const notas = Array.isArray(j.notas) ? j.notas as NotaLocalizadaSieg[] : [];
      if (resumo.falha) { setMensagem(resumo.texto); return; }
      if (!notas.length) { setMensagem(resumo.texto); return; }
      if (notas.length > 1) { setMensagem("Mais de uma nota corresponde à busca. Informe a série ou utilize a chave de acesso."); return; }
      onLocalizada(notas[0]);
    } catch (e) { setMensagem(e instanceof Error ? e.message : "Não foi possível consultar o SIEG."); }
    finally { setBuscando(false); }
  }
  return <div data-arato-overlay="true" style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.45)", zIndex: 1600, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
    <div role="dialog" aria-modal="true" aria-labelledby="localizar-nf-titulo" data-arato-dialog="true" style={{ background: "var(--bg-card)", color: "var(--text-1)", borderRadius: 14, width: 620, maxWidth: "100%", maxHeight: "90vh", overflowY: "auto" }}>
      <div data-arato-dialog-heading="true" style={{ padding: "16px 20px", borderBottom: "1px solid var(--border-table)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h2 id="localizar-nf-titulo" style={{ margin: 0, fontSize: 19 }}>Localizar NF-e no SIEG</h2>
        <OperationalButton data-arato-button="secondary" onClick={onClose} disabled={buscando} aria-label="Fechar">✕</OperationalButton>
      </div>
      <div data-arato-dialog-body="true" style={{ padding: 20 }}>
        <p style={{ marginTop: 0, fontSize: 13, color: "var(--text-2)" }}>Procure uma NF-e de produtos destinada a este cliente. A nota recuperada fica disponível para conferência e processamento.</p>
        <div style={{ display: "flex", gap: 16, marginBottom: 18 }}>
          {(["numero", "chave"] as const).map(v => <label key={v} style={{ fontSize: 13 }}><input type="radio" name="modo-localizar-nf" checked={modo === v} onChange={() => { setModo(v); setMensagem(""); }} disabled={buscando} /> {v === "numero" ? "Número da nota" : "Chave de acesso"}</label>)}
        </div>
        <fieldset disabled={buscando} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
          {modo === "chave" ? <label style={label}>Chave de acesso (44 dígitos)<input autoFocus value={chave} onChange={e => setChave(e.target.value.replace(/\D/g, "").slice(0, 44))} inputMode="numeric" style={input} /></label>
            : <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 14 }}>
              <label style={label}>Número da NF-e<input autoFocus value={numero} onChange={e => setNumero(e.target.value.replace(/\D/g, "").slice(0, 9))} inputMode="numeric" style={input} /></label>
              <label style={label}>Série (opcional)<input value={serie} onChange={e => setSerie(e.target.value.replace(/\D/g, "").slice(0, 3))} inputMode="numeric" style={input} /></label>
              <label style={label}>CNPJ do fornecedor<input value={cnpj} onChange={e => setCnpj(e.target.value)} placeholder="00.000.000/0000-00" inputMode="numeric" style={input} /></label>
              <label style={label}>Data de emissão<InputData type="date" value={data} onChange={e => setData(e.target.value)} style={input} /></label>
            </div>}
        </fieldset>
        {mensagem && <div role="alert" style={{ marginTop: 14, padding: 12, background: "#FFF4E5", color: "#7A4300", borderRadius: 8, fontSize: 13 }}>{mensagem}</div>}
      </div>
      <div data-arato-dialog-actions="true" style={{ padding: "12px 20px", borderTop: "1px solid var(--border-table)", display: "flex", justifyContent: "flex-end", gap: 10 }}>
        <OperationalButton data-arato-button="secondary" onClick={onClose} disabled={buscando}>Fechar</OperationalButton>
        <OperationalButton data-arato-button="primary" onClick={localizar} disabled={buscando}>{buscando ? "Consultando SIEG…" : "Localizar e recuperar NF-e"}</OperationalButton>
      </div>
    </div>
  </div>;
}
