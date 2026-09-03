"use client";
import { useState, useEffect, useMemo, useRef } from "react";
import TopNav from "../../../components/TopNav";
import { useAuth } from "../../../components/AuthProvider";
import {
  listarCartoesDaConta,
  listarFaturasDaConta,
  listarLancamentosDaFatura,
  fecharFatura,
  reabrirFatura,
  vincularLancamentoFatura,
  competenciaFatura,
} from "../../../lib/db";
import type { CartaoCredito, FaturaCartao, Lancamento } from "../../../lib/supabase";
import { createBrowserClient } from "@supabase/ssr";

// ─── Helpers ─────────────────────────────────────────────────────────────────

const fmtBRL    = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fmtData   = (s?: string | null) => { if (!s) return "—"; const [y, m, d] = s.split("-"); return `${d}/${m}/${y}`; };
const getSb     = () => createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);

const BANDEIRA_LABEL: Record<string, string> = {
  visa: "Visa", master: "Mastercard", elo: "Elo",
  amex: "Amex", hipercard: "Hipercard", outros: "Outros",
};
const BANDEIRA_COR: Record<string, string> = {
  visa: "#1A4870", master: "#E24B4A", elo: "#3D8B37",
  amex: "#6B7C93", hipercard: "#C9921B", outros: "#888",
};

const STATUS_LABEL: Record<string, string> = { aberta: "Aberta", fechada: "Fechada", paga: "Paga" };
const STATUS_COR: Record<string, { bg: string; cor: string }> = {
  aberta:  { bg: "#EEF4FF", cor: "#1e40af" },
  fechada: { bg: "#FBF3E0", cor: "#7A5A12" },
  paga:    { bg: "#EAF3DE", cor: "#1A5C38" },
};

const MESES = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];

type Aba = "faturas" | "conciliacao";

// ─── Tipos para conciliação ───────────────────────────────────────────────────
interface LinhaExtrato {
  data: string; descricao: string; valor: number;
  _status: "pendente" | "conciliado" | "divergente";
  _lancId?: string;
}

