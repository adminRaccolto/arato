"use client";
import React, { useState, useEffect, Suspense } from "react";
import TopNav from "../../../components/TopNav";
import { abrirPreviewImpressao } from "../../../lib/print";
import { useAuth } from "../../../components/AuthProvider";
import { supabase } from "../../../lib/supabase";
import { listarMaquinas, listarAnosSafra, listarCiclos } from "../../../lib/db";
import type { Maquina, AnoSafra, Ciclo } from "../../../lib/supabase";

// ─── helpers ─────────────────────────────────────────────────────────────────
const fmtBRL  = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2 });
const fmtDate = (s?: string) =>
  s ? new Date(s + "T12:00:00").toLocaleDateString("pt-BR") : "—";
const hoje      = () => new Date().toISOString().slice(0, 10);
const anoAtras  = () => { const d = new Date(); d.setFullYear(d.getFullYear() - 1); return d.toISOString().slice(0, 10); };

const TIPO_MANUT_LABEL: Record<string, string> = {
  preventiva: "Preventiva", corretiva: "Corretiva",
  revisao: "Revisão", outro: "Outro",
};
const TIPO_MANUT_COR: Record<string, string> = {
  preventiva: "#16A34A", corretiva: "#E24B4A",
  revisao: "#378ADD",    outro: "#888",
};
const TIPO_MAQUINA_LABEL: Record<string, string> = {
  trator: "Trator", colheitadeira: "Colheitadeira", pulverizador: "Pulverizador",
  plantadeira: "Plantadeira", caminhao: "Caminhão", carro: "Carro / Utilitário",
  implemento: "Implemento", outro: "Outro",
};

interface ManutRow {
  id: string;
  maquina_id: string;
  maquina_nome: string;
  maquina_tipo: string;
  data: string;
  tipo: string;
  descricao: string;
  custo?: number;
}

interface GrupoMaq {
  maquina_id: string;
  maquina_nome: string;
  maquina_tipo: string;
  rows: ManutRow[];
  total_custo: number;
}

