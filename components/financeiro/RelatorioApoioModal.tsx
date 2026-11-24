"use client";
// Relatório do Apoio Financeiro (24/11/2026), no molde da janela de filtro do relatório de CP/CR
// (app/financeiro/relatorios, aba CP / CR): período, posição, tipo, origem, situação, categoria, fornecedor e produtor;
// colunas e agrupamentos escolhidos (lembrados por usuário); sai em PDF (impressão padrão Arato) ou Excel.
// Regras em lib/financeiro/apoio-relatorio.ts.
import { useEffect, useMemo, useState } from "react";
import MultiSelectDropdown from "../MultiSelectDropdown";
import SelectField from "../SelectField";
import InputData from "../InputData";
import { OperationalButton } from "../OperationalUI";
import { useAuth } from "../AuthProvider";
import { useClienteRelatorio } from "../useClienteRelatorio";
import { abrirPreviewImpressao, nomeRelatorio } from "../../lib/print";
import { hojeLocal } from "../../lib/data-local";
import { planilhaFormatada } from "../../lib/relatorios/xlsx-estilo";
import {
  agruparApoio, chavePessoa, COLUNAS_APOIO, COLUNAS_PADRAO, COLUNAS_TOTAL, filtrarApoio, GRUPOS_APOIO, resumoApoio,
  ROTULO_ORIGEM, ROTULO_SITUACAO, valorColuna, type FiltroApoio, type LinhaApoio, type Origem, type Situacao, type Totais,
} from "../../lib/financeiro/apoio-relatorio";

const lbl: React.CSSProperties = { fontSize: 11, color: "var(--text-2)", fontWeight: 600, display: "block", marginBottom: 4 };
const inp: React.CSSProperties = { padding: "7px 10px", border: "0.5px solid var(--border-table)", borderRadius: 8, fontSize: 13, background: "var(--bg-card)", width: "100%", boxSizing: "border-box" };
const btnOrdem = (desab: boolean): React.CSSProperties => ({ border: "0.5px solid var(--border)", background: "var(--bg-card)", borderRadius: 4, cursor: desab ? "default" : "pointer", opacity: desab ? 0.3 : 1, fontSize: 11, padding: "0 6px" });

const esc = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const dataBR = (iso: string) => (iso ? iso.slice(0, 10).split("-").reverse().join("/") : "");

function lerLista(chave: string, validas: string[]): string[] | null {
  try {
    const v = localStorage.getItem(chave);
    if (!v) return null;
    const arr = (JSON.parse(v) as string[]).filter(k => validas.includes(k));
    return arr;
  } catch { return null; }
}

/** Lista marcável com ordem (↑ ↓): colunas e níveis de agrupamento. */
function ListaOrdenada({ todas, marcadas, onChange, prefixoNivel }: {
  todas: { key: string; label: string }[]; marcadas: string[]; onChange: (v: string[]) => void; prefixoNivel?: boolean;
}) {
  const ordem = [...marcadas, ...todas.map(t => t.key).filter(k => !marcadas.includes(k))];
  return (
    <div style={{ border: "0.5px solid var(--border)", borderRadius: 8, padding: "6px 10px", maxHeight: 200, overflowY: "auto", background: "var(--bg-input)" }}>
      {ordem.map(k => {
        const def = todas.find(t => t.key === k); if (!def) return null;
        const marcado = marcadas.includes(k); const idx = marcadas.indexOf(k);
        const mover = (d: -1 | 1) => { const a = [...marcadas]; [a[idx + d], a[idx]] = [a[idx], a[idx + d]]; onChange(a); };
        return (
          <div key={k} style={{ display: "flex", alignItems: "center", gap: 6, padding: "2px 0", fontSize: 12, color: marcado ? "var(--text-1)" : "var(--text-3)" }}>
            <label style={{ display: "flex", alignItems: "center", gap: 6, flex: 1, cursor: "pointer" }}>
              <input type="checkbox" checked={marcado} style={{ accentColor: "#1A4870" }} onChange={() => onChange(marcado ? marcadas.filter(x => x !== k) : [...marcadas, k])} />
              {marcado && prefixoNivel ? `${idx + 1}º nível — ` : ""}{def.label}
            </label>
            {marcado && <>
              <button type="button" aria-label="Subir" disabled={idx === 0} onClick={() => mover(-1)} style={btnOrdem(idx === 0)}>↑</button>
              <button type="button" aria-label="Descer" disabled={idx === marcadas.length - 1} onClick={() => mover(1)} style={btnOrdem(idx === marcadas.length - 1)}>↓</button>
            </>}
          </div>
        );
      })}
    </div>
  );
}

