"use client";
import { useState, useEffect, useCallback } from "react";
import { createBrowserClient } from "@supabase/ssr";
import { useAuth } from "../../../components/AuthProvider";

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface Lancamento {
  id: string;
  tipo: "pagar" | "receber";
  descricao: string;
  valor: number;
  data_vencimento: string;
  data_baixa: string | null;
  status: string;
  categoria: string | null;
  pessoa_id: string | null;
  observacao: string | null;
  moeda?: string;
}

interface ApoioBaixa {
  id: string;
  lancamento_id: string;
  data_baixa: string;
  observacao: string | null;
}

interface ApoioLancamento {
  id: string;
  fazenda_id: string;
  tipo: "pagar" | "receber";
  descricao: string;
  valor: number;
  data_vencimento: string;
  data_baixa: string | null;
  baixado: boolean;
  pessoa_nome: string | null;
  categoria: string | null;
  observacao: string | null;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const fmtBRL = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const fmtData = (d: string) =>
  d ? new Date(d + "T12:00:00").toLocaleDateString("pt-BR") : "—";

function mesAtual() {
  const hoje = new Date();
  const y = hoje.getFullYear();
  const m = String(hoje.getMonth() + 1).padStart(2, "0");
  return { ini: `${y}-${m}-01`, fim: `${y}-${m}-31` };
}

// ─── Estilos ─────────────────────────────────────────────────────────────────

const card: React.CSSProperties = {
  background: "#fff", border: "0.5px solid #DDE2EE", borderRadius: 12, padding: "20px 24px",
};

const th: React.CSSProperties = {
  padding: "9px 12px", textAlign: "left", fontSize: 11, fontWeight: 700,
  color: "#555", background: "#F4F6FA", borderBottom: "0.5px solid #DDE2EE",
  whiteSpace: "nowrap",
};

const td: React.CSSProperties = {
  padding: "9px 12px", fontSize: 13, color: "#1a1a1a", borderBottom: "0.5px solid #EEF0F5",
  verticalAlign: "middle",
};

const btn = (bg: string, color = "#fff"): React.CSSProperties => ({
  padding: "5px 12px", background: bg, color, border: "none",
  borderRadius: 6, fontWeight: 600, cursor: "pointer", fontSize: 12,
});

const inp: React.CSSProperties = {
  padding: "8px 10px", border: "0.5px solid #DDE2EE", borderRadius: 8,
  fontSize: 13, color: "#1a1a1a", background: "#fff", outline: "none",
  boxSizing: "border-box",
};

const lbl: React.CSSProperties = {
  fontSize: 11, color: "#555", fontWeight: 600, display: "block", marginBottom: 3,
};

// ─── Página ───────────────────────────────────────────────────────────────────

export default function ApoioFinanceiroPage() {
  const { fazendaId, podeAcessarPlano } = useAuth();

  // ── Período ──────────────────────────────────────────────────────────────────
  const { ini: iniPadrao, fim: fimPadrao } = mesAtual();
  const [dataIni, setDataIni] = useState(iniPadrao);
  const [dataFim, setDataFim] = useState(fimPadrao);

  // ── Dados ────────────────────────────────────────────────────────────────────
  const [lancamentos, setLancamentos] = useState<Lancamento[]>([]);
  const [apoioBaixas, setApoioBaixas] = useState<ApoioBaixa[]>([]);
  const [apoioLancs, setApoioLancs] = useState<ApoioLancamento[]>([]);
  const [carregando, setCarregando] = useState(false);

  // ── Abas ─────────────────────────────────────────────────────────────────────
  const [aba, setAba] = useState<"compartilhado" | "exclusivo">("compartilhado");

  // ── Filtro compartilhado ─────────────────────────────────────────────────────
  const [filtroTipo, setFiltroTipo] = useState<"" | "pagar" | "receber">("");
  const [filtroStatus, setFiltroStatus] = useState<"" | "aberto" | "baixado_apoio" | "baixado_oficial">("");

  // ── Modal novo apoio lançamento ───────────────────────────────────────────────
  const [modalAberto, setModalAberto] = useState(false);
  const [formApoio, setFormApoio] = useState({
    tipo: "pagar" as "pagar" | "receber",
    descricao: "",
    valorMask: "",
    data_vencimento: "",
    pessoa_nome: "",
    categoria: "",
    observacao: "",
  });
  const [salvando, setSalvando] = useState(false);
  const [acaoId, setAcaoId] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );

