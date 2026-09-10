"use client";
import { useState, useEffect, useMemo, useRef } from "react";
import TopNav from "../../components/TopNav";
import InputNumerico from "../../components/InputNumerico";
import { useAuth } from "../../components/AuthProvider";
import {
  listarLancamentos,
  listarProdutoresDaConta,
} from "../../lib/db";
import { supabase } from "../../lib/supabase";
import type { Lancamento } from "../../lib/supabase";
import PlanoGate from "../../components/PlanoGate";

// ─── Leiaute oficial do LCDPR — Anexo ao Ato Declaratório Executivo COPES nº
// 1/2020 (leiaute 1.3), confirmado registro a registro contra o Manual de
// Preenchimento publicado em gov.br/receitafederal. O arquivo tem só 3 blocos:
// Bloco 0 (0000/0010/0030/0040/0045/0050), Bloco Q (Q100/Q200), Bloco 9 (9999).
// Não existem os registros "LC01/LC10/LC20/LC99" nem um esquema de 10
// categorias de receita/despesa — o único campo de classificação real é
// Q100.TIPO_LANC, com apenas 3 valores possíveis.

const COD_VERSAO = "0013"; // leiaute 1.3

// Tipo de Documento (Q100.TIPO_DOC) — 6 valores oficiais
const TIPO_DOC_LABEL: Record<string, string> = {
  "1": "Nota Fiscal", "2": "Fatura", "3": "Recibo",
  "4": "Contrato", "5": "Folha de Pagamento", "6": "Outros",
};
function mapTipoDoc(s?: string): string {
  const l = (s ?? "").toUpperCase();
  if (l === "NF" || l.includes("NOTA FISCAL")) return "1";
  if (l === "FATURA" || l === "DUPLICATA") return "2";
  if (l === "RECIBO") return "3";
  if (l === "CONTRATO") return "4";
  if (l === "FOLHA" || l.includes("FOLHA")) return "5";
  return "6"; // BOLETO, CHEQUE, PIX, TED, OUTROS e qualquer valor não mapeado
}

// Tipo de Lançamento (Q100.TIPO_LANC) — o único código de classificação que
// existe de verdade no arquivo. 1=Receita · 2=Despesa (custeio+investimento) ·
// 3=Receita de produtos entregues no ano referente a adiantamento (barter).
function tipoLancDe(l: Lancamento): "1" | "2" | "3" {
  if (l.tipo === "receber" && l.moeda === "barter") return "3";
  return l.tipo === "receber" ? "1" : "2";
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
  tipoDoc: string;      // "1"–"6"
  numDoc: string;
  cpfCnpj: string;
  tipoLanc: "1" | "2" | "3";
  fazendaId: string;
  contaBancariaRef: string; // valor bruto de lancamentos.conta_bancaria (uuid ou texto)
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
  nirf: string | null; itr: string | null; municipio: string | null;
  estado: string | null; area_total_ha: number | null;
  caepf: string | null;
  tipo_exploracao: number | null;
  participacao_lcdpr: number | null;
  municipio_ibge: string | null;
  arrendada?: boolean | null;
  cep: string | null; logradouro: string | null; numero_end: string | null;
  complemento: string | null; bairro: string | null;
}

interface ContaLcdpr {
  id: string;
  nome: string;
  banco: string | null;
  banco_id: string | null;
  codigo_bacen: string | null;
  agencia: string | null;
  conta: string | null;
  conta_dv: string | null;
  tipo_conta: string;
  produtor_id: string | null;
  fazenda_id: string;
}

interface ContadorInfo {
  nome: string; cpf_cnpj: string; crc: string; email: string; telefone: string;
}
const CONTADOR_VAZIO: ContadorInfo = { nome: "", cpf_cnpj: "", crc: "", email: "", telefone: "" };

