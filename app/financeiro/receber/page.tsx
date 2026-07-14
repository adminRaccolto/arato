"use client";
import { useState, useEffect, useMemo, useCallback } from "react";
import TopNav from "../../../components/TopNav";
import { useAuth } from "../../../components/AuthProvider";
import CascadeSelector, { type CascadeValues } from "../../../components/CascadeSelector";
import InputNumerico from "../../../components/InputNumerico";
import ContextMenuColunas from "../../../components/ContextMenuColunas";
import { useColunasGrid } from "../../../hooks/useColunasGrid";
import { useColumnResize, ResizeHandle } from "../../../hooks/useColumnResize";
import SelectBusca from "../../../components/SelectBusca";
import { listarLancamentosContaPeriodo, criarLancamento, criarParcelamento, baixarLancamento, reabrirLancamento, reabrirLancamentos, criarPagamentoLote, listarAnosSafra, listarPessoasDaConta, listarProdutoresDaConta, listarProdutoresViaFazenda, listarOperacoesGerenciaisAtivasDaConta, listarTalhoes, listarContasBancariasDaConta } from "../../../lib/db";
import type { Lancamento, AnoSafra, Produtor, Pessoa, OperacaoGerencial, Ciclo, Talhao } from "../../../lib/supabase";
import { supabase } from "../../../lib/supabase";

interface ContaBancariaMin { id: string; nome: string; banco?: string; agencia?: string; conta?: string; }

// ── Tipos ────────────────────────────────────────────────────
type Moeda  = "BRL" | "USD" | "barter";
type Filtro = "aberto" | "vencido" | "baixado" | "barter" | "previsao" | "todos";

// ── Constantes ────────────────────────────────────────────────
const TODAY       = new Date().toISOString().split("T")[0];
const COTACAO_USD = 5.12;

const CATS_CR = [
  "Venda de grãos", "Venda de insumos", "Venda de animais", "Venda de imóveis",
  "Prestação de serviços", "Arrendamento recebido", "Captação de Custeio",
  "Captação de Financiamento", "Captação de Empréstimo", "Sinistro de Seguro",
  "Consórcio — Carta de Crédito", "Outros recebimentos",
];

function derivarCategoriaReceita(classificacao: string): string {
  const c = classificacao ?? "";
  if (c.startsWith("1.01.01.01")) return "Venda de grãos";
  if (c.startsWith("1.01.01.02")) return "Venda de animais";
  if (c.startsWith("1.01.01.03")) return "Arrendamento recebido";
  if (c.startsWith("1.01.02"))    return "Prestação de serviços";
  if (c.startsWith("1.02.01.02")) return "Venda de imóveis";
  if (c.startsWith("1.02.01"))    return "Outros recebimentos";
  if (c.startsWith("1.03"))       return "Outros recebimentos";
  if (c.startsWith("2.03.01.02")) return "Captação de Custeio";
  if (c.startsWith("2.03.01.01")) return "Captação de Financiamento";
  return "Outros recebimentos";
}

const FORMAS_RECEBIMENTO = ["PIX", "TED", "DOC", "Boleto", "Dinheiro", "Cheque", "Cartão de Crédito", "Débito Automático", "Outros"];

// ── Helpers ───────────────────────────────────────────────────
const fmtBRL  = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fmtUSD  = (v: number) => `US$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`;
const fmtData = (iso?: string | null) => { if (!iso) return "—"; const [y, m, d] = iso.split("-"); return `${d}/${m}/${y}`; };

const paraBRL = (l: Lancamento) =>
  l.moeda === "USD" ? l.valor * (l.cotacao_usd ?? COTACAO_USD) : l.valor;

const exibirValor = (l: Lancamento) => {
  if (l.moeda === "USD")    return fmtUSD(l.valor);
  if (l.moeda === "barter") return `${(l.sacas ?? 0).toLocaleString("pt-BR")} sc ${l.cultura_barter ?? "soja"}`;
  return fmtBRL(l.valor);
};

type OrigemLanc = "nf_entrada" | "nf_saida" | "pedido_compra" | "arrendamento" | "tesouraria" | "plantio" | "contrato_financeiro" | "manual";
const ORIGEM_META: Record<OrigemLanc | "auto", { label: string; bg: string; cl: string; border: string }> = {
  nf_entrada:          { label: "NF Entrada",      bg: "#D5E8F5", cl: "#0B2D50",  border: "#1A4870" },
  nf_saida:            { label: "NF Saída",        bg: "#D5E8F5", cl: "#0B2D50",  border: "#1A4870" },
  pedido_compra:       { label: "Pedido Compra",   bg: "#FBF3E0", cl: "#7A4300",  border: "#C9921B" },
  arrendamento:        { label: "Arrendamento",    bg: "#FEF3E2", cl: "#7A4800",  border: "#EF9F27" },
  tesouraria:          { label: "Tesouraria",      bg: "#EEE6F8", cl: "#4A1A7A",  border: "#8B5CF6" },
  plantio:             { label: "Plantio",         bg: "#DCFCE7", cl: "#166534",  border: "#16A34A" },
  contrato_financeiro: { label: "Contrato",        bg: "#E6F1FB", cl: "#0C447C",  border: "#378ADD" },
  manual:              { label: "Manual",          bg: "#F1EFE8", cl: "var(--text-2)",     border: "var(--border)" },
  auto:                { label: "Automático",      bg: "#D5E8F5", cl: "#0B2D50",  border: "#1A4870" },
};
const origemMeta = (l: { origem_lancamento?: string; auto?: boolean }) => {
  const k = (l.origem_lancamento as OrigemLanc | undefined) ?? (l.auto ? "auto" : "manual");
  return ORIGEM_META[k] ?? ORIGEM_META.manual;
};

// Extrai somente o nome do fornecedor/cliente, removendo prefixo "Arrendamento Soja/Milho — "
const exibirFornecedor = (descricao: string) => {
  const m = descricao.match(/^Arrendamento(?:\s+\w+)?\s*—\s*(.+?)(?:\s*\([^)]*\))?\s*$/);
  return m ? m[1].trim() : descricao;
};

// Para lançamentos de arrendamento, gera "Parcela soja safra 25/26" na coluna Observação
const obsArrendamento = (l: Lancamento, safraLabel: string) => {
  if (l.categoria !== "Arrendamento de Terra") return l.observacao ?? "—";
  const isSoja  = /Arrendamento Soja/i.test(l.descricao);
  const isMilho = /Arrendamento Milho/i.test(l.descricao);
  const commodity = isSoja ? "soja" : isMilho ? "milho" : null;
  if (commodity && l.ano_safra_id) return `Parcela ${commodity} safra ${safraLabel}`;
  if (l.ano_safra_id)              return `Parcela arrendamento safra ${safraLabel}`;
  return l.observacao ?? "—";
};