  // ── Carregar dados ────────────────────────────────────────────────────────────
  const carregar = useCallback(async () => {
    if (!fazendaId) return;
    setCarregando(true);
    try {
      // Lançamentos oficiais do período
      const { data: lancs } = await supabase
        .from("lancamentos")
        .select("id,tipo,descricao,valor,data_vencimento,data_baixa,status,categoria,pessoa_id,observacao,moeda")
        .eq("fazenda_id", fazendaId)
        .gte("data_vencimento", dataIni)
        .lte("data_vencimento", dataFim)
        .order("data_vencimento");

      setLancamentos((lancs ?? []) as Lancamento[]);

      // Baixas no contexto Apoio para esses lançamentos
      if (lancs && lancs.length > 0) {
        const ids = lancs.map((l) => l.id);
        const { data: baixas } = await supabase
          .from("apoio_baixas")
          .select("*")
          .in("lancamento_id", ids);
        setApoioBaixas((baixas ?? []) as ApoioBaixa[]);
      } else {
        setApoioBaixas([]);
      }

      // Lançamentos exclusivos do Apoio no período
      const { data: apoio } = await supabase
        .from("apoio_lancamentos")
        .select("*")
        .eq("fazenda_id", fazendaId)
        .gte("data_vencimento", dataIni)
        .lte("data_vencimento", dataFim)
        .order("data_vencimento");

      setApoioLancs((apoio ?? []) as ApoioLancamento[]);
    } finally {
      setCarregando(false);
    }
  }, [fazendaId, dataIni, dataFim]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { carregar(); }, [carregar]);

  // ── Status de cada lançamento no contexto Apoio ───────────────────────────────
  const baixaApoioPorLancId = new Map(apoioBaixas.map((b) => [b.lancamento_id, b]));

  function statusApoio(l: Lancamento): "baixado_oficial" | "baixado_apoio" | "aberto" {
    if (l.status === "baixado") return "baixado_oficial";
    if (baixaApoioPorLancId.has(l.id)) return "baixado_apoio";
    return "aberto";
  }

  // ── Ações sobre baixas Apoio ──────────────────────────────────────────────────
  async function baixarNoApoio(l: Lancamento) {
    if (!fazendaId) return;
    setAcaoId(l.id);
    const hoje = new Date().toISOString().slice(0, 10);
    const { error } = await supabase
      .from("apoio_baixas")
      .insert({ fazenda_id: fazendaId, lancamento_id: l.id, data_baixa: hoje });
    if (!error) await carregar();
    setAcaoId(null);
  }

  async function desfazerBaixaApoio(l: Lancamento) {
    setAcaoId(l.id);
    const baixa = baixaApoioPorLancId.get(l.id);
    if (!baixa) { setAcaoId(null); return; }
    await supabase.from("apoio_baixas").delete().eq("id", baixa.id);
    await carregar();
    setAcaoId(null);
  }

