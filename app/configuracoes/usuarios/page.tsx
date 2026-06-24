"use client";
import { useState, useEffect } from "react";
import TopNav from "../../../components/TopNav";
import { useAuth } from "../../../components/AuthProvider";
import { supabase } from "../../../lib/supabase";
import type { GrupoUsuario, Usuario } from "../../../lib/supabase";

// ── Estrutura de permissões ────────────────────────────────────────────────────
type Acao = "visualizar" | "criar" | "editar" | "excluir" | "exportar" | "aprovar";

interface ModuloPermissao {
  id: string;
  label: string;
  grupo: string;
  acoes: Acao[];
}

const MODULOS_PERM: ModuloPermissao[] = [
  { id: "propriedades",     label: "Propriedades & Talhões",    grupo: "Campo",      acoes: ["visualizar","criar","editar","excluir"] },
  { id: "lavoura_plantio",  label: "Lavoura — Plantio",         grupo: "Campo",      acoes: ["visualizar","criar","editar","excluir"] },
  { id: "lavoura_pulv",     label: "Lavoura — Pulverização",    grupo: "Campo",      acoes: ["visualizar","criar","editar","excluir"] },
  { id: "lavoura_colheita", label: "Lavoura — Colheita",        grupo: "Campo",      acoes: ["visualizar","criar","editar","excluir","aprovar"] },
  { id: "lavoura_plan",     label: "Lavoura — Planejamento",    grupo: "Campo",      acoes: ["visualizar","criar","editar","excluir"] },
  { id: "contratos",        label: "Comercialização de Grãos",  grupo: "Comercial",  acoes: ["visualizar","criar","editar","excluir","aprovar"] },
  { id: "expedicao",        label: "Expedição de Grãos",        grupo: "Comercial",  acoes: ["visualizar","criar","editar","excluir"] },
  { id: "arrendamento",     label: "Contratos de Arrendamento", grupo: "Comercial",  acoes: ["visualizar","criar","editar","excluir"] },
  { id: "estoque",          label: "Estoque",                   grupo: "Estoque",    acoes: ["visualizar","criar","editar","excluir"] },
  { id: "compras",          label: "Pedidos de Compra",         grupo: "Estoque",    acoes: ["visualizar","criar","editar","excluir","aprovar"] },
  { id: "nf_entrada",       label: "NF de Entrada (Produtos)",  grupo: "Estoque",    acoes: ["visualizar","criar","editar","excluir"] },
  { id: "nf_servico",       label: "NF de Serviços",            grupo: "Estoque",    acoes: ["visualizar","criar","editar","excluir"] },
  { id: "fin_receber",      label: "Contas a Receber",          grupo: "Financeiro", acoes: ["visualizar","criar","editar","excluir","aprovar"] },
  { id: "fin_pagar",        label: "Contas a Pagar",            grupo: "Financeiro", acoes: ["visualizar","criar","editar","excluir","aprovar"] },
  { id: "fin_contratos",    label: "Contratos Financeiros",     grupo: "Financeiro", acoes: ["visualizar","criar","editar","excluir"] },
  { id: "fin_tesouraria",   label: "Tesouraria",                grupo: "Financeiro", acoes: ["visualizar","criar","editar","excluir"] },
  { id: "fin_seguros",      label: "Seguros",                   grupo: "Financeiro", acoes: ["visualizar","criar","editar","excluir"] },
  { id: "fiscal_nfe",       label: "Emissão NF-e",              grupo: "Fiscal",     acoes: ["visualizar","criar","aprovar"] },
  { id: "fiscal_sped",      label: "SPED / LCDPR",              grupo: "Fiscal",     acoes: ["visualizar","exportar"] },
  { id: "transporte",       label: "CT-e e MDF-e",              grupo: "Fiscal",     acoes: ["visualizar","criar","editar","excluir","aprovar"] },
  { id: "custos",           label: "Custos & DRE",              grupo: "Análise",    acoes: ["visualizar","exportar"] },
  { id: "fin_relatorios",   label: "Relatórios Financeiros",    grupo: "Análise",    acoes: ["visualizar","exportar"] },
  { id: "bi",               label: "BI — Raccolto Intelligence",grupo: "Análise",    acoes: ["visualizar"] },
  { id: "cadastros",           label: "Cadastros (tabelas auxiliares)", grupo: "Admin",         acoes: ["visualizar","criar","editar","excluir"] },
  { id: "conf_empresa",        label: "Empresa & Certificado A1",       grupo: "Configurações", acoes: ["visualizar","editar"] },
  { id: "conf_fiscal",         label: "Parâmetros Fiscais (NF-e/MDF-e)",grupo: "Configurações", acoes: ["visualizar","editar"] },
  { id: "conf_financeiro",     label: "Config. Financeira (Plano/Oper)",grupo: "Configurações", acoes: ["visualizar","editar"] },
  { id: "conf_contabilidade",  label: "Configuração Contábil",          grupo: "Configurações", acoes: ["visualizar","editar"] },
  { id: "conf_sistema",        label: "Sistema (Automações/Integrações)",grupo: "Configurações",acoes: ["visualizar","editar"] },
  { id: "conf_importacao",     label: "Importação de Dados",            grupo: "Configurações", acoes: ["visualizar","criar"] },
  { id: "usuarios",            label: "Usuários & Permissões",          grupo: "Configurações", acoes: ["visualizar","criar","editar","excluir"] },
  { id: "logs",                label: "Log do Sistema",                 grupo: "Configurações", acoes: ["visualizar","exportar"] },
  { id: "conf_raccotlo",      label: "🔒 Gestão Raccolto (WhatsApp Bot / Integrações / Backup / Importação)", grupo: "Configurações", acoes: ["visualizar","editar"] },
];

