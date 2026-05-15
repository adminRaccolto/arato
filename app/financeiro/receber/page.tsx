"use client";
import { useState, useEffect, useMemo } from "react";
import TopNav from "../../../components/TopNav";
import { useAuth } from "../../../components/AuthProvider";
import FazendaSelector from "../../../components/FazendaSelector";
import { listarLancamentosPeriodo, criarLancamento, criarParcelamento, baixarLancamento, criarPagamentoLote, listarAnosSafra, listarProdutores, listarPessoas, listarOperacoesGerenciaisAtivas } from "../../../lib/db";
import type { Lancamento, AnoSafra, Produtor, Pessoa, OperacaoGerencial } from "../../../lib/supabase";
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
  manual:              { label: "Manual",          bg: "#F1EFE8", cl: "#555",     border: "#DDE2EE" },
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
  baixado:   { cor: "#16A34A", title: "Recebido"   },
}[s] ?? { cor: "#888", title: s });

// ── Estilos ───────────────────────────────────────────────────
const inp: React.CSSProperties = { width: "100%", padding: "8px 10px", border: "0.5px solid #D4DCE8", borderRadius: 8, fontSize: 13, background: "#fff", boxSizing: "border-box", outline: "none" };
const inpF: React.CSSProperties = { width: "100%", padding: "4px 7px", border: "0.5px solid #D4DCE8", borderRadius: 6, fontSize: 11, background: "#FAFBFC", boxSizing: "border-box", outline: "none" };
const lbl: React.CSSProperties = { fontSize: 11, color: "#555", marginBottom: 4, display: "block" };