  // ── Salvar lançamento exclusivo ───────────────────────────────────────────────
  async function salvarApoioLanc() {
    if (!fazendaId || !formApoio.descricao || !formApoio.data_vencimento) return;
    const valor = parseFloat(formApoio.valorMask.replace(/\./g, "").replace(",", ".")) || 0;
    setSalvando(true);
    const { error } = await supabase.from("apoio_lancamentos").insert({
      fazenda_id:       fazendaId,
      tipo:             formApoio.tipo,
      descricao:        formApoio.descricao,
      valor,
      data_vencimento:  formApoio.data_vencimento,
      pessoa_nome:      formApoio.pessoa_nome || null,
      categoria:        formApoio.categoria || null,
      observacao:       formApoio.observacao || null,
    });
    setSalvando(false);
    if (!error) {
      setModalAberto(false);
      setFormApoio({ tipo: "pagar", descricao: "", valorMask: "", data_vencimento: "", pessoa_nome: "", categoria: "", observacao: "" });
      await carregar();
    }
  }

  async function baixarApoioExclusivo(a: ApoioLancamento) {
    if (!fazendaId) return;
    setAcaoId(a.id);
    const hoje = new Date().toISOString().slice(0, 10);
    await supabase
      .from("apoio_lancamentos")
      .update({ baixado: true, data_baixa: hoje })
      .eq("id", a.id);
    await carregar();
    setAcaoId(null);
  }

  async function desfazerBaixaExclusivo(a: ApoioLancamento) {
    setAcaoId(a.id);
    await supabase
      .from("apoio_lancamentos")
      .update({ baixado: false, data_baixa: null })
      .eq("id", a.id);
    await carregar();
    setAcaoId(null);
  }

  async function excluirApoioExclusivo(a: ApoioLancamento) {
    if (!confirm(`Excluir "${a.descricao}"?`)) return;
    setAcaoId(a.id);
    await supabase.from("apoio_lancamentos").delete().eq("id", a.id);
    await carregar();
    setAcaoId(null);
  }

