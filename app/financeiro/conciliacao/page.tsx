"use client";
import React, { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "../../../lib/supabase";
import { useAuth } from "../../../components/AuthProvider";
import TopNav from "../../../components/TopNav";

// ─── Tipos ────────────────────────────────────────────────────────────────────
interface ContaBancaria { id: string; nome: string; banco: string; agencia?: string; conta?: string }

interface LinhaOFX {
  id: string;          // FITID do OFX
  data: string;        // DTPOSTED → YYYY-MM-DD
  descricao: string;   // MEMO / NAME
  valor: number;       // positivo = crédito, negativo = débito
  tipo: "credito" | "debito";
  conciliado: boolean;
  lancamento_id?: string;
  lancamento_desc?: string;
  lancamento_valor?: number;
}

interface Lancamento {
  id: string;
  tipo: "receber" | "pagar";
  descricao: string;
  valor: number;
  valor_pago?: number;
  data_vencimento: string;
  data_baixa?: string;
  status: string;
  categoria?: string;
}

interface Extrato {
  id: string;
  conta_id: string;
  conta_nome: string;
  data_importacao: string;
  data_inicio: string;
  data_fim: string;
  total_linhas: number;
  conciliados: number;
  pendentes: number;
  linhas: LinhaOFX[];
}

// ─── Parse OFX ────────────────────────────────────────────────────────────────
function parseOFX(texto: string): LinhaOFX[] {
  const linhas: LinhaOFX[] = [];
  // Suporte a OFX SGML (legado) e OFX XML
  const transacoes = texto.split(/<STMTTRN>/i).slice(1);
  for (const t of transacoes) {
    const get = (tag: string) => {
      const m = t.match(new RegExp(`<${tag}>([^<\r\n]+)`, "i"));
      return m ? m[1].trim() : "";
    };
    const fitid = get("FITID");
    const dtPosted = get("DTPOSTED");
    const trnAmt = parseFloat(get("TRNAMT").replace(",", "."));
    const memo = get("MEMO") || get("NAME") || "(sem descrição)";

    if (!fitid || isNaN(trnAmt)) continue;

    // DTPOSTED: 20240115120000 → 2024-01-15
    const data = dtPosted.length >= 8
      ? `${dtPosted.slice(0, 4)}-${dtPosted.slice(4, 6)}-${dtPosted.slice(6, 8)}`
      : "";

    linhas.push({
      id: fitid,
      data,
      descricao: memo,
      valor: Math.abs(trnAmt),
      tipo: trnAmt > 0 ? "credito" : "debito",
      conciliado: false,
    });
  }
  return linhas.sort((a, b) => a.data.localeCompare(b.data));
}

// ─── Auto-match ───────────────────────────────────────────────────────────────
// Tenta casar linha OFX com um lançamento pelo valor e data próxima (±7 dias)
function autoMatch(linhas: LinhaOFX[], lancamentos: Lancamento[]): LinhaOFX[] {
  return linhas.map(linha => {
    if (linha.conciliado) return linha;
    const dataLinha = new Date(linha.data + "T00:00:00");
    const candidatos = lancamentos.filter(l => {
      const valorLanc = l.valor_pago ?? l.valor;
      if (Math.abs(valorLanc - linha.valor) > 0.02) return false;
      // Tipo: crédito = CR, débito = CP
      if (linha.tipo === "credito" && l.tipo !== "receber") return false;
      if (linha.tipo === "debito"  && l.tipo !== "pagar")   return false;
      // Data: ±7 dias da baixa ou vencimento
      const dataRef = new Date(((l.data_baixa ?? l.data_vencimento) + "T00:00:00"));
      const diff = Math.abs((dataLinha.getTime() - dataRef.getTime()) / 86400000);
      return diff <= 7;
    });
    if (candidatos.length === 1) {
      return { ...linha, conciliado: true, lancamento_id: candidatos[0].id, lancamento_desc: candidatos[0].descricao, lancamento_valor: candidatos[0].valor_pago ?? candidatos[0].valor };
    }
    return linha;
  });
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
const fmtBRL = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fmtDt  = (s?: string) => s ? s.split("-").reverse().join("/") : "—";
const hoje   = () => new Date().toISOString().slice(0, 10);

// ─── Componente ───────────────────────────────────────────────────────────────
export default function Conciliacao() {
  const { fazendaId } = useAuth();
  const inputRef = useRef<HTMLInputElement>(null);

  const [contas, setContas]             = useState<ContaBancaria[]>([]);
  const [lancamentos, setLancamentos]   = useState<Lancamento[]>([]);
  const [extratos, setExtratos]         = useState<Extrato[]>([]);
  const [extrato, setExtrato]           = useState<Extrato | null>(null);  // extrato ativo
  const [loading, setLoading]           = useState(false);

  const [contaSel, setContaSel]         = useState<string>("");
  const [filtroPend, setFiltroPend]     = useState(false);
  const [busca, setBusca]               = useState("");

  const [modalVincular, setModalVincular] = useState<LinhaOFX | null>(null);
  const [lancSel, setLancSel]             = useState<string>("");

  // ── Carregar dados ────────────────────────────────────────────────────────
  const carregar = useCallback(async () => {
    if (!fazendaId) return;
    const [cR, lR] = await Promise.all([
      supabase.from("contas_bancarias").select("id,nome,banco,agencia,conta").eq("fazenda_id", fazendaId).order("nome"),
      supabase.from("lancamentos").select("id,tipo,descricao,valor,valor_pago,data_vencimento,data_baixa,status,categoria")
        .eq("fazenda_id", fazendaId)
        .in("status", ["aberto","vencido","baixado"])
        .order("data_vencimento", { ascending: false }),
    ]);
    if (cR.data) setContas(cR.data as ContaBancaria[]);
    if (lR.data) setLancamentos(lR.data as Lancamento[]);

    // Extratos salvos no Supabase
    const { data: exR } = await supabase
      .from("extratos_bancarios")
      .select("*")
      .eq("fazenda_id", fazendaId)
      .order("data_importacao", { ascending: false });
    if (exR) setExtratos(exR as unknown as Extrato[]);
  }, [fazendaId]);

  useEffect(() => { carregar(); }, [carregar]);

  // ── Upload OFX ───────────────────────────────────────────────────────────
  async function handleOFX(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !fazendaId) return;
    setLoading(true);
    const texto = await file.text();
    let linhas = parseOFX(texto);
    if (linhas.length === 0) {
      alert("Nenhuma transação encontrada no arquivo OFX. Verifique o formato do arquivo.");
      setLoading(false);
      return;
    }
    // Auto-conciliação
    linhas = autoMatch(linhas, lancamentos);

    const dataInicio = linhas[0]?.data ?? hoje();
    const dataFim    = linhas[linhas.length - 1]?.data ?? hoje();
    const conciliadoN = linhas.filter(l => l.conciliado).length;
    const contaObj = contas.find(c => c.id === contaSel);

    const novoExtrato: Extrato = {
      id: `ext-${Date.now()}`,
      conta_id: contaSel,
      conta_nome: contaObj?.nome ?? contaSel,
      data_importacao: hoje(),
      data_inicio: dataInicio,
      data_fim: dataFim,
      total_linhas: linhas.length,
      conciliados: conciliadoN,
      pendentes: linhas.length - conciliadoN,
      linhas,
    };

    // Persiste no Supabase
    await supabase.from("extratos_bancarios").insert({
      id: novoExtrato.id,
      fazenda_id: fazendaId,
      conta_id: contaSel || null,
      conta_nome: novoExtrato.conta_nome,
      data_importacao: novoExtrato.data_importacao,
      data_inicio: dataInicio,
      data_fim: dataFim,
      total_linhas: linhas.length,
      conciliados: conciliadoN,
      pendentes: linhas.length - conciliadoN,
      linhas: linhas,
    });

    setExtrato(novoExtrato);
    setExtratos(prev => [novoExtrato, ...prev]);
    setLoading(false);
    if (inputRef.current) inputRef.current.value = "";
  }

  // ── Vincular manualmente ──────────────────────────────────────────────────
  function confirmarVinculo() {
    if (!modalVincular || !lancSel || !extrato) return;
    const lanc = lancamentos.find(l => l.id === lancSel);
    if (!lanc) return;
    const linhas = extrato.linhas.map(l =>
      l.id === modalVincular.id
        ? { ...l, conciliado: true, lancamento_id: lanc.id, lancamento_desc: lanc.descricao, lancamento_valor: lanc.valor_pago ?? lanc.valor }
        : l
    );
    const conciliadoN = linhas.filter(l => l.conciliado).length;
    setExtrato({ ...extrato, linhas, conciliados: conciliadoN, pendentes: linhas.length - conciliadoN });
    setModalVincular(null);
    setLancSel("");
    // Atualiza no Supabase
    supabase.from("extratos_bancarios").update({ linhas, conciliados: conciliadoN, pendentes: linhas.length - conciliadoN }).eq("id", extrato.id);
  }

  // ── Desvincular ───────────────────────────────────────────────────────────
  function desvincular(linhaId: string) {
    if (!extrato) return;
    const linhas = extrato.linhas.map(l =>
      l.id === linhaId ? { ...l, conciliado: false, lancamento_id: undefined, lancamento_desc: undefined, lancamento_valor: undefined } : l
    );
    const conciliadoN = linhas.filter(l => l.conciliado).length;
    setExtrato({ ...extrato, linhas, conciliados: conciliadoN, pendentes: linhas.length - conciliadoN });
    supabase.from("extratos_bancarios").update({ linhas, conciliados: conciliadoN, pendentes: linhas.length - conciliadoN }).eq("id", extrato.id);
  }

  // ── Filtros ───────────────────────────────────────────────────────────────
  const linhasFiltradas = (extrato?.linhas ?? []).filter(l => {
    if (filtroPend && l.conciliado) return false;
    if (busca) {
      const q = busca.toLowerCase();
      if (!l.descricao.toLowerCase().includes(q) && !l.id.toLowerCase().includes(q)) return false;
    }
    return true;
  });

  const totalCreditos  = (extrato?.linhas ?? []).filter(l => l.tipo === "credito").reduce((s, l) => s + l.valor, 0);
  const totalDebitos   = (extrato?.linhas ?? []).filter(l => l.tipo === "debito").reduce((s, l) => s + l.valor, 0);
  const saldo          = totalCreditos - totalDebitos;
  const pctConciliado  = extrato ? Math.round((extrato.conciliados / extrato.total_linhas) * 100) : 0;

  // ─── Layout ───────────────────────────────────────────────────────────────
  const modalStyle: React.CSSProperties = {
    position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)",
    display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000,
  };

  return (
    <div style={{ fontFamily: "system-ui, sans-serif", minHeight: "100vh", background: "#F4F6FA" }}>
      <TopNav />
      <div style={{ maxWidth: 1200, margin: "0 auto", padding: "28px 24px" }}>

        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24 }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 600, color: "#888", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 4 }}>Financeiro</div>
            <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: "#1a1a1a" }}>Conciliação Bancária</h1>
            <p style={{ margin: "4px 0 0", fontSize: 13, color: "#666" }}>
              Importe o extrato OFX do seu banco — o sistema concilia automaticamente com os lançamentos.
            </p>
          </div>
          {/* Importar OFX */}
          <div style={{ display: "flex", flexDirection: "column", gap: 8, alignItems: "flex-end" }}>
            <div style={{ display: "flex", gap: 10 }}>
              <select
                value={contaSel}
                onChange={e => setContaSel(e.target.value)}
                style={{ padding: "8px 12px", border: "0.5px solid #DDE2EE", borderRadius: 8, fontSize: 13, background: "#fff", outline: "none" }}
              >
                <option value="">— Conta bancária —</option>
                {contas.map(c => <option key={c.id} value={c.id}>{c.nome} · {c.banco}</option>)}
              </select>
              <button
                onClick={() => inputRef.current?.click()}
                disabled={loading}
                style={{ padding: "8px 20px", background: "#1A4870", color: "#fff", border: "none", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer" }}
              >
                {loading ? "Processando..." : "Importar OFX"}
              </button>
              <input ref={inputRef} type="file" accept=".ofx,.OFX" onChange={handleOFX} style={{ display: "none" }} />
            </div>
            <div style={{ fontSize: 11, color: "#888" }}>
              Suporta OFX de qualquer banco brasileiro. Automático às 8h via cron.
            </div>
          </div>
        </div>

        {/* Histórico de extratos */}
        {!extrato && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 24 }}>
            {extratos.length === 0 ? (
              <div style={{ gridColumn: "1/-1", background: "#fff", borderRadius: 12, border: "0.5px solid #DDE2EE", padding: "40px 24px", textAlign: "center", color: "#888", fontSize: 13 }}>
                <div style={{ fontSize: 36, marginBottom: 12 }}>🏦</div>
                <div style={{ fontWeight: 600, color: "#1a1a1a", marginBottom: 4 }}>Nenhum extrato importado ainda</div>
                <div style={{ fontSize: 12 }}>Selecione uma conta bancária e importe o arquivo OFX do seu banco para iniciar a conciliação.</div>
              </div>
            ) : extratos.map(e => (
              <div
                key={e.id}
                onClick={() => setExtrato(e)}
                style={{ background: "#fff", borderRadius: 12, border: "0.5px solid #DDE2EE", padding: "16px 18px", cursor: "pointer", transition: "box-shadow 0.15s" }}
                onMouseEnter={el => (el.currentTarget.style.boxShadow = "0 4px 16px rgba(0,0,0,0.1)")}
                onMouseLeave={el => (el.currentTarget.style.boxShadow = "none")}
              >
                <div style={{ fontWeight: 700, fontSize: 14, color: "#1a1a1a", marginBottom: 2 }}>{e.conta_nome}</div>
                <div style={{ fontSize: 11, color: "#888", marginBottom: 12 }}>
                  {fmtDt(e.data_inicio)} a {fmtDt(e.data_fim)} · Importado {fmtDt(e.data_importacao)}
                </div>
                <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
                  <span style={{ padding: "2px 8px", borderRadius: 10, fontSize: 11, background: "#DCFCE7", color: "#16A34A", fontWeight: 600 }}>{e.conciliados} conciliados</span>
                  {e.pendentes > 0 && <span style={{ padding: "2px 8px", borderRadius: 10, fontSize: 11, background: "#FEF3C7", color: "#92400E", fontWeight: 600 }}>{e.pendentes} pendentes</span>}
                </div>
                <div style={{ height: 6, background: "#EEF1F6", borderRadius: 3, overflow: "hidden" }}>
                  <div style={{ width: `${Math.round(e.conciliados / e.total_linhas * 100)}%`, height: "100%", background: "#16A34A", borderRadius: 3 }} />
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Extrato ativo */}
        {extrato && (
          <div>
            {/* Cabeçalho do extrato */}
            <div style={{ background: "#fff", borderRadius: 12, border: "0.5px solid #DDE2EE", padding: "16px 20px", marginBottom: 16 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <button onClick={() => setExtrato(null)} style={{ background: "none", border: "none", cursor: "pointer", color: "#888", fontSize: 18, padding: 0 }}>←</button>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 15, color: "#1a1a1a" }}>{extrato.conta_nome}</div>
                    <div style={{ fontSize: 12, color: "#666" }}>
                      {fmtDt(extrato.data_inicio)} até {fmtDt(extrato.data_fim)} · {extrato.total_linhas} transações
                    </div>
                  </div>
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <div style={{ textAlign: "center", padding: "6px 14px", background: "#DCFCE7", borderRadius: 8 }}>
                    <div style={{ fontWeight: 700, color: "#16A34A", fontSize: 15 }}>{extrato.conciliados}</div>
                    <div style={{ fontSize: 10, color: "#16A34A" }}>conciliados</div>
                  </div>
                  <div style={{ textAlign: "center", padding: "6px 14px", background: "#FEF3C7", borderRadius: 8 }}>
                    <div style={{ fontWeight: 700, color: "#92400E", fontSize: 15 }}>{extrato.pendentes}</div>
                    <div style={{ fontSize: 10, color: "#92400E" }}>pendentes</div>
                  </div>
                  <div style={{ textAlign: "center", padding: "6px 14px", background: "#F4F6FA", borderRadius: 8 }}>
                    <div style={{ fontWeight: 700, color: "#1a1a1a", fontSize: 15 }}>{pctConciliado}%</div>
                    <div style={{ fontSize: 10, color: "#888" }}>conciliado</div>
                  </div>
                </div>
              </div>

              {/* Barra de progresso */}
              <div style={{ height: 8, background: "#EEF1F6", borderRadius: 4, overflow: "hidden", marginBottom: 14 }}>
                <div style={{ width: `${pctConciliado}%`, height: "100%", background: pctConciliado === 100 ? "#16A34A" : "#1A4870", borderRadius: 4, transition: "width 0.3s" }} />
              </div>

              {/* Totais */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
                {[
                  { label: "Total Créditos",  valor: totalCreditos, cor: "#16A34A" },
                  { label: "Total Débitos",   valor: totalDebitos,  cor: "#E24B4A" },
                  { label: "Saldo do Período", valor: saldo,        cor: saldo >= 0 ? "#1A4870" : "#E24B4A" },
                ].map(k => (
                  <div key={k.label} style={{ background: "#F4F6FA", borderRadius: 8, padding: "10px 14px" }}>
                    <div style={{ fontSize: 11, color: "#888", marginBottom: 2 }}>{k.label}</div>
                    <div style={{ fontSize: 16, fontWeight: 700, color: k.cor }}>{fmtBRL(k.valor)}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Filtros */}
            <div style={{ display: "flex", gap: 10, marginBottom: 12, alignItems: "center" }}>
              <input
                placeholder="Buscar por descrição ou FITID..."
                value={busca}
                onChange={e => setBusca(e.target.value)}
                style={{ padding: "7px 12px", borderRadius: 7, border: "0.5px solid #DDE2EE", fontSize: 13, width: 320, outline: "none" }}
              />
              <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, cursor: "pointer", color: "#555" }}>
                <input type="checkbox" checked={filtroPend} onChange={e => setFiltroPend(e.target.checked)} />
                Mostrar apenas pendentes
              </label>
              <div style={{ marginLeft: "auto", fontSize: 12, color: "#888" }}>
                {linhasFiltradas.length} de {extrato.total_linhas} transações
              </div>
            </div>

            {/* Tabela de transações */}
            <div style={{ background: "#fff", borderRadius: 12, border: "0.5px solid #DDE2EE", overflow: "hidden" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr style={{ background: "#F4F6FA" }}>
                    {["Data","Descrição no Extrato","Valor","Situação","Lançamento Vinculado",""].map(h => (
                      <th key={h} style={{ padding: "9px 14px", textAlign: "left", fontWeight: 600, fontSize: 11, color: "#666", borderBottom: "0.5px solid #DDE2EE", whiteSpace: "nowrap" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {linhasFiltradas.map((l, i) => (
                    <tr key={l.id} style={{ borderBottom: i < linhasFiltradas.length - 1 ? "0.5px solid #EEF1F6" : "none", background: l.conciliado ? "transparent" : "#FFFEF5" }}>
                      <td style={{ padding: "10px 14px", color: "#555", whiteSpace: "nowrap" }}>{fmtDt(l.data)}</td>
                      <td style={{ padding: "10px 14px" }}>
                        <div style={{ fontWeight: 500, color: "#1a1a1a", maxWidth: 280, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{l.descricao}</div>
                        <div style={{ fontSize: 10, color: "#aaa", fontFamily: "monospace" }}>{l.id}</div>
                      </td>
                      <td style={{ padding: "10px 14px", whiteSpace: "nowrap" }}>
                        <span style={{ fontWeight: 700, color: l.tipo === "credito" ? "#16A34A" : "#E24B4A" }}>
                          {l.tipo === "credito" ? "+" : "-"}{fmtBRL(l.valor)}
                        </span>
                        <div style={{ fontSize: 10, color: "#888" }}>{l.tipo === "credito" ? "Crédito" : "Débito"}</div>
                      </td>
                      <td style={{ padding: "10px 14px" }}>
                        {l.conciliado ? (
                          <span style={{ padding: "3px 10px", borderRadius: 10, fontSize: 11, fontWeight: 600, background: "#DCFCE7", color: "#16A34A" }}>
                            Conciliado
                          </span>
                        ) : (
                          <span style={{ padding: "3px 10px", borderRadius: 10, fontSize: 11, fontWeight: 600, background: "#FEF3C7", color: "#92400E" }}>
                            Pendente
                          </span>
                        )}
                      </td>
                      <td style={{ padding: "10px 14px" }}>
                        {l.conciliado && l.lancamento_desc ? (
                          <div>
                            <div style={{ fontSize: 12, fontWeight: 500, color: "#1a1a1a", maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{l.lancamento_desc}</div>
                            {l.lancamento_valor != null && (
                              <div style={{ fontSize: 11, color: "#888" }}>{fmtBRL(l.lancamento_valor)}</div>
                            )}
                          </div>
                        ) : (
                          <span style={{ color: "#aaa", fontSize: 12 }}>—</span>
                        )}
                      </td>
                      <td style={{ padding: "10px 14px" }}>
                        {l.conciliado ? (
                          <button onClick={() => desvincular(l.id)}
                            style={{ padding: "3px 9px", borderRadius: 6, border: "0.5px solid #DDE2EE", background: "#fff", color: "#888", fontSize: 11, cursor: "pointer" }}>
                            Desvincular
                          </button>
                        ) : (
                          <button onClick={() => { setModalVincular(l); setLancSel(""); }}
                            style={{ padding: "3px 9px", borderRadius: 6, border: "0.5px solid #C9921B", background: "#FBF3E0", color: "#C9921B", fontSize: 11, fontWeight: 600, cursor: "pointer" }}>
                            Vincular
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                  {linhasFiltradas.length === 0 && (
                    <tr><td colSpan={6} style={{ padding: "32px", textAlign: "center", color: "#888", fontSize: 13 }}>Nenhuma transação encontrada com os filtros aplicados.</td></tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Resumo por categoria dos pendentes */}
            {extrato.pendentes > 0 && (
              <div style={{ marginTop: 16, background: "#FBF3E0", border: "0.5px solid #C9921B", borderRadius: 10, padding: "14px 18px" }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: "#7A5A12", marginBottom: 6 }}>
                  {extrato.pendentes} transações pendentes de conciliação
                </div>
                <div style={{ fontSize: 12, color: "#7A5A12" }}>
                  Clique em "Vincular" para associar manualmente cada transação ao lançamento correspondente no sistema.
                  Transações sem correspondência (ex: transferências entre contas) podem ser ignoradas ou marcadas como lançamentos avulsos.
                </div>
              </div>
            )}

            {pctConciliado === 100 && (
              <div style={{ marginTop: 16, background: "#DCFCE7", border: "0.5px solid #16A34A", borderRadius: 10, padding: "14px 18px", display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{ fontSize: 22 }}>✔</div>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "#14532D" }}>Extrato 100% conciliado</div>
                  <div style={{ fontSize: 12, color: "#166534" }}>Todas as transações do período foram associadas a lançamentos do sistema.</div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ═══════════════════════════════════════════════════════════════════════
          Modal Vincular manualmente
      ══════════════════════════════════════════════════════════════════════ */}
      {modalVincular && (
        <div style={modalStyle} onClick={e => { if (e.target === e.currentTarget) setModalVincular(null); }}>
          <div style={{ background: "#fff", borderRadius: 12, padding: 28, width: 620, maxHeight: "85vh", overflowY: "auto", boxShadow: "0 16px 48px rgba(0,0,0,0.2)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>Vincular Transação</h3>
              <button onClick={() => setModalVincular(null)} style={{ background: "none", border: "none", fontSize: 22, cursor: "pointer", color: "#888" }}>×</button>
            </div>

            {/* Dados da transação */}
            <div style={{ background: "#F4F6FA", borderRadius: 8, padding: "12px 16px", marginBottom: 20 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#888", textTransform: "uppercase", marginBottom: 8 }}>Transação do extrato</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
                {[
                  ["Data",       fmtDt(modalVincular.data)],
                  ["Valor",      `${modalVincular.tipo === "credito" ? "+" : "-"}${fmtBRL(modalVincular.valor)}`],
                  ["Tipo",       modalVincular.tipo === "credito" ? "Crédito" : "Débito"],
                ].map(([k, v]) => (
                  <div key={k}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: "#888", textTransform: "uppercase" }}>{k}</div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: modalVincular.tipo === "credito" ? "#16A34A" : "#E24B4A" }}>{v}</div>
                  </div>
                ))}
              </div>
              <div style={{ marginTop: 8 }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: "#888", textTransform: "uppercase" }}>Descrição</div>
                <div style={{ fontSize: 13, color: "#1a1a1a" }}>{modalVincular.descricao}</div>
              </div>
            </div>

            {/* Lista de lançamentos candidatos */}
            <div style={{ fontSize: 11, fontWeight: 700, color: "#888", textTransform: "uppercase", marginBottom: 8 }}>
              Selecione o lançamento correspondente
            </div>
            <div style={{ maxHeight: 320, overflowY: "auto", border: "0.5px solid #DDE2EE", borderRadius: 8, overflow: "hidden" }}>
              {lancamentos
                .filter(l => {
                  // Mostra lançamentos do tipo compatível
                  if (modalVincular.tipo === "credito") return l.tipo === "receber";
                  if (modalVincular.tipo === "debito")  return l.tipo === "pagar";
                  return true;
                })
                .slice(0, 50)
                .map((l, i, arr) => (
                  <div
                    key={l.id}
                    onClick={() => setLancSel(l.id)}
                    style={{
                      padding: "10px 14px", cursor: "pointer",
                      borderBottom: i < arr.length - 1 ? "0.5px solid #EEF1F6" : "none",
                      background: lancSel === l.id ? "#EBF4FF" : "transparent",
                      borderLeft: lancSel === l.id ? "3px solid #1A4870" : "3px solid transparent",
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 500, color: "#1a1a1a" }}>{l.descricao}</div>
                        <div style={{ fontSize: 11, color: "#888", marginTop: 2 }}>
                          Vcto: {fmtDt(l.data_vencimento)}
                          {l.data_baixa ? ` · Baixado: ${fmtDt(l.data_baixa)}` : ""}
                          {l.categoria ? ` · ${l.categoria}` : ""}
                        </div>
                      </div>
                      <div style={{ textAlign: "right", flexShrink: 0, marginLeft: 12 }}>
                        <div style={{ fontWeight: 700, color: l.tipo === "receber" ? "#16A34A" : "#E24B4A", fontSize: 13 }}>
                          {fmtBRL(l.valor_pago ?? l.valor)}
                        </div>
                        <div style={{ fontSize: 10, padding: "1px 6px", borderRadius: 8, background: l.status === "baixado" ? "#DCFCE7" : "#FEF3C7", color: l.status === "baixado" ? "#16A34A" : "#92400E", display: "inline-block", marginTop: 2 }}>
                          {l.status}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
            </div>

            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 20 }}>
              <button onClick={() => setModalVincular(null)} style={{ padding: "8px 20px", border: "0.5px solid #DDE2EE", borderRadius: 8, background: "#fff", fontSize: 13, cursor: "pointer" }}>Cancelar</button>
              <button onClick={confirmarVinculo} disabled={!lancSel}
                style={{ padding: "8px 22px", background: lancSel ? "#1A4870" : "#ccc", color: "#fff", border: "none", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: lancSel ? "pointer" : "not-allowed" }}>
                Confirmar Vínculo
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
