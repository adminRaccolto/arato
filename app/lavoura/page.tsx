"use client";
import { useState, useEffect } from "react";
import TopNav from "../../components/TopNav";
import {
  listarSafras, criarSafra, atualizarSafra,
  listarOperacoes, criarOperacao, atualizarOperacao,
  listarAnosSafra, listarTodosCiclos,
} from "../../lib/db";
import { useAuth } from "../../components/AuthProvider";
import type { Safra, Operacao, AnoSafra, Ciclo } from "../../lib/supabase";

// ── tipos de view ─────────────────────────────────────────
interface CicloVM extends Safra {
  operacoes: Operacao[];
}
type Aba = "ciclos" | "analise";
type Filtro = "todos" | "em_andamento" | "planejada" | "colhida";

// ── helpers ──────────────────────────────────────────────
const CULTURAS: Record<string, { label: string; bg: string; color: string; borda: string }> = {
  soja:    { label: "Soja",     bg: "#D5E8F5", color: "#0B2D50", borda: "#1A4870" },
  milho1:  { label: "Milho 1ª", bg: "#FAEEDA", color: "#633806", borda: "#EF9F27" },
  milho2:  { label: "Milho 2ª", bg: "#FAEEDA", color: "#633806", borda: "#EF9F27" },
  algodao: { label: "Algodão",  bg: "#E6F1FB", color: "#0C447C", borda: "#378ADD" },
  trigo:   { label: "Trigo",    bg: "#FAF0D8", color: "#5A3E0A", borda: "#C9921A" },
  sorgo:   { label: "Sorgo",    bg: "#FBF3E0", color: "#8B5E14", borda: "#C9921A" },
};
const cc = (c: string) => CULTURAS[c] ?? { label: c, bg: "#F1EFE8", color: "#555", borda: "#666" };

const STATUS_OP: Record<string, { bg: string; color: string; label: string }> = {
  concluida:    { bg: "#D5E8F5", color: "#0B2D50", label: "Concluída"    },
  pendente:     { bg: "#FAEEDA", color: "#633806", label: "Pendente"     },
  em_andamento: { bg: "#E6F1FB", color: "#0C447C", label: "Em andamento" },
  cancelada:    { bg: "#FCEBEB", color: "#791F1F", label: "Cancelada"    },
};
const cs = (s: string) => STATUS_OP[s] ?? { bg: "#F1EFE8", color: "#666", label: s };

const STATUS_CICLO: Record<string, { label: string; bg: string; color: string }> = {
  planejada:    { label: "Planejado",    bg: "#F1EFE8", color: "#666"    },
  em_andamento: { label: "Em andamento", bg: "#E6F1FB", color: "#0C447C" },
  colhida:      { label: "Colhido",      bg: "#D5E8F5", color: "#0B2D50" },
  cancelada:    { label: "Cancelado",    bg: "#FCEBEB", color: "#791F1F" },
};

const TIPOS_OP = [
  { value: "correcao_solo",  label: "Correção de Solo" },
  { value: "adubacao",       label: "Adubação"          },
  { value: "plantio",        label: "Plantio"           },
  { value: "pulverizacao",   label: "Pulverização"      },
  { value: "colheita",       label: "Colheita"          },
  { value: "operacao",       label: "Operação geral"    },
];

const TIPO_ALIAS: Record<string, string> = {
  aplicacao: "pulverizacao",
  adubação:  "adubacao",
  correção:  "correcao_solo",
  correcao:  "correcao_solo",
};
const normTipo = (t: string) => TIPO_ALIAS[t.toLowerCase()] ?? t;
const labelOp  = (tipo: string) => TIPOS_OP.find(x => x.value === normTipo(tipo))?.label ?? tipo;
const iconeOp  = (tipo: string) => ({
  correcao_solo: "◎", adubacao: "◆", plantio: "❧",
  pulverizacao: "◈", colheita: "▣", operacao: "○",
}[normTipo(tipo)] ?? "○");

const fmtData = (iso?: string | null) => {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
};
const hoje = () => new Date().toISOString().slice(0, 10);

// ── estilos ───────────────────────────────────────────────
const inp: React.CSSProperties  = { width: "100%", padding: "8px 10px", border: "0.5px solid #D4DCE8", borderRadius: 8, fontSize: 13, color: "#1a1a1a", background: "#fff", boxSizing: "border-box", outline: "none" };
const lbl: React.CSSProperties  = { fontSize: 11, color: "#555", marginBottom: 4, display: "block" };
const btnV: React.CSSProperties = { padding: "8px 18px", background: "#1A5C38", color: "#fff", border: "none", borderRadius: 8, fontWeight: 600, cursor: "pointer", fontSize: 13 };
const btnR: React.CSSProperties = { padding: "8px 18px", border: "0.5px solid #D4DCE8", borderRadius: 8, background: "transparent", cursor: "pointer", fontSize: 13, color: "#1a1a1a" };
const btnE: React.CSSProperties = { padding: "4px 10px", border: "0.5px solid #D4DCE8", borderRadius: 6, background: "transparent", cursor: "pointer", fontSize: 11, color: "#666" };

