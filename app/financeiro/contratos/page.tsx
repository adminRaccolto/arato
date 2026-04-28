"use client";
import { useState, useEffect } from "react";
import TopNav from "../../../components/TopNav";
import {
  listarContratosFinanceiros, criarContratoFinanceiro, atualizarContratoFinanceiro, excluirContratoFinanceiro,
  listarParcelasLiberacao, criarParcelaLiberacao, excluirParcelaLiberacao,
  listarParcelasPagamento, salvarParcelasPagamento, baixarParcelaPagamento,
  listarGarantias, criarGarantia, excluirGarantia,
  listarCentrosCusto, salvarCentrosCusto,
  listarMatriculas,
  listarContas,
} from "../../../lib/db";
import { supabase } from "../../../lib/supabase";
import { useAuth } from "../../../components/AuthProvider";
import type {
  ContratoFinanceiro, ParcelaLiberacao, ParcelaPagamento,
  GarantiaContrato, CentroCustoContrato, MatriculaImovel,
  ContaBancaria, Pessoa,
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

// Converte taxa a.a. em a.m.: (1 + aa/100)^(1/12) - 1
function aaParaAm(aa: number) { return (Math.pow(1 + aa / 100, 1 / 12) - 1) * 100; }
function amParaAa(am: number) { return (Math.pow(1 + am / 100, 12) - 1) * 100; }

function badge(t: string, bg = "#D5E8F5", color = "#0B2D50") {
  return <span style={{ fontSize: 10, background: bg, color, padding: "2px 7px", borderRadius: 8, fontWeight: 600 }}>{t}</span>;
}

function SecTitle({ children }: { children: React.ReactNode }) {
  return <div style={secTit}>{children}</div>;
}

function Modal({ titulo, subtitulo, width, onClose, children }: { titulo: string; subtitulo?: string; width?: number; onClose: () => void; children: React.ReactNode }) {
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 120 }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ background: "#fff", borderRadius: 14, padding: 26, width: width ?? 660, maxWidth: "96vw", maxHeight: "94vh", overflowY: "auto" }}>
        <div style={{ fontWeight: 600, fontSize: 15, color: "#1a1a1a", marginBottom: subtitulo ? 2 : 18 }}>{titulo}</div>
        {subtitulo && <div style={{ fontSize: 12, color: "#555", marginBottom: 18 }}>{subtitulo}</div>}
        {children}
      </div>
    </div>
  );
}

// ── Tipos auxiliares ──────────────────────────────────────
type ParcelaBase = Omit<ParcelaPagamento, "id"|"created_at"|"contrato_id"|"fazenda_id"|"lancamento_id"|"status">;
type CarenciaTipo = "so_juros" | "total";

// Aplica período de carência, retornando saldo final e parcelas de carência
function aplicarCarencia(saldo: number, taxaMensal: number, carencia: number, carenciaTipo: CarenciaTipo): { saldoFinal: number; parcelas: ParcelaBase[] } {
  const parcelas: ParcelaBase[] = [];
  let s = saldo;
  for (let i = 1; i <= carencia; i++) {
    if (carenciaTipo === "total") {
      // juros capitalizam — sem pagamento
      s = s * (1 + taxaMensal);
      parcelas.push({ num_parcela: i, data_vencimento: "", amortizacao: 0, juros: 0, despesas_acessorios: 0, valor_parcela: 0, saldo_devedor: s });
    } else {
      // só juros — paga os juros, saldo não cai
      const juros = s * taxaMensal;
      parcelas.push({ num_parcela: i, data_vencimento: "", amortizacao: 0, juros, despesas_acessorios: 0, valor_parcela: juros, saldo_devedor: s });
    }
  }
  return { saldoFinal: s, parcelas };
}

// ── Cálculo SAC ───────────────────────────────────────────
function calcularSAC(principal: number, taxaMensal: number, nParcelas: number, carencia: number, carenciaTipo: CarenciaTipo = "so_juros"): ParcelaBase[] {
  const { saldoFinal, parcelas } = aplicarCarencia(principal, taxaMensal, carencia, carenciaTipo);
  let saldo = saldoFinal;
  const amort = saldo / nParcelas;
  for (let i = 1; i <= nParcelas; i++) {
    const juros = saldo * taxaMensal;
    const vp = amort + juros;
    saldo -= amort;
    parcelas.push({ num_parcela: carencia + i, data_vencimento: "", amortizacao: amort, juros, despesas_acessorios: 0, valor_parcela: vp, saldo_devedor: Math.max(0, saldo) });
  }
  return parcelas;
}

// ── Cálculo PRICE ─────────────────────────────────────────
function calcularPRICE(principal: number, taxaMensal: number, nParcelas: number, carencia: number, carenciaTipo: CarenciaTipo = "so_juros"): ParcelaBase[] {
  const { saldoFinal, parcelas } = aplicarCarencia(principal, taxaMensal, carencia, carenciaTipo);
  let saldo = saldoFinal;
  const pmt = taxaMensal > 0
    ? saldo * taxaMensal / (1 - Math.pow(1 + taxaMensal, -nParcelas))
    : saldo / nParcelas;
  for (let i = 1; i <= nParcelas; i++) {
    const juros = saldo * taxaMensal;
    const amort = pmt - juros;
    saldo -= amort;
    parcelas.push({ num_parcela: carencia + i, data_vencimento: "", amortizacao: amort, juros, despesas_acessorios: 0, valor_parcela: pmt, saldo_devedor: Math.max(0, saldo) });
  }
  return parcelas;
}

// ── Cálculo Crescentes (parcelas crescem % por período) ───
// PMT₀ = Principal × (r − g) / (1 − ((1+g)/(1+r))ⁿ)  [g ≠ r]
// PMT₀ = Principal × (1+r) / n                         [g ≅ r]
function calcularCrescentes(principal: number, taxaMensal: number, nParcelas: number, crescimentoPct: number, carencia: number, carenciaTipo: CarenciaTipo = "so_juros"): ParcelaBase[] {
  const { saldoFinal, parcelas } = aplicarCarencia(principal, taxaMensal, carencia, carenciaTipo);
  let saldo = saldoFinal;
  const g = crescimentoPct / 100;
  const r = taxaMensal;
  let pmt0: number;
  if (Math.abs(g - r) < 0.000001) {
    pmt0 = saldo * (1 + r) / nParcelas;
  } else {
    pmt0 = saldo * (r - g) / (1 - Math.pow((1 + g) / (1 + r), nParcelas));
  }
  for (let i = 1; i <= nParcelas; i++) {
    const pmt = pmt0 * Math.pow(1 + g, i - 1);
    const juros = saldo * r;
    const amort = pmt - juros;
    saldo -= amort;
    parcelas.push({ num_parcela: carencia + i, data_vencimento: "", amortizacao: Math.max(0, amort), juros, despesas_acessorios: 0, valor_parcela: pmt, saldo_devedor: Math.max(0, saldo) });
  }
  return parcelas;
}

function aplicarDatas(
  parcelas: Omit<ParcelaPagamento, "id"|"created_at"|"contrato_id"|"fazenda_id"|"lancamento_id"|"status">[],
  dataPrimeiro: string,
  periodicidadeMeses: number,
): Omit<ParcelaPagamento, "id"|"created_at"|"contrato_id"|"fazenda_id"|"lancamento_id"|"status">[] {
  return parcelas.map((p, i) => {
    const d = new Date(dataPrimeiro + "T12:00:00");
    d.setMonth(d.getMonth() + i * periodicidadeMeses);
    return { ...p, data_vencimento: d.toISOString().slice(0, 10) };
  });
}

