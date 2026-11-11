"use client";
// Folha de Pagamento → aba Relatórios: UM relatório, no padrão do relatório de CP/CR (janela de filtro → PDF, XLSX ou tela).
// Filtra modalidades (salário, gratificação, horas extras, DSR, complemento, 13º, verbas rescisórias, benefícios, descontos,
// encargos, adiantamentos) e origens (folha mensal, gratificação em título, 13º, rescisões, adiantamentos) em qualquer
// combinação, com período, empregador, fazenda, área e funcionário. Formato: lista detalhada ou quadro (colunas por
// modalidade ou por mês), com agrupamento em níveis. Dados: /api/folha/salvar operação relatorio_folha (só leitura).
// Regras: lib/folha/relatorios.ts (testadas).
import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { useAuth } from "../AuthProvider";
import { OperationalButton } from "../OperationalUI";
import MultiSelectDropdown from "../MultiSelectDropdown";
import { supabase } from "../../lib/supabase";
import { useClienteRelatorio } from "../useClienteRelatorio";
import { abrirPreviewImpressao, nomeRelatorio } from "../../lib/print";
import { planilhaFormatada } from "../../lib/relatorios/xlsx-estilo";
import {
  COLUNAS_LISTA, GRUPOS_MOD, MODALIDADES, NIVEIS, ORIGENS, competencias, montarLista, montarQuadro, nomeMes,
  movimentosDaFolha, movimentosDaGratificacao, movimentosDaRescisao, movimentosDo13, movimentosDoAdiantamento,
  type ColunaLista, type Movimento, type Nivel, type Origem, type Pessoa, type TabelaRel,
} from "../../lib/folha/relatorios";

type R = Record<string, unknown>;
type Dados = {
  folhas: R[]; itens: R[]; funcionarios: R[]; premiacoes: R[]; adiantamentos: R[]; decimos: R[]; rescisoes: R[];
  situacao: Record<string, { status: string; valor_pago: number }>; empresas: R[]; produtores: R[]; fazendas: R[];
};
type Formato = "lista" | "quadro_mod" | "quadro_mes";
type Config = {
  de: string; ate: string; modalidades: string[]; origens: Origem[]; empregadores: string[]; fazendas: string[]; areas: string[];
  funcionarios: string[]; soFechadas: boolean; formato: Formato; colunas: ColunaLista[]; niveis: Nivel[];
};

const hojeComp = () => new Date().toISOString().slice(0, 7);
const ANO = new Date().getFullYear();
const PADRAO: Config = {
  de: `${ANO}-01`, ate: hojeComp(), modalidades: MODALIDADES.filter(m => m.padrao).map(m => m.id), origens: ["folha", "gratificacao", "decimo", "rescisao"],
  empregadores: [], fazendas: [], areas: [], funcionarios: [], soFechadas: false, formato: "quadro_mod",
  colunas: COLUNAS_LISTA.filter(c => c.padrao).map(c => c.id), niveis: ["funcionario"],
};
const CHAVE_CFG = "folha_relatorio_cfg_v1";

// Combinações prontas (o usuário ajusta depois)
const ATALHOS: { rot: string; cfg: Partial<Config> }[] = [
  { rot: "Remuneração mês a mês", cfg: { modalidades: MODALIDADES.filter(m => m.padrao).map(m => m.id), origens: ["folha", "gratificacao", "decimo", "rescisao"], formato: "quadro_mes", niveis: ["modalidade"] } },
  { rot: "Por funcionário", cfg: { modalidades: MODALIDADES.filter(m => m.padrao).map(m => m.id), origens: ["folha", "gratificacao", "decimo", "rescisao"], formato: "quadro_mod", niveis: ["funcionario"] } },
  { rot: "Horas extras", cfg: { modalidades: ["he50", "he100", "dsr"], origens: ["folha"], formato: "lista", niveis: ["funcionario"], colunas: ["competencia", "modalidade", "horas", "valor"] } },
  { rot: "Gratificações", cfg: { modalidades: ["gratificacao"], origens: ["folha", "gratificacao"], formato: "lista", niveis: ["funcionario"], colunas: ["competencia", "origem", "descricao", "valor", "situacao"] } },
  { rot: "13º salário", cfg: { modalidades: ["decimo", "inss", "irrf"], origens: ["decimo"], formato: "lista", niveis: ["funcionario"], colunas: ["data", "modalidade", "descricao", "valor", "situacao"] } },
  { rot: "Rescisões", cfg: { modalidades: MODALIDADES.map(m => m.id), origens: ["rescisao"], formato: "lista", niveis: ["funcionario"], colunas: ["data", "modalidade", "descricao", "valor"] } },
  { rot: "Descontos", cfg: { modalidades: ["inss", "irrf", "adiantamento", "outros_descontos"], origens: ["folha", "decimo", "rescisao"], formato: "quadro_mod", niveis: ["funcionario"] } },
  { rot: "Encargos", cfg: { modalidades: ["inss_patronal", "fgts", "multa_fgts"], origens: ["folha", "rescisao"], formato: "quadro_mes", niveis: ["empregador", "modalidade"] } },
  { rot: "Adiantamentos", cfg: { modalidades: ["adiantamento_concedido", "adiantamento"], origens: ["adiantamento", "folha"], formato: "lista", niveis: ["funcionario"], colunas: ["data", "competencia", "modalidade", "descricao", "valor", "situacao"] } },
];

