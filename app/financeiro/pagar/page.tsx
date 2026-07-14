"use client";
import { useState, useEffect, useMemo, Suspense, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import TopNav from "../../../components/TopNav";
import InputMonetario from "../../../components/InputMonetario";
import InputNumerico from "../../../components/InputNumerico";
import { useAuth } from "../../../components/AuthProvider";
import CascadeSelector, { type CascadeValues } from "../../../components/CascadeSelector";
import ContextMenuColunas from "../../../components/ContextMenuColunas";
import { useColunasGrid } from "../../../hooks/useColunasGrid";
import { useColumnResize, ResizeHandle } from "../../../hooks/useColumnResize";
import SelectBusca from "../../../components/SelectBusca";
import { listarLancamentosContaPeriodo, criarLancamento, criarParcelamento, baixarLancamento, reabrirLancamento, reabrirLancamentos, criarPagamentoLote, listarAnosSafra, listarPessoasDaConta, listarProdutoresDaConta, listarProdutoresViaFazenda, listarOperacoesGerenciaisAtivasDaConta, excluirLancamento, listarCentrosCustoGeral, listarTalhoes, listarFuncionarios, listarContasBancariasDaConta } from "../../../lib/db";
import type { Lancamento, AnoSafra, Produtor, Pessoa, Ciclo, OperacaoGerencial, CentroCusto, Talhao, Funcionario, NfEntrada } from "../../../lib/supabase";
import { supabase } from "../../../lib/supabase";

interface ContaBancariaMin { id: string; nome: string; banco?: string; agencia?: string; conta?: string; }

// ── Tipos ────────────────────────────────────────────────────
type Moeda  = "BRL" | "USD" | "barter";
type Filtro = "aberto" | "vencido" | "vencendo" | "baixado" | "barter" | "previsao" | "todos";

// ── Constantes ────────────────────────────────────────────────
const TODAY       = new Date().toISOString().split("T")[0];
const COTACAO_USD = 5.12;

const FORMAS_PAGAMENTO = ["PIX", "TED", "DOC", "Boleto", "Dinheiro", "Cheque", "Cartão de Crédito", "Débito Automático", "Outros"];

const CATS_CP = [
  "Insumos — Sementes", "Insumos — Fertilizantes", "Insumos — Defensivos",
  "Insumos — Inoculantes", "Combustível — Compra para Estoque", "Combustível — Consumo Direto",
  "Serviços Agrícolas", "Fretes e Transportes", "Arrendamento de Terra",
  "Manutenção de Máquinas", "Impostos", "Juros e IOF", "Pagamento de Custeio",
  "Pagamento de Financiamento", "Pagamento de Empréstimo", "Prêmio de Seguro",
  "Consórcio — A Contemplar", "Consórcio — Contemplado", "Despesas Administrativas", "Outros",
];

// Deriva a categoria legada a partir do código da Operação Gerencial
function derivarCategoriaDespesa(classificacao: string): string {
  const c = classificacao ?? "";
  if (c.startsWith("2.01.01.01"))    return "Insumos";
  if (c.startsWith("2.01.01.02.099")) return "Combustível — Consumo Direto";
  if (c.startsWith("2.01.01.02"))    return "Combustível — Compra para Estoque";
  if (c.startsWith("2.01.01.03.002")) return "Manutenção de Veículos";
  if (c.startsWith("2.01.01.03"))    return "Manutenção de Máquinas";
  if (c.startsWith("2.01.01.04.001")) return "Arrendamento de Terra";
  if (c.startsWith("2.01.01.04"))    return "Serviços Agrícolas";
  if (c.startsWith("2.01.01.05"))    return "Serviços Agrícolas";
  if (c.startsWith("2.01.01.07"))    return "Fretes e Transportes";
  if (c.startsWith("2.01.01.08"))    return "Serviços Agrícolas";
  if (c.startsWith("2.01.01.10"))    return "Mão de Obra";
  if (c.startsWith("2.02.01.04"))    return "Impostos";
  if (c.startsWith("2.02.01"))       return "Despesas Administrativas";
  if (c.startsWith("2.03.01.02"))    return "Pagamento de Custeio";
  if (c.startsWith("2.03.01.01"))    return "Pagamento de Financiamento";
  if (c.startsWith("2.03.01.03"))    return "Juros e IOF";
  if (c.startsWith("2.03.02.03"))    return "Prêmio de Seguro";
  if (c.startsWith("2.03.02"))       return "Despesas Administrativas";
  if (c.startsWith("1.01.01.05"))    return "Impostos";
  return "Outros";
}

// ── Helpers ───────────────────────────────────────────────────
const fmtBRL   = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fmtUSD   = (v: number) => `US$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`;
const fmtData  = (iso?: string | null) => { if (!iso) return "—"; const [y, m, d] = iso.split("-"); return `${d}/${m}/${y}`; };

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

// Extrai somente o nome do fornecedor, removendo prefixo "Arrendamento Soja/Milho — "
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
  parcial:   { cor: "#C9921B", title: "Parcial"     },
  baixado:   { cor: "#16A34A", title: "Pago"        },
}[s] ?? { cor: "var(--text-3)", title: s });

// ── Estilos ───────────────────────────────────────────────────
const inp: React.CSSProperties = { width: "100%", padding: "8px 10px", border: "0.5px solid var(--border)", borderRadius: 8, fontSize: 13, background: "var(--bg-input)", boxSizing: "border-box", outline: "none", color: "var(--text-1)" };
const inpF: React.CSSProperties = { width: "100%", padding: "4px 7px", border: "0.5px solid var(--border)", borderRadius: 6, fontSize: 11, background: "var(--border-row)", boxSizing: "border-box", outline: "none", color: "var(--text-2)" };
const lbl: React.CSSProperties = { fontSize: 11, color: "var(--text-2)", marginBottom: 4, display: "block" };

