"use client";
import { useState, useEffect } from "react";
import TopNav from "../../../components/TopNav";
import InputMonetario from "../../../components/InputMonetario";
import InputNumerico from "../../../components/InputNumerico";
import {
  listarContratosFinanceiros, listarContratosFinanceirosDaConta, criarContratoFinanceiro, atualizarContratoFinanceiro, excluirContratoFinanceiro,
  listarParcelasLiberacao, criarParcelaLiberacao, excluirParcelaLiberacao,
  listarParcelasPagamento, salvarParcelasPagamento, baixarLancamento,
  listarGarantias, criarGarantia, excluirGarantia,
  listarCentrosCusto, salvarCentrosCusto,
  listarAditivos, criarAditivo, excluirAditivo,
  listarOrigensRefinanciamento, vincularOrigemRefinanciamento, desvincularOrigemRefinanciamento,
  listarMatriculas,
  listarMaquinas,
  listarContas,
  listarImoveisUrbanos,
  listarFazendas,
  listarCentrosCustoGeralDaConta,
  listarPessoasDaConta,
} from "../../../lib/db";
import { supabase } from "../../../lib/supabase";
import { useAuth } from "../../../components/AuthProvider";
import PlanoGate from "../../../components/PlanoGate";
import type {
  ContratoFinanceiro, ParcelaLiberacao, ParcelaPagamento,
  GarantiaContrato, CentroCustoContrato, MatriculaImovel,
  ContaBancaria, Pessoa, Maquina, AditivoContrato, ImovelUrbano, Produtor,
  CentroCusto, ContratoRefinanciamento,
} from "../../../lib/supabase";

// ── estilos base ──────────────────────────────────────────
const inp: React.CSSProperties = { width: "100%", padding: "8px 10px", border: "0.5px solid var(--border-table)", borderRadius: 8, fontSize: 13, color: "var(--text-1)", background: "var(--bg-card)", boxSizing: "border-box", outline: "none" };
const lbl: React.CSSProperties = { fontSize: 11, color: "var(--text-2)", marginBottom: 4, display: "block" };
const btnV: React.CSSProperties = { padding: "8px 18px", background: "#1A5C38", color: "#fff", border: "none", borderRadius: 8, fontWeight: 600, cursor: "pointer", fontSize: 13 };
const btnR: React.CSSProperties = { padding: "8px 18px", border: "0.5px solid var(--border-table)", borderRadius: 8, background: "transparent", cursor: "pointer", fontSize: 13, color: "var(--text-1)" };
const btnX: React.CSSProperties = { padding: "4px 10px", border: "0.5px solid #E24B4A50", borderRadius: 6, background: "#FCEBEB", cursor: "pointer", fontSize: 11, color: "#791F1F" };
const btnE: React.CSSProperties = { padding: "4px 10px", border: "0.5px solid var(--border-table)", borderRadius: 6, background: "transparent", cursor: "pointer", fontSize: 11, color: "#666" };
const secTit: React.CSSProperties = { fontSize: 11, fontWeight: 600, color: "#111111", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10, marginTop: 18, paddingBottom: 4, borderBottom: "0.5px solid var(--border-table)" };