const fmtBRL = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fmtNum = (v: number) => v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const esc = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const SIT_CP = (s?: { status: string; valor_pago: number }) => !s ? "Sem título" : s.status === "baixado" ? "Pago" : s.valor_pago > 0 || s.status === "parcial" ? "Parcial" : s.status === "cancelado" ? "Cancelado" : "Aberto no CP";
const SIT_FOLHA: Record<string, string> = { rascunho: "Folha em rascunho", fechado: "Folha fechada", pago: "Folha paga" };
const ADI_STATUS: Record<string, string> = { pendente: "A descontar", descontado: "Descontado", cancelado: "Cancelado" };

const lbl: CSSProperties = { display: "block", fontSize: 11, fontWeight: 600, color: "var(--text-2)", marginBottom: 4 };
const inp: CSSProperties = { padding: "6px 9px", border: "0.5px solid var(--border-table)", borderRadius: 7, fontSize: 12, background: "var(--bg-input)", color: "var(--text-1)" };
const caixa: CSSProperties = { border: "0.5px solid var(--border)", borderRadius: 8, padding: "6px 10px", background: "var(--bg-input)" };
const setinha = (dis: boolean): CSSProperties => ({ border: "0.5px solid var(--border)", background: "var(--bg-card)", borderRadius: 4, cursor: dis ? "default" : "pointer", opacity: dis ? 0.3 : 1, fontSize: 11, padding: "0 6px" });

function lerCfg(): Config {
  try { const s = localStorage.getItem(CHAVE_CFG); if (s) { const c = JSON.parse(s) as Partial<Config>; return { ...PADRAO, ...c, de: PADRAO.de, ate: PADRAO.ate }; } } catch { /* sem armazenamento */ }
  return PADRAO;
}

