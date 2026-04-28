"use client";
import { useState, useEffect, useCallback } from "react";
import TopNav from "../../../../components/TopNav";
import { useAuth } from "../../../../components/AuthProvider";
import { supabase } from "../../../../lib/supabase";

const inp: React.CSSProperties = { width: "100%", padding: "8px 10px", border: "0.5px solid #D4DCE8", borderRadius: 8, fontSize: 13, color: "#1a1a1a", background: "#fff", boxSizing: "border-box", outline: "none" };
const lbl: React.CSSProperties = { fontSize: 11, color: "#555", marginBottom: 4, display: "block" };
const btnV: React.CSSProperties = { padding: "8px 20px", background: "#1A4870", color: "#fff", border: "none", borderRadius: 8, fontWeight: 600, cursor: "pointer", fontSize: 13 };
const btnR: React.CSSProperties = { padding: "8px 18px", border: "0.5px solid #D4DCE8", borderRadius: 8, background: "transparent", cursor: "pointer", fontSize: 13, color: "#1a1a1a" };

const fmtBRL  = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fmtData = (s?: string) => s ? new Date(s + "T12:00:00").toLocaleDateString("pt-BR") : "—";
const hoje    = () => new Date().toISOString().split("T")[0];

type TipoMutuo   = "concessao" | "captacao";
type StatusMutuo = "ativo" | "quitado" | "em_atraso";

interface Mutuo {
  id: string; fazenda_id: string; tipo: TipoMutuo; contraparte: string;
  valor_principal: number; taxa_juros_mensal: number;
  data_inicio: string; data_vencimento: string;
  saldo_devedor: number; status: StatusMutuo; observacao?: string;
}
interface PagamentoMutuo {
  id: string; mutuo_id: string; data_pagamento: string;
  valor_principal: number; valor_juros: number; valor_total: number; observacao?: string;
}

const STATUS_META: Record<StatusMutuo, { label: string; bg: string; cl: string }> = {
  ativo:     { label: "Ativo",     bg: "#D5E8F5", cl: "#0B2D50" },
  quitado:   { label: "Quitado",  bg: "#DCFCE7", cl: "#166534" },
  em_atraso: { label: "Em Atraso",bg: "#FCEBEB", cl: "#791F1F" },
};

