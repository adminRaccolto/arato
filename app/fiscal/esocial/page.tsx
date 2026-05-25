"use client";
import { useState, useEffect } from "react";
import TopNav from "../../../components/TopNav";
import { useAuth } from "../../../components/AuthProvider";
import { supabase } from "../../../lib/supabase";
import { processarFolhaMensal } from "../../../lib/db";

// ─── Tipos ────────────────────────────────────────────────────
type VinculoTrabalhador = "clt" | "avulso_rural" | "tsve" | "meeiro" | "parceiro" | "estagiario";
type StatusTrabalhador  = "ativo" | "inativo" | "afastado";
type StatusEvento       = "pendente" | "transmitido" | "erro" | "excluido";

interface Trabalhador {
  id: string;
  fazenda_id: string;
  nome: string;
  cpf?: string;
  pis?: string;
  tipo_vinculo: VinculoTrabalhador;
  funcao?: string;
  data_admissao?: string;
  data_demissao?: string;
  salario_base?: number;
  status: StatusTrabalhador;
  created_at?: string;
}

interface EsocialEvento {
  id: string;
  fazenda_id: string;
  trabalhador_id?: string;
  codigo_evento: string;
  descricao_evento: string;
  competencia?: string;
  status: StatusEvento;
  protocolo?: string;
  recibo?: string;
  erro_descricao?: string;
  created_at?: string;
}

// ─── Constantes ───────────────────────────────────────────────
const VINCULOS: Record<VinculoTrabalhador, { label: string; cor: string; bg: string }> = {
  clt:          { label: "CLT",           cor: "#166534", bg: "#DCFCE7" },
  avulso_rural: { label: "Avulso Rural",  cor: "#92400E", bg: "#FEF3C7" },
  tsve:         { label: "TSVE",          cor: "#1E40AF", bg: "#DBEAFE" },
  meeiro:       { label: "Meeiro",        cor: "#5B21B6", bg: "#EDE9FE" },
  parceiro:     { label: "Parceiro",      cor: "#065F46", bg: "#D1FAE5" },
  estagiario:   { label: "Estagiário",    cor: "#555",    bg: "#F4F6FA" },
};

const STATUS_TRAB: Record<StatusTrabalhador, { label: string; cor: string; bg: string }> = {
  ativo:    { label: "Ativo",    cor: "#166534", bg: "#DCFCE7" },
  inativo:  { label: "Inativo",  cor: "#6B7280", bg: "#F3F4F6" },
  afastado: { label: "Afastado", cor: "#92400E", bg: "#FEF3C7" },
};

const STATUS_EVT: Record<StatusEvento, { label: string; cor: string; bg: string }> = {
  pendente:     { label: "Pendente",     cor: "#7A5A12", bg: "#FBF3E0" },
  transmitido:  { label: "Transmitido",  cor: "#166534", bg: "#DCFCE7" },
  erro:         { label: "Erro",         cor: "#991B1B", bg: "#FEE2E2" },
  excluido:     { label: "Excluído",     cor: "#6B7280", bg: "#F3F4F6" },
};

const EVENTOS_CATALOGO = [
  { codigo: "S-1000", descricao: "Informações do Empregador/Contribuinte"  },
  { codigo: "S-1005", descricao: "Tabela de Estabelecimentos e Obras"      },
  { codigo: "S-2200", descricao: "Admissão de Trabalhador (CLT)"            },
  { codigo: "S-2206", descricao: "Alteração Contratual"                    },
  { codigo: "S-2230", descricao: "Afastamento Temporário"                  },
  { codigo: "S-2299", descricao: "Desligamento"                            },
  { codigo: "S-2300", descricao: "Trabalhador Sem Vínculo (TSVE / Avulso)" },
  { codigo: "S-2306", descricao: "Alteração Contratual — TSVE"             },
  { codigo: "S-2399", descricao: "Término de TSVE"                         },
  { codigo: "S-1200", descricao: "Remuneração — Período de Apuração"       },
  { codigo: "S-1210", descricao: "Pagamentos de Rendimentos do Trabalhador"},
  { codigo: "S-2400", descricao: "Beneficiário — INSS (Aposentadoria Rural)"},
  { codigo: "S-3000", descricao: "Exclusão de Eventos"                     },
];

