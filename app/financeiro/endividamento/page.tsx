"use client";
import { useState, useEffect, useCallback } from "react";
import { createBrowserClient } from "@supabase/ssr";
import { useAuth } from "../../../components/AuthProvider";
import TopNav from "../../../components/TopNav";
import type { ContratoFinanceiro, ParcelaPagamento, GarantiaContrato } from "../../../lib/supabase";

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
);

const TIPO_LABEL: Record<string, string> = {
  custeio: "Custeio",
  investimento: "Investimento",
  securitizacao: "Securitização",
  cpr: "CPR",
  egf: "EGF",
  outros: "Outros",
};
const TIPO_COR: Record<string, string> = {
  custeio: "#1A4870",
  investimento: "#16A34A",
  securitizacao: "#C9921B",
  cpr: "#7C3AED",
  egf: "#0891B2",
  outros: "#6B7280",
};
const TIPO_BG: Record<string, string> = {
  custeio: "#D5E8F5",
  investimento: "#DCFCE7",
  securitizacao: "#FBF3E0",
  cpr: "#EDE9FE",
  egf: "#CFFAFE",
  outros: "#F3F4F6",
};
const GARANTIA_LABEL: Record<string, string> = {
  alienacao_fiduciaria: "Alien. Fiduciária",
  hipoteca: "Hipoteca",
  penhor_rural: "Penhor Rural",
  aval: "Aval",
  nota_promissoria: "N. Promissória",
  cpr_garantia: "CPR Garantia",
  cessao_recebiveis: "Cessão Recebíveis",
  outros: "Outros",
};

const fmtBRL = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2 });
const fmtN = (v: number, d = 2) => v.toLocaleString("pt-BR", { minimumFractionDigits: d, maximumFractionDigits: d });
const fmtPct = (v: number) => `${fmtN(v, 1)}%`;
const fmtData = (s: string) => {
  if (!s) return "—";
  const [y, m, d] = s.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
};
const hoje = new Date().toISOString().slice(0, 10);

interface ContratoEnriquecido extends ContratoFinanceiro {
  saldoDevedor: number;
  totalPago: number;
  jurosAcumulados: number;
  proximoVencimento: string | null;
  totalParcelas: number;
  parcelasPagas: number;
  parcelasVencidas: number;
  garantias: GarantiaContrato[];
  valorGarantias: number;
  parcelas: ParcelaPagamento[];
}

