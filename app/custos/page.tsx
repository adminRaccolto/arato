"use client";
import { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import TopNav from "../../components/TopNav";
import { listarSafras } from "../../lib/db";
import { useAuth } from "../../components/AuthProvider";
import { supabase } from "../../lib/supabase";
import type { Safra } from "../../lib/supabase";

type Aba = "dre" | "custoha" | "produtividade" | "custostotais";

interface AnoSafra   { id: string; descricao: string }
interface Ciclo      { id: string; ano_safra_id: string; cultura: string; descricao: string; area_ha?: number }
interface CntSimples { id: string; ciclo_id?: string; produto: string; moeda: string; preco: number; quantidade_sc: number; confirmado?: boolean; status: string }
interface MovSimples { id: string; insumo_id: string; quantidade: number; safra?: string; motivo?: string }
interface InsSimples { id: string; custo_medio: number; categoria: string; nome: string }
interface LanSimples { id: string; categoria: string; valor: number; safra_id?: string; descricao: string; status: string; data_vencimento: string }
interface RatLinha   { id: string; regra_id: string; ciclo_id: string; percentual: number }
interface RatRegra   { id: string; nome: string; tipos?: string[]; ano_safra_id?: string }

// Categorias de insumo — já apuradas via movimentações, não duplicar em despesas diretas
const INSUMO_CATS = [
  "Insumos — Sementes","Insumos — Fertilizantes","Insumos — Defensivos",
  "Insumos — Inoculantes","Insumos — Corretivos",
  "Custo de Sementes","Defensivos Agrícolas","Insumos / Fertilizantes",
  "Insumos / Corretivos","Fertilizantes","Insumos Agrícolas",
];

function catToGrupo(cat: string): string {
  if (/sement/i.test(cat)) return "Sementes";
  if (/fertiliz|adub/i.test(cat)) return "Fertilizantes";
  if (/correti/i.test(cat)) return "Corretivos de Solo";
  if (/defensiv/i.test(cat)) return "Defensivos";
  if (/inoculan/i.test(cat)) return "Inoculantes";
  return cat || "Outros Insumos";
}

const fmtBRL = (v: number, d = 0) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: d, maximumFractionDigits: d });

const fmtNum = (v: number, d = 0) =>
  v.toLocaleString("pt-BR", { minimumFractionDigits: d, maximumFractionDigits: d });

const lbl: React.CSSProperties = { fontSize: 11, color: "#555", marginBottom: 4, display: "block" };
const inp: React.CSSProperties = {
  width: "100%", padding: "8px 10px", border: "0.5px solid #D4DCE8",
  borderRadius: 8, fontSize: 13, color: "#1a1a1a", background: "#fff",
  boxSizing: "border-box", outline: "none",
};

// ─── Linha da tabela DRE ─────────────────────────────────────
function DreRow({ label, valor, ha, sc, base, bold, bg, indent, cor, negativo, noBorder }:{
  label:string; valor:number; ha:number; sc:number; base:number;
  bold?:boolean; bg?:string; indent?:boolean; cor?:string; negativo?:boolean; noBorder?:boolean;
}) {
  const c = cor ?? (bold ? "#0B2D50" : "#1a1a1a");
  const vAbs = Math.abs(valor);
  const fmt = (v: number) => negativo ? `(${fmtBRL(v)})` : fmtBRL(v);
  const td = (extra?: React.CSSProperties): React.CSSProperties => ({
    padding: bold ? "10px 20px" : "8px 20px",
    ...(indent ? { paddingLeft: 34 } : {}),
    borderBottom: noBorder ? "none" : "0.5px solid #DEE5EE",
    ...extra,
  });
  return (
    <tr style={{ background: bg ?? "transparent" }}>
      <td style={td({ fontWeight: bold ? 700 : 400, fontSize: 12, color: c })}>{label}</td>
      <td style={td({ textAlign: "right", fontWeight: bold ? 700 : 400, color: negativo ? "#E24B4A" : c })}>
        {fmt(vAbs)}
      </td>
      <td style={td({ textAlign: "right", fontSize: 11, color: "#666" })}>
        {ha > 0 ? fmtBRL(valor / ha) : "—"}
      </td>
      <td style={td({ textAlign: "right", fontSize: 11, color: "#666" })}>
        {sc > 0 ? fmtBRL(valor / sc, 2) : "—"}
      </td>
      <td style={td({ textAlign: "right", fontSize: 11, color: "#666" })}>
        {base > 0 ? `${fmtNum(vAbs / base * 100, 1)}%` : "—"}
      </td>
    </tr>
  );
}

// ─── Barra de filtros (Ano Safra + Ciclos) ───────────────────
function FiltroBar({ anosSafra, anoSafraId, setAnoSafraId, ciclos, cicloIds, setCicloIds, dreLoading }: {
  anosSafra: AnoSafra[];
  anoSafraId: string;
  setAnoSafraId: (v: string) => void;
  ciclos: Ciclo[];
  cicloIds: string[];
  setCicloIds: React.Dispatch<React.SetStateAction<string[]>>;
  dreLoading: boolean;
}) {
  const ciclosFiltrados = ciclos.filter(c => c.ano_safra_id === anoSafraId);
  const ciclosSel = ciclos.filter(c => cicloIds.includes(c.id));
  const areaTotal = ciclosSel.reduce((s, c) => s + (c.area_ha ?? 0), 0);

  return (
    <div style={{ background: "#F8FAFD", borderBottom: "0.5px solid #D4DCE8", padding: "12px 22px" }}>
      <div style={{ display: "grid", gridTemplateColumns: "200px 1fr", gap: 16, alignItems: "end" }}>
        <div>
          <label style={lbl}>Ano Safra</label>
          <select value={anoSafraId} onChange={e => {
            setAnoSafraId(e.target.value);
            const novos = ciclos.filter(c => c.ano_safra_id === e.target.value).map(c => c.id);
            setCicloIds(novos);
          }} style={inp}>
            <option value="">Todos</option>
            {anosSafra.map(a => <option key={a.id} value={a.id}>{a.descricao}</option>)}
          </select>
        </div>
        <div>
          <label style={lbl}>Ciclos</label>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {ciclosFiltrados.map(c => {
              const sel = cicloIds.includes(c.id);
              return (
                <button key={c.id}
                  onClick={() => setCicloIds(prev => sel ? prev.filter(id => id !== c.id) : [...prev, c.id])}
                  style={{
                    padding: "5px 12px", borderRadius: 20,
                    border: `0.5px solid ${sel ? "#1A4870" : "#D4DCE8"}`,
                    background: sel ? "#D5E8F5" : "#fff",
                    color: sel ? "#0B2D50" : "#555",
                    cursor: "pointer", fontSize: 12, fontWeight: sel ? 600 : 400,
                  }}>
                  {c.descricao}{c.area_ha ? ` · ${fmtNum(c.area_ha)} ha` : ""}
                </button>
              );
            })}
            {ciclosFiltrados.length === 0 && <span style={{ fontSize: 12, color: "#999" }}>Selecione um ano safra</span>}
          </div>
        </div>
      </div>
      <div style={{ marginTop: 8, fontSize: 11, color: "#555", display: "flex", gap: 16, alignItems: "center" }}>
        <span>{ciclosSel.length} ciclo{ciclosSel.length !== 1 ? "s" : ""} selecionado{ciclosSel.length !== 1 ? "s" : ""}{areaTotal > 0 ? ` · ${fmtNum(areaTotal, 0)} ha` : ""}</span>
        {dreLoading && <span style={{ color: "#1A4870", fontWeight: 600 }}>⟳ Carregando…</span>}
      </div>
    </div>
  );
}

