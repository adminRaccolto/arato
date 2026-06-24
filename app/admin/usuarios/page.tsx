"use client";
import { useState, useEffect } from "react";
import { useAuth } from "../../../components/AuthProvider";
import { supabase } from "../../../lib/supabase";
import type { GrupoUsuario, Usuario } from "../../../lib/supabase";

// ── Estrutura de permissões ────────────────────────────────────────────────────
// Cada módulo tem ações individuais que podem ser ligadas/desligadas
type Acao = "visualizar" | "criar" | "editar" | "excluir" | "exportar" | "aprovar";

interface ModuloPermissao {
  id: string;
  label: string;
  grupo: string;
  acoes: Acao[];  // quais ações fazem sentido para este módulo
}

const MODULOS_PERM: ModuloPermissao[] = [
  // Campo & Lavoura
  { id: "propriedades",     label: "Propriedades & Talhões",    grupo: "Campo",      acoes: ["visualizar","criar","editar","excluir"] },
  { id: "lavoura_plantio",  label: "Lavoura — Plantio",         grupo: "Campo",      acoes: ["visualizar","criar","editar","excluir"] },
  { id: "lavoura_pulv",     label: "Lavoura — Pulverização",    grupo: "Campo",      acoes: ["visualizar","criar","editar","excluir"] },
  { id: "lavoura_colheita", label: "Lavoura — Colheita",        grupo: "Campo",      acoes: ["visualizar","criar","editar","excluir","aprovar"] },
  { id: "lavoura_plan",     label: "Lavoura — Planejamento",    grupo: "Campo",      acoes: ["visualizar","criar","editar","excluir"] },
  // Comercial
  { id: "contratos",        label: "Comercialização de Grãos",  grupo: "Comercial",  acoes: ["visualizar","criar","editar","excluir","aprovar"] },
  { id: "expedicao",        label: "Expedição de Grãos",        grupo: "Comercial",  acoes: ["visualizar","criar","editar","excluir"] },
  { id: "arrendamento",     label: "Contratos de Arrendamento", grupo: "Comercial",  acoes: ["visualizar","criar","editar","excluir"] },
  // Estoque & Compras
  { id: "estoque",          label: "Estoque",                   grupo: "Estoque",    acoes: ["visualizar","criar","editar","excluir"] },
  { id: "compras",          label: "Pedidos de Compra",         grupo: "Estoque",    acoes: ["visualizar","criar","editar","excluir","aprovar"] },
  { id: "nf_entrada",       label: "NF de Entrada (Produtos)",  grupo: "Estoque",    acoes: ["visualizar","criar","editar","excluir"] },
  { id: "nf_servico",       label: "NF de Serviços",            grupo: "Estoque",    acoes: ["visualizar","criar","editar","excluir"] },
  // Financeiro
  { id: "fin_receber",      label: "Contas a Receber",          grupo: "Financeiro", acoes: ["visualizar","criar","editar","excluir","aprovar"] },
  { id: "fin_pagar",        label: "Contas a Pagar",            grupo: "Financeiro", acoes: ["visualizar","criar","editar","excluir","aprovar"] },
  { id: "fin_contratos",    label: "Contratos Financeiros",     grupo: "Financeiro", acoes: ["visualizar","criar","editar","excluir"] },
  { id: "fin_tesouraria",   label: "Tesouraria",                grupo: "Financeiro", acoes: ["visualizar","criar","editar","excluir"] },
  { id: "fin_seguros",      label: "Seguros",                   grupo: "Financeiro", acoes: ["visualizar","criar","editar","excluir"] },
  // Fiscal
  { id: "fiscal_nfe",       label: "Emissão NF-e",              grupo: "Fiscal",     acoes: ["visualizar","criar","aprovar"] },
  { id: "fiscal_sped",      label: "SPED / LCDPR",              grupo: "Fiscal",     acoes: ["visualizar","exportar"] },
  { id: "transporte",       label: "CT-e e MDF-e",              grupo: "Fiscal",     acoes: ["visualizar","criar","editar","excluir","aprovar"] },
  // Análise
  { id: "custos",           label: "Custos & DRE",              grupo: "Análise",    acoes: ["visualizar","exportar"] },
  { id: "fin_relatorios",   label: "Relatórios Financeiros",    grupo: "Análise",    acoes: ["visualizar","exportar"] },
  { id: "bi",               label: "BI — Raccolto Intelligence",grupo: "Análise",    acoes: ["visualizar"] },
  // Cadastros
  { id: "cadastros",           label: "Cadastros (tabelas auxiliares)", grupo: "Admin",          acoes: ["visualizar","criar","editar","excluir"] },
  // Configurações — cada sub-módulo é controlável individualmente
  { id: "conf_empresa",        label: "Empresa & Certificado A1",       grupo: "Configurações",  acoes: ["visualizar","editar"] },
  { id: "conf_fiscal",         label: "Parâmetros Fiscais (NF-e/MDF-e)",grupo: "Configurações",  acoes: ["visualizar","editar"] },
  { id: "conf_financeiro",     label: "Config. Financeira (Plano/Oper)",grupo: "Configurações",  acoes: ["visualizar","editar"] },
  { id: "conf_contabilidade",  label: "Configuração Contábil",          grupo: "Configurações",  acoes: ["visualizar","editar"] },
  { id: "conf_sistema",        label: "Sistema (Automações/Integrações)",grupo: "Configurações", acoes: ["visualizar","editar"] },
  { id: "conf_importacao",     label: "Importação de Dados",            grupo: "Configurações",  acoes: ["visualizar","criar"] },
  { id: "usuarios",            label: "Usuários & Permissões",          grupo: "Configurações",  acoes: ["visualizar","criar","editar","excluir"] },
  { id: "logs",                label: "Log do Sistema",                 grupo: "Configurações",  acoes: ["visualizar","exportar"] },
];

