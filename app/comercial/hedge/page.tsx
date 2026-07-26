"use client";
import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/components/AuthProvider";
import { useRouter } from "next/navigation";
import { createBrowserClient } from "@supabase/ssr";

// ─── Tipos ───────────────────────────────────────────────────────────────────
interface Ciclo { id: string; descricao: string; cultura: string; area_ha: number; produtividade_esperada_sc_ha?: number; ano_safra?: { descricao: string }; }
interface CurvaMercado { id: string; instrumento: string; vencimento: string | null; data_referencia: string; valor: number; unidade: string; fonte: string; }
interface FixacaoHedge { id: string; contrato_id: string | null; ciclo_id: string | null; componente: "BOARD"|"PREMIO"|"CAMBIO"|"FRETE"; quantidade_sc: number; valor: number; unidade: string; vencimento_ref: string | null; data_fixacao: string; instrumento_hedge: string | null; }
interface EstruturaDespesa { id: string; tipo: string; descricao: string; cultura: string | null; valor_brl_sc: number; destino: string | null; }
interface MetaCiclo { milestone: string; meta_pct: number; data_referencia: string | null; }

// ─── Constantes ──────────────────────────────────────────────────────────────
const FATOR_SOJA  = 2.2046;  // sc 60kg / bushel 27,2155kg
const FATOR_MILHO = 2.3621;  // sc 60kg / bushel 25,4012kg
const FUNRURAL_PF = 0.015;
const SENAR       = 0.002;

// Converte código CME "X26" → "2026-11-01" (formato date do banco)
const LETRA_MES: Record<string, number> = {
  F:1, G:2, H:3, J:4, K:5, M:6, N:7, Q:8, U:9, V:10, X:11, Z:12,
};
function blocoToDate(bloco: string): string {
  if (!bloco || bloco.length < 3) return "";
  const mes = LETRA_MES[bloco[0]];
  const yy  = bloco.slice(1);
  if (!mes || !yy) return "";
  return `20${yy}-${String(mes).padStart(2,"0")}-01`;
}

const MILESTONES = [
  { key: "pre_plantio",  label: "Pré-plantio",   pct_default: 20 },
  { key: "plantio",      label: "Plantio",        pct_default: 35 },
  { key: "floracao",     label: "Floração",       pct_default: 50 },
  { key: "colheita",     label: "Colheita",       pct_default: 70 },
  { key: "pos_colheita", label: "Pós-colheita",   pct_default: 100 },
];

const INSTRUMENTOS_HEDGE = [
  { value: "fisico",     label: "Venda Física" },
  { value: "ndf",        label: "NDF (câmbio futuro)" },
  { value: "call",       label: "Call (opção de compra)" },
  { value: "put",        label: "Put (opção de venda)" },
  { value: "futuro_dol", label: "Futuro DOL/WDO (B3)" },
  { value: "swap",       label: "Swap" },
];

const TIPOS_DESPESA = ["frete","taxa_porto","classificacao","quebra","comissao","seguro"];
const PORTOS = ["Paranaguá (PNG)","Santos (STS)","Miritituba","São Francisco do Sul","Itacoatiara","Barcarena"];

