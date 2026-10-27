"use client";
// NFs canceladas pelo emitente: se o cancelamento foi antes ou depois da entrada no Arato e se o emitente emitiu uma NF
// substituta (sem substituta, cobrar o fornecedor por uma nota válida). NF-e vem dos eventos de cancelamento do SIEG no
// período; NFS-e, do aviso que a sincronização deixa na nota. A consulta não altera nada; as pendentes podem ser
// marcadas como Canceladas com um clique (as processadas nunca: têm CP e estoque, o caminho é estornar).
import { useEffect, useState } from "react";
import TopNav from "../../../components/TopNav";
import { useAuth } from "../../../components/AuthProvider";
import { useClienteRelatorio } from "../../../components/useClienteRelatorio";
import { OperationalButton, OperationalHeading } from "../../../components/OperationalUI";
import { confirmarAcao } from "../../../components/ConfirmarAcao";
import InputData from "../../../components/InputData";
import { supabase } from "../../../lib/supabase";
import { abrirPreviewImpressao, nomeRelatorio } from "../../../lib/print";
import { hojeLocal } from "../../../lib/data-local";

type Linha = {
  id: string;
  tipo: "NF-e" | "NFS-e";
  fazenda_id: string;
  numero: string;
  serie: string;
  chave: string;
  emitente: string;
  emitente_cnpj: string;
  emissao: string;
  cancelada_em: string;
  valor: number;
  status: string;
  tem_financeiro: boolean;
  processada_em: string | null;
  momento: "antes" | "depois" | null;
  substituta: { numero: string; emissao: string; valor: number; status: string } | null;
};
type Resultado = { linhas: Linha[]; eventos_sieg: number; ja_canceladas: number; fora_do_arato: number; avisos: string[] };

const fmtData = (iso?: string | null) => { if (!iso) return "—"; const [y, m, d] = iso.slice(0, 10).split("-"); return `${d}/${m}/${y}`; };
const fmtBRL = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const diasAtras = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10);

const GRUPOS = [
  { id: "processada", titulo: "Canceladas já processadas", sub: "Têm estoque e/ou título no CP — estorne a nota", cor: "#E24B4A", fundo: "#FCEBEB" },
  { id: "pendente", titulo: "Canceladas ainda pendentes", sub: "Sem estoque nem CP — não processe", cor: "#EF9F27", fundo: "#FEF5E7" },
  { id: "cancelada", titulo: "Já canceladas no Arato", sub: "Status certo — confira só a NF substituta", cor: "#378ADD", fundo: "#D5E8F5" },
] as const;
const grupoDe = (l: Linha) => l.status === "processada" ? "processada" : l.status === "cancelada" ? "cancelada" : "pendente";
const textoMomento = (l: Linha) => l.momento === "antes" ? "Antes da entrada" : l.momento === "depois" ? "Depois da entrada" : "—";
const textoSubstituta = (l: Linha) => l.substituta
  ? `Nº ${l.substituta.numero} · ${fmtData(l.substituta.emissao)} · ${fmtBRL(l.substituta.valor)}`
  : "Sem substituta — cobrar fornecedor";

