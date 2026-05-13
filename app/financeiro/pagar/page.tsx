"use client";
import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import TopNav from "../../../components/TopNav";
import { useAuth } from "../../../components/AuthProvider";
import FazendaSelector from "../../../components/FazendaSelector";
import { listarLancamentos, criarLancamento, criarParcelamento, baixarLancamento, criarPagamentoLote, listarAnosSafra, listarProdutores, listarPessoas, listarOperacoesGerenciaisAtivas } from "../../../lib/db";
import type { Lancamento, AnoSafra, Produtor, Pessoa, Ciclo, OperacaoGerencial } from "../../../lib/supabase";
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
  "Insumos — Sementes",
  "Insumos — Fertilizantes",
  "Insumos — Defensivos",
  "Insumos — Inoculantes",
  "Combustível — Compra para Estoque",
  "Combustível — Consumo Direto",
  "Serviços Agrícolas",
  "Fretes e Transportes",
  "Arrendamento de Terra",
  "Manutenção de Máquinas",
  "Impostos",
  "Juros e IOF",
  "Pagamento de Custeio",
  "Pagamento de Financiamento",
  "Pagamento de Empréstimo",
  "Prêmio de Seguro",
  "Consórcio — A Contemplar",
  "Consórcio — Contemplado",
  "Despesas Administrativas",
  "Outros",
];

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
  baixado:   { cor: "#16A34A", title: "Pago"        },
}[s] ?? { cor: "#888", title: s });

// ── Estilos ───────────────────────────────────────────────────
const inp: React.CSSProperties = { width: "100%", padding: "8px 10px", border: "0.5px solid #D4DCE8", borderRadius: 8, fontSize: 13, background: "#fff", boxSizing: "border-box", outline: "none" };
const inpF: React.CSSProperties = { width: "100%", padding: "4px 7px", border: "0.5px solid #D4DCE8", borderRadius: 6, fontSize: 11, background: "#FAFBFC", boxSizing: "border-box", outline: "none" };
const lbl: React.CSSProperties = { fontSize: 11, color: "#555", marginBottom: 4, display: "block" };

