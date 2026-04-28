"use client";
import { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import TopNav from "../../components/TopNav";
import { listarLancamentos, listarSafras } from "../../lib/db";
import { useAuth } from "../../components/AuthProvider";
import { supabase } from "../../lib/supabase";
import type { Lancamento, Safra } from "../../lib/supabase";

type AbaRel = "dre" | "custoha" | "produtividade" | "custostotais";

interface AnoSafra { id: string; descricao: string; fazenda_id: string }
interface Ciclo    { id: string; fazenda_id: string; ano_safra_id: string; cultura: string; descricao: string; area_ha?: number }
interface RateioRegra { id: string; fazenda_id: string; ano_safra_id: string; tipos: string[]; proporcao: number; ciclo_id?: string }

const fmtBRL = (v: number, decimais = 0) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: decimais, maximumFractionDigits: decimais });

const fmtNum = (v: number, dec = 0) =>
  v.toLocaleString("pt-BR", { minimumFractionDigits: dec, maximumFractionDigits: dec });

const labelStyle: React.CSSProperties = { fontSize: 11, color: "#555", marginBottom: 4, display: "block" };
const inputStyle: React.CSSProperties = {
  width: "100%", padding: "8px 10px", border: "0.5px solid #D4DCE8",
  borderRadius: 8, fontSize: 13, color: "#1a1a1a", background: "#fff",
  boxSizing: "border-box", outline: "none",
};

const CPV_CATS = [
  "Insumos — Sementes", "Insumos — Fertilizantes", "Insumos — Defensivos",
  "Insumos — Inoculantes", "Serviços Agrícolas", "Fretes e Transportes", "Mão de obra",
];
const DESP_OP_CATS = [
  "Arrendamento de Terra", "Seguros", "Manutenção de Máquinas",
  "Despesas Administrativas", "Juros e IOF", "Depreciação",
];

const CUSTO_GRUPOS: { label: string; cats: string[]; cor: string; corFundo: string }[] = [
  { label: "Sementes",             cats: ["Insumos — Sementes"],         cor: "#0C447C", corFundo: "#EBF3FC" },
  { label: "Fertilizantes",        cats: ["Insumos — Fertilizantes"],    cor: "#16A34A", corFundo: "#ECFDF5" },
  { label: "Defensivos & Outros",  cats: ["Insumos — Defensivos", "Insumos — Inoculantes"], cor: "#EF9F27", corFundo: "#FBF3E0" },
  { label: "Serviços & Fretes",    cats: ["Serviços Agrícolas", "Fretes e Transportes", "Mão de obra"], cor: "#7C3AED", corFundo: "#F5F3FF" },
  { label: "Arrendamento",         cats: ["Arrendamento de Terra"],      cor: "#E24B4A", corFundo: "#FCEBEB" },
  { label: "Encargos & Admin",     cats: ["Despesas Administrativas", "Seguros"], cor: "#555", corFundo: "#F4F6FA" },
  { label: "Manutenção & Outros",  cats: ["Manutenção de Máquinas", "Depreciação", "Juros e IOF"], cor: "#9B59B6", corFundo: "#F3E8FF" },
];

const somarCat = (lans: Lancamento[]): Record<string, number> => {
  const r: Record<string, number> = {};
  for (const l of lans) r[l.categoria] = (r[l.categoria] ?? 0) + l.valor;
  return r;
};

