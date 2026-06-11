"use client";
import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@supabase/supabase-js";
import { listarContasAdmin, atualizarConta } from "../../../lib/db";
import type { Conta } from "../../../lib/supabase";
import { PLANOS_DEFAULT, fmtPreco } from "../../../lib/planos";
import type { PlanoId } from "../../../lib/planos";

// ─── Supabase client ─────────────────────────────────────────────────────────

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// ─── Tipos ───────────────────────────────────────────────────────────────────

type ContaAdmin    = Conta & { fazendas_count: number; crm_stage?: string; origem?: string; cidade?: string; estado?: string };
// Clientes carregados do seletor de produção (podem não ter conta cadastrada)
type ClienteAdmin  = ContaAdmin & {
  _sem_conta: boolean;
  _fazendas_prod: Array<{ id: string; nome: string; municipio?: string; estado?: string; area_total_ha?: number }>;
  _area_total: number;
};
type StatusCliente = NonNullable<Conta["status"]>;
type PacoteCliente = NonNullable<Conta["pacote"]>;
type AbaContrato   = "" | "trial" | "ativo" | "pro_bono" | "inadimplente" | "cancelado";

// ─── Config de cores ─────────────────────────────────────────────────────────

const STATUS_CFG: Record<StatusCliente, { label: string; cor: string; bg: string }> = {
  trial:        { label: "Trial",        cor: "#C9921B", bg: "#FBF3E0" },
  ativo:        { label: "Ativo",        cor: "#16A34A", bg: "#F0FDF4" },
  inativo:      { label: "Inativo",      cor: "#888",    bg: "#F3F4F6" },
  inadimplente: { label: "Inadimplente", cor: "#E24B4A", bg: "#FEF2F2" },
  pro_bono:     { label: "Pro Bono",     cor: "#378ADD", bg: "#EFF6FF" },
  cancelado:    { label: "Cancelado",    cor: "#6B7280", bg: "#F3F4F6" },
};

const PACOTE_CFG: Record<PacoteCliente, { label: string; cor: string; bg: string; valor: number }> = {
  essencial:   { label: "Essencial",   cor: "#555",    bg: "#F3F4F6", valor: 290  },
  gestao:      { label: "Gestão",      cor: "#1A4870", bg: "#D5E8F5", valor: 590  },
  performance: { label: "Performance", cor: "#7A5A12", bg: "#FBF3E0", valor: 990  },
};

const ABAS_CONTRATO: Array<{ key: AbaContrato; label: string; cor?: string; bg?: string }> = [
  { key: "",             label: "Todos"         },
  { key: "trial",        label: "Trial",        cor: "#C9921B", bg: "#FBF3E0" },
  { key: "ativo",        label: "Pagantes",     cor: "#16A34A", bg: "#F0FDF4" },
  { key: "pro_bono",     label: "Pro Bono",     cor: "#378ADD", bg: "#EFF6FF" },
  { key: "inadimplente", label: "Inadimplentes",cor: "#E24B4A", bg: "#FEF2F2" },
  { key: "cancelado",    label: "Cancelados",   cor: "#6B7280", bg: "#F3F4F6" },
];

const CRM_STAGE_CFG: Record<string, { label: string; cor: string }> = {
  lead:         { label: "Lead",          cor: "#888"    },
  contato:      { label: "Contato feito", cor: "#378ADD" },
  demo:         { label: "Demo",          cor: "#EF9F27" },
  proposta:     { label: "Proposta",      cor: "#C9921B" },
  cliente:      { label: "Cliente",       cor: "#16A34A" },
  churn:        { label: "Churn",         cor: "#E24B4A" },
};

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

function diasRestantes(venc?: string | null): number | null {
  if (!venc) return null;
  return Math.ceil((new Date(venc).getTime() - Date.now()) / 86400000);
}

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

const btnSmall: React.CSSProperties = {
  padding: "4px 10px", borderRadius: 6, fontSize: 11, fontWeight: 600,
  cursor: "pointer", border: "0.5px solid #D4DCE8", background: "#fff", color: "#0B1E35",
};