// Mapeamento tipo_vinculo eSocial ↔ tipo funcionarios
const VINCULO_TO_TIPO: Record<VinculoTrabalhador, string> = {
  clt:          "clt",
  avulso_rural: "diarista",
  tsve:         "empreiteiro",
  meeiro:       "outro",
  parceiro:     "outro",
  estagiario:   "outro",
};
const TIPO_TO_VINCULO: Record<string, VinculoTrabalhador> = {
  clt:         "clt",
  diarista:    "avulso_rural",
  empreiteiro: "tsve",
  outro:       "avulso_rural",
};

// Converte row de funcionarios para o modelo Trabalhador do eSocial
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function funcToTrab(f: any): Trabalhador {
  const vinculo = (f.tipo_vinculo_esocial as VinculoTrabalhador) ?? TIPO_TO_VINCULO[f.tipo as string] ?? "avulso_rural";
  return {
    id:            f.id,
    fazenda_id:    f.fazenda_id,
    nome:          f.nome,
    cpf:           f.cpf ?? undefined,
    pis:           f.pis_nis ?? undefined,
    tipo_vinculo:  vinculo,
    funcao:        f.funcao ?? undefined,
    data_admissao: f.data_admissao ?? undefined,
    data_demissao: f.data_demissao ?? undefined,
    salario_base:  f.salario_base ?? undefined,
    status:        f.data_demissao ? "inativo" : (f.ativo ? "ativo" : "inativo"),
    created_at:    f.created_at,
  };
}

const VAZIO_EVT: Omit<EsocialEvento, "id" | "fazenda_id" | "created_at"> = {
  codigo_evento: "", descricao_evento: "", competencia: "",
  trabalhador_id: "", status: "pendente",
};

