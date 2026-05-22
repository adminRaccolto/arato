"use client";
import { useState, useEffect } from "react";
import TopNav from "../../../components/TopNav";
import InputMonetario from "../../../components/InputMonetario";
import {
  listarContratosFinanceiros, criarContratoFinanceiro, atualizarContratoFinanceiro, excluirContratoFinanceiro,
  listarParcelasLiberacao, criarParcelaLiberacao, excluirParcelaLiberacao,
  listarParcelasPagamento, salvarParcelasPagamento, baixarParcelaPagamento,
  listarGarantias, criarGarantia, excluirGarantia,
  listarCentrosCusto, salvarCentrosCusto,
  listarAditivos, criarAditivo, excluirAditivo,
  listarMatriculas,
  listarMaquinas,
  listarContas,
} from "../../../lib/db";
import { supabase } from "../../../lib/supabase";
import { useAuth } from "../../../components/AuthProvider";
import type {
  ContratoFinanceiro, ParcelaLiberacao, ParcelaPagamento,
  GarantiaContrato, CentroCustoContrato, MatriculaImovel,
  ContaBancaria, Pessoa, Maquina, AditivoContrato,
} from "../../../lib/supabase";

// ── estilos base ──────────────────────────────────────────
const inp: React.CSSProperties = { width: "100%", padding: "8px 10px", border: "0.5px solid #D4DCE8", borderRadius: 8, fontSize: 13, color: "#1a1a1a", background: "#fff", boxSizing: "border-box", outline: "none" };
const lbl: React.CSSProperties = { fontSize: 11, color: "#555", marginBottom: 4, display: "block" };
const btnV: React.CSSProperties = { padding: "8px 18px", background: "#1A5C38", color: "#fff", border: "none", borderRadius: 8, fontWeight: 600, cursor: "pointer", fontSize: 13 };
const btnR: React.CSSProperties = { padding: "8px 18px", border: "0.5px solid #D4DCE8", borderRadius: 8, background: "transparent", cursor: "pointer", fontSize: 13, color: "#1a1a1a" };
const btnX: React.CSSProperties = { padding: "4px 10px", border: "0.5px solid #E24B4A50", borderRadius: 6, background: "#FCEBEB", cursor: "pointer", fontSize: 11, color: "#791F1F" };
const btnE: React.CSSProperties = { padding: "4px 10px", border: "0.5px solid #D4DCE8", borderRadius: 6, background: "transparent", cursor: "pointer", fontSize: 11, color: "#666" };
const secTit: React.CSSProperties = { fontSize: 11, fontWeight: 600, color: "#1A4870", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10, marginTop: 18, paddingBottom: 4, borderBottom: "0.5px solid #D4DCE8" };

const fmtBRL = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fmtNum = (v: number, dec = 2) => v.toLocaleString("pt-BR", { minimumFractionDigits: dec, maximumFractionDigits: dec });
const fmtData = (s?: string) => s ? s.split("-").reverse().join("/") : "—";

function aaParaAm(aa: number) { return (Math.pow(1 + aa / 100, 1 / 12) - 1) * 100; }
function amParaAa(am: number) { return (Math.pow(1 + am / 100, 12) - 1) * 100; }