// ─── Modal editar cliente (reutilizado do admin/page.tsx) ─────────────────────

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
  const [aba, setAba] = useState<"geral" | "assinatura">("geral");

  async function salvar() {
    setSalvando(true); setErro("");
    try {
      await atualizarConta(conta.id, form);
      onSalvo({ ...conta, ...form } as ContaAdmin);
    } catch (e) { setErro(String(e)); }
    finally { setSalvando(false); }
  }

  return (
    <div style={{ position: "fixed", inset: 0, background: "#00000070", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ background: "#fff", borderRadius: 14, width: 660, maxHeight: "90vh", overflowY: "auto", boxShadow: "0 12px 48px #0004" }}>

        <div style={{ padding: "18px 24px", borderBottom: "0.5px solid #E4E9F0", display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: "#0B1E35" }}>{conta.nome}</div>
            <div style={{ fontSize: 11, color: "#aaa", marginTop: 2, fontFamily: "monospace" }}>{conta.id}</div>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 18, cursor: "pointer", color: "#aaa" }}>✕</button>
        </div>

        <div style={{ display: "flex", gap: 0, borderBottom: "0.5px solid #E4E9F0", padding: "0 24px" }}>
          {(["geral", "assinatura"] as const).map(t => (
            <button key={t} onClick={() => setAba(t)} style={{
              padding: "10px 16px", border: "none", background: "none", cursor: "pointer",
              fontSize: 13, fontWeight: aba === t ? 700 : 400,
              color: aba === t ? "#0B1E35" : "#888",
              borderBottom: aba === t ? "2px solid #C9921B" : "2px solid transparent",
              marginBottom: -1, textTransform: "capitalize",
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
                  <input style={inp} type="number" step="0.01"
                    value={form.valor_mensalidade ?? ""}
                    onChange={e => setForm(f => ({ ...f, valor_mensalidade: Number(e.target.value) || undefined }))} />
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
                  <input style={inp} value={form.pro_bono_motivo ?? ""}
                    onChange={e => setForm(f => ({ ...f, pro_bono_motivo: e.target.value }))}
                    placeholder="Ex: parceiro estratégico, projeto piloto..." />
                </div>
              )}
            </>
          )}

          {erro && <div style={{ padding: "8px 12px", background: "#FEF2F2", borderRadius: 8, color: "#991B1B", fontSize: 12, marginBottom: 12 }}>{erro}</div>}

          <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 20, paddingTop: 16, borderTop: "0.5px solid #EEF1F6" }}>
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

// ─── Página principal ─────────────────────────────────────────────────────────

