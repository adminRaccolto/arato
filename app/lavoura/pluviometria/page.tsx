"use client";
import { useState, useEffect, useCallback } from "react";
import { createBrowserClient } from "@supabase/ssr";
import { useAuth } from "@/components/AuthProvider";

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
);

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
  const [fazenda, setFazenda] = useState<Fazenda | null>(null);
  const [talhoes, setTalhoes] = useState<Talhao[]>([]);
  const [talhaoSel, setTalhaoSel] = useState<string>("fazenda");
  const [dias, setDias] = useState<DiaClima[]>([]);
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [periodoExib, setPeriodoExib] = useState<30 | 60 | 90>(30);

  const carregar = useCallback(async () => {
    if (!fazendaId) return;
    const [{ data: faz }, { data: tal }] = await Promise.all([
      supabase.from("fazendas").select("id,nome,lat,lng").eq("id", fazendaId).single(),
      supabase.from("talhoes").select("id,nome,area_ha,lat,lng").eq("fazenda_id", fazendaId).order("nome"),
    ]);
    if (faz) setFazenda(faz as Fazenda);
    if (tal) setTalhoes(tal as Talhao[]);
  }, [fazendaId]);

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

  return (
    <div style={{ padding: "24px 32px", background: "#F4F6FA", minHeight: "100vh" }}>
      {/* Cabeçalho */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: "#1a1a1a", margin: 0 }}>Pluviometria</h1>
          <div style={{ fontSize: 13, color: "#888", marginTop: 2 }}>Dados de precipitação por propriedade · Open-Meteo</div>
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <select value={talhaoSel} onChange={e => setTalhaoSel(e.target.value)}
            style={{ padding: "8px 14px", border: "0.5px solid #DDE2EE", borderRadius: 8, fontSize: 13, background: "#fff", cursor: "pointer", minWidth: 200 }}>
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
        </div>
      </div>

      {!hasCoords && (
        <div style={{ background: "#FBF3E0", border: "0.5px solid #EF9F27", borderRadius: 10, padding: "12px 18px", marginBottom: 16, color: "#7A4300", fontSize: 13 }}>
          A fazenda não tem coordenadas GPS cadastradas. Usando localização padrão de Mato Grosso (Nova Mutum). Para dados precisos, cadastre as coordenadas em Cadastros → Fazendas.
        </div>
      )}

      {erro && (
        <div style={{ background: "#FEE2E2", border: "0.5px solid #E24B4A", borderRadius: 10, padding: "12px 18px", marginBottom: 16, color: "#7F1D1D", fontSize: 13 }}>
          Erro ao buscar dados climáticos: {erro}
        </div>
      )}

      {loading ? (
        <div style={{ textAlign: "center", padding: 80, color: "#888" }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>🌧</div>
          Carregando dados pluviométricos...
        </div>
      ) : dias.length > 0 && (
        <>
          {/* KPI Cards */}
          <div style={{ display: "flex", gap: 12, marginBottom: 20, flexWrap: "wrap" }}>
            {[
              { label: "Últ. 7 dias (histórico)",   val: `${fmtN(totUlt7)} mm`,  cor: "#1A4870", sub: `${ult7.filter(d => d.precip_mm > 1).length} dias com chuva` },
              { label: "Últ. 30 dias",              val: `${fmtN(totUlt30)} mm`, cor: "#1A4870", sub: `${ult30.filter(d => d.precip_mm > 1).length} dias com chuva` },
              { label: "Acumulado 90 dias",         val: `${fmtN(totUlt90)} mm`, cor: "#1A4870", sub: `Média: ${fmtN(totUlt90 / 90)} mm/dia` },
              { label: "Previsão próx. 7 dias",     val: `${fmtN(totPrev7)} mm`, cor: totPrev7 > 50 ? "#E24B4A" : "#16A34A", sub: `${futuros.filter(d => d.precip_mm > 1).length} dias com chuva prevista` },
            ].map((k, i) => (
              <div key={i} style={{ background: "#fff", borderRadius: 12, border: "0.5px solid #DDE2EE", padding: "14px 20px", flex: 1, minWidth: 140 }}>
                <div style={{ fontSize: 11, color: "#888", fontWeight: 600, textTransform: "uppercase", marginBottom: 6 }}>{k.label}</div>
                <div style={{ fontSize: 24, fontWeight: 700, color: k.cor }}>{k.val}</div>
                <div style={{ fontSize: 11, color: "#888", marginTop: 4 }}>{k.sub}</div>
              </div>
            ))}
          </div>

          {/* Alertas agronômicos */}
          {alertas.length > 0 && (
            <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
              {alertas.map((a, i) => (
                <div key={i} style={{ padding: "8px 14px", background: a.bg, border: `0.5px solid ${a.cor}40`, borderRadius: 10, flex: 1, minWidth: 200 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: a.cor, marginBottom: 2 }}>{a.tipo}</div>
                  <div style={{ fontSize: 12, color: "#555" }}>{a.msg}</div>
                </div>
              ))}
            </div>
          )}

          {/* Gráfico de barras */}
          <div style={{ background: "#fff", borderRadius: 12, border: "0.5px solid #DDE2EE", padding: "16px 20px", marginBottom: 16 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: "#1a1a1a" }}>
                Precipitação diária — {locNome}
              </div>
              <div style={{ display: "flex", gap: 6 }}>
                {([30, 60, 90] as const).map(p => (
                  <button key={p} onClick={() => setPeriodoExib(p)}
                    style={{ padding: "4px 12px", borderRadius: 6, border: "0.5px solid #DDE2EE", fontSize: 11, fontWeight: 600, cursor: "pointer",
                      background: periodoExib === p ? "#1A4870" : "#fff", color: periodoExib === p ? "#fff" : "#555" }}>
                    {p}d
                  </button>
                ))}
              </div>
            </div>

            {/* Legendas */}
            <div style={{ display: "flex", gap: 16, marginBottom: 10, fontSize: 11, color: "#888" }}>
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
                    <span key={idx} style={{ fontSize: 10, color: "#888" }}>
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
            <div style={{ background: "#fff", borderRadius: 12, border: "0.5px solid #DDE2EE", overflow: "hidden" }}>
              <div style={{ padding: "12px 16px", borderBottom: "0.5px solid #EEF1F6", fontSize: 13, fontWeight: 700, color: "#1a1a1a" }}>
                Previsão — Próximos 7 dias
              </div>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                <thead>
                  <tr style={{ background: "#F8FAFD" }}>
                    {["Data", "Chuva (mm)", "T máx / mín", "ETo"].map(h => (
                      <th key={h} style={{ padding: "8px 12px", textAlign: h === "Data" ? "left" : "right", fontWeight: 600, fontSize: 11, color: "#555", borderBottom: "0.5px solid #DDE2EE" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {futuros.map((d, i) => (
                    <tr key={d.data} style={{ background: i % 2 === 0 ? "#fff" : "#FAFBFC", borderBottom: "0.5px solid #F0F0F0" }}>
                      <td style={{ padding: "8px 12px" }}>
                        <div style={{ fontWeight: 600 }}>{fmtData(d.data)}</div>
                        <div style={{ fontSize: 10, color: "#888" }}>{MESES_PT[parseInt(d.data.slice(5, 7)) - 1]}</div>
                      </td>
                      <td style={{ padding: "8px 12px", textAlign: "right" }}>
                        {d.precip_mm > 0.1 ? (
                          <span style={{ fontWeight: 700, color: d.precip_mm > 20 ? "#E24B4A" : d.precip_mm > 5 ? "#C9921B" : "#378ADD" }}>
                            {fmtN(d.precip_mm)} mm
                          </span>
                        ) : <span style={{ color: "#16A34A" }}>Sem chuva</span>}
                      </td>
                      <td style={{ padding: "8px 12px", textAlign: "right", color: "#555" }}>
                        {fmtN(d.tmax_c)}° / {fmtN(d.tmin_c)}°
                      </td>
                      <td style={{ padding: "8px 12px", textAlign: "right", color: "#888" }}>
                        {fmtN(d.et0_mm)} mm
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Resumo mensal */}
            <div style={{ background: "#fff", borderRadius: 12, border: "0.5px solid #DDE2EE", overflow: "hidden" }}>
              <div style={{ padding: "12px 16px", borderBottom: "0.5px solid #EEF1F6", fontSize: 13, fontWeight: 700, color: "#1a1a1a" }}>
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
                        <span style={{ fontSize: 13, fontWeight: 700, color: total > 200 ? "#E24B4A" : total > 100 ? "#1A4870" : "#888" }}>
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
          <div style={{ background: "#fff", borderRadius: 12, border: "0.5px solid #DDE2EE", overflow: "hidden" }}>
            <div style={{ padding: "12px 16px", borderBottom: "0.5px solid #EEF1F6", fontSize: 13, fontWeight: 700, color: "#1a1a1a" }}>
              Histórico — Últimos 30 dias
            </div>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                <thead>
                  <tr style={{ background: "#F8FAFD" }}>
                    {["Data", "Precipitação", "Chuva", "T máx", "T mín", "ETo"].map(h => (
                      <th key={h} style={{ padding: "8px 14px", textAlign: h === "Data" ? "left" : "right", fontWeight: 600, fontSize: 11, color: "#555", borderBottom: "0.5px solid #DDE2EE", whiteSpace: "nowrap" }}>{h}</th>
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
                      <td style={{ padding: "7px 14px", textAlign: "right", color: "#555" }}>
                        {d.chuva_mm > 0.1 ? `${fmtN(d.chuva_mm)} mm` : <span style={{ color: "#CCC" }}>—</span>}
                      </td>
                      <td style={{ padding: "7px 14px", textAlign: "right", color: "#E24B4A" }}>{fmtN(d.tmax_c)}°C</td>
                      <td style={{ padding: "7px 14px", textAlign: "right", color: "#378ADD" }}>{fmtN(d.tmin_c)}°C</td>
                      <td style={{ padding: "7px 14px", textAlign: "right", color: "#888" }}>{fmtN(d.et0_mm)} mm</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div style={{ padding: "8px 16px", fontSize: 10, color: "#888", borderTop: "0.5px solid #EEF1F6" }}>
              Fonte: Open-Meteo · Dados de reanalise ERA5 para histórico e modelo GFS/ECMWF para previsão · ETo = Evapotranspiração de referência FAO-56
            </div>
          </div>
        </>
      )}
    </div>
  );
}
