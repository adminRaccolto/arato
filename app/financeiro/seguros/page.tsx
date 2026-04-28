"use client";
import { useState, useEffect, useCallback } from "react";
import TopNav from "../../../components/TopNav";
import { useAuth } from "../../../components/AuthProvider";
import { supabase } from "../../../lib/supabase";

// ─────────────────────────────────────────────────────────────
// Estilos base
// ─────────────────────────────────────────────────────────────
const inp: React.CSSProperties = { width: "100%", padding: "8px 10px", border: "0.5px solid #D4DCE8", borderRadius: 8, fontSize: 13, color: "#1a1a1a", background: "#fff", boxSizing: "border-box", outline: "none" };
const lbl: React.CSSProperties = { fontSize: 11, color: "#555", marginBottom: 4, display: "block" };
const btnV: React.CSSProperties = { padding: "8px 20px", background: "#1A4870", color: "#fff", border: "none", borderRadius: 8, fontWeight: 600, cursor: "pointer", fontSize: 13 };
const btnR: React.CSSProperties = { padding: "8px 18px", border: "0.5px solid #D4DCE8", borderRadius: 8, background: "transparent", cursor: "pointer", fontSize: 13, color: "#1a1a1a" };

const fmtBRL = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fmtData = (s?: string | null) => s ? new Date(s + "T12:00:00").toLocaleDateString("pt-BR") : "—";
const hoje = () => new Date().toISOString().split("T")[0];

function badge(texto: string, bg = "#D5E8F5", color = "#0B2D50") {
  return <span style={{ fontSize: 10, background: bg, color, padding: "2px 7px", borderRadius: 8, fontWeight: 600 }}>{texto}</span>;
}

function diasAteVencer(dataVenc: string): number {
  const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
  const venc = new Date(dataVenc + "T12:00:00");
  return Math.ceil((venc.getTime() - hoje.getTime()) / 86_400_000);
}

// ─────────────────────────────────────────────────────────────
// Tipos
// ─────────────────────────────────────────────────────────────
type RamoSeguro = "rural" | "vida" | "patrimonial" | "automovel" | "responsabilidade_civil" | "maquinas" | "outro";
type StatusApolice = "vigente" | "vencida" | "cancelada" | "em_renovacao";
type StatusSinistro = "aberto" | "em_analise" | "pago" | "negado";

interface Apolice {
  id: string;
  fazenda_id: string;
  numero_apolice: string;
  seguradora: string;
  ramo: RamoSeguro;
  objeto_segurado: string;           // descrição do bem/safra/pessoa
  importancia_segurada: number;      // valor máximo da cobertura
  premio_anual: number;
  forma_pagamento_premio: string;    // "À vista" | "2x" | "mensal" etc.
  data_inicio_vigencia: string;
  data_fim_vigencia: string;
  status: StatusApolice;
  corretora?: string;
  corretor_contato?: string;
  arquivo_url?: string;
  observacao?: string;
  created_at?: string;
}

interface PagamentoPremio {
  id: string;
  apolice_id: string;
  data_vencimento: string;
  data_pagamento?: string | null;
  valor: number;
  pago: boolean;
  observacao?: string;
}

interface Sinistro {
  id: string;
  apolice_id: string;
  data_ocorrencia: string;
  data_comunicacao?: string | null;
  descricao: string;
  valor_reclamado: number;
  valor_indenizado: number;
  status: StatusSinistro;
  numero_protocolo?: string;
  observacao?: string;
  created_at?: string;
}

const RAMO_META: Record<RamoSeguro, { label: string; bg: string; cl: string }> = {
  rural:                  { label: "Rural",                bg: "#E8F5E9", cl: "#1A6B3C" },
  vida:                   { label: "Vida",                 bg: "#D5E8F5", cl: "#0B2D50" },
  patrimonial:            { label: "Patrimonial",          bg: "#FBF3E0", cl: "#7B4A00" },
  automovel:              { label: "Automóvel",            bg: "#F3E8FF", cl: "#6B21A8" },
  responsabilidade_civil: { label: "Resp. Civil",          bg: "#FFF3E0", cl: "#7B4A00" },
  maquinas:               { label: "Máquinas/Equip.",      bg: "#E6F1FB", cl: "#0C447C" },
  outro:                  { label: "Outro",                bg: "#F3F6F9", cl: "#555"    },
};

const STATUS_APOLICE_META: Record<StatusApolice, { label: string; bg: string; cl: string }> = {
  vigente:       { label: "Vigente",       bg: "#E8F5E9", cl: "#1A6B3C" },
  vencida:       { label: "Vencida",       bg: "#FCEBEB", cl: "#791F1F" },
  cancelada:     { label: "Cancelada",     bg: "#F3F6F9", cl: "#555"    },
  em_renovacao:  { label: "Em Renovação",  bg: "#FBF3E0", cl: "#7B4A00" },
};

