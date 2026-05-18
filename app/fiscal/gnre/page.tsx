"use client";
import { useState, useEffect } from "react";
import TopNav from "../../../components/TopNav";
import { useAuth } from "../../../components/AuthProvider";
import { supabase } from "../../../lib/supabase";

// ─── Tipos ────────────────────────────────────────────────────
type StatusGNRE = "rascunho" | "emitida" | "paga" | "vencida" | "cancelada";

interface GnreGuia {
  id: string;
  fazenda_id: string;
  tipo_receita: string;
  descricao_receita: string;
  uf_favorecida: string;
  uf_emitente?: string;
  documento_origem?: string;
  competencia?: string;
  valor_principal: number;
  valor_juros: number;
  valor_multa: number;
  valor_total: number;
  vencimento?: string;
  data_pagamento?: string;
  nosso_numero?: string;
  status: StatusGNRE;
  obs?: string;
  created_at?: string;
}

// ─── Constantes ───────────────────────────────────────────────
const TIPOS_RECEITA = [
  { codigo: "10008-0", descricao: "ICMS — Diferencial de Alíquota (EC 87/2015) — Consumidor Final" },
  { codigo: "10009-9", descricao: "ICMS — Fundo de Combate à Pobreza (EC 87/2015)" },
  { codigo: "10005-6", descricao: "ICMS — Substituição Tributária por Operações Anteriores" },
  { codigo: "10006-4", descricao: "ICMS — Substituição Tributária por Operações Subsequentes" },
  { codigo: "10007-2", descricao: "ICMS — Substituição Tributária por Operações Concomitantes" },
  { codigo: "10010-1", descricao: "ICMS — Antecipação com encerramento de tributação" },
  { codigo: "10011-0", descricao: "ICMS — Antecipação sem encerramento de tributação" },
  { codigo: "10012-8", descricao: "ICMS — Diferencial de Alíquota — Aquisição em outra UF (contribuinte)" },
  { codigo: "10013-6", descricao: "ICMS — Importação" },
  { codigo: "15001-1", descricao: "ITCMD — Doação / Herança" },
];

const UFS = ["AC","AL","AM","AP","BA","CE","DF","ES","GO","MA","MG","MS","MT","PA","PB","PE","PI","PR","RJ","RN","RO","RR","RS","SC","SE","SP","TO"];

const STATUS_COR: Record<StatusGNRE, { bg: string; color: string; label: string }> = {
  rascunho: { bg: "#F4F6FA", color: "#555",    label: "Rascunho"  },
  emitida:  { bg: "#EAF3FB", color: "#1A4870", label: "Emitida"   },
  paga:     { bg: "#DCFCE7", color: "#166534", label: "Paga"      },
  vencida:  { bg: "#FEE2E2", color: "#991B1B", label: "Vencida"   },
  cancelada:{ bg: "#F3F4F6", color: "#9CA3AF", label: "Cancelada" },
};

const fmt = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fmtDt = (d?: string) => d ? new Date(d + "T12:00:00").toLocaleDateString("pt-BR") : "—";

const VAZIO: Omit<GnreGuia, "id" | "fazenda_id" | "created_at"> = {
  tipo_receita: "",
  descricao_receita: "",
  uf_favorecida: "",
  uf_emitente: "MT",
  documento_origem: "",
  competencia: "",
  valor_principal: 0,
  valor_juros: 0,
  valor_multa: 0,
  valor_total: 0,
  vencimento: "",
  status: "rascunho",
  obs: "",
};

// ─── Estilos base ─────────────────────────────────────────────
const inp: React.CSSProperties = {
  width: "100%", padding: "8px 10px", border: "0.5px solid #D4DCE8",
  borderRadius: 8, fontSize: 13, color: "#1a1a1a", background: "#fff",
  boxSizing: "border-box", outline: "none",
};
const lbl: React.CSSProperties = { fontSize: 11, color: "#555", marginBottom: 4, display: "block", fontWeight: 600 };
const card: React.CSSProperties = { background: "#fff", borderRadius: 12, border: "0.5px solid #DDE2EE", padding: "18px 22px" };

