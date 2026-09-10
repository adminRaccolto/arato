"use client";
import { useState, useEffect, useCallback } from "react";
import { useAuth } from "../../../components/AuthProvider";
import TopNav from "../../../components/TopNav";
import { supabase } from "../../../lib/supabase";
import type { Insumo, MovimentacaoEstoque } from "../../../lib/supabase";

// ─── helpers ────────────────────────────────────────────────────────────────

function fmt(v: number, d = 2) {
  return v.toLocaleString("pt-BR", { minimumFractionDigits: d, maximumFractionDigits: d });
}
function fmtQty(v: number) {
  return v.toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 3 });
}
function fmtDate(s: string) {
  if (!s) return "—";
  const [y, m, d] = s.split("T")[0].split("-");
  return `${d}/${m}/${y}`;
}
function TODAY() {
  return new Date().toISOString().slice(0, 10);
}
function MONTH_START() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

// ─── tipos internos ──────────────────────────────────────────────────────────

type MovComCiclo = MovimentacaoEstoque & { ciclos?: { descricao: string } | null };

type LinhaKardex = {
  id?: string;           // movimentacoes_estoque.id (ausente em saldo_inicial)
  data: string;
  documento: string;
  operacao: string;
  tipo: "entrada" | "saida" | "ajuste" | "saldo_inicial";
  motivo?: string;
  nf_ref?: string;
  ciclo_descricao?: string;
  entrada_qty: number;
  entrada_unit: number;
  entrada_total: number;
  saida_qty: number;
  saida_unit: number;
  saida_total: number;
  saldo_qty: number;
  custo_medio: number;
  saldo_total: number;
  usuario?: string;
  obs?: string;
};

// ─── componente ─────────────────────────────────────────────────────────────

