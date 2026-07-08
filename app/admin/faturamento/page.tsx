"use client";
import { useState, useEffect, useCallback } from "react";
import { createClient } from "@supabase/supabase-js";
import InputNumerico from "../../../components/InputNumerico";

// ─── Supabase client ─────────────────────────────────────────────────────────

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// ─── Tipos ───────────────────────────────────────────────────────────────────

type StatusAssinatura = "trial" | "ativa" | "inadimplente" | "cancelada" | "suspensa";
type StatusPagamento  = "pendente" | "pago" | "vencido" | "cancelado" | "estornado";
type MetodoPagamento  = "pix" | "boleto" | "cartao" | "manual";
type PeriodoAss       = "mensal" | "anual";

interface Assinatura {
  id: string;
  conta_id: string;
  plano_id: string;
  status: StatusAssinatura;
  periodo: PeriodoAss;
  preco: number;
  data_inicio: string;
  data_vencimento: string;
  data_proximo_pagamento?: string;
  trial_fim?: string;
  asaas_customer_id?: string;
  asaas_subscription_id?: string;
  conta_nome?: string;
}

interface Pagamento {
  id: string;
  assinatura_id: string;
  conta_id: string;
  valor: number;
  status: StatusPagamento;
  data_vencimento: string;
  data_pagamento?: string;
  metodo_pagamento?: MetodoPagamento;
  asaas_payment_id?: string;
  asaas_invoice_url?: string;
  descricao?: string;
  conta_nome?: string;
}

