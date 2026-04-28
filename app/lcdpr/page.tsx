"use client";
import { useState, useEffect } from "react";
import TopNav from "../../components/TopNav";
import { useAuth } from "../../components/AuthProvider";
import { listarLancamentos } from "../../lib/db";
import type { Lancamento } from "../../lib/supabase";

// ─────────────────────────────────────────────────────────────
// TABELA DE CÓDIGOS LCDPR — Receita Federal
// ─────────────────────────────────────────────────────────────
const CODIGOS_LCDPR = {
  receita: [
    { cod: "101", desc: "Venda de produto rural" },
    { cod: "102", desc: "Prestação de serviços rurais" },
    { cod: "103", desc: "Recursos de financiamento rural recebidos" },
    { cod: "104", desc: "Ressarcimento do ITR" },
    { cod: "199", desc: "Outras receitas rurais" },
  ],
  despesa: [
    { cod: "201", desc: "Custeio da atividade rural" },
    { cod: "202", desc: "Investimento na atividade rural" },
    { cod: "203", desc: "Amortização de financiamento rural" },
    { cod: "204", desc: "Pagamento de ITR" },
    { cod: "205", desc: "Outros impostos e taxas" },
    { cod: "299", desc: "Outras despesas rurais" },
  ],
} as const;

// Mapeamento automático categoria → código LCDPR
const MAPA_CATEGORIA: Record<string, string> = {
  // Receitas
  "Venda de grãos":      "101",
  "Venda de soja":       "101",
  "Venda de milho":      "101",
  "Venda de algodão":    "101",
  "Serviço rural":       "102",
  "Financiamento":       "103",
  "ITR":                 "104",
  // Despesas
  "Insumos":             "201",
  "Sementes":            "201",
  "Fertilizantes":       "201",
  "Defensivos":          "201",
  "Mão de obra":         "201",
  "Frete":               "201",
  "Arrendamento":        "201",
  "Máquinas":            "202",
  "Investimento":        "202",
  "Amortização":         "203",
  "Impostos e taxas":    "205",
};

function codigoAuto(lan: Lancamento): string {
  for (const [key, cod] of Object.entries(MAPA_CATEGORIA)) {
    if (lan.categoria?.toLowerCase().includes(key.toLowerCase())) return cod;
    if (lan.descricao?.toLowerCase().includes(key.toLowerCase())) return cod;
  }
  return lan.tipo === "receber" ? "199" : "299";
}

const hoje = () => new Date().toISOString().split("T")[0];
const fmtData = (s: string) => { const [y,m,d] = s.split("-"); return `${d}/${m}/${y}`; };
const fmtBRL = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

type AbaLCDPR = "livro" | "resumo" | "exportacao";

interface EntradaLCDPR {
  id: string;
  data: string;
  historico: string;
  doc: string;
  cpf_cnpj: string;
  codigo: string;
  receita: number;
  despesa: number;
  origem: "auto" | "manual";
  lancId?: string;
}

