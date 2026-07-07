"use client";
import React, { useState, useEffect } from "react";
import TopNav from "../../components/TopNav";
import BalancaSerial from "../../components/BalancaSerial";
import {
  listarContratos, criarContrato, atualizarContrato, excluirContrato, encerrarContratosPorSafras,
  listarRomaneios, criarRomaneio,
  listarItensContrato, salvarItensContrato,
  listarCessaoDebitos, salvarCessaoDebitos,
  listarPessoas, listarProdutores, listarAnosSafra, listarCiclos, listarDepositos, listarFazendas,
  encerrarAnoSafra, reabrirAnoSafra,
  baixarLancamento,
} from "../../lib/db";
import { supabase } from "../../lib/supabase";
import InputNumerico from "../../components/InputNumerico";
import { useAuth } from "../../components/AuthProvider";
import ProdutorCombo from "../../components/ProdutorCombo";
import type { Contrato, ContratoItem, Romaneio, Pessoa, Produtor, AnoSafra, Ciclo, Deposito, Fazenda, AdiantamentoCliente, Cultura as CulturaContrato, Insumo } from "../../lib/supabase";
import InputMonetario from "../../components/InputMonetario";
import PlanoGate from "../../components/PlanoGate";

const sbErr = (e: unknown) => {
  if (e instanceof Error) return e.message;
  if (typeof e === "object" && e !== null) {
    const o = e as Record<string, unknown>;
    return String(o.message ?? o.details ?? JSON.stringify(e));
  }
  return String(e);
};

// ── Tabela fiscal de naturezas de operação ────────────────────────────────────
// Cada natureza carrega: descrição, CFOP intra (5xxx) e inter (6xxx), CST ICMS
// e uma nota fiscal/legal para orientar o usuário.
// O CFOP é auto-preenchido como inter-estadual (padrão MT → outros estados).
// O usuário pode substituir manualmente para intra-estadual quando necessário.
const NATUREZAS_OPERACAO = [
  {
    codigo: "VPE-PF",
    descricao: "Venda de Produção do Estabelecimento — Produtor Rural PF",
    cfop_intra: "5110", cfop_inter: "6101", cst_icms: "090",
    obs: "ICMS Diferido (Dec. MT 4.540/04). Operação padrão do produtor rural pessoa física. Funrural aplicável.",
  },
  {
    codigo: "VPE-PJ",
    descricao: "Venda de Produção do Estabelecimento — Produtor Rural PJ",
    cfop_intra: "5101", cfop_inter: "6101", cst_icms: "090",
    obs: "ICMS Diferido. Produtor rural com CNPJ/PJ. Aplicável a Lucro Presumido ou Produtor Rural PJ.",
  },
  {
    codigo: "VMT",
    descricao: "Venda de Mercadoria Adquirida ou Recebida de Terceiros",
    cfop_intra: "5102", cfop_inter: "6102", cst_icms: "090",
    obs: "Revenda de grão adquirido de outro produtor ou trading. ICMS Diferido.",
  },
  {
    codigo: "RVO",
    descricao: "Remessa para Venda à Ordem",
    cfop_intra: "5119", cfop_inter: "6119", cst_icms: "090",
    obs: "Operação triangular: produto sai do armazém diretamente ao comprador final. NF emitida pelo titular do estoque.",
  },
  {
    codigo: "REF",
    descricao: "Remessa Simbólica — Entrega Futura",
    cfop_intra: "5117", cfop_inter: "6117", cst_icms: "090",
    obs: "Faturamento antecipado. NF simbólica sem movimentação física. Entrega real ocorre depois.",
  },
  {
    codigo: "RAG",
    descricao: "Remessa para Armazém Geral (Depósito)",
    cfop_intra: "5905", cfop_inter: "6905", cst_icms: "090",
    obs: "Depósito em armazém de terceiros (cerealista). Não é venda. Não gera receita nem Funrural.",
  },
  {
    codigo: "TAG",
    descricao: "Retorno de Armazém Geral",
    cfop_intra: "5906", cfop_inter: "6906", cst_icms: "090",
    obs: "Retorno de mercadoria depositada em armazém geral. Natureza espelho da remessa.",
  },
  {
    codigo: "TRF",
    descricao: "Transferência entre Estabelecimentos do Produtor",
    cfop_intra: "5151", cfop_inter: "6151", cst_icms: "090",
    obs: "Transferência entre fazendas/filiais do mesmo CNPJ ou grupo. Não é venda.",
  },
  {
    codigo: "VFE-PF",
    descricao: "Venda com Fim Específico de Exportação — Produtor Rural PF",
    cfop_intra: "5501", cfop_inter: "6501", cst_icms: "090",
    obs: "OPERAÇÃO MAIS COMUM EM MT: produtor vende para trading (Bunge, Cargill, ADM, Amaggi…) que exportará. ICMS suspenso/imune. PIS/COFINS imunes. Funrural incide normalmente. Não exige RE/DU-E do produtor.",
  },
  {
    codigo: "VFE-PJ",
    descricao: "Venda com Fim Específico de Exportação — Produtor Rural PJ",
    cfop_intra: "5501", cfop_inter: "6501", cst_icms: "090",
    obs: "Mesmo que VFE-PF, mas para produtor com CNPJ. ICMS suspenso. PIS/COFINS imunes. Funrural incide. Documento de exportação é responsabilidade da trading compradora.",
  },
  {
    codigo: "VFE-TER",
    descricao: "Venda com Fim Específico de Exportação — Mercadoria de Terceiros",
    cfop_intra: "5502", cfop_inter: "6502", cst_icms: "090",
    obs: "Venda de grão adquirido de terceiros (não produção própria) para trading exportadora. ICMS suspenso.",
  },
  {
    codigo: "EXP",
    descricao: "Exportação Direta pelo Próprio Produtor",
    cfop_intra: "7101", cfop_inter: "7101", cst_icms: "090",
    obs: "Produtor exporta diretamente sem intermediário. Imune de ICMS, PIS, COFINS e Funrural (Art. 149-A CF). Exige Registro de Exportação (RE) e DU-E no SISCOMEX. Caso raro para produtor rural.",
  },
  {
    codigo: "EXP-TER",
    descricao: "Exportação Direta — Mercadoria de Terceiros",
    cfop_intra: "7102", cfop_inter: "7102", cst_icms: "090",
    obs: "Exportação direta de mercadoria adquirida de terceiros. Imune de ICMS, PIS, COFINS. Exige RE e DU-E.",
  },
] as const;

// ── Auto-sugestão de natureza de operação ────────────────────────────────────
// Regras para MT: soja/milho exportados via trading → VFE (CFOP 6.501).
// Demais commodities → venda produção própria (CFOP 6.101).
const COMMODITIES_VFE = ["Soja", "Milho 1ª", "Milho 2ª (Safrinha)", "Sorgo", "Feijão"];
function sugerirNatureza(produto: string, tipoPessoa: "pf" | "pj", commoditiesVfe?: string[]): string {
  const isVfe = (commoditiesVfe ?? COMMODITIES_VFE).includes(produto);
  if (isVfe) return tipoPessoa === "pf" ? "VFE-PF" : "VFE-PJ";
  return tipoPessoa === "pf" ? "VPE-PF" : "VPE-PJ";
}
function tipoProdutorDeCpfCnpj(cpfCnpj?: string | null): "pf" | "pj" {
  return (cpfCnpj ?? "").replace(/\D/g, "").length <= 11 ? "pf" : "pj";
}

// ── Tabelas de classificação por commodity ────────────────────────────────────
// Padrões ABIOVE/ANEC/MAPA para descontos no romaneio de expedição.
// Fórmula umidade: PL × (U − Upad) / (100 − Upad)   [ABIOVE — correta para soja e milho]
// Fórmula impureza: PL × (I − Ipad) / 100
// Fórmula avariados: PL × (A − Apad) / 100
type CommodityClass = { umidade_padrao: number; impureza_padrao: number; avariados_padrao: number; kg_saca: number };
const CLASSE_COMMODITY: Record<string, CommodityClass> = {
  "Soja":                 { umidade_padrao: 14.0, impureza_padrao: 1.0, avariados_padrao: 8.0, kg_saca: 60 },
  "Milho 1ª":             { umidade_padrao: 14.5, impureza_padrao: 1.0, avariados_padrao: 6.0, kg_saca: 60 },
  "Milho 2ª (Safrinha)":  { umidade_padrao: 14.5, impureza_padrao: 1.0, avariados_padrao: 6.0, kg_saca: 60 },
  "Algodão":              { umidade_padrao: 12.0, impureza_padrao: 1.5, avariados_padrao: 0.0, kg_saca: 15 },
  "Sorgo":                { umidade_padrao: 13.0, impureza_padrao: 1.0, avariados_padrao: 6.0, kg_saca: 60 },
  "Trigo":                { umidade_padrao: 13.0, impureza_padrao: 1.0, avariados_padrao: 2.0, kg_saca: 60 },
  "Feijão":               { umidade_padrao: 14.0, impureza_padrao: 1.0, avariados_padrao: 0.5, kg_saca: 60 },
};
const classeCommodity = (produto: string): CommodityClass =>
  CLASSE_COMMODITY[produto] ?? { umidade_padrao: 14, impureza_padrao: 1, avariados_padrao: 8, kg_saca: 60 };
const calcDescUmidade = (pl: number, u: number, uPad: number) => u > uPad ? +(pl * (u - uPad) / (100 - uPad)).toFixed(2) : 0;
const calcDescImpureza = (pl: number, i: number, iPad: number) => i > iPad ? +(pl * (i - iPad) / 100).toFixed(2) : 0;
const calcDescAvariados = (pl: number, a: number, aPad: number) => a > aPad ? +(pl * (a - aPad) / 100).toFixed(2) : 0;

// ── VMs ──────────────────────────────────────────────────────────
interface ContratoVM extends Contrato { romaneios: Romaneio[]; itens: ContratoItem[] }

// ── helpers ──────────────────────────────────────────────────────
const fmtData  = (iso?: string | null) => { if (!iso) return "—"; const [y,m,d] = iso.split("-"); return `${d}/${m}/${y}`; };
const fmtR$    = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fmtPeso  = (kg: number) => `${kg.toLocaleString("pt-BR")} kg`;
const TODAY    = new Date().toISOString().split("T")[0];

const PRODUTOS  = ["Soja", "Milho 1ª", "Milho 2ª (Safrinha)", "Algodão", "Sorgo", "Trigo", "Feijão"];
const UNIDADES  = ["sc", "kg", "ton", "@"] as const;
const FRETES    = ["destinatario","remetente","cif","fob","sem_frete"] as const;
const FRETE_LBL: Record<string,string> = { destinatario:"Destinatário", remetente:"Remetente", cif:"CIF", fob:"FOB", sem_frete:"Sem frete" };

const corStatus = (s: string) => ({
  aberto:    { bg: "#E6F1FB", color: "#0C447C", label: "Em aberto"  },
  parcial:   { bg: "#FAEEDA", color: "#633806", label: "Parcial"    },
  encerrado: { bg: "#D5E8F5", color: "#0B2D50", label: "Encerrado"  },
  cancelado: { bg: "#FCEBEB", color: "#791F1F", label: "Cancelado"  },
}[s] ?? { bg: "#F1EFE8", color: "#555", label: s });

const corProduto = (p: string) => {
  if (p === "Soja")          return { bg: "#D5E8F5", color: "#0B2D50" };
  if (p.startsWith("Milho")) return { bg: "#FAEEDA", color: "#633806" };
  if (p === "Algodão")       return { bg: "#E6F1FB", color: "#0C447C" };
  return { bg: "#F1EFE8", color: "#555" };
};

// ── estilos base ─────────────────────────────────────────────────
const inp: React.CSSProperties = { width:"100%", padding:"7px 9px", border:"0.5px solid #D4DCE8", borderRadius:7, fontSize:12, color:"#1a1a1a", background:"#fff", boxSizing:"border-box", outline:"none" };
const lbl: React.CSSProperties = { fontSize:10, color:"#555", marginBottom:3, display:"block" };
const btnV: React.CSSProperties = { padding:"8px 18px", background:"#1A5CB8", color:"#fff", border:"none", borderRadius:8, fontWeight:600, cursor:"pointer", fontSize:13 };
const btnR: React.CSSProperties = { padding:"8px 18px", border:"0.5px solid #D4DCE8", borderRadius:8, background:"transparent", cursor:"pointer", fontSize:13, color:"#1a1a1a" };
const btnX: React.CSSProperties = { padding:"3px 8px", border:"0.5px solid #E24B4A50", borderRadius:5, background:"#FCEBEB", cursor:"pointer", fontSize:11, color:"#791F1F" };
const badge = (t: string, bg="#D5E8F5", c="#0B2D50") => <span style={{ fontSize:10, background:bg, color:c, padding:"2px 7px", borderRadius:8, fontWeight:600 }}>{t}</span>;

// ── item vazio ───────────────────────────────────────────────────
// unidade padrão = "kg" — storage sempre em kg; display em sc nos grids
const itemVazio = (): Omit<ContratoItem,"id"|"created_at"|"contrato_id"|"fazenda_id"> => ({
  tipo: "Produto", produto: "Soja", unidade: "kg", quantidade: 0, valor_unitario: 0, valor_total: 0, moeda: "BRL", classificacao: "",
});

type AbaForm = "principal" | "adicionais";
type AbaLista = "contratos" | "expedicao" | "posicao";

