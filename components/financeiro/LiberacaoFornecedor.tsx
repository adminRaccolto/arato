"use client";
// Contrato financeiro → Liberação → "Liberação direta ao fornecedor" (29/10/2026). O banco pagou o fornecedor: escolhe os
// CPs em aberto da compra (ex.: NF de máquina), quanto o financiamento quita de cada um e as máquinas que ficam alienadas
// ao banco. A rota /api/financeiro/contratos/liberacao-fornecedor quita os CPs sem caixa (conta transitória), registra a
// captação e cria a garantia (Seção 392).
import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { supabase } from "../../lib/supabase";
import type { ContaBancaria, ContratoFinanceiro, Maquina } from "../../lib/supabase";
import { useAuth } from "../AuthProvider";
import InputData from "../InputData";
import SelectBusca from "../SelectBusca";
import { confirmarAcao } from "../ConfirmarAcao";

type Cp = { id: string; descricao: string; valor: number; valor_pago: number | null; data_vencimento: string; numero_documento: string | null; nf_entrada_id: string | null; status: string; pessoas?: { nome: string } | null };

const fmtBRL = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fmtData = (s?: string | null) => s ? s.slice(0, 10).split("-").reverse().join("/") : "—";
const numBR = (v: string) => parseFloat(String(v ?? "").replace(/\./g, "").replace(",", ".")) || 0;
const saldo = (c: Cp) => Math.round((Number(c.valor) - Number(c.valor_pago ?? 0)) * 100) / 100;

