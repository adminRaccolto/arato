"use client";
// Capacidade de Pagamento — painel de consultoria da Raccolto dentro do BI.
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../../../components/AuthProvider";
import { OperationalButton, OperationalGrid } from "../../../components/OperationalUI";
import InputMonetario from "../../../components/InputMonetario";
import SelectField from "../../../components/SelectField";
import { buscarPaginado } from "../../../lib/buscar-paginado";
import { listarContratosFinanceirosDaConta } from "../../../lib/db";
import { supabase } from "../../../lib/supabase";
import {
  calcularCapacidade, compromissosDoPeriodo, dentroDoPeriodo, periodoCivil,
  type CicloCap, type ContratoCap, type OutroCompromisso, type ParcelaCap, type Periodo, type Situacao, type TipoPeriodo,
} from "../../../lib/bi/capacidade-pagamento";

type Ano = { id: string; descricao: string; data_inicio: string; data_fim: string };
type Ciclo = { id: string; ano_safra_id: string | null; descricao: string | null; cultura: string; data_fim: string | null; area_plantada_ha: number | null; produtividade_esperada_sc_ha: number | null; preco_esperado_sc: number | null; is_auxiliar: boolean | null };
type Grao = { data_vencimento: string | null; cultura: string; sacas: number };
type Ajuste = { area?: number; prod?: number; preco?: number; custo?: number; comp?: number; fora?: boolean };
type Cenario = { cotacao?: number; outras?: number; ciclos?: Record<string, Ajuste> };
type Origem = "lancado" | "mercado" | "referencia" | "manual" | "falta";

