"use client";
import { useState, useEffect, useMemo, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import TopNav from "../../../components/TopNav";
import { useAuth } from "../../../components/AuthProvider";
import { listarFazendasDaConta, listarAnosSafra, listarTodosCiclos } from "../../../lib/db";
import { supabase } from "../../../lib/supabase";
import type { RomaneioEntrada, AnoSafra, Ciclo } from "../../../lib/supabase";

const fmt   = (n?: number | null, d = 2) => (n ?? 0).toLocaleString("pt-BR", { minimumFractionDigits: d, maximumFractionDigits: d });
const fmtDt = (s?: string | null) => s ? s.split("-").reverse().join("/") : "—";

interface Fazenda  { id: string; nome: string }
interface RomSaida {
  id: string; fazenda_id: string; contrato_id: string; numero: string; data: string;
  placa: string; peso_bruto_kg: number; tara_kg: number; peso_liquido_kg?: number | null;
  umidade_pct?: number | null; impureza_pct?: number | null; sacas?: number | null;
  nfe_numero?: string | null; nfe_status?: string | null; created_at?: string;
  contrato_numero?: string; comprador?: string; produto?: string;
}

type Aba = "entrada" | "saida";

const lbl: React.CSSProperties = { fontSize: 11, fontWeight: 600, color: "var(--text-2)", marginBottom: 4, display: "block" };
const inp: React.CSSProperties = { padding: "7px 10px", border: "0.5px solid var(--border-table)", borderRadius: 8, fontSize: 13, width: "100%", boxSizing: "border-box", background: "var(--bg-card)", color: "var(--text-1)", outline: "none" };
const TH = ({ children, right }: { children: React.ReactNode; right?: boolean }) => (
  <th style={{ padding: "8px 12px", fontWeight: 600, fontSize: 11, textTransform: "uppercase", letterSpacing: 0.4, color: "var(--text-2)", textAlign: right ? "right" : "left", whiteSpace: "nowrap", borderBottom: "0.5px solid var(--border-table)" }}>{children}</th>
);
const TD = ({ children, right, mono }: { children: React.ReactNode; right?: boolean; mono?: boolean }) => (
  <td style={{ padding: "9px 12px", fontSize: 13, color: "var(--text-1)", textAlign: right ? "right" : "left", fontFamily: mono ? "monospace" : undefined, borderBottom: "0.5px solid var(--border-table)" }}>{children}</td>
);

const statusBadge = (st: string | undefined | null) => {
  const map: Record<string, { bg: string; color: string }> = {
    confirmado:  { bg: "#DCFCE7", color: "#15803D" },
    rascunho:    { bg: "#FEF9C3", color: "#854D0E" },
    autorizada:  { bg: "#DCFCE7", color: "#15803D" },
    cancelada:   { bg: "#FEE2E2", color: "#B91C1C" },
    rejeitada:   { bg: "#FEE2E2", color: "#B91C1C" },
  };
  const s = (st ?? "rascunho").toLowerCase();
  const c = map[s] ?? { bg: "#F3F4F6", color: "#555" };
  return <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 20, background: c.bg, color: c.color, textTransform: "capitalize" }}>{st ?? "rascunho"}</span>;
};

export default function Page() {
  return <Suspense><RelatorioRomaneios /></Suspense>;
}

