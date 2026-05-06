"use client";
import { useState, useEffect, useCallback } from "react";
import TopNav from "../../../components/TopNav";
import { useAuth } from "../../../components/AuthProvider";
import {
  listarRegrasRateio, criarRateioRegra, atualizarRateioRegra, excluirRateioRegra,
  listarRegrasRateioGlobal, criarRateioGlobal, atualizarRateioGlobal, excluirRateioGlobal,
  listarTodosCiclos, listarAnosSafra, listarCentrosCustoGeral, listarFazendas,
} from "../../../lib/db";
import type { RateioRegra, RateioRegraLinha, RateioGlobal, Ciclo, AnoSafra, CentroCusto, Fazenda } from "../../../lib/supabase";

const inp: React.CSSProperties = { width: "100%", padding: "7px 10px", border: "0.5px solid #D4DCE8", borderRadius: 7, fontSize: 13, color: "#1a1a1a", background: "#fff", boxSizing: "border-box", outline: "none" };
const lbl: React.CSSProperties = { fontSize: 11, color: "#555", marginBottom: 3, display: "block" };
const btnV: React.CSSProperties = { padding: "8px 18px", background: "#1A5CB8", color: "#fff", border: "none", borderRadius: 8, fontWeight: 600, cursor: "pointer", fontSize: 13 };
const btnR: React.CSSProperties = { padding: "7px 14px", border: "0.5px solid #D4DCE8", borderRadius: 8, background: "#fff", cursor: "pointer", fontSize: 12, color: "#555" };
const btnX: React.CSSProperties = { padding: "3px 8px", border: "0.5px solid #E24B4A50", borderRadius: 6, background: "#FCEBEB", cursor: "pointer", fontSize: 11, color: "#791F1F" };

const CULT: Record<string, string> = {
  soja: "Soja", milho1: "Milho 1ª", milho2: "Milho 2ª",
  algodao: "Algodão", sorgo: "Sorgo", trigo: "Trigo",
};
const CORES = ["#1A5CB8", "#C9921B", "#16A34A", "#E24B4A", "#7C3AED", "#0891B2", "#B45309", "#6B7280"];
const CORES_FAZ = ["#1A5CB8", "#C9921B", "#16A34A", "#E24B4A", "#7C3AED", "#0891B2", "#B45309", "#6B7280"];

// ── Tipos para formulários ────────────────────────────────────
type LinhaForm = { ciclo_id: string; percentual: string; descricao: string };
const LINHA_VAZIA: LinhaForm = { ciclo_id: "", percentual: "", descricao: "" };

type CicloGlobalForm = { ciclo_id: string; percentual: string; descricao: string };
type FazendaGlobalForm = { fazenda_id: string; percentual: string; ciclos: CicloGlobalForm[] };

