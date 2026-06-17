"use client";
import React, { useState, useEffect, useCallback } from "react";
import TopNav from "../../components/TopNav";
import { useAuth } from "../../components/AuthProvider";
import { supabase } from "../../lib/supabase";
import { useRouter } from "next/navigation";
import type { PrecosData } from "../api/precos/route";
import { listarAlertasController, reconhecerAlerta, resolverAlerta, upsertAlertaController } from "../../lib/db";
import type { ControllerAlerta } from "../../lib/supabase";

// ── Tipos ─────────────────────────────────────────────────────
interface Fazenda    { id: string; nome: string; municipio?: string; estado?: string; area_total_ha?: number; raccolto_acesso?: boolean }
interface AnoSafra   { id: string; descricao: string; fazenda_id: string }
interface Ciclo      { id: string; fazenda_id: string; ano_safra_id: string; cultura: string; descricao: string; preco_esperado_sc?: number | null }
interface Plantio    { id: string; fazenda_id: string; ciclo_id: string; area_ha: number; produtividade_esperada: number }
interface Colheita   { id: string; fazenda_id: string; ciclo_id: string; area_ha?: number; sacas_liquidas?: number; peso_liquido_kg?: number }
interface ArrPag     { id: string; fazenda_id: string; ano_safra_id: string; sacas_previstas: number; commodity: string; status: string }
interface Lancamento { id: string; fazenda_id: string; tipo: string; moeda: string; status: string; valor: number; sacas?: number; cultura_barter?: string; data_vencimento: string; descricao: string; categoria?: string; cotacao_usd?: number; ano_safra_id?: string; data_baixa?: string; auto?: boolean }
interface Contrato   { id: string; fazenda_id: string; produto: string; quantidade_sc: number; entregue_sc: number; status: string; is_arrendamento?: boolean; preco?: number; moeda?: string; safra?: string; comprador?: string; numero?: string; dado_em_cessao?: boolean; cessao_fornecedor_nome?: string; cessao_data?: string; data_pagamento?: string; data_entrega?: string; ciclo_id?: string; ano_safra_id?: string; modalidade?: string; tipo?: string; produtor_nome?: string }
interface CulturaBI  { id: string; nome: string; fator_conversao_kg: number | null }
interface CessaoDebito { id: string; contrato_id: string; lancamento_id: string; valor_cessao: number }

// ── Tipos para aba Custos & Insumos (operações de campo) ──────
interface BiTalhao    { id: string; nome: string }
interface BiPulvOp    { id: string; ciclo_id: string; talhao_id?: string | null; area_ha: number }
interface BiPulvItem  { id: string; pulverizacao_id: string; nome_produto: string; dose_ha: number; unidade: string; total_consumido: number; valor_unitario: number; custo_ha: number; custo_total: number }
interface BiAdubOp    { id: string; ciclo_id: string; talhao_id?: string | null; area_ha: number }
interface BiAdubItem  { id: string; adubacao_id: string; produto_nome?: string; dose_kg_ha?: number; quantidade_kg?: number; valor_unitario?: number; custo_total?: number }
interface BiCSoloOp   { id: string; ciclo_id: string; talhao_id?: string | null; area_ha: number }
interface BiCSoloItem { id: string; correcao_id: string; produto_nome?: string; dose_ton_ha?: number; quantidade_ton?: number; valor_unitario?: number; custo_total?: number }
interface BiPlantioFull { id: string; ciclo_id: string; talhao_id: string; variedade?: string; area_ha: number; dose_kg_ha?: number; quantidade_kg?: number; custo_sementes?: number }

interface ConsumoItemBi {
  produto: string;
  grupo: string;
  talhao_id?: string | null;
  talhao_nome?: string;
  area_ha: number;
  quantidade: number;
  unidade: string;
  valor_unitario: number;
  custo_ha: number;
  custo_total: number;
}

interface ParcelaDetalhe { id: string; num_parcela: number; data_vencimento: string; amortizacao: number; juros: number; despesas_acessorios: number; valor_parcela: number; saldo_devedor: number; status: string }
interface GarantiaDetalhe { id: string; tipo_garantia?: string; tipo_bem?: string; descricao: string; valor_avaliacao?: number }
interface ContratoDetalhe {
  id: string; descricao: string; credor: string; numero_documento?: string;
  tipo: string; moeda: string; taxa_juros_aa?: number; linha_credito?: string;
  data_contrato: string; periodicidade_meses?: number; valor_financiado: number; valor_cotacao?: number;
  produtorNome?: string;
  parcelas: ParcelaDetalhe[];
  garantias: GarantiaDetalhe[];
}

// Tipos para a aba Evolução de Endividamento
interface CFContrato { id: string; descricao: string; credor: string; tipo?: string; moeda: string; data_contrato: string; valor_total?: number; cotacao_usd?: number; linha_credito?: string; status?: string }
interface CFParcela  { id: string; contrato_id: string; num_parcela: number; data_vencimento: string; amortizacao: number; juros: number; despesas_acessorios: number; valor_parcela: number; saldo_devedor: number; status: string }

// Grupos de categoria para filtro de saldo
const CF_GRUPOS = [
  { key: "linhas_credito",             label: "Linhas de Crédito",         cor: "#14532D", bg: "#ECFDF5", tipos: ["custeio","investimento","securitizacao","cpr","egf","pronaf","outros"] },
  { key: "consorcio_contemplado",      label: "Consórcio Contemplado",      cor: "#7C3AED", bg: "#F5F3FF", tipos: ["consorcio_contemplado"] },
  { key: "consorcio_nao_contemplado",  label: "Consórcio Não Contemplado",  cor: "#6B21A8", bg: "#FAF5FF", tipos: ["consorcio_nao_contemplado"] },
  { key: "compra_imovel",              label: "Compra de Imóvel / Terra",   cor: "#C9921B", bg: "#FBF3E0", tipos: ["compra_terra","compra_imovel"] },
] as const;
type GrupoKey = typeof CF_GRUPOS[number]["key"];

// ── Formatadores ──────────────────────────────────────────────
const fmtR  = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
const fmtR2 = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtN  = (v: number, d = 1) => v.toLocaleString("pt-BR", { minimumFractionDigits: d, maximumFractionDigits: d });
const hoje  = () => new Date().toISOString().slice(0, 10);
const dias  = (n: number) => { const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
const fmtDt = (s?: string | null) => s ? s.split("-").reverse().join("/") : "—";
const pct   = (v: number, total: number) => total > 0 ? Math.min(100, Math.max(0, (v / total) * 100)) : 0;

// ── Helpers de unidade de volume (contratos armazenam em kg) ─────────────
// quantidade_sc em contratos = kg; arrendamento_pagamentos.sacas_previstas = sc

// Mapa de culturas: nome → { fator_conversao_kg }. Fallback por string matching.
type CulturaMap = Map<string, CulturaBI>;

function unidProd(produto: string, cultMap?: CulturaMap): { div: number; label: string } {
  // 1. Lookup exato pelo nome da cultura (case-insensitive)
  if (cultMap) {
    const c = cultMap.get(produto) ?? [...cultMap.values()].find(c => c.nome.toLowerCase() === produto.toLowerCase());
    if (c && c.fator_conversao_kg) {
      return { div: c.fator_conversao_kg, label: c.fator_conversao_kg === 15 ? "@" : c.fator_conversao_kg === 1 ? "kg" : "sc" };
    }
  }
  // 2. Fallback: string matching para garantir retrocompatibilidade
  const p = produto.toLowerCase();
  if (p.includes("algodão") || p.includes("algodao")) return { div: 15, label: "@" };
  return { div: 60, label: "sc" };
}
// Converte kg → sc ou @ conforme produto; retorna { valor, label, kg }
function kgParaVol(kg: number, produto: string, cultMap?: CulturaMap): { valor: number; label: string; kg: number } {
  const { div, label } = unidProd(produto, cultMap);
  return { valor: kg / div, label, kg };
}
// Soma contratos em unidades convertidas
function somarContratos(lista: { quantidade_sc?: number | null; produto: string }[], cultMap?: CulturaMap): { valor: number; kg: number; label: string } {
  let totalKg = 0, totalConv = 0;
  for (const c of lista) {
    const kg = c.quantidade_sc || 0;
    totalKg += kg;
    totalConv += kg / unidProd(c.produto, cultMap).div;
  }
  const label = lista.length > 0 ? unidProd(lista[0].produto, cultMap).label : "sc";
  return { valor: totalConv, kg: totalKg, label };
}

// ── Helpers ───────────────────────────────────────────────────
const aplicarMascara = (raw: string): string => {
  const nums = raw.replace(/\D/g, "");
  if (!nums) return "";
  return (Number(nums) / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};
const desmascarar = (masked: string): number =>
  Number(masked.replace(/\./g, "").replace(",", ".")) || 0;

// Agrupa cultura por commodity genérico (retrocompatibilidade com painéis existentes).
// Para painéis que precisam de agrupamento exato, usar diretamente ciclo.cultura.
function culturaToCommodity(cultura: string, cultMap?: CulturaMap): string {
  // Com mapa: retorna o próprio nome da cultura (sem agrupamento forçado)
  if (cultMap && cultMap.has(cultura)) return cultura;
  // Fallback: agrupa por keyword para retrocompatibilidade
  const c = cultura.toLowerCase();
  if (c.includes("soja"))                                    return "Soja";
  if (c.includes("milho"))                                   return "Milho";
  if (c.includes("algodao") || c.includes("algodão"))        return "Algodão";
  return cultura; // retorna próprio nome se não reconhecido
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
  // Juros e encargos bancários = custo financeiro real (despesa, não movimento de caixa)
  if (c.includes("juros") || c.includes("encargo") || c.includes("iof"))            return "Encargos Financeiros";
  // Amortizações e captações = movimentos de caixa, NÃO são custo — excluir
  if (c.startsWith("pagamento de") || c.startsWith("captação de") || c.startsWith("captacao de")) return "__amortizacao__";
  return "Outros";
}

const BENCHMARK: Record<string, { sc_ha: number; custo_ha: number; unidade: string }> = {
  Soja:    { sc_ha: 62,  custo_ha: 5800, unidade: "sc/ha" },
  Milho:   { sc_ha: 110, custo_ha: 3500, unidade: "sc/ha" },
  Algodão: { sc_ha: 250, custo_ha: 8500, unidade: "@/ha"  },
};

const GRUPOS_CUSTO = ["Sementes", "Fertilizantes", "Defensivos", "Operações", "Arrendamento", "Mão de Obra", "Encargos Financeiros", "Outros"] as const;
const CORES_GRUPO: Record<string, string> = {
  Sementes: "#C9921B", Fertilizantes: "#1A4870", Defensivos: "#E24B4A",
  Operações: "#378ADD", Arrendamento: "#9B59B6", "Mão de Obra": "#16A34A",
  "Encargos Financeiros": "#EF9F27", Outros: "#888",
};

// ── Componentes visuais ───────────────────────────────────────
function BarraGraos({ producao, arrSacas, barterSacas, fixadoSacas, dividaSacas }: {
  producao: number; arrSacas: number; barterSacas: number; fixadoSacas: number; dividaSacas: number;
}) {
  if (producao <= 0) return <span style={{ fontSize: 11, color: "#aaa" }}>Sem produção projetada</span>;
  const livre = Math.max(0, producao - arrSacas - barterSacas - fixadoSacas);
  const p = (v: number) => Math.max(0, Math.min(100, (v / producao) * 100));
  return (
    <div>
      {/* Barra de comprometimento físico */}
      <div style={{ display: "flex", height: 14, borderRadius: 7, overflow: "hidden", gap: 1, background: "#EEF1F6" }}>
        {arrSacas    > 0 && <div style={{ width: `${p(arrSacas)}%`,    background: "#E24B4A" }} title={`Arrendamento: ${fmtN(arrSacas, 0)} sc`} />}
        {barterSacas > 0 && <div style={{ width: `${p(barterSacas)}%`, background: "#EF9F27" }} title={`Barter: ${fmtN(barterSacas, 0)} sc`} />}
        {fixadoSacas > 0 && <div style={{ width: `${p(fixadoSacas)}%`, background: "#378ADD" }} title={`Fixado: ${fmtN(fixadoSacas, 0)} sc`} />}
        {livre       > 0 && <div style={{ width: `${p(livre)}%`,       background: "#16A34A" }} title={`Livre: ${fmtN(livre, 0)} sc`} />}
      </div>
      {/* Barra de dívida sobreposta (indicador separado) */}
      {dividaSacas > 0 && (
        <div style={{ marginTop: 4, display: "flex", height: 6, borderRadius: 4, overflow: "hidden", gap: 1, background: "#F3EBF8" }}>
          <div style={{ width: `${p(Math.min(dividaSacas, producao))}%`, background: "#9B59B6" }} title={`Sacas para quitar dívidas: ${fmtN(dividaSacas, 0)} sc`} />
        </div>
      )}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 8 }}>
        {[
          { label: "Arrendamento (físico)", v: arrSacas,    bg: "#E24B4A" },
          { label: "Barter (físico)",       v: barterSacas, bg: "#EF9F27" },
          { label: "Fixado (contratos)",    v: fixadoSacas, bg: "#378ADD" },
          { label: "Livre",                 v: livre,        bg: "#16A34A" },
        ].filter(x => x.v > 0).map(x => (
          <span key={x.label} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, color: "#555" }}>
            <span style={{ width: 8, height: 8, borderRadius: 2, background: x.bg, display: "inline-block" }} />
            {x.label}: <strong>{fmtN(x.v, 0)} sc</strong>
          </span>
        ))}
        {dividaSacas > 0 && (
          <span style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, color: "#555" }}>
            <span style={{ width: 8, height: 6, borderRadius: 2, background: "#9B59B6", display: "inline-block" }} />
            Dívidas → <strong style={{ color: "#9B59B6" }}>{fmtN(dividaSacas, 0)} sc equiv.</strong>
            <span style={{ fontSize: 10, color: "#888" }}>(barra inferior)</span>
          </span>
        )}
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

type Aba = "painel" | "producao" | "custos" | "comercializacao" | "financeiro" | "sensibilidade" | "cambio" | "terceiros" | "evolucao" | "controller";

// ── Controller: constantes ────────────────────────────────────
type Severidade = ControllerAlerta["severidade"];
type Categoria  = ControllerAlerta["categoria"];
const SEV_COR: Record<Severidade, string>   = { critico: "#E24B4A", alto: "#EF9F27", medio: "#378ADD", baixo: "#888" };
const SEV_BG:  Record<Severidade, string>   = { critico: "#FEF2F2", alto: "#FFF7ED", medio: "#EFF6FF", baixo: "#F9FAFB" };
const SEV_LABEL: Record<Severidade, string> = { critico: "Crítico", alto: "Alto", medio: "Médio", baixo: "Baixo" };
const CAT_ICONE: Record<Categoria,  string> = { Fiscal: "📄", Financeiro: "💰", Contratos: "📋", Lavoura: "🌱", Cadastros: "🗂️", Estoque: "📦", Arrendamentos: "🏡" };