function RelatorioRomaneios() {
  const { fazendaId, fazendaIds, contaId } = useAuth();
  const params = useSearchParams();

  const [aba, setAba] = useState<Aba>(() => (params.get("aba") as Aba | null) ?? "entrada");
  const [fazendas, setFazendas]     = useState<Fazenda[]>([]);
  const [anosSafra, setAnosSafra]   = useState<AnoSafra[]>([]);
  const [ciclos, setCiclos]         = useState<Ciclo[]>([]);
  const [loading, setLoading]       = useState(false);

  // Filtros comuns
  const [filtFaz,   setFiltFaz]   = useState("");
  const [filtDe,    setFiltDe]    = useState(() => { const d = new Date(); d.setMonth(d.getMonth() - 1); return d.toISOString().slice(0, 10); });
  const [filtAte,   setFiltAte]   = useState(new Date().toISOString().slice(0, 10));
  const [filtBusca, setFiltBusca] = useState("");

  // Filtros entrada
  const [filtAnoCiclo, setFiltAnoCiclo] = useState("");
  const [filtCiclo,    setFiltCiclo]    = useState("");
  const [filtStatus,   setFiltStatus]   = useState("");

  // Dados
  const [entrada, setEntrada] = useState<RomaneioEntrada[]>([]);
  const [saida,   setSaida]   = useState<RomSaida[]>([]);

  // Agrupamento saída
  const [agrupar, setAgrupar] = useState(true);

  useEffect(() => {
    listarFazendasDaConta(contaId, fazendaId).then(setFazendas).catch(() => {});
    if (fazendaId) listarAnosSafra(fazendaId).then(setAnosSafra).catch(() => {});
  }, [fazendaId, contaId]);

  useEffect(() => {
    if (!filtAnoCiclo) { setCiclos([]); return; }
    if (fazendaId) listarTodosCiclos(fazendaId).then(cs => setCiclos(cs.filter(c => c.ano_safra_id === filtAnoCiclo))).catch(() => {});
  }, [filtAnoCiclo, fazendaId]);

  async function buscar() {
    setLoading(true);
    try {
      if (aba === "entrada") {
        const ids = filtFaz ? [filtFaz] : (fazendaIds ?? (fazendaId ? [fazendaId] : []));
        let q = supabase.from("romaneios_entrada").select("*").in("fazenda_id", ids).gte("data", filtDe).lte("data", filtAte).order("data", { ascending: false });
        if (filtStatus) q = q.eq("status", filtStatus);
        if (filtCiclo)  q = q.eq("ciclo_id", filtCiclo);
        const { data } = await q;
        setEntrada(data ?? []);
      } else {
        const ids = filtFaz ? [filtFaz] : (fazendaIds ?? (fazendaId ? [fazendaId] : []));
        const { data: roms } = await supabase.from("romaneios").select("*, contratos(numero,comprador,produto)").in("fazenda_id", ids).gte("data", filtDe).lte("data", filtAte).order("data", { ascending: false });
        const mapped: RomSaida[] = (roms ?? []).map((r: Record<string, unknown>) => {
          const c = r.contratos as Record<string, string> | null;
          return {
            id:            r.id as string,
            fazenda_id:    r.fazenda_id as string,
            contrato_id:   r.contrato_id as string,
            numero:        r.numero as string,
            data:          r.data as string,
            placa:         r.placa as string,
            peso_bruto_kg: r.peso_bruto_kg as number,
            tara_kg:       r.tara_kg as number,
            peso_liquido_kg: r.peso_liquido_kg as number | null,
            umidade_pct:    r.umidade_pct as number | null,
            impureza_pct:   r.impureza_pct as number | null,
            sacas:          r.sacas as number | null,
            nfe_numero:     r.nfe_numero as string | null,
            nfe_status:     r.nfe_status as string | null,
            created_at:     r.created_at as string | undefined,
            contrato_numero: c?.numero,
            comprador:       c?.comprador,
            produto:         c?.produto,
          };
        });
        setSaida(mapped);
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { buscar(); }, [aba, fazendaId]);

  // Filtro local por busca
  const entradaFilt = useMemo(() => entrada.filter(r => {
    if (!filtBusca) return true;
    const b = filtBusca.toLowerCase();
    return (r.placa ?? "").toLowerCase().includes(b) || (r.motorista ?? "").toLowerCase().includes(b) || (r.produto_nome ?? "").toLowerCase().includes(b);
  }), [entrada, filtBusca]);

  const saidaFilt = useMemo(() => saida.filter(r => {
    if (!filtBusca) return true;
    const b = filtBusca.toLowerCase();
    return (r.placa ?? "").toLowerCase().includes(b) || (r.comprador ?? "").toLowerCase().includes(b) || (r.contrato_numero ?? "").toLowerCase().includes(b) || (r.produto ?? "").toLowerCase().includes(b);
  }), [saida, filtBusca]);

  // Totais entrada
  const totEntrada = useMemo(() => ({
    cargas:  entradaFilt.length,
    pb:      entradaFilt.reduce((s, r) => s + r.peso_bruto_kg, 0),
    pl:      entradaFilt.reduce((s, r) => s + (r.peso_liquido_kg ?? (r.peso_bruto_kg - r.tara_kg)), 0),
    sacas:   entradaFilt.reduce((s, r) => s + (r.sacas ?? 0), 0),
  }), [entradaFilt]);

  // Totais saída
  const totSaida = useMemo(() => ({
    cargas: saidaFilt.length,
    pb:     saidaFilt.reduce((s, r) => s + r.peso_bruto_kg, 0),
    pl:     saidaFilt.reduce((s, r) => s + (r.peso_liquido_kg ?? (r.peso_bruto_kg - r.tara_kg)), 0),
    sacas:  saidaFilt.reduce((s, r) => s + (r.sacas ?? 0), 0),
  }), [saidaFilt]);

  // Agrupamento por contrato (saída)
  const saidaAgrupada = useMemo(() => {
    if (!agrupar) return null;
    const map = new Map<string, { contrato_id: string; numero: string; comprador: string; produto: string; items: RomSaida[] }>();
    saidaFilt.forEach(r => {
      const key = r.contrato_id;
      if (!map.has(key)) map.set(key, { contrato_id: key, numero: r.contrato_numero ?? "—", comprador: r.comprador ?? "—", produto: r.produto ?? "—", items: [] });
      map.get(key)!.items.push(r);
    });
    return Array.from(map.values()).sort((a, b) => a.numero.localeCompare(b.numero));
  }, [saidaFilt, agrupar]);

  const [expandidos, setExpandidos] = useState<Set<string>>(new Set());
  const toggleExpand = (id: string) => setExpandidos(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s; });

  const cardStyle: React.CSSProperties = { background: "var(--bg-card)", borderRadius: 12, padding: "16px 20px", border: "0.5px solid var(--border-table)" };
  const tabStyle = (active: boolean): React.CSSProperties => ({
    padding: "7px 18px", border: "none", borderRadius: 8, cursor: "pointer", fontSize: 13, fontWeight: active ? 700 : 500,
    background: active ? "#1A4870" : "transparent", color: active ? "#fff" : "var(--text-2)",
    transition: "all .15s",
  });

  return (
    <>
      <TopNav />
      <div style={{ padding: "24px 28px", fontFamily: "system-ui, sans-serif", fontSize: 13, background: "var(--bg-page)", minHeight: "100vh" }}>
        <div style={{ marginBottom: 20 }}>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: "var(--text-1)", margin: 0 }}>Relatório de Romaneios</h1>
          <p style={{ fontSize: 13, color: "var(--text-2)", margin: "4px 0 0" }}>Romaneios de entrada (lavoura → armazém) e saída (entrega por contrato)</p>
        </div>

        {/* Abas */}
        <div style={{ display: "flex", gap: 6, marginBottom: 20, background: "var(--bg-card)", border: "0.5px solid var(--border-table)", borderRadius: 10, padding: 4, width: "fit-content" }}>
          <button style={tabStyle(aba === "entrada")} onClick={() => setAba("entrada")}>Entrada (Lavoura → Armazém)</button>
          <button style={tabStyle(aba === "saida")}   onClick={() => setAba("saida")}>Saída (Entrega por Contrato)</button>
        </div>

        {/* Filtros */}
        <div style={{ ...cardStyle, marginBottom: 20 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(160px,1fr))", gap: 12, alignItems: "end" }}>
            <div>
              <label style={lbl}>Fazenda</label>
              <select style={inp} value={filtFaz} onChange={e => setFiltFaz(e.target.value)}>
                <option value="">Todas</option>
                {fazendas.map(f => <option key={f.id} value={f.id}>{f.nome}</option>)}
              </select>
            </div>
            <div>
              <label style={lbl}>Data Início</label>
              <input type="date" style={inp} value={filtDe} onChange={e => setFiltDe(e.target.value)} />
            </div>
            <div>
              <label style={lbl}>Data Fim</label>
              <input type="date" style={inp} value={filtAte} onChange={e => setFiltAte(e.target.value)} />
            </div>
            {aba === "entrada" && (<>
              <div>
                <label style={lbl}>Ano Safra</label>
                <select style={inp} value={filtAnoCiclo} onChange={e => { setFiltAnoCiclo(e.target.value); setFiltCiclo(""); }}>
                  <option value="">Todos</option>
                  {anosSafra.map(a => <option key={a.id} value={a.id}>{a.descricao}</option>)}
                </select>
              </div>
              <div>
                <label style={lbl}>Ciclo</label>
                <select style={inp} value={filtCiclo} onChange={e => setFiltCiclo(e.target.value)}>
                  <option value="">Todos</option>
                  {ciclos.map(c => <option key={c.id} value={c.id}>{c.descricao}</option>)}
                </select>
              </div>
              <div>
                <label style={lbl}>Status</label>
                <select style={inp} value={filtStatus} onChange={e => setFiltStatus(e.target.value)}>
                  <option value="">Todos</option>
                  <option value="confirmado">Confirmado</option>
                  <option value="rascunho">Rascunho</option>
                </select>
              </div>
            </>)}
            <div>
              <label style={lbl}>Busca</label>
              <input style={inp} placeholder="placa, motorista, produto…" value={filtBusca} onChange={e => setFiltBusca(e.target.value)} />
            </div>
            <div>
              <button onClick={buscar} disabled={loading} style={{ padding: "7px 18px", background: "#1A4870", color: "#fff", border: "none", borderRadius: 8, cursor: "pointer", fontSize: 13, fontWeight: 600, width: "100%" }}>
                {loading ? "Buscando…" : "Buscar"}
              </button>
            </div>
          </div>
        </div>

        {/* ── ABA ENTRADA ──────────────────────────────────────────────────────── */}
        {aba === "entrada" && (<>
          {/* KPIs */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 12, marginBottom: 20 }}>
            {[
              { label: "Total de Cargas", valor: totEntrada.cargas.toString(), cor: "#1A4870" },
              { label: "Peso Bruto Total", valor: `${fmt(totEntrada.pb / 1000, 1)} t`, cor: "#0B2D50" },
              { label: "Peso Líquido Total", valor: `${fmt(totEntrada.pl / 1000, 1)} t`, cor: "#16A34A" },
              { label: "Total em Sacas", valor: fmt(totEntrada.sacas, 0), cor: "#C9921B" },
            ].map(k => (
              <div key={k.label} style={{ ...cardStyle, textAlign: "center" }}>
                <div style={{ fontSize: 11, color: "var(--text-2)", fontWeight: 600, marginBottom: 4 }}>{k.label}</div>
                <div style={{ fontSize: 22, fontWeight: 800, color: k.cor }}>{k.valor}</div>
              </div>
            ))}
          </div>

          {/* Tabela */}
          <div style={{ ...cardStyle, padding: 0, overflow: "hidden" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 20px", borderBottom: "0.5px solid var(--border-table)" }}>
              <span style={{ fontWeight: 700 }}>Romaneios de Entrada</span>
              <span style={{ fontSize: 12, color: "var(--text-2)" }}>{entradaFilt.length} registros</span>
            </div>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    <TH>Data</TH>
                    <TH>Fazenda</TH>
                    <TH>Produto / Ciclo</TH>
                    <TH>Placa</TH>
                    <TH>Motorista</TH>
                    <TH right>PB (kg)</TH>
                    <TH right>Tara (kg)</TH>
                    <TH right>PL (kg)</TH>
                    <TH right>Umid %</TH>
                    <TH right>Imp %</TH>
                    <TH right>Sacas</TH>
                    <TH>Status</TH>
                  </tr>
                </thead>
                <tbody>
                  {entradaFilt.length === 0 && (
                    <tr><td colSpan={12} style={{ padding: 32, textAlign: "center", color: "var(--text-2)" }}>Nenhum romaneio no período</td></tr>
                  )}
                  {entradaFilt.map(r => {
                    const pl = r.peso_liquido_kg ?? (r.peso_bruto_kg - r.tara_kg);
                    const faz = fazendas.find(f => f.id === r.fazenda_id);
                    const cic = ciclos.find(c => c.id === r.ciclo_id);
                    return (
                      <tr key={r.id} style={{ background: "var(--bg-card)" }}>
                        <TD>{fmtDt(r.data)}</TD>
                        <TD>{faz?.nome ?? "—"}</TD>
                        <TD><div>{r.produto_nome ?? "—"}</div>{cic && <div style={{ fontSize: 11, color: "var(--text-2)" }}>{cic.descricao}</div>}</TD>
                        <TD mono>{r.placa ?? "—"}</TD>
                        <TD>{r.motorista ?? "—"}</TD>
                        <TD right mono>{fmt(r.peso_bruto_kg, 0)}</TD>
                        <TD right mono>{fmt(r.tara_kg, 0)}</TD>
                        <TD right mono>{fmt(pl, 0)}</TD>
                        <TD right>{r.umidade_pct != null ? `${fmt(r.umidade_pct, 1)}%` : "—"}</TD>
                        <TD right>{r.impureza_pct != null ? `${fmt(r.impureza_pct, 1)}%` : "—"}</TD>
                        <TD right mono>{r.sacas != null ? fmt(r.sacas, 2) : "—"}</TD>
                        <TD>{statusBadge(r.status)}</TD>
                      </tr>
                    );
                  })}
                </tbody>
                {entradaFilt.length > 0 && (
                  <tfoot>
                    <tr style={{ background: "#D5E8F5", fontWeight: 700 }}>
                      <td colSpan={5} style={{ padding: "9px 12px", fontSize: 13, borderTop: "0.5px solid var(--border-table)" }}>TOTAL ({totEntrada.cargas} cargas)</td>
                      <td style={{ padding: "9px 12px", textAlign: "right", fontSize: 13, fontFamily: "monospace", borderTop: "0.5px solid var(--border-table)" }}>{fmt(totEntrada.pb, 0)}</td>
                      <td style={{ padding: "9px 12px", borderTop: "0.5px solid var(--border-table)" }}></td>
                      <td style={{ padding: "9px 12px", textAlign: "right", fontSize: 13, fontFamily: "monospace", borderTop: "0.5px solid var(--border-table)", color: "#16A34A" }}>{fmt(totEntrada.pl, 0)}</td>
                      <td colSpan={2} style={{ padding: "9px 12px", borderTop: "0.5px solid var(--border-table)" }}></td>
                      <td style={{ padding: "9px 12px", textAlign: "right", fontSize: 13, fontFamily: "monospace", borderTop: "0.5px solid var(--border-table)", color: "#C9921B" }}>{fmt(totEntrada.sacas, 2)}</td>
                      <td style={{ borderTop: "0.5px solid var(--border-table)" }}></td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>
        </>)}

        {/* ── ABA SAÍDA ────────────────────────────────────────────────────────── */}
        {aba === "saida" && (<>
          {/* KPIs */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 12, marginBottom: 20 }}>
            {[
              { label: "Total de Cargas", valor: totSaida.cargas.toString(), cor: "#1A4870" },
              { label: "Peso Bruto Total", valor: `${fmt(totSaida.pb / 1000, 1)} t`, cor: "#0B2D50" },
              { label: "Peso Líquido Total", valor: `${fmt(totSaida.pl / 1000, 1)} t`, cor: "#16A34A" },
              { label: "Total em Sacas", valor: fmt(totSaida.sacas, 0), cor: "#C9921B" },
            ].map(k => (
              <div key={k.label} style={{ ...cardStyle, textAlign: "center" }}>
                <div style={{ fontSize: 11, color: "var(--text-2)", fontWeight: 600, marginBottom: 4 }}>{k.label}</div>
                <div style={{ fontSize: 22, fontWeight: 800, color: k.cor }}>{k.valor}</div>
              </div>
            ))}
          </div>

          {/* Controle agrupamento */}
          <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 14 }}>
            <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", fontSize: 13 }}>
              <input type="checkbox" checked={agrupar} onChange={e => setAgrupar(e.target.checked)} />
              Agrupar por contrato
            </label>
            <button onClick={() => window.print()} style={{ marginLeft: "auto", padding: "6px 14px", background: "#0B1E35", color: "#fff", border: "none", borderRadius: 8, cursor: "pointer", fontSize: 12, fontWeight: 600 }}>
              Imprimir
            </button>
          </div>

          {/* Tabela agrupada por contrato */}
          {agrupar && saidaAgrupada ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              {saidaAgrupada.length === 0 && (
                <div style={{ ...cardStyle, textAlign: "center", padding: 40, color: "var(--text-2)" }}>Nenhum romaneio no período</div>
              )}
              {saidaAgrupada.map(grupo => {
                const totGrupo = {
                  pb: grupo.items.reduce((s, r) => s + r.peso_bruto_kg, 0),
                  pl: grupo.items.reduce((s, r) => s + (r.peso_liquido_kg ?? (r.peso_bruto_kg - r.tara_kg)), 0),
                  sacas: grupo.items.reduce((s, r) => s + (r.sacas ?? 0), 0),
                };
                const exp = expandidos.has(grupo.contrato_id);
                return (
                  <div key={grupo.contrato_id} style={{ ...cardStyle, padding: 0, overflow: "hidden" }}>
                    <div
                      onClick={() => toggleExpand(grupo.contrato_id)}
                      style={{ display: "grid", gridTemplateColumns: "auto 1fr 1fr auto auto auto auto", gap: 16, alignItems: "center", padding: "12px 18px", cursor: "pointer", background: "var(--bg-card)", borderBottom: exp ? "0.5px solid var(--border-table)" : "none" }}
                    >
                      <span style={{ fontSize: 16, color: "var(--text-2)" }}>{exp ? "▼" : "▶"}</span>
                      <div>
                        <span style={{ fontWeight: 700, color: "#1A4870" }}>Contrato {grupo.numero}</span>
                        <span style={{ marginLeft: 10, fontSize: 12, color: "var(--text-2)" }}>{grupo.comprador}</span>
                      </div>
                      <div style={{ fontSize: 12, color: "var(--text-2)" }}>{grupo.produto}</div>
                      <div style={{ textAlign: "right" }}>
                        <div style={{ fontSize: 11, color: "var(--text-2)" }}>Cargas</div>
                        <div style={{ fontWeight: 700 }}>{grupo.items.length}</div>
                      </div>
                      <div style={{ textAlign: "right" }}>
                        <div style={{ fontSize: 11, color: "var(--text-2)" }}>PL (t)</div>
                        <div style={{ fontWeight: 700, fontFamily: "monospace" }}>{fmt(totGrupo.pl / 1000, 1)}</div>
                      </div>
                      <div style={{ textAlign: "right" }}>
                        <div style={{ fontSize: 11, color: "var(--text-2)" }}>Sacas</div>
                        <div style={{ fontWeight: 700, fontFamily: "monospace", color: "#C9921B" }}>{fmt(totGrupo.sacas, 0)}</div>
                      </div>
                    </div>
                    {exp && (
                      <div style={{ overflowX: "auto" }}>
                        <table style={{ width: "100%", borderCollapse: "collapse" }}>
                          <thead>
                            <tr>
                              <TH>Data</TH>
                              <TH>Nº Rom.</TH>
                              <TH>Placa</TH>
                              <TH right>PB (kg)</TH>
                              <TH right>Tara (kg)</TH>
                              <TH right>PL (kg)</TH>
                              <TH right>Umid %</TH>
                              <TH right>Imp %</TH>
                              <TH right>Sacas</TH>
                              <TH>NF-e</TH>
                            </tr>
                          </thead>
                          <tbody>
                            {grupo.items.map(r => {
                              const pl = r.peso_liquido_kg ?? (r.peso_bruto_kg - r.tara_kg);
                              return (
                                <tr key={r.id}>
                                  <TD>{fmtDt(r.data)}</TD>
                                  <TD mono>{r.numero}</TD>
                                  <TD mono>{r.placa}</TD>
                                  <TD right mono>{fmt(r.peso_bruto_kg, 0)}</TD>
                                  <TD right mono>{fmt(r.tara_kg, 0)}</TD>
                                  <TD right mono>{fmt(pl, 0)}</TD>
                                  <TD right>{r.umidade_pct != null ? `${fmt(r.umidade_pct, 1)}%` : "—"}</TD>
                                  <TD right>{r.impureza_pct != null ? `${fmt(r.impureza_pct, 1)}%` : "—"}</TD>
                                  <TD right mono>{r.sacas != null ? fmt(r.sacas, 2) : "—"}</TD>
                                  <TD>{r.nfe_numero ? <span style={{ fontSize: 11 }}>{r.nfe_numero} · {statusBadge(r.nfe_status)}</span> : statusBadge(r.nfe_status)}</TD>
                                </tr>
                              );
                            })}
                          </tbody>
                          <tfoot>
                            <tr style={{ background: "#D5E8F5", fontWeight: 700 }}>
                              <td colSpan={3} style={{ padding: "8px 12px", fontSize: 13, borderTop: "0.5px solid var(--border-table)" }}>Sub-total</td>
                              <td style={{ padding: "8px 12px", textAlign: "right", fontFamily: "monospace", borderTop: "0.5px solid var(--border-table)" }}>{fmt(totGrupo.pb, 0)}</td>
                              <td style={{ padding: "8px 12px", borderTop: "0.5px solid var(--border-table)" }}></td>
                              <td style={{ padding: "8px 12px", textAlign: "right", fontFamily: "monospace", color: "#16A34A", borderTop: "0.5px solid var(--border-table)" }}>{fmt(totGrupo.pl, 0)}</td>
                              <td colSpan={2} style={{ padding: "8px 12px", borderTop: "0.5px solid var(--border-table)" }}></td>
                              <td style={{ padding: "8px 12px", textAlign: "right", fontFamily: "monospace", color: "#C9921B", borderTop: "0.5px solid var(--border-table)" }}>{fmt(totGrupo.sacas, 2)}</td>
                              <td style={{ padding: "8px 12px", borderTop: "0.5px solid var(--border-table)" }}></td>
                            </tr>
                          </tfoot>
                        </table>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            /* Tabela plana (sem agrupamento) */
            <div style={{ ...cardStyle, padding: 0, overflow: "hidden" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 20px", borderBottom: "0.5px solid var(--border-table)" }}>
                <span style={{ fontWeight: 700 }}>Romaneios de Saída</span>
                <span style={{ fontSize: 12, color: "var(--text-2)" }}>{saidaFilt.length} registros</span>
              </div>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr>
                      <TH>Data</TH>
                      <TH>Nº Rom.</TH>
                      <TH>Contrato</TH>
                      <TH>Comprador</TH>
                      <TH>Produto</TH>
                      <TH>Placa</TH>
                      <TH right>PB (kg)</TH>
                      <TH right>PL (kg)</TH>
                      <TH right>Sacas</TH>
                      <TH>NF-e</TH>
                    </tr>
                  </thead>
                  <tbody>
                    {saidaFilt.length === 0 && (
                      <tr><td colSpan={10} style={{ padding: 32, textAlign: "center", color: "var(--text-2)" }}>Nenhum romaneio no período</td></tr>
                    )}
                    {saidaFilt.map(r => {
                      const pl = r.peso_liquido_kg ?? (r.peso_bruto_kg - r.tara_kg);
                      return (
                        <tr key={r.id}>
                          <TD>{fmtDt(r.data)}</TD>
                          <TD mono>{r.numero}</TD>
                          <TD>{r.contrato_numero ?? "—"}</TD>
                          <TD>{r.comprador ?? "—"}</TD>
                          <TD>{r.produto ?? "—"}</TD>
                          <TD mono>{r.placa}</TD>
                          <TD right mono>{fmt(r.peso_bruto_kg, 0)}</TD>
                          <TD right mono>{fmt(pl, 0)}</TD>
                          <TD right mono>{r.sacas != null ? fmt(r.sacas, 2) : "—"}</TD>
                          <TD>{r.nfe_numero ? <span style={{ fontSize: 11 }}>{r.nfe_numero} · {statusBadge(r.nfe_status)}</span> : statusBadge(r.nfe_status)}</TD>
                        </tr>
                      );
                    })}
                  </tbody>
                  {saidaFilt.length > 0 && (
                    <tfoot>
                      <tr style={{ background: "#D5E8F5", fontWeight: 700 }}>
                        <td colSpan={6} style={{ padding: "9px 12px", fontSize: 13, borderTop: "0.5px solid var(--border-table)" }}>TOTAL ({totSaida.cargas} cargas)</td>
                        <td style={{ padding: "9px 12px", textAlign: "right", fontFamily: "monospace", borderTop: "0.5px solid var(--border-table)" }}>{fmt(totSaida.pb, 0)}</td>
                        <td style={{ padding: "9px 12px", textAlign: "right", fontFamily: "monospace", color: "#16A34A", borderTop: "0.5px solid var(--border-table)" }}>{fmt(totSaida.pl, 0)}</td>
                        <td style={{ padding: "9px 12px", textAlign: "right", fontFamily: "monospace", color: "#C9921B", borderTop: "0.5px solid var(--border-table)" }}>{fmt(totSaida.sacas, 2)}</td>
                        <td style={{ borderTop: "0.5px solid var(--border-table)" }}></td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            </div>
          )}
        </>)}

        {/* Print CSS */}
        <style>{`
          @media print {
            body { background: white !important; }
            button, input[type=checkbox] { display: none !important; }
            thead { display: table-header-group; }
            tbody tr { page-break-inside: avoid; }
            table { page-break-inside: auto; }
            @page { size: A4 landscape; margin: 15mm; }
          }
        `}</style>
      </div>
    </>
  );
}
