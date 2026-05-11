"use client";
import { useState, useEffect, useCallback } from "react";
import TopNav from "../../components/TopNav";
import { useAuth } from "../../components/AuthProvider";
import { supabase } from "../../lib/supabase";
import { useRouter } from "next/navigation";
import type { PrecosData } from "../api/precos/route";

// ── Tipos ─────────────────────────────────────────────────────
interface Fazenda    { id: string; nome: string; municipio?: string; estado?: string; area_total_ha?: number; raccolto_acesso?: boolean }
interface AnoSafra   { id: string; descricao: string; fazenda_id: string }
interface Ciclo      { id: string; fazenda_id: string; ano_safra_id: string; cultura: string; descricao: string }
interface Plantio    { id: string; fazenda_id: string; ciclo_id: string; area_ha: number; produtividade_esperada: number }
interface Colheita   { id: string; fazenda_id: string; ciclo_id: string; area_ha?: number; sacas_liquidas?: number; peso_liquido_kg?: number }
interface ArrPag     { id: string; fazenda_id: string; ano_safra_id: string; sacas_previstas: number; commodity: string; status: string }
interface Lancamento { id: string; fazenda_id: string; tipo: string; moeda: string; status: string; valor: number; sacas?: number; cultura_barter?: string; data_vencimento: string; descricao: string; categoria?: string; cotacao_usd?: number; ano_safra_id?: string; data_baixa?: string }
interface Contrato   { id: string; fazenda_id: string; produto: string; quantidade_sc: number; entregue_sc: number; status: string; is_arrendamento?: boolean; preco?: number; safra?: string; comprador?: string; numero?: string }

// ── Formatadores ──────────────────────────────────────────────
const fmtR  = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
const fmtR2 = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtN  = (v: number, d = 1) => v.toLocaleString("pt-BR", { minimumFractionDigits: d, maximumFractionDigits: d });
const hoje  = () => new Date().toISOString().slice(0, 10);
const dias  = (n: number) => { const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
const fmtDt = (s?: string | null) => s ? s.split("-").reverse().join("/") : "—";
const pct   = (v: number, total: number) => total > 0 ? Math.min(100, Math.max(0, (v / total) * 100)) : 0;

// ── Helpers ───────────────────────────────────────────────────
const aplicarMascara = (raw: string): string => {
  const nums = raw.replace(/\D/g, "");
  if (!nums) return "";
  return (Number(nums) / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};
const desmascarar = (masked: string): number =>
  Number(masked.replace(/\./g, "").replace(",", ".")) || 0;

function culturaToCommodity(cultura: string): "Soja" | "Milho" | "Algodão" {
  const c = cultura.toLowerCase();
  if (c.includes("soja"))                                    return "Soja";
  if (c.includes("milho"))                                   return "Milho";
  if (c.includes("algodao") || c.includes("algodão"))        return "Algodão";
  return "Soja";
}

function grupoCategoria(cat?: string): string {
  const c = (cat ?? "").toLowerCase();
  if (c.includes("sement"))                                                          return "Sementes";
  if (c.includes("fertilizante") || c.includes("adubo") || c.includes("npk") ||
      c.includes("calcár") || c.includes("calcario") || c.includes("gesso"))        return "Fertilizantes";
  if (c.includes("defensivo") || c.includes("herbicida") || c.includes("fungicida") ||
      c.includes("inseticida") || c.includes("adjuvante"))                           return "Defensivos";
  if (c.includes("combustível") || c.includes("combustivel") || c.includes("diesel") ||
      c.includes("operação") || c.includes("operacao") || c.includes("maquinário") ||
      c.includes("maquinario"))                                                       return "Operações";
  if (c.includes("arrendamento") || c.includes("aluguel"))                           return "Arrendamento";
  if (c.includes("mão de obra") || c.includes("mao de obra") ||
      c.includes("funcionário") || c.includes("funcionario") ||
      c.includes("salário") || c.includes("salario"))                                return "Mão de Obra";
  return "Outros";
}

const BENCHMARK = {
  Soja:    { sc_ha: 62,  custo_ha: 5800, unidade: "sc/ha" },
  Milho:   { sc_ha: 110, custo_ha: 3500, unidade: "sc/ha" },
  Algodão: { sc_ha: 250, custo_ha: 8500, unidade: "@/ha"  },
};

const GRUPOS_CUSTO = ["Sementes", "Fertilizantes", "Defensivos", "Operações", "Arrendamento", "Mão de Obra", "Outros"] as const;
const CORES_GRUPO: Record<string, string> = {
  Sementes: "#C9921B", Fertilizantes: "#1A4870", Defensivos: "#E24B4A",
  Operações: "#378ADD", Arrendamento: "#9B59B6", "Mão de Obra": "#16A34A", Outros: "#888",
};

// ── Componentes visuais ───────────────────────────────────────
function BarraGraos({ producao, arrSacas, barterSacas, fixadoSacas, dividaSacas }: {
  producao: number; arrSacas: number; barterSacas: number; fixadoSacas: number; dividaSacas: number;
}) {
  if (producao <= 0) return <span style={{ fontSize: 11, color: "#aaa" }}>Sem produção projetada</span>;
  const livre = Math.max(0, producao - arrSacas - barterSacas - fixadoSacas - dividaSacas);
  const p = (v: number) => Math.max(0, Math.min(100, (v / producao) * 100));
  return (
    <div>
      <div style={{ display: "flex", height: 14, borderRadius: 7, overflow: "hidden", gap: 1, background: "#EEF1F6" }}>
        {arrSacas    > 0 && <div style={{ width: `${p(arrSacas)}%`,    background: "#E24B4A" }} title={`Arrendamento: ${fmtN(arrSacas, 0)} sc`} />}
        {barterSacas > 0 && <div style={{ width: `${p(barterSacas)}%`, background: "#EF9F27" }} title={`Barter: ${fmtN(barterSacas, 0)} sc`} />}
        {fixadoSacas > 0 && <div style={{ width: `${p(fixadoSacas)}%`, background: "#378ADD" }} title={`Fixado: ${fmtN(fixadoSacas, 0)} sc`} />}
        {dividaSacas > 0 && <div style={{ width: `${p(dividaSacas)}%`, background: "#9B59B6" }} title={`Dívida: ${fmtN(dividaSacas, 0)} sc`} />}
        {livre       > 0 && <div style={{ width: `${p(livre)}%`,       background: "#16A34A" }} title={`Livre: ${fmtN(livre, 0)} sc`} />}
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 6 }}>
        {[
          { label: "Arrendamento", v: arrSacas,    bg: "#E24B4A" },
          { label: "Barter",       v: barterSacas, bg: "#EF9F27" },
          { label: "Fixado",       v: fixadoSacas, bg: "#378ADD" },
          { label: "Dívida (sc)",  v: dividaSacas, bg: "#9B59B6" },
          { label: "Livre",        v: livre,        bg: "#16A34A" },
        ].filter(x => x.v > 0).map(x => (
          <span key={x.label} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, color: "#555" }}>
            <span style={{ width: 8, height: 8, borderRadius: 2, background: x.bg, display: "inline-block" }} />
            {x.label}: <strong>{fmtN(x.v, 0)} sc</strong>
          </span>
        ))}
      </div>
    </div>
  );
}

function Semaforo({ saude }: { saude: "verde" | "amarelo" | "vermelho" }) {
  const map = {
    verde:    { bg: "#ECFDF5", color: "#14532D", label: "Saudável"  },
    amarelo:  { bg: "#FBF3E0", color: "#7A5A12", label: "Atenção"   },
    vermelho: { bg: "#FCEBEB", color: "#791F1F", label: "Crítico"   },
  };
  const s = map[saude];
  return <span style={{ background: s.bg, color: s.color, borderRadius: 5, padding: "2px 8px", fontSize: 11, fontWeight: 600 }}>{s.label}</span>;
}

function BarraHorizontal({ value, max, color, label, sub }: { value: number; max: number; color: string; label: string; sub?: string }) {
  const w = pct(value, max);
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
        <span style={{ fontSize: 12, color: "#333", fontWeight: 500 }}>{label}</span>
        <span style={{ fontSize: 12, fontWeight: 700, color }}>{sub ?? fmtR(value)}</span>
      </div>
      <div style={{ height: 8, borderRadius: 4, background: "#EEF1F6", overflow: "hidden" }}>
        <div style={{ width: `${w}%`, height: "100%", background: color, borderRadius: 4, transition: "width 0.4s" }} />
      </div>
    </div>
  );
}

type Aba = "painel" | "producao" | "custos" | "comercializacao" | "financeiro" | "sensibilidade";