// ═══════════════════════════════════════════════════════════════
export default function ContasReceber() {
  const { fazendaId, contaId } = useAuth();
  const [formFazendaId, setFormFazendaId] = useState<string | null>(null);
  const fid = formFazendaId ?? fazendaId;

  const [lancamentos,  setLancamentos]  = useState<Lancamento[]>([]);
  const [anosSafra,    setAnosSafra]    = useState<AnoSafra[]>([]);
  const [produtores,   setProdutores]   = useState<Produtor[]>([]);
  const [pessoas,      setPessoas]      = useState<Pessoa[]>([]);
  const [contas,       setContas]       = useState<ContaBancariaMin[]>([]);
  const [opGerenciais, setOpGerenciais] = useState<OperacaoGerencial[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [erro,     setErro]     = useState<string | null>(null);
  const [filtro,   setFiltro]   = useState<Filtro>("aberto");

  // ── Janela de 6 meses por padrão ────────────────────────────
  const [periodoInicio, setPeriodoInicio] = useState(() => {
    const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - 6);
    return d.toISOString().split("T")[0];
  });
  const [periodoFim, setPeriodoFim] = useState(() => {
    const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() + 7); d.setDate(0);
    return d.toISOString().split("T")[0];
  });

  const [modalBaixa, setModalBaixa] = useState<Lancamento | null>(null);
  const [modalNovo,  setModalNovo]  = useState(false);

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
    pessoa_id: "", descricao: "", categoria: CATS_CR[0], vencimento: "",
    valorMask: "", cotacaoMask: "5,12",
    sacasMask: "", culturaBarter: "soja", precoSacaMask: "120,00", obs: "",
    parcelar: false, totalParcelas: "1", intervaloMeses: "1",
    tipo_documento_lcdpr: "RECIBO" as NonNullable<Lancamento["tipo_documento_lcdpr"]>,
    forma_recebimento: "PIX",
    conta_recebimento: "",
    chave_xml: "", centro_custo: "",
    ano_safra_id: "", produtor_id: "",
    operacao_gerencial_id: "",
    natureza: "real" as "real" | "previsao",
  });

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

  // ── Carga ──────────────────────────────────────────────────

  useEffect(() => {
    if (fazendaId) {
      carregar();
    }
  }, [fazendaId, periodoInicio, periodoFim]);

  useEffect(() => {
    if (fazendaId) {
      listarAnosSafra(fazendaId).then(setAnosSafra).catch(() => {});
      listarProdutores(fazendaId).then(setProdutores).catch(() => {});
      listarPessoas(fazendaId).then(setPessoas).catch(() => {});
      listarOperacoesGerenciaisAtivas(fazendaId, { tipo: "receita", permite: "cp_cr" }).then(setOpGerenciais).catch(() => {});
      supabase.from("contas_bancarias").select("id, nome, banco, agencia, conta").eq("fazenda_id", fazendaId).eq("ativa", true).then(({ data }) => setContas(data ?? []));
    }
  }, [fazendaId]);

  async function carregar() {
    setLoading(true);
    setErro(null);
    try {
      const dados = await listarLancamentosPeriodo(fazendaId!, periodoInicio, periodoFim, "receber");
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

  const lancOper     = lancamentos.filter(l => l.moeda !== "barter" && (l.natureza ?? "real") === "real");
  const totalAberto  = lancOper.filter(l => l.status !== "baixado").reduce((a, l) => a + paraBRL(l), 0);
  const qAberto      = lancOper.filter(l => l.status !== "baixado").length;
  const qVencido     = lancamentos.filter(l => l.status === "vencido").length;
  const qVencendo    = lancamentos.filter(l => l.status === "vencendo").length;

  const d30 = new Date(TODAY); d30.setDate(d30.getDate() + 30);
  const d30Key = d30.toISOString().split("T")[0];
  const aVencer30 = lancOper.filter(l => l.status !== "baixado" && (l.data_vencimento ?? "") <= d30Key)
                      .reduce((a, l) => a + paraBRL(l), 0);

  const mesAtual       = TODAY.slice(0, 7);
  const recebidosNoMes = lancamentos.filter(l => l.status === "baixado" && (l.data_baixa ?? "").startsWith(mesAtual))
                          .reduce((a, l) => a + (l.valor_pago ?? paraBRL(l)), 0);

  const totalBarter = lancamentos.filter(l => l.moeda === "barter" && l.status !== "baixado").reduce((a, l) => a + l.valor, 0);
  const qtdBarter   = lancamentos.filter(l => l.moeda === "barter" && l.status !== "baixado").length;

  // ── Filtragem e ordenação ──────────────────────────────────

  const filtradosBase = useMemo(() => {
    let arr = lancamentos.filter(l => {
      const isReal = (l.natureza ?? "real") === "real";
      if (filtro === "aberto")   return isReal && l.status === "em_aberto" && l.moeda !== "barter";
      if (filtro === "vencido")  return isReal && (l.status === "vencido" || l.status === "vencendo");
      if (filtro === "baixado")  return isReal && l.status === "baixado";
      if (filtro === "barter")   return isReal && l.moeda === "barter";
      if (filtro === "previsao") return l.natureza === "previsao";
      return true;
    });
    arr = arr.sort((a, b) => (a.data_vencimento ?? "") < (b.data_vencimento ?? "") ? -1 : 1);
    return arr;
  }, [lancamentos, filtro]);

  const filtrados = useMemo(() => {
    return filtradosBase.filter(l => {
      const prodLabel = produtores.find(p => p.id === l.produtor_id)?.nome ?? "";
      if (fFornecedor && !l.descricao.toLowerCase().includes(fFornecedor.toLowerCase()))        return false;
      if (fOperacao   && !l.categoria.toLowerCase().includes(fOperacao.toLowerCase()))          return false;
      if (fSafra      && l.ano_safra_id !== fSafra)                                             return false;
      if (fVencDe     && (l.data_vencimento ?? "") < fVencDe)                                   return false;
      if (fVencAte    && (l.data_vencimento ?? "") > fVencAte)                                  return false;
      if (fMoedaOrig  && l.moeda !== fMoedaOrig)                                                return false;
      if (fConta      && !(l.conta_bancaria ?? "").toLowerCase().includes(fConta.toLowerCase())) return false;
      if (fProdutor   && !prodLabel.toLowerCase().includes(fProdutor.toLowerCase()))             return false;
      if (fObs        && !(l.observacao ?? "").toLowerCase().includes(fObs.toLowerCase()))       return false;
      return true;
    });
  }, [filtradosBase, fFornecedor, fOperacao, fSafra, fVencDe, fVencAte, fMoedaOrig, fConta, fProdutor, fObs, produtores]);

  // ── Baixar ─────────────────────────────────────────────────

  const abrirBaixa = (l: Lancamento) => {
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
    const abertos = filtrados.filter(l => l.status !== "baixado").map(l => l.id);
    const todosSel = abertos.every(id => selecionados.has(id));
    setSelecionados(todosSel ? new Set() : new Set(abertos));
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
      setForm(f => ({ ...f, pessoa_id: "", descricao: "", vencimento: "", valorMask: "", sacasMask: "", obs: "", parcelar: false, totalParcelas: "1", conta_recebimento: "", forma_recebimento: "PIX" }));
      setModalNovo(false);
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

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh", background: "#F3F6F9", fontFamily: "system-ui, sans-serif", fontSize: 13 }}>
      <TopNav />
      <main style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>

        {/* Header */}
        <header style={{ background: "#fff", borderBottom: "0.5px solid #D4DCE8", padding: "12px 24px" }}>
          <div style={{ display: "flex", flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
            <div>
              <h1 style={{ margin: 0, fontSize: 18, fontWeight: 600, color: "#1a1a1a" }}>Contas a Receber</h1>
              <p style={{ margin: "2px 0 0", fontSize: 11, color: "#444" }}>Vendas de grãos, serviços, arrendamentos e outros recebimentos — ordenados por vencimento</p>
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
                onClick={() => { setFormFazendaId(fazendaId); setModalNovo(true); }}
                style={{ background: "#1A4870", color: "#fff", border: "none", borderRadius: 8, padding: "9px 18px", fontSize: 13, fontWeight: 600, cursor: "pointer", marginLeft: 4 }}
              >
                ↓ Nova Conta a Receber
              </button>
            </div>
          </div>
        </header>

        <div style={{ padding: "18px 24px", flex: 1, overflowY: "auto" }}>

          {/* Stats */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 18 }}>
            {[
              { label: "Total a receber",    valor: fmtBRL(totalAberto),         cor: "#1A4870", sub: `${qAberto} lançamentos em aberto` },
              { label: "A vencer (30 dias)", valor: fmtBRL(aVencer30),            cor: "#378ADD", sub: "Previsão de recebimento" },
              { label: "Vencidos/Vencendo",  valor: String(qVencido + qVencendo), cor: (qVencido + qVencendo) > 0 ? "#E24B4A" : "#444", sub: "Aguardam liquidação" },
              { label: `Recebido em ${mesAtual.slice(0,7)}`, valor: fmtBRL(recebidosNoMes), cor: "#1A4870", sub: "Total de baixas no mês" },
            ].map((s, i) => (
              <div key={i} style={{ background: "#fff", border: "0.5px solid #D4DCE8", borderRadius: 12, padding: "14px 18px" }}>
                <div style={{ fontSize: 11, color: "#555", marginBottom: 5 }}>{s.label}</div>
                <div style={{ fontSize: 20, fontWeight: 700, color: s.cor, marginBottom: 3 }}>{s.valor}</div>
                <div style={{ fontSize: 10, color: "#444" }}>{s.sub}</div>
              </div>
            ))}
          </div>

          {/* Banner barter */}
          {qtdBarter > 0 && (
            <div style={{ background: "#FBF3E0", border: "0.5px solid #8B5E1430", borderRadius: 8, padding: "9px 14px", marginBottom: 12, fontSize: 12, color: "#8B5E14", display: "flex", gap: 8 }}>
              <span>⇄</span>
              <span><strong>{qtdBarter} lançamento(s) em barter</strong> — equivalente gerencial: <strong>{fmtBRL(totalBarter)}</strong> · não compõem o fluxo de caixa</span>
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
                  { key: "aberto",   label: "Em aberto",  count: lancOper.filter(l => l.status !== "baixado").length,                                                 azul: false },
                  { key: "vencido",  label: "Vencidos",   count: qVencido + qVencendo,                                                                                azul: false },
                  { key: "baixado",  label: "Recebidos",  count: lancamentos.filter(l => (l.natureza ?? "real") === "real" && l.status === "baixado").length,           azul: false },
                  { key: "barter",   label: "Barter",     count: lancamentos.filter(l => (l.natureza ?? "real") === "real" && l.moeda === "barter").length,             azul: false },
                  { key: "previsao", label: "Previsões",  count: lancamentos.filter(l => l.natureza === "previsao").length,                                            azul: true  },
                  { key: "todos",    label: "Todos",      count: lancamentos.length,                                                                                   azul: false },
                ] as { key: Filtro; label: string; count: number; azul: boolean }[]).map(f => (
                  <button
                    key={f.key}
                    onClick={() => setFiltro(f.key)}
                    style={{
                      padding: "5px 12px", borderRadius: 20, border: "0.5px solid",
                      borderColor: filtro === f.key ? "#1A4870" : "#D4DCE8",
                      background:  filtro === f.key ? "#D5E8F5" : "transparent",
                      color:       filtro === f.key ? "#0B2D50" : "#666",
                      fontWeight: filtro === f.key ? 600 : 400, fontSize: 12, cursor: "pointer",
                    }}
                  >
                    {f.label}
                    <span style={{ marginLeft: 5, fontSize: 10, background: filtro === f.key ? "#1A4870" : (f.azul && f.count > 0 ? "#1A5CB820" : "#DEE5EE"), color: filtro === f.key ? "#fff" : (f.azul && f.count > 0 ? "#1A5CB8" : "#555"), padding: "1px 5px", borderRadius: 8, fontWeight: f.azul && f.count > 0 ? 700 : 400 }}>
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

              {/* Tabela */}
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
                        <th style={thS(200, "left")}>Fornecedor / Cliente</th>
                        <th style={thS(110, "center")}>Origem</th>
                        <th style={thS(160, "left")}>Operação</th>
                        <th style={thS(120, "left")}>Safra</th>
                        <th style={thS(100, "center")}>Vencimento ↑</th>
                        <th style={thS(120, "right")}>Valor</th>
                        <th style={thS(100, "center")}>Dt. Receb.</th>
                        <th style={thS(110, "right")}>Valor Receb.</th>
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
                        const conv      = l.moeda === "USD" ? `≈ ${fmtBRL(l.valor * (l.cotacao_usd ?? COTACAO_USD))}` : null;
                        const prod      = produtores.find(p => p.id === l.produtor_id)?.nome ?? "—";
                        const safra     = anosSafra.find(a => a.id === l.ano_safra_id)?.descricao ?? "—";
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
                            {/* Fornecedor/Cliente */}
                            <td style={{ padding: "10px 10px" }}>
                              <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                                <span style={{ fontWeight: 600, fontSize: 12, color: "#1a1a1a", whiteSpace: "nowrap" }}>{fornNome}</span>
                                {isPrevisao && <span style={{ fontSize: 9, background: "#1A5CB8", color: "#fff", padding: "1px 5px", borderRadius: 5, fontWeight: 700, letterSpacing: "0.05em" }}>PREVISÃO</span>}
                              </div>
                              {l.nfe_numero && (
                                <div style={{ fontSize: 10, color: "#555", marginTop: 1 }}>NF-e {l.nfe_numero}</div>
                              )}
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
                              <span style={{ fontSize: 10, background: "#D5E8F5", color: "#0B2D50", padding: "2px 7px", borderRadius: 8, whiteSpace: "nowrap" }}>{l.categoria}</span>
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
                              <div style={{ fontWeight: 600, color: l.moeda === "barter" ? "#8B5E14" : "#1A4870", fontSize: 13 }}>{exibirValor(l)}</div>
                              {conv && <div style={{ fontSize: 10, color: "#888" }}>{conv}</div>}
                            </td>
                            {/* Data Receb */}
                            <td style={{ padding: "10px 10px", textAlign: "center", fontSize: 11, color: "#16A34A", whiteSpace: "nowrap" }}>
                              {fmtData(l.data_baixa)}
                            </td>
                            {/* Valor Recebido */}
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
                              {l.conta_bancaria ?? "—"}
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
                                  style={{ fontSize: 11, padding: "4px 11px", borderRadius: 6, cursor: "pointer", fontWeight: 600, whiteSpace: "nowrap", background: l.moeda === "barter" ? "#FBF3E0" : "#D5E8F5", color: l.moeda === "barter" ? "#8B5E14" : "#0B2D50", border: `0.5px solid ${l.moeda === "barter" ? "#8B5E14" : "#1A4870"}` }}
                                >
                                  {l.moeda === "barter" ? "⇄ Confirmar" : "↓ Receber"}
                                </button>
                              ) : null}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>

              <div style={{ padding: "10px 16px", borderTop: "0.5px solid #DEE5EE", display: "flex", justifyContent: "space-between", fontSize: 11, color: "#444" }}>
                <span>CR automáticas (NF-e): <strong style={{ color: "#1A4870" }}>{lancamentos.filter(l => l.auto).length}</strong></span>
                <span>Exibindo {filtrados.length} de {filtradosBase.length} registros</span>
              </div>
            </div>
          )}
        </div>
      </main>

      {/* ── Barra flutuante de seleção (borderô) ─────────────── */}
      {selecionados.size > 0 && (
        <div style={{
          position: "fixed", bottom: 24, left: "50%", transform: "translateX(-50%)",
          background: "#1A4870", color: "#fff", borderRadius: 14,
          padding: "12px 22px", display: "flex", alignItems: "center", gap: 18,
          boxShadow: "0 6px 24px rgba(0,0,0,0.25)", zIndex: 90, whiteSpace: "nowrap",
        }}>
          <span style={{ fontSize: 13 }}>
            <strong>{selecionados.size}</strong> título{selecionados.size !== 1 ? "s" : ""} selecionado{selecionados.size !== 1 ? "s" : ""}
            &nbsp;·&nbsp;
            <strong>{fmtBRL(totalLote)}</strong>
          </span>
          <button
            onClick={() => { setLoteData(TODAY); setLoteConta(""); setLoteDesc(""); setLoteErro(""); setModalLote(true); }}
            style={{ background: "#16A34A", color: "#fff", border: "none", borderRadius: 8, padding: "7px 16px", fontWeight: 700, fontSize: 13, cursor: "pointer" }}
          >
            Receber em Lote ›
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
              {modalBaixa.moeda === "barter" ? "Confirmar entrega (barter)" : "Registrar recebimento"}
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
                  <label style={lbl}>Valor recebido (R$) *
                    {modalBaixa.moeda === "USD" && (
                      <span style={{ fontSize: 10, color: "#7A4300", marginLeft: 8, fontWeight: 400 }}>
                        Venda em {fmtUSD(modalBaixa.valor)} ≈ {fmtBRL(modalBaixa.valor * (modalBaixa.cotacao_usd ?? COTACAO_USD))}
                      </span>
                    )}
                  </label>
                  <input style={inp} type="text" inputMode="numeric" placeholder="0,00" value={baixa.valorMask}
                    onChange={e => setBaixa(p => ({ ...p, valorMask: aplicarMascara(e.target.value) }))} />
                  {desmascarar(baixa.valorMask) > 0 && desmascarar(baixa.valorMask) < paraBRL(modalBaixa) && (
                    <div style={{ fontSize: 10, color: "#EF9F27", marginTop: 4 }}>
                      Recebimento parcial — restante: {fmtBRL(paraBRL(modalBaixa) - desmascarar(baixa.valorMask))}
                    </div>
                  )}
                </div>
                <div>
                  <label style={lbl}>Data da liquidação</label>
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

            <div style={{ marginTop: 14, background: "#D5E8F5", borderRadius: 8, padding: "8px 12px", fontSize: 11, color: "#0B2D50" }}>
              ◈ Ação manual — você confirma que o valor foi recebido na conta selecionada.
            </div>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 16 }}>
              <button onClick={() => setModalBaixa(null)} style={{ padding: "8px 18px", border: "0.5px solid #D4DCE8", borderRadius: 8, background: "transparent", cursor: "pointer", fontSize: 13 }}>Cancelar</button>
              <button onClick={confirmarBaixa} disabled={salvando || (modalBaixa.moeda !== "barter" && !baixa.valorMask)}
                style={{ padding: "8px 18px", background: "#1A4870", color: "#fff", border: "none", borderRadius: 8, fontWeight: 600, cursor: "pointer", fontSize: 13 }}>
                {salvando ? "Salvando…" : "↓ Confirmar recebimento"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal Recebimento em Lote ────────────────────────── */}
      {modalLote && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }}
          onClick={e => { if (e.target === e.currentTarget) setModalLote(false); }}>
          <div style={{ background: "#fff", borderRadius: 12, width: "100%", maxWidth: 580, maxHeight: "90vh", overflowY: "auto" as const, boxShadow: "0 20px 60px rgba(0,0,0,0.2)" }}>
            <div style={{ padding: "16px 22px", borderBottom: "0.5px solid #D4DCE8", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 15, color: "#1a1a1a" }}>Recebimento em Lote (Borderô)</div>
                <div style={{ fontSize: 11, color: "#555", marginTop: 2 }}>{itensLote.length} título{itensLote.length !== 1 ? "s" : ""} · total {fmtBRL(totalLote)}</div>
              </div>
              <button onClick={() => setModalLote(false)} style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer", color: "#555" }}>×</button>
            </div>
            <div style={{ padding: "18px 22px" }}>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 12, marginBottom: 16 }}>
                <div>
                  <label style={{ fontSize: 11, color: "#555", marginBottom: 3, display: "block" }}>Data do Recebimento *</label>
                  <input type="date" style={{ width: "100%", padding: "8px 10px", border: "0.5px solid #D4DCE8", borderRadius: 8, fontSize: 13, background: "#fff", boxSizing: "border-box" as const, outline: "none" }} value={loteData} onChange={e => setLoteData(e.target.value)} />
                </div>
                <div>
                  <label style={{ fontSize: 11, color: "#555", marginBottom: 3, display: "block" }}>Conta Bancária *</label>
                  <select style={{ width: "100%", padding: "8px 10px", border: "0.5px solid #D4DCE8", borderRadius: 8, fontSize: 13, background: "#fff", boxSizing: "border-box" as const, outline: "none" }} value={loteConta} onChange={e => setLoteConta(e.target.value)}>
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
                  <input style={{ width: "100%", padding: "8px 10px", border: "0.5px solid #D4DCE8", borderRadius: 8, fontSize: 13, background: "#fff", boxSizing: "border-box" as const, outline: "none" }} value={loteDesc} onChange={e => setLoteDesc(e.target.value)} placeholder={`Borderô ${loteData} — ${itensLote.length} títulos`} />
                </div>
              </div>

              <div style={{ border: "0.5px solid #D4DCE8", borderRadius: 8, overflow: "hidden", marginBottom: 14 }}>
                <div style={{ background: "#F3F6F9", padding: "6px 12px", fontSize: 10, fontWeight: 700, color: "#555", textTransform: "uppercase" as const, display: "grid", gridTemplateColumns: "1fr auto auto", gap: 8 }}>
                  <span>Título</span><span>Vencimento</span><span style={{ textAlign: "right" as const }}>Valor</span>
                </div>
                {itensLote.map((l, i) => (
                  <div key={l.id} style={{ display: "grid", gridTemplateColumns: "1fr auto auto", gap: 8, padding: "8px 12px", borderTop: i > 0 ? "0.5px solid #EEF1F6" : "none", fontSize: 12, alignItems: "center" }}>
                    <span style={{ color: "#1a1a1a", fontWeight: 500 }}>{exibirFornecedor(l.descricao)}</span>
                    <span style={{ color: "#555", whiteSpace: "nowrap" as const }}>{fmtData(l.data_vencimento)}</span>
                    <span style={{ fontWeight: 600, color: "#16A34A", textAlign: "right" as const, whiteSpace: "nowrap" as const }}>{exibirValor(l)}</span>
                  </div>
                ))}
                <div style={{ background: "#F3F6F9", padding: "8px 12px", display: "flex", justifyContent: "space-between", borderTop: "0.5px solid #D4DCE8" }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: "#555" }}>Total do lote</span>
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
                <button onClick={() => setModalLote(false)} style={{ padding: "8px 18px", border: "0.5px solid #D4DCE8", borderRadius: 8, background: "#fff", cursor: "pointer", fontSize: 13 }}>Cancelar</button>
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
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }}
          onClick={e => { if (e.target === e.currentTarget) setModalNovo(false); }}>
          <div style={{ background: "#fff", borderRadius: 12, width: "100%", maxWidth: 600, maxHeight: "92vh", overflowY: "auto" as const, boxShadow: "0 20px 60px rgba(0,0,0,0.2)", padding: 24 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
              <div style={{ fontWeight: 600, fontSize: 16, color: "#1a1a1a" }}>Nova Conta a Receber</div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <FazendaSelector contaId={contaId} value={fid} onChange={setFormFazendaId} />
                <div style={{ display: "flex", gap: 0, border: "0.5px solid #D4DCE8", borderRadius: 8, overflow: "hidden" }}>
                {(["real", "previsao"] as const).map(n => (
                  <button key={n} onClick={() => setForm(p => ({ ...p, natureza: n }))}
                    style={{ padding: "5px 14px", border: "none", cursor: "pointer", fontSize: 12, fontWeight: form.natureza === n ? 700 : 400,
                      background: form.natureza === n ? (n === "previsao" ? "#1A5CB8" : "#1A4870") : "#fff",
                      color: form.natureza === n ? "#fff" : "#666" }}>
                    {n === "real" ? "Real" : "Previsão"}
                  </button>
                ))}
              </div>
            </div>
          </div>
            <div style={{ fontSize: 12, color: "#555", marginBottom: 18 }}>
              {form.natureza === "previsao"
                ? "Previsão de receita — não gera movimentação financeira real. Confirme quando o recebimento for efetivado."
                : "Vendas de grãos são lançadas automaticamente a partir de NF-e autorizadas."}
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
                <label style={lbl}>Operação Gerencial <span style={{ color: "#888", fontWeight: 400 }}>— classifica e vincula ao plano de contas</span></label>
                <select style={inp} value={form.operacao_gerencial_id}
                  onChange={e => {
                    const id = e.target.value;
                    const op = opGerenciais.find(o => o.id === id);
                    setForm(p => ({
                      ...p,
                      operacao_gerencial_id: id,
                      categoria: op ? derivarCategoriaReceita(op.classificacao ?? "") : p.categoria,
                    }));
                  }}>
                  <option value="">— Selecionar operação —</option>
                  {Object.entries(
                    opGerenciais.reduce((acc, o) => {
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
                {form.operacao_gerencial_id && (() => {
                  const op = opGerenciais.find(o => o.id === form.operacao_gerencial_id);
                  if (!op?.conta_debito && !op?.conta_credito) return null;
                  return (
                    <div style={{ marginTop: 4, padding: "5px 10px", background: "#F0F7FF", borderRadius: 7, border: "0.5px solid #C5DCF5", fontSize: 11, color: "#0B2D50", display: "flex", gap: 16 }}>
                      <span>Débito: <strong>{op.conta_debito || "—"}</strong></span>
                      <span>Crédito: <strong>{op.conta_credito || "—"}</strong></span>
                    </div>
                  );
                })()}
              </div>
              <div style={{ gridColumn: "1/-1", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div>
                  <label style={lbl}>Cliente / Comprador</label>
                  <select style={inp} value={form.pessoa_id} onChange={e => setForm(p => ({ ...p, pessoa_id: e.target.value }))}>
                    <option value="">— Selecionar do cadastro —</option>
                    {pessoas.filter(p => p.cliente || (!p.cliente && !p.fornecedor)).map(p => (
                      <option key={p.id} value={p.id}>{p.nome}{p.fornecedor ? " (Cli/Forn)" : ""}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label style={lbl}>Descrição {!form.pessoa_id && <span style={{ color: "#E24B4A" }}>*</span>}</label>
                  <input style={inp} placeholder="Ex: Venda de soja — NF-e 001.430" value={form.descricao} onChange={e => setForm(p => ({ ...p, descricao: e.target.value }))} />
                </div>
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
              <div style={{ gridColumn: "1/-1" }}>
                <label style={lbl}>Conta de Recebimento</label>
                <select style={inp} value={form.conta_recebimento} onChange={e => setForm(p => ({ ...p, conta_recebimento: e.target.value }))}>
                  <option value="">— Selecionar conta —</option>
                  {contas.map(c => {
                    const label = c.nome || `${c.banco ?? ""} ${c.agencia ? `Ag.${c.agencia}` : ""} ${c.conta ? `C/C ${c.conta}` : ""}`.trim();
                    return <option key={c.id} value={label}>{label}</option>;
                  })}
                  {contas.length === 0 && <option disabled>Cadastre contas em Cadastros &gt; Contas Bancárias</option>}
                </select>
              </div>
              <div>
                <label style={lbl}>Safra</label>
                <select style={inp} value={form.ano_safra_id} onChange={e => setForm(p => ({ ...p, ano_safra_id: e.target.value }))}>
                  <option value="">Sem vínculo</option>
                  {anosSafra.map(a => <option key={a.id} value={a.id}>{a.descricao}</option>)}
                </select>
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
                  <label style={lbl}>Valor (R$) *</label>
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

            {/* Parcelamento */}
            <div style={{ marginTop: 18, borderTop: "0.5px solid #DEE5EE", paddingTop: 16 }}>
              <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 13, fontWeight: 600, color: "#1a1a1a", marginBottom: form.parcelar ? 12 : 0 }}>
                <input type="checkbox" checked={form.parcelar} onChange={e => setForm(p => ({ ...p, parcelar: e.target.checked }))} />
                Parcelar este recebimento
              </label>
              {form.parcelar && (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 12 }}>
                  <div>
                    <label style={lbl}>Nº de parcelas</label>
                    <input style={inp} type="number" min="2" max="60" value={form.totalParcelas} onChange={e => setForm(p => ({ ...p, totalParcelas: e.target.value }))} />
                  </div>
                  <div>
                    <label style={lbl}>Intervalo</label>
                    <select style={inp} value={form.intervaloMeses} onChange={e => setForm(p => ({ ...p, intervaloMeses: e.target.value }))}>
                      <option value="1">Mensal</option><option value="2">Bimestral</option>
                      <option value="3">Trimestral</option><option value="6">Semestral</option><option value="12">Anual</option>
                    </select>
                  </div>
                  {valParcela > 0 && totalParcDisplay > 1 && (
                    <div style={{ gridColumn: "1/-1", background: "#D5E8F5", borderRadius: 8, padding: "8px 12px", fontSize: 11, color: "#0B2D50" }}>
                      {totalParcDisplay}× {fmtBRL(valParcela)} = <strong>{fmtBRL(valParcela * totalParcDisplay)}</strong> total
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Adicionais */}
            <div style={{ marginTop: 18, borderTop: "0.5px solid #DEE5EE", paddingTop: 14 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: "#555", marginBottom: 12 }}>Adicionais — LCDPR e vínculos</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
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
                  <label style={lbl}>Centro de Custo / Talhão</label>
                  <input style={inp} placeholder="Ex: Talhão 3 / Safra soja 26" value={form.centro_custo} onChange={e => setForm(p => ({ ...p, centro_custo: e.target.value }))} />
                </div>
                <div style={{ gridColumn: "1/-1" }}>
                  <label style={lbl}>Observação</label>
                  <input style={inp} placeholder="Opcional" value={form.obs} onChange={e => setForm(p => ({ ...p, obs: e.target.value }))} />
                </div>
              </div>
            </div>

            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 20 }}>
              <button onClick={() => setModalNovo(false)} style={{ padding: "8px 18px", border: "0.5px solid #D4DCE8", borderRadius: 8, background: "transparent", cursor: "pointer", fontSize: 13 }}>Cancelar</button>
              <button onClick={adicionarLancamento} disabled={disabled}
                style={{ padding: "8px 18px", background: disabled ? "#666" : "#1A4870", color: "#fff", border: "none", borderRadius: 8, fontWeight: 600, cursor: "pointer", fontSize: 13 }}>
                {salvando ? "Salvando…" : form.parcelar && totalParcDisplay > 1 ? `Criar ${totalParcDisplay} parcelas` : "Salvar"}
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
