"use client";
import React, { useState, useEffect, useRef, Suspense } from "react";
import TopNav from "../../../components/TopNav";
import { abrirPreviewImpressao } from "../../../lib/print";
import { useAuth } from "../../../components/AuthProvider";
import { supabase } from "../../../lib/supabase";
import { listarOperacoesGerenciais } from "../../../lib/db";
import type { Lancamento, OperacaoGerencial } from "../../../lib/supabase";

// ─── helpers ─────────────────────────────────────────────────────────────────
const fmtBRL = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2 });
const fmtDate = (s?: string) =>
  s ? new Date(s + "T12:00:00").toLocaleDateString("pt-BR") : "—";
const hoje = () => new Date().toISOString().slice(0, 10);
const mesInicio = () => { const d = new Date(); d.setDate(1); return d.toISOString().slice(0, 10); };

const STATUS_LABELS: Record<string, string> = {
  em_aberto: "Em Aberto", vencendo: "A Vencer",
  vencido: "Vencido", parcial: "Parcial", baixado: "Pago",
};
const STATUS_COR: Record<string, string> = {
  em_aberto: "#444444", vencendo: "#EF9F27",
  vencido: "#E24B4A", parcial: "#9333EA", baixado: "#16A34A",
};

type OrdemGrupos = "label_asc" | "label_desc" | "valor_desc" | "valor_asc" | "qtd_desc";
type OrdemLinhas = "vcto_asc" | "vcto_desc" | "valor_desc" | "valor_asc" | "descricao_asc";

interface LancRow extends Lancamento {
  pessoa_nome?: string;
  op_descricao?: string;
}

interface Grupo {
  chave: string;
  label: string;
  rows: LancRow[];
  total: number;
}