const STATUS_SINISTRO_META: Record<StatusSinistro, { label: string; bg: string; cl: string }> = {
  aberto:      { label: "Aberto",      bg: "#FBF3E0", cl: "#7B4A00" },
  em_analise:  { label: "Em Análise",  bg: "#D5E8F5", cl: "#0B2D50" },
  pago:        { label: "Pago",        bg: "#E8F5E9", cl: "#1A6B3C" },
  negado:      { label: "Negado",      bg: "#FCEBEB", cl: "#791F1F" },
};

// ─────────────────────────────────────────────────────────────
// Componente principal
// ─────────────────────────────────────────────────────────────
export default function SegurosPage() {
  const { fazendaId } = useAuth();
  const [aba, setAba] = useState<"apolices" | "vencimentos" | "sinistros">("apolices");

  // Dados
  const [apolices,   setApolices]   = useState<Apolice[]>([]);
  const [premios,    setPremios]    = useState<PagamentoPremio[]>([]);
  const [sinistros,  setSinistros]  = useState<Sinistro[]>([]);
  const [expandido,  setExpandido]  = useState<string | null>(null);

  // Modal apólice
  const [modalApolice,  setModalApolice]  = useState(false);
  const [apoliceEdit,   setApoliceEdit]   = useState<Apolice | null>(null);
  const APOLICE_VAZIO = () => ({
    numero_apolice: "", seguradora: "", ramo: "rural" as RamoSeguro,
    objeto_segurado: "", importancia_segurada: "", premio_anual: "",
    forma_pagamento_premio: "À vista", data_inicio_vigencia: hoje(),
    data_fim_vigencia: "", status: "vigente" as StatusApolice,
    corretora: "", corretor_contato: "", observacao: "",
  });
  const [aForm, setAForm] = useState(APOLICE_VAZIO());
  const [aSaving, setASaving] = useState(false);
  const [aErr,    setAErr]    = useState("");

  // Modal sinistro
  const [modalSinistro,  setModalSinistro]  = useState<Apolice | null>(null);
  const [sinistroEdit,   setSinistroEdit]   = useState<Sinistro | null>(null);
  const SINISTRO_VAZIO = () => ({
    data_ocorrencia: hoje(), data_comunicacao: "",
    descricao: "", valor_reclamado: "", valor_indenizado: "0",
    status: "aberto" as StatusSinistro, numero_protocolo: "", observacao: "",
  });
  const [sForm,   setSForm]   = useState(SINISTRO_VAZIO());
  const [sSaving, setSSaving] = useState(false);
  const [sErr,    setSErr]    = useState("");

  // Modal pagar prêmio
  const [modalPremio, setModalPremio] = useState<PagamentoPremio | null>(null);
  const [premioData,  setPremioData]  = useState(hoje());
  const [premioSaving, setPremioSaving] = useState(false);

  // ── Carregar ───────────────────────────────────────────────
  const carregar = useCallback(async () => {
    if (!fazendaId) return;
    const [{ data: ap }, { data: pr }, { data: si }] = await Promise.all([
      supabase.from("apolices_seguro").select("*").eq("fazenda_id", fazendaId).order("data_fim_vigencia"),
      supabase.from("pagamentos_premio_seguro").select("*").order("data_vencimento"),
      supabase.from("sinistros_seguro").select("*").order("data_ocorrencia", { ascending: false }),
    ]);
    setApolices(ap ?? []);
    setPremios(pr ?? []);
    setSinistros(si ?? []);
  }, [fazendaId]);

  useEffect(() => { carregar(); }, [carregar]);

  // ── KPIs ──────────────────────────────────────────────────
  const vigentes = apolices.filter(a => a.status === "vigente");
  const totalIS  = vigentes.reduce((s, a) => s + a.importancia_segurada, 0);
  const totalAnual = vigentes.reduce((s, a) => s + a.premio_anual, 0);
  const vencendoEm30 = apolices.filter(a => {
    if (a.status !== "vigente") return false;
    const d = diasAteVencer(a.data_fim_vigencia);
    return d >= 0 && d <= 30;
  });
  const premiosVencidos = premios.filter(p => !p.pago && new Date(p.data_vencimento) < new Date());

  // ── CRUD Apólice ──────────────────────────────────────────
  function abrirApolice(a?: Apolice) {
    if (a) {
      setApoliceEdit(a);
      setAForm({
        numero_apolice: a.numero_apolice, seguradora: a.seguradora,
        ramo: a.ramo, objeto_segurado: a.objeto_segurado,
        importancia_segurada: String(a.importancia_segurada),
        premio_anual: String(a.premio_anual),
        forma_pagamento_premio: a.forma_pagamento_premio,
        data_inicio_vigencia: a.data_inicio_vigencia,
        data_fim_vigencia: a.data_fim_vigencia,
        status: a.status, corretora: a.corretora ?? "",
        corretor_contato: a.corretor_contato ?? "", observacao: a.observacao ?? "",
      });
    } else {
      setApoliceEdit(null);
      setAForm(APOLICE_VAZIO());
    }
    setAErr("");
    setModalApolice(true);
  }

  async function salvarApolice() {
    if (!fazendaId) return;
    if (!aForm.numero_apolice.trim()) { setAErr("Informe o número da apólice."); return; }
    if (!aForm.seguradora.trim())     { setAErr("Informe a seguradora."); return; }
    if (!aForm.data_fim_vigencia)     { setAErr("Informe a data de fim de vigência."); return; }
    setASaving(true); setAErr("");
    try {
      const payload = {
        fazenda_id: fazendaId,
        numero_apolice: aForm.numero_apolice.trim(),
        seguradora: aForm.seguradora.trim(),
        ramo: aForm.ramo,
        objeto_segurado: aForm.objeto_segurado,
        importancia_segurada: parseFloat(aForm.importancia_segurada) || 0,
        premio_anual: parseFloat(aForm.premio_anual) || 0,
        forma_pagamento_premio: aForm.forma_pagamento_premio,
        data_inicio_vigencia: aForm.data_inicio_vigencia,
        data_fim_vigencia: aForm.data_fim_vigencia,
        status: aForm.status,
        corretora: aForm.corretora || null,
        corretor_contato: aForm.corretor_contato || null,
        observacao: aForm.observacao || null,
      };
      if (apoliceEdit) {
        await supabase.from("apolices_seguro").update(payload).eq("id", apoliceEdit.id);
      } else {
        await supabase.from("apolices_seguro").insert(payload);
      }
      await carregar();
      setModalApolice(false);
    } catch (e: unknown) {
      setAErr(e instanceof Error ? e.message : "Erro ao salvar.");
    } finally {
      setASaving(false);
    }
  }

  // ── CRUD Sinistro ─────────────────────────────────────────
  function abrirSinistro(apolice: Apolice, s?: Sinistro) {
    setModalSinistro(apolice);
    if (s) {
      setSinistroEdit(s);
      setSForm({
        data_ocorrencia: s.data_ocorrencia,
        data_comunicacao: s.data_comunicacao ?? "",
        descricao: s.descricao,
        valor_reclamado: String(s.valor_reclamado),
        valor_indenizado: String(s.valor_indenizado),
        status: s.status,
        numero_protocolo: s.numero_protocolo ?? "",
        observacao: s.observacao ?? "",
      });
    } else {
      setSinistroEdit(null);
      setSForm(SINISTRO_VAZIO());
    }
    setSErr("");
  }

  async function salvarSinistro() {
    if (!modalSinistro) return;
    if (!sForm.descricao.trim()) { setSErr("Informe a descrição do sinistro."); return; }
    setSSaving(true); setSErr("");
    try {
      const payload = {
        apolice_id: modalSinistro.id,
        data_ocorrencia: sForm.data_ocorrencia,
        data_comunicacao: sForm.data_comunicacao || null,
        descricao: sForm.descricao.trim(),
        valor_reclamado: parseFloat(sForm.valor_reclamado) || 0,
        valor_indenizado: parseFloat(sForm.valor_indenizado) || 0,
        status: sForm.status,
        numero_protocolo: sForm.numero_protocolo || null,
        observacao: sForm.observacao || null,
      };
      if (sinistroEdit) {
        await supabase.from("sinistros_seguro").update(payload).eq("id", sinistroEdit.id);
      } else {
        await supabase.from("sinistros_seguro").insert(payload);
      }
      await carregar();
      setModalSinistro(null);
    } catch (e: unknown) {
      setSErr(e instanceof Error ? e.message : "Erro ao salvar.");
    } finally {
      setSSaving(false);
    }
  }

  // ── Pagar prêmio ──────────────────────────────────────────
  async function pagarPremio() {
    if (!modalPremio) return;
    setPremioSaving(true);
    try {
      await supabase.from("pagamentos_premio_seguro").update({ pago: true, data_pagamento: premioData }).eq("id", modalPremio.id);
      await carregar();
      setModalPremio(null);
    } finally {
      setPremioSaving(false);
    }
  }

  // ── Dados filtrados ───────────────────────────────────────
  const sinistrosVisiveis = sinistros.filter(s =>
    aba === "sinistros" || (expandido && s.apolice_id === expandido)
  );

  const premiosVisiveis = premios.filter(p =>
    aba === "vencimentos" ? !p.pago : (expandido ? p.apolice_id === expandido : false)
  );

  return (
    <div style={{ minHeight: "100vh", background: "#F4F6FA" }}>
      <TopNav />

      <main style={{ maxWidth: 1100, margin: "0 auto", padding: "28px 20px" }}>

        {/* Cabeçalho */}
        <div style={{ marginBottom: 22 }}>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: "#1a1a1a", margin: 0 }}>Controle de Seguros</h1>
          <p style={{ fontSize: 13, color: "#666", marginTop: 4, marginBottom: 0 }}>
            Apólices, vencimentos de prêmio e registro de sinistros
          </p>
        </div>

        {/* KPI cards */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14, marginBottom: 22 }}>
          {[
            { label: "Apólices Vigentes",    value: vigentes.length.toString(),  sub: "ativas",           color: "#1A6B3C" },
            { label: "Importância Segurada", value: fmtBRL(totalIS),             sub: "total segurado",   color: "#1A4870" },
            { label: "Prêmio Anual Total",   value: fmtBRL(totalAnual),          sub: "custo do seguro",  color: "#C9921B" },
            { label: "Vencendo em 30 dias",  value: vencendoEm30.length.toString(), sub: `+ ${premiosVencidos.length} prêmios atrasados`, color: vencendoEm30.length > 0 ? "#E24B4A" : "#555" },
          ].map(k => (
            <div key={k.label} style={{ background: "#fff", borderRadius: 12, border: "0.5px solid #D4DCE8", padding: "16px 18px" }}>
              <div style={{ fontSize: 11, color: "#666", marginBottom: 6 }}>{k.label}</div>
              <div style={{ fontSize: 20, fontWeight: 700, color: k.color }}>{k.value}</div>
              <div style={{ fontSize: 11, color: "#888", marginTop: 2 }}>{k.sub}</div>
            </div>
          ))}
        </div>

        {/* Alertas de vencimento */}
        {vencendoEm30.length > 0 && (
          <div style={{ background: "#FBF3E0", border: "0.5px solid #C9921B40", borderRadius: 10, padding: "12px 16px", marginBottom: 18 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: "#7B4A00", marginBottom: 6 }}>Apólices vencendo em breve</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {vencendoEm30.map(a => {
                const d = diasAteVencer(a.data_fim_vigencia);
                return (
                  <div key={a.id} style={{ fontSize: 12, color: "#7B4A00" }}>
                    <strong>{a.numero_apolice}</strong> — {a.seguradora} ({a.objeto_segurado}) — vence em {d === 0 ? "hoje" : `${d} dias`} ({fmtData(a.data_fim_vigencia)})
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Abas */}
        <div style={{ display: "flex", gap: 0, marginBottom: 20, borderBottom: "0.5px solid #D4DCE8" }}>
          {([
            { id: "apolices",    label: "Apólices"           },
            { id: "vencimentos", label: "Vencimentos de Prêmio" },
            { id: "sinistros",   label: "Sinistros"          },
          ] as { id: typeof aba; label: string }[]).map(a => (
            <button key={a.id} onClick={() => setAba(a.id)} style={{
              padding: "9px 20px", border: "none", background: "none", cursor: "pointer",
              fontSize: 13, fontWeight: aba === a.id ? 700 : 400,
              color: aba === a.id ? "#1A4870" : "#666",
              borderBottom: aba === a.id ? "2.5px solid #1A4870" : "2.5px solid transparent",
              marginBottom: -1,
            }}>{a.label}</button>
          ))}
        </div>

        {/* ── ABA APÓLICES ──────────────────────────────────── */}
        {aba === "apolices" && (
          <div>
            <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 14 }}>
              <button onClick={() => abrirApolice()} style={btnV}>+ Nova Apólice</button>
            </div>

            {apolices.length === 0 ? (
              <div style={{ background: "#fff", borderRadius: 12, border: "0.5px solid #D4DCE8", padding: 40, textAlign: "center", color: "#888", fontSize: 13 }}>
                Nenhuma apólice cadastrada.
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {apolices.map(a => {
                  const rm = RAMO_META[a.ramo];
                  const sm = STATUS_APOLICE_META[a.status];
                  const dias = diasAteVencer(a.data_fim_vigencia);
                  const urgente = a.status === "vigente" && dias >= 0 && dias <= 30;
                  const apolSinistros = sinistros.filter(s => s.apolice_id === a.id);
                  const exp = expandido === a.id;
                  return (
                    <div key={a.id} style={{ background: "#fff", borderRadius: 12, border: `0.5px solid ${urgente ? "#C9921B60" : "#D4DCE8"}`, overflow: "hidden" }}>
                      <div
                        onClick={() => setExpandido(exp ? null : a.id)}
                        style={{ display: "grid", gridTemplateColumns: "1fr 140px 130px 130px 160px", alignItems: "center", gap: 12, padding: "14px 18px", cursor: "pointer" }}
                      >
                        <div>
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <span style={{ fontSize: 13, fontWeight: 600, color: "#1a1a1a" }}>{a.numero_apolice}</span>
                            {badge(rm.label, rm.bg, rm.cl)}
                            {urgente && badge(`${dias}d`, "#FBF3E0", "#7B4A00")}
                          </div>
                          <div style={{ fontSize: 12, color: "#666", marginTop: 3 }}>
                            {a.seguradora} {a.corretora ? `· Corretora: ${a.corretora}` : ""} · {a.objeto_segurado}
                          </div>
                        </div>
                        <div style={{ textAlign: "right" }}>
                          <div style={{ fontSize: 11, color: "#666" }}>Import. Segurada</div>
                          <div style={{ fontSize: 13, fontWeight: 600 }}>{fmtBRL(a.importancia_segurada)}</div>
                        </div>
                        <div style={{ textAlign: "right" }}>
                          <div style={{ fontSize: 11, color: "#666" }}>Prêmio Anual</div>
                          <div style={{ fontSize: 13, fontWeight: 600, color: "#C9921B" }}>{fmtBRL(a.premio_anual)}</div>
                        </div>
                        <div style={{ textAlign: "right" }}>
                          <div style={{ fontSize: 11, color: "#666" }}>Vigência</div>
                          <div style={{ fontSize: 12 }}>{fmtData(a.data_inicio_vigencia)} → {fmtData(a.data_fim_vigencia)}</div>
                        </div>
                        <div style={{ display: "flex", gap: 6, justifyContent: "flex-end", alignItems: "center" }}>
                          {badge(sm.label, sm.bg, sm.cl)}
                          <button onClick={e => { e.stopPropagation(); abrirSinistro(a); }} style={{ padding: "4px 10px", border: "0.5px solid #E24B4A50", borderRadius: 6, background: "#FCEBEB", cursor: "pointer", fontSize: 11, color: "#791F1F", fontWeight: 600 }}>
                            Sinistro
                          </button>
                          <button onClick={e => { e.stopPropagation(); abrirApolice(a); }} style={{ padding: "4px 10px", border: "0.5px solid #D4DCE8", borderRadius: 6, background: "transparent", cursor: "pointer", fontSize: 11, color: "#555" }}>
                            Editar
                          </button>
                        </div>
                      </div>

                      {/* Sinistros da apólice */}
                      {exp && (
                        <div style={{ borderTop: "0.5px solid #EEF1F6", padding: "12px 18px", background: "#F8FAFB" }}>
                          <div style={{ fontSize: 12, fontWeight: 600, color: "#555", marginBottom: 8 }}>
                            Sinistros ({apolSinistros.length})
                          </div>
                          {apolSinistros.length === 0 ? (
                            <div style={{ fontSize: 12, color: "#aaa" }}>Nenhum sinistro registrado nesta apólice.</div>
                          ) : (
                            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                              <thead>
                                <tr style={{ background: "#EEF1F6" }}>
                                  {["Ocorrência", "Protocolo", "Descrição", "Valor Reclamado", "Indenizado", "Status", ""].map(h => (
                                    <th key={h} style={{ padding: "6px 10px", textAlign: ["Valor Reclamado", "Indenizado"].includes(h) ? "right" : "left", color: "#555", fontWeight: 600 }}>{h}</th>
                                  ))}
                                </tr>
                              </thead>
                              <tbody>
                                {apolSinistros.map(s => {
                                  const sm2 = STATUS_SINISTRO_META[s.status];
                                  return (
                                    <tr key={s.id} style={{ borderBottom: "0.5px solid #EEF1F6" }}>
                                      <td style={{ padding: "6px 10px" }}>{fmtData(s.data_ocorrencia)}</td>
                                      <td style={{ padding: "6px 10px", color: "#666" }}>{s.numero_protocolo ?? "—"}</td>
                                      <td style={{ padding: "6px 10px" }}>{s.descricao}</td>
                                      <td style={{ padding: "6px 10px", textAlign: "right" }}>{fmtBRL(s.valor_reclamado)}</td>
                                      <td style={{ padding: "6px 10px", textAlign: "right", color: s.valor_indenizado > 0 ? "#16A34A" : "#aaa" }}>{s.valor_indenizado > 0 ? fmtBRL(s.valor_indenizado) : "—"}</td>
                                      <td style={{ padding: "6px 10px" }}>{badge(sm2.label, sm2.bg, sm2.cl)}</td>
                                      <td style={{ padding: "6px 10px" }}>
                                        <button onClick={() => abrirSinistro(a, s)} style={{ padding: "3px 8px", border: "0.5px solid #D4DCE8", borderRadius: 5, background: "transparent", cursor: "pointer", fontSize: 11, color: "#555" }}>Editar</button>
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
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ── ABA VENCIMENTOS ───────────────────────────────── */}
        {aba === "vencimentos" && (
          <div>
            {premiosVisiveis.length === 0 ? (
              <div style={{ background: "#fff", borderRadius: 12, border: "0.5px solid #D4DCE8", padding: 40, textAlign: "center", color: "#888", fontSize: 13 }}>
                Nenhum prêmio pendente.
              </div>
            ) : (
              <div style={{ background: "#fff", borderRadius: 12, border: "0.5px solid #D4DCE8", overflow: "hidden" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                  <thead>
                    <tr style={{ background: "#F8FAFB" }}>
                      {["Vencimento", "Apólice", "Seguradora", "Valor", "Status", ""].map(h => (
                        <th key={h} style={{ padding: "10px 14px", textAlign: h === "Valor" ? "right" : "left", color: "#555", fontWeight: 600, fontSize: 11, borderBottom: "0.5px solid #EEF1F6" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {premiosVisiveis.map(p => {
                      const ap = apolices.find(a => a.id === p.apolice_id);
                      const vencido = new Date(p.data_vencimento) < new Date();
                      return (
                        <tr key={p.id} style={{ borderBottom: "0.5px solid #EEF1F6", background: vencido ? "#FFFCF5" : "#fff" }}>
                          <td style={{ padding: "10px 14px", color: vencido ? "#E24B4A" : "#1a1a1a", fontWeight: vencido ? 600 : 400 }}>{fmtData(p.data_vencimento)}</td>
                          <td style={{ padding: "10px 14px" }}>{ap?.numero_apolice ?? "—"}</td>
                          <td style={{ padding: "10px 14px", color: "#666" }}>{ap?.seguradora ?? "—"}</td>
                          <td style={{ padding: "10px 14px", textAlign: "right", fontWeight: 600 }}>{fmtBRL(p.valor)}</td>
                          <td style={{ padding: "10px 14px" }}>
                            {p.pago ? badge("Pago", "#E8F5E9", "#1A6B3C") : vencido ? badge("Atrasado", "#FCEBEB", "#791F1F") : badge("Pendente", "#FBF3E0", "#7B4A00")}
                          </td>
                          <td style={{ padding: "10px 14px", textAlign: "right" }}>
                            {!p.pago && (
                              <button onClick={() => { setModalPremio(p); setPremioData(hoje()); }} style={{ padding: "4px 10px", border: "0.5px solid #1A487050", borderRadius: 6, background: "#D5E8F5", cursor: "pointer", fontSize: 11, color: "#0B2D50", fontWeight: 600 }}>
                                Pagar
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ── ABA SINISTROS ─────────────────────────────────── */}
        {aba === "sinistros" && (
          <div>
            {sinistrosVisiveis.length === 0 ? (
              <div style={{ background: "#fff", borderRadius: 12, border: "0.5px solid #D4DCE8", padding: 40, textAlign: "center", color: "#888", fontSize: 13 }}>
                Nenhum sinistro registrado.
              </div>
            ) : (
              <div style={{ background: "#fff", borderRadius: 12, border: "0.5px solid #D4DCE8", overflow: "hidden" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                  <thead>
                    <tr style={{ background: "#F8FAFB" }}>
                      {["Ocorrência", "Apólice", "Seguradora", "Protocolo", "Descrição", "Reclamado", "Indenizado", "Status", ""].map(h => (
                        <th key={h} style={{ padding: "10px 14px", textAlign: ["Reclamado","Indenizado"].includes(h) ? "right" : "left", color: "#555", fontWeight: 600, fontSize: 11, borderBottom: "0.5px solid #EEF1F6" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {sinistrosVisiveis.map(s => {
                      const ap = apolices.find(a => a.id === s.apolice_id);
                      const sm2 = STATUS_SINISTRO_META[s.status];
                      return (
                        <tr key={s.id} style={{ borderBottom: "0.5px solid #EEF1F6" }}>
                          <td style={{ padding: "10px 14px" }}>{fmtData(s.data_ocorrencia)}</td>
                          <td style={{ padding: "10px 14px" }}>{ap?.numero_apolice ?? "—"}</td>
                          <td style={{ padding: "10px 14px", color: "#666" }}>{ap?.seguradora ?? "—"}</td>
                          <td style={{ padding: "10px 14px", color: "#666" }}>{s.numero_protocolo ?? "—"}</td>
                          <td style={{ padding: "10px 14px" }}>{s.descricao}</td>
                          <td style={{ padding: "10px 14px", textAlign: "right" }}>{fmtBRL(s.valor_reclamado)}</td>
                          <td style={{ padding: "10px 14px", textAlign: "right", color: s.valor_indenizado > 0 ? "#16A34A" : "#aaa" }}>{s.valor_indenizado > 0 ? fmtBRL(s.valor_indenizado) : "—"}</td>
                          <td style={{ padding: "10px 14px" }}>{badge(sm2.label, sm2.bg, sm2.cl)}</td>
                          <td style={{ padding: "10px 14px", textAlign: "right" }}>
                            {ap && <button onClick={() => abrirSinistro(ap, s)} style={{ padding: "4px 10px", border: "0.5px solid #D4DCE8", borderRadius: 6, background: "transparent", cursor: "pointer", fontSize: 11, color: "#555" }}>Editar</button>}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </main>

      {/* ══════════════════════════════════════════════════════
          MODAL APÓLICE
      ══════════════════════════════════════════════════════ */}
      {modalApolice && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "flex-start", justifyContent: "center", zIndex: 200, overflowY: "auto", padding: "24px 0" }}>
          <div style={{ background: "#fff", borderRadius: 14, width: "100%", maxWidth: 640, margin: "0 20px", boxShadow: "0 16px 48px rgba(0,0,0,0.18)" }}>
            <div style={{ padding: "18px 22px 14px", borderBottom: "0.5px solid #EEF1F6", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: "#1a1a1a" }}>{apoliceEdit ? "Editar Apólice" : "Nova Apólice"}</div>
              <button onClick={() => setModalApolice(false)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 20, color: "#888" }}>×</button>
            </div>
            <div style={{ padding: "20px 22px" }}>
              {aErr && <div style={{ background: "#FCEBEB", border: "0.5px solid #F5C6C6", borderRadius: 8, padding: "10px 14px", fontSize: 13, color: "#791F1F", marginBottom: 14 }}>{aErr}</div>}

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
                <div>
                  <label style={lbl}>Nº da Apólice</label>
                  <input value={aForm.numero_apolice} onChange={e => setAForm(f => ({ ...f, numero_apolice: e.target.value }))} style={inp} placeholder="000.000.000-0" />
                </div>
                <div>
                  <label style={lbl}>Seguradora</label>
                  <input value={aForm.seguradora} onChange={e => setAForm(f => ({ ...f, seguradora: e.target.value }))} style={inp} />
                </div>
                <div>
                  <label style={lbl}>Ramo</label>
                  <select value={aForm.ramo} onChange={e => setAForm(f => ({ ...f, ramo: e.target.value as RamoSeguro }))} style={inp}>
                    {Object.entries(RAMO_META).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                  </select>
                </div>
                <div style={{ gridColumn: "1 / -1" }}>
                  <label style={lbl}>Objeto Segurado</label>
                  <input value={aForm.objeto_segurado} onChange={e => setAForm(f => ({ ...f, objeto_segurado: e.target.value }))} style={inp} placeholder="Ex.: Safra de Soja — Talhões 01 a 10 — Fazenda São João" />
                </div>
                <div>
                  <label style={lbl}>Importância Segurada (R$)</label>
                  <input type="number" step="0.01" min="0" value={aForm.importancia_segurada} onChange={e => setAForm(f => ({ ...f, importancia_segurada: e.target.value }))} style={inp} />
                </div>
                <div>
                  <label style={lbl}>Prêmio Anual (R$)</label>
                  <input type="number" step="0.01" min="0" value={aForm.premio_anual} onChange={e => setAForm(f => ({ ...f, premio_anual: e.target.value }))} style={inp} />
                </div>
                <div>
                  <label style={lbl}>Forma de Pagamento</label>
                  <select value={aForm.forma_pagamento_premio} onChange={e => setAForm(f => ({ ...f, forma_pagamento_premio: e.target.value }))} style={inp}>
                    {["À vista","2x","3x","4x","mensal"].map(v => <option key={v} value={v}>{v}</option>)}
                  </select>
                </div>
                <div>
                  <label style={lbl}>Início da Vigência</label>
                  <input type="date" value={aForm.data_inicio_vigencia} onChange={e => setAForm(f => ({ ...f, data_inicio_vigencia: e.target.value }))} style={inp} />
                </div>
                <div>
                  <label style={lbl}>Fim da Vigência</label>
                  <input type="date" value={aForm.data_fim_vigencia} onChange={e => setAForm(f => ({ ...f, data_fim_vigencia: e.target.value }))} style={inp} />
                </div>
                <div>
                  <label style={lbl}>Status</label>
                  <select value={aForm.status} onChange={e => setAForm(f => ({ ...f, status: e.target.value as StatusApolice }))} style={inp}>
                    {Object.entries(STATUS_APOLICE_META).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                  </select>
                </div>
                <div>
                  <label style={lbl}>Corretora</label>
                  <input value={aForm.corretora} onChange={e => setAForm(f => ({ ...f, corretora: e.target.value }))} style={inp} />
                </div>
                <div>
                  <label style={lbl}>Contato do Corretor</label>
                  <input value={aForm.corretor_contato} onChange={e => setAForm(f => ({ ...f, corretor_contato: e.target.value }))} style={inp} placeholder="(66) 9 9999-9999" />
                </div>
                <div style={{ gridColumn: "1 / -1" }}>
                  <label style={lbl}>Observação</label>
                  <textarea value={aForm.observacao} onChange={e => setAForm(f => ({ ...f, observacao: e.target.value }))} rows={2} style={{ ...inp, resize: "vertical" }} />
                </div>
              </div>
            </div>
            <div style={{ padding: "14px 22px 18px", borderTop: "0.5px solid #EEF1F6", display: "flex", justifyContent: "flex-end", gap: 10 }}>
              <button style={btnR} onClick={() => setModalApolice(false)}>Cancelar</button>
              <button onClick={salvarApolice} disabled={aSaving} style={{ ...btnV, background: aSaving ? "#aaa" : "#1A4870", cursor: aSaving ? "default" : "pointer" }}>
                {aSaving ? "Salvando…" : "Salvar"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════
          MODAL SINISTRO
      ══════════════════════════════════════════════════════ */}
      {modalSinistro && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200 }}>
          <div style={{ background: "#fff", borderRadius: 14, width: "100%", maxWidth: 560, margin: "0 20px", boxShadow: "0 16px 48px rgba(0,0,0,0.18)" }}>
            <div style={{ padding: "18px 22px 14px", borderBottom: "0.5px solid #EEF1F6", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <div style={{ fontSize: 15, fontWeight: 700, color: "#1a1a1a" }}>{sinistroEdit ? "Editar Sinistro" : "Registrar Sinistro"}</div>
                <div style={{ fontSize: 12, color: "#888", marginTop: 2 }}>Apólice {modalSinistro.numero_apolice} — {modalSinistro.seguradora}</div>
              </div>
              <button onClick={() => setModalSinistro(null)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 20, color: "#888" }}>×</button>
            </div>
            <div style={{ padding: "20px 22px", display: "flex", flexDirection: "column", gap: 12 }}>
              {sErr && <div style={{ background: "#FCEBEB", border: "0.5px solid #F5C6C6", borderRadius: 8, padding: "10px 14px", fontSize: 13, color: "#791F1F" }}>{sErr}</div>}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div>
                  <label style={lbl}>Data da Ocorrência</label>
                  <input type="date" value={sForm.data_ocorrencia} onChange={e => setSForm(f => ({ ...f, data_ocorrencia: e.target.value }))} style={inp} />
                </div>
                <div>
                  <label style={lbl}>Data de Comunicação</label>
                  <input type="date" value={sForm.data_comunicacao ?? ""} onChange={e => setSForm(f => ({ ...f, data_comunicacao: e.target.value }))} style={inp} />
                </div>
                <div style={{ gridColumn: "1 / -1" }}>
                  <label style={lbl}>Descrição do Sinistro</label>
                  <textarea value={sForm.descricao} onChange={e => setSForm(f => ({ ...f, descricao: e.target.value }))} rows={3} style={{ ...inp, resize: "vertical" }} placeholder="Descreva o evento ocorrido…" />
                </div>
                <div>
                  <label style={lbl}>Valor Reclamado (R$)</label>
                  <input type="number" step="0.01" min="0" value={sForm.valor_reclamado} onChange={e => setSForm(f => ({ ...f, valor_reclamado: e.target.value }))} style={inp} />
                </div>
                <div>
                  <label style={lbl}>Valor Indenizado (R$)</label>
                  <input type="number" step="0.01" min="0" value={sForm.valor_indenizado} onChange={e => setSForm(f => ({ ...f, valor_indenizado: e.target.value }))} style={inp} />
                </div>
                <div>
                  <label style={lbl}>Nº de Protocolo</label>
                  <input value={sForm.numero_protocolo} onChange={e => setSForm(f => ({ ...f, numero_protocolo: e.target.value }))} style={inp} />
                </div>
                <div>
                  <label style={lbl}>Status</label>
                  <select value={sForm.status} onChange={e => setSForm(f => ({ ...f, status: e.target.value as StatusSinistro }))} style={inp}>
                    {Object.entries(STATUS_SINISTRO_META).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                  </select>
                </div>
                <div style={{ gridColumn: "1 / -1" }}>
                  <label style={lbl}>Observação</label>
                  <input value={sForm.observacao} onChange={e => setSForm(f => ({ ...f, observacao: e.target.value }))} style={inp} />
                </div>
              </div>
            </div>
            <div style={{ padding: "14px 22px 18px", borderTop: "0.5px solid #EEF1F6", display: "flex", justifyContent: "flex-end", gap: 10 }}>
              <button style={btnR} onClick={() => setModalSinistro(null)}>Cancelar</button>
              <button onClick={salvarSinistro} disabled={sSaving} style={{ ...btnV, background: sSaving ? "#aaa" : "#E24B4A", cursor: sSaving ? "default" : "pointer" }}>
                {sSaving ? "Registrando…" : "Salvar Sinistro"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════
          MODAL PAGAR PRÊMIO
      ══════════════════════════════════════════════════════ */}
      {modalPremio && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200 }}>
          <div style={{ background: "#fff", borderRadius: 14, width: "100%", maxWidth: 360, margin: "0 20px", boxShadow: "0 16px 48px rgba(0,0,0,0.18)" }}>
            <div style={{ padding: "18px 22px 14px", borderBottom: "0.5px solid #EEF1F6", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <div style={{ fontSize: 15, fontWeight: 700, color: "#1a1a1a" }}>Confirmar Pagamento</div>
                <div style={{ fontSize: 12, color: "#888", marginTop: 2 }}>Venc. {fmtData(modalPremio.data_vencimento)} — {fmtBRL(modalPremio.valor)}</div>
              </div>
              <button onClick={() => setModalPremio(null)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 20, color: "#888" }}>×</button>
            </div>
            <div style={{ padding: "20px 22px" }}>
              <label style={lbl}>Data do Pagamento</label>
              <input type="date" value={premioData} onChange={e => setPremioData(e.target.value)} style={inp} />
            </div>
            <div style={{ padding: "14px 22px 18px", borderTop: "0.5px solid #EEF1F6", display: "flex", justifyContent: "flex-end", gap: 10 }}>
              <button style={btnR} onClick={() => setModalPremio(null)}>Cancelar</button>
              <button onClick={pagarPremio} disabled={premioSaving} style={{ ...btnV, background: premioSaving ? "#aaa" : "#1A4870", cursor: premioSaving ? "default" : "pointer" }}>
                {premioSaving ? "Salvando…" : "Confirmar Pagamento"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
