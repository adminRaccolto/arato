"use client";
import React, { useState, useEffect, useRef, useMemo, Suspense } from "react";
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

// ─── constantes ──────────────────────────────────────────────────────────────
const STATUS_LABELS: Record<string, string> = {
  em_aberto: "Em Aberto", vencendo: "A Vencer",
  vencido: "Vencido", parcial: "Parcial", baixado: "Pago",
};
const STATUS_COR: Record<string, string> = {
  em_aberto: "#444444", vencendo: "#EF9F27",
  vencido: "#E24B4A", parcial: "#9333EA", baixado: "#16A34A",
};
const MOEDA_LABELS: Record<string, string> = {
  BRL: "Real (BRL)", USD: "Dólar (USD)", barter: "Barter",
};
const AGRUPADORES_DISP: { key: AgrupadorKey; label: string }[] = [
  { key: "og",         label: "OG" },
  { key: "fornecedor", label: "Fornecedor/Cliente" },
  { key: "vencimento", label: "Vencimento" },
  { key: "data",       label: "Data Lançamento" },
  { key: "moeda",      label: "Moeda" },
  { key: "fazenda",    label: "Fazenda" },
  { key: "produtor",   label: "Produtor" },
];

// ─── tipos ───────────────────────────────────────────────────────────────────
type AgrupadorKey = "data" | "vencimento" | "fornecedor" | "og" | "moeda" | "fazenda" | "produtor";

interface ClassifOpt { chave: string; label: string; codigo?: string; }

interface LancRow extends Lancamento {
  pessoa_nome?: string;
  op_descricao?: string;
  op_codigo?: string;
  fazenda_nome?: string;
  produtor_nome?: string;
}

interface NoGrupo {
  chave: string;
  label: string;
  total: number;
  filhos: NoGrupo[];
  rows: LancRow[];
}

// ─── lógica de agrupamento ────────────────────────────────────────────────────
function getChave(r: LancRow, agr: AgrupadorKey): string {
  switch (agr) {
    case "data":       return r.data_lancamento?.slice(0, 10) ?? "__sem__";
    case "vencimento": return r.data_vencimento?.slice(0, 10) ?? "__sem__";
    case "fornecedor": return r.pessoa_id ?? "__sem__";
    case "og":         return r.operacao_gerencial_id ?? r.categoria ?? "__sem__";
    case "moeda":      return r.moeda ?? "BRL";
    case "fazenda":    return r.fazenda_id ?? "__sem__";
    case "produtor":   return r.produtor_id ?? "__sem__";
  }
}
function getLabel(r: LancRow, agr: AgrupadorKey): string {
  switch (agr) {
    case "data":       return r.data_lancamento ? fmtDate(r.data_lancamento) : "Sem Data";
    case "vencimento": return r.data_vencimento ? fmtDate(r.data_vencimento) : "Sem Vencimento";
    case "fornecedor": return r.pessoa_nome ?? "Sem Fornecedor/Cliente";
    case "og":         return r.op_codigo ? `${r.op_codigo} — ${r.op_descricao ?? ""}` : (r.op_descricao ?? r.categoria ?? "Sem OG");
    case "moeda":      return MOEDA_LABELS[r.moeda ?? "BRL"] ?? r.moeda ?? "BRL";
    case "fazenda":    return r.fazenda_nome ?? r.fazenda_id ?? "—";
    case "produtor":   return r.produtor_nome ?? "Sem Produtor";
  }
}

function buildTree(rows: LancRow[], niveis: AgrupadorKey[]): NoGrupo[] {
  if (niveis.length === 0) return [];
  const agr = niveis[0];
  const resto = niveis.slice(1);
  const order: string[] = [];
  const map = new Map<string, { label: string; rows: LancRow[] }>();
  rows.forEach(r => {
    const chave = getChave(r, agr);
    const label = getLabel(r, agr);
    if (!map.has(chave)) { map.set(chave, { label, rows: [] }); order.push(chave); }
    map.get(chave)!.rows.push(r);
  });
  return order.map(chave => {
    const { label, rows: gr } = map.get(chave)!;
    return {
      chave, label,
      total: gr.reduce((s, r) => s + (r.tipo === "pagar" ? -r.valor : r.valor), 0),
      filhos: resto.length > 0 ? buildTree(gr, resto) : [],
      rows:   resto.length === 0 ? gr : [],
    };
  });
}

// ─── rendering de árvore ─────────────────────────────────────────────────────
const BG_NIVEL = ["#111111", "#1B3A5C", "#2D5482", "#3A6696", "#4A789E"];
const INDENT_PX = 18;