// ── Componente principal ──────────────────────────────────────
export default function RateioPage() {
  const { fazendaId, contaId } = useAuth();

  // ── Dados comuns ──
  const [todasFazendas, setTodasFazendas] = useState<Fazenda[]>([]);
  const [ciclosPorFazenda, setCiclosPorFazenda] = useState<Record<string, Ciclo[]>>({});
  const [anos, setAnos] = useState<AnoSafra[]>([]);
  const [ccs, setCcs] = useState<CentroCusto[]>([]);
  const [loading, setLoading] = useState(true);

  // ── Tab ──
  const [tab, setTab] = useState<"ciclo" | "global">("ciclo");

  // ── Regras por Ciclo ──
  const [regras, setRegras] = useState<RateioRegra[]>([]);
  const [filtroAno, setFiltroAno] = useState("");
  const [modalCiclo, setModalCiclo] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [f, setF] = useState({ ano_safra_id: "", centro_custo_id: "", nome: "", descricao: "", ativo: true });
  const [linhas, setLinhas] = useState<LinhaForm[]>([{ ...LINHA_VAZIA }, { ...LINHA_VAZIA }]);
  const [erroCiclo, setErroCiclo] = useState<string | null>(null);
  const [salvandoCiclo, setSalvandoCiclo] = useState(false);

  // ── Regras Globais ──
  const [regrasGlobal, setRegrasGlobal] = useState<RateioGlobal[]>([]);
  const [modalGlobal, setModalGlobal] = useState(false);
  const [editGlobalId, setEditGlobalId] = useState<string | null>(null);
  const [gf, setGf] = useState({ nome: "", descricao: "", ano_safra_label: "", centro_custo_id: "", ativo: true });
  const [fazLinhas, setFazLinhas] = useState<FazendaGlobalForm[]>([]);
  const [erroGlobal, setErroGlobal] = useState<string | null>(null);
  const [salvandoGlobal, setSalvandoGlobal] = useState(false);

  // ── Carregar dados comuns ──
  const carregar = useCallback(async () => {
    if (!fazendaId || !contaId) return;
    setLoading(true);
    try {
      const [faz, r, rg, a, cc] = await Promise.all([
        listarFazendas(),
        listarRegrasRateio(fazendaId),
        listarRegrasRateioGlobal(contaId),
        listarAnosSafra(fazendaId),
        listarCentrosCustoGeral(fazendaId),
      ]);
      setTodasFazendas(faz);
      setRegras(r);
      setRegrasGlobal(rg);
      setAnos(a);
      setCcs(cc);

      // Carregar ciclos de todas as fazendas
      const map: Record<string, Ciclo[]> = {};
      await Promise.all(faz.map(async f => {
        const ciclos = await listarTodosCiclos(f.id);
        map[f.id] = ciclos;
      }));
      setCiclosPorFazenda(map);
    } finally {
      setLoading(false);
    }
  }, [fazendaId, contaId]);

  useEffect(() => { carregar(); }, [carregar]);

  // ── Helpers de labels ──
  const nomeCiclo = (fazId: string | undefined, cicloId: string | undefined) => {
    if (!cicloId) return "Sem ciclo";
    const ciclos = fazId ? (ciclosPorFazenda[fazId] ?? []) : Object.values(ciclosPorFazenda).flat();
    const c = ciclos.find(x => x.id === cicloId);
    if (!c) return "—";
    return CULT[c.cultura] ?? c.cultura;
  };
  const nomeCC  = (id?: string) => ccs.find(x => x.id === id)?.nome ?? "—";
  const nomeFaz = (id: string)  => todasFazendas.find(f => f.id === id)?.nome ?? id;
  const nomeAno = (id: string)  => anos.find(a => a.id === id)?.descricao ?? "—";

  // ── Anos únicos para o modal global ──
  const anosUnicos = [...new Set(
    Object.values(ciclosPorFazenda).flat()
      .map(c => anos.find(a => a.id === c.ano_safra_id)?.descricao)
      .filter(Boolean) as string[]
  )].sort().reverse();

  // ──────────────────────────────────────────────────────────────
  // REGRAS POR CICLO — lógica
  // ──────────────────────────────────────────────────────────────
  const ciclosModal = f.ano_safra_id
    ? (ciclosPorFazenda[fazendaId ?? ""] ?? []).filter(c => c.ano_safra_id === f.ano_safra_id)
    : (ciclosPorFazenda[fazendaId ?? ""] ?? []);

  const regrasFiltradas = filtroAno ? regras.filter(r => r.ano_safra_id === filtroAno) : regras;
  const somaLinhas = linhas.reduce((s, l) => s + (parseFloat(l.percentual) || 0), 0);
  const somaOk = Math.abs(somaLinhas - 100) < 0.01;

  const addLinha = () => setLinhas(p => [...p, { ...LINHA_VAZIA }]);
  const removeLinha = (i: number) => setLinhas(p => p.filter((_, j) => j !== i));
  const setLinha = (i: number, campo: keyof LinhaForm, valor: string) =>
    setLinhas(p => p.map((l, j) => j === i ? { ...l, [campo]: valor } : l));
  const setPctLinha = (i: number, valor: string) => {
    setLinhas(p => {
      const next = p.map((l, j) => j === i ? { ...l, percentual: valor } : l);
      if (next.length === 2) {
        const outra = i === 0 ? 1 : 0;
        next[outra] = { ...next[outra], percentual: String(Math.max(0, 100 - (parseFloat(valor) || 0))) };
      }
      return next;
    });
  };

  const abrirNovoCiclo = () => {
    setF({ ano_safra_id: filtroAno, centro_custo_id: "", nome: "", descricao: "", ativo: true });
    setLinhas([{ ...LINHA_VAZIA }, { ...LINHA_VAZIA }]);
    setEditId(null); setErroCiclo(null); setModalCiclo(true);
  };
  const abrirEditarCiclo = (r: RateioRegra) => {
    setF({ ano_safra_id: r.ano_safra_id, centro_custo_id: r.centro_custo_id, nome: r.nome, descricao: r.descricao ?? "", ativo: r.ativo ?? true });
    setLinhas(r.linhas?.length ? r.linhas.map(l => ({ ciclo_id: l.ciclo_id ?? "", percentual: String(l.percentual), descricao: l.descricao ?? "" })) : [{ ...LINHA_VAZIA }, { ...LINHA_VAZIA }]);
    setEditId(r.id); setErroCiclo(null); setModalCiclo(true);
  };

  const salvarCiclo = async () => {
    if (!fazendaId) return;
    if (!f.ano_safra_id) { setErroCiclo("Selecione o Ano Safra"); return; }
    if (!f.centro_custo_id) { setErroCiclo("Selecione o Centro de Custo"); return; }
    if (!f.nome.trim()) { setErroCiclo("Informe o nome da regra"); return; }
    if (!somaOk) { setErroCiclo(`Os percentuais somam ${somaLinhas.toFixed(2)}% — devem totalizar 100%`); return; }
    setSalvandoCiclo(true); setErroCiclo(null);
    try {
      const lp: Omit<RateioRegraLinha, "id" | "regra_id" | "created_at">[] = linhas.map((l, i) => ({
        ciclo_id: l.ciclo_id || undefined, percentual: parseFloat(l.percentual) || 0, descricao: l.descricao || undefined, ordem: i,
      }));
      const header = { fazenda_id: fazendaId, ano_safra_id: f.ano_safra_id, centro_custo_id: f.centro_custo_id, nome: f.nome.trim(), descricao: f.descricao || undefined, ativo: f.ativo };
      if (editId) await atualizarRateioRegra(editId, header, lp);
      else await criarRateioRegra(header, lp);
      setModalCiclo(false); await carregar();
    } catch (e: unknown) { setErroCiclo(e instanceof Error ? e.message : "Erro ao salvar"); }
    finally { setSalvandoCiclo(false); }
  };

  // ──────────────────────────────────────────────────────────────
  // REGRAS GLOBAIS — lógica
  // ──────────────────────────────────────────────────────────────

  // Soma das percentuais das fazendas (nível 1)
  const somaFazendas = fazLinhas.reduce((s, f) => s + (parseFloat(f.percentual) || 0), 0);
  const somaFazendasOk = Math.abs(somaFazendas - 100) < 0.01;

  // Soma dos percentuais dos ciclos de cada fazenda (nível 2)
  const somaCiclosFaz = (idx: number) => fazLinhas[idx]?.ciclos.reduce((s, c) => s + (parseFloat(c.percentual) || 0), 0) ?? 0;
  const somaCiclosOk = (idx: number) => Math.abs(somaCiclosFaz(idx) - 100) < 0.01 || fazLinhas[idx]?.ciclos.length === 0;

  const todasCiclosOk = fazLinhas.every((_, i) => somaCiclosOk(i));
  const globalValido = gf.nome.trim() && gf.ano_safra_label && somaFazendasOk && todasCiclosOk && fazLinhas.length > 0;

  const addFazendaLinha = () => {
    const usadas = new Set(fazLinhas.map(f => f.fazenda_id));
    const proxima = todasFazendas.find(f => !usadas.has(f.id));
    setFazLinhas(p => [...p, { fazenda_id: proxima?.id ?? "", percentual: "", ciclos: [] }]);
  };
  const removeFazendaLinha = (i: number) => setFazLinhas(p => p.filter((_, j) => j !== i));
  const setFazendaLinha = (i: number, campo: keyof Omit<FazendaGlobalForm, "ciclos">, valor: string) =>
    setFazLinhas(p => p.map((l, j) => j === i ? { ...l, [campo]: valor } : l));
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

  const addCicloFazenda = (fazIdx: number) => {
    const fazId = fazLinhas[fazIdx].fazenda_id;
    const ciclosFaz = gf.ano_safra_label
      ? (ciclosPorFazenda[fazId] ?? []).filter(c => {
          const anoDesc = anos.find(a => a.id === c.ano_safra_id)?.descricao;
          return anoDesc === gf.ano_safra_label;
        })
      : (ciclosPorFazenda[fazId] ?? []);
    const usados = new Set(fazLinhas[fazIdx].ciclos.map(c => c.ciclo_id));
    const prox = ciclosFaz.find(c => !usados.has(c.id));
    setFazLinhas(p => p.map((l, j) => j === fazIdx
      ? { ...l, ciclos: [...l.ciclos, { ciclo_id: prox?.id ?? "", percentual: "", descricao: "" }] }
      : l
    ));
  };
  const removeCicloFazenda = (fazIdx: number, cicloIdx: number) =>
    setFazLinhas(p => p.map((l, j) => j === fazIdx
      ? { ...l, ciclos: l.ciclos.filter((_, k) => k !== cicloIdx) }
      : l
    ));
  const setCicloFazenda = (fazIdx: number, cicloIdx: number, campo: keyof CicloGlobalForm, valor: string) =>
    setFazLinhas(p => p.map((l, j) => j === fazIdx
      ? { ...l, ciclos: l.ciclos.map((c, k) => k === cicloIdx ? { ...c, [campo]: valor } : c) }
      : l
    ));
  const setPctCicloFazenda = (fazIdx: number, cicloIdx: number, valor: string) => {
    setFazLinhas(p => p.map((l, j) => {
      if (j !== fazIdx) return l;
      const next = l.ciclos.map((c, k) => k === cicloIdx ? { ...c, percentual: valor } : c);
      if (next.length === 2) {
        const outra = cicloIdx === 0 ? 1 : 0;
        next[outra] = { ...next[outra], percentual: String(Math.max(0, 100 - (parseFloat(valor) || 0))) };
      }
      return { ...l, ciclos: next };
    }));
  };

  const abrirNovoGlobal = () => {
    setGf({ nome: "", descricao: "", ano_safra_label: anosUnicos[0] ?? "", centro_custo_id: "", ativo: true });
    setFazLinhas(todasFazendas.length >= 2
      ? [
          { fazenda_id: todasFazendas[0].id, percentual: "50", ciclos: [] },
          { fazenda_id: todasFazendas[1].id, percentual: "50", ciclos: [] },
        ]
      : [{ fazenda_id: todasFazendas[0]?.id ?? "", percentual: "100", ciclos: [] }]
    );
    setEditGlobalId(null); setErroGlobal(null); setModalGlobal(true);
  };

  const abrirEditarGlobal = (r: RateioGlobal) => {
    setGf({ nome: r.nome, descricao: r.descricao ?? "", ano_safra_label: r.ano_safra_label, centro_custo_id: r.centro_custo_id ?? "", ativo: r.ativo ?? true });
    setFazLinhas((r.fazendas ?? []).map(faz => ({
      fazenda_id: faz.fazenda_id,
      percentual: String(faz.percentual),
      ciclos: (faz.ciclos ?? []).map(c => ({ ciclo_id: c.ciclo_id, percentual: String(c.percentual), descricao: c.descricao ?? "" })),
    })));
    setEditGlobalId(r.id); setErroGlobal(null); setModalGlobal(true);
  };

  const salvarGlobal = async () => {
    if (!contaId) return;
    if (!gf.nome.trim()) { setErroGlobal("Informe o nome da regra"); return; }
    if (!gf.ano_safra_label) { setErroGlobal("Selecione o Ano Safra"); return; }
    if (fazLinhas.length === 0) { setErroGlobal("Adicione ao menos uma fazenda"); return; }
    if (!somaFazendasOk) { setErroGlobal(`Fazendas somam ${somaFazendas.toFixed(1)}% — devem totalizar 100%`); return; }
    for (let i = 0; i < fazLinhas.length; i++) {
      if (fazLinhas[i].ciclos.length > 0 && !somaCiclosOk(i)) {
        setErroGlobal(`Ciclos de "${nomeFaz(fazLinhas[i].fazenda_id)}" somam ${somaCiclosFaz(i).toFixed(1)}% — devem totalizar 100%`);
        return;
      }
    }
    setSalvandoGlobal(true); setErroGlobal(null);
    try {
      const header = { conta_id: contaId, ano_safra_label: gf.ano_safra_label, centro_custo_id: gf.centro_custo_id || undefined, nome: gf.nome.trim(), descricao: gf.descricao || undefined, ativo: gf.ativo };
      const payload = fazLinhas.map(faz => ({
        fazenda_id: faz.fazenda_id,
        percentual: parseFloat(faz.percentual) || 0,
        ciclos: faz.ciclos.map(c => ({ ciclo_id: c.ciclo_id, percentual: parseFloat(c.percentual) || 0, descricao: c.descricao || undefined })),
      }));
      if (editGlobalId) await atualizarRateioGlobal(editGlobalId, header, payload);
      else await criarRateioGlobal(header, payload);
      setModalGlobal(false); await carregar();
    } catch (e: unknown) { setErroGlobal(e instanceof Error ? e.message : "Erro ao salvar"); }
    finally { setSalvandoGlobal(false); }
  };

  // ─── Render ───────────────────────────────────────────────────
  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh", background: "#F4F6FA", fontFamily: "system-ui, sans-serif", fontSize: 13 }}>
      <TopNav />
      <main style={{ flex: 1 }}>
        <header style={{ background: "#fff", borderBottom: "0.5px solid #D4DCE8", padding: "10px 22px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 17, color: "#1a1a1a", fontWeight: 600 }}>Regras de Rateio</h1>
            <p style={{ margin: 0, fontSize: 11, color: "#555" }}>
              Distribua custos entre ciclos de uma fazenda (Por Ciclo) ou entre múltiplas fazendas (Global)
            </p>
          </div>
          <button style={btnV} onClick={tab === "ciclo" ? abrirNovoCiclo : abrirNovoGlobal}>
            + Nova Regra
          </button>
        </header>

        {/* ── Tabs ── */}
        <div style={{ background: "#fff", borderBottom: "0.5px solid #D4DCE8", padding: "0 22px", display: "flex", gap: 0 }}>
          {(["ciclo", "global"] as const).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              style={{
                padding: "10px 18px", border: "none", background: "transparent", cursor: "pointer", fontSize: 13,
                fontWeight: tab === t ? 700 : 400,
                color: tab === t ? "#1A5CB8" : "#555",
                borderBottom: tab === t ? "2px solid #1A5CB8" : "2px solid transparent",
              }}
            >
              {t === "ciclo" ? "Por Ciclo" : "Global (todas as fazendas)"}
              <span style={{ marginLeft: 6, fontSize: 11, background: tab === t ? "#D5E8F5" : "#F3F6F9", color: tab === t ? "#0B2D50" : "#888", padding: "1px 6px", borderRadius: 10 }}>
                {t === "ciclo" ? regras.length : regrasGlobal.length}
              </span>
            </button>
          ))}
        </div>

        <div style={{ padding: "18px 22px" }}>

          {/* ════════════════════ TAB POR CICLO ════════════════════ */}
          {tab === "ciclo" && (
            <>
              <div style={{ background: "#D5E8F5", border: "0.5px solid #1A487040", borderRadius: 8, padding: "10px 14px", marginBottom: 16, fontSize: 12, color: "#0B2D50" }}>
                <strong>Regra por Ciclo:</strong> Um Centro de Custo é distribuído entre os ciclos (culturas) de <em>uma única fazenda</em>.
                Ex.: CC "Pulverização Soja 25/26" → 100% Soja, ou CC "Geral" → 60% Soja + 40% Milho 2ª.
              </div>

              {/* Filtro */}
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
                <span style={{ fontSize: 12, color: "#555" }}>Filtrar por Ano Safra:</span>
                <select
                  style={{ padding: "6px 10px", border: "0.5px solid #D4DCE8", borderRadius: 7, fontSize: 13, background: "#fff", outline: "none" }}
                  value={filtroAno} onChange={e => setFiltroAno(e.target.value)}
                >
                  <option value="">Todos os anos</option>
                  {anos.map(a => <option key={a.id} value={a.id}>{a.descricao}</option>)}
                </select>
                {filtroAno && <button style={{ ...btnR, fontSize: 11, padding: "4px 10px" }} onClick={() => setFiltroAno("")}>Limpar</button>}
                <span style={{ marginLeft: "auto", fontSize: 11, color: "#888" }}>
                  {regrasFiltradas.length} regra{regrasFiltradas.length !== 1 ? "s" : ""}
                </span>
              </div>

              {/* Lista */}
              {loading ? (
                <div style={{ textAlign: "center", padding: 48, color: "#555" }}>Carregando...</div>
              ) : regrasFiltradas.length === 0 ? (
                <div style={{ background: "#fff", border: "0.5px solid #D4DCE8", borderRadius: 12, padding: 48, textAlign: "center", color: "#555" }}>
                  Nenhuma regra cadastrada. Clique em "+ Nova Regra".
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {regrasFiltradas.map(r => {
                    const linhasR = r.linhas ?? [];
                    return (
                      <div key={r.id} style={{ background: "#fff", border: "0.5px solid #D4DCE8", borderRadius: 12, padding: "14px 18px" }}>
                        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6, flexWrap: "wrap" }}>
                              <span style={{ fontSize: 11, background: "#D5E8F5", color: "#0B2D50", padding: "2px 8px", borderRadius: 6, fontWeight: 600 }}>{nomeAno(r.ano_safra_id)}</span>
                              <span style={{ fontSize: 13, fontWeight: 700, color: "#1a1a1a" }}>{r.nome}</span>
                              {!r.ativo && <span style={{ fontSize: 10, background: "#F3F6F9", color: "#888", padding: "2px 8px", borderRadius: 6 }}>Inativa</span>}
                            </div>
                            <div style={{ fontSize: 12, color: "#555", marginBottom: 8 }}>
                              CC: <strong style={{ color: "#1A4870" }}>{nomeCC(r.centro_custo_id)}</strong>
                              {r.descricao && <span style={{ color: "#888", marginLeft: 8 }}>· {r.descricao}</span>}
                            </div>
                            {linhasR.length > 0 && (
                              <>
                                <div style={{ display: "flex", height: 18, borderRadius: 4, overflow: "hidden", border: "0.5px solid #D4DCE8", marginBottom: 6 }}>
                                  {linhasR.map((l, i) => (
                                    <div key={i} style={{ width: `${l.percentual}%`, background: CORES[i % CORES.length], display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 9, fontWeight: 700, minWidth: l.percentual > 0 ? 20 : 0 }}>
                                      {l.percentual > 5 ? `${l.percentual}%` : ""}
                                    </div>
                                  ))}
                                </div>
                                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                                  {linhasR.map((l, i) => (
                                    <div key={i} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, padding: "3px 8px", borderRadius: 6, background: "#F3F6F9", border: "0.5px solid #D4DCE8" }}>
                                      <span style={{ width: 8, height: 8, borderRadius: 2, background: CORES[i % CORES.length], display: "inline-block" }} />
                                      <span style={{ fontWeight: 600 }}>{l.percentual}%</span>
                                      <span style={{ color: "#555" }}>{nomeCiclo(r.fazenda_id, l.ciclo_id)}</span>
                                    </div>
                                  ))}
                                </div>
                              </>
                            )}
                          </div>
                          <div style={{ display: "flex", gap: 5, flexShrink: 0 }}>
                            <button style={btnR} onClick={() => abrirEditarCiclo(r)}>Editar</button>
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

          {/* ════════════════════ TAB GLOBAL ════════════════════ */}
          {tab === "global" && (
            <>
              <div style={{ background: "#FBF3E0", border: "0.5px solid #C9921B40", borderRadius: 8, padding: "10px 14px", marginBottom: 16, fontSize: 12, color: "#633806" }}>
                <strong>Regra Global:</strong> Um custo é rateado em <em>dois níveis</em> — primeiro entre fazendas (%), depois entre ciclos dentro de cada fazenda (%).
                Ideal para recursos compartilhados como máquinas, mão de obra e estrutura administrativa.
              </div>

              {loading ? (
                <div style={{ textAlign: "center", padding: 48, color: "#555" }}>Carregando...</div>
              ) : regrasGlobal.length === 0 ? (
                <div style={{ background: "#fff", border: "0.5px solid #D4DCE8", borderRadius: 12, padding: 48, textAlign: "center", color: "#555" }}>
                  Nenhuma regra global cadastrada. Clique em "+ Nova Regra".
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {regrasGlobal.map(r => {
                    const faz = r.fazendas ?? [];
                    return (
                      <div key={r.id} style={{ background: "#fff", border: "0.5px solid #D4DCE8", borderRadius: 12, padding: "14px 18px" }}>
                        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6, flexWrap: "wrap" }}>
                              <span style={{ fontSize: 11, background: "#FBF3E0", color: "#633806", padding: "2px 8px", borderRadius: 6, fontWeight: 600 }}>{r.ano_safra_label}</span>
                              <span style={{ fontSize: 13, fontWeight: 700, color: "#1a1a1a" }}>{r.nome}</span>
                              {r.centro_custo_id && <span style={{ fontSize: 11, color: "#555" }}>CC: {nomeCC(r.centro_custo_id)}</span>}
                              {!r.ativo && <span style={{ fontSize: 10, background: "#F3F6F9", color: "#888", padding: "2px 8px", borderRadius: 6 }}>Inativa</span>}
                            </div>
                            {r.descricao && <div style={{ fontSize: 12, color: "#888", marginBottom: 8 }}>{r.descricao}</div>}

                            {/* Nível 1 — barra de fazendas */}
                            {faz.length > 0 && (
                              <div style={{ marginBottom: 10 }}>
                                <div style={{ fontSize: 10, color: "#888", fontWeight: 600, marginBottom: 4, textTransform: "uppercase" }}>Nível 1 — Entre Fazendas</div>
                                <div style={{ display: "flex", height: 20, borderRadius: 5, overflow: "hidden", border: "0.5px solid #D4DCE8" }}>
                                  {faz.map((f, i) => (
                                    <div key={i} style={{ width: `${f.percentual}%`, background: CORES_FAZ[i % CORES_FAZ.length], display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 9, fontWeight: 700, minWidth: 24 }}>
                                      {f.percentual > 8 ? `${f.percentual}%` : ""}
                                    </div>
                                  ))}
                                </div>
                                <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 6 }}>
                                  {faz.map((f, i) => (
                                    <div key={i} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, padding: "3px 10px", borderRadius: 6, background: "#F3F6F9", border: "0.5px solid #D4DCE8" }}>
                                      <span style={{ width: 8, height: 8, borderRadius: 2, background: CORES_FAZ[i % CORES_FAZ.length], display: "inline-block" }} />
                                      <span style={{ fontWeight: 600 }}>{f.percentual}%</span>
                                      <span style={{ color: "#555" }}>{nomeFaz(f.fazenda_id)}</span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}

                            {/* Nível 2 — ciclos por fazenda */}
                            {faz.some(f => (f.ciclos ?? []).length > 0) && (
                              <div>
                                <div style={{ fontSize: 10, color: "#888", fontWeight: 600, marginBottom: 6, textTransform: "uppercase" }}>Nível 2 — Ciclos por Fazenda</div>
                                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                                  {faz.filter(f => (f.ciclos ?? []).length > 0).map((f, i) => (
                                    <div key={i} style={{ background: "#F9FAFB", border: "0.5px solid #E8EDF5", borderRadius: 6, padding: "8px 12px" }}>
                                      <div style={{ fontSize: 11, fontWeight: 600, color: CORES_FAZ[i % CORES_FAZ.length], marginBottom: 4 }}>
                                        {nomeFaz(f.fazenda_id)} ({f.percentual}%)
                                      </div>
                                      <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                                        {(f.ciclos ?? []).map((c, j) => (
                                          <div key={j} style={{ display: "flex", alignItems: "center", gap: 3, fontSize: 11, padding: "2px 7px", borderRadius: 6, background: "#fff", border: "0.5px solid #D4DCE8" }}>
                                            <span style={{ width: 6, height: 6, borderRadius: 2, background: CORES[j % CORES.length], display: "inline-block" }} />
                                            <span style={{ fontWeight: 600 }}>{c.percentual}%</span>
                                            <span style={{ color: "#555" }}>{nomeCiclo(f.fazenda_id, c.ciclo_id)}</span>
                                          </div>
                                        ))}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                          <div style={{ display: "flex", gap: 5, flexShrink: 0 }}>
                            <button style={btnR} onClick={() => abrirEditarGlobal(r)}>Editar</button>
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
          MODAL — Regra por Ciclo
      ══════════════════════════════════════════════════════════ */}
      {modalCiclo && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 110 }}
          onClick={e => { if (e.target === e.currentTarget) setModalCiclo(false); }}>
          <div style={{ background: "#fff", borderRadius: 14, width: 760, maxWidth: "97vw", maxHeight: "92vh", overflowY: "auto" }}>
            <div style={{ padding: "16px 22px", borderBottom: "0.5px solid #D4DCE8", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ fontWeight: 600, fontSize: 15 }}>{editId ? "Editar Regra por Ciclo" : "Nova Regra por Ciclo"}</div>
              <button onClick={() => setModalCiclo(false)} style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer", color: "#555" }}>×</button>
            </div>
            <div style={{ padding: 22 }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 14 }}>
                <div>
                  <label style={lbl}>Ano Safra *</label>
                  <select style={{ ...inp, borderColor: !f.ano_safra_id ? "#E24B4A80" : "#D4DCE8" }} value={f.ano_safra_id} onChange={e => setF(p => ({ ...p, ano_safra_id: e.target.value }))}>
                    <option value="">— Selecionar —</option>
                    {anos.map(a => <option key={a.id} value={a.id}>{a.descricao}</option>)}
                  </select>
                </div>
                <div>
                  <label style={lbl}>Centro de Custo de Origem *</label>
                  <select style={{ ...inp, borderColor: !f.centro_custo_id ? "#E24B4A80" : "#D4DCE8" }} value={f.centro_custo_id} onChange={e => setF(p => ({ ...p, centro_custo_id: e.target.value }))}>
                    <option value="">— Selecionar CC —</option>
                    {ccs.map(cc => <option key={cc.id} value={cc.id}>{cc.codigo ? `${cc.codigo} · ` : ""}{cc.nome}</option>)}
                  </select>
                </div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: 12, marginBottom: 16 }}>
                <div>
                  <label style={lbl}>Nome da Regra *</label>
                  <input style={inp} value={f.nome} onChange={e => setF(p => ({ ...p, nome: e.target.value }))} placeholder="Ex: Regra Soja 25/26" />
                </div>
                <div>
                  <label style={lbl}>Descrição</label>
                  <input style={inp} value={f.descricao} onChange={e => setF(p => ({ ...p, descricao: e.target.value }))} placeholder="Opcional" />
                </div>
              </div>

              {/* Barra visual */}
              <div style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 11, color: "#555", marginBottom: 5, fontWeight: 600, textTransform: "uppercase" }}>
                  Distribuição do Custo
                  <span style={{ marginLeft: 10, fontWeight: 400, color: somaOk ? "#16A34A" : somaLinhas > 100 ? "#E24B4A" : "#C9921B" }}>
                    {somaLinhas.toFixed(1)}% de 100%
                  </span>
                </div>
                <div style={{ display: "flex", height: 22, borderRadius: 6, overflow: "hidden", border: "0.5px solid #D4DCE8", background: "#F3F6F9" }}>
                  {linhas.map((l, i) => {
                    const pct = Math.min(100, parseFloat(l.percentual) || 0);
                    return pct > 0 ? (
                      <div key={i} style={{ width: `${pct}%`, background: CORES[i % CORES.length], display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 10, fontWeight: 700, transition: "width 0.15s" }}>
                        {pct > 5 ? `${pct}%` : ""}
                      </div>
                    ) : null;
                  })}
                </div>
              </div>

              {/* Linhas */}
              <div style={{ background: "#F3F6F9", border: "0.5px solid #D4DCE8", borderRadius: 8, padding: "12px 14px", marginBottom: 16 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                  <span style={{ fontSize: 11, fontWeight: 600, color: "#555", textTransform: "uppercase" }}>Destinos *</span>
                  <button style={{ ...btnR, fontSize: 11, padding: "4px 12px", background: "#fff" }} onClick={addLinha}>+ Adicionar Ciclo</button>
                </div>
                {linhas.map((l, i) => (
                  <div key={i} style={{ display: "grid", gridTemplateColumns: "16px 2fr 80px 2fr 32px", gap: 8, alignItems: "center", marginBottom: i < linhas.length - 1 ? 8 : 0 }}>
                    <div style={{ width: 12, height: 12, borderRadius: 3, background: CORES[i % CORES.length] }} />
                    <select style={inp} value={l.ciclo_id} onChange={e => setLinha(i, "ciclo_id", e.target.value)}>
                      <option value="">— Ciclo —</option>
                      {ciclosModal.map(c => <option key={c.id} value={c.id}>{CULT[c.cultura] ?? c.cultura}</option>)}
                    </select>
                    <div style={{ position: "relative" }}>
                      <input style={{ ...inp, paddingRight: 20 }} type="number" min="0" max="100" step="0.5" placeholder="0" value={l.percentual} onChange={e => setPctLinha(i, e.target.value)} />
                      <span style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", fontSize: 12, color: "#888", pointerEvents: "none" }}>%</span>
                    </div>
                    <input style={inp} placeholder="Observação (opcional)" value={l.descricao} onChange={e => setLinha(i, "descricao", e.target.value)} />
                    <button style={{ ...btnX, padding: "5px 7px" }} onClick={() => removeLinha(i)} disabled={linhas.length <= 1}>✕</button>
                  </div>
                ))}
                {linhas.length > 0 && (
                  <div style={{ marginTop: 10, padding: "6px 10px", borderRadius: 6, background: somaOk ? "#DCFCE7" : somaLinhas > 100 ? "#FCEBEB" : "#FBF3E0", border: `0.5px solid ${somaOk ? "#16A34A40" : "#C9921B40"}`, fontSize: 12, color: somaOk ? "#166534" : "#633806", fontWeight: 600 }}>
                    Total: {somaLinhas.toFixed(2)}%{somaOk ? " ✓" : somaLinhas > 100 ? ` — excede ${(somaLinhas - 100).toFixed(2)}%` : ` — faltam ${(100 - somaLinhas).toFixed(2)}%`}
                  </div>
                )}
              </div>

              <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, cursor: "pointer", marginBottom: 16 }}>
                <input type="checkbox" checked={f.ativo} onChange={e => setF(p => ({ ...p, ativo: e.target.checked }))} />
                Regra ativa
              </label>

              {erroCiclo && <div style={{ background: "#FCEBEB", border: "0.5px solid #E24B4A60", borderRadius: 7, padding: "8px 12px", marginBottom: 12, fontSize: 12, color: "#791F1F" }}>{erroCiclo}</div>}
              <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                <button style={btnR} onClick={() => setModalCiclo(false)}>Cancelar</button>
                <button style={{ ...btnV, opacity: salvandoCiclo || !f.nome.trim() || !f.ano_safra_id || !f.centro_custo_id || !somaOk ? 0.5 : 1 }} disabled={salvandoCiclo || !f.nome.trim() || !f.ano_safra_id || !f.centro_custo_id || !somaOk} onClick={salvarCiclo}>
                  {salvandoCiclo ? "Salvando…" : editId ? "Salvar" : "Criar Regra"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════
          MODAL — Regra Global
      ══════════════════════════════════════════════════════════ */}
      {modalGlobal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 110 }}
          onClick={e => { if (e.target === e.currentTarget) setModalGlobal(false); }}>
          <div style={{ background: "#fff", borderRadius: 14, width: 860, maxWidth: "97vw", maxHeight: "94vh", overflowY: "auto" }}>
            <div style={{ padding: "16px 22px", borderBottom: "0.5px solid #D4DCE8", display: "flex", justifyContent: "space-between", alignItems: "center", position: "sticky", top: 0, background: "#fff", zIndex: 1 }}>
              <div>
                <div style={{ fontWeight: 600, fontSize: 15 }}>{editGlobalId ? "Editar Regra Global" : "Nova Regra Global"}</div>
                <div style={{ fontSize: 11, color: "#555", marginTop: 2 }}>Distribua custos entre fazendas e, dentro de cada fazenda, entre ciclos</div>
              </div>
              <button onClick={() => setModalGlobal(false)} style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer", color: "#555" }}>×</button>
            </div>
            <div style={{ padding: 22 }}>

              {/* Cabeçalho */}
              <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 2fr", gap: 12, marginBottom: 14 }}>
                <div>
                  <label style={lbl}>Nome da Regra *</label>
                  <input style={inp} value={gf.nome} onChange={e => setGf(p => ({ ...p, nome: e.target.value }))} placeholder="Ex: Colheitadeira JD S780 — Safra 25/26" />
                </div>
                <div>
                  <label style={lbl}>Ano Safra *</label>
                  <select style={inp} value={gf.ano_safra_label} onChange={e => setGf(p => ({ ...p, ano_safra_label: e.target.value }))}>
                    <option value="">— Selecionar —</option>
                    {anosUnicos.map(a => <option key={a} value={a}>{a}</option>)}
                  </select>
                </div>
                <div>
                  <label style={lbl}>Descrição / Justificativa</label>
                  <input style={inp} value={gf.descricao} onChange={e => setGf(p => ({ ...p, descricao: e.target.value }))} placeholder="Ex: Rateio proporcional à área colhida" />
                </div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 12, marginBottom: 20, alignItems: "flex-end" }}>
                <div>
                  <label style={lbl}>Centro de Custo de Origem (opcional)</label>
                  <select style={inp} value={gf.centro_custo_id} onChange={e => setGf(p => ({ ...p, centro_custo_id: e.target.value }))}>
                    <option value="">— Sem vínculo —</option>
                    {ccs.map(cc => <option key={cc.id} value={cc.id}>{cc.codigo ? `${cc.codigo} · ` : ""}{cc.nome}</option>)}
                  </select>
                </div>
                <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, cursor: "pointer", paddingBottom: 2 }}>
                  <input type="checkbox" checked={gf.ativo} onChange={e => setGf(p => ({ ...p, ativo: e.target.checked }))} />
                  Regra ativa
                </label>
              </div>

              {/* ── Nível 1: Distribuição entre Fazendas ── */}
              <div style={{ background: "#F3F6F9", border: "0.5px solid #D4DCE8", borderRadius: 10, padding: "14px 16px", marginBottom: 20 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: "#1A5CB8", textTransform: "uppercase" }}>
                      Nível 1 — Distribuição entre Fazendas
                    </div>
                    <div style={{ fontSize: 11, color: "#555", marginTop: 2 }}>Quanto do custo total cabe a cada fazenda</div>
                  </div>
                  {todasFazendas.length > fazLinhas.length && (
                    <button style={{ ...btnR, fontSize: 11, padding: "4px 12px", background: "#fff" }} onClick={addFazendaLinha}>+ Fazenda</button>
                  )}
                </div>

                {/* Barra visual fazendas */}
                {fazLinhas.some(f => parseFloat(f.percentual) > 0) && (
                  <div style={{ display: "flex", height: 24, borderRadius: 6, overflow: "hidden", border: "0.5px solid #D4DCE8", background: "#fff", marginBottom: 12 }}>
                    {fazLinhas.map((faz, i) => {
                      const pct = Math.min(100, parseFloat(faz.percentual) || 0);
                      return pct > 0 ? (
                        <div key={i} style={{ width: `${pct}%`, background: CORES_FAZ[i % CORES_FAZ.length], display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 10, fontWeight: 700, transition: "width 0.15s" }}>
                          {pct > 6 ? `${nomeFaz(faz.fazenda_id).substring(0, 10)} ${pct}%` : ""}
                        </div>
                      ) : null;
                    })}
                  </div>
                )}

                {/* Linhas de fazendas */}
                {fazLinhas.map((faz, i) => (
                  <div key={i} style={{ display: "grid", gridTemplateColumns: "16px 1fr 100px 32px", gap: 8, alignItems: "center", marginBottom: i < fazLinhas.length - 1 ? 8 : 0 }}>
                    <div style={{ width: 12, height: 12, borderRadius: 3, background: CORES_FAZ[i % CORES_FAZ.length] }} />
                    <select style={inp} value={faz.fazenda_id} onChange={e => setFazendaLinha(i, "fazenda_id", e.target.value)}>
                      <option value="">— Fazenda —</option>
                      {todasFazendas.map(f => <option key={f.id} value={f.id}>{f.nome}</option>)}
                    </select>
                    <div style={{ position: "relative" }}>
                      <input style={{ ...inp, paddingRight: 20 }} type="number" min="0" max="100" step="0.5" placeholder="0" value={faz.percentual} onChange={e => setPctFazenda(i, e.target.value)} />
                      <span style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", fontSize: 12, color: "#888", pointerEvents: "none" }}>%</span>
                    </div>
                    <button style={{ ...btnX, padding: "5px 7px" }} onClick={() => removeFazendaLinha(i)} disabled={fazLinhas.length <= 1}>✕</button>
                  </div>
                ))}

                <div style={{ marginTop: 10, padding: "6px 10px", borderRadius: 6, background: somaFazendasOk ? "#DCFCE7" : somaFazendas > 100 ? "#FCEBEB" : "#FBF3E0", border: `0.5px solid ${somaFazendasOk ? "#16A34A40" : "#C9921B40"}`, fontSize: 12, color: somaFazendasOk ? "#166534" : "#633806", fontWeight: 600 }}>
                  Total fazendas: {somaFazendas.toFixed(2)}%{somaFazendasOk ? " ✓" : somaFazendas > 100 ? ` — excede ${(somaFazendas - 100).toFixed(2)}%` : ` — faltam ${(100 - somaFazendas).toFixed(2)}%`}
                </div>
              </div>

              {/* ── Nível 2: Distribuição entre Ciclos por Fazenda ── */}
              <div style={{ background: "#F3F6F9", border: "0.5px solid #D4DCE8", borderRadius: 10, padding: "14px 16px", marginBottom: 16 }}>
                <div style={{ marginBottom: 12 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: "#C9921B", textTransform: "uppercase" }}>
                    Nível 2 — Distribuição entre Ciclos por Fazenda
                  </div>
                  <div style={{ fontSize: 11, color: "#555", marginTop: 2 }}>
                    Para cada fazenda, defina como a parcela dela é dividida entre os ciclos (culturas).
                    Deixe em branco para não detalhar por ciclo.
                  </div>
                </div>

                {fazLinhas.length === 0 ? (
                  <div style={{ fontSize: 12, color: "#aaa", textAlign: "center", padding: 12 }}>
                    Adicione fazendas no Nível 1 primeiro.
                  </div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    {fazLinhas.map((faz, fazIdx) => {
                      const fazNome = nomeFaz(faz.fazenda_id);
                      const corFaz = CORES_FAZ[fazIdx % CORES_FAZ.length];
                      const ciclosFaz = faz.fazenda_id
                        ? (gf.ano_safra_label
                            ? (ciclosPorFazenda[faz.fazenda_id] ?? []).filter(c => {
                                const anoDesc = anos.find(a => a.id === c.ano_safra_id)?.descricao;
                                return anoDesc === gf.ano_safra_label;
                              })
                            : (ciclosPorFazenda[faz.fazenda_id] ?? []))
                        : [];
                      const somaCiclos = somaCiclosFaz(fazIdx);
                      const ciclosOk = somaCiclosOk(fazIdx);

                      return (
                        <div key={fazIdx} style={{ background: "#fff", border: `0.5px solid ${corFaz}40`, borderLeft: `3px solid ${corFaz}`, borderRadius: 8, padding: "12px 14px" }}>
                          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                            <div style={{ fontWeight: 700, fontSize: 12, color: corFaz }}>
                              {fazNome}
                              <span style={{ fontWeight: 400, color: "#555", marginLeft: 6 }}>({faz.percentual || 0}% do custo global)</span>
                            </div>
                            {ciclosFaz.length > faz.ciclos.length && (
                              <button style={{ ...btnR, fontSize: 11, padding: "3px 10px" }} onClick={() => addCicloFazenda(fazIdx)}>+ Ciclo</button>
                            )}
                          </div>

                          {faz.ciclos.length === 0 ? (
                            <div style={{ fontSize: 11, color: "#aaa", fontStyle: "italic" }}>
                              Sem detalhamento por ciclo — todo o custo fica nesta fazenda como overhead.
                              <button style={{ marginLeft: 8, ...btnR, fontSize: 11, padding: "2px 8px" }} onClick={() => addCicloFazenda(fazIdx)}>Detalhar por ciclo</button>
                            </div>
                          ) : (
                            <>
                              {/* Mini-barra ciclos */}
                              {faz.ciclos.some(c => parseFloat(c.percentual) > 0) && (
                                <div style={{ display: "flex", height: 16, borderRadius: 4, overflow: "hidden", border: "0.5px solid #D4DCE8", marginBottom: 8 }}>
                                  {faz.ciclos.map((c, j) => {
                                    const pct = Math.min(100, parseFloat(c.percentual) || 0);
                                    return pct > 0 ? (
                                      <div key={j} style={{ width: `${pct}%`, background: CORES[j % CORES.length], display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 9, fontWeight: 700 }}>
                                        {pct > 8 ? `${pct}%` : ""}
                                      </div>
                                    ) : null;
                                  })}
                                </div>
                              )}

                              {faz.ciclos.map((c, cicloIdx) => (
                                <div key={cicloIdx} style={{ display: "grid", gridTemplateColumns: "12px 1fr 80px 1fr 28px", gap: 6, alignItems: "center", marginBottom: cicloIdx < faz.ciclos.length - 1 ? 6 : 0 }}>
                                  <div style={{ width: 10, height: 10, borderRadius: 2, background: CORES[cicloIdx % CORES.length] }} />
                                  <select style={{ ...inp, fontSize: 12 }} value={c.ciclo_id} onChange={e => setCicloFazenda(fazIdx, cicloIdx, "ciclo_id", e.target.value)}>
                                    <option value="">— Ciclo —</option>
                                    {ciclosFaz.map(ci => <option key={ci.id} value={ci.id}>{CULT[ci.cultura] ?? ci.cultura}</option>)}
                                  </select>
                                  <div style={{ position: "relative" }}>
                                    <input style={{ ...inp, paddingRight: 18, fontSize: 12 }} type="number" min="0" max="100" step="0.5" placeholder="0" value={c.percentual} onChange={e => setPctCicloFazenda(fazIdx, cicloIdx, e.target.value)} />
                                    <span style={{ position: "absolute", right: 6, top: "50%", transform: "translateY(-50%)", fontSize: 11, color: "#888", pointerEvents: "none" }}>%</span>
                                  </div>
                                  <input style={{ ...inp, fontSize: 12 }} placeholder="Obs." value={c.descricao} onChange={e => setCicloFazenda(fazIdx, cicloIdx, "descricao", e.target.value)} />
                                  <button style={{ ...btnX, padding: "3px 6px", fontSize: 10 }} onClick={() => removeCicloFazenda(fazIdx, cicloIdx)}>✕</button>
                                </div>
                              ))}

                              <div style={{ marginTop: 8, padding: "4px 8px", borderRadius: 5, background: ciclosOk ? "#DCFCE7" : somaCiclos > 100 ? "#FCEBEB" : "#FBF3E0", fontSize: 11, color: ciclosOk ? "#166534" : "#633806", fontWeight: 600, display: "inline-block" }}>
                                Ciclos: {somaCiclos.toFixed(1)}%{ciclosOk ? " ✓" : somaCiclos > 100 ? ` — excede ${(somaCiclos - 100).toFixed(1)}%` : ` — faltam ${(100 - somaCiclos).toFixed(1)}%`}
                              </div>
                            </>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {erroGlobal && <div style={{ background: "#FCEBEB", border: "0.5px solid #E24B4A60", borderRadius: 7, padding: "8px 12px", marginBottom: 12, fontSize: 12, color: "#791F1F" }}>{erroGlobal}</div>}
              <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                <button style={btnR} onClick={() => setModalGlobal(false)}>Cancelar</button>
                <button
                  style={{ ...btnV, background: "#C9921B", opacity: salvandoGlobal || !globalValido ? 0.5 : 1 }}
                  disabled={salvandoGlobal || !globalValido}
                  onClick={salvarGlobal}
                >
                  {salvandoGlobal ? "Salvando…" : editGlobalId ? "Salvar Alterações" : "Criar Regra Global"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
