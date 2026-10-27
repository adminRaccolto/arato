"use client";
// NFs canceladas pelo emitente que no Arato não estão como Canceladas: as já processadas (têm estoque/CP — precisam de
// estorno) e as ainda pendentes. NF-e vem dos eventos de cancelamento do SIEG no período; NFS-e processada vem do aviso
// que a sincronização deixa na nota. A consulta não altera nada; as pendentes podem ser marcadas como Canceladas com um
// clique (as processadas nunca: têm CP e estoque, o caminho é estornar).
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
};
type Resultado = { linhas: Linha[]; eventos_sieg: number; ja_canceladas: number; fora_do_arato: number; avisos: string[] };

const fmtData = (iso?: string | null) => { if (!iso) return "—"; const [y, m, d] = iso.slice(0, 10).split("-"); return `${d}/${m}/${y}`; };
const fmtBRL = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const diasAtras = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10);

const GRUPOS = [
  { id: "processada", titulo: "Canceladas já processadas", sub: "Têm estoque e/ou título no CP — estorne a nota", cor: "#E24B4A", fundo: "#FCEBEB" },
  { id: "pendente", titulo: "Canceladas ainda pendentes", sub: "Sem estoque nem CP — não processe", cor: "#EF9F27", fundo: "#FEF5E7" },
] as const;
const grupoDe = (l: Linha) => l.status === "processada" ? "processada" : "pendente";

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
  const [nomeFaz, setNomeFaz] = useState<Map<string, string>>(new Map());
  const idsKey = fazendaIds.join(",");

  useEffect(() => {
    if (!fazendaIds.length) return;
    supabase.from("fazendas").select("id, nome").in("id", fazendaIds)
      .then(({ data }) => setNomeFaz(new Map((data ?? []).map(f => [f.id as string, f.nome as string]))));
  }, [idsKey]); // eslint-disable-line react-hooks/exhaustive-deps

  async function gerar() {
    if (!fazendaId) return;
    setCarregando(true); setErro("");
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
      setRes(prev => prev ? { ...prev, linhas: prev.linhas.filter(l => !(l.tipo === "NF-e" && feitas.has(l.id) && grupoDe(l) === "pendente")), ja_canceladas: prev.ja_canceladas + (d.marcadas ?? 0) } : prev);
      setAviso(`✓ ${d.marcadas ?? 0} nota(s) marcada(s) como Cancelada.`);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro ao marcar");
    } finally {
      setMarcando(false);
    }
  }

  const linhas = res?.linhas ?? [];
  const doGrupo = (g: string) => linhas.filter(l => grupoDe(l) === g);
  const total = (ls: Linha[]) => ls.reduce((s, l) => s + l.valor, 0);
  const fazendaNome = (id: string) => nomeFaz.get(id) ?? "";

  function pdf() {
    const blocos = GRUPOS.map(g => {
      const ls = doGrupo(g.id);
      const corpo = ls.length ? ls.map((l, i) => `<tr style="background:${i % 2 ? "#F7F9FC" : "#fff"}">
        <td>${l.tipo}</td><td>${esc(l.numero)}</td><td>${fmtData(l.emissao)}</td><td>${fmtData(l.cancelada_em)}</td><td>${esc(l.emitente)}</td>
        <td>${esc(fazendaNome(l.fazenda_id))}</td><td>${l.tem_financeiro ? "Sim" : "Não"}</td><td style="text-align:right">${fmtBRL(l.valor)}</td></tr>`).join("")
        : `<tr><td colspan="8" style="color:#888">Nenhuma nota.</td></tr>`;
      return `<h3 style="font-size:12px;color:${g.cor};margin:14px 0 4px">${g.titulo} (${ls.length}) — ${g.sub}</h3>
        <table style="width:100%;border-collapse:collapse;font-size:9px;table-layout:fixed">
          <thead><tr style="background:#1A4870;color:#fff;text-align:left"><th style="width:7%">Tipo</th><th style="width:9%">Nº</th><th style="width:9%">Emissão</th><th style="width:10%">Cancelada em</th>
          <th style="width:30%">Emitente</th><th style="width:17%">Fazenda</th><th style="width:7%">Título</th><th style="width:11%;text-align:right">Valor</th></tr></thead>
          <tbody>${corpo}</tbody>
          <tfoot><tr style="font-weight:700;border-top:1px solid #1A4870"><td colspan="7">${ls.length} nota(s)</td><td style="text-align:right">${fmtBRL(total(ls))}</td></tr></tfoot>
        </table>`;
    }).join("");
    const html = `<div style="font-size:10px;color:#555;margin-bottom:6px">Cancelamentos registrados no SIEG de ${fmtData(de)} a ${fmtData(ate)}</div>${blocos}
      <style>td,th{padding:3px 4px;word-wrap:break-word;vertical-align:top}</style>`;
    abrirPreviewImpressao("NFs Canceladas pelo Emitente", html, { orientation: "landscape", fazenda: cliente ?? undefined, nomeArquivo: nomeRelatorio("NFS CANCELADAS", cliente, de, ate) });
  }

  async function excel() {
    const XLSX = await import("xlsx");
    const resumo = [["Relatório", "NFs canceladas pelo emitente"], ["Cliente", cliente ?? ""], ["Cancelamentos no SIEG", `${fmtData(de)} a ${fmtData(ate)}`],
      ...GRUPOS.map(g => [g.titulo, doGrupo(g.id).length, total(doGrupo(g.id))]),
      ["Já canceladas no Arato", res?.ja_canceladas ?? 0], ["Canceladas que não estão no Arato", res?.fora_do_arato ?? 0]];
    const dados = linhas.map(l => ({
      "Situação": GRUPOS.find(g => g.id === grupoDe(l))!.titulo, "Tipo": l.tipo, "Número": l.numero, "Série": l.serie, "Emissão": fmtData(l.emissao),
      "Cancelada em": fmtData(l.cancelada_em), "Emitente": l.emitente, "CNPJ/CPF": l.emitente_cnpj, "Fazenda": fazendaNome(l.fazenda_id),
      "Título no financeiro": l.tem_financeiro ? "Sim" : "Não", "Valor": l.valor, "Chave": l.chave,
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

  return (
    <div style={{ minHeight: "100vh", background: "#F4F6FA" }}>
      <TopNav />
      <main style={{ padding: "16px 24px", maxWidth: 1400, margin: "0 auto" }}>
        <OperationalHeading data-arato-page-heading="true">
          <div>
            <h1 data-arato-h1="true" style={{ margin: 0, fontSize: 20, fontWeight: 700, color: "#111111" }}>NFs Canceladas pelo Emitente</h1>
            <div style={{ fontSize: 12, color: "#666", marginTop: 2 }}>Notas canceladas na SEFAZ que no Arato ainda estão processadas ou pendentes. As pendentes podem ser marcadas como Canceladas; as processadas precisam de estorno.</div>
          </div>
        </OperationalHeading>

        <div style={{ background: "#fff", border: "0.5px solid #DDE2EE", borderRadius: 12, padding: 14, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 220px))", gap: 12, alignItems: "end", marginTop: 12 }}>
          <div><label style={lbl}>Cancelamento de</label><InputData type="date" value={de} onChange={e => setDe(e.target.value)} style={inp} /></div>
          <div><label style={lbl}>Até</label><InputData type="date" value={ate} onChange={e => setAte(e.target.value)} style={inp} /></div>
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
              <span style={{ color: "#555" }}>{res.ja_canceladas} já canceladas no Arato · {res.fora_do_arato} não estão no Arato</span>
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
                  <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 6 }}>
                    <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 6, background: g.fundo, color: g.cor }}>{ls.length}</span>
                    <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: "#1a1a1a" }}>{g.titulo}</h2>
                    <span style={{ fontSize: 12, color: "#666" }}>{g.sub}</span>
                    <span style={{ flex: 1 }} />
                    {g.id === "pendente" && ls.length > 0 && (
                      <OperationalButton data-arato-button="primary" onClick={marcarPendentes} disabled={marcando}
                        style={{ padding: "6px 12px", background: "#1A4870", color: "#fff", border: "none", borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
                        {marcando ? "Marcando..." : `Marcar ${ls.length} como canceladas`}
                      </OperationalButton>
                    )}
                    <span style={{ fontSize: 13, fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>{fmtBRL(total(ls))}</span>
                  </div>
                  <div style={{ background: "#fff", border: "0.5px solid #DDE2EE", borderLeft: `3px solid ${g.cor}`, borderRadius: 12, overflow: "auto" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 900 }}>
                      <thead><tr>
                        {["Tipo", "Nº", "Emissão", "Cancelada em", "Emitente", "Fazenda", "Título no CP", "Valor"].map(h =>
                          <th key={h} style={{ ...th, textAlign: h === "Valor" ? "right" : "left" }}>{h}</th>)}
                      </tr></thead>
                      <tbody>
                        {ls.length === 0 && <tr><td colSpan={8} style={{ ...td, textAlign: "center", color: "#888", padding: 18 }}>Nenhuma nota nesta situação.</td></tr>}
                        {ls.map(l => (
                          <tr key={`${l.tipo}:${l.id}`}>
                            <td style={td}><span style={{ fontSize: 10, fontWeight: 700, padding: "2px 6px", borderRadius: 6, background: l.tipo === "NF-e" ? "#D5E8F5" : "#FBF3E0", color: l.tipo === "NF-e" ? "#0B2D50" : "#7A5A10" }}>{l.tipo}</span></td>
                            <td style={td}>{l.numero}</td>
                            <td style={{ ...td, whiteSpace: "nowrap" }}>{fmtData(l.emissao)}</td>
                            <td style={{ ...td, whiteSpace: "nowrap" }}>{fmtData(l.cancelada_em)}</td>
                            <td style={td}>{l.emitente}<div style={{ fontSize: 11, color: "#666" }}>{l.emitente_cnpj}</div></td>
                            <td style={td}>{fazendaNome(l.fazenda_id)}</td>
                            <td style={td}>{l.tem_financeiro ? <span style={{ color: "#E24B4A", fontWeight: 600 }}>Sim</span> : "Não"}</td>
                            <td style={{ ...td, textAlign: "right", whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>{fmtBRL(l.valor)}</td>
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