function renderTree(nos: NoGrupo[], nivel: number): React.ReactNode[] {
  const result: React.ReactNode[] = [];
  const bg = BG_NIVEL[Math.min(nivel, BG_NIVEL.length - 1)];
  const indent = 12 + nivel * INDENT_PX;

  nos.forEach((no, gi) => {
    const nRows = countRows(no);
    result.push(
      <tr key={`gh-${nivel}-${gi}`} style={{ background: bg }}>
        <td colSpan={7} style={{ padding: `7px 12px`, paddingLeft: indent, fontSize: nivel === 0 ? 12 : 11, fontWeight: 700, color: "#fff" }}>
          {no.label}
          <span style={{ float: "right", fontWeight: 400, fontSize: 11, opacity: 0.85 }}>
            {fmtBRL(no.total)}
            {nRows > 0 && ` · ${nRows} lançamento${nRows !== 1 ? "s" : ""}`}
          </span>
        </td>
      </tr>
    );

    if (no.filhos.length > 0) result.push(...renderTree(no.filhos, nivel + 1));

    no.rows.forEach((r, ri) => result.push(
      <tr key={`lr-${r.id}`} style={{ background: ri % 2 === 0 ? "#fff" : "#FAFBFD", borderBottom: "0.5px solid #F0F3FA" }}>
        <td style={{ padding: "7px 12px", paddingLeft: indent + INDENT_PX, color: "var(--text-2)", whiteSpace: "nowrap", fontSize: 12 }}>{fmtDate(r.data_vencimento)}</td>
        <td style={{ padding: "7px 12px", maxWidth: 240, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: 12 }}>{r.descricao}</td>
        <td style={{ padding: "7px 12px", color: "var(--text-2)", whiteSpace: "nowrap", fontSize: 12 }}>{r.pessoa_nome ?? "—"}</td>
        <td style={{ padding: "7px 12px", textAlign: "center", color: "var(--text-3)", whiteSpace: "nowrap", fontSize: 12 }}>
          {r.num_parcela ? `${r.num_parcela}/${r.total_parcelas}` : "—"}
        </td>
        <td style={{ padding: "7px 12px", textAlign: "right", fontWeight: 600, whiteSpace: "nowrap", fontSize: 12, color: r.tipo === "pagar" ? "#DC2626" : "#16A34A" }}>
          {r.tipo === "pagar" ? "−" : "+"}{fmtBRL(r.valor)}
        </td>
        <td style={{ padding: "7px 12px", textAlign: "center" }}>
          <span style={{ fontSize: 11, background: (STATUS_COR[r.status] ?? "#888") + "20", color: STATUS_COR[r.status] ?? "#888", borderRadius: 5, padding: "2px 8px", fontWeight: 600, whiteSpace: "nowrap" }}>
            {STATUS_LABELS[r.status] ?? r.status}
          </span>
        </td>
        <td style={{ padding: "7px 12px", textAlign: "center", color: "var(--text-3)", whiteSpace: "nowrap", fontSize: 12 }}>
          {r.data_baixa ? fmtDate(r.data_baixa) : "—"}
        </td>
      </tr>
    ));

    // subtotal só se tiver filhos ou mais de 1 linha
    if (no.filhos.length > 0 || no.rows.length > 1) {
      result.push(
        <tr key={`st-${nivel}-${gi}`} style={{ background: bg + "30", borderTop: "1px solid " + bg + "60" }}>
          <td colSpan={4} style={{ padding: "5px 12px", paddingLeft: indent, fontSize: 11, fontWeight: 700, color: "#555", textAlign: "right" }}>
            Subtotal {no.label}
          </td>
          <td colSpan={3} style={{ padding: "5px 12px", fontSize: 12, fontWeight: 800, textAlign: "right", color: no.total >= 0 ? "#16A34A" : "#DC2626" }}>
            {fmtBRL(no.total)}
          </td>
        </tr>
      );
    }
  });
  return result;
}

function countRows(no: NoGrupo): number {
  return no.rows.length + no.filhos.reduce((s, f) => s + countRows(f), 0);
}

