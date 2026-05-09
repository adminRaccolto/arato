"use client";
import React, { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import TopNav from "../../../components/TopNav";
import { listarLancamentos, listarEmpresas, listarContas, listarOperacoesGerenciais, listarProdutores } from "../../../lib/db";
import { useAuth } from "../../../components/AuthProvider";
import type { Lancamento, Empresa, ContaBancaria, OperacaoGerencial, Produtor } from "../../../lib/supabase";

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

const aplicarMascara = (raw: string): string => {
  const nums = raw.replace(/\D/g, "");
  if (!nums) return "";
  return (Number(nums) / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};
const desmascarar = (masked: string): number =>
  Number(masked.replace(/\./g, "").replace(",", ".")) || 0;

const inputStyle: React.CSSProperties = {
  width: "100%", padding: "8px 10px", border: "0.5px solid #D4DCE8",
  borderRadius: 8, fontSize: 13, color: "#1a1a1a", background: "#fff",
  boxSizing: "border-box", outline: "none",
};
const labelStyle: React.CSSProperties = { fontSize: 11, color: "#555", marginBottom: 4, display: "block" };


// ─── Componente principal ─────────────────────────────────────
function FinanceiroRelatoriosInner() {
  const { fazendaId } = useAuth();
  const searchParams = useSearchParams();
  const aba = (searchParams.get("aba") as AbaFin) || "fluxo";

  const [lancamentos,  setLancamentos]  = useState<Lancamento[]>([]);
  const [empresas,     setEmpresas]     = useState<Empresa[]>([]);
  const [contas,       setContas]       = useState<ContaBancaria[]>([]);
  const [produtores,   setProdutores]   = useState<Produtor[]>([]);
  const [operacoesGer, setOperacoesGer] = useState<OperacaoGerencial[]>([]);
  const [carregando,  setCarregando]  = useState(true);
  const [cotacaoUSD,  setCotacaoUSD]  = useState<number>(5.90);
  const [filtroAberto, setFiltroAberto] = useState(false);

  const anoAtual = new Date().getFullYear();
  const [filtro, setFiltro] = useState<FiltroFluxo>({
    empresasSel:   [],
    contasSel:     [],
    produtoresSel: [],
    inicio:        `${anoAtual}-01-01`,
    fim:           `${anoAtual}-12-31`,
    moedaExib:     "BRL",
    visao:         "ambos",
    tipoVis:       "ambos",
    moedasSel:     [],
  });
  const [mesesExpandidos,   setMesesExpandidos]   = useState<Set<string>>(new Set());
  const [simEntries,        setSimEntries]        = useState<SimEntry[]>([]);
  const [simulacoesAtivas,  setSimulacoesAtivas]  = useState(true);
  const [incluirPrevisoes,  setIncluirPrevisoes]  = useState(true);
  const [simForm,           setSimForm]           = useState({ descricao: "", valor: "", data: "", tipo: "entrada" as "entrada"|"saida", fornecedor: "" });
  const [simEditId,         setSimEditId]         = useState<string | null>(null);
  const [simPopupAberto,    setSimPopupAberto]    = useState(false);

  // Fluxo — sub-aba Diário / Mensal
  const [subAbaFluxo, setSubAbaFluxo] = useState<"diario" | "mensal">("diario");

  // DFC / Mensal — filtros
  const [dfcAno, setDfcAno] = useState(String(anoAtual));

  // CP/CR — filtros (devem ficar no topo — Rules of Hooks)
  const [tipoCPCR,    setTipoCPCR]    = useState<"todos"|"receber"|"pagar">("todos");
  const [statusCPCR,  setStatusCPCR]  = useState<"todos"|"em_aberto"|"vencido"|"baixado">("todos");
  const [catCPCR,     setCatCPCR]     = useState("");
  const [inicioCPCR,  setInicioCPCR]  = useState(`${anoAtual}-01-01`);
  const [fimCPCR,     setFimCPCR]     = useState(`${anoAtual}-12-31`);

  const toggleMes = (m: string) =>
    setMesesExpandidos(prev => { const s = new Set(prev); s.has(m) ? s.delete(m) : s.add(m); return s; });

  useEffect(() => {
    if (!fazendaId) return;
    Promise.all([
      listarLancamentos(fazendaId),
      listarOperacoesGerenciais(fazendaId),
    ]).then(([lans, ops]) => {
      setLancamentos(lans);
      setOperacoesGer(ops);
    }).catch(() => {})
      .finally(() => setCarregando(false));
    listarEmpresas(fazendaId).then(setEmpresas).catch(() => setEmpresas([]));
    listarContas(fazendaId).then(setContas).catch(() => setContas([]));
    listarProdutores(fazendaId).then(setProdutores).catch(() => setProdutores([]));
    fetch("/api/precos").then(r => r.json()).then(d => {
      const taxa = d?.usdPtax ?? d?.usdBrl;
      if (taxa && taxa > 0) setCotacaoUSD(taxa);
    }).catch(() => {});
  }, [fazendaId]);

  // localStorage simulações
  useEffect(() => {
    try {
      const saved = localStorage.getItem("ractech_sim_fluxo_relatorios");
      if (saved) setSimEntries(JSON.parse(saved));
    } catch { /* ignore */ }
  }, []);
  useEffect(() => {
    try { localStorage.setItem("ractech_sim_fluxo_relatorios", JSON.stringify(simEntries)); }
    catch { /* ignore */ }
  }, [simEntries]);

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
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh", background: "#F3F6F9", fontFamily: "system-ui, sans-serif", fontSize: 13 }}>
      <TopNav />
      <main style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>

        <header style={{ background: "#fff", borderBottom: "0.5px solid #D4DCE8", padding: "10px 22px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 17, fontWeight: 600, color: "#1a1a1a" }}>
              {{ fluxo: "Fluxo de Caixa", cpcr: "CP / CR — Contas", dfc: "DFC — Demonstrativo", posicao: "Posição por Conta" }[aba]}
            </h1>
            <p style={{ margin: 0, fontSize: 11, color: "#444" }}>Relatórios Financeiros</p>
          </div>
          <button onClick={() => window.print()} style={{ background: "#1A5C38", color: "#fff", border: "none", borderRadius: 8, padding: "8px 16px", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
            ⟳ Exportar PDF
          </button>
        </header>

        <div style={{ padding: "16px 22px", flex: 1, overflowY: "auto" }}>

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
                const lanRealizados = lansFiltMoeda.filter(l => l.status === "baixado");
                const lanPendentes  = lansFiltMoeda.filter(l =>
                  (l.status === "em_aberto" || l.status === "vencido" || l.status === "vencendo") && l.natureza !== "previsao"
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

                return (
                  <>
                    {/* Popup Simulador */}
                    {simPopupAberto && (
                      <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center" }}
                        onClick={e => { if (e.target === e.currentTarget) setSimPopupAberto(false); }}>
                        <div style={{ background: "#fff", borderRadius: 12, width: 1080, maxWidth: "95vw", maxHeight: "90vh", display: "flex", flexDirection: "column", boxShadow: "0 8px 40px rgba(0,0,0,0.2)" }}>
                          <div style={{ padding: "18px 28px", borderBottom: "0.5px solid #DDD6FE", display: "flex", alignItems: "center", justifyContent: "space-between", background: "#F5F3FF", borderRadius: "12px 12px 0 0" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                              <div style={{ width: 12, height: 12, borderRadius: "50%", background: "#7C3AED" }} />
                              <span style={{ fontWeight: 700, fontSize: 16, color: "#1a1a1a" }}>Simulador de Cenários</span>
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
                                style={{ background: "none", border: "none", cursor: "pointer", fontSize: 22, color: "#555", lineHeight: 1, marginLeft: 6 }}>✕</button>
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
                                  style={{ padding: "10px 18px", background: simEditId ? "#7C3AED" : "#1A4870", color: "#fff", border: "none", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap" }}>
                                  {simEditId ? "Salvar" : "+ Adicionar"}
                                </button>
                                {simEditId && (
                                  <button onClick={() => { setSimEditId(null); setSimForm({ descricao: "", valor: "", data: "", tipo: "entrada", fornecedor: "" }); }}
                                    style={{ padding: "10px 12px", background: "#F4F6FA", color: "#555", border: "0.5px solid #D4DCE8", borderRadius: 8, fontSize: 13, cursor: "pointer" }}>✕</button>
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
                                        <span style={{ fontSize: 11, padding: "3px 10px", borderRadius: 10, fontWeight: 600, background: s.tipo === "entrada" ? "#DCFCE7" : "#FEE2E2", color: s.tipo === "entrada" ? "#16A34A" : "#E24B4A" }}>
                                          {s.tipo === "entrada" ? "Entrada" : "Saída"}
                                        </span>
                                      </td>
                                      <td style={{ padding: "11px 16px", textAlign: "right", fontWeight: 700, fontSize: 14, color: s.tipo === "entrada" ? "#16A34A" : "#E24B4A" }}>
                                        {s.tipo === "entrada" ? "+" : "−"} {fmtBRL(s.valor)}
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
                            <div style={{ padding: "14px 28px", borderTop: "0.5px solid #DDD6FE", background: "#F5F3FF", borderRadius: "0 0 12px 12px", display: "flex", gap: 28, alignItems: "center", flexWrap: "wrap" }}>
                              <span style={{ fontSize: 12, color: "#7C3AED", fontWeight: 700 }}>Impacto ({simsAtivas.length} ativas):</span>
                              <span style={{ fontSize: 14, color: "#16A34A", fontWeight: 700 }}>+ {fmtBRL(simsAtivas.filter(s => s.tipo === "entrada").reduce((a, s) => a + s.valor, 0))}</span>
                              <span style={{ fontSize: 14, color: "#E24B4A", fontWeight: 700 }}>− {fmtBRL(simsAtivas.filter(s => s.tipo === "saida").reduce((a, s) => a + s.valor, 0))}</span>
                              <span style={{ fontSize: 14, fontWeight: 700, color: totalSimLiq >= 0 ? "#1A4870" : "#E24B4A" }}>Líquido: {fmtBRL(totalSimLiq)}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Sub-abas Diário / Mensal */}
                    <div style={{ display: "flex", gap: 0, background: "#fff", border: "0.5px solid #D4DCE8", borderRadius: 12, overflow: "hidden", marginBottom: 0 }}>
                      {(["diario", "mensal"] as const).map(t => (
                        <button key={t} onClick={() => setSubAbaFluxo(t)}
                          style={{ flex: 1, padding: "10px 0", fontSize: 13, fontWeight: 600, cursor: "pointer", border: "none", borderBottom: subAbaFluxo === t ? "2.5px solid #1A4870" : "2.5px solid transparent", background: subAbaFluxo === t ? "#F0F4FA" : "#fff", color: subAbaFluxo === t ? "#1A4870" : "#888", transition: "all 0.15s" }}>
                          {t === "diario" ? "Diário" : "Mensal"}
                        </button>
                      ))}
                    </div>

                    {/* ── DIÁRIO ── */}
                    {subAbaFluxo === "diario" && (
                    <div style={{ background: "#fff", border: "0.5px solid #D4DCE8", borderRadius: 12 }}>
                      {/* Filtros — linha 1: período + produtores */}
                      <div style={{ padding: "12px 20px 8px", borderBottom: "none", display: "flex", flexWrap: "wrap", gap: 10, alignItems: "flex-end" }}>
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
                          <button onClick={() => setFiltroAberto(v => !v)} style={{ padding: "7px 14px", borderRadius: 8, border: `0.5px solid ${filtro.produtoresSel.length + filtro.contasSel.length > 0 ? "#1A4870" : "#D4DCE8"}`, background: filtro.produtoresSel.length + filtro.contasSel.length > 0 ? "#D5E8F5" : "#fff", color: filtro.produtoresSel.length + filtro.contasSel.length > 0 ? "#0B2D50" : "#555", fontSize: 12, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap" }}>
                            ⊞ Produtores / Contas {filtro.produtoresSel.length + filtro.contasSel.length > 0 ? `(${filtro.produtoresSel.length + filtro.contasSel.length} selecionados)` : ""}
                          </button>
                        </div>
                        {saldoInicial !== 0 && (
                          <div style={{ display: "flex", flexDirection: "column", gap: 2, justifyContent: "flex-end" }}>
                            <label style={labelStyle}>Saldo Inicial</label>
                            <div style={{ padding: "7px 12px", background: saldoInicial >= 0 ? "#D5E8F5" : "#FCEBEB", borderRadius: 8, fontSize: 13, fontWeight: 700, color: saldoInicial >= 0 ? "#0B2D50" : "#E24B4A", whiteSpace: "nowrap" }}>
                              {fmtBRL(saldoInicial)}
                            </div>
                          </div>
                        )}
                      </div>
                      {/* Filtros — linha 2: tipo + moeda + toggles */}
                      <div style={{ padding: "8px 20px 10px", borderBottom: "0.5px solid #DEE5EE", display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
                        <span style={{ fontSize: 11, color: "#888", marginRight: 2 }}>Tipo:</span>
                        {(["ambos", "previsto", "realizado"] as const).map(t => (
                          <button key={t} onClick={() => setFiltro(f => ({ ...f, tipoVis: t }))}
                            style={{ padding: "5px 12px", borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: "pointer", border: `0.5px solid ${filtro.tipoVis === t ? "#1A4870" : "#D4DCE8"}`, background: filtro.tipoVis === t ? "#1A4870" : "#fff", color: filtro.tipoVis === t ? "#fff" : "#555" }}>
                            {t === "ambos" ? "Ambos" : t === "previsto" ? "Previsto" : "Realizado"}
                          </button>
                        ))}
                        <div style={{ width: 1, height: 22, background: "#D4DCE8", margin: "0 4px" }} />
                        <span style={{ fontSize: 11, color: "#888", marginRight: 2 }}>Moeda:</span>
                        {(["BRL", "USD"] as const).map(m => (
                          <button key={m} onClick={() => setFiltro(f => ({ ...f, moedasSel: f.moedasSel.includes(m) ? f.moedasSel.filter(x => x !== m) : [...f.moedasSel, m] }))}
                            style={{ padding: "5px 12px", borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: "pointer", border: `0.5px solid ${filtro.moedasSel.includes(m) ? "#C9921B" : "#D4DCE8"}`, background: filtro.moedasSel.includes(m) ? "#FBF3E0" : "#fff", color: filtro.moedasSel.includes(m) ? "#7A4300" : "#555" }}>
                            {m}
                          </button>
                        ))}
                        <div style={{ width: 1, height: 22, background: "#D4DCE8", margin: "0 4px" }} />
                        {filtro.tipoVis !== "realizado" && (
                          <button onClick={() => setIncluirPrevisoes(v => !v)}
                            style={{ padding: "5px 12px", borderRadius: 8, border: `0.5px solid ${incluirPrevisoes ? "#16A34A" : "#D4DCE8"}`, background: incluirPrevisoes ? "#F0FDF4" : "#fff", color: incluirPrevisoes ? "#16A34A" : "#555", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
                            {incluirPrevisoes ? "✓" : "○"} Previsões
                          </button>
                        )}
                        <button onClick={() => setSimulacoesAtivas(v => !v)}
                          style={{ padding: "5px 12px", borderRadius: 8, border: `0.5px solid ${simulacoesAtivas ? "#7C3AED" : "#D4DCE8"}`, background: simulacoesAtivas ? "#F5F3FF" : "#fff", color: simulacoesAtivas ? "#7C3AED" : "#555", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
                          {simulacoesAtivas ? "✓" : "○"} Simulações
                        </button>
                        <button onClick={() => setSimPopupAberto(true)}
                          style={{ padding: "5px 12px", borderRadius: 8, border: "0.5px solid #7C3AED", background: "#F5F3FF", color: "#7C3AED", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
                          ⟳ Gerenciar{simEntries.length > 0 ? ` (${simEntries.length})` : ""}
                        </button>
                      </div>

                      {/* Painel de checkboxes Produtores / Contas */}
                      {filtroAberto && (
                        <div style={{ padding: "14px 20px", borderBottom: "0.5px solid #DEE5EE", background: "#F8FAFC", display: "flex", gap: 32, flexWrap: "wrap" }}>
                          {/* Produtores */}
                          {produtores.length > 0 && (
                            <div>
                              <div style={{ fontSize: 11, fontWeight: 600, color: "#1A4870", marginBottom: 8 }}>Produtores</div>
                              <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                                {produtores.map(p => (
                                  <label key={p.id} style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 12, cursor: "pointer" }}>
                                    <input type="checkbox" checked={filtro.produtoresSel.includes(p.id)}
                                      onChange={e => setFiltro(f => ({ ...f, produtoresSel: e.target.checked ? [...f.produtoresSel, p.id] : f.produtoresSel.filter(x => x !== p.id), contasSel: [] }))} />
                                    {p.nome} {p.cpf_cnpj && <span style={{ color: "#888", fontSize: 10 }}>{p.cpf_cnpj}</span>}
                                  </label>
                                ))}
                              </div>
                            </div>
                          )}
                          {/* Contas */}
                          <div>
                            <div style={{ fontSize: 11, fontWeight: 600, color: "#1A4870", marginBottom: 8 }}>
                              Contas Bancárias
                              {filtro.produtoresSel.length > 0 && <span style={{ fontSize: 10, color: "#888", fontWeight: 400, marginLeft: 6 }}>(filtradas pelo produtor)</span>}
                            </div>
                            <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                              {(filtro.produtoresSel.length > 0 ? contasFiltProd : contasFluxo).map(c => {
                                const tp = { corrente: "Corrente", investimento: "Invest.", caixa: "Caixa", transitoria: "Transit." }[c.tipo_conta ?? "corrente"] ?? "Corrente";
                                return (
                                  <label key={c.id} style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 12, cursor: "pointer" }}>
                                    <input type="checkbox" checked={filtro.contasSel.includes(c.id)}
                                      onChange={e => setFiltro(f => ({ ...f, contasSel: e.target.checked ? [...f.contasSel, c.id] : f.contasSel.filter(x => x !== c.id) }))} />
                                    {c.nome} <span style={{ fontSize: 10, color: "#888" }}>{tp}{c.banco ? ` · ${c.banco}` : ""}</span>
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
                            <span style={{ fontSize: 12, color: "#E24B4A", fontWeight: 600 }}>CP em aberto: <strong>{fmtBRL(cpAntPeriodo)}</strong></span>
                          )}
                          {crAntPeriodo > 0 && (
                            <span style={{ fontSize: 12, color: "#16A34A", fontWeight: 600 }}>CR em aberto: <strong>{fmtBRL(crAntPeriodo)}</strong></span>
                          )}
                          <span style={{ fontSize: 11, color: "#888" }}>Esses valores afetarão o saldo quando forem baixados.</span>
                        </div>
                      )}

                      {/* KPIs */}
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 0, borderBottom: "0.5px solid #DEE5EE", marginTop: mostrarAntPeriodo ? 12 : 0 }}>
                        {[
                          ...(saldoInicial !== 0 ? [{ label: "Saldo Inicial", valor: fmtBRL(saldoInicial), cor: saldoInicial >= 0 ? "#555" : "#E24B4A" }] : []),
                          { label: "Total Entradas",           valor: fmtBRL(totalEntradas), cor: "#16A34A" },
                          { label: "Total Saídas",             valor: fmtBRL(totalSaidas),   cor: "#E24B4A" },
                          { label: `Saldo Final${simsAtivas.length > 0 ? " (c/ sim)" : ""}`, valor: fmtBRL(saldoFinal), cor: saldoFinal >= 0 ? "#1A4870" : "#E24B4A" },
                        ].map((k, i) => (
                          <div key={i} style={{ padding: "12px 20px", borderRight: i < 2 ? "0.5px solid #DEE5EE" : "none" }}>
                            <div style={{ fontSize: 10, color: "#555", marginBottom: 3 }}>{k.label}</div>
                            <div style={{ fontSize: 16, fontWeight: 700, color: k.cor }}>{k.valor}</div>
                          </div>
                        ))}
                      </div>

                      {/* Tabela agrupada por dia */}
                      {rows.length === 0 ? (
                        <div style={{ padding: 32, textAlign: "center", color: "#888", fontSize: 13 }}>
                          Nenhum lançamento no período. Ajuste os filtros ou adicione simulações.
                        </div>
                      ) : (
                        <div style={{ overflowX: "auto" }}>
                          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                            <thead>
                              <tr style={{ background: "#F4F6FA" }}>
                                <th style={{ padding: "7px 14px", width: 28 }} />
                                <th style={{ padding: "7px 14px", textAlign: "left", fontWeight: 600, fontSize: 11, color: "#555", whiteSpace: "nowrap" }}>Data</th>
                                <th style={{ padding: "7px 14px", textAlign: "left", fontWeight: 600, fontSize: 11, color: "#555" }}>Fornecedor / Pagador</th>
                                <th style={{ padding: "7px 14px", textAlign: "left", fontWeight: 600, fontSize: 11, color: "#555" }}>Descrição</th>
                                <th style={{ padding: "7px 14px", textAlign: "left", fontWeight: 600, fontSize: 11, color: "#555" }}>Origem</th>
                                <th style={{ padding: "7px 14px", textAlign: "right", fontWeight: 600, fontSize: 11, color: "#16A34A", whiteSpace: "nowrap" }}>Entrada</th>
                                <th style={{ padding: "7px 14px", textAlign: "right", fontWeight: 600, fontSize: 11, color: "#E24B4A", whiteSpace: "nowrap" }}>Saída</th>
                                <th style={{ padding: "7px 14px", textAlign: "right", fontWeight: 600, fontSize: 11, color: "#7C3AED", whiteSpace: "nowrap" }}>Simulação</th>
                                <th style={{ padding: "7px 14px", textAlign: "right", fontWeight: 600, fontSize: 11, color: "#555", whiteSpace: "nowrap" }}>Saldo Acumulado</th>
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
                                      style={{ background: expandido ? "#F0F4FA" : "#F8FAFC", borderBottom: "0.5px solid #DEE5EE", cursor: "pointer", userSelect: "none" }}>
                                      <td style={{ padding: "8px 14px", textAlign: "center", color: "#888", fontSize: 12 }}>{expandido ? "▼" : "+"}</td>
                                      <td style={{ padding: "8px 14px", fontWeight: 600, fontSize: 12, color: "#1a1a1a", whiteSpace: "nowrap" }}>{fmtDia(dia)}</td>
                                      <td style={{ padding: "8px 14px" }}>
                                        <span style={{ fontSize: 10, color: "#888" }}>{diaRows.length} lançamento{diaRows.length !== 1 ? "s" : ""}</span>
                                        {temSim  && <span style={{ marginLeft: 6, fontSize: 10, background: "#EDE9FE", color: "#7C3AED", padding: "1px 5px", borderRadius: 8 }}>sim</span>}
                                        {temPrev && <span style={{ marginLeft: 4, fontSize: 10, background: "#DCFCE7", color: "#16A34A", padding: "1px 5px", borderRadius: 8 }}>prev</span>}
                                      </td>
                                      <td /><td />
                                      <td style={{ padding: "8px 14px", textAlign: "right", color: "#16A34A", fontWeight: 600, fontSize: 12, whiteSpace: "nowrap" }}>{diaEnt > 0 ? fmtBRL(diaEnt) : ""}</td>
                                      <td style={{ padding: "8px 14px", textAlign: "right", color: "#E24B4A", fontWeight: 600, fontSize: 12, whiteSpace: "nowrap" }}>{diaSai > 0 ? fmtBRL(diaSai) : ""}</td>
                                      <td style={{ padding: "8px 14px", textAlign: "right", color: "#7C3AED", fontWeight: 600, fontSize: 12, whiteSpace: "nowrap" }}>{diaSimLiq !== 0 ? (diaSimLiq > 0 ? "+" : "−") + fmtBRL(Math.abs(diaSimLiq)) : ""}</td>
                                      <td style={{ padding: "8px 14px", textAlign: "right", fontWeight: 700, fontSize: 12, color: diaUltSaldo >= 0 ? "#1A4870" : "#E24B4A", whiteSpace: "nowrap" }}>{fmtBRL(diaUltSaldo)}</td>
                                    </tr>
                                    {expandido && diaRows.map((r, idx) => {
                                      const isSim  = r.tipo_row === "simulacao";
                                      const isPrev = r.tipo_row === "previsao";
                                      const isPend = r.tipo_row === "pendente";
                                      const isReal = r.tipo_row === "real";
                                      return (
                                        <tr key={`${dia}-${idx}`} style={{ background: isSim ? "#FAF5FF" : isPrev ? "#F0FDF4" : isPend ? "#FFFBF0" : "#fff", borderBottom: "0.5px solid #F4F6FA" }}>
                                          <td />
                                          <td style={{ padding: "6px 14px 6px 28px", color: "#888", fontSize: 11, whiteSpace: "nowrap" }}>
                                            {new Date(r.data + "T12:00:00").toLocaleDateString("pt-BR")}
                                          </td>
                                          <td style={{ padding: "6px 14px", color: "#444", maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.fornecedor || "—"}</td>
                                          <td style={{ padding: "6px 14px", color: "#444", maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.descricao || "—"}</td>
                                          <td style={{ padding: "6px 14px" }}>
                                            {isSim  && <span style={{ fontSize: 10, background: "#EDE9FE", color: "#7C3AED", padding: "2px 7px", borderRadius: 10, fontWeight: 600 }}>Simulação</span>}
                                            {isPrev && (() => {
                                              const orig = r.origem_lancamento;
                                              if (orig === "pedido_compra")   return <span style={{ fontSize: 10, background: "#FBF3E0", color: "#7A5A12", padding: "2px 7px", borderRadius: 10, fontWeight: 600 }}>Pedido de Compra</span>;
                                              if (orig === "contrato")        return <span style={{ fontSize: 10, background: "#FBF3E0", color: "#7A5A12", padding: "2px 7px", borderRadius: 10, fontWeight: 600 }}>Contrato</span>;
                                              if (orig === "arrendamento")    return <span style={{ fontSize: 10, background: "#FBF3E0", color: "#7A5A12", padding: "2px 7px", borderRadius: 10, fontWeight: 600 }}>Arrendamento</span>;
                                              if (orig === "nf_entrada")      return <span style={{ fontSize: 10, background: "#FBF3E0", color: "#7A5A12", padding: "2px 7px", borderRadius: 10, fontWeight: 600 }}>NF Entrada</span>;
                                              return <span style={{ fontSize: 10, background: "#DCFCE7", color: "#16A34A", padding: "2px 7px", borderRadius: 10, fontWeight: 600 }}>Previsão</span>;
                                            })()}
                                            {isPend && <span style={{ fontSize: 10, background: "#FEF3E2", color: "#7A4300", padding: "2px 7px", borderRadius: 10, fontWeight: 600 }}>Em Aberto</span>}
                                            {isReal && <span style={{ fontSize: 10, background: "#EFF3FA", color: "#1A4870", padding: "2px 7px", borderRadius: 10, fontWeight: 600 }}>Realizado</span>}
                                          </td>
                                          <td style={{ padding: "6px 14px", textAlign: "right" }}>
                                            {r.entrada > 0 && <div style={{ color: "#16A34A", fontWeight: 600 }}>{fmtBRL(r.entrada)}</div>}
                                            {r.entrada > 0 && r.subMoeda && <div style={{ fontSize: 9, color: "#888" }}>{r.subMoeda}</div>}
                                          </td>
                                          <td style={{ padding: "6px 14px", textAlign: "right" }}>
                                            {r.saida > 0 && <div style={{ color: "#E24B4A", fontWeight: 600 }}>{fmtBRL(r.saida)}</div>}
                                            {r.saida > 0 && r.subMoeda && <div style={{ fontSize: 9, color: "#888" }}>{r.subMoeda}</div>}
                                          </td>
                                          <td style={{ padding: "6px 14px", textAlign: "right", color: "#7C3AED", fontWeight: 700 }}>
                                            {isSim ? ((r.simEntrada > 0 ? "+" : "−") + " " + fmtBRL(Math.max(r.simEntrada, r.simSaida))) : ""}
                                          </td>
                                          <td style={{ padding: "6px 14px", textAlign: "right", fontWeight: 700, color: r.saldo >= 0 ? "#1A4870" : "#E24B4A", whiteSpace: "nowrap" }}>{fmtBRL(r.saldo)}</td>
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
                      const lanAno = lancamentos.filter(l => {
                        const dt = l.data_vencimento ?? l.data_lancamento ?? "";
                        return dt.startsWith(dfcAno) && l.moeda !== "barter";
                      });
                      // Inclui baixados sempre; pendentes/previsões quando toggle ativo
                      const lanVis = lanAno.filter(l => l.status === "baixado" || incluirPrevisoes);
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
                      const CatRowMEl = ({ row }: { row: CatRowM }) => {
                        const totRow = row.meses.reduce((s, c) => s + c.real + c.prev + c.sim, 0);
                        if (totRow === 0) return null;
                        const sim = isSim(row.cat);
                        return (
                          <tr style={{ borderBottom: "0.5px solid #F0F3FA", background: sim ? "#FAF5FF" : undefined }}>
                            <td style={{ padding: "6px 14px 6px 24px", fontSize: 12, color: sim ? "#7C3AED" : "#1a1a1a", maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{row.cat}</td>
                            {row.meses.map((c, i) => {
                              const total = c.real + c.prev + c.sim;
                              return (
                                <td key={i} style={{ padding: "5px 6px", textAlign: "right", whiteSpace: "nowrap" }}>
                                  {total > 0 ? (
                                    <>
                                      <div style={{ fontSize: 11, fontWeight: 600, color: sim ? "#7C3AED" : "#1a1a1a" }}>{fmtBRL(total)}</div>
                                      {c.prev > 0 && c.real === 0 && c.sim === 0 && <div style={{ fontSize: 9, color: "#C9921B" }}>prev</div>}
                                      {c.prev > 0 && (c.real > 0 || c.sim > 0) && <div style={{ fontSize: 9, color: "#C9921B" }}>+{fmtBRL(c.prev)} prev</div>}
                                      {c.sim > 0 && c.real === 0 && c.prev === 0 && <div style={{ fontSize: 9, color: "#7C3AED" }}>sim</div>}
                                    </>
                                  ) : <span style={{ color: "#DDE2EE", fontSize: 10 }}>—</span>}
                                </td>
                              );
                            })}
                            <td style={{ padding: "6px 10px", textAlign: "right", fontWeight: 700, fontSize: 11, color: sim ? "#7C3AED" : "#1a1a1a", whiteSpace: "nowrap" }}>{totRow === 0 ? "—" : fmtBRL(totRow)}</td>
                          </tr>
                        );
                      };
                      return (
                        <div style={{ background: "#fff", border: "0.5px solid #D4DCE8", borderRadius: 12, overflow: "hidden" }}>
                          {/* Cabeçalho */}
                          <div style={{ padding: "12px 20px", borderBottom: "0.5px solid #DEE5EE", background: "#F8FAFD", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
                            <div style={{ fontSize: 11, color: "#555" }}>
                              Entradas e saídas por categoria · {incluirPrevisoes ? "Baixados + pendentes" : "Apenas realizados"}
                            </div>
                            <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                              <button onClick={() => setIncluirPrevisoes(v => !v)}
                                style={{ fontSize: 11, padding: "5px 12px", borderRadius: 8, border: "0.5px solid", cursor: "pointer", background: incluirPrevisoes ? "#FBF3E0" : "#F4F6FA", color: incluirPrevisoes ? "#7A4300" : "#555", borderColor: incluirPrevisoes ? "#C9921B" : "#D4DCE8" }}>
                                {incluirPrevisoes ? "◉ Incluindo pendentes" : "○ Só realizados"}
                              </button>
                              <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                                <label style={{ fontSize: 12, color: "#555" }}>Exercício:</label>
                                <select value={dfcAno} onChange={e => setDfcAno(e.target.value)}
                                  style={{ padding: "6px 10px", border: "0.5px solid #D4DCE8", borderRadius: 8, fontSize: 13, cursor: "pointer" }}>
                                  {anosDispo.map(a => <option key={a} value={a}>{a}</option>)}
                                </select>
                              </div>
                            </div>
                          </div>
                          {/* KPIs */}
                          <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", borderBottom: "0.5px solid #DEE5EE" }}>
                            {[
                              { label: "Total Entradas",    v: totEntAnual },
                              { label: "Total Saídas",      v: totSaiAnual },
                              { label: "Resultado Líquido", v: totLiqAnual },
                              { label: "Saldo Acumulado",   v: saldoAcM[11] ?? totLiqAnual },
                            ].map((k, i) => (
                              <div key={i} style={{ padding: "12px 18px", borderRight: i < 3 ? "0.5px solid #DEE5EE" : "none", background: "#F8FAFD" }}>
                                <div style={{ fontSize: 10, color: "#888", marginBottom: 3 }}>{k.label}</div>
                                <div style={{ fontSize: 16, fontWeight: 700, color: k.v < 0 ? "#B91C1C" : "#1a1a1a" }}>{fmtBRL(k.v)}</div>
                              </div>
                            ))}
                          </div>
                          {/* Tabela */}
                          <div style={{ overflowX: "auto" }}>
                            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, minWidth: 1100 }}>
                              <thead>
                                <tr style={{ background: "#F4F6FA" }}>
                                  <th style={{ padding: "8px 14px", textAlign: "left", fontWeight: 600, fontSize: 11, color: "#555", minWidth: 200, borderBottom: "0.5px solid #DDE2EE" }}>Categoria</th>
                                  {MESES.map(m => <th key={m} style={{ padding: "8px 6px", textAlign: "right", fontWeight: 600, fontSize: 11, color: "#555", borderBottom: "0.5px solid #DDE2EE", whiteSpace: "nowrap", minWidth: 64 }}>{m}</th>)}
                                  <th style={{ padding: "8px 10px", textAlign: "right", fontWeight: 700, fontSize: 11, color: "#1A4870", borderBottom: "0.5px solid #DDE2EE", whiteSpace: "nowrap" }}>Total {dfcAno}</th>
                                </tr>
                              </thead>
                              <tbody>
                                <tr style={{ background: "#F4F6FA" }}><td colSpan={14} style={{ padding: "7px 16px", fontWeight: 700, fontSize: 10, color: "#1A4870", letterSpacing: "0.06em", textTransform: "uppercase" }}>Entradas</td></tr>
                                {entradasM.length > 0 ? entradasM.map(r => <CatRowMEl key={r.cat} row={r} />) : <tr><td colSpan={14} style={{ padding: "10px 24px", color: "#888", fontSize: 11 }}>Nenhuma entrada.</td></tr>}
                                <tr style={{ background: "#F4F6FA", borderTop: "0.5px solid #DDE2EE" }}>
                                  <td style={{ padding: "8px 14px", fontWeight: 700, fontSize: 12, color: "#1A4870" }}>Total Entradas</td>
                                  {totEntM.map((v, i) => <td key={i} style={{ padding: "8px 6px", textAlign: "right", fontWeight: 700, fontSize: 11, color: v === 0 ? "#bbb" : "#1a1a1a", whiteSpace: "nowrap" }}>{v === 0 ? "—" : fmtBRL(v)}</td>)}
                                  <td style={{ padding: "8px 10px", textAlign: "right", fontWeight: 700, fontSize: 12, color: "#1a1a1a", whiteSpace: "nowrap" }}>{totEntAnual === 0 ? "—" : fmtBRL(totEntAnual)}</td>
                                </tr>
                                <tr style={{ background: "#F4F6FA", borderTop: "1px solid #DDE2EE" }}><td colSpan={14} style={{ padding: "7px 16px", fontWeight: 700, fontSize: 10, color: "#1A4870", letterSpacing: "0.06em", textTransform: "uppercase" }}>Saídas</td></tr>
                                {saidasM.length > 0 ? saidasM.map(r => <CatRowMEl key={r.cat} row={r} />) : <tr><td colSpan={14} style={{ padding: "10px 24px", color: "#888", fontSize: 11 }}>Nenhuma saída.</td></tr>}
                                <tr style={{ background: "#F4F6FA", borderTop: "0.5px solid #DDE2EE" }}>
                                  <td style={{ padding: "8px 14px", fontWeight: 700, fontSize: 12, color: "#1A4870" }}>Total Saídas</td>
                                  {totSaiM.map((v, i) => <td key={i} style={{ padding: "8px 6px", textAlign: "right", fontWeight: 700, fontSize: 11, color: v === 0 ? "#bbb" : "#1a1a1a", whiteSpace: "nowrap" }}>{v === 0 ? "—" : fmtBRL(v)}</td>)}
                                  <td style={{ padding: "8px 10px", textAlign: "right", fontWeight: 700, fontSize: 12, color: "#1a1a1a", whiteSpace: "nowrap" }}>{totSaiAnual === 0 ? "—" : fmtBRL(totSaiAnual)}</td>
                                </tr>
                                <tr style={{ background: "#EFF3FA", borderTop: "1px solid #C7D7EC" }}>
                                  <td style={{ padding: "9px 14px", fontWeight: 700, fontSize: 12, color: "#1A4870" }}>Saldo do Mês</td>
                                  {saldoMesM.map((v, i) => <td key={i} style={{ padding: "9px 6px", textAlign: "right", fontWeight: 700, fontSize: 11, color: v < 0 ? "#B91C1C" : v === 0 ? "#bbb" : "#1a1a1a", whiteSpace: "nowrap" }}>{v === 0 ? "—" : fmtBRL(v)}</td>)}
                                  <td style={{ padding: "9px 10px", textAlign: "right", fontWeight: 700, fontSize: 12, color: totLiqAnual < 0 ? "#B91C1C" : "#1a1a1a", whiteSpace: "nowrap" }}>{totLiqAnual === 0 ? "—" : fmtBRL(totLiqAnual)}</td>
                                </tr>
                                <tr style={{ background: "#EFF3FA" }}>
                                  <td style={{ padding: "9px 14px", fontWeight: 700, fontSize: 12, color: "#1A4870" }}>Saldo Acumulado</td>
                                  {saldoAcM.map((v, i) => <td key={i} style={{ padding: "9px 6px", textAlign: "right", fontWeight: 700, fontSize: 11, color: v < 0 ? "#B91C1C" : v === 0 ? "#bbb" : "#1a1a1a", whiteSpace: "nowrap" }}>{v === 0 ? "—" : fmtBRL(v)}</td>)}
                                  <td style={{ padding: "9px 10px", textAlign: "right", fontWeight: 800, fontSize: 13, color: (saldoAcM[11]??totLiqAnual) < 0 ? "#B91C1C" : "#1a1a1a", whiteSpace: "nowrap" }}>{fmtBRL(saldoAcM[11]??totLiqAnual)}</td>
                                </tr>
                              </tbody>
                            </table>
                          </div>
                          <div style={{ padding: "8px 20px", fontSize: 10, color: "#888", borderTop: "0.5px solid #DEE5EE" }}>
                            {incluirPrevisoes ? "Baixados + pendentes (em aberto/vencidos/previsões). Prev em mostarda." : "Apenas lançamentos com status Baixado."}
                          </div>
                        </div>
                      );
                    })()}

                  </>
                );
              })()}

              {/* ═══════ ABA: CP / CR ═══════ */}
              {aba === "cpcr" && (() => {
                const lancsCPCR = lancamentos.filter(l => {
                  if (l.moeda === "barter") return false;
                  const dt = l.data_vencimento ?? l.data_lancamento ?? "";
                  if (inicioCPCR && dt < inicioCPCR) return false;
                  if (fimCPCR   && dt > fimCPCR)   return false;
                  if (tipoCPCR !== "todos" && l.tipo !== tipoCPCR) return false;
                  if (statusCPCR !== "todos" && l.status !== statusCPCR) return false;
                  if (catCPCR && l.categoria !== catCPCR) return false;
                  return true;
                });

                const categorias = [...new Set(lancamentos.filter(l => l.moeda !== "barter").map(l => l.categoria).filter(Boolean))].sort();

                const totalCR    = lancsCPCR.filter(l => l.tipo === "receber").reduce((s, l) => s + paraBRLRel(l, cotacaoUSD), 0);
                const totalCP    = lancsCPCR.filter(l => l.tipo === "pagar").reduce((s, l) => s + paraBRLRel(l, cotacaoUSD), 0);
                const totalVenc  = lancsCPCR.filter(l => l.status === "vencido").reduce((s, l) => s + paraBRLRel(l, cotacaoUSD), 0);
                const totalBaixado = lancsCPCR.filter(l => l.status === "baixado").reduce((s, l) => s + paraBRLRel(l, cotacaoUSD), 0);

                const corStatus: Record<string, { bg: string; color: string; label: string }> = {
                  em_aberto: { bg: "#D5E8F5", color: "#0B2D50", label: "Em Aberto" },
                  vencido:   { bg: "#FCEBEB", color: "#791F1F", label: "Vencido" },
                  vencendo:  { bg: "#FBF3E0", color: "#7A5A12", label: "Vencendo" },
                  baixado:   { bg: "#DCF5E8", color: "#14532D", label: "Baixado" },
                };

                return (
                  <div style={{ background: "#fff", border: "0.5px solid #D4DCE8", borderRadius: 12 }}>
                    {/* Filtros CP/CR */}
                    <div style={{ padding: "12px 20px", borderBottom: "0.5px solid #DEE5EE", display: "flex", flexWrap: "wrap", gap: 10, alignItems: "flex-end" }}>
                      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                        <label style={labelStyle}>Início</label>
                        <input type="date" value={inicioCPCR} onChange={e => setInicioCPCR(e.target.value)} style={{ ...inputStyle, width: 140 }} />
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                        <label style={labelStyle}>Fim</label>
                        <input type="date" value={fimCPCR} onChange={e => setFimCPCR(e.target.value)} style={{ ...inputStyle, width: 140 }} />
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                        <label style={labelStyle}>Tipo</label>
                        <select value={tipoCPCR} onChange={e => setTipoCPCR(e.target.value as typeof tipoCPCR)} style={{ ...inputStyle, width: 150 }}>
                          <option value="todos">Todos (CR + CP)</option>
                          <option value="receber">Contas a Receber (CR)</option>
                          <option value="pagar">Contas a Pagar (CP)</option>
                        </select>
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                        <label style={labelStyle}>Status</label>
                        <select value={statusCPCR} onChange={e => setStatusCPCR(e.target.value as typeof statusCPCR)} style={{ ...inputStyle, width: 140 }}>
                          <option value="todos">Todos</option>
                          <option value="em_aberto">Em Aberto</option>
                          <option value="vencido">Vencido</option>
                          <option value="baixado">Baixado / Pago</option>
                        </select>
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                        <label style={labelStyle}>Categoria</label>
                        <select value={catCPCR} onChange={e => setCatCPCR(e.target.value)} style={{ ...inputStyle, width: 160 }}>
                          <option value="">Todas</option>
                          {categorias.map(c => <option key={c} value={c}>{c}</option>)}
                        </select>
                      </div>
                    </div>

                    {/* KPIs */}
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 0, borderBottom: "0.5px solid #DEE5EE" }}>
                      {[
                        { label: "Total a Receber (CR)", valor: fmtBRL(totalCR), cor: "#16A34A" },
                        { label: "Total a Pagar (CP)",   valor: fmtBRL(totalCP), cor: "#E24B4A" },
                        { label: "Vencidos",             valor: fmtBRL(totalVenc), cor: "#E24B4A" },
                        { label: "Já Baixados / Pagos",  valor: fmtBRL(totalBaixado), cor: "#555" },
                      ].map((k, i) => (
                        <div key={i} style={{ padding: "12px 20px", borderRight: i < 3 ? "0.5px solid #DEE5EE" : "none" }}>
                          <div style={{ fontSize: 10, color: "#555", marginBottom: 3 }}>{k.label}</div>
                          <div style={{ fontSize: 16, fontWeight: 700, color: k.cor }}>{k.valor}</div>
                        </div>
                      ))}
                    </div>

                    {/* Tabela */}
                    {lancsCPCR.length === 0 ? (
                      <div style={{ padding: 32, textAlign: "center", color: "#888", fontSize: 13 }}>Nenhum lançamento no período com os filtros selecionados.</div>
                    ) : (
                      <div style={{ overflowX: "auto" }}>
                        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                          <thead>
                            <tr style={{ background: "#F4F6FA" }}>
                              {["Tipo", "Vencimento", "Descrição", "Categoria", "Conta Bancária", "Status", "Valor (BRL)", ""].map(h => (
                                <th key={h} style={{ padding: "8px 12px", textAlign: h === "Valor (BRL)" ? "right" : "left", fontWeight: 600, fontSize: 11, color: "#555", borderBottom: "0.5px solid #D4DCE8", whiteSpace: "nowrap" }}>{h}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {lancsCPCR.map((l, i) => {
                              const st = corStatus[l.status] ?? corStatus.em_aberto;
                              const contaNome = contas.find(c => c.id === l.conta_bancaria)?.nome;
                              const brl = paraBRLRel(l, cotacaoUSD);
                              return (
                                <tr key={l.id} style={{ borderBottom: "0.5px solid #EEF1F7", background: i % 2 === 0 ? "#fff" : "#FAFBFD" }}>
                                  <td style={{ padding: "9px 12px" }}>
                                    <span style={{ fontSize: 10, padding: "2px 7px", borderRadius: 5, background: l.tipo === "receber" ? "#D5E8F5" : "#FCEBEB", color: l.tipo === "receber" ? "#0B2D50" : "#791F1F", fontWeight: 600 }}>{l.tipo === "receber" ? "CR" : "CP"}</span>
                                  </td>
                                  <td style={{ padding: "9px 12px", color: l.status === "vencido" ? "#E24B4A" : "#555", whiteSpace: "nowrap" }}>
                                    {l.data_vencimento ? new Date(l.data_vencimento + "T12:00").toLocaleDateString("pt-BR") : "—"}
                                  </td>
                                  <td style={{ padding: "9px 12px", fontWeight: 600, color: "#1a1a1a", maxWidth: 260, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={l.descricao ?? ""}>{l.descricao || "—"}</td>
                                  <td style={{ padding: "9px 12px", color: "#555" }}>{l.categoria || "—"}</td>
                                  <td style={{ padding: "9px 12px", color: "#555" }}>{contaNome || "—"}</td>
                                  <td style={{ padding: "9px 12px" }}><span style={{ fontSize: 10, padding: "2px 7px", borderRadius: 5, background: st.bg, color: st.color, fontWeight: 600 }}>{st.label}</span></td>
                                  <td style={{ padding: "9px 12px", textAlign: "right", fontWeight: 700, color: l.tipo === "receber" ? "#16A34A" : "#E24B4A" }}>
                                    <div>{fmtBRL(brl)}</div>
                                    {l.moeda === "USD" && <div style={{ fontSize: 9, color: "#888" }}>{subMoedaRel(l, cotacaoUSD)}</div>}
                                  </td>
                                  <td style={{ padding: "9px 12px", textAlign: "right" }}>
                                    {l.auto && <span style={{ fontSize: 9, background: "#D5E8F5", color: "#0B2D50", padding: "1px 5px", borderRadius: 4 }}>auto</span>}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                          <tfoot>
                            <tr style={{ background: "#EEF3FA", fontWeight: 700, borderTop: "1.5px solid #D4DCE8" }}>
                              <td colSpan={6} style={{ padding: "10px 12px" }}>{lancsCPCR.length} lançamentos</td>
                              <td style={{ padding: "10px 12px", textAlign: "right" }}>
                                <div style={{ color: "#16A34A" }}>+ {fmtBRL(totalCR)}</div>
                                <div style={{ color: "#E24B4A" }}>− {fmtBRL(totalCP)}</div>
                                <div style={{ fontWeight: 800, color: totalCR - totalCP >= 0 ? "#1A4870" : "#E24B4A", borderTop: "0.5px solid #ccc", paddingTop: 2, marginTop: 2 }}>{fmtBRL(totalCR - totalCP)}</div>
                              </td>
                              <td />
                            </tr>
                          </tfoot>
                        </table>
                      </div>
                    )}
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
                      <td style={{ padding: "6px 14px 6px 24px", fontSize: 12, color: "#1a1a1a", maxWidth: 240, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
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
                              <span style={{ color: "#DDE2EE", fontSize: 10 }}>—</span>
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
                    <tr style={{ background: bg, borderTop: "0.5px solid #DDE2EE" }}>
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
                  <div style={{ background: "#fff", border: "0.5px solid #D4DCE8", borderRadius: 12, overflow: "hidden" }}>

                    {/* Cabeçalho */}
                    <div style={{ padding: "14px 20px", borderBottom: "0.5px solid #DEE5EE", background: "#F8FAFD", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: 14, color: "#1a1a1a" }}>Fluxo de Caixa Mensal</div>
                        <div style={{ fontSize: 11, color: "#555", marginTop: 2 }}>
                          Estruturado por categoria · Entradas e saídas por mês
                        </div>
                      </div>
                      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                        <button
                          onClick={() => setIncluirPrevisoes(v => !v)}
                          style={{ fontSize: 11, padding: "5px 12px", borderRadius: 8, border: "0.5px solid", cursor: "pointer",
                            background: incluirPrevisoes ? "#FBF3E0" : "#F4F6FA",
                            color:      incluirPrevisoes ? "#7A4300" : "#555",
                            borderColor: incluirPrevisoes ? "#C9921B" : "#D4DCE8" }}>
                          {incluirPrevisoes ? "◉ Incluindo pendentes" : "○ Só realizados"}
                        </button>
                        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                          <label style={{ fontSize: 12, color: "#555" }}>Exercício:</label>
                          <select value={dfcAno} onChange={e => setDfcAno(e.target.value)}
                            style={{ padding: "6px 10px", border: "0.5px solid #D4DCE8", borderRadius: 8, fontSize: 13, cursor: "pointer" }}>
                            {anosDispo.map(a => <option key={a} value={a}>{a}</option>)}
                          </select>
                        </div>
                      </div>
                    </div>

                    {/* KPI cards */}
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", borderBottom: "0.5px solid #DEE5EE" }}>
                      {[
                        { label: "Total Entradas",  v: totEnt, cor: "#0B2D50", bg: "#D5E8F5" },
                        { label: "Total Saídas",    v: totSai, cor: "#791F1F", bg: "#FCEBEB" },
                        { label: "Resultado Líquido", v: totLiq, cor: totLiq >= 0 ? "#0B2D50" : "#791F1F", bg: totLiq >= 0 ? "#D5E8F5" : "#FCEBEB" },
                        { label: "Saldo Acumulado", v: saldoAcMensal[11] ?? totLiq, cor: (saldoAcMensal[11] ?? totLiq) >= 0 ? "#0B2D50" : "#791F1F", bg: (saldoAcMensal[11] ?? totLiq) >= 0 ? "#D5E8F5" : "#FCEBEB" },
                      ].map((k, i) => (
                        <div key={i} style={{ padding: "14px 18px", borderRight: i < 3 ? "0.5px solid #DEE5EE" : "none", background: k.bg }}>
                          <div style={{ fontSize: 10, color: "#555", marginBottom: 4 }}>{k.label}</div>
                          <div style={{ fontSize: 17, fontWeight: 700, color: k.cor }}>{fmtBRL(k.v)}</div>
                        </div>
                      ))}
                    </div>

                    {/* Tabela horizontal */}
                    <div style={{ overflowX: "auto" }}>
                      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, minWidth: 1100 }}>
                        <thead>
                          <tr style={{ background: "#F4F6FA" }}>
                            <th style={{ padding: "8px 14px", textAlign: "left", fontWeight: 600, fontSize: 11, color: "#555", minWidth: 200, position: "sticky", left: 0, background: "#F4F6FA", borderBottom: "0.5px solid #DDE2EE" }}>Categoria</th>
                            {MESES.map(m => (
                              <th key={m} style={{ padding: "8px 6px", textAlign: "right", fontWeight: 600, fontSize: 11, color: "#555", borderBottom: "0.5px solid #DDE2EE", whiteSpace: "nowrap", minWidth: 64 }}>{m}</th>
                            ))}
                            <th style={{ padding: "8px 10px", textAlign: "right", fontWeight: 700, fontSize: 11, color: "#1A4870", borderBottom: "0.5px solid #DDE2EE", whiteSpace: "nowrap" }}>Total {dfcAno}</th>
                          </tr>
                        </thead>
                        <tbody>

                          {/* ── ENTRADAS ── */}
                          <SecRow label="ENTRADAS" bg="#DCFCE7" cor="#14532D" />
                          {entradas.length > 0
                            ? entradas.map(r => <CatRowEl key={r.cat} row={r} />)
                            : <tr><td colSpan={14} style={{ padding: "10px 24px", color: "#888", fontSize: 11 }}>Nenhuma entrada no período.</td></tr>
                          }
                          <TotRow label="Total Entradas" vals={totEntMes} bg="#ECFDF5" cor="#16A34A" />

                          {/* ── SAÍDAS ── */}
                          <SecRow label="SAÍDAS" bg="#FCEBEB" cor="#791F1F" />
                          {saidas.length > 0
                            ? saidas.map(r => <CatRowEl key={r.cat} row={r} />)
                            : <tr><td colSpan={14} style={{ padding: "10px 24px", color: "#888", fontSize: 11 }}>Nenhuma saída no período.</td></tr>
                          }
                          <TotRow label="Total Saídas" vals={totSaiMes} bg="#FEF3F2" cor="#E24B4A" />

                          {/* ── SALDO DO MÊS ── */}
                          <tr style={{ background: "#F4F6FA", borderTop: "1px solid #DDE2EE" }}>
                            <td style={{ padding: "9px 14px", fontWeight: 700, fontSize: 12, color: "#1A4870", position: "sticky", left: 0, background: "#F4F6FA" }}>Saldo do Mês</td>
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
                          <tr style={{ background: "#EFF3FA" }}>
                            <td style={{ padding: "9px 14px", fontWeight: 700, fontSize: 12, color: "#1A4870", position: "sticky", left: 0, background: "#EFF3FA" }}>Saldo Acumulado</td>
                            {saldoAcMensal.map((v, i) => (
                              <td key={i} style={{ padding: "9px 6px", textAlign: "right", fontWeight: 700, fontSize: 11, color: v >= 0 ? "#1A4870" : "#E24B4A", whiteSpace: "nowrap" }}>
                                {fmtK(v)}
                              </td>
                            ))}
                            <td style={{ padding: "9px 10px", textAlign: "right", fontWeight: 800, fontSize: 13, color: (saldoAcMensal[11] ?? totLiq) >= 0 ? "#1A4870" : "#E24B4A", whiteSpace: "nowrap" }}>
                              {fmtC(saldoAcMensal[11] ?? totLiq)}
                            </td>
                          </tr>

                        </tbody>
                      </table>
                    </div>

                    <div style={{ padding: "10px 20px", fontSize: 10, color: "#888", borderTop: "0.5px solid #DEE5EE" }}>
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
                  corrente:    { bg: "#D5E8F5", color: "#0B2D50", label: "Corrente" },
                  investimento:{ bg: "#DCF5E8", color: "#14532D", label: "Investimento" },
                  caixa:       { bg: "#FBF3E0", color: "#7A5A12", label: "Caixa" },
                  transitoria: { bg: "#F4F6FA", color: "#555",    label: "Transitória" },
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
                  <div style={{ background: "#fff", border: "0.5px solid #D4DCE8", borderRadius: 12, padding: 20 }}>
                    {/* KPIs */}
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginBottom: 20 }}>
                      {[
                        { label: "Saldo Atual (realizados)", valor: fmtBRL(totalAtual), cor: totalAtual >= 0 ? "#1A4870" : "#E24B4A" },
                        { label: "Entradas Projetadas",      valor: fmtBRL(posicoes.reduce((s, p) => s + p.entradasProj, 0)), cor: "#16A34A" },
                        { label: "Saldo Projetado",          valor: fmtBRL(totalProj), cor: totalProj >= 0 ? "#1A4870" : "#E24B4A" },
                      ].map(k => (
                        <div key={k.label} style={{ background: "#F8FAFC", borderRadius: 10, padding: "14px 18px", border: "0.5px solid #DEE5EE" }}>
                          <div style={{ fontSize: 10, color: "#555", marginBottom: 4 }}>{k.label}</div>
                          <div style={{ fontSize: 18, fontWeight: 700, color: k.cor }}>{k.valor}</div>
                        </div>
                      ))}
                    </div>

                    {/* Tabela por conta */}
                    <div style={{ overflowX: "auto" }}>
                      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                        <thead>
                          <tr style={{ background: "#F4F6FA" }}>
                            {["Conta", "Tipo", "Banco", "Saldo Inicial", "Entradas Realizadas", "Saídas Realizadas", "Saldo Atual", "Entradas Proj.", "Saídas Proj.", "Saldo Projetado"].map(h => (
                              <th key={h} style={{ padding: "8px 12px", textAlign: h === "Conta" || h === "Tipo" || h === "Banco" ? "left" : "right", fontWeight: 600, fontSize: 11, color: "#555", borderBottom: "0.5px solid #D4DCE8", whiteSpace: "nowrap" }}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {posicoes.map((p, i) => {
                            const tp = tipoCor[p.conta.tipo_conta ?? "corrente"] ?? tipoCor.corrente;
                            return (
                              <tr key={p.conta.id} style={{ borderBottom: "0.5px solid #EEF1F7", background: i % 2 === 0 ? "#fff" : "#FAFBFD" }}>
                                <td style={{ padding: "10px 12px", fontWeight: 600, color: "#1a1a1a", whiteSpace: "nowrap" }}>{p.conta.nome}</td>
                                <td style={{ padding: "10px 12px" }}><span style={{ background: tp.bg, color: tp.color, borderRadius: 6, padding: "2px 7px", fontSize: 10, fontWeight: 600 }}>{tp.label}</span></td>
                                <td style={{ padding: "10px 12px", color: "#555" }}>{p.conta.banco || "—"}</td>
                                <td style={{ padding: "10px 12px", textAlign: "right", color: "#555" }}>{(p.conta.saldo_inicial ?? 0) !== 0 ? fmtBRL(p.conta.saldo_inicial!) : "—"}</td>
                                <td style={{ padding: "10px 12px", textAlign: "right", color: "#16A34A", fontWeight: 600 }}>{p.entradasReal > 0 ? fmtBRL(p.entradasReal) : "—"}</td>
                                <td style={{ padding: "10px 12px", textAlign: "right", color: "#E24B4A", fontWeight: 600 }}>{p.saidasReal > 0 ? fmtBRL(p.saidasReal) : "—"}</td>
                                <td style={{ padding: "10px 12px", textAlign: "right", fontWeight: 700, color: p.saldoAtual >= 0 ? "#1A4870" : "#E24B4A" }}>{fmtBRL(p.saldoAtual)}</td>
                                <td style={{ padding: "10px 12px", textAlign: "right", color: "#16A34A" }}>{p.entradasProj > 0 ? fmtBRL(p.entradasProj) : "—"}</td>
                                <td style={{ padding: "10px 12px", textAlign: "right", color: "#E24B4A" }}>{p.saidasProj > 0 ? fmtBRL(p.saidasProj) : "—"}</td>
                                <td style={{ padding: "10px 12px", textAlign: "right", fontWeight: 700, color: p.saldoProj >= 0 ? "#1A4870" : "#E24B4A" }}>{fmtBRL(p.saldoProj)}</td>
                              </tr>
                            );
                          })}
                          {/* Totalizador */}
                          <tr style={{ background: "#EEF3FA", fontWeight: 700, borderTop: "1.5px solid #D4DCE8" }}>
                            <td colSpan={3} style={{ padding: "10px 12px", fontWeight: 700, fontSize: 12 }}>TOTAL ({posicoes.length} contas)</td>
                            <td style={{ padding: "10px 12px", textAlign: "right" }}>{fmtBRL(posicoes.reduce((s, p) => s + (p.conta.saldo_inicial ?? 0), 0))}</td>
                            <td style={{ padding: "10px 12px", textAlign: "right", color: "#16A34A" }}>{fmtBRL(posicoes.reduce((s, p) => s + p.entradasReal, 0))}</td>
                            <td style={{ padding: "10px 12px", textAlign: "right", color: "#E24B4A" }}>{fmtBRL(posicoes.reduce((s, p) => s + p.saidasReal, 0))}</td>
                            <td style={{ padding: "10px 12px", textAlign: "right", color: totalAtual >= 0 ? "#1A4870" : "#E24B4A" }}>{fmtBRL(totalAtual)}</td>
                            <td style={{ padding: "10px 12px", textAlign: "right", color: "#16A34A" }}>{fmtBRL(posicoes.reduce((s, p) => s + p.entradasProj, 0))}</td>
                            <td style={{ padding: "10px 12px", textAlign: "right", color: "#E24B4A" }}>{fmtBRL(posicoes.reduce((s, p) => s + p.saidasProj, 0))}</td>
                            <td style={{ padding: "10px 12px", textAlign: "right", color: totalProj >= 0 ? "#1A4870" : "#E24B4A" }}>{fmtBRL(totalProj)}</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                    <div style={{ marginTop: 10, fontSize: 10, color: "#888" }}>
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
    <Suspense fallback={null}>
      <FinanceiroRelatoriosInner />
    </Suspense>
  );
}
