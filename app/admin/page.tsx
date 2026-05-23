"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import TopNav from "../../components/TopNav";
import { useAuth } from "../../components/AuthProvider";
import { listarContasAdmin, atualizarConta } from "../../lib/db";
import type { Conta } from "../../lib/supabase";
import { PLANOS_DEFAULT, fmtPreco } from "../../lib/planos";
import type { PlanoId } from "../../lib/planos";

// ─────────────────────────────────────────────────────────────────────────────
// Painel Administrativo — Arato (sistema)
// Acessível apenas pelo raccotlo (role = 'raccotlo')
// ─────────────────────────────────────────────────────────────────────────────

type ContaAdmin = Conta & { fazendas_count: number };

type StatusCliente = NonNullable<Conta["status"]>;
type PacoteCliente = NonNullable<Conta["pacote"]>;

const STATUS_CFG: Record<StatusCliente, { label: string; cor: string; bg: string }> = {
  trial:     { label: "Trial",     cor: "#C9921B", bg: "#FBF3E0" },
  ativo:     { label: "Ativo",     cor: "#16A34A", bg: "#F0FDF4" },
  inativo:   { label: "Inativo",   cor: "#888",    bg: "#F3F4F6" },
  pro_bono:  { label: "Pro bono",  cor: "#378ADD", bg: "#EFF6FF" },
  cancelado: { label: "Cancelado", cor: "#E24B4A", bg: "#FEF2F2" },
};

const PACOTE_CFG: Record<PacoteCliente, { label: string; cor: string; bg: string; valor: number }> = {
  essencial:   { label: "Essencial",   cor: "#555",    bg: "#F3F4F6", valor: 290  },
  gestao:      { label: "Gestão",      cor: "#1A4870", bg: "#D5E8F5", valor: 590  },
  performance: { label: "Performance", cor: "#7A5A12", bg: "#FBF3E0", valor: 990  },
};

const inp: React.CSSProperties = {
  width: "100%", padding: "8px 10px", border: "0.5px solid #D4DCE8",
  borderRadius: 8, fontSize: 13, color: "#1a1a1a", background: "#fff",
  boxSizing: "border-box", outline: "none",
};
const lbl: React.CSSProperties = { fontSize: 11, color: "#555", marginBottom: 4, display: "block" };
const btnPrimary: React.CSSProperties = {
  padding: "8px 20px", background: "#1A4870", color: "#fff",
  border: "none", borderRadius: 8, fontWeight: 600, cursor: "pointer", fontSize: 13,
};
const btnSecondary: React.CSSProperties = {
  padding: "8px 20px", background: "#fff", color: "#555",
  border: "0.5px solid #D4DCE8", borderRadius: 8, fontWeight: 600, cursor: "pointer", fontSize: 13,
};

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
  const diff = (new Date(venc).getTime() - Date.now()) / 86400000;
  return Math.ceil(diff);
}

function carregarImagem(file: File, onLoad: (b64: string) => void) {
  const reader = new FileReader();
  reader.onload = e => {
    if (!e.target?.result) return;
    const img = new Image();
    img.onload = () => {
      const MAX = 200;
      const ratio = Math.min(MAX / img.width, MAX / img.height, 1);
      const canvas = document.createElement("canvas");
      canvas.width  = Math.round(img.width  * ratio);
      canvas.height = Math.round(img.height * ratio);
      canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
      onLoad(canvas.toDataURL("image/png", 0.85));
    };
    img.src = e.target.result as string;
  };
  reader.readAsDataURL(file);
}

// ── Modal de edição de cliente ────────────────────────────────────────────────
interface ModalClienteProps {
  conta: ContaAdmin;
  onClose: () => void;
  onSalvo: (atualizada: ContaAdmin) => void;
}