// ── Linhas de crédito rurais ──────────────────────────────
const LINHAS_CREDITO = [
  "PRONAF",
  "PRONAMP",
  "FCO Rural",
  "FNO Rural",
  "FNE Rural",
  "BNDES/ABC",
  "BNDES Finame",
  "PCA — Programa para Construção e Ampliação de Armazéns",
  "Custeio Livre (Recursos Próprios)",
  "Custeio SNCR",
  "CPR Física",
  "CPR Financeira",
  "EGF — Empréstimo do Governo Federal",
  "Crédito Rural Outros",
  "Financiamento Livre",
  "Outros",
];

// ── META de tipo / cor ────────────────────────────────────
const TIPO_META: Record<ContratoFinanceiro["tipo"], { label: string; bg: string; cl: string }> = {
  custeio:       { label: "Custeio",        bg: "#D5E8F5", cl: "#0B2D50" },
  investimento:  { label: "Investimento",   bg: "#E6F1FB", cl: "#0C447C" },
  securitizacao: { label: "Securitização",  bg: "#FBF0D8", cl: "#7A5A12" },
  cpr:           { label: "CPR",            bg: "#FAEEDA", cl: "#633806" },
  egf:           { label: "EGF",            bg: "#FBF3E0", cl: "#8B5E14" },
  outros:        { label: "Outros",         bg: "#F1EFE8", cl: "#555"    },
};

const STATUS_META: Record<ContratoFinanceiro["status"], { label: string; bg: string; cl: string }> = {
  ativo:     { label: "Ativo",     bg: "#D5E8F5", cl: "#0B2D50" },
  quitado:   { label: "Quitado",   bg: "#F1EFE8", cl: "#555"    },
  cancelado: { label: "Cancelado", bg: "#FCEBEB", cl: "#791F1F" },
};

// ── Estado inicial do form contrato ──────────────────────
const FC_VAZIO = {
  descricao: "", pessoa_id: "", credor: "",
  tipo: "custeio" as ContratoFinanceiro["tipo"],
  tipo_calculo: "sac" as ContratoFinanceiro["tipo_calculo"],
  linha_credito: "",
  moeda: "BRL" as "BRL" | "USD",
  valor_financiado: "", valor_cotacao: "",
  data_contrato: "", numero_documento: "",
  taxa_juros_aa: "", taxa_juros_am: "",
  iof_pct: "", tac_valor: "", outros_custos: "",
  conta_liberacao_id: "", conta_pagamento_id: "",
  forma_pagamento: "", local_pagamento: "",
  carencia_meses: "0",
  periodicidade_meses: "1",
  carencia_tipo: "so_juros" as "so_juros" | "total",
  crescimento_pct: "",
  rateio_por_vencimento: false, fiscal: true, observacao: "",
};

