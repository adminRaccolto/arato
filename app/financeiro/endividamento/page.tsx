"use client";
import React, { useState, useEffect, useCallback } from "react";
import { createBrowserClient } from "@supabase/ssr";
import { useAuth } from "../../../components/AuthProvider";
import { listarContratosFinanceirosDaConta } from "../../../lib/db";
import TopNav from "../../../components/TopNav";
import type { ContratoFinanceiro, ParcelaPagamento, GarantiaContrato } from "../../../lib/supabase";

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
);

const TIPO_LABEL: Record<string, string> = {
  custeio:                   "Custeio",
  investimento:              "Investimento",
  securitizacao:             "Securitização",
  cpr:                       "CPR",
  egf:                       "EGF",
  compra_terra:              "Compra de Terra",
  compra_imovel:             "Compra de Imóvel",
  consorcio_contemplado:     "Consórcio Contemplado",
  consorcio_nao_contemplado: "Consórcio Não Contemplado",
  outros:                    "Outros",
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
const anoAtual = hoje.slice(0, 4);

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
}

export default function RelatorioEndividamento() {
  const { fazendaId, contaId, logoCliente, nomeFazendaSelecionada: fazendaNome } = useAuth();

  const [contratos,  setContratos]  = useState<ContratoEnriquecido[]>([]);
  const [produtores, setProdutores] = useState<Produtor[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [erro,       setErro]       = useState<string | null>(null);

  // Filtros de dados
  const [filtroProd,   setFiltroProd]   = useState("");
  const [filtroStatus, setFiltroStatus] = useState("ativo");
  const [filtroMoeda,  setFiltroMoeda]  = useState("");
  // Filtro de intervalo de anos (colunas baseadas em vencimento das parcelas)
  const [anoInicio, setAnoInicio] = useState(anoAtual);
  const [anoFim,    setAnoFim]    = useState(String(Number(anoAtual) + 5));
  // Mostrar só parcelas em aberto (padrão) ou todas
  const [apenasEmAberto, setApenasEmAberto] = useState(true);

  // Linhas expandidas (Set para suportar N1 + N2 abertos simultaneamente)
  const [expandido, setExpandido] = useState<Set<string>>(new Set());
  const toggle = (key: string) => setExpandido(prev => {
    const next = new Set(prev);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
  });

  const carregar = useCallback(async () => {
    if (!fazendaId) return;
    setLoading(true);
    setErro(null);
    try {
      const [ctsRaw, { data: prods }] = await Promise.all([
        listarContratosFinanceirosDaConta(contaId, fazendaId),
        supabase.from("produtores").select("id,nome_razao_social,cpf_cnpj").eq("fazenda_id", fazendaId).order("nome_razao_social"),
      ]);

      if (!ctsRaw?.length) { setContratos([]); setProdutores((prods ?? []) as Produtor[]); return; }
      setProdutores((prods ?? []) as Produtor[]);

      const ids = ctsRaw.map(c => c.id);
      const [{ data: parcsAll }, { data: garsAll }] = await Promise.all([
        ids.length > 0
          ? supabase.from("parcelas_pagamento").select("*").in("contrato_id", ids).order("data_vencimento")
          : { data: [] as ParcelaPagamento[] },
        ids.length > 0
          ? supabase.from("garantias_contrato").select("*").in("contrato_id", ids)
          : { data: [] as GarantiaContrato[] },
      ]);

      const enriched: ContratoEnriquecido[] = ctsRaw.map(c => {
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
        };
      });

      setContratos(enriched);
    } catch (e) {
      setErro(String(e));
    } finally {
      setLoading(false);
    }
  }, [fazendaId, contaId]);

  useEffect(() => { carregar(); }, [carregar]);

  // Contratos filtrados
  const filtrados = contratos.filter(c => {
    if (filtroStatus && c.status !== filtroStatus) return false;
    if (filtroMoeda  && c.moeda  !== filtroMoeda)  return false;
    if (filtroProd   && c.produtor_id !== filtroProd) return false;
    return true;
  });

  // Parcelas relevantes: opcionalmente só em aberto
  const parcelasFiltradas = (c: ContratoEnriquecido) =>
    apenasEmAberto ? c.parcelas.filter(p => p.status !== "pago") : c.parcelas;

  // Anos disponíveis = anos com parcelas nos contratos filtrados
  // Colunas baseadas em data_vencimento das parcelas, NÃO em data_contrato
  const todosAnosParc = [...new Set(
    filtrados.flatMap(c => parcelasFiltradas(c).map(p => p.data_vencimento.slice(0, 4)))
  )].sort();

  // Aplica filtro de intervalo
  const anos = todosAnosParc.filter(a =>
    (!anoInicio || a >= anoInicio) && (!anoFim || a <= anoFim)
  );

  // Agrupamento: N1 = credor, N2 = tipo
  // Valor por célula = parcelas com vencimento naquele ano (amortização + juros)
  type YearBucket = { amort: number; juros: number; encargos: number; total: number };
  type N2 = { tipo: string; contratos: ContratoEnriquecido[]; porAno: Record<string, YearBucket> };
  type N1 = { credor: string; niveis2: N2[]; porAno: Record<string, YearBucket> };

  const hierarquia: N1[] = (() => {
    const mapa = new Map<string, N1>();
    for (const c of filtrados) {
      if (!mapa.has(c.credor)) mapa.set(c.credor, { credor: c.credor, niveis2: [], porAno: {} });
      const n1 = mapa.get(c.credor)!;
      let n2 = n1.niveis2.find(n => n.tipo === c.tipo);
      if (!n2) { n2 = { tipo: c.tipo, contratos: [], porAno: {} }; n1.niveis2.push(n2); }
      n2.contratos.push(c);

      for (const p of parcelasFiltradas(c)) {
        const a = p.data_vencimento.slice(0, 4);
        // n2
        if (!n2.porAno[a]) n2.porAno[a] = { amort: 0, juros: 0, encargos: 0, total: 0 };
        n2.porAno[a].amort    += p.amortizacao;
        n2.porAno[a].juros    += p.juros;
        n2.porAno[a].encargos += p.despesas_acessorios ?? 0;
        n2.porAno[a].total    += p.valor_parcela;
        // n1
        if (!n1.porAno[a]) n1.porAno[a] = { amort: 0, juros: 0, encargos: 0, total: 0 };
        n1.porAno[a].amort    += p.amortizacao;
        n1.porAno[a].juros    += p.juros;
        n1.porAno[a].encargos += p.despesas_acessorios ?? 0;
        n1.porAno[a].total    += p.valor_parcela;
      }
    }
    return [...mapa.values()].sort((a, b) => a.credor.localeCompare(b.credor));
  })();

  // Totais globais de KPI (sempre de todos os contratos filtrados, não só dos anos visíveis)
  const totalSaldo     = filtrados.reduce((s, c) => s + c.saldoDevedor,    0);
  const totalCaptado   = filtrados.reduce((s, c) => s + c.valor_financiado, 0);
  const totalPago      = filtrados.reduce((s, c) => s + c.totalPago,        0);
  const totalJuros     = filtrados.reduce((s, c) => s + c.jurosAcumulados,  0);
  const totalGarantias = filtrados.reduce((s, c) => s + c.valorGarantias,   0);

  // Totais por ano (para a linha de rodapé da tabela)
  const totalPorAno: Record<string, YearBucket> = {};
  for (const n1 of hierarquia) {
    for (const [a, b] of Object.entries(n1.porAno)) {
      if (!totalPorAno[a]) totalPorAno[a] = { amort: 0, juros: 0, encargos: 0, total: 0 };
      totalPorAno[a].amort    += b.amort;
      totalPorAno[a].juros    += b.juros;
      totalPorAno[a].encargos += b.encargos;
      totalPorAno[a].total    += b.total;
    }
  }

  // Total geral da janela visível
  const totalJanelaAmort = anos.reduce((s, a) => s + (totalPorAno[a]?.amort ?? 0), 0);
  const totalJanelaJuros = anos.reduce((s, a) => s + (totalPorAno[a]?.juros ?? 0), 0);
  const totalJanelaTotal = anos.reduce((s, a) => s + (totalPorAno[a]?.total ?? 0), 0);

  // ── Print Preview A4 ────────────────────────────────────────────
  function abrirPreview() {
    const win = window.open("", "_blank");
    if (!win) { alert("Permita popups para visualizar o documento."); return; }
    const emissao = new Date().toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
    const prodFiltrado = filtroProd ? produtores.find(p => p.id === filtroProd) : null;
    const thS = "padding:5px 7px;background:#1A4870;color:#fff;font-size:9px;font-weight:700;white-space:nowrap;text-align:right;";
    const thL = thS + "text-align:left;";

    const colsHead = anos.map(a =>
      `<th style="${thS}">${a}<br><span style="opacity:.65;font-size:8px">Amort.</span></th>` +
      `<th style="${thS}"><span style="color:#FCA5A5;font-size:8px">Juros</span></th>` +
      `<th style="${thS}border-right:2px solid rgba(255,255,255,.15)"><span style="color:#fff;font-size:8px">Total</span></th>`
    ).join("");

    let tbody = "";
    for (const n1 of hierarquia) {
      const n1Total = anos.reduce((s, a) => s + (n1.porAno[a]?.total ?? 0), 0);
      if (n1Total === 0) continue;
      tbody += `<tr style="background:#EBF3FC">
        <td colspan="2" style="padding:5px 7px;font-weight:700;font-size:10px;color:#0B2D50">${n1.credor}</td>
        ${anos.map(a => `
          <td style="padding:4px 7px;text-align:right;font-size:9px">${(n1.porAno[a]?.amort ?? 0) > 0 ? fmtBRL(n1.porAno[a].amort) : "—"}</td>
          <td style="padding:4px 7px;text-align:right;font-size:9px;color:#C9921B">${(n1.porAno[a]?.juros ?? 0) > 0 ? fmtBRL(n1.porAno[a].juros) : "—"}</td>
          <td style="padding:4px 7px;text-align:right;font-size:9px;font-weight:600;border-right:2px solid #D5E8F5">${(n1.porAno[a]?.total ?? 0) > 0 ? fmtBRL(n1.porAno[a].total) : "—"}</td>
        `).join("")}
        <td style="padding:4px 7px;text-align:right;font-size:9px;font-weight:700">${fmtBRL(n1Total)}</td>
      </tr>`;
      for (const n2 of n1.niveis2) {
        const n2Total = anos.reduce((s, a) => s + (n2.porAno[a]?.total ?? 0), 0);
        if (n2Total === 0) continue;
        tbody += `<tr style="background:#fff">
          <td style="padding:3px 7px 3px 18px;font-size:9px;color:#888">↳</td>
          <td style="padding:3px 7px;font-size:9px;color:#555">${TIPO_LABEL[n2.tipo] ?? n2.tipo}</td>
          ${anos.map(a => `
            <td style="padding:3px 7px;text-align:right;font-size:9px">${(n2.porAno[a]?.amort ?? 0) > 0 ? fmtBRL(n2.porAno[a].amort) : "—"}</td>
            <td style="padding:3px 7px;text-align:right;font-size:9px;color:#C9921B">${(n2.porAno[a]?.juros ?? 0) > 0 ? fmtBRL(n2.porAno[a].juros) : "—"}</td>
            <td style="padding:3px 7px;text-align:right;font-size:9px;border-right:2px solid #EEF1F6">${(n2.porAno[a]?.total ?? 0) > 0 ? fmtBRL(n2.porAno[a].total) : "—"}</td>
          `).join("")}
          <td style="padding:3px 7px;text-align:right;font-size:9px">${fmtBRL(n2Total)}</td>
        </tr>`;
      }
    }
    tbody += `<tr style="background:#1A4870">
      <td colspan="2" style="padding:6px 7px;color:#fff;font-weight:700;font-size:10px">TOTAL</td>
      ${anos.map(a => `
        <td style="padding:6px 7px;text-align:right;font-size:9px;color:#fff;font-weight:700">${fmtBRL(totalPorAno[a]?.amort ?? 0)}</td>
        <td style="padding:6px 7px;text-align:right;font-size:9px;color:#FDE9BB;font-weight:700">${fmtBRL(totalPorAno[a]?.juros ?? 0)}</td>
        <td style="padding:6px 7px;text-align:right;font-size:9px;color:#fff;font-weight:700;border-right:2px solid rgba(255,255,255,.2)">${fmtBRL(totalPorAno[a]?.total ?? 0)}</td>
      `).join("")}
      <td style="padding:6px 7px;text-align:right;font-size:10px;color:#fff;font-weight:700">${fmtBRL(totalJanelaTotal)}</td>
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
    @page{size:A4 landscape;margin:8mm 10mm}
    body{background:#fff}
    .toolbar{display:none!important}
    .page-wrapper{padding:0;display:block}
    .page{box-shadow:none;width:100%;padding:0;overflow:visible;page-break-after:auto}
    table{page-break-inside:auto;width:100%}
    thead{display:table-header-group}
    tfoot{display:table-footer-group}
    tbody tr{page-break-inside:avoid;break-inside:avoid}
  }
</style></head><body>
<div class="toolbar">
  <span style="color:#fff;font-size:13px;font-weight:600">Cronograma de Endividamento — ${fazendaNome ?? ""}</span>
  <button class="btn-print" onclick="window.print()">&#128438; Imprimir / Salvar PDF</button>
</div>
<div class="page-wrapper"><div class="page">
  <div style="background:#1A4870;padding:10px 14px;display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;border-radius:4px">
    <img src="/logo_Arato_Nova.png" style="height:28px;object-fit:contain;filter:brightness(0) invert(1)" onerror="this.style.display='none'" />
    <div style="text-align:right">
      ${logoCliente ? `<img src="${logoCliente}" style="height:24px;object-fit:contain;filter:brightness(0) invert(1);margin-bottom:3px" onerror="this.style.display='none'" /><br>` : ""}
      <span style="font-size:9px;color:rgba(255,255,255,.6)">Emitido em ${emissao}</span>
    </div>
  </div>
  <div style="border-bottom:2px solid #1A4870;padding-bottom:7px;margin-bottom:10px">
    <div style="font-size:9px;color:#888;text-transform:uppercase;letter-spacing:.08em;margin-bottom:2px">Financeiro — Capital de Terceiros</div>
    <div style="font-size:15px;font-weight:800;color:#1A4870">Cronograma de Endividamento${anoInicio || anoFim ? ` — ${anoInicio || "início"} a ${anoFim || "fim"}` : ""}</div>
    <div style="font-size:10px;color:#555;margin-top:3px">
      ${prodFiltrado ? `Produtor: ${prodFiltrado.nome_razao_social}${prodFiltrado.cpf_cnpj ? ` · ${prodFiltrado.cpf_cnpj}` : ""} · ` : ""}
      ${apenasEmAberto ? "Apenas parcelas em aberto · " : ""}
      Saldo Devedor Total: <strong style="color:#C0392B">${fmtBRL(totalSaldo)}</strong> ·
      A pagar no período: <strong>${fmtBRL(totalJanelaTotal)}</strong>
      (amort. ${fmtBRL(totalJanelaAmort)} + juros ${fmtBRL(totalJanelaJuros)})
    </div>
  </div>
  <table style="font-size:10px">
    <thead>
      <tr>
        <th style="${thL}min-width:160px">Instituição</th>
        <th style="${thL}min-width:90px">Tipo</th>
        ${colsHead}
        <th style="${thS}border-left:2px solid rgba(255,255,255,.3)">Total<br><span style="font-size:8px;opacity:.65">no período</span></th>
      </tr>
    </thead>
    <tbody>${tbody}</tbody>
  </table>
  <div style="display:flex;gap:24px;margin-top:12px;padding-top:8px;border-top:1.5px solid #1A4870;flex-wrap:wrap">
    ${[
      ["SALDO DEVEDOR TOTAL",  fmtBRL(totalSaldo),            "#C0392B"],
      ["TOTAL CAPTADO",        fmtBRL(totalCaptado),           "#1A4870"],
      ["AMORTIZADO",           fmtBRL(totalPago),              "#16A34A"],
      ["A PAGAR NO PERÍODO",   fmtBRL(totalJanelaTotal),       "#1A4870"],
      ["  — Amortização",      fmtBRL(totalJanelaAmort),       "#555"],
      ["  — Juros / Encargos", fmtBRL(totalJanelaJuros),       "#C9921B"],
    ].map(([k, v, cor]) => `<div><div style="font-size:8px;color:#888;font-weight:700;text-transform:uppercase;margin-bottom:2px">${k}</div><div style="font-size:11px;font-weight:800;color:${cor}">${v}</div></div>`).join("")}
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
          base[`${ano} Amort.`]  = n2.porAno[ano]?.amort  ?? 0;
          base[`${ano} Juros`]   = n2.porAno[ano]?.juros  ?? 0;
          base[`${ano} Total`]   = n2.porAno[ano]?.total  ?? 0;
        }
        base["Total Período"] = anos.reduce((s, a) => s + (n2.porAno[a]?.total ?? 0), 0);
        rows.push(base);
      }
    }
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), "Cronograma");
    XLSX.writeFile(wb, `Endividamento_${anoInicio}_${anoFim}.xlsx`);
  }

  // ── Estilos ─────────────────────────────────────────────────────
  const sel: React.CSSProperties = { padding: "7px 10px", borderRadius: 8, border: "0.5px solid #DDE2EE", fontSize: 12, background: "#fff", color: "#555", cursor: "pointer", outline: "none" };
  const colV: React.CSSProperties = { padding: "7px 8px", textAlign: "right", fontSize: 11, whiteSpace: "nowrap" };
  const colS: React.CSSProperties = { ...colV, color: "#C9921B" };

  return (
    <>
      <TopNav />
      <div style={{ padding: "24px 32px", background: "#F4F6FA", minHeight: "100vh" }}>

        {/* Cabeçalho */}
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 20 }}>
          <div>
            <h1 style={{ fontSize: 20, fontWeight: 700, color: "#1a1a1a", margin: 0 }}>Relatório de Endividamento</h1>
            <div style={{ fontSize: 13, color: "#888", marginTop: 2 }}>
              Capital de Terceiros — colunas = anos de vencimento das parcelas
            </div>
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
        <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
          {/* Produtor */}
          <select value={filtroProd} onChange={e => setFiltroProd(e.target.value)} style={{ ...sel, minWidth: 200 }}>
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
          <select value={filtroMoeda} onChange={e => setFiltroMoeda(e.target.value)} style={sel}>
            <option value="">Todas as moedas</option>
            <option value="BRL">BRL</option>
            <option value="USD">USD</option>
          </select>

          <div style={{ width: 1, background: "#DDE2EE", height: 28 }} />

          {/* Parcelas */}
          <button onClick={() => setApenasEmAberto(!apenasEmAberto)}
            style={{ padding: "6px 14px", borderRadius: 20, border: "0.5px solid #DDE2EE", fontSize: 12,
              background: apenasEmAberto ? "#FBF3E0" : "#fff", color: apenasEmAberto ? "#C9921B" : "#555",
              cursor: "pointer", fontWeight: apenasEmAberto ? 700 : 400 }}>
            {apenasEmAberto ? "⚠ Apenas em aberto" : "Todas as parcelas"}
          </button>
        </div>

        {/* Filtro de intervalo de anos */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20, background: "#fff", borderRadius: 10, border: "0.5px solid #DDE2EE", padding: "12px 16px", flexWrap: "wrap" }}>
          <span style={{ fontSize: 12, color: "#555", fontWeight: 600 }}>Período (colunas):</span>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 12, color: "#888" }}>De</span>
            <select value={anoInicio} onChange={e => setAnoInicio(e.target.value)} style={{ ...sel, minWidth: 90 }}>
              <option value="">Todos</option>
              {todosAnosParc.map(a => <option key={a} value={a}>{a}</option>)}
            </select>
            <span style={{ fontSize: 12, color: "#888" }}>até</span>
            <select value={anoFim} onChange={e => setAnoFim(e.target.value)} style={{ ...sel, minWidth: 90 }}>
              <option value="">Todos</option>
              {todosAnosParc.map(a => <option key={a} value={a}>{a}</option>)}
            </select>
          </div>
          {/* Atalhos rápidos */}
          <div style={{ display: "flex", gap: 6, marginLeft: 4 }}>
            {[
              { l: "Próx. 12 meses", i: anoAtual, f: anoAtual },
              { l: "Próx. 3 anos",   i: anoAtual, f: String(Number(anoAtual) + 2) },
              { l: "Próx. 5 anos",   i: anoAtual, f: String(Number(anoAtual) + 4) },
              { l: "Tudo",           i: "",        f: "" },
            ].map(s => (
              <button key={s.l} onClick={() => { setAnoInicio(s.i); setAnoFim(s.f); }}
                style={{ padding: "4px 10px", borderRadius: 6, border: "0.5px solid #DDE2EE", fontSize: 11, background: "#F4F6FA", color: "#555", cursor: "pointer" }}>
                {s.l}
              </button>
            ))}
          </div>
          {anos.length > 0 && (
            <span style={{ marginLeft: "auto", fontSize: 11, color: "#888" }}>
              {anos.length} ano{anos.length !== 1 ? "s" : ""} visível{anos.length !== 1 ? "is" : ""}: {anos[0]} → {anos[anos.length - 1]}
            </span>
          )}
        </div>

        {/* KPI cards */}
        <div style={{ display: "flex", gap: 12, marginBottom: 20, flexWrap: "wrap" }}>
          {[
            { l: "Saldo Devedor Total",    v: fmtBRL(totalSaldo),          cor: "#E24B4A", sub: totalCaptado > 0 ? `${fmtPct((totalSaldo / totalCaptado) * 100)} do captado` : undefined },
            { l: "Total Captado",          v: fmtBRL(totalCaptado),         cor: "#1A4870", sub: `${filtrados.length} contrato${filtrados.length !== 1 ? "s" : ""}` },
            { l: "Total Amortizado",       v: fmtBRL(totalPago),            cor: "#16A34A", sub: totalCaptado > 0 ? `${fmtPct((totalPago / totalCaptado) * 100)} quitado` : undefined },
            { l: `A pagar ${anoInicio || "…"}–${anoFim || "…"}`, v: fmtBRL(totalJanelaTotal), cor: "#1A4870",
              sub: `amort. ${fmtBRL(totalJanelaAmort)} · juros ${fmtBRL(totalJanelaJuros)}` },
            { l: "Juros Acumulados",       v: fmtBRL(totalJuros),           cor: "#C9921B" },
          ].map(k => (
            <div key={k.l} style={{ background: "#fff", borderRadius: 12, border: "0.5px solid #DDE2EE", padding: "14px 20px", flex: 1, minWidth: 150 }}>
              <div style={{ fontSize: 10, color: "#888", fontWeight: 600, textTransform: "uppercase", marginBottom: 5 }}>{k.l}</div>
              <div style={{ fontSize: 19, fontWeight: 700, color: k.cor }}>{k.v}</div>
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
        ) : anos.length === 0 ? (
          <div style={{ textAlign: "center", padding: 60, background: "#fff", borderRadius: 12, border: "0.5px solid #DDE2EE" }}>
            <div style={{ fontSize: 15, fontWeight: 600, color: "#555" }}>Nenhum vencimento no período selecionado</div>
            <div style={{ fontSize: 13, color: "#888", marginTop: 4 }}>Ajuste o intervalo de anos ou desmarque "Apenas em aberto".</div>
          </div>
        ) : (
          <div style={{ background: "#fff", borderRadius: 12, border: "0.5px solid #DDE2EE", overflow: "hidden" }}>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, minWidth: anos.length * 210 + 380 }}>
                <thead>
                  <tr style={{ background: "#1A4870" }}>
                    <th style={{ ...thStyle, textAlign: "left", minWidth: 200, paddingLeft: 16, position: "sticky", left: 0, background: "#1A4870", zIndex: 2 }}>
                      Instituição / Tipo
                    </th>
                    {anos.map(a => (
                      <React.Fragment key={a}>
                        <th style={{ ...thStyle, borderLeft: "1.5px solid rgba(255,255,255,.12)" }}>
                          <div style={{ fontSize: 12, fontWeight: 700 }}>{a}</div>
                          <div style={{ fontSize: 9, opacity: 0.6, fontWeight: 400 }}>Amort.</div>
                        </th>
                        <th style={thStyle}>
                          <div style={{ fontSize: 9, opacity: 0.6, fontWeight: 400 }}>Juros</div>
                        </th>
                        <th style={{ ...thStyle, borderRight: "2px solid rgba(255,255,255,.18)" }}>
                          <div style={{ fontSize: 10, fontWeight: 700 }}>Total</div>
                        </th>
                      </React.Fragment>
                    ))}
                    <th style={{ ...thStyle, borderLeft: "2px solid rgba(255,255,255,.25)" }}>
                      <div style={{ fontSize: 11, fontWeight: 700 }}>Total</div>
                      <div style={{ fontSize: 9, opacity: 0.6, fontWeight: 400 }}>período</div>
                    </th>
                    <th style={{ ...thStyle, width: 50 }}></th>
                  </tr>
                </thead>
                <tbody>
                  {hierarquia.map((n1, ni) => {
                    const n1TotalPer = anos.reduce((s, a) => s + (n1.porAno[a]?.total ?? 0), 0);
                    if (n1TotalPer === 0 && !n1.niveis2.some(n2 => anos.some(a => (n2.porAno[a]?.total ?? 0) > 0))) return null;
                    const rowKey = `n1-${ni}`;
                    const isExp  = expandido.has(rowKey);
                    return (
                      <React.Fragment key={rowKey}>
                        {/* N1: Instituição */}
                        <tr onClick={() => toggle(rowKey)}
                          style={{ background: "#EBF3FC", cursor: "pointer", borderBottom: "0.5px solid #D5E8F5" }}>
                          <td style={{ padding: "10px 16px", fontWeight: 700, fontSize: 13, color: "#0B2D50", position: "sticky", left: 0, background: "#EBF3FC", zIndex: 1 }}>
                            <span style={{ fontSize: 10, color: "#1A4870", marginRight: 6, opacity: 0.5 }}>{isExp ? "▼" : "▶"}</span>
                            {n1.credor}
                            <div style={{ fontSize: 10, color: "#888", fontWeight: 400, marginTop: 2 }}>
                              {n1.niveis2.length} tipo{n1.niveis2.length !== 1 ? "s" : ""} ·{" "}
                              {n1.niveis2.reduce((s, n) => s + n.contratos.length, 0)} contrato{n1.niveis2.reduce((s, n) => s + n.contratos.length, 0) !== 1 ? "s" : ""}
                            </div>
                          </td>
                          {anos.map(a => (
                            <React.Fragment key={a}>
                              <td style={{ ...colV, fontWeight: 600, borderLeft: "1.5px solid #D5E8F5" }}>
                                {(n1.porAno[a]?.amort ?? 0) > 0 ? fmtBRL(n1.porAno[a].amort) : <span style={{ color: "#ddd" }}>—</span>}
                              </td>
                              <td style={{ ...colS }}>
                                {(n1.porAno[a]?.juros ?? 0) > 0 ? fmtBRL(n1.porAno[a].juros) : <span style={{ color: "#ddd" }}>—</span>}
                              </td>
                              <td style={{ ...colV, fontWeight: 700, borderRight: "2px solid #C5D9EE" }}>
                                {(n1.porAno[a]?.total ?? 0) > 0 ? fmtBRL(n1.porAno[a].total) : <span style={{ color: "#ddd" }}>—</span>}
                              </td>
                            </React.Fragment>
                          ))}
                          <td style={{ ...colV, fontWeight: 700, color: "#1A4870", borderLeft: "2px solid #C5D9EE" }}>{fmtBRL(n1TotalPer)}</td>
                          <td />
                        </tr>

                        {/* N2: tipo de crédito */}
                        {isExp && n1.niveis2.map((n2, n2i) => {
                          const n2TotalPer = anos.reduce((s, a) => s + (n2.porAno[a]?.total ?? 0), 0);
                          const rowKey2 = `n2-${ni}-${n2i}`;
                          const isExp2  = expandido.has(rowKey2);
                          return (
                            <React.Fragment key={rowKey2}>
                              <tr onClick={e => { e.stopPropagation(); toggle(rowKey2); }}
                                style={{ background: "#F4F8FC", borderBottom: "0.5px solid #E5EDF5", cursor: "pointer" }}>
                                <td style={{ padding: "8px 16px 8px 32px", fontSize: 12, fontWeight: 600, color: "#1A4870", position: "sticky", left: 0, background: "#F4F8FC", zIndex: 1 }}>
                                  <span style={{ fontSize: 9, color: "#888", marginRight: 5 }}>{isExp2 ? "▼" : "▶"}</span>
                                  {TIPO_LABEL[n2.tipo] ?? n2.tipo}
                                  <span style={{ fontSize: 10, color: "#888", fontWeight: 400, marginLeft: 8 }}>{n2.contratos.length} contrato{n2.contratos.length !== 1 ? "s" : ""}</span>
                                </td>
                                {anos.map(a => (
                                  <React.Fragment key={a}>
                                    <td style={{ ...colV, borderLeft: "1.5px solid #E5EDF5" }}>
                                      {(n2.porAno[a]?.amort ?? 0) > 0 ? fmtBRL(n2.porAno[a].amort) : <span style={{ color: "#ddd" }}>—</span>}
                                    </td>
                                    <td style={colS}>
                                      {(n2.porAno[a]?.juros ?? 0) > 0 ? fmtBRL(n2.porAno[a].juros) : <span style={{ color: "#ddd" }}>—</span>}
                                    </td>
                                    <td style={{ ...colV, fontWeight: 600, borderRight: "2px solid #D4E3F0" }}>
                                      {(n2.porAno[a]?.total ?? 0) > 0 ? fmtBRL(n2.porAno[a].total) : <span style={{ color: "#ddd" }}>—</span>}
                                    </td>
                                  </React.Fragment>
                                ))}
                                <td style={{ ...colV, borderLeft: "2px solid #D4E3F0" }}>{fmtBRL(n2TotalPer)}</td>
                                <td />
                              </tr>

                              {/* N3: contratos individuais */}
                              {isExp2 && n2.contratos.map((c, ci) => {
                                const cTotalPer = anos.reduce((s, a) => {
                                  const parcsAno = parcelasFiltradas(c).filter(p => p.data_vencimento.slice(0, 4) === a);
                                  return s + parcsAno.reduce((ps, p) => ps + p.valor_parcela, 0);
                                }, 0);
                                return (
                                  <tr key={c.id} style={{ background: ci % 2 === 0 ? "#fff" : "#FAFBFC", borderBottom: "0.5px solid #F0F0F0" }}>
                                    <td style={{ padding: "8px 16px 8px 48px", fontSize: 11, position: "sticky", left: 0, background: ci % 2 === 0 ? "#fff" : "#FAFBFC", zIndex: 1 }}>
                                      <div style={{ fontWeight: 600, color: "#1a1a1a" }}>{c.descricao || c.credor}</div>
                                      <div style={{ color: "#888", fontSize: 10 }}>
                                        contrato: {fmtData(c.data_contrato)}
                                        {c.linha_credito ? ` · ${c.linha_credito}` : ""}
                                        {c.taxa_juros_aa != null ? ` · ${c.taxa_juros_aa}% a.a.` : ""}
                                        {" · "}<span style={{ color: c.status === "ativo" ? "#1A4870" : "#16A34A" }}>{c.status === "ativo" ? "Ativo" : "Quitado"}</span>
                                      </div>
                                      {c.parcelasVencidas > 0 && (
                                        <div style={{ fontSize: 10, color: "#E24B4A", fontWeight: 600 }}>⚠ {c.parcelasVencidas} parcela{c.parcelasVencidas > 1 ? "s" : ""} vencida{c.parcelasVencidas > 1 ? "s" : ""}</div>
                                      )}
                                    </td>
                                    {anos.map(a => {
                                      const parcsAno = parcelasFiltradas(c).filter(p => p.data_vencimento.slice(0, 4) === a);
                                      const amA = parcsAno.reduce((s, p) => s + p.amortizacao, 0);
                                      const juA = parcsAno.reduce((s, p) => s + p.juros, 0);
                                      const totA = parcsAno.reduce((s, p) => s + p.valor_parcela, 0);
                                      return (
                                        <React.Fragment key={a}>
                                          <td style={{ ...colV, fontSize: 11, borderLeft: "1.5px solid #EEF1F6" }}>
                                            {amA > 0 ? fmtBRL(amA) : <span style={{ color: "#ddd" }}>—</span>}
                                          </td>
                                          <td style={{ ...colS, fontSize: 11 }}>
                                            {juA > 0 ? fmtBRL(juA) : <span style={{ color: "#ddd" }}>—</span>}
                                          </td>
                                          <td style={{ ...colV, fontSize: 11, fontWeight: 600, borderRight: "2px solid #EEF1F6" }}>
                                            {totA > 0 ? fmtBRL(totA) : <span style={{ color: "#ddd" }}>—</span>}
                                          </td>
                                        </React.Fragment>
                                      );
                                    })}
                                    <td style={{ ...colV, fontSize: 11, borderLeft: "2px solid #EEF1F6" }}>{fmtBRL(cTotalPer)}</td>
                                    <td />
                                  </tr>
                                );
                              })}
                            </React.Fragment>
                          );
                        })}
                      </React.Fragment>
                    );
                  })}

                  {/* Totais por ano */}
                  <tr style={{ background: "#1A4870", fontWeight: 700 }}>
                    <td style={{ padding: "10px 16px", color: "#fff", fontSize: 12, position: "sticky", left: 0, background: "#1A4870", zIndex: 1 }}>
                      TOTAL GERAL
                    </td>
                    {anos.map(a => (
                      <React.Fragment key={a}>
                        <td style={{ ...colV, fontWeight: 700, color: "#fff", borderLeft: "1.5px solid rgba(255,255,255,.12)" }}>
                          {fmtBRL(totalPorAno[a]?.amort ?? 0)}
                        </td>
                        <td style={{ ...colV, fontWeight: 700, color: "#FDE9BB" }}>
                          {fmtBRL(totalPorAno[a]?.juros ?? 0)}
                        </td>
                        <td style={{ ...colV, fontWeight: 700, color: "#fff", borderRight: "2px solid rgba(255,255,255,.2)" }}>
                          {fmtBRL(totalPorAno[a]?.total ?? 0)}
                        </td>
                      </React.Fragment>
                    ))}
                    <td style={{ ...colV, fontWeight: 700, color: "#fff", borderLeft: "2px solid rgba(255,255,255,.25)" }}>
                      {fmtBRL(totalJanelaTotal)}
                    </td>
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