interface ImportRow {
  data: string; historico: string; tipoDoc: string;
  cpfCnpj: string; tipo: "receber" | "pagar"; valor: number;
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
// Formatação de valor monetário/numérico pro leiaute: sem separador de milhar,
// vírgula decimal removida, sempre 2 casas. Ex: 1129998,99 -> "112999899"
const fmtValorLC = (v: number) => Math.round((v ?? 0) * 100).toString();
const fmtDataLC  = (iso: string) => { if (!iso || iso.length < 10) return ""; const [y, m, d] = iso.split("-"); return `${d}${m}${y}`; };
const TIPO_EXPLORACAO_LABEL: Record<number, string> = {
  1: "Individual (imóvel próprio)", 2: "Condomínio", 3: "Imóvel arrendado",
  4: "Parceria", 5: "Comodato", 6: "Outros",
};

type Aba = "livro" | "participacoes" | "cadastro" | "importacao" | "exportacao";

// ═════════════════════════════════════════════════════════════════════════════
export default function LCDPR() {
  const { fazendaId, fazendaIds, contaId, podeAcessarPlano } = useAuth();

  const [aba, setAba]         = useState<Aba>("livro");
  const [anoSel, setAnoSel]   = useState(anoAtual);
  const [loading, setLoading] = useState(true);
  const [entradas, setEntradas] = useState<EntradaLCDPR[]>([]);

  const [config, setConfig]       = useState<ConfigLCDPR>(CONFIG_VAZIA);
  const [savingCfg, setSavingCfg] = useState(false);

  const [fazDados, setFazDados]               = useState<FazLcdpr[]>([]);
  const [produtoresDados, setProdutoresDados] = useState<ProdutorLcdpr[]>([]);
  const [contasDados, setContasDados]         = useState<ContaLcdpr[]>([]);
  const [bancosMap, setBancosMap]             = useState<Map<string, string>>(new Map()); // nome normalizado → codigo_compe
  const [pessoasCpfMap, setPessoasCpfMap]     = useState<Map<string, string>>(new Map()); // pessoa_id → cpf_cnpj

  const [contador, setContador]         = useState<ContadorInfo>(CONTADOR_VAZIO);
  const [savingContador, setSavingContador] = useState(false);
  const [fazEdit, setFazEdit]           = useState<Map<string, Partial<FazLcdpr>>>(new Map());
  const [savingFazIds, setSavingFazIds] = useState<Set<string>>(new Set());

  const [modalManual, setModalManual] = useState(false);
  const [fManual, setFManual] = useState({
    data: hoje(), historico: "", tipoDoc: "6", cpfCnpj: "",
    valor: 0, tipo: "receita" as "receita" | "despesa",
  });

  const importRef = useRef<HTMLInputElement>(null);
  const [importRows, setImportRows]         = useState<ImportRow[]>([]);
  const [importLoading, setImportLoading]   = useState(false);
  const [importFeedback, setImportFeedback] = useState("");

  const [produtorFiltro, setProdutorFiltro] = useState("todos");
  const [modoExport, setModoExport]         = useState<"anual" | "mensal">("anual");
  const [mesExport, setMesExport]           = useState(new Date().getMonth() + 1);
  const [formatoExport, setFormatoExport]   = useState<"txt" | "xlsx" | "pdf">("txt");

  // ── Carga principal ────────────────────────────────────────────────────────
  useEffect(() => {
    const ids = fazendaIds?.length ? fazendaIds : fazendaId ? [fazendaId] : [];
    if (!ids.length) return;
    setLoading(true);
    const sb = supabase;

    Promise.all([
      Promise.all(ids.map(fid => listarLancamentos(fid))).then(all => all.flat()),
      sb.from("apoio_baixas").select("lancamento_id").in("fazenda_id", ids),
      sb.from("fazendas").select("id,nome,produtor_id,cpf_cnpj_fiscal,nirf,itr,municipio,estado,area_total_ha,arrendada,cep,logradouro,numero_end,complemento,bairro,caepf,tipo_exploracao,participacao_lcdpr,municipio_ibge").in("id", ids),
      contaId ? listarProdutoresDaConta(contaId) : Promise.resolve([]),
      fazendaId
        ? sb.from("configuracoes_modulo").select("config").eq("fazenda_id", fazendaId).eq("modulo", "lcdpr").maybeSingle()
        : Promise.resolve({ data: null }),
      sb.from("contas_bancarias").select("id,nome,banco,banco_id,codigo_bacen,agencia,conta,conta_dv,tipo_conta,produtor_id,fazenda_id").in("fazenda_id", ids).eq("ativa", true),
      sb.from("bancos").select("nome,nome_curto,codigo_compe"),
      sb.from("pessoas").select("id,cpf_cnpj").in("fazenda_id", ids),
      contaId ? sb.from("lcdpr_contador").select("*").eq("conta_id", contaId).maybeSingle() : Promise.resolve({ data: null }),
    ]).then(([lans, { data: apoioBaixas }, { data: fazRows }, prodRows, { data: cfgRow }, { data: contasRows }, { data: bancosRows }, { data: pessoasRows }, { data: contadorRow }]) => {
      setFazDados((fazRows ?? []) as FazLcdpr[]);
      setProdutoresDados(
        (prodRows ?? [])
          .map((p: { id: string; nome: string; cpf_cnpj?: string }) => ({ id: p.id, nome: p.nome, cpf: cpfNum(p.cpf_cnpj ?? "") }))
          .filter((p: ProdutorLcdpr) => p.cpf.length === 11)
      );
      setConfig((cfgRow as { config?: ConfigLCDPR } | null)?.config ?? CONFIG_VAZIA);
      setContasDados((contasRows ?? []) as ContaLcdpr[]);

      const bMap = new Map<string, string>();
      for (const b of (bancosRows ?? []) as { nome: string; nome_curto?: string; codigo_compe: string }[]) {
        bMap.set(b.nome.toLowerCase(), b.codigo_compe);
        if (b.nome_curto) bMap.set(b.nome_curto.toLowerCase(), b.codigo_compe);
      }
      setBancosMap(bMap);

      const pMap = new Map<string, string>();
      for (const p of (pessoasRows ?? []) as { id: string; cpf_cnpj?: string }[]) if (p.cpf_cnpj) pMap.set(p.id, p.cpf_cnpj);
      setPessoasCpfMap(pMap);

      if (contadorRow) setContador({
        nome: contadorRow.nome ?? "", cpf_cnpj: contadorRow.cpf_cnpj ?? "", crc: contadorRow.crc ?? "",
        email: contadorRow.email ?? "", telefone: contadorRow.telefone ?? "",
      });

      const apoioIds = new Set((apoioBaixas ?? []).map((b: { lancamento_id: string }) => b.lancamento_id));

      const filtrados = lans.filter((l: Lancamento) => {
        // LCDPR é regime de caixa — só o que realmente baixou entra. "Previsão" é
        // rascunho de planejamento, pode ter valor/data ainda alterados antes de confirmar.
        if (l.status !== "baixado") return false;
        if (apoioIds.has(l.id)) return false;
        if (l.entidade_contabil !== "pf") return false;
        // vinculo_atividade nulo é tratado como rural (comportamento atual da imensa
        // maioria dos lançamentos) — só exclui quando está explicitamente marcado como
        // outra coisa (investimento, pessoa física, não tributável).
        if (l.vinculo_atividade && l.vinculo_atividade !== "rural") return false;
        const dt = l.data_baixa ?? l.data_vencimento ?? l.data_lancamento ?? "";
        return dt.slice(0, 4) === String(anoSel);
      });

      const items: EntradaLCDPR[] = filtrados.map((l: Lancamento) => ({
        id: l.id,
        data: l.data_baixa ?? l.data_vencimento ?? l.data_lancamento ?? "",
        historico: l.descricao ?? l.categoria ?? "",
        tipoDoc: mapTipoDoc(l.tipo_documento_lcdpr),
        numDoc: l.numero_documento ?? l.nfe_numero ?? "",
        cpfCnpj: l.pessoa_id ? (pMap.get(l.pessoa_id) ?? "") : "",
        tipoLanc: tipoLancDe(l),
        fazendaId: l.fazenda_id,
        contaBancariaRef: l.conta_bancaria ?? "",
        receita: l.tipo === "receber" ? (l.valor_pago ?? l.valor ?? 0) : 0,
        despesa: l.tipo === "pagar"   ? (l.valor_pago ?? l.valor ?? 0) : 0,
        origem: "auto", lancId: l.id,
      }));
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
      await supabase.from("configuracoes_modulo").upsert(
        { fazenda_id: fazendaId, modulo: "lcdpr", config: nova },
        { onConflict: "fazenda_id,modulo" }
      );
    } finally {
      setSavingCfg(false);
    }
  };

  const salvarContador = async () => {
    if (!contaId) return;
    setSavingContador(true);
    try {
      await supabase.from("lcdpr_contador").upsert(
        { conta_id: contaId, ...contador, updated_at: new Date().toISOString() },
        { onConflict: "conta_id" }
      );
    } finally {
      setSavingContador(false);
    }
  };

  const editarFaz = (id: string, patch: Partial<FazLcdpr>) => {
    setFazEdit(prev => { const n = new Map(prev); n.set(id, { ...(n.get(id) ?? {}), ...patch }); return n; });
  };
  const salvarFaz = async (id: string) => {
    const patch = fazEdit.get(id);
    if (!patch) return;
    setSavingFazIds(prev => new Set(prev).add(id));
    try {
      await supabase.from("fazendas").update(patch).eq("id", id);
      setFazDados(prev => prev.map(f => f.id === id ? { ...f, ...patch } : f));
      setFazEdit(prev => { const n = new Map(prev); n.delete(id); return n; });
    } finally {
      setSavingFazIds(prev => { const n = new Set(prev); n.delete(id); return n; });
    }
  };

  // ── Computados ────────────────────────────────────────────────────────────
  const saldoInicial  = config.saldos_iniciais[String(anoSel)] ?? 0;
  const totalReceitas = entradas.reduce((s, e) => s + e.receita, 0);
  const totalDespesas = entradas.reduce((s, e) => s + e.despesa, 0);
  const saldoFinal    = saldoInicial + totalReceitas - totalDespesas;

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

  // Fazendas com dados incompletos pro registro 0040 (CAEPF é condicionalmente
  // obrigatório — sinalizado, mas não bloqueia a geração)
  const fazendasSemCaepf = fazDados.filter(f => !f.caepf && f.produtor_id);
  const fazendasColetivas = fazDados.filter(f => (f.tipo_exploracao ?? 1) !== 1 || (f.participacao_lcdpr ?? 100) < 100);

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
  const adicionarManual = () => {
    if (!fManual.valor || !fManual.historico) return;
    const nova: EntradaLCDPR = {
      id: `manual-${Date.now()}`, data: fManual.data, historico: fManual.historico,
      tipoDoc: fManual.tipoDoc, numDoc: "", cpfCnpj: fManual.cpfCnpj,
      tipoLanc: fManual.tipo === "receita" ? "1" : "2",
      fazendaId: fazendaId ?? "", contaBancariaRef: "",
      receita: fManual.tipo === "receita" ? fManual.valor : 0,
      despesa: fManual.tipo === "despesa" ? fManual.valor : 0,
      origem: "manual",
    };
    setEntradas(prev => [...prev, nova].sort((a, b) => a.data.localeCompare(b.data)));
    setModalManual(false);
    setFManual({ data: hoje(), historico: "", tipoDoc: "6", cpfCnpj: "", valor: 0, tipo: "receita" });
  };

  const removerLancamento = (id: string) => setEntradas(prev => prev.filter(e => e.id !== id));
  const atualizarTipoDoc  = (id: string, tipoDoc: string) =>
    setEntradas(prev => prev.map(e => e.id === id ? { ...e, tipoDoc } : e));

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
        const docRaw  = g("Documento", "documento");
        const cpf     = g("CPF/CNPJ", "cpf_cnpj");
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
        const isR = tipoRaw.startsWith("r");
        if (!isR && !tipoRaw.startsWith("d")) erros.push('Tipo deve ser "Receita" ou "Despesa"');
        return {
          data: dataIso, historico: hist, tipoDoc: mapTipoDoc(docRaw), cpfCnpj: cpf,
          tipo: isR ? "receber" : "pagar" as "receber" | "pagar", valor: valRaw,
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
      tipoDoc: r.tipoDoc, numDoc: "", cpfCnpj: r.cpfCnpj,
      tipoLanc: r.tipo === "receber" ? "1" : "2",
      fazendaId: fazendaId ?? "", contaBancariaRef: "",
      receita: r.tipo === "receber" ? r.valor : 0,
      despesa: r.tipo === "pagar" ? r.valor : 0,
      origem: "importado",
    }));
    setEntradas(prev => [...prev, ...novas].sort((a, b) => a.data.localeCompare(b.data)));
    setImportRows([]);
    setImportFeedback(`✓ ${validas.length} lançamento${validas.length !== 1 ? "s" : ""} adicionados.`);
    setAba("livro");
  };

