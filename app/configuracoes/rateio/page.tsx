"use client";
import { useState, useEffect, useCallback } from "react";
import TopNav from "../../../components/TopNav";
import { useAuth } from "../../../components/AuthProvider";
import {
  listarRegrasRateioTodasFazendas, criarRateioRegra, atualizarRateioRegra, excluirRateioRegra,
  listarRegrasRateioGlobal, criarRateioGlobal, atualizarRateioGlobal, excluirRateioGlobal,
  listarTodosCiclos, listarAnosSafra, listarCentrosCustoGeralDaConta, listarFazendasDaConta,
} from "../../../lib/db";
import type { RateioRegra, RateioRegraLinha, RateioGlobal, Ciclo, AnoSafra, CentroCusto, Fazenda } from "../../../lib/supabase";
import InputNumerico from "../../../components/InputNumerico";

const inp: React.CSSProperties = { width: "100%", padding: "7px 10px", border: "0.5px solid var(--border-table)", borderRadius: 7, fontSize: 13, color: "var(--text-1)", background: "var(--bg-card)", boxSizing: "border-box", outline: "none" };
const lbl: React.CSSProperties = { fontSize: 11, color: "var(--text-2)", marginBottom: 3, display: "block" };
const btnV: React.CSSProperties = { padding: "8px 18px", background: "#2A2A2A", color: "#fff", border: "none", borderRadius: 8, fontWeight: 600, cursor: "pointer", fontSize: 13 };
const btnR: React.CSSProperties = { padding: "7px 14px", border: "0.5px solid var(--border-table)", borderRadius: 8, background: "var(--bg-card)", cursor: "pointer", fontSize: 12, color: "var(--text-2)" };
const btnX: React.CSSProperties = { padding: "3px 8px", border: "0.5px solid #E24B4A50", borderRadius: 6, background: "#FCEBEB", cursor: "pointer", fontSize: 11, color: "#791F1F" };

const CULT: Record<string, string> = {
  soja: "Soja", milho1: "Milho 1ª", milho2: "Milho 2ª",
  algodao: "Algodão", sorgo: "Sorgo", trigo: "Trigo",
};
const CORES = ["#2A2A2A", "#C9921B", "#16A34A", "#E24B4A", "#7C3AED", "#0891B2", "#B45309", "#6B7280"];

// Tipos internos dos formulários
type LinhaForm = { ciclo_id: string; percentual: string; descricao: string };
const LINHA_VAZIA: LinhaForm = { ciclo_id: "", percentual: "", descricao: "" };

type FazForm = { fazenda_id: string; percentual: string };

type TipoN2 = "area_plantada" | "atribuido";
type TipoN1 = "area_ciclos" | "atribuido";

