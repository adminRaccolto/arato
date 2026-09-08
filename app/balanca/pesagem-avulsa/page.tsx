"use client";
import React, { useState, useEffect, useCallback } from "react";
import TopNav from "../../../components/TopNav";
import { useAuth } from "../../../components/AuthProvider";
import { createBrowserClient } from "@supabase/ssr";

type Tipo = "neutra" | "entrada" | "saida";
type Status = "aguardando_bruto" | "finalizado" | "cancelado";

interface Pesagem {
  id: string;
  tipo: Tipo;
  status: Status;
  placa: string | null;
  motorista: string | null;
  produto: string | null;
  fornecedor_cliente: string | null;
  peso_tara_kg: number | null;
  peso_bruto_kg: number | null;
  peso_liquido_kg: number | null;
  data_tara: string | null;
  data_bruto: string | null;
  usuario_tara: string | null;
  usuario_bruto: string | null;
  observacao: string | null;
  created_at: string;
}

const TIPO_LABEL: Record<Tipo, string> = { neutra: "Neutra", entrada: "Entrada", saida: "Saída" };
const TIPO_COR:   Record<Tipo, { bg: string; color: string }> = {
  neutra:  { bg: "#E8E8E8",  color: "#333" },
  entrada: { bg: "#DCFCE7",  color: "#15803D" },
  saida:   { bg: "#FEE2E2",  color: "#B91C1C" },
};

const fmtKg  = (v: number | null) => v == null ? "—" : `${v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} kg`;
const fmtTs  = (s: string | null) => !s ? "—" : new Date(s).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" });
const fmtHM  = (s: string | null) => !s ? "" : new Date(s).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

const inp: React.CSSProperties = {
  width: "100%", padding: "9px 11px", border: "0.5px solid var(--border-table)",
  borderRadius: 8, fontSize: 13, color: "var(--text-1)", background: "var(--bg-input)",
  boxSizing: "border-box", outline: "none",
};
const lbl: React.CSSProperties = { fontSize: 11, color: "var(--text-2)", marginBottom: 4, display: "block" };