const AZUL = "#1A4870";
const MOSTARDA = "#C9921B";
const COR_ORIGEM: Record<Origem, { cor: string; txt: string }> = {
  lancado: { cor: AZUL, txt: "Lançado no ciclo" }, mercado: { cor: "#378ADD", txt: "Preço de mercado" }, referencia: { cor: "#378ADD", txt: "Tabela de referência" },
  manual: { cor: MOSTARDA, txt: "Editado pelo consultor" }, falta: { cor: "#E24B4A", txt: "Sem informação" },
};
const SITUACAO: Record<Situacao, { txt: string; cor: string; bg: string }> = {
  folga: { txt: "Paga com folga", cor: "#166534", bg: "#DCFCE7" }, atencao: { txt: "Paga no limite", cor: "#7A5200", bg: "#FBF3E0" },
  deficit: { txt: "Não paga", cor: "#B91C1C", bg: "#FEF2F2" }, sem_dados: { txt: "Faltam dados", cor: "#555", bg: "#EEF0F4" },
};
const brl = (n: number | null | undefined) => (n ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
const num = (n: number | null | undefined, d = 1) => n == null ? "—" : n.toLocaleString("pt-BR", { maximumFractionDigits: d });
const semAcento = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const familia = (cultura: string) => { const c = semAcento(cultura); return c.includes("soja") ? "soja" : c.includes("milho") ? "milho" : c.includes("algod") ? "algodao" : c; };
const unidadeDe = (cultura: string) => familia(cultura) === "algodao" ? "@" : "sc";

const th: React.CSSProperties = { padding: "8px 10px", fontSize: 11, fontWeight: 600, color: "#555", textAlign: "right", background: "#F4F6FA", whiteSpace: "nowrap" };
const td: React.CSSProperties = { padding: "7px 10px", fontSize: 13, color: "#1a1a1a", textAlign: "right", borderTop: "0.5px solid #DDE2EE", fontVariantNumeric: "tabular-nums" };
const card: React.CSSProperties = { background: "#fff", border: "0.5px solid #DDE2EE", borderRadius: 12, padding: 14 };
const inp: React.CSSProperties = { width: "100%", padding: "6px 8px", border: "0.5px solid #DDE2EE", borderRadius: 8, fontSize: 13, boxSizing: "border-box", textAlign: "right", background: "#fff" };
const lbl: React.CSSProperties = { display: "block", fontSize: 11, color: "#555", marginBottom: 4 };

function CampoCiclo({ valor, origem, onChange }: { valor: number; origem: Origem; onChange: (v: number) => void }) {
  return (
    <div title={COR_ORIGEM[origem].txt} style={{ display: "flex", alignItems: "center", gap: 6, justifyContent: "flex-end" }}>
      <span aria-label={COR_ORIGEM[origem].txt} style={{ width: 7, height: 7, borderRadius: "50%", background: COR_ORIGEM[origem].cor, flexShrink: 0 }} />
      <InputMonetario style={{ ...inp, width: 96 }} value={valor} onChange={v => onChange(Number(v) || 0)} />
    </div>
  );
}

export function CapacidadePagamentoPainel() {
  const { contaId, fazendaId, fazendaIds } = useAuth();
  const [tipo, setTipo] = useState<TipoPeriodo>("safra");
  const [anoDesc, setAnoDesc] = useState("");
  const [anoCivil, setAnoCivil] = useState(new Date().getFullYear());
  const [anos, setAnos] = useState<Ano[]>([]);
  const [ciclos, setCiclos] = useState<Ciclo[]>([]);
  const [areaTalhoes, setAreaTalhoes] = useState<Record<string, number>>({});
  const [contratos, setContratos] = useState<ContratoCap[]>([]);
  const [parcelas, setParcelas] = useState<ParcelaCap[]>([]);
  const [outros, setOutros] = useState<OutroCompromisso[]>([]);
  const [graos, setGraos] = useState<Grao[]>([]);
  const [mercado, setMercado] = useState<{ usd: number; soja: number; milho: number; algodao: number }>({ usd: 0, soja: 0, milho: 0, algodao: 0 });
  const [refs, setRefs] = useState<Record<string, number>>({});
  const [cenario, setCenario] = useState<Cenario>({});
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");
  const [aviso, setAviso] = useState("");
  const [verRefs, setVerRefs] = useState(false);

  useEffect(() => {
    if (!contaId || !fazendaIds.length) return;
    (async () => {
      setCarregando(true); setErro("");
      try {
        const [an, ci, ct, cct, arr, pr, rf] = await Promise.all([
          supabase.from("anos_safra").select("id,descricao,data_inicio,data_fim").or(`conta_id.eq.${contaId},fazenda_id.in.(${fazendaIds.join(",")})`).order("data_inicio"),
          supabase.from("ciclos").select("id,ano_safra_id,descricao,cultura,data_fim,area_plantada_ha,produtividade_esperada_sc_ha,preco_esperado_sc,is_auxiliar").in("fazenda_id", fazendaIds),
          supabase.from("ciclo_talhoes").select("ciclo_id,area_plantada_ha").in("fazenda_id", fazendaIds),
          supabase.from("cct_pagamentos").select("data_vencimento,valor,status,moeda_parcela,quantidade_sacas").in("fazenda_id", fazendaIds),
          supabase.from("arrendamento_pagamentos").select("data_vencimento,valor_previsto,sacas_previstas,commodity,status").in("fazenda_id", fazendaIds),
          fetch("/api/precos").then(r => r.json()).catch(() => null),
          supabase.from("custos_referencia").select("cultura,custo_ha"),
        ]);
        const listaAnos = (an.data ?? []) as Ano[];
        setAnos(listaAnos);
        setAnoDesc(d => d || listaAnos.find(a => a.data_inicio <= new Date().toISOString().slice(0, 10) && a.data_fim >= new Date().toISOString().slice(0, 10))?.descricao || listaAnos[listaAnos.length - 1]?.descricao || "");
        setCiclos(((ci.data ?? []) as Ciclo[]).filter(c => !c.is_auxiliar));
        const areas: Record<string, number> = {};
        for (const t of (ct.data ?? []) as { ciclo_id: string; area_plantada_ha: number | null }[]) areas[t.ciclo_id] = (areas[t.ciclo_id] ?? 0) + (Number(t.area_plantada_ha) || 0);
        setAreaTalhoes(areas);
        const outs: OutroCompromisso[] = [];
        const grs: Grao[] = [];
        for (const c of (cct.data ?? []) as { data_vencimento: string; valor: number | null; status: string; moeda_parcela: string | null; quantidade_sacas: number | null }[]) {
          if (c.moeda_parcela && c.moeda_parcela !== "BRL") grs.push({ data_vencimento: c.data_vencimento, cultura: familia(c.moeda_parcela), sacas: c.status === "pago" ? 0 : Number(c.quantidade_sacas) || 0 });
          else outs.push({ grupo: "Compra de terra", data_vencimento: c.data_vencimento, valor: Number(c.valor) || 0, pago: c.status === "pago" });
        }
        for (const a of (arr.data ?? []) as { data_vencimento: string; valor_previsto: number | null; sacas_previstas: number | null; commodity: string | null; status: string }[]) {
          if (Number(a.sacas_previstas) > 0) grs.push({ data_vencimento: a.data_vencimento, cultura: familia(a.commodity ?? ""), sacas: a.status === "pago" ? 0 : Number(a.sacas_previstas) });
          else if (Number(a.valor_previsto) > 0) outs.push({ grupo: "Arrendamento em R$", data_vencimento: a.data_vencimento, valor: Number(a.valor_previsto), pago: a.status === "pago" });
        }
        setOutros(outs); setGraos(grs);
        setMercado({ usd: Number(pr?.usdBrl) || 0, soja: Number(pr?.soja?.brl) || 0, milho: Number(pr?.milho?.brl) || 0, algodao: Number(pr?.algodao?.brl) || 0 });
        setRefs(Object.fromEntries(((rf.data ?? []) as { cultura: string; custo_ha: number }[]).map(r => [r.cultura, Number(r.custo_ha) || 0])));
        if (rf.error) setAviso("Rode a Seção 408 no Supabase para usar a tabela de custos e salvar cenários.");
        const cs = await listarContratosFinanceirosDaConta(contaId, fazendaId, fazendaIds);
        setContratos(cs as unknown as ContratoCap[]);
        const ids = cs.map(c => c.id);
        const ps: ParcelaCap[] = [];
        for (let i = 0; i < ids.length; i += 100) {
          const parte = ids.slice(i, i + 100);
          ps.push(...await buscarPaginado<ParcelaCap & { id: string }>((de, ate) => supabase.from("parcelas_pagamento")
            .select("id,contrato_id,data_vencimento,amortizacao,juros,despesas_acessorios,valor_parcela,status").in("contrato_id", parte).order("id").range(de, ate)));
        }
        setParcelas(ps);
      } catch (e) { setErro((e as Error).message); } finally { setCarregando(false); }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contaId, (fazendaIds ?? []).join(",")]);

  const chavePeriodo = tipo === "safra" ? `safra:${anoDesc}` : `civil:${anoCivil}`;
  useEffect(() => {
    if (!contaId) return;
    setCenario({});
    supabase.from("capacidade_cenarios").select("dados").eq("conta_id", contaId).eq("periodo", chavePeriodo).maybeSingle()
      .then(({ data }) => { if (data?.dados) setCenario(data.dados as Cenario); });
  }, [contaId, chavePeriodo]);

  const idsAno = useMemo(() => new Set(anos.filter(a => a.descricao === anoDesc).map(a => a.id)), [anos, anoDesc]);
  const periodo: Periodo = useMemo(() => {
    if (tipo === "civil") return periodoCivil(anoCivil);
    const doAno = anos.filter(a => a.descricao === anoDesc);
    return { de: doAno.map(a => a.data_inicio).sort()[0] ?? "", ate: doAno.map(a => a.data_fim).sort().slice(-1)[0] ?? "" };
  }, [tipo, anoCivil, anos, anoDesc]);
  // Ano civil: entram os ciclos que terminam no ano, porque é a colheita deles que gera o caixa. O consultor pode tirar algum.
  const ciclosPeriodo = useMemo(() => ciclos.filter(c => tipo === "safra" ? !!c.ano_safra_id && idsAno.has(c.ano_safra_id) : dentroDoPeriodo(c.data_fim, periodo)), [ciclos, tipo, idsAno, periodo]);

  const cotacao = cenario.cotacao ?? mercado.usd;
  const outrasSaidas = cenario.outras ?? 0;
  const ajusta = (id: string, campo: keyof Ajuste, valor: number | boolean) =>
    setCenario(p => ({ ...p, ciclos: { ...p.ciclos, [id]: { ...p.ciclos?.[id], [campo]: valor } } }));

  const linhasCiclo = useMemo(() => ciclosPeriodo.map(c => {
    const aj = cenario.ciclos?.[c.id] ?? {};
    const fam = familia(c.cultura);
    const areaLanc = Number(c.area_plantada_ha) || areaTalhoes[c.id] || 0;
    const prodLanc = Number(c.produtividade_esperada_sc_ha) || 0;
    const precoLanc = Number(c.preco_esperado_sc) || 0;
    const precoMerc = mercado[fam as "soja" | "milho" | "algodao"] ?? 0;
    const custoRef = refs[fam] ?? 0;
    const doCultivo = ciclosPeriodo.filter(x => familia(x.cultura) === fam);
    const compTotal = graos.filter(g => g.cultura === fam && dentroDoPeriodo(g.data_vencimento, periodo)).reduce((s, g) => s + g.sacas, 0);
    const areaFam = doCultivo.reduce((s, x) => s + (Number(x.area_plantada_ha) || areaTalhoes[x.id] || 0), 0);
    const compLanc = areaFam > 0 ? compTotal * areaLanc / areaFam : doCultivo[0]?.id === c.id ? compTotal : 0;
    return {
      ciclo: c, fora: !!aj.fora,
      origem: {
        area: aj.area != null ? "manual" : areaLanc ? "lancado" : "falta",
        prod: aj.prod != null ? "manual" : prodLanc ? "lancado" : "falta",
        preco: aj.preco != null ? "manual" : precoLanc ? "lancado" : precoMerc ? "mercado" : "falta",
        custo: aj.custo != null ? "manual" : custoRef ? "referencia" : "falta",
        comp: aj.comp != null ? "manual" : "lancado",
      } as Record<string, Origem>,
      dados: {
        id: c.id, descricao: c.descricao || c.cultura, unidade: unidadeDe(c.cultura),
        area_ha: aj.area ?? areaLanc, produtividade: aj.prod ?? prodLanc, preco: aj.preco ?? (precoLanc || precoMerc),
        custo_ha: aj.custo ?? custoRef, comprometido: aj.comp ?? Math.round(compLanc * 100) / 100,
      } as CicloCap,
    };
  }), [ciclosPeriodo, cenario, areaTalhoes, mercado, refs, graos, periodo]);

  const divida = useMemo(() => compromissosDoPeriodo(parcelas, contratos, outros, periodo, cotacao), [parcelas, contratos, outros, periodo, cotacao]);
  const totalDivida = divida.reduce((s, l) => s + l.total, 0);
  const compromissos = totalDivida + outrasSaidas;
  const r = useMemo(() => calcularCapacidade(linhasCiclo.filter(l => !l.fora).map(l => l.dados), compromissos), [linhasCiclo, compromissos]);
  const sit = SITUACAO[r.situacao];
  const contratosUsd = contratos.some(c => c.moeda === "USD");
  const faltas = linhasCiclo.filter(l => !l.fora).flatMap(l => (["area", "prod", "preco", "custo"] as const).filter(k => l.origem[k] === "falta").map(k => `${l.dados.descricao}: ${{ area: "área", prod: "produtividade", preco: "preço", custo: "custo" }[k]}`));
  const culturasRef = [...new Set(ciclos.map(c => familia(c.cultura)))].sort();

  const salvarCenario = async () => {
    if (!contaId) return;
    setAviso("");
    const { error } = await supabase.from("capacidade_cenarios").upsert({ conta_id: contaId, periodo: chavePeriodo, dados: cenario, updated_at: new Date().toISOString() }, { onConflict: "conta_id,periodo" });
    setAviso(error ? `Não foi possível salvar: ${error.message}` : "Cenário salvo.");
  };
  const salvarRef = async (cultura: string) => {
    const { error } = await supabase.from("custos_referencia").upsert({ cultura, custo_ha: refs[cultura] ?? 0, updated_at: new Date().toISOString() });
    if (error) setAviso(`Não foi possível salvar a referência: ${error.message}`);
  };

  if (carregando) return <div style={{ padding: 32, textAlign: "center", color: "#666" }}>Carregando…</div>;
  if (erro) return <div style={{ padding: 16, color: "#B91C1C" }}>{erro}</div>;

  const kpi = (titulo: string, valor: string, sub: string, cor = "#1a1a1a") => (
    <div style={card}>
      <div style={{ fontSize: 11, color: "#555" }}>{titulo}</div>
      <div style={{ fontSize: 20, fontWeight: 600, color: cor, marginTop: 4, fontVariantNumeric: "tabular-nums" }}>{valor}</div>
      <div style={{ fontSize: 11, color: "#666", marginTop: 2 }}>{sub}</div>
    </div>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ ...card, display: "flex", gap: 14, flexWrap: "wrap", alignItems: "flex-end" }}>
        <div>
          <label style={lbl}>Visão</label>
          <div style={{ display: "flex", gap: 6 }}>
            {([["safra", "Ano safra"], ["civil", "Ano civil"]] as [TipoPeriodo, string][]).map(([k, t]) => (
              <OperationalButton key={k} data-arato-button="toggle" aria-pressed={tipo === k} onClick={() => setTipo(k)}
                style={{ padding: "6px 12px", borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: "pointer", border: `0.5px solid ${tipo === k ? AZUL : "#DDE2EE"}`, background: tipo === k ? "#D5E8F5" : "#fff", color: tipo === k ? "#0B2D50" : "#555" }}>{t}</OperationalButton>
            ))}
          </div>
        </div>
        {tipo === "safra" ? (
          <div style={{ width: 160 }}>
            <label style={lbl}>Ano safra</label>
            <SelectField value={anoDesc} onChange={e => setAnoDesc(e.target.value)} style={{ ...inp, textAlign: "left" }}>
              {[...new Set(anos.map(a => a.descricao))].map(d => <option key={d} value={d}>{d}</option>)}
            </SelectField>
          </div>
        ) : (
          <div style={{ width: 110 }}>
            <label style={lbl}>Ano</label>
            <SelectField value={String(anoCivil)} onChange={e => setAnoCivil(Number(e.target.value))} style={{ ...inp, textAlign: "left" }}>
              {Array.from({ length: 8 }, (_, i) => new Date().getFullYear() - 1 + i).map(a => <option key={a} value={a}>{a}</option>)}
            </SelectField>
          </div>
        )}
        {contratosUsd && (
          <div style={{ width: 120 }}>
            <label style={lbl}>Dólar projetado (R$)</label>
            <InputMonetario style={inp} value={cotacao} onChange={v => setCenario(p => ({ ...p, cotacao: Number(v) || 0 }))} />
          </div>
        )}
        <div style={{ width: 170 }}>
          <label style={lbl} title="Retiradas da família, imposto de renda, investimento com recurso próprio">Outras saídas no período (R$)</label>
          <InputMonetario style={inp} value={outrasSaidas} onChange={v => setCenario(p => ({ ...p, outras: Number(v) || 0 }))} />
        </div>
        <div style={{ flex: 1 }} />
        <OperationalButton data-arato-button="secondary" onClick={() => setVerRefs(v => !v)} style={{ padding: "7px 12px", borderRadius: 8, border: "0.5px solid #DDE2EE", background: "#fff", color: "#1a1a1a", cursor: "pointer", fontSize: 12 }}>Custos de referência</OperationalButton>
        <OperationalButton data-arato-button="primary" onClick={salvarCenario} style={{ padding: "7px 14px", borderRadius: 8, border: "none", background: AZUL, color: "#fff", cursor: "pointer", fontSize: 12, fontWeight: 600 }}>Salvar cenário</OperationalButton>
      </div>
      {aviso && <div style={{ fontSize: 12, color: aviso.startsWith("Cenário") ? "#166534" : "#7A5200" }}>{aviso}</div>}

      {verRefs && (
        <div style={card}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>Custos de referência da Raccolto (R$/ha)</div>
          <div style={{ fontSize: 11, color: "#666", marginBottom: 10 }}>Usados quando o custo não é editado no ciclo. Valem para todos os clientes. Informe o custo sem arrendamento.</div>
          <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
            {culturasRef.map(c => (
              <div key={c} style={{ width: 130 }}>
                <label style={{ ...lbl, textTransform: "capitalize" }}>{c}</label>
                <InputMonetario style={inp} value={refs[c] ?? 0} onChange={v => setRefs(p => ({ ...p, [c]: Number(v) || 0 }))} onBlur={() => salvarRef(c)} />
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10 }}>
        {kpi("Compromissos do período", brl(r.compromissos), `${brl(divida.reduce((s, l) => s + l.pago, 0))} já pagos`)}
        {kpi("Caixa operacional projetado", brl(r.caixa), `${brl(r.caixa_ha)}/ha em ${num(r.area)} ha`, AZUL)}
        {kpi("Caixa necessário por hectare", `${brl(r.necessario_ha)}/ha`, "para honrar os compromissos")}
        {kpi("Cobertura", r.cobertura == null ? "—" : `${num(r.cobertura, 2)}x`, "caixa ÷ compromissos", sit.cor)}
        <div style={{ ...card, background: sit.bg }}>
          <div style={{ fontSize: 11, color: sit.cor }}>{sit.txt}</div>
          <div style={{ fontSize: 20, fontWeight: 600, color: sit.cor, marginTop: 4, fontVariantNumeric: "tabular-nums" }}>{brl(r.folga)}</div>
          <div style={{ fontSize: 11, color: sit.cor, marginTop: 2 }}>{r.folga >= 0 ? "de folga" : "de déficit"} no período</div>
        </div>
      </div>

      {faltas.length > 0 && (
        <div style={{ ...card, background: "#FBF3E0", borderColor: "#C9921B60", fontSize: 12, color: "#7A5200" }}>
          <strong>Faltam dados, e o resultado fica incompleto:</strong> {faltas.join(" · ")}
        </div>
      )}

      <div style={{ ...card, padding: 0, overflowX: "auto" }}>
        <div style={{ padding: "12px 14px 8px", display: "flex", gap: 14, flexWrap: "wrap", alignItems: "center" }}>
          <span style={{ fontSize: 13, fontWeight: 600 }}>Premissas por ciclo</span>
          {(["lancado", "mercado", "manual", "falta"] as Origem[]).map(o => (
            <span key={o} style={{ fontSize: 11, color: "#666", display: "flex", alignItems: "center", gap: 4 }}><span style={{ width: 7, height: 7, borderRadius: "50%", background: COR_ORIGEM[o].cor }} />{COR_ORIGEM[o].txt}</span>
          ))}
        </div>
        <OperationalGrid data-arato-grid="true" style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead><tr>
            <th style={{ ...th, textAlign: "left" }}>Ciclo</th><th style={th}>Área (ha)</th><th style={th}>Produtividade/ha</th><th style={th}>Preço de venda (R$)</th><th style={th}>Custo (R$/ha)</th><th style={th}>Já comprometido em grãos</th><th style={th}>Considerar</th>
          </tr></thead>
          <tbody>
            {linhasCiclo.length === 0 && <tr><td colSpan={7} style={{ ...td, textAlign: "center", color: "#666", padding: 24 }}>Nenhum ciclo neste período.</td></tr>}
            {linhasCiclo.map(({ ciclo: c, dados: d, origem: o, fora }) => (
              <tr key={c.id} style={{ opacity: fora ? 0.5 : 1 }}>
                <td style={{ ...td, textAlign: "left", fontWeight: 600 }}>{d.descricao}</td>
                <td style={td}><CampoCiclo valor={d.area_ha} origem={o.area} onChange={v => ajusta(c.id, "area", v)} /></td>
                <td style={td}><CampoCiclo valor={d.produtividade} origem={o.prod} onChange={v => ajusta(c.id, "prod", v)} /><div style={{ fontSize: 10, color: "#666" }}>{d.unidade}/ha</div></td>
                <td style={td}><CampoCiclo valor={d.preco} origem={o.preco} onChange={v => ajusta(c.id, "preco", v)} /><div style={{ fontSize: 10, color: "#666" }}>por {d.unidade}</div></td>
                <td style={td}><CampoCiclo valor={d.custo_ha} origem={o.custo} onChange={v => ajusta(c.id, "custo", v)} /></td>
                <td style={td}><CampoCiclo valor={d.comprometido} origem={o.comp} onChange={v => ajusta(c.id, "comp", v)} /><div style={{ fontSize: 10, color: "#666" }}>{d.unidade}</div></td>
                <td style={{ ...td, textAlign: "center" }}><input type="checkbox" aria-label={`Considerar ${d.descricao}`} checked={!fora} onChange={e => ajusta(c.id, "fora", !e.target.checked)} /></td>
              </tr>
            ))}
          </tbody>
        </OperationalGrid>
      </div>

      <div style={{ ...card, padding: 0, overflowX: "auto" }}>
        <div style={{ padding: "12px 14px 8px", fontSize: 13, fontWeight: 600 }}>Quanto cada ciclo precisa fazer</div>
        <OperationalGrid data-arato-grid="true" style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead><tr>
            <th style={{ ...th, textAlign: "left" }}>Ciclo</th><th style={th}>Caixa projetado</th><th style={th}>Parte dos compromissos</th><th style={th}>Necessário (R$/ha)</th><th style={th}>Necessário (unid./ha)</th><th style={th}>Produtividade mínima</th><th style={th}>Preço mínimo</th><th style={th}>Folga ou déficit (R$/ha)</th>
          </tr></thead>
          <tbody>
            {r.linhas.map(l => (
              <tr key={l.id}>
                <td style={{ ...td, textAlign: "left", fontWeight: 600 }}>{l.descricao}</td>
                <td style={td}>{brl(l.caixa)}</td>
                <td style={td}>{brl(l.parte_divida)}</td>
                <td style={{ ...td, fontWeight: 600 }}>{brl(l.necessario_ha)}</td>
                <td style={{ ...td, fontWeight: 600 }}>{num(l.unidades_ha)} {l.unidade}/ha</td>
                <td style={td}>{num(l.produtividade_minima)} {l.unidade}/ha</td>
                <td style={td}>{l.preco_minimo == null ? "—" : `R$ ${num(l.preco_minimo, 2)}/${l.unidade}`}</td>
                <td style={{ ...td, fontWeight: 600, color: l.folga_ha >= 0 ? "#166534" : "#B91C1C" }}>{brl(l.folga_ha)}</td>
              </tr>
            ))}
          </tbody>
        </OperationalGrid>
      </div>

      <div style={{ ...card, padding: 0, overflowX: "auto" }}>
        <div style={{ padding: "12px 14px 8px", fontSize: 13, fontWeight: 600 }}>Compromissos do período <span style={{ fontWeight: 400, color: "#666", fontSize: 12 }}>({periodo.de.split("-").reverse().join("/")} a {periodo.ate.split("-").reverse().join("/")})</span></div>
        <OperationalGrid data-arato-grid="true" style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead><tr><th style={{ ...th, textAlign: "left" }}>Tipo</th><th style={th}>Principal</th><th style={th}>Juros</th><th style={th}>Encargos</th><th style={th}>Total</th><th style={th}>Já pago</th><th style={th}>Em aberto</th></tr></thead>
          <tbody>
            {divida.length === 0 && <tr><td colSpan={7} style={{ ...td, textAlign: "center", color: "#666", padding: 24 }}>Nenhum vencimento neste período.</td></tr>}
            {divida.map(l => (
              <tr key={l.grupo}>
                <td style={{ ...td, textAlign: "left" }}>{l.grupo}</td><td style={td}>{brl(l.principal)}</td><td style={td}>{brl(l.juros)}</td><td style={td}>{brl(l.encargos)}</td>
                <td style={{ ...td, fontWeight: 600 }}>{brl(l.total)}</td><td style={td}>{brl(l.pago)}</td><td style={td}>{brl(l.total - l.pago)}</td>
              </tr>
            ))}
            {outrasSaidas > 0 && <tr><td style={{ ...td, textAlign: "left" }}>Outras saídas (informado)</td><td style={td} colSpan={3} /><td style={{ ...td, fontWeight: 600 }}>{brl(outrasSaidas)}</td><td style={td}>—</td><td style={td}>{brl(outrasSaidas)}</td></tr>}
          </tbody>
        </OperationalGrid>
      </div>
    </div>
  );
}
