"use client";
import { useState, useEffect, useCallback } from "react";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../components/AuthProvider";
import { listarFazendas } from "../../lib/db";
import TopNav from "../../components/TopNav";
import type { PrecosData } from "../api/precos/route";

// ─── Tipos ───────────────────────────────────────────────────────────────────

interface Fazenda   { id: string; nome: string; municipio?: string; estado?: string }
interface Ciclo     { id: string; descricao: string; cultura: string; fazenda_id?: string; ano_safra_id?: string; area_ha?: number; data_inicio?: string; data_fim?: string }
interface Talhao    { id: string; nome: string; area_ha?: number }
interface Pessoa    { id: string; nome: string }

interface Armadilha {
  id: string; fazenda_id: string; ciclo_id?: string; talhao_id?: string;
  nome: string; data_instalacao?: string; ativa: boolean; obs?: string;
  latitude?: number; longitude?: number;
  talhao_nome?: string;
  ultima_leitura?: { data: string; capturas: number };
}

interface Captura {
  id: string; armadilha_id: string; data_leitura: string; capturas: number; obs?: string;
  armadilha_nome?: string;
}

interface Modulo {
  id: string; fazenda_id: string; ciclo_id: string; talhao_id?: string;
  numero: number; data_colheita?: string; peso_estimado_kg?: number;
  localizacao_campo?: string; status: string; algodoeira_id?: string;
  data_entrega?: string; romaneio_algodoeira?: string; obs?: string;
  talhao_nome?: string; algodoeira_nome?: string;
}

interface OperacaoEspecial {
  id: string; fazenda_id: string; ciclo_id: string; talhao_id?: string;
  tipo: string; data_aplicacao: string; area_ha?: number; produto?: string;
  dose_ha?: number; unidade_dose?: string; altura_planta_cm?: number;
  nawf?: number; abertura_macas_pct?: number; obs?: string;
  talhao_nome?: string;
}

interface Beneficiamento {
  id: string; fazenda_id: string; ciclo_id: string; algodoeira_id?: string;
  data_entrada?: string; data_beneficiamento?: string; num_modulos?: number;
  peso_bruto_caroco_kg?: number; num_fardos?: number; peso_pluma_kg?: number;
  rendimento_pluma_pct?: number; peso_caroco_retorno_kg?: number;
  custo_beneficiamento?: number; num_fardo_inicial?: string; num_fardo_final?: string;
  status: string; obs?: string; algodoeira_nome?: string;
}

interface LaudoHVI {
  id: string; beneficiamento_id: string; num_fardo_inicio?: string; num_fardo_fim?: string;
  num_fardos?: number; comprimento_uhml_mm?: number; uniformidade_pct?: number;
  resistencia_gtex?: number; micronaire?: number; elongacao_pct?: number;
  reflectancia_rd?: number; amarelamento_b?: number; sfi_pct?: number;
  neps?: number; tipo_classificacao?: string; impurezas_pct?: number;
  premium_desconto_pct?: number; arquivo_pdf_url?: string; obs?: string;
  algodoeira_nome?: string;
}

// ─── HVI Referências MT ───────────────────────────────────────────────────────

function hviSemaforo(param: string, valor: number | undefined): "verde" | "amarelo" | "vermelho" {
  if (valor === undefined || valor === null) return "amarelo";
  switch (param) {
    case "comprimento":  return valor >= 29 ? "verde" : valor >= 27 ? "amarelo" : "vermelho";
    case "uniformidade": return valor >= 84 ? "verde" : valor >= 81 ? "amarelo" : "vermelho";
    case "resistencia":  return valor >= 32 ? "verde" : valor >= 28 ? "amarelo" : "vermelho";
    case "micronaire":   return (valor >= 4.0 && valor <= 4.6) ? "verde" : (valor >= 3.5 && valor <= 5.0) ? "amarelo" : "vermelho";
    case "reflectancia": return valor >= 76 ? "verde" : valor >= 72 ? "amarelo" : "vermelho";
    case "amarelamento": return valor < 8.5 ? "verde" : valor <= 9.5 ? "amarelo" : "vermelho";
    case "sfi":          return valor < 8 ? "verde" : valor <= 10 ? "amarelo" : "vermelho";
    default: return "amarelo";
  }
}

const COR_SEMAFORO: Record<string, string> = {
  verde:    "#16A34A",
  amarelo:  "#EF9F27",
  vermelho: "#E24B4A",
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

const fmtN  = (v: number | undefined, d = 0) => v != null ? v.toLocaleString("pt-BR", { minimumFractionDigits: d, maximumFractionDigits: d }) : "—";
const fmtR  = (v: number | undefined) => v != null ? v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : "—";
const fmtDt = (s?: string) => s ? new Date(s + "T12:00:00").toLocaleDateString("pt-BR") : "—";

const THRESHOLD_BICUDO = 8; // capturas/armadilha/semana → acionar pulverização

const TIPO_OP_LABEL: Record<string, string> = {
  regulador_crescimento: "Regulador de Crescimento",
  defoliacao:           "Defolhação",
};

const STATUS_MODULO_LABEL: Record<string, { label: string; cor: string }> = {
  campo:         { label: "No campo",      cor: "#16A34A" },
  em_transporte: { label: "Em transporte", cor: "#EF9F27" },
  entregue:      { label: "Entregue",      cor: "#1A4870" },
};

const STATUS_BENEF_LABEL: Record<string, { label: string; cor: string }> = {
  em_processamento: { label: "Em processamento", cor: "#EF9F27" },
  concluido:        { label: "Concluído",         cor: "#16A34A" },
};

// ─── Estilos base ─────────────────────────────────────────────────────────────

const card: React.CSSProperties = {
  background: "#fff", borderRadius: 12, border: "0.5px solid #DDE2EE",
  padding: "20px 24px",
};

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
  padding: "8px 18px", background: "#1A4870", color: "#fff",
  border: "none", borderRadius: 8, fontWeight: 600, cursor: "pointer", fontSize: 13,
};

const btnSec: React.CSSProperties = {
  padding: "8px 14px", background: "#fff", color: "#555",
  border: "0.5px solid #D4DCE8", borderRadius: 8, fontWeight: 500, cursor: "pointer", fontSize: 13,
};

// ─── Página Principal ─────────────────────────────────────────────────────────