export default function MutuoPage() {
  const { fazendaId } = useAuth();

  const [mutuos, setMutuos]       = useState<Mutuo[]>([]);
  const [pagamentos, setPagamentos] = useState<PagamentoMutuo[]>([]);
  const [expand, setExpand]        = useState<string | null>(null);

  // Modal Mútuo
  const [modalMutuo, setModalMutuo] = useState(false);
  const [mutuoEdit, setMutuoEdit]   = useState<Mutuo | null>(null);
  const [mForm, setMForm] = useState({ tipo: "concessao" as TipoMutuo, contraparte: "", valor_principal: "", taxa_juros_mensal: "", data_inicio: hoje(), data_vencimento: "", observacao: "" });
  const [mSaving, setMSaving] = useState(false);
  const [mErr, setMErr]       = useState("");

  // Modal Pagamento
  const [modalPag, setModalPag]   = useState<Mutuo | null>(null);
  const [pagForm, setPagForm]     = useState({ data_pagamento: hoje(), valor_principal: "", valor_juros: "", observacao: "" });
  const [pagSaving, setPagSaving] = useState(false);
  const [pagErr, setPagErr]       = useState("");

  const carregar = useCallback(async () => {
    if (!fazendaId) return;
    const { data: md } = await supabase.from("mutuos").select("*").eq("fazenda_id", fazendaId).order("data_inicio", { ascending: false });
    setMutuos(md ?? []);
    if (md && md.length > 0) {
      const { data: pd } = await supabase.from("pagamentos_mutuo").select("*").in("mutuo_id", md.map((m: Mutuo) => m.id)).order("data_pagamento", { ascending: false });
      setPagamentos(pd ?? []);
    }
  }, [fazendaId]);

  useEffect(() => { carregar(); }, [carregar]);

  const ativos      = mutuos.filter(m => m.status === "ativo");
  const concedido   = ativos.filter(m => m.tipo === "concessao").reduce((s, m) => s + m.saldo_devedor, 0);
  const captado     = ativos.filter(m => m.tipo === "captacao" ).reduce((s, m) => s + m.saldo_devedor, 0);
  const emAtraso    = mutuos.filter(m => m.status === "em_atraso").length;

  function abrirMutuo(m?: Mutuo) {
    if (m) {
      setMutuoEdit(m);
      setMForm({ tipo: m.tipo, contraparte: m.contraparte, valor_principal: String(m.valor_principal), taxa_juros_mensal: String(m.taxa_juros_mensal), data_inicio: m.data_inicio, data_vencimento: m.data_vencimento, observacao: m.observacao ?? "" });
    } else {
      setMutuoEdit(null);
      setMForm({ tipo: "concessao", contraparte: "", valor_principal: "", taxa_juros_mensal: "", data_inicio: hoje(), data_vencimento: "", observacao: "" });
    }
    setMErr(""); setModalMutuo(true);
  }

  async function salvarMutuo() {
    if (!fazendaId) return;
    if (!mForm.contraparte.trim()) { setMErr("Informe a contraparte."); return; }
    if (!mForm.valor_principal || isNaN(parseFloat(mForm.valor_principal))) { setMErr("Valor inválido."); return; }
    if (!mForm.data_vencimento) { setMErr("Informe a data de vencimento."); return; }
    setMSaving(true); setMErr("");
    try {
      const vp = parseFloat(mForm.valor_principal);
      const payload = { fazenda_id: fazendaId, tipo: mForm.tipo, contraparte: mForm.contraparte.trim(), valor_principal: vp, taxa_juros_mensal: parseFloat(mForm.taxa_juros_mensal) || 0, data_inicio: mForm.data_inicio, data_vencimento: mForm.data_vencimento, saldo_devedor: mutuoEdit ? mutuoEdit.saldo_devedor : vp, status: (mutuoEdit ? mutuoEdit.status : "ativo") as StatusMutuo, observacao: mForm.observacao || null };
      if (mutuoEdit) { await supabase.from("mutuos").update(payload).eq("id", mutuoEdit.id); }
      else { await supabase.from("mutuos").insert(payload); }
      await carregar(); setModalMutuo(false);
    } catch (e: unknown) { setMErr(e instanceof Error ? e.message : "Erro ao salvar."); }
    finally { setMSaving(false); }
  }

  async function quitarMutuo(m: Mutuo) {
    if (!confirm(`Marcar mútuo com ${m.contraparte} como quitado?`)) return;
    await supabase.from("mutuos").update({ status: "quitado", saldo_devedor: 0 }).eq("id", m.id);
    await carregar();
  }

  async function registrarPagamento() {
    if (!modalPag) return;
    const vp = parseFloat(pagForm.valor_principal) || 0;
    const vj = parseFloat(pagForm.valor_juros) || 0;
    if (vp + vj <= 0) { setPagErr("Informe ao menos um valor."); return; }
    setPagSaving(true); setPagErr("");
    try {
      await supabase.from("pagamentos_mutuo").insert({ mutuo_id: modalPag.id, data_pagamento: pagForm.data_pagamento, valor_principal: vp, valor_juros: vj, valor_total: vp + vj, observacao: pagForm.observacao || null });
      const novoSaldo = Math.max(0, modalPag.saldo_devedor - vp);
      await supabase.from("mutuos").update({ saldo_devedor: novoSaldo, status: novoSaldo <= 0 ? "quitado" : modalPag.status }).eq("id", modalPag.id);
      await carregar(); setModalPag(null);
    } catch (e: unknown) { setPagErr(e instanceof Error ? e.message : "Erro."); }
    finally { setPagSaving(false); }
  }

  return (
    <div style={{ minHeight: "100vh", background: "#F4F6FA" }}>
      <TopNav />
      <main style={{ maxWidth: 1100, margin: "0 auto", padding: "28px 20px" }}>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 22 }}>
          <div>
            <h1 style={{ fontSize: 20, fontWeight: 700, color: "#1a1a1a", margin: 0 }}>Mútuo entre Empresas</h1>
            <p style={{ fontSize: 13, color: "#666", marginTop: 4, marginBottom: 0 }}>Contratos de empréstimo entre empresas do grupo</p>
          </div>
          <button onClick={() => abrirMutuo()} style={btnV}>+ Novo Mútuo</button>
        </div>

        {/* KPIs */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14, marginBottom: 22 }}>
          {[
            { label: "Saldo Concedido",    value: fmtBRL(concedido), sub: "a receber", color: "#1A4870" },
            { label: "Saldo Captado",      value: fmtBRL(captado),   sub: "a pagar",   color: "#E24B4A" },
            { label: "Contratos Ativos",   value: String(ativos.length), sub: "contratos", color: "#0B2D50" },
            { label: "Em Atraso",          value: String(emAtraso),   sub: "contratos",  color: emAtraso > 0 ? "#E24B4A" : "#666" },
          ].map(k => (
            <div key={k.label} style={{ background: "#fff", borderRadius: 12, border: "0.5px solid #D4DCE8", padding: "16px 18px" }}>
              <div style={{ fontSize: 11, color: "#666", marginBottom: 6 }}>{k.label}</div>
              <div style={{ fontSize: 20, fontWeight: 700, color: k.color }}>{k.value}</div>
              <div style={{ fontSize: 11, color: "#888", marginTop: 2 }}>{k.sub}</div>
            </div>
          ))}
        </div>

        {mutuos.length === 0 ? (
          <div style={{ background: "#fff", borderRadius: 12, border: "0.5px solid #D4DCE8", padding: 48, textAlign: "center", color: "#888", fontSize: 13 }}>
            Nenhum contrato de mútuo cadastrado.
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {mutuos.map(m => {
              const sm = STATUS_META[m.status];
              const pagsMutuo = pagamentos.filter(p => p.mutuo_id === m.id);
              const totalPago = pagsMutuo.reduce((s, p) => s + p.valor_principal, 0);
              const progresso = m.valor_principal > 0 ? (totalPago / m.valor_principal) * 100 : 0;
              const exp = expand === m.id;
              return (
                <div key={m.id} style={{ background: "#fff", borderRadius: 12, border: "0.5px solid #D4DCE8", overflow: "hidden" }}>
                  <div onClick={() => setExpand(exp ? null : m.id)} style={{ display: "grid", gridTemplateColumns: "1fr 120px 120px 120px 130px 180px", alignItems: "center", gap: 12, padding: "14px 18px", cursor: "pointer" }}>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: "#1a1a1a" }}>{m.contraparte}</div>
                      <div style={{ fontSize: 11, color: "#888", marginTop: 2 }}>{m.tipo === "concessao" ? "Concedido" : "Captado"} · {fmtData(m.data_inicio)} → {fmtData(m.data_vencimento)}</div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontSize: 11, color: "#666" }}>Principal</div>
                      <div style={{ fontSize: 13, fontWeight: 600 }}>{fmtBRL(m.valor_principal)}</div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontSize: 11, color: "#666" }}>Saldo Devedor</div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: m.saldo_devedor > 0 ? "#E24B4A" : "#16A34A" }}>{fmtBRL(m.saldo_devedor)}</div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontSize: 11, color: "#666" }}>Taxa/mês</div>
                      <div style={{ fontSize: 13, fontWeight: 600 }}>{m.taxa_juros_mensal}%</div>
                    </div>
                    <div>
                      <div style={{ fontSize: 11, color: "#666", marginBottom: 3 }}>Amortizado</div>
                      <div style={{ height: 6, background: "#EEF1F6", borderRadius: 3 }}><div style={{ height: "100%", width: `${Math.min(100, progresso)}%`, background: "#1A4870", borderRadius: 3 }} /></div>
                      <div style={{ fontSize: 10, color: "#888", marginTop: 2 }}>{progresso.toFixed(0)}%</div>
                    </div>
                    <div style={{ display: "flex", gap: 6, justifyContent: "flex-end", alignItems: "center" }}>
                      <span style={{ fontSize: 10, background: sm.bg, color: sm.cl, padding: "2px 7px", borderRadius: 8, fontWeight: 600 }}>{sm.label}</span>
                      {m.status === "ativo" && <>
                        <button onClick={e => { e.stopPropagation(); setModalPag(m); setPagForm({ data_pagamento: hoje(), valor_principal: "", valor_juros: "", observacao: "" }); setPagErr(""); }} style={{ padding: "4px 10px", border: "0.5px solid #1A487050", borderRadius: 6, background: "#D5E8F5", cursor: "pointer", fontSize: 11, color: "#0B2D50", fontWeight: 600 }}>Pagar</button>
                        <button onClick={e => { e.stopPropagation(); quitarMutuo(m); }} style={{ padding: "4px 10px", border: "0.5px solid #16A34A50", borderRadius: 6, background: "#E8F5E9", cursor: "pointer", fontSize: 11, color: "#1A6B3C", fontWeight: 600 }}>Quitar</button>
                      </>}
                      <button onClick={e => { e.stopPropagation(); abrirMutuo(m); }} style={{ padding: "4px 10px", border: "0.5px solid #D4DCE8", borderRadius: 6, background: "transparent", cursor: "pointer", fontSize: 11, color: "#555" }}>Editar</button>
                    </div>
                  </div>
                  {exp && (
                    <div style={{ borderTop: "0.5px solid #EEF1F6", padding: "12px 18px", background: "#F8FAFB" }}>
                      <div style={{ fontSize: 12, fontWeight: 600, color: "#555", marginBottom: 8 }}>Histórico de Pagamentos</div>
                      {pagsMutuo.length === 0 ? <div style={{ fontSize: 12, color: "#aaa" }}>Nenhum pagamento registrado.</div> : (
                        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                          <thead><tr style={{ background: "#EEF1F6" }}>
                            {["Data", "Principal", "Juros", "Total", "Obs."].map(h => <th key={h} style={{ padding: "6px 10px", textAlign: h === "Obs." ? "left" : "right", color: "#555", fontWeight: 600 }}>{h}</th>)}
                          </tr></thead>
                          <tbody>{pagsMutuo.map(p => (
                            <tr key={p.id} style={{ borderBottom: "0.5px solid #EEF1F6" }}>
                              <td style={{ padding: "6px 10px", textAlign: "right" }}>{fmtData(p.data_pagamento)}</td>
                              <td style={{ padding: "6px 10px", textAlign: "right" }}>{fmtBRL(p.valor_principal)}</td>
                              <td style={{ padding: "6px 10px", textAlign: "right" }}>{fmtBRL(p.valor_juros)}</td>
                              <td style={{ padding: "6px 10px", textAlign: "right", fontWeight: 600 }}>{fmtBRL(p.valor_total)}</td>
                              <td style={{ padding: "6px 10px", color: "#666" }}>{p.observacao ?? "—"}</td>
                            </tr>
                          ))}</tbody>
                        </table>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </main>

      {/* Modal Mútuo */}
      {modalMutuo && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200, overflowY: "auto", padding: "24px 0" }}>
          <div style={{ background: "#fff", borderRadius: 14, width: "100%", maxWidth: 560, margin: "0 20px", boxShadow: "0 16px 48px rgba(0,0,0,0.18)" }}>
            <div style={{ padding: "18px 22px 14px", borderBottom: "0.5px solid #EEF1F6", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: "#1a1a1a" }}>{mutuoEdit ? "Editar Mútuo" : "Novo Contrato de Mútuo"}</div>
              <button onClick={() => setModalMutuo(false)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 20, color: "#888" }}>×</button>
            </div>
            <div style={{ padding: "20px 22px", display: "flex", flexDirection: "column", gap: 14 }}>
              {mErr && <div style={{ background: "#FCEBEB", border: "0.5px solid #F5C6C6", borderRadius: 8, padding: "10px 14px", fontSize: 13, color: "#791F1F" }}>{mErr}</div>}
              <div>
                <label style={lbl}>Tipo</label>
                <div style={{ display: "flex", gap: 10 }}>
                  {([{ v: "concessao", label: "Concessão (a receber)", desc: "Sua empresa emprestou" }, { v: "captacao", label: "Captação (a pagar)", desc: "Outra empresa emprestou" }] as { v: TipoMutuo; label: string; desc: string }[]).map(opt => (
                    <button key={opt.v} onClick={() => setMForm(f => ({ ...f, tipo: opt.v }))} style={{ flex: 1, padding: "12px 14px", border: `2px solid ${mForm.tipo === opt.v ? "#1A4870" : "#D4DCE8"}`, borderRadius: 10, background: mForm.tipo === opt.v ? "#D5E8F5" : "#fff", cursor: "pointer", textAlign: "left" }}>
                      <div style={{ fontSize: 12, fontWeight: 600 }}>{opt.label}</div>
                      <div style={{ fontSize: 11, color: "#666", marginTop: 3 }}>{opt.desc}</div>
                    </button>
                  ))}
                </div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div style={{ gridColumn: "1 / -1" }}>
                  <label style={lbl}>Contraparte (empresa)</label>
                  <input value={mForm.contraparte} onChange={e => setMForm(f => ({ ...f, contraparte: e.target.value }))} style={inp} placeholder="Nome da empresa" />
                </div>
                <div>
                  <label style={lbl}>Valor Principal (R$)</label>
                  <input type="number" step="0.01" min="0" value={mForm.valor_principal} onChange={e => setMForm(f => ({ ...f, valor_principal: e.target.value }))} style={inp} />
                </div>
                <div>
                  <label style={lbl}>Taxa de Juros (% ao mês)</label>
                  <input type="number" step="0.01" min="0" value={mForm.taxa_juros_mensal} onChange={e => setMForm(f => ({ ...f, taxa_juros_mensal: e.target.value }))} style={inp} placeholder="0.00" />
                </div>
                <div>
                  <label style={lbl}>Data de Início</label>
                  <input type="date" value={mForm.data_inicio} onChange={e => setMForm(f => ({ ...f, data_inicio: e.target.value }))} style={inp} />
                </div>
                <div>
                  <label style={lbl}>Data de Vencimento</label>
                  <input type="date" value={mForm.data_vencimento} onChange={e => setMForm(f => ({ ...f, data_vencimento: e.target.value }))} style={inp} />
                </div>
                <div style={{ gridColumn: "1 / -1" }}>
                  <label style={lbl}>Observação</label>
                  <textarea value={mForm.observacao} onChange={e => setMForm(f => ({ ...f, observacao: e.target.value }))} rows={2} style={{ ...inp, resize: "vertical" }} />
                </div>
              </div>
            </div>
            <div style={{ padding: "14px 22px 18px", borderTop: "0.5px solid #EEF1F6", display: "flex", justifyContent: "flex-end", gap: 10 }}>
              <button style={btnR} onClick={() => setModalMutuo(false)}>Cancelar</button>
              <button onClick={salvarMutuo} disabled={mSaving} style={{ ...btnV, background: mSaving ? "#aaa" : "#1A4870", cursor: mSaving ? "default" : "pointer" }}>{mSaving ? "Salvando…" : "Salvar"}</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Pagamento */}
      {modalPag && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200 }}>
          <div style={{ background: "#fff", borderRadius: 14, width: "100%", maxWidth: 440, margin: "0 20px", boxShadow: "0 16px 48px rgba(0,0,0,0.18)" }}>
            <div style={{ padding: "18px 22px 14px", borderBottom: "0.5px solid #EEF1F6", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <div style={{ fontSize: 15, fontWeight: 700, color: "#1a1a1a" }}>Registrar Pagamento</div>
                <div style={{ fontSize: 12, color: "#888", marginTop: 2 }}>{modalPag.contraparte} · saldo {fmtBRL(modalPag.saldo_devedor)}</div>
              </div>
              <button onClick={() => setModalPag(null)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 20, color: "#888" }}>×</button>
            </div>
            <div style={{ padding: "20px 22px", display: "flex", flexDirection: "column", gap: 12 }}>
              {pagErr && <div style={{ background: "#FCEBEB", border: "0.5px solid #F5C6C6", borderRadius: 8, padding: "10px 14px", fontSize: 13, color: "#791F1F" }}>{pagErr}</div>}
              <div>
                <label style={lbl}>Data do Pagamento</label>
                <input type="date" value={pagForm.data_pagamento} onChange={e => setPagForm(f => ({ ...f, data_pagamento: e.target.value }))} style={inp} />
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div>
                  <label style={lbl}>Valor Principal (R$)</label>
                  <input type="number" step="0.01" min="0" value={pagForm.valor_principal} onChange={e => setPagForm(f => ({ ...f, valor_principal: e.target.value }))} style={inp} placeholder="0.00" />
                </div>
                <div>
                  <label style={lbl}>Juros Pagos (R$)</label>
                  <input type="number" step="0.01" min="0" value={pagForm.valor_juros} onChange={e => setPagForm(f => ({ ...f, valor_juros: e.target.value }))} style={inp} placeholder="0.00" />
                </div>
              </div>
              {(parseFloat(pagForm.valor_principal) > 0 || parseFloat(pagForm.valor_juros) > 0) && (
                <div style={{ background: "#F4F6FA", borderRadius: 8, padding: "10px 14px", fontSize: 13 }}>
                  Total: <strong style={{ color: "#1A4870" }}>{fmtBRL((parseFloat(pagForm.valor_principal) || 0) + (parseFloat(pagForm.valor_juros) || 0))}</strong>
                </div>
              )}
              <div>
                <label style={lbl}>Observação</label>
                <input value={pagForm.observacao} onChange={e => setPagForm(f => ({ ...f, observacao: e.target.value }))} style={inp} />
              </div>
            </div>
            <div style={{ padding: "14px 22px 18px", borderTop: "0.5px solid #EEF1F6", display: "flex", justifyContent: "flex-end", gap: 10 }}>
              <button style={btnR} onClick={() => setModalPag(null)}>Cancelar</button>
              <button onClick={registrarPagamento} disabled={pagSaving} style={{ ...btnV, background: pagSaving ? "#aaa" : "#1A4870", cursor: pagSaving ? "default" : "pointer" }}>{pagSaving ? "Registrando…" : "Registrar"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
