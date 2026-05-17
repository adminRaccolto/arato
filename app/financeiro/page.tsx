"use client";
import { useState, useEffect } from "react";
import TopNav from "../../components/TopNav";
import { listarLancamentosPeriodo, criarLancamento, criarParcelamento, baixarLancamento, listarSimulacoes, criarSimulacao, toggleSimulacao, excluirSimulacao, calcularSaldoAnterior } from "../../lib/db";
import { useAuth } from "../../components/AuthProvider";
import type { Lancamento, Simulacao } from "../../lib/supabase";

// ── tipos locais ─────────────────────────────────────────────
type TipoLanc   = "receber" | "pagar";
type Moeda      = "BRL" | "USD" | "barter";
type Aba        = "lancamentos" | "fluxo" | "conciliacao";
type SubAbaFluxo = "horizontal" | "vertical" | "prevreal";
type FiltroCP   = "todos" | "receber" | "pagar" | "vencidos" | "baixados" | "barter";

type Previsao = {
  id: string;
  tipo: TipoLanc;
  descricao: string;
  categoria: string;
  data: string;
  valor: number;
};

const TODAY        = new Date().toISOString().split("T")[0];
const COTACAO_USD  = 5.12;

// ── formatação ───────────────────────────────────────────────
const fmtBRL = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fmtUSD = (v: number) => `US$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtData = (iso?: string) => { if (!iso) return "—"; const [y, m, d] = iso.split("-"); return `${d}/${m}/${y}`; };
const nomeMes = (ano: number, mes: number) => {
  const nomes = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];
  return `${nomes[mes - 1]}/${String(ano).slice(2)}`;
};

const paraBRL = (l: Lancamento) =>
  l.moeda === "USD" ? l.valor * (l.cotacao_usd ?? COTACAO_USD) : l.valor;

const exibirValor = (l: Lancamento) => {
  if (l.moeda === "USD")    return fmtUSD(l.valor);
  if (l.moeda === "barter") return `${(l.sacas ?? 0).toLocaleString("pt-BR")} sc ${l.cultura_barter ?? "soja"}`;
  return fmtBRL(l.valor);
};

const exibirConversao = (l: Lancamento): string | null => {
  if (l.moeda === "USD")    return `≈ ${fmtBRL(l.valor * (l.cotacao_usd ?? COTACAO_USD))} @ R$${(l.cotacao_usd ?? COTACAO_USD).toFixed(2)}`;
  if (l.moeda === "barter") return `≈ ${fmtBRL((l.sacas ?? 0) * (l.preco_saca_barter ?? 0))} gerencial`;
  return null;
};

const badgeMoeda = (m: Moeda) => ({
  BRL:    { label: "R$",     bg: "#E6F1FB", color: "#0C447C" },
  USD:    { label: "US$",    bg: "#FEF3E2", color: "#7A4300" },
  barter: { label: "Barter", bg: "#FBF3E0", color: "#8B5E14" },
}[m]);

// ── máscara ──────────────────────────────────────────────────
const aplicarMascara = (raw: string): string => {
  const nums = raw.replace(/\D/g, "");
  if (!nums) return "";
  return (Number(nums) / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};
const desmascarar = (masked: string): number =>
  Number(masked.replace(/\./g, "").replace(",", ".")) || 0;
const numParaMascara = (n: number): string =>
  n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// ── cores ────────────────────────────────────────────────────
const categoriasCor: Record<string, { bg: string; color: string }> = {
  "Venda de grãos": { bg: "#D5E8F5", color: "#0B2D50" },
  "Insumos":        { bg: "#FAEEDA", color: "#633806" },
  "Arrendamento":   { bg: "#FAECE7", color: "#712B13" },
  "Impostos":       { bg: "#E6F1FB", color: "#0C447C" },
  "Manutenção":     { bg: "#F1EFE8", color: "#555"    },
  "Frete":          { bg: "#FBF3E0", color: "#8B5E14" },
  "Despesas fixas": { bg: "#F1EFE8", color: "#555"    },
};

const corStatus = (s: string) => ({
  em_aberto: { bg: "#E6F1FB", color: "#0C447C", label: "Em aberto" },
  vencido:   { bg: "#FCEBEB", color: "#791F1F", label: "Vencido"   },
  vencendo:  { bg: "#FAEEDA", color: "#633806", label: "Vencendo"  },
  baixado:   { bg: "#D5E8F5", color: "#0B2D50", label: "Baixado"   },
}[s] ?? { bg: "#F1EFE8", color: "#666", label: s });

// ── estilos ──────────────────────────────────────────────────
const inputStyle: React.CSSProperties = {
  width: "100%", padding: "8px 10px", border: "0.5px solid #D4DCE8",
  borderRadius: 8, fontSize: 13, color: "#1a1a1a", background: "#fff",
  boxSizing: "border-box", outline: "none",
};
const labelStyle: React.CSSProperties = { fontSize: 11, color: "#555", marginBottom: 4, display: "block" };

const contasBancarias = ["BB Conta Corrente", "Bradesco PJ", "Caixa Econômica", "Sicredi"];

// ── DFC: agrupamentos de categorias ──────────────────────────
const DFC_ENTRADAS = [
  "Venda de grãos",
  "Insumos — Sementes",  // pode haver barters que geram cr
  "Outros recebimentos",
];
const DFC_SAIDAS = [
  "Insumos — Sementes",
  "Insumos — Fertilizantes",
  "Insumos — Defensivos",
  "Insumos — Inoculantes",
  "Serviços Agrícolas",
  "Fretes e Transportes",
  "Arrendamento de Terra",
  "Manutenção de Máquinas",
  "Impostos",
  "Juros e IOF",
  "Despesas Administrativas",
  "Outros",
];

// ── Plano de Contas DFC ──────────────────────────────────────
type PlanoRow = { id: string; label: string; nivel: 1|2|3; sinal: 1|-1; cat?: string[] };
const PLANO_DFC: PlanoRow[] = [
  { id:"1",       label:"1. RECEITAS",                       nivel:1, sinal:1  },
  { id:"1.01",    label:"1.01. Receitas Operacionais",       nivel:2, sinal:1  },
  { id:"1.01.01", label:"Venda de Grãos",                    nivel:3, sinal:1,  cat:["Venda de grãos","receita_graos"] },
  { id:"1.01.02", label:"Complemento / Fixação",             nivel:3, sinal:1,  cat:["Complemento Fixação","Venda Fixação"] },
  { id:"1.01.99", label:"Outros Operacionais",               nivel:3, sinal:1,  cat:["Outros recebimentos","outros"] },
  { id:"1.02",    label:"1.02. Receitas Financeiras",        nivel:2, sinal:1  },
  { id:"1.02.01", label:"Empréstimos / Custeio Recebido",    nivel:3, sinal:1,  cat:["receita_financeira","Custeio Recebido","Empréstimo Recebido"] },
  { id:"1.02.02", label:"Rendimentos",                       nivel:3, sinal:1,  cat:["Rendimento","Rendimento Aplicação"] },
  { id:"1.02.99", label:"Outras Receitas Financeiras",       nivel:3, sinal:1,  cat:[] },
  { id:"2",       label:"2. DESPESAS",                       nivel:1, sinal:-1 },
  { id:"2.01",    label:"2.01. Insumos",                     nivel:2, sinal:-1 },
  { id:"2.01.01", label:"Defensivos",                        nivel:3, sinal:-1, cat:["Insumos — Defensivos","Defensivos"] },
  { id:"2.01.02", label:"Fertilizantes",                     nivel:3, sinal:-1, cat:["Insumos — Fertilizantes","Fertilizantes"] },
  { id:"2.01.03", label:"Sementes",                          nivel:3, sinal:-1, cat:["Insumos — Sementes","Sementes"] },
  { id:"2.01.04", label:"Corretivos / Cal",                  nivel:3, sinal:-1, cat:["Insumos — Corretivos","Corretivos","Calcário"] },
  { id:"2.01.05", label:"Inoculantes",                       nivel:3, sinal:-1, cat:["Insumos — Inoculantes","Inoculantes"] },
  { id:"2.01.06", label:"Herbicidas",                        nivel:3, sinal:-1, cat:["Insumos — Herbicidas","Herbicidas"] },
  { id:"2.02",    label:"2.02. Combustíveis e Lubrificantes",nivel:2, sinal:-1 },
  { id:"2.02.01", label:"Combustível Fazenda",               nivel:3, sinal:-1, cat:["Insumos — Combustíveis","Combustíveis"] },
  { id:"2.02.02", label:"Lubrificantes",                     nivel:3, sinal:-1, cat:["Insumos — Lubrificantes","Lubrificantes"] },
  { id:"2.03",    label:"2.03. Manutenção e Reparo",         nivel:2, sinal:-1 },
  { id:"2.03.01", label:"Manutenção de Máquinas",            nivel:3, sinal:-1, cat:["Manutenção de Máquinas","Manutenção"] },
  { id:"2.03.02", label:"Manutenção de Benfeitorias",        nivel:3, sinal:-1, cat:["Manutenção de Benfeitorias"] },
  { id:"2.03.03", label:"Manutenção de Veículos",            nivel:3, sinal:-1, cat:["Manutenção de Veículos"] },
  { id:"2.04",    label:"2.04. Fretes e Transportes",        nivel:2, sinal:-1, cat:["Fretes e Transportes","Frete","Fretes"] },
  { id:"2.05",    label:"2.05. Serviços Terceirizados",      nivel:2, sinal:-1 },
  { id:"2.05.01", label:"Colheita Terceirizada",             nivel:3, sinal:-1, cat:["Colheita Terceirizada"] },
  { id:"2.05.02", label:"Serviços Agrícolas",                nivel:3, sinal:-1, cat:["Serviços Agrícolas"] },
  { id:"2.05.99", label:"Outros Serviços",                   nivel:3, sinal:-1, cat:["Prestação de Serviço"] },
  { id:"2.06",    label:"2.06. Arrendamento",                nivel:2, sinal:-1, cat:["Arrendamento de Terra","Arrendamento"] },
  { id:"2.07",    label:"2.07. Seguros",                     nivel:2, sinal:-1, cat:["Seguro Produção","Seguro Máquinas","Seguro Veículos","Seguros","Seguro Milho"] },
  { id:"2.08",    label:"2.08. Despesas Administrativas",    nivel:2, sinal:-1 },
  { id:"2.08.01", label:"Material / Expediente",             nivel:3, sinal:-1, cat:["Despesas Administrativas","Material Escritório","Papelaria"] },
  { id:"2.08.02", label:"Energia / Internet / TI",           nivel:3, sinal:-1, cat:["Energia Elétrica","Internet/Sistemas","Sistema/TI","Despesas fixas"] },
  { id:"2.08.03", label:"Associações / Sindicatos",          nivel:3, sinal:-1, cat:["Associações"] },
  { id:"2.08.99", label:"Outros ADM",                        nivel:3, sinal:-1, cat:["Administrativo"] },
  { id:"2.09",    label:"2.09. Serviços Terceiros ADM",      nivel:2, sinal:-1, cat:["Consultoria","Assessoria Contábil","Assessoria Sistema/TI"] },
  { id:"2.10",    label:"2.10. Recursos Humanos",            nivel:2, sinal:-1 },
  { id:"2.10.01", label:"Salários",                          nivel:3, sinal:-1, cat:["Salários","Remuneração"] },
  { id:"2.10.02", label:"Pró-labore",                        nivel:3, sinal:-1, cat:["Pró-labore"] },
  { id:"2.10.03", label:"Encargos (INSS / FGTS)",            nivel:3, sinal:-1, cat:["Encargos","INSS","FGTS"] },
  { id:"2.10.04", label:"Benefícios / Plano de Saúde",       nivel:3, sinal:-1, cat:["Plano de Saúde","Benefícios"] },
  { id:"2.10.99", label:"Outros RH",                         nivel:3, sinal:-1, cat:["RH","Recursos Humanos","Comissão"] },
  { id:"2.11",    label:"2.11. Impostos e Taxas",            nivel:2, sinal:-1, cat:["Impostos","Impostos e Taxas","ITR","Funrural","IPVA","Licenciamento"] },
  { id:"2.12",    label:"2.12. Despesas Financeiras",        nivel:2, sinal:-1 },
  { id:"2.12.01", label:"Principal Empréstimos / CPR",       nivel:3, sinal:-1, cat:["Amortização de Dívida","Pagamento Custeio","Pagamento CPR","Principal","pagamento_divida"] },
  { id:"2.12.02", label:"Juros e Encargos Financeiros",      nivel:3, sinal:-1, cat:["Juros e IOF","Juros","IOF","juros"] },
  { id:"2.12.03", label:"Tarifas Bancárias",                 nivel:3, sinal:-1, cat:["Tarifas Bancárias"] },
  { id:"2.13",    label:"2.13. Investimentos",               nivel:2, sinal:-1, cat:["Investimentos","Aquisição de Máquinas"] },
  { id:"2.14",    label:"2.14. Adiantamentos",               nivel:2, sinal:-1, cat:["Adiantamento a Fornecedor","Adiantamentos"] },
  { id:"2.99",    label:"2.99. Outros",                      nivel:2, sinal:-1, cat:["Outros","outros","Compras Gerais","Despesas Gerais","Particular","Despesas Particulares"] },
];

function dfcDirectChildren(nodeId: string) {
  return PLANO_DFC.filter(n => {
    if (!n.id.startsWith(nodeId + ".")) return false;
    const rest = n.id.slice(nodeId.length + 1);
    return !rest.includes(".");
  });
}
function dfcAncestors(nodeId: string): string[] {
  const parts = nodeId.split(".");
  const ancs: string[] = [];
  for (let i = 1; i < parts.length; i++) ancs.push(parts.slice(0, i).join("."));
  return ancs;
}

// ── conciliação estática (OFX será integrado no futuro) ───────
const conciliados: { data: string; descricao: string; valor: number; tipo: "credito" | "debito"; conciliado: boolean; lancRef: string }[] = [];

// ═══════════════════════════════════════════════════════════════
export default function Financeiro() {
  const { fazendaId } = useAuth();
  const [lancamentos, setLancamentos] = useState<Lancamento[]>([]);
  const [loading, setLoading]   = useState(true);
  const [erro, setErro]         = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [aba, setAba]           = useState<Aba>("lancamentos");
  const [filtro, setFiltro]     = useState<FiltroCP>("todos");

  // ── Período de consulta (12 meses: -3 meses até +9 meses) ────
  const [periodoInicio, setPeriodoInicio] = useState(() => {
    const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - 3);
    return d.toISOString().split("T")[0];
  });
  const [periodoFim, setPeriodoFim] = useState(() => {
    const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() + 10); d.setDate(0);
    return d.toISOString().split("T")[0];
  });
  const [periodoTemp, setPeriodoTemp] = useState({ inicio: "", fim: "" });
  const [saldoZero, setSaldoZero]   = useState(false);
  const [saldoAnterior, setSaldoAnterior] = useState(0);
  const [modalBaixa, setModalBaixa] = useState<Lancamento | null>(null);
  const [modalNovo, setModalNovo]   = useState(false);

  // Fluxo de caixa
  const [subAbaFluxo, setSubAbaFluxo]   = useState<SubAbaFluxo>("vertical");
  const [diasExpandidos, setDiasExpandidos] = useState<Set<string>>(new Set());
  const [previsoes, setPrevisoes]         = useState<Previsao[]>([]);
  const [simulacoes, setSimulacoes]       = useState<Simulacao[]>([]);
  const [modalPrevisao, setModalPrevisao]   = useState(false);
  const [modalSimDia, setModalSimDia]       = useState<string | null>(null);
  const [modalGerenciarSim, setModalGerenciarSim] = useState(false);
  const [modalConverterPrev, setModalConverterPrev] = useState<Previsao | null>(null);
  const [abaPrevisao, setAbaPrevisao]       = useState<"lista" | "nova">("lista");

  // DFC horizontal
  const [modoDFC, setModoDFC]               = useState<"previsto" | "realizado">("realizado");
  const [dfcColapsados, setDfcColapsados]   = useState<Set<string>>(new Set());
  const [dfcApenasMov, setDfcApenasMov]     = useState(true);

  const [novaPrevisao, setNovaPrevisao] = useState({ tipo: "pagar" as TipoLanc, descricao: "", categoria: "Insumos — Defensivos", data: "", valorMask: "" });
  const [novaSim, setNovaSim]           = useState({ tipo: "pagar" as TipoLanc, descricao: "", valorMask: "", data: TODAY });

  const [baixa, setBaixa] = useState({ valorMask: "", data: TODAY, conta: "BB Conta Corrente", obs: "" });
  const [novoLanc, setNovoLanc] = useState({
    tipo: "pagar" as TipoLanc, moeda: "BRL" as Moeda,
    descricao: "", categoria: "Insumos", vencimento: "",
    valorMask: "", cotacaoMask: "5,12",
    sacasMask: "", culturaBarter: "soja", precoSacaMask: "120,00", obs: "",
    // Parcelamento
    parcelar: false, totalParcelas: "1", intervaloMeses: "1",
    // LCDPR
    tipo_documento_lcdpr: "RECIBO" as NonNullable<Lancamento["tipo_documento_lcdpr"]>,
    // Encargos
    juros_pct: "", multa_pct: "", desconto_pct: "",
    // Vínculos
    chave_xml: "", talhao: "", centro_custo: "",
  });

  // ── carga ──────────────────────────────────────────────────
  useEffect(() => {
    if (fazendaId) {
      setPeriodoTemp({ inicio: periodoInicio, fim: periodoFim });
      carregarDados();
    }
  }, [fazendaId, periodoInicio, periodoFim]);

  async function carregarDados() {
    try {
      setLoading(true);
      setErro(null);
      const [lans] = await Promise.all([
        listarLancamentosPeriodo(fazendaId!, periodoInicio, periodoFim),
        calcularSaldoAnterior(fazendaId!, periodoInicio).then(setSaldoAnterior).catch(() => setSaldoAnterior(0)),
      ]);
      setLancamentos(lans);
      listarSimulacoes(fazendaId!).then(setSimulacoes).catch(() => setSimulacoes([]));
    } catch (e: unknown) {
      setErro(e instanceof Error ? e.message : "Erro ao carregar lançamentos");
    } finally {
      setLoading(false);
    }
  }

  function aplicarPeriodo() {
    if (!periodoTemp.inicio || !periodoTemp.fim) return;
    if (periodoTemp.inicio > periodoTemp.fim) return;
    setPeriodoInicio(periodoTemp.inicio);
    setPeriodoFim(periodoTemp.fim);
  }

  // ── ações ──────────────────────────────────────────────────
  const abrirBaixa = (l: Lancamento) => {
    setModalBaixa(l);
    setBaixa({ valorMask: l.moeda === "barter" ? "" : numParaMascara(paraBRL(l)), data: TODAY, conta: "BB Conta Corrente", obs: "" });
  };

  const confirmarBaixa = async () => {
    if (!modalBaixa) return;
    if (modalBaixa.moeda !== "barter" && !baixa.valorMask) return;
    const valorPago = modalBaixa.moeda === "barter" ? 0 : desmascarar(baixa.valorMask);
    try {
      setSalvando(true);
      await baixarLancamento(modalBaixa.id, valorPago, baixa.data, modalBaixa.moeda === "barter" ? "" : baixa.conta);
      setLancamentos(prev => prev.map(l =>
        l.id !== modalBaixa.id ? l
          : { ...l, status: "baixado" as const, data_baixa: baixa.data, valor_pago: valorPago, conta_bancaria: baixa.conta }
      ));
      setModalBaixa(null);
      setBaixa({ valorMask: "", data: TODAY, conta: "BB Conta Corrente", obs: "" });
    } catch (e: unknown) {
      alert("Erro: " + (e instanceof Error ? e.message : e));
    } finally {
      setSalvando(false);
    }
  };

  const adicionarLancamento = async () => {
    if (!novoLanc.descricao || !novoLanc.vencimento) return;
    if (novoLanc.moeda !== "barter" && !novoLanc.valorMask) return;
    if (novoLanc.moeda === "barter" && !novoLanc.sacasMask) return;
    const sacas       = Number(novoLanc.sacasMask);
    const precoSaca   = desmascarar(novoLanc.precoSacaMask);
    const valorFinal  = novoLanc.moeda === "barter" ? sacas * precoSaca : desmascarar(novoLanc.valorMask);
    const cotacao_usd = novoLanc.moeda === "USD" ? desmascarar(novoLanc.cotacaoMask) : undefined;
    const base: Omit<Lancamento, "id" | "created_at" | "num_parcela" | "total_parcelas" | "agrupador"> = {
      fazenda_id:              fazendaId!,
      tipo:                    novoLanc.tipo,
      moeda:                   novoLanc.moeda,
      descricao:               novoLanc.descricao,
      categoria:               novoLanc.categoria,
      data_lancamento:         TODAY,
      data_vencimento:         novoLanc.vencimento,
      valor:                   valorFinal,
      status:                  "em_aberto",
      auto:                    false,
      cotacao_usd,
      sacas:                   novoLanc.moeda === "barter" ? sacas : undefined,
      cultura_barter:          novoLanc.moeda === "barter" ? novoLanc.culturaBarter : undefined,
      preco_saca_barter:       novoLanc.moeda === "barter" ? precoSaca : undefined,
      tipo_documento_lcdpr:    novoLanc.tipo_documento_lcdpr || undefined,
      juros_pct:               novoLanc.juros_pct   ? Number(novoLanc.juros_pct)   : undefined,
      multa_pct:               novoLanc.multa_pct   ? Number(novoLanc.multa_pct)   : undefined,
      desconto_pontualidade_pct: novoLanc.desconto_pct ? Number(novoLanc.desconto_pct) : undefined,
      chave_xml:               novoLanc.chave_xml   || undefined,
      talhao:                  novoLanc.talhao      || undefined,
      centro_custo:            novoLanc.centro_custo || undefined,
      observacao:              novoLanc.obs         || undefined,
    };
    const totalParcelas  = novoLanc.parcelar ? Math.max(1, Number(novoLanc.totalParcelas) || 1) : 1;
    const intervaloMeses = Math.max(1, Number(novoLanc.intervaloMeses) || 1);
    try {
      setSalvando(true);
      let criados: Lancamento[];
      if (totalParcelas > 1) {
        criados = await criarParcelamento(base, totalParcelas, intervaloMeses);
      } else {
        const unico = await criarLancamento(base);
        criados = [unico];
      }
      setLancamentos(prev => [...criados, ...prev]);
      setNovoLanc({ tipo: "pagar", moeda: "BRL", descricao: "", categoria: "Insumos", vencimento: "", valorMask: "", cotacaoMask: "5,12", sacasMask: "", culturaBarter: "soja", precoSacaMask: "120,00", obs: "", parcelar: false, totalParcelas: "1", intervaloMeses: "1", tipo_documento_lcdpr: "RECIBO", juros_pct: "", multa_pct: "", desconto_pct: "", chave_xml: "", talhao: "", centro_custo: "" });
      setModalNovo(false);
    } catch (e: unknown) {
      alert("Erro ao salvar: " + (e instanceof Error ? e.message : e));
    } finally {
      setSalvando(false);
    }
  };

  // ── previsões ──────────────────────────────────────────────
  const salvarPrevisao = () => {
    if (!novaPrevisao.descricao || !novaPrevisao.data || !novaPrevisao.valorMask) return;
    const nova: Previsao = {
      id: crypto.randomUUID(),
      tipo: novaPrevisao.tipo,
      descricao: novaPrevisao.descricao,
      categoria: novaPrevisao.categoria,
      data: novaPrevisao.data,
      valor: desmascarar(novaPrevisao.valorMask),
    };
    setPrevisoes(prev => [...prev, nova]);
    setNovaPrevisao({ tipo: "pagar", descricao: "", categoria: "Insumos — Defensivos", data: "", valorMask: "" });
    setAbaPrevisao("lista");
  };

  const converterPrevisaoEmCP = async (p: Previsao) => {
    try {
      setSalvando(true);
      const criado = await criarLancamento({
        fazenda_id: fazendaId!, tipo: p.tipo, moeda: "BRL",
        descricao: p.descricao, categoria: p.categoria,
        data_lancamento: TODAY, data_vencimento: p.data,
        valor: p.valor, status: "em_aberto", auto: false,
      });
      setLancamentos(prev => [criado, ...prev]);
      setPrevisoes(prev => prev.filter(x => x.id !== p.id));
      setModalConverterPrev(null);
    } catch (e: unknown) {
      alert("Erro: " + (e instanceof Error ? e.message : e));
    } finally {
      setSalvando(false);
    }
  };

  // ── simulações ──────────────────────────────────────────────
  const salvarSimulacao = async () => {
    if (!modalSimDia || !novaSim.descricao || !novaSim.valorMask || !novaSim.data) return;
    try {
      setSalvando(true);
      const nova = await criarSimulacao({
        fazenda_id: fazendaId!,
        tipo: novaSim.tipo,
        descricao: novaSim.descricao,
        data: novaSim.data,
        valor: desmascarar(novaSim.valorMask),
        ativa: true,
      });
      setSimulacoes(prev => [...prev, nova]);
      setNovaSim({ tipo: "pagar", descricao: "", valorMask: "", data: TODAY });
      setModalSimDia(null);
    } catch (e: unknown) {
      alert("Erro: " + (e instanceof Error ? e.message : e));
    } finally {
      setSalvando(false);
    }
  };

  const handleToggleSim = async (id: string, ativa: boolean) => {
    try {
      await toggleSimulacao(id, ativa);
      setSimulacoes(prev => prev.map(s => s.id === id ? { ...s, ativa } : s));
    } catch (e: unknown) {
      alert("Erro: " + (e instanceof Error ? e.message : e));
    }
  };

  const handleExcluirSim = async (id: string) => {
    try {
      await excluirSimulacao(id);
      setSimulacoes(prev => prev.filter(s => s.id !== id));
    } catch (e: unknown) {
      alert("Erro: " + (e instanceof Error ? e.message : e));
    }
  };

  // ── métricas ───────────────────────────────────────────────
  const lancOper   = lancamentos.filter(l => l.moeda !== "barter");
  const aReceber   = lancOper.filter(l => l.tipo === "receber" && l.status !== "baixado").reduce((a, l) => a + paraBRL(l), 0);
  const aPagar     = lancOper.filter(l => l.tipo === "pagar"   && l.status !== "baixado").reduce((a, l) => a + paraBRL(l), 0);
  const saldoMes   = lancOper.filter(l => l.status === "baixado" && (l.data_vencimento ?? "") >= "2026-03-01")
                       .reduce((a, l) => a + (l.tipo === "receber" ? (l.valor_pago ?? 0) : -(l.valor_pago ?? 0)), 0);
  const vencidos   = lancamentos.filter(l => l.status === "vencido").length;
  const vencendo   = lancamentos.filter(l => l.status === "vencendo").length;
  const totalBarter = lancamentos.filter(l => l.moeda === "barter" && l.status !== "baixado").reduce((a, l) => a + l.valor, 0);
  const qtdBarter  = lancamentos.filter(l => l.moeda === "barter" && l.status !== "baixado").length;

  const lancFiltrados = lancamentos.filter(l => {
    if (filtro === "receber")  return l.tipo === "receber" && l.status !== "baixado" && l.moeda !== "barter";
    if (filtro === "pagar")    return l.tipo === "pagar"   && l.status !== "baixado" && l.moeda !== "barter";
    if (filtro === "vencidos") return l.status === "vencido" || l.status === "vencendo";
    if (filtro === "baixados") return l.status === "baixado";
    if (filtro === "barter")   return l.moeda === "barter";
    return true;
  });

  // ── DFC Horizontal — meses do período selecionado ────────
  const mesesDFC = (() => {
    const meses: { label: string; keyMes: string; passado: boolean }[] = [];
    const cur = new Date(periodoInicio + "T00:00:00");
    cur.setDate(1);
    const fim = new Date(periodoFim + "T00:00:00");
    const hojeKey = TODAY.slice(0, 7);
    while (cur <= fim) {
      const ano = cur.getFullYear();
      const mes = cur.getMonth() + 1;
      const keyMes = `${ano}-${String(mes).padStart(2, "0")}`;
      meses.push({ label: nomeMes(ano, mes), keyMes, passado: keyMes < hojeKey });
      cur.setMonth(cur.getMonth() + 1);
    }
    return meses;
  })();

  const somaMesCategoria = (keyMes: string, tipo: TipoLanc, categoria: string) =>
    lancamentos
      .filter(l => l.moeda !== "barter" && l.tipo === tipo &&
        (l.data_vencimento ?? "").startsWith(keyMes) &&
        (tipo === "pagar" ? l.status !== "baixado" || l.status === "baixado" : true) &&
        l.categoria === categoria)
      .reduce((a, l) => a + paraBRL(l), 0);

  const somaEntradas = (keyMes: string) =>
    lancamentos.filter(l => l.moeda !== "barter" && l.tipo === "receber" && (l.data_vencimento ?? "").startsWith(keyMes)).reduce((a, l) => a + paraBRL(l), 0);
  const somaSaidas = (keyMes: string) =>
    lancamentos.filter(l => l.moeda !== "barter" && l.tipo === "pagar" && (l.data_vencimento ?? "").startsWith(keyMes)).reduce((a, l) => a + paraBRL(l), 0);

  // saldo acumulado: começa no saldo anterior ao período (ou 0 se toggle ativo)
  let saldoAcum = saldoZero ? 0 : saldoAnterior;
  const saldosMes = mesesDFC.map(m => {
    const s = saldoAcum + somaEntradas(m.keyMes) - somaSaidas(m.keyMes);
    const anterior = saldoAcum;
    saldoAcum = s;
    return { ...m, saldoInicial: anterior, saldoFinal: s, entradas: somaEntradas(m.keyMes), saidas: somaSaidas(m.keyMes) };
  });

  // ── Fluxo Vertical — dias ─────────────────────────────────
  // Coleta todos os dias com pelo menos um evento
  const todasDatas = new Set<string>([
    ...lancamentos.filter(l => l.moeda !== "barter").map(l => l.data_vencimento ?? ""),
    ...previsoes.map(p => p.data),
    ...simulacoes.filter(s => s.ativa).map(s => s.data),
  ].filter(Boolean));

  // Inclui os próximos 30 dias sem eventos para mostrar fluxo contínuo
  for (let i = 0; i < 30; i++) {
    const d = new Date(TODAY);
    d.setDate(d.getDate() + i);
    todasDatas.add(d.toISOString().split("T")[0]);
  }

  const diasOrdenados = Array.from(todasDatas).sort();

  const toggleDia = (dia: string) => {
    setDiasExpandidos(prev => {
      const next = new Set(prev);
      if (next.has(dia)) next.delete(dia); else next.add(dia);
      return next;
    });
  };

  const expandirTodos = () => setDiasExpandidos(new Set(diasOrdenados));
  const recolherTodos = () => setDiasExpandidos(new Set());

  // ── render ─────────────────────────────────────────────────
  const d30 = new Date(TODAY); d30.setDate(d30.getDate() + 30);
  const d30Key = d30.toISOString().split("T")[0];

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh", background: "#F3F6F9", fontFamily: "system-ui, sans-serif", fontSize: 13 }}>
      <TopNav />
      <main style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>

        {/* Header */}
        <header style={{ background: "#fff", borderBottom: "0.5px solid #D4DCE8", padding: "10px 22px 0 22px" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", paddingBottom: 10 }}>
            <div>
              <h1 style={{ margin: 0, fontSize: 17, fontWeight: 600, color: "#1a1a1a" }}>Fluxo de Caixa</h1>
              <p style={{ margin: 0, fontSize: 11, color: "#444" }}>Projeção dia a dia, DFC mensal e análise Previsto × Realizado</p>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 11, color: "#555" }}>Cotação: <strong style={{ color: "#7A4300" }}>US$ 1 = R$ {COTACAO_USD.toFixed(2)}</strong></span>
              <button onClick={() => setModalNovo(true)} style={{ background: "#C9921B", color: "#fff", border: "none", borderRadius: 8, padding: "8px 16px", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
                ◈ Novo lançamento
              </button>
            </div>
          </div>
          {/* Barra de período */}
          <div style={{ display: "flex", alignItems: "center", gap: 10, paddingBottom: 10, borderTop: "0.5px solid #F0F3F8", paddingTop: 8 }}>
            <span style={{ fontSize: 11, color: "#555", fontWeight: 600 }}>Período:</span>
            <input type="date" value={periodoTemp.inicio || periodoInicio}
              onChange={e => setPeriodoTemp(p => ({ ...p, inicio: e.target.value }))}
              style={{ fontSize: 12, padding: "4px 8px", border: "0.5px solid #D4DCE8", borderRadius: 6, outline: "none", background: "#fff" }} />
            <span style={{ fontSize: 11, color: "#888" }}>até</span>
            <input type="date" value={periodoTemp.fim || periodoFim}
              onChange={e => setPeriodoTemp(p => ({ ...p, fim: e.target.value }))}
              style={{ fontSize: 12, padding: "4px 8px", border: "0.5px solid #D4DCE8", borderRadius: 6, outline: "none", background: "#fff" }} />
            <button onClick={aplicarPeriodo}
              style={{ fontSize: 12, padding: "4px 14px", borderRadius: 6, border: "0.5px solid #1A4870", background: "#D5E8F5", color: "#0B2D50", cursor: "pointer", fontWeight: 600 }}>
              Carregar
            </button>
            <label style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, color: "#555", cursor: "pointer", userSelect: "none" }}>
              <input type="checkbox" checked={saldoZero} onChange={e => setSaldoZero(e.target.checked)} style={{ cursor: "pointer", accentColor: "#1A4870" }} />
              Iniciar com saldo 0
            </label>
            {!saldoZero && saldoAnterior !== 0 && (
              <span style={{ fontSize: 11, color: saldoAnterior >= 0 ? "#1A4870" : "#E24B4A", fontWeight: 600 }}>
                Saldo anterior: {fmtBRL(saldoAnterior)}
              </span>
            )}
            <span style={{ fontSize: 10, color: "#888" }}>
              {lancamentos.length} lançamentos no período
              {loading && " · carregando…"}
            </span>
          </div>
        </header>

        <div style={{ padding: "16px 22px", flex: 1, overflowY: "auto" }}>

          {erro && (
            <div style={{ background: "#FDECEA", border: "0.5px solid #E24B4A60", borderRadius: 8, padding: "10px 14px", marginBottom: 14, fontSize: 12, color: "#8B1A1A", display: "flex", gap: 8 }}>
              <span>✕</span><span>{erro}</span>
              <button onClick={carregarDados} style={{ marginLeft: "auto", fontSize: 11, color: "#8B1A1A", background: "none", border: "none", cursor: "pointer", textDecoration: "underline" }}>Tentar novamente</button>
            </div>
          )}

          {loading && <div style={{ textAlign: "center", padding: 40, color: "#444" }}>Carregando lançamentos…</div>}

          {!loading && !erro && (
            <>
              {/* Stats */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 14 }}>
                {[
                  { label: "A receber",          valor: fmtBRL(aReceber), cor: "#1A4870", sub: `${lancOper.filter(l => l.tipo === "receber" && l.status !== "baixado").length} lançamentos em aberto` },
                  { label: "A pagar",            valor: fmtBRL(aPagar),   cor: "#E24B4A", sub: `${lancOper.filter(l => l.tipo === "pagar" && l.status !== "baixado").length} lançamentos em aberto` },
                  { label: "Recebido (mar/abr)", valor: fmtBRL(saldoMes), cor: "#1A4870", sub: "Saldo de baixas realizadas" },
                  { label: "Atenção imediata",   valor: String(vencidos + vencendo), cor: vencidos > 0 ? "#E24B4A" : "#EF9F27", sub: `${vencidos} vencido(s) · ${vencendo} vencendo` },
                ].map((s, i) => (
                  <div key={i} style={{ background: "#fff", border: "0.5px solid #D4DCE8", borderRadius: 12, padding: "14px 16px" }}>
                    <div style={{ fontSize: 11, color: "#555", marginBottom: 6 }}>{s.label}</div>
                    <div style={{ fontSize: 19, fontWeight: 600, color: s.cor, marginBottom: 4 }}>{s.valor}</div>
                    <div style={{ fontSize: 10, color: "#444" }}>{s.sub}</div>
                  </div>
                ))}
              </div>

              {/* Banner barter */}
              {qtdBarter > 0 && (
                <div style={{ background: "#FBF3E0", border: "0.5px solid #8B5E1430", borderRadius: 8, padding: "9px 14px", marginBottom: 10, fontSize: 12, color: "#8B5E14", display: "flex", alignItems: "center", gap: 10 }}>
                  <span>⇄</span>
                  <span style={{ flex: 1 }}>
                    <strong>{qtdBarter} lançamento(s) em barter</strong> — equivalente gerencial: <strong>{fmtBRL(totalBarter)}</strong> · não compõem o fluxo de caixa operacional
                  </span>
                </div>
              )}

              {/* Alertas vencimento */}
              {(vencidos > 0 || vencendo > 0) && (
                <div style={{ background: vencidos > 0 ? "#FCEBEB" : "#FAEEDA", border: `0.5px solid ${vencidos > 0 ? "#E24B4A" : "#EF9F27"}50`, borderRadius: 8, padding: "9px 14px", marginBottom: 14, fontSize: 12, color: vencidos > 0 ? "#791F1F" : "#633806", display: "flex", alignItems: "center", gap: 10 }}>
                  <span>⚠</span>
                  <span style={{ flex: 1 }}>
                    {vencidos > 0 && <><strong>{vencidos} lançamento(s) vencido(s)</strong> aguardando baixa. </>}
                    {vencendo > 0 && <><strong>{vencendo} vencendo hoje</strong> — providencie o pagamento/recebimento.</>}
                  </span>
                </div>
              )}

              {lancamentos.length === 0 && (
                <div style={{ background: "#fff", border: "0.5px solid #D4DCE8", borderRadius: 12, padding: 32, textAlign: "center", color: "#444", fontSize: 12 }}>
                  Nenhum lançamento cadastrado. Clique em ◈ Novo lançamento para começar.
                </div>
              )}

              {lancamentos.length > 0 && (
                <>
                  {/* Abas */}
                  <div style={{ display: "flex", background: "#fff", borderRadius: "12px 12px 0 0", border: "0.5px solid #D4DCE8", marginBottom: 0 }}>
                    {([
                      { key: "lancamentos", label: "Lançamentos CP/CR" },
                      { key: "fluxo",       label: "Fluxo de Caixa"    },
                      { key: "conciliacao", label: "Conciliação OFX"   },
                    ] as { key: Aba; label: string }[]).map(a => (
                      <button key={a.key} onClick={() => setAba(a.key)} style={{
                        padding: "11px 20px", border: "none", background: "transparent", cursor: "pointer",
                        fontWeight: aba === a.key ? 600 : 400, fontSize: 13,
                        color: aba === a.key ? "#1a1a1a" : "#555",
                        borderBottom: aba === a.key ? "2px solid #1A4870" : "2px solid transparent",
                      }}>
                        {a.label}
                        {a.key === "conciliacao" && (
                          <span style={{ marginLeft: 6, fontSize: 10, background: "#FAEEDA", color: "#633806", padding: "1px 6px", borderRadius: 8 }}>
                            {conciliados.filter(c => !c.conciliado).length} pendentes
                          </span>
                        )}
                        {a.key === "fluxo" && previsoes.length > 0 && (
                          <span style={{ marginLeft: 6, fontSize: 10, background: "#D5E8F5", color: "#0B2D50", padding: "1px 6px", borderRadius: 8 }}>
                            {previsoes.length} prev
                          </span>
                        )}
                      </button>
                    ))}
                  </div>

                  {/* ─── ABA: Lançamentos ─────────────────────── */}
                  {aba === "lancamentos" && (
                    <div style={{ background: "#fff", border: "0.5px solid #D4DCE8", borderTop: "none", borderRadius: "0 0 12px 12px", overflow: "hidden" }}>
                      <div style={{ padding: "12px 16px", borderBottom: "0.5px solid #DEE5EE", display: "flex", gap: 6, flexWrap: "wrap" }}>
                        {([
                          { key: "todos",    label: "Todos",         count: lancamentos.length },
                          { key: "receber",  label: "A Receber",     count: lancOper.filter(l => l.tipo === "receber" && l.status !== "baixado").length },
                          { key: "pagar",    label: "A Pagar",       count: lancOper.filter(l => l.tipo === "pagar"   && l.status !== "baixado").length },
                          { key: "vencidos", label: "Vencidos/Hoje", count: vencidos + vencendo },
                          { key: "baixados", label: "Baixados",      count: lancamentos.filter(l => l.status === "baixado").length },
                          { key: "barter",   label: "Barter",        count: lancamentos.filter(l => l.moeda === "barter").length },
                        ] as { key: FiltroCP; label: string; count: number }[]).map(f => (
                          <button key={f.key} onClick={() => setFiltro(f.key)} style={{
                            padding: "5px 12px", borderRadius: 20, border: "0.5px solid",
                            borderColor: filtro === f.key ? (f.key === "barter" ? "#8B5E14" : "#1A4870") : "#D4DCE8",
                            background:  filtro === f.key ? (f.key === "barter" ? "#FBF3E0" : "#D5E8F5") : "transparent",
                            color:       filtro === f.key ? (f.key === "barter" ? "#8B5E14" : "#0B2D50") : "#666",
                            fontWeight: filtro === f.key ? 600 : 400, fontSize: 12, cursor: "pointer",
                          }}>
                            {f.label}
                            <span style={{ marginLeft: 5, fontSize: 10, background: filtro === f.key ? "#1A4870" : "#DEE5EE", color: filtro === f.key ? "#fff" : "#555", padding: "1px 5px", borderRadius: 8 }}>
                              {f.count}
                            </span>
                          </button>
                        ))}
                      </div>

                      <table style={{ width: "100%", borderCollapse: "collapse" }}>
                        <thead>
                          <tr style={{ background: "#F3F6F9" }}>
                            {["Tipo / Moeda", "Descrição", "Categoria", "Vencimento", "Valor", "Status", "Origem", ""].map((h, i) => (
                              <th key={i} style={{ padding: "8px 14px", textAlign: i >= 3 ? "center" : "left", fontSize: 11, fontWeight: 600, color: "#555", borderBottom: "0.5px solid #D4DCE8", whiteSpace: "nowrap" }}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {lancFiltrados.map((l, li) => {
                            const cs = corStatus(l.status);
                            const cc = categoriasCor[l.categoria] ?? { bg: "#F1EFE8", color: "#555" };
                            const bm = badgeMoeda(l.moeda as Moeda);
                            const conv = exibirConversao(l);
                            return (
                              <tr key={l.id} style={{ borderBottom: li < lancFiltrados.length - 1 ? "0.5px solid #DEE5EE" : "none", background: l.moeda === "barter" ? "#FEF8ED" : "transparent" }}>
                                <td style={{ padding: "10px 14px" }}>
                                  <span style={{ display: "inline-block", fontSize: 10, padding: "3px 8px", borderRadius: 8, fontWeight: 600, background: l.tipo === "receber" ? "#D5E8F5" : "#FCEBEB", color: l.tipo === "receber" ? "#0B2D50" : "#791F1F" }}>
                                    {l.tipo === "receber" ? "↓ CR" : "↑ CP"}
                                  </span>
                                  <span style={{ display: "inline-block", marginLeft: 4, fontSize: 10, padding: "2px 6px", borderRadius: 6, background: bm.bg, color: bm.color }}>
                                    {bm.label}
                                  </span>
                                </td>
                                <td style={{ padding: "10px 14px", maxWidth: 220 }}>
                                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                    <span style={{ fontWeight: 600, fontSize: 12, color: "#1a1a1a" }}>{l.descricao}</span>
                                    {l.total_parcelas && l.total_parcelas > 1 && (
                                      <span style={{ fontSize: 10, background: "#E6F1FB", color: "#0C447C", padding: "1px 6px", borderRadius: 6, fontWeight: 600, whiteSpace: "nowrap" }}>
                                        {l.num_parcela}/{l.total_parcelas}
                                      </span>
                                    )}
                                  </div>
                                  {l.nfe_numero    && <div style={{ fontSize: 10, color: "#444" }}>NF-e {l.nfe_numero}</div>}
                                  {l.tipo_documento_lcdpr && <div style={{ fontSize: 10, color: "#555" }}>LCDPR: {l.tipo_documento_lcdpr}</div>}
                                  {l.centro_custo  && <div style={{ fontSize: 10, color: "#555" }}>{l.centro_custo}</div>}
                                  {l.data_baixa   && <div style={{ fontSize: 10, color: "#1A4870" }}>Baixado em {fmtData(l.data_baixa)} · {l.conta_bancaria}</div>}
                                </td>
                                <td style={{ padding: "10px 14px" }}>
                                  <span style={{ fontSize: 10, background: cc.bg, color: cc.color, padding: "2px 8px", borderRadius: 8 }}>{l.categoria}</span>
                                </td>
                                <td style={{ padding: "10px 14px", textAlign: "center", fontSize: 12, color: l.status === "vencido" ? "#E24B4A" : l.status === "vencendo" ? "#EF9F27" : "#666", fontWeight: l.status === "vencido" ? 600 : 400, whiteSpace: "nowrap" }}>
                                  {fmtData(l.data_vencimento)}
                                </td>
                                <td style={{ padding: "10px 14px", textAlign: "right", whiteSpace: "nowrap" }}>
                                  <div style={{ fontWeight: 600, color: l.moeda === "barter" ? "#8B5E14" : "#1a1a1a", fontSize: 12 }}>{exibirValor(l)}</div>
                                  {conv && <div style={{ fontSize: 10, color: "#444", marginTop: 1 }}>{conv}</div>}
                                </td>
                                <td style={{ padding: "10px 14px", textAlign: "center" }}>
                                  <span style={{ fontSize: 10, background: cs.bg, color: cs.color, padding: "2px 8px", borderRadius: 8 }}>{cs.label}</span>
                                </td>
                                <td style={{ padding: "10px 14px", textAlign: "center" }}>
                                  <span style={{ fontSize: 10, background: l.auto ? "#D5E8F5" : "#FBF0D8", color: l.auto ? "#0B2D50" : "#7A5A12", padding: "2px 7px", borderRadius: 8 }}>
                                    {l.auto ? "⟳ auto" : "◈ manual"}
                                  </span>
                                </td>
                                <td style={{ padding: "10px 14px", textAlign: "center" }}>
                                  {l.status !== "baixado" && (
                                    <button onClick={() => abrirBaixa(l)} style={{
                                      fontSize: 11, padding: "4px 12px", borderRadius: 6, cursor: "pointer", fontWeight: 600, whiteSpace: "nowrap",
                                      background: l.moeda === "barter" ? "#FBF3E0" : "#FBF0D8",
                                      color:      l.moeda === "barter" ? "#8B5E14" : "#7A5A12",
                                      border: `0.5px solid ${l.moeda === "barter" ? "#8B5E14" : "#C9921B"}`,
                                    }}>
                                      {l.moeda === "barter" ? "⇄ Confirmar" : "◈ Baixar"}
                                    </button>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>

                      <div style={{ padding: "10px 16px", borderTop: "0.5px solid #DEE5EE", display: "flex", justifyContent: "space-between", fontSize: 11, color: "#444" }}>
                        <span>CR lançadas automaticamente por NF-e: <strong style={{ color: "#1A4870" }}>{lancamentos.filter(l => l.auto && l.tipo === "receber").length}</strong></span>
                        <span>Funrural calculado automaticamente sobre as vendas</span>
                      </div>
                    </div>
                  )}

                  {/* ─── ABA: Fluxo de Caixa ─────────────────── */}
                  {aba === "fluxo" && (
                    <div style={{ background: "#fff", border: "0.5px solid #D4DCE8", borderTop: "none", borderRadius: "0 0 12px 12px" }}>

                      {/* Sub-abas Horizontal / Vertical */}
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 16px", borderBottom: "0.5px solid #DEE5EE" }}>
                        <div style={{ display: "flex", gap: 4 }}>
                          {([
                            { key: "horizontal", label: "⊞ DFC Mensal"      },
                            { key: "vertical",   label: "↕ Dia a dia"        },
                            { key: "prevreal",   label: "⇆ Previsto × Real"  },
                          ] as { key: SubAbaFluxo; label: string }[]).map(s => (
                            <button key={s.key} onClick={() => setSubAbaFluxo(s.key)} style={{
                              padding: "6px 14px", borderRadius: 8, border: "0.5px solid",
                              borderColor: subAbaFluxo === s.key ? "#1A4870" : "#D4DCE8",
                              background: subAbaFluxo === s.key ? "#D5E8F5" : "transparent",
                              color: subAbaFluxo === s.key ? "#0B2D50" : "#555",
                              fontWeight: subAbaFluxo === s.key ? 600 : 400, fontSize: 12, cursor: "pointer",
                            }}>{s.label}</button>
                          ))}
                        </div>
                        {subAbaFluxo === "vertical" && (
                          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                            <div style={{ fontSize: 11, display: "flex", gap: 10, color: "#555" }}>
                              <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                                <span style={{ width: 10, height: 10, background: "#D5E8F5", border: "1px solid #1A4870", borderRadius: 2, display: "inline-block" }} />
                                Previsão
                              </span>
                              <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                                <span style={{ width: 10, height: 10, background: "#FBF0D8", border: "1px solid #C9921B", borderRadius: 2, display: "inline-block" }} />
                                Simulação
                              </span>
                            </div>
                            <button onClick={() => { setAbaPrevisao("lista"); setModalPrevisao(true); }} style={{ fontSize: 11, padding: "5px 12px", borderRadius: 8, border: "0.5px solid #1A4870", background: "#D5E8F5", color: "#0B2D50", cursor: "pointer", fontWeight: 600 }}>
                              + Previsão
                            </button>
                            <button onClick={() => setModalGerenciarSim(true)} style={{ fontSize: 11, padding: "5px 12px", borderRadius: 8, border: "0.5px solid #C9921B", background: "#FBF0D8", color: "#7A5A12", cursor: "pointer", fontWeight: 600 }}>
                              ◈ Simulações{simulacoes.length > 0 && ` (${simulacoes.filter(s => s.ativa).length}/${simulacoes.length})`}
                            </button>
                            <button onClick={diasExpandidos.size > 0 ? recolherTodos : expandirTodos} style={{ fontSize: 11, padding: "5px 12px", borderRadius: 8, border: "0.5px solid #D4DCE8", background: "transparent", color: "#666", cursor: "pointer" }}>
                              {diasExpandidos.size > 0 ? "− Recolher tudo" : "+ Expandir tudo"}
                            </button>
                          </div>
                        )}
                      </div>

                      {/* ── VISÃO: DFC MENSAL HIERÁRQUICO ── */}
                      {subAbaFluxo === "horizontal" && (() => {
                        // Todas as categorias explicitamente mapeadas
                        const allMappedCats = new Set(
                          PLANO_DFC.filter(n => n.cat !== undefined).flatMap(n => n.cat!)
                        );

                        // Compute leaf value
                        const leafVal = (node: PlanoRow, keyMes: string): number => {
                          let cats = node.cat ?? [];
                          // catch-all captura categorias não mapeadas
                          if (node.id.endsWith(".99") || node.id === "2.99") {
                            const unassigned = [...new Set(
                              lancamentos
                                .filter(l => node.sinal === 1 ? l.tipo === "receber" : l.tipo === "pagar")
                                .map(l => l.categoria).filter(c => c && !allMappedCats.has(c))
                            )];
                            cats = [...cats, ...unassigned];
                          }
                          return lancamentos.filter(l => {
                            if (l.moeda === "barter") return false;
                            if (node.sinal === 1 ? l.tipo !== "receber" : l.tipo !== "pagar") return false;
                            if (!cats.includes(l.categoria)) return false;
                            if (modoDFC === "realizado") {
                              if (l.status !== "baixado") return false;
                              const ref = l.data_baixa ?? l.data_vencimento ?? "";
                              return ref.startsWith(keyMes);
                            }
                            return (l.data_vencimento ?? "").startsWith(keyMes);
                          }).reduce((a, l) => a + paraBRL(l), 0);
                        };

                        // Build allValues: leaf first, then parents bottom-up
                        const allVals: Record<string, Record<string, number>> = {};
                        for (const node of PLANO_DFC) {
                          if (node.cat !== undefined) {
                            const v: Record<string, number> = {};
                            for (const m of mesesDFC) v[m.keyMes] = leafVal(node, m.keyMes);
                            allVals[node.id] = v;
                          }
                        }
                        for (const node of [...PLANO_DFC].reverse()) {
                          if (node.cat === undefined) {
                            const ch = dfcDirectChildren(node.id);
                            const v: Record<string, number> = {};
                            for (const m of mesesDFC) v[m.keyMes] = ch.reduce((a, c) => a + (allVals[c.id]?.[m.keyMes] ?? 0), 0);
                            allVals[node.id] = v;
                          }
                        }

                        const nodeTotal = (id: string) => mesesDFC.reduce((a, m) => a + (allVals[id]?.[m.keyMes] ?? 0), 0);
                        const hasMov = (id: string) => mesesDFC.some(m => (allVals[id]?.[m.keyMes] ?? 0) !== 0);

                        const isHidden = (nodeId: string) =>
                          dfcAncestors(nodeId).some(a => dfcColapsados.has(a));

                        const toggleCollapse = (id: string) =>
                          setDfcColapsados(prev => {
                            const next = new Set(prev);
                            next.has(id) ? next.delete(id) : next.add(id);
                            return next;
                          });

                        // Footer
                        const totEntradas = (keyMes: string) => allVals["1"]?.[keyMes] ?? 0;
                        const totSaidas   = (keyMes: string) => allVals["2"]?.[keyMes] ?? 0;
                        const diferenca   = (keyMes: string) => totEntradas(keyMes) - totSaidas(keyMes);
                        let saldoAcumDFC = saldoZero ? 0 : saldoAnterior;
                        const saldosAcum: Record<string, number> = {};
                        for (const m of mesesDFC) {
                          saldoAcumDFC += diferenca(m.keyMes);
                          saldosAcum[m.keyMes] = saldoAcumDFC;
                        }

                        const fmtVal = (v: number, sinal: 1|-1) => {
                          if (v === 0) return <span style={{ color: "#ccc" }}>—</span>;
                          const display = sinal === 1 ? v : -v;
                          return <span style={{ color: display >= 0 ? "#1A4870" : "#E24B4A" }}>{fmtBRL(display)}</span>;
                        };

                        const NIVEL_STYLE: Record<number, React.CSSProperties> = {
                          1: { background: "#1A4870", color: "#fff", fontWeight: 700, fontSize: 12 },
                          2: { background: "#EEF3FA", color: "#1a1a1a", fontWeight: 600, fontSize: 11 },
                          3: { background: "#fff",    color: "#333",    fontWeight: 400, fontSize: 11 },
                        };
                        const NIVEL_INDENT: Record<number, number> = { 1: 0, 2: 12, 3: 26 };

                        return (
                          <div>
                            {/* Toolbar */}
                            <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 16px", borderBottom: "0.5px solid #DEE5EE", background: "#F9FAFB" }}>
                              <span style={{ fontSize: 11, color: "#555", fontWeight: 600 }}>Modo:</span>
                              {(["realizado","previsto"] as const).map(m => (
                                <button key={m} onClick={() => setModoDFC(m)} style={{
                                  fontSize: 11, padding: "4px 12px", borderRadius: 6, cursor: "pointer", fontWeight: modoDFC === m ? 600 : 400,
                                  border: `0.5px solid ${modoDFC === m ? "#1A4870" : "#D4DCE8"}`,
                                  background: modoDFC === m ? "#D5E8F5" : "transparent",
                                  color: modoDFC === m ? "#0B2D50" : "#555",
                                }}>
                                  {m === "realizado" ? "Realizado" : "Previsto"}
                                </button>
                              ))}
                              <span style={{ width: 1, height: 16, background: "#D4DCE8" }} />
                              <label style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, color: "#555", cursor: "pointer" }}>
                                <input type="checkbox" checked={dfcApenasMov} onChange={e => setDfcApenasMov(e.target.checked)} style={{ cursor: "pointer", accentColor: "#1A4870" }} />
                                Apenas com movimento
                              </label>
                              <span style={{ marginLeft: "auto", fontSize: 10, color: "#888" }}>
                                {modoDFC === "realizado" ? "Lançamentos baixados por data de baixa" : "Todos os lançamentos por data de vencimento"}
                              </span>
                            </div>

                            {/* Table */}
                            <div style={{ overflowX: "auto" }}>
                              <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 600 }}>
                                <thead>
                                  <tr style={{ background: "#F3F6F9" }}>
                                    <th style={{ padding: "8px 14px", textAlign: "left", fontSize: 11, fontWeight: 600, color: "#555", borderBottom: "0.5px solid #D4DCE8", minWidth: 240, position: "sticky", left: 0, background: "#F3F6F9", zIndex: 2 }}>
                                      Conta / Descrição
                                    </th>
                                    {mesesDFC.map(m => (
                                      <th key={m.keyMes} style={{ padding: "8px 10px", textAlign: "right", fontSize: 11, fontWeight: 600, color: m.passado ? "#555" : "#1a1a1a", borderBottom: "0.5px solid #D4DCE8", whiteSpace: "nowrap", minWidth: 110 }}>
                                        {m.label}
                                        {m.passado && <div style={{ fontSize: 9, color: "#888", fontWeight: 400 }}>{modoDFC}</div>}
                                      </th>
                                    ))}
                                    <th style={{ padding: "8px 10px", textAlign: "right", fontSize: 11, fontWeight: 700, color: "#1a1a1a", borderBottom: "0.5px solid #D4DCE8", whiteSpace: "nowrap", minWidth: 120, background: "#F3F6F9" }}>
                                      Total
                                    </th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {PLANO_DFC.map(node => {
                                    if (isHidden(node.id)) return null;
                                    if (dfcApenasMov && !hasMov(node.id)) return null;
                                    const hasChildren = node.cat === undefined;
                                    const collapsed = dfcColapsados.has(node.id);
                                    const s = NIVEL_STYLE[node.nivel];
                                    const indent = NIVEL_INDENT[node.nivel];
                                    const total = nodeTotal(node.id);
                                    return (
                                      <tr key={node.id} style={{ borderBottom: "0.5px solid #E8ECF2" }}>
                                        <td
                                          onClick={() => hasChildren && toggleCollapse(node.id)}
                                          style={{ ...s, padding: "7px 14px", paddingLeft: 14 + indent, position: "sticky", left: 0, zIndex: 1, cursor: hasChildren ? "pointer" : "default", whiteSpace: "nowrap", minWidth: 240, userSelect: "none" }}
                                        >
                                          <span style={{ marginRight: 6, fontSize: 10, opacity: hasChildren ? 1 : 0 }}>
                                            {collapsed ? "▶" : "▼"}
                                          </span>
                                          {node.label}
                                        </td>
                                        {mesesDFC.map(m => {
                                          const v = allVals[node.id]?.[m.keyMes] ?? 0;
                                          return (
                                            <td key={m.keyMes} style={{ ...s, padding: "7px 10px", textAlign: "right" }}>
                                              {v !== 0 ? fmtVal(v, node.sinal) : <span style={{ color: node.nivel === 1 ? "#ffffff44" : "#ccc" }}>—</span>}
                                            </td>
                                          );
                                        })}
                                        <td style={{ ...s, padding: "7px 10px", textAlign: "right", fontWeight: 700 }}>
                                          {total !== 0 ? fmtVal(total, node.sinal) : <span style={{ color: node.nivel === 1 ? "#ffffff44" : "#ccc" }}>—</span>}
                                        </td>
                                      </tr>
                                    );
                                  })}

                                  {/* ── Rodapé ── */}
                                  <tr style={{ background: "#F3F6F9", borderTop: "2px solid #D4DCE8" }}>
                                    <td style={{ padding: "8px 14px", fontSize: 11, fontWeight: 600, color: "#555", position: "sticky", left: 0, background: "#F3F6F9", zIndex: 1 }}>Saldo Anterior</td>
                                    <td colSpan={mesesDFC.length + 1} style={{ padding: "8px 10px", textAlign: "right", fontSize: 11, fontWeight: 600, color: saldoAnterior >= 0 ? "#1A4870" : "#E24B4A" }}>
                                      {saldoZero ? "Iniciando em R$ 0,00" : fmtBRL(saldoAnterior)}
                                    </td>
                                  </tr>
                                  <tr style={{ background: "#E4F0F9" }}>
                                    <td style={{ padding: "7px 14px", fontSize: 11, fontWeight: 600, color: "#0B2D50", position: "sticky", left: 0, background: "#E4F0F9", zIndex: 1 }}>▲ Total Entradas</td>
                                    {mesesDFC.map(m => (
                                      <td key={m.keyMes} style={{ padding: "7px 10px", textAlign: "right", fontSize: 11, fontWeight: 600, color: totEntradas(m.keyMes) > 0 ? "#1A4870" : "#888" }}>
                                        {totEntradas(m.keyMes) > 0 ? fmtBRL(totEntradas(m.keyMes)) : "—"}
                                      </td>
                                    ))}
                                    <td style={{ padding: "7px 10px", textAlign: "right", fontSize: 11, fontWeight: 700, color: "#1A4870" }}>
                                      {fmtBRL(mesesDFC.reduce((a, m) => a + totEntradas(m.keyMes), 0))}
                                    </td>
                                  </tr>
                                  <tr style={{ background: "#FEF3F3" }}>
                                    <td style={{ padding: "7px 14px", fontSize: 11, fontWeight: 600, color: "#791F1F", position: "sticky", left: 0, background: "#FEF3F3", zIndex: 1 }}>▼ Total Saídas</td>
                                    {mesesDFC.map(m => (
                                      <td key={m.keyMes} style={{ padding: "7px 10px", textAlign: "right", fontSize: 11, fontWeight: 600, color: totSaidas(m.keyMes) > 0 ? "#E24B4A" : "#888" }}>
                                        {totSaidas(m.keyMes) > 0 ? fmtBRL(-totSaidas(m.keyMes)) : "—"}
                                      </td>
                                    ))}
                                    <td style={{ padding: "7px 10px", textAlign: "right", fontSize: 11, fontWeight: 700, color: "#E24B4A" }}>
                                      {fmtBRL(-mesesDFC.reduce((a, m) => a + totSaidas(m.keyMes), 0))}
                                    </td>
                                  </tr>
                                  <tr style={{ background: "#F8F9FB", borderTop: "0.5px solid #D4DCE8" }}>
                                    <td style={{ padding: "7px 14px", fontSize: 11, fontWeight: 600, color: "#555", position: "sticky", left: 0, background: "#F8F9FB", zIndex: 1 }}>= Diferença</td>
                                    {mesesDFC.map(m => {
                                      const d = diferenca(m.keyMes);
                                      return (
                                        <td key={m.keyMes} style={{ padding: "7px 10px", textAlign: "right", fontSize: 11, fontWeight: 600, color: d > 0 ? "#16A34A" : d < 0 ? "#E24B4A" : "#888" }}>
                                          {d !== 0 ? fmtBRL(d) : "—"}
                                        </td>
                                      );
                                    })}
                                    <td style={{ padding: "7px 10px", textAlign: "right", fontSize: 11, fontWeight: 700, color: "#555" }}>
                                      {fmtBRL(mesesDFC.reduce((a, m) => a + diferenca(m.keyMes), 0))}
                                    </td>
                                  </tr>
                                  <tr style={{ background: "#1A4870" }}>
                                    <td style={{ padding: "8px 14px", fontSize: 11, fontWeight: 700, color: "#fff", position: "sticky", left: 0, background: "#1A4870", zIndex: 1 }}>Saldo Acumulado</td>
                                    {mesesDFC.map(m => {
                                      const s = saldosAcum[m.keyMes] ?? 0;
                                      return (
                                        <td key={m.keyMes} style={{ padding: "8px 10px", textAlign: "right", fontSize: 12, fontWeight: 700, color: s >= 0 ? "#A8D8F0" : "#FFAAAA" }}>
                                          {fmtBRL(s)}
                                        </td>
                                      );
                                    })}
                                    <td style={{ padding: "8px 10px", textAlign: "right", fontSize: 12, fontWeight: 700, color: "#fff" }}>
                                      {fmtBRL(saldoAcumDFC)}
                                    </td>
                                  </tr>
                                </tbody>
                              </table>
                            </div>
                            <div style={{ padding: "6px 14px", fontSize: 10, color: "#666", background: "#F9FAFB", borderTop: "0.5px solid #E8ECF2" }}>
                              Barter excluído · USD convertido à cotação vigente · clique nos grupos para expandir/recolher
                            </div>
                          </div>
                        );
                      })()}

                      {/* DFC MENSAL (legado desativado) */}
                      {false && (
                        <div>
                          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 700 }}>
                            <thead>
                              <tr style={{ background: "#F3F6F9" }}>
                                <th style={{ padding: "10px 16px", textAlign: "left", fontSize: 11, fontWeight: 600, color: "#555", borderBottom: "0.5px solid #D4DCE8", width: 200 }}>
                                  Demonstrativo de Fluxo de Caixa
                                </th>
                                {saldosMes.map(m => (
                                  <th key={m.keyMes} style={{ padding: "10px 12px", textAlign: "right", fontSize: 11, fontWeight: 600, color: m.passado ? "#444" : "#1a1a1a", borderBottom: "0.5px solid #D4DCE8", whiteSpace: "nowrap" }}>
                                    {m.label}
                                    {m.passado && <div style={{ fontSize: 9, color: "#666", fontWeight: 400 }}>realizado</div>}
                                  </th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {/* Saldo inicial */}
                              <tr style={{ background: "#F3F6F9" }}>
                                <td style={{ padding: "8px 16px", fontSize: 11, fontWeight: 600, color: "#1a1a1a", borderBottom: "0.5px solid #D4DCE8" }}>Saldo inicial</td>
                                {saldosMes.map(m => (
                                  <td key={m.keyMes} style={{ padding: "8px 12px", textAlign: "right", fontSize: 12, fontWeight: 600, color: "#1a1a1a", borderBottom: "0.5px solid #D4DCE8" }}>
                                    {m.saldoInicial !== 0 ? fmtBRL(m.saldoInicial) : "—"}
                                  </td>
                                ))}
                              </tr>

                              {/* Entradas */}
                              <tr style={{ background: "#E4F0F9" }}>
                                <td style={{ padding: "7px 16px", fontSize: 11, fontWeight: 600, color: "#0B2D50", borderBottom: "0.5px solid #D4DCE8" }}>▲ Entradas</td>
                                {saldosMes.map(m => (
                                  <td key={m.keyMes} style={{ padding: "7px 12px", textAlign: "right", fontSize: 11, fontWeight: 600, color: "#1A4870", borderBottom: "0.5px solid #D4DCE8" }}>
                                    {m.entradas > 0 ? fmtBRL(m.entradas) : "—"}
                                  </td>
                                ))}
                              </tr>
                              {DFC_ENTRADAS.map(cat => {
                                const vals = mesesDFC.map(m => somaMesCategoria(m.keyMes, "receber", cat));
                                if (vals.every(v => v === 0)) return null;
                                return (
                                  <tr key={cat}>
                                    <td style={{ padding: "6px 16px 6px 28px", fontSize: 11, color: "#1a1a1a", borderBottom: "0.5px solid #f5f5f5" }}>{cat}</td>
                                    {vals.map((v, i) => (
                                      <td key={i} style={{ padding: "6px 12px", textAlign: "right", fontSize: 11, color: v > 0 ? "#1A4870" : "#666", borderBottom: "0.5px solid #f5f5f5" }}>
                                        {v > 0 ? fmtBRL(v) : "—"}
                                      </td>
                                    ))}
                                  </tr>
                                );
                              })}
                              {/* Demais categorias de entrada não mapeadas */}
                              {(() => {
                                const cats = [...new Set(lancamentos.filter(l => l.tipo === "receber" && l.moeda !== "barter").map(l => l.categoria))].filter(c => !DFC_ENTRADAS.includes(c));
                                return cats.map(cat => {
                                  const vals = mesesDFC.map(m => somaMesCategoria(m.keyMes, "receber", cat));
                                  if (vals.every(v => v === 0)) return null;
                                  return (
                                    <tr key={cat}>
                                      <td style={{ padding: "6px 16px 6px 28px", fontSize: 11, color: "#1a1a1a", borderBottom: "0.5px solid #f5f5f5" }}>{cat}</td>
                                      {vals.map((v, i) => (
                                        <td key={i} style={{ padding: "6px 12px", textAlign: "right", fontSize: 11, color: v > 0 ? "#1A4870" : "#666", borderBottom: "0.5px solid #f5f5f5" }}>
                                          {v > 0 ? fmtBRL(v) : "—"}
                                        </td>
                                      ))}
                                    </tr>
                                  );
                                });
                              })()}

                              {/* Saídas */}
                              <tr style={{ background: "#FEF3F3" }}>
                                <td style={{ padding: "7px 16px", fontSize: 11, fontWeight: 600, color: "#791F1F", borderBottom: "0.5px solid #D4DCE8" }}>▼ Saídas</td>
                                {saldosMes.map(m => (
                                  <td key={m.keyMes} style={{ padding: "7px 12px", textAlign: "right", fontSize: 11, fontWeight: 600, color: "#E24B4A", borderBottom: "0.5px solid #D4DCE8" }}>
                                    {m.saidas > 0 ? fmtBRL(m.saidas) : "—"}
                                  </td>
                                ))}
                              </tr>
                              {DFC_SAIDAS.map(cat => {
                                const vals = mesesDFC.map(m => somaMesCategoria(m.keyMes, "pagar", cat));
                                if (vals.every(v => v === 0)) return null;
                                return (
                                  <tr key={cat}>
                                    <td style={{ padding: "6px 16px 6px 28px", fontSize: 11, color: "#1a1a1a", borderBottom: "0.5px solid #f5f5f5" }}>{cat}</td>
                                    {vals.map((v, i) => (
                                      <td key={i} style={{ padding: "6px 12px", textAlign: "right", fontSize: 11, color: v > 0 ? "#E24B4A" : "#666", borderBottom: "0.5px solid #f5f5f5" }}>
                                        {v > 0 ? fmtBRL(v) : "—"}
                                      </td>
                                    ))}
                                  </tr>
                                );
                              })}
                              {/* Demais categorias de saída não mapeadas */}
                              {(() => {
                                const cats = [...new Set(lancamentos.filter(l => l.tipo === "pagar" && l.moeda !== "barter").map(l => l.categoria))].filter(c => !DFC_SAIDAS.includes(c));
                                return cats.map(cat => {
                                  const vals = mesesDFC.map(m => somaMesCategoria(m.keyMes, "pagar", cat));
                                  if (vals.every(v => v === 0)) return null;
                                  return (
                                    <tr key={cat}>
                                      <td style={{ padding: "6px 16px 6px 28px", fontSize: 11, color: "#1a1a1a", borderBottom: "0.5px solid #f5f5f5" }}>{cat}</td>
                                      {vals.map((v, i) => (
                                        <td key={i} style={{ padding: "6px 12px", textAlign: "right", fontSize: 11, color: v > 0 ? "#E24B4A" : "#666", borderBottom: "0.5px solid #f5f5f5" }}>
                                          {v > 0 ? fmtBRL(v) : "—"}
                                        </td>
                                      ))}
                                    </tr>
                                  );
                                });
                              })()}

                              {/* Saldo final */}
                              <tr style={{ background: "#F3F6F9" }}>
                                <td style={{ padding: "10px 16px", fontSize: 12, fontWeight: 600, color: "#1a1a1a", borderTop: "0.5px solid #D4DCE8" }}>Saldo final projetado</td>
                                {saldosMes.map(m => (
                                  <td key={m.keyMes} style={{ padding: "10px 12px", textAlign: "right", fontSize: 13, fontWeight: 600, color: m.saldoFinal >= 0 ? "#1A4870" : "#E24B4A", borderTop: "0.5px solid #D4DCE8" }}>
                                    {fmtBRL(m.saldoFinal)}
                                  </td>
                                ))}
                              </tr>
                            </tbody>
                          </table>
                          <div style={{ padding: "8px 16px", fontSize: 10, color: "#444" }}>
                            Barter excluído do fluxo · valores USD convertidos à cotação vigente · mês anterior inclui todos os lançamentos (baixados e em aberto)
                          </div>
                        </div>
                      )}

                      {/* ── VISÃO: PREVISTO × REALIZADO ── */}
                      {subAbaFluxo === "prevreal" && (() => {
                        const hojeKey = TODAY.slice(0, 7);

                        // Previsto = todos os lançamentos (por data_vencimento)
                        // Realizado = apenas baixados (usa data_baixa se disponível, senão data_vencimento)
                        const prevReal = mesesDFC.map(m => {
                          const lMes = lancamentos.filter(l => l.moeda !== "barter" && (l.data_vencimento ?? "").startsWith(m.keyMes));
                          // baixados usando data_baixa ou data_vencimento
                          const baixadosMes = lancamentos.filter(l => {
                            if (l.moeda === "barter") return false;
                            if (l.status !== "baixado") return false;
                            const refDate = l.data_baixa ?? l.data_vencimento ?? "";
                            return refDate.startsWith(m.keyMes);
                          });

                          const entPrev  = lMes.filter(l => l.tipo === "receber").reduce((a, l) => a + paraBRL(l), 0);
                          const entReal  = baixadosMes.filter(l => l.tipo === "receber").reduce((a, l) => a + (l.valor_pago ?? paraBRL(l)), 0);
                          const saiPrev  = lMes.filter(l => l.tipo === "pagar").reduce((a, l) => a + paraBRL(l), 0);
                          const saiReal  = baixadosMes.filter(l => l.tipo === "pagar").reduce((a, l) => a + (l.valor_pago ?? paraBRL(l)), 0);
                          const saldoPrev = entPrev - saiPrev;
                          const saldoReal = entReal - saiReal;
                          const isFuturo = m.keyMes > hojeKey;
                          return { ...m, entPrev, entReal, saiPrev, saiReal, saldoPrev, saldoReal, isFuturo };
                        });

                        const pct = (real: number, prev: number) => {
                          if (prev === 0) return null;
                          const v = ((real - prev) / Math.abs(prev)) * 100;
                          return v;
                        };
                        const fmtPct = (v: number | null) => {
                          if (v === null) return "—";
                          const cor = Math.abs(v) < 5 ? "#16A34A" : v < 0 ? "#E24B4A" : "#EF9F27";
                          return <span style={{ color: cor, fontSize: 10, fontWeight: 600 }}>{v > 0 ? "+" : ""}{v.toFixed(0)}%</span>;
                        };

                        const LINHAS: { key: keyof typeof prevReal[0]; label: string; tipo: "ent" | "sai" | "sal" }[] = [
                          { key: "entPrev",   label: "Entradas Previstas",  tipo: "ent" },
                          { key: "entReal",   label: "Entradas Realizadas", tipo: "ent" },
                          { key: "saiPrev",   label: "Saídas Previstas",    tipo: "sai" },
                          { key: "saiReal",   label: "Saídas Realizadas",   tipo: "sai" },
                          { key: "saldoPrev", label: "Saldo Previsto",      tipo: "sal" },
                          { key: "saldoReal", label: "Saldo Realizado",     tipo: "sal" },
                        ];

                        return (
                          <div style={{ overflowX: "auto", padding: "0 0 8px 0" }}>
                            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 600 }}>
                              <thead>
                                <tr style={{ background: "#F3F6F9" }}>
                                  <th style={{ padding: "9px 16px", textAlign: "left", fontSize: 11, fontWeight: 600, color: "#555", borderBottom: "0.5px solid #D4DCE8", width: 190, position: "sticky", left: 0, background: "#F3F6F9" }}>Linha</th>
                                  {prevReal.map(m => (
                                    <th key={m.keyMes} style={{ padding: "9px 10px", textAlign: "right", fontSize: 11, fontWeight: 600, color: m.isFuturo ? "#888" : "#1a1a1a", borderBottom: "0.5px solid #D4DCE8", whiteSpace: "nowrap" }}>
                                      {m.label}
                                      {m.isFuturo && <div style={{ fontSize: 9, color: "#aaa", fontWeight: 400 }}>previsto</div>}
                                    </th>
                                  ))}
                                </tr>
                              </thead>
                              <tbody>
                                {/* Entradas */}
                                <tr style={{ background: "#EAF3FB" }}>
                                  <td colSpan={prevReal.length + 1} style={{ padding: "5px 16px", fontSize: 10, fontWeight: 700, color: "#1A4870", letterSpacing: "0.05em", borderBottom: "0.5px solid #D4DCE8" }}>
                                    ▲ ENTRADAS (CR)
                                  </td>
                                </tr>
                                {(["entPrev", "entReal"] as const).map(k => (
                                  <tr key={k} style={{ borderBottom: k === "entReal" ? "2px solid #D4DCE8" : "0.5px solid #f0f3f8" }}>
                                    <td style={{ padding: "7px 16px", fontSize: 11, color: "#1a1a1a", position: "sticky", left: 0, background: "#fff" }}>
                                      {k === "entPrev" ? "Previstas" : "Realizadas"}
                                    </td>
                                    {prevReal.map(m => {
                                      const val = m[k] as number;
                                      return (
                                        <td key={m.keyMes} style={{ padding: "7px 10px", textAlign: "right", fontSize: 11, color: val > 0 ? "#1A4870" : "#888", fontWeight: k === "entReal" ? 600 : 400 }}>
                                          {val > 0 ? fmtBRL(val) : "—"}
                                          {k === "entReal" && !m.isFuturo && <div style={{ marginTop: 1 }}>{fmtPct(pct(m.entReal, m.entPrev))}</div>}
                                        </td>
                                      );
                                    })}
                                  </tr>
                                ))}

                                {/* Saídas */}
                                <tr style={{ background: "#FEF3F3" }}>
                                  <td colSpan={prevReal.length + 1} style={{ padding: "5px 16px", fontSize: 10, fontWeight: 700, color: "#791F1F", letterSpacing: "0.05em", borderBottom: "0.5px solid #D4DCE8" }}>
                                    ▼ SAÍDAS (CP)
                                  </td>
                                </tr>
                                {(["saiPrev", "saiReal"] as const).map(k => (
                                  <tr key={k} style={{ borderBottom: k === "saiReal" ? "2px solid #D4DCE8" : "0.5px solid #f0f3f8" }}>
                                    <td style={{ padding: "7px 16px", fontSize: 11, color: "#1a1a1a", position: "sticky", left: 0, background: "#fff" }}>
                                      {k === "saiPrev" ? "Previstas" : "Realizadas"}
                                    </td>
                                    {prevReal.map(m => {
                                      const val = m[k] as number;
                                      return (
                                        <td key={m.keyMes} style={{ padding: "7px 10px", textAlign: "right", fontSize: 11, color: val > 0 ? "#E24B4A" : "#888", fontWeight: k === "saiReal" ? 600 : 400 }}>
                                          {val > 0 ? fmtBRL(val) : "—"}
                                          {k === "saiReal" && !m.isFuturo && <div style={{ marginTop: 1 }}>{fmtPct(pct(m.saiReal, m.saiPrev))}</div>}
                                        </td>
                                      );
                                    })}
                                  </tr>
                                ))}

                                {/* Saldo */}
                                <tr style={{ background: "#F3F6F9", borderTop: "0.5px solid #D4DCE8" }}>
                                  <td colSpan={prevReal.length + 1} style={{ padding: "5px 16px", fontSize: 10, fontWeight: 700, color: "#555", letterSpacing: "0.05em", borderBottom: "0.5px solid #D4DCE8" }}>
                                    ⇄ SALDO DO PERÍODO
                                  </td>
                                </tr>
                                {(["saldoPrev", "saldoReal"] as const).map(k => (
                                  <tr key={k} style={{ borderBottom: "0.5px solid #f0f3f8", background: k === "saldoReal" ? "#F9F9F6" : "#fff" }}>
                                    <td style={{ padding: "8px 16px", fontSize: 12, fontWeight: 600, color: "#1a1a1a", position: "sticky", left: 0, background: k === "saldoReal" ? "#F9F9F6" : "#fff" }}>
                                      {k === "saldoPrev" ? "Saldo Previsto" : "Saldo Realizado"}
                                    </td>
                                    {prevReal.map(m => {
                                      const val = m[k] as number;
                                      return (
                                        <td key={m.keyMes} style={{ padding: "8px 10px", textAlign: "right", fontSize: 12, fontWeight: 600, color: val >= 0 ? "#1A4870" : "#E24B4A" }}>
                                          {fmtBRL(val)}
                                          {k === "saldoReal" && !m.isFuturo && <div style={{ marginTop: 1 }}>{fmtPct(pct(m.saldoReal, m.saldoPrev))}</div>}
                                        </td>
                                      );
                                    })}
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                            <div style={{ padding: "8px 16px", fontSize: 10, color: "#666" }}>
                              Previsto = todos os lançamentos por data de vencimento · Realizado = baixados por data de baixa · % = desvio realizado vs previsto · meses futuros não têm realizado
                            </div>
                          </div>
                        );
                      })()}

                      {/* ── VISÃO: DIA A DIA ── */}
                      {subAbaFluxo === "vertical" && (() => {
                        // grid: col1=40% (4fr) | Status(1fr) | CR | CP | Sim | Saldo dia | Saldo acum (1.5fr cada)
                        const GRID = "4fr 1fr 1.5fr 1.5fr 1.5fr 1.5fr 1.5fr";
                        let saldoAcumDia = saldoZero ? 0 : saldoAnterior;

                        return (
                          <div style={{ background: "#F3F6F9" }}>
                            {/* Sumário 30 dias + botão simulação */}
                            <div style={{ display: "flex", alignItems: "stretch", background: "#fff", borderBottom: "0.5px solid #D4DCE8" }}>
                              <div style={{ flex: 1, display: "grid", gridTemplateColumns: "repeat(3, 1fr)" }}>
                                {[
                                  { label: "Entradas previstas (30 dias)", valor: lancamentos.filter(l => l.tipo === "receber" && l.moeda !== "barter" && l.status !== "baixado" && (l.data_vencimento ?? "") <= d30Key).reduce((a, l) => a + paraBRL(l), 0) + previsoes.filter(p => p.tipo === "receber" && p.data <= d30Key).reduce((a, p) => a + p.valor, 0), cor: "#1A4870" },
                                  { label: "Saídas previstas (30 dias)", valor: lancamentos.filter(l => l.tipo === "pagar" && l.moeda !== "barter" && l.status !== "baixado" && (l.data_vencimento ?? "") <= d30Key).reduce((a, l) => a + paraBRL(l), 0) + previsoes.filter(p => p.tipo === "pagar" && p.data <= d30Key).reduce((a, p) => a + p.valor, 0), cor: "#E24B4A" },
                                  { label: "Saldo simulado (30 dias)", valor: simulacoes.filter(s => s.ativa && s.data <= d30Key).reduce((a, s) => a + (s.tipo === "receber" ? s.valor : -s.valor), 0), cor: "#C9921B" },
                                ].map((s, i) => (
                                  <div key={i} style={{ padding: "12px 16px", borderRight: "0.5px solid #DEE5EE" }}>
                                    <div style={{ fontSize: 11, color: "#555", marginBottom: 3 }}>{s.label}</div>
                                    <div style={{ fontSize: 16, fontWeight: 600, color: s.cor }}>{fmtBRL(Math.abs(s.valor))}</div>
                                  </div>
                                ))}
                              </div>
                              {/* Botão único de nova simulação */}
                              <div style={{ display: "flex", alignItems: "center", padding: "0 16px", borderLeft: "0.5px solid #DEE5EE", gap: 8 }}>
                                <button onClick={() => { setModalSimDia(TODAY); setNovaSim({ tipo: "pagar", descricao: "", valorMask: "", data: TODAY }); }}
                                  style={{ fontSize: 12, padding: "7px 14px", borderRadius: 7, border: "0.5px solid #C9921B", background: "#FBF0D8", color: "#7A5A12", cursor: "pointer", fontWeight: 600, whiteSpace: "nowrap" }}>
                                  + Simulação
                                </button>
                              </div>
                            </div>

                            {/* Cabeçalho fixo */}
                            <div style={{ display: "grid", gridTemplateColumns: GRID, alignItems: "center", padding: "7px 14px", background: "#EFEFEC", borderBottom: "0.5px solid #e0e0dc", position: "sticky", top: 0, zIndex: 2 }}>
                              <div style={{ fontSize: 11, fontWeight: 600, color: "#555" }}>Data / Descrição</div>
                              <div style={{ fontSize: 11, fontWeight: 600, color: "#555" }}>Status</div>
                              <div style={{ fontSize: 11, fontWeight: 600, color: "#1A4870", textAlign: "right", paddingRight: 6 }}>CR — Entradas</div>
                              <div style={{ fontSize: 11, fontWeight: 600, color: "#E24B4A", textAlign: "right", paddingRight: 6 }}>CP — Saídas</div>
                              <div style={{ fontSize: 11, fontWeight: 600, color: "#C9921B", textAlign: "right", paddingRight: 6 }}>Simulação</div>
                              <div style={{ fontSize: 11, fontWeight: 600, color: "#555", textAlign: "right" }}>Saldo do dia</div>
                              <div style={{ fontSize: 11, fontWeight: 600, color: "#1A4870", textAlign: "right" }}>
                                Saldo acum.
                                {saldoZero && <div style={{ fontSize: 9, color: "#888", fontWeight: 400 }}>partindo de 0</div>}
                                {!saldoZero && saldoAnterior !== 0 && <div style={{ fontSize: 9, color: "#888", fontWeight: 400 }}>{fmtBRL(saldoAnterior)}</div>}
                              </div>
                            </div>

                            {/* Lista de dias */}
                            <div style={{ maxHeight: 480, overflowY: "auto" }}>
                              {diasOrdenados.map(dia => {
                                const lDia = lancamentos.filter(l => l.moeda !== "barter" && l.data_vencimento === dia);
                                const pDia = previsoes.filter(p => p.data === dia);
                                const sDia = simulacoes.filter(s => s.data === dia && s.ativa);

                                const totalCR  = lDia.filter(l => l.tipo === "receber").reduce((a, l) => a + paraBRL(l), 0) + pDia.filter(p => p.tipo === "receber").reduce((a, p) => a + p.valor, 0);
                                const totalCP  = lDia.filter(l => l.tipo === "pagar").reduce((a, l) => a + paraBRL(l), 0)  + pDia.filter(p => p.tipo === "pagar").reduce((a, p) => a + p.valor, 0);
                                const saldoSim = sDia.reduce((a, s) => a + (s.tipo === "receber" ? s.valor : -s.valor), 0);
                                const saldoDia = totalCR - totalCP + saldoSim;
                                saldoAcumDia += saldoDia;
                                const saldoAcumulado = saldoAcumDia;

                                const temLancamentos = lDia.length > 0 || pDia.length > 0;
                                const temSim         = sDia.length > 0;
                                const temEventos     = temLancamentos || temSim;
                                const expanded       = diasExpandidos.has(dia);
                                const isHoje         = dia === TODAY;
                                const isPast         = dia < TODAY;

                                // todos os itens de detalhe em ordem: CR, CP, previsões, sim
                                type ItemLinha = {
                                  key: string; label: string; sub: string;
                                  crVal?: number; cpVal?: number; simVal?: number;
                                  badge: string; bgBadge: string; colorBadge: string;
                                  extra?: React.ReactNode;
                                  subMoeda?: string;
                                };

                                const linhas: ItemLinha[] = [
                                  ...lDia.filter(l => l.tipo === "receber").map(l => ({ key: l.id, label: l.descricao, sub: l.categoria, crVal: paraBRL(l), subMoeda: l.moeda === "USD" ? `${fmtUSD(l.valor)} @ R$${(l.cotacao_usd ?? COTACAO_USD).toFixed(2)}` : undefined, badge: "CR", bgBadge: "#D5E8F5", colorBadge: "#0B2D50", extra: <span style={{ fontSize: 9, background: "#D5E8F5", color: "#0B2D50", padding: "1px 5px", borderRadius: 5 }}>{corStatus(l.status).label}</span> })),
                                  ...lDia.filter(l => l.tipo === "pagar").map(l => ({ key: l.id, label: l.descricao, sub: l.categoria, cpVal: paraBRL(l), subMoeda: l.moeda === "USD" ? `${fmtUSD(l.valor)} @ R$${(l.cotacao_usd ?? COTACAO_USD).toFixed(2)}` : undefined, badge: "CP", bgBadge: "#FCEBEB", colorBadge: "#791F1F", extra: <span style={{ fontSize: 9, background: "#FAEEDA", color: "#633806", padding: "1px 5px", borderRadius: 5 }}>{corStatus(l.status).label}</span> })),
                                  ...pDia.filter(p => p.tipo === "receber").map(p => ({ key: p.id, label: p.descricao, sub: p.categoria, crVal: p.valor, badge: "prev", bgBadge: "#1A4870", colorBadge: "#fff", extra: <><button onClick={() => setModalConverterPrev(p)} style={{ fontSize: 10, padding: "2px 7px", border: "0.5px solid #1A4870", background: "#D5E8F5", color: "#0B2D50", borderRadius: 5, cursor: "pointer" }}>→ CP</button><button onClick={() => setPrevisoes(prev => prev.filter(x => x.id !== p.id))} style={{ fontSize: 10, padding: "2px 5px", border: "none", background: "transparent", color: "#888", cursor: "pointer" }}>✕</button></> })),
                                  ...pDia.filter(p => p.tipo === "pagar").map(p => ({ key: p.id, label: p.descricao, sub: p.categoria, cpVal: p.valor, badge: "prev", bgBadge: "#1A4870", colorBadge: "#fff", extra: <><button onClick={() => setModalConverterPrev(p)} style={{ fontSize: 10, padding: "2px 7px", border: "0.5px solid #1A4870", background: "#D5E8F5", color: "#0B2D50", borderRadius: 5, cursor: "pointer" }}>→ CP</button><button onClick={() => setPrevisoes(prev => prev.filter(x => x.id !== p.id))} style={{ fontSize: 10, padding: "2px 5px", border: "none", background: "transparent", color: "#888", cursor: "pointer" }}>✕</button></> })),
                                  ...sDia.map(s => ({ key: s.id, label: s.descricao, sub: "", simVal: s.tipo === "receber" ? s.valor : -s.valor, badge: "sim", bgBadge: "#C9921B", colorBadge: "#fff", extra: <><button onClick={() => handleToggleSim(s.id, false)} style={{ fontSize: 10, padding: "2px 7px", border: "0.5px solid #ccc", background: "transparent", color: "#444", borderRadius: 5, cursor: "pointer" }}>pausar</button><button onClick={() => handleExcluirSim(s.id)} style={{ fontSize: 10, padding: "2px 5px", border: "none", background: "transparent", color: "#888", cursor: "pointer" }}>✕</button></> })),
                                ];

                                return (
                                  <div key={dia} style={{ borderBottom: "0.5px solid #e0e0dc" }}>
                                    {/* ── Linha resumo do dia ── */}
                                    <div
                                      onClick={() => temEventos && toggleDia(dia)}
                                      style={{
                                        display: "grid", gridTemplateColumns: GRID,
                                        alignItems: "center", padding: "8px 14px",
                                        background: isHoje ? "#D5E8F5" : expanded ? "#EEECEA" : "transparent",
                                        cursor: temEventos ? "pointer" : "default",
                                        borderLeft: isHoje ? "3px solid #1A4870" : "3px solid transparent",
                                      }}
                                    >
                                      {/* Toggle + data */}
                                      <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                                        <span style={{ width: 17, height: 17, borderRadius: 4, border: "0.5px solid #ccc", background: temEventos ? "#fff" : "transparent", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, color: "#555", fontWeight: 600, flexShrink: 0 }}>
                                          {temEventos ? (expanded ? "−" : "+") : ""}
                                        </span>
                                        <span style={{ fontSize: 12, fontWeight: isHoje ? 600 : 400, color: isHoje ? "#1A4870" : isPast ? "#444" : "#1a1a1a" }}>
                                          {fmtData(dia)}
                                          {isHoje && <span style={{ marginLeft: 5, fontSize: 9, background: "#1A5C38", color: "#fff", padding: "1px 5px", borderRadius: 8 }}>hoje</span>}
                                        </span>
                                        {/* badges inline */}
                                        <span style={{ display: "flex", gap: 3, marginLeft: 4 }}>
                                          {lDia.length > 0 && <span style={{ fontSize: 9, background: "#EBEBEB", color: "#555", padding: "1px 5px", borderRadius: 8 }}>{lDia.length}</span>}
                                          {pDia.length > 0 && <span style={{ fontSize: 9, background: "#D5E8F5", color: "#0B2D50", padding: "1px 5px", borderRadius: 8 }}>{pDia.length}p</span>}
                                          {sDia.length > 0 && <span style={{ fontSize: 9, background: "#FBF0D8", color: "#7A5A12", padding: "1px 5px", borderRadius: 8 }}>{sDia.length}s</span>}
                                        </span>
                                      </div>
                                      {/* Status — vazio no resumo */}
                                      <div />
                                      {/* CR total */}
                                      <div style={{ textAlign: "right", paddingRight: 6, fontSize: 12, fontWeight: 600, color: totalCR > 0 ? "#1A4870" : "#666" }}>
                                        {totalCR > 0 ? `+ ${fmtBRL(totalCR)}` : "—"}
                                      </div>
                                      {/* CP total */}
                                      <div style={{ textAlign: "right", paddingRight: 6, fontSize: 12, fontWeight: 600, color: totalCP > 0 ? "#E24B4A" : "#666" }}>
                                        {totalCP > 0 ? `− ${fmtBRL(totalCP)}` : "—"}
                                      </div>
                                      {/* Sim saldo */}
                                      <div style={{ textAlign: "right", paddingRight: 6, fontSize: 12, fontWeight: 600, color: saldoSim !== 0 ? "#C9921B" : "#666" }}>
                                        {saldoSim !== 0 ? `${saldoSim > 0 ? "+" : "−"} ${fmtBRL(Math.abs(saldoSim))}` : "—"}
                                      </div>
                                      {/* Saldo do dia */}
                                      <div style={{ textAlign: "right", fontSize: 12, fontWeight: 600, color: !temEventos ? "#666" : saldoDia >= 0 ? "#1a1a1a" : "#E24B4A" }}>
                                        {temEventos ? fmtBRL(saldoDia) : "—"}
                                      </div>
                                      {/* Saldo acumulado */}
                                      <div style={{ textAlign: "right", fontSize: 12, fontWeight: 700, color: saldoAcumulado >= 0 ? "#1A4870" : "#E24B4A" }}>
                                        {fmtBRL(saldoAcumulado)}
                                      </div>
                                    </div>

                                    {/* ── Linhas de detalhe — uma por item, mesma grid ── */}
                                    {expanded && linhas.length > 0 && (
                                      <div style={{ borderTop: "0.5px solid #e0e0dc" }}>
                                        {linhas.map((item, idx) => (
                                          <div key={item.key} style={{ display: "grid", gridTemplateColumns: GRID, alignItems: "center", padding: "5px 14px", background: idx % 2 === 0 ? "#EEF1F8" : "#EEECEA", borderBottom: idx < linhas.length - 1 ? "0.5px solid #e8e8e5" : "none" }}>
                                            {/* Descrição alinhada à coluna de data */}
                                            <div style={{ display: "flex", alignItems: "center", gap: 6, paddingLeft: 24 }}>
                                              <span style={{ fontSize: 10, padding: "1px 5px", borderRadius: 5, background: item.bgBadge, color: item.colorBadge, fontWeight: 600, flexShrink: 0 }}>{item.badge}</span>
                                              <span style={{ fontSize: 11, color: "#1a1a1a", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={item.label}>{item.label}</span>
                                              {item.sub && <span style={{ fontSize: 10, color: "#888", whiteSpace: "nowrap", flexShrink: 0 }}>{item.sub}</span>}
                                            </div>
                                            {/* Status */}
                                            <div style={{ display: "flex", alignItems: "center", gap: 3 }}>
                                              {item.extra}
                                            </div>
                                            {/* CR */}
                                            <div style={{ textAlign: "right", paddingRight: 6 }}>
                                              {item.crVal !== undefined && <div style={{ fontSize: 11, fontWeight: 600, color: "#1A4870" }}>{`+ ${fmtBRL(item.crVal)}`}</div>}
                                              {item.crVal !== undefined && item.subMoeda && <div style={{ fontSize: 9, color: "#888" }}>{item.subMoeda}</div>}
                                            </div>
                                            {/* CP */}
                                            <div style={{ textAlign: "right", paddingRight: 6 }}>
                                              {item.cpVal !== undefined && <div style={{ fontSize: 11, fontWeight: 600, color: "#E24B4A" }}>{`− ${fmtBRL(item.cpVal)}`}</div>}
                                              {item.cpVal !== undefined && item.subMoeda && <div style={{ fontSize: 9, color: "#888" }}>{item.subMoeda}</div>}
                                            </div>
                                            {/* Sim */}
                                            <div style={{ textAlign: "right", paddingRight: 6, fontSize: 11, fontWeight: 600, color: "#C9921B" }}>
                                              {item.simVal !== undefined ? `${item.simVal >= 0 ? "+" : "−"} ${fmtBRL(Math.abs(item.simVal))}` : ""}
                                            </div>
                                            {/* Saldo do dia — só na última linha */}
                                            <div style={{ textAlign: "right" }}>
                                              {idx === linhas.length - 1 && (
                                                <span style={{ fontSize: 11, fontWeight: 600, color: saldoDia >= 0 ? "#1a1a1a" : "#E24B4A" }}>{fmtBRL(saldoDia)}</span>
                                              )}
                                            </div>
                                            {/* Saldo acumulado — só na última linha */}
                                            <div style={{ textAlign: "right" }}>
                                              {idx === linhas.length - 1 && (
                                                <span style={{ fontSize: 12, fontWeight: 700, color: saldoAcumulado >= 0 ? "#1A4870" : "#E24B4A" }}>{fmtBRL(saldoAcumulado)}</span>
                                              )}
                                            </div>
                                          </div>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })()}
                    </div>
                  )}

                  {/* ─── ABA: Conciliação ─────────────────────── */}
                  {aba === "conciliacao" && (
                    <div style={{ background: "#fff", border: "0.5px solid #D4DCE8", borderTop: "none", borderRadius: "0 0 12px 12px", overflow: "hidden" }}>
                      <div style={{ padding: "14px 16px", borderBottom: "0.5px solid #DEE5EE", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                        <div>
                          <div style={{ fontWeight: 600, fontSize: 13, color: "#1a1a1a", marginBottom: 2 }}>Último extrato importado</div>
                          <div style={{ fontSize: 11, color: "#555" }}>
                            Banco do Brasil · Conta Corrente · importado hoje às 08:04
                            <span style={{ marginLeft: 8, background: "#D5E8F5", color: "#0B2D50", fontSize: 10, padding: "1px 6px", borderRadius: 6 }}>⟳ automático</span>
                          </div>
                        </div>
                        <div style={{ display: "flex", gap: 8 }}>
                          <div style={{ textAlign: "center", padding: "6px 14px", background: "#D5E8F5", borderRadius: 8 }}>
                            <div style={{ fontWeight: 600, color: "#1A4870" }}>{conciliados.filter(c => c.conciliado).length}</div>
                            <div style={{ fontSize: 10, color: "#0B2D50" }}>conciliados</div>
                          </div>
                          <div style={{ textAlign: "center", padding: "6px 14px", background: "#FAEEDA", borderRadius: 8 }}>
                            <div style={{ fontWeight: 600, color: "#EF9F27" }}>{conciliados.filter(c => !c.conciliado).length}</div>
                            <div style={{ fontSize: 10, color: "#633806" }}>pendentes</div>
                          </div>
                        </div>
                      </div>
                      <table style={{ width: "100%", borderCollapse: "collapse" }}>
                        <thead>
                          <tr style={{ background: "#F3F6F9" }}>
                            {["Data", "Descrição no extrato", "Valor", "Conciliação", "Lançamento vinculado", ""].map((h, i) => (
                              <th key={i} style={{ padding: "8px 14px", textAlign: i === 2 ? "center" : "left", fontSize: 11, fontWeight: 600, color: "#555", borderBottom: "0.5px solid #D4DCE8" }}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {conciliados.map((c, ci) => (
                            <tr key={ci} style={{ borderBottom: ci < conciliados.length - 1 ? "0.5px solid #DEE5EE" : "none" }}>
                              <td style={{ padding: "10px 14px", fontSize: 12, color: "#1a1a1a", whiteSpace: "nowrap" }}>{fmtData(c.data)}</td>
                              <td style={{ padding: "10px 14px", fontWeight: 600, color: "#1a1a1a", fontSize: 12 }}>{c.descricao}</td>
                              <td style={{ padding: "10px 14px", textAlign: "center", fontWeight: 600, whiteSpace: "nowrap", color: c.tipo === "credito" ? "#1A4870" : "#E24B4A" }}>
                                {c.tipo === "credito" ? "+ " : "- "}{fmtBRL(c.valor)}
                              </td>
                              <td style={{ padding: "10px 14px" }}>
                                {c.conciliado
                                  ? <span style={{ fontSize: 10, background: "#D5E8F5", color: "#0B2D50", padding: "2px 8px", borderRadius: 8 }}>✓ Conciliado</span>
                                  : <span style={{ fontSize: 10, background: "#FAEEDA", color: "#633806", padding: "2px 8px", borderRadius: 8 }}>○ Pendente</span>}
                              </td>
                              <td style={{ padding: "10px 14px", fontSize: 11, color: "#1a1a1a" }}>{c.lancRef || <span style={{ color: "#666" }}>—</span>}</td>
                              <td style={{ padding: "10px 14px" }}>
                                {!c.conciliado && (
                                  <button style={{ fontSize: 11, padding: "3px 10px", border: "0.5px solid #C9921B", borderRadius: 6, background: "#FBF0D8", color: "#7A5A12", cursor: "pointer", fontWeight: 600 }}>
                                    ◈ Vincular
                                  </button>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      <div style={{ padding: "10px 16px", borderTop: "0.5px solid #DEE5EE", fontSize: 11, color: "#444" }}>
                        A conciliação automática ocorre às 8h de cada dia útil. Lançamentos não conciliados exigem vinculação manual.
                      </div>
                    </div>
                  )}
                </>
              )}

              <p style={{ textAlign: "center", fontSize: 11, color: "#666", marginTop: 24 }}>Arato · menos cliques, mais campo</p>
            </>
          )}
        </div>
      </main>

      {/* ─── Modal Baixa ───────────────────────────────────────── */}
      {modalBaixa && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100 }}
          onClick={e => { if (e.target === e.currentTarget) setModalBaixa(null); }}>
          <div style={{ background: "#fff", borderRadius: 14, padding: 26, width: 440, maxWidth: "92vw" }}>
            <div style={{ fontWeight: 600, fontSize: 16, color: "#1a1a1a", marginBottom: 4 }}>
              {modalBaixa.moeda === "barter" ? "Confirmar entrega (barter)" : modalBaixa.tipo === "receber" ? "Registrar recebimento" : "Registrar pagamento"}
            </div>
            <div style={{ fontSize: 12, color: "#555", marginBottom: 20 }}>{modalBaixa.descricao}</div>

            {modalBaixa.moeda === "barter" ? (
              <div style={{ display: "grid", gap: 14 }}>
                <div style={{ background: "#FBF3E0", border: "0.5px solid #8B5E1430", borderRadius: 8, padding: "10px 12px", fontSize: 12, color: "#8B5E14" }}>
                  <strong>⇄ {modalBaixa.sacas?.toLocaleString("pt-BR")} sc {modalBaixa.cultura_barter} @ R$ {modalBaixa.preco_saca_barter?.toLocaleString("pt-BR")}/sc</strong>
                  <div style={{ fontSize: 11, color: "#555", marginTop: 3 }}>Equivalente gerencial: {fmtBRL(modalBaixa.valor)} · sem movimentação bancária</div>
                </div>
                <div>
                  <label style={labelStyle}>Data de confirmação</label>
                  <input style={inputStyle} type="date" value={baixa.data} onChange={e => setBaixa(p => ({ ...p, data: e.target.value }))} />
                </div>
                <div>
                  <label style={labelStyle}>Observação</label>
                  <input style={inputStyle} placeholder="Opcional" value={baixa.obs} onChange={e => setBaixa(p => ({ ...p, obs: e.target.value }))} />
                </div>
              </div>
            ) : (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                <div style={{ gridColumn: "1 / -1" }}>
                  <label style={labelStyle}>
                    {modalBaixa.tipo === "receber" ? "Valor recebido (R$)" : "Valor pago (R$)"} *
                    {modalBaixa.moeda === "USD" && (
                      <span style={{ fontSize: 10, color: "#7A4300", marginLeft: 8, fontWeight: 400 }}>
                        Venda em {fmtUSD(modalBaixa.valor)} ≈ {fmtBRL(modalBaixa.valor * (modalBaixa.cotacao_usd ?? COTACAO_USD))}
                      </span>
                    )}
                  </label>
                  <input style={inputStyle} type="text" inputMode="numeric" placeholder="0,00"
                    value={baixa.valorMask}
                    onChange={e => setBaixa(p => ({ ...p, valorMask: aplicarMascara(e.target.value) }))} />
                  {desmascarar(baixa.valorMask) > 0 && desmascarar(baixa.valorMask) < paraBRL(modalBaixa) && (
                    <div style={{ fontSize: 10, color: "#EF9F27", marginTop: 4 }}>
                      Pagamento parcial — saldo restante: {fmtBRL(paraBRL(modalBaixa) - desmascarar(baixa.valorMask))}
                    </div>
                  )}
                </div>
                <div>
                  <label style={labelStyle}>Data da {modalBaixa.tipo === "receber" ? "liquidação" : "baixa"}</label>
                  <input style={inputStyle} type="date" value={baixa.data} onChange={e => setBaixa(p => ({ ...p, data: e.target.value }))} />
                </div>
                <div>
                  <label style={labelStyle}>Conta bancária</label>
                  <select style={inputStyle} value={baixa.conta} onChange={e => setBaixa(p => ({ ...p, conta: e.target.value }))}>
                    {contasBancarias.map(c => <option key={c}>{c}</option>)}
                  </select>
                </div>
                <div style={{ gridColumn: "1 / -1" }}>
                  <label style={labelStyle}>Observação</label>
                  <input style={inputStyle} placeholder="Opcional" value={baixa.obs} onChange={e => setBaixa(p => ({ ...p, obs: e.target.value }))} />
                </div>
              </div>
            )}

            <div style={{ marginTop: 16, background: "#FBF0D8", border: "0.5px solid #C9921B40", borderRadius: 8, padding: "8px 12px", fontSize: 11, color: "#7A5A12" }}>
              ◈ {modalBaixa.moeda === "barter"
                ? "Esta ação confirma a entrega física dos grãos acordados — sem movimentação financeira."
                : `Esta ação é manual — você confirma que o ${modalBaixa.tipo === "receber" ? "valor foi recebido" : "pagamento foi efetuado"}.`}
            </div>

            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 18 }}>
              <button onClick={() => setModalBaixa(null)} style={{ padding: "8px 18px", border: "0.5px solid #D4DCE8", borderRadius: 8, background: "transparent", cursor: "pointer", fontSize: 13 }}>Cancelar</button>
              <button onClick={confirmarBaixa} disabled={salvando || (modalBaixa.moeda !== "barter" && !baixa.valorMask)}
                style={{ padding: "8px 18px", background: !salvando && (modalBaixa.moeda === "barter" || baixa.valorMask) ? "#C9921B" : "#666", color: "#fff", border: "none", borderRadius: 8, fontWeight: 600, cursor: "pointer", fontSize: 13 }}>
                {salvando ? "Salvando…" : `◈ ${modalBaixa.moeda === "barter" ? "Confirmar entrega" : "Confirmar baixa"}`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Modal Novo Lançamento ──────────────────────────────── */}
      {modalNovo && (() => {
        const totalP = novoLanc.parcelar ? Math.max(1, Number(novoLanc.totalParcelas) || 1) : 1;
        const valParcela = novoLanc.moeda !== "barter" && novoLanc.valorMask
          ? desmascarar(novoLanc.valorMask)
          : 0;
        const disabled = salvando || !novoLanc.descricao || !novoLanc.vencimento
          || (novoLanc.moeda !== "barter" && !novoLanc.valorMask)
          || (novoLanc.moeda === "barter" && !novoLanc.sacasMask);

        return (
          <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100 }}
            onClick={e => { if (e.target === e.currentTarget) setModalNovo(false); }}>
            <div style={{ background: "#fff", borderRadius: 14, padding: 26, width: 560, maxWidth: "94vw", maxHeight: "92vh", overflowY: "auto" }}>
              <div style={{ fontWeight: 600, fontSize: 16, color: "#1a1a1a", marginBottom: 2 }}>Novo Lançamento</div>
              <div style={{ fontSize: 12, color: "#555", marginBottom: 18 }}>Lançamentos de vendas são criados automaticamente a partir de NF-e autorizadas.</div>

              {/* ── Aba Principal ── */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                <div>
                  <label style={labelStyle}>Operação *</label>
                  <select style={inputStyle} value={novoLanc.tipo} onChange={e => setNovoLanc(p => ({ ...p, tipo: e.target.value as TipoLanc }))}>
                    <option value="pagar">Conta a Pagar (CP)</option>
                    <option value="receber">Conta a Receber (CR)</option>
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>Moeda</label>
                  <select style={inputStyle} value={novoLanc.moeda} onChange={e => setNovoLanc(p => ({ ...p, moeda: e.target.value as Moeda, valorMask: "", sacasMask: "" }))}>
                    <option value="BRL">Real (R$)</option>
                    <option value="USD">Dólar (US$)</option>
                    <option value="barter">Barter</option>
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>Categoria</label>
                  <select style={inputStyle} value={novoLanc.categoria} onChange={e => setNovoLanc(p => ({ ...p, categoria: e.target.value }))}>
                    {Object.keys(categoriasCor).map(c => <option key={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>1º Vencimento *</label>
                  <input style={inputStyle} type="date" value={novoLanc.vencimento} onChange={e => setNovoLanc(p => ({ ...p, vencimento: e.target.value }))} />
                </div>
                <div style={{ gridColumn: "1/-1" }}>
                  <label style={labelStyle}>Descrição *</label>
                  <input style={inputStyle} placeholder="Ex: Arrendamento área sul — maio 2026" value={novoLanc.descricao} onChange={e => setNovoLanc(p => ({ ...p, descricao: e.target.value }))} />
                </div>

                {novoLanc.moeda === "BRL" && (
                  <div style={{ gridColumn: "1/-1" }}>
                    <label style={labelStyle}>Valor {novoLanc.parcelar ? "por parcela" : ""} (R$) *</label>
                    <input style={inputStyle} type="text" inputMode="numeric" placeholder="0,00" value={novoLanc.valorMask} onChange={e => setNovoLanc(p => ({ ...p, valorMask: aplicarMascara(e.target.value) }))} />
                  </div>
                )}
                {novoLanc.moeda === "USD" && (
                  <>
                    <div>
                      <label style={labelStyle}>Valor (US$) *</label>
                      <input style={inputStyle} type="text" inputMode="numeric" placeholder="0,00" value={novoLanc.valorMask} onChange={e => setNovoLanc(p => ({ ...p, valorMask: aplicarMascara(e.target.value) }))} />
                    </div>
                    <div>
                      <label style={labelStyle}>Cotação R$/US$</label>
                      <input style={inputStyle} type="text" inputMode="numeric" placeholder="5,12" value={novoLanc.cotacaoMask} onChange={e => setNovoLanc(p => ({ ...p, cotacaoMask: aplicarMascara(e.target.value) }))} />
                    </div>
                    {novoLanc.valorMask && novoLanc.cotacaoMask && (
                      <div style={{ gridColumn: "1/-1", background: "#FEF3E2", borderRadius: 8, padding: "8px 12px", fontSize: 11, color: "#7A4300" }}>
                        Equivalente: <strong>{fmtBRL(desmascarar(novoLanc.valorMask) * desmascarar(novoLanc.cotacaoMask))}</strong>
                      </div>
                    )}
                  </>
                )}
                {novoLanc.moeda === "barter" && (
                  <>
                    <div>
                      <label style={labelStyle}>Quantidade (sacas) *</label>
                      <input style={inputStyle} type="text" inputMode="numeric" placeholder="0" value={novoLanc.sacasMask} onChange={e => setNovoLanc(p => ({ ...p, sacasMask: e.target.value.replace(/\D/g, "") }))} />
                    </div>
                    <div>
                      <label style={labelStyle}>Cultura</label>
                      <select style={inputStyle} value={novoLanc.culturaBarter} onChange={e => setNovoLanc(p => ({ ...p, culturaBarter: e.target.value }))}>
                        <option value="soja">Soja</option><option value="milho">Milho</option>
                        <option value="algodão">Algodão</option><option value="sorgo">Sorgo</option>
                      </select>
                    </div>
                    <div style={{ gridColumn: "1/-1" }}>
                      <label style={labelStyle}>Preço de referência (R$/sc)</label>
                      <input style={inputStyle} type="text" inputMode="numeric" placeholder="120,00" value={novoLanc.precoSacaMask} onChange={e => setNovoLanc(p => ({ ...p, precoSacaMask: aplicarMascara(e.target.value) }))} />
                    </div>
                  </>
                )}
              </div>

              {/* ── Parcelamento ── */}
              <div style={{ marginTop: 18, borderTop: "0.5px solid #DEE5EE", paddingTop: 16 }}>
                <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 13, fontWeight: 600, color: "#1a1a1a", marginBottom: novoLanc.parcelar ? 12 : 0 }}>
                  <input type="checkbox" checked={novoLanc.parcelar} onChange={e => setNovoLanc(p => ({ ...p, parcelar: e.target.checked }))} />
                  Parcelar este lançamento
                </label>
                {novoLanc.parcelar && (
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                    <div>
                      <label style={labelStyle}>Nº de parcelas</label>
                      <input style={inputStyle} type="number" min="2" max="60" value={novoLanc.totalParcelas} onChange={e => setNovoLanc(p => ({ ...p, totalParcelas: e.target.value }))} />
                    </div>
                    <div>
                      <label style={labelStyle}>Intervalo</label>
                      <select style={inputStyle} value={novoLanc.intervaloMeses} onChange={e => setNovoLanc(p => ({ ...p, intervaloMeses: e.target.value }))}>
                        <option value="1">Mensal</option>
                        <option value="2">Bimestral</option>
                        <option value="3">Trimestral</option>
                        <option value="6">Semestral</option>
                        <option value="12">Anual</option>
                      </select>
                    </div>
                    {valParcela > 0 && totalP > 1 && (
                      <div style={{ gridColumn: "1/-1", background: "#E6F1FB", borderRadius: 8, padding: "8px 12px", fontSize: 11, color: "#0C447C" }}>
                        {totalP}× {fmtBRL(valParcela)} = <strong>{fmtBRL(valParcela * totalP)}</strong> total
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* ── Adicionais ── */}
              <div style={{ marginTop: 18, borderTop: "0.5px solid #DEE5EE", paddingTop: 16 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: "#555", marginBottom: 12 }}>Adicionais — LCDPR, encargos e vínculos</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                  <div>
                    <label style={labelStyle}>Tipo Documento LCDPR</label>
                    <select style={inputStyle} value={novoLanc.tipo_documento_lcdpr} onChange={e => setNovoLanc(p => ({ ...p, tipo_documento_lcdpr: e.target.value as typeof novoLanc.tipo_documento_lcdpr }))}>
                      <option value="RECIBO">Recibo</option>
                      <option value="NF">Nota Fiscal</option>
                      <option value="DUPLICATA">Duplicata</option>
                      <option value="CHEQUE">Cheque</option>
                      <option value="PIX">PIX</option>
                      <option value="TED">TED</option>
                      <option value="OUTROS">Outros</option>
                    </select>
                  </div>
                  <div>
                    <label style={labelStyle}>Chave XML / NF-e</label>
                    <input style={inputStyle} placeholder="Opcional" value={novoLanc.chave_xml} onChange={e => setNovoLanc(p => ({ ...p, chave_xml: e.target.value }))} />
                  </div>
                  <div>
                    <label style={labelStyle}>% Juros a.m.</label>
                    <input style={inputStyle} type="number" step="0.01" placeholder="0,00" value={novoLanc.juros_pct} onChange={e => setNovoLanc(p => ({ ...p, juros_pct: e.target.value }))} />
                  </div>
                  <div>
                    <label style={labelStyle}>% Multa por atraso</label>
                    <input style={inputStyle} type="number" step="0.01" placeholder="0,00" value={novoLanc.multa_pct} onChange={e => setNovoLanc(p => ({ ...p, multa_pct: e.target.value }))} />
                  </div>
                  <div>
                    <label style={labelStyle}>% Desconto pontualidade</label>
                    <input style={inputStyle} type="number" step="0.01" placeholder="0,00" value={novoLanc.desconto_pct} onChange={e => setNovoLanc(p => ({ ...p, desconto_pct: e.target.value }))} />
                  </div>
                  <div>
                    <label style={labelStyle}>Centro de Custo</label>
                    <input style={inputStyle} placeholder="Ex: Talhão 3 / Safra soja 26" value={novoLanc.centro_custo} onChange={e => setNovoLanc(p => ({ ...p, centro_custo: e.target.value }))} />
                  </div>
                  <div style={{ gridColumn: "1/-1" }}>
                    <label style={labelStyle}>Observação</label>
                    <input style={inputStyle} placeholder="Opcional" value={novoLanc.obs} onChange={e => setNovoLanc(p => ({ ...p, obs: e.target.value }))} />
                  </div>
                </div>
              </div>

              <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 20 }}>
                <button onClick={() => setModalNovo(false)} style={{ padding: "8px 18px", border: "0.5px solid #D4DCE8", borderRadius: 8, background: "transparent", cursor: "pointer", fontSize: 13 }}>Cancelar</button>
                <button onClick={adicionarLancamento} disabled={disabled}
                  style={{ padding: "8px 18px", background: disabled ? "#666" : "#C9921B", color: "#fff", border: "none", borderRadius: 8, fontWeight: 600, cursor: "pointer", fontSize: 13 }}>
                  {salvando ? "Salvando…" : novoLanc.parcelar && totalP > 1 ? `◈ Criar ${totalP} parcelas` : "◈ Salvar lançamento"}
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ─── Modal Previsão de Gastos ───────────────────────────── */}
      {modalPrevisao && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100 }}
          onClick={e => { if (e.target === e.currentTarget) setModalPrevisao(false); }}>
          <div style={{ background: "#fff", borderRadius: 14, padding: 26, width: 520, maxWidth: "92vw", maxHeight: "85vh", overflowY: "auto" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <div>
                <div style={{ fontWeight: 600, fontSize: 16, color: "#1a1a1a" }}>Previsão de Gastos</div>
                <div style={{ fontSize: 11, color: "#555", marginTop: 2 }}>Aparecem em verde no fluxo · podem ser convertidas em CP</div>
              </div>
              <div style={{ display: "flex", gap: 4 }}>
                {(["lista", "nova"] as const).map(t => (
                  <button key={t} onClick={() => setAbaPrevisao(t)} style={{ padding: "5px 12px", borderRadius: 8, border: "0.5px solid", borderColor: abaPrevisao === t ? "#1A4870" : "#D4DCE8", background: abaPrevisao === t ? "#D5E8F5" : "transparent", color: abaPrevisao === t ? "#0B2D50" : "#555", fontSize: 12, cursor: "pointer", fontWeight: abaPrevisao === t ? 600 : 400 }}>
                    {t === "lista" ? `Lista (${previsoes.length})` : "+ Nova"}
                  </button>
                ))}
              </div>
            </div>

            {abaPrevisao === "lista" && (
              <div>
                {previsoes.length === 0 ? (
                  <div style={{ padding: "24px 0", textAlign: "center", color: "#444", fontSize: 12 }}>
                    Nenhuma previsão cadastrada.<br />
                    <button onClick={() => setAbaPrevisao("nova")} style={{ marginTop: 10, padding: "6px 16px", borderRadius: 8, border: "0.5px solid #1A4870", background: "#D5E8F5", color: "#0B2D50", cursor: "pointer", fontSize: 12 }}>+ Criar previsão</button>
                  </div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {previsoes.map(p => (
                      <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", borderRadius: 8, background: "#E4F0F9", border: "0.5px solid #1A487030" }}>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontWeight: 600, fontSize: 12, color: "#0B2D50" }}>{p.descricao}</div>
                          <div style={{ fontSize: 10, color: "#555", marginTop: 2 }}>{p.categoria} · {fmtData(p.data)} · {p.tipo === "receber" ? "entrada" : "saída"}</div>
                        </div>
                        <span style={{ fontWeight: 600, color: p.tipo === "receber" ? "#1A4870" : "#E24B4A", fontSize: 13 }}>
                          {p.tipo === "receber" ? "+" : "−"} {fmtBRL(p.valor)}
                        </span>
                        <button onClick={() => setModalConverterPrev(p)} style={{ fontSize: 11, padding: "4px 10px", border: "0.5px solid #1A4870", background: "#D5E8F5", color: "#0B2D50", borderRadius: 6, cursor: "pointer", fontWeight: 600 }}>→ CP</button>
                        <button onClick={() => setPrevisoes(prev => prev.filter(x => x.id !== p.id))} style={{ fontSize: 11, padding: "4px 8px", border: "0.5px solid #ccc", background: "transparent", color: "#444", borderRadius: 6, cursor: "pointer" }}>✕</button>
                      </div>
                    ))}
                    <div style={{ fontSize: 11, color: "#444", marginTop: 4 }}>
                      Total previsto: <strong style={{ color: "#1a1a1a" }}>{fmtBRL(previsoes.filter(p => p.tipo === "pagar").reduce((a, p) => a + p.valor, 0))}</strong> em saídas ·{" "}
                      <strong style={{ color: "#1a1a1a" }}>{fmtBRL(previsoes.filter(p => p.tipo === "receber").reduce((a, p) => a + p.valor, 0))}</strong> em entradas
                    </div>
                  </div>
                )}
              </div>
            )}

            {abaPrevisao === "nova" && (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                <div>
                  <label style={labelStyle}>Tipo *</label>
                  <select style={inputStyle} value={novaPrevisao.tipo} onChange={e => setNovaPrevisao(p => ({ ...p, tipo: e.target.value as TipoLanc }))}>
                    <option value="pagar">Saída (Conta a Pagar)</option>
                    <option value="receber">Entrada (Conta a Receber)</option>
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>Data prevista *</label>
                  <input style={inputStyle} type="date" value={novaPrevisao.data} onChange={e => setNovaPrevisao(p => ({ ...p, data: e.target.value }))} />
                </div>
                <div>
                  <label style={labelStyle}>Categoria</label>
                  <select style={inputStyle} value={novaPrevisao.categoria} onChange={e => setNovaPrevisao(p => ({ ...p, categoria: e.target.value }))}>
                    {[...DFC_SAIDAS, ...DFC_ENTRADAS].filter((v, i, a) => a.indexOf(v) === i).map(c => <option key={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>Valor estimado (R$) *</label>
                  <input style={inputStyle} type="text" inputMode="numeric" placeholder="0,00" value={novaPrevisao.valorMask} onChange={e => setNovaPrevisao(p => ({ ...p, valorMask: aplicarMascara(e.target.value) }))} />
                </div>
                <div style={{ gridColumn: "1 / -1" }}>
                  <label style={labelStyle}>Descrição *</label>
                  <input style={inputStyle} placeholder="Ex: Compra de defensivo — 2ª aplicação soja" value={novaPrevisao.descricao} onChange={e => setNovaPrevisao(p => ({ ...p, descricao: e.target.value }))} />
                </div>
                <div style={{ gridColumn: "1 / -1", background: "#E4F0F9", border: "0.5px solid #1A487030", borderRadius: 8, padding: "8px 12px", fontSize: 11, color: "#0B2D50" }}>
                  ○ Previsões aparecem em verde no fluxo de caixa e não são lançamentos reais. Você pode convertê-las em CP quando confirmar o gasto.
                </div>
                <div style={{ gridColumn: "1 / -1", display: "flex", gap: 8, justifyContent: "flex-end" }}>
                  <button onClick={() => setAbaPrevisao("lista")} style={{ padding: "8px 18px", border: "0.5px solid #D4DCE8", borderRadius: 8, background: "transparent", cursor: "pointer", fontSize: 13 }}>Cancelar</button>
                  <button onClick={salvarPrevisao} disabled={!novaPrevisao.descricao || !novaPrevisao.data || !novaPrevisao.valorMask}
                    style={{ padding: "8px 18px", background: novaPrevisao.descricao && novaPrevisao.data && novaPrevisao.valorMask ? "#1A4870" : "#666", color: "#fff", border: "none", borderRadius: 8, fontWeight: 600, cursor: "pointer", fontSize: 13 }}>
                    ○ Salvar previsão
                  </button>
                </div>
              </div>
            )}

            <div style={{ marginTop: 16, display: "flex", justifyContent: "flex-end" }}>
              <button onClick={() => setModalPrevisao(false)} style={{ padding: "8px 18px", border: "0.5px solid #D4DCE8", borderRadius: 8, background: "transparent", cursor: "pointer", fontSize: 13 }}>Fechar</button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Modal Converter Previsão → CP ─────────────────────── */}
      {modalConverterPrev && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 110 }}
          onClick={e => { if (e.target === e.currentTarget) setModalConverterPrev(null); }}>
          <div style={{ background: "#fff", borderRadius: 14, padding: 26, width: 420, maxWidth: "92vw" }}>
            <div style={{ fontWeight: 600, fontSize: 15, color: "#1a1a1a", marginBottom: 4 }}>Converter previsão em CP</div>
            <div style={{ fontSize: 12, color: "#555", marginBottom: 18 }}>Esta ação cria um lançamento real a partir da previsão e a remove da lista.</div>
            <div style={{ background: "#E4F0F9", border: "0.5px solid #1A487030", borderRadius: 8, padding: "12px 14px", marginBottom: 18 }}>
              <div style={{ fontWeight: 600, fontSize: 13, color: "#0B2D50" }}>{modalConverterPrev.descricao}</div>
              <div style={{ fontSize: 11, color: "#555", marginTop: 4 }}>
                {modalConverterPrev.categoria} · {fmtData(modalConverterPrev.data)} · {fmtBRL(modalConverterPrev.valor)}
              </div>
            </div>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button onClick={() => setModalConverterPrev(null)} style={{ padding: "8px 18px", border: "0.5px solid #D4DCE8", borderRadius: 8, background: "transparent", cursor: "pointer", fontSize: 13 }}>Cancelar</button>
              <button onClick={() => converterPrevisaoEmCP(modalConverterPrev)} disabled={salvando}
                style={{ padding: "8px 18px", background: salvando ? "#666" : "#1A4870", color: "#fff", border: "none", borderRadius: 8, fontWeight: 600, cursor: "pointer", fontSize: 13 }}>
                {salvando ? "Convertendo…" : "◈ Converter em CP"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Modal Gerenciar Simulações ─────────────────────────── */}
      {modalGerenciarSim && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100 }}
          onClick={e => { if (e.target === e.currentTarget) setModalGerenciarSim(false); }}>
          <div style={{ background: "#fff", borderRadius: 14, padding: 26, width: 560, maxWidth: "92vw", maxHeight: "85vh", overflowY: "auto" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <div>
                <div style={{ fontWeight: 600, fontSize: 16, color: "#1a1a1a" }}>Simulações de Fluxo</div>
                <div style={{ fontSize: 11, color: "#555", marginTop: 2 }}>Aparecem em roxo no fluxo · ativas afetam os totais do dia</div>
              </div>
              <div style={{ display: "flex", gap: 6, fontSize: 11 }}>
                <span style={{ background: "#D5E8F5", color: "#0B2D50", padding: "3px 10px", borderRadius: 8 }}>{simulacoes.filter(s => s.ativa).length} ativas</span>
                <span style={{ background: "#F1EFE8", color: "#555", padding: "3px 10px", borderRadius: 8 }}>{simulacoes.filter(s => !s.ativa).length} pausadas</span>
              </div>
            </div>

            {simulacoes.length === 0 ? (
              <div style={{ padding: "24px 0", textAlign: "center", color: "#444", fontSize: 12 }}>
                Nenhuma simulação criada ainda.<br />
                <span style={{ fontSize: 11 }}>Use o botão <strong>+ sim</strong> em qualquer dia do fluxo vertical para criar uma.</span>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {simulacoes.map(s => (
                  <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", borderRadius: 8, background: s.ativa ? "#FBF3E0" : "#F8F8F8", border: `0.5px solid ${s.ativa ? "#C9921B30" : "#D4DCE8"}`, opacity: s.ativa ? 1 : 0.6 }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 600, fontSize: 12, color: s.ativa ? "#7A5A12" : "#444" }}>{s.descricao}</div>
                      <div style={{ fontSize: 10, color: "#444", marginTop: 2 }}>
                        {fmtData(s.data)} · {s.tipo === "receber" ? "entrada" : "saída"}
                      </div>
                    </div>
                    <span style={{ fontWeight: 600, fontSize: 13, color: s.ativa ? "#C9921B" : "#888" }}>
                      {s.tipo === "receber" ? "+" : "−"} {fmtBRL(s.valor)}
                    </span>
                    {/* Toggle ativa/pausada */}
                    <div
                      onClick={() => handleToggleSim(s.id, !s.ativa)}
                      title={s.ativa ? "Pausar simulação" : "Ativar simulação"}
                      style={{ width: 34, height: 18, borderRadius: 9, cursor: "pointer", flexShrink: 0, background: s.ativa ? "#C9921B" : "#ddd", position: "relative", transition: "background 0.15s" }}
                    >
                      <span style={{ position: "absolute", top: 1, width: 16, height: 16, background: "#fff", borderRadius: "50%", left: s.ativa ? 16 : 1, transition: "left 0.15s", display: "block" }} />
                    </div>
                    <button onClick={() => handleExcluirSim(s.id)} style={{ fontSize: 11, padding: "3px 8px", border: "0.5px solid #E24B4A60", background: "#FCEBEB", color: "#791F1F", borderRadius: 6, cursor: "pointer" }}>✕</button>
                  </div>
                ))}
              </div>
            )}

            <div style={{ marginTop: 16, display: "flex", justifyContent: "flex-end" }}>
              <button onClick={() => setModalGerenciarSim(false)} style={{ padding: "8px 18px", border: "0.5px solid #D4DCE8", borderRadius: 8, background: "transparent", cursor: "pointer", fontSize: 13 }}>Fechar</button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Modal Simulação ────────────────────────────────────── */}
      {modalSimDia && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 110 }}
          onClick={e => { if (e.target === e.currentTarget) setModalSimDia(null); }}>
          <div style={{ background: "#fff", borderRadius: 14, padding: 26, width: 400, maxWidth: "92vw" }}>
            <div style={{ fontWeight: 600, fontSize: 15, color: "#1a1a1a", marginBottom: 4 }}>Nova Simulação</div>
            <div style={{ fontSize: 12, color: "#555", marginBottom: 4 }}>Aparece em roxo no fluxo · apenas hipotética, não afeta lançamentos reais</div>
            <div style={{ display: "grid", gap: 14 }}>
              <div>
                <label style={labelStyle}>Data *</label>
                <input style={inputStyle} type="date" value={novaSim.data} onChange={e => setNovaSim(p => ({ ...p, data: e.target.value }))} />
              </div>
              <div>
                <label style={labelStyle}>Tipo</label>
                <select style={inputStyle} value={novaSim.tipo} onChange={e => setNovaSim(p => ({ ...p, tipo: e.target.value as TipoLanc }))}>
                  <option value="pagar">Débito (saída)</option>
                  <option value="receber">Crédito (entrada)</option>
                </select>
              </div>
              <div>
                <label style={labelStyle}>Descrição *</label>
                <input style={inputStyle} placeholder="Ex: E se eu antecipar o pagamento de insumos?" value={novaSim.descricao} onChange={e => setNovaSim(p => ({ ...p, descricao: e.target.value }))} />
              </div>
              <div>
                <label style={labelStyle}>Valor (R$) *</label>
                <input style={inputStyle} type="text" inputMode="numeric" placeholder="0,00" value={novaSim.valorMask} onChange={e => setNovaSim(p => ({ ...p, valorMask: aplicarMascara(e.target.value) }))} />
              </div>
            </div>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 18 }}>
              <button onClick={() => setModalSimDia(null)} style={{ padding: "8px 18px", border: "0.5px solid #D4DCE8", borderRadius: 8, background: "transparent", cursor: "pointer", fontSize: 13 }}>Cancelar</button>
              <button onClick={salvarSimulacao} disabled={!novaSim.descricao || !novaSim.valorMask}
                style={{ padding: "8px 18px", background: novaSim.descricao && novaSim.valorMask ? "#C9921B" : "#666", color: "#fff", border: "none", borderRadius: 8, fontWeight: 600, cursor: "pointer", fontSize: 13 }}>
                ◈ Adicionar simulação
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