export default function RelatorioNfsCanceladas() {
  const { fazendaId, fazendaIds } = useAuth();
  const cliente = useClienteRelatorio();
  const [de, setDe] = useState(diasAtras(90));
  const [ate, setAte] = useState(hojeLocal());
  const [res, setRes] = useState<Resultado | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState("");
  const [marcando, setMarcando] = useState(false);
  const [aviso, setAviso] = useState("");
  const [soSemSubstituta, setSoSemSubstituta] = useState(false);
  const [nomeFaz, setNomeFaz] = useState<Map<string, string>>(new Map());
  const idsKey = fazendaIds.join(",");

  useEffect(() => {
    if (!fazendaIds.length) return;
    supabase.from("fazendas").select("id, nome").in("id", fazendaIds)
      .then(({ data }) => setNomeFaz(new Map((data ?? []).map(f => [f.id as string, f.nome as string]))));
  }, [idsKey]); // eslint-disable-line react-hooks/exhaustive-deps

  async function gerar() {
    if (!fazendaId) return;
    setCarregando(true); setErro(""); setAviso("");
    try {
      const r = await fetch("/api/fiscal/nfs-canceladas", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fazenda_id: fazendaId, data_inicio: de, data_fim: ate }),
      });
      let d: Resultado & { erro?: string; error?: string };
      try { d = await r.json(); } catch { throw new Error(r.ok ? "A consulta ao SIEG demorou demais. Tente um período menor." : `Falha do servidor (HTTP ${r.status}).`); }
      if (!r.ok || d.erro || d.error) throw new Error(d.erro ?? d.error ?? `HTTP ${r.status}`);
      d.linhas.sort((a, b) => (b.cancelada_em || b.emissao).localeCompare(a.cancelada_em || a.emissao));
      setRes(d);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro ao gerar");
    } finally {
      setCarregando(false);
    }
  }

  async function marcarPendentes() {
    const ids = (res?.linhas ?? []).filter(l => l.tipo === "NF-e" && grupoDe(l) === "pendente").map(l => l.id);
    if (!ids.length || !fazendaId) return;
    if (!(await confirmarAcao({ titulo: "Marcar como canceladas?", mensagem: `${ids.length} NF-e pendente(s) cancelada(s) pelo emitente na SEFAZ passam a Cancelada no Arato. Nenhuma tem estoque ou título no CP.`, perigo: false }))) return;
    setMarcando(true); setErro(""); setAviso("");
    try {
      const r = await fetch("/api/fiscal/nfs-canceladas", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fazenda_id: fazendaId, marcar_ids: ids }),
      });
      const d = await r.json() as { marcadas?: number; erro?: string; error?: string };
      if (!r.ok || d.erro || d.error) throw new Error(d.erro ?? d.error ?? `HTTP ${r.status}`);
      const feitas = new Set(ids);
      // continuam no relatório, no grupo das já canceladas (a NF substituta segue valendo para cobrar o fornecedor)
      setRes(prev => prev ? { ...prev, linhas: prev.linhas.map(l => l.tipo === "NF-e" && feitas.has(l.id) && grupoDe(l) === "pendente" ? { ...l, status: "cancelada" } : l), ja_canceladas: prev.ja_canceladas + (d.marcadas ?? 0) } : prev);
      setAviso(`✓ ${d.marcadas ?? 0} nota(s) marcada(s) como Cancelada.`);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro ao marcar");
    } finally {
      setMarcando(false);
    }
  }

  const linhas = (res?.linhas ?? []).filter(l => !soSemSubstituta || !l.substituta);
  const doGrupo = (g: string) => linhas.filter(l => grupoDe(l) === g);
  const total = (ls: Linha[]) => ls.reduce((s, l) => s + l.valor, 0);
  const fazendaNome = (id: string) => nomeFaz.get(id) ?? "";
  const semSubstituta = (res?.linhas ?? []).filter(l => !l.substituta);

  function pdf() {
    const blocos = GRUPOS.map(g => {
      const ls = doGrupo(g.id);
      const corpo = ls.length ? ls.map((l, i) => `<tr style="background:${i % 2 ? "#F7F9FC" : "#fff"}">
        <td>${l.tipo}</td><td>${esc(l.numero)}</td><td>${fmtData(l.emissao)}</td><td>${fmtData(l.cancelada_em)}</td><td>${fmtData(l.processada_em)}</td>
        <td>${textoMomento(l)}</td><td>${esc(l.emitente)}</td><td style="text-align:right">${fmtBRL(l.valor)}</td>
        <td style="color:${l.substituta ? "#1a1a1a" : "#E24B4A"}">${esc(textoSubstituta(l))}</td></tr>`).join("")
        : `<tr><td colspan="9" style="color:#888">Nenhuma nota.</td></tr>`;
      return `<h3 style="font-size:12px;color:${g.cor};margin:14px 0 4px">${g.titulo} (${ls.length}) — ${g.sub}</h3>
        <table style="width:100%;border-collapse:collapse;font-size:8.5px;table-layout:fixed">
          <thead><tr style="background:#1A4870;color:#fff;text-align:left"><th style="width:5%">Tipo</th><th style="width:7%">Nº</th><th style="width:7%">Emissão</th><th style="width:8%">Cancelada em</th>
          <th style="width:8%">Processada em</th><th style="width:9%">Cancelou</th><th style="width:22%">Emitente</th><th style="width:9%;text-align:right">Valor</th><th style="width:25%">NF substituta</th></tr></thead>
          <tbody>${corpo}</tbody>
          <tfoot><tr style="font-weight:700;border-top:1px solid #1A4870"><td colspan="7">${ls.length} nota(s)</td><td style="text-align:right">${fmtBRL(total(ls))}</td><td></td></tr></tfoot>
        </table>`;
    }).join("");
    const html = `<div style="font-size:10px;color:#555;margin-bottom:6px">Cancelamentos registrados no SIEG de ${fmtData(de)} a ${fmtData(ate)}${soSemSubstituta ? " · só notas sem NF substituta" : ""}</div>${blocos}
      <style>td,th{padding:3px 4px;word-wrap:break-word;vertical-align:top}</style>`;
    abrirPreviewImpressao("NFs Canceladas pelo Emitente", html, { orientation: "landscape", fazenda: cliente ?? undefined, nomeArquivo: nomeRelatorio("NFS CANCELADAS", cliente, de, ate) });
  }

  async function excel() {
    const XLSX = await import("xlsx");
    const resumo = [["Relatório", "NFs canceladas pelo emitente"], ["Cliente", cliente ?? ""], ["Cancelamentos no SIEG", `${fmtData(de)} a ${fmtData(ate)}`],
      ...GRUPOS.map(g => [g.titulo, doGrupo(g.id).length, total(doGrupo(g.id))]),
      ["Sem NF substituta (cobrar fornecedor)", semSubstituta.length, total(semSubstituta)],
      ["Canceladas que não estão no Arato", res?.fora_do_arato ?? 0]];
    const dados = linhas.map(l => ({
      "Situação": GRUPOS.find(g => g.id === grupoDe(l))!.titulo, "Tipo": l.tipo, "Número": l.numero, "Série": l.serie, "Emissão": fmtData(l.emissao),
      "Cancelada em": fmtData(l.cancelada_em), "Processada em": fmtData(l.processada_em), "Cancelou": textoMomento(l),
      "Emitente": l.emitente, "CNPJ/CPF": l.emitente_cnpj, "Fazenda": fazendaNome(l.fazenda_id), "Título no financeiro": l.tem_financeiro ? "Sim" : "Não",
      "Valor": l.valor, "NF substituta": l.substituta?.numero ?? "", "Emissão substituta": l.substituta ? fmtData(l.substituta.emissao) : "",
      "Valor substituta": l.substituta?.valor ?? "", "Cobrar fornecedor": l.substituta ? "Não" : "Sim", "Chave": l.chave,
    }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(resumo), "Resumo");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(dados), "Canceladas");
    XLSX.writeFile(wb, `${nomeRelatorio("NFS CANCELADAS", cliente, de, ate)}.xlsx`);
  }

  const lbl: React.CSSProperties = { display: "block", fontSize: 11, color: "#555", marginBottom: 4, fontWeight: 600 };
  const inp: React.CSSProperties = { width: "100%", boxSizing: "border-box", padding: "7px 10px", border: "0.5px solid #DDE2EE", borderRadius: 8, fontSize: 13 };
  const th: React.CSSProperties = { padding: "7px 10px", textAlign: "left", fontSize: 11, fontWeight: 700, color: "#555", borderBottom: "0.5px solid #DDE2EE", whiteSpace: "nowrap", background: "#F4F6FA" };
  const td: React.CSSProperties = { padding: "6px 10px", fontSize: 12, borderBottom: "0.5px solid #EEF1F6", verticalAlign: "top" };
  const COLUNAS = ["Tipo", "Nº", "Emissão", "Cancelada em", "Processada em", "Cancelou", "Emitente", "Fazenda", "Título no CP", "Valor", "NF substituta"];

  return (
    <div style={{ minHeight: "100vh", background: "#F4F6FA" }}>
      <TopNav />
      <main style={{ padding: "16px 24px", maxWidth: 1600, margin: "0 auto" }}>
        <OperationalHeading data-arato-page-heading="true">
          <div>
            <h1 data-arato-h1="true" style={{ margin: 0, fontSize: 20, fontWeight: 700, color: "#111111" }}>NFs Canceladas pelo Emitente</h1>
            <div style={{ fontSize: 12, color: "#666", marginTop: 2 }}>Quando o emitente cancelou (antes ou depois da entrada no Arato) e se emitiu NF substituta. Sem substituta, cobre do fornecedor uma nota válida.</div>
          </div>
        </OperationalHeading>

        <div style={{ background: "#fff", border: "0.5px solid #DDE2EE", borderRadius: 12, padding: 14, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 220px))", gap: 12, alignItems: "end", marginTop: 12 }}>
          <div><label style={lbl}>Cancelamento de</label><InputData type="date" value={de} onChange={e => setDe(e.target.value)} style={inp} /></div>
          <div><label style={lbl}>Até</label><InputData type="date" value={ate} onChange={e => setAte(e.target.value)} style={inp} /></div>
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, paddingBottom: 8, cursor: "pointer" }}>
            <input type="checkbox" checked={soSemSubstituta} onChange={e => setSoSemSubstituta(e.target.checked)} style={{ accentColor: "#1A4870" }} />
            Só sem NF substituta
          </label>
          <div>
            <OperationalButton data-arato-button="primary" onClick={gerar} disabled={carregando || !fazendaId}
              style={{ padding: "8px 16px", background: "#1A4870", color: "#fff", border: "none", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
              {carregando ? "Consultando o SIEG..." : res ? "Atualizar" : "Gerar"}
            </OperationalButton>
          </div>
        </div>

        {erro && <div style={{ marginTop: 12, padding: 10, background: "#FCEBEB", color: "#791F1F", borderRadius: 8, fontSize: 13 }}>{erro}</div>}

        {res && (
          <>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 16, alignItems: "center", margin: "14px 0 6px", fontSize: 13 }}>
              <span><strong>{res.eventos_sieg}</strong> cancelamento(s) de NF-e no SIEG</span>
              <span style={{ color: semSubstituta.length ? "#E24B4A" : "#555", fontWeight: semSubstituta.length ? 600 : 400 }}>
                {semSubstituta.length} sem NF substituta ({fmtBRL(total(semSubstituta))})
              </span>
              <span style={{ color: "#555" }}>{res.fora_do_arato} não estão no Arato</span>
              <span style={{ flex: 1 }} />
              <OperationalButton data-arato-button="secondary" onClick={pdf} disabled={!linhas.length}
                style={{ padding: "7px 14px", border: "0.5px solid #DDE2EE", borderRadius: 8, background: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>Imprimir / PDF</OperationalButton>
              <OperationalButton data-arato-button="secondary" onClick={excel} disabled={!linhas.length}
                style={{ padding: "7px 14px", border: "0.5px solid #DDE2EE", borderRadius: 8, background: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>⬇ Excel</OperationalButton>
            </div>
            {aviso && <div style={{ marginBottom: 6, padding: 8, background: "#D5E8F5", color: "#0B2D50", borderRadius: 8, fontSize: 12 }}>{aviso}</div>}
            {res.avisos.map(a => <div key={a} style={{ marginBottom: 6, padding: 8, background: "#FEF5E7", color: "#7A4A06", borderRadius: 8, fontSize: 12 }}>{a}</div>)}

            {GRUPOS.map(g => {
              const ls = doGrupo(g.id);
              return (
                <section key={g.id} style={{ marginTop: 14 }}>
                  <div style={{ display: "flex", alignItems: "baseline", flexWrap: "wrap", gap: 10, marginBottom: 6 }}>
                    <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 6, background: g.fundo, color: g.cor }}>{ls.length}</span>
                    <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: "#1a1a1a" }}>{g.titulo}</h2>
                    <span style={{ fontSize: 12, color: "#666" }}>{g.sub}</span>
                    <span style={{ flex: 1 }} />
                    {g.id === "pendente" && ls.some(l => l.tipo === "NF-e") && (
                      <OperationalButton data-arato-button="primary" onClick={marcarPendentes} disabled={marcando}
                        style={{ padding: "6px 12px", background: "#1A4870", color: "#fff", border: "none", borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
                        {marcando ? "Marcando..." : `Marcar ${ls.filter(l => l.tipo === "NF-e").length} como canceladas`}
                      </OperationalButton>
                    )}
                    <span style={{ fontSize: 13, fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>{fmtBRL(total(ls))}</span>
                  </div>
                  <div style={{ background: "#fff", border: "0.5px solid #DDE2EE", borderLeft: `3px solid ${g.cor}`, borderRadius: 12, overflow: "auto" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 1250 }}>
                      <thead><tr>
                        {COLUNAS.map(h => <th key={h} style={{ ...th, textAlign: h === "Valor" ? "right" : "left" }}>{h}</th>)}
                      </tr></thead>
                      <tbody>
                        {ls.length === 0 && <tr><td colSpan={COLUNAS.length} style={{ ...td, textAlign: "center", color: "#888", padding: 18 }}>Nenhuma nota nesta situação.</td></tr>}
                        {ls.map(l => (
                          <tr key={`${l.tipo}:${l.id}`}>
                            <td style={td}><span style={{ fontSize: 10, fontWeight: 700, padding: "2px 6px", borderRadius: 6, background: l.tipo === "NF-e" ? "#D5E8F5" : "#FBF3E0", color: l.tipo === "NF-e" ? "#0B2D50" : "#7A5A10" }}>{l.tipo}</span></td>
                            <td style={td}>{l.numero}</td>
                            <td style={{ ...td, whiteSpace: "nowrap" }}>{fmtData(l.emissao)}</td>
                            <td style={{ ...td, whiteSpace: "nowrap" }}>{fmtData(l.cancelada_em)}</td>
                            <td style={{ ...td, whiteSpace: "nowrap" }}>{fmtData(l.processada_em)}</td>
                            <td style={{ ...td, whiteSpace: "nowrap" }}>
                              {l.momento
                                ? <span title={l.momento === "antes" ? "A nota já estava cancelada na SEFAZ quando foi processada no Arato" : "O emitente cancelou depois que a nota foi processada no Arato"}
                                    style={{ fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 6, background: l.momento === "antes" ? "#FCEBEB" : "#FEF5E7", color: l.momento === "antes" ? "#791F1F" : "#7A4A06" }}>{textoMomento(l)}</span>
                                : <span style={{ color: "#888" }}>—</span>}
                            </td>
                            <td style={td}>{l.emitente}<div style={{ fontSize: 11, color: "#666" }}>{l.emitente_cnpj}</div></td>
                            <td style={td}>{fazendaNome(l.fazenda_id)}</td>
                            <td style={td}>{l.tem_financeiro ? <span style={{ color: "#E24B4A", fontWeight: 600 }}>Sim</span> : "Não"}</td>
                            <td style={{ ...td, textAlign: "right", whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>{fmtBRL(l.valor)}</td>
                            <td style={td}>
                              {l.substituta
                                ? <>Nº {l.substituta.numero}<div style={{ fontSize: 11, color: "#666", whiteSpace: "nowrap" }}>{fmtData(l.substituta.emissao)} · {fmtBRL(l.substituta.valor)}</div></>
                                : <span style={{ color: "#E24B4A", fontWeight: 600 }}>Sem substituta — cobrar fornecedor</span>}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
              );
            })}
          </>
        )}
      </main>
    </div>
  );
}