// ─── Utilitários ──────────────────────────────────────────────
const fmt  = (v?: number) => (v ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fmtDt = (d?: string) => d ? new Date(d + "T12:00:00").toLocaleDateString("pt-BR") : "—";
const inp: React.CSSProperties  = { width: "100%", padding: "8px 10px", border: "0.5px solid #D4DCE8", borderRadius: 8, fontSize: 13, color: "#1a1a1a", background: "#fff", boxSizing: "border-box", outline: "none" };
const lbl: React.CSSProperties  = { fontSize: 11, color: "#555", marginBottom: 4, display: "block", fontWeight: 600 };
const card: React.CSSProperties = { background: "#fff", borderRadius: 12, border: "0.5px solid #DDE2EE", padding: "18px 22px" };

// ─── Componente ───────────────────────────────────────────────
export default function EsocialPage() {
  const { fazendaId } = useAuth();
  const [aba, setAba] = useState<"trabalhadores" | "eventos" | "apuracao">("trabalhadores");

  const [trabalhadores, setTrabalhadores] = useState<Trabalhador[]>([]);
  const [eventos,       setEventos]       = useState<EsocialEvento[]>([]);
  const [loading,       setLoading]       = useState(true);

  const [modalEvt,   setModalEvt]   = useState(false);
  const [formEvt,    setFormEvt]    = useState<typeof VAZIO_EVT>({ ...VAZIO_EVT });
  const [salvandoE,  setSalvandoE]  = useState(false);

  const [buscaTrab,  setBuscaTrab]  = useState("");
  const [filtroVinc, setFiltroVinc] = useState<string>("todos");
  const [competApuracao, setCompetApuracao] = useState(new Date().toISOString().substring(0, 7));

  const [gerandoFolha, setGerandoFolha] = useState(false);
  const [folhaMsg,     setFolhaMsg]     = useState<string | null>(null);

  // ── Carregar ──────────────────────────────────────────────
  async function carregar() {
    if (!fazendaId) return;
    // Trabalhadores: lê de funcionarios (fonte única de verdade)
    const [{ data: funcs }, { data: evts }] = await Promise.all([
      supabase.from("funcionarios").select("*").eq("fazenda_id", fazendaId).order("nome"),
      supabase.from("esocial_eventos").select("*").eq("fazenda_id", fazendaId).order("created_at", { ascending: false }),
    ]);
    setTrabalhadores((funcs ?? []).map(funcToTrab));
    setEventos((evts ?? []) as EsocialEvento[]);
    setLoading(false);
  }
  useEffect(() => { carregar(); }, [fazendaId]);

  // Mapa id → trabalhador para lookup em eventos
  const trabMap = Object.fromEntries(trabalhadores.map(t => [t.id, t]));

  async function desligarTrabalhador(t: Trabalhador) {
    const data = prompt("Data de desligamento (AAAA-MM-DD):", new Date().toISOString().split("T")[0]);
    if (!data) return;
    await supabase.from("funcionarios").update({ ativo: false, data_demissao: data }).eq("id", t.id);
    await supabase.from("esocial_eventos").insert({
      fazenda_id:      fazendaId,
      trabalhador_id:  t.id,
      codigo_evento:   t.tipo_vinculo === "clt" ? "S-2299" : "S-2399",
      descricao_evento: t.tipo_vinculo === "clt" ? "Desligamento" : "Término de TSVE",
      competencia:     data.substring(0, 7),
      status:          "pendente",
    });
    carregar();
  }

  // ── Eventos CRUD ──────────────────────────────────────────
  async function salvarEvt() {
    if (!fazendaId || !formEvt.codigo_evento) return;
    setSalvandoE(true);
    const cat = EVENTOS_CATALOGO.find(e => e.codigo === formEvt.codigo_evento);
    await supabase.from("esocial_eventos").insert({
      ...formEvt,
      fazenda_id:      fazendaId,
      descricao_evento: cat?.descricao ?? formEvt.codigo_evento,
    });
    setSalvandoE(false);
    setModalEvt(false);
    setFormEvt({ ...VAZIO_EVT });
    carregar();
  }

  async function transmitir(e: EsocialEvento) {
    const proto = `ES${Date.now().toString().slice(-8)}`;
    await supabase.from("esocial_eventos").update({ status: "transmitido", protocolo: proto }).eq("id", e.id);
    carregar();
  }

  // ── Gerar Folha → Contas a Pagar ──────────────────────────
  async function gerarFolha() {
    if (!fazendaId) return;
    setGerandoFolha(true);
    setFolhaMsg(null);
    try {
      const { gerados } = await processarFolhaMensal(fazendaId, competApuracao);
      setFolhaMsg(gerados > 0
        ? `${gerados} lançamento(s) gerado(s) em Contas a Pagar para ${competApuracao}.`
        : `Nenhum lançamento novo gerado — já existiam ou nenhum funcionário com salário cadastrado.`
      );
    } catch (e) {
      setFolhaMsg("Erro ao gerar folha: " + (e instanceof Error ? e.message : String(e)));
    }
    setGerandoFolha(false);
  }

  // ── Filtros ───────────────────────────────────────────────
  const listaTrabs = trabalhadores.filter(t => {
    if (filtroVinc !== "todos" && t.tipo_vinculo !== filtroVinc) return false;
    if (buscaTrab && !t.nome.toLowerCase().includes(buscaTrab.toLowerCase()) && !(t.cpf ?? "").includes(buscaTrab)) return false;
    return true;
  });

  const ativos   = trabalhadores.filter(t => t.status === "ativo");
  const clt      = ativos.filter(t => t.tipo_vinculo === "clt");
  const avulsos  = ativos.filter(t => t.tipo_vinculo === "avulso_rural" || t.tipo_vinculo === "tsve");
  const qtdPend  = eventos.filter(e => e.status === "pendente").length;

  // ── Apuração mensal ───────────────────────────────────────
  const trabsAtivosApuracao = ativos.filter(t => t.salario_base && t.salario_base > 0);
  const totalRemuneracao    = trabsAtivosApuracao.reduce((s, t) => s + (t.salario_base ?? 0), 0);
  const inssEmpregado       = trabsAtivosApuracao.reduce((s, t) => s + (t.salario_base ?? 0) * 0.08, 0);
  const funruralEmpregador  = totalRemuneracao * 0.015;
  const senarEmpregador     = totalRemuneracao * 0.002;
  const fgts                = clt.reduce((s, t) => s + (t.salario_base ?? 0) * 0.08, 0);

  return (
    <div style={{ minHeight: "100vh", background: "#F4F6FA", fontFamily: "system-ui, sans-serif" }}>
      <TopNav />
      <div style={{ maxWidth: 1200, margin: "0 auto", padding: "24px 20px" }}>

        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
          <div>
            <h1 style={{ fontSize: 20, fontWeight: 700, color: "#1a1a1a", margin: 0 }}>eSocial Rural</h1>
            <p style={{ fontSize: 13, color: "#666", margin: "4px 0 0" }}>
              Trabalhadores, eventos e apuração — Produtor Rural
            </p>
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            {aba === "trabalhadores" && (
              <a href="/cadastros?tab=funcionarios"
                style={{ padding: "9px 20px", background: "#F4F6FA", color: "#1A4870", border: "0.5px solid #B3D0E8", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer", textDecoration: "none", display: "inline-block" }}>
                Gerenciar em Cadastros →
              </a>
            )}
            {aba === "eventos" && (
              <button onClick={() => setModalEvt(true)}
                style={{ padding: "9px 20px", background: "#1A4870", color: "#fff", border: "none", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
                + Evento Manual
              </button>
            )}
          </div>
        </div>

        {/* KPIs */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 14, marginBottom: 22 }}>
          {[
            { label: "Trabalhadores Ativos", value: String(ativos.length), sub: `${clt.length} CLT · ${avulsos.length} avulsos`, cor: "#1A4870", bg: "#EAF3FB" },
            { label: "Eventos Pendentes",    value: String(qtdPend),        sub: "Aguardando transmissão", cor: qtdPend > 0 ? "#7A5A12" : "#555", bg: qtdPend > 0 ? "#FBF3E0" : "#F4F6FA" },
            { label: "Folha Mensal",         value: fmt(totalRemuneracao),  sub: "Remuneração total",      cor: "#1a1a1a", bg: "#fff" },
            { label: "FUNRURAL + SENAR",     value: fmt(funruralEmpregador + senarEmpregador), sub: "Encargos empregador", cor: "#555", bg: "#F4F6FA" },
          ].map((k, i) => (
            <div key={i} style={{ ...card, background: k.bg, borderColor: "transparent" }}>
              <div style={{ fontSize: 11, color: k.cor, fontWeight: 600, marginBottom: 6, opacity: 0.8 }}>{k.label}</div>
              <div style={{ fontSize: 22, fontWeight: 700, color: k.cor }}>{k.value}</div>
              <div style={{ fontSize: 11, color: k.cor, opacity: 0.6, marginTop: 2 }}>{k.sub}</div>
            </div>
          ))}
        </div>

        {/* Aviso integração */}
        <div style={{ background: "#EAF3FB", border: "0.5px solid #B3D0E8", borderRadius: 8, padding: "10px 16px", marginBottom: 16, fontSize: 12, color: "#1A4870", display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontWeight: 700 }}>ℹ</span>
          <span>Os trabalhadores listados aqui são os mesmos cadastrados em <strong>Cadastros → Funcionários</strong>. Qualquer alteração feita aqui ou lá é sincronizada automaticamente.</span>
        </div>

        {/* Abas */}
        <div style={{ display: "flex", gap: 2, marginBottom: 16, background: "#fff", borderRadius: 10, border: "0.5px solid #DDE2EE", padding: 4, width: "fit-content" }}>
          {[
            { id: "trabalhadores", label: "Trabalhadores" },
            { id: "eventos",       label: `Eventos${qtdPend > 0 ? ` (${qtdPend})` : ""}` },
            { id: "apuracao",      label: "Apuração Mensal" },
          ].map(a => (
            <button key={a.id} onClick={() => setAba(a.id as typeof aba)}
              style={{ padding: "7px 18px", borderRadius: 7, border: "none", cursor: "pointer", fontSize: 13, fontWeight: aba === a.id ? 700 : 400, background: aba === a.id ? "#1A4870" : "transparent", color: aba === a.id ? "#fff" : "#555" }}>
              {a.label}
            </button>
          ))}
        </div>

        {/* ── Aba Trabalhadores ── */}
        {aba === "trabalhadores" && (
          <>
            <div style={{ display: "flex", gap: 10, marginBottom: 14 }}>
              <input placeholder="Buscar por nome ou CPF..." value={buscaTrab} onChange={e => setBuscaTrab(e.target.value)} style={{ ...inp, width: 260 }} />
              <select value={filtroVinc} onChange={e => setFiltroVinc(e.target.value)} style={{ ...inp, width: 180 }}>
                <option value="todos">Todos os vínculos</option>
                {Object.entries(VINCULOS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
            </div>
            <div style={card}>
              {loading ? (
                <div style={{ textAlign: "center", padding: 40, color: "#888" }}>Carregando...</div>
              ) : listaTrabs.length === 0 ? (
                <div style={{ textAlign: "center", padding: 60, color: "#888" }}>
                  <div style={{ fontSize: 36, marginBottom: 12 }}>👷</div>
                  <div style={{ fontWeight: 600, marginBottom: 4 }}>Nenhum trabalhador cadastrado</div>
                  <div style={{ fontSize: 12, marginBottom: 14 }}>Acesse <strong>Cadastros → Funcionários</strong> para adicionar trabalhadores.</div>
                  <a href="/cadastros?tab=funcionarios" style={{ padding: "8px 18px", background: "#1A4870", color: "#fff", borderRadius: 8, fontSize: 12, fontWeight: 600, textDecoration: "none" }}>Ir para Cadastros → Funcionários</a>
                </div>
              ) : (
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                  <thead>
                    <tr style={{ background: "#F8FAFF" }}>
                      {["Nome","CPF","Vínculo","Função","Admissão","Salário Base","Status","Ações"].map(h => (
                        <th key={h} style={{ padding: "8px 10px", textAlign: "left", color: "#555", fontWeight: 600, borderBottom: "0.5px solid #DDE2EE", whiteSpace: "nowrap" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {listaTrabs.map((t, i) => {
                      const vc = VINCULOS[t.tipo_vinculo];
                      const sc = STATUS_TRAB[t.status];
                      return (
                        <tr key={t.id} style={{ background: i % 2 === 0 ? "#fff" : "#FAFBFC", borderBottom: "0.5px solid #F0F2F7" }}>
                          <td style={{ padding: "9px 10px", fontWeight: 600 }}>{t.nome}</td>
                          <td style={{ padding: "9px 10px", color: "#666" }}>{t.cpf || "—"}</td>
                          <td style={{ padding: "9px 10px" }}>
                            <span style={{ background: vc.bg, color: vc.cor, padding: "2px 8px", borderRadius: 12, fontSize: 11, fontWeight: 600 }}>{vc.label}</span>
                          </td>
                          <td style={{ padding: "9px 10px", color: "#555" }}>{t.funcao || "—"}</td>
                          <td style={{ padding: "9px 10px", color: "#555" }}>{fmtDt(t.data_admissao)}</td>
                          <td style={{ padding: "9px 10px", fontWeight: 600, color: "#1a1a1a" }}>{t.salario_base ? fmt(t.salario_base) : "—"}</td>
                          <td style={{ padding: "9px 10px" }}>
                            <span style={{ background: sc.bg, color: sc.cor, padding: "2px 8px", borderRadius: 12, fontSize: 11, fontWeight: 600 }}>{sc.label}</span>
                          </td>
                          <td style={{ padding: "9px 10px" }}>
                            <div style={{ display: "flex", gap: 6 }}>
                              <a href="/cadastros?tab=funcionarios"
                                style={{ padding: "3px 10px", background: "none", border: "0.5px solid #B3D0E8", borderRadius: 6, fontSize: 11, color: "#1A4870", cursor: "pointer", textDecoration: "none", display: "inline-block" }}>
                                Editar em Cadastros
                              </a>
                              {t.status === "ativo" && (
                                <button onClick={() => desligarTrabalhador(t)}
                                  style={{ padding: "3px 10px", background: "#FEE2E2", border: "0.5px solid #FCA5A5", borderRadius: 6, fontSize: 11, color: "#991B1B", cursor: "pointer" }}>
                                  Desligar
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
          </>
        )}

        {/* ── Aba Eventos ── */}
        {aba === "eventos" && (
          <div style={card}>
            {eventos.length === 0 ? (
              <div style={{ textAlign: "center", padding: 60, color: "#888" }}>
                <div style={{ fontSize: 36, marginBottom: 12 }}>📡</div>
                <div style={{ fontWeight: 600 }}>Nenhum evento gerado ainda</div>
                <div style={{ fontSize: 12, marginTop: 4 }}>Os eventos são gerados automaticamente ao admitir ou desligar trabalhadores.</div>
              </div>
            ) : (
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                <thead>
                  <tr style={{ background: "#F8FAFF" }}>
                    {["Evento","Descrição","Trabalhador","Competência","Status","Protocolo","Ações"].map(h => (
                      <th key={h} style={{ padding: "8px 10px", textAlign: "left", color: "#555", fontWeight: 600, borderBottom: "0.5px solid #DDE2EE", whiteSpace: "nowrap" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {eventos.map((e, i) => {
                    const sc   = STATUS_EVT[e.status];
                    const trab = e.trabalhador_id ? trabMap[e.trabalhador_id] : null;
                    return (
                      <tr key={e.id} style={{ background: i % 2 === 0 ? "#fff" : "#FAFBFC", borderBottom: "0.5px solid #F0F2F7" }}>
                        <td style={{ padding: "9px 10px" }}>
                          <span style={{ background: "#EAF3FB", color: "#1A4870", fontWeight: 700, padding: "2px 8px", borderRadius: 5, fontSize: 12 }}>{e.codigo_evento}</span>
                        </td>
                        <td style={{ padding: "9px 10px", color: "#555", maxWidth: 240, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{e.descricao_evento}</td>
                        <td style={{ padding: "9px 10px", fontWeight: 500 }}>{trab?.nome ?? "—"}</td>
                        <td style={{ padding: "9px 10px", color: "#555" }}>{e.competencia ?? "—"}</td>
                        <td style={{ padding: "9px 10px" }}>
                          <span style={{ background: sc.bg, color: sc.cor, padding: "2px 8px", borderRadius: 12, fontSize: 11, fontWeight: 600 }}>{sc.label}</span>
                        </td>
                        <td style={{ padding: "9px 10px", color: "#888", fontSize: 11 }}>{e.protocolo ?? "—"}</td>
                        <td style={{ padding: "9px 10px" }}>
                          {e.status === "pendente" && (
                            <button onClick={() => transmitir(e)}
                              style={{ padding: "3px 10px", background: "#1A4870", color: "#fff", border: "none", borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: "pointer" }}>
                              Transmitir
                            </button>
                          )}
                          {e.status === "erro" && (
                            <button onClick={() => transmitir(e)}
                              style={{ padding: "3px 10px", background: "#EF9F27", color: "#fff", border: "none", borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: "pointer" }}>
                              Reenviar
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
        )}

        {/* ── Aba Apuração ── */}
        {aba === "apuracao" && (
          <>
            <div style={{ display: "flex", gap: 10, marginBottom: 16, alignItems: "center" }}>
              <label style={{ fontSize: 13, color: "#555", fontWeight: 600 }}>Competência:</label>
              <input type="month" value={competApuracao} onChange={e => { setCompetApuracao(e.target.value); setFolhaMsg(null); }} style={{ ...inp, width: 160 }} />
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 16 }}>
              {/* Folha por trabalhador */}
              <div style={card}>
                <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 14, color: "#1a1a1a" }}>Folha de Pagamento — {competApuracao}</div>
                {trabsAtivosApuracao.length === 0 ? (
                  <div style={{ textAlign: "center", padding: 40, color: "#888", fontSize: 12 }}>
                    Nenhum trabalhador com salário base cadastrado.
                  </div>
                ) : (
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                    <thead>
                      <tr style={{ background: "#F8FAFF" }}>
                        {["Trabalhador","Vínculo","Salário Bruto","INSS Desc.","Salário Líquido"].map(h => (
                          <th key={h} style={{ padding: "7px 10px", textAlign: "left", color: "#555", fontWeight: 600, borderBottom: "0.5px solid #DDE2EE" }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {trabsAtivosApuracao.map((t, i) => {
                        const bruto    = t.salario_base ?? 0;
                        const descINSS = bruto * 0.08;
                        const liquido  = bruto - descINSS;
                        const vc       = VINCULOS[t.tipo_vinculo];
                        return (
                          <tr key={t.id} style={{ background: i % 2 === 0 ? "#fff" : "#FAFBFC", borderBottom: "0.5px solid #F0F2F7" }}>
                            <td style={{ padding: "8px 10px", fontWeight: 600 }}>{t.nome}</td>
                            <td style={{ padding: "8px 10px" }}>
                              <span style={{ background: vc.bg, color: vc.cor, padding: "2px 7px", borderRadius: 10, fontSize: 10, fontWeight: 600 }}>{vc.label}</span>
                            </td>
                            <td style={{ padding: "8px 10px" }}>{fmt(bruto)}</td>
                            <td style={{ padding: "8px 10px", color: "#991B1B" }}>({fmt(descINSS)})</td>
                            <td style={{ padding: "8px 10px", fontWeight: 700, color: "#166534" }}>{fmt(liquido)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot>
                      <tr style={{ background: "#F8FAFF", borderTop: "1px solid #DDE2EE" }}>
                        <td colSpan={2} style={{ padding: "8px 10px", fontWeight: 700, fontSize: 13 }}>TOTAL</td>
                        <td style={{ padding: "8px 10px", fontWeight: 700 }}>{fmt(totalRemuneracao)}</td>
                        <td style={{ padding: "8px 10px", fontWeight: 700, color: "#991B1B" }}>({fmt(inssEmpregado)})</td>
                        <td style={{ padding: "8px 10px", fontWeight: 700, color: "#166534" }}>{fmt(totalRemuneracao - inssEmpregado)}</td>
                      </tr>
                    </tfoot>
                  </table>
                )}
              </div>

              {/* Encargos + Ações */}
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                <div style={card}>
                  <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 14, color: "#1a1a1a" }}>Encargos do Empregador</div>
                  {[
                    { label: "FUNRURAL",  sub: "1,5% s/ folha",      value: funruralEmpregador, cor: "#92400E" },
                    { label: "SENAR",     sub: "0,2% s/ folha",      value: senarEmpregador,    cor: "#555"    },
                    { label: "FGTS CLT", sub: "8% s/ salários CLT", value: fgts,                cor: "#1A4870" },
                  ].map((e, i) => (
                    <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: i < 2 ? "0.5px solid #F0F2F7" : "none" }}>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 600, color: "#1a1a1a" }}>{e.label}</div>
                        <div style={{ fontSize: 11, color: "#888" }}>{e.sub}</div>
                      </div>
                      <div style={{ fontSize: 14, fontWeight: 700, color: e.cor }}>{fmt(e.value)}</div>
                    </div>
                  ))}
                  <div style={{ marginTop: 12, padding: "10px 0 0", borderTop: "1px solid #DDE2EE", display: "flex", justifyContent: "space-between" }}>
                    <span style={{ fontWeight: 700, fontSize: 13 }}>Total Encargos</span>
                    <span style={{ fontWeight: 700, fontSize: 15, color: "#1A4870" }}>{fmt(funruralEmpregador + senarEmpregador + fgts)}</span>
                  </div>
                </div>

                <div style={{ ...card, background: "#F8FAFF" }}>
                  <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 10, color: "#555" }}>Custo Total da Mão-de-obra</div>
                  <div style={{ fontSize: 24, fontWeight: 700, color: "#1A4870" }}>
                    {fmt(totalRemuneracao + funruralEmpregador + senarEmpregador + fgts)}
                  </div>
                  <div style={{ fontSize: 11, color: "#888", marginTop: 4 }}>Folha + todos os encargos</div>
                </div>

                {/* Gerar Folha → CP */}
                <div style={{ ...card, padding: "14px 16px" }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: "#555", marginBottom: 6 }}>Lançar Folha em Contas a Pagar</div>
                  <div style={{ fontSize: 11, color: "#888", marginBottom: 12, lineHeight: 1.5 }}>
                    Gera os lançamentos de Salário, FGTS, INSS/Funrural, SAT, Sistema S e provisões para todos os funcionários ativos desta competência.
                  </div>
                  {folhaMsg && (
                    <div style={{ fontSize: 11, padding: "8px 10px", borderRadius: 6, marginBottom: 10, background: folhaMsg.startsWith("Erro") ? "#FEE2E2" : "#DCFCE7", color: folhaMsg.startsWith("Erro") ? "#991B1B" : "#166534" }}>
                      {folhaMsg}
                    </div>
                  )}
                  <button onClick={gerarFolha} disabled={gerandoFolha || trabsAtivosApuracao.length === 0}
                    style={{ width: "100%", padding: "8px 0", background: "#C9921B", color: "#fff", border: "none", borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: gerandoFolha || trabsAtivosApuracao.length === 0 ? "not-allowed" : "pointer", opacity: gerandoFolha || trabsAtivosApuracao.length === 0 ? 0.6 : 1 }}>
                    {gerandoFolha ? "Gerando…" : "Gerar Folha → CP"}
                  </button>
                </div>

                {/* Gerar S-1200/S-1210 */}
                <div style={{ ...card, padding: "14px 16px" }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: "#555", marginBottom: 8 }}>Gerar Eventos S-1200</div>
                  <div style={{ fontSize: 11, color: "#888", marginBottom: 12, lineHeight: 1.5 }}>
                    Gera os eventos de remuneração (S-1200) e pagamento (S-1210) para todos os trabalhadores ativos desta competência.
                  </div>
                  <button
                    onClick={async () => {
                      if (!fazendaId) return;
                      for (const t of trabsAtivosApuracao) {
                        await supabase.from("esocial_eventos").insert([
                          { fazenda_id: fazendaId, trabalhador_id: t.id, codigo_evento: "S-1200", descricao_evento: "Remuneração — Período de Apuração", competencia: competApuracao, status: "pendente" },
                          { fazenda_id: fazendaId, trabalhador_id: t.id, codigo_evento: "S-1210", descricao_evento: "Pagamentos de Rendimentos do Trabalhador", competencia: competApuracao, status: "pendente" },
                        ]);
                      }
                      setAba("eventos");
                      carregar();
                    }}
                    disabled={trabsAtivosApuracao.length === 0}
                    style={{ width: "100%", padding: "8px 0", background: "#1A4870", color: "#fff", border: "none", borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: trabsAtivosApuracao.length === 0 ? "not-allowed" : "pointer", opacity: trabsAtivosApuracao.length === 0 ? 0.6 : 1 }}>
                    Gerar S-1200 / S-1210
                  </button>
                </div>
              </div>
            </div>
          </>
        )}
      </div>

      {/* ── Modal Evento Manual ── */}
      {modalEvt && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }}
          onClick={e => { if (e.target === e.currentTarget) { setModalEvt(false); setFormEvt({ ...VAZIO_EVT }); } }}>
          <div style={{ background: "#fff", borderRadius: 14, width: "100%", maxWidth: 500, boxShadow: "0 20px 60px rgba(0,0,0,0.2)" }}>
            <div style={{ padding: "16px 24px", borderBottom: "0.5px solid #DDE2EE", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontWeight: 700, fontSize: 15 }}>Evento Manual</span>
              <button onClick={() => { setModalEvt(false); setFormEvt({ ...VAZIO_EVT }); }} style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer", color: "#555" }}>✕</button>
            </div>
            <div style={{ padding: "22px 24px", display: "grid", gap: 14 }}>
              <div>
                <label style={lbl}>Código do Evento *</label>
                <select value={formEvt.codigo_evento} onChange={e => setFormEvt(f => ({ ...f, codigo_evento: e.target.value }))} style={inp}>
                  <option value="">Selecione...</option>
                  {EVENTOS_CATALOGO.map(e => <option key={e.codigo} value={e.codigo}>{e.codigo} — {e.descricao}</option>)}
                </select>
              </div>
              <div>
                <label style={lbl}>Trabalhador (opcional)</label>
                <select value={formEvt.trabalhador_id} onChange={e => setFormEvt(f => ({ ...f, trabalhador_id: e.target.value }))} style={inp}>
                  <option value="">Nenhum (evento de empregador)</option>
                  {trabalhadores.map(t => <option key={t.id} value={t.id}>{t.nome}</option>)}
                </select>
              </div>
              <div>
                <label style={lbl}>Competência</label>
                <input type="month" value={formEvt.competencia} onChange={e => setFormEvt(f => ({ ...f, competencia: e.target.value }))} style={inp} />
              </div>
            </div>
            <div style={{ padding: "14px 24px", borderTop: "0.5px solid #DDE2EE", display: "flex", justifyContent: "flex-end", gap: 10 }}>
              <button onClick={() => { setModalEvt(false); setFormEvt({ ...VAZIO_EVT }); }} style={{ padding: "9px 20px", background: "none", border: "0.5px solid #D4DCE8", borderRadius: 8, cursor: "pointer", fontSize: 13, color: "#555" }}>Cancelar</button>
              <button onClick={salvarEvt} disabled={salvandoE || !formEvt.codigo_evento}
                style={{ padding: "9px 22px", background: "#1A4870", color: "#fff", border: "none", borderRadius: 8, cursor: "pointer", fontSize: 13, fontWeight: 600, opacity: salvandoE ? 0.7 : 1 }}>
                {salvandoE ? "Salvando..." : "Criar Evento"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