// ─── componente principal ─────────────────────────────────────────────────────
function RelFinClassInner() {
  const { fazendaId, fazendaIds, nomeFazendaSelecionada, contaId } = useAuth();

  // ── filtros ──
  const [inicio, setInicio]   = useState(mesInicio());
  const [fim, setFim]         = useState(hoje());

  const [tipoSel,   setTipoSel]   = useState<Set<"pagar" | "receber">>(new Set(["pagar", "receber"]));
  const [statusSel, setStatusSel] = useState<Set<string>>(new Set(Object.keys(STATUS_LABELS)));
  const [classifSel, setClassifSel] = useState<Set<string> | null>(null);

  // ── agrupadores ──
  const [agrupadores, setAgrupadores] = useState<AgrupadorKey[]>(["og"]);
  const [agrDropOpen, setAgrDropOpen] = useState(false);

  // ── dropdowns open ──
  const [tipoOpen,   setTipoOpen]   = useState(false);
  const [statusOpen, setStatusOpen] = useState(false);
  const [classifOpen, setClassifOpen] = useState(false);
  const [classifBusca, setClassifBusca] = useState("");

  // ── refs (click outside) ──
  const tipoRef    = useRef<HTMLDivElement>(null);
  const statusRef  = useRef<HTMLDivElement>(null);
  const classifRef = useRef<HTMLDivElement>(null);
  const agrRef     = useRef<HTMLDivElement>(null);

  // ── dados ──
  const [ops, setOps]           = useState<OperacaoGerencial[]>([]);
  const [classifOpts, setClassifOpts] = useState<ClassifOpt[]>([]);
  const [fazendaMap, setFazendaMap]   = useState<Map<string, string>>(new Map());
  const [produtorMap, setProdutorMap] = useState<Map<string, string>>(new Map());
  const [rows, setRows]         = useState<LancRow[]>([]);
  const [gerado, setGerado]     = useState(false);
  const [loading, setLoading]   = useState(false);

  // ── efeitos ──
  useEffect(() => {
    if (!fazendaId) return;
    listarOperacoesGerenciais(fazendaId).then(setOps).catch(() => {});
  }, [fazendaId]);

  useEffect(() => {
    if (!fazendaIds?.length) return;
    supabase.from("fazendas").select("id, nome").in("id", fazendaIds)
      .then(({ data }) => {
        const m = new Map<string, string>();
        (data ?? []).forEach((f: { id: string; nome: string }) => m.set(f.id, f.nome));
        setFazendaMap(m);
      });
  }, [fazendaIds?.join(",")]);

  useEffect(() => {
    if (!contaId) return;
    supabase.from("produtores").select("id, nome").eq("conta_id", contaId)
      .then(({ data }) => {
        const m = new Map<string, string>();
        (data ?? []).forEach((p: { id: string; nome: string }) => m.set(p.id, p.nome));
        setProdutorMap(m);
      });
  }, [contaId]);

  // classificações usadas nos lançamentos
  useEffect(() => {
    if (!fazendaId || ops.length === 0) return;
    supabase.from("lancamentos")
      .select("categoria, operacao_gerencial_id")
      .in("fazenda_id", fazendaIds)
      .then(({ data }) => {
        const map = new Map<string, ClassifOpt>();
        (data ?? []).forEach((l: { categoria?: string; operacao_gerencial_id?: string }) => {
          const op = ops.find(o => o.id === l.operacao_gerencial_id);
          const chave = l.operacao_gerencial_id ?? l.categoria ?? "Sem Classificação";
          const label = op?.descricao ?? l.categoria ?? "Sem Classificação";
          const codigo = op?.classificacao ?? undefined;
          map.set(chave, { chave, label, codigo });
        });
        const sorted = [...map.values()].sort((a, b) =>
          a.codigo && b.codigo ? a.codigo.localeCompare(b.codigo) : a.label.localeCompare(b.label)
        );
        setClassifOpts(sorted);
      });
  }, [fazendaId, ops]);

  // fechar dropdowns ao clicar fora
  useEffect(() => {
    function h(e: MouseEvent) {
      if (tipoRef.current   && !tipoRef.current.contains(e.target as Node))    setTipoOpen(false);
      if (statusRef.current && !statusRef.current.contains(e.target as Node))  setStatusOpen(false);
      if (classifRef.current && !classifRef.current.contains(e.target as Node)) setClassifOpen(false);
      if (agrRef.current    && !agrRef.current.contains(e.target as Node))     setAgrDropOpen(false);
    }
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  // ── agrupadores ──────────────────────────────────────────────────────────
  function addAgr(key: AgrupadorKey) { setAgrupadores(p => [...p, key]); }
  function removeAgr(key: AgrupadorKey) { setAgrupadores(p => p.filter(a => a !== key)); }
  function moveAgr(idx: number, dir: -1 | 1) {
    setAgrupadores(p => {
      const a = [...p]; const j = idx + dir;
      if (j < 0 || j >= a.length) return a;
      [a[idx], a[j]] = [a[j], a[idx]];
      return a;
    });
  }
  const agrDisponiveis = AGRUPADORES_DISP.filter(a => !agrupadores.includes(a.key));

  // ── Tipo ─────────────────────────────────────────────────────────────────
  function toggleTipo(v: "pagar" | "receber") {
    setTipoSel(p => { const n = new Set(p); n.has(v) ? n.delete(v) : n.add(v); return n; });
  }
  const tipoLabel = tipoSel.size === 2 ? "Todos" : tipoSel.size === 0 ? "Nenhum" :
    tipoSel.has("pagar") ? "Contas a Pagar" : "Contas a Receber";

  // ── Status ───────────────────────────────────────────────────────────────
  function toggleStatus(s: string) {
    setStatusSel(p => { const n = new Set(p); n.has(s) ? n.delete(s) : n.add(s); return n; });
  }
  const statusCount = statusSel.size;
  const statusLabel = statusCount === Object.keys(STATUS_LABELS).length ? "Todos" :
    statusCount === 0 ? "Nenhum" : `${statusCount} selecionado${statusCount !== 1 ? "s" : ""}`;

  // ── Classificação / OG ───────────────────────────────────────────────────
  const optsVisiveis = classifOpts.filter(o =>
    classifBusca === "" ||
    o.label.toLowerCase().includes(classifBusca.toLowerCase()) ||
    (o.codigo ?? "").includes(classifBusca)
  );
  const totalOpts = classifOpts.length;
  const ogSelCount = classifSel === null ? totalOpts : classifSel.size;
  const ogLabel = classifSel === null || ogSelCount === totalOpts
    ? `Todas (${totalOpts})`
    : ogSelCount === 0 ? "Nenhuma" : `${ogSelCount} de ${totalOpts}`;

  function toggleClassif(chave: string) {
    if (classifSel === null) {
      setClassifSel(new Set(classifOpts.map(o => o.chave).filter(x => x !== chave)));
    } else {
      const n = new Set(classifSel);
      n.has(chave) ? n.delete(chave) : n.add(chave);
      setClassifSel(n);
    }
  }
  function isOgChecked(chave: string) { return classifSel === null || classifSel.has(chave); }

  // ── arvore (useMemo) ─────────────────────────────────────────────────────
  const arvore = useMemo(() => {
    if (!gerado || rows.length === 0 || agrupadores.length === 0) return [];
    return buildTree(rows, agrupadores);
  }, [rows, agrupadores, gerado]);

  // quando não há agrupadores, lista flat
  const rowsFlat = useMemo(() => {
    if (!gerado || agrupadores.length > 0) return [];
    return rows;
  }, [rows, agrupadores, gerado]);

  // ── totais ────────────────────────────────────────────────────────────────
  const totalEntradas = rows.filter(r => r.tipo === "receber").reduce((s, r) => s + r.valor, 0);
  const totalSaidas   = rows.filter(r => r.tipo === "pagar").reduce((s, r) => s + r.valor, 0);
  const saldo         = totalEntradas - totalSaidas;
  const totalLinhas   = rows.length;

  // ── gerar ─────────────────────────────────────────────────────────────────
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

      const tipos = [...tipoSel];
      if (tipos.length === 1) q = q.eq("tipo", tipos[0]);
      if (statusSel.size > 0 && statusSel.size < Object.keys(STATUS_LABELS).length)
        q = q.in("status", [...statusSel]);

      const { data, error } = await q;
      if (error) throw error;

      type Raw = LancRow & { pessoas?: { nome: string } | null };
      const loaded: LancRow[] = (data ?? []).map((l: Raw) => {
        const op = ops.find(o => o.id === l.operacao_gerencial_id);
        return {
          ...l,
          pessoa_nome:   l.pessoas?.nome ?? undefined,
          op_descricao:  op?.descricao,
          op_codigo:     op?.classificacao ?? undefined,
          fazenda_nome:  fazendaMap.get(l.fazenda_id ?? "") ?? l.fazenda_id ?? undefined,
          produtor_nome: produtorMap.get(l.produtor_id ?? "") ?? undefined,
        };
      });

      // filtro de OG
      const filtered = classifSel === null ? loaded :
        classifSel.size === 0 ? [] :
        loaded.filter(r => {
          const chave = r.operacao_gerencial_id ?? r.categoria ?? "__sem__";
          return classifSel.has(chave);
        });

      setRows(filtered);
      setGerado(true);
    } finally {
      setLoading(false);
    }
  }

  // ── PDF ───────────────────────────────────────────────────────────────────
  function gerarPDF() {
    const periodoLabel = `${fmtDate(inicio)} a ${fmtDate(fim)}`;
    const tipoLabelPdf = tipoLabel;
    const statusLabelPdf = [...statusSel].map(s => STATUS_LABELS[s]).join(", ") || "Todos";
    const agrsLabel = agrupadores.map(a => AGRUPADORES_DISP.find(d => d.key === a)?.label).join(" → ") || "Sem agrupamento";

    function renderPdfTree(nos: NoGrupo[], nivel: number): string {
      const bg = ["#111111", "#1B3A5C", "#2D5482", "#3A6696"][Math.min(nivel, 3)];
      const indent = 8 + nivel * 14;
      return nos.map(no => {
        const nRows = countRows(no);
        const subRows = no.rows.map(r => `
          <tr style="border-bottom:0.5px solid #F0F3FA">
            <td style="padding:3px ${indent + 12}px 3px ${indent + 12}px;font-size:9px;white-space:nowrap">${fmtDate(r.data_vencimento)}</td>
            <td style="padding:3px 6px;font-size:9px;max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${r.descricao}</td>
            <td style="padding:3px 6px;font-size:9px;white-space:nowrap">${r.pessoa_nome ?? "—"}</td>
            <td style="padding:3px 6px;font-size:9px;text-align:center;white-space:nowrap">${r.num_parcela ? `${r.num_parcela}/${r.total_parcelas}` : "—"}</td>
            <td style="padding:3px 6px;font-size:9px;text-align:right;font-weight:600;color:${r.tipo === "pagar" ? "#DC2626" : "#16A34A"};white-space:nowrap">${r.tipo === "pagar" ? "−" : "+"}${fmtBRL(r.valor)}</td>
            <td style="padding:3px 6px;text-align:center"><span style="font-size:8px;background:${(STATUS_COR[r.status] ?? "#888")}20;color:${STATUS_COR[r.status] ?? "#888"};border-radius:3px;padding:1px 4px;font-weight:600">${STATUS_LABELS[r.status] ?? r.status}</span></td>
            <td style="padding:3px 6px;font-size:9px;text-align:center;color:#888;white-space:nowrap">${r.data_baixa ? fmtDate(r.data_baixa) : "—"}</td>
          </tr>`).join("");
        const subtotalRow = (no.filhos.length > 0 || no.rows.length > 1) ? `
          <tr style="background:#f5f5f5;border-top:1px solid ${bg}40">
            <td colspan="4" style="padding:3px 6px;font-size:9px;font-weight:700;color:#555;text-align:right;padding-left:${indent}px">Subtotal ${no.label}</td>
            <td colspan="3" style="padding:3px 6px;font-size:9px;font-weight:800;color:${no.total >= 0 ? "#16A34A" : "#DC2626"};text-align:right">${fmtBRL(no.total)}</td>
          </tr>` : "";
        return `
          <tr style="background:${bg}">
            <td colspan="7" style="padding:5px 8px;padding-left:${indent}px;font-size:${nivel === 0 ? 10 : 9}px;font-weight:700;color:#fff">
              ${no.label}
              <span style="float:right;font-weight:400;font-size:9px;opacity:.85">${fmtBRL(no.total)} · ${nRows} lçto${nRows !== 1 ? "s" : ""}</span>
            </td>
          </tr>
          ${renderPdfTree(no.filhos, nivel + 1)}
          ${subRows}
          ${subtotalRow}`;
      }).join("");
    }

    const bodyHtml = agrupadores.length > 0 ? renderPdfTree(arvore, 0) :
      rowsFlat.map(r => `
        <tr style="border-bottom:0.5px solid #F0F3FA">
          <td style="padding:3px 8px;font-size:9px;white-space:nowrap">${fmtDate(r.data_vencimento)}</td>
          <td style="padding:3px 6px;font-size:9px;max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${r.descricao}</td>
          <td style="padding:3px 6px;font-size:9px;white-space:nowrap">${r.pessoa_nome ?? "—"}</td>
          <td style="padding:3px 6px;font-size:9px;text-align:center;white-space:nowrap">${r.num_parcela ? `${r.num_parcela}/${r.total_parcelas}` : "—"}</td>
          <td style="padding:3px 6px;font-size:9px;text-align:right;font-weight:600;color:${r.tipo === "pagar" ? "#DC2626" : "#16A34A"};white-space:nowrap">${r.tipo === "pagar" ? "−" : "+"}${fmtBRL(r.valor)}</td>
          <td style="padding:3px 6px;text-align:center"><span style="font-size:8px;background:${(STATUS_COR[r.status] ?? "#888")}20;color:${STATUS_COR[r.status] ?? "#888"};border-radius:3px;padding:1px 4px;font-weight:600">${STATUS_LABELS[r.status] ?? r.status}</span></td>
          <td style="padding:3px 6px;font-size:9px;text-align:center;color:#888;white-space:nowrap">${r.data_baixa ? fmtDate(r.data_baixa) : "—"}</td>
        </tr>`).join("");

    const html = `
      <p style="font-size:10px;color:#555;margin-bottom:4px">
        Período: <strong>${periodoLabel}</strong> · Tipo: <strong>${tipoLabelPdf}</strong> · Status: <strong>${statusLabelPdf}</strong>
      </p>
      <p style="font-size:10px;color:#555;margin-bottom:12px">
        Agrupamento: <strong>${agrsLabel}</strong> · ${totalLinhas} lançamentos
      </p>
      <div class="auto-fit-table">
      <table style="border-collapse:collapse;font-family:system-ui,sans-serif;width:100%">
        <thead>
          <tr style="background:#f0f0f0">
            <th style="padding:5px 8px;font-size:9px;font-weight:700;color:#555;border-bottom:1.5px solid #111;text-align:left;white-space:nowrap">Vcto</th>
            <th style="padding:5px 8px;font-size:9px;font-weight:700;color:#555;border-bottom:1.5px solid #111;text-align:left;white-space:nowrap">Descrição</th>
            <th style="padding:5px 8px;font-size:9px;font-weight:700;color:#555;border-bottom:1.5px solid #111;text-align:left;white-space:nowrap">Fornecedor/Cliente</th>
            <th style="padding:5px 8px;font-size:9px;font-weight:700;color:#555;border-bottom:1.5px solid #111;text-align:center;white-space:nowrap">Parcela</th>
            <th style="padding:5px 8px;font-size:9px;font-weight:700;color:#555;border-bottom:1.5px solid #111;text-align:right;white-space:nowrap">Valor</th>
            <th style="padding:5px 8px;font-size:9px;font-weight:700;color:#555;border-bottom:1.5px solid #111;text-align:center;white-space:nowrap">Status</th>
            <th style="padding:5px 8px;font-size:9px;font-weight:700;color:#555;border-bottom:1.5px solid #111;text-align:center;white-space:nowrap">Baixa</th>
          </tr>
        </thead>
        <tbody>
          ${bodyHtml}
          <tr style="background:#111111;border-top:2px solid #0D0D0D">
            <td colspan="4" style="padding:6px 10px;font-size:10px;font-weight:700;color:#fff;text-align:right">TOTAL GERAL</td>
            <td colspan="3" style="padding:6px 10px;font-size:11px;font-weight:800;color:${saldo >= 0 ? "#86EFAC" : "#FCA5A5"};text-align:right">${fmtBRL(saldo)}</td>
          </tr>
        </tbody>
      </table>
      </div>`;

    abrirPreviewImpressao("Financeiro por Classificação", html, {
      orientation: "landscape",
      fazenda: nomeFazendaSelecionada ?? "",
      subtitulo: `${periodoLabel} · ${tipoLabelPdf}`,
    });
  }

  // ── Excel ─────────────────────────────────────────────────────────────────
  async function exportarExcel() {
    const XLSX = await import("xlsx");
    const ws_data: (string | number)[][] = [];
    const agrsLabel = agrupadores.map(a => AGRUPADORES_DISP.find(d => d.key === a)?.label).join(" → ") || "Sem agrupamento";

    ws_data.push([`Financeiro por Classificação — ${nomeFazendaSelecionada ?? ""}`]);
    ws_data.push([`Período: ${fmtDate(inicio)} a ${fmtDate(fim)} | Tipo: ${tipoLabel} | Agrupamento: ${agrsLabel}`]);
    ws_data.push([`Gerado em: ${new Date().toLocaleString("pt-BR")}`]);
    ws_data.push([]);
    ws_data.push(["Vcto", "Descrição", "Fornecedor/Cliente", "Parcela", "Tipo", "Valor (R$)", "Status", "Data Baixa"]);

    function addXlsxTree(nos: NoGrupo[], nivel: number) {
      const prefix = "  ".repeat(nivel);
      nos.forEach(no => {
        ws_data.push([`${prefix}▸ ${no.label}`, "", "", "", "", no.total, "", ""]);
        addXlsxTree(no.filhos, nivel + 1);
        no.rows.forEach(r => {
          ws_data.push([
            fmtDate(r.data_vencimento), r.descricao, r.pessoa_nome ?? "",
            r.num_parcela ? `${r.num_parcela}/${r.total_parcelas}` : "",
            r.tipo === "pagar" ? "Pagar" : "Receber",
            r.tipo === "pagar" ? -r.valor : r.valor,
            STATUS_LABELS[r.status] ?? r.status,
            r.data_baixa ? fmtDate(r.data_baixa) : "",
          ]);
        });
        if (no.filhos.length > 0 || no.rows.length > 1) {
          ws_data.push([`${prefix}Subtotal ${no.label}`, "", "", "", "", no.total, "", ""]);
        }
        ws_data.push([]);
      });
    }

    if (agrupadores.length > 0) addXlsxTree(arvore, 0);
    else rowsFlat.forEach(r => ws_data.push([fmtDate(r.data_vencimento), r.descricao, r.pessoa_nome ?? "", r.num_parcela ? `${r.num_parcela}/${r.total_parcelas}` : "", r.tipo === "pagar" ? "Pagar" : "Receber", r.tipo === "pagar" ? -r.valor : r.valor, STATUS_LABELS[r.status] ?? r.status, r.data_baixa ? fmtDate(r.data_baixa) : ""]));

    ws_data.push([]); ws_data.push([]);
    ws_data.push(["", "", "", "", "TOTAL ENTRADAS", totalEntradas, "", ""]);
    ws_data.push(["", "", "", "", "TOTAL SAÍDAS", -totalSaidas, "", ""]);
    ws_data.push(["", "", "", "", "SALDO", saldo, "", ""]);

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(ws_data);
    ws["!cols"] = [{ wch: 12 }, { wch: 40 }, { wch: 30 }, { wch: 10 }, { wch: 12 }, { wch: 16 }, { wch: 12 }, { wch: 12 }];
    const range = XLSX.utils.decode_range(ws["!ref"] ?? "A1");
    for (let R = range.s.r; R <= range.e.r; R++) {
      const cell = ws[XLSX.utils.encode_cell({ r: R, c: 5 })];
      if (cell && typeof cell.v === "number") cell.z = "#,##0.00";
    }
    XLSX.utils.book_append_sheet(wb, ws, "Lançamentos");
    XLSX.writeFile(wb, `fin-classif_${(nomeFazendaSelecionada ?? "").replace(/\s+/g, "_")}_${inicio}_${fim}.xlsx`);
  }

  // ── estilos ───────────────────────────────────────────────────────────────
  const lbl: React.CSSProperties = { fontSize: 11, color: "var(--text-2)", marginBottom: 5, display: "block", fontWeight: 600 };
  const inp: React.CSSProperties = { padding: "7px 10px", border: "0.5px solid var(--border-table)", borderRadius: 8, fontSize: 13, color: "var(--text-1)", background: "var(--bg-input)", outline: "none", width: "100%" };
  const dropTrigger: React.CSSProperties = { width: "100%", padding: "7px 10px", border: "0.5px solid var(--border-table)", borderRadius: 8, fontSize: 13, background: "var(--bg-input)", color: "var(--text-1)", cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center", outline: "none" };
  const dropPanel: React.CSSProperties = { position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0, zIndex: 300, background: "var(--bg-card)", border: "0.5px solid var(--border)", borderRadius: 10, boxShadow: "0 8px 24px rgba(0,0,0,.14)" };
  const dropItem: React.CSSProperties = { display: "flex", alignItems: "center", gap: 10, padding: "7px 14px", cursor: "pointer", borderBottom: "0.5px solid var(--border-table)" };
  const ckbStyle: React.CSSProperties = { flexShrink: 0, cursor: "pointer", accentColor: "#1A4870" };

  const Trigger = ({ open, label, count, total }: { open: boolean; label: string; count: number; total: number }) => (
    <>
      <span>
        {label}
        {count < total && count > 0 && <span style={{ marginLeft: 8, color: "#C9921B", fontWeight: 700, fontSize: 11 }}>({count}/{total})</span>}
      </span>
      <span style={{ fontSize: 10, color: "var(--text-3)" }}>{open ? "▲" : "▼"}</span>
    </>
  );

  // ── JSX ───────────────────────────────────────────────────────────────────
  return (
    <div style={{ minHeight: "100vh", background: "var(--bg-page)" }}>
      <TopNav />
      <div style={{ maxWidth: 1400, margin: "0 auto", padding: "28px 24px" }}>

        {/* Cabeçalho */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24 }}>
          <div>
            <h1 style={{ fontSize: 20, fontWeight: 700, color: "var(--text-1)", margin: 0 }}>Financeiro por Classificação</h1>
            <p style={{ fontSize: 13, color: "#666", margin: "4px 0 0" }}>Lançamentos agrupados conforme estrutura de agrupadores definida</p>
          </div>
          {gerado && (
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={gerarPDF} style={{ padding: "9px 18px", background: "#111111", color: "#fff", border: "none", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>PDF / Imprimir</button>
              <button onClick={exportarExcel} style={{ padding: "9px 18px", background: "#16A34A", color: "#fff", border: "none", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>Exportar Excel</button>
            </div>
          )}
        </div>

        {/* Filtros */}
        <div style={{ background: "var(--bg-card)", borderRadius: 12, border: "0.5px solid var(--border)", padding: 20, marginBottom: 20 }}>

          {/* Linha 1: Período + Tipo + Status + OG */}
          <div style={{ display: "grid", gridTemplateColumns: "140px 140px 1fr 1fr 1fr", gap: 14, marginBottom: 16 }}>

            {/* Data Início */}
            <div>
              <label style={lbl}>Data Início (Vcto)</label>
              <input type="date" value={inicio} onChange={e => setInicio(e.target.value)} style={inp} />
            </div>

            {/* Data Fim */}
            <div>
              <label style={lbl}>Data Fim (Vcto)</label>
              <input type="date" value={fim} onChange={e => setFim(e.target.value)} style={inp} />
            </div>

            {/* Tipo — dropdown */}
            <div>
              <label style={lbl}>Tipo</label>
              <div ref={tipoRef} style={{ position: "relative" }}>
                <button onClick={() => setTipoOpen(v => !v)} style={dropTrigger}>
                  <Trigger open={tipoOpen} label={tipoLabel} count={tipoSel.size} total={2} />
                </button>
                {tipoOpen && (
                  <div style={dropPanel}>
                    <div style={{ padding: "4px 0" }}>
                      {(["pagar", "receber"] as const).map(t => (
                        <label key={t} style={dropItem}>
                          <input type="checkbox" checked={tipoSel.has(t)} onChange={() => toggleTipo(t)} style={ckbStyle} />
                          <span style={{ fontSize: 13, color: "var(--text-1)" }}>
                            {t === "pagar" ? "Contas a Pagar" : "Contas a Receber"}
                          </span>
                        </label>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Status — dropdown */}
            <div>
              <label style={lbl}>Status</label>
              <div ref={statusRef} style={{ position: "relative" }}>
                <button onClick={() => setStatusOpen(v => !v)} style={dropTrigger}>
                  <Trigger open={statusOpen} label={statusLabel} count={statusCount} total={Object.keys(STATUS_LABELS).length} />
                </button>
                {statusOpen && (
                  <div style={dropPanel}>
                    <div style={{ padding: "6px 12px", borderBottom: "0.5px solid var(--border)", display: "flex", gap: 12 }}>
                      <button onClick={() => setStatusSel(new Set(Object.keys(STATUS_LABELS)))} style={{ fontSize: 11, color: "#1A4870", background: "none", border: "none", cursor: "pointer", fontWeight: 600, padding: 0 }}>Todos</button>
                      <button onClick={() => setStatusSel(new Set())} style={{ fontSize: 11, color: "var(--text-3)", background: "none", border: "none", cursor: "pointer", padding: 0 }}>Nenhum</button>
                    </div>
                    <div style={{ padding: "4px 0" }}>
                      {Object.entries(STATUS_LABELS).map(([s, l]) => (
                        <label key={s} style={dropItem}>
                          <input type="checkbox" checked={statusSel.has(s)} onChange={() => toggleStatus(s)} style={ckbStyle} />
                          <span style={{ fontSize: 13, color: STATUS_COR[s], fontWeight: 600 }}>{l}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* OG — dropdown */}
            <div>
              <label style={lbl}>Operações Gerenciais</label>
              <div ref={classifRef} style={{ position: "relative" }}>
                <button onClick={() => setClassifOpen(v => !v)} style={dropTrigger}>
                  <Trigger open={classifOpen} label={ogLabel} count={ogSelCount} total={totalOpts} />
                </button>
                {classifOpen && (
                  <div style={{ ...dropPanel, minWidth: 340 }}>
                    <div style={{ padding: "10px 12px", borderBottom: "0.5px solid var(--border)" }}>
                      <input type="text" placeholder="Buscar OG..." value={classifBusca} onChange={e => setClassifBusca(e.target.value)} style={{ ...inp, padding: "6px 10px" }} autoFocus />
                    </div>
                    <div style={{ padding: "6px 12px", borderBottom: "0.5px solid var(--border)", display: "flex", gap: 12 }}>
                      <button onClick={() => { setClassifSel(null); setClassifBusca(""); }} style={{ fontSize: 11, color: "#1A4870", background: "none", border: "none", cursor: "pointer", fontWeight: 600, padding: 0 }}>Todas</button>
                      <button onClick={() => setClassifSel(new Set())} style={{ fontSize: 11, color: "var(--text-3)", background: "none", border: "none", cursor: "pointer", padding: 0 }}>Nenhuma</button>
                    </div>
                    <div style={{ maxHeight: 260, overflowY: "auto" }}>
                      {optsVisiveis.length === 0
                        ? <div style={{ padding: "12px 14px", fontSize: 12, color: "var(--text-3)", textAlign: "center" }}>Nenhuma OG encontrada</div>
                        : optsVisiveis.map(o => (
                          <label key={o.chave} style={dropItem}>
                            <input type="checkbox" checked={isOgChecked(o.chave)} onChange={() => toggleClassif(o.chave)} style={ckbStyle} />
                            <div>
                              {o.codigo && <div style={{ fontSize: 10, color: "var(--text-3)", fontFamily: "monospace" }}>{o.codigo}</div>}
                              <div style={{ fontSize: 12, color: "var(--text-1)", fontWeight: 500 }}>{o.label}</div>
                            </div>
                          </label>
                        ))}
                    </div>
                    <div style={{ padding: "8px 12px", borderTop: "0.5px solid var(--border)", textAlign: "right" }}>
                      <button onClick={() => setClassifOpen(false)} style={{ padding: "5px 14px", background: "#1A4870", color: "#fff", border: "none", borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: "pointer" }}>Confirmar</button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Agrupadores */}
          <div style={{ marginBottom: 16 }}>
            <label style={lbl}>Agrupadores do relatório</label>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>

              {agrupadores.map((agr, idx) => {
                const info = AGRUPADORES_DISP.find(a => a.key === agr);
                return (
                  <div key={agr} style={{ display: "flex", alignItems: "center", gap: 3, background: "#1A4870", borderRadius: 8, padding: "5px 8px" }}>
                    <span style={{ fontSize: 11, color: "rgba(255,255,255,.5)", marginRight: 2, fontWeight: 700 }}>{idx + 1}</span>
                    <span style={{ fontSize: 12, color: "#fff", fontWeight: 600, marginRight: 2 }}>{info?.label}</span>
                    <button onClick={() => moveAgr(idx, -1)} disabled={idx === 0}
                      style={{ background: "none", border: "none", color: idx === 0 ? "rgba(255,255,255,.25)" : "#fff", cursor: idx === 0 ? "default" : "pointer", fontSize: 11, padding: "0 2px", lineHeight: 1 }}>↑</button>
                    <button onClick={() => moveAgr(idx, 1)} disabled={idx === agrupadores.length - 1}
                      style={{ background: "none", border: "none", color: idx === agrupadores.length - 1 ? "rgba(255,255,255,.25)" : "#fff", cursor: idx === agrupadores.length - 1 ? "default" : "pointer", fontSize: 11, padding: "0 2px", lineHeight: 1 }}>↓</button>
                    <button onClick={() => removeAgr(agr)}
                      style={{ background: "none", border: "none", color: "rgba(255,255,255,.7)", cursor: "pointer", fontSize: 14, padding: "0 2px", lineHeight: 1, marginLeft: 2 }}>×</button>
                  </div>
                );
              })}

              {agrDisponiveis.length > 0 && (
                <div ref={agrRef} style={{ position: "relative" }}>
                  <button onClick={() => setAgrDropOpen(v => !v)}
                    style={{ padding: "5px 12px", background: "var(--bg-card)", border: "0.5px solid var(--border)", borderRadius: 8, fontSize: 12, color: "var(--text-2)", cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}>
                    + Adicionar {agrDropOpen ? "▲" : "▼"}
                  </button>
                  {agrDropOpen && (
                    <div style={{ ...dropPanel, minWidth: 180, right: "auto" }}>
                      {agrDisponiveis.map(a => (
                        <button key={a.key} onClick={() => { addAgr(a.key); setAgrDropOpen(false); }}
                          style={{ display: "block", width: "100%", padding: "8px 14px", background: "none", border: "none", borderBottom: "0.5px solid var(--border-table)", textAlign: "left", fontSize: 13, color: "var(--text-1)", cursor: "pointer" }}>
                          {a.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {agrupadores.length > 0 && (
                <button onClick={() => setAgrupadores([])}
                  style={{ fontSize: 11, color: "var(--text-3)", background: "none", border: "none", cursor: "pointer", padding: "4px 6px" }}>
                  Limpar tudo
                </button>
              )}

              {agrupadores.length === 0 && (
                <span style={{ fontSize: 12, color: "var(--text-3)", fontStyle: "italic" }}>
                  Nenhum agrupador — lançamentos exibidos em lista simples
                </span>
              )}
            </div>
          </div>

          {/* Gerar */}
          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <button onClick={gerar} disabled={loading}
              style={{ padding: "10px 28px", background: "#C9921B", color: "#fff", border: "none", borderRadius: 8, fontSize: 14, fontWeight: 700, cursor: "pointer" }}>
              {loading ? "Gerando..." : "Gerar Relatório"}
            </button>
          </div>
        </div>

        {/* Resultados */}
        {gerado && (
          <>
            {/* KPI */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16, marginBottom: 20 }}>
              {[
                { label: "Entradas", val: totalEntradas, cor: "#16A34A" },
                { label: "Saídas",   val: totalSaidas,   cor: "#DC2626" },
                { label: "Saldo",    val: saldo,          cor: saldo >= 0 ? "#16A34A" : "#DC2626" },
                { label: "Lançamentos", val: totalLinhas, cor: "#111111", isNum: true },
              ].map(k => (
                <div key={k.label} style={{ background: "var(--bg-card)", borderRadius: 10, border: "0.5px solid var(--border)", padding: "14px 18px" }}>
                  <p style={{ margin: 0, fontSize: 11, color: "var(--text-3)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>{k.label}</p>
                  <p style={{ margin: "6px 0 0", fontSize: 18, fontWeight: 700, color: k.cor }}>
                    {k.isNum ? totalLinhas : fmtBRL(k.val as number)}
                  </p>
                </div>
              ))}
            </div>

            {/* Tabela */}
            {rows.length === 0 ? (
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
                          <th key={h} style={{ padding: "10px 12px", textAlign: h === "Valor" ? "right" : ["Parcela", "Status", "Baixa"].includes(h) ? "center" : "left", fontSize: 11, fontWeight: 700, color: "var(--text-2)", borderBottom: "1.5px solid var(--border)", whiteSpace: "nowrap" }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {agrupadores.length > 0
                        ? renderTree(arvore, 0)
                        : rowsFlat.map((r, i) => (
                          <tr key={r.id} style={{ background: i % 2 === 0 ? "#fff" : "#FAFBFD", borderBottom: "0.5px solid #F0F3FA" }}>
                            <td style={{ padding: "7px 12px", color: "var(--text-2)", whiteSpace: "nowrap", fontSize: 12 }}>{fmtDate(r.data_vencimento)}</td>
                            <td style={{ padding: "7px 12px", maxWidth: 240, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: 12 }}>{r.descricao}</td>
                            <td style={{ padding: "7px 12px", color: "var(--text-2)", whiteSpace: "nowrap", fontSize: 12 }}>{r.pessoa_nome ?? "—"}</td>
                            <td style={{ padding: "7px 12px", textAlign: "center", color: "var(--text-3)", whiteSpace: "nowrap", fontSize: 12 }}>
                              {r.num_parcela ? `${r.num_parcela}/${r.total_parcelas}` : "—"}
                            </td>
                            <td style={{ padding: "7px 12px", textAlign: "right", fontWeight: 600, whiteSpace: "nowrap", fontSize: 12, color: r.tipo === "pagar" ? "#DC2626" : "#16A34A" }}>
                              {r.tipo === "pagar" ? "−" : "+"}{fmtBRL(r.valor)}
                            </td>
                            <td style={{ padding: "7px 12px", textAlign: "center" }}>
                              <span style={{ fontSize: 11, background: (STATUS_COR[r.status] ?? "#888") + "20", color: STATUS_COR[r.status] ?? "#888", borderRadius: 5, padding: "2px 8px", fontWeight: 600, whiteSpace: "nowrap" }}>
                                {STATUS_LABELS[r.status] ?? r.status}
                              </span>
                            </td>
                            <td style={{ padding: "7px 12px", textAlign: "center", color: "var(--text-3)", whiteSpace: "nowrap", fontSize: 12 }}>
                              {r.data_baixa ? fmtDate(r.data_baixa) : "—"}
                            </td>
                          </tr>
                        ))
                      }
                      {/* Total geral */}
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