// ─── componente ──────────────────────────────────────────────────────────────
function RelManutInner() {
  const { fazendaId, nomeFazendaSelecionada } = useAuth();

  const [modoFiltro, setModoFiltro] = useState<"data" | "safra">("data");
  const [inicio, setInicio]         = useState(anoAtras());
  const [fim, setFim]               = useState(hoje());
  const [anoSafraId, setAnoSafraId] = useState("");
  const [cicloId, setCicloId]       = useState("");
  const [tiposMaqSel, setTiposMaqSel] = useState<Set<string>>(new Set(Object.keys(TIPO_MAQUINA_LABEL)));
  const [tiposManutSel, setTiposManutSel] = useState<Set<string>>(new Set(Object.keys(TIPO_MANUT_LABEL)));
  const [maquinasSel, setMaquinasSel] = useState<Set<string>>(new Set());

  const [maquinas, setMaquinas]     = useState<Maquina[]>([]);
  const [anosSafra, setAnosSafra]   = useState<AnoSafra[]>([]);
  const [ciclos, setCiclos]         = useState<Ciclo[]>([]);
  const [grupos, setGrupos]         = useState<GrupoMaq[]>([]);
  const [gerado, setGerado]         = useState(false);
  const [loading, setLoading]       = useState(false);

  useEffect(() => {
    if (!fazendaId) return;
    listarMaquinas(fazendaId).then(m => {
      setMaquinas(m);
      setMaquinasSel(new Set(m.map(x => x.id)));
    }).catch(() => {});
    listarAnosSafra(fazendaId).then(setAnosSafra).catch(() => {});
  }, [fazendaId]);

  useEffect(() => {
    if (anoSafraId) listarCiclos(anoSafraId).then(setCiclos).catch(() => {});
    else setCiclos([]);
    setCicloId("");
  }, [anoSafraId]);

  function toggleSet(_set: Set<string>, key: string, setter: React.Dispatch<React.SetStateAction<Set<string>>>) {
    setter((prev: Set<string>) => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n; });
  }

  // ── datas do período de safra ─────────────────────────────────────────────
  function periodoSafra(): { de: string; ate: string } {
    if (cicloId) {
      const c = ciclos.find(x => x.id === cicloId);
      return { de: c?.data_inicio ?? inicio, ate: c?.data_fim ?? fim };
    }
    if (anoSafraId) {
      const a = anosSafra.find(x => x.id === anoSafraId);
      return { de: a?.data_inicio ?? inicio, ate: a?.data_fim ?? fim };
    }
    return { de: inicio, ate: fim };
  }

  // ── gerar ─────────────────────────────────────────────────────────────────
  async function gerar() {
    if (!fazendaId) return;
    setLoading(true);
    try {
      const { de, ate } = modoFiltro === "safra" ? periodoSafra() : { de: inicio, ate: fim };

      // Busca todas as manutenções do período
      const { data, error } = await supabase
        .from("historico_manutencao")
        .select("*")
        .in("maquina_id", [...maquinasSel].length > 0
          ? maquinas.filter(m => maquinasSel.has(m.id) && tiposMaqSel.has(m.tipo)).map(m => m.id)
          : ["_noop_"])
        .gte("data", de)
        .lte("data", ate)
        .order("maquina_id")
        .order("data");

      if (error) throw error;

      const rows: ManutRow[] = (data ?? [])
        .filter((r: { tipo: string }) => tiposManutSel.has(r.tipo))
        .map((r: {
          id: string; maquina_id: string; data: string; tipo: string;
          descricao: string; custo?: number
        }) => {
          const maq = maquinas.find(m => m.id === r.maquina_id);
          return {
            ...r,
            maquina_nome: maq?.nome ?? r.maquina_id,
            maquina_tipo: maq?.tipo ?? "outro",
          };
        });

      // agrupa por máquina
      const mapaGrupos = new Map<string, GrupoMaq>();
      rows.forEach(r => {
        if (!mapaGrupos.has(r.maquina_id)) {
          mapaGrupos.set(r.maquina_id, {
            maquina_id: r.maquina_id, maquina_nome: r.maquina_nome,
            maquina_tipo: r.maquina_tipo, rows: [], total_custo: 0,
          });
        }
        const g = mapaGrupos.get(r.maquina_id)!;
        g.rows.push(r);
        g.total_custo += r.custo ?? 0;
      });

      setGrupos([...mapaGrupos.values()].sort((a, b) => a.maquina_nome.localeCompare(b.maquina_nome)));
      setGerado(true);
    } finally {
      setLoading(false);
    }
  }

  // ── totais ────────────────────────────────────────────────────────────────
  const totalManut  = grupos.reduce((s, g) => s + g.rows.length, 0);
  const totalCusto  = grupos.reduce((s, g) => s + g.total_custo, 0);
  const totalMaquinas = grupos.length;

  const { de: periodoInicio, ate: periodoFim } = modoFiltro === "safra" ? periodoSafra() : { de: inicio, ate: fim };

  // ── PDF ───────────────────────────────────────────────────────────────────
  function gerarPDF() {
    const periodoLabel = `${fmtDate(periodoInicio)} a ${fmtDate(periodoFim)}`;

    const gruposHtml = grupos.map(g => {
      const rows = g.rows.map((r, i) => `
        <tr style="background:${i % 2 === 0 ? "#fff" : "#FAFBFD"};border-bottom:0.5px solid #F0F3FA">
          <td style="padding:4px 8px;font-size:9px;white-space:nowrap">${fmtDate(r.data)}</td>
          <td style="padding:4px 8px;text-align:center">
            <span style="font-size:8px;background:${TIPO_MANUT_COR[r.tipo]}20;color:${TIPO_MANUT_COR[r.tipo]};border-radius:4px;padding:1px 5px;font-weight:600;white-space:nowrap">
              ${TIPO_MANUT_LABEL[r.tipo] ?? r.tipo}
            </span>
          </td>
          <td style="padding:4px 8px;font-size:9px">${r.descricao}</td>
          <td style="padding:4px 8px;font-size:9px;text-align:right;font-weight:600;color:${r.custo ? "#DC2626" : "#aaa"};white-space:nowrap">
            ${r.custo ? fmtBRL(r.custo) : "—"}
          </td>
        </tr>`).join("");

      return `
        <tr style="background:#1A4870">
          <td colspan="4" style="padding:6px 10px;font-size:10px;font-weight:700;color:#fff">
            ${g.maquina_nome}
            <span style="opacity:.7;margin-left:8px;font-size:9px">${TIPO_MAQUINA_LABEL[g.maquina_tipo] ?? g.maquina_tipo}</span>
          </td>
        </tr>
        ${rows}
        <tr style="background:#EFF3FA;border-top:1px solid #D5E8F5">
          <td colspan="3" style="padding:4px 10px;font-size:9px;font-weight:700;color:#1A4870;text-align:right">
            Subtotal ${g.maquina_nome} — ${g.rows.length} manutenção${g.rows.length !== 1 ? "ões" : ""}
          </td>
          <td style="padding:4px 10px;font-size:10px;font-weight:700;color:#DC2626;text-align:right">${fmtBRL(g.total_custo)}</td>
        </tr>`;
    }).join("");

    const html = `
      <p style="font-size:10px;color:#555;margin-bottom:12px">
        Período: <strong>${periodoLabel}</strong> · ${totalMaquinas} máquina${totalMaquinas !== 1 ? "s" : ""} · ${totalManut} manutenção${totalManut !== 1 ? "ões" : ""}
      </p>
      <div class="auto-fit-table">
      <table style="border-collapse:collapse;font-family:system-ui,sans-serif;white-space:nowrap">
        <thead>
          <tr style="background:#F4F6FA">
            <th style="padding:5px 8px;font-size:9px;font-weight:700;color:#555;border-bottom:1.5px solid #1A4870;white-space:nowrap">Data</th>
            <th style="padding:5px 8px;font-size:9px;font-weight:700;color:#555;border-bottom:1.5px solid #1A4870;text-align:center;white-space:nowrap">Tipo</th>
            <th style="padding:5px 8px;font-size:9px;font-weight:700;color:#555;border-bottom:1.5px solid #1A4870;white-space:nowrap">Serviço / Descrição</th>
            <th style="padding:5px 8px;font-size:9px;font-weight:700;color:#555;border-bottom:1.5px solid #1A4870;text-align:right;white-space:nowrap">Custo (R$)</th>
          </tr>
        </thead>
        <tbody>
          ${gruposHtml}
          <tr style="background:#1A4870">
            <td colspan="3" style="padding:6px 10px;font-size:10px;font-weight:700;color:#fff;text-align:right">CUSTO TOTAL</td>
            <td style="padding:6px 10px;font-size:12px;font-weight:800;color:#FCA5A5;text-align:right">${fmtBRL(totalCusto)}</td>
          </tr>
        </tbody>
      </table>
      </div>`;

    abrirPreviewImpressao("Manutenção de Veículos e Máquinas", html, {
      orientation: "landscape",
      fazenda: nomeFazendaSelecionada ?? "",
      subtitulo: periodoLabel,
    });
  }

  // ── Excel ─────────────────────────────────────────────────────────────────
  async function exportarExcel() {
    const XLSX = await import("xlsx");
    const wb = XLSX.utils.book_new();

    // ── Aba Detalhado ──
    const det: (string | number)[][] = [];
    det.push([`Manutenção de Veículos e Máquinas — ${nomeFazendaSelecionada ?? ""}`]);
    det.push([`Período: ${fmtDate(periodoInicio)} a ${fmtDate(periodoFim)}`]);
    det.push([`Gerado em: ${new Date().toLocaleString("pt-BR")}`]);
    det.push([]);
    det.push(["Máquina / Veículo", "Tipo Equip.", "Data", "Tipo Manutenção", "Serviço / Descrição", "Custo (R$)"]);

    grupos.forEach(g => {
      det.push([g.maquina_nome, TIPO_MAQUINA_LABEL[g.maquina_tipo] ?? g.maquina_tipo, "", "", "", ""]);
      g.rows.forEach(r => {
        det.push([
          "", "",
          fmtDate(r.data),
          TIPO_MANUT_LABEL[r.tipo] ?? r.tipo,
          r.descricao,
          r.custo ?? 0,
        ]);
      });
      det.push(["", "", "", "", `Subtotal ${g.maquina_nome}`, g.total_custo]);
      det.push([]);
    });
    det.push(["", "", "", "", "CUSTO TOTAL", totalCusto]);

    const wsDet = XLSX.utils.aoa_to_sheet(det);
    wsDet["!cols"] = [{ wch: 30 }, { wch: 16 }, { wch: 12 }, { wch: 14 }, { wch: 50 }, { wch: 16 }];
    const ranDet = XLSX.utils.decode_range(wsDet["!ref"] ?? "A1");
    for (let R = ranDet.s.r; R <= ranDet.e.r; R++) {
      const cell = wsDet[XLSX.utils.encode_cell({ r: R, c: 5 })];
      if (cell && typeof cell.v === "number") cell.z = "#,##0.00";
    }
    XLSX.utils.book_append_sheet(wb, wsDet, "Detalhado");

    // ── Aba Resumo por Máquina ──
    const res: (string | number)[][] = [
      ["Máquina / Veículo", "Tipo", "Preventivas", "Corretivas", "Revisões", "Outras", "Total Manut.", "Custo Total (R$)"],
    ];
    grupos.forEach(g => {
      const count = (t: string) => g.rows.filter(r => r.tipo === t).length;
      res.push([
        g.maquina_nome,
        TIPO_MAQUINA_LABEL[g.maquina_tipo] ?? g.maquina_tipo,
        count("preventiva"), count("corretiva"), count("revisao"), count("outro"),
        g.rows.length, g.total_custo,
      ]);
    });
    res.push([]);
    res.push(["TOTAL", "", "", "", "", "", totalManut, totalCusto]);

    const wsRes = XLSX.utils.aoa_to_sheet(res);
    wsRes["!cols"] = [{ wch: 30 }, { wch: 16 }, { wch: 13 }, { wch: 13 }, { wch: 12 }, { wch: 10 }, { wch: 13 }, { wch: 18 }];
    const ranRes = XLSX.utils.decode_range(wsRes["!ref"] ?? "A1");
    for (let R = ranRes.s.r; R <= ranRes.e.r; R++) {
      const cell = wsRes[XLSX.utils.encode_cell({ r: R, c: 7 })];
      if (cell && typeof cell.v === "number") cell.z = "#,##0.00";
    }
    XLSX.utils.book_append_sheet(wb, wsRes, "Resumo por Máquina");

    const nomeArquivo = `manutencao_${(nomeFazendaSelecionada ?? "fazenda").replace(/\s+/g, "_")}_${periodoInicio}_${periodoFim}.xlsx`;
    XLSX.writeFile(wb, nomeArquivo);
  }

  // ── estilos ───────────────────────────────────────────────────────────────
  const inp: React.CSSProperties = {
    padding: "7px 10px", border: "0.5px solid #D4DCE8", borderRadius: 8,
    fontSize: 13, color: "#1a1a1a", background: "#fff", outline: "none",
  };
  const lbl: React.CSSProperties = { fontSize: 11, color: "#555", marginBottom: 4, display: "block" };
  const btn = (active: boolean, cor = "#1A4870"): React.CSSProperties => ({
    padding: "5px 12px", borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: "pointer",
    border: `0.5px solid ${active ? cor : "#D4DCE8"}`,
    background: active ? cor + "15" : "#fff",
    color: active ? cor : "#888",
  });

  return (
    <div style={{ minHeight: "100vh", background: "#F4F6FA" }}>
      <TopNav />
      <div style={{ maxWidth: 1400, margin: "0 auto", padding: "28px 24px" }}>

        {/* Cabeçalho */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24 }}>
          <div>
            <h1 style={{ fontSize: 20, fontWeight: 700, color: "#1a1a1a", margin: 0 }}>Manutenção de Veículos e Máquinas</h1>
            <p style={{ fontSize: 13, color: "#666", margin: "4px 0 0" }}>Histórico de manutenções agrupado por equipamento</p>
          </div>
          {gerado && (
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={gerarPDF} style={{ padding: "9px 18px", background: "#1A4870", color: "#fff", border: "none", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
                PDF / Imprimir
              </button>
              <button onClick={exportarExcel} style={{ padding: "9px 18px", background: "#16A34A", color: "#fff", border: "none", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
                Exportar Excel
              </button>
            </div>
          )}
        </div>

        {/* Filtros */}
        <div style={{ background: "#fff", borderRadius: 12, border: "0.5px solid #DDE2EE", padding: 20, marginBottom: 20 }}>
          {/* Modo de filtro */}
          <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
            {(["data", "safra"] as const).map(m => (
              <button key={m} onClick={() => setModoFiltro(m)}
                style={{ ...btn(modoFiltro === m), padding: "7px 18px" }}>
                {m === "data" ? "Intervalo de Datas" : "Por Safra / Ciclo"}
              </button>
            ))}
          </div>

          {modoFiltro === "data" ? (
            <div style={{ display: "grid", gridTemplateColumns: "160px 160px", gap: 16, marginBottom: 20 }}>
              <div>
                <label style={lbl}>Data Início</label>
                <input type="date" value={inicio} onChange={e => setInicio(e.target.value)} style={inp} />
              </div>
              <div>
                <label style={lbl}>Data Fim</label>
                <input type="date" value={fim} onChange={e => setFim(e.target.value)} style={inp} />
              </div>
            </div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "200px 200px", gap: 16, marginBottom: 20 }}>
              <div>
                <label style={lbl}>Ano Safra</label>
                <select value={anoSafraId} onChange={e => setAnoSafraId(e.target.value)} style={{ ...inp, width: "100%" }}>
                  <option value="">Selecione o ano safra</option>
                  {anosSafra.map(a => <option key={a.id} value={a.id}>{a.descricao}</option>)}
                </select>
              </div>
              <div>
                <label style={lbl}>Ciclo (opcional)</label>
                <select value={cicloId} onChange={e => setCicloId(e.target.value)} style={{ ...inp, width: "100%" }} disabled={!anoSafraId}>
                  <option value="">Safra inteira</option>
                  {ciclos.map(c => <option key={c.id} value={c.id}>{c.descricao ?? c.cultura}</option>)}
                </select>
              </div>
            </div>
          )}

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 20, marginBottom: 20 }}>
            {/* Tipo de Equipamento */}
            <div>
              <label style={lbl}>Tipo de Equipamento</label>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {Object.entries(TIPO_MAQUINA_LABEL).map(([k, v]) => (
                  <button key={k} onClick={() => toggleSet(tiposMaqSel, k, setTiposMaqSel)}
                    style={btn(tiposMaqSel.has(k))}>
                    {v}
                  </button>
                ))}
              </div>
            </div>
            {/* Tipo de Manutenção */}
            <div>
              <label style={lbl}>Tipo de Manutenção</label>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {Object.entries(TIPO_MANUT_LABEL).map(([k, v]) => (
                  <button key={k} onClick={() => toggleSet(tiposManutSel, k, setTiposManutSel)}
                    style={btn(tiposManutSel.has(k), TIPO_MANUT_COR[k])}>
                    {v}
                  </button>
                ))}
              </div>
            </div>
            {/* Equipamentos */}
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
                <label style={{ ...lbl, margin: 0 }}>Equipamentos</label>
                <button onClick={() => setMaquinasSel(new Set(maquinas.map(m => m.id)))}
                  style={{ fontSize: 11, color: "#1A4870", background: "none", border: "none", cursor: "pointer", textDecoration: "underline" }}>Todos</button>
                <button onClick={() => setMaquinasSel(new Set())}
                  style={{ fontSize: 11, color: "#888", background: "none", border: "none", cursor: "pointer", textDecoration: "underline" }}>Nenhum</button>
              </div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", maxHeight: 100, overflowY: "auto" }}>
                {maquinas.filter(m => tiposMaqSel.has(m.tipo)).map(m => (
                  <button key={m.id} onClick={() => toggleSet(maquinasSel, m.id, setMaquinasSel)}
                    style={btn(maquinasSel.has(m.id))}>
                    {m.nome}
                  </button>
                ))}
              </div>
            </div>
          </div>

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
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16, marginBottom: 20 }}>
              {[
                { label: "Equipamentos", val: totalMaquinas, cor: "#1A4870", fmt: false },
                { label: "Manutenções",  val: totalManut,    cor: "#555",    fmt: false },
                { label: "Custo Total",  val: totalCusto,    cor: "#DC2626", fmt: true },
              ].map(k => (
                <div key={k.label} style={{ background: "#fff", borderRadius: 10, border: "0.5px solid #DDE2EE", padding: "14px 18px" }}>
                  <p style={{ margin: 0, fontSize: 11, color: "#888", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>{k.label}</p>
                  <p style={{ margin: "6px 0 0", fontSize: 18, fontWeight: 700, color: k.cor }}>
                    {k.fmt ? fmtBRL(k.val) : k.val}
                  </p>
                </div>
              ))}
            </div>

            {/* Tabela */}
            {grupos.length === 0 ? (
              <div style={{ background: "#fff", borderRadius: 12, border: "0.5px solid #DDE2EE", padding: 40, textAlign: "center", color: "#888" }}>
                Nenhuma manutenção encontrada no período selecionado.
              </div>
            ) : (
              <div style={{ background: "#fff", borderRadius: 12, border: "0.5px solid #DDE2EE", overflow: "hidden" }}>
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                    <thead>
                      <tr style={{ background: "#F4F6FA" }}>
                        {["Data", "Tipo", "Serviço / Descrição", "Custo"].map(h => (
                          <th key={h} style={{
                            padding: "10px 12px", fontSize: 11, fontWeight: 700, color: "#555",
                            borderBottom: "1.5px solid #DDE2EE", whiteSpace: "nowrap",
                            textAlign: h === "Custo" ? "right" : h === "Tipo" ? "center" : "left",
                          }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {grupos.map(g => (
                        <React.Fragment key={g.maquina_id}>
                          <tr style={{ background: "#1A4870" }}>
                            <td colSpan={4} style={{ padding: "8px 12px", fontSize: 13, fontWeight: 700, color: "#fff" }}>
                              {g.maquina_nome}
                              <span style={{ marginLeft: 10, fontSize: 11, opacity: 0.7 }}>
                                {TIPO_MAQUINA_LABEL[g.maquina_tipo] ?? g.maquina_tipo}
                              </span>
                              <span style={{ float: "right", fontSize: 11, opacity: 0.8 }}>
                                {g.rows.length} manutenção{g.rows.length !== 1 ? "ões" : ""}
                              </span>
                            </td>
                          </tr>
                          {g.rows.map((r, i) => (
                            <tr key={r.id} style={{ background: i % 2 === 0 ? "#fff" : "#FAFBFD", borderBottom: "0.5px solid #F0F3FA" }}>
                              <td style={{ padding: "8px 12px", color: "#555", whiteSpace: "nowrap" }}>{fmtDate(r.data)}</td>
                              <td style={{ padding: "8px 12px", textAlign: "center" }}>
                                <span style={{
                                  fontSize: 11, background: TIPO_MANUT_COR[r.tipo] + "20",
                                  color: TIPO_MANUT_COR[r.tipo], borderRadius: 5,
                                  padding: "2px 8px", fontWeight: 600, whiteSpace: "nowrap",
                                }}>
                                  {TIPO_MANUT_LABEL[r.tipo] ?? r.tipo}
                                </span>
                              </td>
                              <td style={{ padding: "8px 12px" }}>{r.descricao}</td>
                              <td style={{ padding: "8px 12px", textAlign: "right", fontWeight: 600, whiteSpace: "nowrap", color: r.custo ? "#DC2626" : "#aaa" }}>
                                {r.custo ? fmtBRL(r.custo) : "—"}
                              </td>
                            </tr>
                          ))}
                          <tr style={{ background: "#EFF3FA", borderTop: "1px solid #D5E8F5" }}>
                            <td colSpan={3} style={{ padding: "6px 12px", fontSize: 12, fontWeight: 700, color: "#1A4870", textAlign: "right" }}>
                              Subtotal — {g.maquina_nome}
                            </td>
                            <td style={{ padding: "6px 12px", fontSize: 13, fontWeight: 800, textAlign: "right", color: "#DC2626" }}>
                              {fmtBRL(g.total_custo)}
                            </td>
                          </tr>
                        </React.Fragment>
                      ))}
                      <tr style={{ background: "#1A4870" }}>
                        <td colSpan={3} style={{ padding: "10px 12px", fontSize: 13, fontWeight: 700, color: "#fff", textAlign: "right" }}>CUSTO TOTAL</td>
                        <td style={{ padding: "10px 12px", fontSize: 15, fontWeight: 800, textAlign: "right", color: "#FCA5A5" }}>
                          {fmtBRL(totalCusto)}
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

export default function RelManutencaoPage() {
  return (
    <Suspense fallback={<div style={{ padding: 40, textAlign: "center", color: "#888" }}>Carregando...</div>}>
      <RelManutInner />
    </Suspense>
  );
}