const PERFIS_PRESET: Record<string, { label: string; cor: string; descricao: string; permissoes: Record<string, Acao[]> }> = {
  admin: {
    label: "Administrador", cor: "#E24B4A",
    descricao: "Acesso total a todos os módulos e configurações do sistema. Itens exclusivos da Raccolto permanecem ocultos.",
    permissoes: Object.fromEntries(MODULOS_PERM.map(m => [m.id,
      m.id === "conf_raccotlo" ? [] as Acao[] :
      [...m.acoes]
    ])),
  },
  gerente: {
    label: "Gerente Geral", cor: "#1A4870",
    descricao: "Acesso completo às operações. Gerencia usuários e permissões. Sem acesso a parâmetros fiscais e integrações.",
    permissoes: Object.fromEntries(MODULOS_PERM.map(m => [m.id,
      m.id === "conf_raccotlo"      ? [] as Acao[] :
      m.id === "usuarios"           ? ["visualizar","criar","editar","excluir"] as Acao[] :
      m.id === "conf_empresa"       ? ["visualizar","editar"] as Acao[] :
      m.id === "conf_financeiro"    ? ["visualizar"] as Acao[] :
      m.id === "conf_fiscal"        ? ["visualizar"] as Acao[] :
      m.id === "conf_contabilidade" ? ["visualizar"] as Acao[] :
      m.id === "conf_sistema"       ? [] as Acao[] :
      m.id === "conf_importacao"    ? [] as Acao[] :
      m.id === "logs"               ? ["visualizar"] as Acao[] :
      m.id === "cadastros"          ? ["visualizar","criar","editar","excluir"] as Acao[] :
      [...m.acoes]
    ])),
  },
  operador: {
    label: "Operador de Campo", cor: "#16A34A",
    descricao: "Lançamentos de campo (plantio, pulverização, colheita) e estoque. Visualização em demais módulos.",
    permissoes: Object.fromEntries(MODULOS_PERM.map(m => [m.id,
      m.grupo === "Campo"          ? ["visualizar","criar","editar"] as Acao[] :
      m.grupo === "Estoque"        ? ["visualizar","criar"] as Acao[] :
      m.grupo === "Configurações"  ? [] as Acao[] :
      m.id === "cadastros"         ? ["visualizar"] as Acao[] :
      ["visualizar"] as Acao[]
    ])),
  },
  financeiro: {
    label: "Equipe Financeira", cor: "#C9921B",
    descricao: "Controle total do financeiro. Acesso a plano de contas e configurações financeiras. Sem acesso a configurações fiscais e de sistema.",
    permissoes: Object.fromEntries(MODULOS_PERM.map(m => [m.id,
      m.grupo === "Financeiro"   ? [...m.acoes] as Acao[] :
      m.grupo === "Análise"      ? [...m.acoes] as Acao[] :
      m.id === "conf_financeiro" ? ["visualizar","editar"] as Acao[] :
      m.grupo === "Configurações"? [] as Acao[] :
      ["visualizar"] as Acao[]
    ])),
  },
  consultor: {
    label: "Consultor / Contador", cor: "#7C3AED",
    descricao: "Acesso somente leitura e exportação. Ideal para consultores externos e contadores.",
    permissoes: Object.fromEntries(MODULOS_PERM.map(m => [m.id,
      m.grupo === "Configurações" ? [] as Acao[] :
      ["visualizar","exportar"].filter(a => m.acoes.includes(a as Acao)) as Acao[]
    ])),
  },
};

const ACAO_META: Record<Acao, { label: string; cor: string; bg: string }> = {
  visualizar: { label: "Ver",      cor: "#1A4870", bg: "#D5E8F5" },
  criar:      { label: "Criar",    cor: "#16A34A", bg: "#DCFCE7" },
  editar:     { label: "Editar",   cor: "#C9921B", bg: "#FBF3E0" },
  excluir:    { label: "Excluir",  cor: "#E24B4A", bg: "#FCEBEB" },
  exportar:   { label: "Exportar", cor: "#7C3AED", bg: "#EDE9FE" },
  aprovar:    { label: "Aprovar",  cor: "#0891B2", bg: "#E0F2FE" },
};

type PermMap = Record<string, Acao[]>;

const permEmpty = (): PermMap =>
  Object.fromEntries(MODULOS_PERM.map(m => [m.id, [] as Acao[]]));

const permFromGrupo = (g: GrupoUsuario): PermMap => {
  const base = permEmpty();
  if (g.permissoes && typeof g.permissoes === "object") {
    for (const [mod, val] of Object.entries(g.permissoes)) {
      if (typeof val === "string") {
        const modInfo = MODULOS_PERM.find(m => m.id === mod || m.id.startsWith(mod));
        if (modInfo) {
          if (val === "admin")    base[modInfo.id] = [...modInfo.acoes];
          else if (val === "escrita") base[modInfo.id] = ["visualizar","criar","editar"] as Acao[];
          else if (val === "leitura") base[modInfo.id] = ["visualizar"] as Acao[];
          else base[modInfo.id] = [];
        }
      } else if (Array.isArray(val)) {
        base[mod] = val as Acao[];
      }
    }
  }
  return base;
};

const inp: React.CSSProperties = {
  width: "100%", padding: "8px 10px", border: "0.5px solid #D4DCE8", borderRadius: 8,
  fontSize: 13, color: "#1a1a1a", background: "#fff", boxSizing: "border-box", outline: "none",
};
const lbl: React.CSSProperties = { fontSize: 11, color: "#555", marginBottom: 4, display: "block" };
const btnV: React.CSSProperties = { padding: "9px 20px", background: "#1A4870", color: "#fff", border: "none", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer" };
const btnR: React.CSSProperties = { padding: "9px 16px", background: "#F4F6FA", color: "#555", border: "0.5px solid #D4DCE8", borderRadius: 8, fontSize: 13, cursor: "pointer" };

function Modal({ titulo, onClose, width = 560, children }: { titulo: string; onClose: () => void; width?: number; children: React.ReactNode }) {
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center" }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ background: "#fff", borderRadius: 12, width, maxWidth: "96vw", maxHeight: "90vh", overflow: "auto", boxShadow: "0 8px 40px rgba(0,0,0,0.2)" }}>
        <div style={{ padding: "16px 22px", borderBottom: "0.5px solid #DEE5EE", display: "flex", alignItems: "center", justifyContent: "space-between", position: "sticky", top: 0, background: "#fff", zIndex: 1 }}>
          <span style={{ fontWeight: 700, fontSize: 15, color: "#1a1a1a" }}>{titulo}</span>
          <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer", color: "#555" }}>✕</button>
        </div>
        <div style={{ padding: "20px 22px" }}>{children}</div>
      </div>
    </div>
  );
}

