"use client";
import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "../../components/AuthProvider";
import { atualizarConta } from "../../lib/db";
import type { Conta } from "../../lib/supabase";
import { PLANOS_DEFAULT, fmtPreco } from "../../lib/planos";
import InputNumerico from "../../components/InputNumerico";
import type { PlanoId } from "../../lib/planos";

// ─── tipos ───────────────────────────────────────────────────────────────────

type ContaAdmin = Conta & { fazendas_count: number };
type StatusCliente = NonNullable<Conta["status"]>;
type PacoteCliente = NonNullable<Conta["pacote"]>;

const STATUS_CFG: Record<StatusCliente, { label: string; cor: string; bg: string }> = {
  trial:        { label: "Trial",        cor: "#C9921B", bg: "#FBF3E0" },
  ativo:        { label: "Ativo",        cor: "#16A34A", bg: "#F0FDF4" },
  inativo:      { label: "Inativo",      cor: "var(--text-3)",    bg: "#F3F4F6" },
  inadimplente: { label: "Inadimplente", cor: "#E24B4A", bg: "#FEF2F2" },
  pro_bono:     { label: "Pro Bono",     cor: "#378ADD", bg: "#EFF6FF" },
  cancelado:    { label: "Cancelado",    cor: "#6B7280", bg: "#F3F4F6" },
};

const PACOTE_CFG: Record<PacoteCliente, { label: string; cor: string; bg: string; valor: number }> = {
  essencial:   { label: "Essencial",   cor: "var(--text-2)",    bg: "#F3F4F6", valor: PLANOS_DEFAULT.essencial.preco_mensal   },
  gestao:      { label: "Gestão",      cor: "#1A4870", bg: "#D5E8F5", valor: PLANOS_DEFAULT.gestao.preco_mensal      },
  performance: { label: "Performance", cor: "#7A5A12", bg: "#FBF3E0", valor: PLANOS_DEFAULT.performance.preco_mensal },
};

// ─── helpers ─────────────────────────────────────────────────────────────────

function fmtDate(s?: string | null) {
  if (!s) return "—";
  const [y, m, d] = s.split("-");
  return `${d}/${m}/${y}`;
}