export default function PesagemAvulsa() {
  const { fazendaId, nomeFazendaSelecionada, nomeUsuario } = useAuth();
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );

  const [pesagens,     setPesagens]     = useState<Pesagem[]>([]);
  const [carregando,   setCarregando]   = useState(true);
  const [abaPrincipal, setAbaPrincipal] = useState<"andamento" | "finalizadas">("andamento");
  const [filtrTipo,    setFiltrTipo]    = useState<Tipo | "todos">("todos");

  // Modal 1ª pesagem (tara)
  const [modalTara,  setModalTara]  = useState(false);
  const [formTara,   setFormTara]   = useState({
    tipo: "neutra" as Tipo,
    placa: "", motorista: "", produto: "",
    fornecedor_cliente: "", peso_tara_kg: "", observacao: "",
  });
  const [salvandoTara, setSalvandoTara] = useState(false);

  // Modal 2ª pesagem (bruto)
  const [modalBruto,  setModalBruto]  = useState(false);
  const [pesagemSel,  setPesagemSel]  = useState<Pesagem | null>(null);
  const [pesoBrutoStr, setPesoBrutoStr] = useState("");
  const [salvandoBruto, setSalvandoBruto] = useState(false);

  // Modal cancelar
  const [modalCancel, setModalCancel] = useState(false);
  const [cancelId,    setCancelId]    = useState<string | null>(null);

  const carregar = useCallback(async () => {
    if (!fazendaId) return;
    setCarregando(true);
    const { data } = await supabase
      .from("pesagens_avulsas")
      .select("*")
      .eq("fazenda_id", fazendaId)
      .order("created_at", { ascending: false })
      .limit(500);
    setPesagens((data as Pesagem[]) ?? []);
    setCarregando(false);
  }, [fazendaId]);

  useEffect(() => { carregar(); }, [carregar]);

  // ── Salvar 1ª pesagem (tara) ─────────────────────────────────
  const salvarTara = async () => {
    if (!fazendaId) return;
    const pesoNum = parseFloat(formTara.peso_tara_kg.replace(",", "."));
    if (isNaN(pesoNum) || pesoNum <= 0) { alert("Informe o peso de tara válido."); return; }
    setSalvandoTara(true);
    const { error } = await supabase.from("pesagens_avulsas").insert({
      fazenda_id:         fazendaId,
      tipo:               formTara.tipo,
      status:             "aguardando_bruto",
      placa:              formTara.placa.toUpperCase() || null,
      motorista:          formTara.motorista || null,
      produto:            formTara.produto || null,
      fornecedor_cliente: formTara.fornecedor_cliente || null,
      peso_tara_kg:       pesoNum,
      data_tara:          new Date().toISOString(),
      usuario_tara:       nomeUsuario ?? null,
      observacao:         formTara.observacao || null,
    });
    setSalvandoTara(false);
    if (error) { alert("Erro ao salvar: " + error.message); return; }
    setModalTara(false);
    setFormTara({ tipo: "neutra", placa: "", motorista: "", produto: "", fornecedor_cliente: "", peso_tara_kg: "", observacao: "" });
    carregar();
  };

  // ── Salvar 2ª pesagem (bruto) ────────────────────────────────
  const salvarBruto = async () => {
    if (!pesagemSel) return;
    const bruto = parseFloat(pesoBrutoStr.replace(",", "."));
    if (isNaN(bruto) || bruto <= 0) { alert("Informe o peso bruto válido."); return; }
    const tara = pesagemSel.peso_tara_kg ?? 0;
    const liquido = bruto - tara;
    if (liquido < 0) { alert("Peso bruto não pode ser menor que a tara."); return; }
    setSalvandoBruto(true);
    const { error } = await supabase
      .from("pesagens_avulsas")
      .update({
        peso_bruto_kg:  bruto,
        peso_liquido_kg: liquido,
        data_bruto:     new Date().toISOString(),
        usuario_bruto:  nomeUsuario ?? null,
        status:         "finalizado",
      })
      .eq("id", pesagemSel.id);
    setSalvandoBruto(false);
    if (error) { alert("Erro ao finalizar: " + error.message); return; }
    setModalBruto(false);
    setPesagemSel(null);
    setPesoBrutoStr("");
    carregar();
  };

  // ── Cancelar ticket ──────────────────────────────────────────
  const cancelar = async () => {
    if (!cancelId) return;
    await supabase.from("pesagens_avulsas").update({ status: "cancelado" }).eq("id", cancelId);
    setModalCancel(false);
    setCancelId(null);
    carregar();
  };

  // ── Filtros ──────────────────────────────────────────────────
  const emAndamento = pesagens.filter(p =>
    p.status === "aguardando_bruto" &&
    (filtrTipo === "todos" || p.tipo === filtrTipo)
  );
  const finalizadas = pesagens.filter(p =>
    (p.status === "finalizado" || p.status === "cancelado") &&
    (filtrTipo === "todos" || p.tipo === filtrTipo)
  );

  const brutoNum = parseFloat(pesoBrutoStr.replace(",", "."));
  const liquidoPrev = pesagemSel && !isNaN(brutoNum) && brutoNum > 0
    ? brutoNum - (pesagemSel.peso_tara_kg ?? 0)
    : null;

  // ── UI helpers ───────────────────────────────────────────────
  const BadgeTipo = ({ tipo }: { tipo: Tipo }) => (
    <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 5, background: TIPO_COR[tipo].bg, color: TIPO_COR[tipo].color, letterSpacing: "0.04em" }}>
      {TIPO_LABEL[tipo].toUpperCase()}
    </span>
  );

  const SegTipo = ({ value, onChange }: { value: Tipo; onChange: (v: Tipo) => void }) => (
    <div style={{ display: "flex", border: "0.5px solid var(--border-table)", borderRadius: 8, overflow: "hidden" }}>
      {(["neutra","entrada","saida"] as Tipo[]).map(t => (
        <button key={t} onClick={() => onChange(t)}
          style={{ flex: 1, padding: "8px 0", fontSize: 12, fontWeight: value === t ? 700 : 400, cursor: "pointer", border: "none", borderRight: t !== "saida" ? "0.5px solid var(--border-table)" : "none", background: value === t ? TIPO_COR[t].bg : "var(--bg-input)", color: value === t ? TIPO_COR[t].color : "var(--text-2)", transition: "all .15s" }}>
          {TIPO_LABEL[t]}
        </button>
      ))}
    </div>
  );

  return (
    <>
      <TopNav />
      <div style={{ maxWidth: 1300, margin: "0 auto", padding: "24px 20px" }}>

        {/* ── Cabeçalho ── */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
          <div>
            <h1 style={{ fontSize: 20, fontWeight: 700, color: "var(--text-1)", margin: 0 }}>Pesagem Avulsa</h1>
            <div style={{ fontSize: 12, color: "var(--text-3)", marginTop: 3 }}>{nomeFazendaSelecionada}</div>
          </div>
          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            {/* Filtro de tipo */}
            <div style={{ display: "flex", border: "0.5px solid var(--border-table)", borderRadius: 8, overflow: "hidden" }}>
              {(["todos","neutra","entrada","saida"] as const).map((t, i) => (
                <button key={t} onClick={() => setFiltrTipo(t)}
                  style={{ padding: "7px 14px", fontSize: 12, fontWeight: filtrTipo === t ? 700 : 400, cursor: "pointer", border: "none", borderRight: i < 3 ? "0.5px solid var(--border-table)" : "none", background: filtrTipo === t ? (t === "todos" ? "#1A5CB8" : TIPO_COR[t].bg) : "var(--bg-card)", color: filtrTipo === t ? (t === "todos" ? "#fff" : TIPO_COR[t].color) : "var(--text-2)" }}>
                  {t === "todos" ? "Todos" : TIPO_LABEL[t]}
                </button>
              ))}
            </div>
            <button onClick={() => carregar()} style={{ padding: "8px 14px", borderRadius: 8, border: "0.5px solid var(--border-table)", background: "var(--bg-card)", color: "var(--text-2)", fontSize: 12, cursor: "pointer" }}>
              ↻ Atualizar
            </button>
            <button onClick={() => setModalTara(true)}
              style={{ padding: "9px 18px", borderRadius: 8, background: "#1A5CB8", color: "#fff", border: "none", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
              + Nova Pesagem (Tara)
            </button>
          </div>
        </div>

        {/* ── KPIs ── */}
        {!carregando && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 12, marginBottom: 20 }}>
            {[
              { label: "Em Andamento",     v: pesagens.filter(p => p.status === "aguardando_bruto").length, color: "#C9921B" },
              { label: "Finalizadas hoje", v: pesagens.filter(p => p.status === "finalizado" && p.data_bruto?.startsWith(new Date().toISOString().slice(0,10))).length, color: "#16A34A" },
              { label: "Total hoje",       v: pesagens.filter(p => p.created_at?.startsWith(new Date().toISOString().slice(0,10))).length, color: "#1A5CB8" },
              { label: "Canceladas",       v: pesagens.filter(p => p.status === "cancelado").length, color: "#888" },
            ].map((k, i) => (
              <div key={i} style={{ background: "var(--bg-card)", border: "0.5px solid var(--border-table)", borderRadius: 10, padding: "14px 18px" }}>
                <div style={{ fontSize: 10, color: "var(--text-3)", marginBottom: 4 }}>{k.label}</div>
                <div style={{ fontSize: 24, fontWeight: 700, color: k.color }}>{k.v}</div>
              </div>
            ))}
          </div>
        )}

        {/* ── Tabs ── */}
        <div style={{ display: "flex", borderBottom: "0.5px solid var(--border-table)", marginBottom: 16, gap: 2 }}>
          {([["andamento","Em Andamento",emAndamento.length],["finalizadas","Finalizadas",finalizadas.length]] as const).map(([id, label, count]) => (
            <button key={id} onClick={() => setAbaPrincipal(id)}
              style={{ padding: "10px 20px", fontSize: 13, fontWeight: abaPrincipal === id ? 700 : 400, color: abaPrincipal === id ? "#1A5CB8" : "var(--text-2)", background: "none", border: "none", borderBottom: abaPrincipal === id ? "2px solid #1A5CB8" : "2px solid transparent", cursor: "pointer" }}>
              {label} <span style={{ fontSize: 11, marginLeft: 4, color: abaPrincipal === id ? "#1A5CB8" : "var(--text-3)" }}>({count})</span>
            </button>
          ))}
        </div>

        {/* ── Lista Em Andamento ── */}
        {abaPrincipal === "andamento" && (
          carregando ? (
            <div style={{ textAlign: "center", padding: 40, color: "var(--text-3)" }}>Carregando…</div>
          ) : emAndamento.length === 0 ? (
            <div style={{ textAlign: "center", padding: 60, color: "var(--text-3)", fontSize: 14 }}>
              <div style={{ fontSize: 40, marginBottom: 12 }}>⚖️</div>
              Nenhuma pesagem aguardando peso bruto.
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {emAndamento.map(p => (
                <div key={p.id} style={{ background: "var(--bg-card)", border: "0.5px solid var(--border-table)", borderRadius: 12, padding: "16px 20px", display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
                  {/* Tipo badge */}
                  <div style={{ minWidth: 60, textAlign: "center" }}><BadgeTipo tipo={p.tipo} /></div>

                  {/* Dados principais */}
                  <div style={{ flex: 1, minWidth: 200 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
                      <span style={{ fontSize: 15, fontWeight: 700, color: "var(--text-1)" }}>{p.placa || "Sem placa"}</span>
                      <span style={{ fontSize: 12, color: "var(--text-3)" }}>{p.motorista || ""}</span>
                    </div>
                    <div style={{ fontSize: 12, color: "var(--text-2)" }}>
                      {p.produto && <span style={{ marginRight: 10 }}>📦 {p.produto}</span>}
                      {p.fornecedor_cliente && <span>🏢 {p.fornecedor_cliente}</span>}
                    </div>
                  </div>

                  {/* Pesos */}
                  <div style={{ display: "flex", gap: 24, alignItems: "center" }}>
                    <div style={{ textAlign: "center" }}>
                      <div style={{ fontSize: 10, color: "var(--text-3)" }}>Tara</div>
                      <div style={{ fontSize: 15, fontWeight: 700, color: "var(--text-1)" }}>{fmtKg(p.peso_tara_kg)}</div>
                      <div style={{ fontSize: 10, color: "var(--text-3)" }}>{fmtHM(p.data_tara)}</div>
                    </div>
                    <div style={{ fontSize: 22, color: "var(--border)" }}>→</div>
                    <div style={{ textAlign: "center" }}>
                      <div style={{ fontSize: 10, color: "#C9921B" }}>Bruto</div>
                      <div style={{ fontSize: 15, fontWeight: 700, color: "#C9921B" }}>Aguardando</div>
                    </div>
                  </div>

                  {/* Ações */}
                  <div style={{ display: "flex", gap: 8 }}>
                    <button onClick={() => { setPesagemSel(p); setPesoBrutoStr(""); setModalBruto(true); }}
                      style={{ padding: "9px 18px", borderRadius: 8, background: "#1A5CB8", color: "#fff", border: "none", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
                      ⚖ Pesar Bruto
                    </button>
                    <button onClick={() => { setCancelId(p.id); setModalCancel(true); }}
                      style={{ padding: "9px 14px", borderRadius: 8, background: "var(--bg-page)", color: "#E24B4A", border: "0.5px solid #E24B4A", fontSize: 12, cursor: "pointer" }}>
                      Cancelar
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )
        )}

        {/* ── Lista Finalizadas ── */}
        {abaPrincipal === "finalizadas" && (
          carregando ? (
            <div style={{ textAlign: "center", padding: 40, color: "var(--text-3)" }}>Carregando…</div>
          ) : finalizadas.length === 0 ? (
            <div style={{ textAlign: "center", padding: 60, color: "var(--text-3)", fontSize: 14 }}>Nenhuma pesagem finalizada ou cancelada.</div>
          ) : (
            <div style={{ background: "var(--bg-card)", border: "0.5px solid var(--border-table)", borderRadius: 12, overflow: "hidden" }}>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                  <thead>
                    <tr style={{ background: "var(--bg-page)", borderBottom: "0.5px solid var(--border-table)" }}>
                      {["Tipo","Placa","Motorista","Produto","Fornec./Cliente","Tara (kg)","Bruto (kg)","Líquido (kg)","Data Tara","Data Bruto","Status","Operadores"].map(h => (
                        <th key={h} style={{ padding: "10px 12px", textAlign: "left", fontSize: 11, fontWeight: 600, color: "var(--text-2)", whiteSpace: "nowrap" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {finalizadas.map((p, i) => (
                      <tr key={p.id} style={{ borderBottom: "0.5px solid var(--border-row)", background: i % 2 === 0 ? "#fff" : "#FAFBFD" }}>
                        <td style={{ padding: "9px 12px" }}><BadgeTipo tipo={p.tipo} /></td>
                        <td style={{ padding: "9px 12px", fontWeight: 600 }}>{p.placa || "—"}</td>
                        <td style={{ padding: "9px 12px", color: "var(--text-2)" }}>{p.motorista || "—"}</td>
                        <td style={{ padding: "9px 12px" }}>{p.produto || "—"}</td>
                        <td style={{ padding: "9px 12px", color: "var(--text-2)" }}>{p.fornecedor_cliente || "—"}</td>
                        <td style={{ padding: "9px 12px", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{fmtKg(p.peso_tara_kg)}</td>
                        <td style={{ padding: "9px 12px", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{fmtKg(p.peso_bruto_kg)}</td>
                        <td style={{ padding: "9px 12px", textAlign: "right", fontWeight: 700, color: p.status === "finalizado" ? "#111" : "#bbb", fontVariantNumeric: "tabular-nums" }}>{p.status === "finalizado" ? fmtKg(p.peso_liquido_kg) : "—"}</td>
                        <td style={{ padding: "9px 12px", fontSize: 11, color: "var(--text-3)", whiteSpace: "nowrap" }}>{fmtTs(p.data_tara)}</td>
                        <td style={{ padding: "9px 12px", fontSize: 11, color: "var(--text-3)", whiteSpace: "nowrap" }}>{fmtTs(p.data_bruto)}</td>
                        <td style={{ padding: "9px 12px" }}>
                          {p.status === "finalizado"
                            ? <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 5, background: "#DCFCE7", color: "#15803D" }}>FINALIZADO</span>
                            : <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 5, background: "#FEE2E2", color: "#B91C1C" }}>CANCELADO</span>
                          }
                        </td>
                        <td style={{ padding: "9px 12px", fontSize: 11, color: "var(--text-3)" }}>
                          {p.usuario_tara && <div>Tara: {p.usuario_tara}</div>}
                          {p.usuario_bruto && <div>Bruto: {p.usuario_bruto}</div>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )
        )}
      </div>

      {/* ════════════ MODAL TARA ════════════ */}
      {modalTara && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.45)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
          <div style={{ background: "var(--bg-card)", borderRadius: 16, width: "100%", maxWidth: 520, boxShadow: "0 20px 60px rgba(0,0,0,.25)", overflow: "hidden" }}>
            <div style={{ padding: "18px 24px", borderBottom: "0.5px solid var(--border-row)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div>
                <div style={{ fontSize: 16, fontWeight: 700, color: "var(--text-1)" }}>1ª Pesagem — Tara</div>
                <div style={{ fontSize: 11, color: "var(--text-3)", marginTop: 2 }}>Registra a tara do veículo. O ticket ficará aberto para a 2ª pesagem (bruto).</div>
              </div>
              <button onClick={() => setModalTara(false)} style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer", color: "var(--text-3)", padding: 4 }}>✕</button>
            </div>

            <div style={{ padding: "20px 24px", display: "flex", flexDirection: "column", gap: 16 }}>
              {/* Tipo */}
              <div>
                <span style={lbl}>Tipo de Pesagem</span>
                <SegTipo value={formTara.tipo} onChange={v => setFormTara(f => ({ ...f, tipo: v }))} />
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div>
                  <span style={lbl}>Placa</span>
                  <input value={formTara.placa} onChange={e => setFormTara(f => ({ ...f, placa: e.target.value.toUpperCase() }))} placeholder="AAA-0000" style={inp} maxLength={10} />
                </div>
                <div>
                  <span style={lbl}>Motorista</span>
                  <input value={formTara.motorista} onChange={e => setFormTara(f => ({ ...f, motorista: e.target.value }))} placeholder="Nome do motorista" style={inp} />
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div>
                  <span style={lbl}>Produto</span>
                  <input value={formTara.produto} onChange={e => setFormTara(f => ({ ...f, produto: e.target.value }))} placeholder="Soja, Milho, Algodão…" style={inp} />
                </div>
                <div>
                  <span style={lbl}>{formTara.tipo === "entrada" ? "Fornecedor" : formTara.tipo === "saida" ? "Cliente" : "Fornec./Cliente"}</span>
                  <input value={formTara.fornecedor_cliente} onChange={e => setFormTara(f => ({ ...f, fornecedor_cliente: e.target.value }))} placeholder="Nome ou razão social" style={inp} />
                </div>
              </div>

              {/* Peso tara — destaque */}
              <div style={{ background: "#EBF3FB", border: "0.5px solid #B8D4EE", borderRadius: 10, padding: "14px 18px" }}>
                <span style={{ ...lbl, color: "#1A5CB8", fontWeight: 700 }}>⚖ Peso de Tara (kg) *</span>
                <input
                  value={formTara.peso_tara_kg}
                  onChange={e => setFormTara(f => ({ ...f, peso_tara_kg: e.target.value }))}
                  placeholder="0,00"
                  type="number"
                  min="0"
                  step="0.01"
                  style={{ ...inp, fontSize: 20, fontWeight: 700, textAlign: "right", letterSpacing: "0.02em" }}
                  autoFocus
                />
              </div>

              <div>
                <span style={lbl}>Observação</span>
                <input value={formTara.observacao} onChange={e => setFormTara(f => ({ ...f, observacao: e.target.value }))} placeholder="Opcional" style={inp} />
              </div>
            </div>

            <div style={{ padding: "14px 24px", borderTop: "0.5px solid var(--border-row)", display: "flex", justifyContent: "flex-end", gap: 10 }}>
              <button onClick={() => setModalTara(false)} style={{ padding: "9px 18px", borderRadius: 8, background: "var(--bg-page)", color: "var(--text-2)", border: "0.5px solid var(--border-table)", fontSize: 13, cursor: "pointer" }}>
                Cancelar
              </button>
              <button onClick={salvarTara} disabled={salvandoTara}
                style={{ padding: "9px 24px", borderRadius: 8, background: salvandoTara ? "#aaa" : "#1A5CB8", color: "#fff", border: "none", fontSize: 13, fontWeight: 700, cursor: salvandoTara ? "default" : "pointer" }}>
                {salvandoTara ? "Salvando…" : "Salvar Tara →"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ════════════ MODAL BRUTO ════════════ */}
      {modalBruto && pesagemSel && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.45)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
          <div style={{ background: "var(--bg-card)", borderRadius: 16, width: "100%", maxWidth: 520, boxShadow: "0 20px 60px rgba(0,0,0,.25)", overflow: "hidden" }}>
            <div style={{ padding: "18px 24px", borderBottom: "0.5px solid var(--border-row)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div>
                <div style={{ fontSize: 16, fontWeight: 700, color: "var(--text-1)" }}>2ª Pesagem — Peso Bruto</div>
                <div style={{ fontSize: 11, color: "var(--text-3)", marginTop: 2 }}>Informe o peso bruto para calcular o peso líquido e finalizar o ticket.</div>
              </div>
              <button onClick={() => setModalBruto(false)} style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer", color: "var(--text-3)", padding: 4 }}>✕</button>
            </div>

            <div style={{ padding: "20px 24px", display: "flex", flexDirection: "column", gap: 14 }}>
              {/* Resumo do ticket */}
              <div style={{ background: "var(--bg-page)", border: "0.5px solid var(--border-row)", borderRadius: 10, padding: "12px 16px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, fontSize: 12 }}>
                <div><span style={{ color: "var(--text-3)" }}>Tipo: </span><BadgeTipo tipo={pesagemSel.tipo} /></div>
                <div><span style={{ color: "var(--text-3)" }}>Placa: </span><strong>{pesagemSel.placa || "—"}</strong></div>
                <div><span style={{ color: "var(--text-3)" }}>Produto: </span>{pesagemSel.produto || "—"}</div>
                <div><span style={{ color: "var(--text-3)" }}>Motorista: </span>{pesagemSel.motorista || "—"}</div>
                <div><span style={{ color: "var(--text-3)" }}>Fornec./Cliente: </span>{pesagemSel.fornecedor_cliente || "—"}</div>
                <div><span style={{ color: "var(--text-3)" }}>Entrada tara: </span>{fmtTs(pesagemSel.data_tara)}</div>
              </div>

              {/* Tara já registrada */}
              <div style={{ display: "flex", gap: 14, alignItems: "stretch" }}>
                <div style={{ flex: 1, background: "#F0F4F8", borderRadius: 10, padding: "12px 16px", textAlign: "center" }}>
                  <div style={{ fontSize: 11, color: "var(--text-3)", marginBottom: 4 }}>Tara registrada</div>
                  <div style={{ fontSize: 22, fontWeight: 700, color: "var(--text-1)" }}>{fmtKg(pesagemSel.peso_tara_kg)}</div>
                  <div style={{ fontSize: 10, color: "var(--text-3)" }}>{pesagemSel.usuario_tara}</div>
                </div>
              </div>

              {/* Peso bruto — destaque */}
              <div style={{ background: "#FBF3E0", border: "0.5px solid #C9921B", borderRadius: 10, padding: "14px 18px" }}>
                <span style={{ ...lbl, color: "#7A4300", fontWeight: 700 }}>⚖ Peso Bruto (kg) *</span>
                <input
                  value={pesoBrutoStr}
                  onChange={e => setPesoBrutoStr(e.target.value)}
                  placeholder="0,00"
                  type="number"
                  min="0"
                  step="0.01"
                  style={{ ...inp, fontSize: 20, fontWeight: 700, textAlign: "right", background: "#FFF8E8" }}
                  autoFocus
                />
              </div>

              {/* Preview líquido */}
              {liquidoPrev !== null && (
                <div style={{ background: liquidoPrev < 0 ? "#FEE2E2" : "#DCFCE7", border: `0.5px solid ${liquidoPrev < 0 ? "#E24B4A" : "#16A34A"}`, borderRadius: 10, padding: "14px 18px", textAlign: "center" }}>
                  <div style={{ fontSize: 11, color: liquidoPrev < 0 ? "#B91C1C" : "#15803D", marginBottom: 4 }}>
                    {liquidoPrev < 0 ? "⚠ Bruto menor que tara!" : "Peso Líquido (Bruto − Tara)"}
                  </div>
                  <div style={{ fontSize: 26, fontWeight: 800, color: liquidoPrev < 0 ? "#B91C1C" : "#15803D" }}>
                    {fmtKg(liquidoPrev)}
                  </div>
                </div>
              )}
            </div>

            <div style={{ padding: "14px 24px", borderTop: "0.5px solid var(--border-row)", display: "flex", justifyContent: "flex-end", gap: 10 }}>
              <button onClick={() => setModalBruto(false)} style={{ padding: "9px 18px", borderRadius: 8, background: "var(--bg-page)", color: "var(--text-2)", border: "0.5px solid var(--border-table)", fontSize: 13, cursor: "pointer" }}>
                Voltar
              </button>
              <button onClick={salvarBruto} disabled={salvandoBruto || (liquidoPrev !== null && liquidoPrev < 0)}
                style={{ padding: "9px 24px", borderRadius: 8, background: salvandoBruto ? "#aaa" : "#1A5CB8", color: "#fff", border: "none", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
                {salvandoBruto ? "Finalizando…" : "✓ Finalizar Pesagem"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ════════════ MODAL CANCELAR ════════════ */}
      {modalCancel && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.45)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
          <div style={{ background: "var(--bg-card)", borderRadius: 14, width: "100%", maxWidth: 380, boxShadow: "0 20px 60px rgba(0,0,0,.25)", padding: 28 }}>
            <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 8 }}>Cancelar ticket?</div>
            <div style={{ fontSize: 13, color: "var(--text-2)", marginBottom: 20 }}>O ticket será marcado como cancelado e não poderá ser finalizado.</div>
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <button onClick={() => setModalCancel(false)} style={{ padding: "9px 18px", borderRadius: 8, background: "var(--bg-page)", color: "var(--text-2)", border: "0.5px solid var(--border-table)", fontSize: 13, cursor: "pointer" }}>Não</button>
              <button onClick={cancelar} style={{ padding: "9px 18px", borderRadius: 8, background: "#E24B4A", color: "#fff", border: "none", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>Sim, cancelar</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