// Perfis predefinidos
const PERFIS_PRESET: Record<string, { label: string; cor: string; descricao: string; permissoes: Record<string, Acao[]> }> = {
  admin: {
    label: "Administrador", cor: "#E24B4A",
    descricao: "Acesso total a todos os módulos e configurações do sistema.",
    permissoes: Object.fromEntries(MODULOS_PERM.map(m => [m.id, [...m.acoes]])),
  },
  gerente: {
    label: "Gerente Geral", cor: "#1A4870",
    descricao: "Acesso completo às operações. Gerencia usuários e permissões. Sem acesso a parâmetros fiscais e integrações.",
    permissoes: Object.fromEntries(MODULOS_PERM.map(m => [m.id,
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

// Ação → cor e label
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
        // Migrar formato legado ("leitura"/"escrita"/"admin"/"nenhum")
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

// ── Helpers / estilos ──────────────────────────────────────────────────────────
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

// ── Componente da matriz de permissões ─────────────────────────────────────────
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
                {/* Linha de grupo */}
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
                {/* Linhas de módulo */}
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

// ── Página principal ───────────────────────────────────────────────────────────
export default function AdminUsuarios() {
  const { fazendaId, contaId, userRole } = useAuth();
  const [fazendaInfo, setFazendaInfo] = useState<{ nome: string; municipio: string; estado: string } | null>(null);

  const [aba, setAba]             = useState<"grupos"|"usuarios">("grupos");

  // ── Acesso Raccolto (LGPD) ──────────────────────────────────────────────────
  const [raccoltoAcesso,   setRaccoltoAcesso]   = useState<boolean>(false);
  const [salvandoRaccolto, setSalvandoRaccolto] = useState(false);

  useEffect(() => {
    if (!fazendaId) return;
    supabase.from("fazendas").select("nome, municipio, estado").eq("id", fazendaId).single()
      .then(({ data }) => { if (data) setFazendaInfo({ nome: data.nome, municipio: data.municipio ?? "", estado: data.estado ?? "" }); });
  }, [fazendaId]);

  useEffect(() => {
    if (!fazendaId) return;
    supabase.from("fazendas").select("raccolto_acesso").eq("id", fazendaId).single()
      .then(({ data }) => {
        if (data) setRaccoltoAcesso(!!(data as { raccolto_acesso?: boolean }).raccolto_acesso);
      });
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
      if (res.ok) {
        setRaccoltoAcesso(novoValor);
      } else {
        setErro("Erro ao alterar acesso Raccolto: " + (json.error ?? res.statusText));
      }
    } catch (e) {
      setErro("Erro de conexão ao alterar acesso Raccolto.");
    }
    setSalvandoRaccolto(false);
  };
  const [grupos, setGrupos]       = useState<GrupoUsuario[]>([]);
  const [usuarios, setUsuarios]   = useState<Usuario[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando]   = useState(false);
  const [erro, setErro]           = useState<string | null>(null);

  // Modais
  const [modalGrupo, setModalGrupo] = useState(false);
  const [editGrupo, setEditGrupo]   = useState<GrupoUsuario | null>(null);
  const [fGrupo, setFGrupo]         = useState({ nome: "", descricao: "" });
  const [permGrupo, setPermGrupo]   = useState<PermMap>(permEmpty());

  const [modalUser, setModalUser]   = useState(false);
  const [editUser, setEditUser]     = useState<Usuario | null>(null);
  const [fUser, setFUser]           = useState({ nome: "", email: "", senha: "Arato@123", grupo_id: "", ativo: true, enviarEmail: true, whatsapp: "", hub_acesso: "raccotlo_gestor" });
  const [senhaVisivel, setSenhaVisivel] = useState(false);
  const [resultadoCriacao, setResultadoCriacao] = useState<{ ok: boolean; emailEnviado?: boolean; erro?: string } | null>(null);

  // ── Criar Novo Cliente (raccotlo only) ────────────────────────────────────
  const [modalNovoCliente, setModalNovoCliente] = useState(false);
  const [criandoCliente,   setCriandoCliente]   = useState(false);
  const [resultCliente,    setResultCliente]    = useState<{ ok: boolean; erro?: string; email?: string } | null>(null);
  const [fCliente, setFCliente] = useState({
    tipo: "pj", nome: "", cpf_cnpj: "", email_cliente: "", telefone: "",
    municipio_cliente: "", estado_cliente: "",
    fazenda_nome: "", fazenda_municipio: "", fazenda_estado: "", fazenda_area: "",
    user_nome: "", user_email: "", user_senha: "Arato@123",
  });

  async function criarNovoCliente() {
    setCriandoCliente(true); setResultCliente(null);
    try {
      const res = await fetch("/api/admin/criar-cliente-interno", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...fCliente, onboarding_ativo: true }),
      });
      const json = await res.json();
      if (json.ok) {
        setResultCliente({ ok: true, email: fCliente.user_email });
      } else {
        setResultCliente({ ok: false, erro: json.error ?? "Erro desconhecido" });
      }
    } catch (e) {
      setResultCliente({ ok: false, erro: String(e) });
    }
    setCriandoCliente(false);
  }

  // Carrega equipe Raccotlo de perfis (via API route com service_role_key)
  const carregarEquipe = () => {
    setCarregando(true);
    fetch("/api/admin/equipe-raccotlo")
      .then(r => r.json())
      .then(json => setUsuarios((json.data ?? []) as Usuario[]))
      .catch(() => setUsuarios([]))
      .finally(() => setCarregando(false));
  };

  useEffect(() => { carregarEquipe(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Grupo — abrir modal ──
  const abrirModalGrupo = (g?: GrupoUsuario) => {
    setEditGrupo(g ?? null);
    setFGrupo({ nome: g?.nome ?? "", descricao: g?.descricao ?? "" });
    setPermGrupo(g ? permFromGrupo(g) : permEmpty());
    setPresetAtivo(null);
    setModalGrupo(true);
  };

  // ── Grupo — salvar ──
  const salvarGrupo = async () => {
    if (!fGrupo.nome.trim()) return;
    setSalvando(true);
    const payload = { fazenda_id: fazendaId, nome: fGrupo.nome.trim(), descricao: fGrupo.descricao, permissoes: permGrupo };
    const { error } = editGrupo
      ? await supabase.from("grupos_usuarios").update(payload).eq("id", editGrupo.id)
      : await supabase.from("grupos_usuarios").insert(payload);
    if (error) { setErro(error.message); setSalvando(false); return; }
    const { data } = await supabase.from("grupos_usuarios").select("*").eq("fazenda_id", fazendaId).order("nome");
    setGrupos((data ?? []) as GrupoUsuario[]);
    setModalGrupo(false);
    setSalvando(false);
  };

  // ── Grupo — excluir ──
  const excluirGrupo = async (id: string) => {
    if (!confirm("Excluir este grupo? Os usuários vinculados perderão o grupo.")) return;
    await supabase.from("grupos_usuarios").delete().eq("id", id);
    setGrupos(prev => prev.filter(g => g.id !== id));
  };

  // ── Grupo — aplicar preset ──
  const [presetAtivo, setPresetAtivo] = useState<string | null>(null);
  const aplicarPreset = (presetId: string) => {
    const p = PERFIS_PRESET[presetId];
    if (!p) return;
    setPermGrupo({ ...permEmpty(), ...p.permissoes });
    setPresetAtivo(presetId);
    // Sugere nome e descrição se o campo estiver vazio
    if (!fGrupo.nome.trim()) setFGrupo(f => ({ ...f, nome: p.label }));
    if (!fGrupo.descricao.trim()) setFGrupo(f => ({ ...f, descricao: p.descricao }));
  };

  // ── Usuário — abrir modal ──
  const abrirModalUser = (u?: Usuario) => {
    setEditUser(u ?? null);
    setFUser({ nome: u?.nome ?? "", email: u?.email ?? "", senha: "Arato@123", grupo_id: u?.grupo_id ?? "", ativo: u?.ativo !== false, enviarEmail: true, whatsapp: (u as any)?.whatsapp ?? "", hub_acesso: (u as any)?.hub_acesso ?? "raccotlo_gestor" });
    setSenhaVisivel(false);
    setResultadoCriacao(null);
    setModalUser(true);
  };

  // ── Usuário — salvar (equipe Raccotlo — sem fazenda_id obrigatório) ──
  const salvarUser = async () => {
    if (!fUser.nome.trim() || !fUser.email.trim()) return;
    setSalvando(true);
    setResultadoCriacao(null);

    if (editUser) {
      // Edição: atualiza nome/ativo/whatsapp na tabela usuarios (se existir)
      if (editUser.id) {
        const payload = { nome: fUser.nome.trim(), ativo: fUser.ativo, whatsapp: fUser.whatsapp.trim() || null, hub_acesso: fUser.hub_acesso || null };
        await supabase.from("usuarios").update(payload).eq("id", editUser.id);
      }
      // Sempre atualiza o role no perfil
      const res = await fetch("/api/admin/atualizar-hub-acesso", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: fUser.email.trim(), hub_acesso: fUser.hub_acesso || "client" }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) { setErro(json.error ?? "Erro ao atualizar acesso."); setSalvando(false); return; }
    } else {
      // Novo usuário raccotlo: cria Auth + perfil (sem fazenda_id, sem usuarios table)
      if (!fUser.senha.trim() || fUser.senha.trim().length < 6) {
        setErro("Senha deve ter pelo menos 6 caracteres.");
        setSalvando(false);
        return;
      }
      const res = await fetch("/api/admin/criar-usuario-raccotlo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_nome:    fUser.nome.trim(),
          user_email:   fUser.email.trim(),
          user_senha:   fUser.senha.trim(),
          hub_acesso:   fUser.hub_acesso || "client",
          whatsapp:     fUser.whatsapp.trim() || null,
          enviar_email: fUser.enviarEmail,
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

    carregarEquipe();
    if (editUser) setModalUser(false);
    setSalvando(false);
  };

  // ── Usuário — revogar acesso raccotlo (muda role para 'client') ──
  const excluirUser = async (id: string) => {
    if (!confirm("Revogar acesso raccotlo deste usuário?")) return;
    await fetch(`/api/admin/equipe-raccotlo?user_id=${id}`, { method: "DELETE" });
    setUsuarios(prev => prev.filter(u => u.id !== id));
  };

  // ── Resumo de permissões para card ──
  const resumoPerms = (g: GrupoUsuario) => {
    const perms = permFromGrupo(g);
    const total = MODULOS_PERM.length;
    const comAcesso = MODULOS_PERM.filter(m => (perms[m.id] ?? []).length > 0).length;
    const admin = MODULOS_PERM.filter(m => (perms[m.id] ?? []).length === m.acoes.length).length;
    return { total, comAcesso, admin };
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh", background: "#F3F6F9", fontFamily: "system-ui, sans-serif", fontSize: 13 }}>

      <main style={{ flex: 1, display: "flex", flexDirection: "column" }}>

        {/* Cabeçalho */}
        <header style={{ background: "#fff", borderBottom: "0.5px solid #D4DCE8", padding: "10px 22px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 17, fontWeight: 600, color: "#1a1a1a" }}>Equipe Raccotlo</h1>
            <p style={{ margin: 0, fontSize: 11, color: "#555" }}>Usuários internos da Raccotlo e seus níveis de acesso ao HUB</p>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            {userRole === "raccotlo" && (
              <button
                onClick={() => { setModalNovoCliente(true); setResultCliente(null); }}
                style={{ ...btnV, fontSize: 12, background: "#16A34A" }}>
                + Novo Cliente
              </button>
            )}
            <button onClick={() => abrirModalUser()} style={{ ...btnV, fontSize: 12 }}>
              + Novo Usuário
            </button>
          </div>
        </header>

        <div style={{ padding: "16px 22px", flex: 1 }}>

          {erro && (
            <div style={{ background: "#FCEBEB", border: "0.5px solid #E24B4A50", borderRadius: 8, padding: "10px 16px", marginBottom: 14, fontSize: 12, color: "#791F1F" }}>
              ⚠ {erro} <button onClick={() => setErro(null)} style={{ background: "none", border: "none", color: "#791F1F", cursor: "pointer", marginLeft: 8 }}>✕</button>
            </div>
          )}

          {/* LEGENDA DOS NÍVEIS */}
          <div style={{ display: "flex", gap: 10, marginBottom: 14 }}>
            {[
              { role: "raccotlo", label: "Superadmin", cor: "#7A5A12", bg: "#FBF3E0", desc: "Acesso total ao sistema" },
              { role: "raccotlo_gestor", label: "Hub Completo", cor: "#1A4870", bg: "#D5E8F5", desc: "Gestão Arato + Seletor" },
              { role: "raccotlo_seletor", label: "Seletor", cor: "#378ADD", bg: "#EFF6FF", desc: "Apenas Seletor de Clientes" },
              { role: "client", label: "Sem Acesso", cor: "#888", bg: "#F3F4F6", desc: "Sem acesso interno" },
            ].map(n => (
              <div key={n.role} style={{ padding: "7px 12px", background: n.bg, border: `0.5px solid ${n.cor}40`, borderRadius: 8, fontSize: 11 }}>
                <span style={{ fontWeight: 700, color: n.cor }}>{n.label}</span>
                <span style={{ color: "#666", marginLeft: 6 }}>{n.desc}</span>
              </div>
            ))}
          </div>

          {/* TABELA DE USUÁRIOS (sem abas — só equipe Raccotlo) */}
          <div style={{ background: "#fff", border: "0.5px solid #D4DCE8", borderRadius: 12, overflow: "hidden" }}>
            {/* placeholder falso para manter compatibilidade de estrutura */}
            {false && (
              <div style={{ display: "flex", background: "#fff", borderRadius: "12px 12px 0 0", border: "0.5px solid #D4DCE8", marginBottom: 0 }}>
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
            )}

          {/* ── USUÁRIOS ── */}
          {true && (
            <div style={{ background: "#fff", border: "none", borderRadius: 12, overflow: "hidden" }}>
              {/* bloco removido: Acesso Raccolto — pertence ao ambiente do cliente, não ao admin */}

              {carregando ? (
                <div style={{ padding: 40, textAlign: "center", color: "#888" }}>Carregando…</div>
              ) : (
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                  <thead>
                    <tr style={{ background: "#F4F6FA" }}>
                      {["Nome", "E-mail", "Acesso HUB", "Status", ""].map(h => (
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
                      const hub = (u as any).hub_acesso as string | null;
                      const hubCfg = hub === "raccotlo_gestor"  ? { label: "Hub Completo",   cor: "#1A4870", bg: "#D5E8F5" }
                                   : hub === "raccotlo_seletor" ? { label: "Seletor",         cor: "#378ADD", bg: "#EFF6FF" }
                                   : hub === "raccotlo"         ? { label: "Superadmin",      cor: "#7A5A12", bg: "#FBF3E0" }
                                   :                             { label: "Sem Acesso",        cor: "#888",    bg: "#F3F4F6" };
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
                            <span style={{ fontSize: 11, background: hubCfg.bg, color: hubCfg.cor, padding: "3px 10px", borderRadius: 10, fontWeight: 600 }}>{hubCfg.label}</span>
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
        </div>
      </main>

      {/* ── Modal Usuário ── */}
      {modalUser && (
        <Modal titulo={editUser ? "Editar Usuário" : "Novo Usuário"} onClose={() => setModalUser(false)} width={520}>

          {/* Resultado de criação (novo usuário) */}
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
                  <input
                    style={inp}
                    type="tel"
                    value={fUser.whatsapp}
                    onChange={e => setFUser(p => ({ ...p, whatsapp: e.target.value.replace(/\D/g, "") }))}
                    placeholder="5565999990000"
                    maxLength={15}
                  />
                  <div style={{ fontSize: 11, color: "#888", marginTop: 3 }}>DDI + DDD + número, sem espaços. Ex: 5565999990000</div>
                </div>

                {/* Senha — só para novo usuário */}
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
                      <button
                        type="button"
                        onClick={() => setSenhaVisivel(v => !v)}
                        style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", fontSize: 14, color: "#888" }}
                      >
                        {senhaVisivel ? "🙈" : "👁"}
                      </button>
                    </div>
                    <div style={{ fontSize: 11, color: "#888", marginTop: 4 }}>
                      O usuário será solicitado a trocar essa senha no primeiro acesso.
                    </div>
                  </div>
                )}

                <div>
                  <label style={lbl}>Acesso HUB Raccotlo *</label>
                  <select style={inp} value={fUser.hub_acesso} onChange={e => setFUser(p => ({ ...p, hub_acesso: e.target.value }))}>
                    <option value="raccotlo_gestor">Hub Completo (Gestão Arato + Seletor de Clientes)</option>
                    <option value="raccotlo_seletor">Seletor de Clientes apenas</option>
                    <option value="client">Sem Acesso Interno</option>
                  </select>
                  <div style={{ fontSize: 11, color: "#888", marginTop: 3 }}>
                    {fUser.hub_acesso === "raccotlo_gestor" && "Acessa o painel admin (Gestão Arato) e pode visualizar ambientes de clientes."}
                    {fUser.hub_acesso === "raccotlo_seletor" && "Pode acessar ambientes de clientes via Seletor, mas não acessa o painel admin."}
                    {fUser.hub_acesso === "client" && "Nenhum acesso especial Raccotlo. Usuário comum sem painel administrativo."}
                  </div>
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <input type="checkbox" id="ativo" checked={fUser.ativo} onChange={e => setFUser(p => ({ ...p, ativo: e.target.checked }))} />
                  <label htmlFor="ativo" style={{ fontSize: 13, color: "#1a1a1a", cursor: "pointer" }}>Usuário ativo</label>
                </div>

                {/* Enviar email — só para novo usuário */}
                {!editUser && (
                  <div style={{ background: "#F4F6FA", border: "0.5px solid #DDE2EE", borderRadius: 8, padding: "12px 14px" }}>
                    <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                      <input
                        type="checkbox"
                        id="enviarEmail"
                        checked={fUser.enviarEmail}
                        onChange={e => setFUser(p => ({ ...p, enviarEmail: e.target.checked }))}
                        style={{ marginTop: 2 }}
                      />
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

      {/* ── Modal Criar Novo Cliente (raccotlo only) ── */}
      {modalNovoCliente && (
        <Modal titulo="Criar Novo Cliente" onClose={() => setModalNovoCliente(false)} width={720}>
          {resultCliente ? (
            <div style={{ padding: "32px 24px", textAlign: "center" }}>
              {resultCliente.ok ? (
                <>
                  <div style={{ fontSize: 48, marginBottom: 12 }}>✅</div>
                  <div style={{ fontSize: 17, fontWeight: 700, color: "#16A34A", marginBottom: 8 }}>Cliente criado com sucesso!</div>
                  <div style={{ fontSize: 13, color: "#555", marginBottom: 20 }}>
                    Usuário <strong>{resultCliente.email}</strong> criado com acesso ao Arato.
                  </div>
                  <button style={btnV} onClick={() => { setModalNovoCliente(false); setResultCliente(null); setFCliente({ tipo: "pj", nome: "", cpf_cnpj: "", email_cliente: "", telefone: "", municipio_cliente: "", estado_cliente: "", fazenda_nome: "", fazenda_municipio: "", fazenda_estado: "", fazenda_area: "", user_nome: "", user_email: "", user_senha: "Arato@123" }); }}>
                    Fechar
                  </button>
                </>
              ) : (
                <>
                  <div style={{ fontSize: 48, marginBottom: 12 }}>❌</div>
                  <div style={{ fontSize: 17, fontWeight: 700, color: "#E24B4A", marginBottom: 8 }}>Falha ao criar cliente</div>
                  <div style={{ fontSize: 12, color: "#555", background: "#FFF0F0", border: "0.5px solid #E24B4A50", borderRadius: 8, padding: "10px 14px", marginBottom: 20, textAlign: "left", wordBreak: "break-word" }}>
                    {resultCliente.erro}
                  </div>
                  <button style={btnR} onClick={() => setResultCliente(null)}>Tentar novamente</button>
                </>
              )}
            </div>
          ) : (
            <div style={{ padding: "20px 24px", display: "flex", flexDirection: "column", gap: 20 }}>

              {/* Produtor */}
              <div>
                <div style={{ fontSize: 12, fontWeight: 600, color: "#1A4870", marginBottom: 10, paddingBottom: 6, borderBottom: "0.5px solid #DDE2EE" }}>Produtor / Empresa</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
                  <div>
                    <label style={lbl}>Tipo *</label>
                    <select value={fCliente.tipo} onChange={e => setFCliente(p => ({ ...p, tipo: e.target.value }))} style={inp}>
                      <option value="pf">Pessoa Física</option>
                      <option value="pj">Pessoa Jurídica</option>
                    </select>
                  </div>
                  <div style={{ gridColumn: "span 2" }}>
                    <label style={lbl}>Nome / Razão Social *</label>
                    <input style={inp} value={fCliente.nome} onChange={e => setFCliente(p => ({ ...p, nome: e.target.value }))} placeholder="Fazenda São João Ltda" />
                  </div>
                  <div>
                    <label style={lbl}>CPF / CNPJ</label>
                    <input style={inp} value={fCliente.cpf_cnpj} onChange={e => setFCliente(p => ({ ...p, cpf_cnpj: e.target.value }))} placeholder="00.000.000/0001-00" />
                  </div>
                  <div>
                    <label style={lbl}>E-mail do produtor</label>
                    <input style={inp} type="email" value={fCliente.email_cliente} onChange={e => setFCliente(p => ({ ...p, email_cliente: e.target.value }))} placeholder="produtor@fazenda.com" />
                  </div>
                  <div>
                    <label style={lbl}>Telefone</label>
                    <input style={inp} value={fCliente.telefone} onChange={e => setFCliente(p => ({ ...p, telefone: e.target.value }))} placeholder="(65) 99999-0000" />
                  </div>
                  <div>
                    <label style={lbl}>Município</label>
                    <input style={inp} value={fCliente.municipio_cliente} onChange={e => setFCliente(p => ({ ...p, municipio_cliente: e.target.value }))} placeholder="Nova Mutum" />
                  </div>
                  <div>
                    <label style={lbl}>Estado</label>
                    <input style={inp} value={fCliente.estado_cliente} onChange={e => setFCliente(p => ({ ...p, estado_cliente: e.target.value }))} placeholder="MT" maxLength={2} />
                  </div>
                </div>
              </div>

              {/* Fazenda */}
              <div>
                <div style={{ fontSize: 12, fontWeight: 600, color: "#1A4870", marginBottom: 10, paddingBottom: 6, borderBottom: "0.5px solid #DDE2EE" }}>Fazenda</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
                  <div style={{ gridColumn: "span 2" }}>
                    <label style={lbl}>Nome da Fazenda *</label>
                    <input style={inp} value={fCliente.fazenda_nome} onChange={e => setFCliente(p => ({ ...p, fazenda_nome: e.target.value }))} placeholder="Fazenda Santa Cruz" />
                  </div>
                  <div>
                    <label style={lbl}>Área Total (ha)</label>
                    <input style={inp} type="number" value={fCliente.fazenda_area} onChange={e => setFCliente(p => ({ ...p, fazenda_area: e.target.value }))} placeholder="1500" />
                  </div>
                  <div>
                    <label style={lbl}>Município da Fazenda</label>
                    <input style={inp} value={fCliente.fazenda_municipio} onChange={e => setFCliente(p => ({ ...p, fazenda_municipio: e.target.value }))} placeholder="Sorriso" />
                  </div>
                  <div>
                    <label style={lbl}>Estado</label>
                    <input style={inp} value={fCliente.fazenda_estado} onChange={e => setFCliente(p => ({ ...p, fazenda_estado: e.target.value }))} placeholder="MT" maxLength={2} />
                  </div>
                </div>
              </div>

              {/* Usuário de acesso */}
              <div>
                <div style={{ fontSize: 12, fontWeight: 600, color: "#1A4870", marginBottom: 10, paddingBottom: 6, borderBottom: "0.5px solid #DDE2EE" }}>Usuário de Acesso ao Arato</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
                  <div>
                    <label style={lbl}>Nome do usuário *</label>
                    <input style={inp} value={fCliente.user_nome} onChange={e => setFCliente(p => ({ ...p, user_nome: e.target.value }))} placeholder="João da Silva" />
                  </div>
                  <div>
                    <label style={lbl}>E-mail de login *</label>
                    <input style={inp} type="email" value={fCliente.user_email} onChange={e => setFCliente(p => ({ ...p, user_email: e.target.value }))} placeholder="joao@fazenda.com" />
                  </div>
                  <div>
                    <label style={lbl}>Senha provisória *</label>
                    <input style={inp} value={fCliente.user_senha} onChange={e => setFCliente(p => ({ ...p, user_senha: e.target.value }))} placeholder="Arato@123" />
                  </div>
                </div>
                <div style={{ marginTop: 8, padding: "8px 12px", background: "#FBF3E0", borderRadius: 8, fontSize: 11, color: "#7A5A12" }}>
                  O usuário receberá e-mail com as credenciais e será obrigado a trocar a senha no primeiro acesso.
                </div>
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, paddingTop: 4 }}>
                <button style={btnR} onClick={() => setModalNovoCliente(false)}>Cancelar</button>
                <button
                  style={{ ...btnV, background: "#16A34A", opacity: criandoCliente || !fCliente.nome.trim() || !fCliente.fazenda_nome.trim() || !fCliente.user_email.trim() || !fCliente.user_senha.trim() ? 0.5 : 1 }}
                  disabled={criandoCliente || !fCliente.nome.trim() || !fCliente.fazenda_nome.trim() || !fCliente.user_email.trim() || !fCliente.user_senha.trim()}
                  onClick={criarNovoCliente}
                >
                  {criandoCliente ? "Criando..." : "Criar Cliente"}
                </button>
              </div>
            </div>
          )}
        </Modal>
      )}
    </div>
  );
}
