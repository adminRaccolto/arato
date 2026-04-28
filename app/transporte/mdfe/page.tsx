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
const divider: React.CSSProperties = { gridColumn: "1 / -1", borderTop: "0.5px solid #EEF1F6", paddingTop: 12, marginTop: 4, fontSize: 11, fontWeight: 700, color: "#888", textTransform: "uppercase", letterSpacing: "0.05em" };

const fmtBRL = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fmtData = (s?: string | null) => s ? new Date(s + "T12:00:00").toLocaleDateString("pt-BR") : "—";
const hoje = () => new Date().toISOString().split("T")[0];

function badge(texto: string, bg = "#D5E8F5", color = "#0B2D50") {
  return <span style={{ fontSize: 10, background: bg, color, padding: "2px 7px", borderRadius: 8, fontWeight: 600, whiteSpace: "nowrap" }}>{texto}</span>;
}

// ─────────────────────────────────────────────────────────────
// Tipos
// ─────────────────────────────────────────────────────────────
type StatusMdfe = "rascunho" | "autorizado" | "encerrado" | "cancelado";

interface DocVinculado {
  tipo: "cte" | "nfe";
  chave: string;
  numero?: string;
  emitente?: string;
}

interface Mdfe {
  id: string;
  fazenda_id: string;
  numero_mdfe: string;
  serie: string;
  chave_acesso?: string | null;
  data_emissao: string;
  uf_inicio: string;
  municipio_inicio: string;
  uf_fim: string;
  percurso_ufs?: string[] | null;    // UFs intermediárias
  veiculo_id?: string | null;
  veiculo_placa: string;
  veiculo_tipo?: string | null;
  motorista_id?: string | null;
  motorista_nome: string;
  motorista_cpf?: string | null;
  documentos: DocVinculado[];
  peso_total_kg?: number | null;
  valor_total_carga?: number | null;
  status: StatusMdfe;
  data_encerramento?: string | null;
  municipio_encerramento?: string | null;
  uf_encerramento?: string | null;
  observacao?: string | null;
  created_at?: string;
}

interface CteMin { id: string; numero_cte: string; serie: string; chave_acesso?: string | null; remetente_nome: string; destinatario_nome: string; valor_frete: number; status: string; }
interface VeiculoMin { id: string; placa: string; tipo?: string; }
interface MotoristaMin { id: string; nome: string; cpf?: string; }

const STATUS_META: Record<StatusMdfe, { label: string; bg: string; cl: string }> = {
  rascunho:   { label: "Rascunho",   bg: "#FBF3E0", cl: "#7B4A00" },
  autorizado: { label: "Autorizado", bg: "#D5E8F5", cl: "#0B2D50" },
  encerrado:  { label: "Encerrado",  bg: "#E8F5E9", cl: "#1A6B3C" },
  cancelado:  { label: "Cancelado",  bg: "#FCEBEB", cl: "#791F1F" },
};

const UFS = ["AC","AL","AM","AP","BA","CE","DF","ES","GO","MA","MG","MS","MT","PA","PB","PE","PI","PR","RJ","RN","RO","RR","RS","SC","SE","SP","TO"];