  // ── Excel export ──────────────────────────────────────────────────────────────
  async function exportarExcel() {
    const XLSX = await import("xlsx");
    const wb = XLSX.utils.book_new();

    // Tab 1: CP/CR Oficial
    const rowsOficial = lancamentos.map((l) => {
      const sa = statusApoio(l);
      const ba = baixaApoioPorLancId.get(l.id);
      return {
        "Tipo":             l.tipo === "pagar" ? "Pagar" : "Receber",
        "Descrição":        l.descricao,
        "Categoria":        l.categoria ?? "",
        "Vencimento":       l.data_vencimento,
        "Valor":            l.valor,
        "Status Oficial":   l.status,
        "Status Apoio":     sa === "baixado_oficial" ? "Baixado (Oficial)" : sa === "baixado_apoio" ? "Baixado (Apoio)" : "Aberto",
        "Data Baixa Oficial": l.data_baixa ?? "",
        "Data Baixa Apoio": ba?.data_baixa ?? "",
      };
    });
    const ws1 = XLSX.utils.json_to_sheet(rowsOficial);
    ws1["!cols"] = [{ wch: 10 }, { wch: 40 }, { wch: 25 }, { wch: 12 }, { wch: 14 }, { wch: 14 }, { wch: 18 }, { wch: 16 }, { wch: 16 }];
    XLSX.utils.book_append_sheet(wb, ws1, "CP-CR Oficial");

    // Tab 2: Apoio Exclusivo
    const rowsExclusivo = apoioLancs.map((a) => ({
      "Tipo":         a.tipo === "pagar" ? "Pagar" : "Receber",
      "Descrição":    a.descricao,
      "Categoria":    a.categoria ?? "",
      "Pessoa":       a.pessoa_nome ?? "",
      "Vencimento":   a.data_vencimento,
      "Valor":        a.valor,
      "Status Apoio": a.baixado ? "Baixado" : "Aberto",
      "Data Baixa":   a.data_baixa ?? "",
      "Observação":   a.observacao ?? "",
    }));
    const ws2 = XLSX.utils.json_to_sheet(rowsExclusivo.length ? rowsExclusivo : [{ "(vazio)": "" }]);
    ws2["!cols"] = [{ wch: 10 }, { wch: 40 }, { wch: 25 }, { wch: 30 }, { wch: 12 }, { wch: 14 }, { wch: 12 }, { wch: 12 }, { wch: 35 }];
    XLSX.utils.book_append_sheet(wb, ws2, "Apoio Exclusivo");

    // Tab 3: Fluxo Consolidado
    type EntradaFluxo = { data: string; descricao: string; origem: string; tipo: string; valor: number; pago: boolean; sinal: number };
    const entradas: EntradaFluxo[] = [
      ...lancamentos.map((l) => ({
        data:       l.data_vencimento,
        descricao:  l.descricao,
        origem:     "Oficial",
        tipo:       l.tipo === "pagar" ? "Pagar" : "Receber",
        valor:      l.valor,
        pago:       statusApoio(l) !== "aberto",
        sinal:      l.tipo === "receber" ? 1 : -1,
      })),
      ...apoioLancs.map((a) => ({
        data:       a.data_vencimento,
        descricao:  a.descricao,
        origem:     "Apoio",
        tipo:       a.tipo === "pagar" ? "Pagar" : "Receber",
        valor:      a.valor,
        pago:       a.baixado,
        sinal:      a.tipo === "receber" ? 1 : -1,
      })),
    ].sort((a, b) => a.data.localeCompare(b.data));

    let saldo = 0;
    const rowsFluxo = entradas.map((e) => {
      saldo += e.sinal * e.valor;
      return {
        "Data":          e.data,
        "Origem":        e.origem,
        "Tipo":          e.tipo,
        "Descrição":     e.descricao,
        "Pago?":         e.pago ? "Sim" : "Não",
        "Crédito":       e.sinal > 0 ? e.valor : "",
        "Débito":        e.sinal < 0 ? e.valor : "",
        "Saldo Projetado": saldo,
      };
    });
    const ws3 = XLSX.utils.json_to_sheet(rowsFluxo.length ? rowsFluxo : [{ "(vazio)": "" }]);
    ws3["!cols"] = [{ wch: 12 }, { wch: 10 }, { wch: 10 }, { wch: 40 }, { wch: 8 }, { wch: 14 }, { wch: 14 }, { wch: 18 }];
    XLSX.utils.book_append_sheet(wb, ws3, "Fluxo Consolidado");

    const hoje = new Date().toISOString().slice(0, 10);
    XLSX.writeFile(wb, `Apoio_Financeiro_${dataIni}_${dataFim}_${hoje}.xlsx`);
    setMsg("Excel exportado com sucesso.");
    setTimeout(() => setMsg(null), 3000);
  }

  // ── KPIs ──────────────────────────────────────────────────────────────────────
  const totalCP    = lancamentos.filter((l) => l.tipo === "pagar").reduce((s, l) => s + l.valor, 0);
  const totalCR    = lancamentos.filter((l) => l.tipo === "receber").reduce((s, l) => s + l.valor, 0);
  const abertoCP   = lancamentos.filter((l) => l.tipo === "pagar"   && statusApoio(l) === "aberto").reduce((s, l) => s + l.valor, 0);
  const abertoCR   = lancamentos.filter((l) => l.tipo === "receber" && statusApoio(l) === "aberto").reduce((s, l) => s + l.valor, 0);
  const exclCP     = apoioLancs.filter((a) => a.tipo === "pagar").reduce((s, a) => s + a.valor, 0);
  const exclCR     = apoioLancs.filter((a) => a.tipo === "receber").reduce((s, a) => s + a.valor, 0);

  // ── Filtragem compartilhado ────────────────────────────────────────────────────
  const lancsFiltrados = lancamentos.filter((l) => {
    if (filtroTipo && l.tipo !== filtroTipo) return false;
    if (filtroStatus) {
      const sa = statusApoio(l);
      if (filtroStatus !== sa) return false;
    }
    return true;
  });