export default function RateioPage() {
  const { fazendaId, contaId } = useAuth();

  // Dados comuns
  const [todasFazendas, setTodasFazendas] = useState<Fazenda[]>([]);
  const [ciclosPorFazenda, setCiclosPorFazenda] = useState<Record<string, Ciclo[]>>({});
  const [anos, setAnos] = useState<AnoSafra[]>([]);
  const [ccs, setCcs] = useState<CentroCusto[]>([]);
  const [loading, setLoading] = useState(true);

  // Tab
  const [tab, setTab] = useState<"n2" | "n1">("n2");

  // ── Regras N2 (Fazenda → Ciclo) ──
  const [regrasN2, setRegrasN2] = useState<RateioRegra[]>([]);
  const [filtroAnoN2, setFiltroAnoN2] = useState("");
  const [filtroFazN2, setFiltroFazN2] = useState("");
  const [modalN2, setModalN2] = useState(false);
  const [editN2Id, setEditN2Id] = useState<string | null>(null);
  const [fN2, setFN2] = useState({
    fazenda_id: "",
    ano_safra_id: "",
    tipo: "atribuido" as TipoN2,
    centros_custo_ids: [] as string[],
    nome: "",
    descricao: "",
    ativo: true,
  });
  const [linhasN2, setLinhasN2] = useState<LinhaForm[]>([{ ...LINHA_VAZIA }, { ...LINHA_VAZIA }]);
  const [erroN2, setErroN2] = useState<string | null>(null);
  const [salvandoN2, setSalvandoN2] = useState(false);

  // ── Regras N1 (Global → Fazendas) ──
  const [regrasN1, setRegrasN1] = useState<RateioGlobal[]>([]);
  const [modalN1, setModalN1] = useState(false);
  const [editN1Id, setEditN1Id] = useState<string | null>(null);
  const [fN1, setFN1] = useState({
    nome: "",
    descricao: "",
    ano_safra_id: "",
    tipo: "atribuido" as TipoN1,
    centro_custo_id: "",
    ativo: true,
  });
  const [fazLinhas, setFazLinhas] = useState<FazForm[]>([]);
  const [erroN1, setErroN1] = useState<string | null>(null);
  const [salvandoN1, setSalvandoN1] = useState(false);

  // Carregar dados
  const carregar = useCallback(async () => {
    if (!fazendaId) return;
    setLoading(true);

    const [faz, a, cc] = await Promise.all([
      listarFazendasDaConta(contaId, fazendaId).catch(() => [] as Fazenda[]),
      listarAnosSafra(fazendaId).catch(() => [] as AnoSafra[]),
      listarCentrosCustoGeralDaConta(fazendaId).catch(() => [] as CentroCusto[]),
    ]);
    setTodasFazendas(faz);
    setAnos(a);
    setCcs(cc);

    const map: Record<string, Ciclo[]> = {};
    const idsFaz = [...new Set([fazendaId, ...faz.map(f => f.id)])];
    await Promise.all(idsFaz.map(async id => {
      map[id] = await listarTodosCiclos(id).catch(() => []);
    }));
    setCiclosPorFazenda(map);

    const n2 = await listarRegrasRateioTodasFazendas(idsFaz).catch(() => [] as RateioRegra[]);
    const n1 = contaId ? await listarRegrasRateioGlobal(contaId).catch(() => [] as RateioGlobal[]) : [];
    setRegrasN2(n2);
    setRegrasN1(n1);

    setLoading(false);
  }, [fazendaId, contaId]);

  useEffect(() => { carregar(); }, [carregar]);

  // Helpers
  const nomeCiclo = (fazId: string | undefined, cicloId: string | undefined) => {
    if (!cicloId) return "Sem ciclo";
    const ciclos = fazId ? (ciclosPorFazenda[fazId] ?? []) : Object.values(ciclosPorFazenda).flat();
    const c = ciclos.find(x => x.id === cicloId);
    if (!c) return "—";
    return CULT[c.cultura] ?? c.cultura;
  };
  const nomeCC = (id?: string) => ccs.find(x => x.id === id)?.nome ?? "—";
  const nomeFaz = (id: string) => todasFazendas.find(f => f.id === id)?.nome ?? id;
  const nomeAno = (id: string) => anos.find(a => a.id === id)?.descricao ?? "—";

  // ──────────────────────────────────────────────────────────────
  // NÍVEL 2 — Fazenda → Ciclos
  // ──────────────────────────────────────────────────────────────

  const ciclosModalN2 = fN2.ano_safra_id && fN2.fazenda_id
    ? (ciclosPorFazenda[fN2.fazenda_id] ?? []).filter(c => c.ano_safra_id === fN2.ano_safra_id)
    : fN2.fazenda_id
      ? (ciclosPorFazenda[fN2.fazenda_id] ?? [])
      : [];

  const somaLinhasN2 = linhasN2.reduce((s, l) => s + (parseFloat(l.percentual) || 0), 0);
  const somaOkN2 = fN2.tipo === "area_plantada" || Math.abs(somaLinhasN2 - 100) < 0.01;

  const addLinhaN2 = () => setLinhasN2(p => [...p, { ...LINHA_VAZIA }]);
  const removeLinhaN2 = (i: number) => setLinhasN2(p => p.filter((_, j) => j !== i));
  const setLinhaFieldN2 = (i: number, campo: keyof LinhaForm, valor: string) =>
    setLinhasN2(p => p.map((l, j) => j === i ? { ...l, [campo]: valor } : l));
  const setPctLinhaN2 = (i: number, valor: string) => {
    setLinhasN2(p => {
      const next = p.map((l, j) => j === i ? { ...l, percentual: valor } : l);
      if (next.length === 2) {
        const outra = i === 0 ? 1 : 0;
        next[outra] = { ...next[outra], percentual: String(Math.max(0, 100 - (parseFloat(valor) || 0))) };
      }
      return next;
    });
  };

  const abrirNovoN2 = () => {
    setFN2({ fazenda_id: fazendaId ?? "", ano_safra_id: filtroAnoN2, tipo: "atribuido", centros_custo_ids: [], nome: "", descricao: "", ativo: true });
    setLinhasN2([{ ...LINHA_VAZIA }, { ...LINHA_VAZIA }]);
    setEditN2Id(null); setErroN2(null); setModalN2(true);
  };
  const abrirEditarN2 = (r: RateioRegra) => {
    const ids = r.centros_custo_ids?.length ? r.centros_custo_ids : (r.centro_custo_id ? [r.centro_custo_id] : []);
    setFN2({ fazenda_id: r.fazenda_id, ano_safra_id: r.ano_safra_id, tipo: r.tipo ?? "atribuido", centros_custo_ids: ids, nome: r.nome, descricao: r.descricao ?? "", ativo: r.ativo ?? true });
    setLinhasN2(r.linhas?.length ? r.linhas.map(l => ({ ciclo_id: l.ciclo_id ?? "", percentual: String(l.percentual), descricao: l.descricao ?? "" })) : [{ ...LINHA_VAZIA }, { ...LINHA_VAZIA }]);
    setEditN2Id(r.id); setErroN2(null); setModalN2(true);
  };

  const salvarN2 = async () => {
    if (!fN2.fazenda_id) { setErroN2("Selecione a Fazenda"); return; }
    if (!fN2.ano_safra_id) { setErroN2("Selecione o Ano Safra"); return; }
    if (!fN2.centros_custo_ids.length) { setErroN2("Selecione ao menos um Centro de Custo"); return; }
    if (!fN2.nome.trim()) { setErroN2("Informe o nome da regra"); return; }
    if (!somaOkN2) { setErroN2(`Os percentuais somam ${somaLinhasN2.toFixed(2)}% — devem totalizar 100%`); return; }
    setSalvandoN2(true); setErroN2(null);
    try {
      const lp: Omit<RateioRegraLinha, "id" | "regra_id" | "created_at">[] = linhasN2.map((l, i) => ({
        ciclo_id: l.ciclo_id || undefined,
        percentual: fN2.tipo === "area_plantada" ? 0 : (parseFloat(l.percentual) || 0),
        descricao: l.descricao || undefined,
        ordem: i,
      }));
      const header = {
        fazenda_id: fN2.fazenda_id,
        ano_safra_id: fN2.ano_safra_id,
        tipo: fN2.tipo,
        centro_custo_id: fN2.centros_custo_ids[0] ?? "",
        centros_custo_ids: fN2.centros_custo_ids,
        nome: fN2.nome.trim(),
        descricao: fN2.descricao || undefined,
        ativo: fN2.ativo,
      };
      if (editN2Id) await atualizarRateioRegra(editN2Id, header, lp);
      else await criarRateioRegra(header, lp);
      setModalN2(false); await carregar();
    } catch (e: unknown) { setErroN2(e instanceof Error ? e.message : "Erro ao salvar"); }
    finally { setSalvandoN2(false); }
  };

  // N2 filtros
  const regrasN2Filtradas = regrasN2.filter(r =>
    (!filtroAnoN2 || r.ano_safra_id === filtroAnoN2) &&
    (!filtroFazN2 || r.fazenda_id === filtroFazN2)
  );

  // ──────────────────────────────────────────────────────────────
  // NÍVEL 1 — Global → Fazendas
  // ──────────────────────────────────────────────────────────────

  const somaFazendas = fazLinhas.reduce((s, f) => s + (parseFloat(f.percentual) || 0), 0);
  const somaFazendasOk = fN1.tipo === "area_ciclos" || Math.abs(somaFazendas - 100) < 0.01;
  const n1Valido = fN1.nome.trim() && fN1.ano_safra_id && fazLinhas.length > 0 && somaFazendasOk;

  const addFazLinha = () => {
    const usadas = new Set(fazLinhas.map(f => f.fazenda_id));
    const proxima = todasFazendas.find(f => !usadas.has(f.id));
    setFazLinhas(p => [...p, { fazenda_id: proxima?.id ?? "", percentual: "" }]);
  };
  const removeFazLinha = (i: number) => setFazLinhas(p => p.filter((_, j) => j !== i));
  const setPctFazenda = (i: number, valor: string) => {
    setFazLinhas(p => {
      const next = p.map((l, j) => j === i ? { ...l, percentual: valor } : l);
      if (next.length === 2) {
        const outra = i === 0 ? 1 : 0;
        next[outra] = { ...next[outra], percentual: String(Math.max(0, 100 - (parseFloat(valor) || 0))) };
      }
      return next;
    });
  };

  const abrirNovoN1 = () => {
    setFN1({ nome: "", descricao: "", ano_safra_id: anos[0]?.id ?? "", tipo: "atribuido", centro_custo_id: "", ativo: true });
    setFazLinhas(todasFazendas.length >= 2
      ? [{ fazenda_id: todasFazendas[0].id, percentual: "50" }, { fazenda_id: todasFazendas[1].id, percentual: "50" }]
      : [{ fazenda_id: todasFazendas[0]?.id ?? "", percentual: "100" }]
    );
    setEditN1Id(null); setErroN1(null); setModalN1(true);
  };
  const abrirEditarN1 = (r: RateioGlobal) => {
    const anoId = r.ano_safra_id ?? anos.find(a => a.descricao === r.ano_safra_label)?.id ?? "";
    setFN1({ nome: r.nome, descricao: r.descricao ?? "", ano_safra_id: anoId, tipo: r.tipo ?? "atribuido", centro_custo_id: r.centro_custo_id ?? "", ativo: r.ativo ?? true });
    setFazLinhas((r.fazendas ?? []).map(faz => ({ fazenda_id: faz.fazenda_id, percentual: String(faz.percentual) })));
    setEditN1Id(r.id); setErroN1(null); setModalN1(true);
  };

  const salvarN1 = async () => {
    if (!contaId) return;
    if (!fN1.nome.trim()) { setErroN1("Informe o nome da regra"); return; }
    if (!fN1.ano_safra_id) { setErroN1("Selecione o Ano Safra"); return; }
    if (fazLinhas.length === 0) { setErroN1("Adicione ao menos uma fazenda"); return; }
    if (!somaFazendasOk) { setErroN1(`Fazendas somam ${somaFazendas.toFixed(1)}% — devem totalizar 100%`); return; }
    setSalvandoN1(true); setErroN1(null);
    try {
      const anoLabel = anos.find(a => a.id === fN1.ano_safra_id)?.descricao ?? "";
      const header = {
        conta_id: contaId,
        ano_safra_id: fN1.ano_safra_id,
        ano_safra_label: anoLabel,
        tipo: fN1.tipo,
        centro_custo_id: fN1.centro_custo_id || undefined,
        nome: fN1.nome.trim(),
        descricao: fN1.descricao || undefined,
        ativo: fN1.ativo,
      };
      const fazPayload = fazLinhas.map(faz => ({
        fazenda_id: faz.fazenda_id,
        percentual: fN1.tipo === "area_ciclos" ? 0 : (parseFloat(faz.percentual) || 0),
        ciclos: [],
      }));
      if (editN1Id) await atualizarRateioGlobal(editN1Id, header, fazPayload);
      else await criarRateioGlobal(header, fazPayload);
      setModalN1(false); await carregar();
    } catch (e: unknown) { setErroN1(e instanceof Error ? e.message : "Erro ao salvar"); }
    finally { setSalvandoN1(false); }
  };

  // ─── Render ───────────────────────────────────────────────────
  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh", background: "var(--bg-page)", fontFamily: "system-ui, sans-serif", fontSize: 13 }}>
      <TopNav />
      <main style={{ flex: 1 }}>
        <header style={{ background: "var(--bg-card)", borderBottom: "0.5px solid var(--border-table)", padding: "10px 22px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 17, color: "var(--text-1)", fontWeight: 600 }}>Regras de Rateio</h1>
            <p style={{ margin: 0, fontSize: 11, color: "var(--text-2)" }}>
              N1 = distribuição entre fazendas · N2 = distribuição entre ciclos dentro da fazenda
            </p>
          </div>
          <button style={btnV} onClick={tab === "n2" ? abrirNovoN2 : abrirNovoN1}>
            + Nova Regra
          </button>
        </header>

        {/* Tabs */}
        <div style={{ background: "var(--bg-card)", borderBottom: "0.5px solid var(--border-table)", padding: "0 22px", display: "flex", gap: 0 }}>
          {(["n2", "n1"] as const).map(t => (
            <button key={t} onClick={() => setTab(t)}
              style={{ padding: "10px 18px", border: "none", background: "transparent", cursor: "pointer", fontSize: 13, fontWeight: tab === t ? 700 : 400, color: tab === t ? "#2A2A2A" : "var(--text-2)", borderBottom: tab === t ? "2px solid #2A2A2A" : "2px solid transparent" }}
            >
              {t === "n2" ? "Nível 2 — Fazenda → Ciclos" : "Nível 1 — Global → Fazendas"}
              <span style={{ marginLeft: 6, fontSize: 11, background: tab === t ? "#E8E8E8" : "var(--bg-page)", color: tab === t ? "#0D0D0D" : "var(--text-3)", padding: "1px 6px", borderRadius: 10 }}>
                {t === "n2" ? regrasN2.length : regrasN1.length}
              </span>
            </button>
          ))}
        </div>

        <div style={{ padding: "18px 22px" }}>

          {/* ════════════════════ NÍVEL 2 ════════════════════ */}
          {tab === "n2" && (
            <>
              <div style={{ background: "#E8E8E8", border: "0.5px solid #11111140", borderRadius: 8, padding: "10px 14px", marginBottom: 16, fontSize: 12, color: "#0D0D0D" }}>
                <strong>Nível 2 — Fazenda → Ciclos:</strong> Distribui um Centro de Custo entre os ciclos (culturas) de <em>uma única fazenda</em>.
                Modo <strong>Atribuído</strong>: define % manualmente. Modo <strong>Por Área Plantada</strong>: o sistema calcula proporcionalmente à área de cada ciclo.
              </div>

              {/* Filtros */}
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14, flexWrap: "wrap" }}>
                <span style={{ fontSize: 12, color: "var(--text-2)" }}>Filtrar:</span>
                <select style={{ padding: "6px 10px", border: "0.5px solid var(--border-table)", borderRadius: 7, fontSize: 13, background: "var(--bg-card)", outline: "none" }}
                  value={filtroFazN2} onChange={e => setFiltroFazN2(e.target.value)}>
                  <option value="">Todas as fazendas</option>
                  {todasFazendas.map(f => <option key={f.id} value={f.id}>{f.nome}</option>)}
                </select>
                <select style={{ padding: "6px 10px", border: "0.5px solid var(--border-table)", borderRadius: 7, fontSize: 13, background: "var(--bg-card)", outline: "none" }}
                  value={filtroAnoN2} onChange={e => setFiltroAnoN2(e.target.value)}>
                  <option value="">Todos os anos</option>
                  {anos.map(a => <option key={a.id} value={a.id}>{a.descricao}</option>)}
                </select>
                {(filtroAnoN2 || filtroFazN2) && (
                  <button style={{ ...btnR, fontSize: 11, padding: "4px 10px" }} onClick={() => { setFiltroAnoN2(""); setFiltroFazN2(""); }}>Limpar</button>
                )}
                <span style={{ marginLeft: "auto", fontSize: 11, color: "var(--text-3)" }}>
                  {regrasN2Filtradas.length} regra{regrasN2Filtradas.length !== 1 ? "s" : ""}
                </span>
              </div>

              {loading ? (
                <div style={{ textAlign: "center", padding: 48, color: "var(--text-2)" }}>Carregando...</div>
              ) : regrasN2Filtradas.length === 0 ? (
                <div style={{ background: "var(--bg-card)", border: "0.5px solid var(--border-table)", borderRadius: 12, padding: 48, textAlign: "center", color: "var(--text-2)" }}>
                  Nenhuma regra N2 cadastrada. Clique em "+ Nova Regra".
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {regrasN2Filtradas.map(r => {
                    const linhasR = r.linhas ?? [];
                    const isAuto = r.tipo === "area_plantada";
                    return (
                      <div key={r.id} style={{ background: "var(--bg-card)", border: "0.5px solid var(--border-table)", borderRadius: 12, padding: "14px 18px" }}>
                        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6, flexWrap: "wrap" }}>
                              <span style={{ fontSize: 11, background: "#E8E8E8", color: "#0D0D0D", padding: "2px 8px", borderRadius: 6, fontWeight: 600 }}>{nomeAno(r.ano_safra_id)}</span>
                              <span style={{ fontSize: 11, background: "var(--bg-page)", color: "var(--text-2)", padding: "2px 8px", borderRadius: 6, border: "0.5px solid var(--border-table)" }}>{nomeFaz(r.fazenda_id)}</span>
                              {isAuto
                                ? <span style={{ fontSize: 10, background: "#DCFCE7", color: "#166534", padding: "2px 8px", borderRadius: 6, fontWeight: 600 }}>Por Área Plantada</span>
                                : <span style={{ fontSize: 10, background: "var(--bg-page)", color: "var(--text-3)", padding: "2px 8px", borderRadius: 6 }}>Atribuído</span>
                              }
                              <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text-1)" }}>{r.nome}</span>
                              {!r.ativo && <span style={{ fontSize: 10, background: "var(--bg-page)", color: "var(--text-3)", padding: "2px 8px", borderRadius: 6 }}>Inativa</span>}
                            </div>
                            <div style={{ fontSize: 12, color: "var(--text-2)", marginBottom: 8, display: "flex", gap: 4, flexWrap: "wrap", alignItems: "center" }}>
                              <span style={{ color: "var(--text-3)" }}>CC:</span>
                              {(r.centros_custo_ids?.length ? r.centros_custo_ids : (r.centro_custo_id ? [r.centro_custo_id] : [])).map(id => (
                                <span key={id} style={{ fontSize: 11, background: "#F2F2F2", color: "#111111", padding: "2px 7px", borderRadius: 5, fontWeight: 600, border: "0.5px solid #B8D4F0" }}>{nomeCC(id)}</span>
                              ))}
                            </div>
                            {isAuto ? (
                              <div style={{ fontSize: 11, color: "var(--text-2)", fontStyle: "italic" }}>
                                Proporções calculadas automaticamente pela área plantada de cada ciclo no Ano Safra
                              </div>
                            ) : linhasR.length > 0 && (
                              <>
                                <div style={{ display: "flex", height: 16, borderRadius: 4, overflow: "hidden", border: "0.5px solid var(--border-table)", marginBottom: 6 }}>
                                  {linhasR.map((l, i) => (
                                    <div key={i} style={{ width: `${l.percentual}%`, background: CORES[i % CORES.length], display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 9, fontWeight: 700, minWidth: l.percentual > 0 ? 20 : 0 }}>
                                      {l.percentual > 8 ? `${l.percentual}%` : ""}
                                    </div>
                                  ))}
                                </div>
                                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                                  {linhasR.map((l, i) => (
                                    <div key={i} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, padding: "3px 8px", borderRadius: 6, background: "var(--bg-page)", border: "0.5px solid var(--border-table)" }}>
                                      <span style={{ width: 8, height: 8, borderRadius: 2, background: CORES[i % CORES.length], display: "inline-block" }} />
                                      <span style={{ fontWeight: 600 }}>{l.percentual}%</span>
                                      <span style={{ color: "var(--text-2)" }}>{nomeCiclo(r.fazenda_id, l.ciclo_id)}</span>
                                    </div>
                                  ))}
                                </div>
                              </>
                            )}
                          </div>
                          <div style={{ display: "flex", gap: 5, flexShrink: 0 }}>
                            <button style={btnR} onClick={() => abrirEditarN2(r)}>Editar</button>
                            <button style={btnX} onClick={async () => { if (confirm(`Excluir regra "${r.nome}"?`)) { await excluirRateioRegra(r.id); await carregar(); } }}>✕</button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}

          {/* ════════════════════ NÍVEL 1 ════════════════════ */}
          {tab === "n1" && (
            <>
              <div style={{ background: "#FBF3E0", border: "0.5px solid #C9921B40", borderRadius: 8, padding: "10px 14px", marginBottom: 16, fontSize: 12, color: "#633806" }}>
                <strong>Nível 1 — Global → Fazendas:</strong> Distribui um custo entre <em>todas as fazendas</em> da conta.
                Modo <strong>Atribuído</strong>: define % por fazenda manualmente. Modo <strong>Por Área dos Ciclos</strong>: o sistema calcula proporcionalmente à soma das áreas de todos os ciclos de cada fazenda no Ano Safra.
              </div>

              {loading ? (
                <div style={{ textAlign: "center", padding: 48, color: "var(--text-2)" }}>Carregando...</div>
              ) : regrasN1.length === 0 ? (
                <div style={{ background: "var(--bg-card)", border: "0.5px solid var(--border-table)", borderRadius: 12, padding: 48, textAlign: "center", color: "var(--text-2)" }}>
                  Nenhuma regra N1 cadastrada. Clique em "+ Nova Regra".
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {regrasN1.map(r => {
                    const faz = r.fazendas ?? [];
                    const anoDesc = r.ano_safra_id ? nomeAno(r.ano_safra_id) : r.ano_safra_label;
                    const isAuto = r.tipo === "area_ciclos";
                    return (
                      <div key={r.id} style={{ background: "var(--bg-card)", border: "0.5px solid var(--border-table)", borderRadius: 12, padding: "14px 18px" }}>
                        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6, flexWrap: "wrap" }}>
                              <span style={{ fontSize: 11, background: "#FBF3E0", color: "#633806", padding: "2px 8px", borderRadius: 6, fontWeight: 600 }}>{anoDesc}</span>
                              {isAuto
                                ? <span style={{ fontSize: 10, background: "#DCFCE7", color: "#166534", padding: "2px 8px", borderRadius: 6, fontWeight: 600 }}>Por Área dos Ciclos</span>
                                : <span style={{ fontSize: 10, background: "var(--bg-page)", color: "var(--text-3)", padding: "2px 8px", borderRadius: 6 }}>Atribuído</span>
                              }
                              <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text-1)" }}>{r.nome}</span>
                              {r.centro_custo_id && <span style={{ fontSize: 11, color: "var(--text-2)" }}>CC: {nomeCC(r.centro_custo_id)}</span>}
                              {!r.ativo && <span style={{ fontSize: 10, background: "var(--bg-page)", color: "var(--text-3)", padding: "2px 8px", borderRadius: 6 }}>Inativa</span>}
                            </div>
                            {r.descricao && <div style={{ fontSize: 12, color: "var(--text-3)", marginBottom: 8 }}>{r.descricao}</div>}

                            {isAuto ? (
                              <div style={{ fontSize: 11, color: "var(--text-2)", fontStyle: "italic" }}>
                                Fazendas participantes: {faz.map(f => nomeFaz(f.fazenda_id)).join(", ")} · Proporções calculadas automaticamente pela área dos ciclos
                              </div>
                            ) : faz.length > 0 && (
                              <>
                                <div style={{ display: "flex", height: 20, borderRadius: 5, overflow: "hidden", border: "0.5px solid var(--border-table)" }}>
                                  {faz.map((f, i) => (
                                    <div key={i} style={{ width: `${f.percentual}%`, background: CORES[i % CORES.length], display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 9, fontWeight: 700, minWidth: 24 }}>
                                      {f.percentual > 8 ? `${f.percentual}%` : ""}
                                    </div>
                                  ))}
                                </div>
                                <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 6 }}>
                                  {faz.map((f, i) => (
                                    <div key={i} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, padding: "3px 10px", borderRadius: 6, background: "var(--bg-page)", border: "0.5px solid var(--border-table)" }}>
                                      <span style={{ width: 8, height: 8, borderRadius: 2, background: CORES[i % CORES.length], display: "inline-block" }} />
                                      <span style={{ fontWeight: 600 }}>{f.percentual}%</span>
                                      <span style={{ color: "var(--text-2)" }}>{nomeFaz(f.fazenda_id)}</span>
                                    </div>
                                  ))}
                                </div>
                              </>
                            )}
                          </div>
                          <div style={{ display: "flex", gap: 5, flexShrink: 0 }}>
                            <button style={btnR} onClick={() => abrirEditarN1(r)}>Editar</button>
                            <button style={btnX} onClick={async () => { if (confirm(`Excluir regra "${r.nome}"?`)) { await excluirRateioGlobal(r.id); await carregar(); } }}>✕</button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </div>
      </main>

      {/* ══════════════════════════════════════════════════════════
          MODAL — Regra N2 (Fazenda → Ciclos)
      ══════════════════════════════════════════════════════════ */}
      {modalN2 && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 2000 }}
         >
          <div style={{ background: "var(--bg-card)", borderRadius: 14, width: 780, maxWidth: "97vw", maxHeight: "92vh", overflowY: "auto" }}>
            <div style={{ padding: "16px 22px", borderBottom: "0.5px solid var(--border-table)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <div style={{ fontWeight: 600, fontSize: 15 }}>{editN2Id ? "Editar Regra N2" : "Nova Regra N2 — Fazenda → Ciclos"}</div>
                <div style={{ fontSize: 11, color: "var(--text-2)", marginTop: 2 }}>Distribui um custo entre os ciclos de uma fazenda</div>
              </div>
              <button onClick={() => setModalN2(false)} style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer", color: "var(--text-2)" }}>×</button>
            </div>
            <div style={{ padding: 22 }}>

              {/* Tipo de distribuição */}
              <div style={{ marginBottom: 16, display: "flex", gap: 10 }}>
                {(["atribuido", "area_plantada"] as const).map(t => (
                  <button key={t} onClick={() => setFN2(p => ({ ...p, tipo: t }))}
                    style={{ flex: 1, padding: "10px 14px", borderRadius: 8, border: `1.5px solid ${fN2.tipo === t ? "#2A2A2A" : "var(--border-table)"}`, background: fN2.tipo === t ? "#E8E8E8" : "var(--bg-page)", cursor: "pointer", textAlign: "left" }}>
                    <div style={{ fontWeight: 700, fontSize: 13, color: fN2.tipo === t ? "#0D0D0D" : "var(--text-1)" }}>
                      {t === "atribuido" ? "Atribuído" : "Por Área Plantada"}
                    </div>
                    <div style={{ fontSize: 11, color: "var(--text-2)", marginTop: 3 }}>
                      {t === "atribuido" ? "Define os percentuais manualmente" : "Proporções calculadas automaticamente pela área de cada ciclo"}
                    </div>
                  </button>
                ))}
              </div>

              {/* Campos principais */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 14 }}>
                <div>
                  <label style={lbl}>Fazenda *</label>
                  <select style={inp} value={fN2.fazenda_id} onChange={e => setFN2(p => ({ ...p, fazenda_id: e.target.value, centros_custo_ids: [] }))}>
                    <option value="">— Selecionar —</option>
                    {todasFazendas.map(f => <option key={f.id} value={f.id}>{f.nome}</option>)}
                  </select>
                </div>
                <div>
                  <label style={lbl}>Ano Safra *</label>
                  <select style={{ ...inp, borderColor: !fN2.ano_safra_id ? "#E24B4A80" : "var(--border-table)" }} value={fN2.ano_safra_id} onChange={e => setFN2(p => ({ ...p, ano_safra_id: e.target.value }))}>
                    <option value="">— Selecionar —</option>
                    {anos.map(a => <option key={a.id} value={a.id}>{a.descricao}</option>)}
                  </select>
                </div>
                <div>
                  <label style={lbl}>Nome da Regra *</label>
                  <input style={inp} value={fN2.nome} onChange={e => setFN2(p => ({ ...p, nome: e.target.value }))} placeholder="Ex: Regra Soja 25/26" />
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: 12, marginBottom: 16 }}>
                <div>
                  <label style={lbl}>
                    Centros de Custo *
                    {fN2.centros_custo_ids.length > 0 && (
                      <span style={{ marginLeft: 6, fontSize: 10, background: "#2A2A2A", color: "#fff", borderRadius: 10, padding: "1px 7px" }}>{fN2.centros_custo_ids.length}</span>
                    )}
                  </label>
                  <div style={{ border: fN2.centros_custo_ids.length === 0 ? "0.5px solid #E24B4A80" : "0.5px solid var(--border-table)", borderRadius: 7, maxHeight: 130, overflowY: "auto", background: "var(--bg-page)", padding: "6px 10px" }}>
                    {ccs.filter(c => c.parent_id).map(cc => (
                      <label key={cc.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "3px 2px", cursor: "pointer" }}>
                        <input type="checkbox" checked={fN2.centros_custo_ids.includes(cc.id)}
                          onChange={e => {
                            const ids = e.target.checked ? [...fN2.centros_custo_ids, cc.id] : fN2.centros_custo_ids.filter(id => id !== cc.id);
                            setFN2(p => ({ ...p, centros_custo_ids: ids }));
                          }}
                          style={{ accentColor: "#2A2A2A", width: 14, height: 14, flexShrink: 0 }} />
                        <span style={{ fontSize: 12, color: "var(--text-1)" }}>{cc.codigo ? `${cc.codigo} · ` : ""}{cc.nome}</span>
                      </label>
                    ))}
                  </div>
                </div>
                <div>
                  <label style={lbl}>Descrição</label>
                  <input style={inp} value={fN2.descricao} onChange={e => setFN2(p => ({ ...p, descricao: e.target.value }))} placeholder="Opcional" />
                </div>
              </div>

              {/* Seção de distribuição — condicional por tipo */}
              {fN2.tipo === "area_plantada" ? (
                <div style={{ background: "#DCFCE7", border: "0.5px solid #16A34A40", borderRadius: 8, padding: "12px 16px", marginBottom: 16, fontSize: 12, color: "#166534" }}>
                  <strong>Cálculo automático ativo</strong> — o sistema distribuirá o custo proporcionalmente à área plantada (ha) de cada ciclo cadastrado no Ano Safra selecionado.
                  Não é necessário informar percentuais. O cálculo será feito no fechamento da DRE.
                  {ciclosModalN2.length > 0 && (
                    <div style={{ marginTop: 8, display: "flex", gap: 6, flexWrap: "wrap" }}>
                      {ciclosModalN2.map(c => (
                        <span key={c.id} style={{ fontSize: 11, background: "#fff", color: "#166534", padding: "2px 8px", borderRadius: 5, border: "0.5px solid #16A34A40" }}>
                          {CULT[c.cultura] ?? c.cultura}{c.area_plantada_ha ? ` · ${c.area_plantada_ha} ha` : ""}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <>
                  {/* Barra visual */}
                  <div style={{ marginBottom: 14 }}>
                    <div style={{ fontSize: 11, color: "var(--text-2)", marginBottom: 5, fontWeight: 600, textTransform: "uppercase" }}>
                      Distribuição do Custo
                      <span style={{ marginLeft: 10, fontWeight: 400, color: somaOkN2 ? "#16A34A" : somaLinhasN2 > 100 ? "#E24B4A" : "#C9921B" }}>
                        {somaLinhasN2.toFixed(1)}% de 100%
                      </span>
                    </div>
                    <div style={{ display: "flex", height: 20, borderRadius: 6, overflow: "hidden", border: "0.5px solid var(--border-table)", background: "var(--bg-page)" }}>
                      {linhasN2.map((l, i) => {
                        const pct = Math.min(100, parseFloat(l.percentual) || 0);
                        return pct > 0 ? (
                          <div key={i} style={{ width: `${pct}%`, background: CORES[i % CORES.length], display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 10, fontWeight: 700, transition: "width 0.15s" }}>
                            {pct > 5 ? `${pct}%` : ""}
                          </div>
                        ) : null;
                      })}
                    </div>
                  </div>

                  {/* Linhas de ciclos */}
                  <div style={{ background: "var(--bg-page)", border: "0.5px solid var(--border-table)", borderRadius: 8, padding: "12px 14px", marginBottom: 16 }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                      <span style={{ fontSize: 11, fontWeight: 600, color: "var(--text-2)", textTransform: "uppercase" }}>Destinos *</span>
                      <button style={{ ...btnR, fontSize: 11, padding: "4px 12px", background: "var(--bg-card)" }} onClick={addLinhaN2}>+ Ciclo</button>
                    </div>
                    {linhasN2.map((l, i) => (
                      <div key={i} style={{ display: "grid", gridTemplateColumns: "16px 2fr 80px 2fr 32px", gap: 8, alignItems: "center", marginBottom: i < linhasN2.length - 1 ? 8 : 0 }}>
                        <div style={{ width: 12, height: 12, borderRadius: 3, background: CORES[i % CORES.length] }} />
                        <select style={inp} value={l.ciclo_id} onChange={e => setLinhaFieldN2(i, "ciclo_id", e.target.value)}>
                          <option value="">— Ciclo —</option>
                          {ciclosModalN2.map(c => <option key={c.id} value={c.id}>{CULT[c.cultura] ?? c.cultura}</option>)}
                        </select>
                        <div style={{ position: "relative" }}>
                          <InputNumerico style={{ ...inp, paddingRight: 20 }} min="0" max="100" placeholder="0" value={l.percentual} onChange={v => setPctLinhaN2(i, v)} />
                          <span style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", fontSize: 12, color: "var(--text-3)", pointerEvents: "none" }}>%</span>
                        </div>
                        <input style={inp} placeholder="Observação" value={l.descricao} onChange={e => setLinhaFieldN2(i, "descricao", e.target.value)} />
                        <button style={{ ...btnX, padding: "5px 7px" }} onClick={() => removeLinhaN2(i)} disabled={linhasN2.length <= 1}>✕</button>
                      </div>
                    ))}
                    {linhasN2.length > 0 && (
                      <div style={{ marginTop: 10, padding: "6px 10px", borderRadius: 6, background: somaOkN2 ? "#DCFCE7" : somaLinhasN2 > 100 ? "#FCEBEB" : "#FBF3E0", fontSize: 12, color: somaOkN2 ? "#166534" : "#633806", fontWeight: 600 }}>
                        Total: {somaLinhasN2.toFixed(2)}%{somaOkN2 ? " ✓" : somaLinhasN2 > 100 ? ` — excede ${(somaLinhasN2 - 100).toFixed(2)}%` : ` — faltam ${(100 - somaLinhasN2).toFixed(2)}%`}
                      </div>
                    )}
                  </div>
                </>
              )}

              <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, cursor: "pointer", marginBottom: 16 }}>
                <input type="checkbox" checked={fN2.ativo} onChange={e => setFN2(p => ({ ...p, ativo: e.target.checked }))} />
                Regra ativa
              </label>

              {erroN2 && <div style={{ background: "#FCEBEB", border: "0.5px solid #E24B4A60", borderRadius: 7, padding: "8px 12px", marginBottom: 12, fontSize: 12, color: "#791F1F" }}>{erroN2}</div>}
              <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                <button style={btnR} onClick={() => setModalN2(false)}>Cancelar</button>
                <button
                  style={{ ...btnV, opacity: salvandoN2 || !fN2.nome.trim() || !fN2.ano_safra_id || !fN2.fazenda_id || !fN2.centros_custo_ids.length || !somaOkN2 ? 0.5 : 1 }}
                  disabled={salvandoN2 || !fN2.nome.trim() || !fN2.ano_safra_id || !fN2.fazenda_id || !fN2.centros_custo_ids.length || !somaOkN2}
                  onClick={salvarN2}
                >
                  {salvandoN2 ? "Salvando…" : editN2Id ? "Salvar" : "Criar Regra N2"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════
          MODAL — Regra N1 (Global → Fazendas)
      ══════════════════════════════════════════════════════════ */}
      {modalN1 && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 2000 }}
         >
          <div style={{ background: "var(--bg-card)", borderRadius: 14, width: 820, maxWidth: "97vw", maxHeight: "92vh", overflowY: "auto" }}>
            <div style={{ padding: "16px 22px", borderBottom: "0.5px solid var(--border-table)", display: "flex", justifyContent: "space-between", alignItems: "center", position: "sticky", top: 0, background: "var(--bg-card)", zIndex: 1 }}>
              <div>
                <div style={{ fontWeight: 600, fontSize: 15 }}>{editN1Id ? "Editar Regra N1" : "Nova Regra N1 — Global → Fazendas"}</div>
                <div style={{ fontSize: 11, color: "var(--text-2)", marginTop: 2 }}>Distribui um custo entre todas as fazendas da conta</div>
              </div>
              <button onClick={() => setModalN1(false)} style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer", color: "var(--text-2)" }}>×</button>
            </div>
            <div style={{ padding: 22 }}>

              {/* Tipo de distribuição */}
              <div style={{ marginBottom: 16, display: "flex", gap: 10 }}>
                {(["atribuido", "area_ciclos"] as const).map(t => (
                  <button key={t} onClick={() => setFN1(p => ({ ...p, tipo: t }))}
                    style={{ flex: 1, padding: "10px 14px", borderRadius: 8, border: `1.5px solid ${fN1.tipo === t ? "#C9921B" : "var(--border-table)"}`, background: fN1.tipo === t ? "#FBF3E0" : "var(--bg-page)", cursor: "pointer", textAlign: "left" }}>
                    <div style={{ fontWeight: 700, fontSize: 13, color: fN1.tipo === t ? "#633806" : "var(--text-1)" }}>
                      {t === "atribuido" ? "Atribuído" : "Por Área dos Ciclos"}
                    </div>
                    <div style={{ fontSize: 11, color: "var(--text-2)", marginTop: 3 }}>
                      {t === "atribuido" ? "Define o % de cada fazenda manualmente" : "Proporções calculadas pela soma das áreas de todos os ciclos da fazenda no Ano Safra"}
                    </div>
                  </button>
                ))}
              </div>

              {/* Cabeçalho */}
              <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 2fr", gap: 12, marginBottom: 14 }}>
                <div>
                  <label style={lbl}>Nome da Regra *</label>
                  <input style={inp} value={fN1.nome} onChange={e => setFN1(p => ({ ...p, nome: e.target.value }))} placeholder="Ex: Colheitadeira JD S780 — Safra 25/26" />
                </div>
                <div>
                  <label style={lbl}>Ano Safra *</label>
                  <select style={{ ...inp, borderColor: !fN1.ano_safra_id ? "#E24B4A80" : "var(--border-table)" }} value={fN1.ano_safra_id} onChange={e => setFN1(p => ({ ...p, ano_safra_id: e.target.value }))}>
                    <option value="">— Selecionar —</option>
                    {anos.map(a => <option key={a.id} value={a.id}>{a.descricao}</option>)}
                  </select>
                </div>
                <div>
                  <label style={lbl}>Descrição / Justificativa</label>
                  <input style={inp} value={fN1.descricao} onChange={e => setFN1(p => ({ ...p, descricao: e.target.value }))} placeholder="Opcional" />
                </div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 12, marginBottom: 20, alignItems: "flex-end" }}>
                <div>
                  <label style={lbl}>Centro de Custo de Origem (opcional)</label>
                  <select style={inp} value={fN1.centro_custo_id} onChange={e => setFN1(p => ({ ...p, centro_custo_id: e.target.value }))}>
                    <option value="">— Sem vínculo —</option>
                    {ccs.filter(c => c.parent_id).map(cc => <option key={cc.id} value={cc.id}>{cc.codigo ? `${cc.codigo} · ` : ""}{cc.nome}</option>)}
                  </select>
                </div>
                <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, cursor: "pointer", paddingBottom: 2 }}>
                  <input type="checkbox" checked={fN1.ativo} onChange={e => setFN1(p => ({ ...p, ativo: e.target.checked }))} />
                  Regra ativa
                </label>
              </div>

              {/* Distribuição entre fazendas */}
              <div style={{ background: "var(--bg-page)", border: "0.5px solid var(--border-table)", borderRadius: 10, padding: "14px 16px", marginBottom: 16 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: "#C9921B", textTransform: "uppercase" }}>Fazendas Participantes</div>
                    <div style={{ fontSize: 11, color: "var(--text-2)", marginTop: 2 }}>
                      {fN1.tipo === "area_ciclos"
                        ? "Selecione quais fazendas participam do rateio — proporções calculadas automaticamente"
                        : "Defina o % de cada fazenda — soma deve ser 100%"
                      }
                    </div>
                  </div>
                  {todasFazendas.length > fazLinhas.length && (
                    <button style={{ ...btnR, fontSize: 11, padding: "4px 12px", background: "var(--bg-card)" }} onClick={addFazLinha}>+ Fazenda</button>
                  )}
                </div>

                {/* Barra visual (só no modo atribuído) */}
                {fN1.tipo === "atribuido" && fazLinhas.some(f => parseFloat(f.percentual) > 0) && (
                  <div style={{ display: "flex", height: 22, borderRadius: 6, overflow: "hidden", border: "0.5px solid var(--border-table)", background: "var(--bg-card)", marginBottom: 12 }}>
                    {fazLinhas.map((faz, i) => {
                      const pct = Math.min(100, parseFloat(faz.percentual) || 0);
                      return pct > 0 ? (
                        <div key={i} style={{ width: `${pct}%`, background: CORES[i % CORES.length], display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 10, fontWeight: 700, transition: "width 0.15s" }}>
                          {pct > 6 ? `${nomeFaz(faz.fazenda_id).substring(0, 10)} ${pct}%` : ""}
                        </div>
                      ) : null;
                    })}
                  </div>
                )}

                {fazLinhas.map((faz, i) => (
                  <div key={i} style={{ display: "grid", gridTemplateColumns: `16px 1fr ${fN1.tipo === "atribuido" ? "100px" : "auto"} 32px`, gap: 8, alignItems: "center", marginBottom: i < fazLinhas.length - 1 ? 8 : 0 }}>
                    <div style={{ width: 12, height: 12, borderRadius: 3, background: CORES[i % CORES.length] }} />
                    <select style={inp} value={faz.fazenda_id} onChange={e => setFazLinhas(p => p.map((l, j) => j === i ? { ...l, fazenda_id: e.target.value } : l))}>
                      <option value="">— Fazenda —</option>
                      {todasFazendas.map(f => <option key={f.id} value={f.id}>{f.nome}</option>)}
                    </select>
                    {fN1.tipo === "atribuido" ? (
                      <div style={{ position: "relative" }}>
                        <InputNumerico style={{ ...inp, paddingRight: 20 }} min="0" max="100" placeholder="0" value={faz.percentual} onChange={v => setPctFazenda(i, v)} />
                        <span style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", fontSize: 12, color: "var(--text-3)", pointerEvents: "none" }}>%</span>
                      </div>
                    ) : (
                      <span style={{ fontSize: 11, color: "var(--text-2)", whiteSpace: "nowrap" }}>auto</span>
                    )}
                    <button style={{ ...btnX, padding: "5px 7px" }} onClick={() => removeFazLinha(i)} disabled={fazLinhas.length <= 1}>✕</button>
                  </div>
                ))}

                {fN1.tipo === "atribuido" && (
                  <div style={{ marginTop: 10, padding: "6px 10px", borderRadius: 6, background: somaFazendasOk ? "#DCFCE7" : somaFazendas > 100 ? "#FCEBEB" : "#FBF3E0", fontSize: 12, color: somaFazendasOk ? "#166534" : "#633806", fontWeight: 600 }}>
                    Total fazendas: {somaFazendas.toFixed(2)}%{somaFazendasOk ? " ✓" : somaFazendas > 100 ? ` — excede ${(somaFazendas - 100).toFixed(2)}%` : ` — faltam ${(100 - somaFazendas).toFixed(2)}%`}
                  </div>
                )}

                {fN1.tipo === "area_ciclos" && (
                  <div style={{ marginTop: 10, padding: "8px 12px", borderRadius: 6, background: "#DCFCE7", border: "0.5px solid #16A34A40", fontSize: 12, color: "#166534" }}>
                    As proporções serão calculadas automaticamente no fechamento da DRE, com base na soma das áreas (ha) dos ciclos cadastrados para cada fazenda no Ano Safra selecionado.
                  </div>
                )}
              </div>

              {erroN1 && <div style={{ background: "#FCEBEB", border: "0.5px solid #E24B4A60", borderRadius: 7, padding: "8px 12px", marginBottom: 12, fontSize: 12, color: "#791F1F" }}>{erroN1}</div>}
              <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                <button style={btnR} onClick={() => setModalN1(false)}>Cancelar</button>
                <button
                  style={{ ...btnV, background: "#C9921B", opacity: salvandoN1 || !n1Valido ? 0.5 : 1 }}
                  disabled={salvandoN1 || !n1Valido}
                  onClick={salvarN1}
                >
                  {salvandoN1 ? "Salvando…" : editN1Id ? "Salvar Alterações" : "Criar Regra N1"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