export default function LiberacaoFornecedor({ contrato, contas, onFeito }: { contrato: ContratoFinanceiro; contas: ContaBancaria[]; onFeito: () => void }) {
  const { fazendaIds, fazendaId } = useAuth();
  const ids = useMemo(() => (fazendaIds?.length ? fazendaIds : fazendaId ? [fazendaId] : []), [fazendaIds, fazendaId]);
  const [aberto, setAberto] = useState(false);
  const [data, setData] = useState(new Date().toISOString().slice(0, 10));
  const transitorias = contas.filter(c => c.tipo_conta === "transitoria");
  const [conta, setConta] = useState("");
  const [busca, setBusca] = useState("");
  const [cps, setCps] = useState<Cp[]>([]);
  const [sel, setSel] = useState<Record<string, string>>({});   // id → valor a quitar (texto)
  const [maquinas, setMaquinas] = useState<Maquina[]>([]);
  const [maqSel, setMaqSel] = useState<Set<string>>(new Set());
  const [erro, setErro] = useState("");
  const [msg, setMsg] = useState("");
  const [ocupado, setOcupado] = useState(false);

  useEffect(() => { if (!conta && transitorias[0]) setConta(transitorias[0].id); }, [transitorias.length]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!aberto || !ids.length) return;
    supabase.from("maquinas").select("*").in("fazenda_id", ids).order("nome").then(({ data: m }) => setMaquinas((m ?? []) as Maquina[]));
  }, [aberto, ids.join(",")]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!aberto || !ids.length) return;
    const t = setTimeout(async () => {
      let q = supabase.from("lancamentos").select("id, descricao, valor, valor_pago, data_vencimento, numero_documento, nf_entrada_id, status, natureza, moeda, pessoas(nome)")
        .in("fazenda_id", ids).eq("tipo", "pagar").in("status", ["em_aberto", "vencido", "vencendo", "parcial"]);
      const s = busca.trim();
      if (s) q = q.or(`descricao.ilike.%${s}%,numero_documento.ilike.%${s}%`);
      const { data: r } = await q.order("data_vencimento").limit(150);
      // Previsão (natureza "previsao") e título em US$ não são quitados por aqui
      setCps(((r ?? []) as unknown as (Cp & { natureza?: string | null; moeda?: string | null })[]).filter(c => c.natureza !== "previsao" && (c.moeda ?? "BRL") === "BRL"));
    }, 300);
    return () => clearTimeout(t);
  }, [aberto, busca, ids.join(",")]); // eslint-disable-line react-hooks/exhaustive-deps

  // Máquinas das NFs dos CPs marcados (itens da NF com máquina, ou máquina cadastrada com o nº da NF) — sugeridas para alienar
  const nfIds = useMemo(() => [...new Set(cps.filter(c => sel[c.id] != null && c.nf_entrada_id).map(c => c.nf_entrada_id!))], [cps, sel]);
  useEffect(() => {
    if (!nfIds.length) return;
    (async () => {
      const [{ data: its }, { data: nfs }] = await Promise.all([
        supabase.from("nf_entrada_itens").select("maquina_id").in("nf_entrada_id", nfIds).not("maquina_id", "is", null),
        supabase.from("nf_entradas").select("numero").in("id", nfIds),
      ]);
      const nums = new Set((nfs ?? []).map(n => String(n.numero)));
      const sugeridas = new Set([...(its ?? []).map(i => i.maquina_id as string), ...maquinas.filter(m => m.nr_nf_aquisicao && nums.has(String(m.nr_nf_aquisicao))).map(m => m.id)]);
      if (sugeridas.size) setMaqSel(p => new Set([...p, ...sugeridas]));
    })();
  }, [nfIds.join(","), maquinas.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const marcados = cps.filter(c => sel[c.id] != null);
  const total = marcados.reduce((t, c) => t + numBR(sel[c.id]), 0);

  async function liberar() {
    setErro(""); setMsg("");
    if (!marcados.length) { setErro("Marque o(s) título(s) que o banco pagou."); return; }
    const itens = marcados.map(c => ({ lancamento_id: c.id, valor: numBR(sel[c.id]) }));
    if (itens.some(i => !(i.valor > 0))) { setErro("Informe o valor quitado de cada título marcado."); return; }
    const nMaq = maqSel.size;
    if (!(await confirmarAcao({ titulo: "Liberação direta ao fornecedor", perigo: false, textoConfirmar: "Quitar pelo financiamento",
      mensagem: `${itens.length} título(s) quitado(s) pelo financiamento, total ${fmtBRL(total)}, em ${fmtData(data)}. Os títulos ficam pagos sem movimentar o caixa${conta ? ` (conta ${contas.find(x => x.id === conta)?.nome})` : ""} e a captação do contrato é registrada no mesmo valor.${nMaq ? ` ${nMaq} máquina(s) ficam alienadas ao banco.` : ""}` }))) return;
    setOcupado(true);
    try {
      const r = await fetch("/api/financeiro/contratos/liberacao-fornecedor", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ acao: "liberar", contrato_id: contrato.id, data, conta_transitoria_id: conta || null, itens, maquinas: [...maqSel] }) });
      const j = await r.json().catch(() => ({})) as { ok?: boolean; error?: string; total?: number; alienadas?: number };
      if (!j.ok) { setErro(j.error ?? `Erro HTTP ${r.status}`); return; }
      setMsg(`✓ ${itens.length} título(s) quitado(s) pelo financiamento (${fmtBRL(j.total ?? total)}).${j.alienadas ? ` ${j.alienadas} máquina(s) alienada(s) — veja a aba Garantias.` : ""}`);
      setSel({}); setMaqSel(new Set()); onFeito();
    } finally { setOcupado(false); }
  }

  const inp: CSSProperties = { fontSize: 12, padding: "6px 9px", border: "0.5px solid #DDE2EE", borderRadius: 8, background: "#fff" };
  const th: CSSProperties = { textAlign: "left", fontSize: 11, color: "#555", fontWeight: 600, padding: "5px 8px", borderBottom: "0.5px solid #DDE2EE", whiteSpace: "nowrap" };
  const td: CSSProperties = { fontSize: 12, padding: "5px 8px", borderBottom: "0.5px solid #EEF1F6", fontVariantNumeric: "tabular-nums" };

  if (!aberto) return (
    <button type="button" onClick={() => setAberto(true)} style={{ ...inp, marginBottom: 14, border: "0.5px solid #1A4870", color: "#1A4870", fontWeight: 600, cursor: "pointer" }}>
      🏦 Liberação direta ao fornecedor (quitar CP)
    </button>
  );
  return (
    <div style={{ border: "0.5px solid #1A4870", borderRadius: 10, padding: "12px 14px", marginBottom: 16, background: "#F4F6FA" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
        <strong style={{ fontSize: 13, color: "#0B2D50" }}>🏦 Liberação direta ao fornecedor</strong>
        <button type="button" onClick={() => setAberto(false)} style={{ border: "none", background: "none", cursor: "pointer", color: "#555" }}>✕</button>
      </div>
      <div style={{ fontSize: 11, color: "#555", marginBottom: 10 }}>O banco pagou o fornecedor (ex.: máquina comprada com recurso próprio e quitada pelo financiamento). Os títulos marcados ficam pagos sem movimentar o caixa e a captação deste contrato é registrada no mesmo valor. As parcelas do contrato continuam sendo lançadas na aba Pagamento.</div>
      {erro && <div style={{ padding: 8, background: "#FEF2F2", color: "#B91C1C", borderRadius: 8, fontSize: 12, marginBottom: 8 }}>{erro}</div>}
      {msg && <div style={{ padding: 8, background: "#E8F5E9", color: "#1A6B3C", borderRadius: 8, fontSize: 12, marginBottom: 8 }}>{msg}</div>}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end", marginBottom: 10 }}>
        <div><div style={{ fontSize: 11, color: "#555", marginBottom: 3 }}>Data da liberação</div><InputData type="date" value={data} onChange={e => setData(e.target.value)} style={inp} /></div>
        <div><div style={{ fontSize: 11, color: "#555", marginBottom: 3 }}>Conta (sem movimento de caixa)</div>
          <select value={conta} onChange={e => setConta(e.target.value)} style={inp}>
            <option value="">— sem conta —</option>
            {(transitorias.length ? transitorias : contas).map(c => <option key={c.id} value={c.id}>{c.nome}{c.tipo_conta === "transitoria" ? " (transitória)" : ""}</option>)}
          </select></div>
        <div style={{ flex: "1 1 240px" }}><div style={{ fontSize: 11, color: "#555", marginBottom: 3 }}>Buscar título (fornecedor, descrição, nº documento)</div>
          <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="ex.: RZK, 157115" style={{ ...inp, width: "100%", boxSizing: "border-box" }} /></div>
      </div>
      <div style={{ maxHeight: 260, overflow: "auto", background: "#fff", border: "0.5px solid #DDE2EE", borderRadius: 8, marginBottom: 10 }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead><tr><th style={th} /><th style={th}>Título</th><th style={th}>Fornecedor</th><th style={th}>Vencimento</th><th style={{ ...th, textAlign: "right" }}>Saldo</th><th style={{ ...th, textAlign: "right" }}>Quitar (R$)</th></tr></thead>
          <tbody>
            {!cps.length ? <tr><td colSpan={6} style={{ ...td, textAlign: "center", color: "#888", padding: 16 }}>Nenhum título a pagar em aberto encontrado.</td></tr>
              : cps.map(c => {
                const on = sel[c.id] != null;
                return (
                  <tr key={c.id} style={{ background: on ? "#D5E8F5" : undefined }}>
                    <td style={td}><input type="checkbox" checked={on} onChange={e => setSel(p => { const n = { ...p }; if (e.target.checked) n[c.id] = saldo(c).toFixed(2).replace(".", ","); else delete n[c.id]; return n; })} /></td>
                    <td style={td}>{c.descricao}{c.numero_documento ? <div style={{ fontSize: 10, color: "#666" }}>Nº {c.numero_documento}</div> : null}</td>
                    <td style={td}>{c.pessoas?.nome ?? "—"}</td>
                    <td style={td}>{fmtData(c.data_vencimento)}</td>
                    <td style={{ ...td, textAlign: "right" }}>{fmtBRL(saldo(c))}</td>
                    <td style={{ ...td, textAlign: "right" }}>{on && <input value={sel[c.id]} onChange={e => setSel(p => ({ ...p, [c.id]: e.target.value }))} style={{ ...inp, width: 110, textAlign: "right" }} />}</td>
                  </tr>
                );
              })}
          </tbody>
        </table>
      </div>
      <div style={{ fontSize: 12, fontWeight: 600, color: "#0B2D50", marginBottom: 4 }}>Máquinas alienadas ao banco (garantia)</div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 10 }}>
        {[...maqSel].map(id => { const m = maquinas.find(x => x.id === id); return (
          <span key={id} style={{ fontSize: 11, background: "#EDE9FB", color: "#4B3B9B", borderRadius: 8, padding: "3px 8px", fontWeight: 600 }}>
            {m?.nome ?? "máquina"} <button type="button" onClick={() => setMaqSel(p => { const n = new Set(p); n.delete(id); return n; })} style={{ border: "none", background: "none", cursor: "pointer", color: "#4B3B9B" }}>✕</button>
          </span>); })}
        <div style={{ minWidth: 260 }}>
          <SelectBusca value="" onChange={v => v && setMaqSel(p => new Set([...p, v]))} placeholder="+ alienar outra máquina"
            options={maquinas.filter(m => !maqSel.has(m.id)).map(m => ({ value: m.id, label: `${m.nome}${m.placa ? ` · ${m.placa}` : ""}${m.nr_nf_aquisicao ? ` · NF ${m.nr_nf_aquisicao}` : ""}` }))} style={inp} />
        </div>
        {!maqSel.size && <span style={{ fontSize: 11, color: "#666" }}>Nenhuma (custeio, insumos…). Máquinas das NFs dos títulos marcados entram sozinhas.</span>}
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontSize: 12 }}>{marcados.length} título(s) · Total quitado pelo financiamento: <strong>{fmtBRL(total)}</strong>{contrato.moeda === "USD" && contrato.valor_cotacao ? ` (≈ US$ ${(total / contrato.valor_cotacao).toLocaleString("pt-BR", { maximumFractionDigits: 2 })})` : ""}</span>
        <button type="button" disabled={ocupado || !marcados.length} onClick={liberar} style={{ ...inp, background: marcados.length ? "#1A4870" : "#9AA9BC", color: "#fff", border: "none", fontWeight: 600, cursor: marcados.length ? "pointer" : "default" }}>
          {ocupado ? "Gravando…" : "Quitar pelo financiamento"}
        </button>
      </div>
    </div>
  );
}
