"use client";
import React, { useState, useEffect, useRef, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import TopNav from "../../../components/TopNav";
import { abrirPreviewImpressao } from "../../../lib/print";
import { useColumnResize, ResizeHandle } from "../../../hooks/useColumnResize";
import { listarLancamentos, listarEmpresas, listarContas, listarOperacoesGerenciais, listarProdutores, listarProdutoresDaConta, listarPessoasDaConta } from "../../../lib/db";
import { useAuth } from "../../../components/AuthProvider";
import { createBrowserClient } from "@supabase/ssr";
import type { Lancamento, Empresa, ContaBancaria, OperacaoGerencial, Produtor, Pessoa } from "../../../lib/supabase";
import PlanoGate from "../../../components/PlanoGate";

type AbaFin = "fluxo" | "dfc" | "posicao" | "cpcr";

interface SimEntry {
  id: string;
  descricao: string;
  valor: number;
  data: string;
  tipo: "entrada" | "saida";
  ativo: boolean;
  fornecedor: string;
}

interface FlowRow {
  data: string;
  fornecedor: string;
  descricao: string;
  tipo_row: "real" | "pendente" | "previsao" | "simulacao";
  entrada: number;
  saida: number;
  subMoeda?: string;
  origem_lancamento?: string;
}

type FiltroFluxo = {
  empresasSel:   string[];
  contasSel:     string[];
  produtoresSel: string[];
  inicio:        string;
  fim:           string;
  moedaExib:     "BRL" | "USD";
  visao:         "ambos" | "realizado" | "projetado";
  tipoVis:       "ambos" | "previsto" | "realizado";
  moedasSel:     string[];   // [] = todas; ["BRL","USD","barter"] = filtro
};

// ─── Helpers ──────────────────────────────────────────────────
const fmtUSDRel = (v: number) => `US$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const paraBRLRel = (l: any, fallback: number) => l.moeda === "USD" ? l.valor * (l.cotacao_usd ?? fallback) : l.valor;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const subMoedaRel = (l: any, fallback: number): string | undefined => l.moeda === "USD" ? `${fmtUSDRel(l.valor)} @ R$${(l.cotacao_usd ?? fallback).toFixed(2)}` : undefined;

const fmtBRL = (v: number, decimais = 0) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: decimais, maximumFractionDigits: decimais });

const fmtNum = (v: number, dec = 0) =>
  v.toLocaleString("pt-BR", { minimumFractionDigits: dec, maximumFractionDigits: dec });

// Replica a lógica do statusEfetivo do módulo CP/CR para filtros no relatório
const hoje = new Date().toISOString().split("T")[0];
const statusEfetivo = (l: { status: string; natureza?: string; data_vencimento?: string }): string => {
  if (l.status === "baixado" || l.status === "parcial") return l.status;
  if (l.natureza === "previsao") return l.status;
  const venc = l.data_vencimento ?? "";
  if (venc && venc < hoje) return "vencido";
  if (venc && venc === hoje) return "vencendo";
  return l.status;
};

const aplicarMascara = (raw: string): string => {
  const nums = raw.replace(/\D/g, "");
  if (!nums) return "";
  return (Number(nums) / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};
const desmascarar = (masked: string): number =>
  Number(masked.replace(/\./g, "").replace(",", ".")) || 0;

const inputStyle: React.CSSProperties = {
  width: "100%", padding: "8px 10px", border: "0.5px solid var(--border-table)",
  borderRadius: 8, fontSize: 13, color: "var(--text-1)", background: "var(--bg-input)",
  boxSizing: "border-box", outline: "none",
};
const labelStyle: React.CSSProperties = { fontSize: 11, color: "var(--text-2)", marginBottom: 4, display: "block" };


// ─── Componente principal ─────────────────────────────────────
function FinanceiroRelatoriosInner() {
  const { fazendaId, fazendaIds, contaId, emailUsuario, podeAcessarPlano, nomeFazendaSelecionada, contaModulosOverrides } = useAuth();
  const searchParams = useSearchParams();
  const aba = (searchParams.get("aba") as AbaFin) || "fluxo";

  const temApoio = contaModulosOverrides["apoio_financeiro"] === true;

  const [lancamentos,  setLancamentos]  = useState<Lancamento[]>([]);
  const [pessoas,      setPessoas]      = useState<Pessoa[]>([]);
  const [empresas,     setEmpresas]     = useState<Empresa[]>([]);
  const [contas,       setContas]       = useState<ContaBancaria[]>([]);
  const [produtores,   setProdutores]   = useState<Produtor[]>([]);
  const [operacoesGer, setOperacoesGer] = useState<OperacaoGerencial[]>([]);
  const [apoioBaixasIds,  setApoioBaixasIds]  = useState<Set<string>>(new Set());
  const [apoioLancsAbertos, setApoioLancsAbertos] = useState<{ id: string; tipo: string; descricao: string; valor: number; data_vencimento: string; categoria: string | null; pessoa_nome: string | null }[]>([]);
  const [incluirApoio,   setIncluirApoio]   = useState(true);
  const [carregando,  setCarregando]  = useState(true);
  const [cotacaoUSD,  setCotacaoUSD]  = useState<number>(5.90);
  const [filtroAberto, setFiltroAberto] = useState(false);

  const anoAtual = new Date().getFullYear();
  const tipoParam = searchParams.get("tipo"); // "previsto" | "realizado" | null

  const [filtro, setFiltro] = useState<FiltroFluxo>(() => {
    const hoje = new Date();
    const hojeFmt = hoje.toISOString().split("T")[0];
    let inicio = `${anoAtual}-01-01`;
    let fim    = `${anoAtual}-12-31`;
    let tipoVis: FiltroFluxo["tipoVis"] = "ambos";
    if (tipoParam === "previsto") {
      const em6 = new Date(hoje); em6.setMonth(em6.getMonth() + 6);
      inicio = hojeFmt; fim = em6.toISOString().split("T")[0]; tipoVis = "previsto";
    } else if (tipoParam === "realizado") {
      const ha6 = new Date(hoje); ha6.setMonth(ha6.getMonth() - 6);
      inicio = ha6.toISOString().split("T")[0]; fim = hojeFmt; tipoVis = "realizado";
    }
    return { empresasSel: [], contasSel: [], produtoresSel: [], inicio, fim, moedaExib: "BRL", visao: "ambos", tipoVis, moedasSel: [] };
  });
  const [mesesExpandidos,   setMesesExpandidos]   = useState<Set<string>>(new Set());
  const [simEntries,        setSimEntries]        = useState<SimEntry[]>([]);
  const [simulacoesAtivas,  setSimulacoesAtivas]  = useState(true);
  const [incluirPrevisoes,  setIncluirPrevisoes]  = useState(true);
  const [simForm,           setSimForm]           = useState({ descricao: "", valor: "", data: "", tipo: "entrada" as "entrada"|"saida", fornecedor: "" });
  const [simEditId,         setSimEditId]         = useState<string | null>(null);
  const [simPopupAberto,    setSimPopupAberto]    = useState(false);

  // Fluxo — sub-aba Diário / Mensal
  const [subAbaFluxo, setSubAbaFluxo] = useState<"diario" | "mensal" | "anual">("diario");
  const [expandidosA,  setExpandidosA]  = useState<Set<string>>(new Set());
  // Filtros exclusivos da aba Anual
  const [anualInicio,  setAnualInicio]  = useState("");
  const [anualFim,     setAnualFim]     = useState("");
  const ALL_STATUS_A = ["baixado", "em_aberto", "vencido", "vencendo"] as const;
  const [anualStatus, setAnualStatus]   = useState<Set<string>>(new Set(ALL_STATUS_A));

  // Ref para dados do modo Anual — alimentado durante o render do IIFE
  type PrintAnualData = {
    anosPresentes: string[];
    entradasA: { cat: string; anos: { real: number; prev: number }[] }[];
    saidasA:   { cat: string; anos: { real: number; prev: number }[] }[];
    totEntA: number[];
    totSaiA: number[];
    saldoAnoA: number[];
    saldoAcA:  number[];
    incluirPrevisoes: boolean;
  };
  const printAnualRef  = useRef<PrintAnualData | null>(null);

  type PrintDiarioData = {
    dias: string[];
    diasMap: Record<string, Array<FlowRow & { saldo: number; simEntrada: number; simSaida: number }>>;
    totalEntradas: number;
    totalSaidas: number;
    saldoFinal: number;
    saldoInicial: number;
    filtroInicio: string;
    filtroFim: string;
    tipoVis: string;
  };
  const printDiarioRef = useRef<PrintDiarioData | null>(null);

  // DFC / Mensal — filtros
  const [dfcAno, setDfcAno] = useState(String(anoAtual));

  // CP/CR — filtros (devem ficar no topo — Rules of Hooks)
  const [tipoCPCR,    setTipoCPCR]    = useState<"todos"|"receber"|"pagar">("todos");
  const [statusCPCR,  setStatusCPCR]  = useState<Set<string>>(new Set());   // vazio = todos
  const [catCPCR,     setCatCPCR]     = useState<Set<string>>(new Set());   // vazio = todas
  const [prodCPCR,    setProdCPCR]    = useState<Set<string>>(new Set());   // vazio = todos
  const [statusDDOpen, setStatusDDOpen] = useState(false);
  const [catDDOpen,    setCatDDOpen]    = useState(false);
  const [prodDDOpen,   setProdDDOpen]   = useState(false);
  const [inicioCPCR,  setInicioCPCR]  = useState(`${anoAtual}-01-01`);
  const [fimCPCR,     setFimCPCR]     = useState(`${anoAtual}-12-31`);
  // Agrupamentos — lista ordenada de dimensões ativas
  type GrupoKey = "produtor" | "og" | "data" | "categoria" | "status" | "tipo";
  const [agrupAtivos, setAgrupAtivos] = useState<GrupoKey[]>([]);
  const [gruposExpand, setGruposExpand] = useState<Set<string>>(new Set());

  // ── Grid configurável CP/CR ──────────────────────────────────
  const COLUNAS_CPCR_DEF = [
    { key: "tipo",           label: "Tipo",           defaultW: 60,  align: "left"  as const },
    { key: "fornecedor",     label: "Fornecedor",     defaultW: 190, align: "left"  as const },
    { key: "numero_nf",      label: "Nº NF",          defaultW: 110, align: "left"  as const },
    { key: "vencimento",     label: "Vencimento",     defaultW: 100, align: "left"  as const },
    { key: "valor",          label: "Valor",          defaultW: 110, align: "right" as const },
    { key: "status",         label: "Status",         defaultW: 90,  align: "left"  as const },
    { key: "data_pagamento", label: "Data Pgto",      defaultW: 100, align: "left"  as const },
    { key: "valor_pago",     label: "Valor Pago",     defaultW: 110, align: "right" as const },
    { key: "moeda",          label: "Moeda",          defaultW: 65,  align: "left"  as const },
    { key: "produtor",       label: "Produtor",       defaultW: 140, align: "left"  as const },
    { key: "observacao",     label: "Observação",     defaultW: 180, align: "left"  as const },
  ];
  const _defCPCROrder = COLUNAS_CPCR_DEF.map(c => c.key);
  const _defCPCRVis   = Object.fromEntries(COLUNAS_CPCR_DEF.map(c => [c.key, true]));
  const _defCPCRW     = Object.fromEntries(COLUNAS_CPCR_DEF.map(c => [c.key, c.defaultW]));
  const [cpcrColOrder,   setCpcrColOrder]   = useState<string[]>(_defCPCROrder);
  const [cpcrColVis,     setCpcrColVis]     = useState<Record<string,boolean>>(_defCPCRVis);
  const [cpcrColDDOpen,  setCpcrColDDOpen]  = useState(false);
  const cpcrDragCol = useRef<string | null>(null);
  const { widths: cpcrW, startResize: cpcrResize } = useColumnResize(
    _defCPCRW,
    emailUsuario ? `cpcr_colW_${emailUsuario}` : undefined,
  );
  // Carrega config salva quando emailUsuario carrega
  useEffect(() => {
    if (!emailUsuario || typeof window === "undefined") return;
    try {
      const savedOrder = localStorage.getItem(`cpcr_colOrder_${emailUsuario}`);
      const savedVis   = localStorage.getItem(`cpcr_colVis_${emailUsuario}`);
      if (savedOrder) setCpcrColOrder(JSON.parse(savedOrder));
      if (savedVis)   setCpcrColVis(prev => ({ ..._defCPCRVis, ...JSON.parse(savedVis) }));
    } catch { /* ok */ }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [emailUsuario]);
  const saveCpcrColOrder = (order: string[]) => {
    setCpcrColOrder(order);
    if (emailUsuario) localStorage.setItem(`cpcr_colOrder_${emailUsuario}`, JSON.stringify(order));
  };
  const saveCpcrColVis = (vis: Record<string,boolean>) => {
    setCpcrColVis(vis);
    if (emailUsuario) localStorage.setItem(`cpcr_colVis_${emailUsuario}`, JSON.stringify(vis));
  };

  const toggleMes = (m: string) =>
    setMesesExpandidos(prev => { const s = new Set(prev); s.has(m) ? s.delete(m) : s.add(m); return s; });

  useEffect(() => {
    if (!fazendaId) return;
    const sb = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    );
    // Carrega de TODAS as fazendas da conta para incluir previsões de todas as fazendas
    const fidsParaCarregar = fazendaIds?.length ? fazendaIds : [fazendaId];
    Promise.all([
      Promise.all(fidsParaCarregar.map(fid => listarLancamentos(fid))).then(results => results.flat()),
      listarOperacoesGerenciais(fazendaId),
      temApoio
        ? sb.from("apoio_baixas").select("lancamento_id").in("fazenda_id", fazendaIds)
        : Promise.resolve({ data: [] }),
      temApoio
        ? sb.from("apoio_lancamentos").select("id,tipo,descricao,valor,data_vencimento,categoria,pessoa_nome").in("fazenda_id", fazendaIds).eq("baixado", false)
        : Promise.resolve({ data: [] }),
    ]).then(([lans, ops, apoioRes, apoioLancsRes]) => {
      setLancamentos(lans);
      setOperacoesGer(ops);
      const ids = ((apoioRes as { data: { lancamento_id: string }[] | null }).data ?? []).map(b => b.lancamento_id);
      setApoioBaixasIds(new Set(ids));
      setApoioLancsAbertos((apoioLancsRes as { data: { id: string; tipo: string; descricao: string; valor: number; data_vencimento: string; categoria: string | null; pessoa_nome: string | null }[] | null }).data ?? []);
    }).catch(() => {})
      .finally(() => setCarregando(false));
    listarEmpresas(fazendaId).then(setEmpresas).catch(() => setEmpresas([]));
    listarContas(fazendaId).then(setContas).catch(() => setContas([]));
    if (contaId) {
      listarProdutoresDaConta(contaId).then(setProdutores).catch(() => setProdutores([]));
    } else {
      listarProdutores(fazendaId).then(setProdutores).catch(() => setProdutores([]));
    }
    listarPessoasDaConta(fazendaId).then(setPessoas).catch(() => setPessoas([]));
    fetch("/api/precos").then(r => r.json()).then(d => {
      const taxa = d?.usdPtax ?? d?.usdBrl;
      if (taxa && taxa > 0) setCotacaoUSD(taxa);
    }).catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fazendaId, temApoio, fazendaIds?.join(",")]);

  // localStorage simulações — escopad por fazenda para não vazar entre clientes
  const simKey = fazendaId ? `ractech_sim_fluxo_${fazendaId}` : null;
  useEffect(() => {
    if (!simKey) return;
    try {
      const saved = localStorage.getItem(simKey);
      setSimEntries(saved ? JSON.parse(saved) : []);
    } catch { setSimEntries([]); }
  }, [simKey]);
  useEffect(() => {
    if (!simKey) return;
    try { localStorage.setItem(simKey, JSON.stringify(simEntries)); }
    catch { /* ignore */ }
  }, [simEntries, simKey]);

  // ─── DFC — derivados baseados nas Operações Gerenciais ────────────────────
  const MESES_DFC = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];

  // Lancamentos baixados no exercício selecionado
  const lanBaixados = lancamentos.filter(l => {
    const dt = l.data_baixa ?? l.data_vencimento ?? "";
    return l.status === "baixado" && dt.startsWith(dfcAno);
  });

  // Separar entradas e saídas por operacao_id × mês
  const dfcEntMap: Record<string, number> = {};
  const dfcSaiMap: Record<string, number> = {};
  for (const l of lanBaixados) {
    if (!l.operacao_id) continue;
    const mm = (l.data_baixa ?? l.data_vencimento ?? "").slice(5, 7);
    const key = `${l.operacao_id}_${mm}`;
    if (l.tipo === "receber") dfcEntMap[key] = (dfcEntMap[key] ?? 0) + l.valor;
    else                      dfcSaiMap[key] = (dfcSaiMap[key] ?? 0) + l.valor;
  }

  // Líquido mensal de uma operação (receber − pagar): positivo = entrada, negativo = saída
  const opLiqMes = (opId: string): number[] =>
    MESES_DFC.map((_, i) => {
      const mm = String(i + 1).padStart(2, "0");
      return (dfcEntMap[`${opId}_${mm}`] ?? 0) - (dfcSaiMap[`${opId}_${mm}`] ?? 0);
    });

  // Operações relevantes para DFC (excluir grupos 4 e 5 = movimentos econômicos/estoque)
  const opsDFC = operacoesGer.filter(op => {
    const cl = op.classificacao ?? "";
    return !cl.startsWith("4") && !cl.startsWith("5");
  });

  // Leaf = tem pelo menos uma flag financeira ativa (gera movimento de caixa real)
  const isDFCLeaf = (op: OperacaoGerencial) =>
    !!(op.permite_cp_cr || op.permite_tesouraria || op.gerar_financeiro || op.gerar_financeiro_gerencial);

  // Leaves filhos de um prefixo de classificação
  const leavesUnder = (pref: string) =>
    opsDFC.filter(op => {
      const cl = op.classificacao ?? "";
      return isDFCLeaf(op) && (cl === pref || cl.startsWith(pref + "."));
    });

  // Subtotal líquido mensal de todos os leaves sob um prefixo
  const prefLiqMes = (pref: string): number[] =>
    leavesUnder(pref).reduce(
      (acc, op) => { const mv = opLiqMes(op.id); return acc.map((v, i) => v + mv[i]); },
      Array(12).fill(0) as number[]
    );

  // Atividade DFC de um código de classificação
  const dfcAtiv = (c: string) => {
    const cl = c ?? "";
    return (cl.startsWith("1") || cl.startsWith("2"))           ? "op"  :
           (cl === "3.01" || cl.startsWith("3.01.") ||
            cl === "3.02" || cl.startsWith("3.02."))            ? "inv" :
           cl.startsWith("3.")                                  ? "fin" : null;
  };

  // Grupos filtrados por atividade DFC
  const opsGrupo1   = opsDFC.filter(op => (op.classificacao ?? "").startsWith("1"));
  const opsGrupo2   = opsDFC.filter(op => (op.classificacao ?? "").startsWith("2"));
  const opsGrupoInv = opsDFC.filter(op => dfcAtiv(op.classificacao ?? "") === "inv");
  const opsGrupoFin = opsDFC.filter(op => dfcAtiv(op.classificacao ?? "") === "fin");

  // Subtotais por atividade (12 meses)
  const liqGrupo1   = prefLiqMes("1");
  const liqGrupo2   = prefLiqMes("2");
  const liqOp       = liqGrupo1.map((v, i) => v + liqGrupo2[i]);
  const liqInv      = [...leavesUnder("3.01"), ...leavesUnder("3.02")]
    .reduce((acc, op) => { const mv = opLiqMes(op.id); return acc.map((v, i) => v + mv[i]); }, Array(12).fill(0) as number[]);
  const liqFin      = opsDFC
    .filter(op => isDFCLeaf(op) && dfcAtiv(op.classificacao ?? "") === "fin")
    .reduce((acc, op) => { const mv = opLiqMes(op.id); return acc.map((v, i) => v + mv[i]); }, Array(12).fill(0) as number[]);
  const varLiqMes   = liqOp.map((v, i) => v + liqInv[i] + liqFin[i]);

  const totOp  = liqOp.reduce((s, v) => s + v, 0);
  const totInv = liqInv.reduce((s, v) => s + v, 0);
  const totFin = liqFin.reduce((s, v) => s + v, 0);
  const totVar = totOp + totInv + totFin;

  // Saldo acumulado no exercício
  let _saldoAc = 0;
  const saldoAcMes = varLiqMes.map(v => { _saldoAc += v; return _saldoAc; });

  const anosDispo = Array.from(new Set(lancamentos.map(l => (l.data_vencimento ?? "").slice(0, 4)).filter(a => a.length === 4))).sort().reverse();
  if (!anosDispo.includes(String(anoAtual))) anosDispo.unshift(String(anoAtual));

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh", background: "var(--bg-page)", fontFamily: "system-ui, sans-serif", fontSize: 13 }}>
      <TopNav />
      <main style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>

        <header style={{ background: "var(--bg-card)", borderBottom: "0.5px solid var(--border-table)", padding: "10px 22px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 17, fontWeight: 600, color: "var(--text-1)" }}>
              {{ fluxo: "Fluxo de Caixa", cpcr: "CP / CR — Contas", dfc: "DFC — Demonstrativo", posicao: "Posição por Conta" }[aba]}
            </h1>
            <p style={{ margin: 0, fontSize: 11, color: "#444" }}>Relatórios Financeiros</p>
          </div>
          <button onClick={() => {
            const fazenda = nomeFazendaSelecionada ?? "";
            const opts = { orientation: "landscape" as const, fazenda };

            if (aba === "fluxo" && subAbaFluxo === "anual" && printAnualRef.current) {
              // Gera HTML limpo — tabela de categorias × anos sem elementos interativos
              const d = printAnualRef.current;
              const fmtV = (v: number) => v === 0 ? "—" : v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2 });
              const corV = (v: number) => v < 0 ? "#B91C1C" : v === 0 ? "var(--text-muted)" : "#111111";
              // Com muitas colunas, reduz fonte e padding para maximizar aproveitamento da página
              const nCols = d.anosPresentes.length + 2; // anos + Categoria + Total
              const compacto = nCols > 8;
              const fs   = compacto ? "9px"  : "11px";
              const fsSm = compacto ? "8px"  : "10px";
              const pad  = compacto ? "4px 5px" : "6px 8px";
              const padL = compacto ? "4px 5px 4px 14px" : "5px 8px 5px 20px";
              const padSec = compacto ? "4px 6px" : "6px 10px";

              const th = (txt: string, align = "right") =>
                `<th style="padding:${pad};text-align:${align};font-size:${fs};font-weight:700;color:#555;border-bottom:1.5px solid #111111;white-space:nowrap">${txt}</th>`;
              const td = (txt: string, opts2: { color?: string; bold?: boolean; align?: string; bg?: string } = {}) =>
                `<td style="padding:${pad};text-align:${opts2.align ?? "right"};color:${opts2.color ?? "var(--text-1)"};font-weight:${opts2.bold ? 700 : 400};background:${opts2.bg ?? "transparent"};white-space:nowrap;font-size:${fs}">${txt}</td>`;

              const catRows = (rows: typeof d.entradasA, cor: string) => rows
                .filter(r => r.anos.some(c => c.real + c.prev > 0))
                .map(r => {
                  const totRow = r.anos.reduce((s, c) => s + c.real + c.prev, 0);
                  const cells = r.anos.map(c => {
                    const tot = c.real + c.prev;
                    const prevOnly = c.prev > 0 && c.real === 0;
                    return tot > 0
                      ? `<td style="padding:${pad};text-align:right;white-space:nowrap;font-size:${fs}"><span style="color:${cor};font-weight:600">${fmtV(tot)}</span>${prevOnly ? `<br><span style="font-size:${fsSm};color:#C9921B">prev</span>` : ""}</td>`
                      : `<td style="padding:${pad};text-align:right;color:#DDE2EE;font-size:${fsSm}">—</td>`;
                  }).join("");
                  return `<tr style="border-bottom:0.5px solid #F0F3FA">
                    <td style="padding:${padL};font-size:${fs};color:${cor};max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${r.cat}</td>
                    ${cells}
                    ${td(fmtV(totRow), { color: cor, bold: true })}
                  </tr>`;
                }).join("");

              const secHeader = (label: string, bg: string, cor: string) =>
                `<tr style="background:${bg}"><td colspan="${d.anosPresentes.length + 2}" style="padding:${padSec};font-weight:700;font-size:${fsSm};color:${cor};letter-spacing:.06em;text-transform:uppercase">${label}</td></tr>`;

              const totalRow = (label: string, vals: number[], cor: string, bg = "var(--bg-page)", bold = true) =>
                `<tr style="background:${bg};border-top:0.5px solid var(--border)">
                  ${td(label, { align: "left", bold, color: "#111111", bg })}
                  ${vals.map(v => td(v === 0 ? "—" : fmtV(v), { color: v === 0 ? "#bbb" : cor, bold, bg })).join("")}
                  ${td(fmtV(vals.reduce((s, v) => s + v, 0)), { color: corV(vals.reduce((s, v) => s + v, 0)), bold, bg })}
                </tr>`;

              const html = `
                <p style="font-size:11px;color:#555;margin-bottom:10px">
                  Visão plurianual · anos: ${d.anosPresentes.join(", ")} · ${d.incluirPrevisoes ? "Realizados + pendentes" : "Somente realizados"}
                </p>
                <div class="auto-fit-table">
                <table style="border-collapse:collapse;font-family:system-ui,sans-serif;white-space:nowrap">
                  <thead>
                    <tr style="background:var(--bg-page)">
                      ${th("Categoria", "left")}
                      ${d.anosPresentes.map(a => th(a)).join("")}
                      ${th("Total Geral")}
                    </tr>
                  </thead>
                  <tbody>
                    ${secHeader("Entradas", "var(--bg-page)", "#111111")}
                    ${d.entradasA.some(r => r.anos.some(c => c.real + c.prev > 0)) ? catRows(d.entradasA, "#111111") : `<tr><td colspan="${d.anosPresentes.length + 2}" style="padding:8px 20px;color:#888;font-size:11px">Nenhuma entrada.</td></tr>`}
                    ${totalRow("Total Entradas", d.totEntA, "#111111")}
                    ${secHeader("Saídas", "var(--bg-page)", "var(--text-2)")}
                    ${d.saidasA.some(r => r.anos.some(c => c.real + c.prev > 0)) ? catRows(d.saidasA, "var(--text-1)") : `<tr><td colspan="${d.anosPresentes.length + 2}" style="padding:8px 20px;color:#888;font-size:11px">Nenhuma saída.</td></tr>`}
                    ${totalRow("Total Saídas", d.totSaiA, "var(--text-1)")}
                    ${totalRow("Saldo do Ano", d.saldoAnoA, "", "var(--bg-tag)")}
                    ${totalRow("Saldo Acumulado", d.saldoAcA, "", "var(--bg-tag)")}
                  </tbody>
                </table>
                </div>`;

              abrirPreviewImpressao("Fluxo de Caixa — Anual", html, { ...opts, subtitulo: fazenda });
            } else if (aba === "fluxo" && subAbaFluxo === "diario" && printDiarioRef.current) {
              const d = printDiarioRef.current;
              const fmtV = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2 });
              const fmtDt = (dt: string) => dt ? new Date(dt + "T12:00:00").toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "2-digit", year: "numeric" }) : "—";

              const ORIG_LABEL: Record<string, string> = {
                pedido_compra: "Pedido Compra", nf_entrada: "NF Entrada", nf_saida: "NF Saída",
                contrato: "Contrato Venda", arrendamento: "Arrendamento",
                contrato_financeiro: "Contrato Fin.", manual: "Manual", cron: "Automático",
                transporte: "Transporte", apoio_financeiro: "Apoio Financeiro",
              };
              const TIPO_LABEL: Record<string, string> = { real: "Realizado", pendente: "Pendente", previsao: "Previsão", simulacao: "Simulação" };

              const linhas = d.dias.map(dia => {
                const diaRows = d.diasMap[dia];
                const diaEnt  = diaRows.reduce((s, r) => s + r.entrada, 0);
                const diaSai  = diaRows.reduce((s, r) => s + r.saida, 0);
                const diaUltSaldo = diaRows[diaRows.length - 1].saldo;
                const cabDia = `
                  <tr style="background:#F0F4FA;border-top:1.5px solid #DDE2EE">
                    <td colspan="2" style="padding:7px 10px;font-weight:700;font-size:11px;color:#1A4870">${fmtDt(dia)}</td>
                    <td style="padding:7px 10px;font-size:10px;color:#888">${diaRows.length} lançamento${diaRows.length !== 1 ? "s" : ""}</td>
                    <td style="padding:7px 10px;font-size:10px;color:#888"></td>
                    <td style="padding:7px 10px;text-align:right;font-weight:700;color:#16A34A;font-size:11px">${diaEnt > 0 ? fmtV(diaEnt) : ""}</td>
                    <td style="padding:7px 10px;text-align:right;font-weight:700;color:#E24B4A;font-size:11px">${diaSai > 0 ? fmtV(diaSai) : ""}</td>
                    <td style="padding:7px 10px;text-align:right;font-weight:700;font-size:11px;color:${diaUltSaldo >= 0 ? "#111" : "#E24B4A"}">${fmtV(diaUltSaldo)}</td>
                  </tr>`;
                const detalhes = diaRows.map(r => {
                  const origLabel = r.origem_lancamento ? (ORIG_LABEL[r.origem_lancamento] ?? r.origem_lancamento) : TIPO_LABEL[r.tipo_row];
                  return `<tr style="border-bottom:0.5px solid #F0F3FA">
                    <td style="padding:5px 10px 5px 20px;font-size:10px;color:#888;white-space:nowrap">${new Date(r.data + "T12:00:00").toLocaleDateString("pt-BR")}</td>
                    <td style="padding:5px 10px;font-size:11px;color:#444;max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${r.fornecedor || "—"}</td>
                    <td style="padding:5px 10px;font-size:11px;color:#444;max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${r.descricao || "—"}</td>
                    <td style="padding:5px 10px;font-size:10px;color:#666">${origLabel}</td>
                    <td style="padding:5px 10px;text-align:right;font-weight:600;color:#16A34A;font-size:11px">${r.entrada > 0 ? fmtV(r.entrada) : ""}</td>
                    <td style="padding:5px 10px;text-align:right;font-weight:600;color:#E24B4A;font-size:11px">${r.saida > 0 ? fmtV(r.saida) : ""}</td>
                    <td style="padding:5px 10px;text-align:right;font-weight:700;font-size:11px;color:${r.saldo >= 0 ? "#111" : "#E24B4A"}">${fmtV(r.saldo)}</td>
                  </tr>`;
                }).join("");
                return cabDia + detalhes;
              }).join("");

              const periodo = `${new Date(d.filtroInicio + "T12:00:00").toLocaleDateString("pt-BR")} a ${new Date(d.filtroFim + "T12:00:00").toLocaleDateString("pt-BR")}`;
              const tipoLabel = { ambos: "Previstos + Realizados", previsto: "Somente Previstos", realizado: "Somente Realizados" }[d.tipoVis] ?? "";

              const html = `
                <!-- Resumo de filtros -->
                <div style="display:flex;gap:24px;flex-wrap:wrap;margin-bottom:14px;padding:10px 14px;background:#F8FAFB;border:0.5px solid #DDE2EE;border-radius:8px;font-size:11px;color:#555">
                  <span><strong>Período:</strong> ${periodo}</span>
                  <span><strong>Tipo:</strong> ${tipoLabel}</span>
                  ${d.saldoInicial !== 0 ? `<span><strong>Saldo Inicial:</strong> <span style="color:${d.saldoInicial >= 0 ? "#111" : "#E24B4A"}">${fmtV(d.saldoInicial)}</span></span>` : ""}
                </div>
                <!-- KPIs -->
                <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:16px">
                  <div style="background:#F0FDF4;border:0.5px solid #BBF7D0;border-radius:8px;padding:10px 14px">
                    <div style="font-size:10px;color:#166534;margin-bottom:3px">Total Entradas</div>
                    <div style="font-size:16px;font-weight:700;color:#16A34A">${fmtV(d.totalEntradas)}</div>
                  </div>
                  <div style="background:#FEF2F2;border:0.5px solid #FECACA;border-radius:8px;padding:10px 14px">
                    <div style="font-size:10px;color:#991B1B;margin-bottom:3px">Total Saídas</div>
                    <div style="font-size:16px;font-weight:700;color:#E24B4A">${fmtV(d.totalSaidas)}</div>
                  </div>
                  <div style="background:${d.saldoFinal >= 0 ? "#EFF6FF" : "#FEF2F2"};border:0.5px solid ${d.saldoFinal >= 0 ? "#BFDBFE" : "#FECACA"};border-radius:8px;padding:10px 14px">
                    <div style="font-size:10px;color:#1E3A5F;margin-bottom:3px">Saldo Final</div>
                    <div style="font-size:16px;font-weight:700;color:${d.saldoFinal >= 0 ? "#1A4870" : "#E24B4A"}">${fmtV(d.saldoFinal)}</div>
                  </div>
                </div>
                <!-- Tabela -->
                <div class="auto-fit-table">
                <table style="width:100%;border-collapse:collapse;font-family:system-ui,sans-serif">
                  <thead>
                    <tr style="background:#1A4870">
                      <th style="padding:7px 10px;text-align:left;font-size:10px;font-weight:700;color:#fff;white-space:nowrap">Data</th>
                      <th style="padding:7px 10px;text-align:left;font-size:10px;font-weight:700;color:#fff">Fornecedor / Pagador</th>
                      <th style="padding:7px 10px;text-align:left;font-size:10px;font-weight:700;color:#fff">Descrição</th>
                      <th style="padding:7px 10px;text-align:left;font-size:10px;font-weight:700;color:#fff">Origem</th>
                      <th style="padding:7px 10px;text-align:right;font-size:10px;font-weight:700;color:#86EFAC;white-space:nowrap">Entrada</th>
                      <th style="padding:7px 10px;text-align:right;font-size:10px;font-weight:700;color:#FCA5A5;white-space:nowrap">Saída</th>
                      <th style="padding:7px 10px;text-align:right;font-size:10px;font-weight:700;color:#fff;white-space:nowrap">Saldo Acum.</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${linhas || '<tr><td colspan="7" style="padding:20px;text-align:center;color:#999">Nenhum lançamento no período.</td></tr>'}
                    <tr style="background:#1A4870;border-top:1.5px solid #111">
                      <td colspan="4" style="padding:8px 10px;font-size:11px;font-weight:700;color:#fff">TOTAIS</td>
                      <td style="padding:8px 10px;text-align:right;font-weight:700;color:#86EFAC;font-size:12px">${fmtV(d.totalEntradas)}</td>
                      <td style="padding:8px 10px;text-align:right;font-weight:700;color:#FCA5A5;font-size:12px">${fmtV(d.totalSaidas)}</td>
                      <td style="padding:8px 10px;text-align:right;font-weight:700;color:#fff;font-size:12px">${fmtV(d.saldoFinal)}</td>
                    </tr>
                  </tbody>
                </table>
                </div>`;

              abrirPreviewImpressao("Fluxo de Caixa — Diário", html, { ...opts, subtitulo: fazenda });
            } else {
              // Modo mensal: DOM com elementos interativos ocultos
              const el = document.getElementById("fluxo-print-content");
              abrirPreviewImpressao(
                `Fluxo de Caixa${{ diario: " — Diário", mensal: " — Mensal", anual: " — Anual" }[subAbaFluxo]}`,
                el?.innerHTML ?? "",
                opts,
              );
            }
          }} style={{ background: "#1A5C38", color: "#fff", border: "none", borderRadius: 8, padding: "8px 16px", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
            Imprimir / PDF
          </button>
        </header>

        {/* ── Banner Apoio Financeiro (só exibe se addon ativo e aba fluxo) ── */}
        {temApoio && aba === "fluxo" && (
          <div style={{ background: incluirApoio ? "#F2F2F2" : "#F9FAFB", borderBottom: "0.5px solid #DDE2EE", padding: "8px 22px", display: "flex", alignItems: "center", gap: 10 }}>
            <label style={{ display: "flex", alignItems: "center", gap: 7, cursor: "pointer", fontSize: 12, color: "#111111", fontWeight: 500 }}>
              <input
                type="checkbox"
                checked={incluirApoio}
                onChange={e => setIncluirApoio(e.target.checked)}
                style={{ width: 15, height: 15, accentColor: "#2A2A2A", cursor: "pointer" }}
              />
              Incluir baixas do Apoio Financeiro
            </label>
            <span style={{ fontSize: 11, color: "#555" }}>
              {incluirApoio
                ? `${apoioBaixasIds.size} baixa${apoioBaixasIds.size !== 1 ? "s" : ""} do apoio incluída${apoioBaixasIds.size !== 1 ? "s" : ""} no fluxo`
                : `${apoioBaixasIds.size} baixa${apoioBaixasIds.size !== 1 ? "s" : ""} do apoio excluída${apoioBaixasIds.size !== 1 ? "s" : ""} — visão LCDPR`}
            </span>
          </div>
        )}

        <div id="fluxo-print-content" style={{ padding: "16px 22px", flex: 1, overflowY: "auto" }}>

          {carregando && (
            <div style={{ textAlign: "center", padding: 40, color: "#444" }}>Carregando dados financeiros…</div>
          )}

          {!carregando && (
            <>
              {/* ═══════ ABA: FLUXO DE CAIXA ═══════ */}
              {aba === "fluxo" && (() => {
                // Contas que entram no fluxo: corrente e investimento (excluir caixa e transitoria)
                const contasFluxo = contas.filter(c => c.ativa && (c.tipo_conta === "corrente" || c.tipo_conta === "investimento" || !c.tipo_conta));

                // Contas filtradas por produtor selecionado
                const contasFiltProd = filtro.produtoresSel.length > 0
                  ? contasFluxo.filter(c => c.produtor_id && filtro.produtoresSel.includes(c.produtor_id))
                  : contasFluxo;

                // Contas efetivamente selecionadas (produtores + contas checkbox)
                const contasEfetivas = filtro.contasSel.length > 0
                  ? contasFiltProd.filter(c => filtro.contasSel.includes(c.id))
                  : contasFiltProd;
                const contasEfetivasIds = new Set(contasEfetivas.map(c => c.id));
                const contasFluxoIds    = new Set(contasFluxo.map(c => c.id));

                // Saldo inicial: soma dos saldos das contas efetivas
                const saldoInicial = contasEfetivas.reduce((s, c) => s + (c.saldo_inicial ?? 0), 0);

                const lansFiltrados = lancamentos.filter(l => {
                  const dt = l.data_vencimento ?? l.data_lancamento ?? "";
                  if (filtro.inicio && dt < filtro.inicio) return false;
                  if (filtro.fim   && dt > filtro.fim)   return false;
                  // filtro de produtor: exclui somente se o lançamento tem produtor_id
                  // explicitamente diferente do selecionado (lançamentos sem produtor_id são overhead geral)
                  if (filtro.produtoresSel.length > 0 && l.produtor_id && !filtro.produtoresSel.includes(l.produtor_id)) return false;
                  // filtro de conta: só aplica quando contas são selecionadas explicitamente
                  if (filtro.contasSel.length > 0) {
                    if (l.conta_bancaria && !contasEfetivasIds.has(l.conta_bancaria)) return false;
                  }
                  // filtro Apoio Financeiro: exclui baixas do apoio quando desativado
                  if (temApoio && !incluirApoio && apoioBaixasIds.has(l.id)) return false;
                  return true;
                });

                // Aplica filtro de moeda antes de separar
                const lansFiltMoeda = filtro.moedasSel.length > 0
                  ? lansFiltrados.filter(l => {
                      const m = l.moeda === "barter" ? "barter" : (l.moeda ?? "BRL");
                      return filtro.moedasSel.includes(m);
                    })
                  : lansFiltrados.filter(l => l.moeda !== "barter"); // barter excluído por padrão

                // Contas não baixadas ANTES do período (compromissos pendentes)
                const cpAntPeriodo = lancamentos.filter(l =>
                  l.moeda !== "barter" && l.tipo === "pagar" &&
                  l.status !== "baixado" && l.natureza !== "previsao" &&
                  (l.data_vencimento ?? "") < (filtro.inicio || "")
                ).reduce((s, l) => s + paraBRLRel(l, cotacaoUSD), 0);
                const crAntPeriodo = lancamentos.filter(l =>
                  l.moeda !== "barter" && l.tipo === "receber" &&
                  l.status !== "baixado" && l.natureza !== "previsao" &&
                  (l.data_vencimento ?? "") < (filtro.inicio || "")
                ).reduce((s, l) => s + paraBRLRel(l, cotacaoUSD), 0);

                const mostrarAntPeriodo = filtro.tipoVis !== "realizado" && filtro.inicio && (cpAntPeriodo > 0 || crAntPeriodo > 0);

                // Separa realizados x pendentes x previsões
                // Lancamentos baixados via Apoio Financeiro → realizado (mesmo que status ainda seja "em_aberto" no lancamento principal)
                const isBaixadoViaApoio = (l: { id: string }) => temApoio && incluirApoio && apoioBaixasIds.has(l.id);
                const lanRealizados = lansFiltMoeda.filter(l => l.status === "baixado" || isBaixadoViaApoio(l));
                const lanPendentes  = lansFiltMoeda.filter(l =>
                  (l.status === "em_aberto" || l.status === "vencido" || l.status === "vencendo") &&
                  l.natureza !== "previsao" &&
                  !isBaixadoViaApoio(l)
                );
                const lanPrevisoes  = lansFiltMoeda.filter(l =>
                  (l.status === "em_aberto" || l.status === "vencido" || l.status === "vencendo") && l.natureza === "previsao"
                );

                const rows: FlowRow[] = [];
                // Realizados — sempre incluídos (exceto quando tipoVis = "previsto")
                if (filtro.tipoVis !== "previsto") {
                  for (const l of lanRealizados) {
                    const brl = paraBRLRel(l, cotacaoUSD);
                    rows.push({ data: l.data_vencimento ?? l.data_lancamento ?? "", fornecedor: l.descricao ?? "", descricao: l.categoria, tipo_row: "real", entrada: l.tipo === "receber" ? brl : 0, saida: l.tipo === "pagar" ? brl : 0, subMoeda: subMoedaRel(l, cotacaoUSD), origem_lancamento: l.origem_lancamento });
                  }
                }
                // Pendentes (lançamentos reais não baixados) — excluídos em modo "realizado"
                if (filtro.tipoVis !== "realizado") {
                  for (const l of lanPendentes) {
                    const brl = paraBRLRel(l, cotacaoUSD);
                    rows.push({ data: l.data_vencimento ?? l.data_lancamento ?? "", fornecedor: l.descricao ?? "", descricao: l.categoria, tipo_row: "pendente", entrada: l.tipo === "receber" ? brl : 0, saida: l.tipo === "pagar" ? brl : 0, subMoeda: subMoedaRel(l, cotacaoUSD), origem_lancamento: l.origem_lancamento });
                  }
                  // Lançamentos exclusivos do Apoio Financeiro em aberto → FC previsto
                  if (temApoio && incluirApoio) {
                    for (const a of apoioLancsAbertos) {
                      const dt = a.data_vencimento ?? "";
                      if (filtro.inicio && dt < filtro.inicio) continue;
                      if (filtro.fim   && dt > filtro.fim)   continue;
                      rows.push({ data: dt, fornecedor: a.descricao, descricao: a.categoria ?? "Apoio Financeiro", tipo_row: "pendente", entrada: a.tipo === "receber" ? a.valor : 0, saida: a.tipo === "pagar" ? a.valor : 0, origem_lancamento: "apoio_financeiro" });
                    }
                  }
                  // Previsões (natureza = previsao) — somente se toggle ativo
                  if (incluirPrevisoes) {
                    for (const l of lanPrevisoes) {
                      const brl = paraBRLRel(l, cotacaoUSD);
                      rows.push({ data: l.data_vencimento ?? l.data_lancamento ?? "", fornecedor: l.descricao ?? "", descricao: l.categoria, tipo_row: "previsao", entrada: l.tipo === "receber" ? brl : 0, saida: l.tipo === "pagar" ? brl : 0, subMoeda: subMoedaRel(l, cotacaoUSD), origem_lancamento: l.origem_lancamento });
                    }
                  }
                }
                const simsAtivas = (simulacoesAtivas && filtro.tipoVis !== "realizado") ? simEntries.filter(s => s.ativo) : [];
                for (const s of simsAtivas) {
                  rows.push({ data: s.data, fornecedor: s.fornecedor, descricao: s.descricao, tipo_row: "simulacao", entrada: 0, saida: 0 });
                }
                rows.sort((a, b) => a.data.localeCompare(b.data));

                let saldoAcc = saldoInicial;
                const rowsComSaldo = rows.map(r => {
                  const simEntry = r.tipo_row === "simulacao" ? simEntries.find(s => s.fornecedor === r.fornecedor && s.descricao === r.descricao && s.data === r.data) : null;
                  const simVal = simEntry ? (simEntry.tipo === "entrada" ? simEntry.valor : -simEntry.valor) : 0;
                  saldoAcc += (r.entrada - r.saida) + simVal;
                  return { ...r, saldo: saldoAcc, simEntrada: simEntry?.tipo === "entrada" ? simEntry.valor : 0, simSaida: simEntry?.tipo === "saida" ? simEntry.valor : 0 };
                });

                const diasMap: Record<string, typeof rowsComSaldo> = {};
                for (const r of rowsComSaldo) {
                  const dia = r.data.slice(0, 10);
                  if (!diasMap[dia]) diasMap[dia] = [];
                  diasMap[dia].push(r);
                }
                const dias = Object.keys(diasMap).sort();

                const totalEntradas = rowsComSaldo.reduce((s, r) => s + r.entrada, 0);
                const totalSaidas   = rowsComSaldo.reduce((s, r) => s + r.saida, 0);
                const totalSimLiq   = simsAtivas.reduce((s, e) => s + (e.tipo === "entrada" ? e.valor : -e.valor), 0);
                const saldoFinal    = saldoInicial + totalEntradas - totalSaidas + totalSimLiq;

                const fmtDia = (dt: string) => dt ? new Date(dt + "T12:00:00").toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "2-digit", year: "numeric" }) : "—";

                // Atualiza ref para impressão limpa
                printDiarioRef.current = { dias, diasMap, totalEntradas, totalSaidas, saldoFinal, saldoInicial, filtroInicio: filtro.inicio, filtroFim: filtro.fim, tipoVis: filtro.tipoVis };

                const salvarSim = () => {
                  if (!simForm.descricao || !simForm.valor || !simForm.data) return;
                  const val = desmascarar(simForm.valor);
                  if (val <= 0) return;
                  if (simEditId) {
                    setSimEntries(prev => prev.map(s => s.id === simEditId ? { ...s, descricao: simForm.descricao, fornecedor: simForm.fornecedor, valor: val, data: simForm.data, tipo: simForm.tipo } : s));
                    setSimEditId(null);
                  } else {
                    setSimEntries(prev => [...prev, { id: crypto.randomUUID(), descricao: simForm.descricao, fornecedor: simForm.fornecedor, valor: val, data: simForm.data, tipo: simForm.tipo, ativo: true }]);
                  }
                  setSimForm({ descricao: "", valor: "", data: "", tipo: "entrada", fornecedor: "" });
                };

                const imprimirSimsCenarios = () => {
                  const ativas = simEntries.filter(s => s.ativo).sort((a, b) => a.data.localeCompare(b.data));
                  const totalEnt = ativas.filter(s => s.tipo === "entrada").reduce((a, s) => a + s.valor, 0);
                  const totalSai = ativas.filter(s => s.tipo !== "entrada").reduce((a, s) => a + s.valor, 0);
                  const liquido  = totalEnt - totalSai;
                  const fazenda  = nomeFazendaSelecionada ?? "";
                  const fmtV = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
                  const fmtD = (d: string) => d ? new Date(d + "T12:00").toLocaleDateString("pt-BR") : "—";
                  const linhas = ativas.map(s => `
                    <tr>
                      <td>${fmtD(s.data)}</td>
                      <td>${s.fornecedor || "—"}</td>
                      <td>${s.descricao}</td>
                      <td style="text-align:center"><span class="${s.tipo === "entrada" ? "ent" : "sai"}">${s.tipo === "entrada" ? "Entrada" : "Saída"}</span></td>
                      <td style="text-align:right;font-weight:700;color:${s.tipo === "entrada" ? "#111111" : "#C026D3"}">${s.tipo === "entrada" ? "+" : "−"} ${fmtV(s.valor)}</td>
                    </tr>`).join("");
                  const html = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8">
                    <title>Simulador de Cenários — ${fazenda}</title>
                    <style>
                      body { font-family: system-ui, sans-serif; font-size: 12px; color: #111; margin: 0; padding: 24px; }
                      h1 { font-size: 18px; font-weight: 700; margin: 0 0 4px; color: #1A4870; }
                      .sub { font-size: 11px; color: #666; margin-bottom: 16px; }
                      table { width: 100%; border-collapse: collapse; }
                      th { background: #F5F3FF; color: #4C1D95; font-size: 11px; font-weight: 700; padding: 8px 12px; text-align: left; border-bottom: 1.5px solid #DDD6FE; }
                      td { padding: 8px 12px; border-bottom: 0.5px solid #EEE; }
                      tr:nth-child(even) td { background: #FAF5FF; }
                      .ent { background: #E8E8E8; color: #111111; padding: 2px 8px; border-radius: 8px; font-weight: 600; font-size: 10px; }
                      .sai { background: #FCE7F9; color: #C026D3; padding: 2px 8px; border-radius: 8px; font-weight: 600; font-size: 10px; }
                      .resumo { margin-top: 16px; display: flex; gap: 32px; padding: 12px 16px; background: #F5F3FF; border-radius: 8px; border: 0.5px solid #DDD6FE; }
                      .resumo .item { display: flex; flex-direction: column; gap: 2px; }
                      .resumo .lbl { font-size: 10px; color: #7C3AED; font-weight: 600; }
                      .resumo .val { font-size: 15px; font-weight: 700; }
                      .footer { margin-top: 24px; font-size: 10px; color: #aaa; border-top: 0.5px solid #eee; padding-top: 8px; }
                      @media print { @page { size: A4 landscape; margin: 16mm; } }
                    </style></head><body>
                    <h1>Simulador de Cenários</h1>
                    <div class="sub">${fazenda} &nbsp;·&nbsp; Emitido em ${hoje} &nbsp;·&nbsp; ${ativas.length} simulação(ões) ativa(s)</div>
                    <table>
                      <thead><tr><th>Data</th><th>Fornecedor / Pagador</th><th>Descrição</th><th style="text-align:center">Tipo</th><th style="text-align:right">Valor</th></tr></thead>
                      <tbody>${linhas || '<tr><td colspan="5" style="text-align:center;padding:20px;color:#999">Nenhuma simulação ativa</td></tr>'}</tbody>
                    </table>
                    <div class="resumo">
                      <div class="item"><span class="lbl">Total Entradas</span><span class="val" style="color:#111111">+ ${fmtV(totalEnt)}</span></div>
                      <div class="item"><span class="lbl">Total Saídas</span><span class="val" style="color:#C026D3">− ${fmtV(totalSai)}</span></div>
                      <div class="item"><span class="lbl">Líquido</span><span class="val" style="color:${liquido >= 0 ? "#0B2D50" : "#C026D3"}">${fmtV(liquido)}</span></div>
                    </div>
                    <div class="footer">Arato · Simulações hipotéticas — não representam lançamentos financeiros reais</div>
                    <script>window.onload = () => window.print();</script>
                    </body></html>`;
                  const w = window.open("", "_blank", "width=1100,height=720");
                  if (w) { w.document.write(html); w.document.close(); }
                };

                return (
                  <>
                    {/* Popup Simulador */}
                    {simPopupAberto && (
                      <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex:2000, display: "flex", alignItems: "center", justifyContent: "center" }}
                       >
                        <div style={{ background: "var(--bg-card)", borderRadius: 12, width: 1080, maxWidth: "95vw", maxHeight: "90vh", display: "flex", flexDirection: "column", boxShadow: "0 8px 40px rgba(0,0,0,0.2)" }}>
                          <div style={{ padding: "18px 28px", borderBottom: "0.5px solid #DDD6FE", display: "flex", alignItems: "center", justifyContent: "space-between", background: "#F5F3FF", borderRadius: "12px 12px 0 0" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                              <div style={{ width: 12, height: 12, borderRadius: "50%", background: "#7C3AED" }} />
                              <span style={{ fontWeight: 700, fontSize: 16, color: "var(--text-1)" }}>Simulador de Cenários</span>
                              {simEntries.length > 0 && <span style={{ fontSize: 12, background: "#EDE9FE", color: "#7C3AED", padding: "2px 10px", borderRadius: 10, fontWeight: 600 }}>{simEntries.length}</span>}
                            </div>
                            <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                              {simEntries.some(s => s.ativo) && (
                                <button onClick={() => setSimEntries(prev => prev.map(s => ({ ...s, ativo: false })))}
                                  style={{ fontSize: 12, color: "#7C3AED", background: "#EDE9FE", border: "none", borderRadius: 7, padding: "6px 14px", cursor: "pointer", fontWeight: 600 }}>
                                  Desativar todas
                                </button>
                              )}
                              {simEntries.some(s => !s.ativo) && (
                                <button onClick={() => setSimEntries(prev => prev.map(s => ({ ...s, ativo: true })))}
                                  style={{ fontSize: 12, color: "#16A34A", background: "#DCFCE7", border: "none", borderRadius: 7, padding: "6px 14px", cursor: "pointer", fontWeight: 600 }}>
                                  Ativar todas
                                </button>
                              )}
                              {simEntries.length > 0 && (
                                <button onClick={() => { if (confirm("Excluir todas as simulações?")) setSimEntries([]); }}
                                  style={{ fontSize: 12, color: "#E24B4A", background: "none", border: "none", cursor: "pointer", fontWeight: 600 }}>
                                  Limpar tudo
                                </button>
                              )}
                              <button onClick={() => setSimPopupAberto(false)}
                                style={{ background: "none", border: "none", cursor: "pointer", fontSize: 22, color: "var(--text-2)", lineHeight: 1, marginLeft: 6 }}>✕</button>
                            </div>
                          </div>
                          <div style={{ padding: "18px 28px", borderBottom: "0.5px solid #EDE9FE" }}>
                            <div style={{ fontSize: 12, color: "#7C3AED", fontWeight: 700, marginBottom: 12 }}>{simEditId ? "✎ Editar simulação" : "+ Nova simulação"}</div>
                            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 150px 150px 110px auto", gap: 12, alignItems: "end" }}>
                              <div>
                                <label style={{ ...labelStyle, fontSize: 12 }}>Descrição</label>
                                <input value={simForm.descricao} onChange={e => setSimForm(f => ({ ...f, descricao: e.target.value }))}
                                  onKeyDown={e => e.key === "Enter" && salvarSim()}
                                  placeholder="Ex: Recebimento Bunge" style={{ ...inputStyle, fontSize: 13, padding: "9px 11px" }} />
                              </div>
                              <div>
                                <label style={{ ...labelStyle, fontSize: 12 }}>Fornecedor / Pagador</label>
                                <input value={simForm.fornecedor} onChange={e => setSimForm(f => ({ ...f, fornecedor: e.target.value }))}
                                  placeholder="Empresa ou pessoa" style={{ ...inputStyle, fontSize: 13, padding: "9px 11px" }} />
                              </div>
                              <div>
                                <label style={{ ...labelStyle, fontSize: 12 }}>Valor (R$)</label>
                                <input value={simForm.valor}
                                  onChange={e => setSimForm(f => ({ ...f, valor: aplicarMascara(e.target.value.replace(/\D/g, "")) }))}
                                  placeholder="0,00" style={{ ...inputStyle, fontSize: 13, padding: "9px 11px" }} />
                              </div>
                              <div>
                                <label style={{ ...labelStyle, fontSize: 12 }}>Data</label>
                                <input type="date" value={simForm.data} onChange={e => setSimForm(f => ({ ...f, data: e.target.value }))} style={{ ...inputStyle, fontSize: 13, padding: "9px 11px" }} />
                              </div>
                              <div>
                                <label style={{ ...labelStyle, fontSize: 12 }}>Tipo</label>
                                <select value={simForm.tipo} onChange={e => setSimForm(f => ({ ...f, tipo: e.target.value as "entrada"|"saida" }))} style={{ ...inputStyle, fontSize: 13, padding: "9px 11px" }}>
                                  <option value="entrada">Entrada</option>
                                  <option value="saida">Saída</option>
                                </select>
                              </div>
                              <div style={{ display: "flex", gap: 8, paddingBottom: 1 }}>
                                <button onClick={salvarSim}
                                  style={{ padding: "10px 18px", background: simEditId ? "#7C3AED" : "#111111", color: "#fff", border: "none", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap" }}>
                                  {simEditId ? "Salvar" : "+ Adicionar"}
                                </button>
                                {simEditId && (
                                  <button onClick={() => { setSimEditId(null); setSimForm({ descricao: "", valor: "", data: "", tipo: "entrada", fornecedor: "" }); }}
                                    style={{ padding: "10px 12px", background: "var(--bg-page)", color: "var(--text-2)", border: "0.5px solid var(--border-table)", borderRadius: 8, fontSize: 13, cursor: "pointer" }}>✕</button>
                                )}
                              </div>
                            </div>
                          </div>
                          <div style={{ overflowY: "auto", flex: 1 }}>
                            {simEntries.length === 0 ? (
                              <div style={{ padding: 48, textAlign: "center", color: "#999", fontSize: 14 }}>Nenhuma simulação cadastrada. Adicione acima.</div>
                            ) : (
                              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                                <thead style={{ position: "sticky", top: 0, background: "#FAF5FF" }}>
                                  <tr>
                                    {["", "Data", "Fornecedor", "Descrição", "Tipo", "Valor", ""].map(h => (
                                      <th key={h} style={{ padding: "10px 16px", textAlign: h === "Valor" ? "right" : "left", fontWeight: 600, fontSize: 12, color: "#7C3AED", borderBottom: "0.5px solid #DDD6FE" }}>{h}</th>
                                    ))}
                                  </tr>
                                </thead>
                                <tbody>
                                  {simEntries.map(s => (
                                    <tr key={s.id} style={{ borderBottom: "0.5px solid #EEE9FD", background: s.ativo ? "#FAF5FF" : "#FAFAFA", opacity: s.ativo ? 1 : 0.5 }}>
                                      <td style={{ padding: "11px 16px", width: 40 }}>
                                        <input type="checkbox" checked={s.ativo}
                                          onChange={() => setSimEntries(prev => prev.map(x => x.id === s.id ? { ...x, ativo: !x.ativo } : x))} />
                                      </td>
                                      <td style={{ padding: "11px 16px", whiteSpace: "nowrap", color: "#444" }}>
                                        {s.data ? new Date(s.data + "T12:00:00").toLocaleDateString("pt-BR") : "—"}
                                      </td>
                                      <td style={{ padding: "11px 16px", color: "#444" }}>{s.fornecedor || "—"}</td>
                                      <td style={{ padding: "11px 16px", color: "#222", fontWeight: 500 }}>{s.descricao}</td>
                                      <td style={{ padding: "11px 16px" }}>
                                        <span style={{ fontSize: 11, padding: "3px 10px", borderRadius: 10, fontWeight: 600, background: s.tipo === "entrada" ? "#E8E8E8" : "#FCE7F9", color: s.tipo === "entrada" ? "#111111" : "#C026D3" }}>
                                          {s.tipo === "entrada" ? "Entrada" : "Saída"}
                                        </span>
                                      </td>
                                      <td style={{ padding: "11px 16px", textAlign: "right", fontWeight: 700, fontSize: 14, color: s.tipo === "entrada" ? "#111111" : "#C026D3" }}>
                                        {s.tipo === "entrada" ? "+" : "−"} {fmtBRL(s.valor, 2)}
                                      </td>
                                      <td style={{ padding: "11px 16px", width: 64 }}>
                                        <div style={{ display: "flex", gap: 8 }}>
                                          <button onClick={() => { setSimEditId(s.id); setSimForm({ descricao: s.descricao, fornecedor: s.fornecedor, valor: aplicarMascara(String(Math.round(s.valor * 100))), data: s.data, tipo: s.tipo }); }}
                                            style={{ background: "none", border: "none", cursor: "pointer", color: "#7C3AED", fontSize: 15 }}>✎</button>
                                          <button onClick={() => setSimEntries(prev => prev.filter(x => x.id !== s.id))}
                                            style={{ background: "none", border: "none", cursor: "pointer", color: "#E24B4A", fontSize: 15 }}>✕</button>
                                        </div>
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            )}
                          </div>
                          {simsAtivas.length > 0 && (
                            <div style={{ padding: "14px 28px", borderTop: "0.5px solid #DDD6FE", background: "#F5F3FF", borderRadius: "0 0 12px 12px", display: "flex", gap: 20, alignItems: "center", flexWrap: "wrap", justifyContent: "space-between" }}>
                              <div style={{ display: "flex", gap: 20, alignItems: "center", flexWrap: "wrap" }}>
                                <span style={{ fontSize: 12, color: "#7C3AED", fontWeight: 700 }}>Impacto ({simsAtivas.length} ativas):</span>
                                <span style={{ fontSize: 14, color: "#111111", fontWeight: 700 }}>+ {fmtBRL(simsAtivas.filter(s => s.tipo === "entrada").reduce((a, s) => a + s.valor, 0), 2)}</span>
                                <span style={{ fontSize: 14, color: "#C026D3", fontWeight: 700 }}>− {fmtBRL(simsAtivas.filter(s => s.tipo === "saida").reduce((a, s) => a + s.valor, 0), 2)}</span>
                                <span style={{ fontSize: 14, fontWeight: 700, color: totalSimLiq >= 0 ? "#111111" : "#C026D3" }}>Líquido: {fmtBRL(totalSimLiq, 2)}</span>
                              </div>
                              <button onClick={imprimirSimsCenarios}
                                style={{ padding: "8px 18px", background: "#1A4870", color: "#fff", border: "none", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: 7, flexShrink: 0 }}>
                                🖨 Imprimir relatório
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Sub-abas Diário / Mensal */}
                    <div className="no-print" style={{ display: "flex", gap: 0, background: "var(--bg-card)", border: "0.5px solid var(--border-table)", borderRadius: 12, overflow: "hidden", marginBottom: 0 }}>
                      {(["diario", "mensal", "anual"] as const).map(t => (
                        <button key={t} onClick={() => setSubAbaFluxo(t)}
                          style={{ flex: 1, padding: "10px 0", fontSize: 13, fontWeight: 600, cursor: "pointer", border: "none", borderBottom: subAbaFluxo === t ? "2.5px solid #111111" : "2.5px solid transparent", background: subAbaFluxo === t ? "#F0F4FA" : "var(--bg-card)", color: subAbaFluxo === t ? "#111111" : "var(--text-3)", transition: "all 0.15s" }}>
                          {t === "diario" ? "Diário" : t === "mensal" ? "Mensal" : "Anual"}
                        </button>
                      ))}
                    </div>

                    {/* ── DIÁRIO ── */}
                    {subAbaFluxo === "diario" && (
                    <div style={{ background: "var(--bg-card)", border: "0.5px solid var(--border-table)", borderRadius: 12 }}>
                      {/* Filtros — linha 1: período + produtores */}
                      <div className="no-print" style={{ padding: "12px 20px 8px", borderBottom: "none", display: "flex", flexWrap: "wrap", gap: 10, alignItems: "flex-end" }}>
                        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                          <label style={labelStyle}>Início</label>
                          <input type="date" value={filtro.inicio} onChange={e => setFiltro(f => ({ ...f, inicio: e.target.value }))} style={{ ...inputStyle, width: 140 }} />
                        </div>
                        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                          <label style={labelStyle}>Fim</label>
                          <input type="date" value={filtro.fim} onChange={e => setFiltro(f => ({ ...f, fim: e.target.value }))} style={{ ...inputStyle, width: 140 }} />
                        </div>
                        <div style={{ display: "flex", flexDirection: "column", gap: 4, justifyContent: "flex-end" }}>
                          <label style={labelStyle}>&nbsp;</label>
                          <button onClick={() => setFiltroAberto(v => !v)} style={{ padding: "7px 14px", borderRadius: 8, border: `0.5px solid ${filtro.produtoresSel.length + filtro.contasSel.length > 0 ? "#111111" : "var(--border-table)"}`, background: filtro.produtoresSel.length + filtro.contasSel.length > 0 ? "#E8E8E8" : "var(--bg-card)", color: filtro.produtoresSel.length + filtro.contasSel.length > 0 ? "#0D0D0D" : "var(--text-2)", fontSize: 12, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap" }}>
                            ⊞ Produtores / Contas {filtro.produtoresSel.length + filtro.contasSel.length > 0 ? `(${filtro.produtoresSel.length + filtro.contasSel.length} selecionados)` : ""}
                          </button>
                        </div>
                        {saldoInicial !== 0 && (
                          <div style={{ display: "flex", flexDirection: "column", gap: 2, justifyContent: "flex-end" }}>
                            <label style={labelStyle}>Saldo Inicial</label>
                            <div style={{ padding: "7px 12px", background: saldoInicial >= 0 ? "#E8E8E8" : "#FCEBEB", borderRadius: 8, fontSize: 13, fontWeight: 700, color: saldoInicial >= 0 ? "#0D0D0D" : "#E24B4A", whiteSpace: "nowrap" }}>
                              {fmtBRL(saldoInicial, 2)}
                            </div>
                          </div>
                        )}
                      </div>
                      {/* Filtros — linha 2: tipo + moeda + toggles */}
                      <div className="no-print" style={{ padding: "8px 20px 10px", borderBottom: "0.5px solid var(--border-row)", display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
                        <span style={{ fontSize: 11, color: "var(--text-3)", marginRight: 2 }}>Tipo:</span>
                        {(["ambos", "previsto", "realizado"] as const).map(t => (
                          <button key={t} onClick={() => setFiltro(f => ({ ...f, tipoVis: t }))}
                            style={{ padding: "5px 12px", borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: "pointer", border: `0.5px solid ${filtro.tipoVis === t ? "#111111" : "var(--border-table)"}`, background: filtro.tipoVis === t ? "#111111" : "var(--bg-card)", color: filtro.tipoVis === t ? "#fff" : "var(--text-2)" }}>
                            {t === "ambos" ? "Ambos" : t === "previsto" ? "Previsto" : "Realizado"}
                          </button>
                        ))}
                        <div style={{ width: 1, height: 22, background: "var(--border-table)", margin: "0 4px" }} />
                        <span style={{ fontSize: 11, color: "var(--text-3)", marginRight: 2 }}>Moeda:</span>
                        {(["BRL", "USD"] as const).map(m => (
                          <button key={m} onClick={() => setFiltro(f => ({ ...f, moedasSel: f.moedasSel.includes(m) ? f.moedasSel.filter(x => x !== m) : [...f.moedasSel, m] }))}
                            style={{ padding: "5px 12px", borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: "pointer", border: `0.5px solid ${filtro.moedasSel.includes(m) ? "#C9921B" : "var(--border-table)"}`, background: filtro.moedasSel.includes(m) ? "#FBF3E0" : "var(--bg-card)", color: filtro.moedasSel.includes(m) ? "#7A4300" : "var(--text-2)" }}>
                            {m}
                          </button>
                        ))}
                        <div style={{ width: 1, height: 22, background: "var(--border-table)", margin: "0 4px" }} />
                        {filtro.tipoVis !== "realizado" && (
                          <button onClick={() => setIncluirPrevisoes(v => !v)}
                            style={{ padding: "5px 12px", borderRadius: 8, border: `0.5px solid ${incluirPrevisoes ? "#16A34A" : "var(--border-table)"}`, background: incluirPrevisoes ? "#F0FDF4" : "var(--bg-card)", color: incluirPrevisoes ? "#16A34A" : "var(--text-2)", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
                            {incluirPrevisoes ? "✓" : "○"} Previsões
                          </button>
                        )}
                        <button onClick={() => setSimulacoesAtivas(v => !v)}
                          style={{ padding: "5px 12px", borderRadius: 8, border: `0.5px solid ${simulacoesAtivas ? "#7C3AED" : "var(--border-table)"}`, background: simulacoesAtivas ? "#F5F3FF" : "var(--bg-card)", color: simulacoesAtivas ? "#7C3AED" : "var(--text-2)", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
                          {simulacoesAtivas ? "✓" : "○"} Simulações
                        </button>
                        <button onClick={() => setSimPopupAberto(true)}
                          style={{ padding: "5px 12px", borderRadius: 8, border: "0.5px solid #7C3AED", background: "#F5F3FF", color: "#7C3AED", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
                          ⟳ Gerenciar{simEntries.length > 0 ? ` (${simEntries.length})` : ""}
                        </button>
                      </div>

                      {/* Painel de checkboxes Produtores / Contas */}
                      {filtroAberto && (
                        <div className="no-print" style={{ padding: "14px 20px", borderBottom: "0.5px solid var(--border-row)", background: "var(--bg-card)", display: "flex", gap: 32, flexWrap: "wrap" }}>
                          {/* Produtores */}
                          {produtores.length > 0 && (
                            <div>
                              <div style={{ fontSize: 11, fontWeight: 600, color: "#111111", marginBottom: 8 }}>Produtores</div>
                              <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                                {produtores.map(p => (
                                  <label key={p.id} style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 12, cursor: "pointer" }}>
                                    <input type="checkbox" checked={filtro.produtoresSel.includes(p.id)}
                                      onChange={e => setFiltro(f => ({ ...f, produtoresSel: e.target.checked ? [...f.produtoresSel, p.id] : f.produtoresSel.filter(x => x !== p.id), contasSel: [] }))} />
                                    {p.nome} {p.cpf_cnpj && <span style={{ color: "var(--text-3)", fontSize: 10 }}>{p.cpf_cnpj}</span>}
                                  </label>
                                ))}
                              </div>
                            </div>
                          )}
                          {/* Contas */}
                          <div>
                            <div style={{ fontSize: 11, fontWeight: 600, color: "#111111", marginBottom: 8 }}>
                              Contas Bancárias
                              {filtro.produtoresSel.length > 0 && <span style={{ fontSize: 10, color: "var(--text-3)", fontWeight: 400, marginLeft: 6 }}>(filtradas pelo produtor)</span>}
                            </div>
                            <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                              {(filtro.produtoresSel.length > 0 ? contasFiltProd : contasFluxo).map(c => {
                                const tp = { corrente: "Corrente", investimento: "Invest.", caixa: "Caixa", transitoria: "Transit.", poupanca: "Poupança" }[c.tipo_conta ?? "corrente"] ?? "Corrente";
                                return (
                                  <label key={c.id} style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 12, cursor: "pointer" }}>
                                    <input type="checkbox" checked={filtro.contasSel.includes(c.id)}
                                      onChange={e => setFiltro(f => ({ ...f, contasSel: e.target.checked ? [...f.contasSel, c.id] : f.contasSel.filter(x => x !== c.id) }))} />
                                    {c.nome} <span style={{ fontSize: 10, color: "var(--text-3)" }}>{tp}{c.banco ? ` · ${c.banco}` : ""}</span>
                                  </label>
                                );
                              })}
                            </div>
                          </div>
                          <div style={{ marginLeft: "auto", display: "flex", alignItems: "flex-end" }}>
                            <button onClick={() => setFiltro(f => ({ ...f, produtoresSel: [], contasSel: [] }))}
                              style={{ fontSize: 11, color: "#E24B4A", background: "none", border: "none", cursor: "pointer", padding: "4px 0" }}>
                              Limpar seleção
                            </button>
                          </div>
                        </div>
                      )}

                      {/* Quadro de compromissos anteriores ao período */}
                      {mostrarAntPeriodo && (
                        <div style={{ margin: "12px 20px 0", padding: "12px 16px", background: "#FEF3E2", border: "0.5px solid #C9921B", borderRadius: 10, display: "flex", gap: 24, flexWrap: "wrap", alignItems: "center" }}>
                          <span style={{ fontSize: 12, fontWeight: 700, color: "#7A4300" }}>⚠ Compromissos não baixados antes de {new Date(filtro.inicio + "T12:00:00").toLocaleDateString("pt-BR")}</span>
                          {cpAntPeriodo > 0 && (
                            <span style={{ fontSize: 12, color: "#E24B4A", fontWeight: 600 }}>CP em aberto: <strong>{fmtBRL(cpAntPeriodo, 2)}</strong></span>
                          )}
                          {crAntPeriodo > 0 && (
                            <span style={{ fontSize: 12, color: "#16A34A", fontWeight: 600 }}>CR em aberto: <strong>{fmtBRL(crAntPeriodo, 2)}</strong></span>
                          )}
                          <span style={{ fontSize: 11, color: "var(--text-3)" }}>Esses valores afetarão o saldo quando forem baixados.</span>
                        </div>
                      )}

                      {/* KPIs */}
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 0, borderBottom: "0.5px solid var(--border-row)", marginTop: mostrarAntPeriodo ? 12 : 0 }}>
                        {[
                          ...(saldoInicial !== 0 ? [{ label: "Saldo Inicial", valor: fmtBRL(saldoInicial), cor: saldoInicial >= 0 ? "var(--text-2)" : "#E24B4A" }] : []),
                          { label: "Total Entradas",           valor: fmtBRL(totalEntradas), cor: "#16A34A" },
                          { label: "Total Saídas",             valor: fmtBRL(totalSaidas),   cor: "#E24B4A" },
                          { label: `Saldo Final${simsAtivas.length > 0 ? " (c/ sim)" : ""}`, valor: fmtBRL(saldoFinal), cor: saldoFinal >= 0 ? "#111111" : "#E24B4A" },
                        ].map((k, i) => (
                          <div key={i} style={{ padding: "12px 20px", borderRight: i < 2 ? "0.5px solid var(--border-row)" : "none" }}>
                            <div style={{ fontSize: 10, color: "var(--text-2)", marginBottom: 3 }}>{k.label}</div>
                            <div style={{ fontSize: 16, fontWeight: 700, color: k.cor }}>{k.valor}</div>
                          </div>
                        ))}
                      </div>

                      {/* Tabela agrupada por dia */}
                      {rows.length === 0 ? (
                        <div style={{ padding: 32, textAlign: "center", color: "var(--text-3)", fontSize: 13 }}>
                          Nenhum lançamento no período. Ajuste os filtros ou adicione simulações.
                        </div>
                      ) : (
                        <div style={{ overflowX: "auto" }}>
                          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                            <thead>
                              <tr style={{ background: "var(--bg-page)" }}>
                                <th style={{ padding: "7px 14px", width: 28 }} />
                                <th style={{ padding: "7px 14px", textAlign: "left", fontWeight: 600, fontSize: 11, color: "var(--text-2)", whiteSpace: "nowrap" }}>Data</th>
                                <th style={{ padding: "7px 14px", textAlign: "left", fontWeight: 600, fontSize: 11, color: "var(--text-2)" }}>Fornecedor / Pagador</th>
                                <th style={{ padding: "7px 14px", textAlign: "left", fontWeight: 600, fontSize: 11, color: "var(--text-2)" }}>Descrição</th>
                                <th style={{ padding: "7px 14px", textAlign: "left", fontWeight: 600, fontSize: 11, color: "var(--text-2)" }}>Origem</th>
                                <th style={{ padding: "7px 14px", textAlign: "right", fontWeight: 600, fontSize: 11, color: "#16A34A", whiteSpace: "nowrap" }}>Entrada</th>
                                <th style={{ padding: "7px 14px", textAlign: "right", fontWeight: 600, fontSize: 11, color: "#E24B4A", whiteSpace: "nowrap" }}>Saída</th>
                                <th style={{ padding: "7px 14px", textAlign: "right", fontWeight: 600, fontSize: 11, color: "#7C3AED", whiteSpace: "nowrap" }}>Simulação</th>
                                <th style={{ padding: "7px 14px", textAlign: "right", fontWeight: 600, fontSize: 11, color: "var(--text-2)", whiteSpace: "nowrap" }}>Saldo Acumulado</th>
                              </tr>
                            </thead>
                            <tbody>
                              {dias.map(dia => {
                                const diaRows   = diasMap[dia];
                                const diaEnt    = diaRows.reduce((s, r) => s + r.entrada, 0);
                                const diaSai    = diaRows.reduce((s, r) => s + r.saida, 0);
                                const diaSimLiq = diaRows.reduce((s, r) => s + r.simEntrada - r.simSaida, 0);
                                const diaUltSaldo = diaRows[diaRows.length - 1].saldo;
                                const expandido  = mesesExpandidos.has(dia);
                                const temSim     = diaRows.some(r => r.tipo_row === "simulacao");
                                const temPrev    = diaRows.some(r => r.tipo_row === "previsao" && !r.origem_lancamento);
                                return (
                                  <React.Fragment key={dia}>
                                    <tr
                                      onClick={() => toggleMes(dia)}
                                      style={{ background: expandido ? "#F0F4FA" : "var(--bg-card)", borderBottom: "0.5px solid var(--border-row)", cursor: "pointer", userSelect: "none" }}>
                                      <td style={{ padding: "8px 14px", textAlign: "center", color: "var(--text-3)", fontSize: 12 }}>{expandido ? "▼" : "+"}</td>
                                      <td style={{ padding: "8px 14px", fontWeight: 600, fontSize: 12, color: "var(--text-1)", whiteSpace: "nowrap" }}>{fmtDia(dia)}</td>
                                      <td style={{ padding: "8px 14px" }}>
                                        <span style={{ fontSize: 10, color: "var(--text-3)" }}>{diaRows.length} lançamento{diaRows.length !== 1 ? "s" : ""}</span>
                                        {temSim  && <span style={{ marginLeft: 6, fontSize: 10, background: "#EDE9FE", color: "#7C3AED", padding: "1px 5px", borderRadius: 8 }}>sim</span>}
                                        {temPrev && <span style={{ marginLeft: 4, fontSize: 10, background: "#DCFCE7", color: "#16A34A", padding: "1px 5px", borderRadius: 8 }}>prev</span>}
                                      </td>
                                      <td /><td />
                                      <td style={{ padding: "8px 14px", textAlign: "right", color: "#16A34A", fontWeight: 600, fontSize: 12, whiteSpace: "nowrap" }}>{diaEnt > 0 ? fmtBRL(diaEnt, 2) : ""}</td>
                                      <td style={{ padding: "8px 14px", textAlign: "right", color: "#E24B4A", fontWeight: 600, fontSize: 12, whiteSpace: "nowrap" }}>{diaSai > 0 ? fmtBRL(diaSai, 2) : ""}</td>
                                      <td style={{ padding: "8px 14px", textAlign: "right", color: "#7C3AED", fontWeight: 600, fontSize: 12, whiteSpace: "nowrap" }}>{diaSimLiq !== 0 ? (diaSimLiq > 0 ? "+" : "−") + fmtBRL(Math.abs(diaSimLiq), 2) : ""}</td>
                                      <td style={{ padding: "8px 14px", textAlign: "right", fontWeight: 700, fontSize: 12, color: diaUltSaldo >= 0 ? "#111111" : "#E24B4A", whiteSpace: "nowrap" }}>{fmtBRL(diaUltSaldo, 2)}</td>
                                    </tr>
                                    {expandido && diaRows.map((r, idx) => {
                                      const isSim  = r.tipo_row === "simulacao";
                                      const isPrev = r.tipo_row === "previsao";
                                      const isPend = r.tipo_row === "pendente";
                                      const isReal = r.tipo_row === "real";
                                      return (
                                        <tr key={`${dia}-${idx}`} style={{ background: isSim ? "#FAF5FF" : isPrev ? "#F0FDF4" : isPend ? "#FFFBF0" : "var(--bg-card)", borderBottom: "0.5px solid var(--bg-page)" }}>
                                          <td />
                                          <td style={{ padding: "6px 14px 6px 28px", color: "var(--text-3)", fontSize: 11, whiteSpace: "nowrap" }}>
                                            {new Date(r.data + "T12:00:00").toLocaleDateString("pt-BR")}
                                          </td>
                                          <td style={{ padding: "6px 14px", color: "#444", maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.fornecedor || "—"}</td>
                                          <td style={{ padding: "6px 14px", color: "#444", maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.descricao || "—"}</td>
                                          <td style={{ padding: "6px 14px" }}>
                                            {isSim  && <span style={{ fontSize: 10, background: "#EDE9FE", color: "#7C3AED", padding: "2px 7px", borderRadius: 10, fontWeight: 600 }}>Simulação</span>}
                                            {!isSim && (() => {
                                              const orig = r.origem_lancamento;
                                              const ORIG_MAP: Record<string, { label: string; bg: string; color: string }> = {
                                                pedido_compra:       { label: "Pedido de Compra",    bg: "#FBF3E0", color: "#7A5A12" },
                                                nf_entrada:          { label: "NF de Entrada",       bg: "#F2F2F2", color: "#1E40AF" },
                                                nf_saida:            { label: "NF de Saída",          bg: "#F2F2F2", color: "#1E40AF" },
                                                contrato:            { label: "Contrato de Venda",   bg: "#DCFCE7", color: "#166534" },
                                                arrendamento:        { label: "Arrendamento",         bg: "#FFF7ED", color: "#9A3412" },
                                                contrato_financeiro: { label: "Contrato Financeiro",  bg: "#F3E8FF", color: "#6B21A8" },
                                                manual:              { label: "Manual",               bg: "#F1F5F9", color: "#475569" },
                                                cron:                { label: "Automático",           bg: "#DCFCE7", color: "#166534" },
                                                transporte:          { label: "Transporte",           bg: "#F0F9FF", color: "#0369A1" },
                                                apoio_financeiro:    { label: "Apoio Financeiro",     bg: "#FEF3C7", color: "#92400E" },
                                              };
                                              if (orig && ORIG_MAP[orig]) {
                                                const o = ORIG_MAP[orig];
                                                return <span style={{ fontSize: 10, background: o.bg, color: o.color, padding: "2px 7px", borderRadius: 10, fontWeight: 600 }}>{o.label}</span>;
                                              }
                                              if (isPrev) return <span style={{ fontSize: 10, background: "#DCFCE7", color: "#16A34A", padding: "2px 7px", borderRadius: 10, fontWeight: 600 }}>Previsão</span>;
                                              if (isPend) return <span style={{ fontSize: 10, background: "#F1F5F9", color: "#475569", padding: "2px 7px", borderRadius: 10, fontWeight: 600 }}>Manual</span>;
                                              if (isReal) return <span style={{ fontSize: 10, background: "#F1F5F9", color: "#475569", padding: "2px 7px", borderRadius: 10, fontWeight: 600 }}>Manual</span>;
                                              return null;
                                            })()}
                                          </td>
                                          <td style={{ padding: "6px 14px", textAlign: "right" }}>
                                            {r.entrada > 0 && <div style={{ color: "#16A34A", fontWeight: 600 }}>{fmtBRL(r.entrada, 2)}</div>}
                                            {r.entrada > 0 && r.subMoeda && <div style={{ fontSize: 9, color: "var(--text-3)" }}>{r.subMoeda}</div>}
                                          </td>
                                          <td style={{ padding: "6px 14px", textAlign: "right" }}>
                                            {r.saida > 0 && <div style={{ color: "#E24B4A", fontWeight: 600 }}>{fmtBRL(r.saida, 2)}</div>}
                                            {r.saida > 0 && r.subMoeda && <div style={{ fontSize: 9, color: "var(--text-3)" }}>{r.subMoeda}</div>}
                                          </td>
                                          <td style={{ padding: "6px 14px", textAlign: "right", color: "#7C3AED", fontWeight: 700 }}>
                                            {isSim ? ((r.simEntrada > 0 ? "+" : "−") + " " + fmtBRL(Math.max(r.simEntrada, r.simSaida), 2)) : ""}
                                          </td>
                                          <td style={{ padding: "6px 14px", textAlign: "right", fontWeight: 700, color: r.saldo >= 0 ? "#111111" : "#E24B4A", whiteSpace: "nowrap" }}>{fmtBRL(r.saldo, 2)}</td>
                                        </tr>
                                      );
                                    })}
                                  </React.Fragment>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                    )} {/* fim subAbaFluxo === "diario" */}

                    {/* ── MENSAL ── */}
                    {subAbaFluxo === "mensal" && (() => {
                      const MESES = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];
                      // Reutiliza as mesmas contas efetivas calculadas no Diário
                      const contasFiltProdM = filtro.produtoresSel.length > 0
                        ? contasFluxo.filter(c => c.produtor_id && filtro.produtoresSel.includes(c.produtor_id))
                        : contasFluxo;
                      const contasEfetivasM = filtro.contasSel.length > 0
                        ? contasFiltProdM.filter(c => filtro.contasSel.includes(c.id))
                        : contasFiltProdM;
                      const contasEfetivasIdsM = new Set(contasEfetivasM.map(c => c.id));
                      // Filtro base — ano + todos os filtros do painel
                      const lanAno = lancamentos.filter(l => {
                        const dt = l.data_vencimento ?? l.data_lancamento ?? "";
                        if (!dt.startsWith(dfcAno)) return false;
                        if (filtro.produtoresSel.length > 0 && l.produtor_id && !filtro.produtoresSel.includes(l.produtor_id)) return false;
                        if (filtro.contasSel.length > 0 && l.conta_bancaria && !contasEfetivasIdsM.has(l.conta_bancaria)) return false;
                        return true;
                      });
                      // Filtro de moeda
                      const lanFiltMoedaM = filtro.moedasSel.length > 0
                        ? lanAno.filter(l => { const m = l.moeda ?? "BRL"; return filtro.moedasSel.includes(m); })
                        : lanAno.filter(l => l.moeda !== "barter");
                      // Filtro tipo (previsto/realizado/ambos) + toggle previsões
                      const lanVis = lanFiltMoedaM.filter(l => {
                        if (filtro.tipoVis === "realizado") return l.status === "baixado";
                        if (filtro.tipoVis === "previsto")  return l.status !== "baixado";
                        // ambos: baixados sempre; pendentes só se toggle ativo
                        return l.status === "baixado" || incluirPrevisoes;
                      });
                      type CellM = { real: number; prev: number; sim: number };
                      type CatRowM = { cat: string; tipo: "receber" | "pagar"; meses: CellM[] };
                      const catMapM = new Map<string, CatRowM>();
                      const newRow = (cat: string, tipo: "receber"|"pagar"): CatRowM =>
                        ({ cat, tipo, meses: Array.from({ length: 12 }, () => ({ real: 0, prev: 0, sim: 0 })) });
                      // Lançamentos reais e previsões
                      for (const l of lanVis) {
                        const cat = l.categoria || "Sem categoria";
                        const key = `${l.tipo}__${cat}`;
                        const mes = parseInt((l.data_vencimento ?? l.data_lancamento ?? "").slice(5, 7)) - 1;
                        if (mes < 0 || mes > 11) continue;
                        if (!catMapM.has(key)) catMapM.set(key, newRow(cat, l.tipo as "receber"|"pagar"));
                        const row = catMapM.get(key)!;
                        if (l.status === "baixado") row.meses[mes].real += paraBRLRel(l, cotacaoUSD);
                        else                        row.meses[mes].prev += paraBRLRel(l, cotacaoUSD);
                      }
                      // Simulações
                      if (simulacoesAtivas) {
                        for (const s of simEntries.filter(x => x.ativo)) {
                          if (!s.data.startsWith(dfcAno)) continue;
                          const mes = parseInt(s.data.slice(5, 7)) - 1;
                          if (mes < 0 || mes > 11) continue;
                          const tipo: "receber"|"pagar" = s.tipo === "entrada" ? "receber" : "pagar";
                          const cat = `◆ ${s.descricao || "Simulação"}`;
                          const key = `${tipo}__${cat}`;
                          if (!catMapM.has(key)) catMapM.set(key, newRow(cat, tipo));
                          catMapM.get(key)!.meses[mes].sim += s.valor;
                        }
                      }
                      const entradasM = Array.from(catMapM.values()).filter(r => r.tipo === "receber").sort((a, b) => a.cat.localeCompare(b.cat));
                      const saidasM   = Array.from(catMapM.values()).filter(r => r.tipo === "pagar").sort((a, b) => a.cat.localeCompare(b.cat));
                      const totEntM   = MESES.map((_, i) => entradasM.reduce((s, r) => s + r.meses[i].real + r.meses[i].prev + r.meses[i].sim, 0));
                      const totSaiM   = MESES.map((_, i) => saidasM.reduce(  (s, r) => s + r.meses[i].real + r.meses[i].prev + r.meses[i].sim, 0));
                      const saldoMesM = MESES.map((_, i) => totEntM[i] - totSaiM[i]);
                      let _accM = 0;
                      const saldoAcM  = saldoMesM.map(v => { _accM += v; return _accM; });
                      const totEntAnual = totEntM.reduce((s, v) => s + v, 0);
                      const totSaiAnual = totSaiM.reduce((s, v) => s + v, 0);
                      const totLiqAnual = totEntAnual - totSaiAnual;
                      const isSim = (cat: string) => cat.startsWith("◆ ");
                      const corM = (tipo: "receber"|"pagar", sim: boolean) =>
                        sim ? "#7C3AED" : tipo === "receber" ? "#111111" : "var(--text-1)";
                      const corSaldo = (v: number) => v < 0 ? "#B91C1C" : v === 0 ? "#bbb" : "#111111";
                      const CatRowMEl = ({ row }: { row: CatRowM }) => {
                        const totRow = row.meses.reduce((s, c) => s + c.real + c.prev + c.sim, 0);
                        if (totRow === 0) return null;
                        const sim = isSim(row.cat);
                        const cor = corM(row.tipo, sim);
                        return (
                          <tr style={{ borderBottom: "0.5px solid #F0F3FA", background: sim ? "#FAF5FF" : undefined }}>
                            <td style={{ padding: "6px 14px 6px 24px", fontSize: 12, color: cor, maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{row.cat}</td>
                            {row.meses.map((c, i) => {
                              const total = c.real + c.prev + c.sim;
                              return (
                                <td key={i} style={{ padding: "5px 6px", textAlign: "right", whiteSpace: "nowrap" }}>
                                  {total > 0 ? (
                                    <>
                                      <div style={{ fontSize: 11, fontWeight: 600, color: cor }}>{fmtBRL(total, 2)}</div>
                                      {c.prev > 0 && c.real === 0 && c.sim === 0 && <div style={{ fontSize: 9, color: "#C9921B" }}>prev</div>}
                                      {c.prev > 0 && (c.real > 0 || c.sim > 0) && <div style={{ fontSize: 9, color: "#C9921B" }}>+{fmtBRL(c.prev, 2)} prev</div>}
                                      {c.sim > 0 && c.real === 0 && c.prev === 0 && <div style={{ fontSize: 9, color: "#7C3AED" }}>sim</div>}
                                    </>
                                  ) : <span style={{ color: "var(--border)", fontSize: 10 }}>—</span>}
                                </td>
                              );
                            })}
                            <td style={{ padding: "6px 10px", textAlign: "right", fontWeight: 700, fontSize: 11, color: cor, whiteSpace: "nowrap" }}>{totRow === 0 ? "—" : fmtBRL(totRow, 2)}</td>
                          </tr>
                        );
                      };
                      return (
                        <div style={{ background: "var(--bg-card)", border: "0.5px solid var(--border-table)", borderRadius: 12, overflow: "hidden" }}>
                          {/* Cabeçalho */}
                          <div className="no-print" style={{ padding: "12px 20px", borderBottom: "0.5px solid var(--border-row)", background: "var(--bg-card)", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
                            <div style={{ fontSize: 11, color: "var(--text-2)" }}>
                              Entradas e saídas por categoria · {incluirPrevisoes ? "Baixados + pendentes" : "Apenas realizados"}
                            </div>
                            <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                              <button onClick={() => setIncluirPrevisoes(v => !v)}
                                style={{ fontSize: 11, padding: "5px 12px", borderRadius: 8, border: "0.5px solid", cursor: "pointer", background: incluirPrevisoes ? "#FBF3E0" : "var(--bg-page)", color: incluirPrevisoes ? "#7A4300" : "var(--text-2)", borderColor: incluirPrevisoes ? "#C9921B" : "var(--border-table)" }}>
                                {incluirPrevisoes ? "◉ Incluindo pendentes" : "○ Só realizados"}
                              </button>
                              <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                                <label style={{ fontSize: 12, color: "var(--text-2)" }}>Exercício:</label>
                                <select value={dfcAno} onChange={e => setDfcAno(e.target.value)}
                                  style={{ padding: "6px 10px", border: "0.5px solid var(--border-table)", borderRadius: 8, fontSize: 13, cursor: "pointer" }}>
                                  {anosDispo.map(a => <option key={a} value={a}>{a}</option>)}
                                </select>
                              </div>
                            </div>
                          </div>
                          {/* KPIs */}
                          <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", borderBottom: "0.5px solid var(--border-row)" }}>
                            {[
                              { label: "Total Entradas",    v: totEntAnual },
                              { label: "Total Saídas",      v: totSaiAnual },
                              { label: "Resultado Líquido", v: totLiqAnual },
                              { label: "Saldo Acumulado",   v: saldoAcM[11] ?? totLiqAnual },
                            ].map((k, i) => (
                              <div key={i} style={{ padding: "12px 18px", borderRight: i < 3 ? "0.5px solid var(--border-row)" : "none", background: "var(--bg-card)" }}>
                                <div style={{ fontSize: 10, color: "var(--text-3)", marginBottom: 3 }}>{k.label}</div>
                                <div style={{ fontSize: 16, fontWeight: 700, color: i === 0 ? "#111111" : i === 1 ? "var(--text-1)" : (k.v < 0 ? "#B91C1C" : "#111111") }}>{fmtBRL(k.v, 2)}</div>
                              </div>
                            ))}
                          </div>
                          {/* Tabela */}
                          <div style={{ overflowX: "auto" }}>
                            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, minWidth: 1100 }}>
                              <thead>
                                <tr style={{ background: "var(--bg-page)" }}>
                                  <th style={{ padding: "8px 14px", textAlign: "left", fontWeight: 600, fontSize: 11, color: "var(--text-2)", minWidth: 200, borderBottom: "0.5px solid var(--border)" }}>Categoria</th>
                                  {MESES.map(m => <th key={m} style={{ padding: "8px 6px", textAlign: "right", fontWeight: 600, fontSize: 11, color: "var(--text-2)", borderBottom: "0.5px solid var(--border)", whiteSpace: "nowrap", minWidth: 64 }}>{m}</th>)}
                                  <th style={{ padding: "8px 10px", textAlign: "right", fontWeight: 700, fontSize: 11, color: "#111111", borderBottom: "0.5px solid var(--border)", whiteSpace: "nowrap" }}>Total {dfcAno}</th>
                                </tr>
                              </thead>
                              <tbody>
                                <tr style={{ background: "var(--bg-page)" }}><td colSpan={14} style={{ padding: "7px 16px", fontWeight: 700, fontSize: 10, color: "#111111", letterSpacing: "0.06em", textTransform: "uppercase" }}>Entradas</td></tr>
                                {entradasM.length > 0 ? entradasM.map(r => <CatRowMEl key={r.cat} row={r} />) : <tr><td colSpan={14} style={{ padding: "10px 24px", color: "var(--text-3)", fontSize: 11 }}>Nenhuma entrada.</td></tr>}
                                <tr style={{ background: "var(--bg-page)", borderTop: "0.5px solid var(--border)" }}>
                                  <td style={{ padding: "8px 14px", fontWeight: 700, fontSize: 12, color: "#111111" }}>Total Entradas</td>
                                  {totEntM.map((v, i) => <td key={i} style={{ padding: "8px 6px", textAlign: "right", fontWeight: 700, fontSize: 11, color: v === 0 ? "#bbb" : "#111111", whiteSpace: "nowrap" }}>{v === 0 ? "—" : fmtBRL(v, 2)}</td>)}
                                  <td style={{ padding: "8px 10px", textAlign: "right", fontWeight: 700, fontSize: 12, color: "#111111", whiteSpace: "nowrap" }}>{totEntAnual === 0 ? "—" : fmtBRL(totEntAnual, 2)}</td>
                                </tr>
                                <tr style={{ background: "var(--bg-page)", borderTop: "1px solid var(--border)" }}><td colSpan={14} style={{ padding: "7px 16px", fontWeight: 700, fontSize: 10, color: "var(--text-2)", letterSpacing: "0.06em", textTransform: "uppercase" }}>Saídas</td></tr>
                                {saidasM.length > 0 ? saidasM.map(r => <CatRowMEl key={r.cat} row={r} />) : <tr><td colSpan={14} style={{ padding: "10px 24px", color: "var(--text-3)", fontSize: 11 }}>Nenhuma saída.</td></tr>}
                                <tr style={{ background: "var(--bg-page)", borderTop: "0.5px solid var(--border)" }}>
                                  <td style={{ padding: "8px 14px", fontWeight: 700, fontSize: 12, color: "var(--text-2)" }}>Total Saídas</td>
                                  {totSaiM.map((v, i) => <td key={i} style={{ padding: "8px 6px", textAlign: "right", fontWeight: 700, fontSize: 11, color: v === 0 ? "#bbb" : "var(--text-1)", whiteSpace: "nowrap" }}>{v === 0 ? "—" : fmtBRL(v, 2)}</td>)}
                                  <td style={{ padding: "8px 10px", textAlign: "right", fontWeight: 700, fontSize: 12, color: "var(--text-1)", whiteSpace: "nowrap" }}>{totSaiAnual === 0 ? "—" : fmtBRL(totSaiAnual, 2)}</td>
                                </tr>
                                <tr style={{ background: "var(--bg-tag)", borderTop: "1px solid #C7D7EC" }}>
                                  <td style={{ padding: "9px 14px", fontWeight: 700, fontSize: 12, color: "#111111" }}>Saldo do Mês</td>
                                  {saldoMesM.map((v, i) => <td key={i} style={{ padding: "9px 6px", textAlign: "right", fontWeight: 700, fontSize: 11, color: corSaldo(v), whiteSpace: "nowrap" }}>{v === 0 ? "—" : fmtBRL(v, 2)}</td>)}
                                  <td style={{ padding: "9px 10px", textAlign: "right", fontWeight: 700, fontSize: 12, color: corSaldo(totLiqAnual), whiteSpace: "nowrap" }}>{totLiqAnual === 0 ? "—" : fmtBRL(totLiqAnual, 2)}</td>
                                </tr>
                                <tr style={{ background: "var(--bg-tag)" }}>
                                  <td style={{ padding: "9px 14px", fontWeight: 700, fontSize: 12, color: "#111111" }}>Saldo Acumulado</td>
                                  {saldoAcM.map((v, i) => <td key={i} style={{ padding: "9px 6px", textAlign: "right", fontWeight: 700, fontSize: 11, color: corSaldo(v), whiteSpace: "nowrap" }}>{v === 0 ? "—" : fmtBRL(v, 2)}</td>)}
                                  <td style={{ padding: "9px 10px", textAlign: "right", fontWeight: 800, fontSize: 13, color: corSaldo(saldoAcM[11]??totLiqAnual), whiteSpace: "nowrap" }}>{fmtBRL(saldoAcM[11]??totLiqAnual, 2)}</td>
                                </tr>
                              </tbody>
                            </table>
                          </div>
                          <div style={{ padding: "8px 20px", fontSize: 10, color: "var(--text-3)", borderTop: "0.5px solid var(--border-row)" }}>
                            {incluirPrevisoes ? "Baixados + pendentes (em aberto/vencidos/previsões). Prev em mostarda." : "Apenas lançamentos com status Baixado."}
                          </div>
                        </div>
                      );
                    })()}

                    {/* ── ANUAL ── */}
                    {subAbaFluxo === "anual" && (() => {
                      const contasFiltProdA = filtro.produtoresSel.length > 0
                        ? contasFluxo.filter(c => c.produtor_id && filtro.produtoresSel.includes(c.produtor_id))
                        : contasFluxo;
                      const contasEfetivasA = filtro.contasSel.length > 0
                        ? contasFiltProdA.filter(c => filtro.contasSel.includes(c.id))
                        : contasFiltProdA;
                      const contasEfetivasIdsA = new Set(contasEfetivasA.map(c => c.id));

                      const lanBase = lancamentos.filter(l => {
                        if (filtro.produtoresSel.length > 0 && l.produtor_id && !filtro.produtoresSel.includes(l.produtor_id)) return false;
                        if (filtro.contasSel.length > 0 && l.conta_bancaria && !contasEfetivasIdsA.has(l.conta_bancaria)) return false;
                        return true;
                      });
                      const lanFiltMoedaA = filtro.moedasSel.length > 0
                        ? lanBase.filter(l => { const m = l.moeda ?? "BRL"; return filtro.moedasSel.includes(m); })
                        : lanBase.filter(l => l.moeda !== "barter");

                      // Filtros exclusivos do modo Anual: intervalo de vencimento + status da parcela
                      const lanVisA = lanFiltMoedaA.filter(l => {
                        const dt = l.data_vencimento ?? l.data_lancamento ?? "";
                        if (anualInicio && dt < anualInicio) return false;
                        if (anualFim    && dt > anualFim)   return false;
                        return anualStatus.has(l.status);
                      });

                      // ── Barra de filtros do modo Anual ──────────────────────
                      const STATUS_OPTS: { key: string; label: string; cor: string; bg: string; bgA: string; corA: string }[] = [
                        { key: "baixado",   label: "Baixados",  cor: "var(--text-2)",    bg: "var(--bg-page)", bgA: "#1A5C38", corA: "#fff" },
                        { key: "em_aberto", label: "Em Aberto", cor: "var(--text-2)",    bg: "var(--bg-page)", bgA: "#111111", corA: "#fff" },
                        { key: "vencido",   label: "Vencidos",  cor: "var(--text-2)",    bg: "var(--bg-page)", bgA: "#B91C1C", corA: "#fff" },
                        { key: "vencendo",  label: "A Vencer",  cor: "var(--text-2)",    bg: "var(--bg-page)", bgA: "#C9921B", corA: "#fff" },
                      ];
                      const inpA: React.CSSProperties = { padding: "5px 8px", border: "0.5px solid var(--border-table)", borderRadius: 7, fontSize: 12, color: "var(--text-1)", background: "var(--bg-card)", outline: "none" };
                      const barraFiltros = (
                        <div className="no-print" style={{ padding: "10px 16px", borderBottom: "0.5px solid var(--border-row)", background: "var(--bg-card)", display: "flex", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
                          {/* Intervalo de vencimento */}
                          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                            <span style={{ fontSize: 11, color: "var(--text-2)", whiteSpace: "nowrap" }}>Vencimento de</span>
                            <input type="date" value={anualInicio} onChange={e => setAnualInicio(e.target.value)} style={inpA} />
                            <span style={{ fontSize: 11, color: "var(--text-2)" }}>até</span>
                            <input type="date" value={anualFim} onChange={e => setAnualFim(e.target.value)} style={inpA} />
                            {(anualInicio || anualFim) && (
                              <button onClick={() => { setAnualInicio(""); setAnualFim(""); }}
                                style={{ fontSize: 11, padding: "4px 8px", border: "0.5px solid var(--border-table)", borderRadius: 6, background: "var(--bg-card)", color: "var(--text-3)", cursor: "pointer" }}>✕</button>
                            )}
                          </div>
                          {/* Separador */}
                          <div style={{ width: 1, height: 20, background: "var(--border-table)" }} />
                          {/* Status */}
                          <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                            <span style={{ fontSize: 11, color: "var(--text-2)", whiteSpace: "nowrap" }}>Status:</span>
                            {STATUS_OPTS.map(s => {
                              const ativo = anualStatus.has(s.key);
                              return (
                                <button key={s.key} onClick={() => setAnualStatus(prev => {
                                  const ns = new Set(prev);
                                  if (ns.has(s.key)) ns.delete(s.key); else ns.add(s.key);
                                  return ns;
                                })} style={{ fontSize: 11, padding: "4px 10px", borderRadius: 7, border: `0.5px solid ${ativo ? s.bgA : "var(--border-table)"}`, background: ativo ? s.bgA : s.bg, color: ativo ? s.corA : s.cor, cursor: "pointer", fontWeight: ativo ? 600 : 400 }}>
                                  {s.label}
                                </button>
                              );
                            })}
                            {anualStatus.size < ALL_STATUS_A.length && (
                              <button onClick={() => setAnualStatus(new Set(ALL_STATUS_A))}
                                style={{ fontSize: 10, padding: "3px 7px", border: "0.5px solid var(--border-table)", borderRadius: 6, background: "var(--bg-card)", color: "var(--text-3)", cursor: "pointer" }}>Todos</button>
                            )}
                          </div>
                        </div>
                      );

                      // Anos derivados dos lançamentos filtrados (respeita intervalo de datas e status)
                      const anosPresentes = [...new Set(
                        lanVisA
                          .map(l => (l.data_vencimento ?? l.data_lancamento ?? "").slice(0, 4))
                          .filter(a => /^\d{4}$/.test(a))
                      )].sort();

                      if (anosPresentes.length === 0) {
                        return (
                          <div style={{ background: "var(--bg-card)", border: "0.5px solid var(--border-table)", borderRadius: 12, overflow: "hidden" }}>
                            {barraFiltros}
                            <div style={{ padding: 40, textAlign: "center", color: "var(--text-3)" }}>Nenhum lançamento encontrado com os filtros aplicados.</div>
                          </div>
                        );
                      }

                      type CellA = { real: number; prev: number };
                      type CatRowA = { cat: string; tipo: "receber" | "pagar"; anos: CellA[] };
                      const catMapA = new Map<string, CatRowA>();
                      const newRowA = (cat: string, tipo: "receber"|"pagar"): CatRowA =>
                        ({ cat, tipo, anos: anosPresentes.map(() => ({ real: 0, prev: 0 })) });

                      for (const l of lanVisA) {
                        const cat = l.categoria || "Sem categoria";
                        const key = `${l.tipo}__${cat}`;
                        const ano = (l.data_vencimento ?? l.data_lancamento ?? "").slice(0, 4);
                        const idxAno = anosPresentes.indexOf(ano);
                        if (idxAno < 0) continue;
                        if (!catMapA.has(key)) catMapA.set(key, newRowA(cat, l.tipo as "receber"|"pagar"));
                        const row = catMapA.get(key)!;
                        if (l.status === "baixado") row.anos[idxAno].real += paraBRLRel(l, cotacaoUSD);
                        else                        row.anos[idxAno].prev += paraBRLRel(l, cotacaoUSD);
                      }

                      // Mapa de detalhe: tipo__cat → label → CellA por ano
                      type DetRowA = { label: string; tipo: "receber"|"pagar"; anos: CellA[] };
                      const detMapA = new Map<string, Map<string, DetRowA>>();
                      for (const l of lanVisA) {
                        const cat = l.categoria || "Sem categoria";
                        const catKey = `${l.tipo}__${cat}`;
                        const label = (l.numero_documento ? `${l.numero_documento} — ` : "") + (l.descricao || "Sem descrição");
                        const ano = (l.data_vencimento ?? l.data_lancamento ?? "").slice(0, 4);
                        const idxAno = anosPresentes.indexOf(ano);
                        if (idxAno < 0) continue;
                        if (!detMapA.has(catKey)) detMapA.set(catKey, new Map());
                        const inner = detMapA.get(catKey)!;
                        if (!inner.has(label)) inner.set(label, { label, tipo: l.tipo as "receber"|"pagar", anos: anosPresentes.map(() => ({ real: 0, prev: 0 })) });
                        const dr = inner.get(label)!;
                        if (l.status === "baixado") dr.anos[idxAno].real += paraBRLRel(l, cotacaoUSD);
                        else                        dr.anos[idxAno].prev += paraBRLRel(l, cotacaoUSD);
                      }

                      const entradasA = Array.from(catMapA.values()).filter(r => r.tipo === "receber").sort((a, b) => a.cat.localeCompare(b.cat));
                      const saidasA   = Array.from(catMapA.values()).filter(r => r.tipo === "pagar").sort((a, b) => a.cat.localeCompare(b.cat));
                      const totEntA   = anosPresentes.map((_, i) => entradasA.reduce((s, r) => s + r.anos[i].real + r.anos[i].prev, 0));
                      const totSaiA   = anosPresentes.map((_, i) => saidasA.reduce(  (s, r) => s + r.anos[i].real + r.anos[i].prev, 0));
                      const saldoAnoA = anosPresentes.map((_, i) => totEntA[i] - totSaiA[i]);
                      let _accA = 0;
                      const saldoAcA  = saldoAnoA.map(v => { _accA += v; return _accA; });
                      const corSaldoA = (v: number) => v < 0 ? "#B91C1C" : v === 0 ? "#bbb" : "#111111";

                      const CatRowAEl = ({ row }: { row: CatRowA }) => {
                        const totRow = row.anos.reduce((s, c) => s + c.real + c.prev, 0);
                        if (totRow === 0) return null;
                        const cor = row.tipo === "receber" ? "#111111" : "var(--text-1)";
                        const catKey = `${row.tipo}__${row.cat}`;
                        const expandido = expandidosA.has(catKey);
                        const detItems = Array.from(detMapA.get(catKey)?.values() ?? [])
                          .filter(d => d.anos.some(c => c.real + c.prev > 0))
                          .sort((a, b) => a.label.localeCompare(b.label));
                        const temDetalhe = detItems.length > 1 || (detItems.length === 1 && detItems[0].label !== row.cat);
                        const toggleExpand = () => setExpandidosA(prev => {
                          const s = new Set(prev);
                          if (s.has(catKey)) s.delete(catKey); else s.add(catKey);
                          return s;
                        });
                        return (
                          <>
                            <tr style={{ borderBottom: "0.5px solid #F0F3FA", cursor: temDetalhe ? "pointer" : "default" }}
                              onClick={temDetalhe ? toggleExpand : undefined}>
                              <td style={{ padding: "6px 14px 6px 10px", fontSize: 12, color: cor, maxWidth: 240 }}>
                                <div style={{ display: "flex", alignItems: "center", gap: 6, overflow: "hidden" }}>
                                  {temDetalhe ? (
                                    <span style={{ flexShrink: 0, width: 16, height: 16, borderRadius: 4, background: expandido ? "#E8E8E8" : "var(--bg-page)", border: "0.5px solid #C0CEDF", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, color: "#111111", lineHeight: 1 }}>
                                      {expandido ? "−" : "+"}
                                    </span>
                                  ) : (
                                    <span style={{ flexShrink: 0, width: 16 }} />
                                  )}
                                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{row.cat}</span>
                                </div>
                              </td>
                              {row.anos.map((c, i) => {
                                const total = c.real + c.prev;
                                return (
                                  <td key={i} style={{ padding: "5px 8px", textAlign: "right", whiteSpace: "nowrap" }}>
                                    {total > 0 ? (
                                      <>
                                        <div style={{ fontSize: 12, fontWeight: 600, color: cor }}>{fmtBRL(total, 2)}</div>
                                        {c.prev > 0 && c.real === 0 && <div style={{ fontSize: 9, color: "#C9921B" }}>prev</div>}
                                      </>
                                    ) : <span style={{ color: "var(--border)", fontSize: 10 }}>—</span>}
                                  </td>
                                );
                              })}
                              <td style={{ padding: "6px 10px", textAlign: "right", fontWeight: 700, fontSize: 12, color: cor, whiteSpace: "nowrap" }}>{fmtBRL(totRow, 2)}</td>
                            </tr>
                            {expandido && detItems.map(d => {
                              const totDet = d.anos.reduce((s, c) => s + c.real + c.prev, 0);
                              return (
                                <tr key={d.label} style={{ background: "var(--bg-card)", borderBottom: "0.5px solid #EEF1F8" }}>
                                  <td style={{ padding: "4px 14px 4px 34px", fontSize: 11, color: "var(--text-2)", maxWidth: 240, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                    {d.label}
                                  </td>
                                  {d.anos.map((c, i) => {
                                    const total = c.real + c.prev;
                                    return (
                                      <td key={i} style={{ padding: "4px 8px", textAlign: "right", whiteSpace: "nowrap" }}>
                                        {total > 0 ? (
                                          <>
                                            <div style={{ fontSize: 11, color: "var(--text-2)" }}>{fmtBRL(total, 2)}</div>
                                            {c.prev > 0 && c.real === 0 && <div style={{ fontSize: 8, color: "#C9921B" }}>prev</div>}
                                          </>
                                        ) : <span style={{ color: "#E5E8EE", fontSize: 10 }}>—</span>}
                                      </td>
                                    );
                                  })}
                                  <td style={{ padding: "4px 10px", textAlign: "right", fontSize: 11, color: "var(--text-2)", whiteSpace: "nowrap" }}>{fmtBRL(totDet, 2)}</td>
                                </tr>
                              );
                            })}
                          </>
                        );
                      };

                      // Atualiza dados para impressão PDF
                      printAnualRef.current = { anosPresentes, entradasA, saidasA, totEntA, totSaiA, saldoAnoA, saldoAcA, incluirPrevisoes: anualStatus.size === ALL_STATUS_A.length };

                      const descFiltroStatus = ALL_STATUS_A.filter(s => anualStatus.has(s))
                        .map(s => ({ baixado: "Baixados", em_aberto: "Em Aberto", vencido: "Vencidos", vencendo: "A Vencer" }[s]))
                        .join(", ");

                      return (
                        <div style={{ background: "var(--bg-card)", border: "0.5px solid var(--border-table)", borderRadius: 12, overflow: "hidden" }}>
                          {barraFiltros}
                          <div style={{ padding: "8px 16px", borderBottom: "0.5px solid var(--border-row)", background: "var(--bg-page)", fontSize: 11, color: "var(--text-2)" }}>
                            Visão plurianual · {anosPresentes.join(", ")}
                            {(anualInicio || anualFim) && <> · Vencimento: {anualInicio || "…"} → {anualFim || "…"}</>}
                            {" · "}{descFiltroStatus}
                          </div>
                          <div style={{ overflowX: "auto" }}>
                            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, minWidth: 600 }}>
                              <thead>
                                <tr style={{ background: "var(--bg-page)" }}>
                                  <th style={{ padding: "8px 14px", textAlign: "left", fontWeight: 600, fontSize: 11, color: "var(--text-2)", minWidth: 220, borderBottom: "0.5px solid var(--border)" }}>Categoria</th>
                                  {anosPresentes.map(a => (
                                    <th key={a} style={{ padding: "8px 8px", textAlign: "right", fontWeight: 700, fontSize: 12, color: "#111111", borderBottom: "0.5px solid var(--border)", whiteSpace: "nowrap", minWidth: 110 }}>{a}</th>
                                  ))}
                                  <th style={{ padding: "8px 10px", textAlign: "right", fontWeight: 700, fontSize: 11, color: "var(--text-2)", borderBottom: "0.5px solid var(--border)", whiteSpace: "nowrap" }}>Total Geral</th>
                                </tr>
                              </thead>
                              <tbody>
                                <tr style={{ background: "var(--bg-page)" }}><td colSpan={anosPresentes.length + 2} style={{ padding: "7px 16px", fontWeight: 700, fontSize: 10, color: "#111111", letterSpacing: "0.06em", textTransform: "uppercase" }}>Entradas</td></tr>
                                {entradasA.length > 0 ? entradasA.map(r => <CatRowAEl key={r.cat} row={r} />) : <tr><td colSpan={anosPresentes.length + 2} style={{ padding: "10px 24px", color: "var(--text-3)", fontSize: 11 }}>Nenhuma entrada.</td></tr>}
                                <tr style={{ background: "var(--bg-page)", borderTop: "0.5px solid var(--border)" }}>
                                  <td style={{ padding: "8px 14px", fontWeight: 700, fontSize: 12, color: "#111111" }}>Total Entradas</td>
                                  {totEntA.map((v, i) => <td key={i} style={{ padding: "8px 8px", textAlign: "right", fontWeight: 700, fontSize: 12, color: v === 0 ? "#bbb" : "#111111", whiteSpace: "nowrap" }}>{v === 0 ? "—" : fmtBRL(v, 2)}</td>)}
                                  <td style={{ padding: "8px 10px", textAlign: "right", fontWeight: 700, fontSize: 12, color: "#111111", whiteSpace: "nowrap" }}>{fmtBRL(totEntA.reduce((s, v) => s + v, 0), 2)}</td>
                                </tr>
                                <tr style={{ background: "var(--bg-page)", borderTop: "1px solid var(--border)" }}><td colSpan={anosPresentes.length + 2} style={{ padding: "7px 16px", fontWeight: 700, fontSize: 10, color: "var(--text-2)", letterSpacing: "0.06em", textTransform: "uppercase" }}>Saídas</td></tr>
                                {saidasA.length > 0 ? saidasA.map(r => <CatRowAEl key={r.cat} row={r} />) : <tr><td colSpan={anosPresentes.length + 2} style={{ padding: "10px 24px", color: "var(--text-3)", fontSize: 11 }}>Nenhuma saída.</td></tr>}
                                <tr style={{ background: "var(--bg-page)", borderTop: "0.5px solid var(--border)" }}>
                                  <td style={{ padding: "8px 14px", fontWeight: 700, fontSize: 12, color: "var(--text-2)" }}>Total Saídas</td>
                                  {totSaiA.map((v, i) => <td key={i} style={{ padding: "8px 8px", textAlign: "right", fontWeight: 700, fontSize: 12, color: v === 0 ? "#bbb" : "var(--text-1)", whiteSpace: "nowrap" }}>{v === 0 ? "—" : fmtBRL(v, 2)}</td>)}
                                  <td style={{ padding: "8px 10px", textAlign: "right", fontWeight: 700, fontSize: 12, color: "var(--text-1)", whiteSpace: "nowrap" }}>{fmtBRL(totSaiA.reduce((s, v) => s + v, 0), 2)}</td>
                                </tr>
                                <tr style={{ background: "var(--bg-tag)", borderTop: "1px solid #C7D7EC" }}>
                                  <td style={{ padding: "9px 14px", fontWeight: 700, fontSize: 12, color: "#111111" }}>Saldo do Ano</td>
                                  {saldoAnoA.map((v, i) => <td key={i} style={{ padding: "9px 8px", textAlign: "right", fontWeight: 700, fontSize: 12, color: corSaldoA(v), whiteSpace: "nowrap" }}>{v === 0 ? "—" : fmtBRL(v, 2)}</td>)}
                                  <td style={{ padding: "9px 10px", textAlign: "right", fontWeight: 700, fontSize: 12, color: corSaldoA(saldoAnoA.reduce((s, v) => s + v, 0)), whiteSpace: "nowrap" }}>{fmtBRL(saldoAnoA.reduce((s, v) => s + v, 0), 2)}</td>
                                </tr>
                                <tr style={{ background: "var(--bg-tag)" }}>
                                  <td style={{ padding: "9px 14px", fontWeight: 700, fontSize: 12, color: "#111111" }}>Saldo Acumulado</td>
                                  {saldoAcA.map((v, i) => <td key={i} style={{ padding: "9px 8px", textAlign: "right", fontWeight: 700, fontSize: 12, color: corSaldoA(v), whiteSpace: "nowrap" }}>{v === 0 ? "—" : fmtBRL(v, 2)}</td>)}
                                  <td style={{ padding: "9px 10px", textAlign: "right", fontWeight: 800, fontSize: 13, color: corSaldoA(saldoAcA[saldoAcA.length - 1] ?? 0), whiteSpace: "nowrap" }}>{fmtBRL(saldoAcA[saldoAcA.length - 1] ?? 0, 2)}</td>
                                </tr>
                              </tbody>
                            </table>
                          </div>
                          <div style={{ padding: "8px 20px", fontSize: 10, color: "var(--text-3)", borderTop: "0.5px solid var(--border-row)" }}>
                            {descFiltroStatus}
                            {(anualInicio || anualFim) ? ` · Vencimento: ${anualInicio || "início"} até ${anualFim || "hoje"}` : ""}
                            {(anualStatus.has("em_aberto") || anualStatus.has("vencido") || anualStatus.has("vencendo")) ? " · Pendentes em mostarda." : ""}
                          </div>
                        </div>
                      );
                    })()}

                  </>
                );
              })()}

              {/* ═══════ ABA: CP / CR ═══════ */}
              {aba === "cpcr" && (() => {
                // ── helpers locais ────────────────────────────────────
                const prodMap  = Object.fromEntries(produtores.map(p => [p.id, p.nome]));
                const pessoaMap = Object.fromEntries(pessoas.map(p => [p.id, p.nome]));
                const ogMap    = Object.fromEntries(operacoesGer.map(o => [o.id, o.descricao]));

                const corStatusCPCR: Record<string, { bg: string; color: string; label: string }> = {
                  em_aberto: { bg: "#E8E8E8", color: "#0D0D0D", label: "Em Aberto" },
                  vencido:   { bg: "#FCEBEB", color: "#791F1F", label: "Vencido" },
                  vencendo:  { bg: "#FBF3E0", color: "#7A5A12", label: "Vencendo" },
                  baixado:   { bg: "#DCF5E8", color: "#14532D", label: "Baixado" },
                  parcial:   { bg: "#FEF9C3", color: "#713F12", label: "Parcial" },
                };

                // ── filtrar ───────────────────────────────────────────
                const lancsCPCR = lancamentos.filter(l => {
                  if (l.moeda === "barter") return false;
                  const dt = l.data_vencimento ?? l.data_lancamento ?? "";
                  if (inicioCPCR && dt < inicioCPCR) return false;
                  if (fimCPCR   && dt > fimCPCR)   return false;
                  if (tipoCPCR !== "todos" && l.tipo !== tipoCPCR) return false;
                  if (statusCPCR.size > 0 && !statusCPCR.has(statusEfetivo(l))) return false;
                  if (catCPCR.size > 0 && !catCPCR.has(l.categoria ?? "")) return false;
                  if (prodCPCR.size > 0 && !prodCPCR.has(l.produtor_id ?? "")) return false;
                  return true;
                });

                const categorias = [...new Set(lancamentos.filter(l => l.moeda !== "barter").map(l => l.categoria).filter(Boolean))].sort() as string[];
                const produtoresPresentes = produtores.filter(p => lancamentos.some(l => l.produtor_id === p.id));

                const totalCR    = lancsCPCR.filter(l => l.tipo === "receber").reduce((s, l) => s + paraBRLRel(l, cotacaoUSD), 0);
                const totalCP    = lancsCPCR.filter(l => l.tipo === "pagar").reduce((s, l) => s + paraBRLRel(l, cotacaoUSD), 0);
                const totalVenc  = lancsCPCR.filter(l => statusEfetivo(l) === "vencido").reduce((s, l) => s + paraBRLRel(l, cotacaoUSD), 0);
                const totalBaixado = lancsCPCR.filter(l => l.status === "baixado").reduce((s, l) => s + paraBRLRel(l, cotacaoUSD), 0);

                // ── configuração de agrupamentos ──────────────────────
                type GrupoConf = { key: GrupoKey; label: string; getKey: (l: Lancamento) => string; getLabel: (k: string) => string };
                const GRUPOS_CONF: GrupoConf[] = [
                  { key: "produtor",  label: "Produtor",           getKey: l => l.produtor_id ?? "__",   getLabel: k => k === "__" ? "Sem Produtor" : (prodMap[k] ?? k)       },
                  { key: "og",        label: "Operação Gerencial",  getKey: l => l.operacao_gerencial_id ?? "__", getLabel: k => k === "__" ? "Sem OG" : (ogMap[k] ?? k)    },
                  { key: "data",      label: "Mês",                getKey: l => (l.data_vencimento ?? l.data_lancamento ?? "").slice(0,7), getLabel: k => k ? new Date(k+"-01T12:00").toLocaleDateString("pt-BR",{month:"long",year:"numeric"}) : "Sem data" },
                  { key: "categoria", label: "Categoria",           getKey: l => l.categoria ?? "Sem categoria", getLabel: k => k                                              },
                  { key: "tipo",      label: "Tipo (CP/CR)",        getKey: l => l.tipo,                  getLabel: k => k === "receber" ? "↓ CR — Contas a Receber" : "↑ CP — Contas a Pagar" },
                  { key: "status",    label: "Status",              getKey: l => statusEfetivo(l),        getLabel: k => corStatusCPCR[k]?.label ?? k                          },
                ];
                const confAtivos = agrupAtivos.map(k => GRUPOS_CONF.find(c => c.key === k)!).filter(Boolean);

                // ── árvore de grupos ──────────────────────────────────
                type TreeNode = { grpKey: string; label: string; items: Lancamento[]; children: TreeNode[]; cr: number; cp: number };
                function buildTree(items: Lancamento[], confs: GrupoConf[], path: string): TreeNode[] {
                  if (confs.length === 0) return [];
                  const conf = confs[0];
                  const rest = confs.slice(1);
                  const map = new Map<string, Lancamento[]>();
                  for (const l of items) {
                    const k = conf.getKey(l);
                    if (!map.has(k)) map.set(k, []);
                    map.get(k)!.push(l);
                  }
                  return [...map.entries()].sort((a,b) => a[0].localeCompare(b[0])).map(([k, ls]) => {
                    const nodePath = path + "||" + k;
                    const cr = ls.filter(l => l.tipo === "receber").reduce((s,l) => s + paraBRLRel(l, cotacaoUSD), 0);
                    const cp = ls.filter(l => l.tipo === "pagar").reduce((s,l) => s + paraBRLRel(l, cotacaoUSD), 0);
                    return { grpKey: k, label: conf.getLabel(k), items: rest.length === 0 ? ls : [], children: buildTree(ls, rest, nodePath), cr, cp };
                  });
                }
                const tree = confAtivos.length > 0 ? buildTree(lancsCPCR, confAtivos, "") : [];

                // ── renderizar linhas ─────────────────────────────────
                type RowItem = { type: "group"; depth: number; node: TreeNode; path: string } | { type: "lancamento"; l: Lancamento; depth: number };
                function flattenTree(nodes: TreeNode[], depth: number, parentPath: string): RowItem[] {
                  const rows: RowItem[] = [];
                  for (const node of nodes) {
                    const path = parentPath + "||" + node.grpKey;
                    rows.push({ type: "group", depth, node, path });
                    if (gruposExpand.has(path)) {
                      if (node.children.length > 0) rows.push(...flattenTree(node.children, depth + 1, path));
                      else for (const l of node.items) rows.push({ type: "lancamento", l, depth: depth + 1 });
                    }
                  }
                  return rows;
                }
                const flatRows = confAtivos.length > 0 ? flattenTree(tree, 0, "") : [];

                const toggleGrupo = (path: string) => setGruposExpand(prev => {
                  const n = new Set(prev); n.has(path) ? n.delete(path) : n.add(path); return n;
                });

                // ── funções de agrupamento ────────────────────────────
                const addAgrup = (k: GrupoKey) => {
                  if (!agrupAtivos.includes(k)) setAgrupAtivos(prev => [...prev, k]);
                };
                const remAgrup = (k: GrupoKey) => setAgrupAtivos(prev => prev.filter(x => x !== k));
                const moveAgrup = (k: GrupoKey, dir: -1 | 1) => setAgrupAtivos(prev => {
                  const arr = [...prev]; const i = arr.indexOf(k);
                  if (i < 0) return arr;
                  const j = i + dir;
                  if (j < 0 || j >= arr.length) return arr;
                  [arr[i], arr[j]] = [arr[j], arr[i]]; return arr;
                });

                // ── exportar XLSX ─────────────────────────────────────
                const exportarXLSX = async () => {
                  const XLSX = await import("xlsx");
                  const statusLabel: Record<string, string> = { em_aberto: "Em Aberto", vencido: "Vencido", vencendo: "Vencendo", baixado: "Baixado", parcial: "Parcial" };
                  const resumo = [
                    ["Relatório CP / CR Analítico"],
                    ["Período", `${inicioCPCR} a ${fimCPCR}`],
                    ["Tipo", tipoCPCR === "todos" ? "Todos (CR + CP)" : tipoCPCR === "receber" ? "Contas a Receber" : "Contas a Pagar"],
                    ["Status", statusCPCR.size === 0 ? "Todos" : [...statusCPCR].join(", ")],
                    ["Categoria", catCPCR.size === 0 ? "Todas" : [...catCPCR].join(", ")],
                    ["Produtor", prodCPCR.size === 0 ? "Todos" : [...prodCPCR].map(id => prodMap[id] ?? id).join(", ")],
                    ["Agrupamentos", agrupAtivos.map(k => GRUPOS_CONF.find(c => c.key === k)?.label ?? k).join(" › ")],
                    [],
                    ["Total a Receber (CR)", totalCR],
                    ["Total a Pagar (CP)", totalCP],
                    ["Saldo (CR − CP)", totalCR - totalCP],
                    ["Vencidos", totalVenc],
                    ["Baixados / Pagos", totalBaixado],
                    ["Total de lançamentos", lancsCPCR.length],
                  ];
                  // Colunas respeitam a ordem e visibilidade do grid
                  const colsVisiveis = cpcrColOrder
                    .filter(k => cpcrColVis[k] !== false)
                    .map(k => COLUNAS_CPCR_DEF.find(c => c.key === k)!).filter(Boolean);
                  const cab = colsVisiveis.map(c => c.label);
                  const getCellVal = (col: typeof COLUNAS_CPCR_DEF[0], l: Lancamento): string | number => {
                    const brl = paraBRLRel(l, cotacaoUSD);
                    const sinal = l.tipo === "pagar" ? -1 : 1;
                    switch (col.key) {
                      case "tipo":           return l.tipo === "receber" ? "CR" : "CP";
                      case "fornecedor":     return (l.pessoa_id ? pessoaMap[l.pessoa_id] : null) ?? "";
                      case "numero_nf":      return l.numero_documento ?? "";
                      case "vencimento":     return l.data_vencimento ? new Date(l.data_vencimento+"T12:00").toLocaleDateString("pt-BR") : "";
                      case "valor":          return sinal * brl;
                      case "status":         return statusLabel[statusEfetivo(l)] ?? l.status;
                      case "data_pagamento": return l.data_baixa ? new Date(l.data_baixa+"T12:00").toLocaleDateString("pt-BR") : "";
                      case "valor_pago":     return l.valor_pago != null ? (sinal * l.valor_pago) : "";
                      case "moeda":          return (l.moeda ?? "brl").toUpperCase();
                      case "produtor":       return (l.produtor_id ? prodMap[l.produtor_id] : null) ?? "";
                      case "observacao":     return l.observacao ?? "";
                      default:               return "";
                    }
                  };
                  const linhas = lancsCPCR.map(l => colsVisiveis.map(col => getCellVal(col, l)));
                  const wb = XLSX.utils.book_new();
                  const ws1 = XLSX.utils.aoa_to_sheet(resumo); ws1["!cols"] = [{wch:32},{wch:22}];
                  XLSX.utils.book_append_sheet(wb, ws1, "Resumo");
                  const ws2 = XLSX.utils.aoa_to_sheet([cab,...linhas]);
                  ws2["!cols"] = colsVisiveis.map(c => ({ wch: Math.round(cpcrW[c.key] / 7) }));
                  XLSX.utils.book_append_sheet(wb, ws2, "Lançamentos");
                  XLSX.writeFile(wb, `CP-CR_${inicioCPCR}_${fimCPCR}_${hoje}.xlsx`);
                };

                // ── dropdown helper ───────────────────────────────────
                const DD = ({ open, onToggle, label, children }: { open: boolean; onToggle: () => void; label: string; children: React.ReactNode }) => (
                  <div style={{ display: "flex", flexDirection: "column", gap: 4, position: "relative" }}>
                    <label style={labelStyle}>{label}</label>
                    <button onClick={onToggle} style={{ ...inputStyle, width: 170, display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer" }}>
                      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: 12 }}>{open ? "—" : "▼"}</span>
                    </button>
                    {open && <div style={{ position: "absolute", top: "100%", left: 0, zIndex: 300, background: "var(--bg-card)", border: "0.5px solid var(--border)", borderRadius: 8, padding: "6px 0", minWidth: 220, maxHeight: 280, overflowY: "auto", boxShadow: "0 4px 20px rgba(0,0,0,0.13)", marginTop: 2 }}>{children}</div>}
                  </div>
                );
                const DDItem = ({ checked, onToggle, label }: { checked: boolean; onToggle: () => void; label: string }) => (
                  <label style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 14px", cursor: "pointer", fontSize: 12, color: "var(--text-1)" }}
                    onMouseEnter={e=>(e.currentTarget.style.background="#F4F6FA")} onMouseLeave={e=>(e.currentTarget.style.background="transparent")}>
                    <input type="checkbox" checked={checked} onChange={onToggle} style={{ cursor: "pointer", accentColor: "#1A4870" }} />
                    {label}
                  </label>
                );

                return (
                  <div style={{ background: "var(--bg-card)", border: "0.5px solid var(--border-table)", borderRadius: 12 }}>

                    {/* ── Filtros ── */}
                    <div style={{ padding: "12px 20px", borderBottom: "0.5px solid var(--border-row)", display: "flex", flexWrap: "wrap", gap: 10, alignItems: "flex-end" }}
                      onClick={() => { setStatusDDOpen(false); setCatDDOpen(false); setProdDDOpen(false); setCpcrColDDOpen(false); }}>
                      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                        <label style={labelStyle}>Início</label>
                        <input type="date" value={inicioCPCR} onChange={e => setInicioCPCR(e.target.value)} style={{ ...inputStyle, width: 140 }} onClick={e=>e.stopPropagation()} />
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                        <label style={labelStyle}>Fim</label>
                        <input type="date" value={fimCPCR} onChange={e => setFimCPCR(e.target.value)} style={{ ...inputStyle, width: 140 }} onClick={e=>e.stopPropagation()} />
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                        <label style={labelStyle}>Tipo</label>
                        <select value={tipoCPCR} onChange={e => setTipoCPCR(e.target.value as typeof tipoCPCR)} style={{ ...inputStyle, width: 170 }} onClick={e=>e.stopPropagation()}>
                          <option value="todos">Todos (CR + CP)</option>
                          <option value="receber">Contas a Receber (CR)</option>
                          <option value="pagar">Contas a Pagar (CP)</option>
                        </select>
                      </div>

                      {/* Status */}
                      <div style={{ display: "flex", flexDirection: "column", gap: 4, position: "relative" }} onClick={e=>e.stopPropagation()}>
                        <label style={labelStyle}>Status {statusCPCR.size > 0 && <span style={{ color: "#1A4870", fontWeight: 700 }}>({statusCPCR.size})</span>}</label>
                        <button onClick={() => { setStatusDDOpen(p=>!p); setCatDDOpen(false); setProdDDOpen(false); }}
                          style={{ ...inputStyle, width: 160, display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer", background: statusCPCR.size > 0 ? "#EDF4FD" : "var(--bg-input)", borderColor: statusCPCR.size > 0 ? "#1A4870" : undefined }}>
                          <span style={{ fontSize: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{statusCPCR.size === 0 ? "Todos" : `${statusCPCR.size} selecionado(s)`}</span>
                          <span style={{ fontSize: 10, color: "var(--text-3)" }}>▼</span>
                        </button>
                        {statusDDOpen && <div style={{ position: "absolute", top: "100%", left: 0, zIndex: 300, background: "var(--bg-card)", border: "0.5px solid var(--border)", borderRadius: 8, padding: "6px 0", minWidth: 180, boxShadow: "0 4px 20px rgba(0,0,0,0.13)", marginTop: 2 }}>
                          {[{v:"em_aberto",l:"Em Aberto"},{v:"vencido",l:"Vencido"},{v:"vencendo",l:"Vencendo"},{v:"baixado",l:"Baixado / Pago"},{v:"parcial",l:"Parcial"}].map(opt =>
                            <DDItem key={opt.v} checked={statusCPCR.has(opt.v)} onToggle={() => setStatusCPCR(prev => { const n=new Set(prev); n.has(opt.v)?n.delete(opt.v):n.add(opt.v); return n; })} label={opt.l} />
                          )}
                          <div style={{ borderTop: "0.5px solid var(--border)", margin: "4px 0" }} />
                          <button onClick={() => { setStatusCPCR(new Set()); setStatusDDOpen(false); }} style={{ width: "100%", padding: "5px 14px", textAlign: "left", background: "none", border: "none", fontSize: 11, color: "var(--text-3)", cursor: "pointer" }}>Limpar</button>
                        </div>}
                      </div>

                      {/* Categoria */}
                      <div style={{ display: "flex", flexDirection: "column", gap: 4, position: "relative" }} onClick={e=>e.stopPropagation()}>
                        <label style={labelStyle}>Categoria {catCPCR.size > 0 && <span style={{ color: "#1A4870", fontWeight: 700 }}>({catCPCR.size})</span>}</label>
                        <button onClick={() => { setCatDDOpen(p=>!p); setStatusDDOpen(false); setProdDDOpen(false); }}
                          style={{ ...inputStyle, width: 190, display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer", background: catCPCR.size > 0 ? "#EDF4FD" : "var(--bg-input)", borderColor: catCPCR.size > 0 ? "#1A4870" : undefined }}>
                          <span style={{ fontSize: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{catCPCR.size === 0 ? "Todas" : `${catCPCR.size} selecionada(s)`}</span>
                          <span style={{ fontSize: 10, color: "var(--text-3)" }}>▼</span>
                        </button>
                        {catDDOpen && <div style={{ position: "absolute", top: "100%", left: 0, zIndex: 300, background: "var(--bg-card)", border: "0.5px solid var(--border)", borderRadius: 8, padding: "6px 0", minWidth: 230, maxHeight: 280, overflowY: "auto", boxShadow: "0 4px 20px rgba(0,0,0,0.13)", marginTop: 2 }}>
                          {categorias.map(c => <DDItem key={c} checked={catCPCR.has(c)} onToggle={() => setCatCPCR(prev => { const n=new Set(prev); n.has(c)?n.delete(c):n.add(c); return n; })} label={c} />)}
                          <div style={{ borderTop: "0.5px solid var(--border)", margin: "4px 0" }} />
                          <button onClick={() => { setCatCPCR(new Set()); setCatDDOpen(false); }} style={{ width: "100%", padding: "5px 14px", textAlign: "left", background: "none", border: "none", fontSize: 11, color: "var(--text-3)", cursor: "pointer" }}>Limpar</button>
                        </div>}
                      </div>

                      {/* Produtor */}
                      <div style={{ display: "flex", flexDirection: "column", gap: 4, position: "relative" }} onClick={e=>e.stopPropagation()}>
                        <label style={labelStyle}>Produtor {prodCPCR.size > 0 && <span style={{ color: "#1A4870", fontWeight: 700 }}>({prodCPCR.size})</span>}</label>
                        <button onClick={() => { setProdDDOpen(p=>!p); setStatusDDOpen(false); setCatDDOpen(false); }}
                          style={{ ...inputStyle, width: 190, display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer", background: prodCPCR.size > 0 ? "#EDF4FD" : "var(--bg-input)", borderColor: prodCPCR.size > 0 ? "#1A4870" : undefined }}>
                          <span style={{ fontSize: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{prodCPCR.size === 0 ? "Todos" : `${prodCPCR.size} selecionado(s)`}</span>
                          <span style={{ fontSize: 10, color: "var(--text-3)" }}>▼</span>
                        </button>
                        {prodDDOpen && <div style={{ position: "absolute", top: "100%", left: 0, zIndex: 300, background: "var(--bg-card)", border: "0.5px solid var(--border)", borderRadius: 8, padding: "6px 0", minWidth: 230, maxHeight: 280, overflowY: "auto", boxShadow: "0 4px 20px rgba(0,0,0,0.13)", marginTop: 2 }}>
                          {produtoresPresentes.map(p => <DDItem key={p.id} checked={prodCPCR.has(p.id)} onToggle={() => setProdCPCR(prev => { const n=new Set(prev); n.has(p.id)?n.delete(p.id):n.add(p.id); return n; })} label={p.nome} />)}
                          {produtoresPresentes.length === 0 && <div style={{ padding: "8px 14px", fontSize: 12, color: "var(--text-3)" }}>Nenhum produtor vinculado</div>}
                          <div style={{ borderTop: "0.5px solid var(--border)", margin: "4px 0" }} />
                          <button onClick={() => { setProdCPCR(new Set()); setProdDDOpen(false); }} style={{ width: "100%", padding: "5px 14px", textAlign: "left", background: "none", border: "none", fontSize: 11, color: "var(--text-3)", cursor: "pointer" }}>Limpar</button>
                        </div>}
                      </div>

                      <div style={{ marginLeft: "auto", display: "flex", alignItems: "flex-end", gap: 8, position: "relative" }}>
                        {/* Botão Colunas — só no modo plano */}
                        {agrupAtivos.length === 0 && (
                          <div style={{ position: "relative" }}>
                            <button onClick={e => { e.stopPropagation(); setCpcrColDDOpen(v => !v); }}
                              style={{ padding: "7px 12px", background: "var(--bg-card)", color: "var(--text-1)", border: "0.5px solid var(--border)", borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
                              ⚙ Colunas
                            </button>
                            {cpcrColDDOpen && (
                              <div style={{ position: "absolute", top: "calc(100% + 4px)", right: 0, zIndex: 400, background: "var(--bg-card)", border: "0.5px solid var(--border)", borderRadius: 8, padding: "8px 0", minWidth: 190, boxShadow: "0 4px 20px rgba(0,0,0,0.13)" }}>
                                <div style={{ padding: "4px 14px 6px", fontSize: 10, color: "var(--text-3)", fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5 }}>Mostrar / ocultar</div>
                                {COLUNAS_CPCR_DEF.map(col => (
                                  <label key={col.key} style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 14px", cursor: "pointer", fontSize: 12, color: "var(--text-1)" }}
                                    onMouseEnter={e=>(e.currentTarget.style.background="#F4F6FA")} onMouseLeave={e=>(e.currentTarget.style.background="transparent")}>
                                    <input type="checkbox" checked={cpcrColVis[col.key] !== false}
                                      onChange={() => saveCpcrColVis({ ...cpcrColVis, [col.key]: !(cpcrColVis[col.key] !== false) })}
                                      style={{ cursor: "pointer", accentColor: "#1A4870" }} />
                                    {col.label}
                                  </label>
                                ))}
                                <div style={{ borderTop: "0.5px solid var(--border)", margin: "6px 0" }} />
                                <button onClick={() => { saveCpcrColOrder(_defCPCROrder); saveCpcrColVis(_defCPCRVis); setCpcrColDDOpen(false); }}
                                  style={{ width: "100%", padding: "5px 14px", textAlign: "left", background: "none", border: "none", fontSize: 11, color: "var(--text-3)", cursor: "pointer" }}>
                                  Restaurar padrão
                                </button>
                              </div>
                            )}
                          </div>
                        )}
                        <button onClick={exportarXLSX} disabled={lancsCPCR.length === 0}
                          style={{ padding: "7px 14px", background: lancsCPCR.length === 0 ? "#ccc" : "#16763A", color: "#fff", border: "none", borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: lancsCPCR.length === 0 ? "default" : "pointer" }}>
                          ⬇ Exportar XLSX
                        </button>
                      </div>
                    </div>

                    {/* ── Painel de Agrupamentos ── */}
                    <div style={{ padding: "10px 20px", borderBottom: "0.5px solid var(--border-row)", background: "var(--bg-page)" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                        <span style={{ fontSize: 11, color: "var(--text-3)", fontWeight: 600, whiteSpace: "nowrap" }}>Agrupar por:</span>

                        {/* Ativos — em ordem */}
                        {agrupAtivos.map((k, idx) => {
                          const conf = GRUPOS_CONF.find(c => c.key === k)!;
                          return (
                            <div key={k} style={{ display: "flex", alignItems: "center", gap: 2, background: "#1A4870", borderRadius: 20, padding: "3px 5px 3px 10px", color: "#fff", fontSize: 12, fontWeight: 600 }}>
                              <span style={{ fontSize: 10, background: "rgba(255,255,255,0.22)", borderRadius: 10, padding: "0 5px", marginRight: 4, minWidth: 16, textAlign: "center" }}>{idx + 1}</span>
                              {conf?.label}
                              <button onClick={() => moveAgrup(k, -1)} disabled={idx === 0}
                                style={{ background: "none", border: "none", color: idx === 0 ? "rgba(255,255,255,0.3)" : "#fff", cursor: idx === 0 ? "default" : "pointer", padding: "0 3px", fontSize: 13, lineHeight: 1 }}>↑</button>
                              <button onClick={() => moveAgrup(k, 1)} disabled={idx === agrupAtivos.length - 1}
                                style={{ background: "none", border: "none", color: idx === agrupAtivos.length-1 ? "rgba(255,255,255,0.3)" : "#fff", cursor: idx === agrupAtivos.length-1 ? "default" : "pointer", padding: "0 3px", fontSize: 13, lineHeight: 1 }}>↓</button>
                              <button onClick={() => remAgrup(k)}
                                style={{ background: "none", border: "none", color: "rgba(255,255,255,0.7)", cursor: "pointer", padding: "0 3px", fontSize: 15, lineHeight: 1, marginLeft: 2 }}>×</button>
                            </div>
                          );
                        })}

                        {/* Disponíveis (não ativos) */}
                        {GRUPOS_CONF.filter(c => !agrupAtivos.includes(c.key)).map(c => (
                          <button key={c.key} onClick={() => addAgrup(c.key)}
                            style={{ background: "var(--bg-input)", border: "0.5px dashed var(--border-table)", borderRadius: 20, padding: "3px 12px", fontSize: 12, color: "var(--text-3)", cursor: "pointer" }}>
                            + {c.label}
                          </button>
                        ))}

                        {agrupAtivos.length > 0 && (
                          <>
                            <span style={{ color: "var(--border-table)", margin: "0 4px" }}>|</span>
                            <button onClick={() => { setAgrupAtivos([]); setGruposExpand(new Set()); }}
                              style={{ background: "none", border: "none", fontSize: 11, color: "var(--text-3)", cursor: "pointer", textDecoration: "underline" }}>
                              Limpar agrupamentos
                            </button>
                          </>
                        )}
                      </div>
                    </div>

                    {/* ── KPIs ── */}
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", borderBottom: "0.5px solid var(--border-row)" }}>
                      {[
                        { label: "Total a Receber (CR)", valor: fmtBRL(totalCR), cor: "#16A34A" },
                        { label: "Total a Pagar (CP)",   valor: fmtBRL(totalCP), cor: "#E24B4A" },
                        { label: "Vencidos",             valor: fmtBRL(totalVenc), cor: "#E24B4A" },
                        { label: "Já Baixados / Pagos",  valor: fmtBRL(totalBaixado), cor: "var(--text-2)" },
                      ].map((k, i) => (
                        <div key={i} style={{ padding: "11px 20px", borderRight: i < 3 ? "0.5px solid var(--border-row)" : "none" }}>
                          <div style={{ fontSize: 10, color: "var(--text-2)", marginBottom: 2 }}>{k.label}</div>
                          <div style={{ fontSize: 15, fontWeight: 700, color: k.cor }}>{k.valor}</div>
                        </div>
                      ))}
                    </div>

                    {/* ── Tabela / Grupos ── */}
                    {lancsCPCR.length === 0 ? (
                      <div style={{ padding: 32, textAlign: "center", color: "var(--text-3)", fontSize: 13 }}>Nenhum lançamento no período com os filtros selecionados.</div>
                    ) : confAtivos.length > 0 ? (
                      /* Modo agrupado */
                      <div style={{ overflowX: "auto" }}>
                        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                          <thead>
                            <tr style={{ background: "var(--bg-page)" }}>
                              {["Agrupamento / Lançamento","Produtor","Vencimento","Categoria","Operação Gerencial","Status","CR","CP","Saldo"].map(h => (
                                <th key={h} style={{ padding: "8px 12px", textAlign: ["CR","CP","Saldo"].includes(h) ? "right" : "left", fontWeight: 600, fontSize: 11, color: "var(--text-2)", borderBottom: "0.5px solid var(--border-table)", whiteSpace: "nowrap" }}>{h}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {flatRows.map((row, ri) => {
                              if (row.type === "group") {
                                const { node, depth, path } = row;
                                const expanded = gruposExpand.has(path);
                                const indent = depth * 18;
                                const bgGrp = depth === 0 ? "#EEF3FA" : depth === 1 ? "#F4F7FC" : "#F9FAFB";
                                return (
                                  <tr key={path + ri} style={{ background: bgGrp, cursor: "pointer", borderBottom: "0.5px solid var(--border-table)" }} onClick={() => toggleGrupo(path)}>
                                    <td style={{ padding: "9px 12px", paddingLeft: 12 + indent, fontWeight: 700, fontSize: 12 + (2 - depth), color: "#0B2D50", whiteSpace: "nowrap" }}>
                                      <span style={{ marginRight: 8, fontSize: 11, opacity: 0.6 }}>{expanded ? "▾" : "▸"}</span>
                                      {node.label}
                                      <span style={{ marginLeft: 8, fontSize: 10, fontWeight: 400, color: "var(--text-3)", background: "rgba(0,0,0,0.06)", borderRadius: 10, padding: "1px 7px" }}>
                                        {confAtivos.length - depth === 1 ? `${node.items.length} lanç.` : `${node.children.length} subgrupo(s)`}
                                      </span>
                                    </td>
                                    <td colSpan={5} />
                                    <td style={{ padding: "9px 12px", textAlign: "right", color: "#16A34A", fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{node.cr > 0 ? fmtBRL(node.cr) : "—"}</td>
                                    <td style={{ padding: "9px 12px", textAlign: "right", color: "#E24B4A", fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{node.cp > 0 ? fmtBRL(node.cp) : "—"}</td>
                                    <td style={{ padding: "9px 12px", textAlign: "right", fontWeight: 700, color: node.cr - node.cp >= 0 ? "#0B2D50" : "#E24B4A", fontVariantNumeric: "tabular-nums" }}>{fmtBRL(node.cr - node.cp)}</td>
                                  </tr>
                                );
                              }
                              // lancamento leaf
                              const { l, depth } = row;
                              const st  = corStatusCPCR[statusEfetivo(l)] ?? corStatusCPCR.em_aberto;
                              const brl = paraBRLRel(l, cotacaoUSD);
                              const indent = depth * 18;
                              return (
                                <tr key={l.id + ri} style={{ borderBottom: "0.5px solid #EEF1F7", background: ri % 2 === 0 ? "#fff" : "#FAFBFD" }}>
                                  <td style={{ padding: "8px 12px", paddingLeft: 12 + indent }}>
                                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                      <span style={{ fontSize: 9, padding: "2px 6px", borderRadius: 4, background: l.tipo === "receber" ? "#E8E8E8" : "#FCEBEB", color: l.tipo === "receber" ? "#0D0D0D" : "#791F1F", fontWeight: 700, flexShrink: 0 }}>{l.tipo === "receber" ? "CR" : "CP"}</span>
                                      <span style={{ color: "var(--text-1)", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 280 }} title={l.descricao ?? ""}>{l.descricao || "—"}</span>
                                    </div>
                                  </td>
                                  <td style={{ padding: "8px 12px", color: "var(--text-2)", fontSize: 11, whiteSpace: "nowrap" }}>{l.produtor_id ? (prodMap[l.produtor_id] ?? "—") : "—"}</td>
                                  <td style={{ padding: "8px 12px", color: statusEfetivo(l)==="vencido" ? "#E24B4A" : "var(--text-2)", whiteSpace: "nowrap", fontSize: 11 }}>{l.data_vencimento ? new Date(l.data_vencimento+"T12:00").toLocaleDateString("pt-BR") : "—"}</td>
                                  <td style={{ padding: "8px 12px", color: "var(--text-2)", fontSize: 11, maxWidth: 140, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{l.categoria || "—"}</td>
                                  <td style={{ padding: "8px 12px", color: "var(--text-2)", fontSize: 11, maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{l.operacao_gerencial_id ? (ogMap[l.operacao_gerencial_id] ?? "—") : "—"}</td>
                                  <td style={{ padding: "8px 12px" }}><span style={{ fontSize: 9, padding: "2px 6px", borderRadius: 4, background: st.bg, color: st.color, fontWeight: 600 }}>{st.label}</span></td>
                                  <td style={{ padding: "8px 12px", textAlign: "right", color: "#16A34A", fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{l.tipo === "receber" ? fmtBRL(brl) : "—"}</td>
                                  <td style={{ padding: "8px 12px", textAlign: "right", color: "#E24B4A", fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{l.tipo === "pagar" ? fmtBRL(brl) : "—"}</td>
                                  <td />
                                </tr>
                              );
                            })}
                          </tbody>
                          <tfoot>
                            <tr style={{ background: "#EEF3FA", fontWeight: 700, borderTop: "1.5px solid var(--border-table)" }}>
                              <td colSpan={6} style={{ padding: "10px 12px", fontSize: 12 }}>{lancsCPCR.length} lançamentos</td>
                              <td style={{ padding: "10px 12px", textAlign: "right", color: "#16A34A", fontVariantNumeric: "tabular-nums" }}>{fmtBRL(totalCR)}</td>
                              <td style={{ padding: "10px 12px", textAlign: "right", color: "#E24B4A", fontVariantNumeric: "tabular-nums" }}>{fmtBRL(totalCP)}</td>
                              <td style={{ padding: "10px 12px", textAlign: "right", color: totalCR-totalCP >= 0 ? "#0B2D50" : "#E24B4A", fontVariantNumeric: "tabular-nums" }}>{fmtBRL(totalCR-totalCP)}</td>
                            </tr>
                          </tfoot>
                        </table>
                      </div>
                    ) : (() => {
                      /* Modo plano — grid configurável com drag-to-reorder e resize */
                      const colsVisiveis = cpcrColOrder
                        .filter(k => cpcrColVis[k] !== false)
                        .map(k => COLUNAS_CPCR_DEF.find(c => c.key === k)!).filter(Boolean);

                      const renderCell = (col: typeof COLUNAS_CPCR_DEF[0], l: Lancamento, i: number) => {
                        const brl = paraBRLRel(l, cotacaoUSD);
                        const st  = corStatusCPCR[statusEfetivo(l)] ?? corStatusCPCR.em_aberto;
                        const sinal = l.tipo === "pagar" ? -1 : 1;
                        const tdBase: React.CSSProperties = {
                          padding: "9px 10px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                          maxWidth: cpcrW[col.key], color: "var(--text-2)", fontSize: 12,
                        };
                        switch (col.key) {
                          case "tipo":
                            return <td key={col.key} style={{ ...tdBase, width: cpcrW[col.key] }}>
                              <span style={{ fontSize: 10, padding: "2px 7px", borderRadius: 5, background: l.tipo === "receber" ? "#E8E8E8" : "#FCEBEB", color: l.tipo === "receber" ? "#0D0D0D" : "#791F1F", fontWeight: 600 }}>{l.tipo === "receber" ? "CR" : "CP"}</span>
                            </td>;
                          case "fornecedor":
                            return <td key={col.key} style={{ ...tdBase, width: cpcrW[col.key] }} title={(l.pessoa_id ? pessoaMap[l.pessoa_id] : null) ?? ""}>{(l.pessoa_id ? pessoaMap[l.pessoa_id] : null) ?? "—"}</td>;
                          case "numero_nf":
                            return <td key={col.key} style={{ ...tdBase, width: cpcrW[col.key] }}>{l.numero_documento ?? "—"}</td>;
                          case "vencimento":
                            return <td key={col.key} style={{ ...tdBase, width: cpcrW[col.key], color: statusEfetivo(l)==="vencido" ? "#E24B4A" : "var(--text-2)" }}>{l.data_vencimento ? new Date(l.data_vencimento+"T12:00").toLocaleDateString("pt-BR") : "—"}</td>;
                          case "valor":
                            return <td key={col.key} style={{ ...tdBase, width: cpcrW[col.key], textAlign: "right", fontWeight: 700, color: l.tipo === "receber" ? "#16A34A" : "#E24B4A", fontVariantNumeric: "tabular-nums" }}>{fmtBRL(Math.abs(brl))}</td>;
                          case "status":
                            return <td key={col.key} style={{ ...tdBase, width: cpcrW[col.key] }}><span style={{ fontSize: 10, padding: "2px 7px", borderRadius: 5, background: st.bg, color: st.color, fontWeight: 600 }}>{st.label}</span></td>;
                          case "data_pagamento":
                            return <td key={col.key} style={{ ...tdBase, width: cpcrW[col.key] }}>{l.data_baixa ? new Date(l.data_baixa+"T12:00").toLocaleDateString("pt-BR") : "—"}</td>;
                          case "valor_pago":
                            return <td key={col.key} style={{ ...tdBase, width: cpcrW[col.key], textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{l.valor_pago != null ? fmtBRL(l.valor_pago) : "—"}</td>;
                          case "moeda":
                            return <td key={col.key} style={{ ...tdBase, width: cpcrW[col.key] }}>{(l.moeda ?? "BRL").toUpperCase()}</td>;
                          case "produtor":
                            return <td key={col.key} style={{ ...tdBase, width: cpcrW[col.key] }} title={(l.produtor_id ? prodMap[l.produtor_id] : null) ?? ""}>{(l.produtor_id ? prodMap[l.produtor_id] : null) ?? "—"}</td>;
                          case "observacao":
                            return <td key={col.key} style={{ ...tdBase, width: cpcrW[col.key] }} title={l.observacao ?? ""}>{l.observacao || "—"}</td>;
                          default: return <td key={col.key} style={{ ...tdBase, width: cpcrW[col.key] }}>—</td>;
                        }
                      };

                      // Totais de valor e valor_pago pelas colunas visíveis
                      const showValorCol    = colsVisiveis.some(c => c.key === "valor");
                      const showValorPagoCol = colsVisiveis.some(c => c.key === "valor_pago");
                      const totalValorPago  = lancsCPCR.reduce((s, l) => s + (l.valor_pago ?? 0), 0);

                      return (
                        <div style={{ overflowX: "auto" }}>
                          <style>{`
                            @media print {
                              .cpcr-grid-table thead th { white-space: nowrap; font-size: 10px !important; padding: 5px 7px !important; }
                              .cpcr-grid-table td { font-size: 10px !important; padding: 5px 7px !important; }
                              .cpcr-grid-table .resize-handle { display: none; }
                            }
                          `}</style>
                          <table className="cpcr-grid-table" style={{ borderCollapse: "collapse", fontSize: 12, tableLayout: "fixed" }}>
                            <thead>
                              <tr style={{ background: "var(--bg-page)" }}>
                                {colsVisiveis.map((col, ci) => (
                                  <th key={col.key}
                                    draggable
                                    onDragStart={() => { cpcrDragCol.current = col.key; }}
                                    onDragOver={e => e.preventDefault()}
                                    onDrop={() => {
                                      if (!cpcrDragCol.current || cpcrDragCol.current === col.key) return;
                                      const from = cpcrColOrder.indexOf(cpcrDragCol.current);
                                      const to   = cpcrColOrder.indexOf(col.key);
                                      if (from < 0 || to < 0) return;
                                      const next = [...cpcrColOrder];
                                      next.splice(from, 1);
                                      next.splice(to, 0, cpcrDragCol.current);
                                      saveCpcrColOrder(next);
                                      cpcrDragCol.current = null;
                                    }}
                                    style={{
                                      width: cpcrW[col.key], minWidth: cpcrW[col.key], maxWidth: cpcrW[col.key],
                                      padding: "8px 10px", textAlign: col.align === "right" ? "right" : "left",
                                      fontWeight: 600, fontSize: 11, color: "var(--text-2)",
                                      borderBottom: "0.5px solid var(--border-table)", whiteSpace: "nowrap",
                                      position: "relative", userSelect: "none", cursor: "grab",
                                    }}>
                                    {col.label}
                                    <ResizeHandle onMouseDown={cpcrResize(col.key)} />
                                  </th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {lancsCPCR.map((l, i) => (
                                <tr key={l.id} style={{ borderBottom: "0.5px solid #EEF1F7", background: i % 2 === 0 ? "#fff" : "#FAFBFD" }}>
                                  {colsVisiveis.map(col => renderCell(col, l, i))}
                                </tr>
                              ))}
                            </tbody>
                            <tfoot>
                              <tr style={{ background: "#EEF3FA", fontWeight: 700, borderTop: "1.5px solid var(--border-table)" }}>
                                {colsVisiveis.map((col, ci) => {
                                  if (col.key === "valor") return (
                                    <td key={col.key} colSpan={1} style={{ padding: "10px 10px", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                                      <div style={{ color: "#16A34A", fontSize: 11 }}>CR: {fmtBRL(totalCR)}</div>
                                      <div style={{ color: "#E24B4A", fontSize: 11 }}>CP: {fmtBRL(totalCP)}</div>
                                    </td>
                                  );
                                  if (col.key === "valor_pago") return (
                                    <td key={col.key} style={{ padding: "10px 10px", textAlign: "right", fontVariantNumeric: "tabular-nums", color: "var(--text-2)" }}>{fmtBRL(totalValorPago)}</td>
                                  );
                                  if (ci === 0) return (
                                    <td key={col.key} style={{ padding: "10px 10px" }}>{lancsCPCR.length} lançamentos</td>
                                  );
                                  return <td key={col.key} />;
                                })}
                              </tr>
                            </tfoot>
                          </table>
                        </div>
                      );
                    })()}
                  </div>
                );
              })()}

              {/* ABA DFC removida — conteúdo incorporado em Fluxo de Caixa > aba Mensal */}
              {aba === "dfc" && (() => {
                const MESES = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];

                // Lançamentos do exercício selecionado (excluir barter)
                const lanAno = lancamentos.filter(l => {
                  const dt = l.data_vencimento ?? l.data_lancamento ?? "";
                  return dt.startsWith(dfcAno) && l.moeda !== "barter";
                });

                // Visíveis: baixados sempre + pendentes/previsões conforme toggle
                const lanVisiveis = lanAno.filter(l =>
                  l.status === "baixado" || incluirPrevisoes
                );

                // Agrupar por categoria × mês × (real | prev)
                type CellData = { real: number; prev: number };
                type CatRow   = { cat: string; tipo: "receber" | "pagar"; meses: CellData[] };
                const catMap  = new Map<string, CatRow>();

                for (const l of lanVisiveis) {
                  const cat = l.categoria || "Sem categoria";
                  const key = `${l.tipo}__${cat}`;
                  const mes = parseInt((l.data_vencimento ?? l.data_lancamento ?? "").slice(5, 7)) - 1;
                  if (mes < 0 || mes > 11) continue;
                  if (!catMap.has(key)) {
                    catMap.set(key, { cat, tipo: l.tipo as "receber" | "pagar", meses: Array.from({ length: 12 }, () => ({ real: 0, prev: 0 })) });
                  }
                  const row = catMap.get(key)!;
                  if (l.status === "baixado") row.meses[mes].real += paraBRLRel(l, cotacaoUSD);
                  else                        row.meses[mes].prev += paraBRLRel(l, cotacaoUSD);
                }

                const entradas = Array.from(catMap.values()).filter(r => r.tipo === "receber").sort((a, b) => a.cat.localeCompare(b.cat));
                const saidas   = Array.from(catMap.values()).filter(r => r.tipo === "pagar").sort((a, b) => a.cat.localeCompare(b.cat));

                // Totais mensais
                const totEntMes  = MESES.map((_, i) => entradas.reduce((s, r) => s + r.meses[i].real + r.meses[i].prev, 0));
                const totSaiMes  = MESES.map((_, i) => saidas.reduce(  (s, r) => s + r.meses[i].real + r.meses[i].prev, 0));
                const saldoMes   = MESES.map((_, i) => totEntMes[i] - totSaiMes[i]);
                let _acc2 = 0;
                const saldoAcMensal = saldoMes.map(v => { _acc2 += v; return _acc2; });

                const totEnt = totEntMes.reduce((s, v) => s + v, 0);
                const totSai = totSaiMes.reduce((s, v) => s + v, 0);
                const totLiq = totEnt - totSai;

                const fmtC = (v: number) => v === 0 ? "—" : fmtBRL(v);
                const fmtK = (v: number): string => {
                  if (v === 0) return "—";
                  if (Math.abs(v) >= 1_000_000) return `${(v / 1_000_000).toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}M`;
                  if (Math.abs(v) >= 1_000)     return `${(v / 1_000).toFixed(0)}k`;
                  return fmtBRL(v);
                };

                // Linha de categoria
                const CatRowEl = ({ row }: { row: CatRow }) => {
                  const totRow = row.meses.reduce((s, c) => s + c.real + c.prev, 0);
                  if (totRow === 0) return null;
                  const cor = row.tipo === "receber" ? "#16A34A" : "#E24B4A";
                  return (
                    <tr style={{ borderBottom: "0.5px solid #F0F3FA" }}>
                      <td style={{ padding: "6px 14px 6px 24px", fontSize: 12, color: "var(--text-1)", maxWidth: 240, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {row.cat}
                      </td>
                      {row.meses.map((c, i) => {
                        const total = c.real + c.prev;
                        return (
                          <td key={i} style={{ padding: "5px 6px", textAlign: "right", whiteSpace: "nowrap" }}>
                            {total > 0 ? (
                              <>
                                <div style={{ fontSize: 11, fontWeight: 600, color: cor }}>{fmtK(total)}</div>
                                {c.prev > 0 && c.real === 0 && (
                                  <div style={{ fontSize: 9, color: "#C9921B" }}>prev</div>
                                )}
                                {c.prev > 0 && c.real > 0 && (
                                  <div style={{ fontSize: 9, color: "#C9921B" }}>+{fmtK(c.prev)} prev</div>
                                )}
                              </>
                            ) : (
                              <span style={{ color: "var(--border)", fontSize: 10 }}>—</span>
                            )}
                          </td>
                        );
                      })}
                      <td style={{ padding: "6px 10px", textAlign: "right", fontWeight: 700, fontSize: 11, color: cor, whiteSpace: "nowrap" }}>
                        {fmtC(totRow)}
                      </td>
                    </tr>
                  );
                };

                // Linha de seção (cabeçalho colorido)
                const SecRow = ({ label, bg, cor }: { label: string; bg: string; cor: string }) => (
                  <tr style={{ background: bg }}>
                    <td colSpan={14} style={{ padding: "7px 16px", fontWeight: 800, fontSize: 11, color: cor, letterSpacing: "0.04em" }}>
                      {label}
                    </td>
                  </tr>
                );

                // Linha de total de seção
                const TotRow = ({ label, vals, bg, cor, bold = false }: { label: string; vals: number[]; bg: string; cor: string; bold?: boolean }) => {
                  const totR = vals.reduce((s, v) => s + v, 0);
                  return (
                    <tr style={{ background: bg, borderTop: "0.5px solid var(--border)" }}>
                      <td style={{ padding: "8px 14px", fontWeight: bold ? 800 : 700, fontSize: bold ? 13 : 12, color: cor }}>{label}</td>
                      {vals.map((v, i) => (
                        <td key={i} style={{ padding: "8px 6px", textAlign: "right", fontWeight: bold ? 800 : 700, fontSize: 11, color: v === 0 ? "#bbb" : cor, whiteSpace: "nowrap" }}>
                          {fmtK(v)}
                        </td>
                      ))}
                      <td style={{ padding: "8px 10px", textAlign: "right", fontWeight: bold ? 800 : 700, fontSize: bold ? 13 : 12, color: totR === 0 ? "#bbb" : cor, whiteSpace: "nowrap" }}>
                        {fmtC(totR)}
                      </td>
                    </tr>
                  );
                };

                return (
                  <div style={{ background: "var(--bg-card)", border: "0.5px solid var(--border-table)", borderRadius: 12, overflow: "hidden" }}>

                    {/* Cabeçalho */}
                    <div style={{ padding: "14px 20px", borderBottom: "0.5px solid var(--border-row)", background: "var(--bg-card)", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: 14, color: "var(--text-1)" }}>Fluxo de Caixa Mensal</div>
                        <div style={{ fontSize: 11, color: "var(--text-2)", marginTop: 2 }}>
                          Estruturado por categoria · Entradas e saídas por mês
                        </div>
                      </div>
                      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                        <button
                          onClick={() => setIncluirPrevisoes(v => !v)}
                          style={{ fontSize: 11, padding: "5px 12px", borderRadius: 8, border: "0.5px solid", cursor: "pointer",
                            background: incluirPrevisoes ? "#FBF3E0" : "var(--bg-page)",
                            color:      incluirPrevisoes ? "#7A4300" : "var(--text-2)",
                            borderColor: incluirPrevisoes ? "#C9921B" : "var(--border-table)" }}>
                          {incluirPrevisoes ? "◉ Incluindo pendentes" : "○ Só realizados"}
                        </button>
                        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                          <label style={{ fontSize: 12, color: "var(--text-2)" }}>Exercício:</label>
                          <select value={dfcAno} onChange={e => setDfcAno(e.target.value)}
                            style={{ padding: "6px 10px", border: "0.5px solid var(--border-table)", borderRadius: 8, fontSize: 13, cursor: "pointer" }}>
                            {anosDispo.map(a => <option key={a} value={a}>{a}</option>)}
                          </select>
                        </div>
                      </div>
                    </div>

                    {/* KPI cards */}
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", borderBottom: "0.5px solid var(--border-row)" }}>
                      {[
                        { label: "Total Entradas",  v: totEnt, cor: "#0D0D0D", bg: "#E8E8E8" },
                        { label: "Total Saídas",    v: totSai, cor: "#791F1F", bg: "#FCEBEB" },
                        { label: "Resultado Líquido", v: totLiq, cor: totLiq >= 0 ? "#0D0D0D" : "#791F1F", bg: totLiq >= 0 ? "#E8E8E8" : "#FCEBEB" },
                        { label: "Saldo Acumulado", v: saldoAcMensal[11] ?? totLiq, cor: (saldoAcMensal[11] ?? totLiq) >= 0 ? "#0D0D0D" : "#791F1F", bg: (saldoAcMensal[11] ?? totLiq) >= 0 ? "#E8E8E8" : "#FCEBEB" },
                      ].map((k, i) => (
                        <div key={i} style={{ padding: "14px 18px", borderRight: i < 3 ? "0.5px solid var(--border-row)" : "none", background: k.bg }}>
                          <div style={{ fontSize: 10, color: "var(--text-2)", marginBottom: 4 }}>{k.label}</div>
                          <div style={{ fontSize: 17, fontWeight: 700, color: k.cor }}>{fmtBRL(k.v)}</div>
                        </div>
                      ))}
                    </div>

                    {/* Tabela horizontal */}
                    <div style={{ overflowX: "auto" }}>
                      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, minWidth: 1100 }}>
                        <thead>
                          <tr style={{ background: "var(--bg-page)" }}>
                            <th style={{ padding: "8px 14px", textAlign: "left", fontWeight: 600, fontSize: 11, color: "var(--text-2)", minWidth: 200, position: "sticky", left: 0, background: "var(--bg-page)", borderBottom: "0.5px solid var(--border)" }}>Categoria</th>
                            {MESES.map(m => (
                              <th key={m} style={{ padding: "8px 6px", textAlign: "right", fontWeight: 600, fontSize: 11, color: "var(--text-2)", borderBottom: "0.5px solid var(--border)", whiteSpace: "nowrap", minWidth: 64 }}>{m}</th>
                            ))}
                            <th style={{ padding: "8px 10px", textAlign: "right", fontWeight: 700, fontSize: 11, color: "#111111", borderBottom: "0.5px solid var(--border)", whiteSpace: "nowrap" }}>Total {dfcAno}</th>
                          </tr>
                        </thead>
                        <tbody>

                          {/* ── ENTRADAS ── */}
                          <SecRow label="ENTRADAS" bg="#DCFCE7" cor="#14532D" />
                          {entradas.length > 0
                            ? entradas.map(r => <CatRowEl key={r.cat} row={r} />)
                            : <tr><td colSpan={14} style={{ padding: "10px 24px", color: "var(--text-3)", fontSize: 11 }}>Nenhuma entrada no período.</td></tr>
                          }
                          <TotRow label="Total Entradas" vals={totEntMes} bg="#ECFDF5" cor="#16A34A" />

                          {/* ── SAÍDAS ── */}
                          <SecRow label="SAÍDAS" bg="#FCEBEB" cor="#791F1F" />
                          {saidas.length > 0
                            ? saidas.map(r => <CatRowEl key={r.cat} row={r} />)
                            : <tr><td colSpan={14} style={{ padding: "10px 24px", color: "var(--text-3)", fontSize: 11 }}>Nenhuma saída no período.</td></tr>
                          }
                          <TotRow label="Total Saídas" vals={totSaiMes} bg="#FEF3F2" cor="#E24B4A" />

                          {/* ── SALDO DO MÊS ── */}
                          <tr style={{ background: "var(--bg-page)", borderTop: "1px solid var(--border)" }}>
                            <td style={{ padding: "9px 14px", fontWeight: 700, fontSize: 12, color: "#111111", position: "sticky", left: 0, background: "var(--bg-page)" }}>Saldo do Mês</td>
                            {saldoMes.map((v, i) => (
                              <td key={i} style={{ padding: "9px 6px", textAlign: "right", fontWeight: 700, fontSize: 11, color: v >= 0 ? "#16A34A" : "#E24B4A", whiteSpace: "nowrap" }}>
                                {fmtK(v)}
                              </td>
                            ))}
                            <td style={{ padding: "9px 10px", textAlign: "right", fontWeight: 700, fontSize: 12, color: totLiq >= 0 ? "#16A34A" : "#E24B4A", whiteSpace: "nowrap" }}>
                              {fmtC(totLiq)}
                            </td>
                          </tr>

                          {/* ── SALDO ACUMULADO ── */}
                          <tr style={{ background: "var(--bg-tag)" }}>
                            <td style={{ padding: "9px 14px", fontWeight: 700, fontSize: 12, color: "#111111", position: "sticky", left: 0, background: "var(--bg-tag)" }}>Saldo Acumulado</td>
                            {saldoAcMensal.map((v, i) => (
                              <td key={i} style={{ padding: "9px 6px", textAlign: "right", fontWeight: 700, fontSize: 11, color: v >= 0 ? "#111111" : "#E24B4A", whiteSpace: "nowrap" }}>
                                {fmtK(v)}
                              </td>
                            ))}
                            <td style={{ padding: "9px 10px", textAlign: "right", fontWeight: 800, fontSize: 13, color: (saldoAcMensal[11] ?? totLiq) >= 0 ? "#111111" : "#E24B4A", whiteSpace: "nowrap" }}>
                              {fmtC(saldoAcMensal[11] ?? totLiq)}
                            </td>
                          </tr>

                        </tbody>
                      </table>
                    </div>

                    <div style={{ padding: "10px 20px", fontSize: 10, color: "var(--text-3)", borderTop: "0.5px solid var(--border-row)" }}>
                      {incluirPrevisoes
                        ? "Inclui lançamentos baixados + pendentes (em aberto, vencidos, previsões). Valores de previsão aparecem em mostarda."
                        : "Inclui apenas lançamentos com status Baixado (realizados). Ative 'Incluindo pendentes' para ver projetado."
                      }
                    </div>
                  </div>
                );
              })()}

              {/* ═══════ ABA: POSIÇÃO POR CONTA ═══════ */}
              {aba === "posicao" && (() => {
                const tipoCor: Record<string, { bg: string; color: string; label: string }> = {
                  corrente:    { bg: "#E8E8E8", color: "#0D0D0D", label: "Corrente" },
                  investimento:{ bg: "#DCF5E8", color: "#14532D", label: "Investimento" },
                  caixa:       { bg: "#FBF3E0", color: "#7A5A12", label: "Caixa" },
                  transitoria: { bg: "var(--bg-page)", color: "var(--text-2)",    label: "Transitória" },
                };
                const contasAtivas = contas.filter(c => c.ativa);

                const posicoes = contasAtivas.map(c => {
                  const lans = lancamentos.filter(l => l.conta_bancaria === c.id && l.moeda !== "barter");
                  const entradasReal = lans.filter(l => l.tipo === "receber" && l.status === "baixado").reduce((s, l) => s + paraBRLRel(l, cotacaoUSD), 0);
                  const saidasReal   = lans.filter(l => l.tipo === "pagar"   && l.status === "baixado").reduce((s, l) => s + paraBRLRel(l, cotacaoUSD), 0);
                  const entradasProj = lans.filter(l => l.tipo === "receber" && l.status !== "baixado").reduce((s, l) => s + paraBRLRel(l, cotacaoUSD), 0);
                  const saidasProj   = lans.filter(l => l.tipo === "pagar"   && l.status !== "baixado").reduce((s, l) => s + paraBRLRel(l, cotacaoUSD), 0);
                  const saldoAtual   = (c.saldo_inicial ?? 0) + entradasReal - saidasReal;
                  const saldoProj    = saldoAtual + entradasProj - saidasProj;
                  return { conta: c, entradasReal, saidasReal, entradasProj, saidasProj, saldoAtual, saldoProj };
                });

                const totalAtual = posicoes.reduce((s, p) => s + p.saldoAtual, 0);
                const totalProj  = posicoes.reduce((s, p) => s + p.saldoProj, 0);

                return (
                  <div style={{ background: "var(--bg-card)", border: "0.5px solid var(--border-table)", borderRadius: 12, padding: 20 }}>
                    {/* KPIs */}
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginBottom: 20 }}>
                      {[
                        { label: "Saldo Atual (realizados)", valor: fmtBRL(totalAtual), cor: totalAtual >= 0 ? "#111111" : "#E24B4A" },
                        { label: "Entradas Projetadas",      valor: fmtBRL(posicoes.reduce((s, p) => s + p.entradasProj, 0)), cor: "#16A34A" },
                        { label: "Saldo Projetado",          valor: fmtBRL(totalProj), cor: totalProj >= 0 ? "#111111" : "#E24B4A" },
                      ].map(k => (
                        <div key={k.label} style={{ background: "var(--bg-card)", borderRadius: 10, padding: "14px 18px", border: "0.5px solid var(--border-row)" }}>
                          <div style={{ fontSize: 10, color: "var(--text-2)", marginBottom: 4 }}>{k.label}</div>
                          <div style={{ fontSize: 18, fontWeight: 700, color: k.cor }}>{k.valor}</div>
                        </div>
                      ))}
                    </div>

                    {/* Tabela por conta */}
                    <div style={{ overflowX: "auto" }}>
                      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                        <thead>
                          <tr style={{ background: "var(--bg-page)" }}>
                            {["Conta", "Tipo", "Banco", "Saldo Inicial", "Entradas Realizadas", "Saídas Realizadas", "Saldo Atual", "Entradas Proj.", "Saídas Proj.", "Saldo Projetado"].map(h => (
                              <th key={h} style={{ padding: "8px 12px", textAlign: h === "Conta" || h === "Tipo" || h === "Banco" ? "left" : "right", fontWeight: 600, fontSize: 11, color: "var(--text-2)", borderBottom: "0.5px solid var(--border-table)", whiteSpace: "nowrap" }}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {posicoes.map((p, i) => {
                            const tp = tipoCor[p.conta.tipo_conta ?? "corrente"] ?? tipoCor.corrente;
                            return (
                              <tr key={p.conta.id} style={{ borderBottom: "0.5px solid #EEF1F7", background: i % 2 === 0 ? "#fff" : "#FAFBFD" }}>
                                <td style={{ padding: "10px 12px", fontWeight: 600, color: "var(--text-1)", whiteSpace: "nowrap" }}>{p.conta.nome}</td>
                                <td style={{ padding: "10px 12px" }}><span style={{ background: tp.bg, color: tp.color, borderRadius: 6, padding: "2px 7px", fontSize: 10, fontWeight: 600 }}>{tp.label}</span></td>
                                <td style={{ padding: "10px 12px", color: "var(--text-2)" }}>{p.conta.banco || "—"}</td>
                                <td style={{ padding: "10px 12px", textAlign: "right", color: "var(--text-2)" }}>{(p.conta.saldo_inicial ?? 0) !== 0 ? fmtBRL(p.conta.saldo_inicial!) : "—"}</td>
                                <td style={{ padding: "10px 12px", textAlign: "right", color: "#16A34A", fontWeight: 600 }}>{p.entradasReal > 0 ? fmtBRL(p.entradasReal) : "—"}</td>
                                <td style={{ padding: "10px 12px", textAlign: "right", color: "#E24B4A", fontWeight: 600 }}>{p.saidasReal > 0 ? fmtBRL(p.saidasReal) : "—"}</td>
                                <td style={{ padding: "10px 12px", textAlign: "right", fontWeight: 700, color: p.saldoAtual >= 0 ? "#111111" : "#E24B4A" }}>{fmtBRL(p.saldoAtual)}</td>
                                <td style={{ padding: "10px 12px", textAlign: "right", color: "#16A34A" }}>{p.entradasProj > 0 ? fmtBRL(p.entradasProj) : "—"}</td>
                                <td style={{ padding: "10px 12px", textAlign: "right", color: "#E24B4A" }}>{p.saidasProj > 0 ? fmtBRL(p.saidasProj) : "—"}</td>
                                <td style={{ padding: "10px 12px", textAlign: "right", fontWeight: 700, color: p.saldoProj >= 0 ? "#111111" : "#E24B4A" }}>{fmtBRL(p.saldoProj)}</td>
                              </tr>
                            );
                          })}
                          {/* Totalizador */}
                          <tr style={{ background: "#EEF3FA", fontWeight: 700, borderTop: "1.5px solid var(--border-table)" }}>
                            <td colSpan={3} style={{ padding: "10px 12px", fontWeight: 700, fontSize: 12 }}>TOTAL ({posicoes.length} contas)</td>
                            <td style={{ padding: "10px 12px", textAlign: "right" }}>{fmtBRL(posicoes.reduce((s, p) => s + (p.conta.saldo_inicial ?? 0), 0))}</td>
                            <td style={{ padding: "10px 12px", textAlign: "right", color: "#16A34A" }}>{fmtBRL(posicoes.reduce((s, p) => s + p.entradasReal, 0))}</td>
                            <td style={{ padding: "10px 12px", textAlign: "right", color: "#E24B4A" }}>{fmtBRL(posicoes.reduce((s, p) => s + p.saidasReal, 0))}</td>
                            <td style={{ padding: "10px 12px", textAlign: "right", color: totalAtual >= 0 ? "#111111" : "#E24B4A" }}>{fmtBRL(totalAtual)}</td>
                            <td style={{ padding: "10px 12px", textAlign: "right", color: "#16A34A" }}>{fmtBRL(posicoes.reduce((s, p) => s + p.entradasProj, 0))}</td>
                            <td style={{ padding: "10px 12px", textAlign: "right", color: "#E24B4A" }}>{fmtBRL(posicoes.reduce((s, p) => s + p.saidasProj, 0))}</td>
                            <td style={{ padding: "10px 12px", textAlign: "right", color: totalProj >= 0 ? "#111111" : "#E24B4A" }}>{fmtBRL(totalProj)}</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                    <div style={{ marginTop: 10, fontSize: 10, color: "var(--text-3)" }}>
                      Saldo Atual = Saldo Inicial + Entradas Realizadas − Saídas Realizadas (lançamentos baixados).
                      Saldo Projetado inclui também lançamentos em aberto/vencidos.
                    </div>
                  </div>
                );
              })()}

              <p style={{ textAlign: "center", fontSize: 11, color: "#666", marginTop: 24 }}>Arato · menos cliques, mais campo</p>
            </>
          )}
        </div>
      </main>
    </div>
  );
}

export default function FinanceiroRelatorios() {
  return (
    <PlanoGate modulo="fin_relatorios">
      <Suspense fallback={null}>
        <FinanceiroRelatoriosInner />
      </Suspense>
    </PlanoGate>
  );
}