// ═══════════════════════════════════════════════════════════════════
export default function Contratos() {
  const { fazendaId, podeAcessarPlano } = useAuth();

  // ── dados ────────────────────────────────────────────────────
  const [contratos, setContratos]     = useState<ContratoVM[]>([]);
  const [pessoas, setPessoas]         = useState<Pessoa[]>([]);
  const [produtores, setProdutores]   = useState<Produtor[]>([]);
  const [anosSafra, setAnosSafra]     = useState<AnoSafra[]>([]);
  const [ciclos, setCiclos]           = useState<Ciclo[]>([]);
  const [depositos, setDepositos]     = useState<Deposito[]>([]);
  const [fazendas, setFazendas]       = useState<Fazenda[]>([]);
  const [culturasCont, setCulturasCont] = useState<CulturaContrato[]>([]);
  const [prodAgricolas, setProdAgricolas] = useState<Insumo[]>([]);

  // ── UI ───────────────────────────────────────────────────────
  const [abaLista, setAbaLista]       = useState<AbaLista>("contratos");
  const [expandido, setExpandido]     = useState<Set<string>>(new Set());
  const [loading, setLoading]         = useState(true);
  const [erro, setErro]               = useState<string|null>(null);
  const [salvando, setSalvando]       = useState(false);

  // ── filtros da lista de contratos ────────────────────────────
  const [filtroAno,     setFiltroAno]     = useState("");
  const [filtroCiclo,   setFiltroCiclo]   = useState("");
  const [ciclosFiltro,  setCiclosFiltro]  = useState<Ciclo[]>([]);
  const [filtroProduto, setFiltroProduto] = useState("");
  const [filtroStatus,  setFiltroStatus]  = useState("");
  const [filtroComprador, setFiltroComprador] = useState("");
  const [filtroBusca,   setFiltroBusca]   = useState("");

  // ── PTAX dinâmico para contratos em USD ─────────────────────
  const [ptaxAtual, setPtaxAtual] = useState<number>(5.90);
  useEffect(() => {
    fetch("/api/precos").then(r => r.json()).then((d: { usdPtax?: number; usdBrl?: number }) => {
      const rate = d.usdPtax ?? d.usdBrl ?? 5.90;
      if (rate > 0) setPtaxAtual(rate);
    }).catch(() => {});
  }, []);

  // ── modal encerramento em lote ───────────────────────────────
  const [modalLote, setModalLote]         = useState(false);
  const [loteOp, setLoteOp]               = useState<"contratos"|"safra">("contratos");
  const [loteSafras, setLoteSafras]       = useState<Set<string>>(new Set());
  const [loteSalvando, setLoteSalvando]   = useState(false);
  const [loteResultado, setLoteResultado] = useState<string|null>(null);

  const abrirModalLote = () => {
    setLoteOp("contratos");
    setLoteSafras(new Set());
    setLoteResultado(null);
    setModalLote(true);
  };

  const safraStats = (anoId: string) => {
    const cs = contratos.filter(c => c.ano_safra_id === anoId || (!c.ano_safra_id && c.safra === (anosSafra.find(a => a.id === anoId)?.descricao ?? "")));
    return {
      total:    cs.length,
      abertos:  cs.filter(c => c.status === "aberto" || c.status === "parcial").length,
      encerrados: cs.filter(c => c.status === "encerrado").length,
    };
  };

  const executarLote = async () => {
    if (loteSafras.size === 0) return;
    setLoteSalvando(true);
    setLoteResultado(null);
    try {
      const ids = [...loteSafras];
      if (loteOp === "safra") {
        // Encerra a safra completa (status + contratos)
        let totalContratos = 0;
        for (const id of ids) {
          const n = await encerrarAnoSafra(id, fazendaId!);
          totalContratos += n;
        }
        setAnosSafra(prev => prev.map(a => ids.includes(a.id) ? { ...a, status: "encerrada" as const } : a));
        setLoteResultado(`✓ ${ids.length} safra(s) encerrada(s) + ${totalContratos} contrato(s) fechados.`);
      } else {
        // Encerra apenas os contratos, mantém safra ativa
        const n = await encerrarContratosPorSafras(fazendaId!, ids);
        setLoteResultado(`✓ ${n} contrato(s) encerrado(s).`);
      }
      await carregarTudo();
    } catch (e) { setLoteResultado("✕ Erro: " + sbErr(e)); }
    finally { setLoteSalvando(false); }
  };

  // ── modal contrato ───────────────────────────────────────────
  const [modalContrato, setModalContrato] = useState(false);
  const [editContrato, setEditContrato]   = useState<ContratoVM|null>(null);
  const [abaForm, setAbaForm]             = useState<AbaForm>("principal");
  const [itens, setItens]                 = useState<Omit<ContratoItem,"id"|"created_at"|"contrato_id"|"fazenda_id">[]>([itemVazio()]);

  const fContratoVazio = () => ({
    // principal
    ano_safra_id: anosSafra[0]?.id ?? "",
    safra: anosSafra[0]?.descricao ?? "25/26",
    tipo: "venda" as Contrato["tipo"],
    autorizacao: "autorizada" as Contrato["autorizacao"],
    confirmado: false,
    a_fixar: false,
    venda_a_ordem: false,
    data_contrato: TODAY,
    pessoa_id: "",
    produtor_id: "",
    nr_contrato_cliente: "",
    contato_broker: "",
    grupo_vendedor: "",
    vendedor: "",
    // produto/preço (item 0)
    produto: "Soja",
    modalidade: "fixo" as Contrato["modalidade"],
    moeda: "BRL" as Contrato["moeda"],
    preco: 0,
    quantidade_sc: 0,
    data_entrega: "",
    data_pagamento: undefined as string | undefined,
    // logística / fiscal
    saldo_tipo: "peso_saida" as Contrato["saldo_tipo"],
    frete: "destinatario" as Contrato["frete"],
    valor_frete: 0,
    natureza_codigo: "",   // código da NATUREZAS_OPERACAO selecionada
    natureza_operacao: "", // descricao gravada para histórico
    cfop: "",
    // adicionais
    propriedade: "",
    ciclo_id: "",          // FK ciclos — Empreendimento
    seguradora: "",
    corretora: "",
    cte_numero: "",
    terceiro: "",
    deposito_carregamento: "",
    deposito_fiscal: false,
    observacao_interna: "",
    observacao: "",
    // cessão
    dado_em_cessao: false,
    cessao_fornecedor_id: "",
    cessao_fornecedor_nome: "",
    cessao_data: "",
    cessao_obs: "",
  });

  const [fC, setFC] = useState(fContratoVazio());

  // ── sugestão automática de natureza ──────────────────────────
  const [naturezaSugerida, setNaturezaSugerida] = useState<string>("");

  useEffect(() => {
    if (!modalContrato) return;
    // Produto principal = primeiro item da grade
    const produtoPrincipal = itens[0]?.produto ?? fC.produto;
    const prod = produtores.find(p => p.id === fC.produtor_id);
    const tipo = tipoProdutorDeCpfCnpj(prod?.cpf_cnpj);
    const sugestao = sugerirNatureza(produtoPrincipal, tipo, COMMODITIES_VFE_DIN);
    // Só aplica se campo vazio ou ainda na sugestão anterior (não foi editado manualmente nem é contrato existente)
    if (naturezaSugerida === "__manual__") return; // contrato existente — não sobrescrever
    if (!fC.natureza_codigo || fC.natureza_codigo === naturezaSugerida) {
      const nat = NATUREZAS_OPERACAO.find(n => n.codigo === sugestao);
      setFC(p => ({ ...p, natureza_codigo: sugestao, natureza_operacao: nat?.descricao ?? "", cfop: nat?.cfop_inter ?? p.cfop }));
    }
    setNaturezaSugerida(sugestao);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itens[0]?.produto, fC.produtor_id, modalContrato]);

  // ── modal cessão ─────────────────────────────────────────────
  type LancItem = { id: string; descricao: string; data_vencimento: string; valor: number; status: string };
  const [modalCessao,      setModalCessao]      = useState(false);
  const [cessaoLancs,      setCessaoLancs]      = useState<LancItem[]>([]);
  const [cessaoSelecionados, setCessaoSelecionados] = useState<Record<string, number>>({}); // lancamento_id → valor_cessao

  // ── modal romaneio ───────────────────────────────────────────
  const [modalRomaneio, setModalRomaneio] = useState(false);
  const ROM_VAZIO = () => ({
    contratoId:"", placa:"", pesoBruto:"", tara:"",
    umidade:"", impureza:"", ph:"",
    ardidos:"", mofados:"", fermentados:"", germinados:"",
    esverdeados:"", quebrados:"", carunchados:"", outros_avariados:"",
    peso_destino:"", sacas_faturadas:"", obs_divergencia:"",
    // adiantamento
    aplicarAdiant: false,
    adiantValor: "",
  });
  const [fRom, setFRom] = useState(ROM_VAZIO());

  // ── adiantamentos de cliente ─────────────────────────────────
  const [adiantamentos, setAdiantamentos] = useState<Record<string, AdiantamentoCliente[]>>({});
  const [modalAdiant, setModalAdiant]     = useState(false);
  const [adiantContratoId, setAdiantContratoId] = useState("");
  const [fAdiant, setFAdiant] = useState({ data: TODAY, valor: "", descricao: "" });
  const [salvandoAdiant, setSalvandoAdiant] = useState(false);

  // ── ciclos: carrega quando safra muda (formulário) ───────────
  useEffect(() => {
    if (!fC.ano_safra_id) { setCiclos([]); return; }
    listarCiclos(fC.ano_safra_id).then(setCiclos).catch(() => setCiclos([]));
  }, [fC.ano_safra_id]);

  // ── ciclos: carrega quando filtro de ano muda ────────────────
  useEffect(() => {
    if (!filtroAno) { setCiclosFiltro([]); setFiltroCiclo(""); return; }
    listarCiclos(filtroAno).then(setCiclosFiltro).catch(() => setCiclosFiltro([]));
  }, [filtroAno]);

  // ── carga ────────────────────────────────────────────────────
  useEffect(() => { if (fazendaId) carregarTudo(); }, [fazendaId]);

  async function carregarTudo() {
    try {
      setLoading(true); setErro(null);
      const [cList, rList, pList, prodList, aList, dList, fList] = await Promise.all([
        listarContratos(fazendaId!),
        listarRomaneios(fazendaId!),
        listarPessoas(fazendaId!),
        listarProdutores(fazendaId!),
        listarAnosSafra(fazendaId!),
        listarDepositos(fazendaId!),
        listarFazendas(fazendaId ?? undefined),
      ]);
      const rMap: Record<string,Romaneio[]> = {};
      for (const r of rList) rMap[r.contrato_id] = [...(rMap[r.contrato_id]??[]), r];
      const vms: ContratoVM[] = cList.map(c => ({ ...c, romaneios: rMap[c.id]??[], itens:[] }));
      setContratos(vms);
      setPessoas(pList);
      setProdutores(prodList);
      setAnosSafra(aList);
      setDepositos(dList);
      setFazendas(fList);
      // culturas
      const { data: cultList } = await supabase.from("culturas").select("*")
        .eq("fazenda_id", fazendaId!).eq("ativa", true).order("ordem").order("nome");
      if (cultList && cultList.length > 0) setCulturasCont(cultList as CulturaContrato[]);
      // produtos agrícolas (insumos com categoria=produto_agricola)
      const { data: prodList2 } = await supabase.from("insumos").select("*")
        .eq("fazenda_id", fazendaId!).eq("categoria", "produto_agricola").order("nome");
      if (prodList2 && prodList2.length > 0) setProdAgricolas(prodList2 as Insumo[]);
      // adiantamentos
      const { data: adiantList } = await supabase
        .from("adiantamentos_cliente").select("*").eq("fazenda_id", fazendaId!).order("data");
      const adiantMap: Record<string, AdiantamentoCliente[]> = {};
      for (const a of (adiantList ?? [])) {
        adiantMap[a.contrato_id] = [...(adiantMap[a.contrato_id] ?? []), a as AdiantamentoCliente];
      }
      setAdiantamentos(adiantMap);
    } catch(e: unknown) { setErro((e as {message?:string})?.message || JSON.stringify(e)); }
    finally { setLoading(false); }
  }

  // ── helper: saldo de adiantamento disponível de um contrato ──
  const adiantSaldo = (contratoId: string) => {
    const adts = adiantamentos[contratoId] ?? [];
    return adts.reduce((s, a) => s + a.valor - a.valor_aplicado, 0);
  };

  const toggleExpand = (id: string) =>
    setExpandido(prev => { const n = new Set(prev); n.has(id)?n.delete(id):n.add(id); return n; });

  // ── abrir modal ───────────────────────────────────────────────
  const abrirNovo = () => {
    setEditContrato(null);
    const vazio = fContratoVazio();
    if (anosSafra[0]) vazio.safra = anosSafra[0].descricao;
    setFC(vazio);
    setItens([itemVazio()]);
    setNaturezaSugerida(""); // sugestão será calculada pelo useEffect ao abrir
    setAbaForm("principal");
    setModalContrato(true);
  };

  const abrirEditar = async (c: ContratoVM) => {
    setEditContrato(c);
    setFC({
      safra: c.safra ?? "", tipo: c.tipo ?? "venda",
      autorizacao: c.autorizacao ?? "autorizada",
      confirmado: c.confirmado ?? false,
      a_fixar: c.a_fixar ?? false,
      venda_a_ordem: c.venda_a_ordem ?? false,
      data_contrato: c.data_contrato ?? "", pessoa_id: c.pessoa_id ?? "",
      produtor_id: c.produtor_id ?? "",
      nr_contrato_cliente: c.nr_contrato_cliente ?? "",
      contato_broker: c.contato_broker ?? "",
      grupo_vendedor: c.grupo_vendedor ?? "",
      vendedor: c.vendedor ?? "",
      produto: c.produto, modalidade: c.modalidade,
      moeda: c.moeda, preco: c.preco, quantidade_sc: c.quantidade_sc,
      data_entrega: c.data_entrega,
      data_pagamento: c.data_pagamento ?? undefined,
      saldo_tipo: c.saldo_tipo ?? "peso_saida",
      frete: c.frete ?? "destinatario",
      valor_frete: c.valor_frete ?? 0,
      natureza_operacao: c.natureza_operacao ?? "",
      natureza_codigo: "",  // será mantido só no estado, não vem do banco
      cfop: c.cfop ?? "",
      propriedade: c.propriedade ?? "",
      ano_safra_id: c.ano_safra_id ?? "",
      ciclo_id: c.ciclo_id ?? "",
      seguradora: c.seguradora ?? "",
      corretora: c.corretora ?? "",
      cte_numero: c.cte_numero ?? "",
      terceiro: c.terceiro ?? "",
      deposito_carregamento: c.deposito_carregamento ?? "",
      deposito_fiscal: c.deposito_fiscal ?? false,
      observacao_interna: c.observacao_interna ?? "",
      observacao: c.observacao ?? "",
      // cessão
      dado_em_cessao: c.dado_em_cessao ?? false,
      cessao_fornecedor_id: c.cessao_fornecedor_id ?? "",
      cessao_fornecedor_nome: c.cessao_fornecedor_nome ?? "",
      cessao_data: c.cessao_data ?? "",
      cessao_obs: c.cessao_obs ?? "",
    });
    try {
      const its = await listarItensContrato(c.id);
      setItens(its.length > 0 ? its.map(i => ({ tipo:i.tipo, produto:i.produto, unidade:i.unidade, quantidade:i.quantidade, valor_unitario:i.valor_unitario, valor_total:i.valor_total, moeda:i.moeda, classificacao:i.classificacao })) : [itemVazio()]);
    } catch { setItens([itemVazio()]); }
    // carrega débitos vinculados
    try {
      const debs = await listarCessaoDebitos(c.id);
      const sel: Record<string, number> = {};
      for (const d of debs) sel[d.lancamento_id] = d.valor_cessao;
      setCessaoSelecionados(sel);
    } catch { setCessaoSelecionados({}); }
    // contrato existente: natureza já salva — marca como "manual" para o useEffect não sobrescrever
    setNaturezaSugerida("__manual__");
    setAbaForm("principal");
    setModalContrato(true);
  };

  // Mapeamento subgrupo do produto agrícola → chave em CLASSE_COMMODITY
  const SUBGRUPO_CLASSE: Record<string, string> = {
    soja: "Soja", milho: "Milho 1ª", milho_pipoca: "Milho 1ª",
    algodao: "Algodão", algodão: "Algodão",
    sorgo: "Sorgo", trigo: "Trigo", feijao: "Feijão", feijão: "Feijão",
  };

  // ── listas dinâmicas — prioridade: produtos agrícolas > culturas > hardcoded ──
  const PRODUTOS_DIN: string[] =
    prodAgricolas.length > 0 ? prodAgricolas.map(p => p.nome) :
    culturasCont.length  > 0 ? culturasCont.map(c => c.nome)  :
    PRODUTOS;
  const COMMODITIES_VFE_DIN: string[] = culturasCont.length > 0
    ? culturasCont.filter(c => c.categoria === "graos").map(c => c.nome)
    : COMMODITIES_VFE;
  const classeCommodityDin = (produto: string): CommodityClass => {
    // Tenta match direto no CLASSE_COMMODITY
    if (CLASSE_COMMODITY[produto]) {
      const cult = culturasCont.find(c => c.nome === produto);
      return { ...CLASSE_COMMODITY[produto], kg_saca: cult?.fator_conversao_kg ?? CLASSE_COMMODITY[produto].kg_saca };
    }
    // Tenta via produto agrícola → subgrupo → CLASSE_COMMODITY
    const prodAgr = prodAgricolas.find(p => p.nome === produto);
    if (prodAgr?.subgrupo) {
      const classeKey = SUBGRUPO_CLASSE[prodAgr.subgrupo] ?? null;
      const base = classeKey ? CLASSE_COMMODITY[classeKey] : null;
      if (base) return { ...base, kg_saca: prodAgr.unidade === "sc" ? 60 : base.kg_saca };
    }
    // Tenta via culturasCont
    const cult = culturasCont.find(c => c.nome === produto);
    const base: CommodityClass = CLASSE_COMMODITY[produto] ?? { umidade_padrao: 14, impureza_padrao: 1, avariados_padrao: 8, kg_saca: 60 };
    return { ...base, kg_saca: cult?.fator_conversao_kg ?? base.kg_saca };
  };

  // ── calcular totais dos itens ─────────────────────────────────
  // _qKg = kg, _qSc = sc — ambos derivados conforme unidade do item
  type ItemCalc = typeof itens[0] & { _qKg: number; _qSc: number; valor_total: number };
  const itensCalc: ItemCalc[] = itens.map(i => {
    const kgSaca = classeCommodityDin(i.produto).kg_saca;
    const _qKg = i.unidade === "kg" ? (i.quantidade||0) : (i.quantidade||0) * kgSaca;
    const _qSc = i.unidade === "kg" ? (i.quantidade||0) / kgSaca : (i.quantidade||0);
    return { ...i, _qKg, _qSc, valor_total: _qSc * (i.valor_unitario||0) };
  });
  const valorFinanceiro = itensCalc.reduce((a,i) => a + (i.valor_total??0), 0);
  const valorTotal = valorFinanceiro + (fC.valor_frete||0);

  const atualizarItem = (idx: number, campo: string, valor: string|number) => {
    setItens(prev => prev.map((it,i) => {
      if (i !== idx) return it;
      const num = (v: string|number) => typeof v === "string" ? parseFloat(v)||0 : v;
      if (campo === "quantidade_kg") {
        // usuário digitou em kg — armazena kg, unidade = "kg"
        return { ...it, quantidade: num(valor), unidade: "kg" as const };
      }
      if (campo === "quantidade_sc") {
        // usuário digitou em sc → converte para kg antes de salvar
        return { ...it, quantidade: num(valor) * classeCommodityDin(it.produto).kg_saca, unidade: "kg" as const };
      }
      if (campo === "produto") {
        // ao trocar produto, mantém unidade atual (já é kg para novos itens)
        return { ...it, produto: valor as string };
      }
      return { ...it, [campo]: ["quantidade","valor_unitario"].includes(campo) ? num(valor) : valor };
    }));
  };

  // ── salvar contrato ───────────────────────────────────────────
  const salvarContrato = async () => {
    if (!fC.data_entrega) return alert("Informe o prazo de entrega.");
    if (itens.every(i => !i.produto || i.quantidade <= 0)) return alert("Adicione pelo menos um item com quantidade.");
    // Bloqueia criação de contrato em safra encerrada
    if (!editContrato) {
      const safraEnc = anosSafra.find(a => a.id === fC.ano_safra_id && a.status === "encerrada");
      if (safraEnc) return alert(`A safra "${safraEnc.descricao}" está encerrada e não aceita novos contratos.\n\nPara permitir novos lançamentos, reabra a safra em Cadastros > Safras.`);
    }
    setSalvando(true);
    try {
      // produto/quantidade principal = primeiro item
      const primeiroItem = itensCalc[0];
      const payload: Omit<Contrato,"id"|"created_at"|"entregue_sc"> = {
        fazenda_id: fazendaId!,
        numero: editContrato?.numero ?? `CTR-${new Date().getFullYear()}/${String(contratos.length+1).padStart(3,"0")}`,
        safra: fC.safra,
        tipo: fC.tipo,
        autorizacao: fC.autorizacao,
        confirmado: fC.confirmado,
        a_fixar: fC.a_fixar,
        venda_a_ordem: fC.venda_a_ordem,
        data_contrato: fC.data_contrato,
        data_entrega: fC.data_entrega,
        data_pagamento: fC.data_pagamento || undefined,
        pessoa_id: fC.pessoa_id || undefined,
        produtor_id: fC.produtor_id || undefined,
        comprador: pessoas.find(p=>p.id===fC.pessoa_id)?.nome ?? fC.pessoa_id ?? "",
        nr_contrato_cliente: fC.nr_contrato_cliente || undefined,
        contato_broker: fC.contato_broker || undefined,
        grupo_vendedor: fC.grupo_vendedor || undefined,
        vendedor: fC.vendedor || undefined,
        produto: primeiroItem?.produto ?? fC.produto,
        modalidade: fC.modalidade,
        moeda: fC.moeda,
        preco: primeiroItem?.valor_unitario ?? fC.preco,
        quantidade_sc: primeiroItem?._qSc ?? fC.quantidade_sc,
        saldo_tipo: fC.saldo_tipo,
        frete: fC.frete,
        valor_frete: fC.valor_frete || undefined,
        natureza_operacao: fC.natureza_operacao || undefined,
        cfop: fC.cfop || undefined,
        propriedade: fC.propriedade || undefined,
        ano_safra_id: fC.ano_safra_id || undefined,
        ciclo_id: fC.ciclo_id || undefined,
        seguradora: fC.seguradora || undefined,
        corretora: fC.corretora || undefined,
        cte_numero: fC.cte_numero || undefined,
        terceiro: fC.terceiro || undefined,
        deposito_carregamento: fC.deposito_carregamento || undefined,
        deposito_fiscal: fC.deposito_fiscal,
        observacao_interna: fC.observacao_interna || undefined,
        observacao: fC.observacao || undefined,
        status: editContrato?.status ?? "aberto",
        // cessão — só inclui no payload se o usuário marcou o checkbox
        // (evita erro de coluna inexistente antes da migration 78 ser executada)
        ...(fC.dado_em_cessao ? {
          dado_em_cessao: true,
          cessao_fornecedor_id: fC.cessao_fornecedor_id || undefined,
          cessao_fornecedor_nome: fC.cessao_fornecedor_nome || undefined,
          cessao_data: fC.cessao_data || undefined,
          cessao_obs: fC.cessao_obs || undefined,
        } : {}),
      };
      let salvo: Contrato;
      if (editContrato) {
        await atualizarContrato(editContrato.id, payload);
        salvo = { ...editContrato, ...payload, entregue_sc: editContrato.entregue_sc };
      } else {
        salvo = await criarContrato({ ...payload, entregue_sc: 0 });
      }
      await salvarItensContrato(salvo.id, fazendaId!, itensCalc.filter(i=>i._qKg>0).map(i=>({
        tipo: i.tipo, produto: i.produto, unidade: "kg",
        quantidade: i._qKg, valor_unitario: i.valor_unitario,
        valor_total: i.valor_total, moeda: fC.moeda, classificacao: i.classificacao,
        contrato_id: salvo.id, fazenda_id: fazendaId!,
      })));
      // salva débitos de cessão se houver
      if (fC.dado_em_cessao && Object.keys(cessaoSelecionados).length > 0) {
        await salvarCessaoDebitos(salvo.id, fazendaId!, Object.entries(cessaoSelecionados).map(([lancamento_id, valor_cessao]) => ({ lancamento_id, valor_cessao })));
      }
      // cria CR automático quando contrato confirmado + data de pagamento + sem CR existente
      const valorTotal = itensCalc.reduce((s, i) => s + i.valor_total, 0);
      if (fC.confirmado && fC.data_pagamento && valorTotal > 0 && !salvo.lancamento_cr_id) {
        const compradorNome = pessoas.find(p=>p.id===fC.pessoa_id)?.nome ?? payload.comprador ?? "";
        const { data: crRow } = await supabase.from("lancamentos").insert({
          fazenda_id: fazendaId,
          tipo: "receber",
          descricao: `Venda de grãos — ${compradorNome} (Contrato ${salvo.numero ?? salvo.id.slice(-6)})`,
          categoria: "Receita Grãos",
          data_lancamento: new Date().toISOString().split("T")[0],
          data_vencimento: fC.data_pagamento,
          valor: valorTotal,
          moeda: fC.moeda,
          status: "em_aberto",
          safra_id: fC.ciclo_id || null,
          ano_safra_id: fC.ano_safra_id || null,
          observacao: `CR gerado automaticamente ao confirmar contrato`,
          auto: true,
        }).select("id").maybeSingle();
        if (crRow?.id) {
          await supabase.from("contratos").update({ lancamento_cr_id: crRow.id }).eq("id", salvo.id);
        }
      }
      if (editContrato) {
        setContratos(prev => prev.map(c => c.id === salvo.id ? { ...c, ...salvo, itens: itensCalc.filter(i=>i._qKg>0) as unknown as ContratoItem[] } : c));
      } else {
        setContratos(prev => [...prev, { ...salvo, romaneios:[], itens:[] }]);
      }
      setModalContrato(false);
    } catch(e: unknown) { alert("Erro ao salvar: " + sbErr(e)); }
    finally { setSalvando(false); }
  };

  // ── cessão: abre modal de débitos ───────────────────────────────
  const abrirModalCessao = async () => {
    if (!fC.cessao_fornecedor_id || !fazendaId) return;
    try {
      const { data } = await supabase
        .from("lancamentos")
        .select("id, descricao, data_vencimento, valor, status")
        .eq("fazenda_id", fazendaId)
        .eq("tipo", "pagar")
        .eq("pessoa_id", fC.cessao_fornecedor_id)
        .in("status", ["em_aberto", "parcial"])
        .order("data_vencimento", { ascending: true });
      setCessaoLancs((data ?? []) as LancItem[]);
    } catch {
      // fallback: mostra sem filtro por pessoa
      setCessaoLancs([]);
    }
    setModalCessao(true);
  };

  // ── romaneio — cálculos em tempo real ─────────────────────────
  const contratoSel   = contratos.find(c => c.id === fRom.contratoId);
  const produto_rom   = contratoSel?.produto ?? "Soja";
  const clsComm       = classeCommodityDin(produto_rom);
  const isSoja        = produto_rom.toLowerCase().startsWith("soja");
  const isMilho       = produto_rom.toLowerCase().startsWith("milho");

  const plCalc        = fRom.pesoBruto && fRom.tara ? Number(fRom.pesoBruto) - Number(fRom.tara) : 0;
  const romUmidade    = parseFloat(fRom.umidade)   || 0;
  const romImpureza   = parseFloat(fRom.impureza)  || 0;

  // Avariados totais = soma dos sub-parâmetros (se algum preenchido); senão campo livre
  const pArd  = parseFloat(fRom.ardidos)          || 0;
  const pMof  = parseFloat(fRom.mofados)          || 0;
  const pFer  = parseFloat(fRom.fermentados)      || 0;
  const pGer  = parseFloat(fRom.germinados)       || 0;
  const pEsv  = parseFloat(fRom.esverdeados)      || 0;
  const pQue  = parseFloat(fRom.quebrados)        || 0;
  const pCar  = parseFloat(fRom.carunchados)      || 0;
  const pOut  = parseFloat(fRom.outros_avariados) || 0;
  const romAvariados  = +(pArd + pMof + pFer + pGer + pEsv + pQue + pCar + pOut).toFixed(2);

  const descUmid  = plCalc > 0 ? calcDescUmidade (plCalc, romUmidade,  clsComm.umidade_padrao)  : 0;
  const descImpur = plCalc > 0 ? calcDescImpureza(plCalc, romImpureza, clsComm.impureza_padrao) : 0;
  const descAvar  = plCalc > 0 ? calcDescAvariados(plCalc, romAvariados, clsComm.avariados_padrao) : 0;
  const pesoClass = plCalc > 0 ? Math.max(0, +(plCalc - descUmid - descImpur - descAvar).toFixed(2)) : 0;
  const sacasCalc = pesoClass > 0 ? +(pesoClass / clsComm.kg_saca).toFixed(3) : 0;
  const temClassif = romUmidade > 0 || romImpureza > 0 || romAvariados > 0;

  // Peso recebido pelo comprador
  const pesoDest   = parseFloat(fRom.peso_destino)    || 0;
  const sacasFat   = parseFloat(fRom.sacas_faturadas) || 0;
  const difKg      = pesoDest > 0 && pesoClass > 0 ? +(pesoClass - pesoDest).toFixed(2) : 0;
  const difPct     = pesoClass > 0 && difKg !== 0 ? +(difKg / pesoClass * 100).toFixed(3) : 0;

  const gerarRomaneio = async () => {
    if (!contratoSel || !fRom.placa || plCalc <= 0) return;
    const todosRomaneios = contratos.flatMap(c => c.romaneios);
    setSalvando(true);
    try {
      const criado = await criarRomaneio({
        contrato_id:           contratoSel.id,
        fazenda_id:            fazendaId!,
        numero:                `ROM-${String(todosRomaneios.length+1).padStart(4,"0")}`,
        placa:                 fRom.placa.toUpperCase(),
        peso_bruto_kg:         Number(fRom.pesoBruto),
        tara_kg:               Number(fRom.tara),
        // peso_liquido_kg é GENERATED ALWAYS no banco (peso_bruto - tara)
        // classificação — comuns
        umidade_pct:           romUmidade   || undefined,
        umidade_padrao_pct:    temClassif ? clsComm.umidade_padrao  : undefined,
        desconto_umidade_kg:   descUmid     || undefined,
        impureza_pct:          romImpureza  || undefined,
        impureza_padrao_pct:   temClassif ? clsComm.impureza_padrao : undefined,
        desconto_impureza_kg:  descImpur    || undefined,
        avariados_pct:         romAvariados || undefined,
        avariados_padrao_pct:  temClassif ? clsComm.avariados_padrao : undefined,
        desconto_avariados_kg: descAvar     || undefined,
        peso_classificado_kg:  temClassif ? pesoClass : plCalc,
        // sacas é GENERATED ALWAYS no banco (peso_classificado_kg / kg_saca)
        data:                  TODAY,
        // classificação — detalhada
        ph_hl:               parseFloat(fRom.ph)               || undefined,
        ardidos_pct:         pArd  || undefined,
        mofados_pct:         pMof  || undefined,
        fermentados_pct:     pFer  || undefined,
        germinados_pct:      pGer  || undefined,
        esverdeados_pct:     pEsv  || undefined,
        quebrados_pct:       pQue  || undefined,
        carunchados_pct:     pCar  || undefined,
        outros_avariados_pct: pOut || undefined,
        // peso recebido
        peso_liquido_destino: pesoDest  || undefined,
        sacas_faturadas:      parseFloat(fRom.sacas_faturadas) || undefined,
        diferenca_kg:         pesoDest > 0 && pesoClass > 0 ? difKg : undefined,
        obs_divergencia:      fRom.obs_divergencia || undefined,
      });
      // Busca saldo real do banco após o trigger atualizar entregue_sc e status
      const { data: cAtual } = await supabase
        .from("contratos")
        .select("entregue_sc, status")
        .eq("id", contratoSel.id)
        .single();
      setContratos(prev => prev.map(c => {
        if (c.id !== contratoSel.id) return c;
        const novoEnt = cAtual?.entregue_sc ?? ((c.entregue_sc ?? 0) + sacasCalc);
        const novoSt  = cAtual?.status ?? (novoEnt >= (c.quantidade_sc ?? 0) ? "encerrado" : "parcial");
        return { ...c, entregue_sc: novoEnt, status: novoSt, romaneios: [...c.romaneios, criado] };
      }));
      // ── aplicar adiantamento se selecionado ──────────────────
      if (fRom.aplicarAdiant && fRom.adiantValor) {
        const valorEntrega  = sacasCalc * (contratoSel.preco ?? 0);
        const saldoDisp     = adiantSaldo(contratoSel.id);
        const valorAplicar  = Math.min(
          Math.max(0, parseFloat(fRom.adiantValor.replace(",", "."))),
          valorEntrega,
          saldoDisp,
        );
        if (valorAplicar > 0) {
          const valorCR = Math.max(0, valorEntrega - valorAplicar);
          // CR líquido para esta entrega
          let crId: string | null = null;
          if (valorCR > 0) {
            const { data: crRow } = await supabase.from("lancamentos").insert({
              fazenda_id: fazendaId,
              tipo: "receber",
              descricao: `Venda — ${contratoSel.comprador.split(" ").slice(0,3).join(" ")} (${criado.numero})`,
              categoria: "Receita Grãos",
              data_lancamento: TODAY, data_vencimento: TODAY,
              valor: Math.round(valorCR * 100) / 100,
              moeda: contratoSel.moeda,
              status: "em_aberto",
              auto: true,
              observacao: `Adiantamento abatido: ${fmtR$(valorAplicar)} · Valor bruto: ${fmtR$(valorEntrega)}`,
            }).select("id").maybeSingle();
            crId = crRow?.id ?? null;
          }
          // FIFO: aplica o abatimento nos adiantamentos mais antigos primeiro
          let restante = valorAplicar;
          const adiantsPendentes = (adiantamentos[contratoSel.id] ?? [])
            .filter(a => a.status !== "quitado")
            .sort((a, b) => a.data.localeCompare(b.data));
          const adiantUpdates: Record<string, AdiantamentoCliente> = {};
          for (const adiant of adiantsPendentes) {
            if (restante <= 0) break;
            const saldoA  = adiant.valor - adiant.valor_aplicado;
            const aplicar = Math.min(restante, saldoA);
            const novoApl = adiant.valor_aplicado + aplicar;
            const novoSt: AdiantamentoCliente["status"] = novoApl >= adiant.valor ? "quitado" : "parcial";
            await supabase.from("adiantamentos_cliente")
              .update({ valor_aplicado: Math.round(novoApl * 100) / 100, status: novoSt })
              .eq("id", adiant.id);
            await supabase.from("aplicacoes_adiantamento").insert({
              fazenda_id: fazendaId, adiantamento_id: adiant.id,
              lancamento_id: crId, romaneio_id: criado.id,
              data_aplicacao: TODAY, valor_aplicado: Math.round(aplicar * 100) / 100,
              observacao: `Romaneio ${criado.numero}`,
            });
            adiantUpdates[adiant.id] = { ...adiant, valor_aplicado: novoApl, status: novoSt };
            restante -= aplicar;
          }
          // Atualiza contrato
          const novoContrApl = (contratoSel.adiantamento_aplicado ?? 0) + valorAplicar;
          await supabase.from("contratos")
            .update({ adiantamento_aplicado: Math.round(novoContrApl * 100) / 100 })
            .eq("id", contratoSel.id);
          // Atualiza estado local
          setAdiantamentos(prev => ({
            ...prev,
            [contratoSel.id]: (prev[contratoSel.id] ?? []).map(a => adiantUpdates[a.id] ?? a),
          }));
          setContratos(prev => prev.map(c =>
            c.id === contratoSel.id ? { ...c, adiantamento_aplicado: novoContrApl } : c,
          ));
        }
      }
      setFRom(ROM_VAZIO());
      setModalRomaneio(false);
      setAbaLista("expedicao");
    } catch(e: unknown) { alert("Erro ao salvar romaneio: " + sbErr(e)); }
    finally { setSalvando(false); }
  };

  // ── registrar novo adiantamento ───────────────────────────────
  const registrarAdiantamento = async () => {
    if (!fazendaId || !adiantContratoId || !fAdiant.valor) return;
    setSalvandoAdiant(true);
    try {
      const valor    = Math.round(parseFloat(fAdiant.valor.replace(",", ".")) * 100) / 100;
      const contrato = contratos.find(c => c.id === adiantContratoId);
      if (!contrato || valor <= 0) return;
      // 1. CR liquidado
      const { data: crRow } = await supabase.from("lancamentos").insert({
        fazenda_id: fazendaId,
        tipo: "receber",
        descricao: `Adiantamento — ${contrato.comprador.split(" ").slice(0,3).join(" ")} (Contrato ${contrato.numero ?? ""})`,
        categoria: "Adiantamento Cliente",
        data_lancamento: fAdiant.data, data_vencimento: fAdiant.data,
        valor, moeda: contrato.moeda,
        status: "liquidado", auto: true,
        observacao: fAdiant.descricao || null,
      }).select("id").maybeSingle();
      // 2. Registro de adiantamento
      const { data: adiant } = await supabase.from("adiantamentos_cliente").insert({
        fazenda_id: fazendaId, contrato_id: adiantContratoId,
        data: fAdiant.data, valor,
        descricao: fAdiant.descricao || null,
        lancamento_id: crRow?.id ?? null,
        valor_aplicado: 0, status: "pendente",
      }).select("*").maybeSingle();
      // 3. Atualiza adiantamento_recebido no contrato
      const novoRec = (contrato.adiantamento_recebido ?? 0) + valor;
      await supabase.from("contratos")
        .update({ adiantamento_recebido: Math.round(novoRec * 100) / 100 })
        .eq("id", adiantContratoId);
      // 4. Estado local
      if (adiant) {
        setAdiantamentos(prev => ({
          ...prev,
          [adiantContratoId]: [...(prev[adiantContratoId] ?? []), adiant as AdiantamentoCliente],
        }));
      }
      setContratos(prev => prev.map(c =>
        c.id === adiantContratoId ? { ...c, adiantamento_recebido: novoRec } : c,
      ));
      setModalAdiant(false);
      setFAdiant({ data: TODAY, valor: "", descricao: "" });
    } catch(e: unknown) { alert("Erro ao registrar adiantamento: " + sbErr(e)); }
    finally { setSalvandoAdiant(false); }
  };

  // ── filtro da lista ───────────────────────────────────────────
  const safraDescFiltro = filtroAno ? (anosSafra.find(a => a.id === filtroAno)?.descricao ?? "") : "";
  const contratosFiltrados = contratos.filter(c => {
    if (filtroAno) {
      const porId   = c.ano_safra_id === filtroAno;
      const porText = !c.ano_safra_id && safraDescFiltro && c.safra === safraDescFiltro;
      if (!porId && !porText) return false;
    }
    if (filtroCiclo    && c.ciclo_id !== filtroCiclo) return false;
    if (filtroProduto  && c.produto  !== filtroProduto) return false;
    if (filtroStatus   && c.status   !== filtroStatus)  return false;
    if (filtroComprador && c.comprador !== filtroComprador) return false;
    if (filtroBusca) {
      const q = filtroBusca.toLowerCase();
      const haystack = [c.numero, c.comprador, c.produto, c.safra].filter(Boolean).join(" ").toLowerCase();
      if (!haystack.includes(q)) return false;
    }
    return true;
  });

  const compradores = [...new Set(contratos.map(c => c.comprador).filter(Boolean))].sort() as string[];
  const hasAnyFilter = !!(filtroAno || filtroCiclo || filtroProduto || filtroStatus || filtroComprador || filtroBusca);
  const limparFiltros = () => { setFiltroAno(""); setFiltroCiclo(""); setFiltroProduto(""); setFiltroStatus(""); setFiltroComprador(""); setFiltroBusca(""); };

  // ── métricas (baseadas nos contratos filtrados) ───────────────
  const contratosAtivos = contratosFiltrados.filter(c => c.status !== "encerrado" && c.status !== "cancelado").length;
  const todosRomaneios  = contratos.flatMap(c => c.romaneios.map(r => ({ ...r, contratoNumero: c.numero, comprador: c.comprador, produto: c.produto })));

  const posicao = PRODUTOS_DIN.map(produto => {
    const csProd = contratos.filter(c => c.produto === produto);
    const contratado = csProd.reduce((a,c) => a + (c.quantidade_sc??0), 0);
    const entregue   = csProd.reduce((a,c) => a + (c.entregue_sc??0), 0);
    return { produto, contratado, entregue, saldo: contratado-entregue, pct: contratado>0 ? Math.round(entregue/contratado*100) : 0 };
  }).filter(p => p.contratado > 0);

  async function encerrarSafrasAnteriores() {
    // Safras com data_inicio <= 2025-12-31 cobre até 2025/2026
    const safrasAlvo = anosSafra.filter(a => a.data_inicio <= "2025-12-31");
    if (safrasAlvo.length === 0) { alert("Nenhuma safra de 2025/2026 ou anterior encontrada."); return; }
    const candidatos = contratos.filter(c =>
      (c.status === "aberto" || c.status === "parcial") &&
      safrasAlvo.some(a => a.id === c.ano_safra_id)
    );
    if (candidatos.length === 0) { alert("Nenhum contrato aberto encontrado nessas safras."); return; }
    const confirmado = confirm(
      `Encerrar ${candidatos.length} contrato(s) de venda abertos das safras:\n` +
      safrasAlvo.map(a => `• ${a.descricao}`).join("\n") +
      `\n\nEsta ação marcará todos como "Encerrado" e não pode ser desfeita. Confirmar?`
    );
    if (!confirmado) return;
    try {
      const n = await encerrarContratosPorSafras(fazendaId!, safrasAlvo.map(a => a.id));
      alert(`${n} contrato(s) encerrado(s) com sucesso.`);
      await carregarTudo();
    } catch (e) { setErro(sbErr(e)); }
  }

  // ── render ────────────────────────────────────────────────────
  if (!podeAcessarPlano("contratos")) return <PlanoGate modulo="contratos" />;
  return (
    <div style={{ display:"flex", flexDirection:"column", minHeight:"100vh", background:"#F3F6F9", fontFamily:"system-ui, sans-serif", fontSize:13 }}>
      <TopNav />
      <main style={{ flex:1, display:"flex", flexDirection:"column", minWidth:0 }}>

        <header style={{ background:"#fff", borderBottom:"0.5px solid #D4DCE8", padding:"10px 22px", display:"flex", alignItems:"center", justifyContent:"space-between" }}>
          <div>
            <h1 style={{ margin:0, fontSize:17, fontWeight:600, color:"#1a1a1a" }}>Comercialização de Grãos</h1>
            <p style={{ margin:0, fontSize:11, color:"#444" }}>Contratos de venda, fixações, expedição e posição de estoque</p>
          </div>
          <div style={{ display:"flex", gap:8, alignItems:"center" }}>
            <button onClick={abrirModalLote}
              title="Encerrar contratos ou safras em lote por ano safra"
              style={{ background:"#fff", color:"#555", border:"0.5px solid #CCC", borderRadius:8, padding:"8px 12px", fontSize:12, cursor:"pointer" }}>
              ⊘ Encerramento em Lote
            </button>
            <button onClick={() => { setFRom(ROM_VAZIO()); setModalRomaneio(true); }}
              style={{ background:"#1A5CB8", color:"#fff", border:"none", borderRadius:8, padding:"8px 14px", fontSize:13, fontWeight:600, cursor:"pointer" }}>
              + Romaneio
            </button>
            <button onClick={abrirNovo}
              style={{ background:"#C9921B", color:"#fff", border:"none", borderRadius:8, padding:"8px 14px", fontSize:13, fontWeight:600, cursor:"pointer" }}>
              + Novo Contrato
            </button>
          </div>
        </header>

        <div style={{ padding:"16px 22px", flex:1, overflowY:"auto" }}>
          {erro && (
            <div style={{ background:"#FDECEA", border:"0.5px solid #E24B4A60", borderRadius:8, padding:"10px 14px", marginBottom:14, fontSize:12, color:"#8B1A1A", display:"flex", gap:8 }}>
              <span>✕ {erro}</span>
              <button onClick={carregarTudo} style={{ marginLeft:"auto", fontSize:11, color:"#8B1A1A", background:"none", border:"none", cursor:"pointer", textDecoration:"underline" }}>Tentar novamente</button>
            </div>
          )}
          {loading && <div style={{ textAlign:"center", padding:40, color:"#444" }}>Carregando…</div>}

          {!loading && !erro && (
            <>
              {/* ── KPI único: contratos ativos filtrados ── */}
              <div style={{ background:"#fff", border:"0.5px solid #D4DCE8", borderRadius:12, padding:"12px 18px", marginBottom:14, display:"inline-flex", alignItems:"center", gap:14 }}>
                <div>
                  <div style={{ fontSize:11, color:"#555" }}>Contratos ativos{hasAnyFilter ? " (filtrado)" : ""}</div>
                  <div style={{ fontSize:22, fontWeight:700, color:"#C9921B", lineHeight:1.2 }}>{contratosAtivos}</div>
                </div>
                <div style={{ width:"0.5px", height:36, background:"#D4DCE8" }} />
                <div style={{ fontSize:12, color:"#888" }}>
                  de <span style={{ color:"#1a1a1a", fontWeight:600 }}>{contratosFiltrados.length}</span> exibido{contratosFiltrados.length !== 1 ? "s" : ""}
                  {hasAnyFilter && <span style={{ color:"#888" }}> · <span style={{ color:"#1a1a1a", fontWeight:600 }}>{contratos.length}</span> total</span>}
                </div>
              </div>

              {/* ── Abas ── */}
              <div style={{ display:"flex", background:"#fff", borderRadius:"12px 12px 0 0", border:"0.5px solid #D4DCE8" }}>
                {([
                  { key:"contratos", label:"Contratos",              count: contratos.length },
                  { key:"expedicao", label:"Expedição / Romaneios",  count: todosRomaneios.length },
                  { key:"posicao",   label:"Posição de Estoque",     count: null },
                ] as { key: AbaLista; label: string; count: number|null }[]).map(a => (
                  <button key={a.key} onClick={() => setAbaLista(a.key)} style={{
                    padding:"11px 20px", border:"none", background:"transparent", cursor:"pointer",
                    fontWeight: abaLista===a.key ? 600 : 400, fontSize:13,
                    color: abaLista===a.key ? "#1a1a1a" : "#555",
                    borderBottom: abaLista===a.key ? "2px solid #1A4870" : "2px solid transparent",
                    display:"flex", alignItems:"center", gap:8,
                  }}>
                    {a.label}
                    {a.count !== null && <span style={{ fontSize:10, background: abaLista===a.key?"#D5E8F5":"#DEE5EE", color: abaLista===a.key?"#0B2D50":"#555", padding:"1px 6px", borderRadius:8 }}>{a.count}</span>}
                  </button>
                ))}
              </div>

              {/* ── ABA CONTRATOS ── */}
              {abaLista === "contratos" && (
                <div style={{ background:"#fff", border:"0.5px solid #D4DCE8", borderTop:"none", borderRadius:"0 0 12px 12px", overflow:"hidden" }}>
                  {/* barra de filtros */}
                  <div style={{ padding:"10px 14px", borderBottom:"0.5px solid #EEF1F6", background:"#FAFBFD", display:"flex", gap:8, alignItems:"center", flexWrap:"wrap" }}>
                    {/* busca livre */}
                    <input value={filtroBusca} onChange={e => setFiltroBusca(e.target.value)} placeholder="🔍 Buscar contrato, comprador…"
                      style={{ padding:"5px 10px", border:"0.5px solid #D4DCE8", borderRadius:7, fontSize:12, color:"#1a1a1a", background:"#fff", outline:"none", minWidth:190 }} />
                    {/* safra */}
                    <select value={filtroAno} onChange={e => { setFiltroAno(e.target.value); setFiltroCiclo(""); }}
                      style={{ padding:"5px 8px", border:"0.5px solid #D4DCE8", borderRadius:7, fontSize:12, color:"#1a1a1a", background:"#fff", outline:"none" }}>
                      <option value="">Todos os anos safra</option>
                      {anosSafra.map(a => <option key={a.id} value={a.id}>{a.descricao}</option>)}
                    </select>
                    {/* ciclo */}
                    <select value={filtroCiclo} onChange={e => setFiltroCiclo(e.target.value)}
                      disabled={!filtroAno || ciclosFiltro.length === 0}
                      style={{ padding:"5px 8px", border:"0.5px solid #D4DCE8", borderRadius:7, fontSize:12, color:"#1a1a1a", background:"#fff", outline:"none", opacity: !filtroAno ? 0.5 : 1 }}>
                      <option value="">Todos os ciclos</option>
                      {ciclosFiltro.map(c => <option key={c.id} value={c.id}>{c.cultura}{c.descricao ? ` — ${c.descricao}` : ""}</option>)}
                    </select>
                    {/* produto */}
                    <select value={filtroProduto} onChange={e => setFiltroProduto(e.target.value)}
                      style={{ padding:"5px 8px", border:"0.5px solid #D4DCE8", borderRadius:7, fontSize:12, color:"#1a1a1a", background:"#fff", outline:"none" }}>
                      <option value="">Todos os produtos</option>
                      {PRODUTOS_DIN.map(p => <option key={p} value={p}>{p}</option>)}
                    </select>
                    {/* comprador */}
                    <select value={filtroComprador} onChange={e => setFiltroComprador(e.target.value)}
                      style={{ padding:"5px 8px", border:"0.5px solid #D4DCE8", borderRadius:7, fontSize:12, color:"#1a1a1a", background:"#fff", outline:"none", maxWidth:160 }}>
                      <option value="">Todos os compradores</option>
                      {compradores.map(cp => <option key={cp} value={cp}>{cp}</option>)}
                    </select>
                    {/* status */}
                    <select value={filtroStatus} onChange={e => setFiltroStatus(e.target.value)}
                      style={{ padding:"5px 8px", border:"0.5px solid #D4DCE8", borderRadius:7, fontSize:12, color:"#1a1a1a", background:"#fff", outline:"none" }}>
                      <option value="">Todos os status</option>
                      <option value="aberto">Aberto</option>
                      <option value="parcial">Parcial</option>
                      <option value="encerrado">Encerrado</option>
                      <option value="cancelado">Cancelado</option>
                    </select>
                    {hasAnyFilter && (
                      <button onClick={limparFiltros}
                        style={{ padding:"5px 10px", border:"0.5px solid #D4DCE8", borderRadius:7, fontSize:11, color:"#555", background:"#fff", cursor:"pointer" }}>
                        ✕ Limpar
                      </button>
                    )}
                    <span style={{ marginLeft:"auto", fontSize:11, color:"#888" }}>
                      {contratosFiltrados.length}{hasAnyFilter ? ` de ${contratos.length}` : ""} contrato{contratosFiltrados.length !== 1 ? "s" : ""}
                    </span>
                  </div>
                  {contratosFiltrados.length === 0 ? (
                    <div style={{ padding:32, textAlign:"center", color:"#444", fontSize:12 }}>
                      {contratos.length === 0 ? "Nenhum contrato. Clique em + Novo Contrato para começar." : "Nenhum contrato encontrado para os filtros selecionados."}
                    </div>
                  ) : (
                    <table style={{ width:"100%", borderCollapse:"collapse" }}>
                      <thead>
                        <tr style={{ background:"#F3F6F9" }}>
                          {["Contrato","Produtor / Cliente","Produto","Volume","Entregue","Saldo","Preço","Prazo","Status",""].map((h,i) => (
                            <th key={i} style={{ padding:"8px 12px", textAlign: i>=3&&i<=7?"center":"left", fontSize:11, fontWeight:600, color:"#555", borderBottom:"0.5px solid #D4DCE8", whiteSpace:"nowrap" }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {contratosFiltrados.map(c => {
                          const cs = corStatus(c.status);
                          const cp = corProduto(c.produto);
                          const pct = (c.quantidade_sc??0)>0 ? Math.round((c.entregue_sc??0)/(c.quantidade_sc??1)*100) : 0;
                          const exp = expandido.has(c.id);
                          return (
                            <React.Fragment key={c.id}>
                              <tr style={{ borderBottom:"0.5px solid #DEE5EE", cursor:"pointer" }} onClick={() => toggleExpand(c.id)}>
                                <td style={{ padding:"10px 12px" }}>
                                  <div style={{ fontWeight:600, fontSize:12, color:"#1a1a1a", display:"flex", alignItems:"center", gap:6, flexWrap:"wrap" }}>
                                    {c.numero}
                                    {(c as {is_arrendamento?:boolean}).is_arrendamento && (
                                      <span style={{ fontSize:9, background:"#FBF3E0", color:"#7A5A12", padding:"1px 6px", borderRadius:4, fontWeight:600, letterSpacing:"0.3px" }}>ARRENDAMENTO</span>
                                    )}
                                    {(c as {dado_em_cessao?:boolean}).dado_em_cessao && (
                                      <span style={{ fontSize:9, background:"#EDE9FE", color:"#5B21B6", padding:"1px 6px", borderRadius:4, fontWeight:600, letterSpacing:"0.3px" }}>CESSÃO</span>
                                    )}
                                  </div>
                                  <div style={{ fontSize:10, color:"#444" }}>{c.tipo?.toUpperCase() ?? "VENDA"} · Safra {c.safra}</div>
                                </td>
                                <td style={{ padding:"10px 12px", fontSize:12, color:"#1a1a1a", maxWidth:200 }}>
                                  <div style={{ overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{c.comprador || "—"}</div>
                                </td>
                                <td style={{ padding:"10px 12px" }}>
                                  <span style={{ fontSize:10, background:cp.bg, color:cp.color, padding:"2px 8px", borderRadius:8 }}>{c.produto}</span>
                                </td>
                                <td style={{ padding:"10px 12px", textAlign:"center", fontWeight:600, color:"#1a1a1a" }}>{(c.quantidade_sc??0).toLocaleString("pt-BR")} sc</td>
                                <td style={{ padding:"10px 12px", textAlign:"center" }}>
                                  <div style={{ fontWeight:600, color:"#1A4870" }}>{(c.entregue_sc??0).toLocaleString("pt-BR")} sc</div>
                                  <div style={{ height:3, background:"#DEE5EE", borderRadius:2, marginTop:3, width:56, margin:"3px auto 0" }}>
                                    <div style={{ height:"100%", width:`${pct}%`, background: pct===100?"#1A4870":"#EF9F27", borderRadius:2 }} />
                                  </div>
                                </td>
                                <td style={{ padding:"10px 12px", textAlign:"center", fontWeight:600, color: ((c.quantidade_sc??0)-(c.entregue_sc??0))>0?"#EF9F27":"#1A4870" }}>
                                  {((c.quantidade_sc??0)-(c.entregue_sc??0)).toLocaleString("pt-BR")} sc
                                </td>
                                <td style={{ padding:"10px 12px", textAlign:"center", fontSize:12, whiteSpace:"nowrap", color:"#1a1a1a" }}>
                                  {c.modalidade==="fixo" && c.moeda==="USD" && (
                                    <div>
                                      <div style={{ fontWeight:600 }}>US$ {(c.preco??0).toLocaleString("pt-BR",{minimumFractionDigits:2})}/sc</div>
                                      <div style={{ fontSize:10, color:"#378ADD", marginTop:1 }}>≈ {fmtR$(Math.round((c.preco??0)*ptaxAtual*100)/100)}/sc</div>
                                    </div>
                                  )}
                                  {c.modalidade==="fixo" && c.moeda!=="USD" && <span style={{ fontWeight:600 }}>{fmtR$(c.preco??0)}/sc</span>}
                                  {c.modalidade==="a_fixar" && <span style={{ color:"#378ADD", fontWeight:600 }}>A fixar</span>}
                                  {c.modalidade==="barter"  && <span style={{ color:"#8B5E14", fontWeight:600 }}>Barter</span>}
                                </td>
                                <td style={{ padding:"10px 12px", textAlign:"center", fontSize:11, color: c.data_entrega&&new Date(c.data_entrega)<new Date(TODAY)&&c.status!=="encerrado"?"#E24B4A":"#666", whiteSpace:"nowrap" }}>{fmtData(c.data_entrega)}</td>
                                <td style={{ padding:"10px 12px", textAlign:"center" }}>
                                  <span style={{ fontSize:10, background:cs.bg, color:cs.color, padding:"2px 8px", borderRadius:8 }}>{cs.label}</span>
                                </td>
                                <td style={{ padding:"10px 12px", textAlign:"right" }}>
                                  <div style={{ display:"flex", gap:4, justifyContent:"flex-end" }} onClick={e => e.stopPropagation()}>
                                    <button style={{ padding:"3px 9px", border:"0.5px solid #D4DCE8", borderRadius:5, background:"transparent", cursor:"pointer", fontSize:11, color:"#666" }} onClick={() => abrirEditar(c)}>Editar</button>
                                    {c.status !== "encerrado" && c.status !== "cancelado" && (
                                      <button style={{ padding:"3px 9px", border:"0.5px solid #C9921B50", borderRadius:5, background:"#FBF3E0", cursor:"pointer", fontSize:11, color:"#7A5200" }}
                                        onClick={async () => {
                                          // Se for cessão, avisa sobre a liquidação automática dos CPs
                                          const debs = (c as {dado_em_cessao?:boolean}).dado_em_cessao
                                            ? await listarCessaoDebitos(c.id) : [];
                                          const msg = debs.length > 0
                                            ? `Encerrar contrato ${c.numero}?\n\nIsso também vai liquidar automaticamente ${debs.length} CP(s) vinculado(s) à cessão de crédito (total: R$ ${debs.reduce((s,d)=>s+d.valor_cessao,0).toLocaleString("pt-BR",{minimumFractionDigits:2})}).`
                                            : `Encerrar contrato ${c.numero}?`;
                                          if (!confirm(msg)) return;
                                          await atualizarContrato(c.id, { status: "encerrado" });
                                          // Baixa automática dos CPs vinculados à cessão
                                          for (const d of debs) {
                                            try {
                                              await baixarLancamento(d.lancamento_id, d.valor_cessao, TODAY, "cessao", {
                                                observacao: `Baixa automática por cessão de crédito — Contrato ${c.numero}`,
                                              });
                                            } catch { /* não bloqueia o encerramento se uma baixa falhar */ }
                                          }
                                          await carregarTudo();
                                        }}>
                                        Encerrar
                                      </button>
                                    )}
                                    <button style={{ padding:"3px 9px", border:"0.5px solid #E24B4A50", borderRadius:5, background:"#FCEBEB", cursor:"pointer", fontSize:11, color:"#791F1F" }}
                                      onClick={async () => { if (confirm(`Excluir contrato ${c.numero} permanentemente? Esta ação não pode ser desfeita.`)) { await excluirContrato(c.id); await carregarTudo(); } }}>
                                      Excluir
                                    </button>
                                    <span style={{ color:"#444", fontSize:10, display:"inline-block", transform: exp?"rotate(90deg)":"rotate(0deg)", transition:"transform 0.15s", cursor:"pointer", padding:"4px" }} onClick={() => toggleExpand(c.id)}>▶</span>
                                  </div>
                                </td>
                              </tr>
                              {exp && (
                                <tr key={`${c.id}-exp`}>
                                  <td colSpan={10} style={{ background:"#F8FAFD", padding:0, borderBottom:"0.5px solid #DEE5EE" }}>
                                    <div style={{ padding:"12px 16px" }}>
                                      {/* Itens do contrato */}
                                      {c.itens && c.itens.length > 0 && (
                                        <div style={{ marginBottom:12 }}>
                                          <div style={{ fontSize:11, fontWeight:600, color:"#555", marginBottom:6 }}>Itens do Contrato</div>
                                          <table style={{ width:"100%", borderCollapse:"collapse", background:"#fff", border:"0.5px solid #D4DCE8", borderRadius:8, overflow:"hidden" }}>
                                            <thead>
                                              <tr style={{ background:"#F3F6F9" }}>
                                                {["Tipo","Produto","Qtd","Unid","Vlr Unit.","Vlr Total","Classificação"].map((h,i) => (
                                                  <th key={i} style={{ padding:"6px 10px", textAlign: i>=2?"center":"left", fontSize:10, fontWeight:600, color:"#555", borderBottom:"0.5px solid #D4DCE8" }}>{h}</th>
                                                ))}
                                              </tr>
                                            </thead>
                                            <tbody>
                                              {c.itens.map((it,ii) => (
                                                <tr key={ii} style={{ borderBottom: ii<c.itens.length-1?"0.5px solid #eee":"none" }}>
                                                  <td style={{ padding:"6px 10px", fontSize:11, color:"#555" }}>{it.tipo}</td>
                                                  <td style={{ padding:"6px 10px", fontSize:11, fontWeight:600, color:"#1a1a1a" }}>{it.produto}</td>
                                                  <td style={{ padding:"6px 10px", textAlign:"center", fontSize:11 }}>{(it.quantidade??0).toLocaleString("pt-BR")}</td>
                                                  <td style={{ padding:"6px 10px", textAlign:"center", fontSize:11 }}>{it.unidade}</td>
                                                  <td style={{ padding:"6px 10px", textAlign:"center", fontSize:11 }}>{fmtR$(it.valor_unitario??0)}</td>
                                                  <td style={{ padding:"6px 10px", textAlign:"center", fontSize:11, fontWeight:600, color:"#1A4870" }}>{fmtR$(it.valor_total??0)}</td>
                                                  <td style={{ padding:"6px 10px", fontSize:10, color:"#666" }}>{it.classificacao || "—"}</td>
                                                </tr>
                                              ))}
                                            </tbody>
                                          </table>
                                        </div>
                                      )}
                                      {/* Romaneios */}
                                      <div style={{ fontSize:11, fontWeight:600, color:"#555", marginBottom:6 }}>Expedição / Romaneios</div>
                                      {c.romaneios.length === 0 ? (
                                        <div style={{ fontSize:11, color:"#888", padding:"8px 0" }}>Nenhum romaneio lançado.</div>
                                      ) : (
                                        <table style={{ width:"100%", borderCollapse:"collapse", background:"#fff", border:"0.5px solid #D4DCE8", borderRadius:8, overflow:"hidden" }}>
                                          <thead>
                                            <tr style={{ background:"#FBF0D8" }}>
                                              {["Romaneio","Data","Placa","P. Bruto","Tara","P. Líquido","Sacas","NF-e"].map((h,i) => (
                                                <th key={i} style={{ padding:"6px 10px", textAlign: i>=3?"center":"left", fontSize:10, fontWeight:600, color:"#555", borderBottom:"0.5px solid #D4DCE8" }}>{h}</th>
                                              ))}
                                            </tr>
                                          </thead>
                                          <tbody>
                                            {c.romaneios.map((r,ri) => (
                                              <tr key={ri} style={{ borderBottom: ri<c.romaneios.length-1?"0.5px solid #eee":"none" }}>
                                                <td style={{ padding:"6px 10px", fontWeight:600, fontSize:11 }}>{r.numero}</td>
                                                <td style={{ padding:"6px 10px", fontSize:11 }}>{fmtData(r.data)}</td>
                                                <td style={{ padding:"6px 10px", fontSize:11, fontFamily:"monospace" }}>{r.placa}</td>
                                                <td style={{ padding:"6px 10px", textAlign:"center", fontSize:11 }}>{fmtPeso(r.peso_bruto_kg??0)}</td>
                                                <td style={{ padding:"6px 10px", textAlign:"center", fontSize:11 }}>{fmtPeso(r.tara_kg??0)}</td>
                                                <td style={{ padding:"6px 10px", textAlign:"center", fontSize:11, fontWeight:600 }}>{fmtPeso(r.peso_liquido_kg??0)}</td>
                                                <td style={{ padding:"6px 10px", textAlign:"center", fontSize:11, fontWeight:600, color:"#1A4870" }}>{(r.sacas??0).toLocaleString("pt-BR")}</td>
                                                <td style={{ padding:"6px 10px", textAlign:"center" }}>
                                                  {r.nfe_numero ? badge(`✓ ${r.nfe_numero}`) : <span style={{ fontSize:10, background:"#FAEEDA", color:"#633806", padding:"2px 6px", borderRadius:6 }}>⟳ Gerando…</span>}
                                                </td>
                                              </tr>
                                            ))}
                                          </tbody>
                                        </table>
                                      )}
                                      <div style={{ marginTop:10, display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                                        <span style={{ fontSize:11, color:"#555" }}>{c.romaneios.length} romaneio(s) · {(c.entregue_sc??0).toLocaleString("pt-BR")} sc expedidas · saldo {((c.quantidade_sc??0)-(c.entregue_sc??0)).toLocaleString("pt-BR")} sc</span>
                                        <button onClick={e => { e.stopPropagation(); setFRom(p=>({...p,contratoId:c.id})); setModalRomaneio(true); }}
                                          style={{ fontSize:11, padding:"5px 12px", border:"0.5px solid #1A4870", borderRadius:6, background:"#D5E8F5", color:"#0B2D50", cursor:"pointer", fontWeight:600 }}>
                                          + Lançar Romaneio
                                        </button>
                                      </div>

                                      {/* ── Adiantamentos ── */}
                                      {(() => {
                                        const adts        = adiantamentos[c.id] ?? [];
                                        const totalRec    = adts.reduce((s, a) => s + a.valor, 0);
                                        const totalApl    = adts.reduce((s, a) => s + a.valor_aplicado, 0);
                                        const saldo       = totalRec - totalApl;
                                        const statusCor   = (st: string) => st === "quitado" ? "#16A34A" : st === "parcial" ? "#C9921B" : "#1A4870";
                                        const statusLabel = (st: string) => st === "quitado" ? "Quitado" : st === "parcial" ? "Parcial" : "Disponível";
                                        return (
                                          <div style={{ marginTop:16, borderTop:"0.5px solid #EEF1F6", paddingTop:12 }}>
                                            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:8 }}>
                                              <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                                                <span style={{ fontSize:11, fontWeight:600, color:"#555" }}>💰 Adiantamentos</span>
                                                {saldo > 0 && (
                                                  <span style={{ background:"#D5E8F5", color:"#1A4870", fontSize:10, fontWeight:700, padding:"2px 8px", borderRadius:10 }}>
                                                    Saldo disponível: {fmtR$(saldo)}
                                                  </span>
                                                )}
                                                {adts.length > 0 && saldo <= 0 && (
                                                  <span style={{ background:"#DCFCE7", color:"#15803D", fontSize:10, fontWeight:700, padding:"2px 8px", borderRadius:10 }}>✓ Totalmente aplicado</span>
                                                )}
                                              </div>
                                              <button onClick={e => { e.stopPropagation(); setAdiantContratoId(c.id); setFAdiant({ data:TODAY, valor:"", descricao:"" }); setModalAdiant(true); }}
                                                style={{ fontSize:11, padding:"4px 10px", border:"0.5px solid #C9921B", borderRadius:6, background:"#FBF3E0", color:"#7A5A12", cursor:"pointer", fontWeight:600 }}>
                                                + Registrar Adiantamento
                                              </button>
                                            </div>
                                            {adts.length === 0 ? (
                                              <div style={{ fontSize:11, color:"#aaa", fontStyle:"italic" }}>Nenhum adiantamento registrado para este contrato.</div>
                                            ) : (
                                              <>
                                                <table style={{ width:"100%", borderCollapse:"collapse", fontSize:11, background:"#FAFBFD", border:"0.5px solid #EEF1F6", borderRadius:8, overflow:"hidden" }}>
                                                  <thead>
                                                    <tr style={{ background:"#FBF3E0" }}>
                                                      {["Data","Valor recebido","Aplicado","Saldo","Status"].map((h,i) => (
                                                        <th key={i} style={{ padding:"5px 10px", textAlign:i===0?"left":"center", fontWeight:600, color:"#555", borderBottom:"0.5px solid #EEF1F6" }}>{h}</th>
                                                      ))}
                                                    </tr>
                                                  </thead>
                                                  <tbody>
                                                    {adts.map((a, ai) => (
                                                      <tr key={a.id} style={{ borderBottom: ai<adts.length-1?"0.5px solid #EEF1F6":"none" }}>
                                                        <td style={{ padding:"6px 10px" }}>{fmtData(a.data)}</td>
                                                        <td style={{ padding:"6px 10px", textAlign:"center", fontWeight:600 }}>{fmtR$(a.valor)}</td>
                                                        <td style={{ padding:"6px 10px", textAlign:"center", color:"#888" }}>{a.valor_aplicado > 0 ? fmtR$(a.valor_aplicado) : "—"}</td>
                                                        <td style={{ padding:"6px 10px", textAlign:"center", fontWeight:600, color: a.valor-a.valor_aplicado>0?"#1A4870":"#888" }}>{fmtR$(a.valor - a.valor_aplicado)}</td>
                                                        <td style={{ padding:"6px 10px", textAlign:"center" }}>
                                                          <span style={{ background: statusCor(a.status)+"22", color: statusCor(a.status), fontWeight:600, padding:"2px 7px", borderRadius:8, fontSize:10 }}>{statusLabel(a.status)}</span>
                                                        </td>
                                                      </tr>
                                                    ))}
                                                  </tbody>
                                                </table>
                                                <div style={{ display:"flex", gap:20, padding:"6px 10px", fontSize:11, color:"#555" }}>
                                                  <span>Total recebido: <strong>{fmtR$(totalRec)}</strong></span>
                                                  <span>Aplicado em entregas: <strong>{fmtR$(totalApl)}</strong></span>
                                                  <span style={{ fontWeight:700, color: saldo>0?"#1A4870":"#888" }}>Saldo: {fmtR$(saldo)}</span>
                                                </div>
                                              </>
                                            )}
                                          </div>
                                        );
                                      })()}
                                    </div>
                                  </td>
                                </tr>
                              )}
                            </React.Fragment>
                          );
                        })}
                      </tbody>
                    </table>
                  )}
                </div>
              )}

              {/* ── ABA EXPEDIÇÃO ── */}
              {abaLista === "expedicao" && (
                <div style={{ background:"#fff", border:"0.5px solid #D4DCE8", borderTop:"none", borderRadius:"0 0 12px 12px", overflow:"hidden" }}>
                  <div style={{ padding:"12px 16px", borderBottom:"0.5px solid #DEE5EE", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                    <span style={{ fontSize:12, color:"#555" }}>{todosRomaneios.length} romaneios · {todosRomaneios.reduce((a,r)=>a+(r.sacas??0),0).toLocaleString("pt-BR")} sc expedidas</span>
                    <button onClick={() => setModalRomaneio(true)} style={{ fontSize:12, padding:"5px 14px", border:"0.5px solid #1A4870", borderRadius:6, background:"#D5E8F5", color:"#0B2D50", cursor:"pointer", fontWeight:600 }}>+ Novo Romaneio</button>
                  </div>
                  {todosRomaneios.length === 0 ? (
                    <div style={{ padding:24, textAlign:"center", color:"#444", fontSize:12 }}>Nenhum romaneio registrado.</div>
                  ) : (
                    <table style={{ width:"100%", borderCollapse:"collapse" }}>
                      <thead>
                        <tr style={{ background:"#F3F6F9" }}>
                          {["Romaneio","Data","Contrato","Comprador","Produto","Placa","P. Bruto","Tara","P. Líquido","Sacas","NF-e"].map((h,i) => (
                            <th key={i} style={{ padding:"8px 12px", textAlign:i>=6?"center":"left", fontSize:11, fontWeight:600, color:"#555", borderBottom:"0.5px solid #D4DCE8", whiteSpace:"nowrap" }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {[...todosRomaneios].sort((a,b) => (b.data??"").localeCompare(a.data??"")).map((r,ri,arr) => {
                          const cp = corProduto(r.produto);
                          return (
                            <tr key={ri} style={{ borderBottom: ri<arr.length-1?"0.5px solid #DEE5EE":"none" }}>
                              <td style={{ padding:"9px 12px", fontWeight:600, fontSize:12 }}>{r.numero}</td>
                              <td style={{ padding:"9px 12px", fontSize:11, whiteSpace:"nowrap" }}>{fmtData(r.data)}</td>
                              <td style={{ padding:"9px 12px", fontSize:11, fontWeight:600, color:"#C9921B" }}>{r.contratoNumero}</td>
                              <td style={{ padding:"9px 12px", fontSize:11, maxWidth:160, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{r.comprador}</td>
                              <td style={{ padding:"9px 12px" }}><span style={{ fontSize:10, background:cp.bg, color:cp.color, padding:"2px 7px", borderRadius:8 }}>{r.produto}</span></td>
                              <td style={{ padding:"9px 12px", fontSize:11, fontFamily:"monospace" }}>{r.placa}</td>
                              <td style={{ padding:"9px 12px", textAlign:"center", fontSize:11 }}>{fmtPeso(r.peso_bruto_kg??0)}</td>
                              <td style={{ padding:"9px 12px", textAlign:"center", fontSize:11 }}>{fmtPeso(r.tara_kg??0)}</td>
                              <td style={{ padding:"9px 12px", textAlign:"center", fontSize:11, fontWeight:600 }}>{fmtPeso(r.peso_liquido_kg??0)}</td>
                              <td style={{ padding:"9px 12px", textAlign:"center", fontWeight:600, color:"#1A4870" }}>{(r.sacas??0).toLocaleString("pt-BR")}</td>
                              <td style={{ padding:"9px 12px", textAlign:"center" }}>
                                {r.nfe_numero ? badge(`✓ ${r.nfe_numero}`) : <span style={{ fontSize:10, background:"#FAEEDA", color:"#633806", padding:"2px 6px", borderRadius:6 }}>⟳ Gerando…</span>}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  )}
                </div>
              )}

              {/* ── ABA POSIÇÃO DE ESTOQUE ── */}
              {abaLista === "posicao" && (
                <div style={{ background:"#F3F6F9", border:"0.5px solid #D4DCE8", borderTop:"none", borderRadius:"0 0 12px 12px", padding:20 }}>
                  {posicao.length === 0 ? (
                    <div style={{ textAlign:"center", padding:48, color:"#888", fontSize:13 }}>Nenhum contrato ativo com saldo.</div>
                  ) : (
                    <div style={{ background:"#fff", border:"0.5px solid #D4DCE8", borderRadius:10, overflow:"hidden" }}>
                      <table style={{ width:"100%", borderCollapse:"collapse", fontSize:13 }}>
                        <thead>
                          <tr style={{ background:"#F8FAFD", borderBottom:"0.5px solid #D4DCE8" }}>
                            <th style={{ padding:"10px 16px", textAlign:"left", fontWeight:600, fontSize:12, color:"#555" }}>Cultura</th>
                            <th style={{ padding:"10px 16px", textAlign:"right", fontWeight:600, fontSize:12, color:"#555" }}>Contratado (sc)</th>
                            <th style={{ padding:"10px 16px", textAlign:"right", fontWeight:600, fontSize:12, color:"#555" }}>Entregue (sc)</th>
                            <th style={{ padding:"10px 16px", textAlign:"right", fontWeight:600, fontSize:12, color:"#555" }}>Saldo (sc)</th>
                            <th style={{ padding:"10px 16px", textAlign:"left", fontWeight:600, fontSize:12, color:"#555" }}>Progresso</th>
                            <th style={{ padding:"10px 16px", textAlign:"right", fontWeight:600, fontSize:12, color:"#555" }}>% Entregue</th>
                          </tr>
                        </thead>
                        <tbody>
                          {posicao.map((p, i) => (
                            <tr key={p.produto} style={{ borderBottom:"0.5px solid #EEF1F6", background:i%2===0?"#fff":"#FAFBFD" }}>
                              <td style={{ padding:"10px 16px", fontWeight:600, color:"#1a1a1a" }}>{p.produto}</td>
                              <td style={{ padding:"10px 16px", textAlign:"right", color:"#1a1a1a" }}>{p.contratado.toLocaleString("pt-BR")}</td>
                              <td style={{ padding:"10px 16px", textAlign:"right", color:"#16A34A", fontWeight:600 }}>{p.entregue.toLocaleString("pt-BR")}</td>
                              <td style={{ padding:"10px 16px", textAlign:"right", color:p.saldo>0?"#E24B4A":"#16A34A", fontWeight:600 }}>{p.saldo.toLocaleString("pt-BR")}</td>
                              <td style={{ padding:"10px 16px", minWidth:140 }}>
                                <div style={{ height:8, background:"#EEF1F6", borderRadius:4, overflow:"hidden" }}>
                                  <div style={{ height:"100%", width:p.pct+"%", background:p.pct===100?"#16A34A":"#1A4870", borderRadius:4 }} />
                                </div>
                              </td>
                              <td style={{ padding:"10px 16px", textAlign:"right", fontWeight:700, color:p.pct===100?"#16A34A":"#1A4870" }}>{p.pct}%</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}            </>
          )}
        </div>
      </main>

      {/* ══════════════════════════════════════════════════════════
          MODAL CONTRATO — Principal / Adicionais / Itens
      ═══════════════════════════════════════════════════════════ */}
      {modalContrato && (
        <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.50)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:120 }}
          onClick={e => { if (e.target===e.currentTarget) setModalContrato(false); }}>
          <div style={{ background:"#fff", borderRadius:14, width:980, maxWidth:"97vw", maxHeight:"95vh", display:"flex", flexDirection:"column", overflow:"hidden" }}>

            {/* Cabeçalho do modal */}
            <div style={{ padding:"14px 20px", borderBottom:"0.5px solid #D4DCE8", display:"flex", alignItems:"center", justifyContent:"space-between" }}>
              <div style={{ fontWeight:600, fontSize:15, color:"#1a1a1a" }}>{editContrato ? `Editando ${editContrato.numero}` : "Novo Contrato"}</div>
              <div style={{ display:"flex", gap:8, alignItems:"center" }}>
                {/* Autorização */}
                <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                  <span style={{ fontSize:11, color:"#555" }}>Autorização:</span>
                  <select style={{ ...inp, width:"auto", padding:"5px 8px" }} value={fC.autorizacao} onChange={e => setFC(p=>({...p,autorizacao:e.target.value as Contrato["autorizacao"]}))}>
                    <option value="pendente">Pendente</option>
                    <option value="autorizada">Autorizada</option>
                    <option value="recusada">Recusada</option>
                  </select>
                </div>
                <button onClick={() => setModalContrato(false)} style={{ padding:"5px 10px", border:"0.5px solid #D4DCE8", borderRadius:6, background:"transparent", cursor:"pointer", fontSize:12 }}>✕ Fechar</button>
              </div>
            </div>

            {/* Abas Principal / Adicionais */}
            <div style={{ display:"flex", borderBottom:"0.5px solid #D4DCE8", background:"#F8FAFD" }}>
              {(["principal","adicionais"] as AbaForm[]).map(a => (
                <button key={a} onClick={() => setAbaForm(a)} style={{
                  padding:"9px 20px", border:"none", background:"transparent", cursor:"pointer",
                  fontWeight: abaForm===a?600:400, fontSize:13,
                  color: abaForm===a?"#1a1a1a":"#555",
                  borderBottom: abaForm===a?"2px solid #1A4870":"2px solid transparent",
                }}>
                  {a==="principal" ? "Principal" : "Adicionais"}
                </button>
              ))}
            </div>

            {/* Conteúdo das abas */}
            <div style={{ flex:1, overflowY:"auto", padding:"16px 20px" }}>
              {abaForm === "principal" && (
                <>
                  {/* Linha 1: Nº Lançamento | Nº Contrato | Safra | Tipo Contrato */}
                  <div style={{ display:"grid", gridTemplateColumns:"120px 1fr 1fr 1fr 1fr", gap:12, marginBottom:12 }}>
                    <div>
                      <label style={lbl}>Nº Lançamento</label>
                      <input style={{ ...inp, background:"#F4F6FA", color:"#888" }} value={editContrato?.num_lancamento ?? "—"} readOnly />
                    </div>
                    <div>
                      <label style={lbl}>Nº Contrato</label>
                      <input style={{ ...inp, background:"#F4F6FA", color:"#888" }} value={editContrato?.numero ?? "(gerado ao salvar)"} readOnly />
                    </div>
                    <div>
                      <label style={lbl}>Safra</label>
                      <select style={{ ...inp, color: fC.ano_safra_id ? "#1a1a1a" : "#888" }}
                        value={fC.ano_safra_id}
                        onChange={e => {
                          const sel = anosSafra.find(a => a.id === e.target.value);
                          setFC(p=>({...p, ano_safra_id: e.target.value, safra: sel?.descricao ?? "", ciclo_id: "" }));
                        }}>
                        {anosSafra.length === 0
                          ? <option value="">Cadastre safras em Cadastros → Safras & Ciclos</option>
                          : <>
                              <option value="">— selecione —</option>
                              {anosSafra.map(a => <option key={a.id} value={a.id}>{a.descricao}</option>)}
                            </>
                        }
                      </select>
                    </div>
                    <div>
                      <label style={lbl}>Tipo de Contrato</label>
                      <select style={inp} value={fC.tipo} onChange={e => setFC(p=>({...p,tipo:e.target.value as Contrato["tipo"]}))}>
                        <option value="venda">Venda</option>
                        <option value="compra">Compra</option>
                        <option value="barter">Barter</option>
                        <option value="troca">Troca</option>
                      </select>
                    </div>
                    <div>
                      <label style={lbl}>Data do Contrato</label>
                      <input style={inp} type="date" value={fC.data_contrato} onChange={e => setFC(p=>({...p,data_contrato:e.target.value}))} />
                    </div>
                  </div>

                  {/* Flags */}
                  <div style={{ display:"flex", gap:20, marginBottom:14, padding:"8px 12px", background:"#F4F6FA", borderRadius:8 }}>
                    <label style={{ display:"flex", alignItems:"center", gap:6, cursor:"pointer", fontSize:12, fontWeight:600 }}>
                      <input type="checkbox" checked={fC.confirmado} onChange={e => setFC(p=>({...p,confirmado:e.target.checked}))} /> Confirmado
                    </label>
                    <label style={{ display:"flex", alignItems:"center", gap:6, cursor:"pointer", fontSize:12 }}>
                      <input type="checkbox" checked={fC.a_fixar} onChange={e => setFC(p=>({...p,a_fixar:e.target.checked}))} /> Contrato à fixar
                    </label>
                    <label style={{ display:"flex", alignItems:"center", gap:6, cursor:"pointer", fontSize:12 }}>
                      <input type="checkbox" checked={fC.venda_a_ordem} onChange={e => setFC(p=>({...p,venda_a_ordem:e.target.checked}))} /> Venda a Ordem
                    </label>
                  </div>

                  {/* Linha 2: Produtor | Cliente | Nr Contrato Cliente | Contato Broker */}
                  <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr 1fr", gap:12, marginBottom:12 }}>
                    <div>
                      <label style={lbl}>Produtor</label>
                      <ProdutorCombo
                        produtores={produtores}
                        value={fC.produtor_id}
                        onChange={id => setFC(p => ({ ...p, produtor_id: id }))}
                        placeholder="— selecione —"
                      />
                    </div>
                    <div>
                      <label style={lbl}>Cliente / Comprador</label>
                      <select style={inp} value={fC.pessoa_id} onChange={e => setFC(p=>({...p,pessoa_id:e.target.value}))}>
                        <option value="">— selecione —</option>
                        {pessoas.filter(p => p.cliente).map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
                      </select>
                    </div>
                    <div>
                      <label style={lbl}>Nr. Contrato Cliente</label>
                      <input style={inp} value={fC.nr_contrato_cliente} onChange={e => setFC(p=>({...p,nr_contrato_cliente:e.target.value}))} />
                    </div>
                    <div>
                      <label style={lbl}>Contato Broker</label>
                      <input style={inp} value={fC.contato_broker} onChange={e => setFC(p=>({...p,contato_broker:e.target.value}))} />
                    </div>
                  </div>

                  {/* Linha 3: Grupo Vendedor | Vendedor | Prazo Entrega | Data Pagamento */}
                  <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr 1fr", gap:12, marginBottom:12 }}>
                    <div>
                      <label style={lbl}>Grupo Vendedor</label>
                      <input style={inp} value={fC.grupo_vendedor} onChange={e => setFC(p=>({...p,grupo_vendedor:e.target.value}))} />
                    </div>
                    <div>
                      <label style={lbl}>Vendedor</label>
                      <input style={inp} value={fC.vendedor} onChange={e => setFC(p=>({...p,vendedor:e.target.value}))} />
                    </div>
                    <div>
                      <label style={lbl}>Prazo de Entrega *</label>
                      <input style={inp} type="date" value={fC.data_entrega} onChange={e => setFC(p=>({...p,data_entrega:e.target.value}))} />
                    </div>
                    <div>
                      <label style={lbl}>Data de Pagamento</label>
                      <input style={inp} type="date" value={fC.data_pagamento ?? ""} onChange={e => setFC(p=>({...p,data_pagamento:e.target.value||undefined}))} />
                      <span style={{ fontSize:10, color:"#888", marginTop:2, display:"block" }}>Gera CR ao confirmar</span>
                    </div>
                  </div>

                  {/* Linha 3b: Modalidade + Moeda */}
                  <div style={{ display:"grid", gridTemplateColumns:"160px 110px 1fr", gap:12, marginBottom:12, alignItems:"end" }}>
                    <div>
                      <label style={lbl}>Modalidade de Preço</label>
                      <select style={inp} value={fC.modalidade} onChange={e => setFC(p=>({...p,modalidade:e.target.value as Contrato["modalidade"]}))}>
                        <option value="fixo">Fixo (R$/sc)</option>
                        <option value="a_fixar">A fixar / Basis</option>
                        <option value="barter">Barter</option>
                      </select>
                    </div>
                    <div>
                      <label style={lbl}>Moeda</label>
                      <select style={inp} value={fC.moeda} onChange={e => setFC(p=>({...p,moeda:e.target.value as Contrato["moeda"]}))}>
                        <option value="BRL">R$ — Real</option>
                        <option value="USD">US$ — Dólar</option>
                      </select>
                    </div>
                    {fC.moeda === "USD" && (
                      <div style={{ display:"flex", alignItems:"center", gap:8, padding:"7px 10px", background:"#FAEEDA", border:"0.5px solid #E8C97A", borderRadius:7, fontSize:12 }}>
                        <span style={{ color:"#633806" }}>PTAX D-1: <strong>R$ {ptaxAtual.toFixed(4)}</strong></span>
                        <span style={{ color:"#888", fontSize:10 }}>· atualizado automaticamente</span>
                      </div>
                    )}
                  </div>

                  {/* Linha 4: Natureza de Operação | CFOP | Saldo Contrato | Frete | Valor Frete */}
                  <div style={{ display:"grid", gridTemplateColumns:"1fr 100px 160px 160px 120px", gap:12, marginBottom:4 }}>
                    <div>
                      <label style={{ ...lbl, display:"flex", alignItems:"center", gap:6 }}>
                        Natureza de Operação das Notas Fiscais
                        {fC.natureza_codigo && fC.natureza_codigo === naturezaSugerida && (
                          <span style={{ fontSize:9, background:"#D5F0E4", color:"#16703A", padding:"1px 6px", borderRadius:6, fontWeight:600 }}>
                            ✦ sugerida automaticamente
                          </span>
                        )}
                      </label>
                      <select style={inp} value={fC.natureza_codigo}
                        onChange={e => {
                          const nat = NATUREZAS_OPERACAO.find(n => n.codigo === e.target.value);
                          setNaturezaSugerida(""); // usuário editou manualmente — cancela sugestão
                          setFC(p=>({
                            ...p,
                            natureza_codigo:   e.target.value,
                            natureza_operacao: nat?.descricao ?? "",
                            cfop:              nat?.cfop_inter ?? p.cfop,
                          }));
                        }}>
                        <option value="">— selecione a natureza —</option>
                        {NATUREZAS_OPERACAO.map(n => (
                          <option key={n.codigo} value={n.codigo}>{n.descricao}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label style={lbl}>CFOP <span style={{ color:"#888", fontWeight:400 }}>(auto)</span></label>
                      <input style={inp} value={fC.cfop} onChange={e => setFC(p=>({...p,cfop:e.target.value}))} placeholder="6101" />
                    </div>
                    <div>
                      <label style={lbl}>Saldo do Contrato</label>
                      <select style={inp} value={fC.saldo_tipo} onChange={e => setFC(p=>({...p,saldo_tipo:e.target.value as Contrato["saldo_tipo"]}))}>
                        <option value="peso_saida">Peso Saída</option>
                        <option value="peso_entrada">Peso Entrada</option>
                      </select>
                    </div>
                    <div>
                      <label style={lbl}>Frete</label>
                      <select style={inp} value={fC.frete} onChange={e => setFC(p=>({...p,frete:e.target.value as Contrato["frete"]}))}>
                        {FRETES.map(f => <option key={f} value={f}>{FRETE_LBL[f]}</option>)}
                      </select>
                    </div>
                    <div>
                      <label style={lbl}>Valor Frete (R$)</label>
                      <InputMonetario style={inp} value={fC.valor_frete||""} onChange={v => setFC(p=>({...p,valor_frete:v}))} placeholder="0,00" />
                    </div>
                  </div>

                  {/* Box de informação fiscal — aparece quando natureza selecionada */}
                  {fC.natureza_codigo && (() => {
                    const nat = NATUREZAS_OPERACAO.find(n => n.codigo === fC.natureza_codigo);
                    if (!nat) return null;
                    return (
                      <div style={{ background:"#EBF4FB", border:"0.5px solid #93C5E8", borderRadius:8, padding:"10px 14px", marginBottom:14, fontSize:11 }}>
                        <div style={{ fontWeight:600, color:"#0B2D50", marginBottom:4 }}>Informação Fiscal — {nat.descricao}</div>
                        <div style={{ display:"flex", gap:24, flexWrap:"wrap", color:"#1A4870" }}>
                          <span>CFOP Inter-Estadual: <strong>{nat.cfop_inter}</strong></span>
                          <span>CFOP Intra-Estadual: <strong>{nat.cfop_intra}</strong></span>
                          <span>CST ICMS: <strong>{nat.cst_icms}</strong></span>
                        </div>
                        <div style={{ color:"#555", marginTop:4 }}>{nat.obs}</div>
                      </div>
                    );
                  })()}

                  {/* ── GRID DE ITENS ── */}
                  <div style={{ border:"0.5px solid #D4DCE8", borderRadius:10, overflow:"hidden", marginBottom:8 }}>
                    <div style={{ padding:"8px 14px", background:"#F3F6F9", borderBottom:"0.5px solid #D4DCE8", display:"flex", alignItems:"center", justifyContent:"space-between" }}>
                      <span style={{ fontSize:12, fontWeight:600, color:"#555" }}>Itens do Contrato</span>
                      <button style={{ fontSize:11, padding:"3px 10px", border:"0.5px solid #1A5CB8", borderRadius:5, background:"#E6F1FB", color:"#1A5CB8", cursor:"pointer" }}
                        onClick={() => setItens(p => [...p, itemVazio()])}>+ Item</button>
                    </div>
                    <table style={{ width:"100%", borderCollapse:"collapse" }}>
                      <thead>
                        <tr style={{ background:"#F8FAFD" }}>
                          {["Tipo","Item / Produto","Peso (kg)","Equiv. (sc)", fC.moeda === "USD" ? "Valor (US$/sc)" : "Valor (R$/sc)","Valor Total",""].map((h,i) => (
                            <th key={i} style={{ padding:"6px 10px", textAlign: i>=2&&i<=5?"center":"left", fontSize:10, fontWeight:600, color:"#555", borderBottom:"0.5px solid #D4DCE8", whiteSpace:"nowrap" }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {itensCalc.map((it,idx) => (
                          <tr key={idx} style={{ borderBottom:"0.5px solid #eee" }}>
                            <td style={{ padding:"6px 8px", width:90 }}>
                              <select style={{ ...inp, fontSize:11 }} value={it.tipo} onChange={e => atualizarItem(idx,"tipo",e.target.value)}>
                                <option>Produto</option>
                                <option>Serviço</option>
                              </select>
                            </td>
                            <td style={{ padding:"6px 8px", minWidth:130 }}>
                              <select style={{ ...inp, fontSize:11 }} value={it.produto} onChange={e => atualizarItem(idx,"produto",e.target.value)}>
                                {PRODUTOS_DIN.map(pr => <option key={pr}>{pr}</option>)}
                              </select>
                            </td>
                            {/* Peso em kg — campo primário */}
                            <td style={{ padding:"6px 8px", width:120 }}>
                              <InputNumerico style={{ ...inp, textAlign:"right", fontSize:12 }} decimais={0} min="0"
                                value={it._qKg > 0 ? it._qKg : ""}
                                onChange={v => atualizarItem(idx,"quantidade_kg",v)}
                                placeholder="0 kg" />
                              <span style={{ fontSize:9, color:"#888", display:"block", textAlign:"right", marginTop:1 }}>kg</span>
                            </td>
                            {/* Sacas equivalentes — campo secundário */}
                            <td style={{ padding:"6px 8px", width:110 }}>
                              <InputNumerico style={{ ...inp, textAlign:"right", fontSize:12, background:"#F8FAFF", borderColor:"#C4D0E8" }} decimais={3} min="0"
                                value={it._qSc > 0 ? +it._qSc.toFixed(3) : ""}
                                onChange={v => atualizarItem(idx,"quantidade_sc",v)}
                                placeholder="0 sc" />
                              <span style={{ fontSize:9, color:"#888", display:"block", textAlign:"right", marginTop:1 }}>sc ({classeCommodityDin(it.produto).kg_saca} kg/sc)</span>
                            </td>
                            <td style={{ padding:"6px 8px", width:120 }}>
                              <InputMonetario style={{ ...inp, textAlign:"right", fontSize:12 }} min="0" value={it.valor_unitario||""} onChange={v => atualizarItem(idx,"valor_unitario",v)} placeholder="0,00" />
                            </td>
                            <td style={{ padding:"6px 8px", width:130 }}>
                              <input style={{ ...inp, background:"#F4F6FA", textAlign:"right", fontSize:12, fontWeight:600, color:"#1A4870" }}
                                value={(it.valor_total??0).toLocaleString("pt-BR",{style:"currency",currency: fC.moeda === "USD" ? "USD" : "BRL"})} readOnly />
                            </td>
                            <td style={{ padding:"6px 8px", width:34 }}>
                              {itens.length > 1 && <button style={btnX} onClick={() => setItens(p => p.filter((_,i)=>i!==idx))}>✕</button>}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {/* Rodapé de totais */}
                    {(() => {
                      const fmtValor = (v: number) => v.toLocaleString("pt-BR", { style:"currency", currency: fC.moeda === "USD" ? "USD" : "BRL" });
                      return (
                        <div style={{ padding:"8px 14px", background:"#F3F6F9", borderTop:"0.5px solid #D4DCE8", display:"flex", justifyContent:"flex-end", gap:32 }}>
                          <span style={{ fontSize:12, color:"#555" }}>Valor Financeiro: <strong style={{ color:"#1a1a1a" }}>{fmtValor(valorFinanceiro)}</strong></span>
                          <span style={{ fontSize:12, color:"#555" }}>Frete: <strong style={{ color:"#1a1a1a" }}>{fmtR$(fC.valor_frete||0)}</strong></span>
                          <span style={{ fontSize:13, fontWeight:600, color:"#1A4870" }}>Valor Total: {fmtValor(valorTotal)}</span>
                        </div>
                      );
                    })()}
                  </div>
                </>
              )}

              {abaForm === "adicionais" && (
                <>
                  <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:14, marginBottom:14 }}>
                    <div>
                      <label style={lbl}>Propriedade <span style={{ color:"#888", fontWeight:400 }}>(fazenda)</span></label>
                      <select style={{ ...inp, color: fC.propriedade ? "#1a1a1a" : "#888" }}
                        value={fC.propriedade} onChange={e => setFC(p=>({...p,propriedade:e.target.value}))}>
                        {fazendas.length === 0
                          ? <option value="">Nenhuma fazenda cadastrada</option>
                          : <>
                              <option value="">— selecione a propriedade —</option>
                              {fazendas.map(f => <option key={f.id} value={f.nome}>{f.nome}{f.municipio ? ` — ${f.municipio}/${f.estado}` : ""}</option>)}
                            </>
                        }
                      </select>
                    </div>
                    <div>
                      <label style={lbl}>Empreendimento / Ciclo <span style={{ color:"#888", fontWeight:400 }}>(vinculado à safra selecionada)</span></label>
                      <select style={{ ...inp, color: fC.ciclo_id ? "#1a1a1a" : "#888" }}
                        value={fC.ciclo_id} onChange={e => setFC(p=>({...p,ciclo_id:e.target.value}))}>
                        {!fC.ano_safra_id
                          ? <option value="">Selecione a Safra na aba Principal primeiro</option>
                          : ciclos.length === 0
                            ? <option value="">Nenhum ciclo cadastrado para esta safra</option>
                            : <>
                                <option value="">— selecione o ciclo —</option>
                                {ciclos.map(ci => <option key={ci.id} value={ci.id}>{ci.descricao} — {ci.cultura}</option>)}
                              </>
                        }
                      </select>
                    </div>
                    <div>
                      <label style={lbl}>Seguradora</label>
                      <input style={inp} value={fC.seguradora} onChange={e => setFC(p=>({...p,seguradora:e.target.value}))} placeholder="Nome da seguradora" />
                    </div>
                    <div>
                      <label style={lbl}>Corretora</label>
                      <input style={inp} value={fC.corretora} onChange={e => setFC(p=>({...p,corretora:e.target.value}))} placeholder="Nome da corretora" />
                    </div>
                    <div>
                      <label style={lbl}>Conhecimento de Transporte Eletrônico (CT-e)</label>
                      <input style={inp} value={fC.cte_numero} onChange={e => setFC(p=>({...p,cte_numero:e.target.value}))} />
                    </div>
                    <div>
                      <label style={lbl}>Terceiro</label>
                      <select style={{ ...inp, color: fC.terceiro ? "#1a1a1a" : "#888" }}
                        value={fC.terceiro} onChange={e => setFC(p=>({...p,terceiro:e.target.value}))}>
                        <option value="">— selecione (opcional) —</option>
                        {pessoas.map(p => <option key={p.id} value={p.nome}>{p.nome}{p.cpf_cnpj ? ` — ${p.cpf_cnpj}` : ""}</option>)}
                      </select>
                    </div>
                    <div>
                      <label style={lbl}>Depósito de Carregamento</label>
                      <select style={{ ...inp, color: fC.deposito_carregamento ? "#1a1a1a" : "#888" }}
                        value={fC.deposito_carregamento}
                        onChange={e => setFC(p=>({...p, deposito_carregamento: e.target.value}))}>
                        {depositos.length === 0
                          ? <option value="">Cadastre depósitos em Cadastros → Depósitos</option>
                          : <>
                              <option value="">— selecione o depósito —</option>
                              {depositos.map(d => (
                                <option key={d.id} value={d.nome}>
                                  {d.nome}{d.tipo ? ` (${d.tipo})` : ""}
                                </option>
                              ))}
                            </>
                        }
                      </select>
                    </div>
                    <div style={{ display:"flex", alignItems:"center", gap:8, paddingTop:18 }}>
                      <label style={{ display:"flex", alignItems:"center", gap:6, cursor:"pointer", fontSize:12 }}>
                        <input type="checkbox" checked={fC.deposito_fiscal} onChange={e => setFC(p=>({...p,deposito_fiscal:e.target.checked}))} /> Depósito Fiscal
                      </label>
                    </div>
                    <div style={{ gridColumn:"1/-1" }}>
                      <label style={lbl}>Obs.</label>
                      <textarea style={{ ...inp, height:56, resize:"vertical" }} value={fC.observacao} onChange={e => setFC(p=>({...p,observacao:e.target.value}))} />
                    </div>
                    <div style={{ gridColumn:"1/-1" }}>
                      <label style={lbl}>Obs. Contrato <span style={{ color:"#888" }}>(não constam nas notas fiscais)</span></label>
                      <textarea style={{ ...inp, height:56, resize:"vertical" }} value={fC.observacao_interna} onChange={e => setFC(p=>({...p,observacao_interna:e.target.value}))} />
                    </div>
                  </div>

                  {/* ── Cessão ─────────────────────────────────────── */}
                  <div style={{ borderTop:"0.5px solid #D4DCE8", paddingTop:14, marginTop:4 }}>
                    <div style={{ fontSize:11, fontWeight:700, color:"#555", textTransform:"uppercase", letterSpacing:"0.06em", marginBottom:10 }}>Cessão de Recebível</div>
                    <label style={{ display:"flex", alignItems:"center", gap:8, cursor:"pointer", marginBottom:fC.dado_em_cessao?14:0 }}>
                      <input
                        type="checkbox"
                        checked={fC.dado_em_cessao}
                        onChange={e => setFC(p=>({...p, dado_em_cessao:e.target.checked, cessao_fornecedor_id:"", cessao_fornecedor_nome:""}))}
                      />
                      <span style={{ fontSize:13, fontWeight:600, color: fC.dado_em_cessao ? "#1A4870" : "#444" }}>Dado em Cessão</span>
                      <span style={{ fontSize:11, color:"#888", fontWeight:400 }}>— o recebível deste contrato será cedido a um fornecedor</span>
                    </label>

                    {fC.dado_em_cessao && (
                      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
                        <div>
                          <label style={lbl}>Fornecedor que recebe a cessão *</label>
                          <select
                            style={{ ...inp, color: fC.cessao_fornecedor_id ? "#1a1a1a" : "#888" }}
                            value={fC.cessao_fornecedor_id}
                            onChange={e => {
                              const nome = pessoas.find(p=>p.id===e.target.value)?.nome ?? "";
                              setFC(p=>({...p, cessao_fornecedor_id:e.target.value, cessao_fornecedor_nome:nome}));
                            }}
                          >
                            <option value="">— selecione o fornecedor —</option>
                            {pessoas.map(p => <option key={p.id} value={p.id}>{p.nome}{p.cpf_cnpj ? ` — ${p.cpf_cnpj}` : ""}</option>)}
                          </select>
                        </div>
                        <div>
                          <label style={lbl}>Data da Cessão</label>
                          <input type="date" style={inp} value={fC.cessao_data} onChange={e => setFC(p=>({...p,cessao_data:e.target.value}))} />
                        </div>
                        <div style={{ gridColumn:"1/-1" }}>
                          <label style={lbl}>Observação da Cessão</label>
                          <input style={inp} value={fC.cessao_obs} onChange={e => setFC(p=>({...p,cessao_obs:e.target.value}))} placeholder="Ex: quitação barter safra 25/26..." />
                        </div>
                        <div style={{ gridColumn:"1/-1", display:"flex", alignItems:"center", justifyContent:"space-between" }}>
                          <div>
                            <span style={{ fontSize:12, color:"#555" }}>
                              Débitos vinculados: <strong>{Object.keys(cessaoSelecionados).length}</strong>
                              {Object.keys(cessaoSelecionados).length > 0 && (
                                <span style={{ marginLeft:8, color:"#1A4870" }}>
                                  Total: R$ {Object.values(cessaoSelecionados).reduce((a,b)=>a+b,0).toLocaleString("pt-BR",{minimumFractionDigits:2})}
                                </span>
                              )}
                            </span>
                          </div>
                          <button
                            type="button"
                            disabled={!fC.cessao_fornecedor_id}
                            onClick={abrirModalCessao}
                            style={{
                              padding:"6px 14px", border:"0.5px solid #1A4870", borderRadius:7,
                              background: fC.cessao_fornecedor_id ? "#EBF5FF" : "#F4F6FA",
                              color: fC.cessao_fornecedor_id ? "#1A4870" : "#aaa",
                              fontSize:12, fontWeight:600, cursor: fC.cessao_fornecedor_id ? "pointer" : "not-allowed",
                            }}
                          >
                            Vincular Débitos CP →
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>

            {/* Rodapé do modal */}
            <div style={{ padding:"12px 20px", borderTop:"0.5px solid #D4DCE8", display:"flex", justifyContent:"space-between", alignItems:"center", background:"#F8FAFD" }}>
              <div style={{ fontSize:11, color:"#555" }}>
                {(() => {
                  const fv = (v: number) => v.toLocaleString("pt-BR", { style:"currency", currency: fC.moeda === "USD" ? "USD" : "BRL" });
                  return <>Valor Financeiro: <strong>{fv(valorFinanceiro)}</strong><span style={{ marginLeft:20 }}>Valor Total: <strong style={{ color:"#1A4870" }}>{fv(valorTotal)}</strong></span></>;
                })()}
              </div>
              <div style={{ display:"flex", gap:8 }}>
                <button style={btnR} onClick={() => setModalContrato(false)}>Cancelar</button>
                <button style={{ ...btnV, opacity: salvando||!fC.data_entrega?0.5:1 }} disabled={salvando||!fC.data_entrega} onClick={salvarContrato}>
                  {salvando ? "Salvando…" : editContrato ? "Salvar Alterações" : "Salvar Contrato"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ══ MODAL ROMANEIO ══════════════════════════════════════ */}
      {modalRomaneio && (
        <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.50)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:120 }}
          onClick={e => { if (e.target===e.currentTarget) setModalRomaneio(false); }}>
          <div style={{ background:"#fff", borderRadius:14, padding:26, width:780, maxWidth:"97vw", maxHeight:"95vh", overflowY:"auto" }}>
            <div style={{ fontWeight:600, fontSize:15, color:"#1a1a1a", marginBottom:2 }}>Novo Romaneio de Expedição</div>
            <div style={{ fontSize:12, color:"#555", marginBottom:16 }}>Pesagem + Classificação do grão. NF-e gerada automaticamente.</div>

            {/* Contrato */}
            <div style={{ marginBottom:12 }}>
              <label style={lbl}>Contrato *</label>
              <select style={{ ...inp, fontSize:13 }} value={fRom.contratoId} onChange={e => setFRom(p=>({...p,contratoId:e.target.value}))}>
                <option value="">— selecione —</option>
                {contratos.filter(c=>c.status!=="encerrado"&&c.status!=="cancelado").map(c => (
                  <option key={c.id} value={c.id}>{c.numero} · {(c.comprador||"").split(" ")[0]} · {c.produto} · saldo {((c.quantidade_sc??0)-(c.entregue_sc??0)).toLocaleString("pt-BR")} sc</option>
                ))}
              </select>
            </div>
            {contratoSel && (
              <div style={{ background:"#D5E8F5", borderRadius:8, padding:"8px 14px", fontSize:11, display:"flex", gap:20, flexWrap:"wrap", marginBottom:14 }}>
                <span>Comprador: <strong>{contratoSel.comprador.split(" ").slice(0,2).join(" ")}</strong></span>
                <span>Produto: <strong>{produto_rom}</strong></span>
                {contratoSel.modalidade==="fixo" && <span>Preço: <strong>{fmtR$(contratoSel.preco??0)}/sc</strong></span>}
                <span>Saldo: <strong>{((contratoSel.quantidade_sc??0)-(contratoSel.entregue_sc??0)).toLocaleString("pt-BR")} sc</strong></span>
              </div>
            )}

            {/* Pesagem */}
            <BalancaSerial
              onCapturarBruto={kg => setFRom(p => ({ ...p, pesoBruto: String(Math.round(kg)) }))}
              onCapturarTara={kg  => setFRom(p => ({ ...p, tara:      String(Math.round(kg)) }))}
            />
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:12, marginBottom:14 }}>
              <div>
                <label style={lbl}>Placa do caminhão *</label>
                <input style={{ ...inp, textTransform:"uppercase" }} placeholder="ABC-1D23" value={fRom.placa} onChange={e => setFRom(p=>({...p,placa:e.target.value}))} />
              </div>
              <div>
                <label style={lbl}>Peso bruto (kg) *</label>
                <InputNumerico style={inp} decimais={0} placeholder="43800" value={fRom.pesoBruto} onChange={v => setFRom(p=>({...p,pesoBruto:v}))} />
              </div>
              <div>
                <label style={lbl}>Tara — caminhão vazio (kg) *</label>
                <InputNumerico style={inp} decimais={0} placeholder="17200" value={fRom.tara} onChange={v => setFRom(p=>({...p,tara:v}))} />
              </div>
            </div>

            {/* Classificação */}
            {plCalc > 0 && (
              <>
                {/* ── Cabeçalho da seção de classificação ── */}
                <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", borderBottom:"0.5px solid #D4DCE8", paddingBottom:6, marginBottom:12 }}>
                  <div>
                    <span style={{ fontSize:12, fontWeight:600, color:"#555" }}>Classificação do Grão</span>
                    <span style={{ marginLeft:10, fontSize:10, fontWeight:400, color:"#888" }}>
                      Padrão {produto_rom}: Umidade {clsComm.umidade_padrao}% · Impureza {clsComm.impureza_padrao}% · Avariados {clsComm.avariados_padrao}%
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setFRom(p => ({
                      ...p,
                      umidade:          String(clsComm.umidade_padrao),
                      impureza:         String(clsComm.impureza_padrao),
                      ardidos:          "0",
                      mofados:          "0",
                      fermentados:      "0",
                      germinados:       "0",
                      esverdeados:      "0",
                      quebrados:        "0",
                      carunchados:      "0",
                      outros_avariados: "0",
                    }))}
                    style={{ fontSize:11, fontWeight:600, color:"#1A4870", background:"#D5E8F5", border:"0.5px solid #A8C8E8", borderRadius:6, padding:"4px 10px", cursor:"pointer", whiteSpace:"nowrap" }}
                  >
                    ✦ Class. Padrão
                  </button>
                </div>

                {/* ── Umidade + Impureza + PH ── */}
                <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:12, marginBottom:12 }}>
                  <div>
                    <label style={lbl}>Umidade (%)</label>
                    <InputNumerico style={inp} min="0" max="40" placeholder={String(clsComm.umidade_padrao)}
                      value={fRom.umidade} onChange={v => setFRom(p=>({...p,umidade:v}))} />
                    {descUmid > 0 && <div style={{ fontSize:10, color:"#E24B4A", marginTop:2 }}>Desconto: {fmtPeso(descUmid)}</div>}
                    {romUmidade > 0 && romUmidade <= clsComm.umidade_padrao && <div style={{ fontSize:10, color:"#16A34A", marginTop:2 }}>Dentro do padrão ✓</div>}
                  </div>
                  <div>
                    <label style={lbl}>Impureza / Matérias Estranhas (%)</label>
                    <InputNumerico style={inp} min="0" max="20" placeholder={String(clsComm.impureza_padrao)}
                      value={fRom.impureza} onChange={v => setFRom(p=>({...p,impureza:v}))} />
                    {descImpur > 0 && <div style={{ fontSize:10, color:"#E24B4A", marginTop:2 }}>Desconto: {fmtPeso(descImpur)}</div>}
                    {romImpureza > 0 && romImpureza <= clsComm.impureza_padrao && <div style={{ fontSize:10, color:"#16A34A", marginTop:2 }}>Dentro do padrão ✓</div>}
                  </div>
                  <div>
                    <label style={lbl}>PH — Peso Hectolítrico (kg/hl)</label>
                    <InputNumerico style={inp} min="50" max="100" placeholder={isSoja ? "78" : isMilho ? "74" : "—"}
                      value={fRom.ph} onChange={v => setFRom(p=>({...p,ph:v}))} />
                    {fRom.ph && <div style={{ fontSize:10, color: parseFloat(fRom.ph) >= (isSoja?78:74) ? "#16A34A" : "#E24B4A", marginTop:2 }}>
                      {parseFloat(fRom.ph) >= (isSoja?78:74) ? "Dentro do padrão ✓" : "Abaixo do mínimo ↓"}
                    </div>}
                  </div>
                </div>

                {/* ── Avariados — detalhamento por commodity ── */}
                <div style={{ background:"#F8F9FC", border:"0.5px solid #DDE2EE", borderRadius:10, padding:"12px 14px", marginBottom:12 }}>
                  <div style={{ fontSize:11, fontWeight:600, color:"#555", marginBottom:10, display:"flex", alignItems:"center", justifyContent:"space-between" }}>
                    <span>Avariados — detalhamento{isSoja ? " (ABIOVE / IN MAPA 11/2007)" : isMilho ? " (IN MAPA 60/2011)" : ""}</span>
                    {romAvariados > 0 && (
                      <span style={{ fontSize:11, fontWeight:700, color: romAvariados > clsComm.avariados_padrao ? "#E24B4A" : "#16A34A" }}>
                        Total: {romAvariados.toFixed(2)}%
                        {romAvariados > clsComm.avariados_padrao ? ` (desc: ${fmtPeso(descAvar)})` : " ✓"}
                      </span>
                    )}
                  </div>
                  {(isSoja || !isMilho) ? (
                    /* Soja — 7 sub-parâmetros */
                    <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:10 }}>
                      {([
                        { key:"ardidos",         label:"Ardidos / Queimados (%)" },
                        { key:"mofados",         label:"Mofados (%)" },
                        { key:"fermentados",     label:"Fermentados (%)" },
                        { key:"germinados",      label:"Germinados (%)" },
                        { key:"esverdeados",     label:"Esverdeados / Imaturos (%)" },
                        { key:"quebrados",       label:"Quebrados / Amassados (%)" },
                        { key:"outros_avariados",label:"Outros Avariados (%)" },
                      ] as {key: keyof typeof fRom; label: string}[]).map(({ key, label }) => (
                        <div key={key}>
                          <label style={{ fontSize:10, color:"#555", marginBottom:3, display:"block" }}>{label}</label>
                          <InputNumerico style={{ ...inp, fontSize:12, padding:"5px 8px" }} min="0" max="100"
                            value={fRom[key] as string} onChange={v => setFRom(p=>({...p,[key]:v}))} />
                        </div>
                      ))}
                    </div>
                  ) : (
                    /* Milho — 6 sub-parâmetros */
                    <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:10 }}>
                      {([
                        { key:"ardidos",          label:"Ardidos e Brotados (%)" },
                        { key:"mofados",          label:"Mofados (%)" },
                        { key:"fermentados",      label:"Fermentados (%)" },
                        { key:"carunchados",      label:"Carunchados / Atacados por Insetos (%)" },
                        { key:"quebrados",        label:"Quebrados e Abaulados (%)" },
                        { key:"outros_avariados", label:"Outros Avariados (%)" },
                      ] as {key: keyof typeof fRom; label: string}[]).map(({ key, label }) => (
                        <div key={key}>
                          <label style={{ fontSize:10, color:"#555", marginBottom:3, display:"block" }}>{label}</label>
                          <InputNumerico style={{ ...inp, fontSize:12, padding:"5px 8px" }} min="0" max="100"
                            value={fRom[key] as string} onChange={v => setFRom(p=>({...p,[key]:v}))} />
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* ── Apuração ── */}
                <div style={{ background: temClassif&&(descUmid+descImpur+descAvar)>0 ? "#FFF3E0" : "#D5E8F5", borderRadius:8, padding:"12px 14px", marginBottom:12 }}>
                  <div style={{ fontSize:11, fontWeight:600, color:"#0B2D50", marginBottom:8 }}>Apuração — Balança de Saída (Fazenda)</div>
                  <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:8 }}>
                    <div style={{ textAlign:"center" }}>
                      <div style={{ fontSize:10, color:"#555" }}>Peso Líquido</div>
                      <div style={{ fontSize:13, fontWeight:600, color:"#1a1a1a" }}>{fmtPeso(plCalc)}</div>
                    </div>
                    {temClassif && (
                      <div style={{ textAlign:"center" }}>
                        <div style={{ fontSize:10, color:"#555" }}>Descontos (U+I+A)</div>
                        <div style={{ fontSize:13, fontWeight:600, color:"#E24B4A" }}>−{fmtPeso(descUmid+descImpur+descAvar)}</div>
                      </div>
                    )}
                    <div style={{ textAlign:"center" }}>
                      <div style={{ fontSize:10, color:"#555" }}>Peso Classificado</div>
                      <div style={{ fontSize:13, fontWeight:600, color:"#0B2D50" }}>{fmtPeso(temClassif?pesoClass:plCalc)}</div>
                    </div>
                    <div style={{ textAlign:"center" }}>
                      <div style={{ fontSize:10, color:"#555" }}>Sacas ({clsComm.kg_saca} kg)</div>
                      <div style={{ fontSize:15, fontWeight:600, color:"#1A4870" }}>{sacasCalc.toLocaleString("pt-BR")} sc</div>
                      {contratoSel?.modalidade==="fixo" && (
                        <div style={{ fontSize:10, color:"#555" }}>{fmtR$(sacasCalc*(contratoSel.preco??0))}</div>
                      )}
                    </div>
                  </div>
                  {!temClassif && <div style={{ fontSize:10, color:"#888", marginTop:6 }}>Preencha a classificação para calcular descontos e peso líquido faturável.</div>}
                  <div style={{ marginTop:6, fontSize:10, color:"#1A4870" }}>NF-e gerada automaticamente após confirmação</div>
                </div>

                {/* ── Peso Recebido / Faturado pelo Comprador ── */}
                <div style={{ background:"#FBF3E0", border:"0.5px solid #F6C87A", borderRadius:10, padding:"12px 14px", marginBottom:12 }}>
                  <div style={{ fontSize:11, fontWeight:600, color:"#7A5A12", marginBottom:8 }}>
                    Peso Recebido pelo Comprador
                    <span style={{ fontSize:10, fontWeight:400, marginLeft:8, color:"#888" }}>Preencher após receber o ticket de pesagem do destino</span>
                  </div>
                  <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:12 }}>
                    <div>
                      <label style={{ fontSize:10, color:"#555", marginBottom:3, display:"block" }}>Peso Classificado Destino (kg)</label>
                      <InputNumerico style={{ ...inp, fontSize:12 }} decimais={0} placeholder="Ex: 26480"
                        value={fRom.peso_destino} onChange={v => setFRom(p=>({...p,peso_destino:v}))} />
                      {pesoDest > 0 && pesoClass > 0 && (
                        <div style={{ fontSize:10, marginTop:2, color: Math.abs(difKg)/pesoClass > 0.005 ? "#E24B4A" : "#16A34A" }}>
                          {difKg > 0 ? `Diferença: −${fmtPeso(difKg)} (${Math.abs(difKg/pesoClass*100).toFixed(2)}%)` :
                           difKg < 0 ? `Acréscimo: +${fmtPeso(-difKg)} (${Math.abs(difKg/pesoClass*100).toFixed(2)}%)` : "Sem divergência ✓"}
                        </div>
                      )}
                    </div>
                    <div>
                      <label style={{ fontSize:10, color:"#555", marginBottom:3, display:"block" }}>Sacas Faturadas na NF Comprador</label>
                      <InputNumerico style={{ ...inp, fontSize:12 }} decimais={3} placeholder={String(sacasCalc)}
                        value={fRom.sacas_faturadas} onChange={v => setFRom(p=>({...p,sacas_faturadas:v}))} />
                    </div>
                    <div>
                      <label style={{ fontSize:10, color:"#555", marginBottom:3, display:"block" }}>Obs. Divergência</label>
                      <input style={{ ...inp, fontSize:12 }} placeholder="Ex: rejeição por ardidos"
                        value={fRom.obs_divergencia} onChange={e => setFRom(p=>({...p,obs_divergencia:e.target.value}))} />
                    </div>
                  </div>
                </div>
              </>
            )}

            {/* ── Adiantamento disponível ── */}
            {contratoSel && sacasCalc > 0 && adiantSaldo(contratoSel.id) > 0 && (
              <div style={{ background:"#D5E8F5", border:"0.5px solid #1A4870", borderRadius:10, padding:"12px 14px", marginBottom:12 }}>
                <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom: fRom.aplicarAdiant ? 10 : 0 }}>
                  <div style={{ fontSize:11, fontWeight:600, color:"#0B2D50" }}>
                    💰 Adiantamento disponível: <strong>{fmtR$(adiantSaldo(contratoSel.id))}</strong>
                  </div>
                  <label style={{ display:"flex", alignItems:"center", gap:6, cursor:"pointer" }}>
                    <input type="checkbox" checked={fRom.aplicarAdiant}
                      onChange={e => {
                        const on = e.target.checked;
                        const sugestao = on ? String(Math.min(adiantSaldo(contratoSel.id), sacasCalc*(contratoSel.preco??0)).toFixed(2)) : "";
                        setFRom(p => ({ ...p, aplicarAdiant: on, adiantValor: sugestao }));
                      }} />
                    <span style={{ fontSize:12, color:"#0B2D50", fontWeight:600 }}>Aplicar nesta entrega</span>
                  </label>
                </div>
                {fRom.aplicarAdiant && (
                  <div>
                    <label style={{ ...lbl, color:"#0B2D50" }}>Valor a abater (R$) — máx. {fmtR$(Math.min(adiantSaldo(contratoSel.id), sacasCalc*(contratoSel.preco??0)))}</label>
                    <InputNumerico style={{ ...inp, borderColor:"#1A4870" }} min="0"
                      max={Math.min(adiantSaldo(contratoSel.id), sacasCalc*(contratoSel.preco??0))}
                      value={fRom.adiantValor}
                      onChange={v => setFRom(p => ({ ...p, adiantValor: v }))} />
                    {fRom.adiantValor && (() => {
                      const vBruto = sacasCalc * (contratoSel.preco ?? 0);
                      const vAbate = Math.min(parseFloat(fRom.adiantValor||"0"), vBruto, adiantSaldo(contratoSel.id));
                      const vCR    = Math.max(0, vBruto - vAbate);
                      return (
                        <div style={{ marginTop:6, fontSize:11, color:"#0B2D50", display:"flex", gap:16, flexWrap:"wrap" }}>
                          <span>Valor bruto: <strong>{fmtR$(vBruto)}</strong></span>
                          <span>Abate: <strong style={{ color:"#E24B4A" }}>−{fmtR$(vAbate)}</strong></span>
                          <span>CR a lançar: <strong style={{ color:"#16A34A" }}>{fmtR$(vCR)}</strong></span>
                        </div>
                      );
                    })()}
                  </div>
                )}
              </div>
            )}

            <div style={{ display:"flex", gap:8, justifyContent:"flex-end", marginTop:8 }}>
              <button style={btnR} onClick={() => { setModalRomaneio(false); setFRom(ROM_VAZIO()); }}>Cancelar</button>
              <button onClick={gerarRomaneio} disabled={salvando||!contratoSel||!fRom.placa||plCalc<=0}
                style={{ ...btnV, opacity: salvando||!contratoSel||!fRom.placa||plCalc<=0?0.5:1 }}>
                {salvando ? "Salvando…" : "Confirmar Pesagem"}
              </button>
            </div>
          </div>
        </div>
      )}
      {/* ── Modal Cessão: Vincular Débitos ── */}
      {modalCessao && (
        <div style={{ position:"fixed", inset:0, background:"rgba(11,45,80,0.32)", zIndex:2000, display:"flex", alignItems:"center", justifyContent:"center", padding:20 }}>
          <div style={{ background:"#fff", borderRadius:14, width:"100%", maxWidth:640, maxHeight:"85vh", display:"flex", flexDirection:"column", boxShadow:"0 4px 20px rgba(11,45,80,0.10)" }}>
            <div style={{ padding:"20px 24px 16px", borderBottom:"0.5px solid #D4DCE8" }}>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start" }}>
                <div>
                  <h2 style={{ margin:0, fontSize:16, fontWeight:700 }}>Vincular Débitos à Cessão</h2>
                  <p style={{ margin:"4px 0 0", fontSize:12, color:"#666" }}>
                    Selecione as Contas a Pagar do fornecedor <strong>{fC.cessao_fornecedor_nome}</strong> que serão quitadas por este contrato.
                  </p>
                </div>
                <button onClick={() => setModalCessao(false)} style={{ background:"none", border:"none", fontSize:20, cursor:"pointer", color:"#888" }}>×</button>
              </div>
              <div style={{ display:"flex", gap:16, marginTop:10, fontSize:12 }}>
                <span>Valor do Contrato: <strong style={{ color:"#1A4870" }}>R$ {valorFinanceiro.toLocaleString("pt-BR",{minimumFractionDigits:2})}</strong></span>
                <span>Total Cedido: <strong style={{ color: Object.values(cessaoSelecionados).reduce((a,b)=>a+b,0) > valorFinanceiro ? "#E24B4A" : "#16A34A" }}>R$ {Object.values(cessaoSelecionados).reduce((a,b)=>a+b,0).toLocaleString("pt-BR",{minimumFractionDigits:2})}</strong></span>
              </div>
            </div>

            <div style={{ flex:1, overflowY:"auto", padding:"0 24px" }}>
              {cessaoLancs.length === 0 ? (
                <div style={{ textAlign:"center", padding:"40px 0", color:"#888", fontSize:13 }}>
                  Nenhum CP em aberto encontrado para este fornecedor.<br />
                  <span style={{ fontSize:11 }}>Verifique se o fornecedor está vinculado aos lançamentos em CP.</span>
                </div>
              ) : (
                <table style={{ width:"100%", borderCollapse:"collapse", fontSize:12 }}>
                  <thead>
                    <tr style={{ borderBottom:"0.5px solid #D4DCE8", color:"#666", textAlign:"left" }}>
                      <th style={{ padding:"10px 8px 8px" }}>✓</th>
                      <th style={{ padding:"10px 8px 8px" }}>Descrição</th>
                      <th style={{ padding:"10px 8px 8px", textAlign:"right" }}>Vencimento</th>
                      <th style={{ padding:"10px 8px 8px", textAlign:"right" }}>Valor Total</th>
                      <th style={{ padding:"10px 8px 8px", textAlign:"right" }}>Valor Cessão</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cessaoLancs.map(l => {
                      const sel = l.id in cessaoSelecionados;
                      const valCessao = cessaoSelecionados[l.id] ?? l.valor;
                      return (
                        <tr key={l.id} style={{ borderBottom:"0.5px solid #EEF1F6", background: sel ? "#EBF5FF" : "transparent" }}>
                          <td style={{ padding:"8px" }}>
                            <input type="checkbox" checked={sel}
                              onChange={e => {
                                if (e.target.checked) setCessaoSelecionados(p => ({ ...p, [l.id]: l.valor }));
                                else setCessaoSelecionados(p => { const n={...p}; delete n[l.id]; return n; });
                              }} />
                          </td>
                          <td style={{ padding:"8px", color:"#1a1a1a" }}>{l.descricao}</td>
                          <td style={{ padding:"8px", textAlign:"right", color:"#666" }}>
                            {l.data_vencimento ? l.data_vencimento.split("T")[0].split("-").reverse().join("/") : "—"}
                          </td>
                          <td style={{ padding:"8px", textAlign:"right", fontWeight:600, color:"#1a1a1a" }}>
                            R$ {l.valor.toLocaleString("pt-BR",{minimumFractionDigits:2})}
                          </td>
                          <td style={{ padding:"8px" }}>
                            {sel ? (
                              <InputMonetario min="0" max={l.valor}
                                value={valCessao}
                                onChange={v => setCessaoSelecionados(p => ({ ...p, [l.id]: v }))}
                                style={{ ...inp, textAlign:"right", width:110, padding:"4px 6px" }}
                              />
                            ) : (
                              <span style={{ color:"#ccc" }}>—</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>

            <div style={{ padding:"16px 24px", borderTop:"0.5px solid #D4DCE8", display:"flex", justifyContent:"flex-end", gap:10 }}>
              <button style={btnR} onClick={() => setModalCessao(false)}>Fechar</button>
              <button style={btnV} onClick={() => setModalCessao(false)}>Confirmar Vínculos</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal Encerramento em Lote ─────────────────────────────────────── */}
      {modalLote && (
        <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.45)", zIndex:1000, display:"flex", alignItems:"center", justifyContent:"center" }}>
          <div style={{ background:"#fff", borderRadius:14, width:680, maxWidth:"96vw", maxHeight:"90vh", display:"flex", flexDirection:"column", boxShadow:"0 4px 20px rgba(11,45,80,0.10)" }}>

            {/* cabeçalho */}
            <div style={{ padding:"18px 24px 14px", borderBottom:"0.5px solid #D4DCE8", display:"flex", justifyContent:"space-between", alignItems:"flex-start" }}>
              <div>
                <div style={{ fontWeight:700, fontSize:16, color:"#1a1a1a" }}>⊘ Encerramento em Lote</div>
                <div style={{ fontSize:12, color:"#555", marginTop:3 }}>Selecione as safras e a ação a realizar</div>
              </div>
              <button onClick={() => setModalLote(false)} style={{ background:"none", border:"none", fontSize:18, cursor:"pointer", color:"#888", lineHeight:1 }}>✕</button>
            </div>

            {/* tipo de ação */}
            <div style={{ padding:"14px 24px 0" }}>
              <div style={{ fontSize:12, fontWeight:600, color:"#555", marginBottom:8 }}>AÇÃO</div>
              <div style={{ display:"flex", gap:10 }}>
                {([
                  { id:"contratos" as const, label:"Encerrar contratos", sub:"Marca os contratos abertos como Encerrado. A safra permanece ativa." },
                  { id:"safra"     as const, label:"Encerrar safra completa", sub:"Encerra a safra e bloqueia novos lançamentos. Inclui todos os contratos abertos." },
                ] as { id:"contratos"|"safra"; label:string; sub:string }[]).map(op => (
                  <button key={op.id} onClick={() => setLoteOp(op.id)}
                    style={{ flex:1, textAlign:"left", padding:"12px 14px", borderRadius:10, border: loteOp===op.id ? "2px solid #1A5CB8" : "1.5px solid #D4DCE8", background: loteOp===op.id ? "#D5E8F5" : "#fff", cursor:"pointer" }}>
                    <div style={{ fontWeight:600, fontSize:13, color: loteOp===op.id ? "#0B2D50" : "#1a1a1a" }}>{op.label}</div>
                    <div style={{ fontSize:11, color:"#555", marginTop:3 }}>{op.sub}</div>
                    {op.id === "safra" && loteOp === "safra" && (
                      <div style={{ marginTop:6, fontSize:11, background:"#FFF3CD", color:"#7A5A12", borderRadius:6, padding:"4px 8px", border:"0.5px solid #F0D080" }}>
                        ⚠ Safras encerradas não aceitam novos contratos, romaneios ou operações de lavoura.
                      </div>
                    )}
                  </button>
                ))}
              </div>
            </div>

            {/* lista de safras */}
            <div style={{ padding:"14px 24px", flex:1, overflowY:"auto" }}>
              <div style={{ fontSize:12, fontWeight:600, color:"#555", marginBottom:8 }}>SAFRAS</div>
              <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
                {anosSafra.length === 0 && <div style={{ fontSize:12, color:"#888", padding:10 }}>Nenhuma safra cadastrada.</div>}
                {anosSafra.map(a => {
                  const st = safraStats(a.id);
                  const isEnc = a.status === "encerrada";
                  const sel = loteSafras.has(a.id);
                  return (
                    <div key={a.id}
                      onClick={() => {
                        if (isEnc && loteOp === "safra") return; // já encerrada, skip
                        setLoteSafras(prev => { const s = new Set(prev); sel ? s.delete(a.id) : s.add(a.id); return s; });
                      }}
                      style={{ display:"flex", alignItems:"center", gap:12, padding:"11px 14px", borderRadius:10, border: sel ? "1.5px solid #1A5CB8" : "0.5px solid #D4DCE8", background: sel ? "#EEF5FF" : isEnc ? "#F8F8F8" : "#fff", cursor: isEnc && loteOp==="safra" ? "default" : "pointer", opacity: isEnc && loteOp==="safra" ? 0.65 : 1 }}>
                      <input type="checkbox" checked={sel} readOnly style={{ accentColor:"#1A5CB8", width:16, height:16, flexShrink:0 }} />
                      <div style={{ flex:1 }}>
                        <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                          <span style={{ fontWeight:600, fontSize:13, color:"#1a1a1a" }}>{a.descricao}</span>
                          {isEnc
                            ? <span style={{ fontSize:10, background:"#EEE", color:"#555", borderRadius:5, padding:"2px 7px", fontWeight:700 }}>ENCERRADA</span>
                            : <span style={{ fontSize:10, background:"#D5F5E3", color:"#14532D", borderRadius:5, padding:"2px 7px", fontWeight:700 }}>ATIVA</span>
                          }
                        </div>
                        <div style={{ fontSize:11, color:"#555", marginTop:2 }}>
                          {a.data_inicio} → {a.data_fim} &nbsp;·&nbsp;
                          <span style={{ color: st.abertos > 0 ? "#C9921B" : "#16A34A", fontWeight:600 }}>{st.abertos} aberto(s)</span>
                          &nbsp;·&nbsp; {st.encerrados} encerrado(s) &nbsp;·&nbsp; {st.total} total
                        </div>
                      </div>
                      {isEnc && loteOp === "contratos" && (
                        <button onClick={async e => { e.stopPropagation(); if (!confirm(`Reabrir a safra "${a.descricao}"?`)) return; await reabrirAnoSafra(a.id); setAnosSafra(prev => prev.map(x => x.id === a.id ? { ...x, status: "ativa" as const } : x)); }}
                          style={{ fontSize:11, background:"#fff", color:"#1A4870", border:"0.5px solid #1A4870", borderRadius:6, padding:"4px 10px", cursor:"pointer" }}>
                          ↩ Reabrir
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* resultado */}
            {loteResultado && (
              <div style={{ margin:"0 24px 0", padding:"10px 14px", borderRadius:8, background: loteResultado.startsWith("✓") ? "#D5F5E3" : "#FDECEA", color: loteResultado.startsWith("✓") ? "#14532D" : "#8B1A1A", fontSize:13, fontWeight:600, border: `0.5px solid ${loteResultado.startsWith("✓") ? "#A7F0C2" : "#E24B4A60"}` }}>
                {loteResultado}
              </div>
            )}

            {/* footer */}
            <div style={{ padding:"14px 24px", borderTop:"0.5px solid #D4DCE8", display:"flex", justifyContent:"space-between", alignItems:"center", gap:10 }}>
              <div style={{ fontSize:12, color:"#555" }}>
                {loteSafras.size > 0
                  ? `${loteSafras.size} safra(s) selecionada(s) · ${[...loteSafras].reduce((s,id) => s + safraStats(id).abertos, 0)} contratos abertos`
                  : "Nenhuma safra selecionada"}
              </div>
              <div style={{ display:"flex", gap:10 }}>
                <button onClick={() => setModalLote(false)}
                  style={{ background:"#fff", color:"#555", border:"0.5px solid #CCC", borderRadius:8, padding:"9px 16px", fontSize:13, cursor:"pointer" }}>
                  Fechar
                </button>
                <button onClick={executarLote} disabled={loteSafras.size === 0 || loteSalvando}
                  style={{ background: loteSalvando||loteSafras.size===0 ? "#ccc" : loteOp==="safra" ? "#E24B4A" : "#1A5CB8", color:"#fff", border:"none", borderRadius:8, padding:"9px 18px", fontSize:13, fontWeight:600, cursor: loteSafras.size===0||loteSalvando ? "default" : "pointer" }}>
                  {loteSalvando ? "Processando…" : loteOp==="safra" ? "⊘ Encerrar Safras Selecionadas" : "⊘ Encerrar Contratos Selecionados"}
                </button>
              </div>
            </div>

          </div>
        </div>
      )}
      {/* ── Modal: Registrar Adiantamento ── */}
      {modalAdiant && (
        <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.50)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:300 }}
          onClick={e => { if (e.target===e.currentTarget) setModalAdiant(false); }}>
          <div style={{ background:"#fff", borderRadius:14, padding:28, width:500, maxWidth:"96vw" }}>
            <div style={{ fontWeight:700, fontSize:15, color:"#1a1a1a", marginBottom:4 }}>Registrar Adiantamento de Cliente</div>
            <div style={{ fontSize:12, color:"#666", marginBottom:18 }}>
              Um CR com status <strong>Liquidado</strong> é gerado automaticamente — o dinheiro já foi recebido.
              O saldo fica disponível para abater no próximo romaneio.
            </div>

            {/* Contrato */}
            <div style={{ marginBottom:12 }}>
              <label style={lbl}>Contrato *</label>
              <select style={inp} value={adiantContratoId} onChange={e => setAdiantContratoId(e.target.value)}>
                <option value="">— selecione —</option>
                {contratos.filter(c=>c.status!=="encerrado"&&c.status!=="cancelado").map(c => (
                  <option key={c.id} value={c.id}>{c.numero} · {c.comprador.split(" ").slice(0,3).join(" ")} · {c.produto}</option>
                ))}
              </select>
            </div>

            {/* Data + Valor */}
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12, marginBottom:12 }}>
              <div>
                <label style={lbl}>Data do recebimento *</label>
                <input style={inp} type="date" value={fAdiant.data} onChange={e => setFAdiant(p=>({...p,data:e.target.value}))} />
              </div>
              <div>
                <label style={lbl}>Valor recebido (R$) *</label>
                <InputNumerico style={inp} min="0" placeholder="0,00"
                  value={fAdiant.valor} onChange={v => setFAdiant(p=>({...p,valor:v}))} />
              </div>
            </div>

            {/* Descrição */}
            <div style={{ marginBottom:16 }}>
              <label style={lbl}>Observação</label>
              <input style={inp} placeholder="Ex: 30% antecipado via TED, conforme contrato"
                value={fAdiant.descricao} onChange={e => setFAdiant(p=>({...p,descricao:e.target.value}))} />
            </div>

            {/* Preview */}
            {fAdiant.valor && parseFloat(fAdiant.valor) > 0 && (
              <div style={{ background:"#D5E8F5", border:"0.5px solid #1A4870", borderRadius:8, padding:"10px 14px", marginBottom:16, fontSize:12, color:"#0B2D50" }}>
                💡 Será gerado CR de <strong>{fmtR$(parseFloat(fAdiant.valor))}</strong> como <strong>Liquidado</strong> em Contas a Receber.
                O saldo ficará disponível para abatimento no próximo romaneio de expedição deste contrato.
              </div>
            )}

            <div style={{ display:"flex", gap:8, justifyContent:"flex-end" }}>
              <button style={btnR} onClick={() => setModalAdiant(false)}>Cancelar</button>
              <button onClick={registrarAdiantamento}
                disabled={salvandoAdiant || !adiantContratoId || !fAdiant.valor || parseFloat(fAdiant.valor||"0") <= 0}
                style={{ ...btnV, opacity: salvandoAdiant||!adiantContratoId||!fAdiant.valor||parseFloat(fAdiant.valor||"0")<=0?0.5:1 }}>
                {salvandoAdiant ? "Salvando…" : "Registrar Adiantamento"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