// ─── Componente ───────────────────────────────────────────────
export default function GnrePage() {
  const { fazendaId } = useAuth();
  const [guias, setGuias]     = useState<GnreGuia[]>([]);
  const [loading, setLoading] = useState(true);
  const [filtroStatus, setFiltroStatus] = useState<string>("todas");
  const [filtroUF,     setFiltroUF]     = useState<string>("");
  const [busca,        setBusca]        = useState("");

  const [modal,       setModal]       = useState(false);
  const [editando,    setEditando]    = useState<GnreGuia | null>(null);
  const [form,        setForm]        = useState<typeof VAZIO>({ ...VAZIO });
  const [salvando,    setSalvando]    = useState(false);
  const [pagarModal,  setPagarModal]  = useState<GnreGuia | null>(null);
  const [dataPgto,    setDataPgto]    = useState("");

  // ── Carregar ──────────────────────────────────────────────
  async function carregar() {
    if (!fazendaId) return;
    const { data } = await supabase
      .from("gnre_guias")
      .select("*")
      .eq("fazenda_id", fazendaId)
      .order("created_at", { ascending: false });
    setGuias(data ?? []);
    setLoading(false);
  }
  useEffect(() => { carregar(); }, [fazendaId]);

  // Auto-atualiza vencidas
  useEffect(() => {
    const hoje = new Date().toISOString().split("T")[0];
    const vencidas = guias.filter(g => g.status === "emitida" && g.vencimento && g.vencimento < hoje);
    vencidas.forEach(g => {
      supabase.from("gnre_guias").update({ status: "vencida" }).eq("id", g.id).then(() => {});
    });
    if (vencidas.length > 0) carregar();
  }, [guias]);

  // ── Salvar ────────────────────────────────────────────────
  async function salvar() {
    if (!fazendaId || !form.tipo_receita || !form.uf_favorecida) return;
    setSalvando(true);
    const payload = {
      ...form,
      fazenda_id: fazendaId,
      valor_total: form.valor_principal + form.valor_juros + form.valor_multa,
      descricao_receita: TIPOS_RECEITA.find(t => t.codigo === form.tipo_receita)?.descricao ?? form.tipo_receita,
    };
    if (editando) {
      await supabase.from("gnre_guias").update(payload).eq("id", editando.id);
    } else {
      await supabase.from("gnre_guias").insert(payload);
    }
    setSalvando(false);
    fecharModal();
    carregar();
  }

  async function emitir(g: GnreGuia) {
    await supabase.from("gnre_guias").update({ status: "emitida" }).eq("id", g.id);
    carregar();
  }

  async function registrarPagamento() {
    if (!pagarModal || !dataPgto) return;
    await supabase.from("gnre_guias").update({ status: "paga", data_pagamento: dataPgto }).eq("id", pagarModal.id);
    setPagarModal(null);
    carregar();
  }

  async function cancelar(id: string) {
    if (!confirm("Cancelar esta GNRE?")) return;
    await supabase.from("gnre_guias").update({ status: "cancelada" }).eq("id", id);
    carregar();
  }

  function abrirModal(g?: GnreGuia) {
    setEditando(g ?? null);
    setForm(g ? {
      tipo_receita: g.tipo_receita,
      descricao_receita: g.descricao_receita,
      uf_favorecida: g.uf_favorecida,
      uf_emitente: g.uf_emitente ?? "MT",
      documento_origem: g.documento_origem ?? "",
      competencia: g.competencia ?? "",
      valor_principal: g.valor_principal,
      valor_juros: g.valor_juros,
      valor_multa: g.valor_multa,
      valor_total: g.valor_total,
      vencimento: g.vencimento ?? "",
      status: g.status,
      obs: g.obs ?? "",
    } : { ...VAZIO });
    setModal(true);
  }

  function fecharModal() { setModal(false); setEditando(null); setForm({ ...VAZIO }); }

  // ── Filtros e KPIs ────────────────────────────────────────
  const hoje = new Date().toISOString().split("T")[0];
  const ativas = guias.filter(g => g.status !== "cancelada");
  const pendente  = ativas.filter(g => g.status === "emitida").reduce((s, g) => s + g.valor_total, 0);
  const vencida   = ativas.filter(g => g.status === "vencida").reduce((s, g) => s + g.valor_total, 0);
  const mesAtual  = hoje.substring(0, 7);
  const pagaMes   = ativas.filter(g => g.status === "paga" && (g.data_pagamento ?? "").startsWith(mesAtual)).reduce((s, g) => s + g.valor_total, 0);
  const qtdEmitidas = ativas.filter(g => g.status === "emitida").length;

  const lista = guias.filter(g => {
    if (filtroStatus !== "todas" && g.status !== filtroStatus) return false;
    if (filtroUF && g.uf_favorecida !== filtroUF) return false;
    if (busca && !g.descricao_receita.toLowerCase().includes(busca.toLowerCase()) &&
        !g.documento_origem?.toLowerCase().includes(busca.toLowerCase()) &&
        !g.uf_favorecida.toLowerCase().includes(busca.toLowerCase())) return false;
    return true;
  });

  return (
    <div style={{ minHeight: "100vh", background: "#F4F6FA", fontFamily: "system-ui, sans-serif" }}>
      <TopNav />
      <div style={{ maxWidth: 1200, margin: "0 auto", padding: "24px 20px" }}>

        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
          <div>
            <h1 style={{ fontSize: 20, fontWeight: 700, color: "#1a1a1a", margin: 0 }}>GNRE</h1>
            <p style={{ fontSize: 13, color: "#666", margin: "4px 0 0" }}>
              Guias Nacionais de Recolhimento de Tributos Estaduais
            </p>
          </div>
          <button
            onClick={() => abrirModal()}
            style={{ padding: "9px 20px", background: "#1A4870", color: "#fff", border: "none", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer" }}
          >
            + Nova GNRE
          </button>
        </div>

        {/* KPI cards */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 14, marginBottom: 24 }}>
          {[
            { label: "Pendente",     value: fmt(pendente),        sub: `${qtdEmitidas} guia${qtdEmitidas !== 1 ? "s" : ""}`, cor: "#1A4870", bg: "#EAF3FB" },
            { label: "Vencida",      value: fmt(vencida),         sub: "Recolhimento atrasado",    cor: "#991B1B", bg: "#FEE2E2" },
            { label: "Pago no Mês",  value: fmt(pagaMes),         sub: "Competência atual",        cor: "#166534", bg: "#DCFCE7" },
            { label: "Total Guias",  value: String(ativas.length),sub: "emitidas + pendentes",     cor: "#555",    bg: "#F4F6FA" },
          ].map((k, i) => (
            <div key={i} style={{ ...card, background: k.bg, borderColor: "transparent" }}>
              <div style={{ fontSize: 11, color: k.cor, fontWeight: 600, marginBottom: 6, opacity: 0.8 }}>{k.label}</div>
              <div style={{ fontSize: 22, fontWeight: 700, color: k.cor }}>{k.value}</div>
              <div style={{ fontSize: 11, color: k.cor, opacity: 0.6, marginTop: 2 }}>{k.sub}</div>
            </div>
          ))}
        </div>

        {/* Filtros */}
        <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
          <input
            placeholder="Buscar por tipo, UF, documento..."
            value={busca} onChange={e => setBusca(e.target.value)}
            style={{ ...inp, width: 280 }}
          />
          <select value={filtroStatus} onChange={e => setFiltroStatus(e.target.value)} style={{ ...inp, width: 160 }}>
            <option value="todas">Todos os status</option>
            {Object.entries(STATUS_COR).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
          <select value={filtroUF} onChange={e => setFiltroUF(e.target.value)} style={{ ...inp, width: 130 }}>
            <option value="">Todas as UFs</option>
            {UFS.map(uf => <option key={uf} value={uf}>{uf}</option>)}
          </select>
        </div>

        {/* Tabela */}
        <div style={card}>
          {loading ? (
            <div style={{ textAlign: "center", padding: 40, color: "#888" }}>Carregando...</div>
          ) : lista.length === 0 ? (
            <div style={{ textAlign: "center", padding: 60, color: "#888" }}>
              <div style={{ fontSize: 36, marginBottom: 12 }}>📋</div>
              <div style={{ fontWeight: 600, marginBottom: 4 }}>Nenhuma GNRE encontrada</div>
              <div style={{ fontSize: 12 }}>Clique em "+ Nova GNRE" para emitir sua primeira guia.</div>
            </div>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr style={{ background: "#F8FAFF" }}>
                  {["Tipo/Receita","UF","Doc. Origem","Competência","Vencimento","Valor Total","Status","Ações"].map(h => (
                    <th key={h} style={{ padding: "8px 10px", textAlign: "left", color: "#555", fontWeight: 600, borderBottom: "0.5px solid #DDE2EE", whiteSpace: "nowrap" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {lista.map((g, i) => {
                  const sc = STATUS_COR[g.status];
                  return (
                    <tr key={g.id} style={{ background: i % 2 === 0 ? "#fff" : "#FAFBFC", borderBottom: "0.5px solid #F0F2F7" }}>
                      <td style={{ padding: "9px 10px" }}>
                        <div style={{ fontWeight: 600, color: "#1a1a1a" }}>{g.tipo_receita}</div>
                        <div style={{ color: "#666", fontSize: 11, maxWidth: 260, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{g.descricao_receita}</div>
                      </td>
                      <td style={{ padding: "9px 10px" }}>
                        <span style={{ background: "#EAF3FB", color: "#1A4870", fontWeight: 700, padding: "2px 8px", borderRadius: 5, fontSize: 11 }}>{g.uf_favorecida}</span>
                      </td>
                      <td style={{ padding: "9px 10px", color: "#555" }}>{g.documento_origem || "—"}</td>
                      <td style={{ padding: "9px 10px", color: "#555" }}>{g.competencia ? fmtDt(g.competencia + "-01") : "—"}</td>
                      <td style={{ padding: "9px 10px", color: g.status === "vencida" ? "#991B1B" : "#555", fontWeight: g.status === "vencida" ? 600 : 400 }}>
                        {fmtDt(g.vencimento)}
                      </td>
                      <td style={{ padding: "9px 10px", fontWeight: 700, color: "#1a1a1a" }}>{fmt(g.valor_total)}</td>
                      <td style={{ padding: "9px 10px" }}>
                        <span style={{ background: sc.bg, color: sc.color, padding: "3px 10px", borderRadius: 12, fontSize: 11, fontWeight: 600, whiteSpace: "nowrap" }}>
                          {sc.label}
                        </span>
                      </td>
                      <td style={{ padding: "9px 10px" }}>
                        <div style={{ display: "flex", gap: 6 }}>
                          {g.status === "rascunho" && (
                            <button onClick={() => emitir(g)}
                              style={{ padding: "4px 10px", background: "#1A4870", color: "#fff", border: "none", borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: "pointer" }}>
                              Emitir
                            </button>
                          )}
                          {(g.status === "emitida" || g.status === "vencida") && (
                            <button onClick={() => { setPagarModal(g); setDataPgto(hoje); }}
                              style={{ padding: "4px 10px", background: "#16A34A", color: "#fff", border: "none", borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: "pointer" }}>
                              Pagar
                            </button>
                          )}
                          <button onClick={() => abrirModal(g)}
                            style={{ padding: "4px 10px", background: "none", border: "0.5px solid #D4DCE8", borderRadius: 6, fontSize: 11, color: "#555", cursor: "pointer" }}>
                            Editar
                          </button>
                          {g.status !== "paga" && g.status !== "cancelada" && (
                            <button onClick={() => cancelar(g.id)}
                              style={{ padding: "4px 8px", background: "none", border: "none", fontSize: 14, cursor: "pointer", color: "#E24B4A" }}>
                              ✕
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* ── Modal Nova/Editar GNRE ── */}
      {modal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }}
          onClick={e => { if (e.target === e.currentTarget) fecharModal(); }}>
          <div style={{ background: "#fff", borderRadius: 14, width: "100%", maxWidth: 680, maxHeight: "90vh", overflowY: "auto", boxShadow: "0 20px 60px rgba(0,0,0,0.2)" }}>

            <div style={{ padding: "16px 24px", borderBottom: "0.5px solid #DDE2EE", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontWeight: 700, fontSize: 15 }}>{editando ? "Editar GNRE" : "Nova GNRE"}</span>
              <button onClick={fecharModal} style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer", color: "#555" }}>✕</button>
            </div>

            <div style={{ padding: "22px 24px", display: "grid", gap: 16 }}>
              {/* Tipo de receita */}
              <div>
                <label style={lbl}>Tipo de Receita *</label>
                <select value={form.tipo_receita} onChange={e => setForm(f => ({ ...f, tipo_receita: e.target.value }))} style={inp}>
                  <option value="">Selecione...</option>
                  {TIPOS_RECEITA.map(t => <option key={t.codigo} value={t.codigo}>{t.codigo} — {t.descricao}</option>)}
                </select>
              </div>

              {/* UF + Emitente */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                <div>
                  <label style={lbl}>UF Favorecida (Destino) *</label>
                  <select value={form.uf_favorecida} onChange={e => setForm(f => ({ ...f, uf_favorecida: e.target.value }))} style={inp}>
                    <option value="">Selecione...</option>
                    {UFS.map(uf => <option key={uf} value={uf}>{uf}</option>)}
                  </select>
                </div>
                <div>
                  <label style={lbl}>UF Emitente</label>
                  <select value={form.uf_emitente} onChange={e => setForm(f => ({ ...f, uf_emitente: e.target.value }))} style={inp}>
                    {UFS.map(uf => <option key={uf} value={uf}>{uf}</option>)}
                  </select>
                </div>
              </div>

              {/* Documento + Competência */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                <div>
                  <label style={lbl}>Documento de Origem (NF-e / número)</label>
                  <input value={form.documento_origem} onChange={e => setForm(f => ({ ...f, documento_origem: e.target.value }))}
                    placeholder="Ex: 35250312345678000199550010000012341234567890" style={inp} />
                </div>
                <div>
                  <label style={lbl}>Competência</label>
                  <input type="month" value={form.competencia} onChange={e => setForm(f => ({ ...f, competencia: e.target.value }))} style={inp} />
                </div>
              </div>

              {/* Valores */}
              <div style={{ background: "#F8FAFF", borderRadius: 8, padding: 16, display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14 }}>
                <div>
                  <label style={lbl}>Valor Principal (R$) *</label>
                  <input type="number" min="0" step="0.01"
                    value={form.valor_principal}
                    onChange={e => setForm(f => ({ ...f, valor_principal: parseFloat(e.target.value) || 0 }))}
                    style={inp} />
                </div>
                <div>
                  <label style={lbl}>Juros (R$)</label>
                  <input type="number" min="0" step="0.01"
                    value={form.valor_juros}
                    onChange={e => setForm(f => ({ ...f, valor_juros: parseFloat(e.target.value) || 0 }))}
                    style={inp} />
                </div>
                <div>
                  <label style={lbl}>Multa (R$)</label>
                  <input type="number" min="0" step="0.01"
                    value={form.valor_multa}
                    onChange={e => setForm(f => ({ ...f, valor_multa: parseFloat(e.target.value) || 0 }))}
                    style={inp} />
                </div>
              </div>
              <div style={{ display: "flex", justifyContent: "flex-end" }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: "#1A4870" }}>
                  Total: {fmt(form.valor_principal + form.valor_juros + form.valor_multa)}
                </span>
              </div>

              {/* Vencimento */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                <div>
                  <label style={lbl}>Vencimento</label>
                  <input type="date" value={form.vencimento} onChange={e => setForm(f => ({ ...f, vencimento: e.target.value }))} style={inp} />
                </div>
                <div>
                  <label style={lbl}>Status</label>
                  <select value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value as StatusGNRE }))} style={inp}>
                    {Object.entries(STATUS_COR).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                  </select>
                </div>
              </div>

              {/* Obs */}
              <div>
                <label style={lbl}>Observações</label>
                <textarea value={form.obs} onChange={e => setForm(f => ({ ...f, obs: e.target.value }))}
                  rows={2} style={{ ...inp, resize: "vertical" }} placeholder="NF relacionada, motivo da guia, etc." />
              </div>
            </div>

            <div style={{ padding: "14px 24px", borderTop: "0.5px solid #DDE2EE", display: "flex", justifyContent: "flex-end", gap: 10 }}>
              <button onClick={fecharModal} style={{ padding: "9px 20px", background: "none", border: "0.5px solid #D4DCE8", borderRadius: 8, cursor: "pointer", fontSize: 13, color: "#555" }}>Cancelar</button>
              <button onClick={salvar} disabled={salvando || !form.tipo_receita || !form.uf_favorecida}
                style={{ padding: "9px 22px", background: "#1A4870", color: "#fff", border: "none", borderRadius: 8, cursor: "pointer", fontSize: 13, fontWeight: 600, opacity: salvando ? 0.7 : 1 }}>
                {salvando ? "Salvando..." : editando ? "Salvar" : "Criar GNRE"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal Registrar Pagamento ── */}
      {pagarModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }}>
          <div style={{ background: "#fff", borderRadius: 14, padding: 28, width: 360, boxShadow: "0 20px 60px rgba(0,0,0,0.2)" }}>
            <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 16 }}>Registrar Pagamento</div>
            <div style={{ fontSize: 13, color: "#555", marginBottom: 4 }}>
              {pagarModal.tipo_receita} — UF {pagarModal.uf_favorecida}
            </div>
            <div style={{ fontSize: 20, fontWeight: 700, color: "#1A4870", marginBottom: 20 }}>{fmt(pagarModal.valor_total)}</div>
            <label style={lbl}>Data do Pagamento</label>
            <input type="date" value={dataPgto} onChange={e => setDataPgto(e.target.value)} style={{ ...inp, marginBottom: 20 }} />
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => setPagarModal(null)} style={{ flex: 1, padding: "9px 0", background: "none", border: "0.5px solid #D4DCE8", borderRadius: 8, cursor: "pointer", fontSize: 13, color: "#555" }}>Cancelar</button>
              <button onClick={registrarPagamento} style={{ flex: 1, padding: "9px 0", background: "#16A34A", color: "#fff", border: "none", borderRadius: 8, cursor: "pointer", fontSize: 13, fontWeight: 600 }}>Confirmar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
