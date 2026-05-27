"use client";
import React, { useState, useEffect, useCallback } from "react";
import { createBrowserClient } from "@supabase/ssr";
import { useAuth } from "../../../components/AuthProvider";
import TopNav from "../../../components/TopNav";
import type { ContratoFinanceiro, ParcelaPagamento, GarantiaContrato } from "../../../lib/supabase";

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
);

const TIPO_LABEL: Record<string, string> = {
  custeio:       "Custeio",
  investimento:  "Investimento",
  securitizacao: "Securitização",
  cpr:           "CPR",
  egf:           "EGF",
  outros:        "Outros",
};

const fmtBRL = (v: number | null | undefined) =>
  (v ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2 });
const fmtPct = (v: number | null | undefined, d = 1) =>
  `${(v ?? 0).toLocaleString("pt-BR", { minimumFractionDigits: d, maximumFractionDigits: d })}%`;
const fmtData = (s?: string | null) => {
  if (!s) return "—";
  const [y, m, d] = s.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
};
const hoje = new Date().toISOString().slice(0, 10);

interface Produtor { id: string; nome_razao_social: string; cpf_cnpj?: string }

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
  ano: string; // ano do data_contrato
}

export default function RelatorioEndividamento() {
  const { fazendaId, logoCliente, nomeFazendaSelecionada: fazendaNome } = useAuth();

  const [contratos,  setContratos]  = useState<ContratoEnriquecido[]>([]);
  const [produtores, setProdutores] = useState<Produtor[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [erro,       setErro]       = useState<string | null>(null);

  // Filtros
  const [filtroProd,   setFiltroProd]   = useState("");
  const [filtroStatus, setFiltroStatus] = useState("ativo");
  const [filtroMoeda,  setFiltroMoeda]  = useState("");

  // Linhas expandidas (instituição + tipo)
  const [expandido, setExpandido] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    if (!fazendaId) return;
    setLoading(true);
    setErro(null);
    try {
      const [{ data: ctsRaw, error: ctsErr }, { data: prods }] = await Promise.all([
        supabase.from("contratos_financeiros").select("*").eq("fazenda_id", fazendaId).order("data_contrato"),
        supabase.from("produtores").select("id,nome_razao_social,cpf_cnpj").eq("fazenda_id", fazendaId).order("nome_razao_social"),
      ]);

      if (ctsErr) { setErro(ctsErr.message); setContratos([]); return; }
      if (!ctsRaw) { setContratos([]); return; }
      setProdutores((prods ?? []) as Produtor[]);

      const ids = (ctsRaw as ContratoFinanceiro[]).map(c => c.id);
      const [{ data: parcsAll }, { data: garsAll }] = await Promise.all([
        ids.length > 0
          ? supabase.from("parcelas_pagamento").select("*").in("contrato_id", ids).order("data_vencimento")
          : { data: [] as ParcelaPagamento[] },
        ids.length > 0
          ? supabase.from("garantias_contrato").select("*").in("contrato_id", ids)
          : { data: [] as GarantiaContrato[] },
      ]);

      const enriched: ContratoEnriquecido[] = (ctsRaw as ContratoFinanceiro[]).map(c => {
        const parcelas  = ((parcsAll ?? []) as ParcelaPagamento[]).filter(p => p.contrato_id === c.id);
        const pagas     = parcelas.filter(p => p.status === "pago");
        const emAberto  = parcelas.filter(p => p.status !== "pago").sort((a, b) => a.data_vencimento.localeCompare(b.data_vencimento));
        const vencidas  = parcelas.filter(p => p.status === "vencido");
        const garantias = ((garsAll ?? []) as GarantiaContrato[]).filter(g => g.contrato_id === c.id);
        const ultimaPaga = pagas.sort((a, b) => b.num_parcela - a.num_parcela)[0];
        return {
          ...c,
          saldoDevedor:      ultimaPaga?.saldo_devedor ?? c.valor_financiado,
          totalPago:         pagas.reduce((s, p) => s + p.amortizacao, 0),
          jurosAcumulados:   pagas.reduce((s, p) => s + p.juros, 0),
          proximoVencimento: emAberto[0]?.data_vencimento ?? null,
          totalParcelas:     parcelas.length,
          parcelasPagas:     pagas.length,
          parcelasVencidas:  vencidas.length,
          garantias,
          valorGarantias:    garantias.reduce((s, g) => s + (g.valor_avaliacao ?? 0), 0),
          parcelas,
          ano:               c.data_contrato.slice(0, 4),
        };
      });

      setContratos(enriched);
    } catch (e) {
      setErro(String(e));
    } finally {
      setLoading(false);
    }
  }, [fazendaId]);

  useEffect(() => { carregar(); }, [carregar]);

  // Contratos filtrados
  const filtrados = contratos.filter(c => {
    if (filtroStatus && c.status !== filtroStatus) return false;
    if (filtroMoeda  && c.moeda  !== filtroMoeda)  return false;
    if (filtroProd   && c.produtor_id !== filtroProd) return false;
    return true;
  });

  // Anos disponíveis (colunas)
  const anos = [...new Set(filtrados.map(c => c.ano))].sort();

  // Agrupamento: Nível 1 = instituição, Nível 2 = tipo
  type Nivel2 = { tipo: string; contratos: ContratoEnriquecido[]; captadoPorAno: Record<string, number>; saldoPorAno: Record<string, number> };
  type Nivel1 = { credor: string; niveis2: Nivel2[]; captadoPorAno: Record<string, number>; saldoPorAno: Record<string, number> };

  const hierarquia: Nivel1[] = (() => {
    const mapa = new Map<string, Nivel1>();
    for (const c of filtrados) {
      if (!mapa.has(c.credor)) mapa.set(c.credor, { credor: c.credor, niveis2: [], captadoPorAno: {}, saldoPorAno: {} });
      const n1 = mapa.get(c.credor)!;
      let n2 = n1.niveis2.find(n => n.tipo === c.tipo);
      if (!n2) { n2 = { tipo: c.tipo, contratos: [], captadoPorAno: {}, saldoPorAno: {} }; n1.niveis2.push(n2); }
      n2.contratos.push(c);
      n2.captadoPorAno[c.ano] = (n2.captadoPorAno[c.ano] ?? 0) + c.valor_financiado;
      n2.saldoPorAno[c.ano]   = (n2.saldoPorAno[c.ano]   ?? 0) + c.saldoDevedor;
    }
    for (const n1 of mapa.values()) {
      for (const n2 of n1.niveis2) {
        for (const ano of anos) {
          n1.captadoPorAno[ano] = (n1.captadoPorAno[ano] ?? 0) + (n2.captadoPorAno[ano] ?? 0);
          n1.saldoPorAno[ano]   = (n1.saldoPorAno[ano]   ?? 0) + (n2.saldoPorAno[ano]   ?? 0);
        }
      }
    }
    return [...mapa.values()].sort((a, b) => a.credor.localeCompare(b.credor));
  })();

  // Totais gerais
  const totalCaptado   = filtrados.reduce((s, c) => s + c.valor_financiado, 0);
  const totalSaldo     = filtrados.reduce((s, c) => s + c.saldoDevedor,     0);
  const totalPago      = filtrados.reduce((s, c) => s + c.totalPago,        0);
  const totalJuros     = filtrados.reduce((s, c) => s + c.jurosAcumulados,  0);
  const totalGarantias = filtrados.reduce((s, c) => s + c.valorGarantias,   0);

  // Captado e saldo por ano (totais)
  const totalCaptadoPorAno: Record<string, number> = {};
  const totalSaldoPorAno:   Record<string, number> = {};
  for (const ano of anos) {
    totalCaptadoPorAno[ano] = filtrados.filter(c => c.ano === ano).reduce((s, c) => s + c.valor_financiado, 0);
    totalSaldoPorAno[ano]   = filtrados.filter(c => c.ano === ano).reduce((s, c) => s + c.saldoDevedor, 0);
  }

  // ── Print Preview A4 ────────────────────────────────────────────
  function abrirPreview() {
    const win = window.open("", "_blank");
    if (!win) { alert("Permita popups para visualizar o documento."); return; }
    const emissao = new Date().toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
    const prodFiltrado = filtroProd ? produtores.find(p => p.id === filtroProd) : null;
    const thS  = "padding:5px 8px;background:#1A4870;color:#fff;font-size:9px;font-weight:700;white-space:nowrap;";
    const thR  = thS + "text-align:right;";
    const thC  = thS + "text-align:center;";

    // Cabeçalho de anos
    const colsAnos = anos.map(a =>
      `<th style="${thR}">${a}<br><span style="font-size:8px;opacity:.7">Captado</span></th>` +
      `<th style="${thR}"><span style="color:#FCA5A5;font-size:8px">Saldo</span></th>`
    ).join("");

    // Linhas do corpo
    let tbody = "";
    for (const n1 of hierarquia) {
      const saldoN1 = Object.values(n1.saldoPorAno).reduce((s, v) => s + v, 0);
      const captN1  = Object.values(n1.captadoPorAno).reduce((s, v) => s + v, 0);
      // Linha N1
      tbody += `<tr style="background:#EBF3FC">
        <td colspan="2" style="padding:6px 8px;font-weight:700;font-size:11px;color:#0B2D50">${n1.credor}</td>
        ${anos.map(a => `
          <td style="padding:5px 8px;text-align:right;font-size:9px;font-weight:600">${(n1.captadoPorAno[a] ?? 0) > 0 ? fmtBRL(n1.captadoPorAno[a]) : "—"}</td>
          <td style="padding:5px 8px;text-align:right;font-size:9px;color:#C0392B;font-weight:600">${(n1.saldoPorAno[a] ?? 0) > 0 ? fmtBRL(n1.saldoPorAno[a]) : "—"}</td>
        `).join("")}
        <td style="padding:5px 8px;text-align:right;font-size:9px;font-weight:700">${fmtBRL(captN1)}</td>
        <td style="padding:5px 8px;text-align:right;font-size:9px;color:#C0392B;font-weight:700">${fmtBRL(saldoN1)}</td>
      </tr>`;
      // Linhas N2
      for (const n2 of n1.niveis2) {
        const saldoN2 = Object.values(n2.saldoPorAno).reduce((s, v) => s + v, 0);
        const captN2  = Object.values(n2.captadoPorAno).reduce((s, v) => s + v, 0);
        tbody += `<tr style="background:#fff">
          <td style="padding:4px 8px 4px 20px;font-size:9px;color:#888">↳</td>
          <td style="padding:4px 8px;font-size:10px;color:#555">${TIPO_LABEL[n2.tipo] ?? n2.tipo}</td>
          ${anos.map(a => `
            <td style="padding:4px 8px;text-align:right;font-size:9px">${(n2.captadoPorAno[a] ?? 0) > 0 ? fmtBRL(n2.captadoPorAno[a]) : "<span style='color:#ccc'>—</span>"}</td>
            <td style="padding:4px 8px;text-align:right;font-size:9px;color:#C0392B">${(n2.saldoPorAno[a] ?? 0) > 0 ? fmtBRL(n2.saldoPorAno[a]) : "<span style='color:#ccc'>—</span>"}</td>
          `).join("")}
          <td style="padding:4px 8px;text-align:right;font-size:9px">${fmtBRL(captN2)}</td>
          <td style="padding:4px 8px;text-align:right;font-size:9px;color:#C0392B">${fmtBRL(saldoN2)}</td>
        </tr>`;
      }
    }
    // Linha de totais
    tbody += `<tr style="background:#1A4870">
      <td colspan="2" style="padding:7px 8px;color:#fff;font-weight:700;font-size:10px">TOTAL GERAL</td>
      ${anos.map(a => `
        <td style="padding:7px 8px;text-align:right;font-size:9px;font-weight:700;color:#fff">${fmtBRL(totalCaptadoPorAno[a] ?? 0)}</td>
        <td style="padding:7px 8px;text-align:right;font-size:9px;font-weight:700;color:#FCA5A5">${fmtBRL(totalSaldoPorAno[a] ?? 0)}</td>
      `).join("")}
      <td style="padding:7px 8px;text-align:right;font-size:10px;font-weight:700;color:#fff">${fmtBRL(totalCaptado)}</td>
      <td style="padding:7px 8px;text-align:right;font-size:10px;font-weight:700;color:#FCA5A5">${fmtBRL(totalSaldo)}</td>
    </tr>`;

    win.document.write(`<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8">
<title>Endividamento — ${fazendaNome ?? "Fazenda"}</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:system-ui,sans-serif;background:#D1D5DB;color:#1a1a1a}
  .toolbar{position:sticky;top:0;background:#1A4870;padding:10px 24px;display:flex;align-items:center;justify-content:space-between;z-index:100;box-shadow:0 2px 8px rgba(0,0,0,.2)}
  .btn-print{background:#fff;color:#1A4870;border:none;padding:8px 20px;border-radius:8px;font-size:13px;font-weight:700;cursor:pointer}
  .page-wrapper{display:flex;justify-content:center;padding:28px}
  .page{background:#fff;width:297mm;padding:12mm 14mm;box-shadow:0 4px 24px rgba(0,0,0,.18)}
  table{width:100%;border-collapse:collapse}
  td,th{border-bottom:.5px solid #E5E7EB}
  @media print{
    @page{size:A4 landscape;margin:10mm 12mm}
    body{background:#fff}
    .toolbar{display:none!important}
    .page-wrapper{padding:0}
    .page{box-shadow:none;width:100%;padding:0}
  }
</style></head><body>
<div class="toolbar">
  <span style="color:#fff;font-size:13px;font-weight:600">Relatório de Endividamento — ${fazendaNome ?? ""}</span>
  <button class="btn-print" onclick="window.print()">&#128438; Imprimir / Salvar PDF</button>
</div>
<div class="page-wrapper"><div class="page">
  <!-- Cabeçalho com logo -->
  <div style="background:#1A4870;padding:10px 14px;display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;border-radius:4px">
    <img src="/Logo_Arato.png" style="height:28px;object-fit:contain;filter:brightness(0) invert(1)" onerror="this.style.display='none'" />
    <div style="text-align:right">
      ${logoCliente ? `<img src="${logoCliente}" style="height:26px;object-fit:contain;filter:brightness(0) invert(1);margin-bottom:3px" onerror="this.style.display='none'" /><br>` : ""}
      <span style="font-size:9px;color:rgba(255,255,255,.6)">Emitido em ${emissao}</span>
    </div>
  </div>
  <!-- Título -->
  <div style="border-bottom:2px solid #1A4870;padding-bottom:7px;margin-bottom:10px">
    <div style="font-size:9px;color:#888;text-transform:uppercase;letter-spacing:.08em;margin-bottom:2px">Financeiro — Capital de Terceiros</div>
    <div style="font-size:15px;font-weight:800;color:#1A4870">Relatório de Endividamento</div>
    <div style="font-size:10px;color:#555;margin-top:3px">
      ${prodFiltrado ? `Produtor: ${prodFiltrado.nome_razao_social}${prodFiltrado.cpf_cnpj ? ` · ${prodFiltrado.cpf_cnpj}` : ""} · ` : ""}
      ${filtrados.length} contrato${filtrados.length !== 1 ? "s" : ""} ·
      Saldo Devedor: <strong style="color:#C0392B">${fmtBRL(totalSaldo)}</strong> ·
      Total Captado: ${fmtBRL(totalCaptado)} ·
      Amortizado: ${fmtBRL(totalPago)}
    </div>
  </div>
  <!-- Tabela principal -->
  <table style="font-size:10px">
    <thead>
      <tr>
        <th style="${thS}text-align:left;min-width:160px">Instituição</th>
        <th style="${thS}text-align:left;min-width:100px">Tipo</th>
        ${colsAnos}
        <th style="${thR}border-left:1.5px solid rgba(255,255,255,.3)">Total<br><span style="font-size:8px;opacity:.7">Captado</span></th>
        <th style="${thR}"><span style="color:#FCA5A5">Saldo<br>Atual</span></th>
      </tr>
    </thead>
    <tbody>${tbody}</tbody>
  </table>
  <!-- Rodapé de totais -->
  <div style="display:flex;gap:28px;margin-top:12px;padding-top:8px;border-top:1.5px solid #1A4870;flex-wrap:wrap">
    ${[
      ["TOTAL CAPTADO",     fmtBRL(totalCaptado),   "#1A4870"],
      ["SALDO DEVEDOR",     fmtBRL(totalSaldo),     "#C0392B"],
      ["TOTAL AMORTIZADO",  fmtBRL(totalPago),      "#16A34A"],
      ["JUROS PAGOS",       fmtBRL(totalJuros),     "#C9921B"],
      ["VALOR GARANTIAS",   fmtBRL(totalGarantias), "#7C3AED"],
    ].map(([k, v, cor]) => `<div><div style="font-size:8px;color:#888;font-weight:700;text-transform:uppercase;margin-bottom:2px">${k}</div><div style="font-size:12px;font-weight:800;color:${cor}">${v}</div></div>`).join("")}
    <div style="margin-left:auto;font-size:8px;color:#aaa;align-self:flex-end">${new Date().toLocaleDateString("pt-BR")}</div>
  </div>
</div></div>
</body></html>`);
    win.document.close();
  }

  async function exportarXLSX() {
    const XLSX = await import("xlsx");
    const rows: Record<string, string | number>[] = [];
    for (const n1 of hierarquia) {
      for (const n2 of n1.niveis2) {
        const base: Record<string, string | number> = { Instituição: n1.credor, Tipo: TIPO_LABEL[n2.tipo] ?? n2.tipo };
        for (const ano of anos) {
          base[`Captado ${ano}`] = n2.captadoPorAno[ano] ?? 0;
          base[`Saldo ${ano}`]   = n2.saldoPorAno[ano]   ?? 0;
        }
        base["Total Captado"] = n2.contratos.reduce((s, c) => s + c.valor_financiado, 0);
        base["Saldo Devedor"] = n2.contratos.reduce((s, c) => s + c.saldoDevedor, 0);
        rows.push(base);
      }
    }
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), "Endividamento");
    XLSX.writeFile(wb, `Endividamento_${hoje}.xlsx`);
  }

  // ── Estilos de tabela ───────────────────────────────────────────
  const colAno: React.CSSProperties = { padding: "7px 8px", textAlign: "right", fontSize: 11, whiteSpace: "nowrap" };

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
            <button onClick={abrirPreview}
              style={{ padding: "8px 18px", background: "#F0F5FA", border: "0.5px solid #1A487040", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer", color: "#1A4870" }}>
              ⎙ Visualizar / Imprimir
            </button>
            <button onClick={exportarXLSX}
              style={{ padding: "8px 18px", background: "#16A34A", color: "#fff", border: "none", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
              ↓ XLSX
            </button>
          </div>
        </div>

        {/* Filtros */}
        <div style={{ display: "flex", gap: 10, marginBottom: 20, flexWrap: "wrap", alignItems: "center" }}>
          {/* Produtor */}
          <select value={filtroProd} onChange={e => setFiltroProd(e.target.value)}
            style={{ padding: "7px 12px", borderRadius: 8, border: "0.5px solid #DDE2EE", fontSize: 12, background: "#fff", color: "#555", cursor: "pointer", minWidth: 200 }}>
            <option value="">Todos os produtores</option>
            {produtores.map(p => (
              <option key={p.id} value={p.id}>{p.nome_razao_social}{p.cpf_cnpj ? ` — ${p.cpf_cnpj}` : ""}</option>
            ))}
          </select>

          <div style={{ width: 1, background: "#DDE2EE", height: 28 }} />

          {/* Status */}
          {[{ label: "Todos", val: "" }, { label: "Ativos", val: "ativo" }, { label: "Quitados", val: "quitado" }].map(f => (
            <button key={f.val} onClick={() => setFiltroStatus(f.val)}
              style={{ padding: "6px 14px", borderRadius: 20, border: "0.5px solid #DDE2EE", fontSize: 12,
                background: filtroStatus === f.val ? "#1A4870" : "#fff", color: filtroStatus === f.val ? "#fff" : "#555", cursor: "pointer" }}>
              {f.label}
            </button>
          ))}

          <div style={{ width: 1, background: "#DDE2EE", height: 28 }} />

          {/* Moeda */}
          <select value={filtroMoeda} onChange={e => setFiltroMoeda(e.target.value)}
            style={{ padding: "7px 12px", borderRadius: 8, border: "0.5px solid #DDE2EE", fontSize: 12, background: "#fff", color: "#555", cursor: "pointer" }}>
            <option value="">Todas as moedas</option>
            <option value="BRL">BRL</option>
            <option value="USD">USD</option>
          </select>

          {(filtroProd || filtroMoeda) && (
            <button onClick={() => { setFiltroProd(""); setFiltroMoeda(""); }}
              style={{ padding: "6px 12px", borderRadius: 8, border: "0.5px solid #DDE2EE", fontSize: 11, background: "#FEF2F2", color: "#B91C1C", cursor: "pointer" }}>
              ✕ limpar filtros
            </button>
          )}
        </div>

        {/* KPI cards */}
        <div style={{ display: "flex", gap: 12, marginBottom: 20, flexWrap: "wrap" }}>
          {[
            { l: "Saldo Devedor",      v: fmtBRL(totalSaldo),     cor: "#E24B4A", sub: totalCaptado > 0 ? `${fmtPct((totalSaldo / totalCaptado) * 100)} do captado` : undefined },
            { l: "Total Captado",      v: fmtBRL(totalCaptado),   cor: "#1A4870", sub: `${filtrados.length} contrato${filtrados.length !== 1 ? "s" : ""}` },
            { l: "Total Amortizado",   v: fmtBRL(totalPago),      cor: "#16A34A", sub: totalCaptado > 0 ? `${fmtPct((totalPago / totalCaptado) * 100)} quitado` : undefined },
            { l: "Juros Pagos",        v: fmtBRL(totalJuros),     cor: "#C9921B" },
            { l: "Valor em Garantias", v: fmtBRL(totalGarantias), cor: "#7C3AED", sub: totalSaldo > 0 ? `cobertura ${fmtPct((totalGarantias / totalSaldo) * 100)}` : undefined },
          ].map(k => (
            <div key={k.l} style={{ background: "#fff", borderRadius: 12, border: "0.5px solid #DDE2EE", padding: "14px 20px", flex: 1, minWidth: 150 }}>
              <div style={{ fontSize: 10, color: "#888", fontWeight: 600, textTransform: "uppercase", marginBottom: 5 }}>{k.l}</div>
              <div style={{ fontSize: 20, fontWeight: 700, color: k.cor }}>{k.v}</div>
              {k.sub && <div style={{ fontSize: 11, color: "#888", marginTop: 3 }}>{k.sub}</div>}
            </div>
          ))}
        </div>

        {/* Corpo */}
        {loading ? (
          <div style={{ textAlign: "center", padding: 60, color: "#888" }}>Carregando contratos...</div>
        ) : erro ? (
          <div style={{ textAlign: "center", padding: 60, background: "#fff", borderRadius: 12, border: "0.5px solid #FCA5A5" }}>
            <div style={{ fontSize: 15, fontWeight: 600, color: "#B91C1C", marginBottom: 8 }}>Erro ao carregar dados</div>
            <div style={{ fontSize: 12, color: "#888", marginBottom: 16 }}>{erro}</div>
            <button onClick={carregar} style={{ padding: "8px 20px", background: "#1A4870", color: "#fff", border: "none", borderRadius: 8, cursor: "pointer", fontSize: 13 }}>
              Tentar novamente
            </button>
          </div>
        ) : filtrados.length === 0 ? (
          <div style={{ textAlign: "center", padding: 60, background: "#fff", borderRadius: 12, border: "0.5px solid #DDE2EE" }}>
            <div style={{ fontSize: 15, fontWeight: 600, color: "#555" }}>Nenhum contrato encontrado</div>
            <div style={{ fontSize: 13, color: "#888", marginTop: 4 }}>Cadastre contratos financeiros em Financeiro → Contratos Financeiros.</div>
          </div>
        ) : (
          <div style={{ background: "#fff", borderRadius: 12, border: "0.5px solid #DDE2EE", overflow: "hidden" }}>
            {/* Cabeçalho tabela */}
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, minWidth: anos.length * 240 + 400 }}>
                <thead>
                  <tr style={{ background: "#1A4870" }}>
                    <th style={{ ...thStyle, textAlign: "left", width: 220, paddingLeft: 16, position: "sticky", left: 0, background: "#1A4870", zIndex: 2 }}>
                      Instituição / Tipo de Crédito
                    </th>
                    {anos.map(a => (
                      <React.Fragment key={a}>
                        <th style={{ ...thStyle, borderLeft: "1.5px solid rgba(255,255,255,.15)" }}>
                          <div style={{ fontSize: 11, fontWeight: 700 }}>{a}</div>
                          <div style={{ fontSize: 9, opacity: 0.65, fontWeight: 400 }}>Captado</div>
                        </th>
                        <th style={thStyle}>
                          <div style={{ fontSize: 11, fontWeight: 700, color: "#FCA5A5" }}>Saldo</div>
                          <div style={{ fontSize: 9, opacity: 0.65, fontWeight: 400, color: "#FCA5A5" }}>Devedor</div>
                        </th>
                      </React.Fragment>
                    ))}
                    <th style={{ ...thStyle, borderLeft: "2px solid rgba(255,255,255,.25)" }}>
                      <div style={{ fontSize: 11, fontWeight: 700 }}>Total</div>
                      <div style={{ fontSize: 9, opacity: 0.65, fontWeight: 400 }}>Captado</div>
                    </th>
                    <th style={thStyle}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: "#FCA5A5" }}>Saldo</div>
                      <div style={{ fontSize: 9, opacity: 0.65, fontWeight: 400, color: "#FCA5A5" }}>Atual</div>
                    </th>
                    <th style={{ ...thStyle, width: 60 }}></th>
                  </tr>
                </thead>
                <tbody>
                  {hierarquia.map((n1, ni) => {
                    const captN1  = Object.values(n1.captadoPorAno).reduce((s, v) => s + v, 0);
                    const saldoN1 = Object.values(n1.saldoPorAno).reduce((s, v) => s + v, 0);
                    const rowKey  = `n1-${ni}`;
                    const isExp   = expandido === rowKey;
                    return (
                      <React.Fragment key={rowKey}>
                        {/* Nível 1: Instituição */}
                        <tr
                          onClick={() => setExpandido(isExp ? null : rowKey)}
                          style={{ background: "#EBF3FC", cursor: "pointer", borderBottom: "0.5px solid #D5E8F5" }}>
                          <td style={{ padding: "10px 16px", fontWeight: 700, fontSize: 13, color: "#0B2D50", position: "sticky", left: 0, background: "#EBF3FC", zIndex: 1 }}>
                            <span style={{ fontSize: 10, color: "#1A4870", marginRight: 6, opacity: 0.6 }}>{isExp ? "▼" : "▶"}</span>
                            {n1.credor}
                            <div style={{ fontSize: 10, color: "#888", fontWeight: 400, marginTop: 2 }}>
                              {n1.niveis2.length} tipo{n1.niveis2.length !== 1 ? "s" : ""} · {n1.niveis2.reduce((s, n) => s + n.contratos.length, 0)} contrato{n1.niveis2.reduce((s, n) => s + n.contratos.length, 0) !== 1 ? "s" : ""}
                            </div>
                          </td>
                          {anos.map(a => (
                            <React.Fragment key={a}>
                              <td style={{ ...colAno, fontWeight: 600, borderLeft: "1.5px solid #D5E8F5" }}>
                                {(n1.captadoPorAno[a] ?? 0) > 0 ? fmtBRL(n1.captadoPorAno[a]) : <span style={{ color: "#ccc" }}>—</span>}
                              </td>
                              <td style={{ ...colAno, color: (n1.saldoPorAno[a] ?? 0) > 0 ? "#E24B4A" : "#ccc", fontWeight: (n1.saldoPorAno[a] ?? 0) > 0 ? 600 : 400 }}>
                                {(n1.saldoPorAno[a] ?? 0) > 0 ? fmtBRL(n1.saldoPorAno[a]) : "—"}
                              </td>
                            </React.Fragment>
                          ))}
                          <td style={{ ...colAno, fontWeight: 700, borderLeft: "2px solid #C5D9EE" }}>{fmtBRL(captN1)}</td>
                          <td style={{ ...colAno, color: "#E24B4A", fontWeight: 700 }}>{fmtBRL(saldoN1)}</td>
                          <td />
                        </tr>

                        {/* Nível 2: tipos de crédito (expande ao clicar na instituição) */}
                        {isExp && n1.niveis2.map((n2, n2i) => {
                          const captN2  = n2.contratos.reduce((s, c) => s + c.valor_financiado, 0);
                          const saldoN2 = n2.contratos.reduce((s, c) => s + c.saldoDevedor, 0);
                          const rowKey2 = `n2-${ni}-${n2i}`;
                          const isExp2  = expandido === rowKey2;
                          return (
                            <React.Fragment key={rowKey2}>
                              <tr
                                onClick={e => { e.stopPropagation(); setExpandido(isExp2 ? rowKey : rowKey2); }}
                                style={{ background: "#F4F8FC", borderBottom: "0.5px solid #E5EDF5", cursor: "pointer" }}>
                                <td style={{ padding: "8px 16px 8px 32px", fontSize: 12, color: "#1A4870", fontWeight: 600, position: "sticky", left: 0, background: "#F4F8FC", zIndex: 1 }}>
                                  <span style={{ fontSize: 9, color: "#888", marginRight: 5 }}>{isExp2 ? "▼" : "▶"}</span>
                                  {TIPO_LABEL[n2.tipo] ?? n2.tipo}
                                  <span style={{ fontSize: 10, color: "#888", fontWeight: 400, marginLeft: 8 }}>
                                    {n2.contratos.length} contrato{n2.contratos.length !== 1 ? "s" : ""}
                                  </span>
                                </td>
                                {anos.map(a => (
                                  <React.Fragment key={a}>
                                    <td style={{ ...colAno, borderLeft: "1.5px solid #E5EDF5" }}>
                                      {(n2.captadoPorAno[a] ?? 0) > 0 ? fmtBRL(n2.captadoPorAno[a]) : <span style={{ color: "#ddd" }}>—</span>}
                                    </td>
                                    <td style={{ ...colAno, color: (n2.saldoPorAno[a] ?? 0) > 0 ? "#E24B4A" : "#ddd" }}>
                                      {(n2.saldoPorAno[a] ?? 0) > 0 ? fmtBRL(n2.saldoPorAno[a]) : "—"}
                                    </td>
                                  </React.Fragment>
                                ))}
                                <td style={{ ...colAno, borderLeft: "2px solid #D4E3F0" }}>{fmtBRL(captN2)}</td>
                                <td style={{ ...colAno, color: "#E24B4A" }}>{fmtBRL(saldoN2)}</td>
                                <td />
                              </tr>

                              {/* Nível 3: contratos individuais (expande ao clicar no tipo) */}
                              {isExp2 && n2.contratos.map((c, ci) => {
                                const pctQ = c.valor_financiado > 0 ? (c.totalPago / c.valor_financiado) * 100 : 0;
                                return (
                                  <tr key={c.id} style={{ background: ci % 2 === 0 ? "#fff" : "#FAFBFC", borderBottom: "0.5px solid #F0F0F0" }}>
                                    <td style={{ padding: "8px 16px 8px 48px", fontSize: 11, position: "sticky", left: 0, background: ci % 2 === 0 ? "#fff" : "#FAFBFC", zIndex: 1 }}>
                                      <div style={{ color: "#1a1a1a", fontWeight: 600 }}>{c.descricao || c.credor}</div>
                                      <div style={{ color: "#888", fontSize: 10 }}>
                                        {fmtData(c.data_contrato)}
                                        {c.linha_credito ? ` · ${c.linha_credito}` : ""}
                                        {c.numero_documento ? ` · ${c.numero_documento}` : ""}
                                        {c.taxa_juros_aa != null ? ` · ${c.taxa_juros_aa}% a.a.` : ""}
                                        {" · "}
                                        <span style={{ color: c.status === "ativo" ? "#1A4870" : "#16A34A" }}>{c.status === "ativo" ? "Ativo" : "Quitado"}</span>
                                      </div>
                                      {c.parcelasVencidas > 0 && (
                                        <div style={{ fontSize: 10, color: "#E24B4A", fontWeight: 600 }}>⚠ {c.parcelasVencidas} parcela{c.parcelasVencidas > 1 ? "s" : ""} vencida{c.parcelasVencidas > 1 ? "s" : ""}</div>
                                      )}
                                    </td>
                                    {anos.map(a => (
                                      <React.Fragment key={a}>
                                        <td style={{ ...colAno, fontSize: 11, borderLeft: "1.5px solid #EEF1F6" }}>
                                          {c.ano === a ? fmtBRL(c.valor_financiado) : <span style={{ color: "#ddd" }}>—</span>}
                                        </td>
                                        <td style={{ ...colAno, fontSize: 11, color: c.ano === a && c.saldoDevedor > 0 ? "#E24B4A" : "#ddd" }}>
                                          {c.ano === a && c.saldoDevedor > 0 ? fmtBRL(c.saldoDevedor) : "—"}
                                        </td>
                                      </React.Fragment>
                                    ))}
                                    <td style={{ ...colAno, fontSize: 11, borderLeft: "2px solid #EEF1F6" }}>{fmtBRL(c.valor_financiado)}</td>
                                    <td style={{ ...colAno, fontSize: 11, color: "#E24B4A" }}>{fmtBRL(c.saldoDevedor)}</td>
                                    <td style={{ padding: "8px 8px", textAlign: "center" }}>
                                      <div style={{ fontSize: 10, color: "#555" }}>
                                        <div style={{ display: "flex", alignItems: "center", gap: 4, justifyContent: "center" }}>
                                          <div style={{ width: 40, height: 4, background: "#EEE", borderRadius: 4, overflow: "hidden" }}>
                                            <div style={{ width: `${Math.min(100, pctQ)}%`, height: "100%", background: pctQ >= 100 ? "#16A34A" : "#1A4870", borderRadius: 4 }} />
                                          </div>
                                          <span style={{ fontSize: 10 }}>{fmtPct(pctQ, 0)}</span>
                                        </div>
                                        {c.proximoVencimento && (
                                          <div style={{ marginTop: 2, fontSize: 9, color: c.proximoVencimento < hoje ? "#E24B4A" : "#888" }}>
                                            {fmtData(c.proximoVencimento)}
                                          </div>
                                        )}
                                      </div>
                                    </td>
                                  </tr>
                                );
                              })}
                            </React.Fragment>
                          );
                        })}
                      </React.Fragment>
                    );
                  })}

                  {/* Linha de Totais Gerais */}
                  <tr style={{ background: "#1A4870", fontWeight: 700 }}>
                    <td style={{ padding: "10px 16px", color: "#fff", fontSize: 12, position: "sticky", left: 0, background: "#1A4870", zIndex: 1 }}>
                      TOTAL GERAL
                    </td>
                    {anos.map(a => (
                      <React.Fragment key={a}>
                        <td style={{ ...colAno, fontWeight: 700, color: "#fff", borderLeft: "1.5px solid rgba(255,255,255,.15)" }}>
                          {fmtBRL(totalCaptadoPorAno[a] ?? 0)}
                        </td>
                        <td style={{ ...colAno, fontWeight: 700, color: "#FCA5A5" }}>
                          {fmtBRL(totalSaldoPorAno[a] ?? 0)}
                        </td>
                      </React.Fragment>
                    ))}
                    <td style={{ ...colAno, fontWeight: 700, color: "#fff", borderLeft: "2px solid rgba(255,255,255,.25)" }}>{fmtBRL(totalCaptado)}</td>
                    <td style={{ ...colAno, fontWeight: 700, color: "#FCA5A5" }}>{fmtBRL(totalSaldo)}</td>
                    <td />
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </>
  );
}

const thStyle: React.CSSProperties = {
  padding: "8px 8px",
  textAlign: "right",
  color: "#fff",
  borderBottom: "none",
  whiteSpace: "nowrap",
  fontSize: 11,
};
