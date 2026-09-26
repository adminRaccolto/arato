"use client";
import { useMemo, useState } from "react";
import type { Funcionario, FuncionarioFerias } from "../lib/supabase";
import { calcularFerias, concederFerias, salarioReferencia } from "../lib/rh-financeiro";

const fmt = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const num = (s: string) => { const n = parseFloat((s || "").replace(/\./g, "").replace(",", ".")); return isNaN(n) ? 0 : n; };
const mask = (n: number) => n.toFixed(2).replace(".", ",");
const addDias = (iso: string, n: number) => { const d = new Date(iso + "T12:00:00"); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
const inp = { width: "100%", padding: "8px 10px", border: "0.5px solid var(--border-table, #DDE2EE)", borderRadius: 8, fontSize: 13, boxSizing: "border-box" as const, background: "var(--bg-input, #fff)", color: "var(--text-1, #1a1a1a)" };
const lbl = { display: "block", fontSize: 11, fontWeight: 600, color: "var(--text-2, #555)", marginBottom: 4 };

// Concessão de férias com rotina financeira: valor (dias/30 + 1/3), abono pecuniário e lançamento no Contas a Pagar.
export default function ConcederFeriasModal({ func, fazendaId, fer, onClose, onDone }: {
  func: Funcionario; fazendaId: string; fer: FuncionarioFerias; onClose: () => void; onDone: (f: FuncionarioFerias) => void;
}) {
  const salario = salarioReferencia(func);
  const [inicio, setInicio] = useState("");
  const [dias, setDias] = useState("30");
  const [abono, setAbono] = useState(false);
  const [diasAbono, setDiasAbono] = useState("10");
  const [pagto, setPagto] = useState("");
  const [vFerias, setVFerias] = useState<string | null>(null);
  const [vAbono, setVAbono] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [erro, setErro] = useState("");

  const nDias = Math.max(1, Math.round(num(dias)) || 30);
  const nAbono = abono ? Math.max(0, Math.round(num(diasAbono)) || 0) : 0;
  const fim = inicio ? addDias(inicio, nDias - 1) : "";
  const calc = useMemo(() => calcularFerias(salario, nDias, abono, nAbono), [salario, nDias, abono, nAbono]);
  const valorFerias = vFerias !== null ? num(vFerias) : calc.totalFerias;
  const valorAbono = abono ? (vAbono !== null ? num(vAbono) : calc.totalAbono) : 0;
  const vencPagto = pagto || (inicio ? addDias(inicio, -2) : "");

  async function confirmar() {
    setErro("");
    if (!inicio) { setErro("Informe o início do gozo."); return; }
    if (salario <= 0) { setErro("O funcionário está sem salário base cadastrado (aba Remuneração)."); return; }
    if (nDias + nAbono > 30) { setErro("Dias de gozo + abono não podem passar de 30."); return; }
    if (abono && nAbono > 10) { setErro("O abono pecuniário é de no máximo 1/3 (10 dias)."); return; }
    setSaving(true);
    try {
      const atualizado = await concederFerias(func, fazendaId, fer, { inicio, fim, dias: nDias, abono, diasAbono: nAbono, valorFerias, valorAbono, dataPagamento: vencPagto });
      onDone(atualizado);
    } catch (e) { setErro(e instanceof Error ? e.message : String((e as { message?: string })?.message ?? e)); }
    finally { setSaving(false); }
  }

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.45)", zIndex: 1300, display: "flex", alignItems: "center", justifyContent: "center" }} onClick={onClose}>
      <div style={{ background: "var(--bg-card, #fff)", borderRadius: 12, padding: "22px 26px", width: "min(96vw,560px)", maxHeight: "92vh", overflowY: "auto" }} onClick={e => e.stopPropagation()}>
        <div style={{ fontSize: 16, fontWeight: 700 }}>Conceder férias — {func.nome}</div>
        <div style={{ fontSize: 12, color: "#666", margin: "2px 0 14px" }}>Período aquisitivo {fer.periodo_inicio} → {fer.periodo_fim} · salário de referência {fmt(salario)}</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
          <div><label style={lbl}>Início do gozo *</label><input type="date" style={inp} value={inicio} onChange={e => setInicio(e.target.value)} /></div>
          <div><label style={lbl}>Dias de gozo</label><input style={inp} value={dias} onChange={e => setDias(e.target.value)} /></div>
          <div><label style={lbl}>Fim do gozo</label><input style={{ ...inp, background: "var(--bg-page, #F4F6FA)" }} value={fim ? fim.split("-").reverse().join("/") : ""} readOnly /></div>
        </div>
        <label style={{ display: "flex", alignItems: "center", gap: 8, margin: "12px 0 4px", fontSize: 12 }}>
          <input type="checkbox" checked={abono} onChange={e => { setAbono(e.target.checked); if (e.target.checked && num(dias) > 20) setDias("20"); }} />
          Abono pecuniário (vender até 1/3 das férias)
        </label>
        {abono && <div style={{ maxWidth: 160 }}><label style={lbl}>Dias de abono</label><input style={inp} value={diasAbono} onChange={e => setDiasAbono(e.target.value)} /></div>}

        <div style={{ marginTop: 14, border: "0.5px solid var(--border-table, #DDE2EE)", borderRadius: 10, padding: 14, background: "var(--bg-page, #F4F6FA)" }}>
          <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8 }}>Valores calculados</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: "4px 12px", fontSize: 12 }}>
            <span>Férias ({nDias} dias)</span><span>{fmt(calc.ferias)}</span>
            <span>1/3 constitucional</span><span>{fmt(calc.tercoFerias)}</span>
            {abono && <><span>Abono pecuniário ({nAbono} dias) + 1/3</span><span>{fmt(calc.totalAbono)}</span></>}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: abono ? "1fr 1fr" : "1fr", gap: 12, marginTop: 12 }}>
            <div><label style={lbl}>Valor das férias a lançar (R$)</label><input style={{ ...inp, fontWeight: 700 }} value={vFerias ?? mask(calc.totalFerias)} onChange={e => setVFerias(e.target.value)} /></div>
            {abono && <div><label style={lbl}>Valor do abono a lançar (R$)</label><input style={{ ...inp, fontWeight: 700 }} value={vAbono ?? mask(calc.totalAbono)} onChange={e => setVAbono(e.target.value)} /></div>}
          </div>
          <div style={{ fontSize: 11, color: "#888", marginTop: 8 }}>Valores brutos (INSS, IRRF e FGTS de 8% seguem pelas guias, como na folha). Você pode ajustar o valor se o contador calcular diferente.</div>
        </div>

        <div style={{ marginTop: 12, maxWidth: 240 }}>
          <label style={lbl}>Vencimento do pagamento (até 2 dias antes)</label>
          <input type="date" style={inp} value={vencPagto} onChange={e => setPagto(e.target.value)} />
        </div>
        <div style={{ fontSize: 11, color: "#16A34A", marginTop: 10 }}>Ao confirmar, o sistema lança automaticamente {fmt(valorFerias + valorAbono)} no Contas a Pagar, com a operação gerencial de férias.</div>
        {erro && <div style={{ color: "#E24B4A", fontSize: 12, marginTop: 10 }}>{erro}</div>}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 16 }}>
          <button onClick={onClose} style={{ padding: "8px 16px", borderRadius: 8, border: "0.5px solid #DDE2EE", background: "transparent", cursor: "pointer", fontSize: 13 }}>Cancelar</button>
          <button onClick={confirmar} disabled={saving} style={{ padding: "8px 16px", borderRadius: 8, border: "none", background: "#C9921B", color: "#fff", fontWeight: 700, cursor: "pointer", fontSize: 13 }}>{saving ? "Lançando…" : "Conceder e lançar no financeiro"}</button>
        </div>
      </div>
    </div>
  );
}
