"use client";
import { useState, useEffect } from "react";
import TopNav from "@/components/TopNav";
import { createBrowserClient } from "@supabase/ssr";
import type { TaxaVariavelHistorico } from "@/lib/supabase";

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const INDEXADORES = ["CDI", "IPCA", "SELIC", "TR", "TJLP", "TLP", "INPC", "IGP-M"];
const MESES = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];

const fmtPct = (v: number | null | undefined) =>
  v != null ? `${v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 4 })}%` : "—";

function anoAtual() { return new Date().getFullYear(); }
function mesAtual()  { return new Date().getMonth() + 1; }

export default function TaxasVariaveisPage() {
  const [taxas, setTaxas]       = useState<TaxaVariavelHistorico[]>([]);
  const [loading, setLoading]   = useState(true);
  const [atualizando, setAtualizando] = useState(false);
  const [msgAtualiz, setMsgAtualiz]   = useState<string | null>(null);

  // Filtro de período
  const [anoInicio, setAnoInicio] = useState(anoAtual() - 2);
  const [anoFim,    setAnoFim]    = useState(anoAtual());

  // Modal de lançamento manual
  const [modalManual, setModalManual] = useState(false);
  const [fManual, setFManual] = useState({ indexador: "CDI", ano: String(anoAtual()), mes: String(mesAtual()), valor_pct: "" });
  const [salvando, setSalvando] = useState(false);

  useEffect(() => { carregar(); }, [anoInicio, anoFim]);

  async function carregar() {
    setLoading(true);
    const { data } = await supabase
      .from("taxas_variaveis_historico")
      .select("*")
      .gte("ano", anoInicio)
      .lte("ano", anoFim)
      .order("ano", { ascending: false })
      .order("mes", { ascending: false });
    setTaxas(data ?? []);
    setLoading(false);
  }

  async function atualizarAgora() {
    setAtualizando(true);
    setMsgAtualiz(null);
    try {
      const r = await fetch("/api/cron/atualizar-taxas");
      const json = await r.json();
      setMsgAtualiz(json.sucesso ?? "Atualizado");
      await carregar();
    } catch {
      setMsgAtualiz("Erro ao chamar o serviço de atualização");
    }
    setAtualizando(false);
  }

  async function salvarManual() {
    if (!fManual.valor_pct) return;
    setSalvando(true);
    const { error } = await supabase.from("taxas_variaveis_historico").upsert(
      { indexador: fManual.indexador, ano: parseInt(fManual.ano), mes: parseInt(fManual.mes),
        valor_pct: parseFloat(fManual.valor_pct.replace(",", ".")), fonte: "manual",
        updated_at: new Date().toISOString() },
      { onConflict: "indexador,ano,mes" }
    );
    setSalvando(false);
    if (!error) { setModalManual(false); await carregar(); }
  }

  // Organiza em grid: linhas = (ano, mês), colunas = indexadores
  type Chave = `${number}-${number}`;
  const grid = new Map<Chave, Partial<Record<string, number>>>();
  for (const t of taxas) {
    const k: Chave = `${t.ano}-${t.mes}`;
    if (!grid.has(k)) grid.set(k, {});
    grid.get(k)![t.indexador] = t.valor_pct;
  }
  const periodos = [...grid.keys()].sort((a, b) => b.localeCompare(a));

  const lbl: React.CSSProperties = { fontSize: 11, fontWeight: 600, color: "var(--text-2)", marginBottom: 4, display: "block" };
  const inp: React.CSSProperties = { padding: "7px 10px", border: "0.5px solid var(--border-table)", borderRadius: 7, fontSize: 13, width: "100%", boxSizing: "border-box", background: "var(--bg-card)", color: "var(--text-1)" };

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh", background: "var(--bg-page)", fontFamily: "system-ui, sans-serif", fontSize: 13 }}>
      <TopNav />
      <main style={{ flex: 1, maxWidth: 1200, margin: "0 auto", padding: "28px 24px", width: "100%" }}>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 24 }}>
          <div>
            <h1 style={{ fontSize: 20, fontWeight: 700, color: "var(--text-1)", margin: 0 }}>Taxas de Referência Variável</h1>
            <div style={{ fontSize: 12, color: "var(--text-3)", marginTop: 3 }}>
              CDI, IPCA, SELIC, TR, TJLP e outros — atualizado automaticamente todo dia 1º · Fonte: Banco Central do Brasil
            </div>
          </div>
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <button onClick={() => setModalManual(true)}
              style={{ padding: "8px 16px", border: "0.5px solid var(--border-table)", borderRadius: 8, background: "var(--bg-card)", fontSize: 13, cursor: "pointer", color: "var(--text-2)" }}>
              + Lançar Manual
            </button>
            <button onClick={atualizarAgora} disabled={atualizando}
              style={{ padding: "8px 16px", border: "none", borderRadius: 8, background: "#1A4870", color: "white", fontSize: 13, fontWeight: 600, cursor: "pointer", opacity: atualizando ? 0.6 : 1 }}>
              {atualizando ? "Atualizando…" : "↻ Atualizar Agora (BCB)"}
            </button>
          </div>
        </div>

        {msgAtualiz && (
          <div style={{ marginBottom: 16, padding: "10px 16px", borderRadius: 8, background: "#EAF4EC", border: "0.5px solid #16A34A", color: "#0F5132", fontSize: 12, fontWeight: 600 }}>
            ✓ {msgAtualiz}
          </div>
        )}

        {/* Filtro de período */}
        <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 20 }}>
          <span style={{ fontSize: 12, color: "var(--text-3)" }}>Período:</span>
          {[anoAtual() - 4, anoAtual() - 2, anoAtual() - 1, "tudo"].map(op => {
            const label = op === "tudo" ? "Tudo (10 anos)" : `Últimos ${anoAtual() - (op as number) + 1} anos`;
            const ativo = op === "tudo" ? anoInicio <= anoAtual() - 9 : anoInicio === op;
            return (
              <button key={String(op)} onClick={() => { setAnoInicio(op === "tudo" ? anoAtual() - 10 : op as number); setAnoFim(anoAtual()); }}
                style={{ padding: "4px 12px", borderRadius: 6, border: `0.5px solid ${ativo ? "#1A4870" : "var(--border)"}`, background: ativo ? "#D5E8F5" : "transparent", color: ativo ? "#0B2D50" : "var(--text-3)", fontSize: 12, fontWeight: ativo ? 600 : 400, cursor: "pointer" }}>
                {label}
              </button>
            );
          })}
        </div>

        {/* Tabela histórica */}
        <div style={{ background: "var(--bg-card)", border: "0.5px solid var(--border)", borderRadius: 12, overflow: "hidden" }}>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr style={{ background: "var(--bg-page)" }}>
                  <th style={{ padding: "10px 14px", textAlign: "left", fontWeight: 700, color: "var(--text-2)", borderBottom: "0.5px solid var(--border-table)", whiteSpace: "nowrap" }}>Período</th>
                  {INDEXADORES.map(idx => (
                    <th key={idx} style={{ padding: "10px 12px", textAlign: "right", fontWeight: 700, color: "var(--text-2)", borderBottom: "0.5px solid var(--border-table)", whiteSpace: "nowrap" }}>{idx}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={INDEXADORES.length + 1} style={{ padding: "32px", textAlign: "center", color: "var(--text-3)" }}>Carregando…</td></tr>
                ) : periodos.length === 0 ? (
                  <tr><td colSpan={INDEXADORES.length + 1} style={{ padding: "32px", textAlign: "center", color: "var(--text-3)" }}>
                    Nenhum dado. Clique em "Atualizar Agora (BCB)" para carregar.
                  </td></tr>
                ) : periodos.map((k, i) => {
                  const [anoStr, mesStr] = k.split("-");
                  const linha = grid.get(k) ?? {};
                  const eMesAtual = parseInt(anoStr) === anoAtual() && parseInt(mesStr) === mesAtual();
                  return (
                    <tr key={k} style={{ borderBottom: "0.5px solid var(--border-table)", background: eMesAtual ? "#F0F7FF" : i % 2 === 0 ? "var(--bg-card)" : "var(--bg-page)" }}>
                      <td style={{ padding: "8px 14px", fontWeight: eMesAtual ? 700 : 500, color: eMesAtual ? "#1A4870" : "var(--text-1)", whiteSpace: "nowrap" }}>
                        {MESES[parseInt(mesStr) - 1]}/{anoStr}
                        {eMesAtual && <span style={{ marginLeft: 6, fontSize: 10, background: "#D5E8F5", color: "#1A4870", padding: "1px 6px", borderRadius: 8, fontWeight: 700 }}>Atual</span>}
                      </td>
                      {INDEXADORES.map(idx => {
                        const v = linha[idx];
                        return (
                          <td key={idx} style={{ padding: "8px 12px", textAlign: "right", color: v != null ? "var(--text-1)" : "var(--text-muted)", fontVariantNumeric: "tabular-nums" }}>
                            {fmtPct(v)}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Rodapé informativo */}
          <div style={{ padding: "10px 16px", borderTop: "0.5px solid var(--border-table)", display: "flex", gap: 20, flexWrap: "wrap" }}>
            <span style={{ fontSize: 11, color: "var(--text-3)" }}>Todos os valores em <strong>% a.a.</strong> (taxa anualizada)</span>
            <span style={{ fontSize: 11, color: "var(--text-3)" }}>CDI/SELIC: acumulado mensal convertido para a.a. · TJLP/TLP: publicados diretamente a.a. pelo BCB</span>
            <span style={{ fontSize: 11, color: "var(--text-3)" }}>Cron: dia 1º de cada mês às 7h BRT</span>
          </div>
        </div>

        {/* Painel de uso nos contratos */}
        <div style={{ marginTop: 20, padding: "14px 18px", background: "var(--bg-card)", border: "0.5px solid var(--border)", borderRadius: 10 }}>
          <div style={{ fontWeight: 700, fontSize: 13, color: "var(--text-1)", marginBottom: 8 }}>Como usar nos Contratos Financeiros</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14 }}>
            {[
              { label: "Indexador", desc: "Ex: CDI — o sistema busca o valor mais recente desta tabela" },
              { label: "Juros Fixos a.a.", desc: "Ex: 3,40% — é o spread fixo contratado sobre o indexador" },
              { label: "TEF (Taxa Efetiva)", desc: "= Indexador + Juros Fixos — usada no cálculo das parcelas" },
            ].map(item => (
              <div key={item.label} style={{ padding: "10px 12px", background: "var(--bg-page)", borderRadius: 8, border: "0.5px solid var(--border-table)" }}>
                <div style={{ fontWeight: 700, fontSize: 12, color: "#1A4870", marginBottom: 4 }}>{item.label}</div>
                <div style={{ fontSize: 11, color: "var(--text-3)", lineHeight: 1.5 }}>{item.desc}</div>
              </div>
            ))}
          </div>
        </div>
      </main>

      {/* Modal lançamento manual */}
      {modalManual && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(11,45,80,0.32)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 2000 }}
          onClick={e => { if (e.target === e.currentTarget) setModalManual(false); }}>
          <div style={{ background: "var(--bg-card)", borderRadius: 14, width: "min(480px, 95vw)", padding: "24px" }}>
            <div style={{ fontWeight: 700, fontSize: 16, color: "var(--text-1)", marginBottom: 18 }}>Lançar Taxa Manualmente</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 16 }}>
              <div>
                <label style={lbl}>Indexador</label>
                <select style={inp} value={fManual.indexador} onChange={e => setFManual(p => ({ ...p, indexador: e.target.value }))}>
                  {INDEXADORES.map(i => <option key={i} value={i}>{i}</option>)}
                </select>
              </div>
              <div>
                <label style={lbl}>Ano</label>
                <input style={inp} type="number" min={2010} max={2099} value={fManual.ano} onChange={e => setFManual(p => ({ ...p, ano: e.target.value }))} />
              </div>
              <div>
                <label style={lbl}>Mês</label>
                <select style={inp} value={fManual.mes} onChange={e => setFManual(p => ({ ...p, mes: e.target.value }))}>
                  {MESES.map((m, i) => <option key={i+1} value={i+1}>{m}</option>)}
                </select>
              </div>
            </div>
            <div style={{ marginBottom: 20 }}>
              <label style={lbl}>Valor (% a.a.)</label>
              <input style={inp} type="text" placeholder="Ex: 14,75" value={fManual.valor_pct} onChange={e => setFManual(p => ({ ...p, valor_pct: e.target.value }))} />
              <div style={{ fontSize: 11, color: "var(--text-3)", marginTop: 4 }}>Informe sempre em percentual ao ano (% a.a.)</div>
            </div>
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <button onClick={() => setModalManual(false)} style={{ padding: "8px 18px", border: "0.5px solid var(--border)", borderRadius: 8, background: "transparent", fontSize: 13, cursor: "pointer" }}>Cancelar</button>
              <button onClick={salvarManual} disabled={salvando || !fManual.valor_pct}
                style={{ padding: "8px 18px", border: "none", borderRadius: 8, background: "#1A4870", color: "white", fontSize: 13, fontWeight: 600, cursor: "pointer", opacity: salvando || !fManual.valor_pct ? 0.5 : 1 }}>
                {salvando ? "Salvando…" : "Salvar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