// ─── componente ──────────────────────────────────────────────────────────────
function RelFinClassInner() {
  const { fazendaId, fazendaIds, nomeFazendaSelecionada } = useAuth();

  const [inicio, setInicio]   = useState(mesInicio());
  const [fim, setFim]         = useState(hoje());
  const [tipo, setTipo]       = useState<"todos" | "pagar" | "receber">("todos");
  const [statusSel, setStatusSel] = useState<Set<string>>(
    new Set(["em_aberto", "vencendo", "vencido", "parcial", "baixado"])
  );

  // null = sem filtro (mostra tudo); Set = mostra só os IDs listados
  const [classifSel, setClassifSel] = useState<Set<string> | null>(null);
  const [classifOpts, setClassifOpts] = useState<{ chave: string; label: string }[]>([]);
  const [classifDropdownOpen, setClassifDropdownOpen] = useState(false);
  const [classifBusca, setClassifBusca] = useState("");
  const classifDropdownRef = useRef<HTMLDivElement>(null);

  const [ordemGrupos, setOrdemGrupos] = useState<OrdemGrupos>("label_asc");
  const [ordemLinhas, setOrdemLinhas] = useState<OrdemLinhas>("vcto_asc");

  const [grupos, setGrupos]   = useState<Grupo[]>([]);
  const [gerado, setGerado]   = useState(false);
  const [loading, setLoading] = useState(false);
  const [ops, setOps]         = useState<OperacaoGerencial[]>([]);

  useEffect(() => {
    if (!fazendaId) return;
    listarOperacoesGerenciais(fazendaId).then(setOps).catch(() => {});
  }, [fazendaId]);

  // carregar OGs usadas em lançamentos
  useEffect(() => {
    if (!fazendaId || ops.length === 0) return;
    supabase.from("lancamentos")
      .select("categoria, operacao_gerencial_id")
      .in("fazenda_id", fazendaIds)
      .then(({ data }) => {
        const map = new Map<string, string>();
        (data ?? []).forEach(l => {
          const op = ops.find(o => o.id === l.operacao_gerencial_id);
          const chave = l.operacao_gerencial_id ?? l.categoria ?? "Sem Classificação";
          const label = op?.descricao ?? l.categoria ?? "Sem Classificação";
          map.set(chave, label);
        });
        const sorted = [...map.entries()]
          .map(([chave, label]) => ({ chave, label }))
          .sort((a, b) => a.label.localeCompare(b.label));
        setClassifOpts(sorted);
      });
  }, [fazendaId, ops]);

  // fechar dropdown ao clicar fora
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (classifDropdownRef.current && !classifDropdownRef.current.contains(e.target as Node)) {
        setClassifDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // OGs disponíveis no dropdown — somente as que têm lançamentos
  const optsVisiveis = classifOpts.filter(o =>
    classifBusca === "" || o.label.toLowerCase().includes(classifBusca.toLowerCase())
  );

  const totalOpts = classifOpts.length;
  const selCount = classifSel === null ? totalOpts : [...classifSel].filter(id => classifOpts.some(o => o.chave === id)).length;

  function toggleClassif(chave: string) {
    if (classifSel === null) {
      // estava "todas" → desmarcar só esta
      const novo = new Set(classifOpts.map(o => o.chave).filter(x => x !== chave));
      setClassifSel(novo);
    } else {
      const n = new Set(classifSel);
      n.has(chave) ? n.delete(chave) : n.add(chave);
      setClassifSel(n);
    }
  }
  function isChecked(chave: string) {
    return classifSel === null || classifSel.has(chave);
  }

  function toggleStatus(s: string) {
    setStatusSel(prev => {
      const n = new Set(prev);
      n.has(s) ? n.delete(s) : n.add(s);
      return n;
    });
  }

  // ordenar linhas dentro do grupo
  function sortLinhas(rows: LancRow[]): LancRow[] {
    return [...rows].sort((a, b) => {
      switch (ordemLinhas) {
        case "vcto_asc":      return (a.data_vencimento ?? "").localeCompare(b.data_vencimento ?? "");
        case "vcto_desc":     return (b.data_vencimento ?? "").localeCompare(a.data_vencimento ?? "");
        case "valor_desc":    return b.valor - a.valor;
        case "valor_asc":     return a.valor - b.valor;
        case "descricao_asc": return (a.descricao ?? "").localeCompare(b.descricao ?? "");
      }
    });
  }

  // ordenar grupos
  function sortGrupos(gs: Grupo[]): Grupo[] {
    return [...gs].sort((a, b) => {
      switch (ordemGrupos) {
        case "label_asc":   return a.label.localeCompare(b.label);
        case "label_desc":  return b.label.localeCompare(a.label);
        case "valor_desc":  return Math.abs(b.total) - Math.abs(a.total);
        case "valor_asc":   return Math.abs(a.total) - Math.abs(b.total);
        case "qtd_desc":    return b.rows.length - a.rows.length;
      }
    });
  }

  // ── gerar relatório ───────────────────────────────────────────────────────
  async function gerar() {
    if (!fazendaId) return;
    setLoading(true);
    try {
      let q = supabase
        .from("lancamentos")
        .select("*, pessoas(nome)")
        .in("fazenda_id", fazendaIds)
        .gte("data_vencimento", inicio)
        .lte("data_vencimento", fim);

      if (tipo !== "todos") q = q.eq("tipo", tipo);
      if (statusSel.size < 5)
        q = q.in("status", [...statusSel]);

      const { data, error } = await q;
      if (error) throw error;

      const rows: LancRow[] = (data ?? []).map((l: LancRow & { pessoas?: { nome: string } | null }) => ({
        ...l,
        pessoa_nome: l.pessoas?.nome ?? undefined,
        op_descricao: ops.find(o => o.id === l.operacao_gerencial_id)?.descricao,
      }));

      // agrupar por classificação
      const mapaGrupos = new Map<string, Grupo>();
      rows.forEach(r => {
        const chave = r.operacao_gerencial_id ?? r.categoria ?? "Sem Classificação";
        // aplicar filtro de classificação
        if (classifSel !== null && classifSel.size > 0 && !classifSel.has(chave)) return;
        if (classifSel !== null && classifSel.size === 0) return; // nenhuma selecionada
        const label = r.op_descricao ?? r.categoria ?? "Sem Classificação";
        if (!mapaGrupos.has(chave)) mapaGrupos.set(chave, { chave, label, rows: [], total: 0 });
        const g = mapaGrupos.get(chave)!;
        g.rows.push(r);
        g.total += r.tipo === "pagar" ? -r.valor : r.valor;
      });

      // ordenar linhas de cada grupo
      const gruposOrdenados = sortGrupos(
        [...mapaGrupos.values()].map(g => ({ ...g, rows: sortLinhas(g.rows) }))
      );
      setGrupos(gruposOrdenados);
      setGerado(true);
    } finally {
      setLoading(false);
    }
  }

  // ── totais ────────────────────────────────────────────────────────────────
  const totalEntradas = grupos.reduce((s, g) => s + g.rows.filter(r => r.tipo === "receber").reduce((a, r) => a + r.valor, 0), 0);
  const totalSaidas   = grupos.reduce((s, g) => s + g.rows.filter(r => r.tipo === "pagar").reduce((a, r) => a + r.valor, 0), 0);
  const saldo         = totalEntradas - totalSaidas;
  const totalLinhas   = grupos.reduce((s, g) => s + g.rows.length, 0);

  // ── PDF ───────────────────────────────────────────────────────────────────
  function gerarPDF() {
    const periodoLabel = `${fmtDate(inicio)} a ${fmtDate(fim)}`;
    const tipoLabel = { todos: "CP + CR", pagar: "Contas a Pagar", receber: "Contas a Receber" }[tipo];
    const statusLabel = [...statusSel].map(s => STATUS_LABELS[s]).join(", ") || "Todos";

    const corStatus = (s: string) => STATUS_COR[s] ?? "var(--text-3)";
    const bgTipo    = (t: string) => t === "receber" ? "#EFF8F0" : "#FEF2F2";
    const corValor  = (t: string) => t === "receber" ? "#16A34A" : "#DC2626";

    const gruposHtml = grupos.map(g => {
      const subTotal = g.rows.reduce((s, r) => s + (r.tipo === "pagar" ? -r.valor : r.valor), 0);
      const rows = g.rows.map(r => `
        <tr style="border-bottom:0.5px solid #F0F3FA;background:${bgTipo(r.tipo)}08">
          <td style="padding:4px 8px;font-size:9px;white-space:nowrap">${fmtDate(r.data_vencimento)}</td>
          <td style="padding:4px 8px;font-size:9px;max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${r.descricao}</td>
          <td style="padding:4px 8px;font-size:9px;white-space:nowrap">${r.pessoa_nome ?? "—"}</td>
          <td style="padding:4px 8px;font-size:9px;text-align:center;white-space:nowrap">${r.num_parcela ? `${r.num_parcela}/${r.total_parcelas}` : "—"}</td>
          <td style="padding:4px 8px;font-size:9px;text-align:right;font-weight:600;color:${corValor(r.tipo)};white-space:nowrap">${r.tipo === "pagar" ? "−" : "+"}${fmtBRL(r.valor)}</td>
          <td style="padding:4px 8px;text-align:center">
            <span style="font-size:8px;background:${corStatus(r.status)}20;color:${corStatus(r.status)};border-radius:4px;padding:1px 5px;font-weight:600;white-space:nowrap">
              ${STATUS_LABELS[r.status] ?? r.status}
            </span>
          </td>
          <td style="padding:4px 8px;font-size:9px;text-align:center;color:#888;white-space:nowrap">${r.data_baixa ? fmtDate(r.data_baixa) : "—"}</td>
        </tr>`).join("");

      return `
        <tr style="background:#111111">
          <td colspan="7" style="padding:6px 10px;font-size:10px;font-weight:700;color:#fff;letter-spacing:.05em">
            ${g.label}
          </td>
        </tr>
        ${rows}
        <tr style="background:#EFF3FA;border-top:1px solid #E8E8E8">
          <td colspan="4" style="padding:4px 10px;font-size:9px;font-weight:700;color:#111111;text-align:right">
            Subtotal ${g.label}
          </td>
          <td colspan="3" style="padding:4px 10px;font-size:10px;font-weight:700;color:${subTotal >= 0 ? "#16A34A" : "#DC2626"};text-align:right">
            ${fmtBRL(subTotal)}
          </td>
        </tr>`;
    }).join("");

    const html = `
      <p style="font-size:10px;color:#555;margin-bottom:4px">
        Período: <strong>${periodoLabel}</strong> · Tipo: <strong>${tipoLabel}</strong> · Status: <strong>${statusLabel}</strong>
      </p>
      <p style="font-size:10px;color:#555;margin-bottom:12px">
        ${totalLinhas} lançamentos em ${grupos.length} classificações
      </p>
      <div class="auto-fit-table">
      <table style="border-collapse:collapse;font-family:system-ui,sans-serif;white-space:nowrap">
        <thead>
          <tr style="background:var(--bg-page)">
            <th style="padding:5px 8px;font-size:9px;font-weight:700;color:#555;border-bottom:1.5px solid #111111;text-align:left;white-space:nowrap">Vcto</th>
            <th style="padding:5px 8px;font-size:9px;font-weight:700;color:#555;border-bottom:1.5px solid #111111;text-align:left;white-space:nowrap">Descrição</th>
            <th style="padding:5px 8px;font-size:9px;font-weight:700;color:#555;border-bottom:1.5px solid #111111;text-align:left;white-space:nowrap">Fornecedor / Cliente</th>
            <th style="padding:5px 8px;font-size:9px;font-weight:700;color:#555;border-bottom:1.5px solid #111111;text-align:center;white-space:nowrap">Parcela</th>
            <th style="padding:5px 8px;font-size:9px;font-weight:700;color:#555;border-bottom:1.5px solid #111111;text-align:right;white-space:nowrap">Valor</th>
            <th style="padding:5px 8px;font-size:9px;font-weight:700;color:#555;border-bottom:1.5px solid #111111;text-align:center;white-space:nowrap">Status</th>
            <th style="padding:5px 8px;font-size:9px;font-weight:700;color:#555;border-bottom:1.5px solid #111111;text-align:center;white-space:nowrap">Baixa</th>
          </tr>
        </thead>
        <tbody>
          ${gruposHtml}
          <tr style="background:#111111;border-top:2px solid #0D0D0D">
            <td colspan="4" style="padding:6px 10px;font-size:10px;font-weight:700;color:#fff;text-align:right">TOTAL GERAL</td>
            <td colspan="3" style="padding:6px 10px;font-size:11px;font-weight:800;color:${saldo >= 0 ? "#86EFAC" : "#FCA5A5"};text-align:right">${fmtBRL(saldo)}</td>
          </tr>
          <tr style="background:var(--bg-page)">
            <td colspan="4" style="padding:4px 10px;font-size:9px;color:#111111;text-align:right">Entradas</td>
            <td colspan="3" style="padding:4px 10px;font-size:9px;color:#16A34A;font-weight:600;text-align:right">+${fmtBRL(totalEntradas)}</td>
          </tr>
          <tr style="background:var(--bg-page)">
            <td colspan="4" style="padding:4px 10px;font-size:9px;color:#555;text-align:right">Saídas</td>
            <td colspan="3" style="padding:4px 10px;font-size:9px;color:#DC2626;font-weight:600;text-align:right">−${fmtBRL(totalSaidas)}</td>
          </tr>
        </tbody>
      </table>
      </div>`;

    abrirPreviewImpressao("Financeiro por Classificação", html, {
      orientation: "landscape",
      fazenda: nomeFazendaSelecionada ?? "",
      subtitulo: `${periodoLabel} · ${tipoLabel}`,
    });
  }

  // ── Excel ─────────────────────────────────────────────────────────────────
  async function exportarExcel() {
    const XLSX = await import("xlsx");

    const ws_data: (string | number)[][] = [];

    ws_data.push([`Relatório Financeiro por Classificação — ${nomeFazendaSelecionada ?? ""}`]);
    ws_data.push([`Período: ${fmtDate(inicio)} a ${fmtDate(fim)} | Tipo: ${{ todos: "CP + CR", pagar: "Contas a Pagar", receber: "Contas a Receber" }[tipo]}`]);
    ws_data.push([`Gerado em: ${new Date().toLocaleString("pt-BR")}`]);
    ws_data.push([]);

    ws_data.push(["Vcto", "Descrição", "Fornecedor / Cliente", "Parcela", "Tipo", "Valor (R$)", "Status", "Data Baixa"]);

    grupos.forEach(g => {
      ws_data.push([g.label, "", "", "", "", "", "", ""]);

      g.rows.forEach(r => {
        ws_data.push([
          fmtDate(r.data_vencimento),
          r.descricao,
          r.pessoa_nome ?? "",
          r.num_parcela ? `${r.num_parcela}/${r.total_parcelas}` : "",
          r.tipo === "pagar" ? "Pagar" : "Receber",
          r.tipo === "pagar" ? -r.valor : r.valor,
          STATUS_LABELS[r.status] ?? r.status,
          r.data_baixa ? fmtDate(r.data_baixa) : "",
        ]);
      });

      const subTotal = g.rows.reduce((s, r) => s + (r.tipo === "pagar" ? -r.valor : r.valor), 0);
      ws_data.push(["", "", "", "", `Subtotal ${g.label}`, subTotal, "", ""]);
      ws_data.push([]);
    });

    ws_data.push(["", "", "", "", "TOTAL ENTRADAS", totalEntradas, "", ""]);
    ws_data.push(["", "", "", "", "TOTAL SAÍDAS", -totalSaidas, "", ""]);
    ws_data.push(["", "", "", "", "SALDO", saldo, "", ""]);

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(ws_data);

    ws["!cols"] = [
      { wch: 12 }, { wch: 40 }, { wch: 30 }, { wch: 10 },
      { wch: 12 }, { wch: 16 }, { wch: 12 }, { wch: 12 },
    ];

    const valueCol = 5;
    const range = XLSX.utils.decode_range(ws["!ref"] ?? "A1");
    for (let R = range.s.r; R <= range.e.r; R++) {
      const cell = ws[XLSX.utils.encode_cell({ r: R, c: valueCol })];
      if (cell && typeof cell.v === "number") {
        cell.z = "#,##0.00";
      }
    }

    XLSX.utils.book_append_sheet(wb, ws, "Por Classificação");

    const resumo: (string | number)[][] = [
      ["Classificação", "Entradas (R$)", "Saídas (R$)", "Saldo (R$)", "Qtd Lançamentos"],
    ];
    grupos.forEach(g => {
      const ent = g.rows.filter(r => r.tipo === "receber").reduce((s, r) => s + r.valor, 0);
      const sai = g.rows.filter(r => r.tipo === "pagar").reduce((s, r) => s + r.valor, 0);
      resumo.push([g.label, ent, sai, ent - sai, g.rows.length]);
    });
    resumo.push([]);
    resumo.push(["TOTAL", totalEntradas, totalSaidas, saldo, totalLinhas]);

    const wsRes = XLSX.utils.aoa_to_sheet(resumo);
    wsRes["!cols"] = [{ wch: 40 }, { wch: 18 }, { wch: 18 }, { wch: 18 }, { wch: 18 }];
    XLSX.utils.book_append_sheet(wb, wsRes, "Resumo");

    const nomeArquivo = `financeiro-classificacao_${(nomeFazendaSelecionada ?? "fazenda").replace(/\s+/g, "_")}_${inicio}_${fim}.xlsx`;
    XLSX.writeFile(wb, nomeArquivo);
  }

  // ── estilos ───────────────────────────────────────────────────────────────
  const inp: React.CSSProperties = {
    padding: "7px 10px", border: "0.5px solid var(--border-table)", borderRadius: 8,
    fontSize: 13, color: "var(--text-1)", background: "var(--bg-input)", outline: "none", width: "100%",
  };
  const lbl: React.CSSProperties = { fontSize: 11, color: "var(--text-2)", marginBottom: 4, display: "block" };
  const btnCheck = (active: boolean, cor?: string): React.CSSProperties => ({
    padding: "5px 12px", borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: "pointer",
    border: `0.5px solid ${active ? (cor ?? "#111111") : "var(--border-table)"}`,
    background: active ? (cor ?? "#111111") + "15" : "var(--bg-card)",
    color: active ? (cor ?? "#111111") : "var(--text-3)",
  });
  const selStyle: React.CSSProperties = {
    padding: "7px 10px", border: "0.5px solid var(--border-table)", borderRadius: 8,
    fontSize: 13, color: "var(--text-1)", background: "var(--bg-input)", outline: "none", cursor: "pointer",
  };

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg-page)" }}>
      <TopNav />
      <div style={{ maxWidth: 1400, margin: "0 auto", padding: "28px 24px" }}>
        {/* Cabeçalho */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24 }}>
          <div>
            <h1 style={{ fontSize: 20, fontWeight: 700, color: "var(--text-1)", margin: 0 }}>Financeiro por Classificação</h1>
            <p style={{ fontSize: 13, color: "#666", margin: "4px 0 0" }}>
              Relatório de lançamentos agrupados por categoria contábil
            </p>
          </div>
          {gerado && (
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={gerarPDF} style={{ padding: "9px 18px", background: "#111111", color: "#fff", border: "none", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
                PDF / Imprimir
              </button>
              <button onClick={exportarExcel} style={{ padding: "9px 18px", background: "#16A34A", color: "#fff", border: "none", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
                Exportar Excel
              </button>
            </div>
          )}
        </div>

        {/* Filtros */}
        <div style={{ background: "var(--bg-card)", borderRadius: 12, border: "0.5px solid var(--border)", padding: 20, marginBottom: 20 }}>

          {/* Linha 1: datas, tipo, status */}
          <div style={{ display: "grid", gridTemplateColumns: "160px 160px 1fr 1fr", gap: 16, marginBottom: 16 }}>
            <div>
              <label style={lbl}>Data Início (Vcto)</label>
              <input type="date" value={inicio} onChange={e => setInicio(e.target.value)} style={inp} />
            </div>
            <div>
              <label style={lbl}>Data Fim (Vcto)</label>
              <input type="date" value={fim} onChange={e => setFim(e.target.value)} style={inp} />
            </div>
            <div>
              <label style={lbl}>Tipo</label>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {(["todos", "pagar", "receber"] as const).map(t => (
                  <button key={t} onClick={() => setTipo(t)}
                    style={{ ...btnCheck(tipo === t, t === "receber" ? "#16A34A" : t === "pagar" ? "#DC2626" : "#111111") }}>
                    {t === "todos" ? "Todos" : t === "pagar" ? "Contas a Pagar" : "Contas a Receber"}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label style={lbl}>Status</label>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {Object.entries(STATUS_LABELS).map(([s, l]) => (
                  <button key={s} onClick={() => toggleStatus(s)}
                    style={btnCheck(statusSel.has(s), STATUS_COR[s])}>
                    {l}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Linha 2: classificações (dropdown) + ordenação */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 220px 220px", gap: 16, alignItems: "end" }}>

            {/* Dropdown multi-select de OGs */}
            <div>
              <label style={lbl}>
                Operações Gerenciais
                {classifSel !== null && classifSel.size < totalOpts && (
                  <span style={{ marginLeft: 8, color: "#C9921B", fontWeight: 600 }}>
                    {selCount} de {totalOpts} selecionada{selCount !== 1 ? "s" : ""}
                  </span>
                )}
              </label>
              <div ref={classifDropdownRef} style={{ position: "relative" }}>
                {/* Trigger */}
                <button
                  onClick={() => setClassifDropdownOpen(v => !v)}
                  style={{
                    width: "100%", padding: "7px 10px", border: "0.5px solid var(--border-table)",
                    borderRadius: 8, fontSize: 13, background: "var(--bg-input)", color: "var(--text-1)",
                    cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center",
                    outline: "none",
                  }}
                >
                  <span>
                    {classifSel === null || selCount === totalOpts
                      ? `Todas (${totalOpts})`
                      : classifSel.size === 0
                        ? "Nenhuma selecionada"
                        : `${selCount} de ${totalOpts} selecionada${selCount !== 1 ? "s" : ""}`}
                  </span>
                  <span style={{ fontSize: 10, color: "var(--text-3)" }}>{classifDropdownOpen ? "▲" : "▼"}</span>
                </button>

                {/* Panel */}
                {classifDropdownOpen && (
                  <div style={{
                    position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0, zIndex: 200,
                    background: "var(--bg-card)", border: "0.5px solid var(--border)", borderRadius: 10,
                    boxShadow: "0 8px 24px rgba(0,0,0,.12)",
                  }}>
                    {/* Busca */}
                    <div style={{ padding: "10px 12px", borderBottom: "0.5px solid var(--border)" }}>
                      <input
                        type="text"
                        placeholder="Buscar OG..."
                        value={classifBusca}
                        onChange={e => setClassifBusca(e.target.value)}
                        style={{ ...inp, padding: "6px 10px", width: "100%" }}
                        autoFocus
                      />
                    </div>
                    {/* Todas / Nenhuma */}
                    <div style={{ padding: "6px 12px", borderBottom: "0.5px solid var(--border)", display: "flex", gap: 16 }}>
                      <button
                        onClick={() => { setClassifSel(null); setClassifBusca(""); }}
                        style={{ fontSize: 12, color: "#1A4870", background: "none", border: "none", cursor: "pointer", fontWeight: 600, padding: 0 }}
                      >
                        Todas
                      </button>
                      <button
                        onClick={() => setClassifSel(new Set())}
                        style={{ fontSize: 12, color: "var(--text-3)", background: "none", border: "none", cursor: "pointer", padding: 0 }}
                      >
                        Nenhuma
                      </button>
                    </div>
                    {/* Lista de OGs usadas */}
                    <div style={{ maxHeight: 280, overflowY: "auto" }}>
                      {optsVisiveis.length === 0 ? (
                        <div style={{ padding: "12px 14px", fontSize: 12, color: "var(--text-3)", textAlign: "center" }}>
                          Nenhuma OG encontrada
                        </div>
                      ) : optsVisiveis.map(o => (
                        <label key={o.chave} style={{
                          display: "flex", alignItems: "center", gap: 10,
                          padding: "7px 14px", cursor: "pointer",
                          borderBottom: "0.5px solid var(--border-table)",
                        }}>
                          <input
                            type="checkbox"
                            checked={isChecked(o.chave)}
                            onChange={() => toggleClassif(o.chave)}
                            style={{ flexShrink: 0, cursor: "pointer", accentColor: "#1A4870" }}
                          />
                          <span style={{ fontSize: 12, color: "var(--text-1)", fontWeight: 500 }}>
                            {o.label}
                          </span>
                        </label>
                      ))}
                    </div>
                    {/* Footer com botão fechar */}
                    <div style={{ padding: "8px 12px", borderTop: "0.5px solid var(--border)", textAlign: "right" }}>
                      <button
                        onClick={() => setClassifDropdownOpen(false)}
                        style={{ padding: "5px 14px", background: "#1A4870", color: "#fff", border: "none", borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: "pointer" }}
                      >
                        Confirmar
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Ordenação dos grupos */}
            <div>
              <label style={lbl}>Ordenar grupos por</label>
              <select value={ordemGrupos} onChange={e => setOrdemGrupos(e.target.value as OrdemGrupos)} style={selStyle}>
                <option value="label_asc">Classificação A→Z</option>
                <option value="label_desc">Classificação Z→A</option>
                <option value="valor_desc">Maior valor (absoluto)</option>
                <option value="valor_asc">Menor valor (absoluto)</option>
                <option value="qtd_desc">Mais lançamentos</option>
              </select>
            </div>

            {/* Ordenação das linhas */}
            <div>
              <label style={lbl}>Ordenar lançamentos por</label>
              <select value={ordemLinhas} onChange={e => setOrdemLinhas(e.target.value as OrdemLinhas)} style={selStyle}>
                <option value="vcto_asc">Vencimento (mais próximo)</option>
                <option value="vcto_desc">Vencimento (mais antigo)</option>
                <option value="valor_desc">Maior valor</option>
                <option value="valor_asc">Menor valor</option>
                <option value="descricao_asc">Descrição A→Z</option>
              </select>
            </div>
          </div>

          <div style={{ marginTop: 16, display: "flex", justifyContent: "flex-end" }}>
            <button onClick={gerar} disabled={loading}
              style={{ padding: "10px 28px", background: "#C9921B", color: "#fff", border: "none", borderRadius: 8, fontSize: 14, fontWeight: 700, cursor: "pointer" }}>
              {loading ? "Gerando..." : "Gerar Relatório"}
            </button>
          </div>
        </div>

        {/* Resultados */}
        {gerado && (
          <>
            {/* KPI cards */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16, marginBottom: 20 }}>
              {[
                { label: "Entradas", val: totalEntradas, cor: "#16A34A" },
                { label: "Saídas",   val: totalSaidas,   cor: "#DC2626" },
                { label: "Saldo",    val: saldo,          cor: saldo >= 0 ? "#16A34A" : "#DC2626" },
                { label: "Lançamentos", val: totalLinhas,  cor: "#111111", isNum: true },
              ].map(k => (
                <div key={k.label} style={{ background: "var(--bg-card)", borderRadius: 10, border: "0.5px solid var(--border)", padding: "14px 18px" }}>
                  <p style={{ margin: 0, fontSize: 11, color: "var(--text-3)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>{k.label}</p>
                  <p style={{ margin: "6px 0 0", fontSize: 18, fontWeight: 700, color: k.cor }}>
                    {k.isNum ? totalLinhas : fmtBRL(k.val as number)}
                  </p>
                </div>
              ))}
            </div>

            {/* Tabela por grupo */}
            {grupos.length === 0 ? (
              <div style={{ background: "var(--bg-card)", borderRadius: 12, border: "0.5px solid var(--border)", padding: 40, textAlign: "center", color: "var(--text-3)" }}>
                Nenhum lançamento encontrado com os filtros selecionados.
              </div>
            ) : (
              <div style={{ background: "var(--bg-card)", borderRadius: 12, border: "0.5px solid var(--border)", overflow: "hidden" }}>
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                    <thead>
                      <tr style={{ background: "var(--bg-page)" }}>
                        {["Vcto", "Descrição", "Fornecedor / Cliente", "Parcela", "Valor", "Status", "Baixa"].map(h => (
                          <th key={h} style={{ padding: "10px 12px", textAlign: h === "Valor" ? "right" : h === "Parcela" || h === "Status" || h === "Baixa" ? "center" : "left", fontSize: 11, fontWeight: 700, color: "var(--text-2)", borderBottom: "1.5px solid var(--border)", whiteSpace: "nowrap" }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {grupos.map(g => {
                        const subTotal = g.rows.reduce((s, r) => s + (r.tipo === "pagar" ? -r.valor : r.valor), 0);
                        return (
                          <React.Fragment key={g.chave}>
                            <tr style={{ background: "#111111" }}>
                              <td colSpan={7} style={{ padding: "8px 12px", fontSize: 12, fontWeight: 700, color: "#fff", letterSpacing: "0.05em" }}>
                                {g.label}
                                <span style={{ float: "right", fontSize: 11, opacity: 0.8 }}>{g.rows.length} lançamento{g.rows.length !== 1 ? "s" : ""}</span>
                              </td>
                            </tr>
                            {g.rows.map((r, i) => (
                              <tr key={r.id} style={{ background: i % 2 === 0 ? "#fff" : "#FAFBFD", borderBottom: "0.5px solid #F0F3FA" }}>
                                <td style={{ padding: "8px 12px", color: "var(--text-2)", whiteSpace: "nowrap" }}>{fmtDate(r.data_vencimento)}</td>
                                <td style={{ padding: "8px 12px", maxWidth: 260, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.descricao}</td>
                                <td style={{ padding: "8px 12px", color: "var(--text-2)", whiteSpace: "nowrap" }}>{r.pessoa_nome ?? "—"}</td>
                                <td style={{ padding: "8px 12px", textAlign: "center", color: "var(--text-3)", whiteSpace: "nowrap" }}>
                                  {r.num_parcela ? `${r.num_parcela}/${r.total_parcelas}` : "—"}
                                </td>
                                <td style={{ padding: "8px 12px", textAlign: "right", fontWeight: 600, whiteSpace: "nowrap", color: r.tipo === "pagar" ? "#DC2626" : "#16A34A" }}>
                                  {r.tipo === "pagar" ? "−" : "+"}{fmtBRL(r.valor)}
                                </td>
                                <td style={{ padding: "8px 12px", textAlign: "center" }}>
                                  <span style={{ fontSize: 11, background: STATUS_COR[r.status] + "20", color: STATUS_COR[r.status], borderRadius: 5, padding: "2px 8px", fontWeight: 600, whiteSpace: "nowrap" }}>
                                    {STATUS_LABELS[r.status] ?? r.status}
                                  </span>
                                </td>
                                <td style={{ padding: "8px 12px", textAlign: "center", color: "var(--text-3)", whiteSpace: "nowrap" }}>
                                  {r.data_baixa ? fmtDate(r.data_baixa) : "—"}
                                </td>
                              </tr>
                            ))}
                            <tr style={{ background: "var(--bg-tag)", borderTop: "1px solid #E8E8E8" }}>
                              <td colSpan={4} style={{ padding: "6px 12px", fontSize: 12, fontWeight: 700, color: "#111111", textAlign: "right" }}>
                                Subtotal
                              </td>
                              <td colSpan={3} style={{ padding: "6px 12px", fontSize: 13, fontWeight: 800, textAlign: "right", color: subTotal >= 0 ? "#16A34A" : "#DC2626" }}>
                                {fmtBRL(subTotal)}
                              </td>
                            </tr>
                          </React.Fragment>
                        );
                      })}
                      <tr style={{ background: "#111111" }}>
                        <td colSpan={4} style={{ padding: "10px 12px", fontSize: 13, fontWeight: 700, color: "#fff", textAlign: "right" }}>TOTAL GERAL</td>
                        <td colSpan={3} style={{ padding: "10px 12px", fontSize: 15, fontWeight: 800, textAlign: "right", color: saldo >= 0 ? "#86EFAC" : "#FCA5A5" }}>
                          {fmtBRL(saldo)}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export default function RelFinancClassPage() {
  return (
    <Suspense fallback={<div style={{ padding: 40, textAlign: "center", color: "var(--text-3)" }}>Carregando...</div>}>
      <RelFinClassInner />
    </Suspense>
  );
}
