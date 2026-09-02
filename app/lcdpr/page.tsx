"use client";
import { useState, useEffect, useMemo, useRef } from "react";
import TopNav from "../../components/TopNav";
import InputMonetario from "../../components/InputMonetario";
import InputNumerico from "../../components/InputNumerico";
import { useAuth } from "../../components/AuthProvider";
import { listarLancamentos, listarOperacoesGerenciaisAtivasDaConta, atualizarOperacaoGerencial } from "../../lib/db";
import type { Lancamento, OperacaoGerencial } from "../../lib/supabase";
import { createBrowserClient } from "@supabase/ssr";
import PlanoGate from "../../components/PlanoGate";

// ─── Tabela de códigos LCDPR — IN RFB 1.848/2018 ────────────────────────────
const CODIGOS_LCDPR = {
  receita: [
    { cod: "101", desc: "Venda de produto rural" },
    { cod: "102", desc: "Prestação de serviços rurais" },
    { cod: "103", desc: "Recursos de financiamento rural recebidos" },
    { cod: "104", desc: "Ressarcimento do ITR" },
    { cod: "199", desc: "Outras receitas rurais" },
  ],
  despesa: [
    { cod: "201", desc: "Custeio da atividade rural" },
    { cod: "202", desc: "Investimento na atividade rural" },
    { cod: "203", desc: "Amortização de financiamento rural" },
    { cod: "204", desc: "Pagamento de ITR" },
    { cod: "205", desc: "Outros impostos e taxas" },
    { cod: "299", desc: "Outras despesas rurais" },
  ],
} as const;

const TODOS_CODIGOS = [...CODIGOS_LCDPR.receita, ...CODIGOS_LCDPR.despesa];
const MAP_CODIGO = new Map<string, string>(TODOS_CODIGOS.map(c => [c.cod, c.desc]));

// Fallback por categoria/descrição quando OG não tem codigo_lcdpr
const MAPA_CATEGORIA: Record<string, string> = {
  "Venda de grãos": "101", "Venda de soja": "101", "Venda de milho": "101", "Venda de algodão": "101",
  "Serviço rural": "102", "Financiamento": "103", "ITR": "104",
  "Insumos": "201", "Sementes": "201", "Fertilizantes": "201", "Defensivos": "201",
  "Mão de obra": "201", "Frete": "201", "Arrendamento": "201",
  "Máquinas": "202", "Investimento": "202", "Amortização": "203",
  "Impostos e taxas": "205",
};
function codigoAuto(l: Lancamento): string {
  for (const [key, cod] of Object.entries(MAPA_CATEGORIA)) {
    if (l.categoria?.toLowerCase().includes(key.toLowerCase())) return cod;
    if (l.descricao?.toLowerCase().includes(key.toLowerCase())) return cod;
  }
  return l.tipo === "receber" ? "199" : "299";
}

const hoje = () => new Date().toISOString().split("T")[0];
const fmtData = (s: string) => { const [y, m, d] = s.split("-"); return `${d}/${m}/${y}`; };
const fmtBRL = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const toTitleCase = (s: string) => s.toLowerCase().replace(/(?:^|\s)\w/g, c => c.toUpperCase());

type AbaLCDPR = "livro" | "plano" | "importacao" | "resumo" | "exportacao";

interface EntradaLCDPR {
  id: string;
  data: string;
  historico: string;
  doc: string;
  cpf_cnpj: string;
  codigo: string;
  receita: number;
  despesa: number;
  origem: "auto" | "manual" | "importado";
  lancId?: string;
  fazenda_id?: string;
}

interface FazLcdpr {
  id: string;
  nome: string;
  cpf_cnpj_fiscal: string;
  nirf: string;
  municipio: string;
  uf: string;
  area_total_ha: number;
}

interface ImportRow {
  data: string;
  historico: string;
  doc: string;
  cpf_cnpj: string;
  codigo: string;
  receita: number;
  despesa: number;
  _status: "ok" | "erro";
  _msg: string;
}