export default function RelatoriosFolha() {
  const { fazendaIds, fazendaId } = useAuth();
  const ids = useMemo(() => (fazendaIds?.length ? fazendaIds : fazendaId ? [fazendaId] : []), [fazendaIds, fazendaId]);
  const cliente = useClienteRelatorio();
  const [cfg, setCfgRaw] = useState<Config>(PADRAO);
  const [popup, setPopup] = useState(false);
  const [emissao, setEmissao] = useState<"pdf" | "xlsx" | "tela">("pdf");
  const [naTela, setNaTela] = useState<{ cfg: Config; tabela: TabelaRel } | null>(null);
  const [dados, setDados] = useState<{ chave: string; d: Dados } | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState("");

  useEffect(() => { setCfgRaw(lerCfg()); }, []);
  const setCfg = (p: Partial<Config>) => setCfgRaw(c => {
    const n = { ...c, ...p };
    try { const { de: _d, ate: _a, ...resto } = n; void _d; void _a; localStorage.setItem(CHAVE_CFG, JSON.stringify(resto)); } catch { /* sem armazenamento */ }
    return n;
  });

  const chaveDados = `${ids.join(",")}|${cfg.de}|${cfg.ate}`;
  async function buscar(): Promise<Dados | null> {
    if (dados?.chave === chaveDados) return dados.d;
    if (!ids.length || !cfg.de || !cfg.ate || cfg.de > cfg.ate) return null;
    setCarregando(true); setErro("");
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const r = await fetch("/api/folha/salvar", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token ?? ""}` },
        body: JSON.stringify({ operacao: "relatorio_folha", fazenda_ids: ids, de: cfg.de, ate: cfg.ate }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || j.error) throw new Error(j.error ?? `Erro HTTP ${r.status}`);
      setDados({ chave: chaveDados, d: j as Dados });
      return j as Dados;
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
      return null;
    } finally {
      setCarregando(false);
    }
  }
  // Com a janela aberta, carrega o período para as listas de empregador, fazenda e funcionário
  useEffect(() => { if (popup) buscar(); }, [popup, chaveDados]); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Movimentos ───────────────────────────────────────────────
  function movimentos(d: Dados): Movimento[] {
    const emp = new Map(d.empresas.map(e => [String(e.id), String(e.nome || e.razao_social || "Empresa")]));
    const prod = new Map(d.produtores.map(p => [String(p.id), String(p.nome || "Produtor")]));
    const faz = new Map(d.fazendas.map(f => [String(f.id), String(f.nome ?? "")]));
    const funcs = new Map(d.funcionarios.map(f => [String(f.id), f]));
    const folhas = new Map(d.folhas.map(f => [String(f.id), f]));
    const nomeEmp = (e: unknown, p: unknown) => e ? emp.get(String(e)) ?? "Empresa" : p ? prod.get(String(p)) ?? "Produtor" : "";
    const pessoa = (fid: unknown, alt: { nome?: unknown; cargo?: unknown; empresa_id?: unknown; produtor_id?: unknown; fazenda_id?: unknown } = {}): Pessoa => {
      const f = funcs.get(String(fid ?? ""));
      return {
        funcionario_id: fid ? String(fid) : null, nome: String(f?.nome ?? alt.nome ?? "—"), cargo: String(alt.cargo || f?.funcao || ""),
        empregador: nomeEmp(alt.empresa_id ?? f?.empresa_id, alt.produtor_id ?? f?.produtor_id) || nomeEmp(f?.empresa_id, f?.produtor_id),
        fazenda: faz.get(String(alt.fazenda_id ?? f?.fazenda_id ?? "")) ?? "", area: String(f?.area_trabalho ?? "operacional"),
      };
    };
    const sit = (lid: unknown) => lid ? SIT_CP(d.situacao[String(lid)]) : "A lançar";
    const out: Movimento[] = [];
    for (const i of d.itens) {
      const fl = folhas.get(String(i.folha_id));
      if (!fl || (cfg.soFechadas && fl.status === "rascunho")) continue;
      out.push(...movimentosDaFolha(i, String(fl.competencia), SIT_FOLHA[String(fl.status)] ?? String(fl.status),
        pessoa(i.funcionario_id, { nome: i.nome_funcionario, cargo: i.cargo, empresa_id: i.empresa_id ?? fl.empresa_id, produtor_id: i.produtor_id ?? fl.produtor_id, fazenda_id: fl.fazenda_id })));
    }
    for (const g of d.premiacoes) if (g.lancamento_id) out.push(...movimentosDaGratificacao(g, sit(g.lancamento_id), pessoa(g.funcionario_id, { fazenda_id: g.fazenda_id })));
    for (const x of d.decimos) out.push(...movimentosDo13(x, sit(x.parcela1_lancamento_id), sit(x.parcela2_lancamento_id), pessoa(x.funcionario_id, { fazenda_id: x.fazenda_id })));
    for (const r of d.rescisoes) out.push(...movimentosDaRescisao(r, pessoa(r.funcionario_id, { fazenda_id: r.fazenda_id })));
    for (const a of d.adiantamentos) if (a.status !== "cancelado") out.push(...movimentosDoAdiantamento(a, ADI_STATUS[String(a.status)] ?? String(a.status), pessoa(a.funcionario_id, { fazenda_id: a.fazenda_id })));
    return out;
  }
  const filtrar = (ms: Movimento[], c: Config) => ms.filter(m =>
    m.competencia >= c.de && m.competencia <= c.ate
    && c.modalidades.includes(m.modalidade) && c.origens.includes(m.origem)
    && (!c.empregadores.length || c.empregadores.includes(m.empregador))
    && (!c.fazendas.length || c.fazendas.includes(m.fazenda))
    && (!c.areas.length || c.areas.includes(m.area))
    && (!c.funcionarios.length || c.funcionarios.includes(m.funcionario_id ?? "")));
  const tabelaDe = (ms: Movimento[], c: Config): TabelaRel => c.formato === "lista"
    ? montarLista(ms, c.colunas, c.niveis)
    : montarQuadro(ms, c.niveis.filter(n => n !== (c.formato === "quadro_mod" ? "modalidade" : "competencia")), c.formato === "quadro_mod" ? "modalidade" : "competencia", competencias(c.de, c.ate));

  // Opções dos filtros (do período carregado)
  const todosMov = useMemo(() => (dados?.chave === chaveDados ? movimentos(dados.d) : []), [dados, chaveDados, cfg.soFechadas]); // eslint-disable-line react-hooks/exhaustive-deps
  const opcoes = useMemo(() => {
    const uniq = (xs: string[]) => [...new Set(xs.filter(Boolean))].sort((a, b) => a.localeCompare(b, "pt-BR")).map(v => ({ v, label: v }));
    const funcs = new Map<string, string>();
    for (const m of todosMov) if (m.funcionario_id) funcs.set(m.funcionario_id, m.nome);
    return {
      empregadores: uniq(todosMov.map(m => m.empregador)), fazendas: uniq(todosMov.map(m => m.fazenda)),
      funcionarios: [...funcs.entries()].map(([v, label]) => ({ v, label })).sort((a, b) => a.label.localeCompare(b.label, "pt-BR")),
    };
  }, [todosMov]);
  const qtdFiltrada = useMemo(() => filtrar(todosMov, cfg).length, [todosMov, cfg]);

  // ─── Emissão ──────────────────────────────────────────────────
  const tituloRel = (c: Config) => c.formato === "lista" ? "Lista detalhada" : c.formato === "quadro_mod" ? "Quadro por modalidade" : "Quadro mês a mês";
  const filtrosTexto = (c: Config) => {
    const lista = (sel: string[], todos: string[], rot: (v: string) => string) => !sel.length || sel.length === todos.length ? "Todos" : sel.length <= 4 ? sel.map(rot).join(", ") : `${sel.length} selecionados`;
    return [
      { rotulo: "Período", valor: `${nomeMes(c.de)} a ${nomeMes(c.ate)}` },
      { rotulo: "Modalidades", valor: lista(c.modalidades, MODALIDADES.map(m => m.id), v => MODALIDADES.find(m => m.id === v)?.rotulo ?? v) },
      { rotulo: "Origem", valor: lista(c.origens, ORIGENS.map(o => o.id), v => ORIGENS.find(o => o.id === v)?.rotulo ?? v) },
      { rotulo: "Empregador", valor: lista(c.empregadores, [], v => v) },
      { rotulo: "Fazenda", valor: lista(c.fazendas, [], v => v) },
      { rotulo: "Área", valor: c.areas.length === 1 ? (c.areas[0] === "administrativo" ? "Administrativo" : "Fazenda") : "Todas" },
      { rotulo: "Funcionário", valor: lista(c.funcionarios, [], v => opcoes.funcionarios.find(o => o.v === v)?.label ?? v) },
      { rotulo: "Agrupado por", valor: c.niveis.map(n => NIVEIS.find(x => x.id === n)?.rotulo ?? n).join(" › ") || "—" },
      ...(c.soFechadas ? [{ rotulo: "Folhas", valor: "Só fechadas" }] : []),
    ];
  };
  const fmtCel = (v: string | number, tipo: string) => typeof v !== "number" ? v : tipo === "moeda" ? fmtBRL(v) : fmtNum(v);
  const intervaloNome = (c: Config) => `${nomeMes(c.de)} A ${nomeMes(c.ate)}`.replace(/\//g, "-");

  function pdf(t: TabelaRel, c: Config) {
    const al = (tipo: string) => (tipo === "texto" ? "left" : "right");
    const linha = (l: TabelaRel["linhas"][number]) => {
      const st = l.tipo === "grupo" ? `font-weight:700;color:#0B2D50;background:${l.nivel ? "#F7F9FC" : "#EEF4FB"}` : l.tipo === "subtotal" ? "font-weight:700" : l.tipo === "total" ? "font-weight:700;background:#F4F6FA" : "";
      return `<tr style="${st}">${l.cels.map((v, i) => `<td style="text-align:${al(t.colunas[i].tipo)};${i === 0 && l.nivel ? `padding-left:${4 + l.nivel * 10}px;` : ""}color:${typeof v === "number" && v < 0 ? "#B91C1C" : "inherit"}">${esc(fmtCel(v, t.colunas[i].tipo))}</td>`).join("")}</tr>`;
    };
    const larga = t.colunas.length > 9;
    const html = `<table style="width:100%;border-collapse:collapse;font-size:${larga ? "7.5" : "9"}px">
      <thead><tr>${t.colunas.map(col => `<th style="text-align:${al(col.tipo)}">${esc(col.rot)}</th>`).join("")}</tr></thead>
      <tbody>${t.linhas.map(linha).join("")}</tbody></table>
      <div style="margin-top:8px;font-size:8px;color:#666">Descontos aparecem com valor negativo. 13º entra no mês do vencimento de cada parcela lançada; rescisões no mês do desligamento; gratificação em título próprio no mês de referência.</div>
      <style>td,th{padding:3px 4px;vertical-align:top;white-space:nowrap}</style>`;
    abrirPreviewImpressao(`Folha de Pagamento — ${tituloRel(c)}`, html, { orientation: "landscape", fazenda: cliente ?? undefined, filtros: filtrosTexto(c),
      nomeArquivo: nomeRelatorio(`FOLHA ${tituloRel(c)}`, cliente, null, null, intervaloNome(c)) });
  }

  async function xlsx(t: TabelaRel, c: Config) {
    const XLSX = await import("xlsx-js-style");
    const rots = t.colunas.map((col, i) => t.colunas.findIndex(x => x.rot === col.rot) === i ? col.rot : `${col.rot} (${i + 1})`);
    const objs = t.linhas.map(l => Object.fromEntries(rots.map((r, i) => {
      const v = l.cels[i];
      return [r, i === 0 && l.nivel ? `${"   ".repeat(l.nivel)}${v}` : v === "" && t.colunas[i].tipo !== "texto" ? null : v];
    })));
    const ws = planilhaFormatada(XLSX, objs.length ? objs : [Object.fromEntries(rots.map(r => [r, ""]))], { horas: rots.filter((_, i) => t.colunas[i].tipo === "horas"), totalNaUltima: t.linhas.at(-1)?.tipo === "total" });
    // Grupos e subtotais em negrito
    t.linhas.forEach((l, li) => { if (l.tipo === "grupo" || l.tipo === "subtotal") rots.forEach((_, ci) => { const cel = ws[XLSX.utils.encode_cell({ r: li + 1, c: ci })]; if (cel) cel.s = { ...(cel.s ?? {}), font: { bold: true }, fill: { fgColor: { rgb: l.tipo === "grupo" ? "EEF4FB" : "F4F6FA" } } }; }); });
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Folha");
    XLSX.utils.book_append_sheet(wb, planilhaFormatada(XLSX, filtrosTexto(c).map(f => ({ Filtro: f.rotulo, Valor: f.valor }))), "Filtros");
    XLSX.writeFile(wb, `${nomeRelatorio(`FOLHA ${tituloRel(c)}`, cliente, null, null, intervaloNome(c))}.xlsx`);
  }

  async function gerar() {
    if (cfg.de > cfg.ate) { setErro("O mês inicial é depois do mês final."); return; }
    const d = await buscar();
    if (!d) return;
    const ms = filtrar(movimentos(d), cfg);
    if (!ms.length) { setErro("Nenhum lançamento no período com esses filtros."); return; }
    const t = tabelaDe(ms, cfg);
    setPopup(false);
    if (emissao === "pdf") pdf(t, cfg);
    else if (emissao === "xlsx") await xlsx(t, cfg);
    else setNaTela({ cfg, tabela: t });
  }

  // ─── Peças da janela de filtro ────────────────────────────────
  const alterna = <T,>(lista: T[], v: T) => lista.includes(v) ? lista.filter(x => x !== v) : [...lista, v];
  const listaOrdenavel = <K extends string>(todos: { id: K; rotulo: string }[], marcados: K[], salvar: (a: K[]) => void, prefixo?: (idx: number) => string) => (
    <div style={caixa}>
      {[...marcados, ...todos.map(t => t.id).filter(k => !marcados.includes(k))].map(k => {
        const def = todos.find(t => t.id === k); if (!def) return null;
        const marcado = marcados.includes(k), idx = marcados.indexOf(k);
        return (
          <div key={k} style={{ display: "flex", alignItems: "center", gap: 6, padding: "2px 0", fontSize: 12, color: marcado ? "var(--text-1)" : "var(--text-3)" }}>
            <label style={{ display: "flex", alignItems: "center", gap: 6, flex: 1, cursor: "pointer" }}>
              <input type="checkbox" checked={marcado} style={{ accentColor: "#1A4870" }} onChange={() => salvar(alterna(marcados, k))} />
              {marcado && prefixo ? prefixo(idx) : ""}{def.rotulo}
            </label>
            {marcado && <>
              <button type="button" aria-label="Subir" disabled={idx === 0} onClick={() => { const a = [...marcados]; [a[idx - 1], a[idx]] = [a[idx], a[idx - 1]]; salvar(a); }} style={setinha(idx === 0)}>↑</button>
              <button type="button" aria-label="Descer" disabled={idx === marcados.length - 1} onClick={() => { const a = [...marcados]; [a[idx + 1], a[idx]] = [a[idx], a[idx + 1]]; salvar(a); }} style={setinha(idx === marcados.length - 1)}>↓</button>
            </>}
          </div>
        );
      })}
    </div>
  );

  const janela = popup && (
    <div data-arato-overlay="true" style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.45)", zIndex: 2000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div role="dialog" aria-label="Filtro do relatório da folha" onClick={e => e.stopPropagation()} style={{ background: "var(--bg-card)", borderRadius: 12, width: "min(96vw, 1040px)", maxHeight: "92vh", overflowY: "auto", overflowX: "hidden", padding: 22, textAlign: "left" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: "var(--text-1)" }}>Relatório da Folha — filtro</div>
          <button type="button" aria-label="Fechar" onClick={() => setPopup(false)} style={{ border: "none", background: "transparent", fontSize: 20, cursor: "pointer", color: "var(--text-2)" }}>×</button>
        </div>

        <div style={{ marginBottom: 12 }}>
          <span style={lbl}>Combinações prontas (ajuste o que quiser depois)</span>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {ATALHOS.map(a => <button key={a.rot} type="button" onClick={() => setCfg(a.cfg)} style={{ ...inp, cursor: "pointer", color: "#1A4870", borderRadius: 999 }}>{a.rot}</button>)}
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12, marginBottom: 12 }}>
          <div><label style={lbl}>Competência de</label><input type="month" value={cfg.de} onChange={e => setCfg({ de: e.target.value })} style={{ ...inp, width: "100%", boxSizing: "border-box" }} /></div>
          <div><label style={lbl}>até</label><input type="month" value={cfg.ate} onChange={e => setCfg({ ate: e.target.value })} style={{ ...inp, width: "100%", boxSizing: "border-box" }} /></div>
          <div style={{ gridColumn: "span 2", display: "flex", gap: 6, alignItems: "flex-end" }}>
            {[["Ano atual", `${ANO}-01`, hojeComp()], ["Ano passado", `${ANO - 1}-01`, `${ANO - 1}-12`], ["Últimos 12 meses", (() => { const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - 11); return d.toISOString().slice(0, 7); })(), hojeComp()]].map(([rot, a, b]) => (
              <button key={rot} type="button" onClick={() => setCfg({ de: a, ate: b })} style={{ ...inp, cursor: "pointer", background: cfg.de === a && cfg.ate === b ? "#D5E8F5" : "var(--bg-input)", color: "#1A4870" }}>{rot}</button>
            ))}
          </div>
        </div>

        <div style={{ marginBottom: 12 }}>
          <label style={lbl}>Modalidades — marque as que entram no relatório (qualquer combinação)</label>
          <div style={{ ...caixa, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: "4px 16px", padding: "8px 12px" }}>
            {GRUPOS_MOD.map(g => {
              const doGrupo = MODALIDADES.filter(m => m.grupo === g.id).map(m => m.id);
              const todos = doGrupo.every(id => cfg.modalidades.includes(id)), algum = doGrupo.some(id => cfg.modalidades.includes(id));
              return (
                <div key={g.id}>
                  <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 700, color: "#0B2D50", cursor: "pointer", margin: "2px 0" }}>
                    <input type="checkbox" checked={todos} ref={el => { if (el) el.indeterminate = algum && !todos; }} style={{ accentColor: "#1A4870" }}
                      onChange={() => setCfg({ modalidades: todos ? cfg.modalidades.filter(id => !doGrupo.includes(id)) : [...new Set([...cfg.modalidades, ...doGrupo])] })} />
                    {g.rotulo}
                  </label>
                  {g.ajuda && <div style={{ fontSize: 10, color: "var(--text-3)", margin: "-2px 0 2px 21px" }}>{g.ajuda}</div>}
                  {MODALIDADES.filter(m => m.grupo === g.id).map(m => (
                    <label key={m.id} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, cursor: "pointer", padding: "1px 0 1px 14px", color: cfg.modalidades.includes(m.id) ? "var(--text-1)" : "var(--text-3)" }}>
                      <input type="checkbox" checked={cfg.modalidades.includes(m.id)} style={{ accentColor: "#1A4870" }} onChange={() => setCfg({ modalidades: alterna(cfg.modalidades, m.id) })} />{m.rotulo}
                    </label>
                  ))}
                </div>
              );
            })}
          </div>
          {!cfg.modalidades.length && <div style={{ fontSize: 11, color: "#B91C1C", marginTop: 4 }}>Marque ao menos uma modalidade.</div>}
        </div>

        <div style={{ marginBottom: 12 }}>
          <label style={lbl}>Origem — de onde vem o lançamento</label>
          <div style={{ ...caixa, display: "flex", flexWrap: "wrap", gap: "4px 18px" }}>
            {ORIGENS.map(o => (
              <label key={o.id} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, cursor: "pointer", color: cfg.origens.includes(o.id) ? "var(--text-1)" : "var(--text-3)" }}>
                <input type="checkbox" checked={cfg.origens.includes(o.id)} style={{ accentColor: "#1A4870" }} onChange={() => setCfg({ origens: alterna(cfg.origens, o.id) })} />{o.rotulo}
              </label>
            ))}
          </div>
          {!cfg.origens.length && <div style={{ fontSize: 11, color: "#B91C1C", marginTop: 4 }}>Marque ao menos uma origem.</div>}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12, marginBottom: 12 }}>
          <div><label style={lbl}>Empregador</label><MultiSelectDropdown opcoes={opcoes.empregadores} selecionados={new Set(cfg.empregadores)} onChange={s => setCfg({ empregadores: [...s] })} textoTodos="Todos" largura="100%" buscavel /></div>
          <div><label style={lbl}>Fazenda</label><MultiSelectDropdown opcoes={opcoes.fazendas} selecionados={new Set(cfg.fazendas)} onChange={s => setCfg({ fazendas: [...s] })} textoTodos="Todas" largura="100%" /></div>
          <div><label style={lbl}>Área</label><MultiSelectDropdown opcoes={[{ v: "operacional", label: "Fazenda (operacional)" }, { v: "administrativo", label: "Administrativo" }]} selecionados={new Set(cfg.areas)} onChange={s => setCfg({ areas: [...s] })} textoTodos="Todas" largura="100%" /></div>
          <div><label style={lbl}>Funcionário</label><MultiSelectDropdown opcoes={opcoes.funcionarios} selecionados={new Set(cfg.funcionarios)} onChange={s => setCfg({ funcionarios: [...s] })} textoTodos="Todos" largura="100%" buscavel placeholderBusca="Pesquisar funcionário…" /></div>
        </div>
        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, marginBottom: 14, cursor: "pointer" }}>
          <input type="checkbox" checked={cfg.soFechadas} style={{ accentColor: "#1A4870" }} onChange={e => setCfg({ soFechadas: e.target.checked })} /> Só folhas fechadas (deixa de fora as folhas em rascunho)
        </label>

        <div style={{ marginBottom: 12 }}>
          <label style={lbl}>Formato</label>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 18 }}>
            {([["quadro_mod", "Quadro — modalidades em colunas"], ["quadro_mes", "Quadro — meses em colunas"], ["lista", "Lista detalhada (um lançamento por linha)"]] as const).map(([v, rot]) => (
              <label key={v} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, cursor: "pointer" }}><input type="radio" name="folhaFormato" checked={cfg.formato === v} onChange={() => setCfg({ formato: v })} style={{ accentColor: "#1A4870" }} />{rot}</label>
            ))}
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: cfg.formato === "lista" ? "1fr 1fr" : "1fr", gap: 12, marginBottom: 14 }}>
          {cfg.formato === "lista" && (
            <div>
              <label style={lbl}>Colunas — o que aparece (↑ ↓ para a ordem)</label>
              {listaOrdenavel(COLUNAS_LISTA.map(c => ({ id: c.id, rotulo: c.rotulo })), cfg.colunas, a => setCfg({ colunas: a }))}
              {!cfg.colunas.length && <div style={{ fontSize: 11, color: "#B91C1C", marginTop: 4 }}>Marque ao menos uma coluna.</div>}
            </div>
          )}
          <div>
            <label style={lbl}>{cfg.formato === "lista" ? "Agrupamento (o 1º é o nível principal; sem nenhum = lista simples)" : "Linhas do quadro (o último nível vira a linha; os de cima viram grupos com subtotal)"}</label>
            {listaOrdenavel(NIVEIS.filter(n => !(cfg.formato === "quadro_mod" && n.id === "modalidade") && !(cfg.formato === "quadro_mes" && n.id === "competencia")), cfg.niveis, a => setCfg({ niveis: a }), i => `${i + 1}º nível — `)}
            {cfg.formato !== "lista" && !cfg.niveis.length && <div style={{ fontSize: 11, color: "var(--text-3)", marginTop: 4 }}>Sem nível marcado, o quadro sai por funcionário.</div>}
          </div>
        </div>

        <div style={{ marginBottom: 16 }}>
          <label style={lbl}>Emissão</label>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 18 }}>
            {([["pdf", "PDF (abre para imprimir)"], ["xlsx", "XLSX (baixa o arquivo)"], ["tela", "Ver na tela"]] as const).map(([v, rot]) => (
              <label key={v} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, cursor: "pointer" }}><input type="radio" name="folhaEmissao" checked={emissao === v} onChange={() => setEmissao(v)} style={{ accentColor: "#1A4870" }} />{rot}</label>
            ))}
          </div>
        </div>

        {erro && <div style={{ padding: 10, background: "#FEF2F2", color: "#B91C1C", borderRadius: 8, fontSize: 12, marginBottom: 10 }}>{erro}</div>}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <button type="button" onClick={() => setCfg({ ...PADRAO, de: cfg.de, ate: cfg.ate })} style={{ background: "none", border: "none", color: "var(--text-2)", fontSize: 12, textDecoration: "underline", cursor: "pointer" }}>Limpar tudo</button>
          <span style={{ fontSize: 11, color: "var(--text-3)" }}>{carregando ? "Carregando o período…" : dados?.chave === chaveDados ? `${qtdFiltrada} lançamento(s) com esses filtros` : ""}</span>
          <div style={{ display: "flex", gap: 8 }}>
            <OperationalButton data-arato-button="secondary" onClick={() => setPopup(false)} style={{ ...inp, background: "var(--bg-card)", cursor: "pointer" }}>Cancelar</OperationalButton>
            <OperationalButton data-arato-button="primary" disabled={carregando || !cfg.modalidades.length || !cfg.origens.length || (cfg.formato === "lista" && !cfg.colunas.length)} onClick={gerar}
              style={{ background: "#1A4870", color: "#fff", border: "none", borderRadius: 8, padding: "8px 18px", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>Gerar relatório</OperationalButton>
          </div>
        </div>
      </div>
    </div>
  );

  // ─── Tela ─────────────────────────────────────────────────────
  if (naTela) {
    const t = naTela.tabela;
    return (
      <div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 8 }}>
          <button type="button" onClick={() => setNaTela(null)} style={{ background: "none", border: "none", color: "var(--text-2)", fontSize: 12, textDecoration: "underline", cursor: "pointer" }}>← Voltar</button>
          <div style={{ flex: "1 1 260px" }}>
            <div style={{ fontSize: 15, fontWeight: 600, color: "#0B2D50" }}>Relatório da Folha — {tituloRel(naTela.cfg)}</div>
            <div style={{ fontSize: 11, color: "var(--text-3)" }}>{filtrosTexto(naTela.cfg).filter(f => f.valor !== "Todos" && f.valor !== "Todas").map(f => `${f.rotulo}: ${f.valor}`).join(" · ")}</div>
          </div>
          <OperationalButton data-arato-button="secondary" onClick={() => setPopup(true)} style={{ ...inp, cursor: "pointer", color: "#1A4870" }}>🔍 Alterar filtro</OperationalButton>
          <OperationalButton data-arato-button="secondary" onClick={() => pdf(t, naTela.cfg)} style={{ ...inp, cursor: "pointer", color: "#1A4870" }}>🖨 PDF</OperationalButton>
          <OperationalButton data-arato-button="secondary" onClick={() => xlsx(t, naTela.cfg)} style={{ ...inp, cursor: "pointer", color: "#1A4870" }}>⬇ XLSX</OperationalButton>
        </div>
        <div style={{ background: "#fff", border: "0.5px solid #DDE2EE", borderRadius: 12, overflow: "auto", maxHeight: "72vh" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead><tr>{t.colunas.map((c, i) => <th key={i} style={{ padding: "7px 8px", fontSize: 11, fontWeight: 600, color: "var(--text-2)", whiteSpace: "nowrap", borderBottom: "0.5px solid var(--border-table)", background: "var(--bg-page)", position: "sticky", top: 0, textAlign: c.tipo === "texto" ? "left" : "right" }}>{c.rot}</th>)}</tr></thead>
            <tbody>
              {t.linhas.map((l, li) => (
                <tr key={li} style={{ background: l.tipo === "grupo" ? (l.nivel ? "#F7F9FC" : "#EEF4FB") : l.tipo === "total" ? "#D5E8F5" : l.tipo === "subtotal" ? "#FAFBFD" : undefined }}>
                  {l.cels.map((v, i) => (
                    <td key={i} style={{ padding: "6px 8px", fontSize: 12, borderBottom: "0.5px solid var(--border-row)", fontVariantNumeric: "tabular-nums", whiteSpace: t.colunas[i].tipo === "texto" && i > 0 ? "normal" : "nowrap",
                      textAlign: t.colunas[i].tipo === "texto" ? "left" : "right", paddingLeft: i === 0 && l.nivel ? 8 + l.nivel * 14 : 8,
                      fontWeight: l.tipo ? 600 : 400, color: l.tipo === "grupo" ? "#0B2D50" : typeof v === "number" && v < 0 ? "#B91C1C" : "var(--text-1)" }}>
                      {typeof v === "number" && v === 0 && !l.tipo ? <span style={{ color: "#bbb" }}>—</span> : fmtCel(v, t.colunas[i].tipo)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div style={{ fontSize: 11, color: "var(--text-3)", marginTop: 8 }}>Descontos aparecem com valor negativo. 13º entra no mês do vencimento de cada parcela lançada; rescisões no mês do desligamento; gratificação em título próprio no mês de referência.</div>
        {janela}
      </div>
    );
  }

  return (
    <div style={{ background: "var(--bg-card)", border: "0.5px solid var(--border-table)", borderRadius: 12, padding: "28px 24px", textAlign: "center" }}>
      <div style={{ fontSize: 15, fontWeight: 600, color: "var(--text-1)", marginBottom: 6 }}>Relatório da Folha de Pagamento</div>
      <div style={{ fontSize: 12, color: "var(--text-2)", maxWidth: 620, margin: "0 auto 16px", lineHeight: 1.5 }}>
        Um relatório só, com tudo o que a folha guarda: salário, gratificações, horas extras, DSR, complemento, benefícios, descontos, encargos, 13º, rescisões e adiantamentos.
        Escolha as modalidades e as origens em qualquer combinação, o período, empregador, fazenda e funcionário, o formato e o agrupamento. Ao confirmar, sai em PDF, Excel ou na tela.
      </div>
      <OperationalButton data-arato-button="primary" onClick={() => { setErro(""); setPopup(true); }} style={{ background: "#1A4870", color: "#fff", border: "none", borderRadius: 8, padding: "9px 20px", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>🔍 Abrir filtro e gerar</OperationalButton>
      {janela}
    </div>
  );
}