const fmtBRL = (v: number | null | undefined) => (v ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fmtNum = (v: number | null | undefined, dec = 2) => (v ?? 0).toLocaleString("pt-BR", { minimumFractionDigits: dec, maximumFractionDigits: dec });
const fmtData = (s?: string) => s ? s.split("-").reverse().join("/") : "—";

function aaParaAm(aa: number) { return (Math.pow(1 + aa / 100, 1 / 12) - 1) * 100; }
function amParaAa(am: number) { return (Math.pow(1 + am / 100, 12) - 1) * 100; }

function badge(t: string, bg = "#E8E8E8", color = "#0D0D0D") {
  return <span style={{ fontSize: 10, background: bg, color, padding: "2px 7px", borderRadius: 8, fontWeight: 600 }}>{t}</span>;
}

function SecTitle({ children }: { children: React.ReactNode }) {
  return <div style={secTit}>{children}</div>;
}

// ── Tipos auxiliares ──────────────────────────────────────
type ParcelaBase = Omit<ParcelaPagamento, "id"|"created_at"|"contrato_id"|"fazenda_id"|"lancamento_id"|"status">;
type CarenciaTipo = "so_juros" | "total";
type AbaModal = "principal" | "liberacao" | "pagamento" | "garantias" | "centrocusto" | "aditivos" | "movimentacoes";

function aplicarCarencia(saldo: number, taxaMensal: number, carencia: number, carenciaTipo: CarenciaTipo): { saldoFinal: number; parcelas: ParcelaBase[] } {
  const parcelas: ParcelaBase[] = [];
  let s = saldo;
  for (let i = 1; i <= carencia; i++) {
    if (carenciaTipo === "total") {
      s = s * (1 + taxaMensal);
      parcelas.push({ num_parcela: i, data_vencimento: "", amortizacao: 0, juros: 0, despesas_acessorios: 0, valor_parcela: 0, saldo_devedor: s });
    } else {
      const juros = s * taxaMensal;
      parcelas.push({ num_parcela: i, data_vencimento: "", amortizacao: 0, juros, despesas_acessorios: 0, valor_parcela: juros, saldo_devedor: s });
    }
  }
  return { saldoFinal: s, parcelas };
}

function calcularSAC(principal: number, taxaMensal: number, nParcelas: number, carencia: number, carenciaTipo: CarenciaTipo = "so_juros"): ParcelaBase[] {
  const { saldoFinal, parcelas } = aplicarCarencia(principal, taxaMensal, carencia, carenciaTipo);
  let saldo = saldoFinal;
  const amort = saldo / nParcelas;
  for (let i = 1; i <= nParcelas; i++) {
    const juros = saldo * taxaMensal;
    saldo -= amort;
    parcelas.push({ num_parcela: carencia + i, data_vencimento: "", amortizacao: amort, juros, despesas_acessorios: 0, valor_parcela: amort + juros, saldo_devedor: Math.max(0, saldo) });
  }
  return parcelas;
}

function calcularPRICE(principal: number, taxaMensal: number, nParcelas: number, carencia: number, carenciaTipo: CarenciaTipo = "so_juros"): ParcelaBase[] {
  const { saldoFinal, parcelas } = aplicarCarencia(principal, taxaMensal, carencia, carenciaTipo);
  let saldo = saldoFinal;
  const pmt = taxaMensal === 0 ? saldo / nParcelas : saldo * (taxaMensal * Math.pow(1 + taxaMensal, nParcelas)) / (Math.pow(1 + taxaMensal, nParcelas) - 1);
  for (let i = 1; i <= nParcelas; i++) {
    const juros = saldo * taxaMensal;
    const amort = pmt - juros;
    saldo -= amort;
    parcelas.push({ num_parcela: carencia + i, data_vencimento: "", amortizacao: Math.max(0, amort), juros, despesas_acessorios: 0, valor_parcela: pmt, saldo_devedor: Math.max(0, saldo) });
  }
  return parcelas;
}

// SACRE: amortizações crescem geometricamente a taxa g por período
// AM_k = AM_1 × (1+g)^(k-1), com sum(AM_k) = saldoFinal
// Prestações = AM_k + juros_k (decrescentes quando queda de juros domina)
function calcularSACRE(principal: number, taxaPeriodo: number, nParcelas: number, crescPct: number, carencia: number, carenciaTipo: CarenciaTipo): ParcelaBase[] {
  const { saldoFinal, parcelas } = aplicarCarencia(principal, taxaPeriodo, carencia, carenciaTipo);
  let saldo = saldoFinal;
  const g = (crescPct || 0) / 100;
  const am1 = g === 0 ? saldo / nParcelas : saldo * g / (Math.pow(1 + g, nParcelas) - 1);
  for (let i = 1; i <= nParcelas; i++) {
    const juros = saldo * taxaPeriodo;
    const amort = am1 * Math.pow(1 + g, i - 1);
    saldo = Math.max(0, saldo - amort);
    parcelas.push({ num_parcela: carencia + i, data_vencimento: "", amortizacao: amort, juros, despesas_acessorios: 0, valor_parcela: amort + juros, saldo_devedor: saldo });
  }
  return parcelas;
}

function aplicarDatas(parcelas: ParcelaBase[], dataPrimeiro: string, periodicidadeMeses: number): ParcelaBase[] {
  return parcelas.map((p, i) => {
    const d = new Date(dataPrimeiro + "T12:00:00");
    d.setMonth(d.getMonth() + i * periodicidadeMeses);
    return { ...p, data_vencimento: d.toISOString().slice(0, 10) };
  });
}

const LINHAS_CREDITO = ["PRONAF","PRONAMP","FCO Rural","FNO Rural","FNE Rural","BNDES/ABC","BNDES Finame","PCA — Programa para Construção e Ampliação de Armazéns","Custeio Livre (Recursos Próprios)","Custeio SNCR","CPR Física","CPR Financeira","EGF — Empréstimo do Governo Federal","Crédito Rural Outros","Financiamento Livre","Outros"];

const TIPO_META: Record<ContratoFinanceiro["tipo"], { label: string; bg: string; cl: string }> = {
  custeio:       { label: "Custeio",        bg: "#E8E8E8", cl: "#0D0D0D" },
  investimento:  { label: "Investimento",   bg: "#E6F1FB", cl: "#0C447C" },
  securitizacao: { label: "Securitização",  bg: "#FBF0D8", cl: "#7A5A12" },
  cpr:           { label: "CPR",            bg: "#FAEEDA", cl: "#633806" },
  egf:           { label: "EGF",            bg: "#FBF3E0", cl: "#8B5E14" },
  outros:        { label: "Outros",         bg: "#F1EFE8", cl: "var(--text-2)"    },
};

const TIPO_GAR_META: Record<NonNullable<GarantiaContrato["tipo_garantia"]>, { label: string; bg: string; cl: string }> = {
  alienacao_fiduciaria: { label: "Alienação Fiduciária", bg: "#E8E8E8", cl: "#0D0D0D" },
  hipoteca:             { label: "Hipoteca",              bg: "#FAEEDA", cl: "#633806" },
  penhor_rural:         { label: "Penhor Rural",          bg: "#FBF3E0", cl: "#8B5E14" },
  aval:                 { label: "Aval",                  bg: "#E8F5EB", cl: "#1A5C35" },
  nota_promissoria:     { label: "Nota Promissória",      bg: "#EDE9FB", cl: "#4B3B9B" },
  cpr_garantia:         { label: "CPR como Garantia",     bg: "#FEF3E2", cl: "#7A4300" },
  cessao_recebiveis:    { label: "Cessão de Recebíveis",  bg: "#E6F1FB", cl: "#0C447C" },
  outros:               { label: "Outros",                bg: "#F1EFE8", cl: "var(--text-2)"    },
};

const GRAU_META: Record<"1_grau"|"2_grau"|"3_grau", string> = { "1_grau": "1° Grau", "2_grau": "2° Grau", "3_grau": "3° Grau" };

const TIPO_BEM_META: Record<NonNullable<GarantiaContrato["tipo_bem"]>, string> = {
  imovel: "Imóvel Rural", imovel_urbano: "Imóvel Urbano", maquina: "Máquina / Veículo", semovente: "Semovente (Gado)", produto_agricola: "Produto Agrícola", outro: "Outro",
};

const STATUS_META: Record<ContratoFinanceiro["status"], { label: string; bg: string; cl: string }> = {
  ativo:        { label: "Ativo",        bg: "#E8E8E8", cl: "#0D0D0D" },
  quitado:      { label: "Quitado",      bg: "#F1EFE8", cl: "var(--text-2)" },
  cancelado:    { label: "Cancelado",    bg: "#FCEBEB", cl: "#791F1F" },
  refinanciado: { label: "Refinanciado", bg: "#EDE9FB", cl: "#4B3B9B" },
};

const FC_VAZIO = {
  fazenda_id: "",
  descricao: "", pessoa_id: "", credor: "", produtor_id: "",
  tipo: "custeio" as ContratoFinanceiro["tipo"],
  tipo_calculo: "sac" as ContratoFinanceiro["tipo_calculo"],
  linha_credito: "", moeda: "BRL" as "BRL" | "USD",
  valor_financiado: "", valor_cotacao: "",
  data_contrato: "", numero_documento: "",
  taxa_tipo: "fixa" as "fixa" | "variavel",
  indexador: "", spread_aa: "", spread_am: "",
  taxa_variavel_ref: "",
  taxa_juros_aa: "", taxa_juros_am: "",
  iof_pct: "", tac_valor: "", outros_custos: "",
  conta_liberacao_id: "", conta_pagamento_id: "",
  forma_pagamento: "", local_pagamento: "",
  carencia_meses: "0", periodicidade_meses: "1",
  carencia_tipo: "so_juros" as "so_juros" | "total",
  crescimento_pct: "", rateio_por_vencimento: false, fiscal: true, observacao: "",
};

const FA_VAZIO = {
  data_aditivo: "", tipo: "prorrogacao" as AditivoContrato["tipo"],
  descricao: "", nova_data_vencimento: "", nova_taxa_aa: "", nova_taxa_am: "",
  novo_valor_financiado: "", novo_num_parcelas: "", obs: "",
};



export default function ContratosFinanceiros() {
  const { fazendaId, fazendaIds, contaId, podeAcessarPlano, contaModulosOverrides, anoSafraVigenteId, userRole } = useAuth();
  const [fazendas, setFazendas]         = useState<{ id: string; nome: string }[]>([]);
  const [fazendaFiltro, setFazendaFiltro] = useState("");
  const [contratos, setContratos] = useState<ContratoFinanceiro[]>([]);
  const [contas, setContas]       = useState<ContaBancaria[]>([]);
  const [pessoas, setPessoas]     = useState<Pessoa[]>([]);
  const [produtores, setProdutores] = useState<Produtor[]>([]);
  const [salvando, setSalvando]   = useState(false);
  const [erroCarregamento, setErroCarregamento] = useState<string | null>(null);
  const [ptax, setPtax]           = useState<number | null>(null);
  // taxa variável — valor de referência buscado da tabela taxas_variaveis_historico
  const [taxaVariavelRef, setTaxaVariavelRef] = useState<number | null>(null);
  const [loadingTaxaRef, setLoadingTaxaRef]   = useState(false);

  // modal unificado
  const [modalAberto, setModalAberto]       = useState(false);
  const [contratoModal, setContratoModal]   = useState<ContratoFinanceiro | null>(null);
  const [abaModal, setAbaModal]             = useState<AbaModal>("principal");
  const [erroModal, setErroModal]           = useState<string | null>(null);
  const [fC, setFC]                         = useState({ ...FC_VAZIO });

  // PDF / IA
  const [pdfFile,       setPdfFile]       = useState<File | null>(null);
  const [pdfUrl,        setPdfUrl]        = useState<string | null>(null);
  const [pdfNome,       setPdfNome]       = useState<string | null>(null);
  const [iaExtraindo,   setIaExtraindo]   = useState(false);
  const [iaConfianca,   setIaConfianca]   = useState<"alta"|"media"|"baixa"|null>(null);
  const [parcelasIAPdf, setParcelasIAPdf] = useState<{ data_vencimento: string; valor: number }[] | null>(null);

  // dados das abas
  const [parcelasLiberacao, setParcelasLiberacao] = useState<ParcelaLiberacao[]>([]);
  const [parcelasPagamento, setParcelasPagamento] = useState<ParcelaPagamento[]>([]);
  const [parcelasEditadas,  setParcelasEditadas]  = useState<Record<string, { data_vencimento?: string; valor_parcela?: string }>>({});
  const [garantias, setGarantias]                 = useState<GarantiaContrato[]>([]);
  const [centrosCusto, setCentrosCusto]           = useState<CentroCustoContrato[]>([]);
  const [ccAnosSafra, setCcAnosSafra]             = useState<{ id: string; descricao: string }[]>([]);
  const [ccCiclos, setCcCiclos]                   = useState<{ id: string; descricao?: string; cultura?: string; ano_safra_id?: string }[]>([]);
  const [ccOptions, setCcOptions]                 = useState<CentroCusto[]>([]);
  const [aditivos, setAditivos]                   = useState<AditivoContrato[]>([]);
  const [origensRefin, setOrigensRefin]           = useState<ContratoRefinanciamento[]>([]);
  const [fRefin, setFRefin]                       = useState({ contrato_origem_id: "", saldo_incorporado: "" });
  const [matriculas, setMatriculas]               = useState<MatriculaImovel[]>([]);
  const [maquinas, setMaquinas]                   = useState<Maquina[]>([]);
  const [imoveisUrbanos, setImoveisUrbanos]       = useState<ImovelUrbano[]>([]);
  const [prazoMap, setPrazoMap]                   = useState<Record<string, number>>({});

  // modal de baixa de parcela
  const TODAY_STR = new Date().toISOString().slice(0, 10);
  const [modalBaixaParcela, setModalBaixaParcela] = useState<ParcelaPagamento | null>(null);
  const [baixaPData,   setBaixaPData]   = useState(TODAY_STR);
  const [baixaPValor,  setBaixaPValor]  = useState("");
  const [baixaPConta,  setBaixaPConta]  = useState("");
  const [baixandoP,    setBaixandoP]    = useState(false);
  const [baixaPErro,   setBaixaPErro]   = useState("");

  // resumo de pagamentos por contrato (para KPIs)
  const [resumoParcelas, setResumoParcelas] = useState<Record<string, { pago: number; aberto: number; pagoAmort: number; pagoJuros: number; abertoAmort: number; abertoJuros: number }>>({});
  const [kpiDetalhado, setKpiDetalhado]     = useState(false);
  // filtros de coluna
  const [colBusca,  setColBusca]  = useState("");
  const [colTipo,   setColTipo]   = useState("");
  const [colMoeda,  setColMoeda]  = useState("");
  const [colCalc,   setColCalc]   = useState("");
  const [colStatus, setColStatus] = useState("");

  // forms das abas
  const [fLib, setFLib]   = useState({ data_liberacao: "", valor_liberado: "", parcelas_liberacao: "1" });
  const [fGar, setFGar]   = useState({ tipo_garantia: "alienacao_fiduciaria" as GarantiaContrato["tipo_garantia"], grau: "" as "" | "1_grau" | "2_grau" | "3_grau", tipo_bem: "imovel" as GarantiaContrato["tipo_bem"], matricula_id: "", imovel_urbano_id: "", maquina_id: "", descricao: "", valor_avaliacao: "", percentual_bem: "100" });
  const [centrosForm, setCentrosForm] = useState<{ ciclo_id: string; centro_custo_id: string; percentual: string; valor: string }[]>([{ ciclo_id: "", centro_custo_id: "", percentual: "100", valor: "" }]);
  const [fCalc, setFCalc] = useState({ nParcelas: "12", taxaMensal: "1.5", dataPrimeiro: "", periodicidade: "1", acessorios: "0" });
  const [fAdit, setFAdit] = useState({ ...FA_VAZIO });
  const [cnpjBusca, setCnpjBusca] = useState("");
  const [cnpjBuscaStatus, setCnpjBuscaStatus] = useState<"idle"|"encontrado"|"nao_encontrado">("idle");

  // ── Carregar base ──
  useEffect(() => {
    if (!fazendaId) return;
    setErroCarregamento(null);
    const hintIds = fazendaIds && fazendaIds.length > 0 ? fazendaIds : (fazendaId ? [fazendaId] : []);
    listarContratosFinanceirosDaConta(contaId, fazendaId, hintIds)
      .then(setContratos)
      .catch(err => {
        console.error("[CF] Erro ao carregar contratos financeiros:", err);
        setErroCarregamento(String(err?.message ?? err ?? "Erro desconhecido ao carregar contratos"));
      });
    listarFazendas(fazendaId).then(f => setFazendas(f as { id: string; nome: string }[])).catch(() => {});
    listarContas(fazendaId).then(c => setContas(c.filter(x => x.ativa))).catch(() => {});
    listarPessoasDaConta(fazendaId).then(all => setPessoas(all)).catch(() => {});
    supabase.from("produtores").select("*").eq("conta_id", contaId).order("nome").then(({ data }) => setProdutores(data ?? []));
    const buscarPtax = () => fetch("/api/precos").then(r => r.json()).then(d => { const t = d.usdPtax ?? d.usdBrl; if (t && t > 1) setPtax(t); }).catch(() => {});
    buscarPtax();
    const timer = setInterval(buscarPtax, 5 * 60 * 1000);
    return () => clearInterval(timer);
  }, [fazendaId, contaId]);

  // ── Carrega parcelas por contrato (prazo + resumo pago/aberto) ──
  useEffect(() => {
    if (contratos.length === 0) { setPrazoMap({}); setResumoParcelas({}); return; }
    const ids = contratos.map(c => c.id);
    supabase.from("parcelas_pagamento").select("contrato_id, status, valor_parcela, amortizacao, juros").in("contrato_id", ids)
      .then(({ data }) => {
        if (!data) return;
        const m: Record<string, number> = {};
        const r: Record<string, { pago: number; aberto: number; pagoAmort: number; pagoJuros: number; abertoAmort: number; abertoJuros: number }> = {};
        for (const p of data) {
          m[p.contrato_id] = (m[p.contrato_id] ?? 0) + 1;
          if (!r[p.contrato_id]) r[p.contrato_id] = { pago: 0, aberto: 0, pagoAmort: 0, pagoJuros: 0, abertoAmort: 0, abertoJuros: 0 };
          const amort = p.amortizacao ?? 0;
          const juros = p.juros ?? 0;
          if (p.status === "pago") {
            r[p.contrato_id].pago      += p.valor_parcela ?? 0;
            r[p.contrato_id].pagoAmort += amort;
            r[p.contrato_id].pagoJuros += juros;
          } else {
            r[p.contrato_id].aberto      += p.valor_parcela ?? 0;
            r[p.contrato_id].abertoAmort += amort;
            r[p.contrato_id].abertoJuros += juros;
          }
        }
        setPrazoMap(m);
        setResumoParcelas(r);
      });
  }, [contratos]);

  // ── Busca taxa variável de referência da tabela taxas_variaveis_historico ──
  const buscarTaxaVariavelRef = async (indexador: string) => {
    if (!indexador || indexador === "Outro") { setTaxaVariavelRef(null); setFC(p => ({ ...p, taxa_variavel_ref: "" })); return; }
    setLoadingTaxaRef(true);
    const { data } = await supabase
      .from("taxas_variaveis_historico")
      .select("valor_pct, ano, mes")
      .eq("indexador", indexador)
      .order("ano", { ascending: false })
      .order("mes", { ascending: false })
      .limit(1);
    const taxa = data?.[0]?.valor_pct ?? null;
    setTaxaVariavelRef(taxa);
    setFC(p => ({ ...p, taxa_variavel_ref: taxa != null ? String(taxa) : "" }));
    setLoadingTaxaRef(false);
  };

  // ── Busca credor por CNPJ/CPF ──
  const buscarCredorPorCnpj = async () => {
    const doc = cnpjBusca.replace(/\D/g, "");
    if (doc.length < 11) return;
    // 1. Tenta na lista já carregada
    const local = pessoas.find(p => (p.cpf_cnpj ?? "").replace(/\D/g, "") === doc);
    if (local) { onPessoaChange(local.id); setCnpjBuscaStatus("encontrado"); return; }
    // 2. Busca direta por CPF/CNPJ (fallback — pessoas já deveriam estar em memória)
    const { data } = await supabase.from("pessoas").select("*").in("fazenda_id", fazendaIds).ilike("cpf_cnpj", `%${doc}%`).limit(5);
    const match = (data ?? []).find((p: { cpf_cnpj?: string }) => (p.cpf_cnpj ?? "").replace(/\D/g, "") === doc);
    if (match) {
      setPessoas(prev => prev.find(p => p.id === match.id) ? prev : [...prev, match as Pessoa]);
      onPessoaChange(match.id);
      setCnpjBuscaStatus("encontrado");
    } else {
      setCnpjBuscaStatus("nao_encontrado");
    }
  };

  // ── Carregar dados ao mudar aba ──
  useEffect(() => {
    if (!contratoModal?.id) return;
    const id = contratoModal.id;
    if (abaModal === "liberacao")  listarParcelasLiberacao(id).then(setParcelasLiberacao).catch(() => {});
    if (abaModal === "pagamento") listarParcelasPagamento(id).then(p => {
      setParcelasPagamento(p); setParcelasEditadas({});
      // Auto-preenche calculadora a partir das parcelas existentes
      if (p.length > 0 && p[0].data_vencimento) {
        setFCalc(prev => ({
          ...prev,
          nParcelas: String(p.length),
          dataPrimeiro: prev.dataPrimeiro || p[0].data_vencimento,
        }));
      }
    }).catch(() => {});
    if (abaModal === "garantias") {
      listarGarantias(id).then(setGarantias).catch(() => {});
      listarMatriculas(fazendaId!).then(setMatriculas).catch(() => {});
      listarMaquinas(fazendaId!).then(m => setMaquinas(m.filter(x => x.ativa))).catch(() => {});
      listarImoveisUrbanos(fazendaId!).then(setImoveisUrbanos).catch(() => {});
    }
    if (abaModal === "centrocusto") {
      listarCentrosCusto(id).then(cc => {
        setCentrosCusto(cc);
        setCentrosForm(cc.length > 0
          ? cc.map(c => ({ ciclo_id: c.ciclo_id ?? "", centro_custo_id: c.centro_custo_id ?? "", percentual: String(c.percentual), valor: String(c.valor) }))
          : [{ ciclo_id: "", centro_custo_id: "", percentual: "100", valor: "" }]);
      }).catch(() => {});
      Promise.all([
        supabase.from("anos_safra").select("id, descricao").in("fazenda_id", fazendaIds).order("descricao"),
        supabase.from("ciclos").select("id, descricao, cultura, ano_safra_id").in("fazenda_id", fazendaIds).order("descricao"),
        listarCentrosCustoGeralDaConta(fazendaId),
      ]).then(([as_, ci, cc]) => {
        setCcAnosSafra(as_.data ?? []);
        setCcCiclos(ci.data ?? []);
        setCcOptions(cc);
      }).catch(() => {});
    }
    if (abaModal === "aditivos") {
      listarAditivos(id).then(setAditivos).catch(() => {});
      listarOrigensRefinanciamento(id).then(setOrigensRefin).catch(() => {});
    }
    if (abaModal === "movimentacoes") {
      listarParcelasLiberacao(id).then(setParcelasLiberacao).catch(() => {});
      // Carrega parcelas e reconcilia status com lançamentos já baixados no CP
      // (resolve dessincronização quando parcelas_pagamento.lancamento_id é NULL)
      Promise.all([
        listarParcelasPagamento(id),
        supabase
          .from("lancamentos")
          .select("data_vencimento, status, data_baixa")
          .eq("contrato_financeiro_id", id)
          .in("status", ["baixado", "parcial"])
          .then(r => r.data ?? []),
      ]).then(([parcelas, lancsBaixados]) => {
        if (lancsBaixados.length === 0) { setParcelasPagamento(parcelas); return; }
        const datasBaixadas = new Map<string, string>();
        for (const l of lancsBaixados) {
          if (l.data_vencimento && !datasBaixadas.has(l.data_vencimento)) {
            datasBaixadas.set(l.data_vencimento, l.data_baixa ?? "");
          }
        }
        setParcelasPagamento(parcelas.map(p => {
          if (p.status === "pago") return p;
          const dataBaixa = datasBaixadas.get(p.data_vencimento);
          return dataBaixa !== undefined ? { ...p, status: "pago" as const, data_pagamento: dataBaixa || undefined } : p;
        }));
      }).catch(() => {});
    }
  }, [contratoModal, abaModal, fazendaId]);

  async function salvar(fn: () => Promise<void>) {
    setErroModal(null);
    try { setSalvando(true); await fn(); } catch (e) {
      const msg = (e as { message?: string })?.message ?? "";
      setErroModal(msg || "Erro ao salvar. Tente novamente.");
    } finally { setSalvando(false); }
  }

  const onChangeAa = (v: string) => { const aa = parseFloat(v.replace(",", ".")); setFC(p => ({ ...p, taxa_juros_aa: v, taxa_juros_am: isNaN(aa) ? "" : String(parseFloat(aaParaAm(aa).toFixed(6))) })); };
  const onChangeAm = (v: string) => { const am = parseFloat(v.replace(",", ".")); setFC(p => ({ ...p, taxa_juros_am: v, taxa_juros_aa: isNaN(am) ? "" : String(parseFloat(amParaAa(am).toFixed(4))) })); };
  const onPessoaChange = (id: string) => { const p = pessoas.find(x => x.id === id); setFC(prev => ({ ...prev, pessoa_id: id, credor: p ? p.nome : prev.credor })); };

  // ── Abrir modal ──
  const abrirModal = (c?: ContratoFinanceiro) => {
    setContratoModal(c ?? null);
    setAbaModal("principal");
    setFC(c ? {
      fazenda_id: c.fazenda_id ?? fazendaId ?? "",
      descricao: c.descricao, pessoa_id: c.pessoa_id ?? "", credor: c.credor, produtor_id: c.produtor_id ?? "",
      tipo: c.tipo, tipo_calculo: c.tipo_calculo, linha_credito: c.linha_credito ?? "",
      moeda: c.moeda, valor_financiado: String(c.valor_financiado), valor_cotacao: String(c.valor_cotacao ?? ""),
      data_contrato: c.data_contrato, numero_documento: c.numero_documento ?? "",
      taxa_tipo: (c.taxa_tipo ?? "fixa") as "fixa" | "variavel",
      indexador: c.indexador ?? "",
      taxa_variavel_ref: "",
      spread_aa: c.spread_aa != null ? String(c.spread_aa) : "",
      spread_am: c.spread_am != null ? String(c.spread_am) : "",
      taxa_juros_aa: c.taxa_juros_aa != null ? String(c.taxa_juros_aa) : "",
      taxa_juros_am: c.taxa_juros_am != null ? String(c.taxa_juros_am) : "",
      iof_pct: c.iof_pct ? String(c.iof_pct) : "", tac_valor: c.tac_valor ? String(c.tac_valor) : "",
      outros_custos: c.outros_custos ? String(c.outros_custos) : "",
      conta_liberacao_id: c.conta_liberacao_id ?? "", conta_pagamento_id: c.conta_pagamento_id ?? "",
      forma_pagamento: c.forma_pagamento ?? "", local_pagamento: c.local_pagamento ?? "",
      observacao: c.observacao ?? "", carencia_meses: String(c.carencia_meses ?? 0),
      periodicidade_meses: String(c.periodicidade_meses ?? 1),
      carencia_tipo: (c.carencia_tipo ?? "so_juros") as "so_juros" | "total",
      crescimento_pct: c.crescimento_pct ? String(c.crescimento_pct) : "",
      rateio_por_vencimento: c.rateio_por_vencimento, fiscal: c.fiscal,
    } : { ...FC_VAZIO });
    if (c) setFCalc({ nParcelas: "12", taxaMensal: c.taxa_juros_am != null ? String(c.taxa_juros_am) : "1.5", dataPrimeiro: "", periodicidade: String(c.periodicidade_meses ?? 1), acessorios: "0" });
    setFLib({ data_liberacao: "", valor_liberado: "", parcelas_liberacao: "1" });
    setFGar({ tipo_garantia: "alienacao_fiduciaria", grau: "", tipo_bem: "imovel", matricula_id: "", imovel_urbano_id: "", maquina_id: "", descricao: "", valor_avaliacao: "", percentual_bem: "100" });
    setFAdit({ ...FA_VAZIO });
    setPdfUrl(c?.pdf_url ?? null); setPdfNome(c?.pdf_nome ?? null);
    if (c?.taxa_tipo === "variavel" && c.indexador) buscarTaxaVariavelRef(c.indexador);
    setParcelasLiberacao([]); setParcelasPagamento([]); setParcelasEditadas({}); setGarantias([]); setCentrosCusto([]); setAditivos([]); setOrigensRefin([]); setFRefin({ contrato_origem_id: "", saldo_incorporado: "" });
    setCnpjBusca(""); setCnpjBuscaStatus("idle");
    setModalAberto(true);
  };

  const fecharModal = () => {
    setModalAberto(false); setContratoModal(null); setErroModal(null);
    setPdfFile(null); setPdfUrl(null); setPdfNome(null); setIaConfianca(null); setParcelasIAPdf(null);
  };

  // ── Extrair dados do PDF via Claude Haiku ──────────────────────────────
  async function handlePdfUpload(file: File) {
    setPdfFile(file);
    setPdfNome(file.name);
    setIaExtraindo(true);
    setIaConfianca(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/ai/extrair-cedula", { method: "POST", body: form });
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error ?? "Erro ao extrair"); }
      const d = await res.json();

      // Normalização de CPF/CNPJ: remove formatação para comparação
      const normDoc = (s: string | null | undefined) => (s ?? "").replace(/\D/g, "");

      // Matching automático: credor CNPJ → pessoas cadastradas
      const pessoaMatch = d.credor_cnpj
        ? pessoas.find(p => normDoc(p.cpf_cnpj) === normDoc(d.credor_cnpj) && normDoc(d.credor_cnpj).length > 0)
        : null;

      // Matching automático: produtor CPF → produtores cadastrados
      const produtorMatch = d.produtor_cpf
        ? produtores.find(p => normDoc(p.cpf_cnpj) === normDoc(d.produtor_cpf) && normDoc(d.produtor_cpf).length > 0)
        : null;

      // Preenche o form com os dados extraídos
      const credorNomeIA = d.credor_nome ?? d.credor ?? null;
      setFC(prev => ({
        ...prev,
        descricao:        d.descricao        ?? prev.descricao,
        credor:           credorNomeIA        ?? prev.credor,
        pessoa_id:        pessoaMatch?.id     ?? prev.pessoa_id,
        produtor_id:      produtorMatch?.id   ?? prev.produtor_id,
        tipo:             d.tipo              ?? prev.tipo,
        linha_credito:    d.linha_credito     ?? prev.linha_credito,
        numero_documento: d.numero_documento  ?? prev.numero_documento,
        data_contrato:    d.data_contrato     ?? prev.data_contrato,
        moeda:            d.moeda             ?? prev.moeda,
        valor_financiado: d.valor_financiado  ? String(d.valor_financiado)  : prev.valor_financiado,
        taxa_tipo:        (d.taxa_tipo         ?? prev.taxa_tipo) as "fixa" | "variavel",
        indexador:        d.indexador         ?? prev.indexador,
        spread_aa:        d.spread_aa != null ? String(d.spread_aa)         : prev.spread_aa,
        spread_am:        d.spread_am != null ? String(d.spread_am)         : prev.spread_am,
        taxa_juros_aa:    d.taxa_tipo !== "variavel" && d.taxa_juros_aa ? String(d.taxa_juros_aa) : prev.taxa_juros_aa,
        taxa_juros_am:    d.taxa_tipo !== "variavel" && d.taxa_juros_am ? String(d.taxa_juros_am) : prev.taxa_juros_am,
        tipo_calculo:     d.tipo_calculo      ?? prev.tipo_calculo,
        carencia_meses:   d.carencia_meses != null ? String(d.carencia_meses) : prev.carencia_meses,
        periodicidade_meses: d.periodicidade_meses != null ? String(d.periodicidade_meses) : prev.periodicidade_meses,
        iof_pct:          d.iof_pct           ? String(d.iof_pct)          : prev.iof_pct,
        tac_valor:        d.tac_valor         ? String(d.tac_valor)         : prev.tac_valor,
        observacao:       d.observacao        ?? prev.observacao,
      }));

      // Auto-preencher fCalc com dados do cronograma extraído
      const cronograma: { data_vencimento: string; valor: number }[] = Array.isArray(d.parcelas_cronograma) ? d.parcelas_cronograma : [];
      // Inferência de periodicidade pelas datas do cronograma quando a IA não extraiu
      const inferirPeriodicidade = (cron: { data_vencimento: string }[]): number | null => {
        if (cron.length < 2) return null;
        const dts = cron.map(p => new Date(p.data_vencimento + "T12:00:00"));
        const diffs: number[] = [];
        for (let i = 1; i < dts.length; i++) {
          const m = (dts[i].getFullYear() - dts[i-1].getFullYear()) * 12 + dts[i].getMonth() - dts[i-1].getMonth();
          if (m > 0) diffs.push(m);
        }
        if (diffs.length === 0) return null;
        const avg = diffs.reduce((s, x) => s + x, 0) / diffs.length;
        if (avg >= 10) return 12;
        if (avg >= 4.5) return 6;
        if (avg >= 2) return 3;
        return 1;
      };
      if (cronograma.length > 0) {
        setParcelasIAPdf(cronograma);
        const periodoInferido = d.periodicidade_meses ?? inferirPeriodicidade(cronograma);
        setFCalc(prev => ({
          ...prev,
          nParcelas:    String(d.num_parcelas ?? cronograma.length),
          dataPrimeiro: cronograma[0].data_vencimento,
          periodicidade: periodoInferido != null ? String(periodoInferido) : prev.periodicidade,
          taxaMensal: d.taxa_tipo === "variavel"
            ? (d.spread_am ? String(d.spread_am) : prev.taxaMensal)
            : (d.taxa_juros_am ? String(d.taxa_juros_am) : prev.taxaMensal),
        }));
      } else if (d.num_parcelas || d.periodicidade_meses) {
        setFCalc(prev => ({
          ...prev,
          nParcelas:    d.num_parcelas ? String(d.num_parcelas) : prev.nParcelas,
          periodicidade: d.periodicidade_meses != null ? String(d.periodicidade_meses) : prev.periodicidade,
          taxaMensal: d.taxa_tipo === "variavel"
            ? (d.spread_am ? String(d.spread_am) : prev.taxaMensal)
            : (d.taxa_juros_am ? String(d.taxa_juros_am) : prev.taxaMensal),
        }));
      }

      setIaConfianca(d.confianca ?? "media");
    } catch (e: unknown) {
      alert("Erro ao processar PDF: " + ((e as Error).message ?? "tente novamente."));
    } finally {
      setIaExtraindo(false);
    }
  }

  // ── Helper: upload PDF da cédula → retorna {pdf_url, pdf_nome} ou null ──
  const uploadPdfCedula = async (contratoId: string, file: File): Promise<{ pdf_url: string; pdf_nome: string } | null> => {
    const ext  = file.name.split(".").pop() ?? "pdf";
    const path = `contratos-financeiros/${fazendaId}/${contratoId}.${ext}`;
    const { error: upErr } = await supabase.storage.from("documentos").upload(path, file, { upsert: true });
    if (upErr) {
      alert(`⚠️ PDF não pôde ser salvo: ${upErr.message}\n\nVerifique se o bucket "documentos" existe e está público no Supabase Storage.`);
      return null;
    }
    const { data: urlData } = supabase.storage.from("documentos").getPublicUrl(path);
    const pdfPayload = { pdf_url: urlData.publicUrl, pdf_nome: file.name };
    // Update direto — não passa por desnormalizarContrato para não sobrescrever campos não relacionados
    const { error: dbErr } = await supabase
      .from("contratos_financeiros")
      .update(pdfPayload)
      .eq("id", contratoId);
    if (dbErr) console.error("[uploadPdfCedula] erro ao salvar pdf_url:", dbErr.message);
    return pdfPayload;
  };

  // ── Salvar contrato (Principal) ──
  const salvarContrato = () => salvar(async () => {
    if (!fazendaId) { alert("Fazenda não identificada. Recarregue a página."); return; }
    const credorNome = fC.pessoa_id ? (pessoas.find(p => p.id === fC.pessoa_id)?.nome ?? fC.credor) : fC.credor.trim();
    const erros: string[] = [];
    if (!fC.descricao.trim()) erros.push("Descrição");
    if (!fC.data_contrato) erros.push("Data do Contrato");
    if (!fC.valor_financiado) erros.push("Valor Financiado");
    if (!credorNome) erros.push("Credor");
    if (!fC.numero_documento.trim()) erros.push("Nº Documento");
    if (fC.taxa_tipo === "variavel" ? !fC.indexador : (!fC.taxa_juros_aa && !fC.taxa_juros_am)) erros.push("Taxa de Juros");
    if (erros.length) { setErroModal(`Preencha antes de salvar: ${erros.join(", ")}`); return; }
    setErroModal(null);
    const vf = parseFloat(fC.valor_financiado.replace(",", ".")) || 0;
    const vc = fC.valor_cotacao ? parseFloat(fC.valor_cotacao.replace(",", ".")) : undefined;
    const fidCf = fC.fazenda_id || fazendaId!;
    const payload: Omit<ContratoFinanceiro, "id" | "created_at"> = {
      fazenda_id: fidCf, descricao: fC.descricao.trim(),
      pessoa_id: fC.pessoa_id || undefined, credor: credorNome,
      produtor_id: fC.produtor_id || undefined,
      tipo: fC.tipo, tipo_calculo: fC.tipo_calculo, linha_credito: fC.linha_credito || undefined,
      moeda: fC.moeda, valor_financiado: vf, valor_cotacao: vc,
      valor_financiado_brl: fC.moeda === "USD" && vc ? vf * vc : vf,
      data_contrato: fC.data_contrato, numero_documento: fC.numero_documento || undefined,
      taxa_tipo: fC.taxa_tipo as "fixa" | "variavel",
      indexador: fC.taxa_tipo === "variavel" ? (fC.indexador || undefined) : undefined,
      spread_aa: fC.taxa_tipo === "variavel" && fC.spread_aa ? parseFloat(fC.spread_aa.replace(",", ".")) : undefined,
      spread_am: fC.taxa_tipo === "variavel" && fC.spread_am ? parseFloat(fC.spread_am.replace(",", ".")) : undefined,
      taxa_juros_aa: fC.taxa_tipo === "fixa" && fC.taxa_juros_aa ? parseFloat(fC.taxa_juros_aa.replace(",", ".")) : undefined,
      taxa_juros_am: fC.taxa_tipo === "fixa" && fC.taxa_juros_am ? parseFloat(fC.taxa_juros_am.replace(",", ".")) : undefined,
      iof_pct: fC.iof_pct ? parseFloat(fC.iof_pct.replace(",", ".")) : undefined,
      tac_valor: fC.tac_valor ? parseFloat(fC.tac_valor.replace(",", ".")) : undefined,
      outros_custos: fC.outros_custos ? parseFloat(fC.outros_custos.replace(",", ".")) : undefined,
      conta_liberacao_id: fC.conta_liberacao_id || undefined, conta_pagamento_id: fC.conta_pagamento_id || undefined,
      forma_pagamento: fC.forma_pagamento || undefined, local_pagamento: fC.local_pagamento || undefined,
      observacao: fC.observacao || undefined, carencia_meses: Number(fC.carencia_meses) || 0,
      periodicidade_meses: Number(fC.periodicidade_meses) || 1, carencia_tipo: fC.carencia_tipo,
      crescimento_pct: fC.crescimento_pct ? parseFloat(fC.crescimento_pct.replace(",", ".")) : undefined,
      rateio_por_vencimento: fC.rateio_por_vencimento, fiscal: fC.fiscal, status: "ativo",
    };
    if (contratoModal?.id) {
      await atualizarContratoFinanceiro(contratoModal.id, payload);
      let atualizado: ContratoFinanceiro = { ...contratoModal, ...payload };
      // Upload de PDF ao editar
      if (pdfFile) {
        const saved = await uploadPdfCedula(contratoModal.id, pdfFile).catch(() => null);
        if (saved) atualizado = { ...atualizado, ...saved };
        setPdfFile(null);
        setPdfNome(atualizado.pdf_nome ?? null);
        setPdfUrl(atualizado.pdf_url ?? null);
      }
      setContratos(p => p.map(x => x.id === contratoModal.id ? atualizado : x));
      setContratoModal(atualizado);
      setFCalc(prev => ({ ...prev, taxaMensal: payload.taxa_juros_am != null ? String(payload.taxa_juros_am) : prev.taxaMensal, periodicidade: String(payload.periodicidade_meses ?? 1) }));
    } else {
      const novo = await criarContratoFinanceiro(payload);
      // Upload do PDF da cédula se houver (o mesmo arquivo que a IA leu)
      if (pdfFile) {
        const saved = await uploadPdfCedula(novo.id, pdfFile).catch(() => null);
        if (saved) { novo.pdf_url = saved.pdf_url; novo.pdf_nome = saved.pdf_nome; }
        setPdfFile(null);
      }
      setContratos(p => [novo, ...p]);
      setContratoModal(novo);
      setPdfUrl(novo.pdf_url ?? null);
      setPdfNome(novo.pdf_nome ?? null);
      setFCalc({ nParcelas: "12", taxaMensal: novo.taxa_juros_am != null ? String(novo.taxa_juros_am) : "1.5", dataPrimeiro: "", periodicidade: String(novo.periodicidade_meses ?? 1), acessorios: "0" });
      setAbaModal("liberacao");
    }
  });

  // ── Liberação ──
  const salvarLiberacao = () => salvar(async () => {
    if (!contratoModal) return;
    const errosLib: string[] = [];
    if (!fLib.data_liberacao) errosLib.push("Data Liberação");
    if (!fLib.valor_liberado) errosLib.push("Valor Liberado");
    if (errosLib.length) { setErroModal(`Preencha antes de salvar: ${errosLib.join(", ")}`); return; }
    setErroModal(null);
    const vl = parseFloat(fLib.valor_liberado.replace(",", ".")) || 0;
    const nParcelas = Math.max(1, Number(fLib.parcelas_liberacao) || 1);
    for (let i = 1; i <= nParcelas; i++) {
      const d = new Date(fLib.data_liberacao + "T12:00:00");
      d.setMonth(d.getMonth() + (i - 1));
      const nova = await criarParcelaLiberacao({
        contrato_id: contratoModal.id, fazenda_id: fazendaId!,
        num_parcela: (parcelasLiberacao.length + i),
        data_liberacao: d.toISOString().slice(0, 10),
        valor_liberado: vl,
        valor_liberado_brl: contratoModal.moeda === "USD" && contratoModal.valor_cotacao ? vl * contratoModal.valor_cotacao : vl,
      }, contratoModal);
      setParcelasLiberacao(p => [...p, nova]);
    }
    setFLib({ data_liberacao: "", valor_liberado: "", parcelas_liberacao: "1" });
  });

  // ── Calcular parcelas ──
  const calcularParcelas = () => salvar(async () => {
    if (!contratoModal) return;
    if (!fCalc.dataPrimeiro) { setErroModal("Preencha antes de salvar: Data 1º Pagamento"); return; }
    setErroModal(null);
    // Usa fC (formulário atual) para parâmetros de cálculo — não exige salvar antes
    const valorBase = parseFloat(String(fC.valor_financiado).replace(",", ".")) || contratoModal.valor_financiado;
    const tipoCalc = fC.tipo_calculo || contratoModal.tipo_calculo;
    const crescPct = Number(fC.crescimento_pct) || 0;
    const moedaCalc = fC.moeda || contratoModal.moeda;
    const descricaoCalc = fC.descricao || contratoModal.descricao;
    const tipoContrato = fC.tipo || contratoModal.tipo;
    const pessoaId = fC.pessoa_id || contratoModal.pessoa_id || undefined;
    const nrDoc = fC.numero_documento || contratoModal.numero_documento || undefined;

    const n = Math.max(1, Number(fCalc.nParcelas) || 12);
    const i_mensal = (Number(fCalc.taxaMensal) || 0) / 100;
    const period = Number(fCalc.periodicidade) || (Number(fC.periodicidade_meses) || contratoModal.periodicidade_meses || 1);
    // Taxa efetiva para o período: capitalização composta da taxa mensal
    const i_periodo = period <= 1 ? i_mensal : Math.pow(1 + i_mensal, period) - 1;
    // Carência em meses → converter para unidades do período.
    // Usa Math.floor: para pagamentos anuais (period=12), carencia_meses < 12 não gera período de carência
    // (o intervalo até o 1º pagamento já é a periodicidade normal; carência real ocorre só a partir de 12m)
    const carMeses = Number(fC.carencia_meses ?? 0);
    const car = period > 1 ? Math.floor(carMeses / period) : carMeses;
    const carTipo = fC.carencia_tipo as CarenciaTipo;
    const acessMensal = parseFloat(fCalc.acessorios.replace(",", ".")) || 0;

    let base: ParcelaBase[];
    if (tipoCalc === "sac_crescente") base = calcularSACRE(valorBase, i_periodo, n, crescPct, car, carTipo);
    else if (tipoCalc === "sac") base = calcularSAC(valorBase, i_periodo, n, car, carTipo);
    else base = calcularPRICE(valorBase, i_periodo, n, car, carTipo);
    base = base.map(p => ({ ...p, despesas_acessorios: p.valor_parcela > 0 ? acessMensal : 0, valor_parcela: p.valor_parcela > 0 ? p.valor_parcela + acessMensal : 0 }));
    const comDatas = aplicarDatas(base, fCalc.dataPrimeiro, period);
    // Remove CP automáticos não baixados — usa contrato_financeiro_id (sempre presente, não depende de numero_documento)
    await supabase.from("lancamentos").delete()
      .eq("fazenda_id", fazendaId).eq("auto", true).eq("tipo", "pagar")
      .eq("contrato_financeiro_id", contratoModal.id).neq("status", "baixado");
    const salvas = await salvarParcelasPagamento(contratoModal.id, fazendaId!, comDatas.map(p => ({ ...p, status: "em_aberto" as const })));
    // Gera CP lançamentos para cada parcela
    const hoje = new Date().toISOString().slice(0, 10);
    const lancsParcelas: Record<string, unknown>[] = [];
    for (const p of salvas) {
      const statusLanc = p.data_vencimento < hoje ? "baixado" : "em_aberto";
      const descBase = `${descricaoCalc} — Parcela ${p.num_parcela}`;
      const camposBase = { fazenda_id: fazendaId, contrato_financeiro_id: contratoModal.id, tipo: "pagar", moeda: moedaCalc, data_lancamento: p.data_vencimento, data_vencimento: p.data_vencimento, status: statusLanc, auto: true, numero_documento: nrDoc, origem_lancamento: "contrato_financeiro", pessoa_id: pessoaId || null, ano_safra_id: anoSafraVigenteId || null };
      if (p.amortizacao > 0) lancsParcelas.push({ ...camposBase, descricao: `${descBase} — Amortização`, categoria: CAT_AMORT[tipoContrato], valor: p.amortizacao });
      if (p.juros > 0) lancsParcelas.push({ ...camposBase, descricao: `${descBase} — Juros`, categoria: CAT_JUROS[tipoContrato], valor: p.juros });
      if (p.despesas_acessorios > 0) lancsParcelas.push({ ...camposBase, descricao: `${descBase} — Encargos`, categoria: "Encargos Bancários", valor: p.despesas_acessorios });
      if (p.amortizacao === 0 && p.juros === 0 && p.despesas_acessorios === 0 && p.valor_parcela > 0) lancsParcelas.push({ ...camposBase, descricao: descBase, categoria: CAT_AMORT[tipoContrato], valor: p.valor_parcela });
    }
    if (lancsParcelas.length > 0) await supabase.from("lancamentos").insert(lancsParcelas);
    setParcelasPagamento(salvas);
  });

  // ── Aplicar cronograma extraído do PDF pela IA ──
  const aplicarCronogramaIAPdf = async () => {
    if (!contratoModal || !parcelasIAPdf || parcelasIAPdf.length === 0) return;
    setErroModal(null);
    setSalvando(true);
    try {
      // 1. Remove CP automáticos não baixados — usa contrato_financeiro_id (sempre presente)
      await supabase.from("lancamentos").delete()
        .eq("fazenda_id", fazendaId).eq("auto", true).eq("tipo", "pagar")
        .eq("contrato_financeiro_id", contratoModal.id).neq("status", "baixado");

      // 2. Monta parcelas — garante que valor nunca seja null
      const hoje = new Date().toISOString().slice(0, 10);
      const parcelasParaSalvar = parcelasIAPdf.map((p, idx) => ({
        num_parcela: idx + 1,
        data_vencimento: p.data_vencimento,
        amortizacao: p.valor ?? 0,
        juros: 0,
        despesas_acessorios: 0,
        valor_parcela: p.valor ?? 0,
        saldo_devedor: 0,
        status: "em_aberto" as const,
      }));

      // 3. Persiste parcelas
      const salvas = await salvarParcelasPagamento(contratoModal.id, fazendaId!, parcelasParaSalvar);

      // 4. Cria CP lançamentos (falha silenciosa — não bloqueia o cronograma)
      const lancsParcelas: Record<string, unknown>[] = [];
      for (const p of salvas) {
        const statusLanc = p.data_vencimento < hoje ? "baixado" : "em_aberto";
        lancsParcelas.push({
          fazenda_id: fazendaId, contrato_financeiro_id: contratoModal.id, tipo: "pagar", moeda: contratoModal.moeda,
          descricao: `${contratoModal.descricao} — Parcela ${p.num_parcela}`,
          categoria: CAT_AMORT[contratoModal.tipo], data_lancamento: p.data_vencimento,
          data_vencimento: p.data_vencimento, valor: p.valor_parcela ?? 0, status: statusLanc,
          auto: true, numero_documento: contratoModal.numero_documento || undefined,
          origem_lancamento: "contrato_financeiro",
          pessoa_id: (fC.pessoa_id || contratoModal.pessoa_id) || null,
          ano_safra_id: anoSafraVigenteId || null,
        });
      }
      if (lancsParcelas.length > 0) {
        const { error: errLanc } = await supabase.from("lancamentos").insert(lancsParcelas);
        if (errLanc) console.error("[aplicarCronogramaIAPdf] lancamentos insert:", errLanc);
      }

      // 5. Atualiza estado (sucesso)
      setParcelasPagamento(salvas);
      setParcelasIAPdf(null);
    } catch (e) {
      const msg = (e as { message?: string })?.message ?? "Erro ao salvar cronograma.";
      console.error("[aplicarCronogramaIAPdf]", e);
      setErroModal(msg);
    } finally {
      setSalvando(false);
    }
  };

  // ── Ajustes manuais de parcelas ──
  const editarParcela = (id: string, campo: "data_vencimento" | "valor_parcela", valor: string) => {
    setParcelasEditadas(prev => ({ ...prev, [id]: { ...prev[id], [campo]: valor } }));
  };

  async function confirmarBaixaParcela() {
    if (!modalBaixaParcela) return;
    if (!baixaPData) { setBaixaPErro("Informe a data do pagamento."); return; }
    if (!baixaPConta) { setBaixaPErro("Selecione a conta bancária."); return; }
    const valorNum = parseFloat(baixaPValor.replace(/\./g, "").replace(",", ".")) || 0;
    if (valorNum <= 0) { setBaixaPErro("Informe o valor pago."); return; }
    setBaixandoP(true);
    setBaixaPErro("");
    try {
      if (modalBaixaParcela.lancamento_id) {
        // Baixa via lançamento — atualiza lancamentos E parcelas_pagamento automaticamente
        await baixarLancamento(modalBaixaParcela.lancamento_id, valorNum, baixaPData, baixaPConta);
      } else {
        // Parcela sem lançamento vinculado — atualiza só parcelas_pagamento
        const { error } = await supabase
          .from("parcelas_pagamento")
          .update({ status: "pago", data_pagamento: baixaPData })
          .eq("id", modalBaixaParcela.id);
        if (error) throw error;
      }
      // Atualiza a lista local
      setParcelasPagamento(prev => prev.map(p =>
        p.id === modalBaixaParcela.id ? { ...p, status: "pago", data_pagamento: baixaPData } : p
      ));
      setModalBaixaParcela(null);
    } catch (e) {
      setBaixaPErro(e instanceof Error ? e.message : "Erro ao registrar pagamento.");
    } finally {
      setBaixandoP(false);
    }
  }

  const salvarAjustesManuais = () => salvar(async () => {
    if (!contratoModal || !fazendaId) return;
    const atualizadas = parcelasPagamento.map(p => {
      const ed = parcelasEditadas[p.id];
      if (!ed) return p;
      const novaData = ed.data_vencimento ?? p.data_vencimento;
      const novoValorStr = ed.valor_parcela;
      if (!novoValorStr) return { ...p, data_vencimento: novaData };
      const novoValor = parseFloat(novoValorStr.replace(/\./g, "").replace(",", "."));
      if (isNaN(novoValor)) return { ...p, data_vencimento: novaData };
      return {
        ...p,
        data_vencimento: novaData,
        valor_parcela: novoValor,
        amortizacao: novoValor,
        juros: 0,
        despesas_acessorios: 0,
      };
    });
    const salvas = await salvarParcelasPagamento(
      contratoModal.id, fazendaId,
      atualizadas.map(p => ({ ...p, status: p.status ?? "em_aberto" as const }))
    );
    setParcelasPagamento(salvas);
    setParcelasEditadas({});
  });

  // ── Garantia ──
  const salvarGarantia = () => salvar(async () => {
    if (!contratoModal) return;
    let desc = fGar.descricao.trim();
    if (!desc) {
      if (fGar.tipo_bem === "imovel" && fGar.matricula_id) { const m = matriculas.find(x => x.id === fGar.matricula_id); desc = m ? `Matr. ${m.numero}${m.area_ha ? ` — ${m.area_ha} ha` : ""}` : "Imóvel Rural"; }
      else if (fGar.tipo_bem === "imovel_urbano" && fGar.imovel_urbano_id) { const u = imoveisUrbanos.find(x => x.id === fGar.imovel_urbano_id); desc = u ? u.descricao : "Imóvel Urbano"; }
      else if (fGar.tipo_bem === "maquina" && fGar.maquina_id) { const m = maquinas.find(x => x.id === fGar.maquina_id); desc = m ? `${m.nome}${m.marca ? ` — ${m.marca}` : ""}` : "Máquina"; }
      else desc = TIPO_GAR_META[fGar.tipo_garantia ?? "outros"]?.label ?? "Garantia";
    }
    if (!desc) { alert("Informe a descrição da garantia."); return; }
    const nova = await criarGarantia({
      contrato_id: contratoModal.id, fazenda_id: fazendaId!,
      tipo_garantia: fGar.tipo_garantia || undefined, grau: fGar.grau || undefined, tipo_bem: fGar.tipo_bem || undefined,
      matricula_id:     fGar.tipo_bem === "imovel"        ? (fGar.matricula_id     || undefined) : undefined,
      imovel_urbano_id: fGar.tipo_bem === "imovel_urbano" ? (fGar.imovel_urbano_id || undefined) : undefined,
      maquina_id:       fGar.tipo_bem === "maquina"       ? (fGar.maquina_id       || undefined) : undefined,
      descricao: desc,
      valor_avaliacao: fGar.valor_avaliacao ? Number(fGar.valor_avaliacao.replace(",", ".")) : undefined,
      percentual_bem:  fGar.percentual_bem ? Number(fGar.percentual_bem) : undefined,
    });
    setGarantias(p => [...p, nova]);
    setFGar({ tipo_garantia: "alienacao_fiduciaria", grau: "", tipo_bem: "imovel", matricula_id: "", imovel_urbano_id: "", maquina_id: "", descricao: "", valor_avaliacao: "", percentual_bem: "100" });
  });

  // ── Centro de custo ──
  const salvarCentroCusto = () => salvar(async () => {
    if (!contratoModal) return;
    const itens: Omit<CentroCustoContrato, "id" | "created_at">[] = centrosForm
      .filter(c => c.ciclo_id || c.centro_custo_id)
      .map(c => {
        const cicloLabel = ccCiclos.find(x => x.id === c.ciclo_id);
        const ccLabel = ccOptions.find(x => x.id === c.centro_custo_id);
        const partes = [cicloLabel ? `${cicloLabel.cultura ?? ""} ${cicloLabel.descricao ?? ""}`.trim() : "", ccLabel?.nome ?? ""].filter(Boolean);
        return {
          contrato_id: contratoModal.id,
          descricao: partes.join(" — ") || "Rateio",
          ciclo_id: c.ciclo_id || null,
          centro_custo_id: c.centro_custo_id || null,
          percentual: parseFloat(c.percentual.replace(",", ".")) || 0,
          valor: parseFloat(c.valor.replace(",", ".")) || 0,
        };
      });
    await salvarCentrosCusto(contratoModal.id, itens);
    setCentrosCusto(await listarCentrosCusto(contratoModal.id));
  });

  // ── Aditivo ──
  const salvarAditivo = () => salvar(async () => {
    if (!contratoModal) return;
    const errosAdit: string[] = [];
    if (!fAdit.data_aditivo) errosAdit.push("Data do Aditivo");
    if (!fAdit.descricao.trim()) errosAdit.push("Descrição");
    if (errosAdit.length) { setErroModal(`Preencha antes de salvar: ${errosAdit.join(", ")}`); return; }
    setErroModal(null);
    const nova = await criarAditivo({
      contrato_id: contratoModal.id, fazenda_id: fazendaId!,
      data_aditivo: fAdit.data_aditivo, tipo: fAdit.tipo, descricao: fAdit.descricao.trim(),
      ...(fAdit.nova_data_vencimento ? { nova_data_vencimento: fAdit.nova_data_vencimento } : {}),
      ...(fAdit.nova_taxa_aa ? { nova_taxa_aa: parseFloat(fAdit.nova_taxa_aa.replace(",", ".")) } : {}),
      ...(fAdit.nova_taxa_am ? { nova_taxa_am: parseFloat(fAdit.nova_taxa_am.replace(",", ".")) } : {}),
      ...(fAdit.novo_valor_financiado ? { novo_valor_financiado: parseFloat(fAdit.novo_valor_financiado.replace(",", ".")) } : {}),
      ...(fAdit.novo_num_parcelas ? { novo_num_parcelas: parseInt(fAdit.novo_num_parcelas) } : {}),
      ...(fAdit.obs ? { obs: fAdit.obs.trim() } : {}),
    });
    setAditivos(p => [...p, nova]);
    setFAdit({ ...FA_VAZIO });
  });

  // ── Filtros + Totais ──
  const contratosFiltrados = contratos.filter(c => {
    if (fazendaFiltro && c.fazenda_id !== fazendaFiltro) return false;
    if (colTipo && c.tipo !== colTipo) return false;
    if (colMoeda && c.moeda !== colMoeda) return false;
    if (colCalc && (c.tipo_calculo ?? "sac") !== colCalc) return false;
    if (colStatus && c.status !== colStatus) return false;
    if (colBusca) {
      const q = colBusca.toLowerCase();
      if (!(c.descricao?.toLowerCase().includes(q) || c.credor?.toLowerCase().includes(q) || c.numero_documento?.toLowerCase().includes(q) || c.linha_credito?.toLowerCase().includes(q))) return false;
    }
    return true;
  });
  const ativosKpi = contratosFiltrados.filter(c => c.status === "ativo");
  const totalFinanciado = ativosKpi.reduce((s, c) => s + (c.moeda === "USD" ? c.valor_financiado * (ptax ?? 1) : c.valor_financiado), 0);
  const totalPagoKpi       = ativosKpi.reduce((s, c) => { const r = resumoParcelas[c.id]; const f = c.moeda === "USD" ? (ptax ?? 1) : 1; return s + (r ? r.pago * f : 0); }, 0);
  const totalPagoAmortKpi  = ativosKpi.reduce((s, c) => { const r = resumoParcelas[c.id]; const f = c.moeda === "USD" ? (ptax ?? 1) : 1; return s + (r ? r.pagoAmort * f : 0); }, 0);
  const totalPagoJurosKpi  = ativosKpi.reduce((s, c) => { const r = resumoParcelas[c.id]; const f = c.moeda === "USD" ? (ptax ?? 1) : 1; return s + (r ? r.pagoJuros * f : 0); }, 0);
  const totalAbertoKpi     = ativosKpi.reduce((s, c) => { const r = resumoParcelas[c.id]; const f = c.moeda === "USD" ? (ptax ?? 1) : 1; return s + (r ? r.aberto * f : 0); }, 0);
  const totalAbertoAmortKpi= ativosKpi.reduce((s, c) => { const r = resumoParcelas[c.id]; const f = c.moeda === "USD" ? (ptax ?? 1) : 1; return s + (r ? r.abertoAmort * f : 0); }, 0);
  const totalAbertoJurosKpi= ativosKpi.reduce((s, c) => { const r = resumoParcelas[c.id]; const f = c.moeda === "USD" ? (ptax ?? 1) : 1; return s + (r ? r.abertoJuros * f : 0); }, 0);
  const nomeConta = (id?: string) => id ? (contas.find(c => c.id === id)?.nome ?? "—") : "—";


  // ── Importar XLSX ──
  const CAT_AMORT: Record<ContratoFinanceiro["tipo"], string> = {
    custeio: "Pagamento de Custeio", investimento: "Pagamento de Financiamento",
    securitizacao: "Pagamento de Securitização", cpr: "Pagamento de CPR",
    egf: "Pagamento de EGF", outros: "Pagamento de Empréstimos",
  };
  const CAT_JUROS: Record<ContratoFinanceiro["tipo"], string> = {
    custeio: "Juros de Custeio", investimento: "Juros de Financiamento",
    securitizacao: "Juros de Securitização", cpr: "Juros de CPR",
    egf: "Juros de EGF", outros: "Juros de Empréstimos",
  };
  const CAT_CAPTACAO: Record<ContratoFinanceiro["tipo"], string> = {
    custeio: "Captação de Custeio", investimento: "Captação de Financiamento",
    securitizacao: "Captação de Securitização", cpr: "Captação de CPR",
    egf: "Captação de EGF", outros: "Captação de Empréstimos",
  };

  // ── Aba desabilitada quando contrato ainda não salvo ──
  function AbaDisabled({ nome }: { nome: string }) {
    return (
      <div style={{ textAlign: "center", padding: "48px 0", color: "#999" }}>
        <div style={{ fontSize: 32, marginBottom: 8 }}>🔒</div>
        <div style={{ fontWeight: 600, fontSize: 13, color: "var(--text-2)" }}>Salve o contrato primeiro</div>
        <div style={{ fontSize: 12, color: "var(--text-3)", marginTop: 4 }}>Preencha a aba <strong>Principal</strong> e clique em <strong>Salvar</strong> para liberar a aba <strong>{nome}</strong>.</div>
      </div>
    );
  }

  // ────────────────────────────────────────────────────────
  if (!podeAcessarPlano("fin_contratos")) return <PlanoGate modulo="fin_contratos" />;
  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh", background: "var(--bg-page)", fontFamily: "system-ui, sans-serif", fontSize: 13 }}>
      <TopNav />
      <main style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
        <div style={{ maxWidth: 1300, margin: "0 auto", padding: "28px 24px", width: "100%" }}>

          {/* Cabeçalho */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 24 }}>
            <div>
              <h1 style={{ fontSize: 20, fontWeight: 700, color: "var(--text-1)", margin: 0 }}>Contratos Financeiros</h1>
              <div style={{ fontSize: 12, color: "var(--text-3)", marginTop: 3 }}>Custeio, CPR, investimento, securitização, EGF</div>
            </div>
            <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
              {ptax && <span style={{ fontSize: 11, color: "var(--text-2)", background: "var(--bg-page)", border: "0.5px solid var(--border-table)", borderRadius: 8, padding: "4px 10px" }}>PTAX: R$ {fmtNum(ptax, 4)}</span>}
              {fazendas.length > 1 && (
                <select value={fazendaFiltro} onChange={e => setFazendaFiltro(e.target.value)}
                  style={{ padding: "8px 12px", border: "0.5px solid var(--border-table)", borderRadius: 8, fontSize: 13, background: "var(--bg-card)", minWidth: 160 }}>
                  <option value="">Todas as fazendas</option>
                  {fazendas.map(fz => <option key={fz.id} value={fz.id}>{fz.nome}</option>)}
                </select>
              )}
              {userRole === "raccotlo" && (
                <a href="/configuracoes/importacao?aba=contratos_fin" style={{ ...btnR, textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 6 }}>
                  📥 Importar XLSX
                </a>
              )}
              <button style={{ ...btnV, background: "#111111", padding: "9px 20px" }} onClick={() => abrirModal()}>+ Novo Contrato</button>
            </div>
          </div>

          {/* KPI */}
          {contratosFiltrados.length > 0 && (
            <div style={{ background: "var(--bg-card)", borderRadius: 12, border: "0.5px solid var(--border)", marginBottom: 16, overflow: "hidden" }}>
              <div style={{ display: "grid", gridTemplateColumns: "auto 1fr 1fr 1fr", borderBottom: kpiDetalhado ? "0.5px solid var(--border-table)" : "none" }}>
                <div style={{ padding: "14px 18px", borderRight: "0.5px solid var(--border-table)" }}>
                  <div style={{ fontSize: 11, color: "var(--text-3)", marginBottom: 4 }}>Contratos ativos</div>
                  <div style={{ fontSize: 22, fontWeight: 700, color: "#111111" }}>{ativosKpi.length}</div>
                  <div style={{ fontSize: 11, color: "var(--text-3)", marginTop: 2 }}>{contratosFiltrados.filter(c => c.status !== "ativo").length} encerrados</div>
                </div>
                <div style={{ padding: "14px 18px", borderRight: "0.5px solid var(--border-table)" }}>
                  <div style={{ fontSize: 11, color: "var(--text-3)", marginBottom: 4 }}>Total Captado{ptax ? " (conv. PTAX)" : ""}</div>
                  <div style={{ fontSize: 22, fontWeight: 700, color: "#1A5C38" }}>{fmtBRL(totalFinanciado)}</div>
                </div>
                <div style={{ padding: "14px 18px", borderRight: "0.5px solid var(--border-table)" }}>
                  <div style={{ fontSize: 11, color: "var(--text-3)", marginBottom: 2 }}>Valor Pago</div>
                  <div style={{ fontSize: 22, fontWeight: 700, color: "#378ADD" }}>{fmtBRL(totalPagoKpi)}</div>
                  <div style={{ display: "flex", gap: 12, marginTop: 5 }}>
                    <div>
                      <div style={{ fontSize: 10, color: "var(--text-3)" }}>Capital</div>
                      <div style={{ fontSize: 12, fontWeight: 600, color: "#378ADD" }}>{fmtBRL(totalPagoAmortKpi)}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: 10, color: "var(--text-3)" }}>Juros</div>
                      <div style={{ fontSize: 12, fontWeight: 600, color: "#C9921B" }}>{fmtBRL(totalPagoJurosKpi)}</div>
                    </div>
                  </div>
                </div>
                <div style={{ padding: "14px 18px", display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
                  <div>
                    <div style={{ fontSize: 11, color: "var(--text-3)", marginBottom: 2 }}>Valor em Aberto</div>
                    <div style={{ fontSize: 22, fontWeight: 700, color: totalAbertoKpi > 0 ? "#E24B4A" : "var(--text-3)" }}>{fmtBRL(totalAbertoKpi)}</div>
                    <div style={{ display: "flex", gap: 12, marginTop: 5 }}>
                      <div>
                        <div style={{ fontSize: 10, color: "var(--text-3)" }}>Capital</div>
                        <div style={{ fontSize: 12, fontWeight: 600, color: "#E24B4A" }}>{fmtBRL(totalAbertoAmortKpi)}</div>
                      </div>
                      <div>
                        <div style={{ fontSize: 10, color: "var(--text-3)" }}>Juros</div>
                        <div style={{ fontSize: 12, fontWeight: 600, color: "#C9921B" }}>{fmtBRL(totalAbertoJurosKpi)}</div>
                      </div>
                    </div>
                  </div>
                  <button onClick={() => setKpiDetalhado(v => !v)}
                    style={{ fontSize: 11, padding: "5px 11px", border: "0.5px solid var(--border-table)", borderRadius: 6, background: "var(--bg-page)", color: "var(--text-2)", cursor: "pointer", marginTop: 4, whiteSpace: "nowrap" }}>
                    {kpiDetalhado ? "▲ Recolher" : "▼ Por contrato"}
                  </button>
                </div>
              </div>
              {kpiDetalhado && (
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead>
                      <tr style={{ background: "var(--bg-page)" }}>
                        {["Contrato / Credor", "Captado", "Pago", "Em Aberto", "% Pago"].map((h, i) => (
                          <th key={i} style={{ padding: "8px 14px", textAlign: i === 0 ? "left" : "center", fontSize: 11, fontWeight: 600, color: "var(--text-2)", borderBottom: "0.5px solid var(--border-table)", whiteSpace: "nowrap" }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {ativosKpi.map((c, idx) => {
                        const r = resumoParcelas[c.id] ?? { pago: 0, aberto: 0 };
                        const fator = c.moeda === "USD" ? (ptax ?? 1) : 1;
                        const captado = c.valor_financiado * fator;
                        const pago = r.pago * fator;
                        const aberto = r.aberto * fator;
                        const pct = captado > 0 ? Math.round((pago / captado) * 100) : 0;
                        return (
                          <tr key={c.id} style={{ borderBottom: idx < ativosKpi.length - 1 ? "0.5px solid var(--bg-tag)" : "none", cursor: "pointer" }}
                            onClick={() => abrirModal(c)}>
                            <td style={{ padding: "8px 14px" }}>
                              <div style={{ fontWeight: 500, fontSize: 12, color: "var(--text-1)" }}>{c.descricao}</div>
                              <div style={{ fontSize: 11, color: "var(--text-3)" }}>{c.credor}{c.linha_credito ? ` · ${c.linha_credito}` : ""}</div>
                            </td>
                            <td style={{ padding: "8px 14px", textAlign: "center", fontSize: 12, color: "var(--text-1)", fontVariantNumeric: "tabular-nums" }}>{fmtBRL(captado)}</td>
                            <td style={{ padding: "8px 14px", textAlign: "center", fontSize: 12, color: "#378ADD", fontVariantNumeric: "tabular-nums" }}>{fmtBRL(pago)}</td>
                            <td style={{ padding: "8px 14px", textAlign: "center", fontSize: 12, color: aberto > 0 ? "#E24B4A" : "var(--text-3)", fontVariantNumeric: "tabular-nums" }}>{fmtBRL(aberto)}</td>
                            <td style={{ padding: "8px 14px", textAlign: "center" }}>
                              <div style={{ display: "flex", alignItems: "center", gap: 6, justifyContent: "center" }}>
                                <div style={{ width: 60, height: 5, background: "#E8EEFA", borderRadius: 3, overflow: "hidden" }}>
                                  <div style={{ width: `${Math.min(pct, 100)}%`, height: "100%", background: pct >= 100 ? "#16A34A" : "#378ADD", borderRadius: 3 }} />
                                </div>
                                <span style={{ fontSize: 11, color: "var(--text-2)", fontVariantNumeric: "tabular-nums" }}>{pct}%</span>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* Filtros de coluna */}
          <div style={{ display: "flex", gap: 8, marginBottom: 10, flexWrap: "wrap", alignItems: "center" }}>
            <input placeholder="Buscar descrição, credor, nº operação..." value={colBusca} onChange={e => setColBusca(e.target.value)}
              style={{ flex: "1 1 200px", padding: "7px 11px", border: "0.5px solid var(--border-table)", borderRadius: 7, fontSize: 12, background: "var(--bg-card)", color: "var(--text-1)", outline: "none" }} />
            <select value={colTipo} onChange={e => setColTipo(e.target.value)}
              style={{ padding: "7px 11px", border: "0.5px solid var(--border-table)", borderRadius: 7, fontSize: 12, background: "var(--bg-card)", color: "var(--text-1)" }}>
              <option value="">Tipo: Todos</option>
              <option value="custeio">Custeio</option>
              <option value="investimento">Investimento</option>
              <option value="cpr">CPR</option>
              <option value="egf">EGF</option>
              <option value="securitizacao">Securitização</option>
              <option value="outros">Outros</option>
            </select>
            <select value={colMoeda} onChange={e => setColMoeda(e.target.value)}
              style={{ padding: "7px 11px", border: "0.5px solid var(--border-table)", borderRadius: 7, fontSize: 12, background: "var(--bg-card)", color: "var(--text-1)" }}>
              <option value="">Moeda: Todas</option>
              <option value="BRL">BRL</option>
              <option value="USD">USD</option>
            </select>
            <select value={colCalc} onChange={e => setColCalc(e.target.value)}
              style={{ padding: "7px 11px", border: "0.5px solid var(--border-table)", borderRadius: 7, fontSize: 12, background: "var(--bg-card)", color: "var(--text-1)" }}>
              <option value="">Cálculo: Todos</option>
              <option value="sac">SAC</option>
              <option value="price">PRICE</option>
              <option value="sac_crescente">SACRE</option>
              <option value="outros">Outros</option>
            </select>
            <select value={colStatus} onChange={e => setColStatus(e.target.value)}
              style={{ padding: "7px 11px", border: "0.5px solid var(--border-table)", borderRadius: 7, fontSize: 12, background: "var(--bg-card)", color: "var(--text-1)" }}>
              <option value="">Status: Todos</option>
              <option value="ativo">Ativo</option>
              <option value="quitado">Quitado</option>
              <option value="cancelado">Cancelado</option>
              <option value="refinanciado">Refinanciado</option>
            </select>
            {(colBusca || colTipo || colMoeda || colCalc || colStatus) && (
              <button onClick={() => { setColBusca(""); setColTipo(""); setColMoeda(""); setColCalc(""); setColStatus(""); }}
                style={{ padding: "7px 11px", border: "0.5px solid var(--border-table)", borderRadius: 7, fontSize: 12, background: "#FCEBEB", color: "#791F1F", cursor: "pointer" }}>
                ✕ Limpar
              </button>
            )}
          </div>

          {/* Tabela */}
          {erroCarregamento ? (
            <div style={{ background: "#FCEBEB", borderRadius: 14, border: "0.5px solid #E24B4A50", padding: "32px 24px", textAlign: "center" }}>
              <div style={{ fontWeight: 600, fontSize: 14, color: "#791F1F", marginBottom: 6 }}>Erro ao carregar contratos</div>
              <div style={{ fontSize: 12, color: "#791F1F", marginBottom: 16 }}>{erroCarregamento}</div>
              <button style={{ ...btnV, background: "#111111" }} onClick={() => { setErroCarregamento(null); if (fazendaId) listarContratosFinanceirosDaConta(contaId, fazendaId).then(setContratos).catch(err => setErroCarregamento(String(err?.message ?? err))); }}>
                Tentar novamente
              </button>
            </div>
          ) : contratosFiltrados.length === 0 ? (
            <div style={{ background: "var(--bg-card)", borderRadius: 14, border: "0.5px solid var(--border)", padding: "56px 0", textAlign: "center" }}>
              <div style={{ fontSize: 40, marginBottom: 10 }}>🏦</div>
              <div style={{ fontWeight: 600, fontSize: 14, color: "var(--text-1)", marginBottom: 4 }}>Nenhum contrato financeiro cadastrado</div>
              <div style={{ fontSize: 12, color: "var(--text-3)" }}>Custeio bancário, CPR, Pronaf, financiamento de máquinas…</div>
            </div>
          ) : (
            <div style={{ background: "var(--bg-card)", borderRadius: 14, border: "0.5px solid var(--border)", overflow: "hidden" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ background: "var(--bg-page)" }}>
                    {["Descrição / Credor", "Nº Operação", "Tipo", "Moeda", "Cálculo", "Taxa a.a.", "Prazo", "Valor", "Data Contrato", "Status", ""].map((h, i) => (
                      <th key={i} style={{ padding: "10px 14px", textAlign: i < 2 ? "left" : "center", fontSize: 11, fontWeight: 600, color: "var(--text-2)", borderBottom: "0.5px solid var(--border)", whiteSpace: "nowrap" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {contratosFiltrados.map((c, idx) => {
                    const tm = TIPO_META[c.tipo];
                    const sm = STATUS_META[c.status];
                    return (
                      <tr key={c.id} style={{ borderBottom: idx < contratosFiltrados.length - 1 ? "0.5px solid var(--bg-tag)" : "none", cursor: "pointer" }}
                        onMouseEnter={e => (e.currentTarget.style.background = "#FAFBFD")}
                        onMouseLeave={e => (e.currentTarget.style.background = "transparent")}>
                        <td style={{ padding: "10px 14px" }}>
                          <div style={{ fontWeight: 600, color: "var(--text-1)" }}>{c.descricao}</div>
                          <div style={{ fontSize: 11, color: "var(--text-3)" }}>{c.credor}{c.linha_credito ? ` · ${c.linha_credito}` : ""}</div>
                          {c.produtor_id && (() => { const p = produtores.find(x => x.id === c.produtor_id); return p ? <div style={{ fontSize: 11, color: "#111111", fontWeight: 500, marginTop: 2 }}>{p.nome}</div> : null; })()}
                        </td>
                        <td style={{ padding: "10px 14px", fontFamily: "monospace", fontSize: 12, color: "#111111", whiteSpace: "nowrap" }}>{c.numero_documento || "—"}</td>
                        <td style={{ padding: "10px 14px", textAlign: "center" }}>{badge(tm.label, tm.bg, tm.cl)}</td>
                        <td style={{ padding: "10px 14px", textAlign: "center" }}>
                          {c.moeda === "USD"
                            ? <span style={{ background: "#E8F4E8", color: "#166534", fontWeight: 700, fontSize: 11, padding: "2px 8px", borderRadius: 4, letterSpacing: "0.3px" }}>USD</span>
                            : <span style={{ background: "#E8EEFA", color: "#111111", fontWeight: 700, fontSize: 11, padding: "2px 8px", borderRadius: 4, letterSpacing: "0.3px" }}>BRL</span>}
                        </td>
                        <td style={{ padding: "10px 14px", textAlign: "center" }}>{badge({ sac: "SAC", sac_crescente: "SACRE", price: "PRICE", outros: "Outros" }[c.tipo_calculo ?? "sac"] ?? (c.tipo_calculo ?? "SAC").toUpperCase(), "#F1EFE8", "var(--text-2)")}</td>
                        <td style={{ padding: "10px 14px", textAlign: "center", color: "var(--text-1)" }}>
                          {c.taxa_tipo === "variavel" && c.indexador
                            ? <span title={`Taxa fixa + variável: ${c.indexador}${c.spread_aa != null ? ` + ${fmtNum(c.spread_aa, 2)}% a.a. (fixo)` : ""}`}>
                                {c.indexador}{c.spread_aa != null ? <span style={{ fontSize: 10, color: "var(--text-3)" }}> +{fmtNum(c.spread_aa, 2)}%</span> : ""}
                              </span>
                            : c.taxa_juros_aa ? `${fmtNum(c.taxa_juros_aa, 2)}% a.a.` : "—"}
                        </td>
                        <td style={{ padding: "10px 14px", textAlign: "center", color: "var(--text-1)", whiteSpace: "nowrap" }}>
                          {prazoMap[c.id]
                            ? <><span style={{ fontWeight: 600 }}>{prazoMap[c.id]}×</span> <span style={{ fontSize: 11, color: "var(--text-3)" }}>{{ 1: "mensal", 3: "trimestral", 6: "semestral", 12: "anual" }[c.periodicidade_meses ?? 1] ?? `${c.periodicidade_meses ?? 1}m`}</span></>
                            : "—"}
                        </td>
                        <td style={{ padding: "10px 14px", textAlign: "center" }}>
                          <div style={{ fontWeight: 600 }}>{c.moeda === "USD" ? `US$ ${fmtNum(c.valor_financiado)}` : fmtBRL(c.valor_financiado)}</div>
                          {c.moeda === "USD" && ptax && <div style={{ fontSize: 10, color: "var(--text-3)" }}>≈ {fmtBRL(c.valor_financiado * ptax)}</div>}
                        </td>
                        <td style={{ padding: "10px 14px", textAlign: "center", color: "var(--text-1)" }}>{fmtData(c.data_contrato)}</td>
                        <td style={{ padding: "10px 14px", textAlign: "center" }}>
                          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
                            {badge(sm.label, sm.bg, sm.cl)}
                            {/* quantos contratos este consolida */}
                            {(() => { const n = contratos.filter(x => x.refinanciado_por_id === c.id).length; return n > 0 ? <span style={{ fontSize: 10, color: "#4B3B9B", fontWeight: 600 }}>🔗 {n} contrato{n > 1 ? "s" : ""}</span> : null; })()}
                          </div>
                        </td>
                        <td style={{ padding: "10px 14px", textAlign: "right" }}>
                          <div style={{ display: "flex", gap: 6, justifyContent: "flex-end", alignItems: "center" }}>
                            {c.pdf_url ? (
                              <a href={c.pdf_url} target="_blank" rel="noreferrer" title={`Abrir cédula: ${c.pdf_nome ?? "PDF"}`}
                                style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11, padding: "4px 9px", background: "#FBF3E0", color: "#7A4300", border: "0.5px solid #C9921B", borderRadius: 6, textDecoration: "none", fontWeight: 600, whiteSpace: "nowrap" }}>
                                <svg width="12" height="12" viewBox="0 0 16 16" fill="none"><path d="M3 2a1 1 0 011-1h6l4 4v9a1 1 0 01-1 1H4a1 1 0 01-1-1V2z" stroke="#C9921B" strokeWidth="1.2" fill="#FDE9BB"/><path d="M9 1v4h4" stroke="#C9921B" strokeWidth="1.2" fill="none"/><path d="M5 8h6M5 10.5h4" stroke="#C9921B" strokeWidth="1.2" strokeLinecap="round"/></svg>
                                PDF
                              </a>
                            ) : (
                              <button title="Anexar PDF da cédula" onClick={() => { abrirModal(c); }}
                                style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11, padding: "4px 9px", background: "#F4F6FA", color: "#999", border: "0.5px solid #DDE2EE", borderRadius: 6, cursor: "pointer", fontWeight: 500, whiteSpace: "nowrap" }}>
                                <svg width="12" height="12" viewBox="0 0 16 16" fill="none"><path d="M3 2a1 1 0 011-1h6l4 4v9a1 1 0 01-1 1H4a1 1 0 01-1-1V2z" stroke="#bbb" strokeWidth="1.2" fill="#f0f0f0"/><path d="M9 1v4h4" stroke="#bbb" strokeWidth="1.2" fill="none"/><path d="M8 7v4M6 9h4" stroke="#bbb" strokeWidth="1.4" strokeLinecap="round"/></svg>
                                PDF
                              </button>
                            )}
                            <button style={{ ...btnE, background: "#EBF2FA", color: "#111111", fontWeight: 600 }} onClick={() => abrirModal(c)}>Abrir</button>
                            <button style={btnX} onClick={() => { if (confirm("Excluir contrato e todas as parcelas?")) excluirContratoFinanceiro(c.id).then(() => setContratos(p => p.filter(x => x.id !== c.id))); }}>✕</button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>


      {/* ══ Modal Unificado ══ */}
      {modalAberto && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(11,45,80,0.32)", display: "flex", alignItems: "center", justifyContent: "center", zIndex:2000 }}
          onClick={e => { if (e.target === e.currentTarget) fecharModal(); }}>
          <div style={{ background: "var(--bg-card)", borderRadius: 16, width: "min(1160px, 97vw)", maxHeight: "95vh", display: "flex", flexDirection: "column", overflow: "hidden" }}>

            {/* Cabeçalho do modal */}
            <div style={{ padding: "18px 26px 0", borderBottom: "0.5px solid var(--border-table)", flexShrink: 0 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14 }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 16, color: "var(--text-1)" }}>
                    {contratoModal ? contratoModal.descricao : "Novo Contrato Financeiro"}
                  </div>
                  {contratoModal && (
                    <div style={{ fontSize: 12, color: "#666", marginTop: 2 }}>
                      {contratoModal.credor} · {TIPO_META[contratoModal.tipo].label}
                      {contratoModal.linha_credito ? ` / ${contratoModal.linha_credito}` : ""}
                      {" · "}
                      {contratoModal.moeda === "USD"
                        ? `US$ ${fmtNum(contratoModal.valor_financiado)}${ptax ? ` ≈ ${fmtBRL(contratoModal.valor_financiado * ptax)}` : ""}`
                        : fmtBRL(contratoModal.valor_financiado)}
                    </div>
                  )}
                </div>
                <button onClick={fecharModal} style={{ border: "none", background: "transparent", fontSize: 20, cursor: "pointer", color: "var(--text-3)", lineHeight: 1 }}>✕</button>
              </div>

              {/* Abas */}
              <div style={{ display: "flex", gap: 0, overflowX: "auto" }}>
                {([
                  ["principal",     "Principal"],
                  ["liberacao",     "Liberação"],
                  ["pagamento",     "Pagamento"],
                  ["garantias",     "Garantias"],
                  ["centrocusto",   "Centro de Custo"],
                  ["aditivos",      "Aditivos"],
                  ["movimentacoes", "Movimentações"],
                ] as const).map(([k, l]) => {
                  const bloqueada = k !== "principal" && !contratoModal;
                  return (
                    <button key={k} onClick={() => !bloqueada && setAbaModal(k)}
                      style={{ padding: "8px 16px", border: "none", background: "transparent", cursor: bloqueada ? "not-allowed" : "pointer", fontSize: 13, fontWeight: abaModal === k ? 700 : 400, color: bloqueada ? "#ccc" : abaModal === k ? "#111111" : "var(--text-2)", borderBottom: abaModal === k ? "2.5px solid #111111" : "2.5px solid transparent", whiteSpace: "nowrap", transition: "color 0.1s" }}
                    >{l}{bloqueada ? " 🔒" : ""}</button>
                  );
                })}
              </div>
            </div>

            {/* Banner de erro (substitui alert() — seguro em todos os browsers) */}
            {erroModal && (
              <div style={{ background: "#FEECEC", border: "0.5px solid #E24B4A", borderRadius: 0, padding: "10px 26px", fontSize: 13, color: "#7A1010", display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
                <span style={{ fontWeight: 700 }}>⚠ Erro:</span>
                <span style={{ flex: 1 }}>{erroModal}</span>
                <button onClick={() => setErroModal(null)} style={{ border: "none", background: "transparent", cursor: "pointer", color: "#7A1010", fontSize: 16, lineHeight: 1 }}>✕</button>
              </div>
            )}

            {/* Conteúdo */}
            <div style={{ flex: 1, overflowY: "auto", padding: "22px 26px" }}>

              {/* Fazenda — seletor explícito */}
              {fazendas.length > 1 && (
                <div style={{ background:"#F2F2F2", border:"0.5px solid #B8D4F0", borderRadius:10, padding:"10px 16px", marginBottom:14 }}>
                  <div style={{ fontSize:10, fontWeight:700, color:"#111111", textTransform:"uppercase", letterSpacing:1, marginBottom:8 }}>Este contrato pertence a</div>
                  <div>
                    <label style={{ fontSize:11, fontWeight:700, color:"#111111", textTransform:"uppercase" as const, letterSpacing:"0.05em", display:"block", marginBottom:4 }}>Fazenda <span style={{ color:"#E24B4A" }}>*</span></label>
                    <select style={inp} value={fC.fazenda_id || fazendaId || ""} onChange={e => setFC(p => ({ ...p, fazenda_id: e.target.value }))}>
                      <option value="">— Selecionar —</option>
                      {fazendas.map(fz => <option key={fz.id} value={fz.id}>{fz.nome}</option>)}
                    </select>
                  </div>
                </div>
              )}

              {/* ── Principal ── */}
              {abaModal === "principal" && (
                <div>
                  {/* ── Banner IA — upload de cédula PDF (Add-on ia_cedula) ── */}
                  {!contratoModal && contaModulosOverrides["ia_cedula"] === true && (
                    <div style={{ marginBottom: 18, border: "0.5px solid #C9921B", borderRadius: 10, background: "#FBF3E0", padding: "12px 16px" }}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                        <div>
                          <div style={{ fontSize: 13, fontWeight: 600, color: "#7A4300", marginBottom: 3 }}>
                            📄 Deixe que o Arato lança pra você. Anexe o PDF da Cédula aqui.
                          </div>
                          <div style={{ fontSize: 11, color: "#7A4300" }}>
                            Envie o PDF — o sistema extrai credor, valor, taxa, amortização e datas. Você só revisa e salva.
                          </div>
                        </div>
                        <div style={{ display: "flex", gap: 8, alignItems: "center", flexShrink: 0 }}>
                          {iaExtraindo && (
                            <span style={{ fontSize: 11, color: "#7A4300" }}>Lendo cédula…</span>
                          )}
                          {iaConfianca && !iaExtraindo && (
                            <span style={{ fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 5,
                              background: iaConfianca === "alta" ? "#DCFCE7" : iaConfianca === "media" ? "#FBF3E0" : "#FCEBEB",
                              color: iaConfianca === "alta" ? "#166534" : iaConfianca === "media" ? "#7A4300" : "#791F1F",
                              border: `0.5px solid ${iaConfianca === "alta" ? "#16A34A" : iaConfianca === "media" ? "#C9921B" : "#E24B4A"}`,
                            }}>
                              {iaConfianca === "alta" ? "✓ Alta confiança" : iaConfianca === "media" ? "⚠ Revisar" : "⚠ Baixa — confira tudo"}
                            </span>
                          )}
                          {pdfNome && !iaExtraindo && (
                            <span style={{ fontSize: 11, color: "#7A4300", maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>📎 {pdfNome}</span>
                          )}
                          <label style={{ padding: "6px 14px", background: iaExtraindo ? "#ddd" : "#C9921B", color: "#fff", borderRadius: 7, fontSize: 12, fontWeight: 600, cursor: iaExtraindo ? "default" : "pointer", whiteSpace: "nowrap" }}>
                            {iaExtraindo ? "Processando…" : pdfNome ? "Trocar PDF" : "Selecionar PDF"}
                            <input type="file" accept="application/pdf" style={{ display: "none" }} disabled={iaExtraindo}
                              onChange={e => { const f = e.target.files?.[0]; if (f) handlePdfUpload(f); e.target.value = ""; }}
                            />
                          </label>
                        </div>
                      </div>
                    </div>
                  )}
                  {/* PDF da cédula — upload e visualização (sempre visível ao editar) */}
                  {contratoModal && (
                    <div style={{ marginBottom: 14, background: "#E8F3FB", border: "0.5px solid #11111140", borderRadius: 8, padding: "8px 14px", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, flex: 1, minWidth: 0 }}>
                        <span style={{ fontSize: 14 }}>📎</span>
                        {(pdfFile ? pdfNome : contratoModal.pdf_nome) ? (
                          <span style={{ fontSize: 12, color: "#0D0D0D" }}>
                            Cédula: <strong style={{ maxWidth: 280, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", display: "inline-block", verticalAlign: "bottom" }}>{pdfFile ? pdfNome : (contratoModal.pdf_nome ?? "arquivo.pdf")}</strong>
                            {pdfFile && <span style={{ fontSize: 11, color: "#C9921B", marginLeft: 6 }}>(novo — salve para confirmar)</span>}
                          </span>
                        ) : (
                          <span style={{ fontSize: 12, color: "#555" }}>Nenhuma cédula PDF anexada</span>
                        )}
                      </div>
                      <div style={{ display: "flex", gap: 10, flexShrink: 0, alignItems: "center" }}>
                        {!pdfFile && contratoModal.pdf_url && (
                          <a href={contratoModal.pdf_url} target="_blank" rel="noreferrer" style={{ fontSize: 12, color: "#111111", fontWeight: 600, textDecoration: "none" }}>Abrir PDF ↗</a>
                        )}
                        <label style={{ fontSize: 12, color: "#111111", fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap", textDecoration: "underline" }}>
                          {(pdfFile || contratoModal.pdf_nome) ? "Substituir PDF" : "Anexar PDF"}
                          <input type="file" accept="application/pdf" style={{ display: "none" }}
                            onChange={e => { const f = e.target.files?.[0]; if (f) { setPdfFile(f); setPdfNome(f.name); } e.target.value = ""; }}
                          />
                        </label>
                      </div>
                    </div>
                  )}
                  {/* Banner: este contrato foi refinanciado */}
                  {contratoModal?.status === "refinanciado" && contratoModal.refinanciado_por_id && (() => {
                    const novoC = contratos.find(x => x.id === contratoModal.refinanciado_por_id);
                    return (
                      <div style={{ marginBottom: 14, background: "#F0EDFE", border: "0.5px solid #7C6FC3", borderRadius: 8, padding: "10px 14px", display: "flex", alignItems: "center", gap: 10 }}>
                        <span style={{ fontSize: 16 }}>🔗</span>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 12, fontWeight: 600, color: "#4B3B9B" }}>Este contrato foi refinanciado</div>
                          <div style={{ fontSize: 11, color: "#6B5CA5", marginTop: 2 }}>
                            Absorvido por: <strong>{novoC?.descricao ?? `Contrato ${contratoModal.refinanciado_por_id.slice(0, 8)}…`}</strong>
                            {novoC?.numero_documento && ` — Nº ${novoC.numero_documento}`}
                          </div>
                        </div>
                        {novoC && (
                          <button style={{ fontSize: 11, padding: "4px 10px", background: "#EDE9FB", border: "0.5px solid #7C6FC3", borderRadius: 6, cursor: "pointer", color: "#4B3B9B", fontWeight: 600 }}
                            onClick={() => { fecharModal(); setTimeout(() => abrirModal(novoC), 50); }}>
                            Ver novo contrato →
                          </button>
                        )}
                      </div>
                    );
                  })()}

                  <SecTitle>Identificação</SecTitle>
                  <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr", gap: 12, marginBottom: 4 }}>
                    <div style={{ gridColumn: "1/-1" }}>
                      <label style={lbl}>Descrição *</label>
                      <input style={inp} placeholder="Ex: Custeio Soja 2026/2027 — Banco do Brasil" value={fC.descricao} onChange={e => setFC(p => ({ ...p, descricao: e.target.value }))} />
                    </div>
                    <div>
                      <label style={lbl}>Tipo de Contrato *</label>
                      <select style={inp} value={fC.tipo} onChange={e => setFC(p => ({ ...p, tipo: e.target.value as ContratoFinanceiro["tipo"] }))}>
                        <option value="custeio">Custeio</option>
                        <option value="investimento">Investimento / Financiamento</option>
                        <option value="securitizacao">Securitização</option>
                        <option value="cpr">CPR</option>
                        <option value="egf">EGF</option>
                        <option value="outros">Outros</option>
                      </select>
                    </div>
                    <div>
                      <label style={lbl}>Linha de Crédito</label>
                      <input style={inp} list="linhas-credito-list" placeholder="Ex: Obrigatórios - MCR 6.2, PRONAF…" value={fC.linha_credito} onChange={e => setFC(p => ({ ...p, linha_credito: e.target.value }))} />
                      <datalist id="linhas-credito-list">
                        {LINHAS_CREDITO.map(l => <option key={l} value={l} />)}
                      </datalist>
                    </div>
                    <div>
                      <label style={lbl}>Nº Documento / Contrato <span style={{ color: "#E24B4A" }}>*</span></label>
                      <input style={inp} placeholder="Ex: 12345/2026" value={fC.numero_documento} onChange={e => setFC(p => ({ ...p, numero_documento: e.target.value }))} />
                    </div>
                    <div>
                      <label style={lbl}>Tipo de Cálculo *</label>
                      <select style={inp} value={fC.tipo_calculo} onChange={e => setFC(p => ({ ...p, tipo_calculo: e.target.value as ContratoFinanceiro["tipo_calculo"] }))}>
                        <option value="sac">SAC Decrescente — Amortização Constante</option>
                        <option value="sac_crescente">SAC Crescente (SACRE) — Amortização Crescente</option>
                        <option value="price">PRICE (Tabela Francesa) — Parcela Constante</option>
                        <option value="outros">Outros / Manual</option>
                      </select>
                    </div>
                  </div>

                  <SecTitle>Produtor / Tomador do Crédito</SecTitle>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 4 }}>
                    <div>
                      <label style={lbl}>Produtor responsável (LCDPR)</label>
                      <select style={inp} value={fC.produtor_id} onChange={e => setFC(p => ({ ...p, produtor_id: e.target.value }))}>
                        <option value="">— Selecionar produtor —</option>
                        {produtores.map(p => <option key={p.id} value={p.id}>{p.nome}{p.cpf_cnpj ? ` — ${p.cpf_cnpj}` : ""}</option>)}
                      </select>
                    </div>
                    <div style={{ alignSelf: "end", fontSize: 11, color: "#888", paddingBottom: 8 }}>
                      Vincula o contrato ao CPF do produtor para o Livro Caixa e SPED. Extraído automaticamente do PDF.
                    </div>
                  </div>

                  <SecTitle>Credor / Instituição Financeira</SecTitle>
                  {/* Busca por CNPJ/CPF */}
                  <div style={{ display: "flex", gap: 8, alignItems: "flex-end", marginBottom: 10 }}>
                    <div style={{ flex: 1 }}>
                      <label style={lbl}>Buscar credor por CNPJ / CPF</label>
                      <input
                        style={inp}
                        placeholder="Digite o CNPJ ou CPF e pressione Enter"
                        value={cnpjBusca}
                        onChange={e => { setCnpjBusca(e.target.value); setCnpjBuscaStatus("idle"); }}
                        onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); buscarCredorPorCnpj(); } }}
                      />
                    </div>
                    <button style={{ ...btnV, background: "#111111", whiteSpace: "nowrap" }} onClick={buscarCredorPorCnpj} type="button">
                      Buscar
                    </button>
                    {cnpjBuscaStatus === "encontrado" && (
                      <span style={{ fontSize: 11, color: "#16A34A", fontWeight: 600, whiteSpace: "nowrap" }}>✓ Encontrado</span>
                    )}
                    {cnpjBuscaStatus === "nao_encontrado" && (
                      <button
                        style={{ ...btnV, background: "#C9921B", whiteSpace: "nowrap" }}
                        type="button"
                        onClick={() => window.open("/cadastros?tab=pessoas", "_blank")}
                      >
                        + Cadastrar Fornecedor
                      </button>
                    )}
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 4 }}>
                    <div>
                      <label style={lbl}>Credor (fornecedor cadastrado){fC.pessoa_id ? " ✓" : ""}</label>
                      <select style={inp} value={fC.pessoa_id} onChange={e => { onPessoaChange(e.target.value); setCnpjBuscaStatus("idle"); }}>
                        <option value="">— Selecionar —</option>
                        {pessoas.map(p => <option key={p.id} value={p.id}>{p.nome}{p.cpf_cnpj ? ` — ${p.cpf_cnpj}` : ""}</option>)}
                      </select>
                    </div>
                    <div>
                      <label style={lbl}>Nome do Credor <span style={{ color: "#E24B4A" }}>*</span>{fC.pessoa_id ? " (do cadastro)" : ""}</label>
                      <input style={inp} placeholder="Ex: Banco do Brasil, Bradesco, Cooperativa…" value={fC.credor} onChange={e => setFC(p => ({ ...p, credor: e.target.value }))} />
                    </div>
                  </div>

                  <SecTitle>Captação — Valor e Moeda</SecTitle>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr 1fr 1fr", gap: 12, marginBottom: 4 }}>
                    <div>
                      <label style={lbl}>Moeda</label>
                      <select style={inp} value={fC.moeda} onChange={e => setFC(p => ({ ...p, moeda: e.target.value as "BRL" | "USD", valor_cotacao: "" }))}>
                        <option value="BRL">Real (R$)</option>
                        <option value="USD">Dólar (US$)</option>
                      </select>
                    </div>
                    <div>
                      <label style={lbl}>Valor Financiado * ({fC.moeda === "USD" ? "US$" : "R$"})</label>
                      <InputMonetario style={inp} placeholder="0,00" value={fC.valor_financiado} onChange={v => setFC(p => ({ ...p, valor_financiado: String(v) }))} />
                    </div>
                    {fC.moeda === "USD" ? (
                      <div>
                        <label style={lbl}>Cotação R$/US$</label>
                        <InputMonetario style={inp} placeholder="5,85" value={fC.valor_cotacao} onChange={v => setFC(p => ({ ...p, valor_cotacao: String(v) }))} />
                      </div>
                    ) : <div />}
                    <div>
                      <label style={lbl}>Data do Contrato *</label>
                      <input style={inp} type="date" value={fC.data_contrato} onChange={e => setFC(p => ({ ...p, data_contrato: e.target.value }))} />
                    </div>
                    <div>
                      <label style={lbl}>Periodicidade</label>
                      <select style={inp} value={fC.periodicidade_meses} onChange={e => setFC(p => ({ ...p, periodicidade_meses: e.target.value }))}>
                        <option value="1">Mensal</option>
                        <option value="6">Semestral</option>
                        <option value="12">Anual</option>
                      </select>
                    </div>
                    <div>
                      <label style={lbl}>
                        Carência (meses)
                        {Number(fC.carencia_meses) > 0 && Number(fC.periodicidade_meses) > 1 && Number(fC.carencia_meses) < Number(fC.periodicidade_meses) && (
                          <span title="Carência menor que a periodicidade não gera período de carência. Para pagamento anual, carência real ocorre a partir de 12 meses." style={{ marginLeft: 4, color: "#C9921B", cursor: "help" }}>⚠</span>
                        )}
                      </label>
                      <InputNumerico style={inp} decimais={0} min="0" value={fC.carencia_meses} onChange={v => setFC(p => ({ ...p, carencia_meses: v }))} />
                      {Number(fC.carencia_meses) > 0 && Number(fC.periodicidade_meses) > 1 && Number(fC.carencia_meses) < Number(fC.periodicidade_meses) && (
                        <div style={{ fontSize: 10, color: "#C9921B", marginTop: 3 }}>
                          Carência inferior à periodicidade ({fC.periodicidade_meses}m) — intervalo normal, sem período de carência real.
                        </div>
                      )}
                    </div>
                    {Number(fC.carencia_meses) > 0 && (
                      <div>
                        <label style={lbl}>Tipo de Carência</label>
                        <select style={inp} value={fC.carencia_tipo} onChange={e => setFC(p => ({ ...p, carencia_tipo: e.target.value as "so_juros" | "total" }))}>
                          <option value="so_juros">Só juros</option>
                          <option value="total">Carência total (capitaliza)</option>
                        </select>
                      </div>
                    )}
                    {fC.tipo_calculo === "sac_crescente" && (
                      <div>
                        <label style={lbl}>Crescimento da Amortização por Período (%)</label>
                        <InputMonetario style={inp} placeholder="Ex: 2 (IPCA, TR, fixo)" value={fC.crescimento_pct} onChange={v => setFC(p => ({ ...p, crescimento_pct: String(v) }))} />
                      </div>
                    )}
                  </div>

                  <SecTitle>Taxas e Custos da Operação</SecTitle>
                  {/* Toggle Fixa / Variável */}
                  <div style={{ display: "flex", gap: 4, marginBottom: 12 }}>
                    {(["fixa", "variavel"] as const).map(t => (
                      <button key={t} type="button" onClick={() => setFC(p => ({ ...p, taxa_tipo: t }))}
                        style={{ padding: "4px 14px", borderRadius: 6, border: `0.5px solid ${fC.taxa_tipo === t ? "#111111" : "var(--border)"}`, background: fC.taxa_tipo === t ? "#E8E8E8" : "transparent", color: fC.taxa_tipo === t ? "#0D0D0D" : "var(--text-3)", fontSize: 12, fontWeight: fC.taxa_tipo === t ? 600 : 400, cursor: "pointer" }}>
                        {t === "fixa" ? "Taxa Fixa" : "Taxa Fixa + Variável"}
                      </button>
                    ))}
                  </div>

                  {fC.taxa_tipo === "fixa" ? (
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr 1fr", gap: 12, marginBottom: 4 }}>
                      <div>
                        <label style={lbl}>Taxa de Juros a.a. (%) <span style={{ color: "#E24B4A" }}>*</span></label>
                        <InputNumerico style={inp} decimais={3} placeholder="Ex: 12,00" value={fC.taxa_juros_aa} onChange={v => onChangeAa(v)} />
                      </div>
                      <div>
                        <label style={lbl}>Taxa de Juros a.m. (%)</label>
                        <InputNumerico style={inp} decimais={4} placeholder="Auto" value={fC.taxa_juros_am} onChange={v => onChangeAm(v)} />
                      </div>
                      <div>
                        <label style={lbl}>IOF (%)</label>
                        <InputNumerico style={inp} decimais={3} placeholder="Ex: 0,38" value={fC.iof_pct} onChange={v => setFC(p => ({ ...p, iof_pct: v }))} />
                      </div>
                      <div>
                        <label style={lbl}>TAC — Tarifa de Abertura (R$)</label>
                        <InputMonetario style={inp} placeholder="Ex: 500,00" value={fC.tac_valor} onChange={v => setFC(p => ({ ...p, tac_valor: String(v) }))} />
                      </div>
                      <div>
                        <label style={lbl}>Outros Custos Fixos (R$)</label>
                        <InputMonetario style={inp} placeholder="Registro, cartório…" value={fC.outros_custos} onChange={v => setFC(p => ({ ...p, outros_custos: String(v) }))} />
                      </div>
                    </div>
                  ) : (
                    <>
                      {/* Linha 1: Indexador | Taxa Variável (ref) | Juros Fixos a.a. | Juros Fixos a.m. | TEF a.a. */}
                      <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr 1fr 1fr 1fr", gap: 12, marginBottom: 8 }}>
                        <div>
                          <label style={lbl}>Indexador <span style={{ color: "#E24B4A" }}>*</span></label>
                          <select style={inp} value={fC.indexador} onChange={e => { setFC(p => ({ ...p, indexador: e.target.value })); buscarTaxaVariavelRef(e.target.value); }}>
                            <option value="">Selecione…</option>
                            {["CDI", "IPCA", "SELIC", "TR", "TJLP", "TLP", "INPC", "IGP-M", "Outro"].map(idx => (
                              <option key={idx} value={idx}>{idx}</option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label style={lbl}>
                            Taxa {fC.indexador || "Variável"} — ref. {loadingTaxaRef ? "…" : taxaVariavelRef != null ? `${fmtNum(taxaVariavelRef, 4)}% a.a.` : "sem dado"}
                          </label>
                          <input style={{ ...inp, background: "var(--bg-page)", color: "var(--text-3)", cursor: "default" }}
                            readOnly value={taxaVariavelRef != null ? fmtNum(taxaVariavelRef, 4) : "—"} />
                        </div>
                        <div>
                          <label style={lbl}>Juros Fixos a.a. (%)</label>
                          <InputNumerico style={inp} decimais={3} placeholder="Ex: 3,40" value={fC.spread_aa}
                            onChange={v => { const aa = parseFloat(v.replace(",", ".")); setFC(p => ({ ...p, spread_aa: v, spread_am: isNaN(aa) ? "" : String(parseFloat(aaParaAm(aa).toFixed(6))) })); }} />
                        </div>
                        <div>
                          <label style={lbl}>Juros Fixos a.m. (%)</label>
                          <InputNumerico style={inp} decimais={4} placeholder="Auto" value={fC.spread_am}
                            onChange={v => { const am = parseFloat(v.replace(",", ".")); setFC(p => ({ ...p, spread_am: v, spread_aa: isNaN(am) ? "" : String(parseFloat(amParaAa(am).toFixed(4))) })); }} />
                        </div>
                        <div>
                          {(() => {
                            const variavel = taxaVariavelRef ?? 0;
                            const fixo = parseFloat((fC.spread_aa || "0").replace(",", ".")) || 0;
                            const tef = variavel + fixo;
                            return (
                              <div>
                                <label style={lbl}>TEF — Taxa Efetiva a.a. (%)</label>
                                <div style={{ ...inp, background: tef > 0 ? "#EAF4EC" : "var(--bg-page)", border: `0.5px solid ${tef > 0 ? "#16A34A" : "var(--border)"}`, color: tef > 0 ? "#0F5132" : "var(--text-3)", fontWeight: 700, fontSize: 14, display: "flex", alignItems: "center" }}>
                                  {tef > 0 ? `${fmtNum(tef, 2)}%` : "—"}
                                </div>
                              </div>
                            );
                          })()}
                        </div>
                      </div>
                      {/* Linha 2: IOF | TAC | Outros */}
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 2fr", gap: 12, marginBottom: 4 }}>
                        <div>
                          <label style={lbl}>IOF (%)</label>
                          <InputNumerico style={inp} decimais={3} placeholder="Ex: 0,38" value={fC.iof_pct} onChange={v => setFC(p => ({ ...p, iof_pct: v }))} />
                        </div>
                        <div>
                          <label style={lbl}>TAC — Tarifa de Abertura (R$)</label>
                          <InputMonetario style={inp} placeholder="Ex: 500,00" value={fC.tac_valor} onChange={v => setFC(p => ({ ...p, tac_valor: String(v) }))} />
                        </div>
                        <div>
                          <label style={lbl}>Outros Custos (R$)</label>
                          <InputMonetario style={inp} placeholder="Registro, cartório…" value={fC.outros_custos} onChange={v => setFC(p => ({ ...p, outros_custos: String(v) }))} />
                        </div>
                        <div style={{ display: "flex", alignItems: "flex-end" }} />
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4, padding: "6px 10px", background: "#FBF3E0", borderRadius: 6, border: "0.5px solid #EF9F27" }}>
                        <span style={{ fontSize: 11, color: "#7A4300" }}>⚠ Taxa fixa + variável — o cronograma usa apenas os <strong>juros fixos</strong> como estimativa. O custo real incluirá o {fC.indexador || "indexador"} vigente na data de cada parcela.</span>
                      </div>
                    </>
                  )}

                  <SecTitle>Contas Bancárias</SecTitle>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 12, marginBottom: 4 }}>
                    <div>
                      <label style={lbl}>Conta de Liberação</label>
                      <select style={inp} value={fC.conta_liberacao_id} onChange={e => { const id = e.target.value; const conta = contas.find(c => c.id === id); setFC(p => ({ ...p, conta_liberacao_id: id, credor: conta?.banco ? conta.banco : p.credor })); }}>
                        <option value="">— Onde o banco deposita —</option>
                        {contas.map(c => <option key={c.id} value={c.id}>{c.nome}{c.banco ? ` — ${c.banco}` : ""}{c.moeda === "USD" ? " (US$)" : ""}</option>)}
                      </select>
                    </div>
                    <div>
                      <label style={lbl}>Conta de Pagamento</label>
                      <select style={inp} value={fC.conta_pagamento_id} onChange={e => setFC(p => ({ ...p, conta_pagamento_id: e.target.value }))}>
                        <option value="">— Onde debitam as parcelas —</option>
                        {contas.map(c => <option key={c.id} value={c.id}>{c.nome}{c.banco ? ` — ${c.banco}` : ""}{c.moeda === "USD" ? " (US$)" : ""}</option>)}
                      </select>
                    </div>
                    <div>
                      <label style={lbl}>Forma de Pagamento</label>
                      <select style={inp} value={fC.forma_pagamento} onChange={e => setFC(p => ({ ...p, forma_pagamento: e.target.value }))}>
                        <option value="">Selecione…</option>
                        <option value="Débito em conta">Débito em conta</option>
                        <option value="Boleto">Boleto</option>
                        <option value="PIX">PIX</option>
                        <option value="TED/DOC">TED/DOC</option>
                        <option value="Cheque">Cheque</option>
                      </select>
                    </div>
                    <div>
                      <label style={lbl}>Local de Pagamento</label>
                      <input style={inp} placeholder="Ex: Agência 0001 — Nova Mutum" value={fC.local_pagamento} onChange={e => setFC(p => ({ ...p, local_pagamento: e.target.value }))} />
                    </div>
                  </div>

                  <SecTitle>Opções</SecTitle>
                  <div style={{ display: "flex", gap: 24, marginBottom: 10, flexWrap: "wrap" }}>
                    <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", fontSize: 13 }}>
                      <input type="checkbox" checked={fC.rateio_por_vencimento} onChange={e => setFC(p => ({ ...p, rateio_por_vencimento: e.target.checked }))} />
                      Rateio por vencimento
                    </label>
                    <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", fontSize: 13 }}>
                      <input type="checkbox" checked={fC.fiscal} onChange={e => setFC(p => ({ ...p, fiscal: e.target.checked }))} />
                      Integrar ao Fiscal (LCDPR)
                    </label>
                  </div>
                  <div>
                    <label style={lbl}>Observação</label>
                    <input style={inp} value={fC.observacao} onChange={e => setFC(p => ({ ...p, observacao: e.target.value }))} />
                  </div>

                  <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", alignItems: "center", marginTop: 22 }}>
                    {erroModal && (
                      <span style={{ fontSize: 12, color: "#E24B4A", maxWidth: 360, lineHeight: 1.4 }}>{erroModal}</span>
                    )}
                    <button style={btnR} onClick={() => { fecharModal(); setErroModal(null); }}>Fechar</button>
                    <button
                      style={{ ...btnV, background: "#111111" }}
                      disabled={salvando}
                      onClick={salvarContrato}
                    >{salvando ? "Salvando…" : contratoModal ? "Salvar alterações" : "Salvar e continuar"}</button>
                  </div>
                </div>
              )}

              {/* ── Liberação ── */}
              {abaModal === "liberacao" && (!contratoModal ? <AbaDisabled nome="Liberação" /> : (
                <div>
                  <div style={{ background: "#E4F0F9", border: "0.5px solid #11111140", borderRadius: 8, padding: "10px 14px", marginBottom: 14, fontSize: 12, color: "#0D0D0D" }}>
                    ✦ Ao registrar uma liberação, um lançamento CR é criado automaticamente no financeiro{contratoModal.conta_liberacao_id ? ` · Conta: ${nomeConta(contratoModal.conta_liberacao_id)}` : ""}.
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr auto", gap: 10, marginBottom: 16, alignItems: "end" }}>
                    <div><label style={lbl}>Data Liberação</label><input style={inp} type="date" value={fLib.data_liberacao} onChange={e => setFLib(p => ({ ...p, data_liberacao: e.target.value }))} /></div>
                    <div><label style={lbl}>Valor Liberado ({contratoModal.moeda === "USD" ? "US$" : "R$"})</label><InputMonetario style={inp} value={fLib.valor_liberado} onChange={v => setFLib(p => ({ ...p, valor_liberado: String(v) }))} /></div>
                    <div><label style={lbl}>Nº Parcelas</label><InputNumerico style={inp} decimais={0} min="1" value={fLib.parcelas_liberacao} onChange={v => setFLib(p => ({ ...p, parcelas_liberacao: v }))} /></div>
                    <button style={{ ...btnV, padding: "8px 14px" }} onClick={salvarLiberacao} disabled={salvando}>+ Adicionar</button>
                  </div>
                  {parcelasLiberacao.length === 0 ? (
                    <div style={{ textAlign: "center", padding: "24px 0", color: "var(--text-3)", fontSize: 12 }}>Nenhuma parcela de liberação registrada</div>
                  ) : (
                    <table style={{ width: "100%", borderCollapse: "collapse" }}>
                      <thead><tr style={{ background: "var(--bg-page)" }}>{["Nº", "Data", contratoModal.moeda === "USD" ? "Valor (US$)" : "Valor (R$)", contratoModal.moeda === "USD" ? "Equiv. R$" : "", "Lançto.CR", ""].map((h, i) => h ? <th key={i} style={{ padding: "7px 12px", textAlign: "center", fontSize: 11, fontWeight: 600, color: "var(--text-2)", borderBottom: "0.5px solid var(--border-table)" }}>{h}</th> : null)}</tr></thead>
                      <tbody>
                        {parcelasLiberacao.map((p, i) => (
                          <tr key={p.id} style={{ borderBottom: i < parcelasLiberacao.length - 1 ? "0.5px solid var(--border-row)" : "none" }}>
                            <td style={{ padding: "8px 12px", textAlign: "center" }}>{p.num_parcela}</td>
                            <td style={{ padding: "8px 12px", textAlign: "center" }}>{fmtData(p.data_liberacao)}</td>
                            <td style={{ padding: "8px 12px", textAlign: "center", fontWeight: 600 }}>{contratoModal.moeda === "USD" ? `US$ ${fmtNum(p.valor_liberado)}` : fmtBRL(p.valor_liberado)}</td>
                            {contratoModal.moeda === "USD" && <td style={{ padding: "8px 12px", textAlign: "center" }}>{p.valor_liberado_brl ? fmtBRL(p.valor_liberado_brl) : "—"}</td>}
                            <td style={{ padding: "8px 12px", textAlign: "center" }}>{p.lancamento_id ? badge("✓ CR", "#E8E8E8", "#0D0D0D") : badge("—", "#F1EFE8", "var(--text-2)")}</td>
                            <td style={{ padding: "8px 12px", textAlign: "right" }}><button style={btnX} onClick={() => excluirParcelaLiberacao(p.id).then(() => setParcelasLiberacao(x => x.filter(r => r.id !== p.id)))}>✕</button></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                  <div style={{ marginTop: 10, fontSize: 11, color: "var(--text-2)", textAlign: "right" }}>
                    Total liberado: <strong>{fmtBRL(parcelasLiberacao.reduce((s, p) => s + (p.valor_liberado_brl ?? p.valor_liberado), 0))}</strong>
                    {" · "}Saldo a liberar: <strong style={{ color: "#EF9F27" }}>{fmtBRL(Math.max(0, (contratoModal.valor_financiado_brl ?? contratoModal.valor_financiado) - parcelasLiberacao.reduce((s, p) => s + (p.valor_liberado_brl ?? p.valor_liberado), 0)))}</strong>
                  </div>
                </div>
              ))}

              {/* ── Pagamento ── */}
              {abaModal === "pagamento" && (!contratoModal ? <AbaDisabled nome="Pagamento" /> : (
                <div>
                  {/* Banner: principal utilizado no cálculo */}
                  <div style={{ background: "#F2F2F2", border: "0.5px solid #93C5FD", borderRadius: 8, padding: "8px 14px", marginBottom: 12, fontSize: 12, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <span style={{ color: "#1D4ED8", fontWeight: 600 }}>Principal da captação:</span>
                    <span style={{ fontWeight: 700, color: "var(--text-1)", fontSize: 13 }}>
                      {contratoModal.moeda === "USD"
                        ? `US$ ${fmtNum(contratoModal.valor_financiado)}${ptax ? ` ≈ ${fmtBRL(contratoModal.valor_financiado * ptax)}` : ""}`
                        : fmtBRL(contratoModal.valor_financiado)}
                    </span>
                    <span style={{ color: "var(--text-3)", fontSize: 11 }}>
                      · {contratoModal.taxa_tipo === "variavel" && contratoModal.indexador
                          ? `${contratoModal.indexador}${contratoModal.spread_aa != null ? ` + ${fmtNum(contratoModal.spread_aa, 2)}% a.a.` : ""}`
                          : contratoModal.taxa_juros_aa ? `${fmtNum(contratoModal.taxa_juros_aa, 4)}% a.a.` : ""}
                      {contratoModal.periodicidade_meses ? ` · Periodicidade: ${{ 1: "mensal", 3: "trimestral", 6: "semestral", 12: "anual" }[contratoModal.periodicidade_meses] ?? `${contratoModal.periodicidade_meses}m`}` : ""}
                      {(contratoModal.carencia_meses ?? 0) > 0 ? ` · Carência: ${contratoModal.carencia_meses}m` : ""}
                    </span>
                  </div>
                  {/* Aviso quando parcelas estão zeradas */}
                  {parcelasPagamento.length > 0 && parcelasPagamento.every(p => !p.valor_parcela || p.valor_parcela === 0) && !(parcelasIAPdf?.length) && (
                    <div style={{ background: "#FEF9C3", border: "0.5px solid #EAB308", borderRadius: 8, padding: "8px 14px", marginBottom: 12, fontSize: 12, color: "#854D0E" }}>
                      ⚠ As parcelas estão zeradas (salvas sem valor). Clique em <strong>Calcular e Salvar Parcelas</strong> para recalcular com base no principal acima.
                    </div>
                  )}
                  <div style={{ background: "var(--bg-page)", border: "0.5px solid var(--border-table)", borderRadius: 10, padding: 14, marginBottom: 16 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-1)", marginBottom: 10 }}>Calcular tabela — {{ sac: "SAC Decrescente", sac_crescente: "SAC Crescente (SACRE)", price: "PRICE", outros: "Outros" }[contratoModal.tipo_calculo ?? "sac"] ?? "SAC Decrescente"}</div>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 10, alignItems: "end" }}>
                      <div><label style={lbl}>Nº Parcelas</label><InputNumerico style={inp} decimais={0} min="1" value={fCalc.nParcelas} onChange={v => setFCalc(p => ({ ...p, nParcelas: v }))} /></div>
                      <div>
                        <label style={lbl}>
                          Taxa a.m. (%) {contratoModal.taxa_juros_am && <span style={{ color: "#111111" }}>· contr: {fmtNum(contratoModal.taxa_juros_am, 4)}%</span>}
                          {(() => { const im = (parseFloat(fCalc.taxaMensal) || 0) / 100; const per = Number(fCalc.periodicidade) || 1; if (per > 1 && im > 0) { const ef = (Math.pow(1 + im, per) - 1) * 100; return <span style={{ color: "#C9921B", marginLeft: 4 }}>→ {fmtNum(ef, 2)}% a.{per===12?"a":per===6?"s":"t"}</span>; } return null; })()}
                        </label>
                        <InputNumerico style={inp} decimais={4} value={fCalc.taxaMensal} onChange={v => setFCalc(p => ({ ...p, taxaMensal: v }))} />
                      </div>
                      <div><label style={lbl}>Data 1º Pagto.</label><input style={inp} type="date" value={fCalc.dataPrimeiro} onChange={e => setFCalc(p => ({ ...p, dataPrimeiro: e.target.value }))} /></div>
                      <div><label style={lbl}>Periodicidade</label><select style={inp} value={fCalc.periodicidade} onChange={e => setFCalc(p => ({ ...p, periodicidade: e.target.value }))}><option value="1">Mensal</option><option value="3">Trimestral</option><option value="6">Semestral</option><option value="12">Anual</option></select></div>
                      <div><label style={lbl}>Acessórios/parc. ({contratoModal.moeda === "USD" ? "US$" : "R$"})</label><InputMonetario style={inp} value={fCalc.acessorios} onChange={v => setFCalc(p => ({ ...p, acessorios: String(v) }))} /></div>
                    </div>
                    <div style={{ marginTop: 10, display: "flex", justifyContent: "flex-end", gap: 8 }}>
                      {parcelasIAPdf && parcelasIAPdf.length > 0 && (
                        <button style={{ ...btnV, background: "#16A34A" }} onClick={aplicarCronogramaIAPdf} disabled={salvando}>
                          📄 Usar cronograma do PDF ({parcelasIAPdf.length} parcelas)
                        </button>
                      )}
                      <button style={{ ...btnV, background: "#C9921B" }} onClick={calcularParcelas} disabled={salvando}>{salvando ? "Calculando…" : "⟳ Calcular e Salvar Parcelas"}</button>
                    </div>
                  </div>
                  {parcelasIAPdf && parcelasIAPdf.length > 0 && parcelasPagamento.length === 0 && (
                    <div style={{ background: "#DCFCE7", border: "0.5px solid #16A34A", borderRadius: 8, padding: "10px 14px", marginBottom: 12, fontSize: 12, color: "#166534" }}>
                      ✅ Cronograma extraído do PDF: <strong>{parcelasIAPdf.length} parcelas</strong> — clique em &quot;Usar cronograma do PDF&quot; para salvar ou &quot;Calcular&quot; para recalcular pelo método {{ sac: "SAC Decrescente", sac_crescente: "SAC Crescente (SACRE)", price: "PRICE", outros: "Outros" }[contratoModal.tipo_calculo ?? "sac"] ?? "SAC"}.
                    </div>
                  )}
                  {parcelasPagamento.length === 0 && !(parcelasIAPdf && parcelasIAPdf.length > 0) ? (
                    <div style={{ textAlign: "center", padding: "24px 0", color: "var(--text-3)", fontSize: 12 }}>Preencha a calculadora acima para gerar a tabela de parcelas</div>
                  ) : parcelasPagamento.length === 0 ? null : (
                    <>
                      {(() => {
                        const temEdits = Object.keys(parcelasEditadas).length > 0;
                        const inpCell: React.CSSProperties = { width: "100%", border: "0.5px solid var(--border)", borderRadius: 4, padding: "2px 5px", fontSize: 12, background: "transparent", color: "var(--text-1)", outline: "none", textAlign: "right" };
                        const inpEditado: React.CSSProperties = { ...inpCell, background: "#FBF3E0", border: "0.5px solid #C9921B", fontWeight: 600 };
                        return (
                          <>
                            {temEdits && (
                              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: "#FBF3E0", border: "0.5px solid #C9921B", borderRadius: 8, padding: "8px 14px", marginBottom: 10 }}>
                                <span style={{ fontSize: 12, color: "#7A4300" }}>✏ Há ajustes manuais não salvos. Clique em <strong>Salvar ajustes</strong> para confirmar.</span>
                                <button style={{ ...btnV, background: "#C9921B", padding: "6px 16px", fontSize: 12 }} disabled={salvando} onClick={salvarAjustesManuais}>{salvando ? "Salvando…" : "Salvar ajustes"}</button>
                              </div>
                            )}
                            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                              <thead>
                                <tr style={{ background: "var(--bg-page)" }}>
                                  {["Nº", "Vencimento ✏", "Amortização", "Juros", "Encargos", "Valor Parcela ✏", "Saldo Devedor", "Status", ""].map((h, i) => (
                                    <th key={i} style={{ padding: "7px 10px", textAlign: i === 0 || i === 8 ? "center" : "right", fontSize: 11, fontWeight: 600, color: i === 1 || i === 5 ? "#C9921B" : "var(--text-2)", borderBottom: "0.5px solid var(--border-table)", whiteSpace: "nowrap" }}>{h}</th>
                                  ))}
                                </tr>
                              </thead>
                              <tbody>
                                {parcelasPagamento.map((p, i) => {
                                  const corSt = p.status === "pago" ? "#111111" : p.status === "vencido" ? "#E24B4A" : "var(--text-2)";
                                  const fmtV = (v: number) => contratoModal.moeda === "USD" ? `US$ ${fmtNum(v, 2)}` : fmtBRL(v);
                                  const ed = parcelasEditadas[p.id];
                                  const dataEditada = !!ed?.data_vencimento;
                                  const valorEditado = ed?.valor_parcela !== undefined;
                                  const valorExibir = valorEditado ? ed!.valor_parcela! : String(p.valor_parcela);
                                  return (
                                    <tr key={p.id} style={{ borderBottom: i < parcelasPagamento.length - 1 ? "0.5px solid var(--border-row)" : "none", background: p.status === "pago" ? "#E4F0F9" : "transparent" }}>
                                      <td style={{ padding: "5px 10px", textAlign: "center" }}>{p.num_parcela}</td>
                                      <td style={{ padding: "4px 8px" }}>
                                        <input
                                          type="date"
                                          value={ed?.data_vencimento ?? p.data_vencimento}
                                          onChange={e => editarParcela(p.id, "data_vencimento", e.target.value)}
                                          style={dataEditada ? inpEditado : inpCell}
                                        />
                                      </td>
                                      <td style={{ padding: "5px 10px", textAlign: "right" }}>{fmtV(p.amortizacao)}</td>
                                      <td style={{ padding: "5px 10px", textAlign: "right", color: "#E24B4A" }}>{fmtV(p.juros)}</td>
                                      <td style={{ padding: "5px 10px", textAlign: "right" }}>{fmtV(p.despesas_acessorios)}</td>
                                      <td style={{ padding: "4px 8px" }}>
                                        <input
                                          type="number"
                                          step="0.01"
                                          min="0"
                                          value={valorExibir}
                                          onChange={e => editarParcela(p.id, "valor_parcela", e.target.value)}
                                          style={valorEditado ? inpEditado : inpCell}
                                        />
                                      </td>
                                      <td style={{ padding: "5px 10px", textAlign: "right" }}>{fmtV(p.saldo_devedor)}</td>
                                      <td style={{ padding: "5px 10px", textAlign: "center" }}>
                                        <span style={{ fontSize: 10, fontWeight: 600, color: corSt }}>{p.status === "pago" ? "✓ Pago" : p.status === "vencido" ? "Vencido" : "Em aberto"}</span>
                                      </td>
                                      <td style={{ padding: "4px 8px", textAlign: "center" }}>
                                        {p.status !== "pago" && (
                                          <button
                                            style={{ fontSize: 10, padding: "3px 10px", borderRadius: 6, border: "0.5px solid #1A4870", background: "#fff", color: "#1A4870", cursor: "pointer", fontWeight: 600, whiteSpace: "nowrap" }}
                                            onClick={() => {
                                              setModalBaixaParcela(p);
                                              setBaixaPData(TODAY_STR);
                                              setBaixaPValor(String(p.valor_parcela ?? ""));
                                              setBaixaPConta(contas[0]?.id ?? "");
                                              setBaixaPErro("");
                                            }}
                                          >Baixar</button>
                                        )}
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                              <tfoot>
                                <tr style={{ background: "var(--bg-page)", fontWeight: 600 }}>
                                  {(() => { const fmtV = (v: number) => contratoModal.moeda === "USD" ? `US$ ${fmtNum(v, 2)}` : fmtBRL(v); return (<>
                                    <td colSpan={2} style={{ padding: "7px 10px", textAlign: "right", fontSize: 11, color: "var(--text-2)" }}>TOTAIS</td>
                                    <td style={{ padding: "7px 10px", textAlign: "right" }}>{fmtV(parcelasPagamento.reduce((s, p) => s + p.amortizacao, 0))}</td>
                                    <td style={{ padding: "7px 10px", textAlign: "right", color: "#E24B4A" }}>{fmtV(parcelasPagamento.reduce((s, p) => s + p.juros, 0))}</td>
                                    <td style={{ padding: "7px 10px", textAlign: "right" }}>{fmtV(parcelasPagamento.reduce((s, p) => s + p.despesas_acessorios, 0))}</td>
                                    <td style={{ padding: "7px 10px", textAlign: "right" }}>{fmtV(parcelasPagamento.reduce((s, p) => {
                                      const ed = parcelasEditadas[p.id];
                                      const v = ed?.valor_parcela !== undefined ? parseFloat(ed.valor_parcela) || p.valor_parcela : p.valor_parcela;
                                      return s + v;
                                    }, 0))}</td>
                                    <td colSpan={3} />
                                  </>); })()}
                                </tr>
                              </tfoot>
                            </table>
                            <div style={{ marginTop: 8, fontSize: 11, color: "var(--text-2)", display: "flex", gap: 16, flexWrap: "wrap", alignItems: "center" }}>
                              {(() => { const fmtV = (v: number) => contratoModal.moeda === "USD" ? `US$ ${fmtNum(v, 2)}` : fmtBRL(v); const totalJuros = parcelasPagamento.reduce((s, p) => s + p.juros + p.despesas_acessorios, 0); const totalAmort = parcelasPagamento.reduce((s, p) => s + p.amortizacao, 0); return (<>
                                <span>Custo total de juros: <strong style={{ color: "#E24B4A" }}>{fmtV(totalJuros)}</strong></span>
                                <span>CET estimado: <strong>{fmtNum(totalAmort > 0 ? (totalJuros / totalAmort) * 100 : 0, 2)}% a.p.</strong></span>
                                <span>Pagas: <strong style={{ color: "#111111" }}>{parcelasPagamento.filter(p => p.status === "pago").length}/{parcelasPagamento.length}</strong></span>
                              </>); })()}
                              {temEdits && (
                                <button style={{ ...btnV, background: "#C9921B", padding: "5px 14px", fontSize: 11, marginLeft: "auto" }} disabled={salvando} onClick={salvarAjustesManuais}>{salvando ? "Salvando…" : "Salvar ajustes"}</button>
                              )}
                            </div>
                          </>
                        );
                      })()}
                    </>
                  )}
                </div>
              ))}

              {/* ── Garantias ── */}
              {abaModal === "garantias" && (!contratoModal ? <AbaDisabled nome="Garantias" /> : (
                <div>
                  <div style={{ background: "var(--bg-card)", border: "0.5px solid var(--border-table)", borderRadius: 10, padding: "14px 16px", marginBottom: 16 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: "#111111", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 12 }}>Nova Garantia</div>
                    <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1.5fr", gap: 10, marginBottom: 10 }}>
                      <div>
                        <label style={lbl}>Tipo de Garantia *</label>
                        <select style={inp} value={fGar.tipo_garantia ?? ""} onChange={e => setFGar(p => ({ ...p, tipo_garantia: e.target.value as GarantiaContrato["tipo_garantia"] }))}>
                          <option value="alienacao_fiduciaria">Alienação Fiduciária</option>
                          <option value="hipoteca">Hipoteca</option>
                          <option value="penhor_rural">Penhor Rural / Agrícola</option>
                          <option value="aval">Aval</option>
                          <option value="nota_promissoria">Nota Promissória</option>
                          <option value="cpr_garantia">CPR como Garantia</option>
                          <option value="cessao_recebiveis">Cessão de Recebíveis</option>
                          <option value="outros">Outros</option>
                        </select>
                      </div>
                      <div>
                        <label style={lbl}>Grau</label>
                        <select style={inp} value={fGar.grau} onChange={e => setFGar(p => ({ ...p, grau: e.target.value as "" | "1_grau" | "2_grau" | "3_grau" }))}>
                          <option value="">—</option><option value="1_grau">1° Grau</option><option value="2_grau">2° Grau</option><option value="3_grau">3° Grau</option>
                        </select>
                      </div>
                      <div>
                        <label style={lbl}>Tipo de Bem</label>
                        <select style={inp} value={fGar.tipo_bem ?? "imovel"} onChange={e => setFGar(p => ({ ...p, tipo_bem: e.target.value as GarantiaContrato["tipo_bem"], matricula_id: "", imovel_urbano_id: "", maquina_id: "" }))}>
                          <option value="imovel">Imóvel Rural (Matrícula)</option>
                          <option value="imovel_urbano">Imóvel Urbano</option>
                          <option value="maquina">Máquina / Veículo</option>
                          <option value="semovente">Semovente (Gado)</option>
                          <option value="produto_agricola">Produto Agrícola (CPR)</option>
                          <option value="outro">Outro</option>
                        </select>
                      </div>
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: ["imovel","imovel_urbano","maquina"].includes(fGar.tipo_bem ?? "") ? "2fr 1fr 1fr 1fr auto" : "2fr 1fr 1fr auto", gap: 10, alignItems: "end" }}>
                      {fGar.tipo_bem === "imovel" && <div><label style={lbl}>Matrícula vinculada</label><select style={inp} value={fGar.matricula_id} onChange={e => setFGar(p => ({ ...p, matricula_id: e.target.value }))}><option value="">— Selecione —</option>{matriculas.map(m => <option key={m.id} value={m.id}>Matr. {m.numero}{m.area_ha ? ` — ${m.area_ha} ha` : ""}{m.municipio ? ` — ${m.municipio}` : ""}</option>)}</select></div>}
                      {fGar.tipo_bem === "imovel_urbano" && <div><label style={lbl}>Imóvel Urbano</label><select style={inp} value={fGar.imovel_urbano_id} onChange={e => setFGar(p => ({ ...p, imovel_urbano_id: e.target.value }))}><option value="">— Selecione —</option>{imoveisUrbanos.map(u => <option key={u.id} value={u.id}>{u.descricao}{u.municipio ? ` — ${u.municipio}` : ""}{u.area_m2 ? ` (${u.area_m2} m²)` : ""}</option>)}</select></div>}
                      {fGar.tipo_bem === "maquina" && <div><label style={lbl}>Máquina / Veículo</label><select style={inp} value={fGar.maquina_id} onChange={e => setFGar(p => ({ ...p, maquina_id: e.target.value }))}><option value="">— Selecione —</option>{maquinas.map(m => <option key={m.id} value={m.id}>{m.nome}{m.marca ? ` — ${m.marca}` : ""}{m.ano ? ` (${m.ano})` : ""}</option>)}</select></div>}
                      {!["imovel","imovel_urbano","maquina"].includes(fGar.tipo_bem ?? "") && <div><label style={lbl}>Descrição do Bem *</label><input style={inp} placeholder="Ex: 300 cabeças Nelore…" value={fGar.descricao} onChange={e => setFGar(p => ({ ...p, descricao: e.target.value }))} /></div>}
                      <div><label style={lbl}>% do Bem</label><InputNumerico style={inp} min="1" max="100" value={fGar.percentual_bem} onChange={v => setFGar(p => ({ ...p, percentual_bem: v }))} /></div>
                      <div><label style={lbl}>Valor Avaliação (R$)</label><InputMonetario style={inp} value={fGar.valor_avaliacao} onChange={v => setFGar(p => ({ ...p, valor_avaliacao: String(v) }))} /></div>
                      {["imovel","imovel_urbano","maquina"].includes(fGar.tipo_bem ?? "") && <div><label style={lbl}>Obs.</label><input style={inp} placeholder="Opcional" value={fGar.descricao} onChange={e => setFGar(p => ({ ...p, descricao: e.target.value }))} /></div>}
                      <button style={{ ...btnV, padding: "8px 14px", alignSelf: "flex-end" }} onClick={salvarGarantia} disabled={salvando}>+ Adicionar</button>
                    </div>
                  </div>
                  {garantias.length === 0 ? (
                    <div style={{ textAlign: "center", padding: "24px 0", color: "var(--text-3)", fontSize: 12 }}>Nenhuma garantia cadastrada para este contrato.</div>
                  ) : (
                    <>
                      <table style={{ width: "100%", borderCollapse: "collapse" }}>
                        <thead><tr style={{ background: "var(--bg-page)" }}>{["Tipo de Garantia", "Grau", "Bem / Descrição", "Tipo de Bem", "% Bem", "Valor Avaliação", "Cobertura", ""].map((h, i) => <th key={i} style={{ padding: "7px 12px", textAlign: i <= 2 ? "left" : "center", fontSize: 11, fontWeight: 600, color: "var(--text-2)", borderBottom: "0.5px solid var(--border-table)", whiteSpace: "nowrap" }}>{h}</th>)}</tr></thead>
                        <tbody>
                          {garantias.map((g, i) => {
                            const tipoMeta = g.tipo_garantia ? TIPO_GAR_META[g.tipo_garantia] : null;
                            const cobertura = g.valor_avaliacao ? (g.valor_avaliacao * ((g.percentual_bem ?? 100) / 100) / (contratoModal.valor_financiado_brl ?? contratoModal.valor_financiado)) * 100 : null;
                            const bemDesc = g.tipo_bem === "imovel" && g.matricula_id ? `Matr. ${matriculas.find(m => m.id === g.matricula_id)?.numero ?? "?"}` : g.tipo_bem === "imovel_urbano" && g.imovel_urbano_id ? (imoveisUrbanos.find(u => u.id === g.imovel_urbano_id)?.descricao ?? "Imóvel Urbano") : g.tipo_bem === "maquina" && g.maquina_id ? (maquinas.find(m => m.id === g.maquina_id)?.nome ?? "Máquina") : g.descricao;
                            return (
                              <tr key={g.id} style={{ borderBottom: i < garantias.length - 1 ? "0.5px solid var(--border-row)" : "none" }}>
                                <td style={{ padding: "9px 12px" }}>{tipoMeta ? <span style={{ fontSize: 11, background: tipoMeta.bg, color: tipoMeta.cl, padding: "2px 7px", borderRadius: 8, fontWeight: 600 }}>{tipoMeta.label}</span> : "—"}</td>
                                <td style={{ padding: "9px 12px", textAlign: "center", fontSize: 11, fontWeight: 600 }}>{g.grau ? GRAU_META[g.grau as keyof typeof GRAU_META] : "—"}</td>
                                <td style={{ padding: "9px 12px", fontSize: 12, fontWeight: 600 }}>{bemDesc}</td>
                                <td style={{ padding: "9px 12px", textAlign: "center", fontSize: 11, color: "var(--text-2)" }}>{g.tipo_bem ? TIPO_BEM_META[g.tipo_bem] : "—"}</td>
                                <td style={{ padding: "9px 12px", textAlign: "center" }}>{g.percentual_bem ? `${g.percentual_bem}%` : "100%"}</td>
                                <td style={{ padding: "9px 12px", textAlign: "center", fontWeight: 600 }}>{g.valor_avaliacao ? fmtBRL(g.valor_avaliacao) : "—"}</td>
                                <td style={{ padding: "9px 12px", textAlign: "center" }}>{cobertura !== null ? <span style={{ fontWeight: 700, color: cobertura >= 130 ? "#16A34A" : cobertura >= 100 ? "#EF9F27" : "#E24B4A" }}>{fmtNum(cobertura, 1)}%</span> : "—"}</td>
                                <td style={{ padding: "9px 12px", textAlign: "right" }}><button style={btnX} onClick={() => excluirGarantia(g.id).then(() => setGarantias(x => x.filter(r => r.id !== g.id)))}>✕</button></td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                      {(() => {
                        const totalVal = garantias.reduce((s, g) => s + (g.valor_avaliacao ?? 0) * ((g.percentual_bem ?? 100) / 100), 0);
                        const cobTotal = (totalVal / (contratoModal.valor_financiado_brl ?? contratoModal.valor_financiado)) * 100;
                        return <div style={{ marginTop: 12, background: cobTotal >= 100 ? "#DCFCE7" : "#FEF3C7", borderRadius: 8, padding: "8px 14px", display: "flex", justifyContent: "space-between" }}>
                          <span style={{ fontSize: 11, color: "#444" }}>{garantias.length} garantia{garantias.length > 1 ? "s" : ""}</span>
                          <span style={{ fontSize: 12, fontWeight: 700, color: cobTotal >= 130 ? "#16A34A" : cobTotal >= 100 ? "#92400E" : "#B91C1C" }}>
                            Valor total: {fmtBRL(totalVal)} · Cobertura: {fmtNum(cobTotal, 1)}%{cobTotal < 100 ? " ⚠ Insuficiente" : cobTotal >= 130 ? " ✓ Excedente" : " ✓ Adequada"}
                          </span>
                        </div>;
                      })()}
                    </>
                  )}
                </div>
              ))}

              {/* ── Centro de Custo ── */}
              {abaModal === "centrocusto" && (!contratoModal ? <AbaDisabled nome="Centro de Custo" /> : (() => {
                const totalPct = centrosForm.reduce((s, c) => s + (parseFloat(c.percentual) || 0), 0);
                const ok100 = Math.abs(totalPct - 100) < 0.01;
                return (
                  <div>
                    <div style={{ marginBottom: 12, fontSize: 12, color: "var(--text-2)" }}>Defina como o valor captado é rateado entre safras/ciclos e centros de custo (deve totalizar 100%).</div>
                    <div style={{ overflowX: "auto" }}>
                      <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 12, minWidth: 560 }}>
                        <thead>
                          <tr style={{ background: "var(--bg-page)" }}>
                            {["Safra / Ciclo", "Centro de Custo", "%", "Valor (R$)", ""].map((h, i) => (
                              <th key={i} style={{ padding: "7px 10px", textAlign: i >= 2 ? "center" : "left", fontSize: 11, fontWeight: 600, color: "var(--text-2)", borderBottom: "0.5px solid var(--border-table)", whiteSpace: "nowrap" }}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {centrosForm.map((c, i) => (
                            <tr key={i} style={{ borderBottom: i < centrosForm.length - 1 ? "0.5px solid var(--border-row)" : "none" }}>
                              <td style={{ padding: "6px 6px", minWidth: 180 }}>
                                <select style={inp} value={c.ciclo_id} onChange={e => setCentrosForm(p => p.map((x, j) => j === i ? { ...x, ciclo_id: e.target.value } : x))}>
                                  <option value="">— Safra / Ciclo —</option>
                                  {ccAnosSafra.map(as => {
                                    const cis = ccCiclos.filter(ci => ci.ano_safra_id === as.id);
                                    if (cis.length === 0) return null;
                                    return (
                                      <optgroup key={as.id} label={as.descricao}>
                                        {cis.map(ci => (
                                          <option key={ci.id} value={ci.id}>{ci.cultura ? `${ci.cultura} — ` : ""}{ci.descricao ?? ""}</option>
                                        ))}
                                      </optgroup>
                                    );
                                  })}
                                  {ccCiclos.filter(ci => !ci.ano_safra_id).map(ci => (
                                    <option key={ci.id} value={ci.id}>{ci.cultura ? `${ci.cultura} — ` : ""}{ci.descricao ?? ""}</option>
                                  ))}
                                </select>
                              </td>
                              <td style={{ padding: "6px 6px", minWidth: 180 }}>
                                <select style={inp} value={c.centro_custo_id} onChange={e => setCentrosForm(p => p.map((x, j) => j === i ? { ...x, centro_custo_id: e.target.value } : x))}>
                                  <option value="">— Centro de Custo —</option>
                                  {ccOptions.map(cc => (
                                    <option key={cc.id} value={cc.id}>{cc.codigo ? `${cc.codigo} — ` : ""}{cc.nome}</option>
                                  ))}
                                </select>
                              </td>
                              <td style={{ padding: "6px 6px", width: 80 }}>
                                <InputMonetario style={{ ...inp, textAlign: "center" }} value={c.percentual} onChange={v => {
                                  const pct = Number(v) || 0;
                                  setCentrosForm(p => p.map((x, j) => j === i ? { ...x, percentual: String(v), valor: fmtNum((pct / 100) * (contratoModal.valor_financiado_brl ?? contratoModal.valor_financiado), 2) } : x));
                                }} />
                              </td>
                              <td style={{ padding: "6px 6px", width: 130 }}>
                                <InputMonetario style={inp} value={c.valor} onChange={v => setCentrosForm(p => p.map((x, j) => j === i ? { ...x, valor: String(v) } : x))} />
                              </td>
                              <td style={{ padding: "6px 6px", width: 36, textAlign: "center" }}>
                                {centrosForm.length > 1 && <button style={btnX} onClick={() => setCentrosForm(p => p.filter((_, j) => j !== i))}>✕</button>}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <button style={{ ...btnR, fontSize: 12 }} onClick={() => setCentrosForm(p => [...p, { ciclo_id: "", centro_custo_id: "", percentual: "", valor: "" }])}>+ Adicionar linha</button>
                      <div style={{ fontSize: 12 }}>
                        Total: <strong style={{ color: ok100 ? "#111111" : "#E24B4A" }}>{fmtNum(totalPct, 2)}%</strong>
                        {!ok100 && <span style={{ color: "#E24B4A", marginLeft: 4 }}>⚠ deve ser 100%</span>}
                      </div>
                    </div>
                    <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 14 }}>
                      <button style={{ ...btnV, opacity: salvando ? 0.5 : 1 }} disabled={salvando} onClick={salvarCentroCusto}>Salvar Rateio</button>
                    </div>
                    {centrosCusto.length > 0 && (
                      <div style={{ marginTop: 14, fontSize: 11, color: "var(--text-2)" }}>
                        Último rateio salvo: {centrosCusto.map(c => `${c.descricao} (${fmtNum(c.percentual, 1)}%)`).join(" · ")}
                      </div>
                    )}
                  </div>
                );
              })())}

              {/* ── Aditivos ── */}
              {abaModal === "aditivos" && (!contratoModal ? <AbaDisabled nome="Aditivos" /> : (() => {
                const TIPO_ADIT: Record<AditivoContrato["tipo"], { label: string; bg: string; cl: string }> = {
                  prorrogacao:     { label: "Prorrogação",        bg: "#E8E8E8", cl: "#0D0D0D" },
                  renegociacao:    { label: "Renegociação",       bg: "#FBF3E0", cl: "#7A5400" },
                  capitalizacao:   { label: "Capitalização",      bg: "#FCF0F0", cl: "#7A1A1A" },
                  reducao_taxa:    { label: "Redução de Taxa",    bg: "#E8F5EB", cl: "#1A5C35" },
                  ampliacao_valor: { label: "Ampliação de Valor", bg: "#EDE9FB", cl: "#4B3B9B" },
                  outros:          { label: "Outros",             bg: "#F3F4F6", cl: "var(--text-2)"    },
                };
                // contratos disponíveis para vincular como origem (exclui o atual e já vinculados)
                const vinculadosIds = new Set(origensRefin.map(o => o.contrato_origem_id));
                const disponiveis = contratos.filter(c => c.id !== contratoModal.id && !vinculadosIds.has(c.id) && c.status !== "refinanciado");
                return (
                  <div>
                    {/* ── Seção Refinanciamento ── */}
                    <div style={{ background: "#F5F3FE", border: "0.5px solid #7C6FC340", borderRadius: 10, padding: 16, marginBottom: 20 }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: "#4B3B9B", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 12 }}>🔗 Refinanciamento / Consolidação</div>
                      <div style={{ fontSize: 12, color: "#6B5CA5", marginBottom: 14 }}>
                        Se esta cédula consolida outros contratos anteriores (refinanciamento 1→1 ou N→1), vincule-os abaixo. Os contratos vinculados passam para status <strong>Refinanciado</strong> e ficam referenciando esta cédula.
                      </div>

                      {/* Contratos já vinculados como origem */}
                      {origensRefin.length > 0 && (
                        <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 14 }}>
                          <thead><tr style={{ background: "#EDE9FB" }}>
                            {["Contrato de Origem", "Nº Operação", "Credor", "Saldo Incorporado", ""].map((h, i) => (
                              <th key={i} style={{ padding: "6px 10px", textAlign: "left", fontSize: 11, fontWeight: 600, color: "#4B3B9B" }}>{h}</th>
                            ))}
                          </tr></thead>
                          <tbody>
                            {origensRefin.map((o, i) => {
                              const co = o.contrato_origem;
                              return (
                                <tr key={o.id} style={{ borderBottom: i < origensRefin.length - 1 ? "0.5px solid #DDD8F5" : "none", background: i % 2 === 0 ? "#fff" : "#FAF9FE" }}>
                                  <td style={{ padding: "7px 10px", fontSize: 12, fontWeight: 600, color: "#4B3B9B" }}>{co?.descricao ?? "—"}</td>
                                  <td style={{ padding: "7px 10px", fontSize: 11, fontFamily: "monospace", color: "#666" }}>{co?.numero_documento ?? "—"}</td>
                                  <td style={{ padding: "7px 10px", fontSize: 11, color: "#555" }}>{co?.credor ?? "—"}</td>
                                  <td style={{ padding: "7px 10px", fontSize: 12 }}>{o.saldo_incorporado ? fmtBRL(o.saldo_incorporado) : <span style={{ color: "#aaa" }}>—</span>}</td>
                                  <td style={{ padding: "7px 10px" }}>
                                    <button style={btnX} onClick={async () => {
                                      if (!confirm("Desvincular este contrato de origem? Ele voltará para status Ativo.")) return;
                                      await desvincularOrigemRefinanciamento(o.id, o.contrato_origem_id);
                                      setOrigensRefin(p => p.filter(x => x.id !== o.id));
                                      setContratos(p => p.map(c => c.id === o.contrato_origem_id ? { ...c, status: "ativo", refinanciado_por_id: null } : c));
                                    }}>Desvincular</button>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      )}

                      {/* Formulário para adicionar nova origem */}
                      <div style={{ display: "grid", gridTemplateColumns: "3fr 1fr auto", gap: 10, alignItems: "end" }}>
                        <div>
                          <label style={{ ...lbl, color: "#4B3B9B" }}>Contrato de Origem</label>
                          <select style={{ ...inp, borderColor: "#7C6FC360" }} value={fRefin.contrato_origem_id} onChange={e => setFRefin(p => ({ ...p, contrato_origem_id: e.target.value }))}>
                            <option value="">— Selecionar contrato a consolidar —</option>
                            {disponiveis.map(c => (
                              <option key={c.id} value={c.id}>{c.descricao}{c.numero_documento ? ` — ${c.numero_documento}` : ""} · {c.credor}</option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label style={{ ...lbl, color: "#4B3B9B" }}>Saldo Incorporado (R$)</label>
                          <InputMonetario style={{ ...inp, borderColor: "#7C6FC360" }} value={fRefin.saldo_incorporado} onChange={v => setFRefin(p => ({ ...p, saldo_incorporado: String(v) }))} />
                        </div>
                        <button
                          disabled={!fRefin.contrato_origem_id || salvando}
                          style={{ padding: "8px 16px", background: fRefin.contrato_origem_id ? "#4B3B9B" : "#ccc", color: "#fff", border: "none", borderRadius: 8, cursor: fRefin.contrato_origem_id ? "pointer" : "default", fontWeight: 600, fontSize: 12, whiteSpace: "nowrap" }}
                          onClick={async () => {
                            if (!fRefin.contrato_origem_id || !fazendaId) return;
                            try {
                              const saldo = fRefin.saldo_incorporado ? parseFloat(fRefin.saldo_incorporado.replace(",", ".")) : undefined;
                              const novo = await vincularOrigemRefinanciamento(contratoModal.id, fRefin.contrato_origem_id, fazendaId, saldo);
                              setOrigensRefin(p => [...p, novo]);
                              setContratos(p => p.map(c => c.id === fRefin.contrato_origem_id ? { ...c, status: "refinanciado", refinanciado_por_id: contratoModal.id } : c));
                              setFRefin({ contrato_origem_id: "", saldo_incorporado: "" });
                            } catch (e) { alert("Erro ao vincular: " + (e as Error).message); }
                          }}>
                          + Vincular
                        </button>
                      </div>
                    </div>

                    <div style={{ background: "#FBF3E0", border: "0.5px solid #C9921B40", borderRadius: 8, padding: "10px 14px", marginBottom: 16, fontSize: 12, color: "#7A5400" }}>
                      Registre alterações formais: prorrogações, renegociações de taxa, capitalizações e outros termos aditados entre as partes.
                    </div>
                    <div style={{ background: "#F8F9FB", border: "0.5px solid var(--border-table)", borderRadius: 10, padding: 16, marginBottom: 18 }}>
                      <SecTitle>Novo Aditivo</SecTitle>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 2fr", gap: 10, marginBottom: 10 }}>
                        <div><label style={lbl}>Data do Aditivo *</label><input style={inp} type="date" value={fAdit.data_aditivo} onChange={e => setFAdit(p => ({ ...p, data_aditivo: e.target.value }))} /></div>
                        <div><label style={lbl}>Tipo *</label><select style={inp} value={fAdit.tipo} onChange={e => setFAdit(p => ({ ...p, tipo: e.target.value as AditivoContrato["tipo"] }))}>{Object.entries(TIPO_ADIT).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select></div>
                        <div><label style={lbl}>Descrição / Motivo *</label><input style={inp} placeholder="Motivo ou cláusula alterada" value={fAdit.descricao} onChange={e => setFAdit(p => ({ ...p, descricao: e.target.value }))} /></div>
                      </div>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr 1fr", gap: 10, marginBottom: 10 }}>
                        <div><label style={lbl}>Nova Data Vencimento</label><input style={inp} type="date" value={fAdit.nova_data_vencimento} onChange={e => setFAdit(p => ({ ...p, nova_data_vencimento: e.target.value }))} /></div>
                        <div><label style={lbl}>Nova Taxa a.a. (%)</label><InputMonetario style={inp} value={fAdit.nova_taxa_aa} onChange={v => { const aa = Number(v) || 0; setFAdit(p => ({ ...p, nova_taxa_aa: String(v), nova_taxa_am: aa === 0 ? "" : fmtNum(aaParaAm(aa), 4) })); }} /></div>
                        <div><label style={lbl}>Nova Taxa a.m. (%)</label><InputNumerico style={inp} decimais={4} value={fAdit.nova_taxa_am} onChange={v => setFAdit(p => ({ ...p, nova_taxa_am: v }))} /></div>
                        <div><label style={lbl}>Novo Valor Financiado</label><InputMonetario style={inp} value={fAdit.novo_valor_financiado} onChange={v => setFAdit(p => ({ ...p, novo_valor_financiado: String(v) }))} /></div>
                        <div><label style={lbl}>Novas Parcelas</label><InputNumerico style={inp} decimais={0} value={fAdit.novo_num_parcelas} onChange={v => setFAdit(p => ({ ...p, novo_num_parcelas: v }))} /></div>
                      </div>
                      <div style={{ marginBottom: 12 }}><label style={lbl}>Observações adicionais</label><textarea style={{ ...inp, height: 52, resize: "vertical" } as React.CSSProperties} value={fAdit.obs} onChange={e => setFAdit(p => ({ ...p, obs: e.target.value }))} /></div>
                      <div style={{ display: "flex", justifyContent: "flex-end" }}>
                        <button style={{ ...btnR, marginRight: 8 }} onClick={() => setFAdit({ ...FA_VAZIO })}>Limpar</button>
                        <button style={{ ...btnV }} disabled={salvando} onClick={salvarAditivo}>Registrar Aditivo</button>
                      </div>
                    </div>
                    {aditivos.length === 0 ? (
                      <div style={{ textAlign: "center", padding: "28px 0", color: "var(--text-3)", fontSize: 12 }}>Nenhum aditivo registrado.</div>
                    ) : (
                      <table style={{ width: "100%", borderCollapse: "collapse" }}>
                        <thead><tr style={{ background: "var(--bg-page)" }}>{["Data", "Tipo", "Descrição", "Novos Termos", ""].map((h, i) => <th key={i} style={{ padding: "7px 10px", textAlign: "left", fontSize: 11, fontWeight: 600, color: "var(--text-2)", borderBottom: "0.5px solid var(--border-table)" }}>{h}</th>)}</tr></thead>
                        <tbody>
                          {aditivos.map((a, i) => {
                            const meta = TIPO_ADIT[a.tipo];
                            const termos: string[] = [];
                            if (a.nova_data_vencimento) termos.push(`Venc. → ${fmtData(a.nova_data_vencimento)}`);
                            if (a.nova_taxa_aa) termos.push(`Taxa → ${fmtNum(a.nova_taxa_aa, 4)}% a.a.`);
                            if (a.novo_valor_financiado) termos.push(`Valor → ${fmtBRL(a.novo_valor_financiado)}`);
                            if (a.novo_num_parcelas) termos.push(`Parcelas → ${a.novo_num_parcelas}x`);
                            return (
                              <tr key={a.id} style={{ borderBottom: i < aditivos.length - 1 ? "0.5px solid var(--border-row)" : "none", background: i % 2 === 0 ? "#fff" : "#FAFBFC" }}>
                                <td style={{ padding: "8px 10px", fontSize: 12, whiteSpace: "nowrap" }}>{fmtData(a.data_aditivo)}</td>
                                <td style={{ padding: "8px 10px" }}><span style={{ fontSize: 10, background: meta.bg, color: meta.cl, padding: "2px 8px", borderRadius: 8, fontWeight: 600 }}>{meta.label}</span></td>
                                <td style={{ padding: "8px 10px", fontSize: 12 }}><div>{a.descricao}</div>{a.obs && <div style={{ fontSize: 11, color: "var(--text-3)", marginTop: 2 }}>{a.obs}</div>}</td>
                                <td style={{ padding: "8px 10px", fontSize: 11, color: "var(--text-2)" }}>{termos.length > 0 ? termos.map((t, ti) => <div key={ti}>{t}</div>) : <span style={{ color: "#bbb" }}>—</span>}</td>
                                <td style={{ padding: "8px 10px" }}><button style={btnX} onClick={() => { if (confirm("Excluir este aditivo?")) excluirAditivo(a.id).then(() => setAditivos(p => p.filter(x => x.id !== a.id))); }}>✕</button></td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    )}
                  </div>
                );
              })())}

              {/* ── Movimentações ── */}
              {abaModal === "movimentacoes" && (!contratoModal ? <AbaDisabled nome="Movimentações" /> : (() => {
                type Mov = { data: string; tipo: "liberacao" | "pagamento"; label: string; amortizacao: number; juros: number; acessorios: number; valor: number; saldo: number; status?: string };
                const movs: Mov[] = [];
                let saldoAcum = contratoModal.valor_financiado;
                [...parcelasLiberacao].sort((a, b) => a.data_liberacao.localeCompare(b.data_liberacao)).forEach(l => {
                  saldoAcum += l.valor_liberado;
                  movs.push({ data: l.data_liberacao, tipo: "liberacao", label: `Liberação #${l.num_parcela}`, amortizacao: 0, juros: 0, acessorios: 0, valor: l.valor_liberado, saldo: saldoAcum });
                });
                [...parcelasPagamento].sort((a, b) => a.data_vencimento.localeCompare(b.data_vencimento)).forEach(p => {
                  saldoAcum -= (p.amortizacao ?? 0);
                  movs.push({ data: p.data_vencimento, tipo: "pagamento", label: `Parcela #${p.num_parcela}`, amortizacao: p.amortizacao ?? 0, juros: p.juros ?? 0, acessorios: p.despesas_acessorios ?? 0, valor: p.valor_parcela, saldo: saldoAcum, status: p.status });
                });
                movs.sort((a, b) => a.data.localeCompare(b.data));
                return (
                  <div>
                    {movs.length === 0 ? (
                      <div style={{ textAlign: "center", padding: "48px 0", color: "var(--text-3)", fontSize: 12 }}>Nenhuma movimentação. Registre uma liberação ou gere o plano de pagamento.</div>
                    ) : (
                      <table style={{ width: "100%", borderCollapse: "collapse" }}>
                        <thead>
                          <tr style={{ background: "var(--bg-page)" }}>
                            {["Data", "Evento", "Amortização", "Juros", "Acessórios", "Valor", "Saldo Devedor", "Status"].map((h, i) => (
                              <th key={i} style={{ padding: "7px 8px", textAlign: i >= 2 ? "right" : "left", fontSize: 11, fontWeight: 600, color: "var(--text-2)", borderBottom: "0.5px solid var(--border-table)" }}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {movs.map((m, i) => {
                            const isLib = m.tipo === "liberacao";
                            const statusMeta: Record<string, { label: string; bg: string; cl: string }> = {
                              pendente: { label: "Pendente", bg: "#FBF3E0", cl: "#7A5400" },
                              pago:     { label: "Pago",     bg: "#E8F5EB", cl: "#1A5C35" },
                              vencido:  { label: "Vencido",  bg: "#FCF0F0", cl: "#7A1A1A" },
                              carencia: { label: "Carência", bg: "#E8E8E8", cl: "#0D0D0D" },
                            };
                            const sm = m.status ? (statusMeta[m.status] ?? statusMeta.pendente) : null;
                            return (
                              <tr key={i} style={{ borderBottom: i < movs.length - 1 ? "0.5px solid var(--border-row)" : "none", background: i % 2 === 0 ? "#fff" : "#FAFBFC" }}>
                                <td style={{ padding: "7px 8px", fontSize: 12, whiteSpace: "nowrap" }}>{fmtData(m.data)}</td>
                                <td style={{ padding: "7px 8px", fontSize: 12 }}>
                                  <span style={{ fontSize: 10, background: isLib ? "#E8E8E8" : "#F3F4F6", color: isLib ? "#0D0D0D" : "#333", padding: "2px 7px", borderRadius: 8, fontWeight: 600, marginRight: 6 }}>{isLib ? "Lib" : "Pag"}</span>
                                  {m.label}
                                </td>
                                <td style={{ padding: "7px 8px", fontSize: 12, textAlign: "right" }}>{m.amortizacao > 0 ? fmtBRL(m.amortizacao) : "—"}</td>
                                <td style={{ padding: "7px 8px", fontSize: 12, textAlign: "right", color: m.juros > 0 ? "#C9921B" : "#bbb" }}>{m.juros > 0 ? fmtBRL(m.juros) : "—"}</td>
                                <td style={{ padding: "7px 8px", fontSize: 12, textAlign: "right" }}>{m.acessorios > 0 ? fmtBRL(m.acessorios) : "—"}</td>
                                <td style={{ padding: "7px 8px", fontSize: 13, textAlign: "right", fontWeight: 600, color: isLib ? "#111111" : "#1A1A1A" }}>{fmtBRL(m.valor)}</td>
                                <td style={{ padding: "7px 8px", fontSize: 12, textAlign: "right", color: "var(--text-2)" }}>{fmtBRL(Math.max(0, m.saldo))}</td>
                                <td style={{ padding: "7px 8px" }}>{sm ? <span style={{ fontSize: 10, background: sm.bg, color: sm.cl, padding: "2px 8px", borderRadius: 8, fontWeight: 600 }}>{sm.label}</span> : <span style={{ color: "#bbb", fontSize: 11 }}>—</span>}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    )}
                  </div>
                );
              })())}

            </div>
          </div>
        </div>
      )}

      {/* ── Modal: Registrar Pagamento de Parcela ─────────────────────────────── */}
      {modalBaixaParcela && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 3000, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ background: "#fff", borderRadius: 12, padding: 28, width: 420, boxShadow: "0 8px 32px rgba(0,0,0,0.18)" }}>
            <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 4 }}>Registrar Pagamento</div>
            <div style={{ fontSize: 12, color: "var(--text-2)", marginBottom: 18 }}>
              Parcela {modalBaixaParcela.num_parcela} — vencimento {modalBaixaParcela.data_vencimento}
            </div>

            <div style={{ display: "grid", gap: 14 }}>
              <div>
                <label style={{ fontSize: 11, fontWeight: 600, color: "var(--text-2)", display: "block", marginBottom: 4 }}>Data do Pagamento *</label>
                <input
                  type="date"
                  style={{ width: "100%", padding: "7px 10px", borderRadius: 8, border: "0.5px solid var(--border-table)", fontSize: 13, boxSizing: "border-box" }}
                  value={baixaPData}
                  onChange={e => setBaixaPData(e.target.value)}
                />
              </div>
              <div>
                <label style={{ fontSize: 11, fontWeight: 600, color: "var(--text-2)", display: "block", marginBottom: 4 }}>Valor Pago (R$) *</label>
                <InputMonetario
                  style={{ width: "100%", padding: "7px 10px", borderRadius: 8, border: "0.5px solid var(--border-table)", fontSize: 13, boxSizing: "border-box" }}
                  value={baixaPValor}
                  onChange={v => setBaixaPValor(String(v))}
                />
              </div>
              <div>
                <label style={{ fontSize: 11, fontWeight: 600, color: "var(--text-2)", display: "block", marginBottom: 4 }}>Conta Bancária *</label>
                <select
                  style={{ width: "100%", padding: "7px 10px", borderRadius: 8, border: "0.5px solid var(--border-table)", fontSize: 13, boxSizing: "border-box" }}
                  value={baixaPConta}
                  onChange={e => setBaixaPConta(e.target.value)}
                >
                  <option value="">— selecione —</option>
                  {contas.map(c => <option key={c.id} value={c.id}>{c.nome} {c.banco ? `— ${c.banco}` : ""}</option>)}
                </select>
              </div>
            </div>

            {baixaPErro && <div style={{ marginTop: 12, fontSize: 12, color: "#E24B4A", background: "#FCEBEB", padding: "8px 12px", borderRadius: 8 }}>{baixaPErro}</div>}

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 20 }}>
              <button
                style={{ padding: "8px 18px", borderRadius: 8, border: "0.5px solid var(--border-table)", background: "#fff", fontSize: 13, cursor: "pointer" }}
                onClick={() => setModalBaixaParcela(null)}
                disabled={baixandoP}
              >Cancelar</button>
              <button
                style={{ padding: "8px 18px", borderRadius: 8, border: "none", background: "#1A4870", color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer" }}
                onClick={confirmarBaixaParcela}
                disabled={baixandoP}
              >{baixandoP ? "Registrando…" : "Confirmar Pagamento"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