// ═══════════════════════════════════════════════════════════════
export default function ContasPagar() {
  const { fazendaId, contaId } = useAuth();
  const router = useRouter();
  const [formFazendaId, setFormFazendaId] = useState<string | null>(null);
  const fid = formFazendaId ?? fazendaId;

  const [lancamentos,   setLancamentos]   = useState<Lancamento[]>([]);
  const [anosSafra,     setAnosSafra]     = useState<AnoSafra[]>([]);
  const [produtores,    setProdutores]    = useState<Produtor[]>([]);
  const [pessoas,       setPessoas]       = useState<Pessoa[]>([]);
  const [ciclos,        setCiclos]        = useState<Ciclo[]>([]);
  const [contas,        setContas]        = useState<ContaBancariaMin[]>([]);
  const [opGerenciais,  setOpGerenciais]  = useState<OperacaoGerencial[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [erro,     setErro]     = useState<string | null>(null);
  const [filtro,   setFiltro]   = useState<Filtro>("aberto");

  const [modalBaixa, setModalBaixa] = useState<Lancamento | null>(null);
  const [modalNovo,  setModalNovo]  = useState(false);
  const [alertaNF, setAlertaNF] = useState<Lancamento | null>(null);

  // ── Modal Editar ──────────────────────────────────────────────
  const [modalEditar, setModalEditar] = useState<Lancamento | null>(null);
  const [editForm, setEditForm] = useState({
    descricao: "", categoria: "", data_vencimento: "",
    valorMask: "", observacao: "", pessoa_id: "",
    conta_bancaria: "", ano_safra_id: "", produtor_id: "", ciclo_id: "",
    operacao_gerencial_id: "",
  });
  const [editSalvando, setEditSalvando] = useState(false);

  function abrirEditar(l: Lancamento) {
    setEditForm({
      descricao:        l.descricao ?? "",
      categoria:        l.categoria ?? "",
      data_vencimento:  l.data_vencimento ?? "",
      valorMask:        l.valor?.toLocaleString("pt-BR", { minimumFractionDigits: 2 }) ?? "",
      observacao:       l.observacao ?? "",
      pessoa_id:        l.pessoa_id ?? "",
      conta_bancaria:        l.conta_bancaria ?? "",
      ano_safra_id:          l.ano_safra_id ?? "",
      produtor_id:           l.produtor_id ?? "",
      ciclo_id:              l.ciclo_id ?? "",
      operacao_gerencial_id: l.operacao_gerencial_id ?? "",
    });
    setModalEditar(l);
  }

  async function salvarEditar() {
    if (!modalEditar) return;
    setEditSalvando(true);
    const valor = parseFloat(editForm.valorMask.replace(/\./g, "").replace(",", ".")) || 0;
    const { error } = await supabase.from("lancamentos").update({
      descricao:       editForm.descricao,
      categoria:       editForm.categoria,
      data_vencimento: editForm.data_vencimento,
      valor,
      observacao:      editForm.observacao || null,
      pessoa_id:       editForm.pessoa_id  || null,
      conta_bancaria:  editForm.conta_bancaria || null,
      ano_safra_id:    editForm.ano_safra_id   || null,
      produtor_id:           editForm.produtor_id           || null,
      ciclo_id:              editForm.ciclo_id              || null,
      operacao_gerencial_id: editForm.operacao_gerencial_id || null,
    }).eq("id", modalEditar.id);
    if (error) { alert("Erro ao salvar: " + error.message); setEditSalvando(false); return; }
    setLancamentos(prev => prev.map(x => x.id === modalEditar.id
      ? { ...x, descricao: editForm.descricao, categoria: editForm.categoria,
          data_vencimento: editForm.data_vencimento, valor,
          observacao: editForm.observacao || null,
          pessoa_id: editForm.pessoa_id || null,
          conta_bancaria: editForm.conta_bancaria || null,
          ano_safra_id: editForm.ano_safra_id || null,
          produtor_id: editForm.produtor_id || null,
          ciclo_id: editForm.ciclo_id || null } as Lancamento : x
    ));
    setModalEditar(null);
    setEditSalvando(false);
  }

  // ── Seleção para borderô ──────────────────────────────────
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());
  const [modalLote,    setModalLote]    = useState(false);
  const [loteData,     setLoteData]     = useState(TODAY);
  const [loteConta,    setLoteConta]    = useState("");
  const [loteDesc,     setLoteDesc]     = useState("");
  const [loteSalvando, setLoteSalvando] = useState(false);
  const [loteErro,     setLoteErro]     = useState("");

  const [baixa, setBaixa] = useState({ valorMask: "", data: TODAY, conta: "", obs: "" });
  const [form, setForm] = useState({
    moeda: "BRL" as Moeda,
    pessoa_id: "", descricao: "", categoria: CATS_CP[0], vencimento: "",
    valorMask: "", cotacaoMask: "5,12",
    sacasMask: "", culturaBarter: "soja", precoSacaMask: "120,00", obs: "",
    condicao: "avista" as "avista" | "prazo",
    qtdParcelas: "2", frequencia: "1",
    tipo_documento_lcdpr: "RECIBO" as NonNullable<Lancamento["tipo_documento_lcdpr"]>,
    juros_pct: "", multa_pct: "", desconto_pct: "",
    chave_xml: "", centro_custo: "",
    ano_safra_id: "", produtor_id: "", ciclo_id: "",
    operacao_gerencial_id: "",
    natureza: "real" as "real" | "previsao",
    forma_pagamento: "PIX",
    conta_pagamento: "",
  });

  // grid editável de parcelas (prazo)
  type ParcelaGrid = { data: string; valorMask: string };
  const [parcelas, setParcelas] = useState<ParcelaGrid[]>([]);

  // ── Filtros de coluna ─────────────────────────────────────
  const [fFornecedor, setFFornecedor] = useState("");
  const [fOperacao,   setFOperacao]   = useState("");
  const [fSafra,      setFSafra]      = useState("");
  const [fVencDe,     setFVencDe]     = useState("");
  const [fVencAte,    setFVencAte]    = useState("");
  const [fMoedaOrig,  setFMoedaOrig]  = useState("");
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
    if (fazendaId) {
      carregar();
      listarAnosSafra(fazendaId).then(setAnosSafra).catch(() => {});
      listarProdutores(fazendaId).then(setProdutores).catch(() => {});
      listarPessoas(fazendaId).then(setPessoas).catch(() => {});
      listarOperacoesGerenciaisAtivas(fazendaId, { tipo: "despesa", permite: "cp_cr" }).then(setOpGerenciais).catch(() => {});
      supabase.from("ciclos").select("id, descricao, cultura, ano_safra_id").eq("fazenda_id", fazendaId).order("created_at", { ascending: false }).then(({ data }) => setCiclos((data ?? []) as Ciclo[]));
      supabase.from("contas_bancarias").select("id, nome, banco, agencia, conta").eq("fazenda_id", fazendaId).eq("ativa", true).then(({ data }) => setContas(data ?? []));
    }
  }, [fazendaId]);

  async function carregar() {
    setLoading(true);
    setErro(null);
    try {
      const todos = await listarLancamentos(fazendaId!);
      setLancamentos(todos.filter(l => l.tipo === "pagar"));
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

  // ── Métricas ───────────────────────────────────────────────

  const lancOper     = lancamentos.filter(l => l.moeda !== "barter" && (l.natureza ?? "real") === "real");
  const totalAberto  = lancOper.filter(l => l.status !== "baixado").reduce((a, l) => a + paraBRL(l), 0);
  const qAberto      = lancOper.filter(l => l.status !== "baixado").length;
  const qVencido     = lancamentos.filter(l => l.status === "vencido").length;
  const qVencendo    = lancamentos.filter(l => l.status === "vencendo").length;
  const mesAtual     = TODAY.slice(0, 7);
  const pagosNoMes   = lancamentos.filter(l => l.status === "baixado" && (l.data_baixa ?? "").startsWith(mesAtual))
                         .reduce((a, l) => a + (l.valor_pago ?? paraBRL(l)), 0);

  // ── Filtragem e ordenação ──────────────────────────────────

  const filtradosBase = useMemo(() => {
    let arr = lancamentos.filter(l => {
      const isReal = (l.natureza ?? "real") === "real";
      if (filtro === "aberto")   return isReal && l.status === "em_aberto" && l.moeda !== "barter";
      if (filtro === "vencido")  return isReal && (l.status === "vencido" || l.status === "vencendo");
      if (filtro === "vencendo") return isReal && l.status === "vencendo";
      if (filtro === "baixado")  return isReal && l.status === "baixado";
      if (filtro === "barter")   return isReal && l.moeda === "barter";
      if (filtro === "previsao") return l.natureza === "previsao";
      return true;
    });
    // Ordenar por vencimento crescente
    arr = arr.sort((a, b) => (a.data_vencimento ?? "") < (b.data_vencimento ?? "") ? -1 : 1);
    return arr;
  }, [lancamentos, filtro]);

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
    setBaixa({ valorMask: l.moeda === "barter" ? "" : numParaMascara(paraBRL(l)), data: TODAY, conta: "", obs: "" });
  };

  const confirmarBaixa = async () => {
    if (!modalBaixa) return;
    if (modalBaixa.moeda !== "barter" && !baixa.valorMask) return;
    const valorPago = modalBaixa.moeda === "barter" ? 0 : desmascarar(baixa.valorMask);
    try {
      setSalvando(true);
      await baixarLancamento(modalBaixa.id, valorPago, baixa.data, modalBaixa.moeda === "barter" ? "" : baixa.conta);
      setLancamentos(prev => prev.map(l =>
        l.id !== modalBaixa.id ? l : { ...l, status: "baixado" as const, data_baixa: baixa.data, valor_pago: valorPago, conta_bancaria: baixa.conta }
      ));
      setModalBaixa(null);
    } catch (e: unknown) {
      const msgBaixa = e instanceof Error ? e.message : (e as { message?: string })?.message ?? JSON.stringify(e);
      alert("Erro: " + msgBaixa);
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
    const abertos = filtrados.filter(l => l.status !== "baixado").map(l => l.id);
    const todosSel = abertos.every(id => selecionados.has(id));
    setSelecionados(todosSel ? new Set() : new Set(abertos));
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
      chave_xml:     form.chave_xml     || undefined,
      centro_custo:          form.centro_custo          || undefined,
      observacao:            form.obs                   || undefined,
      ano_safra_id:          form.ano_safra_id          || undefined,
      ciclo_id:              form.ciclo_id              || undefined,
      produtor_id:           form.produtor_id           || undefined,
      operacao_gerencial_id: form.operacao_gerencial_id || undefined,
      natureza:              form.natureza,
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
      setParcelas([]);
      setForm(f => ({ ...f, pessoa_id: "", descricao: "", vencimento: "", valorMask: "", sacasMask: "", obs: "", condicao: "avista", qtdParcelas: "2", conta_pagamento: "", forma_pagamento: "PIX" }));
      setModalNovo(false);
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
    || (form.moeda === "barter" && !form.sacasMask);

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
          <button
            onClick={() => { setFormFazendaId(fazendaId); setModalNovo(true); }}
            style={{ background: "#C9921B", color: "#fff", border: "none", borderRadius: 8, padding: "9px 18px", fontSize: 13, fontWeight: 600, cursor: "pointer" }}
          >
            ↑ Nova Conta a Pagar
          </button>
        </header>

        <div style={{ padding: "18px 24px", flex: 1, overflowY: "auto" }}>

          {/* Stats */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 18 }}>
            {[
              { label: "Total a pagar",     valor: fmtBRL(totalAberto), cor: "#E24B4A", sub: `${qAberto} lançamentos em aberto` },
              { label: "Vencidos",          valor: String(qVencido),     cor: qVencido  > 0 ? "#E24B4A" : "#444", sub: "Aguardando baixa urgente" },
              { label: "Vencendo hoje",     valor: String(qVencendo),    cor: qVencendo > 0 ? "#EF9F27" : "#444", sub: "Providencie o pagamento" },
              { label: `Pago em ${mesAtual.slice(0, 7)}`, valor: fmtBRL(pagosNoMes), cor: "#1A4870", sub: "Total de baixas no mês" },
            ].map((s, i) => (
              <div key={i} style={{ background: "#fff", border: "0.5px solid #D4DCE8", borderRadius: 12, padding: "14px 18px" }}>
                <div style={{ fontSize: 11, color: "#555", marginBottom: 5 }}>{s.label}</div>
                <div style={{ fontSize: 20, fontWeight: 700, color: s.cor, marginBottom: 3 }}>{s.valor}</div>
                <div style={{ fontSize: 10, color: "#444" }}>{s.sub}</div>
              </div>
            ))}
          </div>

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
                  { key: "aberto",   label: "Em aberto",  count: lancOper.filter(l => l.status !== "baixado").length,                           cor: "#E24B4A" },
                  { key: "vencido",  label: "Vencidos",   count: qVencido + qVencendo,                                                           cor: "#E24B4A" },
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
                <span style={{ marginLeft: hasColFilter ? 0 : "auto", fontSize: 11, color: "#888" }}>
                  {filtrados.length} / {filtradosBase.length} registros
                </span>
              </div>

              {/* Tabela wide */}
              <div style={{ overflowX: "auto" }}>
                {filtradosBase.length === 0 ? (
                  <div style={{ padding: 40, textAlign: "center", color: "#444", fontSize: 13 }}>
                    Nenhuma conta encontrada para este filtro.
                  </div>
                ) : (
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead>
                      {/* Cabeçalhos */}
                      <tr style={{ background: "#F3F6F9" }}>
                        <th style={thS(32)}>
                          <input type="checkbox"
                            style={{ cursor: "pointer", accentColor: "#1A5CB8" }}
                            checked={filtrados.filter(l => l.status !== "baixado").length > 0 && filtrados.filter(l => l.status !== "baixado").every(l => selecionados.has(l.id))}
                            onChange={toggleTodos}
                            title="Selecionar todos"
                          />
                        </th>
                        <th style={thS(200, "left")}>Fornecedor</th>
                        <th style={thS(110, "center")}>Origem</th>
                        <th style={thS(160, "left")}>Operação</th>
                        <th style={thS(120, "left")}>Safra</th>
                        <th style={thS(100, "center")}>Vencimento ↑</th>
                        <th style={thS(120, "right")}>Valor</th>
                        <th style={thS(100, "center")}>Dt. Pgto</th>
                        <th style={thS(110, "right")}>Valor Pago</th>
                        <th style={thS(80, "center")}>Moeda Orig.</th>
                        <th style={thS(80, "center")}>Moeda Pag.</th>
                        <th style={thS(130, "left")}>Conta</th>
                        <th style={thS(140, "left")}>Produtor</th>
                        <th style={thS(180, "left")}>Observação</th>
                        <th style={thS(90, "center")}></th>
                      </tr>
                      {/* Linha de filtros */}
                      <tr style={{ background: "#FAFBFC", borderBottom: "0.5px solid #D4DCE8" }}>
                        <td style={{ padding: "4px 4px" }}></td>
                        <td style={{ padding: "3px 8px" }}>
                          <input style={inpF} placeholder="Buscar…" value={fFornecedor} onChange={e => setFFornecedor(e.target.value)} />
                        </td>
                        <td></td>
                        <td style={{ padding: "3px 8px" }}>
                          <input style={inpF} placeholder="Buscar…" value={fOperacao} onChange={e => setFOperacao(e.target.value)} />
                        </td>
                        <td style={{ padding: "3px 8px" }}>
                          <select style={inpF} value={fSafra} onChange={e => setFSafra(e.target.value)}>
                            <option value="">Todas</option>
                            {anosSafra.map(a => <option key={a.id} value={a.id}>{a.descricao}</option>)}
                          </select>
                        </td>
                        <td style={{ padding: "3px 8px" }}>
                          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                            <input style={{ ...inpF }} type="date" title="De" value={fVencDe} onChange={e => setFVencDe(e.target.value)} />
                            <input style={{ ...inpF }} type="date" title="Até" value={fVencAte} onChange={e => setFVencAte(e.target.value)} />
                          </div>
                        </td>
                        <td></td>
                        <td></td>
                        <td></td>
                        <td style={{ padding: "3px 8px" }}>
                          <select style={inpF} value={fMoedaOrig} onChange={e => setFMoedaOrig(e.target.value)}>
                            <option value="">Todas</option>
                            <option value="BRL">BRL</option>
                            <option value="USD">USD</option>
                            <option value="barter">Barter</option>
                          </select>
                        </td>
                        <td></td>
                        <td style={{ padding: "3px 8px" }}>
                          <input style={inpF} placeholder="Buscar…" value={fConta} onChange={e => setFConta(e.target.value)} />
                        </td>
                        <td style={{ padding: "3px 8px" }}>
                          <input style={inpF} placeholder="Buscar…" value={fProdutor} onChange={e => setFProdutor(e.target.value)} />
                        </td>
                        <td style={{ padding: "3px 8px" }}>
                          <input style={inpF} placeholder="Buscar…" value={fObs} onChange={e => setFObs(e.target.value)} />
                        </td>
                        <td></td>
                      </tr>
                    </thead>
                    <tbody>
                      {filtrados.length === 0 ? (
                        <tr>
                          <td colSpan={15} style={{ padding: 24, textAlign: "center", color: "#888", fontSize: 12 }}>
                            Nenhum resultado para os filtros aplicados.
                          </td>
                        </tr>
                      ) : filtrados.map((l, li) => {
                        const isPrevisao = l.natureza === "previsao";
                        const dot       = dotStatus(l.status);
                        const conv      = l.moeda === "USD" ? fmtBRL(l.valor * (l.cotacao_usd ?? COTACAO_USD)) : null;
                        const safra     = anosSafra.find(a => a.id === l.ano_safra_id)?.descricao ?? "—";
                        const prod      = produtores.find(p => p.id === l.produtor_id)?.nome ?? "—";
                        const isVenc    = !isPrevisao && (l.status === "vencido" || l.status === "vencendo");
                        const pessoaNome = pessoas.find(p => p.id === l.pessoa_id)?.nome;
                        const fornNome  = pessoaNome ?? exibirFornecedor(l.descricao);
                        const obsExibir = obsArrendamento(l, safra);
                        const om = origemMeta(l);
                        return (
                          <tr key={l.id} style={{ borderBottom: li < filtrados.length - 1 ? "0.5px solid #DEE5EE" : "none", background: isPrevisao ? "#EFF6FF" : l.moeda === "barter" ? "#FEF8ED" : "transparent", borderLeft: isPrevisao ? "3px dashed #1A5CB8" : `3px solid ${om.border}` }}>
                            {/* ● Sinalizador / Checkbox */}
                            <td style={{ padding: "10px 4px", textAlign: "center" }}>
                              {l.status !== "baixado" ? (
                                <input type="checkbox"
                                  style={{ cursor: "pointer", accentColor: "#1A5CB8" }}
                                  checked={selecionados.has(l.id)}
                                  onChange={() => toggleSel(l.id)}
                                />
                              ) : (
                                <span title={dot.title} style={{ display: "inline-block", width: 9, height: 9, borderRadius: "50%", background: dot.cor }} />
                              )}
                            </td>
                            {/* Fornecedor */}
                            <td style={{ padding: "10px 10px" }}>
                              <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                                <span style={{ fontWeight: 600, fontSize: 12, color: "#1a1a1a", whiteSpace: "nowrap" }}>{fornNome}</span>
                                {isPrevisao && <span style={{ fontSize: 9, background: "#1A5CB8", color: "#fff", padding: "1px 5px", borderRadius: 5, fontWeight: 700, letterSpacing: "0.05em" }}>PREVISÃO</span>}
                              </div>
                              {l.total_parcelas && l.total_parcelas > 1 && (
                                <span style={{ fontSize: 10, background: "#E6F1FB", color: "#0C447C", padding: "1px 5px", borderRadius: 5, fontWeight: 600 }}>
                                  {l.num_parcela}/{l.total_parcelas}
                                </span>
                              )}
                            </td>
                            {/* Origem */}
                            <td style={{ padding: "10px 8px", textAlign: "center" }}>
                              <span style={{ fontSize: 10, background: om.bg, color: om.cl, padding: "2px 7px", borderRadius: 8, fontWeight: 600, whiteSpace: "nowrap" }}>{om.label}</span>
                            </td>
                            {/* Operação */}
                            <td style={{ padding: "10px 10px" }}>
                              <span style={{ fontSize: 10, background: "#FAEEDA", color: "#633806", padding: "2px 7px", borderRadius: 8, whiteSpace: "nowrap" }}>{l.categoria}</span>
                            </td>
                            {/* Safra */}
                            <td style={{ padding: "10px 10px", fontSize: 11, color: "#555", whiteSpace: "nowrap" }}>
                              {l.ano_safra_id ? safra : "—"}
                            </td>
                            {/* Vencimento */}
                            <td style={{ padding: "10px 10px", textAlign: "center", fontSize: 12, whiteSpace: "nowrap", color: isVenc ? "#E24B4A" : "#444", fontWeight: isVenc ? 600 : 400 }}>
                              {fmtData(l.data_vencimento)}
                            </td>
                            {/* Valor */}
                            <td style={{ padding: "10px 10px", textAlign: "right", whiteSpace: "nowrap" }}>
                              <div style={{ fontWeight: 600, color: l.moeda === "barter" ? "#8B5E14" : "#E24B4A", fontSize: 13 }}>{exibirValor(l)}</div>
                              {conv && <div style={{ fontSize: 10, color: "#888" }}>{conv}</div>}
                            </td>
                            {/* Data Pgto */}
                            <td style={{ padding: "10px 10px", textAlign: "center", fontSize: 11, color: "#16A34A", whiteSpace: "nowrap" }}>
                              {fmtData(l.data_baixa)}
                            </td>
                            {/* Valor Pago */}
                            <td style={{ padding: "10px 10px", textAlign: "right", fontSize: 12, whiteSpace: "nowrap" }}>
                              {l.valor_pago != null && l.valor_pago > 0
                                ? <span style={{ color: "#16A34A", fontWeight: 600 }}>{fmtBRL(l.valor_pago)}</span>
                                : <span style={{ color: "#bbb" }}>—</span>}
                            </td>
                            {/* Moeda Orig */}
                            <td style={{ padding: "10px 10px", textAlign: "center" }}>
                              <span style={{ fontSize: 10, padding: "2px 6px", borderRadius: 6, background: l.moeda === "USD" ? "#FEF3E2" : l.moeda === "barter" ? "#FBF3E0" : "#F0F4FA", color: l.moeda === "USD" ? "#7A4300" : l.moeda === "barter" ? "#8B5E14" : "#444", fontWeight: 600 }}>
                                {l.moeda === "barter" ? "Barter" : l.moeda}
                              </span>
                            </td>
                            {/* Moeda Pag */}
                            <td style={{ padding: "10px 10px", textAlign: "center" }}>
                              {l.moeda_pagamento
                                ? <span style={{ fontSize: 10, padding: "2px 6px", borderRadius: 6, background: "#F0F4FA", color: "#444", fontWeight: 600 }}>{l.moeda_pagamento}</span>
                                : <span style={{ color: "#bbb", fontSize: 11 }}>—</span>}
                            </td>
                            {/* Conta */}
                            <td style={{ padding: "10px 10px", fontSize: 11, color: "#555", whiteSpace: "nowrap" }}>
                              {contas.find(c => c.id === l.conta_bancaria)?.nome ?? "—"}
                            </td>
                            {/* Produtor */}
                            <td style={{ padding: "10px 10px", fontSize: 11, color: "#555", whiteSpace: "nowrap" }}>
                              {l.produtor_id ? prod : "—"}
                            </td>
                            {/* Observação */}
                            <td style={{ padding: "10px 10px", fontSize: 11, color: "#666", whiteSpace: "nowrap" }}>
                              {obsExibir}
                            </td>
                            {/* Ação */}
                            <td style={{ padding: "10px 8px", textAlign: "center" }}>
                              <div style={{ display: "flex", gap: 6, justifyContent: "center", alignItems: "center" }}>
                                {isPrevisao ? (
                                  <button
                                    onClick={() => confirmarPrevisao(l)}
                                    style={{ fontSize: 11, padding: "4px 11px", borderRadius: 6, cursor: "pointer", fontWeight: 600, whiteSpace: "nowrap", background: "#1A5CB8", color: "#fff", border: "none" }}
                                  >
                                    ✓ Confirmar
                                  </button>
                                ) : l.status !== "baixado" ? (
                                  <button
                                    onClick={() => abrirBaixa(l)}
                                    style={{ fontSize: 11, padding: "4px 11px", borderRadius: 6, cursor: "pointer", fontWeight: 600, whiteSpace: "nowrap", background: "#C9921B", color: "#fff", border: "none" }}
                                  >
                                    ◈ Baixar
                                  </button>
                                ) : null}
                                {!l.auto && (
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
                                {!l.auto && (
                                  <button
                                    onClick={async () => {
                                      if (!confirm(`Excluir "${l.descricao}"?\nEsta ação não pode ser desfeita.`)) return;
                                      const { error } = await supabase.from("lancamentos").delete().eq("id", l.id);
                                      if (error) { alert("Erro ao excluir: " + error.message); return; }
                                      setLancamentos(prev => prev.filter(x => x.id !== l.id));
                                    }}
                                    title="Excluir lançamento"
                                    style={{ fontSize: 13, padding: "3px 7px", borderRadius: 6, cursor: "pointer", background: "transparent", color: "#E24B4A", border: "0.5px solid #E24B4A", lineHeight: 1 }}
                                  >
                                    🗑
                                  </button>
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

              <div style={{ padding: "10px 16px", borderTop: "0.5px solid #DEE5EE", display: "flex", justifyContent: "space-between", fontSize: 11, color: "#444" }}>
                <span>CP automáticas: <strong style={{ color: "#C9921B" }}>{lancamentos.filter(l => l.auto).length}</strong></span>
                <span>Exibindo {filtrados.length} de {filtradosBase.length} registros</span>
              </div>
            </div>
          )}
        </div>
      </main>

      {/* ── Alerta: CP sem NF ───────────────────────────────────── */}
      {alertaNF && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ background: "#fff", borderRadius: 12, padding: 28, width: 420, boxShadow: "0 8px 32px rgba(0,0,0,0.18)" }}>
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
                setBaixa({ valorMask: l.moeda === "barter" ? "" : numParaMascara(paraBRL(l)), data: TODAY, conta: "", obs: "" });
              }} style={{ padding: "8px 16px", borderRadius: 8, border: "none", background: "#C9921B", color: "#fff", cursor: "pointer", fontSize: 13, fontWeight: 600 }}>
                Continuar sem NF
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal Editar ─────────────────────────────────────── */}
      {modalEditar && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center" }}
          onClick={e => { if (e.target === e.currentTarget) setModalEditar(null); }}>
          <div style={{ background: "#fff", borderRadius: 12, padding: 28, width: 560, maxHeight: "90vh", overflowY: "auto", boxShadow: "0 8px 32px rgba(0,0,0,0.18)" }}>
            <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 16 }}>✏ Editar Lançamento</div>
            <div style={{ display: "grid", gap: 14 }}>
              <div>
                <label style={lbl}>Descrição</label>
                <input value={editForm.descricao} onChange={e => setEditForm(f => ({ ...f, descricao: e.target.value }))} style={inp} />
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div>
                  <label style={lbl}>Valor (R$)</label>
                  <input value={editForm.valorMask} onChange={e => setEditForm(f => ({ ...f, valorMask: e.target.value }))} style={inp} placeholder="0,00" />
                </div>
                <div>
                  <label style={lbl}>Vencimento</label>
                  <input type="date" value={editForm.data_vencimento} onChange={e => setEditForm(f => ({ ...f, data_vencimento: e.target.value }))} style={inp} />
                </div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div>
                  <label style={lbl}>Categoria</label>
                  <select value={editForm.categoria} onChange={e => setEditForm(f => ({ ...f, categoria: e.target.value }))} style={inp}>
                    {CATS_CP.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label style={lbl}>Conta Bancária</label>
                  <select value={editForm.conta_bancaria} onChange={e => setEditForm(f => ({ ...f, conta_bancaria: e.target.value }))} style={inp}>
                    <option value="">— Sem conta —</option>
                    {contas.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
                  </select>
                </div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div>
                  <label style={lbl}>Fornecedor / Pessoa</label>
                  <select value={editForm.pessoa_id} onChange={e => setEditForm(f => ({ ...f, pessoa_id: e.target.value }))} style={inp}>
                    <option value="">— Não informado —</option>
                    {pessoas.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
                  </select>
                </div>
                <div>
                  <label style={lbl}>Ano Safra</label>
                  <select value={editForm.ano_safra_id} onChange={e => setEditForm(f => ({ ...f, ano_safra_id: e.target.value, ciclo_id: "" }))} style={inp}>
                    <option value="">— Sem safra —</option>
                    {anosSafra.map(a => <option key={a.id} value={a.id}>{a.descricao}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label style={lbl}>Ciclo / Empreendimento</label>
                <select value={editForm.ciclo_id} onChange={e => setEditForm(f => ({ ...f, ciclo_id: e.target.value }))} style={inp}>
                  <option value="">— Sem ciclo —</option>
                  {ciclos
                    .filter(c => !editForm.ano_safra_id || c.ano_safra_id === editForm.ano_safra_id)
                    .map(c => <option key={c.id} value={c.id}>{c.descricao || c.cultura}</option>)
                  }
                </select>
              </div>
              <div>
                <label style={lbl}>Operação Gerencial</label>
                <select value={editForm.operacao_gerencial_id} onChange={e => setEditForm(f => ({ ...f, operacao_gerencial_id: e.target.value }))} style={inp}>
                  <option value="">— Sem vínculo contábil —</option>
                  {Object.entries(
                    opGerenciais.reduce((acc, o) => {
                      const parts = (o.classificacao ?? "").split(".");
                      const grpKey = parts.slice(0, 3).join(".");
                      (acc[grpKey] = acc[grpKey] ?? []).push(o);
                      return acc;
                    }, {} as Record<string, typeof opGerenciais>)
                  ).map(([grpKey, ops]) => (
                    <optgroup key={grpKey} label={grpKey}>
                      {ops.map(o => <option key={o.id} value={o.id}>{o.classificacao} — {o.descricao}</option>)}
                    </optgroup>
                  ))}
                </select>
                {editForm.operacao_gerencial_id && (() => {
                  const op = opGerenciais.find(o => o.id === editForm.operacao_gerencial_id);
                  if (!op) return null;
                  return (
                    <div style={{ marginTop: 4, padding: "5px 10px", background: "#F0F7FF", borderRadius: 6, border: "0.5px solid #C5DCF5", fontSize: 11, color: "#0B2D50", display: "flex", gap: 16 }}>
                      <span>Débito: <strong>{op.conta_debito || "—"}</strong></span>
                      <span>Crédito: <strong>{op.conta_credito || "—"}</strong></span>
                    </div>
                  );
                })()}
              </div>
              <div>
                <label style={lbl}>Observação</label>
                <input value={editForm.observacao} onChange={e => setEditForm(f => ({ ...f, observacao: e.target.value }))} style={inp} placeholder="Opcional" />
              </div>
            </div>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 20 }}>
              <button onClick={() => setModalEditar(null)} style={{ padding: "8px 18px", borderRadius: 8, border: "0.5px solid #CCC", background: "#F4F6FA", cursor: "pointer", fontSize: 13 }}>Cancelar</button>
              <button disabled={editSalvando} onClick={salvarEditar} style={{ padding: "8px 22px", borderRadius: 8, border: "none", background: editSalvando ? "#aaa" : "#1A4870", color: "#fff", cursor: editSalvando ? "wait" : "pointer", fontSize: 13, fontWeight: 700 }}>
                {editSalvando ? "Salvando…" : "✓ Salvar"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Barra flutuante de seleção (borderô) ─────────────── */}
      {selecionados.size > 0 && (
        <div style={{
          position: "fixed", bottom: 24, left: "50%", transform: "translateX(-50%)",
          background: "#1A4870", color: "#fff", borderRadius: 14,
          padding: "12px 22px", display: "flex", alignItems: "center", gap: 18,
          boxShadow: "0 6px 24px rgba(0,0,0,0.25)", zIndex: 90, whiteSpace: "nowrap",
          maxWidth: "calc(100vw - 32px)",
        }}>
          <span style={{ fontSize: 13 }}>
            <strong>{selecionados.size}</strong> título{selecionados.size !== 1 ? "s" : ""} selecionado{selecionados.size !== 1 ? "s" : ""}
            &nbsp;·&nbsp;
            <strong>{fmtBRL(totalLote)}</strong>
          </span>
          <button
            onClick={() => { setLoteData(TODAY); setLoteConta(""); setLoteDesc(""); setLoteErro(""); setModalLote(true); }}
            style={{ background: "#C9921B", color: "#fff", border: "none", borderRadius: 8, padding: "7px 16px", fontWeight: 700, fontSize: 13, cursor: "pointer" }}
          >
            Pagar em Lote ›
          </button>
          <button
            onClick={async () => {
              const manuais = filtrados.filter(l => selecionados.has(l.id) && !l.auto);
              if (manuais.length === 0) { alert("Nenhum lançamento manual selecionado para excluir."); return; }
              if (!confirm(`Excluir ${manuais.length} lançamento${manuais.length !== 1 ? "s" : ""}?\nEsta ação não pode ser desfeita.`)) return;
              const ids = manuais.map(l => l.id);
              const { error } = await supabase.from("lancamentos").delete().in("id", ids);
              if (error) { alert("Erro ao excluir: " + error.message); return; }
              setLancamentos(prev => prev.filter(x => !ids.includes(x.id)));
              setSelecionados(new Set());
            }}
            style={{ background: "#E24B4A", color: "#fff", border: "none", borderRadius: 8, padding: "7px 14px", fontWeight: 600, fontSize: 13, cursor: "pointer" }}
          >
            🗑 Excluir
          </button>
          <button
            onClick={() => setSelecionados(new Set())}
            style={{ background: "none", border: "0.5px solid rgba(255,255,255,0.4)", color: "#fff", borderRadius: 8, padding: "6px 12px", fontSize: 12, cursor: "pointer" }}
          >
            Cancelar
          </button>
        </div>
      )}

      {/* ── Modal Baixa ─────────────────────────────────────────── */}
      {modalBaixa && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }}
          onClick={e => { if (e.target === e.currentTarget) setModalBaixa(null); }}>
          <div style={{ background: "#fff", borderRadius: 12, width: "100%", maxWidth: 440, maxHeight: "90vh", overflowY: "auto" as const, boxShadow: "0 20px 60px rgba(0,0,0,0.2)", padding: 24 }}>
            <div style={{ fontWeight: 600, fontSize: 16, color: "#1a1a1a", marginBottom: 4 }}>
              {modalBaixa.moeda === "barter" ? "Confirmar entrega (barter)" : "Registrar pagamento"}
            </div>
            <div style={{ fontSize: 12, color: "#555", marginBottom: 20 }}>{modalBaixa.descricao}</div>

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
              <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 12 }}>
                <div style={{ gridColumn: "1/-1" }}>
                  <label style={lbl}>Valor pago (R$) *</label>
                  <input style={inp} type="text" inputMode="numeric" placeholder="0,00" value={baixa.valorMask}
                    onChange={e => setBaixa(p => ({ ...p, valorMask: aplicarMascara(e.target.value) }))} />
                  {desmascarar(baixa.valorMask) > 0 && desmascarar(baixa.valorMask) < paraBRL(modalBaixa) && (
                    <div style={{ fontSize: 10, color: "#EF9F27", marginTop: 4 }}>
                      Pagamento parcial — restante: {fmtBRL(paraBRL(modalBaixa) - desmascarar(baixa.valorMask))}
                    </div>
                  )}
                </div>
                <div>
                  <label style={lbl}>Data do pagamento</label>
                  <input style={inp} type="date" value={baixa.data} onChange={e => setBaixa(p => ({ ...p, data: e.target.value }))} />
                </div>
                <div>
                  <label style={lbl}>Conta bancária</label>
                  <select style={inp} value={baixa.conta} onChange={e => setBaixa(p => ({ ...p, conta: e.target.value }))}>
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
            )}

            <div style={{ marginTop: 14, background: "#FBF0D8", borderRadius: 8, padding: "8px 12px", fontSize: 11, color: "#7A5A12" }}>
              ◈ Ação manual — você confirma que o pagamento foi efetuado.
            </div>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 16 }}>
              <button onClick={() => setModalBaixa(null)} style={{ padding: "8px 18px", border: "0.5px solid #D4DCE8", borderRadius: 8, background: "transparent", cursor: "pointer", fontSize: 13 }}>Cancelar</button>
              <button onClick={confirmarBaixa} disabled={salvando || (modalBaixa.moeda !== "barter" && !baixa.valorMask)}
                style={{ padding: "8px 18px", background: "#C9921B", color: "#fff", border: "none", borderRadius: 8, fontWeight: 600, cursor: "pointer", fontSize: 13 }}>
                {salvando ? "Salvando…" : "◈ Confirmar baixa"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal Pagamento em Lote ──────────────────────────── */}
      {modalLote && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }}
          onClick={e => { if (e.target === e.currentTarget) setModalLote(false); }}>
          <div style={{ background: "#fff", borderRadius: 12, width: "100%", maxWidth: 580, maxHeight: "90vh", overflowY: "auto" as const, boxShadow: "0 20px 60px rgba(0,0,0,0.2)" }}>
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
          onClick={e => { if (e.target === e.currentTarget) setModalNovo(false); }}>
          <div style={{ background: "#fff", borderRadius: 12, width: "100%", maxWidth: 600, maxHeight: "90vh", overflowY: "auto" as const, boxShadow: "0 20px 60px rgba(0,0,0,0.2)", padding: 24 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4, flexWrap: "wrap", gap: 8 }}>
              <div style={{ fontWeight: 600, fontSize: 16, color: "#1a1a1a" }}>Nova Conta a Pagar</div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <FazendaSelector contaId={contaId} value={fid} onChange={setFormFazendaId} />
                <div style={{ display: "flex", gap: 0, border: "0.5px solid #D4DCE8", borderRadius: 8, overflow: "hidden" }}>
                {(["real", "previsao"] as const).map(n => (
                  <button key={n} onClick={() => setForm(p => ({ ...p, natureza: n }))}
                    style={{ padding: "5px 14px", border: "none", cursor: "pointer", fontSize: 12, fontWeight: form.natureza === n ? 700 : 400,
                      background: form.natureza === n ? (n === "previsao" ? "#1A5CB8" : "#C9921B") : "#fff",
                      color: form.natureza === n ? "#fff" : "#666" }}>
                    {n === "real" ? "Real" : "Previsão"}
                  </button>
                ))}
                </div>
              </div>
            </div>
            <div style={{ fontSize: 12, color: "#555", marginBottom: 18 }}>
              {form.natureza === "previsao"
                ? "Previsão de custo — não gera movimentação financeira real. Confirme quando a compra for efetivada."
                : "Lançamentos de insumos e serviços são criados automaticamente a partir das operações de lavoura."}
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
              <div>
                <label style={lbl}>Moeda</label>
                <select style={inp} value={form.moeda} onChange={e => setForm(p => ({ ...p, moeda: e.target.value as Moeda, valorMask: "", sacasMask: "" }))}>
                  <option value="BRL">Real (R$)</option>
                  <option value="USD">Dólar (US$)</option>
                  <option value="barter">Barter</option>
                </select>
              </div>
              <div style={{ gridColumn: "2 / -1" }}>
                <label style={lbl}>Categoria *</label>
                <select style={inp} value={form.categoria} onChange={e => setForm(p => ({ ...p, categoria: e.target.value }))}>
                  {CATS_CP.map(c => <option key={c}>{c}</option>)}
                </select>
              </div>
              <div style={{ gridColumn: "1/-1", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div>
                  <label style={lbl}>Fornecedor / Credor</label>
                  <select style={inp} value={form.pessoa_id} onChange={e => setForm(p => ({ ...p, pessoa_id: e.target.value }))}>
                    <option value="">— Selecionar do cadastro —</option>
                    {pessoas.filter(p => p.fornecedor || (!p.cliente && !p.fornecedor)).map(p => (
                      <option key={p.id} value={p.id}>{p.nome}{p.cliente ? " (Cli/Forn)" : ""}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label style={lbl}>Descrição {!form.pessoa_id && <span style={{ color: "#E24B4A" }}>*</span>}</label>
                  <input style={inp} placeholder="Ex: Compra de herbicida — Talhão 3" value={form.descricao} onChange={e => setForm(p => ({ ...p, descricao: e.target.value }))} />
                </div>
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
              <div style={{ gridColumn: "1/-1" }}>
                <label style={lbl}>Conta de Pagamento</label>
                <select style={inp} value={form.conta_pagamento} onChange={e => setForm(p => ({ ...p, conta_pagamento: e.target.value }))}>
                  <option value="">— Selecionar conta —</option>
                  {contas.map(c => {
                    const label = c.nome || `${c.banco ?? ""} ${c.agencia ? `Ag.${c.agencia}` : ""} ${c.conta ? `C/C ${c.conta}` : ""}`.trim();
                    return <option key={c.id} value={label}>{label}</option>;
                  })}
                  {contas.length === 0 && <option disabled>Cadastre contas em Cadastros › Contas Bancárias</option>}
                </select>
              </div>
              <div>
                <label style={lbl}>Safra</label>
                <select style={inp} value={form.ano_safra_id} onChange={e => setForm(p => ({ ...p, ano_safra_id: e.target.value, ciclo_id: "" }))}>
                  <option value="">Sem vínculo</option>
                  {anosSafra.map(a => <option key={a.id} value={a.id}>{a.descricao}</option>)}
                </select>
              </div>
              <div>
                <label style={lbl}>Ciclo / Empreendimento</label>
                <select style={inp} value={form.ciclo_id} onChange={e => setForm(p => ({ ...p, ciclo_id: e.target.value }))}>
                  <option value="">— Sem ciclo —</option>
                  {ciclos
                    .filter(c => !form.ano_safra_id || c.ano_safra_id === form.ano_safra_id)
                    .map(c => <option key={c.id} value={c.id}>{c.descricao || c.cultura}</option>)
                  }
                </select>
              </div>
              <div>
                <label style={lbl}>Centro de Custo</label>
                <input style={inp} placeholder="Ex: Talhão 3 / Maquinário" value={form.centro_custo} onChange={e => setForm(p => ({ ...p, centro_custo: e.target.value }))} />
              </div>
              <div>
                <label style={lbl}>Produtor</label>
                <select style={inp} value={form.produtor_id} onChange={e => setForm(p => ({ ...p, produtor_id: e.target.value }))}>
                  <option value="">Sem vínculo</option>
                  {produtores.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
                </select>
              </div>

              {form.moeda === "BRL" && (
                <div>
                  <label style={lbl}>Valor Total (R$) *</label>
                  <input style={inp} type="text" inputMode="numeric" placeholder="0,00" value={form.valorMask} onChange={e => setForm(p => ({ ...p, valorMask: aplicarMascara(e.target.value) }))} />
                </div>
              )}
              {form.moeda === "USD" && (
                <>
                  <div>
                    <label style={lbl}>Valor (US$) *</label>
                    <input style={inp} type="text" inputMode="numeric" placeholder="0,00" value={form.valorMask} onChange={e => setForm(p => ({ ...p, valorMask: aplicarMascara(e.target.value) }))} />
                  </div>
                  <div>
                    <label style={lbl}>Cotação R$/US$</label>
                    <input style={inp} type="text" inputMode="numeric" placeholder="5,12" value={form.cotacaoMask} onChange={e => setForm(p => ({ ...p, cotacaoMask: aplicarMascara(e.target.value) }))} />
                  </div>
                  {form.valorMask && form.cotacaoMask && (
                    <div style={{ gridColumn: "1/-1", background: "#FEF3E2", borderRadius: 8, padding: "8px 12px", fontSize: 11, color: "#7A4300" }}>
                      Equivalente: <strong>{fmtBRL(desmascarar(form.valorMask) * desmascarar(form.cotacaoMask))}</strong>
                    </div>
                  )}
                </>
              )}
              {form.moeda === "barter" && (
                <>
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
                    <label style={lbl}>Preço de referência (R$/sc)</label>
                    <input style={inp} type="text" inputMode="numeric" placeholder="120,00" value={form.precoSacaMask} onChange={e => setForm(p => ({ ...p, precoSacaMask: aplicarMascara(e.target.value) }))} />
                  </div>
                </>
              )}
            </div>

            {/* Condição de Pagamento */}
            <div style={{ marginTop: 18, borderTop: "0.5px solid #DEE5EE", paddingTop: 16 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: "#1a1a1a", marginBottom: 10 }}>Condição de Pagamento</div>
              <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
                {(["avista", "prazo"] as const).map(v => (
                  <button key={v} type="button"
                    onClick={() => { setForm(p => ({ ...p, condicao: v })); if (v === "avista") setParcelas([]); }}
                    style={{
                      flex: 1, padding: "10px", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer",
                      border: "0.5px solid " + (form.condicao === v ? "#C9921B" : "#D4DCE8"),
                      background: form.condicao === v ? "#FBF3E0" : "#fff",
                      color: form.condicao === v ? "#7A5200" : "#555",
                    }}>
                    {v === "avista" ? "À Vista" : "Parcelado"}
                  </button>
                ))}
              </div>

              {form.condicao === "prazo" && (<>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, alignItems: "end", marginBottom: 12 }}>
                  <div>
                    <label style={lbl}>Nº de parcelas</label>
                    <input style={inp} type="number" min="2" max="120" value={form.qtdParcelas}
                      onChange={e => setForm(p => ({ ...p, qtdParcelas: e.target.value }))} />
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
                    style={{ padding: "8px 14px", borderRadius: 8, border: "0.5px solid #1A5CB8", background: "#D5E8F5", color: "#0B2D50", fontWeight: 600, cursor: "pointer", fontSize: 12, whiteSpace: "nowrap", opacity: !form.vencimento || !form.valorMask ? 0.4 : 1 }}>
                    Gerar parcelas
                  </button>
                </div>

                {parcelas.length > 0 && (
                  <div style={{ overflowX: "auto" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, marginBottom: 8 }}>
                      <thead>
                        <tr style={{ background: "#F3F6F9" }}>
                          {["#", "Vencimento", "Valor (R$)"].map((h, i) => (
                            <th key={i} style={{ padding: "5px 8px", textAlign: i === 2 ? "right" : i === 0 ? "center" : "left", fontSize: 11, fontWeight: 600, color: "#555", borderBottom: "0.5px solid #D4DCE8" }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {parcelas.map((p, i) => (
                          <tr key={i} style={{ borderBottom: "0.5px solid #DEE5EE" }}>
                            <td style={{ padding: "4px 8px", textAlign: "center", color: "#555", fontSize: 11, width: 40 }}>{i + 1}/{parcelas.length}</td>
                            <td style={{ padding: "4px 8px" }}>
                              <input style={{ ...inp, fontSize: 12 }} type="date" value={p.data}
                                onChange={e => setParcelas(prev => prev.map((x, j) => j === i ? { ...x, data: e.target.value } : x))} />
                            </td>
                            <td style={{ padding: "4px 8px" }}>
                              <input style={{ ...inp, fontSize: 12, textAlign: "right" }} type="text" inputMode="numeric" value={p.valorMask}
                                onChange={e => setParcelas(prev => prev.map((x, j) => j === i ? { ...x, valorMask: aplicarMascara(e.target.value) } : x))} />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr style={{ background: "#F3F6F9" }}>
                          <td colSpan={2} style={{ padding: "5px 8px", textAlign: "right", fontSize: 11, fontWeight: 600, color: "#555" }}>Total:</td>
                          <td style={{ padding: "5px 8px", textAlign: "right", fontWeight: 700, color: "#1A4870" }}>
                            {fmtBRL(parcelas.reduce((s, p) => s + desmascarar(p.valorMask), 0))}
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                )}
                {parcelas.length === 0 && (
                  <div style={{ fontSize: 11, color: "#888", padding: "8px 12px", background: "#F4F6FA", borderRadius: 7 }}>
                    Preencha 1º Vencimento e Valor, depois clique em "Gerar parcelas" para editar as datas individualmente.
                  </div>
                )}
              </>)}
            </div>

            {/* Adicionais */}
            <div style={{ marginTop: 18, borderTop: "0.5px solid #DEE5EE", paddingTop: 14 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: "#555", marginBottom: 12 }}>Adicionais — LCDPR, encargos e vínculos</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
                {/* Operação Gerencial */}
                <div style={{ gridColumn: "1/-1" }}>
                  <label style={lbl}>Operação Gerencial <span style={{ color: "#888", fontWeight: 400 }}>(débito / crédito contábil)</span></label>
                  <select style={inp} value={form.operacao_gerencial_id}
                    onChange={e => setForm(p => ({ ...p, operacao_gerencial_id: e.target.value }))}>
                    <option value="">— Sem vínculo contábil —</option>
                    {Object.entries(
                      opGerenciais.reduce((acc, o) => {
                        const parts = (o.classificacao ?? "").split(".");
                        const grpKey = parts.slice(0, 3).join(".");
                        (acc[grpKey] = acc[grpKey] ?? []).push(o);
                        return acc;
                      }, {} as Record<string, typeof opGerenciais>)
                    ).map(([grpKey, ops]) => (
                      <optgroup key={grpKey} label={grpKey}>
                        {ops.map(o => <option key={o.id} value={o.id}>{o.classificacao} — {o.descricao}</option>)}
                      </optgroup>
                    ))}
                  </select>
                  {form.operacao_gerencial_id && (() => {
                    const op = opGerenciais.find(o => o.id === form.operacao_gerencial_id);
                    if (!op) return null;
                    return (
                      <div style={{ marginTop: 4, padding: "6px 10px", background: "#F0F7FF", borderRadius: 7, border: "0.5px solid #C5DCF5", fontSize: 11, color: "#0B2D50", display: "flex", gap: 16 }}>
                        <span>Débito: <strong>{op.conta_debito || "—"}</strong></span>
                        <span>Crédito: <strong>{op.conta_credito || "—"}</strong></span>
                      </div>
                    );
                  })()}
                </div>
                <div>
                  <label style={lbl}>Tipo Documento LCDPR</label>
                  <select style={inp} value={form.tipo_documento_lcdpr} onChange={e => setForm(p => ({ ...p, tipo_documento_lcdpr: e.target.value as typeof form.tipo_documento_lcdpr }))}>
                    <option value="RECIBO">Recibo</option><option value="NF">Nota Fiscal</option>
                    <option value="DUPLICATA">Duplicata</option><option value="CHEQUE">Cheque</option>
                    <option value="PIX">PIX</option><option value="TED">TED</option><option value="OUTROS">Outros</option>
                  </select>
                </div>
                <div>
                  <label style={lbl}>Chave XML / NF-e</label>
                  <input style={inp} placeholder="Opcional" value={form.chave_xml} onChange={e => setForm(p => ({ ...p, chave_xml: e.target.value }))} />
                </div>
                <div>
                  <label style={lbl}>Centro de Custo</label>
                  <input style={inp} placeholder="Ex: Talhão 3 / Safra soja 26" value={form.centro_custo} onChange={e => setForm(p => ({ ...p, centro_custo: e.target.value }))} />
                </div>
                <div>
                  <label style={lbl}>% Juros a.m.</label>
                  <input style={inp} type="number" step="0.01" placeholder="0,00" value={form.juros_pct} onChange={e => setForm(p => ({ ...p, juros_pct: e.target.value }))} />
                </div>
                <div>
                  <label style={lbl}>% Multa por atraso</label>
                  <input style={inp} type="number" step="0.01" placeholder="0,00" value={form.multa_pct} onChange={e => setForm(p => ({ ...p, multa_pct: e.target.value }))} />
                </div>
                <div>
                  <label style={lbl}>Observação</label>
                  <input style={inp} placeholder="Opcional" value={form.obs} onChange={e => setForm(p => ({ ...p, obs: e.target.value }))} />
                </div>
              </div>
            </div>

            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 20 }}>
              <button onClick={() => setModalNovo(false)} style={{ padding: "8px 18px", border: "0.5px solid #D4DCE8", borderRadius: 8, background: "transparent", cursor: "pointer", fontSize: 13 }}>Cancelar</button>
              <button onClick={adicionarLancamento} disabled={disabled}
                style={{ padding: "8px 18px", background: disabled ? "#666" : "#C9921B", color: "#fff", border: "none", borderRadius: 8, fontWeight: 600, cursor: "pointer", fontSize: 13 }}>
                {salvando ? "Salvando…" : form.condicao === "prazo" && parcelas.length > 0 ? `◈ Criar ${parcelas.length} parcelas` : form.condicao === "prazo" ? `◈ Criar ${Math.max(2, Number(form.qtdParcelas) || 2)} parcelas` : "◈ Salvar"}
              </button>
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
    padding: "8px 10px",
    textAlign: align,
    fontSize: 11,
    fontWeight: 600,
    color: "#555",
    borderBottom: "0.5px solid #D4DCE8",
    whiteSpace: "nowrap",
  };
}