function badge(t: string, bg = "#D5E8F5", color = "#0B2D50") {
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

function calcularCrescentes(principal: number, taxaMensal: number, nParcelas: number, crescPct: number, carencia: number, carenciaTipo: CarenciaTipo): ParcelaBase[] {
  const { saldoFinal, parcelas } = aplicarCarencia(principal, taxaMensal, carencia, carenciaTipo);
  let saldo = saldoFinal;
  const g = crescPct / 100;
  const pmt1 = taxaMensal === g
    ? saldo * taxaMensal / nParcelas
    : saldo * (taxaMensal - g) / (1 - Math.pow((1 + g) / (1 + taxaMensal), nParcelas));
  for (let i = 1; i <= nParcelas; i++) {
    const juros = saldo * taxaMensal;
    const pmt = pmt1 * Math.pow(1 + g, i - 1);
    const amort = pmt - juros;
    saldo -= amort;
    parcelas.push({ num_parcela: carencia + i, data_vencimento: "", amortizacao: Math.max(0, amort), juros, despesas_acessorios: 0, valor_parcela: pmt, saldo_devedor: Math.max(0, saldo) });
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
  custeio:       { label: "Custeio",        bg: "#D5E8F5", cl: "#0B2D50" },
  investimento:  { label: "Investimento",   bg: "#E6F1FB", cl: "#0C447C" },
  securitizacao: { label: "Securitização",  bg: "#FBF0D8", cl: "#7A5A12" },
  cpr:           { label: "CPR",            bg: "#FAEEDA", cl: "#633806" },
  egf:           { label: "EGF",            bg: "#FBF3E0", cl: "#8B5E14" },
  outros:        { label: "Outros",         bg: "#F1EFE8", cl: "#555"    },
};

const TIPO_GAR_META: Record<NonNullable<GarantiaContrato["tipo_garantia"]>, { label: string; bg: string; cl: string }> = {
  alienacao_fiduciaria: { label: "Alienação Fiduciária", bg: "#D5E8F5", cl: "#0B2D50" },
  hipoteca:             { label: "Hipoteca",              bg: "#FAEEDA", cl: "#633806" },
  penhor_rural:         { label: "Penhor Rural",          bg: "#FBF3E0", cl: "#8B5E14" },
  aval:                 { label: "Aval",                  bg: "#E8F5EB", cl: "#1A5C35" },
  nota_promissoria:     { label: "Nota Promissória",      bg: "#EDE9FB", cl: "#4B3B9B" },
  cpr_garantia:         { label: "CPR como Garantia",     bg: "#FEF3E2", cl: "#7A4300" },
  cessao_recebiveis:    { label: "Cessão de Recebíveis",  bg: "#E6F1FB", cl: "#0C447C" },
  outros:               { label: "Outros",                bg: "#F1EFE8", cl: "#555"    },
};

const GRAU_META: Record<"1_grau"|"2_grau"|"3_grau", string> = { "1_grau": "1° Grau", "2_grau": "2° Grau", "3_grau": "3° Grau" };

const TIPO_BEM_META: Record<NonNullable<GarantiaContrato["tipo_bem"]>, string> = {
  imovel: "Imóvel Rural", maquina: "Máquina / Veículo", semovente: "Semovente (Gado)", produto_agricola: "Produto Agrícola", outro: "Outro",
};

const STATUS_META: Record<ContratoFinanceiro["status"], { label: string; bg: string; cl: string }> = {
  ativo:     { label: "Ativo",     bg: "#D5E8F5", cl: "#0B2D50" },
  quitado:   { label: "Quitado",   bg: "#F1EFE8", cl: "#555"    },
  cancelado: { label: "Cancelado", bg: "#FCEBEB", cl: "#791F1F" },
};

const FC_VAZIO = {
  descricao: "", pessoa_id: "", credor: "",
  tipo: "custeio" as ContratoFinanceiro["tipo"],
  tipo_calculo: "sac" as ContratoFinanceiro["tipo_calculo"],
  linha_credito: "", moeda: "BRL" as "BRL" | "USD",
  valor_financiado: "", valor_cotacao: "",
  data_contrato: "", numero_documento: "",
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

// ────────────────────────────────────────────────────────
// PÁGINA
// ────────────────────────────────────────────────────────
export default function ContratosFinanceiros() {
  const { fazendaId } = useAuth();
  const [contratos, setContratos] = useState<ContratoFinanceiro[]>([]);
  const [contas, setContas]       = useState<ContaBancaria[]>([]);
  const [pessoas, setPessoas]     = useState<Pessoa[]>([]);
  const [salvando, setSalvando]   = useState(false);
  const [ptax, setPtax]           = useState<number | null>(null);

  // modal unificado
  const [modalAberto, setModalAberto]       = useState(false);
  const [contratoModal, setContratoModal]   = useState<ContratoFinanceiro | null>(null);
  const [abaModal, setAbaModal]             = useState<AbaModal>("principal");
  const [fC, setFC]                         = useState({ ...FC_VAZIO });

  // dados das abas
  const [parcelasLiberacao, setParcelasLiberacao] = useState<ParcelaLiberacao[]>([]);
  const [parcelasPagamento, setParcelasPagamento] = useState<ParcelaPagamento[]>([]);
  const [garantias, setGarantias]                 = useState<GarantiaContrato[]>([]);
  const [centrosCusto, setCentrosCusto]           = useState<CentroCustoContrato[]>([]);
  const [aditivos, setAditivos]                   = useState<AditivoContrato[]>([]);
  const [matriculas, setMatriculas]               = useState<MatriculaImovel[]>([]);
  const [maquinas, setMaquinas]                   = useState<Maquina[]>([]);

  // forms das abas
  const [fLib, setFLib]   = useState({ data_liberacao: "", valor_liberado: "", parcelas_liberacao: "1" });
  const [fGar, setFGar]   = useState({ tipo_garantia: "alienacao_fiduciaria" as GarantiaContrato["tipo_garantia"], grau: "" as "" | "1_grau" | "2_grau" | "3_grau", tipo_bem: "imovel" as GarantiaContrato["tipo_bem"], matricula_id: "", maquina_id: "", descricao: "", valor_avaliacao: "", percentual_bem: "100" });
  const [centrosForm, setCentrosForm] = useState<{ descricao: string; percentual: string; valor: string }[]>([{ descricao: "", percentual: "100", valor: "" }]);
  const [fCalc, setFCalc] = useState({ nParcelas: "12", taxaMensal: "1.5", dataPrimeiro: "", periodicidade: "1", acessorios: "0" });
  const [fAdit, setFAdit] = useState({ ...FA_VAZIO });

  // ── Carregar base ──
  useEffect(() => {
    if (!fazendaId) return;
    listarContratosFinanceiros(fazendaId).then(setContratos).catch(() => {});
    listarContas(fazendaId).then(c => setContas(c.filter(x => x.ativa))).catch(() => {});
    supabase.from("pessoas").select("*").eq("fazenda_id", fazendaId).eq("fornecedor", true).order("nome").then(({ data }) => setPessoas(data ?? []));
    const buscarPtax = () => fetch("/api/precos").then(r => r.json()).then(d => { const t = d.usdPtax ?? d.usdBrl; if (t && t > 1) setPtax(t); }).catch(() => {});
    buscarPtax();
    const timer = setInterval(buscarPtax, 5 * 60 * 1000);
    return () => clearInterval(timer);
  }, [fazendaId]);

  // ── Carregar dados ao mudar aba ──
  useEffect(() => {
    if (!contratoModal?.id) return;
    const id = contratoModal.id;
    if (abaModal === "liberacao")  listarParcelasLiberacao(id).then(setParcelasLiberacao).catch(() => {});
    if (abaModal === "pagamento")  listarParcelasPagamento(id).then(setParcelasPagamento).catch(() => {});
    if (abaModal === "garantias") {
      listarGarantias(id).then(setGarantias).catch(() => {});
      listarMatriculas(fazendaId!).then(setMatriculas).catch(() => {});
      listarMaquinas(fazendaId!).then(m => setMaquinas(m.filter(x => x.ativa))).catch(() => {});
    }
    if (abaModal === "centrocusto") listarCentrosCusto(id).then(cc => {
      setCentrosCusto(cc);
      setCentrosForm(cc.length > 0 ? cc.map(c => ({ descricao: c.descricao, percentual: String(c.percentual), valor: String(c.valor) })) : [{ descricao: "", percentual: "100", valor: "" }]);
    }).catch(() => {});
    if (abaModal === "aditivos") listarAditivos(id).then(setAditivos).catch(() => {});
    if (abaModal === "movimentacoes") {
      listarParcelasLiberacao(id).then(setParcelasLiberacao).catch(() => {});
      listarParcelasPagamento(id).then(setParcelasPagamento).catch(() => {});
    }
  }, [contratoModal, abaModal, fazendaId]);

  async function salvar(fn: () => Promise<void>) {
    try { setSalvando(true); await fn(); } catch (e) { alert((e as { message?: string })?.message || JSON.stringify(e)); } finally { setSalvando(false); }
  }

  const onChangeAa = (v: string) => { const aa = parseFloat(v.replace(",", ".")); setFC(p => ({ ...p, taxa_juros_aa: v, taxa_juros_am: isNaN(aa) ? "" : fmtNum(aaParaAm(aa), 4) })); };
  const onChangeAm = (v: string) => { const am = parseFloat(v.replace(",", ".")); setFC(p => ({ ...p, taxa_juros_am: v, taxa_juros_aa: isNaN(am) ? "" : fmtNum(amParaAa(am), 4) })); };
  const onPessoaChange = (id: string) => { const p = pessoas.find(x => x.id === id); setFC(prev => ({ ...prev, pessoa_id: id, credor: p ? p.nome : prev.credor })); };

  // ── Abrir modal ──
  const abrirModal = (c?: ContratoFinanceiro) => {
    setContratoModal(c ?? null);
    setAbaModal("principal");
    setFC(c ? {
      descricao: c.descricao, pessoa_id: c.pessoa_id ?? "", credor: c.credor,
      tipo: c.tipo, tipo_calculo: c.tipo_calculo, linha_credito: c.linha_credito ?? "",
      moeda: c.moeda, valor_financiado: String(c.valor_financiado), valor_cotacao: String(c.valor_cotacao ?? ""),
      data_contrato: c.data_contrato, numero_documento: c.numero_documento ?? "",
      taxa_juros_aa: c.taxa_juros_aa ? fmtNum(c.taxa_juros_aa, 4) : "",
      taxa_juros_am: c.taxa_juros_am ? fmtNum(c.taxa_juros_am, 4) : "",
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
    if (c) setFCalc({ nParcelas: "12", taxaMensal: c.taxa_juros_am ? fmtNum(c.taxa_juros_am, 4) : "1.5", dataPrimeiro: "", periodicidade: String(c.periodicidade_meses ?? 1), acessorios: "0" });
    setFLib({ data_liberacao: "", valor_liberado: "", parcelas_liberacao: "1" });
    setFGar({ tipo_garantia: "alienacao_fiduciaria", grau: "", tipo_bem: "imovel", matricula_id: "", maquina_id: "", descricao: "", valor_avaliacao: "", percentual_bem: "100" });
    setFAdit({ ...FA_VAZIO });
    setParcelasLiberacao([]); setParcelasPagamento([]); setGarantias([]); setCentrosCusto([]); setAditivos([]);
    setModalAberto(true);
  };

  const fecharModal = () => { setModalAberto(false); setContratoModal(null); };

  // ── Salvar contrato (Principal) ──
  const salvarContrato = () => salvar(async () => {
    if (!fC.descricao.trim() || !fC.data_contrato || !fC.valor_financiado) return;
    const credorNome = fC.pessoa_id ? (pessoas.find(p => p.id === fC.pessoa_id)?.nome ?? fC.credor) : fC.credor.trim();
    if (!credorNome) { alert("Informe o credor."); return; }
    const vf = parseFloat(fC.valor_financiado.replace(",", ".")) || 0;
    const vc = fC.valor_cotacao ? parseFloat(fC.valor_cotacao.replace(",", ".")) : undefined;
    const payload: Omit<ContratoFinanceiro, "id" | "created_at"> = {
      fazenda_id: fazendaId!, descricao: fC.descricao.trim(),
      pessoa_id: fC.pessoa_id || undefined, credor: credorNome,
      tipo: fC.tipo, tipo_calculo: fC.tipo_calculo, linha_credito: fC.linha_credito || undefined,
      moeda: fC.moeda, valor_financiado: vf, valor_cotacao: vc,
      valor_financiado_brl: fC.moeda === "USD" && vc ? vf * vc : vf,
      data_contrato: fC.data_contrato, numero_documento: fC.numero_documento || undefined,
      taxa_juros_aa: fC.taxa_juros_aa ? parseFloat(fC.taxa_juros_aa.replace(",", ".")) : undefined,
      taxa_juros_am: fC.taxa_juros_am ? parseFloat(fC.taxa_juros_am.replace(",", ".")) : undefined,
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
      const atualizado = { ...contratoModal, ...payload };
      setContratos(p => p.map(x => x.id === contratoModal.id ? atualizado : x));
      setContratoModal(atualizado);
      setFCalc(prev => ({ ...prev, taxaMensal: payload.taxa_juros_am ? fmtNum(payload.taxa_juros_am, 4) : prev.taxaMensal, periodicidade: String(payload.periodicidade_meses ?? 1) }));
    } else {
      const novo = await criarContratoFinanceiro(payload);
      setContratos(p => [novo, ...p]);
      setContratoModal(novo);
      setFCalc({ nParcelas: "12", taxaMensal: novo.taxa_juros_am ? fmtNum(novo.taxa_juros_am, 4) : "1.5", dataPrimeiro: "", periodicidade: String(novo.periodicidade_meses ?? 1), acessorios: "0" });
      setAbaModal("liberacao");
    }
  });

  // ── Liberação ──
  const salvarLiberacao = () => salvar(async () => {
    if (!contratoModal || !fLib.data_liberacao || !fLib.valor_liberado) return;
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
    if (!contratoModal || !fCalc.dataPrimeiro) return;
    const n = Math.max(1, Number(fCalc.nParcelas) || 12);
    const i = (Number(fCalc.taxaMensal) || 0) / 100;
    const car = Number(contratoModal.carencia_meses ?? 0);
    const carTipo = (contratoModal.carencia_tipo ?? "so_juros") as CarenciaTipo;
    const crescPct = contratoModal.crescimento_pct ?? 0;
    const period = Number(fCalc.periodicidade) || (contratoModal.periodicidade_meses ?? 1);
    const acessMensal = parseFloat(fCalc.acessorios.replace(",", ".")) || 0;
    let base: ParcelaBase[];
    if (crescPct > 0) base = calcularCrescentes(contratoModal.valor_financiado, i, n, crescPct, car, carTipo);
    else if (contratoModal.tipo_calculo === "sac") base = calcularSAC(contratoModal.valor_financiado, i, n, car, carTipo);
    else base = calcularPRICE(contratoModal.valor_financiado, i, n, car, carTipo);
    base = base.map(p => ({ ...p, despesas_acessorios: p.valor_parcela > 0 ? acessMensal : 0, valor_parcela: p.valor_parcela > 0 ? p.valor_parcela + acessMensal : 0 }));
    const comDatas = aplicarDatas(base, fCalc.dataPrimeiro, period);
    const salvas = await salvarParcelasPagamento(contratoModal.id, fazendaId!, comDatas.map(p => ({ ...p, status: "em_aberto" as const })));
    setParcelasPagamento(salvas);
  });

  // ── Garantia ──
  const salvarGarantia = () => salvar(async () => {
    if (!contratoModal) return;
    let desc = fGar.descricao.trim();
    if (!desc) {
      if (fGar.tipo_bem === "imovel" && fGar.matricula_id) { const m = matriculas.find(x => x.id === fGar.matricula_id); desc = m ? `Matr. ${m.numero}${m.area_ha ? ` — ${m.area_ha} ha` : ""}` : "Imóvel"; }
      else if (fGar.tipo_bem === "maquina" && fGar.maquina_id) { const m = maquinas.find(x => x.id === fGar.maquina_id); desc = m ? `${m.nome}${m.marca ? ` — ${m.marca}` : ""}` : "Máquina"; }
      else desc = TIPO_GAR_META[fGar.tipo_garantia ?? "outros"]?.label ?? "Garantia";
    }
    if (!desc) { alert("Informe a descrição da garantia."); return; }
    const nova = await criarGarantia({
      contrato_id: contratoModal.id, fazenda_id: fazendaId!,
      tipo_garantia: fGar.tipo_garantia || undefined, grau: fGar.grau || undefined, tipo_bem: fGar.tipo_bem || undefined,
      matricula_id: fGar.tipo_bem === "imovel" ? (fGar.matricula_id || undefined) : undefined,
      maquina_id:   fGar.tipo_bem === "maquina" ? (fGar.maquina_id || undefined) : undefined,
      descricao: desc,
      valor_avaliacao: fGar.valor_avaliacao ? Number(fGar.valor_avaliacao.replace(",", ".")) : undefined,
      percentual_bem:  fGar.percentual_bem ? Number(fGar.percentual_bem) : undefined,
    });
    setGarantias(p => [...p, nova]);
    setFGar({ tipo_garantia: "alienacao_fiduciaria", grau: "", tipo_bem: "imovel", matricula_id: "", maquina_id: "", descricao: "", valor_avaliacao: "", percentual_bem: "100" });
  });

  // ── Centro de custo ──
  const salvarCentroCusto = () => salvar(async () => {
    if (!contratoModal) return;
    const itens: Omit<CentroCustoContrato, "id" | "created_at">[] = centrosForm.filter(c => c.descricao.trim()).map(c => ({
      contrato_id: contratoModal.id, descricao: c.descricao.trim(),
      percentual: parseFloat(c.percentual.replace(",", ".")) || 0,
      valor: parseFloat(c.valor.replace(",", ".")) || 0,
    }));
    await salvarCentrosCusto(contratoModal.id, itens);
    setCentrosCusto(await listarCentrosCusto(contratoModal.id));
  });

  // ── Aditivo ──
  const salvarAditivo = () => salvar(async () => {
    if (!contratoModal || !fAdit.data_aditivo || !fAdit.descricao.trim()) return;
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

  // ── Totais ──
  const totalFinanciado = contratos.filter(c => c.status === "ativo").reduce((s, c) => s + (c.moeda === "USD" ? c.valor_financiado * (ptax ?? 1) : c.valor_financiado), 0);
  const nomeConta = (id?: string) => id ? (contas.find(c => c.id === id)?.nome ?? "—") : "—";

  // ── Aba desabilitada quando contrato ainda não salvo ──
  function AbaDisabled({ nome }: { nome: string }) {
    return (
      <div style={{ textAlign: "center", padding: "48px 0", color: "#999" }}>
        <div style={{ fontSize: 32, marginBottom: 8 }}>🔒</div>
        <div style={{ fontWeight: 600, fontSize: 13, color: "#555" }}>Salve o contrato primeiro</div>
        <div style={{ fontSize: 12, color: "#888", marginTop: 4 }}>Preencha a aba <strong>Principal</strong> e clique em <strong>Salvar</strong> para liberar a aba <strong>{nome}</strong>.</div>
      </div>
    );
  }

  // ────────────────────────────────────────────────────────
  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh", background: "#F3F6F9", fontFamily: "system-ui, sans-serif", fontSize: 13 }}>
      <TopNav />
      <main style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
        <div style={{ maxWidth: 1300, margin: "0 auto", padding: "28px 24px", width: "100%" }}>

          {/* Cabeçalho */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 24 }}>
            <div>
              <h1 style={{ fontSize: 20, fontWeight: 700, color: "#1a1a1a", margin: 0 }}>Contratos Financeiros</h1>
              <div style={{ fontSize: 12, color: "#888", marginTop: 3 }}>Custeio, CPR, investimento, securitização, EGF</div>
            </div>
            <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
              {ptax && <span style={{ fontSize: 11, color: "#555", background: "#F3F6F9", border: "0.5px solid #D4DCE8", borderRadius: 8, padding: "4px 10px" }}>PTAX: R$ {fmtNum(ptax, 4)}</span>}
              <button style={{ ...btnV, background: "#1A4870", padding: "9px 20px" }} onClick={() => abrirModal()}>+ Novo Contrato</button>
            </div>
          </div>

          {/* KPI */}
          {contratos.length > 0 && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14, marginBottom: 24 }}>
              {[
                { label: "Contratos Ativos",  valor: contratos.filter(c => c.status === "ativo").length, fmt: (v: number) => String(v),        cor: "#1A4870", suf: "" },
                { label: "Total Captado",     valor: totalFinanciado,                                      fmt: fmtBRL,                           cor: "#1A5C38", suf: ptax ? " (conv. PTAX)" : "" },
                { label: "Quitados/Cancelados", valor: contratos.filter(c => c.status !== "ativo").length, fmt: (v: number) => String(v),        cor: "#555",    suf: "" },
              ].map((k, i) => (
                <div key={i} style={{ background: "#fff", borderRadius: 12, border: "0.5px solid #DDE2EE", padding: "14px 18px" }}>
                  <div style={{ fontSize: 11, color: "#888", marginBottom: 4 }}>{k.label}{k.suf}</div>
                  <div style={{ fontSize: 22, fontWeight: 700, color: k.cor }}>{k.fmt(k.valor)}</div>
                </div>
              ))}
            </div>
          )}

          {/* Tabela */}
          {contratos.length === 0 ? (
            <div style={{ background: "#fff", borderRadius: 14, border: "0.5px solid #DDE2EE", padding: "56px 0", textAlign: "center" }}>
              <div style={{ fontSize: 40, marginBottom: 10 }}>🏦</div>
              <div style={{ fontWeight: 600, fontSize: 14, color: "#1a1a1a", marginBottom: 4 }}>Nenhum contrato financeiro cadastrado</div>
              <div style={{ fontSize: 12, color: "#888" }}>Custeio bancário, CPR, Pronaf, financiamento de máquinas…</div>
            </div>
          ) : (
            <div style={{ background: "#fff", borderRadius: 14, border: "0.5px solid #DDE2EE", overflow: "hidden" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ background: "#F3F6F9" }}>
                    {["Descrição / Credor", "Tipo", "Cálculo", "Taxa a.a.", "Valor", "Data Contrato", "Status", ""].map((h, i) => (
                      <th key={i} style={{ padding: "10px 14px", textAlign: i >= 3 && i <= 5 ? "center" : "left", fontSize: 11, fontWeight: 600, color: "#555", borderBottom: "0.5px solid #DDE2EE" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {contratos.map((c, idx) => {
                    const tm = TIPO_META[c.tipo];
                    const sm = STATUS_META[c.status];
                    return (
                      <tr key={c.id} style={{ borderBottom: idx < contratos.length - 1 ? "0.5px solid #EEF1F6" : "none", cursor: "pointer" }}
                        onMouseEnter={e => (e.currentTarget.style.background = "#FAFBFD")}
                        onMouseLeave={e => (e.currentTarget.style.background = "transparent")}>
                        <td style={{ padding: "10px 14px" }}>
                          <div style={{ fontWeight: 600, color: "#1a1a1a" }}>{c.descricao}</div>
                          <div style={{ fontSize: 11, color: "#888" }}>{c.credor}{c.linha_credito ? ` · ${c.linha_credito}` : ""}</div>
                        </td>
                        <td style={{ padding: "10px 14px" }}>{badge(tm.label, tm.bg, tm.cl)}</td>
                        <td style={{ padding: "10px 14px", textAlign: "center" }}>{badge(c.tipo_calculo.toUpperCase(), "#F1EFE8", "#555")}</td>
                        <td style={{ padding: "10px 14px", textAlign: "center", color: "#1a1a1a" }}>{c.taxa_juros_aa ? `${fmtNum(c.taxa_juros_aa, 2)}% a.a.` : "—"}</td>
                        <td style={{ padding: "10px 14px", textAlign: "center" }}>
                          <div style={{ fontWeight: 600 }}>{c.moeda === "USD" ? `US$ ${fmtNum(c.valor_financiado)}` : fmtBRL(c.valor_financiado)}</div>
                          {c.moeda === "USD" && ptax && <div style={{ fontSize: 10, color: "#888" }}>≈ {fmtBRL(c.valor_financiado * ptax)}</div>}
                        </td>
                        <td style={{ padding: "10px 14px", textAlign: "center", color: "#1a1a1a" }}>{fmtData(c.data_contrato)}</td>
                        <td style={{ padding: "10px 14px", textAlign: "center" }}>{badge(sm.label, sm.bg, sm.cl)}</td>
                        <td style={{ padding: "10px 14px", textAlign: "right" }}>
                          <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                            <button style={{ ...btnE, background: "#EBF2FA", color: "#1A4870", fontWeight: 600 }} onClick={() => abrirModal(c)}>Abrir</button>
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
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 120 }}
          onClick={e => { if (e.target === e.currentTarget) fecharModal(); }}>
          <div style={{ background: "#fff", borderRadius: 16, width: "min(1160px, 97vw)", maxHeight: "95vh", display: "flex", flexDirection: "column", overflow: "hidden" }}>

            {/* Cabeçalho do modal */}
            <div style={{ padding: "18px 26px 0", borderBottom: "0.5px solid #D4DCE8", flexShrink: 0 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14 }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 16, color: "#1a1a1a" }}>
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
                <button onClick={fecharModal} style={{ border: "none", background: "transparent", fontSize: 20, cursor: "pointer", color: "#888", lineHeight: 1 }}>✕</button>
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
                      style={{ padding: "8px 16px", border: "none", background: "transparent", cursor: bloqueada ? "not-allowed" : "pointer", fontSize: 13, fontWeight: abaModal === k ? 700 : 400, color: bloqueada ? "#ccc" : abaModal === k ? "#1A4870" : "#555", borderBottom: abaModal === k ? "2.5px solid #1A4870" : "2.5px solid transparent", whiteSpace: "nowrap", transition: "color 0.1s" }}
                    >{l}{bloqueada ? " 🔒" : ""}</button>
                  );
                })}
              </div>
            </div>

            {/* Conteúdo */}
            <div style={{ flex: 1, overflowY: "auto", padding: "22px 26px" }}>

              {/* ── Principal ── */}
              {abaModal === "principal" && (
                <div>
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
                      <select style={inp} value={fC.linha_credito} onChange={e => setFC(p => ({ ...p, linha_credito: e.target.value }))}>
                        <option value="">Selecione…</option>
                        {LINHAS_CREDITO.map(l => <option key={l} value={l}>{l}</option>)}
                      </select>
                    </div>
                    <div>
                      <label style={lbl}>Nº Documento / Contrato</label>
                      <input style={inp} placeholder="Ex: 12345/2026" value={fC.numero_documento} onChange={e => setFC(p => ({ ...p, numero_documento: e.target.value }))} />
                    </div>
                    <div>
                      <label style={lbl}>Tipo de Cálculo *</label>
                      <select style={inp} value={fC.tipo_calculo} onChange={e => setFC(p => ({ ...p, tipo_calculo: e.target.value as ContratoFinanceiro["tipo_calculo"] }))}>
                        <option value="sac">SAC — Amortização Constante</option>
                        <option value="price">PRICE — Parcela Constante</option>
                        <option value="outros">Outros / Manual</option>
                      </select>
                    </div>
                  </div>

                  <SecTitle>Credor / Instituição Financeira</SecTitle>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 4 }}>
                    <div>
                      <label style={lbl}>Credor (fornecedor cadastrado)</label>
                      <select style={inp} value={fC.pessoa_id} onChange={e => onPessoaChange(e.target.value)}>
                        <option value="">— Buscar em pessoas cadastradas —</option>
                        {pessoas.map(p => <option key={p.id} value={p.id}>{p.nome}{p.cpf_cnpj ? ` — ${p.cpf_cnpj}` : ""}</option>)}
                      </select>
                    </div>
                    <div>
                      <label style={lbl}>Nome do Credor *{fC.pessoa_id ? " (do cadastro)" : ""}</label>
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
                      <label style={lbl}>Carência (meses)</label>
                      <input style={inp} type="number" min="0" value={fC.carencia_meses} onChange={e => setFC(p => ({ ...p, carencia_meses: e.target.value }))} />
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
                    <div>
                      <label style={lbl}>Crescimento por Período (%)</label>
                      <InputMonetario style={inp} placeholder="0 = fixo" value={fC.crescimento_pct} onChange={v => setFC(p => ({ ...p, crescimento_pct: String(v) }))} />
                    </div>
                  </div>

                  <SecTitle>Taxas e Custos da Operação</SecTitle>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr 1fr", gap: 12, marginBottom: 4 }}>
                    <div>
                      <label style={lbl}>Taxa de Juros a.a. (%)</label>
                      <input style={inp} type="number" step="0.001" placeholder="Ex: 12,00" value={fC.taxa_juros_aa} onChange={e => onChangeAa(e.target.value)} />
                    </div>
                    <div>
                      <label style={lbl}>Taxa de Juros a.m. (%)</label>
                      <input style={inp} type="number" step="0.0001" placeholder="Auto" value={fC.taxa_juros_am} onChange={e => onChangeAm(e.target.value)} />
                    </div>
                    <div>
                      <label style={lbl}>IOF (%)</label>
                      <input style={inp} type="number" step="0.001" placeholder="Ex: 0,38" value={fC.iof_pct} onChange={e => setFC(p => ({ ...p, iof_pct: e.target.value }))} />
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

                  <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 22 }}>
                    <button style={btnR} onClick={fecharModal}>Fechar</button>
                    <button
                      style={{ ...btnV, background: "#1A4870", opacity: salvando || !fC.descricao.trim() || !fC.data_contrato || !fC.valor_financiado ? 0.5 : 1 }}
                      disabled={salvando || !fC.descricao.trim() || !fC.data_contrato || !fC.valor_financiado}
                      onClick={salvarContrato}
                    >{salvando ? "Salvando…" : contratoModal ? "Salvar alterações" : "Salvar e continuar"}</button>
                  </div>
                </div>
              )}

              {/* ── Liberação ── */}
              {abaModal === "liberacao" && (!contratoModal ? <AbaDisabled nome="Liberação" /> : (
                <div>
                  <div style={{ background: "#E4F0F9", border: "0.5px solid #1A487040", borderRadius: 8, padding: "10px 14px", marginBottom: 14, fontSize: 12, color: "#0B2D50" }}>
                    ✦ Ao registrar uma liberação, um lançamento CR é criado automaticamente no financeiro{contratoModal.conta_liberacao_id ? ` · Conta: ${nomeConta(contratoModal.conta_liberacao_id)}` : ""}.
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr auto", gap: 10, marginBottom: 16, alignItems: "end" }}>
                    <div><label style={lbl}>Data Liberação</label><input style={inp} type="date" value={fLib.data_liberacao} onChange={e => setFLib(p => ({ ...p, data_liberacao: e.target.value }))} /></div>
                    <div><label style={lbl}>Valor Liberado ({contratoModal.moeda === "USD" ? "US$" : "R$"})</label><InputMonetario style={inp} value={fLib.valor_liberado} onChange={v => setFLib(p => ({ ...p, valor_liberado: String(v) }))} /></div>
                    <div><label style={lbl}>Nº Parcelas</label><input style={inp} type="number" min="1" value={fLib.parcelas_liberacao} onChange={e => setFLib(p => ({ ...p, parcelas_liberacao: e.target.value }))} /></div>
                    <button style={{ ...btnV, padding: "8px 14px" }} onClick={salvarLiberacao} disabled={salvando || !fLib.data_liberacao || !fLib.valor_liberado}>+ Adicionar</button>
                  </div>
                  {parcelasLiberacao.length === 0 ? (
                    <div style={{ textAlign: "center", padding: "24px 0", color: "#888", fontSize: 12 }}>Nenhuma parcela de liberação registrada</div>
                  ) : (
                    <table style={{ width: "100%", borderCollapse: "collapse" }}>
                      <thead><tr style={{ background: "#F3F6F9" }}>{["Nº", "Data", contratoModal.moeda === "USD" ? "Valor (US$)" : "Valor (R$)", contratoModal.moeda === "USD" ? "Equiv. R$" : "", "Lançto.CR", ""].map((h, i) => h ? <th key={i} style={{ padding: "7px 12px", textAlign: "center", fontSize: 11, fontWeight: 600, color: "#555", borderBottom: "0.5px solid #D4DCE8" }}>{h}</th> : null)}</tr></thead>
                      <tbody>
                        {parcelasLiberacao.map((p, i) => (
                          <tr key={p.id} style={{ borderBottom: i < parcelasLiberacao.length - 1 ? "0.5px solid #DEE5EE" : "none" }}>
                            <td style={{ padding: "8px 12px", textAlign: "center" }}>{p.num_parcela}</td>
                            <td style={{ padding: "8px 12px", textAlign: "center" }}>{fmtData(p.data_liberacao)}</td>
                            <td style={{ padding: "8px 12px", textAlign: "center", fontWeight: 600 }}>{contratoModal.moeda === "USD" ? `US$ ${fmtNum(p.valor_liberado)}` : fmtBRL(p.valor_liberado)}</td>
                            {contratoModal.moeda === "USD" && <td style={{ padding: "8px 12px", textAlign: "center" }}>{p.valor_liberado_brl ? fmtBRL(p.valor_liberado_brl) : "—"}</td>}
                            <td style={{ padding: "8px 12px", textAlign: "center" }}>{p.lancamento_id ? badge("✓ CR", "#D5E8F5", "#0B2D50") : badge("—", "#F1EFE8", "#555")}</td>
                            <td style={{ padding: "8px 12px", textAlign: "right" }}><button style={btnX} onClick={() => excluirParcelaLiberacao(p.id).then(() => setParcelasLiberacao(x => x.filter(r => r.id !== p.id)))}>✕</button></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                  <div style={{ marginTop: 10, fontSize: 11, color: "#555", textAlign: "right" }}>
                    Total liberado: <strong>{fmtBRL(parcelasLiberacao.reduce((s, p) => s + (p.valor_liberado_brl ?? p.valor_liberado), 0))}</strong>
                    {" · "}Saldo a liberar: <strong style={{ color: "#EF9F27" }}>{fmtBRL(Math.max(0, (contratoModal.valor_financiado_brl ?? contratoModal.valor_financiado) - parcelasLiberacao.reduce((s, p) => s + (p.valor_liberado_brl ?? p.valor_liberado), 0)))}</strong>
                  </div>
                </div>
              ))}

              {/* ── Pagamento ── */}
              {abaModal === "pagamento" && (!contratoModal ? <AbaDisabled nome="Pagamento" /> : (
                <div>
                  <div style={{ background: "#E4F0F9", border: "0.5px solid #1A487040", borderRadius: 8, padding: "10px 14px", marginBottom: 14, fontSize: 12, color: "#0B2D50" }}>
                    ✦ Ao baixar cada parcela, lançamentos CP são criados automaticamente{contratoModal.conta_pagamento_id ? ` · Conta: ${nomeConta(contratoModal.conta_pagamento_id)}` : ""}.
                  </div>
                  <div style={{ background: "#F3F6F9", border: "0.5px solid #D4DCE8", borderRadius: 10, padding: 14, marginBottom: 16 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: "#1a1a1a", marginBottom: 10 }}>Calcular tabela — {contratoModal.tipo_calculo.toUpperCase()}</div>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 10, alignItems: "end" }}>
                      <div><label style={lbl}>Nº Parcelas</label><input style={inp} type="number" min="1" value={fCalc.nParcelas} onChange={e => setFCalc(p => ({ ...p, nParcelas: e.target.value }))} /></div>
                      <div><label style={lbl}>Taxa a.m. (%) {contratoModal.taxa_juros_am && <span style={{ color: "#1A4870" }}>· contr: {fmtNum(contratoModal.taxa_juros_am, 4)}%</span>}</label><input style={inp} type="number" step="0.0001" value={fCalc.taxaMensal} onChange={e => setFCalc(p => ({ ...p, taxaMensal: e.target.value }))} /></div>
                      <div><label style={lbl}>Data 1º Pagto.</label><input style={inp} type="date" value={fCalc.dataPrimeiro} onChange={e => setFCalc(p => ({ ...p, dataPrimeiro: e.target.value }))} /></div>
                      <div><label style={lbl}>Periodicidade</label><select style={inp} value={fCalc.periodicidade} onChange={e => setFCalc(p => ({ ...p, periodicidade: e.target.value }))}><option value="1">Mensal</option><option value="3">Trimestral</option><option value="6">Semestral</option><option value="12">Anual</option></select></div>
                      <div><label style={lbl}>Acessórios/parc. (R$)</label><InputMonetario style={inp} value={fCalc.acessorios} onChange={v => setFCalc(p => ({ ...p, acessorios: String(v) }))} /></div>
                    </div>
                    <div style={{ marginTop: 10, display: "flex", justifyContent: "flex-end" }}>
                      <button style={{ ...btnV, background: "#C9921B" }} onClick={calcularParcelas} disabled={salvando || !fCalc.dataPrimeiro}>{salvando ? "Calculando…" : "⟳ Calcular e Salvar Parcelas"}</button>
                    </div>
                  </div>
                  {parcelasPagamento.length === 0 ? (
                    <div style={{ textAlign: "center", padding: "24px 0", color: "#888", fontSize: 12 }}>Preencha a calculadora acima para gerar a tabela de parcelas</div>
                  ) : (
                    <>
                      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                        <thead><tr style={{ background: "#F3F6F9" }}>{["Nº", "Vencimento", "Amortização", "Juros", "Encargos", "Valor Parcela", "Saldo Devedor", "Status"].map((h, i) => <th key={i} style={{ padding: "7px 10px", textAlign: i === 0 ? "center" : "right", fontSize: 11, fontWeight: 600, color: "#555", borderBottom: "0.5px solid #D4DCE8", whiteSpace: "nowrap" }}>{h}</th>)}</tr></thead>
                        <tbody>
                          {parcelasPagamento.map((p, i) => {
                            const corSt = p.status === "pago" ? "#1A4870" : p.status === "vencido" ? "#E24B4A" : "#555";
                            return (
                              <tr key={p.id} style={{ borderBottom: i < parcelasPagamento.length - 1 ? "0.5px solid #DEE5EE" : "none", background: p.status === "pago" ? "#E4F0F9" : "transparent" }}>
                                <td style={{ padding: "7px 10px", textAlign: "center" }}>{p.num_parcela}</td>
                                <td style={{ padding: "7px 10px", textAlign: "right" }}>{fmtData(p.data_vencimento)}</td>
                                <td style={{ padding: "7px 10px", textAlign: "right" }}>{fmtBRL(p.amortizacao)}</td>
                                <td style={{ padding: "7px 10px", textAlign: "right", color: "#E24B4A" }}>{fmtBRL(p.juros)}</td>
                                <td style={{ padding: "7px 10px", textAlign: "right" }}>{fmtBRL(p.despesas_acessorios)}</td>
                                <td style={{ padding: "7px 10px", textAlign: "right", fontWeight: 600 }}>{fmtBRL(p.valor_parcela)}</td>
                                <td style={{ padding: "7px 10px", textAlign: "right" }}>{fmtBRL(p.saldo_devedor)}</td>
                                <td style={{ padding: "7px 10px", textAlign: "center" }}>
                                  <span style={{ fontSize: 10, fontWeight: 600, color: corSt }}>{p.status === "pago" ? "✓ Pago" : p.status === "vencido" ? "Vencido" : "Em aberto"}</span>
                                  {p.status !== "pago" && <button style={{ ...btnE, marginLeft: 6, fontSize: 10 }} onClick={() => baixarParcelaPagamento(p.id, fazendaId!, p, contratoModal!).then(() => setParcelasPagamento(x => x.map(r => r.id === p.id ? { ...r, status: "pago" as const } : r)))}>Baixar</button>}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                        <tfoot>
                          <tr style={{ background: "#F3F6F9", fontWeight: 600 }}>
                            <td colSpan={2} style={{ padding: "7px 10px", textAlign: "right", fontSize: 11, color: "#555" }}>TOTAIS</td>
                            <td style={{ padding: "7px 10px", textAlign: "right" }}>{fmtBRL(parcelasPagamento.reduce((s, p) => s + p.amortizacao, 0))}</td>
                            <td style={{ padding: "7px 10px", textAlign: "right", color: "#E24B4A" }}>{fmtBRL(parcelasPagamento.reduce((s, p) => s + p.juros, 0))}</td>
                            <td style={{ padding: "7px 10px", textAlign: "right" }}>{fmtBRL(parcelasPagamento.reduce((s, p) => s + p.despesas_acessorios, 0))}</td>
                            <td style={{ padding: "7px 10px", textAlign: "right" }}>{fmtBRL(parcelasPagamento.reduce((s, p) => s + p.valor_parcela, 0))}</td>
                            <td colSpan={2} />
                          </tr>
                        </tfoot>
                      </table>
                      <div style={{ marginTop: 8, fontSize: 11, color: "#555", display: "flex", gap: 16 }}>
                        <span>Custo total de juros: <strong style={{ color: "#E24B4A" }}>{fmtBRL(parcelasPagamento.reduce((s, p) => s + p.juros + p.despesas_acessorios, 0))}</strong></span>
                        <span>CET estimado: <strong>{fmtNum((parcelasPagamento.reduce((s, p) => s + p.juros, 0) / contratoModal.valor_financiado) * 100, 2)}% a.p.</strong></span>
                        <span>Pagas: <strong style={{ color: "#1A4870" }}>{parcelasPagamento.filter(p => p.status === "pago").length}/{parcelasPagamento.length}</strong></span>
                      </div>
                    </>
                  )}
                </div>
              ))}

              {/* ── Garantias ── */}
              {abaModal === "garantias" && (!contratoModal ? <AbaDisabled nome="Garantias" /> : (
                <div>
                  <div style={{ background: "#F8FAFD", border: "0.5px solid #D4DCE8", borderRadius: 10, padding: "14px 16px", marginBottom: 16 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: "#1A4870", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 12 }}>Nova Garantia</div>
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
                        <select style={inp} value={fGar.tipo_bem ?? "imovel"} onChange={e => setFGar(p => ({ ...p, tipo_bem: e.target.value as GarantiaContrato["tipo_bem"], matricula_id: "", maquina_id: "" }))}>
                          <option value="imovel">Imóvel Rural (Matrícula)</option>
                          <option value="maquina">Máquina / Veículo</option>
                          <option value="semovente">Semovente (Gado)</option>
                          <option value="produto_agricola">Produto Agrícola (CPR)</option>
                          <option value="outro">Outro</option>
                        </select>
                      </div>
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: fGar.tipo_bem === "imovel" || fGar.tipo_bem === "maquina" ? "2fr 1fr 1fr 1fr auto" : "2fr 1fr 1fr auto", gap: 10, alignItems: "end" }}>
                      {fGar.tipo_bem === "imovel" && <div><label style={lbl}>Matrícula vinculada</label><select style={inp} value={fGar.matricula_id} onChange={e => setFGar(p => ({ ...p, matricula_id: e.target.value }))}><option value="">— Selecione —</option>{matriculas.map(m => <option key={m.id} value={m.id}>Matr. {m.numero}{m.area_ha ? ` — ${m.area_ha} ha` : ""}{m.municipio ? ` — ${m.municipio}` : ""}</option>)}</select></div>}
                      {fGar.tipo_bem === "maquina" && <div><label style={lbl}>Máquina / Veículo</label><select style={inp} value={fGar.maquina_id} onChange={e => setFGar(p => ({ ...p, maquina_id: e.target.value }))}><option value="">— Selecione —</option>{maquinas.map(m => <option key={m.id} value={m.id}>{m.nome}{m.marca ? ` — ${m.marca}` : ""}{m.ano ? ` (${m.ano})` : ""}</option>)}</select></div>}
                      {fGar.tipo_bem !== "imovel" && fGar.tipo_bem !== "maquina" && <div><label style={lbl}>Descrição do Bem *</label><input style={inp} placeholder="Ex: 300 cabeças Nelore…" value={fGar.descricao} onChange={e => setFGar(p => ({ ...p, descricao: e.target.value }))} /></div>}
                      <div><label style={lbl}>% do Bem</label><input style={inp} type="number" min="1" max="100" value={fGar.percentual_bem} onChange={e => setFGar(p => ({ ...p, percentual_bem: e.target.value }))} /></div>
                      <div><label style={lbl}>Valor Avaliação (R$)</label><InputMonetario style={inp} value={fGar.valor_avaliacao} onChange={v => setFGar(p => ({ ...p, valor_avaliacao: String(v) }))} /></div>
                      {(fGar.tipo_bem === "imovel" || fGar.tipo_bem === "maquina") && <div><label style={lbl}>Obs.</label><input style={inp} placeholder="Opcional" value={fGar.descricao} onChange={e => setFGar(p => ({ ...p, descricao: e.target.value }))} /></div>}
                      <button style={{ ...btnV, padding: "8px 14px", alignSelf: "flex-end" }} onClick={salvarGarantia} disabled={salvando}>+ Adicionar</button>
                    </div>
                  </div>
                  {garantias.length === 0 ? (
                    <div style={{ textAlign: "center", padding: "24px 0", color: "#888", fontSize: 12 }}>Nenhuma garantia cadastrada para este contrato.</div>
                  ) : (
                    <>
                      <table style={{ width: "100%", borderCollapse: "collapse" }}>
                        <thead><tr style={{ background: "#F3F6F9" }}>{["Tipo de Garantia", "Grau", "Bem / Descrição", "Tipo de Bem", "% Bem", "Valor Avaliação", "Cobertura", ""].map((h, i) => <th key={i} style={{ padding: "7px 12px", textAlign: i <= 2 ? "left" : "center", fontSize: 11, fontWeight: 600, color: "#555", borderBottom: "0.5px solid #D4DCE8", whiteSpace: "nowrap" }}>{h}</th>)}</tr></thead>
                        <tbody>
                          {garantias.map((g, i) => {
                            const tipoMeta = g.tipo_garantia ? TIPO_GAR_META[g.tipo_garantia] : null;
                            const cobertura = g.valor_avaliacao ? (g.valor_avaliacao * ((g.percentual_bem ?? 100) / 100) / (contratoModal.valor_financiado_brl ?? contratoModal.valor_financiado)) * 100 : null;
                            const bemDesc = g.tipo_bem === "imovel" && g.matricula_id ? `Matr. ${matriculas.find(m => m.id === g.matricula_id)?.numero ?? "?"}` : g.tipo_bem === "maquina" && g.maquina_id ? (maquinas.find(m => m.id === g.maquina_id)?.nome ?? "Máquina") : g.descricao;
                            return (
                              <tr key={g.id} style={{ borderBottom: i < garantias.length - 1 ? "0.5px solid #DEE5EE" : "none" }}>
                                <td style={{ padding: "9px 12px" }}>{tipoMeta ? <span style={{ fontSize: 11, background: tipoMeta.bg, color: tipoMeta.cl, padding: "2px 7px", borderRadius: 8, fontWeight: 600 }}>{tipoMeta.label}</span> : "—"}</td>
                                <td style={{ padding: "9px 12px", textAlign: "center", fontSize: 11, fontWeight: 600 }}>{g.grau ? GRAU_META[g.grau as keyof typeof GRAU_META] : "—"}</td>
                                <td style={{ padding: "9px 12px", fontSize: 12, fontWeight: 600 }}>{bemDesc}</td>
                                <td style={{ padding: "9px 12px", textAlign: "center", fontSize: 11, color: "#555" }}>{g.tipo_bem ? TIPO_BEM_META[g.tipo_bem] : "—"}</td>
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
              {abaModal === "centrocusto" && (!contratoModal ? <AbaDisabled nome="Centro de Custo" /> : (
                <div>
                  <div style={{ marginBottom: 10, fontSize: 12, color: "#555" }}>Defina como o valor captado é rateado entre centros de custo / safras (deve totalizar 100%).</div>
                  <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 12 }}>
                    <thead><tr style={{ background: "#F3F6F9" }}>{["Centro de Custo / Safra", "%", "Valor (R$)", ""].map((h, i) => <th key={i} style={{ padding: "7px 12px", textAlign: i === 0 ? "left" : "center", fontSize: 11, fontWeight: 600, color: "#555", borderBottom: "0.5px solid #D4DCE8" }}>{h}</th>)}</tr></thead>
                    <tbody>
                      {centrosForm.map((c, i) => (
                        <tr key={i} style={{ borderBottom: i < centrosForm.length - 1 ? "0.5px solid #DEE5EE" : "none" }}>
                          <td style={{ padding: "6px 8px" }}><input style={inp} placeholder="Ex: Soja 2026/27 — Talhão A" value={c.descricao} onChange={e => setCentrosForm(p => p.map((x, j) => j === i ? { ...x, descricao: e.target.value } : x))} /></td>
                          <td style={{ padding: "6px 8px", width: 80 }}><InputMonetario style={{ ...inp, textAlign: "center" }} value={c.percentual} onChange={v => { const pct = Number(v) || 0; setCentrosForm(p => p.map((x, j) => j === i ? { ...x, percentual: String(v), valor: fmtNum((pct / 100) * (contratoModal.valor_financiado_brl ?? contratoModal.valor_financiado), 2) } : x)); }} /></td>
                          <td style={{ padding: "6px 8px", width: 140 }}><InputMonetario style={inp} value={c.valor} onChange={v => setCentrosForm(p => p.map((x, j) => j === i ? { ...x, valor: String(v) } : x))} /></td>
                          <td style={{ padding: "6px 8px", width: 40 }}>{centrosForm.length > 1 && <button style={btnX} onClick={() => setCentrosForm(p => p.filter((_, j) => j !== i))}>✕</button>}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <button style={{ ...btnR, fontSize: 12 }} onClick={() => setCentrosForm(p => [...p, { descricao: "", percentual: "", valor: "" }])}>+ Adicionar linha</button>
                    <div style={{ fontSize: 12 }}>
                      Total: <strong style={{ color: Math.abs(centrosForm.reduce((s, c) => s + (parseFloat(c.percentual) || 0), 0) - 100) < 0.01 ? "#1A4870" : "#E24B4A" }}>{fmtNum(centrosForm.reduce((s, c) => s + (parseFloat(c.percentual) || 0), 0), 2)}%</strong>
                      {Math.abs(centrosForm.reduce((s, c) => s + (parseFloat(c.percentual) || 0), 0) - 100) >= 0.01 && <span style={{ color: "#E24B4A", marginLeft: 4 }}>⚠ deve ser 100%</span>}
                    </div>
                  </div>
                  <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 14 }}>
                    <button style={{ ...btnV, opacity: salvando ? 0.5 : 1 }} disabled={salvando} onClick={salvarCentroCusto}>Salvar Rateio</button>
                  </div>
                  {centrosCusto.length > 0 && <div style={{ marginTop: 14, fontSize: 11, color: "#555" }}>Último rateio salvo: {centrosCusto.map(c => `${c.descricao} (${fmtNum(c.percentual, 1)}%)`).join(" · ")}</div>}
                </div>
              ))}

              {/* ── Aditivos ── */}
              {abaModal === "aditivos" && (!contratoModal ? <AbaDisabled nome="Aditivos" /> : (() => {
                const TIPO_ADIT: Record<AditivoContrato["tipo"], { label: string; bg: string; cl: string }> = {
                  prorrogacao:     { label: "Prorrogação",        bg: "#D5E8F5", cl: "#0B2D50" },
                  renegociacao:    { label: "Renegociação",       bg: "#FBF3E0", cl: "#7A5400" },
                  capitalizacao:   { label: "Capitalização",      bg: "#FCF0F0", cl: "#7A1A1A" },
                  reducao_taxa:    { label: "Redução de Taxa",    bg: "#E8F5EB", cl: "#1A5C35" },
                  ampliacao_valor: { label: "Ampliação de Valor", bg: "#EDE9FB", cl: "#4B3B9B" },
                  outros:          { label: "Outros",             bg: "#F3F4F6", cl: "#555"    },
                };
                return (
                  <div>
                    <div style={{ background: "#FBF3E0", border: "0.5px solid #C9921B40", borderRadius: 8, padding: "10px 14px", marginBottom: 16, fontSize: 12, color: "#7A5400" }}>
                      Registre alterações formais: prorrogações, renegociações de taxa, capitalizações e outros termos aditados entre as partes.
                    </div>
                    <div style={{ background: "#F8F9FB", border: "0.5px solid #D4DCE8", borderRadius: 10, padding: 16, marginBottom: 18 }}>
                      <SecTitle>Novo Aditivo</SecTitle>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 2fr", gap: 10, marginBottom: 10 }}>
                        <div><label style={lbl}>Data do Aditivo *</label><input style={inp} type="date" value={fAdit.data_aditivo} onChange={e => setFAdit(p => ({ ...p, data_aditivo: e.target.value }))} /></div>
                        <div><label style={lbl}>Tipo *</label><select style={inp} value={fAdit.tipo} onChange={e => setFAdit(p => ({ ...p, tipo: e.target.value as AditivoContrato["tipo"] }))}>{Object.entries(TIPO_ADIT).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select></div>
                        <div><label style={lbl}>Descrição / Motivo *</label><input style={inp} placeholder="Motivo ou cláusula alterada" value={fAdit.descricao} onChange={e => setFAdit(p => ({ ...p, descricao: e.target.value }))} /></div>
                      </div>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr 1fr", gap: 10, marginBottom: 10 }}>
                        <div><label style={lbl}>Nova Data Vencimento</label><input style={inp} type="date" value={fAdit.nova_data_vencimento} onChange={e => setFAdit(p => ({ ...p, nova_data_vencimento: e.target.value }))} /></div>
                        <div><label style={lbl}>Nova Taxa a.a. (%)</label><InputMonetario style={inp} value={fAdit.nova_taxa_aa} onChange={v => { const aa = Number(v) || 0; setFAdit(p => ({ ...p, nova_taxa_aa: String(v), nova_taxa_am: aa === 0 ? "" : fmtNum(aaParaAm(aa), 4) })); }} /></div>
                        <div><label style={lbl}>Nova Taxa a.m. (%)</label><input style={inp} type="number" step="0.0001" value={fAdit.nova_taxa_am} onChange={e => setFAdit(p => ({ ...p, nova_taxa_am: e.target.value }))} /></div>
                        <div><label style={lbl}>Novo Valor Financiado</label><InputMonetario style={inp} value={fAdit.novo_valor_financiado} onChange={v => setFAdit(p => ({ ...p, novo_valor_financiado: String(v) }))} /></div>
                        <div><label style={lbl}>Novas Parcelas</label><input style={inp} type="number" step="1" value={fAdit.novo_num_parcelas} onChange={e => setFAdit(p => ({ ...p, novo_num_parcelas: e.target.value }))} /></div>
                      </div>
                      <div style={{ marginBottom: 12 }}><label style={lbl}>Observações adicionais</label><textarea style={{ ...inp, height: 52, resize: "vertical" } as React.CSSProperties} value={fAdit.obs} onChange={e => setFAdit(p => ({ ...p, obs: e.target.value }))} /></div>
                      <div style={{ display: "flex", justifyContent: "flex-end" }}>
                        <button style={{ ...btnR, marginRight: 8 }} onClick={() => setFAdit({ ...FA_VAZIO })}>Limpar</button>
                        <button style={{ ...btnV, opacity: salvando || !fAdit.data_aditivo || !fAdit.descricao.trim() ? 0.5 : 1 }} disabled={salvando || !fAdit.data_aditivo || !fAdit.descricao.trim()} onClick={salvarAditivo}>Registrar Aditivo</button>
                      </div>
                    </div>
                    {aditivos.length === 0 ? (
                      <div style={{ textAlign: "center", padding: "28px 0", color: "#888", fontSize: 12 }}>Nenhum aditivo registrado.</div>
                    ) : (
                      <table style={{ width: "100%", borderCollapse: "collapse" }}>
                        <thead><tr style={{ background: "#F3F6F9" }}>{["Data", "Tipo", "Descrição", "Novos Termos", ""].map((h, i) => <th key={i} style={{ padding: "7px 10px", textAlign: "left", fontSize: 11, fontWeight: 600, color: "#555", borderBottom: "0.5px solid #D4DCE8" }}>{h}</th>)}</tr></thead>
                        <tbody>
                          {aditivos.map((a, i) => {
                            const meta = TIPO_ADIT[a.tipo];
                            const termos: string[] = [];
                            if (a.nova_data_vencimento) termos.push(`Venc. → ${fmtData(a.nova_data_vencimento)}`);
                            if (a.nova_taxa_aa) termos.push(`Taxa → ${fmtNum(a.nova_taxa_aa, 4)}% a.a.`);
                            if (a.novo_valor_financiado) termos.push(`Valor → ${fmtBRL(a.novo_valor_financiado)}`);
                            if (a.novo_num_parcelas) termos.push(`Parcelas → ${a.novo_num_parcelas}x`);
                            return (
                              <tr key={a.id} style={{ borderBottom: i < aditivos.length - 1 ? "0.5px solid #DEE5EE" : "none", background: i % 2 === 0 ? "#fff" : "#FAFBFC" }}>
                                <td style={{ padding: "8px 10px", fontSize: 12, whiteSpace: "nowrap" }}>{fmtData(a.data_aditivo)}</td>
                                <td style={{ padding: "8px 10px" }}><span style={{ fontSize: 10, background: meta.bg, color: meta.cl, padding: "2px 8px", borderRadius: 8, fontWeight: 600 }}>{meta.label}</span></td>
                                <td style={{ padding: "8px 10px", fontSize: 12 }}><div>{a.descricao}</div>{a.obs && <div style={{ fontSize: 11, color: "#888", marginTop: 2 }}>{a.obs}</div>}</td>
                                <td style={{ padding: "8px 10px", fontSize: 11, color: "#555" }}>{termos.length > 0 ? termos.map((t, ti) => <div key={ti}>{t}</div>) : <span style={{ color: "#bbb" }}>—</span>}</td>
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
                      <div style={{ textAlign: "center", padding: "48px 0", color: "#888", fontSize: 12 }}>Nenhuma movimentação. Registre uma liberação ou gere o plano de pagamento.</div>
                    ) : (
                      <table style={{ width: "100%", borderCollapse: "collapse" }}>
                        <thead>
                          <tr style={{ background: "#F3F6F9" }}>
                            {["Data", "Evento", "Amortização", "Juros", "Acessórios", "Valor", "Saldo Devedor", "Status"].map((h, i) => (
                              <th key={i} style={{ padding: "7px 8px", textAlign: i >= 2 ? "right" : "left", fontSize: 11, fontWeight: 600, color: "#555", borderBottom: "0.5px solid #D4DCE8" }}>{h}</th>
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
                              carencia: { label: "Carência", bg: "#D5E8F5", cl: "#0B2D50" },
                            };
                            const sm = m.status ? (statusMeta[m.status] ?? statusMeta.pendente) : null;
                            return (
                              <tr key={i} style={{ borderBottom: i < movs.length - 1 ? "0.5px solid #DEE5EE" : "none", background: i % 2 === 0 ? "#fff" : "#FAFBFC" }}>
                                <td style={{ padding: "7px 8px", fontSize: 12, whiteSpace: "nowrap" }}>{fmtData(m.data)}</td>
                                <td style={{ padding: "7px 8px", fontSize: 12 }}>
                                  <span style={{ fontSize: 10, background: isLib ? "#D5E8F5" : "#F3F4F6", color: isLib ? "#0B2D50" : "#333", padding: "2px 7px", borderRadius: 8, fontWeight: 600, marginRight: 6 }}>{isLib ? "Lib" : "Pag"}</span>
                                  {m.label}
                                </td>
                                <td style={{ padding: "7px 8px", fontSize: 12, textAlign: "right" }}>{m.amortizacao > 0 ? fmtBRL(m.amortizacao) : "—"}</td>
                                <td style={{ padding: "7px 8px", fontSize: 12, textAlign: "right", color: m.juros > 0 ? "#C9921B" : "#bbb" }}>{m.juros > 0 ? fmtBRL(m.juros) : "—"}</td>
                                <td style={{ padding: "7px 8px", fontSize: 12, textAlign: "right" }}>{m.acessorios > 0 ? fmtBRL(m.acessorios) : "—"}</td>
                                <td style={{ padding: "7px 8px", fontSize: 13, textAlign: "right", fontWeight: 600, color: isLib ? "#1A4870" : "#1A1A1A" }}>{fmtBRL(m.valor)}</td>
                                <td style={{ padding: "7px 8px", fontSize: 12, textAlign: "right", color: "#555" }}>{fmtBRL(Math.max(0, m.saldo))}</td>
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
    </div>
  );
}
