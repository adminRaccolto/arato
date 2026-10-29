"use client";
import { useClienteRelatorio } from "../../../components/useClienteRelatorio";
import { useCallback, useEffect, useMemo, useState } from "react";
import TopNav from "../../../components/TopNav";
import SelectBusca from "../../../components/SelectBusca";
import { useAuth } from "../../../components/AuthProvider";
import { confirmarAcao } from "../../../components/ConfirmarAcao";
import { supabase } from "../../../lib/supabase";
import { hojeLocal } from "../../../lib/data-local";
import { nomeRelatorio } from "../../../lib/print";
import {
  listarOperacoesGerenciaisAtivasDaConta, listarPessoasDaConta, listarEmpresasDaConta, listarAnosSafra, listarCiclos,
  listarCentrosCustoGeralDaConta, listarProdutoresDaConta, listarFazendas,
} from "../../../lib/db";
import type { OperacaoGerencial, Pessoa, Empresa, AnoSafra, Ciclo, CentroCusto, Produtor, Fazenda } from "../../../lib/supabase";
import { STATUS_PREVISAO_LABEL, previsaoVencida, type StatusPrevisao, type LinhaPxR } from "../../../lib/financeiro/previsoes";

// ─── Tipos ────────────────────────────────────────────────────
type Previsao = {
  id: string; fazenda_id: string; fazenda_nome: string; produtor_id: string | null; empresa_id: string | null;
  operacao_gerencial_id: string; og_classificacao: string; og_nome: string;
  pessoa_id: string | null; pessoa_nome: string; ano_safra_id: string | null; ciclo_id: string | null; ciclo_nome: string;
  centro_custo_id: string | null; descricao: string | null; valor: number; saldo: number; data_vencimento: string;
  status: StatusPrevisao; diferenca: number | null; decisao: string | null; origem: string; consumido: number; consumos: number;
  observacao: string | null;
};
type Aba = "previsoes" | "decisao" | "vencidas" | "relatorio";

