"use client";
import { useState, useEffect, useCallback } from "react";
import { createBrowserClient } from "@supabase/ssr";
import { useAuth } from "@/components/AuthProvider";
import InputNumerico from "../../../components/InputNumerico";

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
);

type LeituraManual = {
  id: string;
  talhao_id: string | null;
  talhao_nome?: string;
  data: string;
  hora: string | null;
  chuva_mm: number;
  duracao_min: number | null;
  intensidade: string | null;
  fonte: string | null;
  observacao: string | null;
  created_at: string;
};

const inp: React.CSSProperties = {
  width: "100%", padding: "8px 10px", border: "0.5px solid var(--border-table)",
  borderRadius: 8, fontSize: 13, color: "var(--text-1)", background: "var(--bg-input)",
  boxSizing: "border-box",
};

interface Talhao { id: string; nome: string; area_ha: number; lat?: number; lng?: number }
interface Fazenda { id: string; nome: string; lat?: number; lng?: number }

interface DiaClima {
  data: string;
  precip_mm: number;
  chuva_mm: number;
  tmax_c: number;
  tmin_c: number;
  et0_mm: number;
  previsao: boolean;
}

const MESES_PT = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];
const fmtData = (s: string) => {
  const [y, m, d] = s.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
};
const fmtN = (v: number, d = 1) => v.toLocaleString("pt-BR", { minimumFractionDigits: d, maximumFractionDigits: d });

// Alertas agronômicos a partir dos dados diários
function calcularAlertas(dias: DiaClima[]) {
  const alertas: { tipo: string; msg: string; cor: string; bg: string }[] = [];
  const futuros = dias.filter(d => d.previsao);
  const passados = dias.filter(d => !d.previsao);

  // Janela de pulverização: dias sem chuva previstos
  const proxSemPre = futuros.filter(d => d.precip_mm < 2);
  if (proxSemPre.length >= 2) {
    alertas.push({ tipo: "Janela de Pulverização", msg: `${proxSemPre.length} dias sem chuva previstos — condição favorável`, cor: "#16A34A", bg: "#DCFCE7" });
  } else if (futuros.length > 0) {
    alertas.push({ tipo: "Atenção: Pulverização", msg: "Chuva prevista nos próximos dias — verificar janela", cor: "#C9921B", bg: "#FBF3E0" });
  }

  // Excesso de chuva
  const excesso = futuros.filter(d => d.precip_mm > 30);
  if (excesso.length > 0) {
    alertas.push({ tipo: "Excesso de Chuva", msg: `${excesso.length} dia(s) com >30mm previstos — risco de erosão e doenças`, cor: "#E24B4A", bg: "#FEE2E2" });
  }

  // Seca (7 dias passados sem chuva)
  const ult7 = passados.slice(-7);
  const seca = ult7.every(d => d.precip_mm < 2);
  if (seca && ult7.length === 7) {
    alertas.push({ tipo: "Período Seco", msg: "7 dias consecutivos sem chuva — monitorar necessidade de irrigação", cor: "#7C3AED", bg: "#EDE9FE" });
  }

  return alertas;
}