export default function ClientesPage() {
  const router = useRouter();
  const [clientes, setClientes]           = useState<ClienteAdmin[]>([]);
  const [loading, setLoading]             = useState(true);
  const [modalEdit, setModalEdit]         = useState<ClienteAdmin | null>(null);
  const [modalPlano, setModalPlano]       = useState<ClienteAdmin | null>(null);
  const [acaoLoading, setAcaoLoading]     = useState<string | null>(null); // conta_id em progresso
  const [busca, setBusca]                 = useState("");
  const [abaContrato, setAbaContrato]     = useState<AbaContrato>("");
  const [filtroPacote, setFiltroPacote]   = useState<PacoteCliente | "">("");
  const [filtroStage, setFiltroStage]     = useState("");
  const [filtroOrigem, setFiltroOrigem]   = useState("");

  const carregar = useCallback(async () => {
    setLoading(true);
    try {
      // 1. Carrega todos os clientes de produção (usa cookie session — sem bearer token)
      const resProd = await fetch("/api/admin/listar-clientes-admin");
      const bodyProd = await resProd.json() as {
        clientes?: Array<{
          conta_id: string | null; conta_nome: string; produtor_nome: string | null;
          fazendas: Array<{ id: string; nome: string; municipio?: string; estado?: string; area_total_ha?: number }>;
          area_total: number; conta_data: Record<string, unknown> | null;
        }>; error?: string;
      };
      const clientesProd = bodyProd.clientes ?? [];
      if (!resProd.ok) { console.error("listar-clientes-admin:", bodyProd.error); }

      // 2. Mescla: produção + billing (conta_data já vem no endpoint)
      const merged: ClienteAdmin[] = clientesProd.map(fc => {
        const semConta = !fc.conta_id;
        const realContaId = fc.conta_id;
        const conta = fc.conta_data as Record<string, unknown> | null;

        const g = (k: string) => conta?.[k] ?? null;
        return {
          id:                realContaId ?? `sem_${fc.fazendas[0]?.id ?? Math.random()}`,
          nome:              (g("nome") as string) ?? fc.conta_nome,
          tipo:              (g("tipo") as string) ?? "pf",
          status:            g("status") as StatusCliente | null,
          pacote:            g("pacote") as PacoteCliente | null,
          data_inicio:       g("data_inicio") as string | null,
          data_vencimento:   g("data_vencimento") as string | null,
          valor_mensalidade: g("valor_mensalidade") as number | null,
          pro_bono_motivo:   g("pro_bono_motivo") as string | null,
          obs_admin:         g("obs_admin") as string | null,
          email_contato:     g("email_contato") as string | null,
          telefone:          g("telefone") as string | null,
          created_at:        g("created_at") as string | null,
          fazendas_count:    fc.fazendas.length,
          crm_stage:         g("crm_stage") as string | undefined,
          origem:            g("origem") as string | undefined,
          cidade:            g("cidade") as string | undefined,
          estado:            g("estado") as string | undefined,
          _sem_conta:        semConta,
          _fazendas_prod:    fc.fazendas,
          _area_total:       fc.area_total,
        } as ClienteAdmin;
      });

      setClientes(merged);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  function countAba(key: AbaContrato) {
    if (!key) return clientes.length;
    if (key === "inadimplente") return clientes.filter(c => c.status === "inadimplente" || c.status === "inativo").length;
    return clientes.filter(c => c.status === key).length;
  }

  const filtrados = clientes.filter(c => {
    if (abaContrato) {
      if (abaContrato === "inadimplente") {
        if (c.status !== "inadimplente" && c.status !== "inativo") return false;
      } else if (c.status !== abaContrato) return false;
    }
    if (filtroPacote && c.pacote !== filtroPacote) return false;
    if (filtroStage && c.crm_stage !== filtroStage) return false;
    if (filtroOrigem && c.origem !== filtroOrigem) return false;
    if (busca && !c.nome.toLowerCase().includes(busca.toLowerCase())
      && !(c.email_contato ?? "").toLowerCase().includes(busca.toLowerCase())) return false;
    return true;
  });

  const mrr = clientes
    .filter(c => c.status === "ativo" && c.valor_mensalidade)
    .reduce((s, c) => s + (c.valor_mensalidade ?? 0), 0);

  const kpis = [
    { label: "Total",         valor: clientes.length,                                                                       cor: "#0B1E35", bg: "#fff"    },
    { label: "Ativos",        valor: clientes.filter(c => c.status === "ativo").length,                                     cor: "#16A34A", bg: "#F0FDF4" },
    { label: "Trial",         valor: clientes.filter(c => c.status === "trial").length,                                     cor: "#C9921B", bg: "#FBF3E0" },
    { label: "Inadimplentes", valor: clientes.filter(c => c.status === "inadimplente" || c.status === "inativo").length,    cor: "#E24B4A", bg: "#FEF2F2" },
    { label: "Pro Bono",      valor: clientes.filter(c => c.status === "pro_bono").length,                                  cor: "#378ADD", bg: "#EFF6FF" },
    { label: "MRR",           valor: fmtBRL(mrr),                                                                           cor: "#0B1E35", bg: "#F0FDF4" },
  ];

  const origens    = Array.from(new Set(clientes.map(c => c.origem).filter(Boolean))) as string[];
  const proBonoList = clientes.filter(c => c.status === "pro_bono");

  // ── Criar conta admin para cliente sem conta ─────────────────────────────
  async function criarContaAdmin(c: ClienteAdmin) {
    const pacote = window.prompt(
      `Criar conta admin para "${c.nome}".\n\nEscolha o pacote:\n  essencial / gestao / performance / pro_bono\n\nDigite o pacote:`,
      "pro_bono",
    ) as "essencial" | "gestao" | "performance" | "pro_bono" | null;
    if (!pacote) return;
    const statusInicial = pacote === "pro_bono" ? "pro_bono" : "ativo";
    const valor = pacote === "pro_bono" ? 0 : (PACOTE_CFG[pacote as keyof typeof PACOTE_CFG]?.valor ?? 0);
    try {
      const { data: novaConta, error } = await supabase.from("contas").insert({
        nome: c.nome,
        tipo: c.tipo ?? "pf",
        status: statusInicial,
        pacote: pacote === "pro_bono" ? "essencial" : pacote,
        valor_mensalidade: valor,
        data_inicio: new Date().toISOString().split("T")[0],
      }).select().single();
      if (error || !novaConta) { alert("Erro ao criar conta: " + error?.message); return; }
      // Vincular as fazendas à nova conta
      for (const faz of c._fazendas_prod) {
        await supabase.from("fazendas").update({ conta_id: novaConta.id }).eq("id", faz.id);
      }
      alert(`Conta criada com sucesso para "${c.nome}"! ID: ${novaConta.id}\n\nAjuste os detalhes clicando em ✎ Editar.`);
      await carregar();
    } catch (e) {
      alert("Erro: " + String(e));
    }
  }

  async function marcarProBono(c: ClienteAdmin) {
    const motivo = window.prompt(`Motivo do Pro Bono para "${c.nome}":\n(Ex: cliente da consultoria, parceiro estratégico...)`, c.pro_bono_motivo ?? "Cliente da consultoria Raccolto");
    if (motivo === null) return;
    await atualizarConta(c.id, { status: "pro_bono", pro_bono_motivo: motivo, valor_mensalidade: 0 });
    setClientes(cs => cs.map(x => x.id === c.id ? { ...x, status: "pro_bono", pro_bono_motivo: motivo, valor_mensalidade: 0 } : x));
  }

  async function removerProBono(c: ClienteAdmin) {
    if (!window.confirm(`Remover Pro Bono de "${c.nome}"?\nO status voltará para "ativo".`)) return;
    await atualizarConta(c.id, { status: "ativo", pro_bono_motivo: "", valor_mensalidade: undefined });
    setClientes(cs => cs.map(x => x.id === c.id ? { ...x, status: "ativo", pro_bono_motivo: "" } : x));
  }

  // ── Mudar plano inline ──────────────────────────────────────────────────────
  async function mudarPlano(c: ClienteAdmin, novoPacote: PacoteCliente) {
    setAcaoLoading(c.id);
    try {
      const valor = PACOTE_CFG[novoPacote].valor;
      await atualizarConta(c.id, { pacote: novoPacote, valor_mensalidade: valor });
      setClientes(cs => cs.map(x => x.id === c.id ? { ...x, pacote: novoPacote, valor_mensalidade: valor } : x));
    } finally {
      setAcaoLoading(null);
      setModalPlano(null);
    }
  }

  // ── Cancelar acesso (bloqueia auth + marca cancelado) ──────────────────────
  async function cancelarAcesso(c: ClienteAdmin) {
    const isTrial = c.status === "trial";
    const msg = isTrial
      ? `Encerrar trial de "${c.nome}"?\n\nIsso irá:\n• Revogar o acesso imediatamente\n• Marcar conta como "Cancelado"\n• Bloquear login de todos os usuários\n\nEsta ação pode ser desfeita manualmente alterando o status.`
      : `Cancelar acesso de "${c.nome}"?\n\nIsso irá:\n• Revogar o acesso imediatamente\n• Bloquear login de todos os usuários da conta\n\nEsta ação pode ser desfeita manualmente alterando o status.`;
    if (!window.confirm(msg)) return;
    setAcaoLoading(c.id);
    try {
      const cancelPayload: Record<string, unknown> = { acao: "cancelar" };
      if (c._sem_conta) {
        cancelPayload.fazenda_ids = c._fazendas_prod.map(f => f.id);
      } else {
        cancelPayload.conta_id = c.id;
        if (c._fazendas_prod.length > 0) cancelPayload.fazenda_ids = c._fazendas_prod.map(f => f.id);
      }
      const res = await fetch("/api/admin/cancelar-cliente", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(cancelPayload),
      });
      const json = await res.json();
      if (!res.ok) { alert("Erro: " + json.error); return; }
      setClientes(cs => cs.map(x => x.id === c.id ? { ...x, status: "cancelado", data_vencimento: new Date().toISOString().split("T")[0] } : x));
      alert(`Acesso cancelado. ${json.users_bloqueados} usuário(s) bloqueado(s).`);
    } catch (e) {
      alert("Erro de conexão: " + String(e));
    } finally {
      setAcaoLoading(null);
    }
  }

  // ── Excluir conta permanentemente ─────────────────────────────────────────
  async function excluirConta(c: ClienteAdmin) {
    const confirmacao = window.prompt(
      `ATENÇÃO — EXCLUSÃO PERMANENTE\n\nEsta ação APAGA TODOS os dados de "${c.nome}" (fazendas, lançamentos, contratos, etc.) e NÃO pode ser desfeita.\n\nDigite o nome do cliente para confirmar:`
    );
    if (confirmacao !== c.nome) {
      if (confirmacao !== null) alert("Nome não confere. Exclusão cancelada.");
      return;
    }
    setAcaoLoading(c.id);
    try {
      const payload: Record<string, unknown> = { acao: "excluir" };
      if (c._sem_conta) {
        // Sem conta — usa fazenda_ids diretamente
        payload.fazenda_ids = c._fazendas_prod.map(f => f.id);
      } else {
        payload.conta_id = c.id;
        // Passa também os fazenda_ids para garantir cascade completo
        if (c._fazendas_prod.length > 0) {
          payload.fazenda_ids = c._fazendas_prod.map(f => f.id);
        }
      }
      const res = await fetch("/api/admin/cancelar-cliente", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok) { alert("Erro: " + json.error); return; }
      setClientes(cs => cs.filter(x => x.id !== c.id));
      alert(`"${c.nome}" excluído permanentemente. ${json.users_removidos} usuário(s) removido(s).`);
    } catch (e) {
      alert("Erro de conexão: " + String(e));
    } finally {
      setAcaoLoading(null);
    }
  }

  return (
    <div style={{ fontFamily: "system-ui, sans-serif", fontSize: 13 }}>

      {/* Modal editar cliente */}
      {modalEdit && (
        <ModalCliente
          conta={modalEdit}
          onClose={() => setModalEdit(null)}
          onSalvo={upd => { setClientes(cs => cs.map(c => c.id === upd.id ? { ...c, ...upd } as ClienteAdmin : c)); setModalEdit(null); }}
        />
      )}

      {/* Modal upgrade / downgrade de plano */}
      {modalPlano && (
        <div style={{ position: "fixed", inset: 0, background: "#00000070", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center" }}
          onClick={e => { if (e.target === e.currentTarget) setModalPlano(null); }}>
          <div style={{ background: "#fff", borderRadius: 14, width: 560, padding: "24px", boxShadow: "0 12px 48px #0004" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <div>
                <div style={{ fontSize: 15, fontWeight: 700, color: "#0B1E35" }}>Alterar Plano</div>
                <div style={{ fontSize: 12, color: "#888", marginTop: 2 }}>{modalPlano.nome}</div>
              </div>
              <button onClick={() => setModalPlano(null)} style={{ background: "none", border: "none", fontSize: 18, cursor: "pointer", color: "#aaa" }}>✕</button>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
              {(Object.keys(PACOTE_CFG) as PacoteCliente[]).map(pk => {
                const cfg = PACOTE_CFG[pk];
                const plano = PLANOS_DEFAULT[pk as PlanoId];
                const isCurrent = modalPlano.pacote === pk;
                const loading = acaoLoading === modalPlano.id;
                return (
                  <button key={pk} disabled={loading || isCurrent} onClick={() => mudarPlano(modalPlano, pk)}
                    style={{ padding: "16px 12px", border: `2px solid ${isCurrent ? cfg.cor : "#E4E9F0"}`, borderRadius: 10, background: isCurrent ? cfg.bg : "#FAFBFC", cursor: isCurrent ? "default" : "pointer", textAlign: "center", opacity: loading ? 0.5 : 1 }}>
                    <div style={{ fontWeight: 700, color: cfg.cor, fontSize: 14, marginBottom: 4 }}>{cfg.label}</div>
                    <div style={{ fontSize: 18, fontWeight: 800, color: "#0B1E35", marginBottom: 6 }}>{fmtPreco(plano?.preco_mensal ?? cfg.valor)}</div>
                    <div style={{ fontSize: 10, color: "#888" }}>{plano?.limite_usuarios ? `até ${plano.limite_usuarios} usuários` : "ilimitado"}</div>
                    {isCurrent && <div style={{ marginTop: 6, fontSize: 10, fontWeight: 700, color: cfg.cor }}>PLANO ATUAL</div>}
                    {!isCurrent && !loading && <div style={{ marginTop: 6, fontSize: 11, color: "#555", fontWeight: 600 }}>{(modalPlano.pacote && PACOTE_CFG[modalPlano.pacote].valor < cfg.valor) ? "⬆ Upgrade" : "⬇ Downgrade"}</div>}
                  </button>
                );
              })}
            </div>
            <div style={{ marginTop: 16, padding: "10px 14px", background: "#FBF3E0", borderRadius: 8, fontSize: 11, color: "#7A5200" }}>
              A alteração de plano é imediata. O valor de cobrança será atualizado no próximo ciclo.
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
        <div>
          <h1 style={{ margin: "0 0 2px", fontSize: 22, fontWeight: 800, color: "#0B1E35", letterSpacing: "-0.3px" }}>
            Clientes
          </h1>
          <p style={{ margin: 0, fontSize: 13, color: "#888" }}>
            Gestão completa da base de clientes
          </p>
        </div>
        <button style={btnPrimary} onClick={() => router.push("/admin/clientes/novo")}>
          + Novo Cliente
        </button>
      </div>

      {/* KPIs */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 12, marginBottom: 20 }}>
        {kpis.map(k => (
          <div key={k.label} style={{ background: k.bg, borderRadius: 12, border: "0.5px solid #DDE2EE", padding: "14px 16px" }}>
            <div style={{ fontSize: 10, color: "#888", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 6 }}>{k.label}</div>
            <div style={{ fontSize: 20, fontWeight: 800, color: k.cor }}>{k.valor}</div>
          </div>
        ))}
      </div>

      {/* Abas de tipo de contrato */}
      <div style={{ display: "flex", gap: 6, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
        {ABAS_CONTRATO.map(aba => {
          const count = countAba(aba.key);
          const ativa = abaContrato === aba.key;
          return (
            <button
              key={aba.key}
              onClick={() => setAbaContrato(aba.key)}
              style={{
                padding: "6px 14px",
                border: `1.5px solid ${ativa ? (aba.cor ?? "#0B1E35") : "#D4DCE8"}`,
                borderRadius: 20,
                background: ativa ? (aba.bg ?? "#F0F4FA") : "#fff",
                color: ativa ? (aba.cor ?? "#0B1E35") : "#555",
                fontWeight: ativa ? 700 : 400,
                fontSize: 13,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: 7,
              }}
            >
              {aba.label}
              <span style={{
                fontSize: 11, fontWeight: 700,
                background: ativa ? (aba.cor ?? "#0B1E35") : "#E8ECF2",
                color: ativa ? "#fff" : "#666",
                borderRadius: 10, padding: "1px 7px",
                minWidth: 20, textAlign: "center",
              }}>{count}</span>
            </button>
          );
        })}
      </div>

      {/* Seção Pro Bono — só na aba Todos ou Pro Bono */}
      {proBonoList.length > 0 && (abaContrato === "" || abaContrato === "pro_bono") && (
        <div style={{
          background: "#EFF6FF", border: "1px solid #378ADD40",
          borderRadius: 12, padding: "16px 20px", marginBottom: 16,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: "#1A4870" }}>⭐ Clientes Pro Bono</span>
            <span style={{ fontSize: 11, color: "#378ADD", background: "#DBEAFE", borderRadius: 20, padding: "2px 10px", fontWeight: 700 }}>
              {proBonoList.length} {proBonoList.length === 1 ? "cliente" : "clientes"}
            </span>
            <span style={{ fontSize: 11, color: "#555", marginLeft: 4 }}>
              — Acesso ao Arato incluso na consultoria Raccolto · não cobrados no SaaS
            </span>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
            {proBonoList.map(c => (
              <div key={c.id} style={{
                background: "#fff", border: "0.5px solid #378ADD60",
                borderRadius: 10, padding: "10px 14px",
                display: "flex", alignItems: "center", gap: 12, minWidth: 260,
              }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "#0B1E35" }}>{c.nome}</div>
                  <div style={{ fontSize: 11, color: "#888", marginTop: 2 }}>
                    {c.pacote ? `Plano ${c.pacote}` : "Sem plano"}
                    {c.pro_bono_motivo && <> · {c.pro_bono_motivo}</>}
                  </div>
                  {c.email_contato && <div style={{ fontSize: 10, color: "#aaa" }}>{c.email_contato}</div>}
                </div>
                <div style={{ display: "flex", gap: 6 }}>
                  <button style={{ ...btnSmall, color: "#378ADD" }} onClick={() => setModalEdit(c)}>✎</button>
                  <button
                    style={{ ...btnSmall, color: "#E24B4A", fontSize: 10 }}
                    onClick={() => removerProBono(c)}
                    title="Remover Pro Bono"
                  >✕ PB</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Filtros */}
      <div style={{ background: "#fff", borderRadius: 10, border: "0.5px solid #D4DCE8", padding: "12px 16px", marginBottom: 14, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <input style={{ ...inp, width: 240 }} placeholder="Buscar por nome ou e-mail..." value={busca} onChange={e => setBusca(e.target.value)} />
        <select style={{ ...inp, width: 150 }} value={filtroPacote} onChange={e => setFiltroPacote(e.target.value as PacoteCliente | "")}>
          <option value="">Todos os pacotes</option>
          {(Object.keys(PACOTE_CFG) as PacoteCliente[]).map(p => (
            <option key={p} value={p}>{PACOTE_CFG[p].label}</option>
          ))}
        </select>
        <select style={{ ...inp, width: 160 }} value={filtroStage} onChange={e => setFiltroStage(e.target.value)}>
          <option value="">Todos os estágios</option>
          {Object.entries(CRM_STAGE_CFG).map(([k, v]) => (
            <option key={k} value={k}>{v.label}</option>
          ))}
        </select>
        {origens.length > 0 && (
          <select style={{ ...inp, width: 140 }} value={filtroOrigem} onChange={e => setFiltroOrigem(e.target.value)}>
            <option value="">Todas as origens</option>
            {origens.map(o => <option key={o} value={o}>{o}</option>)}
          </select>
        )}
        <button style={{ ...btnSecondary, padding: "7px 14px", fontSize: 12 }} onClick={carregar}>↺ Atualizar</button>
        <div style={{ marginLeft: "auto", fontSize: 11, color: "#888" }}>
          {filtrados.length} de {clientes.length} clientes
        </div>
      </div>

      {/* Tabela */}
      <div style={{ background: "#fff", borderRadius: 10, border: "0.5px solid #D4DCE8", overflow: "hidden" }}>
        {loading ? (
          <div style={{ padding: "48px 0", textAlign: "center", color: "#888" }}>Carregando…</div>
        ) : filtrados.length === 0 ? (
          <div style={{ padding: "48px 0", textAlign: "center", color: "#888" }}>Nenhum cliente encontrado</div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: "#F8FAFC" }}>
                {["Cliente", "Pacote", "Status", "CRM", "Local", "Desde", "Vencimento", "Mensalidade", "Fazendas", "Ações"].map((h, i) => (
                  <th key={i} style={{
                    padding: "10px 12px", textAlign: i >= 5 && i <= 8 ? "center" : "left",
                    fontSize: 11, fontWeight: 600, color: "#888",
                    borderBottom: "0.5px solid #D4DCE8",
                    textTransform: "uppercase", letterSpacing: "0.04em", whiteSpace: "nowrap",
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtrados.map((c, i) => {
                const status  = c.status ?? "trial";
                const sCfg    = STATUS_CFG[status] ?? STATUS_CFG.trial;
                const dias    = diasRestantes(c.data_vencimento);
                const urgente = dias !== null && dias >= 0 && dias <= 14;
                const vencido = dias !== null && dias < 0;

                return (
                  <tr key={c.id} style={{
                    borderBottom: i < filtrados.length - 1 ? "0.5px solid #EEF1F6" : "none",
                    background: c._sem_conta ? "#FFFBF0" : c.status === "pro_bono" ? "#F0F7FF" : "transparent",
                  }}>
                    <td style={{ padding: "10px 12px", minWidth: 160 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <span style={{ fontWeight: 700, color: "#1a1a1a", fontSize: 13 }}>{c.nome}</span>
                        {c.status === "pro_bono" && (
                          <span style={{ fontSize: 9, fontWeight: 700, color: "#378ADD", background: "#DBEAFE", borderRadius: 10, padding: "1px 6px", letterSpacing: 0.5 }}>PB</span>
                        )}
                        {c._sem_conta && (
                          <span style={{ fontSize: 9, fontWeight: 700, color: "#C9921B", background: "#FBF3E0", borderRadius: 10, padding: "1px 6px" }}>SEM CONTA</span>
                        )}
                      </div>
                      {c.email_contato && <div style={{ fontSize: 11, color: "#888", marginTop: 1 }}>{c.email_contato}</div>}
                      {c.pro_bono_motivo && c.status === "pro_bono" && (
                        <div style={{ fontSize: 10, color: "#378ADD", marginTop: 1, fontStyle: "italic" }}>{c.pro_bono_motivo}</div>
                      )}
                      {c.telefone && !c.pro_bono_motivo && <div style={{ fontSize: 10, color: "#aaa" }}>{c.telefone}</div>}
                      {c._sem_conta && (
                        <div style={{ fontSize: 10, color: "#C9921B", marginTop: 2 }}>
                          {c._fazendas_prod.map(f => f.nome).slice(0, 2).join(", ")}
                          {c._fazendas_prod.length > 2 ? ` +${c._fazendas_prod.length - 2}` : ""}
                        </div>
                      )}
                    </td>
                    <td style={{ padding: "10px 12px" }}>
                      {c.pacote ? (
                        <span style={{ padding: "2px 8px", background: PACOTE_CFG[c.pacote].bg, color: PACOTE_CFG[c.pacote].cor, borderRadius: 6, fontSize: 11, fontWeight: 600 }}>
                          {PACOTE_CFG[c.pacote].label}
                        </span>
                      ) : <span style={{ color: "#aaa", fontSize: 11 }}>—</span>}
                    </td>
                    <td style={{ padding: "10px 12px" }}>
                      {c._sem_conta ? (
                        <span style={{ color: "#C9921B", fontSize: 11 }}>—</span>
                      ) : (
                        <span style={{ padding: "2px 8px", background: sCfg.bg, color: sCfg.cor, borderRadius: 6, fontSize: 11, fontWeight: 600 }}>
                          {sCfg.label}
                        </span>
                      )}
                    </td>
                    <td style={{ padding: "10px 12px" }}>
                      {c.crm_stage ? (
                        <span style={{ fontSize: 11, color: CRM_STAGE_CFG[c.crm_stage]?.cor ?? "#888" }}>
                          {CRM_STAGE_CFG[c.crm_stage]?.label ?? c.crm_stage}
                        </span>
                      ) : <span style={{ color: "#aaa", fontSize: 11 }}>—</span>}
                    </td>
                    <td style={{ padding: "10px 12px", fontSize: 12, color: "#555" }}>
                      {c.cidade && c.estado ? `${c.cidade}/${c.estado}` : (c.estado ?? (c._fazendas_prod[0]?.municipio ? `${c._fazendas_prod[0].municipio}/${c._fazendas_prod[0].estado ?? ""}` : "—"))}
                    </td>
                    <td style={{ padding: "10px 12px", textAlign: "center", fontSize: 12, color: "#555" }}>
                      {fmtDate(c.data_inicio)}
                    </td>
                    <td style={{ padding: "10px 12px", textAlign: "center" }}>
                      {c.data_vencimento ? (
                        <>
                          <div style={{ fontSize: 12, color: vencido ? "#E24B4A" : urgente ? "#C9921B" : "#555", fontWeight: (urgente || vencido) ? 600 : 400 }}>
                            {fmtDate(c.data_vencimento)}
                          </div>
                          {dias !== null && (
                            <div style={{ fontSize: 10, color: vencido ? "#E24B4A" : urgente ? "#C9921B" : "#aaa" }}>
                              {vencido ? `há ${Math.abs(dias)}d` : `${dias}d`}
                            </div>
                          )}
                        </>
                      ) : <span style={{ color: "#aaa", fontSize: 11 }}>—</span>}
                    </td>
                    <td style={{ padding: "10px 12px", textAlign: "center", fontSize: 12, fontWeight: 600, color: c.valor_mensalidade ? "#0B1E35" : "#aaa" }}>
                      {fmtBRL(c.valor_mensalidade)}
                    </td>
                    <td style={{ padding: "10px 12px", textAlign: "center" }}>
                      <span style={{ background: "#F3F6F9", borderRadius: 6, padding: "2px 10px", fontSize: 12, color: "#555", fontWeight: 600 }}>
                        {c.fazendas_count}
                      </span>
                    </td>
                    <td style={{ padding: "10px 12px" }}>
                      {c._sem_conta ? (
                        /* Cliente sem conta admin */
                        <div style={{ display: "flex", gap: 5, justifyContent: "flex-end" }}>
                          <button
                            style={{ ...btnSmall, color: "#C9921B", borderColor: "#C9921B60", background: "#FBF3E0", fontSize: 11 }}
                            onClick={() => criarContaAdmin(c)}
                            title="Criar conta admin para este cliente"
                          >
                            + Criar conta
                          </button>
                          <button
                            style={{ ...btnSmall, color: "#6B7280", borderColor: "#6B728060" }}
                            onClick={() => excluirConta(c)}
                            title="Excluir cliente permanentemente (irreversível)"
                            disabled={acaoLoading === c.id}
                          >
                            🗑
                          </button>
                        </div>
                      ) : (
                        <div style={{ display: "flex", gap: 5, justifyContent: "flex-end", flexWrap: "wrap" }}>
                          {/* Faturamento */}
                          <button style={btnSmall} onClick={() => router.push(`/admin/faturamento?conta=${c.id}`)} title="Histórico de faturamento">
                            💳
                          </button>
                          {/* Módulos */}
                          <button style={btnSmall} onClick={() => router.push(`/admin/modulos?conta=${c.id}`)} title="Gerenciar módulos">
                            ⬡
                          </button>
                          {/* Alterar plano */}
                          <button
                            style={{ ...btnSmall, color: "#1A4870", borderColor: "#1A487060" }}
                            onClick={() => setModalPlano(c)}
                            title="Upgrade / Downgrade de plano"
                            disabled={acaoLoading === c.id}
                          >
                            ↑↓
                          </button>
                          {/* Pro Bono */}
                          {c.status !== "pro_bono" ? (
                            <button
                              style={{ ...btnSmall, color: "#378ADD", borderColor: "#378ADD60" }}
                              onClick={() => marcarProBono(c)}
                              title="Marcar como Pro Bono"
                            >
                              ⭐ PB
                            </button>
                          ) : (
                            <button
                              style={{ ...btnSmall, color: "#E24B4A", borderColor: "#E24B4A60", background: "#FEF2F2" }}
                              onClick={() => removerProBono(c)}
                              title="Remover Pro Bono"
                            >
                              ✕ PB
                            </button>
                          )}
                          {/* Editar */}
                          <button style={btnSmall} onClick={() => setModalEdit(c)} title="Editar dados">
                            ✎
                          </button>
                          {/* Cancelar acesso */}
                          {c.status !== "cancelado" && (
                            <button
                              style={{ ...btnSmall, color: "#E24B4A", borderColor: "#E24B4A60" }}
                              onClick={() => cancelarAcesso(c)}
                              title={c.status === "trial" ? "Encerrar trial e revogar acesso" : "Cancelar acesso (revoga login)"}
                              disabled={acaoLoading === c.id}
                            >
                              {acaoLoading === c.id ? "…" : "🚫"}
                            </button>
                          )}
                              {/* Excluir permanentemente */}
                          <button
                            style={{ ...btnSmall, color: "#6B7280", borderColor: "#6B728060" }}
                            onClick={() => excluirConta(c)}
                            title="Excluir cliente permanentemente (irreversível)"
                            disabled={acaoLoading === c.id}
                          >
                            🗑
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Nota */}
      <div style={{ marginTop: 16, padding: "10px 14px", background: "#EFF6FF", borderRadius: 8, border: "0.5px solid #378ADD40", fontSize: 11, color: "#1A4870", lineHeight: 1.7 }}>
        <strong>Dica:</strong> <strong>💳</strong> faturamento · <strong>⬡</strong> módulos · <strong>↑↓</strong> alterar plano · <strong>⭐ PB</strong> pro bono · <strong>✎</strong> editar · <strong>🚫</strong> cancelar acesso (revoga login imediatamente) · <strong>🗑</strong> excluir permanentemente (só trial/cancelado/pro bono).
      </div>
    </div>
  );
}