// ═══════════════════════════════════════════════════════════════
function ContasPagarInner() {
  const { fazendaId, contaId } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [cascade, setCascade] = useState<Partial<CascadeValues>>({});
  const fid = cascade.fazendaId ?? fazendaId ?? "";

  const [lancamentos,   setLancamentos]   = useState<Lancamento[]>([]);
  const [anosSafra,     setAnosSafra]     = useState<AnoSafra[]>([]);
  const [produtores,    setProdutores]    = useState<Produtor[]>([]);
  const [pessoas,       setPessoas]       = useState<Pessoa[]>([]);
  const [ciclos,        setCiclos]        = useState<Ciclo[]>([]);
  const [talhoes,       setTalhoes]       = useState<Talhao[]>([]);
  const [funcionarios,  setFuncionarios]  = useState<Funcionario[]>([]);
  const [contas,        setContas]        = useState<ContaBancariaMin[]>([]);
  const [opGerenciais,  setOpGerenciais]  = useState<OperacaoGerencial[]>([]);
  const [centrosCusto,  setCentrosCusto]  = useState<CentroCusto[]>([]);
  const [opGerBusca,    setOpGerBusca]    = useState("");
  const [arquivoNF,     setArquivoNF]     = useState<File | null>(null);
  const [errosForm,     setErrosForm]     = useState<string[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [erro,     setErro]     = useState<string | null>(null);
  const [filtro,   setFiltro]   = useState<Filtro>(() => {
    const f = searchParams.get("filtro") as Filtro | null;
    const valid: Filtro[] = ["aberto","vencido","vencendo","baixado","barter","previsao","todos"];
    return f && valid.includes(f) ? f : "aberto";
  });

  // ── Janela padrão: 2 anos atrás até 12 meses à frente (cobre vencidos antigos) ────
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
  const [alertaNF, setAlertaNF] = useState<Lancamento | null>(null);
  const [nfsVinculo, setNfsVinculo] = useState<NfEntrada[]>([]);
  const [nfsVinculoLoading, setNfsVinculoLoading] = useState(false);
  const [nfVinculoBusca, setNfVinculoBusca] = useState("");
  const [nfVinculoSelecionada, setNfVinculoSelecionada] = useState<NfEntrada | null>(null);

  useEffect(() => {
    if (!alertaNF || !fid) return;
    setNfVinculoSelecionada(null);
    setNfVinculoBusca("");
    setNfsVinculoLoading(true);
    supabase.from("nf_entradas")
      .select("id,numero,serie,emitente_nome,emitente_cnpj,valor_total,data_emissao,data_vencimento_cp,status,tipo_entrada,origem")
      .eq("fazenda_id", fid)
      .in("status", ["pendente"])
      .order("data_emissao", { ascending: false })
      .limit(100)
      .then(({ data }) => {
        setNfsVinculo((data ?? []) as NfEntrada[]);
        setNfsVinculoLoading(false);
      });
  }, [alertaNF, fid]);

  // ── Edição: reutiliza o modal de Nova CP com editandoId marcado ──
  const [editandoId, setEditandoId] = useState<string | null>(null);

  function fecharModal() {
    setModalNovo(false);
    setEditandoId(null);
    setParcelas([]);
    setErrosForm([]);
    setOpGerBusca("");
    setCascade({});
    setArquivoNF(null);
  }

  function abrirEditar(l: Lancamento) {
    setEditandoId(l.id);
    setModalTab("principal");
    setErrosForm([]);
    setOpGerBusca("");
    setArquivoNF(null);
    setParcelas([]);
    setForm({
      moeda:                 (l.moeda as Moeda) ?? "BRL",
      pessoa_id:             l.pessoa_id             ?? "",
      descricao:             l.descricao             ?? "",
      categoria:             l.categoria             ?? CATS_CP[0],
      vencimento:            l.data_vencimento       ?? "",
      valorMask:             l.valor?.toLocaleString("pt-BR", { minimumFractionDigits: 2 }) ?? "",
      cotacaoMask:           l.cotacao_usd?.toLocaleString("pt-BR", { minimumFractionDigits: 2 }) ?? "5,12",
      sacasMask:             l.sacas?.toString()     ?? "",
      culturaBarter:         l.cultura_barter        ?? "soja",
      precoSacaMask:         l.preco_saca_barter?.toLocaleString("pt-BR", { minimumFractionDigits: 2 }) ?? "120,00",
      obs:                   l.observacao            ?? "",
      condicao:              "avista",
      qtdParcelas:           "2",
      frequencia:            "1",
      tipo_documento_lcdpr:  (l.tipo_documento_lcdpr as typeof form.tipo_documento_lcdpr) ?? "RECIBO",
      juros_pct:             l.juros_pct             ?? 0,
      multa_pct:             l.multa_pct             ?? 0,
      desconto_pct:          l.desconto_pontualidade_pct ?? 0,
      meses_diferido:        "0",
      chave_xml:             l.chave_xml             ?? "",
      centro_custo:          l.centro_custo          ?? "",
      ano_safra_id:          l.ano_safra_id          ?? "",
      produtor_id:           l.produtor_id           ?? "",
      ciclo_id:              l.ciclo_id              ?? "",
      talhao_id:             l.talhao_id             ?? "",
      operacao_gerencial_id: l.operacao_gerencial_id ?? "",
      natureza:              (l.natureza as "real" | "previsao") ?? "real",
      forma_pagamento:       l.forma_pagamento       ?? "PIX",
      conta_pagamento:       l.conta_bancaria        ?? "",
      data_emissao:          l.data_lancamento       ?? TODAY,
      numero_documento:      "",
      serie:                 "",
      funcionario_id:        l.funcionario_id        ?? "",
      tipo_mao_obra:         l.tipo_mao_obra         ?? "",
      unidade_mao_obra:      l.unidade_mao_obra      ?? "Dia",
      quantidade_mao_obra:   l.quantidade_mao_obra?.toString() ?? "",
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
    salvar_class: false,
    ano_safra_id: "", ciclo_id: "",
  });
  const [form, setForm] = useState({
    moeda: "BRL" as Moeda,
    pessoa_id: "", descricao: "", categoria: CATS_CP[0], vencimento: "",
    valorMask: "", cotacaoMask: "5,12",
    sacasMask: "", culturaBarter: "soja", precoSacaMask: "120,00", obs: "",
    condicao: "avista" as "avista" | "prazo" | "recorrencia",
    qtdParcelas: "2", frequencia: "1",
    tipo_documento_lcdpr: "RECIBO" as NonNullable<Lancamento["tipo_documento_lcdpr"]>,
    juros_pct: 0, multa_pct: 0, desconto_pct: 0, meses_diferido: "0",
    chave_xml: "", centro_custo: "",
    ano_safra_id: "", produtor_id: "", ciclo_id: "", talhao_id: "",
    operacao_gerencial_id: "",
    natureza: "real" as "real" | "previsao",
    forma_pagamento: "PIX",
    conta_pagamento: "",
    data_emissao: TODAY,
    numero_documento: "",
    serie: "",
    // Mão de Obra
    funcionario_id: "", tipo_mao_obra: "", unidade_mao_obra: "Dia", quantidade_mao_obra: "",
  });

  // grid editável de parcelas (prazo)
  type ParcelaGrid = { data: string; valorMask: string };
  const [parcelas, setParcelas] = useState<ParcelaGrid[]>([]);

  // ── Filtros de coluna ─────────────────────────────────────
  const [menuColunas, setMenuColunas] = useState<{ x: number; y: number } | null>(null);
  const COLS_CP = useMemo(() => [
    { key: "fornecedor", label: "Fornecedor / Cliente", fixo: true },
    { key: "operacao",   label: "Operação" },
    { key: "safra",      label: "Safra" },
    { key: "ciclo",      label: "Ciclo" },
    { key: "vencimento", label: "Vencimento", fixo: true },
    { key: "valor",      label: "Valor", fixo: true },
    { key: "dt_pgto",    label: "Dt. Pgto" },
    { key: "valor_pago", label: "Valor Pago" },
    { key: "moeda",      label: "Moeda" },
    { key: "conta",      label: "Conta" },
    { key: "produtor",   label: "Produtor" },
    { key: "origem",     label: "Origem" },
    { key: "obs",        label: "Observação" },
  ], []);
  const { col, toggle: toggleCol, visiveis: visCols } = useColunasGrid("cp_colunas", COLS_CP);
  const { w: cw, startResize } = useColumnResize({
    fornecedor: 280, operacao: 150, safra: 100, ciclo: 180,
    vencimento: 90, valor: 110, dt_pgto: 85, valor_pago: 100,
    moeda: 65, conta: 110, produtor: 110, origem: 90, obs: 160,
  });
  const [fFornecedor, setFFornecedor] = useState("");
  const [fOperacao,   setFOperacao]   = useState("");
  const [fSafra,      setFSafra]      = useState("");
  const [fVencDe,     setFVencDe]     = useState(() => searchParams.get("vencDe") ?? "");
  const [fVencAte,    setFVencAte]    = useState(() => searchParams.get("vencAte") ?? "");
  const [fMoedaOrig,  setFMoedaOrig]  = useState(() => searchParams.get("moeda") ?? "");
  const [fConta,      setFConta]      = useState("");
  const [fProdutor,   setFProdutor]   = useState("");
  const [fObs,        setFObs]        = useState("");

  // Gera/atualiza grid quando os parâmetros de prazo mudam
  const gerarParcelas = (vencimento: string, qtd: number, freqMeses: number, valorTotal: number) => {
    if (!vencimento || qtd < 2) { setParcelas([]); return; }
    const valorParcela = valorTotal > 0 ? valorTotal / qtd : 0;
    const novas: ParcelaGrid[] = Array.from({ length: qtd }, (_, i) => {
      const d = new Date(vencimento + "T12:00:00");
      d.setMonth(d.getMonth() + i * freqMeses);
      return { data: d.toISOString().split("T")[0], valorMask: numParaMascara(valorParcela) };
    });
    setParcelas(novas);
  };

  // ── Carga ──────────────────────────────────────────────────

  useEffect(() => {
    if (contaId || fazendaId) {
      carregar();
    }
  }, [contaId, fazendaId, periodoInicio, periodoFim]);

  const carregarOps = () => {
    if (!contaId && !fazendaId) return;
    listarOperacoesGerenciaisAtivasDaConta({ tipo: "despesa", permite: "cp_cr" }, fazendaId).then(ops =>
      setOpGerenciais(ops.filter(o => {
        const cls = o.classificacao ?? "";
        if (cls.startsWith("3.") || cls.startsWith("4.")) return false;
        if (o.gerar_financeiro === false) return false;
        return true;
      }))
    ).catch(() => {});
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
      listarCentrosCustoGeral(fazendaId).then(setCentrosCusto).catch(() => {});
    }
  }, [contaId, fazendaId]);

  // Recarrega ciclos e talhões quando a fazenda selecionada no form muda
  useEffect(() => {
    if (!fid) return;
    supabase.from("ciclos").select("id, descricao, cultura, ano_safra_id, fazenda_id").eq("fazenda_id", fid).order("created_at", { ascending: false }).then(({ data }) => setCiclos((data ?? []) as Ciclo[]));
    listarTalhoes(fid).then(setTalhoes).catch(() => {});
    listarFuncionarios(fid).then(setFuncionarios).catch(() => {});
  }, [fid]);

  async function carregar() {
    setLoading(true);
    setErro(null);
    try {
      const dados = await listarLancamentosContaPeriodo(contaId, periodoInicio, periodoFim, "pagar", fazendaId);
      setLancamentos(dados);
    } catch (e: unknown) {
      setErro(e instanceof Error ? e.message : "Erro ao carregar");
    } finally {
      setLoading(false);
    }
  }

  // ── Confirmar previsão → real ──────────────────────────────
  async function confirmarPrevisao(l: Lancamento) {
    if (!confirm(`Confirmar "${l.descricao}" como Conta a Pagar real?`)) return;
    await supabase.from("lancamentos").update({ natureza: "real" }).eq("id", l.id);
    await carregar();
  }

  // ── Status efetivo: corrige registros em_aberto com data passada que nunca tiveram status atualizado ──
  const statusEfetivo = (l: Lancamento): string => {
    if (l.status === "baixado" || l.status === "parcial") return l.status;
    if (l.natureza === "previsao") return l.status;
    const venc = l.data_vencimento ?? "";
    if (venc && venc < TODAY) return "vencido";
    if (venc && venc === TODAY) return "vencendo";
    return l.status;  // em_aberto futuro ou qualquer outro
  };

  // ── Métricas ───────────────────────────────────────────────

  const lancOper     = lancamentos.filter(l => l.moeda !== "barter" && (l.natureza ?? "real") === "real");
  const totalAberto  = lancOper.filter(l => statusEfetivo(l) !== "baixado").reduce((a, l) => a + paraBRL(l), 0);
  const qAberto      = lancOper.filter(l => statusEfetivo(l) !== "baixado").length;
  const qVencido     = lancamentos.filter(l => statusEfetivo(l) === "vencido").length;
  const qVencendo    = lancamentos.filter(l => statusEfetivo(l) === "vencendo").length;
  const mesAtual     = TODAY.slice(0, 7);
  const pagosNoMes   = lancamentos.filter(l => l.status === "baixado" && (l.data_baixa ?? "").startsWith(mesAtual))
                         .reduce((a, l) => a + (l.valor_pago ?? paraBRL(l)), 0);

  // Mapa id → descrição da OG para exibição rápida no grid
  const ogMap = useMemo(() => new Map(opGerenciais.map(o => [o.id, o.descricao])), [opGerenciais]);

  // ── Filtragem e ordenação ──────────────────────────────────

  const filtradosBase = useMemo(() => {
    let arr = lancamentos.filter(l => {
      const isReal = (l.natureza ?? "real") === "real";
      const sEfet  = statusEfetivo(l);
      if (filtro === "aberto")   return isReal && sEfet !== "baixado" && l.moeda !== "barter";
      if (filtro === "vencido")  return isReal && (sEfet === "vencido" || sEfet === "vencendo");
      if (filtro === "vencendo") return isReal && sEfet === "vencendo";
      if (filtro === "baixado")  return isReal && sEfet === "baixado";
      if (filtro === "barter")   return isReal && l.moeda === "barter";
      if (filtro === "previsao") return l.natureza === "previsao";
      return true;
    });
    // Ordenar por vencimento crescente
    arr = arr.sort((a, b) => (a.data_vencimento ?? "") < (b.data_vencimento ?? "") ? -1 : 1);
    return arr;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lancamentos, filtro, TODAY]);

  const filtrados = useMemo(() => {
    return filtradosBase.filter(l => {
      const prodLabel  = produtores.find(p => p.id === l.produtor_id)?.nome ?? "";
      if (fFornecedor && !l.descricao.toLowerCase().includes(fFornecedor.toLowerCase()))       return false;
      const ogDesc = l.operacao_gerencial_id ? (ogMap.get(l.operacao_gerencial_id) ?? l.categoria ?? "") : (l.categoria ?? "");
      if (fOperacao   && !ogDesc.toLowerCase().includes(fOperacao.toLowerCase()))               return false;
      if (fSafra      && l.ano_safra_id !== fSafra)                                            return false;
      if (fVencDe     && (l.data_vencimento ?? "") < fVencDe)                                  return false;
      if (fVencAte    && (l.data_vencimento ?? "") > fVencAte)                                  return false;
      if (fMoedaOrig  && l.moeda !== fMoedaOrig)                                               return false;
      const contaNomeRes = contas.find(c => c.id === l.conta_bancaria)?.nome ?? "";
      if (fConta      && !contaNomeRes.toLowerCase().includes(fConta.toLowerCase())) return false;
      if (fProdutor   && !prodLabel.toLowerCase().includes(fProdutor.toLowerCase()))            return false;
      if (fObs        && !(l.observacao ?? "").toLowerCase().includes(fObs.toLowerCase()))      return false;
      return true;
    });
  }, [filtradosBase, fFornecedor, fOperacao, fSafra, fVencDe, fVencAte, fMoedaOrig, fConta, fProdutor, fObs, anosSafra, produtores, ogMap]);

  // ── Baixar ─────────────────────────────────────────────────

  const abrirBaixa = (l: Lancamento) => {
    // Intercepta se não tem NF vinculada (exceto barter e lançamentos de arrendamento/financiamento)
    const categoriasSemNF = ["Arrendamento de Terra", "Pagamento de Custeio", "Pagamento de Financiamento", "Pagamento de Empréstimo", "Consórcio — A Contemplar", "Consórcio — Contemplado", "Impostos", "Juros e IOF", "Combustível — Consumo Direto"];
    const precisaNF = l.moeda !== "barter"
      && !l.nfe_numero
      && l.origem_lancamento !== "nf_entrada"   // CP originado de NF já tem vínculo implícito
      && !categoriasSemNF.includes(l.categoria ?? "");
    if (precisaNF) { setAlertaNF(l); return; }
    setModalBaixa(l);
    const saldoRestante = paraBRL(l) - (l.valor_pago ?? 0);
    setBaixa({
      valorMask: l.moeda === "barter" ? "" : numParaMascara(Math.max(0, saldoRestante)),
      data: TODAY,
      conta: l.conta_bancaria ?? "",
      obs: l.observacao ?? "",
      multa_pct: "", juros_pct: "", desconto_pct: "",
      pessoa_id: l.pessoa_id ?? "",
      operacao_gerencial_id: l.operacao_gerencial_id ?? "",
      og_busca: "",
      salvar_class: false,
      ano_safra_id: l.ano_safra_id ?? "",
      ciclo_id: l.ciclo_id ?? "",
    });
  };

  const confirmarBaixa = async () => {
    if (!modalBaixa) return;
    if (modalBaixa.moeda !== "barter" && !baixa.valorMask) return;
    if (modalBaixa.moeda !== "barter" && !baixa.conta) { alert("Selecione a conta bancária de pagamento."); return; }
    const valorPago = modalBaixa.moeda === "barter" ? 0 : desmascarar(baixa.valorMask);
    try {
      setSalvando(true);
      await baixarLancamento(
        modalBaixa.id, valorPago, baixa.data, modalBaixa.moeda === "barter" ? "" : baixa.conta,
        {
          pessoa_id:               baixa.pessoa_id || undefined,
          operacao_gerencial_id:   baixa.operacao_gerencial_id || undefined,
          ano_safra_id:            baixa.ano_safra_id || undefined,
          ciclo_id:                baixa.ciclo_id || undefined,
          observacao:              baixa.obs || undefined,
        }
      );
      // Salvar classificação automática para o fornecedor
      if (baixa.salvar_class && baixa.pessoa_id && baixa.operacao_gerencial_id) {
        await supabase.from("pessoas")
          .update({ og_padrao_id: baixa.operacao_gerencial_id })
          .eq("id", baixa.pessoa_id);
      }
      const novoTotalPago = (modalBaixa.valor_pago ?? 0) + valorPago;
      const valorOriginal = paraBRL(modalBaixa);
      const novoStatus = novoTotalPago >= valorOriginal - 0.01 ? "baixado" : "parcial";
      setLancamentos(prev => prev.map(l =>
        l.id !== modalBaixa.id ? l : {
          ...l, status: novoStatus as Lancamento["status"], data_baixa: baixa.data,
          valor_pago: novoTotalPago, conta_bancaria: baixa.conta,
          pessoa_id: baixa.pessoa_id || l.pessoa_id,
          operacao_gerencial_id: baixa.operacao_gerencial_id || l.operacao_gerencial_id,
        }
      ));
      setModalBaixa(null);
    } catch (e: unknown) {
      const msgBaixa = e instanceof Error ? e.message : (e as { message?: string })?.message ?? JSON.stringify(e);
      alert("Erro: " + msgBaixa);
    } finally {
      setSalvando(false);
    }
  };

  // ── Reabrir títulos ────────────────────────────────────────

  const reabrirUm = async (l: Lancamento) => {
    if (!confirm(`Reabrir "${l.descricao}"?\n\nO status voltará para em aberto e os dados de pagamento serão apagados.`)) return;
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
    if (!confirm(`Reabrir ${ids.length} título${ids.length > 1 ? "s" : ""} pago${ids.length > 1 ? "s" : ""}?\n\nOs dados de pagamento serão apagados.`)) return;
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

  const pagarEmLote = async () => {
    if (!fazendaId || itensLote.length === 0) return;
    setLoteSalvando(true); setLoteErro("");
    try {
      const itensPayload = itensLote.map(l => ({ lancamento_id: l.id, valor_pago: paraBRL(l) }));
      await criarPagamentoLote(fazendaId, "pagar", loteData, loteConta, loteDesc || `Borderô ${loteData} — ${itensLote.length} títulos`, itensPayload);
      setSelecionados(new Set());
      setModalLote(false);
      await carregar();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : (e as { message?: string })?.message ?? String(e);
      setLoteErro(msg || "Erro ao processar lote");
      console.error("pagarEmLote:", e);
    } finally {
      setLoteSalvando(false);
    }
  };

  // ── Novo lançamento ────────────────────────────────────────

  const adicionarLancamento = async () => {
    // Validação de campos obrigatórios
    const erros: string[] = [];
    if (!form.pessoa_id && !form.descricao.trim()) erros.push("Fornecedor ou Descrição é obrigatório (aba Principal).");
    if (!form.vencimento) erros.push("1º Vencimento é obrigatório (aba Principal).");
    if (form.moeda !== "barter" && !form.valorMask) erros.push("Valor é obrigatório (aba Principal).");
    if (form.moeda === "barter" && !form.sacasMask) erros.push("Quantidade de sacas é obrigatória (aba Principal).");
    if (!form.operacao_gerencial_id) erros.push("Operação Gerencial é obrigatória (aba Principal).");
    if (!editandoId && form.condicao === "prazo" && parcelas.length === 0) erros.push("Gere as parcelas antes de salvar.");
    if (!editandoId && form.condicao === "recorrencia" && !form.vencimento) erros.push("1º Vencimento é obrigatório para recorrência (aba Principal).");
    if (erros.length > 0) { setErrosForm(erros); return; }
    setErrosForm([]);

    const sacas      = Number(form.sacasMask);
    const precoSaca  = desmascarar(form.precoSacaMask);
    const valorFinal = form.moeda === "barter" ? sacas * precoSaca : desmascarar(form.valorMask);

    // Upload arquivo NF se selecionado
    let chaveXmlFinal = form.chave_xml || undefined;
    if (arquivoNF) {
      try {
        const ext = arquivoNF.name.split(".").pop() ?? "pdf";
        const path = `${fid}/nf-cp/${Date.now()}.${ext}`;
        const { data: upData } = await supabase.storage.from("arquivos").upload(path, arquivoNF, { upsert: true });
        if (upData) {
          const { data: urlData } = supabase.storage.from("arquivos").getPublicUrl(upData.path);
          chaveXmlFinal = urlData.publicUrl;
        }
      } catch (_e) { /* upload opcional — prossegue sem o arquivo */ }
    }

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
          conta_bancaria:        form.conta_pagamento      || null,
          juros_pct:             form.juros_pct     ? Number(form.juros_pct)   : null,
          multa_pct:             form.multa_pct     ? Number(form.multa_pct)   : null,
          desconto_pontualidade_pct: form.desconto_pct ? Number(form.desconto_pct) : null,
          chave_xml:             chaveXmlFinal ?? null,
          centro_custo:          form.centro_custo          || null,
          observacao:            form.obs                   || null,
          ano_safra_id:          form.ano_safra_id          || null,
          ciclo_id:              form.ciclo_id              || null,
          talhao_id:             form.talhao_id             || null,
          produtor_id:           form.produtor_id           || null,
          operacao_gerencial_id: form.operacao_gerencial_id || null,
          natureza:              form.natureza,
          forma_pagamento:       form.forma_pagamento       || null,
          ...(form.funcionario_id ? {
            funcionario_id:      form.funcionario_id,
            tipo_mao_obra:       form.tipo_mao_obra       || null,
            unidade_mao_obra:    form.unidade_mao_obra    || null,
            quantidade_mao_obra: form.quantidade_mao_obra ? Number(form.quantidade_mao_obra) : null,
          } : {}),
        };
        const { error } = await supabase.from("lancamentos").update(patch).eq("id", editandoId);
        if (error) { alert("Erro ao salvar: " + error.message); return; }
        setLancamentos(prev => prev.map(x =>
          x.id === editandoId ? { ...x, ...patch, data_vencimento: form.vencimento } as Lancamento : x
        ));
        fecharModal();
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : (e as { message?: string })?.message ?? JSON.stringify(e);
        alert("Erro ao salvar: " + msg);
      } finally {
        setSalvando(false);
      }
      return;
    }

    // ── MODO CRIAÇÃO: INSERT ────────────────────────────────────
    const base: Omit<Lancamento, "id" | "created_at" | "num_parcela" | "total_parcelas" | "agrupador"> = {
      fazenda_id:    fid!,
      tipo:          "pagar",
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
      conta_bancaria: form.conta_pagamento || undefined,
      juros_pct:     form.juros_pct     ? Number(form.juros_pct)   : undefined,
      multa_pct:     form.multa_pct     ? Number(form.multa_pct)   : undefined,
      desconto_pontualidade_pct: form.desconto_pct ? Number(form.desconto_pct) : undefined,
      chave_xml:     chaveXmlFinal,
      centro_custo:          form.centro_custo          || undefined,
      observacao:            form.obs                   || undefined,
      ano_safra_id:          form.ano_safra_id          || undefined,
      ciclo_id:              form.ciclo_id              || undefined,
      talhao_id:             form.talhao_id             || undefined,
      produtor_id:           form.produtor_id           || undefined,
      operacao_gerencial_id: form.operacao_gerencial_id || undefined,
      natureza:              form.natureza,
      ...(form.funcionario_id ? {
        funcionario_id:      form.funcionario_id,
        tipo_mao_obra:       form.tipo_mao_obra       || undefined,
        unidade_mao_obra:    form.unidade_mao_obra    || undefined,
        quantidade_mao_obra: form.quantidade_mao_obra ? Number(form.quantidade_mao_obra) : undefined,
      } : {}),
    };

    try {
      setSalvando(true);
      let criados: Lancamento[];
      if (form.condicao === "prazo" && parcelas.length > 0) {
        const agrupador = Date.now().toString(36);
        const total = parcelas.length;
        const arr: Lancamento[] = [];
        for (let i = 0; i < total; i++) {
          const l = await criarLancamento({
            ...base,
            data_vencimento: parcelas[i].data,
            valor: desmascarar(parcelas[i].valorMask),
            num_parcela: i + 1,
            total_parcelas: total,
            agrupador,
          });
          arr.push(l);
        }
        criados = arr;
      } else if (form.condicao === "prazo") {
        const qtd   = Math.max(2, Number(form.qtdParcelas) || 2);
        const freq  = Math.max(1, Number(form.frequencia) || 1);
        criados = await criarParcelamento(base, qtd, freq);
      } else if (form.condicao === "recorrencia") {
        const qtd   = Math.max(2, Number(form.qtdParcelas) || 2);
        const freq  = Math.max(1, Number(form.frequencia) || 1);
        // Recorrência: mesmo valor em cada entrada (não divide — criarParcelamento preserva base.valor)
        criados = await criarParcelamento(base, qtd, freq);
      } else {
        criados = [await criarLancamento(base)];
      }
      setLancamentos(prev => [...criados, ...prev]);
      fecharModal();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : (e as { message?: string })?.message ?? JSON.stringify(e);
      alert("Erro ao salvar: " + msg);
    } finally {
      setSalvando(false);
    }
  };

  const hasColFilter = fFornecedor || fOperacao || fSafra || fVencDe || fVencAte || fMoedaOrig || fConta || fProdutor || fObs;

  const limparFiltrosColunas = () => {
    setFFornecedor(""); setFOperacao(""); setFSafra(""); setFVencDe(""); setFVencAte("");
    setFMoedaOrig(""); setFConta(""); setFProdutor(""); setFObs("");
  };

  const disabled = salvando || (!form.pessoa_id && !form.descricao.trim()) || !form.vencimento
    || (form.moeda !== "barter" && !form.valorMask)
    || (form.moeda === "barter" && !form.sacasMask)
    || !form.operacao_gerencial_id;

  // ── Helpers de data relativa ────────────────────────────────
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

  // ── Render ─────────────────────────────────────────────────

  const totalVencido  = lancamentos.filter(l => statusEfetivo(l) === "vencido").reduce((a, l) => a + paraBRL(l), 0);
  const totalVencendo = lancamentos.filter(l => statusEfetivo(l) === "vencendo").reduce((a, l) => a + paraBRL(l), 0);

  const PAGE_CSS = `
    @keyframes cpFadeIn { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:translateY(0)} }
    .cp-row { transition: background .1s }
    .cp-row:hover { background: rgba(255,255,255,0.04) !important }
    .cp-tab { transition: background .12s, color .12s, border-color .12s }
    .cp-tab:hover { border-color: var(--border) !important }
    .cp-btn { transition: opacity .12s }
    .cp-btn:hover { opacity: .8 }
    input[type=date]::-webkit-calendar-picker-indicator { filter: invert(0.6) }
  `;

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh", background: "var(--bg-page)", fontFamily: "system-ui, sans-serif", fontSize: 13 }}>
      {/* eslint-disable-next-line react/no-danger */}
      <style dangerouslySetInnerHTML={{ __html: PAGE_CSS }} />
      <TopNav />
      <main style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>

        {/* ═══ HEADER ═══ */}
        <header style={{ background: "var(--bg-header)", borderBottom: "0.5px solid var(--border)", padding: "16px 24px" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
            <div>
              <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: "var(--text-1)" }}>Contas a Pagar</h1>
              <p style={{ margin: "3px 0 0", fontSize: 11, color: "var(--text-3)" }}>Compromissos financeiros, parcelas e pagamentos</p>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 11, color: "var(--text-3)" }}>Período:</span>
              <input type="date" value={periodoInicio} onChange={e => setPeriodoInicio(e.target.value)}
                style={{ fontSize: 12, padding: "6px 10px", border: "0.5px solid var(--border)", borderRadius: 7, outline: "none", background: "var(--border-table)", color: "var(--text-2)" }} />
              <span style={{ fontSize: 11, color: "var(--text-muted)" }}>até</span>
              <input type="date" value={periodoFim} onChange={e => setPeriodoFim(e.target.value)}
                style={{ fontSize: 12, padding: "6px 10px", border: "0.5px solid var(--border)", borderRadius: 7, outline: "none", background: "var(--border-table)", color: "var(--text-2)" }} />
              <a href="/compras/nf" className="cp-btn"
                style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "8px 14px", border: "0.5px solid rgba(96,165,250,0.3)", borderRadius: 8, background: "rgba(96,165,250,0.1)", color: "#60A5FA", fontSize: 12, fontWeight: 600, textDecoration: "none" }}>
                📄 NFs Importadas
              </a>
              <button className="cp-btn"
                onClick={() => { setCascade({}); setModalTab("principal"); setForm({ moeda: "BRL", pessoa_id: "", descricao: "", categoria: CATS_CP[0], vencimento: "", valorMask: "", cotacaoMask: "5,12", sacasMask: "", culturaBarter: "soja", precoSacaMask: "120,00", obs: "", condicao: "avista", qtdParcelas: "2", frequencia: "1", tipo_documento_lcdpr: "RECIBO", juros_pct: 0, multa_pct: 0, desconto_pct: 0, meses_diferido: "0", chave_xml: "", centro_custo: "", ano_safra_id: "", produtor_id: "", ciclo_id: "", talhao_id: "", operacao_gerencial_id: "", natureza: "real", forma_pagamento: "PIX", conta_pagamento: "", data_emissao: TODAY, numero_documento: "", serie: "", funcionario_id: "", tipo_mao_obra: "", unidade_mao_obra: "Dia", quantidade_mao_obra: "" }); setParcelas([]); setOpGerBusca(""); setArquivoNF(null); setErrosForm([]); carregarOps(); setModalNovo(true); }}
                style={{ background: "#C9921B", color: "#fff", border: "none", borderRadius: 8, padding: "9px 18px", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
                + Nova CP
              </button>
            </div>
          </div>

          {/* KPI Cards */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 10 }}>
            {[
              { label: "EM ABERTO",   value: fmtBRL(totalAberto),   count: qAberto,              bg: "rgba(59,130,246,0.08)",  border: "rgba(59,130,246,0.25)",  cor: "#60A5FA" },
              { label: "VENCIDO",     value: fmtBRL(totalVencido),  count: qVencido,             bg: "rgba(239,68,68,0.08)",   border: "rgba(239,68,68,0.25)",   cor: "#EF4444" },
              { label: "VENCE HOJE",  value: fmtBRL(totalVencendo), count: qVencendo,            bg: "rgba(245,158,11,0.08)",  border: "rgba(245,158,11,0.25)",  cor: "#F59E0B" },
              { label: "PAGO NO MÊS", value: fmtBRL(pagosNoMes),   count: null,                 bg: "rgba(34,197,94,0.08)",   border: "rgba(34,197,94,0.25)",   cor: "#22C55E" },
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
                  { key: "aberto",   label: "Em aberto",  count: lancOper.filter(l => statusEfetivo(l) !== "baixado" && l.moeda !== "barter").length, cor: "#60A5FA", activeBg: "rgba(59,130,246,0.15)",  activeBorder: "rgba(59,130,246,0.4)"  },
                  { key: "vencido",  label: "Vencidos",   count: qVencido + qVencendo,                                                                 cor: "#EF4444", activeBg: "rgba(239,68,68,0.15)",   activeBorder: "rgba(239,68,68,0.4)"   },
                  { key: "baixado",  label: "Pagos",      count: lancamentos.filter(l => (l.natureza ?? "real") === "real" && l.status === "baixado").length, cor: "#22C55E", activeBg: "rgba(34,197,94,0.12)",  activeBorder: "rgba(34,197,94,0.35)"  },
                  { key: "barter",   label: "Barter",     count: lancamentos.filter(l => (l.natureza ?? "real") === "real" && l.moeda === "barter").length,   cor: "#FBBF24", activeBg: "rgba(251,191,36,0.12)", activeBorder: "rgba(251,191,36,0.35)" },
                  { key: "previsao", label: "Previsões",  count: lancamentos.filter(l => l.natureza === "previsao").length,                             cor: "#818CF8", activeBg: "rgba(129,140,248,0.12)", activeBorder: "rgba(129,140,248,0.35)" },
                  { key: "todos",    label: "Todos",      count: lancamentos.length,                                                                     cor: "var(--text-2)", activeBg: "var(--border)", activeBorder: "var(--border)"  },
                ] as { key: Filtro; label: string; count: number; cor: string; activeBg: string; activeBorder: string }[]).map(f => (
                  <button key={f.key} className="cp-tab" onClick={() => setFiltro(f.key)}
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
                  <table style={{ tableLayout: "fixed", width: Math.max(32 + 44 + cw("fornecedor") + (col("operacao") ? cw("operacao") : 0) + (col("safra") ? cw("safra") : 0) + (col("ciclo") ? cw("ciclo") : 0) + cw("vencimento") + cw("valor") + (col("dt_pgto") ? cw("dt_pgto") : 0) + (col("valor_pago") ? cw("valor_pago") : 0) + (col("moeda") ? cw("moeda") : 0) + (col("conta") ? cw("conta") : 0) + (col("produtor") ? cw("produtor") : 0) + (col("origem") ? cw("origem") : 0) + (col("obs") ? cw("obs") : 0) + 70, 600), borderCollapse: "collapse" }}>
                    <thead style={{ position: "sticky", top: 0, zIndex: 3 }}
                      onContextMenu={e => { e.preventDefault(); setMenuColunas({ x: e.clientX, y: e.clientY }); }}
                      title="Clique com botão direito para configurar colunas">
                      <tr style={{ background: "var(--bg-nav)" }}>
                        <th style={{ ...thS(32), width: 32 }}>
                          <input type="checkbox" style={{ cursor: "pointer", accentColor: "#60A5FA" }}
                            checked={filtrados.length > 0 && filtrados.every(l => selecionados.has(l.id))}
                            onChange={toggleTodos} title="Selecionar todos" />
                        </th>
                        <th style={{ ...thS(cw("fornecedor"), "left"), width: cw("fornecedor"), position: "relative", userSelect: "none" }}>Fornecedor / Cliente<ResizeHandle onMouseDown={startResize("fornecedor")} /></th>
                        <th style={{ ...thS(44, "center"), width: 44 }}>Parc.</th>
                        {col("operacao")   && <th style={{ ...thS(cw("operacao"),   "left"),   width: cw("operacao"),   position: "relative", userSelect: "none" }}>Operação<ResizeHandle onMouseDown={startResize("operacao")} /></th>}
                        {col("safra")      && <th style={{ ...thS(cw("safra"),      "left"),   width: cw("safra"),      position: "relative", userSelect: "none" }}>Safra<ResizeHandle onMouseDown={startResize("safra")} /></th>}
                        {col("ciclo")      && <th style={{ ...thS(cw("ciclo"),      "left"),   width: cw("ciclo"),      position: "relative", userSelect: "none" }}>Ciclo<ResizeHandle onMouseDown={startResize("ciclo")} /></th>}
                        <th style={{ ...thS(cw("vencimento"), "center"), width: cw("vencimento"), position: "relative", userSelect: "none" }}>Vencimento ↑<ResizeHandle onMouseDown={startResize("vencimento")} /></th>
                        <th style={{ ...thS(cw("valor"), "right"), width: cw("valor"), position: "relative", userSelect: "none" }}>Valor<ResizeHandle onMouseDown={startResize("valor")} /></th>
                        {col("dt_pgto")    && <th style={{ ...thS(cw("dt_pgto"),    "center"), width: cw("dt_pgto"),    position: "relative", userSelect: "none" }}>Dt. Pgto<ResizeHandle onMouseDown={startResize("dt_pgto")} /></th>}
                        {col("valor_pago") && <th style={{ ...thS(cw("valor_pago"), "right"),  width: cw("valor_pago"), position: "relative", userSelect: "none" }}>Valor Pago<ResizeHandle onMouseDown={startResize("valor_pago")} /></th>}
                        {col("moeda")      && <th style={{ ...thS(cw("moeda"),      "center"), width: cw("moeda"),      position: "relative", userSelect: "none" }}>Moeda<ResizeHandle onMouseDown={startResize("moeda")} /></th>}
                        {col("conta")      && <th style={{ ...thS(cw("conta"),      "left"),   width: cw("conta"),      position: "relative", userSelect: "none" }}>Conta<ResizeHandle onMouseDown={startResize("conta")} /></th>}
                        {col("produtor")   && <th style={{ ...thS(cw("produtor"),   "left"),   width: cw("produtor"),   position: "relative", userSelect: "none" }}>Produtor<ResizeHandle onMouseDown={startResize("produtor")} /></th>}
                        {col("origem")     && <th style={{ ...thS(cw("origem"),     "center"), width: cw("origem"),     position: "relative", userSelect: "none" }}>Origem<ResizeHandle onMouseDown={startResize("origem")} /></th>}
                        {col("obs")        && <th style={{ ...thS(cw("obs"),        "left"),   width: cw("obs"),        position: "relative", userSelect: "none" }}>Observação<ResizeHandle onMouseDown={startResize("obs")} /></th>}
                        <th style={{ ...thS(70, "center"), width: 70 }}></th>
                      </tr>
                      {/* Linha de filtros */}
                      <tr style={{ background: "var(--bg-nav)", borderBottom: "0.5px solid var(--border-table)" }}>
                        <td></td>
                        <td style={{ padding: "3px 6px" }}><input style={inpF} placeholder="Buscar…" value={fFornecedor} onChange={e => setFFornecedor(e.target.value)} /></td>
                        <td></td>
                        {col("operacao")   && <td style={{ padding: "3px 6px" }}><input style={inpF} placeholder="Buscar…" value={fOperacao} onChange={e => setFOperacao(e.target.value)} /></td>}
                        {col("safra")      && <td style={{ padding: "3px 6px" }}><select style={inpF} value={fSafra} onChange={e => setFSafra(e.target.value)}><option value="">Todas</option>{anosSafra.map(a => <option key={a.id} value={a.id}>{a.descricao}</option>)}</select></td>}
                        {col("ciclo")      && <td></td>}
                        <td></td><td></td>
                        {col("dt_pgto")    && <td></td>}
                        {col("valor_pago") && <td></td>}
                        {col("moeda")      && <td></td>}
                        {col("conta")      && <td style={{ padding: "3px 6px" }}><input style={inpF} placeholder="Buscar…" value={fConta} onChange={e => setFConta(e.target.value)} /></td>}
                        {col("produtor")   && <td style={{ padding: "3px 6px" }}><input style={inpF} placeholder="Buscar…" value={fProdutor} onChange={e => setFProdutor(e.target.value)} /></td>}
                        {col("origem")     && <td></td>}
                        {col("obs")        && <td style={{ padding: "3px 6px" }}><input style={inpF} placeholder="Buscar…" value={fObs} onChange={e => setFObs(e.target.value)} /></td>}
                        <td></td>
                      </tr>
                    </thead>
                    <tbody>
                      {filtrados.length === 0 ? (
                        <tr><td colSpan={16} style={{ padding: 24, textAlign: "center", color: "var(--text-muted)", fontSize: 12 }}>Nenhum resultado para os filtros aplicados.</td></tr>
                      ) : filtrados.map((l, li) => {
                        const isPrevisao = l.natureza === "previsao";
                        const sEfet      = statusEfetivo(l);
                        const dot        = dotStatus(sEfet);
                        const conv       = l.moeda === "USD" ? fmtBRL(l.valor * (l.cotacao_usd ?? COTACAO_USD)) : null;
                        const safra      = anosSafra.find(a => a.id === l.ano_safra_id)?.descricao ?? "—";
                        const cicloDesc  = ciclos.find(c => c.id === l.ciclo_id)?.descricao ?? "—";
                        const prod       = produtores.find(p => p.id === l.produtor_id)?.nome ?? "—";
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
                        // borda esquerda por status
                        const statusBorder = sEfet === "vencido" ? "#EF4444" : sEfet === "vencendo" ? "#F59E0B" : sEfet === "baixado" ? "#22C55E" : isPrevisao ? "#818CF8" : "#3B82F6";
                        // progresso de parcelas
                        const parcPct = l.total_parcelas && l.total_parcelas > 1 ? Math.round(((l.num_parcela ?? 1) / l.total_parcelas) * 100) : null;
                        return (
                          <tr key={l.id} className="cp-row" style={{ borderBottom: li < filtrados.length - 1 ? "0.5px solid rgba(255,255,255,0.04)" : "none", background: "transparent", borderLeft: `3px solid ${statusBorder}` }}>
                            {/* Checkbox */}
                            <td style={{ padding: "8px 4px", textAlign: "center" }}>
                              <input type="checkbox" style={{ cursor: "pointer", accentColor: "#60A5FA" }}
                                checked={selecionados.has(l.id)} onChange={() => toggleSel(l.id)} />
                            </td>
                            {/* Fornecedor / Cliente */}
                            <td style={{ padding: "8px 10px", maxWidth: cw("fornecedor"), overflow: "hidden" }}>
                              <div style={{ display: "flex", alignItems: "center", gap: 8, overflow: "hidden" }}>
                                {/* Avatar inicial */}
                                <div style={{ width: 28, height: 28, borderRadius: 7, background: `${statusBorder}22`, border: `0.5px solid ${statusBorder}44`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 800, color: statusBorder, flexShrink: 0 }}>{inicial}</div>
                                <div style={{ minWidth: 0, flex: 1 }}>
                                  <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                                    <span style={{ fontWeight: 600, fontSize: 12, color: "var(--text-1)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1, minWidth: 0 }}>{fornNome}</span>
                                    {isPrevisao && <span style={{ fontSize: 9, background: "rgba(129,140,248,0.2)", color: "#818CF8", padding: "1px 5px", borderRadius: 4, fontWeight: 700, flexShrink: 0, border: "0.5px solid rgba(129,140,248,0.3)" }}>PREV</span>}
                                  </div>
                                  {fornDetalhe && <div style={{ fontSize: 10, color: "var(--text-3)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{fornDetalhe}</div>}
                                </div>
                              </div>
                            </td>
                            {/* Parcela + barra de progresso */}
                            <td style={{ padding: "8px 6px", textAlign: "center", width: 44 }}>
                              {parcPct !== null ? (
                                <div>
                                  <span style={{ fontSize: 10, fontWeight: 700, color: "#60A5FA" }}>{l.num_parcela}/{l.total_parcelas}</span>
                                  <div style={{ height: 3, borderRadius: 2, background: "var(--border-table)", marginTop: 3 }}>
                                    <div style={{ height: 3, borderRadius: 2, background: "#3B82F6", width: `${parcPct}%` }} />
                                  </div>
                                </div>
                              ) : <span style={{ color: "#1E3A5F", fontSize: 11 }}>—</span>}
                            </td>
                            {/* Operação */}
                            {col("operacao") && <td style={{ padding: "8px 8px" }}>
                              <span style={{ fontSize: 10, background: "rgba(251,191,36,0.1)", color: "#FBBF24", padding: "2px 7px", borderRadius: 5, border: "0.5px solid rgba(251,191,36,0.2)", whiteSpace: "nowrap" }}>
                                {l.operacao_gerencial_id ? (ogMap.get(l.operacao_gerencial_id) ?? l.categoria) : l.categoria}
                              </span>
                            </td>}
                            {/* Safra */}
                            {col("safra") && <td style={{ padding: "8px 8px", fontSize: 10, color: "var(--text-3)", whiteSpace: "nowrap" }}>{l.ano_safra_id ? safra : "—"}</td>}
                            {/* Ciclo */}
                            {col("ciclo") && <td style={{ padding: "8px 8px", fontSize: 10, color: "var(--text-3)", whiteSpace: "nowrap" }}>{l.ciclo_id ? cicloDesc : "—"}</td>}
                            {/* Vencimento */}
                            <td style={{ padding: "8px 8px", textAlign: "center", whiteSpace: "nowrap" }}>
                              <div style={{ fontSize: 11, color: sEfet === "baixado" ? "#22C55E" : relativo ? relativo.cor : "var(--text-2)", fontWeight: relativo ? 700 : 400 }}>{fmtData(l.data_vencimento)}</div>
                              {relativo && <div style={{ fontSize: 9, color: relativo.cor, fontWeight: 700, marginTop: 1 }}>{relativo.txt}</div>}
                            </td>
                            {/* Valor */}
                            <td style={{ padding: "8px 8px", textAlign: "right", whiteSpace: "nowrap" }}>
                              <div style={{ fontWeight: 700, color: l.moeda === "barter" ? "#FBBF24" : "#EF4444", fontSize: 13, fontVariantNumeric: "tabular-nums" }}>{exibirValor(l)}</div>
                              {conv && <div style={{ fontSize: 9, color: "var(--text-muted)", marginTop: 1 }}>{conv}</div>}
                            </td>
                            {/* Data Pgto */}
                            {col("dt_pgto") && <td style={{ padding: "8px 8px", textAlign: "center", fontSize: 10, color: "#22C55E", whiteSpace: "nowrap" }}>{fmtData(l.data_baixa)}</td>}
                            {/* Valor Pago */}
                            {col("valor_pago") && <td style={{ padding: "8px 8px", textAlign: "right", fontSize: 11, whiteSpace: "nowrap" }}>
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
                              <span style={{ fontSize: 9, padding: "2px 6px", borderRadius: 5, background: l.moeda === "USD" ? "rgba(251,191,36,0.1)" : l.moeda === "barter" ? "rgba(251,191,36,0.1)" : "var(--bg-input)", color: l.moeda === "USD" ? "#FBBF24" : l.moeda === "barter" ? "#FBBF24" : "var(--text-2)", fontWeight: 600, border: "0.5px solid var(--border-table)" }}>
                                {l.moeda === "barter" ? "Barter" : (l.moeda_pagamento && l.moeda_pagamento !== l.moeda ? `${l.moeda}→${l.moeda_pagamento}` : l.moeda)}
                              </span>
                            </td>}
                            {/* Conta */}
                            {col("conta") && <td style={{ padding: "8px 8px", fontSize: 10, color: "var(--text-3)", whiteSpace: "nowrap" }}>{contas.find(c => c.id === l.conta_bancaria)?.nome ?? "—"}</td>}
                            {/* Produtor */}
                            {col("produtor") && <td style={{ padding: "8px 8px", fontSize: 10, color: "var(--text-3)", whiteSpace: "nowrap" }}>{l.produtor_id ? prod : "—"}</td>}
                            {/* Origem */}
                            {col("origem") && <td style={{ padding: "8px 8px", textAlign: "center" }}>
                              <span style={{ fontSize: 9, background: "var(--bg-input)", color: "var(--text-2)", padding: "2px 6px", borderRadius: 5, fontWeight: 600, border: "0.5px solid var(--border-table)", whiteSpace: "nowrap" }}>{om.label}</span>
                            </td>}
                            {/* Observação */}
                            {col("obs") && <td style={{ padding: "8px 8px", fontSize: 10, color: "var(--text-3)", whiteSpace: "nowrap", overflow: "hidden", maxWidth: 160 }}>{obsExibir}</td>}
                            {/* Ação */}
                            <td style={{ padding: "5px 6px", textAlign: "center" }}>
                              <div style={{ display: "flex", gap: 4, justifyContent: "center", alignItems: "center" }}>
                                {isPrevisao ? (
                                  <button
                                    onClick={() => confirmarPrevisao(l)}
                                    title="Confirmar previsão"
                                    style={{ width: 28, height: 26, borderRadius: 6, cursor: "pointer", fontWeight: 700, background: "#1A5CB8", color: "#fff", border: "none", fontSize: 13, display: "flex", alignItems: "center", justifyContent: "center" }}
                                  >✓</button>
                                ) : l.moeda === "barter" ? (
                                  <span title="Liquidar no fechamento da safra" style={{ width: 28, height: 26, borderRadius: 6, background: "#FBF3E0", color: "#7A5200", border: "0.5px solid #C9921B50", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13 }}>
                                    🌾
                                  </span>
                                ) : l.status !== "baixado" ? (
                                  <button
                                    onClick={() => abrirBaixa(l)}
                                    title="Baixar / Registrar pagamento"
                                    style={{ width: 28, height: 26, borderRadius: 6, cursor: "pointer", fontWeight: 700, background: "#C9921B", color: "#fff", border: "none", fontSize: 14, display: "flex", alignItems: "center", justifyContent: "center" }}
                                  >↓</button>
                                ) : (
                                  <button
                                    onClick={() => reabrirUm(l)}
                                    title="Reabrir — apaga dados de pagamento"
                                    style={{ width: 28, height: 26, borderRadius: 6, cursor: "pointer", fontWeight: 700, background: "#FBF3E0", color: "#7A5C00", border: "0.5px solid #C9921B", fontSize: 13, display: "flex", alignItems: "center", justifyContent: "center" }}
                                  >↺</button>
                                )}
                                {l.status !== "baixado" && (
                                  <button
                                    onClick={() => abrirEditar(l)}
                                    title="Editar lançamento"
                                    style={{ fontSize: 13, padding: "3px 7px", borderRadius: 6, cursor: "pointer", background: "var(--bg-input)", color: "var(--text-2)", border: "0.5px solid var(--border)", lineHeight: 1 }}
                                  >
                                    ✏
                                  </button>
                                )}
                                {l.nfe_numero && (
                                  <span title={`NF vinculada: ${l.nfe_numero}`} style={{ fontSize: 11, padding: "2px 6px", borderRadius: 5, background: "rgba(96,165,250,0.1)", color: "#60A5FA", border: "0.5px solid rgba(96,165,250,0.25)", fontWeight: 700 }}>
                                    📎 {l.nfe_numero}
                                  </span>
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
                <span>CP automáticas: <strong style={{ color: "#FBBF24" }}>{lancamentos.filter(l => l.auto).length}</strong></span>
                <div style={{ display: "flex", gap: 24, alignItems: "center" }}>
                  <span>Exibindo {filtrados.length} de {filtradosBase.length} registros</span>
                  {filtrados.length > 0 && (
                    <>
                      <span style={{ color: "var(--text-3)" }}>|</span>
                      <span>Total filtrado: <strong style={{ color: "#E24B4A", fontSize: 13 }}>{fmtBRL(filtrados.filter(l => l.status !== "baixado").reduce((s, l) => s + paraBRL(l), 0))}</strong> em aberto</span>
                      {filtrados.some(l => l.status === "baixado") && (
                        <span>Pago: <strong style={{ color: "#16A34A", fontSize: 13 }}>{fmtBRL(filtrados.filter(l => l.status === "baixado").reduce((s, l) => s + (l.valor_pago ?? paraBRL(l)), 0))}</strong></span>
                      )}
                    </>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </main>

      {/* ── Vínculo de NF na baixa ──────────────────────────────── */}
      {alertaNF && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex:2000, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ background: "var(--bg-card)", borderRadius: 14, width: 680, maxWidth: "95vw", maxHeight: "90vh", display: "flex", flexDirection: "column", boxShadow: "0 8px 40px rgba(0,0,0,0.6)", border: "0.5px solid var(--border)" }}>

            {/* Header */}
            <div style={{ padding: "18px 22px 14px", borderBottom: "0.5px solid var(--border)", display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 15, color: "var(--text-1)" }}>Vincular Nota Fiscal à Baixa</div>
                <div style={{ fontSize: 12, color: "var(--text-3)", marginTop: 3 }}>{alertaNF.descricao} — {alertaNF.valor?.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</div>
              </div>
              <button onClick={() => setAlertaNF(null)} style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer", color: "var(--text-3)", lineHeight: 1 }}>×</button>
            </div>

            {/* Busca */}
            <div style={{ padding: "12px 22px 8px" }}>
              <input
                type="text"
                placeholder="Buscar por nº NF, emitente ou valor…"
                value={nfVinculoBusca}
                onChange={e => setNfVinculoBusca(e.target.value)}
                style={{ width: "100%", padding: "8px 12px", border: "0.5px solid var(--border)", borderRadius: 8, fontSize: 13, outline: "none", boxSizing: "border-box", background: "var(--bg-input)", color: "var(--text-1)" }}
                autoFocus
              />
            </div>

            {/* Lista de NFs */}
            <div style={{ flex: 1, overflowY: "auto", padding: "0 22px 8px" }}>
              {nfsVinculoLoading ? (
                <div style={{ textAlign: "center", padding: 24, color: "var(--text-3)", fontSize: 13 }}>Carregando NFs…</div>
              ) : (() => {
                const busca = nfVinculoBusca.toLowerCase();
                const filtradas = nfsVinculo.filter(nf =>
                  !busca ||
                  (nf.numero ?? "").includes(busca) ||
                  (nf.emitente_nome ?? "").toLowerCase().includes(busca) ||
                  (nf.valor_total ?? 0).toFixed(2).includes(busca)
                );
                if (filtradas.length === 0) return (
                  <div style={{ textAlign: "center", padding: "24px 16px" }}>
                    {nfsVinculo.length === 0 ? (
                      <>
                        <div style={{ color: "var(--text-3)", fontSize: 13, marginBottom: 12 }}>
                          Nenhuma NF pendente de processamento encontrada.
                        </div>
                        <div style={{ fontSize: 12, color: "var(--text-2)", marginBottom: 14 }}>
                          Importe NFs via SIEG ou cadastre manualmente em <strong>Compras &gt; NF de Produtos</strong>,<br/>
                          depois clique em <strong>Processar</strong> — o financeiro é gerado automaticamente.
                        </div>
                        <a href="/compras/nf" style={{ display: "inline-block", padding: "8px 18px", background: "#1A4870", color: "#fff", borderRadius: 8, fontSize: 12, fontWeight: 600, textDecoration: "none" }}>
                          Ir para NFs de Produtos →
                        </a>
                      </>
                    ) : "Nenhuma NF corresponde à busca."}
                  </div>
                );
                return (
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                    <thead>
                      <tr style={{ background: "var(--bg-page)" }}>
                        <th style={{ padding: "7px 10px", textAlign: "left", fontWeight: 600, color: "var(--text-2)", borderBottom: "0.5px solid var(--border)" }}>Nº NF</th>
                        <th style={{ padding: "7px 10px", textAlign: "left", fontWeight: 600, color: "var(--text-2)", borderBottom: "0.5px solid var(--border)" }}>Emitente</th>
                        <th style={{ padding: "7px 10px", textAlign: "center", fontWeight: 600, color: "var(--text-2)", borderBottom: "0.5px solid var(--border)" }}>Emissão</th>
                        <th style={{ padding: "7px 10px", textAlign: "center", fontWeight: 600, color: "var(--text-2)", borderBottom: "0.5px solid var(--border)" }}>Vencimento</th>
                        <th style={{ padding: "7px 10px", textAlign: "right", fontWeight: 600, color: "var(--text-2)", borderBottom: "0.5px solid var(--border)" }}>Valor</th>
                        <th style={{ padding: "7px 10px", textAlign: "center", fontWeight: 600, color: "var(--text-2)", borderBottom: "0.5px solid var(--border)" }}>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filtradas.map(nf => {
                        const sel = nfVinculoSelecionada?.id === nf.id;
                        const fmtD = (s?: string | null) => { if (!s) return "—"; const [y,m,d] = s.split("-"); return `${d}/${m}/${y}`; };
                        return (
                          <tr key={nf.id}
                            onClick={() => setNfVinculoSelecionada(sel ? null : nf)}
                            style={{ cursor: "pointer", background: sel ? "#D5E8F5" : "transparent", borderBottom: "0.5px solid #F0F2F7" }}>
                            <td style={{ padding: "8px 10px", fontWeight: 700, color: sel ? "#0B2D50" : "#1A4870" }}>{nf.numero}/{nf.serie}</td>
                            <td style={{ padding: "8px 10px", color: "var(--text-1)", maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{nf.emitente_nome || "—"}</td>
                            <td style={{ padding: "8px 10px", textAlign: "center", color: "var(--text-2)" }}>{fmtD(nf.data_emissao)}</td>
                            <td style={{ padding: "8px 10px", textAlign: "center", color: nf.data_vencimento_cp ? "#7A4300" : "var(--text-3)", fontWeight: nf.data_vencimento_cp ? 600 : 400 }}>{fmtD(nf.data_vencimento_cp)}</td>
                            <td style={{ padding: "8px 10px", textAlign: "right", fontWeight: 600, color: "var(--text-1)" }}>{(nf.valor_total ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</td>
                            <td style={{ padding: "8px 10px", textAlign: "center" }}>
                              <span style={{ fontSize: 10, padding: "2px 7px", borderRadius: 8, fontWeight: 700,
                                background: nf.status === "processada" ? "#E8F5E9" : "#FBF3E0",
                                color: nf.status === "processada" ? "#1A6B3C" : "#C9921B" }}>
                                {nf.status === "processada" ? "Processada" : "Pendente"}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                );
              })()}
            </div>

            {/* Footer */}
            <div style={{ padding: "12px 22px", borderTop: "0.5px solid var(--border)", display: "flex", gap: 8, justifyContent: "flex-end", alignItems: "center" }}>
              {nfVinculoSelecionada && (
                <span style={{ fontSize: 12, color: "#0B2D50", background: "#D5E8F5", padding: "4px 12px", borderRadius: 8, fontWeight: 600, marginRight: "auto" }}>
                  NF {nfVinculoSelecionada.numero} selecionada
                </span>
              )}
              <button onClick={() => setAlertaNF(null)}
                style={{ padding: "8px 16px", borderRadius: 8, border: "0.5px solid #CCC", background: "var(--bg-page)", cursor: "pointer", fontSize: 13 }}>
                Cancelar
              </button>
              <button onClick={() => {
                const l = alertaNF;
                setAlertaNF(null);
                setModalBaixa(l);
                setBaixa({
                  valorMask: l.moeda === "barter" ? "" : numParaMascara(paraBRL(l)),
                  data: TODAY, conta: l.conta_bancaria ?? "", obs: l.observacao ?? "",
                  multa_pct: "", juros_pct: "", desconto_pct: "",
                  pessoa_id: l.pessoa_id ?? "", operacao_gerencial_id: l.operacao_gerencial_id ?? "",
                  og_busca: "", salvar_class: false,
                  ano_safra_id: l.ano_safra_id ?? "", ciclo_id: l.ciclo_id ?? "",
                });
              }} style={{ padding: "8px 16px", borderRadius: 8, border: "0.5px solid #888", background: "transparent", color: "var(--text-2)", cursor: "pointer", fontSize: 13 }}>
                Baixar sem NF
              </button>
              <button
                disabled={!nfVinculoSelecionada}
                onClick={async () => {
                  if (!nfVinculoSelecionada) return;
                  const l = alertaNF;
                  // Vincula o número da NF ao lançamento
                  await supabase.from("lancamentos").update({ nfe_numero: nfVinculoSelecionada.numero }).eq("id", l.id);
                  // Atualiza localmente
                  setLancamentos(prev => prev.map(x => x.id === l.id ? { ...x, nfe_numero: nfVinculoSelecionada.numero } : x));
                  const lAtualizado = { ...l, nfe_numero: nfVinculoSelecionada.numero };
                  setAlertaNF(null);
                  // Abre o modal de baixa
                  setModalBaixa(lAtualizado);
                  setBaixa({
                    valorMask: l.moeda === "barter" ? "" : numParaMascara(paraBRL(l)),
                    data: TODAY, conta: l.conta_bancaria ?? "", obs: l.observacao ?? "",
                    multa_pct: "", juros_pct: "", desconto_pct: "",
                    pessoa_id: l.pessoa_id ?? "", operacao_gerencial_id: l.operacao_gerencial_id ?? "",
                    og_busca: "", salvar_class: false,
                    ano_safra_id: l.ano_safra_id ?? "", ciclo_id: l.ciclo_id ?? "",
                  });
                }}
                style={{ padding: "8px 18px", borderRadius: 8, border: "none", background: nfVinculoSelecionada ? "#1A4870" : "#CCC", color: "#fff", cursor: nfVinculoSelecionada ? "pointer" : "not-allowed", fontSize: 13, fontWeight: 700 }}>
                Vincular e Baixar
              </button>
            </div>

          </div>
        </div>
      )}

      {/* ── Barra flutuante de seleção (borderô) ─────────────── */}
      {selecionados.size > 0 && (() => {
        const qtdBaixados = filtrados.filter(l => selecionados.has(l.id) && l.status === "baixado").length;
        return (
        <div style={{
          position: "fixed", bottom: 24, left: "50%", transform: "translateX(-50%)",
          background: "#1A4870", color: "#fff", borderRadius: 14,
          padding: "12px 22px", display: "flex", alignItems: "center", gap: 18,
          boxShadow: "0 2px 8px rgba(11,45,80,0.07)", zIndex: 90, whiteSpace: "nowrap",
          maxWidth: "calc(100vw - 32px)",
        }}>
          <span style={{ fontSize: 13 }}>
            <strong>{selecionados.size}</strong> título{selecionados.size !== 1 ? "s" : ""} selecionado{selecionados.size !== 1 ? "s" : ""}
            {itensLote.length > 0 && <>&nbsp;·&nbsp;<strong>{fmtBRL(totalLote)}</strong></>}
          </span>
          {itensLote.length > 0 && (
          <button
            onClick={() => { setLoteData(TODAY); setLoteConta(""); setLoteDesc(""); setLoteErro(""); setModalLote(true); }}
            style={{ background: "#C9921B", color: "#fff", border: "none", borderRadius: 8, padding: "7px 16px", fontWeight: 700, fontSize: 13, cursor: "pointer" }}
          >
            Pagar em Lote ›
          </button>
          )}
          {qtdBaixados > 0 && (
            <button
              onClick={reabrirLote}
              style={{ background: "#FBF3E0", color: "#7A5C00", border: "0.5px solid #C9921B", borderRadius: 8, padding: "7px 16px", fontWeight: 700, fontSize: 13, cursor: "pointer" }}
            >
              ↺ Reabrir {qtdBaixados} pago{qtdBaixados !== 1 ? "s" : ""}
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
                {modalBaixa.moeda === "barter" ? "Confirmar entrega (barter)" : modalBaixa.status === "parcial" ? "Registrar pagamento parcial" : "Registrar pagamento"}
              </div>
              <button onClick={() => setModalBaixa(null)} style={{ background: "none", border: "none", fontSize: 18, cursor: "pointer", color: "var(--text-3)" }}>×</button>
            </div>
            <div style={{ fontSize: 12, color: "var(--text-2)", marginBottom: 16 }}>{modalBaixa.descricao}</div>
            <div style={{ background: "var(--border-row)", borderRadius: 8, padding: "8px 12px", fontSize: 12, color: "var(--text-2)", marginBottom: 20, display: "flex", gap: 20, flexWrap: "wrap", border: "0.5px solid var(--border)" }}>
              <span>Valor original: <strong style={{ color: "#EF4444" }}>{fmtBRL(valorTotal)}</strong></span>
              {jaPago > 0 && <span>Já pago: <strong style={{ color: "#22C55E" }}>{fmtBRL(jaPago)}</strong></span>}
              {jaPago > 0 && <span>Saldo restante: <strong style={{ color: "#FBBF24" }}>{fmtBRL(valorOrig)}</strong></span>}
              <span>Vencimento: <strong style={{ color: "var(--text-1)" }}>{modalBaixa.data_vencimento ? new Date(modalBaixa.data_vencimento + "T12:00").toLocaleDateString("pt-BR") : "—"}</strong></span>
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
                      <label style={lbl}>Fornecedor / Credor</label>
                      <select style={inp} value={baixa.pessoa_id} onChange={e => setBaixa(p => ({ ...p, pessoa_id: e.target.value }))}>
                        <option value="">— Não informado —</option>
                        {[...pessoas].sort((a, b) => {
                          if (a.fornecedor && !b.fornecedor) return -1;
                          if (!a.fornecedor && b.fornecedor) return 1;
                          return a.nome.localeCompare(b.nome, "pt-BR");
                        }).map(p => (
                          <option key={p.id} value={p.id}>{p.nome}</option>
                        ))}
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
                    <div style={{ display: "flex", alignItems: "center", gap: 8, paddingTop: 20 }}>
                      <input type="checkbox" id="salvar_class_cp" checked={baixa.salvar_class}
                        onChange={e => setBaixa(p => ({ ...p, salvar_class: e.target.checked }))}
                        disabled={!baixa.pessoa_id || !baixa.operacao_gerencial_id}
                        style={{ cursor: "pointer", width: 14, height: 14 }} />
                      <label htmlFor="salvar_class_cp" style={{ fontSize: 12, color: "var(--text-2)", cursor: "pointer", lineHeight: 1.3 }}>
                        Salvar como classificação padrão deste fornecedor
                      </label>
                    </div>
                  </div>
                </div>

                {/* ── Encargos ── */}
                <div style={{ border: "0.5px solid #E4E9F0", borderRadius: 10, padding: "14px 16px" }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: "#1A4870", textTransform: "uppercase", letterSpacing: 1, marginBottom: 12 }}>Encargos</div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
                    <div>
                      <label style={lbl}>Multa (%)</label>
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
                      {multaV > 0 && <span>Multa: +{fmtBRL(multaV)}</span>}
                      {jurosV > 0 && <span>Juros: +{fmtBRL(jurosV)}</span>}
                      {descV  > 0 && <span>Desconto: -{fmtBRL(descV)}</span>}
                      <span style={{ fontWeight: 700 }}>Total com encargos: {fmtBRL(valorCom)}</span>
                    </div>
                  )}
                </div>

                {/* ── Pagamento ── */}
                <div style={{ border: "0.5px solid #E4E9F0", borderRadius: 10, padding: "14px 16px" }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: "#1A4870", textTransform: "uppercase", letterSpacing: 1, marginBottom: 12 }}>Pagamento</div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 10 }}>
                    <div style={{ gridColumn: "1/-1" }}>
                      <label style={lbl}>Valor pago (R$) <span style={{ color: "#E24B4A" }}>*</span></label>
                      <input style={{ ...inp, fontWeight: 600 }} type="text" inputMode="numeric" placeholder="0,00" value={baixa.valorMask}
                        onChange={e => setBaixa(p => ({ ...p, valorMask: aplicarMascara(e.target.value) }))} />
                      {desmascarar(baixa.valorMask) > 0 && desmascarar(baixa.valorMask) < valorOrig && (
                        <div style={{ fontSize: 10, color: "#EF9F27", marginTop: 4 }}>
                          Pagamento parcial — restante: {fmtBRL(valorOrig - desmascarar(baixa.valorMask))}
                        </div>
                      )}
                    </div>
                    <div>
                      <label style={lbl}>Data do pagamento</label>
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

            <div style={{ marginTop: 14, background: "#FBF0D8", borderRadius: 8, padding: "8px 12px", fontSize: 11, color: "#7A5A12" }}>
              ◈ Ação manual — você confirma que o pagamento foi efetuado.
            </div>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 16 }}>
              <button onClick={() => setModalBaixa(null)} style={{ padding: "8px 18px", border: "0.5px solid var(--border-table)", borderRadius: 8, background: "transparent", cursor: "pointer", fontSize: 13 }}>Cancelar</button>
              <button onClick={confirmarBaixa}
                disabled={salvando || (modalBaixa.moeda !== "barter" && (!baixa.valorMask || !baixa.conta))}
                style={{ padding: "8px 18px", background: "#C9921B", color: "#fff", border: "none", borderRadius: 8, fontWeight: 600, cursor: "pointer", fontSize: 13 }}>
                {salvando ? "Salvando…" : "◈ Confirmar baixa"}
              </button>
            </div>
          </div>
        </div>
        );
      })()}

      {/* ── Modal Pagamento em Lote ──────────────────────────── */}
      {modalLote && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex:2000 }}
          onClick={e => { if (e.target === e.currentTarget) setModalLote(false); }}>
          <div style={{ background: "var(--bg-card)", borderRadius: 12, width: "100%", maxWidth: 580, maxHeight: "90vh", overflowY: "auto" as const, boxShadow: "0 8px 40px rgba(0,0,0,0.6)", border: "0.5px solid var(--border)" }}>
            <div style={{ padding: "16px 22px", borderBottom: "0.5px solid var(--border)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 15, color: "var(--text-1)" }}>Pagamento em Lote (Borderô)</div>
                <div style={{ fontSize: 11, color: "var(--text-3)", marginTop: 2 }}>{itensLote.length} título{itensLote.length !== 1 ? "s" : ""} · total {fmtBRL(totalLote)}</div>
              </div>
              <button onClick={() => setModalLote(false)} style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer", color: "var(--text-3)" }}>×</button>
            </div>
            <div style={{ padding: "18px 22px" }}>

              {/* Parâmetros do lote */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 12, marginBottom: 16 }}>
                <div>
                  <label style={{ fontSize: 11, color: "var(--text-2)", marginBottom: 3, display: "block" }}>Data do Pagamento *</label>
                  <input type="date" style={{ ...inp }} value={loteData} onChange={e => setLoteData(e.target.value)} />
                </div>
                <div>
                  <label style={{ fontSize: 11, color: "var(--text-2)", marginBottom: 3, display: "block" }}>Conta Bancária *</label>
                  <select style={{ ...inp }} value={loteConta} onChange={e => setLoteConta(e.target.value)}>
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
                  <input style={{ ...inp }} value={loteDesc} onChange={e => setLoteDesc(e.target.value)} placeholder={`Borderô ${loteData} — ${itensLote.length} títulos`} />
                </div>
              </div>

              {/* Lista dos títulos selecionados */}
              <div style={{ border: "0.5px solid var(--border)", borderRadius: 8, overflow: "hidden", marginBottom: 14 }}>
                <div style={{ background: "var(--bg-stripe)", padding: "6px 12px", fontSize: 10, fontWeight: 700, color: "var(--text-3)", textTransform: "uppercase", display: "grid", gridTemplateColumns: "1fr auto auto", gap: 8 }}>
                  <span>Título</span><span>Vencimento</span><span style={{ textAlign: "right" }}>Valor</span>
                </div>
                {itensLote.map((l, i) => (
                  <div key={l.id} style={{ display: "grid", gridTemplateColumns: "1fr auto auto", gap: 8, padding: "8px 12px", borderTop: i > 0 ? "0.5px solid var(--bg-input)" : "none", fontSize: 12, alignItems: "center" }}>
                    <span style={{ color: "var(--text-1)", fontWeight: 500 }}>{exibirFornecedor(l.descricao)}</span>
                    <span style={{ color: "var(--text-2)", whiteSpace: "nowrap" }}>{fmtData(l.data_vencimento)}</span>
                    <span style={{ fontWeight: 600, color: "#EF4444", textAlign: "right", whiteSpace: "nowrap" }}>{exibirValor(l)}</span>
                  </div>
                ))}
                <div style={{ background: "var(--bg-stripe)", padding: "8px 12px", display: "flex", justifyContent: "space-between", borderTop: "0.5px solid var(--border)" }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-2)" }}>Total do lote</span>
                  <span style={{ fontSize: 14, fontWeight: 700, color: "#60A5FA" }}>{fmtBRL(totalLote)}</span>
                </div>
              </div>

              {/* Aviso conciliação */}
              <div style={{ background: "rgba(96,165,250,0.08)", border: "0.5px solid rgba(96,165,250,0.2)", borderRadius: 7, padding: "8px 12px", fontSize: 11, color: "#93C5FD", marginBottom: 14 }}>
                Este lote será registrado como <strong>uma única saída de caixa</strong> de {fmtBRL(totalLote)} na conciliação bancária.
                Cada título será baixado individualmente.
              </div>

              {loteErro && (
                <div style={{ background: "#FCEBEB", border: "0.5px solid #E24B4A60", borderRadius: 7, padding: "8px 12px", fontSize: 12, color: "#791F1F", marginBottom: 12 }}>
                  {loteErro}
                </div>
              )}

              <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
                <button onClick={() => setModalLote(false)} style={{ padding: "8px 18px", border: "0.5px solid var(--border)", borderRadius: 8, background: "var(--bg-input)", color: "var(--text-2)", cursor: "pointer", fontSize: 13 }}>Cancelar</button>
                <button
                  onClick={pagarEmLote}
                  disabled={loteSalvando || !loteData || !loteConta}
                  style={{ padding: "8px 20px", background: "#C9921B", color: "#fff", border: "none", borderRadius: 8, fontWeight: 700, fontSize: 13, cursor: "pointer", opacity: loteSalvando ? 0.6 : 1 }}
                >
                  {loteSalvando ? "Processando…" : `Confirmar Pagamento de ${itensLote.length} título${itensLote.length !== 1 ? "s" : ""}`}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal Novo CP ──────────────────────────────────────── */}
      {modalNovo && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex:2000 }}
          onClick={e => { if (e.target === e.currentTarget) fecharModal(); }}>
          <div style={{ background: "var(--bg-card)", borderRadius: 12, width: "95vw", maxWidth: 920, maxHeight: "92vh", overflowY: "auto" as const, boxShadow: "0 8px 40px rgba(0,0,0,0.6)", border: "0.5px solid var(--border)", display: "flex", flexDirection: "column" }}>

            {/* ── Cabeçalho ── */}
            <div style={{ padding: "16px 24px 0", borderBottom: "0.5px solid var(--border)" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12, flexWrap: "wrap", gap: 8 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <span style={{ fontWeight: 700, fontSize: 15, color: "var(--text-1)" }}>
                    {editandoId ? "✏ Editar Conta a Pagar" : "Nova Conta a Pagar"}
                  </span>
                  <div style={{ display: "flex", gap: 0, border: "0.5px solid var(--border)", borderRadius: 8, overflow: "hidden" }}>
                    {(["real", "previsao"] as const).map(n => (
                      <button key={n} onClick={() => setForm(p => ({ ...p, natureza: n }))}
                        style={{ padding: "4px 14px", border: "none", cursor: "pointer", fontSize: 12, fontWeight: form.natureza === n ? 700 : 400,
                          background: form.natureza === n ? (n === "previsao" ? "#1A5CB8" : "#C9921B") : "var(--border-row)",
                          color: form.natureza === n ? "#fff" : "var(--text-2)" }}>
                        {n === "real" ? "Real" : "Previsão"}
                      </button>
                    ))}
                  </div>
                  {editandoId && form.natureza === "previsao" && (
                    <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 5, background: "rgba(96,165,250,0.1)", color: "#60A5FA", border: "0.5px solid rgba(96,165,250,0.25)" }}>
                      Troque para "Real" para efetivar
                    </span>
                  )}
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
                      color: modalTab === t.id ? "#60A5FA" : "var(--text-3)",
                      borderBottom: modalTab === t.id ? "2px solid #3B82F6" : "2px solid transparent" }}>
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

                  {/* Linha 1: Moeda | OG (3) | Data Emissão */}
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
                      <label style={lbl}>Operação Gerencial <span style={{ color: "#E24B4A" }}>*</span> <span style={{ color: "var(--text-3)", fontWeight: 400 }}>— classifica e vincula ao plano de contas</span></label>
                      <SelectBusca
                        value={form.operacao_gerencial_id}
                        onChange={id => {
                          const op = opGerenciais.find(o => o.id === id);
                          setForm(p => ({ ...p, operacao_gerencial_id: id, categoria: op ? derivarCategoriaDespesa(op.classificacao ?? "") : p.categoria }));
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

                  {/* Badge débito/crédito da OG */}
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

                  {/* Linha 2: Fornecedor (2) | Nº Documento | Série | Tipo Doc LCDPR */}
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 140px 90px 160px", gap: 12 }}>
                    <div style={{ gridColumn: "span 2" }}>
                      <label style={lbl}>Fornecedor / Credor</label>
                      <select style={inp} value={form.pessoa_id} onChange={e => setForm(p => ({ ...p, pessoa_id: e.target.value }))}>
                        <option value="">— Selecionar do cadastro —</option>
                        {[...pessoas].sort((a, b) => {
                          if (a.fornecedor && !b.fornecedor) return -1;
                          if (!a.fornecedor && b.fornecedor) return 1;
                          return a.nome.localeCompare(b.nome, "pt-BR");
                        }).map(p => (
                          <option key={p.id} value={p.id}>{p.nome}{p.fornecedor && p.cliente ? " (Cli/Forn)" : p.cliente ? " (Cliente)" : ""}</option>
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

                  {/* Linha 3: Descrição (2) | 1º Vencimento | Forma Pgto | Conta Pgto */}
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 160px 160px 1fr", gap: 12 }}>
                    <div style={{ gridColumn: "span 2" }}>
                      <label style={lbl}>Descrição {!form.pessoa_id && <span style={{ color: "#E24B4A" }}>*</span>}</label>
                      <input style={inp} placeholder="Ex: Compra de herbicida — Talhão 3" value={form.descricao} onChange={e => setForm(p => ({ ...p, descricao: e.target.value }))} />
                    </div>
                    <div>
                      <label style={lbl}>1º Vencimento *</label>
                      <input style={inp} type="date" value={form.vencimento} onChange={e => setForm(p => ({ ...p, vencimento: e.target.value }))} />
                    </div>
                    <div>
                      <label style={lbl}>Forma de Pagamento</label>
                      <select style={inp} value={form.forma_pagamento} onChange={e => setForm(p => ({ ...p, forma_pagamento: e.target.value }))}>
                        {FORMAS_PAGAMENTO.map(f => <option key={f}>{f}</option>)}
                      </select>
                    </div>
                    <div>
                      <label style={lbl}>Conta de Pagamento</label>
                      <select style={inp} value={form.conta_pagamento} onChange={e => setForm(p => ({ ...p, conta_pagamento: e.target.value }))}>
                        <option value="">— Selecionar —</option>
                        {contas.map(c => {
                          const label = c.nome || `${c.banco ?? ""} ${c.agencia ? `Ag.${c.agencia}` : ""} ${c.conta ? `C/C ${c.conta}` : ""}`.trim();
                          return <option key={c.id} value={label}>{label}</option>;
                        })}
                        {contas.length === 0 && <option disabled>Cadastre contas em Cadastros</option>}
                      </select>
                    </div>
                  </div>

                  {/* Linha 4: Valor (por moeda) */}
                  {form.moeda === "BRL" && (
                    <div style={{ display: "grid", gridTemplateColumns: "200px 1fr", gap: 12 }}>
                      <div>
                        <label style={lbl}>Valor Total (R$) *</label>
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
                  {/* Condição de Pagamento */}
                  <div style={{ display: "grid", gridTemplateColumns: "auto auto 1fr", gap: 12, alignItems: "end" }}>
                    <div>
                      <label style={lbl}>Condição de Pagamento</label>
                      <div style={{ display: "flex", border: "0.5px solid var(--border-table)", borderRadius: 8, overflow: "hidden" }}>
                        {(["avista", "prazo", "recorrencia"] as const).map((v, idx) => (
                          <button key={v} type="button"
                            onClick={() => { setForm(p => ({ ...p, condicao: v })); if (v !== "prazo") setParcelas([]); }}
                            style={{
                              padding: "7px 14px", fontSize: 12, fontWeight: form.condicao === v ? 600 : 400,
                              cursor: "pointer", border: "none",
                              borderRight: idx < 2 ? "0.5px solid var(--border)" : "none",
                              background: form.condicao === v ? "#1A4870" : "var(--border-row)",
                              color: form.condicao === v ? "#fff" : "var(--text-2)",
                              whiteSpace: "nowrap",
                            }}>
                            {v === "avista" ? "À Vista" : v === "prazo" ? "Parcelado" : "Recorrência"}
                          </button>
                        ))}
                      </div>
                    </div>
                    {(form.condicao === "prazo" || form.condicao === "recorrencia") && (
                      <>
                        <div>
                          <label style={lbl}>{form.condicao === "prazo" ? "Nº de parcelas" : "Nº de repetições"}</label>
                          <InputNumerico style={{ ...inp, width: 80 }} decimais={0} min="2" max="120" value={form.qtdParcelas} onChange={v => setForm(p => ({ ...p, qtdParcelas: v }))} />
                        </div>
                        <div style={{ display: "flex", gap: 8, alignItems: "end" }}>
                          <div style={{ flex: 1 }}>
                            <label style={lbl}>Frequência</label>
                            <select style={inp} value={form.frequencia} onChange={e => setForm(p => ({ ...p, frequencia: e.target.value }))}>
                              <option value="1">Mensal</option>
                              <option value="2">Bimestral</option>
                              <option value="3">Trimestral</option>
                              <option value="6">Semestral</option>
                              <option value="12">Anual</option>
                            </select>
                          </div>
                          {form.condicao === "prazo" && (
                            <button type="button"
                              onClick={() => gerarParcelas(form.vencimento, Number(form.qtdParcelas), Number(form.frequencia), desmascarar(form.valorMask))}
                              disabled={!form.vencimento || !form.valorMask}
                              style={{ padding: "8px 14px", borderRadius: 8, border: "0.5px solid rgba(96,165,250,0.3)", background: "rgba(96,165,250,0.1)", color: "#60A5FA", fontWeight: 600, cursor: "pointer", fontSize: 12, whiteSpace: "nowrap", opacity: !form.vencimento || !form.valorMask ? 0.4 : 1 }}>
                              Gerar
                            </button>
                          )}
                        </div>
                      </>
                    )}
                  </div>

                  {/* Grid de parcelas */}
                  {form.condicao === "prazo" && parcelas.length === 0 && (
                    <div style={{ fontSize: 11, color: "var(--text-3)", padding: "10px 14px", background: "var(--bg-stripe)", borderRadius: 7, border: "0.5px solid var(--border-table)" }}>
                      Preencha o Vencimento e Valor, depois clique em "Gerar".
                    </div>
                  )}
                  {form.condicao === "prazo" && parcelas.length > 0 && (
                    <div style={{ overflowX: "auto" }}>
                      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                        <thead>
                          <tr style={{ background: "var(--bg-stripe)" }}>
                            {["#", "Vencimento", "Valor (R$)"].map((h, i) => (
                              <th key={i} style={{ padding: "6px 10px", textAlign: i === 2 ? "right" : i === 0 ? "center" : "left", fontSize: 11, fontWeight: 600, color: "var(--text-3)", borderBottom: "0.5px solid var(--border)" }}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {parcelas.map((p, i) => (
                            <tr key={i} style={{ borderBottom: "0.5px solid var(--bg-input)" }}>
                              <td style={{ padding: "4px 10px", textAlign: "center", color: "var(--text-3)", fontSize: 11, width: 50 }}>{i + 1}/{parcelas.length}</td>
                              <td style={{ padding: "4px 10px" }}>
                                <input style={{ ...inp, fontSize: 12 }} type="date" value={p.data}
                                  onChange={e => setParcelas(prev => prev.map((x, j) => j === i ? { ...x, data: e.target.value } : x))} />
                              </td>
                              <td style={{ padding: "4px 10px" }}>
                                <input style={{ ...inp, fontSize: 12, textAlign: "right" }} type="text" inputMode="numeric" value={p.valorMask}
                                  onChange={e => setParcelas(prev => prev.map((x, j) => j === i ? { ...x, valorMask: aplicarMascara(e.target.value) } : x))} />
                              </td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot>
                          <tr style={{ background: "var(--bg-stripe)" }}>
                            <td colSpan={2} style={{ padding: "6px 10px", textAlign: "right", fontSize: 11, fontWeight: 600, color: "var(--text-3)" }}>Total:</td>
                            <td style={{ padding: "6px 10px", textAlign: "right", fontWeight: 700, color: "#60A5FA" }}>
                              {fmtBRL(parcelas.reduce((s, p) => s + desmascarar(p.valorMask), 0))}
                            </td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  )}

                  {/* Preview recorrência */}
                  {form.condicao === "recorrencia" && (() => {
                    const qtdRecorr  = Math.max(2, Number(form.qtdParcelas) || 2);
                    const freqRecorr = Math.max(1, Number(form.frequencia)  || 1);
                    const valorRec   = desmascarar(form.valorMask);
                    const freqLabel  = ({ "1": "mensal", "2": "bimestral", "3": "trimestral", "6": "semestral", "12": "anual" } as Record<string, string>)[form.frequencia] ?? "mensal";
                    return (
                      <div>
                        <div style={{ background: "rgba(251,191,36,0.08)", border: "0.5px solid rgba(251,191,36,0.25)", borderRadius: 8, padding: "10px 14px", marginBottom: 12, fontSize: 12, color: "#FBBF24" }}>
                          O mesmo valor é lançado <strong>{qtdRecorr}×</strong> com frequência <strong>{freqLabel}</strong>. Ideal para custos fixos.
                          {valorRec > 0 && <span style={{ float: "right", fontWeight: 700 }}>Total: {fmtBRL(valorRec * qtdRecorr)}</span>}
                        </div>
                        {form.vencimento && valorRec > 0 && (
                          <div style={{ overflowX: "auto", maxHeight: 220, overflowY: "auto", borderRadius: 8, border: "0.5px solid var(--border)" }}>
                            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                              <thead style={{ position: "sticky", top: 0, background: "var(--bg-stripe)" }}>
                                <tr>
                                  {["#", "Vencimento", "Valor"].map((h, i) => (
                                    <th key={i} style={{ padding: "6px 10px", textAlign: i === 2 ? "right" : i === 0 ? "center" : "left", fontSize: 11, fontWeight: 600, color: "var(--text-3)", borderBottom: "0.5px solid var(--border)" }}>{h}</th>
                                  ))}
                                </tr>
                              </thead>
                              <tbody>
                                {Array.from({ length: qtdRecorr }, (_, i) => {
                                  const d = new Date(form.vencimento + "T12:00:00");
                                  d.setMonth(d.getMonth() + i * freqRecorr);
                                  return (
                                    <tr key={i} style={{ borderBottom: i < qtdRecorr - 1 ? "0.5px solid var(--bg-input)" : "none" }}>
                                      <td style={{ padding: "4px 10px", textAlign: "center", color: "var(--text-3)", fontSize: 11, width: 50 }}>{i + 1}/{qtdRecorr}</td>
                                      <td style={{ padding: "4px 10px", fontSize: 11, color: "var(--text-2)" }}>{fmtData(d.toISOString().split("T")[0])}</td>
                                      <td style={{ padding: "4px 10px", textAlign: "right", fontSize: 11, color: "#60A5FA", fontWeight: 600 }}>{fmtBRL(valorRec)}</td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        )}
                        {!form.vencimento && (
                          <div style={{ fontSize: 11, color: "var(--text-3)", padding: "10px 14px", background: "var(--bg-stripe)", borderRadius: 7, border: "0.5px solid var(--border-table)" }}>
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
                      <select style={inp} value={form.centro_custo} onChange={e => setForm(p => ({ ...p, centro_custo: e.target.value }))}>
                        <option value="">— Sem vínculo —</option>
                        {centrosCusto.filter(c => !centrosCusto.some(x => x.parent_id === c.id)).map(c => (
                          <option key={c.id} value={c.nome}>{c.codigo ? `${c.codigo} — ` : ""}{c.nome}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* Mão de Obra — aparece quando OG é Mão de Obra */}
                  {form.operacao_gerencial_id && (() => {
                    const og = opGerenciais.find(o => o.id === form.operacao_gerencial_id);
                    if (!og || !(og.classificacao ?? "").startsWith("2.01.01.10")) return null;
                    return (
                      <div style={{ background: "#F0F7FF", border: "0.5px solid #1A487040", borderRadius: 8, padding: 14 }}>
                        <div style={{ fontSize: 10, fontWeight: 700, color: "#1A4870", textTransform: "uppercase", letterSpacing: 1, marginBottom: 10 }}>Mão de Obra</div>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 160px 140px 120px", gap: 12 }}>
                          <div>
                            <label style={lbl}>Funcionário / Prestador</label>
                            <select style={inp} value={form.funcionario_id} onChange={e => setForm(p => ({ ...p, funcionario_id: e.target.value }))}>
                              <option value="">— Sem vínculo —</option>
                              {funcionarios.map(f => <option key={f.id} value={f.id}>{f.nome}</option>)}
                            </select>
                          </div>
                          <div>
                            <label style={lbl}>Tipo</label>
                            <select style={inp} value={form.tipo_mao_obra} onChange={e => setForm(p => ({ ...p, tipo_mao_obra: e.target.value }))}>
                              <option value="">— Selecionar —</option>
                              {["CLT","Temporário","Empreitada","Terceirizado"].map(t => <option key={t} value={t}>{t}</option>)}
                            </select>
                          </div>
                          <div>
                            <label style={lbl}>Unidade</label>
                            <select style={inp} value={form.unidade_mao_obra} onChange={e => setForm(p => ({ ...p, unidade_mao_obra: e.target.value }))}>
                              {["Hora","Dia","Ha","Sc","Tarefa","Empreitada"].map(u => <option key={u} value={u}>{u}</option>)}
                            </select>
                          </div>
                          <div>
                            <label style={lbl}>Quantidade</label>
                            <InputNumerico style={inp} min="0" placeholder="0"
                              value={form.quantidade_mao_obra}
                              onChange={v => setForm(p => ({ ...p, quantidade_mao_obra: v }))} />
                          </div>
                        </div>
                      </div>
                    );
                  })()}
                </div>
              )}

              {/* ─── Aba Adicionais ─── */}
              {modalTab === "adicionais" && (
                <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
                    <div>
                      <label style={lbl}>% Juros a.m.</label>
                      <InputMonetario style={inp} placeholder="0,00" value={form.juros_pct} onChange={v => setForm(p => ({ ...p, juros_pct: v }))} />
                    </div>
                    <div>
                      <label style={lbl}>% Multa por atraso</label>
                      <InputMonetario style={inp} placeholder="0,00" value={form.multa_pct} onChange={v => setForm(p => ({ ...p, multa_pct: v }))} />
                    </div>
                    <div>
                      <label style={lbl}>% Desc. Pontualidade</label>
                      <InputMonetario style={inp} placeholder="0,00" value={form.desconto_pct} onChange={v => setForm(p => ({ ...p, desconto_pct: v }))} />
                    </div>
                    <div>
                      <label style={lbl}>Meses Diferido</label>
                      <InputNumerico style={inp} decimais={0} min="0" placeholder="0" value={form.meses_diferido} onChange={v => setForm(p => ({ ...p, meses_diferido: v }))} />
                    </div>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                    <div>
                      <label style={lbl}>Chave XML / NF-e</label>
                      <input style={inp} placeholder="Opcional — 44 dígitos ou URL" value={form.chave_xml} onChange={e => setForm(p => ({ ...p, chave_xml: e.target.value }))} />
                    </div>
                    <div>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 4 }}>
                        <label style={lbl}>Observação</label>
                        <span style={{ fontSize: 11, color: form.obs.length > 90 ? "#E24B4A" : "var(--text-muted)" }}>{form.obs.length}/100</span>
                      </div>
                      <input style={inp} placeholder="Opcional" maxLength={100} value={form.obs} onChange={e => setForm(p => ({ ...p, obs: e.target.value }))} />
                    </div>
                  </div>
                  <div>
                    <label style={lbl}>Anexar NF (PDF ou XML)</label>
                    <input type="file" accept=".pdf,.xml,.png,.jpg"
                      onChange={e => setArquivoNF(e.target.files?.[0] ?? null)}
                      style={{ ...inp, padding: "5px 8px", cursor: "pointer" }} />
                    {arquivoNF && (
                      <div style={{ fontSize: 10, color: "#16A34A", marginTop: 3, display: "flex", alignItems: "center", gap: 6 }}>
                        <span>📎 {arquivoNF.name}</span>
                        <button type="button" onClick={() => setArquivoNF(null)} style={{ background: "none", border: "none", cursor: "pointer", color: "#E24B4A", fontSize: 11, padding: 0 }}>×</button>
                      </div>
                    )}
                    <div style={{ fontSize: 10, color: "var(--text-3)", marginTop: 3 }}>Arquivo enviado ao Storage e URL salva na chave da NF</div>
                  </div>
                </div>
              )}
            </div>

            {/* ── Rodapé ── */}
            <div style={{ padding: "12px 24px", borderTop: "0.5px solid var(--border)", display: "flex", gap: 8, alignItems: "center", background: "var(--bg-nav)", borderRadius: "0 0 12px 12px" }}>
              {errosForm.length > 0 && (
                <div style={{ flex: 1, background: "rgba(239,68,68,0.1)", border: "0.5px solid rgba(239,68,68,0.3)", borderRadius: 7, padding: "7px 12px", fontSize: 11, color: "#EF4444" }}>
                  {errosForm.map((e, i) => <div key={i}>• {e}</div>)}
                </div>
              )}
              <div style={{ display: "flex", gap: 8, marginLeft: "auto", alignItems: "center" }}>
                {editandoId && form.natureza === "previsao" && (
                  <button
                    onClick={() => { setForm(p => ({ ...p, natureza: "real" })); }}
                    style={{ padding: "8px 16px", background: "#16A34A", color: "#fff", border: "none", borderRadius: 8, fontWeight: 600, cursor: "pointer", fontSize: 13, display: "flex", alignItems: "center", gap: 6 }}
                    title="Muda para Real e abre para ajuste antes de salvar"
                  >
                    ⚡ Efetivar
                  </button>
                )}
                <button onClick={fecharModal} style={{ padding: "8px 20px", border: "0.5px solid var(--border)", borderRadius: 8, background: "var(--border-row)", color: "var(--text-2)", cursor: "pointer", fontSize: 13 }}>Cancelar</button>
                <button onClick={adicionarLancamento} disabled={disabled}
                  style={{ padding: "8px 20px", background: disabled ? "var(--text-muted)" : "#C9921B", color: "#fff", border: "none", borderRadius: 8, fontWeight: 600, cursor: disabled ? "not-allowed" : "pointer", fontSize: 13 }}>
                  {salvando ? "Salvando…" : editandoId ? "✓ Salvar alterações" : form.condicao === "prazo" && parcelas.length > 0 ? `◈ Criar ${parcelas.length} parcelas` : form.condicao === "prazo" ? `◈ Criar ${Math.max(2, Number(form.qtdParcelas) || 2)} parcelas` : form.condicao === "recorrencia" ? `◈ Criar ${Math.max(2, Number(form.qtdParcelas) || 2)} repetições` : "◈ Salvar"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Menu de colunas */}
      {menuColunas && (
        <ContextMenuColunas
          x={menuColunas.x}
          y={menuColunas.y}
          colunas={COLS_CP}
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

export default function ContasPagar() {
  return (
    <Suspense>
      <ContasPagarInner />
    </Suspense>
  );
}