// ─────────────────────────────────────────────────────────────────────────────
export default function LCDPR() {
  const { fazendaId, fazendaIds, podeAcessarPlano } = useAuth();

  const [aba, setAba]           = useState<AbaLCDPR>("livro");
  const [anoSel, setAnoSel]     = useState(new Date().getFullYear());
  const [loading, setLoading]   = useState(true);
  const [entradas, setEntradas] = useState<EntradaLCDPR[]>([]);
  const [saldoInicial, setSaldoInicial] = useState(0);
  const [modalManual, setModalManual]   = useState(false);
  const [fManual, setFManual] = useState({ data: hoje(), historico: "", doc: "", cpf_cnpj: "", codigo: "101", valor: 0, tipo: "receita" as "receita" | "despesa" });

  // Plano de Contas LCDPR
  const [ogs, setOgs] = useState<OperacaoGerencial[]>([]);
  const [ogMap, setOgMap] = useState<Map<string, OperacaoGerencial>>(new Map());
  const [ogEditCodigos, setOgEditCodigos] = useState<Map<string, string | null>>(new Map());
  const [savingOgIds, setSavingOgIds] = useState<Set<string>>(new Set());
  const [expandidos, setExpandidos] = useState<Set<string>>(new Set(["semcod"]));

  // Importação
  const importRef = useRef<HTMLInputElement>(null);
  const [importRows, setImportRows] = useState<ImportRow[]>([]);
  const [importLoading, setImportLoading] = useState(false);
  const [importFeedback, setImportFeedback] = useState("");

  // Exportação — filtros
  const [fazDados, setFazDados] = useState<FazLcdpr[]>([]);
  const [cpfFiltro, setCpfFiltro] = useState("todos");
  const [modoExport, setModoExport] = useState<"anual" | "mensal">("anual");
  const [mesExport, setMesExport] = useState(new Date().getMonth() + 1);

  // ── Carga principal ────────────────────────────────────────────────────────
  useEffect(() => {
    const ids = fazendaIds?.length ? fazendaIds : fazendaId ? [fazendaId] : [];
    if (!ids.length) return;
    setLoading(true);
    const sb = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    );
    Promise.all([
      // Lança de TODAS as fazendas da conta (LCDPR é por CPF, não por fazenda)
      Promise.all(ids.map(fid =>
        listarLancamentos(fid).then(l => l.map(x => ({ ...x, __fid: fid })))
      )).then(all => all.flat()),
      // Baixas do Apoio Financeiro — excluídas do LCDPR
      sb.from("apoio_baixas").select("lancamento_id").in("fazenda_id", ids),
      // OGs para resolução de código LCDPR
      listarOperacoesGerenciaisAtivasDaConta(undefined, fazendaId),
      // Dados das fazendas para filtro por CPF/produtor
      sb.from("fazendas").select("id, nome, cpf_cnpj_fiscal, nirf, municipio, uf, area_total_ha").in("id", ids),
    ]).then(([lans, { data: apoioBaixas }, ogsData, { data: fazRows }]) => {
      setFazDados((fazRows ?? []) as FazLcdpr[]);
      setOgs(ogsData);
      const map = new Map(ogsData.map(og => [og.id, og]));
      setOgMap(map);
      setOgEditCodigos(new Map(ogsData.map(og => [og.id, og.codigo_lcdpr ?? null])));

      const apoioIds = new Set((apoioBaixas ?? []).map((b: { lancamento_id: string }) => b.lancamento_id));

      // LCDPR é caixa — usa data do efetivo pagamento; somente PF (produtor rural)
      const filtradas = lans.filter(l => {
        if (l.status !== "baixado") return false;
        if (apoioIds.has(l.id)) return false;
        // Exclui lançamentos de entidade PJ — LCDPR é exclusivo de pessoa física rural
        if (l.entidade_contabil && l.entidade_contabil !== "pf") return false;
        const dataCaixa = l.data_baixa ?? l.data_vencimento ?? l.data_lancamento ?? "";
        return dataCaixa.slice(0, 4) === String(anoSel);
      });

      const items: EntradaLCDPR[] = filtradas.map(l => {
        const og = l.operacao_gerencial_id ? map.get(l.operacao_gerencial_id) : undefined;
        const codigo = og?.codigo_lcdpr ?? codigoAuto(l);
        return {
          id: l.id,
          data: l.data_baixa ?? l.data_vencimento ?? l.data_lancamento ?? "",
          historico: l.descricao ?? "",
          doc: l.tipo_documento_lcdpr ?? "OUTROS",
          cpf_cnpj: (l as any).cpf_cnpj ?? "",
          codigo,
          receita: l.tipo === "receber" ? (l.valor_pago ?? l.valor ?? 0) : 0,
          despesa: l.tipo === "pagar"   ? (l.valor_pago ?? l.valor ?? 0) : 0,
          origem: "auto",
          lancId: l.id,
          fazenda_id: (l as any).__fid ?? (l as any).fazenda_id ?? "",
        };
      });
      items.sort((a, b) => a.data.localeCompare(b.data));
      setEntradas(items);
    }).finally(() => setLoading(false));
  }, [fazendaId, fazendaIds?.join(","), anoSel]);

  // ── Manual ────────────────────────────────────────────────────────────────
  const adicionarManual = () => {
    if (!fManual.valor || !fManual.historico) return;
    const nova: EntradaLCDPR = {
      id: `manual-${Date.now()}`,
      data: fManual.data,
      historico: fManual.historico,
      doc: fManual.doc || "OUTROS",
      cpf_cnpj: fManual.cpf_cnpj,
      codigo: fManual.codigo,
      receita: fManual.tipo === "receita" ? fManual.valor : 0,
      despesa: fManual.tipo === "despesa" ? fManual.valor : 0,
      origem: "manual",
    };
    setEntradas(prev => [...prev, nova].sort((a, b) => a.data.localeCompare(b.data)));
    setModalManual(false);
    setFManual({ data: hoje(), historico: "", doc: "", cpf_cnpj: "", codigo: "101", valor: 0, tipo: "receita" });
  };
  const removerManual = (id: string) => setEntradas(prev => prev.filter(e => e.id !== id));

  // ── Plano de Contas LCDPR — salvar código por OG ─────────────────────────
  const salvarCodigoOG = async (ogId: string, codigo: string | null) => {
    setSavingOgIds(prev => new Set(prev).add(ogId));
    try {
      await atualizarOperacaoGerencial(ogId, { codigo_lcdpr: codigo } as Partial<OperacaoGerencial>);
      setOgMap(prev => {
        const next = new Map(prev);
        const og = next.get(ogId);
        if (og) next.set(ogId, { ...og, codigo_lcdpr: codigo ?? undefined });
        return next;
      });
      setOgs(prev => prev.map(og => og.id === ogId ? { ...og, codigo_lcdpr: codigo ?? undefined } : og));
    } finally {
      setSavingOgIds(prev => { const next = new Set(prev); next.delete(ogId); return next; });
    }
  };

  // ── Importação XLS/CSV ────────────────────────────────────────────────────
  const handleImportFile = async (file: File) => {
    setImportLoading(true);
    setImportFeedback("");
    try {
      const XLSX = await import("xlsx");
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf);
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: "" });
      const parsed: ImportRow[] = rows.map(r => {
        const get = (...keys: string[]) => keys.reduce<string>((acc, k) => acc || String(r[k] ?? ""), "").trim();
        const dataRaw = get("Data", "data", "DATA");
        const hist    = get("Histórico", "Historico", "historico", "HISTÓRICO", "Descrição", "descricao");
        const doc     = get("Documento", "documento", "DOCUMENTO") || "OUTROS";
        const cpf     = get("CPF/CNPJ", "cpf_cnpj", "CPF", "CNPJ");
        const codRaw  = get("Código LCDPR", "Codigo LCDPR", "codigo", "CÓDIGO");
        const tipoRaw = get("Tipo", "tipo", "TIPO").toLowerCase();
        const valRaw  = parseFloat(get("Valor", "valor", "VALOR").replace(/\./g, "").replace(",", ".")) || 0;

        const erros: string[] = [];
        if (!hist) erros.push("Histórico vazio");
        let dataIso = dataRaw;
        if (dataRaw.includes("/")) {
          const p = dataRaw.split("/");
          if (p.length === 3) dataIso = `${p[2].length === 4 ? p[2] : `20${p[2]}`}-${p[1].padStart(2,"0")}-${p[0].padStart(2,"0")}`;
        }
        if (!/^\d{4}-\d{2}-\d{2}$/.test(dataIso)) erros.push("Data inválida (use DD/MM/AAAA)");
        const isReceita = tipoRaw.startsWith("r");
        const codigo = codRaw && MAP_CODIGO.has(codRaw) ? codRaw : (isReceita ? "199" : "299");
        if (codRaw && !MAP_CODIGO.has(codRaw)) erros.push(`Código "${codRaw}" inválido`);

        return {
          data: dataIso, historico: hist, doc, cpf_cnpj: cpf, codigo,
          receita: isReceita ? valRaw : 0,
          despesa: isReceita ? 0 : valRaw,
          _status: erros.length ? "erro" : "ok",
          _msg: erros.join("; "),
        };
      });
      setImportRows(parsed);
    } catch {
      setImportFeedback("Erro ao ler o arquivo. Use o modelo fornecido.");
    } finally {
      setImportLoading(false);
    }
  };

  const confirmarImport = () => {
    const validas = importRows.filter(r => r._status === "ok");
    const novas: EntradaLCDPR[] = validas.map((r, i) => ({
      id: `imp-${Date.now()}-${i}`,
      data: r.data, historico: r.historico, doc: r.doc, cpf_cnpj: r.cpf_cnpj, codigo: r.codigo,
      receita: r.receita, despesa: r.despesa, origem: "importado",
    }));
    setEntradas(prev => [...prev, ...novas].sort((a, b) => a.data.localeCompare(b.data)));
    setImportRows([]);
    setImportFeedback(`✓ ${validas.length} lançamento${validas.length !== 1 ? "s" : ""} adicionado${validas.length !== 1 ? "s" : ""} ao Livro Caixa.`);
    setAba("livro");
  };

  const baixarModelo = async () => {
    const XLSX = await import("xlsx");
    const modelo = [
      ["Data", "Histórico", "Documento", "CPF/CNPJ", "Código LCDPR", "Tipo", "Valor"],
      ["15/03/2026", "Venda de soja — Bunge", "NF-e 1234", "03.755.877/0001-00", "101", "Receita", "185000,00"],
      ["20/03/2026", "Adubo NPK — Cofco", "NF-e 5678", "04.803.396/0001-44", "201", "Despesa", "42000,00"],
    ];
    const ws = XLSX.utils.aoa_to_sheet(modelo);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Modelo");
    XLSX.writeFile(wb, "Modelo_LCDPR.xlsx");
  };

  // ── Totais ────────────────────────────────────────────────────────────────
  const totalReceitas = entradas.reduce((s, e) => s + e.receita, 0);
  const totalDespesas = entradas.reduce((s, e) => s + e.despesa, 0);
  const saldoFinal    = saldoInicial + totalReceitas - totalDespesas;

  const meses = Array.from({ length: 12 }, (_, i) => {
    const m = String(i + 1).padStart(2, "0");
    const itens = entradas.filter(e => e.data.slice(5, 7) === m);
    return {
      mes: new Date(`${anoSel}-${m}-01`).toLocaleString("pt-BR", { month: "long" }),
      rec: itens.reduce((s, e) => s + e.receita, 0),
      desp: itens.reduce((s, e) => s + e.despesa, 0),
    };
  });

  const porCodigo = TODOS_CODIGOS.map(c => {
    const total = entradas.filter(e => e.codigo === c.cod).reduce((s, e) => s + e.receita + e.despesa, 0);
    return { ...c, total, tipo: c.cod.startsWith("1") ? "receita" : "despesa" };
  }).filter(c => c.total > 0);

  // ── Produtores únicos por CPF para o filtro de exportação ────────────────
  const produtoresLcdpr = useMemo(() => {
    const map = new Map<string, string>();
    for (const f of fazDados) {
      if (f.cpf_cnpj_fiscal && !map.has(f.cpf_cnpj_fiscal)) {
        map.set(f.cpf_cnpj_fiscal, f.nome);
      }
    }
    return Array.from(map.entries()).map(([cpf, nome]) => ({ cpf, nome }));
  }, [fazDados]);

  // ── Entradas filtradas para exportação ────────────────────────────────────
  const entradasExport = useMemo(() => {
    let e = entradas;
    if (cpfFiltro !== "todos") {
      const fazIds = new Set(fazDados.filter(f => f.cpf_cnpj_fiscal === cpfFiltro).map(f => f.id));
      e = e.filter(x => fazIds.has(x.fazenda_id ?? ""));
    }
    if (modoExport === "mensal") {
      const mm = String(mesExport).padStart(2, "0");
      e = e.filter(x => x.data.slice(0, 7) === `${anoSel}-${mm}`);
    }
    return e;
  }, [entradas, cpfFiltro, fazDados, modoExport, mesExport, anoSel]);

  // ── Gerador do layout oficial LCDPR (.txt pipe-delimited) ─────────────────
  const gerarLCDPROficial = () => {
    const fmtDt = (iso: string) => {
      if (!iso || iso.length < 10) return "00000000";
      const [y, m, d] = iso.split("-");
      return `${d}${m}${y}`;
    };

    const mm = String(mesExport).padStart(2, "0");
    const dtIni = modoExport === "anual" ? `0101${anoSel}` : `01${mm}${anoSel}`;
    const lastDay = new Date(anoSel, mesExport, 0).getDate();
    const dtFin = modoExport === "anual"
      ? `3112${anoSel}`
      : `${String(lastDay).padStart(2, "0")}${mm}${anoSel}`;

    // Produtor selecionado
    const fazSel = cpfFiltro !== "todos"
      ? fazDados.find(f => f.cpf_cnpj_fiscal === cpfFiltro)
      : fazDados.find(f => f.cpf_cnpj_fiscal);
    const cpfProd = (fazSel?.cpf_cnpj_fiscal ?? "").replace(/\D/g, "");
    const nomeProd = (fazSel?.nome ?? "PRODUTOR RURAL").toUpperCase();
    const municipio = (fazSel?.municipio ?? "").toUpperCase();
    const uf = (fazSel?.uf ?? "").toUpperCase();

    const fazsFiltradas = cpfFiltro !== "todos"
      ? fazDados.filter(f => f.cpf_cnpj_fiscal === cpfFiltro)
      : fazDados;

    // Bloco 0
    const b0: string[] = [
      `|0000|LCDPR|0003|${dtIni}|${dtFin}|${cpfProd}|${nomeProd}|${municipio}|${uf}|N||Arato RacTech|2.0.0|`,
      `|0001|0|`,
      `|0010|${cpfProd}|${nomeProd}|${anoSel}|`,
    ];
    b0.push(`|0990|${b0.length + 1}|`);

    // Bloco LC
    const bLC: string[] = [`|LC01|0|`];
    for (const f of fazsFiltradas) {
      const area = (f.area_total_ha ?? 0).toFixed(2);
      bLC.push(`|LC10|1|${f.nirf ?? ""}||${f.nome.toUpperCase()}|${(f.municipio ?? "").toUpperCase()}|${(f.uf ?? "").toUpperCase()}|${area}|||${cpfProd}||`);
    }
    for (const e of entradasExport) {
      const dt = fmtDt(e.data);
      const hist = e.historico.slice(0, 60).toUpperCase().replace(/\|/g, " ");
      const cpfCnpj = (e.cpf_cnpj ?? "").replace(/\D/g, "");
      bLC.push(`|LC20|${dt}|${e.codigo}|${hist}|${e.doc}|${cpfCnpj}|${e.receita.toFixed(2)}|${e.despesa.toFixed(2)}|`);
    }
    bLC.push(`|LC99|${bLC.length + 1}|`);

    // Bloco 9
    const b9: string[] = [`|9001|0|`];
    b9.push(`|9990|${b9.length + 1}|`);
    const totalLinhas = b0.length + bLC.length + b9.length + 1;
    b9.push(`|9999|${totalLinhas}|`);

    const content = [...b0, ...bLC, ...b9].join("\r\n");
    const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const suffix = modoExport === "mensal" ? `${anoSel}_${mm}` : String(anoSel);
    a.download = `LCDPR_${suffix}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // ── Plano: OGs agrupadas por código ──────────────────────────────────────
  const ogsPorCodigo = useMemo(() => {
    const grupos = new Map<string | null, OperacaoGerencial[]>();
    TODOS_CODIGOS.forEach(c => grupos.set(c.cod, []));
    grupos.set(null, []);
    for (const og of ogs) {
      const cod = og.codigo_lcdpr ?? null;
      const lista = grupos.get(cod);
      if (lista !== undefined) lista.push(og);
      else grupos.get(null)!.push(og);
    }
    return grupos;
  }, [ogs]);

  const ogsTotal    = ogs.length;
  const ogsMapeadas = ogs.filter(o => o.codigo_lcdpr).length;

  const anos = [2023, 2024, 2025, 2026, 2027];

  const inpS: React.CSSProperties = { width: "100%", padding: "8px 10px", border: "0.5px solid var(--border-table)", borderRadius: 8, fontSize: 13, color: "var(--text-1)", background: "var(--bg-input)", boxSizing: "border-box", outline: "none" };
  const lblS: React.CSSProperties = { fontSize: 11, color: "var(--text-2)", marginBottom: 4, display: "block" };
  const btnPrimario: React.CSSProperties = { padding: "8px 16px", background: "#1A5C38", color: "#fff", border: "none", borderRadius: 8, fontWeight: 600, cursor: "pointer", fontSize: 13 };

  if (!podeAcessarPlano("fiscal_sped")) return <PlanoGate modulo="fiscal_sped" />;

  const toggleExpandido = (key: string) => setExpandidos(prev => {
    const next = new Set(prev);
    next.has(key) ? next.delete(key) : next.add(key);
    return next;
  });

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh", background: "var(--bg-page)", fontFamily: "system-ui, sans-serif", fontSize: 13 }}>
      <TopNav />
      <main style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>

        {/* Header */}
        <header style={{ background: "var(--bg-card)", borderBottom: "0.5px solid var(--border-table)", padding: "10px 22px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 17, fontWeight: 600, color: "var(--text-1)" }}>LCDPR — Livro Caixa Digital do Produtor Rural</h1>
            <p style={{ margin: 0, fontSize: 11, color: "#444" }}>Obrigação acessória · Receita Federal · IN RFB nº 1.848/2018</p>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <select value={anoSel} onChange={e => setAnoSel(Number(e.target.value))} style={{ padding: "6px 10px", border: "0.5px solid var(--border-table)", borderRadius: 8, fontSize: 13, color: "var(--text-1)", background: "var(--bg-card)", cursor: "pointer" }}>
              {anos.map(a => <option key={a} value={a}>{a}</option>)}
            </select>
            <button onClick={() => setModalManual(true)} style={{ padding: "8px 16px", background: "#C9921B", color: "#fff", border: "none", borderRadius: 8, fontWeight: 600, cursor: "pointer", fontSize: 13 }}>
              + Lançamento manual
            </button>
          </div>
        </header>

        <div style={{ padding: "16px 22px", flex: 1 }}>

          {/* KPI cards */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 16 }}>
            {[
              { label: "Saldo Inicial",  valor: saldoInicial, cor: "var(--text-1)", bg: "var(--bg-card)" },
              { label: "Total Receitas", valor: totalReceitas, cor: "#1A5C38", bg: "#EAF3DE" },
              { label: "Total Despesas", valor: totalDespesas, cor: "#E24B4A", bg: "#FCEBEB" },
              { label: "Saldo Final",    valor: saldoFinal,   cor: saldoFinal >= 0 ? "#1A5C38" : "#E24B4A", bg: saldoFinal >= 0 ? "#EAF3DE" : "#FCEBEB" },
            ].map((c, i) => (
              <div key={i} style={{ background: c.bg, border: "0.5px solid var(--border-table)", borderRadius: 12, padding: "14px 16px" }}>
                <div style={{ fontSize: 11, color: "var(--text-2)", marginBottom: 4 }}>{c.label}</div>
                <div style={{ fontSize: 18, fontWeight: 700, color: c.cor }}>{fmtBRL(c.valor)}</div>
              </div>
            ))}
          </div>

          {/* Saldo inicial */}
          <div style={{ background: "#FBF3E0", border: "0.5px solid #C9921B40", borderRadius: 8, padding: "8px 14px", marginBottom: 14, display: "flex", alignItems: "center", gap: 12, fontSize: 12 }}>
            <span style={{ color: "#7A5A12" }}>⚠ Saldo inicial em 01/01/{anoSel}:</span>
            <InputNumerico value={saldoInicial} onChange={v => setSaldoInicial(Number(v))} style={{ padding: "4px 8px", border: "0.5px solid #C9921B", borderRadius: 6, fontSize: 12, width: 140, color: "var(--text-1)" }} />
            <span style={{ color: "#7A5A12", fontSize: 11 }}>Informe o saldo em caixa no início do exercício.</span>
          </div>

          {/* Abas */}
          <div style={{ background: "var(--bg-card)", border: "0.5px solid var(--border-table)", borderRadius: 12, overflow: "hidden" }}>
            <div style={{ display: "flex", borderBottom: "0.5px solid var(--border-table)", overflowX: "auto" }}>
              {([
                ["livro",      "Livro Caixa"],
                ["plano",      "Plano de Contas LCDPR"],
                ["importacao", "Importação"],
                ["resumo",     "Resumo Anual"],
                ["exportacao", "Exportação"],
              ] as [AbaLCDPR, string][]).map(([key, label]) => (
                <button key={key} onClick={() => setAba(key)} style={{
                  padding: "10px 18px", border: "none", background: aba === key ? "#fff" : "var(--bg-card)",
                  borderBottom: aba === key ? "2px solid #1A5C38" : "2px solid transparent",
                  cursor: "pointer", fontSize: 13, fontWeight: aba === key ? 600 : 400,
                  color: aba === key ? "#1A5C38" : "var(--text-2)", whiteSpace: "nowrap",
                }}>
                  {label}
                  {key === "plano" && ogsMapeadas < ogsTotal && ogsTotal > 0 && (
                    <span style={{ marginLeft: 6, fontSize: 10, background: "#FBF3E0", color: "#7A5A12", padding: "1px 5px", borderRadius: 4, fontWeight: 600 }}>
                      {ogsTotal - ogsMapeadas} sem código
                    </span>
                  )}
                </button>
              ))}
            </div>

            {/* ══════════════ ABA: LIVRO CAIXA ══════════════ */}
            {aba === "livro" && (
              <div>
                {loading ? (
                  <div style={{ padding: 32, textAlign: "center", color: "var(--text-2)" }}>Carregando lançamentos...</div>
                ) : entradas.length === 0 ? (
                  <div style={{ padding: 40, textAlign: "center", color: "var(--text-2)" }}>
                    <div style={{ fontSize: 28, marginBottom: 8 }}>📋</div>
                    <div style={{ fontWeight: 600, color: "var(--text-1)" }}>Nenhum lançamento baixado em {anoSel}</div>
                    <div style={{ fontSize: 12, color: "#666", marginTop: 4, lineHeight: 1.6 }}>
                      Lançamentos baixados no Financeiro aparecem aqui automaticamente.<br />
                      Verifique se o ano selecionado está correto ou adicione um lançamento manual.
                    </div>
                  </div>
                ) : (
                  <div style={{ overflowX: "auto" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 800 }}>
                      <thead>
                        <tr style={{ background: "var(--bg-page)" }}>
                          {["Data", "Cód.", "Histórico", "Documento", "CPF/CNPJ", "Receita", "Despesa", "Saldo", ""].map((h, i) => (
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
                                <td style={{ padding: "8px 12px", whiteSpace: "nowrap" }}>{fmtData(e.data)}</td>
                                <td style={{ padding: "8px 12px" }}>
                                  <span title={MAP_CODIGO.get(e.codigo)} style={{ fontSize: 10, background: e.codigo.startsWith("1") ? "#EAF3DE" : "#FCEBEB", color: e.codigo.startsWith("1") ? "#1A5C38" : "#791F1F", padding: "2px 7px", borderRadius: 6, fontWeight: 600, cursor: "help" }}>{e.codigo}</span>
                                </td>
                                <td style={{ padding: "8px 12px", maxWidth: 280 }}>
                                  <div style={{ fontWeight: 500, color: "var(--text-1)" }}>{e.historico}</div>
                                  <div style={{ fontSize: 10, color: "#888" }}>{MAP_CODIGO.get(e.codigo)}</div>
                                </td>
                                <td style={{ padding: "8px 12px", fontSize: 11, color: "var(--text-2)" }}>{e.doc}</td>
                                <td style={{ padding: "8px 12px", fontSize: 11, color: "var(--text-2)" }}>{e.cpf_cnpj || "—"}</td>
                                <td style={{ padding: "8px 12px", textAlign: "right", color: e.receita > 0 ? "#1A5C38" : "var(--text-muted)", fontWeight: e.receita > 0 ? 600 : 400 }}>{e.receita > 0 ? fmtBRL(e.receita) : "—"}</td>
                                <td style={{ padding: "8px 12px", textAlign: "right", color: e.despesa > 0 ? "#E24B4A" : "var(--text-muted)", fontWeight: e.despesa > 0 ? 600 : 400 }}>{e.despesa > 0 ? fmtBRL(e.despesa) : "—"}</td>
                                <td style={{ padding: "8px 12px", textAlign: "right", fontWeight: 600, color: saldo >= 0 ? "var(--text-1)" : "#E24B4A" }}>{fmtBRL(saldo)}</td>
                                <td style={{ padding: "8px 6px" }}>
                                  {e.origem !== "auto" && (
                                    <button onClick={() => removerManual(e.id)} style={{ fontSize: 11, padding: "2px 7px", borderRadius: 6, border: "0.5px solid #E24B4A50", background: "#FCEBEB", color: "#791F1F", cursor: "pointer" }}>✕</button>
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
                          <td style={{ padding: "10px 12px", textAlign: "right", fontWeight: 700, color: "#1A5C38" }}>{fmtBRL(totalReceitas)}</td>
                          <td style={{ padding: "10px 12px", textAlign: "right", fontWeight: 700, color: "#E24B4A" }}>{fmtBRL(totalDespesas)}</td>
                          <td style={{ padding: "10px 12px", textAlign: "right", fontWeight: 700, color: saldoFinal >= 0 ? "#1A5C38" : "#E24B4A" }}>{fmtBRL(saldoFinal)}</td>
                          <td />
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                )}
              </div>
            )}

            {/* ══════════════ ABA: PLANO DE CONTAS LCDPR ══════════════ */}
            {aba === "plano" && (
              <div style={{ padding: 20 }}>
                {/* Cabeçalho explicativo */}
                <div style={{ background: "#F2F2F2", border: "0.5px solid #93C5FD", borderRadius: 10, padding: "12px 16px", marginBottom: 18, fontSize: 12, color: "#1e40af", lineHeight: 1.6 }}>
                  <strong>Como funciona:</strong> cada Operação Gerencial pode ter um código LCDPR associado. Quando um lançamento é baixado com uma OG mapeada, o código correto é atribuído automaticamente no Livro Caixa — sem depender do campo "categoria".
                </div>

                <div style={{ display: "flex", gap: 12, marginBottom: 18, fontSize: 12 }}>
                  <div style={{ background: "#EAF3DE", borderRadius: 8, padding: "8px 14px", color: "#1A5C38", fontWeight: 600 }}>{ogsMapeadas} OGs mapeadas</div>
                  <div style={{ background: "#FCEBEB", borderRadius: 8, padding: "8px 14px", color: "#791F1F", fontWeight: 600 }}>{ogsTotal - ogsMapeadas} sem código LCDPR</div>
                  <div style={{ background: "var(--bg-page)", borderRadius: 8, padding: "8px 14px", color: "var(--text-2)" }}>{ogsTotal} total de OGs</div>
                </div>

                {/* Seções por código */}
                {TODOS_CODIGOS.map(c => {
                  const lista = ogsPorCodigo.get(c.cod) ?? [];
                  if (!lista.length) return null;
                  const exp = expandidos.has(c.cod);
                  return (
                    <div key={c.cod} style={{ border: "0.5px solid var(--border-table)", borderRadius: 10, marginBottom: 8, overflow: "hidden" }}>
                      <button
                        onClick={() => toggleExpandido(c.cod)}
                        style={{ width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", background: "var(--bg-page)", border: "none", cursor: "pointer", textAlign: "left" }}
                      >
                        <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 5, background: c.cod.startsWith("1") ? "#EAF3DE" : "#FCEBEB", color: c.cod.startsWith("1") ? "#1A5C38" : "#791F1F" }}>{c.cod}</span>
                        <span style={{ fontWeight: 600, color: "var(--text-1)", fontSize: 13 }}>{c.desc}</span>
                        <span style={{ fontSize: 11, color: "var(--text-3)", marginLeft: "auto" }}>{lista.length} OG{lista.length !== 1 ? "s" : ""}</span>
                        <span style={{ fontSize: 11, color: "var(--text-3)" }}>{exp ? "▲" : "▼"}</span>
                      </button>
                      {exp && (
                        <table style={{ width: "100%", borderCollapse: "collapse" }}>
                          <tbody>
                            {lista.map(og => {
                              const codAtual = og.codigo_lcdpr ?? null;
                              const codEdit  = ogEditCodigos.get(og.id) ?? null;
                              const mudou    = codEdit !== codAtual;
                              return (
                                <tr key={og.id} style={{ borderTop: "0.5px solid var(--border-row)" }}>
                                  <td style={{ padding: "8px 14px", width: 130, color: "var(--text-2)", fontSize: 11, fontVariantNumeric: "tabular-nums" }}>{og.classificacao}</td>
                                  <td style={{ padding: "8px 14px", color: "var(--text-1)" }}>{toTitleCase(og.descricao ?? "")}</td>
                                  <td style={{ padding: "8px 14px", width: 220 }}>
                                    <select
                                      value={codEdit ?? ""}
                                      onChange={e => {
                                        const v = e.target.value || null;
                                        setOgEditCodigos(prev => new Map(prev).set(og.id, v));
                                      }}
                                      style={{ width: "100%", padding: "5px 8px", border: `0.5px solid ${mudou ? "#C9921B" : "var(--border-table)"}`, borderRadius: 6, fontSize: 12, color: "var(--text-1)", background: mudou ? "#FFFDF5" : "var(--bg-input)" }}
                                    >
                                      <option value="">— não incluir no LCDPR —</option>
                                      <optgroup label="Receitas">
                                        {CODIGOS_LCDPR.receita.map(cc => <option key={cc.cod} value={cc.cod}>{cc.cod} — {cc.desc}</option>)}
                                      </optgroup>
                                      <optgroup label="Despesas">
                                        {CODIGOS_LCDPR.despesa.map(cc => <option key={cc.cod} value={cc.cod}>{cc.cod} — {cc.desc}</option>)}
                                      </optgroup>
                                    </select>
                                  </td>
                                  <td style={{ padding: "8px 10px", width: 80, textAlign: "center" }}>
                                    {mudou && (
                                      <button
                                        onClick={() => salvarCodigoOG(og.id, ogEditCodigos.get(og.id) ?? null)}
                                        disabled={savingOgIds.has(og.id)}
                                        style={{ padding: "4px 12px", background: "#1A5C38", color: "#fff", border: "none", borderRadius: 6, fontWeight: 600, cursor: "pointer", fontSize: 11 }}
                                      >
                                        {savingOgIds.has(og.id) ? "..." : "Salvar"}
                                      </button>
                                    )}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      )}
                    </div>
                  );
                })}

                {/* OGs sem código */}
                {(() => {
                  const semCod = ogsPorCodigo.get(null) ?? [];
                  if (!semCod.length) return null;
                  const exp = expandidos.has("semcod");
                  return (
                    <div style={{ border: "0.5px solid #C9921B60", borderRadius: 10, marginTop: 8, overflow: "hidden" }}>
                      <button
                        onClick={() => toggleExpandido("semcod")}
                        style={{ width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", background: "#FFFDF5", border: "none", cursor: "pointer", textAlign: "left" }}
                      >
                        <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 5, background: "#FBF3E0", color: "#7A5A12" }}>—</span>
                        <span style={{ fontWeight: 600, color: "#7A5A12", fontSize: 13 }}>Sem código LCDPR</span>
                        <span style={{ fontSize: 11, color: "#7A5A12", marginLeft: "auto" }}>{semCod.length} OG{semCod.length !== 1 ? "s" : ""} — lançamentos com essas OGs usarão o código automático</span>
                        <span style={{ fontSize: 11, color: "#7A5A12" }}>{exp ? "▲" : "▼"}</span>
                      </button>
                      {exp && (
                        <table style={{ width: "100%", borderCollapse: "collapse" }}>
                          <tbody>
                            {semCod.map(og => {
                              const codEdit = ogEditCodigos.get(og.id) ?? null;
                              const mudou   = codEdit !== null;
                              return (
                                <tr key={og.id} style={{ borderTop: "0.5px solid var(--border-row)" }}>
                                  <td style={{ padding: "8px 14px", width: 130, color: "var(--text-2)", fontSize: 11 }}>{og.classificacao}</td>
                                  <td style={{ padding: "8px 14px", color: "var(--text-1)" }}>{toTitleCase(og.descricao ?? "")}</td>
                                  <td style={{ padding: "8px 14px", width: 220 }}>
                                    <select
                                      value={codEdit ?? ""}
                                      onChange={e => {
                                        const v = e.target.value || null;
                                        setOgEditCodigos(prev => new Map(prev).set(og.id, v));
                                      }}
                                      style={{ width: "100%", padding: "5px 8px", border: `0.5px solid ${mudou ? "#C9921B" : "var(--border-table)"}`, borderRadius: 6, fontSize: 12, color: "var(--text-1)", background: mudou ? "#FFFDF5" : "var(--bg-input)" }}
                                    >
                                      <option value="">— não incluir no LCDPR —</option>
                                      <optgroup label="Receitas">
                                        {CODIGOS_LCDPR.receita.map(cc => <option key={cc.cod} value={cc.cod}>{cc.cod} — {cc.desc}</option>)}
                                      </optgroup>
                                      <optgroup label="Despesas">
                                        {CODIGOS_LCDPR.despesa.map(cc => <option key={cc.cod} value={cc.cod}>{cc.cod} — {cc.desc}</option>)}
                                      </optgroup>
                                    </select>
                                  </td>
                                  <td style={{ padding: "8px 10px", width: 80, textAlign: "center" }}>
                                    {mudou && (
                                      <button
                                        onClick={() => salvarCodigoOG(og.id, ogEditCodigos.get(og.id) ?? null)}
                                        disabled={savingOgIds.has(og.id)}
                                        style={{ padding: "4px 12px", background: "#1A5C38", color: "#fff", border: "none", borderRadius: 6, fontWeight: 600, cursor: "pointer", fontSize: 11 }}
                                      >
                                        {savingOgIds.has(og.id) ? "..." : "Salvar"}
                                      </button>
                                    )}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      )}
                    </div>
                  );
                })()}
              </div>
            )}

            {/* ══════════════ ABA: IMPORTAÇÃO ══════════════ */}
            {aba === "importacao" && (
              <div style={{ padding: 24 }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24, alignItems: "start" }}>

                  {/* Coluna esquerda: upload */}
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 14, color: "var(--text-1)", marginBottom: 12 }}>Importar lançamentos via planilha</div>
                    <div style={{ fontSize: 12, color: "var(--text-2)", lineHeight: 1.7, marginBottom: 16 }}>
                      Importe lançamentos históricos ou de sistemas externos. Use o modelo para garantir o formato correto.
                      Lançamentos importados <strong>não são salvos no banco</strong> — ficam na sessão atual e podem ser exportados junto com os automáticos.
                    </div>

                    <button onClick={baixarModelo} style={{ ...btnPrimario, background: "var(--bg-card)", color: "var(--text-1)", border: "0.5px solid var(--border-table)", marginBottom: 16, display: "flex", alignItems: "center", gap: 6 }}>
                      ⬇ Baixar modelo Excel
                    </button>

                    {/* Drop zone */}
                    <div
                      onClick={() => importRef.current?.click()}
                      onDragOver={e => { e.preventDefault(); e.currentTarget.style.borderColor = "#1A5C38"; }}
                      onDragLeave={e => { e.currentTarget.style.borderColor = "var(--border-table)"; }}
                      onDrop={e => { e.preventDefault(); e.currentTarget.style.borderColor = "var(--border-table)"; const f = e.dataTransfer.files[0]; if (f) handleImportFile(f); }}
                      style={{ border: "1.5px dashed var(--border-table)", borderRadius: 10, padding: "28px 20px", textAlign: "center", cursor: "pointer", transition: "border-color 0.2s" }}
                    >
                      <div style={{ fontSize: 24, marginBottom: 8 }}>📂</div>
                      <div style={{ fontWeight: 600, color: "var(--text-1)" }}>
                        {importLoading ? "Processando..." : "Arraste o arquivo ou clique para selecionar"}
                      </div>
                      <div style={{ fontSize: 11, color: "var(--text-3)", marginTop: 4 }}>XLS, XLSX ou CSV</div>
                    </div>
                    <input ref={importRef} type="file" accept=".xls,.xlsx,.csv" style={{ display: "none" }}
                      onChange={e => { const f = e.target.files?.[0]; if (f) handleImportFile(f); e.target.value = ""; }} />

                    {importFeedback && (
                      <div style={{ marginTop: 12, background: "#EAF3DE", borderRadius: 8, padding: "8px 14px", color: "#1A5C38", fontSize: 12, fontWeight: 600 }}>
                        {importFeedback}
                      </div>
                    )}
                  </div>

                  {/* Coluna direita: campos esperados */}
                  <div style={{ background: "var(--bg-page)", borderRadius: 10, padding: "16px 18px", border: "0.5px solid var(--border-table)" }}>
                    <div style={{ fontWeight: 600, color: "var(--text-1)", marginBottom: 12 }}>Colunas esperadas na planilha</div>
                    {[
                      { col: "Data", desc: "DD/MM/AAAA ou AAAA-MM-DD", req: true },
                      { col: "Histórico", desc: "Descrição do lançamento", req: true },
                      { col: "Documento", desc: "NF-e, Recibo, PIX, Boleto…", req: false },
                      { col: "CPF/CNPJ", desc: "Contraparte (opcional)", req: false },
                      { col: "Código LCDPR", desc: "101 a 199 (receita) ou 201 a 299 (despesa)", req: false },
                      { col: "Tipo", desc: "Receita ou Despesa", req: true },
                      { col: "Valor", desc: "Número com vírgula. Ex: 185.000,00", req: true },
                    ].map(f => (
                      <div key={f.col} style={{ display: "flex", gap: 8, marginBottom: 7, fontSize: 12 }}>
                        <span style={{ fontWeight: 600, color: "var(--text-1)", minWidth: 120 }}>{f.col}{f.req ? " *" : ""}</span>
                        <span style={{ color: "var(--text-2)" }}>{f.desc}</span>
                      </div>
                    ))}
                    <div style={{ marginTop: 10, fontSize: 11, color: "var(--text-3)" }}>* obrigatório</div>
                    <div style={{ marginTop: 14, borderTop: "0.5px solid var(--border-table)", paddingTop: 12 }}>
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

                {/* Preview da importação */}
                {importRows.length > 0 && (
                  <div style={{ marginTop: 24 }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                      <div style={{ fontWeight: 600, color: "var(--text-1)" }}>
                        Preview — {importRows.length} linha{importRows.length !== 1 ? "s" : ""} &nbsp;
                        <span style={{ fontSize: 11, color: "#1A5C38" }}>✓ {importRows.filter(r => r._status === "ok").length} ok</span>
                        {importRows.some(r => r._status === "erro") && (
                          <span style={{ fontSize: 11, color: "#E24B4A", marginLeft: 8 }}>✕ {importRows.filter(r => r._status === "erro").length} com erro</span>
                        )}
                      </div>
                      <div style={{ display: "flex", gap: 8 }}>
                        <button onClick={() => setImportRows([])} style={{ padding: "6px 14px", border: "0.5px solid var(--border-table)", borderRadius: 8, background: "var(--bg-card)", color: "var(--text-1)", cursor: "pointer", fontSize: 12 }}>Cancelar</button>
                        <button
                          onClick={confirmarImport}
                          disabled={!importRows.some(r => r._status === "ok")}
                          style={{ ...btnPrimario, fontSize: 12, padding: "6px 14px", opacity: importRows.some(r => r._status === "ok") ? 1 : 0.5 }}
                        >
                          ✓ Adicionar {importRows.filter(r => r._status === "ok").length} ao Livro Caixa
                        </button>
                      </div>
                    </div>
                    <div style={{ overflowX: "auto" }}>
                      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                        <thead>
                          <tr style={{ background: "var(--bg-page)" }}>
                            {["Status", "Data", "Cód.", "Histórico", "Documento", "CPF/CNPJ", "Receita", "Despesa"].map((h, i) => (
                              <th key={i} style={{ padding: "6px 10px", textAlign: "left", fontSize: 11, color: "var(--text-2)", borderBottom: "0.5px solid var(--border-table)", whiteSpace: "nowrap" }}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {importRows.map((r, i) => (
                            <tr key={i} style={{ borderBottom: "0.5px solid var(--border-row)", background: r._status === "erro" ? "#FFF5F5" : "transparent" }}>
                              <td style={{ padding: "6px 10px" }}>
                                {r._status === "ok"
                                  ? <span style={{ color: "#1A5C38", fontWeight: 600 }}>✓</span>
                                  : <span title={r._msg} style={{ color: "#E24B4A", fontWeight: 600, cursor: "help" }}>✕ {r._msg}</span>
                                }
                              </td>
                              <td style={{ padding: "6px 10px", whiteSpace: "nowrap" }}>{r.data ? fmtData(r.data) : "—"}</td>
                              <td style={{ padding: "6px 10px" }}>
                                <span style={{ fontSize: 10, background: r.codigo.startsWith("1") ? "#EAF3DE" : "#FCEBEB", color: r.codigo.startsWith("1") ? "#1A5C38" : "#791F1F", padding: "1px 5px", borderRadius: 4, fontWeight: 600 }}>{r.codigo}</span>
                              </td>
                              <td style={{ padding: "6px 10px", maxWidth: 240, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.historico || "—"}</td>
                              <td style={{ padding: "6px 10px", color: "var(--text-2)" }}>{r.doc}</td>
                              <td style={{ padding: "6px 10px", color: "var(--text-2)" }}>{r.cpf_cnpj || "—"}</td>
                              <td style={{ padding: "6px 10px", textAlign: "right", color: "#1A5C38" }}>{r.receita > 0 ? fmtBRL(r.receita) : "—"}</td>
                              <td style={{ padding: "6px 10px", textAlign: "right", color: "#E24B4A" }}>{r.despesa > 0 ? fmtBRL(r.despesa) : "—"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ══════════════ ABA: RESUMO ANUAL ══════════════ */}
            {aba === "resumo" && (
              <div style={{ padding: 20 }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
                  <div>
                    <div style={{ fontWeight: 600, color: "var(--text-1)", marginBottom: 12 }}>Movimentação mensal — {anoSel}</div>
                    <table style={{ width: "100%", borderCollapse: "collapse" }}>
                      <thead>
                        <tr style={{ background: "var(--bg-page)" }}>
                          {["Mês", "Receitas", "Despesas", "Resultado"].map((h, i) => (
                            <th key={i} style={{ padding: "7px 10px", textAlign: i === 0 ? "left" : "right", fontSize: 11, fontWeight: 600, color: "var(--text-2)", borderBottom: "0.5px solid var(--border-table)" }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {meses.map((m, i) => {
                          const res = m.rec - m.desp;
                          const tem = m.rec > 0 || m.desp > 0;
                          return (
                            <tr key={i} style={{ borderBottom: "0.5px solid var(--border-row)", opacity: tem ? 1 : 0.4 }}>
                              <td style={{ padding: "7px 10px", color: "var(--text-1)", textTransform: "capitalize" }}>{m.mes}</td>
                              <td style={{ padding: "7px 10px", textAlign: "right", color: "#1A5C38", fontWeight: m.rec > 0 ? 600 : 400 }}>{m.rec > 0 ? fmtBRL(m.rec) : "—"}</td>
                              <td style={{ padding: "7px 10px", textAlign: "right", color: "#E24B4A", fontWeight: m.desp > 0 ? 600 : 400 }}>{m.desp > 0 ? fmtBRL(m.desp) : "—"}</td>
                              <td style={{ padding: "7px 10px", textAlign: "right", fontWeight: tem ? 600 : 400, color: res >= 0 ? "#1A5C38" : "#E24B4A" }}>{tem ? fmtBRL(res) : "—"}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  <div>
                    <div style={{ fontWeight: 600, color: "var(--text-1)", marginBottom: 12 }}>Por código LCDPR</div>
                    {porCodigo.length === 0 ? (
                      <div style={{ color: "var(--text-3)", fontSize: 12 }}>Sem lançamentos no período.</div>
                    ) : (
                      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                        {porCodigo.map(c => (
                          <div key={c.cod} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", background: "var(--bg-card)", borderRadius: 8, border: "0.5px solid var(--border-row)" }}>
                            <span style={{ fontSize: 11, background: c.tipo === "receita" ? "#EAF3DE" : "#FCEBEB", color: c.tipo === "receita" ? "#1A5C38" : "#791F1F", padding: "2px 7px", borderRadius: 6, fontWeight: 600, flexShrink: 0 }}>{c.cod}</span>
                            <span style={{ flex: 1, fontSize: 12, color: "var(--text-1)" }}>{c.desc}</span>
                            <span style={{ fontWeight: 700, color: c.tipo === "receita" ? "#1A5C38" : "#E24B4A" }}>{fmtBRL(c.total)}</span>
                          </div>
                        ))}
                      </div>
                    )}
                    <div style={{ marginTop: 16, background: "var(--bg-page)", borderRadius: 10, padding: "14px 16px", border: "0.5px solid var(--border-table)" }}>
                      <div style={{ fontSize: 11, color: "var(--text-2)", marginBottom: 8 }}>Resultado apurado {anoSel}</div>
                      {[
                        { label: "(+) Total Receitas",    valor: totalReceitas,  cor: "#1A5C38" },
                        { label: "(-) Total Despesas",    valor: -totalDespesas, cor: "#E24B4A" },
                        { label: "(=) Resultado Líquido", valor: totalReceitas - totalDespesas, cor: (totalReceitas - totalDespesas) >= 0 ? "#1A5C38" : "#E24B4A", bold: true },
                      ].map((l, i) => (
                        <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "5px 0", borderBottom: i < 2 ? "0.5px solid var(--border-row)" : "none" }}>
                          <span style={{ fontSize: 12, color: "var(--text-2)" }}>{l.label}</span>
                          <span style={{ fontWeight: l.bold ? 700 : 500, color: l.cor, fontSize: l.bold ? 14 : 12 }}>{fmtBRL(Math.abs(l.valor))}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* ══════════════ ABA: EXPORTAÇÃO ══════════════ */}
            {aba === "exportacao" && (
              <div style={{ padding: 28 }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>
                  {/* Coluna esquerda — filtros e ações */}
                  <div>
                    <div style={{ fontWeight: 600, color: "var(--text-1)", marginBottom: 16, fontSize: 14 }}>Filtros de exportação</div>

                    {/* Filtro Produtor / CPF */}
                    <div style={{ marginBottom: 14 }}>
                      <label style={lblS}>Produtor / CPF</label>
                      <select
                        value={cpfFiltro}
                        onChange={e => setCpfFiltro(e.target.value)}
                        style={inpS}
                      >
                        <option value="todos">Consolidado — todas as fazendas</option>
                        {produtoresLcdpr.map(p => (
                          <option key={p.cpf} value={p.cpf}>
                            {p.cpf} — {p.nome}
                          </option>
                        ))}
                      </select>
                      {produtoresLcdpr.length === 0 && (
                        <div style={{ fontSize: 11, color: "#C9921B", marginTop: 4 }}>
                          Configure o CPF/CNPJ fiscal em Cadastros → Fazendas para filtrar por produtor.
                        </div>
                      )}
                    </div>

                    {/* Modo: Anual / Mensal */}
                    <div style={{ marginBottom: 14 }}>
                      <label style={lblS}>Período</label>
                      <div style={{ display: "flex", gap: 8 }}>
                        {(["anual", "mensal"] as const).map(m => (
                          <button
                            key={m}
                            onClick={() => setModoExport(m)}
                            style={{
                              padding: "7px 18px", border: "0.5px solid var(--border-table)", borderRadius: 8,
                              background: modoExport === m ? "#1A4870" : "var(--bg-card)",
                              color: modoExport === m ? "#fff" : "var(--text-1)",
                              fontWeight: modoExport === m ? 600 : 400,
                              cursor: "pointer", fontSize: 13, textTransform: "capitalize",
                            }}
                          >{m === "anual" ? "Anual" : "Mensal"}</button>
                        ))}
                      </div>
                    </div>

                    {/* Seletor de mês (apenas no modo mensal) */}
                    {modoExport === "mensal" && (
                      <div style={{ marginBottom: 14 }}>
                        <label style={lblS}>Competência (mês)</label>
                        <select value={mesExport} onChange={e => setMesExport(Number(e.target.value))} style={inpS}>
                          {Array.from({ length: 12 }, (_, i) => i + 1).map(m => (
                            <option key={m} value={m}>
                              {new Date(anoSel, m - 1, 1).toLocaleString("pt-BR", { month: "long" })} / {anoSel}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}

                    {/* Resumo do período selecionado */}
                    <div style={{ background: "var(--bg-page)", borderRadius: 10, padding: "12px 14px", border: "0.5px solid var(--border-table)", marginBottom: 20 }}>
                      {[
                        { label: "Período", val: modoExport === "anual" ? `01/01/${anoSel} a 31/12/${anoSel}` : `${new Date(anoSel, mesExport - 1, 1).toLocaleString("pt-BR", { month: "long" })} de ${anoSel}` },
                        { label: "Lançamentos", val: `${entradasExport.length} registros` },
                        { label: "Total receitas", val: fmtBRL(entradasExport.reduce((s, e) => s + e.receita, 0)) },
                        { label: "Total despesas", val: fmtBRL(entradasExport.reduce((s, e) => s + e.despesa, 0)) },
                        { label: "Prazo entrega", val: `30/06/${anoSel + 1}` },
                      ].map((r, i) => (
                        <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "5px 0", borderBottom: i < 4 ? "0.5px solid var(--border-row)" : "none" }}>
                          <span style={{ fontSize: 12, color: "var(--text-2)" }}>{r.label}</span>
                          <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-1)" }}>{r.val}</span>
                        </div>
                      ))}
                    </div>

                    {/* Botões de exportação */}
                    <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                      <button
                        onClick={gerarLCDPROficial}
                        style={{ ...btnPrimario, background: "#1A4870", display: "flex", alignItems: "center", gap: 6 }}
                      >
                        ⬇ Layout Oficial .txt
                      </button>
                      <button
                        onClick={() => {
                          const sfx = modoExport === "mensal" ? `${anoSel}_${String(mesExport).padStart(2,"0")}` : String(anoSel);
                          let csv = "DATA;CODIGO;HISTORICO;DOCUMENTO;CPF_CNPJ;RECEITA;DESPESA\n";
                          entradasExport.forEach(e => {
                            csv += `${e.data};${e.codigo};"${e.historico}";${e.doc};${e.cpf_cnpj};${e.receita.toFixed(2)};${e.despesa.toFixed(2)}\n`;
                          });
                          const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
                          const url = URL.createObjectURL(blob);
                          const a = document.createElement("a"); a.href = url;
                          a.download = `LCDPR_${sfx}.csv`; a.click();
                          URL.revokeObjectURL(url);
                        }}
                        style={{ ...btnPrimario, background: "#555" }}
                      >⬇ CSV</button>
                      <button
                        onClick={async () => {
                          const XLSX = await import("xlsx");
                          const sfx = modoExport === "mensal" ? `${anoSel}_${String(mesExport).padStart(2,"0")}` : String(anoSel);
                          const dados = entradasExport.map(e => ({
                            Data: e.data, Código: e.codigo, "Desc. Código": MAP_CODIGO.get(e.codigo) ?? "",
                            Histórico: e.historico, Documento: e.doc, "CPF/CNPJ": e.cpf_cnpj,
                            "Receita (R$)": e.receita, "Despesa (R$)": e.despesa,
                          }));
                          const ws = XLSX.utils.json_to_sheet(dados);
                          const wb = XLSX.utils.book_new();
                          XLSX.utils.book_append_sheet(wb, ws, `LCDPR ${sfx}`);
                          XLSX.writeFile(wb, `LCDPR_${sfx}.xlsx`);
                        }}
                        style={{ ...btnPrimario, background: "#111111" }}
                      >⬇ Excel</button>
                    </div>
                  </div>

                  {/* Coluna direita — info layout oficial */}
                  <div>
                    <div style={{ background: "var(--bg-card)", border: "0.5px solid var(--border-table)", borderRadius: 12, padding: "18px 20px", marginBottom: 16 }}>
                      <div style={{ fontWeight: 600, color: "var(--text-1)", marginBottom: 10 }}>Sobre o layout oficial (.txt)</div>
                      <div style={{ fontSize: 12, color: "var(--text-2)", lineHeight: 1.8, marginBottom: 12 }}>
                        O arquivo gerado segue o <strong>Leiaute 3 do LCDPR</strong> (IN RFB 1.848/2018), formato pipe-delimited, compatível com importação direta no <strong>PGE da Receita Federal</strong>.
                      </div>
                      <div style={{ fontWeight: 600, color: "var(--text-1)", marginBottom: 8, fontSize: 12 }}>Registros gerados</div>
                      {[
                        { reg: "0000", desc: "Abertura do arquivo" },
                        { reg: "0001", desc: "Abertura Bloco 0" },
                        { reg: "0010", desc: "Exercício / CPF" },
                        { reg: "0990", desc: "Encerramento Bloco 0" },
                        { reg: "LC01", desc: "Abertura Bloco LC" },
                        { reg: "LC10", desc: "Imóvel rural (por fazenda)" },
                        { reg: `LC20 ×${entradasExport.length}`, desc: "Lançamentos caixa" },
                        { reg: "LC99", desc: "Encerramento Bloco LC" },
                        { reg: "9001/9990/9999", desc: "Encerramento arquivo" },
                      ].map((r, i) => (
                        <div key={i} style={{ display: "flex", gap: 10, marginBottom: 5, fontSize: 11 }}>
                          <span style={{ fontWeight: 700, color: "#1A4870", minWidth: 80, fontFamily: "monospace" }}>{r.reg}</span>
                          <span style={{ color: "var(--text-2)" }}>{r.desc}</span>
                        </div>
                      ))}
                    </div>
                    <div style={{ background: "var(--bg-card)", border: "0.5px solid var(--border-table)", borderRadius: 12, padding: "18px 20px" }}>
                      <div style={{ fontWeight: 600, color: "var(--text-1)", marginBottom: 12 }}>Quem deve entregar</div>
                      {["Produtor rural Pessoa Física", "Receita bruta rural acima de R$ 56.112,00", "Optante pela escrituração pelo Livro Caixa", "Cônjuge com atividade rural em separado"].map((t, i) => (
                        <div key={i} style={{ display: "flex", gap: 8, marginBottom: 7, fontSize: 12 }}>
                          <span style={{ color: "#1A5C38", flexShrink: 0 }}>✓</span>
                          <span style={{ color: "var(--text-2)" }}>{t}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Modal — lançamento manual */}
      {modalManual && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(11,45,80,0.28)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 2000 }}>
          <div style={{ background: "var(--bg-card)", borderRadius: 14, padding: 28, width: 480, boxShadow: "0 4px 20px rgba(11,45,80,0.10)" }}>
            <div style={{ fontWeight: 600, fontSize: 15, color: "var(--text-1)", marginBottom: 20 }}>Lançamento Manual LCDPR</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
              <div>
                <label style={lblS}>Data *</label>
                <input style={inpS} type="date" value={fManual.data} onChange={e => setFManual(p => ({ ...p, data: e.target.value }))} />
              </div>
              <div>
                <label style={lblS}>Tipo *</label>
                <select style={inpS} value={fManual.tipo} onChange={e => setFManual(p => ({ ...p, tipo: e.target.value as "receita" | "despesa", codigo: e.target.value === "receita" ? "101" : "201" }))}>
                  <option value="receita">Receita</option>
                  <option value="despesa">Despesa</option>
                </select>
              </div>
              <div style={{ gridColumn: "1/-1" }}>
                <label style={lblS}>Histórico *</label>
                <input style={inpS} value={fManual.historico} onChange={e => setFManual(p => ({ ...p, historico: e.target.value }))} placeholder="Descrição do lançamento" />
              </div>
              <div>
                <label style={lblS}>Código LCDPR *</label>
                <select style={inpS} value={fManual.codigo} onChange={e => setFManual(p => ({ ...p, codigo: e.target.value }))}>
                  {(fManual.tipo === "receita" ? CODIGOS_LCDPR.receita : CODIGOS_LCDPR.despesa).map(c => (
                    <option key={c.cod} value={c.cod}>{c.cod} — {c.desc}</option>
                  ))}
                </select>
              </div>
              <div>
                <label style={lblS}>Valor R$ *</label>
                <InputMonetario style={inpS} value={fManual.valor} onChange={v => setFManual(p => ({ ...p, valor: v }))} placeholder="0,00" />
              </div>
              <div>
                <label style={lblS}>Documento</label>
                <input style={inpS} value={fManual.doc} onChange={e => setFManual(p => ({ ...p, doc: e.target.value }))} placeholder="NF, Recibo, PIX..." />
              </div>
              <div>
                <label style={lblS}>CPF / CNPJ</label>
                <input style={inpS} value={fManual.cpf_cnpj} onChange={e => setFManual(p => ({ ...p, cpf_cnpj: e.target.value }))} placeholder="000.000.000-00" />
              </div>
            </div>
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 20 }}>
              <button onClick={() => setModalManual(false)} style={{ padding: "8px 18px", border: "0.5px solid var(--border-table)", borderRadius: 8, background: "var(--bg-card)", cursor: "pointer", fontSize: 13, color: "var(--text-1)" }}>Cancelar</button>
              <button onClick={adicionarManual} style={{ ...btnPrimario, padding: "8px 20px" }}>Adicionar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