// ═════════════════════════════════════════════════════════════════════════════
export default function CartoesCredito() {
  const { contaId, fazendaId } = useAuth();
  const [aba, setAba] = useState<Aba>("faturas");

  const [cartoes,  setCartoes]  = useState<CartaoCredito[]>([]);
  const [faturas,  setFaturas]  = useState<FaturaCartao[]>([]);
  const [loading,  setLoading]  = useState(true);

  const [cartaoFiltro, setCartaoFiltro] = useState<string>("todos");
  const [statusFiltro, setStatusFiltro] = useState<string>("todos");

  const [faturaAberta, setFaturaAberta] = useState<FaturaCartao | null>(null);
  const [lançsFatura,  setLançsFatura]  = useState<Lancamento[]>([]);
  const [loadingLanc,  setLoadingLanc]  = useState(false);

  // Conciliação
  const [cartaoConcil,  setCartaoConcil]  = useState<string>("");
  const [faturaConcil,  setFaturaConcil]  = useState<string>("");
  const [linhasExtrato, setLinhasExtrato] = useState<LinhaExtrato[]>([]);
  const [lancFatura,    setLancFatura]    = useState<Lancamento[]>([]);
  const [loadingConc,   setLoadingConc]   = useState(false);
  const importRef = useRef<HTMLInputElement>(null);

  // ── Carga ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!contaId) return;
    setLoading(true);
    Promise.all([
      listarCartoesDaConta(contaId),
      listarFaturasDaConta(contaId),
    ]).then(([c, f]) => {
      setCartoes(c);
      setFaturas(f);
    }).finally(() => setLoading(false));
  }, [contaId]);

  const faturasFiltradas = useMemo(() => {
    let f = faturas;
    if (cartaoFiltro !== "todos") f = f.filter(x => x.cartao_id === cartaoFiltro);
    if (statusFiltro !== "todos") f = f.filter(x => x.status === statusFiltro);
    return f;
  }, [faturas, cartaoFiltro, statusFiltro]);

  const totalAberto  = faturas.filter(f => f.status !== "paga").reduce((s, f) => s + f.valor_total, 0);
  const totalFatura  = faturas.length;
  const totalPago    = faturas.filter(f => f.status === "paga").reduce((s, f) => s + f.valor_total, 0);

  // ── Detalhe da fatura ─────────────────────────────────────────────────────
  const abrirFatura = async (f: FaturaCartao) => {
    setFaturaAberta(f);
    setLoadingLanc(true);
    try {
      const lancs = await listarLancamentosDaFatura(f.id);
      setLançsFatura(lancs as Lancamento[]);
    } finally { setLoadingLanc(false); }
  };

  const toggleFecharFatura = async (f: FaturaCartao) => {
    if (f.status === "aberta") await fecharFatura(f.id);
    else await reabrirFatura(f.id);
    const atualizadas = await listarFaturasDaConta(contaId!);
    setFaturas(atualizadas);
    if (faturaAberta?.id === f.id) setFaturaAberta(atualizadas.find(x => x.id === f.id) ?? null);
  };

  // ── Conciliação: parse do extrato ─────────────────────────────────────────
  const handleExtrato = async (file: File) => {
    setLoadingConc(true);
    try {
      const XLSX = await import("xlsx");
      const wb   = XLSX.read(await file.arrayBuffer());
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[wb.SheetNames[0]], { defval: "" });
      const g = (r: Record<string, unknown>, ...keys: string[]) =>
        keys.reduce<string>((a, k) => a || String(r[k] ?? ""), "").trim();
      const linhas: LinhaExtrato[] = rows.map(r => {
        const dataRaw = g(r, "Data", "data", "DATE");
        let dataIso = dataRaw;
        if (dataRaw.includes("/")) {
          const p = dataRaw.split("/");
          if (p.length === 3) dataIso = `${p[2].length === 4 ? p[2] : "20"+p[2]}-${p[1].padStart(2,"0")}-${p[0].padStart(2,"0")}`;
        }
        const val = parseFloat(g(r, "Valor", "valor", "AMOUNT").replace(/\./g,"").replace(",",".")) || 0;
        return { data: dataIso, descricao: g(r, "Descrição", "descricao", "DESCRIPTION", "Estabelecimento"), valor: Math.abs(val), _status: "pendente" as const };
      }).filter(l => l.valor > 0);
      setLinhasExtrato(linhas);

      // Carrega lançamentos da fatura para conciliar
      if (faturaConcil) {
        const lancs = await listarLancamentosDaFatura(faturaConcil);
        setLancFatura(lancs as Lancamento[]);
      }
    } finally { setLoadingConc(false); }
  };

  const conciliarLinha = (idx: number, lancId: string) => {
    setLinhasExtrato(prev => prev.map((l, i) => i === idx ? { ...l, _status: "conciliado", _lancId: lancId } : l));
  };
  const marcarDivergente = (idx: number) => {
    setLinhasExtrato(prev => prev.map((l, i) => i === idx ? { ...l, _status: "divergente" } : l));
  };

  const totalExtrato    = linhasExtrato.reduce((s, l) => s + l.valor, 0);
  const totalConciliado = linhasExtrato.filter(l => l._status === "conciliado").reduce((s, l) => s + l.valor, 0);
  const totalDivergente = linhasExtrato.filter(l => l._status === "divergente").reduce((s, l) => s + l.valor, 0);

  const faturasParaConcil = useMemo(() =>
    cartaoConcil ? faturas.filter(f => f.cartao_id === cartaoConcil) : [],
    [faturas, cartaoConcil]
  );

  // ─────────────────────────────────────────────────────────────────────────
  const inpS: React.CSSProperties = { width: "100%", padding: "7px 10px", border: "0.5px solid var(--border-table)", borderRadius: 8, fontSize: 13, color: "var(--text-1)", background: "var(--bg-input)", boxSizing: "border-box" };
  const lblS: React.CSSProperties = { fontSize: 11, color: "var(--text-2)", marginBottom: 4, display: "block" };

  // ═════════════════════════════════════════════════════════════════════════
  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh", background: "var(--bg-page)", fontFamily: "system-ui, sans-serif", fontSize: 13 }}>
      <TopNav />
      <main style={{ flex: 1, padding: "20px 24px" }}>

        <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 17, fontWeight: 600, color: "var(--text-1)" }}>Cartões de Crédito</h1>
            <p style={{ margin: 0, fontSize: 11, color: "var(--text-3)" }}>Faturas geradas automaticamente · Conciliação com extrato do banco</p>
          </div>
        </header>

        {/* KPI cards */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10, marginBottom: 16 }}>
          {([
            { label: "Cartões ativos",    val: cartoes.length,                  fmt: false },
            { label: "Total de faturas",  val: totalFatura,                     fmt: false },
            { label: "A pagar (em aberto)", val: totalAberto,                   fmt: true,  cor: "#E24B4A" },
            { label: "Pago no período",   val: totalPago,                       fmt: true,  cor: "#1A5C38" },
          ] as any[]).map((c, i) => (
            <div key={i} style={{ background: "var(--bg-card)", border: "0.5px solid var(--border-table)", borderRadius: 10, padding: "12px 14px" }}>
              <div style={{ fontSize: 11, color: "var(--text-2)", marginBottom: 4 }}>{c.label}</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: c.cor ?? "var(--text-1)", fontVariantNumeric: "tabular-nums" }}>
                {c.fmt ? fmtBRL(c.val) : c.val}
              </div>
            </div>
          ))}
        </div>

        {/* Abas */}
        <div style={{ background: "var(--bg-card)", border: "0.5px solid var(--border-table)", borderRadius: 12, overflow: "hidden" }}>
          <div style={{ display: "flex", borderBottom: "0.5px solid var(--border-table)" }}>
            {([["faturas","Faturas"], ["conciliacao","Conciliação"]] as [Aba, string][]).map(([k, lbl]) => (
              <button key={k} onClick={() => setAba(k)} style={{ padding: "10px 20px", border: "none", background: aba===k ? "#fff" : "var(--bg-card)", borderBottom: `2px solid ${aba===k ? "#1A5C38" : "transparent"}`, cursor: "pointer", fontSize: 13, fontWeight: aba===k ? 600 : 400, color: aba===k ? "#1A5C38" : "var(--text-2)" }}>
                {lbl}
              </button>
            ))}
          </div>

          {/* ═══ FATURAS ═══ */}
          {aba === "faturas" && (
            <div style={{ padding: 20 }}>
              <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
                <div style={{ minWidth: 200 }}>
                  <label style={lblS}>Cartão</label>
                  <select value={cartaoFiltro} onChange={e => setCartaoFiltro(e.target.value)} style={{ ...inpS, width: "auto", minWidth: 200 }}>
                    <option value="todos">Todos os cartões</option>
                    {cartoes.map(c => <option key={c.id} value={c.id}>{c.titular} — {BANDEIRA_LABEL[c.bandeira]} {c.numero_final ? `••••${c.numero_final}` : ""}</option>)}
                  </select>
                </div>
                <div>
                  <label style={lblS}>Status</label>
                  <select value={statusFiltro} onChange={e => setStatusFiltro(e.target.value)} style={{ ...inpS, width: "auto" }}>
                    <option value="todos">Todos</option>
                    <option value="aberta">Aberta</option>
                    <option value="fechada">Fechada</option>
                    <option value="paga">Paga</option>
                  </select>
                </div>
              </div>

              {loading ? (
                <div style={{ padding: 40, textAlign: "center", color: "var(--text-2)" }}>Carregando…</div>
              ) : faturasFiltradas.length === 0 ? (
                <div style={{ padding: 48, textAlign: "center", color: "var(--text-2)" }}>
                  <div style={{ fontSize: 32, marginBottom: 8 }}>💳</div>
                  <div style={{ fontWeight: 600, color: "var(--text-1)", marginBottom: 4 }}>Nenhuma fatura encontrada</div>
                  <div style={{ fontSize: 12 }}>As faturas são geradas automaticamente quando uma CP é baixada via Cartão de Crédito.</div>
                </div>
              ) : (
                <div style={{ display: "grid", gap: 8 }}>
                  {faturasFiltradas.map(f => {
                    const cartao = cartoes.find(c => c.id === f.cartao_id);
                    const sc = STATUS_COR[f.status] ?? STATUS_COR.aberta;
                    const ativa = faturaAberta?.id === f.id;
                    return (
                      <div key={f.id} style={{ border: `0.5px solid ${ativa ? "#1A5C38" : "var(--border-table)"}`, borderRadius: 10, overflow: "hidden", background: "var(--bg-card)" }}>
                        <div style={{ display: "flex", alignItems: "center", padding: "12px 16px", gap: 14, cursor: "pointer" }}
                          onClick={() => ativa ? setFaturaAberta(null) : abrirFatura(f)}>
                          {/* Bandeira */}
                          <div style={{ width: 40, height: 28, borderRadius: 5, background: BANDEIRA_COR[cartao?.bandeira ?? "outros"], display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                            <span style={{ color: "#fff", fontSize: 9, fontWeight: 700 }}>{BANDEIRA_LABEL[cartao?.bandeira ?? "outros"].slice(0,4).toUpperCase()}</span>
                          </div>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontWeight: 600, color: "var(--text-1)", fontSize: 13 }}>
                              {cartao?.titular ?? "—"} {cartao?.numero_final ? `••••${cartao.numero_final}` : ""}
                            </div>
                            <div style={{ fontSize: 11, color: "var(--text-2)" }}>
                              {MESES[(f.mes - 1)]} {f.ano} · Fecha {fmtData(f.data_fechamento)} · Vence {fmtData(f.data_vencimento)}
                            </div>
                          </div>
                          <span style={{ fontSize: 11, fontWeight: 600, padding: "3px 10px", borderRadius: 6, background: sc.bg, color: sc.cor }}>{STATUS_LABEL[f.status]}</span>
                          <div style={{ textAlign: "right", flexShrink: 0 }}>
                            <div style={{ fontWeight: 700, fontSize: 15, color: f.status === "paga" ? "#1A5C38" : "#E24B4A", fontVariantNumeric: "tabular-nums" }}>{fmtBRL(f.valor_total)}</div>
                            <div style={{ fontSize: 10, color: "var(--text-3)" }}>{ativa ? "▲ fechar" : "▼ detalhe"}</div>
                          </div>
                        </div>

                        {ativa && (
                          <div style={{ borderTop: "0.5px solid var(--border-table)", padding: 16 }}>
                            <div style={{ display: "flex", gap: 8, marginBottom: 14, justifyContent: "flex-end" }}>
                              {f.status !== "paga" && (
                                <button onClick={() => toggleFecharFatura(f)}
                                  style={{ padding: "6px 14px", border: "0.5px solid var(--border-table)", borderRadius: 8, background: f.status === "aberta" ? "#FBF3E0" : "var(--bg-card)", color: f.status === "aberta" ? "#7A5A12" : "var(--text-1)", cursor: "pointer", fontSize: 12, fontWeight: 600 }}>
                                  {f.status === "aberta" ? "🔒 Fechar fatura" : "🔓 Reabrir fatura"}
                                </button>
                              )}
                            </div>
                            {loadingLanc ? (
                              <div style={{ padding: 20, textAlign: "center", color: "var(--text-2)", fontSize: 12 }}>Carregando lançamentos…</div>
                            ) : lançsFatura.length === 0 ? (
                              <div style={{ padding: 20, textAlign: "center", color: "var(--text-2)", fontSize: 12 }}>Nenhum lançamento vinculado a esta fatura.</div>
                            ) : (
                              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                                <thead>
                                  <tr style={{ background: "var(--bg-page)" }}>
                                    {["Data baixa", "Descrição", "Fornecedor", "Valor"].map((h, i) => (
                                      <th key={i} style={{ padding: "7px 10px", textAlign: i === 3 ? "right" : "left", fontSize: 11, color: "var(--text-2)", borderBottom: "0.5px solid var(--border-table)", fontWeight: 600 }}>{h}</th>
                                    ))}
                                  </tr>
                                </thead>
                                <tbody>
                                  {lançsFatura.map((l, i) => (
                                    <tr key={l.id} style={{ borderBottom: i < lançsFatura.length - 1 ? "0.5px solid var(--border-row)" : "none" }}>
                                      <td style={{ padding: "7px 10px", whiteSpace: "nowrap" }}>{fmtData(l.data_baixa)}</td>
                                      <td style={{ padding: "7px 10px", color: "var(--text-1)" }}>{l.descricao}</td>
                                      <td style={{ padding: "7px 10px", color: "var(--text-2)" }}>{l.categoria}</td>
                                      <td style={{ padding: "7px 10px", textAlign: "right", fontWeight: 600, color: "#E24B4A", fontVariantNumeric: "tabular-nums" }}>{fmtBRL(l.valor_pago ?? l.valor)}</td>
                                    </tr>
                                  ))}
                                </tbody>
                                <tfoot>
                                  <tr style={{ borderTop: "1px solid var(--border-table)", background: "var(--bg-page)" }}>
                                    <td colSpan={3} style={{ padding: "8px 10px", fontWeight: 700, color: "var(--text-1)" }}>Total da fatura</td>
                                    <td style={{ padding: "8px 10px", textAlign: "right", fontWeight: 700, color: "#E24B4A", fontVariantNumeric: "tabular-nums" }}>{fmtBRL(f.valor_total)}</td>
                                  </tr>
                                </tfoot>
                              </table>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* ═══ CONCILIAÇÃO ═══ */}
          {aba === "conciliacao" && (
            <div style={{ padding: 20 }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 20 }}>
                <div>
                  <label style={lblS}>Cartão</label>
                  <select value={cartaoConcil} onChange={e => { setCartaoConcil(e.target.value); setFaturaConcil(""); setLinhasExtrato([]); setLancFatura([]); }} style={inpS}>
                    <option value="">— Selecionar cartão —</option>
                    {cartoes.map(c => <option key={c.id} value={c.id}>{c.titular} — {BANDEIRA_LABEL[c.bandeira]} {c.numero_final ? `••••${c.numero_final}` : ""}</option>)}
                  </select>
                </div>
                <div>
                  <label style={lblS}>Fatura (competência)</label>
                  <select value={faturaConcil} onChange={async e => {
                    setFaturaConcil(e.target.value);
                    if (e.target.value) {
                      const lancs = await listarLancamentosDaFatura(e.target.value);
                      setLancFatura(lancs as Lancamento[]);
                    }
                  }} style={inpS} disabled={!cartaoConcil}>
                    <option value="">— Selecionar fatura —</option>
                    {faturasParaConcil.map(f => <option key={f.id} value={f.id}>{MESES[f.mes-1]} {f.ano} — {fmtBRL(f.valor_total)} ({STATUS_LABEL[f.status]})</option>)}
                  </select>
                </div>
              </div>

              {faturaConcil && (
                <>
                  <div style={{ background: "#EEF4FF", border: "0.5px solid #93C5FD", borderRadius: 10, padding: "12px 16px", marginBottom: 16, fontSize: 12, color: "#1e40af", lineHeight: 1.7 }}>
                    <strong>Como conciliar:</strong> Faça o download do extrato do cartão no app do banco (normalmente em CSV ou XLSX).
                    Importe o arquivo abaixo. O sistema cruza automaticamente os valores com os lançamentos da fatura.<br />
                    Colunas esperadas: <strong>Data</strong> · <strong>Descrição</strong> · <strong>Valor</strong>
                  </div>

                  <div onClick={() => importRef.current?.click()}
                    style={{ border: "1.5px dashed var(--border-table)", borderRadius: 10, padding: "24px 20px", textAlign: "center", cursor: "pointer", marginBottom: 16 }}>
                    <div style={{ fontSize: 24, marginBottom: 6 }}>📂</div>
                    <div style={{ fontWeight: 600, color: "var(--text-1)" }}>{loadingConc ? "Processando…" : "Importar extrato do cartão (CSV / XLSX)"}</div>
                    <div style={{ fontSize: 11, color: "var(--text-3)", marginTop: 3 }}>Arraste ou clique para selecionar</div>
                  </div>
                  <input ref={importRef} type="file" accept=".csv,.xls,.xlsx" style={{ display: "none" }}
                    onChange={e => { const f = e.target.files?.[0]; if (f) handleExtrato(f); e.target.value = ""; }} />

                  {linhasExtrato.length > 0 && (
                    <>
                      {/* Resumo */}
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8, marginBottom: 14 }}>
                        {[
                          { l: "Total extrato",    v: totalExtrato,    cor: "var(--text-1)" },
                          { l: "Total fatura",     v: faturas.find(f => f.id === faturaConcil)?.valor_total ?? 0, cor: "var(--text-1)" },
                          { l: "Conciliado",       v: totalConciliado, cor: "#1A5C38" },
                          { l: "Divergente",       v: totalDivergente, cor: "#E24B4A" },
                        ].map((c, i) => (
                          <div key={i} style={{ background: "var(--bg-page)", border: "0.5px solid var(--border-table)", borderRadius: 8, padding: "10px 12px" }}>
                            <div style={{ fontSize: 11, color: "var(--text-2)", marginBottom: 3 }}>{c.l}</div>
                            <div style={{ fontWeight: 700, fontSize: 14, color: c.cor, fontVariantNumeric: "tabular-nums" }}>{fmtBRL(c.v)}</div>
                          </div>
                        ))}
                      </div>

                      {/* Tabela comparativa */}
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                        {/* Extrato do banco */}
                        <div>
                          <div style={{ fontWeight: 600, fontSize: 13, color: "var(--text-1)", marginBottom: 8 }}>Extrato do banco ({linhasExtrato.length} linhas)</div>
                          <div style={{ border: "0.5px solid var(--border-table)", borderRadius: 8, overflow: "hidden" }}>
                            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                              <thead>
                                <tr style={{ background: "var(--bg-page)" }}>
                                  <th style={{ padding: "7px 10px", textAlign: "left", fontSize: 11, color: "var(--text-2)", borderBottom: "0.5px solid var(--border-table)" }}>Data</th>
                                  <th style={{ padding: "7px 10px", textAlign: "left", fontSize: 11, color: "var(--text-2)", borderBottom: "0.5px solid var(--border-table)" }}>Descrição</th>
                                  <th style={{ padding: "7px 10px", textAlign: "right", fontSize: 11, color: "var(--text-2)", borderBottom: "0.5px solid var(--border-table)" }}>Valor</th>
                                  <th style={{ padding: "7px 10px", fontSize: 11, color: "var(--text-2)", borderBottom: "0.5px solid var(--border-table)" }}></th>
                                </tr>
                              </thead>
                              <tbody>
                                {linhasExtrato.map((l, i) => {
                                  const cor = l._status === "conciliado" ? "#1A5C38" : l._status === "divergente" ? "#E24B4A" : "var(--text-2)";
                                  return (
                                    <tr key={i} style={{ borderBottom: "0.5px solid var(--border-row)", background: l._status === "conciliado" ? "#F0FAF0" : l._status === "divergente" ? "#FFF5F5" : "transparent" }}>
                                      <td style={{ padding: "6px 10px", color: cor, whiteSpace: "nowrap", fontSize: 11 }}>{fmtData(l.data)}</td>
                                      <td style={{ padding: "6px 10px", color: cor, maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: 11 }}>{l.descricao}</td>
                                      <td style={{ padding: "6px 10px", textAlign: "right", fontWeight: 600, color: cor, fontVariantNumeric: "tabular-nums", fontSize: 11 }}>{fmtBRL(l.valor)}</td>
                                      <td style={{ padding: "6px 4px" }}>
                                        {l._status === "pendente" ? (
                                          <div style={{ display: "flex", gap: 2 }}>
                                            <button title="Marcar divergente" onClick={() => marcarDivergente(i)}
                                              style={{ fontSize: 10, padding: "2px 5px", borderRadius: 4, border: "0.5px solid #E24B4A50", background: "#FCEBEB", color: "#791F1F", cursor: "pointer" }}>!</button>
                                          </div>
                                        ) : (
                                          <span style={{ fontSize: 11, color: cor }}>{l._status === "conciliado" ? "✓" : "✕"}</span>
                                        )}
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        </div>

                        {/* Lançamentos da fatura */}
                        <div>
                          <div style={{ fontWeight: 600, fontSize: 13, color: "var(--text-1)", marginBottom: 8 }}>Lançamentos da fatura ({lancFatura.length})</div>
                          <div style={{ border: "0.5px solid var(--border-table)", borderRadius: 8, overflow: "hidden" }}>
                            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                              <thead>
                                <tr style={{ background: "var(--bg-page)" }}>
                                  {["Data", "Descrição", "Valor"].map((h, i) => (
                                    <th key={i} style={{ padding: "7px 10px", textAlign: i === 2 ? "right" : "left", fontSize: 11, color: "var(--text-2)", borderBottom: "0.5px solid var(--border-table)" }}>{h}</th>
                                  ))}
                                </tr>
                              </thead>
                              <tbody>
                                {lancFatura.length === 0 ? (
                                  <tr><td colSpan={3} style={{ padding: "16px 10px", textAlign: "center", color: "var(--text-2)", fontSize: 12 }}>Importe o extrato para conciliar</td></tr>
                                ) : lancFatura.map((l, i) => (
                                  <tr key={l.id} style={{ borderBottom: "0.5px solid var(--border-row)" }}>
                                    <td style={{ padding: "6px 10px", fontSize: 11, whiteSpace: "nowrap" }}>{fmtData(l.data_baixa)}</td>
                                    <td style={{ padding: "6px 10px", fontSize: 11, maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{l.descricao}</td>
                                    <td style={{ padding: "6px 10px", textAlign: "right", fontWeight: 600, color: "#E24B4A", fontVariantNumeric: "tabular-nums", fontSize: 11 }}>{fmtBRL(l.valor_pago ?? l.valor)}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                          {lancFatura.length > 0 && linhasExtrato.length > 0 && (
                            <div style={{ marginTop: 10, padding: "10px 12px", background: "var(--bg-page)", borderRadius: 8, border: "0.5px solid var(--border-table)", fontSize: 12 }}>
                              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                                <span style={{ color: "var(--text-2)" }}>Diferença extrato × fatura:</span>
                                <strong style={{ color: Math.abs(totalExtrato - (faturas.find(f => f.id === faturaConcil)?.valor_total ?? 0)) < 0.01 ? "#1A5C38" : "#E24B4A", fontVariantNumeric: "tabular-nums" }}>
                                  {fmtBRL(Math.abs(totalExtrato - (faturas.find(f => f.id === faturaConcil)?.valor_total ?? 0)))}
                                </strong>
                              </div>
                              {Math.abs(totalExtrato - (faturas.find(f => f.id === faturaConcil)?.valor_total ?? 0)) < 0.01 && (
                                <div style={{ color: "#1A5C38", fontWeight: 600, fontSize: 11 }}>✓ Fatura e extrato conferem</div>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    </>
                  )}
                </>
              )}

              {!faturaConcil && (
                <div style={{ padding: 48, textAlign: "center", color: "var(--text-2)" }}>
                  <div style={{ fontSize: 32, marginBottom: 8 }}>🔍</div>
                  <div style={{ fontWeight: 600, color: "var(--text-1)", marginBottom: 4 }}>Selecione um cartão e uma fatura para conciliar</div>
                  <div style={{ fontSize: 12 }}>Depois importe o extrato do banco para cruzar os valores.</div>
                </div>
              )}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