// ─────────────────────────────────────────────────────────────
export default function LCDPR() {
  const { fazendaId } = useAuth();
  const [aba, setAba]         = useState<AbaLCDPR>("livro");
  const [anoSel, setAnoSel]   = useState(new Date().getFullYear());
  const [loading, setLoading] = useState(true);
  const [entradas, setEntradas] = useState<EntradaLCDPR[]>([]);
  const [saldoInicial, setSaldoInicial] = useState(0);
  const [modalManual, setModalManual] = useState(false);
  const [fManual, setFManual] = useState({ data: hoje(), historico: "", doc: "", cpf_cnpj: "", codigo: "101", valor: "", tipo: "receita" as "receita" | "despesa" });

  useEffect(() => {
    if (!fazendaId) return;
    setLoading(true);
    listarLancamentos(fazendaId).then(lans => {
      const filtradas = lans.filter(l => {
        const ano = l.data_baixa?.slice(0, 4) ?? l.data_vencimento?.slice(0, 4);
        return ano === String(anoSel) && l.status === "baixado";
      });
      const items: EntradaLCDPR[] = filtradas.map(l => ({
        id: l.id,
        data: l.data_baixa ?? l.data_vencimento,
        historico: l.descricao,
        doc: l.tipo_documento_lcdpr ?? "OUTROS",
        cpf_cnpj: "",
        codigo: codigoAuto(l),
        receita: l.tipo === "receber" ? (l.valor_pago ?? l.valor) : 0,
        despesa: l.tipo === "pagar"   ? (l.valor_pago ?? l.valor) : 0,
        origem: "auto",
        lancId: l.id,
      }));
      items.sort((a, b) => a.data.localeCompare(b.data));
      setEntradas(items);
    }).finally(() => setLoading(false));
  }, [fazendaId, anoSel]);

  const adicionarManual = () => {
    const v = parseFloat(fManual.valor.replace(",", "."));
    if (!v || !fManual.historico) return;
    const nova: EntradaLCDPR = {
      id: `manual-${Date.now()}`,
      data: fManual.data,
      historico: fManual.historico,
      doc: fManual.doc || "OUTROS",
      cpf_cnpj: fManual.cpf_cnpj,
      codigo: fManual.codigo,
      receita: fManual.tipo === "receita" ? v : 0,
      despesa: fManual.tipo === "despesa" ? v : 0,
      origem: "manual",
    };
    setEntradas(prev => [...prev, nova].sort((a, b) => a.data.localeCompare(b.data)));
    setModalManual(false);
    setFManual({ data: hoje(), historico: "", doc: "", cpf_cnpj: "", codigo: "101", valor: "", tipo: "receita" });
  };

  const removerManual = (id: string) => setEntradas(prev => prev.filter(e => e.id !== id));

  // Totais com saldo acumulado
  const totalReceitas = entradas.reduce((s, e) => s + e.receita, 0);
  const totalDespesas = entradas.reduce((s, e) => s + e.despesa, 0);
  const saldoFinal    = saldoInicial + totalReceitas - totalDespesas;

  // Resumo mensal
  const meses = Array.from({ length: 12 }, (_, i) => {
    const m = String(i + 1).padStart(2, "0");
    const itens = entradas.filter(e => e.data.slice(5, 7) === m);
    return {
      mes: new Date(`${anoSel}-${m}-01`).toLocaleString("pt-BR", { month: "long" }),
      rec: itens.reduce((s, e) => s + e.receita, 0),
      desp: itens.reduce((s, e) => s + e.despesa, 0),
    };
  });

  // Resumo por código
  const porCodigo = [...CODIGOS_LCDPR.receita, ...CODIGOS_LCDPR.despesa].map(c => {
    const total = entradas.filter(e => e.codigo === c.cod).reduce((s, e) => s + e.receita + e.despesa, 0);
    return { ...c, total, tipo: c.cod.startsWith("1") ? "receita" : "despesa" };
  }).filter(c => c.total > 0);

  const anos = [2023, 2024, 2025, 2026, 2027];

  const inpS: React.CSSProperties = { width: "100%", padding: "8px 10px", border: "0.5px solid #D4DCE8", borderRadius: 8, fontSize: 13, color: "#1a1a1a", background: "#fff", boxSizing: "border-box", outline: "none" };
  const lblS: React.CSSProperties = { fontSize: 11, color: "#555", marginBottom: 4, display: "block" };

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh", background: "#F3F6F9", fontFamily: "system-ui, sans-serif", fontSize: 13 }}>
      <TopNav />
      <main style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>

        {/* Header */}
        <header style={{ background: "#fff", borderBottom: "0.5px solid #D4DCE8", padding: "10px 22px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 17, fontWeight: 600, color: "#1a1a1a" }}>LCDPR — Livro Caixa Digital do Produtor Rural</h1>
            <p style={{ margin: 0, fontSize: 11, color: "#444" }}>Obrigação acessória · Receita Federal · Instrução Normativa RFB nº 1.848/2018</p>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <select value={anoSel} onChange={e => setAnoSel(Number(e.target.value))} style={{ padding: "6px 10px", border: "0.5px solid #D4DCE8", borderRadius: 8, fontSize: 13, color: "#1a1a1a", background: "#fff", cursor: "pointer" }}>
              {anos.map(a => <option key={a} value={a}>{a}</option>)}
            </select>
            <button onClick={() => setModalManual(true)} style={{ padding: "8px 16px", background: "#C9921B", color: "#fff", border: "none", borderRadius: 8, fontWeight: 600, cursor: "pointer", fontSize: 13 }}>
              + Lançamento manual
            </button>
          </div>
        </header>

        <div style={{ padding: "16px 22px", flex: 1 }}>

          {/* Cards de resumo */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 16 }}>
            {[
              { label: "Saldo Inicial",   valor: saldoInicial,   cor: "#1a1a1a", bg: "#fff" },
              { label: "Total Receitas",  valor: totalReceitas,  cor: "#1A5C38", bg: "#EAF3DE" },
              { label: "Total Despesas",  valor: totalDespesas,  cor: "#E24B4A", bg: "#FCEBEB" },
              { label: "Saldo Final",     valor: saldoFinal,     cor: saldoFinal >= 0 ? "#1A5C38" : "#E24B4A", bg: saldoFinal >= 0 ? "#EAF3DE" : "#FCEBEB" },
            ].map((c, i) => (
              <div key={i} style={{ background: c.bg, border: "0.5px solid #D4DCE8", borderRadius: 12, padding: "14px 16px" }}>
                <div style={{ fontSize: 11, color: "#555", marginBottom: 4 }}>{c.label}</div>
                <div style={{ fontSize: 18, fontWeight: 700, color: c.cor }}>{fmtBRL(c.valor)}</div>
              </div>
            ))}
          </div>

          {/* Saldo inicial editável */}
          <div style={{ background: "#FBF3E0", border: "0.5px solid #C9921B40", borderRadius: 8, padding: "8px 14px", marginBottom: 14, display: "flex", alignItems: "center", gap: 12, fontSize: 12 }}>
            <span style={{ color: "#7A5A12" }}>⚠ Saldo inicial do ano:</span>
            <input
              type="number"
              value={saldoInicial}
              onChange={e => setSaldoInicial(Number(e.target.value))}
              style={{ padding: "4px 8px", border: "0.5px solid #C9921B", borderRadius: 6, fontSize: 12, width: 140, color: "#1a1a1a" }}
            />
            <span style={{ color: "#7A5A12" }}>Informe o saldo em caixa em 1º de janeiro de {anoSel}</span>
          </div>

          {/* Abas */}
          <div style={{ background: "#fff", border: "0.5px solid #D4DCE8", borderRadius: 12, overflow: "hidden" }}>
            <div style={{ display: "flex", borderBottom: "0.5px solid #D4DCE8" }}>
              {([["livro", "Livro Caixa"], ["resumo", "Resumo Anual"], ["exportacao", "Exportação"]] as [AbaLCDPR, string][]).map(([key, label]) => (
                <button key={key} onClick={() => setAba(key)} style={{
                  padding: "10px 20px", border: "none", background: aba === key ? "#fff" : "#F8FAFD",
                  borderBottom: aba === key ? "2px solid #1A5C38" : "2px solid transparent",
                  cursor: "pointer", fontSize: 13, fontWeight: aba === key ? 600 : 400,
                  color: aba === key ? "#1A5C38" : "#555",
                }}>
                  {label}
                </button>
              ))}
            </div>

            {/* ── ABA: LIVRO CAIXA ── */}
            {aba === "livro" && (
              <div>
                {loading ? (
                  <div style={{ padding: 32, textAlign: "center", color: "#555" }}>Carregando lançamentos...</div>
                ) : entradas.length === 0 ? (
                  <div style={{ padding: 40, textAlign: "center", color: "#555" }}>
                    <div style={{ fontSize: 28, marginBottom: 8 }}>📋</div>
                    <div style={{ fontWeight: 600, color: "#1a1a1a" }}>Nenhum lançamento baixado em {anoSel}</div>
                    <div style={{ fontSize: 12, color: "#666", marginTop: 4 }}>Os lançamentos aparecem aqui após a baixa no Financeiro, ou adicione manualmente.</div>
                  </div>
                ) : (
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead>
                      <tr style={{ background: "#F3F6F9" }}>
                        {["Data", "Cód.", "Histórico", "Documento", "CPF/CNPJ", "Receita", "Despesa", "Saldo", ""].map((h, i) => (
                          <th key={i} style={{ padding: "8px 12px", textAlign: i >= 5 ? "right" : "left", fontSize: 11, fontWeight: 600, color: "#555", borderBottom: "0.5px solid #D4DCE8", whiteSpace: "nowrap" }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {(() => {
                        let saldo = saldoInicial;
                        return entradas.map((e, i) => {
                          saldo += e.receita - e.despesa;
                          const cod = [...CODIGOS_LCDPR.receita, ...CODIGOS_LCDPR.despesa].find(c => c.cod === e.codigo);
                          return (
                            <tr key={e.id} style={{ borderBottom: i < entradas.length - 1 ? "0.5px solid #DEE5EE" : "none", background: e.origem === "manual" ? "#FFFDF5" : "transparent" }}>
                              <td style={{ padding: "8px 12px", color: "#1a1a1a", whiteSpace: "nowrap" }}>{fmtData(e.data)}</td>
                              <td style={{ padding: "8px 12px" }}>
                                <span style={{ fontSize: 10, background: e.codigo.startsWith("1") ? "#EAF3DE" : "#FCEBEB", color: e.codigo.startsWith("1") ? "#1A5C38" : "#791F1F", padding: "2px 7px", borderRadius: 6, fontWeight: 600 }}>{e.codigo}</span>
                              </td>
                              <td style={{ padding: "8px 12px", color: "#1a1a1a", maxWidth: 260 }}>
                                <div style={{ fontWeight: 500 }}>{e.historico}</div>
                                {cod && <div style={{ fontSize: 10, color: "#666" }}>{cod.desc}</div>}
                              </td>
                              <td style={{ padding: "8px 12px", color: "#1a1a1a", fontSize: 11 }}>{e.doc}</td>
                              <td style={{ padding: "8px 12px", color: "#555", fontSize: 11 }}>{e.cpf_cnpj || "—"}</td>
                              <td style={{ padding: "8px 12px", textAlign: "right", color: e.receita > 0 ? "#1A5C38" : "#aaa", fontWeight: e.receita > 0 ? 600 : 400 }}>{e.receita > 0 ? fmtBRL(e.receita) : "—"}</td>
                              <td style={{ padding: "8px 12px", textAlign: "right", color: e.despesa > 0 ? "#E24B4A" : "#aaa", fontWeight: e.despesa > 0 ? 600 : 400 }}>{e.despesa > 0 ? fmtBRL(e.despesa) : "—"}</td>
                              <td style={{ padding: "8px 12px", textAlign: "right", fontWeight: 600, color: saldo >= 0 ? "#1a1a1a" : "#E24B4A" }}>{fmtBRL(saldo)}</td>
                              <td style={{ padding: "8px 12px" }}>
                                {e.origem === "manual" && (
                                  <button onClick={() => removerManual(e.id)} style={{ fontSize: 11, padding: "2px 7px", borderRadius: 6, border: "0.5px solid #E24B4A50", background: "#FCEBEB", color: "#791F1F", cursor: "pointer" }}>✕</button>
                                )}
                              </td>
                            </tr>
                          );
                        });
                      })()}
                    </tbody>
                    <tfoot>
                      <tr style={{ background: "#F3F6F9", borderTop: "1px solid #D4DCE8" }}>
                        <td colSpan={5} style={{ padding: "10px 12px", fontWeight: 700, color: "#1a1a1a" }}>TOTAL {anoSel}</td>
                        <td style={{ padding: "10px 12px", textAlign: "right", fontWeight: 700, color: "#1A5C38" }}>{fmtBRL(totalReceitas)}</td>
                        <td style={{ padding: "10px 12px", textAlign: "right", fontWeight: 700, color: "#E24B4A" }}>{fmtBRL(totalDespesas)}</td>
                        <td style={{ padding: "10px 12px", textAlign: "right", fontWeight: 700, color: saldoFinal >= 0 ? "#1A5C38" : "#E24B4A" }}>{fmtBRL(saldoFinal)}</td>
                        <td />
                      </tr>
                    </tfoot>
                  </table>
                )}
              </div>
            )}

            {/* ── ABA: RESUMO ANUAL ── */}
            {aba === "resumo" && (
              <div style={{ padding: 20 }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>

                  {/* Resumo mensal */}
                  <div>
                    <div style={{ fontWeight: 600, color: "#1a1a1a", marginBottom: 12 }}>Movimentação mensal — {anoSel}</div>
                    <table style={{ width: "100%", borderCollapse: "collapse" }}>
                      <thead>
                        <tr style={{ background: "#F3F6F9" }}>
                          {["Mês", "Receitas", "Despesas", "Resultado"].map((h, i) => (
                            <th key={i} style={{ padding: "7px 10px", textAlign: i === 0 ? "left" : "right", fontSize: 11, fontWeight: 600, color: "#555", borderBottom: "0.5px solid #D4DCE8" }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {meses.map((m, i) => {
                          const res = m.rec - m.desp;
                          const temDados = m.rec > 0 || m.desp > 0;
                          return (
                            <tr key={i} style={{ borderBottom: "0.5px solid #DEE5EE", opacity: temDados ? 1 : 0.4 }}>
                              <td style={{ padding: "7px 10px", color: "#1a1a1a", textTransform: "capitalize" }}>{m.mes}</td>
                              <td style={{ padding: "7px 10px", textAlign: "right", color: "#1A5C38", fontWeight: m.rec > 0 ? 600 : 400 }}>{m.rec > 0 ? fmtBRL(m.rec) : "—"}</td>
                              <td style={{ padding: "7px 10px", textAlign: "right", color: "#E24B4A", fontWeight: m.desp > 0 ? 600 : 400 }}>{m.desp > 0 ? fmtBRL(m.desp) : "—"}</td>
                              <td style={{ padding: "7px 10px", textAlign: "right", fontWeight: temDados ? 600 : 400, color: res >= 0 ? "#1A5C38" : "#E24B4A" }}>{temDados ? fmtBRL(res) : "—"}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  {/* Resumo por código */}
                  <div>
                    <div style={{ fontWeight: 600, color: "#1a1a1a", marginBottom: 12 }}>Por código LCDPR</div>
                    {porCodigo.length === 0 ? (
                      <div style={{ color: "#888", fontSize: 12 }}>Sem lançamentos no período.</div>
                    ) : (
                      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                        {porCodigo.map(c => (
                          <div key={c.cod} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", background: "#F8FAFD", borderRadius: 8, border: "0.5px solid #DEE5EE" }}>
                            <span style={{ fontSize: 11, background: c.tipo === "receita" ? "#EAF3DE" : "#FCEBEB", color: c.tipo === "receita" ? "#1A5C38" : "#791F1F", padding: "2px 7px", borderRadius: 6, fontWeight: 600, flexShrink: 0 }}>{c.cod}</span>
                            <span style={{ flex: 1, fontSize: 12, color: "#1a1a1a" }}>{c.desc}</span>
                            <span style={{ fontWeight: 700, color: c.tipo === "receita" ? "#1A5C38" : "#E24B4A", fontSize: 13 }}>{fmtBRL(c.total)}</span>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Resultado apurado */}
                    <div style={{ marginTop: 16, background: "#F3F6F9", borderRadius: 10, padding: "14px 16px", border: "0.5px solid #D4DCE8" }}>
                      <div style={{ fontSize: 11, color: "#555", marginBottom: 8 }}>Resultado apurado {anoSel}</div>
                      {[
                        { label: "(+) Total Receitas",     valor: totalReceitas,  cor: "#1A5C38" },
                        { label: "(-) Total Despesas",     valor: -totalDespesas, cor: "#E24B4A" },
                        { label: "(=) Resultado Líquido",  valor: totalReceitas - totalDespesas, cor: (totalReceitas - totalDespesas) >= 0 ? "#1A5C38" : "#E24B4A", bold: true },
                      ].map((l, i) => (
                        <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "5px 0", borderBottom: i < 2 ? "0.5px solid #DEE5EE" : "none" }}>
                          <span style={{ fontSize: 12, color: "#555" }}>{l.label}</span>
                          <span style={{ fontWeight: l.bold ? 700 : 500, color: l.cor, fontSize: l.bold ? 14 : 12 }}>{fmtBRL(Math.abs(l.valor))}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* ── ABA: EXPORTAÇÃO ── */}
            {aba === "exportacao" && (
              <div style={{ padding: 28 }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>

                  <div>
                    <div style={{ fontWeight: 600, color: "#1a1a1a", marginBottom: 12 }}>Arquivo LCDPR para entrega à Receita Federal</div>
                    <div style={{ fontSize: 12, color: "#555", lineHeight: 1.8, marginBottom: 20 }}>
                      O LCDPR deve ser entregue anualmente até <strong>30 de junho</strong> do ano seguinte ao período de apuração, através do programa <strong>ReceitaNet</strong> ou via portal e-CAC.
                    </div>

                    {[
                      { label: "Prazo de entrega",       val: `30/06/${anoSel + 1}` },
                      { label: "Programa",               val: "LCDPR (Receita Federal)" },
                      { label: "Período apurado",        val: `01/01/${anoSel} a 31/12/${anoSel}` },
                      { label: "Lançamentos no período", val: `${entradas.length} registros` },
                      { label: "Total receitas",         val: fmtBRL(totalReceitas) },
                      { label: "Total despesas",         val: fmtBRL(totalDespesas) },
                    ].map((r, i) => (
                      <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "7px 0", borderBottom: "0.5px solid #DEE5EE" }}>
                        <span style={{ fontSize: 12, color: "#555" }}>{r.label}</span>
                        <span style={{ fontSize: 12, fontWeight: 600, color: "#1a1a1a" }}>{r.val}</span>
                      </div>
                    ))}

                    <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
                      <button
                        onClick={() => {
                          let csv = "DATA;CODIGO;HISTORICO;DOCUMENTO;CPF_CNPJ;RECEITA;DESPESA\n";
                          entradas.forEach(e => {
                            csv += `${e.data};${e.codigo};"${e.historico}";${e.doc};${e.cpf_cnpj};${e.receita.toFixed(2)};${e.despesa.toFixed(2)}\n`;
                          });
                          const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
                          const url = URL.createObjectURL(blob);
                          const a = document.createElement("a"); a.href = url;
                          a.download = `LCDPR_${anoSel}.csv`; a.click();
                        }}
                        style={{ padding: "10px 20px", background: "#1A5C38", color: "#fff", border: "none", borderRadius: 8, fontWeight: 600, cursor: "pointer", fontSize: 13 }}
                      >
                        ⬇ Exportar CSV
                      </button>
                    </div>
                  </div>

                  <div style={{ background: "#F8FAFD", border: "0.5px solid #D4DCE8", borderRadius: 12, padding: "18px 20px" }}>
                    <div style={{ fontWeight: 600, color: "#1a1a1a", marginBottom: 14 }}>Quem é obrigado a entregar?</div>
                    {[
                      "Produtor rural Pessoa Física",
                      "Receita bruta rural acima de R$ 56.112,00 no ano",
                      "Ou que tenha optado pela escrituração pelo Livro Caixa",
                      "Cônjuge que exerce atividade rural em separado",
                    ].map((t, i) => (
                      <div key={i} style={{ display: "flex", gap: 8, marginBottom: 8, fontSize: 12 }}>
                        <span style={{ color: "#1A5C38", flexShrink: 0 }}>✓</span>
                        <span style={{ color: "#444" }}>{t}</span>
                      </div>
                    ))}

                    <div style={{ borderTop: "0.5px solid #D4DCE8", marginTop: 14, paddingTop: 14 }}>
                      <div style={{ fontWeight: 600, color: "#1a1a1a", marginBottom: 10 }}>Categorias obrigatórias no LCDPR</div>
                      {[...CODIGOS_LCDPR.receita, ...CODIGOS_LCDPR.despesa].map(c => (
                        <div key={c.cod} style={{ display: "flex", gap: 8, marginBottom: 5, fontSize: 11 }}>
                          <span style={{ fontWeight: 700, color: c.cod.startsWith("1") ? "#1A5C38" : "#E24B4A", flexShrink: 0, width: 28 }}>{c.cod}</span>
                          <span style={{ color: "#444" }}>{c.desc}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Modal lançamento manual */}
      {modalManual && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }}>
          <div style={{ background: "#fff", borderRadius: 14, padding: 28, width: 460, boxShadow: "0 8px 40px rgba(0,0,0,0.18)" }}>
            <div style={{ fontWeight: 600, fontSize: 15, color: "#1a1a1a", marginBottom: 20 }}>Lançamento Manual LCDPR</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
              <div>
                <label style={lblS}>Data *</label>
                <input style={inpS} type="date" value={fManual.data} onChange={e => setFManual(p => ({ ...p, data: e.target.value }))} />
              </div>
              <div>
                <label style={lblS}>Tipo *</label>
                <select style={inpS} value={fManual.tipo} onChange={e => setFManual(p => ({ ...p, tipo: e.target.value as "receita"|"despesa", codigo: e.target.value === "receita" ? "101" : "201" }))}>
                  <option value="receita">Receita</option>
                  <option value="despesa">Despesa</option>
                </select>
              </div>
              <div style={{ gridColumn: "1/-1" }}>
                <label style={lblS}>Histórico *</label>
                <input style={inpS} value={fManual.historico} onChange={e => setFManual(p => ({ ...p, historico: e.target.value }))} placeholder="Descrição do lançamento" />
              </div>
              <div>
                <label style={lblS}>Código LCDPR *</label>
                <select style={inpS} value={fManual.codigo} onChange={e => setFManual(p => ({ ...p, codigo: e.target.value }))}>
                  {(fManual.tipo === "receita" ? CODIGOS_LCDPR.receita : CODIGOS_LCDPR.despesa).map(c => (
                    <option key={c.cod} value={c.cod}>{c.cod} — {c.desc}</option>
                  ))}
                </select>
              </div>
              <div>
                <label style={lblS}>Valor R$ *</label>
                <input style={inpS} type="number" step="0.01" value={fManual.valor} onChange={e => setFManual(p => ({ ...p, valor: e.target.value }))} placeholder="0,00" />
              </div>
              <div>
                <label style={lblS}>Documento</label>
                <input style={inpS} value={fManual.doc} onChange={e => setFManual(p => ({ ...p, doc: e.target.value }))} placeholder="NF, Recibo, PIX..." />
              </div>
              <div>
                <label style={lblS}>CPF / CNPJ da contraparte</label>
                <input style={inpS} value={fManual.cpf_cnpj} onChange={e => setFManual(p => ({ ...p, cpf_cnpj: e.target.value }))} placeholder="000.000.000-00" />
              </div>
            </div>
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 20 }}>
              <button onClick={() => setModalManual(false)} style={{ padding: "8px 18px", border: "0.5px solid #D4DCE8", borderRadius: 8, background: "#fff", cursor: "pointer", fontSize: 13, color: "#1a1a1a" }}>Cancelar</button>
              <button onClick={adicionarManual} style={{ padding: "8px 18px", background: "#1A5C38", color: "#fff", border: "none", borderRadius: 8, fontWeight: 600, cursor: "pointer", fontSize: 13 }}>Adicionar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