// ─────────────────────────────────────────────────────────────
// Componente
// ─────────────────────────────────────────────────────────────
export default function MdfePage() {
  const { fazendaId } = useAuth();

  const [mdfes,     setMdfes]     = useState<Mdfe[]>([]);
  const [ctes,      setCtes]      = useState<CteMin[]>([]);
  const [veiculos,  setVeiculos]  = useState<VeiculoMin[]>([]);
  const [motoristas,setMotoristas]= useState<MotoristaMin[]>([]);

  // Filtros
  const [filtroStatus, setFiltroStatus] = useState("");

  // Modal emissão
  const [modal, setModal]       = useState(false);
  const [mdfeEdit, setMdfeEdit] = useState<Mdfe | null>(null);
  const [saving, setSaving]     = useState(false);
  const [err, setErr]           = useState("");
  const [proximoNr, setProximoNr] = useState("1");

  const FORM_VAZIO = () => ({
    numero_mdfe: proximoNr, serie: "1", data_emissao: hoje(),
    uf_inicio: "MT", municipio_inicio: "",
    uf_fim: "MT",
    percurso_ufs: [] as string[],
    veiculo_id: "", motorista_id: "",
    peso_total_kg: "", valor_total_carga: "",
    observacao: "",
    // Documentos vinculados
    cte_ids: [] as string[],
    nfe_chaves: [""],   // lista de chaves manuais
  });
  const [form, setForm] = useState(FORM_VAZIO());

  // Modal encerramento
  const [modalEnc, setModalEnc] = useState<Mdfe | null>(null);
  const [encForm, setEncForm]   = useState({ data_encerramento: hoje(), municipio_encerramento: "", uf_encerramento: "MT" });
  const [encSaving, setEncSaving] = useState(false);

  // ── Carregar ─────────────────────────────────────────────
  const carregar = useCallback(async () => {
    if (!fazendaId) return;
    const [{ data: md }, { data: cd }, { data: vd }, { data: mot }] = await Promise.all([
      supabase.from("mdfes").select("*").eq("fazenda_id", fazendaId).order("data_emissao", { ascending: false }),
      supabase.from("ctes").select("id, numero_cte, serie, chave_acesso, remetente_nome, destinatario_nome, valor_frete, status").eq("fazenda_id", fazendaId).eq("status", "autorizado"),
      supabase.from("veiculos").select("id, placa, tipo").eq("fazenda_id", fazendaId).eq("ativo", true),
      supabase.from("motoristas").select("id, nome, cpf").eq("fazenda_id", fazendaId).eq("ativo", true),
    ]);
    const raw = md ?? [];
    // documentos pode vir como JSON string do banco
    const parsed = raw.map((m: Mdfe & { documentos: unknown }) => ({
      ...m,
      documentos: typeof m.documentos === "string" ? JSON.parse(m.documentos) : (m.documentos ?? []),
    }));
    setMdfes(parsed);
    setCtes(cd ?? []);
    setVeiculos(vd ?? []);
    setMotoristas(mot ?? []);
    if (raw.length > 0) {
      const maxNr = Math.max(...raw.map((m: Mdfe) => parseInt(m.numero_mdfe) || 0));
      setProximoNr(String(maxNr + 1));
    }
  }, [fazendaId]);

  useEffect(() => { carregar(); }, [carregar]);

  // ── Abrir modal ──────────────────────────────────────────
  function abrirNovo() {
    setMdfeEdit(null);
    setForm({ ...FORM_VAZIO(), numero_mdfe: proximoNr });
    setErr("");
    setModal(true);
  }

  function abrirEditar(m: Mdfe) {
    setMdfeEdit(m);
    const cteIds = m.documentos.filter(d => d.tipo === "cte").map(d => {
      const c = ctes.find(c => c.chave_acesso === d.chave);
      return c?.id ?? "";
    }).filter(Boolean);
    const nfeChaves = m.documentos.filter(d => d.tipo === "nfe").map(d => d.chave);
    setForm({
      numero_mdfe: m.numero_mdfe, serie: m.serie, data_emissao: m.data_emissao,
      uf_inicio: m.uf_inicio, municipio_inicio: m.municipio_inicio,
      uf_fim: m.uf_fim,
      percurso_ufs: m.percurso_ufs ?? [],
      veiculo_id: m.veiculo_id ?? "", motorista_id: m.motorista_id ?? "",
      peso_total_kg: String(m.peso_total_kg ?? ""),
      valor_total_carga: String(m.valor_total_carga ?? ""),
      observacao: m.observacao ?? "",
      cte_ids: cteIds,
      nfe_chaves: nfeChaves.length > 0 ? nfeChaves : [""],
    });
    setErr("");
    setModal(true);
  }

  // ── Toggle CT-e vinculado ────────────────────────────────
  function toggleCte(id: string) {
    setForm(f => ({
      ...f,
      cte_ids: f.cte_ids.includes(id) ? f.cte_ids.filter(c => c !== id) : [...f.cte_ids, id],
    }));
  }

  // ── Salvar ───────────────────────────────────────────────
  async function salvar() {
    if (!fazendaId) return;
    if (!form.municipio_inicio.trim()) { setErr("Informe o município de início."); return; }
    setSaving(true); setErr("");
    try {
      const veiculo   = veiculos.find(v => v.id === form.veiculo_id);
      const motorista = motoristas.find(m => m.id === form.motorista_id);

      // Montar array de documentos
      const documentos: DocVinculado[] = [];
      for (const cteId of form.cte_ids) {
        const c = ctes.find(c => c.id === cteId);
        if (c) documentos.push({ tipo: "cte", chave: c.chave_acesso ?? "", numero: c.numero_cte, emitente: c.remetente_nome });
      }
      for (const chave of form.nfe_chaves) {
        if (chave.trim()) documentos.push({ tipo: "nfe", chave: chave.trim() });
      }

      const payload = {
        fazenda_id: fazendaId,
        numero_mdfe: form.numero_mdfe,
        serie: form.serie,
        chave_acesso: mdfeEdit?.chave_acesso ?? null,
        data_emissao: form.data_emissao,
        uf_inicio: form.uf_inicio,
        municipio_inicio: form.municipio_inicio,
        uf_fim: form.uf_fim,
        percurso_ufs: form.percurso_ufs.length > 0 ? form.percurso_ufs : null,
        veiculo_id: form.veiculo_id || null,
        veiculo_placa: veiculo?.placa ?? "",
        veiculo_tipo: veiculo?.tipo ?? null,
        motorista_id: form.motorista_id || null,
        motorista_nome: motorista?.nome ?? "",
        motorista_cpf: motorista?.cpf ?? null,
        documentos,
        peso_total_kg: parseFloat(form.peso_total_kg) || null,
        valor_total_carga: parseFloat(form.valor_total_carga) || null,
        status: mdfeEdit ? mdfeEdit.status : "rascunho" as StatusMdfe,
        observacao: form.observacao || null,
      };
      if (mdfeEdit) {
        await supabase.from("mdfes").update(payload).eq("id", mdfeEdit.id);
      } else {
        await supabase.from("mdfes").insert(payload);
      }
      await carregar();
      setModal(false);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Erro ao salvar.");
    } finally {
      setSaving(false);
    }
  }

  // ── Autorizar (simulado) ─────────────────────────────────
  async function autorizar(m: Mdfe) {
    const chave = `35${m.data_emissao.replace(/-/g,"").slice(2,6)}00000000000000000000000${m.numero_mdfe.padStart(9,"0")}58`;
    await supabase.from("mdfes").update({ status: "autorizado", chave_acesso: chave }).eq("id", m.id);
    await carregar();
  }

  // ── Encerrar ─────────────────────────────────────────────
  async function encerrar() {
    if (!modalEnc) return;
    if (!encForm.municipio_encerramento.trim()) { alert("Informe o município de encerramento."); return; }
    setEncSaving(true);
    try {
      await supabase.from("mdfes").update({
        status: "encerrado",
        data_encerramento: encForm.data_encerramento,
        municipio_encerramento: encForm.municipio_encerramento,
        uf_encerramento: encForm.uf_encerramento,
      }).eq("id", modalEnc.id);
      await carregar();
      setModalEnc(null);
    } finally {
      setEncSaving(false);
    }
  }

  async function cancelar(m: Mdfe) {
    if (!confirm("Cancelar este MDF-e?")) return;
    await supabase.from("mdfes").update({ status: "cancelado" }).eq("id", m.id);
    await carregar();
  }

  // ── Filtrar ──────────────────────────────────────────────
  const mdfesFiltrados = mdfes.filter(m => !filtroStatus || m.status === filtroStatus);

  // ── KPIs ─────────────────────────────────────────────────
  const emTransito   = mdfes.filter(m => m.status === "autorizado");
  const encerrados   = mdfes.filter(m => m.status === "encerrado");
  const pesoTransito = emTransito.reduce((s, m) => s + (m.peso_total_kg ?? 0), 0);

  return (
    <div style={{ minHeight: "100vh", background: "#F4F6FA" }}>
      <TopNav />

      <main style={{ maxWidth: 1180, margin: "0 auto", padding: "28px 20px" }}>

        {/* Cabeçalho */}
        <div style={{ marginBottom: 22 }}>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: "#1a1a1a", margin: 0 }}>MDF-e — Manifesto de Documentos Fiscais Eletrônico</h1>
          <p style={{ fontSize: 13, color: "#666", marginTop: 4, marginBottom: 0 }}>
            Vincula CT-e e NF-e por viagem · Frota própria · Motoristas CLT
          </p>
        </div>

        {/* KPI cards */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14, marginBottom: 22 }}>
          {[
            { label: "Em Trânsito",          value: emTransito.length.toString(),  sub: "manifestos autorizados",  color: "#1A4870" },
            { label: "Encerrados",            value: encerrados.length.toString(),  sub: "viagens concluídas",      color: "#1A6B3C" },
            { label: "Carga em Trânsito",     value: pesoTransito > 0 ? `${(pesoTransito/1000).toFixed(0)} ton` : "—", sub: "peso total", color: "#C9921B" },
            { label: "Cancelados",            value: mdfes.filter(m => m.status === "cancelado").length.toString(), sub: "total", color: "#555" },
          ].map(k => (
            <div key={k.label} style={{ background: "#fff", borderRadius: 12, border: "0.5px solid #D4DCE8", padding: "16px 18px" }}>
              <div style={{ fontSize: 11, color: "#666", marginBottom: 6 }}>{k.label}</div>
              <div style={{ fontSize: 20, fontWeight: 700, color: k.color }}>{k.value}</div>
              <div style={{ fontSize: 11, color: "#888", marginTop: 2 }}>{k.sub}</div>
            </div>
          ))}
        </div>

        {/* Filtro + botão */}
        <div style={{ display: "flex", gap: 10, marginBottom: 16, alignItems: "flex-end" }}>
          <div style={{ flex: "0 0 160px" }}>
            <label style={lbl}>Status</label>
            <select value={filtroStatus} onChange={e => setFiltroStatus(e.target.value)} style={inp}>
              <option value="">Todos</option>
              {Object.entries(STATUS_META).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
          </div>
          <div style={{ flex: 1 }} />
          <button onClick={abrirNovo} style={btnV}>+ Emitir MDF-e</button>
        </div>

        {/* Tabela */}
        {mdfesFiltrados.length === 0 ? (
          <div style={{ background: "#fff", borderRadius: 12, border: "0.5px solid #D4DCE8", padding: 40, textAlign: "center", color: "#888", fontSize: 13 }}>
            {mdfes.length === 0 ? "Nenhum MDF-e emitido." : "Nenhum MDF-e encontrado para o filtro aplicado."}
          </div>
        ) : (
          <div style={{ background: "#fff", borderRadius: 12, border: "0.5px solid #D4DCE8", overflow: "hidden" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ background: "#F8FAFB" }}>
                  {["Nº/Série","Data","Percurso","Veículo","Motorista","Documentos","Peso","Status",""].map(h => (
                    <th key={h} style={{ padding: "10px 12px", textAlign: h === "Peso" ? "right" : "left", color: "#555", fontWeight: 600, fontSize: 11, borderBottom: "0.5px solid #EEF1F6", whiteSpace: "nowrap" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {mdfesFiltrados.map(m => {
                  const sm = STATUS_META[m.status];
                  const nCtes = m.documentos.filter(d => d.tipo === "cte").length;
                  const nNfes = m.documentos.filter(d => d.tipo === "nfe").length;
                  return (
                    <tr key={m.id} style={{ borderBottom: "0.5px solid #EEF1F6" }}>
                      <td style={{ padding: "10px 12px", fontWeight: 600, color: "#1A4870" }}>
                        {m.numero_mdfe}/{m.serie}
                        {m.chave_acesso && <div style={{ fontSize: 9, color: "#aaa", fontWeight: 400, fontFamily: "monospace" }}>{m.chave_acesso.slice(0, 12)}…</div>}
                      </td>
                      <td style={{ padding: "10px 12px" }}>{fmtData(m.data_emissao)}</td>
                      <td style={{ padding: "10px 12px", fontSize: 12 }}>
                        <div>{m.municipio_inicio}/{m.uf_inicio}</div>
                        <div style={{ color: "#888" }}>→ {m.uf_fim}</div>
                        {m.status === "encerrado" && m.municipio_encerramento && (
                          <div style={{ fontSize: 10, color: "#1A6B3C" }}>Enc.: {m.municipio_encerramento}/{m.uf_encerramento}</div>
                        )}
                      </td>
                      <td style={{ padding: "10px 12px", fontSize: 12, color: "#555" }}>
                        {m.veiculo_placa || "—"}
                        {m.veiculo_tipo && <div style={{ fontSize: 10, color: "#aaa" }}>{m.veiculo_tipo}</div>}
                      </td>
                      <td style={{ padding: "10px 12px", fontSize: 12, color: "#555" }}>{m.motorista_nome || "—"}</td>
                      <td style={{ padding: "10px 12px" }}>
                        <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                          {nCtes > 0 && badge(`${nCtes} CT-e`, "#E6F1FB", "#0C447C")}
                          {nNfes > 0 && badge(`${nNfes} NF-e`, "#E8F5E9", "#1A6B3C")}
                          {nCtes === 0 && nNfes === 0 && <span style={{ fontSize: 11, color: "#aaa" }}>Sem docs.</span>}
                        </div>
                      </td>
                      <td style={{ padding: "10px 12px", textAlign: "right", fontSize: 12 }}>
                        {m.peso_total_kg ? `${(m.peso_total_kg / 1000).toFixed(1)} ton` : "—"}
                      </td>
                      <td style={{ padding: "10px 12px" }}>{badge(sm.label, sm.bg, sm.cl)}</td>
                      <td style={{ padding: "10px 12px", textAlign: "right" }}>
                        <div style={{ display: "flex", gap: 5, justifyContent: "flex-end" }}>
                          {m.status === "rascunho" && (
                            <button onClick={() => autorizar(m)} style={{ padding: "4px 10px", border: "none", borderRadius: 6, background: "#1A6B3C", cursor: "pointer", fontSize: 11, color: "#fff", fontWeight: 600 }}>
                              Autorizar
                            </button>
                          )}
                          {m.status === "autorizado" && (
                            <button onClick={() => { setModalEnc(m); setEncForm({ data_encerramento: hoje(), municipio_encerramento: m.municipio_inicio, uf_encerramento: m.uf_fim }); }} style={{ padding: "4px 10px", border: "none", borderRadius: 6, background: "#1A4870", cursor: "pointer", fontSize: 11, color: "#fff", fontWeight: 600 }}>
                              Encerrar
                            </button>
                          )}
                          {m.status === "rascunho" && (
                            <button onClick={() => abrirEditar(m)} style={{ padding: "4px 10px", border: "0.5px solid #D4DCE8", borderRadius: 6, background: "transparent", cursor: "pointer", fontSize: 11, color: "#555" }}>
                              Editar
                            </button>
                          )}
                          {m.status === "autorizado" && (
                            <button onClick={() => cancelar(m)} style={{ padding: "4px 10px", border: "0.5px solid #E24B4A50", borderRadius: 6, background: "#FCEBEB", cursor: "pointer", fontSize: 11, color: "#791F1F" }}>
                              Cancelar
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Nota sobre DAEE */}
        <div style={{ marginTop: 16, padding: "10px 14px", background: "#D5E8F5", borderRadius: 8, fontSize: 12, color: "#0B2D50" }}>
          <strong>MDF-e obrigatório</strong> para transporte interestadual de cargas e sempre que houver múltiplos documentos fiscais por veículo.
          Motoristas CLT: sem CIOT. Transmissão à ANTT/SEFAZ via integração futura com biblioteca CT-e/MDF-e Node.js.
        </div>
      </main>

      {/* ══════════════════════════════════════════════════════
          MODAL EMISSÃO MDF-e
      ══════════════════════════════════════════════════════ */}
      {modal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "flex-start", justifyContent: "center", zIndex: 200, overflowY: "auto", padding: "24px 0" }}>
          <div style={{ background: "#fff", borderRadius: 14, width: "100%", maxWidth: 780, margin: "0 20px", boxShadow: "0 16px 48px rgba(0,0,0,0.18)" }}>

            <div style={{ padding: "18px 24px 14px", borderBottom: "0.5px solid #EEF1F6", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <div style={{ fontSize: 15, fontWeight: 700, color: "#1a1a1a" }}>{mdfeEdit ? `MDF-e ${mdfeEdit.numero_mdfe}/${mdfeEdit.serie}` : "Emitir MDF-e"}</div>
                <div style={{ fontSize: 12, color: "#888", marginTop: 2 }}>Manifesto de Documentos Fiscais Eletrônico</div>
              </div>
              <button onClick={() => setModal(false)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 20, color: "#888" }}>×</button>
            </div>

            <div style={{ padding: "20px 24px", display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
              {err && <div style={{ gridColumn: "1 / -1", background: "#FCEBEB", border: "0.5px solid #F5C6C6", borderRadius: 8, padding: "10px 14px", fontSize: 13, color: "#791F1F" }}>{err}</div>}

              {/* ── Identificação ── */}
              <div style={divider}>Identificação</div>
              <div>
                <label style={lbl}>Nº MDF-e</label>
                <input value={form.numero_mdfe} onChange={e => setForm(f => ({ ...f, numero_mdfe: e.target.value }))} style={inp} />
              </div>
              <div>
                <label style={lbl}>Série</label>
                <input value={form.serie} onChange={e => setForm(f => ({ ...f, serie: e.target.value }))} style={inp} />
              </div>
              <div>
                <label style={lbl}>Data de Emissão</label>
                <input type="date" value={form.data_emissao} onChange={e => setForm(f => ({ ...f, data_emissao: e.target.value }))} style={inp} />
              </div>

              {/* ── Percurso ── */}
              <div style={divider}>Percurso</div>
              <div>
                <label style={lbl}>UF de Início</label>
                <select value={form.uf_inicio} onChange={e => setForm(f => ({ ...f, uf_inicio: e.target.value }))} style={inp}>
                  {UFS.map(u => <option key={u} value={u}>{u}</option>)}
                </select>
              </div>
              <div style={{ gridColumn: "2 / -1" }}>
                <label style={lbl}>Município de Início (carregamento)</label>
                <input value={form.municipio_inicio} onChange={e => setForm(f => ({ ...f, municipio_inicio: e.target.value }))} style={inp} placeholder="Nova Mutum — MT" />
              </div>
              <div>
                <label style={lbl}>UF de Destino (fim)</label>
                <select value={form.uf_fim} onChange={e => setForm(f => ({ ...f, uf_fim: e.target.value }))} style={inp}>
                  {UFS.map(u => <option key={u} value={u}>{u}</option>)}
                </select>
              </div>
              <div style={{ gridColumn: "2 / -1" }}>
                <label style={lbl}>UFs do Percurso Intermediário (opcional)</label>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {UFS.filter(u => u !== form.uf_inicio && u !== form.uf_fim).map(u => {
                    const sel = form.percurso_ufs.includes(u);
                    return (
                      <button key={u} type="button"
                        onClick={() => setForm(f => ({ ...f, percurso_ufs: sel ? f.percurso_ufs.filter(x => x !== u) : [...f.percurso_ufs, u] }))}
                        style={{ padding: "3px 8px", borderRadius: 6, fontSize: 11, border: `1px solid ${sel ? "#1A4870" : "#D4DCE8"}`, background: sel ? "#D5E8F5" : "#fff", cursor: "pointer", color: sel ? "#0B2D50" : "#555", fontWeight: sel ? 600 : 400 }}>
                        {u}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* ── Veículo & Motorista ── */}
              <div style={divider}>Veículo & Motorista</div>
              <div>
                <label style={lbl}>Veículo</label>
                <select value={form.veiculo_id} onChange={e => setForm(f => ({ ...f, veiculo_id: e.target.value }))} style={inp}>
                  <option value="">— Selecionar —</option>
                  {veiculos.map(v => <option key={v.id} value={v.id}>{v.placa} — {v.tipo ?? "caminhão"}</option>)}
                </select>
              </div>
              <div>
                <label style={lbl}>Motorista</label>
                <select value={form.motorista_id} onChange={e => setForm(f => ({ ...f, motorista_id: e.target.value }))} style={inp}>
                  <option value="">— Selecionar —</option>
                  {motoristas.map(m => <option key={m.id} value={m.id}>{m.nome}</option>)}
                </select>
              </div>
              <div />

              {/* ── CT-e vinculados ── */}
              <div style={divider}>CT-e Vinculados</div>
              <div style={{ gridColumn: "1 / -1" }}>
                {ctes.length === 0 ? (
                  <div style={{ fontSize: 12, color: "#aaa", padding: "8px 0" }}>Nenhum CT-e autorizado disponível. Emita e autorize CT-e antes de emitir o MDF-e.</div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 200, overflowY: "auto", border: "0.5px solid #D4DCE8", borderRadius: 8, padding: 10 }}>
                    {ctes.map(c => {
                      const sel = form.cte_ids.includes(c.id);
                      return (
                        <label key={c.id} style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", padding: "6px 8px", borderRadius: 6, background: sel ? "#D5E8F5" : "#fff", border: `0.5px solid ${sel ? "#1A487050" : "transparent"}` }}>
                          <input type="checkbox" checked={sel} onChange={() => toggleCte(c.id)} style={{ width: 14, height: 14 }} />
                          <span style={{ fontSize: 12, flex: 1 }}>
                            <strong>CT-e {c.numero_cte}/{c.serie}</strong> — {c.remetente_nome} → {c.destinatario_nome}
                            <span style={{ color: "#888", marginLeft: 8 }}>{fmtBRL(c.valor_frete)}</span>
                          </span>
                        </label>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* ── NF-e avulsas ── */}
              <div style={divider}>NF-e Avulsas (por chave de acesso)</div>
              <div style={{ gridColumn: "1 / -1", display: "flex", flexDirection: "column", gap: 6 }}>
                {form.nfe_chaves.map((chave, idx) => (
                  <div key={idx} style={{ display: "flex", gap: 6 }}>
                    <input value={chave} onChange={e => {
                      const arr = [...form.nfe_chaves];
                      arr[idx] = e.target.value;
                      setForm(f => ({ ...f, nfe_chaves: arr }));
                    }} placeholder={`Chave de acesso ${idx + 1} (44 dígitos)`} maxLength={44} style={{ ...inp, fontFamily: "monospace", fontSize: 12 }} />
                    {form.nfe_chaves.length > 1 && (
                      <button type="button" onClick={() => setForm(f => ({ ...f, nfe_chaves: f.nfe_chaves.filter((_, i) => i !== idx) }))} style={{ padding: "0 10px", border: "0.5px solid #E24B4A50", borderRadius: 8, background: "#FCEBEB", cursor: "pointer", color: "#791F1F", fontSize: 14 }}>×</button>
                    )}
                  </div>
                ))}
                <button type="button" onClick={() => setForm(f => ({ ...f, nfe_chaves: [...f.nfe_chaves, ""] }))} style={{ ...btnR, fontSize: 12, padding: "6px 14px", alignSelf: "flex-start" }}>+ Adicionar NF-e</button>
              </div>

              {/* ── Carga ── */}
              <div style={divider}>Dados da Carga (opcional)</div>
              <div>
                <label style={lbl}>Peso Total (kg)</label>
                <input type="number" step="0.01" value={form.peso_total_kg} onChange={e => setForm(f => ({ ...f, peso_total_kg: e.target.value }))} style={inp} />
              </div>
              <div>
                <label style={lbl}>Valor Total da Carga (R$)</label>
                <input type="number" step="0.01" value={form.valor_total_carga} onChange={e => setForm(f => ({ ...f, valor_total_carga: e.target.value }))} style={inp} />
              </div>
              <div />
              <div style={{ gridColumn: "1 / -1" }}>
                <label style={lbl}>Observação</label>
                <textarea value={form.observacao} onChange={e => setForm(f => ({ ...f, observacao: e.target.value }))} rows={2} style={{ ...inp, resize: "vertical" }} />
              </div>
            </div>

            <div style={{ padding: "14px 24px 18px", borderTop: "0.5px solid #EEF1F6", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ fontSize: 12, color: "#888" }}>
                Frota própria · Motoristas CLT · Sem CIOT · Transmissão futura à ANTT/SEFAZ
              </div>
              <div style={{ display: "flex", gap: 10 }}>
                <button style={btnR} onClick={() => setModal(false)}>Cancelar</button>
                <button onClick={salvar} disabled={saving} style={{ ...btnV, background: saving ? "#aaa" : "#1A4870", cursor: saving ? "default" : "pointer" }}>
                  {saving ? "Salvando…" : (mdfeEdit ? "Salvar alterações" : "Salvar MDF-e")}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════
          MODAL ENCERRAMENTO
      ══════════════════════════════════════════════════════ */}
      {modalEnc && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 300 }}>
          <div style={{ background: "#fff", borderRadius: 14, width: "100%", maxWidth: 420, margin: "0 20px", boxShadow: "0 16px 48px rgba(0,0,0,0.18)" }}>
            <div style={{ padding: "18px 22px 14px", borderBottom: "0.5px solid #EEF1F6", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <div style={{ fontSize: 15, fontWeight: 700, color: "#1a1a1a" }}>Encerrar MDF-e</div>
                <div style={{ fontSize: 12, color: "#888", marginTop: 2 }}>MDF-e {modalEnc.numero_mdfe}/{modalEnc.serie} — {modalEnc.veiculo_placa}</div>
              </div>
              <button onClick={() => setModalEnc(null)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 20, color: "#888" }}>×</button>
            </div>
            <div style={{ padding: "20px 22px", display: "flex", flexDirection: "column", gap: 12 }}>
              <div>
                <label style={lbl}>Data de Encerramento</label>
                <input type="date" value={encForm.data_encerramento} onChange={e => setEncForm(f => ({ ...f, data_encerramento: e.target.value }))} style={inp} />
              </div>
              <div>
                <label style={lbl}>UF de Encerramento</label>
                <select value={encForm.uf_encerramento} onChange={e => setEncForm(f => ({ ...f, uf_encerramento: e.target.value }))} style={inp}>
                  {UFS.map(u => <option key={u} value={u}>{u}</option>)}
                </select>
              </div>
              <div>
                <label style={lbl}>Município de Encerramento (destino)</label>
                <input value={encForm.municipio_encerramento} onChange={e => setEncForm(f => ({ ...f, municipio_encerramento: e.target.value }))} style={inp} placeholder="Cidade onde a carga foi entregue" />
              </div>
            </div>
            <div style={{ padding: "14px 22px 18px", borderTop: "0.5px solid #EEF1F6", display: "flex", justifyContent: "flex-end", gap: 10 }}>
              <button style={btnR} onClick={() => setModalEnc(null)}>Cancelar</button>
              <button onClick={encerrar} disabled={encSaving} style={{ ...btnV, background: encSaving ? "#aaa" : "#1A6B3C", cursor: encSaving ? "default" : "pointer" }}>
                {encSaving ? "Encerrando…" : "Confirmar Encerramento"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
