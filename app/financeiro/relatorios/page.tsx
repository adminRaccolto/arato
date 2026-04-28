"use client";
import React, { useState, useEffect } from "react";
import TopNav from "../../../components/TopNav";
import { listarLancamentos, listarEmpresas, listarContas, listarOperacoesGerenciais } from "../../../lib/db";
import { useAuth } from "../../../components/AuthProvider";
import type { Lancamento, Empresa, ContaBancaria, OperacaoGerencial } from "../../../lib/supabase";

type AbaFin = "fluxo" | "dfc";

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
  tipo_row: "real" | "previsao" | "simulacao";
  entrada: number;
  saida: number;
}

type FiltroFluxo = {
  empresasSel: string[];
  contasSel:   string[];
  inicio:      string;
  fim:         string;
  moedaExib:   "BRL" | "USD";
  visao:       "ambos" | "realizado" | "projetado";
};

// ─── Helpers ──────────────────────────────────────────────────
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
export default function FinanceiroRelatorios() {
  const { fazendaId } = useAuth();

  const [lancamentos,  setLancamentos]  = useState<Lancamento[]>([]);
  const [empresas,     setEmpresas]     = useState<Empresa[]>([]);
  const [contas,       setContas]       = useState<ContaBancaria[]>([]);
  const [operacoesGer, setOperacoesGer] = useState<OperacaoGerencial[]>([]);
  const [carregando,  setCarregando]  = useState(true);
  const [aba,         setAba]         = useState<AbaFin>("fluxo");

  const anoAtual = new Date().getFullYear();
  const [filtro, setFiltro] = useState<FiltroFluxo>({
    empresasSel: [],
    contasSel:   [],
    inicio:      `${anoAtual}-01-01`,
    fim:         `${anoAtual}-12-31`,
    moedaExib:   "BRL",
    visao:       "ambos",
  });
  const [mesesExpandidos,   setMesesExpandidos]   = useState<Set<string>>(new Set());
  const [simEntries,        setSimEntries]        = useState<SimEntry[]>([]);
  const [simulacoesAtivas,  setSimulacoesAtivas]  = useState(true);
  const [incluirPrevisoes,  setIncluirPrevisoes]  = useState(true);
  const [simForm,           setSimForm]           = useState({ descricao: "", valor: "", data: "", tipo: "entrada" as "entrada"|"saida", fornecedor: "" });
  const [simEditId,         setSimEditId]         = useState<string | null>(null);
  const [simPopupAberto,    setSimPopupAberto]    = useState(false);

  // DFC — filtros
  const [dfcAno, setDfcAno] = useState(String(anoAtual));

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
  const opsDFC = operacoesGer.filter(op =>
    !op.classificacao.startsWith("4") && !op.classificacao.startsWith("5")
  );

  // Leaf = tem pelo menos uma flag financeira ativa (gera movimento de caixa real)
  const isDFCLeaf = (op: OperacaoGerencial) =>
    !!(op.permite_cp_cr || op.permite_tesouraria || op.gerar_financeiro || op.gerar_financeiro_gerencial);

  // Leaves filhos de um prefixo de classificação
  const leavesUnder = (pref: string) =>
    opsDFC.filter(op =>
      isDFCLeaf(op) && (op.classificacao === pref || op.classificacao.startsWith(pref + "."))
    );

  // Subtotal líquido mensal de todos os leaves sob um prefixo
  const prefLiqMes = (pref: string): number[] =>
    leavesUnder(pref).reduce(
      (acc, op) => { const mv = opLiqMes(op.id); return acc.map((v, i) => v + mv[i]); },
      Array(12).fill(0) as number[]
    );

  // Atividade DFC de um código de classificação
  const dfcAtiv = (c: string) =>
    (c.startsWith("1") || c.startsWith("2"))           ? "op"  :
    (c === "3.01" || c.startsWith("3.01.") ||
     c === "3.02" || c.startsWith("3.02."))            ? "inv" :
    c.startsWith("3.")                                 ? "fin" : null;

  // Grupos filtrados por atividade DFC
  const opsGrupo1   = opsDFC.filter(op => op.classificacao.startsWith("1"));
  const opsGrupo2   = opsDFC.filter(op => op.classificacao.startsWith("2"));
  const opsGrupoInv = opsDFC.filter(op => dfcAtiv(op.classificacao) === "inv");
  const opsGrupoFin = opsDFC.filter(op => dfcAtiv(op.classificacao) === "fin");

  // Subtotais por atividade (12 meses)
  const liqGrupo1   = prefLiqMes("1");
  const liqGrupo2   = prefLiqMes("2");
  const liqOp       = liqGrupo1.map((v, i) => v + liqGrupo2[i]);
  const liqInv      = [...leavesUnder("3.01"), ...leavesUnder("3.02")]
    .reduce((acc, op) => { const mv = opLiqMes(op.id); return acc.map((v, i) => v + mv[i]); }, Array(12).fill(0) as number[]);
  const liqFin      = opsDFC
    .filter(op => isDFCLeaf(op) && dfcAtiv(op.classificacao) === "fin")
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
            <h1 style={{ margin: 0, fontSize: 17, fontWeight: 600, color: "#1a1a1a" }}>Relatórios Financeiros</h1>
            <p style={{ margin: 0, fontSize: 11, color: "#444" }}>Fluxo de caixa diário com simulações · DFC formal mensal</p>
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
              {/* Abas */}
              <div style={{ display: "flex", background: "#fff", borderRadius: "12px 12px 0 0", border: "0.5px solid #D4DCE8", marginBottom: 0 }}>
                {([
                  { key: "fluxo", label: "Fluxo de Caixa" },
                  { key: "dfc",   label: "DFC — Demonstrativo de Fluxo de Caixa" },
                ] as { key: AbaFin; label: string }[]).map(a => (
                  <button key={a.key} onClick={() => setAba(a.key)} style={{
                    padding: "11px 20px", border: "none", background: "transparent", cursor: "pointer",
                    fontWeight: aba === a.key ? 600 : 400, fontSize: 13,
                    color: aba === a.key ? "#1a1a1a" : "#555",
                    borderBottom: aba === a.key ? "2px solid #1A4870" : "2px solid transparent",
                  }}>
                    {a.label}
                  </button>
                ))}
              </div>

              {/* ═══════ ABA: FLUXO DE CAIXA ═══════ */}
              {aba === "fluxo" && (() => {
                const lansFiltrados = lancamentos.filter(l => {
                  const dt = l.data_vencimento ?? l.data_lancamento ?? "";
                  if (filtro.inicio && dt < filtro.inicio) return false;
                  if (filtro.fim   && dt > filtro.fim)   return false;
                  if (filtro.contasSel.length > 0 && l.conta_bancaria && !filtro.contasSel.includes(l.conta_bancaria)) return false;
                  return true;
                });

                const lanRealizados = lansFiltrados.filter(l => l.status === "baixado");
                const lanPrevisoes  = lansFiltrados.filter(l => l.status === "em_aberto" || l.status === "vencido" || l.status === "vencendo");

                const rows: FlowRow[] = [];
                for (const l of lanRealizados) {
                  rows.push({ data: l.data_vencimento ?? l.data_lancamento ?? "", fornecedor: l.descricao ?? "", descricao: l.categoria, tipo_row: "real", entrada: l.tipo === "receber" ? l.valor : 0, saida: l.tipo === "pagar" ? l.valor : 0 });
                }
                if (incluirPrevisoes) {
                  for (const l of lanPrevisoes) {
                    rows.push({ data: l.data_vencimento ?? l.data_lancamento ?? "", fornecedor: l.descricao ?? "", descricao: l.categoria, tipo_row: "previsao", entrada: l.tipo === "receber" ? l.valor : 0, saida: l.tipo === "pagar" ? l.valor : 0 });
                  }
                }
                const simsAtivas = simulacoesAtivas ? simEntries.filter(s => s.ativo) : [];
                for (const s of simsAtivas) {
                  rows.push({ data: s.data, fornecedor: s.fornecedor, descricao: s.descricao, tipo_row: "simulacao", entrada: 0, saida: 0 });
                }
                rows.sort((a, b) => a.data.localeCompare(b.data));

                let saldoAcc = 0;
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
                const saldoFinal    = totalEntradas - totalSaidas + totalSimLiq;

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

                    {/* Painel principal */}
                    <div style={{ background: "#fff", border: "0.5px solid #D4DCE8", borderTop: "none", borderRadius: "0 0 12px 12px" }}>
                      {/* Filtros */}
                      <div style={{ padding: "12px 20px", borderBottom: "0.5px solid #DEE5EE", display: "flex", flexWrap: "wrap", gap: 10, alignItems: "flex-end" }}>
                        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                          <label style={labelStyle}>Início</label>
                          <input type="date" value={filtro.inicio} onChange={e => setFiltro(f => ({ ...f, inicio: e.target.value }))} style={{ ...inputStyle, width: 140 }} />
                        </div>
                        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                          <label style={labelStyle}>Fim</label>
                          <input type="date" value={filtro.fim} onChange={e => setFiltro(f => ({ ...f, fim: e.target.value }))} style={{ ...inputStyle, width: 140 }} />
                        </div>
                        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                          <label style={labelStyle}>Conta</label>
                          <select value={filtro.contasSel[0] ?? ""} onChange={e => setFiltro(f => ({ ...f, contasSel: e.target.value ? [e.target.value] : [] }))} style={{ ...inputStyle, width: 160 }}>
                            <option value="">Todas</option>
                            {contas.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
                          </select>
                        </div>
                        <div style={{ display: "flex", gap: 8, alignItems: "center", marginLeft: "auto", flexWrap: "wrap" }}>
                          <button onClick={() => setIncluirPrevisoes(v => !v)}
                            style={{ padding: "7px 14px", borderRadius: 8, border: `0.5px solid ${incluirPrevisoes ? "#16A34A" : "#D4DCE8"}`, background: incluirPrevisoes ? "#F0FDF4" : "#fff", color: incluirPrevisoes ? "#16A34A" : "#555", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
                            {incluirPrevisoes ? "✓" : "○"} Previsões
                          </button>
                          <button onClick={() => setSimulacoesAtivas(v => !v)}
                            style={{ padding: "7px 14px", borderRadius: 8, border: `0.5px solid ${simulacoesAtivas ? "#7C3AED" : "#D4DCE8"}`, background: simulacoesAtivas ? "#F5F3FF" : "#fff", color: simulacoesAtivas ? "#7C3AED" : "#555", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
                            {simulacoesAtivas ? "✓" : "○"} Simulações
                          </button>
                          <button onClick={() => setSimPopupAberto(true)}
                            style={{ padding: "7px 14px", borderRadius: 8, border: "0.5px solid #7C3AED", background: "#F5F3FF", color: "#7C3AED", fontSize: 12, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: 5 }}>
                            ⟳ Gerenciar{simEntries.length > 0 ? ` (${simEntries.length})` : ""}
                          </button>
                        </div>
                      </div>

                      {/* KPIs */}
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 0, borderBottom: "0.5px solid #DEE5EE" }}>
                        {[
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
                                const temPrev    = diaRows.some(r => r.tipo_row === "previsao");
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
                                      return (
                                        <tr key={`${dia}-${idx}`} style={{ background: isSim ? "#FAF5FF" : isPrev ? "#F0FDF4" : "#fff", borderBottom: "0.5px solid #F4F6FA" }}>
                                          <td />
                                          <td style={{ padding: "6px 14px 6px 28px", color: "#888", fontSize: 11, whiteSpace: "nowrap" }}>
                                            {new Date(r.data + "T12:00:00").toLocaleDateString("pt-BR")}
                                          </td>
                                          <td style={{ padding: "6px 14px", color: "#444", maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.fornecedor || "—"}</td>
                                          <td style={{ padding: "6px 14px", color: "#444", maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.descricao || "—"}</td>
                                          <td style={{ padding: "6px 14px" }}>
                                            {isSim  && <span style={{ fontSize: 10, background: "#EDE9FE", color: "#7C3AED", padding: "2px 7px", borderRadius: 10, fontWeight: 600 }}>Simulação</span>}
                                            {isPrev && <span style={{ fontSize: 10, background: "#DCFCE7", color: "#16A34A", padding: "2px 7px", borderRadius: 10, fontWeight: 600 }}>Previsão</span>}
                                            {!isSim && !isPrev && <span style={{ fontSize: 10, background: "#EFF3FA", color: "#1A4870", padding: "2px 7px", borderRadius: 10, fontWeight: 600 }}>Realizado</span>}
                                          </td>
                                          <td style={{ padding: "6px 14px", textAlign: "right", color: "#16A34A", fontWeight: 600 }}>{r.entrada > 0 ? fmtBRL(r.entrada) : ""}</td>
                                          <td style={{ padding: "6px 14px", textAlign: "right", color: "#E24B4A", fontWeight: 600 }}>{r.saida > 0 ? fmtBRL(r.saida) : ""}</td>
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
                  </>
                );
              })()}

              {/* ═══════ ABA: DFC ═══════ */}
              {aba === "dfc" && (() => {
                const COL = 14; // 1 descrição + 12 meses + 1 total

                const fmtV = (v: number) =>
                  v === 0 ? "—" : v < 0 ? `(${fmtBRL(-v)})` : fmtBRL(v);
                const corV = (v: number) =>
                  v === 0 ? "#bbb" : v > 0 ? "#16A34A" : "#E24B4A";

                // Nível de indentação pelo nº de partes do código
                const nivelOp = (c: string) => c.split(".").length - 1;

                // Célula de valor padrão
                const TdV = ({ v, bold = false, cor }: { v: number; bold?: boolean; cor?: string }) => (
                  <td style={{ padding: "7px 8px", textAlign: "right", fontSize: 11, fontWeight: bold ? 700 : 400, color: cor ?? corV(v), whiteSpace: "nowrap" }}>
                    {fmtV(v)}
                  </td>
                );

                // Linha de atividade (cabeçalho colorido)
                const AtivRow = ({ label, bg, cor }: { label: string; bg: string; cor: string }) => (
                  <tr style={{ background: bg }}>
                    <td colSpan={COL} style={{ padding: "8px 16px", fontWeight: 800, fontSize: 12, color: cor, letterSpacing: "0.02em" }}>
                      {label}
                    </td>
                  </tr>
                );

                // Linha de grupo/subgrupo com subtotais mensais
                const GrupoRow = ({ op, vals }: { op: OperacaoGerencial; vals: number[] }) => {
                  const tot = vals.reduce((s, v) => s + v, 0);
                  const nv  = nivelOp(op.classificacao);
                  return (
                    <tr style={{ background: nv === 0 ? "#F0F4FA" : "#F8FAFC", borderBottom: "0.5px solid #DEE5EE" }}>
                      <td style={{ padding: `8px 16px 8px ${16 + nv * 12}px`, fontWeight: 700, fontSize: 12, color: "#1A4870" }}>
                        <span style={{ color: "#888", marginRight: 6, fontSize: 11 }}>{op.classificacao}</span>
                        {op.descricao}
                      </td>
                      {vals.map((v, i) => <TdV key={i} v={v} bold />)}
                      <TdV v={tot} bold cor={tot >= 0 ? "#1A4870" : "#E24B4A"} />
                    </tr>
                  );
                };

                // Linha de leaf com valores individuais
                const LeafRow = ({ op }: { op: OperacaoGerencial }) => {
                  const vals = opLiqMes(op.id);
                  const tot  = vals.reduce((s, v) => s + v, 0);
                  const nv   = nivelOp(op.classificacao);
                  // ocultar linhas completamente zeradas para não poluir
                  if (tot === 0 && vals.every(v => v === 0)) return null;
                  return (
                    <tr style={{ borderBottom: "0.5px solid #F0F3FA" }}>
                      <td style={{ padding: `7px 16px 7px ${16 + nv * 12}px`, fontSize: 12, color: "#1a1a1a" }}>
                        <span style={{ color: "#999", marginRight: 6, fontSize: 10 }}>{op.classificacao}</span>
                        {op.descricao}
                      </td>
                      {vals.map((v, i) => <TdV key={i} v={v} />)}
                      <TdV v={tot} bold />
                    </tr>
                  );
                };

                // Linha de subtotal (= Caixa das Atividades X)
                const SubtotalRow = ({ label, vals, bg, cor }: { label: string; vals: number[]; bg: string; cor: string }) => {
                  const tot = vals.reduce((s, v) => s + v, 0);
                  return (
                    <tr style={{ background: bg, borderTop: "0.5px solid #DDE2EE" }}>
                      <td style={{ padding: "9px 16px", fontWeight: 700, fontSize: 12, color: cor }}>{label}</td>
                      {vals.map((v, i) => (
                        <td key={i} style={{ padding: "9px 8px", textAlign: "right", fontSize: 12, fontWeight: 700, color: v >= 0 ? cor : "#E24B4A", whiteSpace: "nowrap" }}>
                          {fmtV(v)}
                        </td>
                      ))}
                      <td style={{ padding: "9px 10px", textAlign: "right", fontSize: 12, fontWeight: 700, color: tot >= 0 ? cor : "#E24B4A", whiteSpace: "nowrap" }}>
                        {fmtV(tot)}
                      </td>
                    </tr>
                  );
                };

                // Renderiza um bloco de operações (grupos + leaves) de um conjunto filtrado
                const renderOps = (ops: OperacaoGerencial[]) =>
                  ops.map(op => isDFCLeaf(op)
                    ? <LeafRow key={op.id} op={op} />
                    : <GrupoRow key={op.id} op={op} vals={prefLiqMes(op.classificacao)} />
                  );

                return (
                  <div style={{ background: "#fff", border: "0.5px solid #D4DCE8", borderTop: "none", borderRadius: "0 0 12px 12px", overflow: "hidden" }}>

                    {/* Cabeçalho */}
                    <div style={{ padding: "14px 20px", borderBottom: "0.5px solid #DEE5EE", background: "#F8FAFD", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: 14, color: "#1a1a1a" }}>DFC — Demonstrativo de Fluxo de Caixa (Método Direto)</div>
                        <div style={{ fontSize: 11, color: "#555", marginTop: 2 }}>
                          Estruturado por Operações Gerenciais · Apenas lançamentos baixados (realizados)
                        </div>
                      </div>
                      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                        <label style={{ fontSize: 12, color: "#555" }}>Exercício:</label>
                        <select value={dfcAno} onChange={e => setDfcAno(e.target.value)}
                          style={{ padding: "6px 10px", border: "0.5px solid #D4DCE8", borderRadius: 8, fontSize: 13, cursor: "pointer" }}>
                          {anosDispo.map(a => <option key={a} value={a}>{a}</option>)}
                        </select>
                      </div>
                    </div>

                    {/* KPI cards */}
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", borderBottom: "0.5px solid #DEE5EE" }}>
                      {[
                        { label: "Caixa Operacional",   v: totOp,  cor: totOp  >= 0 ? "#0B2D50" : "#791F1F", bg: totOp  >= 0 ? "#D5E8F5" : "#FCEBEB" },
                        { label: "Caixa Investimento",  v: totInv, cor: totInv >= 0 ? "#14532D" : "#791F1F", bg: totInv >= 0 ? "#ECFDF5" : "#FCEBEB" },
                        { label: "Caixa Financiamento", v: totFin, cor: totFin >= 0 ? "#5B2D8E" : "#791F1F", bg: totFin >= 0 ? "#F3E8FF" : "#FCEBEB" },
                        { label: "Variação Líquida",    v: totVar, cor: totVar >= 0 ? "#0B2D50" : "#791F1F", bg: totVar >= 0 ? "#D5E8F5" : "#FCEBEB" },
                      ].map((k, i) => (
                        <div key={i} style={{ padding: "14px 18px", borderRight: i < 3 ? "0.5px solid #DEE5EE" : "none", background: k.bg }}>
                          <div style={{ fontSize: 10, color: "#555", marginBottom: 4 }}>{k.label}</div>
                          <div style={{ fontSize: 17, fontWeight: 700, color: k.cor }}>
                            {k.v < 0 ? `(${fmtBRL(-k.v)})` : fmtBRL(k.v)}
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Tabela hierárquica */}
                    <div style={{ overflowX: "auto" }}>
                      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, minWidth: 1080 }}>
                        <thead>
                          <tr style={{ background: "#F4F6FA" }}>
                            <th style={{ padding: "8px 16px", textAlign: "left", fontWeight: 600, fontSize: 11, color: "#555", minWidth: 260, borderBottom: "0.5px solid #DDE2EE" }}>Descrição</th>
                            {MESES_DFC.map(m => (
                              <th key={m} style={{ padding: "8px 8px", textAlign: "right", fontWeight: 600, fontSize: 11, color: "#555", borderBottom: "0.5px solid #DDE2EE", whiteSpace: "nowrap" }}>{m}</th>
                            ))}
                            <th style={{ padding: "8px 10px", textAlign: "right", fontWeight: 700, fontSize: 11, color: "#1A4870", borderBottom: "0.5px solid #DDE2EE", whiteSpace: "nowrap" }}>Total {dfcAno}</th>
                          </tr>
                        </thead>
                        <tbody>

                          {/* ── ATIVIDADES OPERACIONAIS ── */}
                          <AtivRow label="ATIVIDADES OPERACIONAIS" bg="#D5E8F5" cor="#0B2D50" />

                          {/* Grupo 1 — RECEITAS */}
                          {renderOps(opsGrupo1)}
                          <SubtotalRow label="Subtotal Receitas" vals={liqGrupo1} bg="#EBF3FC" cor="#0B2D50" />

                          {/* Grupo 2 — DESPESAS OPERACIONAIS */}
                          {renderOps(opsGrupo2)}
                          <SubtotalRow label="Subtotal Despesas Operacionais" vals={liqGrupo2} bg="#FEF3F2" cor="#791F1F" />

                          {/* = Caixa Op */}
                          <SubtotalRow label="= CAIXA DAS ATIVIDADES OPERACIONAIS" vals={liqOp} bg="#D5E8F5" cor="#0B2D50" />

                          {/* ── ATIVIDADES DE INVESTIMENTO ── */}
                          <AtivRow label="ATIVIDADES DE INVESTIMENTO" bg="#ECFDF5" cor="#14532D" />
                          {renderOps(opsGrupoInv)}
                          <SubtotalRow label="= CAIXA DAS ATIVIDADES DE INVESTIMENTO" vals={liqInv} bg="#D1FAE5" cor="#14532D" />

                          {/* ── ATIVIDADES DE FINANCIAMENTO ── */}
                          <AtivRow label="ATIVIDADES DE FINANCIAMENTO" bg="#F3E8FF" cor="#5B2D8E" />
                          {renderOps(opsGrupoFin)}
                          <SubtotalRow label="= CAIXA DAS ATIVIDADES DE FINANCIAMENTO" vals={liqFin} bg="#EDE9FE" cor="#5B2D8E" />

                          {/* ── VARIAÇÃO LÍQUIDA ── */}
                          <tr style={{ background: totVar >= 0 ? "#D5E8F5" : "#FCEBEB", borderTop: "1.5px solid #1A4870" }}>
                            <td style={{ padding: "10px 16px", fontWeight: 800, fontSize: 13, color: totVar >= 0 ? "#0B2D50" : "#791F1F" }}>
                              = VARIAÇÃO LÍQUIDA DE CAIXA NO PERÍODO
                            </td>
                            {varLiqMes.map((v, i) => (
                              <td key={i} style={{ padding: "10px 8px", textAlign: "right", fontSize: 12, fontWeight: 800, color: v >= 0 ? "#0B2D50" : "#791F1F", whiteSpace: "nowrap" }}>
                                {fmtV(v)}
                              </td>
                            ))}
                            <td style={{ padding: "10px 10px", textAlign: "right", fontSize: 13, fontWeight: 800, color: totVar >= 0 ? "#0B2D50" : "#791F1F", whiteSpace: "nowrap" }}>
                              {fmtV(totVar)}
                            </td>
                          </tr>

                          {/* Saldo acumulado */}
                          <tr style={{ background: "#F8FAFD" }}>
                            <td style={{ padding: "7px 16px", fontWeight: 600, fontSize: 11, color: "#555" }}>
                              Saldo acumulado no exercício
                            </td>
                            {saldoAcMes.map((v, i) => (
                              <td key={i} style={{ padding: "7px 8px", textAlign: "right", fontSize: 11, fontWeight: 600, color: v >= 0 ? "#1A4870" : "#E24B4A", whiteSpace: "nowrap" }}>
                                {v !== 0 ? fmtNum(v / 1000, 0) + "k" : "—"}
                              </td>
                            ))}
                            <td style={{ padding: "7px 10px", textAlign: "right", fontSize: 11, fontWeight: 700, color: totVar >= 0 ? "#1A4870" : "#E24B4A", whiteSpace: "nowrap" }}>
                              {fmtBRL(totVar)}
                            </td>
                          </tr>

                        </tbody>
                      </table>
                    </div>

                    <div style={{ padding: "10px 20px", fontSize: 10, color: "#888", borderTop: "0.5px solid #DEE5EE" }}>
                      Inclui apenas lançamentos com status "Baixado" vinculados a uma Operação Gerencial via <em>operacao_id</em>.
                      Lançamentos sem operação vinculada não são classificados. Grupos 4 e 5 (movimentos econômicos/estoque) são excluídos do DFC.
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