  // ── Verificação de acesso ─────────────────────────────────────────────────────
  if (!podeAcessarPlano("apoio_financeiro")) {
    return (
      <div style={{ padding: 48, textAlign: "center" }}>
        <p style={{ fontSize: 15, color: "#555" }}>
          O módulo <strong>Apoio Financeiro</strong> não está habilitado para esta conta.
        </p>
      </div>
    );
  }

  // ─── Render ───────────────────────────────────────────────────────────────────
  return (
    <div style={{ padding: "24px 28px", maxWidth: 1300, fontFamily: "system-ui, sans-serif" }}>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: "#1a1a1a", margin: 0 }}>Apoio Financeiro</h1>
          <p style={{ fontSize: 13, color: "#888", margin: "3px 0 0" }}>
            Visão paralela do financeiro — não integrada ao LCDPR
          </p>
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <label style={{ ...lbl, margin: 0 }}>De</label>
            <input type="date" value={dataIni} onChange={(e) => setDataIni(e.target.value)} style={{ ...inp, width: 140 }} />
            <label style={{ ...lbl, margin: 0 }}>Até</label>
            <input type="date" value={dataFim} onChange={(e) => setDataFim(e.target.value)} style={{ ...inp, width: 140 }} />
          </div>
          <button onClick={carregar} style={btn("#1A4870")} disabled={carregando}>
            {carregando ? "…" : "Atualizar"}
          </button>
          <button onClick={exportarExcel} style={btn("#16A34A")} title="Exporta Excel com 3 abas: CP/CR Oficial, Apoio Exclusivo, Fluxo Consolidado">
            ↓ Exportar Excel
          </button>
        </div>
      </div>

      {msg && (
        <div style={{ background: "#F0FDF4", border: "0.5px solid #16A34A", borderRadius: 8, padding: "10px 16px", marginBottom: 16, fontSize: 13, color: "#166534" }}>
          {msg}
        </div>
      )}

      {/* KPI cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12, marginBottom: 24 }}>
        {[
          { label: "CP Oficial (total)", valor: fmtBRL(totalCP), sub: `${fmtBRL(abertoCP)} em aberto`, cor: "#E24B4A" },
          { label: "CR Oficial (total)", valor: fmtBRL(totalCR), sub: `${fmtBRL(abertoCR)} em aberto`, cor: "#16A34A" },
          { label: "Apoio Exclusivo — Pagar", valor: fmtBRL(exclCP), sub: `${apoioLancs.filter(a => a.tipo === "pagar" && !a.baixado).length} em aberto`, cor: "#C9921B" },
          { label: "Apoio Exclusivo — Receber", valor: fmtBRL(exclCR), sub: `${apoioLancs.filter(a => a.tipo === "receber" && !a.baixado).length} em aberto`, cor: "#378ADD" },
        ].map((k) => (
          <div key={k.label} style={{ ...card, borderLeft: `3px solid ${k.cor}` }}>
            <div style={{ fontSize: 11, color: "#888", fontWeight: 600, marginBottom: 4 }}>{k.label}</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: k.cor }}>{k.valor}</div>
            <div style={{ fontSize: 11, color: "#888", marginTop: 2 }}>{k.sub}</div>
          </div>
        ))}
      </div>

      {/* Abas */}
      <div style={{ display: "flex", gap: 0, borderBottom: "0.5px solid #DDE2EE", marginBottom: 20 }}>
        {([
          { id: "compartilhado", label: `CP/CR Compartilhado (${lancamentos.length})` },
          { id: "exclusivo",     label: `Apoio Exclusivo (${apoioLancs.length})` },
        ] as const).map((t) => (
          <button
            key={t.id}
            onClick={() => setAba(t.id)}
            style={{
              padding: "10px 20px", border: "none", background: "transparent", cursor: "pointer",
              fontSize: 13, fontWeight: aba === t.id ? 700 : 400,
              color: aba === t.id ? "#1A4870" : "#666",
              borderBottom: aba === t.id ? "2.5px solid #1A4870" : "2.5px solid transparent",
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ── Aba: Compartilhado ──────────────────────────────────────────────── */}
      {aba === "compartilhado" && (
        <div>
          {/* Filtros */}
          <div style={{ display: "flex", gap: 10, marginBottom: 14, flexWrap: "wrap" }}>
            <select value={filtroTipo} onChange={(e) => setFiltroTipo(e.target.value as typeof filtroTipo)} style={{ ...inp, width: 160 }}>
              <option value="">Todos os tipos</option>
              <option value="pagar">Contas a Pagar</option>
              <option value="receber">Contas a Receber</option>
            </select>
            <select value={filtroStatus} onChange={(e) => setFiltroStatus(e.target.value as typeof filtroStatus)} style={{ ...inp, width: 200 }}>
              <option value="">Todos os status</option>
              <option value="aberto">Aberto</option>
              <option value="baixado_apoio">Baixado (Apoio)</option>
              <option value="baixado_oficial">Baixado (Oficial)</option>
            </select>
            <span style={{ fontSize: 12, color: "#888", alignSelf: "center" }}>
              {lancsFiltrados.length} lançamento(s)
            </span>
          </div>

          <div style={{ ...card, padding: 0, overflow: "hidden" }}>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    {["Vencimento", "Tipo", "Descrição", "Categoria", "Valor", "Status Oficial", "Status Apoio", "Ação"].map((h) => (
                      <th key={h} style={th}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {lancsFiltrados.length === 0 && (
                    <tr>
                      <td colSpan={8} style={{ ...td, textAlign: "center", color: "#888", padding: 32 }}>
                        {carregando ? "Carregando…" : "Nenhum lançamento no período."}
                      </td>
                    </tr>
                  )}
                  {lancsFiltrados.map((l) => {
                    const sa = statusApoio(l);
                    const emAcao = acaoId === l.id;
                    const ba = baixaApoioPorLancId.get(l.id);
                    return (
                      <tr key={l.id} style={{ background: sa === "baixado_oficial" ? "#F9FFF9" : sa === "baixado_apoio" ? "#FFF8F0" : "#fff" }}>
                        <td style={td}>{fmtData(l.data_vencimento)}</td>
                        <td style={td}>
                          <span style={{
                            padding: "2px 8px", borderRadius: 4, fontSize: 11, fontWeight: 700,
                            background: l.tipo === "pagar" ? "#FEF2F2" : "#F0FDF4",
                            color: l.tipo === "pagar" ? "#E24B4A" : "#16A34A",
                          }}>
                            {l.tipo === "pagar" ? "Pagar" : "Receber"}
                          </span>
                        </td>
                        <td style={td}>{l.descricao}</td>
                        <td style={{ ...td, color: "#888", fontSize: 12 }}>{l.categoria ?? "—"}</td>
                        <td style={{ ...td, fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>
                          {fmtBRL(l.valor)}
                        </td>
                        <td style={td}>
                          <span style={{
                            padding: "2px 8px", borderRadius: 4, fontSize: 11, fontWeight: 700,
                            background: l.status === "baixado" ? "#F0FDF4" : "#FEF9EE",
                            color: l.status === "baixado" ? "#16A34A" : "#C9921B",
                          }}>
                            {l.status === "baixado" ? "Baixado" : "Aberto"}
                          </span>
                        </td>
                        <td style={td}>
                          {sa === "baixado_oficial" && (
                            <span style={{ fontSize: 12, color: "#16A34A", fontWeight: 600 }}>
                              ✓ Baixado (Oficial)
                            </span>
                          )}
                          {sa === "baixado_apoio" && (
                            <span style={{ fontSize: 12, color: "#C9921B", fontWeight: 600 }}>
                              ✓ Baixado (Apoio){ba?.data_baixa ? ` em ${fmtData(ba.data_baixa)}` : ""}
                            </span>
                          )}
                          {sa === "aberto" && (
                            <span style={{ fontSize: 12, color: "#888" }}>Aberto</span>
                          )}
                        </td>
                        <td style={td}>
                          {sa === "aberto" && (
                            <button
                              onClick={() => baixarNoApoio(l)}
                              disabled={emAcao}
                              style={btn("#C9921B")}
                            >
                              {emAcao ? "…" : "Baixar (Apoio)"}
                            </button>
                          )}
                          {sa === "baixado_apoio" && (
                            <button
                              onClick={() => desfazerBaixaApoio(l)}
                              disabled={emAcao}
                              style={btn("#888")}
                            >
                              {emAcao ? "…" : "Desfazer"}
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <p style={{ fontSize: 11, color: "#aaa", marginTop: 12 }}>
            ℹ️ "Baixar (Apoio)" registra a quitação apenas no contexto do Apoio Financeiro — não altera o sistema oficial e não entra no LCDPR.
          </p>
        </div>
      )}

      {/* ── Aba: Apoio Exclusivo ────────────────────────────────────────────── */}
      {aba === "exclusivo" && (
        <div>
          <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 14 }}>
            <button onClick={() => setModalAberto(true)} style={btn("#1A4870")}>
              + Novo Lançamento
            </button>
          </div>

          <div style={{ ...card, padding: 0, overflow: "hidden" }}>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    {["Vencimento", "Tipo", "Descrição", "Pessoa/Fornecedor", "Categoria", "Valor", "Status", "Ações"].map((h) => (
                      <th key={h} style={th}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {apoioLancs.length === 0 && (
                    <tr>
                      <td colSpan={8} style={{ ...td, textAlign: "center", color: "#888", padding: 32 }}>
                        {carregando ? "Carregando…" : "Nenhum lançamento exclusivo cadastrado."}
                      </td>
                    </tr>
                  )}
                  {apoioLancs.map((a) => {
                    const emAcao = acaoId === a.id;
                    return (
                      <tr key={a.id} style={{ background: a.baixado ? "#F9FFF9" : "#fff" }}>
                        <td style={td}>{fmtData(a.data_vencimento)}</td>
                        <td style={td}>
                          <span style={{
                            padding: "2px 8px", borderRadius: 4, fontSize: 11, fontWeight: 700,
                            background: a.tipo === "pagar" ? "#FEF2F2" : "#F0FDF4",
                            color: a.tipo === "pagar" ? "#E24B4A" : "#16A34A",
                          }}>
                            {a.tipo === "pagar" ? "Pagar" : "Receber"}
                          </span>
                        </td>
                        <td style={td}>{a.descricao}</td>
                        <td style={{ ...td, color: "#555" }}>{a.pessoa_nome ?? "—"}</td>
                        <td style={{ ...td, color: "#888", fontSize: 12 }}>{a.categoria ?? "—"}</td>
                        <td style={{ ...td, fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>
                          {fmtBRL(a.valor)}
                        </td>
                        <td style={td}>
                          {a.baixado ? (
                            <span style={{ fontSize: 11, fontWeight: 700, color: "#16A34A" }}>
                              ✓ Baixado{a.data_baixa ? ` ${fmtData(a.data_baixa)}` : ""}
                            </span>
                          ) : (
                            <span style={{ fontSize: 11, color: "#C9921B", fontWeight: 600 }}>Aberto</span>
                          )}
                        </td>
                        <td style={td}>
                          <div style={{ display: "flex", gap: 6 }}>
                            {!a.baixado ? (
                              <button onClick={() => baixarApoioExclusivo(a)} disabled={emAcao} style={btn("#C9921B")}>
                                {emAcao ? "…" : "Baixar"}
                              </button>
                            ) : (
                              <button onClick={() => desfazerBaixaExclusivo(a)} disabled={emAcao} style={btn("#888")}>
                                {emAcao ? "…" : "Reabrir"}
                              </button>
                            )}
                            <button onClick={() => excluirApoioExclusivo(a)} disabled={emAcao} style={btn("#E24B4A")}>
                              {emAcao ? "…" : "Excluir"}
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <p style={{ fontSize: 11, color: "#aaa", marginTop: 12 }}>
            ℹ️ Lançamentos aqui são exclusivos do Apoio Financeiro. Não aparecem no sistema oficial nem no LCDPR.
          </p>
        </div>
      )}

      {/* ── Modal novo lançamento exclusivo ──────────────────────────────────── */}
      {modalAberto && (
        <div
          onClick={() => setModalAberto(false)}
          style={{
            position: "fixed", inset: 0, background: "rgba(0,0,0,0.35)", zIndex: 1000,
            display: "flex", alignItems: "center", justifyContent: "center",
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{ ...card, width: 520, maxWidth: "95vw", boxShadow: "0 8px 32px rgba(0,0,0,0.15)" }}
          >
            <h3 style={{ margin: "0 0 18px", fontSize: 16, fontWeight: 700, color: "#1a1a1a" }}>
              Novo Lançamento — Apoio Exclusivo
            </h3>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
              <div>
                <label style={lbl}>Tipo *</label>
                <select
                  value={formApoio.tipo}
                  onChange={(e) => setFormApoio({ ...formApoio, tipo: e.target.value as "pagar" | "receber" })}
                  style={{ ...inp, width: "100%" }}
                >
                  <option value="pagar">Contas a Pagar</option>
                  <option value="receber">Contas a Receber</option>
                </select>
              </div>
              <div>
                <label style={lbl}>Vencimento *</label>
                <input
                  type="date"
                  value={formApoio.data_vencimento}
                  onChange={(e) => setFormApoio({ ...formApoio, data_vencimento: e.target.value })}
                  style={{ ...inp, width: "100%" }}
                />
              </div>
              <div style={{ gridColumn: "1 / -1" }}>
                <label style={lbl}>Descrição *</label>
                <input
                  type="text"
                  placeholder="Ex: Pagamento pessoal - aluguel"
                  value={formApoio.descricao}
                  onChange={(e) => setFormApoio({ ...formApoio, descricao: e.target.value })}
                  style={{ ...inp, width: "100%" }}
                />
              </div>
              <div>
                <label style={lbl}>Valor (R$)</label>
                <input
                  type="text"
                  placeholder="0,00"
                  value={formApoio.valorMask}
                  onChange={(e) => setFormApoio({ ...formApoio, valorMask: e.target.value })}
                  style={{ ...inp, width: "100%" }}
                />
              </div>
              <div>
                <label style={lbl}>Pessoa / Fornecedor</label>
                <input
                  type="text"
                  placeholder="Nome livre"
                  value={formApoio.pessoa_nome}
                  onChange={(e) => setFormApoio({ ...formApoio, pessoa_nome: e.target.value })}
                  style={{ ...inp, width: "100%" }}
                />
              </div>
              <div>
                <label style={lbl}>Categoria</label>
                <input
                  type="text"
                  placeholder="Ex: Pessoal, Família…"
                  value={formApoio.categoria}
                  onChange={(e) => setFormApoio({ ...formApoio, categoria: e.target.value })}
                  style={{ ...inp, width: "100%" }}
                />
              </div>
              <div>
                <label style={lbl}>Observação</label>
                <input
                  type="text"
                  value={formApoio.observacao}
                  onChange={(e) => setFormApoio({ ...formApoio, observacao: e.target.value })}
                  style={{ ...inp, width: "100%" }}
                />
              </div>
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 20 }}>
              <button onClick={() => setModalAberto(false)} style={{ ...btn("#F4F6FA", "#555"), border: "0.5px solid #DDE2EE" }}>
                Cancelar
              </button>
              <button
                onClick={salvarApoioLanc}
                disabled={salvando || !formApoio.descricao || !formApoio.data_vencimento}
                style={btn("#1A4870")}
              >
                {salvando ? "Salvando…" : "Salvar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