// ─── Componente principal ─────────────────────────────────────
function CustosInner() {
  const { fazendaId } = useAuth();
  const searchParams  = useSearchParams();
  const aba = (searchParams.get("aba") as Aba) || "dre";

  // Dados de referência
  const [safras, setSafras]       = useState<Safra[]>([]);
  const [anosSafra, setAnosSafra] = useState<AnoSafra[]>([]);
  const [ciclos, setCiclos]       = useState<Ciclo[]>([]);
  const [initLoading, setInitLoading] = useState(true);

  // Filtro unificado
  const [anoSafraId, setAnoSafraId] = useState("");
  const [cicloIds, setCicloIds]     = useState<string[]>([]);

  // Dados da DRE
  const [dreLoading, setDreLoading] = useState(false);
  const [contratos, setContratos]   = useState<CntSimples[]>([]);
  const [movs, setMovs]             = useState<MovSimples[]>([]);
  const [insumos, setInsumos]       = useState<InsSimples[]>([]);
  const [lanDir, setLanDir]         = useState<LanSimples[]>([]);
  const [lanOvh, setLanOvh]         = useState<LanSimples[]>([]);
  const [ratLinhas, setRatLinhas]   = useState<RatLinha[]>([]);
  const [ratRegras, setRatRegras]   = useState<RatRegra[]>([]);

  // ── Carrega dados de referência ───────────────────────────
  useEffect(() => {
    if (!fazendaId) return;
    Promise.all([
      listarSafras(fazendaId),
      supabase.from("anos_safra").select("id,descricao").eq("fazenda_id", fazendaId).order("descricao", { ascending: false }),
      supabase.from("ciclos").select("id,ano_safra_id,cultura,descricao,area_ha").eq("fazenda_id", fazendaId).order("descricao"),
    ]).then(([sfrs, aR, cR]) => {
      setSafras(sfrs);
      const as = (aR.data ?? []) as AnoSafra[];
      const cs = (cR.data ?? []) as Ciclo[];
      setAnosSafra(as);
      setCiclos(cs);
      if (as.length > 0) {
        setAnoSafraId(as[0].id);
        setCicloIds(cs.filter(c => c.ano_safra_id === as[0].id).map(c => c.id));
      }
    }).finally(() => setInitLoading(false));
  }, [fazendaId]);

  // ── Carrega dados da DRE quando cicloIds muda ────────────
  useEffect(() => {
    if (!fazendaId || cicloIds.length === 0) {
      setContratos([]); setMovs([]); setInsumos([]);
      setLanDir([]); setLanOvh([]); setRatLinhas([]); setRatRegras([]);
      return;
    }
    setDreLoading(true);
    let rateioQ = supabase.from("regras_rateio").select("id,nome,tipos,ano_safra_id").eq("fazenda_id", fazendaId);
    if (anoSafraId) rateioQ = rateioQ.eq("ano_safra_id", anoSafraId);
    Promise.all([
      supabase.from("contratos")
        .select("id,ciclo_id,produto,moeda,preco,quantidade_sc,confirmado,status")
        .eq("fazenda_id", fazendaId).in("ciclo_id", cicloIds)
        .neq("status", "cancelado").eq("confirmado", true),
      supabase.from("movimentacoes_estoque")
        .select("id,insumo_id,quantidade,safra,motivo")
        .eq("fazenda_id", fazendaId).in("safra", cicloIds).eq("tipo", "saida"),
      supabase.from("insumos")
        .select("id,custo_medio,categoria,nome")
        .eq("fazenda_id", fazendaId),
      supabase.from("lancamentos")
        .select("id,categoria,valor,safra_id,descricao,status,data_vencimento")
        .eq("fazenda_id", fazendaId).in("safra_id", cicloIds).eq("tipo", "pagar"),
      supabase.from("lancamentos")
        .select("id,categoria,valor,safra_id,descricao,status,data_vencimento")
        .eq("fazenda_id", fazendaId).is("safra_id", null).eq("tipo", "pagar"),
      supabase.from("regras_rateio_linhas")
        .select("id,regra_id,ciclo_id,percentual")
        .in("ciclo_id", cicloIds),
      rateioQ,
    ]).then(([cR, mR, iR, ldR, loR, rlR, rrR]) => {
      setContratos((cR.data ?? []) as CntSimples[]);
      setMovs((mR.data ?? []) as MovSimples[]);
      setInsumos((iR.data ?? []) as InsSimples[]);
      setLanDir((ldR.data ?? []) as LanSimples[]);
      setLanOvh((loR.data ?? []) as LanSimples[]);
      setRatLinhas((rlR.data ?? []) as RatLinha[]);
      setRatRegras((rrR.data ?? []) as RatRegra[]);
    }).finally(() => setDreLoading(false));
  }, [fazendaId, cicloIds.join(","), anoSafraId]); // eslint-disable-line react-hooks/exhaustive-deps

  // ═══════════════════════════════════════════════════════════
  // CÁLCULOS DA DRE
  // ═══════════════════════════════════════════════════════════

  const ciclosSel = ciclos.filter(c => cicloIds.includes(c.id));
  const areaHa    = ciclosSel.reduce((s, c) => s + (c.area_ha ?? 0), 0);

  // 1. RECEITA — contratos confirmados por ciclo
  const receitaBRL    = contratos.filter(c => c.moeda === "BRL").reduce((s, c) => s + c.preco * c.quantidade_sc, 0);
  const totalSacas    = contratos.reduce((s, c) => s + c.quantidade_sc, 0); // para custo/sc
  const contratosPorProduto: Record<string, number> = {};
  for (const c of contratos) {
    if (c.moeda !== "BRL") continue;
    contratosPorProduto[c.produto] = (contratosPorProduto[c.produto] ?? 0) + c.preco * c.quantidade_sc;
  }

  // 2. DEDUÇÕES sobre receita BRL
  const funrural        = receitaBRL * 0.015;
  const senar           = receitaBRL * 0.002;
  const deducoes        = funrural + senar;
  const receitaLiquida  = receitaBRL - deducoes;

  // 3. CPV — movimentacoes_estoque × custo_medio, por grupo
  const insumoMap: Record<string, InsSimples> = Object.fromEntries(insumos.map(i => [i.id, i]));
  const cpvPorGrupo: Record<string, number> = {};
  let cpvTotal = 0;
  for (const m of movs) {
    if (m.motivo === "estorno_exclusao") continue;
    const ins = insumoMap[m.insumo_id];
    if (!ins) continue;
    const custo = m.quantidade * Math.max(ins.custo_medio ?? 0, 0);
    const grupo = catToGrupo(ins.categoria);
    cpvPorGrupo[grupo] = (cpvPorGrupo[grupo] ?? 0) + custo;
    cpvTotal += custo;
  }

  // 4. DESPESAS DIRETAS — lancamentos com safra_id = ciclo, excluindo insumos (já no CPV)
  const despDirPorCat: Record<string, number> = {};
  let despDirTotal = 0;
  for (const l of lanDir) {
    if (INSUMO_CATS.includes(l.categoria)) continue;
    despDirPorCat[l.categoria] = (despDirPorCat[l.categoria] ?? 0) + l.valor;
    despDirTotal += l.valor;
  }

  // 5. DESPESAS INDIRETAS — overhead alocado via regras_rateio_linhas
  const regrasMap: Record<string, RatRegra> = Object.fromEntries(ratRegras.map(r => [r.id, r]));
  const despIndirPorCat: Record<string, number> = {};
  let despIndirTotal = 0;
  const linhasPorCiclo: Record<string, RatLinha[]> = {};
  for (const l of ratLinhas) {
    if (!linhasPorCiclo[l.ciclo_id]) linhasPorCiclo[l.ciclo_id] = [];
    linhasPorCiclo[l.ciclo_id].push(l);
  }
  for (const cicloId of cicloIds) {
    for (const linha of (linhasPorCiclo[cicloId] ?? [])) {
      const regra = regrasMap[linha.regra_id];
      if (!regra) continue;
      const pct = linha.percentual / 100;
      const lanAplic = lanOvh.filter(l =>
        !regra.tipos || regra.tipos.length === 0 || regra.tipos.includes(l.categoria)
      );
      for (const l of lanAplic) {
        const v = l.valor * pct;
        despIndirPorCat[l.categoria] = (despIndirPorCat[l.categoria] ?? 0) + v;
        despIndirTotal += v;
      }
    }
  }
  const overheadSemRateio = ratLinhas.length === 0
    ? lanOvh.reduce((s, l) => s + l.valor, 0)
    : 0;

  // 6. TOTAIS
  const custoTotal     = cpvTotal + despDirTotal + despIndirTotal + overheadSemRateio;
  const lucroBruto     = receitaLiquida - cpvTotal;
  const lucroOp        = lucroBruto - despDirTotal - despIndirTotal - overheadSemRateio;
  const lucroLiquido   = lucroOp; // PF rural não tem IRPJ/CSLL no regime simplificado

  // Ponto de equilíbrio
  const precoMedioSc = totalSacas > 0 ? receitaBRL / totalSacas : 0;
  const peSacas      = precoMedioSc > 0 ? custoTotal / precoMedioSc : 0;
  const folga        = totalSacas - peSacas;

  // ── Dados para Produtividade ──────────────────────────────
  const safrasOrd    = [...safras].sort((a, b) => a.ano_agricola.localeCompare(b.ano_agricola));
  const precoBase    = precoMedioSc > 0 ? precoMedioSc : 128;
  const maxReceita   = Math.max(...safrasOrd.map(s => (s.produtividade_sc_ha ?? 0) * (s.area_ha ?? 0) * precoBase), 1);
  const corCultura   = (c: string) => c === "Soja" ? "#1A4870" : c === "Milho 2ª" ? "#EF9F27" : "#378ADD";

  // ── Dados para Custos Totais (por grupo) ─────────────────
  const CUSTO_GRUPOS = [
    { label: "Sementes",           cats: ["Sementes"],              cor: "#0C447C", bg: "#EBF3FC" },
    { label: "Fertilizantes",      cats: ["Fertilizantes"],         cor: "#16A34A", bg: "#ECFDF5" },
    { label: "Corretivos de Solo", cats: ["Corretivos de Solo"],    cor: "#7C3AED", bg: "#F5F3FF" },
    { label: "Defensivos",         cats: ["Defensivos"],            cor: "#EF9F27", bg: "#FBF3E0" },
    { label: "Inoculantes",        cats: ["Inoculantes"],           cor: "#0EA5E9", bg: "#E0F2FE" },
    { label: "Outros Insumos",     cats: ["Outros Insumos"],        cor: "#555",    bg: "#F4F6FA" },
  ];
  const custosPorGrupo = CUSTO_GRUPOS.map(g => {
    const total = g.cats.reduce((s, c) => s + (cpvPorGrupo[c] ?? 0), 0);
    return { ...g, total };
  }).filter(g => g.total > 0);
  const maxGrupo = Math.max(...custosPorGrupo.map(g => g.total), 1);

  // ═══════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh", background: "#F3F6F9", fontFamily: "system-ui, sans-serif", fontSize: 13 }}>
      <TopNav />
      <main style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>

        {/* Cabeçalho */}
        <header style={{ background: "#fff", borderBottom: "0.5px solid #D4DCE8", padding: "10px 22px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <div style={{ fontSize: 11, color: "#888", marginBottom: 2 }}>Custos</div>
            <h1 style={{ margin: 0, fontSize: 17, fontWeight: 600, color: "#1a1a1a" }}>
              {aba === "dre" ? "DRE Agrícola" : aba === "custoha" ? "Custo / ha" : aba === "produtividade" ? "Produtividade" : "Custos Totais"}
            </h1>
          </div>
          <button onClick={() => window.print()} style={{ background: "#1A4870", color: "#fff", border: "none", borderRadius: 8, padding: "8px 16px", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
            Exportar PDF
          </button>
        </header>

        {/* Barra de filtros (todas as abas) */}
        {!initLoading && aba !== "produtividade" && (
          <FiltroBar
            anosSafra={anosSafra} anoSafraId={anoSafraId} setAnoSafraId={setAnoSafraId}
            ciclos={ciclos} cicloIds={cicloIds} setCicloIds={setCicloIds} dreLoading={dreLoading}
          />
        )}

        <div style={{ padding: "16px 22px", flex: 1, overflowY: "auto" }}>

          {initLoading && (
            <div style={{ textAlign: "center", padding: 40, color: "#444" }}>Carregando…</div>
          )}

          {!initLoading && (
            <>
              {/* ── KPI Cards ────────────────────────────────── */}
              {aba !== "produtividade" && (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 12, marginBottom: 14 }}>
                  {[
                    { label: "Receita bruta",           valor: fmtBRL(receitaBRL),  cor: "#1A4870" },
                    { label: "Custo de insumos (CPV)",  valor: fmtBRL(cpvTotal),    cor: "#E24B4A" },
                    { label: "Lucro bruto",             valor: fmtBRL(lucroBruto),  cor: lucroBruto >= 0 ? "#1A4870" : "#E24B4A" },
                    { label: "Resultado operacional",   valor: fmtBRL(lucroOp),     cor: lucroOp >= 0 ? "#1A4870" : "#E24B4A" },
                    { label: "Margem líquida",          valor: receitaBRL > 0 ? `${fmtNum(lucroLiquido / receitaBRL * 100, 1)}%` : "—", cor: lucroLiquido >= 0 ? "#16A34A" : "#E24B4A" },
                  ].map((k, i) => (
                    <div key={i} style={{ background: "#fff", border: "0.5px solid #D4DCE8", borderRadius: 12, padding: "12px 14px" }}>
                      <div style={{ fontSize: 10, color: "#555", marginBottom: 5 }}>{k.label}</div>
                      <div style={{ fontSize: 17, fontWeight: 600, color: k.cor }}>{k.valor}</div>
                    </div>
                  ))}
                </div>
              )}

              {/* Aviso quando sem dados */}
              {aba !== "produtividade" && !dreLoading && cicloIds.length > 0 && receitaBRL === 0 && cpvTotal === 0 && (
                <div style={{ background: "#FBF3E0", border: "0.5px solid #C9921B40", borderRadius: 10, padding: "12px 16px", marginBottom: 14, fontSize: 13, color: "#7A5A12" }}>
                  <strong>Sem dados para os ciclos selecionados.</strong> Verifique se há contratos confirmados e operações de lavoura registradas. Contratos precisam ter <code>ciclo_id</code> preenchido e estar confirmados.
                </div>
              )}

              {/* ══════════ ABA: DRE ══════════ */}
              {aba === "dre" && !dreLoading && (
                <div style={{ background: "#fff", border: "0.5px solid #D4DCE8", borderRadius: 12, overflow: "hidden" }}>
                  <div style={{ padding: "14px 20px", borderBottom: "0.5px solid #DEE5EE", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 14, color: "#1a1a1a" }}>Demonstração do Resultado do Exercício — Agrícola</div>
                      <div style={{ fontSize: 11, color: "#555", marginTop: 2 }}>
                        Base: consumo de insumos via custo médio ponderado · despesas diretas por ciclo · overhead rateado
                      </div>
                    </div>
                    <div style={{ fontSize: 11, color: "#444", textAlign: "right" }}>
                      {areaHa > 0 && <div>{fmtNum(areaHa, 0)} ha</div>}
                      {totalSacas > 0 && <div>{fmtNum(totalSacas, 0)} sc contratadas</div>}
                    </div>
                  </div>

                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead>
                      <tr style={{ background: "#F3F6F9" }}>
                        {["Conta", "Total (R$)", "R$/ha", "R$/sc", "% Receita"].map((h, i) => (
                          <th key={i} style={{ padding: "8px 20px", textAlign: i === 0 ? "left" : "right", fontSize: 11, fontWeight: 600, color: "#555", borderBottom: "0.5px solid #D4DCE8" }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>

                      {/* RECEITA BRUTA */}
                      <DreRow label="RECEITA BRUTA" valor={receitaBRL} ha={areaHa} sc={totalSacas} base={receitaBRL} bold bg="#D5E8F5" noBorder />
                      {Object.entries(contratosPorProduto).sort((a, b) => b[1] - a[1]).map(([prod, v]) => (
                        <DreRow key={prod} label={prod} valor={v} ha={areaHa} sc={totalSacas} base={receitaBRL} indent />
                      ))}
                      {contratos.some(c => c.moeda === "USD") && (
                        <tr>
                          <td colSpan={5} style={{ padding: "4px 34px", fontSize: 11, color: "#EF9F27", borderBottom: "0.5px solid #DEE5EE" }}>
                            ⚠ Contratos em USD não convertidos — incluir cotação para totalização correta
                          </td>
                        </tr>
                      )}

                      {/* DEDUÇÕES */}
                      <DreRow label="(-) DEDUÇÕES DA RECEITA" valor={deducoes} ha={areaHa} sc={totalSacas} base={receitaBRL} bold bg="#FCEBEB" negativo noBorder />
                      <DreRow label="Funrural (1,5%)" valor={funrural} ha={areaHa} sc={totalSacas} base={receitaBRL} indent negativo />
                      <DreRow label="SENAR (0,2%)" valor={senar} ha={areaHa} sc={totalSacas} base={receitaBRL} indent negativo />

                      {/* RECEITA LÍQUIDA */}
                      <DreRow label="= RECEITA LÍQUIDA" valor={receitaLiquida} ha={areaHa} sc={totalSacas} base={receitaBRL} bold bg="#E4F0F9" />

                      {/* CPV */}
                      <DreRow label="(-) CUSTO DE INSUMOS" valor={cpvTotal} ha={areaHa} sc={totalSacas} base={receitaBRL} bold bg="#FAEEDA" negativo noBorder />
                      {Object.entries(cpvPorGrupo).sort((a, b) => b[1] - a[1]).map(([grupo, v]) => (
                        <DreRow key={grupo} label={grupo} valor={v} ha={areaHa} sc={totalSacas} base={receitaBRL} indent negativo />
                      ))}
                      {cpvTotal === 0 && (
                        <tr><td colSpan={5} style={{ padding: "6px 34px", fontSize: 11, color: "#888", borderBottom: "0.5px solid #DEE5EE" }}>
                          Nenhuma movimentação de saída de estoque vinculada a estes ciclos
                        </td></tr>
                      )}

                      {/* LUCRO BRUTO */}
                      <DreRow label="= MARGEM BRUTA" valor={lucroBruto} ha={areaHa} sc={totalSacas} base={receitaBRL} bold
                        bg={lucroBruto >= 0 ? "#E4F0F9" : "#FCEBEB"}
                        cor={lucroBruto >= 0 ? "#0B2D50" : "#791F1F"} />

                      {/* DESPESAS DIRETAS */}
                      <DreRow label="(-) DESPESAS OPERACIONAIS DIRETAS" valor={despDirTotal} ha={areaHa} sc={totalSacas} base={receitaBRL} bold bg="#FBF3E0" negativo noBorder />
                      {Object.entries(despDirPorCat).sort((a, b) => b[1] - a[1]).map(([cat, v]) => (
                        <DreRow key={cat} label={cat} valor={v} ha={areaHa} sc={totalSacas} base={receitaBRL} indent negativo />
                      ))}
                      {despDirTotal === 0 && (
                        <tr><td colSpan={5} style={{ padding: "6px 34px", fontSize: 11, color: "#888", borderBottom: "0.5px solid #DEE5EE" }}>
                          Nenhum lançamento de despesa direta vinculado a estes ciclos
                        </td></tr>
                      )}

                      {/* DESPESAS INDIRETAS RATEADAS */}
                      <DreRow label={ratLinhas.length > 0 ? "(-) OVERHEAD RATEADO" : "(-) OVERHEAD (sem rateio configurado)"}
                        valor={despIndirTotal + overheadSemRateio} ha={areaHa} sc={totalSacas} base={receitaBRL} bold bg="#F5F3FF" negativo noBorder />
                      {ratLinhas.length > 0
                        ? Object.entries(despIndirPorCat).sort((a, b) => b[1] - a[1]).map(([cat, v]) => (
                          <DreRow key={cat} label={cat} valor={v} ha={areaHa} sc={totalSacas} base={receitaBRL} indent negativo />
                        ))
                        : lanOvh.slice(0, 10).map(l => (
                          <tr key={l.id} style={{ borderBottom: "0.5px solid #DEE5EE" }}>
                            <td style={{ padding: "6px 34px", fontSize: 11, color: "#555", maxWidth: 300, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{l.descricao}</td>
                            <td style={{ padding: "6px 20px", textAlign: "right", fontSize: 11, color: "#E24B4A" }}>({fmtBRL(l.valor)})</td>
                            <td colSpan={3} style={{ padding: "6px 20px", fontSize: 10, color: "#888", textAlign: "right" }}>sem rateio</td>
                          </tr>
                        ))
                      }
                      {ratLinhas.length === 0 && lanOvh.length > 10 && (
                        <tr><td colSpan={5} style={{ padding: "4px 34px", fontSize: 11, color: "#888", borderBottom: "0.5px solid #DEE5EE" }}>
                          … e mais {lanOvh.length - 10} lançamentos. Configure regras de rateio em Configurações → Regras de Rateio.
                        </td></tr>
                      )}
                      {ratLinhas.length === 0 && lanOvh.length === 0 && (
                        <tr><td colSpan={5} style={{ padding: "6px 34px", fontSize: 11, color: "#888", borderBottom: "0.5px solid #DEE5EE" }}>Nenhum overhead registrado</td></tr>
                      )}

                      {/* RESULTADO OPERACIONAL */}
                      <DreRow label="= RESULTADO OPERACIONAL" valor={lucroOp} ha={areaHa} sc={totalSacas} base={receitaBRL} bold
                        bg={lucroOp >= 0 ? "#E4F0F9" : "#FCEBEB"}
                        cor={lucroOp >= 0 ? "#0B2D50" : "#791F1F"} />

                      {/* RESULTADO LÍQUIDO */}
                      <tr style={{ background: lucroLiquido >= 0 ? "#D5E8F5" : "#FCEBEB", borderTop: `2px solid ${lucroLiquido >= 0 ? "#1A4870" : "#E24B4A"}` }}>
                        <td style={{ padding: "12px 20px", fontWeight: 700, fontSize: 13, color: lucroLiquido >= 0 ? "#0B2D50" : "#791F1F" }}>= RESULTADO LÍQUIDO DO CICLO</td>
                        <td style={{ padding: "12px 20px", textAlign: "right", fontWeight: 700, fontSize: 15, color: lucroLiquido >= 0 ? "#0B2D50" : "#791F1F" }}>
                          {lucroLiquido < 0 ? "(" : ""}{fmtBRL(Math.abs(lucroLiquido))}{lucroLiquido < 0 ? ")" : ""}
                        </td>
                        <td style={{ padding: "12px 20px", textAlign: "right", fontWeight: 700, color: lucroLiquido >= 0 ? "#0B2D50" : "#791F1F" }}>
                          {areaHa > 0 ? fmtBRL(lucroLiquido / areaHa) : "—"}
                        </td>
                        <td style={{ padding: "12px 20px", textAlign: "right", fontWeight: 700, color: lucroLiquido >= 0 ? "#0B2D50" : "#791F1F" }}>
                          {totalSacas > 0 ? fmtBRL(lucroLiquido / totalSacas, 2) : "—"}
                        </td>
                        <td style={{ padding: "12px 20px", textAlign: "right", fontWeight: 700, color: lucroLiquido >= 0 ? "#0B2D50" : "#791F1F" }}>
                          {receitaBRL > 0 ? `${fmtNum(lucroLiquido / receitaBRL * 100, 1)}%` : "—"}
                        </td>
                      </tr>
                    </tbody>
                  </table>

                  {/* Ponto de equilíbrio */}
                  {totalSacas > 0 && precoMedioSc > 0 && (
                    <div style={{ padding: "16px 20px", borderTop: "0.5px solid #DEE5EE", background: "#F8FAFD" }}>
                      <div style={{ fontSize: 12, fontWeight: 600, color: "#1a1a1a", marginBottom: 10 }}>Análise do Ponto de Equilíbrio</div>
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 12 }}>
                        {[
                          { label: "Preço médio contratado", v: `${fmtBRL(precoMedioSc, 2)}/sc`, cor: "#1A4870" },
                          { label: "PE (sc necessárias)", v: `${fmtNum(peSacas, 0)} sc`, cor: "#E24B4A" },
                          { label: "Sacas contratadas", v: `${fmtNum(totalSacas, 0)} sc`, cor: "#1a1a1a" },
                          { label: "Folga acima do PE", v: folga >= 0 ? `+${fmtNum(folga, 0)} sc` : `${fmtNum(folga, 0)} sc`, cor: folga >= 0 ? "#16A34A" : "#E24B4A" },
                        ].map((k, i) => (
                          <div key={i} style={{ background: "#fff", border: "0.5px solid #D4DCE8", borderRadius: 8, padding: "10px 12px" }}>
                            <div style={{ fontSize: 10, color: "#555", marginBottom: 3 }}>{k.label}</div>
                            <div style={{ fontSize: 14, fontWeight: 600, color: k.cor }}>{k.v}</div>
                          </div>
                        ))}
                      </div>
                      {totalSacas > 0 && (
                        <div>
                          <div style={{ fontSize: 10, color: "#555", marginBottom: 4 }}>
                            PE: {fmtNum(peSacas, 0)} sc de {fmtNum(totalSacas, 0)} sc contratadas ({fmtNum(peSacas / totalSacas * 100, 1)}%)
                          </div>
                          <div style={{ height: 14, background: "#DEE5EE", borderRadius: 4, overflow: "hidden", position: "relative" }}>
                            <div style={{ height: "100%", width: `${Math.min(100, peSacas / totalSacas * 100)}%`, background: "#E24B4A", borderRadius: 4 }} />
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Nota metodológica */}
                  <div style={{ padding: "10px 20px", borderTop: "0.5px solid #DEE5EE", fontSize: 10, color: "#888" }}>
                    Custo de insumos apurado via custo médio ponderado na baixa do estoque (movimentações_estoque × custo_medio). Lançamentos de insumos excluídos para evitar dupla contagem. Overhead alocado conforme regras de rateio configuradas.
                  </div>
                </div>
              )}

              {/* ══════════ ABA: Custo/ha ══════════ */}
              {aba === "custoha" && !dreLoading && (
                <div style={{ background: "#fff", border: "0.5px solid #D4DCE8", borderRadius: 12, overflow: "hidden" }}>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", borderBottom: "0.5px solid #DEE5EE" }}>
                    {[
                      { label: "Custo insumos/ha",   v: areaHa > 0 ? fmtBRL(cpvTotal / areaHa) : "—",       cor: "#E24B4A" },
                      { label: "Desp. diretas/ha",   v: areaHa > 0 ? fmtBRL(despDirTotal / areaHa) : "—",   cor: "#C9921B" },
                      { label: "Custo total/ha",     v: areaHa > 0 ? fmtBRL(custoTotal / areaHa) : "—",     cor: "#1a1a1a" },
                      { label: "Receita/ha",         v: areaHa > 0 ? fmtBRL(receitaBRL / areaHa) : "—",     cor: "#1A4870" },
                    ].map((k, i) => (
                      <div key={i} style={{ padding: "14px 18px", borderRight: i < 3 ? "0.5px solid #DEE5EE" : "none" }}>
                        <div style={{ fontSize: 11, color: "#555", marginBottom: 5 }}>{k.label}</div>
                        <div style={{ fontSize: 18, fontWeight: 600, color: k.cor }}>{k.v}</div>
                      </div>
                    ))}
                  </div>
                  <div style={{ padding: "16px 20px" }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: "#E24B4A", marginBottom: 12 }}>Custo de insumos por grupo (custo médio na baixa)</div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      {Object.entries(cpvPorGrupo).sort((a, b) => b[1] - a[1]).map(([grupo, v]) => {
                        const maxV = Math.max(...Object.values(cpvPorGrupo), 1);
                        return (
                          <div key={grupo}>
                            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, marginBottom: 3 }}>
                              <span style={{ color: "#555" }}>{grupo}</span>
                              <span style={{ fontWeight: 600, color: "#1a1a1a" }}>
                                {fmtBRL(v)}{areaHa > 0 ? ` · ${fmtBRL(v / areaHa)}/ha` : ""}{totalSacas > 0 ? ` · ${fmtBRL(v / totalSacas, 2)}/sc` : ""}
                              </span>
                            </div>
                            <div style={{ height: 8, background: "#DEE5EE", borderRadius: 4, overflow: "hidden" }}>
                              <div style={{ height: "100%", width: `${Math.max(4, v / maxV * 100)}%`, background: "#E24B4A", borderRadius: 4 }} />
                            </div>
                          </div>
                        );
                      })}
                      {Object.keys(cpvPorGrupo).length === 0 && (
                        <div style={{ color: "#888", fontSize: 12 }}>Nenhuma movimentação de saída de estoque para os ciclos selecionados.</div>
                      )}
                    </div>

                    {Object.keys(despDirPorCat).length > 0 && (
                      <div style={{ marginTop: 20 }}>
                        <div style={{ fontSize: 12, fontWeight: 600, color: "#C9921B", marginBottom: 12 }}>Despesas operacionais diretas por categoria</div>
                        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                          {Object.entries(despDirPorCat).sort((a, b) => b[1] - a[1]).map(([cat, v]) => {
                            const maxV = Math.max(...Object.values(despDirPorCat), 1);
                            return (
                              <div key={cat}>
                                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, marginBottom: 3 }}>
                                  <span style={{ color: "#555" }}>{cat}</span>
                                  <span style={{ fontWeight: 600, color: "#1a1a1a" }}>
                                    {fmtBRL(v)}{areaHa > 0 ? ` · ${fmtBRL(v / areaHa)}/ha` : ""}
                                  </span>
                                </div>
                                <div style={{ height: 8, background: "#DEE5EE", borderRadius: 4, overflow: "hidden" }}>
                                  <div style={{ height: "100%", width: `${Math.max(4, v / maxV * 100)}%`, background: "#C9921B", borderRadius: 4 }} />
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {totalSacas > 0 && (
                      <div style={{ marginTop: 20, borderTop: "0.5px solid #DEE5EE", paddingTop: 14 }}>
                        <div style={{ fontSize: 12, fontWeight: 600, color: "#1a1a1a", marginBottom: 10 }}>Equivalência em sacas</div>
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10 }}>
                          {[
                            { label: "Insumos/sc",        v: cpvTotal / totalSacas,    cor: "#E24B4A" },
                            { label: "Desp. diretas/sc",  v: despDirTotal / totalSacas, cor: "#C9921B" },
                            { label: "Overhead/sc",       v: (despIndirTotal + overheadSemRateio) / totalSacas, cor: "#7C3AED" },
                            { label: "Custo total/sc",    v: custoTotal / totalSacas,  cor: "#1a1a1a" },
                          ].map((k, i) => (
                            <div key={i} style={{ background: "#F3F6F9", borderRadius: 10, padding: "12px 14px" }}>
                              <div style={{ fontSize: 10, color: "#555", marginBottom: 4 }}>{k.label}</div>
                              <div style={{ fontSize: 16, fontWeight: 600, color: k.cor }}>{fmtBRL(k.v, 2)}</div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* ══════════ ABA: Produtividade ══════════ */}
              {aba === "produtividade" && (
                <div style={{ background: "#fff", border: "0.5px solid #D4DCE8", borderRadius: 12, padding: "14px 18px" }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: "#1a1a1a", marginBottom: 14 }}>Safras cadastradas — produtividade</div>
                  {safrasOrd.length === 0 ? (
                    <div style={{ padding: 40, textAlign: "center", color: "#666" }}>Nenhuma safra cadastrada.</div>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                      {safrasOrd.map((s, i) => {
                        const recEstim = (s.produtividade_sc_ha ?? 0) * (s.area_ha ?? 0) * precoBase;
                        const pct      = maxReceita > 0 ? recEstim / maxReceita : 0;
                        const cor      = corCultura(s.cultura);
                        const statusCors: Record<string, { bg: string; color: string }> = {
                          colhida:      { bg: "#D5E8F5", color: "#0B2D50" },
                          em_andamento: { bg: "#FAEEDA", color: "#633806" },
                          planejada:    { bg: "#E6F1FB", color: "#0C447C" },
                          cancelada:    { bg: "#F1EFE8", color: "#666"    },
                        };
                        const sc = statusCors[s.status] ?? statusCors.planejada;
                        const stLbl: Record<string, string> = { colhida: "Colhida", em_andamento: "Em andamento", planejada: "Planejada", cancelada: "Cancelada" };
                        return (
                          <div key={s.id} style={{ display: "flex", gap: 14, alignItems: "center", padding: "12px 14px", borderRadius: 10, border: "0.5px solid #D4DCE8", background: i === safrasOrd.length - 1 ? "#F8FAFD" : "transparent" }}>
                            <div style={{ width: 110, flexShrink: 0 }}>
                              <div style={{ fontSize: 12, fontWeight: 600, color: "#1a1a1a" }}>{s.cultura} {s.ano_agricola}</div>
                              <span style={{ fontSize: 10, background: sc.bg, color: sc.color, padding: "1px 6px", borderRadius: 6 }}>{stLbl[s.status]}</span>
                            </div>
                            <div style={{ width: 60, flexShrink: 0, textAlign: "right", fontSize: 12, color: "#666" }}>{fmtNum(s.area_ha)} ha</div>
                            <div style={{ flex: 1 }}>
                              <div style={{ height: 14, borderRadius: 4, background: `${cor}20`, overflow: "hidden" }}>
                                <div style={{ height: "100%", width: `${pct * 100}%`, background: cor, borderRadius: 4 }} />
                              </div>
                            </div>
                            <div style={{ width: 80, textAlign: "right", fontSize: 12, fontWeight: 600, color: "#1a1a1a" }}>
                              {recEstim > 0 ? `${fmtBRL(recEstim / 1000, 0)}k` : "—"}
                            </div>
                            <div style={{ width: 70, textAlign: "right" }}>
                              <div style={{ fontSize: 12, fontWeight: 600, color: "#1a1a1a" }}>{s.produtividade_sc_ha ? fmtNum(s.produtividade_sc_ha, 1) : "—"}</div>
                              <div style={{ fontSize: 10, color: "#444" }}>sc/ha</div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                  {safrasOrd.filter(s => s.status === "colhida" && s.produtividade_sc_ha).length > 0 && (() => {
                    const colhidas = safrasOrd.filter(s => s.status === "colhida" && s.produtividade_sc_ha);
                    const melhor   = colhidas.reduce((a, b) => (b.produtividade_sc_ha ?? 0) > (a.produtividade_sc_ha ?? 0) ? b : a, colhidas[0]);
                    const media    = colhidas.reduce((s, c) => s + (c.produtividade_sc_ha ?? 0), 0) / colhidas.length;
                    return (
                      <div style={{ marginTop: 16, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                        <div style={{ background: "#D5E8F5", border: "0.5px solid #1A487030", borderRadius: 10, padding: "12px 14px" }}>
                          <div style={{ fontSize: 11, color: "#0B2D50", marginBottom: 4, fontWeight: 600 }}>Melhor safra</div>
                          <div style={{ fontSize: 16, fontWeight: 700, color: "#0B2D50" }}>{melhor.cultura} {melhor.ano_agricola} — {fmtNum(melhor.produtividade_sc_ha ?? 0, 1)} sc/ha</div>
                        </div>
                        <div style={{ background: "#FAEEDA", border: "0.5px solid #EF9F2730", borderRadius: 10, padding: "12px 14px" }}>
                          <div style={{ fontSize: 11, color: "#633806", marginBottom: 4, fontWeight: 600 }}>Produtividade média colhida</div>
                          <div style={{ fontSize: 16, fontWeight: 700, color: "#633806" }}>{fmtNum(media, 1)} sc/ha</div>
                          <div style={{ fontSize: 10, color: "#EF9F27", marginTop: 2 }}>Referência MT: 60–65 sc/ha</div>
                        </div>
                      </div>
                    );
                  })()}
                </div>
              )}

              {/* ══════════ ABA: Custos Totais ══════════ */}
              {aba === "custostotais" && !dreLoading && (
                <div style={{ background: "#fff", border: "0.5px solid #D4DCE8", borderRadius: 12, overflow: "hidden" }}>
                  {/* KPIs custos totais */}
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", borderBottom: "0.5px solid #DEE5EE" }}>
                    {[
                      { label: "Custo de Insumos",     v: fmtBRL(cpvTotal),    cor: "#E24B4A" },
                      { label: "Desp. Diretas",        v: fmtBRL(despDirTotal), cor: "#C9921B" },
                      { label: "Overhead Rateado",     v: fmtBRL(despIndirTotal + overheadSemRateio), cor: "#7C3AED" },
                      { label: "Custo Total",          v: fmtBRL(custoTotal),  cor: "#1a1a1a" },
                    ].map((k, i) => (
                      <div key={i} style={{ padding: "14px 18px", borderRight: i < 3 ? "0.5px solid #DEE5EE" : "none" }}>
                        <div style={{ fontSize: 11, color: "#555", marginBottom: 4 }}>{k.label}</div>
                        <div style={{ fontSize: 18, fontWeight: 700, color: k.cor }}>{k.v}</div>
                        {areaHa > 0 && <div style={{ fontSize: 11, color: "#888", marginTop: 3 }}>{fmtBRL(parseFloat(k.v.replace(/[^0-9,-]/g, "").replace(",", ".")) / areaHa)}/ha</div>}
                      </div>
                    ))}
                  </div>

                  <div style={{ padding: "16px 20px" }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: "#1a1a1a", marginBottom: 14 }}>Composição de Insumos por Grupo</div>
                    {custosPorGrupo.length === 0 ? (
                      <div style={{ color: "#888", fontSize: 12, padding: 20 }}>Nenhum consumo de insumo registrado para os ciclos selecionados.</div>
                    ) : (
                      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                        {custosPorGrupo.map(g => (
                          <div key={g.label} style={{ background: g.bg, borderRadius: 10, padding: "12px 16px", border: `0.5px solid ${g.cor}20` }}>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                              <span style={{ fontSize: 13, fontWeight: 600, color: g.cor }}>{g.label}</span>
                              <div style={{ display: "flex", gap: 16, fontSize: 12 }}>
                                <span style={{ fontWeight: 700, color: "#1a1a1a" }}>{fmtBRL(g.total)}</span>
                                {areaHa > 0 && <span style={{ color: "#555" }}>{fmtBRL(g.total / areaHa)}/ha</span>}
                                <span style={{ color: "#888" }}>{cpvTotal > 0 ? fmtNum(g.total / cpvTotal * 100, 1) : "0,0"}%</span>
                              </div>
                            </div>
                            <div style={{ height: 8, background: "#E0E5EE", borderRadius: 4, overflow: "hidden" }}>
                              <div style={{ height: "100%", width: `${Math.max(2, g.total / maxGrupo * 100)}%`, background: g.cor, borderRadius: 4 }} />
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Despesas diretas */}
                    {Object.keys(despDirPorCat).length > 0 && (
                      <div style={{ marginTop: 20 }}>
                        <div style={{ fontSize: 12, fontWeight: 600, color: "#C9921B", marginBottom: 10 }}>Despesas Operacionais Diretas</div>
                        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                          {Object.entries(despDirPorCat).sort((a, b) => b[1] - a[1]).map(([cat, v]) => (
                            <div key={cat} style={{ display: "flex", justifyContent: "space-between", padding: "8px 12px", background: "#FBF3E0", borderRadius: 8, fontSize: 12 }}>
                              <span style={{ color: "#555" }}>{cat}</span>
                              <div style={{ display: "flex", gap: 12 }}>
                                <span style={{ fontWeight: 600, color: "#1a1a1a" }}>{fmtBRL(v)}</span>
                                {areaHa > 0 && <span style={{ color: "#888" }}>{fmtBRL(v / areaHa)}/ha</span>}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Overhead */}
                    {(despIndirTotal + overheadSemRateio) > 0 && (
                      <div style={{ marginTop: 20 }}>
                        <div style={{ fontSize: 12, fontWeight: 600, color: "#7C3AED", marginBottom: 10 }}>
                          Overhead {ratLinhas.length > 0 ? "Rateado" : "(sem rateio — total)"}
                        </div>
                        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                          {ratLinhas.length > 0
                            ? Object.entries(despIndirPorCat).sort((a, b) => b[1] - a[1]).map(([cat, v]) => (
                              <div key={cat} style={{ display: "flex", justifyContent: "space-between", padding: "8px 12px", background: "#F5F3FF", borderRadius: 8, fontSize: 12 }}>
                                <span style={{ color: "#555" }}>{cat}</span>
                                <span style={{ fontWeight: 600, color: "#1a1a1a" }}>{fmtBRL(v)}</span>
                              </div>
                            ))
                            : <div style={{ padding: "8px 12px", background: "#F5F3FF", borderRadius: 8, fontSize: 12, color: "#555" }}>
                              {fmtBRL(overheadSemRateio)} — Configure regras de rateio em <strong>Configurações → Regras de Rateio</strong>
                            </div>
                          }
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              <p style={{ textAlign: "center", fontSize: 11, color: "#666", marginTop: 24 }}>RacTech · menos cliques, mais campo</p>
            </>
          )}
        </div>
      </main>
    </div>
  );
}

export default function Custos() {
  return (
    <Suspense fallback={<div style={{ minHeight: "100vh", background: "#F3F6F9" }} />}>
      <CustosInner />
    </Suspense>
  );
}