export default function RelatorioEndividamento() {
  const { fazendaId } = useAuth();
  const [contratos, setContratos] = useState<ContratoEnriquecido[]>([]);
  const [loading, setLoading] = useState(true);
  const [filtroTipo, setFiltroTipo] = useState("");
  const [filtroStatus, setFiltroStatus] = useState("ativo");
  const [filtroMoeda, setFiltroMoeda] = useState("");
  const [expandido, setExpandido] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    if (!fazendaId) return;
    setLoading(true);
    try {
      const { data: ctsRaw } = await supabase
        .from("contratos_financeiros")
        .select("*")
        .eq("fazenda_id", fazendaId)
        .order("data_contrato");

      if (!ctsRaw) { setContratos([]); return; }

      const ids = ctsRaw.map((c: ContratoFinanceiro) => c.id);
      const [{ data: parcsAll }, { data: garsAll }] = await Promise.all([
        ids.length > 0
          ? supabase.from("parcelas_pagamento").select("*").in("contrato_id", ids).order("data_vencimento")
          : { data: [] as ParcelaPagamento[] },
        ids.length > 0
          ? supabase.from("garantias_contrato").select("*").in("contrato_id", ids)
          : { data: [] as GarantiaContrato[] },
      ]);

      const enriched: ContratoEnriquecido[] = (ctsRaw as ContratoFinanceiro[]).map(c => {
        const parcelas = ((parcsAll ?? []) as ParcelaPagamento[]).filter(p => p.contrato_id === c.id);
        const pagas = parcelas.filter(p => p.status === "pago");
        const emAberto = parcelas.filter(p => p.status !== "pago").sort((a, b) => a.data_vencimento.localeCompare(b.data_vencimento));
        const vencidas = parcelas.filter(p => p.status === "vencido");
        const garantias = ((garsAll ?? []) as GarantiaContrato[]).filter(g => g.contrato_id === c.id);

        // Saldo devedor = saldo_devedor da última parcela paga, ou valor total se nenhuma paga
        const ultimaPaga = pagas.sort((a, b) => b.num_parcela - a.num_parcela)[0];
        const primeiraPendente = emAberto[0];
        const saldoDevedor = ultimaPaga?.saldo_devedor ?? c.valor_financiado;
        const totalPago = pagas.reduce((s, p) => s + p.amortizacao, 0);
        const jurosAcumulados = pagas.reduce((s, p) => s + p.juros, 0);
        const proximoVencimento = primeiraPendente?.data_vencimento ?? null;
        const valorGarantias = garantias.reduce((s, g) => s + (g.valor_avaliacao ?? 0), 0);

        return {
          ...c,
          saldoDevedor,
          totalPago,
          jurosAcumulados,
          proximoVencimento,
          totalParcelas: parcelas.length,
          parcelasPagas: pagas.length,
          parcelasVencidas: vencidas.length,
          garantias,
          valorGarantias,
          parcelas,
        };
      });

      setContratos(enriched);
    } finally {
      setLoading(false);
    }
  }, [fazendaId]);

  useEffect(() => { carregar(); }, [carregar]);

  const filtrados = contratos.filter(c => {
    if (filtroTipo && c.tipo !== filtroTipo) return false;
    if (filtroStatus && c.status !== filtroStatus) return false;
    if (filtroMoeda && c.moeda !== filtroMoeda) return false;
    return true;
  });

  // Totais
  const totalCaptado = filtrados.reduce((s, c) => s + c.valor_financiado, 0);
  const totalSaldo   = filtrados.reduce((s, c) => s + c.saldoDevedor, 0);
  const totalPago    = filtrados.reduce((s, c) => s + c.totalPago, 0);
  const totalJuros   = filtrados.reduce((s, c) => s + c.jurosAcumulados, 0);
  const totalGarantias = filtrados.reduce((s, c) => s + c.valorGarantias, 0);

  // Agrupamento por tipo para subtotais
  const tipos = [...new Set(filtrados.map(c => c.tipo))];

  async function exportarXLSX() {
    const XLSX = await import("xlsx");
    const rows = filtrados.map(c => ({
      "Instituição": c.credor,
      "Tipo": TIPO_LABEL[c.tipo] ?? c.tipo,
      "Linha de Crédito": c.linha_credito ?? "",
      "Nº Documento": c.numero_documento ?? "",
      "Moeda": c.moeda,
      "Valor Captado": c.valor_financiado,
      "Total Pago (Amort.)": c.totalPago,
      "Saldo Devedor": c.saldoDevedor,
      "% Quitado": c.valor_financiado > 0 ? ((c.totalPago / c.valor_financiado) * 100).toFixed(1) + "%" : "0%",
      "Juros Acumulados": c.jurosAcumulados,
      "Taxa Juros aa (%)": c.taxa_juros_aa ?? "",
      "Data Contrato": fmtData(c.data_contrato),
      "Próx. Vencimento": c.proximoVencimento ? fmtData(c.proximoVencimento) : "",
      "Parcelas Pagas": c.parcelasPagas,
      "Parcelas Total": c.totalParcelas,
      "Parcelas Vencidas": c.parcelasVencidas,
      "Valor Garantias": c.valorGarantias,
      "Status": c.status,
    }));

    const wbData = XLSX.utils.aoa_to_sheet([
      ["RELATÓRIO DE ENDIVIDAMENTO — CAPITAL DE TERCEIROS"],
      [`Data: ${fmtData(hoje)}`],
      [`Contratos: ${filtrados.length} | Total Captado: ${fmtBRL(totalCaptado)} | Saldo Devedor: ${fmtBRL(totalSaldo)}`],
      [],
    ]);
    const ws = XLSX.utils.sheet_add_json(wbData, rows, { origin: "A5" });

    const wsParcelas = XLSX.utils.json_to_sheet(
      filtrados.flatMap(c =>
        c.parcelas.map(p => ({
          "Contrato": c.descricao,
          "Instituição": c.credor,
          "Parcela": p.num_parcela,
          "Vencimento": fmtData(p.data_vencimento),
          "Amortização": p.amortizacao,
          "Juros": p.juros,
          "Encargos": p.despesas_acessorios,
          "Valor Parcela": p.valor_parcela,
          "Saldo Devedor": p.saldo_devedor,
          "Status": p.status,
        }))
      )
    );

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Endividamento");
    XLSX.utils.book_append_sheet(wb, wsParcelas, "Parcelas");
    XLSX.writeFile(wb, `Endividamento_${hoje}.xlsx`);
  }

  const card = (titulo: string, valor: string, cor: string, sub?: string) => (
    <div style={{ background: "#fff", borderRadius: 12, border: "0.5px solid #DDE2EE", padding: "16px 20px", flex: 1, minWidth: 160 }}>
      <div style={{ fontSize: 11, color: "#888", fontWeight: 600, textTransform: "uppercase", marginBottom: 6 }}>{titulo}</div>
      <div style={{ fontSize: 22, fontWeight: 700, color: cor }}>{valor}</div>
      {sub && <div style={{ fontSize: 11, color: "#888", marginTop: 4 }}>{sub}</div>}
    </div>
  );

  function abrirPreviewEndividamento() {
    const win = window.open("", "_blank");
    if (!win) { alert("Permita popups neste site para visualizar o documento."); return; }
    const emissao = new Date().toLocaleString("pt-BR",{day:"2-digit",month:"2-digit",year:"numeric",hour:"2-digit",minute:"2-digit"});
    const linhas = filtrados.flatMap(c =>
      c.parcelas.map((p, pi) => {
        const stCss = p.status === "pago" ? "background:#DCFCE7;color:#166534" : p.status === "vencido" ? "background:#FEE2E2;color:#991B1B" : "background:#EBF3FC;color:#0C447C";
        return `<tr style="background:${pi%2===0?"#fff":"#F8FAFC"}">
          <td style="padding:3px 8px">${c.credor}</td>
          <td style="padding:3px 8px;color:#888;font-size:10px">${TIPO_LABEL[c.tipo]??c.tipo}</td>
          <td style="padding:3px 8px;text-align:center">${p.num_parcela}</td>
          <td style="padding:3px 8px;white-space:nowrap">${p.data_vencimento.split("-").reverse().join("/")}</td>
          <td style="padding:3px 8px;text-align:right;font-family:monospace">${fmtBRL(p.amortizacao)}</td>
          <td style="padding:3px 8px;text-align:right;font-family:monospace;color:#C9921B">${fmtBRL(p.juros)}</td>
          <td style="padding:3px 8px;text-align:right;font-family:monospace;font-weight:700">${fmtBRL(p.valor_parcela)}</td>
          <td style="padding:3px 8px;text-align:right;color:#E24B4A">${fmtBRL(p.saldo_devedor)}</td>
          <td style="padding:3px 8px;text-align:center"><span style="padding:1px 7px;border-radius:4px;font-size:9px;font-weight:700;${stCss}">${p.status==="pago"?"Pago":p.status==="vencido"?"Vencido":"Em aberto"}</span></td>
        </tr>`;
      })
    ).join("");
    win.document.write(`<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8">
<title>RacTech — Relatório de Endividamento</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:system-ui,sans-serif;background:#D1D5DB;color:#1a1a1a}
  .toolbar{position:sticky;top:0;background:#1A4870;padding:10px 24px;display:flex;align-items:center;justify-content:space-between;z-index:100;box-shadow:0 2px 8px rgba(0,0,0,.2)}
  .toolbar-title{color:#fff;font-size:13px;font-weight:600}
  .btn-print{display:flex;align-items:center;gap:8px;background:#fff;color:#1A4870;border:none;padding:8px 20px;border-radius:8px;font-size:13px;font-weight:700;cursor:pointer}
  .btn-print:hover{background:#f0f5fa}
  .page-wrapper{display:flex;justify-content:center;padding:28px}
  .page{background:#fff;width:297mm;padding:14mm 16mm;box-shadow:0 4px 24px rgba(0,0,0,.18)}
  table{width:100%;border-collapse:collapse;font-size:10px}
  th{padding:5px 8px;background:#1A4870;color:#fff;font-weight:700;font-size:9px;text-align:right;white-space:nowrap}
  th:first-child,th:nth-child(2){text-align:left}
  td{padding:3px 8px;border-bottom:.5px solid #EEF1F6;vertical-align:middle}
  @media print{
    @page{size:A4 landscape;margin:12mm 14mm}
    body{background:#fff}
    .toolbar{display:none!important}
    .page-wrapper{padding:0}
    .page{box-shadow:none;width:100%;padding:0}
  }
</style></head><body>
<div class="toolbar">
  <span class="toolbar-title">RacTech — Relatório de Endividamento</span>
  <button class="btn-print" onclick="window.print()">&#128438; Imprimir / Salvar PDF</button>
</div>
<div class="page-wrapper"><div class="page">
  <div style="background:#1A4870;padding:10px 14px;display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;border-radius:4px">
    <div style="display:flex;align-items:baseline;gap:10px">
      <span style="font-size:20px;font-weight:900;color:#fff;letter-spacing:-.5px">RacTech</span>
      <span style="font-size:10px;color:rgba(255,255,255,.55);font-style:italic">Menos cliques, mais campo</span>
    </div>
    <div style="text-align:right">
      <div style="font-size:9px;color:rgba(255,255,255,.6)">Emitido em ${emissao}</div>
    </div>
  </div>
  <div style="border-bottom:2px solid #1A4870;padding-bottom:7px;margin-bottom:14px">
    <div style="font-size:9px;color:#888;text-transform:uppercase;letter-spacing:.08em;margin-bottom:2px">Financeiro — Capital de Terceiros</div>
    <div style="font-size:16px;font-weight:800;color:#1A4870">Relatório de Endividamento</div>
    <div style="font-size:10px;color:#555;margin-top:3px">${filtrados.length} contrato${filtrados.length!==1?"s":""} · Total Captado: ${fmtBRL(totalCaptado)} · Saldo Devedor: ${fmtBRL(totalSaldo)} · Amortizado: ${fmtBRL(totalPago)}</div>
  </div>
  <table>
    <thead><tr>
      <th style="text-align:left">Instituição</th>
      <th style="text-align:left">Tipo</th>
      <th style="text-align:center">Parc.</th>
      <th>Vencimento</th>
      <th>Amortização</th>
      <th>Juros</th>
      <th>Valor Parcela</th>
      <th>Saldo Devedor</th>
      <th style="text-align:center">Status</th>
    </tr></thead>
    <tbody>${linhas}</tbody>
  </table>
  <div style="display:flex;justify-content:space-between;align-items:flex-end;margin-top:14px;padding-top:8px;border-top:1.5px solid #1A4870">
    <div style="display:flex;gap:28px">
      <div><div style="font-size:9px;color:#888;font-weight:700;text-transform:uppercase;margin-bottom:2px">Total Captado</div><div style="font-size:12px;font-weight:800;color:#1A4870">${fmtBRL(totalCaptado)}</div></div>
      <div><div style="font-size:9px;color:#888;font-weight:700;text-transform:uppercase;margin-bottom:2px">Saldo Devedor</div><div style="font-size:12px;font-weight:800;color:#E24B4A">${fmtBRL(totalSaldo)}</div></div>
      <div><div style="font-size:9px;color:#888;font-weight:700;text-transform:uppercase;margin-bottom:2px">Total Amortizado</div><div style="font-size:12px;font-weight:800;color:#16A34A">${fmtBRL(totalPago)}</div></div>
      <div><div style="font-size:9px;color:#888;font-weight:700;text-transform:uppercase;margin-bottom:2px">Juros Pagos</div><div style="font-size:12px;font-weight:800;color:#C9921B">${fmtBRL(totalJuros)}</div></div>
    </div>
    <div style="font-size:9px;color:#aaa">Gerado pelo RacTech · ${new Date().toLocaleDateString("pt-BR")}</div>
  </div>
</div></div>
</body></html>`);
    win.document.close();
  }

  return (
    <>
      <TopNav />
      <div style={{ padding: "24px 32px", background: "#F4F6FA", minHeight: "100vh" }}>
        {/* Cabeçalho */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
          <div>
            <h1 style={{ fontSize: 20, fontWeight: 700, color: "#1a1a1a", margin: 0 }}>Relatório de Endividamento</h1>
            <div style={{ fontSize: 13, color: "#888", marginTop: 2 }}>Capital de Terceiros — visão consolidada</div>
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <button onClick={abrirPreviewEndividamento}
              style={{ padding: "8px 18px", background: "#F0F5FA", border: "0.5px solid #1A487040", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer", color: "#1A4870" }}>
              PDF / Imprimir
            </button>
            <button onClick={exportarXLSX}
              style={{ padding: "8px 18px", background: "#16A34A", color: "#fff", border: "none", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
              Exportar XLSX
            </button>
          </div>
        </div>

        {/* Filtros */}
        <div style={{ display: "flex", gap: 10, marginBottom: 20, flexWrap: "wrap" }}>
          {[
            { label: "Todos os status", val: "", field: "status" },
            { label: "Ativos", val: "ativo", field: "status" },
            { label: "Quitados", val: "quitado", field: "status" },
          ].map(f => (
            <button key={f.val} onClick={() => setFiltroStatus(f.val)}
              style={{ padding: "6px 14px", borderRadius: 20, border: "0.5px solid #DDE2EE", fontSize: 12,
                background: filtroStatus === f.val ? "#1A4870" : "#fff", color: filtroStatus === f.val ? "#fff" : "#555", cursor: "pointer" }}>
              {f.label}
            </button>
          ))}
          <div style={{ width: 1, background: "#DDE2EE", margin: "0 4px" }} />
          <select value={filtroTipo} onChange={e => setFiltroTipo(e.target.value)}
            style={{ padding: "6px 12px", borderRadius: 8, border: "0.5px solid #DDE2EE", fontSize: 12, background: "#fff", color: "#555", cursor: "pointer" }}>
            <option value="">Todos os tipos</option>
            {Object.entries(TIPO_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
          <select value={filtroMoeda} onChange={e => setFiltroMoeda(e.target.value)}
            style={{ padding: "6px 12px", borderRadius: 8, border: "0.5px solid #DDE2EE", fontSize: 12, background: "#fff", color: "#555", cursor: "pointer" }}>
            <option value="">Todas as moedas</option>
            <option value="BRL">BRL</option>
            <option value="USD">USD</option>
          </select>
        </div>

        <div>
          {/* KPI Cards */}
          <div style={{ display: "flex", gap: 12, marginBottom: 20, flexWrap: "wrap" }}>
            {card("Total Captado", fmtBRL(totalCaptado), "#1A4870", `${filtrados.length} contratos`)}
            {card("Saldo Devedor", fmtBRL(totalSaldo), "#E24B4A",
              totalCaptado > 0 ? `${fmtPct((totalSaldo / totalCaptado) * 100)} do total captado` : undefined)}
            {card("Total Amortizado", fmtBRL(totalPago), "#16A34A",
              totalCaptado > 0 ? `${fmtPct((totalPago / totalCaptado) * 100)} quitado` : undefined)}
            {card("Juros Pagos", fmtBRL(totalJuros), "#C9921B")}
            {card("Valor em Garantias", fmtBRL(totalGarantias), "#7C3AED",
              totalSaldo > 0 ? `Cobertura: ${fmtPct((totalGarantias / totalSaldo) * 100)}` : undefined)}
          </div>

          {loading ? (
            <div style={{ textAlign: "center", padding: 60, color: "#888" }}>Carregando contratos...</div>
          ) : filtrados.length === 0 ? (
            <div style={{ textAlign: "center", padding: 60, background: "#fff", borderRadius: 12, border: "0.5px solid #DDE2EE" }}>
              <div style={{ fontSize: 36, marginBottom: 12 }}>🏦</div>
              <div style={{ fontSize: 15, fontWeight: 600, color: "#555" }}>Nenhum contrato encontrado</div>
              <div style={{ fontSize: 13, color: "#888", marginTop: 4 }}>Cadastre contratos financeiros em Financeiro → Contratos Financeiros.</div>
            </div>
          ) : (
            <>
              {tipos.map(tipo => {
                const grupo = filtrados.filter(c => c.tipo === tipo);
                const subTotalCaptado = grupo.reduce((s, c) => s + c.valor_financiado, 0);
                const subTotalSaldo   = grupo.reduce((s, c) => s + c.saldoDevedor, 0);
                const subTotalPago    = grupo.reduce((s, c) => s + c.totalPago, 0);
                const subTotalJuros   = grupo.reduce((s, c) => s + c.jurosAcumulados, 0);
                return (
                  <div key={tipo} style={{ marginBottom: 24 }}>
                    {/* Cabeçalho do grupo */}
                    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                      <span style={{ padding: "3px 12px", background: TIPO_BG[tipo] ?? "#F3F4F6", color: TIPO_COR[tipo] ?? "#555",
                        borderRadius: 20, fontSize: 12, fontWeight: 700 }}>
                        {TIPO_LABEL[tipo] ?? tipo}
                      </span>
                      <span style={{ fontSize: 12, color: "#888" }}>
                        {grupo.length} contrato{grupo.length !== 1 ? "s" : ""} &nbsp;·&nbsp;
                        Captado: <strong>{fmtBRL(subTotalCaptado)}</strong> &nbsp;·&nbsp;
                        Saldo: <strong style={{ color: "#E24B4A" }}>{fmtBRL(subTotalSaldo)}</strong> &nbsp;·&nbsp;
                        Amortizado: <strong style={{ color: "#16A34A" }}>{fmtBRL(subTotalPago)}</strong> &nbsp;·&nbsp;
                        Juros pagos: <strong style={{ color: "#C9921B" }}>{fmtBRL(subTotalJuros)}</strong>
                      </span>
                    </div>

                    {/* Tabela */}
                    <div style={{ background: "#fff", borderRadius: 12, border: "0.5px solid #DDE2EE", overflow: "hidden" }}>
                      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                        <thead>
                          <tr style={{ background: "#F8FAFC" }}>
                            <th style={{ ...th, textAlign: "left", paddingLeft: 16 }}>Instituição</th>
                            <th style={{ ...th, textAlign: "left" }}>Linha / Nº Doc</th>
                            <th style={th}>Moeda</th>
                            <th style={th}>Valor Captado</th>
                            <th style={th}>Amortizado</th>
                            <th style={{ ...th, color: "#E24B4A" }}>Saldo Devedor</th>
                            <th style={th}>% Quitado</th>
                            <th style={th}>Taxa aa</th>
                            <th style={th}>Próx. Venc.</th>
                            <th style={th}>Garantias</th>
                            <th style={th}>Status</th>
                            <th style={{ ...th }}></th>
                          </tr>
                        </thead>
                        <tbody>
                          {grupo.map((c, i) => {
                            const pctQ = c.valor_financiado > 0 ? (c.totalPago / c.valor_financiado) * 100 : 0;
                            const vencidaBadge = c.parcelasVencidas > 0;
                            const isExp = expandido === c.id;
                            return (
                              <>
                                <tr key={c.id} style={{ background: i % 2 === 0 ? "#fff" : "#FAFBFC",
                                  borderTop: "0.5px solid #F0F0F0" }}>
                                  <td style={{ ...td, paddingLeft: 16 }}>
                                    <div style={{ fontWeight: 600, color: "#1a1a1a" }}>{c.credor}</div>
                                    <div style={{ fontSize: 11, color: "#888" }}>{fmtData(c.data_contrato)}</div>
                                  </td>
                                  <td style={td}>
                                    <div style={{ color: "#555" }}>{c.linha_credito ?? "—"}</div>
                                    {c.numero_documento && <div style={{ fontSize: 11, color: "#888" }}>{c.numero_documento}</div>}
                                  </td>
                                  <td style={{ ...td, textAlign: "center" }}>
                                    <span style={{ padding: "2px 8px", background: c.moeda === "USD" ? "#FBF3E0" : "#D5E8F5",
                                      color: c.moeda === "USD" ? "#C9921B" : "#1A4870", borderRadius: 10, fontSize: 11, fontWeight: 700 }}>
                                      {c.moeda}
                                    </span>
                                  </td>
                                  <td style={{ ...td, textAlign: "right", fontWeight: 600 }}>
                                    {fmtBRL(c.valor_financiado)}
                                    {c.moeda === "USD" && c.valor_cotacao && (
                                      <div style={{ fontSize: 10, color: "#888" }}>PTAX: {fmtBRL(c.valor_cotacao)}</div>
                                    )}
                                  </td>
                                  <td style={{ ...td, textAlign: "right", color: "#16A34A", fontWeight: 600 }}>{fmtBRL(c.totalPago)}</td>
                                  <td style={{ ...td, textAlign: "right", color: "#E24B4A", fontWeight: 700 }}>{fmtBRL(c.saldoDevedor)}</td>
                                  <td style={{ ...td, textAlign: "center" }}>
                                    <div style={{ display: "flex", alignItems: "center", gap: 6, justifyContent: "center" }}>
                                      <div style={{ width: 48, height: 5, background: "#EEE", borderRadius: 4, overflow: "hidden" }}>
                                        <div style={{ width: `${Math.min(100, pctQ)}%`, height: "100%", background: pctQ >= 100 ? "#16A34A" : "#1A4870", borderRadius: 4 }} />
                                      </div>
                                      <span style={{ fontSize: 11, color: "#555" }}>{fmtPct(pctQ)}</span>
                                    </div>
                                  </td>
                                  <td style={{ ...td, textAlign: "center", color: "#555" }}>
                                    {c.taxa_juros_aa != null ? `${fmtN(c.taxa_juros_aa, 2)}%` : "—"}
                                  </td>
                                  <td style={{ ...td, textAlign: "center" }}>
                                    {c.proximoVencimento ? (
                                      <span style={{
                                        color: c.proximoVencimento < hoje ? "#E24B4A" : c.proximoVencimento <= new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10) ? "#C9921B" : "#16A34A",
                                        fontWeight: 600, fontSize: 12,
                                      }}>
                                        {fmtData(c.proximoVencimento)}
                                      </span>
                                    ) : (
                                      <span style={{ color: "#16A34A", fontSize: 11 }}>Quitado</span>
                                    )}
                                    {vencidaBadge && (
                                      <div style={{ fontSize: 10, color: "#E24B4A" }}>{c.parcelasVencidas} vencida{c.parcelasVencidas > 1 ? "s" : ""}</div>
                                    )}
                                  </td>
                                  <td style={{ ...td, textAlign: "center" }}>
                                    {c.garantias.length > 0 ? (
                                      <div>
                                        <span style={{ fontSize: 11, color: "#7C3AED", fontWeight: 600 }}>{c.garantias.length}</span>
                                        <div style={{ fontSize: 10, color: "#888" }}>{fmtBRL(c.valorGarantias)}</div>
                                      </div>
                                    ) : <span style={{ color: "#CCC" }}>—</span>}
                                  </td>
                                  <td style={{ ...td, textAlign: "center" }}>
                                    <span style={{
                                      padding: "2px 8px", borderRadius: 10, fontSize: 11, fontWeight: 700,
                                      background: c.status === "ativo" ? "#D5E8F5" : c.status === "quitado" ? "#DCFCE7" : "#F3F4F6",
                                      color: c.status === "ativo" ? "#1A4870" : c.status === "quitado" ? "#16A34A" : "#888",
                                    }}>
                                      {c.status === "ativo" ? "Ativo" : c.status === "quitado" ? "Quitado" : "Cancelado"}
                                    </span>
                                  </td>
                                  <td style={td}>
                                    {c.parcelas.length > 0 && (
                                      <button onClick={() => setExpandido(isExp ? null : c.id)}
                                        style={{ padding: "4px 10px", background: "#F0F5FA", border: "0.5px solid #DDE2EE", borderRadius: 6, fontSize: 11, cursor: "pointer", color: "#1A4870" }}>
                                        {isExp ? "▲ Fechar" : "▼ Parcelas"}
                                      </button>
                                    )}
                                  </td>
                                </tr>

                                {/* Expansão de parcelas */}
                                {isExp && (
                                  <tr key={`${c.id}-parcelas`}>
                                    <td colSpan={12} style={{ padding: "0 16px 12px", background: "#F8FAFF" }}>
                                      <div style={{ paddingTop: 10 }}>
                                        {/* Garantias */}
                                        {c.garantias.length > 0 && (
                                          <div style={{ marginBottom: 10 }}>
                                            <div style={{ fontSize: 11, fontWeight: 700, color: "#7C3AED", marginBottom: 6 }}>GARANTIAS</div>
                                            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                                              {c.garantias.map(g => (
                                                <div key={g.id} style={{ padding: "6px 12px", background: "#EDE9FE", borderRadius: 8, fontSize: 11 }}>
                                                  <span style={{ fontWeight: 700, color: "#7C3AED" }}>{GARANTIA_LABEL[g.tipo_garantia ?? ""] ?? g.tipo_garantia ?? "Garantia"}</span>
                                                  {g.tipo_bem && <span style={{ color: "#555" }}> · {g.tipo_bem}</span>}
                                                  {g.descricao && <span style={{ color: "#888" }}> — {g.descricao}</span>}
                                                  {g.valor_avaliacao != null && <span style={{ fontWeight: 600, color: "#1a1a1a" }}> · {fmtBRL(g.valor_avaliacao)}</span>}
                                                </div>
                                              ))}
                                            </div>
                                          </div>
                                        )}
                                        {/* Parcelas */}
                                        <div style={{ fontSize: 11, fontWeight: 700, color: "#555", marginBottom: 6 }}>
                                          PARCELAS ({c.parcelas.length} · {c.parcelasPagas} pagas)
                                        </div>
                                        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
                                          <thead>
                                            <tr style={{ background: "#EEF2FF" }}>
                                              {["#", "Vencimento", "Amortização", "Juros", "Encargos", "Valor Parcela", "Saldo Devedor", "Status"].map(h => (
                                                <th key={h} style={{ padding: "5px 10px", textAlign: h === "#" || h === "Status" ? "center" : "right", fontWeight: 700, color: "#555", borderBottom: "0.5px solid #DDE2EE" }}>{h}</th>
                                              ))}
                                            </tr>
                                          </thead>
                                          <tbody>
                                            {c.parcelas.map((p, pi) => (
                                              <tr key={p.id} style={{ background: pi % 2 === 0 ? "#fff" : "#F9FAFC", borderBottom: "0.5px solid #F0F0F0" }}>
                                                <td style={{ padding: "4px 10px", textAlign: "center", color: "#888" }}>{p.num_parcela}</td>
                                                <td style={{ padding: "4px 10px", textAlign: "right", color: p.data_vencimento < hoje && p.status !== "pago" ? "#E24B4A" : "#555" }}>{fmtData(p.data_vencimento)}</td>
                                                <td style={{ padding: "4px 10px", textAlign: "right" }}>{fmtBRL(p.amortizacao)}</td>
                                                <td style={{ padding: "4px 10px", textAlign: "right", color: "#C9921B" }}>{fmtBRL(p.juros)}</td>
                                                <td style={{ padding: "4px 10px", textAlign: "right", color: "#888" }}>{fmtBRL(p.despesas_acessorios)}</td>
                                                <td style={{ padding: "4px 10px", textAlign: "right", fontWeight: 600 }}>{fmtBRL(p.valor_parcela)}</td>
                                                <td style={{ padding: "4px 10px", textAlign: "right", color: "#E24B4A" }}>{fmtBRL(p.saldo_devedor)}</td>
                                                <td style={{ padding: "4px 10px", textAlign: "center" }}>
                                                  <span style={{
                                                    padding: "1px 7px", borderRadius: 8, fontWeight: 700, fontSize: 10,
                                                    background: p.status === "pago" ? "#DCFCE7" : p.status === "vencido" ? "#FEE2E2" : "#FBF3E0",
                                                    color: p.status === "pago" ? "#16A34A" : p.status === "vencido" ? "#E24B4A" : "#C9921B",
                                                  }}>
                                                    {p.status === "pago" ? "Pago" : p.status === "vencido" ? "Vencido" : "Em aberto"}
                                                  </span>
                                                </td>
                                              </tr>
                                            ))}
                                          </tbody>
                                          <tfoot>
                                            <tr style={{ background: "#EEF2FF", fontWeight: 700 }}>
                                              <td colSpan={2} style={{ padding: "6px 10px", textAlign: "right", color: "#555" }}>TOTAIS</td>
                                              <td style={{ padding: "6px 10px", textAlign: "right" }}>{fmtBRL(c.parcelas.reduce((s, p) => s + p.amortizacao, 0))}</td>
                                              <td style={{ padding: "6px 10px", textAlign: "right", color: "#C9921B" }}>{fmtBRL(c.parcelas.reduce((s, p) => s + p.juros, 0))}</td>
                                              <td style={{ padding: "6px 10px", textAlign: "right", color: "#888" }}>{fmtBRL(c.parcelas.reduce((s, p) => s + p.despesas_acessorios, 0))}</td>
                                              <td style={{ padding: "6px 10px", textAlign: "right" }}>{fmtBRL(c.parcelas.reduce((s, p) => s + p.valor_parcela, 0))}</td>
                                              <td colSpan={2} />
                                            </tr>
                                          </tfoot>
                                        </table>
                                      </div>
                                    </td>
                                  </tr>
                                )}
                              </>
                            );
                          })}
                        </tbody>
                        {/* Subtotal do tipo */}
                        <tfoot>
                          <tr style={{ background: TIPO_BG[tipo] ?? "#F3F4F6", fontWeight: 700, fontSize: 12 }}>
                            <td colSpan={3} style={{ padding: "8px 16px", color: TIPO_COR[tipo], fontWeight: 700 }}>
                              Subtotal {TIPO_LABEL[tipo]}
                            </td>
                            <td style={{ padding: "8px 10px", textAlign: "right" }}>{fmtBRL(subTotalCaptado)}</td>
                            <td style={{ padding: "8px 10px", textAlign: "right", color: "#16A34A" }}>{fmtBRL(subTotalPago)}</td>
                            <td style={{ padding: "8px 10px", textAlign: "right", color: "#E24B4A" }}>{fmtBRL(subTotalSaldo)}</td>
                            <td colSpan={6} />
                            <td />
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  </div>
                );
              })}

              {/* Totais Gerais */}
              <div style={{ background: "#1A4870", borderRadius: 12, padding: "16px 24px", marginTop: 8, color: "#fff", display: "flex", gap: 40, flexWrap: "wrap" }}>
                <div>
                  <div style={{ fontSize: 11, opacity: 0.7, marginBottom: 4 }}>TOTAL CAPTADO</div>
                  <div style={{ fontSize: 20, fontWeight: 700 }}>{fmtBRL(totalCaptado)}</div>
                </div>
                <div>
                  <div style={{ fontSize: 11, opacity: 0.7, marginBottom: 4 }}>TOTAL AMORTIZADO</div>
                  <div style={{ fontSize: 20, fontWeight: 700, color: "#86EFAC" }}>{fmtBRL(totalPago)}</div>
                </div>
                <div>
                  <div style={{ fontSize: 11, opacity: 0.7, marginBottom: 4 }}>SALDO DEVEDOR TOTAL</div>
                  <div style={{ fontSize: 20, fontWeight: 700, color: "#FCA5A5" }}>{fmtBRL(totalSaldo)}</div>
                </div>
                <div>
                  <div style={{ fontSize: 11, opacity: 0.7, marginBottom: 4 }}>JUROS PAGOS</div>
                  <div style={{ fontSize: 20, fontWeight: 700, color: "#FDE9BB" }}>{fmtBRL(totalJuros)}</div>
                </div>
                <div>
                  <div style={{ fontSize: 11, opacity: 0.7, marginBottom: 4 }}>COBERTURA DE GARANTIAS</div>
                  <div style={{ fontSize: 20, fontWeight: 700, color: "#DDD6FE" }}>
                    {totalSaldo > 0 ? fmtPct((totalGarantias / totalSaldo) * 100) : "—"}
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}

const th: React.CSSProperties = {
  padding: "8px 10px",
  textAlign: "right",
  fontWeight: 700,
  color: "#555",
  borderBottom: "0.5px solid #DDE2EE",
  whiteSpace: "nowrap",
  fontSize: 11,
};
const td: React.CSSProperties = {
  padding: "10px 10px",
  verticalAlign: "middle",
};