function Modal({ titulo, subtitulo, onClose, width = 520, children }: { titulo: string; subtitulo?: string; onClose: () => void; width?: number; children: React.ReactNode }) {
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 110 }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ background: "#fff", borderRadius: 14, padding: 26, width, maxWidth: "94vw", maxHeight: "92vh", overflowY: "auto" }}>
        <div style={{ fontWeight: 600, fontSize: 15, color: "#1a1a1a", marginBottom: subtitulo ? 2 : 18 }}>{titulo}</div>
        {subtitulo && <div style={{ fontSize: 12, color: "#555", marginBottom: 18 }}>{subtitulo}</div>}
        {children}
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────
// COMPONENTE PRINCIPAL
// ────────────────────────────────────────────────────────
export default function PlanoAgricola() {
  const { fazendaId } = useAuth();
  const [aba, setAba]             = useState<Aba>("ciclos");
  const [ciclos, setCiclos]       = useState<CicloVM[]>([]);
  const [anosSafra, setAnosSafra] = useState<AnoSafra[]>([]);
  const [expandidos, setExpandidos] = useState<Set<string>>(new Set());
  const [filtro, setFiltro]       = useState<Filtro>("todos");
  const [loading, setLoading]     = useState(true);
  const [salvando, setSalvando]   = useState(false);

  // ── modal Concluir Operação ──
  const [modalConcluir, setModalConcluir] = useState<{ cicloId: string; op: Operacao } | null>(null);
  const [fConc, setFConc] = useState({ data_real: hoje(), custo_ha: "" });

  // ── modal Registrar Colheita ──
  const [modalColheita, setModalColheita] = useState<CicloVM | null>(null);
  const [fColh, setFColh] = useState({ produtividade_sc_ha: "", data_colheita: hoje() });

  // ── modal Lançar Operação ──
  const [modalAddOp, setModalAddOp] = useState<string | null>(null);
  const [fOp, setFOp] = useState({ nome: "", tipo: "operacao", data_prev: "", custo_ha: "" });

  // ── modal Novo Planejamento (vincular ciclo do Cadastros) ──
  const [modalNovo, setModalNovo]     = useState(false);
  const [cadastroCiclos, setCadastroCiclos] = useState<Ciclo[]>([]);
  const [fNP, setFNP] = useState({
    ano_safra_id: "", ciclo_id: "", area_ha: "", data_plantio: "", status: "planejada" as Safra["status"],
  });

  // ── Carregar dados ──
  useEffect(() => {
    if (!fazendaId) return;
    async function load() {
      try {
        setLoading(true);
        const [sList, aList] = await Promise.all([
          listarSafras(fazendaId!),
          listarAnosSafra(fazendaId!).catch(() => [] as AnoSafra[]),
        ]);
        setAnosSafra(aList);
        listarTodosCiclos(fazendaId!).then(setCadastroCiclos).catch(() => {});
        const vms: CicloVM[] = await Promise.all(
          sList.map(async s => ({ ...s, operacoes: await listarOperacoes(s.id) }))
        );
        setCiclos(vms);
        const ativo = vms.find(s => s.status === "em_andamento");
        if (ativo) setExpandidos(new Set([ativo.id]));
      } finally {
        setLoading(false);
      }
    }
    load();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fazendaId]);

  async function salvar(fn: () => Promise<void>) {
    try { setSalvando(true); await fn(); }
    catch (e) { alert((e as { message?: string })?.message || JSON.stringify(e)); }
    finally { setSalvando(false); }
  }

  // ── Concluir Operação ──
  const concluirOp = () => salvar(async () => {
    if (!modalConcluir) return;
    const { cicloId, op } = modalConcluir;
    const upd: Partial<Operacao> = {
      status: "concluida",
      data_real: fConc.data_real || hoje(),
      custo_ha: fConc.custo_ha ? Number(fConc.custo_ha.replace(",", ".")) : op.custo_ha,
    };
    await atualizarOperacao(op.id, upd);
    setCiclos(prev => prev.map(s => s.id !== cicloId ? s : {
      ...s, operacoes: s.operacoes.map(o => o.id !== op.id ? o : { ...o, ...upd }),
    }));
    const ciclo = ciclos.find(s => s.id === cicloId);
    if (ciclo?.status === "planejada") {
      await atualizarSafra(cicloId, { status: "em_andamento" });
      setCiclos(prev => prev.map(s => s.id === cicloId ? { ...s, status: "em_andamento" } : s));
    }
    setModalConcluir(null);
  });

  // ── Registrar Colheita ──
  const registrarColheita = () => salvar(async () => {
    if (!modalColheita) return;
    const prod = Number(fColh.produtividade_sc_ha.replace(",", ".")) || undefined;
    await atualizarSafra(modalColheita.id, {
      status: "colhida",
      produtividade_sc_ha: prod,
      data_colheita: fColh.data_colheita || hoje(),
    });
    setCiclos(prev => prev.map(s => s.id !== modalColheita.id ? s : {
      ...s, status: "colhida", produtividade_sc_ha: prod, data_colheita: fColh.data_colheita,
    }));
    setModalColheita(null);
  });

  // ── Adicionar Operação ──
  const addOp = () => salvar(async () => {
    if (!modalAddOp || !fOp.data_prev) return;
    const nova = await criarOperacao({
      safra_id: modalAddOp,
      nome: fOp.nome.trim() || labelOp(fOp.tipo),
      tipo: fOp.tipo,
      data_prev: fOp.data_prev,
      status: "pendente",
      custo_ha: fOp.custo_ha ? Number(fOp.custo_ha.replace(",", ".")) : undefined,
      auto: false,
    });
    setCiclos(prev => prev.map(s => s.id !== modalAddOp ? s : { ...s, operacoes: [...s.operacoes, nova] }));
    setFOp({ nome: "", tipo: "operacao", data_prev: "", custo_ha: "" });
    setModalAddOp(null);
  });

  // ── Novo Planejamento (a partir de ciclo do Cadastros) ──
  const ciclosDoAno = fNP.ano_safra_id
    ? cadastroCiclos.filter(c => c.ano_safra_id === fNP.ano_safra_id)
    : cadastroCiclos;

  const addPlanejamento = () => salvar(async () => {
    if (!fNP.area_ha || !fNP.data_plantio) return;
    const cicloSel = cadastroCiclos.find(c => c.id === fNP.ciclo_id);
    const anoSel   = anosSafra.find(a => a.id === fNP.ano_safra_id);
    const novaSafra = await criarSafra({
      fazenda_id:   fazendaId!,
      cultura:      cicloSel?.cultura ?? "soja",
      ano_agricola: anoSel?.descricao ?? "",
      ano_safra_id: fNP.ano_safra_id || undefined,
      ciclo_id:     fNP.ciclo_id || undefined,
      status:       fNP.status,
      area_ha:      Number(fNP.area_ha),
      data_plantio: fNP.data_plantio,
    } as unknown as Omit<Safra, "id" | "created_at">);
    setCiclos(p => [{ ...novaSafra, operacoes: [] }, ...p]);
    setExpandidos(prev => new Set([...prev, novaSafra.id]));
    setModalNovo(false);
  });

  // ── Stats ──
  const ativos     = ciclos.filter(s => s.status === "em_andamento");
  const colhidos   = ciclos.filter(s => s.status === "colhida");
  const areaAtiva  = ativos.reduce((a, s) => a + (s.area_ha ?? 0), 0);
  const prodMedia  = colhidos.filter(s => s.produtividade_sc_ha).length > 0
    ? colhidos.filter(s => s.produtividade_sc_ha).reduce((a, s) => a + (s.produtividade_sc_ha ?? 0), 0)
      / colhidos.filter(s => s.produtividade_sc_ha).length
    : 0;
  const opsPendentes = ciclos.flatMap(s => s.operacoes.filter(o => o.status === "pendente"));
  const opsAtrasadas = opsPendentes.filter(o => o.data_prev && o.data_prev < hoje());

  // ── Filtro e agrupamento ──
  const ciclosFiltrados = ciclos.filter(s => filtro === "todos" || s.status === filtro);
  const grupos: { anoId: string | null; anoLabel: string; ciclos: CicloVM[] }[] = [];
  const semAno: CicloVM[] = [];

  ciclosFiltrados.forEach(c => {
    const anoByFk    = c.ano_safra_id ? anosSafra.find(a => a.id === c.ano_safra_id) : null;
    const anoByLabel = !anoByFk && c.ano_agricola ? anosSafra.find(a => a.descricao === c.ano_agricola) : null;
    const resolvedId = anoByFk?.id ?? anoByLabel?.id ?? c.ano_safra_id ?? null;
    const label      = anoByFk?.descricao ?? anoByLabel?.descricao ?? c.ano_agricola;
    if (label) {
      const g = grupos.find(g => (resolvedId && g.anoId === resolvedId) || (!resolvedId && g.anoId === null && g.anoLabel === label));
      if (g) { g.ciclos.push(c); if (resolvedId && !g.anoId) g.anoId = resolvedId; }
      else grupos.push({ anoId: resolvedId, anoLabel: label, ciclos: [c] });
    } else {
      semAno.push(c);
    }
  });
  grupos.sort((a, b) => b.anoLabel.localeCompare(a.anoLabel));
  if (semAno.length > 0) grupos.push({ anoId: null, anoLabel: "Sem ano agrícola", ciclos: semAno });

  // ────────────────────────────────────────────────────────
  // RENDER
  // ────────────────────────────────────────────────────────
  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh", background: "#F3F6F9", fontFamily: "system-ui, sans-serif", fontSize: 13 }}>
      <TopNav />
      <main style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>

        {/* ── Header ── */}
        <header style={{ background: "#fff", borderBottom: "0.5px solid #D4DCE8", padding: "10px 22px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 17, color: "#1a1a1a", fontWeight: 600 }}>Planejamento Agrícola</h1>
            <p style={{ margin: "2px 0 0", fontSize: 11, color: "#444" }}>
              Operações por ciclo · Ciclos cadastrados em <strong>Cadastros → Safras &amp; Ciclos</strong>
            </p>
          </div>
        </header>

        {/* ── Abas ── */}
        <div style={{ background: "#fff", borderBottom: "0.5px solid #D4DCE8", padding: "0 22px", display: "flex", gap: 4 }}>
          {([["ciclos", "Ciclos"] , ["analise", "Análise"]] as const).map(([k, l]) => (
            <button key={k} onClick={() => setAba(k)} style={{
              padding: "10px 16px", border: "none", background: "transparent", cursor: "pointer",
              fontSize: 13, fontWeight: aba === k ? 600 : 400, color: aba === k ? "#1a1a1a" : "#555",
              borderBottom: aba === k ? "2px solid #1A4870" : "2px solid transparent",
            }}>{l}</button>
          ))}
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: "18px 22px" }}>
          {loading && <div style={{ textAlign: "center", padding: 48, color: "#444" }}>Carregando…</div>}

          {!loading && (
            <>
              {/* ══ ABA CICLOS ══ */}
              {aba === "ciclos" && (
                <>
                  {/* Stats */}
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 16 }}>
                    {[
                      { label: "Ciclos em andamento", valor: String(ativos.length),                           unidade: "",      cor: "#1A4870" },
                      { label: "Área ativa",           valor: areaAtiva.toLocaleString("pt-BR"),              unidade: "ha",    cor: "#C9921B" },
                      { label: "Ops pendentes",        valor: String(opsPendentes.length),                    unidade: "",      cor: opsAtrasadas.length > 0 ? "#E24B4A" : "#EF9F27" },
                      { label: "Produtividade média",  valor: prodMedia > 0 ? prodMedia.toFixed(1) : "—",     unidade: prodMedia > 0 ? "sc/ha" : "", cor: prodMedia >= 65 ? "#1A4870" : "#EF9F27" },
                    ].map((s, i) => (
                      <div key={i} style={{ background: "#fff", border: "0.5px solid #D4DCE8", borderRadius: 12, padding: "14px 16px" }}>
                        <div style={{ fontSize: 11, color: "#555", marginBottom: 6 }}>{s.label}</div>
                        <div style={{ fontSize: 22, fontWeight: 600, color: s.cor }}>
                          {s.valor}{s.unidade && <span style={{ fontSize: 12, color: "#555", marginLeft: 4 }}>{s.unidade}</span>}
                        </div>
                      </div>
                    ))}
                  </div>

                  {opsAtrasadas.length > 0 && (
                    <div style={{ background: "#FCEBEB", border: "0.5px solid #E24B4A50", borderRadius: 8, padding: "8px 14px", marginBottom: 14, fontSize: 12, color: "#791F1F" }}>
                      ⚠ {opsAtrasadas.length} operação(ões) com data prevista vencida em ciclos ativos.
                    </div>
                  )}

                  {/* Filtros */}
                  <div style={{ display: "flex", gap: 6, marginBottom: 14, flexWrap: "wrap" }}>
                    {([
                      { key: "todos",        label: "Todos",        count: ciclos.length },
                      { key: "em_andamento", label: "Em andamento", count: ativos.length },
                      { key: "planejada",    label: "Planejados",   count: ciclos.filter(s => s.status === "planejada").length },
                      { key: "colhida",      label: "Colhidos",     count: colhidos.length },
                    ] as { key: Filtro; label: string; count: number }[]).map(f => (
                      <button key={f.key} onClick={() => setFiltro(f.key)} style={{
                        padding: "5px 14px", borderRadius: 20, border: "0.5px solid",
                        borderColor: filtro === f.key ? "#1A4870" : "#D4DCE8",
                        background: filtro === f.key ? "#D5E8F5" : "#fff",
                        color: filtro === f.key ? "#0B2D50" : "#666",
                        fontWeight: filtro === f.key ? 600 : 400, fontSize: 12, cursor: "pointer",
                      }}>
                        {f.label}
                        <span style={{ marginLeft: 6, background: filtro === f.key ? "#1A4870" : "#DEE5EE", color: filtro === f.key ? "#fff" : "#555", fontSize: 10, padding: "1px 6px", borderRadius: 8 }}>{f.count}</span>
                      </button>
                    ))}
                  </div>

                  {ciclosFiltrados.length === 0 && (
                    <div style={{ background: "#fff", border: "0.5px solid #D4DCE8", borderRadius: 12, padding: 40, textAlign: "center", color: "#444" }}>
                      {ciclos.length === 0
                        ? "Nenhum ciclo cadastrado. Acesse Cadastros → Safras & Ciclos para criar Ano Agrícola e Ciclos."
                        : "Nenhum ciclo nesta categoria."}
                    </div>
                  )}

                  {/* Grupos por Ano Agrícola */}
                  <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
                    {grupos.map(grupo => (
                      <div key={grupo.anoLabel}>
                        {/* Cabeçalho do grupo */}
                        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                          <div style={{ fontSize: 13, fontWeight: 600, color: "#1A4870", background: "#D5E8F5", padding: "4px 14px", borderRadius: 20, border: "0.5px solid #1A487040" }}>
                            Ano Agrícola {grupo.anoLabel}
                          </div>
                          <div style={{ flex: 1, height: "0.5px", background: "#D4DCE8" }} />
                          <span style={{ fontSize: 11, color: "#555" }}>{grupo.ciclos.length} ciclo{grupo.ciclos.length !== 1 ? "s" : ""}</span>
                        </div>

                        {/* Cards dos ciclos */}
                        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                          {grupo.ciclos.map(ciclo => {
                            const exp = expandidos.has(ciclo.id);
                            const cul = cc(ciclo.cultura);
                            const sSt = STATUS_CICLO[ciclo.status] ?? { label: ciclo.status, bg: "#F1EFE8", color: "#666" };
                            const concluidas = ciclo.operacoes.filter(o => o.status === "concluida").length;
                            const total = ciclo.operacoes.length;
                            const pct = total > 0 ? Math.round(concluidas / total * 100) : 0;
                            const custoTotal = ciclo.operacoes.reduce((a, o) => a + (o.custo_ha ?? 0), 0);
                            const pendAtrasadas = ciclo.operacoes.filter(o => o.status === "pendente" && o.data_prev && o.data_prev < hoje());

                            return (
                              <div key={ciclo.id} style={{ background: "#fff", border: `0.5px solid ${ciclo.status === "em_andamento" ? cul.borda + "60" : "#D4DCE8"}`, borderRadius: 12, overflow: "hidden" }}>

                                {/* Cabeçalho do card */}
                                <div style={{ padding: "14px 16px", display: "flex", alignItems: "center", gap: 12, cursor: "pointer" }}
                                  onClick={() => setExpandidos(prev => { const s = new Set(prev); s.has(ciclo.id) ? s.delete(ciclo.id) : s.add(ciclo.id); return s; })}>

                                  <div style={{ width: 44, height: 44, background: cul.bg, borderRadius: 10, border: `1.5px solid ${cul.borda}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                                    <span style={{ fontSize: 18, color: cul.color }}>❧</span>
                                  </div>

                                  <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 2, flexWrap: "wrap" }}>
                                      <span style={{ color: "#1a1a1a", fontWeight: 600, fontSize: 14 }}>{cul.label}</span>
                                      <span style={{ fontSize: 10, background: sSt.bg, color: sSt.color, padding: "2px 8px", borderRadius: 8 }}>{sSt.label}</span>
                                      {pendAtrasadas.length > 0 && <span style={{ fontSize: 10, background: "#FCEBEB", color: "#791F1F", padding: "2px 8px", borderRadius: 8 }}>⚠ {pendAtrasadas.length} op. atrasada(s)</span>}
                                    </div>
                                    <div style={{ fontSize: 11, color: "#555" }}>
                                      {(ciclo.area_ha ?? 0).toLocaleString("pt-BR")} ha
                                      {ciclo.data_plantio  ? ` · Plantio: ${fmtData(ciclo.data_plantio)}`  : ""}
                                      {ciclo.data_colheita ? ` · Colheita: ${fmtData(ciclo.data_colheita)}` : ""}
                                    </div>
                                  </div>

                                  {/* Barra de progresso */}
                                  {total > 0 && (
                                    <div style={{ width: 110, flexShrink: 0 }}>
                                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "#555", marginBottom: 4 }}>
                                        <span>Operações</span>
                                        <span style={{ fontWeight: 600, color: pct === 100 ? "#1A4870" : "#1a1a1a" }}>{pct}%</span>
                                      </div>
                                      <div style={{ height: 6, background: "#DEE5EE", borderRadius: 3 }}>
                                        <div style={{ height: 6, background: pct === 100 ? "#1A4870" : "#EF9F27", borderRadius: 3, width: `${pct}%`, transition: "width 0.3s" }} />
                                      </div>
                                      <div style={{ fontSize: 10, color: "#444", marginTop: 2 }}>{concluidas}/{total} ops</div>
                                    </div>
                                  )}

                                  {/* Métricas */}
                                  <div style={{ display: "flex", gap: 18, flexShrink: 0, alignItems: "center" }}>
                                    <div style={{ textAlign: "center" }}>
                                      <div style={{ fontSize: 16, fontWeight: 600, color: "#1A4870" }}>
                                        {ciclo.produtividade_sc_ha ? ciclo.produtividade_sc_ha.toFixed(1) : "—"}
                                      </div>
                                      <div style={{ fontSize: 10, color: "#444" }}>sc/ha</div>
                                    </div>
                                    {custoTotal > 0 && (
                                      <div style={{ textAlign: "center" }}>
                                        <div style={{ fontSize: 16, fontWeight: 600, color: "#C9921B" }}>
                                          R$ {custoTotal.toLocaleString("pt-BR")}
                                        </div>
                                        <div style={{ fontSize: 10, color: "#444" }}>custo/ha</div>
                                      </div>
                                    )}
                                  </div>

                                  <span style={{ color: "#444", fontSize: 11, flexShrink: 0, display: "inline-block", transform: exp ? "rotate(90deg)" : "rotate(0deg)", transition: "transform 0.15s" }}>▶</span>
                                </div>

                                {/* ── Conteúdo expandido ── */}
                                {exp && (
                                  <div style={{ borderTop: "0.5px solid #DEE5EE" }}>
                                    {/* Barra de ações */}
                                    <div style={{ padding: "8px 16px", borderBottom: "0.5px solid #DEE5EE", display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                                      <button style={{ ...btnE, fontSize: 12 }} onClick={() => { setModalAddOp(ciclo.id); setFOp({ nome: "", tipo: "operacao", data_prev: "", custo_ha: "" }); }}>
                                        + Lançar Operação
                                      </button>
                                      {(ciclo.status === "em_andamento" || ciclo.status === "planejada") && (
                                        <button style={{ ...btnE, fontSize: 12, borderColor: "#1A487080", color: "#0B2D50", background: "#E4F0F9" }}
                                          onClick={() => { setModalColheita(ciclo); setFColh({ produtividade_sc_ha: "", data_colheita: hoje() }); }}>
                                          ▣ Registrar Colheita
                                        </button>
                                      )}
                                    </div>

                                    {ciclo.operacoes.length === 0 ? (
                                      <div style={{ padding: "24px 16px", textAlign: "center", color: "#888", fontSize: 12 }}>
                                        Nenhuma operação registrada. Use "+ Lançar Operação" para adicionar.
                                      </div>
                                    ) : (
                                      <table style={{ width: "100%", borderCollapse: "collapse" }}>
                                        <thead>
                                          <tr style={{ background: "#F3F6F9" }}>
                                            {["Tipo", "Operação / Descrição", "Data prevista", "Data realizada", "Custo/ha", "Status", ""].map((h, i) => (
                                              <th key={i} style={{ padding: "7px 14px", textAlign: i <= 1 ? "left" : "center", fontSize: 11, fontWeight: 600, color: "#555", borderBottom: "0.5px solid #D4DCE8" }}>{h}</th>
                                            ))}
                                          </tr>
                                        </thead>
                                        <tbody>
                                          {ciclo.operacoes.filter(o => o.status !== "cancelada").map((op, oi, arr) => {
                                            const st = cs(op.status);
                                            const atrasada = op.status === "pendente" && op.data_prev && op.data_prev < hoje();
                                            return (
                                              <tr key={op.id} style={{ borderBottom: oi < arr.length - 1 ? "0.5px solid #DEE5EE" : "none", background: atrasada ? "#FFFBF5" : "transparent" }}>
                                                <td style={{ padding: "8px 14px" }}>
                                                  <span style={{ fontSize: 16, color: cul.color }}>{iconeOp(op.tipo)}</span>
                                                </td>
                                                <td style={{ padding: "8px 14px" }}>
                                                  <div style={{ color: "#1a1a1a", fontWeight: 600, fontSize: 12 }}>{labelOp(op.tipo)}</div>
                                                  {op.nome && op.nome !== op.tipo && op.nome !== normTipo(op.tipo) && <div style={{ fontSize: 11, color: "#555" }}>{op.nome}</div>}
                                                </td>
                                                <td style={{ padding: "8px 14px", textAlign: "center", fontSize: 12, color: atrasada ? "#E24B4A" : "#666" }}>
                                                  {fmtData(op.data_prev)}
                                                  {atrasada && <div style={{ fontSize: 10 }}>⚠ atrasada</div>}
                                                </td>
                                                <td style={{ padding: "8px 14px", textAlign: "center", fontSize: 12, color: op.data_real ? "#1A4870" : "#444" }}>{fmtData(op.data_real)}</td>
                                                <td style={{ padding: "8px 14px", textAlign: "center", fontSize: 12, color: "#1a1a1a" }}>
                                                  {op.custo_ha ? `R$ ${op.custo_ha.toLocaleString("pt-BR")}` : "—"}
                                                </td>
                                                <td style={{ padding: "8px 14px", textAlign: "center" }}>
                                                  <span style={{ fontSize: 11, background: st.bg, color: st.color, padding: "2px 8px", borderRadius: 6 }}>{st.label}</span>
                                                </td>
                                                <td style={{ padding: "8px 14px", textAlign: "center" }}>
                                                  {op.status === "pendente" && (
                                                    <button onClick={() => { setModalConcluir({ cicloId: ciclo.id, op }); setFConc({ data_real: hoje(), custo_ha: op.custo_ha ? String(op.custo_ha) : "" }); }}
                                                      style={{ ...btnE, background: "#D5E8F5", borderColor: "#1A487060", color: "#0B2D50", fontSize: 11 }}>Concluir</button>
                                                  )}
                                                </td>
                                              </tr>
                                            );
                                          })}
                                        </tbody>
                                      </table>
                                    )}

                                    {/* Rodapé */}
                                    {custoTotal > 0 && (
                                      <div style={{ padding: "8px 14px", borderTop: "0.5px solid #DEE5EE", display: "flex", justifyContent: "space-between", fontSize: 11, color: "#444" }}>
                                        <span>
                                          Custo estimado: <strong style={{ color: "#C9921B" }}>R$ {custoTotal.toLocaleString("pt-BR")}/ha</strong>
                                          {ciclo.area_ha ? <> · <strong style={{ color: "#C9921B" }}>R$ {(custoTotal * ciclo.area_ha).toLocaleString("pt-BR")} total</strong></> : ""}
                                        </span>
                                        <span>{concluidas}/{total} operações concluídas</span>
                                      </div>
                                    )}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}

              {/* ══ ABA ANÁLISE ══ */}
              {aba === "analise" && (
                <div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 20 }}>
                    {[
                      { label: "Total de ciclos",      valor: String(ciclos.length),                                                                                                                                              cor: "#1a1a1a" },
                      { label: "Área total histórica", valor: ciclos.reduce((a, s) => a + (s.area_ha ?? 0), 0).toLocaleString("pt-BR"), unidade: "ha",                                                                            cor: "#C9921B" },
                      { label: "Ciclos colhidos",      valor: String(colhidos.length),                                                                                                                                            cor: "#1A4870" },
                      { label: "Maior produtividade",  valor: colhidos.filter(s => s.produtividade_sc_ha).length > 0 ? Math.max(...colhidos.filter(s => s.produtividade_sc_ha).map(s => s.produtividade_sc_ha!)).toFixed(1) : "—", unidade: "sc/ha", cor: "#1A4870" },
                    ].map((s, i) => (
                      <div key={i} style={{ background: "#fff", border: "0.5px solid #D4DCE8", borderRadius: 12, padding: "14px 16px" }}>
                        <div style={{ fontSize: 11, color: "#555", marginBottom: 6 }}>{s.label}</div>
                        <div style={{ fontSize: 22, fontWeight: 600, color: s.cor }}>
                          {s.valor}{"unidade" in s && s.unidade && <span style={{ fontSize: 12, color: "#555", marginLeft: 4 }}>{s.unidade}</span>}
                        </div>
                      </div>
                    ))}
                  </div>

                  {ciclos.length === 0 ? (
                    <div style={{ background: "#fff", border: "0.5px solid #D4DCE8", borderRadius: 12, padding: 40, textAlign: "center", color: "#444" }}>
                      Nenhum ciclo cadastrado ainda.
                    </div>
                  ) : (
                    <div style={{ background: "#fff", border: "0.5px solid #D4DCE8", borderRadius: 12, overflow: "hidden" }}>
                      <table style={{ width: "100%", borderCollapse: "collapse" }}>
                        <thead>
                          <tr style={{ background: "#F3F6F9" }}>
                            {["Ano / Cultura", "Área", "Plantio", "Colheita", "Ciclo", "Produtiv.", "Custo/ha", "Sacas Totais", "Status"].map((h, i) => (
                              <th key={i} style={{ padding: "8px 14px", textAlign: i <= 1 ? "left" : "center", fontSize: 11, fontWeight: 600, color: "#555", borderBottom: "0.5px solid #D4DCE8" }}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {[...ciclos].sort((a, b) => (b.data_plantio ?? "") > (a.data_plantio ?? "") ? 1 : -1).map((s, i, arr) => {
                            const cul2 = cc(s.cultura);
                            const sSt2 = STATUS_CICLO[s.status] ?? { label: s.status, bg: "#F1EFE8", color: "#666" };
                            const custo = s.operacoes.reduce((a, o) => a + (o.custo_ha ?? 0), 0);
                            const sacas = s.produtividade_sc_ha && s.area_ha ? s.produtividade_sc_ha * s.area_ha : null;
                            const cicloD = s.data_plantio && s.data_colheita
                              ? Math.round((new Date(s.data_colheita).getTime() - new Date(s.data_plantio).getTime()) / 86400000)
                              : null;
                            const anoLabel = anosSafra.find(a => a.id === s.ano_safra_id)?.descricao ?? s.ano_agricola;
                            return (
                              <tr key={s.id} style={{ borderBottom: i < arr.length - 1 ? "0.5px solid #DEE5EE" : "none" }}>
                                <td style={{ padding: "10px 14px" }}>
                                  <div style={{ fontSize: 11, color: "#888", marginBottom: 2 }}>{anoLabel}</div>
                                  <span style={{ fontSize: 10, background: cul2.bg, color: cul2.color, padding: "2px 7px", borderRadius: 8, fontWeight: 600 }}>{cul2.label}</span>
                                </td>
                                <td style={{ padding: "10px 14px" }}><strong>{(s.area_ha ?? 0).toLocaleString("pt-BR")}</strong> ha</td>
                                <td style={{ padding: "10px 14px", textAlign: "center" }}>{fmtData(s.data_plantio)}</td>
                                <td style={{ padding: "10px 14px", textAlign: "center" }}>{fmtData(s.data_colheita)}</td>
                                <td style={{ padding: "10px 14px", textAlign: "center" }}>{cicloD ? `${cicloD}d` : "—"}</td>
                                <td style={{ padding: "10px 14px", textAlign: "center" }}>
                                  {s.produtividade_sc_ha
                                    ? <strong style={{ color: s.produtividade_sc_ha >= 65 ? "#1A4870" : "#EF9F27" }}>{s.produtividade_sc_ha.toFixed(1)} sc/ha</strong>
                                    : <span style={{ color: "#444" }}>—</span>}
                                </td>
                                <td style={{ padding: "10px 14px", textAlign: "center", color: "#C9921B", fontWeight: 600 }}>{custo > 0 ? `R$ ${custo.toLocaleString("pt-BR")}` : "—"}</td>
                                <td style={{ padding: "10px 14px", textAlign: "center" }}>
                                  {sacas ? <strong>{Math.round(sacas).toLocaleString("pt-BR")} sc</strong> : <span style={{ color: "#444" }}>—</span>}
                                </td>
                                <td style={{ padding: "10px 14px", textAlign: "center" }}>
                                  <span style={{ fontSize: 10, background: sSt2.bg, color: sSt2.color, padding: "2px 8px", borderRadius: 8, fontWeight: 600 }}>{sSt2.label}</span>
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
            </>
          )}
        </div>
      </main>

      {/* ══ Modal Novo Planejamento ══ */}
      {modalNovo && (
        <Modal titulo="Novo Planejamento Agrícola" subtitulo="Selecione o Ano Safra e Ciclo cadastrados" onClose={() => setModalNovo(false)} width={560}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            <div>
              <label style={lbl}>Ano Safra *</label>
              <select style={inp} value={fNP.ano_safra_id} onChange={e => setFNP(p => ({ ...p, ano_safra_id: e.target.value, ciclo_id: "" }))}>
                <option value="">— Selecionar —</option>
                {anosSafra.map(a => <option key={a.id} value={a.id}>{a.descricao}</option>)}
              </select>
            </div>
            <div>
              <label style={lbl}>Ciclo *</label>
              <select style={inp} value={fNP.ciclo_id} onChange={e => {
                const c = cadastroCiclos.find(x => x.id === e.target.value);
                setFNP(p => ({ ...p, ciclo_id: e.target.value, ...(c ? { ano_safra_id: c.ano_safra_id ?? p.ano_safra_id } : {}) }));
              }}>
                <option value="">— Selecionar —</option>
                {ciclosDoAno.map(c => {
                  const cultLabel: Record<string,string> = { soja:"Soja", milho1:"Milho 1ª", milho2:"Milho 2ª", algodao:"Algodão", sorgo:"Sorgo", trigo:"Trigo" };
                  return <option key={c.id} value={c.id}>{c.descricao ?? cultLabel[c.cultura] ?? c.cultura}</option>;
                })}
              </select>
            </div>
            <div>
              <label style={lbl}>Área (ha) *</label>
              <input style={inp} type="number" step="0.1" placeholder="Ex: 650" value={fNP.area_ha} onChange={e => setFNP(p => ({ ...p, area_ha: e.target.value }))} />
            </div>
            <div>
              <label style={lbl}>Data de Início *</label>
              <input style={inp} type="date" value={fNP.data_plantio} onChange={e => setFNP(p => ({ ...p, data_plantio: e.target.value }))} />
            </div>
            <div>
              <label style={lbl}>Status inicial</label>
              <select style={inp} value={fNP.status} onChange={e => setFNP(p => ({ ...p, status: e.target.value as Safra["status"] }))}>
                <option value="planejada">Planejado</option>
                <option value="em_andamento">Em andamento</option>
              </select>
            </div>
          </div>
          {anosSafra.length === 0 && (
            <div style={{ marginTop: 12, fontSize: 11, color: "#C9921B", background: "#FBF3E0", padding: "8px 12px", borderRadius: 6 }}>
              Nenhum Ano Safra cadastrado. Acesse Cadastros → Safras &amp; Ciclos primeiro.
            </div>
          )}
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 22 }}>
            <button style={btnR} onClick={() => setModalNovo(false)}>Cancelar</button>
            <button
              style={{ ...btnV, opacity: salvando || !fNP.ciclo_id || !fNP.area_ha || !fNP.data_plantio ? 0.5 : 1 }}
              disabled={salvando || !fNP.ciclo_id || !fNP.area_ha || !fNP.data_plantio}
              onClick={addPlanejamento}>
              {salvando ? "Salvando…" : "Criar Planejamento"}
            </button>
          </div>
        </Modal>
      )}

      {/* ══ Modal Lançar Operação ══ */}
      {modalAddOp && (
        <Modal titulo="Lançar Operação" onClose={() => setModalAddOp(null)} width={500}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            <div>
              <label style={lbl}>Tipo de Operação *</label>
              <select style={inp} value={fOp.tipo} onChange={e => setFOp(p => ({ ...p, tipo: e.target.value }))}>
                {TIPOS_OP.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
            <div>
              <label style={lbl}>Data Prevista *</label>
              <input style={inp} type="date" value={fOp.data_prev} onChange={e => setFOp(p => ({ ...p, data_prev: e.target.value }))} />
            </div>
            <div style={{ gridColumn: "1/-1" }}>
              <label style={lbl}>Descrição / Detalhes</label>
              <input style={inp} placeholder="Ex: Herbicida pós · Roundup 2 L/ha" value={fOp.nome} onChange={e => setFOp(p => ({ ...p, nome: e.target.value }))} />
            </div>
            <div>
              <label style={lbl}>Custo estimado (R$/ha)</label>
              <input style={inp} type="number" step="0.01" placeholder="Ex: 85,00" value={fOp.custo_ha} onChange={e => setFOp(p => ({ ...p, custo_ha: e.target.value }))} />
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 20 }}>
            <button style={btnR} onClick={() => setModalAddOp(null)}>Cancelar</button>
            <button style={{ ...btnV, opacity: salvando || !fOp.data_prev ? 0.5 : 1 }} disabled={salvando || !fOp.data_prev} onClick={addOp}>
              {salvando ? "Salvando…" : "+ Lançar Operação"}
            </button>
          </div>
        </Modal>
      )}

      {/* ══ Modal Concluir Operação ══ */}
      {modalConcluir && (
        <Modal titulo="Concluir Operação" subtitulo={labelOp(modalConcluir.op.tipo)} onClose={() => setModalConcluir(null)} width={440}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            <div>
              <label style={lbl}>Data de realização</label>
              <input style={inp} type="date" value={fConc.data_real} onChange={e => setFConc(p => ({ ...p, data_real: e.target.value }))} />
            </div>
            <div>
              <label style={lbl}>Custo real (R$/ha)</label>
              <input style={inp} type="number" step="0.01" placeholder={modalConcluir.op.custo_ha ? String(modalConcluir.op.custo_ha) : "Ex: 95,00"} value={fConc.custo_ha} onChange={e => setFConc(p => ({ ...p, custo_ha: e.target.value }))} />
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 20 }}>
            <button style={btnR} onClick={() => setModalConcluir(null)}>Cancelar</button>
            <button style={{ ...btnV, opacity: salvando ? 0.5 : 1 }} disabled={salvando} onClick={concluirOp}>
              {salvando ? "Salvando…" : "✓ Confirmar Conclusão"}
            </button>
          </div>
        </Modal>
      )}

      {/* ══ Modal Registrar Colheita ══ */}
      {modalColheita && (
        <Modal titulo="Registrar Colheita" subtitulo={`${cc(modalColheita.cultura).label} · ${(modalColheita.area_ha ?? 0).toLocaleString("pt-BR")} ha`} onClose={() => setModalColheita(null)} width={460}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            <div>
              <label style={lbl}>Produtividade real (sc/ha) *</label>
              <input style={inp} type="number" step="0.1" placeholder="Ex: 63,5" value={fColh.produtividade_sc_ha} onChange={e => setFColh(p => ({ ...p, produtividade_sc_ha: e.target.value }))} />
            </div>
            <div>
              <label style={lbl}>Data da colheita</label>
              <input style={inp} type="date" value={fColh.data_colheita} onChange={e => setFColh(p => ({ ...p, data_colheita: e.target.value }))} />
            </div>
          </div>
          {fColh.produtividade_sc_ha && modalColheita.area_ha && (
            <div style={{ background: "#D5E8F5", border: "0.5px solid #1A487040", borderRadius: 8, padding: "10px 14px", marginTop: 14, fontSize: 12, color: "#0B2D50" }}>
              Produção total: <strong>{Math.round(Number(fColh.produtividade_sc_ha) * modalColheita.area_ha).toLocaleString("pt-BR")} sacas</strong>
              {" · "}{(Number(fColh.produtividade_sc_ha) * modalColheita.area_ha * 60 / 1000).toFixed(1)} t
            </div>
          )}
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 20 }}>
            <button style={btnR} onClick={() => setModalColheita(null)}>Cancelar</button>
            <button style={{ ...btnV, opacity: salvando || !fColh.produtividade_sc_ha ? 0.5 : 1 }} disabled={salvando || !fColh.produtividade_sc_ha} onClick={registrarColheita}>
              {salvando ? "Salvando…" : "▣ Encerrar como Colhido"}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
