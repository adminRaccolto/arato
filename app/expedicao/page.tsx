"use client";
import React, { useState, useEffect, useCallback } from "react";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../components/AuthProvider";
import TopNav from "../../components/TopNav";

// ─── Tipos ────────────────────────────────────────────────────────────────────
type RotaCarga = "transbordo_sem_nf" | "transbordo_com_remessa" | "direto_comprador";
type StatusCarga = "rascunho" | "em_transito" | "entregue" | "corrigindo_peso" | "encerrada";

interface AnoSafra { id: string; descricao: string }
interface Ciclo    { id: string; cultura: string; ano_safra_id: string }

interface Contrato {
  id: string;
  numero: string;
  produto: string;
  comprador: string;
  safra: string;
  quantidade_sc: number;
  entregue_sc: number;
  status: string;
  ano_safra_id?: string;
  ciclo_id?: string;
  modalidade?: string;
}

interface Carga {
  id: string;
  numero: string;
  contrato_id?: string;
  contrato_numero?: string;
  produto: string;
  rota: RotaCarga;
  status: StatusCarga;
  data_saida?: string;
  peso_bruto_origem_kg?: number;
  tara_origem_kg?: number;
  peso_liquido_kg?: number;
  peso_liquido_destino_kg?: number;
  peso_aproximado_kg?: number;
  divergencia_kg?: number;
  destino_razao_social?: string;
  deposito_destino?: string;
  transportadora_id?: string;
  veiculo_id?: string;
  motorista_id?: string;
  nfe_numero?: string;
  nfe_serie?: string;
  nfe_chave?: string;
  nfe_status?: string;
  mdfe_numero?: string;
  mdfe_chave?: string;
  mdfe_status?: string;
  nfe_complementar_chave?: string;
  observacao?: string;
  created_at?: string;
}

interface Transportadora { id: string; razao_social: string }
interface Veiculo        { id: string; placa: string; tipo: string }
interface Motorista      { id: string; nome: string }

// ─── Labels e cores ───────────────────────────────────────────────────────────
const STATUS_LABEL: Record<StatusCarga, string> = {
  rascunho:        "Rascunho",
  em_transito:     "Em Trânsito",
  entregue:        "Entregue",
  corrigindo_peso: "Correção de Peso",
  encerrada:       "Encerrada",
};
const STATUS_COR: Record<StatusCarga, { bg: string; color: string }> = {
  rascunho:        { bg: "#F3F6F9", color: "#555" },
  em_transito:     { bg: "#FEF3C7", color: "#92400E" },
  entregue:        { bg: "#DCFCE7", color: "#16A34A" },
  corrigindo_peso: { bg: "#FEE2E2", color: "#B91C1C" },
  encerrada:       { bg: "#D5E8F5", color: "#1A4870" },
};
const PIPELINE: StatusCarga[] = ["rascunho","em_transito","entregue","corrigindo_peso","encerrada"];

// ─── Helpers ──────────────────────────────────────────────────────────────────
const fmt  = (n?: number | null) => n != null ? n.toLocaleString("pt-BR") : "—";
const hoje = () => new Date().toISOString().slice(0, 10);

const campo = (label: string, children: React.ReactNode) => (
  <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
    <label style={{ fontSize: 11, fontWeight: 600, color: "#555", textTransform: "uppercase", letterSpacing: "0.05em" }}>{label}</label>
    {children}
  </div>
);
const inp = (props: React.InputHTMLAttributes<HTMLInputElement>) => (
  <input {...props} style={{ padding: "7px 10px", borderRadius: 6, border: "0.5px solid #DDE2EE", fontSize: 13, outline: "none", background: "#fff", ...props.style }} />
);
const sel = (props: React.SelectHTMLAttributes<HTMLSelectElement>) => (
  <select {...props} style={{ padding: "7px 10px", borderRadius: 6, border: "0.5px solid #DDE2EE", fontSize: 13, background: "#fff", outline: "none", ...props.style }} />
);