  const baixarModelo = async () => {
    const XLSX = await import("xlsx");
    const dados = [
      ["Data", "Histórico", "Documento", "CPF/CNPJ", "Tipo", "Valor"],
      ["15/03/2025", "Venda de soja — Bunge S.A.", "NF", "03.755.877/0001-00", "Receita", "185000,00"],
      ["20/03/2025", "Adubo NPK 20-05-20 — COP", "NF", "04.803.396/0001-44", "Despesa", "42000,00"],
    ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(dados), "Modelo LCDPR");
    XLSX.writeFile(wb, "Modelo_LCDPR.xlsx");
  };

  // ── Resolução de imóvel (0040) e conta (0050) por lançamento ──────────────
  function resolverBanco(nomeBanco: string | null): string {
    if (!nomeBanco) return "";
    const c = bancosMap.get(nomeBanco.toLowerCase());
    return c ?? "";
  }

  // ── Geração do arquivo .txt (Leiaute 1.3 — ADE COPES nº 1/2020) ───────────
  const gerarLCDPR = () => {
    const cpfSel   = produtorFiltro !== "todos" ? produtorFiltro : (produtoresLcdpr[0]?.cpf ?? "");
    const nomeProd = (produtoresLcdpr.find(p => p.cpf === cpfSel)?.nome ?? "PRODUTOR RURAL").toUpperCase();

    const idsComCpf = new Set(produtoresDados.filter(p => p.cpf === cpfSel).map(p => p.id));
    const fazsFiltradas = produtorFiltro !== "todos"
      ? fazDados.filter(f => cpfNum(f.cpf_cnpj_fiscal ?? "") === cpfSel || (f.produtor_id && idsComCpf.has(f.produtor_id)))
      : fazDados;
    const fazsLC = fazsFiltradas.length > 0 ? fazsFiltradas : fazDados;

    // Código sequencial de imóvel (0040) — 1 fazenda = 1 imóvel rural
    const codImovelMap = new Map<string, string>();
    fazsLC.forEach((f, i) => codImovelMap.set(f.id, String(i + 1).padStart(3, "0")));

    // Código sequencial de conta bancária (0050) — só contas reais (não
    // espécie/trânsito, que usam os códigos especiais 000/999 direto no Q100)
    const contasReais = contasDados.filter(c => c.tipo_conta !== "caixa" && c.tipo_conta !== "transitoria");
    const codContaMap = new Map<string, string>();
    contasReais.forEach((c, i) => codContaMap.set(c.id, String(i + 1).padStart(3, "0")));
    const contaPorRef = new Map(contasDados.map(c => [c.id, c]));

    function resolverCodConta(ref: string): string {
      if (!ref) return "999"; // sem conta identificada — numerário em trânsito
      const conta = contaPorRef.get(ref);
      if (!conta) return "999"; // texto livre não cadastrado (ex: "Conta Transitoria" digitado à mão)
      if (conta.tipo_conta === "caixa") return "000";
      if (conta.tipo_conta === "transitoria") return "999";
      return codContaMap.get(conta.id) ?? "999";
    }

    const dtFmt = fmtDataLC;
    const linhas: string[] = [];

    // ── Bloco 0 ──
    const mm    = String(mesExport).padStart(2, "0");
    const last  = new Date(anoSel, mesExport, 0).getDate();
    const dtInicial = modoExport === "anual" ? `0101${anoSel}` : `01${mm}${anoSel}`;
    const dtFinal    = modoExport === "anual" ? `3112${anoSel}` : `${String(last).padStart(2,"0")}${mm}${anoSel}`;

    // 0000 — Abertura do Arquivo Digital e Identificação da PF
    linhas.push(["0000", "LCDPR", COD_VERSAO, cpfSel, nomeProd, "0", "0", "", dtInicial, dtFinal].join("|"));

    // 0010 — Parâmetro de Tributação (1 = Livro Caixa — único regime que este
    // sistema apura, já que ele é o próprio livro-caixa)
    linhas.push(["0010", "1"].join("|"));

    // 0030 — Dados Cadastrais do declarante (usa o endereço da 1ª fazenda como
    // referência — o registro é do declarante, não por imóvel)
    const fRef = fazsLC[0];
    linhas.push([
      "0030",
      fRef?.logradouro ?? "", fRef?.numero_end ?? "", fRef?.complemento ?? "", fRef?.bairro ?? "",
      (fRef?.estado ?? "").toUpperCase(), fRef?.municipio_ibge ?? "", cpfNum(fRef?.cep ?? ""),
      "", "",
    ].join("|"));

    // 0040 — Cadastro dos Imóveis Rurais (1 por fazenda)
    for (const f of fazsLC) {
      const tipoExp = f.tipo_exploracao ?? (f.arrendada ? 3 : 1);
      const participacao = (f.participacao_lcdpr ?? 100).toFixed(2).replace(".", "");
      linhas.push([
        "0040",
        codImovelMap.get(f.id), "BR", "BRL",
        f.itr ?? "", f.caepf ?? "", "",
        f.nome.toUpperCase(), f.logradouro ?? "", f.numero_end ?? "", f.complemento ?? "", f.bairro ?? "",
        (f.estado ?? "").toUpperCase(), f.municipio_ibge ?? "", cpfNum(f.cep ?? ""),
        String(tipoExp), participacao,
      ].join("|"));
    }

    // 0050 — Contas Bancárias (só contas reais; caixa/trânsito usam 000/999 no Q100)
    for (const c of contasReais) {
      const codBanco = c.codigo_bacen || resolverBanco(c.banco);
      const numContaComDv = `${(c.conta ?? "").replace(/\D/g, "")}${c.conta_dv ? `-${c.conta_dv}` : ""}`;
      linhas.push([
        "0050", codContaMap.get(c.id), "BR", codBanco, c.banco ?? "",
        (c.agencia ?? "").replace(/\D/g, ""), numContaComDv,
      ].join("|"));
    }

    // ── Bloco Q ──
    // Q100 — Demonstrativo do Resultado da Atividade Rural (1 por lançamento)
    let saldoAcum = saldoInicialExport;
    const porMes = new Map<string, { entrada: number; saida: number }>();
    for (const e of entradasExport) {
      const codImovel = codImovelMap.get(e.fazendaId) ?? codImovelMap.get(fazsLC[0]?.id ?? "") ?? "001";
      const codConta  = resolverCodConta(e.contaBancariaRef);
      const vEntrada = e.receita;
      const vSaida   = e.despesa;
      saldoAcum += vEntrada - vSaida;
      linhas.push([
        "Q100", dtFmt(e.data), codImovel, codConta, e.numDoc, e.tipoDoc,
        e.historico.replace(/\|/g, " "), cpfNum(e.cpfCnpj), e.tipoLanc,
        fmtValorLC(vEntrada), fmtValorLC(vSaida), fmtValorLC(Math.abs(saldoAcum)),
        saldoAcum >= 0 ? "P" : "N",
      ].join("|"));

      const chaveMes = e.data.slice(0, 7).replace("-", "");
      const mesInvertido = `${chaveMes.slice(4,6)}${chaveMes.slice(0,4)}`;
      const acc = porMes.get(mesInvertido) ?? { entrada: 0, saida: 0 };
      acc.entrada += vEntrada; acc.saida += vSaida;
      porMes.set(mesInvertido, acc);
    }

    // Q200 — Resumo Mensal (ordem cronológica, saldo cumulativo)
    let saldoMensal = saldoInicialExport;
    const mesesOrdenados = [...porMes.keys()].sort((a, b) => {
      const [ma, aa] = [a.slice(0,2), a.slice(2)]; const [mb, ab] = [b.slice(0,2), b.slice(2)];
      return aa === ab ? ma.localeCompare(mb) : aa.localeCompare(ab);
    });
    for (const chave of mesesOrdenados) {
      const { entrada, saida } = porMes.get(chave)!;
      saldoMensal += entrada - saida;
      linhas.push(["Q200", chave, fmtValorLC(entrada), fmtValorLC(saida), fmtValorLC(Math.abs(saldoMensal)), saldoMensal >= 0 ? "P" : "N"].join("|"));
    }

    // ── Bloco 9 ──
    // 9999 é adicionado por último, com a contagem total de linhas incluindo
    // ele mesmo (todos os registros contam, mesmo repetidos).
    const totalLinhas = linhas.length + 1;
    linhas.push(["9999", contador.nome, cpfNum(contador.cpf_cnpj), contador.crc, contador.email, contador.telefone.replace(/\D/g, ""), String(totalLinhas)].join("|"));

    const content = linhas.join("\r\n");
    const blob = new Blob(["﻿" + content], { type: "text/plain;charset=utf-8" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    const nomeArq = nomeProd.replace(/[^A-Z0-9 ]/g, "").trim();
    const comp    = modoExport === "mensal" ? `COMP ${mm}-${anoSel}` : `COMP ${anoSel}`;
    a.href = url; a.download = `LCDPR_${nomeArq}_${cpfSel || "TODOS"}_${comp}.txt`;
    a.click(); URL.revokeObjectURL(url);
  };

  const gerarXLSX = async () => {
    const XLSX = await import("xlsx");
    const cpfSel = produtorFiltro !== "todos" ? produtorFiltro : (produtoresLcdpr[0]?.cpf ?? "");
    const nomeProd = produtoresLcdpr.find(p => p.cpf === cpfSel)?.nome ?? "PRODUTOR RURAL";
    const nomeArq  = nomeProd.toUpperCase().replace(/[^A-Z0-9 ]/g, "").trim();
    const mm       = String(mesExport).padStart(2, "0");
    const comp     = modoExport === "mensal" ? `COMP ${mm}-${anoSel}` : `COMP ${anoSel}`;
    const periodo  = modoExport === "mensal"
      ? new Date(anoSel, mesExport - 1, 1).toLocaleString("pt-BR", { month: "long", year: "numeric" })
      : String(anoSel);

    const cabecalho = [["LCDPR — Livro Caixa e Escrituração Rural"], [`Produtor: ${nomeProd} — CPF: ${fmtCPF(cpfSel)}`], [`Período: ${periodo}`], []];
    const header    = ["Data", "Histórico", "Tipo Doc.", "CPF/CNPJ Parte", "Tipo Lanç.", "Receitas (R$)", "Despesas (R$)"];
    const TIPO_LANC_LABEL: Record<string, string> = { "1": "Receita", "2": "Despesa", "3": "Receita — adiantamento (barter)" };
    const rows = entradasExport.map(e => [
      fmtData(e.data),
      e.historico,
      TIPO_DOC_LABEL[e.tipoDoc] ?? e.tipoDoc,
      e.cpfCnpj,
      TIPO_LANC_LABEL[e.tipoLanc] ?? e.tipoLanc,
      e.receita > 0 ? e.receita : "",
      e.despesa > 0 ? e.despesa : "",
    ]);
    const totalRec  = entradasExport.reduce((s, e) => s + e.receita, 0);
    const totalDesp = entradasExport.reduce((s, e) => s + e.despesa, 0);
    const rodape    = [["", "", "", "", "TOTAL", totalRec, totalDesp]];

    const ws = XLSX.utils.aoa_to_sheet([...cabecalho, header, ...rows, [], ...rodape]);
    ws["!cols"] = [{ wch: 12 }, { wch: 45 }, { wch: 16 }, { wch: 18 }, { wch: 28 }, { wch: 14 }, { wch: 14 }];

    const resumoHeader = ["Mês", "Receitas (R$)", "Despesas (R$)", "Resultado (R$)"];
    const mesesResumoXlsx = Array.from({ length: 12 }, (_, i) => {
      const mes = i + 1;
      const mm2 = String(mes).padStart(2, "0");
      const itens = entradas.filter(e => e.data.slice(0, 7) === `${anoSel}-${mm2}`);
      const rec = itens.reduce((s, e) => s + e.receita, 0);
      const dep = itens.reduce((s, e) => s + e.despesa, 0);
      return [new Date(anoSel, i, 1).toLocaleString("pt-BR", { month: "long" }), rec || "", dep || "", (rec - dep) || ""];
    });
    const ws2 = XLSX.utils.aoa_to_sheet([resumoHeader, ...mesesResumoXlsx]);
    ws2["!cols"] = [{ wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 14 }];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Lançamentos");
    XLSX.utils.book_append_sheet(wb, ws2, "Resumo Mensal");
    XLSX.writeFile(wb, `LCDPR_${nomeArq}_${cpfSel || "TODOS"}_${comp}.xlsx`);
  };

  const imprimirPDF = () => { window.print(); };

  const exportar = () => {
    if (formatoExport === "txt")  gerarLCDPR();
    else if (formatoExport === "xlsx") gerarXLSX();
    else imprimirPDF();
  };

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
            <p style={{ margin: 0, fontSize: 11, color: "var(--text-3)" }}>Regime de caixa · Pessoa Física · Leiaute 1.3 — Anexo ao ADE COPES nº 1/2020</p>
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
            ] as { label: string; val: number; cor: string; bg: string; cnt?: boolean }[]).map((c, i) => (
              <div key={i} style={{ background: c.bg, border: "0.5px solid var(--border-table)", borderRadius: 10, padding: "12px 14px" }}>
                <div style={{ fontSize: 11, color: "var(--text-2)", marginBottom: 4 }}>{c.label}</div>
                <div style={{ fontSize: 17, fontWeight: 700, color: c.cor }}>{c.cnt ? c.val : fmtBRL(c.val)}</div>
              </div>
            ))}
          </div>

          {/* ── Alertas de cadastro incompleto ── */}
          {(fazendasSemCaepf.length > 0 || fazendasColetivas.length > 0) && (
            <div style={{ background: "#FBF3E0", border: "0.5px solid #C9921B60", borderRadius: 8, padding: "8px 14px", marginBottom: 10, display: "flex", flexDirection: "column", gap: 4, fontSize: 12 }}>
              {fazendasSemCaepf.length > 0 && (
                <span style={{ color: "#7A5A12" }}>
                  ⚠ <strong>{fazendasSemCaepf.length}</strong> fazenda{fazendasSemCaepf.length !== 1 ? "s" : ""} sem CAEPF cadastrado — o registro 0040 sairá com esse campo em branco. Configure em{" "}
                  <button onClick={() => setAba("cadastro")} style={{ background: "none", border: "none", color: "#C9921B", cursor: "pointer", fontWeight: 600, fontSize: 12, padding: 0, textDecoration: "underline" }}>Cadastro LCDPR</button>.
                </span>
              )}
              {fazendasColetivas.length > 0 && (
                <span style={{ color: "#7A5A12" }}>
                  ⚠ <strong>{fazendasColetivas.length}</strong> fazenda{fazendasColetivas.length !== 1 ? "s têm" : " tem"} exploração coletiva ou participação abaixo de 100% — o registro 0045 (dados dos parceiros/condôminos) ainda não é gerado automaticamente por este sistema. Se aplicável, adicione manualmente após exportar.
                </span>
              )}
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
                ["cadastro",      "Cadastro LCDPR"],
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
                  {k === "cadastro" && (fazendasSemCaepf.length > 0) && (
                    <span style={{ marginLeft: 6, fontSize: 10, background: "#FBF3E0", color: "#7A5A12", padding: "1px 5px", borderRadius: 4, fontWeight: 600 }}>{fazendasSemCaepf.length}</span>
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
                          {["Data", "Tipo", "Histórico", "Doc.", "CPF/CNPJ contraparte", "Receita", "Despesa", "Saldo", ""].map((h, i) => (
                            <th key={i} style={{ padding: "8px 12px", textAlign: i >= 5 && i <= 7 ? "right" : "left", fontSize: 11, fontWeight: 600, color: "var(--text-2)", borderBottom: "0.5px solid var(--border-table)", whiteSpace: "nowrap" }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {(() => {
                          let saldo = saldoInicial;
                          const TIPO_LANC_LABEL: Record<string, string> = { "1": "Receita", "2": "Despesa", "3": "Adiant." };
                          return entradas.map((e, i) => {
                            saldo += e.receita - e.despesa;
                            return (
                              <tr key={e.id} style={{ borderBottom: i < entradas.length - 1 ? "0.5px solid var(--border-row)" : "none", background: e.origem !== "auto" ? "#FFFDF5" : "transparent" }}>
                                <td style={{ padding: "8px 12px", whiteSpace: "nowrap", fontSize: 12 }}>{fmtData(e.data)}</td>
                                <td style={{ padding: "8px 12px" }}>
                                  <span style={{
                                    fontSize: 10, padding: "2px 7px", borderRadius: 6, fontWeight: 600,
                                    background: e.tipoLanc === "2" ? "#FCEBEB" : "#EAF3DE",
                                    color: e.tipoLanc === "2" ? "#791F1F" : "#1A5C38",
                                  }}>
                                    {TIPO_LANC_LABEL[e.tipoLanc]}
                                  </span>
                                </td>
                                <td style={{ padding: "8px 12px", maxWidth: 260 }}>
                                  <div style={{ fontWeight: 500, color: "var(--text-1)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{e.historico}</div>
                                </td>
                                <td style={{ padding: "4px 8px" }}>
                                  <select
                                    value={e.tipoDoc}
                                    onChange={ev => atualizarTipoDoc(e.id, ev.target.value)}
                                    style={{ fontSize: 11, padding: "3px 5px", border: "0.5px solid var(--border-table)", borderRadius: 5, color: "var(--text-1)", background: "var(--bg-card)", maxWidth: 150 }}
                                  >
                                    {Object.entries(TIPO_DOC_LABEL).map(([k, v]) => <option key={k} value={k}>{k} — {v}</option>)}
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

            {/* ═══ ABA: CADASTRO LCDPR (imóveis + contador) ═══ */}
            {aba === "cadastro" && (
              <div style={{ padding: 20 }}>
                <div style={{ background: "#EEF4FF", border: "0.5px solid #93C5FD", borderRadius: 10, padding: "12px 16px", marginBottom: 18, fontSize: 12, color: "#1e40af", lineHeight: 1.6 }}>
                  <strong>Registro 0040 do LCDPR</strong> — cada fazenda vira um "imóvel rural" no arquivo. CAEPF e tipo de
                  exploração são exigidos pela Receita para imóveis explorados individualmente por pessoa física.
                </div>

                <div style={{ fontWeight: 600, fontSize: 13, color: "var(--text-1)", marginBottom: 10 }}>Imóveis (fazendas)</div>
                <div style={{ border: "0.5px solid var(--border-table)", borderRadius: 10, overflow: "hidden", marginBottom: 24 }}>
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead>
                      <tr style={{ background: "var(--bg-page)" }}>
                        {["Fazenda", "CAEPF", "Tipo de Exploração", "Participação (%)", ""].map((h, i) => (
                          <th key={i} style={{ padding: "8px 12px", textAlign: "left", fontSize: 11, fontWeight: 600, color: "var(--text-2)", borderBottom: "0.5px solid var(--border-table)" }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {fazDados.map(f => {
                        const edit = fazEdit.get(f.id);
                        const caepf = edit?.caepf ?? f.caepf ?? "";
                        const tipoExp = edit?.tipo_exploracao ?? f.tipo_exploracao ?? (f.arrendada ? 3 : 1);
                        const participacao = edit?.participacao_lcdpr ?? f.participacao_lcdpr ?? 100;
                        const mudou = !!edit;
                        return (
                          <tr key={f.id} style={{ borderBottom: "0.5px solid var(--border-row)" }}>
                            <td style={{ padding: "8px 12px", fontWeight: 500 }}>{f.nome}</td>
                            <td style={{ padding: "6px 12px" }}>
                              <input value={caepf} placeholder="14 dígitos" maxLength={14}
                                onChange={e => editarFaz(f.id, { caepf: e.target.value.replace(/\D/g, "") })}
                                style={{ ...inpS, fontFamily: "monospace" }} />
                            </td>
                            <td style={{ padding: "6px 12px" }}>
                              <select value={tipoExp} onChange={e => editarFaz(f.id, { tipo_exploracao: Number(e.target.value) })} style={inpS}>
                                {Object.entries(TIPO_EXPLORACAO_LABEL).map(([k, v]) => <option key={k} value={k}>{k} — {v}</option>)}
                              </select>
                            </td>
                            <td style={{ padding: "6px 12px", width: 110 }}>
                              <input type="number" min={0} max={100} step={0.01} value={participacao}
                                onChange={e => editarFaz(f.id, { participacao_lcdpr: Math.min(100, Math.max(0, parseFloat(e.target.value) || 0)) })}
                                style={inpS} />
                            </td>
                            <td style={{ padding: "6px 10px", textAlign: "center" }}>
                              {mudou && (
                                <button onClick={() => salvarFaz(f.id)} disabled={savingFazIds.has(f.id)}
                                  style={{ padding: "4px 12px", background: "#1A5C38", color: "#fff", border: "none", borderRadius: 6, fontWeight: 600, cursor: "pointer", fontSize: 11 }}>
                                  {savingFazIds.has(f.id) ? "…" : "Salvar"}
                                </button>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                <div style={{ fontWeight: 600, fontSize: 13, color: "var(--text-1)", marginBottom: 10 }}>Contas bancárias (registro 0050)</div>
                <div style={{ border: "0.5px solid var(--border-table)", borderRadius: 10, overflow: "hidden", marginBottom: 24, fontSize: 12 }}>
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead>
                      <tr style={{ background: "var(--bg-page)" }}>
                        {["Conta", "Banco", "Agência", "Nº Conta", "Tipo"].map((h, i) => (
                          <th key={i} style={{ padding: "8px 12px", textAlign: "left", fontSize: 11, fontWeight: 600, color: "var(--text-2)", borderBottom: "0.5px solid var(--border-table)" }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {contasDados.length === 0 ? (
                        <tr><td colSpan={5} style={{ padding: 20, textAlign: "center", color: "var(--text-3)" }}>Nenhuma conta bancária cadastrada nesta fazenda.</td></tr>
                      ) : contasDados.map(c => (
                        <tr key={c.id} style={{ borderBottom: "0.5px solid var(--border-row)" }}>
                          <td style={{ padding: "8px 12px" }}>{c.nome}</td>
                          <td style={{ padding: "8px 12px" }}>{c.banco ?? "—"} {resolverBanco(c.banco) && <span style={{ color: "var(--text-3)" }}>({resolverBanco(c.banco)})</span>}</td>
                          <td style={{ padding: "8px 12px" }}>{c.agencia ?? "—"}</td>
                          <td style={{ padding: "8px 12px" }}>{c.conta ?? "—"}</td>
                          <td style={{ padding: "8px 12px" }}>
                            <span style={{ fontSize: 10, padding: "2px 7px", borderRadius: 6, background: c.tipo_conta === "caixa" ? "#FBF3E0" : c.tipo_conta === "transitoria" ? "#EEF4FF" : "#EAF3DE", color: c.tipo_conta === "caixa" ? "#7A5A12" : c.tipo_conta === "transitoria" ? "#1e40af" : "#1A5C38" }}>
                              {c.tipo_conta === "caixa" ? "espécie (000)" : c.tipo_conta === "transitoria" ? "trânsito (999)" : c.tipo_conta}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div style={{ fontSize: 11, color: "var(--text-3)", marginBottom: 24 }}>
                  Contas do tipo "espécie" e "trânsito" usam os códigos especiais 000/999 do leiaute — não entram como conta cadastrada no registro 0050. Para editar banco/agência/conta, use Cadastros → Contas Bancárias.
                </div>

                <div style={{ fontWeight: 600, fontSize: 13, color: "var(--text-1)", marginBottom: 10 }}>Contador responsável (registro 9999)</div>
                <div style={{ display: "grid", gridTemplateColumns: "2fr 1.3fr 1fr", gap: 12, maxWidth: 700 }}>
                  <div>
                    <label style={lblS}>Nome</label>
                    <input value={contador.nome} onChange={e => setContador(p => ({ ...p, nome: e.target.value }))} style={inpS} />
                  </div>
                  <div>
                    <label style={lblS}>CPF/CNPJ</label>
                    <input value={contador.cpf_cnpj} onChange={e => setContador(p => ({ ...p, cpf_cnpj: e.target.value.replace(/\D/g, "") }))} style={{ ...inpS, fontFamily: "monospace" }} />
                  </div>
                  <div>
                    <label style={lblS}>CRC</label>
                    <input value={contador.crc} onChange={e => setContador(p => ({ ...p, crc: e.target.value }))} style={inpS} />
                  </div>
                  <div>
                    <label style={lblS}>E-mail</label>
                    <input value={contador.email} onChange={e => setContador(p => ({ ...p, email: e.target.value }))} style={inpS} />
                  </div>
                  <div>
                    <label style={lblS}>Telefone</label>
                    <input value={contador.telefone} onChange={e => setContador(p => ({ ...p, telefone: e.target.value }))} style={inpS} />
                  </div>
                  <div style={{ display: "flex", alignItems: "flex-end" }}>
                    <button onClick={salvarContador} disabled={savingContador}
                      style={{ padding: "8px 16px", background: "#1A5C38", color: "#fff", border: "none", borderRadius: 8, fontWeight: 600, cursor: "pointer", fontSize: 12 }}>
                      {savingContador ? "Salvando…" : "Salvar contador"}
                    </button>
                  </div>
                </div>
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
                      { col: "Documento",        desc: "NF, Recibo, Fatura, Contrato, Folha, Outros" },
                      { col: "CPF/CNPJ",         desc: "CPF/CNPJ da contraparte" },
                    ].map(f => (
                      <div key={f.col} style={{ display: "flex", gap: 8, marginBottom: 7 }}>
                        <span style={{ fontWeight: 600, color: "var(--text-1)", minWidth: 130, flexShrink: 0 }}>{f.col}</span>
                        <span style={{ color: "var(--text-2)" }}>{f.desc}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {importRows.length > 0 && (
                  <div style={{ marginTop: 24 }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                      <div style={{ fontWeight: 600, color: "var(--text-1)" }}>
                        Preview — {importRows.length} linha{importRows.length !== 1 ? "s" : ""}
                        {" "}({importRows.filter(r => r._status === "ok").length} válidas, {importRows.filter(r => r._status === "erro").length} com erro)
                      </div>
                      <button onClick={confirmarImport} disabled={!importRows.some(r => r._status === "ok")}
                        style={{ padding: "8px 18px", background: "#1A5C38", color: "#fff", border: "none", borderRadius: 8, fontWeight: 600, cursor: "pointer", fontSize: 13, opacity: importRows.some(r => r._status === "ok") ? 1 : 0.5 }}>
                        Confirmar importação
                      </button>
                    </div>
                    <div style={{ overflowX: "auto", border: "0.5px solid var(--border-table)", borderRadius: 10 }}>
                      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                        <thead>
                          <tr style={{ background: "var(--bg-page)" }}>
                            {["Status", "Data", "Histórico", "Tipo", "Valor", "Erro"].map((h, i) => (
                              <th key={i} style={{ padding: "7px 10px", textAlign: "left", fontSize: 11, fontWeight: 600, color: "var(--text-2)", borderBottom: "0.5px solid var(--border-table)" }}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {importRows.map((r, i) => (
                            <tr key={i} style={{ borderBottom: "0.5px solid var(--border-row)", background: r._status === "erro" ? "#FCEBEB" : "transparent" }}>
                              <td style={{ padding: "6px 10px" }}>{r._status === "ok" ? "✓" : "✕"}</td>
                              <td style={{ padding: "6px 10px" }}>{r.data}</td>
                              <td style={{ padding: "6px 10px" }}>{r.historico}</td>
                              <td style={{ padding: "6px 10px" }}>{r.tipo === "receber" ? "Receita" : "Despesa"}</td>
                              <td style={{ padding: "6px 10px" }}>{fmtBRL(r.valor)}</td>
                              <td style={{ padding: "6px 10px", color: "#791F1F" }}>{r._msg}</td>
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
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 14, color: "var(--text-1)", marginBottom: 16 }}>Configurar exportação</div>

                    <div style={{ marginBottom: 16 }}>
                      <label style={lblS}>Produtor (CPF)</label>
                      <select value={produtorFiltro} onChange={e => setProdutorFiltro(e.target.value)} style={inpS}>
                        <option value="todos">Todos (sem aplicar quota-parte)</option>
                        {produtoresLcdpr.map(p => <option key={p.cpf} value={p.cpf}>{fmtCPF(p.cpf)} — {p.nome}</option>)}
                      </select>
                    </div>

                    <div style={{ marginBottom: 16 }}>
                      <label style={lblS}>Período</label>
                      <div style={{ display: "flex", gap: 8 }}>
                        <button onClick={() => setModoExport("anual")} style={{ flex: 1, padding: "8px", borderRadius: 8, border: `1px solid ${modoExport === "anual" ? "#1A5C38" : "var(--border-table)"}`, background: modoExport === "anual" ? "#EAF3DE" : "var(--bg-card)", color: modoExport === "anual" ? "#1A5C38" : "var(--text-2)", fontWeight: 600, cursor: "pointer", fontSize: 12 }}>Ano inteiro ({anoSel})</button>
                        <button onClick={() => setModoExport("mensal")} style={{ flex: 1, padding: "8px", borderRadius: 8, border: `1px solid ${modoExport === "mensal" ? "#1A5C38" : "var(--border-table)"}`, background: modoExport === "mensal" ? "#EAF3DE" : "var(--bg-card)", color: modoExport === "mensal" ? "#1A5C38" : "var(--text-2)", fontWeight: 600, cursor: "pointer", fontSize: 12 }}>Um mês</button>
                      </div>
                      {modoExport === "mensal" && (
                        <select value={mesExport} onChange={e => setMesExport(Number(e.target.value))} style={{ ...inpS, marginTop: 8 }}>
                          {Array.from({ length: 12 }, (_, i) => (
                            <option key={i + 1} value={i + 1}>{new Date(anoSel, i, 1).toLocaleString("pt-BR", { month: "long" })}</option>
                          ))}
                        </select>
                      )}
                    </div>

                    <div style={{ marginBottom: 20 }}>
                      <label style={lblS}>Formato</label>
                      <div style={{ display: "flex", gap: 8 }}>
                        {([["txt", "📄 .txt (LCDPR)"], ["xlsx", "📊 Excel"], ["pdf", "🖨 Imprimir"]] as [typeof formatoExport, string][]).map(([f, lbl]) => (
                          <button key={f} onClick={() => setFormatoExport(f)} style={{ flex: 1, padding: "8px", borderRadius: 8, border: `1px solid ${formatoExport === f ? "#1A5C38" : "var(--border-table)"}`, background: formatoExport === f ? "#EAF3DE" : "var(--bg-card)", color: formatoExport === f ? "#1A5C38" : "var(--text-2)", fontWeight: 600, cursor: "pointer", fontSize: 12 }}>{lbl}</button>
                        ))}
                      </div>
                    </div>

                    <button onClick={exportar}
                      style={{ width: "100%", padding: "12px", background: "#1A5C38", color: "#fff", border: "none", borderRadius: 10, fontWeight: 700, cursor: "pointer", fontSize: 14 }}>
                      ⬇ Gerar e baixar
                    </button>
                  </div>

                  <div style={{ background: "var(--bg-page)", borderRadius: 10, padding: "16px 18px", border: "0.5px solid var(--border-table)" }}>
                    <div style={{ fontWeight: 600, color: "var(--text-1)", marginBottom: 12 }}>Resumo mensal — {anoSel}</div>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                      <tbody>
                        {mesesResumo.map((m, i) => (
                          <tr key={i} style={{ borderBottom: "0.5px solid var(--border-row)" }}>
                            <td style={{ padding: "5px 4px", textTransform: "capitalize", color: "var(--text-2)" }}>{m.mes}</td>
                            <td style={{ padding: "5px 4px", textAlign: "right", color: "#1A5C38" }}>{m.rec > 0 ? fmtBRL(m.rec) : "—"}</td>
                            <td style={{ padding: "5px 4px", textAlign: "right", color: "#E24B4A" }}>{m.desp > 0 ? fmtBRL(m.desp) : "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </main>

      {/* ── Modal: lançamento manual ── */}
      {modalManual && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }}>
          <div style={{ background: "var(--bg-card)", borderRadius: 14, padding: 24, width: 460 }}>
            <div style={{ fontWeight: 600, fontSize: 15, color: "var(--text-1)", marginBottom: 16 }}>Lançamento manual (histórico / fora do Financeiro)</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={() => setFManual(p => ({ ...p, tipo: "receita" }))} style={{ flex: 1, padding: 8, borderRadius: 8, border: `1px solid ${fManual.tipo === "receita" ? "#1A5C38" : "var(--border-table)"}`, background: fManual.tipo === "receita" ? "#EAF3DE" : "var(--bg-card)", color: fManual.tipo === "receita" ? "#1A5C38" : "var(--text-2)", fontWeight: 600, cursor: "pointer" }}>Receita</button>
                <button onClick={() => setFManual(p => ({ ...p, tipo: "despesa" }))} style={{ flex: 1, padding: 8, borderRadius: 8, border: `1px solid ${fManual.tipo === "despesa" ? "#E24B4A" : "var(--border-table)"}`, background: fManual.tipo === "despesa" ? "#FCEBEB" : "var(--bg-card)", color: fManual.tipo === "despesa" ? "#E24B4A" : "var(--text-2)", fontWeight: 600, cursor: "pointer" }}>Despesa</button>
              </div>
              <div><label style={lblS}>Data</label><input type="date" value={fManual.data} onChange={e => setFManual(p => ({ ...p, data: e.target.value }))} style={inpS} /></div>
              <div><label style={lblS}>Histórico</label><input value={fManual.historico} onChange={e => setFManual(p => ({ ...p, historico: e.target.value }))} style={inpS} placeholder="Ex: Venda de 100 sacas de milho" /></div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <div>
                  <label style={lblS}>Documento</label>
                  <select value={fManual.tipoDoc} onChange={e => setFManual(p => ({ ...p, tipoDoc: e.target.value }))} style={inpS}>
                    {Object.entries(TIPO_DOC_LABEL).map(([k, v]) => <option key={k} value={k}>{k} — {v}</option>)}
                  </select>
                </div>
                <div><label style={lblS}>CPF/CNPJ contraparte</label><input value={fManual.cpfCnpj} onChange={e => setFManual(p => ({ ...p, cpfCnpj: e.target.value.replace(/\D/g, "") }))} style={inpS} /></div>
              </div>
              <div>
                <label style={lblS}>Valor</label>
                <InputNumerico value={fManual.valor} onChange={v => setFManual(p => ({ ...p, valor: Number(v) }))} style={inpS} />
              </div>
            </div>
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 20 }}>
              <button onClick={() => setModalManual(false)} style={{ padding: "8px 18px", border: "0.5px solid var(--border-table)", borderRadius: 8, background: "var(--bg-card)", cursor: "pointer", fontSize: 13 }}>Cancelar</button>
              <button onClick={adicionarManual} style={{ padding: "8px 20px", background: "#C9921B", color: "#fff", border: "none", borderRadius: 8, fontWeight: 600, cursor: "pointer", fontSize: 13 }}>Adicionar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