// ── Componente principal ──────────────────────────────────────
export default function BI() {
  const { fazendaId, userRole } = useAuth();
  const router = useRouter();

  const [fazenda,     setFazenda]     = useState<Fazenda | null>(null);
  const [anosSafra,   setAnosSafra]   = useState<AnoSafra[]>([]);
  const [ciclos,      setCiclos]      = useState<Ciclo[]>([]);
  const [plantios,    setPlantios]    = useState<Plantio[]>([]);
  const [colheitas,   setColheitas]   = useState<Colheita[]>([]);
  const [arrPags,     setArrPags]     = useState<ArrPag[]>([]);
  const [lancamentos, setLancamentos] = useState<Lancamento[]>([]);
  const [contratos,   setContratos]   = useState<Contrato[]>([]);
  const [precos,      setPrecos]      = useState<PrecosData | null>(null);

  const [loading,     setLoading]     = useState(true);
  const [aba,         setAba]         = useState<Aba>("painel");

  // ── Filtros ──────────────────────────────────────────────────
  const [filtroAnoSafraId, setFiltroAnoSafraId] = useState("");
  const [filtroCicloIds,   setFiltroCicloIds]   = useState<Set<string>>(new Set());
  const [commodity,        setCommodity]         = useState<"Soja" | "Milho" | "Algodão">("Soja");

  // ── Sensibilidade ────────────────────────────────────────────
  const [precoMask, setPrecoMask] = useState("");
  const [prodMask,  setProdMask]  = useState("");
  const [custoMask, setCustoMask] = useState("");
  const [areaStr,   setAreaStr]   = useState("");

  // Guard
  useEffect(() => {
    if (userRole !== null && userRole !== "raccotlo") router.push("/");
  }, [userRole, router]);

  const carregar = useCallback(async () => {
    if (!fazendaId) return;
    setLoading(true);
    const [fazR, safR, cicR, plaR, colR, arrR, lanR, conR, precR] = await Promise.allSettled([
      supabase.from("fazendas").select("id,nome,municipio,estado,area_total_ha,raccolto_acesso").eq("id", fazendaId).single(),
      supabase.from("anos_safra").select("*").eq("fazenda_id", fazendaId).order("descricao"),
      supabase.from("ciclos").select("id,fazenda_id,ano_safra_id,cultura,descricao,preco_esperado_sc").eq("fazenda_id", fazendaId),
      supabase.from("plantios").select("id,fazenda_id,ciclo_id,area_ha,produtividade_esperada").eq("fazenda_id", fazendaId),
      supabase.from("colheitas").select("id,fazenda_id,ciclo_id,area_ha,sacas_liquidas,peso_liquido_kg").eq("fazenda_id", fazendaId),
      supabase.from("arrendamento_pagamentos").select("id,fazenda_id,ano_safra_id,sacas_previstas,commodity,status").eq("fazenda_id", fazendaId),
      supabase.from("lancamentos").select("id,fazenda_id,tipo,moeda,status,valor,sacas,cultura_barter,data_vencimento,data_baixa,descricao,categoria,cotacao_usd,ano_safra_id").eq("fazenda_id", fazendaId),
      supabase.from("contratos").select("id,fazenda_id,produto,quantidade_sc,entregue_sc,status,is_arrendamento,preco,safra,comprador,numero,dado_em_cessao,cessao_fornecedor_nome,cessao_data").eq("fazenda_id", fazendaId),
      fetch("/api/precos").then(r => r.json()),
    ]);
    if (fazR.status === "fulfilled" && fazR.value.data) setFazenda(fazR.value.data as Fazenda);
    if (safR.status === "fulfilled") setAnosSafra((safR.value.data ?? []) as AnoSafra[]);
    if (cicR.status === "fulfilled") setCiclos((cicR.value.data ?? []) as Ciclo[]);
    if (plaR.status === "fulfilled") setPlantios((plaR.value.data ?? []) as Plantio[]);
    if (colR.status === "fulfilled") setColheitas((colR.value.data ?? []) as Colheita[]);
    if (arrR.status === "fulfilled") setArrPags((arrR.value.data ?? []) as ArrPag[]);
    if (lanR.status === "fulfilled") setLancamentos((lanR.value.data ?? []) as Lancamento[]);
    if (conR.status === "fulfilled") setContratos((conR.value.data ?? []) as Contrato[]);
    if (precR.status === "fulfilled") setPrecos(precR.value as PrecosData);
    setLoading(false);
  }, [fazendaId]);

  useEffect(() => {
    if (userRole === "raccotlo" && fazendaId) carregar();
  }, [userRole, fazendaId, carregar]);

  // ── Guard visual ──────────────────────────────────────────────
  if (userRole === null || userRole !== "raccotlo") {
    return (
      <div style={{ minHeight: "100vh", background: "#F4F6FA" }}>
        <TopNav />
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "60vh" }}>
          <div style={{ textAlign: "center", color: "#888", fontSize: 14 }}>Verificando acesso…</div>
        </div>
      </div>
    );
  }
  if (!loading && fazenda && fazenda.raccolto_acesso === false) {
    return (
      <div style={{ minHeight: "100vh", background: "#F4F6FA" }}>
        <TopNav />
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "60vh" }}>
          <div style={{ textAlign: "center", maxWidth: 420 }}>
            <div style={{ fontSize: 40, marginBottom: 14 }}>🔒</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: "#1a1a1a", marginBottom: 8 }}>Acesso não autorizado</div>
            <div style={{ fontSize: 13, color: "#555", lineHeight: 1.6 }}>
              O cliente ainda não ativou o acesso Raccolto.<br />
              Solicite: <strong>Configurações → Usuários → Ativar Usuário Raccolto</strong>.
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── Filtros derivados ──────────────────────────────────────────
  function toggleCiclo(id: string) {
    setFiltroCicloIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }
  function handleAnoSafraChange(id: string) {
    setFiltroAnoSafraId(id);
    setFiltroCicloIds(new Set());
  }

  const ciclosPorAnoSafra = filtroAnoSafraId
    ? ciclos.filter(c => c.ano_safra_id === filtroAnoSafraId)
    : ciclos;
  const ciclosFiltrados = filtroCicloIds.size > 0
    ? ciclosPorAnoSafra.filter(c => filtroCicloIds.has(c.id))
    : ciclosPorAnoSafra;
  const cicloIdsSet = new Set(ciclosFiltrados.map(c => c.id));
  const anoSafraIdsFiltSet = new Set(ciclosFiltrados.map(c => c.ano_safra_id));

  const plantiosFiltrados  = plantios.filter(p => cicloIdsSet.has(p.ciclo_id));
  const colheitasFiltradas = colheitas.filter(c => cicloIdsSet.has(c.ciclo_id));
  const lancamentosFiltrados = filtroAnoSafraId
    ? lancamentos.filter(l => !l.ano_safra_id || l.ano_safra_id === filtroAnoSafraId)
    : lancamentos;

  const safrasUnicas = Array.from(new Map(anosSafra.map(a => [a.descricao, a])).values())
    .sort((a, b) => b.descricao.localeCompare(a.descricao));

  // ── Métricas por ciclo ─────────────────────────────────────────
  function calcCicloMetrics(cicloId: string) {
    const pls = plantios.filter(p => p.ciclo_id === cicloId);
    const area = pls.reduce((s, p) => s + (p.area_ha || 0), 0);
    const prodEsperada = pls.reduce((s, p) => s + (p.area_ha || 0) * (p.produtividade_esperada || 0), 0);
    const scHaEsperado = area > 0 ? prodEsperada / area : 0;

    const cols = colheitas.filter(c => c.ciclo_id === cicloId);
    const sacasReais = cols.reduce((s, c) => s + (c.sacas_liquidas ?? (c.peso_liquido_kg ?? 0) / 60), 0);
    const areaColhida = cols.reduce((s, c) => s + (c.area_ha ?? 0), 0);
    const scHaReal = areaColhida > 0 ? sacasReais / areaColhida : 0;

    return { area, prodEsperada, scHaEsperado, sacasReais, areaColhida, scHaReal };
  }

  // ── Custos agregados ───────────────────────────────────────────
  const cpFiltrados = lancamentosFiltrados.filter(l => l.tipo === "pagar" && l.status !== "baixado");
  const totalCustos = cpFiltrados.reduce((s, l) => s + l.valor, 0);
  const areaFiltrada = plantiosFiltrados.reduce((s, p) => s + (p.area_ha || 0), 0);
  const custoHaEstimado = areaFiltrada > 0 ? totalCustos / areaFiltrada : 0;

  const custosPorGrupo: Record<string, number> = {};
  for (const g of GRUPOS_CUSTO) custosPorGrupo[g] = 0;
  for (const l of cpFiltrados) {
    const g = grupoCategoria(l.categoria);
    custosPorGrupo[g] = (custosPorGrupo[g] ?? 0) + l.valor;
  }

  // ── KPIs financeiros (todos os lançamentos) ──────────────────
  const hj  = hoje();
  const d30 = dias(30);
  const d60 = dias(60);
  const d90 = dias(90);

  const cpVencidas  = lancamentos.filter(l => l.tipo === "pagar"   && l.status !== "baixado" && l.data_vencimento < hj).reduce((s, l) => s + l.valor, 0);
  const cpA30       = lancamentos.filter(l => l.tipo === "pagar"   && l.status !== "baixado" && l.data_vencimento >= hj && l.data_vencimento <= d30).reduce((s, l) => s + l.valor, 0);
  const crA30       = lancamentos.filter(l => l.tipo === "receber" && l.status !== "baixado" && l.data_vencimento >= hj && l.data_vencimento <= d30).reduce((s, l) => s + l.valor, 0);
  const totalCP     = lancamentos.filter(l => l.tipo === "pagar"   && l.status !== "baixado").reduce((s, l) => s + l.valor, 0);
  const totalCR     = lancamentos.filter(l => l.tipo === "receber" && l.status !== "baixado").reduce((s, l) => s + l.valor, 0);
  const saldoLiq    = totalCR - totalCP;

  // Saúde geral
  let saudeGeral: "verde" | "amarelo" | "vermelho" = "verde";
  if (cpVencidas > 0 && cpVencidas > totalCR * 0.3) saudeGeral = "vermelho";
  else if (cpVencidas > 0 || saldoLiq < 0) saudeGeral = "amarelo";

  // ── Posição de grãos (usa filtro de ciclos) ──────────────────
  function calcPosicao(comm: string) {
    const cIds = new Set(
      ciclosFiltrados.filter(c => culturaToCommodity(c.cultura) === comm).map(c => c.id)
    );
    const producao = plantios
      .filter(p => cIds.has(p.ciclo_id))
      .reduce((s, p) => s + (p.area_ha || 0) * (p.produtividade_esperada || 0), 0);
    const arrSacas = arrPags
      .filter(p => p.status !== "pago" && p.status !== "cancelado" && p.commodity === comm &&
        (anoSafraIdsFiltSet.size === 0 || anoSafraIdsFiltSet.has(p.ano_safra_id)))
      .reduce((s, p) => s + (p.sacas_previstas || 0), 0);
    const barterSacas = lancamentos
      .filter(l => l.moeda === "barter" && l.cultura_barter === comm && l.status !== "baixado")
      .reduce((s, l) => s + (l.sacas || 0), 0);
    const fixadoSacas = contratos
      .filter(c => !c.is_arrendamento && c.produto === comm && c.status !== "cancelado")
      .reduce((s, c) => s + (c.quantidade_sc || 0), 0);
    const ciclosComm = ciclosFiltrados.filter(c => culturaToCommodity(c.cultura) === comm && (c as any).preco_esperado_sc);
    const precoCiclo = ciclosComm.length > 0
      ? ciclosComm.reduce((s: number, c: any) => s + (c.preco_esperado_sc as number), 0) / ciclosComm.length
      : 0;
    const precoBrl = precoCiclo > 0 ? precoCiclo
                   : comm === "Soja"  ? (precos?.soja.brl ?? 0)
                   : comm === "Milho" ? (precos?.milho.brl ?? 0)
                   : (precos?.algodao?.brl ?? 0);
    const dividaBrl   = lancamentos.filter(l => l.tipo === "pagar" && l.moeda === "BRL" && l.status !== "baixado").reduce((s, l) => s + l.valor, 0);
    const dividaSacas = precoBrl > 0 ? dividaBrl / precoBrl : 0;
    const comprPct    = producao > 0 ? Math.min(100, ((arrSacas + barterSacas + fixadoSacas + dividaSacas) / producao) * 100) : 0;
    return { producao, arrSacas, barterSacas, fixadoSacas, dividaSacas, comprPct, precoBrl };
  }

  // ── Produção total filtrada ───────────────────────────────────
  const prodTotalEsperada = plantiosFiltrados.reduce((s, p) => s + (p.area_ha || 0) * (p.produtividade_esperada || 0), 0);
  const sacasTotaisReais  = colheitasFiltradas.reduce((s, c) => s + (c.sacas_liquidas ?? (c.peso_liquido_kg ?? 0) / 60), 0);

  // ── Diagnóstico automático ────────────────────────────────────
  const diagnostico: { tipo: "ok" | "warn" | "crit"; msg: string }[] = [];
  if (cpVencidas > 0)
    diagnostico.push({ tipo: "crit", msg: `${fmtR(cpVencidas)} em CP vencidas — regularize imediatamente` });
  if (saldoLiq < 0)
    diagnostico.push({ tipo: "crit", msg: `Saldo líquido negativo: ${fmtR(Math.abs(saldoLiq))} a descoberto` });
  else if (saldoLiq < totalCP * 0.1 && totalCP > 0)
    diagnostico.push({ tipo: "warn", msg: `Saldo apertado: ${fmtR(saldoLiq)} vs ${fmtR(totalCP)} em CP pendentes` });

  const posSoja = calcPosicao("Soja");
  if (posSoja.producao > 0) {
    if (posSoja.comprPct > 90)      diagnostico.push({ tipo: "crit", msg: `Soja ${fmtN(posSoja.comprPct, 0)}% comprometida — risco de déficit de grãos` });
    else if (posSoja.comprPct > 70) diagnostico.push({ tipo: "warn", msg: `Soja ${fmtN(posSoja.comprPct, 0)}% comprometida — acompanhar posição de fixação` });
    else if (posSoja.comprPct < 25) diagnostico.push({ tipo: "warn", msg: `Soja apenas ${fmtN(posSoja.comprPct, 0)}% comprometida — considerar fixação de mais volume` });
    else                             diagnostico.push({ tipo: "ok",   msg: `Posição de soja equilibrada (${fmtN(posSoja.comprPct, 0)}% comprometida)` });
  }

  if (custoHaEstimado > 0 && areaFiltrada > 0) {
    const bench = 5800;
    const diff  = custoHaEstimado - bench;
    if (diff > 1200)      diagnostico.push({ tipo: "crit", msg: `Custo/ha ${fmtR(custoHaEstimado)} está ${fmtR(diff)} acima do benchmark MT (${fmtR(bench)})` });
    else if (diff > 400)  diagnostico.push({ tipo: "warn", msg: `Custo/ha ${fmtR(custoHaEstimado)} ligeiramente acima do benchmark MT (${fmtR(bench)})` });
    else                  diagnostico.push({ tipo: "ok",   msg: `Custo/ha ${fmtR(custoHaEstimado)} dentro do padrão MT (benchmark: ${fmtR(bench)})` });
  }

  ciclosFiltrados.forEach(ciclo => {
    const m = calcCicloMetrics(ciclo.id);
    if (m.area === 0) return;
    const comm = culturaToCommodity(ciclo.cultura);
    const benchScHa = BENCHMARK[comm]?.sc_ha ?? 62;
    if (m.scHaEsperado > 0 && m.scHaEsperado < benchScHa * 0.85)
      diagnostico.push({ tipo: "warn", msg: `${ciclo.descricao}: produtividade esperada ${fmtN(m.scHaEsperado, 1)} sc/ha abaixo da média MT (${benchScHa})` });
  });

  if (diagnostico.length === 0)
    diagnostico.push({ tipo: "ok", msg: "Todos os indicadores dentro dos parâmetros normais" });

  // ── Sensibilidade — derivados ─────────────────────────────────
  const precoBrlSoja  = precos?.soja.brl ?? 128;
  const sojaPlantios  = plantios.filter(p => { const c = ciclos.find(x => x.id === p.ciclo_id); return c && c.cultura.toLowerCase().includes("soja"); });
  const areaSojaTotal = sojaPlantios.reduce((s, p) => s + (p.area_ha || 0), 0);
  const prodSojaTotal = sojaPlantios.reduce((s, p) => s + (p.area_ha || 0) * (p.produtividade_esperada || 0), 0);
  const prodBaseRef   = areaSojaTotal > 0 ? prodSojaTotal / areaSojaTotal : 60;
  const custoHaRef    = totalCP > 0 && (fazenda?.area_total_ha ?? 0) > 0 ? totalCP / (fazenda!.area_total_ha!) : 4800;
  const areaRef       = fazenda?.area_total_ha ?? 1000;

  useEffect(() => {
    if (!loading && precoMask === "") {
      setPrecoMask(aplicarMascara(String(Math.round(precoBrlSoja * 100))));
      setProdMask(aplicarMascara(String(Math.round(prodBaseRef * 100))));
      setCustoMask(aplicarMascara(String(Math.round(custoHaRef * 100))));
      setAreaStr(String(Math.round(areaRef)));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading]);

  const precoSc  = desmascarar(precoMask) || precoBrlSoja;
  const prodHa   = desmascarar(prodMask)  || prodBaseRef;
  const custoHa  = desmascarar(custoMask) || custoHaRef;
  const areaSens = Number(areaStr) || areaRef;
  const recHa    = precoSc * prodHa;
  const marHa    = recHa - custoHa;
  const marPct   = recHa > 0 ? (marHa / recHa) * 100 : 0;
  const resTot   = marHa * areaSens;
  const pBreak   = prodHa > 0 ? custoHa / prodHa : 0;
  const qBreak   = precoSc > 0 ? custoHa / precoSc : 0;
  const sensPrecos = [precoSc*0.85, precoSc*0.92, precoSc, precoSc*1.08, precoSc*1.16].map(v => Math.round(v*100)/100);
  const sensProds  = [prodHa*0.85,  prodHa*0.92,  prodHa,  prodHa*1.08,  prodHa*1.16 ].map(v => Math.round(v*100)/100);

  // ── Contratos ativos ──────────────────────────────────────────
  const contratosAtivos = contratos.filter(c => c.status === "aberto" && !c.is_arrendamento);

  // ── Liquidez 90 dias ──────────────────────────────────────────
  const liquidez90 = [
    { label: "Vencidos",  cp: cpVencidas, cr: lancamentos.filter(l => l.tipo === "receber" && l.status !== "baixado" && l.data_vencimento < hj).reduce((s, l) => s + l.valor, 0) },
    { label: "0–30 dias", cp: cpA30,      cr: crA30 },
    { label: "31–60 dias",cp: lancamentos.filter(l => l.tipo === "pagar"   && l.status !== "baixado" && l.data_vencimento > d30 && l.data_vencimento <= d60).reduce((s, l) => s + l.valor, 0),
                          cr: lancamentos.filter(l => l.tipo === "receber" && l.status !== "baixado" && l.data_vencimento > d30 && l.data_vencimento <= d60).reduce((s, l) => s + l.valor, 0) },
    { label: "61–90 dias",cp: lancamentos.filter(l => l.tipo === "pagar"   && l.status !== "baixado" && l.data_vencimento > d60 && l.data_vencimento <= d90).reduce((s, l) => s + l.valor, 0),
                          cr: lancamentos.filter(l => l.tipo === "receber" && l.status !== "baixado" && l.data_vencimento > d60 && l.data_vencimento <= d90).reduce((s, l) => s + l.valor, 0) },
  ];
  const maxLiq = Math.max(...liquidez90.map(l => Math.max(l.cp, l.cr)), 1);

  // ── Abas ──────────────────────────────────────────────────────
  const alertasCount = lancamentos.filter(l => l.tipo === "pagar" && l.status !== "baixado" && l.data_vencimento < hj).length;
  const ABAS: { key: Aba; label: string; badge?: number }[] = [
    { key: "painel",          label: "Painel Executivo" },
    { key: "producao",        label: "Produção" },
    { key: "custos",          label: "Custos & Insumos" },
    { key: "comercializacao", label: "Comercialização" },
    { key: "financeiro",      label: "Financeiro", badge: alertasCount },
    { key: "sensibilidade",   label: "Sensibilidade" },
  ];

  const inputSt: React.CSSProperties = { width: "100%", padding: "8px 10px", border: "0.5px solid #D4DCE8", borderRadius: 8, fontSize: 13, color: "#1a1a1a", background: "#fff", boxSizing: "border-box", outline: "none" };
  const labelSt: React.CSSProperties = { fontSize: 11, color: "#555", marginBottom: 4, display: "block" };

  // ─────────────────────────────────────────────────────────────
  return (
    <div style={{ minHeight: "100vh", background: "#0B1E35", fontFamily: "system-ui, sans-serif" }}>
      <TopNav />

      {/* ── Cabeçalho ────────────────────────────────────────── */}
      <div style={{ background: "linear-gradient(135deg, #0B1E35 0%, #1A4870 100%)", padding: "20px 32px 0", borderBottom: "0.5px solid rgba(255,255,255,0.08)" }}>

        {/* Linha 1: título + preços + refresh */}
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 14 }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 3 }}>
              <h1 style={{ margin: 0, fontSize: 19, fontWeight: 700, color: "#fff" }}>Raccolto Intelligence</h1>
              <span style={{ background: "#C9921B", color: "#fff", fontSize: 10, padding: "2px 8px", borderRadius: 10, fontWeight: 700 }}>EXCLUSIVO</span>
              {fazenda && <Semaforo saude={saudeGeral} />}
            </div>
            <p style={{ margin: 0, fontSize: 12, color: "rgba(255,255,255,0.5)" }}>
              {fazenda?.nome ?? "—"}{fazenda?.municipio ? ` · ${fazenda.municipio}` : ""}{fazenda?.estado ? ` / ${fazenda.estado}` : ""}{fazenda?.area_total_ha ? ` · ${fmtN(fazenda.area_total_ha, 0)} ha` : ""}
            </p>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {precos && (
              <div style={{ display: "flex", gap: 5 }}>
                {[
                  { label: "Soja",  v: precos.soja.brl,  var: precos.soja.variacao  },
                  { label: "Milho", v: precos.milho.brl, var: precos.milho.variacao },
                  { label: "USD",   v: precos.usdBrl,    var: 0                     },
                ].map(p => (
                  <div key={p.label} style={{ background: "rgba(255,255,255,0.07)", borderRadius: 7, padding: "5px 9px", textAlign: "center", minWidth: 66 }}>
                    <div style={{ fontSize: 9, color: "rgba(255,255,255,0.45)", marginBottom: 1 }}>{p.label}</div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: "#fff" }}>R$ {fmtN(p.v, 2)}</div>
                    {p.var !== 0 && <div style={{ fontSize: 9, color: p.var > 0 ? "#4ADE80" : "#F87171" }}>{p.var > 0 ? "+" : ""}{fmtN(p.var, 1)}%</div>}
                  </div>
                ))}
              </div>
            )}
            <button onClick={carregar} style={{ padding: "7px 11px", borderRadius: 7, border: "0.5px solid rgba(255,255,255,0.2)", background: "rgba(255,255,255,0.08)", color: "#fff", fontSize: 13, cursor: "pointer" }}>↻</button>
          </div>
        </div>

        {/* Linha 2: filtros */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14, flexWrap: "wrap" }}>
          <select
            value={filtroAnoSafraId}
            onChange={e => handleAnoSafraChange(e.target.value)}
            style={{ padding: "6px 10px", borderRadius: 7, border: "0.5px solid rgba(255,255,255,0.2)", background: "rgba(255,255,255,0.1)", color: "#fff", fontSize: 12, cursor: "pointer", outline: "none" }}
          >
            <option value="" style={{ background: "#1A4870" }}>Todas as safras</option>
            {safrasUnicas.map(s => (
              <option key={s.id} value={s.id} style={{ background: "#1A4870" }}>{s.descricao}</option>
            ))}
          </select>

          {filtroAnoSafraId && ciclosPorAnoSafra.length > 0 && (
            <div style={{ display: "flex", gap: 5, flexWrap: "wrap", alignItems: "center" }}>
              <span style={{ fontSize: 11, color: "rgba(255,255,255,0.45)" }}>Ciclos:</span>
              {ciclosPorAnoSafra.map(c => {
                const ativo = filtroCicloIds.has(c.id);
                return (
                  <button key={c.id} onClick={() => toggleCiclo(c.id)} style={{
                    padding: "4px 10px", borderRadius: 12, border: "0.5px solid rgba(255,255,255,0.25)",
                    background: ativo ? "#C9921B" : "rgba(255,255,255,0.08)",
                    color: ativo ? "#fff" : "rgba(255,255,255,0.7)",
                    fontSize: 11, cursor: "pointer", fontWeight: ativo ? 700 : 400, transition: "all 0.15s",
                  }}>{c.descricao}</button>
                );
              })}
              {filtroCicloIds.size > 0 && (
                <button onClick={() => setFiltroCicloIds(new Set())} style={{ padding: "4px 8px", borderRadius: 12, border: "none", background: "rgba(255,255,255,0.12)", color: "rgba(255,255,255,0.5)", fontSize: 10, cursor: "pointer" }}>✕ limpar</button>
              )}
            </div>
          )}

          {(filtroAnoSafraId || filtroCicloIds.size > 0) && (
            <span style={{ fontSize: 10, color: "rgba(255,255,255,0.35)", marginLeft: 4 }}>
              {ciclosFiltrados.length} ciclo{ciclosFiltrados.length !== 1 ? "s" : ""} · {fmtN(areaFiltrada, 0)} ha
            </span>
          )}
        </div>

        {/* Abas */}
        <div style={{ display: "flex", gap: 2 }}>
          {ABAS.map(a => (
            <button key={a.key} onClick={() => setAba(a.key)} style={{
              padding: "9px 16px", border: "none", cursor: "pointer", fontSize: 12,
              fontWeight: aba === a.key ? 700 : 400, borderRadius: "7px 7px 0 0",
              background: aba === a.key ? "#F4F6FA" : "transparent",
              color: aba === a.key ? "#1A4870" : "rgba(255,255,255,0.6)",
              display: "flex", alignItems: "center", gap: 5,
            }}>
              {a.label}
              {!!a.badge && a.badge > 0 && (
                <span style={{ background: "#E24B4A", color: "#fff", fontSize: 10, padding: "1px 5px", borderRadius: 7 }}>{a.badge}</span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* ── Conteúdo ───────────────────────────────────────────── */}
      <div style={{ background: "#F4F6FA", minHeight: "calc(100vh - 200px)", padding: "22px 32px" }}>

        {loading && (
          <div style={{ textAlign: "center", padding: 60, color: "#888" }}>Carregando análise da fazenda…</div>
        )}

        {/* ═══════════ PAINEL EXECUTIVO ═══════════ */}
        {!loading && aba === "painel" && (
          <div>
            {/* KPIs globais */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: 12, marginBottom: 20 }}>
              {[
                { label: "Área Filtrada",      v: `${fmtN(areaFiltrada, 0)} ha`,      color: "#0C447C", bg: "#EBF3FC" },
                { label: "Produção Projetada", v: `${fmtN(prodTotalEsperada, 0)} sc`,  color: "#14532D", bg: "#ECFDF5" },
                { label: "Produção Realizada", v: sacasTotaisReais > 0 ? `${fmtN(sacasTotaisReais, 0)} sc` : "—",  color: "#14532D", bg: "#ECFDF5" },
                { label: "Saldo Líquido",      v: fmtR(saldoLiq), color: saldoLiq >= 0 ? "#14532D" : "#791F1F", bg: saldoLiq >= 0 ? "#ECFDF5" : "#FCEBEB" },
                { label: "CP Vencidas",         v: fmtR(cpVencidas), color: cpVencidas > 0 ? "#791F1F" : "#888", bg: cpVencidas > 0 ? "#FCEBEB" : "#F4F6FA" },
              ].map(k => (
                <div key={k.label} style={{ background: "#fff", borderRadius: 10, padding: "14px 16px", border: "0.5px solid #DDE2EE" }}>
                  <div style={{ fontSize: 10, color: "#666", marginBottom: 5 }}>{k.label}</div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: k.color }}>{k.v}</div>
                </div>
              ))}
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
              {/* Diagnóstico Raccolto */}
              <div style={{ background: "#fff", borderRadius: 12, border: "0.5px solid #DDE2EE", overflow: "hidden" }}>
                <div style={{ padding: "12px 18px", borderBottom: "0.5px solid #DDE2EE", background: "#1A4870" }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: "#fff" }}>Diagnóstico Raccolto</span>
                  <span style={{ fontSize: 10, color: "rgba(255,255,255,0.6)", marginLeft: 8 }}>Análise automática dos indicadores</span>
                </div>
                <div style={{ padding: "14px 18px", display: "flex", flexDirection: "column", gap: 8 }}>
                  {diagnostico.map((d, i) => (
                    <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
                      <span style={{ fontSize: 13, marginTop: 1 }}>{d.tipo === "ok" ? "✓" : d.tipo === "warn" ? "⚠" : "✗"}</span>
                      <span style={{ fontSize: 12, color: d.tipo === "ok" ? "#14532D" : d.tipo === "warn" ? "#7A5A12" : "#791F1F", lineHeight: 1.5 }}>{d.msg}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Resumo por ciclo */}
              <div style={{ background: "#fff", borderRadius: 12, border: "0.5px solid #DDE2EE", overflow: "hidden" }}>
                <div style={{ padding: "12px 18px", borderBottom: "0.5px solid #DDE2EE", fontWeight: 700, fontSize: 12, color: "#1a1a1a" }}>Resumo por Ciclo</div>
                {ciclosFiltrados.length === 0 ? (
                  <div style={{ padding: "24px 18px", textAlign: "center", color: "#aaa", fontSize: 12 }}>Nenhum ciclo no filtro selecionado</div>
                ) : (
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead>
                      <tr style={{ background: "#F8FAFD" }}>
                        {["Ciclo", "Cultura", "Área", "Prod. Esp.", "sc/ha Esp.", "sc/ha MT", "Status"].map((h, i) => (
                          <th key={h} style={{ padding: "7px 12px", textAlign: i >= 2 ? "right" : "left", fontSize: 10, fontWeight: 600, color: "#555", borderBottom: "0.5px solid #DDE2EE" }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {ciclosFiltrados.map((ciclo, i) => {
                        const m   = calcCicloMetrics(ciclo.id);
                        const comm = culturaToCommodity(ciclo.cultura);
                        const bm  = BENCHMARK[comm]?.sc_ha ?? 62;
                        const saude: "verde" | "amarelo" | "vermelho" =
                          m.area === 0 ? "amarelo" :
                          m.scHaEsperado < bm * 0.85 ? "amarelo" : "verde";
                        return (
                          <tr key={ciclo.id} style={{ borderBottom: i < ciclosFiltrados.length - 1 ? "0.5px solid #EEF1F6" : "none" }}>
                            <td style={{ padding: "8px 12px", fontSize: 11, fontWeight: 600, color: "#1a1a1a" }}>{ciclo.descricao}</td>
                            <td style={{ padding: "8px 12px", fontSize: 11, color: "#555" }}>{ciclo.cultura}</td>
                            <td style={{ padding: "8px 12px", textAlign: "right", fontSize: 11 }}>{fmtN(m.area, 0)} ha</td>
                            <td style={{ padding: "8px 12px", textAlign: "right", fontSize: 11 }}>{fmtN(m.prodEsperada, 0)} sc</td>
                            <td style={{ padding: "8px 12px", textAlign: "right", fontSize: 11, fontWeight: 600 }}>{m.scHaEsperado > 0 ? fmtN(m.scHaEsperado, 1) : "—"}</td>
                            <td style={{ padding: "8px 12px", textAlign: "right", fontSize: 10, color: "#888" }}>{bm}</td>
                            <td style={{ padding: "8px 12px", textAlign: "right" }}><Semaforo saude={saude} /></td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>
            </div>

            {/* Posição rápida de grãos */}
            <div style={{ background: "#fff", borderRadius: 12, border: "0.5px solid #DDE2EE", padding: "16px 20px" }}>
              <div style={{ fontWeight: 700, fontSize: 12, color: "#1a1a1a", marginBottom: 14 }}>Posição de Grãos — Resumo</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                {(["Soja", "Milho", "Algodão"] as const).map(comm => {
                  const p = calcPosicao(comm);
                  if (p.producao === 0 && p.arrSacas === 0 && p.fixadoSacas === 0) return null;
                  const risco: "verde" | "amarelo" | "vermelho" = p.comprPct > 90 ? "vermelho" : p.comprPct > 65 ? "amarelo" : "verde";
                  return (
                    <div key={comm}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                        <span style={{ fontSize: 12, fontWeight: 700, color: "#1a1a1a", width: 65 }}>{comm}</span>
                        <Semaforo saude={risco} />
                        <span style={{ fontSize: 11, color: "#666" }}>
                          {fmtN(p.producao, 0)} sc projetadas · {fmtN(Math.max(0, p.producao - p.arrSacas - p.barterSacas - p.fixadoSacas - p.dividaSacas), 0)} sc livres ({fmtN(100 - p.comprPct, 0)}% livre)
                        </span>
                      </div>
                      <BarraGraos {...p} />
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* ═══════════ PRODUÇÃO ═══════════ */}
        {!loading && aba === "producao" && (
          <div>
            {/* Ciclo cards */}
            {ciclosFiltrados.length === 0 ? (
              <div style={{ background: "#fff", borderRadius: 12, padding: 48, textAlign: "center", color: "#888", border: "0.5px solid #DDE2EE" }}>
                Selecione um ano safra para ver a análise de produção por ciclo.
              </div>
            ) : (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))", gap: 14, marginBottom: 20 }}>
                {ciclosFiltrados.map(ciclo => {
                  const m    = calcCicloMetrics(ciclo.id);
                  const comm = culturaToCommodity(ciclo.cultura);
                  const bm   = BENCHMARK[comm];
                  const devPct = bm && m.scHaEsperado > 0 ? ((m.scHaEsperado - bm.sc_ha) / bm.sc_ha) * 100 : null;
                  const realPct = m.scHaEsperado > 0 && m.scHaReal > 0 ? (m.scHaReal / m.scHaEsperado) * 100 : null;
                  const colhido = m.sacasReais > 0;
                  return (
                    <div key={ciclo.id} style={{ background: "#fff", borderRadius: 12, border: "0.5px solid #DDE2EE", overflow: "hidden" }}>
                      <div style={{ padding: "12px 16px", borderBottom: "0.5px solid #EEF1F6", display: "flex", justifyContent: "space-between", alignItems: "center", background: "#F8FAFD" }}>
                        <div>
                          <div style={{ fontSize: 13, fontWeight: 700, color: "#1a1a1a" }}>{ciclo.descricao}</div>
                          <div style={{ fontSize: 11, color: "#666" }}>{ciclo.cultura}</div>
                        </div>
                        <span style={{ background: colhido ? "#ECFDF5" : "#EBF3FC", color: colhido ? "#14532D" : "#0C447C", borderRadius: 6, padding: "3px 9px", fontSize: 10, fontWeight: 700 }}>
                          {colhido ? "Colhido" : "Em andamento"}
                        </span>
                      </div>
                      <div style={{ padding: "14px 16px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                        <div>
                          <div style={{ fontSize: 10, color: "#888", marginBottom: 3 }}>Área plantada</div>
                          <div style={{ fontSize: 17, fontWeight: 700, color: "#1A4870" }}>{fmtN(m.area, 0)} ha</div>
                        </div>
                        <div>
                          <div style={{ fontSize: 10, color: "#888", marginBottom: 3 }}>Produção esperada</div>
                          <div style={{ fontSize: 17, fontWeight: 700, color: "#1a1a1a" }}>{fmtN(m.prodEsperada, 0)} sc</div>
                        </div>
                        <div>
                          <div style={{ fontSize: 10, color: "#888", marginBottom: 3 }}>sc/ha esperado</div>
                          <div style={{ fontSize: 15, fontWeight: 700, color: "#1a1a1a" }}>{m.scHaEsperado > 0 ? fmtN(m.scHaEsperado, 1) : "—"}</div>
                          {bm && m.scHaEsperado > 0 && (
                            <div style={{ fontSize: 10, color: "#888", marginTop: 2 }}>benchmark MT: {bm.sc_ha} {bm.unidade}</div>
                          )}
                        </div>
                        {colhido ? (
                          <div>
                            <div style={{ fontSize: 10, color: "#888", marginBottom: 3 }}>sc/ha realizado</div>
                            <div style={{ fontSize: 15, fontWeight: 700, color: m.scHaReal >= (bm?.sc_ha ?? 0) ? "#16A34A" : "#E24B4A" }}>{fmtN(m.scHaReal, 1)}</div>
                          </div>
                        ) : (
                          <div>
                            <div style={{ fontSize: 10, color: "#888", marginBottom: 3 }}>vs benchmark MT</div>
                            <div style={{ fontSize: 14, fontWeight: 700, color: devPct !== null ? (devPct >= 0 ? "#16A34A" : "#E24B4A") : "#888" }}>
                              {devPct !== null ? `${devPct >= 0 ? "+" : ""}${fmtN(devPct, 1)}%` : "—"}
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Barra de progresso vs benchmark */}
                      {bm && m.scHaEsperado > 0 && (
                        <div style={{ padding: "0 16px 14px" }}>
                          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9, color: "#aaa", marginBottom: 3 }}>
                            <span>0</span>
                            <span>benchmark: {bm.sc_ha} {bm.unidade}</span>
                            <span>{Math.round(bm.sc_ha * 1.2)}</span>
                          </div>
                          <div style={{ height: 6, borderRadius: 3, background: "#EEF1F6", position: "relative", overflow: "hidden" }}>
                            <div style={{ width: `${pct(m.scHaEsperado, bm.sc_ha * 1.2)}%`, height: "100%", background: "#378ADD", borderRadius: 3 }} />
                            <div style={{ position: "absolute", top: 0, left: `${pct(bm.sc_ha, bm.sc_ha * 1.2)}%`, width: 2, height: "100%", background: "#C9921B" }} />
                          </div>
                          {colhido && m.scHaReal > 0 && realPct !== null && (
                            <div style={{ marginTop: 6, fontSize: 10, color: "#555" }}>
                              Realizado: {fmtN(m.scHaReal, 1)} sc/ha — {fmtN(realPct, 0)}% da meta esperada
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {/* Resumo geral de produção */}
            {(prodTotalEsperada > 0 || sacasTotaisReais > 0) && (
              <div style={{ background: "#fff", borderRadius: 12, border: "0.5px solid #DDE2EE", padding: "16px 20px" }}>
                <div style={{ fontWeight: 700, fontSize: 12, color: "#1a1a1a", marginBottom: 12 }}>Consolidado de Produção</div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 14 }}>
                  {[
                    { label: "Área Total",         v: `${fmtN(areaFiltrada, 0)} ha`,         color: "#0C447C" },
                    { label: "Produção Projetada",  v: `${fmtN(prodTotalEsperada, 0)} sc`,     color: "#1a1a1a" },
                    { label: "Produção Realizada",  v: sacasTotaisReais > 0 ? `${fmtN(sacasTotaisReais, 0)} sc` : "Aguardando colheita", color: sacasTotaisReais > 0 ? "#16A34A" : "#888" },
                    { label: "% Realizado",         v: prodTotalEsperada > 0 && sacasTotaisReais > 0 ? `${fmtN((sacasTotaisReais / prodTotalEsperada) * 100, 1)}%` : "—", color: "#1A4870" },
                  ].map(k => (
                    <div key={k.label}>
                      <div style={{ fontSize: 10, color: "#888", marginBottom: 3 }}>{k.label}</div>
                      <div style={{ fontSize: 16, fontWeight: 700, color: k.color }}>{k.v}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ═══════════ CUSTOS & INSUMOS ═══════════ */}
        {!loading && aba === "custos" && (
          <div>
            {/* KPIs de custo */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 12, marginBottom: 18 }}>
              {[
                { label: "Custo Total (CP em aberto)", v: fmtR(totalCustos),         color: "#E24B4A", bg: "#FCEBEB" },
                { label: "Custo por Hectare",          v: custoHaEstimado > 0 ? fmtR(custoHaEstimado) + "/ha" : "—", color: "#1A4870", bg: "#EBF3FC" },
                { label: "Benchmark MT (soja)",        v: "R$ 5.800/ha",             color: "#555",    bg: "#F4F6FA" },
                { label: "Desvio vs Benchmark",        v: custoHaEstimado > 0 ? (custoHaEstimado > 5800 ? "+" : "") + fmtR(custoHaEstimado - 5800) : "—",
                  color: custoHaEstimado > 6200 ? "#791F1F" : custoHaEstimado > 5800 ? "#7A5A12" : "#14532D",
                  bg:    custoHaEstimado > 6200 ? "#FCEBEB" : custoHaEstimado > 5800 ? "#FBF3E0"  : "#ECFDF5" },
              ].map(k => (
                <div key={k.label} style={{ background: k.bg, borderRadius: 10, padding: "14px 16px", border: "0.5px solid #DDE2EE" }}>
                  <div style={{ fontSize: 10, color: "#666", marginBottom: 4 }}>{k.label}</div>
                  <div style={{ fontSize: 17, fontWeight: 700, color: k.color }}>{k.v}</div>
                </div>
              ))}
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
              {/* Breakdown por grupo */}
              <div style={{ background: "#fff", borderRadius: 12, border: "0.5px solid #DDE2EE", padding: "16px 20px" }}>
                <div style={{ fontWeight: 700, fontSize: 12, color: "#1a1a1a", marginBottom: 14 }}>Composição dos Custos</div>
                {totalCustos === 0 ? (
                  <div style={{ color: "#aaa", fontSize: 12, textAlign: "center", padding: 16 }}>Nenhum CP no período filtrado</div>
                ) : (
                  GRUPOS_CUSTO.filter(g => custosPorGrupo[g] > 0).sort((a, b) => custosPorGrupo[b] - custosPorGrupo[a]).map(g => (
                    <BarraHorizontal
                      key={g} label={g} value={custosPorGrupo[g]} max={totalCustos}
                      color={CORES_GRUPO[g]}
                      sub={`${fmtR(custosPorGrupo[g])} (${fmtN(pct(custosPorGrupo[g], totalCustos), 0)}%)`}
                    />
                  ))
                )}
              </div>

              {/* Custo/ha vs benchmark + top itens */}
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                {/* Custo/ha por commodity vs benchmark */}
                <div style={{ background: "#fff", borderRadius: 12, border: "0.5px solid #DDE2EE", padding: "16px 20px" }}>
                  <div style={{ fontWeight: 700, fontSize: 12, color: "#1a1a1a", marginBottom: 12 }}>Custo/ha vs Benchmarks MT</div>
                  {(["Soja", "Milho"] as const).map(comm => {
                    const bm = BENCHMARK[comm];
                    const cultArea = plantiosFiltrados.filter(p => {
                      const c = ciclos.find(x => x.id === p.ciclo_id);
                      return c && culturaToCommodity(c.cultura) === comm;
                    }).reduce((s, p) => s + (p.area_ha || 0), 0);
                    if (cultArea === 0) return null;
                    const cultProp = areaFiltrada > 0 ? cultArea / areaFiltrada : 0;
                    const cultCusto = totalCustos * cultProp;
                    const cultCustoHa = cultArea > 0 ? cultCusto / cultArea : 0;
                    const maxBar = bm.custo_ha * 1.4;
                    return (
                      <div key={comm} style={{ marginBottom: 14 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                          <span style={{ fontSize: 12, fontWeight: 600, color: "#333" }}>{comm}</span>
                          <span style={{ fontSize: 12, color: "#555" }}>Benchmark: {fmtR(bm.custo_ha)}/ha</span>
                        </div>
                        <div style={{ height: 10, borderRadius: 5, background: "#EEF1F6", position: "relative", overflow: "hidden" }}>
                          <div style={{ width: `${pct(cultCustoHa, maxBar)}%`, height: "100%", background: cultCustoHa > bm.custo_ha * 1.1 ? "#E24B4A" : cultCustoHa > bm.custo_ha ? "#EF9F27" : "#16A34A", borderRadius: 5 }} />
                          <div style={{ position: "absolute", top: 0, left: `${pct(bm.custo_ha, maxBar)}%`, width: 2, height: "100%", background: "#1A4870" }} />
                        </div>
                        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 3 }}>
                          <span style={{ fontSize: 10, color: "#888" }}>Estimado: {cultCustoHa > 0 ? fmtR(cultCustoHa) + "/ha" : "—"} ({fmtN(cultArea, 0)} ha)</span>
                          <span style={{ fontSize: 10, color: cultCustoHa > bm.custo_ha ? "#E24B4A" : "#16A34A" }}>
                            {cultCustoHa > 0 ? (cultCustoHa > bm.custo_ha ? "+" : "") + fmtR(cultCustoHa - bm.custo_ha) : ""}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Top 10 maiores CPs */}
                <div style={{ background: "#fff", borderRadius: 12, border: "0.5px solid #DDE2EE", overflow: "hidden", flex: 1 }}>
                  <div style={{ padding: "12px 16px", borderBottom: "0.5px solid #DDE2EE", fontWeight: 700, fontSize: 12, color: "#1a1a1a" }}>Top 10 Maiores Despesas</div>
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <tbody>
                      {cpFiltrados.sort((a, b) => b.valor - a.valor).slice(0, 10).map((l, i) => (
                        <tr key={l.id} style={{ borderBottom: i < 9 ? "0.5px solid #EEF1F6" : "none" }}>
                          <td style={{ padding: "7px 14px", fontSize: 11, color: "#1a1a1a", maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{l.descricao}</td>
                          <td style={{ padding: "7px 14px", fontSize: 10, color: "#888" }}>
                            <span style={{ background: `${CORES_GRUPO[grupoCategoria(l.categoria)]}15`, color: CORES_GRUPO[grupoCategoria(l.categoria)], borderRadius: 4, padding: "1px 6px" }}>
                              {grupoCategoria(l.categoria)}
                            </span>
                          </td>
                          <td style={{ padding: "7px 14px", textAlign: "right", fontSize: 12, fontWeight: 700, color: "#E24B4A" }}>{fmtR(l.valor)}</td>
                        </tr>
                      ))}
                      {cpFiltrados.length === 0 && (
                        <tr><td colSpan={3} style={{ padding: "16px 14px", textAlign: "center", color: "#aaa", fontSize: 12 }}>Nenhum CP no período</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ═══════════ COMERCIALIZAÇÃO ═══════════ */}
        {!loading && aba === "comercializacao" && (
          <div>
            {/* Seletor commodity */}
            <div style={{ display: "flex", gap: 8, marginBottom: 18, alignItems: "center" }}>
              {(["Soja", "Milho", "Algodão"] as const).map(c => (
                <button key={c} onClick={() => setCommodity(c)} style={{
                  padding: "8px 20px", borderRadius: 8, border: "0.5px solid #D4DCE8",
                  cursor: "pointer", fontSize: 13, fontWeight: commodity === c ? 700 : 400,
                  background: commodity === c ? "#1A4870" : "#fff",
                  color: commodity === c ? "#fff" : "#1a1a1a",
                }}>{c}</button>
              ))}
              {(() => {
                const pRef = calcPosicao(commodity).precoBrl;
                const unidade = commodity === "Algodão" ? "@" : "sc";
                return pRef > 0 ? (
                  <span style={{ marginLeft: "auto", fontSize: 12, color: "#555" }}>
                    Preço ref.:&nbsp;
                    <strong style={{ color: "#1A4870" }}>R$ {fmtN(pRef, 2)}/{unidade}</strong>
                  </span>
                ) : null;
              })()}
            </div>

            {(() => {
              const p = calcPosicao(commodity);
              const risco: "verde" | "amarelo" | "vermelho" = p.comprPct > 90 ? "vermelho" : p.comprPct > 65 ? "amarelo" : "verde";
              const livre = Math.max(0, p.producao - p.arrSacas - p.barterSacas - p.fixadoSacas - p.dividaSacas);
              const contratosComm = contratosAtivos.filter(c => c.produto === commodity);
              const precosFixados = contratosComm.filter(c => c.preco).map(c => c.preco!);
              const precoMedio = precosFixados.length > 0 ? precosFixados.reduce((s, v) => s + v, 0) / precosFixados.length : 0;
              const precoBrl  = p.precoBrl;
              const receitaEsperada = p.producao * precoBrl;
              return (
                <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                  {/* KPIs comerciais */}
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: 12 }}>
                    {[
                      { label: "Produção Projetada",    v: `${fmtN(p.producao, 0)} sc`,                            color: "#0C447C", bg: "#EBF3FC" },
                      { label: "Volume Comprometido",   v: `${fmtN(p.arrSacas + p.barterSacas + p.fixadoSacas, 0)} sc (${fmtN(p.comprPct, 0)}%)`, color: risco === "verde" ? "#14532D" : risco === "amarelo" ? "#7A5A12" : "#791F1F", bg: risco === "verde" ? "#ECFDF5" : risco === "amarelo" ? "#FBF3E0" : "#FCEBEB" },
                      { label: "Volume Livre",          v: `${fmtN(livre, 0)} sc`,                                 color: "#14532D", bg: "#ECFDF5" },
                      { label: "Preço Médio Fixado",    v: precoMedio > 0 ? fmtR(precoMedio) + "/sc" : "A fixar",  color: "#1A4870", bg: "#F4F6FA" },
                      { label: "Receita Esperada Total",v: receitaEsperada > 0 ? fmtR(receitaEsperada) : "—",      color: "#14532D", bg: "#ECFDF5" },
                    ].map(k => (
                      <div key={k.label} style={{ background: k.bg, borderRadius: 10, padding: "14px 16px", border: "0.5px solid #DDE2EE" }}>
                        <div style={{ fontSize: 10, color: "#666", marginBottom: 4 }}>{k.label}</div>
                        <div style={{ fontSize: 15, fontWeight: 700, color: k.color }}>{k.v}</div>
                      </div>
                    ))}
                  </div>

                  {/* Posição visual */}
                  <div style={{ background: "#fff", borderRadius: 12, border: "0.5px solid #DDE2EE", padding: "18px 22px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
                      <span style={{ fontSize: 14, fontWeight: 700, color: "#1a1a1a" }}>{commodity} — {fazenda?.nome}</span>
                      <Semaforo saude={risco} />
                      <span style={{ fontSize: 12, color: "#666" }}>{fmtN(p.comprPct, 0)}% comprometido</span>
                    </div>
                    <BarraGraos {...p} />

                    {/* Legenda */}
                    <div style={{ display: "flex", gap: 14, marginTop: 14, padding: "10px 14px", background: "#F8FAFD", borderRadius: 8 }}>
                      {[
                        { label: "Arrendamento (físico)", bg: "#E24B4A" },
                        { label: "Barter (físico)",       bg: "#EF9F27" },
                        { label: "Fixado (contratos)",    bg: "#378ADD" },
                        { label: "Dívida convertida",     bg: "#9B59B6" },
                        { label: "Livre",                 bg: "#16A34A" },
                      ].map(x => (
                        <span key={x.label} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, color: "#555" }}>
                          <span style={{ width: 9, height: 9, borderRadius: 2, background: x.bg, display: "inline-block" }} />
                          {x.label}
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* Análise preço fixado vs mercado */}
                  {precoMedio > 0 && precoBrl > 0 && (
                    <div style={{ background: "#fff", borderRadius: 10, border: "0.5px solid #DDE2EE", padding: "14px 20px" }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: "#1a1a1a", marginBottom: 10 }}>Preço Médio Fixado vs Mercado</div>
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 14 }}>
                        <div>
                          <div style={{ fontSize: 10, color: "#888", marginBottom: 2 }}>Preço médio fixado</div>
                          <div style={{ fontSize: 16, fontWeight: 700, color: "#1A4870" }}>{fmtR2(precoMedio)}/sc</div>
                        </div>
                        <div>
                          <div style={{ fontSize: 10, color: "#888", marginBottom: 2 }}>Preço atual mercado</div>
                          <div style={{ fontSize: 16, fontWeight: 700, color: "#1a1a1a" }}>{fmtR2(precoBrl)}/sc</div>
                        </div>
                        <div>
                          <div style={{ fontSize: 10, color: "#888", marginBottom: 2 }}>Diferença</div>
                          <div style={{ fontSize: 16, fontWeight: 700, color: precoMedio >= precoBrl ? "#16A34A" : "#E24B4A" }}>
                            {precoMedio >= precoBrl ? "+" : ""}{fmtR2(precoMedio - precoBrl)}/sc
                          </div>
                        </div>
                        <div>
                          <div style={{ fontSize: 10, color: "#888", marginBottom: 2 }}>Receita adicional/perda</div>
                          <div style={{ fontSize: 16, fontWeight: 700, color: precoMedio >= precoBrl ? "#16A34A" : "#E24B4A" }}>
                            {precoMedio >= precoBrl ? "+" : ""}{fmtR((precoMedio - precoBrl) * p.fixadoSacas)}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Contratos ativos */}
                  {contratosComm.length > 0 && (
                    <div style={{ background: "#fff", borderRadius: 12, border: "0.5px solid #DDE2EE", overflow: "hidden" }}>
                      <div style={{ padding: "12px 18px", borderBottom: "0.5px solid #DDE2EE", fontWeight: 700, fontSize: 12, color: "#1a1a1a" }}>
                        Contratos de Venda — {commodity}
                      </div>
                      <table style={{ width: "100%", borderCollapse: "collapse" }}>
                        <thead>
                          <tr style={{ background: "#F8FAFD" }}>
                            {["Nº", "Comprador", "Qtd (sc)", "Entregue", "% Entregue", "Preço/sc", "Receita"].map((h, i) => (
                              <th key={h} style={{ padding: "7px 14px", textAlign: i >= 2 ? "right" : "left", fontSize: 10, fontWeight: 600, color: "#555", borderBottom: "0.5px solid #DDE2EE" }}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {contratosComm.map((c, i) => {
                            const entPct = c.quantidade_sc > 0 ? (c.entregue_sc / c.quantidade_sc) * 100 : 0;
                            return (
                              <tr key={c.id} style={{ borderBottom: i < contratosComm.length - 1 ? "0.5px solid #EEF1F6" : "none" }}>
                                <td style={{ padding: "8px 14px", fontSize: 11, color: "#555" }}>
                                  <div style={{ display:"flex", flexDirection:"column", gap:2 }}>
                                    {c.numero ?? "—"}
                                    {(c as {dado_em_cessao?:boolean}).dado_em_cessao && (
                                      <span style={{ fontSize:9, background:"#EDE9FE", color:"#5B21B6", padding:"1px 5px", borderRadius:3, fontWeight:700, width:"fit-content" }}>CESSÃO</span>
                                    )}
                                  </div>
                                </td>
                                <td style={{ padding: "8px 14px", fontSize: 12, color: "#1a1a1a" }}>
                                  <div>{c.comprador ?? "—"}</div>
                                  {(c as {dado_em_cessao?:boolean}).dado_em_cessao && (c as {cessao_fornecedor_nome?:string}).cessao_fornecedor_nome && (
                                    <div style={{ fontSize:10, color:"#5B21B6" }}>→ cessão: {(c as {cessao_fornecedor_nome?:string}).cessao_fornecedor_nome}</div>
                                  )}
                                </td>
                                <td style={{ padding: "8px 14px", textAlign: "right", fontSize: 12, fontWeight: 600 }}>{fmtN(c.quantidade_sc, 0)}</td>
                                <td style={{ padding: "8px 14px", textAlign: "right", fontSize: 12, color: "#378ADD" }}>{fmtN(c.entregue_sc, 0)}</td>
                                <td style={{ padding: "8px 14px", textAlign: "right", fontSize: 11 }}>
                                  <div style={{ display: "flex", alignItems: "center", gap: 5, justifyContent: "flex-end" }}>
                                    <div style={{ width: 40, height: 4, borderRadius: 2, background: "#EEF1F6", overflow: "hidden" }}>
                                      <div style={{ width: `${entPct}%`, height: "100%", background: entPct >= 100 ? "#16A34A" : "#378ADD" }} />
                                    </div>
                                    <span>{fmtN(entPct, 0)}%</span>
                                  </div>
                                </td>
                                <td style={{ padding: "8px 14px", textAlign: "right", fontSize: 12 }}>{c.preco ? fmtR2(c.preco) : <span style={{ color: "#EF9F27" }}>A fixar</span>}</td>
                                <td style={{ padding: "8px 14px", textAlign: "right", fontSize: 12, fontWeight: 600, color: "#14532D" }}>
                                  {c.preco ? fmtR(c.quantidade_sc * c.preco) : "—"}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {/* Dívida convertida */}
                  {p.dividaSacas > 0 && (
                    <div style={{ background: "#fff", borderRadius: 10, border: "0.5px solid #D8C4F0", padding: "14px 20px" }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: "#5B2D8E", marginBottom: 8 }}>Dívida Financeira Convertida em {commodity}</div>
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 14 }}>
                        <div>
                          <div style={{ fontSize: 10, color: "#888", marginBottom: 2 }}>Total CP em aberto (BRL)</div>
                          <div style={{ fontSize: 15, fontWeight: 700, color: "#E24B4A" }}>{fmtR(totalCP)}</div>
                        </div>
                        <div>
                          <div style={{ fontSize: 10, color: "#888", marginBottom: 2 }}>÷ Preço {commodity}</div>
                          <div style={{ fontSize: 15, fontWeight: 700, color: "#1A4870" }}>R$ {fmtN(precoBrl, 2)}/sc</div>
                        </div>
                        <div>
                          <div style={{ fontSize: 10, color: "#888", marginBottom: 2 }}>= Sacas para quitar tudo</div>
                          <div style={{ fontSize: 15, fontWeight: 700, color: "#9B59B6" }}>{fmtN(p.dividaSacas, 0)} sc</div>
                          <div style={{ fontSize: 10, color: "#888", marginTop: 1 }}>{p.producao > 0 ? fmtN((p.dividaSacas / p.producao) * 100, 0) : "—"}% da produção projetada</div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })()}
          </div>
        )}

        {/* ═══════════ FINANCEIRO ═══════════ */}
        {!loading && aba === "financeiro" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {/* KPIs */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: 12 }}>
              {[
                { label: "CP Vencidas",       v: cpVencidas, color: cpVencidas > 0 ? "#791F1F" : "#888",   bg: cpVencidas > 0 ? "#FCEBEB" : "#F4F6FA" },
                { label: "CP a Vencer 30d",   v: cpA30,      color: cpA30 > 0      ? "#7A5A12" : "#888",   bg: cpA30 > 0      ? "#FBF3E0" : "#F4F6FA" },
                { label: "CR a Receber 30d",  v: crA30,      color: crA30 > 0      ? "#14532D" : "#888",   bg: crA30 > 0      ? "#ECFDF5" : "#F4F6FA" },
                { label: "Total CP em Aberto",v: totalCP,    color: "#1a1a1a",                              bg: "#F8FAFD"                               },
                { label: "Saldo Líquido",     v: saldoLiq,   color: saldoLiq >= 0  ? "#14532D" : "#791F1F", bg: saldoLiq >= 0  ? "#ECFDF5" : "#FCEBEB" },
              ].map(c => (
                <div key={c.label} style={{ background: c.bg, borderRadius: 10, padding: "14px 16px", border: "0.5px solid #DDE2EE" }}>
                  <div style={{ fontSize: 10, color: "#666", marginBottom: 4 }}>{c.label}</div>
                  <div style={{ fontSize: 17, fontWeight: 700, color: c.color }}>{fmtR(c.v)}</div>
                </div>
              ))}
            </div>

            {/* Liquidez 90 dias */}
            <div style={{ background: "#fff", borderRadius: 12, border: "0.5px solid #DDE2EE", padding: "16px 20px" }}>
              <div style={{ fontWeight: 700, fontSize: 12, color: "#1a1a1a", marginBottom: 14 }}>Fluxo de Liquidez — Próximos 90 dias</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 12 }}>
                {liquidez90.map(l => {
                  const saldo = l.cr - l.cp;
                  return (
                    <div key={l.label} style={{ border: "0.5px solid #EEF1F6", borderRadius: 10, padding: "12px 14px" }}>
                      <div style={{ fontSize: 11, fontWeight: 600, color: "#555", marginBottom: 8 }}>{l.label}</div>
                      <div style={{ marginBottom: 4 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "#888", marginBottom: 2 }}>
                          <span>CP</span><span style={{ color: "#E24B4A", fontWeight: 600 }}>{fmtR(l.cp)}</span>
                        </div>
                        <div style={{ height: 5, borderRadius: 3, background: "#EEF1F6", overflow: "hidden" }}>
                          <div style={{ width: `${pct(l.cp, maxLiq)}%`, height: "100%", background: "#E24B4A" }} />
                        </div>
                      </div>
                      <div style={{ marginBottom: 8 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "#888", marginBottom: 2 }}>
                          <span>CR</span><span style={{ color: "#16A34A", fontWeight: 600 }}>{fmtR(l.cr)}</span>
                        </div>
                        <div style={{ height: 5, borderRadius: 3, background: "#EEF1F6", overflow: "hidden" }}>
                          <div style={{ width: `${pct(l.cr, maxLiq)}%`, height: "100%", background: "#16A34A" }} />
                        </div>
                      </div>
                      <div style={{ borderTop: "0.5px solid #EEF1F6", paddingTop: 6, fontSize: 12, fontWeight: 700, color: saldo >= 0 ? "#16A34A" : "#E24B4A" }}>
                        {saldo >= 0 ? "+" : ""}{fmtR(saldo)}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Cobertura CP vs CR */}
            {(totalCP > 0 || totalCR > 0) && (
              <div style={{ background: "#fff", borderRadius: 10, border: "0.5px solid #DDE2EE", padding: "14px 20px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "#555", marginBottom: 6 }}>
                  <span>CP Total em aberto: <strong style={{ color: "#E24B4A" }}>{fmtR(totalCP)}</strong></span>
                  <span>Índice de cobertura: <strong style={{ color: totalCR >= totalCP ? "#16A34A" : "#E24B4A" }}>
                    {totalCP > 0 ? fmtN(totalCR / totalCP * 100, 0) + "%" : "—"}
                  </strong> (CR ÷ CP)</span>
                  <span>CR Total a receber: <strong style={{ color: "#16A34A" }}>{fmtR(totalCR)}</strong></span>
                </div>
                <div style={{ display: "flex", height: 10, borderRadius: 5, overflow: "hidden", gap: 2 }}>
                  <div style={{ flex: totalCP || 1, background: "#E24B4A", borderRadius: 3 }} />
                  <div style={{ flex: totalCR || 1, background: "#16A34A", borderRadius: 3 }} />
                </div>
              </div>
            )}

            {/* Tabela lançamentos em aberto */}
            <div style={{ background: "#fff", borderRadius: 12, border: "0.5px solid #DDE2EE", overflow: "hidden" }}>
              <div style={{ padding: "12px 18px", borderBottom: "0.5px solid #DDE2EE", fontWeight: 700, fontSize: 12, color: "#1a1a1a" }}>Lançamentos em Aberto</div>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ background: "#F8FAFD" }}>
                    {["Tipo", "Descrição", "Categoria", "Vencimento", "Valor"].map((h, i) => (
                      <th key={h} style={{ padding: "7px 14px", textAlign: i >= 4 ? "right" : "left", fontSize: 10, fontWeight: 600, color: "#555", borderBottom: "0.5px solid #DDE2EE" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {lancamentos.filter(l => l.status !== "baixado").sort((a, b) => a.data_vencimento.localeCompare(b.data_vencimento)).slice(0, 30).map((l, i, arr) => {
                    const venc = l.data_vencimento < hj;
                    return (
                      <tr key={l.id} style={{ borderBottom: i < arr.length - 1 ? "0.5px solid #EEF1F6" : "none", background: venc && l.tipo === "pagar" ? "#FFF8F8" : "transparent" }}>
                        <td style={{ padding: "8px 14px" }}>
                          <span style={{ background: l.tipo === "pagar" ? "#FCEBEB" : "#ECFDF5", color: l.tipo === "pagar" ? "#791F1F" : "#14532D", borderRadius: 4, padding: "2px 7px", fontSize: 10, fontWeight: 600 }}>
                            {l.tipo === "pagar" ? "CP" : "CR"}
                          </span>
                        </td>
                        <td style={{ padding: "8px 14px", fontSize: 11, color: "#1a1a1a", maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{l.descricao}</td>
                        <td style={{ padding: "8px 14px", fontSize: 10, color: "#888" }}>{l.categoria ?? "—"}</td>
                        <td style={{ padding: "8px 14px", fontSize: 11, color: venc && l.tipo === "pagar" ? "#E24B4A" : "#555", fontWeight: venc ? 600 : 400 }}>
                          {fmtDt(l.data_vencimento)}{venc && l.tipo === "pagar" ? " ⚠" : ""}
                        </td>
                        <td style={{ padding: "8px 14px", textAlign: "right", fontSize: 12, fontWeight: 600, color: l.tipo === "pagar" ? "#E24B4A" : "#16A34A" }}>{fmtR(l.valor)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ═══════════ SENSIBILIDADE ═══════════ */}
        {!loading && aba === "sensibilidade" && (
          <div style={{ background: "#fff", borderRadius: 12, border: "0.5px solid #DDE2EE", overflow: "hidden" }}>
            <div style={{ padding: "14px 20px", borderBottom: "0.5px solid #DEE5EE", background: "#F8FAFD" }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#1a1a1a", marginBottom: 12 }}>
                Parâmetros do cenário
                <span style={{ marginLeft: 8, fontSize: 10, background: "#C9921B20", color: "#7A5A12", padding: "2px 8px", borderRadius: 8, fontWeight: 600 }}>EXCLUSIVO RACCOLTO</span>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 14 }}>
                {[
                  { label: "Preço da soja (R$/sc)", val: precoMask, set: setPrecoMask },
                  { label: "Produtividade (sc/ha)",  val: prodMask,  set: setProdMask  },
                  { label: "Custo total (R$/ha)",    val: custoMask, set: setCustoMask },
                ].map(f => (
                  <div key={f.label}>
                    <label style={labelSt}>{f.label}</label>
                    <input style={inputSt} type="text" inputMode="numeric" value={f.val}
                      onChange={e => f.set(aplicarMascara(e.target.value))} />
                  </div>
                ))}
                <div>
                  <label style={labelSt}>Área (ha)</label>
                  <input style={inputSt} type="text" inputMode="numeric" value={areaStr}
                    onChange={e => setAreaStr(e.target.value.replace(/\D/g, ""))} />
                </div>
              </div>
            </div>

            {/* KPIs resultado */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(5,1fr)", borderBottom: "0.5px solid #DEE5EE" }}>
              {[
                { label: "Receita/ha",      valor: fmtR2(recHa),                         cor: "#1A4870"                               },
                { label: "Custo/ha",        valor: fmtR2(custoHa),                        cor: "#E24B4A"                               },
                { label: "Margem/ha",       valor: fmtR2(marHa),                          cor: marHa  >= 0 ? "#1A4870" : "#E24B4A"     },
                { label: "Margem %",        valor: `${fmtN(marPct, 1)}%`,                 cor: marPct >= 0 ? "#1A4870" : "#E24B4A"     },
                { label: "Resultado total", valor: fmtR(resTot),                          cor: resTot >= 0 ? "#1A4870" : "#E24B4A"     },
              ].map((s, i) => (
                <div key={i} style={{ padding: "14px 16px", borderRight: i < 4 ? "0.5px solid #DEE5EE" : "none" }}>
                  <div style={{ fontSize: 11, color: "#555", marginBottom: 4 }}>{s.label}</div>
                  <div style={{ fontSize: 17, fontWeight: 700, color: s.cor }}>{s.valor}</div>
                </div>
              ))}
            </div>

            {/* Break-even */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", borderBottom: "0.5px solid #DEE5EE" }}>
              <div style={{ padding: "12px 20px", borderRight: "0.5px solid #DEE5EE" }}>
                <div style={{ fontSize: 11, color: "#555", marginBottom: 2 }}>Preço de equilíbrio</div>
                <div style={{ fontSize: 15, fontWeight: 700, color: precoSc >= pBreak ? "#1A4870" : "#E24B4A" }}>{fmtR2(pBreak)}/sc</div>
                <div style={{ fontSize: 10, color: "#555", marginTop: 2 }}>
                  Preço atual {fmtR2(precoSc)} — {precoSc >= pBreak ? `${fmtN((precoSc / pBreak - 1) * 100, 1)}% acima` : "abaixo do break-even"}
                </div>
              </div>
              <div style={{ padding: "12px 20px" }}>
                <div style={{ fontSize: 11, color: "#555", marginBottom: 2 }}>Produtividade mínima</div>
                <div style={{ fontSize: 15, fontWeight: 700, color: prodHa >= qBreak ? "#1A4870" : "#E24B4A" }}>{fmtN(qBreak, 1)} sc/ha</div>
                <div style={{ fontSize: 10, color: "#555", marginTop: 2 }}>
                  Atual {fmtN(prodHa, 1)} sc/ha — {prodHa >= qBreak ? `${fmtN((prodHa / qBreak - 1) * 100, 1)}% acima` : "abaixo do mínimo"}
                </div>
              </div>
            </div>

            {/* Matriz */}
            <div style={{ padding: "16px 20px" }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: "#1a1a1a", marginBottom: 4 }}>Matriz de sensibilidade — Resultado/ha (R$)</div>
              <div style={{ fontSize: 11, color: "#555", marginBottom: 12 }}>Eixo X: produtividade · Eixo Y: preço soja · Verde = lucro · Vermelho = prejuízo</div>
              <div style={{ overflowX: "auto" }}>
                <table style={{ borderCollapse: "collapse", fontSize: 11 }}>
                  <thead>
                    <tr>
                      <th style={{ padding: "6px 12px", background: "#F3F6F9", border: "0.5px solid #D4DCE8", color: "#555", fontWeight: 600, whiteSpace: "nowrap" }}>Preço \ Prod.</th>
                      {sensProds.map((p, i) => (
                        <th key={i} style={{ padding: "6px 14px", background: i === 2 ? "#E6F1FB" : "#F3F6F9", border: "0.5px solid #D4DCE8", color: i === 2 ? "#0C447C" : "#555", fontWeight: i === 2 ? 700 : 600, whiteSpace: "nowrap", textAlign: "center" }}>
                          {fmtN(p, 1)} sc/ha{i === 2 && <div style={{ fontSize: 9, fontWeight: 400 }}>base</div>}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {[...sensPrecos].reverse().map((pr, ri) => (
                      <tr key={ri}>
                        <td style={{ padding: "8px 12px", background: sensPrecos[sensPrecos.length-1-ri] === precoSc ? "#E6F1FB" : "#F3F6F9", border: "0.5px solid #D4DCE8", fontWeight: sensPrecos[sensPrecos.length-1-ri] === precoSc ? 700 : 600, color: sensPrecos[sensPrecos.length-1-ri] === precoSc ? "#0C447C" : "#333", whiteSpace: "nowrap" }}>
                          {fmtR2(pr)}/sc{sensPrecos[sensPrecos.length-1-ri] === precoSc && <span style={{ display: "block", fontSize: 9, fontWeight: 400 }}>base</span>}
                        </td>
                        {sensProds.map((pd, ci) => {
                          const res     = (pr * pd) - custoHa;
                          const isBase  = ci === 2 && sensPrecos[sensPrecos.length-1-ri] === precoSc;
                          const intens  = Math.min(Math.abs(res) / (custoHa * 0.5 || 1), 1);
                          return (
                            <td key={ci} style={{
                              padding: "8px 14px", border: `0.5px solid ${isBase ? "#1A4870" : "#D4DCE8"}`,
                              textAlign: "center", fontWeight: isBase ? 700 : 600,
                              background: isBase ? (res >= 0 ? "#D5E8F5" : "#FCEBEB")
                                : res >= 0 ? `rgba(29,158,117,${0.08 + intens * 0.25})` : `rgba(226,75,74,${0.08 + intens * 0.25})`,
                              color: res >= 0 ? "#0B2D50" : "#791F1F", whiteSpace: "nowrap",
                            }}>
                              {res >= 0 ? "" : "("}{fmtR(Math.abs(res))}{res >= 0 ? "" : ")"}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div style={{ marginTop: 10, fontSize: 10, color: "#555" }}>Variações de ±8% e ±16% em relação ao cenário base. Célula destacada = cenário atual.</div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