// ─── Estilos base ─────────────────────────────────────────────────────────────
const inp: React.CSSProperties = { width: "100%", padding: "8px 10px", border: "0.5px solid var(--border-table,#DDE2EE)", borderRadius: 7, fontSize: 13, background: "var(--bg-card,#fff)", color: "var(--text-1,#1a1a1a)", boxSizing: "border-box" };
const lbl: React.CSSProperties = { fontSize: 11, color: "var(--text-2,#555)", fontWeight: 600, display: "block", marginBottom: 4 };
const btnV: React.CSSProperties = { padding: "8px 16px", background: "#1A4870", color: "#fff", border: "none", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer" };
const btnR: React.CSSProperties = { padding: "8px 16px", background: "transparent", color: "var(--text-2,#555)", border: "0.5px solid var(--border-table,#DDE2EE)", borderRadius: 8, fontSize: 13, cursor: "pointer" };
const btnM: React.CSSProperties = { padding: "6px 14px", background: "#C9921B", color: "#fff", border: "none", borderRadius: 7, fontSize: 12, fontWeight: 600, cursor: "pointer" };
const card: React.CSSProperties = { background: "var(--bg-card,#fff)", border: "0.5px solid var(--border-table,#DDE2EE)", borderRadius: 12, padding: "16px 20px" };

function badge(txt: string, bg: string, cl: string) {
  return <span style={{ fontSize: 10, background: bg, color: cl, padding: "2px 8px", borderRadius: 8, fontWeight: 600, whiteSpace: "nowrap" }}>{txt}</span>;
}

function Modal({ titulo, onClose, width = 640, children }: { titulo: string; onClose: () => void; width?: number; children: React.ReactNode }) {
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ background: "var(--bg-card,#fff)", borderRadius: 14, padding: 28, width, maxWidth: "95vw", maxHeight: "90vh", overflowY: "auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: "var(--text-1,#1a1a1a)" }}>{titulo}</div>
          <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer", color: "#888" }}>×</button>
        </div>
        {children}
      </div>
    </div>
  );
}

// ─── Componente principal ─────────────────────────────────────────────────────
export default function HedgePage() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { fazendaId, userRole, raccotloGestor, podeAcessar, fazTrabalho } = useAuth() as any;
  const router = useRouter();
  const fazId = fazTrabalho || fazendaId;

  // Gate: superadmin OU módulo habilitado para a conta
  const isSuperadmin = userRole === "raccotlo" || userRole === "raccotlo_gestor";
  const temAcesso    = isSuperadmin || podeAcessar("protecao_margem");

  useEffect(() => {
    if (userRole !== null && !temAcesso) router.replace("/");
  }, [userRole, temAcesso, router]);

  const sb = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  // ─── Estado ───────────────────────────────────────────────────────────────
  type Aba = "cockpit"|"precificador"|"sensibilidade"|"busca_margem"|"escala"|"curvas"|"despesas";
  const [aba, setAba]             = useState<Aba>("cockpit");
  const [ciclos, setCiclos]       = useState<Ciclo[]>([]);
  const [cicloId, setCicloId]     = useState<string>("");
  const [cicloSel, setCicloSel]   = useState<Ciclo | null>(null);
  const [curvas, setCurvas]       = useState<CurvaMercado[]>([]);
  const [fixacoes, setFixacoes]   = useState<FixacaoHedge[]>([]);
  const [despesas, setDespesas]   = useState<EstruturaDespesa[]>([]);
  const [metas, setMetas]         = useState<MetaCiclo[]>([]);
  const [moeda, setMoeda]         = useState<"BRL"|"USD">("BRL");
  const [precoAoVivo, setPrecoAoVivo] = useState<{
    cbot_soja: number; cbot_milho: number; usd_brl: number;
    premio_implicito: number | null; cepea_soja_png: number | null;
  } | null>(null);
  const [carregando, setCarregando] = useState(false);

  // Precificador manual
  const [pCbot,   setPCbot]   = useState("1420");   // ¢/bu
  const [pPremio, setPPremio] = useState("-28");     // ¢/bu
  const [pCambio, setPCambio] = useState("5.42");   // R$/USD
  const [pFrete,  setPFrete]  = useState("48");     // R$/sc
  const [pCusto,  setPCusto]  = useState("108.50"); // R$/sc
  const [pFunrural, setPFunrural] = useState("true");
  const [pCultura, setPCultura]   = useState<"soja"|"milho">("soja");

  // Precificador — bloco CME e rota
  const [blocoVenc,  setBlocoVenc]  = useState("");  // ex: "X26"
  const [rotaId,     setRotaId]     = useState("");  // id de estrutura_despesa_hedge
  const [portoDest,  setPortoDest]  = useState("");  // ex: "Paranaguá (PNG)"

  // Sensibilidade
  const [sensiEixoX, setSensiEixoX] = useState<"cbot"|"cambio"|"premio">("cbot");
  const [sensiEixoY, setSensiEixoY] = useState<"cambio"|"cbot"|"frete">("cambio");

  // Busca de margem
  const [buscaMargem, setBuscaMargem] = useState("25");     // R$/sc
  const [buscaTravar, setBuscaTravar] = useState<"cbot"|"cambio"|"ambos">("cbot");

  // Modal curva
  const [modalCurva, setModalCurva]   = useState(false);
  const [fCurva, setFCurva] = useState({ instrumento: "CBOT_SOJA", vencimento: "", data_referencia: new Date().toISOString().slice(0,10), valor: "", unidade: "cents_bu", fonte: "MANUAL", boletim: "fechamento" });

  // Modal fixação
  const [modalFix, setModalFix] = useState(false);
  const [fFix, setFFix] = useState({ componente: "BOARD" as FixacaoHedge["componente"], quantidade_sc: "", valor: "", unidade: "cents_bu", vencimento_ref: "", data_fixacao: new Date().toISOString().slice(0,10), instrumento_hedge: "fisico", observacao: "" });

  // Modal despesa
  const [modalDesp, setModalDesp] = useState(false);
  const [fDesp, setFDesp] = useState({ tipo: "frete", descricao: "", cultura: "", destino: "", valor_brl_sc: "" });

  const [salvando, setSalvando] = useState(false);
  const [erro, setErro]         = useState("");

  // ─── Carga de dados ───────────────────────────────────────────────────────
  useEffect(() => {
    fetch("/api/precos").then(r => r.json()).then(d => {
      // API retorna campos aninhados (soja.cbot, usdBrl) — normaliza aqui
      const cbot_soja  = d?.soja?.cbot  ?? d?.cbot_soja  ?? 0;
      const cbot_milho = d?.milho?.cbot ?? d?.cbot_milho ?? 500;
      const usd_brl    = d?.usdBrl      ?? d?.usd_brl    ?? 0;
      if (cbot_soja && usd_brl) setPrecoAoVivo({
        cbot_soja, cbot_milho, usd_brl,
        premio_implicito: d?.premio_implicito ?? null,
        cepea_soja_png:   d?.cepea_soja_png  ?? null,
      });
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (!fazId) return;
    sb.from("ciclos").select("id,descricao,cultura,area_ha,produtividade_esperada_sc_ha,anos_safra(descricao)").eq("fazenda_id", fazId).order("created_at", { ascending: false })
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .then(({ data }: { data: any[] | null }) => { if (data) setCiclos(data.map((c: any) => ({ ...c, ano_safra: c.anos_safra?.[0] }))); });
    sb.from("estrutura_despesa_hedge").select("*").eq("fazenda_id", fazId).eq("ativo", true).then(({ data }) => { if (data) setDespesas(data); });
  }, [fazId]);

  const carregarCiclo = useCallback(async (id: string) => {
    if (!id || !fazId) return;
    setCarregando(true);
    const [{ data: curvasData }, { data: fixData }, { data: metasData }] = await Promise.all([
      sb.from("curva_mercado").select("*").or(`fazenda_id.eq.${fazId},fazenda_id.is.null`).order("data_referencia", { ascending: false }).limit(500),
      sb.from("fixacoes_hedge").select("*").eq("fazenda_id", fazId).eq("ciclo_id", id),
      sb.from("comercializacao_metas").select("milestone,meta_pct,data_referencia").eq("ciclo_id", id),
    ]);
    if (curvasData) setCurvas(curvasData);
    if (fixData)    setFixacoes(fixData);
    if (metasData)  setMetas(metasData);
    setCarregando(false);
  }, [fazId, sb]);

  useEffect(() => {
    if (cicloId) {
      const c = ciclos.find(x => x.id === cicloId) ?? null;
      setCicloSel(c);
      if (c) {
        const isMilho = c.cultura?.toLowerCase().includes("milho");
        setPCultura(isMilho ? "milho" : "soja");
      }
      carregarCiclo(cicloId);
    }
  }, [cicloId, ciclos, carregarCiclo]);

  // Auto-fill CBOT quando bloco ou cultura mudam
  useEffect(() => {
    if (!curvas.length) return;
    const inst = `CBOT_${pCultura.toUpperCase()}`;
    // 1. Tenta mês específico (vencimento = data ISO)
    const dataVenc = blocoVenc ? blocoToDate(blocoVenc) : "";
    const especifico = dataVenc
      ? [...curvas].filter(c => c.instrumento === inst && c.vencimento === dataVenc)
          .sort((a, b) => b.data_referencia.localeCompare(a.data_referencia))[0]
      : null;
    if (especifico) { setPCbot(String(especifico.valor)); return; }
    // 2. Fallback: spot/front-month (vencimento=null, inserido pelo cron diário)
    const spot = [...curvas].filter(c => c.instrumento === inst && !c.vencimento)
      .sort((a, b) => b.data_referencia.localeCompare(a.data_referencia))[0];
    if (spot) setPCbot(String(spot.valor));
  }, [blocoVenc, curvas, pCultura]);

  // Auto-fill frete + porto quando rota muda
  useEffect(() => {
    if (!rotaId) { setPortoDest(""); return; }
    const rota = despesas.find(d => d.id === rotaId);
    if (!rota) return;
    setPFrete(String(rota.valor_brl_sc));
    setPortoDest(rota.destino ?? "");
  }, [rotaId, despesas]);

  // ─── Gerador de blocos CME ───────────────────────────────────────────────
  function gerarBlocos(cult: "soja"|"milho") {
    const SOJA  : Record<number,string> = { 1:"F", 3:"H", 5:"K", 7:"N", 8:"Q", 9:"U", 11:"X" };
    const MILHO : Record<number,string> = { 3:"H", 5:"K", 7:"N", 9:"U", 12:"Z" };
    const map = cult === "milho" ? MILHO : SOJA;
    const now = new Date();
    const res: { code: string; label: string }[] = [];
    const seen = new Set<string>();
    for (let i = 0; i <= 20; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
      const mes = d.getMonth() + 1;
      const letra = map[mes];
      if (!letra) continue;
      const code = `${letra}${String(d.getFullYear()).slice(-2)}`;
      if (seen.has(code)) continue;
      seen.add(code);
      const nomeMes = d.toLocaleString("pt-BR", { month: "short" });
      res.push({ code, label: `${code} — ${nomeMes.toUpperCase()}/${d.getFullYear()}` });
    }
    return res;
  }

  // ─── Cálculos centrais ────────────────────────────────────────────────────
  function calcPreco(cbot: number, premio: number, cambio: number, frete: number, funrural: boolean, cultura: "soja"|"milho") {
    const fator = cultura === "milho" ? FATOR_MILHO : FATOR_SOJA;
    const precPorto = (cbot + premio) / 100 * fator * cambio;  // ¢/bu → USD/bu, × fator → USD/sc, × câmbio → R$/sc
    const despOriginacao = despesas.filter(d =>
      (!d.cultura || d.cultura === cultura) &&
      d.tipo !== "frete" &&
      (!portoDest || !d.destino || d.destino === portoDest)
    ).reduce((s, d) => s + d.valor_brl_sc, 0) || 6.5;
    const precLiquido    = precPorto - frete - despOriginacao;
    const descFunrural   = funrural ? precLiquido * (FUNRURAL_PF + SENAR) : 0;
    const precLiqFinal   = precLiquido - descFunrural;
    return { precPorto, precLiquido, precLiqFinal, descFunrural, despOriginacao };
  }

  const cbot_n   = parseFloat(pCbot)   || 0;
  const premio_n = parseFloat(pPremio) || 0;
  const cambio_n = parseFloat(pCambio) || 0;
  const frete_n  = parseFloat(pFrete)  || 0;
  const custo_n  = parseFloat(pCusto)  || 0;
  const funr     = pFunrural === "true";

  const calc = calcPreco(cbot_n, premio_n, cambio_n, frete_n, funr, pCultura);
  const margem_n     = calc.precLiqFinal - custo_n;
  const margem_pct   = custo_n > 0 ? (margem_n / custo_n * 100) : 0;
  const usd_sc       = calc.precLiqFinal / (cambio_n || 1);

  // Produção estimada do ciclo
  const prodEstimada = cicloSel ? (cicloSel.area_ha * (cicloSel.produtividade_esperada_sc_ha || 60)) : 0;

  // Fixação por componente
  function pctFixado(comp: FixacaoHedge["componente"]) {
    if (!prodEstimada) return 0;
    const total = fixacoes.filter(f => f.componente === comp).reduce((s, f) => s + f.quantidade_sc, 0);
    return Math.min(100, Math.round(total / prodEstimada * 100));
  }

  // Valor médio fixado por componente
  function mediaFixada(comp: FixacaoHedge["componente"]) {
    const rows = fixacoes.filter(f => f.componente === comp);
    if (!rows.length) return null;
    const totalSc  = rows.reduce((s, r) => s + r.quantidade_sc, 0);
    const pesoVal  = rows.reduce((s, r) => s + r.valor * r.quantidade_sc, 0);
    return totalSc > 0 ? pesoVal / totalSc : null;
  }

  // ─── Sensibilidade ────────────────────────────────────────────────────────
  function gerarEixo(eixo: string, val: number) {
    const delta = eixo === "cbot" ? 50 : eixo === "cambio" ? 0.2 : eixo === "premio" ? 10 : 5;
    return [-2,-1,0,1,2].map(i => +(val + i * delta).toFixed(eixo === "cambio" ? 2 : 0));
  }

  const exX = gerarEixo(sensiEixoX, sensiEixoX === "cbot" ? cbot_n : sensiEixoX === "cambio" ? cambio_n : premio_n);
  const exY = gerarEixo(sensiEixoY, sensiEixoY === "cambio" ? cambio_n : sensiEixoY === "cbot" ? cbot_n : frete_n);

  function sensiMargem(xVal: number, yVal: number) {
    const c  = sensiEixoX === "cbot"   ? xVal : sensiEixoY === "cbot"   ? yVal : cbot_n;
    const p  = sensiEixoX === "premio" ? xVal : premio_n;
    const ca = sensiEixoX === "cambio" ? xVal : sensiEixoY === "cambio" ? yVal : cambio_n;
    const fr = sensiEixoY === "frete"  ? yVal : frete_n;
    return calcPreco(c, p, ca, fr, funr, pCultura).precLiqFinal - custo_n;
  }

  // Cor da célula de sensibilidade
  function corCelula(m: number) {
    if (m < 0)   return { bg: "#FCEBEB", cl: "#791F1F" };
    if (m < 15)  return { bg: "#FFF3CD", cl: "#7A4300" };
    if (m < 30)  return { bg: "#D5E8F5", cl: "#0B2D50" };
    return { bg: "#D5F5E3", cl: "#1A5C35" };
  }

  // ─── Busca de margem ──────────────────────────────────────────────────────
  const metaMargem = parseFloat(buscaMargem) || 0;
  const precoAlvo  = custo_n + metaMargem;
  // Inverter: precoAlvo = (cbot+premio)/100 * fator * cambio - frete - desp - funrural*(precoAlvo - frete - desp)
  // Simplificado: cbot necessário
  const fator = pCultura === "milho" ? FATOR_MILHO : FATOR_SOJA;
  const despOrig = despesas.filter(d => (!d.cultura || d.cultura === pCultura) && d.tipo !== "frete" && (!portoDest || !d.destino || d.destino === portoDest)).reduce((s,d) => s + d.valor_brl_sc, 0) || 6.5;
  const precAlvoLiq = funr ? precoAlvo / (1 - FUNRURAL_PF - SENAR) : precoAlvo;
  const cbotNecessario  = ((precAlvoLiq + frete_n + despOrig) / (cambio_n * fator)) * 100 - premio_n;
  const cambioNecessario = ((precAlvoLiq + frete_n + despOrig) / ((cbot_n + premio_n) / 100 * fator));
  const cbotAtual_pct_hist = precoAoVivo ? Math.round((cbot_n - 900) / (1800 - 900) * 100) : null;

  // ─── Salvar fixação ───────────────────────────────────────────────────────
  async function salvarFixacao() {
    if (!fFix.quantidade_sc || !fFix.valor) { setErro("Preencha quantidade e valor."); return; }
    setSalvando(true); setErro("");
    try {
      const { data, error } = await sb.from("fixacoes_hedge").insert({
        fazenda_id: fazId, ciclo_id: cicloId || null,
        componente: fFix.componente, quantidade_sc: parseFloat(fFix.quantidade_sc),
        valor: parseFloat(fFix.valor), unidade: fFix.unidade,
        vencimento_ref: fFix.vencimento_ref || null,
        data_fixacao: fFix.data_fixacao,
        instrumento_hedge: fFix.instrumento_hedge || null,
        observacao: fFix.observacao || null,
      }).select().single();
      if (error) throw error;
      setFixacoes(x => [...x, data]);
      setModalFix(false);
    } catch(e: unknown) { setErro((e as {message?:string})?.message || "Erro ao salvar"); }
    finally { setSalvando(false); }
  }

  // ─── Salvar curva ─────────────────────────────────────────────────────────
  async function salvarCurva() {
    if (!fCurva.valor || !fCurva.data_referencia) { setErro("Preencha data e valor."); return; }
    setSalvando(true); setErro("");
    try {
      const { data, error } = await sb.from("curva_mercado").insert({
        fazenda_id: fazId, instrumento: fCurva.instrumento,
        vencimento: fCurva.vencimento || null,
        data_referencia: fCurva.data_referencia,
        valor: parseFloat(fCurva.valor), unidade: fCurva.unidade,
        fonte: fCurva.fonte, boletim: fCurva.boletim || null,
      }).select().single();
      if (error) throw error;
      setCurvas(x => [data, ...x]);
      setModalCurva(false);
    } catch(e: unknown) { setErro((e as {message?:string})?.message || "Erro ao salvar"); }
    finally { setSalvando(false); }
  }

  // ─── Salvar despesa ───────────────────────────────────────────────────────
  async function salvarDespesa() {
    if (!fDesp.descricao || !fDesp.valor_brl_sc) { setErro("Preencha descrição e valor."); return; }
    setSalvando(true); setErro("");
    try {
      const { data, error } = await sb.from("estrutura_despesa_hedge").insert({
        fazenda_id: fazId, tipo: fDesp.tipo, descricao: fDesp.descricao,
        cultura: fDesp.cultura || null, destino: fDesp.destino || null,
        valor_brl_sc: parseFloat(fDesp.valor_brl_sc),
      }).select().single();
      if (error) throw error;
      setDespesas(x => [...x, data]);
      setModalDesp(false);
    } catch(e: unknown) { setErro((e as {message?:string})?.message || "Erro ao salvar"); }
    finally { setSalvando(false); }
  }

  if (!temAcesso && userRole !== null) return null;

  // ─── Render ───────────────────────────────────────────────────────────────
  const ABAS: { key: Aba; label: string }[] = [
    { key: "cockpit",       label: "Cockpit" },
    { key: "precificador",  label: "Precificador" },
    { key: "sensibilidade", label: "Sensibilidade" },
    { key: "busca_margem",  label: "Busca de Margem" },
    { key: "escala",        label: "Escala" },
    { key: "curvas",        label: "Histórico" },
    { key: "despesas",      label: "Despesas" },
  ];

  const pctB = pctFixado("BOARD");
  const pctP = pctFixado("PREMIO");
  const pctC = pctFixado("CAMBIO");
  const pctF = pctFixado("FRETE");

  function BarraComponente({ pct, cor }: { pct: number; cor: string }) {
    return (
      <div style={{ marginTop: 8 }}>
        <div style={{ height: 6, background: "#E8EDF5", borderRadius: 3, overflow: "hidden" }}>
          <div style={{ height: "100%", width: `${pct}%`, background: cor, borderRadius: 3, transition: "width 0.4s" }} />
        </div>
        <div style={{ fontSize: 10, color: "#888", marginTop: 3 }}>{pct}% fixado</div>
      </div>
    );
  }

  return (
    <div style={{ padding: "24px 28px", maxWidth: 1400, margin: "0 auto", background: "var(--bg-page,#F4F6FA)", minHeight: "100vh" }}>

      {/* Cabeçalho */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
        <div>
          <div style={{ fontSize: 20, fontWeight: 700, color: "var(--text-1,#1a1a1a)" }}>Proteção de Margem & Hedge</div>
          <div style={{ fontSize: 12, color: "var(--text-2,#555)", marginTop: 2 }}>Gestão das 4 pernas de precificação — Board · Prêmio · Câmbio · Frete</div>
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          {precoAoVivo && (
            <div style={{ fontSize: 11, color: "#0B2D50", background: "#D5E8F5", padding: "5px 10px", borderRadius: 8 }}>
              CBOT Soja {(precoAoVivo.cbot_soja).toFixed(0)}¢ · USD/BRL {precoAoVivo.usd_brl.toFixed(2)}
            </div>
          )}
          {/* Toggle moeda */}
          <div style={{ display: "flex", gap: 0, border: "0.5px solid var(--border-table,#DDE2EE)", borderRadius: 8, overflow: "hidden" }}>
            {(["BRL","USD"] as const).map(m => (
              <button key={m} onClick={() => setMoeda(m)} style={{ padding: "6px 14px", background: moeda === m ? "#1A4870" : "transparent", color: moeda === m ? "#fff" : "#666", border: "none", fontSize: 12, fontWeight: moeda === m ? 600 : 400, cursor: "pointer" }}>{m}</button>
            ))}
          </div>
          {isSuperadmin && badge("Superadmin — módulo em desenvolvimento", "#FBF3E0", "#8B5A00")}
        </div>
      </div>

      {/* Seletor de Ciclo */}
      <div style={{ ...card, marginBottom: 16, display: "flex", gap: 12, alignItems: "center" }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-2,#555)", whiteSpace: "nowrap" }}>Ciclo / Cultura</div>
        <select style={{ ...inp, maxWidth: 360 }} value={cicloId} onChange={e => setCicloId(e.target.value)}>
          <option value="">— Selecione um ciclo —</option>
          {ciclos.map(c => <option key={c.id} value={c.id}>{c.descricao} · {c.area_ha.toLocaleString("pt-BR")} ha · {c.cultura}</option>)}
        </select>
        {cicloSel && (
          <>
            <div style={{ fontSize: 12, color: "var(--text-2,#555)" }}>Produção estimada:</div>
            <div style={{ fontSize: 14, fontWeight: 700, color: "#1A4870" }}>{prodEstimada.toLocaleString("pt-BR",{maximumFractionDigits:0})} sc</div>
          </>
        )}
        {carregando && <div style={{ fontSize: 12, color: "#888" }}>Carregando…</div>}
      </div>

      {/* Abas */}
      <div style={{ display: "flex", gap: 0, background: "var(--bg-card,#fff)", border: "0.5px solid var(--border-table,#DDE2EE)", borderRadius: 12, overflow: "hidden", marginBottom: 20 }}>
        {ABAS.map(a => (
          <button key={a.key} onClick={() => setAba(a.key)} style={{ flex: 1, padding: "11px 8px", border: "none", borderBottom: aba === a.key ? "2px solid #1A4870" : "2px solid transparent", background: "transparent", fontSize: 12, fontWeight: aba === a.key ? 700 : 400, color: aba === a.key ? "#1A4870" : "var(--text-2,#555)", cursor: "pointer" }}>
            {a.label}
          </button>
        ))}
      </div>

      {/* ══ COCKPIT ══ */}
      {aba === "cockpit" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

          {/* 4 blocos de componente */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14 }}>
            {[
              { comp: "BOARD"  as const, label: "BOARD (CBOT)", valor: mediaFixada("BOARD"), uni: "¢/bu",  pct: pctB, cor: "#1A4870", info: precoAoVivo ? `Spot: ${(precoAoVivo.cbot_soja).toFixed(0)} ¢/bu` : "—" },
              { comp: "PREMIO" as const, label: "PRÊMIO",       valor: mediaFixada("PREMIO"), uni: "¢/bu", pct: pctP, cor: "#0C447C", info: "Entrada manual" },
              { comp: "CAMBIO" as const, label: "CÂMBIO",       valor: mediaFixada("CAMBIO"), uni: "R$/USD",pct: pctC, cor: "#378ADD", info: precoAoVivo ? `PTAX: ${precoAoVivo.usd_brl.toFixed(4)}` : "—" },
              { comp: "FRETE"  as const, label: "FRETE",        valor: mediaFixada("FRETE"),  uni: "R$/sc", pct: pctF, cor: "#C9921B", info: "Médio das rotas" },
            ].map(bl => (
              <div key={bl.comp} style={{ ...card }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: bl.cor, letterSpacing: 1, marginBottom: 6 }}>{bl.label}</div>
                <div style={{ fontSize: 22, fontWeight: 800, color: "var(--text-1,#1a1a1a)" }}>
                  {bl.valor !== null ? `${bl.valor.toLocaleString("pt-BR",{maximumFractionDigits:2})} ${bl.uni}` : "—"}
                </div>
                <div style={{ fontSize: 11, color: "#888", marginTop: 2 }}>{bl.info}</div>
                <BarraComponente pct={bl.pct} cor={bl.cor} />
              </div>
            ))}
          </div>

          {/* Margem consolidada */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14 }}>
            <div style={{ ...card }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-2,#555)", marginBottom: 6 }}>Preço líquido (parâmetros atuais)</div>
              <div style={{ fontSize: 24, fontWeight: 800, color: "#1A4870" }}>
                {moeda === "BRL" ? `R$ ${calc.precLiqFinal.toLocaleString("pt-BR",{minimumFractionDigits:2,maximumFractionDigits:2})}/sc`
                                 : `USD ${usd_sc.toFixed(2)}/sc`}
              </div>
              <div style={{ fontSize: 11, color: "#888", marginTop: 2 }}>Porto: R$ {calc.precPorto.toFixed(2)}/sc · Frete: R$ {frete_n.toFixed(0)}/sc</div>
            </div>
            <div style={{ ...card }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-2,#555)", marginBottom: 6 }}>Margem sobre custo (R$ {custo_n.toFixed(2)}/sc)</div>
              <div style={{ fontSize: 24, fontWeight: 800, color: margem_n >= 0 ? "#16A34A" : "#E24B4A" }}>
                R$ {margem_n.toLocaleString("pt-BR",{minimumFractionDigits:2,maximumFractionDigits:2})}/sc
              </div>
              <div style={{ fontSize: 12, color: margem_n >= 0 ? "#16A34A" : "#E24B4A", fontWeight: 600 }}>{margem_pct.toFixed(1)}% sobre custo</div>
            </div>
            <div style={{ ...card }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-2,#555)", marginBottom: 6 }}>Exposição aberta (câmbio)</div>
              <div style={{ fontSize: 24, fontWeight: 800, color: pctC < 30 ? "#E24B4A" : pctC < 70 ? "#EF9F27" : "#16A34A" }}>
                {prodEstimada > 0 ? `${((1-pctC/100)*prodEstimada).toLocaleString("pt-BR",{maximumFractionDigits:0})} sc` : "—"}
              </div>
              <div style={{ fontSize: 11, color: "#888", marginTop: 2 }}>
                {prodEstimada > 0 && cambio_n > 0 ? `≈ USD ${(((1-pctC/100)*prodEstimada * calc.precLiqFinal) / cambio_n).toLocaleString("pt-BR",{maximumFractionDigits:0})}` : "Selecione um ciclo"}
              </div>
            </div>
          </div>

          {/* Fixações registradas */}
          <div style={{ ...card }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
              <div style={{ fontSize: 14, fontWeight: 700 }}>Fixações registradas</div>
              <button style={btnM} onClick={() => setModalFix(true)}>+ Nova Fixação</button>
            </div>
            {fixacoes.length === 0 ? (
              <div style={{ padding: 24, textAlign: "center", color: "#888", fontSize: 13 }}>Nenhuma fixação registrada para este ciclo.</div>
            ) : (
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                <thead><tr style={{ borderBottom: "0.5px solid var(--border-table,#DDE2EE)" }}>
                  {["Data","Componente","Instrumento","Qtd (sc)","Valor","Ref.",""].map((h,i) => <th key={i} style={{ padding: "8px 10px", textAlign: i > 3 ? "right" : "left", color: "var(--text-2,#555)", fontWeight: 600 }}>{h}</th>)}
                </tr></thead>
                <tbody>
                  {fixacoes.sort((a,b) => a.data_fixacao.localeCompare(b.data_fixacao)).map((f, i) => {
                    const corComp: Record<string,[string,string]> = { BOARD: ["#D5E8F5","#0B2D50"], PREMIO: ["#E6F1FB","#0C447C"], CAMBIO: ["#FBF3E0","#8B5E14"], FRETE: ["#FBF0D8","#7A5A12"] };
                    const [bg,cl] = corComp[f.componente] ?? ["#F1F5F9","#475569"];
                    return (
                      <tr key={f.id} style={{ borderBottom: i < fixacoes.length-1 ? "0.5px solid var(--border-row,#eee)" : "none" }}>
                        <td style={{ padding: "8px 10px" }}>{new Date(f.data_fixacao+"T12:00:00").toLocaleDateString("pt-BR")}</td>
                        <td style={{ padding: "8px 10px" }}><span style={{ background: bg, color: cl, padding: "2px 8px", borderRadius: 6, fontWeight: 700, fontSize: 11 }}>{f.componente}</span></td>
                        <td style={{ padding: "8px 10px", color: "#555" }}>{INSTRUMENTOS_HEDGE.find(h => h.value === f.instrumento_hedge)?.label ?? f.instrumento_hedge ?? "—"}</td>
                        <td style={{ padding: "8px 10px", textAlign: "right", fontWeight: 600 }}>{f.quantidade_sc.toLocaleString("pt-BR")}</td>
                        <td style={{ padding: "8px 10px", textAlign: "right", fontWeight: 700 }}>{f.valor.toLocaleString("pt-BR",{maximumFractionDigits:4})} <span style={{ fontSize:10, color:"#888" }}>{f.unidade}</span></td>
                        <td style={{ padding: "8px 10px", textAlign: "right", color: "#555" }}>{f.vencimento_ref ?? "—"}</td>
                        <td style={{ padding: "8px 10px", textAlign: "right" }}>
                          <button style={{ ...btnR, padding: "3px 8px", fontSize: 11 }} onClick={() => { if (confirm("Excluir?")) sb.from("fixacoes_hedge").delete().eq("id",f.id).then(() => setFixacoes(x => x.filter(r => r.id !== f.id))); }}>✕</button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* ══ PRECIFICADOR ══ */}
      {aba === "precificador" && (
        <div style={{ display: "grid", gridTemplateColumns: "420px 1fr", gap: 20 }}>

          {/* Inputs */}
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ ...card }}>
              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 14 }}>Parâmetros das 4 Pernas</div>

              <div style={{ marginBottom: 10 }}>
                <label style={lbl}>Cultura</label>
                <div style={{ display: "flex", gap: 6 }}>
                  {(["soja","milho"] as const).map(c => (
                    <button key={c} onClick={() => setPCultura(c)} style={{ flex: 1, padding: "7px 0", borderRadius: 7, border: `0.5px solid ${pCultura===c?"#1A4870":"var(--border-table,#DDE2EE)"}`, background: pCultura===c?"#D5E8F5":"transparent", color: pCultura===c?"#0B2D50":"#666", fontSize: 13, fontWeight: pCultura===c?700:400, cursor: "pointer" }}>
                      {c.charAt(0).toUpperCase()+c.slice(1)} (×{c==="soja"?FATOR_SOJA.toFixed(4):FATOR_MILHO.toFixed(4)})
                    </button>
                  ))}
                </div>
              </div>

              {/* Bloco de vencimento CME */}
              <div style={{ marginBottom: 10 }}>
                <label style={lbl}>Bloco / Vencimento CME</label>
                <select style={inp} value={blocoVenc} onChange={e => setBlocoVenc(e.target.value)}>
                  <option value="">— Manual (sem auto-fill CBOT) —</option>
                  {gerarBlocos(pCultura).map(b => <option key={b.code} value={b.code}>{b.label}</option>)}
                </select>
                {blocoVenc && (() => {
                  const inst  = `CBOT_${pCultura.toUpperCase()}`;
                  const temEspecifico = curvas.some(c => c.instrumento === inst && c.vencimento === blocoToDate(blocoVenc));
                  const temSpot       = curvas.some(c => c.instrumento === inst && !c.vencimento);
                  return (
                    <div style={{ fontSize: 10, marginTop: 2, color: temEspecifico ? "#16A34A" : temSpot ? "#C9921B" : "#888" }}>
                      {temEspecifico
                        ? `Cotação específica de ${blocoVenc} preenchida automaticamente`
                        : temSpot
                          ? `Usando front-month como referência (sem dado específico para ${blocoVenc})`
                          : `Sem dados — insira CBOT manualmente ou aguarde o cron noturno`}
                    </div>
                  );
                })()}
              </div>

              {/* Rota / Região */}
              {(() => {
                const rotas = despesas.filter(d => d.tipo === "frete" && (!d.cultura || d.cultura === pCultura));
                if (!rotas.length) return (
                  <div style={{ marginBottom: 10 }}>
                    <div style={{ fontSize: 10, color: "#888", background: "#F4F6FA", padding: "6px 10px", borderRadius: 6 }}>
                      Nenhuma rota cadastrada. Adicione em <strong>Despesas</strong> com tipo = frete.
                    </div>
                  </div>
                );
                return (
                  <div style={{ marginBottom: 10 }}>
                    <label style={lbl}>Rota / Região</label>
                    <select style={inp} value={rotaId} onChange={e => setRotaId(e.target.value)}>
                      <option value="">— Manual (sem auto-fill frete) —</option>
                      {rotas.map(r => (
                        <option key={r.id} value={r.id}>
                          {r.descricao}{r.destino ? ` → ${r.destino}` : ""} — R$ {r.valor_brl_sc.toFixed(2)}/sc
                        </option>
                      ))}
                    </select>
                    {portoDest && <div style={{ fontSize: 10, color: "#16A34A", marginTop: 2 }}>Porto: {portoDest} · frete e despesas preenchidos automaticamente</div>}
                  </div>
                );
              })()}

              <div style={{ borderBottom: "0.5px solid var(--border-table,#DDE2EE)", margin: "4px 0 12px" }} />

              {/* 4 Pernas */}
              {/* BOARD */}
              <div style={{ marginBottom: 10 }}>
                <label style={lbl}>BOARD — CBOT Futuro (¢/bu)</label>
                <input type="number" step="10" style={inp} value={pCbot} onChange={e => setPCbot(e.target.value)} />
                <div style={{ fontSize: 10, color: "#888", marginTop: 2 }}>
                  {blocoVenc ? `Bloco ${blocoVenc}` : "Spot"}{precoAoVivo ? ` · Referência: ${precoAoVivo.cbot_soja.toFixed(0)} ¢` : ""}
                </div>
              </div>

              {/* PRÊMIO — com sugestão CEPEA */}
              <div style={{ marginBottom: 10 }}>
                <label style={lbl}>PRÊMIO — Base {portoDest || "Paranaguá"} (¢/bu)</label>
                <div style={{ display: "flex", gap: 6 }}>
                  <input type="number" step="1" style={{ ...inp, flex: 1 }} value={pPremio} onChange={e => setPPremio(e.target.value)} />
                  {precoAoVivo?.premio_implicito != null && (
                    <button
                      style={{ ...btnM, whiteSpace: "nowrap", fontSize: 11 }}
                      onClick={() => setPPremio(String(precoAoVivo.premio_implicito))}
                      title="Usar prêmio implícito derivado do CEPEA"
                    >
                      Usar CEPEA
                    </button>
                  )}
                </div>
                <div style={{ fontSize: 10, color: "#888", marginTop: 2 }}>
                  {precoAoVivo?.premio_implicito != null
                    ? `CEPEA PNG R$ ${precoAoVivo.cepea_soja_png?.toFixed(2)}/sc → prêmio implícito ${precoAoVivo.premio_implicito > 0 ? "+" : ""}${precoAoVivo.premio_implicito.toFixed(1)} ¢/bu`
                    : "Negativo = desconto. Entrada manual ou boletim."}
                </div>
              </div>

              {/* CÂMBIO */}
              <div style={{ marginBottom: 10 }}>
                <label style={lbl}>CÂMBIO — USD/BRL</label>
                <input type="number" step="0.05" style={inp} value={pCambio} onChange={e => setPCambio(e.target.value)} />
                {precoAoVivo && <div style={{ fontSize: 10, color: "#888", marginTop: 2 }}>PTAX hoje: {precoAoVivo.usd_brl.toFixed(4)}</div>}
              </div>

              {/* FRETE */}
              <div style={{ marginBottom: 10 }}>
                <label style={lbl}>FRETE — Fazenda → Porto (R$/sc)</label>
                <input type="number" step="1" style={inp} value={pFrete} onChange={e => setPFrete(e.target.value)} />
                <div style={{ fontSize: 10, color: "#888", marginTop: 2 }}>
                  {rotaId ? `${despesas.find(d => d.id === rotaId)?.descricao ?? "Rota"} → ${portoDest}` : "Selecione uma rota acima ou insira manualmente"}
                </div>
              </div>

              <div style={{ borderTop: "0.5px solid var(--border-table,#DDE2EE)", paddingTop: 12, marginTop: 4 }}>
                <label style={lbl}>Custo de produção (R$/sc)</label>
                <input type="number" style={inp} value={pCusto} onChange={e => setPCusto(e.target.value)} />
              </div>
              <div style={{ marginTop: 10 }}>
                <label style={lbl}>Funrural + SENAR (1,7% — somente PF)</label>
                <select style={inp} value={pFunrural} onChange={e => setPFunrural(e.target.value)}>
                  <option value="true">Sim — descontar 1,7%</option>
                  <option value="false">Não — PJ ou já no custo</option>
                </select>
              </div>
            </div>
          </div>

          {/* Resultado */}
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ ...card, borderLeft: `4px solid ${margem_n >= 0 ? "#16A34A" : "#E24B4A"}` }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: "#555", marginBottom: 12 }}>Decomposição do Preço</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {[
                  { label: "Preço porto (FOB)",               val: calc.precPorto,     cor: "#0B2D50",  bold: false },
                  { label: `Frete (−R$ ${frete_n.toFixed(0)}/sc)`,      val: -frete_n,            cor: "#E24B4A",  bold: false },
                  { label: `Despesas originação (−R$ ${calc.despOriginacao.toFixed(2)}/sc)`, val: -calc.despOriginacao, cor: "#E24B4A", bold: false },
                  { label: "= Preço líquido pré-impostos",   val: calc.precLiquido,   cor: "#1A4870",  bold: true  },
                  { label: `Funrural+SENAR (−${funr?"1,7%":"0%"})`,     val: -calc.descFunrural,  cor: "#E24B4A",  bold: false },
                  { label: "= Preço líquido final (R$/sc)",  val: calc.precLiqFinal,  cor: "#1A5CB8",  bold: true  },
                  { label: `Custo de produção (−R$ ${custo_n.toFixed(2)}/sc)`, val: -custo_n, cor: "#E24B4A", bold: false },
                  { label: "= MARGEM DO PRODUTOR",            val: margem_n,           cor: margem_n>=0?"#16A34A":"#E24B4A", bold: true },
                ].map((row, i) => (
                  <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "6px 10px", background: row.bold ? "#F4F6FA" : "transparent", borderRadius: row.bold ? 6 : 0 }}>
                    <span style={{ fontSize: 13, color: "#555" }}>{row.label}</span>
                    <span style={{ fontSize: 14, fontWeight: row.bold ? 800 : 600, color: row.cor, fontVariantNumeric: "tabular-nums" }}>
                      {row.val >= 0 ? "" : "−"} R$ {Math.abs(row.val).toLocaleString("pt-BR",{minimumFractionDigits:2,maximumFractionDigits:2})}/sc
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div style={{ ...card, textAlign: "center" }}>
                <div style={{ fontSize: 11, color: "#555", marginBottom: 4 }}>Margem em %</div>
                <div style={{ fontSize: 28, fontWeight: 800, color: margem_n>=0?"#16A34A":"#E24B4A" }}>{margem_pct.toFixed(1)}%</div>
                <div style={{ fontSize: 11, color: "#888" }}>sobre o custo de produção</div>
              </div>
              <div style={{ ...card, textAlign: "center" }}>
                <div style={{ fontSize: 11, color: "#555", marginBottom: 4 }}>Em USD/sc</div>
                <div style={{ fontSize: 28, fontWeight: 800, color: "#1A4870" }}>USD {usd_sc.toFixed(2)}</div>
                <div style={{ fontSize: 11, color: "#888" }}>câmbio {cambio_n.toFixed(2)}</div>
              </div>
            </div>

            {/* Fórmula explícita */}
            <div style={{ ...card, background: "#F8FAFC" }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: "#555", marginBottom: 8 }}>Fórmula</div>
              <div style={{ fontFamily: "monospace", fontSize: 12, color: "#0B2D50", lineHeight: 1.8 }}>
                ({cbot_n} + ({premio_n})) ÷ 100 × {fator.toFixed(4)} × {cambio_n.toFixed(2)}<br/>
                = R$ {calc.precPorto.toFixed(2)}/sc (porto)<br/>
                − R$ {frete_n.toFixed(0)} (frete) − R$ {calc.despOriginacao.toFixed(2)} (desp.)<br/>
                = R$ {calc.precLiqFinal.toFixed(2)}/sc líquido<br/>
                − R$ {custo_n.toFixed(2)} (custo)<br/>
                = <strong>R$ {margem_n.toFixed(2)}/sc ({margem_pct.toFixed(1)}%)</strong>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ══ SENSIBILIDADE ══ */}
      {aba === "sensibilidade" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {/* Seletor de eixos */}
          <div style={{ ...card, display: "flex", gap: 16, flexWrap: "wrap", alignItems: "flex-end" }}>
            {[
              { id:"eixoX", label:"Eixo X (colunas)", val:sensiEixoX, set:(v: string) => setSensiEixoX(v as typeof sensiEixoX), opts:[{v:"cbot",l:"CBOT (¢/bu)"},{v:"cambio",l:"Câmbio (R$/USD)"},{v:"premio",l:"Prêmio (¢/bu)"}] },
              { id:"eixoY", label:"Eixo Y (linhas)",  val:sensiEixoY, set:(v: string) => setSensiEixoY(v as typeof sensiEixoY), opts:[{v:"cambio",l:"Câmbio (R$/USD)"},{v:"cbot",l:"CBOT (¢/bu)"},{v:"frete",l:"Frete (R$/sc)"}] },
            ].map(s => (
              <div key={s.id}>
                <label style={lbl}>{s.label}</label>
                <select style={{ ...inp, width: 200 }} value={s.val} onChange={e => s.set(e.target.value)}>
                  {s.opts.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}
                </select>
              </div>
            ))}
            <div style={{ fontSize: 11, color: "#555", padding: "8px 0" }}>Resultado: <strong>Margem R$/sc</strong> · Custo: R$ {custo_n.toFixed(2)}/sc · {pCultura}</div>
          </div>

          {/* Legenda */}
          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            {[{ bg:"#FCEBEB",cl:"#791F1F",l:"Negativa"},{bg:"#FFF3CD",cl:"#7A4300",l:"0–15 R$/sc"},{bg:"#D5E8F5",cl:"#0B2D50",l:"15–30 R$/sc"},{bg:"#D5F5E3",cl:"#1A5C35",l:"+ 30 R$/sc"}].map(s => (
              <div key={s.l} style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <div style={{ width: 14, height: 14, background: s.bg, border: `1px solid ${s.cl}`, borderRadius: 3 }} />
                <span style={{ fontSize: 11, color: "#555" }}>{s.l}</span>
              </div>
            ))}
          </div>

          {/* Matriz */}
          <div style={{ overflowX: "auto" }}>
            <table style={{ borderCollapse: "collapse", fontSize: 12, minWidth: 500 }}>
              <thead>
                <tr>
                  <th style={{ padding: "8px 12px", background: "#F4F6FA", border: "0.5px solid #DDE2EE", fontSize: 11, color: "#555" }}>
                    Y ↓ / X →
                  </th>
                  {exX.map(x => (
                    <th key={x} style={{ padding: "8px 12px", background: Math.abs(x - (sensiEixoX==="cbot"?cbot_n:sensiEixoX==="cambio"?cambio_n:premio_n)) < 1 ? "#D5E8F5" : "#F4F6FA", border: "0.5px solid #DDE2EE", fontVariantNumeric: "tabular-nums", color: "#0B2D50", fontWeight: 700 }}>
                      {sensiEixoX==="cambio" ? x.toFixed(2) : x}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {exY.map(y => (
                  <tr key={y}>
                    <td style={{ padding: "8px 12px", background: Math.abs(y - (sensiEixoY==="cambio"?cambio_n:sensiEixoY==="cbot"?cbot_n:frete_n)) < 0.1 ? "#D5E8F5" : "#F4F6FA", border: "0.5px solid #DDE2EE", fontVariantNumeric: "tabular-nums", fontWeight: 700, color: "#0B2D50" }}>
                      {sensiEixoY==="cambio" ? y.toFixed(2) : y}
                    </td>
                    {exX.map(x => {
                      const m = sensiMargem(x, y);
                      const { bg, cl } = corCelula(m);
                      const isCurr = Math.abs(x-(sensiEixoX==="cbot"?cbot_n:sensiEixoX==="cambio"?cambio_n:premio_n))<1 && Math.abs(y-(sensiEixoY==="cambio"?cambio_n:sensiEixoY==="cbot"?cbot_n:frete_n))<0.11;
                      return (
                        <td key={x} style={{ padding: "10px 14px", border: `${isCurr?"2px":"0.5px"} solid ${isCurr?"#1A4870":"#DDE2EE"}`, background: bg, color: cl, fontWeight: isCurr ? 800 : 600, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                          R$ {m.toFixed(1)}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ══ BUSCA DE MARGEM ══ */}
      {aba === "busca_margem" && (
        <div style={{ display: "grid", gridTemplateColumns: "380px 1fr", gap: 20 }}>
          <div style={{ ...card }}>
            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 16 }}>Definir Meta de Margem</div>
            <div style={{ marginBottom: 12 }}>
              <label style={lbl}>Margem desejada (R$/sc)</label>
              <input type="number" style={inp} value={buscaMargem} onChange={e => setBuscaMargem(e.target.value)} />
              {custo_n > 0 && <div style={{ fontSize: 11, color: "#888", marginTop: 2 }}>= {(parseFloat(buscaMargem)/custo_n*100).toFixed(1)}% sobre custo de R$ {custo_n.toFixed(2)}/sc</div>}
            </div>
            <div style={{ marginBottom: 12 }}>
              <label style={lbl}>Travar via qual perna</label>
              <select style={inp} value={buscaTravar} onChange={e => setBuscaTravar(e.target.value as typeof buscaTravar)}>
                <option value="cbot">CBOT (board)</option>
                <option value="cambio">Câmbio</option>
                <option value="ambos">Combinação CBOT + Câmbio</option>
              </select>
            </div>
            <div style={{ fontSize: 11, color: "#555", background: "#F4F6FA", padding: 10, borderRadius: 8 }}>
              Premissas fixas: Prêmio {premio_n} ¢ · Frete R$ {frete_n}/sc · {funr?"Funrural 1,7%":"sem Funrural"}
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {/* CBOT necessário */}
            {(buscaTravar === "cbot" || buscaTravar === "ambos") && (
              <div style={{ ...card, borderLeft: "4px solid #1A4870" }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: "#555", marginBottom: 8 }}>Via BOARD (câmbio fixo em {cambio_n.toFixed(2)})</div>
                <div style={{ display: "flex", gap: 20, alignItems: "center" }}>
                  <div>
                    <div style={{ fontSize: 11, color: "#888" }}>CBOT necessário</div>
                    <div style={{ fontSize: 28, fontWeight: 800, color: "#1A4870" }}>{cbotNecessario.toFixed(0)} ¢/bu</div>
                  </div>
                  <div style={{ fontSize: 28, color: "#DDE2EE" }}>→</div>
                  <div>
                    <div style={{ fontSize: 11, color: "#888" }}>CBOT atual</div>
                    <div style={{ fontSize: 28, fontWeight: 800, color: "#888" }}>{cbot_n} ¢/bu</div>
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 11, color: "#888", marginBottom: 4 }}>Delta necessário</div>
                    <div style={{ fontSize: 18, fontWeight: 700, color: cbotNecessario > cbot_n ? "#E24B4A" : "#16A34A" }}>
                      {cbotNecessario > cbot_n ? "+" : ""}{(cbotNecessario - cbot_n).toFixed(0)} ¢ ({((cbotNecessario/cbot_n-1)*100).toFixed(1)}%)
                    </div>
                    {cbotAtual_pct_hist !== null && (
                      <div style={{ fontSize: 11, color: "#888", marginTop: 2 }}>CBOT atual ≈ p{cbotAtual_pct_hist} histórico estimado</div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Câmbio necessário */}
            {(buscaTravar === "cambio" || buscaTravar === "ambos") && (
              <div style={{ ...card, borderLeft: "4px solid #378ADD" }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: "#555", marginBottom: 8 }}>Via CÂMBIO (CBOT fixo em {cbot_n} ¢/bu)</div>
                <div style={{ display: "flex", gap: 20, alignItems: "center" }}>
                  <div>
                    <div style={{ fontSize: 11, color: "#888" }}>Câmbio necessário</div>
                    <div style={{ fontSize: 28, fontWeight: 800, color: "#378ADD" }}>R$ {cambioNecessario.toFixed(4)}</div>
                  </div>
                  <div style={{ fontSize: 28, color: "#DDE2EE" }}>→</div>
                  <div>
                    <div style={{ fontSize: 11, color: "#888" }}>Câmbio atual</div>
                    <div style={{ fontSize: 28, fontWeight: 800, color: "#888" }}>R$ {cambio_n.toFixed(2)}</div>
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 11, color: "#888", marginBottom: 4 }}>Delta necessário</div>
                    <div style={{ fontSize: 18, fontWeight: 700, color: cambioNecessario > cambio_n ? "#E24B4A" : "#16A34A" }}>
                      {cambioNecessario > cambio_n ? "+" : ""}{((cambioNecessario/cambio_n-1)*100).toFixed(1)}%
                    </div>
                    <div style={{ fontSize: 11, color: "#888", marginTop: 2 }}>
                      {Math.abs((cambioNecessario/cambio_n-1)*100) > 10 ? "⚠ variação expressiva — avaliar NDF" : "✓ dentro de faixa razoável"}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Combinada */}
            {buscaTravar === "ambos" && (
              <div style={{ ...card, background: "#F8FAFC" }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: "#555", marginBottom: 10 }}>Cenário combinado sugerido</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  {[
                    { cbot: cbot_n + Math.round((cbotNecessario-cbot_n)*0.5), cambio: +(cambio_n * 1.03).toFixed(2) },
                    { cbot: cbot_n + Math.round((cbotNecessario-cbot_n)*0.75), cambio: +(cambio_n * 1.01).toFixed(2) },
                  ].map((c, i) => {
                    const m2 = calcPreco(c.cbot, premio_n, c.cambio, frete_n, funr, pCultura).precLiqFinal - custo_n;
                    return (
                      <div key={i} style={{ background: "var(--bg-card,#fff)", border: "0.5px solid var(--border-table,#DDE2EE)", borderRadius: 8, padding: "10px 14px" }}>
                        <div style={{ fontSize: 11, color: "#888", marginBottom: 4 }}>Cenário {i+1}</div>
                        <div style={{ fontSize: 12, fontWeight: 600 }}>CBOT {c.cbot} ¢ + câmbio {c.cambio}</div>
                        <div style={{ fontSize: 14, fontWeight: 800, color: m2>=0?"#16A34A":"#E24B4A", marginTop: 4 }}>→ R$ {m2.toFixed(2)}/sc ({(m2/custo_n*100).toFixed(1)}%)</div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Botão enviar para IA */}
            <div style={{ ...card, background: "#FBF3E0", border: "0.5px solid #C9921B" }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: "#7A4300", marginBottom: 6 }}>Enviar como contexto para a IA</div>
              <div style={{ fontSize: 11, color: "#8B5A00", marginBottom: 10 }}>
                Meta R$ {buscaMargem}/sc · CBOT necessário: {cbotNecessario.toFixed(0)} ¢ · Câmbio necessário: R$ {cambioNecessario.toFixed(4)} · Posição BOARD: {pctB}% fixado
              </div>
              <button style={btnM} onClick={() => setAba("cockpit")}>← Registrar fixação via Cockpit</button>
            </div>
          </div>
        </div>
      )}

      {/* ══ ESCALA DE COMERCIALIZAÇÃO ══ */}
      {aba === "escala" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {!cicloSel ? (
            <div style={{ ...card, padding: 40, textAlign: "center", color: "#888" }}>Selecione um ciclo para ver a escala de comercialização.</div>
          ) : (
            <>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14 }}>
                <div style={{ ...card }}>
                  <div style={{ fontSize: 11, color: "#555", marginBottom: 4 }}>Produção estimada</div>
                  <div style={{ fontSize: 20, fontWeight: 800, color: "#1A4870" }}>{prodEstimada.toLocaleString("pt-BR",{maximumFractionDigits:0})} sc</div>
                  <div style={{ fontSize: 11, color: "#888" }}>{cicloSel.area_ha.toLocaleString("pt-BR")} ha × {cicloSel.produtividade_esperada_sc_ha ?? 60} sc/ha</div>
                </div>
                <div style={{ ...card }}>
                  <div style={{ fontSize: 11, color: "#555", marginBottom: 4 }}>Board fixado</div>
                  <div style={{ fontSize: 20, fontWeight: 800, color: pctB >= 50 ? "#16A34A" : pctB >= 25 ? "#EF9F27" : "#E24B4A" }}>{pctB}%</div>
                  <div style={{ fontSize: 11, color: "#888" }}>{Math.round(pctB/100*prodEstimada).toLocaleString("pt-BR")} sc</div>
                </div>
                <div style={{ ...card }}>
                  <div style={{ fontSize: 11, color: "#555", marginBottom: 4 }}>Câmbio fixado</div>
                  <div style={{ fontSize: 20, fontWeight: 800, color: pctC >= 50 ? "#16A34A" : pctC >= 25 ? "#EF9F27" : "#E24B4A" }}>{pctC}%</div>
                  <div style={{ fontSize: 11, color: "#888" }}>{Math.round(pctC/100*prodEstimada).toLocaleString("pt-BR")} sc</div>
                </div>
              </div>

              {/* Timeline de milestones */}
              <div style={{ ...card }}>
                <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 14 }}>Escala por Milestone</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
                  {MILESTONES.map((ms, idx) => {
                    const meta = metas.find(m => m.milestone === ms.key);
                    const metaPct = meta?.meta_pct ?? ms.pct_default;
                    const status = pctB >= metaPct ? "ok" : pctB >= metaPct * 0.8 ? "alerta" : "atrasado";
                    const corStatus: Record<string,string> = { ok: "#16A34A", alerta: "#EF9F27", atrasado: "#E24B4A" };
                    const cor = corStatus[status];
                    return (
                      <div key={ms.key} style={{ display: "grid", gridTemplateColumns: "140px 80px 1fr 120px", gap: 14, alignItems: "center", padding: "12px 0", borderBottom: idx < MILESTONES.length-1 ? "0.5px solid var(--border-row,#eee)" : "none" }}>
                        <div style={{ fontWeight: 600, fontSize: 13 }}>{ms.label}</div>
                        <div style={{ textAlign: "center" }}>
                          <div style={{ fontSize: 11, color: "#888" }}>Meta</div>
                          <div style={{ fontSize: 16, fontWeight: 700, color: "#1A4870" }}>{metaPct}%</div>
                        </div>
                        <div>
                          <div style={{ height: 8, background: "#E8EDF5", borderRadius: 4, overflow: "hidden" }}>
                            <div style={{ height: "100%", width: `${Math.min(100,pctB)}%`, background: cor, borderRadius: 4 }} />
                          </div>
                          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 3 }}>
                            <span style={{ fontSize: 10, color: "#888" }}>Board: {pctB}% fixado</span>
                            <span style={{ fontSize: 10, color: "#888" }}>Câmbio: {pctC}%</span>
                          </div>
                        </div>
                        <div style={{ textAlign: "center" }}>
                          <span style={{ fontSize: 11, background: cor+"22", color: cor, padding: "3px 10px", borderRadius: 8, fontWeight: 700 }}>
                            {status === "ok" ? "✓ ok" : status === "alerta" ? "⚠ próximo" : "● atrasado"}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Risco de washout */}
              <div style={{ ...card, background: "#FFFAF5", border: "0.5px solid #EF9F27" }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: "#7A4300", marginBottom: 6 }}>⚠ Alerta de Washout</div>
                <div style={{ fontSize: 12, color: "#555" }}>
                  Volume com board fixado: {Math.round(pctB/100*prodEstimada).toLocaleString("pt-BR")} sc.
                  Cenário pessimista (−15%): {Math.round(prodEstimada*0.85).toLocaleString("pt-BR")} sc.
                  {Math.round(pctB/100*prodEstimada) > Math.round(prodEstimada*0.85)
                    ? " 🔴 Volume vendido supera o cenário pessimista — risco de washout ativo."
                    : " ✓ Sem risco de washout no cenário pessimista."}
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* ══ HISTÓRICO (CURVAS) ══ */}
      {aba === "curvas" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ ...card, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700 }}>Histórico de Preços</div>
              <div style={{ fontSize: 11, color: "#888", marginTop: 2 }}>Entrada manual · {curvas.length} registros</div>
            </div>
            <button style={btnM} onClick={() => { setFCurva({ instrumento: "CBOT_SOJA", vencimento: "", data_referencia: new Date().toISOString().slice(0,10), valor: "", unidade: "cents_bu", fonte: "MANUAL", boletim: "fechamento" }); setModalCurva(true); }}>+ Novo Registro</button>
          </div>
          <div style={{ ...card }}>
            {curvas.length === 0 ? (
              <div style={{ padding: 40, textAlign: "center", color: "#888" }}>Nenhum registro histórico. Adicione preços de CBOT, prêmio, câmbio ou frete para construir a base histórica.</div>
            ) : (
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                <thead><tr style={{ borderBottom: "0.5px solid var(--border-table,#DDE2EE)" }}>
                  {["Data Ref.","Instrumento","Vencimento","Valor","Unidade","Fonte",""].map((h,i) => <th key={i} style={{ padding: "8px 10px", textAlign: i > 3 ? "right" : "left", color: "#555", fontWeight: 600 }}>{h}</th>)}
                </tr></thead>
                <tbody>
                  {curvas.slice(0, 100).map((c, i) => (
                    <tr key={c.id} style={{ borderBottom: i < Math.min(curvas.length,100)-1 ? "0.5px solid var(--border-row,#eee)" : "none" }}>
                      <td style={{ padding: "8px 10px" }}>{new Date(c.data_referencia+"T12:00:00").toLocaleDateString("pt-BR")}</td>
                      <td style={{ padding: "8px 10px", fontWeight: 600 }}>{c.instrumento}</td>
                      <td style={{ padding: "8px 10px", color: "#555" }}>{c.vencimento ? new Date(c.vencimento+"T12:00:00").toLocaleDateString("pt-BR",{month:"short",year:"numeric"}) : "spot"}</td>
                      <td style={{ padding: "8px 10px", textAlign: "right", fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{c.valor.toLocaleString("pt-BR",{maximumFractionDigits:4})}</td>
                      <td style={{ padding: "8px 10px", textAlign: "right", color: "#888" }}>{c.unidade}</td>
                      <td style={{ padding: "8px 10px", textAlign: "right" }}>{badge(c.fonte, "#F1F5F9","#475569")}</td>
                      <td style={{ padding: "8px 10px", textAlign: "right" }}>
                        <button style={{ ...btnR, padding: "3px 8px", fontSize: 11 }} onClick={() => { if (confirm("Excluir?")) sb.from("curva_mercado").delete().eq("id",c.id).then(() => setCurvas(x => x.filter(r => r.id !== c.id))); }}>✕</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* ══ DESPESAS ══ */}
      {aba === "despesas" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ ...card, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700 }}>Estrutura de Despesas de Originação</div>
              <div style={{ fontSize: 11, color: "#888", marginTop: 2 }}>Frete, taxas portuárias, classificação, quebra, comissão — por rota/porto</div>
            </div>
            <button style={btnM} onClick={() => { setFDesp({ tipo: "frete", descricao: "", cultura: "", destino: "", valor_brl_sc: "" }); setModalDesp(true); }}>+ Nova Despesa</button>
          </div>
          <div style={{ ...card }}>
            {despesas.length === 0 ? (
              <div style={{ padding: 40, textAlign: "center", color: "#888" }}>Nenhuma despesa cadastrada. Configure frete por rota, taxas portuárias, etc.</div>
            ) : (
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                <thead><tr style={{ borderBottom: "0.5px solid #DDE2EE" }}>
                  {["Tipo","Descrição","Cultura","Destino","R$/sc",""].map((h,i) => <th key={i} style={{ padding: "8px 10px", textAlign: i > 3 ? "right" : "left", color: "#555", fontWeight: 600 }}>{h}</th>)}
                </tr></thead>
                <tbody>
                  {despesas.map((d, i) => (
                    <tr key={d.id} style={{ borderBottom: i < despesas.length-1 ? "0.5px solid #eee" : "none" }}>
                      <td style={{ padding: "8px 10px" }}>{badge(d.tipo,"#F1F5F9","#475569")}</td>
                      <td style={{ padding: "8px 10px", fontWeight: 600 }}>{d.descricao}</td>
                      <td style={{ padding: "8px 10px", color: "#555" }}>{d.cultura ?? "—"}</td>
                      <td style={{ padding: "8px 10px", color: "#555" }}>{d.destino ?? "—"}</td>
                      <td style={{ padding: "8px 10px", textAlign: "right", fontWeight: 700 }}>R$ {d.valor_brl_sc.toFixed(2)}</td>
                      <td style={{ padding: "8px 10px", textAlign: "right" }}>
                        <button style={{ ...btnR, padding: "3px 8px", fontSize: 11 }} onClick={() => { if (confirm("Excluir?")) sb.from("estrutura_despesa_hedge").delete().eq("id",d.id).then(() => setDespesas(x => x.filter(r => r.id !== d.id))); }}>✕</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr style={{ background: "#F4F6FA" }}>
                    <td colSpan={4} style={{ padding: "8px 10px", fontSize: 11, color: "#555" }}>Total originação</td>
                    <td style={{ padding: "8px 10px", textAlign: "right", fontWeight: 800, color: "#1A4870" }}>R$ {despesas.reduce((s,d) => s+d.valor_brl_sc,0).toFixed(2)}/sc</td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            )}
          </div>
        </div>
      )}

      {/* ══ MODAIS ══ */}

      {/* Modal Nova Fixação */}
      {modalFix && (
        <Modal titulo="Registrar Fixação" onClose={() => setModalFix(false)} width={620}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            <div>
              <label style={lbl}>Componente *</label>
              <select style={inp} value={fFix.componente} onChange={e => {
                const comp = e.target.value as FixacaoHedge["componente"];
                const uni = comp === "FRETE" ? "brl_sc" : comp === "CAMBIO" ? "brl_usd" : "cents_bu";
                setFFix(p => ({ ...p, componente: comp, unidade: uni }));
              }}>
                <option value="BOARD">BOARD (CBOT Futuro)</option>
                <option value="PREMIO">PRÊMIO (Basis)</option>
                <option value="CAMBIO">CÂMBIO (USD/BRL)</option>
                <option value="FRETE">FRETE (R$/sc)</option>
              </select>
            </div>
            <div>
              <label style={lbl}>Instrumento</label>
              <select style={inp} value={fFix.instrumento_hedge} onChange={e => setFFix(p => ({ ...p, instrumento_hedge: e.target.value }))}>
                {INSTRUMENTOS_HEDGE.map(h => <option key={h.value} value={h.value}>{h.label}</option>)}
              </select>
            </div>
            <div>
              <label style={lbl}>Quantidade (sc) *</label>
              <input type="number" style={inp} placeholder="Ex: 5000" value={fFix.quantidade_sc} onChange={e => setFFix(p => ({ ...p, quantidade_sc: e.target.value }))} />
            </div>
            <div>
              <label style={lbl}>Valor *</label>
              <input type="number" step="0.01" style={inp} placeholder={fFix.componente==="CAMBIO"?"Ex: 5.4200":fFix.componente==="FRETE"?"Ex: 48.00":"Ex: 1420.00"} value={fFix.valor} onChange={e => setFFix(p => ({ ...p, valor: e.target.value }))} />
              <div style={{ fontSize: 10, color: "#888", marginTop: 2 }}>Unidade: {fFix.unidade}</div>
            </div>
            <div>
              <label style={lbl}>Data da fixação *</label>
              <input type="date" style={inp} value={fFix.data_fixacao} onChange={e => setFFix(p => ({ ...p, data_fixacao: e.target.value }))} />
            </div>
            <div>
              <label style={lbl}>Ref. de vencimento</label>
              <input style={inp} placeholder="Ex: SX26, ZX26" value={fFix.vencimento_ref} onChange={e => setFFix(p => ({ ...p, vencimento_ref: e.target.value }))} />
            </div>
            <div style={{ gridColumn: "1/-1" }}>
              <label style={lbl}>Observação</label>
              <input style={inp} placeholder="Opcional" value={fFix.observacao} onChange={e => setFFix(p => ({ ...p, observacao: e.target.value }))} />
            </div>
          </div>
          {erro && <div style={{ color: "#E24B4A", fontSize: 12, marginTop: 10 }}>{erro}</div>}
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 20 }}>
            <button style={btnR} onClick={() => setModalFix(false)}>Cancelar</button>
            <button style={{ ...btnV, opacity: salvando ? 0.5 : 1 }} disabled={salvando} onClick={salvarFixacao}>{salvando ? "Salvando…" : "Registrar"}</button>
          </div>
        </Modal>
      )}

      {/* Modal Nova Curva */}
      {modalCurva && (
        <Modal titulo="Registrar Preço Histórico" onClose={() => setModalCurva(false)} width={560}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            <div>
              <label style={lbl}>Instrumento *</label>
              <select style={inp} value={fCurva.instrumento} onChange={e => {
                const inst = e.target.value;
                const uni = inst.includes("DOL") || inst.includes("PREMIO") || inst.includes("CBOT") ? (inst.includes("CBOT")?"cents_bu":"brl_usd") : inst.includes("FRETE") ? "brl_sc" : "brl_usd";
                setFCurva(p => ({ ...p, instrumento: inst, unidade: uni }));
              }}>
                <option value="CBOT_SOJA">CBOT Soja (¢/bu)</option>
                <option value="CBOT_MILHO">CBOT Milho (¢/bu)</option>
                <option value="PREMIO_PNG">Prêmio Paranaguá (¢/bu)</option>
                <option value="PREMIO_SFZ">Prêmio S. Francisco do Sul (¢/bu)</option>
                <option value="DOL_FUT">Câmbio Futuro DOL (R$/USD)</option>
                <option value="PTAX_BCB">PTAX BCB (R$/USD)</option>
                <option value="FRETE_ROTA">Frete por Rota (R$/sc)</option>
              </select>
            </div>
            <div>
              <label style={lbl}>Data de referência *</label>
              <input type="date" style={inp} value={fCurva.data_referencia} onChange={e => setFCurva(p => ({ ...p, data_referencia: e.target.value }))} />
            </div>
            <div>
              <label style={lbl}>Valor *</label>
              <input type="number" step="0.0001" style={inp} value={fCurva.valor} onChange={e => setFCurva(p => ({ ...p, valor: e.target.value }))} />
              <div style={{ fontSize: 10, color: "#888", marginTop: 2 }}>Unidade: {fCurva.unidade}</div>
            </div>
            <div>
              <label style={lbl}>Vencimento (se futuro)</label>
              <input type="date" style={inp} value={fCurva.vencimento} onChange={e => setFCurva(p => ({ ...p, vencimento: e.target.value }))} />
            </div>
            <div>
              <label style={lbl}>Fonte</label>
              <select style={inp} value={fCurva.fonte} onChange={e => setFCurva(p => ({ ...p, fonte: e.target.value }))}>
                <option value="MANUAL">Manual</option>
                <option value="BCB_PTAX">BCB PTAX</option>
                <option value="BARCHART">Barchart</option>
                <option value="STONEX">StoneX</option>
                <option value="HPOIN">hEDGEpoint</option>
                <option value="YAHOO">Yahoo Finance</option>
              </select>
            </div>
            <div>
              <label style={lbl}>Boletim PTAX</label>
              <select style={inp} value={fCurva.boletim} onChange={e => setFCurva(p => ({ ...p, boletim: e.target.value }))}>
                <option value="fechamento">Fechamento</option>
                <option value="abertura">Abertura</option>
                <option value="intermediario">Intermediário</option>
              </select>
            </div>
          </div>
          {erro && <div style={{ color: "#E24B4A", fontSize: 12, marginTop: 10 }}>{erro}</div>}
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 20 }}>
            <button style={btnR} onClick={() => setModalCurva(false)}>Cancelar</button>
            <button style={{ ...btnV, opacity: salvando ? 0.5 : 1 }} disabled={salvando} onClick={salvarCurva}>{salvando ? "Salvando…" : "Registrar"}</button>
          </div>
        </Modal>
      )}

      {/* Modal Nova Despesa */}
      {modalDesp && (
        <Modal titulo="Nova Despesa de Originação" onClose={() => setModalDesp(false)} width={520}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            <div>
              <label style={lbl}>Tipo *</label>
              <select style={inp} value={fDesp.tipo} onChange={e => setFDesp(p => ({ ...p, tipo: e.target.value }))}>
                {TIPOS_DESPESA.map(t => <option key={t} value={t}>{t.replace("_"," ")}</option>)}
              </select>
            </div>
            <div>
              <label style={lbl}>Cultura</label>
              <select style={inp} value={fDesp.cultura} onChange={e => setFDesp(p => ({ ...p, cultura: e.target.value }))}>
                <option value="">Todas</option>
                <option value="soja">Soja</option>
                <option value="milho">Milho</option>
              </select>
            </div>
            <div style={{ gridColumn: "1/-1" }}>
              <label style={lbl}>Descrição *</label>
              <input style={inp} placeholder="Ex: Frete Sorriso → Paranaguá" value={fDesp.descricao} onChange={e => setFDesp(p => ({ ...p, descricao: e.target.value }))} />
            </div>
            <div>
              <label style={lbl}>Destino / Porto</label>
              <input list="portos-list" style={inp} placeholder="Ex: Paranaguá (PNG)" value={fDesp.destino} onChange={e => setFDesp(p => ({ ...p, destino: e.target.value }))} />
              <datalist id="portos-list">{PORTOS.map(p => <option key={p} value={p} />)}</datalist>
            </div>
            <div>
              <label style={lbl}>Valor (R$/sc) *</label>
              <input type="number" step="0.01" style={inp} placeholder="Ex: 48.00" value={fDesp.valor_brl_sc} onChange={e => setFDesp(p => ({ ...p, valor_brl_sc: e.target.value }))} />
            </div>
          </div>
          {erro && <div style={{ color: "#E24B4A", fontSize: 12, marginTop: 10 }}>{erro}</div>}
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 20 }}>
            <button style={btnR} onClick={() => setModalDesp(false)}>Cancelar</button>
            <button style={{ ...btnV, opacity: salvando ? 0.5 : 1 }} disabled={salvando} onClick={salvarDespesa}>{salvando ? "Salvando…" : "Salvar"}</button>
          </div>
        </Modal>
      )}

    </div>
  );
}
