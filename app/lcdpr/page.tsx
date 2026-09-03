"use client";
import { useState, useEffect, useMemo, useRef } from "react";
import TopNav from "../../components/TopNav";
import InputNumerico from "../../components/InputNumerico";
import { useAuth } from "../../components/AuthProvider";
import {
  listarLancamentos,
  listarOperacoesGerenciaisAtivasDaConta,
  atualizarOperacaoGerencial,
  listarProdutoresDaConta,
} from "../../lib/db";
import type { Lancamento, OperacaoGerencial } from "../../lib/supabase";
import { createBrowserClient } from "@supabase/ssr";
import PlanoGate from "../../components/PlanoGate";

// ─── Códigos LCDPR — IN RFB nº 1.848/2018, Leiaute 3 ────────────────────────

const CODIGOS_LCDPR = {
  receita: [
    { cod: "101", desc: "Venda de produto rural" },
    { cod: "102", desc: "Prestação de serviços rurais" },
    { cod: "103", desc: "Recursos de financiamento rural recebidos" },
    { cod: "104", desc: "Ressarcimento/restituição/compensação do ITR" },
    { cod: "199", desc: "Outras receitas rurais" },
  ],
  despesa: [
    { cod: "201", desc: "Custeio da atividade rural" },
    { cod: "202", desc: "Investimento na atividade rural" },
    { cod: "203", desc: "Amortização de financiamento rural" },
    { cod: "204", desc: "Pagamento do ITR" },
    { cod: "205", desc: "Outros tributos e taxas" },
    { cod: "299", desc: "Outras despesas rurais" },
  ],
} as const;

const TODOS_CODIGOS = [...CODIGOS_LCDPR.receita, ...CODIGOS_LCDPR.despesa] as { cod: string; desc: string }[];
const MAP_CODIGO    = new Map<string, string>(TODOS_CODIGOS.map(c => [c.cod, c.desc]));

// Tipos de documento LC20 — códigos oficiais (2 dígitos)
const TIPO_DOC_LABEL: Record<string, string> = {
  "01": "NF / NF-e", "02": "Recibo", "03": "Folha de Pagamento",
  "04": "DARF / GPS", "05": "Extrato", "06": "Contrato", "07": "Outros",
};
function mapTipoDoc(s: string): string {
  const l = (s ?? "").toLowerCase();
  if (l.includes("nf") || l.includes("nota fiscal")) return "01";
  if (l.includes("recibo"))   return "02";
  if (l.includes("folha"))    return "03";
  if (l.includes("darf") || l.includes("gps") || l.includes("dare")) return "04";
  if (l.includes("extrato"))  return "05";
  if (l.includes("contrato")) return "06";
  return "07";
}

// Inferência de código por texto — fallback quando OG não tem codigo_lcdpr
const MAPA_CAT: [string, string][] = [
  ["venda", "101"], ["grão", "101"], ["soja", "101"], ["milho", "101"], ["algodão", "101"], ["cereal", "101"],
  ["prestação de serviço", "102"], ["serviço rural", "102"],
  ["financiamento", "103"], ["recurso financi", "103"], ["pgto financiamento", "103"],
  ["itr", "104"],
  ["insumo", "201"], ["semente", "201"], ["fertilizante", "201"], ["defensivo", "201"],
  ["mão de obra", "201"], ["frete", "201"], ["arrendamento", "201"], ["custeio", "201"],
  ["máquina", "202"], ["investimento", "202"], ["equipamento", "202"], ["trator", "202"],
  ["amortização", "203"], ["parcela", "203"],
  ["imposto", "205"], ["taxa", "205"], ["tributo", "205"],
];
function inferirCodigo(l: Lancamento): { cod: string; auto: boolean } {
  const txt = ((l.categoria ?? "") + " " + (l.descricao ?? "")).toLowerCase();
  for (const [kw, cod] of MAPA_CAT) {
    if (txt.includes(kw)) return { cod, auto: true };
  }
  return { cod: l.tipo === "receber" ? "199" : "299", auto: true };
}

// ─── Interfaces ──────────────────────────────────────────────────────────────

interface ConfigLCDPR {
  participacoes: Record<string, number>;   // cpf_numerico → % (0-100)
  saldos_iniciais: Record<string, number>; // "AAAA" → R$
}
const CONFIG_VAZIA: ConfigLCDPR = { participacoes: {}, saldos_iniciais: {} };

interface EntradaLCDPR {
  id: string;
  data: string;
  historico: string;
  tipoDoc: string;      // "01"–"07"
  cpfCnpj: string;
  codigo: string;
  codigoAuto: boolean;  // true = inferido (OG sem código configurado)
  receita: number;
  despesa: number;
  origem: "auto" | "manual" | "importado";
  lancId?: string;
}

interface ProdutorLcdpr { id: string; nome: string; cpf: string; }

interface FazLcdpr {
  id: string; nome: string;
  produtor_id: string | null;
  cpf_cnpj_fiscal: string | null;
  nirf: string | null; municipio: string | null;
  uf: string | null; area_total_ha: number | null;
}

interface ImportRow {
  data: string; historico: string; tipoDoc: string;
  cpfCnpj: string; codigo: string; receita: number; despesa: number;
  _status: "ok" | "erro"; _msg: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const anoAtual = new Date().getFullYear();
const ANOS     = [anoAtual - 2, anoAtual - 1, anoAtual, anoAtual + 1];
const fmtBRL   = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fmtData  = (s: string) => { const [y, m, d] = (s ?? "").split("-"); return `${d}/${m}/${y}`; };
const cpfNum   = (s: string) => (s ?? "").replace(/\D/g, "");
const hoje     = () => new Date().toISOString().split("T")[0];
const fmtCPF   = (s: string) => s.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
const getSb    = () => createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);

type Aba = "livro" | "participacoes" | "plano" | "importacao" | "exportacao";