// ─── Componente ───────────────────────────────────────────────────────────────
export default function Expedicao() {
  const { fazendaId } = useAuth();

  // Dados de referência
  const [anosS, setAnosS]       = useState<AnoSafra[]>([]);
  const [ciclos, setCiclos]     = useState<Ciclo[]>([]);
  const [transp, setTransp]     = useState<Transportadora[]>([]);
  const [veiculos, setVeiculos] = useState<Veiculo[]>([]);
  const [motori, setMotori]     = useState<Motorista[]>([]);

  // Contratos
  const [contratos, setContratos]     = useState<Contrato[]>([]);
  const [carregando, setCarregando]   = useState(false);
  const [filtroAno, setFiltroAno]     = useState<string>("");
  const [filtroCiclo, setFiltroCiclo] = useState<string>("");
  const [filtroBusca, setFiltroBusca] = useState<string>("");

  // Detalhe do contrato selecionado
  const [contratoSel, setContratoSel]   = useState<Contrato | null>(null);
  const [cargas, setCargas]             = useState<Carga[]>([]);
  const [carregandoC, setCarregandoC]   = useState(false);

  // Modal nova carga
  const [modalNova, setModalNova] = useState(false);
  const [nova, setNova]           = useState<Partial<Carga>>({});
  const [saving, setSaving]       = useState(false);

  // Modal detalhe carga
  const [modalCarga, setModalCarga] = useState<Carga | null>(null);

  // Modal correção de peso
  const [modalPeso, setModalPeso]     = useState<Carga | null>(null);
  const [pesoDestino, setPesoDestino] = useState("");
  const [obsCorrecao, setObsCorrecao] = useState("");

  // Modal MDF-e
  const [modalMdfe, setModalMdfe] = useState<Carga | null>(null);
  const [mdfeForm, setMdfeForm]   = useState({ uf_ini: "MT", uf_fim: "PR", percurso: "", ciot: "", obs: "" });

  // ── Carregar referências ──────────────────────────────────────────────────
  useEffect(() => {
    if (!fazendaId) return;
    supabase.from("anos_safra").select("id,descricao").order("descricao", { ascending: false })
      .then(({ data }) => data && setAnosS(data));
    supabase.from("ciclos").select("id,cultura,ano_safra_id").order("cultura")
      .then(({ data }) => data && setCiclos(data));
    supabase.from("transportadoras").select("id,razao_social").eq("fazenda_id", fazendaId).eq("ativa", true)
      .then(({ data }) => data && setTransp(data));
    supabase.from("veiculos").select("id,placa,tipo").eq("fazenda_id", fazendaId).eq("ativo", true)
      .then(({ data }) => data && setVeiculos(data));
    supabase.from("motoristas").select("id,nome").eq("fazenda_id", fazendaId).eq("ativo", true)
      .then(({ data }) => data && setMotori(data));
  }, [fazendaId]);

  // ── Carregar contratos ────────────────────────────────────────────────────
  const carregarContratos = useCallback(async () => {
    if (!fazendaId) return;
    setCarregando(true);
    let q = supabase
      .from("contratos")
      .select("id,numero,produto,comprador,safra,quantidade_sc,entregue_sc,status,ano_safra_id,ciclo_id,modalidade")
      .eq("fazenda_id", fazendaId)
      .in("status", ["aberto","parcial","em andamento","confirmado"])
      .order("created_at", { ascending: false });
    if (filtroAno)   q = q.eq("ano_safra_id", filtroAno);
    if (filtroCiclo) q = q.eq("ciclo_id", filtroCiclo);
    const { data } = await q;
    setContratos(data ?? []);
    setCarregando(false);
  }, [fazendaId, filtroAno, filtroCiclo]);

  useEffect(() => { carregarContratos(); }, [carregarContratos]);

  // ── Carregar cargas do contrato selecionado ───────────────────────────────
  const carregarCargas = useCallback(async (contratoId: string) => {
    setCarregandoC(true);
    const { data } = await supabase
      .from("cargas_expedicao")
      .select("*")
      .eq("contrato_id", contratoId)
      .order("created_at", { ascending: false });
    setCargas(data ?? []);
    setCarregandoC(false);
  }, []);

  const selecionarContrato = (c: Contrato) => {
    setContratoSel(c);
    carregarCargas(c.id);
  };

  // ── Filtrar ciclos pelo ano safra selecionado ─────────────────────────────
  const ciclosFiltrados = filtroAno ? ciclos.filter(c => c.ano_safra_id === filtroAno) : ciclos;

  // ── Filtrar contratos por busca ───────────────────────────────────────────
  const contratosFiltrados = contratos.filter(c => {
    if (!filtroBusca) return true;
    const q = filtroBusca.toLowerCase();
    return c.numero?.toLowerCase().includes(q) ||
           c.comprador?.toLowerCase().includes(q) ||
           c.produto?.toLowerCase().includes(q);
  });

  // ── Salvar nova carga ─────────────────────────────────────────────────────
  async function salvarNovaCarga() {
    if (!fazendaId || !contratoSel || !nova.rota || !nova.data_saida) return;
    setSaving(true);
    const numero = `EXP-${Date.now().toString().slice(-6)}`;
    await supabase.from("cargas_expedicao").insert({
      ...nova,
      numero,
      fazenda_id: fazendaId,
      contrato_id: contratoSel.id,
      contrato_numero: contratoSel.numero,
      produto: contratoSel.produto,
      status: "rascunho",
    });
    setModalNova(false);
    setNova({});
    carregarCargas(contratoSel.id);
    setSaving(false);
  }

  // ── Avançar status ────────────────────────────────────────────────────────
  async function avancarStatus(carga: Carga) {
    const idx = PIPELINE.indexOf(carga.status);
    if (idx < 0 || idx >= PIPELINE.length - 1) return;
    const proximo = PIPELINE[idx + 1];
    const status = proximo === "entregue" && carga.peso_aproximado_kg && !carga.peso_liquido_destino_kg
      ? "corrigindo_peso"
      : proximo;
    await supabase.from("cargas_expedicao").update({ status }).eq("id", carga.id);
    if (contratoSel) carregarCargas(contratoSel.id);
    if (modalCarga?.id === carga.id) {
      const { data } = await supabase.from("cargas_expedicao").select("*").eq("id", carga.id).single();
      if (data) setModalCarga(data);
    }
  }

  // ── Gerar NF-e simulada ───────────────────────────────────────────────────
  async function gerarNFe(carga: Carga) {
    const cfop = carga.rota === "transbordo_com_remessa" ? "5905" :
                 carga.rota === "direto_comprador"       ? "6101" : null;
    if (!cfop) { alert("Transbordo sem NF — não gera NF-e."); return; }
    const num   = String(Math.floor(Math.random() * 90000) + 10000);
    const serie = "001";
    const chave = `35${new Date().getFullYear().toString().slice(2)}04${num.padStart(9,"0")}55${serie}${num.padStart(9,"0")}1`;
    await supabase.from("cargas_expedicao").update({
      nfe_numero: num, nfe_serie: serie, nfe_chave: chave, nfe_status: "autorizada",
    }).eq("id", carga.id);
    alert(`NF-e ${num} (CFOP ${cfop}) autorizada!\nChave: ${chave}`);
    if (contratoSel) carregarCargas(contratoSel.id);
  }

  // ── Emitir MDF-e simulado ─────────────────────────────────────────────────
  async function emitirMdfe(carga: Carga) {
    if (!carga.nfe_chave && carga.rota !== "transbordo_sem_nf") {
      alert("Gere a NF-e antes do MDF-e."); return;
    }
    const num   = String(Math.floor(Math.random() * 90000) + 10000);
    const chave = `35${new Date().getFullYear().toString().slice(2)}04MDF${num.padStart(9,"0")}55${num.padStart(9,"0")}`;
    await supabase.from("cargas_expedicao").update({
      mdfe_numero: num, mdfe_chave: chave, mdfe_status: "autorizado", status: "em_transito",
    }).eq("id", carga.id);
    alert(`MDF-e ${num} autorizado! Status → Em Trânsito`);
    setModalMdfe(null);
    if (contratoSel) carregarCargas(contratoSel.id);
  }

  // ── Correção de peso ──────────────────────────────────────────────────────
  async function salvarCorrecaoPeso() {
    if (!modalPeso || !pesoDestino) return;
    const pdKg = Number(pesoDestino);
    const divKg = (modalPeso.peso_liquido_kg ?? 0) - pdKg;
    const divPct = modalPeso.peso_liquido_kg ? Math.abs(divKg) / modalPeso.peso_liquido_kg * 100 : 0;
    let obs = obsCorrecao || modalPeso.observacao || "";
    if (divPct > 1) obs = `[NF COMPLEMENTAR NECESSÁRIA] ${obs}`.trim();
    setSaving(true);
    await supabase.from("cargas_expedicao").update({
      peso_liquido_destino_kg: pdKg, divergencia_kg: divKg, status: "encerrada", observacao: obs,
    }).eq("id", modalPeso.id);
    setModalPeso(null); setPesoDestino(""); setObsCorrecao("");
    if (contratoSel) carregarCargas(contratoSel.id);
    setSaving(false);
  }

  // ── Stats do contrato ─────────────────────────────────────────────────────
  const kgEmbarcado  = cargas.reduce((s, c) => s + (c.peso_liquido_kg ?? 0), 0);
  const scEmbarcado  = kgEmbarcado / 60;
  const scTransito   = cargas.filter(c => c.status === "em_transito").reduce((s,c) => s+(c.peso_liquido_kg??0)/60, 0);
  const scSaldo      = contratoSel ? Math.max(0, (contratoSel.quantidade_sc ?? 0) - (contratoSel.entregue_sc ?? 0) - scEmbarcado) : 0;

  // ─── Estilos base ─────────────────────────────────────────────────────────
  const modalStyle: React.CSSProperties = {
    position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)",
    display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000,
  };
  const box = (w: number): React.CSSProperties => ({
    background: "#fff", borderRadius: 12, padding: 28, width: w,
    maxHeight: "90vh", overflowY: "auto",
    boxShadow: "0 16px 48px rgba(0,0,0,0.2)",
  });

  return (
    <div style={{ fontFamily: "system-ui, sans-serif", minHeight: "100vh", background: "#F4F6FA" }}>
      <TopNav />

      {/* ─── Layout: lista contratos ◄── ──► detalhe contrato ──────────────── */}
      <div style={{ display: "flex", height: "calc(100vh - 96px)" }}>

        {/* ══════════════ PAINEL ESQUERDO — lista de contratos ══════════════ */}
        <div style={{
          width: contratoSel ? 380 : "100%",
          minWidth: 340,
          borderRight: contratoSel ? "0.5px solid #DDE2EE" : "none",
          background: "#fff",
          display: "flex", flexDirection: "column",
          transition: "width 0.2s",
          overflow: "hidden",
        }}>
          {/* Header */}
          <div style={{ padding: "20px 20px 14px", borderBottom: "0.5px solid #EEF1F6" }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: "#888", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 2 }}>Comercial</div>
            <h1 style={{ margin: "0 0 12px", fontSize: 18, fontWeight: 700, color: "#1a1a1a" }}>Expedição de Grãos</h1>

            {/* Filtros */}
            <input
              placeholder="Buscar contrato, comprador, produto..."
              value={filtroBusca}
              onChange={e => setFiltroBusca(e.target.value)}
              style={{ width: "100%", padding: "7px 10px", borderRadius: 7, border: "0.5px solid #DDE2EE", fontSize: 13, outline: "none", marginBottom: 8, boxSizing: "border-box" }}
            />
            <div style={{ display: "flex", gap: 8 }}>
              <select
                value={filtroAno}
                onChange={e => { setFiltroAno(e.target.value); setFiltroCiclo(""); }}
                style={{ flex: 1, padding: "6px 8px", borderRadius: 7, border: "0.5px solid #DDE2EE", fontSize: 12, background: "#fff", outline: "none" }}
              >
                <option value="">Todos os anos</option>
                {anosS.map(a => <option key={a.id} value={a.id}>{a.descricao}</option>)}
              </select>
              <select
                value={filtroCiclo}
                onChange={e => setFiltroCiclo(e.target.value)}
                style={{ flex: 1, padding: "6px 8px", borderRadius: 7, border: "0.5px solid #DDE2EE", fontSize: 12, background: "#fff", outline: "none" }}
              >
                <option value="">Todos os ciclos</option>
                {ciclosFiltrados.map(c => <option key={c.id} value={c.id}>{c.cultura}</option>)}
              </select>
            </div>
          </div>

          {/* Lista de contratos */}
          <div style={{ flex: 1, overflowY: "auto" }}>
            {carregando && (
              <div style={{ padding: 32, textAlign: "center", color: "#888", fontSize: 13 }}>Carregando contratos...</div>
            )}
            {!carregando && contratosFiltrados.length === 0 && (
              <div style={{ padding: 32, textAlign: "center", color: "#888", fontSize: 13 }}>
                Nenhum contrato aberto encontrado.
                <div style={{ fontSize: 12, marginTop: 6, color: "#aaa" }}>Verifique os filtros ou crie contratos em Comercial → Contratos de Grãos.</div>
              </div>
            )}
            {contratosFiltrados.map(c => {
              const saldo = Math.max(0, (c.quantidade_sc ?? 0) - (c.entregue_sc ?? 0));
              const pct   = c.quantidade_sc ? Math.min(100, ((c.entregue_sc ?? 0) / c.quantidade_sc) * 100) : 0;
              const sel   = contratoSel?.id === c.id;
              return (
                <div
                  key={c.id}
                  onClick={() => selecionarContrato(c)}
                  style={{
                    padding: "14px 20px", cursor: "pointer",
                    borderBottom: "0.5px solid #EEF1F6",
                    background: sel ? "#EBF4FF" : "transparent",
                    borderLeft: sel ? "3px solid #1A4870" : "3px solid transparent",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 }}>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 13, color: sel ? "#0B2D50" : "#1a1a1a", fontFamily: "monospace" }}>{c.numero}</div>
                      <div style={{ fontSize: 12, color: "#555", marginTop: 1 }}>{c.comprador}</div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontWeight: 700, fontSize: 13, color: "#1A4870" }}>{c.produto}</div>
                      <div style={{ fontSize: 11, color: "#888" }}>{c.safra}</div>
                    </div>
                  </div>
                  {/* Barra de progresso */}
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <div style={{ flex: 1, height: 5, background: "#EEF1F6", borderRadius: 3, overflow: "hidden" }}>
                      <div style={{ width: `${pct}%`, height: "100%", background: pct >= 100 ? "#16A34A" : "#1A4870", borderRadius: 3 }} />
                    </div>
                    <div style={{ fontSize: 11, color: "#555", whiteSpace: "nowrap" }}>
                      {(c.entregue_sc ?? 0).toLocaleString("pt-BR",{maximumFractionDigits:0})} / {(c.quantidade_sc??0).toLocaleString("pt-BR",{maximumFractionDigits:0})} sc
                    </div>
                  </div>
                  <div style={{ fontSize: 11, color: saldo > 0 ? "#EF9F27" : "#16A34A", marginTop: 4, fontWeight: 600 }}>
                    {saldo > 0 ? `Saldo: ${saldo.toLocaleString("pt-BR",{maximumFractionDigits:0})} sc a embarcar` : "Contrato integralmente embarcado"}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* ══════════════ PAINEL DIREITO — detalhe do contrato ══════════════ */}
        {contratoSel && (
          <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", background: "#F4F6FA" }}>
            {/* Header do contrato */}
            <div style={{ background: "#fff", padding: "16px 24px", borderBottom: "0.5px solid #DDE2EE", display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
                  <button
                    onClick={() => { setContratoSel(null); setCargas([]); }}
                    style={{ background: "none", border: "none", cursor: "pointer", color: "#888", fontSize: 18, padding: 0, lineHeight: 1 }}
                  >
                    ←
                  </button>
                  <span style={{ fontWeight: 700, fontSize: 16, fontFamily: "monospace", color: "#1A4870" }}>{contratoSel.numero}</span>
                  <span style={{ fontSize: 13, color: "#555" }}>—</span>
                  <span style={{ fontSize: 13, fontWeight: 600 }}>{contratoSel.comprador}</span>
                </div>
                <div style={{ fontSize: 12, color: "#666", marginLeft: 30 }}>
                  {contratoSel.produto} · {contratoSel.safra} · {contratoSel.modalidade ?? "—"}
                </div>
              </div>
              <button
                onClick={() => { setNova({ data_saida: hoje(), rota: "direto_comprador", destino_razao_social: contratoSel.comprador }); setModalNova(true); }}
                style={{ padding: "8px 18px", background: "#1A4870", color: "#fff", border: "none", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer" }}
              >
                + Nova Carga
              </button>
            </div>

            {/* KPIs do contrato */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 12, padding: "16px 24px" }}>
              {[
                { label: "Contratado",   value: `${(contratoSel.quantidade_sc??0).toLocaleString("pt-BR",{maximumFractionDigits:0})} sc`, cor: "#F4F6FA", txt: "#1a1a1a" },
                { label: "Embarcado",    value: `${scEmbarcado.toLocaleString("pt-BR",{maximumFractionDigits:0})} sc`, cor: "#D5E8F5", txt: "#1A4870" },
                { label: "Em Trânsito", value: `${scTransito.toLocaleString("pt-BR",{maximumFractionDigits:0})} sc`, cor: "#FEF3C7", txt: "#92400E" },
                { label: "Saldo",        value: `${scSaldo.toLocaleString("pt-BR",{maximumFractionDigits:0})} sc`, cor: scSaldo > 0 ? "#FBF3E0" : "#DCFCE7", txt: scSaldo > 0 ? "#C9921B" : "#16A34A" },
              ].map(k => (
                <div key={k.label} style={{ background: k.cor, borderRadius: 8, padding: "12px 16px", border: "0.5px solid #DDE2EE" }}>
                  <div style={{ fontSize: 11, color: k.txt, opacity: 0.7, marginBottom: 2, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>{k.label}</div>
                  <div style={{ fontSize: 20, fontWeight: 700, color: k.txt }}>{k.value}</div>
                </div>
              ))}
            </div>

            {/* Tabela de cargas */}
            <div style={{ flex: 1, overflowY: "auto", padding: "0 24px 24px" }}>
              {carregandoC && <div style={{ padding: 24, textAlign: "center", color: "#888", fontSize: 13 }}>Carregando cargas...</div>}
              {!carregandoC && cargas.length === 0 && (
                <div style={{ background: "#fff", borderRadius: 10, border: "0.5px solid #DDE2EE", padding: "40px 24px", textAlign: "center", color: "#888", fontSize: 13 }}>
                  Nenhuma carga registrada para este contrato.
                  <br />
                  <button
                    onClick={() => { setNova({ data_saida: hoje(), rota: "direto_comprador", destino_razao_social: contratoSel.comprador }); setModalNova(true); }}
                    style={{ marginTop: 14, padding: "8px 20px", background: "#1A4870", color: "#fff", border: "none", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer" }}
                  >
                    Registrar primeira carga
                  </button>
                </div>
              )}
              {!carregandoC && cargas.length > 0 && (
                <div style={{ background: "#fff", borderRadius: 10, border: "0.5px solid #DDE2EE", overflow: "hidden" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                    <thead>
                      <tr style={{ background: "#F4F6FA" }}>
                        {["Nº Carga","Data","Rota","Peso Liq. (kg)","NF-e","MDF-e","Status","Ações"].map(h => (
                          <th key={h} style={{ padding: "8px 12px", textAlign: "left", fontWeight: 600, fontSize: 11, color: "#666", borderBottom: "0.5px solid #DDE2EE", whiteSpace: "nowrap" }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {cargas.map(c => {
                        const sc = c.peso_liquido_kg != null ? c.peso_liquido_kg / 60 : null;
                        return (
                          <tr key={c.id} style={{ borderBottom: "0.5px solid #EEF1F6", cursor: "pointer" }}
                              onClick={() => setModalCarga(c)}>
                            <td style={{ padding: "9px 12px", fontWeight: 700, color: "#1A4870", fontFamily: "monospace" }}>{c.numero}</td>
                            <td style={{ padding: "9px 12px", color: "#555", whiteSpace: "nowrap" }}>
                              {c.data_saida ? new Date(c.data_saida + "T00:00:00").toLocaleDateString("pt-BR") : "—"}
                            </td>
                            <td style={{ padding: "9px 12px" }}>
                              <span style={{ fontSize: 11, padding: "2px 7px", borderRadius: 10,
                                background: c.rota === "transbordo_sem_nf" ? "#F3F6F9" : c.rota === "transbordo_com_remessa" ? "#FBF3E0" : "#DCFCE7",
                                color: "#333" }}>
                                {c.rota === "transbordo_sem_nf" ? "Transbordo s/NF" : c.rota === "transbordo_com_remessa" ? "Remessa 5905" : "Venda 6101"}
                              </span>
                            </td>
                            <td style={{ padding: "9px 12px", textAlign: "right", fontFamily: "monospace" }}>
                              <div style={{ fontWeight: 600 }}>{fmt(c.peso_liquido_kg)}</div>
                              {sc && <div style={{ fontSize: 11, color: "#888" }}>{sc.toFixed(1)} sc</div>}
                            </td>
                            <td style={{ padding: "9px 12px" }}>
                              {c.nfe_chave
                                ? <span style={{ fontSize: 11, padding: "2px 7px", borderRadius: 10, background: "#DCFCE7", color: "#16A34A", fontWeight: 600 }}>{c.nfe_numero} ✔</span>
                                : c.rota === "transbordo_sem_nf"
                                  ? <span style={{ fontSize: 11, color: "#888" }}>N/A</span>
                                  : <span style={{ fontSize: 11, padding: "2px 7px", borderRadius: 10, background: "#FEF3C7", color: "#92400E" }}>Pendente</span>
                              }
                            </td>
                            <td style={{ padding: "9px 12px" }}>
                              {c.mdfe_chave
                                ? <span style={{ fontSize: 11, padding: "2px 7px", borderRadius: 10, background: "#DCFCE7", color: "#16A34A", fontWeight: 600 }}>{c.mdfe_numero} ✔</span>
                                : <span style={{ fontSize: 11, padding: "2px 7px", borderRadius: 10, background: "#FEE2E2", color: "#B91C1C" }}>Pendente</span>
                              }
                            </td>
                            <td style={{ padding: "9px 12px" }}>
                              <span style={{ fontSize: 11, padding: "3px 9px", borderRadius: 10, fontWeight: 600, ...STATUS_COR[c.status] }}>
                                {STATUS_LABEL[c.status]}
                              </span>
                            </td>
                            <td style={{ padding: "9px 12px" }} onClick={e => e.stopPropagation()}>
                              <div style={{ display: "flex", gap: 4, flexWrap: "nowrap" }}>
                                {c.rota !== "transbordo_sem_nf" && !c.nfe_chave && (
                                  <button onClick={() => gerarNFe(c)}
                                    style={{ padding: "3px 8px", borderRadius: 5, border: "0.5px solid #1A4870", background: "#D5E8F5", color: "#1A4870", fontSize: 11, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap" }}>
                                    NF-e
                                  </button>
                                )}
                                {!c.mdfe_chave && (
                                  <button onClick={() => { setModalMdfe(c); setMdfeForm({ uf_ini: "MT", uf_fim: "PR", percurso: "", ciot: "", obs: "" }); }}
                                    style={{ padding: "3px 8px", borderRadius: 5, border: "0.5px solid #C9921B", background: "#FBF3E0", color: "#C9921B", fontSize: 11, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap" }}>
                                    MDF-e
                                  </button>
                                )}
                                {(c.status === "entregue" || c.status === "corrigindo_peso") && !c.peso_liquido_destino_kg && (
                                  <button onClick={() => { setModalPeso(c); setPesoDestino(""); setObsCorrecao(""); }}
                                    style={{ padding: "3px 8px", borderRadius: 5, border: "0.5px solid #E24B4A", background: "#FEE2E2", color: "#E24B4A", fontSize: 11, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap" }}>
                                    Peso
                                  </button>
                                )}
                                {c.status !== "encerrada" && (
                                  <button onClick={() => avancarStatus(c)}
                                    style={{ padding: "3px 8px", borderRadius: 5, border: "0.5px solid #DDE2EE", background: "#fff", color: "#333", fontSize: 11, cursor: "pointer" }}>
                                    →
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
            </div>
          </div>
        )}
      </div>

      {/* ════════════════════════════════════════════════════════════════════
          Modal Nova Carga
      ═══════════════════════════════════════════════════════════════════ */}
      {modalNova && (
        <div style={modalStyle} onClick={e => { if (e.target === e.currentTarget) setModalNova(false); }}>
          <div style={box(740)}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
              <div>
                <h3 style={{ margin: "0 0 2px", fontSize: 16, fontWeight: 700 }}>Nova Carga</h3>
                <div style={{ fontSize: 12, color: "#888" }}>Contrato {contratoSel?.numero} — {contratoSel?.comprador}</div>
              </div>
              <button onClick={() => setModalNova(false)} style={{ background: "none", border: "none", fontSize: 22, cursor: "pointer", color: "#888" }}>×</button>
            </div>

            {/* Seleção de rota */}
            <div style={{ marginBottom: 20 }}>
              <label style={{ fontSize: 11, fontWeight: 700, color: "#555", textTransform: "uppercase", letterSpacing: "0.05em", display: "block", marginBottom: 8 }}>Rota *</label>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
                {(["transbordo_sem_nf","transbordo_com_remessa","direto_comprador"] as RotaCarga[]).map(r => (
                  <button key={r} onClick={() => setNova(p => ({ ...p, rota: r }))}
                    style={{
                      padding: "11px 10px", borderRadius: 8, cursor: "pointer", textAlign: "center",
                      border: nova.rota === r ? "2px solid #1A4870" : "0.5px solid #DDE2EE",
                      background: nova.rota === r ? "#D5E8F5" : "#fff",
                      fontWeight: nova.rota === r ? 700 : 400, fontSize: 12,
                      color: nova.rota === r ? "#0B2D50" : "#333",
                    }}>
                    <div style={{ fontSize: 18, marginBottom: 3 }}>
                      {r === "transbordo_sem_nf" ? "🏭" : r === "transbordo_com_remessa" ? "📋" : "🚚"}
                    </div>
                    <div style={{ fontSize: 11, lineHeight: 1.3 }}>
                      {r === "transbordo_sem_nf" ? "Transbordo\ns/ Documento" :
                       r === "transbordo_com_remessa" ? "Transbordo\nCFOP 5905" :
                       "Direto Comprador\nCFOP 6101"}
                    </div>
                  </button>
                ))}
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "14px 20px", marginBottom: 18 }}>
              {campo("Data Saída *", inp({ type: "date", value: nova.data_saida ?? hoje(), onChange: e => setNova(p => ({ ...p, data_saida: e.target.value })) }))}
              {campo("Destino / Comprador", inp({ value: nova.destino_razao_social ?? "", onChange: e => setNova(p => ({ ...p, destino_razao_social: e.target.value })) }))}
              {campo("Depósito Destino", inp({ value: nova.deposito_destino ?? "", onChange: e => setNova(p => ({ ...p, deposito_destino: e.target.value })), placeholder: "Armazém, CD..." }))}
              {campo("Transportadora", sel({
                value: nova.transportadora_id ?? "",
                onChange: e => setNova(p => ({ ...p, transportadora_id: e.target.value || undefined })),
                children: [<option key="" value="">— Selecione —</option>, ...transp.map(t => <option key={t.id} value={t.id}>{t.razao_social}</option>)] as React.ReactNode,
              }))}
              {campo("Veículo", sel({
                value: nova.veiculo_id ?? "",
                onChange: e => setNova(p => ({ ...p, veiculo_id: e.target.value || undefined })),
                children: [<option key="" value="">— Selecione —</option>, ...veiculos.map(v => <option key={v.id} value={v.id}>{v.placa} — {v.tipo}</option>)] as React.ReactNode,
              }))}
              {campo("Motorista", sel({
                value: nova.motorista_id ?? "",
                onChange: e => setNova(p => ({ ...p, motorista_id: e.target.value || undefined })),
                children: [<option key="" value="">— Selecione —</option>, ...motori.map(m => <option key={m.id} value={m.id}>{m.nome}</option>)] as React.ReactNode,
              }))}
              {campo("Peso Bruto Origem (kg)", inp({ type: "number", value: nova.peso_bruto_origem_kg ?? "", onChange: e => {
                const b = Number(e.target.value);
                const t = nova.tara_origem_kg ?? 0;
                setNova(p => ({ ...p, peso_bruto_origem_kg: b, peso_liquido_kg: b > 0 ? b - t : undefined }));
              }}))}
              {campo("Tara Origem (kg)", inp({ type: "number", value: nova.tara_origem_kg ?? "", onChange: e => {
                const t = Number(e.target.value);
                const b = nova.peso_bruto_origem_kg ?? 0;
                setNova(p => ({ ...p, tara_origem_kg: t, peso_liquido_kg: b > 0 ? b - t : undefined }));
              }}))}
              {campo("Peso Líquido (kg) — auto", inp({
                value: nova.peso_liquido_kg != null ? String(nova.peso_liquido_kg) : "",
                readOnly: true,
                style: { background: "#F4F6FA", color: "#1A4870", fontWeight: 700 },
              }))}
              {campo("Peso Aprox. (kg) — se estimado", inp({
                type: "number", value: nova.peso_aproximado_kg ?? "",
                onChange: e => setNova(p => ({ ...p, peso_aproximado_kg: Number(e.target.value) || undefined })),
                placeholder: "Preencher se peso estimado",
              }))}
            </div>
            {nova.peso_aproximado_kg != null && (
              <div style={{ background: "#FBF3E0", border: "0.5px solid #C9921B", borderRadius: 8, padding: "8px 14px", marginBottom: 14, fontSize: 12, color: "#7A5A12" }}>
                Peso aproximado informado — carga exigirá correção após pesagem no destino.
              </div>
            )}
            {campo("Observação", inp({ value: nova.observacao ?? "", onChange: e => setNova(p => ({ ...p, observacao: e.target.value })) }))}
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 20 }}>
              <button onClick={() => setModalNova(false)} style={{ padding: "8px 20px", border: "0.5px solid #DDE2EE", borderRadius: 8, background: "#fff", fontSize: 13, cursor: "pointer" }}>Cancelar</button>
              <button onClick={salvarNovaCarga} disabled={saving || !nova.rota}
                style={{ padding: "8px 22px", background: "#1A4870", color: "#fff", border: "none", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
                {saving ? "Salvando..." : "Registrar Carga"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════════
          Modal Detalhe Carga
      ═══════════════════════════════════════════════════════════════════ */}
      {modalCarga && (
        <div style={modalStyle} onClick={e => { if (e.target === e.currentTarget) setModalCarga(null); }}>
          <div style={box(700)}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
              <div>
                <h3 style={{ margin: "0 0 4px", fontSize: 16, fontWeight: 700, fontFamily: "monospace" }}>{modalCarga.numero}</h3>
                <div style={{ display: "flex", gap: 8 }}>
                  <span style={{ padding: "2px 9px", borderRadius: 10, fontSize: 11, fontWeight: 600, ...STATUS_COR[modalCarga.status] }}>{STATUS_LABEL[modalCarga.status]}</span>
                  <span style={{ padding: "2px 9px", borderRadius: 10, fontSize: 11, background: "#F3F6F9", color: "#555" }}>
                    {modalCarga.rota === "transbordo_sem_nf" ? "Transbordo s/NF" : modalCarga.rota === "transbordo_com_remessa" ? "Remessa 5905" : "Venda 6101"}
                  </span>
                </div>
              </div>
              <button onClick={() => setModalCarga(null)} style={{ background: "none", border: "none", fontSize: 22, cursor: "pointer", color: "#888" }}>×</button>
            </div>

            {/* Pipeline */}
            <div style={{ display: "flex", alignItems: "center", background: "#F4F6FA", borderRadius: 8, padding: "10px 16px", marginBottom: 22, overflowX: "auto" }}>
              {PIPELINE.map((s, i) => {
                const isCurr = modalCarga.status === s;
                const isPast = PIPELINE.indexOf(modalCarga.status) > i;
                return (
                  <React.Fragment key={s}>
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4, flexShrink: 0 }}>
                      <div style={{ width: 26, height: 26, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center",
                        background: isCurr ? "#1A4870" : isPast ? "#16A34A" : "#DDE2EE",
                        color: isCurr || isPast ? "#fff" : "#888", fontSize: 11, fontWeight: 700 }}>
                        {isPast ? "✔" : i + 1}
                      </div>
                      <div style={{ fontSize: 10, color: isCurr ? "#1A4870" : isPast ? "#16A34A" : "#888", fontWeight: isCurr ? 700 : 400, whiteSpace: "nowrap" }}>{STATUS_LABEL[s]}</div>
                    </div>
                    {i < PIPELINE.length - 1 && <div style={{ flex: 1, height: 2, background: isPast ? "#16A34A" : "#DDE2EE", margin: "0 4px", marginBottom: 14, minWidth: 20 }} />}
                  </React.Fragment>
                );
              })}
            </div>

            {/* Dados */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "10px 20px", marginBottom: 18 }}>
              {[
                ["Produto", modalCarga.produto],
                ["Data Saída", modalCarga.data_saida ? new Date(modalCarga.data_saida + "T00:00:00").toLocaleDateString("pt-BR") : "—"],
                ["Destino", modalCarga.destino_razao_social || "—"],
                ["Peso Bruto Origem", modalCarga.peso_bruto_origem_kg ? fmt(modalCarga.peso_bruto_origem_kg) + " kg" : "—"],
                ["Tara Origem", modalCarga.tara_origem_kg ? fmt(modalCarga.tara_origem_kg) + " kg" : "—"],
                ["Peso Líq. Origem", modalCarga.peso_liquido_kg ? `${fmt(modalCarga.peso_liquido_kg)} kg (${(modalCarga.peso_liquido_kg/60).toFixed(1)} sc)` : "—"],
                ["Peso Líq. Destino", modalCarga.peso_liquido_destino_kg ? `${fmt(modalCarga.peso_liquido_destino_kg)} kg (${(modalCarga.peso_liquido_destino_kg/60).toFixed(1)} sc)` : "Aguardando"],
                ["Divergência", modalCarga.divergencia_kg != null ? `${fmt(Math.abs(modalCarga.divergencia_kg))} kg ${modalCarga.divergencia_kg > 0 ? "(sobra)" : "(falta)"}` : "—"],
                ["Observação", modalCarga.observacao || "—"],
              ].map(([k, v]) => (
                <div key={k}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: "#888", textTransform: "uppercase" }}>{k}</div>
                  <div style={{ fontSize: 12, color: v?.toString().startsWith("[NF COMPLEMENTAR") ? "#B91C1C" : "#1a1a1a", fontWeight: v?.toString().startsWith("[NF") ? 700 : 400 }}>{v}</div>
                </div>
              ))}
            </div>

            {/* Documentos fiscais */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 18 }}>
              {/* NF-e */}
              <div style={{ background: "#F4F6FA", borderRadius: 8, padding: "12px 14px", border: "0.5px solid #DDE2EE" }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "#555", marginBottom: 8 }}>NF-e</div>
                {modalCarga.nfe_chave ? (
                  <>
                    <div style={{ fontSize: 12, fontWeight: 600, color: "#16A34A" }}>Série {modalCarga.nfe_serie} Nº {modalCarga.nfe_numero} — Autorizada</div>
                    <div style={{ fontSize: 10, fontFamily: "monospace", color: "#888", marginTop: 4, wordBreak: "break-all" }}>{modalCarga.nfe_chave}</div>
                  </>
                ) : modalCarga.rota === "transbordo_sem_nf" ? (
                  <div style={{ fontSize: 12, color: "#888" }}>Não aplicável</div>
                ) : (
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <span style={{ fontSize: 12, color: "#EF9F27" }}>Pendente</span>
                    <button onClick={() => { gerarNFe(modalCarga); setModalCarga(null); }}
                      style={{ padding: "4px 12px", background: "#D5E8F5", color: "#1A4870", border: "0.5px solid #1A4870", borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
                      Gerar NF-e
                    </button>
                  </div>
                )}
              </div>
              {/* MDF-e */}
              <div style={{ background: "#F4F6FA", borderRadius: 8, padding: "12px 14px", border: "0.5px solid #DDE2EE" }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "#555", marginBottom: 8 }}>MDF-e</div>
                {modalCarga.mdfe_chave ? (
                  <>
                    <div style={{ fontSize: 12, fontWeight: 600, color: "#16A34A" }}>Nº {modalCarga.mdfe_numero} — Autorizado</div>
                    <div style={{ fontSize: 10, fontFamily: "monospace", color: "#888", marginTop: 4, wordBreak: "break-all" }}>{modalCarga.mdfe_chave}</div>
                  </>
                ) : (
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <span style={{ fontSize: 12, color: "#EF9F27" }}>Pendente</span>
                    <button onClick={() => { setModalMdfe(modalCarga); setModalCarga(null); setMdfeForm({ uf_ini: "MT", uf_fim: "PR", percurso: "", ciot: "", obs: "" }); }}
                      style={{ padding: "4px 12px", background: "#FBF3E0", color: "#C9921B", border: "0.5px solid #C9921B", borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
                      Emitir MDF-e
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Ações */}
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              {(modalCarga.status === "entregue" || modalCarga.status === "corrigindo_peso") && !modalCarga.peso_liquido_destino_kg && (
                <button onClick={() => { setModalPeso(modalCarga); setModalCarga(null); setPesoDestino(""); setObsCorrecao(""); }}
                  style={{ padding: "8px 16px", background: "#FEE2E2", color: "#B91C1C", border: "0.5px solid #E24B4A", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
                  Informar Peso Destino
                </button>
              )}
              {modalCarga.status !== "encerrada" && (
                <button onClick={() => { avancarStatus(modalCarga); setModalCarga(null); }}
                  style={{ padding: "8px 18px", background: "#1A4870", color: "#fff", border: "none", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
                  Avançar Status →
                </button>
              )}
              <button onClick={() => setModalCarga(null)} style={{ padding: "8px 18px", border: "0.5px solid #DDE2EE", borderRadius: 8, background: "#fff", fontSize: 13, cursor: "pointer" }}>Fechar</button>
            </div>
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════════
          Modal Correção de Peso
      ═══════════════════════════════════════════════════════════════════ */}
      {modalPeso && (
        <div style={modalStyle} onClick={e => { if (e.target === e.currentTarget) setModalPeso(null); }}>
          <div style={box(500)}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>Correção de Peso — {modalPeso.numero}</h3>
              <button onClick={() => setModalPeso(null)} style={{ background: "none", border: "none", fontSize: 22, cursor: "pointer", color: "#888" }}>×</button>
            </div>
            <div style={{ background: "#F4F6FA", borderRadius: 8, padding: "12px 16px", marginBottom: 18, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              {[["Produto", modalPeso.produto], ["Peso Liq. Origem", `${fmt(modalPeso.peso_liquido_kg)} kg`],
                ["Sacas Origem", modalPeso.peso_liquido_kg ? (modalPeso.peso_liquido_kg/60).toFixed(1) + " sc" : "—"],
                ["Destino", modalPeso.destino_razao_social || "—"]].map(([k,v]) => (
                <div key={k}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: "#888", textTransform: "uppercase" }}>{k}</div>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>{v}</div>
                </div>
              ))}
            </div>
            {campo("Peso Líquido no Destino (kg) *", inp({ type: "number", value: pesoDestino, onChange: e => setPesoDestino(e.target.value), placeholder: "Balança do comprador/armazém", autoFocus: true }))}
            {pesoDestino && Number(pesoDestino) > 0 && modalPeso.peso_liquido_kg != null && (() => {
              const div = modalPeso.peso_liquido_kg - Number(pesoDestino);
              const pct = (Math.abs(div) / modalPeso.peso_liquido_kg) * 100;
              return (
                <div style={{ marginTop: 12, padding: "12px 14px", borderRadius: 8, background: pct > 1 ? "#FEE2E2" : "#DCFCE7", border: `0.5px solid ${pct > 1 ? "#E24B4A" : "#16A34A"}` }}>
                  <div style={{ fontWeight: 700, fontSize: 13, color: pct > 1 ? "#B91C1C" : "#16A34A" }}>
                    Divergência: {fmt(Math.abs(div))} kg ({pct.toFixed(2)}%) {div > 0 ? "— falta no destino" : "— sobra no destino"}
                  </div>
                  {pct > 1 && <div style={{ fontSize: 12, color: "#555", marginTop: 4 }}>Acima de 1% — NF-e Complementar necessária.</div>}
                  <div style={{ fontSize: 12, color: "#555", marginTop: 2 }}>Sacas no destino: {(Number(pesoDestino)/60).toFixed(1)} sc</div>
                </div>
              );
            })()}
            <div style={{ marginTop: 14 }}>
              {campo("Observação", inp({ value: obsCorrecao, onChange: e => setObsCorrecao(e.target.value), placeholder: "Ex: classificação destino, reclamação..." }))}
            </div>
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 20 }}>
              <button onClick={() => setModalPeso(null)} style={{ padding: "8px 20px", border: "0.5px solid #DDE2EE", borderRadius: 8, background: "#fff", fontSize: 13, cursor: "pointer" }}>Cancelar</button>
              <button onClick={salvarCorrecaoPeso} disabled={!pesoDestino || saving}
                style={{ padding: "8px 22px", background: "#1A4870", color: "#fff", border: "none", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: pesoDestino ? "pointer" : "not-allowed" }}>
                {saving ? "Salvando..." : "Confirmar e Encerrar Carga"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════════
          Modal MDF-e
      ═══════════════════════════════════════════════════════════════════ */}
      {modalMdfe && (
        <div style={modalStyle} onClick={e => { if (e.target === e.currentTarget) setModalMdfe(null); }}>
          <div style={box(560)}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
              <div>
                <h3 style={{ margin: "0 0 2px", fontSize: 16, fontWeight: 700 }}>Emitir MDF-e</h3>
                <div style={{ fontSize: 12, color: "#888" }}>Carga {modalMdfe.numero} — {modalMdfe.produto}</div>
              </div>
              <button onClick={() => setModalMdfe(null)} style={{ background: "none", border: "none", fontSize: 22, cursor: "pointer", color: "#888" }}>×</button>
            </div>
            {modalMdfe.nfe_chave ? (
              <div style={{ background: "#DCFCE7", border: "0.5px solid #16A34A", borderRadius: 8, padding: "10px 14px", marginBottom: 18, fontSize: 12 }}>
                NF-e vinculada: <strong>Série {modalMdfe.nfe_serie} Nº {modalMdfe.nfe_numero}</strong>
              </div>
            ) : modalMdfe.rota === "transbordo_sem_nf" ? (
              <div style={{ background: "#D5E8F5", border: "0.5px solid #1A4870", borderRadius: 8, padding: "10px 14px", marginBottom: 18, fontSize: 12, color: "#1A4870" }}>
                Transbordo sem NF — MDF-e emitido sem NF-e vinculada.
              </div>
            ) : (
              <div style={{ background: "#FEE2E2", border: "0.5px solid #E24B4A", borderRadius: 8, padding: "10px 14px", marginBottom: 18, fontSize: 12, color: "#B91C1C" }}>
                Gere a NF-e antes de emitir o MDF-e.
              </div>
            )}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px 20px", marginBottom: 16 }}>
              {campo("UF Início *", inp({ value: mdfeForm.uf_ini, onChange: e => setMdfeForm(p => ({ ...p, uf_ini: e.target.value.toUpperCase() })), maxLength: 2 }))}
              {campo("UF Fim *", inp({ value: mdfeForm.uf_fim, onChange: e => setMdfeForm(p => ({ ...p, uf_fim: e.target.value.toUpperCase() })), maxLength: 2 }))}
              {campo("UFs do Percurso (ex: GO, MS)", inp({ value: mdfeForm.percurso, onChange: e => setMdfeForm(p => ({ ...p, percurso: e.target.value })) }))}
              {campo("CIOT (opcional)", inp({ value: mdfeForm.ciot, onChange: e => setMdfeForm(p => ({ ...p, ciot: e.target.value })) }))}
            </div>
            {campo("Observações", inp({ value: mdfeForm.obs, onChange: e => setMdfeForm(p => ({ ...p, obs: e.target.value })) }))}
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 20 }}>
              <button onClick={() => setModalMdfe(null)} style={{ padding: "8px 20px", border: "0.5px solid #DDE2EE", borderRadius: 8, background: "#fff", fontSize: 13, cursor: "pointer" }}>Cancelar</button>
              {(modalMdfe.nfe_chave || modalMdfe.rota === "transbordo_sem_nf") && (
                <button onClick={() => emitirMdfe(modalMdfe)}
                  style={{ padding: "8px 22px", background: "#C9921B", color: "#fff", border: "none", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
                  Emitir e Autorizar MDF-e
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
