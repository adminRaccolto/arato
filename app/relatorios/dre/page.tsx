"use client";
import { useState, useEffect } from "react";
import TopNav from "../../../components/TopNav";
import { supabase } from "../../../lib/supabase";
import { useAuth } from "../../../components/AuthProvider";
import { listarFazendas } from "../../../lib/db";
import type { Fazenda } from "../../../lib/supabase";
import { getDreGrupo } from "../../../lib/seedOperacoesGerenciais";

// ─── Tipos ────────────────────────────────────────────────────
type AnoSafra   = { id: string; ano: string; fazenda_id?: string };
type Ciclo      = { id: string; cultura: string; ano_safra_id: string; fazenda_id: string };
type DreRow     = { label: string; valor: number; bold?: boolean; indent?: number; tipo?: "receita" | "custo" | "resultado" | "subtotal" };

type DreLinha = {
  codigo: string;
  label: string;
  valor: number;
  percentual: number;
  bold?: boolean;
  indent?: number;
  tipo: "receita" | "custo" | "resultado" | "subtotal" | "header";
  categoria?: string;
};

type DreData = {
  ciclo: Ciclo;
  anoSafra: AnoSafra;
  area_ha: number;
  // Receitas
  receita_venda: number;
  receita_bonificacao: number;
  receita_outras: number;
  receita_total: number;
  // Deduções
  funrural: number;
  senar: number;
  fundo_invest: number;
  deducoes_total: number;
  receita_liquida: number;
  // CPV — Custo dos Produtos Vendidos
  sementes: number;
  fertilizantes: number;
  defensivos: number;
  correcao_solo: number;
  operacoes_mecanizadas: number;
  combustivel: number;
  manutencao: number;
  cpv_total: number;
  // Despesas Operacionais
  arrendamento: number;
  mao_obra: number;
  administrativo: number;
  seguro_lavoura: number;
  assistencia_tecnica: number;
  desp_operacionais_total: number;
  // Despesas Financeiras
  juros_custeio: number;
  juros_outros: number;
  desp_financeiras_total: number;
  // Resultados
  lucro_bruto: number;
  ebitda: number;
  resultado_operacional: number;
  resultado_liquido: number;
  // Por hectare
  receita_ha: number;
  custo_total_ha: number;
  resultado_ha: number;
  // Produtividade
  produtividade_scha: number;
  preco_medio_sc: number;
};

function pct(valor: number, base: number) {
  if (!base) return 0;
  return (valor / base) * 100;
}

const fmt = (v: number, decs = 2) =>
  v.toLocaleString("pt-BR", { minimumFractionDigits: decs, maximumFractionDigits: decs });

const fmtPct = (v: number) => `${v >= 0 ? "+" : ""}${fmt(v, 1)}%`;
const fmtReal = (v: number) => `R$ ${fmt(v)}`;
const fmtHa   = (v: number) => `${fmt(v)} sc/ha`;

const CULT_LABELS: Record<string, string> = { soja: "Soja", milho1: "Milho 1ª", milho2: "Milho 2ª", algodao: "Algodão", sorgo: "Sorgo", trigo: "Trigo" };