function MatrizPermissoes({ perms, onChange }: { perms: PermMap; onChange: (p: PermMap) => void }) {
  const grupos = Array.from(new Set(MODULOS_PERM.map(m => m.grupo)));

  const toggle = (modId: string, acao: Acao) => {
    const atual = perms[modId] ?? [];
    const novo = atual.includes(acao) ? atual.filter(a => a !== acao) : [...atual, acao];
    onChange({ ...perms, [modId]: novo });
  };

  const toggleGrupo = (grupo: string, acao: Acao) => {
    const mods = MODULOS_PERM.filter(m => m.grupo === grupo && m.acoes.includes(acao));
    const todosOn = mods.every(m => (perms[m.id] ?? []).includes(acao));
    const novo = { ...perms };
    for (const m of mods) {
      if (todosOn) novo[m.id] = (novo[m.id] ?? []).filter(a => a !== acao);
      else if (!(novo[m.id] ?? []).includes(acao)) novo[m.id] = [...(novo[m.id] ?? []), acao];
    }
    onChange(novo);
  };

  const toggleTudo = (modId: string) => {
    const mod = MODULOS_PERM.find(m => m.id === modId)!;
    const atual = perms[modId] ?? [];
    onChange({ ...perms, [modId]: atual.length === mod.acoes.length ? [] : [...mod.acoes] });
  };

  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
        <thead>
          <tr style={{ background: "#F4F6FA" }}>
            <th style={{ padding: "8px 12px", textAlign: "left", fontWeight: 600, fontSize: 11, color: "#555", minWidth: 200, borderBottom: "0.5px solid #DEE5EE" }}>Módulo</th>
            {(Object.keys(ACAO_META) as Acao[]).map(a => (
              <th key={a} style={{ padding: "8px 10px", textAlign: "center", fontWeight: 600, fontSize: 11, color: ACAO_META[a].cor, borderBottom: "0.5px solid #DEE5EE", whiteSpace: "nowrap", minWidth: 66 }}>
                {ACAO_META[a].label}
              </th>
            ))}
            <th style={{ padding: "8px 10px", textAlign: "center", fontWeight: 600, fontSize: 10, color: "#888", borderBottom: "0.5px solid #DEE5EE", width: 50 }}>Tudo</th>
          </tr>
        </thead>
        <tbody>
          {grupos.map(grupo => {
            const modsGrupo = MODULOS_PERM.filter(m => m.grupo === grupo);
            return (
              <>
                <tr key={`g-${grupo}`} style={{ background: "#EFF3FA" }}>
                  <td style={{ padding: "6px 12px", fontWeight: 700, fontSize: 11, color: "#1A4870", letterSpacing: "0.5px" }}>
                    {grupo.toUpperCase()}
                  </td>
                  {(Object.keys(ACAO_META) as Acao[]).map(acao => {
                    const modsComAcao = modsGrupo.filter(m => m.acoes.includes(acao));
                    const todosOn = modsComAcao.length > 0 && modsComAcao.every(m => (perms[m.id] ?? []).includes(acao));
                    const algumOn = modsComAcao.some(m => (perms[m.id] ?? []).includes(acao));
                    return (
                      <td key={acao} style={{ padding: "6px 10px", textAlign: "center" }}>
                        {modsComAcao.length > 0 ? (
                          <button
                            onClick={() => toggleGrupo(grupo, acao)}
                            title={`${todosOn ? "Desativar" : "Ativar"} "${ACAO_META[acao].label}" em todo o grupo ${grupo}`}
                            style={{ width: 20, height: 20, borderRadius: 5, border: `0.5px solid ${todosOn ? ACAO_META[acao].cor : algumOn ? ACAO_META[acao].cor + "80" : "#D4DCE8"}`, background: todosOn ? ACAO_META[acao].bg : algumOn ? ACAO_META[acao].bg + "80" : "#fff", cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 10 }}>
                            {todosOn ? "✓" : algumOn ? "−" : ""}
                          </button>
                        ) : <span style={{ color: "#ddd", fontSize: 10 }}>—</span>}
                      </td>
                    );
                  })}
                  <td />
                </tr>
                {modsGrupo.map((mod, idx) => {
                  const acoesAtivas = perms[mod.id] ?? [];
                  const tudo = acoesAtivas.length === mod.acoes.length;
                  return (
                    <tr key={mod.id} style={{ borderBottom: "0.5px solid #F0F4FA", background: idx % 2 === 0 ? "#fff" : "#FAFBFD" }}>
                      <td style={{ padding: "7px 12px 7px 22px", color: "#1a1a1a" }}>{mod.label}</td>
                      {(Object.keys(ACAO_META) as Acao[]).map(acao => {
                        const disponivel = mod.acoes.includes(acao);
                        const ativo = acoesAtivas.includes(acao);
                        return (
                          <td key={acao} style={{ padding: "7px 10px", textAlign: "center" }}>
                            {disponivel ? (
                              <button
                                onClick={() => toggle(mod.id, acao)}
                                title={`${ativo ? "Remover" : "Conceder"} permissão "${ACAO_META[acao].label}" em ${mod.label}`}
                                style={{ width: 22, height: 22, borderRadius: 6, border: `0.5px solid ${ativo ? ACAO_META[acao].cor : "#D4DCE8"}`, background: ativo ? ACAO_META[acao].bg : "#fff", cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, color: ativo ? ACAO_META[acao].cor : "#bbb", transition: "all 0.1s" }}>
                                {ativo ? "✓" : ""}
                              </button>
                            ) : (
                              <span style={{ color: "#E8ECF2", fontSize: 11 }}>—</span>
                            )}
                          </td>
                        );
                      })}
                      <td style={{ padding: "7px 10px", textAlign: "center" }}>
                        <button
                          onClick={() => toggleTudo(mod.id)}
                          style={{ fontSize: 10, color: tudo ? "#E24B4A" : "#16A34A", background: "none", border: "none", cursor: "pointer", fontWeight: 600 }}>
                          {tudo ? "Nenhum" : "Tudo"}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default function UsuariosPermissoes() {
  const { fazendaId, contaId } = useAuth();
  const [fazendaInfo, setFazendaInfo] = useState<{ nome: string; municipio: string; estado: string } | null>(null);

  const [aba, setAba] = useState<"grupos" | "usuarios">("grupos");

  const [raccoltoAcesso,   setRaccoltoAcesso]   = useState(false);
  const [salvandoRaccolto, setSalvandoRaccolto] = useState(false);

  const [grupos,    setGrupos]    = useState<GrupoUsuario[]>([]);
  const [usuarios,  setUsuarios]  = useState<Usuario[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [salvando,  setSalvando]  = useState(false);
  const [erro,      setErro]      = useState<string | null>(null);

  const [modalGrupo, setModalGrupo] = useState(false);
  const [editGrupo,  setEditGrupo]  = useState<GrupoUsuario | null>(null);
  const [fGrupo,     setFGrupo]     = useState({ nome: "", descricao: "" });
  const [permGrupo,  setPermGrupo]  = useState<PermMap>(permEmpty());
  const [presetAtivo, setPresetAtivo] = useState<string | null>(null);

  const [modalUser,       setModalUser]       = useState(false);
  const [editUser,        setEditUser]        = useState<Usuario | null>(null);
  const [fUser,           setFUser]           = useState({ nome: "", email: "", senha: "Arato@123", grupo_id: "", ativo: true, enviarEmail: true, whatsapp: "" });
  const [senhaVisivel,    setSenhaVisivel]    = useState(false);
  const [resultadoCriacao, setResultadoCriacao] = useState<{ ok: boolean; emailEnviado?: boolean; erro?: string } | null>(null);

  useEffect(() => {
    if (!fazendaId) return;
    supabase.from("fazendas").select("nome, municipio, estado").eq("id", fazendaId).single()
      .then(({ data }) => { if (data) setFazendaInfo({ nome: data.nome, municipio: data.municipio ?? "", estado: data.estado ?? "" }); });
    supabase.from("fazendas").select("raccolto_acesso").eq("id", fazendaId).single()
      .then(({ data }) => { if (data) setRaccoltoAcesso(!!(data as { raccolto_acesso?: boolean }).raccolto_acesso); });
  }, [fazendaId]);

  const toggleRaccolto = async () => {
    if (!fazendaId) return;
    setSalvandoRaccolto(true);
    const novoValor = !raccoltoAcesso;
    try {
      const res = await fetch("/api/fazenda/raccolto-acesso", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fazenda_id: fazendaId, ativo: novoValor }),
      });
      const json = await res.json();
      if (res.ok) setRaccoltoAcesso(novoValor);
      else setErro("Erro ao alterar acesso Raccolto: " + (json.error ?? res.statusText));
    } catch {
      setErro("Erro de conexão ao alterar acesso Raccolto.");
    }
    setSalvandoRaccolto(false);
  };

  // Carrega grupos via API route (service_role_key) para evitar bloqueio por JWT expirado
  const carregarGrupos = async (fid: string) => {
    const res = await fetch(`/api/grupos-usuarios?fazenda_id=${fid}`);
    const json = await res.json();
    setGrupos((json.data ?? []) as GrupoUsuario[]);
  };

  useEffect(() => {
    if (!fazendaId) return;
    setCarregando(true);
    Promise.all([
      carregarGrupos(fazendaId),
      supabase.from("usuarios").select("*").eq("fazenda_id", fazendaId).order("nome")
        .then(({ data: us }) => setUsuarios((us ?? []) as Usuario[])),
    ]).finally(() => setCarregando(false));
  }, [fazendaId]); // eslint-disable-line react-hooks/exhaustive-deps

  const abrirModalGrupo = (g?: GrupoUsuario) => {
    setEditGrupo(g ?? null);
    setFGrupo({ nome: g?.nome ?? "", descricao: g?.descricao ?? "" });
    setPermGrupo(g ? permFromGrupo(g) : permEmpty());
    setPresetAtivo(null);
    setModalGrupo(true);
  };

  const salvarGrupo = async () => {
    if (!fGrupo.nome.trim() || !fazendaId) return;
    setSalvando(true);
    const payload = { fazenda_id: fazendaId, nome: fGrupo.nome.trim(), descricao: fGrupo.descricao, permissoes: permGrupo };

    const res = editGrupo
      ? await fetch("/api/grupos-usuarios", { method: "PUT",    headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: editGrupo.id, ...payload }) })
      : await fetch("/api/grupos-usuarios", { method: "POST",   headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });

    const json = await res.json();
    if (!res.ok || json.error) { setErro(json.error ?? "Erro ao salvar grupo."); setSalvando(false); return; }

    await carregarGrupos(fazendaId);
    setModalGrupo(false);
    setSalvando(false);
  };

  const excluirGrupo = async (id: string) => {
    if (!confirm("Excluir este grupo? Os usuários vinculados perderão o grupo.")) return;
    await fetch(`/api/grupos-usuarios?id=${id}`, { method: "DELETE" });
    setGrupos(prev => prev.filter(g => g.id !== id));
  };

  const aplicarPreset = (presetId: string) => {
    const p = PERFIS_PRESET[presetId];
    if (!p) return;
    setPermGrupo({ ...permEmpty(), ...p.permissoes });
    setPresetAtivo(presetId);
    if (!fGrupo.nome.trim()) setFGrupo(f => ({ ...f, nome: p.label }));
    if (!fGrupo.descricao.trim()) setFGrupo(f => ({ ...f, descricao: p.descricao }));
  };

  const abrirModalUser = (u?: Usuario) => {
    setEditUser(u ?? null);
    setFUser({ nome: u?.nome ?? "", email: u?.email ?? "", senha: "Arato@123", grupo_id: u?.grupo_id ?? "", ativo: u?.ativo !== false, enviarEmail: true, whatsapp: (u as { whatsapp?: string })?.whatsapp ?? "" });
    setSenhaVisivel(false);
    setResultadoCriacao(null);
    setModalUser(true);
  };

  const salvarUser = async () => {
    if (!fazendaId || !fUser.nome.trim() || !fUser.email.trim()) return;
    setSalvando(true);
    setResultadoCriacao(null);

    if (editUser) {
      const res = await fetch("/api/usuarios-cliente", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: editUser.id, fazenda_id: fazendaId, nome: fUser.nome.trim(), email: fUser.email.trim(), grupo_id: fUser.grupo_id || null, ativo: fUser.ativo, whatsapp: fUser.whatsapp.trim() || null }),
      });
      const json = await res.json();
      if (!res.ok || json.error) { setErro(json.error ?? "Erro ao atualizar usuário."); setSalvando(false); return; }
    } else {
      if (!fUser.senha.trim() || fUser.senha.trim().length < 6) {
        setErro("Senha deve ter pelo menos 6 caracteres.");
        setSalvando(false);
        return;
      }
      const res = await fetch("/api/admin/criar-usuario", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fazenda_id:        fazendaId,
          conta_id:          contaId,
          user_nome:         fUser.nome.trim(),
          user_email:        fUser.email.trim(),
          user_senha:        fUser.senha.trim(),
          grupo_id:          fUser.grupo_id || null,
          fazenda_nome:      fazendaInfo?.nome,
          fazenda_municipio: fazendaInfo?.municipio,
          fazenda_estado:    fazendaInfo?.estado,
          enviar_email:      fUser.enviarEmail,
          whatsapp:          fUser.whatsapp.trim() || null,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        setErro(json.error ?? "Erro ao criar usuário.");
        setSalvando(false);
        return;
      }
      setResultadoCriacao({ ok: true, emailEnviado: json.email_enviado });
    }

    const { data } = await supabase.from("usuarios").select("*").eq("fazenda_id", fazendaId).order("nome");
    setUsuarios((data ?? []) as Usuario[]);
    if (editUser) setModalUser(false);
    setSalvando(false);
  };

  const excluirUser = async (id: string) => {
    if (!confirm("Excluir este usuário?")) return;
    await fetch(`/api/usuarios-cliente?id=${id}&fazenda_id=${fazendaId}`, { method: "DELETE" });
    setUsuarios(prev => prev.filter(u => u.id !== id));
  };

  const resumoPerms = (g: GrupoUsuario) => {
    const perms = permFromGrupo(g);
    const total = MODULOS_PERM.length;
    const comAcesso = MODULOS_PERM.filter(m => (perms[m.id] ?? []).length > 0).length;
    return { total, comAcesso };
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh", background: "#F4F6FA", fontFamily: "system-ui, sans-serif", fontSize: 13 }}>
      <TopNav />

      <div style={{ padding: "24px 28px", flex: 1 }}>
        {/* Cabeçalho */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: "#1a1a1a" }}>Usuários & Permissões</h1>
            <p style={{ margin: "3px 0 0", fontSize: 12, color: "#666" }}>Gerencie os usuários e grupos de acesso desta fazenda</p>
          </div>
          <button
            onClick={() => aba === "grupos" ? abrirModalGrupo() : abrirModalUser()}
            style={{ ...btnV, fontSize: 12 }}>
            + {aba === "grupos" ? "Novo Grupo" : "Novo Usuário"}
          </button>
        </div>

        {erro && (
          <div style={{ background: "#FCEBEB", border: "0.5px solid #E24B4A50", borderRadius: 8, padding: "10px 16px", marginBottom: 14, fontSize: 12, color: "#791F1F" }}>
            ⚠ {erro} <button onClick={() => setErro(null)} style={{ background: "none", border: "none", color: "#791F1F", cursor: "pointer", marginLeft: 8 }}>✕</button>
          </div>
        )}

        {/* Abas */}
        <div style={{ display: "flex", background: "#fff", borderRadius: "12px 12px 0 0", border: "0.5px solid #D4DCE8" }}>
          {([
            { key: "grupos",   label: `Grupos de Acesso (${grupos.length})`  },
            { key: "usuarios", label: `Usuários (${usuarios.length})`        },
          ] as { key: typeof aba; label: string }[]).map(a => (
            <button key={a.key} onClick={() => setAba(a.key)} style={{
              padding: "11px 22px", border: "none", background: "transparent", cursor: "pointer",
              fontWeight: aba === a.key ? 600 : 400, fontSize: 13,
              color: aba === a.key ? "#1a1a1a" : "#555",
              borderBottom: aba === a.key ? "2px solid #1A4870" : "2px solid transparent",
            }}>
              {a.label}
            </button>
          ))}
        </div>

        {/* ── ABA: GRUPOS ── */}
        {aba === "grupos" && (
          <div style={{ background: "#fff", border: "0.5px solid #D4DCE8", borderTop: "none", borderRadius: "0 0 12px 12px", padding: 20 }}>
            {carregando ? (
              <div style={{ padding: 40, textAlign: "center", color: "#888" }}>Carregando…</div>
            ) : grupos.length === 0 ? (
              <div style={{ padding: 40, textAlign: "center", color: "#888" }}>
                Nenhum grupo criado. <button onClick={() => abrirModalGrupo()} style={{ color: "#1A4870", background: "none", border: "none", cursor: "pointer", fontWeight: 600 }}>Criar o primeiro →</button>
              </div>
            ) : (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 14 }}>
                {grupos.map(g => {
                  const res = resumoPerms(g);
                  const pct = res.total > 0 ? Math.round(res.comAcesso / res.total * 100) : 0;
                  return (
                    <div key={g.id} style={{ border: "0.5px solid #D4DCE8", borderRadius: 12, padding: "16px 18px", background: "#fff", display: "flex", flexDirection: "column", gap: 10 }}>
                      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
                        <div>
                          <div style={{ fontWeight: 700, fontSize: 14, color: "#1a1a1a" }}>{g.nome}</div>
                          {g.descricao && <div style={{ fontSize: 11, color: "#666", marginTop: 2 }}>{g.descricao}</div>}
                        </div>
                        <div style={{ display: "flex", gap: 6 }}>
                          <button onClick={() => abrirModalGrupo(g)}
                            style={{ padding: "4px 10px", background: "#EFF3FA", border: "0.5px solid #D4DCE8", borderRadius: 6, fontSize: 11, color: "#1A4870", cursor: "pointer", fontWeight: 600 }}>
                            Editar
                          </button>
                          <button onClick={() => excluirGrupo(g.id)}
                            style={{ padding: "4px 10px", background: "#FCEBEB", border: "0.5px solid #E24B4A50", borderRadius: 6, fontSize: 11, color: "#E24B4A", cursor: "pointer" }}>
                            ✕
                          </button>
                        </div>
                      </div>

                      <div>
                        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "#555", marginBottom: 4 }}>
                          <span>{res.comAcesso} de {res.total} módulos com acesso</span>
                          <span style={{ fontWeight: 600 }}>{pct}%</span>
                        </div>
                        <div style={{ height: 5, background: "#EFF3FA", borderRadius: 10, overflow: "hidden" }}>
                          <div style={{ width: pct + "%", height: "100%", background: pct > 80 ? "#1A4870" : pct > 40 ? "#C9921B" : "#378ADD", borderRadius: 10 }} />
                        </div>
                      </div>

                      <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                        {(Object.keys(ACAO_META) as Acao[]).map(acao => {
                          const qt = MODULOS_PERM.filter(m => (permFromGrupo(g)[m.id] ?? []).includes(acao)).length;
                          if (qt === 0) return null;
                          return (
                            <span key={acao} style={{ fontSize: 10, background: ACAO_META[acao].bg, color: ACAO_META[acao].cor, padding: "2px 7px", borderRadius: 10, fontWeight: 600 }}>
                              {ACAO_META[acao].label} ({qt})
                            </span>
                          );
                        })}
                      </div>

                      <div style={{ fontSize: 11, color: "#555" }}>
                        {(() => {
                          const membros = usuarios.filter(u => u.grupo_id === g.id);
                          return membros.length > 0
                            ? `${membros.length} usuário${membros.length > 1 ? "s" : ""}: ${membros.map(u => u.nome).join(", ")}`
                            : <span style={{ color: "#aaa" }}>Nenhum usuário vinculado</span>;
                        })()}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ── ABA: USUÁRIOS ── */}
        {aba === "usuarios" && (
          <div style={{ background: "#fff", border: "0.5px solid #D4DCE8", borderTop: "none", borderRadius: "0 0 12px 12px", overflow: "hidden" }}>

            {/* Acesso Raccolto (LGPD) */}
            <div style={{
              margin: "16px 16px 0",
              borderRadius: 10,
              border: `1.5px solid ${raccoltoAcesso ? "#1A4870" : "#D4DCE8"}`,
              background: raccoltoAcesso ? "#EBF3FC" : "#F8FAFD",
              padding: "14px 18px",
              display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16,
            }}>
              <div style={{ flex: 1 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: raccoltoAcesso ? "#0B2D50" : "#1a1a1a" }}>
                    Acesso Raccolto
                  </span>
                  <span style={{
                    fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 8,
                    background: raccoltoAcesso ? "#1A4870" : "#DEE5EE",
                    color: raccoltoAcesso ? "#fff" : "#666",
                  }}>
                    {raccoltoAcesso ? "ATIVO" : "INATIVO"}
                  </span>
                </div>
                <p style={{ margin: 0, fontSize: 12, color: "#555", lineHeight: 1.5 }}>
                  {raccoltoAcesso
                    ? "A Raccolto possui acesso de visualização aos dados desta fazenda para fins de consultoria e suporte. Você pode revogar este acesso a qualquer momento."
                    : "Ative para permitir que a equipe Raccolto visualize os dados desta fazenda. Acesso apenas de leitura, conforme LGPD."}
                </p>
                <p style={{ margin: "6px 0 0", fontSize: 11, color: "#888" }}>
                  Base legal LGPD: Art. 7º, I — consentimento do titular · Art. 18 — direito de revogação a qualquer tempo
                </p>
              </div>
              <button
                onClick={toggleRaccolto}
                disabled={salvandoRaccolto}
                style={{
                  flexShrink: 0, padding: "9px 20px", borderRadius: 8,
                  border: `1.5px solid ${raccoltoAcesso ? "#E24B4A" : "#1A4870"}`,
                  background: raccoltoAcesso ? "#FCEBEB" : "#1A4870",
                  color: raccoltoAcesso ? "#791F1F" : "#fff",
                  fontWeight: 700, fontSize: 13, cursor: salvandoRaccolto ? "wait" : "pointer",
                  whiteSpace: "nowrap",
                }}
              >
                {salvandoRaccolto ? "Salvando…" : raccoltoAcesso ? "Desativar Acesso" : "Ativar Acesso Raccolto"}
              </button>
            </div>

            {carregando ? (
              <div style={{ padding: 40, textAlign: "center", color: "#888" }}>Carregando…</div>
            ) : (
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, marginTop: 16 }}>
                <thead>
                  <tr style={{ background: "#F4F6FA" }}>
                    {["Nome", "E-mail", "Grupo de Acesso", "Status", ""].map(h => (
                      <th key={h} style={{ padding: "10px 16px", textAlign: "left", fontWeight: 600, fontSize: 11, color: "#555", borderBottom: "0.5px solid #DEE5EE" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {usuarios.length === 0 && (
                    <tr><td colSpan={5} style={{ padding: 40, textAlign: "center", color: "#888" }}>
                      Nenhum usuário cadastrado. <button onClick={() => abrirModalUser()} style={{ color: "#1A4870", background: "none", border: "none", cursor: "pointer", fontWeight: 600 }}>Criar o primeiro →</button>
                    </td></tr>
                  )}
                  {usuarios.map((u, i) => {
                    const grupo = grupos.find(g => g.id === u.grupo_id);
                    return (
                      <tr key={u.id} style={{ borderBottom: i < usuarios.length - 1 ? "0.5px solid #F0F3F8" : "none", background: i % 2 === 0 ? "#fff" : "#FAFBFD" }}>
                        <td style={{ padding: "11px 16px", fontWeight: 500, color: "#1a1a1a" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                            <div style={{ width: 32, height: 32, borderRadius: "50%", background: "#FDE9BB", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 700, color: "#C9921B" }}>
                              {u.nome.charAt(0).toUpperCase()}
                            </div>
                            {u.nome}
                          </div>
                        </td>
                        <td style={{ padding: "11px 16px", color: "#555" }}>{u.email}</td>
                        <td style={{ padding: "11px 16px" }}>
                          {grupo
                            ? <span style={{ fontSize: 11, background: "#EFF3FA", color: "#1A4870", padding: "3px 10px", borderRadius: 10, fontWeight: 600 }}>{grupo.nome}</span>
                            : <span style={{ fontSize: 11, color: "#aaa" }}>Sem grupo</span>}
                        </td>
                        <td style={{ padding: "11px 16px" }}>
                          <span style={{ fontSize: 11, background: u.ativo !== false ? "#DCFCE7" : "#F1F5F9", color: u.ativo !== false ? "#16A34A" : "#888", padding: "3px 10px", borderRadius: 10, fontWeight: 600 }}>
                            {u.ativo !== false ? "Ativo" : "Inativo"}
                          </span>
                        </td>
                        <td style={{ padding: "11px 16px", textAlign: "right" }}>
                          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                            <button onClick={() => abrirModalUser(u)}
                              style={{ padding: "4px 12px", background: "#EFF3FA", border: "0.5px solid #D4DCE8", borderRadius: 6, fontSize: 11, color: "#1A4870", cursor: "pointer", fontWeight: 600 }}>
                              Editar
                            </button>
                            <button onClick={() => excluirUser(u.id)}
                              style={{ padding: "4px 10px", background: "#FCEBEB", border: "0.5px solid #E24B4A50", borderRadius: 6, fontSize: 11, color: "#E24B4A", cursor: "pointer" }}>
                              ✕
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
        )}
      </div>

      {/* Modal Grupo */}
      {modalGrupo && (
        <Modal titulo={editGrupo ? `Editar Grupo — ${editGrupo.nome}` : "Novo Grupo de Acesso"} onClose={() => setModalGrupo(false)} width={960}>
          <div style={{ display: "grid", gap: 18 }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div><label style={lbl}>Nome do grupo *</label><input style={inp} value={fGrupo.nome} onChange={e => setFGrupo(p => ({ ...p, nome: e.target.value }))} placeholder="Ex: Equipe de Campo" /></div>
              <div><label style={lbl}>Descrição</label><input style={inp} value={fGrupo.descricao} onChange={e => setFGrupo(p => ({ ...p, descricao: e.target.value }))} placeholder="Opcional" /></div>
            </div>

            <div>
              <label style={lbl}>Perfil predefinido — clique para aplicar</label>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 8 }}>
                {Object.entries(PERFIS_PRESET).map(([id, p]) => (
                  <button key={id} onClick={() => aplicarPreset(id)}
                    style={{ padding: "6px 14px", border: `1.5px solid ${presetAtivo === id ? p.cor : p.cor + "40"}`, borderRadius: 8, background: presetAtivo === id ? p.cor + "18" : p.cor + "08", color: p.cor, fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
                    {presetAtivo === id ? "✓ " : ""}{p.label}
                  </button>
                ))}
                <button onClick={() => { setPermGrupo(permEmpty()); setPresetAtivo(null); }}
                  style={{ padding: "6px 14px", border: "0.5px solid #D4DCE8", borderRadius: 8, background: "#F4F6FA", color: "#555", fontSize: 12, cursor: "pointer" }}>
                  Limpar tudo
                </button>
              </div>
              {presetAtivo && PERFIS_PRESET[presetAtivo] && (
                <div style={{ padding: "8px 12px", background: PERFIS_PRESET[presetAtivo].cor + "08", border: `0.5px solid ${PERFIS_PRESET[presetAtivo].cor}30`, borderRadius: 8, fontSize: 11, color: "#444" }}>
                  <strong style={{ color: PERFIS_PRESET[presetAtivo].cor }}>{PERFIS_PRESET[presetAtivo].label}:</strong> {PERFIS_PRESET[presetAtivo].descricao}
                </div>
              )}
            </div>

            <div>
              <label style={{ ...lbl, fontSize: 12, fontWeight: 700, color: "#1a1a1a" }}>Matriz de Permissões</label>
              <div style={{ border: "0.5px solid #D4DCE8", borderRadius: 10, overflow: "hidden" }}>
                <MatrizPermissoes perms={permGrupo} onChange={setPermGrupo} />
              </div>
            </div>
          </div>

          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 22, paddingTop: 16, borderTop: "0.5px solid #DEE5EE" }}>
            <button style={btnR} onClick={() => setModalGrupo(false)}>Cancelar</button>
            <button style={{ ...btnV, opacity: salvando || !fGrupo.nome.trim() ? 0.5 : 1 }} disabled={salvando || !fGrupo.nome.trim()} onClick={salvarGrupo}>
              {salvando ? "Salvando…" : "Salvar Grupo"}
            </button>
          </div>
        </Modal>
      )}

      {/* Modal Usuário */}
      {modalUser && (
        <Modal titulo={editUser ? "Editar Usuário" : "Novo Usuário"} onClose={() => setModalUser(false)} width={520}>
          {resultadoCriacao?.ok && (
            <div style={{ background: "#F0FDF4", border: "0.5px solid #BBF7D0", borderRadius: 8, padding: "14px 16px", marginBottom: 16 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#166534", marginBottom: 4 }}>✓ Usuário criado com sucesso!</div>
              <div style={{ fontSize: 12, color: "#166534" }}>
                {resultadoCriacao.emailEnviado
                  ? `E-mail de boas-vindas enviado para ${fUser.email}.`
                  : "E-mail não enviado (RESEND_API_KEY não configurado)."}
              </div>
              <button onClick={() => setModalUser(false)} style={{ ...btnV, marginTop: 12, fontSize: 12 }}>Fechar</button>
            </div>
          )}

          {!resultadoCriacao?.ok && (
            <>
              <div style={{ display: "grid", gap: 14 }}>
                <div><label style={lbl}>Nome completo *</label><input style={inp} value={fUser.nome} onChange={e => setFUser(p => ({ ...p, nome: e.target.value }))} placeholder="João da Silva" /></div>
                <div><label style={lbl}>E-mail *</label><input style={inp} type="email" value={fUser.email} onChange={e => setFUser(p => ({ ...p, email: e.target.value }))} placeholder="joao@fazenda.com.br" /></div>
                <div>
                  <label style={lbl}>WhatsApp (assistente IA)</label>
                  <input style={inp} type="tel" value={fUser.whatsapp} onChange={e => setFUser(p => ({ ...p, whatsapp: e.target.value.replace(/\D/g, "") }))} placeholder="5565999990000" maxLength={15} />
                  <div style={{ fontSize: 11, color: "#888", marginTop: 3 }}>DDI + DDD + número, sem espaços. Ex: 5565999990000</div>
                </div>

                {!editUser && (
                  <div>
                    <label style={lbl}>Senha provisória *</label>
                    <div style={{ position: "relative" }}>
                      <input
                        style={{ ...inp, paddingRight: 40 }}
                        type={senhaVisivel ? "text" : "password"}
                        value={fUser.senha}
                        onChange={e => setFUser(p => ({ ...p, senha: e.target.value }))}
                        placeholder="Mín. 6 caracteres"
                      />
                      <button type="button" onClick={() => setSenhaVisivel(v => !v)}
                        style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", fontSize: 14, color: "#888" }}>
                        {senhaVisivel ? "🙈" : "👁"}
                      </button>
                    </div>
                    <div style={{ fontSize: 11, color: "#888", marginTop: 4 }}>O usuário será solicitado a trocar essa senha no primeiro acesso.</div>
                  </div>
                )}

                <div>
                  <label style={lbl}>Grupo de acesso</label>
                  <select style={inp} value={fUser.grupo_id} onChange={e => setFUser(p => ({ ...p, grupo_id: e.target.value }))}>
                    <option value="">Sem grupo (sem acesso)</option>
                    {grupos.map(g => <option key={g.id} value={g.id}>{g.nome}</option>)}
                  </select>
                  {fUser.grupo_id && (
                    <div style={{ marginTop: 6, padding: "8px 12px", background: "#EFF3FA", borderRadius: 8, fontSize: 11, color: "#555" }}>
                      {(() => {
                        const g = grupos.find(x => x.id === fUser.grupo_id)!;
                        if (!g) return null;
                        const res = resumoPerms(g);
                        return `${g.nome}: acesso a ${res.comAcesso} de ${res.total} módulos`;
                      })()}
                    </div>
                  )}
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <input type="checkbox" id="ativo" checked={fUser.ativo} onChange={e => setFUser(p => ({ ...p, ativo: e.target.checked }))} />
                  <label htmlFor="ativo" style={{ fontSize: 13, color: "#1a1a1a", cursor: "pointer" }}>Usuário ativo</label>
                </div>

                {!editUser && (
                  <div style={{ background: "#F4F6FA", border: "0.5px solid #DDE2EE", borderRadius: 8, padding: "12px 14px" }}>
                    <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                      <input type="checkbox" id="enviarEmail" checked={fUser.enviarEmail} onChange={e => setFUser(p => ({ ...p, enviarEmail: e.target.checked }))} style={{ marginTop: 2 }} />
                      <label htmlFor="enviarEmail" style={{ fontSize: 13, color: "#1a1a1a", cursor: "pointer", lineHeight: 1.4 }}>
                        <span style={{ fontWeight: 600 }}>Enviar e-mail de boas-vindas</span>
                        <span style={{ display: "block", fontSize: 11, color: "#555", marginTop: 2 }}>
                          Envia e-mail para <strong>{fUser.email || "o endereço acima"}</strong> com as credenciais de acesso.
                        </span>
                      </label>
                    </div>
                  </div>
                )}
              </div>

              <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 20 }}>
                <button style={btnR} onClick={() => setModalUser(false)}>Cancelar</button>
                <button
                  style={{ ...btnV, opacity: salvando || !fUser.nome.trim() || !fUser.email.trim() || (!editUser && !fUser.senha.trim()) ? 0.5 : 1 }}
                  disabled={salvando || !fUser.nome.trim() || !fUser.email.trim() || (!editUser && !fUser.senha.trim())}
                  onClick={salvarUser}
                >
                  {salvando ? "Criando…" : editUser ? "Salvar" : "Criar Usuário"}
                </button>
              </div>
            </>
          )}
        </Modal>
      )}
    </div>
  );
}