export default function Pluviometria() {
  const { fazendaId } = useAuth();
  const [aba, setAba] = useState<"api"|"manual">("api");
  const [fazenda, setFazenda] = useState<Fazenda | null>(null);
  const [talhoes, setTalhoes] = useState<Talhao[]>([]);
  const [talhaoSel, setTalhaoSel] = useState<string>("fazenda");
  const [dias, setDias] = useState<DiaClima[]>([]);
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [periodoExib, setPeriodoExib] = useState<30 | 60 | 90>(30);

  // Leituras manuais
  const [leituras, setLeituras] = useState<LeituraManual[]>([]);
  const [modalLeit, setModalLeit] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [lData,   setLData]   = useState(() => new Date().toISOString().split("T")[0]);
  const [lHora,   setLHora]   = useState(() => `${new Date().getHours().toString().padStart(2,"0")}:00`);
  const [lMm,     setLMm]     = useState("");
  const [lDur,    setLDur]    = useState("");
  const [lFonte,  setLFonte]  = useState("Pluviômetro manual");
  const [lObs,    setLObs]    = useState("");
  const [lTalhao, setLTalhao] = useState("");

  const carregarLeituras = useCallback(async () => {
    if (!fazendaId) return;
    const { data } = await supabase
      .from("leituras_pluviometricas")
      .select("*, talhoes(nome)")
      .eq("fazenda_id", fazendaId)
      .order("data", { ascending: false })
      .order("hora", { ascending: false })
      .limit(200);
    setLeituras(((data ?? []) as unknown[]).map((r: unknown) => {
      const row = r as Record<string, unknown>;
      return { ...row, talhao_nome: (row.talhoes as { nome: string } | null)?.nome } as LeituraManual;
    }));
  }, [fazendaId]);

  const carregar = useCallback(async () => {
    if (!fazendaId) return;
    const [{ data: faz }, { data: tal }] = await Promise.all([
      supabase.from("fazendas").select("id,nome,lat,lng").eq("id", fazendaId).single(),
      supabase.from("talhoes").select("id,nome,area_ha,lat,lng").eq("fazenda_id", fazendaId).order("nome"),
    ]);
    if (faz) setFazenda(faz as Fazenda);
    if (tal) setTalhoes(tal as Talhao[]);
    await carregarLeituras();
  }, [fazendaId, carregarLeituras]);

  async function salvarLeitura() {
    if (!fazendaId || !lMm) return;
    setSalvando(true);
    const mm = parseFloat(lMm);
    let intens: string | null = null;
    if (lDur) {
      const mmh = mm / (parseInt(lDur) / 60);
      intens = mmh < 5 ? "fraca" : mmh < 25 ? "moderada" : mmh < 50 ? "forte" : "muito_forte";
    }
    await supabase.from("leituras_pluviometricas").insert({
      fazenda_id:  fazendaId,
      talhao_id:   lTalhao || null,
      data:        lData,
      hora:        lHora || null,
      chuva_mm:    mm,
      duracao_min: lDur ? parseInt(lDur) : null,
      intensidade: intens,
      fonte:       lFonte || null,
      observacao:  lObs  || null,
    });
    setModalLeit(false); setSalvando(false);
    setLMm(""); setLDur(""); setLObs("");
    await carregarLeituras();
  }

  useEffect(() => { carregar(); }, [carregar]);

  // Busca dados climáticos via Open-Meteo
  const buscarClima = useCallback(async (lat: number, lng: number) => {
    setLoading(true);
    setErro(null);
    try {
      const params = new URLSearchParams({
        latitude: lat.toString(),
        longitude: lng.toString(),
        daily: "precipitation_sum,rain_sum,temperature_2m_max,temperature_2m_min,et0_fao_evapotranspiration",
        past_days: "90",
        forecast_days: "7",
        timezone: "America/Cuiaba",
      });
      const resp = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`);
      if (!resp.ok) throw new Error(`Open-Meteo error: ${resp.status}`);
      const json = await resp.json();
      const daily = json.daily as Record<string, (string | number)[]>;
      const time = daily.time as string[];
      const precipitation_sum = daily.precipitation_sum as number[];
      const rain_sum = daily.rain_sum as number[];
      const temperature_2m_max = daily.temperature_2m_max as number[];
      const temperature_2m_min = daily.temperature_2m_min as number[];
      const et0_fao_evapotranspiration = daily.et0_fao_evapotranspiration as number[];
      const hoje = new Date().toISOString().slice(0, 10);
      const resultado: DiaClima[] = time.map((d: string, i: number) => ({
        data: d,
        precip_mm: precipitation_sum[i] ?? 0,
        chuva_mm: rain_sum[i] ?? 0,
        tmax_c: temperature_2m_max[i] ?? 0,
        tmin_c: temperature_2m_min[i] ?? 0,
        et0_mm: et0_fao_evapotranspiration[i] ?? 0,
        previsao: d > hoje,
      }));
      setDias(resultado);
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  // Localização selecionada
  useEffect(() => {
    let lat: number | undefined;
    let lng: number | undefined;
    if (talhaoSel === "fazenda") {
      lat = fazenda?.lat ?? -13.0; // fallback Mato Grosso
      lng = fazenda?.lng ?? -56.0;
    } else {
      const t = talhoes.find(t => t.id === talhaoSel);
      lat = t?.lat ?? fazenda?.lat ?? -13.0;
      lng = t?.lng ?? fazenda?.lng ?? -56.0;
    }
    if (lat && lng) buscarClima(lat, lng);
  }, [talhaoSel, fazenda, talhoes, buscarClima]);

  const diasExib = dias.slice(-(periodoExib + 7)); // histórico + previsão
  const passados = diasExib.filter(d => !d.previsao);
  const futuros  = diasExib.filter(d => d.previsao);

  // Estatísticas
  const ult7 = passados.slice(-7);
  const ult30 = passados.slice(-30);
  const ult90 = passados;
  const totUlt7  = ult7.reduce((s, d) => s + d.precip_mm, 0);
  const totUlt30 = ult30.reduce((s, d) => s + d.precip_mm, 0);
  const totUlt90 = ult90.reduce((s, d) => s + d.precip_mm, 0);
  const totPrev7 = futuros.reduce((s, d) => s + d.precip_mm, 0);

  // Resumo mensal dos últimos 90 dias
  const resumoMensal: Record<string, number> = {};
  passados.forEach(d => {
    const ym = d.data.slice(0, 7);
    resumoMensal[ym] = (resumoMensal[ym] ?? 0) + d.precip_mm;
  });

  const alertas = dias.length > 0 ? calcularAlertas(dias) : [];

  // Altura máxima para o gráfico
  const maxPrecip = Math.max(1, ...diasExib.map(d => d.precip_mm));

  // Seleciona qual conjunto de dias mostrar
  const diasGrafico = dias.slice(-(periodoExib + 7));

  const locNome = talhaoSel === "fazenda"
    ? (fazenda?.nome ?? "Fazenda")
    : (talhoes.find(t => t.id === talhaoSel)?.nome ?? "Talhão");

  const hasCoords = talhaoSel === "fazenda"
    ? (fazenda?.lat != null)
    : (talhoes.find(t => t.id === talhaoSel)?.lat != null || fazenda?.lat != null);

  // Estatísticas das leituras manuais
  const leit30 = leituras.filter(l => {
    const d = new Date(l.data); const ago30 = new Date(); ago30.setDate(ago30.getDate() - 30);
    return d >= ago30;
  });
  const totLeit30 = leit30.reduce((s, l) => s + l.chuva_mm, 0);
  const leit7 = leituras.filter(l => {
    const d = new Date(l.data); const ago7 = new Date(); ago7.setDate(ago7.getDate() - 7);
    return d >= ago7;
  });
  const totLeit7 = leit7.reduce((s, l) => s + l.chuva_mm, 0);

  return (
    <div style={{ padding: "24px 32px", background: "var(--bg-page)", minHeight: "100vh" }}>
      {/* Cabeçalho */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: "var(--text-1)", margin: 0 }}>Pluviometria</h1>
          <div style={{ fontSize: 13, color: "var(--text-3)", marginTop: 2 }}>Dados de precipitação por propriedade</div>
        </div>
        {aba === "manual" && (
          <button onClick={() => setModalLeit(true)} style={{ padding: "9px 18px", background: "#1A4870", color: "#fff", border: "none", borderRadius: 8, fontWeight: 600, fontSize: 13, cursor: "pointer" }}>
            + Lançar Leitura
          </button>
        )}
        {aba === "api" && (
          <select value={talhaoSel} onChange={e => setTalhaoSel(e.target.value)}
            style={{ padding: "8px 14px", border: "0.5px solid var(--border)", borderRadius: 8, fontSize: 13, background: "var(--bg-card)", cursor: "pointer", minWidth: 200 }}>
            <option value="fazenda">{fazenda?.nome ?? "Fazenda completa"}</option>
            {talhoes.filter(t => t.lat != null).map(t => (
              <option key={t.id} value={t.id}>{t.nome} ({fmtN(t.area_ha, 1)} ha)</option>
            ))}
            {talhoes.filter(t => t.lat == null).length > 0 && (
              <optgroup label="Sem coordenadas GPS">
                {talhoes.filter(t => t.lat == null).map(t => (
                  <option key={t.id} value={t.id} disabled>{t.nome} — sem GPS</option>
                ))}
              </optgroup>
            )}
          </select>
        )}
      </div>

      {/* Abas */}
      <div style={{ display: "flex", gap: 0, marginBottom: 16, borderBottom: "0.5px solid var(--border)" }}>
        {[
          { v: "api" as const,    label: "☁ Dados Climáticos (API)" },
          { v: "manual" as const, label: `🌧 Leituras Manuais${leituras.length > 0 ? ` (${leituras.length})` : ""}` },
        ].map(a => (
          <button key={a.v} onClick={() => setAba(a.v)} style={{
            padding: "10px 20px", border: "none", background: "none", cursor: "pointer", fontSize: 13,
            fontWeight: aba === a.v ? 700 : 400, color: aba === a.v ? "#1A4870" : "#666",
            borderBottom: aba === a.v ? "2.5px solid #1A4870" : "2.5px solid transparent",
          }}>{a.label}</button>
        ))}
      </div>

      {aba === "api" && !hasCoords && (
        <div style={{ background: "#FBF3E0", border: "0.5px solid #EF9F27", borderRadius: 10, padding: "12px 18px", marginBottom: 16, color: "#7A4300", fontSize: 13 }}>
          A fazenda não tem coordenadas GPS cadastradas. Usando localização padrão de Mato Grosso (Nova Mutum). Para dados precisos, cadastre as coordenadas em Cadastros → Fazendas.
        </div>
      )}

      {aba === "api" && erro && (
        <div style={{ background: "#FEE2E2", border: "0.5px solid #E24B4A", borderRadius: 10, padding: "12px 18px", marginBottom: 16, color: "#7F1D1D", fontSize: 13 }}>
          Erro ao buscar dados climáticos: {erro}
        </div>
      )}

      {aba === "api" && loading ? (
        <div style={{ textAlign: "center", padding: 80, color: "var(--text-3)" }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>🌧</div>
          Carregando dados pluviométricos...
        </div>
      ) : aba === "api" && dias.length > 0 && (
        <>
          {/* KPI Cards */}
          <div style={{ display: "flex", gap: 12, marginBottom: 20, flexWrap: "wrap" }}>
            {[
              { label: "Últ. 7 dias (histórico)",   val: `${fmtN(totUlt7)} mm`,  cor: "#1A4870", sub: `${ult7.filter(d => d.precip_mm > 1).length} dias com chuva` },
              { label: "Últ. 30 dias",              val: `${fmtN(totUlt30)} mm`, cor: "#1A4870", sub: `${ult30.filter(d => d.precip_mm > 1).length} dias com chuva` },
              { label: "Acumulado 90 dias",         val: `${fmtN(totUlt90)} mm`, cor: "#1A4870", sub: `Média: ${fmtN(totUlt90 / 90)} mm/dia` },
              { label: "Previsão próx. 7 dias",     val: `${fmtN(totPrev7)} mm`, cor: totPrev7 > 50 ? "#E24B4A" : "#16A34A", sub: `${futuros.filter(d => d.precip_mm > 1).length} dias com chuva prevista` },
            ].map((k, i) => (
              <div key={i} style={{ background: "var(--bg-card)", borderRadius: 12, border: "0.5px solid var(--border)", padding: "14px 20px", flex: 1, minWidth: 140 }}>
                <div style={{ fontSize: 11, color: "var(--text-3)", fontWeight: 600, textTransform: "uppercase", marginBottom: 6 }}>{k.label}</div>
                <div style={{ fontSize: 24, fontWeight: 700, color: k.cor }}>{k.val}</div>
                <div style={{ fontSize: 11, color: "var(--text-3)", marginTop: 4 }}>{k.sub}</div>
              </div>
            ))}
          </div>

          {/* Alertas agronômicos */}
          {alertas.length > 0 && (
            <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
              {alertas.map((a, i) => (
                <div key={i} style={{ padding: "8px 14px", background: a.bg, border: `0.5px solid ${a.cor}40`, borderRadius: 10, flex: 1, minWidth: 200 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: a.cor, marginBottom: 2 }}>{a.tipo}</div>
                  <div style={{ fontSize: 12, color: "var(--text-2)" }}>{a.msg}</div>
                </div>
              ))}
            </div>
          )}

          {/* Gráfico de barras */}
          <div style={{ background: "var(--bg-card)", borderRadius: 12, border: "0.5px solid var(--border)", padding: "16px 20px", marginBottom: 16 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text-1)" }}>
                Precipitação diária — {locNome}
              </div>
              <div style={{ display: "flex", gap: 6 }}>
                {([30, 60, 90] as const).map(p => (
                  <button key={p} onClick={() => setPeriodoExib(p)}
                    style={{ padding: "4px 12px", borderRadius: 6, border: "0.5px solid var(--border)", fontSize: 11, fontWeight: 600, cursor: "pointer",
                      background: periodoExib === p ? "#1A4870" : "var(--bg-card)", color: periodoExib === p ? "#fff" : "var(--text-2)" }}>
                    {p}d
                  </button>
                ))}
              </div>
            </div>

            {/* Legendas */}
            <div style={{ display: "flex", gap: 16, marginBottom: 10, fontSize: 11, color: "var(--text-3)" }}>
              <span><span style={{ display: "inline-block", width: 10, height: 10, background: "#378ADD", borderRadius: 2, marginRight: 4 }} />Histórico</span>
              <span><span style={{ display: "inline-block", width: 10, height: 10, background: "#C9921B", borderRadius: 2, marginRight: 4 }} />Previsão</span>
              <span style={{ marginLeft: "auto" }}>Máx: {fmtN(maxPrecip)} mm</span>
            </div>

            {/* Barras */}
            <div style={{ overflowX: "auto" }}>
              <div style={{ display: "flex", alignItems: "flex-end", gap: 2, height: 160, minWidth: Math.max(600, diasGrafico.length * 12) }}>
                {diasGrafico.map(d => {
                  const h = maxPrecip > 0 ? (d.precip_mm / maxPrecip) * 140 : 0;
                  const isTodayOrFuture = d.previsao;
                  return (
                    <div key={d.data} style={{ display: "flex", flexDirection: "column", alignItems: "center", flex: 1, minWidth: 8 }}
                      title={`${fmtData(d.data)}: ${fmtN(d.precip_mm)} mm${isTodayOrFuture ? " (previsão)" : ""}`}>
                      <div style={{
                        width: "100%", height: Math.max(h, d.precip_mm > 0.1 ? 2 : 0),
                        background: isTodayOrFuture ? "#C9921B" : "#378ADD",
                        borderRadius: "2px 2px 0 0",
                        opacity: d.precip_mm < 0.1 ? 0.15 : 1,
                        transition: "height 0.2s",
                      }} />
                    </div>
                  );
                })}
              </div>
              {/* Eixo X — mostrar apenas alguns labels */}
              <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4, paddingLeft: 2, paddingRight: 2 }}>
                {[0, Math.floor(diasGrafico.length / 4), Math.floor(diasGrafico.length / 2), Math.floor(diasGrafico.length * 3 / 4), diasGrafico.length - 1].map(idx => (
                  diasGrafico[idx] ? (
                    <span key={idx} style={{ fontSize: 10, color: "var(--text-3)" }}>
                      {diasGrafico[idx].data.slice(5).split("-").reverse().join("/")}
                    </span>
                  ) : null
                ))}
              </div>
            </div>
          </div>

          {/* Previsão detalhada (7 dias) + Resumo mensal lado a lado */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
            {/* Previsão 7 dias */}
            <div style={{ background: "var(--bg-card)", borderRadius: 12, border: "0.5px solid var(--border)", overflow: "hidden" }}>
              <div style={{ padding: "12px 16px", borderBottom: "0.5px solid var(--bg-tag)", fontSize: 13, fontWeight: 700, color: "var(--text-1)" }}>
                Previsão — Próximos 7 dias
              </div>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                <thead>
                  <tr style={{ background: "var(--bg-card)" }}>
                    {["Data", "Chuva (mm)", "T máx / mín", "ETo"].map(h => (
                      <th key={h} style={{ padding: "8px 12px", textAlign: h === "Data" ? "left" : "right", fontWeight: 600, fontSize: 11, color: "var(--text-2)", borderBottom: "0.5px solid var(--border)" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {futuros.map((d, i) => (
                    <tr key={d.data} style={{ background: i % 2 === 0 ? "#fff" : "#FAFBFC", borderBottom: "0.5px solid #F0F0F0" }}>
                      <td style={{ padding: "8px 12px" }}>
                        <div style={{ fontWeight: 600 }}>{fmtData(d.data)}</div>
                        <div style={{ fontSize: 10, color: "var(--text-3)" }}>{MESES_PT[parseInt(d.data.slice(5, 7)) - 1]}</div>
                      </td>
                      <td style={{ padding: "8px 12px", textAlign: "right" }}>
                        {d.precip_mm > 0.1 ? (
                          <span style={{ fontWeight: 700, color: d.precip_mm > 20 ? "#E24B4A" : d.precip_mm > 5 ? "#C9921B" : "#378ADD" }}>
                            {fmtN(d.precip_mm)} mm
                          </span>
                        ) : <span style={{ color: "#16A34A" }}>Sem chuva</span>}
                      </td>
                      <td style={{ padding: "8px 12px", textAlign: "right", color: "var(--text-2)" }}>
                        {fmtN(d.tmax_c)}° / {fmtN(d.tmin_c)}°
                      </td>
                      <td style={{ padding: "8px 12px", textAlign: "right", color: "var(--text-3)" }}>
                        {fmtN(d.et0_mm)} mm
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Resumo mensal */}
            <div style={{ background: "var(--bg-card)", borderRadius: 12, border: "0.5px solid var(--border)", overflow: "hidden" }}>
              <div style={{ padding: "12px 16px", borderBottom: "0.5px solid var(--bg-tag)", fontSize: 13, fontWeight: 700, color: "var(--text-1)" }}>
                Acumulado Mensal (últimos 90 dias)
              </div>
              <div style={{ padding: "12px 16px", display: "flex", flexDirection: "column", gap: 10 }}>
                {Object.entries(resumoMensal).sort((a, b) => a[0].localeCompare(b[0])).map(([ym, total]) => {
                  const [y, m] = ym.split("-");
                  const pct = Math.min(100, (total / 300) * 100); // 300mm = barra cheia
                  return (
                    <div key={ym}>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                        <span style={{ fontSize: 13, fontWeight: 600 }}>{MESES_PT[parseInt(m) - 1]}/{y}</span>
                        <span style={{ fontSize: 13, fontWeight: 700, color: total > 200 ? "#E24B4A" : total > 100 ? "#1A4870" : "var(--text-3)" }}>
                          {fmtN(total)} mm
                        </span>
                      </div>
                      <div style={{ height: 6, background: "#EEE", borderRadius: 4, overflow: "hidden" }}>
                        <div style={{ width: `${pct}%`, height: "100%", background: total > 200 ? "#E24B4A" : total > 100 ? "#378ADD" : "#C9921B", borderRadius: 4 }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Tabela histórico últimos 30 dias */}
          <div style={{ background: "var(--bg-card)", borderRadius: 12, border: "0.5px solid var(--border)", overflow: "hidden" }}>
            <div style={{ padding: "12px 16px", borderBottom: "0.5px solid var(--bg-tag)", fontSize: 13, fontWeight: 700, color: "var(--text-1)" }}>
              Histórico — Últimos 30 dias
            </div>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                <thead>
                  <tr style={{ background: "var(--bg-card)" }}>
                    {["Data", "Precipitação", "Chuva", "T máx", "T mín", "ETo"].map(h => (
                      <th key={h} style={{ padding: "8px 14px", textAlign: h === "Data" ? "left" : "right", fontWeight: 600, fontSize: 11, color: "var(--text-2)", borderBottom: "0.5px solid var(--border)", whiteSpace: "nowrap" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {ult30.slice().reverse().map((d, i) => (
                    <tr key={d.data} style={{ background: i % 2 === 0 ? "#fff" : "#FAFBFC", borderBottom: "0.5px solid #F0F0F0" }}>
                      <td style={{ padding: "7px 14px", fontWeight: 600 }}>{fmtData(d.data)}</td>
                      <td style={{ padding: "7px 14px", textAlign: "right" }}>
                        {d.precip_mm > 0.1 ? (
                          <span style={{ fontWeight: 700, color: d.precip_mm > 30 ? "#E24B4A" : "#378ADD" }}>{fmtN(d.precip_mm)} mm</span>
                        ) : <span style={{ color: "#CCC" }}>—</span>}
                      </td>
                      <td style={{ padding: "7px 14px", textAlign: "right", color: "var(--text-2)" }}>
                        {d.chuva_mm > 0.1 ? `${fmtN(d.chuva_mm)} mm` : <span style={{ color: "#CCC" }}>—</span>}
                      </td>
                      <td style={{ padding: "7px 14px", textAlign: "right", color: "#E24B4A" }}>{fmtN(d.tmax_c)}°C</td>
                      <td style={{ padding: "7px 14px", textAlign: "right", color: "#378ADD" }}>{fmtN(d.tmin_c)}°C</td>
                      <td style={{ padding: "7px 14px", textAlign: "right", color: "var(--text-3)" }}>{fmtN(d.et0_mm)} mm</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div style={{ padding: "8px 16px", fontSize: 10, color: "var(--text-3)", borderTop: "0.5px solid var(--bg-tag)" }}>
              Fonte: Open-Meteo · Dados de reanalise ERA5 para histórico e modelo GFS/ECMWF para previsão · ETo = Evapotranspiração de referência FAO-56
            </div>
          </div>
        </>
      )}

      {/* ── Aba Leituras Manuais ── */}
      {aba === "manual" && (
        <>
          {/* KPIs */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginBottom: 16 }}>
            {[
              { label: "Total de Leituras", valor: leituras.length, sub: "todas as leituras", cor: "#1A4870" },
              { label: "Acumulado 7 dias", valor: `${fmtN(totLeit7)} mm`, sub: `${leit7.length} leituras`, cor: "#378ADD" },
              { label: "Acumulado 30 dias", valor: `${fmtN(totLeit30)} mm`, sub: `${leit30.length} leituras`, cor: "#16A34A" },
            ].map(k => (
              <div key={k.label} style={{ background: "var(--bg-card)", borderRadius: 12, padding: "14px 18px", border: "0.5px solid var(--border)" }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-3)", textTransform: "uppercase", marginBottom: 6 }}>{k.label}</div>
                <div style={{ fontSize: 22, fontWeight: 700, color: k.cor }}>{k.valor}</div>
                <div style={{ fontSize: 11, color: "var(--text-3)", marginTop: 2 }}>{k.sub}</div>
              </div>
            ))}
          </div>

          <div style={{ background: "var(--bg-card)", borderRadius: 12, border: "0.5px solid var(--border)", overflow: "hidden" }}>
            {leituras.length === 0 ? (
              <div style={{ padding: "60px 20px", textAlign: "center", color: "var(--text-3)", fontSize: 13 }}>
                <div style={{ fontSize: 36, marginBottom: 12 }}>🌧</div>
                Nenhuma leitura manual registrada.<br />
                <span style={{ fontSize: 12 }}>Clique em "+ Lançar Leitura" para registrar o pluviômetro.</span>
              </div>
            ) : (
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ background: "var(--bg-card)", borderBottom: "0.5px solid var(--border)" }}>
                    {["Data","Hora","Talhão","Chuva (mm)","Duração","Intensidade","Fonte","Obs."].map(h => (
                      <th key={h} style={{ padding: "9px 12px", textAlign: "left", fontSize: 11, fontWeight: 600, color: "var(--text-2)", textTransform: "uppercase", whiteSpace: "nowrap" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {leituras.map((l, idx) => {
                    const intenMeta: Record<string, { label: string; cor: string; bg: string }> = {
                      fraca:       { label: "Fraca",       cor: "#166534", bg: "#DCFCE7" },
                      moderada:    { label: "Moderada",    cor: "#92400E", bg: "#FEF3C7" },
                      forte:       { label: "Forte",       cor: "#9A3412", bg: "#FFEDD5" },
                      muito_forte: { label: "Muito forte", cor: "#DC2626", bg: "#FEE2E2" },
                    };
                    const im = l.intensidade ? intenMeta[l.intensidade] : null;
                    return (
                      <tr key={l.id} style={{ borderBottom: "0.5px solid var(--bg-tag)", background: idx % 2 === 0 ? "#fff" : "#FAFBFC" }}>
                        <td style={{ padding: "9px 12px", fontSize: 13, fontWeight: 600 }}>{fmtData(l.data)}</td>
                        <td style={{ padding: "9px 12px", fontSize: 13, color: "var(--text-2)" }}>{l.hora?.slice(0,5) ?? "—"}</td>
                        <td style={{ padding: "9px 12px", fontSize: 13, color: "var(--text-2)" }}>{l.talhao_nome ?? <span style={{ color: "#CCC" }}>Fazenda</span>}</td>
                        <td style={{ padding: "9px 12px", fontSize: 15, fontWeight: 700, color: l.chuva_mm > 30 ? "#E24B4A" : "#1A4870" }}>{fmtN(l.chuva_mm)} mm</td>
                        <td style={{ padding: "9px 12px", fontSize: 13, color: "var(--text-2)" }}>{l.duracao_min ? `${l.duracao_min} min` : "—"}</td>
                        <td style={{ padding: "9px 12px" }}>
                          {im ? <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 12, background: im.bg, color: im.cor, fontWeight: 700 }}>{im.label}</span> : "—"}
                        </td>
                        <td style={{ padding: "9px 12px", fontSize: 12, color: "var(--text-3)" }}>{l.fonte ?? "—"}</td>
                        <td style={{ padding: "9px 12px", fontSize: 12, color: "var(--text-2)", maxWidth: 180 }}>
                          <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{l.observacao ?? "—"}</div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}

      {/* Modal leitura manual */}
      {modalLeit && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex:2000, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ background: "var(--bg-card)", borderRadius: 14, width: "100%", maxWidth: 480, boxShadow: "0 12px 40px rgba(0,0,0,0.2)", overflow: "hidden" }}>
            <div style={{ padding: "16px 22px", borderBottom: "0.5px solid var(--bg-tag)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ fontSize: 15, fontWeight: 700 }}>Lançar Leitura Manual</div>
              <button onClick={() => setModalLeit(false)} style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer", color: "var(--text-3)" }}>×</button>
            </div>
            <div style={{ padding: "18px 22px", display: "flex", flexDirection: "column", gap: 12 }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 700, color: "var(--text-2)", display: "block", marginBottom: 4 }}>Data *</label>
                  <input type="date" value={lData} onChange={e => setLData(e.target.value)} style={inp} />
                </div>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 700, color: "var(--text-2)", display: "block", marginBottom: 4 }}>Hora da leitura</label>
                  <input type="time" value={lHora} onChange={e => setLHora(e.target.value)} style={inp} />
                </div>
              </div>
              <div>
                <label style={{ fontSize: 11, fontWeight: 700, color: "var(--text-2)", display: "block", marginBottom: 4 }}>Talhão (opcional)</label>
                <select value={lTalhao} onChange={e => setLTalhao(e.target.value)} style={inp}>
                  <option value="">Fazenda completa</option>
                  {talhoes.map(t => <option key={t.id} value={t.id}>{t.nome}</option>)}
                </select>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 700, color: "var(--text-2)", display: "block", marginBottom: 4 }}>Chuva (mm) *</label>
                  <InputNumerico min="0" placeholder="Ex: 25.5" value={lMm} onChange={v => setLMm(v)} style={inp} />
                </div>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 700, color: "var(--text-2)", display: "block", marginBottom: 4 }}>Duração (min)</label>
                  <InputNumerico decimais={0} min="0" placeholder="Ex: 45" value={lDur} onChange={v => setLDur(v)} style={inp} />
                </div>
              </div>
              {lMm && lDur && (
                <div style={{ background: "#EFF6FF", borderRadius: 8, padding: "8px 12px", fontSize: 12, color: "#1E3A5F" }}>
                  Intensidade estimada: {(parseFloat(lMm) / (parseInt(lDur) / 60)).toFixed(1)} mm/h
                </div>
              )}
              <div>
                <label style={{ fontSize: 11, fontWeight: 700, color: "var(--text-2)", display: "block", marginBottom: 4 }}>Fonte / Equipamento</label>
                <input value={lFonte} onChange={e => setLFonte(e.target.value)} placeholder="Pluviômetro manual, estação Davis, etc." style={inp} />
              </div>
              <div>
                <label style={{ fontSize: 11, fontWeight: 700, color: "var(--text-2)", display: "block", marginBottom: 4 }}>Observações</label>
                <textarea rows={2} value={lObs} onChange={e => setLObs(e.target.value)} placeholder="Granizo, vento forte, relâmpagos..." style={{ ...inp, resize: "vertical", fontFamily: "inherit" }} />
              </div>
              <div style={{ display: "flex", gap: 10, paddingTop: 4 }}>
                <button onClick={() => setModalLeit(false)} style={{ flex: 1, padding: "9px", borderRadius: 8, border: "0.5px solid var(--border-table)", background: "var(--bg-card)", fontSize: 13, cursor: "pointer", color: "var(--text-2)" }}>Cancelar</button>
                <button onClick={salvarLeitura} disabled={salvando || !lMm} style={{ flex: 2, padding: "9px", borderRadius: 8, border: "none", background: salvando || !lMm ? "var(--text-muted)" : "#1A4870", color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
                  {salvando ? "Salvando..." : "✓ Registrar Leitura"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