// ────────────────────────────────────────────────────────
// PÁGINA
// ────────────────────────────────────────────────────────
export default function ContratosFinanceiros() {
  const { fazendaId } = useAuth();
  const [contratos, setContratos]   = useState<ContratoFinanceiro[]>([]);
  const [contas, setContas]         = useState<ContaBancaria[]>([]);
  const [pessoas, setPessoas]       = useState<Pessoa[]>([]);
  const [salvando, setSalvando]     = useState(false);
  const [erro, setErro]             = useState<string | null>(null);

  // modal contrato (criar/editar)
  const [modalContrato, setModalContrato] = useState(false);
  const [editContrato, setEditContrato]   = useState<ContratoFinanceiro | null>(null);
  const [fC, setFC] = useState({ ...FC_VAZIO });

  // modal detalhe (abas internas)
  const [detalhe, setDetalhe] = useState<ContratoFinanceiro | null>(null);
  const [abaDetalhe, setAbaDetalhe] = useState<"liberacao" | "pagamento" | "garantias" | "centrocusto">("liberacao");

  // dados das abas do detalhe
  const [parcelasLiberacao, setParcelasLiberacao] = useState<ParcelaLiberacao[]>([]);
  const [parcelasPagamento, setParcelasPagamento] = useState<ParcelaPagamento[]>([]);
  const [garantias, setGarantias]                 = useState<GarantiaContrato[]>([]);
  const [centrosCusto, setCentrosCusto]           = useState<CentroCustoContrato[]>([]);
  const [matriculas, setMatriculas]               = useState<MatriculaImovel[]>([]);

  // forms das abas
  const [fLib, setFLib] = useState({ data_liberacao: "", valor_liberado: "", parcelas_liberacao: "1" });
  const [fGar, setFGar] = useState({ descricao: "", matricula_id: "", valor_avaliacao: "" });
  const [centrosForm, setCentrosForm] = useState<{ descricao: string; percentual: string; valor: string }[]>([{ descricao: "", percentual: "100", valor: "" }]);
  const [fCalc, setFCalc] = useState({ nParcelas: "12", taxaMensal: "1.5", dataPrimeiro: "", periodicidade: "1", acessorios: "0" });

  // ── Carregar dados base ──
  useEffect(() => {
    if (!fazendaId) return;
    listarContratosFinanceiros(fazendaId).then(setContratos).catch(e => setErro(e.message));
    listarContas(fazendaId).then(c => setContas(c.filter(x => x.ativa))).catch(() => {});
    supabase.from("pessoas").select("*").eq("fazenda_id", fazendaId).eq("fornecedor", true).order("nome")
      .then(({ data }) => setPessoas(data ?? []));
  }, [fazendaId]);

  // ── Carregar dados do detalhe ao mudar aba ──
  useEffect(() => {
    if (!detalhe) return;
    if (abaDetalhe === "liberacao")  listarParcelasLiberacao(detalhe.id).then(setParcelasLiberacao).catch(() => {});
    if (abaDetalhe === "pagamento")  listarParcelasPagamento(detalhe.id).then(setParcelasPagamento).catch(() => {});
    if (abaDetalhe === "garantias") {
      listarGarantias(detalhe.id).then(setGarantias).catch(() => {});
      listarMatriculas(fazendaId!).then(setMatriculas).catch(() => {});
    }
    if (abaDetalhe === "centrocusto") listarCentrosCusto(detalhe.id).then(cc => {
      setCentrosCusto(cc);
      setCentrosForm(cc.length > 0 ? cc.map(c => ({ descricao: c.descricao, percentual: String(c.percentual), valor: String(c.valor) })) : [{ descricao: "", percentual: "100", valor: "" }]);
    }).catch(() => {});
  }, [detalhe, abaDetalhe, fazendaId]);

  async function salvar(fn: () => Promise<void>) {
    try { setSalvando(true); await fn(); } catch (e) { alert((e as {message?:string})?.message || JSON.stringify(e)); } finally { setSalvando(false); }
  }

  // ── Auto-preenchimento de taxa ──
  const onChangeAa = (v: string) => {
    const aa = parseFloat(v.replace(",", "."));
    setFC(p => ({
      ...p,
      taxa_juros_aa: v,
      taxa_juros_am: isNaN(aa) ? "" : fmtNum(aaParaAm(aa), 4),
    }));
  };
  const onChangeAm = (v: string) => {
    const am = parseFloat(v.replace(",", "."));
    setFC(p => ({
      ...p,
      taxa_juros_am: v,
      taxa_juros_aa: isNaN(am) ? "" : fmtNum(amParaAa(am), 4),
    }));
  };

  // ── Sync credor quando pessoa selecionada ──
  const onPessoaChange = (id: string) => {
    const p = pessoas.find(x => x.id === id);
    setFC(prev => ({ ...prev, pessoa_id: id, credor: p ? p.nome : prev.credor }));
  };

  // ── Abrir modal contrato ──
  const abrirModalContrato = (c?: ContratoFinanceiro) => {
    setEditContrato(c ?? null);
    setFC(c ? {
      descricao: c.descricao,
      pessoa_id: c.pessoa_id ?? "",
      credor: c.credor,
      tipo: c.tipo,
      tipo_calculo: c.tipo_calculo,
      linha_credito: c.linha_credito ?? "",
      moeda: c.moeda,
      valor_financiado: String(c.valor_financiado),
      valor_cotacao: String(c.valor_cotacao ?? ""),
      data_contrato: c.data_contrato,
      numero_documento: c.numero_documento ?? "",
      taxa_juros_aa: c.taxa_juros_aa ? fmtNum(c.taxa_juros_aa, 4) : "",
      taxa_juros_am: c.taxa_juros_am ? fmtNum(c.taxa_juros_am, 4) : "",
      iof_pct: c.iof_pct ? String(c.iof_pct) : "",
      tac_valor: c.tac_valor ? String(c.tac_valor) : "",
      outros_custos: c.outros_custos ? String(c.outros_custos) : "",
      conta_liberacao_id: c.conta_liberacao_id ?? "",
      conta_pagamento_id: c.conta_pagamento_id ?? "",
      forma_pagamento: c.forma_pagamento ?? "",
      local_pagamento: c.local_pagamento ?? "",
      observacao: c.observacao ?? "",
      carencia_meses: String(c.carencia_meses ?? 0),
      periodicidade_meses: String(c.periodicidade_meses ?? 1),
      carencia_tipo: (c.carencia_tipo ?? "so_juros") as "so_juros" | "total",
      crescimento_pct: c.crescimento_pct ? String(c.crescimento_pct) : "",
      rateio_por_vencimento: c.rateio_por_vencimento,
      fiscal: c.fiscal,
    } : { ...FC_VAZIO });
    setModalContrato(true);
  };

  const salvarContrato = () => salvar(async () => {
    if (!fC.descricao.trim() || !fC.data_contrato || !fC.valor_financiado) return;
    const credorNome = fC.pessoa_id
      ? (pessoas.find(p => p.id === fC.pessoa_id)?.nome ?? fC.credor)
      : fC.credor.trim();
    if (!credorNome) { alert("Informe o credor."); return; }

    const vf = parseFloat(fC.valor_financiado.replace(",", ".")) || 0;
    const vc = fC.valor_cotacao ? parseFloat(fC.valor_cotacao.replace(",", ".")) : undefined;
    const payload: Omit<ContratoFinanceiro, "id" | "created_at"> = {
      fazenda_id: fazendaId!,
      descricao: fC.descricao.trim(),
      pessoa_id: fC.pessoa_id || undefined,
      credor: credorNome,
      tipo: fC.tipo,
      tipo_calculo: fC.tipo_calculo,
      linha_credito: fC.linha_credito || undefined,
      moeda: fC.moeda,
      valor_financiado: vf,
      valor_cotacao: vc,
      valor_financiado_brl: fC.moeda === "USD" && vc ? vf * vc : vf,
      data_contrato: fC.data_contrato,
      numero_documento: fC.numero_documento || undefined,
      taxa_juros_aa: fC.taxa_juros_aa ? parseFloat(fC.taxa_juros_aa.replace(",", ".")) : undefined,
      taxa_juros_am: fC.taxa_juros_am ? parseFloat(fC.taxa_juros_am.replace(",", ".")) : undefined,
      iof_pct: fC.iof_pct ? parseFloat(fC.iof_pct.replace(",", ".")) : undefined,
      tac_valor: fC.tac_valor ? parseFloat(fC.tac_valor.replace(",", ".")) : undefined,
      outros_custos: fC.outros_custos ? parseFloat(fC.outros_custos.replace(",", ".")) : undefined,
      conta_liberacao_id: fC.conta_liberacao_id || undefined,
      conta_pagamento_id: fC.conta_pagamento_id || undefined,
      forma_pagamento: fC.forma_pagamento || undefined,
      local_pagamento: fC.local_pagamento || undefined,
      observacao: fC.observacao || undefined,
      carencia_meses: Number(fC.carencia_meses) || 0,
      periodicidade_meses: Number(fC.periodicidade_meses) || 1,
      carencia_tipo: fC.carencia_tipo,
      crescimento_pct: fC.crescimento_pct ? parseFloat(fC.crescimento_pct.replace(",", ".")) : undefined,
      rateio_por_vencimento: fC.rateio_por_vencimento,
      fiscal: fC.fiscal,
      status: "ativo",
    };
    if (editContrato) {
      await atualizarContratoFinanceiro(editContrato.id, payload);
      setContratos(p => p.map(x => x.id === editContrato.id ? { ...x, ...payload } : x));
    } else {
      const novo = await criarContratoFinanceiro(payload);
      setContratos(p => [novo, ...p]);
    }
    setModalContrato(false);
  });

  // ── Abrir detalhe ──
  const abrirDetalhe = (c: ContratoFinanceiro) => {
    setDetalhe(c);
    setAbaDetalhe("liberacao");
    setFLib({ data_liberacao: "", valor_liberado: "", parcelas_liberacao: "1" });
    setFGar({ descricao: "", matricula_id: "", valor_avaliacao: "" });
    // pre-fill taxa e periodicidade do contrato na calculadora
    setFCalc({ nParcelas: "12", taxaMensal: c.taxa_juros_am ? fmtNum(c.taxa_juros_am, 4) : "1.5", dataPrimeiro: "", periodicidade: String(c.periodicidade_meses ?? 1), acessorios: "0" });
  };

  // ── Liberação ──
  const salvarLiberacao = () => salvar(async () => {
    if (!detalhe || !fLib.data_liberacao || !fLib.valor_liberado) return;
    const vl = parseFloat(fLib.valor_liberado.replace(",", ".")) || 0;
    const nParcelas = Math.max(1, Number(fLib.parcelas_liberacao) || 1);
    for (let i = 1; i <= nParcelas; i++) {
      const d = new Date(fLib.data_liberacao + "T12:00:00");
      d.setMonth(d.getMonth() + (i - 1));
      const nova = await criarParcelaLiberacao({
        contrato_id: detalhe.id, fazenda_id: fazendaId!,
        num_parcela: (parcelasLiberacao.length + i),
        data_liberacao: d.toISOString().slice(0, 10),
        valor_liberado: vl,
        valor_liberado_brl: detalhe.moeda === "USD" && detalhe.valor_cotacao ? vl * detalhe.valor_cotacao : vl,
      }, detalhe);
      setParcelasLiberacao(p => [...p, nova]);
    }
    setFLib({ data_liberacao: "", valor_liberado: "", parcelas_liberacao: "1" });
  });

  // ── Calcular parcelas de pagamento ──
  const calcularParcelas = () => salvar(async () => {
    if (!detalhe || !fCalc.dataPrimeiro) return;
    const n          = Math.max(1, Number(fCalc.nParcelas) || 12);
    const i          = (Number(fCalc.taxaMensal) || 0) / 100;
    const car        = Number(detalhe.carencia_meses ?? 0);
    const carTipo    = (detalhe.carencia_tipo ?? "so_juros") as CarenciaTipo;
    const crescPct   = detalhe.crescimento_pct ?? 0;
    const period     = Number(fCalc.periodicidade) || (detalhe.periodicidade_meses ?? 1);
    const acessMensal = parseFloat(fCalc.acessorios.replace(",", ".")) || 0;

    let base: ParcelaBase[];
    if (crescPct > 0) {
      base = calcularCrescentes(detalhe.valor_financiado, i, n, crescPct, car, carTipo);
    } else if (detalhe.tipo_calculo === "sac") {
      base = calcularSAC(detalhe.valor_financiado, i, n, car, carTipo);
    } else {
      base = calcularPRICE(detalhe.valor_financiado, i, n, car, carTipo);
    }

    base = base.map(p => ({ ...p, despesas_acessorios: p.valor_parcela > 0 ? acessMensal : 0, valor_parcela: p.valor_parcela > 0 ? p.valor_parcela + acessMensal : 0 }));
    const comDatas = aplicarDatas(base, fCalc.dataPrimeiro, period);

    const salvas = await salvarParcelasPagamento(
      detalhe.id, fazendaId!,
      comDatas.map(p => ({ ...p, status: "em_aberto" as const }))
    );
    setParcelasPagamento(salvas);
  });

  // ── Garantia ──
  const salvarGarantia = () => salvar(async () => {
    if (!detalhe || !fGar.descricao.trim()) return;
    const nova = await criarGarantia({
      contrato_id: detalhe.id, fazenda_id: fazendaId!,
      descricao: fGar.descricao.trim(),
      matricula_id: fGar.matricula_id || undefined,
      valor_avaliacao: fGar.valor_avaliacao ? Number(fGar.valor_avaliacao.replace(",", ".")) : undefined,
    });
    setGarantias(p => [...p, nova]);
    setFGar({ descricao: "", matricula_id: "", valor_avaliacao: "" });
  });

  // ── Centro de custo ──
  const salvarCentroCusto = () => salvar(async () => {
    if (!detalhe) return;
    const itens: Omit<CentroCustoContrato, "id" | "created_at">[] = centrosForm
      .filter(c => c.descricao.trim())
      .map(c => ({
        contrato_id: detalhe.id,
        descricao: c.descricao.trim(),
        percentual: parseFloat(c.percentual.replace(",", ".")) || 0,
        valor: parseFloat(c.valor.replace(",", ".")) || 0,
      }));
    await salvarCentrosCusto(detalhe.id, itens);
    setCentrosCusto(await listarCentrosCusto(detalhe.id));
  });

  // ── Totais ──
  const totalFinanciado = contratos.filter(c => c.status === "ativo").reduce((s, c) => s + (c.valor_financiado_brl ?? c.valor_financiado), 0);
  const totalAtivos = contratos.filter(c => c.status === "ativo").length;

  // helper nome conta
  const nomeConta = (id?: string) => id ? (contas.find(c => c.id === id)?.nome ?? "—") : "—";

  // ────────────────────────────────────────────────────────
  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh", background: "#F3F6F9", fontFamily: "system-ui, sans-serif", fontSize: 13 }}>
      <TopNav />
      <main style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>

        <header style={{ background: "#fff", borderBottom: "0.5px solid #D4DCE8", padding: "10px 22px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 17, color: "#1a1a1a", fontWeight: 600 }}>Contratos Financeiros</h1>
            <p style={{ margin: 0, fontSize: 11, color: "#444" }}>Custeio, CPR, investimento, securitização, EGF</p>
          </div>
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            {totalAtivos > 0 && (
              <span style={{ fontSize: 12, color: "#555" }}>
                {totalAtivos} {totalAtivos === 1 ? "contrato ativo" : "contratos ativos"} ·{" "}
                <strong style={{ color: "#E24B4A" }}>{fmtBRL(totalFinanciado)}</strong>
              </span>
            )}
            <button style={btnV} onClick={() => abrirModalContrato()}>+ Novo Contrato</button>
          </div>
        </header>

        <div style={{ padding: "20px 22px", flex: 1, overflowY: "auto" }}>
          {erro && <div style={{ background: "#FCEBEB", borderRadius: 8, padding: "10px 14px", marginBottom: 14, fontSize: 12, color: "#791F1F" }}>⚠ {erro}</div>}

          {contratos.length === 0 ? (
            <div style={{ background: "#fff", border: "0.5px solid #D4DCE8", borderRadius: 12, padding: 48, textAlign: "center", color: "#444" }}>
              <div style={{ fontSize: 32, marginBottom: 10 }}>🏦</div>
              <div style={{ color: "#1a1a1a", fontWeight: 600, marginBottom: 4 }}>Nenhum contrato financeiro cadastrado</div>
              <div style={{ fontSize: 12 }}>Custeio bancário, CPR, Pronaf, financiamento de máquinas…</div>
            </div>
          ) : (
            <div style={{ background: "#fff", border: "0.5px solid #D4DCE8", borderRadius: 12, overflow: "hidden" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ background: "#F3F6F9" }}>
                    {["Contrato / Credor", "Tipo", "Linha de Crédito", "Cálculo", "Taxa a.a.", "Valor Financiado", "Data", "Status", ""].map((h, i) => (
                      <th key={i} style={{ padding: "8px 14px", textAlign: i === 0 ? "left" : "center", fontSize: 11, fontWeight: 600, color: "#555", borderBottom: "0.5px solid #D4DCE8" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {contratos.map((c, i) => {
                    const tm = TIPO_META[c.tipo];
                    const sm = STATUS_META[c.status];
                    return (
                      <tr key={c.id} style={{ borderBottom: i < contratos.length - 1 ? "0.5px solid #DEE5EE" : "none" }}>
                        <td style={{ padding: "10px 14px" }}>
                          <div style={{ color: "#1a1a1a", fontWeight: 600 }}>{c.descricao}</div>
                          <div style={{ fontSize: 11, color: "#555" }}>{c.credor}{c.numero_documento ? ` · Nº ${c.numero_documento}` : ""}</div>
                        </td>
                        <td style={{ padding: "10px 14px", textAlign: "center" }}>{badge(tm.label, tm.bg, tm.cl)}</td>
                        <td style={{ padding: "10px 14px", textAlign: "center", fontSize: 11, color: "#1a1a1a" }}>{c.linha_credito ?? "—"}</td>
                        <td style={{ padding: "10px 14px", textAlign: "center" }}>{badge(c.tipo_calculo.toUpperCase(), "#F1EFE8", "#555")}</td>
                        <td style={{ padding: "10px 14px", textAlign: "center", color: "#1a1a1a" }}>
                          {c.taxa_juros_aa ? `${fmtNum(c.taxa_juros_aa, 2)}% a.a.` : "—"}
                        </td>
                        <td style={{ padding: "10px 14px", textAlign: "center" }}>
                          <div style={{ color: "#1a1a1a", fontWeight: 600 }}>
                            {c.moeda === "USD" ? `US$ ${fmtNum(c.valor_financiado)}` : fmtBRL(c.valor_financiado)}
                          </div>
                          {c.moeda === "USD" && c.valor_financiado_brl && (
                            <div style={{ fontSize: 10, color: "#444" }}>≈ {fmtBRL(c.valor_financiado_brl)}</div>
                          )}
                        </td>
                        <td style={{ padding: "10px 14px", textAlign: "center", color: "#1a1a1a" }}>{fmtData(c.data_contrato)}</td>
                        <td style={{ padding: "10px 14px", textAlign: "center" }}>{badge(sm.label, sm.bg, sm.cl)}</td>
                        <td style={{ padding: "10px 14px", textAlign: "right" }}>
                          <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                            <button style={btnE} onClick={() => abrirDetalhe(c)}>Ver parcelas</button>
                            <button style={btnE} onClick={() => abrirModalContrato(c)}>Editar</button>
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

      {/* ══ Modal Contrato ══ */}
      {modalContrato && (
        <Modal titulo={editContrato ? "Editar Contrato" : "Novo Contrato Financeiro"} width={720} onClose={() => setModalContrato(false)}>

          {/* ── Seção: Identificação ── */}
          <SecTitle>Identificação</SecTitle>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
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
                <option value="sac">SAC — Amortização Constante (prestação decresce)</option>
                <option value="price">PRICE — Parcela Constante (PMT)</option>
                <option value="outros">Outros / Manual</option>
              </select>
            </div>
          </div>

          {/* ── Seção: Credor ── */}
          <SecTitle>Credor / Instituição Financeira</SecTitle>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            <div>
              <label style={lbl}>Credor (fornecedor cadastrado)</label>
              <select style={inp} value={fC.pessoa_id} onChange={e => onPessoaChange(e.target.value)}>
                <option value="">— Buscar em pessoas cadastradas —</option>
                {pessoas.map(p => <option key={p.id} value={p.id}>{p.nome}{p.cpf_cnpj ? ` — ${p.cpf_cnpj}` : ""}</option>)}
              </select>
            </div>
            <div>
              <label style={lbl}>Nome do Credor *{fC.pessoa_id ? " (preenchido pelo cadastro)" : ""}</label>
              <input style={inp} placeholder="Ex: Banco do Brasil, Bradesco, Cooperativa…" value={fC.credor} onChange={e => setFC(p => ({ ...p, credor: e.target.value }))} />
            </div>
          </div>

          {/* ── Seção: Valores e Moeda ── */}
          <SecTitle>Captação — Valor e Moeda</SecTitle>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 14 }}>
            <div>
              <label style={lbl}>Moeda</label>
              <select style={inp} value={fC.moeda} onChange={e => setFC(p => ({ ...p, moeda: e.target.value as "BRL" | "USD", valor_cotacao: "" }))}>
                <option value="BRL">Real (R$)</option>
                <option value="USD">Dólar (US$)</option>
              </select>
            </div>
            <div>
              <label style={lbl}>Valor Financiado * ({fC.moeda === "USD" ? "US$" : "R$"})</label>
              <input style={inp} type="number" step="0.01" placeholder="0,00" value={fC.valor_financiado} onChange={e => setFC(p => ({ ...p, valor_financiado: e.target.value }))} />
            </div>
            {fC.moeda === "USD" && (
              <div>
                <label style={lbl}>Cotação R$/US$</label>
                <input style={inp} type="number" step="0.01" placeholder="5,85" value={fC.valor_cotacao} onChange={e => setFC(p => ({ ...p, valor_cotacao: e.target.value }))} />
              </div>
            )}
            {fC.moeda === "USD" && fC.valor_financiado && fC.valor_cotacao && (
              <div style={{ display: "flex", flexDirection: "column", justifyContent: "flex-end" }}>
                <div style={{ background: "#F3F6F9", border: "0.5px solid #D4DCE8", borderRadius: 8, padding: "8px 10px", fontSize: 12 }}>
                  <div style={{ color: "#555", fontSize: 10, marginBottom: 2 }}>Equivalente em R$</div>
                  <strong style={{ color: "#1A4870" }}>
                    {fmtBRL((parseFloat(fC.valor_financiado) || 0) * (parseFloat(fC.valor_cotacao) || 0))}
                  </strong>
                </div>
              </div>
            )}
            <div>
              <label style={lbl}>Data do Contrato *</label>
              <input style={inp} type="date" value={fC.data_contrato} onChange={e => setFC(p => ({ ...p, data_contrato: e.target.value }))} />
            </div>
            <div>
              <label style={lbl}>Periodicidade dos Vencimentos</label>
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
                  <option value="so_juros">Só juros — paga juros durante a carência</option>
                  <option value="total">Carência total — juros capitalizam (sem pagamento)</option>
                </select>
              </div>
            )}
            <div>
              <label style={lbl}>Crescimento por Período (%)</label>
              <input style={inp} type="number" step="0.01" min="0" placeholder="0 = parcelas fixas (SAC/PRICE)" value={fC.crescimento_pct} onChange={e => setFC(p => ({ ...p, crescimento_pct: e.target.value }))} />
              {Number(fC.crescimento_pct) > 0 && (
                <div style={{ fontSize: 10, color: "#C9921B", marginTop: 3 }}>
                  ⚡ Parcelas crescentes — cada vencimento aumenta {fC.crescimento_pct}% em relação ao anterior
                </div>
              )}
            </div>
          </div>

          {/* ── Seção: Taxas e Custos ── */}
          <SecTitle>Taxas e Custos da Operação</SecTitle>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14 }}>
            <div>
              <label style={lbl}>Taxa de Juros a.a. (%)</label>
              <input style={inp} type="number" step="0.001" placeholder="Ex: 12,00" value={fC.taxa_juros_aa} onChange={e => onChangeAa(e.target.value)} />
            </div>
            <div>
              <label style={lbl}>Taxa de Juros a.m. (%)</label>
              <input style={inp} type="number" step="0.0001" placeholder="Calculado automaticamente" value={fC.taxa_juros_am} onChange={e => onChangeAm(e.target.value)} />
            </div>
            <div>
              <label style={lbl}>IOF (%)</label>
              <input style={inp} type="number" step="0.001" placeholder="Ex: 0,38" value={fC.iof_pct} onChange={e => setFC(p => ({ ...p, iof_pct: e.target.value }))} />
            </div>
            <div>
              <label style={lbl}>TAC — Tarifa de Abertura (R$)</label>
              <input style={inp} type="number" step="0.01" placeholder="Ex: 500,00" value={fC.tac_valor} onChange={e => setFC(p => ({ ...p, tac_valor: e.target.value }))} />
            </div>
            <div>
              <label style={lbl}>Outros Custos Fixos (R$)</label>
              <input style={inp} type="number" step="0.01" placeholder="Registro, cartório…" value={fC.outros_custos} onChange={e => setFC(p => ({ ...p, outros_custos: e.target.value }))} />
            </div>
            {/* Custo total da operação */}
            {(fC.iof_pct || fC.tac_valor || fC.outros_custos) && fC.valor_financiado && (
              <div style={{ display: "flex", flexDirection: "column", justifyContent: "flex-end" }}>
                <div style={{ background: "#FFF8EC", border: "0.5px solid #EF9F2750", borderRadius: 8, padding: "8px 10px", fontSize: 12 }}>
                  <div style={{ color: "#555", fontSize: 10, marginBottom: 2 }}>Custos fixos totais</div>
                  <strong style={{ color: "#EF9F27" }}>
                    {fmtBRL(
                      ((parseFloat(fC.iof_pct) || 0) / 100) * (parseFloat(fC.valor_financiado) || 0) +
                      (parseFloat(fC.tac_valor) || 0) +
                      (parseFloat(fC.outros_custos) || 0)
                    )}
                  </strong>
                </div>
              </div>
            )}
          </div>

          {/* ── Seção: Contas ── */}
          <SecTitle>Contas Bancárias</SecTitle>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            <div>
              <label style={lbl}>Conta de Liberação</label>
              <select style={inp} value={fC.conta_liberacao_id} onChange={e => {
                const id = e.target.value;
                const conta = contas.find(c => c.id === id);
                setFC(p => ({
                  ...p,
                  conta_liberacao_id: id,
                  // preenche credor automaticamente a partir do banco da conta, a menos que já esteja preenchido manualmente
                  credor: conta?.banco ? conta.banco : p.credor,
                }));
              }}>
                <option value="">— Onde o banco deposita o crédito —</option>
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

          {/* ── Seção: Opções ── */}
          <SecTitle>Opções</SecTitle>
          <div style={{ display: "flex", gap: 24, marginBottom: 6, flexWrap: "wrap" }}>
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
            <button style={btnR} onClick={() => setModalContrato(false)}>Cancelar</button>
            <button
              style={{ ...btnV, opacity: salvando || !fC.descricao.trim() || !fC.data_contrato || !fC.valor_financiado ? 0.5 : 1 }}
              disabled={salvando || !fC.descricao.trim() || !fC.data_contrato || !fC.valor_financiado}
              onClick={salvarContrato}
            >{salvando ? "Salvando…" : "Salvar"}</button>
          </div>
        </Modal>
      )}

      {/* ══ Modal Detalhe — Abas ══ */}
      {detalhe && (
        <Modal
          titulo={detalhe.descricao}
          subtitulo={`${detalhe.credor} · ${TIPO_META[detalhe.tipo].label}${detalhe.linha_credito ? ` / ${detalhe.linha_credito}` : ""} · ${detalhe.moeda === "USD" ? `US$ ${fmtNum(detalhe.valor_financiado)} (≈ ${fmtBRL(detalhe.valor_financiado_brl ?? detalhe.valor_financiado)})` : fmtBRL(detalhe.valor_financiado)}`}
          width={820}
          onClose={() => setDetalhe(null)}
        >
          {/* Abas */}
          <div style={{ display: "flex", borderBottom: "0.5px solid #D4DCE8", marginBottom: 20 }}>
            {([
              ["liberacao",   "Parcelas Liberação"],
              ["pagamento",   "Parcelas Pagamento"],
              ["garantias",   "Garantias"],
              ["centrocusto", "Centro de Custo"],
            ] as const).map(([k, l]) => (
              <button key={k} onClick={() => setAbaDetalhe(k)} style={{ padding: "9px 16px", border: "none", background: "transparent", cursor: "pointer", fontSize: 13, fontWeight: abaDetalhe === k ? 600 : 400, color: abaDetalhe === k ? "#1a1a1a" : "#555", borderBottom: abaDetalhe === k ? "2px solid #1A4870" : "2px solid transparent" }}>{l}</button>
            ))}
          </div>

          {/* ── Parcelas Liberação ── */}
          {abaDetalhe === "liberacao" && (
            <div>
              <div style={{ background: "#E4F0F9", border: "0.5px solid #1A487040", borderRadius: 8, padding: "10px 14px", marginBottom: 14, fontSize: 12, color: "#0B2D50" }}>
                ✦ Ao registrar uma liberação, um lançamento CR ({TIPO_META[detalhe.tipo].label === "CPR" ? "Captação de CPR" : `Captação de ${TIPO_META[detalhe.tipo].label}`}) é criado automaticamente no financeiro
                {detalhe.conta_liberacao_id ? ` · Conta: ${nomeConta(detalhe.conta_liberacao_id)}` : ""}.
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr auto", gap: 10, marginBottom: 16, alignItems: "end" }}>
                <div><label style={lbl}>Data Liberação</label><input style={inp} type="date" value={fLib.data_liberacao} onChange={e => setFLib(p => ({ ...p, data_liberacao: e.target.value }))} /></div>
                <div>
                  <label style={lbl}>Valor Liberado ({detalhe.moeda === "USD" ? "US$" : "R$"})</label>
                  <input style={inp} type="number" step="0.01" value={fLib.valor_liberado} onChange={e => setFLib(p => ({ ...p, valor_liberado: e.target.value }))} />
                </div>
                <div><label style={lbl}>Nº Parcelas</label><input style={inp} type="number" min="1" value={fLib.parcelas_liberacao} onChange={e => setFLib(p => ({ ...p, parcelas_liberacao: e.target.value }))} /></div>
                <button style={{ ...btnV, padding: "8px 14px" }} onClick={salvarLiberacao} disabled={salvando || !fLib.data_liberacao || !fLib.valor_liberado}>+ Adicionar</button>
              </div>
              {parcelasLiberacao.length === 0 ? (
                <div style={{ textAlign: "center", padding: "24px 0", color: "#444", fontSize: 12 }}>Nenhuma parcela de liberação registrada</div>
              ) : (
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead><tr style={{ background: "#F3F6F9" }}>{["Nº", "Data Liberação", detalhe.moeda === "USD" ? "Valor (US$)" : "Valor (R$)", detalhe.moeda === "USD" ? "Equiv. R$" : "", "Lançto.CR", ""].map((h, i) => h ? <th key={i} style={{ padding: "7px 12px", textAlign: "center", fontSize: 11, fontWeight: 600, color: "#555", borderBottom: "0.5px solid #D4DCE8" }}>{h}</th> : null)}</tr></thead>
                  <tbody>
                    {parcelasLiberacao.map((p, i) => (
                      <tr key={p.id} style={{ borderBottom: i < parcelasLiberacao.length - 1 ? "0.5px solid #DEE5EE" : "none" }}>
                        <td style={{ padding: "8px 12px", textAlign: "center", color: "#1a1a1a" }}>{p.num_parcela}</td>
                        <td style={{ padding: "8px 12px", textAlign: "center" }}>{fmtData(p.data_liberacao)}</td>
                        <td style={{ padding: "8px 12px", textAlign: "center", color: "#1a1a1a", fontWeight: 600 }}>{detalhe.moeda === "USD" ? `US$ ${fmtNum(p.valor_liberado)}` : fmtBRL(p.valor_liberado)}</td>
                        {detalhe.moeda === "USD" && <td style={{ padding: "8px 12px", textAlign: "center", color: "#1a1a1a" }}>{p.valor_liberado_brl ? fmtBRL(p.valor_liberado_brl) : "—"}</td>}
                        <td style={{ padding: "8px 12px", textAlign: "center" }}>{p.lancamento_id ? badge("✓ CR", "#D5E8F5", "#0B2D50") : badge("—", "#F1EFE8", "#555")}</td>
                        <td style={{ padding: "8px 12px", textAlign: "right" }}><button style={btnX} onClick={() => excluirParcelaLiberacao(p.id).then(() => setParcelasLiberacao(x => x.filter(r => r.id !== p.id)))}>✕</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              <div style={{ marginTop: 10, fontSize: 11, color: "#555", textAlign: "right" }}>
                Total liberado: <strong style={{ color: "#1a1a1a" }}>{fmtBRL(parcelasLiberacao.reduce((s, p) => s + (p.valor_liberado_brl ?? p.valor_liberado), 0))}</strong>
                {" · "}Saldo a liberar: <strong style={{ color: "#EF9F27" }}>{fmtBRL(Math.max(0, (detalhe.valor_financiado_brl ?? detalhe.valor_financiado) - parcelasLiberacao.reduce((s, p) => s + (p.valor_liberado_brl ?? p.valor_liberado), 0)))}</strong>
              </div>
            </div>
          )}

          {/* ── Parcelas Pagamento ── */}
          {abaDetalhe === "pagamento" && (
            <div>
              <div style={{ background: "#E4F0F9", border: "0.5px solid #1A487040", borderRadius: 8, padding: "10px 14px", marginBottom: 14, fontSize: 12, color: "#0B2D50" }}>
                ✦ Ao baixar cada parcela, lançamentos CP separados são criados automaticamente: <strong>Amortização → {TIPO_META[detalhe.tipo].label === "Custeio" ? "Pagamento de Custeio" : `Pagamento de ${TIPO_META[detalhe.tipo].label}`}</strong> e <strong>Juros → {detalhe.tipo === "custeio" ? "Juros de Custeio" : `Juros de ${TIPO_META[detalhe.tipo].label}`}</strong>
                {detalhe.conta_pagamento_id ? ` · Conta: ${nomeConta(detalhe.conta_pagamento_id)}` : ""}.
              </div>

              {/* Calculadora */}
              <div style={{ background: "#F3F6F9", border: "0.5px solid #D4DCE8", borderRadius: 10, padding: 14, marginBottom: 16 }}>
                <div style={{ fontSize: 12, color: "#1a1a1a", fontWeight: 600, marginBottom: 10 }}>
                  Calcular tabela — {detalhe.crescimento_pct && detalhe.crescimento_pct > 0
                    ? `Parcelas Crescentes (${fmtNum(detalhe.crescimento_pct, 2)}% por período)`
                    : detalhe.tipo_calculo.toUpperCase()}
                  {detalhe.carencia_meses && detalhe.carencia_meses > 0 && (
                    <span style={{ marginLeft: 8, fontWeight: 400, color: "#888", fontSize: 11 }}>
                      · Carência: {detalhe.carencia_meses} mês(es) — {detalhe.carencia_tipo === "total" ? "juros capitalizam" : "só juros"}
                    </span>
                  )}
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 10, alignItems: "end" }}>
                  <div><label style={lbl}>Nº Parcelas</label><input style={inp} type="number" min="1" value={fCalc.nParcelas} onChange={e => setFCalc(p => ({ ...p, nParcelas: e.target.value }))} /></div>
                  <div>
                    <label style={lbl}>Taxa a.m. (%)
                      {detalhe.taxa_juros_am && <span style={{ color: "#1A4870", marginLeft: 4 }}>contrato: {fmtNum(detalhe.taxa_juros_am, 4)}%</span>}
                    </label>
                    <input style={inp} type="number" step="0.0001" value={fCalc.taxaMensal} onChange={e => setFCalc(p => ({ ...p, taxaMensal: e.target.value }))} />
                  </div>
                  <div><label style={lbl}>Data 1º Pagto.</label><input style={inp} type="date" value={fCalc.dataPrimeiro} onChange={e => setFCalc(p => ({ ...p, dataPrimeiro: e.target.value }))} /></div>
                  <div>
                    <label style={lbl}>Periodicidade {detalhe.periodicidade_meses && detalhe.periodicidade_meses > 1 && <span style={{ color: "#C9921B" }}>(contrato: {detalhe.periodicidade_meses === 6 ? "semestral" : "anual"})</span>}</label>
                    <select style={inp} value={fCalc.periodicidade} onChange={e => setFCalc(p => ({ ...p, periodicidade: e.target.value }))}>
                      <option value="1">Mensal</option>
                      <option value="3">Trimestral</option>
                      <option value="6">Semestral</option>
                      <option value="12">Anual</option>
                    </select>
                  </div>
                  <div><label style={lbl}>Acessórios/parc. (R$)</label><input style={inp} type="number" step="0.01" value={fCalc.acessorios} onChange={e => setFCalc(p => ({ ...p, acessorios: e.target.value }))} /></div>
                </div>
                <div style={{ marginTop: 10, display: "flex", justifyContent: "flex-end" }}>
                  <button style={{ ...btnV, background: "#C9921B" }} onClick={calcularParcelas} disabled={salvando || !fCalc.dataPrimeiro}>
                    {salvando ? "Calculando…" : "⟳ Calcular e Salvar Parcelas"}
                  </button>
                </div>
              </div>

              {parcelasPagamento.length === 0 ? (
                <div style={{ textAlign: "center", padding: "24px 0", color: "#444", fontSize: 12 }}>Preencha a calculadora acima para gerar a tabela de parcelas</div>
              ) : (
                <>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                    <thead><tr style={{ background: "#F3F6F9" }}>
                      {["Nº", "Vencimento", "Amortização", "Juros", "Encargos", "Valor Parcela", "Saldo Devedor", "Status"].map((h, i) => (
                        <th key={i} style={{ padding: "7px 10px", textAlign: i === 0 ? "center" : "right", fontSize: 11, fontWeight: 600, color: "#555", borderBottom: "0.5px solid #D4DCE8", whiteSpace: "nowrap" }}>{h}</th>
                      ))}
                    </tr></thead>
                    <tbody>
                      {parcelasPagamento.map((p, i) => {
                        const corSt = p.status === "pago" ? "#1A4870" : p.status === "vencido" ? "#E24B4A" : "#555";
                        return (
                          <tr key={p.id} style={{ borderBottom: i < parcelasPagamento.length - 1 ? "0.5px solid #DEE5EE" : "none", background: p.status === "pago" ? "#E4F0F9" : "transparent" }}>
                            <td style={{ padding: "7px 10px", textAlign: "center", color: "#1a1a1a" }}>{p.num_parcela}</td>
                            <td style={{ padding: "7px 10px", textAlign: "right" }}>{fmtData(p.data_vencimento)}</td>
                            <td style={{ padding: "7px 10px", textAlign: "right", color: "#1a1a1a" }}>{fmtBRL(p.amortizacao)}</td>
                            <td style={{ padding: "7px 10px", textAlign: "right", color: "#E24B4A" }}>{fmtBRL(p.juros)}</td>
                            <td style={{ padding: "7px 10px", textAlign: "right", color: "#1a1a1a" }}>{fmtBRL(p.despesas_acessorios)}</td>
                            <td style={{ padding: "7px 10px", textAlign: "right", color: "#1a1a1a", fontWeight: 600 }}>{fmtBRL(p.valor_parcela)}</td>
                            <td style={{ padding: "7px 10px", textAlign: "right", color: "#1a1a1a" }}>{fmtBRL(p.saldo_devedor)}</td>
                            <td style={{ padding: "7px 10px", textAlign: "center" }}>
                              <span style={{ fontSize: 10, fontWeight: 600, color: corSt }}>{p.status === "pago" ? "✓ Pago" : p.status === "vencido" ? "Vencido" : "Em aberto"}</span>
                              {p.status !== "pago" && (
                                <button style={{ ...btnE, marginLeft: 6, fontSize: 10 }}
                                  onClick={() => baixarParcelaPagamento(p.id, fazendaId!, p, detalhe)
                                    .then(() => setParcelasPagamento(x => x.map(r => r.id === p.id ? { ...r, status: "pago" as const } : r)))}>
                                  Baixar
                                </button>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot>
                      <tr style={{ background: "#F3F6F9", color: "#1a1a1a", fontWeight: 600 }}>
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
                    <span>Custo total dos juros: <strong style={{ color: "#E24B4A" }}>{fmtBRL(parcelasPagamento.reduce((s, p) => s + p.juros + p.despesas_acessorios, 0))}</strong></span>
                    <span>CET estimado: <strong>{fmtNum((parcelasPagamento.reduce((s, p) => s + p.juros, 0) / detalhe.valor_financiado) * 100, 2)}% a.p.</strong></span>
                    <span>Pagas: <strong style={{ color: "#1A4870" }}>{parcelasPagamento.filter(p => p.status === "pago").length}/{parcelasPagamento.length}</strong></span>
                  </div>
                </>
              )}
            </div>
          )}

          {/* ── Garantias ── */}
          {abaDetalhe === "garantias" && (
            <div>
              <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr auto", gap: 10, marginBottom: 16, alignItems: "end" }}>
                <div><label style={lbl}>Descrição da Garantia *</label><input style={inp} placeholder="Ex: Matrícula 1234 — Gleba São José" value={fGar.descricao} onChange={e => setFGar(p => ({ ...p, descricao: e.target.value }))} /></div>
                <div>
                  <label style={lbl}>Matrícula vinculada</label>
                  <select style={inp} value={fGar.matricula_id} onChange={e => setFGar(p => ({ ...p, matricula_id: e.target.value }))}>
                    <option value="">Nenhuma</option>
                    {matriculas.map(m => <option key={m.id} value={m.id}>Matr. {m.numero}{m.area_ha ? ` — ${m.area_ha} ha` : ""}</option>)}
                  </select>
                </div>
                <div><label style={lbl}>Valor de Avaliação (R$)</label><input style={inp} type="number" step="0.01" value={fGar.valor_avaliacao} onChange={e => setFGar(p => ({ ...p, valor_avaliacao: e.target.value }))} /></div>
                <button style={{ ...btnV, padding: "8px 14px" }} onClick={salvarGarantia} disabled={salvando || !fGar.descricao.trim()}>+ Adicionar</button>
              </div>
              {garantias.length === 0 ? (
                <div style={{ textAlign: "center", padding: "24px 0", color: "#444", fontSize: 12 }}>Nenhuma garantia cadastrada</div>
              ) : (
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead><tr style={{ background: "#F3F6F9" }}>{["Descrição", "Matrícula", "Valor Avaliação", "% Cobertura", ""].map((h, i) => <th key={i} style={{ padding: "7px 12px", textAlign: i < 2 ? "left" : "center", fontSize: 11, fontWeight: 600, color: "#555", borderBottom: "0.5px solid #D4DCE8" }}>{h}</th>)}</tr></thead>
                  <tbody>
                    {garantias.map((g, i) => {
                      const cobertura = g.valor_avaliacao
                        ? (g.valor_avaliacao / (detalhe.valor_financiado_brl ?? detalhe.valor_financiado)) * 100
                        : null;
                      return (
                        <tr key={g.id} style={{ borderBottom: i < garantias.length - 1 ? "0.5px solid #DEE5EE" : "none" }}>
                          <td style={{ padding: "8px 12px" }}>{g.descricao}</td>
                          <td style={{ padding: "8px 12px", color: "#1a1a1a", fontSize: 11 }}>{g.matricula_id ? (matriculas.find(m => m.id === g.matricula_id)?.numero ?? "—") : "—"}</td>
                          <td style={{ padding: "8px 12px", textAlign: "center", color: "#1a1a1a", fontWeight: 600 }}>{g.valor_avaliacao ? fmtBRL(g.valor_avaliacao) : "—"}</td>
                          <td style={{ padding: "8px 12px", textAlign: "center" }}>
                            {cobertura !== null
                              ? <span style={{ color: cobertura >= 130 ? "#1A4870" : cobertura >= 100 ? "#EF9F27" : "#E24B4A", fontWeight: 600 }}>{fmtNum(cobertura, 1)}%</span>
                              : "—"}
                          </td>
                          <td style={{ padding: "8px 12px", textAlign: "right" }}><button style={btnX} onClick={() => excluirGarantia(g.id).then(() => setGarantias(x => x.filter(r => r.id !== g.id)))}>✕</button></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
              {garantias.length > 0 && (
                <div style={{ marginTop: 10, fontSize: 11, color: "#555", textAlign: "right" }}>
                  Total garantias: <strong style={{ color: "#1a1a1a" }}>{fmtBRL(garantias.reduce((s, g) => s + (g.valor_avaliacao ?? 0), 0))}</strong>
                  {" · "}Cobertura: <strong>{fmtNum((garantias.reduce((s, g) => s + (g.valor_avaliacao ?? 0), 0) / (detalhe.valor_financiado_brl ?? detalhe.valor_financiado)) * 100, 1)}%</strong>
                </div>
              )}
            </div>
          )}

          {/* ── Centro de Custo ── */}
          {abaDetalhe === "centrocusto" && (
            <div>
              <div style={{ marginBottom: 10, fontSize: 12, color: "#555" }}>Defina como o valor captado é rateado entre centros de custo / safras (deve totalizar 100%).</div>
              <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 12 }}>
                <thead><tr style={{ background: "#F3F6F9" }}>{["Centro de Custo / Safra", "%", "Valor (R$)", ""].map((h, i) => <th key={i} style={{ padding: "7px 12px", textAlign: i === 0 ? "left" : "center", fontSize: 11, fontWeight: 600, color: "#555", borderBottom: "0.5px solid #D4DCE8" }}>{h}</th>)}</tr></thead>
                <tbody>
                  {centrosForm.map((c, i) => (
                    <tr key={i} style={{ borderBottom: i < centrosForm.length - 1 ? "0.5px solid #DEE5EE" : "none" }}>
                      <td style={{ padding: "6px 8px" }}><input style={inp} placeholder="Ex: Soja 2026/27 — Talhão A" value={c.descricao} onChange={e => setCentrosForm(p => p.map((x, j) => j === i ? { ...x, descricao: e.target.value } : x))} /></td>
                      <td style={{ padding: "6px 8px", width: 80 }}><input style={{ ...inp, textAlign: "center" }} type="number" step="0.01" value={c.percentual} onChange={e => {
                        const pct = parseFloat(e.target.value) || 0;
                        setCentrosForm(p => p.map((x, j) => j === i ? { ...x, percentual: e.target.value, valor: fmtNum((pct / 100) * (detalhe.valor_financiado_brl ?? detalhe.valor_financiado), 2) } : x));
                      }} /></td>
                      <td style={{ padding: "6px 8px", width: 140 }}><input style={inp} type="number" step="0.01" value={c.valor} onChange={e => setCentrosForm(p => p.map((x, j) => j === i ? { ...x, valor: e.target.value } : x))} /></td>
                      <td style={{ padding: "6px 8px", width: 40 }}>
                        {centrosForm.length > 1 && <button style={btnX} onClick={() => setCentrosForm(p => p.filter((_, j) => j !== i))}>✕</button>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 4 }}>
                <button style={{ ...btnR, fontSize: 12 }} onClick={() => setCentrosForm(p => [...p, { descricao: "", percentual: "", valor: "" }])}>+ Adicionar linha</button>
                <div style={{ fontSize: 12 }}>
                  Total: <strong style={{ color: Math.abs(centrosForm.reduce((s, c) => s + (parseFloat(c.percentual) || 0), 0) - 100) < 0.01 ? "#1A4870" : "#E24B4A" }}>
                    {fmtNum(centrosForm.reduce((s, c) => s + (parseFloat(c.percentual) || 0), 0), 2)}%
                  </strong>
                  {Math.abs(centrosForm.reduce((s, c) => s + (parseFloat(c.percentual) || 0), 0) - 100) >= 0.01 && <span style={{ color: "#E24B4A", marginLeft: 4 }}>⚠ deve ser 100%</span>}
                </div>
              </div>
              <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 14 }}>
                <button style={{ ...btnV, opacity: salvando ? 0.5 : 1 }} disabled={salvando} onClick={salvarCentroCusto}>Salvar Rateio</button>
              </div>
              {centrosCusto.length > 0 && (
                <div style={{ marginTop: 14, fontSize: 11, color: "#555" }}>
                  Último rateio salvo: {centrosCusto.map(c => `${c.descricao} (${fmtNum(c.percentual, 1)}%)`).join(" · ")}
                </div>
              )}
            </div>
          )}
        </Modal>
      )}
    </div>
  );
}