export default function Kardex() {
  const { fazendaId, fazendaIds } = useAuth();

  const [insumos,      setInsumos]      = useState<Insumo[]>([]);
  const [insumoId,     setInsumoId]     = useState("");
  const [busca,        setBusca]        = useState("");
  const [dataIni,      setDataIni]      = useState(MONTH_START());
  const [dataFim,      setDataFim]      = useState(TODAY());
  const [depositoId,   setDepositoId]   = useState("");
  const [depositos,    setDepositos]    = useState<{ id: string; nome: string }[]>([]);
  const [linhas,       setLinhas]       = useState<LinhaKardex[]>([]);
  const [carregando,   setCarregando]   = useState(false);
  const [gerado,       setGerado]       = useState(false);
  const [excluindo,    setExcluindo]    = useState<Set<string>>(new Set());

  // Carrega insumos e depósitos de TODAS as fazendas da conta
  const fazendaIdsKey = fazendaIds.join(",");
  useEffect(() => {
    if (!fazendaIds.length) return;
    supabase.from("insumos").select("*")
      .in("fazenda_id", fazendaIds).order("nome")
      .then(({ data }) => setInsumos((data ?? []) as Insumo[]));
    supabase.from("depositos").select("id,nome")
      .in("fazenda_id", fazendaIds).order("nome")
      .then(({ data }) => setDepositos(data ?? []));
  }, [fazendaIdsKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const insumosFiltrados = insumos.filter(i =>
    !busca || i.nome.toLowerCase().includes(busca.toLowerCase())
  );

  const insumoSel = insumos.find(i => i.id === insumoId);

  // Gera o relatório
  const gerarKardex = useCallback(async () => {
    if (!fazendaIds.length || !insumoId) return;
    setCarregando(true);
    setGerado(false);

    // 1. Movimentações ANTES do período — de todas as fazendas da conta
    let qAntes = supabase
      .from("movimentacoes_estoque")
      .select("*, ciclos(descricao)")
      .in("fazenda_id", fazendaIds)
      .eq("insumo_id", insumoId)
      .lt("data", dataIni)
      .order("data", { ascending: true });
    // Supabase builder é imutável — reatribuir para aplicar filtro
    if (depositoId) qAntes = qAntes.eq("deposito_id", depositoId);

    // 2. Movimentações NO período
    let qPeriodo = supabase
      .from("movimentacoes_estoque")
      .select("*, ciclos(descricao)")
      .in("fazenda_id", fazendaIds)
      .eq("insumo_id", insumoId)
      .gte("data", dataIni)
      .lte("data", dataFim)
      .order("data", { ascending: true });
    if (depositoId) qPeriodo = qPeriodo.eq("deposito_id", depositoId);

    const [{ data: antes, error: e1 }, { data: periodo, error: e2 }] = await Promise.all([qAntes, qPeriodo]);
    if (e1) console.error("Kardex antes:", e1);
    if (e2) console.error("Kardex período:", e2);

    // Calcula saldo inicial por custo médio ponderado
    let saldo_qty   = 0;
    let custo_total = 0;

    for (const m of (antes ?? []) as MovComCiclo[]) {
      const unit = m.custo_unitario_na_baixa ?? m.valor_unitario ?? 0;
      if (m.tipo === "entrada") {
        custo_total = custo_total + m.quantidade * unit;
        saldo_qty   = saldo_qty + m.quantidade;
      } else if (m.tipo === "saida") {
        const cm = saldo_qty > 0 ? custo_total / saldo_qty : unit;
        custo_total = Math.max(0, custo_total - m.quantidade * cm);
        saldo_qty   = Math.max(0, saldo_qty - m.quantidade);
      } else {
        saldo_qty   = m.quantidade;
        custo_total = m.quantidade * unit;
      }
    }

    const cm_inicial = saldo_qty > 0 ? custo_total / saldo_qty : 0;

    const resultado: LinhaKardex[] = [];

    resultado.push({
      data:          dataIni,
      documento:     "—",
      operacao:      "Saldo Inicial",
      tipo:          "saldo_inicial",
      entrada_qty:   0, entrada_unit: 0, entrada_total: 0,
      saida_qty:     0, saida_unit:   0, saida_total:   0,
      saldo_qty,
      custo_medio:   cm_inicial,
      saldo_total:   saldo_qty * cm_inicial,
    });

    let cm = cm_inicial;

    for (const m of (periodo ?? []) as MovComCiclo[]) {
      const unit = m.custo_unitario_na_baixa ?? m.valor_unitario ?? cm;
      const nf_ref = m.nf_entrada ?? undefined;
      const ciclo_descricao = m.ciclos?.descricao ?? undefined;

      if (m.tipo === "entrada") {
        const novaQtd   = saldo_qty + m.quantidade;
        const novoTotal = custo_total + m.quantidade * unit;
        cm              = novaQtd > 0 ? novoTotal / novaQtd : unit;
        custo_total     = novoTotal;
        saldo_qty       = novaQtd;

        resultado.push({
          id:            m.id,
          data:          m.data.slice(0, 10),
          documento:     nf_ref ?? m.motivo ?? "—",
          operacao:      labelMotivo(m.motivo ?? "entrada"),
          tipo:          "entrada",
          motivo:        m.motivo,
          nf_ref,
          ciclo_descricao,
          entrada_qty:   m.quantidade,
          entrada_unit:  unit,
          entrada_total: m.quantidade * unit,
          saida_qty:     0, saida_unit: 0, saida_total: 0,
          saldo_qty,
          custo_medio:   cm,
          saldo_total:   saldo_qty * cm,
          usuario:       m.usuario_nome,
          obs:           m.observacao,
        });

      } else if (m.tipo === "saida") {
        const qty_saida = Math.min(m.quantidade, saldo_qty);
        custo_total     = Math.max(0, custo_total - qty_saida * cm);
        saldo_qty       = Math.max(0, saldo_qty - qty_saida);

        resultado.push({
          id:            m.id,
          data:          m.data.slice(0, 10),
          documento:     nf_ref ?? m.operacao ?? "—",
          operacao:      labelMotivo(m.motivo ?? "saida"),
          tipo:          "saida",
          motivo:        m.motivo,
          nf_ref,
          ciclo_descricao,
          entrada_qty:   0, entrada_unit: 0, entrada_total: 0,
          saida_qty:     m.quantidade,
          saida_unit:    cm,
          saida_total:   m.quantidade * cm,
          saldo_qty,
          custo_medio:   cm,
          saldo_total:   saldo_qty * cm,
          usuario:       m.usuario_nome,
          obs:           m.observacao ?? m.operacao,
        });

      } else {
        // ajuste de inventário
        saldo_qty   = m.quantidade;
        custo_total = m.quantidade * (unit || cm);
        cm          = saldo_qty > 0 ? custo_total / saldo_qty : cm;

        resultado.push({
          id:            m.id,
          data:          m.data.slice(0, 10),
          documento:     "Ajuste",
          operacao:      "Ajuste de Inventário",
          tipo:          "ajuste",
          ciclo_descricao,
          entrada_qty:   0, entrada_unit: 0, entrada_total: 0,
          saida_qty:     0, saida_unit:   0, saida_total:   0,
          saldo_qty,
          custo_medio:   cm,
          saldo_total:   saldo_qty * cm,
          usuario:       m.usuario_nome,
          obs:           m.observacao,
        });
      }
    }

    setLinhas(resultado);
    setCarregando(false);
    setGerado(true);
  }, [fazendaIdsKey, insumoId, dataIni, dataFim, depositoId]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── resumo ────────────────────────────────────────────────────────────────
  const totalEntradas   = linhas.reduce((s, l) => s + l.entrada_total, 0);
  const totalSaidas     = linhas.reduce((s, l) => s + l.saida_total,   0);
  const saldoInicial    = linhas[0]?.saldo_qty   ?? 0;
  const saldoFinal      = linhas[linhas.length - 1]?.saldo_qty  ?? 0;
  const cmFinal         = linhas[linhas.length - 1]?.custo_medio ?? 0;
  const qtdEntradas     = linhas.reduce((s, l) => s + l.entrada_qty, 0);
  const qtdSaidas       = linhas.reduce((s, l) => s + l.saida_qty,   0);

  async function excluirMovimento(id: string, insumoIdAlvo: string) {
    if (!confirm("Excluir este lançamento? O saldo físico será recalculado automaticamente.")) return;
    setExcluindo(prev => new Set(prev).add(id));
    try {
      const { error } = await supabase.from("movimentacoes_estoque").delete().eq("id", id);
      if (error) throw error;
      // Recalcula insumos.estoque com base nos movimentos restantes
      const { data: rest } = await supabase.from("movimentacoes_estoque")
        .select("tipo, quantidade").eq("insumo_id", insumoIdAlvo);
      let saldo = 0;
      for (const m of rest ?? []) {
        if (m.tipo === "saida") saldo -= Math.abs(m.quantidade);
        else saldo += m.quantidade;
      }
      await supabase.from("insumos").update({ estoque: saldo }).eq("id", insumoIdAlvo);
      await gerarKardex();
    } catch (e) {
      alert("Erro ao excluir: " + (e as Error).message);
    } finally {
      setExcluindo(prev => { const s = new Set(prev); s.delete(id); return s; });
    }
  }

  function exportarPDF() { window.print(); }

  async function exportarXLSX() {
    if (!insumoSel) return;
    const XLSX = await import("xlsx");
    const rows = linhas.map(l => ({
      "Data":              fmtDate(l.data),
      "Operação":          l.operacao,
      "Origem":            origemTexto(l),
      "Entrada Qtd":       l.entrada_qty  || "",
      "Entrada Unit R$":   l.entrada_unit  ? fmt(l.entrada_unit)  : "",
      "Entrada Total R$":  l.entrada_total ? fmt(l.entrada_total) : "",
      "Saída Qtd":         l.saida_qty    || "",
      "Saída Unit R$":     l.saida_unit   ? fmt(l.saida_unit)    : "",
      "Saída Total R$":    l.saida_total  ? fmt(l.saida_total)   : "",
      "Saldo Qtd":         fmtQty(l.saldo_qty),
      "Custo Médio R$":    fmt(l.custo_medio),
      "Saldo Total R$":    fmt(l.saldo_total),
      "Usuário":           l.usuario ?? (l.tipo === "saldo_inicial" ? "" : "Sistema"),
      "Observação":        l.obs ?? "",
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Kardex");
    const nome = `Kardex_${insumoSel.nome.replace(/\s+/g, "_")}_${dataIni}_${dataFim}.xlsx`;
    XLSX.writeFile(wb, nome);
  }

  // ─── render ──────────────────────────────────────────────────────────────

  const corLinha = (tipo: LinhaKardex["tipo"]) => {
    if (tipo === "saldo_inicial") return "var(--bg-page)";
    if (tipo === "entrada")       return "#F0FDF4";
    if (tipo === "saida")         return "#FFF7F7";
    return "#FEFCE8";
  };

  return (
    <>
      <TopNav />
      <div style={{ background: "var(--bg-page)", minHeight: "100vh", fontFamily: "system-ui, sans-serif" }}>

        {/* ── Cabeçalho ── */}
        <div style={{ background: "var(--bg-card)", borderBottom: "0.5px solid var(--border)", padding: "18px 32px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", maxWidth: 1400, margin: "0 auto" }}>
            <div>
              <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: "#111111" }}>
                Kardex — Ficha de Estoque
              </h1>
              <p style={{ margin: "2px 0 0", fontSize: 13, color: "#666" }}>
                Movimentações por produto com custo médio ponderado
              </p>
            </div>
            {gerado && (
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={exportarPDF} style={btnSec}>🖨 Imprimir / PDF</button>
                <button onClick={exportarXLSX} style={btnSec}>📊 Exportar XLSX</button>
              </div>
            )}
          </div>
        </div>

        <div style={{ maxWidth: 1400, margin: "0 auto", padding: "24px 32px" }}>

          {/* ── Filtros ── */}
          <div style={{ background: "var(--bg-card)", border: "0.5px solid var(--border)", borderRadius: 12, padding: 24, marginBottom: 20 }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 180px 180px auto", gap: 16, alignItems: "end" }}>

              {/* Produto */}
              <div style={{ position: "relative" }}>
                <label style={lbl}>Produto *</label>
                <input
                  type="text"
                  placeholder="Buscar produto…"
                  value={busca}
                  onChange={e => { setBusca(e.target.value); setInsumoId(""); setGerado(false); }}
                  style={inp}
                />
                {busca && !insumoId && insumosFiltrados.length > 0 && (
                  <div style={{ border: "0.5px solid var(--border)", borderRadius: 8, background: "var(--bg-card)", maxHeight: 200, overflowY: "auto", boxShadow: "0 4px 12px rgba(0,0,0,0.08)", position: "absolute", zIndex: 100, width: "100%", top: "100%" }}>
                    {insumosFiltrados.map(i => (
                      <div
                        key={i.id}
                        onClick={() => { setInsumoId(i.id); setBusca(i.nome); setGerado(false); }}
                        style={{ padding: "8px 14px", cursor: "pointer", fontSize: 13, borderBottom: "0.5px solid #F0F0F0" }}
                        onMouseEnter={e => (e.currentTarget.style.background = "var(--bg-page)")}
                        onMouseLeave={e => (e.currentTarget.style.background = "var(--bg-card)")}
                      >
                        <span style={{ fontWeight: 600 }}>{i.nome}</span>
                        <span style={{ color: "var(--text-3)", marginLeft: 8, fontSize: 11 }}>{i.categoria} · {i.unidade}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Depósito */}
              <div>
                <label style={lbl}>Depósito</label>
                <select value={depositoId} onChange={e => setDepositoId(e.target.value)} style={inp}>
                  <option value="">Todos os depósitos</option>
                  {depositos.map(d => <option key={d.id} value={d.id}>{d.nome}</option>)}
                </select>
              </div>

              {/* Período */}
              <div>
                <label style={lbl}>Data Início</label>
                <input type="date" value={dataIni} onChange={e => setDataIni(e.target.value)} style={inp} />
              </div>
              <div>
                <label style={lbl}>Data Fim</label>
                <input type="date" value={dataFim} onChange={e => setDataFim(e.target.value)} style={inp} />
              </div>

              <button
                onClick={gerarKardex}
                disabled={!insumoId || carregando}
                style={{ background: insumoId ? "#111111" : "#C0CAD6", color: "#fff", border: "none", borderRadius: 8, padding: "10px 24px", fontSize: 13, fontWeight: 600, cursor: insumoId ? "pointer" : "not-allowed", height: 40, whiteSpace: "nowrap" }}
              >
                {carregando ? "Gerando…" : "Gerar Kardex"}
              </button>
            </div>
          </div>

          {/* ── KPIs ── */}
          {gerado && (
            <>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 12, marginBottom: 20 }}>
                {[
                  { label: "Saldo Inicial",    valor: `${fmtQty(saldoInicial)} ${insumoSel?.unidade ?? ""}`, cor: "#111111" },
                  { label: "Total Entradas",   valor: `${fmtQty(qtdEntradas)} ${insumoSel?.unidade ?? ""}`,  cor: "#16A34A" },
                  { label: "Total Saídas",     valor: `${fmtQty(qtdSaidas)} ${insumoSel?.unidade ?? ""}`,    cor: "#E24B4A" },
                  { label: "Saldo Final",      valor: `${fmtQty(saldoFinal)} ${insumoSel?.unidade ?? ""}`,   cor: "#111111" },
                  { label: "Custo Médio Final",valor: `R$ ${fmt(cmFinal)}/${insumoSel?.unidade ?? "un"}`,    cor: "#C9921B" },
                ].map(k => (
                  <div key={k.label} style={{ background: "var(--bg-card)", border: "0.5px solid var(--border)", borderRadius: 10, padding: "14px 18px" }}>
                    <div style={{ fontSize: 11, color: "var(--text-3)", marginBottom: 4, fontWeight: 600 }}>{k.label}</div>
                    <div style={{ fontSize: 16, fontWeight: 700, color: k.cor }}>{k.valor}</div>
                  </div>
                ))}
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 20 }}>
                {[
                  { label: "Valor Total Entradas", valor: `R$ ${fmt(totalEntradas)}`,        cor: "#16A34A" },
                  { label: "Valor Total Saídas",   valor: `R$ ${fmt(totalSaidas)}`,          cor: "#E24B4A" },
                  { label: "Saldo Total (R$)",     valor: `R$ ${fmt(saldoFinal * cmFinal)}`, cor: "#111111" },
                ].map(k => (
                  <div key={k.label} style={{ background: "var(--bg-card)", border: "0.5px solid var(--border)", borderRadius: 10, padding: "14px 18px" }}>
                    <div style={{ fontSize: 11, color: "var(--text-3)", marginBottom: 4, fontWeight: 600 }}>{k.label}</div>
                    <div style={{ fontSize: 16, fontWeight: 700, color: k.cor }}>{k.valor}</div>
                  </div>
                ))}
              </div>

              {/* ── Tabela Kardex ── */}
              <div style={{ background: "var(--bg-card)", border: "0.5px solid var(--border)", borderRadius: 12, overflow: "hidden" }}>
                <div style={{ background: "#111111", color: "#fff", padding: "12px 20px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div>
                    <span style={{ fontWeight: 700, fontSize: 14 }}>{insumoSel?.nome}</span>
                    <span style={{ fontSize: 12, opacity: 0.75, marginLeft: 12 }}>{insumoSel?.categoria} · Un: {insumoSel?.unidade}</span>
                  </div>
                  <div style={{ fontSize: 12, opacity: 0.8 }}>
                    Período: {fmtDate(dataIni)} → {fmtDate(dataFim)}
                    {depositoId && ` · ${depositos.find(d => d.id === depositoId)?.nome}`}
                  </div>
                </div>

                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                    <thead>
                      <tr style={{ background: "var(--bg-page)" }}>
                        <th style={{ ...th, width: 85 }}>Data</th>
                        <th style={{ ...th, textAlign: "left" }}>Operação</th>
                        <th style={{ ...th, textAlign: "left" }}>Origem</th>
                        <th style={{ ...th, width: 70 }}>E. Qtd</th>
                        <th style={{ ...th, width: 90 }}>E. Unit R$</th>
                        <th style={{ ...th, width: 100 }}>E. Total R$</th>
                        <th style={{ ...th, width: 70 }}>S. Qtd</th>
                        <th style={{ ...th, width: 90 }}>S. Unit R$</th>
                        <th style={{ ...th, width: 100 }}>S. Total R$</th>
                        <th style={{ ...th, width: 80 }}>Saldo Qtd</th>
                        <th style={{ ...th, width: 90 }}>Custo Médio</th>
                        <th style={{ ...th, width: 105 }}>Saldo Total</th>
                        <th style={{ ...th, textAlign: "left", width: 110 }}>Usuário</th>
                        <th style={{ ...th, width: 46 }}></th>
                      </tr>
                    </thead>
                    <tbody>
                      {linhas.map((l, i) => (
                        <tr key={i} style={{ background: corLinha(l.tipo), borderBottom: "0.5px solid var(--bg-tag)" }}>
                          <td style={{ ...td, textAlign: "center", color: "var(--text-2)" }}>{fmtDate(l.data)}</td>

                          {/* Operação */}
                          <td style={{ ...td, paddingLeft: 14 }}>
                            <div style={{ fontWeight: l.tipo === "saldo_inicial" ? 700 : 500, color: "var(--text-1)", fontSize: 12 }}>
                              {l.operacao}
                            </div>
                          </td>

                          {/* Origem */}
                          <td style={{ ...td, paddingLeft: 10 }}>
                            {l.tipo === "saldo_inicial" ? (
                              <span style={{ color: "var(--text-3)", fontSize: 11 }}>—</span>
                            ) : l.nf_ref ? (
                              <a href="/compras/nf" target="_blank" title={`Ver NF ${l.nf_ref}`}
                                style={{ color: "#1A4870", fontWeight: 600, fontSize: 11, textDecoration: "none", background: "#D5E8F5", padding: "2px 8px", borderRadius: 5, display: "inline-block", whiteSpace: "nowrap" }}>
                                📄 NF {l.nf_ref.length > 20 ? l.nf_ref.slice(0, 8) + "…" : l.nf_ref}
                              </a>
                            ) : l.ciclo_descricao ? (
                              <span style={{ fontSize: 11, color: "#16A34A", whiteSpace: "nowrap" }}>🌱 {l.ciclo_descricao}</span>
                            ) : l.motivo === "transferencia" ? (
                              <span style={{ fontSize: 11, color: "#378ADD" }}>🔄 Transferência</span>
                            ) : l.motivo === "abastecimento" ? (
                              <span style={{ fontSize: 11, color: "var(--text-2)" }}>⛽ Abastecimento</span>
                            ) : l.motivo === "baixa_uso" ? (
                              <span style={{ fontSize: 11, color: "#16A34A" }}>🌿 Aplicação campo</span>
                            ) : l.motivo === "baixa_perda" ? (
                              <span style={{ fontSize: 11, color: "#E24B4A" }}>⚠ Perda</span>
                            ) : l.motivo === "ajuste_saldo" || l.tipo === "ajuste" ? (
                              <span style={{ fontSize: 11, color: "#7A5A12" }}>⚙ Ajuste manual</span>
                            ) : l.motivo === "inventario" ? (
                              <span style={{ fontSize: 11, color: "#7A5A12" }}>📦 Inventário</span>
                            ) : (
                              <span style={{ fontSize: 11, color: "var(--text-3)" }}>{l.obs ? l.obs.slice(0, 40) : "—"}</span>
                            )}
                          </td>

                          {/* Entrada */}
                          <td style={{ ...td, textAlign: "right", color: "#16A34A", fontWeight: l.entrada_qty ? 600 : 400 }}>
                            {l.entrada_qty ? fmtQty(l.entrada_qty) : <span style={{ color: "#ccc" }}>—</span>}
                          </td>
                          <td style={{ ...td, textAlign: "right", color: "var(--text-2)" }}>
                            {l.entrada_unit ? fmt(l.entrada_unit) : <span style={{ color: "#ccc" }}>—</span>}
                          </td>
                          <td style={{ ...td, textAlign: "right", color: "#16A34A", fontWeight: l.entrada_total ? 600 : 400 }}>
                            {l.entrada_total ? fmt(l.entrada_total) : <span style={{ color: "#ccc" }}>—</span>}
                          </td>

                          {/* Saída */}
                          <td style={{ ...td, textAlign: "right", color: "#E24B4A", fontWeight: l.saida_qty ? 600 : 400 }}>
                            {l.saida_qty ? fmtQty(l.saida_qty) : <span style={{ color: "#ccc" }}>—</span>}
                          </td>
                          <td style={{ ...td, textAlign: "right", color: "var(--text-2)" }}>
                            {l.saida_unit ? fmt(l.saida_unit) : <span style={{ color: "#ccc" }}>—</span>}
                          </td>
                          <td style={{ ...td, textAlign: "right", color: "#E24B4A", fontWeight: l.saida_total ? 600 : 400 }}>
                            {l.saida_total ? fmt(l.saida_total) : <span style={{ color: "#ccc" }}>—</span>}
                          </td>

                          {/* Saldo */}
                          <td style={{ ...td, textAlign: "right", fontWeight: 700, color: "#111111" }}>
                            {fmtQty(l.saldo_qty)}
                          </td>
                          <td style={{ ...td, textAlign: "right", color: "#C9921B", fontWeight: 600 }}>
                            {fmt(l.custo_medio)}
                          </td>
                          <td style={{ ...td, textAlign: "right", fontWeight: 700, color: "#111111" }}>
                            {fmt(l.saldo_total)}
                          </td>

                          {/* Usuário */}
                          <td style={{ ...td, paddingLeft: 10, fontSize: 11 }}>
                            {l.tipo === "saldo_inicial" ? (
                              <span style={{ color: "var(--text-3)" }}>—</span>
                            ) : l.usuario ? (
                              <span style={{ color: "var(--text-2)" }}>{l.usuario}</span>
                            ) : (
                              <span style={{ color: "var(--text-3)", fontStyle: "italic" }}>Sistema</span>
                            )}
                          </td>
                          {/* Excluir */}
                          <td style={{ ...td, textAlign: "center", padding: "4px 6px" }}>
                            {l.id && l.tipo !== "saldo_inicial" && (
                              <button
                                onClick={() => excluirMovimento(l.id!, insumoId)}
                                disabled={excluindo.has(l.id)}
                                title="Excluir lançamento"
                                style={{ background: "none", border: "none", cursor: excluindo.has(l.id) ? "wait" : "pointer", color: "#E24B4A", fontSize: 15, padding: "2px 4px", opacity: excluindo.has(l.id) ? 0.4 : 0.6, lineHeight: 1 }}
                              >
                                🗑
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>

                    {linhas.length > 1 && (
                      <tfoot>
                        <tr style={{ background: "#111111", color: "#fff" }}>
                          <td colSpan={3} style={{ ...td, fontWeight: 700, paddingLeft: 14, color: "#fff" }}>TOTAIS DO PERÍODO</td>

                          <td style={{ ...td, textAlign: "right", fontWeight: 700, color: "#86EFAC" }}>{fmtQty(qtdEntradas)}</td>
                          <td style={{ ...td }}></td>
                          <td style={{ ...td, textAlign: "right", fontWeight: 700, color: "#86EFAC" }}>{fmt(totalEntradas)}</td>
                          <td style={{ ...td, textAlign: "right", fontWeight: 700, color: "#FCA5A5" }}>{fmtQty(qtdSaidas)}</td>
                          <td style={{ ...td }}></td>
                          <td style={{ ...td, textAlign: "right", fontWeight: 700, color: "#FCA5A5" }}>{fmt(totalSaidas)}</td>
                          <td style={{ ...td, textAlign: "right", fontWeight: 700, color: "#fff" }}>{fmtQty(saldoFinal)}</td>
                          <td style={{ ...td, textAlign: "right", fontWeight: 700, color: "#FDE68A" }}>{fmt(cmFinal)}</td>
                          <td style={{ ...td, textAlign: "right", fontWeight: 700, color: "#fff" }}>{fmt(saldoFinal * cmFinal)}</td>
                          <td style={{ ...td }}></td>
                        </tr>
                      </tfoot>
                    )}
                  </table>
                </div>

                {linhas.length === 1 && (
                  <div style={{ padding: "32px", textAlign: "center", color: "var(--text-3)", fontSize: 13 }}>
                    Nenhuma movimentação encontrada no período selecionado.
                  </div>
                )}
              </div>
            </>
          )}

          {!gerado && !carregando && (
            <div style={{ background: "var(--bg-card)", border: "0.5px solid var(--border)", borderRadius: 12, padding: 48, textAlign: "center" }}>
              <div style={{ fontSize: 36, marginBottom: 12 }}>📋</div>
              <div style={{ fontSize: 14, color: "var(--text-3)" }}>
                Selecione um produto e o período para gerar a ficha de estoque (Kardex).
              </div>
            </div>
          )}
        </div>
      </div>

      <style>{`
        @media print {
          body * { visibility: hidden; }
          .kardex-print, .kardex-print * { visibility: visible; }
          .kardex-print { position: fixed; top: 0; left: 0; width: 100%; }
          @page { size: A4 landscape; margin: 14mm; }
        }
      `}</style>
    </>
  );
}

// ─── helpers ────────────────────────────────────────────────────────────────

function origemTexto(l: LinhaKardex): string {
  if (l.tipo === "saldo_inicial") return "—";
  if (l.nf_ref) return `NF ${l.nf_ref}`;
  if (l.ciclo_descricao) return `Safra: ${l.ciclo_descricao}`;
  if (l.motivo === "transferencia") return "Transferência";
  if (l.motivo === "abastecimento") return "Abastecimento";
  if (l.motivo === "baixa_uso") return "Aplicação campo";
  if (l.motivo === "baixa_perda") return "Perda";
  if (l.motivo === "ajuste_saldo" || l.tipo === "ajuste") return "Ajuste manual";
  if (l.motivo === "inventario") return "Inventário";
  return l.obs?.slice(0, 50) ?? "—";
}

function labelMotivo(motivo: string): string {
  const map: Record<string, string> = {
    compra:        "Compra",
    ajuste_saldo:  "Ajuste de Saldo",
    baixa_uso:     "Baixa por Uso",
    baixa_perda:   "Baixa por Perda",
    transferencia: "Transferência",
    inventario:    "Inventário",
    abastecimento: "Abastecimento",
    outros:        "Outros",
    entrada:       "Entrada",
    saida:         "Saída",
  };
  return map[motivo] ?? motivo;
}

// ─── estilos inline ──────────────────────────────────────────────────────────

const lbl: React.CSSProperties = {
  display: "block", fontSize: 11, fontWeight: 600, color: "var(--text-2)", marginBottom: 5, textTransform: "uppercase", letterSpacing: "0.04em",
};

const inp: React.CSSProperties = {
  width: "100%", padding: "8px 12px", border: "0.5px solid var(--border)", borderRadius: 8,
  fontSize: 13, color: "var(--text-1)", background: "var(--bg-input)", outline: "none", boxSizing: "border-box",
};

const btnSec: React.CSSProperties = {
  background: "var(--bg-card)", border: "0.5px solid var(--border)", borderRadius: 8,
  padding: "8px 14px", fontSize: 12, color: "#444", cursor: "pointer", fontWeight: 500,
};

const th: React.CSSProperties = {
  padding: "9px 10px", fontSize: 11, fontWeight: 700, color: "var(--text-2)",
  textAlign: "right", borderBottom: "0.5px solid var(--border)", whiteSpace: "nowrap",
};

const td: React.CSSProperties = {
  padding: "7px 10px", fontSize: 12, verticalAlign: "middle",
};