function CustosInner() {
  const { fazendaId } = useAuth();
  const searchParams = useSearchParams();
  const aba = (searchParams.get("aba") as AbaRel) || "dre";

  const [lancamentos, setLancamentos] = useState<Lancamento[]>([]);
  const [safras, setSafras]           = useState<Safra[]>([]);
  const [carregando, setCarregando]   = useState(true);
  const [erro, setErro]               = useState<string | null>(null);

  // Custos Totais — estado extra
  const [anosSafra,    setAnosSafra]    = useState<AnoSafra[]>([]);
  const [ciclos,       setCiclos]       = useState<Ciclo[]>([]);
  const [rateios,      setRateios]      = useState<RateioRegra[]>([]);
  const [ctAnoSafraId, setCtAnoSafraId] = useState("");
  const [ctCicloIds,   setCtCicloIds]   = useState<string[]>([]);
  const [ctView,       setCtView]       = useState<"resumo" | "detalhe">("resumo");
  const [ctCarregando, setCtCarregando] = useState(false);

  useEffect(() => {
    if (!fazendaId) return;
    Promise.all([
      listarLancamentos(fazendaId),
      listarSafras(fazendaId),
    ]).then(([lans, sfrs]) => {
      setLancamentos(lans);
      setSafras(sfrs);
    }).catch(e => setErro(e instanceof Error ? e.message : "Erro ao carregar"))
      .finally(() => setCarregando(false));
  }, [fazendaId]);

  // Carrega anos_safra e ciclos para o filtro de Custos Totais
  useEffect(() => {
    if (!fazendaId) return;
    setCtCarregando(true);
    Promise.all([
      supabase.from("anos_safra").select("*").eq("fazenda_id", fazendaId).order("descricao", { ascending: false }),
      supabase.from("ciclos").select("id,fazenda_id,ano_safra_id,cultura,descricao,area_ha").eq("fazenda_id", fazendaId).order("descricao"),
      supabase.from("regras_rateio").select("*").eq("fazenda_id", fazendaId),
    ]).then(([aR, cR, rR]) => {
      const as = (aR.data ?? []) as AnoSafra[];
      const cs = (cR.data ?? []) as Ciclo[];
      const rs = (rR.data ?? []) as RateioRegra[];
      setAnosSafra(as);
      setCiclos(cs);
      setRateios(rs);
      if (as.length > 0) {
        setCtAnoSafraId(as[0].id);
        const primeirosCiclos = cs.filter(c => c.ano_safra_id === as[0].id).map(c => c.id);
        setCtCicloIds(primeirosCiclos);
      }
    }).finally(() => setCtCarregando(false));
  }, [fazendaId]);

  // DRE — agregação
  const safraColhida = safras.find(s => s.status === "colhida")
                    ?? safras.find(s => s.status === "em_andamento")
                    ?? safras[0];
  const areaHa        = safraColhida?.area_ha ?? 4820;
  const prodScha      = safraColhida?.produtividade_sc_ha ?? 0;
  const sacasColhidas = Math.round(areaHa * prodScha);
  const precoBase     = sacasColhidas > 0 && (lancamentos.filter(l => l.tipo === "receber").reduce((s, l) => s + l.valor, 0)) > 0
    ? Math.round((lancamentos.filter(l => l.tipo === "receber").reduce((s, l) => s + l.valor, 0)) / sacasColhidas * 100) / 100
    : 128;

  const lanReceitas = lancamentos.filter(l => l.tipo === "receber");
  const lanPagar    = lancamentos.filter(l => l.tipo === "pagar");
  const lanCPV      = lanPagar.filter(l => CPV_CATS.includes(l.categoria));
  const lanDespOp   = lanPagar.filter(l => DESP_OP_CATS.includes(l.categoria));

  const receitaBruta = lanReceitas.reduce((s, l) => s + l.valor, 0);
  const cpv          = lanCPV.reduce((s, l) => s + l.valor, 0);
  const despOp       = lanDespOp.reduce((s, l) => s + l.valor, 0);

  const catReceitas = somarCat(lanReceitas);
  const catCPV      = somarCat(lanCPV);
  const catDespOp   = somarCat(lanDespOp);

  const funrural  = Math.round(receitaBruta * 0.015);
  const senar     = Math.round(receitaBruta * 0.002);
  const deducoes  = funrural + senar;

  const receitaLiquida  = receitaBruta - deducoes;
  const lucroBruto      = receitaLiquida - cpv;
  const lucroOp         = lucroBruto - despOp;
  const recFinanceiras  = lancamentos.filter(l => l.categoria === "Receitas Financeiras").reduce((s, l) => s + l.valor, 0);
  const despFinanceiras = lancamentos.filter(l => l.categoria === "Despesas Financeiras").reduce((s, l) => s + l.valor, 0);
  const resultFinanceiro = recFinanceiras - despFinanceiras;
  const lair            = lucroOp + resultFinanceiro;
  const irpj            = lair > 0 ? Math.round(lair * 0.15 + Math.max(0, lair - 240000) * 0.10) : 0;
  const csll            = lair > 0 ? Math.round(lair * 0.09) : 0;
  const lucroLiquido    = lair - irpj - csll;

  const safrasOrd = [...safras].sort((a, b) => a.ano_agricola.localeCompare(b.ano_agricola));
  const maxReceita = Math.max(...safrasOrd.map(s => (s.produtividade_sc_ha ?? 0) * (s.area_ha ?? 0) * precoBase), 1);
  const corCultura = (c: string) => c === "Soja" ? "#1A4870" : c === "Milho 2ª" ? "#EF9F27" : "#378ADD";

  const custosVar   = Object.entries(catCPV).sort((a, b) => b[1] - a[1]);
  const custosFixed = Object.entries(catDespOp).sort((a, b) => b[1] - a[1]);
  const maxCustoBar = Math.max(...custosVar.map(c => c[1]), ...custosFixed.map(c => c[1]), 1);

  // Custos Totais — derivados
  const ciclosFiltrados = ciclos.filter(c => c.ano_safra_id === ctAnoSafraId);
  const ciclosSelecionados = ciclos.filter(c => ctCicloIds.includes(c.id));
  const areaTotalCiclos = ciclosSelecionados.reduce((s, c) => s + (c.area_ha ?? 0), 0);

  // Todos os lançamentos pagar (sem filtro de ciclo pois lancamentos não têm ciclo_id direto)
  const lanCustos = lanPagar;
  const totalCustos = lanCustos.reduce((s, l) => s + l.valor, 0);

  // Rateio info para o ano/ciclos selecionados
  const rateioDoAno = rateios.filter(r => r.ano_safra_id === ctAnoSafraId);

  // Custo por grupo (aggregated)
  const custosPorGrupo = CUSTO_GRUPOS.map(g => {
    const total = lanCustos.filter(l => g.cats.includes(l.categoria)).reduce((s, l) => s + l.valor, 0);
    const itens = lanCustos.filter(l => g.cats.includes(l.categoria));
    return { ...g, total, itens };
  }).filter(g => g.total > 0 || ctView === "detalhe");

  // Total geral
  const totalGrupos = custosPorGrupo.reduce((s, g) => s + g.total, 0);
  const maxGrupo = Math.max(...custosPorGrupo.map(g => g.total), 1);

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh", background: "#F3F6F9", fontFamily: "system-ui, sans-serif", fontSize: 13 }}>
      <TopNav />
      <main style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>

        <header style={{ background: "#fff", borderBottom: "0.5px solid #D4DCE8", padding: "10px 22px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <div style={{ fontSize: 11, color: "#888", marginBottom: 2 }}>Custos</div>
            <h1 style={{ margin: 0, fontSize: 17, fontWeight: 600, color: "#1a1a1a" }}>
              {aba === "dre"           ? "DRE Agrícola"
              : aba === "custoha"      ? "Custo / ha"
              : aba === "produtividade"? "Produtividade"
              : "Custos Totais"}
            </h1>
          </div>
          <button onClick={() => window.print()} style={{ background: "#1A5C38", color: "#fff", border: "none", borderRadius: 8, padding: "8px 16px", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
            ⟳ Exportar PDF
          </button>
        </header>

        <div style={{ padding: "16px 22px", flex: 1, overflowY: "auto" }}>

          {carregando && (
            <div style={{ textAlign: "center", padding: 40, color: "#444", fontSize: 13 }}>Carregando relatórios…</div>
          )}

          {erro && (
            <div style={{ background: "#FCEBEB", border: "0.5px solid #E24B4A50", borderRadius: 8, padding: "10px 16px", marginBottom: 14, fontSize: 13, color: "#791F1F" }}>
              ⚠ {erro}
            </div>
          )}

          {!carregando && !erro && (
            <>
              {/* KPIs */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 12, marginBottom: 14 }}>
                {[
                  { label: "Receita bruta",            valor: fmtBRL(receitaBruta),  cor: "#1A4870" },
                  { label: "Custo de produção",         valor: fmtBRL(cpv),           cor: "#E24B4A" },
                  { label: "Lucro bruto",               valor: fmtBRL(lucroBruto),    cor: lucroBruto >= 0 ? "#1A4870" : "#E24B4A" },
                  { label: "Lucro operacional (EBIT)",  valor: fmtBRL(lucroOp),       cor: lucroOp >= 0 ? "#1A4870" : "#E24B4A" },
                  { label: "Lucro líquido",             valor: fmtBRL(lucroLiquido),  cor: lucroLiquido >= 0 ? "#1A4870" : "#E24B4A" },
                ].map((s, i) => (
                  <div key={i} style={{ background: "#fff", border: "0.5px solid #D4DCE8", borderRadius: 12, padding: "12px 14px" }}>
                    <div style={{ fontSize: 10, color: "#555", marginBottom: 5 }}>{s.label}</div>
                    <div style={{ fontSize: 17, fontWeight: 600, color: s.cor }}>{s.valor}</div>
                  </div>
                ))}
              </div>


              {/* ——— ABA: DRE ——— */}
              {aba === "dre" && (
                <div style={{ background: "#fff", border: "0.5px solid #D4DCE8", borderRadius: 12, overflow: "hidden" }}>
                  <div style={{ padding: "14px 20px", borderBottom: "0.5px solid #DEE5EE", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 14, color: "#1a1a1a" }}>Demonstração do Resultado do Exercício — Agrícola</div>
                      <div style={{ fontSize: 11, color: "#555", marginTop: 2 }}>
                        {safraColhida
                          ? `Safra ${safraColhida.cultura} ${safraColhida.ano_agricola} · ${fmtNum(areaHa)} ha${prodScha > 0 ? ` · ${fmtNum(sacasColhidas)} sc colhidas (${fmtNum(prodScha, 1)} sc/ha)` : ""}`
                          : "Todos os lançamentos"
                        }
                      </div>
                    </div>
                    <div style={{ fontSize: 11, color: "#444" }}>
                      {safraColhida?.status === "colhida" ? `Encerrada · ${safraColhida.data_colheita ?? "—"}` : "Em andamento"}
                    </div>
                  </div>
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead>
                      <tr style={{ background: "#F3F6F9" }}>
                        {["Conta", "Total (R$)", "R$/ha", sacasColhidas > 0 ? "R$/sc" : "", "% Receita"].map((h, i) => (
                          <th key={i} style={{ padding: "8px 20px", textAlign: i === 0 ? "left" : "right", fontSize: 11, fontWeight: 600, color: "#555", borderBottom: "0.5px solid #D4DCE8" }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      <tr style={{ background: "#D5E8F5" }}>
                        <td style={{ padding: "9px 20px", fontWeight: 700, fontSize: 12, color: "#0B2D50" }}>RECEITA BRUTA</td>
                        <td style={{ padding: "9px 20px", textAlign: "right", fontWeight: 700, color: "#0B2D50" }}>{fmtBRL(receitaBruta)}</td>
                        <td style={{ padding: "9px 20px", textAlign: "right", color: "#0B2D50", fontWeight: 600 }}>{areaHa > 0 ? fmtBRL(receitaBruta / areaHa) : "—"}</td>
                        <td style={{ padding: "9px 20px", textAlign: "right", color: "#0B2D50", fontWeight: 600 }}>{sacasColhidas > 0 ? fmtBRL(receitaBruta / sacasColhidas, 2) : "—"}</td>
                        <td style={{ padding: "9px 20px", textAlign: "right", color: "#0B2D50", fontWeight: 600 }}>100,0%</td>
                      </tr>
                      {Object.entries(catReceitas).sort((a, b) => b[1] - a[1]).map(([cat, v]) => (
                        <tr key={cat} style={{ borderBottom: "0.5px solid #DEE5EE" }}>
                          <td style={{ padding: "8px 20px 8px 34px", fontSize: 12, color: "#1a1a1a" }}>{cat}</td>
                          <td style={{ padding: "8px 20px", textAlign: "right", color: "#1A4870" }}>{fmtBRL(v)}</td>
                          <td style={{ padding: "8px 20px", textAlign: "right", color: "#1a1a1a", fontSize: 11 }}>{areaHa > 0 ? fmtBRL(v / areaHa) : "—"}</td>
                          <td style={{ padding: "8px 20px", textAlign: "right", color: "#1a1a1a", fontSize: 11 }}>{sacasColhidas > 0 ? fmtBRL(v / sacasColhidas, 2) : "—"}</td>
                          <td style={{ padding: "8px 20px", textAlign: "right", color: "#1a1a1a", fontSize: 11 }}>{receitaBruta > 0 ? fmtNum(v / receitaBruta * 100, 1) : "0,0"}%</td>
                        </tr>
                      ))}
                      <tr style={{ background: "#FCEBEB" }}>
                        <td style={{ padding: "9px 20px", fontWeight: 700, fontSize: 12, color: "#791F1F" }}>(-) DEDUÇÕES DA RECEITA</td>
                        <td style={{ padding: "9px 20px", textAlign: "right", fontWeight: 700, color: "#791F1F" }}>({fmtBRL(deducoes)})</td>
                        <td style={{ padding: "9px 20px", textAlign: "right", color: "#791F1F", fontWeight: 600 }}>{areaHa > 0 ? `(${fmtBRL(deducoes / areaHa)})` : "—"}</td>
                        <td style={{ padding: "9px 20px", textAlign: "right", color: "#791F1F", fontWeight: 600 }}>{sacasColhidas > 0 ? `(${fmtBRL(deducoes / sacasColhidas, 2)})` : "—"}</td>
                        <td style={{ padding: "9px 20px", textAlign: "right", color: "#791F1F", fontWeight: 600 }}>{receitaBruta > 0 ? fmtNum(deducoes / receitaBruta * 100, 1) : "0,0"}%</td>
                      </tr>
                      {[{ label: "Funrural (1,5%)", v: funrural }, { label: "SENAR (0,2%)", v: senar }].map((r, i) => (
                        <tr key={i} style={{ borderBottom: "0.5px solid #DEE5EE" }}>
                          <td style={{ padding: "8px 20px 8px 34px", fontSize: 12, color: "#1a1a1a" }}>{r.label}</td>
                          <td style={{ padding: "8px 20px", textAlign: "right", color: "#E24B4A" }}>({fmtBRL(r.v)})</td>
                          <td style={{ padding: "8px 20px", textAlign: "right", color: "#1a1a1a", fontSize: 11 }}>{areaHa > 0 ? `(${fmtBRL(r.v / areaHa)})` : "—"}</td>
                          <td style={{ padding: "8px 20px", textAlign: "right", color: "#1a1a1a", fontSize: 11 }}>{sacasColhidas > 0 ? `(${fmtBRL(r.v / sacasColhidas, 2)})` : "—"}</td>
                          <td style={{ padding: "8px 20px", textAlign: "right", color: "#1a1a1a", fontSize: 11 }}>{receitaBruta > 0 ? fmtNum(r.v / receitaBruta * 100, 1) : "0,0"}%</td>
                        </tr>
                      ))}
                      <tr style={{ background: "#E4F0F9", borderTop: "0.5px solid #1A487040" }}>
                        <td style={{ padding: "9px 20px", fontWeight: 700, fontSize: 12, color: "#0B2D50" }}>= RECEITA LÍQUIDA</td>
                        <td style={{ padding: "9px 20px", textAlign: "right", fontWeight: 700, color: "#0B2D50" }}>{fmtBRL(receitaLiquida)}</td>
                        <td style={{ padding: "9px 20px", textAlign: "right", color: "#0B2D50", fontWeight: 600 }}>{areaHa > 0 ? fmtBRL(receitaLiquida / areaHa) : "—"}</td>
                        <td style={{ padding: "9px 20px", textAlign: "right", color: "#0B2D50", fontWeight: 600 }}>{sacasColhidas > 0 ? fmtBRL(receitaLiquida / sacasColhidas, 2) : "—"}</td>
                        <td style={{ padding: "9px 20px", textAlign: "right", color: "#0B2D50", fontWeight: 600 }}>{receitaBruta > 0 ? fmtNum(receitaLiquida / receitaBruta * 100, 1) : "—"}%</td>
                      </tr>
                      <tr style={{ background: "#FAEEDA" }}>
                        <td style={{ padding: "9px 20px", fontWeight: 700, fontSize: 12, color: "#633806" }}>(-) CUSTO DE PRODUÇÃO</td>
                        <td style={{ padding: "9px 20px", textAlign: "right", fontWeight: 700, color: "#633806" }}>({fmtBRL(cpv)})</td>
                        <td style={{ padding: "9px 20px", textAlign: "right", color: "#633806", fontWeight: 600 }}>{areaHa > 0 ? `(${fmtBRL(cpv / areaHa)})` : "—"}</td>
                        <td style={{ padding: "9px 20px", textAlign: "right", color: "#633806", fontWeight: 600 }}>{sacasColhidas > 0 ? `(${fmtBRL(cpv / sacasColhidas, 2)})` : "—"}</td>
                        <td style={{ padding: "9px 20px", textAlign: "right", color: "#633806", fontWeight: 600 }}>{receitaBruta > 0 ? fmtNum(cpv / receitaBruta * 100, 1) : "—"}%</td>
                      </tr>
                      {Object.entries(catCPV).sort((a, b) => b[1] - a[1]).map(([cat, v]) => (
                        <tr key={cat} style={{ borderBottom: "0.5px solid #DEE5EE" }}>
                          <td style={{ padding: "8px 20px 8px 34px", fontSize: 12, color: "#1a1a1a" }}>{cat}</td>
                          <td style={{ padding: "8px 20px", textAlign: "right", color: "#E24B4A" }}>({fmtBRL(v)})</td>
                          <td style={{ padding: "8px 20px", textAlign: "right", color: "#1a1a1a", fontSize: 11 }}>{areaHa > 0 ? `(${fmtBRL(v / areaHa)})` : "—"}</td>
                          <td style={{ padding: "8px 20px", textAlign: "right", color: "#1a1a1a", fontSize: 11 }}>{sacasColhidas > 0 ? `(${fmtBRL(v / sacasColhidas, 2)})` : "—"}</td>
                          <td style={{ padding: "8px 20px", textAlign: "right", color: "#1a1a1a", fontSize: 11 }}>{receitaBruta > 0 ? fmtNum(v / receitaBruta * 100, 1) : "—"}%</td>
                        </tr>
                      ))}
                      <tr style={{ background: lucroBruto >= 0 ? "#E4F0F9" : "#FCEBEB", borderTop: `0.5px solid ${lucroBruto >= 0 ? "#1A487040" : "#E24B4A40"}` }}>
                        <td style={{ padding: "9px 20px", fontWeight: 700, fontSize: 12, color: lucroBruto >= 0 ? "#0B2D50" : "#791F1F" }}>= LUCRO BRUTO</td>
                        <td style={{ padding: "9px 20px", textAlign: "right", fontWeight: 700, color: lucroBruto >= 0 ? "#0B2D50" : "#791F1F" }}>{lucroBruto < 0 ? "(" : ""}{fmtBRL(Math.abs(lucroBruto))}{lucroBruto < 0 ? ")" : ""}</td>
                        <td style={{ padding: "9px 20px", textAlign: "right", fontWeight: 600, color: lucroBruto >= 0 ? "#0B2D50" : "#791F1F" }}>{areaHa > 0 ? fmtBRL(lucroBruto / areaHa) : "—"}</td>
                        <td style={{ padding: "9px 20px", textAlign: "right", fontWeight: 600, color: lucroBruto >= 0 ? "#0B2D50" : "#791F1F" }}>{sacasColhidas > 0 ? fmtBRL(lucroBruto / sacasColhidas, 2) : "—"}</td>
                        <td style={{ padding: "9px 20px", textAlign: "right", fontWeight: 600, color: lucroBruto >= 0 ? "#0B2D50" : "#791F1F" }}>{receitaBruta > 0 ? fmtNum(lucroBruto / receitaBruta * 100, 1) : "—"}%</td>
                      </tr>
                      <tr style={{ background: "#FBF3E0" }}>
                        <td style={{ padding: "9px 20px", fontWeight: 700, fontSize: 12, color: "#8B5E14" }}>(-) DESPESAS OPERACIONAIS</td>
                        <td style={{ padding: "9px 20px", textAlign: "right", fontWeight: 700, color: "#8B5E14" }}>({fmtBRL(despOp)})</td>
                        <td style={{ padding: "9px 20px", textAlign: "right", color: "#8B5E14", fontWeight: 600 }}>{areaHa > 0 ? `(${fmtBRL(despOp / areaHa)})` : "—"}</td>
                        <td style={{ padding: "9px 20px", textAlign: "right", color: "#8B5E14", fontWeight: 600 }}>{sacasColhidas > 0 ? `(${fmtBRL(despOp / sacasColhidas, 2)})` : "—"}</td>
                        <td style={{ padding: "9px 20px", textAlign: "right", color: "#8B5E14", fontWeight: 600 }}>{receitaBruta > 0 ? fmtNum(despOp / receitaBruta * 100, 1) : "—"}%</td>
                      </tr>
                      {Object.entries(catDespOp).sort((a, b) => b[1] - a[1]).map(([cat, v]) => (
                        <tr key={cat} style={{ borderBottom: "0.5px solid #DEE5EE" }}>
                          <td style={{ padding: "8px 20px 8px 34px", fontSize: 12, color: "#1a1a1a" }}>{cat}</td>
                          <td style={{ padding: "8px 20px", textAlign: "right", color: "#C9921B" }}>({fmtBRL(v)})</td>
                          <td style={{ padding: "8px 20px", textAlign: "right", color: "#1a1a1a", fontSize: 11 }}>{areaHa > 0 ? `(${fmtBRL(v / areaHa)})` : "—"}</td>
                          <td style={{ padding: "8px 20px", textAlign: "right", color: "#1a1a1a", fontSize: 11 }}>{sacasColhidas > 0 ? `(${fmtBRL(v / sacasColhidas, 2)})` : "—"}</td>
                          <td style={{ padding: "8px 20px", textAlign: "right", color: "#1a1a1a", fontSize: 11 }}>{receitaBruta > 0 ? fmtNum(v / receitaBruta * 100, 1) : "—"}%</td>
                        </tr>
                      ))}
                      <tr style={{ background: lucroOp >= 0 ? "#E4F0F9" : "#FCEBEB", borderTop: `0.5px solid ${lucroOp >= 0 ? "#1A487040" : "#E24B4A40"}` }}>
                        <td style={{ padding: "9px 20px", fontWeight: 700, fontSize: 12, color: lucroOp >= 0 ? "#0B2D50" : "#791F1F" }}>= LUCRO OPERACIONAL (EBIT)</td>
                        <td style={{ padding: "9px 20px", textAlign: "right", fontWeight: 700, color: lucroOp >= 0 ? "#0B2D50" : "#791F1F" }}>{lucroOp < 0 ? "(" : ""}{fmtBRL(Math.abs(lucroOp))}{lucroOp < 0 ? ")" : ""}</td>
                        <td style={{ padding: "9px 20px", textAlign: "right", fontWeight: 600, color: lucroOp >= 0 ? "#0B2D50" : "#791F1F" }}>{areaHa > 0 ? fmtBRL(lucroOp / areaHa) : "—"}</td>
                        <td style={{ padding: "9px 20px", textAlign: "right", fontWeight: 600, color: lucroOp >= 0 ? "#0B2D50" : "#791F1F" }}>{sacasColhidas > 0 ? fmtBRL(lucroOp / sacasColhidas, 2) : "—"}</td>
                        <td style={{ padding: "9px 20px", textAlign: "right", fontWeight: 600, color: lucroOp >= 0 ? "#0B2D50" : "#791F1F" }}>{receitaBruta > 0 ? fmtNum(lucroOp / receitaBruta * 100, 1) : "—"}%</td>
                      </tr>
                      <tr style={{ background: "#FBF3E0" }}>
                        <td style={{ padding: "9px 20px", fontWeight: 700, fontSize: 12, color: "#8B5E14" }}>(-) IRPJ E CSLL</td>
                        <td style={{ padding: "9px 20px", textAlign: "right", fontWeight: 700, color: "#8B5E14" }}>{irpj + csll > 0 ? `(${fmtBRL(irpj + csll)})` : "—"}</td>
                        <td colSpan={3} />
                      </tr>
                      {[
                        { label: `IRPJ (15%${lair > 240000 ? " + 10% adicional" : ""})`, v: irpj },
                        { label: "CSLL (9%)", v: csll },
                      ].map((r, i) => (
                        <tr key={i} style={{ borderBottom: "0.5px solid #DEE5EE" }}>
                          <td style={{ padding: "8px 20px 8px 34px", fontSize: 12, color: "#1a1a1a" }}>
                            {r.label}
                            {r.v === 0 && <span style={{ marginLeft: 8, fontSize: 10, color: "#444" }}>— sem incidência</span>}
                          </td>
                          <td style={{ padding: "8px 20px", textAlign: "right", color: r.v > 0 ? "#E24B4A" : "#444" }}>{r.v > 0 ? `(${fmtBRL(r.v)})` : "—"}</td>
                          <td colSpan={3} />
                        </tr>
                      ))}
                      <tr style={{ background: lucroLiquido >= 0 ? "#D5E8F5" : "#FCEBEB", borderTop: `1.5px solid ${lucroLiquido >= 0 ? "#1A4870" : "#E24B4A"}` }}>
                        <td style={{ padding: "12px 20px", fontWeight: 700, fontSize: 13, color: lucroLiquido >= 0 ? "#0B2D50" : "#791F1F" }}>= LUCRO LÍQUIDO DO EXERCÍCIO</td>
                        <td style={{ padding: "12px 20px", textAlign: "right", fontWeight: 700, fontSize: 15, color: lucroLiquido >= 0 ? "#0B2D50" : "#791F1F" }}>{lucroLiquido < 0 ? "(" : ""}{fmtBRL(Math.abs(lucroLiquido))}{lucroLiquido < 0 ? ")" : ""}</td>
                        <td style={{ padding: "12px 20px", textAlign: "right", fontWeight: 700, color: lucroLiquido >= 0 ? "#0B2D50" : "#791F1F" }}>{areaHa > 0 ? fmtBRL(lucroLiquido / areaHa) : "—"}</td>
                        <td style={{ padding: "12px 20px", textAlign: "right", fontWeight: 700, color: lucroLiquido >= 0 ? "#0B2D50" : "#791F1F" }}>{sacasColhidas > 0 ? fmtBRL(lucroLiquido / sacasColhidas, 2) : "—"}</td>
                        <td style={{ padding: "12px 20px", textAlign: "right", fontWeight: 700, color: lucroLiquido >= 0 ? "#0B2D50" : "#791F1F" }}>{receitaBruta > 0 ? fmtNum(lucroLiquido / receitaBruta * 100, 1) : "—"}%</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              )}

              {/* ——— ABA: Custo/ha ——— */}
              {aba === "custoha" && (
                <div style={{ background: "#fff", border: "0.5px solid #D4DCE8", borderRadius: 12, overflow: "hidden" }}>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", borderBottom: "0.5px solid #DEE5EE" }}>
                    {[
                      { label: "Custo variável/ha",  valor: areaHa > 0 ? fmtBRL(cpv / areaHa) : "—",           cor: "#E24B4A" },
                      { label: "Custo fixo/ha",       valor: areaHa > 0 ? fmtBRL(despOp / areaHa) : "—",        cor: "#C9921B" },
                      { label: "Custo total/ha",      valor: areaHa > 0 ? fmtBRL((cpv + despOp) / areaHa) : "—",cor: "#1a1a1a" },
                      { label: "Receita/ha",          valor: areaHa > 0 ? fmtBRL(receitaBruta / areaHa) : "—",  cor: "#1A4870" },
                    ].map((s, i) => (
                      <div key={i} style={{ padding: "14px 18px", borderRight: i < 3 ? "0.5px solid #DEE5EE" : "none" }}>
                        <div style={{ fontSize: 11, color: "#555", marginBottom: 5 }}>{s.label}</div>
                        <div style={{ fontSize: 18, fontWeight: 600, color: s.cor }}>{s.valor}</div>
                      </div>
                    ))}
                  </div>
                  <div style={{ padding: "16px 20px" }}>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>
                      <div>
                        <div style={{ fontSize: 12, fontWeight: 600, color: "#E24B4A", marginBottom: 12 }}>Custo variável por categoria</div>
                        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                          {custosVar.length === 0 ? (
                            <div style={{ color: "#666", fontSize: 12 }}>Nenhum lançamento de custo variável.</div>
                          ) : custosVar.map(([cat, v]) => (
                            <div key={cat}>
                              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, marginBottom: 3 }}>
                                <span style={{ color: "#555" }}>{cat}</span>
                                <span style={{ fontWeight: 600, color: "#1a1a1a" }}>{fmtBRL(v)} {areaHa > 0 ? `· ${fmtBRL(v / areaHa)}/ha` : ""}</span>
                              </div>
                              <div style={{ height: 8, background: "#DEE5EE", borderRadius: 4, overflow: "hidden" }}>
                                <div style={{ height: "100%", width: `${Math.max(4, v / maxCustoBar * 100)}%`, background: "#E24B4A", borderRadius: 4 }} />
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                      <div>
                        <div style={{ fontSize: 12, fontWeight: 600, color: "#C9921B", marginBottom: 12 }}>Despesas operacionais por categoria</div>
                        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                          {custosFixed.length === 0 ? (
                            <div style={{ color: "#666", fontSize: 12 }}>Nenhuma despesa operacional.</div>
                          ) : custosFixed.map(([cat, v]) => (
                            <div key={cat}>
                              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, marginBottom: 3 }}>
                                <span style={{ color: "#555" }}>{cat}</span>
                                <span style={{ fontWeight: 600, color: "#1a1a1a" }}>{fmtBRL(v)} {areaHa > 0 ? `· ${fmtBRL(v / areaHa)}/ha` : ""}</span>
                              </div>
                              <div style={{ height: 8, background: "#DEE5EE", borderRadius: 4, overflow: "hidden" }}>
                                <div style={{ height: "100%", width: `${Math.max(4, v / maxCustoBar * 100)}%`, background: "#C9921B", borderRadius: 4 }} />
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                    {sacasColhidas > 0 && (
                      <div style={{ marginTop: 20, borderTop: "0.5px solid #DEE5EE", paddingTop: 14 }}>
                        <div style={{ fontSize: 12, fontWeight: 600, color: "#1a1a1a", marginBottom: 10 }}>Equivalência em sacas</div>
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
                          {[
                            { label: "Custo variável/sc", v: cpv / sacasColhidas, cor: "#E24B4A" },
                            { label: "Custo fixo/sc",      v: despOp / sacasColhidas, cor: "#C9921B" },
                            { label: "Custo total/sc",     v: (cpv + despOp) / sacasColhidas, cor: "#1a1a1a" },
                          ].map((s, i) => (
                            <div key={i} style={{ background: "#F3F6F9", borderRadius: 10, padding: "12px 14px" }}>
                              <div style={{ fontSize: 10, color: "#555", marginBottom: 4 }}>{s.label}</div>
                              <div style={{ fontSize: 16, fontWeight: 600, color: s.cor }}>{fmtBRL(s.v, 2)}</div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* ——— ABA: Produtividade ——— */}
              {aba === "produtividade" && (
                <div style={{ background: "#fff", border: "0.5px solid #D4DCE8", borderRadius: 12, padding: "14px 18px" }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: "#1a1a1a", marginBottom: 14 }}>Safras cadastradas — produtividade e resultado estimado</div>
                  {safrasOrd.length === 0 ? (
                    <div style={{ padding: 40, textAlign: "center", color: "#666" }}>Nenhuma safra cadastrada.</div>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                      {safrasOrd.map((s, i) => {
                        const recEstim = (s.produtividade_sc_ha ?? 0) * (s.area_ha ?? 0) * precoBase;
                        const pct      = maxReceita > 0 ? recEstim / maxReceita : 0;
                        const cor      = corCultura(s.cultura);
                        const statusLabels: Record<string, string> = {
                          colhida: "Colhida", em_andamento: "Em andamento", planejada: "Planejada", cancelada: "Cancelada",
                        };
                        const statusCors: Record<string, { bg: string; color: string }> = {
                          colhida:      { bg: "#D5E8F5", color: "#0B2D50" },
                          em_andamento: { bg: "#FAEEDA", color: "#633806" },
                          planejada:    { bg: "#E6F1FB", color: "#0C447C" },
                          cancelada:    { bg: "#F1EFE8", color: "#666"    },
                        };
                        const sc = statusCors[s.status] ?? statusCors.planejada;
                        return (
                          <div key={s.id} style={{ display: "flex", gap: 14, alignItems: "center", padding: "12px 14px", borderRadius: 10, border: "0.5px solid #D4DCE8", background: i === safrasOrd.length - 1 ? "#F8FAFD" : "transparent" }}>
                            <div style={{ width: 110, flexShrink: 0 }}>
                              <div style={{ fontSize: 12, fontWeight: 600, color: "#1a1a1a" }}>{s.cultura} {s.ano_agricola}</div>
                              <span style={{ fontSize: 10, background: sc.bg, color: sc.color, padding: "1px 6px", borderRadius: 6 }}>{statusLabels[s.status]}</span>
                            </div>
                            <div style={{ width: 60, flexShrink: 0, textAlign: "right", fontSize: 12, color: "#666" }}>{fmtNum(s.area_ha)} ha</div>
                            <div style={{ flex: 1 }}>
                              <div style={{ height: 14, borderRadius: 4, background: `${cor}20`, position: "relative", overflow: "hidden" }}>
                                <div style={{ height: "100%", width: `${pct * 100}%`, background: cor, borderRadius: 4 }} />
                              </div>
                            </div>
                            <div style={{ width: 80, textAlign: "right", fontSize: 12, fontWeight: 600, color: "#1a1a1a" }}>
                              {recEstim > 0 ? `${fmtBRL(recEstim / 1000, 0)}k` : "—"}
                            </div>
                            <div style={{ width: 70, textAlign: "right" }}>
                              <div style={{ fontSize: 12, fontWeight: 600, color: "#1a1a1a" }}>
                                {s.produtividade_sc_ha ? fmtNum(s.produtividade_sc_ha, 1) : "—"}
                              </div>
                              <div style={{ fontSize: 10, color: "#444" }}>sc/ha</div>
                            </div>
                            {s.data_plantio && (
                              <div style={{ width: 80, textAlign: "right", fontSize: 10, color: "#444" }}>
                                Plantio<br />{s.data_plantio.split("-").reverse().join("/")}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                  {safrasOrd.filter(s => s.status === "colhida").length > 0 && (() => {
                    const colhidas = safrasOrd.filter(s => s.status === "colhida" && s.produtividade_sc_ha);
                    const melhor   = colhidas.reduce((a, b) => (b.produtividade_sc_ha ?? 0) > (a.produtividade_sc_ha ?? 0) ? b : a, colhidas[0]);
                    const media    = colhidas.reduce((s, c) => s + (c.produtividade_sc_ha ?? 0), 0) / colhidas.length;
                    return (
                      <div style={{ marginTop: 16, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                        <div style={{ background: "#D5E8F5", border: "0.5px solid #1A487030", borderRadius: 10, padding: "12px 14px" }}>
                          <div style={{ fontSize: 11, color: "#0B2D50", marginBottom: 4, fontWeight: 600 }}>Melhor safra (produtividade)</div>
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

              {/* ——— ABA: Custos Totais ——— */}
              {aba === "custostotais" && (
                <div style={{ background: "#fff", border: "0.5px solid #D4DCE8", borderRadius: 12, overflow: "hidden" }}>

                  {/* Filtros */}
                  <div style={{ padding: "14px 20px", borderBottom: "0.5px solid #DEE5EE", background: "#F8FAFD" }}>
                    <div style={{ display: "grid", gridTemplateColumns: "200px 1fr auto", gap: 16, alignItems: "end" }}>
                      <div>
                        <label style={labelStyle}>Ano Safra</label>
                        <select value={ctAnoSafraId} onChange={e => {
                          setCtAnoSafraId(e.target.value);
                          const novos = ciclos.filter(c => c.ano_safra_id === e.target.value).map(c => c.id);
                          setCtCicloIds(novos);
                        }} style={inputStyle}>
                          <option value="">Todos</option>
                          {anosSafra.map(a => <option key={a.id} value={a.id}>{a.descricao}</option>)}
                        </select>
                      </div>
                      <div>
                        <label style={labelStyle}>Ciclos (clique para selecionar/desmarcar)</label>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                          {ciclosFiltrados.map(c => {
                            const sel = ctCicloIds.includes(c.id);
                            return (
                              <button key={c.id} onClick={() => setCtCicloIds(prev => sel ? prev.filter(id => id !== c.id) : [...prev, c.id])}
                                style={{ padding: "5px 12px", borderRadius: 20, border: `0.5px solid ${sel ? "#1A4870" : "#D4DCE8"}`, cursor: "pointer", fontSize: 12, fontWeight: sel ? 600 : 400, background: sel ? "#D5E8F5" : "#fff", color: sel ? "#0B2D50" : "#555" }}>
                                {c.descricao} {c.area_ha ? `· ${fmtNum(c.area_ha)} ha` : ""}
                              </button>
                            );
                          })}
                          {ciclosFiltrados.length === 0 && <span style={{ fontSize: 12, color: "#999" }}>Selecione um ano safra</span>}
                        </div>
                      </div>
                      <div style={{ display: "flex", gap: 6 }}>
                        {(["resumo", "detalhe"] as const).map(v => (
                          <button key={v} onClick={() => setCtView(v)}
                            style={{ padding: "7px 16px", borderRadius: 8, border: `0.5px solid ${ctView === v ? "#1A4870" : "#D4DCE8"}`, cursor: "pointer", fontSize: 12, fontWeight: ctView === v ? 600 : 400, background: ctView === v ? "#1A4870" : "#fff", color: ctView === v ? "#fff" : "#555" }}>
                            {v === "resumo" ? "Resumido" : "Detalhado"}
                          </button>
                        ))}
                      </div>
                    </div>
                    {areaTotalCiclos > 0 && (
                      <div style={{ marginTop: 10, fontSize: 11, color: "#555" }}>
                        {ciclosSelecionados.length} ciclo{ciclosSelecionados.length !== 1 ? "s" : ""} selecionado{ciclosSelecionados.length !== 1 ? "s" : ""} · {fmtNum(areaTotalCiclos, 0)} ha total
                        {rateioDoAno.length > 0 && (
                          <span style={{ marginLeft: 10, background: "#EBF3FC", color: "#0C447C", padding: "2px 8px", borderRadius: 10, fontWeight: 600 }}>
                            {rateioDoAno.length} regra{rateioDoAno.length !== 1 ? "s" : ""} de rateio ativa{rateioDoAno.length !== 1 ? "s" : ""}
                          </span>
                        )}
                      </div>
                    )}
                  </div>

                  {ctCarregando ? (
                    <div style={{ padding: 40, textAlign: "center", color: "#666" }}>Carregando dados de custos…</div>
                  ) : (
                    <>
                      {/* KPIs */}
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", borderBottom: "0.5px solid #DEE5EE" }}>
                        {[
                          { label: "Custo Total",    v: fmtBRL(totalGrupos),  cor: "#E24B4A" },
                          { label: "Custo / ha",     v: areaTotalCiclos > 0 ? fmtBRL(totalGrupos / areaTotalCiclos) : "—", cor: "#1a1a1a" },
                          { label: "Custo / sc",     v: sacasColhidas > 0 ? fmtBRL(totalGrupos / sacasColhidas, 2) : "—", cor: "#1a1a1a" },
                          { label: "% sobre Receita",v: receitaBruta > 0 ? `${fmtNum(totalGrupos / receitaBruta * 100, 1)}%` : "—", cor: totalGrupos <= receitaBruta ? "#16A34A" : "#E24B4A" },
                        ].map((k, i) => (
                          <div key={i} style={{ padding: "14px 18px", borderRight: i < 3 ? "0.5px solid #DEE5EE" : "none" }}>
                            <div style={{ fontSize: 11, color: "#555", marginBottom: 4 }}>{k.label}</div>
                            <div style={{ fontSize: 18, fontWeight: 700, color: k.cor }}>{k.v}</div>
                          </div>
                        ))}
                      </div>

                      {/* Resumido: barras por grupo */}
                      {ctView === "resumo" && (
                        <div style={{ padding: "16px 20px" }}>
                          {custosPorGrupo.length === 0 ? (
                            <div style={{ padding: 32, textAlign: "center", color: "#888" }}>Nenhum lançamento de custo encontrado.</div>
                          ) : (
                            <>
                              <div style={{ fontSize: 12, fontWeight: 600, color: "#1a1a1a", marginBottom: 14 }}>Composição dos Custos por Grupo</div>
                              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                                {custosPorGrupo.map(g => (
                                  <div key={g.label} style={{ background: g.corFundo, borderRadius: 10, padding: "12px 16px", border: `0.5px solid ${g.cor}20` }}>
                                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                                      <span style={{ fontSize: 13, fontWeight: 600, color: g.cor }}>{g.label}</span>
                                      <div style={{ display: "flex", gap: 16, fontSize: 12 }}>
                                        <span style={{ fontWeight: 700, color: "#1a1a1a" }}>{fmtBRL(g.total)}</span>
                                        {areaTotalCiclos > 0 && <span style={{ color: "#555" }}>{fmtBRL(g.total / areaTotalCiclos)}/ha</span>}
                                        <span style={{ color: "#888" }}>{totalGrupos > 0 ? fmtNum(g.total / totalGrupos * 100, 1) : "0,0"}%</span>
                                      </div>
                                    </div>
                                    <div style={{ height: 8, background: "#E0E5EE", borderRadius: 4, overflow: "hidden" }}>
                                      <div style={{ height: "100%", width: `${Math.max(2, g.total / maxGrupo * 100)}%`, background: g.cor, borderRadius: 4 }} />
                                    </div>
                                  </div>
                                ))}
                              </div>

                              {/* Regras de Rateio */}
                              {rateioDoAno.length > 0 && (
                                <div style={{ marginTop: 20, padding: "12px 16px", background: "#EBF3FC", borderRadius: 10, border: "0.5px solid #1A487020" }}>
                                  <div style={{ fontSize: 12, fontWeight: 700, color: "#0C447C", marginBottom: 8 }}>Regras de Rateio Configuradas</div>
                                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                                    {rateioDoAno.map(r => (
                                      <div key={r.id} style={{ fontSize: 11, color: "#1A4870", display: "flex", alignItems: "center", gap: 8 }}>
                                        <span style={{ background: "#1A4870", color: "#fff", borderRadius: 4, padding: "1px 6px", fontWeight: 700 }}>{fmtNum(r.proporcao, 0)}%</span>
                                        <span>{(r.tipos ?? []).join(", ") || "Todos os tipos"}</span>
                                        {r.ciclo_id && <span style={{ color: "#888" }}>· ciclo específico</span>}
                                      </div>
                                    ))}
                                  </div>
                                  <div style={{ fontSize: 10, color: "#555", marginTop: 6 }}>
                                    As regras de rateio determinam a proporção dos custos comuns atribuída a cada ciclo. Configure em Configurações → Regras de Rateio.
                                  </div>
                                </div>
                              )}
                            </>
                          )}
                        </div>
                      )}

                      {/* Detalhado: todos os lançamentos por grupo */}
                      {ctView === "detalhe" && (
                        <div style={{ overflowX: "auto" }}>
                          {CUSTO_GRUPOS.map(g => {
                            const itens = lanCustos.filter(l => g.cats.includes(l.categoria));
                            if (itens.length === 0) return null;
                            const totalG = itens.reduce((s, l) => s + l.valor, 0);
                            return (
                              <div key={g.label}>
                                <div style={{ padding: "8px 20px", background: g.corFundo, borderBottom: "0.5px solid #DEE5EE", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                  <span style={{ fontWeight: 700, fontSize: 12, color: g.cor }}>{g.label}</span>
                                  <div style={{ display: "flex", gap: 16, fontSize: 12 }}>
                                    <span style={{ fontWeight: 700, color: g.cor }}>{fmtBRL(totalG)}</span>
                                    {areaTotalCiclos > 0 && <span style={{ color: "#555" }}>{fmtBRL(totalG / areaTotalCiclos)}/ha</span>}
                                    <span style={{ color: "#888" }}>{totalGrupos > 0 ? fmtNum(totalG / totalGrupos * 100, 1) : "0,0"}%</span>
                                  </div>
                                </div>
                                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                                  <tbody>
                                    {itens.sort((a, b) => b.valor - a.valor).map((l, i) => (
                                      <tr key={l.id} style={{ borderBottom: i < itens.length - 1 ? "0.5px solid #F0F3F8" : "none" }}>
                                        <td style={{ padding: "7px 20px 7px 32px", fontSize: 12, color: "#1a1a1a", maxWidth: 260, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{l.descricao}</td>
                                        <td style={{ padding: "7px 20px", fontSize: 11, color: "#555" }}>{l.categoria}</td>
                                        <td style={{ padding: "7px 20px", fontSize: 11, color: "#888" }}>
                                          {l.data_vencimento ? new Date(l.data_vencimento + "T12:00:00").toLocaleDateString("pt-BR", { month: "short", year: "numeric" }) : "—"}
                                        </td>
                                        <td style={{ padding: "7px 20px", textAlign: "right" }}>
                                          <span style={{ fontSize: 10, background: l.status === "baixado" ? "#ECFDF5" : "#FBF3E0", color: l.status === "baixado" ? "#14532D" : "#7A5A12", padding: "2px 6px", borderRadius: 5, fontWeight: 600 }}>
                                            {l.status === "baixado" ? "Pago" : "A pagar"}
                                          </span>
                                        </td>
                                        <td style={{ padding: "7px 20px", textAlign: "right", fontSize: 12, fontWeight: 600, color: "#E24B4A" }}>{fmtBRL(l.valor)}</td>
                                        <td style={{ padding: "7px 20px", textAlign: "right", fontSize: 11, color: "#888" }}>{areaTotalCiclos > 0 ? fmtBRL(l.valor / areaTotalCiclos) + "/ha" : ""}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            );
                          })}
                          {lanCustos.length === 0 && (
                            <div style={{ padding: 32, textAlign: "center", color: "#888" }}>Nenhum lançamento de custo encontrado.</div>
                          )}
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}

              <p style={{ textAlign: "center", fontSize: 11, color: "#666", marginTop: 24 }}>Arato · menos cliques, mais campo</p>
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