// ─── Página ───────────────────────────────────────────────────
export default function DrePage() {
  const { fazendaId } = useAuth();

  // Suporte multi-fazenda
  const [todasFazendas, setTodasFazendas] = useState<Fazenda[]>([]);
  const [filtroFazenda, setFiltroFazenda] = useState<string>(""); // "" = ativa, "todas", ou id específico

  const [anosArr,   setAnosArr]   = useState<AnoSafra[]>([]);
  const [anoLabel,  setAnoLabel]  = useState<string>(""); // filtro por label ("2025/2026")
  const [ciclosArr, setCiclosArr] = useState<Ciclo[]>([]);
  const [ciclosSel, setCiclosSel] = useState<string[]>([]);
  const [loading,   setLoading]   = useState(false);
  const [dres,      setDres]      = useState<DreData[]>([]);
  const [viewMode,  setViewMode]  = useState<"consolidado" | "individual">("consolidado");
  const [showPct,   setShowPct]   = useState(true);
  const [showHa,    setShowHa]    = useState(false);

  // IDs de fazendas efetivos para a query
  const fids = (() => {
    if (filtroFazenda === "todas") return todasFazendas.map(f => f.id);
    const fid = filtroFazenda || fazendaId || "";
    return fid ? [fid] : [];
  })();

  // ── Carregar fazendas disponíveis ──
  useEffect(() => {
    listarFazendas().then(setTodasFazendas).catch(() => {});
  }, []);

  // ── Carregar anos safra (por labels únicos) ──
  useEffect(() => {
    if (fids.length === 0) return;
    Promise.all(
      fids.map(fid =>
        supabase.from("anos_safra").select("id, ano, fazenda_id").eq("fazenda_id", fid)
          .order("ano", { ascending: false })
          .then(r => (r.data ?? []) as AnoSafra[])
      )
    ).then(results => {
      const seen = new Set<string>();
      const unique: AnoSafra[] = [];
      for (const rows of results) {
        for (const a of rows) {
          if (!seen.has(a.ano)) { seen.add(a.ano); unique.push(a); }
        }
      }
      setAnosArr(unique);
      if (unique.length > 0 && !anoLabel) setAnoLabel(unique[0].ano);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fids.join(",")]);

  // ── Carregar ciclos (por label do ano safra) ──
  useEffect(() => {
    if (fids.length === 0 || !anoLabel) return;
    Promise.all(
      fids.map(fid =>
        supabase.from("anos_safra").select("id").eq("fazenda_id", fid).eq("ano", anoLabel)
          .then(r => (r.data ?? []).map(a => a.id as string))
          .then(anoIds =>
            anoIds.length > 0
              ? supabase.from("ciclos").select("id, cultura, ano_safra_id, fazenda_id")
                  .eq("fazenda_id", fid).in("ano_safra_id", anoIds).order("cultura")
                  .then(r => (r.data ?? []) as Ciclo[])
              : Promise.resolve([] as Ciclo[])
          )
      )
    ).then(results => {
      const all = results.flat();
      setCiclosArr(all);
      setCiclosSel(all.map(c => c.id));
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fids.join(","), anoLabel]);

  // ── Calcular DRE ──
  async function calcularDre() {
    if (ciclosSel.length === 0) return;
    setLoading(true);

    const resultados: DreData[] = [];

    for (const cicloId of ciclosSel) {
      const ciclo = ciclosArr.find(c => c.id === cicloId);
      if (!ciclo) continue;
      const cfid = ciclo.fazenda_id || fazendaId!;
      const anoLabel2 = anoLabel || "";

      // ── Buscar dados em paralelo usando a fazenda do ciclo ──
      const [
        { data: plantiosData },
        { data: pulvsData },
        { data: colheitasData },
        { data: adubData },
        { data: corrData },
        { data: orcData },
        { data: contratosData },
        { data: cpData },
      ] = await Promise.all([
        supabase.from("plantios").select("custo_sementes, area_ha").eq("fazenda_id", cfid).eq("ciclo_id", cicloId),
        supabase.from("pulverizacoes").select("custo_total").eq("fazenda_id", cfid).eq("ciclo_id", cicloId),
        supabase.from("colheitas").select("peso_liquido_kg, sacas_liquidas, area_ha").eq("fazenda_id", cfid).eq("ciclo_id", cicloId),
        supabase.from("adubacoes_base").select("custo_total").eq("fazenda_id", cfid).eq("ciclo_id", cicloId),
        supabase.from("correcoes_solo").select("custo_total").eq("fazenda_id", cfid).eq("ciclo_id", cicloId),
        supabase.from("orcamentos").select("area_ha, produtividade_esperada, preco_esperado_sc").eq("fazenda_id", cfid).eq("ciclo_id", cicloId).maybeSingle(),
        supabase.from("contratos").select("valor_total, quantidade_sc, status").eq("fazenda_id", cfid).eq("ciclo_id", cicloId).eq("confirmado", true),
        supabase.from("contas_pagar").select("valor, categoria, operacao_gerencial_id").eq("fazenda_id", cfid).eq("ciclo_id", cicloId),
      ]);

      // ── Mapear operacao_gerencial_id → classificacao (batch) ──
      const cpRows = cpData ?? [];
      const ogIds = [...new Set(cpRows.map((c: { operacao_gerencial_id?: string }) => c.operacao_gerencial_id).filter(Boolean))] as string[];
      const ogClassMap: Record<string, string> = {};
      if (ogIds.length > 0) {
        const { data: ogs } = await supabase
          .from("operacoes_gerenciais")
          .select("id, classificacao")
          .in("id", ogIds);
        for (const og of ogs ?? []) ogClassMap[og.id] = og.classificacao;
      }

      // Helper: resolve DRE group for a CP row (uses classificacao when available, falls back to categoria)
      function cpGrupo(cp: { categoria?: string; operacao_gerencial_id?: string }): string {
        if (cp.operacao_gerencial_id && ogClassMap[cp.operacao_gerencial_id]) {
          return getDreGrupo(ogClassMap[cp.operacao_gerencial_id]);
        }
        const cat = cp.categoria ?? "";
        if (cat === "operacoes_mecanizadas") return "cpv_agricultura";
        if (cat === "combustivel")           return "cpv_combustivel";
        if (cat === "manutencao")            return "cpv_manutencao";
        if (cat === "arrendamento")          return "arrendamento";
        if (cat === "mao_obra" || cat === "trabalhista") return "cpv_rh_faz";
        if (cat === "administrativo")        return "desp_adm";
        if (cat === "seguro")                return "seguro_lavoura";
        if (cat === "assistencia_tecnica")   return "assistencia_tecnica";
        if (cat === "juros_custeio")         return "juros_custeio";
        if (cat === "juros")                 return "desp_financeira";
        return "outros";
      }

      // Acumular por grupo DRE
      const grp: Record<string, number> = {};
      for (const cp of cpRows) {
        const g = cpGrupo(cp as { categoria?: string; operacao_gerencial_id?: string });
        grp[g] = (grp[g] ?? 0) + ((cp.valor as number) ?? 0);
      }

      // ── Receitas ──
      const totalSacas = (colheitasData ?? []).reduce((s, r) => s + (r.sacas_liquidas ?? 0), 0);
      const totalAreaHa = (plantiosData ?? []).reduce((s, r) => s + (r.area_ha ?? 0), 0) ||
                          (orcData as any)?.area_ha || 0;
      const totalContratos = (contratosData ?? []).filter(c => c.status === "encerrado" || c.status === "confirmado");
      const receita_venda = totalContratos.reduce((s, c) => s + (c.valor_total ?? 0), 0);
      // fallback: se não há contratos encerrados, estima por sacas × preço médio do orçamento
      const preco_medio = (orcData as any)?.preco_esperado_sc ?? 120;
      const receita_estimada = totalSacas * preco_medio;
      const receita_real = receita_venda > 0 ? receita_venda : receita_estimada;

      const receita_bonificacao = 0; // TODO: quando houver
      const receita_outras = 0;
      const receita_total = receita_real + receita_bonificacao + receita_outras;

      // ── Deduções (Funrural 1,5% + Senar 0,2%) ──
      const funrural = receita_total * 0.015;
      const senar = receita_total * 0.002;
      const fundo_invest = 0;
      const deducoes_total = funrural + senar + fundo_invest;
      const receita_liquida = receita_total - deducoes_total;

      // ── CPV ──
      const sementes = (plantiosData ?? []).reduce((s, r) => s + (r.custo_sementes ?? 0), 0);
      const fertilizantes = (adubData ?? []).reduce((s, r) => s + (r.custo_total ?? 0), 0);
      const defensivos = (pulvsData ?? []).reduce((s, r) => s + (r.custo_total ?? 0), 0);
      const correcao_solo = (corrData ?? []).reduce((s, r) => s + (r.custo_total ?? 0), 0);

      // ── Agrupar CPs por grupo DRE (usando classificação hierárquica quando disponível) ──
      const operacoes_mecanizadas =
        (grp["cpv_agricultura"]  ?? 0) +
        (grp["cpv_mecanizacao"]  ?? 0) +
        (grp["cpv_fretes"]       ?? 0) +
        (grp["cpv_outros"]       ?? 0);
      const combustivel          = grp["cpv_combustivel"]     ?? 0;
      const manutencao           = grp["cpv_manutencao"]      ?? 0;
      // insumos comprados diretamente (CP com operação gerencial de insumo) → acrescentam aos insumos de lavoura
      const insumos_cp           = grp["cpv_insumos"]         ?? 0;
      const cpv_total = sementes + (fertilizantes + insumos_cp) + defensivos + correcao_solo + operacoes_mecanizadas + combustivel + manutencao;

      // ── Despesas Operacionais ──
      const arrendamento         = grp["arrendamento"]        ?? 0;
      const mao_obra             = (grp["cpv_rh_faz"]         ?? 0) + (grp["desp_rh_adm"] ?? 0);
      const administrativo       = (grp["desp_adm"]           ?? 0) + (grp["desp_impostos"] ?? 0) + (grp["desp_frota"] ?? 0);
      const seguro_lavoura       = grp["seguro_lavoura"]      ?? 0;
      const assistencia_tecnica  = grp["assistencia_tecnica"] ?? 0;
      const desp_operacionais_total = arrendamento + mao_obra + administrativo + seguro_lavoura + assistencia_tecnica;

      // ── Despesas Financeiras ──
      const juros_custeio        = grp["juros_custeio"]       ?? 0;
      const juros_outros         = (grp["desp_financeira"]    ?? 0) + (grp["patrimonial"] ?? 0);
      const desp_financeiras_total = juros_custeio + juros_outros;

      // ── Resultados ──
      const lucro_bruto = receita_liquida - cpv_total;
      const ebitda = lucro_bruto - desp_operacionais_total;
      const resultado_operacional = ebitda;
      const resultado_liquido = resultado_operacional - desp_financeiras_total;

      const custo_total = cpv_total + desp_operacionais_total + desp_financeiras_total;
      const area = totalAreaHa || 1;
      const sacas = totalSacas || ((orcData as any)?.produtividade_esperada ?? 0) * area;

      const ano = { id: ciclo.ano_safra_id, ano: anoLabel };
      resultados.push({
        ciclo,
        anoSafra: ano,
        area_ha: area,
        receita_venda: receita_real,
        receita_bonificacao,
        receita_outras,
        receita_total,
        funrural,
        senar,
        fundo_invest,
        deducoes_total,
        receita_liquida,
        sementes,
        fertilizantes,
        defensivos,
        correcao_solo,
        operacoes_mecanizadas,
        combustivel,
        manutencao,
        cpv_total,
        arrendamento,
        mao_obra,
        administrativo,
        seguro_lavoura,
        assistencia_tecnica,
        desp_operacionais_total,
        juros_custeio,
        juros_outros,
        desp_financeiras_total,
        lucro_bruto,
        ebitda,
        resultado_operacional,
        resultado_liquido,
        receita_ha: receita_total / area,
        custo_total_ha: custo_total / area,
        resultado_ha: resultado_liquido / area,
        produtividade_scha: sacas / area,
        preco_medio_sc: sacas > 0 ? receita_total / sacas : preco_medio,
      });
    }

    setDres(resultados);
    setLoading(false);
  }

  // ── Consolidar DREs ──
  const dreConsolidada: DreData | null = dres.length === 0 ? null : dres.length === 1 ? dres[0] : (() => {
    const sum = (k: keyof DreData) => dres.reduce((s, d) => s + ((d[k] as number) ?? 0), 0);
    const totalArea = sum("area_ha");
    const totalSacas = dres.reduce((s, d) => s + d.produtividade_scha * d.area_ha, 0);
    const totalReceita = sum("receita_total");
    return {
      ciclo: { id: "consolidado", cultura: "Consolidado", ano_safra_id: "", fazenda_id: "" },
      anoSafra: { id: "", ano: anoLabel },
      area_ha: totalArea,
      receita_venda: sum("receita_venda"),
      receita_bonificacao: sum("receita_bonificacao"),
      receita_outras: sum("receita_outras"),
      receita_total: totalReceita,
      funrural: sum("funrural"),
      senar: sum("senar"),
      fundo_invest: sum("fundo_invest"),
      deducoes_total: sum("deducoes_total"),
      receita_liquida: sum("receita_liquida"),
      sementes: sum("sementes"),
      fertilizantes: sum("fertilizantes"),
      defensivos: sum("defensivos"),
      correcao_solo: sum("correcao_solo"),
      operacoes_mecanizadas: sum("operacoes_mecanizadas"),
      combustivel: sum("combustivel"),
      manutencao: sum("manutencao"),
      cpv_total: sum("cpv_total"),
      arrendamento: sum("arrendamento"),
      mao_obra: sum("mao_obra"),
      administrativo: sum("administrativo"),
      seguro_lavoura: sum("seguro_lavoura"),
      assistencia_tecnica: sum("assistencia_tecnica"),
      desp_operacionais_total: sum("desp_operacionais_total"),
      juros_custeio: sum("juros_custeio"),
      juros_outros: sum("juros_outros"),
      desp_financeiras_total: sum("desp_financeiras_total"),
      lucro_bruto: sum("lucro_bruto"),
      ebitda: sum("ebitda"),
      resultado_operacional: sum("resultado_operacional"),
      resultado_liquido: sum("resultado_liquido"),
      receita_ha: totalArea > 0 ? totalReceita / totalArea : 0,
      custo_total_ha: totalArea > 0 ? (sum("cpv_total") + sum("desp_operacionais_total") + sum("desp_financeiras_total")) / totalArea : 0,
      resultado_ha: totalArea > 0 ? sum("resultado_liquido") / totalArea : 0,
      produtividade_scha: totalArea > 0 ? totalSacas / totalArea : 0,
      preco_medio_sc: totalSacas > 0 ? totalReceita / totalSacas : 0,
    } as DreData;
  })();

  // ── Montar linhas DRE ──
  function montarLinhas(d: DreData): DreLinha[] {
    const rl = d.receita_liquida || 1; // base de %
    return [
      { codigo: "1",   label: "RECEITA BRUTA",                     valor: d.receita_total,           percentual: pct(d.receita_total, rl),           bold: true, tipo: "header" },
      { codigo: "1.1", label: "Venda de Grãos",                    valor: d.receita_venda,           percentual: pct(d.receita_venda, rl),           indent: 1,  tipo: "receita" },
      { codigo: "1.2", label: "Bonificações / Prêmios",            valor: d.receita_bonificacao,     percentual: pct(d.receita_bonificacao, rl),     indent: 1,  tipo: "receita" },
      { codigo: "1.3", label: "Outras Receitas",                   valor: d.receita_outras,          percentual: pct(d.receita_outras, rl),          indent: 1,  tipo: "receita" },
      { codigo: "2",   label: "DEDUÇÕES DA RECEITA",               valor: -d.deducoes_total,         percentual: pct(d.deducoes_total, rl),          bold: true, tipo: "header" },
      { codigo: "2.1", label: "Funrural (1,5%)",                   valor: -d.funrural,               percentual: pct(d.funrural, rl),                indent: 1,  tipo: "custo" },
      { codigo: "2.2", label: "SENAR (0,2%)",                      valor: -d.senar,                  percentual: pct(d.senar, rl),                   indent: 1,  tipo: "custo" },
      { codigo: "2.3", label: "Fundo de Investimento",             valor: -d.fundo_invest,           percentual: pct(d.fundo_invest, rl),            indent: 1,  tipo: "custo" },
      { codigo: "RL",  label: "RECEITA LÍQUIDA",                   valor: d.receita_liquida,         percentual: 100,                                bold: true, tipo: "subtotal" },
      { codigo: "3",   label: "CPV — CUSTO DA PRODUÇÃO",           valor: -d.cpv_total,              percentual: pct(d.cpv_total, rl),               bold: true, tipo: "header" },
      { codigo: "3.1", label: "Sementes e Inoculantes",            valor: -d.sementes,               percentual: pct(d.sementes, rl),                indent: 1,  tipo: "custo" },
      { codigo: "3.2", label: "Fertilizantes / Adubação",          valor: -d.fertilizantes,          percentual: pct(d.fertilizantes, rl),           indent: 1,  tipo: "custo" },
      { codigo: "3.3", label: "Defensivos Agrícolas",              valor: -d.defensivos,             percentual: pct(d.defensivos, rl),              indent: 1,  tipo: "custo" },
      { codigo: "3.4", label: "Correção de Solo",                  valor: -d.correcao_solo,          percentual: pct(d.correcao_solo, rl),           indent: 1,  tipo: "custo" },
      { codigo: "3.5", label: "Operações Mecanizadas",             valor: -d.operacoes_mecanizadas,  percentual: pct(d.operacoes_mecanizadas, rl),   indent: 1,  tipo: "custo" },
      { codigo: "3.6", label: "Combustível",                       valor: -d.combustivel,            percentual: pct(d.combustivel, rl),             indent: 1,  tipo: "custo" },
      { codigo: "3.7", label: "Manutenção de Máquinas",            valor: -d.manutencao,             percentual: pct(d.manutencao, rl),              indent: 1,  tipo: "custo" },
      { codigo: "LB",  label: "LUCRO BRUTO",                       valor: d.lucro_bruto,             percentual: pct(d.lucro_bruto, rl),             bold: true, tipo: "subtotal" },
      { codigo: "4",   label: "DESPESAS OPERACIONAIS",             valor: -d.desp_operacionais_total,percentual: pct(d.desp_operacionais_total, rl), bold: true, tipo: "header" },
      { codigo: "4.1", label: "Arrendamento",                      valor: -d.arrendamento,           percentual: pct(d.arrendamento, rl),            indent: 1,  tipo: "custo" },
      { codigo: "4.2", label: "Mão de Obra / Funcionários",        valor: -d.mao_obra,               percentual: pct(d.mao_obra, rl),                indent: 1,  tipo: "custo" },
      { codigo: "4.3", label: "Administrativo / Escritório",       valor: -d.administrativo,         percentual: pct(d.administrativo, rl),          indent: 1,  tipo: "custo" },
      { codigo: "4.4", label: "Seguro de Lavoura",                 valor: -d.seguro_lavoura,         percentual: pct(d.seguro_lavoura, rl),          indent: 1,  tipo: "custo" },
      { codigo: "4.5", label: "Assistência Técnica",               valor: -d.assistencia_tecnica,    percentual: pct(d.assistencia_tecnica, rl),     indent: 1,  tipo: "custo" },
      { codigo: "EB",  label: "EBITDA",                            valor: d.ebitda,                  percentual: pct(d.ebitda, rl),                  bold: true, tipo: "subtotal" },
      { codigo: "5",   label: "DESPESAS FINANCEIRAS",              valor: -d.desp_financeiras_total, percentual: pct(d.desp_financeiras_total, rl),  bold: true, tipo: "header" },
      { codigo: "5.1", label: "Juros de Custeio Agrícola",         valor: -d.juros_custeio,          percentual: pct(d.juros_custeio, rl),           indent: 1,  tipo: "custo" },
      { codigo: "5.2", label: "Outros Juros e Encargos",           valor: -d.juros_outros,           percentual: pct(d.juros_outros, rl),            indent: 1,  tipo: "custo" },
      { codigo: "RL2", label: "RESULTADO LÍQUIDO",                 valor: d.resultado_liquido,       percentual: pct(d.resultado_liquido, rl),       bold: true, tipo: "resultado" },
    ];
  }

  // ── KPIs ──
  function KpiCard({ label, valor, sub, cor }: { label: string; valor: string; sub?: string; cor?: string }) {
    return (
      <div style={{ background: "#fff", border: "0.5px solid #DDE2EE", borderRadius: 10, padding: "14px 18px", minWidth: 160, flex: 1 }}>
        <div style={{ fontSize: 11, color: "#888", marginBottom: 4 }}>{label}</div>
        <div style={{ fontSize: 20, fontWeight: 700, color: cor ?? "#1a1a1a", lineHeight: 1.2 }}>{valor}</div>
        {sub && <div style={{ fontSize: 11, color: "#666", marginTop: 3 }}>{sub}</div>}
      </div>
    );
  }

  // ── Barra de custo ──
  function BarraCusto({ label, valor, total, cor }: { label: string; valor: number; total: number; cor: string }) {
    const pctVal = total > 0 ? (valor / total) * 100 : 0;
    return (
      <div style={{ marginBottom: 8 }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
          <span style={{ fontSize: 12, color: "#444" }}>{label}</span>
          <span style={{ fontSize: 12, fontWeight: 600, color: "#1a1a1a" }}>
            {fmtReal(valor)} <span style={{ color: "#888", fontWeight: 400 }}>({fmt(pctVal, 1)}%)</span>
          </span>
        </div>
        <div style={{ height: 6, borderRadius: 3, background: "#F0F2F8", overflow: "hidden" }}>
          <div style={{ height: "100%", width: `${Math.min(pctVal, 100)}%`, background: cor, borderRadius: 3, transition: "width 0.5s" }} />
        </div>
      </div>
    );
  }

  const dreAtual = viewMode === "consolidado" ? dreConsolidada : (dres.length === 1 ? dres[0] : null);
  const dreParaExibir = viewMode === "consolidado" ? (dreConsolidada ? [dreConsolidada] : []) : dres;

  return (
    <>
      <TopNav />
      <main style={{ padding: "24px 28px", background: "#F4F6FA", minHeight: "calc(100vh - 96px)", fontFamily: "system-ui, sans-serif" }}>

        {/* ── Cabeçalho ── */}
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 20 }}>
          <div>
            <h1 style={{ fontSize: 20, fontWeight: 700, color: "#1a1a1a", margin: 0 }}>DRE Agrícola</h1>
            <p style={{ fontSize: 13, color: "#666", margin: "4px 0 0" }}>
              Demonstrativo de Resultado do Exercício — análise econômica por ciclo de produção
            </p>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              onClick={() => window.print()}
              style={{ padding: "7px 14px", borderRadius: 7, border: "0.5px solid #DDE2EE", background: "#fff", cursor: "pointer", fontSize: 13, color: "#444" }}
            >
              Imprimir PDF
            </button>
          </div>
        </div>

        {/* ── Filtros ── */}
        <div style={{ background: "#fff", border: "0.5px solid #DDE2EE", borderRadius: 10, padding: "16px 20px", marginBottom: 20, display: "flex", gap: 16, alignItems: "flex-end", flexWrap: "wrap" }}>

          {/* Fazenda (só mostra se múltiplas fazendas) */}
          {todasFazendas.length > 1 && (
            <div>
              <div style={{ fontSize: 11, color: "#888", marginBottom: 4 }}>Fazenda</div>
              <select
                value={filtroFazenda || fazendaId || ""}
                onChange={e => { setFiltroFazenda(e.target.value); setAnoLabel(""); setCiclosSel([]); }}
                style={{ padding: "7px 10px", borderRadius: 7, border: "0.5px solid #1A4870", fontSize: 13, background: "#F0F6FB", minWidth: 160 }}
              >
                {todasFazendas.map(f => <option key={f.id} value={f.id}>{f.nome}</option>)}
                <option value="todas">Todas (Consolidado)</option>
              </select>
            </div>
          )}

          <div>
            <div style={{ fontSize: 11, color: "#888", marginBottom: 4 }}>Ano Safra</div>
            <select
              value={anoLabel}
              onChange={e => { setAnoLabel(e.target.value); setCiclosSel([]); }}
              style={{ padding: "7px 10px", borderRadius: 7, border: "0.5px solid #DDE2EE", fontSize: 13, minWidth: 140 }}
            >
              {anosArr.map(a => <option key={a.id} value={a.ano}>{a.ano}</option>)}
            </select>
          </div>

          <div>
            <div style={{ fontSize: 11, color: "#888", marginBottom: 4 }}>Ciclos / Culturas</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {ciclosArr.map(c => {
                const sel = ciclosSel.includes(c.id);
                const fazNome = filtroFazenda === "todas" ? todasFazendas.find(f => f.id === c.fazenda_id)?.nome : null;
                return (
                  <button
                    key={c.id}
                    onClick={() => setCiclosSel(sel ? ciclosSel.filter(x => x !== c.id) : [...ciclosSel, c.id])}
                    style={{
                      padding: "5px 12px", borderRadius: 20, fontSize: 12, cursor: "pointer",
                      background: sel ? "#1A4870" : "#F3F6F9",
                      color: sel ? "#fff" : "#333",
                      border: sel ? "none" : "0.5px solid #DDE2EE",
                      fontWeight: sel ? 600 : 400,
                    }}
                  >
                    {CULT_LABELS[c.cultura] ?? c.cultura}
                    {fazNome && <span style={{ fontSize: 10, opacity: 0.75, marginLeft: 4 }}>{fazNome}</span>}
                  </button>
                );
              })}
              {ciclosArr.length === 0 && <span style={{ fontSize: 12, color: "#aaa" }}>Nenhum ciclo neste ano</span>}
            </div>
          </div>

          <div style={{ display: "flex", gap: 6 }}>
            {(["consolidado", "individual"] as const).map(m => (
              <button
                key={m}
                onClick={() => setViewMode(m)}
                style={{
                  padding: "7px 14px", borderRadius: 7, fontSize: 12, cursor: "pointer",
                  background: viewMode === m ? "#1A4870" : "#F3F6F9",
                  color: viewMode === m ? "#fff" : "#333",
                  border: viewMode === m ? "none" : "0.5px solid #DDE2EE",
                }}
              >
                {m === "consolidado" ? "Consolidado" : "Por Cultura"}
              </button>
            ))}
          </div>

          <div style={{ display: "flex", gap: 6 }}>
            <label style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12, color: "#555", cursor: "pointer" }}>
              <input type="checkbox" checked={showPct} onChange={e => setShowPct(e.target.checked)} />
              % da Receita
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12, color: "#555", cursor: "pointer" }}>
              <input type="checkbox" checked={showHa} onChange={e => setShowHa(e.target.checked)} />
              R$/ha
            </label>
          </div>

          <button
            onClick={calcularDre}
            disabled={loading || ciclosSel.length === 0 || fids.length === 0}
            style={{
              padding: "8px 20px", borderRadius: 7, border: "none", cursor: loading ? "not-allowed" : "pointer",
              background: loading ? "#ccc" : "#1A4870", color: "#fff", fontSize: 13, fontWeight: 600,
            }}
          >
            {loading ? "Calculando..." : "Gerar DRE"}
          </button>
        </div>

        {dres.length === 0 && !loading && (
          <div style={{ background: "#fff", border: "0.5px solid #DDE2EE", borderRadius: 10, padding: 40, textAlign: "center", color: "#888", fontSize: 14 }}>
            Selecione os ciclos e clique em "Gerar DRE"
          </div>
        )}

        {/* ── Conteúdo DRE ── */}
        {dreParaExibir.map((d, idx) => {
          const linhas = montarLinhas(d);
          const custoTotal = d.cpv_total + d.desp_operacionais_total + d.desp_financeiras_total;
          const anoLabel = d.anoSafra.ano;
          const cultLabel = d.ciclo.cultura;

          return (
            <div key={d.ciclo.id + idx} style={{ marginBottom: 28 }}>

              {/* ── KPIs ── */}
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: "#1A4870", marginBottom: 10 }}>
                  {viewMode === "individual" ? `${cultLabel} — Safra ${anoLabel}` : `Safra ${anoLabel} — Consolidado`}
                  {" "}<span style={{ fontWeight: 400, color: "#888", fontSize: 12 }}>{fmt(d.area_ha)} ha</span>
                </div>
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                  <KpiCard label="Receita Total" valor={fmtReal(d.receita_total)} sub={`${fmtReal(d.receita_ha)}/ha`} cor="#1A4870" />
                  <KpiCard label="Custo Total" valor={fmtReal(custoTotal)} sub={`${fmtReal(d.custo_total_ha)}/ha`} cor="#E24B4A" />
                  <KpiCard label="Resultado Líquido" valor={fmtReal(d.resultado_liquido)} sub={`${fmtReal(d.resultado_ha)}/ha`} cor={d.resultado_liquido >= 0 ? "#16A34A" : "#E24B4A"} />
                  <KpiCard label="Margem Líquida" valor={d.receita_total > 0 ? `${fmt(pct(d.resultado_liquido, d.receita_total), 1)}%` : "—"} sub={d.resultado_liquido >= 0 ? "Resultado positivo" : "Prejuízo"} cor={d.resultado_liquido >= 0 ? "#16A34A" : "#E24B4A"} />
                  <KpiCard label="Produtividade" valor={`${fmt(d.produtividade_scha)} sc/ha`} sub={`Preço médio ${fmtReal(d.preco_medio_sc)}/sc`} />
                  <KpiCard label="EBITDA" valor={fmtReal(d.ebitda)} sub={`${fmt(pct(d.ebitda, d.receita_total), 1)}% da receita`} cor={d.ebitda >= 0 ? "#1A4870" : "#E24B4A"} />
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 340px", gap: 16 }}>

                {/* ── Tabela DRE ── */}
                <div style={{ background: "#fff", border: "0.5px solid #DDE2EE", borderRadius: 10, overflow: "hidden" }}>
                  <div style={{ padding: "12px 16px", borderBottom: "0.5px solid #EEF1F6", display: "flex", gap: 12 }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: "#1a1a1a", flex: 1 }}>Demonstrativo de Resultado</span>
                    <span style={{ fontSize: 11, color: "#888", minWidth: 120, textAlign: "right" }}>Valor (R$)</span>
                    {showPct && <span style={{ fontSize: 11, color: "#888", minWidth: 60, textAlign: "right" }}>% Rec. Líq.</span>}
                    {showHa  && <span style={{ fontSize: 11, color: "#888", minWidth: 80, textAlign: "right" }}>R$/ha</span>}
                  </div>

                  <div>
                    {linhas.map(l => {
                      const isSubtotal = l.tipo === "subtotal" || l.tipo === "resultado";
                      const isHeader   = l.tipo === "header";
                      const isMinus    = l.valor < 0;
                      const isZero     = l.valor === 0;

                      const bg = isSubtotal
                        ? l.tipo === "resultado"
                          ? l.valor >= 0 ? "#EBF9F1" : "#FEF2F2"
                          : "#F3F6F9"
                        : isHeader ? "#FAFBFD" : "#fff";

                      const textColor = isSubtotal && l.tipo === "resultado"
                        ? l.valor >= 0 ? "#16A34A" : "#E24B4A"
                        : isSubtotal ? "#1A4870"
                        : isHeader ? "#333"
                        : isZero ? "#ccc"
                        : "#1a1a1a";

                      return (
                        <div
                          key={l.codigo}
                          style={{
                            display: "flex", alignItems: "center",
                            padding: isSubtotal ? "10px 16px" : isHeader ? "8px 16px" : "7px 16px",
                            borderBottom: "0.5px solid #F3F5F9",
                            background: bg,
                            paddingLeft: 16 + (l.indent ?? 0) * 16,
                            borderTop: (isSubtotal || isHeader) ? "0.5px solid #E8EDF5" : "none",
                          }}
                        >
                          <span style={{ fontSize: 10, color: "#aaa", minWidth: 32 }}>{l.codigo}</span>
                          <span style={{ flex: 1, fontSize: isSubtotal || isHeader ? 13 : 12.5, fontWeight: isSubtotal || isHeader ? 700 : 400, color: textColor }}>
                            {l.label}
                          </span>
                          <span style={{
                            fontSize: isSubtotal ? 14 : 13, fontWeight: isSubtotal ? 700 : 500,
                            minWidth: 120, textAlign: "right", fontVariantNumeric: "tabular-nums",
                            color: isZero ? "#ddd" : isMinus ? "#E24B4A" : textColor,
                          }}>
                            {isZero ? "—" : `${isMinus ? "(" : ""}R$ ${fmt(Math.abs(l.valor))}${isMinus ? ")" : ""}`}
                          </span>
                          {showPct && (
                            <span style={{ fontSize: 12, color: isZero ? "#ddd" : "#888", minWidth: 60, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                              {isZero ? "—" : `${fmt(Math.abs(l.percentual), 1)}%`}
                            </span>
                          )}
                          {showHa && (
                            <span style={{ fontSize: 12, color: isZero ? "#ddd" : "#666", minWidth: 80, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                              {isZero ? "—" : `${fmt(Math.abs(l.valor / (d.area_ha || 1)))}`}
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* ── Análise visual ── */}
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>

                  {/* Composição de custos */}
                  <div style={{ background: "#fff", border: "0.5px solid #DDE2EE", borderRadius: 10, padding: "14px 16px" }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: "#1a1a1a", marginBottom: 12 }}>Composição de Custos</div>
                    <BarraCusto label="Fertilizantes"          valor={d.fertilizantes}          total={custoTotal} cor="#1A4870" />
                    <BarraCusto label="Defensivos"             valor={d.defensivos}             total={custoTotal} cor="#2176AE" />
                    <BarraCusto label="Sementes"               valor={d.sementes}               total={custoTotal} cor="#378ADD" />
                    <BarraCusto label="Arrendamento"           valor={d.arrendamento}           total={custoTotal} cor="#C9921B" />
                    <BarraCusto label="Operações Mecanizadas"  valor={d.operacoes_mecanizadas}  total={custoTotal} cor="#EF9F27" />
                    <BarraCusto label="Correção de Solo"       valor={d.correcao_solo}          total={custoTotal} cor="#6C8EBF" />
                    <BarraCusto label="Outros"                 valor={d.combustivel + d.manutencao + d.mao_obra + d.administrativo + d.seguro_lavoura + d.assistencia_tecnica + d.desp_financeiras_total} total={custoTotal} cor="#A0AEC0" />
                  </div>

                  {/* Ponto de equilíbrio */}
                  <div style={{ background: "#fff", border: "0.5px solid #DDE2EE", borderRadius: 10, padding: "14px 16px" }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: "#1a1a1a", marginBottom: 10 }}>Ponto de Equilíbrio</div>
                    {d.preco_medio_sc > 0 ? (() => {
                      const peScTotal = custoTotal / d.preco_medio_sc;
                      const peHa = d.area_ha > 0 ? peScTotal / d.area_ha : 0;
                      const prodReal = d.produtividade_scha;
                      const folga = prodReal - peHa;
                      return (
                        <>
                          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                            <span style={{ fontSize: 12, color: "#666" }}>PE em sacas</span>
                            <span style={{ fontSize: 13, fontWeight: 700 }}>{fmt(peScTotal, 0)} sc</span>
                          </div>
                          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                            <span style={{ fontSize: 12, color: "#666" }}>PE em sc/ha</span>
                            <span style={{ fontSize: 13, fontWeight: 700 }}>{fmt(peHa)} sc/ha</span>
                          </div>
                          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                            <span style={{ fontSize: 12, color: "#666" }}>Produtividade real</span>
                            <span style={{ fontSize: 13, fontWeight: 700 }}>{fmt(prodReal)} sc/ha</span>
                          </div>
                          <div style={{ height: 1, background: "#EEF1F6", margin: "8px 0" }} />
                          <div style={{ display: "flex", justifyContent: "space-between" }}>
                            <span style={{ fontSize: 12, color: "#666" }}>Folga acima do PE</span>
                            <span style={{ fontSize: 13, fontWeight: 700, color: folga >= 0 ? "#16A34A" : "#E24B4A" }}>
                              {folga >= 0 ? "+" : ""}{fmt(folga)} sc/ha
                            </span>
                          </div>
                          {/* barra PE */}
                          <div style={{ marginTop: 10 }}>
                            <div style={{ height: 8, borderRadius: 4, background: "#F0F2F8", overflow: "hidden", position: "relative" }}>
                              <div style={{
                                height: "100%",
                                width: `${Math.min((peHa / (prodReal || 1)) * 100, 100)}%`,
                                background: folga >= 0 ? "#EF9F27" : "#E24B4A",
                                borderRadius: 4,
                              }} />
                            </div>
                            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 3 }}>
                              <span style={{ fontSize: 10, color: "#aaa" }}>0</span>
                              <span style={{ fontSize: 10, color: "#aaa" }}>{fmt(prodReal)} sc/ha</span>
                            </div>
                          </div>
                        </>
                      );
                    })() : (
                      <div style={{ fontSize: 12, color: "#aaa", textAlign: "center", padding: "10px 0" }}>
                        Informe o preço médio no orçamento
                      </div>
                    )}
                  </div>

                  {/* Prazo de retorno simples */}
                  {d.resultado_liquido > 0 && custoTotal > 0 && (
                    <div style={{ background: "#EBF9F1", border: "0.5px solid #86EFAC", borderRadius: 10, padding: "14px 16px" }}>
                      <div style={{ fontSize: 12, color: "#166534", marginBottom: 2 }}>ROI da Safra</div>
                      <div style={{ fontSize: 20, fontWeight: 700, color: "#16A34A" }}>
                        {fmt(pct(d.resultado_liquido, custoTotal), 1)}%
                      </div>
                      <div style={{ fontSize: 11, color: "#166534", marginTop: 2 }}>
                        Retorno sobre o custo investido
                      </div>
                    </div>
                  )}

                  {d.resultado_liquido < 0 && (
                    <div style={{ background: "#FEF2F2", border: "0.5px solid #FECACA", borderRadius: 10, padding: "14px 16px" }}>
                      <div style={{ fontSize: 12, color: "#991B1B", marginBottom: 2 }}>Atenção — Prejuízo</div>
                      <div style={{ fontSize: 20, fontWeight: 700, color: "#E24B4A" }}>
                        {fmtReal(Math.abs(d.resultado_liquido))}
                      </div>
                      <div style={{ fontSize: 11, color: "#991B1B", marginTop: 2 }}>
                        Custo {fmt(pct(custoTotal, d.receita_total), 1)}% da receita
                      </div>
                    </div>
                  )}
                </div>
              </div>

            </div>
          );
        })}

        {/* ── Comparativo lado a lado (individual, múltiplos ciclos) ── */}
        {viewMode === "individual" && dres.length > 1 && (
          <div style={{ background: "#fff", border: "0.5px solid #DDE2EE", borderRadius: 10, padding: "16px 20px", marginTop: 8 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: "#1a1a1a", marginBottom: 14 }}>Comparativo entre Culturas</div>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr style={{ background: "#F3F6F9" }}>
                    <th style={{ padding: "8px 12px", textAlign: "left", fontWeight: 700, color: "#555", fontSize: 12, border: "0.5px solid #EEF1F6" }}>Indicador</th>
                    {dres.map(d => (
                      <th key={d.ciclo.id} style={{ padding: "8px 12px", textAlign: "right", fontWeight: 700, color: "#1A4870", fontSize: 12, border: "0.5px solid #EEF1F6" }}>
                        {d.ciclo.cultura}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {[
                    { label: "Área (ha)",           fn: (d: DreData) => fmt(d.area_ha) },
                    { label: "Receita Bruta",       fn: (d: DreData) => fmtReal(d.receita_total) },
                    { label: "Receita Líquida",     fn: (d: DreData) => fmtReal(d.receita_liquida) },
                    { label: "CPV",                 fn: (d: DreData) => fmtReal(d.cpv_total) },
                    { label: "Desp. Operacionais",  fn: (d: DreData) => fmtReal(d.desp_operacionais_total) },
                    { label: "Desp. Financeiras",   fn: (d: DreData) => fmtReal(d.desp_financeiras_total) },
                    { label: "Lucro Bruto",         fn: (d: DreData) => fmtReal(d.lucro_bruto), bold: true },
                    { label: "EBITDA",              fn: (d: DreData) => fmtReal(d.ebitda),      bold: true },
                    { label: "Resultado Líquido",   fn: (d: DreData) => fmtReal(d.resultado_liquido), bold: true },
                    { label: "Margem Líquida",      fn: (d: DreData) => `${fmt(pct(d.resultado_liquido, d.receita_total), 1)}%` },
                    { label: "Custo/ha",            fn: (d: DreData) => fmtReal(d.custo_total_ha) },
                    { label: "Receita/ha",          fn: (d: DreData) => fmtReal(d.receita_ha) },
                    { label: "Resultado/ha",        fn: (d: DreData) => fmtReal(d.resultado_ha), bold: true },
                    { label: "Produtividade",       fn: (d: DreData) => `${fmt(d.produtividade_scha)} sc/ha` },
                    { label: "Preço Médio",         fn: (d: DreData) => fmtReal(d.preco_medio_sc) + "/sc" },
                  ].map((row, ri) => (
                    <tr key={ri} style={{ background: ri % 2 === 0 ? "#fff" : "#FAFBFD" }}>
                      <td style={{ padding: "7px 12px", fontSize: 12, fontWeight: row.bold ? 700 : 400, color: "#333", border: "0.5px solid #EEF1F6" }}>{row.label}</td>
                      {dres.map(d => {
                        const val = row.fn(d);
                        const isNeg = val.startsWith("-") || val.startsWith("(");
                        return (
                          <td key={d.ciclo.id} style={{ padding: "7px 12px", fontSize: 12, fontWeight: row.bold ? 700 : 400, textAlign: "right", fontVariantNumeric: "tabular-nums", color: row.bold ? (isNeg ? "#E24B4A" : "#1A4870") : "#1a1a1a", border: "0.5px solid #EEF1F6" }}>
                            {val}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

      </main>

      {/* ── Print styles ── */}
      <style>{`
        @media print {
          body { background: #fff !important; }
          main { padding: 10px !important; background: #fff !important; }
          button, input[type="checkbox"], label { display: none !important; }
          .no-print { display: none !important; }
          @page { size: A4 landscape; margin: 15mm; }
        }
      `}</style>
    </>
  );
}