export default function AlgodaoPage() {
  const { fazendaId, contaId, fazendaIds, userRole } = useAuth();

  // ── Seletores globais ──
  const [fazendas,    setFazendas]    = useState<Fazenda[]>([]);
  const [fazTrabalho, setFazTrabalho] = useState("");
  const [ciclos,      setCiclos]      = useState<Ciclo[]>([]);
  const [cicloSel,    setCicloSel]    = useState("");
  const [talhoes,     setTalhoes]     = useState<Talhao[]>([]);
  const [pessoas,     setPessoas]     = useState<Pessoa[]>([]);     // algodoeiras / compradores

  // ── Aba ──
  const [aba, setAba] = useState<"safra" | "bicudo" | "modulos" | "algodoeira" | "hvi" | "posicao">("safra");

  // ── Dados ──
  const [operacoes,      setOperacoes]      = useState<OperacaoEspecial[]>([]);
  const [armadilhas,     setArmadilhas]     = useState<Armadilha[]>([]);
  const [capturas,       setCapturas]       = useState<Captura[]>([]);
  const [modulos,        setModulos]        = useState<Modulo[]>([]);
  const [beneficiamentos, setBeneficiamentos] = useState<Beneficiamento[]>([]);
  const [laudosHVI,      setLaudosHVI]      = useState<LaudoHVI[]>([]);
  const [precos,         setPrecos]         = useState<PrecosData | null>(null);
  const [carregando,     setCarregando]     = useState(false);

  // ── Modais ──
  const [modalOp,    setModalOp]    = useState<Partial<OperacaoEspecial> | null>(null);
  const [modalArm,   setModalArm]   = useState<Partial<Armadilha> | null>(null);
  const [modalCap,   setModalCap]   = useState<{ armadilha_id: string; armadilha_nome: string } | null>(null);
  const [modalMod,   setModalMod]   = useState<Partial<Modulo> | null>(null);
  const [modalBenef, setModalBenef] = useState<Partial<Beneficiamento> | null>(null);
  const [modalHVI,   setModalHVI]   = useState<Partial<LaudoHVI> & { beneficiamento_id?: string } | null>(null);
  const [salvando,   setSalvando]   = useState(false);
  const [msg,        setMsg]        = useState<string | null>(null);

  // ─── Carrega fazendas no mount ────────────────────────────────────────────

  useEffect(() => {
    if (!fazendaId && !contaId) return;
    const load = async () => {
      if (userRole === "raccotlo" && (contaId || fazendaId)) {
        const r = await fetch("/api/fazenda/da-conta", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ conta_id: contaId, fazenda_id: fazendaId }),
        });
        const j = await r.json();
        if (j.ok) {
          setFazendas(j.fazendas ?? []);
          setFazTrabalho(prev => prev || fazendaId || j.fazendas?.[0]?.id || "");
        }
      } else {
        const fzs = await listarFazendas();
        setFazendas(fzs);
        setFazTrabalho(prev => prev || fazendaId || fzs[0]?.id || "");
      }
    };
    load();
  }, [fazendaId, contaId, userRole]);

  // ─── Carrega talhões e ciclos quando fazenda muda ─────────────────────────

  useEffect(() => {
    if (!fazTrabalho) return;
    // talhões e pessoas — têm fazenda_id direto
    supabase.from("talhoes").select("id, nome, area_ha").eq("fazenda_id", fazTrabalho).order("nome")
      .then(({ data }) => setTalhoes((data ?? []) as Talhao[]));
    supabase.from("pessoas").select("id, nome").order("nome")
      .then(({ data }) => setPessoas((data ?? []) as Pessoa[]));
    // Busca ciclos pela fazenda_id direta (ciclos tem fazenda_id) — dois caminhos para garantir
    const loadCiclos = async () => {
      // caminho 1: direto por fazenda_id
      const { data: direto } = await supabase
        .from("ciclos")
        .select("id, descricao, cultura, ano_safra_id, fazenda_id, area_ha, data_inicio, data_fim")
        .eq("fazenda_id", fazTrabalho)
        .order("descricao", { ascending: false });

      if (direto && direto.length > 0) {
        // mostra todos — label inclui cultura para o usuário poder identificar
        setCiclos(direto as Ciclo[]);
        const alg = (direto as Ciclo[]).find(c => (c.cultura ?? "").toLowerCase().includes("algod"));
        setCicloSel(prev => prev || alg?.id || direto[0]?.id || "");
        return;
      }

      // caminho 2: via anos_safra (fallback caso fazenda_id em ciclos esteja NULL)
      const { data: anos } = await supabase
        .from("anos_safra").select("id").eq("fazenda_id", fazTrabalho);
      const anoIds = (anos ?? []).map((a: { id: string }) => a.id);
      if (anoIds.length === 0) { setCiclos([]); setCicloSel(""); return; }
      const { data } = await supabase
        .from("ciclos")
        .select("id, descricao, cultura, ano_safra_id, fazenda_id, area_ha, data_inicio, data_fim")
        .in("ano_safra_id", anoIds)
        .order("descricao", { ascending: false });
      const todos = (data ?? []) as Ciclo[];
      setCiclos(todos);
      const alg = todos.find(c => (c.cultura ?? "").toLowerCase().includes("algod"));
      setCicloSel(prev => prev || alg?.id || todos[0]?.id || "");
    };
    loadCiclos();
  }, [fazTrabalho]);

  // ─── Carrega dados quando ciclo muda ─────────────────────────────────────

  const carregarDados = useCallback(async () => {
    if (!fazTrabalho || !cicloSel) return;
    setCarregando(true);
    const fid = fazTrabalho;

    const [opRes, armRes, modRes, benefRes, hvRes] = await Promise.allSettled([
      supabase.from("algodao_operacoes_especiais").select("*, talhoes(nome)").eq("fazenda_id", fid).eq("ciclo_id", cicloSel).order("data_aplicacao", { ascending: false }),
      supabase.from("bicudo_armadilhas").select("*, talhoes(nome)").eq("fazenda_id", fid).eq("ciclo_id", cicloSel),
      supabase.from("algodao_modulos").select("*, talhoes(nome), pessoas(nome)").eq("fazenda_id", fid).eq("ciclo_id", cicloSel).order("numero"),
      supabase.from("algodao_beneficiamentos").select("*, pessoas(nome)").eq("fazenda_id", fid).eq("ciclo_id", cicloSel).order("data_entrada", { ascending: false }),
      supabase.from("algodao_laudos_hvi").select("*, algodao_beneficiamentos(algodoeira_id, pessoas(nome))").order("created_at", { ascending: false }),
    ]);

    if (opRes.status === "fulfilled" && opRes.value.data) {
      setOperacoes(opRes.value.data.map((r: Record<string, unknown>) => ({ ...r, talhao_nome: (r.talhoes as { nome?: string } | null)?.nome })) as OperacaoEspecial[]);
    }
    if (armRes.status === "fulfilled" && armRes.value.data) {
      const arms = armRes.value.data.map((r: Record<string, unknown>) => ({ ...r, talhao_nome: (r.talhoes as { nome?: string } | null)?.nome })) as Armadilha[];
      // busca última captura por armadilha
      const armIds = arms.map(a => a.id);
      if (armIds.length > 0) {
        const { data: caps } = await supabase.from("bicudo_capturas").select("armadilha_id, data_leitura, capturas").in("armadilha_id", armIds).order("data_leitura", { ascending: false });
        const ultimas: Record<string, { data: string; capturas: number }> = {};
        (caps ?? []).forEach((c: { armadilha_id: string; data_leitura: string; capturas: number }) => {
          if (!ultimas[c.armadilha_id]) ultimas[c.armadilha_id] = { data: c.data_leitura, capturas: c.capturas };
        });
        arms.forEach(a => { a.ultima_leitura = ultimas[a.id]; });
      }
      setArmadilhas(arms);
      // capturas das últimas 8 semanas
      if (armIds.length > 0) {
        const { data: allCaps } = await supabase.from("bicudo_capturas").select("*, bicudo_armadilhas(nome)").in("armadilha_id", armIds).order("data_leitura", { ascending: false }).limit(200);
        setCapturas((allCaps ?? []).map((c: Record<string, unknown>) => ({ ...c, armadilha_nome: (c.bicudo_armadilhas as { nome?: string } | null)?.nome })) as Captura[]);
      }
    }
    if (modRes.status === "fulfilled" && modRes.value.data) {
      setModulos(modRes.value.data.map((r: Record<string, unknown>) => ({
        ...r,
        talhao_nome:    (r.talhoes as { nome?: string } | null)?.nome,
        algodoeira_nome: (r.pessoas as { nome?: string } | null)?.nome,
      })) as Modulo[]);
    }
    if (benefRes.status === "fulfilled" && benefRes.value.data) {
      setBeneficiamentos(benefRes.value.data.map((r: Record<string, unknown>) => ({
        ...r, algodoeira_nome: (r.pessoas as { nome?: string } | null)?.nome,
      })) as Beneficiamento[]);
    }
    if (hvRes.status === "fulfilled" && hvRes.value.data) {
      const benefIds = beneficiamentos.map(b => b.id);
      const hvFiltrado = hvRes.value.data.filter((r: Record<string, unknown>) => benefIds.includes(r.beneficiamento_id as string));
      setLaudosHVI(hvFiltrado.map((r: Record<string, unknown>) => ({
        ...r,
        algodoeira_nome: ((r.algodao_beneficiamentos as { pessoas?: { nome?: string } } | null)?.pessoas as { nome?: string } | undefined)?.nome,
      })) as LaudoHVI[]);
    }
    setCarregando(false);
  }, [fazTrabalho, cicloSel, beneficiamentos.length]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { carregarDados(); }, [fazTrabalho, cicloSel]); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Preços ao vivo ───────────────────────────────────────────────────────

  useEffect(() => {
    fetch("/api/precos").then(r => r.json()).then(setPrecos).catch(() => {});
  }, []);

  // ─── Aba por query param ──────────────────────────────────────────────────

  useEffect(() => {
    if (typeof window === "undefined") return;
    const p = new URLSearchParams(window.location.search).get("aba");
    if (p && ["safra","bicudo","modulos","algodoeira","hvi","posicao"].includes(p)) setAba(p as typeof aba);
  }, []);

  // ─── Salvar operação especial ─────────────────────────────────────────────

  async function salvarOperacao() {
    if (!modalOp || !fazTrabalho || !cicloSel) return;
    if (!modalOp.tipo || !modalOp.data_aplicacao) { setMsg("Tipo e data são obrigatórios."); return; }
    setSalvando(true); setMsg(null);
    const payload = { ...modalOp, fazenda_id: fazTrabalho, ciclo_id: cicloSel };
    const { error } = modalOp.id
      ? await supabase.from("algodao_operacoes_especiais").update(payload).eq("id", modalOp.id)
      : await supabase.from("algodao_operacoes_especiais").insert(payload);
    setSalvando(false);
    if (error) { setMsg(error.message); return; }
    setModalOp(null); carregarDados();
  }

  // ─── Salvar armadilha ────────────────────────────────────────────────────

  async function salvarArmadilha() {
    if (!modalArm || !fazTrabalho || !cicloSel) return;
    if (!modalArm.nome) { setMsg("Nome é obrigatório."); return; }
    setSalvando(true); setMsg(null);
    const payload = { ...modalArm, fazenda_id: fazTrabalho, ciclo_id: cicloSel, ativa: true };
    const { error } = modalArm.id
      ? await supabase.from("bicudo_armadilhas").update(payload).eq("id", modalArm.id)
      : await supabase.from("bicudo_armadilhas").insert(payload);
    setSalvando(false);
    if (error) { setMsg(error.message); return; }
    setModalArm(null); carregarDados();
  }

  // ─── Salvar captura ──────────────────────────────────────────────────────

  async function salvarCaptura(armId: string, data: string, qtd: number) {
    setSalvando(true); setMsg(null);
    const { error } = await supabase.from("bicudo_capturas")
      .upsert({ armadilha_id: armId, data_leitura: data, capturas: qtd }, { onConflict: "armadilha_id,data_leitura" });
    setSalvando(false);
    if (error) { setMsg(error.message); return; }
    setModalCap(null); carregarDados();
  }

  // ─── Salvar módulo ───────────────────────────────────────────────────────

  async function salvarModulo() {
    if (!modalMod || !fazTrabalho || !cicloSel) return;
    if (!modalMod.numero) { setMsg("Número do módulo é obrigatório."); return; }
    setSalvando(true); setMsg(null);
    const payload = { ...modalMod, fazenda_id: fazTrabalho, ciclo_id: cicloSel, status: modalMod.status ?? "campo" };
    const { error } = modalMod.id
      ? await supabase.from("algodao_modulos").update(payload).eq("id", modalMod.id)
      : await supabase.from("algodao_modulos").insert(payload);
    setSalvando(false);
    if (error) { setMsg(error.message); return; }
    setModalMod(null); carregarDados();
  }

  // ─── Salvar beneficiamento ───────────────────────────────────────────────

  async function salvarBeneficiamento() {
    if (!modalBenef || !fazTrabalho || !cicloSel) return;
    setSalvando(true); setMsg(null);
    const payload = { ...modalBenef, fazenda_id: fazTrabalho, ciclo_id: cicloSel, status: modalBenef.status ?? "em_processamento" };
    const { error } = modalBenef.id
      ? await supabase.from("algodao_beneficiamentos").update(payload).eq("id", modalBenef.id)
      : await supabase.from("algodao_beneficiamentos").insert(payload);
    setSalvando(false);
    if (error) { setMsg(error.message); return; }
    setModalBenef(null); carregarDados();
  }

  // ─── Salvar laudo HVI ────────────────────────────────────────────────────

  async function salvarHVI() {
    if (!modalHVI?.beneficiamento_id) { setMsg("Selecione o beneficiamento."); return; }
    setSalvando(true); setMsg(null);
    const payload = { ...modalHVI };
    const { error } = modalHVI.id
      ? await supabase.from("algodao_laudos_hvi").update(payload).eq("id", modalHVI.id)
      : await supabase.from("algodao_laudos_hvi").insert(payload);
    setSalvando(false);
    if (error) { setMsg(error.message); return; }
    setModalHVI(null); carregarDados();
  }

  // ─── Cálculos de posição ─────────────────────────────────────────────────

  const totalModulos     = modulos.length;
  const modulosEntregues = modulos.filter(m => m.status === "entregue").length;
  const pesoEstimadoKg   = modulos.reduce((s, m) => s + (m.peso_estimado_kg ?? 0), 0);
  const totalFardos      = beneficiamentos.reduce((s, b) => s + (b.num_fardos ?? 0), 0);
  const totalPlumaKg     = beneficiamentos.reduce((s, b) => s + (b.peso_pluma_kg ?? 0), 0);
  const totalCarocoKg    = beneficiamentos.reduce((s, b) => s + (b.peso_caroco_retorno_kg ?? 0), 0);
  const rendMedPct       = beneficiamentos.length ? beneficiamentos.reduce((s, b) => s + (b.rendimento_pluma_pct ?? 0), 0) / beneficiamentos.length : 0;

  const preco_arroba      = precos?.algodao?.brl ?? 0;
  const preco_cbot_cents  = precos?.algodao?.cbot ?? 0;
  const variacaoAlg       = precos?.algodao?.variacao ?? 0;
  const usdBrl            = precos?.usdBrl ?? 5.9;

  // 1 fardo ≈ 220 kg pluma ≈ 14,67 @ pluma
  const PESO_FARDO_KG     = 220;
  const valorEstoqueR     = totalFardos * PESO_FARDO_KG / 15 * preco_arroba;

  const cicloAtual = ciclos.find(c => c.id === cicloSel);
  const areaHa     = cicloAtual?.area_ha ?? 0;

  // ─── Render ───────────────────────────────────────────────────────────────

  const ABAS: { key: typeof aba; label: string }[] = [
    { key: "safra",      label: "Safra & Operações" },
    { key: "bicudo",     label: "🔴 Bicudo" },
    { key: "modulos",    label: "Colheita & Módulos" },
    { key: "algodoeira", label: "Algodoeira" },
    { key: "hvi",        label: "HVI & Qualidade" },
    { key: "posicao",    label: "⭐ Posição" },
  ];

  const alertasBicudo = armadilhas.filter(a => a.ultima_leitura && a.ultima_leitura.capturas >= THRESHOLD_BICUDO);

  return (
    <>
    <TopNav />
    <div style={{ padding: "24px 28px", fontFamily: "system-ui, sans-serif", fontSize: 13, background: "#F4F6FA", minHeight: "100vh" }}>

      {/* ── Cabeçalho ── */}
      <div style={{ marginBottom: 20, display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
        <div>
          <h1 style={{ margin: "0 0 2px", fontSize: 22, fontWeight: 800, color: "#0B1E35", letterSpacing: "-0.3px" }}>
            Módulo Algodão
          </h1>
          <p style={{ margin: 0, fontSize: 13, color: "#888" }}>Lavoura · Bicudo · Módulos · Algodoeira · HVI · Posição</p>
        </div>
        {/* Seletores: Fazenda + Ciclo */}
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <div>
            <label style={{ ...lbl, marginBottom: 2 }}>Fazenda *</label>
            <select value={fazTrabalho} onChange={e => { setFazTrabalho(e.target.value); setCicloSel(""); }} style={{ ...inp, width: 200, fontWeight: 600, color: "#1A4870" }}>
              <option value="">— selecionar —</option>
              {fazendas.map(f => <option key={f.id} value={f.id}>{f.nome}</option>)}
            </select>
          </div>
          <div>
            <label style={{ ...lbl, marginBottom: 2 }}>Ciclo de Algodão *</label>
            <select value={cicloSel} onChange={e => setCicloSel(e.target.value)} style={{ ...inp, width: 240, fontWeight: 600 }} disabled={!fazTrabalho}>
              <option value="">— selecionar ciclo —</option>
              {ciclos.map(c => <option key={c.id} value={c.id}>{c.descricao}{c.cultura && ` — ${c.cultura}`}</option>)}
            </select>
          </div>
          {!fazTrabalho && <span style={{ fontSize: 11, color: "#E24B4A", alignSelf: "flex-end", paddingBottom: 6 }}>Selecione a fazenda</span>}
        </div>
      </div>

      {/* ── Preço algodão ao vivo ── */}
      {precos && (
        <div style={{ ...card, marginBottom: 16, display: "flex", gap: 20, alignItems: "center", flexWrap: "wrap", background: "#0B1E35", color: "#fff", padding: "12px 20px" }}>
          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", textTransform: "uppercase", letterSpacing: 1 }}>Algodão Mercado</div>
          <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
            <div>
              <span style={{ fontSize: 20, fontWeight: 800 }}>{fmtN(preco_cbot_cents, 2)}</span>
              <span style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", marginLeft: 4 }}>¢/lb (ICE)</span>
            </div>
            <div>
              <span style={{ fontSize: 20, fontWeight: 800 }}>{fmtR(preco_arroba)}</span>
              <span style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", marginLeft: 4 }}>R$/@</span>
            </div>
            <div>
              <span style={{ fontSize: 20, fontWeight: 800 }}>{fmtR(preco_arroba / 15 * PESO_FARDO_KG)}</span>
              <span style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", marginLeft: 4 }}>R$/fardo (~{PESO_FARDO_KG}kg)</span>
            </div>
            <div>
              <span style={{ fontSize: 14, fontWeight: 700, color: variacaoAlg >= 0 ? "#4ADE80" : "#F87171" }}>
                {variacaoAlg >= 0 ? "▲" : "▼"} {Math.abs(variacaoAlg).toFixed(1)}%
              </span>
            </div>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)" }}>USD/BRL: {fmtN(usdBrl, 2)}</div>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)" }}>
              {new Date(precos.atualizadoEm).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
            </div>
          </div>
        </div>
      )}

      {/* Alerta bicudo */}
      {alertasBicudo.length > 0 && (
        <div style={{ background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: 10, padding: "12px 16px", marginBottom: 16, display: "flex", gap: 10, alignItems: "flex-start" }}>
          <span style={{ fontSize: 18 }}>⚠️</span>
          <div>
            <div style={{ fontWeight: 700, color: "#B91C1C", marginBottom: 2 }}>Alerta de Bicudo do Algodoeiro</div>
            <div style={{ color: "#7F1D1D", fontSize: 12 }}>
              {alertasBicudo.length} armadilha{alertasBicudo.length !== 1 ? "s" : ""} acima do threshold ({THRESHOLD_BICUDO} capturas/semana):{" "}
              {alertasBicudo.map(a => `${a.nome} (${a.ultima_leitura?.capturas})`).join(", ")}. Acionar pulverização dirigida.
            </div>
          </div>
        </div>
      )}

      {/* ── Abas ── */}
      <div style={{ display: "flex", gap: 2, marginBottom: 16, borderBottom: "0.5px solid #DDE2EE" }}>
        {ABAS.map(a => (
          <button key={a.key} onClick={() => setAba(a.key)} style={{
            padding: "9px 16px", border: "none", cursor: "pointer",
            fontSize: 13, fontWeight: aba === a.key ? 700 : 400,
            color: aba === a.key ? "#1A4870" : "#666",
            background: "transparent",
            borderBottom: aba === a.key ? "2.5px solid #1A4870" : "2.5px solid transparent",
            marginBottom: -1,
          }}>{a.label}</button>
        ))}
      </div>

      {!fazTrabalho || !cicloSel ? (
        <div style={{ ...card, textAlign: "center", padding: "60px 0", color: "#888" }}>
          Selecione a fazenda e o ciclo de algodão para visualizar os dados.
        </div>
      ) : carregando ? (
        <div style={{ ...card, textAlign: "center", padding: "60px 0", color: "#888" }}>Carregando…</div>
      ) : (
        <>
          {/* ═══════ ABA: SAFRA & OPERAÇÕES ═══════ */}
          {aba === "safra" && (
            <div>
              {/* Stat cards */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 16 }}>
                {[
                  { label: "Área Plantada", valor: areaHa ? `${fmtN(areaHa, 1)} ha` : "—", sub: "do ciclo" },
                  { label: "Módulos Colhidos", valor: fmtN(totalModulos), sub: `${modulosEntregues} entregues` },
                  { label: "Fardos Produzidos", valor: fmtN(totalFardos), sub: `${fmtN(totalPlumaKg / 1000, 1)} ton pluma` },
                  { label: "Rendimento Médio", valor: rendMedPct ? `${fmtN(rendMedPct, 1)}%` : "—", sub: "pluma / caroço" },
                ].map(c => (
                  <div key={c.label} style={{ ...card }}>
                    <div style={{ fontSize: 11, color: "#888", fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 }}>{c.label}</div>
                    <div style={{ fontSize: 22, fontWeight: 800, color: "#0B1E35" }}>{c.valor}</div>
                    <div style={{ fontSize: 11, color: "#aaa" }}>{c.sub}</div>
                  </div>
                ))}
              </div>

              {/* Operações Especiais */}
              <div style={{ ...card }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                  <div style={{ fontWeight: 700, fontSize: 15, color: "#0B1E35" }}>Operações Especiais do Algodão</div>
                  <button style={btnPrimary} onClick={() => setModalOp({})}>+ Nova Operação</button>
                </div>
                {operacoes.length === 0 ? (
                  <div style={{ textAlign: "center", padding: "32px 0", color: "#aaa" }}>Nenhuma operação registrada. Registre reguladores de crescimento e defolhações.</div>
                ) : (
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead>
                      <tr style={{ background: "#F3F6F9" }}>
                        {["Tipo","Data","Talhão","Produto","Dose","Área (ha)","NAWF / Alt. (cm)","Açab. Maçãs","Ações"].map(h => (
                          <th key={h} style={{ padding: "8px 10px", textAlign: "left", fontSize: 11, color: "#555", fontWeight: 600, borderBottom: "0.5px solid #DDE2EE", whiteSpace: "nowrap" }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {operacoes.map((o, i) => (
                        <tr key={o.id} style={{ background: i % 2 === 0 ? "#fff" : "#FAFBFD" }}>
                          <td style={{ padding: "8px 10px" }}>
                            <span style={{ padding: "2px 8px", borderRadius: 6, fontSize: 11, fontWeight: 700, background: o.tipo === "defoliacao" ? "#FEF3C7" : "#D5E8F5", color: o.tipo === "defoliacao" ? "#92400E" : "#1A4870" }}>
                              {TIPO_OP_LABEL[o.tipo] ?? o.tipo}
                            </span>
                          </td>
                          <td style={{ padding: "8px 10px" }}>{fmtDt(o.data_aplicacao)}</td>
                          <td style={{ padding: "8px 10px" }}>{o.talhao_nome ?? "—"}</td>
                          <td style={{ padding: "8px 10px" }}>{o.produto ?? "—"}</td>
                          <td style={{ padding: "8px 10px" }}>{o.dose_ha ? `${o.dose_ha} ${o.unidade_dose ?? "L/ha"}` : "—"}</td>
                          <td style={{ padding: "8px 10px" }}>{fmtN(o.area_ha, 1)}</td>
                          <td style={{ padding: "8px 10px" }}>{o.nawf != null ? `${o.nawf} NAWF` : o.altura_planta_cm != null ? `${o.altura_planta_cm} cm` : "—"}</td>
                          <td style={{ padding: "8px 10px" }}>{o.abertura_macas_pct != null ? `${o.abertura_macas_pct}%` : "—"}</td>
                          <td style={{ padding: "8px 10px" }}>
                            <button style={{ ...btnSec, padding: "4px 10px", fontSize: 12 }} onClick={() => setModalOp(o)}>✏️</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          )}

          {/* ═══════ ABA: BICUDO ═══════ */}
          {aba === "bicudo" && (
            <div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                {/* Armadilhas */}
                <div style={{ ...card }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                    <div style={{ fontWeight: 700, fontSize: 15, color: "#0B1E35" }}>Armadilhas Cadastradas</div>
                    <button style={btnPrimary} onClick={() => setModalArm({})}>+ Nova Armadilha</button>
                  </div>
                  {armadilhas.length === 0 ? (
                    <div style={{ textAlign: "center", padding: "32px 0", color: "#aaa" }}>Nenhuma armadilha cadastrada.</div>
                  ) : (
                    <table style={{ width: "100%", borderCollapse: "collapse" }}>
                      <thead>
                        <tr style={{ background: "#F3F6F9" }}>
                          {["Armadilha","Talhão","Última leitura","Capturas","Status",""].map(h => (
                            <th key={h} style={{ padding: "7px 10px", textAlign: "left", fontSize: 11, color: "#555", fontWeight: 600, borderBottom: "0.5px solid #DDE2EE" }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {armadilhas.map((a, i) => {
                          const alerta = a.ultima_leitura && a.ultima_leitura.capturas >= THRESHOLD_BICUDO;
                          return (
                            <tr key={a.id} style={{ background: alerta ? "#FEF2F2" : i % 2 === 0 ? "#fff" : "#FAFBFD" }}>
                              <td style={{ padding: "8px 10px", fontWeight: 600 }}>{a.nome}</td>
                              <td style={{ padding: "8px 10px" }}>{a.talhao_nome ?? "—"}</td>
                              <td style={{ padding: "8px 10px" }}>{a.ultima_leitura ? fmtDt(a.ultima_leitura.data) : "—"}</td>
                              <td style={{ padding: "8px 10px" }}>
                                {a.ultima_leitura ? (
                                  <span style={{ fontWeight: 700, color: alerta ? "#B91C1C" : "#16A34A", fontSize: 15 }}>{a.ultima_leitura.capturas}</span>
                                ) : "—"}
                                {alerta && <span style={{ marginLeft: 4, fontSize: 11, color: "#B91C1C" }}>⚠️ ACIONAR</span>}
                              </td>
                              <td style={{ padding: "8px 10px" }}>
                                <span style={{ color: a.ativa ? "#16A34A" : "#aaa", fontSize: 11 }}>{a.ativa ? "Ativa" : "Inativa"}</span>
                              </td>
                              <td style={{ padding: "8px 10px" }}>
                                <button style={{ ...btnSec, padding: "4px 8px", fontSize: 11, marginRight: 4 }} onClick={() => setModalCap({ armadilha_id: a.id, armadilha_nome: a.nome })}>+ Leitura</button>
                                <button style={{ ...btnSec, padding: "4px 8px", fontSize: 11 }} onClick={() => setModalArm(a)}>✏️</button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  )}
                  <div style={{ marginTop: 10, fontSize: 11, color: "#888" }}>
                    Threshold: <strong>{THRESHOLD_BICUDO} capturas/semana</strong> por armadilha → acionar pulverização dirigida.
                  </div>
                </div>

                {/* Histórico de capturas */}
                <div style={{ ...card }}>
                  <div style={{ fontWeight: 700, fontSize: 15, color: "#0B1E35", marginBottom: 14 }}>Histórico de Capturas — Últimas 10 Leituras</div>
                  {capturas.length === 0 ? (
                    <div style={{ textAlign: "center", padding: "32px 0", color: "#aaa" }}>Sem leituras registradas.</div>
                  ) : (
                    <table style={{ width: "100%", borderCollapse: "collapse" }}>
                      <thead>
                        <tr style={{ background: "#F3F6F9" }}>
                          {["Data","Armadilha","Capturas","Situação"].map(h => (
                            <th key={h} style={{ padding: "7px 10px", textAlign: "left", fontSize: 11, color: "#555", fontWeight: 600, borderBottom: "0.5px solid #DDE2EE" }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {capturas.slice(0, 10).map((c, i) => {
                          const alerta = c.capturas >= THRESHOLD_BICUDO;
                          return (
                            <tr key={c.id} style={{ background: alerta ? "#FEF2F2" : i % 2 === 0 ? "#fff" : "#FAFBFD" }}>
                              <td style={{ padding: "7px 10px" }}>{fmtDt(c.data_leitura)}</td>
                              <td style={{ padding: "7px 10px", fontWeight: 600 }}>{c.armadilha_nome}</td>
                              <td style={{ padding: "7px 10px" }}>
                                <span style={{ fontWeight: 700, fontSize: 15, color: alerta ? "#B91C1C" : "#16A34A" }}>{c.capturas}</span>
                              </td>
                              <td style={{ padding: "7px 10px" }}>
                                <span style={{ fontSize: 11, fontWeight: 600, color: alerta ? "#B91C1C" : "#16A34A" }}>
                                  {alerta ? "⚠️ Acionar" : "✓ Normal"}
                                </span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ═══════ ABA: COLHEITA & MÓDULOS ═══════ */}
          {aba === "modulos" && (
            <div style={{ ...card }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                <div style={{ fontWeight: 700, fontSize: 15, color: "#0B1E35" }}>Módulos de Algodão em Caroço</div>
                <button style={btnPrimary} onClick={() => setModalMod({})}>+ Novo Módulo</button>
              </div>

              {/* Status cards */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10, marginBottom: 16 }}>
                {Object.entries(STATUS_MODULO_LABEL).map(([k, v]) => {
                  const cnt = modulos.filter(m => m.status === k).length;
                  return (
                    <div key={k} style={{ background: "#F3F6F9", borderRadius: 8, padding: "12px 14px", borderLeft: `4px solid ${v.cor}` }}>
                      <div style={{ fontSize: 11, color: "#888", fontWeight: 600 }}>{v.label}</div>
                      <div style={{ fontSize: 24, fontWeight: 800, color: v.cor }}>{cnt}</div>
                    </div>
                  );
                })}
                <div style={{ background: "#F3F6F9", borderRadius: 8, padding: "12px 14px", borderLeft: "4px solid #1A4870" }}>
                  <div style={{ fontSize: 11, color: "#888", fontWeight: 600 }}>Peso Estimado Total</div>
                  <div style={{ fontSize: 18, fontWeight: 800, color: "#1A4870" }}>{fmtN(pesoEstimadoKg / 1000, 1)} ton</div>
                </div>
              </div>

              {modulos.length === 0 ? (
                <div style={{ textAlign: "center", padding: "32px 0", color: "#aaa" }}>Nenhum módulo registrado.</div>
              ) : (
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr style={{ background: "#F3F6F9" }}>
                      {["Nº","Talhão","Data Colheita","Peso Est. (kg)","Status","Algodoeira","Entrega","Romaneio","Ações"].map(h => (
                        <th key={h} style={{ padding: "8px 10px", textAlign: "left", fontSize: 11, color: "#555", fontWeight: 600, borderBottom: "0.5px solid #DDE2EE", whiteSpace: "nowrap" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {modulos.map((m, i) => {
                      const st = STATUS_MODULO_LABEL[m.status] ?? { label: m.status, cor: "#888" };
                      return (
                        <tr key={m.id} style={{ background: i % 2 === 0 ? "#fff" : "#FAFBFD" }}>
                          <td style={{ padding: "8px 10px", fontWeight: 700 }}>#{String(m.numero).padStart(3, "0")}</td>
                          <td style={{ padding: "8px 10px" }}>{m.talhao_nome ?? "—"}</td>
                          <td style={{ padding: "8px 10px" }}>{fmtDt(m.data_colheita)}</td>
                          <td style={{ padding: "8px 10px" }}>{fmtN(m.peso_estimado_kg)}</td>
                          <td style={{ padding: "8px 10px" }}>
                            <span style={{ padding: "2px 8px", borderRadius: 6, fontSize: 11, fontWeight: 700, background: st.cor + "20", color: st.cor }}>{st.label}</span>
                          </td>
                          <td style={{ padding: "8px 10px" }}>{m.algodoeira_nome ?? "—"}</td>
                          <td style={{ padding: "8px 10px" }}>{fmtDt(m.data_entrega)}</td>
                          <td style={{ padding: "8px 10px" }}>{m.romaneio_algodoeira ?? "—"}</td>
                          <td style={{ padding: "8px 10px" }}>
                            <button style={{ ...btnSec, padding: "4px 10px", fontSize: 12 }} onClick={() => setModalMod(m)}>✏️</button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {/* ═══════ ABA: ALGODOEIRA / BENEFICIAMENTO ═══════ */}
          {aba === "algodoeira" && (
            <div style={{ ...card }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                <div style={{ fontWeight: 700, fontSize: 15, color: "#0B1E35" }}>Beneficiamento na Algodoeira</div>
                <button style={btnPrimary} onClick={() => setModalBenef({})}>+ Novo Beneficiamento</button>
              </div>

              {/* Resumo */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 10, marginBottom: 16 }}>
                {[
                  { l: "Total Fardos", v: fmtN(totalFardos) },
                  { l: "Pluma Total", v: `${fmtN(totalPlumaKg / 1000, 1)} ton` },
                  { l: "Caroço Total", v: `${fmtN(totalCarocoKg / 1000, 1)} ton` },
                  { l: "Rend. Médio", v: rendMedPct ? `${fmtN(rendMedPct, 1)}%` : "—" },
                  { l: "Valor Pluma", v: fmtR(valorEstoqueR) },
                ].map(c => (
                  <div key={c.l} style={{ background: "#F3F6F9", borderRadius: 8, padding: "10px 14px" }}>
                    <div style={{ fontSize: 11, color: "#888", fontWeight: 600 }}>{c.l}</div>
                    <div style={{ fontSize: 18, fontWeight: 800, color: "#0B1E35" }}>{c.v}</div>
                  </div>
                ))}
              </div>

              {beneficiamentos.length === 0 ? (
                <div style={{ textAlign: "center", padding: "32px 0", color: "#aaa" }}>Nenhum beneficiamento registrado.</div>
              ) : (
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr style={{ background: "#F3F6F9" }}>
                      {["Algodoeira","Entrada","Benefic.","Módulos","Peso Caroço (kg)","Fardos","Pluma (kg)","Rend.%","Caroço Ret. (kg)","Custo","Status","Ações"].map(h => (
                        <th key={h} style={{ padding: "8px 8px", textAlign: "left", fontSize: 11, color: "#555", fontWeight: 600, borderBottom: "0.5px solid #DDE2EE", whiteSpace: "nowrap" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {beneficiamentos.map((b, i) => {
                      const st = STATUS_BENEF_LABEL[b.status] ?? { label: b.status, cor: "#888" };
                      return (
                        <tr key={b.id} style={{ background: i % 2 === 0 ? "#fff" : "#FAFBFD" }}>
                          <td style={{ padding: "8px 8px", fontWeight: 600 }}>{b.algodoeira_nome ?? "—"}</td>
                          <td style={{ padding: "8px 8px" }}>{fmtDt(b.data_entrada)}</td>
                          <td style={{ padding: "8px 8px" }}>{fmtDt(b.data_beneficiamento)}</td>
                          <td style={{ padding: "8px 8px" }}>{fmtN(b.num_modulos)}</td>
                          <td style={{ padding: "8px 8px" }}>{fmtN(b.peso_bruto_caroco_kg)}</td>
                          <td style={{ padding: "8px 8px", fontWeight: 700 }}>{fmtN(b.num_fardos)}</td>
                          <td style={{ padding: "8px 8px" }}>{fmtN(b.peso_pluma_kg)}</td>
                          <td style={{ padding: "8px 8px" }}>
                            <span style={{ fontWeight: 700, color: (b.rendimento_pluma_pct ?? 0) >= 40 ? "#16A34A" : (b.rendimento_pluma_pct ?? 0) >= 38 ? "#EF9F27" : "#E24B4A" }}>
                              {b.rendimento_pluma_pct ? `${fmtN(b.rendimento_pluma_pct, 1)}%` : "—"}
                            </span>
                          </td>
                          <td style={{ padding: "8px 8px" }}>{fmtN(b.peso_caroco_retorno_kg)}</td>
                          <td style={{ padding: "8px 8px" }}>{fmtR(b.custo_beneficiamento)}</td>
                          <td style={{ padding: "8px 8px" }}>
                            <span style={{ padding: "2px 7px", borderRadius: 6, fontSize: 11, fontWeight: 700, background: st.cor + "20", color: st.cor }}>{st.label}</span>
                          </td>
                          <td style={{ padding: "8px 8px" }}>
                            <button style={{ ...btnSec, padding: "4px 10px", fontSize: 12 }} onClick={() => setModalBenef(b)}>✏️</button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {/* ═══════ ABA: HVI & QUALIDADE ═══════ */}
          {aba === "hvi" && (
            <div style={{ ...card }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 15, color: "#0B1E35" }}>Laudos HVI por Lote</div>
                  <div style={{ fontSize: 11, color: "#888", marginTop: 2 }}>🟢 Excelente  🟡 Bom  🔴 Abaixo da referência MT</div>
                </div>
                <button style={btnPrimary} onClick={() => setModalHVI({ beneficiamento_id: "" })}>+ Registrar Laudo</button>
              </div>

              {/* Referências */}
              <div style={{ background: "#F3F6F9", borderRadius: 8, padding: "10px 14px", marginBottom: 14, fontSize: 11, color: "#555" }}>
                <strong>Referências MT:</strong>{" "}
                Comprimento ≥ 28,5mm · Uniformidade ≥ 82% · Resistência ≥ 30 g/tex · Micronaire 3,5–4,9 · Rd ≥ 72% · +b &lt; 9 · SFI &lt; 10%
              </div>

              {laudosHVI.length === 0 ? (
                <div style={{ textAlign: "center", padding: "32px 0", color: "#aaa" }}>Nenhum laudo HVI registrado.</div>
              ) : (
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead>
                      <tr style={{ background: "#F3F6F9" }}>
                        {["Algodoeira","Fardos","Tipo","Compr.\n(mm)","Unif.\n(%)","Resist.\n(g/tex)","Micro\n(μg/pol)","Elongação","Rd (%)","Amar.\n(+b)","SFI\n(%)","Neps","Prêmio/\nDesconto",""].map(h => (
                          <th key={h} style={{ padding: "7px 8px", textAlign: "left", fontSize: 10, color: "#555", fontWeight: 600, borderBottom: "0.5px solid #DDE2EE", whiteSpace: "pre" }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {laudosHVI.map((h, i) => {
                        const params: [string, number | undefined, string][] = [
                          ["comprimento", h.comprimento_uhml_mm, fmtN(h.comprimento_uhml_mm, 2)],
                          ["uniformidade", h.uniformidade_pct, fmtN(h.uniformidade_pct, 1)],
                          ["resistencia", h.resistencia_gtex, fmtN(h.resistencia_gtex, 1)],
                          ["micronaire", h.micronaire, fmtN(h.micronaire, 2)],
                          ["—", h.elongacao_pct, fmtN(h.elongacao_pct, 1)],
                          ["reflectancia", h.reflectancia_rd, fmtN(h.reflectancia_rd, 1)],
                          ["amarelamento", h.amarelamento_b, fmtN(h.amarelamento_b, 2)],
                          ["sfi", h.sfi_pct, fmtN(h.sfi_pct, 1)],
                        ];
                        return (
                          <tr key={h.id} style={{ background: i % 2 === 0 ? "#fff" : "#FAFBFD" }}>
                            <td style={{ padding: "7px 8px", fontWeight: 600 }}>{h.algodoeira_nome ?? "—"}</td>
                            <td style={{ padding: "7px 8px" }}>{h.num_fardos ?? "—"}</td>
                            <td style={{ padding: "7px 8px" }}>{h.tipo_classificacao ?? "—"}</td>
                            {params.map(([param, val, fmt], pi) => {
                              const sem = param !== "—" ? hviSemaforo(param, val) : "amarelo";
                              return (
                                <td key={pi} style={{ padding: "7px 8px" }}>
                                  <span style={{ fontWeight: 600, color: val != null ? COR_SEMAFORO[sem] : "#aaa" }}>{fmt}</span>
                                </td>
                              );
                            })}
                            <td style={{ padding: "7px 8px" }}>{fmtN(h.neps)}</td>
                            <td style={{ padding: "7px 8px" }}>
                              {h.premium_desconto_pct != null ? (
                                <span style={{ fontWeight: 700, color: h.premium_desconto_pct >= 0 ? "#16A34A" : "#E24B4A" }}>
                                  {h.premium_desconto_pct >= 0 ? "+" : ""}{fmtN(h.premium_desconto_pct, 1)}%
                                </span>
                              ) : "—"}
                            </td>
                            <td style={{ padding: "7px 8px" }}>
                              <button style={{ ...btnSec, padding: "4px 8px", fontSize: 11 }} onClick={() => setModalHVI(h)}>✏️</button>
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

          {/* ═══════ ABA: POSIÇÃO ═══════ */}
          {aba === "posicao" && (
            <div>
              {/* Big numbers */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 16 }}>
                {[
                  { l: "Fardos Produzidos", v: fmtN(totalFardos), cor: "#0B1E35", sub: `${fmtN(totalPlumaKg / 1000, 1)} ton pluma` },
                  { l: "Valor Estimado", v: fmtR(valorEstoqueR), cor: "#16A34A", sub: `@ ${fmtR(preco_arroba)}/@ · ${fmtN(preco_cbot_cents, 1)} ¢/lb` },
                  { l: "Preço Hoje (@)", v: fmtR(preco_arroba), cor: "#1A4870", sub: `${fmtN(preco_cbot_cents, 2)} ¢/lb (ICE/CBOT)` },
                  { l: "Rendimento Médio", v: rendMedPct ? `${fmtN(rendMedPct, 1)}%` : "—", cor: "#C9921B", sub: "pluma / algodão caroço" },
                ].map(c => (
                  <div key={c.l} style={{ ...card, borderTop: `4px solid ${c.cor}` }}>
                    <div style={{ fontSize: 11, color: "#888", fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 }}>{c.l}</div>
                    <div style={{ fontSize: 24, fontWeight: 800, color: c.cor }}>{c.v}</div>
                    <div style={{ fontSize: 11, color: "#aaa", marginTop: 2 }}>{c.sub}</div>
                  </div>
                ))}
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                {/* Produção e Posição */}
                <div style={{ ...card }}>
                  <div style={{ fontWeight: 700, fontSize: 15, color: "#0B1E35", marginBottom: 14 }}>Fluxo de Produção</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    {[
                      { l: "Módulos no campo", v: `${modulos.filter(m => m.status === "campo").length} módulos`, cor: "#16A34A" },
                      { l: "Módulos em transporte", v: `${modulos.filter(m => m.status === "em_transporte").length} módulos`, cor: "#EF9F27" },
                      { l: "Entregues na algodoeira", v: `${modulosEntregues} módulos  ≈  ${fmtN(pesoEstimadoKg / 1000, 1)} ton caroço`, cor: "#1A4870" },
                      { l: "Fardos produzidos", v: `${fmtN(totalFardos)} fardos  (${fmtN(totalPlumaKg / 1000, 1)} ton pluma)`, cor: "#0B1E35" },
                      { l: "Caroço retornado", v: `${fmtN(totalCarocoKg / 1000, 1)} ton`, cor: "#888" },
                    ].map(r => (
                      <div key={r.l} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "9px 12px", background: "#F3F6F9", borderRadius: 8, borderLeft: `4px solid ${r.cor}` }}>
                        <span style={{ fontSize: 12, color: "#555" }}>{r.l}</span>
                        <span style={{ fontWeight: 700, color: r.cor, fontSize: 14 }}>{r.v}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Análise de preço e custo */}
                <div style={{ ...card }}>
                  <div style={{ fontWeight: 700, fontSize: 15, color: "#0B1E35", marginBottom: 14 }}>Análise de Mercado</div>

                  <div style={{ background: "#F3F6F9", borderRadius: 8, padding: "12px 14px", marginBottom: 10 }}>
                    <div style={{ fontSize: 11, color: "#888", fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 }}>Equivalências de Preço Hoje</div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      <div style={{ display: "flex", justifyContent: "space-between" }}>
                        <span style={{ color: "#555", fontSize: 12 }}>ICE Cotton (¢/lb)</span>
                        <span style={{ fontWeight: 700 }}>{fmtN(preco_cbot_cents, 2)}</span>
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between" }}>
                        <span style={{ color: "#555", fontSize: 12 }}>R$ por arroba (@)</span>
                        <span style={{ fontWeight: 700 }}>{fmtR(preco_arroba)}</span>
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between" }}>
                        <span style={{ color: "#555", fontSize: 12 }}>R$ por fardo ({PESO_FARDO_KG}kg pluma)</span>
                        <span style={{ fontWeight: 700, color: "#1A4870" }}>{fmtR(preco_arroba / 15 * PESO_FARDO_KG)}</span>
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between" }}>
                        <span style={{ color: "#555", fontSize: 12 }}>USD/BRL</span>
                        <span style={{ fontWeight: 700 }}>{fmtN(usdBrl, 4)}</span>
                      </div>
                    </div>
                  </div>

                  <div style={{ background: "#F0FDF4", border: "0.5px solid #BBF7D0", borderRadius: 8, padding: "12px 14px", marginBottom: 10 }}>
                    <div style={{ fontSize: 11, color: "#166534", fontWeight: 700, marginBottom: 6 }}>Valor do Estoque de Pluma</div>
                    <div style={{ fontSize: 22, fontWeight: 800, color: "#15803D" }}>{fmtR(valorEstoqueR)}</div>
                    <div style={{ fontSize: 11, color: "#16A34A" }}>
                      {fmtN(totalFardos)} fardos × {fmtR(preco_arroba / 15 * PESO_FARDO_KG)}/fardo (preço atual)
                    </div>
                  </div>

                  {totalCarocoKg > 0 && (
                    <div style={{ background: "#FFF7ED", border: "0.5px solid #FED7AA", borderRadius: 8, padding: "12px 14px" }}>
                      <div style={{ fontSize: 11, color: "#9A3412", fontWeight: 700, marginBottom: 4 }}>Caroço em Estoque</div>
                      <div style={{ fontSize: 16, fontWeight: 700, color: "#C9921B" }}>{fmtN(totalCarocoKg / 1000, 1)} ton caroço</div>
                    </div>
                  )}

                  <div style={{ marginTop: 10, fontSize: 11, color: "#888" }}>
                    Variação dia: <span style={{ fontWeight: 700, color: variacaoAlg >= 0 ? "#16A34A" : "#E24B4A" }}>
                      {variacaoAlg >= 0 ? "▲" : "▼"} {Math.abs(variacaoAlg).toFixed(1)}%
                    </span>{" "}
                    Atualizado às {precos ? new Date(precos.atualizadoEm).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : "—"}
                  </div>
                </div>
              </div>

              {/* Por algodoeira */}
              {beneficiamentos.length > 0 && (
                <div style={{ ...card, marginTop: 16 }}>
                  <div style={{ fontWeight: 700, fontSize: 15, color: "#0B1E35", marginBottom: 14 }}>Posição por Algodoeira</div>
                  {(() => {
                    const por: Record<string, { nome: string; fardos: number; pluma_kg: number; caroco_kg: number }> = {};
                    beneficiamentos.forEach(b => {
                      const k = b.algodoeira_id ?? "sem";
                      if (!por[k]) por[k] = { nome: b.algodoeira_nome ?? "Sem vínculo", fardos: 0, pluma_kg: 0, caroco_kg: 0 };
                      por[k].fardos   += b.num_fardos ?? 0;
                      por[k].pluma_kg += b.peso_pluma_kg ?? 0;
                      por[k].caroco_kg += b.peso_caroco_retorno_kg ?? 0;
                    });
                    return (
                      <table style={{ width: "100%", borderCollapse: "collapse" }}>
                        <thead>
                          <tr style={{ background: "#F3F6F9" }}>
                            {["Algodoeira","Fardos","Pluma (ton)","Caroço (ton)","Valor Estimado"].map(h => (
                              <th key={h} style={{ padding: "8px 10px", textAlign: "left", fontSize: 11, color: "#555", fontWeight: 600, borderBottom: "0.5px solid #DDE2EE" }}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {Object.values(por).map((p, i) => (
                            <tr key={i} style={{ background: i % 2 === 0 ? "#fff" : "#FAFBFD" }}>
                              <td style={{ padding: "8px 10px", fontWeight: 700 }}>{p.nome}</td>
                              <td style={{ padding: "8px 10px", fontWeight: 700, fontSize: 15 }}>{fmtN(p.fardos)}</td>
                              <td style={{ padding: "8px 10px" }}>{fmtN(p.pluma_kg / 1000, 1)}</td>
                              <td style={{ padding: "8px 10px" }}>{fmtN(p.caroco_kg / 1000, 1)}</td>
                              <td style={{ padding: "8px 10px", fontWeight: 700, color: "#16A34A" }}>{fmtR(p.fardos * PESO_FARDO_KG / 15 * preco_arroba)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    );
                  })()}
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* ════════════════════════════════════════════════════════════════
          MODAIS
      ════════════════════════════════════════════════════════════════ */}

      {/* ── Modal: Operação Especial ── */}
      {modalOp !== null && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 2000, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ background: "#fff", borderRadius: 14, padding: "28px 32px", width: 600, maxHeight: "90vh", overflowY: "auto" }}>
            <h2 style={{ margin: "0 0 20px", fontSize: 17, fontWeight: 700, color: "#0B1E35" }}>
              {modalOp.id ? "Editar Operação" : "Nova Operação Especial"}
            </h2>
            {msg && <div style={{ padding: "8px 12px", background: "#FEF2F2", border: "0.5px solid #FECACA", borderRadius: 8, marginBottom: 12, color: "#B91C1C", fontSize: 12 }}>{msg}</div>}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div><label style={lbl}>Tipo *</label>
                <select style={inp} value={modalOp.tipo ?? ""} onChange={e => setModalOp(p => ({ ...p, tipo: e.target.value }))}>
                  <option value="">— selecionar —</option>
                  <option value="regulador_crescimento">Regulador de Crescimento</option>
                  <option value="defoliacao">Defolhação</option>
                </select>
              </div>
              <div><label style={lbl}>Data *</label>
                <input type="date" style={inp} value={modalOp.data_aplicacao ?? ""} onChange={e => setModalOp(p => ({ ...p, data_aplicacao: e.target.value }))} />
              </div>
              <div><label style={lbl}>Talhão</label>
                <select style={inp} value={modalOp.talhao_id ?? ""} onChange={e => setModalOp(p => ({ ...p, talhao_id: e.target.value || undefined }))}>
                  <option value="">— todos —</option>
                  {talhoes.map(t => <option key={t.id} value={t.id}>{t.nome}</option>)}
                </select>
              </div>
              <div><label style={lbl}>Produto</label>
                <input type="text" style={inp} placeholder="ex: Pix, Dropp, Finish..." value={modalOp.produto ?? ""} onChange={e => setModalOp(p => ({ ...p, produto: e.target.value }))} />
              </div>
              <div><label style={lbl}>Dose</label>
                <input type="number" style={inp} placeholder="0,0" value={modalOp.dose_ha ?? ""} onChange={e => setModalOp(p => ({ ...p, dose_ha: parseFloat(e.target.value) || undefined }))} />
              </div>
              <div><label style={lbl}>Unidade</label>
                <select style={inp} value={modalOp.unidade_dose ?? "L/ha"} onChange={e => setModalOp(p => ({ ...p, unidade_dose: e.target.value }))}>
                  <option value="L/ha">L/ha</option>
                  <option value="kg/ha">kg/ha</option>
                  <option value="g/ha">g/ha</option>
                  <option value="mL/ha">mL/ha</option>
                </select>
              </div>
              <div><label style={lbl}>Área (ha)</label>
                <input type="number" style={inp} value={modalOp.area_ha ?? ""} onChange={e => setModalOp(p => ({ ...p, area_ha: parseFloat(e.target.value) || undefined }))} />
              </div>
              {modalOp.tipo === "regulador_crescimento" && <>
                <div><label style={lbl}>NAWF (nós acima flor branca)</label>
                  <input type="number" style={inp} value={modalOp.nawf ?? ""} onChange={e => setModalOp(p => ({ ...p, nawf: parseInt(e.target.value) || undefined }))} />
                </div>
                <div><label style={lbl}>Altura da planta (cm)</label>
                  <input type="number" style={inp} value={modalOp.altura_planta_cm ?? ""} onChange={e => setModalOp(p => ({ ...p, altura_planta_cm: parseFloat(e.target.value) || undefined }))} />
                </div>
              </>}
              {modalOp.tipo === "defoliacao" && (
                <div><label style={lbl}>% Abertura de maçãs</label>
                  <input type="number" style={inp} placeholder="ex: 75" value={modalOp.abertura_macas_pct ?? ""} onChange={e => setModalOp(p => ({ ...p, abertura_macas_pct: parseFloat(e.target.value) || undefined }))} />
                </div>
              )}
              <div style={{ gridColumn: "1/-1" }}><label style={lbl}>Observações</label>
                <input type="text" style={inp} value={modalOp.obs ?? ""} onChange={e => setModalOp(p => ({ ...p, obs: e.target.value }))} />
              </div>
            </div>
            <div style={{ display: "flex", gap: 8, marginTop: 20, justifyContent: "flex-end" }}>
              <button style={btnSec} onClick={() => { setModalOp(null); setMsg(null); }}>Cancelar</button>
              <button style={btnPrimary} disabled={salvando} onClick={salvarOperacao}>{salvando ? "Salvando…" : "Salvar"}</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal: Armadilha ── */}
      {modalArm !== null && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 2000, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ background: "#fff", borderRadius: 14, padding: "28px 32px", width: 520 }}>
            <h2 style={{ margin: "0 0 20px", fontSize: 17, fontWeight: 700, color: "#0B1E35" }}>
              {modalArm.id ? "Editar Armadilha" : "Nova Armadilha de Bicudo"}
            </h2>
            {msg && <div style={{ padding: "8px 12px", background: "#FEF2F2", borderRadius: 8, marginBottom: 12, color: "#B91C1C", fontSize: 12 }}>{msg}</div>}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div style={{ gridColumn: "1/-1" }}><label style={lbl}>Nome / Identificação *</label>
                <input type="text" style={inp} placeholder="ex: A1, Norte, Bloco 3..." value={modalArm.nome ?? ""} onChange={e => setModalArm(p => ({ ...p, nome: e.target.value }))} />
              </div>
              <div><label style={lbl}>Talhão</label>
                <select style={inp} value={modalArm.talhao_id ?? ""} onChange={e => setModalArm(p => ({ ...p, talhao_id: e.target.value || undefined }))}>
                  <option value="">— todos —</option>
                  {talhoes.map(t => <option key={t.id} value={t.id}>{t.nome}</option>)}
                </select>
              </div>
              <div><label style={lbl}>Data de Instalação</label>
                <input type="date" style={inp} value={modalArm.data_instalacao ?? ""} onChange={e => setModalArm(p => ({ ...p, data_instalacao: e.target.value }))} />
              </div>
              <div><label style={lbl}>Latitude</label>
                <input type="number" style={inp} step="0.000001" value={modalArm.latitude ?? ""} onChange={e => setModalArm(p => ({ ...p, latitude: parseFloat(e.target.value) || undefined }))} />
              </div>
              <div><label style={lbl}>Longitude</label>
                <input type="number" style={inp} step="0.000001" value={modalArm.longitude ?? ""} onChange={e => setModalArm(p => ({ ...p, longitude: parseFloat(e.target.value) || undefined }))} />
              </div>
            </div>
            <div style={{ display: "flex", gap: 8, marginTop: 20, justifyContent: "flex-end" }}>
              <button style={btnSec} onClick={() => { setModalArm(null); setMsg(null); }}>Cancelar</button>
              <button style={btnPrimary} disabled={salvando} onClick={salvarArmadilha}>{salvando ? "Salvando…" : "Salvar"}</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal: Leitura Semanal ── */}
      {modalCap !== null && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 2000, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ background: "#fff", borderRadius: 14, padding: "28px 32px", width: 400 }}>
            <h2 style={{ margin: "0 0 4px", fontSize: 17, fontWeight: 700, color: "#0B1E35" }}>Registrar Leitura</h2>
            <div style={{ fontSize: 13, color: "#888", marginBottom: 16 }}>Armadilha: <strong>{modalCap.armadilha_nome}</strong></div>
            {msg && <div style={{ padding: "8px 12px", background: "#FEF2F2", borderRadius: 8, marginBottom: 12, color: "#B91C1C", fontSize: 12 }}>{msg}</div>}
            <CapForm
              armadilhaId={modalCap.armadilha_id}
              onSalvar={salvarCaptura}
              onCancel={() => { setModalCap(null); setMsg(null); }}
              salvando={salvando}
              threshold={THRESHOLD_BICUDO}
            />
          </div>
        </div>
      )}

      {/* ── Modal: Módulo ── */}
      {modalMod !== null && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 2000, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ background: "#fff", borderRadius: 14, padding: "28px 32px", width: 640, maxHeight: "90vh", overflowY: "auto" }}>
            <h2 style={{ margin: "0 0 20px", fontSize: 17, fontWeight: 700, color: "#0B1E35" }}>
              {modalMod.id ? "Editar Módulo" : "Novo Módulo de Algodão"}
            </h2>
            {msg && <div style={{ padding: "8px 12px", background: "#FEF2F2", borderRadius: 8, marginBottom: 12, color: "#B91C1C", fontSize: 12 }}>{msg}</div>}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
              <div><label style={lbl}>Número *</label>
                <input type="number" style={inp} value={modalMod.numero ?? ""} onChange={e => setModalMod(p => ({ ...p, numero: parseInt(e.target.value) || undefined }))} />
              </div>
              <div><label style={lbl}>Talhão</label>
                <select style={inp} value={modalMod.talhao_id ?? ""} onChange={e => setModalMod(p => ({ ...p, talhao_id: e.target.value || undefined }))}>
                  <option value="">—</option>
                  {talhoes.map(t => <option key={t.id} value={t.id}>{t.nome}</option>)}
                </select>
              </div>
              <div><label style={lbl}>Data da Colheita</label>
                <input type="date" style={inp} value={modalMod.data_colheita ?? ""} onChange={e => setModalMod(p => ({ ...p, data_colheita: e.target.value }))} />
              </div>
              <div><label style={lbl}>Peso Estimado (kg)</label>
                <input type="number" style={inp} value={modalMod.peso_estimado_kg ?? ""} onChange={e => setModalMod(p => ({ ...p, peso_estimado_kg: parseFloat(e.target.value) || undefined }))} />
              </div>
              <div><label style={lbl}>Localização (campo)</label>
                <input type="text" style={inp} value={modalMod.localizacao_campo ?? ""} onChange={e => setModalMod(p => ({ ...p, localizacao_campo: e.target.value }))} />
              </div>
              <div><label style={lbl}>Status</label>
                <select style={inp} value={modalMod.status ?? "campo"} onChange={e => setModalMod(p => ({ ...p, status: e.target.value }))}>
                  <option value="campo">No campo</option>
                  <option value="em_transporte">Em transporte</option>
                  <option value="entregue">Entregue na algodoeira</option>
                </select>
              </div>
              <div><label style={lbl}>Algodoeira</label>
                <select style={inp} value={modalMod.algodoeira_id ?? ""} onChange={e => setModalMod(p => ({ ...p, algodoeira_id: e.target.value || undefined }))}>
                  <option value="">—</option>
                  {pessoas.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
                </select>
              </div>
              <div><label style={lbl}>Data de Entrega</label>
                <input type="date" style={inp} value={modalMod.data_entrega ?? ""} onChange={e => setModalMod(p => ({ ...p, data_entrega: e.target.value }))} />
              </div>
              <div><label style={lbl}>Romaneio Algodoeira</label>
                <input type="text" style={inp} value={modalMod.romaneio_algodoeira ?? ""} onChange={e => setModalMod(p => ({ ...p, romaneio_algodoeira: e.target.value }))} />
              </div>
              <div style={{ gridColumn: "1/-1" }}><label style={lbl}>Obs.</label>
                <input type="text" style={inp} value={modalMod.obs ?? ""} onChange={e => setModalMod(p => ({ ...p, obs: e.target.value }))} />
              </div>
            </div>
            <div style={{ display: "flex", gap: 8, marginTop: 20, justifyContent: "flex-end" }}>
              <button style={btnSec} onClick={() => { setModalMod(null); setMsg(null); }}>Cancelar</button>
              <button style={btnPrimary} disabled={salvando} onClick={salvarModulo}>{salvando ? "Salvando…" : "Salvar"}</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal: Beneficiamento ── */}
      {modalBenef !== null && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 2000, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ background: "#fff", borderRadius: 14, padding: "28px 32px", width: 720, maxHeight: "90vh", overflowY: "auto" }}>
            <h2 style={{ margin: "0 0 20px", fontSize: 17, fontWeight: 700, color: "#0B1E35" }}>
              {modalBenef.id ? "Editar Beneficiamento" : "Novo Lote de Beneficiamento"}
            </h2>
            {msg && <div style={{ padding: "8px 12px", background: "#FEF2F2", borderRadius: 8, marginBottom: 12, color: "#B91C1C", fontSize: 12 }}>{msg}</div>}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
              <div style={{ gridColumn: "1/-1" }}><label style={lbl}>Algodoeira *</label>
                <select style={inp} value={modalBenef.algodoeira_id ?? ""} onChange={e => setModalBenef(p => ({ ...p, algodoeira_id: e.target.value || undefined }))}>
                  <option value="">— selecionar —</option>
                  {pessoas.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
                </select>
              </div>
              <div><label style={lbl}>Data de Entrada</label>
                <input type="date" style={inp} value={modalBenef.data_entrada ?? ""} onChange={e => setModalBenef(p => ({ ...p, data_entrada: e.target.value }))} />
              </div>
              <div><label style={lbl}>Data do Beneficiamento</label>
                <input type="date" style={inp} value={modalBenef.data_beneficiamento ?? ""} onChange={e => setModalBenef(p => ({ ...p, data_beneficiamento: e.target.value }))} />
              </div>
              <div><label style={lbl}>Qtd. Módulos Entregues</label>
                <input type="number" style={inp} value={modalBenef.num_modulos ?? ""} onChange={e => setModalBenef(p => ({ ...p, num_modulos: parseInt(e.target.value) || undefined }))} />
              </div>
              <div><label style={lbl}>Peso Bruto Caroço (kg)</label>
                <input type="number" style={inp} value={modalBenef.peso_bruto_caroco_kg ?? ""} onChange={e => setModalBenef(p => ({ ...p, peso_bruto_caroco_kg: parseFloat(e.target.value) || undefined }))} />
              </div>
              <div><label style={lbl}>Nº de Fardos Produzidos</label>
                <input type="number" style={inp} value={modalBenef.num_fardos ?? ""} onChange={e => setModalBenef(p => ({ ...p, num_fardos: parseInt(e.target.value) || undefined }))} />
              </div>
              <div><label style={lbl}>Peso Total Pluma (kg)</label>
                <input type="number" style={inp} value={modalBenef.peso_pluma_kg ?? ""} onChange={e => setModalBenef(p => ({ ...p, peso_pluma_kg: parseFloat(e.target.value) || undefined }))} />
              </div>
              <div><label style={lbl}>Rendimento Pluma (%)</label>
                <input type="number" style={inp} step="0.1" placeholder="ex: 39.5" value={modalBenef.rendimento_pluma_pct ?? ""} onChange={e => setModalBenef(p => ({ ...p, rendimento_pluma_pct: parseFloat(e.target.value) || undefined }))} />
              </div>
              <div><label style={lbl}>Caroço Retornado (kg)</label>
                <input type="number" style={inp} value={modalBenef.peso_caroco_retorno_kg ?? ""} onChange={e => setModalBenef(p => ({ ...p, peso_caroco_retorno_kg: parseFloat(e.target.value) || undefined }))} />
              </div>
              <div><label style={lbl}>Custo Beneficiamento (R$)</label>
                <input type="number" style={inp} value={modalBenef.custo_beneficiamento ?? ""} onChange={e => setModalBenef(p => ({ ...p, custo_beneficiamento: parseFloat(e.target.value) || undefined }))} />
              </div>
              <div><label style={lbl}>Nº Fardo Inicial</label>
                <input type="text" style={inp} value={modalBenef.num_fardo_inicial ?? ""} onChange={e => setModalBenef(p => ({ ...p, num_fardo_inicial: e.target.value }))} />
              </div>
              <div><label style={lbl}>Nº Fardo Final</label>
                <input type="text" style={inp} value={modalBenef.num_fardo_final ?? ""} onChange={e => setModalBenef(p => ({ ...p, num_fardo_final: e.target.value }))} />
              </div>
              <div><label style={lbl}>Status</label>
                <select style={inp} value={modalBenef.status ?? "em_processamento"} onChange={e => setModalBenef(p => ({ ...p, status: e.target.value }))}>
                  <option value="em_processamento">Em processamento</option>
                  <option value="concluido">Concluído</option>
                </select>
              </div>
              <div style={{ gridColumn: "1/-1" }}><label style={lbl}>Obs.</label>
                <input type="text" style={inp} value={modalBenef.obs ?? ""} onChange={e => setModalBenef(p => ({ ...p, obs: e.target.value }))} />
              </div>
            </div>
            <div style={{ display: "flex", gap: 8, marginTop: 20, justifyContent: "flex-end" }}>
              <button style={btnSec} onClick={() => { setModalBenef(null); setMsg(null); }}>Cancelar</button>
              <button style={btnPrimary} disabled={salvando} onClick={salvarBeneficiamento}>{salvando ? "Salvando…" : "Salvar"}</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal: Laudo HVI ── */}
      {modalHVI !== null && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 2000, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ background: "#fff", borderRadius: 14, padding: "28px 32px", width: 720, maxHeight: "90vh", overflowY: "auto" }}>
            <h2 style={{ margin: "0 0 4px", fontSize: 17, fontWeight: 700, color: "#0B1E35" }}>
              {modalHVI.id ? "Editar Laudo HVI" : "Registrar Laudo HVI"}
            </h2>
            <div style={{ fontSize: 12, color: "#888", marginBottom: 16 }}>Referências MT: Comp ≥ 28,5mm · Unif ≥ 82% · Resist ≥ 30 g/tex · Micro 3,5–4,9 · Rd ≥ 72% · +b &lt; 9 · SFI &lt; 10%</div>
            {msg && <div style={{ padding: "8px 12px", background: "#FEF2F2", borderRadius: 8, marginBottom: 12, color: "#B91C1C", fontSize: 12 }}>{msg}</div>}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
              <div style={{ gridColumn: "1/-1" }}><label style={lbl}>Beneficiamento *</label>
                <select style={inp} value={modalHVI.beneficiamento_id ?? ""} onChange={e => setModalHVI(p => ({ ...p, beneficiamento_id: e.target.value }))}>
                  <option value="">— selecionar —</option>
                  {beneficiamentos.map(b => <option key={b.id} value={b.id}>{b.algodoeira_nome ?? "Algodoeira"} — {fmtDt(b.data_beneficiamento)} — {b.num_fardos ?? 0} fardos</option>)}
                </select>
              </div>
              <div><label style={lbl}>Fardo Inicial</label>
                <input type="text" style={inp} value={modalHVI.num_fardo_inicio ?? ""} onChange={e => setModalHVI(p => ({ ...p, num_fardo_inicio: e.target.value }))} />
              </div>
              <div><label style={lbl}>Fardo Final</label>
                <input type="text" style={inp} value={modalHVI.num_fardo_fim ?? ""} onChange={e => setModalHVI(p => ({ ...p, num_fardo_fim: e.target.value }))} />
              </div>
              <div><label style={lbl}>Nº Fardos no Laudo</label>
                <input type="number" style={inp} value={modalHVI.num_fardos ?? ""} onChange={e => setModalHVI(p => ({ ...p, num_fardos: parseInt(e.target.value) || undefined }))} />
              </div>
              <div><label style={lbl}>Tipo Classificação</label>
                <select style={inp} value={modalHVI.tipo_classificacao ?? ""} onChange={e => setModalHVI(p => ({ ...p, tipo_classificacao: e.target.value }))}>
                  <option value="">—</option>
                  {["Tipo 1","Tipo 2","Tipo 3","Tipo 4","Tipo 5","Tipo 6","Tipo 7","Tipo 8"].map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              {/* Parâmetros HVI */}
              {[
                { f: "comprimento_uhml_mm", l: "Comprimento UHML (mm)", ref: "Ref: ≥ 28,5", step: "0.01" },
                { f: "uniformidade_pct",    l: "Uniformidade (%)",       ref: "Ref: ≥ 82%",  step: "0.1"  },
                { f: "resistencia_gtex",    l: "Resistência (g/tex)",    ref: "Ref: ≥ 30",   step: "0.1"  },
                { f: "micronaire",          l: "Micronaire (μg/pol)",    ref: "Ref: 3,5–4,9",step: "0.01" },
                { f: "elongacao_pct",       l: "Elongação (%)",          ref: "",             step: "0.1"  },
                { f: "reflectancia_rd",     l: "Reflectância Rd (%)",    ref: "Ref: ≥ 72%",  step: "0.1"  },
                { f: "amarelamento_b",      l: "Amarelamento +b",        ref: "Ref: < 9",    step: "0.01" },
                { f: "sfi_pct",             l: "SFI (%)",                ref: "Ref: < 10%",  step: "0.1"  },
                { f: "neps",                l: "Neps (cnt/g)",           ref: "",             step: "1"    },
                { f: "impurezas_pct",       l: "Impurezas (%)",          ref: "",             step: "0.1"  },
                { f: "premium_desconto_pct",l: "Prêmio/Desconto (%)",   ref: "+ prêmio / – desconto", step: "0.1" },
              ].map(({ f, l, ref, step }) => (
                <div key={f}>
                  <label style={lbl}>{l}{ref && <span style={{ fontWeight: 400, color: "#aaa", marginLeft: 4 }}>{ref}</span>}</label>
                  <input type="number" step={step} style={inp}
                    value={(modalHVI as Record<string, unknown>)[f] as number ?? ""}
                    onChange={e => setModalHVI(p => ({ ...p, [f]: parseFloat(e.target.value) || undefined }))} />
                </div>
              ))}
              <div style={{ gridColumn: "1/-1" }}><label style={lbl}>Obs.</label>
                <input type="text" style={inp} value={modalHVI.obs ?? ""} onChange={e => setModalHVI(p => ({ ...p, obs: e.target.value }))} />
              </div>
            </div>
            <div style={{ display: "flex", gap: 8, marginTop: 20, justifyContent: "flex-end" }}>
              <button style={btnSec} onClick={() => { setModalHVI(null); setMsg(null); }}>Cancelar</button>
              <button style={btnPrimary} disabled={salvando} onClick={salvarHVI}>{salvando ? "Salvando…" : "Salvar Laudo"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
    </>
  );
}

// ─── Subcomponente: Form de Captura (evita closure stale) ──────────────────────

function CapForm({ armadilhaId, onSalvar, onCancel, salvando, threshold }: {
  armadilhaId: string;
  onSalvar: (id: string, data: string, qtd: number) => void;
  onCancel: () => void;
  salvando: boolean;
  threshold: number;
}) {
  const hoje = new Date().toISOString().slice(0, 10);
  const [data, setData]   = useState(hoje);
  const [qtd,  setQtd]    = useState(0);
  const alerta = qtd >= threshold;
  const inp: React.CSSProperties = { width: "100%", padding: "8px 10px", border: "0.5px solid #D4DCE8", borderRadius: 8, fontSize: 13, color: "#1a1a1a", background: "#fff", boxSizing: "border-box", outline: "none" };
  const lbl: React.CSSProperties = { fontSize: 11, color: "#555", marginBottom: 4, display: "block", fontWeight: 600 };
  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
        <div><label style={lbl}>Data da Leitura *</label>
          <input type="date" style={inp} value={data} onChange={e => setData(e.target.value)} />
        </div>
        <div><label style={lbl}>Capturas *</label>
          <input type="number" style={inp} min={0} value={qtd} onChange={e => setQtd(parseInt(e.target.value) || 0)} />
        </div>
      </div>
      {alerta && (
        <div style={{ padding: "8px 12px", background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: 8, marginBottom: 12, fontSize: 12, color: "#B91C1C", fontWeight: 600 }}>
          ⚠️ Acima do threshold ({threshold}). Acionar pulverização dirigida!
        </div>
      )}
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
        <button style={{ padding: "8px 14px", background: "#fff", color: "#555", border: "0.5px solid #D4DCE8", borderRadius: 8, fontWeight: 500, cursor: "pointer", fontSize: 13 }} onClick={onCancel}>Cancelar</button>
        <button style={{ padding: "8px 18px", background: "#1A4870", color: "#fff", border: "none", borderRadius: 8, fontWeight: 600, cursor: "pointer", fontSize: 13 }} disabled={salvando} onClick={() => onSalvar(armadilhaId, data, qtd)}>
          {salvando ? "Salvando…" : "Salvar Leitura"}
        </button>
      </div>
    </div>
  );
}