export default function RelatorioApoioModal({ linhas, onFechar }: { linhas: LinhaApoio[]; onFechar: () => void }) {
  const { emailUsuario } = useAuth();
  const cliente = useClienteRelatorio();
  const hoje = hojeLocal();

  const [periodoPor, setPeriodoPor] = useState<"vencimento" | "baixa">("vencimento");
  const [de, setDe] = useState("");
  const [ate, setAte] = useState("");
  const [posicao, setPosicao] = useState(hoje);
  const [tipo, setTipo] = useState<"todos" | "pagar" | "receber">("todos");
  const [origens, setOrigens] = useState<Set<string>>(new Set());
  const [situacoes, setSituacoes] = useState<Set<string>>(new Set());
  const [categorias, setCategorias] = useState<Set<string>>(new Set());
  const [pessoas, setPessoas] = useState<Set<string>>(new Set());
  const [produtores, setProdutores] = useState<Set<string>>(new Set());
  const [cols, setCols] = useState<string[]>(COLUNAS_PADRAO);
  const [grupos, setGrupos] = useState<string[]>([]);
  const [formato, setFormato] = useState<"pdf" | "xlsx">("pdf");
  const [gerando, setGerando] = useState(false);

  // Colunas e agrupamentos ficam salvos por usuário, como no relatório de CP/CR
  const chaveCols = `apoio_relCols_${emailUsuario ?? ""}`, chaveGrupos = `apoio_relGrupos_${emailUsuario ?? ""}`;
  useEffect(() => {
    if (!emailUsuario) return;
    const c = lerLista(chaveCols, COLUNAS_APOIO.map(x => x.key)); if (c?.length) setCols(c);
    const g = lerLista(chaveGrupos, GRUPOS_APOIO.map(x => x.key)); if (g) setGrupos(g);
  }, [emailUsuario]); // eslint-disable-line react-hooks/exhaustive-deps
  const salvar = (chave: string, v: string[]) => { try { localStorage.setItem(chave, JSON.stringify(v)); } catch { /* navegador sem armazenamento */ } };
  const mudarCols = (v: string[]) => { setCols(v); salvar(chaveCols, v); };
  const mudarGrupos = (v: string[]) => { setGrupos(v); salvar(chaveGrupos, v); };

  const opcoesCategoria = useMemo(() => [...new Set(linhas.map(l => l.categoria || "Sem categoria"))].sort((a, b) => a.localeCompare(b, "pt-BR")).map(c => ({ v: c, label: c })), [linhas]);
  const opcoesProdutor = useMemo(() => [...new Set(linhas.map(l => l.produtor || "Sem produtor"))].sort((a, b) => a.localeCompare(b, "pt-BR")).map(c => ({ v: c, label: c })), [linhas]);
  const opcoesPessoa = useMemo(() => {
    const m = new Map<string, { v: string; label: string; busca: string }>();
    for (const l of linhas) {
      if (!l.pessoa && !l.documento) continue;
      const k = chavePessoa(l);
      if (!m.has(k)) m.set(k, { v: k, label: l.documento ? `${l.pessoa || "(sem nome)"} — ${l.documento}` : l.pessoa, busca: l.documento });
    }
    return [...m.values()].sort((a, b) => a.label.localeCompare(b.label, "pt-BR"));
  }, [linhas]);

  const filtro: FiltroApoio = {
    periodoPor, de, ate, posicao: posicao || hoje, tipo,
    origens: origens as Set<Origem>, situacoes: situacoes as Set<Situacao>, categorias, pessoas, produtores,
  };
  const selecionadas = useMemo(() => filtrarApoio(linhas, filtro), [linhas, periodoPor, de, ate, posicao, tipo, origens, situacoes, categorias, pessoas, produtores]); // eslint-disable-line react-hooks/exhaustive-deps

  function filtrosTexto(): { rotulo: string; valor: string }[] {
    const lista = (s: Set<string>, rot: (v: string) => string, todos: string) => s.size ? [...s].map(rot).join(", ") : todos;
    return [
      { rotulo: "Posição em", valor: dataBR(posicao || hoje) },
      { rotulo: periodoPor === "baixa" ? "Período (data da baixa)" : "Período (vencimento)", valor: de || ate ? `${de ? dataBR(de) : "início"} a ${ate ? dataBR(ate) : "fim"}` : "Todo o período" },
      { rotulo: "Tipo", valor: tipo === "todos" ? "CR + CP" : tipo === "receber" ? "Contas a Receber" : "Contas a Pagar" },
      { rotulo: "Origem", valor: lista(origens, v => ROTULO_ORIGEM[v as Origem], "Oficial + Exclusivo") },
      { rotulo: "Situação", valor: lista(situacoes, v => ROTULO_SITUACAO[v as Situacao], "Todas") },
      { rotulo: "Categoria", valor: lista(categorias, v => v, "Todas") },
      { rotulo: "Fornecedor / Cliente", valor: lista(pessoas, v => opcoesPessoa.find(o => o.v === v)?.label ?? v, "Todos") },
      { rotulo: "Produtor", valor: lista(produtores, v => v, "Todos") },
      ...(grupos.length ? [{ rotulo: "Agrupado por", valor: grupos.map(k => GRUPOS_APOIO.find(g => g.key === k)?.label ?? k).join(" › ") }] : []),
    ];
  }

  const colsDef = cols.map(k => COLUNAS_APOIO.find(c => c.key === k)!).filter(Boolean);
  const pos = posicao || hoje;
  const valTot = (k: string, t: Totais) => (k === "receber" ? t.receber : k === "pagar" ? t.pagar : t.saldo);

  function gerarPdf() {
    const { itens, geral } = agruparApoio(selecionadas, grupos, pos);
    const r = resumoApoio(selecionadas, pos);
    const num = (k: string) => { const t = COLUNAS_APOIO.find(c => c.key === k)?.tipo; return t === "moeda" || t === "numero"; };
    const somaPeso = colsDef.reduce((a, c) => a + c.peso, 0) || 1;
    const colgroup = `<colgroup>${colsDef.map(c => `<col style="width:${(c.peso / somaPeso * 100).toFixed(2)}%">`).join("")}</colgroup>`;
    const cab = colsDef.map(c => `<th style="padding:4px;text-align:${num(c.key) ? "right" : "left"};font-size:8px;font-weight:700;color:#fff;line-height:1.2;overflow-wrap:anywhere">${esc(c.label)}</th>`).join("");
    const iSoma = colsDef.findIndex(c => COLUNAS_TOTAL.has(c.key));
    const cor = (v: number) => (v < 0 ? "#B91C1C" : "#166534");
    const linhaTot = (rot: string, t: Totais, fundo: string, corTxt: string, recuo: number) => {
      const est = `padding:3px 4px;font-size:8.5px;font-weight:700;background:${fundo};color:${corTxt};border-top:0.5px solid #C9D3E6`;
      if (iSoma <= 0) return `<tr><td colspan="${colsDef.length}" style="${est};padding-left:${8 + recuo}px">${esc(rot)} (${t.n}) — receber ${brl(t.receber)} · pagar ${brl(t.pagar)} · saldo em aberto ${brl(t.saldo)}</td></tr>`;
      return `<tr><td colspan="${iSoma}" style="${est};padding-left:${8 + recuo}px">${esc(rot)} (${t.n})</td>${colsDef.slice(iSoma).map(c => COLUNAS_TOTAL.has(c.key)
        ? `<td style="${est};text-align:right;white-space:nowrap;color:${fundo === "#1A4870" ? "#fff" : c.key === "saldo" ? cor(t.saldo) : corTxt}">${brl(valTot(c.key, t))}</td>` : `<td style="${est}"></td>`).join("")}</tr>`;
    };
    const corpo = itens.map(it => {
      if (it.t === "grupo") return `<tr><td colspan="${colsDef.length}" style="padding:4px 4px 4px ${4 + it.nivel * 12}px;font-size:${it.nivel === 0 ? 9.5 : 9}px;font-weight:700;background:${["#E3EAF3", "#EEF3FA", "#F6F8FC"][Math.min(it.nivel, 2)]};color:#0B2D50;border-top:0.5px solid #C9D3E6">${esc(it.rot)}</td></tr>`;
      if (it.t === "sub") return linhaTot(it.rot, it.tot, "#F4F6FA", "#1a1a1a", it.nivel * 14);
      return `<tr style="border-bottom:0.5px solid #E8ECF4;page-break-inside:avoid">${colsDef.map(c => {
        const v = valorColuna(c.key, it.l, pos);
        const tipoC = c.tipo;
        const txt = v == null || v === "" ? "—" : typeof v === "number" ? (tipoC === "moeda" ? brl(v) : v.toLocaleString("pt-BR")) : tipoC === "data" ? dataBR(String(v)) : String(v);
        const corV = c.key === "saldo" && typeof v === "number" ? cor(v) : c.key === "pagar" && v != null ? "#B91C1C" : c.key === "receber" && v != null ? "#166534" : c.key === "dias" && typeof v === "number" && v < 0 ? "#B91C1C" : "#222";
        return `<td style="padding:3px 4px;font-size:8.5px;line-height:1.25;vertical-align:top;overflow-wrap:anywhere;text-align:${num(c.key) ? "right" : "left"};color:${corV};${tipoC === "moeda" ? "font-weight:600" : ""}">${esc(txt)}</td>`;
      }).join("")}</tr>`;
    }).join("") + (itens.length ? linhaTot("TOTAL GERAL", geral, "#1A4870", "#fff", 0) : "");
    const card = (rot: string, v: number, bg: string, borda: string, corT: string) =>
      `<div style="background:${bg};border:0.5px solid ${borda};border-radius:8px;padding:8px 12px"><div style="font-size:10px;color:${corT}">${rot}</div><div style="font-size:15px;font-weight:700;color:${corT}">${brl(v)}</div></div>`;
    const html = `
      <div style="display:grid;grid-template-columns:repeat(5,1fr);gap:10px;margin-bottom:14px">
        ${card("A receber em aberto", r.receberAberto, "#F0FDF4", "#BBF7D0", "#166534")}
        ${card("A pagar em aberto", r.pagarAberto, "#FEF2F2", "#FECACA", "#991B1B")}
        ${card("Saldo em aberto (CR − CP)", r.saldo, "#EFF6FF", "#BFDBFE", "#1A4870")}
        ${card("Recebimentos vencidos", r.receberVencido, "#FFFBEB", "#FDE68A", "#92400E")}
        ${card("Pagamentos vencidos", r.pagarVencido, "#FFFBEB", "#FDE68A", "#92400E")}
      </div>
      <table style="width:100%;table-layout:fixed;border-collapse:collapse;font-family:system-ui,sans-serif">
        ${colgroup}
        <thead style="display:table-header-group"><tr style="background:#1A4870">${cab}</tr></thead>
        <tbody>${corpo || `<tr><td colspan="${colsDef.length}" style="padding:20px;text-align:center;color:#999">Nenhum lançamento para os filtros aplicados.</td></tr>`}</tbody>
      </table>
      <div style="margin-top:8px;font-size:10px;color:#888">${selecionadas.length} lançamento(s). Situação, dias e saldo em aberto na posição de ${dataBR(pos)}. Valores na moeda do lançamento.</div>`;
    abrirPreviewImpressao(`Apoio Financeiro — Posição em ${dataBR(pos)}`, html, {
      orientation: "landscape", fazenda: cliente ?? undefined, filtros: filtrosTexto(), nomeArquivo: nomeRelatorio("APOIO FINANCEIRO", cliente),
    });
  }

  async function gerarXlsx() {
    const XLSX = await import("xlsx-js-style");
    const { itens, geral } = agruparApoio(selecionadas, grupos, pos);
    const r = resumoApoio(selecionadas, pos);
    const iSoma = colsDef.findIndex(c => COLUNAS_TOTAL.has(c.key));
    const linhaObj = (vals: (string | number | null)[]) => Object.fromEntries(colsDef.map((c, i) => [c.label, vals[i] ?? ""]));
    const destaque: { r: number; cor: string }[] = [];
    const rows: Record<string, unknown>[] = [];
    const tot = (rot: string, t: Totais, recuo: number) => colsDef.map((c, i) => i === 0
      ? `${"    ".repeat(recuo)}${rot} (${t.n})${iSoma <= 0 ? ` — saldo em aberto ${brl(t.saldo)}` : ""}`
      : COLUNAS_TOTAL.has(c.key) && iSoma > 0 ? valTot(c.key, t) : "");
    for (const it of itens) {
      if (it.t === "grupo") { rows.push(linhaObj(colsDef.map((_, i) => (i === 0 ? `${"    ".repeat(it.nivel)}${it.rot}` : "")))); destaque.push({ r: rows.length, cor: ["E3EAF3", "EEF3FA", "F6F8FC"][Math.min(it.nivel, 2)] }); continue; }
      if (it.t === "sub") { rows.push(linhaObj(tot(it.rot, it.tot, it.nivel))); destaque.push({ r: rows.length, cor: "F4F6FA" }); continue; }
      rows.push(linhaObj(colsDef.map(c => {
        const v = valorColuna(c.key, it.l, pos);
        return v == null ? "" : c.tipo === "data" && typeof v === "string" ? dataBR(v) : v;
      })));
    }
    rows.push(linhaObj(tot("TOTAL GERAL", geral, 0)));
    const ws = rows.length > 1 || itens.length ? planilhaFormatada(XLSX, rows, { horas: colsDef.filter(c => c.tipo === "numero").map(c => c.label), totalNaUltima: true })
      : XLSX.utils.aoa_to_sheet([colsDef.map(c => c.label)]);
    // Grupos e subtotais em negrito com fundo, como no PDF
    for (const d of destaque) for (let c = 0; c < colsDef.length; c++) {
      const cel = ws[XLSX.utils.encode_cell({ r: d.r, c })]; if (!cel) continue;
      cel.s = { ...(cel.s ?? {}), font: { bold: true, color: { rgb: "0B2D50" } }, fill: { fgColor: { rgb: d.cor } } };
    }
    if (grupos.length) delete ws["!autofilter"]; // filtro do Excel não combina com linhas de grupo
    const resumo = planilhaFormatada(XLSX, [
      { Item: "A receber em aberto", Valor: r.receberAberto },
      { Item: "A pagar em aberto", Valor: r.pagarAberto },
      { Item: "Saldo em aberto (CR − CP)", Valor: r.saldo },
      { Item: "Recebimentos vencidos", Valor: r.receberVencido },
      { Item: "Pagamentos vencidos", Valor: r.pagarVencido },
    ]);
    const filtros = planilhaFormatada(XLSX, filtrosTexto().map(f => ({ Filtro: f.rotulo, Valor: f.valor })));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Lançamentos");
    XLSX.utils.book_append_sheet(wb, resumo, "Resumo");
    XLSX.utils.book_append_sheet(wb, filtros, "Filtros");
    XLSX.writeFile(wb, `${nomeRelatorio("APOIO FINANCEIRO", cliente)}.xlsx`);
  }

  async function gerar() {
    setGerando(true);
    try {
      if (formato === "pdf") gerarPdf(); else await gerarXlsx();
      onFechar();
    } catch (e) {
      alert(`Não foi possível gerar o relatório: ${e instanceof Error ? e.message : String(e)}`);
    } finally { setGerando(false); }
  }

  const limpar = () => {
    setPeriodoPor("vencimento"); setDe(""); setAte(""); setPosicao(hoje); setTipo("todos");
    setOrigens(new Set()); setSituacoes(new Set()); setCategorias(new Set()); setPessoas(new Set()); setProdutores(new Set());
  };

  return (
    <div data-arato-overlay="true" style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.45)", zIndex: 2000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div role="dialog" aria-label="Filtro do relatório do Apoio Financeiro" style={{ background: "var(--bg-card)", borderRadius: 12, width: "min(96vw, 980px)", maxHeight: "92vh", overflowY: "auto", overflowX: "hidden", padding: 22 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: "var(--text-1)" }}>Relatório do Apoio Financeiro — filtro</div>
          <button type="button" aria-label="Fechar" onClick={onFechar} style={{ border: "none", background: "transparent", fontSize: 20, cursor: "pointer", color: "var(--text-2)" }}>×</button>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 12, marginBottom: 12 }}>
          <div><label style={lbl}>Posição em</label><InputData type="date" value={posicao} onChange={e => setPosicao(e.target.value)} style={inp} /></div>
          <div><label style={lbl}>Período por</label>
            <SelectField value={periodoPor} onChange={e => setPeriodoPor(e.target.value as "vencimento" | "baixa")} style={inp}>
              <option value="vencimento">Vencimento</option><option value="baixa">Data da baixa</option>
            </SelectField></div>
          <div><label style={lbl}>{periodoPor === "baixa" ? "Baixa de" : "Vencimento de"} (vazio = tudo)</label><InputData type="date" value={de} onChange={e => setDe(e.target.value)} style={inp} /></div>
          <div><label style={lbl}>até (vazio = tudo)</label><InputData type="date" value={ate} onChange={e => setAte(e.target.value)} style={inp} /></div>
          <div><label style={lbl}>Tipo</label>
            <SelectField value={tipo} onChange={e => setTipo(e.target.value as typeof tipo)} style={inp}>
              <option value="todos">Todos (CR + CP)</option><option value="receber">Contas a Receber (CR)</option><option value="pagar">Contas a Pagar (CP)</option>
            </SelectField></div>
        </div>
        <div style={{ fontSize: 11, color: "var(--text-3)", margin: "-4px 0 12px" }}>
          Posição: a situação (a vencer, vencido, baixado), os dias de atraso e o saldo em aberto são calculados nessa data — baixa feita depois dela conta como em aberto.
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
          <div><label style={lbl}>Origem</label>
            <MultiSelectDropdown opcoes={(["oficial", "exclusivo"] as Origem[]).map(o => ({ v: o, label: ROTULO_ORIGEM[o] }))} selecionados={origens} onChange={setOrigens} textoTodos="Oficial + Exclusivo" largura="100%" /></div>
          <div><label style={lbl}>Situação na posição</label>
            <MultiSelectDropdown opcoes={(["a_vencer", "vencido", "baixado"] as Situacao[]).map(s => ({ v: s, label: ROTULO_SITUACAO[s] }))} selecionados={situacoes} onChange={setSituacoes} textoTodos="Todas" largura="100%" /></div>
          <div><label style={lbl}>Categoria</label>
            <MultiSelectDropdown opcoes={opcoesCategoria} selecionados={categorias} onChange={setCategorias} textoTodos="Todas" largura="100%" buscavel placeholderBusca="Pesquisar categoria…" /></div>
          <div><label style={lbl}>Produtor</label>
            <MultiSelectDropdown opcoes={opcoesProdutor} selecionados={produtores} onChange={setProdutores} textoTodos="Todos" largura="100%" buscavel placeholderBusca="Pesquisar produtor…" /></div>
        </div>
        <div style={{ marginBottom: 14 }}><label style={lbl}>Fornecedor / Cliente</label>
          <MultiSelectDropdown opcoes={opcoesPessoa} selecionados={pessoas} onChange={setPessoas} textoTodos="Todos" largura="100%" buscavel placeholderBusca="Pesquisar por nome ou CNPJ/CPF…" limite={150} /></div>

        <div style={{ marginBottom: 14 }}>
          <label style={lbl}>Colunas do relatório (marque as que quer ver; ↑ ↓ para a ordem; fica salvo para você)</label>
          <ListaOrdenada todas={COLUNAS_APOIO} marcadas={cols} onChange={mudarCols} />
          {cols.length === 0 && <div style={{ fontSize: 11, color: "#B91C1C", marginTop: 4 }}>Marque ao menos uma coluna.</div>}
        </div>
        <div style={{ marginBottom: 14 }}>
          <label style={lbl}>Agrupamento (o 1º da lista é o nível principal — use ↑ ↓; sem nenhum = lista simples por vencimento)</label>
          <ListaOrdenada todas={GRUPOS_APOIO} marcadas={grupos} onChange={mudarGrupos} prefixoNivel />
          {grupos.length > 0 && <div style={{ fontSize: 11, color: "var(--text-2)", marginTop: 4 }}>Cada grupo traz subtotal (a receber, a pagar e saldo em aberto) e o relatório termina com o total geral.</div>}
        </div>

        <div style={{ marginBottom: 16, display: "flex", alignItems: "center", gap: 18, flexWrap: "wrap" }}>
          <span style={{ ...lbl, marginBottom: 0 }}>Emissão</span>
          {([["pdf", "PDF (abre para imprimir)"], ["xlsx", "Excel (baixa o arquivo)"]] as const).map(([v, rot]) => (
            <label key={v} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, cursor: "pointer" }}>
              <input type="radio" name="apoioFormato" checked={formato === v} onChange={() => setFormato(v)} style={{ accentColor: "#1A4870" }} />{rot}
            </label>
          ))}
          <span style={{ marginLeft: "auto", fontSize: 12, color: "var(--text-2)" }}>{selecionadas.length} lançamento(s) com esses filtros</span>
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
          <button type="button" onClick={limpar} style={{ background: "none", border: "none", color: "var(--text-2)", fontSize: 12, textDecoration: "underline", cursor: "pointer" }}>Limpar filtros</button>
          <div style={{ display: "flex", gap: 8 }}>
            <OperationalButton data-arato-button="secondary" onClick={onFechar} style={{ ...inp, width: "auto", cursor: "pointer" }}>Cancelar</OperationalButton>
            <OperationalButton data-arato-button="primary" disabled={cols.length === 0 || gerando} onClick={() => void gerar()}
              style={{ background: "#1A4870", color: "#fff", border: "none", borderRadius: 8, padding: "8px 18px", fontSize: 13, fontWeight: 600, cursor: "pointer", opacity: cols.length === 0 || gerando ? 0.6 : 1 }}>
              {gerando ? "Gerando…" : "Gerar relatório"}
            </OperationalButton>
          </div>
        </div>
      </div>
    </div>
  );
}