function ModalCliente({ conta, onClose, onSalvo }: ModalClienteProps) {
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

  async function salvar() {
    setSalvando(true);
    setErro("");
    try {
      await atualizarConta(conta.id, form);
      onSalvo({ ...conta, ...form } as ContaAdmin);
    } catch (e) {
      setErro(String(e));
    } finally {
      setSalvando(false);
    }
  }

  function autoPreencherPacete(p: PacoteCliente) {
    setForm(f => ({ ...f, pacote: p, valor_mensalidade: PACOTE_CFG[p].valor }));
  }

  return (
    <div style={{ position: "fixed", inset: 0, background: "#00000060", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ background: "#fff", borderRadius: 12, border: "0.5px solid #D4DCE8", width: 640, maxHeight: "90vh", overflowY: "auto", boxShadow: "0 8px 40px #0003" }}>

        {/* Header */}
        <div style={{ padding: "18px 24px", borderBottom: "0.5px solid #E4E9F0", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: "#1a1a1a" }}>Editar cliente</div>
            <div style={{ fontSize: 11, color: "#888", marginTop: 2 }}>{conta.id}</div>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer", color: "#555" }}>✕</button>
        </div>

        {/* Body */}
        <div style={{ padding: "20px 24px" }}>

          {/* Identificação */}
          <div style={{ fontSize: 12, fontWeight: 600, color: "#1A4870", marginBottom: 10, textTransform: "uppercase", letterSpacing: 0.5 }}>Identificação</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 18 }}>
            <div style={{ gridColumn: "1 / -1" }}>
              <label style={lbl}>Nome da conta *</label>
              <input style={inp} value={form.nome ?? ""} onChange={e => setForm(f => ({ ...f, nome: e.target.value }))} />
            </div>
            <div>
              <label style={lbl}>E-mail contato</label>
              <input style={inp} type="email" value={form.email_contato ?? ""} onChange={e => setForm(f => ({ ...f, email_contato: e.target.value }))} />
            </div>
            <div>
              <label style={lbl}>Telefone</label>
              <input style={inp} value={form.telefone ?? ""} onChange={e => setForm(f => ({ ...f, telefone: e.target.value }))} />
            </div>
            <div>
              <label style={lbl}>Tipo</label>
              <select style={inp} value={form.tipo} onChange={e => setForm(f => ({ ...f, tipo: e.target.value as Conta["tipo"] }))}>
                <option value="pf">Pessoa Física</option>
                <option value="pj">Pessoa Jurídica</option>
                <option value="grupo">Grupo / Holding</option>
              </select>
            </div>
          </div>

          {/* Assinatura */}
          <div style={{ fontSize: 12, fontWeight: 600, color: "#1A4870", marginBottom: 10, textTransform: "uppercase", letterSpacing: 0.5 }}>Assinatura</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 12, marginBottom: 18 }}>
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
                if (v) autoPreencherPacete(v);
                else setForm(f => ({ ...f, pacote: undefined }));
              }}>
                <option value="">— Sem pacote —</option>
                {(Object.keys(PACOTE_CFG) as PacoteCliente[]).map(p => (
                  <option key={p} value={p}>{PACOTE_CFG[p].label}</option>
                ))}
              </select>
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

          <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: 12, marginBottom: 18 }}>
            <div>
              <label style={lbl}>Mensalidade (R$)</label>
              <input style={inp} type="number" step="0.01" value={form.valor_mensalidade ?? ""} onChange={e => setForm(f => ({ ...f, valor_mensalidade: Number(e.target.value) || undefined }))} />
            </div>
            {form.status === "pro_bono" && (
              <div>
                <label style={lbl}>Motivo pro bono</label>
                <input style={inp} value={form.pro_bono_motivo ?? ""} onChange={e => setForm(f => ({ ...f, pro_bono_motivo: e.target.value }))} placeholder="Ex: parceiro estratégico, projeto piloto..." />
              </div>
            )}
          </div>

          {/* Obs */}
          <div style={{ marginBottom: 20 }}>
            <label style={lbl}>Observações internas (admin)</label>
            <textarea
              style={{ ...inp, height: 64, resize: "vertical" } as React.CSSProperties}
              value={form.obs_admin ?? ""}
              onChange={e => setForm(f => ({ ...f, obs_admin: e.target.value }))}
              placeholder="Histórico, acordos especiais, contatos, etc."
            />
          </div>

          {erro && <div style={{ padding: "8px 12px", background: "#FEF2F2", border: "0.5px solid #E24B4A50", borderRadius: 8, color: "#991B1B", fontSize: 12, marginBottom: 12 }}>{erro}</div>}

          {/* Footer */}
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
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

// ── Aba Planos ────────────────────────────────────────────────────────────────
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