// ═════════════════════════════════════════════════════════════════════════════
export default function LCDPR() {
  const { fazendaId, fazendaIds, contaId, podeAcessarPlano } = useAuth();

  const [aba, setAba]         = useState<Aba>("livro");
  const [anoSel, setAnoSel]   = useState(anoAtual);
  const [loading, setLoading] = useState(true);
  const [entradas, setEntradas] = useState<EntradaLCDPR[]>([]);

  const [config, setConfig]       = useState<ConfigLCDPR>(CONFIG_VAZIA);
  const [savingCfg, setSavingCfg] = useState(false);

  const [ogs, setOgs]                     = useState<OperacaoGerencial[]>([]);
  const [ogMap, setOgMap]                 = useState<Map<string, OperacaoGerencial>>(new Map());
  const [ogEditCodigos, setOgEditCodigos] = useState<Map<string, string | null>>(new Map());
  const [savingOgIds, setSavingOgIds]     = useState<Set<string>>(new Set());
  const [expandidos, setExpandidos]       = useState<Set<string>>(new Set(["semcod"]));
  const [fazDados, setFazDados]           = useState<FazLcdpr[]>([]);
  const [produtoresDados, setProdutoresDados] = useState<ProdutorLcdpr[]>([]);

  const [modalManual, setModalManual] = useState(false);
  const [fManual, setFManual] = useState({
    data: hoje(), historico: "", tipoDoc: "07", cpfCnpj: "",
    codigo: "101", valor: 0, tipo: "receita" as "receita" | "despesa",
  });

  const importRef = useRef<HTMLInputElement>(null);
  const [importRows, setImportRows]         = useState<ImportRow[]>([]);
  const [importLoading, setImportLoading]   = useState(false);
  const [importFeedback, setImportFeedback] = useState("");

  const [produtorFiltro, setProdutorFiltro] = useState("todos");
  const [modoExport, setModoExport]         = useState<"anual" | "mensal">("anual");
  const [mesExport, setMesExport]           = useState(new Date().getMonth() + 1);

  // ── Carga principal ────────────────────────────────────────────────────────
  useEffect(() => {
    const ids = fazendaIds?.length ? fazendaIds : fazendaId ? [fazendaId] : [];
    if (!ids.length) return;
    setLoading(true);
    const sb = getSb();

    Promise.all([
      Promise.all(ids.map(fid => listarLancamentos(fid))).then(all => all.flat()),
      sb.from("apoio_baixas").select("lancamento_id").in("fazenda_id", ids),
      listarOperacoesGerenciaisAtivasDaConta(undefined, fazendaId),
      sb.from("fazendas").select("id,nome,produtor_id,cpf_cnpj_fiscal,nirf,municipio,uf,area_total_ha").in("id", ids),
      contaId ? listarProdutoresDaConta(contaId) : Promise.resolve([]),
      fazendaId
        ? sb.from("configuracoes_modulo").select("config").eq("fazenda_id", fazendaId).eq("modulo", "lcdpr").maybeSingle()
        : Promise.resolve({ data: null }),
    ]).then(([lans, { data: apoioBaixas }, ogsData, { data: fazRows }, prodRows, { data: cfgRow }]) => {
      setFazDados((fazRows ?? []) as FazLcdpr[]);
      setProdutoresDados(
        (prodRows ?? [])
          .map((p: any) => ({ id: p.id, nome: p.nome, cpf: cpfNum(p.cpf_cnpj ?? "") }))
          .filter((p: ProdutorLcdpr) => p.cpf.length === 11)
      );
      setConfig((cfgRow as any)?.config ?? CONFIG_VAZIA);
      setOgs(ogsData);
      const map = new Map(ogsData.map((og: OperacaoGerencial) => [og.id, og]));
      setOgMap(map);
      setOgEditCodigos(new Map(ogsData.map((og: OperacaoGerencial) => [og.id, og.codigo_lcdpr ?? null])));

      const apoioIds = new Set((apoioBaixas ?? []).map((b: any) => b.lancamento_id));

      const filtrados = lans.filter((l: Lancamento) => {
        if (l.status !== "baixado") return false;
        if (apoioIds.has(l.id)) return false;
        if ((l as any).entidade_contabil && (l as any).entidade_contabil !== "pf") return false;
        const dt = (l as any).data_baixa ?? l.data_vencimento ?? l.data_lancamento ?? "";
        return dt.slice(0, 4) === String(anoSel);
      });

      const items: EntradaLCDPR[] = filtrados.map((l: Lancamento) => {
        const og = l.operacao_gerencial_id ? map.get(l.operacao_gerencial_id) : undefined;
        const { cod, auto } = og?.codigo_lcdpr
          ? { cod: og.codigo_lcdpr, auto: false }
          : inferirCodigo(l);
        return {
          id: l.id,
          data: (l as any).data_baixa ?? l.data_vencimento ?? l.data_lancamento ?? "",
          historico: l.descricao ?? (l as any).categoria ?? "",
          tipoDoc: mapTipoDoc((l as any).tipo_documento_lcdpr ?? ""),
          cpfCnpj: (l as any).cpf_cnpj ?? "",
          codigo: cod, codigoAuto: auto,
          receita: l.tipo === "receber" ? ((l as any).valor_pago ?? l.valor ?? 0) : 0,
          despesa: l.tipo === "pagar"   ? ((l as any).valor_pago ?? l.valor ?? 0) : 0,
          origem: "auto", lancId: l.id,
        };
      });
      items.sort((a, b) => a.data.localeCompare(b.data));
      setEntradas(items);
    }).finally(() => setLoading(false));
  }, [fazendaId, fazendaIds?.join(","), contaId, anoSel]);

  // ── Persistência da configuração ──────────────────────────────────────────
  const salvarConfig = async (nova: ConfigLCDPR) => {
    setConfig(nova); // optimistic
    if (!fazendaId) return;
    setSavingCfg(true);
    try {
      await getSb().from("configuracoes_modulo").upsert(
        { fazenda_id: fazendaId, modulo: "lcdpr", config: nova },
        { onConflict: "fazenda_id,modulo" }
      );
    } finally {
      setSavingCfg(false);
    }
  };

  // ── Computados ────────────────────────────────────────────────────────────
  const saldoInicial  = config.saldos_iniciais[String(anoSel)] ?? 0;
  const totalReceitas = entradas.reduce((s, e) => s + e.receita, 0);
  const totalDespesas = entradas.reduce((s, e) => s + e.despesa, 0);
  const saldoFinal    = saldoInicial + totalReceitas - totalDespesas;
  const semCodigoCount = entradas.filter(e => e.codigoAuto).length;

  const produtoresLcdpr = useMemo<ProdutorLcdpr[]>(() => {
    const m = new Map<string, string>();
    for (const p of produtoresDados) if (!m.has(p.cpf)) m.set(p.cpf, p.nome);
    for (const f of fazDados) {
      const c = cpfNum(f.cpf_cnpj_fiscal ?? "");
      if (c.length === 11 && !m.has(c)) m.set(c, f.nome);
    }
    return Array.from(m.entries()).map(([cpf, nome]) => ({ id: cpf, cpf, nome }));
  }, [produtoresDados, fazDados]);

  const participacaoSel = produtorFiltro !== "todos"
    ? (config.participacoes[produtorFiltro] ?? 100)
    : 100;
  const fator = participacaoSel / 100;

  const entradasExport = useMemo(() => {
    let e = entradas;
    if (modoExport === "mensal") {
      const mm = String(mesExport).padStart(2, "0");
      e = e.filter(x => x.data.slice(0, 7) === `${anoSel}-${mm}`);
    }
    if (produtorFiltro !== "todos" && fator !== 1)
      e = e.map(x => ({ ...x, receita: x.receita * fator, despesa: x.despesa * fator }));
    return e;
  }, [entradas, modoExport, mesExport, anoSel, produtorFiltro, fator]);

  const saldoInicialExport = saldoInicial * fator;

  const ogsPorCodigo = useMemo(() => {
    const g = new Map<string | null, OperacaoGerencial[]>();
    TODOS_CODIGOS.forEach(c => g.set(c.cod, []));
    g.set(null, []);
    for (const og of ogs) {
      const cod = og.codigo_lcdpr ?? null;
      const lista = g.get(cod);
      if (lista !== undefined) lista.push(og); else g.get(null)!.push(og);
    }
    return g;
  }, [ogs]);

  const ogsTotal    = ogs.length;
  const ogsMapeadas = ogs.filter(o => o.codigo_lcdpr).length;

  const mesesResumo = Array.from({ length: 12 }, (_, i) => {
    const mm  = String(i + 1).padStart(2, "0");
    const its = entradas.filter(e => e.data.slice(5, 7) === mm);
    return {
      mes:  new Date(`${anoSel}-${mm}-01`).toLocaleString("pt-BR", { month: "long" }),
      rec:  its.reduce((s, e) => s + e.receita, 0),
      desp: its.reduce((s, e) => s + e.despesa, 0),
    };
  });

  // ── Ações ─────────────────────────────────────────────────────────────────
  const toggleExpandido = (k: string) => setExpandidos(prev => {
    const n = new Set(prev); n.has(k) ? n.delete(k) : n.add(k); return n;
  });

  const adicionarManual = () => {
    if (!fManual.valor || !fManual.historico) return;
    const nova: EntradaLCDPR = {
      id: `manual-${Date.now()}`, data: fManual.data, historico: fManual.historico,
      tipoDoc: fManual.tipoDoc, cpfCnpj: fManual.cpfCnpj,
      codigo: fManual.codigo, codigoAuto: false,
      receita: fManual.tipo === "receita" ? fManual.valor : 0,
      despesa: fManual.tipo === "despesa" ? fManual.valor : 0,
      origem: "manual",
    };
    setEntradas(prev => [...prev, nova].sort((a, b) => a.data.localeCompare(b.data)));
    setModalManual(false);
    setFManual({ data: hoje(), historico: "", tipoDoc: "07", cpfCnpj: "", codigo: "101", valor: 0, tipo: "receita" });
  };

  const removerLancamento  = (id: string) => setEntradas(prev => prev.filter(e => e.id !== id));
  const atualizarTipoDoc   = (id: string, tipoDoc: string) =>
    setEntradas(prev => prev.map(e => e.id === id ? { ...e, tipoDoc } : e));

  const salvarCodigoOG = async (ogId: string, codigo: string | null) => {
    setSavingOgIds(prev => new Set(prev).add(ogId));
    try {
      await atualizarOperacaoGerencial(ogId, { codigo_lcdpr: codigo } as Partial<OperacaoGerencial>);
      const upd = (og: OperacaoGerencial) => og.id === ogId ? { ...og, codigo_lcdpr: codigo ?? undefined } : og;
      setOgMap(prev => { const n = new Map(prev); const o = n.get(ogId); if (o) n.set(ogId, upd(o)); return n; });
      setOgs(prev => prev.map(upd));
    } finally {
      setSavingOgIds(prev => { const n = new Set(prev); n.delete(ogId); return n; });
    }
  };

  // ── Importação XLS/CSV ────────────────────────────────────────────────────
  const handleImportFile = async (file: File) => {
    setImportLoading(true); setImportFeedback("");
    try {
      const XLSX = await import("xlsx");
      const wb   = XLSX.read(await file.arrayBuffer());
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[wb.SheetNames[0]], { defval: "" });
      const parsed: ImportRow[] = rows.map(r => {
        const g = (...keys: string[]) => keys.reduce<string>((a, k) => a || String(r[k] ?? ""), "").trim();
        const dataRaw = g("Data", "data");
        const hist    = g("Histórico", "Historico", "historico", "Descrição", "descricao");
        const docRaw  = g("Documento", "documento") || "07";
        const cpf     = g("CPF/CNPJ", "cpf_cnpj");
        const codRaw  = g("Código LCDPR", "Codigo LCDPR", "codigo");
        const tipoRaw = g("Tipo", "tipo").toLowerCase();
        const valRaw  = parseFloat(g("Valor", "valor").replace(/\./g, "").replace(",", ".")) || 0;
        const erros: string[] = [];
        if (!hist) erros.push("Histórico obrigatório");
        let dataIso = dataRaw;
        if (dataRaw.includes("/")) {
          const p = dataRaw.split("/");
          if (p.length === 3) dataIso = `${p[2].length === 4 ? p[2] : `20${p[2]}`}-${p[1].padStart(2,"0")}-${p[0].padStart(2,"0")}`;
        }
        if (!/^\d{4}-\d{2}-\d{2}$/.test(dataIso)) erros.push("Data inválida (DD/MM/AAAA)");
        const isR   = tipoRaw.startsWith("r");
        const cod   = codRaw && MAP_CODIGO.has(codRaw) ? codRaw : (isR ? "199" : "299");
        if (codRaw && !MAP_CODIGO.has(codRaw)) erros.push(`Código "${codRaw}" inválido`);
        return {
          data: dataIso, historico: hist, tipoDoc: mapTipoDoc(docRaw), cpfCnpj: cpf,
          codigo: cod, receita: isR ? valRaw : 0, despesa: isR ? 0 : valRaw,
          _status: erros.length ? "erro" : "ok" as "ok" | "erro", _msg: erros.join("; "),
        };
      });
      setImportRows(parsed);
    } catch { setImportFeedback("Erro ao ler o arquivo. Use o modelo fornecido."); }
    finally { setImportLoading(false); }
  };

  const confirmarImport = () => {
    const validas = importRows.filter(r => r._status === "ok");
    const novas: EntradaLCDPR[] = validas.map((r, i) => ({
      id: `imp-${Date.now()}-${i}`, data: r.data, historico: r.historico,
      tipoDoc: r.tipoDoc, cpfCnpj: r.cpfCnpj, codigo: r.codigo, codigoAuto: false,
      receita: r.receita, despesa: r.despesa, origem: "importado",
    }));
    setEntradas(prev => [...prev, ...novas].sort((a, b) => a.data.localeCompare(b.data)));
    setImportRows([]);
    setImportFeedback(`✓ ${validas.length} lançamento${validas.length !== 1 ? "s" : ""} adicionados.`);
    setAba("livro");
  };

  const baixarModelo = async () => {
    const XLSX = await import("xlsx");
    const dados = [
      ["Data", "Histórico", "Documento", "CPF/CNPJ", "Código LCDPR", "Tipo", "Valor"],
      ["15/03/2025", "Venda de soja — Bunge S.A.", "NF-e", "03.755.877/0001-00", "101", "Receita", "185000,00"],
      ["20/03/2025", "Adubo NPK 20-05-20 — COP", "NF-e", "04.803.396/0001-44", "201", "Despesa", "42000,00"],
    ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(dados), "Modelo LCDPR");
    XLSX.writeFile(wb, "Modelo_LCDPR.xlsx");
  };

  // ── Geração do arquivo .txt (Leiaute 3) ───────────────────────────────────
  const gerarLCDPR = () => {
    const dtFmt = (iso: string) => {
      if (!iso || iso.length < 10) return "00000000";
      const [y, m, d] = iso.split("-"); return `${d}${m}${y}`;
    };
    const mm    = String(mesExport).padStart(2, "0");
    const dtIni = modoExport === "anual" ? `0101${anoSel}` : `01${mm}${anoSel}`;
    const last  = new Date(anoSel, mesExport, 0).getDate();
    const dtFim = modoExport === "anual" ? `3112${anoSel}` : `${String(last).padStart(2,"0")}${mm}${anoSel}`;

    const cpfSel   = produtorFiltro !== "todos" ? produtorFiltro : (produtoresLcdpr[0]?.cpf ?? "");
    const nomeProd = (produtoresLcdpr.find(p => p.cpf === cpfSel)?.nome ?? "PRODUTOR RURAL").toUpperCase();

    const idsComCpf = new Set(produtoresDados.filter(p => p.cpf === cpfSel).map(p => p.id));
    const fazsFiltradas = produtorFiltro !== "todos"
      ? fazDados.filter(f => cpfNum(f.cpf_cnpj_fiscal ?? "") === cpfSel || (f.produtor_id && idsComCpf.has(f.produtor_id)))
      : fazDados;
    const fazsLC10  = fazsFiltradas.length > 0 ? fazsFiltradas : fazDados;
    const municipio = (fazsLC10[0]?.municipio ?? "").toUpperCase();
    const uf        = (fazsLC10[0]?.uf ?? "").toUpperCase();

    // Bloco 0
    const b0: string[] = [
      `|0000|LCDPR|0003|${dtIni}|${dtFim}|${cpfSel}|${nomeProd}|${municipio}|${uf}|N||Arato RacTech|3.0.0|`,
      `|0001|0|`,
      `|0010|${cpfSel}|${nomeProd}|${anoSel}|`,
    ];
    b0.push(`|0990|${b0.length + 1}|`);

    // Bloco LC
    const bLC: string[] = [`|LC01|0|`];
    for (const f of fazsLC10) {
      const area = (f.area_total_ha ?? 0).toFixed(2).replace(".", ",");
      bLC.push(`|LC10|1|${f.nirf ?? ""}||${f.nome.toUpperCase()}|${(f.municipio ?? "").toUpperCase()}|${(f.uf ?? "").toUpperCase()}|${area}|||${cpfSel}||`);
    }
    for (const e of entradasExport) {
      const hist   = e.historico.slice(0, 60).toUpperCase().replace(/\|/g, " ");
      const cpfDoc = cpfNum(e.cpfCnpj);
      bLC.push(`|LC20|${dtFmt(e.data)}|${e.codigo}|${hist}|${e.tipoDoc}|${cpfDoc}|${e.receita.toFixed(2).replace(".", ",")}|${e.despesa.toFixed(2).replace(".", ",")}|`);
    }
    bLC.push(`|LC99|${bLC.length + 1}|`);

    // Bloco 9
    const b9: string[] = [`|9001|0|`];
    b9.push(`|9990|${b9.length + 1}|`);
    b9.push(`|9999|${b0.length + bLC.length + b9.length + 1}|`);

    const content = [...b0, ...bLC, ...b9].join("\r\n");
    const blob = new Blob(["﻿" + content], { type: "text/plain;charset=utf-8" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    const nomeArq = nomeProd.replace(/[^A-Z0-9 ]/g, "").trim();
    const comp    = modoExport === "mensal" ? `COMP ${mm}-${anoSel}` : `COMP ${anoSel}`;
    a.href = url; a.download = `LCDPR_${nomeArq}_${cpfSel || "TODOS"}_${comp}.txt`;
    a.click(); URL.revokeObjectURL(url);
  };

  // ── Helper: tabela de OGs ─────────────────────────────────────────────────
  const renderOgTable = (lista: OperacaoGerencial[]) => (
    <table style={{ width: "100%", borderCollapse: "collapse" }}>
      <tbody>
        {lista.map(og => {
          const codAtual = og.codigo_lcdpr ?? null;
          const codEdit  = ogEditCodigos.get(og.id) ?? null;
          const mudou    = codEdit !== codAtual;
          return (
            <tr key={og.id} style={{ borderTop: "0.5px solid var(--border-row)" }}>
              <td style={{ padding: "8px 14px", width: 130, color: "var(--text-2)", fontSize: 11 }}>{og.classificacao}</td>
              <td style={{ padding: "8px 14px", color: "var(--text-1)" }}>{og.descricao}</td>
              <td style={{ padding: "8px 14px", width: 240 }}>
                <select value={codEdit ?? ""}
                  onChange={e => setOgEditCodigos(prev => new Map(prev).set(og.id, e.target.value || null))}
                  style={{ width: "100%", padding: "5px 8px", border: `0.5px solid ${mudou ? "#C9921B" : "var(--border-table)"}`, borderRadius: 6, fontSize: 12, color: "var(--text-1)", background: mudou ? "#FFFDF5" : "var(--bg-input)" }}>
                  <option value="">— não incluir no LCDPR —</option>
                  <optgroup label="Receitas (101–199)">
                    {CODIGOS_LCDPR.receita.map(c => <option key={c.cod} value={c.cod}>{c.cod} — {c.desc}</option>)}
                  </optgroup>
                  <optgroup label="Despesas (201–299)">
                    {CODIGOS_LCDPR.despesa.map(c => <option key={c.cod} value={c.cod}>{c.cod} — {c.desc}</option>)}
                  </optgroup>
                </select>
              </td>
              <td style={{ padding: "8px 10px", width: 80, textAlign: "center" }}>
                {mudou && (
                  <button onClick={() => salvarCodigoOG(og.id, ogEditCodigos.get(og.id) ?? null)}
                    disabled={savingOgIds.has(og.id)}
                    style={{ padding: "4px 12px", background: "#1A5C38", color: "#fff", border: "none", borderRadius: 6, fontWeight: 600, cursor: "pointer", fontSize: 11 }}>
                    {savingOgIds.has(og.id) ? "…" : "Salvar"}
                  </button>
                )}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );

  // ─────────────────────────────────────────────────────────────────────────
  const inpS: React.CSSProperties = { width: "100%", padding: "8px 10px", border: "0.5px solid var(--border-table)", borderRadius: 8, fontSize: 13, color: "var(--text-1)", background: "var(--bg-input)", boxSizing: "border-box", outline: "none" };
  const lblS: React.CSSProperties = { fontSize: 11, color: "var(--text-2)", marginBottom: 4, display: "block" };

  if (!podeAcessarPlano("fiscal_sped")) return <PlanoGate modulo="fiscal_sped" />;

  // ═════════════════════════════════════════════════════════════════════════
  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh", background: "var(--bg-page)", fontFamily: "system-ui, sans-serif", fontSize: 13 }}>
      <TopNav />
      <main style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>

        {/* ── Cabeçalho ── */}
        <header style={{ background: "var(--bg-card)", borderBottom: "0.5px solid var(--border-table)", padding: "10px 22px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 17, fontWeight: 600, color: "var(--text-1)" }}>LCDPR — Livro Caixa Digital do Produtor Rural</h1>
            <p style={{ margin: 0, fontSize: 11, color: "var(--text-3)" }}>Regime de caixa · Pessoa Física · IN RFB nº 1.848/2018 · Leiaute 3</p>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <select value={anoSel} onChange={e => setAnoSel(Number(e.target.value))}
              style={{ padding: "6px 10px", border: "0.5px solid var(--border-table)", borderRadius: 8, fontSize: 13, color: "var(--text-1)", background: "var(--bg-card)", cursor: "pointer" }}>
              {ANOS.map(a => <option key={a}>{a}</option>)}
            </select>
            <button onClick={() => setModalManual(true)}
              style={{ padding: "8px 16px", background: "#C9921B", color: "#fff", border: "none", borderRadius: 8, fontWeight: 600, cursor: "pointer", fontSize: 13 }}>
              + Lançamento manual
            </button>
          </div>
        </header>

        <div style={{ padding: "16px 22px", flex: 1 }}>

          {/* ── KPI cards ── */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 10, marginBottom: 12 }}>
            {([
              { label: "Saldo Inicial",  val: saldoInicial,  cor: "var(--text-1)",                                            bg: "var(--bg-card)" },
              { label: "Total Receitas", val: totalReceitas, cor: "#1A5C38",                                                  bg: "#EAF3DE" },
              { label: "Total Despesas", val: totalDespesas, cor: "#E24B4A",                                                  bg: "#FCEBEB" },
              { label: "Saldo Final",    val: saldoFinal,    cor: saldoFinal >= 0 ? "#1A5C38" : "#E24B4A",                    bg: saldoFinal >= 0 ? "#EAF3DE" : "#FCEBEB" },
              { label: "Lançamentos",    val: entradas.length, cor: "var(--text-1)", bg: "var(--bg-card)", cnt: true },
            ] as any[]).map((c, i) => (
              <div key={i} style={{ background: c.bg, border: "0.5px solid var(--border-table)", borderRadius: 10, padding: "12px 14px" }}>
                <div style={{ fontSize: 11, color: "var(--text-2)", marginBottom: 4 }}>{c.label}</div>
                <div style={{ fontSize: 17, fontWeight: 700, color: c.cor }}>{c.cnt ? c.val : fmtBRL(c.val)}</div>
              </div>
            ))}
          </div>

          {/* ── Alerta: códigos inferidos ── */}
          {semCodigoCount > 0 && (
            <div style={{ background: "#FBF3E0", border: "0.5px solid #C9921B60", borderRadius: 8, padding: "8px 14px", marginBottom: 10, display: "flex", alignItems: "center", gap: 10, fontSize: 12 }}>
              <span>⚠</span>
              <span style={{ color: "#7A5A12" }}>
                <strong>{semCodigoCount}</strong> lançamento{semCodigoCount !== 1 ? "s usam" : " usa"} código inferido automaticamente (marcado com "≈").
                Para maior precisão, configure no{" "}
                <button onClick={() => setAba("plano")} style={{ background: "none", border: "none", color: "#C9921B", cursor: "pointer", fontWeight: 600, fontSize: 12, padding: 0, textDecoration: "underline" }}>Plano de Contas</button>.
              </span>
            </div>
          )}

          {/* ── Barra de info: prazo + saldo inicial ── */}
          <div style={{ background: "var(--bg-card)", border: "0.5px solid var(--border-table)", borderRadius: 8, padding: "8px 16px", marginBottom: 14, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, fontSize: 12 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ color: "var(--text-2)" }}>📅 Prazo de entrega:</span>
              <strong style={{ color: "var(--text-1)" }}>30/04/{anoSel + 1}</strong>
              <span style={{ color: "var(--text-3)", fontSize: 11 }}>(junto com a DIRPF — art. 5º IN RFB 1.848/2018)</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ color: "var(--text-2)" }}>Saldo em 01/01/{anoSel}:</span>
              <InputNumerico
                value={saldoInicial}
                onChange={v => salvarConfig({ ...config, saldos_iniciais: { ...config.saldos_iniciais, [String(anoSel)]: Number(v) } })}
                style={{ padding: "4px 8px", border: "0.5px solid var(--border-table)", borderRadius: 6, fontSize: 12, width: 130, color: "var(--text-1)" }}
              />
              {savingCfg && <span style={{ fontSize: 10, color: "#aaa" }}>salvando…</span>}
            </div>
          </div>

          {/* ── Abas ── */}
          <div style={{ background: "var(--bg-card)", border: "0.5px solid var(--border-table)", borderRadius: 12, overflow: "hidden" }}>
            <div style={{ display: "flex", borderBottom: "0.5px solid var(--border-table)", overflowX: "auto" }}>
              {([
                ["livro",         "Livro Caixa"],
                ["participacoes", "Produtores e Participações"],
                ["plano",         "Plano de Contas"],
                ["importacao",    "Importação"],
                ["exportacao",    "Exportação"],
              ] as [Aba, string][]).map(([k, lbl]) => (
                <button key={k} onClick={() => setAba(k)} style={{
                  padding: "10px 18px", border: "none",
                  background: aba === k ? "#fff" : "var(--bg-card)",
                  borderBottom: aba === k ? "2px solid #1A5C38" : "2px solid transparent",
                  cursor: "pointer", fontSize: 13, fontWeight: aba === k ? 600 : 400,
                  color: aba === k ? "#1A5C38" : "var(--text-2)", whiteSpace: "nowrap",
                }}>
                  {lbl}
                  {k === "plano" && ogsMapeadas < ogsTotal && ogsTotal > 0 && (
                    <span style={{ marginLeft: 6, fontSize: 10, background: "#FBF3E0", color: "#7A5A12", padding: "1px 5px", borderRadius: 4, fontWeight: 600 }}>{ogsTotal - ogsMapeadas}</span>
                  )}
                </button>
              ))}
            </div>

            {/* ═══ ABA: LIVRO CAIXA ═══ */}
            {aba === "livro" && (
              <div>
                {loading ? (
                  <div style={{ padding: 40, textAlign: "center", color: "var(--text-2)" }}>Carregando lançamentos…</div>
                ) : entradas.length === 0 ? (
                  <div style={{ padding: 48, textAlign: "center", color: "var(--text-2)" }}>
                    <div style={{ fontSize: 32, marginBottom: 8 }}>📋</div>
                    <div style={{ fontWeight: 600, color: "var(--text-1)", marginBottom: 4 }}>Nenhum lançamento baixado em {anoSel}</div>
                    <div style={{ fontSize: 12, color: "#666", lineHeight: 1.7 }}>
                      Lançamentos baixados no Financeiro com entidade PF aparecem aqui automaticamente.<br />
                      Verifique o ano ou use "+ Lançamento manual" para inserir dados históricos.
                    </div>
                  </div>
                ) : (
                  <div style={{ overflowX: "auto" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 880 }}>
                      <thead>
                        <tr style={{ background: "var(--bg-page)" }}>
                          {["Data", "Cód.", "Histórico", "Doc.", "CPF/CNPJ contraparte", "Receita", "Despesa", "Saldo", ""].map((h, i) => (
                            <th key={i} style={{ padding: "8px 12px", textAlign: i >= 5 && i <= 7 ? "right" : "left", fontSize: 11, fontWeight: 600, color: "var(--text-2)", borderBottom: "0.5px solid var(--border-table)", whiteSpace: "nowrap" }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {(() => {
                          let saldo = saldoInicial;
                          return entradas.map((e, i) => {
                            saldo += e.receita - e.despesa;
                            return (
                              <tr key={e.id} style={{ borderBottom: i < entradas.length - 1 ? "0.5px solid var(--border-row)" : "none", background: e.origem !== "auto" ? "#FFFDF5" : "transparent" }}>
                                <td style={{ padding: "8px 12px", whiteSpace: "nowrap", fontSize: 12 }}>{fmtData(e.data)}</td>
                                <td style={{ padding: "8px 12px" }}>
                                  <span title={MAP_CODIGO.get(e.codigo)} style={{
                                    fontSize: 10, padding: "2px 7px", borderRadius: 6, fontWeight: 600, cursor: "help",
                                    background: e.codigo.startsWith("1") ? "#EAF3DE" : "#FCEBEB",
                                    color: e.codigo.startsWith("1") ? "#1A5C38" : "#791F1F",
                                    outline: e.codigoAuto ? "1px dashed #C9921B" : "none",
                                  }}>
                                    {e.codigo}{e.codigoAuto ? " ≈" : ""}
                                  </span>
                                </td>
                                <td style={{ padding: "8px 12px", maxWidth: 260 }}>
                                  <div style={{ fontWeight: 500, color: "var(--text-1)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{e.historico}</div>
                                  <div style={{ fontSize: 10, color: "#999" }}>{MAP_CODIGO.get(e.codigo)}</div>
                                </td>
                                <td style={{ padding: "4px 8px" }}>
                                  <select
                                    value={e.tipoDoc}
                                    onChange={ev => atualizarTipoDoc(e.id, ev.target.value)}
                                    style={{ fontSize: 11, padding: "3px 5px", border: "0.5px solid var(--border-table)", borderRadius: 5, color: "var(--text-1)", background: "var(--bg-card)", maxWidth: 150 }}
                                  >
                                    <option value="01">01 — NF / NF-e</option>
                                    <option value="02">02 — Recibo</option>
                                    <option value="03">03 — Folha de Pagamento</option>
                                    <option value="04">04 — DARF / GPS</option>
                                    <option value="05">05 — Extrato</option>
                                    <option value="06">06 — Contrato</option>
                                    <option value="07">07 — Outros</option>
                                  </select>
                                </td>
                                <td style={{ padding: "8px 12px", fontSize: 11, color: "var(--text-2)", fontVariantNumeric: "tabular-nums" }}>{e.cpfCnpj || "—"}</td>
                                <td style={{ padding: "8px 12px", textAlign: "right", color: e.receita > 0 ? "#1A5C38" : "#ccc", fontWeight: e.receita > 0 ? 600 : 400, fontVariantNumeric: "tabular-nums" }}>
                                  {e.receita > 0 ? fmtBRL(e.receita) : "—"}
                                </td>
                                <td style={{ padding: "8px 12px", textAlign: "right", color: e.despesa > 0 ? "#E24B4A" : "#ccc", fontWeight: e.despesa > 0 ? 600 : 400, fontVariantNumeric: "tabular-nums" }}>
                                  {e.despesa > 0 ? fmtBRL(e.despesa) : "—"}
                                </td>
                                <td style={{ padding: "8px 12px", textAlign: "right", fontWeight: 600, fontVariantNumeric: "tabular-nums", color: saldo >= 0 ? "var(--text-1)" : "#E24B4A" }}>
                                  {fmtBRL(saldo)}
                                </td>
                                <td style={{ padding: "8px 6px", textAlign: "center" }}>
                                  {e.origem !== "auto" ? (
                                    <button onClick={() => removerLancamento(e.id)} style={{ fontSize: 11, padding: "2px 7px", borderRadius: 6, border: "0.5px solid #E24B4A50", background: "#FCEBEB", color: "#791F1F", cursor: "pointer" }}>✕</button>
                                  ) : (
                                    <span title="Originado de baixa financeira — não pode ser excluído" style={{ fontSize: 14, cursor: "default", opacity: 0.35 }}>🔒</span>
                                  )}
                                </td>
                              </tr>
                            );
                          });
                        })()}
                      </tbody>
                      <tfoot>
                        <tr style={{ background: "var(--bg-page)", borderTop: "1px solid var(--border-table)" }}>
                          <td colSpan={5} style={{ padding: "10px 12px", fontWeight: 700, color: "var(--text-1)" }}>TOTAL {anoSel}</td>
                          <td style={{ padding: "10px 12px", textAlign: "right", fontWeight: 700, color: "#1A5C38", fontVariantNumeric: "tabular-nums" }}>{fmtBRL(totalReceitas)}</td>
                          <td style={{ padding: "10px 12px", textAlign: "right", fontWeight: 700, color: "#E24B4A", fontVariantNumeric: "tabular-nums" }}>{fmtBRL(totalDespesas)}</td>
                          <td style={{ padding: "10px 12px", textAlign: "right", fontWeight: 700, fontVariantNumeric: "tabular-nums", color: saldoFinal >= 0 ? "#1A5C38" : "#E24B4A" }}>{fmtBRL(saldoFinal)}</td>
                          <td />
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                )}
              </div>
            )}

            {/* ═══ ABA: PRODUTORES E PARTICIPAÇÕES ═══ */}
            {aba === "participacoes" && (
              <div style={{ padding: 24 }}>
                <div style={{ maxWidth: 760 }}>
                  <div style={{ background: "#EEF4FF", border: "0.5px solid #93C5FD", borderRadius: 10, padding: "14px 18px", marginBottom: 20, fontSize: 12, color: "#1e40af", lineHeight: 1.75 }}>
                    <strong>Condomínio / Parceria Rural — IN RFB nº 1.848/2018, art. 4º</strong><br />
                    Quando o imóvel rural pertence a mais de um titular (condomínio, parceria, meação), cada co-titular
                    deve entregar seu próprio LCDPR com os valores <em>proporcionais à sua quota-parte</em>.
                    Configure abaixo o percentual de participação de cada CPF. Ao exportar para um produtor específico,
                    receitas, despesas e saldo inicial serão multiplicados pela sua participação.
                  </div>

                  {produtoresLcdpr.length === 0 ? (
                    <div style={{ textAlign: "center", padding: 40, color: "var(--text-2)", border: "0.5px solid var(--border-table)", borderRadius: 10 }}>
                      <div style={{ fontSize: 32, marginBottom: 10 }}>👤</div>
                      <div style={{ fontWeight: 600, color: "var(--text-1)", marginBottom: 4 }}>Nenhum produtor (CPF) encontrado na conta</div>
                      <div style={{ fontSize: 12 }}>Cadastre produtores em <strong>Cadastros → Produtores</strong>.</div>
                    </div>
                  ) : (
                    <>
                      <div style={{ border: "0.5px solid var(--border-table)", borderRadius: 10, overflow: "hidden", marginBottom: 12 }}>
                        <table style={{ width: "100%", borderCollapse: "collapse" }}>
                          <thead>
                            <tr style={{ background: "var(--bg-page)" }}>
                              {["CPF", "Nome do Produtor", "Quota-parte (%)", "Situação"].map((h, i) => (
                                <th key={i} style={{ padding: "9px 14px", textAlign: i >= 2 ? "center" : "left", fontSize: 11, fontWeight: 600, color: "var(--text-2)", borderBottom: "0.5px solid var(--border-table)" }}>{h}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {produtoresLcdpr.map(p => {
                              const pct = config.participacoes[p.cpf] ?? 100;
                              return (
                                <tr key={p.cpf} style={{ borderBottom: "0.5px solid var(--border-row)" }}>
                                  <td style={{ padding: "10px 14px", fontSize: 12, fontFamily: "monospace", color: "var(--text-2)" }}>{fmtCPF(p.cpf)}</td>
                                  <td style={{ padding: "10px 14px", color: "var(--text-1)", fontWeight: 500 }}>{p.nome}</td>
                                  <td style={{ padding: "10px 14px", textAlign: "center" }}>
                                    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
                                      <input type="number" min={0} max={100} step={0.01} value={pct}
                                        onChange={e => {
                                          const v = Math.min(100, Math.max(0, parseFloat(e.target.value) || 0));
                                          salvarConfig({ ...config, participacoes: { ...config.participacoes, [p.cpf]: v } });
                                        }}
                                        style={{ width: 80, padding: "5px 8px", border: "0.5px solid var(--border-table)", borderRadius: 6, fontSize: 13, textAlign: "right", color: "var(--text-1)", background: "var(--bg-input)" }}
                                      />
                                      <span style={{ fontSize: 12, color: "var(--text-2)" }}>%</span>
                                    </div>
                                  </td>
                                  <td style={{ padding: "10px 14px", textAlign: "center" }}>
                                    <span style={{
                                      fontSize: 11, fontWeight: 600, padding: "3px 10px", borderRadius: 6,
                                      background: pct === 100 ? "#EAF3DE" : "#FBF3E0",
                                      color: pct === 100 ? "#1A5C38" : "#7A5A12",
                                    }}>
                                      {pct === 100 ? "Titular único" : `${pct.toFixed(2)}% da operação`}
                                    </span>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>

                      {/* Validação da soma */}
                      {produtoresLcdpr.length > 1 && (() => {
                        const soma = produtoresLcdpr.reduce((s, p) => s + (config.participacoes[p.cpf] ?? 100), 0);
                        if (Math.abs(soma - 100) < 0.01) return (
                          <div style={{ background: "#EAF3DE", border: "0.5px solid #1A5C3840", borderRadius: 8, padding: "8px 14px", fontSize: 12, color: "#1A5C38" }}>
                            ✓ Soma das participações: <strong>100,00%</strong> — consistente.
                          </div>
                        );
                        return (
                          <div style={{ background: "#FCEBEB", border: "0.5px solid #E24B4A40", borderRadius: 8, padding: "8px 14px", fontSize: 12, color: "#791F1F" }}>
                            ⚠ Soma das participações: <strong>{soma.toFixed(2)}%</strong> — esperado 100,00%. Corrija antes de gerar o arquivo.
                          </div>
                        );
                      })()}
                    </>
                  )}

                  <div style={{ marginTop: 18, padding: "14px 18px", background: "var(--bg-page)", border: "0.5px solid var(--border-table)", borderRadius: 10, fontSize: 12, color: "var(--text-2)", lineHeight: 1.7 }}>
                    <strong style={{ color: "var(--text-1)" }}>Como funciona na exportação</strong><br />
                    Na aba <em>Exportação</em>, selecione o CPF desejado. Os valores de receitas, despesas e saldo inicial
                    serão multiplicados automaticamente pela quota-parte configurada aqui, gerando o arquivo individual
                    correto para entrega na Receita Federal.
                  </div>
                  {savingCfg && <div style={{ marginTop: 8, fontSize: 11, color: "#aaa", textAlign: "right" }}>Salvando…</div>}
                </div>
              </div>
            )}

            {/* ═══ ABA: PLANO DE CONTAS LCDPR ═══ */}
            {aba === "plano" && (
              <div style={{ padding: 20 }}>
                <div style={{ background: "#EEF4FF", border: "0.5px solid #93C5FD", borderRadius: 10, padding: "12px 16px", marginBottom: 18, fontSize: 12, color: "#1e40af", lineHeight: 1.6 }}>
                  <strong>Como funciona:</strong> cada Operação Gerencial (OG) pode ter um código LCDPR. Quando um lançamento
                  tem uma OG com código configurado, esse código é usado. Sem código na OG, o sistema infere automaticamente
                  pelo texto do histórico/categoria e marca com "≈" no Livro Caixa.
                </div>
                <div style={{ display: "flex", gap: 10, marginBottom: 18 }}>
                  <div style={{ background: "#EAF3DE", borderRadius: 8, padding: "7px 14px", color: "#1A5C38", fontWeight: 600, fontSize: 12 }}>{ogsMapeadas} configuradas</div>
                  <div style={{ background: "#FBF3E0", borderRadius: 8, padding: "7px 14px", color: "#7A5A12", fontWeight: 600, fontSize: 12 }}>{ogsTotal - ogsMapeadas} sem código</div>
                  <div style={{ background: "var(--bg-page)", borderRadius: 8, padding: "7px 14px", color: "var(--text-2)", fontSize: 12 }}>{ogsTotal} total</div>
                </div>

                {TODOS_CODIGOS.map(c => {
                  const lista = ogsPorCodigo.get(c.cod) ?? [];
                  if (!lista.length) return null;
                  const exp = expandidos.has(c.cod);
                  return (
                    <div key={c.cod} style={{ border: "0.5px solid var(--border-table)", borderRadius: 10, marginBottom: 8, overflow: "hidden" }}>
                      <button onClick={() => toggleExpandido(c.cod)}
                        style={{ width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", background: "var(--bg-page)", border: "none", cursor: "pointer", textAlign: "left" }}>
                        <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 5, background: c.cod.startsWith("1") ? "#EAF3DE" : "#FCEBEB", color: c.cod.startsWith("1") ? "#1A5C38" : "#791F1F" }}>{c.cod}</span>
                        <span style={{ fontWeight: 600, color: "var(--text-1)", fontSize: 13 }}>{c.desc}</span>
                        <span style={{ fontSize: 11, color: "var(--text-3)", marginLeft: "auto" }}>{lista.length} OG{lista.length !== 1 ? "s" : ""}</span>
                        <span style={{ fontSize: 11, color: "var(--text-3)" }}>{exp ? "▲" : "▼"}</span>
                      </button>
                      {exp && renderOgTable(lista)}
                    </div>
                  );
                })}

                {(() => {
                  const semCod = ogsPorCodigo.get(null) ?? [];
                  if (!semCod.length) return null;
                  const exp = expandidos.has("semcod");
                  return (
                    <div style={{ border: "0.5px solid #C9921B60", borderRadius: 10, marginTop: 8, overflow: "hidden" }}>
                      <button onClick={() => toggleExpandido("semcod")}
                        style={{ width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", background: "#FFFDF5", border: "none", cursor: "pointer", textAlign: "left" }}>
                        <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 5, background: "#FBF3E0", color: "#7A5A12" }}>—</span>
                        <span style={{ fontWeight: 600, color: "#7A5A12", fontSize: 13 }}>Sem código LCDPR</span>
                        <span style={{ fontSize: 11, color: "#7A5A12", marginLeft: "auto" }}>
                          {semCod.length} OG{semCod.length !== 1 ? "s" : ""} — código será inferido automaticamente
                        </span>
                        <span style={{ fontSize: 11, color: "#7A5A12" }}>{exp ? "▲" : "▼"}</span>
                      </button>
                      {exp && renderOgTable(semCod)}
                    </div>
                  );
                })()}
              </div>
            )}

            {/* ═══ ABA: IMPORTAÇÃO ═══ */}
            {aba === "importacao" && (
              <div style={{ padding: 24 }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24, alignItems: "start" }}>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 14, color: "var(--text-1)", marginBottom: 12 }}>Importar lançamentos via planilha</div>
                    <div style={{ fontSize: 12, color: "var(--text-2)", lineHeight: 1.7, marginBottom: 16 }}>
                      Para lançamentos históricos ou oriundos de outro sistema. Os dados importados ficam na sessão atual
                      e são incluídos no arquivo exportado junto com os lançamentos automáticos do Financeiro.
                    </div>
                    <button onClick={baixarModelo}
                      style={{ padding: "7px 14px", background: "var(--bg-card)", color: "var(--text-1)", border: "0.5px solid var(--border-table)", borderRadius: 8, cursor: "pointer", fontSize: 12, marginBottom: 16, display: "flex", alignItems: "center", gap: 6 }}>
                      ⬇ Baixar modelo Excel
                    </button>
                    <div onClick={() => importRef.current?.click()}
                      onDragOver={e => { e.preventDefault(); (e.currentTarget as HTMLElement).style.borderColor = "#1A5C38"; }}
                      onDragLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = "var(--border-table)"; }}
                      onDrop={e => { e.preventDefault(); (e.currentTarget as HTMLElement).style.borderColor = "var(--border-table)"; const f = e.dataTransfer.files[0]; if (f) handleImportFile(f); }}
                      style={{ border: "1.5px dashed var(--border-table)", borderRadius: 10, padding: "28px 20px", textAlign: "center", cursor: "pointer", transition: "border-color 0.2s" }}>
                      <div style={{ fontSize: 24, marginBottom: 8 }}>📂</div>
                      <div style={{ fontWeight: 600, color: "var(--text-1)" }}>{importLoading ? "Processando…" : "Arraste ou clique para selecionar"}</div>
                      <div style={{ fontSize: 11, color: "var(--text-3)", marginTop: 4 }}>XLS, XLSX ou CSV</div>
                    </div>
                    <input ref={importRef} type="file" accept=".xls,.xlsx,.csv" style={{ display: "none" }}
                      onChange={e => { const f = e.target.files?.[0]; if (f) handleImportFile(f); e.target.value = ""; }} />
                    {importFeedback && (
                      <div style={{ marginTop: 12, background: "#EAF3DE", borderRadius: 8, padding: "8px 14px", color: "#1A5C38", fontSize: 12, fontWeight: 600 }}>{importFeedback}</div>
                    )}
                  </div>

                  <div style={{ background: "var(--bg-page)", borderRadius: 10, padding: "16px 18px", border: "0.5px solid var(--border-table)", fontSize: 12 }}>
                    <div style={{ fontWeight: 600, color: "var(--text-1)", marginBottom: 12 }}>Colunas esperadas na planilha</div>
                    {[
                      { col: "Data *",          desc: "DD/MM/AAAA ou AAAA-MM-DD" },
                      { col: "Histórico *",      desc: "Descrição do lançamento (até 60 chars)" },
                      { col: "Tipo *",           desc: "Receita ou Despesa" },
                      { col: "Valor *",          desc: "Número com vírgula. Ex: 185.000,00" },
                      { col: "Documento",        desc: "NF-e, Recibo, DARF, Extrato, Contrato, Folha…" },
                      { col: "CPF/CNPJ",         desc: "CPF/CNPJ da contraparte" },
                      { col: "Código LCDPR",     desc: "101–199 receita · 201–299 despesa" },
                    ].map(f => (
                      <div key={f.col} style={{ display: "flex", gap: 8, marginBottom: 7 }}>
                        <span style={{ fontWeight: 600, color: "var(--text-1)", minWidth: 130, flexShrink: 0 }}>{f.col}</span>
                        <span style={{ color: "var(--text-2)" }}>{f.desc}</span>
                      </div>
                    ))}
                    <div style={{ borderTop: "0.5px solid var(--border-table)", paddingTop: 12, marginTop: 10 }}>
                      <div style={{ fontWeight: 600, color: "var(--text-1)", marginBottom: 8 }}>Códigos LCDPR válidos</div>
                      {TODOS_CODIGOS.map(c => (
                        <div key={c.cod} style={{ display: "flex", gap: 8, marginBottom: 4, fontSize: 11 }}>
                          <span style={{ fontWeight: 700, color: c.cod.startsWith("1") ? "#1A5C38" : "#E24B4A", width: 28, flexShrink: 0 }}>{c.cod}</span>
                          <span style={{ color: "#444" }}>{c.desc}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {importRows.length > 0 && (
                  <div style={{ marginTop: 24 }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                      <div style={{ fontWeight: 600, color: "var(--text-1)" }}>
                        Preview — {importRows.length} linha{importRows.length !== 1 ? "s" : ""}
                        &nbsp;<span style={{ fontSize: 11, color: "#1A5C38" }}>✓ {importRows.filter(r => r._status === "ok").length} ok</span>
                        {importRows.some(r => r._status === "erro") && (
                          <span style={{ fontSize: 11, color: "#E24B4A", marginLeft: 8 }}>✕ {importRows.filter(r => r._status === "erro").length} com erro</span>
                        )}
                      </div>
                      <div style={{ display: "flex", gap: 8 }}>
                        <button onClick={() => setImportRows([])} style={{ padding: "6px 14px", border: "0.5px solid var(--border-table)", borderRadius: 8, background: "var(--bg-card)", color: "var(--text-1)", cursor: "pointer", fontSize: 12 }}>Cancelar</button>
                        <button onClick={confirmarImport} disabled={!importRows.some(r => r._status === "ok")}
                          style={{ padding: "6px 16px", background: "#1A5C38", color: "#fff", border: "none", borderRadius: 8, fontWeight: 600, cursor: "pointer", fontSize: 12, opacity: importRows.some(r => r._status === "ok") ? 1 : 0.5 }}>
                          ✓ Adicionar {importRows.filter(r => r._status === "ok").length} ao Livro Caixa
                        </button>
                      </div>
                    </div>
                    <div style={{ overflowX: "auto" }}>
                      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                        <thead>
                          <tr style={{ background: "var(--bg-page)" }}>
                            {["", "Data", "Cód.", "Histórico", "Doc.", "CPF/CNPJ", "Receita", "Despesa"].map((h, i) => (
                              <th key={i} style={{ padding: "6px 10px", textAlign: "left", fontSize: 11, color: "var(--text-2)", borderBottom: "0.5px solid var(--border-table)", whiteSpace: "nowrap" }}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {importRows.map((r, i) => (
                            <tr key={i} style={{ borderBottom: "0.5px solid var(--border-row)", background: r._status === "erro" ? "#FFF5F5" : "transparent" }}>
                              <td style={{ padding: "6px 10px" }}>
                                {r._status === "ok"
                                  ? <span style={{ color: "#1A5C38", fontWeight: 700 }}>✓</span>
                                  : <span title={r._msg} style={{ color: "#E24B4A", fontWeight: 700, cursor: "help" }}>✕ <span style={{ fontSize: 10 }}>{r._msg}</span></span>}
                              </td>
                              <td style={{ padding: "6px 10px", whiteSpace: "nowrap" }}>{r.data ? fmtData(r.data) : "—"}</td>
                              <td style={{ padding: "6px 10px" }}>
                                <span style={{ fontSize: 10, background: r.codigo.startsWith("1") ? "#EAF3DE" : "#FCEBEB", color: r.codigo.startsWith("1") ? "#1A5C38" : "#791F1F", padding: "1px 5px", borderRadius: 4, fontWeight: 600 }}>{r.codigo}</span>
                              </td>
                              <td style={{ padding: "6px 10px", maxWidth: 240, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.historico || "—"}</td>
                              <td style={{ padding: "6px 10px", color: "var(--text-2)" }}>{TIPO_DOC_LABEL[r.tipoDoc] ?? r.tipoDoc}</td>
                              <td style={{ padding: "6px 10px", color: "var(--text-2)", fontVariantNumeric: "tabular-nums" }}>{r.cpfCnpj || "—"}</td>
                              <td style={{ padding: "6px 10px", textAlign: "right", color: "#1A5C38", fontVariantNumeric: "tabular-nums" }}>{r.receita > 0 ? fmtBRL(r.receita) : "—"}</td>
                              <td style={{ padding: "6px 10px", textAlign: "right", color: "#E24B4A", fontVariantNumeric: "tabular-nums" }}>{r.despesa > 0 ? fmtBRL(r.despesa) : "—"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ═══ ABA: EXPORTAÇÃO ═══ */}
            {aba === "exportacao" && (
              <div style={{ padding: 24 }}>
                <div style={{ display: "grid", gridTemplateColumns: "320px 1fr", gap: 24, alignItems: "start" }}>

                  {/* Painel de configuração */}
                  <div style={{ border: "0.5px solid var(--border-table)", borderRadius: 12, padding: 20 }}>
                    <div style={{ fontWeight: 600, fontSize: 14, color: "var(--text-1)", marginBottom: 18 }}>Configurar exportação</div>

                    <div style={{ marginBottom: 14 }}>
                      <label style={lblS}>Produtor / CPF</label>
                      <select value={produtorFiltro} onChange={e => setProdutorFiltro(e.target.value)} style={inpS}>
                        <option value="todos">Consolidado (todos os produtores)</option>
                        {produtoresLcdpr.map(p => (
                          <option key={p.cpf} value={p.cpf}>
                            {fmtCPF(p.cpf)} — {p.nome}
                            {(config.participacoes[p.cpf] ?? 100) !== 100 ? ` (${config.participacoes[p.cpf]}%)` : ""}
                          </option>
                        ))}
                      </select>
                    </div>

                    {produtorFiltro !== "todos" && participacaoSel !== 100 && (
                      <div style={{ background: "#EEF4FF", border: "0.5px solid #93C5FD", borderRadius: 8, padding: "9px 12px", marginBottom: 14, fontSize: 12, color: "#1e40af" }}>
                        📐 Quota-parte: <strong>{participacaoSel}%</strong><br />
                        Valores serão × <strong>{fator.toFixed(4)}</strong> no arquivo gerado.
                      </div>
                    )}

                    <div style={{ marginBottom: 14 }}>
                      <label style={lblS}>Período</label>
                      <div style={{ display: "flex", gap: 8 }}>
                        {(["anual", "mensal"] as const).map(m => (
                          <button key={m} onClick={() => setModoExport(m)} style={{
                            flex: 1, padding: "7px", cursor: "pointer", fontSize: 12,
                            border: `0.5px solid ${modoExport === m ? "#1A5C38" : "var(--border-table)"}`,
                            borderRadius: 8,
                            background: modoExport === m ? "#EAF3DE" : "var(--bg-card)",
                            color: modoExport === m ? "#1A5C38" : "var(--text-2)",
                            fontWeight: modoExport === m ? 600 : 400,
                          }}>
                            {m === "anual" ? "Anual" : "Mensal"}
                          </button>
                        ))}
                      </div>
                    </div>

                    {modoExport === "mensal" && (
                      <div style={{ marginBottom: 14 }}>
                        <label style={lblS}>Mês</label>
                        <select value={mesExport} onChange={e => setMesExport(Number(e.target.value))} style={inpS}>
                          {Array.from({ length: 12 }, (_, i) => (
                            <option key={i + 1} value={i + 1}>
                              {new Date(2000, i, 1).toLocaleString("pt-BR", { month: "long" }).replace(/^./, c => c.toUpperCase())}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}

                    {/* Resumo do que será exportado */}
                    <div style={{ background: "var(--bg-page)", borderRadius: 8, padding: "12px 14px", marginBottom: 16, fontSize: 12 }}>
                      {[
                        { l: "Lançamentos",        v: String(entradasExport.length), bold: false },
                        { l: "Saldo inicial",      v: fmtBRL(saldoInicialExport), bold: false },
                        { l: "Total receitas",     v: fmtBRL(entradasExport.reduce((s, e) => s + e.receita, 0)), bold: true },
                        { l: "Total despesas",     v: fmtBRL(entradasExport.reduce((s, e) => s + e.despesa, 0)), bold: true },
                      ].map((row, i) => (
                        <div key={i} style={{ display: "flex", justifyContent: "space-between", marginBottom: i < 3 ? 5 : 0 }}>
                          <span style={{ color: "var(--text-2)" }}>{row.l}:</span>
                          <strong style={{ color: "var(--text-1)", fontVariantNumeric: "tabular-nums", fontWeight: row.bold ? 700 : 500 }}>{row.v}</strong>
                        </div>
                      ))}
                    </div>

                    <button onClick={gerarLCDPR}
                      style={{ width: "100%", padding: "11px", background: "#1A4870", color: "#fff", border: "none", borderRadius: 8, fontWeight: 700, cursor: "pointer", fontSize: 13, letterSpacing: 0.3 }}>
                      ⬇ Gerar LCDPR.txt (Leiaute 3)
                    </button>
                    <div style={{ marginTop: 10, fontSize: 11, color: "var(--text-3)", textAlign: "center", lineHeight: 1.5 }}>
                      Compatível com PGE da Receita Federal<br />
                      Prazo de entrega: <strong>30/04/{anoSel + 1}</strong>
                    </div>
                  </div>

                  {/* Resumo anual + composição por código */}
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 14, color: "var(--text-1)", marginBottom: 12 }}>Movimentação mensal — {anoSel}</div>
                    <div style={{ border: "0.5px solid var(--border-table)", borderRadius: 10, overflow: "hidden", marginBottom: 20 }}>
                      <table style={{ width: "100%", borderCollapse: "collapse" }}>
                        <thead>
                          <tr style={{ background: "var(--bg-page)" }}>
                            {["Mês", "Receitas", "Despesas", "Resultado", "Acumulado"].map((h, i) => (
                              <th key={i} style={{ padding: "8px 12px", textAlign: i === 0 ? "left" : "right", fontSize: 11, fontWeight: 600, color: "var(--text-2)", borderBottom: "0.5px solid var(--border-table)" }}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {(() => {
                            let acum = saldoInicial;
                            return mesesResumo.map((m, i) => {
                              const res = m.rec - m.desp;
                              acum += res;
                              const tem = m.rec > 0 || m.desp > 0;
                              return (
                                <tr key={i} style={{ borderBottom: "0.5px solid var(--border-row)", opacity: tem ? 1 : 0.3 }}>
                                  <td style={{ padding: "8px 12px", color: "var(--text-1)", textTransform: "capitalize" }}>{m.mes}</td>
                                  <td style={{ padding: "8px 12px", textAlign: "right", color: "#1A5C38", fontWeight: m.rec > 0 ? 600 : 400, fontVariantNumeric: "tabular-nums" }}>{m.rec > 0 ? fmtBRL(m.rec) : "—"}</td>
                                  <td style={{ padding: "8px 12px", textAlign: "right", color: "#E24B4A", fontWeight: m.desp > 0 ? 600 : 400, fontVariantNumeric: "tabular-nums" }}>{m.desp > 0 ? fmtBRL(m.desp) : "—"}</td>
                                  <td style={{ padding: "8px 12px", textAlign: "right", fontWeight: 600, fontVariantNumeric: "tabular-nums", color: res >= 0 ? "#1A5C38" : "#E24B4A" }}>{tem ? fmtBRL(res) : "—"}</td>
                                  <td style={{ padding: "8px 12px", textAlign: "right", fontVariantNumeric: "tabular-nums", color: acum >= 0 ? "var(--text-1)" : "#E24B4A" }}>{tem ? fmtBRL(acum) : "—"}</td>
                                </tr>
                              );
                            });
                          })()}
                        </tbody>
                        <tfoot>
                          <tr style={{ background: "var(--bg-page)", borderTop: "1px solid var(--border-table)" }}>
                            <td style={{ padding: "9px 12px", fontWeight: 700, color: "var(--text-1)" }}>TOTAL {anoSel}</td>
                            <td style={{ padding: "9px 12px", textAlign: "right", fontWeight: 700, color: "#1A5C38", fontVariantNumeric: "tabular-nums" }}>{fmtBRL(totalReceitas)}</td>
                            <td style={{ padding: "9px 12px", textAlign: "right", fontWeight: 700, color: "#E24B4A", fontVariantNumeric: "tabular-nums" }}>{fmtBRL(totalDespesas)}</td>
                            <td style={{ padding: "9px 12px", textAlign: "right", fontWeight: 700, fontVariantNumeric: "tabular-nums", color: (totalReceitas - totalDespesas) >= 0 ? "#1A5C38" : "#E24B4A" }}>{fmtBRL(totalReceitas - totalDespesas)}</td>
                            <td style={{ padding: "9px 12px", textAlign: "right", fontWeight: 700, fontVariantNumeric: "tabular-nums", color: saldoFinal >= 0 ? "#1A5C38" : "#E24B4A" }}>{fmtBRL(saldoFinal)}</td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>

                    <div style={{ fontWeight: 600, fontSize: 13, color: "var(--text-1)", marginBottom: 10 }}>Composição por código LCDPR</div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                      {TODOS_CODIGOS.map(c => {
                        const total = entradas.filter(e => e.codigo === c.cod).reduce((s, e) => s + e.receita + e.despesa, 0);
                        if (!total) return null;
                        const isR = c.cod.startsWith("1");
                        return (
                          <div key={c.cod} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", background: "var(--bg-page)", borderRadius: 8, border: "0.5px solid var(--border-table)" }}>
                            <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 7px", borderRadius: 5, background: isR ? "#EAF3DE" : "#FCEBEB", color: isR ? "#1A5C38" : "#791F1F", flexShrink: 0 }}>{c.cod}</span>
                            <span style={{ fontSize: 12, color: "var(--text-2)", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.desc}</span>
                            <span style={{ fontWeight: 700, color: isR ? "#1A5C38" : "#E24B4A", fontVariantNumeric: "tabular-nums", flexShrink: 0, fontSize: 12 }}>{fmtBRL(total)}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>
            )}

          </div>
        </div>
      </main>

      {/* ── Modal: Lançamento Manual ── */}
      {modalManual && (
        <div style={{ position: "fixed", inset: 0, background: "#0005", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ background: "var(--bg-card)", borderRadius: 14, padding: 28, width: 520, boxShadow: "0 8px 40px #0003" }}>
            <div style={{ fontWeight: 700, fontSize: 16, color: "var(--text-1)", marginBottom: 20 }}>Lançamento Manual</div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 14 }}>
              <div>
                <label style={lblS}>Data *</label>
                <input type="date" value={fManual.data} onChange={e => setFManual(p => ({ ...p, data: e.target.value }))} style={inpS} />
              </div>
              <div>
                <label style={lblS}>Tipo *</label>
                <select value={fManual.tipo} onChange={e => setFManual(p => ({ ...p, tipo: e.target.value as any, codigo: e.target.value === "receita" ? "101" : "201" }))} style={inpS}>
                  <option value="receita">Receita</option>
                  <option value="despesa">Despesa</option>
                </select>
              </div>
            </div>

            <div style={{ marginBottom: 14 }}>
              <label style={lblS}>Histórico *</label>
              <input value={fManual.historico} onChange={e => setFManual(p => ({ ...p, historico: e.target.value }))} placeholder="Descrição do lançamento" style={inpS} />
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 14 }}>
              <div>
                <label style={lblS}>Código LCDPR *</label>
                <select value={fManual.codigo} onChange={e => setFManual(p => ({ ...p, codigo: e.target.value }))} style={inpS}>
                  <optgroup label="Receitas (101–199)">
                    {CODIGOS_LCDPR.receita.map(c => <option key={c.cod} value={c.cod}>{c.cod} — {c.desc}</option>)}
                  </optgroup>
                  <optgroup label="Despesas (201–299)">
                    {CODIGOS_LCDPR.despesa.map(c => <option key={c.cod} value={c.cod}>{c.cod} — {c.desc}</option>)}
                  </optgroup>
                </select>
              </div>
              <div>
                <label style={lblS}>Tipo de documento</label>
                <select value={fManual.tipoDoc} onChange={e => setFManual(p => ({ ...p, tipoDoc: e.target.value }))} style={inpS}>
                  <option value="01">01 — Nota Fiscal (NF/NF-e)</option>
                  <option value="02">02 — Recibo</option>
                  <option value="03">03 — Folha de Pagamento</option>
                  <option value="04">04 — DARF / GPS / DARE</option>
                  <option value="05">05 — Extrato Bancário</option>
                  <option value="06">06 — Contrato</option>
                  <option value="07">07 — Outros</option>
                </select>
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 22 }}>
              <div>
                <label style={lblS}>Valor (R$) *</label>
                <input type="number" min={0} step={0.01} value={fManual.valor || ""}
                  onChange={e => setFManual(p => ({ ...p, valor: parseFloat(e.target.value) || 0 }))} style={inpS} />
              </div>
              <div>
                <label style={lblS}>CPF/CNPJ contraparte</label>
                <input value={fManual.cpfCnpj} onChange={e => setFManual(p => ({ ...p, cpfCnpj: e.target.value }))} placeholder="Opcional" style={inpS} />
              </div>
            </div>

            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <button onClick={() => setModalManual(false)}
                style={{ padding: "8px 18px", border: "0.5px solid var(--border-table)", borderRadius: 8, background: "var(--bg-card)", color: "var(--text-1)", cursor: "pointer", fontSize: 13 }}>
                Cancelar
              </button>
              <button onClick={adicionarManual} disabled={!fManual.valor || !fManual.historico}
                style={{ padding: "8px 20px", background: "#C9921B", color: "#fff", border: "none", borderRadius: 8, fontWeight: 600, cursor: "pointer", fontSize: 13, opacity: (!fManual.valor || !fManual.historico) ? 0.5 : 1 }}>
                Adicionar ao Livro Caixa
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