function fmtBRL(v?: number | null) {
  if (!v) return "—";
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function diasRestantes(venc?: string | null): number | null {
  if (!venc) return null;
  return Math.ceil((new Date(venc).getTime() - Date.now()) / 86400000);
}

// ─── estilos ─────────────────────────────────────────────────────────────────

const inp: React.CSSProperties = {
  width: "100%", padding: "8px 10px",
  border: "0.5px solid var(--border-table)", borderRadius: 8,
  fontSize: 13, color: "var(--text-1)", background: "var(--bg-card)",
  boxSizing: "border-box", outline: "none",
};
const lbl: React.CSSProperties = {
  fontSize: 11, color: "var(--text-2)", marginBottom: 4, display: "block", fontWeight: 600,
};
const btnPrimary: React.CSSProperties = {
  padding: "8px 20px", background: "#0B1E35", color: "#fff",
  border: "none", borderRadius: 8, fontWeight: 600, cursor: "pointer", fontSize: 13,
};
const btnSecondary: React.CSSProperties = {
  padding: "8px 20px", background: "var(--bg-card)", color: "var(--text-2)",
  border: "0.5px solid var(--border-table)", borderRadius: 8, fontWeight: 600, cursor: "pointer", fontSize: 13,
};

// ─── Modal editar cliente ─────────────────────────────────────────────────────

function ModalCliente({ conta, onClose, onSalvo }: { conta: ContaAdmin; onClose: () => void; onSalvo: (c: ContaAdmin) => void }) {
  const [form, setForm] = useState<Partial<Conta>>({
    nome:              conta.nome,
    tipo:              conta.tipo,
    status:            conta.status ?? "trial",
    pacote:            conta.pacote ?? undefined,
    data_inicio:       conta.data_inicio ?? "",
    data_vencimento:   conta.data_vencimento ?? "",
    valor_mensalidade: conta.valor_mensalidade ?? undefined,
    pro_bono_motivo:   conta.pro_bono_motivo ?? "",
    obs_admin:         conta.obs_admin ?? "",
    email_contato:     conta.email_contato ?? "",
    telefone:          conta.telefone ?? "",
  });
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");
  const [aba, setAba] = useState<"geral"|"assinatura">("geral");

  async function salvar() {
    setSalvando(true); setErro("");
    try {
      await atualizarConta(conta.id, form);
      onSalvo({ ...conta, ...form } as ContaAdmin);
    } catch (e) { setErro(String(e)); }
    finally { setSalvando(false); }
  }

  return (
    <div style={{ position: "fixed", inset: 0, background: "#00000070", zIndex:2000, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ background: "var(--bg-card)", borderRadius: 14, width: 660, maxHeight: "90vh", overflowY: "auto", boxShadow: "0 12px 48px #0004" }}>

        {/* Header */}
        <div style={{ padding: "18px 24px", borderBottom: "0.5px solid #E4E9F0", display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: "#0B1E35" }}>{conta.nome}</div>
            <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2, fontFamily: "monospace" }}>{conta.id}</div>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 18, cursor: "pointer", color: "var(--text-muted)" }}>✕</button>
        </div>

        {/* Tabs */}
        <div style={{ display: "flex", gap: 0, borderBottom: "0.5px solid #E4E9F0", padding: "0 24px" }}>
          {(["geral", "assinatura"] as const).map(t => (
            <button key={t} onClick={() => setAba(t)} style={{
              padding: "10px 16px", border: "none", background: "none", cursor: "pointer",
              fontSize: 13, fontWeight: aba === t ? 700 : 400,
              color: aba === t ? "#0B1E35" : "var(--text-3)",
              borderBottom: aba === t ? "2px solid #C9921B" : "2px solid transparent",
              marginBottom: -1,
              textTransform: "capitalize",
            }}>{t === "geral" ? "Dados gerais" : "Assinatura & Pacote"}</button>
          ))}
        </div>

        <div style={{ padding: "20px 24px" }}>

          {aba === "geral" && (
            <>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 14 }}>
                <div style={{ gridColumn: "1 / -1" }}>
                  <label style={lbl}>Nome da conta *</label>
                  <input style={inp} value={form.nome ?? ""} onChange={e => setForm(f => ({ ...f, nome: e.target.value }))} />
                </div>
                <div>
                  <label style={lbl}>E-mail contato</label>
                  <input style={inp} type="email" value={form.email_contato ?? ""} onChange={e => setForm(f => ({ ...f, email_contato: e.target.value }))} />
                </div>
                <div>
                  <label style={lbl}>Telefone / WhatsApp</label>
                  <input style={inp} value={form.telefone ?? ""} onChange={e => setForm(f => ({ ...f, telefone: e.target.value }))} />
                </div>
                <div>
                  <label style={lbl}>Tipo de conta</label>
                  <select style={inp} value={form.tipo} onChange={e => setForm(f => ({ ...f, tipo: e.target.value as Conta["tipo"] }))}>
                    <option value="pf">Pessoa Física</option>
                    <option value="pj">Pessoa Jurídica</option>
                    <option value="grupo">Grupo / Holding</option>
                  </select>
                </div>
              </div>
              <div>
                <label style={lbl}>Observações internas</label>
                <textarea style={{ ...inp, height: 80, resize: "vertical" } as React.CSSProperties}
                  value={form.obs_admin ?? ""}
                  onChange={e => setForm(f => ({ ...f, obs_admin: e.target.value }))}
                  placeholder="Histórico, acordos especiais, contatos..."
                />
              </div>
            </>
          )}

          {aba === "assinatura" && (
            <>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14, marginBottom: 14 }}>
                <div>
                  <label style={lbl}>Status *</label>
                  <select style={inp} value={form.status ?? "trial"} onChange={e => setForm(f => ({ ...f, status: e.target.value as StatusCliente }))}>
                    {(Object.keys(STATUS_CFG) as StatusCliente[]).map(s => (
                      <option key={s} value={s}>{STATUS_CFG[s].label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label style={lbl}>Pacote</label>
                  <select style={inp} value={form.pacote ?? ""} onChange={e => {
                    const v = e.target.value as PacoteCliente | "";
                    if (v) setForm(f => ({ ...f, pacote: v, valor_mensalidade: PACOTE_CFG[v].valor }));
                    else setForm(f => ({ ...f, pacote: undefined }));
                  }}>
                    <option value="">— Sem pacote —</option>
                    {(Object.keys(PACOTE_CFG) as PacoteCliente[]).map(p => (
                      <option key={p} value={p}>{PACOTE_CFG[p].label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label style={lbl}>Mensalidade (R$)</label>
                  <InputNumerico style={inp} value={form.valor_mensalidade ?? ""} onChange={v => setForm(f => ({ ...f, valor_mensalidade: Number(v) || undefined }))} />
                </div>
                <div>
                  <label style={lbl}>Data início</label>
                  <input style={inp} type="date" value={form.data_inicio ?? ""} onChange={e => setForm(f => ({ ...f, data_inicio: e.target.value }))} />
                </div>
                <div>
                  <label style={lbl}>Data vencimento</label>
                  <input style={inp} type="date" value={form.data_vencimento ?? ""} onChange={e => setForm(f => ({ ...f, data_vencimento: e.target.value }))} />
                </div>
              </div>
              {form.status === "pro_bono" && (
                <div style={{ marginBottom: 14 }}>
                  <label style={lbl}>Motivo pro bono</label>
                  <input style={inp} value={form.pro_bono_motivo ?? ""} onChange={e => setForm(f => ({ ...f, pro_bono_motivo: e.target.value }))} placeholder="Ex: parceiro estratégico, projeto piloto..." />
                </div>
              )}
            </>
          )}

          {erro && <div style={{ padding: "8px 12px", background: "#FEF2F2", borderRadius: 8, color: "#991B1B", fontSize: 12, marginBottom: 12 }}>{erro}</div>}

          <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 20, paddingTop: 16, borderTop: "0.5px solid var(--bg-tag)" }}>
            <button style={btnSecondary} onClick={onClose}>Cancelar</button>
            <button style={btnPrimary} onClick={salvar} disabled={salvando || !form.nome}>
              {salvando ? "Salvando…" : "Salvar alterações"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Aba Planos ───────────────────────────────────────────────────────────────

const MODULOS_LABEL: Record<string, string> = {
  cadastros: "Cadastros", propriedades: "Fazendas & Talhões",
  lavoura_plantio: "Plantio", lavoura_pulv: "Pulverização", lavoura_colheita: "Colheita", lavoura_plan: "Planejamento",
  estoque: "Estoque", fin_pagar: "Contas a Pagar", fin_receber: "Contas a Receber",
  custos: "DRE Agrícola", fin_relatorios: "Rel. Financeiros", configuracoes: "Configurações",
  contratos: "Contratos de Grãos", expedicao: "Expedição", arrendamento: "Arrendamentos",
  compras: "Pedidos de Compra", nf_entrada: "NF de Entrada", nf_servico: "NF de Serviços",
  fin_contratos: "Contratos Financeiros", fin_tesouraria: "Tesouraria", fin_seguros: "Seguros",
  transporte: "CT-e / MDF-e", usuarios: "Gestão de Usuários",
  fiscal_nfe: "Emissão NF-e (SEFAZ)", fiscal_sped: "SPED ECD / LCDPR",
  bi: "BI — Raccotlo Intelligence",
};

const ORDEM_PLANOS: PlanoId[] = ["essencial", "gestao", "performance"];

// ─── Página principal (Overview + clientes) ───────────────────────────────────

type AbaPage = "overview" | "clientes" | "planos";

export default function AdminOverview() {
  const { userRole, raccotloGestor } = useAuth();
  const router = useRouter();
  const [aba, setAba] = useState<AbaPage>("overview");

  useEffect(() => {
    if (userRole === null) return;
    if (userRole !== "raccotlo" || !raccotloGestor) router.replace("/raccotlo");
  }, [userRole, raccotloGestor, router]);

  // ── Clientes ────────────────────────────────────────────────────────────────
  const [clientes,         setClientes]         = useState<ContaAdmin[]>([]);
  const [loading,          setLoading]          = useState(true);
  const [modalEdit,        setModalEdit]        = useState<ContaAdmin | null>(null);
  const [filtroStatus,     setFiltroStatus]     = useState<StatusCliente | "">("");
  const [filtroPacote,     setFiltroPacote]     = useState<PacoteCliente | "">("");
  const [busca,            setBusca]            = useState("");
  const [liberandoOnb,     setLiberandoOnb]     = useState<string | null>(null); // conta_id em progresso


  const carregar = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/listar-contas");
      if (!res.ok) throw new Error("Erro ao carregar");
      setClientes(await res.json());
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  const liberarOnboarding = useCallback(async (contaId: string, contaNome: string) => {
    if (!confirm(`Liberar acesso de "${contaNome}"?\n\nO onboarding será desativado e o cliente poderá acessar o sistema conforme o perfil de usuário cadastrado.`)) return;
    setLiberandoOnb(contaId);
    try {
      const res = await fetch("/api/admin/liberar-onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conta_id: contaId }),
      });
      const json = await res.json();
      if (!json.ok) alert("Erro ao liberar: " + (json.error ?? "desconhecido"));
      await carregar();
    } catch { alert("Erro de conexão."); }
    setLiberandoOnb(null);
  }, [carregar]);

  const clientesFiltrados = clientes.filter(c => {
    if (filtroStatus && c.status !== filtroStatus) return false;
    if (filtroPacote && c.pacote !== filtroPacote) return false;
    if (busca && !c.nome.toLowerCase().includes(busca.toLowerCase())) return false;
    return true;
  });

  const mrr = clientes.filter(c => c.status === "ativo" && c.valor_mensalidade)
    .reduce((s, c) => s + (c.valor_mensalidade ?? 0), 0);
  const arr = mrr * 12;

  // Vencimentos próximos (≤ 14 dias)
  const vencProximos = clientes.filter(c => {
    const d = diasRestantes(c.data_vencimento);
    return d !== null && d >= 0 && d <= 14;
  }).sort((a, b) => (diasRestantes(a.data_vencimento) ?? 99) - (diasRestantes(b.data_vencimento) ?? 99));

  // ── KPIs globais ────────────────────────────────────────────────────────────
  const kpis = [
    { label: "Total de contas",  valor: clientes.length,                                             cor: "#0B1E35", bg: "var(--bg-card)"    },
    { label: "Ativos",           valor: clientes.filter(c => c.status === "ativo").length,           cor: "#16A34A", bg: "#F0FDF4" },
    { label: "Em trial",         valor: clientes.filter(c => c.status === "trial").length,           cor: "#C9921B", bg: "#FBF3E0" },
    { label: "Pro bono",         valor: clientes.filter(c => c.status === "pro_bono").length,        cor: "#378ADD", bg: "#EFF6FF" },
    { label: "MRR",              valor: mrr  > 0 ? fmtBRL(mrr)  : "R$ 0",                          cor: "#0B1E35", bg: "var(--bg-card)"    },
    { label: "ARR (projetado)",  valor: arr  > 0 ? fmtBRL(arr)  : "R$ 0",                          cor: "#0B1E35", bg: "var(--bg-card)"    },
  ];

  const ABAS: { key: AbaPage; label: string }[] = [
    { key: "overview",  label: "Visão Geral"       },
    { key: "clientes",  label: `Clientes (${clientes.length})` },
    { key: "planos",    label: "Planos & Preços"   },
  ];

  return (
    <div style={{ fontFamily: "system-ui, sans-serif", fontSize: 13 }}>

      {modalEdit && (
        <ModalCliente
          conta={modalEdit}
          onClose={() => setModalEdit(null)}
          onSalvo={upd => { setClientes(cs => cs.map(c => c.id === upd.id ? upd : c)); setModalEdit(null); }}
        />
      )}

      {/* Page header */}
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ margin: "0 0 2px", fontSize: 22, fontWeight: 800, color: "#0B1E35", letterSpacing: "-0.3px" }}>
          Painel Administrativo
        </h1>
        <p style={{ margin: 0, fontSize: 13, color: "var(--text-3)" }}>
          Gestão de clientes, assinaturas e configurações do Arato
        </p>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 0, borderBottom: "0.5px solid var(--border-table)", marginBottom: 24 }}>
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

      {/* ── OVERVIEW ── */}
      {aba === "overview" && (
        <div>
          {/* KPIs */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 14, marginBottom: 24 }}>
            {kpis.map(k => (
              <div key={k.label} style={{
                background: k.bg, borderRadius: 12, border: "0.5px solid var(--border)",
                padding: "16px 18px",
              }}>
                <div style={{ fontSize: 11, color: "var(--text-3)", marginBottom: 6, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em" }}>{k.label}</div>
                <div style={{ fontSize: 22, fontWeight: 800, color: k.cor }}>{k.valor}</div>
              </div>
            ))}
          </div>

          {/* Distribuição por pacote */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginBottom: 24 }}>

            {/* Distribuição */}
            <div style={{ background: "var(--bg-card)", borderRadius: 12, border: "0.5px solid var(--border)", padding: "20px 24px" }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: "#0B1E35", marginBottom: 16 }}>Distribuição por Pacote</div>
              {(Object.keys(PACOTE_CFG) as PacoteCliente[]).map(p => {
                const qtd = clientes.filter(c => c.pacote === p && c.status === "ativo").length;
                const pct = clientes.filter(c => c.status === "ativo").length > 0
                  ? (qtd / clientes.filter(c => c.status === "ativo").length) * 100 : 0;
                return (
                  <div key={p} style={{ marginBottom: 14 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
                      <span style={{ fontSize: 12, fontWeight: 600, color: PACOTE_CFG[p].cor }}>{PACOTE_CFG[p].label}</span>
                      <span style={{ fontSize: 12, color: "var(--text-2)" }}>{qtd} cliente{qtd !== 1 ? "s" : ""} · {fmtBRL(PACOTE_CFG[p].valor * qtd)}/mês</span>
                    </div>
                    <div style={{ height: 6, background: "var(--bg-tag)", borderRadius: 4, overflow: "hidden" }}>
                      <div style={{ height: "100%", background: PACOTE_CFG[p].cor, width: `${pct}%`, borderRadius: 4, transition: "width 0.4s" }} />
                    </div>
                  </div>
                );
              })}
              <div style={{ borderTop: "0.5px solid var(--bg-tag)", paddingTop: 12, marginTop: 4 }}>
                <div style={{ fontSize: 11, color: "var(--text-3)" }}>
                  {clientes.filter(c => !c.pacote && c.status === "ativo").length} ativo(s) sem pacote definido
                </div>
              </div>
            </div>

            {/* Vencimentos próximos */}
            <div style={{ background: "var(--bg-card)", borderRadius: 12, border: "0.5px solid var(--border)", padding: "20px 24px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: "#0B1E35" }}>Vencimentos Próximos (14 dias)</div>
                <span style={{
                  fontSize: 11, fontWeight: 700, padding: "2px 8px",
                  background: vencProximos.length > 0 ? "#FEF2F2" : "#F0FDF4",
                  color: vencProximos.length > 0 ? "#E24B4A" : "#16A34A",
                  borderRadius: 6,
                }}>
                  {vencProximos.length}
                </span>
              </div>

              {vencProximos.length === 0 ? (
                <div style={{ textAlign: "center", padding: "24px 0", color: "var(--text-muted)", fontSize: 12 }}>
                  ✓ Nenhum vencimento nos próximos 14 dias
                </div>
              ) : vencProximos.map(c => {
                const dias = diasRestantes(c.data_vencimento) ?? 0;
                return (
                  <div key={c.id} style={{
                    display: "flex", justifyContent: "space-between", alignItems: "center",
                    padding: "10px 0", borderBottom: "0.5px solid var(--bg-tag)",
                  }}>
                    <div>
                      <div style={{ fontWeight: 600, color: "var(--text-1)", fontSize: 13 }}>{c.nome}</div>
                      <div style={{ fontSize: 11, color: "var(--text-3)" }}>
                        {c.pacote ? PACOTE_CFG[c.pacote]?.label : "—"}
                        {c.email_contato ? ` · ${c.email_contato}` : ""}
                      </div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: dias <= 3 ? "#E24B4A" : "#C9921B" }}>
                        {fmtDate(c.data_vencimento)}
                      </div>
                      <div style={{ fontSize: 10, color: dias <= 3 ? "#E24B4A" : "var(--text-3)" }}>
                        {dias === 0 ? "Vence hoje" : `${dias}d restantes`}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Últimas contas criadas */}
          <div style={{ background: "var(--bg-card)", borderRadius: 12, border: "0.5px solid var(--border)", overflow: "hidden" }}>
            <div style={{ padding: "16px 20px", borderBottom: "0.5px solid var(--bg-tag)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: "#0B1E35" }}>Todas as Contas</div>
              <button onClick={() => setAba("clientes")} style={{ fontSize: 12, color: "#1A4870", background: "none", border: "none", cursor: "pointer", fontWeight: 600 }}>
                Ver lista completa →
              </button>
            </div>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ background: "var(--bg-card)" }}>
                  {["Conta", "Pacote", "Status", "Vencimento", "Mensalidade"].map((h, i) => (
                    <th key={i} style={{ padding: "9px 16px", textAlign: "left", fontSize: 11, fontWeight: 600, color: "var(--text-3)", borderBottom: "0.5px solid var(--bg-tag)", textTransform: "uppercase", letterSpacing: "0.04em" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {clientes.slice(0, 8).map((c, i) => {
                  const status = c.status ?? "trial";
                  const sCfg = STATUS_CFG[status] ?? STATUS_CFG.trial;
                  const dias = diasRestantes(c.data_vencimento);
                  const urgente = dias !== null && dias >= 0 && dias <= 14;
                  return (
                    <tr key={c.id} style={{ borderBottom: i < 7 ? "0.5px solid var(--bg-tag)" : "none" }}>
                      <td style={{ padding: "11px 16px" }}>
                        <div style={{ fontWeight: 600, color: "var(--text-1)" }}>{c.nome}</div>
                        {c.email_contato && <div style={{ fontSize: 11, color: "var(--text-3)", marginTop: 1 }}>{c.email_contato}</div>}
                      </td>
                      <td style={{ padding: "11px 16px" }}>
                        {c.pacote ? (
                          <span style={{ padding: "2px 8px", background: PACOTE_CFG[c.pacote].bg, color: PACOTE_CFG[c.pacote].cor, borderRadius: 6, fontSize: 11, fontWeight: 600 }}>
                            {PACOTE_CFG[c.pacote].label}
                          </span>
                        ) : <span style={{ color: "var(--text-muted)", fontSize: 11 }}>—</span>}
                      </td>
                      <td style={{ padding: "11px 16px" }}>
                        <span style={{ padding: "2px 8px", background: sCfg.bg, color: sCfg.cor, borderRadius: 6, fontSize: 11, fontWeight: 600 }}>
                          {sCfg.label}
                        </span>
                      </td>
                      <td style={{ padding: "11px 16px", fontSize: 12, color: urgente ? "#C9921B" : "var(--text-2)", fontWeight: urgente ? 600 : 400 }}>
                        {fmtDate(c.data_vencimento)}
                        {urgente && dias !== null && <span style={{ fontSize: 10, marginLeft: 6, color: "#C9921B" }}>({dias}d)</span>}
                      </td>
                      <td style={{ padding: "11px 16px", fontSize: 12, fontWeight: 600, color: c.valor_mensalidade ? "#0B1E35" : "var(--text-muted)" }}>
                        {fmtBRL(c.valor_mensalidade)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Migration notice */}
          <div style={{ marginTop: 16, padding: "10px 14px", background: "#EFF6FF", borderRadius: 8, border: "0.5px solid #378ADD40", fontSize: 11, color: "#1A4870", lineHeight: 1.7 }}>
            <strong>Migration necessária:</strong> Se os campos de status/pacote/mensalidade não aparecerem, execute no Supabase SQL Editor:
            <code style={{ display: "block", marginTop: 6, background: "#D5E8F5", borderRadius: 4, padding: "4px 8px", fontFamily: "monospace", fontSize: 10, color: "#0B2D50", overflowX: "auto" }}>
              {`ALTER TABLE contas ADD COLUMN IF NOT EXISTS status text DEFAULT 'trial', ADD COLUMN IF NOT EXISTS pacote text, ADD COLUMN IF NOT EXISTS data_inicio date, ADD COLUMN IF NOT EXISTS data_vencimento date, ADD COLUMN IF NOT EXISTS valor_mensalidade numeric(10,2), ADD COLUMN IF NOT EXISTS pro_bono_motivo text, ADD COLUMN IF NOT EXISTS obs_admin text, ADD COLUMN IF NOT EXISTS email_contato text, ADD COLUMN IF NOT EXISTS telefone text;`}
            </code>
          </div>
        </div>
      )}

      {/* ── CLIENTES ── */}
      {aba === "clientes" && (
        <div>
          {/* Filtros */}
          <div style={{ background: "var(--bg-card)", borderRadius: 10, border: "0.5px solid var(--border-table)", padding: "14px 16px", marginBottom: 16, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <input style={{ ...inp, width: 240 }} placeholder="Buscar cliente..." value={busca} onChange={e => setBusca(e.target.value)} />
            <select style={{ ...inp, width: 160 }} value={filtroStatus} onChange={e => setFiltroStatus(e.target.value as StatusCliente | "")}>
              <option value="">Todos os status</option>
              {(Object.keys(STATUS_CFG) as StatusCliente[]).map(s => <option key={s} value={s}>{STATUS_CFG[s].label}</option>)}
            </select>
            <select style={{ ...inp, width: 160 }} value={filtroPacote} onChange={e => setFiltroPacote(e.target.value as PacoteCliente | "")}>
              <option value="">Todos os pacotes</option>
              {(Object.keys(PACOTE_CFG) as PacoteCliente[]).map(p => <option key={p} value={p}>{PACOTE_CFG[p].label}</option>)}
            </select>
            <button style={{ ...btnSecondary, padding: "7px 14px", fontSize: 12 }} onClick={carregar}>↺ Atualizar</button>
            <div style={{ marginLeft: "auto", fontSize: 11, color: "var(--text-3)" }}>{clientesFiltrados.length} de {clientes.length} clientes</div>
          </div>

          {/* Tabela */}
          <div style={{ background: "var(--bg-card)", borderRadius: 10, border: "0.5px solid var(--border-table)", overflow: "hidden" }}>
            {loading ? (
              <div style={{ padding: "48px 0", textAlign: "center", color: "var(--text-3)" }}>Carregando…</div>
            ) : clientesFiltrados.length === 0 ? (
              <div style={{ padding: "48px 0", textAlign: "center", color: "var(--text-3)" }}>Nenhum cliente encontrado</div>
            ) : (
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ background: "var(--bg-card)" }}>
                    {["Conta", "Pacote", "Status", "Desde", "Vencimento", "Mensalidade", "Fazendas", ""].map((h, i) => (
                      <th key={i} style={{ padding: "10px 14px", textAlign: i >= 5 ? "center" : "left", fontSize: 11, fontWeight: 600, color: "var(--text-3)", borderBottom: "0.5px solid var(--border-table)", textTransform: "uppercase", letterSpacing: "0.04em", whiteSpace: "nowrap" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {clientesFiltrados.map((c, i) => {
                    const status = c.status ?? "trial";
                    const sCfg   = STATUS_CFG[status] ?? STATUS_CFG.trial;
                    const dias   = diasRestantes(c.data_vencimento);
                    const urgente = dias !== null && dias >= 0 && dias <= 14;
                    const vencido = dias !== null && dias < 0;

                    return (
                      <tr key={c.id} style={{ borderBottom: i < clientesFiltrados.length - 1 ? "0.5px solid var(--bg-tag)" : "none" }}>
                        <td style={{ padding: "11px 14px" }}>
                          <div style={{ fontWeight: 600, color: "var(--text-1)" }}>{c.nome}</div>
                          {c.email_contato && <div style={{ fontSize: 11, color: "var(--text-3)", marginTop: 1 }}>{c.email_contato}</div>}
                        </td>
                        <td style={{ padding: "11px 14px" }}>
                          {c.pacote ? (
                            <span style={{ padding: "2px 8px", background: PACOTE_CFG[c.pacote].bg, color: PACOTE_CFG[c.pacote].cor, borderRadius: 6, fontSize: 11, fontWeight: 600 }}>
                              {PACOTE_CFG[c.pacote].label}
                            </span>
                          ) : <span style={{ color: "var(--text-muted)", fontSize: 11 }}>—</span>}
                        </td>
                        <td style={{ padding: "11px 14px" }}>
                          <span style={{ padding: "2px 8px", background: sCfg.bg, color: sCfg.cor, borderRadius: 6, fontSize: 11, fontWeight: 600 }}>
                            {sCfg.label}
                          </span>
                        </td>
                        <td style={{ padding: "11px 14px", color: "var(--text-2)", fontSize: 12 }}>{fmtDate(c.data_inicio)}</td>
                        <td style={{ padding: "11px 14px" }}>
                          {c.data_vencimento ? (
                            <>
                              <div style={{ fontSize: 12, color: vencido ? "#E24B4A" : urgente ? "#C9921B" : "var(--text-2)", fontWeight: (urgente || vencido) ? 600 : 400 }}>
                                {fmtDate(c.data_vencimento)}
                              </div>
                              {dias !== null && (
                                <div style={{ fontSize: 10, color: vencido ? "#E24B4A" : urgente ? "#C9921B" : "var(--text-muted)" }}>
                                  {vencido ? `vencido há ${Math.abs(dias)}d` : `${dias}d restantes`}
                                </div>
                              )}
                            </>
                          ) : <span style={{ color: "var(--text-muted)", fontSize: 11 }}>—</span>}
                        </td>
                        <td style={{ padding: "11px 14px", textAlign: "center", fontSize: 12, fontWeight: 600, color: c.valor_mensalidade ? "#0B1E35" : "var(--text-muted)" }}>
                          {fmtBRL(c.valor_mensalidade)}
                        </td>
                        <td style={{ padding: "11px 14px", textAlign: "center" }}>
                          <span style={{ background: "var(--bg-page)", borderRadius: 6, padding: "2px 10px", fontSize: 12, color: "var(--text-2)", fontWeight: 600 }}>
                            {c.fazendas_count}
                          </span>
                        </td>
                        <td style={{ padding: "11px 14px", textAlign: "center" }}>
                          <div style={{ display: "flex", gap: 6, justifyContent: "center", alignItems: "center" }}>
                            {c.onboarding_ativo && (
                              <button
                                onClick={() => liberarOnboarding(c.id, c.nome)}
                                disabled={liberandoOnb === c.id}
                                title="Liberar acesso — desativar onboarding"
                                style={{ padding: "5px 10px", border: "0.5px solid #16A34A80", borderRadius: 6, background: "#F0FDF4", cursor: liberandoOnb === c.id ? "not-allowed" : "pointer", fontSize: 11, color: "#16A34A", fontWeight: 600, whiteSpace: "nowrap" }}
                              >
                                {liberandoOnb === c.id ? "…" : "🔓 Liberar"}
                              </button>
                            )}
                            <button
                              onClick={() => setModalEdit(c)}
                              style={{ padding: "5px 12px", border: "0.5px solid var(--border-table)", borderRadius: 6, background: "var(--bg-card)", cursor: "pointer", fontSize: 11, color: "#0B1E35", fontWeight: 600 }}
                            >
                              ✎ Editar
                            </button>
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
      )}

      {/* ── PLANOS ── */}
      {aba === "planos" && (
        <div>
          {/* Header com link para gestão completa */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
            <div>
              <h2 style={{ margin: "0 0 4px", fontSize: 16, fontWeight: 700, color: "#0B1E35" }}>Planos & Preços</h2>
              <p style={{ margin: 0, fontSize: 12, color: "var(--text-3)" }}>Preços carregados do banco de dados em tempo real.</p>
            </div>
            <a href="/admin/planos" style={{
              padding: "8px 16px", background: "#0B1E35", color: "#fff",
              borderRadius: 8, fontSize: 12, fontWeight: 600, textDecoration: "none",
            }}>
              ✎ Editar planos →
            </a>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16, marginBottom: 24 }}>
            {ORDEM_PLANOS.map(pid => {
              const p = PLANOS_DEFAULT[pid];
              return (
                <div key={pid} style={{ background: "var(--bg-card)", borderRadius: 12, border: pid === "gestao" ? "2px solid #0B1E35" : "0.5px solid var(--border-table)", padding: "20px 22px" }}>
                  <div style={{ fontSize: 15, fontWeight: 700, color: "#0B1E35", marginBottom: 4 }}>{p.nome}</div>
                  <div style={{ fontSize: 11, color: "var(--text-3)", marginBottom: 12 }}>{p.descricao}</div>
                  <div style={{ fontSize: 26, fontWeight: 800, color: "#0B1E35", marginBottom: 4 }}>{fmtPreco(p.preco_mensal)}<span style={{ fontSize: 11, color: "var(--text-3)", fontWeight: 400 }}>/mês</span></div>
                  <div style={{ fontSize: 11, color: "#666", marginBottom: 14 }}>Trial: {p.trial_dias}d · Usuários: {p.limite_usuarios ?? "∞"}</div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                    {p.modulos.map(m => (
                      <span key={m} style={{ fontSize: 10, background: "#F0F7FF", color: "#1A4870", borderRadius: 4, padding: "2px 6px", border: "0.5px solid #C5DFF5" }}>
                        {MODULOS_LABEL[m] ?? m}
                      </span>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Tabela comparativa */}
          <div style={{ background: "var(--bg-card)", borderRadius: 12, border: "0.5px solid var(--border-table)", overflow: "hidden" }}>
            <div style={{ padding: "14px 20px", borderBottom: "0.5px solid var(--bg-tag)" }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: "#0B1E35" }}>Comparativo de Módulos</div>
            </div>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ background: "var(--bg-card)" }}>
                  <th style={{ padding: "10px 16px", textAlign: "left", fontSize: 11, fontWeight: 600, color: "var(--text-3)", width: "40%" }}>Módulo</th>
                  {ORDEM_PLANOS.map(pid => (
                    <th key={pid} style={{ padding: "10px 14px", textAlign: "center", fontSize: 12, fontWeight: 700, color: "#0B1E35" }}>{PLANOS_DEFAULT[pid].nome}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {Object.keys(MODULOS_LABEL).map((modulo, i) => (
                  <tr key={modulo} style={{ borderBottom: "0.5px solid var(--bg-tag)", background: i % 2 === 0 ? "#fff" : "#FAFBFD" }}>
                    <td style={{ padding: "9px 16px", fontSize: 12, color: "#333" }}>{MODULOS_LABEL[modulo]}</td>
                    {ORDEM_PLANOS.map(pid => (
                      <td key={pid} style={{ padding: "9px 14px", textAlign: "center" }}>
                        {PLANOS_DEFAULT[pid].modulos.includes(modulo)
                          ? <span style={{ color: "#16A34A", fontSize: 14, fontWeight: 700 }}>✓</span>
                          : <span style={{ color: "var(--border-table)" }}>—</span>}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div style={{ marginTop: 20, padding: "12px 16px", background: "#F0F7FF", borderRadius: 10, border: "0.5px solid #1A487040", fontSize: 12, color: "#0B2D50", display: "flex", alignItems: "center", gap: 10 }}>
            <span>Para editar preços, clique em <strong>"Editar planos →"</strong> acima ou acesse</span>
            <a href="/admin/planos" style={{ color: "#1A4870", fontWeight: 600 }}>/admin/planos</a>
            <span>. Alterações são refletidas imediatamente no site público.</span>
          </div>
        </div>
      )}

    </div>
  );
}
