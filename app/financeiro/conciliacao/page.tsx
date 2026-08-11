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
  lancamento_id?: string;   // vínculo simples
  lancamento_ids?: string[]; // bordero — vários lançamentos
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
  const transacoes = texto.split(/<STMTTRN>/i).slice(1);
  for (const t of transacoes) {
    const get = (tag: string) => {
      const m = t.match(new RegExp(`<${tag}>([^<\r\n]+)`, "i"));
      return m ? m[1].trim() : "";
    };
    const fitid  = get("FITID");
    const dtPost = get("DTPOSTED");
    const trnAmt = parseFloat(get("TRNAMT").replace(",", "."));
    const memo   = get("MEMO") || get("NAME") || "(sem descrição)";
    if (!fitid || isNaN(trnAmt)) continue;
    const data = dtPost.length >= 8
      ? `${dtPost.slice(0, 4)}-${dtPost.slice(4, 6)}-${dtPost.slice(6, 8)}`
      : "";
    linhas.push({ id: fitid, data, descricao: memo, valor: Math.abs(trnAmt), tipo: trnAmt > 0 ? "credito" : "debito", conciliado: false });
  }
  return linhas.sort((a, b) => a.data.localeCompare(b.data));
}

// ─── Auto-match ───────────────────────────────────────────────────────────────
function autoMatch(linhas: LinhaOFX[], lancamentos: Lancamento[]): LinhaOFX[] {
  return linhas.map(linha => {
    if (linha.conciliado) return linha;
    const dl = new Date(linha.data + "T00:00:00");
    const candidatos = lancamentos.filter(l => {
      const vl = l.valor_pago ?? l.valor;
      if (Math.abs(vl - linha.valor) > 0.02) return false;
      if (linha.tipo === "credito" && l.tipo !== "receber") return false;
      if (linha.tipo === "debito"  && l.tipo !== "pagar")   return false;
      const dr  = new Date(((l.data_baixa ?? l.data_vencimento) + "T00:00:00"));
      return Math.abs((dl.getTime() - dr.getTime()) / 86400000) <= 7;
    });
    if (candidatos.length === 1) {
      const c = candidatos[0];
      return { ...linha, conciliado: true, lancamento_id: c.id, lancamento_ids: [c.id], lancamento_desc: c.descricao, lancamento_valor: c.valor_pago ?? c.valor };
    }
    return linha;
  });
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
const fmtBRL = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fmtDt  = (s?: string) => s ? s.split("-").reverse().join("/") : "—";
const hoje   = () => new Date().toISOString().slice(0, 10);

// ─── Larguras iniciais das colunas OFX ───────────────────────────────────────
const COL_INIT = [80, 280, 110, 95, 230, 95];

// ─── Componente ───────────────────────────────────────────────────────────────
export default function Conciliacao() {
  const { fazendaId, fazendaIds } = useAuth();
  const inputRef = useRef<HTMLInputElement>(null);

  const [contas, setContas]           = useState<ContaBancaria[]>([]);
  const [lancamentos, setLancamentos] = useState<Lancamento[]>([]);
  const [extratos, setExtratos]       = useState<Extrato[]>([]);
  const [extrato, setExtrato]         = useState<Extrato | null>(null);
  const [loading, setLoading]         = useState(false);

  const [contaSel, setContaSel]     = useState<string>("");
  const [filtroPend, setFiltroPend] = useState(false);
  const [busca, setBusca]           = useState("");

  // Painel esquerdo (lançamentos)
  const [buscaLanc, setBuscaLanc]           = useState("");
  const [filtroLancTipo, setFiltroLancTipo] = useState<"todos"|"pagar"|"receber">("todos");

  // Vinculação (bordero)
  const [linhaAtiva, setLinhaAtiva]   = useState<LinhaOFX | null>(null);
  const [lancsSel, setLancsSel]       = useState<Set<string>>(new Set());

  // Colunas redimensionáveis
  const [colWidths, setColWidths] = useState<number[]>([...COL_INIT]);

  // ── Carregar dados ──────────────────────────────────────────────────────────
  const carregar = useCallback(async () => {
    if (!fazendaId) return;
    const [cR, lR] = await Promise.all([
      supabase.from("contas_bancarias").select("id,nome,banco,agencia,conta").in("fazenda_id", fazendaIds).order("nome"),
      supabase.from("lancamentos").select("id,tipo,descricao,valor,valor_pago,data_vencimento,data_baixa,status,categoria")
        .in("fazenda_id", fazendaIds)
        .in("status", ["aberto","vencido","baixado"])
        .order("data_vencimento", { ascending: false }),
    ]);
    if (cR.data) setContas(cR.data as ContaBancaria[]);
    if (lR.data) setLancamentos(lR.data as Lancamento[]);

    const { data: exR } = await supabase
      .from("extratos_bancarios")
      .select("*")
      .in("fazenda_id", fazendaIds)
      .order("data_importacao", { ascending: false });
    if (exR) setExtratos(exR as unknown as Extrato[]);
  }, [fazendaId, fazendaIds]);

  useEffect(() => { carregar(); }, [carregar]);

  // ── Upload OFX ─────────────────────────────────────────────────────────────
  async function handleOFX(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !fazendaId) return;
    setLoading(true);
    const texto = await file.text();
    let linhas = parseOFX(texto);
    if (linhas.length === 0) {
      alert("Nenhuma transação encontrada no arquivo OFX.");
      setLoading(false);
      return;
    }
    linhas = autoMatch(linhas, lancamentos);
    const dataInicio  = linhas[0]?.data ?? hoje();
    const dataFim     = linhas[linhas.length - 1]?.data ?? hoje();
    const conciliadoN = linhas.filter(l => l.conciliado).length;
    const contaObj    = contas.find(c => c.id === contaSel);

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

    await supabase.from("extratos_bancarios").insert({
      id: novoExtrato.id, fazenda_id: fazendaId,
      conta_id: contaSel || null, conta_nome: novoExtrato.conta_nome,
      data_importacao: novoExtrato.data_importacao,
      data_inicio: dataInicio, data_fim: dataFim,
      total_linhas: linhas.length, conciliados: conciliadoN,
      pendentes: linhas.length - conciliadoN, linhas,
    });

    const naoConc = linhas.filter(l => !l.conciliado);
    if (naoConc.length > 0) {
      await supabase.from("conciliacao_pendencias").upsert(
        naoConc.map(l => ({
          fazenda_id: fazendaId, conta_id: contaSel || null,
          conta_nome: contaObj?.nome ?? null, fitid: l.id,
          data: l.data, descricao: l.descricao, valor: l.valor,
          tipo: l.tipo, status: "pendente",
        })),
        { onConflict: "fazenda_id,fitid", ignoreDuplicates: true }
      );
    }

    setExtrato(novoExtrato);
    setExtratos(prev => [novoExtrato, ...prev]);
    setLoading(false);
    if (inputRef.current) inputRef.current.value = "";
  }

  // ── Persistir extrato atualizado ───────────────────────────────────────────
  function persistExtrato(upd: Extrato) {
    setExtrato(upd);
    setExtratos(prev => prev.map(e => e.id === upd.id ? upd : e));
    supabase.from("extratos_bancarios").update({
      linhas: upd.linhas, conciliados: upd.conciliados, pendentes: upd.pendentes,
    }).eq("id", upd.id);
  }

  // ── Confirmar vínculo (simples ou bordero) ─────────────────────────────────
  function confirmarVinculo() {
    if (!linhaAtiva || lancsSel.size === 0 || !extrato) return;
    const ids = Array.from(lancsSel);
    const primeiro = lancamentos.find(l => l.id === ids[0]);
    const descVinc = ids.length === 1 && primeiro ? primeiro.descricao : `${ids.length} lançamentos (bordero)`;
    const valorVinc = ids.reduce((s, id) => {
      const l = lancamentos.find(x => x.id === id);
      return s + (l ? (l.valor_pago ?? l.valor) : 0);
    }, 0);

    const linhas = extrato.linhas.map(l =>
      l.id === linhaAtiva.id
        ? { ...l, conciliado: true, lancamento_id: ids[0], lancamento_ids: ids, lancamento_desc: descVinc, lancamento_valor: valorVinc }
        : l
    );
    const conciliadoN = linhas.filter(l => l.conciliado).length;
    persistExtrato({ ...extrato, linhas, conciliados: conciliadoN, pendentes: linhas.length - conciliadoN });
    // Resolve pendências
    if (fazendaId) {
      supabase.from("conciliacao_pendencias").update({ status: "resolvido", lancamento_id: ids[0] })
        .eq("fazenda_id", fazendaId).eq("fitid", linhaAtiva.id);
    }
    setLinhaAtiva(null);
    setLancsSel(new Set());
  }

  // ── Desvincular ────────────────────────────────────────────────────────────
  function desvincular(linhaId: string) {
    if (!extrato) return;
    const linhas = extrato.linhas.map(l =>
      l.id === linhaId ? { ...l, conciliado: false, lancamento_id: undefined, lancamento_ids: undefined, lancamento_desc: undefined, lancamento_valor: undefined } : l
    );
    const conciliadoN = linhas.filter(l => l.conciliado).length;
    persistExtrato({ ...extrato, linhas, conciliados: conciliadoN, pendentes: linhas.length - conciliadoN });
  }

  // ── Resize colunas ─────────────────────────────────────────────────────────
  function onResizeStart(colIdx: number, startX: number, startW: number) {
    const onMove = (e: MouseEvent) => {
      const delta = e.clientX - startX;
      setColWidths(prev => {
        const next = [...prev];
        next[colIdx] = Math.max(50, startW + delta);
        return next;
      });
    };
    const onUp = () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }

  // ── Filtros ────────────────────────────────────────────────────────────────
  const linhasFiltradas = (extrato?.linhas ?? []).filter(l => {
    if (filtroPend && l.conciliado) return false;
    if (busca) {
      const q = busca.toLowerCase();
      if (!l.descricao.toLowerCase().includes(q) && !l.id.toLowerCase().includes(q)) return false;
    }
    return true;
  });

  const lancFiltrados = lancamentos.filter(l => {
    if (filtroLancTipo !== "todos" && l.tipo !== filtroLancTipo) return false;
    if (linhaAtiva) {
      if (linhaAtiva.tipo === "credito" && l.tipo !== "receber") return false;
      if (linhaAtiva.tipo === "debito"  && l.tipo !== "pagar")   return false;
    }
    if (buscaLanc) {
      const q = buscaLanc.toLowerCase();
      if (!l.descricao.toLowerCase().includes(q) && !l.categoria?.toLowerCase().includes(q)) return false;
    }
    return true;
  });

  const totalCreditos = (extrato?.linhas ?? []).filter(l => l.tipo === "credito").reduce((s, l) => s + l.valor, 0);
  const totalDebitos  = (extrato?.linhas ?? []).filter(l => l.tipo === "debito").reduce((s, l) => s + l.valor, 0);
  const saldo         = totalCreditos - totalDebitos;
  const pct           = extrato ? Math.round((extrato.conciliados / extrato.total_linhas) * 100) : 0;

  const extratosPend  = extratos.filter(e => e.pendentes > 0);

  // ─── Estilos compartilhados ────────────────────────────────────────────────
  const thStyle: React.CSSProperties = {
    padding: "8px 10px", textAlign: "left", fontWeight: 600, fontSize: 11,
    color: "#666", borderBottom: "0.5px solid var(--border)", whiteSpace: "nowrap",
    position: "relative", userSelect: "none", background: "var(--bg-page)",
  };
  const resizer: React.CSSProperties = {
    position: "absolute", right: 0, top: 0, bottom: 0, width: 5,
    cursor: "col-resize", zIndex: 1,
  };

  // ─── RENDER ───────────────────────────────────────────────────────────────
  return (
    <div style={{ fontFamily: "system-ui, sans-serif", minHeight: "100vh", background: "var(--bg-page)" }}>
      <TopNav />

      <div style={{ maxWidth: 1400, margin: "0 auto", padding: "22px 20px" }}>

        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 4 }}>Financeiro</div>
            <h1 style={{ margin: 0, fontSize: 21, fontWeight: 700, color: "var(--text-1)" }}>Conciliação Bancária</h1>
            <p style={{ margin: "3px 0 0", fontSize: 13, color: "#666" }}>
              Importe o OFX · o sistema concilia automaticamente · histórico salvo na nuvem
            </p>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6, alignItems: "flex-end" }}>
            <div style={{ display: "flex", gap: 8 }}>
              <select value={contaSel} onChange={e => setContaSel(e.target.value)}
                style={{ padding: "7px 10px", border: "0.5px solid var(--border)", borderRadius: 8, fontSize: 13, background: "var(--bg-card)", outline: "none" }}>
                <option value="">— Conta bancária —</option>
                {contas.map(c => <option key={c.id} value={c.id}>{c.nome} · {c.banco}</option>)}
              </select>
              <button onClick={() => inputRef.current?.click()} disabled={loading}
                style={{ padding: "7px 18px", background: "#111", color: "#fff", border: "none", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
                {loading ? "Processando..." : "Importar OFX"}
              </button>
              <input ref={inputRef} type="file" accept=".ofx,.OFX" onChange={handleOFX} style={{ display: "none" }} />
            </div>
            <div style={{ fontSize: 11, color: "var(--text-3)" }}>Suporta OFX de qualquer banco brasileiro</div>
          </div>
        </div>

        {/* Banner: extratos pendentes quando não há extrato ativo */}
        {!extrato && extratosPend.length > 0 && (
          <div style={{ background: "#FEF3C7", border: "0.5px solid #F59E0B", borderRadius: 10, padding: "12px 18px", marginBottom: 16, display: "flex", alignItems: "center", gap: 14 }}>
            <div style={{ fontSize: 20 }}>⏳</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#92400E" }}>
                {extratosPend.length === 1
                  ? `Conciliação em andamento — ${extratosPend[0].conta_nome} (${extratosPend[0].pendentes} pendentes)`
                  : `${extratosPend.length} extratos com conciliação pendente`}
              </div>
              <div style={{ fontSize: 12, color: "#78350F", marginTop: 2 }}>Clique no extrato abaixo para continuar de onde parou</div>
            </div>
            {extratosPend.length === 1 && (
              <button onClick={() => setExtrato(extratosPend[0])}
                style={{ padding: "7px 16px", background: "#C9921B", color: "#fff", border: "none", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
                Continuar →
              </button>
            )}
          </div>
        )}

        {/* Lista de extratos salvos */}
        {!extrato && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 10, marginBottom: 20 }}>
            {extratos.length === 0 ? (
              <div style={{ gridColumn: "1/-1", background: "var(--bg-card)", borderRadius: 12, border: "0.5px solid var(--border)", padding: "40px 24px", textAlign: "center", color: "var(--text-3)", fontSize: 13 }}>
                <div style={{ fontSize: 36, marginBottom: 10 }}>🏦</div>
                <div style={{ fontWeight: 600, color: "var(--text-1)", marginBottom: 4 }}>Nenhum extrato importado</div>
                <div style={{ fontSize: 12 }}>Selecione uma conta e importe o OFX do seu banco.</div>
              </div>
            ) : extratos.map(e => (
              <div key={e.id} onClick={() => setExtrato(e)}
                style={{ background: "var(--bg-card)", borderRadius: 10, border: `0.5px solid ${e.pendentes > 0 ? "#F59E0B" : "var(--border)"}`, padding: "14px 16px", cursor: "pointer", transition: "box-shadow 0.15s" }}
                onMouseEnter={el => (el.currentTarget.style.boxShadow = "0 4px 12px rgba(0,0,0,0.08)")}
                onMouseLeave={el => (el.currentTarget.style.boxShadow = "none")}>
                <div style={{ fontWeight: 700, fontSize: 13, color: "var(--text-1)", marginBottom: 2 }}>{e.conta_nome}</div>
                <div style={{ fontSize: 11, color: "var(--text-3)", marginBottom: 10 }}>{fmtDt(e.data_inicio)} a {fmtDt(e.data_fim)} · {fmtDt(e.data_importacao)}</div>
                <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
                  <span style={{ padding: "2px 7px", borderRadius: 8, fontSize: 11, background: "#DCFCE7", color: "#16A34A", fontWeight: 600 }}>{e.conciliados} ✓</span>
                  {e.pendentes > 0 && <span style={{ padding: "2px 7px", borderRadius: 8, fontSize: 11, background: "#FEF3C7", color: "#92400E", fontWeight: 600 }}>{e.pendentes} pend.</span>}
                </div>
                <div style={{ height: 5, background: "var(--bg-tag)", borderRadius: 3, overflow: "hidden" }}>
                  <div style={{ width: `${Math.round(e.conciliados / e.total_linhas * 100)}%`, height: "100%", background: "#16A34A", borderRadius: 3 }} />
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ═══ EXTRATO ATIVO — layout lado a lado ═══ */}
        {extrato && (
          <>
            {/* Cabeçalho do extrato */}
            <div style={{ background: "var(--bg-card)", borderRadius: 12, border: "0.5px solid var(--border)", padding: "14px 18px", marginBottom: 14 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <button onClick={() => { setExtrato(null); setLinhaAtiva(null); setLancsSel(new Set()); }}
                    style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-3)", fontSize: 18, padding: 0, lineHeight: 1 }}>←</button>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 15, color: "var(--text-1)" }}>{extrato.conta_nome}</div>
                    <div style={{ fontSize: 12, color: "#666" }}>{fmtDt(extrato.data_inicio)} até {fmtDt(extrato.data_fim)} · {extrato.total_linhas} transações</div>
                  </div>
                </div>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <div style={{ textAlign: "center", padding: "5px 12px", background: "#DCFCE7", borderRadius: 8 }}>
                    <div style={{ fontWeight: 700, color: "#16A34A", fontSize: 14 }}>{extrato.conciliados}</div>
                    <div style={{ fontSize: 10, color: "#16A34A" }}>conciliados</div>
                  </div>
                  <div style={{ textAlign: "center", padding: "5px 12px", background: "#FEF3C7", borderRadius: 8 }}>
                    <div style={{ fontWeight: 700, color: "#92400E", fontSize: 14 }}>{extrato.pendentes}</div>
                    <div style={{ fontSize: 10, color: "#92400E" }}>pendentes</div>
                  </div>
                  <div style={{ textAlign: "center", padding: "5px 12px", background: "var(--bg-page)", borderRadius: 8 }}>
                    <div style={{ fontWeight: 700, color: "var(--text-1)", fontSize: 14 }}>{pct}%</div>
                    <div style={{ fontSize: 10, color: "var(--text-3)" }}>conciliado</div>
                  </div>
                </div>
              </div>
              {/* Progress + KPIs */}
              <div style={{ height: 6, background: "var(--bg-tag)", borderRadius: 3, overflow: "hidden", marginBottom: 12 }}>
                <div style={{ width: `${pct}%`, height: "100%", background: pct === 100 ? "#16A34A" : "#1A4870", borderRadius: 3, transition: "width 0.3s" }} />
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
                {[
                  { label: "Total Créditos",   valor: totalCreditos, cor: "#16A34A" },
                  { label: "Total Débitos",     valor: totalDebitos,  cor: "#E24B4A" },
                  { label: "Saldo do Período",  valor: saldo,         cor: saldo >= 0 ? "#111" : "#E24B4A" },
                ].map(k => (
                  <div key={k.label} style={{ background: "var(--bg-page)", borderRadius: 8, padding: "8px 12px" }}>
                    <div style={{ fontSize: 11, color: "var(--text-3)", marginBottom: 2 }}>{k.label}</div>
                    <div style={{ fontSize: 15, fontWeight: 700, color: k.cor }}>{fmtBRL(k.valor)}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* ═══ DOIS PAINÉIS ═══ */}
            <div style={{ display: "grid", gridTemplateColumns: "360px 1fr", gap: 12, alignItems: "start" }}>

              {/* ─── PAINEL ESQUERDO: Lançamentos CP/CR ─────────────────── */}
              <div style={{ background: "var(--bg-card)", borderRadius: 12, border: `1.5px solid ${linhaAtiva ? "#C9921B" : "var(--border)"}`, overflow: "hidden", position: "sticky", top: 20 }}>
                <div style={{ padding: "12px 14px", borderBottom: "0.5px solid var(--border)", background: linhaAtiva ? "#FBF3E0" : "var(--bg-page)" }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: linhaAtiva ? "#7A5A12" : "var(--text-1)", marginBottom: 6 }}>
                    {linhaAtiva
                      ? `Vinculando: ${linhaAtiva.tipo === "debito" ? "−" : "+"}${fmtBRL(linhaAtiva.valor)} · ${fmtDt(linhaAtiva.data)}`
                      : "Lançamentos CP / CR"}
                  </div>
                  {linhaAtiva && (
                    <div style={{ fontSize: 11, color: "#7A5A12", marginBottom: 8, fontStyle: "italic", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {linhaAtiva.descricao}
                    </div>
                  )}
                  <div style={{ display: "flex", gap: 4, marginBottom: 6 }}>
                    {(["todos","pagar","receber"] as const).map(t => (
                      <button key={t} onClick={() => setFiltroLancTipo(t)}
                        style={{ fontSize: 11, padding: "2px 8px", borderRadius: 6, border: "0.5px solid var(--border)", background: filtroLancTipo === t ? "#111" : "var(--bg-card)", color: filtroLancTipo === t ? "#fff" : "var(--text-2)", cursor: "pointer", fontWeight: 600 }}>
                        {t === "todos" ? "Todos" : t === "pagar" ? "A Pagar" : "A Receber"}
                      </button>
                    ))}
                  </div>
                  <input placeholder="Buscar lançamento..." value={buscaLanc} onChange={e => setBuscaLanc(e.target.value)}
                    style={{ width: "100%", padding: "5px 8px", borderRadius: 6, border: "0.5px solid var(--border)", fontSize: 12, outline: "none", boxSizing: "border-box" }} />
                </div>

                {linhaAtiva && lancsSel.size > 0 && (
                  <div style={{ padding: "8px 14px", background: "#1A4870", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontSize: 12, color: "#fff", fontWeight: 600 }}>
                      {lancsSel.size} selecionado{lancsSel.size > 1 ? "s" : ""}{lancsSel.size > 1 ? " (bordero)" : ""}
                    </span>
                    <div style={{ display: "flex", gap: 6 }}>
                      <button onClick={() => setLancsSel(new Set())}
                        style={{ fontSize: 11, padding: "3px 8px", background: "transparent", color: "rgba(255,255,255,0.7)", border: "0.5px solid rgba(255,255,255,0.3)", borderRadius: 6, cursor: "pointer" }}>
                        Limpar
                      </button>
                      <button onClick={confirmarVinculo}
                        style={{ fontSize: 11, padding: "3px 10px", background: "#C9921B", color: "#fff", border: "none", borderRadius: 6, cursor: "pointer", fontWeight: 700 }}>
                        ✓ Confirmar
                      </button>
                    </div>
                  </div>
                )}

                <div style={{ maxHeight: 520, overflowY: "auto" }}>
                  {lancFiltrados.slice(0, 80).map((l, i, arr) => {
                    const isSel = lancsSel.has(l.id);
                    return (
                      <div key={l.id} onClick={() => {
                        if (!linhaAtiva) return;
                        setLancsSel(prev => {
                          const next = new Set(prev);
                          if (next.has(l.id)) next.delete(l.id); else next.add(l.id);
                          return next;
                        });
                      }}
                        style={{
                          padding: "9px 14px",
                          borderBottom: i < arr.length - 1 ? "0.5px solid var(--bg-tag)" : "none",
                          background: isSel ? "#EBF4FF" : "transparent",
                          borderLeft: isSel ? "3px solid #1A4870" : "3px solid transparent",
                          cursor: linhaAtiva ? "pointer" : "default",
                          display: "flex", alignItems: "flex-start", gap: 8,
                        }}>
                        {linhaAtiva && (
                          <input type="checkbox" checked={isSel} readOnly
                            style={{ marginTop: 2, flexShrink: 0, accentColor: "#1A4870" }} />
                        )}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 12, fontWeight: 500, color: "var(--text-1)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{l.descricao}</div>
                          <div style={{ fontSize: 11, color: "var(--text-3)", marginTop: 1 }}>
                            {l.tipo === "pagar" ? "CP" : "CR"} · {fmtDt(l.data_vencimento)}
                            {l.data_baixa ? ` · baixado ${fmtDt(l.data_baixa)}` : ""}
                            {l.categoria ? ` · ${l.categoria}` : ""}
                          </div>
                        </div>
                        <div style={{ flexShrink: 0, textAlign: "right" }}>
                          <div style={{ fontSize: 12, fontWeight: 700, color: l.tipo === "receber" ? "#16A34A" : "#E24B4A" }}>
                            {fmtBRL(l.valor_pago ?? l.valor)}
                          </div>
                          <div style={{ fontSize: 10, padding: "1px 5px", borderRadius: 6, background: l.status === "baixado" ? "#DCFCE7" : "#FEF3C7", color: l.status === "baixado" ? "#16A34A" : "#92400E", display: "inline-block", marginTop: 1 }}>
                            {l.status}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  {lancFiltrados.length === 0 && (
                    <div style={{ padding: "24px", textAlign: "center", color: "var(--text-3)", fontSize: 12 }}>Nenhum lançamento encontrado</div>
                  )}
                </div>

                {linhaAtiva && (
                  <div style={{ padding: "10px 14px", borderTop: "0.5px solid var(--border)", background: "var(--bg-page)" }}>
                    <button onClick={() => { setLinhaAtiva(null); setLancsSel(new Set()); }}
                      style={{ width: "100%", padding: "6px", border: "0.5px solid var(--border)", borderRadius: 8, background: "var(--bg-card)", fontSize: 12, color: "var(--text-2)", cursor: "pointer" }}>
                      Cancelar vinculação
                    </button>
                  </div>
                )}
              </div>

              {/* ─── PAINEL DIREITO: Extrato OFX ───────────────────────── */}
              <div style={{ background: "var(--bg-card)", borderRadius: 12, border: "0.5px solid var(--border)", overflow: "hidden" }}>
                {/* Filtros OFX */}
                <div style={{ padding: "10px 12px", borderBottom: "0.5px solid var(--border)", background: "var(--bg-page)", display: "flex", gap: 10, alignItems: "center" }}>
                  <input placeholder="Buscar por descrição ou FITID..." value={busca} onChange={e => setBusca(e.target.value)}
                    style={{ padding: "6px 10px", borderRadius: 7, border: "0.5px solid var(--border)", fontSize: 12, width: 260, outline: "none" }} />
                  <label style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12, cursor: "pointer", color: "var(--text-2)", whiteSpace: "nowrap" }}>
                    <input type="checkbox" checked={filtroPend} onChange={e => setFiltroPend(e.target.checked)} />
                    Apenas pendentes
                  </label>
                  <div style={{ marginLeft: "auto", fontSize: 11, color: "var(--text-3)", whiteSpace: "nowrap" }}>
                    {linhasFiltradas.length} de {extrato.total_linhas} transações
                  </div>
                  <button onClick={() => setColWidths([...COL_INIT])} title="Resetar colunas"
                    style={{ padding: "4px 8px", border: "0.5px solid var(--border)", borderRadius: 6, background: "var(--bg-card)", fontSize: 11, color: "var(--text-3)", cursor: "pointer" }}>
                    ⟳ Colunas
                  </button>
                </div>

                {/* Tabela OFX com colunas redimensionáveis */}
                <div style={{ overflowX: "auto" }}>
                  <table style={{ tableLayout: "fixed", width: colWidths.reduce((a, b) => a + b, 0), borderCollapse: "collapse", fontSize: 13 }}>
                    <colgroup>
                      {colWidths.map((w, i) => <col key={i} style={{ width: w }} />)}
                    </colgroup>
                    <thead>
                      <tr>
                        {["Data", "Descrição no Extrato", "Valor", "Situação", "Lançamento Vinculado", "Ação"].map((h, i) => (
                          <th key={h} style={thStyle}>
                            {h}
                            <div style={resizer}
                              onMouseDown={e => { e.preventDefault(); onResizeStart(i, e.clientX, colWidths[i]); }}
                              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = "#C9921B"; }}
                              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "transparent"; }}
                            />
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {linhasFiltradas.map((l, i) => {
                        const isAtiva = linhaAtiva?.id === l.id;
                        return (
                          <tr key={l.id} style={{
                            borderBottom: i < linhasFiltradas.length - 1 ? "0.5px solid var(--bg-tag)" : "none",
                            background: isAtiva ? "#FBF3E0" : l.conciliado ? "transparent" : "#FFFEF8",
                          }}>
                            <td style={{ padding: "9px 10px", color: "var(--text-2)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{fmtDt(l.data)}</td>
                            <td style={{ padding: "9px 10px", overflow: "hidden" }}>
                              <div style={{ fontWeight: 500, color: "var(--text-1)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{l.descricao}</div>
                              <div style={{ fontSize: 10, color: "var(--text-muted)", fontFamily: "monospace", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{l.id}</div>
                            </td>
                            <td style={{ padding: "9px 10px", whiteSpace: "nowrap", overflow: "hidden" }}>
                              <span style={{ fontWeight: 700, color: l.tipo === "credito" ? "#16A34A" : "#E24B4A" }}>
                                {l.tipo === "credito" ? "+" : "−"}{fmtBRL(l.valor)}
                              </span>
                              <div style={{ fontSize: 10, color: "var(--text-3)" }}>{l.tipo === "credito" ? "Crédito" : "Débito"}</div>
                            </td>
                            <td style={{ padding: "9px 10px", overflow: "hidden" }}>
                              {l.conciliado
                                ? <span style={{ padding: "3px 9px", borderRadius: 10, fontSize: 11, fontWeight: 600, background: "#DCFCE7", color: "#16A34A", whiteSpace: "nowrap" }}>Conciliado</span>
                                : <span style={{ padding: "3px 9px", borderRadius: 10, fontSize: 11, fontWeight: 600, background: "#FEF3C7", color: "#92400E", whiteSpace: "nowrap" }}>Pendente</span>}
                            </td>
                            <td style={{ padding: "9px 10px", overflow: "hidden" }}>
                              {l.conciliado && l.lancamento_desc ? (
                                <div>
                                  <div style={{ fontSize: 12, fontWeight: 500, color: "var(--text-1)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{l.lancamento_desc}</div>
                                  {l.lancamento_valor != null && (
                                    <div style={{ fontSize: 11, color: "var(--text-3)" }}>{fmtBRL(l.lancamento_valor)}</div>
                                  )}
                                  {(l.lancamento_ids?.length ?? 0) > 1 && (
                                    <div style={{ fontSize: 10, color: "#1A4870", marginTop: 1 }}>
                                      Bordero: {l.lancamento_ids!.length} lançamentos
                                    </div>
                                  )}
                                </div>
                              ) : (
                                <span style={{ color: "var(--text-muted)", fontSize: 12 }}>—</span>
                              )}
                            </td>
                            <td style={{ padding: "9px 10px", overflow: "hidden" }}>
                              {l.conciliado ? (
                                <button onClick={() => { desvincular(l.id); if (isAtiva) { setLinhaAtiva(null); setLancsSel(new Set()); } }}
                                  style={{ padding: "3px 8px", borderRadius: 6, border: "0.5px solid var(--border)", background: "var(--bg-card)", color: "var(--text-3)", fontSize: 11, cursor: "pointer", whiteSpace: "nowrap" }}>
                                  Desvincular
                                </button>
                              ) : (
                                <button
                                  onClick={() => {
                                    if (isAtiva) { setLinhaAtiva(null); setLancsSel(new Set()); }
                                    else { setLinhaAtiva(l); setLancsSel(new Set()); setFiltroLancTipo(l.tipo === "credito" ? "receber" : "pagar"); }
                                  }}
                                  style={{ padding: "3px 9px", borderRadius: 6, border: `0.5px solid ${isAtiva ? "#C9921B" : "#C9921B"}`, background: isAtiva ? "#C9921B" : "#FBF3E0", color: isAtiva ? "#fff" : "#C9921B", fontSize: 11, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap" }}>
                                  {isAtiva ? "✓ Vinculando..." : "Vincular"}
                                </button>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                      {linhasFiltradas.length === 0 && (
                        <tr><td colSpan={6} style={{ padding: "28px", textAlign: "center", color: "var(--text-3)", fontSize: 13 }}>Nenhuma transação encontrada.</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            {/* Avisos finais */}
            {extrato.pendentes > 0 && (
              <div style={{ marginTop: 14, background: "#FBF3E0", border: "0.5px solid #C9921B", borderRadius: 10, padding: "12px 16px", fontSize: 12, color: "#7A5A12" }}>
                <strong>{extrato.pendentes} transações pendentes.</strong> Clique "Vincular" em uma linha do extrato e selecione o(s) lançamento(s) correspondente(s) no painel esquerdo. Para bordero, selecione múltiplos lançamentos antes de confirmar.
              </div>
            )}
            {pct === 100 && (
              <div style={{ marginTop: 14, background: "#DCFCE7", border: "0.5px solid #16A34A", borderRadius: 10, padding: "12px 16px", display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ fontSize: 20 }}>✔</div>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "#14532D" }}>Extrato 100% conciliado</div>
                  <div style={{ fontSize: 12, color: "#166534" }}>Todas as transações foram associadas.</div>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