interface ContaSimples {
  id: string;
  nome: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtDate(s?: string | null) {
  if (!s) return "—";
  const [y, m, d] = s.split("T")[0].split("-");
  return `${d}/${m}/${y}`;
}

function fmtBRL(v?: number | null) {
  if (!v && v !== 0) return "—";
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

// ─── Config de status ────────────────────────────────────────────────────────

const STATUS_ASS: Record<StatusAssinatura, { label: string; cor: string; bg: string }> = {
  trial:       { label: "Trial",        cor: "#C9921B", bg: "#FBF3E0" },
  ativa:       { label: "Ativa",        cor: "#16A34A", bg: "#F0FDF4" },
  inadimplente:{ label: "Inadimplente", cor: "#E24B4A", bg: "#FEF2F2" },
  cancelada:   { label: "Cancelada",    cor: "#888",    bg: "#F3F4F6" },
  suspensa:    { label: "Suspensa",     cor: "#EF9F27", bg: "#FFF7ED" },
};

const STATUS_PAG: Record<StatusPagamento, { label: string; cor: string; bg: string }> = {
  pendente:  { label: "Pendente",  cor: "#EF9F27", bg: "#FFF7ED" },
  pago:      { label: "Pago",      cor: "#16A34A", bg: "#F0FDF4" },
  vencido:   { label: "Vencido",   cor: "#E24B4A", bg: "#FEF2F2" },
  cancelado: { label: "Cancelado", cor: "#888",    bg: "#F3F4F6" },
  estornado: { label: "Estornado", cor: "#378ADD", bg: "#EFF6FF" },
};

const METODO_LABEL: Record<MetodoPagamento, string> = {
  pix:    "PIX",
  boleto: "Boleto",
  cartao: "Cartão",
  manual: "Manual",
};

// ─── Estilos ─────────────────────────────────────────────────────────────────

const inp: React.CSSProperties = {
  width: "100%", padding: "8px 10px",
  border: "0.5px solid #D4DCE8", borderRadius: 8,
  fontSize: 13, color: "#1a1a1a", background: "#fff",
  boxSizing: "border-box", outline: "none",
};

const lbl: React.CSSProperties = {
  fontSize: 11, color: "#555", marginBottom: 4, display: "block", fontWeight: 600,
};

const btnPrimary: React.CSSProperties = {
  padding: "8px 20px", background: "#0B1E35", color: "#fff",
  border: "none", borderRadius: 8, fontWeight: 600, cursor: "pointer", fontSize: 13,
};

const btnSecondary: React.CSSProperties = {
  padding: "8px 18px", background: "#fff", color: "#555",
  border: "0.5px solid #D4DCE8", borderRadius: 8, fontWeight: 600, cursor: "pointer", fontSize: 13,
};

// ─── Modal Registrar Pagamento Manual ────────────────────────────────────────

interface ModalPagManualProps {
  contas: ContaSimples[];
  onClose: () => void;
  onSalvo: () => void;
}

function ModalPagManual({ contas, onClose, onSalvo }: ModalPagManualProps) {
  const [form, setForm] = useState({
    conta_id: "",
    valor: "",
    data_pagamento: new Date().toISOString().split("T")[0],
    metodo_pagamento: "manual" as MetodoPagamento,
    descricao: "",
  });
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");

  async function salvar() {
    if (!form.conta_id || !form.valor) { setErro("Preencha conta e valor."); return; }
    setSalvando(true); setErro("");
    try {
      const { error } = await supabase.from("pagamentos").insert({
        conta_id: form.conta_id,
        assinatura_id: null,
        valor: parseFloat(form.valor),
        status: "pago",
        data_vencimento: form.data_pagamento,
        data_pagamento: form.data_pagamento,
        metodo_pagamento: form.metodo_pagamento,
        descricao: form.descricao || "Pagamento manual",
      });
      if (error) throw new Error(error.message);
      onSalvo();
    } catch (e) { setErro(String(e)); }
    finally { setSalvando(false); }
  }

  return (
    <div style={{ position: "fixed", inset: 0, background: "#00000070", zIndex:2000, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ background: "#fff", borderRadius: 14, width: 480, boxShadow: "0 12px 48px #0004" }}>
        <div style={{ padding: "18px 24px", borderBottom: "0.5px solid #E4E9F0", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: "#0B1E35" }}>Registrar Pagamento Manual</div>
          <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 18, cursor: "pointer", color: "#aaa" }}>✕</button>
        </div>
        <div style={{ padding: "20px 24px", display: "flex", flexDirection: "column", gap: 14 }}>
          <div>
            <label style={lbl}>Conta *</label>
            <select style={inp} value={form.conta_id} onChange={e => setForm(f => ({ ...f, conta_id: e.target.value }))}>
              <option value="">Selecione a conta</option>
              {contas.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
            </select>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            <div>
              <label style={lbl}>Valor (R$) *</label>
              <InputNumerico style={inp} min="0"
                value={form.valor} onChange={v => setForm(f => ({ ...f, valor: v }))} />
            </div>
            <div>
              <label style={lbl}>Data do pagamento</label>
              <input style={inp} type="date" value={form.data_pagamento}
                onChange={e => setForm(f => ({ ...f, data_pagamento: e.target.value }))} />
            </div>
          </div>
          <div>
            <label style={lbl}>Método</label>
            <select style={inp} value={form.metodo_pagamento} onChange={e => setForm(f => ({ ...f, metodo_pagamento: e.target.value as MetodoPagamento }))}>
              {(Object.keys(METODO_LABEL) as MetodoPagamento[]).map(m => (
                <option key={m} value={m}>{METODO_LABEL[m]}</option>
              ))}
            </select>
          </div>
          <div>
            <label style={lbl}>Observação</label>
            <input style={inp} placeholder="Ex: pagamento via depósito, contrato especial..."
              value={form.descricao} onChange={e => setForm(f => ({ ...f, descricao: e.target.value }))} />
          </div>
          {erro && <div style={{ padding: "8px 12px", background: "#FEF2F2", borderRadius: 8, color: "#991B1B", fontSize: 12 }}>{erro}</div>}
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, paddingTop: 8, borderTop: "0.5px solid #EEF1F6" }}>
            <button style={btnSecondary} onClick={onClose}>Cancelar</button>
            <button style={btnPrimary} onClick={salvar} disabled={salvando}>
              {salvando ? "Salvando…" : "Registrar"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Aba Assinaturas ─────────────────────────────────────────────────────────

function AbaAssinaturas() {
  const [lista, setLista] = useState<Assinatura[]>([]);
  const [loading, setLoading] = useState(true);
  const [filtroStatus, setFiltroStatus] = useState<StatusAssinatura | "">("");
  const [filtroPlano, setFiltroPlano] = useState("");
  const [busca, setBusca] = useState("");
  const [cancelando, setCancelando] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from("assinaturas")
      .select("*, contas(nome)")
      .order("created_at", { ascending: false });
    if (data) {
      setLista(data.map((r: unknown) => {
        const row = r as Assinatura & { contas?: { nome: string } | null };
        return { ...row, conta_nome: row.contas?.nome ?? "—" };
      }));
    }
    setLoading(false);
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  async function cancelarAssinatura(id: string, asaasSubId?: string) {
    if (!confirm("Cancelar esta assinatura?")) return;
    setCancelando(id);
    try {
      await fetch("/api/asaas/cancelar", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assinatura_id: id, asaas_subscription_id: asaasSubId }),
      });
      await supabase.from("assinaturas").update({ status: "cancelada" }).eq("id", id);
      setLista(l => l.map(a => a.id === id ? { ...a, status: "cancelada" } : a));
    } finally { setCancelando(null); }
  }

  const filtradas = lista.filter(a => {
    if (filtroStatus && a.status !== filtroStatus) return false;
    if (filtroPlano && a.plano_id !== filtroPlano) return false;
    if (busca && !a.conta_nome?.toLowerCase().includes(busca.toLowerCase())) return false;
    return true;
  });

  const ativas    = lista.filter(a => a.status === "ativa");
  const mrr       = ativas.filter(a => a.periodo === "mensal").reduce((s, a) => s + (a.preco ?? 0), 0)
                  + ativas.filter(a => a.periodo === "anual").reduce((s, a) => s + (a.preco ?? 0) / 12, 0);
  const arr       = mrr * 12;

  const kpis = [
    { label: "Total Ativas",     valor: ativas.length,                                             cor: "#16A34A", bg: "#F0FDF4" },
    { label: "Em Trial",         valor: lista.filter(a => a.status === "trial").length,            cor: "#C9921B", bg: "#FBF3E0" },
    { label: "Inadimplentes",    valor: lista.filter(a => a.status === "inadimplente").length,     cor: "#E24B4A", bg: "#FEF2F2" },
    { label: "MRR",              valor: fmtBRL(mrr),                                               cor: "#0B1E35", bg: "#fff"    },
    { label: "ARR (projetado)",  valor: fmtBRL(arr),                                               cor: "#0B1E35", bg: "#fff"    },
  ];

  const planosDistintos = Array.from(new Set(lista.map(a => a.plano_id))).filter(Boolean);

  return (
    <div>
      {/* KPIs */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 12, marginBottom: 20 }}>
        {kpis.map(k => (
          <div key={k.label} style={{ background: k.bg, borderRadius: 12, border: "0.5px solid #DDE2EE", padding: "14px 16px" }}>
            <div style={{ fontSize: 10, color: "#888", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 6 }}>{k.label}</div>
            <div style={{ fontSize: 20, fontWeight: 800, color: k.cor }}>{k.valor}</div>
          </div>
        ))}
      </div>

      {/* Filtros */}
      <div style={{ background: "#fff", borderRadius: 10, border: "0.5px solid #D4DCE8", padding: "12px 16px", marginBottom: 14, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <input style={{ ...inp, width: 220 }} placeholder="Buscar por conta..." value={busca} onChange={e => setBusca(e.target.value)} />
        <select style={{ ...inp, width: 160 }} value={filtroStatus} onChange={e => setFiltroStatus(e.target.value as StatusAssinatura | "")}>
          <option value="">Todos os status</option>
          {(Object.keys(STATUS_ASS) as StatusAssinatura[]).map(s => (
            <option key={s} value={s}>{STATUS_ASS[s].label}</option>
          ))}
        </select>
        <select style={{ ...inp, width: 160 }} value={filtroPlano} onChange={e => setFiltroPlano(e.target.value)}>
          <option value="">Todos os planos</option>
          {planosDistintos.map(p => <option key={p} value={p}>{p}</option>)}
        </select>
        <button style={{ ...btnSecondary, padding: "7px 14px", fontSize: 12 }} onClick={carregar}>↺ Atualizar</button>
        <div style={{ marginLeft: "auto", fontSize: 11, color: "#888" }}>{filtradas.length} de {lista.length}</div>
      </div>

      {/* Tabela */}
      <div style={{ background: "#fff", borderRadius: 10, border: "0.5px solid #D4DCE8", overflow: "hidden" }}>
        {loading ? (
          <div style={{ padding: "48px 0", textAlign: "center", color: "#888" }}>Carregando…</div>
        ) : filtradas.length === 0 ? (
          <div style={{ padding: "48px 0", textAlign: "center", color: "#888" }}>Nenhuma assinatura encontrada</div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: "#F8FAFC" }}>
                {["Conta", "Plano", "Período", "Preço", "Status", "Início", "Vencimento", "Próx. Cobr.", ""].map((h, i) => (
                  <th key={i} style={{ padding: "10px 14px", textAlign: i >= 6 ? "center" : "left", fontSize: 11, fontWeight: 600, color: "#888", borderBottom: "0.5px solid #D4DCE8", textTransform: "uppercase", letterSpacing: "0.04em", whiteSpace: "nowrap" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtradas.map((a, i) => {
                const sCfg = STATUS_ASS[a.status] ?? STATUS_ASS.cancelada;
                return (
                  <tr key={a.id} style={{ borderBottom: i < filtradas.length - 1 ? "0.5px solid #EEF1F6" : "none" }}>
                    <td style={{ padding: "11px 14px" }}>
                      <div style={{ fontWeight: 600, color: "#1a1a1a" }}>{a.conta_nome}</div>
                      {a.asaas_customer_id && <div style={{ fontSize: 10, color: "#aaa", fontFamily: "monospace" }}>{a.asaas_customer_id}</div>}
                    </td>
                    <td style={{ padding: "11px 14px" }}>
                      <span style={{ background: "#EFF6FF", color: "#1A4870", borderRadius: 6, padding: "2px 8px", fontSize: 11, fontWeight: 600 }}>
                        {a.plano_id}
                      </span>
                    </td>
                    <td style={{ padding: "11px 14px", fontSize: 12, color: "#555" }}>
                      {a.periodo === "anual" ? "Anual" : "Mensal"}
                    </td>
                    <td style={{ padding: "11px 14px", fontSize: 12, fontWeight: 600, color: "#0B1E35" }}>
                      {fmtBRL(a.preco)}
                    </td>
                    <td style={{ padding: "11px 14px" }}>
                      <span style={{ padding: "2px 8px", background: sCfg.bg, color: sCfg.cor, borderRadius: 6, fontSize: 11, fontWeight: 600 }}>
                        {sCfg.label}
                      </span>
                    </td>
                    <td style={{ padding: "11px 14px", fontSize: 12, color: "#555" }}>{fmtDate(a.data_inicio)}</td>
                    <td style={{ padding: "11px 14px", fontSize: 12, color: "#555", textAlign: "center" }}>{fmtDate(a.data_vencimento)}</td>
                    <td style={{ padding: "11px 14px", fontSize: 12, color: "#555", textAlign: "center" }}>{fmtDate(a.data_proximo_pagamento)}</td>
                    <td style={{ padding: "11px 14px", textAlign: "center" }}>
                      {a.status !== "cancelada" && (
                        <button
                          onClick={() => cancelarAssinatura(a.id, a.asaas_subscription_id)}
                          disabled={cancelando === a.id}
                          style={{ padding: "4px 10px", border: "0.5px solid #E24B4A", borderRadius: 6, background: "#FEF2F2", cursor: "pointer", fontSize: 11, color: "#E24B4A", fontWeight: 600 }}
                        >
                          {cancelando === a.id ? "…" : "Cancelar"}
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

// ─── Aba Pagamentos ──────────────────────────────────────────────────────────

function AbaPagamentos({ contas }: { contas: ContaSimples[] }) {
  const [lista, setLista] = useState<Pagamento[]>([]);
  const [loading, setLoading] = useState(true);
  const [filtroStatus, setFiltroStatus] = useState<StatusPagamento | "">("");
  const [filtroMetodo, setFiltroMetodo] = useState<MetodoPagamento | "">("");
  const [periodoIni, setPeriodoIni] = useState("");
  const [periodoFim, setPeriodoFim] = useState("");
  const [showModal, setShowModal] = useState(false);

  const carregar = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from("pagamentos")
      .select("*, contas(nome)")
      .order("data_vencimento", { ascending: false })
      .limit(200);
    if (data) {
      setLista(data.map((r: unknown) => {
        const row = r as Pagamento & { contas?: { nome: string } | null };
        return { ...row, conta_nome: row.contas?.nome ?? "—" };
      }));
    }
    setLoading(false);
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  const filtrados = lista.filter(p => {
    if (filtroStatus && p.status !== filtroStatus) return false;
    if (filtroMetodo && p.metodo_pagamento !== filtroMetodo) return false;
    if (periodoIni && p.data_vencimento < periodoIni) return false;
    if (periodoFim && p.data_vencimento > periodoFim) return false;
    return true;
  });

  return (
    <div>
      {showModal && (
        <ModalPagManual
          contas={contas}
          onClose={() => setShowModal(false)}
          onSalvo={() => { setShowModal(false); carregar(); }}
        />
      )}

      {/* Filtros */}
      <div style={{ background: "#fff", borderRadius: 10, border: "0.5px solid #D4DCE8", padding: "12px 16px", marginBottom: 14, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <select style={{ ...inp, width: 160 }} value={filtroStatus} onChange={e => setFiltroStatus(e.target.value as StatusPagamento | "")}>
          <option value="">Todos os status</option>
          {(Object.keys(STATUS_PAG) as StatusPagamento[]).map(s => (
            <option key={s} value={s}>{STATUS_PAG[s].label}</option>
          ))}
        </select>
        <select style={{ ...inp, width: 140 }} value={filtroMetodo} onChange={e => setFiltroMetodo(e.target.value as MetodoPagamento | "")}>
          <option value="">Todos os métodos</option>
          {(Object.keys(METODO_LABEL) as MetodoPagamento[]).map(m => (
            <option key={m} value={m}>{METODO_LABEL[m]}</option>
          ))}
        </select>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <input style={{ ...inp, width: 140 }} type="date" value={periodoIni} onChange={e => setPeriodoIni(e.target.value)} placeholder="De" />
          <span style={{ color: "#aaa", fontSize: 12 }}>até</span>
          <input style={{ ...inp, width: 140 }} type="date" value={periodoFim} onChange={e => setPeriodoFim(e.target.value)} placeholder="Até" />
        </div>
        <button style={{ ...btnSecondary, padding: "7px 14px", fontSize: 12 }} onClick={carregar}>↺ Atualizar</button>
        <button style={{ ...btnPrimary, padding: "7px 14px", fontSize: 12, marginLeft: "auto" }} onClick={() => setShowModal(true)}>
          + Registrar Manual
        </button>
      </div>

      {/* Tabela */}
      <div style={{ background: "#fff", borderRadius: 10, border: "0.5px solid #D4DCE8", overflow: "hidden" }}>
        {loading ? (
          <div style={{ padding: "48px 0", textAlign: "center", color: "#888" }}>Carregando…</div>
        ) : filtrados.length === 0 ? (
          <div style={{ padding: "48px 0", textAlign: "center", color: "#888" }}>Nenhum pagamento encontrado</div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: "#F8FAFC" }}>
                {["Vencimento", "Conta", "Valor", "Status", "Método", "Data Pag.", "Invoice"].map((h, i) => (
                  <th key={i} style={{ padding: "10px 14px", textAlign: i >= 2 ? "center" : "left", fontSize: 11, fontWeight: 600, color: "#888", borderBottom: "0.5px solid #D4DCE8", textTransform: "uppercase", letterSpacing: "0.04em", whiteSpace: "nowrap" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtrados.map((p, i) => {
                const sCfg = STATUS_PAG[p.status] ?? STATUS_PAG.pendente;
                return (
                  <tr key={p.id} style={{ borderBottom: i < filtrados.length - 1 ? "0.5px solid #EEF1F6" : "none" }}>
                    <td style={{ padding: "11px 14px", fontSize: 12, color: "#555" }}>{fmtDate(p.data_vencimento)}</td>
                    <td style={{ padding: "11px 14px" }}>
                      <div style={{ fontWeight: 600, color: "#1a1a1a", fontSize: 13 }}>{p.conta_nome}</div>
                      {p.descricao && <div style={{ fontSize: 11, color: "#888" }}>{p.descricao}</div>}
                    </td>
                    <td style={{ padding: "11px 14px", textAlign: "center", fontWeight: 700, color: "#0B1E35", fontSize: 13 }}>
                      {fmtBRL(p.valor)}
                    </td>
                    <td style={{ padding: "11px 14px", textAlign: "center" }}>
                      <span style={{ padding: "2px 8px", background: sCfg.bg, color: sCfg.cor, borderRadius: 6, fontSize: 11, fontWeight: 600 }}>
                        {sCfg.label}
                      </span>
                    </td>
                    <td style={{ padding: "11px 14px", textAlign: "center", fontSize: 12, color: "#555" }}>
                      {p.metodo_pagamento ? METODO_LABEL[p.metodo_pagamento] : "—"}
                    </td>
                    <td style={{ padding: "11px 14px", textAlign: "center", fontSize: 12, color: "#555" }}>
                      {fmtDate(p.data_pagamento)}
                    </td>
                    <td style={{ padding: "11px 14px", textAlign: "center" }}>
                      {p.asaas_invoice_url ? (
                        <a href={p.asaas_invoice_url} target="_blank" rel="noopener noreferrer"
                          style={{ fontSize: 11, color: "#378ADD", fontWeight: 600, textDecoration: "none" }}>
                          Abrir ↗
                        </a>
                      ) : <span style={{ color: "#aaa", fontSize: 11 }}>—</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

// ─── Aba Cobranças Pendentes ──────────────────────────────────────────────────

function AbaCobPendentes({ contas }: { contas: ContaSimples[] }) {
  const [lista, setLista] = useState<Pagamento[]>([]);
  const [loading, setLoading] = useState(true);
  const [cobrando, setCobrando] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ tipo: "ok" | "erro"; texto: string } | null>(null);

  const carregar = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from("pagamentos")
      .select("*, contas(nome)")
      .in("status", ["pendente", "vencido"])
      .order("data_vencimento", { ascending: true });
    if (data) {
      setLista(data.map((r: unknown) => {
        const row = r as Pagamento & { contas?: { nome: string } | null };
        return { ...row, conta_nome: row.contas?.nome ?? "—" };
      }));
    }
    setLoading(false);
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  async function cobrarAsaas(p: Pagamento) {
    setCobrando(p.id); setMsg(null);
    try {
      const res = await fetch("/api/asaas/cobrar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pagamento_id: p.id, conta_id: p.conta_id, valor: p.valor }),
      });
      if (res.ok) setMsg({ tipo: "ok", texto: "Cobrança enviada ao Asaas com sucesso." });
      else setMsg({ tipo: "erro", texto: "Erro ao enviar cobrança. Verifique o Asaas." });
    } catch {
      setMsg({ tipo: "erro", texto: "Erro de conexão." });
    } finally { setCobrando(null); }
  }

  // Agrupar por conta
  const porConta: Record<string, { nome: string; pagamentos: Pagamento[] }> = {};
  lista.forEach(p => {
    if (!porConta[p.conta_id]) porConta[p.conta_id] = { nome: p.conta_nome ?? "—", pagamentos: [] };
    porConta[p.conta_id].pagamentos.push(p);
  });

  const totalPendente = lista.reduce((s, p) => s + (p.valor ?? 0), 0);

  return (
    <div>
      {/* Sumário */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 20 }}>
        <div style={{ background: "#FEF2F2", borderRadius: 12, border: "0.5px solid #E24B4A30", padding: "14px 16px" }}>
          <div style={{ fontSize: 10, color: "#888", fontWeight: 600, textTransform: "uppercase", marginBottom: 6 }}>Total pendente</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: "#E24B4A" }}>{fmtBRL(totalPendente)}</div>
        </div>
        <div style={{ background: "#FFF7ED", borderRadius: 12, border: "0.5px solid #EF9F2730", padding: "14px 16px" }}>
          <div style={{ fontSize: 10, color: "#888", fontWeight: 600, textTransform: "uppercase", marginBottom: 6 }}>Cobranças abertas</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: "#EF9F27" }}>{lista.filter(p => p.status === "pendente").length}</div>
        </div>
        <div style={{ background: "#FEF2F2", borderRadius: 12, border: "0.5px solid #E24B4A30", padding: "14px 16px" }}>
          <div style={{ fontSize: 10, color: "#888", fontWeight: 600, textTransform: "uppercase", marginBottom: 6 }}>Vencidas</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: "#E24B4A" }}>{lista.filter(p => p.status === "vencido").length}</div>
        </div>
      </div>

      {msg && (
        <div style={{ padding: "10px 14px", borderRadius: 8, marginBottom: 14, fontSize: 12,
          background: msg.tipo === "ok" ? "#F0FDF4" : "#FEF2F2",
          color: msg.tipo === "ok" ? "#16A34A" : "#991B1B",
          border: `0.5px solid ${msg.tipo === "ok" ? "#16A34A40" : "#E24B4A40"}`,
        }}>
          {msg.texto}
        </div>
      )}

      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 12 }}>
        <button style={{ ...btnSecondary, padding: "7px 14px", fontSize: 12 }} onClick={carregar}>↺ Atualizar</button>
      </div>

      {loading ? (
        <div style={{ padding: "48px 0", textAlign: "center", color: "#888" }}>Carregando…</div>
      ) : Object.keys(porConta).length === 0 ? (
        <div style={{ padding: "48px 0", textAlign: "center", color: "#16A34A", fontSize: 14, fontWeight: 600 }}>
          ✓ Nenhuma cobrança pendente
        </div>
      ) : (
        Object.entries(porConta).map(([contaId, grupo]) => (
          <div key={contaId} style={{ background: "#fff", borderRadius: 10, border: "0.5px solid #D4DCE8", marginBottom: 12, overflow: "hidden" }}>
            <div style={{ padding: "12px 16px", borderBottom: "0.5px solid #EEF1F6", display: "flex", justifyContent: "space-between", alignItems: "center", background: "#F8FAFC" }}>
              <div>
                <span style={{ fontWeight: 700, color: "#0B1E35", fontSize: 14 }}>{grupo.nome}</span>
                <span style={{ marginLeft: 10, fontSize: 11, color: "#888" }}>{grupo.pagamentos.length} cobrança{grupo.pagamentos.length !== 1 ? "s" : ""}</span>
              </div>
              <div style={{ fontWeight: 700, color: "#E24B4A", fontSize: 13 }}>
                {fmtBRL(grupo.pagamentos.reduce((s, p) => s + (p.valor ?? 0), 0))}
              </div>
            </div>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ background: "#FAFBFD" }}>
                  {["Vencimento", "Valor", "Status", "Descrição", ""].map((h, i) => (
                    <th key={i} style={{ padding: "8px 14px", textAlign: i >= 1 && i <= 3 ? "center" : "left", fontSize: 11, fontWeight: 600, color: "#888", borderBottom: "0.5px solid #EEF1F6", whiteSpace: "nowrap" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {grupo.pagamentos.map((p, i) => {
                  const sCfg = STATUS_PAG[p.status] ?? STATUS_PAG.pendente;
                  return (
                    <tr key={p.id} style={{ borderBottom: i < grupo.pagamentos.length - 1 ? "0.5px solid #EEF1F6" : "none" }}>
                      <td style={{ padding: "10px 14px", fontSize: 12, color: p.status === "vencido" ? "#E24B4A" : "#555", fontWeight: p.status === "vencido" ? 600 : 400 }}>
                        {fmtDate(p.data_vencimento)}
                      </td>
                      <td style={{ padding: "10px 14px", textAlign: "center", fontWeight: 700, color: "#0B1E35" }}>
                        {fmtBRL(p.valor)}
                      </td>
                      <td style={{ padding: "10px 14px", textAlign: "center" }}>
                        <span style={{ padding: "2px 8px", background: sCfg.bg, color: sCfg.cor, borderRadius: 6, fontSize: 11, fontWeight: 600 }}>
                          {sCfg.label}
                        </span>
                      </td>
                      <td style={{ padding: "10px 14px", textAlign: "center", fontSize: 12, color: "#555" }}>
                        {p.descricao ?? "—"}
                      </td>
                      <td style={{ padding: "10px 14px", textAlign: "right" }}>
                        <button
                          onClick={() => cobrarAsaas(p)}
                          disabled={cobrando === p.id}
                          style={{ padding: "4px 12px", border: "0.5px solid #0B1E35", borderRadius: 6, background: "#0B1E35", cursor: "pointer", fontSize: 11, color: "#fff", fontWeight: 600 }}
                        >
                          {cobrando === p.id ? "…" : "Cobrar via Asaas"}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ))
      )}
    </div>
  );
}

// ─── Página principal ─────────────────────────────────────────────────────────

type AbaFat = "assinaturas" | "pagamentos" | "pendentes";

export default function FaturamentoPage() {
  const [aba, setAba] = useState<AbaFat>("assinaturas");
  const [contas, setContas] = useState<ContaSimples[]>([]);

  useEffect(() => {
    supabase.from("contas").select("id, nome").order("nome").then(({ data }) => {
      if (data) setContas(data as ContaSimples[]);
    });
  }, []);

  const ABAS: { key: AbaFat; label: string }[] = [
    { key: "assinaturas", label: "Assinaturas" },
    { key: "pagamentos",  label: "Pagamentos"  },
    { key: "pendentes",   label: "Cobranças Pendentes" },
  ];

  return (
    <div style={{ fontFamily: "system-ui, sans-serif", fontSize: 13 }}>

      {/* Page header */}
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ margin: "0 0 2px", fontSize: 22, fontWeight: 800, color: "#0B1E35", letterSpacing: "-0.3px" }}>
          Faturamento
        </h1>
        <p style={{ margin: 0, fontSize: 13, color: "#888" }}>
          Assinaturas, pagamentos e cobranças via Asaas
        </p>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 0, borderBottom: "0.5px solid #D4DCE8", marginBottom: 24 }}>
        {ABAS.map(a => (
          <button key={a.key} onClick={() => setAba(a.key)} style={{
            padding: "10px 20px", border: "none", background: "none", cursor: "pointer",
            fontSize: 13, fontWeight: aba === a.key ? 700 : 400,
            color: aba === a.key ? "#0B1E35" : "#666",
            borderBottom: aba === a.key ? "2px solid #C9921B" : "2px solid transparent",
            marginBottom: -1,
          }}>
            {a.label}
          </button>
        ))}
      </div>

      {aba === "assinaturas" && <AbaAssinaturas />}
      {aba === "pagamentos"  && <AbaPagamentos contas={contas} />}
      {aba === "pendentes"   && <AbaCobPendentes contas={contas} />}
    </div>
  );
}