function AbaPlanos() {
  const [editando, setEditando] = useState<PlanoId | null>(null);
  const [form, setForm] = useState<typeof PLANOS_DEFAULT.essencial | null>(null);

  function iniciarEdicao(pid: PlanoId) {
    setEditando(pid);
    setForm({ ...PLANOS_DEFAULT[pid] });
  }

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <div style={{ background: "#FFF9F0", border: "0.5px solid #C9921B50", borderRadius: 10, padding: "12px 16px", fontSize: 12, color: "#7A5A12", flex: 1, marginRight: 12 }}>
          <strong>Atenção:</strong> Alterações aqui afetam apenas o código local (<code>lib/planos.ts</code>).
          Para alterar preços em produção, atualize diretamente a tabela <code>planos</code> no Supabase SQL Editor.
        </div>
        <a href="/planos" target="_blank" rel="noopener noreferrer"
          style={{ padding: "10px 18px", background: "#1A4870", color: "#fff", borderRadius: 8, fontSize: 13, fontWeight: 600, textDecoration: "none", whiteSpace: "nowrap" }}>
          Ver página pública →
        </a>
      </div>

      {/* Visão geral dos planos */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16, marginBottom: 24 }}>
        {ORDEM_PLANOS.map(pid => {
          const p = PLANOS_DEFAULT[pid];
          return (
            <div key={pid} style={{ background: "#fff", borderRadius: 10, border: pid === "gestao" ? "2px solid #1A4870" : "0.5px solid #D4DCE8", padding: "18px 20px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: "#0B2D50" }}>{p.nome}</div>
                  <div style={{ fontSize: 11, color: "#666", marginTop: 2 }}>{p.descricao}</div>
                </div>
                {pid === "gestao" && <span style={{ fontSize: 10, background: "#1A4870", color: "#fff", borderRadius: 20, padding: "2px 8px", fontWeight: 700 }}>Popular</span>}
              </div>

              <div style={{ marginBottom: 6 }}>
                <div style={{ display: "flex", alignItems: "baseline", gap: 4 }}>
                  <span style={{ fontSize: 26, fontWeight: 800, color: "#0B2D50" }}>{fmtPreco(p.preco_mensal)}</span>
                  <span style={{ fontSize: 11, color: "#888" }}>/mês · cobrança recorrente</span>
                </div>
              </div>

              <div style={{ fontSize: 11, color: "#555", marginBottom: 12 }}>
                Trial: {p.trial_dias} dias · Usuários: {p.limite_usuarios ?? "∞"}
              </div>

              <div style={{ borderTop: "0.5px solid #EEF1F6", paddingTop: 10, marginBottom: 12 }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: "#888", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 }}>Módulos ({p.modulos.length})</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                  {p.modulos.map(m => (
                    <span key={m} style={{ fontSize: 10, background: "#F0F7FF", color: "#1A4870", borderRadius: 4, padding: "2px 6px", border: "0.5px solid #C5DFF5" }}>
                      {MODULOS_LABEL[m] ?? m}
                    </span>
                  ))}
                </div>
              </div>

              <button
                onClick={() => iniciarEdicao(pid)}
                style={{ width: "100%", padding: "8px 0", background: "#F3F6F9", border: "0.5px solid #D4DCE8", borderRadius: 8, fontSize: 12, color: "#555", cursor: "pointer", fontWeight: 600 }}
              >
                Visualizar detalhes
              </button>
            </div>
          );
        })}
      </div>

      {/* Tabela comparativa de módulos */}
      <div style={{ background: "#fff", borderRadius: 10, border: "0.5px solid #D4DCE8", overflow: "hidden", marginBottom: 20 }}>
        <div style={{ padding: "14px 20px", borderBottom: "0.5px solid #E4E9F0", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: "#0B2D50" }}>Módulos por plano</div>
          <div style={{ fontSize: 11, color: "#888" }}>Altere a tabela <code>planos</code> no Supabase para ajustar em produção</div>
        </div>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ background: "#F3F6F9" }}>
              <th style={{ padding: "10px 16px", textAlign: "left", fontSize: 11, fontWeight: 600, color: "#555", width: "40%" }}>Módulo</th>
              {ORDEM_PLANOS.map(pid => (
                <th key={pid} style={{ padding: "10px 14px", textAlign: "center", fontSize: 12, fontWeight: 700, color: "#1A4870", width: "20%" }}>{PLANOS_DEFAULT[pid].nome}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Object.keys(MODULOS_LABEL).map((modulo, i) => (
              <tr key={modulo} style={{ borderBottom: "0.5px solid #EEF1F6", background: i % 2 === 0 ? "#fff" : "#FAFBFD" }}>
                <td style={{ padding: "9px 16px", fontSize: 12, color: "#333" }}>{MODULOS_LABEL[modulo]}</td>
                {ORDEM_PLANOS.map(pid => (
                  <td key={pid} style={{ padding: "9px 14px", textAlign: "center" }}>
                    {PLANOS_DEFAULT[pid].modulos.includes(modulo)
                      ? <span style={{ color: "#16A34A", fontSize: 14 }}>✓</span>
                      : <span style={{ color: "#D4DCE8", fontSize: 12 }}>—</span>}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* SQL para atualizar preços */}
      <div style={{ background: "#fff", borderRadius: 10, border: "0.5px solid #D4DCE8", padding: "16px 20px" }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: "#0B2D50", marginBottom: 12 }}>SQL para atualizar preços no Supabase</div>
        <pre style={{ fontSize: 11, background: "#F3F6F9", borderRadius: 8, padding: "12px 14px", overflow: "auto", color: "#333", margin: 0, lineHeight: 1.6 }}>{`-- Execute no Supabase SQL Editor para atualizar os preços:
UPDATE planos SET preco_mensal = 387,  preco_anual = 3480  WHERE id = 'essencial';
UPDATE planos SET preco_mensal = 1197, preco_anual = 10770 WHERE id = 'gestao';
UPDATE planos SET preco_mensal = 1787, preco_anual = 16080 WHERE id = 'performance';

-- Para alterar módulos de um plano:
UPDATE planos SET modulos = ARRAY['cadastros','propriedades','lavoura_plantio',...] WHERE id = 'essencial';`}</pre>
      </div>
    </div>
  );
}

// ── Página principal ──────────────────────────────────────────────────────────
export default function Admin() {
  const { fazendaId, userRole, raccotloGestor } = useAuth();
  const adminRouter = useRouter();
  type Aba = "clientes" | "planos" | "identidade";
  const [aba, setAba] = useState<Aba>("clientes");

  // Guard: somente raccotlo gestor
  useEffect(() => {
    if (userRole === null) return; // ainda carregando
    if (userRole !== "raccotlo" || !raccotloGestor) adminRouter.replace("/raccotlo");
  }, [userRole, raccotloGestor, adminRouter]);

  // ── Estado — Clientes ──────────────────────────────────────────────────────
  const [clientes, setClientes] = useState<ContaAdmin[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalEdit, setModalEdit] = useState<ContaAdmin | null>(null);
  const [filtroStatus, setFiltroStatus] = useState<StatusCliente | "">("");
  const [filtroPacote, setFiltroPacote] = useState<PacoteCliente | "">("");
  const [busca, setBusca] = useState("");

  const carregar = useCallback(async () => {
    setLoading(true);
    try {
      const data = await listarContasAdmin();
      setClientes(data);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { if (aba === "clientes") carregar(); }, [aba, carregar]);

  const clientesFiltrados = clientes.filter(c => {
    if (filtroStatus && c.status !== filtroStatus) return false;
    if (filtroPacote && c.pacote !== filtroPacote) return false;
    if (busca && !c.nome.toLowerCase().includes(busca.toLowerCase())) return false;
    return true;
  });

  const mrr = clientes
    .filter(c => c.status === "ativo" && c.valor_mensalidade)
    .reduce((acc, c) => acc + (c.valor_mensalidade ?? 0), 0);

  const kpis = [
    { label: "Total",    valor: clientes.length,                                cor: "#1A4870" },
    { label: "Ativos",   valor: clientes.filter(c => c.status === "ativo").length,    cor: "#16A34A" },
    { label: "Trial",    valor: clientes.filter(c => c.status === "trial").length,    cor: "#C9921B" },
    { label: "Pro bono", valor: clientes.filter(c => c.status === "pro_bono").length, cor: "#378ADD" },
    { label: "MRR",      valor: mrr > 0 ? fmtBRL(mrr) : "—",                   cor: "#7A5A12" },
  ];

  // ── Estado — Identidade ────────────────────────────────────────────────────
  const [logoArato,    setLogoArato]    = useState<string | null>(null);
  const [nomeArato,    setNomeArato]    = useState("Arato");
  const [taglineArato, setTaglineArato] = useState("Gestão Agrícola");
  const [logoFazenda,  setLogoFazenda]  = useState<string | null>(null);
  const inputArato   = useRef<HTMLInputElement>(null);
  const inputFazenda = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const lr = localStorage.getItem("arato_logo");
    const nr = localStorage.getItem("arato_nome");
    const tr = localStorage.getItem("arato_tagline");
    if (lr) setLogoArato(lr);
    if (nr) setNomeArato(nr);
    if (tr) setTaglineArato(tr);
  }, []);

  useEffect(() => {
    if (!fazendaId) return;
    const lf = localStorage.getItem(`fazenda_logo_${fazendaId}`);
    if (lf) setLogoFazenda(lf);
  }, [fazendaId]);

  function salvarIdentidade() {
    try {
      localStorage.setItem("arato_nome", nomeArato);
      localStorage.setItem("arato_tagline", taglineArato);
      if (logoArato) localStorage.setItem("arato_logo", logoArato);
      alert("Identidade salva. Recarregue para ver no cabeçalho.");
    } catch {
      alert("Erro ao salvar: imagem muito grande. Tente uma imagem menor.");
    }
  }

  function salvarLogoFazenda() {
    if (!fazendaId) return;
    try {
      if (logoFazenda) localStorage.setItem(`fazenda_logo_${fazendaId}`, logoFazenda);
      alert("Logo da fazenda salvo.");
    } catch {
      alert("Erro ao salvar: imagem muito grande.");
    }
  }

  const ABAS: { key: Aba; label: string }[] = [
    { key: "clientes",   label: `Clientes (${clientes.length})` },
    { key: "planos",     label: "Planos & Preços" },
    { key: "identidade", label: "Identidade Arato" },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh", background: "#F3F6F9", fontFamily: "system-ui, sans-serif", fontSize: 13 }}>
      <TopNav />

      {modalEdit && (
        <ModalCliente
          conta={modalEdit}
          onClose={() => setModalEdit(null)}
          onSalvo={atualizada => {
            setClientes(cs => cs.map(c => c.id === atualizada.id ? atualizada : c));
            setModalEdit(null);
          }}
        />
      )}

      <main style={{ flex: 1, padding: "20px 24px" }}>

        {/* Header */}
        <header style={{ background: "#fff", borderRadius: 12, border: "0.5px solid #D4DCE8", padding: "14px 22px", marginBottom: 20, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 32, height: 32, borderRadius: 8, background: "#1A4870", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <span style={{ color: "#fff", fontSize: 14 }}>⚙</span>
            </div>
            <div>
              <h1 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: "#1a1a1a" }}>Painel Administrativo</h1>
              <p style={{ margin: 0, fontSize: 11, color: "#555" }}>Gestão de clientes e configurações do sistema Arato</p>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <a href="/admin/usuarios" style={{ padding: "7px 14px", border: "0.5px solid #D4DCE8", borderRadius: 8, background: "#fff", cursor: "pointer", fontSize: 12, color: "#555", textDecoration: "none" }}>
              👥 Usuários &amp; Permissões
            </a>
            <a href="/admin/logs" style={{ padding: "7px 14px", border: "0.5px solid #D4DCE8", borderRadius: 8, background: "#fff", cursor: "pointer", fontSize: 12, color: "#555", textDecoration: "none" }}>
              📋 Logs
            </a>
            <div style={{ background: "#FBF3E0", border: "0.5px solid #C9921B50", borderRadius: 8, padding: "6px 14px", fontSize: 11, color: "#7A5A12", fontWeight: 600 }}>
              ◈ Área restrita — raccotlo
            </div>
          </div>
        </header>

        {/* Tabs */}
        <div style={{ display: "flex", gap: 0, borderBottom: "0.5px solid #D4DCE8", marginBottom: 20 }}>
          {ABAS.map(a => (
            <button key={a.key} onClick={() => setAba(a.key)} style={{
              padding: "9px 20px", border: "none", background: "none", cursor: "pointer", fontSize: 13,
              fontWeight: aba === a.key ? 700 : 400,
              color: aba === a.key ? "#1A4870" : "#555",
              borderBottom: aba === a.key ? "2px solid #1A4870" : "2px solid transparent",
              marginBottom: -1,
            }}>
              {a.label}
            </button>
          ))}
        </div>

        {/* ── ABA CLIENTES ──────────────────────────────────────────────────── */}
        {aba === "clientes" && (
          <div>

            {/* KPI cards */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 14, marginBottom: 20 }}>
              {kpis.map(k => (
                <div key={k.label} style={{ background: "#fff", borderRadius: 10, border: "0.5px solid #D4DCE8", padding: "14px 18px" }}>
                  <div style={{ fontSize: 11, color: "#888", marginBottom: 4 }}>{k.label}</div>
                  <div style={{ fontSize: 22, fontWeight: 700, color: k.cor }}>{k.valor}</div>
                </div>
              ))}
            </div>

            {/* Filtros */}
            <div style={{ background: "#fff", borderRadius: 10, border: "0.5px solid #D4DCE8", padding: "12px 16px", marginBottom: 16, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
              <input
                style={{ ...inp, width: 220 }}
                placeholder="Buscar cliente..."
                value={busca}
                onChange={e => setBusca(e.target.value)}
              />
              <select style={{ ...inp, width: 160 }} value={filtroStatus} onChange={e => setFiltroStatus(e.target.value as StatusCliente | "")}>
                <option value="">Todos os status</option>
                {(Object.keys(STATUS_CFG) as StatusCliente[]).map(s => (
                  <option key={s} value={s}>{STATUS_CFG[s].label}</option>
                ))}
              </select>
              <select style={{ ...inp, width: 160 }} value={filtroPacote} onChange={e => setFiltroPacote(e.target.value as PacoteCliente | "")}>
                <option value="">Todos os pacotes</option>
                {(Object.keys(PACOTE_CFG) as PacoteCliente[]).map(p => (
                  <option key={p} value={p}>{PACOTE_CFG[p].label}</option>
                ))}
              </select>
              <button style={{ ...btnSecondary, padding: "7px 14px", fontSize: 12 }} onClick={carregar}>↺ Atualizar</button>
              <div style={{ marginLeft: "auto", fontSize: 11, color: "#888" }}>
                {clientesFiltrados.length} de {clientes.length} clientes
              </div>
            </div>

            {/* Tabela */}
            <div style={{ background: "#fff", borderRadius: 10, border: "0.5px solid #D4DCE8", overflow: "hidden" }}>
              {loading ? (
                <div style={{ padding: "40px 0", textAlign: "center", color: "#888", fontSize: 12 }}>Carregando clientes…</div>
              ) : clientesFiltrados.length === 0 ? (
                <div style={{ padding: "40px 0", textAlign: "center", color: "#888", fontSize: 12 }}>Nenhum cliente encontrado</div>
              ) : (
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr style={{ background: "#F3F6F9" }}>
                      {["Cliente", "Pacote", "Status", "Desde", "Vencimento", "Mensalidade", "Fazendas", ""].map((h, i) => (
                        <th key={i} style={{ padding: "9px 14px", textAlign: i >= 5 ? "center" : "left", fontSize: 11, fontWeight: 600, color: "#555", borderBottom: "0.5px solid #D4DCE8", whiteSpace: "nowrap" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {clientesFiltrados.map((c, i) => {
                      const status = c.status ?? "trial";
                      const sCfg = STATUS_CFG[status] ?? STATUS_CFG.trial;
                      const dias = diasRestantes(c.data_vencimento);
                      const urgente = dias !== null && dias <= 14 && dias >= 0;
                      const vencido = dias !== null && dias < 0;

                      return (
                        <tr key={c.id} style={{ borderBottom: i < clientesFiltrados.length - 1 ? "0.5px solid #E4E9F0" : "none", background: "#fff" }}>

                          {/* Nome */}
                          <td style={{ padding: "10px 14px" }}>
                            <div style={{ fontWeight: 600, color: "#1a1a1a", fontSize: 13 }}>{c.nome}</div>
                            {c.email_contato && <div style={{ fontSize: 11, color: "#888", marginTop: 1 }}>{c.email_contato}</div>}
                            {c.obs_admin && <div style={{ fontSize: 10, color: "#aaa", marginTop: 1, maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.obs_admin}</div>}
                          </td>

                          {/* Pacote */}
                          <td style={{ padding: "10px 14px" }}>
                            {c.pacote ? (
                              <span style={{ padding: "2px 8px", background: PACOTE_CFG[c.pacote].bg, color: PACOTE_CFG[c.pacote].cor, borderRadius: 6, fontSize: 11, fontWeight: 600 }}>
                                {PACOTE_CFG[c.pacote].label}
                              </span>
                            ) : <span style={{ color: "#aaa", fontSize: 11 }}>—</span>}
                          </td>

                          {/* Status */}
                          <td style={{ padding: "10px 14px" }}>
                            <span style={{ padding: "2px 8px", background: sCfg.bg, color: sCfg.cor, borderRadius: 6, fontSize: 11, fontWeight: 600 }}>
                              {sCfg.label}
                            </span>
                          </td>

                          {/* Desde */}
                          <td style={{ padding: "10px 14px", color: "#555", fontSize: 12, whiteSpace: "nowrap" }}>
                            {fmtDate(c.data_inicio)}
                          </td>

                          {/* Vencimento */}
                          <td style={{ padding: "10px 14px", whiteSpace: "nowrap" }}>
                            {c.data_vencimento ? (
                              <div>
                                <span style={{ fontSize: 12, color: vencido ? "#E24B4A" : urgente ? "#C9921B" : "#555", fontWeight: (urgente || vencido) ? 600 : 400 }}>
                                  {fmtDate(c.data_vencimento)}
                                </span>
                                {dias !== null && (
                                  <div style={{ fontSize: 10, color: vencido ? "#E24B4A" : urgente ? "#C9921B" : "#aaa", marginTop: 1 }}>
                                    {vencido ? `vencido há ${Math.abs(dias)}d` : `${dias}d restantes`}
                                  </div>
                                )}
                              </div>
                            ) : <span style={{ color: "#aaa", fontSize: 11 }}>—</span>}
                          </td>

                          {/* Mensalidade */}
                          <td style={{ padding: "10px 14px", textAlign: "center", fontSize: 12, fontWeight: 600, color: c.valor_mensalidade ? "#1A4870" : "#aaa" }}>
                            {c.valor_mensalidade ? fmtBRL(c.valor_mensalidade) : "—"}
                          </td>

                          {/* Fazendas */}
                          <td style={{ padding: "10px 14px", textAlign: "center" }}>
                            <span style={{ background: "#F3F6F9", borderRadius: 6, padding: "2px 10px", fontSize: 12, color: "#555", fontWeight: 600 }}>
                              {c.fazendas_count}
                            </span>
                          </td>

                          {/* Ações */}
                          <td style={{ padding: "10px 14px", textAlign: "center" }}>
                            <button
                              onClick={() => setModalEdit(c)}
                              style={{ padding: "5px 12px", border: "0.5px solid #D4DCE8", borderRadius: 6, background: "#fff", cursor: "pointer", fontSize: 11, color: "#1A4870", fontWeight: 600 }}
                            >
                              ✎ Editar
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>

            {/* Aviso migration */}
            <div style={{ marginTop: 16, padding: "10px 14px", background: "#EFF6FF", borderRadius: 8, border: "0.5px solid #378ADD40", fontSize: 11, color: "#1A4870", lineHeight: 1.7 }}>
              <strong>Migration necessária:</strong> Se os campos de status/pacote/mensalidade não aparecerem, execute no Supabase SQL Editor:
              <code style={{ display: "block", marginTop: 6, background: "#D5E8F5", borderRadius: 4, padding: "4px 8px", fontFamily: "monospace", fontSize: 10, color: "#0B2D50" }}>
                {`ALTER TABLE contas ADD COLUMN IF NOT EXISTS status text DEFAULT 'trial', ADD COLUMN IF NOT EXISTS pacote text, ADD COLUMN IF NOT EXISTS data_inicio date, ADD COLUMN IF NOT EXISTS data_vencimento date, ADD COLUMN IF NOT EXISTS valor_mensalidade numeric(10,2), ADD COLUMN IF NOT EXISTS pro_bono_motivo text, ADD COLUMN IF NOT EXISTS obs_admin text, ADD COLUMN IF NOT EXISTS email_contato text, ADD COLUMN IF NOT EXISTS telefone text;`}
              </code>
            </div>
          </div>
        )}

        {/* ── ABA PLANOS ────────────────────────────────────────────────────── */}
        {aba === "planos" && <AbaPlanos />}

        {/* ── ABA IDENTIDADE ────────────────────────────────────────────────── */}
        {aba === "identidade" && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>

            {/* Identidade Arato */}
            <div style={{ background: "#fff", borderRadius: 12, border: "0.5px solid #D4DCE8", padding: "22px 24px" }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: "#1a1a1a", marginBottom: 4 }}>Identidade Arato</div>
              <div style={{ fontSize: 12, color: "#555", marginBottom: 20 }}>
                Sua marca aparece no cabeçalho de todos os clientes.
              </div>
              <div style={{ marginBottom: 16 }}>
                <label style={lbl}>Preview do cabeçalho</label>
                <div style={{ height: 80, borderRadius: 10, border: "0.5px dashed #D4DCE8", background: "#F3F6F9", display: "flex", alignItems: "center", justifyContent: "center", gap: 12 }}>
                  {logoArato ? (
                    <img src={logoArato} alt="Logo" style={{ maxHeight: 56, maxWidth: 200, objectFit: "contain" }} />
                  ) : (
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <div style={{ width: 36, height: 36, background: "#1A4870", borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center" }}>
                        <span style={{ color: "#fff", fontWeight: 800, fontSize: 13 }}>A</span>
                      </div>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 700, color: "#1a1a1a" }}>{nomeArato}</div>
                        <div style={{ fontSize: 10, color: "#666" }}>{taglineArato}</div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
              <div style={{ marginBottom: 14 }}>
                <label style={lbl}>Logo (PNG/SVG)</label>
                <div style={{ display: "flex", gap: 8 }}>
                  <input ref={inputArato} type="file" accept="image/png,image/svg+xml,image/jpeg" style={{ display: "none" }}
                    onChange={e => { const f = e.target.files?.[0]; if (f) carregarImagem(f, setLogoArato); }} />
                  <button onClick={() => inputArato.current?.click()} style={{ padding: "7px 14px", border: "0.5px solid #D4DCE8", borderRadius: 8, background: "#fff", cursor: "pointer", fontSize: 12, color: "#555" }}>Escolher arquivo</button>
                  {logoArato && <button onClick={() => { setLogoArato(null); localStorage.removeItem("arato_logo"); }} style={{ padding: "7px 14px", border: "0.5px solid #E24B4A50", borderRadius: 8, background: "#FCEBEB", cursor: "pointer", fontSize: 12, color: "#791F1F" }}>Remover</button>}
                </div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 20 }}>
                <div>
                  <label style={lbl}>Nome da empresa</label>
                  <input style={inp} value={nomeArato} onChange={e => setNomeArato(e.target.value)} />
                </div>
                <div>
                  <label style={lbl}>Tagline</label>
                  <input style={inp} value={taglineArato} onChange={e => setTaglineArato(e.target.value)} />
                </div>
              </div>
              <button onClick={salvarIdentidade} style={btnPrimary}>Salvar identidade</button>
            </div>

            {/* Logo do cliente */}
            <div style={{ background: "#fff", borderRadius: 12, border: "0.5px solid #D4DCE8", padding: "22px 24px" }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: "#1a1a1a", marginBottom: 4 }}>Logo do Cliente Ativo</div>
              <div style={{ fontSize: 12, color: "#555", marginBottom: 20 }}>
                Logo da fazenda aparece no cabeçalho do cliente logado.
              </div>
              <div style={{ marginBottom: 16 }}>
                <label style={lbl}>Preview</label>
                <div style={{ height: 80, borderRadius: 10, border: "0.5px dashed #D4DCE8", background: "#F3F6F9", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  {logoFazenda ? (
                    <img src={logoFazenda} alt="Logo fazenda" style={{ maxHeight: 56, maxWidth: 200, objectFit: "contain" }} />
                  ) : (
                    <div style={{ textAlign: "center" }}>
                      <div style={{ fontSize: 28, color: "#D4DCE8", marginBottom: 4 }}>▣</div>
                      <div style={{ fontSize: 11, color: "#888" }}>Sem logo — exibe iniciais da fazenda</div>
                    </div>
                  )}
                </div>
              </div>
              <div style={{ marginBottom: 20 }}>
                <label style={lbl}>Logo (PNG/SVG)</label>
                <div style={{ display: "flex", gap: 8 }}>
                  <input ref={inputFazenda} type="file" accept="image/png,image/svg+xml,image/jpeg" style={{ display: "none" }}
                    onChange={e => { const f = e.target.files?.[0]; if (f) carregarImagem(f, setLogoFazenda); }} />
                  <button onClick={() => inputFazenda.current?.click()} style={{ padding: "7px 14px", border: "0.5px solid #D4DCE8", borderRadius: 8, background: "#fff", cursor: "pointer", fontSize: 12, color: "#555" }}>Escolher arquivo</button>
                  {logoFazenda && <button onClick={() => { setLogoFazenda(null); if (fazendaId) localStorage.removeItem(`fazenda_logo_${fazendaId}`); }} style={{ padding: "7px 14px", border: "0.5px solid #E24B4A50", borderRadius: 8, background: "#FCEBEB", cursor: "pointer", fontSize: 12, color: "#791F1F" }}>Remover</button>}
                </div>
              </div>
              <button onClick={salvarLogoFazenda} style={btnPrimary}>Salvar logo da fazenda</button>
              <div style={{ marginTop: 16, padding: "10px 14px", background: "#F3F6F9", borderRadius: 8, border: "0.5px solid #D4DCE8", fontSize: 11, color: "#666", lineHeight: 1.6 }}>
                Logos ficam no localStorage do navegador. Configure no primeiro acesso de cada dispositivo.
              </div>
            </div>
          </div>
        )}

      </main>
    </div>
  );
}
