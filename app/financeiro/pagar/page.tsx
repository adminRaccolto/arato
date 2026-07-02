"use client";
import { useState, useEffect, useMemo, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import TopNav from "../../../components/TopNav";
import InputMonetario from "../../../components/InputMonetario";
import InputNumerico from "../../../components/InputNumerico";
import { useAuth } from "../../../components/AuthProvider";
import CascadeSelector, { type CascadeValues } from "../../../components/CascadeSelector";
import { listarLancamentosContaPeriodo, criarLancamento, criarParcelamento, baixarLancamento, reabrirLancamento, reabrirLancamentos, criarPagamentoLote, listarAnosSafra, listarPessoasDaConta, listarProdutoresDaConta, listarProdutoresViaFazenda, listarOperacoesGerenciaisAtivasDaConta, excluirLancamento, listarCentrosCustoGeral, listarTalhoes, listarFuncionarios, listarContasBancariasDaConta } from "../../../lib/db";
import type { Lancamento, AnoSafra, Produtor, Pessoa, Ciclo, OperacaoGerencial, CentroCusto, Talhao, Funcionario } from "../../../lib/supabase";
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
  manual:              { label: "Manual",          bg: "#F1EFE8", cl: "#555",     border: "#DDE2EE" },
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
}[s] ?? { cor: "#888", title: s });