const aplicarMascara = (raw: string) => {
  const nums = raw.replace(/\D/g, "");
  if (!nums) return "";
  return (Number(nums) / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};
const desmascarar = (s: string) => Number(s.replace(/\./g, "").replace(",", ".")) || 0;
const numParaMascara = (n: number) => n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const dotStatus = (s: string) => ({
  em_aberto: { cor: "#378ADD", title: "Em aberto"  },
  vencido:   { cor: "#E24B4A", title: "Vencido"    },
  vencendo:  { cor: "#EF9F27", title: "Vencendo"   },
  parcial:   { cor: "#C9921B", title: "Parcial"    },
  baixado:   { cor: "#16A34A", title: "Recebido"   },
}[s] ?? { cor: "var(--text-3)", title: s });

// ── Estilos ───────────────────────────────────────────────────
const inp: React.CSSProperties = { width: "100%", padding: "8px 10px", border: "0.5px solid var(--border)", borderRadius: 8, fontSize: 13, background: "var(--bg-input)", boxSizing: "border-box", outline: "none", color: "var(--text-1)" };
const inpF: React.CSSProperties = { width: "100%", padding: "4px 7px", border: "0.5px solid var(--border)", borderRadius: 6, fontSize: 11, background: "var(--border-row)", boxSizing: "border-box", outline: "none", color: "var(--text-2)" };
const lbl: React.CSSProperties = { fontSize: 11, color: "var(--text-2)", marginBottom: 4, display: "block" };

// ═══════════════════════════════════════════════════════════════
export default function ContasReceber() {
  const { fazendaId, contaId } = useAuth();
  const [cascade, setCascade] = useState<Partial<CascadeValues>>({});
  const fid = cascade.fazendaId ?? fazendaId ?? "";

  const [lancamentos,  setLancamentos]  = useState<Lancamento[]>([]);
  const [anosSafra,    setAnosSafra]    = useState<AnoSafra[]>([]);
  const [ciclos,       setCiclos]       = useState<Ciclo[]>([]);
  const [talhoes,      setTalhoes]      = useState<Talhao[]>([]);
  const [produtores,   setProdutores]   = useState<Produtor[]>([]);
  const [pessoas,      setPessoas]      = useState<Pessoa[]>([]);
  const [contas,       setContas]       = useState<ContaBancariaMin[]>([]);
  const [opGerenciais, setOpGerenciais] = useState<OperacaoGerencial[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [erro,     setErro]     = useState<string | null>(null);
  const [filtro,   setFiltro]   = useState<Filtro>("aberto");

  // ── Janela padrão: 2 anos atrás até 12 meses à frente ────
  const [periodoInicio, setPeriodoInicio] = useState(() => {
    const d = new Date(); d.setFullYear(d.getFullYear() - 2); d.setDate(1);
    return d.toISOString().split("T")[0];
  });
  const [periodoFim, setPeriodoFim] = useState(() => {
    const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() + 13); d.setDate(0);
    return d.toISOString().split("T")[0];
  });

  const [modalBaixa, setModalBaixa] = useState<Lancamento | null>(null);
  const [modalNovo,  setModalNovo]  = useState(false);
  const [modalTab,   setModalTab]   = useState<"principal"|"adicionais">("principal");

  // ── Edição: reutiliza o modal de Nova CR com editandoId marcado ──
  const [editandoId, setEditandoId] = useState<string | null>(null);

  function fecharModal() {
    setModalNovo(false);
    setEditandoId(null);
    setCascade({});
  }

  function abrirEditar(l: Lancamento) {
    setEditandoId(l.id);
    setModalTab("principal");
    setForm({
      moeda:                 (l.moeda as Moeda) ?? "BRL",
      pessoa_id:             l.pessoa_id             ?? "",
      descricao:             l.descricao             ?? "",
      categoria:             l.categoria             ?? CATS_CR[0],
      vencimento:            l.data_vencimento       ?? "",
      valorMask:             l.valor?.toLocaleString("pt-BR", { minimumFractionDigits: 2 }) ?? "",
      cotacaoMask:           l.cotacao_usd?.toLocaleString("pt-BR", { minimumFractionDigits: 2 }) ?? "5,12",
      sacasMask:             l.sacas?.toString()     ?? "",
      culturaBarter:         l.cultura_barter        ?? "soja",
      precoSacaMask:         l.preco_saca_barter?.toLocaleString("pt-BR", { minimumFractionDigits: 2 }) ?? "120,00",
      obs:                   l.observacao            ?? "",
      parcelar:              false,
      totalParcelas:         "1",
      intervaloMeses:        "1",
      tipo_documento_lcdpr:  (l.tipo_documento_lcdpr as typeof form.tipo_documento_lcdpr) ?? "RECIBO",
      forma_recebimento:     l.forma_pagamento       ?? "PIX",
      conta_recebimento:     l.conta_bancaria        ?? "",
      chave_xml:             l.chave_xml             ?? "",
      centro_custo:          l.centro_custo          ?? "",
      ano_safra_id:          l.ano_safra_id          ?? "",
      produtor_id:           l.produtor_id           ?? "",
      ciclo_id:              l.ciclo_id              ?? "",
      talhao_id:             l.talhao_id             ?? "",
      operacao_gerencial_id: l.operacao_gerencial_id ?? "",
      natureza:              (l.natureza as "real" | "previsao") ?? "real",
      data_emissao:          l.data_lancamento       ?? TODAY,
      numero_documento:      "",
      serie:                 "",
      meses_diferido:        "0",
    });
    setCascade({ produtorId: l.produtor_id ?? "", fazendaId: l.fazenda_id ?? fazendaId ?? "", anoSafraId: l.ano_safra_id ?? "", cicloId: l.ciclo_id ?? "", talhaoId: l.talhao_id ?? "" });
    carregarOps();
    setModalNovo(true);
  }

  // ── Seleção para borderô ──────────────────────────────────
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());
  const [modalLote,    setModalLote]    = useState(false);
  const [loteData,     setLoteData]     = useState(TODAY);
  const [loteConta,    setLoteConta]    = useState("");
  const [loteDesc,     setLoteDesc]     = useState("");
  const [loteSalvando, setLoteSalvando] = useState(false);
  const [loteErro,     setLoteErro]     = useState("");

  const [baixa, setBaixa] = useState({
    valorMask: "", data: TODAY, conta: "", obs: "",
    multa_pct: "", juros_pct: "", desconto_pct: "",
    pessoa_id: "", operacao_gerencial_id: "", og_busca: "",
    ano_safra_id: "", ciclo_id: "",
  });
  const [form, setForm] = useState({
    moeda: "BRL" as Moeda,
    pessoa_id: "", descricao: "", categoria: CATS_CR[0], vencimento: "",
    valorMask: "", cotacaoMask: "5,12",
    sacasMask: "", culturaBarter: "soja", precoSacaMask: "120,00", obs: "",
    parcelar: false, totalParcelas: "1", intervaloMeses: "1",
    tipo_documento_lcdpr: "RECIBO" as NonNullable<Lancamento["tipo_documento_lcdpr"]>,
    forma_recebimento: "PIX",
    conta_recebimento: "",
    chave_xml: "", centro_custo: "",
    ano_safra_id: "", produtor_id: "",
    ciclo_id: "", talhao_id: "",
    operacao_gerencial_id: "",
    natureza: "real" as "real" | "previsao",
    data_emissao: TODAY,
    numero_documento: "",
    serie: "",
    meses_diferido: "0",
  });

  // ── Filtros de coluna ─────────────────────────────────────
  const [menuColunas, setMenuColunas] = useState<{ x: number; y: number } | null>(null);
  const COLS_CR = useMemo(() => [
    { key: "fornecedor", label: "Fornecedor / Cliente", fixo: true },
    { key: "operacao",   label: "Operação" },
    { key: "safra",      label: "Safra" },
    { key: "ciclo",      label: "Ciclo" },
    { key: "vencimento", label: "Vencimento", fixo: true },
    { key: "valor",      label: "Valor", fixo: true },
    { key: "dt_receb",   label: "Dt. Receb." },
    { key: "valor_receb", label: "Valor Receb." },
    { key: "moeda",      label: "Moeda" },
    { key: "conta",      label: "Conta" },
    { key: "produtor",   label: "Produtor" },
    { key: "origem",     label: "Origem" },
    { key: "obs",        label: "Observação" },
  ], []);
  const { col, toggle: toggleCol, visiveis: visCols } = useColunasGrid("cr_colunas", COLS_CR);
  const { w: cw, startResize } = useColumnResize({
    fornecedor: 280, operacao: 150, safra: 100, ciclo: 180,
    vencimento: 90, valor: 110, dt_receb: 85, valor_receb: 100,
    moeda: 65, conta: 110, produtor: 110, origem: 90, obs: 160,
  });
  const [fFornecedor, setFFornecedor] = useState("");
  const [fOperacao,   setFOperacao]   = useState("");
  const [fSafra,      setFSafra]      = useState("");
  const [fVencDe,     setFVencDe]     = useState("");
  const [fVencAte,    setFVencAte]    = useState("");
  const [fMoedaOrig,  setFMoedaOrig]  = useState("");
  const [fConta,      setFConta]      = useState("");
  const [fProdutor,   setFProdutor]   = useState("");
  const [fObs,        setFObs]        = useState("");

  // ── Carga ──────────────────────────────────────────────────

  useEffect(() => {
    if (contaId || fazendaId) {
      carregar();
    }
  }, [contaId, fazendaId, periodoInicio, periodoFim]);

  const carregarOps = () => {
    if (!contaId && !fazendaId) return;
    listarOperacoesGerenciaisAtivasDaConta({ tipo: "receita", permite: "cp_cr" }, fazendaId).then(setOpGerenciais).catch(() => {});
  };

  useEffect(() => {
    if (!contaId && !fazendaId) return;
    listarPessoasDaConta(fazendaId).then(setPessoas).catch(() => {});
    carregarOps();
    listarContasBancariasDaConta(fazendaId).then(setContas).catch(() => {});
    if (contaId) listarProdutoresDaConta(contaId, fazendaId ?? undefined).then(setProdutores).catch(() => {});
    else if (fazendaId) listarProdutoresViaFazenda(fazendaId).then(setProdutores).catch(() => {});
    if (fazendaId) {
      listarAnosSafra(fazendaId).then(setAnosSafra).catch(() => {});
    }
  }, [contaId, fazendaId]);

  // Reload ciclos e talhões sempre que a fazenda selecionada no formulário mudar
  useEffect(() => {
    if (!fid) return;
    supabase.from("ciclos").select("id, descricao, cultura, ano_safra_id, fazenda_id").eq("fazenda_id", fid).order("created_at", { ascending: false }).then(({ data }) => setCiclos((data ?? []) as Ciclo[]));
    listarTalhoes(fid).then(setTalhoes).catch(() => {});
  }, [fid]);

  async function carregar() {
    setLoading(true);
    setErro(null);
    try {
      const dados = await listarLancamentosContaPeriodo(contaId, periodoInicio, periodoFim, "receber", fazendaId);
      setLancamentos(dados);
    } catch (e: unknown) {
      setErro(e instanceof Error ? e.message : "Erro ao carregar");
    } finally {
      setLoading(false);
    }
  }

  // ── Confirmar previsão → real ──────────────────────────────
  async function confirmarPrevisao(l: Lancamento) {
    if (!confirm(`Confirmar "${l.descricao}" como Conta a Receber real?`)) return;
    await supabase.from("lancamentos").update({ natureza: "real" }).eq("id", l.id);
    await carregar();
  }

  // ── Métricas ───────────────────────────────────────────────

  // ── Status efetivo: corrige em_aberto com data passada ──
  const statusEfetivo = (l: Lancamento): string => {
    if (l.status === "baixado" || l.status === "parcial") return l.status;
    if (l.natureza === "previsao") return l.status;
    const venc = l.data_vencimento ?? "";
    if (venc && venc < TODAY) return "vencido";
    if (venc && venc === TODAY) return "vencendo";
    return l.status;
  };

  const lancOper     = lancamentos.filter(l => l.moeda !== "barter" && (l.natureza ?? "real") === "real");
  const totalAberto  = lancOper.filter(l => statusEfetivo(l) !== "baixado").reduce((a, l) => a + paraBRL(l), 0);
  const qAberto      = lancOper.filter(l => statusEfetivo(l) !== "baixado").length;
  const qVencido     = lancamentos.filter(l => statusEfetivo(l) === "vencido").length;
  const qVencendo    = lancamentos.filter(l => statusEfetivo(l) === "vencendo").length;

  const d30 = new Date(TODAY); d30.setDate(d30.getDate() + 30);
  const d30Key = d30.toISOString().split("T")[0];
  const aVencer30 = lancOper.filter(l => statusEfetivo(l) !== "baixado" && (l.data_vencimento ?? "") <= d30Key)
                      .reduce((a, l) => a + paraBRL(l), 0);

  const mesAtual       = TODAY.slice(0, 7);
  const recebidosNoMes = lancamentos.filter(l => l.status === "baixado" && (l.data_baixa ?? "").startsWith(mesAtual))
                          .reduce((a, l) => a + (l.valor_pago ?? paraBRL(l)), 0);

  const totalBarter = lancamentos.filter(l => l.moeda === "barter" && statusEfetivo(l) !== "baixado").reduce((a, l) => a + l.valor, 0);
  const qtdBarter   = lancamentos.filter(l => l.moeda === "barter" && statusEfetivo(l) !== "baixado").length;

  // Mapa id → descrição da OG para exibição rápida no grid
  const ogMap = useMemo(() => new Map(opGerenciais.map(o => [o.id, o.descricao])), [opGerenciais]);

  // ── Filtragem e ordenação ──────────────────────────────────

  const filtradosBase = useMemo(() => {
    let arr = lancamentos.filter(l => {
      const isReal = (l.natureza ?? "real") === "real";
      const sEfet  = statusEfetivo(l);
      if (filtro === "aberto")   return isReal && sEfet !== "baixado" && l.moeda !== "barter";
      if (filtro === "vencido")  return isReal && (sEfet === "vencido" || sEfet === "vencendo");
      if (filtro === "baixado")  return isReal && sEfet === "baixado";
      if (filtro === "barter")   return isReal && l.moeda === "barter";
      if (filtro === "previsao") return l.natureza === "previsao";
      return true;
    });
    arr = arr.sort((a, b) => (a.data_vencimento ?? "") < (b.data_vencimento ?? "") ? -1 : 1);
    return arr;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lancamentos, filtro, TODAY]);

  const filtrados = useMemo(() => {
    return filtradosBase.filter(l => {
      const prodLabel = produtores.find(p => p.id === l.produtor_id)?.nome ?? "";
      if (fFornecedor && !l.descricao.toLowerCase().includes(fFornecedor.toLowerCase()))        return false;
      const ogDesc = l.operacao_gerencial_id ? (ogMap.get(l.operacao_gerencial_id) ?? l.categoria ?? "") : (l.categoria ?? "");
      if (fOperacao   && !ogDesc.toLowerCase().includes(fOperacao.toLowerCase()))               return false;
      if (fSafra      && l.ano_safra_id !== fSafra)                                             return false;
      if (fVencDe     && (l.data_vencimento ?? "") < fVencDe)                                   return false;
      if (fVencAte    && (l.data_vencimento ?? "") > fVencAte)                                  return false;
      if (fMoedaOrig  && l.moeda !== fMoedaOrig)                                                return false;
      if (fConta      && !(l.conta_bancaria ?? "").toLowerCase().includes(fConta.toLowerCase())) return false;
      if (fProdutor   && !prodLabel.toLowerCase().includes(fProdutor.toLowerCase()))             return false;
      if (fObs        && !(l.observacao ?? "").toLowerCase().includes(fObs.toLowerCase()))       return false;
      return true;
    });
  }, [filtradosBase, fFornecedor, fOperacao, fSafra, fVencDe, fVencAte, fMoedaOrig, fConta, fProdutor, fObs, produtores, ogMap]);

  // ── Baixar ─────────────────────────────────────────────────

  const abrirBaixa = (l: Lancamento) => {
    const saldoRestante = paraBRL(l) - (l.valor_pago ?? 0);
    setModalBaixa(l);
    setBaixa({
      valorMask: l.moeda === "barter" ? "" : numParaMascara(Math.max(0, saldoRestante)),
      data: TODAY, conta: l.conta_bancaria ?? "", obs: l.observacao ?? "",
      multa_pct: "", juros_pct: "", desconto_pct: "",
      pessoa_id: l.pessoa_id ?? "", operacao_gerencial_id: l.operacao_gerencial_id ?? "",
      og_busca: "",
      ano_safra_id: l.ano_safra_id ?? "", ciclo_id: l.ciclo_id ?? "",
    });
  };

  const confirmarBaixa = async () => {
    if (!modalBaixa) return;
    if (modalBaixa.moeda !== "barter" && !baixa.valorMask) return;
    if (modalBaixa.moeda !== "barter" && !baixa.conta) { alert("Selecione a conta bancária de recebimento."); return; }
    const valorPago = modalBaixa.moeda === "barter" ? 0 : desmascarar(baixa.valorMask);
    try {
      setSalvando(true);
      await baixarLancamento(
        modalBaixa.id, valorPago, baixa.data, modalBaixa.moeda === "barter" ? "" : baixa.conta,
        {
          pessoa_id:             baixa.pessoa_id || undefined,
          operacao_gerencial_id: baixa.operacao_gerencial_id || undefined,
          ano_safra_id:          baixa.ano_safra_id || undefined,
          ciclo_id:              baixa.ciclo_id || undefined,
          observacao:            baixa.obs || undefined,
        }
      );
      const novoTotalPago = (modalBaixa.valor_pago ?? 0) + valorPago;
      const valorOriginal = paraBRL(modalBaixa);
      const novoStatus = novoTotalPago >= valorOriginal - 0.01 ? "baixado" : "parcial";
      setLancamentos(prev => prev.map(l =>
        l.id !== modalBaixa.id ? l : {
          ...l, status: novoStatus as Lancamento["status"], data_baixa: baixa.data,
          valor_pago: novoTotalPago, conta_bancaria: baixa.conta,
          pessoa_id: baixa.pessoa_id || l.pessoa_id,
        }
      ));
      setModalBaixa(null);
    } catch (e: unknown) {
      alert("Erro: " + (e instanceof Error ? e.message : e));
    } finally {
      setSalvando(false);
    }
  };

  // ── Reabrir títulos ────────────────────────────────────────

  const reabrirUm = async (l: Lancamento) => {
    if (!confirm(`Reabrir "${l.descricao}"?\n\nO status voltará para em aberto e os dados de recebimento serão apagados.`)) return;
    try {
      setSalvando(true);
      await reabrirLancamento(l.id);
      const hoje = new Date().toISOString().slice(0, 10);
      const novoStatus = l.data_vencimento && l.data_vencimento < hoje ? "vencido" : "em_aberto";
      setLancamentos(prev => prev.map(x =>
        x.id !== l.id ? x : { ...x, status: novoStatus as Lancamento["status"], data_baixa: undefined, valor_pago: undefined, lote_id: undefined }
      ));
    } catch (e: unknown) {
      alert("Erro: " + (e instanceof Error ? e.message : e));
    } finally {
      setSalvando(false);
    }
  };

  const reabrirLote = async () => {
    const ids = filtrados.filter(l => selecionados.has(l.id) && l.status === "baixado").map(l => l.id);
    if (!ids.length) return;
    if (!confirm(`Reabrir ${ids.length} título${ids.length > 1 ? "s" : ""} recebido${ids.length > 1 ? "s" : ""}?\n\nOs dados de recebimento serão apagados.`)) return;
    try {
      setSalvando(true);
      await reabrirLancamentos(ids);
      const hoje = new Date().toISOString().slice(0, 10);
      setLancamentos(prev => prev.map(l => {
        if (!ids.includes(l.id)) return l;
        const novoStatus = l.data_vencimento && l.data_vencimento < hoje ? "vencido" : "em_aberto";
        return { ...l, status: novoStatus as Lancamento["status"], data_baixa: undefined, valor_pago: undefined, lote_id: undefined };
      }));
      setSelecionados(new Set());
    } catch (e: unknown) {
      alert("Erro: " + (e instanceof Error ? e.message : e));
    } finally {
      setSalvando(false);
    }
  };

  // ── Pagamento em Lote (Borderô) ───────────────────────────

  const itensLote = filtrados.filter(l => selecionados.has(l.id) && l.status !== "baixado");
  const totalLote = itensLote.reduce((s, l) => s + paraBRL(l), 0);

  const toggleSel = (id: string) =>
    setSelecionados(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const toggleTodos = () => {
    const todos = filtrados.map(l => l.id);
    const todosSel = todos.length > 0 && todos.every(id => selecionados.has(id));
    setSelecionados(todosSel ? new Set() : new Set(todos));
  };

  const receberEmLote = async () => {
    if (!fazendaId || itensLote.length === 0) return;
    setLoteSalvando(true); setLoteErro("");
    try {
      const itensPayload = itensLote.map(l => ({ lancamento_id: l.id, valor_pago: paraBRL(l) }));
      await criarPagamentoLote(fazendaId, "receber", loteData, loteConta, loteDesc || `Borderô ${loteData} — ${itensLote.length} títulos`, itensPayload);
      setSelecionados(new Set());
      setModalLote(false);
      await carregar();
    } catch (e: unknown) {
      setLoteErro(e instanceof Error ? e.message : "Erro ao processar lote");
    } finally {
      setLoteSalvando(false);
    }
  };

  // ── Novo lançamento ────────────────────────────────────────

  const adicionarLancamento = async () => {
    if (!form.pessoa_id && !form.descricao.trim()) return;
    if (!form.vencimento) return;
    if (form.moeda !== "barter" && !form.valorMask) return;
    if (form.moeda === "barter" && !form.sacasMask) return;

    const sacas      = Number(form.sacasMask);
    const precoSaca  = desmascarar(form.precoSacaMask);
    const valorFinal = form.moeda === "barter" ? sacas * precoSaca : desmascarar(form.valorMask);

    // ── MODO EDIÇÃO: UPDATE ─────────────────────────────────────
    if (editandoId) {
      try {
        setSalvando(true);
        const patch = {
          moeda:                 form.moeda,
          pessoa_id:             form.pessoa_id             || null,
          descricao:             form.descricao || (pessoas.find(p => p.id === form.pessoa_id)?.nome ?? ""),
          categoria:             form.categoria,
          data_vencimento:       form.vencimento,
          valor:                 valorFinal,
          cotacao_usd:           form.moeda === "USD" ? desmascarar(form.cotacaoMask) : null,
          sacas:                 form.moeda === "barter" ? sacas : null,
          cultura_barter:        form.moeda === "barter" ? form.culturaBarter : null,
          preco_saca_barter:     form.moeda === "barter" ? precoSaca : null,
          tipo_documento_lcdpr:  form.tipo_documento_lcdpr || null,
          conta_bancaria:        form.conta_recebimento    || null,
          chave_xml:             form.chave_xml            || null,
          centro_custo:          form.centro_custo         || null,
          observacao:            form.obs                  || null,
          ano_safra_id:          form.ano_safra_id         || null,
          ciclo_id:              form.ciclo_id             || null,
          talhao_id:             form.talhao_id            || null,
          produtor_id:           form.produtor_id          || null,
          fazenda_id:            fid                       || null,
          operacao_gerencial_id: form.operacao_gerencial_id || null,
          natureza:              form.natureza,
          forma_pagamento:       form.forma_recebimento    || null,
        };
        const { error } = await supabase.from("lancamentos").update(patch).eq("id", editandoId);
        if (error) { alert("Erro ao salvar: " + error.message); return; }
        setLancamentos(prev => prev.map(x =>
          x.id === editandoId ? { ...x, ...patch, data_vencimento: form.vencimento } as Lancamento : x
        ));
        fecharModal();
      } catch (e: unknown) {
        alert("Erro ao salvar: " + (e instanceof Error ? e.message : e));
      } finally {
        setSalvando(false);
      }
      return;
    }

    // ── MODO CRIAÇÃO: INSERT ────────────────────────────────────
    const base: Omit<Lancamento, "id" | "created_at" | "num_parcela" | "total_parcelas" | "agrupador"> = {
      fazenda_id:    fid!,
      tipo:          "receber",
      moeda:         form.moeda,
      pessoa_id:     form.pessoa_id     || undefined,
      descricao:     form.descricao || (pessoas.find(p => p.id === form.pessoa_id)?.nome ?? ""),
      categoria:     form.categoria,
      data_lancamento: TODAY,
      data_vencimento: form.vencimento,
      valor:         valorFinal,
      status:        "em_aberto",
      auto:          false,
      cotacao_usd:   form.moeda === "USD" ? desmascarar(form.cotacaoMask) : undefined,
      sacas:         form.moeda === "barter" ? sacas : undefined,
      cultura_barter: form.moeda === "barter" ? form.culturaBarter : undefined,
      preco_saca_barter: form.moeda === "barter" ? precoSaca : undefined,
      tipo_documento_lcdpr: form.tipo_documento_lcdpr || undefined,
      conta_bancaria: form.conta_recebimento || undefined,
      chave_xml:     form.chave_xml     || undefined,
      centro_custo:          form.centro_custo          || undefined,
      observacao:            form.obs                   || undefined,
      ano_safra_id:          form.ano_safra_id          || undefined,
      ciclo_id:              form.ciclo_id              || undefined,
      talhao_id:             form.talhao_id             || undefined,
      produtor_id:           form.produtor_id           || undefined,
      operacao_gerencial_id: form.operacao_gerencial_id || undefined,
      natureza:              form.natureza,
    };

    const totalParcelas  = form.parcelar ? Math.max(1, Number(form.totalParcelas) || 1) : 1;
    const intervaloMeses = Math.max(1, Number(form.intervaloMeses) || 1);

    try {
      setSalvando(true);
      let criados: Lancamento[];
      if (totalParcelas > 1) {
        criados = await criarParcelamento(base, totalParcelas, intervaloMeses);
      } else {
        criados = [await criarLancamento(base)];
      }
      setLancamentos(prev => [...criados, ...prev]);
      fecharModal();
    } catch (e: unknown) {
      alert("Erro ao salvar: " + (e instanceof Error ? e.message : e));
    } finally {
      setSalvando(false);
    }
  };

  const hasColFilter = fFornecedor || fOperacao || fSafra || fVencDe || fVencAte || fMoedaOrig || fConta || fProdutor || fObs;

  const limparFiltrosColunas = () => {
    setFFornecedor(""); setFOperacao(""); setFSafra(""); setFVencDe(""); setFVencAte("");
    setFMoedaOrig(""); setFConta(""); setFProdutor(""); setFObs("");
  };

  const totalParcDisplay = form.parcelar ? Math.max(1, Number(form.totalParcelas) || 1) : 1;
  const valParcela = form.moeda !== "barter" && form.valorMask ? desmascarar(form.valorMask) : 0;
  const disabled = salvando || (!form.pessoa_id && !form.descricao.trim()) || !form.vencimento
    || (form.moeda !== "barter" && !form.valorMask)
    || (form.moeda === "barter" && !form.sacasMask);

  // ── Render ─────────────────────────────────────────────────

  // helpers data relativa
  const diasAteVenc = (iso?: string | null) => {
    if (!iso) return null;
    const [y, m, d] = iso.split("-").map(Number);
    const alvo = new Date(y, m - 1, d);
    const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
    return Math.round((alvo.getTime() - hoje.getTime()) / 86400000);
  };
  const labelRelativo = (dias: number | null, status: string) => {
    if (status === "baixado") return null;
    if (dias === null) return null;
    if (dias < 0)  return { txt: `${Math.abs(dias)}d atraso`, cor: "#EF4444" };
    if (dias === 0) return { txt: "Hoje",           cor: "#F59E0B" };
    if (dias === 1) return { txt: "Amanhã",         cor: "#F59E0B" };
    if (dias <= 7)  return { txt: `${dias}d`,        cor: "#F59E0B" };
    return null;
  };

  const totalVencido  = lancamentos.filter(l => statusEfetivo(l) === "vencido").reduce((a, l) => a + paraBRL(l), 0);
  const totalVencendo = lancamentos.filter(l => statusEfetivo(l) === "vencendo").reduce((a, l) => a + paraBRL(l), 0);

  const CR_CSS = `
    @keyframes crFadeIn { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:translateY(0)} }
    .cr-row { transition: background .1s }
    .cr-row:hover { background: rgba(255,255,255,0.04) !important }
    .cr-tab { transition: background .12s, color .12s }
    input[type=date]::-webkit-calendar-picker-indicator { filter: invert(0.6) }
  `;

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh", background: "var(--bg-page)", fontFamily: "system-ui, sans-serif", fontSize: 13 }}>
      {/* eslint-disable-next-line react/no-danger */}
      <style dangerouslySetInnerHTML={{ __html: CR_CSS }} />
      <TopNav />
      <main style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>

        {/* ═══ HEADER ═══ */}
        <header style={{ background: "var(--bg-header)", borderBottom: "0.5px solid var(--border)", padding: "16px 24px" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
            <div>
              <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: "var(--text-1)" }}>Contas a Receber</h1>
              <p style={{ margin: "3px 0 0", fontSize: 11, color: "var(--text-3)" }}>Vendas de grãos, serviços, arrendamentos e outros recebimentos</p>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 11, color: "var(--text-3)" }}>Período:</span>
              <input type="date" value={periodoInicio} onChange={e => setPeriodoInicio(e.target.value)}
                style={{ fontSize: 12, padding: "6px 10px", border: "0.5px solid var(--border)", borderRadius: 7, outline: "none", background: "var(--border-table)", color: "var(--text-2)" }} />
              <span style={{ fontSize: 11, color: "var(--text-muted)" }}>até</span>
              <input type="date" value={periodoFim} onChange={e => setPeriodoFim(e.target.value)}
                style={{ fontSize: 12, padding: "6px 10px", border: "0.5px solid var(--border)", borderRadius: 7, outline: "none", background: "var(--border-table)", color: "var(--text-2)" }} />
              <button onClick={() => { setCascade({}); setModalTab("principal"); carregarOps(); setModalNovo(true); }}
                style={{ background: "#16A34A", color: "#fff", border: "none", borderRadius: 8, padding: "9px 18px", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
                + Nova CR
              </button>
            </div>
          </div>

          {/* KPI Cards */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 10 }}>
            {[
              { label: "A RECEBER",      value: fmtBRL(totalAberto),     count: qAberto,   bg: "rgba(34,197,94,0.08)",   border: "rgba(34,197,94,0.25)",   cor: "#22C55E" },
              { label: "VENCIDO",        value: fmtBRL(totalVencido),    count: qVencido,  bg: "rgba(239,68,68,0.08)",   border: "rgba(239,68,68,0.25)",   cor: "#EF4444" },
              { label: "VENCE HOJE",     value: fmtBRL(totalVencendo),   count: qVencendo, bg: "rgba(245,158,11,0.08)",  border: "rgba(245,158,11,0.25)",  cor: "#F59E0B" },
              { label: "RECEBIDO NO MÊS",value: fmtBRL(recebidosNoMes), count: null,       bg: "rgba(59,130,246,0.08)",  border: "rgba(59,130,246,0.25)",  cor: "#60A5FA" },
            ].map((k, i) => (
              <div key={i} style={{ background: k.bg, border: `0.5px solid ${k.border}`, borderRadius: 10, padding: "12px 16px" }}>
                <div style={{ fontSize: 9, fontWeight: 700, color: "var(--text-3)", letterSpacing: ".1em", textTransform: "uppercase", marginBottom: 6 }}>{k.label}</div>
                <div style={{ fontSize: 18, fontWeight: 800, color: k.cor, fontVariantNumeric: "tabular-nums", lineHeight: 1 }}>{k.value}</div>
                {k.count !== null && <div style={{ fontSize: 10, color: "var(--text-3)", marginTop: 4 }}>{k.count} lançamento{k.count !== 1 ? "s" : ""}</div>}
              </div>
            ))}
          </div>
        </header>

        <div style={{ padding: "16px 24px", flex: 1, overflowY: "auto" }}>

          {/* Banner barter */}
          {qtdBarter > 0 && (
            <div style={{ background: "rgba(251,191,36,0.08)", border: "0.5px solid rgba(251,191,36,0.2)", borderRadius: 8, padding: "9px 14px", marginBottom: 12, fontSize: 12, color: "#FBBF24", display: "flex", gap: 8 }}>
              <span>⇄</span>
              <span><strong>{qtdBarter} lançamento(s) em barter</strong> — equivalente gerencial: <strong>{fmtBRL(totalBarter)}</strong> · não compõem o fluxo de caixa</span>
            </div>
          )}

          {erro && (
            <div style={{ background: "rgba(239,68,68,0.1)", border: "0.5px solid rgba(239,68,68,0.3)", borderRadius: 8, padding: "10px 14px", marginBottom: 14, fontSize: 12, color: "#EF4444", display: "flex", gap: 8 }}>
              <span>✕</span><span>{erro}</span>
              <button onClick={carregar} style={{ marginLeft: "auto", fontSize: 11, color: "#EF4444", background: "none", border: "none", cursor: "pointer", textDecoration: "underline" }}>Tentar novamente</button>
            </div>
          )}

          {loading && <div style={{ textAlign: "center", padding: 40, color: "var(--text-3)" }}>Carregando…</div>}

          {!loading && (
            <div style={{ background: "var(--bg-card)", borderRadius: 12, border: "0.5px solid var(--border)", overflow: "hidden" }}>

              {/* Tabs de status */}
              <div style={{ padding: "10px 16px", borderBottom: "0.5px solid var(--border-table)", display: "flex", gap: 5, flexWrap: "wrap", alignItems: "center", background: "var(--bg-nav)" }}>
                {([
                  { key: "aberto",   label: "Em aberto",  count: lancOper.filter(l => statusEfetivo(l) !== "baixado").length,                                     cor: "#22C55E", activeBg: "rgba(34,197,94,0.12)",   activeBorder: "rgba(34,197,94,0.35)"  },
                  { key: "vencido",  label: "Vencidos",   count: qVencido + qVencendo,                                                                              cor: "#EF4444", activeBg: "rgba(239,68,68,0.15)",    activeBorder: "rgba(239,68,68,0.4)"   },
                  { key: "baixado",  label: "Recebidos",  count: lancamentos.filter(l => (l.natureza ?? "real") === "real" && l.status === "baixado").length,         cor: "#60A5FA", activeBg: "rgba(59,130,246,0.12)",  activeBorder: "rgba(59,130,246,0.35)" },
                  { key: "barter",   label: "Barter",     count: lancamentos.filter(l => (l.natureza ?? "real") === "real" && l.moeda === "barter").length,           cor: "#FBBF24", activeBg: "rgba(251,191,36,0.12)", activeBorder: "rgba(251,191,36,0.35)" },
                  { key: "previsao", label: "Previsões",  count: lancamentos.filter(l => l.natureza === "previsao").length,                                          cor: "#818CF8", activeBg: "rgba(129,140,248,0.12)", activeBorder: "rgba(129,140,248,0.35)" },
                  { key: "todos",    label: "Todos",      count: lancamentos.length,                                                                                 cor: "var(--text-2)", activeBg: "var(--border)", activeBorder: "var(--border)"  },
                ] as { key: Filtro; label: string; count: number; cor: string; activeBg: string; activeBorder: string }[]).map(f => (
                  <button key={f.key} className="cr-tab" onClick={() => setFiltro(f.key)}
                    style={{ padding: "5px 12px", borderRadius: 20, border: `0.5px solid ${filtro === f.key ? f.activeBorder : "var(--border)"}`, background: filtro === f.key ? f.activeBg : "transparent", color: filtro === f.key ? f.cor : "var(--text-3)", fontWeight: filtro === f.key ? 700 : 400, fontSize: 12, cursor: "pointer" }}>
                    {f.label}
                    <span style={{ marginLeft: 6, fontSize: 10, background: filtro === f.key ? f.cor : "var(--border)", color: filtro === f.key ? "#000" : "var(--text-3)", padding: "1px 5px", borderRadius: 8, fontWeight: 700 }}>
                      {f.count}
                    </span>
                  </button>
                ))}
                <div style={{ marginLeft: "auto", display: "flex", gap: 6, alignItems: "center" }}>
                  {hasColFilter && (
                    <button onClick={limparFiltrosColunas} style={{ padding: "4px 10px", borderRadius: 7, border: "0.5px solid var(--border)", background: "var(--border-row)", color: "var(--text-2)", fontSize: 11, cursor: "pointer" }}>
                      ✕ Limpar filtros
                    </button>
                  )}
                  {selecionados.size > 0 && (
                    <button onClick={async () => { const manuais = filtrados.filter(l => selecionados.has(l.id) && l.status !== "baixado"); if (manuais.length === 0) { alert("Nenhum lançamento em aberto selecionado para excluir."); return; } if (!confirm(`Excluir ${manuais.length} lançamento${manuais.length !== 1 ? "s" : ""}?\nEsta ação não pode ser desfeita.`)) return; const ids = manuais.map(l => l.id); const { error } = await supabase.from("lancamentos").delete().in("id", ids); if (error) { alert("Erro ao excluir: " + error.message); return; } setLancamentos(prev => prev.filter(x => !ids.includes(x.id))); setSelecionados(new Set()); }}
                      style={{ padding: "4px 10px", borderRadius: 7, border: "0.5px solid rgba(239,68,68,0.4)", background: "rgba(239,68,68,0.1)", color: "#EF4444", fontSize: 11, cursor: "pointer", fontWeight: 600 }}>
                      🗑 Excluir ({selecionados.size})
                    </button>
                  )}
                  <span style={{ fontSize: 11, color: "var(--text-muted)" }}>{filtrados.length}/{filtradosBase.length}</span>
                </div>
              </div>

              {/* Tabela */}
              <div style={{ overflow: "auto", maxHeight: "calc(100vh - 340px)" }}>
                {filtradosBase.length === 0 ? (
                  <div style={{ padding: 40, textAlign: "center", color: "var(--text-muted)", fontSize: 13 }}>Nenhuma conta encontrada para este filtro.</div>
                ) : (
                  <table style={{ tableLayout: "fixed", width: Math.max(32 + 44 + cw("fornecedor") + (col("operacao") ? cw("operacao") : 0) + (col("safra") ? cw("safra") : 0) + (col("ciclo") ? cw("ciclo") : 0) + cw("vencimento") + cw("valor") + (col("dt_receb") ? cw("dt_receb") : 0) + (col("valor_receb") ? cw("valor_receb") : 0) + (col("moeda") ? cw("moeda") : 0) + (col("conta") ? cw("conta") : 0) + (col("produtor") ? cw("produtor") : 0) + (col("origem") ? cw("origem") : 0) + (col("obs") ? cw("obs") : 0) + 70, 600), borderCollapse: "collapse" }}>
                    <thead
                      style={{ position: "sticky", top: 0, zIndex: 3 }}
                      onContextMenu={e => { e.preventDefault(); setMenuColunas({ x: e.clientX, y: e.clientY }); }}
                      title="Clique com botão direito para configurar colunas"
                    >
                      {/* Cabeçalhos */}
                      <tr style={{ background: "var(--bg-nav)" }}>
                        <th style={{ ...thS(32), width: 32 }}>
                          <input type="checkbox"
                            style={{ cursor: "pointer", accentColor: "#22C55E" }}
                            checked={filtrados.length > 0 && filtrados.every(l => selecionados.has(l.id))}
                            onChange={toggleTodos}
                            title="Selecionar todos"
                          />
                        </th>
                        <th style={{ ...thS(cw("fornecedor"), "left"), width: cw("fornecedor"), position: "relative", userSelect: "none" }}>Fornecedor / Cliente<ResizeHandle onMouseDown={startResize("fornecedor")} /></th>
                        <th style={{ ...thS(44, "center"), width: 44 }}>Parc.</th>
                        {col("operacao")    && <th style={{ ...thS(cw("operacao"),    "left"),   width: cw("operacao"),    position: "relative", userSelect: "none" }}>Operação   <ResizeHandle onMouseDown={startResize("operacao")}    /></th>}
                        {col("safra")       && <th style={{ ...thS(cw("safra"),       "left"),   width: cw("safra"),       position: "relative", userSelect: "none" }}>Safra      <ResizeHandle onMouseDown={startResize("safra")}       /></th>}
                        {col("ciclo")       && <th style={{ ...thS(cw("ciclo"),       "left"),   width: cw("ciclo"),       position: "relative", userSelect: "none" }}>Ciclo      <ResizeHandle onMouseDown={startResize("ciclo")}       /></th>}
                        <th style={{ ...thS(cw("vencimento"), "center"), width: cw("vencimento"), position: "relative", userSelect: "none" }}>Vencimento ↑<ResizeHandle onMouseDown={startResize("vencimento")} /></th>
                        <th style={{ ...thS(cw("valor"),      "right"),  width: cw("valor"),      position: "relative", userSelect: "none" }}>Valor       <ResizeHandle onMouseDown={startResize("valor")}       /></th>
                        {col("dt_receb")    && <th style={{ ...thS(cw("dt_receb"),    "center"), width: cw("dt_receb"),    position: "relative", userSelect: "none" }}>Dt. Receb. <ResizeHandle onMouseDown={startResize("dt_receb")}    /></th>}
                        {col("valor_receb") && <th style={{ ...thS(cw("valor_receb"), "right"),  width: cw("valor_receb"), position: "relative", userSelect: "none" }}>Valor Receb.<ResizeHandle onMouseDown={startResize("valor_receb")} /></th>}
                        {col("moeda")       && <th style={{ ...thS(cw("moeda"),       "center"), width: cw("moeda"),       position: "relative", userSelect: "none" }}>Moeda      <ResizeHandle onMouseDown={startResize("moeda")}       /></th>}
                        {col("conta")       && <th style={{ ...thS(cw("conta"),       "left"),   width: cw("conta"),       position: "relative", userSelect: "none" }}>Conta      <ResizeHandle onMouseDown={startResize("conta")}       /></th>}
                        {col("produtor")    && <th style={{ ...thS(cw("produtor"),    "left"),   width: cw("produtor"),    position: "relative", userSelect: "none" }}>Produtor   <ResizeHandle onMouseDown={startResize("produtor")}    /></th>}
                        {col("origem")      && <th style={{ ...thS(cw("origem"),      "center"), width: cw("origem"),      position: "relative", userSelect: "none" }}>Origem     <ResizeHandle onMouseDown={startResize("origem")}      /></th>}
                        {col("obs")         && <th style={{ ...thS(cw("obs"),         "left"),   width: cw("obs"),         position: "relative", userSelect: "none" }}>Observação <ResizeHandle onMouseDown={startResize("obs")}         /></th>}
                        <th style={{ ...thS(70, "center"), width: 70 }}></th>
                      </tr>
                      {/* Linha de filtros */}
                      <tr style={{ background: "var(--bg-nav)", borderBottom: "0.5px solid var(--border-table)" }}>
                        <td style={{ padding: "4px 4px" }}></td>
                        <td style={{ padding: "3px 8px" }}>
                          <input style={inpF} placeholder="Buscar…" value={fFornecedor} onChange={e => setFFornecedor(e.target.value)} />
                        </td>
                        <td></td>
                        {col("operacao")    && <td style={{ padding: "3px 8px" }}><input style={inpF} placeholder="Buscar…" value={fOperacao} onChange={e => setFOperacao(e.target.value)} /></td>}
                        {col("safra")       && <td style={{ padding: "3px 8px" }}><select style={inpF} value={fSafra} onChange={e => setFSafra(e.target.value)}><option value="">Todas</option>{anosSafra.map(a => <option key={a.id} value={a.id}>{a.descricao}</option>)}</select></td>}
                        {col("ciclo")       && <td></td>}
                        <td></td>
                        <td></td>
                        {col("dt_receb")    && <td></td>}
                        {col("valor_receb") && <td></td>}
                        {col("moeda")       && <td style={{ padding: "3px 8px" }}><select style={inpF} value={fMoedaOrig} onChange={e => setFMoedaOrig(e.target.value)}><option value="">Todas</option><option value="BRL">BRL</option><option value="USD">USD</option><option value="barter">Barter</option></select></td>}
                        {col("conta")       && <td style={{ padding: "3px 8px" }}><input style={inpF} placeholder="Buscar…" value={fConta} onChange={e => setFConta(e.target.value)} /></td>}
                        {col("produtor")    && <td style={{ padding: "3px 8px" }}><input style={inpF} placeholder="Buscar…" value={fProdutor} onChange={e => setFProdutor(e.target.value)} /></td>}
                        {col("origem")      && <td></td>}
                        {col("obs")         && <td style={{ padding: "3px 8px" }}><input style={inpF} placeholder="Buscar…" value={fObs} onChange={e => setFObs(e.target.value)} /></td>}
                        <td></td>
                      </tr>
                    </thead>
                    <tbody>
                      {filtrados.length === 0 ? (
                        <tr>
                          <td colSpan={15} style={{ padding: 24, textAlign: "center", color: "var(--text-3)", fontSize: 11 }}>
                            Nenhum resultado para os filtros aplicados.
                          </td>
                        </tr>
                      ) : filtrados.map((l, li) => {
                        const isPrevisao = l.natureza === "previsao";
                        const sEfet      = statusEfetivo(l);
                        const dot        = dotStatus(sEfet);
                        const conv       = l.moeda === "USD" ? `≈ ${fmtBRL(l.valor * (l.cotacao_usd ?? COTACAO_USD))}` : null;
                        const prod       = produtores.find(p => p.id === l.produtor_id)?.nome ?? "—";
                        const safra      = anosSafra.find(a => a.id === l.ano_safra_id)?.descricao ?? "—";
                        const cicloDesc  = ciclos.find(c => c.id === l.ciclo_id)?.descricao ?? "—";
                        const pessoaNome = pessoas.find(p => p.id === l.pessoa_id)?.nome;
                        const fornNome   = pessoaNome ?? (l.descricao.includes(" - ") ? l.descricao.split(" - ")[0].trim() : l.descricao);
                        const fornDetalhe = pessoaNome
                          ? (l.descricao.toLowerCase().startsWith(pessoaNome.toLowerCase()) ? l.descricao.slice(pessoaNome.length).replace(/^\s*-\s*/, "").trim() : l.descricao)
                          : (l.descricao.includes(" - ") ? l.descricao.split(" - ").slice(1).join(" - ").trim() : "");
                        const obsExibir  = obsArrendamento(l, safra);
                        const om         = origemMeta(l);
                        const inicial    = (fornNome[0] ?? "?").toUpperCase();
                        const dias       = diasAteVenc(l.data_vencimento);
                        const relativo   = labelRelativo(dias, sEfet);
                        const statusBorder = sEfet === "vencido" ? "#EF4444" : sEfet === "vencendo" ? "#F59E0B" : sEfet === "baixado" ? "#22C55E" : isPrevisao ? "#818CF8" : "#22C55E";
                        const parcPct = l.total_parcelas && l.total_parcelas > 1 ? Math.round(((l.num_parcela ?? 1) / l.total_parcelas) * 100) : null;
                        return (
                          <tr key={l.id} className="cr-row" style={{ borderBottom: li < filtrados.length - 1 ? "0.5px solid rgba(255,255,255,0.04)" : "none", background: "transparent", borderLeft: `3px solid ${statusBorder}` }}>
                            {/* Checkbox */}
                            <td style={{ padding: "8px 4px", textAlign: "center" }}>
                              <input type="checkbox" style={{ cursor: "pointer", accentColor: "#22C55E" }}
                                checked={selecionados.has(l.id)} onChange={() => toggleSel(l.id)} />
                            </td>
                            {/* Fornecedor/Cliente */}
                            <td style={{ padding: "8px 10px", maxWidth: cw("fornecedor"), overflow: "hidden" }}>
                              <div style={{ display: "flex", alignItems: "center", gap: 8, overflow: "hidden" }}>
                                <div style={{ width: 28, height: 28, borderRadius: 7, background: `${statusBorder}22`, border: `0.5px solid ${statusBorder}44`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 800, color: statusBorder, flexShrink: 0 }}>{inicial}</div>
                                <div style={{ minWidth: 0, flex: 1 }}>
                                  <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                                    <span style={{ fontWeight: 600, fontSize: 12, color: "var(--text-1)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1, minWidth: 0 }}>{fornNome}</span>
                                    {isPrevisao && <span style={{ fontSize: 9, background: "rgba(129,140,248,0.2)", color: "#818CF8", padding: "1px 5px", borderRadius: 4, fontWeight: 700, flexShrink: 0 }}>PREV</span>}
                                  </div>
                                  {fornDetalhe && <div style={{ fontSize: 10, color: "var(--text-3)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{fornDetalhe}</div>}
                                  {l.nfe_numero && <div style={{ fontSize: 9, color: "var(--text-muted)", marginTop: 1 }}>NF-e {l.nfe_numero}</div>}
                                </div>
                              </div>
                            </td>
                            {/* Parcela */}
                            <td style={{ padding: "8px 6px", textAlign: "center", width: 44 }}>
                              {parcPct !== null ? (
                                <div>
                                  <span style={{ fontSize: 10, fontWeight: 700, color: "#22C55E" }}>{l.num_parcela}/{l.total_parcelas}</span>
                                  <div style={{ height: 3, borderRadius: 2, background: "var(--border-table)", marginTop: 3 }}>
                                    <div style={{ height: 3, borderRadius: 2, background: "#22C55E", width: `${parcPct}%` }} />
                                  </div>
                                </div>
                              ) : <span style={{ color: "#1E3A5F", fontSize: 11 }}>—</span>}
                            </td>
                            {/* Operação */}
                            {col("operacao") && <td style={{ padding: "8px 8px" }}>
                              <span style={{ fontSize: 10, background: "rgba(34,197,94,0.1)", color: "#22C55E", padding: "2px 7px", borderRadius: 5, border: "0.5px solid rgba(34,197,94,0.2)", whiteSpace: "nowrap" }}>
                                {l.operacao_gerencial_id ? (ogMap.get(l.operacao_gerencial_id) ?? l.categoria) : l.categoria}
                              </span>
                            </td>}
                            {/* Safra */}
                            {col("safra") && <td style={{ padding: "8px 8px", fontSize: 10, color: "var(--text-3)", whiteSpace: "nowrap" }}>
                              {l.ano_safra_id ? safra : "—"}
                            </td>}
                            {/* Ciclo */}
                            {col("ciclo") && <td style={{ padding: "8px 8px", fontSize: 10, color: "var(--text-3)", whiteSpace: "nowrap", maxWidth: 130, overflow: "hidden", textOverflow: "ellipsis" }}>
                              {l.ciclo_id ? cicloDesc : "—"}
                            </td>}
                            {/* Vencimento */}
                            <td style={{ padding: "8px 8px", textAlign: "center", whiteSpace: "nowrap" }}>
                              <div style={{ fontSize: 11, color: sEfet === "baixado" ? "#22C55E" : relativo ? relativo.cor : "var(--text-2)", fontWeight: relativo ? 700 : 400 }}>{fmtData(l.data_vencimento)}</div>
                              {relativo && <div style={{ fontSize: 9, color: relativo.cor, fontWeight: 700, marginTop: 1 }}>{relativo.txt}</div>}
                            </td>
                            {/* Valor */}
                            <td style={{ padding: "8px 8px", textAlign: "right", whiteSpace: "nowrap" }}>
                              <div style={{ fontWeight: 700, color: l.moeda === "barter" ? "#FBBF24" : "#22C55E", fontSize: 13, fontVariantNumeric: "tabular-nums" }}>{exibirValor(l)}</div>
                              {conv && <div style={{ fontSize: 9, color: "var(--text-muted)", marginTop: 1 }}>{conv}</div>}
                            </td>
                            {/* Data Receb */}
                            {col("dt_receb") && <td style={{ padding: "8px 8px", textAlign: "center", fontSize: 10, color: "#22C55E", whiteSpace: "nowrap" }}>
                              {fmtData(l.data_baixa)}
                            </td>}
                            {/* Valor Recebido */}
                            {col("valor_receb") && <td style={{ padding: "8px 8px", textAlign: "right", fontSize: 11, whiteSpace: "nowrap" }}>
                              {l.status === "parcial" && l.valor_pago != null && l.valor_pago > 0
                                ? <div>
                                    <span style={{ color: "#FBBF24", fontWeight: 600 }}>{fmtBRL(l.valor_pago)}</span>
                                    <div style={{ fontSize: 9, color: "var(--text-muted)" }}>de {fmtBRL(paraBRL(l))}</div>
                                    <div style={{ height: 3, borderRadius: 2, background: "var(--border-table)", marginTop: 2 }}>
                                      <div style={{ height: 3, borderRadius: 2, background: "#FBBF24", width: `${Math.min(100, (l.valor_pago / paraBRL(l)) * 100)}%` }} />
                                    </div>
                                  </div>
                                : l.valor_pago != null && l.valor_pago > 0
                                ? <span style={{ color: "#22C55E", fontWeight: 600 }}>{fmtBRL(l.valor_pago)}</span>
                                : <span style={{ color: "#1E3A5F" }}>—</span>}
                            </td>}
                            {/* Moeda */}
                            {col("moeda") && <td style={{ padding: "8px 8px", textAlign: "center" }}>
                              <span style={{ fontSize: 9, padding: "2px 6px", borderRadius: 5, background: l.moeda === "USD" ? "rgba(251,191,36,0.1)" : l.moeda === "barter" ? "rgba(251,191,36,0.1)" : "var(--bg-input)", color: l.moeda === "USD" ? "#FBBF24" : l.moeda === "barter" ? "#FBBF24" : "var(--text-2)", fontWeight: 600, border: "0.5px solid var(--border-table)", whiteSpace: "nowrap" }}>
                                {l.moeda === "barter" ? "Barter" : l.moeda}{l.moeda_pagamento && l.moeda_pagamento !== l.moeda ? `→${l.moeda_pagamento}` : ""}
                              </span>
                            </td>}
                            {/* Conta */}
                            {col("conta") && <td style={{ padding: "8px 8px", fontSize: 10, color: "var(--text-3)", whiteSpace: "nowrap" }}>
                              {l.conta_bancaria ?? "—"}
                            </td>}
                            {/* Produtor */}
                            {col("produtor") && <td style={{ padding: "8px 8px", fontSize: 10, color: "var(--text-3)", whiteSpace: "nowrap" }}>
                              {l.produtor_id ? prod : "—"}
                            </td>}
                            {/* Origem */}
                            {col("origem") && <td style={{ padding: "8px 8px", textAlign: "center" }}>
                              <span style={{ fontSize: 9, background: "var(--bg-input)", color: "var(--text-2)", padding: "2px 6px", borderRadius: 5, fontWeight: 600, border: "0.5px solid var(--border-table)", whiteSpace: "nowrap" }}>{om.label}</span>
                            </td>}
                            {/* Observação */}
                            {col("obs") && <td style={{ padding: "8px 8px", fontSize: 10, color: "var(--text-3)", whiteSpace: "nowrap" }}>
                              {obsExibir}
                            </td>}
                            {/* Ação */}
                            <td style={{ padding: "8px 6px", textAlign: "center" }}>
                              <div style={{ display: "flex", gap: 4, justifyContent: "center", alignItems: "center" }}>
                                {isPrevisao ? (
                                  <button onClick={() => confirmarPrevisao(l)} title="Confirmar previsão"
                                    style={{ width: 28, height: 26, borderRadius: 6, cursor: "pointer", fontWeight: 700, background: "#1A5CB8", color: "#fff", border: "none", fontSize: 13, display: "flex", alignItems: "center", justifyContent: "center" }}>✓</button>
                                ) : l.moeda === "barter" ? (
                                  <button onClick={() => abrirBaixa(l)} title="Confirmar entrega barter"
                                    style={{ width: 28, height: 26, borderRadius: 6, cursor: "pointer", fontWeight: 700, background: "rgba(251,191,36,0.1)", color: "#FBBF24", border: "0.5px solid rgba(251,191,36,0.3)", fontSize: 13, display: "flex", alignItems: "center", justifyContent: "center" }}>⇄</button>
                                ) : l.status !== "baixado" ? (
                                  <button onClick={() => abrirBaixa(l)} title="Receber / Registrar recebimento"
                                    style={{ width: 28, height: 26, borderRadius: 6, cursor: "pointer", fontWeight: 700, background: "#16A34A", color: "#fff", border: "none", fontSize: 14, display: "flex", alignItems: "center", justifyContent: "center" }}>↓</button>
                                ) : (
                                  <button onClick={() => reabrirUm(l)} title="Reabrir — apaga dados de recebimento"
                                    style={{ width: 28, height: 26, borderRadius: 6, cursor: "pointer", fontWeight: 700, background: "rgba(251,191,36,0.08)", color: "#FBBF24", border: "0.5px solid rgba(251,191,36,0.25)", fontSize: 13, display: "flex", alignItems: "center", justifyContent: "center" }}>↺</button>
                                )}
                                {!l.auto && (
                                  <button onClick={() => abrirEditar(l)} title="Editar lançamento"
                                    style={{ fontSize: 13, padding: "3px 7px", borderRadius: 6, cursor: "pointer", background: "var(--bg-input)", color: "var(--text-2)", border: "0.5px solid var(--border)", lineHeight: 1 }}>✏</button>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>

              <div style={{ padding: "10px 16px", borderTop: "0.5px solid var(--border-table)", display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 11, color: "var(--text-3)", background: "var(--bg-nav)" }}>
                <span>CR automáticas (NF-e): <strong style={{ color: "#22C55E" }}>{lancamentos.filter(l => l.auto).length}</strong></span>
                <div style={{ display: "flex", gap: 24, alignItems: "center" }}>
                  <span>Exibindo {filtrados.length} de {filtradosBase.length} registros</span>
                  {filtrados.length > 0 && (
                    <>
                      <span style={{ color: "#1E3A5F" }}>|</span>
                      <span>Total filtrado: <strong style={{ color: "#22C55E", fontSize: 13 }}>{fmtBRL(filtrados.filter(l => l.status !== "baixado").reduce((s, l) => s + paraBRL(l), 0))}</strong> em aberto</span>
                      {filtrados.some(l => l.status === "baixado") && (
                        <span>Recebido: <strong style={{ color: "#22C55E", fontSize: 13 }}>{fmtBRL(filtrados.filter(l => l.status === "baixado").reduce((s, l) => s + (l.valor_pago ?? paraBRL(l)), 0))}</strong></span>
                      )}
                    </>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </main>

      {/* ── Barra flutuante de seleção (borderô) ─────────────── */}
      {selecionados.size > 0 && (() => {
        const qtdBaixados = filtrados.filter(l => selecionados.has(l.id) && l.status === "baixado").length;
        return (
          <div style={{
            position: "fixed", bottom: 24, left: "50%", transform: "translateX(-50%)",
            background: "#1A4870", color: "#fff", borderRadius: 14,
            padding: "12px 22px", display: "flex", alignItems: "center", gap: 18,
            boxShadow: "0 2px 8px rgba(11,45,80,0.07)", zIndex: 90, whiteSpace: "nowrap",
          }}>
            <span style={{ fontSize: 13 }}>
              <strong>{selecionados.size}</strong> título{selecionados.size !== 1 ? "s" : ""} selecionado{selecionados.size !== 1 ? "s" : ""}
              {itensLote.length > 0 && <>&nbsp;·&nbsp;<strong>{fmtBRL(totalLote)}</strong></>}
            </span>
            {itensLote.length > 0 && (
              <button
                onClick={() => { setLoteData(TODAY); setLoteConta(""); setLoteDesc(""); setLoteErro(""); setModalLote(true); }}
                style={{ background: "#16A34A", color: "#fff", border: "none", borderRadius: 8, padding: "7px 16px", fontWeight: 700, fontSize: 13, cursor: "pointer" }}
              >
                Receber em Lote ›
              </button>
            )}
            {qtdBaixados > 0 && (
              <button
                onClick={reabrirLote}
                style={{ background: "#C9921B", color: "#fff", border: "none", borderRadius: 8, padding: "7px 16px", fontWeight: 700, fontSize: 13, cursor: "pointer" }}
              >
                ↺ Reabrir {qtdBaixados} recebido{qtdBaixados !== 1 ? "s" : ""}
              </button>
            )}
            <button
              onClick={() => setSelecionados(new Set())}
              style={{ background: "none", border: "0.5px solid var(--border)", color: "#fff", borderRadius: 8, padding: "6px 12px", fontSize: 12, cursor: "pointer" }}
            >
              Cancelar
            </button>
          </div>
        );
      })()}

      {/* ── Modal Baixa ─────────────────────────────────────────── */}
      {modalBaixa && (() => {
        const valorTotal = paraBRL(modalBaixa);
        const jaPago     = modalBaixa.valor_pago ?? 0;
        const valorOrig  = Math.max(0, valorTotal - jaPago);  // saldo restante — base para encargos
        const multaV   = valorOrig * (parseFloat(baixa.multa_pct.replace(",", ".")) || 0) / 100;
        const jurosV   = valorOrig * (parseFloat(baixa.juros_pct.replace(",", ".")) || 0) / 100;
        const descV    = valorOrig * (parseFloat(baixa.desconto_pct.replace(",", ".")) || 0) / 100;
        const valorCom = valorOrig + multaV + jurosV - descV;
        const temEncargo = multaV + jurosV + descV !== 0;
        return (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex:2000 }}
          onClick={e => { if (e.target === e.currentTarget) setModalBaixa(null); }}>
          <div style={{ background: "var(--bg-card)", borderRadius: 12, width: "100%", maxWidth: 620, maxHeight: "93vh", overflowY: "auto" as const, boxShadow: "0 8px 40px rgba(0,0,0,0.6)", border: "0.5px solid var(--border)", padding: 24 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 4 }}>
              <div style={{ fontWeight: 700, fontSize: 15, color: "var(--text-1)" }}>
                {modalBaixa.moeda === "barter" ? "Confirmar entrega (barter)" : modalBaixa.status === "parcial" ? "Registrar recebimento parcial" : "Registrar recebimento"}
              </div>
              <button onClick={() => setModalBaixa(null)} style={{ background: "none", border: "none", fontSize: 18, cursor: "pointer", color: "var(--text-3)" }}>×</button>
            </div>
            <div style={{ fontSize: 12, color: "var(--text-2)", marginBottom: 16 }}>{modalBaixa.descricao}</div>
            <div style={{ background: "#F8FAFB", borderRadius: 8, padding: "8px 12px", fontSize: 12, color: "var(--text-2)", marginBottom: 20, display: "flex", gap: 20, flexWrap: "wrap" }}>
              <span>Valor original: <strong style={{ color: "#1A4870" }}>{fmtBRL(valorTotal)}</strong></span>
              {jaPago > 0 && <span>Já recebido: <strong style={{ color: "#16A34A" }}>{fmtBRL(jaPago)}</strong></span>}
              {jaPago > 0 && <span>Saldo restante: <strong style={{ color: "#C9921B" }}>{fmtBRL(valorOrig)}</strong></span>}
              <span>Vencimento: <strong>{modalBaixa.data_vencimento ? new Date(modalBaixa.data_vencimento + "T12:00").toLocaleDateString("pt-BR") : "—"}</strong></span>
              {modalBaixa.moeda === "USD" && <span style={{ color: "#7A4300" }}>Venda em {fmtUSD(modalBaixa.valor)}</span>}
            </div>

            {modalBaixa.moeda === "barter" ? (
              <div style={{ display: "grid", gap: 14 }}>
                <div style={{ background: "#FBF3E0", borderRadius: 8, padding: "10px 12px", fontSize: 12, color: "#8B5E14" }}>
                  <strong>⇄ {modalBaixa.sacas?.toLocaleString("pt-BR")} sc {modalBaixa.cultura_barter} @ R$ {modalBaixa.preco_saca_barter?.toLocaleString("pt-BR")}/sc</strong>
                  <div style={{ fontSize: 11, color: "var(--text-2)", marginTop: 3 }}>Sem movimentação bancária</div>
                </div>
                <div>
                  <label style={lbl}>Data de confirmação</label>
                  <input style={inp} type="date" value={baixa.data} onChange={e => setBaixa(p => ({ ...p, data: e.target.value }))} />
                </div>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

                {/* ── Classificação ── */}
                <div style={{ border: "0.5px solid #E4E9F0", borderRadius: 10, padding: "14px 16px" }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: "#1A4870", textTransform: "uppercase", letterSpacing: 1, marginBottom: 12 }}>Classificação</div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                    <div>
                      <label style={lbl}>Cliente / Devedor</label>
                      <select style={inp} value={baixa.pessoa_id} onChange={e => setBaixa(p => ({ ...p, pessoa_id: e.target.value }))}>
                        <option value="">— Não informado —</option>
                        {pessoas.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
                      </select>
                    </div>
                    <div>
                      <label style={lbl}>Ano Safra</label>
                      <select style={inp} value={baixa.ano_safra_id} onChange={e => setBaixa(p => ({ ...p, ano_safra_id: e.target.value, ciclo_id: "" }))}>
                        <option value="">— Sem safra —</option>
                        {anosSafra.map(a => <option key={a.id} value={a.id}>{a.descricao}</option>)}
                      </select>
                    </div>
                    <div style={{ gridColumn: "1/-1" }}>
                      <label style={lbl}>Operação Gerencial</label>
                      <SelectBusca
                        value={baixa.operacao_gerencial_id}
                        onChange={id => setBaixa(p => ({ ...p, operacao_gerencial_id: id }))}
                        options={opGerenciais.map(o => ({ value: o.id, label: `${o.classificacao} — ${o.descricao}`, group: (o.classificacao ?? "").split(".").slice(0, 3).join(".") }))}
                        placeholder="— Sem operação gerencial —"
                        style={inp}
                      />
                    </div>
                    <div>
                      <label style={lbl}>Ciclo / Empreendimento</label>
                      <select style={inp} value={baixa.ciclo_id} onChange={e => setBaixa(p => ({ ...p, ciclo_id: e.target.value }))}>
                        <option value="">— Sem ciclo —</option>
                        {ciclos.filter(c => !baixa.ano_safra_id || c.ano_safra_id === baixa.ano_safra_id)
                          .map(c => <option key={c.id} value={c.id}>{c.descricao || c.cultura}</option>)}
                      </select>
                    </div>
                  </div>
                </div>

                {/* ── Encargos ── */}
                <div style={{ border: "0.5px solid #E4E9F0", borderRadius: 10, padding: "14px 16px" }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: "#1A4870", textTransform: "uppercase", letterSpacing: 1, marginBottom: 12 }}>Encargos</div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
                    <div>
                      <label style={lbl}>Acréscimo (%)</label>
                      <input style={inp} type="text" inputMode="decimal" placeholder="0,00" value={baixa.multa_pct}
                        onChange={e => {
                          const v = e.target.value.replace(/[^\d,]/g, "");
                          const com = valorOrig + valorOrig * (parseFloat(v.replace(",", ".")) || 0) / 100 + jurosV - descV;
                          setBaixa(p => ({ ...p, multa_pct: v, valorMask: numParaMascara(com) }));
                        }} />
                    </div>
                    <div>
                      <label style={lbl}>Juros (%)</label>
                      <input style={inp} type="text" inputMode="decimal" placeholder="0,00" value={baixa.juros_pct}
                        onChange={e => {
                          const v = e.target.value.replace(/[^\d,]/g, "");
                          const com = valorOrig + multaV + valorOrig * (parseFloat(v.replace(",", ".")) || 0) / 100 - descV;
                          setBaixa(p => ({ ...p, juros_pct: v, valorMask: numParaMascara(com) }));
                        }} />
                    </div>
                    <div>
                      <label style={lbl}>Desconto (%)</label>
                      <input style={inp} type="text" inputMode="decimal" placeholder="0,00" value={baixa.desconto_pct}
                        onChange={e => {
                          const v = e.target.value.replace(/[^\d,]/g, "");
                          const com = valorOrig + multaV + jurosV - valorOrig * (parseFloat(v.replace(",", ".")) || 0) / 100;
                          setBaixa(p => ({ ...p, desconto_pct: v, valorMask: numParaMascara(com) }));
                        }} />
                    </div>
                  </div>
                  {temEncargo && (
                    <div style={{ marginTop: 10, background: "#F0F7FF", borderRadius: 7, padding: "7px 12px", fontSize: 12, color: "#0B2D50", display: "flex", gap: 16, flexWrap: "wrap" }}>
                      {multaV > 0 && <span>Acréscimo: +{fmtBRL(multaV)}</span>}
                      {jurosV > 0 && <span>Juros: +{fmtBRL(jurosV)}</span>}
                      {descV  > 0 && <span>Desconto: -{fmtBRL(descV)}</span>}
                      <span style={{ fontWeight: 700 }}>Total com encargos: {fmtBRL(valorCom)}</span>
                    </div>
                  )}
                </div>

                {/* ── Recebimento ── */}
                <div style={{ border: "0.5px solid #E4E9F0", borderRadius: 10, padding: "14px 16px" }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: "#1A4870", textTransform: "uppercase", letterSpacing: 1, marginBottom: 12 }}>Recebimento</div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 10 }}>
                    <div style={{ gridColumn: "1/-1" }}>
                      <label style={lbl}>Valor recebido (R$) <span style={{ color: "#E24B4A" }}>*</span></label>
                      <input style={{ ...inp, fontWeight: 600 }} type="text" inputMode="numeric" placeholder="0,00" value={baixa.valorMask}
                        onChange={e => setBaixa(p => ({ ...p, valorMask: aplicarMascara(e.target.value) }))} />
                      {desmascarar(baixa.valorMask) > 0 && desmascarar(baixa.valorMask) < valorOrig && (
                        <div style={{ fontSize: 10, color: "#EF9F27", marginTop: 4 }}>
                          Recebimento parcial — restante: {fmtBRL(valorOrig - desmascarar(baixa.valorMask))}
                        </div>
                      )}
                    </div>
                    <div>
                      <label style={lbl}>Data da liquidação</label>
                      <input style={inp} type="date" value={baixa.data} onChange={e => setBaixa(p => ({ ...p, data: e.target.value }))} />
                    </div>
                    <div>
                      <label style={lbl}>Conta bancária <span style={{ color: "#E24B4A" }}>*</span></label>
                      <select style={{ ...inp, borderColor: !baixa.conta ? "#E24B4A" : undefined }} value={baixa.conta} onChange={e => setBaixa(p => ({ ...p, conta: e.target.value }))}>
                        <option value="">— Selecionar conta —</option>
                        {contas.map(c => {
                          const label = c.nome || `${c.banco ?? ""} ${c.agencia ? `Ag.${c.agencia}` : ""} ${c.conta ? `C/C ${c.conta}` : ""}`.trim();
                          return <option key={c.id} value={label}>{label}</option>;
                        })}
                        {contas.length === 0 && <option disabled>Cadastre contas em Cadastros › Contas Bancárias</option>}
                      </select>
                    </div>
                    <div style={{ gridColumn: "1/-1" }}>
                      <label style={lbl}>Observação</label>
                      <input style={inp} placeholder="Opcional" value={baixa.obs} onChange={e => setBaixa(p => ({ ...p, obs: e.target.value }))} />
                    </div>
                  </div>
                </div>
              </div>
            )}

            <div style={{ marginTop: 14, background: "#D5E8F5", borderRadius: 8, padding: "8px 12px", fontSize: 11, color: "#0B2D50" }}>
              ◈ Ação manual — você confirma que o valor foi recebido na conta selecionada.
            </div>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 16 }}>
              <button onClick={() => setModalBaixa(null)} style={{ padding: "8px 18px", border: "0.5px solid #D4DCE8", borderRadius: 8, background: "transparent", cursor: "pointer", fontSize: 13 }}>Cancelar</button>
              <button onClick={confirmarBaixa}
                disabled={salvando || (modalBaixa.moeda !== "barter" && (!baixa.valorMask || !baixa.conta))}
                style={{ padding: "8px 18px", background: "#1A4870", color: "#fff", border: "none", borderRadius: 8, fontWeight: 600, cursor: "pointer", fontSize: 13 }}>
                {salvando ? "Salvando…" : "↓ Confirmar recebimento"}
              </button>
            </div>
          </div>
        </div>
        );
      })()}

      {/* ── Modal Recebimento em Lote ────────────────────────── */}
      {modalLote && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex:2000 }}
          onClick={e => { if (e.target === e.currentTarget) setModalLote(false); }}>
          <div style={{ background: "var(--bg-card)", borderRadius: 12, width: "100%", maxWidth: 580, maxHeight: "90vh", overflowY: "auto" as const, boxShadow: "0 8px 40px rgba(0,0,0,0.6)", border: "0.5px solid var(--border)" }}>
            <div style={{ padding: "16px 22px", borderBottom: "0.5px solid #D4DCE8", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 15, color: "var(--text-1)" }}>Recebimento em Lote (Borderô)</div>
                <div style={{ fontSize: 11, color: "var(--text-2)", marginTop: 2 }}>{itensLote.length} título{itensLote.length !== 1 ? "s" : ""} · total {fmtBRL(totalLote)}</div>
              </div>
              <button onClick={() => setModalLote(false)} style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer", color: "var(--text-2)" }}>×</button>
            </div>
            <div style={{ padding: "18px 22px" }}>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 12, marginBottom: 16 }}>
                <div>
                  <label style={{ fontSize: 11, color: "var(--text-2)", marginBottom: 3, display: "block" }}>Data do Recebimento *</label>
                  <input type="date" style={{ width: "100%", padding: "8px 10px", border: "0.5px solid var(--border)", borderRadius: 8, fontSize: 13, background: "var(--bg-input)", boxSizing: "border-box" as const, outline: "none", color: "var(--text-1)" }} value={loteData} onChange={e => setLoteData(e.target.value)} />
                </div>
                <div>
                  <label style={{ fontSize: 11, color: "var(--text-2)", marginBottom: 3, display: "block" }}>Conta Bancária *</label>
                  <select style={{ width: "100%", padding: "8px 10px", border: "0.5px solid var(--border)", borderRadius: 8, fontSize: 13, background: "var(--bg-input)", boxSizing: "border-box" as const, outline: "none", color: "var(--text-1)" }} value={loteConta} onChange={e => setLoteConta(e.target.value)}>
                    <option value="">— Selecionar conta —</option>
                    {contas.map(c => {
                      const label = c.nome || `${c.banco ?? ""} ${c.agencia ? `Ag.${c.agencia}` : ""} ${c.conta ? `C/C ${c.conta}` : ""}`.trim();
                      return <option key={c.id} value={label}>{label}</option>;
                    })}
                    {contas.length === 0 && <option disabled>Cadastre contas em Cadastros › Contas Bancárias</option>}
                  </select>
                </div>
                <div style={{ gridColumn: "1/-1" }}>
                  <label style={{ fontSize: 11, color: "var(--text-2)", marginBottom: 3, display: "block" }}>Descrição do Borderô (opcional)</label>
                  <input style={{ width: "100%", padding: "8px 10px", border: "0.5px solid var(--border)", borderRadius: 8, fontSize: 13, background: "var(--bg-input)", boxSizing: "border-box" as const, outline: "none", color: "var(--text-1)" }} value={loteDesc} onChange={e => setLoteDesc(e.target.value)} placeholder={`Borderô ${loteData} — ${itensLote.length} títulos`} />
                </div>
              </div>

              <div style={{ border: "0.5px solid #D4DCE8", borderRadius: 8, overflow: "hidden", marginBottom: 14 }}>
                <div style={{ background: "#F3F6F9", padding: "6px 12px", fontSize: 10, fontWeight: 700, color: "var(--text-2)", textTransform: "uppercase" as const, display: "grid", gridTemplateColumns: "1fr auto auto", gap: 8 }}>
                  <span>Título</span><span>Vencimento</span><span style={{ textAlign: "right" as const }}>Valor</span>
                </div>
                {itensLote.map((l, i) => (
                  <div key={l.id} style={{ display: "grid", gridTemplateColumns: "1fr auto auto", gap: 8, padding: "8px 12px", borderTop: i > 0 ? "0.5px solid #EEF1F6" : "none", fontSize: 12, alignItems: "center" }}>
                    <span style={{ color: "var(--text-1)", fontWeight: 500 }}>{exibirFornecedor(l.descricao)}</span>
                    <span style={{ color: "var(--text-2)", whiteSpace: "nowrap" as const }}>{fmtData(l.data_vencimento)}</span>
                    <span style={{ fontWeight: 600, color: "#16A34A", textAlign: "right" as const, whiteSpace: "nowrap" as const }}>{exibirValor(l)}</span>
                  </div>
                ))}
                <div style={{ background: "#F3F6F9", padding: "8px 12px", display: "flex", justifyContent: "space-between", borderTop: "0.5px solid #D4DCE8" }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-2)" }}>Total do lote</span>
                  <span style={{ fontSize: 14, fontWeight: 700, color: "#1A4870" }}>{fmtBRL(totalLote)}</span>
                </div>
              </div>

              <div style={{ background: "#D5E8F5", border: "0.5px solid #1A487040", borderRadius: 7, padding: "8px 12px", fontSize: 11, color: "#0B2D50", marginBottom: 14 }}>
                Este lote será registrado como <strong>uma única entrada de caixa</strong> de {fmtBRL(totalLote)} na conciliação bancária.
                Cada título será baixado individualmente.
              </div>

              {loteErro && (
                <div style={{ background: "#FCEBEB", border: "0.5px solid #E24B4A60", borderRadius: 7, padding: "8px 12px", fontSize: 12, color: "#791F1F", marginBottom: 12 }}>{loteErro}</div>
              )}

              <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
                <button onClick={() => setModalLote(false)} style={{ padding: "8px 18px", border: "0.5px solid var(--border)", borderRadius: 8, background: "var(--bg-input)", color: "var(--text-2)", cursor: "pointer", fontSize: 13 }}>Cancelar</button>
                <button
                  onClick={receberEmLote}
                  disabled={loteSalvando || !loteData || !loteConta}
                  style={{ padding: "8px 20px", background: "#16A34A", color: "#fff", border: "none", borderRadius: 8, fontWeight: 700, fontSize: 13, cursor: "pointer", opacity: loteSalvando ? 0.6 : 1 }}
                >
                  {loteSalvando ? "Processando…" : `Confirmar Recebimento de ${itensLote.length} título${itensLote.length !== 1 ? "s" : ""}`}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal Nova CR ──────────────────────────────────────── */}
      {modalNovo && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex:2000 }}
          onClick={e => { if (e.target === e.currentTarget) fecharModal(); }}>
          <div style={{ background: "var(--bg-card)", borderRadius: 12, width: "95vw", maxWidth: 920, maxHeight: "92vh", overflowY: "auto" as const, boxShadow: "0 8px 40px rgba(0,0,0,0.6)", border: "0.5px solid var(--border)", display: "flex", flexDirection: "column" }}>

            {/* ── Cabeçalho ── */}
            <div style={{ padding: "16px 24px 0", borderBottom: "0.5px solid #DEE5EE" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12, flexWrap: "wrap", gap: 8 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <span style={{ fontWeight: 700, fontSize: 15, color: "var(--text-1)" }}>
                    {editandoId ? "✏ Editar Conta a Receber" : "Nova Conta a Receber"}
                  </span>
                  <div style={{ display: "flex", gap: 0, border: "0.5px solid #D4DCE8", borderRadius: 8, overflow: "hidden" }}>
                    {(["real", "previsao"] as const).map(n => (
                      <button key={n} onClick={() => setForm(p => ({ ...p, natureza: n }))}
                        style={{ padding: "4px 14px", border: "none", cursor: "pointer", fontSize: 12, fontWeight: form.natureza === n ? 700 : 400,
                          background: form.natureza === n ? (n === "previsao" ? "#1A5CB8" : "#1A4870") : "#fff",
                          color: form.natureza === n ? "#fff" : "#666" }}>
                        {n === "real" ? "Real" : "Previsão"}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Abas */}
              <div style={{ display: "flex", gap: 0 }}>
                {([
                  { id: "principal",  label: "Principal"  },
                  { id: "adicionais", label: "Adicionais" },
                ] as const).map(t => (
                  <button key={t.id} onClick={() => setModalTab(t.id)}
                    style={{ padding: "7px 20px", border: "none", cursor: "pointer", fontSize: 13, background: "transparent",
                      fontWeight: modalTab === t.id ? 700 : 400,
                      color: modalTab === t.id ? "#1A4870" : "#666",
                      borderBottom: modalTab === t.id ? "2px solid #1A4870" : "2px solid transparent" }}>
                    {t.label}
                  </button>
                ))}
              </div>
            </div>

            {/* ── Corpo das abas ── */}
            <div style={{ padding: "20px 24px", flex: 1, overflowY: "auto" as const }}>

              {/* ─── Aba Principal ─── */}
              {modalTab === "principal" && (
                <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>

                  {/* Hierarquia: Produtor → Fazenda → Safra → Ciclo → Talhão */}
                  <CascadeSelector
                    contaId={contaId}
                    fazendaIdFallback={fazendaId}
                    values={cascade}
                    onChange={next => {
                      setCascade(next);
                      setForm(p => ({ ...p, produtor_id: next.produtorId ?? "", ano_safra_id: next.anoSafraId ?? "", ciclo_id: next.cicloId ?? "", talhao_id: next.talhaoId ?? "" }));
                    }}
                  />

                  {/* Linha 1: Moeda | OG (2) | Data Emissão */}
                  <div style={{ display: "grid", gridTemplateColumns: "120px 1fr 1fr 140px", gap: 12 }}>
                    <div>
                      <label style={lbl}>Moeda</label>
                      <select style={inp} value={form.moeda} onChange={e => setForm(p => ({ ...p, moeda: e.target.value as Moeda, valorMask: "", sacasMask: "" }))}>
                        <option value="BRL">Real (R$)</option>
                        <option value="USD">Dólar (US$)</option>
                        <option value="barter">Barter</option>
                      </select>
                    </div>
                    <div style={{ gridColumn: "2 / 4" }}>
                      <label style={lbl}>Operação Gerencial <span style={{ color: "var(--text-3)", fontWeight: 400 }}>— classifica e vincula ao plano de contas</span></label>
                      <SelectBusca
                        value={form.operacao_gerencial_id}
                        onChange={id => {
                          const op = opGerenciais.find(o => o.id === id);
                          setForm(p => ({ ...p, operacao_gerencial_id: id, categoria: op ? derivarCategoriaReceita(op.classificacao ?? "") : p.categoria }));
                        }}
                        options={opGerenciais.map(o => ({ value: o.id, label: `${o.classificacao} — ${o.descricao}`, group: (o.classificacao ?? "").split(".").slice(0, 3).join(".") }))}
                        placeholder="— Selecionar operação —"
                        style={inp}
                      />
                    </div>
                    <div>
                      <label style={lbl}>Data Emissão</label>
                      <input style={inp} type="date" value={form.data_emissao} onChange={e => setForm(p => ({ ...p, data_emissao: e.target.value }))} />
                    </div>
                  </div>

                  {/* Badge OG */}
                  {form.operacao_gerencial_id && (() => {
                    const op = opGerenciais.find(o => o.id === form.operacao_gerencial_id);
                    if (!op?.conta_debito && !op?.conta_credito) return null;
                    return (
                      <div style={{ padding: "5px 12px", background: "#F0F7FF", borderRadius: 7, border: "0.5px solid #C5DCF5", fontSize: 11, color: "#0B2D50", display: "flex", gap: 20 }}>
                        <span>Débito: <strong>{op.conta_debito || "—"}</strong></span>
                        <span>Crédito: <strong>{op.conta_credito || "—"}</strong></span>
                      </div>
                    );
                  })()}

                  {/* Linha 2: Cliente (2) | Nº Documento | Série | Tipo Doc LCDPR */}
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 140px 90px 160px", gap: 12 }}>
                    <div style={{ gridColumn: "span 2" }}>
                      <label style={lbl}>Cliente / Comprador</label>
                      <select style={inp} value={form.pessoa_id} onChange={e => setForm(p => ({ ...p, pessoa_id: e.target.value }))}>
                        <option value="">— Selecionar do cadastro —</option>
                        {[...pessoas].sort((a, b) => {
                          if (a.cliente && !b.cliente) return -1;
                          if (!a.cliente && b.cliente) return 1;
                          return a.nome.localeCompare(b.nome, "pt-BR");
                        }).map(p => (
                          <option key={p.id} value={p.id}>{p.nome}{p.fornecedor && p.cliente ? " (Cli/Forn)" : p.fornecedor ? " (Fornecedor)" : ""}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label style={lbl}>Nº Documento</label>
                      <input style={inp} placeholder="Ex: 001234" value={form.numero_documento} onChange={e => setForm(p => ({ ...p, numero_documento: e.target.value }))} />
                    </div>
                    <div>
                      <label style={lbl}>Série</label>
                      <input style={inp} placeholder="1" value={form.serie} onChange={e => setForm(p => ({ ...p, serie: e.target.value }))} />
                    </div>
                    <div>
                      <label style={lbl}>Tipo Doc LCDPR</label>
                      <select style={inp} value={form.tipo_documento_lcdpr} onChange={e => setForm(p => ({ ...p, tipo_documento_lcdpr: e.target.value as typeof form.tipo_documento_lcdpr }))}>
                        <option value="RECIBO">Recibo</option><option value="NF">Nota Fiscal</option>
                        <option value="DUPLICATA">Duplicata</option><option value="CHEQUE">Cheque</option>
                        <option value="PIX">PIX</option><option value="TED">TED</option><option value="OUTROS">Outros</option>
                      </select>
                    </div>
                  </div>

                  {/* Linha 3: Descrição (2) | Vencimento | Forma Receb | Conta Receb */}
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 160px 160px 1fr", gap: 12 }}>
                    <div style={{ gridColumn: "span 2" }}>
                      <label style={lbl}>Descrição {!form.pessoa_id && <span style={{ color: "#E24B4A" }}>*</span>}</label>
                      <input style={inp} placeholder="Ex: Venda de soja — NF-e 001.430" value={form.descricao} onChange={e => setForm(p => ({ ...p, descricao: e.target.value }))} />
                    </div>
                    <div>
                      <label style={lbl}>Vencimento *</label>
                      <input style={inp} type="date" value={form.vencimento} onChange={e => setForm(p => ({ ...p, vencimento: e.target.value }))} />
                    </div>
                    <div>
                      <label style={lbl}>Forma de Recebimento</label>
                      <select style={inp} value={form.forma_recebimento} onChange={e => setForm(p => ({ ...p, forma_recebimento: e.target.value }))}>
                        {FORMAS_RECEBIMENTO.map(f => <option key={f}>{f}</option>)}
                      </select>
                    </div>
                    <div>
                      <label style={lbl}>Conta de Recebimento</label>
                      <select style={inp} value={form.conta_recebimento} onChange={e => setForm(p => ({ ...p, conta_recebimento: e.target.value }))}>
                        <option value="">— Selecionar —</option>
                        {contas.map(c => {
                          const label = c.nome || `${c.banco ?? ""} ${c.agencia ? `Ag.${c.agencia}` : ""} ${c.conta ? `C/C ${c.conta}` : ""}`.trim();
                          return <option key={c.id} value={label}>{label}</option>;
                        })}
                        {contas.length === 0 && <option disabled>Cadastre contas em Cadastros</option>}
                      </select>
                    </div>
                  </div>

                  {/* Linha 4: Valor por moeda */}
                  {form.moeda === "BRL" && (
                    <div style={{ display: "grid", gridTemplateColumns: "200px 1fr", gap: 12 }}>
                      <div>
                        <label style={lbl}>Valor (R$) *</label>
                        <input style={{ ...inp, fontWeight: 600 }} type="text" inputMode="numeric" placeholder="0,00" value={form.valorMask} onChange={e => setForm(p => ({ ...p, valorMask: aplicarMascara(e.target.value) }))} />
                      </div>
                    </div>
                  )}
                  {form.moeda === "USD" && (
                    <div style={{ display: "grid", gridTemplateColumns: "200px 200px 1fr", gap: 12, alignItems: "end" }}>
                      <div>
                        <label style={lbl}>Valor (US$) *</label>
                        <input style={inp} type="text" inputMode="numeric" placeholder="0,00" value={form.valorMask} onChange={e => setForm(p => ({ ...p, valorMask: aplicarMascara(e.target.value) }))} />
                      </div>
                      <div>
                        <label style={lbl}>Cotação R$/US$</label>
                        <input style={inp} type="text" inputMode="numeric" placeholder="5,12" value={form.cotacaoMask} onChange={e => setForm(p => ({ ...p, cotacaoMask: aplicarMascara(e.target.value) }))} />
                      </div>
                      {form.valorMask && form.cotacaoMask && (
                        <div style={{ background: "#FEF3E2", borderRadius: 8, padding: "8px 12px", fontSize: 12, color: "#7A4300" }}>
                          Equivalente: <strong>{fmtBRL(desmascarar(form.valorMask) * desmascarar(form.cotacaoMask))}</strong>
                        </div>
                      )}
                    </div>
                  )}
                  {form.moeda === "barter" && (
                    <div style={{ display: "grid", gridTemplateColumns: "160px 160px 200px 1fr", gap: 12 }}>
                      <div>
                        <label style={lbl}>Quantidade (sacas) *</label>
                        <input style={inp} type="text" inputMode="numeric" placeholder="0" value={form.sacasMask} onChange={e => setForm(p => ({ ...p, sacasMask: e.target.value.replace(/\D/g, "") }))} />
                      </div>
                      <div>
                        <label style={lbl}>Cultura</label>
                        <select style={inp} value={form.culturaBarter} onChange={e => setForm(p => ({ ...p, culturaBarter: e.target.value }))}>
                          <option value="soja">Soja</option><option value="milho">Milho</option><option value="algodão">Algodão</option>
                        </select>
                      </div>
                      <div>
                        <label style={lbl}>Preço referência (R$/sc)</label>
                        <input style={inp} type="text" inputMode="numeric" placeholder="120,00" value={form.precoSacaMask} onChange={e => setForm(p => ({ ...p, precoSacaMask: aplicarMascara(e.target.value) }))} />
                      </div>
                    </div>
                  )}
                  {/* Condição de Recebimento */}
                  <div style={{ display: "grid", gridTemplateColumns: "auto auto 1fr", gap: 12, alignItems: "end" }}>
                    <div>
                      <label style={lbl}>Condição de Recebimento</label>
                      <div style={{ display: "flex", border: "0.5px solid #D4DCE8", borderRadius: 8, overflow: "hidden" }}>
                        {([false, true] as const).map((v, idx) => (
                          <button key={String(v)} type="button"
                            onClick={() => setForm(p => ({ ...p, parcelar: v }))}
                            style={{
                              padding: "7px 14px", fontSize: 12, fontWeight: form.parcelar === v ? 600 : 400,
                              cursor: "pointer", border: "none",
                              borderRight: idx === 0 ? "0.5px solid #D4DCE8" : "none",
                              background: form.parcelar === v ? "#1A4870" : "var(--bg-card)",
                              color: form.parcelar === v ? "#fff" : "var(--text-2)",
                              whiteSpace: "nowrap",
                            }}>
                            {v ? "Recorrência" : "Único"}
                          </button>
                        ))}
                      </div>
                    </div>
                    {form.parcelar && (
                      <>
                        <div>
                          <label style={lbl}>Nº de repetições</label>
                          <InputNumerico style={{ ...inp, width: 80 }} decimais={0} min="2" max="120" value={form.totalParcelas} onChange={v => setForm(p => ({ ...p, totalParcelas: v }))} />
                        </div>
                        <div>
                          <label style={lbl}>Frequência</label>
                          <select style={inp} value={form.intervaloMeses} onChange={e => setForm(p => ({ ...p, intervaloMeses: e.target.value }))}>
                            <option value="1">Mensal</option>
                            <option value="2">Bimestral</option>
                            <option value="3">Trimestral</option>
                            <option value="6">Semestral</option>
                            <option value="12">Anual</option>
                          </select>
                        </div>
                      </>
                    )}
                  </div>

                  {/* Preview recorrência */}
                  {form.parcelar && (() => {
                    const qtdRec  = Math.max(2, Number(form.totalParcelas) || 2);
                    const freqRec = Math.max(1, Number(form.intervaloMeses) || 1);
                    const freqLabel = ({ "1": "mensal", "2": "bimestral", "3": "trimestral", "6": "semestral", "12": "anual" } as Record<string, string>)[form.intervaloMeses] ?? "mensal";
                    return (
                      <div>
                        <div style={{ background: "#FBF3E0", border: "0.5px solid #C9921B", borderRadius: 8, padding: "10px 14px", marginBottom: 12, fontSize: 12, color: "#7A5200" }}>
                          O mesmo valor é recebido <strong>{qtdRec}×</strong> com frequência <strong>{freqLabel}</strong>. Ideal para arrendamentos e receitas fixas.
                          {valParcela > 0 && <span style={{ float: "right", fontWeight: 700 }}>Total: {fmtBRL(valParcela * qtdRec)}</span>}
                        </div>
                        {form.vencimento && valParcela > 0 && (
                          <div style={{ overflowX: "auto", maxHeight: 220, overflowY: "auto", borderRadius: 8, border: "0.5px solid #D4DCE8" }}>
                            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                              <thead style={{ position: "sticky", top: 0, background: "#F3F6F9" }}>
                                <tr>
                                  {["#", "Vencimento", "Valor"].map((h, i) => (
                                    <th key={i} style={{ padding: "6px 10px", textAlign: i === 2 ? "right" : i === 0 ? "center" : "left", fontSize: 11, fontWeight: 600, color: "var(--text-2)", borderBottom: "0.5px solid #D4DCE8" }}>{h}</th>
                                  ))}
                                </tr>
                              </thead>
                              <tbody>
                                {Array.from({ length: qtdRec }, (_, i) => {
                                  const d = new Date(form.vencimento + "T12:00:00");
                                  d.setMonth(d.getMonth() + i * freqRec);
                                  return (
                                    <tr key={i} style={{ borderBottom: i < qtdRec - 1 ? "0.5px solid #DEE5EE" : "none" }}>
                                      <td style={{ padding: "4px 10px", textAlign: "center", color: "var(--text-3)", fontSize: 11, width: 50 }}>{i + 1}/{qtdRec}</td>
                                      <td style={{ padding: "4px 10px", fontSize: 11 }}>{fmtData(d.toISOString().split("T")[0])}</td>
                                      <td style={{ padding: "4px 10px", textAlign: "right", fontSize: 11, color: "#16A34A", fontWeight: 600 }}>{fmtBRL(valParcela)}</td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        )}
                        {!form.vencimento && (
                          <div style={{ fontSize: 11, color: "var(--text-3)", padding: "10px 14px", background: "var(--bg-page)", borderRadius: 7 }}>
                            Defina o 1º Vencimento para visualizar as datas.
                          </div>
                        )}
                      </div>
                    );
                  })()}

                  {/* Centro de Custo */}
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                    <div>
                      <label style={lbl}>Centro de Custo</label>
                      <input style={inp} placeholder="Ex: Receita Soja 26 — Fazenda Boa Vista" value={form.centro_custo} onChange={e => setForm(p => ({ ...p, centro_custo: e.target.value }))} />
                    </div>
                  </div>
                </div>
              )}

              {/* ─── Aba Adicionais ─── */}
              {modalTab === "adicionais" && (
                <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
                    <div>
                      <label style={lbl}>Meses Diferido</label>
                      <InputNumerico style={inp} decimais={0} min="0" placeholder="0" value={form.meses_diferido} onChange={v => setForm(p => ({ ...p, meses_diferido: v }))} />
                    </div>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                    <div>
                      <label style={lbl}>Chave XML / NF-e</label>
                      <input style={inp} placeholder="Opcional" value={form.chave_xml} onChange={e => setForm(p => ({ ...p, chave_xml: e.target.value }))} />
                    </div>
                    <div>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 4 }}>
                        <label style={lbl}>Observação</label>
                        <span style={{ fontSize: 11, color: form.obs.length > 90 ? "#E24B4A" : "var(--text-muted)" }}>{form.obs.length}/100</span>
                      </div>
                      <input style={inp} placeholder="Opcional" maxLength={100} value={form.obs} onChange={e => setForm(p => ({ ...p, obs: e.target.value }))} />
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* ── Rodapé ── */}
            <div style={{ padding: "12px 24px", borderTop: "0.5px solid #DEE5EE", display: "flex", gap: 8, justifyContent: "flex-end", alignItems: "center", background: "#FAFBFC", borderRadius: "0 0 12px 12px" }}>
              {/* Botão Efetivar — visível só ao editar uma previsão */}
              {editandoId && form.natureza === "previsao" && (
                <button
                  onClick={() => setForm(p => ({ ...p, natureza: "real" }))}
                  style={{ padding: "8px 16px", background: "#16A34A", color: "#fff", border: "none", borderRadius: 8, fontWeight: 600, cursor: "pointer", fontSize: 13, display: "flex", alignItems: "center", gap: 6 }}
                  title="Muda para Real e abre para ajuste antes de salvar"
                >
                  ⚡ Efetivar
                </button>
              )}
              <button onClick={fecharModal} style={{ padding: "8px 20px", border: "0.5px solid #D4DCE8", borderRadius: 8, background: "transparent", cursor: "pointer", fontSize: 13 }}>Cancelar</button>
              <button onClick={adicionarLancamento} disabled={disabled}
                style={{ padding: "8px 20px", background: disabled ? "var(--text-muted)" : "#1A4870", color: "#fff", border: "none", borderRadius: 8, fontWeight: 600, cursor: "pointer", fontSize: 13 }}>
                {salvando ? "Salvando…" : editandoId ? "✓ Salvar alterações" : form.parcelar && totalParcDisplay > 1 ? `◈ Criar ${totalParcDisplay} repetições` : "◈ Salvar"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Menu de colunas configuráveis */}
      {menuColunas && (
        <ContextMenuColunas
          x={menuColunas.x}
          y={menuColunas.y}
          colunas={COLS_CR}
          visiveis={visCols}
          onToggle={toggleCol}
          onClose={() => setMenuColunas(null)}
        />
      )}
    </div>
  );
}

// ── th helper ───────────────────────────────────────────────
function thS(_minW: number, align: "left" | "center" | "right" = "left"): React.CSSProperties {
  return {
    padding: "6px 8px",
    textAlign: align,
    fontSize: 10,
    fontWeight: 700,
    color: "var(--text-2)",
    borderBottom: "0.5px solid var(--border-table)",
    whiteSpace: "nowrap",
    textTransform: "uppercase",
    letterSpacing: ".04em",
  };
}