// ── Componente principal ──────────────────────────────────────
export default function BI() {
  const { fazendaId, userRole, logoCliente } = useAuth();
  const router = useRouter();

  const [fazenda,     setFazenda]     = useState<Fazenda | null>(null);
  const [anosSafra,   setAnosSafra]   = useState<AnoSafra[]>([]);
  const [ciclos,      setCiclos]      = useState<Ciclo[]>([]);
  const [plantios,    setPlantios]    = useState<Plantio[]>([]);
  const [colheitas,   setColheitas]   = useState<Colheita[]>([]);
  const [arrPags,     setArrPags]     = useState<ArrPag[]>([]);
  const [lancamentos,   setLancamentos]   = useState<Lancamento[]>([]);
  const [contratos,     setContratos]     = useState<Contrato[]>([]);
  const [cessaoDebitos, setCessaoDebitos] = useState<CessaoDebito[]>([]);
  const [precos,      setPrecos]      = useState<PrecosData | null>(null);
  const [culturasBi,  setCulturasBi]  = useState<CulturaBI[]>([]);

  const [loading,     setLoading]     = useState(true);
  const [aba,         setAba]         = useState<Aba>("painel");

  // ── Controller state ─────────────────────────────────────────
  const [alertas,           setAlertas]           = useState<ControllerAlerta[]>([]);
  const [alertasLoading,    setAlertasLoading]    = useState(false);
  const [executandoChecks,  setExecutandoChecks]  = useState(false);
  const [checkMsg,          setCheckMsg]          = useState("");
  const [filtroSev,         setFiltroSev]         = useState<Severidade | "todos">("todos");
  const [filtroCatCtrl,     setFiltroCatCtrl]     = useState<Categoria | "todos">("todos");
  const [mostrarResolvidos, setMostrarResolvidos] = useState(false);

  // ── Filtros ──────────────────────────────────────────────────
  const [filtroAnoSafraId, setFiltroAnoSafraId] = useState("");
  const [filtroCicloIds,   setFiltroCicloIds]   = useState<Set<string>>(new Set());
  const [commodity,        setCommodity]         = useState<"Soja" | "Milho" | "Algodão">("Soja");
  // Câmbio/USD: filtro por ano civil independente do filtro de safra
  const [filtroCambioAno,  setFiltroCambioAno]  = useState<string>(String(new Date().getFullYear()));

  // ── Comercialização — filtros e compradores expandidos ──────
  const [biComCultura, setBiComCultura] = useState("");
  const [comprExpand, setComprExpand] = useState<Set<string>>(new Set());

  // ── Recursos de Terceiros — filtro e drill-down ──────────────
  const [rtDrillLabel,   setRtDrillLabel]   = useState<string | null>(null);
  const [rtFiltroLabel,  setRtFiltroLabel]  = useState("todos");
  const [exportandoRT,   setExportandoRT]   = useState(false);
  const [rtLancModal,    setRtLancModal]    = useState<Lancamento | null>(null);
  const [rtContratoModal, setRtContratoModal] = useState<ContratoDetalhe | null>(null);
  const [loadingContrato,  setLoadingContrato]  = useState(false);
  const [custoGrupoAtivo, setCustoGrupoAtivo] = useState<string | null>(null);
  const [custoPorTalhao, setCustoPorTalhao]   = useState(false);
  const [opsLoaded,      setOpsLoaded]        = useState(false);
  const [opsLoading,     setOpsLoading]       = useState(false);
  const [talhoes,        setTalhoes]          = useState<BiTalhao[]>([]);
  const [pulvOps,        setPulvOps]          = useState<BiPulvOp[]>([]);
  const [pulvItens,      setPulvItens]        = useState<BiPulvItem[]>([]);
  const [adubOps,        setAdubOps]          = useState<BiAdubOp[]>([]);
  const [adubItens,      setAdubItens]        = useState<BiAdubItem[]>([]);
  const [csOps,          setCsOps]            = useState<BiCSoloOp[]>([]);
  const [csItens,        setCsItens]          = useState<BiCSoloItem[]>([]);
  const [plantiosFull,   setPlantiosFull]     = useState<BiPlantioFull[]>([]);

  // ── Evolução de Endividamento + Recursos de Terceiros (contratos formais) ─
  const [cfContratos,     setCfContratos]     = useState<CFContrato[]>([]);
  const [cfParcelas,      setCfParcelas]      = useState<CFParcela[]>([]);
  const [cfLoading,       setCfLoading]       = useState(false);
  const [cfGruposFiltro,  setCfGruposFiltro]  = useState<Set<GrupoKey>>(
    new Set(CF_GRUPOS.map(g => g.key) as GrupoKey[])
  );

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
    const [fazR, safR, cicR, plaR, colR, arrR, lanR, conR, cesR, precR] = await Promise.allSettled([
      supabase.from("fazendas").select("id,nome,municipio,estado,area_total_ha,raccolto_acesso").eq("id", fazendaId).single(),
      supabase.from("anos_safra").select("*").eq("fazenda_id", fazendaId).order("descricao"),
      supabase.from("ciclos").select("id,fazenda_id,ano_safra_id,cultura,descricao,preco_esperado_sc").eq("fazenda_id", fazendaId),
      supabase.from("plantios").select("id,fazenda_id,ciclo_id,area_ha,produtividade_esperada").eq("fazenda_id", fazendaId),
      supabase.from("colheitas").select("id,fazenda_id,ciclo_id,area_ha,sacas_liquidas,peso_liquido_kg").eq("fazenda_id", fazendaId),
      supabase.from("arrendamento_pagamentos").select("id,fazenda_id,ano_safra_id,sacas_previstas,commodity,status").eq("fazenda_id", fazendaId),
      supabase.from("lancamentos").select("id,fazenda_id,tipo,moeda,status,valor,sacas,cultura_barter,data_vencimento,data_baixa,descricao,categoria,cotacao_usd,ano_safra_id,auto").eq("fazenda_id", fazendaId),
      supabase.from("contratos").select("id,fazenda_id,produto,quantidade_sc,entregue_sc,status,is_arrendamento,preco,moeda,safra,comprador,numero,dado_em_cessao,cessao_fornecedor_nome,cessao_data,data_pagamento,data_entrega,ciclo_id,ano_safra_id,modalidade,tipo,produtor_nome").eq("fazenda_id", fazendaId),
      supabase.from("contrato_cessao_debitos").select("id,contrato_id,lancamento_id,valor_cessao").eq("fazenda_id", fazendaId),
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
    if (cesR.status === "fulfilled") setCessaoDebitos((cesR.value.data ?? []) as CessaoDebito[]);
    if (precR.status === "fulfilled") setPrecos(precR.value as PrecosData);
    // Carrega culturas para lookup preciso de fator_conversao_kg
    supabase.from("culturas").select("id,nome,fator_conversao_kg")
      .eq("fazenda_id", fazendaId).eq("ativa", true)
      .then(({ data }) => setCulturasBi((data ?? []) as CulturaBI[]));
    setLoading(false);
  }, [fazendaId]);

  useEffect(() => {
    if (userRole === "raccotlo" && fazendaId) carregar();
  }, [userRole, fazendaId, carregar]);

  const carregarAlertas = useCallback(async () => {
    if (!fazendaId) return;
    setAlertasLoading(true);
    try { setAlertas(await listarAlertasController(fazendaId)); } catch (_) { /* ignora */ }
    finally { setAlertasLoading(false); }
  }, [fazendaId]);

  useEffect(() => {
    if (aba === "controller" && fazendaId) carregarAlertas();
  }, [aba, fazendaId, carregarAlertas]);

  const carregarCF = useCallback(async () => {
    if (!fazendaId) return;
    setCfLoading(true);
    try {
      const { data: cs } = await supabase
        .from("contratos_financeiros")
        .select("id,descricao,credor,tipo,moeda,data_contrato,valor_total,cotacao_usd,linha_credito,status")
        .eq("fazenda_id", fazendaId);
      const ids = (cs ?? []).map((c: Record<string, unknown>) => c.id as string);
      const { data: ps } = ids.length > 0
        ? await supabase
            .from("parcelas_pagamento")
            .select("id,contrato_id,num_parcela,data_vencimento,amortizacao,juros,despesas_acessorios,valor_parcela,saldo_devedor,status")
            .in("contrato_id", ids)
        : { data: [] as CFParcela[] };
      setCfContratos((cs ?? []) as CFContrato[]);
      setCfParcelas((ps ?? []) as CFParcela[]);
    } catch { /* ignora */ } finally { setCfLoading(false); }
  }, [fazendaId]);

  useEffect(() => {
    if (fazendaId && userRole === "raccotlo") carregarCF();
  }, [fazendaId, userRole, carregarCF]);

  useEffect(() => {
    if ((aba === "evolucao" || aba === "terceiros" || aba === "cambio") && fazendaId) carregarCF();
  }, [aba, fazendaId, carregarCF]);

  const carregarOps = useCallback(async () => {
    if (!fazendaId) return;
    setOpsLoading(true);
    const [talR, pulvOpR, pulvItR, adubOpR, adubItR, csOpR, csItR, plFulR] = await Promise.allSettled([
      supabase.from("talhoes").select("id,nome").eq("fazenda_id", fazendaId),
      supabase.from("pulverizacoes").select("id,ciclo_id,talhao_id,area_ha").eq("fazenda_id", fazendaId),
      supabase.from("pulverizacao_itens").select("id,pulverizacao_id,nome_produto,dose_ha,unidade,total_consumido,valor_unitario,custo_ha,custo_total").eq("fazenda_id", fazendaId),
      supabase.from("adubacoes_base").select("id,ciclo_id,talhao_id,area_ha").eq("fazenda_id", fazendaId),
      supabase.from("adubacoes_base_itens").select("id,adubacao_id,produto_nome,dose_kg_ha,quantidade_kg,valor_unitario,custo_total").eq("fazenda_id", fazendaId),
      supabase.from("correcoes_solo").select("id,ciclo_id,talhao_id,area_ha").eq("fazenda_id", fazendaId),
      supabase.from("correcoes_solo_itens").select("id,correcao_id,produto_nome,dose_ton_ha,quantidade_ton,valor_unitario,custo_total").eq("fazenda_id", fazendaId),
      supabase.from("plantios").select("id,ciclo_id,talhao_id,variedade,area_ha,dose_kg_ha,quantidade_kg,custo_sementes").eq("fazenda_id", fazendaId),
    ]);
    if (talR.status    === "fulfilled") setTalhoes((talR.value.data ?? []) as BiTalhao[]);
    if (pulvOpR.status === "fulfilled") setPulvOps((pulvOpR.value.data ?? []) as BiPulvOp[]);
    if (pulvItR.status === "fulfilled") setPulvItens((pulvItR.value.data ?? []) as BiPulvItem[]);
    if (adubOpR.status === "fulfilled") setAdubOps((adubOpR.value.data ?? []) as BiAdubOp[]);
    if (adubItR.status === "fulfilled") setAdubItens((adubItR.value.data ?? []) as BiAdubItem[]);
    if (csOpR.status   === "fulfilled") setCsOps((csOpR.value.data ?? []) as BiCSoloOp[]);
    if (csItR.status   === "fulfilled") setCsItens((csItR.value.data ?? []) as BiCSoloItem[]);
    if (plFulR.status  === "fulfilled") setPlantiosFull((plFulR.value.data ?? []) as BiPlantioFull[]);
    setOpsLoaded(true);
    setOpsLoading(false);
  }, [fazendaId]);

  useEffect(() => {
    if (aba === "custos" && fazendaId && !opsLoaded && !opsLoading) carregarOps();
  }, [aba, fazendaId, opsLoaded, opsLoading, carregarOps]);

  async function executarVerificacoes() {
    if (!fazendaId) return;
    setExecutandoChecks(true);
    setCheckMsg("Executando verificações…");
    try {
      await rodarChecksBI(fazendaId);
      await carregarAlertas();
      setCheckMsg("Verificações concluídas.");
      setTimeout(() => setCheckMsg(""), 3000);
    } catch (e: unknown) {
      setCheckMsg("Erro: " + (e instanceof Error ? e.message : String(e)));
    } finally { setExecutandoChecks(false); }
  }

  async function ackAlerta(id: string) {
    await reconhecerAlerta(id, "sistema");
    setAlertas(prev => prev.map(a => a.id === id ? { ...a, acknowledged_at: new Date().toISOString(), acknowledged_by: "sistema" } : a));
  }

  async function fecharAlerta(id: string) {
    await resolverAlerta(id);
    setAlertas(prev => prev.filter(a => a.id !== id));
  }

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

  // Mapa de culturas para lookup preciso de unidade/fator (evita string matching)
  const cultMap: CulturaMap = new Map(culturasBi.map(c => [c.nome, c]));

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

  // ── KPIs financeiros (lançamentos filtrados pelo ano safra selecionado) ─
  const hj  = hoje();
  const d30 = dias(30);
  const d60 = dias(60);
  const d90 = dias(90);

  const cpVencidas  = lancamentosFiltrados.filter(l => l.tipo === "pagar"   && l.status !== "baixado" && l.data_vencimento < hj).reduce((s, l) => s + l.valor, 0);
  const cpA30       = lancamentosFiltrados.filter(l => l.tipo === "pagar"   && l.status !== "baixado" && l.data_vencimento >= hj && l.data_vencimento <= d30).reduce((s, l) => s + l.valor, 0);
  const crA30       = lancamentosFiltrados.filter(l => l.tipo === "receber" && l.status !== "baixado" && l.data_vencimento >= hj && l.data_vencimento <= d30).reduce((s, l) => s + l.valor, 0);
  const totalCP     = lancamentosFiltrados.filter(l => l.tipo === "pagar"   && l.status !== "baixado").reduce((s, l) => s + l.valor, 0);
  const totalCR     = lancamentosFiltrados.filter(l => l.tipo === "receber" && l.status !== "baixado").reduce((s, l) => s + l.valor, 0);
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
                   : comm === "Soja"  ? (precos?.soja?.brl ?? 0)
                   : comm === "Milho" ? (precos?.milho?.brl ?? 0)
                   : (precos?.algodao?.brl ?? 0);
    const dividaBrl     = lancamentos.filter(l => l.tipo === "pagar" && l.moeda === "BRL" && l.status !== "baixado").reduce((s, l) => s + l.valor, 0);
    const dividaUsdBrl  = lancamentos.filter(l => l.tipo === "pagar" && l.moeda === "USD" && l.status !== "baixado").reduce((s, l) => s + l.valor * (l.cotacao_usd ?? 5.1), 0);
    const dividaSacas   = precoBrl > 0 ? (dividaBrl + dividaUsdBrl) / precoBrl : 0;
    // comprPct = apenas comprometimento físico (arrendamento + barter + contratos fixados)
    const comprFisico   = arrSacas + barterSacas + fixadoSacas;
    const comprPct      = producao > 0 ? Math.min(100, (comprFisico / producao) * 100) : 0;
    // comprPctTotal inclui dívida convertida — usado para alertas de risco
    const comprPctTotal = producao > 0 ? Math.min(100, ((comprFisico + dividaSacas) / producao) * 100) : 0;
    return { producao, arrSacas, barterSacas, fixadoSacas, dividaSacas, comprPct, comprPctTotal, precoBrl };
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
    if (posSoja.comprPct > 95)          diagnostico.push({ tipo: "crit", msg: `Soja ${fmtN(posSoja.comprPct, 0)}% comprometida fisicamente — risco real de déficit` });
    else if (posSoja.comprPctTotal > 90) diagnostico.push({ tipo: "crit", msg: `Soja: dívidas + compromissos = ${fmtN(posSoja.comprPctTotal, 0)}% da produção — liquidez crítica` });
    else if (posSoja.comprPct > 70)     diagnostico.push({ tipo: "warn", msg: `Soja ${fmtN(posSoja.comprPct, 0)}% comprometida — acompanhar posição de fixação` });
    else if (posSoja.comprPct < 25)     diagnostico.push({ tipo: "warn", msg: `Soja apenas ${fmtN(posSoja.comprPct, 0)}% comprometida fisicamente — considerar fixação de mais volume` });
    else                                 diagnostico.push({ tipo: "ok",   msg: `Posição de soja equilibrada: ${fmtN(posSoja.comprPct, 0)}% comprometido (${fmtN(posSoja.comprPctTotal, 0)}% c/ dívidas)` });
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
  const precoBrlSoja  = precos?.soja?.brl ?? 128;
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

  // ── Recursos de Terceiros ─────────────────────────────────────
  const RT_TERMOS = ["cpr","empréstimo","emprestimo","custeio","egf","pronaf","financiamento","crédito rural","credito rural","custeio agricola","bco brasil","banco do brasil","sicoob","cresol","rabobank","financ","consórcio","consorcio","compra terra","compra de terra","compra imóvel","compra imovel","compra de imóvel","compra de imovel"];
  const JUROS_TERMOS = ["juro","encargo financ","iof","mora "];

  const textoLanc = (l: Lancamento) => ((l.categoria ?? "") + " " + l.descricao).toLowerCase();
  const isRT       = (l: Lancamento) => RT_TERMOS.some(k => textoLanc(l).includes(k));
  const isJuros    = (l: Lancamento) => JUROS_TERMOS.some(k => textoLanc(l).includes(k));
  // Captação = CR que menciona recurso de terceiro
  const isCaptacao = (l: Lancamento) => l.tipo === "receber" && isRT(l);
  // Pagamento de juros
  const isJurosPgto = (l: Lancamento) => l.tipo === "pagar" && isJuros(l);
  // Pagamento de principal = CP que menciona recurso, mas não é só juros
  const isPrincipal = (l: Lancamento) => l.tipo === "pagar" && isRT(l) && !isJurosPgto(l);

  const tipoRT = (l: Lancamento): string => {
    const s = textoLanc(l);
    if (s.includes("cpr"))                                                                  return "CPR";
    if (s.includes("custeio"))                                                              return "Custeio";
    if (s.includes("egf"))                                                                  return "EGF";
    if (s.includes("pronaf"))                                                               return "PRONAF";
    if (s.includes("emprestimo") || s.includes("empréstimo"))                              return "Empréstimo";
    if (s.includes("financiamento") || s.includes("financ"))                               return "Financiamento";
    if (s.includes("consórcio contempl") || s.includes("consorcio contempl"))              return "Consórcio Contemplado";
    if (s.includes("consórcio") || s.includes("consorcio"))                               return "Consórcio Não Contemplado";
    if (s.includes("compra terra") || s.includes("compra de terra") ||
        s.includes("compra imóvel") || s.includes("compra imovel") ||
        s.includes("compra de imóvel") || s.includes("compra de imovel"))                  return "Compra de Terra / Imóvel";
    return "Outros";
  };

  // Agrega por ano safra ou por ano calendário
  type RTAnoBucket = { label: string; captado: number; pago: number; juros: number; jurosPend: number; saldo: number; area: number };

  // ── Mapa contrato_id → tipo (para lookup nas parcelas) ──────
  const cfTipoMap = new Map<string, string>(cfContratos.map(c => [c.id, c.tipo ?? "outros"]));

  const rtPorAno = (() => {
    // Usa cfContratos + cfParcelas como fonte primária (autoridade)
    const mapa = new Map<string, RTAnoBucket>();
    const getBucket = (label: string, area = 0): RTAnoBucket => {
      if (!mapa.has(label)) mapa.set(label, { label, captado: 0, pago: 0, juros: 0, jurosPend: 0, saldo: 0, area });
      return mapa.get(label)!;
    };
    const area = fazenda?.area_total_ha ?? 0;
    for (const c of cfContratos) {
      if (c.status === "cancelado") continue;
      const ano = (c.data_contrato ?? "").slice(0, 4);
      if (!ano) continue;
      const b = getBucket(ano, area);
      const valBrl = c.moeda === "USD" ? (c.valor_total ?? 0) * (c.cotacao_usd ?? 5.0) : (c.valor_total ?? 0);
      b.captado += valBrl;
    }
    for (const p of cfParcelas) {
      const ano = p.data_vencimento.slice(0, 4);
      if (!ano) continue;
      const b = getBucket(ano);
      if (p.status === "pago") {
        b.pago  += p.amortizacao ?? 0;
        b.juros += p.juros ?? 0;
      } else {
        b.jurosPend += p.juros ?? 0;
      }
    }
    // Complementa com lançamentos RT que não vieram de CF (keyword matching)
    const cfLancDescs = new Set(cfContratos.map(c => c.descricao.toLowerCase()));
    for (const l of lancamentosFiltrados) {
      // Pula lançamentos que já estão cobertos pelos contratos CF importados
      if (l.auto) continue;
      let label: string;
      if (l.ano_safra_id) {
        const safra = anosSafra.find(a => a.id === l.ano_safra_id);
        label = safra ? safra.descricao : l.data_vencimento.slice(0, 4);
      } else {
        label = l.data_vencimento.slice(0, 4);
      }
      const b = getBucket(label, area);
      if (isCaptacao(l))          b.captado   += l.valor;
      if (isPrincipal(l) && l.status === "baixado") b.pago  += l.valor;
      if (isJurosPgto(l) && l.status === "baixado") b.juros += l.valor;
      if (isJurosPgto(l) && l.status !== "baixado") b.jurosPend += l.valor;
    }
    void cfLancDescs;
    // Recalcula saldo
    for (const b of mapa.values()) b.saldo = b.captado - b.pago;
    return Array.from(mapa.values()).sort((a, b) => b.label.localeCompare(a.label));
  })();

  // Totais globais de recursos de terceiros
  const rtTotalCaptado  = rtPorAno.reduce((s, b) => s + b.captado, 0);
  const rtTotalPago     = rtPorAno.reduce((s, b) => s + b.pago, 0);
  const rtTotalJuros    = rtPorAno.reduce((s, b) => s + b.juros, 0);
  const rtJurosPend     = rtPorAno.reduce((s, b) => s + b.jurosPend, 0);
  const rtSaldoDevedor  = rtTotalCaptado - rtTotalPago;
  const areaTotal       = fazenda?.area_total_ha ?? 0;
  const rtJurosHa       = areaTotal > 0 ? (rtTotalJuros + rtJurosPend) / areaTotal : 0;

  // Por tipo de operação — calculado dentro do IIFE do RT (veja abaixo) para respeitar o filtro de ano
  const TIPOS_RT = ["CPR", "Custeio", "EGF", "Empréstimo", "Financiamento", "PRONAF", "Consórcio Contemplado", "Consórcio Não Contemplado", "Compra de Terra / Imóvel", "Outros"];

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
    { label: "Vencidos",  cp: cpVencidas, cr: lancamentosFiltrados.filter(l => l.tipo === "receber" && l.status !== "baixado" && l.data_vencimento < hj).reduce((s, l) => s + l.valor, 0) },
    { label: "0–30 dias", cp: cpA30,      cr: crA30 },
    { label: "31–60 dias",cp: lancamentosFiltrados.filter(l => l.tipo === "pagar"   && l.status !== "baixado" && l.data_vencimento > d30 && l.data_vencimento <= d60).reduce((s, l) => s + l.valor, 0),
                          cr: lancamentosFiltrados.filter(l => l.tipo === "receber" && l.status !== "baixado" && l.data_vencimento > d30 && l.data_vencimento <= d60).reduce((s, l) => s + l.valor, 0) },
    { label: "61–90 dias",cp: lancamentosFiltrados.filter(l => l.tipo === "pagar"   && l.status !== "baixado" && l.data_vencimento > d60 && l.data_vencimento <= d90).reduce((s, l) => s + l.valor, 0),
                          cr: lancamentosFiltrados.filter(l => l.tipo === "receber" && l.status !== "baixado" && l.data_vencimento > d60 && l.data_vencimento <= d90).reduce((s, l) => s + l.valor, 0) },
  ];
  const maxLiq = Math.max(...liquidez90.map(l => Math.max(l.cp, l.cr)), 1);

  // ── Abas ──────────────────────────────────────────────────────
  const alertasCount = lancamentosFiltrados.filter(l => l.tipo === "pagar" && l.status !== "baixado" && l.data_vencimento < hj).length;
  const usdDescasados = (() => {
    // Datas com descasamento USD (mais CP do que CR em USD)
    const cpUsd = lancamentosFiltrados.filter(l => l.tipo === "pagar" && l.moeda === "USD" && l.status !== "baixado");
    const crUsd = lancamentosFiltrados.filter(l => l.tipo === "receber" && l.moeda === "USD" && l.status !== "baixado");
    const datas = new Set([...cpUsd.map(l => l.data_vencimento), ...crUsd.map(l => l.data_vencimento)]);
    let cnt = 0;
    for (const dt of datas) {
      const cp = cpUsd.filter(l => l.data_vencimento === dt).reduce((s, l) => s + l.valor, 0);
      const cr = crUsd.filter(l => l.data_vencimento === dt).reduce((s, l) => s + l.valor, 0);
      if (cp > cr) cnt++;
    }
    return cnt;
  })();

  const cessoesPendentes = contratos.filter(c => c.dado_em_cessao && c.status !== "cancelado").length;

  const alertasAtivos = alertas.filter(a => !a.resolved_at).length;
  const alertasCriticos = alertas.filter(a => a.severidade === "critico" && !a.resolved_at).length;

  const ABAS: { key: Aba; label: string; badge?: number }[] = [
    { key: "painel",          label: "Painel Executivo" },
    { key: "producao",        label: "Produção" },
    { key: "custos",          label: "Custos & Insumos" },
    { key: "comercializacao", label: "Comercialização" },
    { key: "financeiro",      label: "Financeiro", badge: alertasCount },
    { key: "cambio",          label: "Câmbio / USD", badge: usdDescasados > 0 ? usdDescasados : undefined },
    { key: "terceiros",       label: "Recursos de Terceiros" },
    { key: "evolucao",        label: "Evolução de Endividamento" },
    { key: "sensibilidade",   label: "Sensibilidade" },
    { key: "controller",      label: "Controller", badge: alertasCriticos > 0 ? alertasCriticos : (alertasAtivos > 0 ? alertasAtivos : undefined) },
  ];

  const inputSt: React.CSSProperties = { width: "100%", padding: "8px 10px", border: "0.5px solid #D4DCE8", borderRadius: 8, fontSize: 13, color: "#1a1a1a", background: "#fff", boxSizing: "border-box", outline: "none" };
  const labelSt: React.CSSProperties = { fontSize: 11, color: "#555", marginBottom: 4, display: "block" };

  async function abrirContratoRT(l: Lancamento) {
    setLoadingContrato(true);
    setRtLancModal(null);
    try {
      const nomeContrato = l.descricao.split(" — ")[0].trim();
      const { data: contratos } = await supabase
        .from("contratos_financeiros")
        .select("*")
        .eq("fazenda_id", fazendaId!)
        .ilike("descricao", nomeContrato);
      if (!contratos || contratos.length === 0) { setRtLancModal(l); return; }

      const c = contratos[0] as Record<string, unknown>;
      const cId = c.id as string;

      const [{ data: parcsRaw }, { data: garsRaw }, { data: prodRaw }] = await Promise.all([
        supabase.from("parcelas_pagamento").select("*").eq("contrato_id", cId).order("num_parcela"),
        supabase.from("garantias_contrato").select("*").eq("contrato_id", cId),
        (c.produtor_id ? supabase.from("produtores").select("id,nome").eq("id", c.produtor_id as string).single() : Promise.resolve({ data: null })),
      ]);

      setRtContratoModal({
        id: cId,
        descricao: (c.descricao ?? c.numero_contrato ?? "") as string,
        credor: (c.credor ?? "") as string,
        numero_documento: (c.numero_contrato ?? c.numero_documento) as string | undefined,
        tipo: (c.tipo ?? "") as string,
        moeda: (c.moeda ?? "BRL") as string,
        taxa_juros_aa: c.taxa_juros_aa as number | undefined,
        linha_credito: (c.linha_credito ?? "") as string | undefined,
        data_contrato: (c.data_contrato ?? "") as string,
        periodicidade_meses: c.periodicidade_meses as number | undefined,
        valor_financiado: (c.valor_total ?? c.valor_financiado ?? 0) as number,
        valor_cotacao: (c.cotacao_usd ?? c.valor_cotacao) as number | undefined,
        produtorNome: (prodRaw as {nome?: string} | null)?.nome,
        parcelas: (parcsRaw ?? []) as ParcelaDetalhe[],
        garantias: ((garsRaw ?? []) as GarantiaDetalhe[]).map((g: GarantiaDetalhe & {valor?: number}) => ({
          ...g,
          valor_avaliacao: g.valor_avaliacao ?? (g as {valor?: number}).valor,
        })),
      });
    } catch { setRtLancModal(l); }
    finally { setLoadingContrato(false); }
  }

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
                  { label: "Soja",  v: precos.soja?.brl  ?? 0, var: precos.soja?.variacao  ?? 0 },
                  { label: "Milho", v: precos.milho?.brl ?? 0, var: precos.milho?.variacao ?? 0 },
                  { label: "USD",   v: precos.usdBrl ?? 0,     var: 0                           },
                ].map(p => (
                  <div key={p.label} style={{ background: "rgba(255,255,255,0.07)", borderRadius: 7, padding: "5px 9px", textAlign: "center", minWidth: 66 }}>
                    <div style={{ fontSize: 9, color: "rgba(255,255,255,0.45)", marginBottom: 1 }}>{p.label}</div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: "#fff" }}>R$ {fmtN(p.v, 2)}</div>
                    {p.var !== 0 && <div style={{ fontSize: 9, color: p.var > 0 ? "#4ADE80" : "#F87171" }}>{p.var > 0 ? "+" : ""}{fmtN(p.var, 1)}%</div>}
                  </div>
                ))}
              </div>
            )}
            <button
              onClick={() => { setCfContratos([]); setCfParcelas([]); carregar(); carregarCF(); }}
              title="Recarregar todos os dados (use após importar contratos ou lançamentos)"
              style={{ padding: "7px 11px", borderRadius: 7, border: "0.5px solid rgba(255,255,255,0.2)", background: "rgba(255,255,255,0.08)", color: "#fff", fontSize: 13, cursor: "pointer" }}>↻</button>
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

          {filtroAnoSafraId && ciclosPorAnoSafra.length > 0 && ["painel","producao","custos","comercializacao","sensibilidade"].includes(aba) && (
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

          {(filtroAnoSafraId || filtroCicloIds.size > 0) && ["painel","producao","custos","comercializacao","sensibilidade"].includes(aba) && (
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
                  const risco: "verde" | "amarelo" | "vermelho" = p.comprPctTotal > 90 ? "vermelho" : p.comprPct > 70 ? "amarelo" : "verde";
                  return (
                    <div key={comm}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                        <span style={{ fontSize: 12, fontWeight: 700, color: "#1a1a1a", width: 65 }}>{comm}</span>
                        <Semaforo saude={risco} />
                        <span style={{ fontSize: 11, color: "#666" }}>
                          {fmtN(p.producao, 0)} sc projetadas · <strong style={{ color: "#16A34A" }}>{fmtN(Math.max(0, p.producao - p.arrSacas - p.barterSacas - p.fixadoSacas), 0)} sc livres</strong> ({fmtN(100 - p.comprPct, 0)}% livre físico)
                          {p.dividaSacas > 0 && <span style={{ color: "#9B59B6", marginLeft: 6 }}>· {fmtN(p.dividaSacas, 0)} sc para pagar dívidas</span>}
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
        {!loading && aba === "custos" && (() => {
          // Filtro estrito: quando uma safra está selecionada, mostra apenas lançamentos vinculados a ela
          // Amortizações e captações (movimentos de caixa) são excluídas — só entram despesas operacionais
          const cpCusto = (filtroAnoSafraId
            ? cpFiltrados.filter(l => l.ano_safra_id === filtroAnoSafraId)
            : cpFiltrados
          ).filter(l => grupoCategoria(l.categoria) !== "__amortizacao__");

          // ── Construir lista de itens consumidos das operações de campo ─
          const talhaoMap = new Map(talhoes.map(t => [t.id, t.nome]));

          // Mapas de ops filtrados por ciclo
          const pulvOpMap = new Map(
            pulvOps.filter(op => cicloIdsSet.has(op.ciclo_id)).map(op => [op.id, op])
          );
          const adubOpMap = new Map(
            adubOps.filter(op => cicloIdsSet.has(op.ciclo_id)).map(op => [op.id, op])
          );
          const csOpMap = new Map(
            csOps.filter(op => cicloIdsSet.has(op.ciclo_id)).map(op => [op.id, op])
          );

          const consumoItems: ConsumoItemBi[] = [];

          // DEFENSIVOS — pulverizacao_itens
          for (const item of pulvItens) {
            const op = pulvOpMap.get(item.pulverizacao_id);
            if (!op) continue;
            consumoItems.push({
              produto: item.nome_produto || "—",
              grupo: "Defensivos",
              talhao_id: op.talhao_id,
              talhao_nome: op.talhao_id ? (talhaoMap.get(op.talhao_id) ?? op.talhao_id) : "—",
              area_ha: op.area_ha,
              quantidade: item.total_consumido,
              unidade: item.unidade,
              valor_unitario: item.valor_unitario,
              custo_ha: item.custo_ha,
              custo_total: item.custo_total,
            });
          }

          // FERTILIZANTES — adubacoes_base_itens
          for (const item of adubItens) {
            const op = adubOpMap.get(item.adubacao_id);
            if (!op) continue;
            const ct = item.custo_total ?? 0;
            consumoItems.push({
              produto: item.produto_nome || "—",
              grupo: "Fertilizantes",
              talhao_id: op.talhao_id,
              talhao_nome: op.talhao_id ? (talhaoMap.get(op.talhao_id) ?? op.talhao_id) : "—",
              area_ha: op.area_ha,
              quantidade: item.quantidade_kg ?? 0,
              unidade: "kg",
              valor_unitario: item.valor_unitario ?? 0,
              custo_ha: op.area_ha > 0 ? ct / op.area_ha : 0,
              custo_total: ct,
            });
          }

          // CORREÇÃO DE SOLO — correcoes_solo_itens (agrupa em Fertilizantes)
          for (const item of csItens) {
            const op = csOpMap.get(item.correcao_id);
            if (!op) continue;
            const ct = item.custo_total ?? 0;
            consumoItems.push({
              produto: item.produto_nome || "—",
              grupo: "Fertilizantes",
              talhao_id: op.talhao_id,
              talhao_nome: op.talhao_id ? (talhaoMap.get(op.talhao_id) ?? op.talhao_id) : "—",
              area_ha: op.area_ha,
              quantidade: item.quantidade_ton ?? 0,
              unidade: "t",
              valor_unitario: item.valor_unitario ?? 0,
              custo_ha: op.area_ha > 0 ? ct / op.area_ha : 0,
              custo_total: ct,
            });
          }

          // SEMENTES — plantios
          for (const pl of plantiosFull.filter(p => cicloIdsSet.has(p.ciclo_id))) {
            if (!pl.custo_sementes || pl.custo_sementes === 0) continue;
            const qty = pl.quantidade_kg ?? 0;
            consumoItems.push({
              produto: pl.variedade || "Semente",
              grupo: "Sementes",
              talhao_id: pl.talhao_id,
              talhao_nome: talhaoMap.get(pl.talhao_id) ?? "—",
              area_ha: pl.area_ha,
              quantidade: qty,
              unidade: "kg",
              valor_unitario: qty > 0 ? pl.custo_sementes / qty : 0,
              custo_ha: pl.area_ha > 0 ? pl.custo_sementes / pl.area_ha : 0,
              custo_total: pl.custo_sementes,
            });
          }

          // ── Custo por grupo (operações + CP para grupos sem tabela de ops) ─
          const GRUPOS_CP_ONLY = new Set(["Operações", "Arrendamento", "Mão de Obra", "Encargos Financeiros", "Outros"]);
          const cPorGrupo: Record<string, number> = {};
          for (const g of GRUPOS_CUSTO) cPorGrupo[g] = 0;
          for (const item of consumoItems) {
            cPorGrupo[item.grupo] = (cPorGrupo[item.grupo] ?? 0) + item.custo_total;
          }
          for (const l of cpCusto) {
            const g = grupoCategoria(l.categoria);
            if (GRUPOS_CP_ONLY.has(g)) cPorGrupo[g] = (cPorGrupo[g] ?? 0) + l.valor;
          }

          const totalCusto = Object.values(cPorGrupo).reduce((s, v) => s + v, 0);
          const custoHaLocal = areaFiltrada > 0 ? totalCusto / areaFiltrada : 0;

          // ── Drill-down: itens do grupo clicado ──────────────────────────
          const isGrupoOps = custoGrupoAtivo && !GRUPOS_CP_ONLY.has(custoGrupoAtivo);

          // Para grupos de operações: agrupar por produto (ou por produto+talhão)
          type DrillRow = { produto: string; talhao_nome?: string; area_ha: number; quantidade: number; unidade: string; valor_unitario: number; custo_ha: number; custo_total: number; pct: number };
          const drillRows: DrillRow[] = [];

          if (custoGrupoAtivo && isGrupoOps) {
            const grupoItens = consumoItems.filter(i => i.grupo === custoGrupoAtivo);
            const totalGrupo = grupoItens.reduce((s, i) => s + i.custo_total, 0);

            if (custoPorTalhao) {
              // Agrupar por produto + talhão
              const map = new Map<string, DrillRow>();
              for (const item of grupoItens) {
                const key = `${item.produto}||${item.talhao_id ?? "—"}`;
                if (!map.has(key)) {
                  map.set(key, { produto: item.produto, talhao_nome: item.talhao_nome, area_ha: 0, quantidade: 0, unidade: item.unidade, valor_unitario: 0, custo_ha: 0, custo_total: 0, pct: 0 });
                }
                const r = map.get(key)!;
                r.area_ha += item.area_ha;
                r.quantidade += item.quantidade;
                r.custo_total += item.custo_total;
              }
              for (const r of map.values()) {
                r.custo_ha = r.area_ha > 0 ? r.custo_total / r.area_ha : 0;
                r.valor_unitario = r.quantidade > 0 ? r.custo_total / r.quantidade : 0;
                r.pct = totalGrupo > 0 ? (r.custo_total / totalGrupo) * 100 : 0;
                drillRows.push(r);
              }
            } else {
              // Agrupar apenas por produto
              const map = new Map<string, DrillRow>();
              for (const item of grupoItens) {
                const key = item.produto;
                if (!map.has(key)) {
                  map.set(key, { produto: item.produto, area_ha: 0, quantidade: 0, unidade: item.unidade, valor_unitario: 0, custo_ha: 0, custo_total: 0, pct: 0 });
                }
                const r = map.get(key)!;
                r.area_ha += item.area_ha;
                r.quantidade += item.quantidade;
                r.custo_total += item.custo_total;
              }
              for (const r of map.values()) {
                r.custo_ha = r.area_ha > 0 ? r.custo_total / r.area_ha : 0;
                r.valor_unitario = r.quantidade > 0 ? r.custo_total / r.quantidade : 0;
                r.pct = totalGrupo > 0 ? (r.custo_total / totalGrupo) * 100 : 0;
                drillRows.push(r);
              }
            }
            drillRows.sort((a, b) => b.custo_total - a.custo_total);
          }

          // Para grupos CP — agrupa por CATEGORIA (objeto de custo), não por fornecedor
          type DrillCategRow = { categoria: string; total: number; count: number; custo_ha: number; pct: number };
          const drillCategs: DrillCategRow[] = [];
          if (custoGrupoAtivo && GRUPOS_CP_ONLY.has(custoGrupoAtivo)) {
            const grupoLancs = cpCusto.filter(l => grupoCategoria(l.categoria) === custoGrupoAtivo);
            const totalGrupo = grupoLancs.reduce((s, l) => s + l.valor, 0);
            const catMap = new Map<string, { total: number; count: number }>();
            for (const l of grupoLancs) {
              const cat = l.categoria || "Outros";
              const e = catMap.get(cat) ?? { total: 0, count: 0 };
              e.total += l.valor; e.count++;
              catMap.set(cat, e);
            }
            for (const [categoria, { total, count }] of catMap.entries()) {
              drillCategs.push({ categoria, total, count, custo_ha: areaFiltrada > 0 ? total / areaFiltrada : 0, pct: totalGrupo > 0 ? (total / totalGrupo) * 100 : 0 });
            }
            drillCategs.sort((a, b) => b.total - a.total);
          }

          // ── Texto dos filtros aplicados (para PDF) ──────────────────────
          const filtroTexto = [
            filtroAnoSafraId ? anosSafra.find(a => a.id === filtroAnoSafraId)?.descricao : "Todas as safras",
            filtroCicloIds.size > 0 ? `${filtroCicloIds.size} ciclo(s)` : null,
            custoGrupoAtivo ?? null,
          ].filter(Boolean).join(" · ");

          const safraLabel = filtroAnoSafraId
            ? (anosSafra.find(a => a.id === filtroAnoSafraId)?.descricao ?? "")
            : "Todas";

          const cor = custoGrupoAtivo ? (CORES_GRUPO[custoGrupoAtivo] ?? "#1A4870") : "#1A4870";

          return (
            <div>
              {/* Estilos de impressão */}
              <style>{`
                @media print {
                  body > *:not(.bi-print-root) { display: none !important; }
                  .bi-no-print { display: none !important; }
                  .bi-print-section { display: block !important; }
                  @page { size: A4 landscape; margin: 12mm 15mm; }
                  .bi-print-table th, .bi-print-table td { border: 0.5px solid #ccc !important; }
                }
                .bi-print-section { display: none; }
              `}</style>

              {/* KPIs de custo */}
              <div className="bi-no-print" style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 12, marginBottom: 18 }}>
                {[
                  { label: "Custo Total (consumo + CP)", v: fmtR(totalCusto), color: "#E24B4A", bg: "#FCEBEB" },
                  { label: "Custo por Hectare",          v: custoHaLocal > 0 ? fmtR(custoHaLocal) + "/ha" : "—", color: "#1A4870", bg: "#EBF3FC" },
                  { label: "Benchmark MT (soja)",        v: "R$ 5.800/ha",    color: "#555",    bg: "#F4F6FA" },
                  { label: "Desvio vs Benchmark",
                    v: custoHaLocal > 0 ? (custoHaLocal > 5800 ? "+" : "") + fmtR(custoHaLocal - 5800) : "—",
                    color: custoHaLocal > 6200 ? "#791F1F" : custoHaLocal > 5800 ? "#7A5A12" : "#14532D",
                    bg:    custoHaLocal > 6200 ? "#FCEBEB" : custoHaLocal > 5800 ? "#FBF3E0"  : "#ECFDF5" },
                ].map(k => (
                  <div key={k.label} style={{ background: k.bg, borderRadius: 10, padding: "14px 16px", border: "0.5px solid #DDE2EE" }}>
                    <div style={{ fontSize: 10, color: "#666", marginBottom: 4 }}>{k.label}</div>
                    <div style={{ fontSize: 17, fontWeight: 700, color: k.color }}>{k.v}</div>
                  </div>
                ))}
              </div>

              {opsLoading && (
                <div className="bi-no-print" style={{ textAlign: "center", padding: 24, color: "#888", fontSize: 13 }}>
                  Carregando dados de operações…
                </div>
              )}

              {!opsLoading && (
                <div className="bi-no-print" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                  {/* ── Esquerda: Composição dos Custos (barras clicáveis) ── */}
                  <div style={{ background: "#fff", borderRadius: 12, border: "0.5px solid #DDE2EE", padding: "16px 20px" }}>
                    <div style={{ fontWeight: 700, fontSize: 12, color: "#1a1a1a", marginBottom: 14 }}>
                      Composição dos Custos
                      <span style={{ fontSize: 10, fontWeight: 400, color: "#888", marginLeft: 6 }}>clique para detalhar →</span>
                    </div>

                    {totalCusto === 0 ? (
                      <div style={{ color: "#aaa", fontSize: 12, textAlign: "center", padding: 20 }}>
                        {opsLoaded ? "Nenhum custo de campo no período filtrado" : "Carregando…"}
                      </div>
                    ) : (
                      GRUPOS_CUSTO.filter(g => cPorGrupo[g] > 0).sort((a, b) => cPorGrupo[b] - cPorGrupo[a]).map(g => {
                        const isAtivo = custoGrupoAtivo === g;
                        return (
                          <div
                            key={g}
                            onClick={() => { setCustoGrupoAtivo(isAtivo ? null : g); setCustoPorTalhao(false); }}
                            style={{ cursor: "pointer", borderRadius: 8, padding: "4px 8px", marginLeft: -8, background: isAtivo ? `${CORES_GRUPO[g]}15` : "transparent", transition: "background 0.15s", border: isAtivo ? `0.5px solid ${CORES_GRUPO[g]}40` : "0.5px solid transparent", marginBottom: 2 }}
                          >
                            <BarraHorizontal
                              label={g} value={cPorGrupo[g]} max={totalCusto}
                              color={CORES_GRUPO[g]}
                              sub={`${fmtR(cPorGrupo[g])} (${fmtN(pct(cPorGrupo[g], totalCusto), 0)}%)`}
                            />
                          </div>
                        );
                      })
                    )}
                  </div>

                  {/* ── Direita: Detalhe do grupo ou benchmark ── */}
                  <div style={{ background: "#fff", borderRadius: 12, border: `0.5px solid ${custoGrupoAtivo ? cor + "60" : "#DDE2EE"}`, padding: "16px 20px" }}>
                    {!custoGrupoAtivo ? (
                      <>
                        <div style={{ fontWeight: 700, fontSize: 12, color: "#1a1a1a", marginBottom: 12 }}>Custo/ha vs Benchmarks MT</div>
                        {(["Soja", "Milho"] as const).map(comm => {
                          const bm = BENCHMARK[comm];
                          const cultArea = plantiosFiltrados.filter(p => {
                            const c = ciclos.find(x => x.id === p.ciclo_id);
                            return c && culturaToCommodity(c.cultura) === comm;
                          }).reduce((s, p) => s + (p.area_ha || 0), 0);
                          if (cultArea === 0) return null;
                          const cultProp = areaFiltrada > 0 ? cultArea / areaFiltrada : 0;
                          const cultCusto = totalCusto * cultProp;
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
                        {totalCusto === 0 && <div style={{ color: "#aaa", fontSize: 12, textAlign: "center", padding: 16 }}>Sem área de plantio no período</div>}
                      </>
                    ) : (
                      <>
                        {/* Header do detalhe */}
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <span style={{ fontSize: 12, fontWeight: 700, color: cor }}>{custoGrupoAtivo}</span>
                            <span style={{ fontSize: 11, color: "#888" }}>{fmtR(cPorGrupo[custoGrupoAtivo])} · {fmtN(pct(cPorGrupo[custoGrupoAtivo], totalCusto), 0)}% CT</span>
                          </div>
                          <div style={{ display: "flex", gap: 6 }}>
                            {isGrupoOps && (
                              <button
                                onClick={() => setCustoPorTalhao(v => !v)}
                                style={{ fontSize: 10, padding: "3px 8px", borderRadius: 5, border: `0.5px solid ${custoPorTalhao ? cor : "#DDE2EE"}`, background: custoPorTalhao ? `${cor}10` : "#F4F6FA", color: custoPorTalhao ? cor : "#555", cursor: "pointer", fontWeight: custoPorTalhao ? 700 : 400 }}
                              >
                                Por Talhão
                              </button>
                            )}
                            <button
                              onClick={() => window.print()}
                              style={{ fontSize: 10, padding: "3px 8px", borderRadius: 5, border: "0.5px solid #DDE2EE", background: "#F4F6FA", color: "#555", cursor: "pointer" }}
                            >
                              PDF
                            </button>
                            <button
                              onClick={() => setCustoGrupoAtivo(null)}
                              style={{ fontSize: 12, padding: "2px 6px", borderRadius: 5, border: "0.5px solid #DDE2EE", background: "#F4F6FA", color: "#888", cursor: "pointer" }}
                            >✕</button>
                          </div>
                        </div>

                        {/* Tabela de produtos (grupos com dados de operações) */}
                        {isGrupoOps ? (
                          drillRows.length === 0 ? (
                            <div style={{ color: "#aaa", fontSize: 12, textAlign: "center", padding: 20 }}>
                              Sem registros de campo para este grupo no período
                            </div>
                          ) : (
                            <div style={{ overflowX: "auto" }}>
                              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
                                <thead>
                                  <tr style={{ background: `${cor}10` }}>
                                    <th style={{ textAlign: "left",   padding: "5px 8px", color: "#555", fontWeight: 600, borderBottom: `1px solid ${cor}30`, whiteSpace: "nowrap" }}>Produto</th>
                                    {custoPorTalhao && <th style={{ textAlign: "left",   padding: "5px 8px", color: "#555", fontWeight: 600, borderBottom: `1px solid ${cor}30`, whiteSpace: "nowrap" }}>Talhão</th>}
                                    <th style={{ textAlign: "right",  padding: "5px 8px", color: "#555", fontWeight: 600, borderBottom: `1px solid ${cor}30`, whiteSpace: "nowrap" }}>Área (ha)</th>
                                    <th style={{ textAlign: "right",  padding: "5px 8px", color: "#555", fontWeight: 600, borderBottom: `1px solid ${cor}30`, whiteSpace: "nowrap" }}>Qtde Total</th>
                                    <th style={{ textAlign: "center", padding: "5px 8px", color: "#555", fontWeight: 600, borderBottom: `1px solid ${cor}30` }}>Un</th>
                                    <th style={{ textAlign: "right",  padding: "5px 8px", color: "#555", fontWeight: 600, borderBottom: `1px solid ${cor}30`, whiteSpace: "nowrap" }}>Qtde/ha</th>
                                    <th style={{ textAlign: "right",  padding: "5px 8px", color: "#555", fontWeight: 600, borderBottom: `1px solid ${cor}30`, whiteSpace: "nowrap" }}>R$ Unit.</th>
                                    <th style={{ textAlign: "right",  padding: "5px 8px", color: "#555", fontWeight: 600, borderBottom: `1px solid ${cor}30`, whiteSpace: "nowrap" }}>R$/ha</th>
                                    <th style={{ textAlign: "right",  padding: "5px 8px", color: "#555", fontWeight: 600, borderBottom: `1px solid ${cor}30`, whiteSpace: "nowrap" }}>Total</th>
                                    <th style={{ textAlign: "right",  padding: "5px 8px", color: "#555", fontWeight: 600, borderBottom: `1px solid ${cor}30` }}>% CT</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {drillRows.map((r, i) => (
                                    <tr key={i} style={{ borderBottom: "0.5px solid #EEF1F6", background: i % 2 === 0 ? "#fff" : "#FAFBFC" }}>
                                      <td style={{ padding: "5px 8px", color: "#1a1a1a", fontWeight: 500, maxWidth: 140, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.produto}</td>
                                      {custoPorTalhao && <td style={{ padding: "5px 8px", color: "#555", whiteSpace: "nowrap" }}>{r.talhao_nome || "—"}</td>}
                                      <td style={{ padding: "5px 8px", textAlign: "right", color: "#555" }}>{fmtN(r.area_ha, 1)}</td>
                                      <td style={{ padding: "5px 8px", textAlign: "right", color: "#555" }}>{fmtN(r.quantidade, 2)}</td>
                                      <td style={{ padding: "5px 8px", textAlign: "center", color: "#888" }}>{r.unidade}</td>
                                      <td style={{ padding: "5px 8px", textAlign: "right", color: "#555" }}>{fmtN(r.area_ha > 0 ? r.quantidade / r.area_ha : 0, 3)}</td>
                                      <td style={{ padding: "5px 8px", textAlign: "right", color: "#555" }}>{r.valor_unitario > 0 ? fmtR2(r.valor_unitario) : "—"}</td>
                                      <td style={{ padding: "5px 8px", textAlign: "right", color: "#555" }}>{fmtR2(r.custo_ha)}</td>
                                      <td style={{ padding: "5px 8px", textAlign: "right", fontWeight: 700, color: cor }}>{fmtR(r.custo_total)}</td>
                                      <td style={{ padding: "5px 8px", textAlign: "right", color: "#888" }}>{fmtN(r.pct, 1)}%</td>
                                    </tr>
                                  ))}
                                </tbody>
                                <tfoot>
                                  <tr style={{ background: `${cor}08`, borderTop: `1px solid ${cor}30` }}>
                                    <td colSpan={custoPorTalhao ? 2 : 1} style={{ padding: "5px 8px", fontWeight: 700, color: "#1a1a1a" }}>Total</td>
                                    <td style={{ padding: "5px 8px", textAlign: "right", fontWeight: 600, color: "#555" }}>{fmtN(drillRows.reduce((s, r) => s + r.area_ha, 0), 1)}</td>
                                    <td style={{ padding: "5px 8px", textAlign: "right", fontWeight: 600, color: "#555" }}>{fmtN(drillRows.reduce((s, r) => s + r.quantidade, 0), 2)}</td>
                                    <td />
                                    <td />
                                    <td />
                                    <td />
                                    <td style={{ padding: "5px 8px", textAlign: "right", fontWeight: 700, color: cor }}>{fmtR(cPorGrupo[custoGrupoAtivo])}</td>
                                    <td style={{ padding: "5px 8px", textAlign: "right", fontWeight: 700, color: cor }}>100%</td>
                                  </tr>
                                </tfoot>
                              </table>
                            </div>
                          )
                        ) : (
                          /* Tabela por categoria de custo (objeto de custo, não fornecedor) */
                          <div style={{ overflowY: "auto", maxHeight: 300 }}>
                            <table style={{ width: "100%", borderCollapse: "collapse" }}>
                              <thead>
                                <tr style={{ background: `${cor}10` }}>
                                  <th style={{ textAlign: "left",  padding: "5px 8px", fontSize: 10, color: "#555", fontWeight: 600, borderBottom: `1px solid ${cor}30` }}>Categoria</th>
                                  <th style={{ textAlign: "right", padding: "5px 8px", fontSize: 10, color: "#555", fontWeight: 600, borderBottom: `1px solid ${cor}30` }}>R$/ha</th>
                                  <th style={{ textAlign: "right", padding: "5px 8px", fontSize: 10, color: "#555", fontWeight: 600, borderBottom: `1px solid ${cor}30` }}>Total</th>
                                  <th style={{ textAlign: "right", padding: "5px 8px", fontSize: 10, color: "#555", fontWeight: 600, borderBottom: `1px solid ${cor}30` }}>%</th>
                                </tr>
                              </thead>
                              <tbody>
                                {drillCategs.map((r, i) => (
                                  <tr key={r.categoria} style={{ borderBottom: "0.5px solid #EEF1F6", background: i % 2 === 0 ? "#fff" : "#FAFBFC" }}>
                                    <td style={{ padding: "5px 8px", fontSize: 11, color: "#1a1a1a" }}>{r.categoria}</td>
                                    <td style={{ padding: "5px 8px", textAlign: "right", fontSize: 11, color: "#555", whiteSpace: "nowrap" }}>{r.custo_ha > 0 ? fmtR(r.custo_ha) : "—"}</td>
                                    <td style={{ padding: "5px 8px", textAlign: "right", fontSize: 11, fontWeight: 700, color: cor, whiteSpace: "nowrap" }}>{fmtR(r.total)}</td>
                                    <td style={{ padding: "5px 8px", textAlign: "right", fontSize: 10, color: "#888", whiteSpace: "nowrap" }}>{fmtN(r.pct, 1)}%</td>
                                  </tr>
                                ))}
                                {drillCategs.length === 0 && (
                                  <tr><td colSpan={4} style={{ padding: 14, textAlign: "center", color: "#aaa", fontSize: 11 }}>Sem lançamentos</td></tr>
                                )}
                              </tbody>
                              {drillCategs.length > 0 && (
                                <tfoot>
                                  <tr style={{ background: `${cor}08`, borderTop: `1px solid ${cor}30` }}>
                                    <td style={{ padding: "5px 8px", fontWeight: 700, color: "#1a1a1a" }}>Total — {drillCategs.reduce((s, r) => s + r.count, 0)} lançamentos</td>
                                    <td style={{ padding: "5px 8px", textAlign: "right", fontWeight: 600, color: "#555" }}>{areaFiltrada > 0 ? fmtR(cPorGrupo[custoGrupoAtivo!] / areaFiltrada) : "—"}</td>
                                    <td style={{ padding: "5px 8px", textAlign: "right", fontWeight: 700, color: cor }}>{fmtR(cPorGrupo[custoGrupoAtivo!] ?? 0)}</td>
                                    <td style={{ padding: "5px 8px", textAlign: "right", fontWeight: 700, color: cor }}>100%</td>
                                  </tr>
                                </tfoot>
                              )}
                            </table>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </div>
              )}

              {/* ── Seção para PDF / impressão ───────────────────────── */}
              <div className="bi-print-section">
                <div style={{ marginBottom: 16, borderBottom: "2px solid #1A4870", paddingBottom: 8 }}>
                  <div style={{ fontSize: 16, fontWeight: 700, color: "#1A4870" }}>
                    {fazenda?.nome ?? ""} — Relatório de Custos &amp; Insumos
                  </div>
                  <div style={{ fontSize: 11, color: "#555", marginTop: 2 }}>
                    Filtro: {filtroTexto} · Gerado em {new Date().toLocaleDateString("pt-BR")}
                  </div>
                </div>
                {custoGrupoAtivo && isGrupoOps && (
                  <>
                    <div style={{ fontSize: 13, fontWeight: 700, color: cor, marginBottom: 8 }}>
                      {custoGrupoAtivo} — Safra {safraLabel}
                      {custoPorTalhao ? " (Por Talhão)" : ""}
                    </div>
                    <table className="bi-print-table" style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
                      <thead>
                        <tr style={{ background: "#EEF1F6" }}>
                          <th style={{ textAlign: "left",  padding: "5px 8px" }}>Produto</th>
                          {custoPorTalhao && <th style={{ textAlign: "left", padding: "5px 8px" }}>Talhão</th>}
                          <th style={{ textAlign: "right", padding: "5px 8px" }}>Área (ha)</th>
                          <th style={{ textAlign: "right", padding: "5px 8px" }}>Qtde Total</th>
                          <th style={{ textAlign: "center",padding: "5px 8px" }}>Un</th>
                          <th style={{ textAlign: "right", padding: "5px 8px" }}>Qtde/ha</th>
                          <th style={{ textAlign: "right", padding: "5px 8px" }}>R$ Unit.</th>
                          <th style={{ textAlign: "right", padding: "5px 8px" }}>R$/ha</th>
                          <th style={{ textAlign: "right", padding: "5px 8px" }}>Total</th>
                          <th style={{ textAlign: "right", padding: "5px 8px" }}>% CT</th>
                        </tr>
                      </thead>
                      <tbody>
                        {drillRows.map((r, i) => (
                          <tr key={i} style={{ background: i % 2 === 0 ? "#fff" : "#F9FAFB" }}>
                            <td style={{ padding: "4px 8px", fontWeight: 500 }}>{r.produto}</td>
                            {custoPorTalhao && <td style={{ padding: "4px 8px" }}>{r.talhao_nome || "—"}</td>}
                            <td style={{ padding: "4px 8px", textAlign: "right" }}>{fmtN(r.area_ha, 1)}</td>
                            <td style={{ padding: "4px 8px", textAlign: "right" }}>{fmtN(r.quantidade, 2)}</td>
                            <td style={{ padding: "4px 8px", textAlign: "center" }}>{r.unidade}</td>
                            <td style={{ padding: "4px 8px", textAlign: "right" }}>{fmtN(r.area_ha > 0 ? r.quantidade / r.area_ha : 0, 3)}</td>
                            <td style={{ padding: "4px 8px", textAlign: "right" }}>{r.valor_unitario > 0 ? fmtR2(r.valor_unitario) : "—"}</td>
                            <td style={{ padding: "4px 8px", textAlign: "right" }}>{fmtR2(r.custo_ha)}</td>
                            <td style={{ padding: "4px 8px", textAlign: "right", fontWeight: 700 }}>{fmtR(r.custo_total)}</td>
                            <td style={{ padding: "4px 8px", textAlign: "right" }}>{fmtN(r.pct, 1)}%</td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr style={{ background: "#EEF1F6", fontWeight: 700 }}>
                          <td colSpan={custoPorTalhao ? 2 : 1} style={{ padding: "5px 8px" }}>TOTAL</td>
                          <td style={{ padding: "5px 8px", textAlign: "right" }}>{fmtN(drillRows.reduce((s, r) => s + r.area_ha, 0), 1)}</td>
                          <td colSpan={5} />
                          <td style={{ padding: "5px 8px", textAlign: "right" }}>{fmtR(cPorGrupo[custoGrupoAtivo])}</td>
                          <td style={{ padding: "5px 8px", textAlign: "right" }}>100%</td>
                        </tr>
                      </tfoot>
                    </table>
                  </>
                )}
                {(!custoGrupoAtivo || !isGrupoOps) && (
                  <div style={{ color: "#888", fontSize: 12 }}>
                    Selecione um grupo no painel Composição dos Custos e clique em PDF para exportar o detalhe.
                  </div>
                )}
                <div style={{ marginTop: 16, fontSize: 9, color: "#aaa", borderTop: "0.5px solid #ddd", paddingTop: 6 }}>
                  RacTech — Gestão Agrícola · Raccolto Agronegócios
                </div>
              </div>
            </div>
          );
        })()}

        {/* ═══════════ COMERCIALIZAÇÃO ═══════════ */}
        {!loading && aba === "comercializacao" && (() => {
          // ── Filtro de cultura local ─────────────────────────────────────
          const culturasList = Array.from(new Set(
            contratos.filter(c => c.status !== "cancelado" && !c.is_arrendamento).map(c => c.produto)
          )).sort();

          // ── Contratos visíveis (filtro global safra + local cultura) ────
          const contratosVisiveis = contratos.filter(c => {
            if (c.status === "cancelado" || c.is_arrendamento) return false;
            if (biComCultura && c.produto !== biComCultura) return false;
            if (!filtroAnoSafraId) return true;
            return (c.ciclo_id && cicloIdsSet.has(c.ciclo_id)) ||
                   (c.ano_safra_id && anoSafraIdsFiltSet.has(c.ano_safra_id));
          });

          const recSc = (c: Contrato) => (c.quantidade_sc || 0) / unidProd(c.produto, cultMap).div;
          const entSc = (c: Contrato) => (c.entregue_sc   || 0) / unidProd(c.produto, cultMap).div;
          const ptax = precos?.usdBrl ?? 5.10;

          // ── KPIs globais ─────────────────────────────────────────────────
          const totalSc    = contratosVisiveis.reduce((s, c) => s + recSc(c), 0);
          const totalEntSc = contratosVisiveis.reduce((s, c) => s + entSc(c), 0);
          const totalSaldSc = Math.max(0, totalSc - totalEntSc);
          const totalValBRL = contratosVisiveis.reduce((s, c) => {
            const v = recSc(c) * (c.preco || 0);
            return s + (c.moeda === "USD" ? v * ptax : v);
          }, 0);
          const precoMedPond = totalSc > 0 ? totalValBRL / totalSc : 0;

          // ── Por moeda ───────────────────────────────────────────────────
          const cBRL    = contratosVisiveis.filter(c => c.modalidade !== "barter" && c.tipo !== "barter" && c.moeda !== "USD");
          const cUSD    = contratosVisiveis.filter(c => c.moeda === "USD");
          const cBarter = contratosVisiveis.filter(c => c.modalidade === "barter" || c.tipo === "barter");
          const scBRL    = cBRL.reduce((s, c) => s + recSc(c), 0);
          const scUSD    = cUSD.reduce((s, c) => s + recSc(c), 0);
          const scBarter = cBarter.reduce((s, c) => s + recSc(c), 0);
          const totalMoedaSc = scBRL + scUSD + scBarter;

          // ── Por cultura ─────────────────────────────────────────────────
          type CultRow = { cultura: string; sc: number; entSc: number; saldoSc: number; valBRL: number; mediaBRL: number; mediaUSD: number; qtd: number };
          const cultRowMap = new Map<string, CultRow>();
          for (const c of contratosVisiveis) {
            const k = c.produto || "Outros";
            if (!cultRowMap.has(k)) cultRowMap.set(k, { cultura: k, sc: 0, entSc: 0, saldoSc: 0, valBRL: 0, mediaBRL: 0, mediaUSD: 0, qtd: 0 });
            const e = cultRowMap.get(k)!;
            const sc = recSc(c); const es = entSc(c);
            e.sc += sc; e.entSc += es;
            const v = sc * (c.preco || 0);
            e.valBRL += c.moeda === "USD" ? v * ptax : v;
            e.qtd += 1;
          }
          for (const r of cultRowMap.values()) {
            r.saldoSc = Math.max(0, r.sc - r.entSc);
            const brlC = contratosVisiveis.filter(c => c.produto === r.cultura && c.moeda !== "USD" && (c.preco ?? 0) > 0);
            const usdC = contratosVisiveis.filter(c => c.produto === r.cultura && c.moeda === "USD"  && (c.preco ?? 0) > 0);
            r.mediaBRL = brlC.length > 0 ? brlC.reduce((s, c) => s + c.preco!, 0) / brlC.length : 0;
            r.mediaUSD = usdC.length > 0 ? usdC.reduce((s, c) => s + c.preco!, 0) / usdC.length : 0;
          }
          const culturas = Array.from(cultRowMap.values()).sort((a, b) => b.sc - a.sc);
          const maxCultSc = culturas.length > 0 ? culturas[0].sc : 1;

          // ── Por produtor ─────────────────────────────────────────────────
          type ProdRow = { nome: string; sc: number; valBRL: number; qtd: number };
          const prodMap = new Map<string, ProdRow>();
          for (const c of contratosVisiveis) {
            const nome = c.produtor_nome || "Não informado";
            if (!prodMap.has(nome)) prodMap.set(nome, { nome, sc: 0, valBRL: 0, qtd: 0 });
            const e = prodMap.get(nome)!;
            const sc = recSc(c);
            const v  = sc * (c.preco || 0);
            e.sc += sc;
            e.valBRL += c.moeda === "USD" ? v * ptax : v;
            e.qtd += 1;
          }
          const produtores = Array.from(prodMap.values()).sort((a, b) => b.sc - a.sc);

          // ── Por comprador ────────────────────────────────────────────────
          type CompRow = { nome: string; sc: number; valBRL: number; qtd: number; contratos: Contrato[] };
          const compMap = new Map<string, CompRow>();
          for (const c of contratosVisiveis) {
            const nome = (c.comprador || "Sem nome").trim();
            if (!compMap.has(nome)) compMap.set(nome, { nome, sc: 0, valBRL: 0, qtd: 0, contratos: [] });
            const e = compMap.get(nome)!;
            const sc = recSc(c);
            const v  = sc * (c.preco || 0);
            e.sc += sc; e.valBRL += c.moeda === "USD" ? v * ptax : v; e.qtd += 1;
            e.contratos.push(c);
          }
          const compradores = Array.from(compMap.values()).sort((a, b) => b.sc - a.sc).slice(0, 12);
          const maxCompSc   = compradores.length > 0 ? compradores[0].sc : 1;

          // ── Saldo financeiro projetado ───────────────────────────────────
          const saldoFinProjBRL = culturas.reduce((s, c) => {
            const precoRef = c.mediaBRL > 0 ? c.mediaBRL : (c.mediaUSD > 0 ? c.mediaUSD * ptax : precoMedPond);
            return s + c.saldoSc * precoRef;
          }, 0);

          const CORT: Record<number, string> = {
            0: "#1A4870", 1: "#2E6FB5", 2: "#EF9F27", 3: "#E24B4A",
            4: "#16A34A", 5: "#378ADD", 6: "#C9921B",
          };
          const cor = (i: number) => CORT[i % 7];

          return (
          <div style={{ display:"flex", flexDirection:"column", gap:18 }}>

            {/* ── Seletores ── */}
            <div style={{ display:"flex", gap:10, alignItems:"center", flexWrap:"wrap" }}>
              <select value={filtroAnoSafraId} onChange={e => setFiltroAnoSafraId(e.target.value)}
                style={{ padding:"7px 10px", border:"0.5px solid #D4DCE8", borderRadius:8, fontSize:12, background:"#fff", outline:"none", color:"#1a1a1a", minWidth:160 }}>
                <option value="">Todos os anos safra</option>
                {anosSafra.map(a => <option key={a.id} value={a.id}>{a.descricao}</option>)}
              </select>
              <select value={biComCultura} onChange={e => setBiComCultura(e.target.value)}
                style={{ padding:"7px 10px", border:"0.5px solid #D4DCE8", borderRadius:8, fontSize:12, background:"#fff", outline:"none", color:"#1a1a1a", minWidth:140 }}>
                <option value="">Todas as culturas</option>
                {culturasList.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
              {(filtroAnoSafraId || biComCultura) && (
                <button onClick={() => { setFiltroAnoSafraId(""); setBiComCultura(""); }}
                  style={{ padding:"7px 12px", border:"0.5px solid #D4DCE8", borderRadius:8, fontSize:11, color:"#555", background:"#fff", cursor:"pointer" }}>
                  ✕ Limpar filtros
                </button>
              )}
              <span style={{ marginLeft:"auto", fontSize:11, color:"#888" }}>
                {contratosVisiveis.length} contrato{contratosVisiveis.length !== 1 ? "s" : ""} · {fmtN(totalSc, 0)} sc no filtro
              </span>
            </div>

            {/* ── KPI cards ── */}
            <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:12 }}>
              {[
                { label:"Total Comercializado", val:fmtN(totalSc, 0)+" sc",      sub:contratosVisiveis.length+" contrato(s)",             cor:"#1A4870", bg:"#EBF3FC" },
                { label:"Valor Total (BRL)",    val:fmtR2(totalValBRL),           sub:"conversão USD→BRL à PTAX",                          cor:"#16A34A", bg:"#ECFDF5" },
                { label:"Preço Médio Pond.",    val:precoMedPond>0?fmtR(precoMedPond)+"/sc":"—", sub:"ponderado por volume",                cor:"#C9921B", bg:"#FBF3E0" },
                { label:"Saldo a Entregar",     val:fmtN(totalSaldSc, 0)+" sc",   sub:totalSc>0?fmtN(totalEntSc/totalSc*100,0)+"% já entregue":"0% entregue", cor:totalSaldSc>0?"#E24B4A":"#16A34A", bg:totalSaldSc>0?"#FFF0F0":"#ECFDF5" },
              ].map(k => (
                <div key={k.label} style={{ background:k.bg, border:"0.5px solid #DDE2EE", borderRadius:12, padding:"16px 18px" }}>
                  <div style={{ fontSize:10, color:"#555", fontWeight:600, marginBottom:6, textTransform:"uppercase", letterSpacing:".03em" }}>{k.label}</div>
                  <div style={{ fontSize:20, fontWeight:800, color:k.cor }}>{k.val}</div>
                  <div style={{ fontSize:10, color:"#888", marginTop:4 }}>{k.sub}</div>
                </div>
              ))}
            </div>

            {/* ── Linha 1: Painel 1 (por cultura) + Painel 2 (por moeda) ── */}
            <div style={{ display:"grid", gridTemplateColumns:"2fr 1fr", gap:14 }}>

              {/* Painel 1 — Comercialização Total por Cultura */}
              <div style={{ background:"#fff", borderRadius:12, border:"0.5px solid #DDE2EE", padding:"20px 24px" }}>
                <div style={{ fontSize:13, fontWeight:700, color:"#1a1a1a", marginBottom:16 }}>1. Comercialização por Cultura</div>
                {culturas.length === 0 ? (
                  <div style={{ fontSize:12, color:"#aaa", padding:"20px 0", textAlign:"center" }}>Sem dados</div>
                ) : culturas.map((c, i) => {
                  const pctSc  = maxCultSc > 0 ? (c.sc / maxCultSc * 100) : 0;
                  const pctEnt = c.sc > 0 ? (c.entSc / c.sc * 100) : 0;
                  return (
                    <div key={c.cultura} style={{ marginBottom:14 }}>
                      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"baseline", marginBottom:5 }}>
                        <span style={{ fontSize:12, fontWeight:700, color:"#1a1a1a" }}>{c.cultura}</span>
                        <div style={{ display:"flex", gap:12, alignItems:"baseline" }}>
                          <span style={{ fontSize:13, fontWeight:800, color:cor(i) }}>{fmtN(c.sc, 0)} sc</span>
                          <span style={{ fontSize:10, color:"#888" }}>{c.qtd} ctr(s)</span>
                        </div>
                      </div>
                      <div style={{ height:14, background:"#EEF1F6", borderRadius:7, overflow:"hidden", marginBottom:4 }}>
                        <div style={{ height:"100%", width:pctSc+"%", background:cor(i), borderRadius:7, position:"relative" }}>
                          <div style={{ position:"absolute", left:0, top:0, height:"100%", width:pctEnt+"%", background:"#16A34A", borderRadius:7 }} />
                        </div>
                      </div>
                      <div style={{ display:"flex", gap:12, fontSize:10, color:"#888" }}>
                        <span style={{ color:"#16A34A" }}>Entregue: {fmtN(c.entSc,0)} sc ({fmtN(pctEnt,0)}%)</span>
                        <span>Saldo: {fmtN(c.saldoSc,0)} sc</span>
                        {c.valBRL > 0 && <span style={{ color:"#1A4870", fontWeight:600 }}>{fmtR2(c.valBRL)}</span>}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Painel 2 — Volume por Moeda */}
              <div style={{ background:"#fff", borderRadius:12, border:"0.5px solid #DDE2EE", padding:"20px 24px" }}>
                <div style={{ fontSize:13, fontWeight:700, color:"#1a1a1a", marginBottom:16 }}>2. Volume por Moeda</div>
                {totalMoedaSc === 0 ? (
                  <div style={{ fontSize:12, color:"#aaa", textAlign:"center", padding:"20px 0" }}>Sem dados</div>
                ) : (
                  <>
                    <div style={{ display:"flex", justifyContent:"center", marginBottom:16 }}>
                      <svg width={130} height={130} viewBox="0 0 100 100">
                        {(() => {
                          const items = [
                            { sc: scBRL,    color:"#1A4870", label:"BRL" },
                            { sc: scUSD,    color:"#378ADD", label:"USD" },
                            { sc: scBarter, color:"#EF9F27", label:"Barter" },
                          ].filter(x => x.sc > 0);
                          let offset = 0;
                          const R = 35, cx = 50, cy = 50, circ = 2 * Math.PI * R;
                          return items.map((item, idx) => {
                            const dash = (item.sc / totalMoedaSc) * circ;
                            const el = (
                              <circle key={idx} cx={cx} cy={cy} r={R}
                                fill="none" stroke={item.color} strokeWidth={14}
                                strokeDasharray={dash+" "+(circ-dash)}
                                strokeDashoffset={-offset}
                                transform="rotate(-90 50 50)" />
                            );
                            offset += dash;
                            return el;
                          });
                        })()}
                        <text x="50" y="46" textAnchor="middle" fontSize="10" fontWeight="700" fill="#1a1a1a">{fmtN(totalMoedaSc,0)}</text>
                        <text x="50" y="57" textAnchor="middle" fontSize="7" fill="#888">sacas</text>
                      </svg>
                    </div>
                    {[
                      { sc: scBRL,    color:"#1A4870", label:"R$ (BRL)" },
                      { sc: scUSD,    color:"#378ADD", label:"US$ (USD)" },
                      { sc: scBarter, color:"#EF9F27", label:"Barter" },
                    ].filter(x => x.sc > 0).map(item => (
                      <div key={item.label} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:8, padding:"6px 10px", background:"#F8FAFD", borderRadius:8, border:"0.5px solid #EEF1F6" }}>
                        <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                          <span style={{ width:10, height:10, borderRadius:3, background:item.color, display:"inline-block" }} />
                          <span style={{ fontSize:12, color:"#555", fontWeight:600 }}>{item.label}</span>
                        </div>
                        <div style={{ textAlign:"right" }}>
                          <div style={{ fontSize:13, fontWeight:800, color:item.color }}>{fmtN(item.sc,0)} sc</div>
                          <div style={{ fontSize:9, color:"#888" }}>{totalMoedaSc>0?fmtN(item.sc/totalMoedaSc*100,1):0}%</div>
                        </div>
                      </div>
                    ))}
                  </>
                )}
              </div>
            </div>

            {/* ── Linha 2: Painel 3 (valor por cultura) + Painel 4 (preço médio) ── */}
            {culturas.length > 0 && (
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:14 }}>

                {/* Painel 3 — Valor de Venda Geral por Cultura */}
                <div style={{ background:"#fff", borderRadius:12, border:"0.5px solid #DDE2EE", padding:"20px 24px" }}>
                  <div style={{ fontSize:13, fontWeight:700, color:"#1a1a1a", marginBottom:16 }}>3. Valor de Venda por Cultura</div>
                  {culturas.map((c, i) => {
                    const maxVal = culturas.reduce((m, x) => Math.max(m, x.valBRL), 0);
                    const pct    = maxVal > 0 ? (c.valBRL / maxVal * 100) : 0;
                    return (
                      <div key={c.cultura} style={{ marginBottom:12 }}>
                        <div style={{ display:"flex", justifyContent:"space-between", marginBottom:4 }}>
                          <span style={{ fontSize:12, fontWeight:600, color:"#1a1a1a" }}>{c.cultura}</span>
                          <span style={{ fontSize:13, fontWeight:800, color:"#16A34A" }}>{c.valBRL>0?fmtR2(c.valBRL):"—"}</span>
                        </div>
                        <div style={{ height:10, background:"#EEF1F6", borderRadius:5, overflow:"hidden" }}>
                          <div style={{ height:"100%", width:pct+"%", background:cor(i), borderRadius:5 }} />
                        </div>
                        <div style={{ fontSize:10, color:"#888", marginTop:3 }}>{fmtN(c.sc,0)} sc · {c.qtd} contrato(s)</div>
                      </div>
                    );
                  })}
                </div>

                {/* Painel 4 — Média do Valor de Venda por Cultura */}
                <div style={{ background:"#fff", borderRadius:12, border:"0.5px solid #DDE2EE", padding:"20px 24px" }}>
                  <div style={{ fontSize:13, fontWeight:700, color:"#1a1a1a", marginBottom:16 }}>4. Preço Médio por Cultura</div>
                  {culturas.map((c, i) => (
                    <div key={c.cultura} style={{ background:"#F8FAFD", borderRadius:10, border:"0.5px solid #EEF1F6", padding:"12px 14px", marginBottom:10 }}>
                      <div style={{ display:"flex", alignItems:"center", gap:6, marginBottom:8 }}>
                        <span style={{ width:10, height:10, borderRadius:3, background:cor(i), display:"inline-block" }} />
                        <span style={{ fontSize:12, fontWeight:700, color:"#1a1a1a" }}>{c.cultura}</span>
                      </div>
                      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8 }}>
                        {c.mediaBRL > 0 && (
                          <div>
                            <div style={{ fontSize:9, color:"#555", marginBottom:2, fontWeight:600 }}>Média BRL</div>
                            <div style={{ fontSize:16, fontWeight:800, color:"#1A4870" }}>R$ {fmtN(c.mediaBRL,2)}/sc</div>
                          </div>
                        )}
                        {c.mediaUSD > 0 && (
                          <div>
                            <div style={{ fontSize:9, color:"#555", marginBottom:2, fontWeight:600 }}>Média USD</div>
                            <div style={{ fontSize:16, fontWeight:800, color:"#378ADD" }}>US$ {fmtN(c.mediaUSD,2)}/sc</div>
                            <div style={{ fontSize:9, color:"#888" }}>≈ R$ {fmtN(c.mediaUSD*ptax,2)}/sc</div>
                          </div>
                        )}
                        {c.mediaBRL === 0 && c.mediaUSD === 0 && (
                          <div style={{ fontSize:12, color:"#aaa", gridColumn:"1/-1" }}>Sem preço definido</div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ── Painel 5 — Comercializado por Produtor ── */}
            {produtores.length > 0 && (
              <div style={{ background:"#fff", borderRadius:12, border:"0.5px solid #DDE2EE", padding:"20px 24px" }}>
                <div style={{ fontSize:13, fontWeight:700, color:"#1a1a1a", marginBottom:16 }}>5. Comercializado por Produtor</div>
                <div style={{ display:"grid", gridTemplateColumns:"200px 1fr", gap:24, alignItems:"start" }}>
                  <svg width={200} height={200} viewBox="0 0 100 100">
                    {(() => {
                      const items = produtores.slice(0, 7);
                      let offset = 0;
                      const R = 35, cx = 50, cy = 50, circ = 2 * Math.PI * R;
                      return items.map((p, idx) => {
                        const dash = totalSc > 0 ? (p.sc / totalSc) * circ : 0;
                        const el = (
                          <circle key={idx} cx={cx} cy={cy} r={R}
                            fill="none" stroke={cor(idx)} strokeWidth={14}
                            strokeDasharray={dash+" "+(circ-dash)}
                            strokeDashoffset={-offset}
                            transform="rotate(-90 50 50)" />
                        );
                        offset += dash;
                        return el;
                      });
                    })()}
                    <text x="50" y="47" textAnchor="middle" fontSize="9" fontWeight="700" fill="#1a1a1a">{produtores.length}</text>
                    <text x="50" y="57" textAnchor="middle" fontSize="7" fill="#888">produtores</text>
                  </svg>
                  <table style={{ width:"100%", borderCollapse:"collapse", fontSize:12 }}>
                    <thead>
                      <tr style={{ background:"#F8FAFD" }}>
                        {["#","Produtor","Volume (sc)","% do total","Receita (BRL)","Contratos"].map((h, i) => (
                          <th key={h} style={{ padding:"6px 10px", textAlign:i>=2?"right":"left", fontSize:10, fontWeight:600, color:"#555", borderBottom:"0.5px solid #DDE2EE" }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {produtores.map((p, i) => (
                        <tr key={p.nome} style={{ borderBottom:"0.5px solid #EEF1F6", background:i%2===0?"#fff":"#FAFBFC" }}>
                          <td style={{ padding:"7px 10px" }}>
                            <span style={{ width:20, height:20, borderRadius:"50%", background:cor(i), color:"#fff", fontSize:9, fontWeight:700, display:"inline-flex", alignItems:"center", justifyContent:"center" }}>{i+1}</span>
                          </td>
                          <td style={{ padding:"7px 10px", fontWeight:600, color:"#1a1a1a" }}>{p.nome}</td>
                          <td style={{ padding:"7px 10px", textAlign:"right", fontWeight:700 }}>{fmtN(p.sc, 0)}</td>
                          <td style={{ padding:"7px 10px", textAlign:"right" }}>
                            <div style={{ display:"flex", alignItems:"center", gap:6, justifyContent:"flex-end" }}>
                              <div style={{ width:60, height:4, background:"#EEF1F6", borderRadius:2, overflow:"hidden" }}>
                                <div style={{ width:(totalSc>0?p.sc/totalSc*100:0)+"%", height:"100%", background:cor(i) }} />
                              </div>
                              <span style={{ fontSize:10, color:"#555", minWidth:30 }}>{totalSc>0?fmtN(p.sc/totalSc*100,1):0}%</span>
                            </div>
                          </td>
                          <td style={{ padding:"7px 10px", textAlign:"right", color:"#16A34A", fontWeight:600 }}>{p.valBRL>0?fmtR2(p.valBRL):"—"}</td>
                          <td style={{ padding:"7px 10px", textAlign:"right", color:"#888" }}>{p.qtd}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* ── Linha 3: Painel 6 (saldo sacas) + Painel 7 (saldo financeiro) ── */}
            {culturas.length > 0 && (
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:14 }}>

                {/* Painel 6 — Saldo em Sacas por Cultura */}
                <div style={{ background:"#fff", borderRadius:12, border:"0.5px solid #DDE2EE", padding:"20px 24px" }}>
                  <div style={{ fontSize:13, fontWeight:700, color:"#1a1a1a", marginBottom:4 }}>6. Saldo a Entregar por Cultura</div>
                  <div style={{ fontSize:11, color:"#888", marginBottom:16 }}>Sacas contratadas ainda não entregues</div>
                  {culturas.filter(c => c.saldoSc > 0).length === 0 ? (
                    <div style={{ fontSize:12, color:"#16A34A", fontWeight:600, textAlign:"center", padding:"20px 0" }}>Todas as sacas entregues!</div>
                  ) : culturas.filter(c => c.saldoSc > 0).map((c, i) => {
                    const maxSaldo = Math.max(...culturas.map(x => x.saldoSc));
                    const pct = maxSaldo > 0 ? (c.saldoSc / maxSaldo * 100) : 0;
                    return (
                      <div key={c.cultura} style={{ marginBottom:12 }}>
                        <div style={{ display:"flex", justifyContent:"space-between", marginBottom:4 }}>
                          <span style={{ fontSize:12, fontWeight:600 }}>{c.cultura}</span>
                          <span style={{ fontSize:13, fontWeight:800, color:"#E24B4A" }}>{fmtN(c.saldoSc,0)} sc</span>
                        </div>
                        <div style={{ height:10, background:"#EEF1F6", borderRadius:5, overflow:"hidden" }}>
                          <div style={{ height:"100%", width:pct+"%", background:"#E24B4A", borderRadius:5 }} />
                        </div>
                        <div style={{ fontSize:10, color:"#888", marginTop:3 }}>
                          de {fmtN(c.sc,0)} sc contratados · {c.sc>0?fmtN(c.entSc/c.sc*100,0):0}% entregue
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Painel 7 — Saldo Financeiro Projetado por Cultura */}
                <div style={{ background:"#fff", borderRadius:12, border:"0.5px solid #DDE2EE", padding:"20px 24px" }}>
                  <div style={{ fontSize:13, fontWeight:700, color:"#1a1a1a", marginBottom:4 }}>7. Receita Projetada a Realizar</div>
                  <div style={{ fontSize:11, color:"#888", marginBottom:16 }}>Saldo pendente × preço médio por cultura</div>
                  <div style={{ background:"#EBF3FC", borderRadius:8, padding:"10px 14px", marginBottom:14, display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                    <span style={{ fontSize:11, color:"#0B2D50", fontWeight:600 }}>Total projetado</span>
                    <span style={{ fontSize:16, fontWeight:800, color:"#1A4870" }}>{fmtR2(saldoFinProjBRL)}</span>
                  </div>
                  {culturas.filter(c => c.saldoSc > 0).map((c) => {
                    const precoRef = c.mediaBRL > 0 ? c.mediaBRL : (c.mediaUSD > 0 ? c.mediaUSD * ptax : precoMedPond);
                    const projBRL  = c.saldoSc * precoRef;
                    return (
                      <div key={c.cultura} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"8px 12px", background:"#F8FAFD", borderRadius:8, marginBottom:8, border:"0.5px solid #EEF1F6" }}>
                        <div>
                          <div style={{ fontSize:12, fontWeight:600, color:"#1a1a1a" }}>{c.cultura}</div>
                          <div style={{ fontSize:10, color:"#888" }}>{fmtN(c.saldoSc,0)} sc × {precoRef>0?"R$ "+fmtN(precoRef,2)+"/sc":"preço não definido"}</div>
                        </div>
                        <div style={{ fontSize:15, fontWeight:800, color:projBRL>0?"#14532D":"#888" }}>{projBRL>0?fmtR2(projBRL):"—"}</div>
                      </div>
                    );
                  })}
                  {culturas.every(c => c.saldoSc === 0) && (
                    <div style={{ fontSize:12, color:"#16A34A", fontWeight:600, textAlign:"center", padding:"20px 0" }}>Sem saldo a entregar!</div>
                  )}
                </div>
              </div>
            )}

            {/* ── Painel 8 — Gráfico de Barras por Comprador ── */}
            {compradores.length > 0 && (
              <div style={{ background:"#fff", borderRadius:12, border:"0.5px solid #DDE2EE", padding:"20px 24px" }}>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"baseline", marginBottom:16 }}>
                  <div style={{ fontSize:13, fontWeight:700, color:"#1a1a1a" }}>8. Volume por Comprador</div>
                  <span style={{ fontSize:11, color:"#888" }}>{compradores.length} compradores · {fmtN(totalSc,0)} sc total</span>
                </div>
                <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
                  {compradores.map((c, i) => {
                    const pct    = maxCompSc > 0 ? (c.sc / maxCompSc * 100) : 0;
                    const pctTot = totalSc   > 0 ? (c.sc / totalSc * 100) : 0;
                    const exp    = comprExpand.has(c.nome);
                    return (
                      <div key={c.nome}>
                        <div
                          onClick={() => { const n = new Set(comprExpand); if (exp) n.delete(c.nome); else n.add(c.nome); setComprExpand(n); }}
                          style={{ display:"flex", alignItems:"center", gap:12, cursor:"pointer", padding:"6px 4px", borderRadius:6, background:exp?"#EBF3FC":"transparent" }}>
                          <span style={{ fontSize:10, color:"#888", width:16, textAlign:"right", flexShrink:0 }}>{i+1}</span>
                          <span style={{ fontSize:12, fontWeight:600, color:"#1a1a1a", width:180, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", flexShrink:0 }}>{c.nome}</span>
                          <div style={{ flex:1, height:16, background:"#EEF1F6", borderRadius:8, overflow:"hidden" }}>
                            <div style={{ height:"100%", width:pct+"%", background:cor(i), borderRadius:8 }} />
                          </div>
                          <span style={{ fontSize:12, fontWeight:700, color:cor(i), width:80, textAlign:"right", flexShrink:0 }}>{fmtN(c.sc,0)} sc</span>
                          <span style={{ fontSize:10, color:"#888", width:36, textAlign:"right", flexShrink:0 }}>{fmtN(pctTot,1)}%</span>
                          <span style={{ fontSize:10, color:exp?"#1A4870":"#aaa", width:14 }}>{exp?"▲":"▼"}</span>
                        </div>
                        {exp && (
                          <div style={{ background:"#F8FAFD", borderRadius:8, border:"0.5px solid #EEF1F6", margin:"4px 0 8px 34px", overflow:"hidden" }}>
                            <table style={{ width:"100%", borderCollapse:"collapse", fontSize:11 }}>
                              <thead>
                                <tr style={{ background:"#EEF1F6" }}>
                                  {["Nº","Produto","Sacas","Entregue","% Ent.","Preço","Moeda","Status"].map((h, hi) => (
                                    <th key={h} style={{ padding:"5px 10px", textAlign:hi>=2?"right":"left", fontSize:9, fontWeight:600, color:"#555" }}>{h}</th>
                                  ))}
                                </tr>
                              </thead>
                              <tbody>
                                {c.contratos.map((ct, ci) => {
                                  const scCt   = recSc(ct);
                                  const entPct = scCt > 0 ? (entSc(ct) / scCt * 100) : 0;
                                  const stCol  = ct.status==="encerrado"?"#16A34A":ct.status==="cancelado"?"#E24B4A":"#EF9F27";
                                  return (
                                    <tr key={ci} style={{ borderBottom:"0.5px solid #EEF1F6" }}>
                                      <td style={{ padding:"5px 10px", color:"#888" }}>{ct.numero||"—"}</td>
                                      <td style={{ padding:"5px 10px", fontWeight:600 }}>{ct.produto}</td>
                                      <td style={{ padding:"5px 10px", textAlign:"right", fontWeight:700 }}>{fmtN(scCt,0)}</td>
                                      <td style={{ padding:"5px 10px", textAlign:"right" }}>{fmtN(entSc(ct),0)}</td>
                                      <td style={{ padding:"5px 10px", textAlign:"right" }}>
                                        <div style={{ display:"flex", alignItems:"center", gap:4, justifyContent:"flex-end" }}>
                                          <div style={{ width:28, height:3, background:"#DDE2EE", borderRadius:2, overflow:"hidden" }}>
                                            <div style={{ width:Math.min(entPct,100)+"%", height:"100%", background:entPct>=100?"#16A34A":"#EF9F27" }} />
                                          </div>
                                          <span style={{ fontSize:9, color:"#888" }}>{fmtN(entPct,0)}%</span>
                                        </div>
                                      </td>
                                      <td style={{ padding:"5px 10px", textAlign:"right" }}>
                                        {(ct.preco??0)>0?<span style={{ color:ct.moeda==="USD"?"#378ADD":"#1A4870", fontWeight:600 }}>{ct.moeda==="USD"?"US$":"R$"} {fmtN(ct.preco!,2)}</span>:<span style={{ color:"#aaa" }}>—</span>}
                                      </td>
                                      <td style={{ padding:"5px 10px", textAlign:"right" }}>
                                        <span style={{ background:ct.moeda==="USD"?"#EBF3FC":"#F0F5FF", color:ct.moeda==="USD"?"#378ADD":"#1A4870", borderRadius:6, padding:"1px 5px", fontSize:9, fontWeight:700 }}>{ct.moeda??"BRL"}</span>
                                      </td>
                                      <td style={{ padding:"5px 10px", textAlign:"right" }}>
                                        <span style={{ color:stCol, fontWeight:600, fontSize:9, textTransform:"capitalize" }}>{ct.status}</span>
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {contratosVisiveis.length === 0 && (
              <div style={{ textAlign:"center", padding:60, color:"#888", fontSize:13, background:"#fff", borderRadius:12, border:"0.5px solid #DDE2EE" }}>
                Nenhum contrato encontrado para os filtros selecionados.
              </div>
            )}

          </div>
          );
        })()}

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
                  {lancamentosFiltrados.filter(l => l.status !== "baixado").sort((a, b) => a.data_vencimento.localeCompare(b.data_vencimento)).slice(0, 30).map((l, i, arr) => {
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

        {/* ═══════════ CÂMBIO / USD ═══════════ */}
        {!loading && aba === "cambio" && (() => {
          // ── Fluxo USD — filtrado por ANO CIVIL (independente do filtro de safra) ──
          const anoFiltro = filtroCambioAno === "todos" ? null : Number(filtroCambioAno);
          const dentroDoAno = (dt?: string | null) => {
            if (!dt) return false;
            if (!anoFiltro) return true;
            return dt.startsWith(String(anoFiltro));
          };

          // Lançamentos USD — usa lista bruta (não filtrada por safra)
          const cpUsdLan = lancamentos.filter(l =>
            l.tipo === "pagar" && l.moeda === "USD" && l.status !== "baixado" && dentroDoAno(l.data_vencimento)
          );
          const crUsdLan = lancamentos.filter(l =>
            l.tipo === "receber" && l.moeda === "USD" && l.status !== "baixado" && dentroDoAno(l.data_vencimento)
          );
          // CF: parcelas em aberto de contratos USD
          const cfUsdContratos = cfContratos.filter(c => c.moeda === "USD" && c.status !== "cancelado");
          const cfUsdIds = new Set(cfUsdContratos.map(c => c.id));
          const cfUsdParcelas = cfParcelas.filter(p =>
            cfUsdIds.has(p.contrato_id) && p.status !== "pago" && dentroDoAno(p.data_vencimento)
          );
          // CR de contratos de grãos USD — filtro por ano civil do vencimento
          const crUsdCon = contratos.filter(c =>
            c.moeda === "USD" &&
            c.status !== "cancelado" &&
            !c.is_arrendamento &&
            c.preco &&
            c.quantidade_sc &&
            dentroDoAno(c.data_pagamento || c.data_entrega)
          );

          // Agrupa por data
          const porData: Map<string, { cpUsd: number; crUsd: number; items: { tipo: "cp"|"cr"; desc: string; valor: number }[] }> = new Map();
          const addDate = (dt: string) => { if (!porData.has(dt)) porData.set(dt, { cpUsd: 0, crUsd: 0, items: [] }); };

          for (const l of cpUsdLan) {
            const dt = l.data_vencimento;
            addDate(dt);
            const e = porData.get(dt)!;
            e.cpUsd  += l.valor;
            e.items.push({ tipo: "cp", desc: l.descricao || "—", valor: l.valor });
          }
          for (const l of crUsdLan) {
            const dt = l.data_vencimento;
            addDate(dt);
            const e = porData.get(dt)!;
            e.crUsd  += l.valor;
            e.items.push({ tipo: "cr", desc: l.descricao || "—", valor: l.valor });
          }
          for (const c of crUsdCon) {
            const dt = c.data_pagamento || c.data_entrega!;
            addDate(dt);
            const e = porData.get(dt)!;
            // quantidade_sc armazena KG — divide por 60 para obter sacas
            const sacas = (c.quantidade_sc ?? 0) / 60;
            const val   = (c.preco ?? 0) * sacas;
            e.crUsd  += val;
            e.items.push({ tipo: "cr", desc: `Contrato ${c.numero ?? c.comprador ?? "—"} — ${c.produto}`, valor: val });
          }
          // CF: parcelas USD em aberto (amortização + juros = saída USD futura)
          for (const p of cfUsdParcelas) {
            const dt = p.data_vencimento;
            if (!dt) continue;
            addDate(dt);
            const e = porData.get(dt)!;
            const val = (p.amortizacao ?? 0) + (p.juros ?? 0) + (p.despesas_acessorios ?? 0);
            const cf  = cfUsdContratos.find(c => c.id === p.contrato_id);
            e.cpUsd  += val;
            e.items.push({ tipo: "cp", desc: `${cf?.descricao ?? "Contrato"} — Parcela ${p.num_parcela} (CF)`, valor: val });
          }

          const datas = Array.from(porData.keys()).sort();
          const totalCpUsdLanc = cpUsdLan.reduce((s, l) => s + l.valor, 0);
          const totalCpUsdCf   = cfUsdParcelas.reduce((s, p) => s + (p.amortizacao ?? 0) + (p.juros ?? 0) + (p.despesas_acessorios ?? 0), 0);
          const totalCpUsd = totalCpUsdLanc + totalCpUsdCf;
          const totalCrUsd = crUsdLan.reduce((s, l) => s + l.valor, 0) + crUsdCon.reduce((s, c) => s + (c.preco ?? 0) * ((c.quantidade_sc ?? 0) / 60), 0);
          const saldoUsd   = totalCrUsd - totalCpUsd;
          const descasadas = datas.filter(dt => (porData.get(dt)!.cpUsd) > (porData.get(dt)!.crUsd));
          const cotacao    = precos?.usdBrl ?? 5.10;

          // ── Cessão de Crédito ───────────────────────────────────
          const conCessao = contratos.filter(c => c.dado_em_cessao && c.status !== "cancelado");

          return (
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              {/* KPIs USD */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 12 }}>
                {[
                  { label: "Total CP em USD",       v: `USD ${fmtN(totalCpUsd, 2)}`,  sub: fmtR(totalCpUsd * cotacao),  color: "#E24B4A", bg: "#FCEBEB" },
                  { label: "Total CR em USD",        v: `USD ${fmtN(totalCrUsd, 2)}`, sub: fmtR(totalCrUsd * cotacao),   color: "#16A34A", bg: "#ECFDF5" },
                  { label: "Saldo Líquido USD",      v: `${saldoUsd >= 0 ? "+" : ""}USD ${fmtN(Math.abs(saldoUsd), 2)}`, sub: saldoUsd >= 0 ? "Posição coberta" : "Posição descoberta", color: saldoUsd >= 0 ? "#16A34A" : "#E24B4A", bg: saldoUsd >= 0 ? "#ECFDF5" : "#FCEBEB" },
                  { label: "Datas Descasadas",       v: `${descasadas.length}`,         sub: descasadas.length > 0 ? "risco cambial" : "todas cobertas",   color: descasadas.length > 0 ? "#E24B4A" : "#16A34A", bg: descasadas.length > 0 ? "#FCEBEB" : "#ECFDF5" },
                ].map(k => (
                  <div key={k.label} style={{ background: k.bg, borderRadius: 10, padding: "14px 16px", border: "0.5px solid #DDE2EE" }}>
                    <div style={{ fontSize: 10, color: "#666", marginBottom: 4 }}>{k.label}</div>
                    <div style={{ fontSize: 17, fontWeight: 700, color: k.color }}>{k.v}</div>
                    <div style={{ fontSize: 10, color: "#888", marginTop: 2 }}>{k.sub}</div>
                  </div>
                ))}
              </div>

              {/* Cotação + seletor de ano civil */}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: -6 }}>
                <span style={{ fontSize: 11, color: "#888" }}>
                  Cotação usada: USD/BRL {fmtN(cotacao, 4)} · {precos ? "ao vivo" : "estimada"}
                </span>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ fontSize: 11, color: "#555" }}>Ano civil:</span>
                  <div style={{ display: "flex", gap: 4 }}>
                    {["todos", ...Array.from({ length: 6 }, (_, i) => String(new Date().getFullYear() + i - 1))].map(ano => (
                      <button key={ano} type="button" onClick={() => setFiltroCambioAno(ano)}
                        style={{
                          fontSize: 11, fontWeight: 600, padding: "3px 10px", borderRadius: 6, border: "0.5px solid",
                          cursor: "pointer",
                          borderColor:  filtroCambioAno === ano ? "#1A4870" : "#DDE2EE",
                          background:   filtroCambioAno === ano ? "#1A4870" : "#fff",
                          color:        filtroCambioAno === ano ? "#fff"    : "#555",
                        }}>
                        {ano === "todos" ? "Todos" : ano}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Timeline de fluxo USD */}
              {datas.length === 0 ? (
                <div style={{ background: "#fff", borderRadius: 12, border: "0.5px solid #DDE2EE", padding: "40px 20px", textAlign: "center", color: "#aaa", fontSize: 13 }}>
                  Nenhum lançamento em USD encontrado.<br />
                  <span style={{ fontSize: 11 }}>CP e CR em moeda USD aparecerão aqui para análise de descasamento.</span>
                </div>
              ) : (
                <div style={{ background: "#fff", borderRadius: 12, border: "0.5px solid #DDE2EE", overflow: "hidden" }}>
                  <div style={{ padding: "12px 20px", borderBottom: "0.5px solid #DDE2EE", background: "#1A4870", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: "#fff" }}>Fluxo USD por Data</span>
                    <span style={{ fontSize: 11, color: "rgba(255,255,255,0.6)" }}>
                      {descasadas.length > 0
                        ? `⚠ ${descasadas.length} data${descasadas.length > 1 ? "s" : ""} descasada${descasadas.length > 1 ? "s" : ""} — risco de exposição cambial`
                        : "✓ Todas as datas com USD coberto"}
                    </span>
                  </div>
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead>
                      <tr style={{ background: "#F8FAFD" }}>
                        {["Data", "CP a Pagar (USD)", "CR a Receber (USD)", "Saldo USD", "Saldo BRL", "Status"].map((h, i) => (
                          <th key={h} style={{ padding: "8px 16px", textAlign: i >= 1 ? "right" : "left", fontSize: 10, fontWeight: 600, color: "#555", borderBottom: "0.5px solid #DDE2EE" }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {datas.map((dt, i) => {
                        const e = porData.get(dt)!;
                        const net = e.crUsd - e.cpUsd;
                        const descasado = e.cpUsd > e.crUsd;
                        const maxVal = Math.max(e.cpUsd, e.crUsd, 1);
                        return (
                          <tr key={dt}
                            onClick={() => router.push(`/financeiro/pagar?vencDe=${dt}&vencAte=${dt}&moeda=USD`)}
                            style={{ borderBottom: i < datas.length - 1 ? "0.5px solid #EEF1F6" : "none", background: descasado ? "#FFF8F8" : "transparent", cursor: "pointer" }}
                            title="Ver no Contas a Pagar"
                          >
                            <td style={{ padding: "10px 16px" }}>
                              <div style={{ fontSize: 12, fontWeight: 600, color: "#1a1a1a" }}>{fmtDt(dt)}</div>
                              {/* mini-barras */}
                              <div style={{ marginTop: 4, display: "flex", flexDirection: "column", gap: 2 }}>
                                {e.cpUsd > 0 && (
                                  <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                                    <span style={{ fontSize: 9, color: "#E24B4A", width: 18 }}>CP</span>
                                    <div style={{ flex: 1, height: 4, borderRadius: 2, background: "#EEF1F6", overflow: "hidden", minWidth: 80 }}>
                                      <div style={{ width: `${pct(e.cpUsd, maxVal)}%`, height: "100%", background: "#E24B4A" }} />
                                    </div>
                                  </div>
                                )}
                                {e.crUsd > 0 && (
                                  <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                                    <span style={{ fontSize: 9, color: "#16A34A", width: 18 }}>CR</span>
                                    <div style={{ flex: 1, height: 4, borderRadius: 2, background: "#EEF1F6", overflow: "hidden", minWidth: 80 }}>
                                      <div style={{ width: `${pct(e.crUsd, maxVal)}%`, height: "100%", background: "#16A34A" }} />
                                    </div>
                                  </div>
                                )}
                              </div>
                            </td>
                            <td style={{ padding: "10px 16px", textAlign: "right" }}>
                              <div style={{ fontSize: 12, fontWeight: 600, color: e.cpUsd > 0 ? "#E24B4A" : "#888" }}>
                                {e.cpUsd > 0 ? `USD ${fmtN(e.cpUsd, 2)}` : "—"}
                              </div>
                              {e.items.filter(x => x.tipo === "cp").slice(0, 2).map((x, j) => (
                                <div key={j} style={{ fontSize: 9, color: "#888", marginTop: 1 }}>{x.desc.slice(0, 35)}</div>
                              ))}
                            </td>
                            <td style={{ padding: "10px 16px", textAlign: "right" }}>
                              <div style={{ fontSize: 12, fontWeight: 600, color: e.crUsd > 0 ? "#16A34A" : "#888" }}>
                                {e.crUsd > 0 ? `USD ${fmtN(e.crUsd, 2)}` : "—"}
                              </div>
                              {e.items.filter(x => x.tipo === "cr").slice(0, 2).map((x, j) => (
                                <div key={j} style={{ fontSize: 9, color: "#888", marginTop: 1 }}>{x.desc.slice(0, 35)}</div>
                              ))}
                            </td>
                            <td style={{ padding: "10px 16px", textAlign: "right" }}>
                              <div style={{ fontSize: 13, fontWeight: 700, color: net >= 0 ? "#16A34A" : "#E24B4A" }}>
                                {net >= 0 ? "+" : ""}USD {fmtN(Math.abs(net), 2)}
                              </div>
                            </td>
                            <td style={{ padding: "10px 16px", textAlign: "right", fontSize: 11, color: "#555" }}>
                              {net >= 0 ? "+" : ""}{fmtR(net * cotacao)}
                            </td>
                            <td style={{ padding: "10px 16px", textAlign: "right" }}>
                              {descasado ? (
                                <span style={{ background: "#FCEBEB", color: "#791F1F", borderRadius: 5, padding: "2px 8px", fontSize: 10, fontWeight: 700 }}>
                                  Descasado ⚠
                                </span>
                              ) : e.cpUsd === 0 ? (
                                <span style={{ background: "#ECFDF5", color: "#14532D", borderRadius: 5, padding: "2px 8px", fontSize: 10 }}>
                                  Só CR
                                </span>
                              ) : (
                                <span style={{ background: "#ECFDF5", color: "#14532D", borderRadius: 5, padding: "2px 8px", fontSize: 10 }}>
                                  Coberto ✓
                                </span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>

                  {/* Resumo de descasamento */}
                  {descasadas.length > 0 && (
                    <div style={{ padding: "12px 20px", background: "#FFF3F3", borderTop: "0.5px solid #FECACA" }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: "#991B1B", marginBottom: 8 }}>
                        Datas com exposição cambial descoberta:
                      </div>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                        {descasadas.map(dt => {
                          const e = porData.get(dt)!;
                          const expUsd = e.cpUsd - e.crUsd;
                          return (
                            <div key={dt}
                              onClick={() => router.push(`/financeiro/pagar?vencDe=${dt}&vencAte=${dt}&moeda=USD`)}
                              style={{ background: "#fff", border: "0.5px solid #FECACA", borderRadius: 8, padding: "8px 12px", cursor: "pointer" }}
                              title="Ver no Contas a Pagar"
                            >
                              <div style={{ fontSize: 12, fontWeight: 700, color: "#1a1a1a" }}>{fmtDt(dt)}</div>
                              <div style={{ fontSize: 11, color: "#E24B4A", marginTop: 2 }}>CP: USD {fmtN(e.cpUsd, 2)}</div>
                              <div style={{ fontSize: 11, color: "#16A34A" }}>CR: USD {fmtN(e.crUsd, 2)}</div>
                              <div style={{ fontSize: 11, fontWeight: 700, color: "#E24B4A", marginTop: 4 }}>Exposto: USD {fmtN(expUsd, 2)}</div>
                              <div style={{ fontSize: 10, color: "#888" }}>{fmtR(expUsd * cotacao)}</div>
                              <div style={{ fontSize: 9, color: "#1A4870", marginTop: 4 }}>↗ Ver CP</div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* ── Cessão de Crédito ──────────────────────────────── */}
              <div style={{ background: "#fff", borderRadius: 12, border: "0.5px solid #DDE2EE", overflow: "hidden" }}>
                <div style={{ padding: "12px 20px", borderBottom: "0.5px solid #DDE2EE", background: "#1A4870", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div>
                    <span style={{ fontSize: 12, fontWeight: 700, color: "#fff" }}>Contratos Dados em Cessão de Crédito</span>
                    <span style={{ fontSize: 11, color: "rgba(255,255,255,0.6)", marginLeft: 8 }}>Recebíveis cedidos a fornecedores para quitação de CP</span>
                  </div>
                  {cessoesPendentes > 0 && (
                    <span style={{ background: "#EDE9FE", color: "#5B21B6", borderRadius: 6, padding: "3px 10px", fontSize: 11, fontWeight: 700 }}>
                      {cessoesPendentes} cessão{cessoesPendentes > 1 ? "ões" : ""}
                    </span>
                  )}
                </div>

                {conCessao.length === 0 ? (
                  <div style={{ padding: "32px 20px", textAlign: "center", color: "#aaa", fontSize: 13 }}>
                    Nenhum contrato dado em cessão de crédito.<br />
                    <span style={{ fontSize: 11 }}>Contratos cedidos a fornecedores aparecerão aqui com os CPs vinculados.</span>
                  </div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column" }}>
                    {conCessao.map((c, ci) => {
                      const debitos = cessaoDebitos.filter(d => d.contrato_id === c.id);
                      const totalCessao = debitos.reduce((s, d) => s + d.valor_cessao, 0);
                      // quantidade_sc armazena KG — divide por 60 para sacas
                      const sacasContrato  = (c.quantidade_sc ?? 0) / 60;
                      const receitaContrato = (c.preco ?? 0) * sacasContrato;
                      const coberturaPct = receitaContrato > 0 ? Math.min(100, (totalCessao / receitaContrato) * 100) : 0;
                      return (
                        <div key={c.id} style={{ borderBottom: ci < conCessao.length - 1 ? "0.5px solid #EEF1F6" : "none" }}>
                          {/* Linha do contrato */}
                          <div style={{ padding: "14px 20px", display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr 1fr", gap: 16, alignItems: "start", background: "#FDFCFF" }}>
                            <div>
                              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                                <span style={{ background: "#EDE9FE", color: "#5B21B6", borderRadius: 4, padding: "1px 7px", fontSize: 10, fontWeight: 700 }}>CESSÃO</span>
                                <span style={{ fontSize: 12, fontWeight: 700, color: "#1a1a1a" }}>{c.numero ?? `Contrato ${ci + 1}`}</span>
                              </div>
                              <div style={{ fontSize: 11, color: "#555" }}>{c.comprador} · {c.produto} · {c.safra ?? "—"}</div>
                            </div>
                            <div>
                              <div style={{ fontSize: 10, color: "#888", marginBottom: 2 }}>Cedido a</div>
                              <div style={{ fontSize: 12, fontWeight: 600, color: "#5B21B6" }}>{c.cessao_fornecedor_nome ?? "—"}</div>
                              <div style={{ fontSize: 10, color: "#888", marginTop: 1 }}>{c.cessao_data ? fmtDt(c.cessao_data) : "—"}</div>
                            </div>
                            <div>
                              <div style={{ fontSize: 10, color: "#888", marginBottom: 2 }}>Valor do contrato</div>
                              <div style={{ fontSize: 12, fontWeight: 600, color: "#1a1a1a" }}>
                                {fmtN((c.quantidade_sc ?? 0) / 60, 0)} sc × {c.preco ? (c.moeda === "USD" ? `USD ${fmtN(c.preco, 2)}` : fmtR2(c.preco)) : "—"}
                              </div>
                              <div style={{ fontSize: 10, color: "#888", marginTop: 1 }}>{receitaContrato > 0 ? fmtR(receitaContrato) : "—"}</div>
                            </div>
                            <div>
                              <div style={{ fontSize: 10, color: "#888", marginBottom: 2 }}>CP cobertos pela cessão</div>
                              <div style={{ fontSize: 12, fontWeight: 700, color: "#E24B4A" }}>{fmtR(totalCessao)}</div>
                              {receitaContrato > 0 && (
                                <div style={{ fontSize: 10, color: "#888", marginTop: 1 }}>{fmtN(coberturaPct, 0)}% do valor do contrato</div>
                              )}
                            </div>
                            <div>
                              <div style={{ fontSize: 10, color: "#888", marginBottom: 4 }}>Cobertura</div>
                              <div style={{ height: 6, borderRadius: 3, background: "#EEF1F6", overflow: "hidden", marginBottom: 3 }}>
                                <div style={{ width: `${coberturaPct}%`, height: "100%", background: coberturaPct >= 100 ? "#16A34A" : "#9B59B6" }} />
                              </div>
                              <div style={{ fontSize: 10, color: coberturaPct >= 100 ? "#16A34A" : "#9B59B6", fontWeight: 600 }}>
                                {fmtN(coberturaPct, 0)}%
                              </div>
                            </div>
                          </div>

                          {/* CPs vinculados */}
                          {debitos.length > 0 && (
                            <div style={{ padding: "0 20px 14px 20px" }}>
                              <div style={{ fontSize: 10, color: "#888", marginBottom: 6 }}>CP VINCULADOS A ESTA CESSÃO:</div>
                              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                                {debitos.map(d => {
                                  const lan = lancamentos.find(l => l.id === d.lancamento_id);
                                  return (
                                    <div key={d.id} style={{ background: "#F9F5FF", border: "0.5px solid #DDD0F7", borderRadius: 7, padding: "6px 12px" }}>
                                      <div style={{ fontSize: 11, fontWeight: 600, color: "#1a1a1a" }}>{lan?.descricao ?? d.lancamento_id.slice(0, 8)}</div>
                                      <div style={{ fontSize: 10, color: "#888", marginTop: 1 }}>{lan?.data_vencimento ? fmtDt(lan.data_vencimento) : "—"} · Cessão: {fmtR(d.valor_cessao)}</div>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          )}
                          {debitos.length === 0 && (
                            <div style={{ padding: "0 20px 14px 60px", fontSize: 11, color: "#aaa", fontStyle: "italic" }}>
                              Nenhum CP vinculado — execute a vinculação em Contas a Pagar
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          );
        })()}

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

        {/* ═══════════ RECURSOS DE TERCEIROS ═══════════ */}
        {!loading && aba === "terceiros" && (() => {
          const maxCaptado = Math.max(...rtPorAno.map(b => b.captado), 1);
          const corTipo: Record<string, string> = { CPR: "#1A4870", Custeio: "#16A34A", EGF: "#9B59B6", Empréstimo: "#E24B4A", Financiamento: "#378ADD", PRONAF: "#EF9F27", Outros: "#888" };
          const temDados = rtTotalCaptado > 0 || rtTotalPago > 0 || rtTotalJuros > 0 || cfContratos.filter(c => c.status !== "cancelado").length > 0;

          // Filtro local por ano/safra
          const rtPorAnoFiltrado = rtFiltroLabel === "todos" ? rtPorAno : rtPorAno.filter(b => b.label === rtFiltroLabel);
          const rtFiltCaptado = rtPorAnoFiltrado.reduce((s, b) => s + b.captado, 0);

          // Lançamentos RT filtrados pelo ano selecionado (para "Por Tipo de Operação")
          const rtLancsFiltAno = rtFiltroLabel === "todos"
            ? lancamentosFiltrados
            : lancamentosFiltrados.filter(l => {
                const lbl = l.ano_safra_id
                  ? (anosSafra.find(a => a.id === l.ano_safra_id)?.descricao ?? l.data_vencimento.slice(0, 4))
                  : l.data_vencimento.slice(0, 4);
                return lbl === rtFiltroLabel;
              });
          const TIPO_CF_LABEL: Record<string, string> = {
            cpr: "CPR", custeio: "Custeio", egf: "EGF", investimento: "Financiamento",
            outros: "Empréstimo", securitizacao: "Outros", pronaf: "PRONAF",
            consorcio_contemplado: "Consórcio Contemplado",
            consorcio_nao_contemplado: "Consórcio Não Contemplado",
            compra_terra: "Compra de Terra / Imóvel", compra_imovel: "Compra de Terra / Imóvel",
          };
          // CF-based "Por Tipo de Operação"
          const cfFiltAno = rtFiltroLabel === "todos"
            ? cfContratos.filter(c => c.status !== "cancelado")
            : cfContratos.filter(c => c.status !== "cancelado" && (c.data_contrato ?? "").slice(0, 4) === rtFiltroLabel);
          const cfParcFiltAno = rtFiltroLabel === "todos"
            ? cfParcelas
            : cfParcelas.filter(p => p.data_vencimento.slice(0, 4) === rtFiltroLabel);
          const rtPorTipoCF = TIPOS_RT.map(tipo => {
            const cfMatches = cfFiltAno.filter(c => (TIPO_CF_LABEL[c.tipo ?? "outros"] ?? "Outros") === tipo);
            const cfIds = new Set(cfMatches.map(c => c.id));
            const captado = cfMatches.reduce((s, c) => s + (c.moeda === "USD" ? (c.valor_total ?? 0) * (c.cotacao_usd ?? 5.0) : (c.valor_total ?? 0)), 0);
            const pago    = cfParcFiltAno.filter(p => cfIds.has(p.contrato_id) && p.status === "pago").reduce((s, p) => s + (p.amortizacao ?? 0), 0);
            const juros   = cfParcFiltAno.filter(p => cfIds.has(p.contrato_id) && p.status === "pago").reduce((s, p) => s + (p.juros ?? 0), 0);
            return { tipo, captado, pago, juros, saldo: captado - pago };
          });
          // Fallback: lançamentos manuais (não auto) para tipos não cobertos por CF
          const rtPorTipoLanc = TIPOS_RT.map(tipo => {
            const captado = rtLancsFiltAno.filter(l => !l.auto && isCaptacao(l)  && tipoRT(l) === tipo).reduce((s, l) => s + l.valor, 0);
            const pago    = rtLancsFiltAno.filter(l => !l.auto && isPrincipal(l) && tipoRT(l) === tipo && l.status === "baixado").reduce((s, l) => s + l.valor, 0);
            const juros   = rtLancsFiltAno.filter(l => !l.auto && isJurosPgto(l) && tipoRT(l) === tipo && l.status === "baixado").reduce((s, l) => s + l.valor, 0);
            return { tipo, captado, pago, juros, saldo: captado - pago };
          });
          const rtPorTipo = TIPOS_RT.map((tipo, i) => ({
            tipo,
            captado: rtPorTipoCF[i].captado + rtPorTipoLanc[i].captado,
            pago:    rtPorTipoCF[i].pago    + rtPorTipoLanc[i].pago,
            juros:   rtPorTipoCF[i].juros   + rtPorTipoLanc[i].juros,
            saldo:   (rtPorTipoCF[i].captado + rtPorTipoLanc[i].captado) - (rtPorTipoCF[i].pago + rtPorTipoLanc[i].pago),
          })).filter(t => t.captado > 0 || t.pago > 0 || t.juros > 0);
          const rtFiltPago    = rtPorAnoFiltrado.reduce((s, b) => s + b.pago,    0);
          const rtFiltJuros   = rtPorAnoFiltrado.reduce((s, b) => s + b.juros,   0);
          const rtFiltPend    = rtPorAnoFiltrado.reduce((s, b) => s + b.jurosPend, 0);
          const rtFiltSaldo   = rtFiltCaptado - rtFiltPago;

          // Exportação XLSX
          async function exportarXLSX() {
            setExportandoRT(true);
            const XLSX = await import("xlsx");
            const wb = XLSX.utils.book_new();
            const fazNome = fazenda?.nome ?? "Fazenda";
            const dataHoje = new Date().toLocaleDateString("pt-BR");

            // Aba Resumo
            const resumo = [
              [`Recursos de Terceiros — ${fazNome}`, "", dataHoje],
              rtFiltroLabel !== "todos" ? ["Filtro:", rtFiltroLabel, ""] : [],
              [],
              ["Métrica", "Valor (R$)"],
              ["Total Captado",    rtFiltCaptado],
              ["Pago (Principal)", rtFiltPago],
              ["Saldo Devedor",    rtFiltSaldo],
              ["Juros Pagos",      rtFiltJuros],
              ["Juros Pendentes",  rtFiltPend],
            ].filter(r => r.length > 0);
            XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(resumo), "Resumo");

            // Aba Histórico por Ano
            const historico = [
              ["Ano / Safra", "Captado (R$)", "Pago Principal (R$)", "Juros Pagos (R$)", "Juros Pend. (R$)", "Saldo Devedor (R$)", "% Devolvido"],
              ...rtPorAnoFiltrado.map(b => {
                const pct = b.captado > 0 ? Math.round((b.pago + b.juros) / b.captado * 100) : 0;
                return [b.label, b.captado, b.pago, b.juros, b.jurosPend, b.saldo, `${pct}%`];
              }),
              ["TOTAL", rtFiltCaptado, rtFiltPago, rtFiltJuros, rtFiltPend, rtFiltSaldo, ""],
            ];
            XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(historico), "Por Ano");

            // Aba Lançamentos detalhados
            const rtLancs = lancamentosFiltrados
              .filter(l => isCaptacao(l) || isPrincipal(l) || isJurosPgto(l))
              .filter(l => {
                if (rtFiltroLabel === "todos") return true;
                const lLabel = l.ano_safra_id
                  ? (anosSafra.find(a => a.id === l.ano_safra_id)?.descricao ?? l.data_vencimento.slice(0, 4))
                  : l.data_vencimento.slice(0, 4);
                return lLabel === rtFiltroLabel;
              })
              .sort((a, b) => a.data_vencimento.localeCompare(b.data_vencimento));
            const lancSheet = [
              ["Ano/Safra", "Descrição", "Categoria", "Vencimento", "Tipo", "Valor (R$)", "Status"],
              ...rtLancs.map(l => {
                const label = l.ano_safra_id
                  ? (anosSafra.find(a => a.id === l.ano_safra_id)?.descricao ?? l.data_vencimento.slice(0, 4))
                  : l.data_vencimento.slice(0, 4);
                return [
                  label, l.descricao, l.categoria || "",
                  l.data_vencimento,
                  isCaptacao(l) ? "Captação" : isJurosPgto(l) ? "Juros/Encargo" : "Amortização",
                  l.valor,
                  l.status === "baixado" ? "Baixado" : l.status === "vencido" ? "Vencido" : "Em aberto",
                ];
              }),
            ];
            XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(lancSheet), "Lançamentos");

            XLSX.writeFile(wb, `RecursosTerceiros_${fazNome.replace(/\s+/g, "_")}_${new Date().toISOString().split("T")[0]}.xlsx`);
            setExportandoRT(false);
          }

          const rtJurosHaFilt = areaTotal > 0 ? (rtFiltJuros + rtFiltPend) / areaTotal : 0;

          return (
            <div>
              {/* Toolbar: filtro + exportação */}
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14, flexWrap: "wrap" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 12, color: "#555", fontWeight: 600, whiteSpace: "nowrap" }}>Ano / Safra:</span>
                  <select value={rtFiltroLabel} onChange={e => { setRtFiltroLabel(e.target.value); setRtDrillLabel(null); }}
                    style={{ padding: "6px 10px", border: "0.5px solid #D4DCE8", borderRadius: 8, fontSize: 12, color: "#1a1a1a", background: "#fff", outline: "none", cursor: "pointer" }}>
                    <option value="todos">Todos os anos</option>
                    {rtPorAno.map(b => <option key={b.label} value={b.label}>{b.label}{b.captado === 0 ? " (sem captação)" : ""}</option>)}
                  </select>
                  {rtFiltroLabel !== "todos" && (
                    <button onClick={() => { setRtFiltroLabel("todos"); setRtDrillLabel(null); }}
                      style={{ padding: "4px 10px", background: "#F4F6FA", border: "0.5px solid #D4DCE8", borderRadius: 6, fontSize: 11, color: "#555", cursor: "pointer" }}>
                      ✕ limpar
                    </button>
                  )}
                </div>
                <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
                  <button onClick={() => window.print()}
                    style={{ padding: "6px 14px", background: "#fff", border: "0.5px solid #D4DCE8", borderRadius: 8, fontSize: 12, color: "#555", cursor: "pointer", fontWeight: 600 }}>
                    ⎙ PDF
                  </button>
                  <button onClick={exportarXLSX} disabled={exportandoRT}
                    style={{ padding: "6px 14px", background: "#1A4870", color: "#fff", border: "none", borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: exportandoRT ? "not-allowed" : "pointer", opacity: exportandoRT ? 0.7 : 1 }}>
                    {exportandoRT ? "Exportando…" : "↓ XLSX"}
                  </button>
                </div>
              </div>

              {/* KPIs */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: 12, marginBottom: 20 }}>
                {[
                  { label: "Total Captado",    v: fmtR(rtFiltCaptado),    color: "#14532D", bg: "#ECFDF5",  hint: "Entradas de CPR, custeio, empréstimos, EGF" },
                  { label: "Pago (Principal)", v: fmtR(rtFiltPago),       color: "#0C447C", bg: "#EBF3FC",  hint: "Principal devolvido (baixados)" },
                  { label: "Saldo Devedor",    v: fmtR(rtSaldoDevedor),   color: rtSaldoDevedor > 0 ? "#791F1F" : "#14532D", bg: rtSaldoDevedor > 0 ? "#FCEBEB" : "#ECFDF5", hint: "Saldo devedor total acumulado (todos os anos)" },
                  { label: "Juros Pagos",      v: fmtR(rtFiltJuros),    color: "#633806", bg: "#FAEEDA",  hint: "Juros e encargos baixados" },
                  { label: "Juros / ha",       v: areaTotal > 0 ? fmtR2(rtJurosHaFilt) : "—", color: "#7C3AED", bg: "#F3E8FF", hint: `(juros pagos + pendentes) ÷ ${fmtN(areaTotal,0)} ha` },
                ].map(k => (
                  <div key={k.label} style={{ background: "#fff", borderRadius: 10, padding: "14px 16px", border: "0.5px solid #DDE2EE" }}
                    title={k.hint}>
                    <div style={{ fontSize: 10, color: "#666", marginBottom: 5 }}>{k.label}</div>
                    <div style={{ fontSize: 17, fontWeight: 700, color: k.color }}>{k.v}</div>
                    {k.label === "Juros / ha" && rtFiltPend > 0 && (
                      <div style={{ fontSize: 9, color: "#888", marginTop: 3 }}>+ {fmtR(rtFiltPend)} pendentes</div>
                    )}
                  </div>
                ))}
              </div>

              {/* ── Saldo por Categoria (contratos cadastrados) ── */}
              {(() => {
                // Computa saldo atual por tipo de contrato formal
                const saldoGrupo = (tipos: readonly string[]) =>
                  cfContratos.filter(c => tipos.includes(c.tipo ?? "")).reduce((s, c) => {
                    const ultima = cfParcelas
                      .filter(p => p.contrato_id === c.id && p.status === "pago")
                      .sort((a, b) => b.num_parcela - a.num_parcela)[0];
                    return s + (ultima?.saldo_devedor ?? (c.valor_total ?? 0));
                  }, 0);

                const totalSelecionado = CF_GRUPOS
                  .filter(g => cfGruposFiltro.has(g.key))
                  .reduce((s, g) => s + saldoGrupo(g.tipos), 0);

                return (
                  <div style={{ background: "#fff", borderRadius: 12, border: "0.5px solid #DDE2EE", padding: "14px 18px", marginBottom: 16 }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12, flexWrap: "wrap", gap: 8 }}>
                      <div>
                        <span style={{ fontSize: 13, fontWeight: 700, color: "#1a1a1a" }}>Saldo por Categoria</span>
                        <span style={{ fontSize: 11, color: "#888", marginLeft: 8 }}>baseado nos contratos formais cadastrados</span>
                      </div>
                      <div style={{ fontSize: 14, fontWeight: 700, color: "#791F1F" }}>
                        Total selecionado: {fmtR(totalSelecionado)}
                      </div>
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 10 }}>
                      {CF_GRUPOS.map(g => {
                        const sel = cfGruposFiltro.has(g.key);
                        const saldo = saldoGrupo(g.tipos);
                        return (
                          <label key={g.key} style={{ display: "flex", flexDirection: "column", gap: 4, padding: "10px 14px", borderRadius: 10, border: `1.5px solid ${sel ? g.cor : "#DDE2EE"}`, background: sel ? g.bg : "#F9FAFB", cursor: "pointer", userSelect: "none" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                              <input type="checkbox" checked={sel} onChange={() => {
                                const next = new Set(cfGruposFiltro);
                                if (sel) next.delete(g.key); else next.add(g.key);
                                setCfGruposFiltro(next);
                              }} style={{ width: 14, height: 14, cursor: "pointer" }} />
                              <span style={{ fontSize: 11, fontWeight: 600, color: sel ? g.cor : "#888" }}>{g.label}</span>
                            </div>
                            <div style={{ fontSize: 16, fontWeight: 700, color: sel && saldo > 0 ? g.cor : "#aaa", paddingLeft: 20 }}>
                              {cfLoading ? "…" : saldo > 0 ? fmtR(saldo) : <span style={{ fontSize: 12, color: "#ccc" }}>sem saldo</span>}
                            </div>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                );
              })()}

              {!temDados && (
                <div style={{ background: "#fff", borderRadius: 12, border: "0.5px solid #DDE2EE", padding: "40px 24px", textAlign: "center" }}>
                  <div style={{ fontSize: 14, color: "#888", marginBottom: 8 }}>Nenhum lançamento identificado como recurso de terceiros.</div>
                  <div style={{ fontSize: 12, color: "#aaa" }}>
                    O sistema identifica automaticamente lançamentos com palavras-chave nas categorias e descrições:<br />
                    <strong style={{ color: "#555" }}>CPR · Custeio · EGF · Empréstimo · Financiamento · PRONAF · Juros</strong>
                  </div>
                </div>
              )}

              {temDados && (
                <div style={{ display: "grid", gridTemplateColumns: "1fr 340px", gap: 16, marginBottom: 16 }}>

                  {/* Histórico por ano safra */}
                  <div style={{ background: "#fff", borderRadius: 12, border: "0.5px solid #DDE2EE", overflow: "hidden" }}>
                    <div style={{ padding: "12px 18px", borderBottom: "0.5px solid #DDE2EE", background: "#F8FAFD" }}>
                      <span style={{ fontSize: 13, fontWeight: 700, color: "#1a1a1a" }}>Histórico por Ano Fiscal</span>
                      <span style={{ fontSize: 11, color: "#888", marginLeft: 8 }}>captação × amortização × juros</span>
                    </div>
                    <table style={{ width: "100%", borderCollapse: "collapse" }}>
                      <thead>
                        <tr style={{ background: "#F3F6F9" }}>
                          {["Ano / Safra", "Captado", "Pago (Principal)", "Juros Pagos", "Saldo Devedor", "Progresso"].map((h, i) => (
                            <th key={i} style={{ padding: "8px 12px", fontSize: 10, fontWeight: 600, color: "#555", textAlign: i === 0 ? "left" : "right", borderBottom: "0.5px solid #D4DCE8", whiteSpace: "nowrap" }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {rtPorAnoFiltrado.map((b, bi) => {
                          const pct_pago  = b.captado > 0 ? Math.min(100, (b.pago  / b.captado) * 100) : 0;
                          const pct_juros = b.captado > 0 ? Math.min(100, (b.juros / b.captado) * 100) : 0;
                          const isOpen    = rtDrillLabel === b.label;
                          const drillLancs = isOpen ? lancamentosFiltrados.filter(l => {
                            const lLabel = l.ano_safra_id
                              ? (anosSafra.find(a => a.id === l.ano_safra_id)?.descricao ?? l.data_vencimento.slice(0, 4))
                              : l.data_vencimento.slice(0, 4);
                            return lLabel === b.label && (isCaptacao(l) || isPrincipal(l) || isJurosPgto(l));
                          }).sort((a, z) => a.data_vencimento.localeCompare(z.data_vencimento)) : [];
                          return (
                            <React.Fragment key={bi}>
                              <tr
                                onClick={() => setRtDrillLabel(isOpen ? null : b.label)}
                                style={{ borderBottom: isOpen ? "none" : "0.5px solid #EEF1F6", cursor: "pointer", background: isOpen ? "#EEF6FF" : "transparent" }}>
                                <td style={{ padding: "9px 12px", fontWeight: 600, fontSize: 13 }}>
                                  <span style={{ marginRight: 6, fontSize: 9, color: "#1A4870", opacity: 0.5 }}>{isOpen ? "▼" : "▶"}</span>
                                  {b.label}
                                </td>
                                <td style={{ padding: "9px 12px", textAlign: "right", fontSize: 12, color: b.captado > 0 ? "#16A34A" : "#aaa", fontWeight: 600 }}>
                                  {b.captado > 0 ? fmtR(b.captado) : "R$ 0"}
                                </td>
                                <td style={{ padding: "9px 12px", textAlign: "right", fontSize: 12 }}>{b.pago > 0 ? fmtR(b.pago) : "—"}</td>
                                <td style={{ padding: "9px 12px", textAlign: "right", fontSize: 12, color: b.juros > 0 ? "#633806" : "#aaa" }}>
                                  {b.juros > 0 ? fmtR(b.juros) : "—"}
                                  {b.jurosPend > 0 && <div style={{ fontSize: 9, color: "#EF9F27" }}>+{fmtR(b.jurosPend)} pend.</div>}
                                </td>
                                <td style={{ padding: "9px 12px", textAlign: "right", fontSize: 12, fontWeight: 600, color: b.saldo > 0 ? "#791F1F" : "#14532D" }}>
                                  {b.captado > 0 && b.saldo <= 0
                                    ? <span style={{ color: "#16A34A" }}>Quitado</span>
                                    : b.saldo > 0 ? fmtR(b.saldo) : "—"}
                                </td>
                                <td style={{ padding: "9px 12px", minWidth: 100 }}>
                                  {b.captado > 0 && (
                                    <div>
                                      <div style={{ height: 6, borderRadius: 3, background: "#EEF1F6", overflow: "hidden", display: "flex" }}>
                                        <div style={{ width: `${pct_pago}%`,  background: "#1A4870", borderRadius: 3 }} title={`Principal: ${fmtN(pct_pago,0)}%`} />
                                        <div style={{ width: `${pct_juros}%`, background: "#EF9F27" }}                 title={`Juros: ${fmtN(pct_juros,0)}%`} />
                                      </div>
                                      <div style={{ fontSize: 9, color: "#888", marginTop: 2, textAlign: "right" }}>{fmtN(pct_pago+pct_juros,0)}% devolvido</div>
                                    </div>
                                  )}
                                </td>
                              </tr>
                              {isOpen && (
                                <tr style={{ background: "#F5F9FF", borderBottom: "0.5px solid #D4DCE8" }}>
                                  <td colSpan={6} style={{ padding: "0 12px 14px 32px" }}>
                                    {drillLancs.length === 0 ? (
                                      <div style={{ padding: "10px 0", fontSize: 12, color: "#aaa" }}>Nenhum lançamento encontrado para esta safra.</div>
                                    ) : (
                                      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
                                        <thead>
                                          <tr>
                                            {["Descrição","Categoria","Vencimento","Moeda","Tipo","Valor","Status"].map((h, hi) => (
                                              <th key={h} style={{ padding: "5px 8px", textAlign: hi >= 2 ? "right" : "left", color: "#888", fontWeight: 600, borderBottom: "0.5px solid #D4DCE8", fontSize: 10, whiteSpace: "nowrap" }}>{h}</th>
                                            ))}
                                          </tr>
                                        </thead>
                                        <tbody>
                                          {drillLancs.map((l, li) => {
                                            const tipo    = isCaptacao(l) ? "Captação" : isJurosPgto(l) ? "Juros/Encargo" : "Amortização";
                                            const tipoCor = isCaptacao(l) ? "#166534"  : isJurosPgto(l) ? "#633806"       : "#0C447C";
                                            const tipoBg  = isCaptacao(l) ? "#DCFCE7"  : isJurosPgto(l) ? "#FEF3C7"       : "#EBF3FC";
                                            const baixado = l.status === "baixado";
                                            return (
                                              <tr key={li}
                                                onClick={() => abrirContratoRT(l)}
                                                style={{ borderBottom: "0.5px solid #EEF1F6", background: li % 2 === 0 ? "transparent" : "rgba(26,72,112,0.025)", cursor: loadingContrato ? "wait" : "pointer" }}
                                                title="Clique para ver o Contrato Financeiro">
                                                <td style={{ padding: "5px 8px", color: "#1a1a1a", maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={l.descricao}>{l.descricao}</td>
                                                <td style={{ padding: "5px 8px", color: "#555" }}>{l.categoria || "—"}</td>
                                                <td style={{ padding: "5px 8px", textAlign: "right", color: "#555", whiteSpace: "nowrap" }}>{fmtDt(l.data_vencimento)}</td>
                                                <td style={{ padding: "5px 8px", textAlign: "right" }}>
                                                  {l.moeda === "USD"
                                                    ? <span style={{ background: "#FEF9C3", color: "#92400E", padding: "1px 6px", borderRadius: 4, fontWeight: 700, fontSize: 10 }}>US$</span>
                                                    : <span style={{ background: "#EBF3FC", color: "#0C447C", padding: "1px 6px", borderRadius: 4, fontWeight: 700, fontSize: 10 }}>R$</span>}
                                                </td>
                                                <td style={{ padding: "5px 8px", textAlign: "right" }}>
                                                  <span style={{ background: tipoBg, color: tipoCor, padding: "1px 6px", borderRadius: 4, fontWeight: 600, fontSize: 10 }}>{tipo}</span>
                                                </td>
                                                <td style={{ padding: "5px 8px", textAlign: "right", fontWeight: 600, color: isCaptacao(l) ? "#16A34A" : "#1a1a1a" }}>{fmtR(l.valor)}</td>
                                                <td style={{ padding: "5px 8px", textAlign: "right" }}>
                                                  <span style={{ background: baixado ? "#DCFCE7" : "#FEF3C7", color: baixado ? "#166534" : "#92400E", padding: "1px 6px", borderRadius: 4, fontSize: 10, fontWeight: 600 }}>
                                                    {baixado ? "Baixado" : l.status === "vencido" ? "Vencido" : "Em aberto"}
                                                  </span>
                                                </td>
                                              </tr>
                                            );
                                          })}
                                        </tbody>
                                      </table>
                                    )}
                                  </td>
                                </tr>
                              )}
                            </React.Fragment>
                          );
                        })}
                        {rtPorAnoFiltrado.length === 0 && (
                          <tr><td colSpan={6} style={{ padding: 20, textAlign: "center", color: "#aaa", fontSize: 12 }}>Sem dados para o filtro selecionado</td></tr>
                        )}
                      </tbody>
                      <tfoot>
                        <tr style={{ background: "#F3F6F9", borderTop: "0.5px solid #D4DCE8" }}>
                          <td style={{ padding: "9px 12px", fontSize: 12, fontWeight: 700 }}>
                            Total{rtFiltroLabel !== "todos" ? ` — ${rtFiltroLabel}` : ""}
                          </td>
                          <td style={{ padding: "9px 12px", textAlign: "right", fontSize: 12, fontWeight: 700, color: "#16A34A" }}>{fmtR(rtFiltCaptado)}</td>
                          <td style={{ padding: "9px 12px", textAlign: "right", fontSize: 12, fontWeight: 700 }}>{fmtR(rtFiltPago)}</td>
                          <td style={{ padding: "9px 12px", textAlign: "right", fontSize: 12, fontWeight: 700, color: "#633806" }}>{fmtR(rtFiltJuros)}</td>
                          <td style={{ padding: "9px 12px", textAlign: "right", fontSize: 12, fontWeight: 700, color: rtFiltSaldo > 0 ? "#791F1F" : "#16A34A" }}>{fmtR(rtFiltSaldo)}</td>
                          <td />
                        </tr>
                      </tfoot>
                    </table>
                  </div>

                  {/* Por tipo de operação */}
                  <div style={{ background: "#fff", borderRadius: 12, border: "0.5px solid #DDE2EE", overflow: "hidden" }}>
                    <div style={{ padding: "12px 18px", borderBottom: "0.5px solid #DDE2EE", background: "#F8FAFD" }}>
                      <span style={{ fontSize: 13, fontWeight: 700, color: "#1a1a1a" }}>Por Tipo de Operação</span>
                    </div>
                    <div style={{ padding: "14px 18px", display: "flex", flexDirection: "column", gap: 14 }}>
                      {rtPorTipo.length === 0 && <div style={{ fontSize: 12, color: "#aaa", textAlign: "center", padding: 20 }}>Sem dados classificados</div>}
                      {rtPorTipo.map(t => {
                        const cor = corTipo[t.tipo] ?? "#888";
                        const pct_pago  = t.captado > 0 ? Math.min(100, (t.pago  / t.captado) * 100) : 0;
                        const pct_juros = t.captado > 0 ? Math.min(100, (t.juros / t.captado) * 100) : 0;
                        return (
                          <div key={t.tipo}>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                              <span style={{ fontSize: 12, fontWeight: 700, color: cor }}>{t.tipo}</span>
                              <span style={{ fontSize: 11, color: "#555" }}>captado <strong>{fmtR(t.captado)}</strong></span>
                            </div>
                            <div style={{ height: 8, borderRadius: 4, background: "#EEF1F6", overflow: "hidden", display: "flex", marginBottom: 4 }}>
                              <div style={{ width: `${pct_pago}%`,  background: cor, opacity: 0.85, borderRadius: "4px 0 0 4px" }} />
                              <div style={{ width: `${pct_juros}%`, background: "#EF9F27" }} />
                            </div>
                            <div style={{ display: "flex", gap: 12, fontSize: 10, color: "#888" }}>
                              <span><span style={{ width: 7, height: 7, borderRadius: 2, background: cor, display: "inline-block", marginRight: 3 }} />Principal: {fmtR(t.pago)}</span>
                              <span><span style={{ width: 7, height: 7, borderRadius: 2, background: "#EF9F27", display: "inline-block", marginRight: 3 }} />Juros: {fmtR(t.juros)}</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* KPI juros/ha destaque */}
                    {areaTotal > 0 && (
                      <div style={{ margin: "0 18px 16px", padding: "12px 14px", background: "#F3E8FF", borderRadius: 10, border: "0.5px solid #C4B5FD" }}>
                        <div style={{ fontSize: 10, color: "#5B21B6", marginBottom: 3, fontWeight: 600 }}>ENCARGO FINANCEIRO / ha</div>
                        <div style={{ fontSize: 22, fontWeight: 800, color: "#5B21B6" }}>{fmtR2(rtJurosHa)}</div>
                        <div style={{ fontSize: 10, color: "#7C3AED", marginTop: 2 }}>
                          {fmtR(rtTotalJuros + rtJurosPend)} ÷ {fmtN(areaTotal, 0)} ha
                        </div>
                        {rtJurosPend > 0 && (
                          <div style={{ fontSize: 10, color: "#EF9F27", marginTop: 2 }}>inclui {fmtR(rtJurosPend)} de juros ainda não pagos</div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Nota metodológica */}
              <div style={{ fontSize: 10, color: "#aaa", marginTop: 4 }}>
                Dados consolidados de Contratos Financeiros cadastrados + lançamentos manuais identificados por palavras-chave.
                Contratos importados via XLSX aparecem automaticamente assim que cadastrados em Financeiro → Contratos Financeiros.
              </div>
            </div>
          );
        })()}

        {/* ═══════════ EVOLUÇÃO DE ENDIVIDAMENTO ═══════════ */}
        {!loading && aba === "evolucao" && (() => {
          // ── Filtro de grupos de categoria ─────────────────────
          const tiposFiltro: string[] = CF_GRUPOS
            .filter(g => cfGruposFiltro.has(g.key))
            .flatMap(g => [...g.tipos] as string[]);
          const cfFiltrados  = cfContratos.filter(c => tiposFiltro.includes(c.tipo ?? "outros"));
          // parcelas dos contratos filtrados
          const cfIdsFilt    = new Set(cfFiltrados.map(c => c.id));
          const cfParcFilt   = cfParcelas.filter(p => cfIdsFilt.has(p.contrato_id));

          // ── Intervalo de anos ─────────────────────────────────
          const anoAtual = new Date().getFullYear();
          const anoMin   = anoAtual - 3;

          // Anos das parcelas (vencimento) + anos dos contratos (captação)
          const anosParc = cfParcFilt.map(p => Number(p.data_vencimento.slice(0, 4)));
          const anosContr = cfFiltrados.map(c => Number((c.data_contrato ?? "").slice(0, 4))).filter(Boolean);
          const anoMax = Math.max(anoAtual, ...anosParc, ...anosContr);

          const anos: string[] = [];
          for (let y = anoMin; y <= anoMax; y++) anos.push(String(y));

          const temDados = cfFiltrados.length > 0 || cfParcFilt.length > 0;

          // ── Captação por ano (data_contrato) ──────────────────
          const captPorAno: Record<string, number> = {};
          for (const ano of anos) captPorAno[ano] = 0;
          for (const c of cfFiltrados) {
            const ano = (c.data_contrato ?? "").slice(0, 4);
            if (ano in captPorAno) captPorAno[ano] += (c.valor_total ?? 0);
          }

          // ── Amortização por ano (parcelas.amortizacao) ────────
          const amortPorAno: Record<string, number> = {};
          for (const ano of anos) amortPorAno[ano] = 0;
          for (const p of cfParcFilt) {
            const ano = p.data_vencimento.slice(0, 4);
            if (ano in amortPorAno) amortPorAno[ano] += (p.amortizacao ?? 0);
          }

          // ── Juros por ano (parcelas.juros + despesas_acessorios) ─
          const jurosPorAno: Record<string, number> = {};
          for (const ano of anos) jurosPorAno[ano] = 0;
          for (const p of cfParcFilt) {
            const ano = p.data_vencimento.slice(0, 4);
            if (ano in jurosPorAno) jurosPorAno[ano] += (p.juros ?? 0) + (p.despesas_acessorios ?? 0);
          }

          // ── Saldo devedor acumulado por ano ───────────────────
          // Para cada contrato filtrado: pegar saldo_devedor da última parcela com vencimento <= fim do ano
          const saldoPorAno: Record<string, number> = {};
          for (const ano of anos) {
            const fimAno = `${ano}-12-31`;
            let total = 0;
            for (const c of cfFiltrados) {
              if (!c.data_contrato || c.data_contrato.slice(0, 4) > ano) continue;
              const parcsAte = cfParcFilt
                .filter(p => p.contrato_id === c.id && p.data_vencimento <= fimAno)
                .sort((a, b) => a.data_vencimento.localeCompare(b.data_vencimento));
              if (parcsAte.length > 0) {
                total += parcsAte[parcsAte.length - 1].saldo_devedor;
              } else {
                total += (c.valor_total ?? 0);
              }
            }
            saldoPorAno[ano] = total;
          }

          // ── Helpers ───────────────────────────────────────────
          const varR   = (vals: Record<string, number>, ano: string, i: number) =>
            i === 0 ? null : vals[ano] - vals[anos[i - 1]];
          const varPct = (vals: Record<string, number>, ano: string, i: number) => {
            if (i === 0) return null;
            const prev = vals[anos[i - 1]];
            return prev > 0 ? ((vals[ano] - prev) / prev) * 100 : null;
          };

          const thSt: React.CSSProperties    = { padding: "8px 10px", fontSize: 10, fontWeight: 600, color: "#555", textAlign: "right", borderBottom: "0.5px solid #D4DCE8", whiteSpace: "nowrap", background: "#F3F6F9" };
          const thFirst: React.CSSProperties = { ...thSt, textAlign: "left", minWidth: 180, position: "sticky", left: 0, background: "#F3F6F9", zIndex: 1 };
          const tdSt: React.CSSProperties    = { padding: "8px 10px", fontSize: 12, textAlign: "right", borderBottom: "0.5px solid #EEF1F6", whiteSpace: "nowrap" };
          const tdFirst: React.CSSProperties = { ...tdSt, textAlign: "left", fontWeight: 700, fontSize: 12, color: "#1a1a1a", position: "sticky", left: 0, background: "inherit", zIndex: 1 };
          const tdSub: React.CSSProperties   = { ...tdSt, fontSize: 11, color: "#888" };
          const tdSubFirst: React.CSSProperties = { ...tdFirst, fontWeight: 400, color: "#888", fontSize: 11, paddingLeft: 22 };

          const isAtual = (ano: string) => ano === String(anoAtual);
          const isFuturo = (ano: string) => Number(ano) > anoAtual;

          const thAnoCel = (ano: string) => ({
            ...thSt,
            background: isAtual(ano) ? "#EFF6FF" : isFuturo(ano) ? "#F3F6F9" : "#F3F6F9",
            color: isAtual(ano) ? "#1A4870" : isFuturo(ano) ? "#999" : "#555",
            borderBottom: `2px solid ${isAtual(ano) ? "#1A4870" : "#D4DCE8"}`,
          });

          const varCell = (v: number | null, isR: boolean, inverterCores = false) => {
            if (v === null) return <td style={tdSub}>—</td>;
            const up = v > 0;
            // Para saldo: crescimento (up) é ruim; para amort/juros/capt: depende
            const cor = inverterCores
              ? (up ? "#16A34A" : "#E24B4A")   // verde = subiu (bom)
              : (up ? "#E24B4A" : "#16A34A");   // vermelho = subiu (endividamento cresceu)
            const txt = isR
              ? `${up ? "+" : ""}${fmtR(v)}`
              : `${up ? "+" : ""}${v.toFixed(1)}%`;
            return <td style={{ ...tdSub, color: cor, fontWeight: 600 }}>{up ? "▲" : "▼"} {txt}</td>;
          };

          const sectionHeader = (titulo: string, sub: string, cor = "#1a1a1a") => (
            <div style={{ padding: "12px 18px", borderBottom: "0.5px solid #DDE2EE", background: "#F8FAFD", display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: cor }}>{titulo}</span>
              <span style={{ fontSize: 11, color: "#888" }}>{sub}</span>
            </div>
          );

          // ── KPIs globais ──────────────────────────────────────
          const saldoAtual   = saldoPorAno[String(anoAtual)] ?? 0;
          const totalCaptado = Object.values(captPorAno).reduce((s, v) => s + v, 0);
          const totalAmort   = Object.values(amortPorAno).reduce((s, v) => s + v, 0);
          const totalJuros   = Object.values(jurosPorAno).reduce((s, v) => s + v, 0);
          const anoPicoTotal = anos.reduce((best, a) =>
            ((amortPorAno[a] ?? 0) + (jurosPorAno[a] ?? 0)) > ((amortPorAno[best] ?? 0) + (jurosPorAno[best] ?? 0)) ? a : best, anos[0] ?? "—");
          const picoVal = (amortPorAno[anoPicoTotal] ?? 0) + (jurosPorAno[anoPicoTotal] ?? 0);

          // Tendência: comparar saldo este ano vs ano passado
          const saldoPassado = saldoPorAno[String(anoAtual - 1)] ?? 0;
          const tendencia = saldoAtual > saldoPassado ? "crescendo" : saldoAtual < saldoPassado ? "reduzindo" : "estável";

          // Ano estimado de quitação (saldo ≤ 0)
          const anoQuit = anos.find(a => (saldoPorAno[a] ?? 0) <= 0 && Number(a) >= anoAtual);

          // Custo financeiro: % juros sobre total pago (amort + juros)
          const totalPago = totalAmort + totalJuros;
          const custoFinPct = totalPago > 0 ? (totalJuros / totalPago) * 100 : 0;

          const makeRow = (
            label: string,
            vals: Record<string, number>,
            varInverter: boolean,
            labelCor: string,
            rowBg: string,
            subBg: string,
            valCor: (v: number) => string,
          ) => (
            <React.Fragment>
              <tr style={{ background: rowBg }}>
                <td style={{ ...tdFirst, color: labelCor }}>{label}</td>
                {anos.map(a => {
                  const v = vals[a] ?? 0;
                  const fut = isFuturo(a);
                  return (
                    <td key={a} style={{ ...tdSt, fontWeight: 700, color: fut && v > 0 ? "#999" : valCor(v), background: isAtual(a) ? "#F0F6FF" : undefined }}>
                      {v > 0 ? fmtR(v) : <span style={{ color: "#ddd" }}>—</span>}
                    </td>
                  );
                })}
              </tr>
              <tr style={{ background: subBg }}>
                <td style={tdSubFirst}>var. vs ano ant. (R$)</td>
                {anos.map((a, i) => {
                  const cell = varCell(varR(vals, a, i), true, varInverter);
                  return React.cloneElement(cell, { key: a, style: { ...((cell.props as {style?: React.CSSProperties}).style), background: isAtual(a) ? "#F0F6FF" : undefined } });
                })}
              </tr>
              <tr style={{ background: rowBg, borderBottom: "2px solid #D4DCE8" }}>
                <td style={tdSubFirst}>var. vs ano ant. (%)</td>
                {anos.map((a, i) => {
                  const cell = varCell(varPct(vals, a, i), false, varInverter);
                  return React.cloneElement(cell, { key: a, style: { ...((cell.props as {style?: React.CSSProperties}).style), background: isAtual(a) ? "#F0F6FF" : undefined } });
                })}
              </tr>
            </React.Fragment>
          );

          return (
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

              {/* ── KPIs ── */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 12 }}>
                {[
                  { label: "Saldo Devedor Atual", v: fmtR(saldoAtual), color: saldoAtual > 0 ? "#791F1F" : "#14532D", hint: `Endividamento líquido em ${anoAtual}`, sub: tendencia === "crescendo" ? "▲ crescendo" : tendencia === "reduzindo" ? "▼ reduzindo" : "= estável", subCor: tendencia === "crescendo" ? "#E24B4A" : tendencia === "reduzindo" ? "#16A34A" : "#888" },
                  { label: "Total Captado",        v: fmtR(totalCaptado), color: "#14532D", hint: "Soma de todos os contratos firmados", sub: `${cfContratos.length} contrato${cfContratos.length !== 1 ? "s" : ""}`, subCor: "#888" },
                  { label: "Total Amortizado",     v: fmtR(totalAmort),   color: "#0C447C", hint: "Soma de principal devolvido/a devolver", sub: `${((totalAmort / (totalCaptado || 1)) * 100).toFixed(0)}% do captado`, subCor: "#888" },
                  { label: "Pico de Desembolso",   v: picoVal > 0 ? fmtR(picoVal) : "—", color: "#633806", hint: "Ano com maior saída de caixa", sub: picoVal > 0 ? `${anoPicoTotal} (amort + juros)` : "sem dados", subCor: "#888" },
                ].map(k => (
                  <div key={k.label} style={{ background: "#fff", borderRadius: 10, padding: "14px 16px", border: "0.5px solid #DDE2EE" }} title={k.hint}>
                    <div style={{ fontSize: 10, color: "#666", marginBottom: 5 }}>{k.label}</div>
                    <div style={{ fontSize: 17, fontWeight: 700, color: k.color }}>{k.v}</div>
                    <div style={{ fontSize: 11, color: k.subCor, marginTop: 4, fontWeight: 600 }}>{k.sub}</div>
                  </div>
                ))}
              </div>

              {cfLoading && (
                <div style={{ background: "#fff", borderRadius: 12, border: "0.5px solid #DDE2EE", padding: "40px", textAlign: "center", color: "#888", fontSize: 13 }}>
                  Carregando dados de contratos…
                </div>
              )}

              {!cfLoading && !temDados && (
                <div style={{ background: "#fff", borderRadius: 12, border: "0.5px solid #DDE2EE", padding: "40px 24px", textAlign: "center" }}>
                  <div style={{ fontSize: 14, color: "#888" }}>Nenhum contrato financeiro cadastrado.</div>
                  <div style={{ fontSize: 12, color: "#bbb", marginTop: 6 }}>Cadastre contratos em Financeiro → Endividamento para visualizar a evolução.</div>
                </div>
              )}

              {/* ── Filtro de categorias ── */}
              <div style={{ background: "#fff", borderRadius: 12, border: "0.5px solid #DDE2EE", padding: "14px 18px" }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "#555", marginBottom: 10, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                  Incluir no cálculo
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 10 }}>
                  {CF_GRUPOS.map(g => {
                    const sel = cfGruposFiltro.has(g.key);
                    const saldoG = cfContratos.filter(c => (g.tipos as readonly string[]).includes(c.tipo ?? "")).reduce((s, c) => {
                      const ultima = cfParcelas.filter(p => p.contrato_id === c.id && p.status === "pago").sort((a, b) => b.num_parcela - a.num_parcela)[0];
                      return s + (ultima?.saldo_devedor ?? (c.valor_total ?? 0));
                    }, 0);
                    return (
                      <label key={g.key} style={{ display: "flex", flexDirection: "column", gap: 4, padding: "10px 14px", borderRadius: 10, border: `1.5px solid ${sel ? g.cor : "#DDE2EE"}`, background: sel ? g.bg : "#F9FAFB", cursor: "pointer", userSelect: "none" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          <input type="checkbox" checked={sel} onChange={() => {
                            const next = new Set(cfGruposFiltro);
                            if (sel) next.delete(g.key); else next.add(g.key);
                            setCfGruposFiltro(next);
                          }} style={{ width: 14, height: 14, cursor: "pointer" }} />
                          <span style={{ fontSize: 11, fontWeight: 600, color: sel ? g.cor : "#888" }}>{g.label}</span>
                        </div>
                        <div style={{ fontSize: 13, fontWeight: 700, color: sel && saldoG > 0 ? g.cor : "#aaa", paddingLeft: 20 }}>
                          {cfLoading ? "…" : saldoG > 0 ? fmtR(saldoG) : <span style={{ fontSize: 11, color: "#ccc" }}>sem saldo</span>}
                        </div>
                      </label>
                    );
                  })}
                </div>
              </div>

              {!cfLoading && temDados && (
                <>
                  {/* ══ TABELA PRINCIPAL ══ */}
                  <div style={{ background: "#fff", borderRadius: 12, border: "0.5px solid #DDE2EE", overflow: "hidden" }}>
                    {sectionHeader("Evolução do Endividamento", "anos anteriores (3) → último vencimento  ·  coluna atual destacada  ·  futuro em cinza")}
                    <div style={{ overflowX: "auto" }}>
                      <table style={{ width: "100%", borderCollapse: "collapse", minWidth: anos.length * 130 + 200 }}>
                        <thead>
                          <tr>
                            <th style={thFirst}>Indicador</th>
                            {anos.map(a => (
                              <th key={a} style={thAnoCel(a)}>
                                {a}
                                {isAtual(a) && <div style={{ fontSize: 9, color: "#1A4870", fontWeight: 700 }}>ATUAL</div>}
                                {isFuturo(a) && <div style={{ fontSize: 9, color: "#bbb" }}>proj.</div>}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {/* LINHA 1 — Endividamento acumulado */}
                          {makeRow(
                            "Endividamento total",
                            saldoPorAno,
                            false,   // crescer = ruim (vermelho)
                            "#791F1F",
                            "#FEF2F2",
                            "#FEF8F8",
                            v => v > 0 ? "#791F1F" : "#16A34A",
                          )}

                          {/* LINHA 2 — Captação */}
                          {makeRow(
                            "Captação no ano",
                            captPorAno,
                            false,
                            "#14532D",
                            "#F0FDF4",
                            "#F7FEF9",
                            () => "#14532D",
                          )}

                          {/* LINHA 3 — Amortização */}
                          {makeRow(
                            "Amortização",
                            amortPorAno,
                            true,    // crescer = bom (verde)
                            "#0C447C",
                            "#EFF6FF",
                            "#F5F9FF",
                            () => "#0C447C",
                          )}

                          {/* LINHA 4 — Juros */}
                          {makeRow(
                            "Juros e encargos",
                            jurosPorAno,
                            false,
                            "#633806",
                            "#FAEEDA",
                            "#FBF5EE",
                            () => "#633806",
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* ══ PAINEL DE ANÁLISE ══ */}
                  <div style={{ background: "#fff", borderRadius: 12, border: "0.5px solid #DDE2EE", overflow: "hidden" }}>
                    {sectionHeader("Análise da Evolução", "diagnóstico automático com base nos contratos e parcelas cadastrados", "#1A4870")}
                    <div style={{ padding: "18px 20px", display: "flex", flexDirection: "column", gap: 12 }}>

                      {/* Tendência do endividamento */}
                      <div style={{ display: "flex", gap: 10, alignItems: "flex-start", padding: "12px 14px", borderRadius: 8, background: tendencia === "crescendo" ? "#FEF2F2" : tendencia === "reduzindo" ? "#F0FDF4" : "#F9FAFB", border: `0.5px solid ${tendencia === "crescendo" ? "#FCA5A5" : tendencia === "reduzindo" ? "#86EFAC" : "#DDE2EE"}` }}>
                        <div style={{ fontSize: 22 }}>{tendencia === "crescendo" ? "⚠️" : tendencia === "reduzindo" ? "✅" : "➡️"}</div>
                        <div>
                          <div style={{ fontSize: 13, fontWeight: 700, color: tendencia === "crescendo" ? "#991B1B" : tendencia === "reduzindo" ? "#14532D" : "#555" }}>
                            Endividamento {tendencia === "crescendo" ? "crescendo" : tendencia === "reduzindo" ? "reduzindo" : "estável"} em {anoAtual}
                          </div>
                          <div style={{ fontSize: 12, color: "#555", marginTop: 3 }}>
                            {saldoPassado > 0
                              ? `Saldo devedor passou de ${fmtR(saldoPassado)} (${anoAtual - 1}) para ${fmtR(saldoAtual)} (${anoAtual}) — variação de ${fmtR(saldoAtual - saldoPassado)} (${saldoPassado > 0 ? ((saldoAtual - saldoPassado) / saldoPassado * 100).toFixed(1) : "—"}%).`
                              : `Saldo devedor atual: ${fmtR(saldoAtual)}.`}
                          </div>
                        </div>
                      </div>

                      {/* Custo financeiro */}
                      <div style={{ display: "flex", gap: 10, alignItems: "flex-start", padding: "12px 14px", borderRadius: 8, background: "#FAEEDA", border: "0.5px solid #F9C86C" }}>
                        <div style={{ fontSize: 22 }}>💸</div>
                        <div>
                          <div style={{ fontSize: 13, fontWeight: 700, color: "#633806" }}>Custo financeiro: {custoFinPct.toFixed(1)}% do total pago são juros</div>
                          <div style={{ fontSize: 12, color: "#555", marginTop: 3 }}>
                            De {fmtR(totalPago)} previstos de desembolso total, {fmtR(totalJuros)} são encargos financeiros e {fmtR(totalAmort)} são amortização de principal.
                            {custoFinPct > 30 && " Alta proporção de juros — avaliar renegociação ou quitação antecipada."}
                          </div>
                        </div>
                      </div>

                      {/* Pico de caixa */}
                      {picoVal > 0 && (
                        <div style={{ display: "flex", gap: 10, alignItems: "flex-start", padding: "12px 14px", borderRadius: 8, background: "#EFF6FF", border: "0.5px solid #93C5FD" }}>
                          <div style={{ fontSize: 22 }}>📅</div>
                          <div>
                            <div style={{ fontSize: 13, fontWeight: 700, color: "#1D4ED8" }}>
                              Pico de desembolso em {anoPicoTotal}: {fmtR(picoVal)}
                            </div>
                            <div style={{ fontSize: 12, color: "#555", marginTop: 3 }}>
                              {isFuturo(anoPicoTotal) ? "Ano futuro com maior pressão de caixa." : "Ano com maior saída de caixa registrada."}{" "}
                              Amortização: {fmtR(amortPorAno[anoPicoTotal] ?? 0)} · Juros: {fmtR(jurosPorAno[anoPicoTotal] ?? 0)}.
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Quitação estimada */}
                      <div style={{ display: "flex", gap: 10, alignItems: "flex-start", padding: "12px 14px", borderRadius: 8, background: anoQuit ? "#F0FDF4" : "#F9FAFB", border: `0.5px solid ${anoQuit ? "#86EFAC" : "#DDE2EE"}` }}>
                        <div style={{ fontSize: 22 }}>{anoQuit ? "🏁" : "🔄"}</div>
                        <div>
                          <div style={{ fontSize: 13, fontWeight: 700, color: anoQuit ? "#14532D" : "#555" }}>
                            {anoQuit ? `Quitação projetada em ${anoQuit}` : "Quitação além do horizonte visível"}
                          </div>
                          <div style={{ fontSize: 12, color: "#555", marginTop: 3 }}>
                            {anoQuit
                              ? `Com base nas parcelas cadastradas, o saldo devedor chega a zero em ${anoQuit}.`
                              : "O saldo devedor não chega a zero no período coberto pelos contratos cadastrados."}
                          </div>
                        </div>
                      </div>

                      {/* Captação recente */}
                      {(() => {
                        const anosComCaptacao = anos.filter(a => (captPorAno[a] ?? 0) > 0 && Number(a) >= anoAtual - 2);
                        return anosComCaptacao.length > 0 ? (
                          <div style={{ display: "flex", gap: 10, alignItems: "flex-start", padding: "12px 14px", borderRadius: 8, background: "#F0FDF4", border: "0.5px solid #86EFAC" }}>
                            <div style={{ fontSize: 22 }}>📥</div>
                            <div>
                              <div style={{ fontSize: 13, fontWeight: 700, color: "#14532D" }}>
                                Novas captações nos últimos 2 anos
                              </div>
                              <div style={{ fontSize: 12, color: "#555", marginTop: 3 }}>
                                {anosComCaptacao.map(a => `${a}: ${fmtR(captPorAno[a])}`).join("  ·  ")}
                              </div>
                            </div>
                          </div>
                        ) : null;
                      })()}

                    </div>
                  </div>
                </>
              )}
            </div>
          );
        })()}

        {/* ── ABA CONTROLLER ─────────────────────────────────── */}
        {aba === "controller" && (() => {
          const alertasFiltrados = alertas
            .filter(a => filtroSev === "todos" || a.severidade === filtroSev)
            .filter(a => filtroCatCtrl === "todos" || a.categoria === filtroCatCtrl)
            .filter(a => mostrarResolvidos || !a.resolved_at);
          const contadores: Record<Severidade, number> = {
            critico: alertas.filter(a => a.severidade === "critico" && !a.resolved_at).length,
            alto:    alertas.filter(a => a.severidade === "alto"    && !a.resolved_at).length,
            medio:   alertas.filter(a => a.severidade === "medio"   && !a.resolved_at).length,
            baixo:   alertas.filter(a => a.severidade === "baixo"   && !a.resolved_at).length,
          };
          const totalAtivos = alertas.filter(a => !a.resolved_at).length;
          return (
            <div>
              {/* Header */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 10 }}>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: "#1a1a1a" }}>Monitoramento Automático</div>
                  <div style={{ fontSize: 12, color: "#888", marginTop: 2 }}>Inconsistências e alertas operacionais da fazenda</div>
                </div>
                <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                  {checkMsg && <span style={{ fontSize: 12, color: "#555", fontStyle: "italic" }}>{checkMsg}</span>}
                  <button onClick={executarVerificacoes} disabled={executandoChecks} style={{ background: "#1A4870", color: "#fff", border: "none", borderRadius: 8, padding: "8px 16px", fontSize: 13, fontWeight: 600, cursor: executandoChecks ? "not-allowed" : "pointer", opacity: executandoChecks ? 0.7 : 1 }}>
                    {executandoChecks ? "⟳ Verificando…" : "⟳ Executar Verificações"}
                  </button>
                </div>
              </div>

              {/* KPI cards */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 12, marginBottom: 16 }}>
                {(["critico","alto","medio","baixo"] as Severidade[]).map(sev => (
                  <button key={sev} onClick={() => setFiltroSev(filtroSev === sev ? "todos" : sev)} style={{ background: filtroSev === sev ? SEV_BG[sev] : "#fff", border: `0.5px solid ${filtroSev === sev ? SEV_COR[sev] : "#DDE2EE"}`, borderLeft: `4px solid ${SEV_COR[sev]}`, borderRadius: 8, padding: "14px 16px", textAlign: "left", cursor: "pointer" }}>
                    <div style={{ fontSize: 24, fontWeight: 700, color: SEV_COR[sev] }}>{contadores[sev]}</div>
                    <div style={{ fontSize: 12, color: "#666", marginTop: 2 }}>Alertas {SEV_LABEL[sev]}s</div>
                  </button>
                ))}
              </div>

              {/* Filtros */}
              <div style={{ background: "#fff", borderRadius: 10, border: "0.5px solid #DDE2EE", padding: "12px 16px", marginBottom: 16, display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
                <span style={{ fontSize: 12, color: "#888", fontWeight: 600 }}>FILTRAR:</span>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {(["todos","Fiscal","Financeiro","Contratos","Lavoura","Cadastros","Estoque","Arrendamentos"] as (Categoria|"todos")[]).map(cat => (
                    <button key={cat} onClick={() => setFiltroCatCtrl(cat)} style={{ background: filtroCatCtrl === cat ? "#D5E8F5" : "#F4F6FA", border: `0.5px solid ${filtroCatCtrl === cat ? "#1A4870" : "#DDE2EE"}`, color: filtroCatCtrl === cat ? "#1A4870" : "#555", borderRadius: 99, padding: "4px 12px", fontSize: 12, cursor: "pointer", fontWeight: filtroCatCtrl === cat ? 600 : 400 }}>
                      {cat === "todos" ? "Todas" : `${CAT_ICONE[cat as Categoria]} ${cat}`}
                    </button>
                  ))}
                </div>
                <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 6 }}>
                  <input type="checkbox" id="ctrl-resolvidos" checked={mostrarResolvidos} onChange={e => setMostrarResolvidos(e.target.checked)} style={{ cursor: "pointer" }} />
                  <label htmlFor="ctrl-resolvidos" style={{ fontSize: 12, color: "#888", cursor: "pointer" }}>Mostrar resolvidos</label>
                </div>
              </div>

              {/* Lista */}
              {alertasLoading ? (
                <div style={{ textAlign: "center", padding: 48, color: "#999", fontSize: 14 }}>Carregando alertas…</div>
              ) : alertasFiltrados.length === 0 ? (
                <div style={{ background: "#fff", borderRadius: 12, border: "0.5px solid #DDE2EE", padding: 48, textAlign: "center" }}>
                  <div style={{ fontSize: 40, marginBottom: 12 }}>{totalAtivos === 0 ? "✅" : "🔍"}</div>
                  <div style={{ fontSize: 16, fontWeight: 600, color: totalAtivos === 0 ? "#16A34A" : "#1A4870" }}>
                    {totalAtivos === 0 ? "Tudo em ordem!" : "Nenhum alerta para os filtros selecionados"}
                  </div>
                  <div style={{ fontSize: 13, color: "#888", marginTop: 6 }}>
                    {totalAtivos === 0 ? "Execute as verificações para atualizar." : "Tente ajustar os filtros acima."}
                  </div>
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {alertasFiltrados.map(a => {
                    const resolved = !!a.resolved_at;
                    const acked = !!a.acknowledged_at;
                    return (
                      <div key={a.id} style={{ background: resolved ? "#F9FAFB" : SEV_BG[a.severidade], border: `0.5px solid ${resolved ? "#DDE2EE" : SEV_COR[a.severidade]}`, borderLeft: `4px solid ${resolved ? "#ccc" : SEV_COR[a.severidade]}`, borderRadius: 10, padding: "14px 16px", opacity: resolved ? 0.65 : 1 }}>
                        <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
                          <span style={{ fontSize: 20, flexShrink: 0, marginTop: 1 }}>{CAT_ICONE[a.categoria]}</span>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ display: "flex", gap: 8, marginBottom: 4, flexWrap: "wrap", alignItems: "center" }}>
                              <span style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", background: resolved ? "#ccc" : SEV_COR[a.severidade], color: "#fff", padding: "2px 7px", borderRadius: 99 }}>{resolved ? "Resolvido" : SEV_LABEL[a.severidade]}</span>
                              <span style={{ fontSize: 10, background: "#F4F6FA", border: "0.5px solid #DDE2EE", color: "#555", padding: "2px 7px", borderRadius: 99 }}>{a.categoria}</span>
                              {acked && !resolved && <span style={{ fontSize: 10, color: "#16A34A" }}>✓ Reconhecido</span>}
                            </div>
                            <div style={{ fontSize: 14, fontWeight: 600, color: "#1a1a1a", marginBottom: 4 }}>{a.titulo}</div>
                            <div style={{ fontSize: 13, color: "#555", lineHeight: 1.5 }}>{a.descricao}</div>
                            {a.suggested_action && (
                              <div style={{ marginTop: 8, padding: "6px 10px", background: "rgba(255,255,255,0.7)", borderRadius: 6, fontSize: 12, color: "#333" }}>
                                <strong>Ação sugerida:</strong> {a.suggested_action}
                              </div>
                            )}
                            <div style={{ marginTop: 8, fontSize: 11, color: "#aaa" }}>
                              Detectado em {a.first_seen_at ? new Date(a.first_seen_at).toLocaleString("pt-BR") : "—"}
                              {a.acknowledged_at && ` · Reconhecido em ${new Date(a.acknowledged_at).toLocaleString("pt-BR")}`}
                              {a.resolved_at && ` · Resolvido em ${new Date(a.resolved_at).toLocaleString("pt-BR")}`}
                            </div>
                          </div>
                          {!resolved && (
                            <div style={{ display: "flex", gap: 6, flexShrink: 0, flexDirection: "column", alignItems: "flex-end" }}>
                              {!acked && (
                                <button onClick={() => ackAlerta(a.id)} style={{ background: "#fff", border: "0.5px solid #DDE2EE", borderRadius: 6, padding: "5px 10px", fontSize: 11, color: "#555", cursor: "pointer", whiteSpace: "nowrap" }}>Reconhecer</button>
                              )}
                              <button onClick={() => fecharAlerta(a.id)} style={{ background: "#16A34A", border: "none", borderRadius: 6, padding: "5px 10px", fontSize: 11, color: "#fff", cursor: "pointer", whiteSpace: "nowrap" }}>Resolver ✓</button>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Verificações disponíveis */}
              <div style={{ marginTop: 20, background: "#fff", borderRadius: 10, border: "0.5px solid #DDE2EE", padding: 16 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: "#888", marginBottom: 8 }}>VERIFICAÇÕES DISPONÍVEIS</div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(220px,1fr))", gap: 8 }}>
                  {[
                    { cat: "Fiscal",        checks: ["Certificado A1 vencendo"] },
                    { cat: "Financeiro",    checks: ["CP vencidas sem baixa","CR em atraso"] },
                    { cat: "Contratos",     checks: ["Contrato sem embarque 30 dias"] },
                    { cat: "Lavoura",       checks: ["Ciclo sem operação 20 dias"] },
                    { cat: "Arrendamentos", checks: ["Parcela vencendo em 15 dias"] },
                    { cat: "Estoque",       checks: ["Produto abaixo do mínimo"] },
                  ].map(g => (
                    <div key={g.cat} style={{ background: "#F4F6FA", borderRadius: 8, padding: "10px 12px" }}>
                      <div style={{ fontSize: 11, fontWeight: 600, color: "#1A4870", marginBottom: 4 }}>{CAT_ICONE[g.cat as Categoria]} {g.cat}</div>
                      {g.checks.map(c => <div key={c} style={{ fontSize: 11, color: "#666", padding: "1px 0" }}>• {c}</div>)}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          );
        })()}

      </div>

      {/* ── Modal fallback (lancamento sem contrato vinculado) ── */}
      {rtLancModal && (() => {
        const l = rtLancModal;
        const tipo    = isCaptacao(l) ? "Captação" : isJurosPgto(l) ? "Juros / Encargo" : "Amortização";
        const tipoCor = isCaptacao(l) ? "#166534"  : isJurosPgto(l) ? "#633806"         : "#0C447C";
        const tipoBg  = isCaptacao(l) ? "#DCFCE7"  : isJurosPgto(l) ? "#FEF3C7"         : "#EBF3FC";
        return (
          <div style={{ position: "fixed", inset: 0, background: "rgba(11,45,80,0.32)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 2000 }}
            onClick={e => { if (e.target === e.currentTarget) setRtLancModal(null); }}>
            <div style={{ background: "#fff", borderRadius: 14, width: "100%", maxWidth: 480, boxShadow: "0 4px 20px rgba(11,45,80,0.10)", overflow: "hidden" }}>
              <div style={{ padding: "14px 20px", background: "#1A4870", display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div>
                  <div style={{ fontSize: 11, color: "rgba(255,255,255,0.6)", marginBottom: 4 }}>Lançamento RT — contrato não localizado</div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "#fff" }}>{l.descricao}</div>
                </div>
                <button onClick={() => setRtLancModal(null)} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.7)", fontSize: 20, cursor: "pointer", marginLeft: 12 }}>✕</button>
              </div>
              <div style={{ padding: "18px 22px", display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14 }}>
                {[["Tipo", <span style={{ background: tipoBg, color: tipoCor, padding: "2px 8px", borderRadius: 5, fontSize: 11, fontWeight: 700 }}>{tipo}</span>],
                  ["Moeda", l.moeda === "USD" ? "Dólar (US$)" : "Real (R$)"],
                  ["Status", l.status],
                  ["Valor", l.moeda === "USD" ? `USD ${fmtN(l.valor, 2)}` : fmtR(l.valor)],
                  ["Vencimento", fmtDt(l.data_vencimento)],
                  ["Baixa", l.data_baixa ? fmtDt(l.data_baixa) : "—"],
                ].map(([k, v], i) => (
                  <div key={i}>
                    <div style={{ fontSize: 10, color: "#888", fontWeight: 600, marginBottom: 3, textTransform: "uppercase" }}>{k as string}</div>
                    <div style={{ fontSize: 13, color: "#1a1a1a" }}>{v as React.ReactNode}</div>
                  </div>
                ))}
              </div>
              <div style={{ padding: "12px 22px", borderTop: "0.5px solid #EEF1F6", display: "flex", justifyContent: "flex-end", gap: 10, background: "#F8FAFD" }}>
                <button onClick={() => setRtLancModal(null)} style={{ padding: "7px 16px", background: "none", border: "0.5px solid #D4DCE8", borderRadius: 8, fontSize: 12, color: "#555", cursor: "pointer" }}>Fechar</button>
                <a href="/financeiro/contratos" style={{ padding: "7px 16px", background: "#1A4870", color: "#fff", borderRadius: 8, fontSize: 12, fontWeight: 600, textDecoration: "none" }}>Contratos Financeiros →</a>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ── Loading contrato ── */}
      {loadingContrato && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(11,45,80,0.28)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 2000 }}>
          <div style={{ background: "#fff", borderRadius: 12, padding: "28px 40px", fontSize: 13, color: "#555", boxShadow: "0 12px 40px rgba(0,0,0,0.2)" }}>
            Carregando contrato…
          </div>
        </div>
      )}

      {/* ── Modal Contrato Financeiro completo ── */}
      {rtContratoModal && (() => {
        const c = rtContratoModal;
        const isUSD = c.moeda === "USD";
        const ptax = c.valor_cotacao ?? 0;
        const tipoLabel: Record<string, string> = { custeio: "Custeio", investimento: "Investimento", securitizacao: "Securitização", cpr: "CPR", egf: "EGF", outros: "Outros" };
        const garantiaLabel: Record<string, string> = { alienacao_fiduciaria: "Alienação Fiduciária", hipoteca: "Hipoteca", penhor_rural: "Penhor Rural", aval: "Aval", nota_promissoria: "Nota Promissória", cpr_garantia: "CPR Garantia", cessao_recebiveis: "Cessão de Recebíveis", outros: "Outros" };
        const bemLabel: Record<string, string> = { imovel: "Imóvel", maquina: "Máquina/Equipamento", semovente: "Animal", produto_agricola: "Produto Agrícola", outro: "Outro" };
        const statusLabel: Record<string, string> = { pago: "Pago", em_aberto: "Em aberto", vencido: "Vencido" };
        const statusCor:   Record<string, { bg: string; txt: string }> = {
          pago:      { bg: "#DCFCE7", txt: "#166534" },
          em_aberto: { bg: "#EBF3FC", txt: "#0C447C" },
          vencido:   { bg: "#FEF2F2", txt: "#991B1B" },
        };
        const totalPago   = c.parcelas.filter(p => p.status === "pago").reduce((s, p) => s + p.valor_parcela, 0);
        const totalAberto = c.parcelas.filter(p => p.status !== "pago").reduce((s, p) => s + p.valor_parcela, 0);
        const periodLabel = c.periodicidade_meses === 1 ? "Mensal" : c.periodicidade_meses === 6 ? "Semestral" : c.periodicidade_meses === 12 ? "Anual" : c.periodicidade_meses ? `${c.periodicidade_meses} meses` : "—";

        const thSt: React.CSSProperties = { padding: "7px 10px", textAlign: "left", fontSize: 10, fontWeight: 700, color: "#888", borderBottom: "0.5px solid #D4DCE8", textTransform: "uppercase", whiteSpace: "nowrap" };
        const tdSt: React.CSSProperties = { padding: "7px 10px", fontSize: 12, color: "#1a1a1a", borderBottom: "0.5px solid #EEF1F6" };
        const secH: React.CSSProperties = { fontSize: 11, fontWeight: 700, color: "#1A4870", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10, paddingBottom: 6, borderBottom: "0.5px solid #D4DCE8" };

        // ── Abre preview em nova aba ─────────────────────────────
        const abrirPreview = () => {
          const win = window.open("", "_blank");
          if (!win) { alert("Permita popups neste site para visualizar o documento."); return; }
          const linhasParcelas = c.parcelas.map((p, pi) => {
            const valBRL = isUSD && ptax > 0 ? p.valor_parcela * ptax : null;
            const statusCss = p.status === "pago"
              ? "background:#DCFCE7;color:#166534"
              : p.status === "vencido"
              ? "background:#FEE2E2;color:#991B1B"
              : "background:#EBF3FC;color:#0C447C";
            return `<tr style="background:${pi % 2 === 0 ? "#fff" : "#F4F6FA"}">
              <td style="padding:4px 6px;text-align:center;color:#888">${p.num_parcela}</td>
              <td style="padding:4px 6px;white-space:nowrap">${p.data_vencimento.split("-").reverse().join("/")}</td>
              <td style="padding:4px 6px;text-align:right;font-family:monospace">${isUSD ? `USD ${fmtN(p.amortizacao,2)}` : fmtR(p.amortizacao)}</td>
              <td style="padding:4px 6px;text-align:right;font-family:monospace">${isUSD ? `USD ${fmtN(p.juros,2)}` : fmtR(p.juros)}</td>
              <td style="padding:4px 6px;text-align:right;font-family:monospace;color:#888">${isUSD ? `USD ${fmtN(p.despesas_acessorios,2)}` : fmtR(p.despesas_acessorios)}</td>
              <td style="padding:4px 6px;text-align:right;font-family:monospace;font-weight:700">${isUSD ? `USD ${fmtN(p.valor_parcela,2)}` : fmtR(p.valor_parcela)}</td>
              ${isUSD ? `<td style="padding:4px 6px;text-align:right;font-family:monospace;color:#555">${valBRL ? fmtR(valBRL) : "—"}</td>` : ""}
              ${isUSD ? `<td style="padding:4px 6px;text-align:right;color:#888">${ptax > 0 ? `R$ ${fmtN(ptax,4)}` : "—"}</td>` : ""}
              <td style="padding:4px 6px;text-align:center"><span style="padding:2px 8px;border-radius:4px;font-size:9px;font-weight:700;${statusCss}">${p.status === "pago" ? "Pago" : p.status === "vencido" ? "Vencido" : "Em aberto"}</span></td>
            </tr>`;
          }).join("");
          const garantiasHtml = c.garantias.length > 0
            ? `<div style="margin-bottom:12px;padding:6px 10px;background:#FBF3E0;border-radius:6px;border:0.5px solid #C9921B30">
                <span style="font-size:9px;color:#7A5A12;font-weight:700;text-transform:uppercase;margin-right:8px">Garantias:</span>
                ${c.garantias.map(g => `<span style="font-size:10px;color:#7A5A12;margin-right:10px">• ${garantiaLabel[g.tipo_garantia??""]}${g.tipo_bem?` (${bemLabel[g.tipo_bem??""]})`:""}${g.descricao?` — ${g.descricao}`:""}</span>`).join("")}
               </div>`
            : "";
          const thPrint = "padding:5px 6px;color:#fff;font-weight:700;font-size:9px;white-space:nowrap;";
          const colsExtrasHead = isUSD ? `<th style="${thPrint}text-align:right">Equiv. R$</th><th style="${thPrint}text-align:right">PTAX ref.</th>` : "";
          const emissao = new Date().toLocaleString("pt-BR",{day:"2-digit",month:"2-digit",year:"numeric",hour:"2-digit",minute:"2-digit"});
          win.document.write(`<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8">
<title>RacTech — ${c.descricao}</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:system-ui,sans-serif;background:#D1D5DB;color:#1a1a1a}
  .toolbar{position:sticky;top:0;background:#1A4870;padding:10px 24px;display:flex;align-items:center;justify-content:space-between;z-index:100;box-shadow:0 2px 8px rgba(0,0,0,.2)}
  .toolbar-title{color:#fff;font-size:13px;font-weight:600}
  .btn-print{display:flex;align-items:center;gap:8px;background:#fff;color:#1A4870;border:none;padding:8px 20px;border-radius:8px;font-size:13px;font-weight:700;cursor:pointer}
  .btn-print:hover{background:#f0f5fa}
  .page-wrapper{display:flex;justify-content:center;padding:28px}
  .page{background:#fff;width:297mm;padding:14mm 16mm;box-shadow:0 4px 24px rgba(0,0,0,.18)}
  @media print{
    @page{size:A4 landscape;margin:12mm 14mm}
    body{background:#fff}
    .toolbar{display:none!important}
    .page-wrapper{padding:0}
    .page{box-shadow:none;width:100%;padding:0}
  }
</style></head><body>
<div class="toolbar">
  <span class="toolbar-title">RacTech — Contrato Financeiro / RT</span>
  <button class="btn-print" onclick="window.print()">&#128438; Imprimir / Salvar PDF</button>
</div>
<div class="page-wrapper"><div class="page">
  <div style="background:#1A4870;padding:10px 14px;display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;border-radius:4px">
    <div style="display:flex;align-items:center;gap:12px">
      <img src="/Logo_Arato.png" style="height:30px;object-fit:contain;filter:brightness(0) invert(1)" onerror="this.style.display='none'" />
    </div>
    <div style="text-align:right;display:flex;flex-direction:column;align-items:flex-end;gap:4px">
      ${logoCliente ? `<img src="${logoCliente}" style="height:28px;object-fit:contain;filter:brightness(0) invert(1)" onerror="this.style.display='none'" />` : (fazenda ? `<div style="font-size:13px;font-weight:700;color:#fff">${fazenda.nome}</div>` : "")}
      <div style="font-size:9px;color:rgba(255,255,255,.6)">Emitido em ${emissao}</div>
    </div>
  </div>
  <div style="border-bottom:2px solid #1A4870;padding-bottom:7px;margin-bottom:12px">
    <div style="font-size:9px;color:#888;text-transform:uppercase;letter-spacing:.08em;margin-bottom:2px">Contrato Financeiro — Recurso de Terceiros</div>
    <div style="font-size:16px;font-weight:800;color:#1A4870;line-height:1.2">${c.descricao}</div>
  </div>
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:5px 24px;margin-bottom:12px">
    ${[
      ["Produtor / Tomador", c.produtorNome || "Não informado"],
      ["Instituição Financeira", c.credor || "—"],
      ["Nº da Cédula / Operação", c.numero_documento || "—"],
      ["Data do Contrato", fmtDt(c.data_contrato) || "—"],
      ["Tipo de Recurso", tipoLabel[c.tipo] ?? c.tipo],
      ["Moeda", isUSD ? "Dólar (USD)" : "Real (BRL)"],
      ["Taxa de Juros", c.taxa_juros_aa ? `${fmtN(c.taxa_juros_aa,2)}% a.a.` : "—"],
      ["Indexador / Linha de Crédito", c.linha_credito || "—"],
      ["Periodicidade", periodLabel],
      ["Valor Captado", isUSD ? `USD ${fmtN(c.valor_financiado,2)}` : fmtR(c.valor_financiado)],
      ...(isUSD && ptax > 0 ? [["Câmbio Ref. (PTAX)", `USD 1 = R$ ${fmtN(ptax,4)}`]] : []),
    ].map(([k,v]) => `<div style="display:flex;gap:6px"><span style="font-size:9px;color:#888;font-weight:700;text-transform:uppercase;min-width:130px;flex-shrink:0">${k}:</span><span style="font-size:10px;font-weight:500">${v}</span></div>`).join("")}
  </div>
  ${garantiasHtml}
  <div style="font-size:9px;font-weight:700;color:#1A4870;text-transform:uppercase;letter-spacing:.06em;margin-bottom:5px;padding-bottom:4px;border-bottom:1px solid #1A4870">Parcelas (${c.parcelas.length})</div>
  <table style="width:100%;border-collapse:collapse;font-size:10px">
    <thead><tr style="background:#1A4870">
      <th style="${thPrint}text-align:center">#</th>
      <th style="${thPrint}text-align:left">Vencimento</th>
      <th style="${thPrint}text-align:right">Amortização</th>
      <th style="${thPrint}text-align:right">Juros</th>
      <th style="${thPrint}text-align:right">Encargos</th>
      <th style="${thPrint}text-align:right">Valor Parcela</th>
      ${colsExtrasHead}
      <th style="${thPrint}text-align:center">Status</th>
    </tr></thead>
    <tbody>${linhasParcelas}</tbody>
  </table>
  <div style="display:flex;justify-content:space-between;align-items:flex-end;margin-top:12px;padding-top:8px;border-top:1.5px solid #1A4870">
    <div style="display:flex;gap:32px">
      <div><div style="font-size:9px;color:#888;font-weight:700;text-transform:uppercase;margin-bottom:2px">Total Pago</div>
        <div style="font-size:13px;font-weight:800;color:#16A34A">${isUSD ? `USD ${fmtN(totalPago,2)}` : fmtR(totalPago)}${isUSD && ptax > 0 ? ` ≈ ${fmtR(totalPago*ptax)}` : ""}</div></div>
      <div><div style="font-size:9px;color:#888;font-weight:700;text-transform:uppercase;margin-bottom:2px">Total a Vencer</div>
        <div style="font-size:13px;font-weight:800;color:#1A4870">${isUSD ? `USD ${fmtN(totalAberto,2)}` : fmtR(totalAberto)}${isUSD && ptax > 0 ? ` ≈ ${fmtR(totalAberto*ptax)}` : ""}</div></div>
      <div><div style="font-size:9px;color:#888;font-weight:700;text-transform:uppercase;margin-bottom:2px">Parcelas Pagas</div>
        <div style="font-size:13px;font-weight:800;color:#555">${c.parcelas.filter(p=>p.status==="pago").length}/${c.parcelas.length}</div></div>
    </div>
    <div style="font-size:9px;color:#aaa">Gerado pelo RacTech · ${new Date().toLocaleDateString("pt-BR")}</div>
  </div>
</div></div>
</body></html>`);
          win.document.close();
        };

        return (
          <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 2000, padding: 20 }}
            onClick={e => { if (e.target === e.currentTarget) setRtContratoModal(null); }}>
            <div style={{ background: "#fff", borderRadius: 14, width: "100%", maxWidth: 920, maxHeight: "92vh", display: "flex", flexDirection: "column", boxShadow: "0 4px 20px rgba(11,45,80,0.10)", overflow: "hidden" }}>

              {/* Cabeçalho */}
              <div style={{ padding: "16px 24px", background: "#1A4870", flexShrink: 0 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <div>
                    <div style={{ fontSize: 11, color: "rgba(255,255,255,0.55)", marginBottom: 3 }}>Contrato Financeiro — Recurso de Terceiros</div>
                    <div style={{ fontSize: 17, fontWeight: 800, color: "#fff", marginBottom: 6 }}>{c.descricao}</div>
                    <div style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
                      <div>
                        <span style={{ fontSize: 10, color: "rgba(255,255,255,0.5)", display: "block" }}>INSTITUIÇÃO</span>
                        <span style={{ fontSize: 13, color: "#fff", fontWeight: 600 }}>{c.credor || "—"}</span>
                      </div>
                      {c.numero_documento && (
                        <div>
                          <span style={{ fontSize: 10, color: "rgba(255,255,255,0.5)", display: "block" }}>Nº DA CÉDULA / OPERAÇÃO</span>
                          <span style={{ fontSize: 13, color: "#C9921B", fontWeight: 700, fontFamily: "monospace" }}>{c.numero_documento}</span>
                        </div>
                      )}
                      <div>
                        <span style={{ fontSize: 10, color: "rgba(255,255,255,0.5)", display: "block" }}>PRODUTOR / TOMADOR</span>
                        <span style={{ fontSize: 13, color: "#fff", fontWeight: 600 }}>{c.produtorNome || "—"}</span>
                      </div>
                    </div>
                  </div>
                  <button onClick={() => setRtContratoModal(null)} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.7)", fontSize: 22, cursor: "pointer", lineHeight: 1, flexShrink: 0, marginLeft: 16 }}>✕</button>
                </div>
              </div>

              {/* Resumo da operação */}
              <div style={{ padding: "16px 24px", background: "#F4F6FA", borderBottom: "0.5px solid #DDE2EE", flexShrink: 0 }}>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 14 }}>
                  {[
                    ["Tipo de Recurso", tipoLabel[c.tipo] ?? c.tipo],
                    ["Moeda", isUSD ? "Dólar (USD)" : "Real (BRL)"],
                    ["Taxa de Juros", c.taxa_juros_aa ? `${fmtN(c.taxa_juros_aa, 2)}% a.a.` : "—"],
                    ["Indexador", c.linha_credito || "—"],
                    ["Periodicidade", periodLabel],
                    ["Valor Captado", isUSD ? `USD ${fmtN(c.valor_financiado, 2)}` : fmtR(c.valor_financiado)],
                  ].map(([k, v]) => (
                    <div key={k}>
                      <div style={{ fontSize: 10, color: "#888", fontWeight: 600, marginBottom: 3, textTransform: "uppercase" }}>{k}</div>
                      <div style={{ fontSize: 13, color: "#1a1a1a", fontWeight: 500 }}>{v}</div>
                    </div>
                  ))}
                </div>
                {/* Garantias */}
                {c.garantias.length > 0 && (
                  <div style={{ marginTop: 12, paddingTop: 10, borderTop: "0.5px solid #DDE2EE" }}>
                    <span style={{ fontSize: 10, color: "#888", fontWeight: 700, textTransform: "uppercase", marginRight: 8 }}>Garantias:</span>
                    {c.garantias.map((g, gi) => (
                      <span key={gi} style={{ fontSize: 11, background: "#FBF3E0", color: "#7A5A12", border: "0.5px solid #C9921B30", borderRadius: 6, padding: "2px 8px", marginRight: 6 }}>
                        {garantiaLabel[g.tipo_garantia ?? ""] || g.tipo_garantia || "—"}
                        {g.tipo_bem ? ` (${bemLabel[g.tipo_bem] ?? g.tipo_bem})` : ""}
                        {g.descricao ? ` — ${g.descricao}` : ""}
                      </span>
                    ))}
                  </div>
                )}
                {isUSD && ptax > 0 && (
                  <div style={{ marginTop: 8, fontSize: 11, color: "#7A5A12", background: "#FEF9C3", padding: "5px 10px", borderRadius: 6, display: "inline-block" }}>
                    Câmbio de captação (PTAX referência): USD 1 = R$ {fmtN(ptax, 4)}
                  </div>
                )}
              </div>

              {/* Grid de parcelas */}
              <div style={{ flex: 1, overflowY: "auto", padding: "16px 24px" }}>
                <div style={secH}>Parcelas</div>
                {c.parcelas.length === 0 ? (
                  <div style={{ textAlign: "center", padding: "24px 0", color: "#888", fontSize: 13 }}>Nenhuma parcela cadastrada</div>
                ) : (
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead>
                      <tr style={{ background: "#F4F6FA" }}>
                        <th style={{ ...thSt, textAlign: "center", width: 40 }}>#</th>
                        <th style={thSt}>Vencimento</th>
                        <th style={{ ...thSt, textAlign: "right" }}>Amortização</th>
                        <th style={{ ...thSt, textAlign: "right" }}>Juros</th>
                        <th style={{ ...thSt, textAlign: "right" }}>Encargos</th>
                        <th style={{ ...thSt, textAlign: "right" }}>Valor Parcela</th>
                        {isUSD && <th style={{ ...thSt, textAlign: "right" }}>Equiv. R$</th>}
                        {isUSD && <th style={{ ...thSt, textAlign: "right" }}>PTAX ref.</th>}
                        <th style={{ ...thSt, textAlign: "center" }}>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {c.parcelas.map((p, pi) => {
                        const sc = statusCor[p.status] ?? statusCor.em_aberto;
                        const valBRL = isUSD && ptax > 0 ? p.valor_parcela * ptax : null;
                        return (
                          <tr key={pi} style={{ background: pi % 2 === 0 ? "#fff" : "#F9FAFB" }}>
                            <td style={{ ...tdSt, textAlign: "center", color: "#888", fontSize: 11 }}>{p.num_parcela}</td>
                            <td style={{ ...tdSt, whiteSpace: "nowrap" }}>{fmtDt(p.data_vencimento)}</td>
                            <td style={{ ...tdSt, textAlign: "right", fontFamily: "monospace" }}>{isUSD ? `USD ${fmtN(p.amortizacao, 2)}` : fmtR(p.amortizacao)}</td>
                            <td style={{ ...tdSt, textAlign: "right", fontFamily: "monospace" }}>{isUSD ? `USD ${fmtN(p.juros, 2)}` : fmtR(p.juros)}</td>
                            <td style={{ ...tdSt, textAlign: "right", fontFamily: "monospace", color: "#888" }}>{isUSD ? `USD ${fmtN(p.despesas_acessorios, 2)}` : fmtR(p.despesas_acessorios)}</td>
                            <td style={{ ...tdSt, textAlign: "right", fontFamily: "monospace", fontWeight: 700 }}>{isUSD ? `USD ${fmtN(p.valor_parcela, 2)}` : fmtR(p.valor_parcela)}</td>
                            {isUSD && <td style={{ ...tdSt, textAlign: "right", fontFamily: "monospace", color: "#555" }}>{valBRL ? fmtR(valBRL) : "—"}</td>}
                            {isUSD && <td style={{ ...tdSt, textAlign: "right", color: "#888", fontSize: 11 }}>{ptax > 0 ? `R$ ${fmtN(ptax, 4)}` : "—"}</td>}
                            <td style={{ ...tdSt, textAlign: "center" }}>
                              <span style={{ background: sc.bg, color: sc.txt, padding: "2px 8px", borderRadius: 5, fontSize: 10, fontWeight: 700, whiteSpace: "nowrap" }}>
                                {statusLabel[p.status] ?? p.status}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>

              {/* Rodapé — totais */}
              <div style={{ padding: "14px 24px", borderTop: "0.5px solid #DDE2EE", background: "#F4F6FA", flexShrink: 0 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div style={{ display: "flex", gap: 32 }}>
                    <div>
                      <div style={{ fontSize: 10, color: "#888", fontWeight: 700, textTransform: "uppercase", marginBottom: 2 }}>Total Pago</div>
                      <div style={{ fontSize: 16, fontWeight: 800, color: "#16A34A" }}>
                        {isUSD ? `USD ${fmtN(totalPago, 2)}` : fmtR(totalPago)}
                        {isUSD && ptax > 0 && <span style={{ fontSize: 11, color: "#888", fontWeight: 400, marginLeft: 6 }}>≈ {fmtR(totalPago * ptax)}</span>}
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: 10, color: "#888", fontWeight: 700, textTransform: "uppercase", marginBottom: 2 }}>Total a Vencer</div>
                      <div style={{ fontSize: 16, fontWeight: 800, color: totalAberto > 0 ? "#1A4870" : "#888" }}>
                        {isUSD ? `USD ${fmtN(totalAberto, 2)}` : fmtR(totalAberto)}
                        {isUSD && ptax > 0 && <span style={{ fontSize: 11, color: "#888", fontWeight: 400, marginLeft: 6 }}>≈ {fmtR(totalAberto * ptax)}</span>}
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: 10, color: "#888", fontWeight: 700, textTransform: "uppercase", marginBottom: 2 }}>Parcelas</div>
                      <div style={{ fontSize: 14, fontWeight: 700, color: "#555" }}>
                        {c.parcelas.filter(p => p.status === "pago").length}/{c.parcelas.length} pagas
                      </div>
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 10 }}>
                    <button onClick={() => setRtContratoModal(null)} style={{ padding: "8px 18px", background: "none", border: "0.5px solid #D4DCE8", borderRadius: 8, fontSize: 12, color: "#555", cursor: "pointer" }}>Fechar</button>
                    <button onClick={abrirPreview} style={{ padding: "8px 18px", background: "#F4F6FA", border: "0.5px solid #1A4870", borderRadius: 8, fontSize: 12, color: "#1A4870", cursor: "pointer", fontWeight: 600 }}>Visualizar / PDF</button>
                    <a href="/financeiro/contratos" style={{ padding: "8px 18px", background: "#1A4870", color: "#fff", borderRadius: 8, fontSize: 12, fontWeight: 600, textDecoration: "none" }}>Abrir em Contratos →</a>
                  </div>
                </div>
              </div>

            </div>
          </div>
        );
      })()}
    </div>
  );
}

// ── Verificações do Controller (executadas no BI) ────────────
async function rodarChecksBI(fazenda_id: string) {
  const { supabase } = await import("../../lib/supabase");
  const { upsertAlertaController } = await import("../../lib/db");
  const hoje = new Date();

  // Fiscal: Certificado A1
  try {
    const { data: config } = await supabase.from("configuracoes_modulo").select("valor").eq("fazenda_id", fazenda_id).eq("modulo", "fiscal").single();
    const cert = config?.valor?.cert_validade;
    if (cert) {
      const venc = new Date(cert);
      const dias = Math.ceil((venc.getTime() - hoje.getTime()) / 86400000);
      if (dias <= 30) await upsertAlertaController({ fazenda_id, categoria: "Fiscal", severidade: dias <= 7 ? "critico" : dias <= 15 ? "alto" : "medio", titulo: "Certificado A1 vencendo", descricao: `O certificado digital A1 vence em ${dias} dias (${venc.toLocaleDateString("pt-BR")}). Sem certificado válido, não é possível emitir NF-e.`, suggested_action: "Renove o certificado A1 junto à Autoridade Certificadora (AC).", check_key: "fiscal_cert_a1_vencimento", affected_id: fazenda_id, resolved_at: undefined, acknowledged_at: undefined, acknowledged_by: undefined });
    }
  } catch (_) { /* sem config */ }

  // Financeiro: CP vencidas
  try {
    const { data: cps } = await supabase.from("lancamentos").select("id,descricao,valor,vencimento").eq("fazenda_id", fazenda_id).eq("tipo", "debito").eq("status", "previsto").lt("vencimento", hoje.toISOString().slice(0, 10));
    if (cps && cps.length > 0) {
      const total = cps.reduce((s: number, l: { valor: number }) => s + (l.valor ?? 0), 0);
      await upsertAlertaController({ fazenda_id, categoria: "Financeiro", severidade: cps.length > 3 ? "critico" : "alto", titulo: `${cps.length} conta(s) a pagar vencida(s)`, descricao: `${cps.length} lançamentos de débito vencidos sem baixa, total R$ ${total.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}.`, suggested_action: "Acesse Financeiro → Contas a Pagar.", check_key: "financeiro_cp_vencidas", affected_id: fazenda_id, resolved_at: undefined, acknowledged_at: undefined, acknowledged_by: undefined });
    }
  } catch (_) { /* ignora */ }

  // Financeiro: CR vencidas
  try {
    const { data: crs } = await supabase.from("lancamentos").select("id,descricao,valor,vencimento").eq("fazenda_id", fazenda_id).eq("tipo", "credito").eq("status", "previsto").lt("vencimento", hoje.toISOString().slice(0, 10));
    if (crs && crs.length > 0) {
      const total = crs.reduce((s: number, l: { valor: number }) => s + (l.valor ?? 0), 0);
      await upsertAlertaController({ fazenda_id, categoria: "Financeiro", severidade: "medio", titulo: `${crs.length} conta(s) a receber vencida(s)`, descricao: `${crs.length} recebíveis vencidos sem baixa, total R$ ${total.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}.`, suggested_action: "Acesse Financeiro → Contas a Receber.", check_key: "financeiro_cr_vencidas", affected_id: fazenda_id, resolved_at: undefined, acknowledged_at: undefined, acknowledged_by: undefined });
    }
  } catch (_) { /* ignora */ }

  // Arrendamentos: parcelas vencendo em 15 dias
  try {
    const em15 = new Date(hoje.getTime() + 15 * 86400000).toISOString().slice(0, 10);
    const { data: parcs } = await supabase.from("arrendamento_pagamentos").select("id,arrendamento_id,vencimento,valor").eq("fazenda_id", fazenda_id).eq("status", "previsto").lte("vencimento", em15).gte("vencimento", hoje.toISOString().slice(0, 10));
    if (parcs && parcs.length > 0) await upsertAlertaController({ fazenda_id, categoria: "Arrendamentos", severidade: "medio", titulo: `${parcs.length} parcela(s) de arrendamento vencendo`, descricao: `${parcs.length} parcela(s) de arrendamento vencendo nos próximos 15 dias.`, suggested_action: "Acesse Comercial → Contratos de Arrendamento → aba Pagamentos.", check_key: "arrendamentos_parcelas_vencendo", affected_id: fazenda_id, resolved_at: undefined, acknowledged_at: undefined, acknowledged_by: undefined });
  } catch (_) { /* ignora */ }

  // Estoque: produtos abaixo do mínimo
  try {
    const { data: prods } = await supabase.from("insumos").select("id,nome,estoque_atual,estoque_minimo").eq("fazenda_id", fazenda_id).not("estoque_minimo", "is", null);
    const abaixo = (prods ?? []).filter((p: { estoque_atual: number; estoque_minimo: number }) => p.estoque_atual !== null && p.estoque_minimo !== null && p.estoque_atual < p.estoque_minimo);
    if (abaixo.length > 0) await upsertAlertaController({ fazenda_id, categoria: "Estoque", severidade: "medio", titulo: `${abaixo.length} produto(s) abaixo do estoque mínimo`, descricao: `Produtos: ${abaixo.slice(0, 3).map((p: { nome: string }) => p.nome).join(", ")}${abaixo.length > 3 ? ` e mais ${abaixo.length - 3}` : ""}.`, suggested_action: "Acesse Estoque → Posição e crie pedidos de compra.", check_key: "estoque_abaixo_minimo", affected_id: fazenda_id, resolved_at: undefined, acknowledged_at: undefined, acknowledged_by: undefined });
  } catch (_) { /* ignora */ }
}