// ── Estilos ───────────────────────────────────────────────────
const inp: React.CSSProperties = { width: "100%", padding: "8px 10px", border: "0.5px solid #D4DCE8", borderRadius: 8, fontSize: 13, background: "#fff", boxSizing: "border-box", outline: "none" };
const inpF: React.CSSProperties = { width: "100%", padding: "4px 7px", border: "0.5px solid #D4DCE8", borderRadius: 6, fontSize: 11, background: "#FAFBFC", boxSizing: "border-box", outline: "none" };
const lbl: React.CSSProperties = { fontSize: 11, color: "#555", marginBottom: 4, display: "block" };

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
  const [modalTab,   setModalTab]   = useState<"principal"|"parcelas"|"vinculos"|"adicionais">("principal");
  const [alertaNF, setAlertaNF] = useState<Lancamento | null>(null);

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
    condicao: "avista" as "avista" | "prazo",
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
  const [mostrarObs,  setMostrarObs]  = useState(false);
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
      if (fOperacao   && !l.categoria.toLowerCase().includes(fOperacao.toLowerCase()))         return false;
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
  }, [filtradosBase, fFornecedor, fOperacao, fSafra, fVencDe, fVencAte, fMoedaOrig, fConta, fProdutor, fObs, anosSafra, produtores]);

  // ── Baixar ─────────────────────────────────────────────────

  const abrirBaixa = (l: Lancamento) => {
    // Intercepta se não tem NF vinculada (exceto barter e lançamentos de arrendamento/financiamento)
    const categoriasSemNF = ["Arrendamento de Terra", "Pagamento de Custeio", "Pagamento de Financiamento", "Pagamento de Empréstimo", "Consórcio — A Contemplar", "Consórcio — Contemplado", "Impostos", "Juros e IOF", "Combustível — Consumo Direto"];
    const precisaNF = l.moeda !== "barter" && !l.nfe_numero && !categoriasSemNF.includes(l.categoria ?? "");
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
    if (!editandoId && form.condicao === "prazo" && parcelas.length === 0) erros.push("Gere as parcelas antes de salvar (aba Parcelas).");
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

  // ── Render ─────────────────────────────────────────────────

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh", background: "#F3F6F9", fontFamily: "system-ui, sans-serif", fontSize: 13 }}>
      <TopNav />
      <main style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>

        {/* Header */}
        <header style={{
          background: "#fff",
          borderBottom: "0.5px solid #D4DCE8",
          padding: "12px 24px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexDirection: "row",
          gap: 0,
        }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 18, fontWeight: 600, color: "#1a1a1a" }}>Contas a Pagar</h1>
            <p style={{ margin: "2px 0 0", fontSize: 11, color: "#444" }}>Compromissos financeiros, parcelas e pagamentos — ordenados por vencimento</p>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 11, color: "#555" }}>Período:</span>
            <input type="date" value={periodoInicio}
              onChange={e => setPeriodoInicio(e.target.value)}
              style={{ fontSize: 12, padding: "5px 8px", border: "0.5px solid #D4DCE8", borderRadius: 6, outline: "none" }} />
            <span style={{ fontSize: 11, color: "#888" }}>até</span>
            <input type="date" value={periodoFim}
              onChange={e => setPeriodoFim(e.target.value)}
              style={{ fontSize: 12, padding: "5px 8px", border: "0.5px solid #D4DCE8", borderRadius: 6, outline: "none" }} />
            <button
              onClick={() => {
              setCascade({});
              setModalTab("principal");
              setForm({ moeda: "BRL", pessoa_id: "", descricao: "", categoria: CATS_CP[0], vencimento: "", valorMask: "", cotacaoMask: "5,12", sacasMask: "", culturaBarter: "soja", precoSacaMask: "120,00", obs: "", condicao: "avista", qtdParcelas: "2", frequencia: "1", tipo_documento_lcdpr: "RECIBO", juros_pct: 0, multa_pct: 0, desconto_pct: 0, meses_diferido: "0", chave_xml: "", centro_custo: "", ano_safra_id: "", produtor_id: "", ciclo_id: "", talhao_id: "", operacao_gerencial_id: "", natureza: "real", forma_pagamento: "PIX", conta_pagamento: "", data_emissao: TODAY, numero_documento: "", serie: "", funcionario_id: "", tipo_mao_obra: "", unidade_mao_obra: "Dia", quantidade_mao_obra: "" });
              setParcelas([]);
              setOpGerBusca("");
              setArquivoNF(null);
              setErrosForm([]);
              carregarOps();
              setModalNovo(true);
            }}
              style={{ background: "#C9921B", color: "#fff", border: "none", borderRadius: 8, padding: "9px 18px", fontSize: 13, fontWeight: 600, cursor: "pointer", marginLeft: 4 }}
            >
              ↑ Nova Conta a Pagar
            </button>
          </div>
        </header>

        <div style={{ padding: "18px 24px", flex: 1, overflowY: "auto" }}>

          {/* Alerta vencidos */}
          {(qVencido > 0 || qVencendo > 0) && (
            <div style={{ background: qVencido > 0 ? "#FCEBEB" : "#FAEEDA", border: `0.5px solid ${qVencido > 0 ? "#E24B4A" : "#EF9F27"}50`, borderRadius: 8, padding: "9px 14px", marginBottom: 14, fontSize: 12, color: qVencido > 0 ? "#791F1F" : "#633806", display: "flex", gap: 8 }}>
              <span>⚠</span>
              <span>
                {qVencido > 0 && <><strong>{qVencido} conta(s) vencida(s)</strong> — efetue a baixa ou renegocie. </>}
                {qVencendo > 0 && <><strong>{qVencendo} vencendo hoje</strong>.</>}
              </span>
            </div>
          )}

          {erro && (
            <div style={{ background: "#FDECEA", border: "0.5px solid #E24B4A60", borderRadius: 8, padding: "10px 14px", marginBottom: 14, fontSize: 12, color: "#8B1A1A", display: "flex", gap: 8 }}>
              <span>✕</span><span>{erro}</span>
              <button onClick={carregar} style={{ marginLeft: "auto", fontSize: 11, color: "#8B1A1A", background: "none", border: "none", cursor: "pointer", textDecoration: "underline" }}>Tentar novamente</button>
            </div>
          )}

          {loading && <div style={{ textAlign: "center", padding: 40, color: "#444" }}>Carregando…</div>}

          {!loading && (
            <div style={{ background: "#fff", borderRadius: 12, border: "0.5px solid #D4DCE8", overflow: "hidden" }}>

              {/* Filtros de status */}
              <div style={{ padding: "12px 16px", borderBottom: "0.5px solid #DEE5EE", display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                {([
                  { key: "aberto",   label: "Em aberto",  count: lancOper.filter(l => statusEfetivo(l) !== "baixado" && l.moeda !== "barter").length, cor: "#E24B4A" },
                  { key: "vencido",  label: "Vencidos",   count: qVencido + qVencendo,                                                                             cor: "#E24B4A" },
                  { key: "baixado",  label: "Pagos",      count: lancamentos.filter(l => (l.natureza ?? "real") === "real" && l.status === "baixado").length, cor: "#E24B4A" },
                  { key: "barter",   label: "Barter",     count: lancamentos.filter(l => (l.natureza ?? "real") === "real" && l.moeda === "barter").length,   cor: "#E24B4A" },
                  { key: "previsao", label: "Previsões",  count: lancamentos.filter(l => l.natureza === "previsao").length,                       cor: "#1A5CB8" },
                  { key: "todos",    label: "Todos",      count: lancamentos.length,                                                               cor: "#E24B4A" },
                ] as { key: Filtro; label: string; count: number; cor: string }[]).map(f => (
                  <button
                    key={f.key}
                    onClick={() => setFiltro(f.key)}
                    style={{
                      padding: "5px 12px", borderRadius: 20, border: "0.5px solid",
                      borderColor: filtro === f.key ? f.cor : "#D4DCE8",
                      background:  filtro === f.key ? (f.key === "previsao" ? "#D5E8F5" : "#FCEBEB") : "transparent",
                      color:       filtro === f.key ? (f.key === "previsao" ? "#0B2D50" : "#791F1F") : "#666",
                      fontWeight: filtro === f.key ? 600 : 400, fontSize: 12, cursor: "pointer",
                    }}
                  >
                    {f.label}
                    <span style={{ marginLeft: 5, fontSize: 10, background: filtro === f.key ? f.cor : "#DEE5EE", color: filtro === f.key ? "#fff" : "#555", padding: "1px 5px", borderRadius: 8 }}>
                      {f.count}
                    </span>
                  </button>
                ))}
                {hasColFilter && (
                  <button onClick={limparFiltrosColunas} style={{ marginLeft: "auto", padding: "4px 12px", borderRadius: 8, border: "0.5px solid #D4DCE8", background: "#F4F6FA", color: "#555", fontSize: 11, cursor: "pointer" }}>
                    ✕ Limpar filtros de coluna
                  </button>
                )}
                {selecionados.size > 0 && (
                  <button
                    onClick={async () => {
                      const manuais = filtrados.filter(l => selecionados.has(l.id) && l.status !== "baixado");
                      if (manuais.length === 0) { alert("Nenhum lançamento em aberto selecionado para excluir."); return; }
                      if (!confirm(`Excluir ${manuais.length} lançamento${manuais.length !== 1 ? "s" : ""}?\nEsta ação não pode ser desfeita.`)) return;
                      const ids = manuais.map(l => l.id);
                      const { error } = await supabase.from("lancamentos").delete().in("id", ids);
                      if (error) { alert("Erro ao excluir: " + error.message); return; }
                      setLancamentos(prev => prev.filter(x => !ids.includes(x.id)));
                      setSelecionados(new Set());
                    }}
                    style={{ marginLeft: hasColFilter ? 0 : "auto", padding: "4px 12px", borderRadius: 8, border: "0.5px solid #E24B4A", background: "#FDECEA", color: "#C0392B", fontSize: 11, cursor: "pointer", fontWeight: 600 }}
                  >
                    🗑 Excluir ({selecionados.size})
                  </button>
                )}
                <span style={{ marginLeft: (hasColFilter || selecionados.size > 0) ? 0 : "auto", fontSize: 11, color: "#888" }}>
                  {filtrados.length} / {filtradosBase.length} registros
                </span>
              </div>

              {/* Tabela wide */}
              <div style={{ overflow: "auto", maxHeight: "calc(100vh - 300px)" }}>
                {filtradosBase.length === 0 ? (
                  <div style={{ padding: 40, textAlign: "center", color: "#444", fontSize: 13 }}>
                    Nenhuma conta encontrada para este filtro.
                  </div>
                ) : (
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead style={{ position: "sticky", top: 0, zIndex: 3 }}>
                      {/* Cabeçalhos */}
                      <tr style={{ background: "#F3F6F9" }}>
                        <th style={thS(32)}>
                          <input type="checkbox"
                            style={{ cursor: "pointer", accentColor: "#1A5CB8" }}
                            checked={filtrados.length > 0 && filtrados.every(l => selecionados.has(l.id))}
                            onChange={toggleTodos}
                            title="Selecionar todos"
                          />
                        </th>
                        <th style={thS(150, "left")}>Fornecedor / Cliente</th>
                        <th style={thS(150, "left")}>Operação</th>
                        <th style={thS(100, "left")}>Safra</th>
                        <th style={thS(180, "left")}>Ciclo</th>
                        <th style={thS(85, "center")}>Vencimento ↑</th>
                        <th style={thS(110, "right")}>Valor</th>
                        <th style={thS(85, "center")}>Dt. Pgto</th>
                        <th style={thS(100, "right")}>Valor Pago</th>
                        <th style={thS(65, "center")}>Moeda</th>
                        <th style={thS(110, "left")}>Conta</th>
                        <th style={thS(110, "left")}>Produtor</th>
                        <th style={thS(90, "center")}>Origem</th>
                        <th style={{ ...thS(mostrarObs ? 160 : 28), display: mostrarObs ? undefined : "table-cell", overflow: "hidden", maxWidth: mostrarObs ? undefined : 28 }}>
                          <button onClick={() => setMostrarObs(v => !v)} title={mostrarObs ? "Ocultar observação" : "Mostrar observação"} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 12, color: mostrarObs ? "#1A4870" : "#aaa", padding: 0, lineHeight: 1 }}>
                            {mostrarObs ? "👁 Obs" : "👁"}
                          </button>
                        </th>
                        <th style={thS(70, "center")}></th>
                      </tr>
                      {/* Linha de filtros */}
                      <tr style={{ background: "#FAFBFC", borderBottom: "0.5px solid #D4DCE8" }}>
                        <td style={{ padding: "4px 4px" }}></td>
                        <td style={{ padding: "3px 6px" }}>
                          <input style={inpF} placeholder="Buscar…" value={fFornecedor} onChange={e => setFFornecedor(e.target.value)} />
                        </td>
                        <td style={{ padding: "3px 6px" }}>
                          <input style={inpF} placeholder="Buscar…" value={fOperacao} onChange={e => setFOperacao(e.target.value)} />
                        </td>
                        <td style={{ padding: "3px 6px" }}>
                          <select style={inpF} value={fSafra} onChange={e => setFSafra(e.target.value)}>
                            <option value="">Todas</option>
                            {anosSafra.map(a => <option key={a.id} value={a.id}>{a.descricao}</option>)}
                          </select>
                        </td>
                        <td></td>
                        <td></td>
                        <td></td>
                        <td></td>
                        <td></td>
                        <td style={{ padding: "3px 6px" }}>
                          <input style={inpF} placeholder="Buscar…" value={fConta} onChange={e => setFConta(e.target.value)} />
                        </td>
                        <td style={{ padding: "3px 6px" }}>
                          <input style={inpF} placeholder="Buscar…" value={fProdutor} onChange={e => setFProdutor(e.target.value)} />
                        </td>
                        <td></td>
                        {mostrarObs ? (
                          <td style={{ padding: "3px 6px" }}>
                            <input style={inpF} placeholder="Buscar…" value={fObs} onChange={e => setFObs(e.target.value)} />
                          </td>
                        ) : <td style={{ maxWidth: 28, overflow: "hidden", padding: 0 }}></td>}
                        <td></td>
                      </tr>
                    </thead>
                    <tbody>
                      {filtrados.length === 0 ? (
                        <tr>
                          <td colSpan={16} style={{ padding: 24, textAlign: "center", color: "#888", fontSize: 12 }}>
                            Nenhum resultado para os filtros aplicados.
                          </td>
                        </tr>
                      ) : filtrados.map((l, li) => {
                        const isPrevisao = l.natureza === "previsao";
                        const sEfet     = statusEfetivo(l);
                        const dot       = dotStatus(sEfet);
                        const conv      = l.moeda === "USD" ? fmtBRL(l.valor * (l.cotacao_usd ?? COTACAO_USD)) : null;
                        const safra     = anosSafra.find(a => a.id === l.ano_safra_id)?.descricao ?? "—";
                        const cicloDesc = ciclos.find(c => c.id === l.ciclo_id)?.descricao ?? "—";
                        const prod      = produtores.find(p => p.id === l.produtor_id)?.nome ?? "—";
                        const isVenc    = !isPrevisao && (sEfet === "vencido" || sEfet === "vencendo");
                        const pessoaNome = pessoas.find(p => p.id === l.pessoa_id)?.nome;
                        const fornRaw   = pessoaNome ?? exibirFornecedor(l.descricao);
                        // Remove " - OPERAÇÃO" duplicado do final do nome
                        const fornNome  = l.categoria ? fornRaw.replace(new RegExp(`\\s*-\\s*${l.categoria.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`, 'i'), '').trim() : fornRaw;
                        const obsExibir = obsArrendamento(l, safra);
                        const om = origemMeta(l);
                        return (
                          <tr key={l.id} style={{ borderBottom: li < filtrados.length - 1 ? "0.5px solid #DEE5EE" : "none", background: isPrevisao ? "#EFF6FF" : l.moeda === "barter" ? "#FEF8ED" : "transparent", borderLeft: isPrevisao ? "3px dashed #1A5CB8" : `3px solid ${om.border}` }}>
                            {/* ● Sinalizador / Checkbox */}
                            <td style={{ padding: "6px 4px", textAlign: "center" }}>
                              <input type="checkbox"
                                style={{ cursor: "pointer", accentColor: l.status === "baixado" ? "#16A34A" : "#1A5CB8" }}
                                checked={selecionados.has(l.id)}
                                onChange={() => toggleSel(l.id)}
                              />
                            </td>
                            {/* Fornecedor / Cliente */}
                            <td style={{ padding: "5px 8px" }}>
                              <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                                <span style={{ fontWeight: 400, fontSize: 10, color: "#1a1a1a", whiteSpace: "nowrap" }}>{fornNome}</span>
                                {isPrevisao && <span style={{ fontSize: 9, background: "#1A5CB8", color: "#fff", padding: "1px 4px", borderRadius: 4, fontWeight: 700 }}>PREV</span>}
                              </div>
                              {l.total_parcelas && l.total_parcelas > 1 && (
                                <span style={{ fontSize: 9, background: "#E6F1FB", color: "#0C447C", padding: "1px 4px", borderRadius: 4, fontWeight: 600 }}>
                                  {l.num_parcela}/{l.total_parcelas}
                                </span>
                              )}
                            </td>
                            {/* Operação */}
                            <td style={{ padding: "5px 8px" }}>
                              <span style={{ fontSize: 10, background: "#FAEEDA", color: "#633806", padding: "2px 6px", borderRadius: 7, whiteSpace: "nowrap" }}>{l.categoria}</span>
                            </td>
                            {/* Safra */}
                            <td style={{ padding: "5px 8px", fontSize: 10, color: "#555", whiteSpace: "nowrap" }}>
                              {l.ano_safra_id ? safra : "—"}
                            </td>
                            {/* Ciclo */}
                            <td style={{ padding: "5px 8px", fontSize: 10, color: "#555", whiteSpace: "nowrap" }}>
                              {l.ciclo_id ? cicloDesc : "—"}
                            </td>
                            {/* Vencimento */}
                            <td style={{ padding: "5px 8px", textAlign: "center", fontSize: 11, whiteSpace: "nowrap", color: isVenc ? "#E24B4A" : "#444", fontWeight: isVenc ? 600 : 400 }}>
                              {fmtData(l.data_vencimento)}
                            </td>
                            {/* Valor */}
                            <td style={{ padding: "5px 8px", textAlign: "right", whiteSpace: "nowrap" }}>
                              <div style={{ fontWeight: 600, color: l.moeda === "barter" ? "#8B5E14" : "#E24B4A", fontSize: 12 }}>{exibirValor(l)}</div>
                              {conv && <div style={{ fontSize: 9, color: "#888" }}>{conv}</div>}
                            </td>
                            {/* Data Pgto */}
                            <td style={{ padding: "5px 8px", textAlign: "center", fontSize: 10, color: "#16A34A", whiteSpace: "nowrap" }}>
                              {fmtData(l.data_baixa)}
                            </td>
                            {/* Valor Pago */}
                            <td style={{ padding: "5px 8px", textAlign: "right", fontSize: 11, whiteSpace: "nowrap" }}>
                              {l.status === "parcial" && l.valor_pago != null && l.valor_pago > 0
                                ? <div>
                                    <span style={{ color: "#C9921B", fontWeight: 600 }}>{fmtBRL(l.valor_pago)}</span>
                                    <div style={{ fontSize: 9, color: "#888" }}>de {fmtBRL(paraBRL(l))}</div>
                                    <div style={{ height: 3, borderRadius: 2, background: "#F0EBE0", marginTop: 2 }}>
                                      <div style={{ height: 3, borderRadius: 2, background: "#C9921B", width: `${Math.min(100, (l.valor_pago / paraBRL(l)) * 100)}%` }} />
                                    </div>
                                  </div>
                                : l.valor_pago != null && l.valor_pago > 0
                                  ? <span style={{ color: "#16A34A", fontWeight: 600 }}>{fmtBRL(l.valor_pago)}</span>
                                  : <span style={{ color: "#bbb" }}>—</span>}
                            </td>
                            {/* Moeda */}
                            <td style={{ padding: "5px 8px", textAlign: "center" }}>
                              <span style={{ fontSize: 9, padding: "2px 5px", borderRadius: 5, background: l.moeda === "USD" ? "#FEF3E2" : l.moeda === "barter" ? "#FBF3E0" : "#F0F4FA", color: l.moeda === "USD" ? "#7A4300" : l.moeda === "barter" ? "#8B5E14" : "#444", fontWeight: 600 }}>
                                {l.moeda === "barter" ? "Barter" : (l.moeda_pagamento && l.moeda_pagamento !== l.moeda ? `${l.moeda}→${l.moeda_pagamento}` : l.moeda)}
                              </span>
                            </td>
                            {/* Conta */}
                            <td style={{ padding: "5px 8px", fontSize: 10, color: "#555", whiteSpace: "nowrap" }}>
                              {contas.find(c => c.id === l.conta_bancaria)?.nome ?? "—"}
                            </td>
                            {/* Produtor */}
                            <td style={{ padding: "5px 8px", fontSize: 10, color: "#555", whiteSpace: "nowrap" }}>
                              {l.produtor_id ? prod : "—"}
                            </td>
                            {/* Origem */}
                            <td style={{ padding: "5px 8px", textAlign: "center" }}>
                              <span style={{ fontSize: 9, background: om.bg, color: om.cl, padding: "2px 6px", borderRadius: 7, fontWeight: 600, whiteSpace: "nowrap" }}>{om.label}</span>
                            </td>
                            {/* Observação — última coluna, ocultável */}
                            <td style={{ padding: mostrarObs ? "5px 8px" : 0, fontSize: 10, color: "#666", whiteSpace: "nowrap", display: mostrarObs ? undefined : "table-cell", maxWidth: mostrarObs ? undefined : 28, overflow: "hidden" }}>
                              {mostrarObs ? obsExibir : null}
                            </td>
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
                                    style={{ fontSize: 13, padding: "3px 7px", borderRadius: 6, cursor: "pointer", background: "transparent", color: "#555", border: "0.5px solid #CCC", lineHeight: 1 }}
                                  >
                                    ✏
                                  </button>
                                )}
                                {l.nfe_numero && (
                                  <span title={`NF vinculada: ${l.nfe_numero}`} style={{ fontSize: 11, padding: "2px 6px", borderRadius: 5, background: "#D5E8F5", color: "#0B2D50", border: "0.5px solid #1A4870", fontWeight: 700 }}>
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

              <div style={{ padding: "10px 16px", borderTop: "0.5px solid #DEE5EE", display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 11, color: "#444", background: "#F9FAFB" }}>
                <span>CP automáticas: <strong style={{ color: "#C9921B" }}>{lancamentos.filter(l => l.auto).length}</strong></span>
                <div style={{ display: "flex", gap: 24, alignItems: "center" }}>
                  <span>Exibindo {filtrados.length} de {filtradosBase.length} registros</span>
                  {filtrados.length > 0 && (
                    <>
                      <span style={{ color: "#888" }}>|</span>
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

      {/* ── Alerta: CP sem NF ───────────────────────────────────── */}
      {alertaNF && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ background: "#fff", borderRadius: 12, padding: 28, width: 420, boxShadow: "0 4px 20px rgba(11,45,80,0.10)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
              <span style={{ fontSize: 22 }}>⚠️</span>
              <span style={{ fontWeight: 700, fontSize: 15, color: "#1a1a1a" }}>Conta a Pagar sem Nota Fiscal</span>
            </div>
            <div style={{ fontSize: 13, color: "#555", marginBottom: 6 }}>{alertaNF.descricao}</div>
            <div style={{ fontSize: 12, color: "#888", marginBottom: 20 }}>
              Este lançamento não possui nota fiscal vinculada. Para conformidade com o LCDPR e SPED, recomenda-se registrar a NF antes de baixar.
            </div>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button onClick={() => setAlertaNF(null)} style={{ padding: "8px 16px", borderRadius: 8, border: "0.5px solid #CCC", background: "#F4F6FA", cursor: "pointer", fontSize: 13 }}>Cancelar</button>
              <button onClick={async () => {
                // Garante que existe uma pendência fiscal para este lançamento
                const l = alertaNF;
                const { data: existe } = await supabase.from("pendencias_fiscais")
                  .select("id").eq("lancamento_id", l.id).maybeSingle();
                if (!existe) {
                  await supabase.from("pendencias_fiscais").insert({
                    fazenda_id:      fid,
                    lancamento_id:   l.id,
                    tipo:            "compra",
                    status:          "aguardando",
                    descricao:       l.descricao ?? "",
                    valor:           l.valor ?? 0,
                    data_operacao:   l.data_vencimento ?? TODAY,
                    fornecedor_nome: "",
                    origem:          "manual",
                  });
                }
                setAlertaNF(null);
                router.push("/fiscal/pendencias");
              }} style={{ padding: "8px 16px", borderRadius: 8, border: "0.5px solid #1A4870", background: "transparent", color: "#1A4870", cursor: "pointer", fontSize: 13, fontWeight: 600 }}>
                📎 Vincular Nota
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
              }} style={{ padding: "8px 16px", borderRadius: 8, border: "none", background: "#C9921B", color: "#fff", cursor: "pointer", fontSize: 13, fontWeight: 600 }}>
                Continuar sem NF
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
            style={{ background: "none", border: "0.5px solid rgba(255,255,255,0.4)", color: "#fff", borderRadius: 8, padding: "6px 12px", fontSize: 12, cursor: "pointer" }}
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
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }}
          onClick={e => { if (e.target === e.currentTarget) setModalBaixa(null); }}>
          <div style={{ background: "#fff", borderRadius: 12, width: "100%", maxWidth: 620, maxHeight: "93vh", overflowY: "auto" as const, boxShadow: "0 4px 20px rgba(11,45,80,0.10)", padding: 24 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 4 }}>
              <div style={{ fontWeight: 700, fontSize: 15, color: "#1a1a1a" }}>
                {modalBaixa.moeda === "barter" ? "Confirmar entrega (barter)" : modalBaixa.status === "parcial" ? "Registrar pagamento parcial" : "Registrar pagamento"}
              </div>
              <button onClick={() => setModalBaixa(null)} style={{ background: "none", border: "none", fontSize: 18, cursor: "pointer", color: "#888" }}>×</button>
            </div>
            <div style={{ fontSize: 12, color: "#555", marginBottom: 16 }}>{modalBaixa.descricao}</div>
            <div style={{ background: "#F8FAFB", borderRadius: 8, padding: "8px 12px", fontSize: 12, color: "#555", marginBottom: 20, display: "flex", gap: 20, flexWrap: "wrap" }}>
              <span>Valor original: <strong style={{ color: "#E24B4A" }}>{fmtBRL(valorTotal)}</strong></span>
              {jaPago > 0 && <span>Já pago: <strong style={{ color: "#16A34A" }}>{fmtBRL(jaPago)}</strong></span>}
              {jaPago > 0 && <span>Saldo restante: <strong style={{ color: "#C9921B" }}>{fmtBRL(valorOrig)}</strong></span>}
              <span>Vencimento: <strong>{modalBaixa.data_vencimento ? new Date(modalBaixa.data_vencimento + "T12:00").toLocaleDateString("pt-BR") : "—"}</strong></span>
            </div>

            {modalBaixa.moeda === "barter" ? (
              <div style={{ display: "grid", gap: 14 }}>
                <div style={{ background: "#FBF3E0", borderRadius: 8, padding: "10px 12px", fontSize: 12, color: "#8B5E14" }}>
                  <strong>⇄ {modalBaixa.sacas?.toLocaleString("pt-BR")} sc {modalBaixa.cultura_barter} @ R$ {modalBaixa.preco_saca_barter?.toLocaleString("pt-BR")}/sc</strong>
                  <div style={{ fontSize: 11, color: "#555", marginTop: 3 }}>Sem movimentação bancária</div>
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
                      <input style={{ ...inp, marginBottom: 4 }} placeholder="Buscar operação…" value={baixa.og_busca}
                        onChange={e => setBaixa(p => ({ ...p, og_busca: e.target.value }))} />
                      <select style={inp} value={baixa.operacao_gerencial_id}
                        onChange={e => setBaixa(p => ({ ...p, operacao_gerencial_id: e.target.value }))}>
                        <option value="">— Sem operação gerencial —</option>
                        {Object.entries(
                          opGerenciais
                            .filter(o => !baixa.og_busca || `${o.classificacao ?? ""} ${o.descricao}`.toLowerCase().includes(baixa.og_busca.toLowerCase()))
                            .reduce((acc, o) => {
                              const k = (o.classificacao ?? "").split(".").slice(0, 3).join(".");
                              (acc[k] = acc[k] ?? []).push(o);
                              return acc;
                            }, {} as Record<string, typeof opGerenciais>)
                        ).map(([k, items]) => (
                          <optgroup key={k} label={k}>
                            {items.map(o => <option key={o.id} value={o.id}>{o.classificacao} — {o.descricao}</option>)}
                          </optgroup>
                        ))}
                      </select>
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
                      <label htmlFor="salvar_class_cp" style={{ fontSize: 12, color: "#555", cursor: "pointer", lineHeight: 1.3 }}>
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
              <button onClick={() => setModalBaixa(null)} style={{ padding: "8px 18px", border: "0.5px solid #D4DCE8", borderRadius: 8, background: "transparent", cursor: "pointer", fontSize: 13 }}>Cancelar</button>
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
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }}
          onClick={e => { if (e.target === e.currentTarget) setModalLote(false); }}>
          <div style={{ background: "#fff", borderRadius: 12, width: "100%", maxWidth: 580, maxHeight: "90vh", overflowY: "auto" as const, boxShadow: "0 4px 20px rgba(11,45,80,0.10)" }}>
            <div style={{ padding: "16px 22px", borderBottom: "0.5px solid #D4DCE8", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 15, color: "#1a1a1a" }}>Pagamento em Lote (Borderô)</div>
                <div style={{ fontSize: 11, color: "#555", marginTop: 2 }}>{itensLote.length} título{itensLote.length !== 1 ? "s" : ""} · total {fmtBRL(totalLote)}</div>
              </div>
              <button onClick={() => setModalLote(false)} style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer", color: "#555" }}>×</button>
            </div>
            <div style={{ padding: "18px 22px" }}>

              {/* Parâmetros do lote */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 12, marginBottom: 16 }}>
                <div>
                  <label style={{ fontSize: 11, color: "#555", marginBottom: 3, display: "block" }}>Data do Pagamento *</label>
                  <input type="date" style={{ ...inp }} value={loteData} onChange={e => setLoteData(e.target.value)} />
                </div>
                <div>
                  <label style={{ fontSize: 11, color: "#555", marginBottom: 3, display: "block" }}>Conta Bancária *</label>
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
                  <label style={{ fontSize: 11, color: "#555", marginBottom: 3, display: "block" }}>Descrição do Borderô (opcional)</label>
                  <input style={{ ...inp }} value={loteDesc} onChange={e => setLoteDesc(e.target.value)} placeholder={`Borderô ${loteData} — ${itensLote.length} títulos`} />
                </div>
              </div>

              {/* Lista dos títulos selecionados */}
              <div style={{ border: "0.5px solid #D4DCE8", borderRadius: 8, overflow: "hidden", marginBottom: 14 }}>
                <div style={{ background: "#F3F6F9", padding: "6px 12px", fontSize: 10, fontWeight: 700, color: "#555", textTransform: "uppercase", display: "grid", gridTemplateColumns: "1fr auto auto", gap: 8 }}>
                  <span>Título</span><span>Vencimento</span><span style={{ textAlign: "right" }}>Valor</span>
                </div>
                {itensLote.map((l, i) => (
                  <div key={l.id} style={{ display: "grid", gridTemplateColumns: "1fr auto auto", gap: 8, padding: "8px 12px", borderTop: i > 0 ? "0.5px solid #EEF1F6" : "none", fontSize: 12, alignItems: "center" }}>
                    <span style={{ color: "#1a1a1a", fontWeight: 500 }}>{exibirFornecedor(l.descricao)}</span>
                    <span style={{ color: "#555", whiteSpace: "nowrap" }}>{fmtData(l.data_vencimento)}</span>
                    <span style={{ fontWeight: 600, color: "#E24B4A", textAlign: "right", whiteSpace: "nowrap" }}>{exibirValor(l)}</span>
                  </div>
                ))}
                <div style={{ background: "#F3F6F9", padding: "8px 12px", display: "flex", justifyContent: "space-between", borderTop: "0.5px solid #D4DCE8" }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: "#555" }}>Total do lote</span>
                  <span style={{ fontSize: 14, fontWeight: 700, color: "#1A4870" }}>{fmtBRL(totalLote)}</span>
                </div>
              </div>

              {/* Aviso conciliação */}
              <div style={{ background: "#D5E8F5", border: "0.5px solid #1A487040", borderRadius: 7, padding: "8px 12px", fontSize: 11, color: "#0B2D50", marginBottom: 14 }}>
                Este lote será registrado como <strong>uma única saída de caixa</strong> de {fmtBRL(totalLote)} na conciliação bancária.
                Cada título será baixado individualmente.
              </div>

              {loteErro && (
                <div style={{ background: "#FCEBEB", border: "0.5px solid #E24B4A60", borderRadius: 7, padding: "8px 12px", fontSize: 12, color: "#791F1F", marginBottom: 12 }}>
                  {loteErro}
                </div>
              )}

              <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
                <button onClick={() => setModalLote(false)} style={{ padding: "8px 18px", border: "0.5px solid #D4DCE8", borderRadius: 8, background: "#fff", cursor: "pointer", fontSize: 13 }}>Cancelar</button>
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
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }}
          onClick={e => { if (e.target === e.currentTarget) fecharModal(); }}>
          <div style={{ background: "#fff", borderRadius: 12, width: "95vw", maxWidth: 920, maxHeight: "92vh", overflowY: "auto" as const, boxShadow: "0 4px 20px rgba(11,45,80,0.10)", display: "flex", flexDirection: "column" }}>

            {/* ── Cabeçalho ── */}
            <div style={{ padding: "16px 24px 0", borderBottom: "0.5px solid #DEE5EE" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12, flexWrap: "wrap", gap: 8 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <span style={{ fontWeight: 700, fontSize: 15, color: "#1a1a1a" }}>
                    {editandoId ? "✏ Editar Conta a Pagar" : "Nova Conta a Pagar"}
                  </span>
                  <div style={{ display: "flex", gap: 0, border: "0.5px solid #D4DCE8", borderRadius: 8, overflow: "hidden" }}>
                    {(["real", "previsao"] as const).map(n => (
                      <button key={n} onClick={() => setForm(p => ({ ...p, natureza: n }))}
                        style={{ padding: "4px 14px", border: "none", cursor: "pointer", fontSize: 12, fontWeight: form.natureza === n ? 700 : 400,
                          background: form.natureza === n ? (n === "previsao" ? "#1A5CB8" : "#C9921B") : "#fff",
                          color: form.natureza === n ? "#fff" : "#666" }}>
                        {n === "real" ? "Real" : "Previsão"}
                      </button>
                    ))}
                  </div>
                  {editandoId && form.natureza === "previsao" && (
                    <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 5, background: "#D5E8F5", color: "#0B2D50", border: "0.5px solid #1A4870" }}>
                      Troque para "Real" para efetivar
                    </span>
                  )}
                </div>
              </div>

              {/* Abas */}
              <div style={{ display: "flex", gap: 0 }}>
                {([
                  { id: "principal",  label: "Principal"  },
                  { id: "parcelas",   label: "Parcelas", hidden: !!editandoId },
                  { id: "vinculos",   label: "Vínculos"   },
                  { id: "adicionais", label: "Adicionais" },
                ] as const).filter(t => !("hidden" in t && t.hidden)).map(t => (
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
                      <label style={lbl}>Operação Gerencial <span style={{ color: "#E24B4A" }}>*</span> <span style={{ color: "#888", fontWeight: 400 }}>— classifica e vincula ao plano de contas</span></label>
                      <input style={{ ...inp, marginBottom: 4 }} placeholder="Buscar operação…" value={opGerBusca} onChange={e => setOpGerBusca(e.target.value)} />
                      <select style={inp} value={form.operacao_gerencial_id}
                        onChange={e => {
                          const id = e.target.value;
                          const op = opGerenciais.find(o => o.id === id);
                          setForm(p => ({ ...p, operacao_gerencial_id: id, categoria: op ? derivarCategoriaDespesa(op.classificacao ?? "") : p.categoria }));
                        }}>
                        <option value="">— Selecionar operação —</option>
                        {Object.entries(
                          opGerenciais
                            .filter(o => !opGerBusca || `${o.classificacao ?? ""} ${o.descricao}`.toLowerCase().includes(opGerBusca.toLowerCase()))
                            .reduce((acc, o) => {
                              const k = (o.classificacao ?? "").split(".").slice(0, 3).join(".");
                              (acc[k] = acc[k] ?? []).push(o);
                              return acc;
                            }, {} as Record<string, typeof opGerenciais>)
                        ).map(([k, items]) => (
                          <optgroup key={k} label={k}>
                            {items.map(o => <option key={o.id} value={o.id}>{o.classificacao} — {o.descricao}</option>)}
                          </optgroup>
                        ))}
                      </select>
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
                </div>
              )}

              {/* ─── Aba Parcelas ─── */}
              {modalTab === "parcelas" && (
                <div>
                  <div style={{ display: "flex", gap: 8, marginBottom: 18 }}>
                    {(["avista", "prazo"] as const).map(v => (
                      <button key={v} type="button"
                        onClick={() => { setForm(p => ({ ...p, condicao: v })); if (v === "avista") setParcelas([]); }}
                        style={{ flex: 1, padding: "10px", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer",
                          border: "0.5px solid " + (form.condicao === v ? "#C9921B" : "#D4DCE8"),
                          background: form.condicao === v ? "#FBF3E0" : "#fff",
                          color: form.condicao === v ? "#7A5200" : "#555" }}>
                        {v === "avista" ? "À Vista" : "Parcelado"}
                      </button>
                    ))}
                  </div>

                  {form.condicao === "avista" && (
                    <div style={{ fontSize: 12, color: "#888", padding: "12px 16px", background: "#F4F6FA", borderRadius: 8 }}>
                      Pagamento em parcela única. Defina o vencimento na aba Principal.
                    </div>
                  )}

                  {form.condicao === "prazo" && (
                    <>
                      <div style={{ display: "grid", gridTemplateColumns: "160px 200px auto", gap: 12, alignItems: "end", marginBottom: 16 }}>
                        <div>
                          <label style={lbl}>Nº de parcelas</label>
                          <InputNumerico style={inp} decimais={0} min="2" max="120" value={form.qtdParcelas} onChange={v => setForm(p => ({ ...p, qtdParcelas: v }))} />
                        </div>
                        <div>
                          <label style={lbl}>Frequência</label>
                          <select style={inp} value={form.frequencia} onChange={e => setForm(p => ({ ...p, frequencia: e.target.value }))}>
                            <option value="1">Mensal</option>
                            <option value="2">Bimestral</option>
                            <option value="3">Trimestral</option>
                            <option value="6">Semestral</option>
                            <option value="12">Anual</option>
                          </select>
                        </div>
                        <button type="button"
                          onClick={() => gerarParcelas(form.vencimento, Number(form.qtdParcelas), Number(form.frequencia), desmascarar(form.valorMask))}
                          disabled={!form.vencimento || !form.valorMask}
                          style={{ padding: "8px 18px", borderRadius: 8, border: "0.5px solid #1A5CB8", background: "#D5E8F5", color: "#0B2D50", fontWeight: 600, cursor: "pointer", fontSize: 12, whiteSpace: "nowrap", opacity: !form.vencimento || !form.valorMask ? 0.4 : 1 }}>
                          Gerar parcelas
                        </button>
                      </div>

                      {parcelas.length === 0 && (
                        <div style={{ fontSize: 11, color: "#888", padding: "10px 14px", background: "#F4F6FA", borderRadius: 7 }}>
                          Preencha 1º Vencimento e Valor na aba Principal, depois clique em "Gerar parcelas".
                        </div>
                      )}
                      {parcelas.length > 0 && (
                        <div style={{ overflowX: "auto" }}>
                          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                            <thead>
                              <tr style={{ background: "#F3F6F9" }}>
                                {["#", "Vencimento", "Valor (R$)"].map((h, i) => (
                                  <th key={i} style={{ padding: "6px 10px", textAlign: i === 2 ? "right" : i === 0 ? "center" : "left", fontSize: 11, fontWeight: 600, color: "#555", borderBottom: "0.5px solid #D4DCE8" }}>{h}</th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {parcelas.map((p, i) => (
                                <tr key={i} style={{ borderBottom: "0.5px solid #DEE5EE" }}>
                                  <td style={{ padding: "4px 10px", textAlign: "center", color: "#555", fontSize: 11, width: 50 }}>{i + 1}/{parcelas.length}</td>
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
                              <tr style={{ background: "#F3F6F9" }}>
                                <td colSpan={2} style={{ padding: "6px 10px", textAlign: "right", fontSize: 11, fontWeight: 600, color: "#555" }}>Total:</td>
                                <td style={{ padding: "6px 10px", textAlign: "right", fontWeight: 700, color: "#1A4870" }}>
                                  {fmtBRL(parcelas.reduce((s, p) => s + desmascarar(p.valorMask), 0))}
                                </td>
                              </tr>
                            </tfoot>
                          </table>
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}

              {/* ─── Aba Vínculos ─── */}
              {modalTab === "vinculos" && (
                <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

                  {/* Resumo da hierarquia definida na aba Principal */}
                  <div style={{ background: "#F4F6FA", border: "0.5px solid #DDE2EE", borderRadius: 10, padding: "12px 16px" }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: "#888", textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>Apropriação (definida na aba Principal)</div>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 12 }}>
                      {[
                        { label: "Produtor",  val: produtores.find(p => p.id === cascade.produtorId)?.nome },
                        { label: "Fazenda",   val: cascade.fazendaId ? "Selecionada" : undefined },
                        { label: "Ano Safra", val: anosSafra.find(a => a.id === cascade.anoSafraId)?.descricao },
                        { label: "Ciclo",     val: cascade.cicloId ? "Selecionado" : undefined },
                        { label: "Talhão",    val: cascade.talhaoId ? "Selecionado" : undefined },
                      ].map(({ label, val }) => (
                        <div key={label}>
                          <div style={{ fontSize: 10, fontWeight: 600, color: "#888", marginBottom: 3 }}>{label}</div>
                          <div style={{ fontSize: 13, color: val ? "#1A4870" : "#aaa", fontWeight: val ? 600 : 400 }}>{val ?? "—"}</div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Linha 3: Centro de Custo */}
                  <div>
                    <div style={{ fontSize: 10, fontWeight: 700, color: "#888", textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>Contabilidade</div>
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
                  </div>

                  {/* Seção Mão de Obra — aparece quando OG é Mão de Obra */}
                  {form.operacao_gerencial_id && (() => {
                    const og = opGerenciais.find(o => o.id === form.operacao_gerencial_id);
                    if (!og || !(og.classificacao ?? "").startsWith("2.01.01.10")) return null;
                    return (
                      <div style={{ background: "#F0F7FF", border: "0.5px solid #1A487040", borderRadius: 8, padding: 14 }}>
                        <div style={{ fontSize: 10, fontWeight: 700, color: "#1A4870", textTransform: "uppercase", letterSpacing: 1, marginBottom: 10 }}>👷 Mão de Obra</div>
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
                        <span style={{ fontSize: 11, color: form.obs.length > 90 ? "#E24B4A" : "#aaa" }}>{form.obs.length}/100</span>
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
                    <div style={{ fontSize: 10, color: "#888", marginTop: 3 }}>Arquivo enviado ao Storage e URL salva na chave da NF</div>
                  </div>
                </div>
              )}
            </div>

            {/* ── Rodapé ── */}
            <div style={{ padding: "12px 24px", borderTop: "0.5px solid #DEE5EE", display: "flex", gap: 8, alignItems: "center", background: "#FAFBFC", borderRadius: "0 0 12px 12px" }}>
              {errosForm.length > 0 && (
                <div style={{ flex: 1, background: "#FCEBEB", border: "0.5px solid #E24B4A60", borderRadius: 7, padding: "7px 12px", fontSize: 11, color: "#791F1F" }}>
                  {errosForm.map((e, i) => <div key={i}>• {e}</div>)}
                </div>
              )}
              <div style={{ display: "flex", gap: 8, marginLeft: "auto", alignItems: "center" }}>
                {/* Botão Efetivar — visível só ao editar uma previsão */}
                {editandoId && form.natureza === "previsao" && (
                  <button
                    onClick={() => { setForm(p => ({ ...p, natureza: "real" })); }}
                    style={{ padding: "8px 16px", background: "#16A34A", color: "#fff", border: "none", borderRadius: 8, fontWeight: 600, cursor: "pointer", fontSize: 13, display: "flex", alignItems: "center", gap: 6 }}
                    title="Muda para Real e abre para ajuste antes de salvar"
                  >
                    ⚡ Efetivar
                  </button>
                )}
                <button onClick={fecharModal} style={{ padding: "8px 20px", border: "0.5px solid #D4DCE8", borderRadius: 8, background: "transparent", cursor: "pointer", fontSize: 13 }}>Cancelar</button>
                <button onClick={adicionarLancamento} disabled={disabled}
                  style={{ padding: "8px 20px", background: disabled ? "#aaa" : "#C9921B", color: "#fff", border: "none", borderRadius: 8, fontWeight: 600, cursor: disabled ? "not-allowed" : "pointer", fontSize: 13 }}>
                  {salvando ? "Salvando…" : editandoId ? "✓ Salvar alterações" : form.condicao === "prazo" && parcelas.length > 0 ? `◈ Criar ${parcelas.length} parcelas` : form.condicao === "prazo" ? `◈ Criar ${Math.max(2, Number(form.qtdParcelas) || 2)} parcelas` : "◈ Salvar"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── th helper ───────────────────────────────────────────────
function thS(_minW: number, align: "left" | "center" | "right" = "left"): React.CSSProperties {
  return {
    padding: "5px 8px",
    textAlign: align,
    fontSize: 10,
    fontWeight: 600,
    color: "#555",
    borderBottom: "0.5px solid #D4DCE8",
    whiteSpace: "nowrap",
  };
}

export default function ContasPagar() {
  return (
    <Suspense>
      <ContasPagarInner />
    </Suspense>
  );
}
