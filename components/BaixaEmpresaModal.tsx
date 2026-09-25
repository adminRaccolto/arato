"use client";
import { useMemo, useState } from "react";
import type { EmpresaLancamento } from "../lib/supabase";

type Conta = { id: string; nome: string };

const fmtBRL = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const num = (s: string) => { const n = parseFloat((s || "").replace(/\./g, "").replace(",", ".")); return isNaN(n) ? 0 : n; };
const mask = (n: number) => n.toFixed(2).replace(".", ",");

const inp = { width: "100%", padding: "8px 10px", border: "0.5px solid #DDE2EE", borderRadius: 8, fontSize: 13, boxSizing: "border-box" as const, background: "#fff" };
const lbl = { display: "block", fontSize: 11, fontWeight: 600, color: "#555", marginBottom: 4 };

// Baixa de CP/CR das Empresas — mesma regra do produtor: valor pago (com juros/multa/desconto em R$),
// baixa parcial com reprogramação do saldo e conta bancária obrigatória.
export default function BaixaEmpresaModal({ lanc, contas, onClose, onDone }: {
  lanc: EmpresaLancamento; contas: Conta[]; onClose: () => void; onDone: () => void;
}) {
  const pagar = lanc.tipo === "pagar";
  const hoje = new Date().toISOString().split("T")[0];
  const saldo = Math.max(0, lanc.valor - (lanc.valor_pago ?? 0));
  const [data, setData] = useState(hoje);
  const [conta, setConta] = useState(lanc.conta_bancaria ?? "");
  const [multa, setMulta] = useState("");
  const [juros, setJuros] = useState("");
  const [desc, setDesc] = useState("");
  const [valor, setValor] = useState(mask(saldo));
  const [novaData, setNovaData] = useState("");
  const [obs, setObs] = useState(lanc.observacao ?? "");
  const [saving, setSaving] = useState(false);
  const [erro, setErro] = useState("");

  const encargos = num(multa) + num(juros) - num(desc);
  const devido = saldo + encargos;
  const valorPago = num(valor);
  const parcial = valorPago < devido - 0.01;
  const restante = Math.max(0, devido - valorPago);

  const sugerido = useMemo(() => mask(Math.max(0, saldo + num(multa) + num(juros) - num(desc))), [saldo, multa, juros, desc]);

  async function confirmar() {
    setErro("");
    if (!conta) { setErro(`Selecione a conta bancária de ${pagar ? "pagamento" : "recebimento"}.`); return; }
    if (valorPago <= 0) { setErro("Informe o valor."); return; }
    if (parcial && !novaData) { setErro("Baixa parcial: informe a nova data de vencimento do saldo."); return; }
    setSaving(true);
    try {
      const r = await fetch("/api/empresa-lancamentos/baixar", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          acao: "baixar", lancamento_id: lanc.id, valor_pago_agora: valorPago, data_baixa: data,
          conta_bancaria: conta, observacao: obs || undefined,
          multa_valor: num(multa) || undefined, juros_valor: num(juros) || undefined, desconto_valor: num(desc) || undefined,
          nova_data_vencimento: parcial ? novaData : undefined,
        }),
      });
      const j = await r.json();
      if (!j.ok) { setErro(j.error ?? "Erro ao baixar"); return; }
      onDone();
    } catch (e) { setErro(e instanceof Error ? e.message : String(e)); }
    finally { setSaving(false); }
  }

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.45)", zIndex: 1100, display: "flex", alignItems: "center", justifyContent: "center" }} onClick={onClose}>
      <div style={{ background: "#fff", borderRadius: 12, padding: 24, width: "min(96vw,560px)", maxHeight: "92vh", overflowY: "auto" }} onClick={e => e.stopPropagation()}>
        <h3 style={{ fontSize: 16, fontWeight: 700, margin: "0 0 4px" }}>{pagar ? "Registrar Pagamento" : "Registrar Recebimento"}</h3>
        <p style={{ fontSize: 13, color: "#555", margin: "0 0 14px" }}>
          <strong>{lanc.descricao}</strong> — {fmtBRL(lanc.valor)}
          {(lanc.valor_pago ?? 0) > 0 && <> · já {pagar ? "pago" : "recebido"} {fmtBRL(lanc.valor_pago!)} · saldo {fmtBRL(saldo)}</>}
        </p>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div><label style={lbl}>Data *</label><input type="date" style={inp} value={data} onChange={e => setData(e.target.value)} /></div>
          <div>
            <label style={lbl}>Conta bancária *</label>
            <select style={inp} value={conta} onChange={e => setConta(e.target.value)}>
              <option value="">Selecione…</option>
              {contas.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
            </select>
          </div>
          <div><label style={lbl}>Multa (R$)</label><input style={inp} value={multa} onChange={e => setMulta(e.target.value)} placeholder="0,00" /></div>
          <div><label style={lbl}>Juros (R$)</label><input style={inp} value={juros} onChange={e => setJuros(e.target.value)} placeholder="0,00" /></div>
          <div><label style={lbl}>Desconto (R$)</label><input style={inp} value={desc} onChange={e => setDesc(e.target.value)} placeholder="0,00" /></div>
          <div>
            <label style={lbl}>Valor {pagar ? "pago" : "recebido"} agora (R$) *</label>
            <input style={{ ...inp, fontWeight: 700 }} value={valor} onChange={e => setValor(e.target.value)} />
            {sugerido !== valor && <button type="button" onClick={() => setValor(sugerido)} style={{ background: "none", border: "none", color: "#1A4870", fontSize: 11, cursor: "pointer", padding: "3px 0" }}>Usar total devido ({fmtBRL(num(sugerido))})</button>}
          </div>
        </div>
        {parcial && valorPago > 0 && (
          <div style={{ marginTop: 12, background: "#FBF3E0", border: "0.5px solid #F0C060", borderRadius: 8, padding: 12 }}>
            <div style={{ fontSize: 12, color: "#7A5500", marginBottom: 8 }}>
              Baixa <strong>parcial</strong> — restam <strong>{fmtBRL(restante)}</strong> em aberto.
            </div>
            <label style={lbl}>Novo vencimento do saldo *</label>
            <input type="date" style={{ ...inp, maxWidth: 200 }} value={novaData} min={data} onChange={e => setNovaData(e.target.value)} />
          </div>
        )}
        <div style={{ marginTop: 12 }}>
          <label style={lbl}>Observação</label>
          <input style={inp} value={obs} onChange={e => setObs(e.target.value)} />
        </div>
        {erro && <div style={{ marginTop: 12, color: "#E24B4A", fontSize: 12 }}>{erro}</div>}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 18 }}>
          <button onClick={onClose} style={{ padding: "8px 16px", borderRadius: 8, border: "0.5px solid #DDE2EE", background: "transparent", cursor: "pointer", fontSize: 13 }}>Cancelar</button>
          <button onClick={confirmar} disabled={saving} style={{ padding: "8px 16px", borderRadius: 8, border: "none", background: "#C9921B", color: "#fff", fontWeight: 700, cursor: "pointer", fontSize: 13 }}>{saving ? "Salvando…" : parcial ? "✓ Baixar parcial" : "✓ Confirmar baixa"}</button>
        </div>
      </div>
    </div>
  );
}