const S = {
  page:  { background: "#F4F6FA", minHeight: "100vh", fontFamily: "system-ui,sans-serif" },
  body:  { maxWidth: 1360, margin: "0 auto", padding: "20px 16px" },
  card:  { background: "#fff", border: "0.5px solid #DDE2EE", borderRadius: 12, marginBottom: 16 },
  label: { fontSize: 11, color: "#555", fontWeight: 600, display: "block", marginBottom: 4 },
  inp:   { border: "0.5px solid #DDE2EE", borderRadius: 8, padding: "7px 10px", fontSize: 13, background: "#fff", width: "100%", boxSizing: "border-box" } as React.CSSProperties,
  btn:   (bg: string, color = "#fff", borda = "none"): React.CSSProperties => ({ background: bg, color, border: borda, borderRadius: 8, padding: "7px 14px", fontSize: 13, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap" }),
  th:    { padding: "8px 10px", fontSize: 11, fontWeight: 600, color: "#555", borderBottom: "0.5px solid #DDE2EE", whiteSpace: "nowrap", background: "#F4F6FA", textAlign: "left" } as React.CSSProperties,
  td:    { padding: "7px 10px", fontSize: 13, borderBottom: "0.5px solid #F0F2F7", verticalAlign: "middle", color: "#1a1a1a" } as React.CSSProperties,
  num:   { textAlign: "right", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" } as React.CSSProperties,
  overlay: { position: "fixed", inset: 0, background: "rgba(0,0,0,.45)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 } as React.CSSProperties,
  modal: { background: "#fff", borderRadius: 12, padding: 24, width: "min(96vw,820px)", maxHeight: "92vh", overflowY: "auto" } as React.CSSProperties,
};
const STATUS_COR: Record<StatusPrevisao, { c: string; bg: string }> = {
  aberta:           { c: "#1A4870", bg: "#D5E8F5" },
  pendente_decisao: { c: "#7A4300", bg: "#FBF3E0" },
  cumprida:         { c: "#166534", bg: "#DCFCE7" },
  efetivada:        { c: "#555555", bg: "#EEF0F4" },
  cancelada:        { c: "#888888", bg: "#F4F6FA" },
};
const fmtBRL = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fmtData = (s?: string | null) => s ? s.slice(0, 10).split("-").reverse().join("/") : "—";
const MESES = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
const fmtMes = (m: string) => { const [a, mm] = m.split("-"); return `${MESES[Number(mm) - 1]}/${a.slice(2)}`; };
const numBR = (s: string) => parseFloat(String(s).replace(/\./g, "").replace(",", ".")) || 0;

const FORM_VAZIO = {
  id: "", fazenda_id: "", lado: "produtor" as "produtor" | "empresa", produtor_id: "", empresa_id: "",
  operacao_gerencial_id: "", pessoa_id: "", ano_safra_id: "", ciclo_id: "", centro_custo_id: "",
  descricao: "", valor: "", data_vencimento: "", recorrente: false, qtd: "12", freq: "1", observacao: "",
};

export default function PrevisaoGastosPage() {
  const { fazendaId, contaId, contaNome } = useAuth();
  const clienteRelatorio = useClienteRelatorio();   // nome da conta (cliente) para o nome dos relatórios
  const hoje = hojeLocal();
  const [aba, setAba] = useState<Aba>("previsoes");
  const [previsoes, setPrevisoes] = useState<Previsao[]>([]);
  const [carregando, setCarregando] = useState(false);
  const [msg, setMsg] = useState("");
  const [erro, setErro] = useState("");

  // Apoio
  const [fazendas, setFazendas] = useState<Fazenda[]>([]);
  const [ogs, setOgs] = useState<OperacaoGerencial[]>([]);
  const [pessoas, setPessoas] = useState<Pessoa[]>([]);
  const [empresas, setEmpresas] = useState<Empresa[]>([]);
  const [produtores, setProdutores] = useState<Produtor[]>([]);
  const [safras, setSafras] = useState<AnoSafra[]>([]);
  const [ciclos, setCiclos] = useState<Ciclo[]>([]);
  const [centros, setCentros] = useState<CentroCusto[]>([]);

  // Filtros da lista
  const [fStatus, setFStatus] = useState<"ativas" | "todas" | StatusPrevisao>("ativas");
  const [fBusca, setFBusca] = useState("");
  const [fDe, setFDe] = useState(`${hoje.slice(0, 4)}-01-01`);
  const [fAte, setFAte] = useState(`${hoje.slice(0, 4)}-12-31`);
  const [visao, setVisao] = useState<"lista" | "grade">("lista");

  // Modal
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState(FORM_VAZIO);
  const [salvando, setSalvando] = useState(false);

  // Vencidas / config
  const [novaData, setNovaData] = useState<Record<string, string>>({});
  const [tolPct, setTolPct] = useState("0");
  const [tolValor, setTolValor] = useState("0");

  // Relatório
  const [rDe, setRDe] = useState(`${hoje.slice(0, 4)}-01-01`);
  const [rAte, setRAte] = useState(`${hoje.slice(0, 4)}-12-31`);
  const [rLeitura, setRLeitura] = useState<"vencimento" | "competencia" | "caixa">("vencimento");
  const [rPorMes, setRPorMes] = useState(false);
  const [rLinhas, setRLinhas] = useState<LinhaPxR[]>([]);
  const [rNomes, setRNomes] = useState<Record<string, string>>({});
  const [rCarregando, setRCarregando] = useState(false);

  const api = useCallback(async (body: Record<string, unknown>) => {
    const { data: { session } } = await supabase.auth.getSession();
    const r = await fetch("/api/financeiro/previsoes", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token ?? ""}` },
      body: JSON.stringify({ fazenda_id: fazendaId, ...body }),
    });
    const j = await r.json();
    if (!r.ok || !j.ok) throw new Error(j.error ?? "Erro na Previsão de Gastos");
    return j;
  }, [fazendaId]);

  const carregar = useCallback(async () => {
    if (!fazendaId) return;
    setCarregando(true); setErro("");
    try {
      const j = await api({ operacao: "listar" });
      setPrevisoes(j.previsoes as Previsao[]);
    } catch (e) { setErro(e instanceof Error ? e.message : String(e)); }
    finally { setCarregando(false); }
  }, [api, fazendaId]);

  useEffect(() => { carregar(); }, [carregar]);
  useEffect(() => {
    if (!fazendaId) return;
    listarFazendas(fazendaId).then(setFazendas).catch(() => {});
    listarOperacoesGerenciaisAtivasDaConta({ tipo: "despesa" }, fazendaId).then(lista => {
      const vistas = new Set<string>();
      setOgs(lista.filter(o => { const c = o.classificacao ?? ""; if (!c || c.startsWith("1.") || vistas.has(c)) return false; vistas.add(c); return true; }));
    }).catch(() => {});
    listarPessoasDaConta(fazendaId).then(setPessoas).catch(() => {});
    listarAnosSafra(fazendaId).then(setSafras).catch(() => {});
    listarCentrosCustoGeralDaConta(fazendaId).then(setCentros).catch(() => {});
    api({ operacao: "config" }).then(j => { setTolPct(String(j.tolerancia?.pct ?? 0)); setTolValor(String(j.tolerancia?.valor ?? 0)); }).catch(() => {});
  }, [fazendaId, api]);
  useEffect(() => {
    if (contaId) listarProdutoresDaConta(contaId).then(setProdutores).catch(() => {});
  }, [contaId]);
  useEffect(() => {
    if (fazendas.length) listarEmpresasDaConta(fazendas.map(f => f.id)).then(setEmpresas).catch(() => {});
  }, [fazendas]);
  useEffect(() => {
    if (!form.ano_safra_id) { setCiclos([]); return; }
    listarCiclos(form.ano_safra_id, form.fazenda_id || fazendaId).then(setCiclos).catch(() => setCiclos([]));
  }, [form.ano_safra_id, form.fazenda_id, fazendaId]);

  // ─── Derivados ───────────────────────────────────────────────
  const pendentes = useMemo(() => previsoes.filter(p => p.status === "pendente_decisao"), [previsoes]);
  const vencidas = useMemo(() => previsoes.filter(p => previsaoVencida(p, hoje)), [previsoes, hoje]);
  const lista = useMemo(() => {
    const b = fBusca.trim().toLowerCase();
    return previsoes.filter(p => {
      if (fStatus === "ativas" && !(p.status === "aberta" || p.status === "pendente_decisao")) return false;
      if (fStatus !== "ativas" && fStatus !== "todas" && p.status !== fStatus) return false;
      if (fDe && p.data_vencimento < fDe) return false;
      if (fAte && p.data_vencimento > fAte) return false;
      if (b && !`${p.og_classificacao} ${p.og_nome} ${p.pessoa_nome} ${p.descricao ?? ""} ${p.ciclo_nome}`.toLowerCase().includes(b)) return false;
      return true;
    });
  }, [previsoes, fStatus, fBusca, fDe, fAte]);
  const grade = useMemo(() => {
    const meses = [...new Set(lista.map(p => p.data_vencimento.slice(0, 7)))].sort();
    const linhas = new Map<string, { og: string; nome: string; porMes: Record<string, number>; total: number }>();
    for (const p of lista) {
      const l = linhas.get(p.og_classificacao) ?? { og: p.og_classificacao, nome: p.og_nome, porMes: {}, total: 0 };
      const m = p.data_vencimento.slice(0, 7);
      l.porMes[m] = (l.porMes[m] ?? 0) + p.valor;
      l.total += p.valor;
      linhas.set(p.og_classificacao, l);
    }
    return { meses, linhas: [...linhas.values()].sort((a, b) => a.og.localeCompare(b.og)) };
  }, [lista]);

  // ─── Ações ───────────────────────────────────────────────────
  function abrirNova() {
    setForm({ ...FORM_VAZIO, fazenda_id: fazendaId ?? "", data_vencimento: hoje });
    setErro(""); setModal(true);
  }
  function abrirEdicao(p: Previsao) {
    setForm({
      ...FORM_VAZIO, id: p.id, fazenda_id: p.fazenda_id, lado: p.empresa_id ? "empresa" : "produtor",
      produtor_id: p.produtor_id ?? "", empresa_id: p.empresa_id ?? "", operacao_gerencial_id: p.operacao_gerencial_id,
      pessoa_id: p.pessoa_id ?? "", ano_safra_id: p.ano_safra_id ?? "", ciclo_id: p.ciclo_id ?? "", centro_custo_id: p.centro_custo_id ?? "",
      descricao: p.descricao ?? "", valor: p.valor.toLocaleString("pt-BR", { minimumFractionDigits: 2 }), data_vencimento: p.data_vencimento,
      observacao: p.observacao ?? "",
    });
    setErro(""); setModal(true);
  }

  async function salvar() {
    const valor = numBR(form.valor);
    const faltam: string[] = [];
    if (!form.fazenda_id) faltam.push("fazenda");
    if (!form.operacao_gerencial_id) faltam.push("Operação Gerencial");
    if (!(valor > 0)) faltam.push("valor");
    if (!form.data_vencimento) faltam.push("vencimento");
    if (form.lado === "empresa" && !form.empresa_id) faltam.push("empresa");
    if (faltam.length) { setErro(`Informe: ${faltam.join(", ")}.`); return; }
    const qtd = form.recorrente ? Math.max(2, Math.min(120, parseInt(form.qtd) || 0)) : 1;
    if (!(await confirmarAcao({
      titulo: form.id ? "Salvar previsão" : "Lançar previsão",
      mensagem: form.id ? "A previsão e o título de previsão no Contas a Pagar serão atualizados."
        : `${qtd > 1 ? `${qtd} previsões serão lançadas` : "A previsão será lançada"} no módulo, no Contas a Pagar e no fluxo de caixa (como previsão).`,
      perigo: false,
    }))) return;
    setSalvando(true); setErro("");
    const campos = {
      fazenda_id: form.fazenda_id,
      produtor_id: form.lado === "produtor" ? (form.produtor_id || null) : null,
      empresa_id: form.lado === "empresa" ? form.empresa_id : null,
      operacao_gerencial_id: form.operacao_gerencial_id, pessoa_id: form.pessoa_id || null,
      ano_safra_id: form.ano_safra_id || null, ciclo_id: form.ciclo_id || null, centro_custo_id: form.centro_custo_id || null,
      descricao: form.descricao.trim() || null, valor, data_vencimento: form.data_vencimento, observacao: form.observacao.trim() || null,
    };
    try {
      if (form.id) await api({ operacao: "editar", id: form.id, campos });
      else await api({ operacao: "criar", linha: campos, recorrencia: form.recorrente ? { qtd, freq: parseInt(form.freq) || 1 } : undefined });
      setModal(false);
      setMsg(form.id ? "Previsão atualizada." : qtd > 1 ? `${qtd} previsões lançadas.` : "Previsão lançada.");
      await carregar();
    } catch (e) { setErro(e instanceof Error ? e.message : String(e)); }
    finally { setSalvando(false); }
  }

  async function acao(body: Record<string, unknown>, titulo: string, mensagem: string, ok: string) {
    if (!(await confirmarAcao({ titulo, mensagem, perigo: false }))) return;
    setErro("");
    try { await api(body); setMsg(ok); await carregar(); }
    catch (e) { setErro(e instanceof Error ? e.message : String(e)); }
  }

  async function salvarTolerancia() {
    setErro("");
    try {
      await api({ operacao: "salvar_config", tolerancia_pct: numBR(tolPct), tolerancia_valor: numBR(tolValor) });
      setMsg("Tolerância salva.");
    } catch (e) { setErro(e instanceof Error ? e.message : String(e)); }
  }

  async function gerarRelatorio() {
    setRCarregando(true); setErro("");
    try {
      const j = await api({ operacao: "relatorio", de: rDe, ate: rAte, leitura: rLeitura });
      setRLinhas(j.linhas as LinhaPxR[]); setRNomes(j.og_nome ?? {});
    } catch (e) { setErro(e instanceof Error ? e.message : String(e)); }
    finally { setRCarregando(false); }
  }

  const rAgrupado = useMemo(() => {
    if (rPorMes) return rLinhas;
    const m = new Map<string, LinhaPxR>();
    for (const l of rLinhas) {
      const a = m.get(l.og) ?? { og: l.og, mes: "", previsto: 0, realizado: 0, desvio: 0, semPrevisao: true };
      a.previsto += l.previsto; a.realizado += l.realizado; a.desvio += l.desvio; a.semPrevisao = a.semPrevisao && l.semPrevisao;
      m.set(l.og, a);
    }
    return [...m.values()].sort((a, b) => a.og.localeCompare(b.og));
  }, [rLinhas, rPorMes]);
  const rTotal = useMemo(() => rAgrupado.reduce((t, l) => ({ p: t.p + l.previsto, r: t.r + l.realizado }), { p: 0, r: 0 }), [rAgrupado]);

  async function exportarXlsx() {
    const XLSX = await import("xlsx");
    const linhas = rAgrupado.map(l => ({
      "Classificação": l.og, "Operação Gerencial": rNomes[l.og] ?? "", ...(rPorMes ? { "Mês": fmtMes(l.mes) } : {}),
      "Previsto": l.previsto, "Realizado": l.realizado, "Desvio (Previsto − Realizado)": l.desvio,
      "% Realizado": l.previsto > 0 ? Math.round(l.realizado / l.previsto * 1000) / 10 : null, "Sem previsão": l.semPrevisao ? "Sim" : "",
    }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(linhas), "Previsto x Realizado");
    XLSX.writeFile(wb, `${nomeRelatorio("PREVISTO X REALIZADO", clienteRelatorio, rDe, rAte)}.xlsx`);
  }

  // ─── Render ──────────────────────────────────────────────────
  const tabBtn = (id: Aba, label: string, n?: number) => (
    <button key={id} onClick={() => setAba(id)} style={{
      background: "none", border: "none", borderBottom: aba === id ? "2px solid #1A4870" : "2px solid transparent",
      color: aba === id ? "#1A4870" : "#555", fontWeight: aba === id ? 600 : 400, fontSize: 14, padding: "10px 14px", cursor: "pointer",
    }}>
      {label}{n ? <span style={{ marginLeft: 6, fontSize: 11, fontWeight: 600, background: "#FBF3E0", color: "#7A4300", borderRadius: 10, padding: "1px 7px" }}>{n}</span> : null}
    </button>
  );
  const badge = (s: StatusPrevisao) => (
    <span style={{ fontSize: 11, fontWeight: 600, color: STATUS_COR[s].c, background: STATUS_COR[s].bg, borderRadius: 6, padding: "2px 8px", whiteSpace: "nowrap" }}>{STATUS_PREVISAO_LABEL[s]}</span>
  );
  const ogOptions = ogs.map(o => ({ value: o.id, label: `${o.classificacao} · ${o.descricao}` }));

  return (
    <div style={S.page}>
      <TopNav />
      <div style={S.body}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginBottom: 8 }}>
          <div>
            <h1 style={{ fontSize: 17, fontWeight: 600, color: "#1a1a1a", margin: 0 }}>Previsão de Gastos</h1>
            <div style={{ fontSize: 12, color: "#666", marginTop: 2 }}>Previsto por Operação Gerencial, consumido pelos gastos reais (NF, CP manual, folha).</div>
          </div>
          {aba === "previsoes" && <button onClick={abrirNova} style={S.btn("#1A4870")}>+ Nova Previsão</button>}
        </div>

        <div style={{ display: "flex", gap: 4, borderBottom: "0.5px solid #DDE2EE", marginBottom: 16, overflowX: "auto" }}>
          {tabBtn("previsoes", "Previsões")}
          {tabBtn("decisao", "Decisão do Gestor", pendentes.length)}
          {tabBtn("vencidas", "Previsões Vencidas", vencidas.length)}
          {tabBtn("relatorio", "Previsto × Realizado")}
        </div>

        {msg && <div style={{ background: "#DCFCE7", color: "#166534", border: "0.5px solid #86EFAC", borderRadius: 8, padding: "8px 12px", fontSize: 13, marginBottom: 12, display: "flex", justifyContent: "space-between" }}>{msg}<button onClick={() => setMsg("")} style={{ background: "none", border: "none", cursor: "pointer", color: "#166534" }}>✕</button></div>}
        {erro && !modal && <div style={{ background: "#FCEBEB", color: "#791F1F", border: "0.5px solid #F5C6C6", borderRadius: 8, padding: "8px 12px", fontSize: 13, marginBottom: 12 }}>{erro}</div>}

        {/* ══════ PREVISÕES ══════ */}
        {aba === "previsoes" && (
          <div style={S.card}>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end", padding: 14, borderBottom: "0.5px solid #DDE2EE" }}>
              <div style={{ minWidth: 150 }}>
                <label style={S.label}>Situação</label>
                <select value={fStatus} onChange={e => setFStatus(e.target.value as typeof fStatus)} style={S.inp}>
                  <option value="ativas">Abertas e aguardando gestor</option>
                  <option value="todas">Todas</option>
                  {(Object.keys(STATUS_PREVISAO_LABEL) as StatusPrevisao[]).map(s => <option key={s} value={s}>{STATUS_PREVISAO_LABEL[s]}</option>)}
                </select>
              </div>
              <div><label style={S.label}>Vencimento de</label><input type="date" value={fDe} onChange={e => setFDe(e.target.value)} style={S.inp} /></div>
              <div><label style={S.label}>até</label><input type="date" value={fAte} onChange={e => setFAte(e.target.value)} style={S.inp} /></div>
              <div style={{ flex: 1, minWidth: 200 }}><label style={S.label}>Buscar</label><input value={fBusca} onChange={e => setFBusca(e.target.value)} placeholder="OG, fornecedor, ciclo, descrição…" style={S.inp} /></div>
              <div style={{ display: "flex", border: "0.5px solid #DDE2EE", borderRadius: 8, overflow: "hidden" }}>
                {(["lista", "grade"] as const).map(v => (
                  <button key={v} onClick={() => setVisao(v)} style={{ ...S.btn(visao === v ? "#D5E8F5" : "#fff", visao === v ? "#0B2D50" : "#555"), borderRadius: 0 }}>{v === "lista" ? "Lista" : "Grade OG × mês"}</button>
                ))}
              </div>
            </div>
            {carregando ? <div style={{ padding: 24, fontSize: 13, color: "#666" }}>Carregando…</div>
              : lista.length === 0 ? <div style={{ padding: 24, fontSize: 13, color: "#666" }}>Nenhuma previsão no filtro. Use + Nova Previsão para lançar.</div>
              : visao === "lista" ? (
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead><tr>
                      <th style={S.th}>Vencimento</th><th style={S.th}>Operação Gerencial</th><th style={S.th}>Fornecedor</th>
                      <th style={S.th}>Ciclo</th><th style={S.th}>Descrição</th><th style={{ ...S.th, textAlign: "right" }}>Previsto</th>
                      <th style={{ ...S.th, textAlign: "right" }}>Consumido</th><th style={{ ...S.th, textAlign: "right" }}>Saldo</th>
                      <th style={S.th}>Situação</th><th style={S.th}></th>
                    </tr></thead>
                    <tbody>
                      {lista.map(p => {
                        const editavel = p.status === "aberta" && p.consumos === 0 && p.origem !== "folha";
                        return (
                          <tr key={p.id}>
                            <td style={{ ...S.td, color: previsaoVencida(p, hoje) ? "#E24B4A" : "#1a1a1a", whiteSpace: "nowrap" }}>{fmtData(p.data_vencimento)}</td>
                            <td style={S.td}><span style={{ color: "#666", fontSize: 11 }}>{p.og_classificacao}</span> {p.og_nome}</td>
                            <td style={S.td}>{p.pessoa_nome || "—"}</td>
                            <td style={S.td}>{p.ciclo_nome || "—"}</td>
                            <td style={S.td}>{p.descricao || "—"}{p.origem === "folha" && <span style={{ marginLeft: 6, fontSize: 10, color: "#1A4870", background: "#D5E8F5", borderRadius: 4, padding: "1px 5px" }}>Folha</span>}</td>
                            <td style={{ ...S.td, ...S.num }}>{fmtBRL(p.valor)}</td>
                            <td style={{ ...S.td, ...S.num }}>{p.consumido ? fmtBRL(p.consumido) : "—"}</td>
                            <td style={{ ...S.td, ...S.num, fontWeight: 600 }}>{p.saldo > 0 ? fmtBRL(p.saldo) : "—"}</td>
                            <td style={S.td}>{badge(p.status)}</td>
                            <td style={{ ...S.td, whiteSpace: "nowrap" }}>
                              {editavel && <>
                                <button onClick={() => abrirEdicao(p)} style={{ ...S.btn("#F4F6FA", "#1A4870"), padding: "4px 10px", fontSize: 12, marginRight: 6 }}>Editar</button>
                                <button onClick={() => acao({ operacao: "cancelar", id: p.id }, "Cancelar previsão", "A previsão sai do Contas a Pagar e do fluxo de caixa e deixa de contar no Previsto. A linha fica registrada como cancelada.", "Previsão cancelada.")} style={{ ...S.btn("#FEE2E2", "#B91C1C"), padding: "4px 10px", fontSize: 12 }}>Cancelar</button>
                              </>}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot><tr>
                      <td style={{ ...S.td, fontWeight: 600 }} colSpan={5}>Total ({lista.length})</td>
                      <td style={{ ...S.td, ...S.num, fontWeight: 600 }}>{fmtBRL(lista.reduce((s, p) => s + p.valor, 0))}</td>
                      <td style={{ ...S.td, ...S.num, fontWeight: 600 }}>{fmtBRL(lista.reduce((s, p) => s + p.consumido, 0))}</td>
                      <td style={{ ...S.td, ...S.num, fontWeight: 600 }}>{fmtBRL(lista.reduce((s, p) => s + p.saldo, 0))}</td>
                      <td style={S.td} colSpan={2}></td>
                    </tr></tfoot>
                  </table>
                </div>
              ) : (
                <div style={{ overflowX: "auto" }}>
                  <table style={{ borderCollapse: "collapse", minWidth: "100%" }}>
                    <thead><tr>
                      <th style={{ ...S.th, position: "sticky", left: 0, zIndex: 1 }}>Operação Gerencial</th>
                      {grade.meses.map(m => <th key={m} style={{ ...S.th, textAlign: "right" }}>{fmtMes(m)}</th>)}
                      <th style={{ ...S.th, textAlign: "right" }}>Total</th>
                    </tr></thead>
                    <tbody>
                      {grade.linhas.map(l => (
                        <tr key={l.og}>
                          <td style={{ ...S.td, position: "sticky", left: 0, background: "#fff", whiteSpace: "nowrap" }}><span style={{ color: "#666", fontSize: 11 }}>{l.og}</span> {l.nome}</td>
                          {grade.meses.map(m => <td key={m} style={{ ...S.td, ...S.num }}>{l.porMes[m] ? fmtBRL(l.porMes[m]) : ""}</td>)}
                          <td style={{ ...S.td, ...S.num, fontWeight: 600 }}>{fmtBRL(l.total)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
          </div>
        )}

        {/* ══════ DECISÃO DO GESTOR ══════ */}
        {aba === "decisao" && (
          <>
            <div style={{ ...S.card, padding: 14, display: "flex", gap: 12, alignItems: "flex-end", flexWrap: "wrap" }}>
              <div style={{ fontSize: 12, color: "#555", flex: "1 1 280px" }}>
                Tolerância: diferença até este limite é efetivada sozinha e não vem para esta aba. Vale o maior dos dois.
              </div>
              <div style={{ width: 110 }}><label style={S.label}>% do previsto</label><input value={tolPct} onChange={e => setTolPct(e.target.value)} style={{ ...S.inp, textAlign: "right" }} /></div>
              <div style={{ width: 130 }}><label style={S.label}>ou R$</label><input value={tolValor} onChange={e => setTolValor(e.target.value)} style={{ ...S.inp, textAlign: "right" }} /></div>
              <button onClick={salvarTolerancia} style={S.btn("#1A4870")}>Salvar tolerância</button>
            </div>
            <div style={S.card}>
              {pendentes.length === 0 ? <div style={{ padding: 24, fontSize: 13, color: "#666" }}>Nenhuma diferença aguardando decisão.</div> : (
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead><tr>
                      <th style={S.th}>Vencimento</th><th style={S.th}>Operação Gerencial</th><th style={S.th}>Fornecedor / descrição</th>
                      <th style={{ ...S.th, textAlign: "right" }}>Previsto</th><th style={{ ...S.th, textAlign: "right" }}>Realizado</th>
                      <th style={{ ...S.th, textAlign: "right" }}>Diferença</th><th style={S.th}>Decisão</th>
                    </tr></thead>
                    <tbody>
                      {pendentes.map(p => {
                        const dif = p.diferenca ?? 0;
                        return (
                          <tr key={p.id}>
                            <td style={S.td}>{fmtData(p.data_vencimento)}</td>
                            <td style={S.td}><span style={{ color: "#666", fontSize: 11 }}>{p.og_classificacao}</span> {p.og_nome}</td>
                            <td style={S.td}>{[p.pessoa_nome, p.descricao].filter(Boolean).join(" · ") || "—"}</td>
                            <td style={{ ...S.td, ...S.num }}>{fmtBRL(p.valor)}</td>
                            <td style={{ ...S.td, ...S.num }}>{fmtBRL(p.consumido)}</td>
                            <td style={{ ...S.td, ...S.num, fontWeight: 600, color: dif > 0 ? "#16A34A" : "#E24B4A" }}>
                              {dif > 0 ? `Sobra ${fmtBRL(dif)}` : `Excesso ${fmtBRL(-dif)}`}
                            </td>
                            <td style={{ ...S.td, whiteSpace: "nowrap" }}>
                              <button onClick={() => acao({ operacao: "decidir", id: p.id, decisao: "efetivada" }, "Efetivar diferença",
                                dif > 0 ? `A sobra de ${fmtBRL(dif)} vira desvio e sai do Contas a Pagar e do fluxo de caixa.` : `O excesso de ${fmtBRL(-dif)} fica registrado como desvio.`,
                                "Diferença efetivada.")} style={{ ...S.btn("#1A4870"), padding: "5px 12px", fontSize: 12, marginRight: 6 }}>Efetivar (desvio)</button>
                              {dif > 0 && <button onClick={() => acao({ operacao: "decidir", id: p.id, decisao: "saldo" }, "Manter saldo",
                                `Os ${fmtBRL(dif)} continuam previstos no Contas a Pagar e no fluxo de caixa, para serem consumidos depois.`, "Saldo mantido como previsão.")}
                                style={{ ...S.btn("#FBF3E0", "#7A4300", "0.5px solid #C9921B"), padding: "5px 12px", fontSize: 12 }}>Manter saldo</button>}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        )}

        {/* ══════ VENCIDAS ══════ */}
        {aba === "vencidas" && (
          <div style={S.card}>
            {vencidas.length === 0 ? <div style={{ padding: 24, fontSize: 13, color: "#666" }}>Nenhuma previsão vencida.</div> : (
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead><tr>
                    <th style={S.th}>Vencimento</th><th style={S.th}>Operação Gerencial</th><th style={S.th}>Fornecedor / descrição</th>
                    <th style={{ ...S.th, textAlign: "right" }}>Saldo previsto</th><th style={S.th}>Nova data</th><th style={S.th}></th>
                  </tr></thead>
                  <tbody>
                    {vencidas.map(p => (
                      <tr key={p.id}>
                        <td style={{ ...S.td, color: "#E24B4A" }}>{fmtData(p.data_vencimento)}</td>
                        <td style={S.td}><span style={{ color: "#666", fontSize: 11 }}>{p.og_classificacao}</span> {p.og_nome}</td>
                        <td style={S.td}>{[p.pessoa_nome, p.descricao].filter(Boolean).join(" · ") || "—"}</td>
                        <td style={{ ...S.td, ...S.num, fontWeight: 600 }}>{fmtBRL(p.saldo)}</td>
                        <td style={S.td}><input type="date" value={novaData[p.id] ?? ""} min={hoje} onChange={e => setNovaData(v => ({ ...v, [p.id]: e.target.value }))} style={{ ...S.inp, width: 150 }} /></td>
                        <td style={{ ...S.td, whiteSpace: "nowrap" }}>
                          <button disabled={!novaData[p.id]} onClick={() => acao({ operacao: "vencida", id: p.id, acao: "nova_data", data: novaData[p.id] }, "Alterar vencimento",
                            `A previsão passa a vencer em ${fmtData(novaData[p.id])} no Contas a Pagar e no fluxo de caixa.`, "Vencimento alterado.")}
                            style={{ ...S.btn(novaData[p.id] ? "#1A4870" : "#C8CFDC"), padding: "5px 12px", fontSize: 12, marginRight: 6 }}>Alterar data</button>
                          <button onClick={() => acao({ operacao: "vencida", id: p.id, acao: "efetivar" }, "Efetivar previsão vencida",
                            `A previsão é encerrada sem gasto: os ${fmtBRL(p.saldo)} viram desvio e saem do Contas a Pagar e do fluxo de caixa.`, "Previsão efetivada.")}
                            style={{ ...S.btn("#FBF3E0", "#7A4300", "0.5px solid #C9921B"), padding: "5px 12px", fontSize: 12 }}>Efetivar (desvio)</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ══════ PREVISTO × REALIZADO ══════ */}
        {aba === "relatorio" && (
          <div style={S.card}>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end", padding: 14, borderBottom: "0.5px solid #DDE2EE" }}>
              <div><label style={S.label}>De</label><input type="date" value={rDe} onChange={e => setRDe(e.target.value)} style={S.inp} /></div>
              <div><label style={S.label}>Até</label><input type="date" value={rAte} onChange={e => setRAte(e.target.value)} style={S.inp} /></div>
              <div style={{ minWidth: 220 }}>
                <label style={S.label}>Realizado pela data de</label>
                <select value={rLeitura} onChange={e => setRLeitura(e.target.value as typeof rLeitura)} style={S.inp}>
                  <option value="vencimento">Vencimento do título</option>
                  <option value="competencia">Lançamento (competência)</option>
                  <option value="caixa">Pagamento (caixa)</option>
                </select>
              </div>
              <label style={{ fontSize: 13, color: "#555", display: "flex", alignItems: "center", gap: 6, paddingBottom: 8 }}>
                <input type="checkbox" checked={rPorMes} onChange={e => setRPorMes(e.target.checked)} /> Abrir por mês
              </label>
              <button onClick={gerarRelatorio} style={S.btn("#1A4870")} disabled={rCarregando}>{rCarregando ? "Gerando…" : "Gerar"}</button>
              {rAgrupado.length > 0 && <button onClick={exportarXlsx} style={S.btn("#F4F6FA", "#1A4870", "0.5px solid #DDE2EE")}>Excel</button>}
            </div>
            {rAgrupado.length === 0 ? <div style={{ padding: 24, fontSize: 13, color: "#666" }}>Escolha o período e clique em Gerar.</div> : (
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead><tr>
                    <th style={S.th}>Operação Gerencial</th>{rPorMes && <th style={S.th}>Mês</th>}
                    <th style={{ ...S.th, textAlign: "right" }}>Previsto</th><th style={{ ...S.th, textAlign: "right" }}>Realizado</th>
                    <th style={{ ...S.th, textAlign: "right" }}>Desvio</th><th style={{ ...S.th, textAlign: "right" }}>% realizado</th>
                  </tr></thead>
                  <tbody>
                    {rAgrupado.map(l => {
                      const pct = l.previsto > 0 ? l.realizado / l.previsto * 100 : null;
                      const cor = pct == null ? "#EF9F27" : pct <= 100 ? "#16A34A" : pct <= 110 ? "#EF9F27" : "#E24B4A";
                      return (
                        <tr key={`${l.og}|${l.mes}`}>
                          <td style={S.td}>
                            <span style={{ color: "#666", fontSize: 11 }}>{l.og}</span> {rNomes[l.og] ?? ""}
                            {l.semPrevisao && <span style={{ marginLeft: 6, fontSize: 10, fontWeight: 600, color: "#7A4300", background: "#FBF3E0", borderRadius: 4, padding: "1px 5px" }}>sem previsão</span>}
                          </td>
                          {rPorMes && <td style={S.td}>{fmtMes(l.mes)}</td>}
                          <td style={{ ...S.td, ...S.num }}>{fmtBRL(l.previsto)}</td>
                          <td style={{ ...S.td, ...S.num }}>{fmtBRL(l.realizado)}</td>
                          <td style={{ ...S.td, ...S.num, fontWeight: 600, color: l.desvio >= 0 ? "#16A34A" : "#E24B4A" }}>{fmtBRL(l.desvio)}</td>
                          <td style={{ ...S.td, ...S.num }}>
                            <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: 4, background: cor, marginRight: 6 }} />
                            {pct == null ? "—" : `${pct.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot><tr>
                    <td style={{ ...S.td, fontWeight: 600 }} colSpan={rPorMes ? 2 : 1}>Total</td>
                    <td style={{ ...S.td, ...S.num, fontWeight: 600 }}>{fmtBRL(rTotal.p)}</td>
                    <td style={{ ...S.td, ...S.num, fontWeight: 600 }}>{fmtBRL(rTotal.r)}</td>
                    <td style={{ ...S.td, ...S.num, fontWeight: 600, color: rTotal.p - rTotal.r >= 0 ? "#16A34A" : "#E24B4A" }}>{fmtBRL(rTotal.p - rTotal.r)}</td>
                    <td style={{ ...S.td, ...S.num, fontWeight: 600 }}>{rTotal.p > 0 ? `${(rTotal.r / rTotal.p * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%` : "—"}</td>
                  </tr></tfoot>
                </table>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ══════ MODAL NOVA / EDITAR ══════ */}
      {modal && (
        <div style={S.overlay} onClick={() => !salvando && setModal(false)}>
          <div style={S.modal} onClick={e => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <div style={{ fontSize: 16, fontWeight: 600, color: "#1a1a1a" }}>{form.id ? "Editar Previsão" : "Nova Previsão de Gasto"}</div>
              <button onClick={() => setModal(false)} style={{ background: "none", border: "none", fontSize: 18, cursor: "pointer", color: "#555" }}>✕</button>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 }}>
              <div style={{ gridColumn: "1 / -1" }}>
                <label style={S.label}>Operação Gerencial *</label>
                <SelectBusca value={form.operacao_gerencial_id} onChange={v => setForm(f => ({ ...f, operacao_gerencial_id: v }))} options={ogOptions} placeholder="Selecione a OG (pode ser um grupo)" />
              </div>
              <div>
                <label style={S.label}>Fazenda *</label>
                <select value={form.fazenda_id} onChange={e => setForm(f => ({ ...f, fazenda_id: e.target.value }))} style={S.inp}>
                  <option value="">— Selecione —</option>
                  {fazendas.map(fz => <option key={fz.id} value={fz.id}>{fz.nome}</option>)}
                </select>
              </div>
              <div>
                <label style={S.label}>Lançar no financeiro de</label>
                <select value={form.lado} onChange={e => setForm(f => ({ ...f, lado: e.target.value as "produtor" | "empresa" }))} style={S.inp}>
                  <option value="produtor">Produtor</option>
                  <option value="empresa">Empresa</option>
                </select>
              </div>
              {form.lado === "produtor" ? (
                <div>
                  <label style={S.label}>Produtor</label>
                  <select value={form.produtor_id} onChange={e => setForm(f => ({ ...f, produtor_id: e.target.value }))} style={S.inp}>
                    <option value="">— Sem produtor —</option>
                    {produtores.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
                  </select>
                </div>
              ) : (
                <div>
                  <label style={S.label}>Empresa *</label>
                  <select value={form.empresa_id} onChange={e => setForm(f => ({ ...f, empresa_id: e.target.value }))} style={S.inp}>
                    <option value="">— Selecione —</option>
                    {empresas.map(e => <option key={e.id} value={e.id}>{(e as { nome_fantasia?: string }).nome_fantasia || (e as { razao_social?: string }).razao_social}</option>)}
                  </select>
                </div>
              )}
              <div>
                <label style={S.label}>Fornecedor (opcional)</label>
                <SelectBusca value={form.pessoa_id} onChange={v => setForm(f => ({ ...f, pessoa_id: v }))} options={[{ value: "", label: "— Sem fornecedor —" }, ...pessoas.map(p => ({ value: p.id, label: p.nome }))]} />
              </div>
              <div>
                <label style={S.label}>Ano Safra</label>
                <select value={form.ano_safra_id} onChange={e => setForm(f => ({ ...f, ano_safra_id: e.target.value, ciclo_id: "" }))} style={S.inp}>
                  <option value="">— Pela data de vencimento —</option>
                  {safras.map(s => <option key={s.id} value={s.id}>{s.descricao}</option>)}
                </select>
              </div>
              <div>
                <label style={S.label}>Ciclo</label>
                <select value={form.ciclo_id} onChange={e => setForm(f => ({ ...f, ciclo_id: e.target.value }))} style={S.inp} disabled={!form.ano_safra_id}>
                  <option value="">— Nenhum —</option>
                  {ciclos.map(c => <option key={c.id} value={c.id}>{c.descricao || c.cultura}</option>)}
                </select>
              </div>
              <div>
                <label style={S.label}>Centro de custo</label>
                <select value={form.centro_custo_id} onChange={e => setForm(f => ({ ...f, centro_custo_id: e.target.value }))} style={S.inp}>
                  <option value="">— Nenhum —</option>
                  {centros.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
                </select>
              </div>
              <div style={{ gridColumn: "1 / -1" }}>
                <label style={S.label}>Descrição</label>
                <input value={form.descricao} onChange={e => setForm(f => ({ ...f, descricao: e.target.value }))} placeholder="Ex.: Manutenção preventiva da frota" style={S.inp} />
              </div>
              <div>
                <label style={S.label}>Valor previsto (R$) *</label>
                <input value={form.valor} onChange={e => setForm(f => ({ ...f, valor: e.target.value }))} placeholder="0,00" style={{ ...S.inp, textAlign: "right" }} />
              </div>
              <div>
                <label style={S.label}>{form.recorrente ? "1º vencimento *" : "Vencimento *"}</label>
                <input type="date" value={form.data_vencimento} onChange={e => setForm(f => ({ ...f, data_vencimento: e.target.value }))} style={S.inp} />
              </div>
              {!form.id && (
                <div style={{ gridColumn: "1 / -1", display: "flex", gap: 12, alignItems: "flex-end", flexWrap: "wrap", background: "#F4F6FA", borderRadius: 8, padding: 12 }}>
                  <label style={{ fontSize: 13, color: "#1a1a1a", display: "flex", alignItems: "center", gap: 6, paddingBottom: 8 }}>
                    <input type="checkbox" checked={form.recorrente} onChange={e => setForm(f => ({ ...f, recorrente: e.target.checked }))} /> Repetir (recorrência)
                  </label>
                  {form.recorrente && <>
                    <div style={{ width: 120 }}><label style={S.label}>Quantidade</label><input value={form.qtd} onChange={e => setForm(f => ({ ...f, qtd: e.target.value.replace(/\D/g, "") }))} style={{ ...S.inp, textAlign: "right" }} /></div>
                    <div style={{ width: 160 }}>
                      <label style={S.label}>A cada</label>
                      <select value={form.freq} onChange={e => setForm(f => ({ ...f, freq: e.target.value }))} style={S.inp}>
                        <option value="1">1 mês</option><option value="2">2 meses</option><option value="3">3 meses</option><option value="6">6 meses</option><option value="12">12 meses</option>
                      </select>
                    </div>
                    <div style={{ fontSize: 12, color: "#555", paddingBottom: 8 }}>
                      {Math.max(2, parseInt(form.qtd) || 0)} × {form.valor || "0,00"} = {fmtBRL(numBR(form.valor) * Math.max(2, parseInt(form.qtd) || 0))}
                    </div>
                  </>}
                </div>
              )}
              <div style={{ gridColumn: "1 / -1" }}>
                <label style={S.label}>Observação</label>
                <input value={form.observacao} onChange={e => setForm(f => ({ ...f, observacao: e.target.value }))} style={S.inp} />
              </div>
            </div>
            {erro && <div style={{ background: "#FCEBEB", color: "#791F1F", border: "0.5px solid #F5C6C6", borderRadius: 8, padding: "8px 12px", fontSize: 13, marginTop: 12 }}>{erro}</div>}
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 18 }}>
              <button onClick={() => setModal(false)} style={S.btn("#F4F6FA", "#555", "0.5px solid #DDE2EE")} disabled={salvando}>Cancelar</button>
              <button onClick={salvar} style={S.btn("#1A4870")} disabled={salvando}>{salvando ? "Salvando…" : form.id ? "Salvar" : "Lançar previsão"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
