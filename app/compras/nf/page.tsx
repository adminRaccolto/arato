"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import TopNav from "../../../components/TopNav";
import {
  listarNfEntradas, listarNfEntradasPorFazendas, criarNfEntrada, atualizarNfEntrada,
  listarNfEntradaItens, criarNfEntradaItem,
  processarNfEntrada,
  processarDevolucaoCompra,
  listarInsumos,
  criarInsumo,
  listarDepositos,
  listarDepositosMulti,
  listarPessoasDaConta,
  criarPessoa,
  listarIEsDoProdutor,
  listarCentrosCustoGeral,
  listarCentrosCustoGeralDaConta,
  listarRegrasClassificacao,
  aplicarRegraClassificacao,
  listarOperacoesGerenciaisAtivas,
  verificarExclusaoNf,
  excluirNfEntrada,
  listarMaquinas,
  listarBombas,
  resolverNomeComercial,
  listarAnosSafra,
  listarCiclos,
} from "../../../lib/db";
import type { ItemDevolucao } from "../../../lib/db";
import { useAuth } from "../../../components/AuthProvider";
import type { NfEntrada, NfEntradaItem, Insumo, Deposito, BombaCombustivel, Pessoa, CentroCusto, RegraClassificacao, OperacaoGerencial, Maquina, AnoSafra, Ciclo, ProdutorIE } from "../../../lib/supabase";
import { supabase } from "../../../lib/supabase";
import InputMonetario from "../../../components/InputMonetario";
import InputNumerico from "../../../components/InputNumerico";
import PlanoGate from "../../../components/PlanoGate";
import SelectBusca from "../../../components/SelectBusca";

// ─────────────────────────────────────────────────────────────
// Estilos base
// ─────────────────────────────────────────────────────────────
const inp: React.CSSProperties = { width: "100%", padding: "8px 10px", border: "0.5px solid var(--border-table)", borderRadius: 8, fontSize: 13, color: "var(--text-1)", background: "var(--bg-input)", boxSizing: "border-box", outline: "none" };
const lbl: React.CSSProperties = { fontSize: 11, color: "var(--text-2)", marginBottom: 4, display: "block" };
const btnV: React.CSSProperties = { padding: "8px 20px", background: "#1A5C38", color: "#fff", border: "none", borderRadius: 8, fontWeight: 600, cursor: "pointer", fontSize: 13 };
const btnR: React.CSSProperties = { padding: "8px 18px", border: "0.5px solid var(--border-table)", borderRadius: 8, background: "transparent", cursor: "pointer", fontSize: 13, color: "var(--text-1)" };
const card: React.CSSProperties = { background: "var(--bg-card)", borderRadius: 12, border: "0.5px solid var(--border-table)", padding: "18px 20px", marginBottom: 16 };

const fmtBRL = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fmtData = (s?: string) => s ? new Date(s + "T12:00:00").toLocaleDateString("pt-BR") : "—";

const CFOP_NATUREZA: Record<string, string> = {
  "1101": "Compra para industrialização",
  "1102": "Compra para comercialização",
  "1113": "Compra de material para uso ou consumo",
  "1116": "Compra para industrialização originada de encomenda",
  "1201": "Devolução de venda de produção do estabelecimento",
  "1202": "Devolução de venda de mercadoria adquirida ou recebida de terceiros",
  "1551": "Compra de bem para o ativo imobilizado",
  "1556": "Compra de bem para o ativo imobilizado",
  "1652": "Compra de combustível e lubrificantes por consumidor ou usuário final",
  "1653": "Compra de combustível e lubrificantes para uso em processo de industrialização",
  "1654": "Compra de combustível para uso em transporte rodoviário de carga",
  "2101": "Compra para industrialização",
  "2102": "Compra para comercialização",
  "2113": "Compra de material para uso ou consumo",
  "2116": "Compra para industrialização originada de encomenda",
  "2551": "Compra de bem para o ativo imobilizado",
  "2556": "Compra de bem para o ativo imobilizado",
  "2652": "Compra de combustível e lubrificantes por consumidor ou usuário final",
  "2653": "Compra de combustível e lubrificantes para uso em processo de industrialização",
  "3101": "Compra para industrialização",
  "3102": "Compra para comercialização",
  "5101": "Venda de produção do estabelecimento",
  "5102": "Venda de mercadoria adquirida ou recebida de terceiros",
  "6101": "Venda de produção do estabelecimento",
  "6102": "Venda de mercadoria adquirida ou recebida de terceiros",
};

function badge(texto: string, bg = "#E8E8E8", color = "#0D0D0D") {
  return <span style={{ fontSize: 10, background: bg, color, padding: "2px 7px", borderRadius: 8, fontWeight: 600, whiteSpace: "nowrap" }}>{texto}</span>;
}

const STATUS_META: Record<string, { bg: string; cl: string; label: string }> = {
  digitando:  { bg: "#FFF3E0", cl: "#7B4A00", label: "Digitando"  },
  pendente:   { bg: "#FBF3E0", cl: "#C9921B", label: "Pendente"   },
  processada: { bg: "#E8F5E9", cl: "#1A6B3C", label: "Processada" },
  cancelada:  { bg: "#FCEBEB", cl: "#791F1F", label: "Cancelada"  },
};
const TIPO_META: Record<string, { bg: string; cl: string; label: string }> = {
  consumo:          { bg: "#F3E8FF", cl: "#6B21A8", label: "Consumo"      },
  insumos:          { bg: "#E8E8E8", cl: "#0D0D0D", label: "Insumos"      },
  combustivel:      { bg: "#FFF0E0", cl: "#7C3A00", label: "Combustível"  },
  pecas:            { bg: "#E0F0FF", cl: "#0A4B8C", label: "Peças / Manut." },
  custo_direto:     { bg: "#E8F5E9", cl: "#1A6B3C", label: "Aprop. Direta" },
  vef:              { bg: "#FAEEDA", cl: "#633806", label: "VEF"           },
  remessa:          { bg: "#E6F1FB", cl: "#0C447C", label: "Remessa"       },
  devolucao_compra: { bg: "#FCEBEB", cl: "#791F1F", label: "Devolução"     },
};
const ORIGEM_META: Record<string, { label: string }> = {
  manual: { label: "Manual"  },
  xml:    { label: "XML"     },
  sieg:   { label: "Sieg"    },
};

const MAN_CFG = [
  { tipo: 0, label: "Ciência",       cor: "#444444", bg: "#F2F2F2", status: "ciencia",        justObrig: false },
  { tipo: 1, label: "Confirmar",     cor: "#16A34A", bg: "#DCFCE7", status: "confirmada",      justObrig: false },
  { tipo: 2, label: "Desconhecer",   cor: "#C9921B", bg: "#FBF3E0", status: "desconhecimento", justObrig: true  },
  { tipo: 3, label: "Não Realizada", cor: "#E24B4A", bg: "#FFF0F0", status: "nao_realizada",   justObrig: true  },
] as const;
type ManStatus = "pendente"|"ciencia"|"confirmada"|"desconhecimento"|"nao_realizada";
const MAN_ST: Record<ManStatus, { label: string; short: string; cor: string; bg: string }> = {
  pendente:        { label: "Pendente",        short: "Pend.", cor: "var(--text-3)",    bg: "#F3F4F6" },
  ciencia:         { label: "Ciência",         short: "Ci.",   cor: "#444444", bg: "#F2F2F2" },
  confirmada:      { label: "Confirmada",      short: "Conf.", cor: "#16A34A", bg: "#DCFCE7" },
  desconhecimento: { label: "Desconhecimento", short: "Desc.", cor: "#C9921B", bg: "#FBF3E0" },
  nao_realizada:   { label: "Não Realizada",   short: "N.R.",  cor: "#E24B4A", bg: "#FFF0F0" },
};
const fmtDoc = (s: string) => s.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5");

// ─────────────────────────────────────────────────────────────
// Tabela de conversão de unidades
// ─────────────────────────────────────────────────────────────
interface ConversaoConfig {
  key: string;          // "bag→kg", "ton→kg", etc.
  de: string;           // unidade NF normalizada (lowercase)
  para: string;         // unidade catálogo (lowercase)
  fator: number | null; // null = manual (usuário informa qtd total)
  tipo: "auto" | "manual";
  labelSelect: string;  // texto no <select>
  labelPara: string;    // rótulo da unidade destino no campo extra
}

const TABELA_CONVERSAO: ConversaoConfig[] = [
  { key: "bag→kg",    de: "bag",   para: "kg",    fator: null,    tipo: "manual", labelSelect: "Bag → Kg  (manual)",  labelPara: "kg"   },
  { key: "bag→g",     de: "bag",   para: "g",     fator: null,    tipo: "manual", labelSelect: "Bag → g   (manual)",  labelPara: "g"    },
  { key: "ton→kg",    de: "ton",   para: "kg",    fator: 1000,    tipo: "auto",   labelSelect: "Ton → Kg  (×1000)",   labelPara: "kg"   },
  { key: "kg→ton",    de: "kg",    para: "ton",   fator: 0.001,   tipo: "auto",   labelSelect: "Kg → Ton  (÷1000)",   labelPara: "ton"  },
  { key: "kg→g",      de: "kg",    para: "g",     fator: 1000,    tipo: "auto",   labelSelect: "Kg → g    (×1000)",   labelPara: "g"    },
  { key: "g→kg",      de: "g",     para: "kg",    fator: 0.001,   tipo: "auto",   labelSelect: "g → Kg    (÷1000)",   labelPara: "kg"   },
  { key: "l→ml",      de: "l",     para: "ml",    fator: 1000,    tipo: "auto",   labelSelect: "L → mL    (×1000)",   labelPara: "mL"   },
  { key: "ml→l",      de: "ml",    para: "l",     fator: 0.001,   tipo: "auto",   labelSelect: "mL → L    (÷1000)",   labelPara: "L"    },
  { key: "galao→l",   de: "galao", para: "l",     fator: null,    tipo: "manual", labelSelect: "Galão → L (manual)",  labelPara: "L"    },
  { key: "l→galao",   de: "l",     para: "galao", fator: null,    tipo: "manual", labelSelect: "L → Galão (manual)",  labelPara: "galão"},
];

function normUnidade(u: string) { return u.toLowerCase().trim(); }

function getConversao(key: string): ConversaoConfig | undefined {
  return TABELA_CONVERSAO.find(c => c.key === key);
}

// Calcula quantidade em unidade catálogo a partir de conversão automática
function calcQtdCatalogo(item: ItemRascunho): number {
  const conv = getConversao(item.conversao_key);
  if (!conv || conv.tipo !== "auto" || !conv.fator) return item.qtd_nf;
  return item.qtd_nf * conv.fator;
}

// ─────────────────────────────────────────────────────────────
// Tipos locais
// ─────────────────────────────────────────────────────────────
interface ItemRascunho {
  key: string;
  descricao_nf: string;
  ncm: string;
  cfop: string;
  // Valores originais do documento fiscal (sempre preservados)
  unidade_nf: string;        // unidade como consta na NF
  qtd_nf: number;            // quantidade como consta na NF
  vunit_nf: number;          // valor unitário como consta na NF
  valor_total: number;       // total da linha na NF
  // Conversão
  conversao_key: string;     // "" | "bag→kg" | "ton→kg" | ...
  // Valores catálogo (pós-conversão; o que entra no estoque)
  quantidade: number;        // qty em unidade catálogo
  valor_unitario: number;    // = vunit_nf (mantido para exibição; custo real = valor_total/quantidade)
  fator_conversao: number;   // fator derivado (apenas auditoria no DB)
  // Associação ao catálogo
  insumo_id: string;
  principio_ativo_id: string;
  nome_comercial_ref: string;
  // Resolução via princípio ativo
  pa_nome?: string;
  pa_auto?: boolean;
  // Apropriação
  tipo_apropiacao: NfEntradaItem["tipo_apropiacao"];
  deposito_id: string;
  bomba_id: string;
  maquina_id: string;
  centro_custo_id: string;
}

interface PedidoMin { id: string; nr_pedido?: string; numero?: string; fornecedor_id?: string; contato_fornecedor?: string; status: string; ano_safra_id?: string; ciclo_id?: string; data_vencimento?: string; }

const ITEM_VAZIO = (): ItemRascunho => ({
  key: crypto.randomUUID(),
  descricao_nf: "", ncm: "", cfop: "", unidade_nf: "UN",
  qtd_nf: 0, vunit_nf: 0, valor_total: 0,
  conversao_key: "",
  quantidade: 0, valor_unitario: 0, fator_conversao: 1,
  insumo_id: "", principio_ativo_id: "", nome_comercial_ref: "",
  tipo_apropiacao: "estoque",
  deposito_id: "", bomba_id: "", maquina_id: "", centro_custo_id: "",
});

type Etapa = "origem" | "cabecalho" | "itens";
type OrigEscolha = "manual" | "xml" | "sieg" | "leitor";
type TipoEntrada = "insumos" | "pecas" | "vef" | "remessa" | "custo_direto";

const TIPO_LABELS: Record<TipoEntrada, { label: string; desc: string; cor: string }> = {
  insumos:      { label: "Insumos / Estoque",       desc: "Compra que gera entrada no estoque. Associe cada item da NF ao catálogo de insumos.",                                   cor: "#E8E8E8" },
  pecas:        { label: "Peças / Manutenção",       desc: "Compra de peças, pneus ou serviços de manutenção. Cada item é vinculado à maquinário do cadastro.",                    cor: "#E0F0FF" },
  custo_direto: { label: "Apropriação Direta",       desc: "NF sem entrada em estoque. Cada item é apropriado diretamente a um centro de custo (mercado, energia, frete…).",       cor: "#E8F5E9" },
  vef:          { label: "Entrega Futura (VEF)",     desc: "Pago agora, produto entregue depois. Gera depósito em nome do fornecedor.",                                            cor: "#FAEEDA" },
  remessa:      { label: "Remessa / Entrega",        desc: "Entrega de VEF anterior. Debita estoque do fornecedor e credita operacional.",                                         cor: "#E6F1FB" },
};

// ─────────────────────────────────────────────────────────────
// Componente principal
// ─────────────────────────────────────────────────────────────
export default function NfCompraPage() {
  const { fazendaId, fazendaIds, contaId, podeAcessarPlano } = useAuth();

  // Dados mestre
  const [nfs, setNfs]             = useState<NfEntrada[]>([]);
  const [insumos, setInsumos]     = useState<Insumo[]>([]);
  const [depositos, setDepositos] = useState<Deposito[]>([]);
  const [pessoas, setPessoas]     = useState<Pessoa[]>([]);
  const [centros, setCentros]     = useState<CentroCusto[]>([]);
  const [maquinas, setMaquinas]   = useState<Maquina[]>([]);
  const [pedidos, setPedidos]     = useState<PedidoMin[]>([]);
  const [regrasClass, setRegrasClass] = useState<RegraClassificacao[]>([]);
  // Dados do wizard — recarregados para a fazenda específica de cada NF
  const [wCentros,    setWCentros]    = useState<CentroCusto[]>([]);
  const [wDepositos,  setWDepositos]  = useState<Deposito[]>([]);
  const [wBombas,     setWBombas]     = useState<BombaCombustivel[]>([]);
  const [wPedidos,    setWPedidos]    = useState<PedidoMin[]>([]);
  const [wProdutores, setWProdutores] = useState<Array<{id: string; nome: string; cpf_cnpj?: string}>>([]);
  const [iesProdutor,  setIesProdutor]  = useState<ProdutorIE[]>([]);
  const [sugestaoNome, setSugestaoNome] = useState<string | null>(null); // nome da regra aplicada
  const [depFiltro, setDepFiltro] = useState<"proprio" | "terceiro">("proprio");

  // Filtros lista
  const [filtroStatus, setFiltroStatus] = useState("");
  const [filtroTipo,   setFiltroTipo]   = useState("");
  const [filtroOrigem, setFiltroOrigem] = useState("");
  const [busca,        setBusca]        = useState("");

  // Lê ?busca= da URL para deep-link direto a uma NF (ex: vindo de Pedido de Compra)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const b = params.get("busca");
    if (b) setBusca(b);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Filtro de data na tabela
  const [filtroDataDe,   setFiltroDataDe]   = useState("");
  const [filtroDataAte,  setFiltroDataAte]  = useState("");
  // SIEG — painel de sincronização
  const [siegDtInicio,      setSiegDtInicio]      = useState(() => { const d=new Date(); d.setDate(d.getDate()-30); return d.toISOString().slice(0,10); });
  const [siegDtFim,         setSiegDtFim]         = useState(() => new Date().toISOString().slice(0,10));
  const [siegForceReimport, setSiegForceReimport] = useState(false);
  const [siegSyncing,       setSiegSyncing]       = useState(false);
  const [siegSyncMsg,       setSiegSyncMsg]       = useState("");
  const [siegCnpjDest,      setSiegCnpjDest]      = useState("");
  const [siegProdutores,    setSiegProdutores]    = useState<Array<{nome: string; cnpj: string}>>([]);
  const [siegReimporting,   setSiegReimporting]   = useState<Record<string, boolean>>({});
  // SIEG — manifestação inline
  const [siegBusy,       setSiegBusy]       = useState<Record<string, boolean>>({});
  const [siegErros,      setSiegErros]      = useState<Record<string, string>>({});
  const [siegJustModal,  setSiegJustModal]  = useState<{nf: NfEntrada; tipo: number}|null>(null);
  const [siegJustText,   setSiegJustText]   = useState("");
  const [manDropdown,    setManDropdown]    = useState<string|null>(null);
  const [acaoDropdown,   setAcaoDropdown]   = useState<string|null>(null);

  // Dropdown customizado de fornecedor (nome + CNPJ em colunas separadas)
  const [pessoaDropOpen, setPessoaDropOpen] = useState(false);
  const [pessoaBusca,    setPessoaBusca]    = useState("");

  // Wizard
  const [wizard,  setWizard]  = useState(false);
  const [etapa,   setEtapa]   = useState<Etapa>("origem");
  const [orig,    setOrig]    = useState<OrigEscolha>("manual");
  const [tipo,    setTipo]    = useState<TipoEntrada>("insumos");
  const [saving,  setSaving]  = useState(false);
  const [err,     setErr]     = useState("");
  // Seleção em lote
  const [selectedNfs,  setSelectedNfs]  = useState<Set<string>>(new Set());
  const [batchModal,   setBatchModal]   = useState(false);
  const [batchSaving,  setBatchSaving]  = useState(false);
  const [batchSettings, setBatchSettings] = useState({
    pedido_compra_id: "", data_vencimento_cp: "",
    deposito_destino_id: "", centro_custo_id: "",
    ano_safra_id: "", ciclo_id: "",
    operacao_gerencial_id: "",
    tipo_destino: "" as "" | "estoque" | "direto",
  });
  const [batchFazendaId, setBatchFazendaId] = useState<string>("");
  const [batchOps,    setBatchOps]    = useState<OperacaoGerencial[]>([]);
  const [batchCiclos, setBatchCiclos] = useState<Ciclo[]>([]);

  // Visualizador de NF (read-only)
  const [nfViewer, setNfViewer] = useState<{ nf: NfEntrada; itens: NfEntradaItem[] } | null>(null);
  const [nfViewerLoading, setNfViewerLoading] = useState(false);

  async function abrirVisualizador(nf: NfEntrada) {
    setNfViewerLoading(true);
    const itens = await listarNfEntradaItens(nf.id).catch(() => []);
    setNfViewer({ nf, itens });
    setNfViewerLoading(false);
  }

  // Wizard — visão de NF (edição)
  const [nfEdit, setNfEdit] = useState<NfEntrada | null>(null);

  // Modal de Reclassificação (pós-processamento)
  const [modalReclass,    setModalReclass]    = useState<NfEntrada | null>(null);
  const [reclassOps,      setReclassOps]      = useState<OperacaoGerencial[]>([]);
  const [reclassOpId,     setReclassOpId]     = useState("");
  const [reclassCC,       setReclassCC]       = useState("");
  const [reclassSaving,   setReclassSaving]   = useState(false);
  const [reclassErr,      setReclassErr]      = useState("");

  // Modal de Devolução
  interface DevItem extends ItemDevolucao { key: string; qtdOriginal: number; }
  const [devModal,   setDevModal]   = useState(false);
  const [devNfOrig,  setDevNfOrig]  = useState<NfEntrada | null>(null);
  const [devItens,   setDevItens]   = useState<DevItem[]>([]);
  const [devCfop,    setDevCfop]    = useState("5201");
  const [devData,    setDevData]    = useState(new Date().toISOString().split("T")[0]);
  const [devVenc,    setDevVenc]    = useState("");
  const [devObs,     setDevObs]     = useState("");
  const [devSaving,  setDevSaving]  = useState(false);
  const [devErr,     setDevErr]     = useState("");

  // Cabeçalho da NF
  const [cab, setCab] = useState({
    numero: "", serie: "1", chave_acesso: "",
    emitente_nome: "", emitente_cnpj: "",
    emitente_municipio: "", emitente_estado: "",
    pessoa_id: "", cfop: "",
    data_emissao: "", data_entrada: new Date().toISOString().split("T")[0],
    valor_total: "", natureza: "",
    pedido_compra_id: "",
    operacao_gerencial_id: "",
    centro_custo_id: "",
    data_vencimento_cp: "",
    forma_pagamento: "",        // à vista, prazo, boleto, pix, cheque, barter…
    deposito_destino_id: "",    // remessa
    bomba_destino_id: "",       // combustível
    e_combustivel: false,       // checkbox manual — habilita seletor de bomba
    observacao: "",
    // Safra e ciclo
    ano_safra_id: "",
    ciclo_id: "",
    // Produtor responsável pelo custo (propaga para o CP)
    produtor_id: "",
    ie_produtor: "",
    // Contabilidade / LCDPR
    vinculo_atividade: "rural" as "rural" | "pessoa_fisica" | "investimento" | "nao_tributavel",
    entidade_contabil: "pf" as "pf" | "pj",
    // Impostos adicionados ao total da NF
    valor_ipi:     "",
    valor_st:      "",
    valor_fcp_st:  "",
    valor_difal:   "",
    valor_desconto:"",
  });
  // Listas de ano safra e ciclo para o formulário
  const [anosSafra,   setAnosSafra]   = useState<AnoSafra[]>([]);
  const [ciclosNF,    setCiclosNF]    = useState<Ciclo[]>([]);
  // Estado para cadastro rápido de fornecedor
  const [savingForn, setSavingForn] = useState(false);
  // Modo de rateio de Centro de Custos
  const [ccMode, setCcMode] = useState<"nenhum" | "global" | "por_produto">("nenhum");
  const [ccGlobalMaquinaId, setCcGlobalMaquinaId] = useState("");
  const [bulkOpGer, setBulkOpGer] = useState("");

  // Itens
  const [itens, setItens] = useState<ItemRascunho[]>([ITEM_VAZIO()]);

  // Sieg
  const [siegChave, setSiegChave] = useState("");
  const [siegLoading, setSiegLoading] = useState(false);

  // Leitor de chave (código de barras → SEFAZ)
  const [leitorChave, setLeitorChave]     = useState("");
  const [leitorLoading, setLeitorLoading] = useState(false);
  const [leitorErro, setLeitorErro]       = useState<string | null>(null);
  const leitorRef = useRef<HTMLInputElement>(null);

  // Modal: exclusão de NF com reversão
  const [modalExcluir, setModalExcluir] = useState<{
    nf: NfEntrada;
    lancamento: { id: string; status: string; lote_id: string | null; conta_bancaria: string | null } | null;
    verificando: boolean;
    excluindo: boolean;
    bloqueado: boolean;  // conciliação feita — não pode excluir
  } | null>(null);

  // Modal: cadastro rápido de insumo dentro do wizard
  const [modalNovoInsumo, setModalNovoInsumo] = useState<{ itemKey: string; nome: string } | null>(null);
  const [formNovoInsumo, setFormNovoInsumo] = useState<{
    nome: string; categoria: Insumo["categoria"]; unidade: Insumo["unidade"];
  }>({ nome: "", categoria: "outros", unidade: "un" });
  const [novoInsumoSaving, setNovoInsumoSaving] = useState(false);
  const [novoInsumoErr,    setNovoInsumoErr]    = useState("");

  // XML ref
  const xmlInputRef = useRef<HTMLInputElement>(null);

  // ── Carregar ────────────────────────────────────────────────
  const carregar = useCallback(async () => {
    if (!fazendaId) return;
    const idsParaNf = fazendaIds.length > 1 ? fazendaIds : [fazendaId];
    const [nfsData, insData, depData, pesData] = await Promise.all([
      listarNfEntradasPorFazendas(idsParaNf),
      listarInsumos(fazendaId),
      listarDepositosMulti(idsParaNf),
      listarPessoasDaConta(fazendaId),
    ]);
    setNfs(nfsData);
    setInsumos(insData);
    setDepositos(depData);
    setPessoas(pesData);

    // Centros de custo — usa da conta para abranger todas as fazendas do produtor
    try {
      const cc = await listarCentrosCustoGeralDaConta(fazendaId);
      setCentros(cc);
    } catch {}

    // Máquinas (para vínculo em CC de manutenção)
    try {
      const maq = await listarMaquinas(fazendaId);
      setMaquinas(maq);
    } catch {}

    // Regras de classificação automática
    try {
      const rc = await listarRegrasClassificacao(fazendaId);
      setRegrasClass(rc);
    } catch {}

    // Operações gerenciais (para modal de reclassificação)
    try {
      const ops = await listarOperacoesGerenciaisAtivas(fazendaId, { tipo: "despesa", permite: "cp_cr" });
      setReclassOps(ops);
    } catch {}

    // Anos safra (para classificação de entrada)
    try {
      const as = await listarAnosSafra(fazendaId);
      setAnosSafra(as);
    } catch {}

    // Pedidos de compra (rascunho/aprovado)
    try {
      const { data } = await supabase
        .from("pedidos_compra")
        .select("id, numero, nr_pedido, fornecedor_id, contato_fornecedor, status, ano_safra_id, ciclo_id, data_vencimento")
        .in("fazenda_id", fazendaIds)
        .in("status", ["rascunho", "aprovado", "entregue"])
        .order("created_at", { ascending: false });
      setPedidos((data ?? []) as PedidoMin[]);
    } catch {}

  }, [fazendaId, fazendaIds]);

  useEffect(() => { carregar(); }, [carregar]);

  // ── Helper: carrega dados do wizard para uma fazenda específica ──
  async function carregarWizardData(fId: string) {
    const allFazIds = fazendaIds.length > 1 ? fazendaIds : (fId ? [fId] : []);
    const [ccData, depData, bombaData] = await Promise.all([
      listarCentrosCustoGeralDaConta(fId).catch(() => [] as CentroCusto[]),
      listarDepositosMulti(allFazIds).catch(() => [] as Deposito[]),
      listarBombas(fId).catch(() => [] as BombaCombustivel[]),
    ]);
    setWCentros(ccData);
    setWDepositos(depData);
    setWBombas(bombaData);
    // Produtores para o select de Produtor da NF
    try {
      const prodsQ = contaId
        ? supabase.from("produtores").select("id,nome,cpf_cnpj").eq("conta_id", contaId).order("nome")
        : supabase.from("produtores").select("id,nome,cpf_cnpj").in("fazenda_id", allFazIds).order("nome");
      const { data: prods } = await prodsQ;
      setWProdutores((prods ?? []) as Array<{id:string;nome:string;cpf_cnpj?:string}>);
    } catch { setWProdutores([]); }
    try {
      const { data } = await supabase
        .from("pedidos_compra")
        .select("id, numero, nr_pedido, fornecedor_id, contato_fornecedor, status, ano_safra_id, ciclo_id, data_vencimento")
        .eq("fazenda_id", fId)
        .in("status", ["rascunho", "aprovado", "entregue"])
        .order("created_at", { ascending: false });
      setWPedidos((data ?? []) as PedidoMin[]);
    } catch { setWPedidos([]); }
  }

  // Carrega config do SIEG (CNPJs → nomes de produtor)
  useEffect(() => {
    if (!fazendaId) return;
    (async () => {
      try {
        const { data: cfgs } = await supabase
          .from("configuracoes_modulo").select("config, modulo")
          .in("fazenda_id", fazendaIds).in("modulo", ["sieg", "fiscal", "fiscal_nfe"]);
        const cnpjs: string[] = [];
        for (const row of (cfgs ?? [])) {
          const c = (row.config ?? {}) as Record<string, unknown>;
          if (Array.isArray(c.cnpjs_destino)) (c.cnpjs_destino as string[]).forEach(d => { const n=d.replace(/\D/g,""); if(n&&!cnpjs.includes(n)) cnpjs.push(n); });
          const s = String(c.cnpj_destino ?? c.cpf_cnpj_emitente ?? c.cnpj ?? "").replace(/\D/g,"");
          if (s && !cnpjs.includes(s)) cnpjs.push(s);
        }
        const prodsQ = contaId
          ? supabase.from("produtores").select("nome,cpf_cnpj").eq("conta_id", contaId)
          : supabase.from("produtores").select("nome,cpf_cnpj").in("fazenda_id", fazendaIds);
        const { data: prods } = await prodsQ;
        const { data: pess  } = await supabase.from("pessoas").select("nome,cpf_cnpj").in("fazenda_id", fazendaIds);
        const todos: Array<{nome:string;cnpj:string}> = [];
        for (const c of cnpjs) {
          const match = [...(prods??[]), ...(pess??[])].find(p => (p.cpf_cnpj??"").replace(/\D/g,"") === c);
          todos.push({ cnpj: c, nome: match?.nome ?? fmtDoc(c) });
        }
        setSiegProdutores(todos);
        if (todos.length > 0 && !siegCnpjDest) setSiegCnpjDest(todos[0].cnpj);
      } catch {}
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fazendaId, contaId]);

  // Carrega ciclos quando o ano safra muda no formulário
  useEffect(() => {
    if (!cab.ano_safra_id) { setCiclosNF([]); return; }
    listarCiclos(cab.ano_safra_id, fazendaId).then(setCiclosNF).catch(() => setCiclosNF([]));
  }, [cab.ano_safra_id, fazendaId]);

  // Carrega IEs do produtor selecionado
  useEffect(() => {
    if (!cab.produtor_id) { setIesProdutor([]); setCab(p => ({ ...p, ie_produtor: "" })); return; }
    listarIEsDoProdutor(cab.produtor_id)
      .then(list => {
        setIesProdutor(list.filter(ie => ie.ativa));
        // Auto-preenche se só houver 1 IE
        if (list.length === 1) setCab(p => ({ ...p, ie_produtor: list[0].inscricao_estadual }));
      })
      .catch(() => setIesProdutor([]));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cab.produtor_id]);

  // Carrega OGs ao abrir o modal de lote
  useEffect(() => {
    if (!batchModal || !fazendaId) return;
    listarOperacoesGerenciaisAtivas(fazendaId, { tipo: "despesa", permite: "cp_cr" })
      .then(setBatchOps).catch(() => setBatchOps([]));
  }, [batchModal, fazendaId]);

  // Carrega ciclos do lote quando ano safra do lote muda
  useEffect(() => {
    if (!batchSettings.ano_safra_id) { setBatchCiclos([]); return; }
    listarCiclos(batchSettings.ano_safra_id, fazendaId).then(setBatchCiclos).catch(() => setBatchCiclos([]));
  }, [batchSettings.ano_safra_id, fazendaId]);

  // ── SIEG — sincronização ────────────────────────────────────
  async function sincronizarSieg() {
    if (!fazendaId) return;
    setSiegSyncing(true); setSiegSyncMsg("");
    try {
      const res = await fetch("/api/integracoes/sieg-sync", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fazenda_id: fazendaId, data_inicio: siegDtInicio, data_fim: siegDtFim, force_reimport: siegForceReimport }),
      });
      const d = await res.json() as Record<string, unknown>;
      if (d.erro) setSiegSyncMsg(`✗ ${d.erro}`);
      else {
        const imp  = Number(d.importados_nfe ?? 0);
        const dup  = Number(d.duplicados_nfe  ?? 0);
        const dupTxt = dup > 0 ? ` · ${dup} já existia${dup !== 1 ? "m" : ""}` : "";
        setSiegSyncMsg(`✓ ${imp} importada${imp !== 1 ? "s" : ""}${dupTxt}`);
        // Aplica filtro de data na tabela para mostrar NFs do período
        setFiltroDataDe(siegDtInicio);
        setFiltroDataAte(siegDtFim);
        await carregar();
      }
    } catch (e) { setSiegSyncMsg(`✗ Erro de rede: ${e}`); }
    finally { setSiegSyncing(false); }
  }

  async function reimportarNf(nf: NfEntrada) {
    if (!fazendaId || !nf.chave_acesso) return;
    setSiegReimporting(p => ({ ...p, [nf.id]: true }));
    try {
      // Janela de ±7 dias em torno da emissão — evita buscar anos inteiros (timeout)
      const base  = nf.data_emissao ?? new Date().toISOString().slice(0, 10);
      const dtIni = new Date(new Date(base).getTime() - 7 * 86_400_000).toISOString().slice(0, 10);
      const dtFim = new Date(new Date(base).getTime() + 7 * 86_400_000).toISOString().slice(0, 10);
      const res = await fetch("/api/integracoes/sieg-sync", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fazenda_id: fazendaId, data_inicio: dtIni, data_fim: dtFim, force_reimport: true, chaves_acesso: [nf.chave_acesso] }),
      });
      const txt = await res.text();
      let d: Record<string, unknown>;
      try { d = JSON.parse(txt); } catch { throw new Error(txt.slice(0, 300)); }
      if (d.erro) alert(`Erro: ${d.erro}`);
      else await carregar();
    } catch (e) { alert(`Erro ao reimportar: ${e}`); }
    finally { setSiegReimporting(p => ({ ...p, [nf.id]: false })); }
  }

  async function executarManifestacao(nf: NfEntrada, tipo: number, justificativa?: string) {
    setSiegBusy(p => ({ ...p, [nf.id]: true }));
    setSiegErros(p => { const n={...p}; delete n[nf.id]; return n; });
    try {
      const res = await fetch("/api/integracoes/sieg-manifestar", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fazenda_id: fazendaId, nf_id: nf.id, chave_acesso: nf.chave_acesso, cnpj_destinatario: nf.cnpj_destino || siegCnpjDest, tipo, justificativa }),
      });
      const d = await res.json() as Record<string, unknown>;
      if (d.erro) setSiegErros(p => ({ ...p, [nf.id]: String(d.erro) }));
      else setNfs(prev => prev.map(n => n.id === nf.id ? { ...n, manifestacao_tipo: tipo, manifestacao_data: new Date().toISOString().slice(0,10) } : n));
    } catch (e) { setSiegErros(p => ({ ...p, [nf.id]: String(e) })); }
    finally { setSiegBusy(p => ({ ...p, [nf.id]: false })); }
  }

  function manifestar(nf: NfEntrada, tipo: number) {
    if (!siegCnpjDest) { setSiegErros(p => ({ ...p, [nf.id]: "CNPJ do destinatário não configurado." })); return; }
    const m = MAN_CFG.find(x => x.tipo === tipo)!;
    if (m.justObrig) { setSiegJustModal({ nf, tipo }); setSiegJustText(""); return; }
    executarManifestacao(nf, tipo);
  }

  // ── Helpers ─────────────────────────────────────────────────
  const nomeDeposito   = (id: string) => depositos.find(d => d.id === id)?.nome ?? "—";
  const nomeInsumo     = (id: string) => insumos.find(i => i.id === id)?.nome ?? "—";
  // ccOpts: usa wCentros (específico da fazenda da NF) com fallback para centros (da conta)
  // Garante que o dropdown de CC nunca fique vazio enquanto wCentros carrega
  const ccOpts = wCentros.length > 0 ? wCentros : centros;
  const ccManutencao   = (id: string) => !!ccOpts.find(c => c.id === id)?.manutencao_maquinas;

  // ── Abrir wizard novo ──────────────────────────────────────
  async function abrirNovo() {
    setNfEdit(null);
    setEtapa("origem");
    setOrig("manual");
    setTipo("insumos");
    setCab({
      numero: "", serie: "1", chave_acesso: "",
      emitente_nome: "", emitente_cnpj: "",
      emitente_municipio: "", emitente_estado: "",
      pessoa_id: "", cfop: "",
      data_emissao: new Date().toISOString().split("T")[0],
      data_entrada: new Date().toISOString().split("T")[0],
      valor_total: "", natureza: "",
      pedido_compra_id: "",
      operacao_gerencial_id: "",
      centro_custo_id: "",
      data_vencimento_cp: "",
      forma_pagamento: "",
      deposito_destino_id: "",
      bomba_destino_id: "",
      e_combustivel: false,
      observacao: "",
      ano_safra_id: "",
      ciclo_id: "",
      produtor_id: "",
      ie_produtor: "",
      vinculo_atividade: "rural" as const,
      entidade_contabil: "pf" as const,
      valor_ipi: "", valor_st: "", valor_fcp_st: "", valor_difal: "", valor_desconto: "",
    });
    setBulkOpGer("");
    setItens([ITEM_VAZIO()]);
    setErr("");
    setSiegChave("");
    setLeitorChave("");
    setLeitorErro(null);
    // Carrega CC/depósitos frescos da fazenda ativa (evita race condition com centros ainda carregando)
    if (fazendaId) await carregarWizardData(fazendaId);
    setWizard(true);
  }

  // ── Abrir edição ──────────────────────────────────────────
  async function abrirEditar(nf: NfEntrada) {
    setNfEdit(nf);
    setOrig((nf.origem ?? "manual") as OrigEscolha);
    // "combustivel" não é um TipoEntrada base — mapeia para "insumos" + e_combustivel=true
    setTipo((nf.tipo_entrada === "combustivel" ? "insumos" : (nf.tipo_entrada ?? "insumos")) as TipoEntrada);
    // "pecas" é um TipoEntrada válido — não remapeia
    setCab({
      numero: nf.numero,
      serie: nf.serie,
      chave_acesso: nf.chave_acesso ?? "",
      emitente_nome: nf.emitente_nome,
      emitente_cnpj: nf.emitente_cnpj ?? "",
      emitente_municipio: "",
      emitente_estado: "",
      pessoa_id: nf.pessoa_id ?? pessoaPorCnpj(nf.emitente_cnpj ?? ""),
      cfop: nf.cfop ?? "",
      data_emissao: nf.data_emissao,
      data_entrada: nf.data_entrada ?? new Date().toISOString().split("T")[0],
      valor_total: String(nf.valor_total),
      natureza: nf.natureza ?? "",
      pedido_compra_id: nf.pedido_compra_id ?? "",
      operacao_gerencial_id: nf.operacao_gerencial_id ?? "",
      centro_custo_id: nf.centro_custo_id ?? "",
      data_vencimento_cp: nf.data_vencimento_cp ?? "",
      forma_pagamento: (nf as Record<string,unknown>).forma_pagamento as string ?? "",
      deposito_destino_id: nf.deposito_destino_id ?? "",
      bomba_destino_id: "",
      e_combustivel: nf.tipo_entrada === "combustivel",
      observacao: nf.observacao ?? "",
      ano_safra_id: nf.ano_safra_id ?? "",
      ciclo_id: nf.ciclo_id ?? "",
      produtor_id: nf.produtor_id ?? produtorPorCnpj(nf.emitente_cnpj ?? ""),
      ie_produtor: (nf as Record<string,unknown>).ie_produtor as string ?? "",
      vinculo_atividade: (nf.vinculo_atividade ?? "rural") as "rural" | "pessoa_fisica" | "investimento" | "nao_tributavel",
      entidade_contabil: (nf.entidade_contabil ?? "pf") as "pf" | "pj",
      valor_ipi:      String((nf as Record<string,unknown>).valor_ipi      ?? ""),
      valor_st:       String((nf as Record<string,unknown>).valor_st       ?? ""),
      valor_fcp_st:   String((nf as Record<string,unknown>).valor_fcp_st   ?? ""),
      valor_difal:    String((nf as Record<string,unknown>).valor_difal    ?? ""),
      valor_desconto: String((nf as Record<string,unknown>).valor_desconto ?? ""),
    });
    // Carregar itens existentes
    try {
      const itensDB = await listarNfEntradaItens(nf.id);
      if (itensDB.length > 0) {
        setItens(itensDB.map(i => {
          const fator   = i.fator_conversao ?? 1;
          // Qtd NF original: quantidade / fator (reverso da conversão salva)
          const qtdNf   = fator > 0 ? i.quantidade / fator : i.quantidade;
          const convKey = fator !== 1
            ? (TABELA_CONVERSAO.find(c => Math.abs((c.fator ?? 1) - fator) < 0.00001)?.key ?? "")
            : "";
          return {
            key: i.id,
            descricao_nf:  i.descricao_nf ?? i.descricao_produto,
            ncm:  i.ncm  ?? "",
            cfop: i.cfop ?? "",
            unidade_nf:         i.unidade_nf ?? i.unidade,
            qtd_nf:             qtdNf,
            vunit_nf:           i.valor_unitario,
            valor_total:        i.valor_total,
            conversao_key:      convKey,
            quantidade:         i.quantidade,
            valor_unitario:     i.valor_unitario,
            fator_conversao:    fator,
            insumo_id:          i.insumo_id           ?? "",
            principio_ativo_id: i.principio_ativo_id  ?? "",
            nome_comercial_ref: i.nome_comercial_ref  ?? "",
            tipo_apropiacao:    i.tipo_apropiacao,
            deposito_id:        i.deposito_id         ?? "",
            bomba_id:           i.bomba_id            ?? "",
            maquina_id:         i.maquina_id          ?? "",
            centro_custo_id:    i.centro_custo_id     ?? "",
            pa_nome:  i.principio_ativo_id ? i.descricao_produto : undefined,
            pa_auto:  !!i.principio_ativo_id,
          };
        }));
      }
    } catch {}
    setEtapa("cabecalho");
    setErr("");
    // Carrega CC/depósitos/pedidos frescos para a fazenda desta NF (sempre fresh, sem cache)
    const nfFazId = nf.fazenda_id ?? fazendaId ?? "";
    await carregarWizardData(nfFazId || fazendaId || "");
    setWizard(true);
  }

  // ── Parse XML ─────────────────────────────────────────────
  function parsearXml(xmlText: string) {
    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(xmlText, "text/xml");
      const emit = doc.querySelector("emit");
      const ide  = doc.querySelector("ide");
      const total = doc.querySelector("total ICMSTot, ICMSTot");

      const xNome   = emit?.querySelector("xNome")?.textContent ?? "";
      const cnpj    = emit?.querySelector("CNPJ")?.textContent ?? "";
      const nNF     = ide?.querySelector("nNF")?.textContent   ?? "";
      const serie   = ide?.querySelector("serie")?.textContent ?? "1";
      const dhEmi   = ide?.querySelector("dhEmi")?.textContent ?? "";
      const natOp   = ide?.querySelector("natOp")?.textContent ?? "";
      const vNF     = total?.querySelector("vNF")?.textContent ?? "0";
      const chNFe   = doc.querySelector("chNFe, infNFe")?.getAttribute("Id")?.replace(/^NFe/, "") ?? "";
      const enderEmit = emit?.querySelector("enderEmit");
      const xMun    = enderEmit?.querySelector("xMun")?.textContent ?? "";
      const ufEmit  = enderEmit?.querySelector("UF")?.textContent   ?? "";

      // Tenta classificação automática com o CNPJ/nome do emitente
      const regraHeader = aplicarRegraClassificacao(regrasClass, cnpj, xNome, "", "", "");
      setSugestaoNome(regraHeader?.nome ?? null);

      const pessoaAutoId = pessoaPorCnpj(cnpj);
      setCab(p => ({
        ...p,
        numero: nNF,
        serie,
        chave_acesso: chNFe,
        emitente_nome: xNome,
        emitente_cnpj: cnpj,
        emitente_municipio: xMun,
        emitente_estado: ufEmit,
        data_emissao: dhEmi ? dhEmi.substring(0, 10) : p.data_emissao,
        valor_total: vNF,
        natureza: natOp,
        // auto-preenche fornecedor se CNPJ bater com cadastro
        pessoa_id: pessoaAutoId || p.pessoa_id,
        // aplica sugestão apenas se o campo ainda não foi preenchido
        operacao_gerencial_id: regraHeader?.operacao_gerencial_id ?? p.operacao_gerencial_id,
        centro_custo_id:       regraHeader?.centro_custo_id       ?? p.centro_custo_id,
      }));

      // Itens — aplica regra por item (NCM + CFOP + descrição)
      const dets = Array.from(doc.querySelectorAll("det"));
      if (dets.length > 0) {
        setItens(dets.map(det => {
          const prod = det.querySelector("prod");
          const xProd  = prod?.querySelector("xProd")?.textContent  ?? "";
          const NCM    = prod?.querySelector("NCM")?.textContent    ?? "";
          const CFOP   = prod?.querySelector("CFOP")?.textContent   ?? "";
          const uCom   = prod?.querySelector("uCom")?.textContent   ?? "UN";
          const qCom   = parseFloat(prod?.querySelector("qCom")?.textContent  ?? "0");
          const vUnCom = parseFloat(prod?.querySelector("vUnCom")?.textContent ?? "0");
          const vProd  = parseFloat(prod?.querySelector("vProd")?.textContent  ?? "0");
          // Unidade tributável — em sementes costuma ter qTrib em KG mesmo quando uCom = BAG
          const uTrib  = prod?.querySelector("uTrib")?.textContent ?? "";
          const qTrib  = parseFloat(prod?.querySelector("qTrib")?.textContent  ?? "0");

          // ── Detecção de conversão BAG → KG via campos da NF ─────────────────
          // Se uCom = BAG e uTrib tem o peso, pre-preenche conversão manual com o total.
          const uComNorm  = uCom.toUpperCase().trim();
          const uTribNorm = uTrib.toUpperCase().trim();
          const isBag     = uComNorm === "BAG";

          let convKey    = "";
          let qtdCatalogo = qCom; // default = NF qty
          let qtdKgPreenchida = 0;

          if (isBag) {
            convKey = "bag→kg";
            if (uTribNorm === "KG" && qTrib > 0) {
              qtdCatalogo     = qTrib;
              qtdKgPreenchida = qTrib;
            } else if (uTribNorm === "TON" && qTrib > 0) {
              qtdCatalogo     = qTrib * 1000;
              qtdKgPreenchida = qTrib * 1000;
            }
            // Sem qTrib: conversão bag→kg selecionada mas qtd_catalogo = 0 (usuário digita)
          } else {
            // Tenta auto-matching: unidade NF bate com alguma conversão conhecida "de"
            const autoMatch = TABELA_CONVERSAO.find(
              c => c.tipo === "auto" && normUnidade(uCom) === c.de
            );
            if (autoMatch && autoMatch.fator) {
              convKey     = autoMatch.key;
              qtdCatalogo = qCom * autoMatch.fator;
            } else {
              qtdCatalogo = qCom;
            }
          }

          const fatorDeriv = qCom > 0 ? qtdCatalogo / qCom : 1;

          // tenta regra específica de item; fallback para regra do header
          const regraItem = aplicarRegraClassificacao(regrasClass, cnpj, xNome, NCM, CFOP, xProd) ?? regraHeader;
          return {
            key: crypto.randomUUID(),
            descricao_nf: xProd, ncm: NCM, cfop: CFOP,
            unidade_nf:    uCom,       // original da NF sempre
            qtd_nf:        qCom,
            vunit_nf:      vUnCom,
            valor_total:   vProd,
            conversao_key: convKey,
            quantidade:    isBag && qtdKgPreenchida > 0 ? qtdKgPreenchida : (convKey && !isBag ? qtdCatalogo : qCom),
            valor_unitario: vUnCom,
            fator_conversao: fatorDeriv,
            insumo_id: "", principio_ativo_id: "", nome_comercial_ref: "",
            tipo_apropiacao: "estoque" as NfEntradaItem["tipo_apropiacao"],
            deposito_id: "", bomba_id: "", maquina_id: "",
            centro_custo_id: regraItem?.centro_custo_id ?? "",
          };
        }));
      }
    } catch (e) {
      setErr("Erro ao processar XML. Verifique o arquivo.");
    }
  }

  // ── Busca Sieg ────────────────────────────────────────────
  async function buscarSieg() {
    if (!siegChave.trim()) return;
    setSiegLoading(true);
    setErr("");
    try {
      // Sieg requer chave de acesso de 44 dígitos
      // Na integração real: POST /api/sieg com a chave
      // Aqui simulamos com a estrutura esperada
      const res = await fetch(`/api/sieg?chave=${siegChave.trim()}`);
      if (!res.ok) throw new Error("NF não encontrada no Sieg");
      const xml = await res.text();
      parsearXml(xml);
      setOrig("sieg");
      setEtapa("cabecalho");
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Erro na consulta Sieg");
    } finally {
      setSiegLoading(false);
    }
  }

  // ── Salvar rascunho (etapa cabeçalho → itens) ────────────
  async function salvarRascunho(): Promise<NfEntrada | null> {
    if (!fazendaId) return null;
    setErr("");
    if (!cab.numero || !cab.emitente_nome || !cab.data_emissao) {
      setErr("Preencha Número, Emitente e Data de Emissão.");
      return null;
    }
    const payload: Omit<NfEntrada, "id" | "created_at"> = {
      fazenda_id:            fazendaId,
      numero:                cab.numero,
      serie:                 cab.serie,
      chave_acesso:          cab.chave_acesso || undefined,
      emitente_nome:         cab.emitente_nome,
      emitente_cnpj:         cab.emitente_cnpj || undefined,
      pessoa_id:             cab.pessoa_id    || undefined,
      cfop:                  cab.cfop         || undefined,
      data_emissao:          cab.data_emissao,
      data_entrada:          cab.data_entrada || undefined,
      valor_total:           (parseFloat(cab.valor_total)||0) + (parseFloat(cab.valor_ipi)||0) + (parseFloat(cab.valor_st)||0) + (parseFloat(cab.valor_fcp_st)||0) + (parseFloat(cab.valor_difal)||0) - (parseFloat(cab.valor_desconto)||0),
      natureza:              cab.natureza     || undefined,
      status:                "pendente",
      origem:                orig,
      tipo_entrada:          cab.e_combustivel ? "combustivel" : tipo,
      pedido_compra_id:      cab.pedido_compra_id    || undefined,
      operacao_gerencial_id: cab.operacao_gerencial_id || undefined,
      centro_custo_id:       cab.centro_custo_id     || undefined,
      data_vencimento_cp:    cab.data_vencimento_cp  || undefined,
      forma_pagamento:       cab.forma_pagamento      || undefined,
      deposito_destino_id:   cab.deposito_destino_id || undefined,
      observacao:            cab.observacao           || undefined,
      ano_safra_id:          cab.ano_safra_id         || undefined,
      ciclo_id:              cab.ciclo_id             || undefined,
      produtor_id:           cab.produtor_id          || undefined,
      ie_produtor:           cab.ie_produtor           || undefined,
      vinculo_atividade:     cab.vinculo_atividade,
      entidade_contabil:     cab.entidade_contabil,
      valor_produtos:        parseFloat(cab.valor_total) || 0,
      valor_ipi:             parseFloat(cab.valor_ipi)    || 0,
      valor_st:              parseFloat(cab.valor_st)     || 0,
      valor_fcp_st:          parseFloat(cab.valor_fcp_st) || 0,
      valor_difal:           parseFloat(cab.valor_difal)  || 0,
      valor_desconto:        parseFloat(cab.valor_desconto) || 0,
    };
    try {
      let nf: NfEntrada;
      if (nfEdit) {
        await atualizarNfEntrada(nfEdit.id, payload);
        nf = { ...nfEdit, ...payload };
      } else {
        nf = await criarNfEntrada(payload);
      }
      setNfEdit(nf);
      return nf;
    } catch (e: unknown) {
      const err = e as { message?: string; details?: string; hint?: string; code?: string };
      const msg = [err.message, err.details, err.hint].filter(Boolean).join(" | ");
      setErr(msg || JSON.stringify(e));
      return null;
    }
  }

  // ── Processar NF (finalizar) ──────────────────────────────
  async function processarNF() {
    if (!fazendaId || !nfEdit) return;
    // Guard: NF já processada não pode ser reprocessada — use "Estornar" antes
    if (nfEdit.status === "processada") {
      alert("Esta NF já foi processada. Para reprocessar, clique em 'Estornar' primeiro para reverter o estoque e o lançamento financeiro.");
      return;
    }
    // Guard: operação gerencial é obrigatória.
    // Exceção: NF com classificação automática aplicada (sugestaoNome != null) —
    // a regra já carrega a informação gerencial e o bloqueio seria redundante.
    if (!cab.operacao_gerencial_id && !sugestaoNome) {
      setErr("Selecione uma Operação Gerencial antes de processar a NF.");
      return;
    }
    setSaving(true);
    setErr("");
    try {
      // 0. Persistir metadados críticos via API (service_role_key — imune a JWT expirado)
      //    Garante que data_vencimento_cp, produtor_id e tipo_entrada estejam no DB
      //    mesmo que salvarRascunho tenha falhado silenciosamente por JWT expirado.
      await fetch("/api/compras/nf-update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id:                    nfEdit.id,
          fazenda_id:            fazendaId,
          data_vencimento_cp:    cab.data_vencimento_cp    || null,
          forma_pagamento:       cab.forma_pagamento       || null,
          tipo_entrada:          cab.e_combustivel ? "combustivel" : tipo,
          produtor_id:           cab.produtor_id           || null,
          ie_produtor:           cab.ie_produtor            || null,
          operacao_gerencial_id: cab.operacao_gerencial_id || null,
          centro_custo_id:       cab.centro_custo_id       || null,
          ano_safra_id:          cab.ano_safra_id          || null,
          ciclo_id:              cab.ciclo_id              || null,
          pedido_compra_id:      cab.pedido_compra_id      || null,
          observacao:            cab.observacao             || null,
        }),
      });

      // 1. Limpar itens existentes (evita duplicação se houve falha parcial anterior)
      await supabase.from("nf_entrada_itens").delete().eq("nf_entrada_id", nfEdit.id);

      // 1b. Recriar todos os itens do estado atual
      for (const it of itens) {
        if (!it.descricao_nf.trim()) continue;
        const tipoAprp: NfEntradaItem["tipo_apropiacao"] =
          tipo === "vef"          ? "vef"     :
          tipo === "remessa"      ? "remessa" :
          tipo === "custo_direto" ? "direto"  :
          ccMode === "global"     ? "direto"  :
          it.tipo_apropiacao;
        // Modo global: sobrescreve CC e maquina de todos os itens
        if (ccMode === "global") {
          it.centro_custo_id = cab.centro_custo_id;
          it.maquina_id      = ccGlobalMaquinaId;
        }
        // Modo nenhum: garante que nenhum item herda CC
        if (ccMode === "nenhum") {
          it.centro_custo_id = "";
          it.maquina_id      = "";
        }
        // Combustível: bomba vem do cabeçalho; deposito_id não se aplica
        if (cab.e_combustivel && cab.bomba_destino_id) {
          it.bomba_id    = cab.bomba_destino_id;
          it.deposito_id = "";
        }

        const isPAItem = !!it.principio_ativo_id;
        const itemPayload: Omit<NfEntradaItem, "id" | "created_at"> = {
          nf_entrada_id:       nfEdit.id,
          fazenda_id:          fazendaId,
          insumo_id:           (!isPAItem && it.insumo_id) ? it.insumo_id : undefined,
          principio_ativo_id:  it.principio_ativo_id  || undefined,
          nome_comercial_ref:  it.nome_comercial_ref  || undefined,
          deposito_id:         it.deposito_id         || undefined,
          bomba_id:            it.bomba_id             || undefined,
          maquina_id:          it.maquina_id          || undefined,
          descricao_produto:   isPAItem ? it.pa_nome! : (it.insumo_id ? nomeInsumo(it.insumo_id) : it.descricao_nf),
          descricao_nf:        it.descricao_nf,
          ncm:                 it.ncm   || undefined,
          cfop:                it.cfop  || undefined,
          unidade:             isPAItem ? it.unidade_nf : (it.insumo_id ? (insumos.find(i => i.id === it.insumo_id)?.unidade ?? it.unidade_nf) : it.unidade_nf),
          unidade_nf:          it.unidade_nf,
          fator_conversao:     it.fator_conversao ?? 1,
          quantidade:          it.quantidade,   // já em unidade catálogo (conversão aplicada no state)
          valor_unitario:      it.vunit_nf,     // preço original da NF (custo real = valor_total/qtd em db.ts)
          valor_total:         it.valor_total,
          tipo_apropiacao:     tipoAprp,
          centro_custo_id:     it.centro_custo_id || undefined,
          alerta_preco:        false,
        };
        await criarNfEntradaItem(itemPayload);
      }

      // 2. Processar: movimentações de estoque, CP, VEF etc.
      const itensDB = await listarNfEntradaItens(nfEdit.id);
      // Deriva a máquina do item de manutenção (primeiro item com maquina_id)
      const maquinaIdDominante = itensDB.find(i => i.maquina_id)?.maquina_id || undefined;
      await processarNfEntrada(
        nfEdit.id,
        fazendaId,
        itensDB,
        nfEdit.valor_total,
        nfEdit.emitente_nome,
        nfEdit.data_entrada ?? nfEdit.data_emissao,
        nfEdit.emitente_cnpj,
        {
          nfeNumero:           nfEdit.numero,
          dataVencimentoCp:    nfEdit.data_vencimento_cp,
          formaPagamento:      (nfEdit as Record<string,unknown>).forma_pagamento as string | undefined,
          tipoEntrada:         nfEdit.tipo_entrada,
          anoSafraId:          nfEdit.ano_safra_id,
          cicloId:             nfEdit.ciclo_id,
          operacaoGerencialId: nfEdit.operacao_gerencial_id,
          centroCustoId:       nfEdit.centro_custo_id,
          pedidoCompraId:      nfEdit.pedido_compra_id || undefined,
          produtorId:          nfEdit.produtor_id || undefined,
          maquinaId:           maquinaIdDominante,
        },
      );

      // 3. Marcar como processada
      await atualizarNfEntrada(nfEdit.id, { status: "processada" });

      await carregar();
      setWizard(false);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Erro ao processar NF");
    } finally {
      setSaving(false);
    }
  }

  // ── Excluir NF — API route com service_role_key ──────────
  async function chamarApiExcluir(nfId: string): Promise<void> {
    const res = await fetch("/api/compras/excluir-nf", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nf_id: nfId, fazenda_id: fazendaId }),
    });
    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      throw new Error((json as { error?: string }).error ?? `Erro HTTP ${res.status}`);
    }
  }

  async function iniciarExclusaoNf(nf: NfEntrada) {
    if (nf.status !== "processada") {
      // NF não processada: sem movimentações a reverter
      if (!confirm(`Excluir NF ${nf.numero}?\n\nEsta NF ainda não foi processada — nenhuma movimentação de estoque será revertida.`)) return;
      try {
        await chamarApiExcluir(nf.id);
        await carregar();
      } catch (e: unknown) { alert(e instanceof Error ? e.message : "Erro ao excluir"); }
      return;
    }
    // NF processada: verificar lancamento (lote = bloqueado)
    setModalExcluir({ nf, lancamento: null, verificando: true, excluindo: false, bloqueado: false });
    try {
      const { lancamento } = await verificarExclusaoNf(nf.id);
      const bloqueado = !!(lancamento?.lote_id);
      setModalExcluir({ nf, lancamento, verificando: false, excluindo: false, bloqueado });
    } catch {
      setModalExcluir(null);
    }
  }

  async function confirmarExclusao() {
    if (!modalExcluir || !fazendaId) return;
    setModalExcluir(p => p ? { ...p, excluindo: true } : null);
    try {
      await chamarApiExcluir(modalExcluir.nf.id);
      setModalExcluir(null);
      await carregar();
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : "Erro ao excluir NF");
      setModalExcluir(p => p ? { ...p, excluindo: false } : null);
    }
  }

  // ── Estornar processamento de NF ─────────────────────────
  async function estornarNFClick(nf: NfEntrada) {
    const ok = confirm(
      `Estornar NF ${nf.numero}?\n\n` +
      `Isso irá:\n• Reverter todo o estoque creditado por esta NF\n• Cancelar o lançamento financeiro (CP) associado\n• Retornar a NF para "Rascunho" para reprocessamento\n\n` +
      `Use isto se o estoque ficou duplicado ou incorreto.`
    );
    if (!ok) return;
    try {
      // Usa API route com service_role_key — imune a JWT expirado e RLS
      const res = await fetch("/api/compras/estornar-nf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nf_id: nf.id }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error((json as { error?: string }).error ?? `Erro HTTP ${res.status}`);
      }
      await carregar();
      alert(`NF ${nf.numero} estornada. O estoque foi revertido. Reabra a NF para corrigir os itens e reprocessar.`);
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : "Erro ao estornar NF");
    }
  }

  // ── Reclassificar NF pós-processamento ───────────────────
  function abrirReclassificar(nf: NfEntrada) {
    setModalReclass(nf);
    setReclassOpId(nf.operacao_gerencial_id ?? "");
    setReclassCC(nf.centro_custo_id ?? "");
    setReclassErr("");
  }

  async function salvarReclassificacao() {
    if (!modalReclass) return;
    setReclassSaving(true);
    setReclassErr("");
    try {
      await atualizarNfEntrada(modalReclass.id, {
        operacao_gerencial_id: reclassOpId || undefined,
        centro_custo_id:       reclassCC   || undefined,
      });
      await carregar();
      setModalReclass(null);
    } catch (e: unknown) {
      setReclassErr(e instanceof Error ? e.message : "Erro ao salvar.");
    } finally {
      setReclassSaving(false);
    }
  }

  // ── Cadastro rápido de insumo dentro do wizard ───────────
  function abrirNovoInsumo(itemKey: string, descricaoNf: string) {
    setFormNovoInsumo({ nome: descricaoNf, categoria: "outros", unidade: "un" });
    setNovoInsumoErr("");
    setModalNovoInsumo({ itemKey, nome: descricaoNf });
  }

  async function processarEmLote() {
    const nfsSel = nfsFiltradas.filter(n => selectedNfs.has(n.id) && n.status === "pendente");
    if (!nfsSel.length) return;
    setBatchSaving(true);
    const erros: string[] = [];
    const tipoDest = batchSettings.tipo_destino;

    for (const nf of nfsSel) {
      try {
        const ccId  = batchSettings.centro_custo_id || nf.centro_custo_id;
        const ogId  = batchSettings.operacao_gerencial_id || nf.operacao_gerencial_id;
        const cicId = batchSettings.ciclo_id || nf.ciclo_id;

        // 1. Persistir campos de cabeçalho na NF
        const upd: Partial<NfEntrada> = {};
        if (batchSettings.data_vencimento_cp)    upd.data_vencimento_cp    = batchSettings.data_vencimento_cp;
        if (batchSettings.pedido_compra_id)       upd.pedido_compra_id      = batchSettings.pedido_compra_id;
        if (batchSettings.centro_custo_id)        upd.centro_custo_id       = batchSettings.centro_custo_id;
        if (batchSettings.operacao_gerencial_id)  upd.operacao_gerencial_id = batchSettings.operacao_gerencial_id;
        if (batchSettings.ano_safra_id)           upd.ano_safra_id          = batchSettings.ano_safra_id;
        if (batchSettings.ciclo_id)               upd.ciclo_id              = batchSettings.ciclo_id;
        if (tipoDest === "direto") {
          upd.tipo_entrada = "custo_direto";
        } else if (tipoDest === "estoque") {
          if (batchSettings.deposito_destino_id) (upd as Record<string,unknown>).deposito_destino_id = batchSettings.deposito_destino_id;
          upd.tipo_entrada = "insumos";
        } else {
          // sem alteração de tipo — só deposito se informado
          if (batchSettings.deposito_destino_id) (upd as Record<string,unknown>).deposito_destino_id = batchSettings.deposito_destino_id;
        }
        if (Object.keys(upd).length) await atualizarNfEntrada(nf.id, upd);

        // 2. Decidir se processa agora ou deixa pendente para entrada individual
        const tipoEfetivo = tipoDest === "direto" ? "custo_direto"
          : tipoDest === "estoque" ? "insumos"
          : (nf.tipo_entrada ?? "custo_direto");

        if (tipoEfetivo === "custo_direto" && ccId) {
          // Apropriação Direta: processa todos os itens como "direto"
          const itensNf = await listarNfEntradaItens(nf.id);
          const itensDireto = itensNf.map(it => ({
            ...it,
            tipo_apropiacao: "direto" as NfEntradaItem["tipo_apropiacao"],
            centro_custo_id: ccId,
          }));
          await processarNfEntrada(
            nf.id,
            nf.fazenda_id ?? batchFazendaId,
            itensDireto,
            nf.valor_total,
            nf.emitente_nome,
            nf.data_entrada ?? new Date().toISOString().split("T")[0],
            nf.emitente_cnpj ?? undefined,
            {
              nfeNumero:             nf.numero,
              dataVencimentoCp:      batchSettings.data_vencimento_cp || nf.data_vencimento_cp || undefined,
              tipoEntrada:           "custo_direto",
              anoSafraId:            batchSettings.ano_safra_id || nf.ano_safra_id || undefined,
              cicloId:               cicId || undefined,
              operacaoGerencialId:   ogId  || undefined,
              centroCustoId:         ccId,
              pedidoCompraId:        batchSettings.pedido_compra_id || nf.pedido_compra_id || undefined,
            },
          );
        }
        // Estoque: campos salvos, NF permanece pendente para mapeamento de itens
      } catch (e) {
        erros.push(`NF ${nf.numero}: ${e instanceof Error ? e.message : "Erro"}`);
      }
    }
    await carregar();
    setBatchSaving(false);
    setBatchModal(false);
    setSelectedNfs(new Set());
    if (erros.length) alert("Erros no lote:\n" + erros.join("\n"));
  }

  async function salvarNovoInsumo() {
    if (!fazendaId || !formNovoInsumo.nome.trim()) return;
    setNovoInsumoSaving(true);
    setNovoInsumoErr("");
    try {
      const criado = await criarInsumo({
        fazenda_id:      fazendaId,
        tipo:            "produto",
        nome:            formNovoInsumo.nome.trim(),
        categoria:       formNovoInsumo.categoria,
        unidade:         formNovoInsumo.unidade,
        estoque:         0,
        estoque_minimo:  0,
        valor_unitario:  0,
      });
      setInsumos(prev => [...prev, criado]);
      if (modalNovoInsumo) {
        setItem(modalNovoInsumo.itemKey, { insumo_id: criado.id });
      }
      setModalNovoInsumo(null);
    } catch (e: unknown) {
      setNovoInsumoErr(e instanceof Error ? e.message : "Erro ao cadastrar");
    } finally {
      setNovoInsumoSaving(false);
    }
  }

  // ── Abrir modal de devolução ──────────────────────────────
  async function abrirDevolucao(nf: NfEntrada) {
    setDevNfOrig(nf);
    setDevErr("");
    setDevObs("");
    setDevData(new Date().toISOString().split("T")[0]);
    setDevVenc("");
    // CFOP padrão: 5201 (intraestadual) — ajustável pelo usuário
    setDevCfop("5201");
    // Carrega os itens da NF original
    try {
      const itensDB = await listarNfEntradaItens(nf.id);
      const devs: DevItem[] = itensDB
        .filter(i => i.insumo_id && i.tipo_apropiacao === "estoque")
        .map(i => ({
          key:                 i.id,
          insumo_id:           i.insumo_id!,
          descricao_produto:   i.descricao_produto,
          unidade:             i.unidade,
          deposito_id:         i.deposito_id,
          qtdOriginal:         i.quantidade,
          quantidade_devolver: 0,
          valor_unitario:      i.valor_unitario,
          valor_total:         0,
        }));
      setDevItens(devs);
    } catch {
      setDevItens([]);
    }
    setDevModal(true);
  }

  // ── Confirmar devolução ───────────────────────────────────
  async function confirmarDevolucao() {
    if (!fazendaId || !devNfOrig) return;
    const itensParaDevolver = devItens.filter(i => i.quantidade_devolver > 0);
    if (itensParaDevolver.length === 0) {
      setDevErr("Informe a quantidade a devolver em ao menos um item.");
      return;
    }
    for (const i of itensParaDevolver) {
      if (i.quantidade_devolver > i.qtdOriginal) {
        setDevErr(`Quantidade de "${i.descricao_produto}" excede o original (${i.qtdOriginal} ${i.unidade}).`);
        return;
      }
    }
    setDevSaving(true);
    setDevErr("");
    try {
      const numeroNovo = `DEV-${devNfOrig.numero}`;
      await processarDevolucaoCompra(
        fazendaId,
        devNfOrig.id,
        numeroNovo,
        devNfOrig.serie,
        devCfop,
        devNfOrig.emitente_nome,
        devNfOrig.emitente_cnpj,
        devNfOrig.pessoa_id,
        devData,
        devVenc || undefined,
        itensParaDevolver,
      );
      await carregar();
      setDevModal(false);
    } catch (e: unknown) {
      setDevErr(e instanceof Error ? e.message : "Erro ao processar devolução");
    } finally {
      setDevSaving(false);
    }
  }

  // ── Busca pessoa por CNPJ/CPF no cadastro ──────────────────
  function pessoaPorCnpj(cnpj: string): string {
    if (!cnpj) return "";
    const norm = cnpj.replace(/\D/g, "");
    return pessoas.find(p => (p.cpf_cnpj ?? "").replace(/\D/g, "") === norm)?.id ?? "";
  }

  function produtorPorCnpj(cnpj: string): string {
    if (!cnpj) return "";
    const norm = cnpj.replace(/\D/g, "");
    return wProdutores.find(p => (p.cpf_cnpj ?? "").replace(/\D/g, "") === norm)?.id ?? "";
  }

  // ── Auto-fill emitente quando pessoa selecionada ─────────
  function onPessoaChange(id: string) {
    const p = pessoas.find(x => x.id === id);
    if (p) {
      setCab(prev => ({
        ...prev,
        pessoa_id:     id,
        emitente_nome: p.nome ?? prev.emitente_nome,
        emitente_cnpj: p.cpf_cnpj     ?? prev.emitente_cnpj,
      }));
    } else {
      setCab(prev => ({ ...prev, pessoa_id: id }));
    }
  }

  function onPedidoChange(pedidoId: string) {
    if (!pedidoId) {
      setCab(prev => ({ ...prev, pedido_compra_id: "" }));
      return;
    }
    const ped = pedidos.find(p => p.id === pedidoId);
    if (!ped) { setCab(prev => ({ ...prev, pedido_compra_id: pedidoId })); return; }
    const forn = pessoas.find(x => x.id === ped.fornecedor_id);
    setCab(prev => ({
      ...prev,
      pedido_compra_id:   pedidoId,
      // Fornecedor
      pessoa_id:          ped.fornecedor_id    ?? prev.pessoa_id,
      emitente_nome:      forn?.nome           ?? prev.emitente_nome,
      emitente_cnpj:      forn?.cpf_cnpj       ?? prev.emitente_cnpj,
      // Classificação
      ano_safra_id:       ped.ano_safra_id     ?? prev.ano_safra_id,
      ciclo_id:           ped.ciclo_id         ?? prev.ciclo_id,
      // Vencimento
      data_vencimento_cp: ped.data_vencimento  ?? prev.data_vencimento_cp,
    }));
  }

  // ── Atualizar item ─────────────────────────────────────────
  const setItem = (key: string, patch: Partial<ItemRascunho>) => {
    setItens(prev => prev.map(it => {
      if (it.key !== key) return it;
      const updated = { ...it, ...patch };

      // Recalcula valor_total a partir dos valores NF originais
      if (patch.qtd_nf !== undefined || patch.vunit_nf !== undefined) {
        updated.valor_total    = (updated.qtd_nf || 0) * (updated.vunit_nf || 0);
        updated.valor_unitario = updated.vunit_nf;
        // Se não há conversão, quantidade catálogo acompanha qtd NF
        if (!updated.conversao_key) {
          updated.quantidade     = updated.qtd_nf;
          updated.fator_conversao = 1;
        }
      }

      // Seleção/mudança de conversão
      if (patch.conversao_key !== undefined) {
        const conv = getConversao(patch.conversao_key);
        if (!conv) {
          // Sem conversão — restaura quantidades NF
          updated.quantidade      = updated.qtd_nf;
          updated.fator_conversao = 1;
        } else if (conv.tipo === "auto" && conv.fator) {
          // Auto — calcula imediatamente
          updated.quantidade      = updated.qtd_nf * conv.fator;
          updated.fator_conversao = conv.fator;
        }
        // Manual — quantidade fica zerada; usuário preenche via campo extra
        if (conv?.tipo === "manual") {
          updated.quantidade      = 0;
          updated.fator_conversao = 1;
        }
      }

      // Atualização manual da quantidade catálogo (campo extra manual)
      if (patch.quantidade !== undefined && updated.conversao_key) {
        const qCat = patch.quantidade || 0;
        updated.fator_conversao = updated.qtd_nf > 0 ? qCat / updated.qtd_nf : 1;
      }

      return updated;
    }));
  };

  // ── Resolução automática via princípio ativo (BOT mapping) ──
  // Chamado com debounce quando o usuário termina de digitar a descrição do item
  const resolverItemPA = useCallback(async (key: string, descricao: string) => {
    if (!fazendaId || !descricao.trim() || tipo !== "insumos") return;
    const item = itens.find(it => it.key === key);
    if (item?.principio_ativo_id || item?.insumo_id) return; // não sobrescreve escolha manual

    const res = await resolverNomeComercial(descricao, fazendaId);
    if (!res) return;

    // Defensivos/fertilizantes/inoculantes → estoque por PA direto (sem criar insumo)
    setItens(prev => prev.map(it => {
      if (it.key !== key) return it;
      if (it.principio_ativo_id || it.insumo_id) return it;
      return {
        ...it,
        principio_ativo_id: res.principioAtivo.id,
        nome_comercial_ref: descricao.trim(),
        pa_nome:  res.principioAtivo.nome,
        pa_auto:  true,
      };
    }));
  }, [fazendaId, tipo, itens]);

  // ── Auto-fill tipo_apropiacao por tipo de entrada ─────────
  const tipoAprpDefault = (t: TipoEntrada): NfEntradaItem["tipo_apropiacao"] =>
    t === "vef"          ? "vef"        :
    t === "remessa"      ? "remessa"    :
    t === "custo_direto" ? "direto"     :
    t === "pecas"        ? "maquinario" :
    "estoque";

  // ── Totais ─────────────────────────────────────────────────
  const totalItens = itens.reduce((s, i) => s + i.valor_total, 0);

  // ── Lista filtrada ────────────────────────────────────────
  const nfsFiltradas = nfs.filter(nf => {
    if (filtroStatus && nf.status !== filtroStatus) return false;
    if (filtroTipo   && nf.tipo_entrada !== filtroTipo) return false;
    if (filtroOrigem && nf.origem !== filtroOrigem) return false;
    if (filtroDataDe  && nf.data_emissao < filtroDataDe)  return false;
    if (filtroDataAte && nf.data_emissao > filtroDataAte) return false;
    if (busca) {
      const b = busca.toLowerCase();
      if (!nf.numero.includes(busca) && !nf.emitente_nome.toLowerCase().includes(b)) return false;
    }
    return true;
  });

  // ─────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────
  const opSelecionada = reclassOps.find(o => o.id === cab.operacao_gerencial_id);

  if (!podeAcessarPlano("nf_entrada")) return <PlanoGate modulo="nf_entrada" />;
  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh", background: "var(--bg-page)" }} onClick={() => { setManDropdown(null); setAcaoDropdown(null); }}>
      <TopNav />

      <main style={{ flex: 1, padding: "24px 28px", width: "100%" }}>

        {/* ── Cabeçalho ── */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
          <div>
            <div style={{ fontSize: 20, fontWeight: 700, color: "var(--text-1)" }}>Entrada de NF</div>
            <div style={{ fontSize: 13, color: "#666", marginTop: 2 }}>
              {nfs.length} nota{nfs.length !== 1 ? "s" : ""} · {nfs.filter(n => n.status === "pendente").length} pendente{nfs.filter(n => n.status === "pendente").length !== 1 ? "s" : ""}
            </div>
          </div>
          <button style={btnV} onClick={abrirNovo}>+ Nova NF Manual</button>
        </div>

        {/* ── Painel SIEG ── */}
        <div style={{ background: "white", border: "0.5px solid var(--border)", borderRadius: 12, padding: "14px 18px", marginBottom: 18 }}>
          <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: "#111111", marginRight: 4 }}>⟳ Sincronizar SIEG</span>

            {/* Destinatário */}
            {siegProdutores.length > 0 && (
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ fontSize: 11, color: "var(--text-2)" }}>Destinatário:</span>
                {siegProdutores.length === 1
                  ? <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-1)" }}>{siegProdutores[0].nome}</span>
                  : <select value={siegCnpjDest} onChange={e => setSiegCnpjDest(e.target.value)}
                      style={{ padding: "4px 8px", border: "0.5px solid var(--border)", borderRadius: 6, fontSize: 12, outline: "none", background: "white", color: "var(--text-1)" }}>
                      {siegProdutores.map(p => <option key={p.cnpj} value={p.cnpj}>{p.nome}</option>)}
                    </select>
                }
              </div>
            )}

            {/* Intervalo de datas */}
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ fontSize: 11, color: "var(--text-2)" }}>De:</span>
              <input type="date" value={siegDtInicio} onChange={e => setSiegDtInicio(e.target.value)}
                style={{ padding: "4px 8px", border: "0.5px solid var(--border)", borderRadius: 6, fontSize: 12, outline: "none", color: "var(--text-1)" }} />
              <span style={{ fontSize: 11, color: "var(--text-2)" }}>Até:</span>
              <input type="date" value={siegDtFim} onChange={e => setSiegDtFim(e.target.value)}
                style={{ padding: "4px 8px", border: "0.5px solid var(--border)", borderRadius: 6, fontSize: 12, outline: "none", color: "var(--text-1)" }} />
            </div>

            {/* Força re-importação */}
            <label style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12, color: "#666", cursor: "pointer", userSelect: "none" }}>
              <input type="checkbox" checked={siegForceReimport} onChange={e => setSiegForceReimport(e.target.checked)} style={{ cursor: "pointer" }} />
              Forçar re-importação
            </label>

            <button onClick={sincronizarSieg} disabled={siegSyncing}
              style={{ padding: "6px 18px", background: siegSyncing ? "var(--border)" : "#111111", color: siegSyncing ? "var(--text-3)" : "white", border: "none", borderRadius: 8, fontWeight: 600, fontSize: 13, cursor: siegSyncing ? "default" : "pointer" }}>
              {siegSyncing ? "Sincronizando…" : "Sincronizar"}
            </button>

            {siegSyncMsg && (
              <span style={{ fontSize: 12, fontWeight: 600, color: siegSyncMsg.startsWith("✗") ? "#E24B4A" : "#16A34A" }}>{siegSyncMsg}</span>
            )}
          </div>
        </div>

        {/* ── Cards de resumo ── */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14, marginBottom: 20 }}>
          {[
            { label: "Total no mês",   value: fmtBRL(nfs.filter(n => n.data_emissao?.startsWith(new Date().toISOString().substring(0,7)) && n.status !== "cancelada").reduce((s,n)=>s+n.valor_total,0)), bg: "var(--bg-card)" },
            { label: "Pendentes",      value: String(nfs.filter(n=>n.status==="pendente").length),   bg: "#FBF3E0" },
            { label: "Processadas",    value: String(nfs.filter(n=>n.status==="processada").length), bg: "#E8F5E9" },
            { label: "Canceladas",     value: String(nfs.filter(n=>n.status==="cancelada").length),  bg: "#FCEBEB" },
          ].map(({ label, value, bg }) => (
            <div key={label} style={{ background: bg, border: "0.5px solid var(--border-table)", borderRadius: 12, padding: "14px 18px" }}>
              <div style={{ fontSize: 11, color: "#666", marginBottom: 4 }}>{label}</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: "var(--text-1)" }}>{value}</div>
            </div>
          ))}
        </div>

        {/* ── Filtros ── */}
        <div style={{ ...card, marginBottom: 16, display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
          <input
            placeholder="Buscar por nº ou emitente…"
            value={busca} onChange={e => setBusca(e.target.value)}
            style={{ ...inp, width: 240 }}
          />
          <select value={filtroStatus} onChange={e => setFiltroStatus(e.target.value)} style={{ ...inp, width: 160 }}>
            <option value="">Todos os status</option>
            {Object.entries(STATUS_META).map(([k,v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
          <select value={filtroTipo} onChange={e => setFiltroTipo(e.target.value)} style={{ ...inp, width: 180 }}>
            <option value="">Todos os tipos</option>
            {Object.entries(TIPO_META).map(([k,v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
          <select value={filtroOrigem} onChange={e => setFiltroOrigem(e.target.value)} style={{ ...inp, width: 140 }}>
            <option value="">Toda origem</option>
            <option value="manual">Manual</option>
            <option value="xml">XML</option>
            <option value="sieg">SIEG</option>
          </select>
          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <span style={{ fontSize: 11, color: "var(--text-3)" }}>Emissão:</span>
            <input type="date" value={filtroDataDe} onChange={e => setFiltroDataDe(e.target.value)}
              style={{ ...inp, width: 136, padding: "5px 8px" }} />
            <span style={{ fontSize: 11, color: "var(--text-3)" }}>–</span>
            <input type="date" value={filtroDataAte} onChange={e => setFiltroDataAte(e.target.value)}
              style={{ ...inp, width: 136, padding: "5px 8px" }} />
            {(filtroDataDe || filtroDataAte) && (
              <button onClick={() => { setFiltroDataDe(""); setFiltroDataAte(""); }}
                style={{ fontSize: 11, color: "var(--text-3)", background: "none", border: "none", cursor: "pointer", padding: "2px 4px" }} title="Limpar filtro de data">✕</button>
            )}
          </div>
          <span style={{ fontSize: 12, color: "var(--text-3)", marginLeft: "auto" }}>{nfsFiltradas.length} resultado{nfsFiltradas.length !== 1 ? "s" : ""}</span>
        </div>

        {/* ── Barra de ações em lote ── */}
        {selectedNfs.size > 0 && (
          <div style={{ background: "#111111", borderRadius: 10, padding: "10px 18px", marginBottom: 12, display: "flex", alignItems: "center", gap: 14 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: "#fff" }}>
              {selectedNfs.size} NF{selectedNfs.size > 1 ? "s" : ""} selecionada{selectedNfs.size > 1 ? "s" : ""}
            </span>
            <button
              onClick={() => {
                const nfsSel = nfsFiltradas.filter(n => selectedNfs.has(n.id) && n.status === "pendente");
                if (!nfsSel.length) { alert("Nenhuma NF pendente selecionada para processar."); return; }
                const fId = nfsSel[0].fazenda_id ?? fazendaId ?? "";
                setBatchFazendaId(fId);
                if (fId !== fazendaId) {
                  carregarWizardData(fId);
                } else {
                  setWCentros([...centros]);
                  setWDepositos([...depositos]);
                  setWPedidos([...pedidos]);
                }
                setBatchSettings({ pedido_compra_id: "", data_vencimento_cp: "", deposito_destino_id: "", centro_custo_id: "", ano_safra_id: "", ciclo_id: "", operacao_gerencial_id: "", tipo_destino: "" });
                setBatchModal(true);
              }}
              style={{ padding: "6px 16px", background: "#fff", color: "#111111", border: "none", borderRadius: 8, fontWeight: 700, fontSize: 12, cursor: "pointer" }}
            >
              ⚡ Processar em lote
            </button>
            <button
              onClick={() => setSelectedNfs(new Set())}
              style={{ padding: "6px 12px", background: "transparent", color: "rgba(255,255,255,0.7)", border: "0.5px solid rgba(255,255,255,0.3)", borderRadius: 8, fontSize: 12, cursor: "pointer" }}
            >
              Limpar seleção
            </button>
          </div>
        )}

        {/* ── Tabela ── */}
        <div style={{ ...card, padding: "0", overflow: "hidden" }}>
          {nfsFiltradas.length === 0 ? (
            <div style={{ textAlign: "center", padding: "40px 20px", color: "var(--text-3)", fontSize: 13 }}>
              Nenhuma NF encontrada. Clique em &ldquo;+ Nova NF de Compra&rdquo; para começar.
            </div>
          ) : (
            <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed", minWidth: 1100 }}>
              <colgroup>
                <col style={{ width: 36 }} />     {/* checkbox */}
                <col style={{ width: 90 }} />     {/* Nº/Série */}
                <col style={{ width: "22%" }} />  {/* Emitente — flex */}
                <col style={{ width: "18%" }} />  {/* Destinatário — flex */}
                <col style={{ width: 82 }} />     {/* Emissão */}
                <col style={{ width: 82 }} />     {/* Entrada */}
                <col style={{ width: 80 }} />     {/* Tipo */}
                <col style={{ width: 60 }} />     {/* Origem */}
                <col style={{ width: 110 }} />    {/* Valor Total */}
                <col style={{ width: 90 }} />     {/* Status */}
                <col style={{ width: 100 }} />    {/* Manifest. */}
                <col />                           {/* Ações — ocupa o restante */}
              </colgroup>
              <thead>
                <tr style={{ background: "var(--bg-page)" }}>
                  {["", "Nº / Série", "Emitente", "Destinatário", "Emissão", "Entrada", "Tipo", "Origem", "Valor Total", "Status", "Manifest.", "Ações"].map((c, i) => (
                    <th key={i} style={{ padding: "8px 12px", textAlign: i >= 8 ? "right" : "left", fontSize: 11, fontWeight: 600, color: "var(--text-2)", borderBottom: "0.5px solid var(--border-table)", whiteSpace: "nowrap" }}>{c}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {nfsFiltradas.map(nf => {
                  const sm = STATUS_META[nf.status] ?? STATUS_META["pendente"];
                  const tm = nf.tipo_entrada ? TIPO_META[nf.tipo_entrada] : null;
                  const om = nf.origem ? ORIGEM_META[nf.origem] : null;
                  return (
                    <tr key={nf.id} style={{ borderBottom: "0.5px solid var(--bg-tag)", background: selectedNfs.has(nf.id) ? "#F2F2F2" : undefined }}>
                      <td style={{ padding: "10px 12px" }}>
                        <input
                          type="checkbox"
                          checked={selectedNfs.has(nf.id)}
                          onChange={e => {
                            setSelectedNfs(prev => {
                              const next = new Set(prev);
                              e.target.checked ? next.add(nf.id) : next.delete(nf.id);
                              return next;
                            });
                          }}
                          style={{ cursor: "pointer" }}
                        />
                      </td>
                      <td style={{ padding: "10px 12px", fontSize: 13, fontWeight: 600, color: "var(--text-1)" }}>
                        {nf.numero}<span style={{ fontSize: 11, color: "var(--text-3)", fontWeight: 400 }}>/{nf.serie}</span>
                      </td>
                      <td style={{ padding: "10px 12px", fontSize: 13, color: "var(--text-1)", overflow: "hidden" }}>
                        <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{nf.emitente_nome}</div>
                        {nf.emitente_cnpj && <div style={{ fontSize: 11, color: "var(--text-3)", fontFamily: "monospace" }}>{nf.emitente_cnpj}</div>}
                      </td>
                      <td style={{ padding: "10px 12px", fontSize: 12, color: "var(--text-1)", overflow: "hidden" }}>
                        {(() => {
                          if (nf.nome_destinatario) return <>{nf.nome_destinatario}{nf.cnpj_destino && <div style={{ fontSize: 11, color: "var(--text-3)" }}>{fmtDoc(nf.cnpj_destino.replace(/\D/g,""))}</div>}</>;
                          if (!nf.cnpj_destino) return <span style={{ color: "var(--text-3)" }}>—</span>;
                          const cnpjNum = nf.cnpj_destino.replace(/\D/g, "");
                          const prod = siegProdutores.find(p => p.cnpj === cnpjNum);
                          return prod ? <>{prod.nome}<div style={{ fontSize: 11, color: "var(--text-3)" }}>{fmtDoc(cnpjNum)}</div></> : <span style={{ fontFamily: "monospace" }}>{fmtDoc(cnpjNum)}</span>;
                        })()}
                      </td>
                      <td style={{ padding: "10px 12px", fontSize: 12, color: "var(--text-2)" }}>{fmtData(nf.data_emissao)}</td>
                      <td style={{ padding: "10px 12px", fontSize: 12, color: "var(--text-2)" }}>{fmtData(nf.data_entrada)}</td>
                      <td style={{ padding: "10px 12px" }}>{tm ? badge(tm.label, tm.bg, "#333") : <span style={{ color: "var(--text-muted)", fontSize: 12 }}>—</span>}</td>
                      <td style={{ padding: "10px 12px" }}>{om ? badge(om.label) : <span style={{ color: "var(--text-muted)", fontSize: 12 }}>—</span>}</td>
                      <td style={{ padding: "10px 12px", fontSize: 13, fontWeight: 600, textAlign: "right" }}>
                        {fmtBRL(nf.valor_total)}
                        {nf.observacao?.includes("WhatsApp") && (
                          <div title="Lançado via WhatsApp" style={{ fontSize: 10, fontWeight: 500, color: "#25D366", marginTop: 2 }}>📱 WhatsApp</div>
                        )}
                      </td>
                      <td style={{ padding: "10px 12px", textAlign: "right" }}>{badge(sm.label, sm.bg, sm.cl)}</td>
                      <td style={{ padding: "10px 12px", textAlign: "right" }}>
                        {nf.origem === "sieg" ? (() => {
                          const isBusy  = siegBusy[nf.id];
                          const manTipo = nf.manifestacao_tipo ?? null;
                          const manSt   = manTipo !== null ? (MAN_CFG.find(m => m.tipo === manTipo)?.status ?? "pendente") : "pendente";
                          const stCfg   = MAN_ST[manSt as ManStatus] ?? MAN_ST.pendente;
                          const aberto  = manDropdown === nf.id;
                          return (
                            <div style={{ position: "relative", display: "inline-block" }}>
                              <button
                                disabled={isBusy}
                                onClick={e => { e.stopPropagation(); setManDropdown(aberto ? null : nf.id); }}
                                style={{ padding: "3px 7px", border: `0.5px solid ${stCfg.cor}60`, borderRadius: 6, background: stCfg.bg, color: stCfg.cor, fontWeight: 700, fontSize: 11, cursor: isBusy ? "default" : "pointer", whiteSpace: "nowrap", display: "flex", alignItems: "center", gap: 3 }}>
                                {isBusy ? "⏳" : stCfg.short} {!isBusy && "▾"}
                              </button>
                              {aberto && (
                                <div style={{ position: "absolute", right: 0, top: "calc(100% + 4px)", background: "var(--bg-card)", border: "0.5px solid var(--border)", borderRadius: 8, boxShadow: "0 4px 16px rgba(0,0,0,0.12)", zIndex: 200, minWidth: 150, overflow: "hidden" }}>
                                  {MAN_CFG.map(m => (
                                    <button key={m.tipo}
                                      onClick={e => { e.stopPropagation(); setManDropdown(null); manifestar(nf, m.tipo); }}
                                      style={{ display: "block", width: "100%", padding: "8px 14px", border: "none", background: m.tipo === manTipo ? m.bg : "transparent", color: m.cor, fontWeight: m.tipo === manTipo ? 700 : 600, fontSize: 12, cursor: "pointer", textAlign: "left" }}>
                                      {m.tipo === manTipo ? "✓ " : ""}{m.label}
                                    </button>
                                  ))}
                                </div>
                              )}
                              {siegErros[nf.id] && <div style={{ fontSize: 9, color: "#E24B4A", marginTop: 3 }}>{siegErros[nf.id]}</div>}
                            </div>
                          );
                        })() : <span style={{ fontSize: 11, color: "#ccc" }}>—</span>}
                      </td>
                      <td style={{ padding: "10px 12px", textAlign: "right" }}>
                        <div style={{ display: "flex", gap: 5, justifyContent: "flex-end", alignItems: "center" }}>
                          {/* Ver */}
                          <button onClick={() => abrirVisualizador(nf)} disabled={nfViewerLoading}
                            style={{ padding: "4px 10px", border: "0.5px solid #44444450", borderRadius: 6, background: "#F2F2F2", cursor: "pointer", fontSize: 11, color: "#111111", fontWeight: 600, whiteSpace: "nowrap" }}>
                            Ver
                          </button>

                          {/* DANFE */}
                          {nf.chave_acesso && (
                            <a href={`/api/fiscal/danfe?chave=${nf.chave_acesso}&fazenda_id=${nf.fazenda_id}`}
                              target="_blank" rel="noopener noreferrer"
                              style={{ padding: "4px 10px", border: "0.5px solid #16A34A50", borderRadius: 6, background: "#F0FDF4", fontSize: 11, color: "#15803D", fontWeight: 600, textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 3, whiteSpace: "nowrap" }}>
                              ↗ DANFE
                            </a>
                          )}

                          {/* Editar (não-sieg, não-processada) */}
                          {nf.status !== "processada" && nf.status !== "cancelada" && nf.origem !== "sieg" && (
                            <button onClick={() => abrirEditar(nf)} style={{ padding: "4px 10px", border: "0.5px solid var(--border-table)", borderRadius: 6, background: "transparent", cursor: "pointer", fontSize: 11, color: "#1A5C38", fontWeight: 600, whiteSpace: "nowrap" }}>
                              Editar
                            </button>
                          )}

                          {/* Processar (pendente) */}
                          {nf.status === "pendente" && (
                            <button onClick={() => abrirEditar(nf)} style={{ padding: "4px 9px", border: "none", borderRadius: 6, background: "#1A5C38", cursor: "pointer", fontSize: 11, color: "#fff", fontWeight: 600, whiteSpace: "nowrap" }}>
                              Proc
                            </button>
                          )}

                          {/* Re-import. (sieg pendente) */}
                          {nf.origem === "sieg" && nf.status === "pendente" && (
                            <button onClick={() => reimportarNf(nf)} disabled={siegReimporting[nf.id]}
                              title="Re-importar do SIEG"
                              style={{ padding: "4px 8px", border: "0.5px solid #44444450", borderRadius: 6, background: "#F2F2F2", cursor: siegReimporting[nf.id] ? "default" : "pointer", fontSize: 14, color: "#111111", fontWeight: 400, opacity: siegReimporting[nf.id] ? 0.5 : 1, lineHeight: 1 }}>
                              {siegReimporting[nf.id] ? "⏳" : "↻"}
                            </button>
                          )}

                          {/* ⋮ dropdown — ações secundárias para processadas */}
                          {nf.status === "processada" && (() => {
                            const aberto = acaoDropdown === nf.id;
                            return (
                              <div style={{ position: "relative" }}>
                                <button
                                  onClick={e => { e.stopPropagation(); setAcaoDropdown(aberto ? null : nf.id); setManDropdown(null); }}
                                  style={{ padding: "4px 9px", border: "0.5px solid var(--border-table)", borderRadius: 6, background: aberto ? "#F4F6FA" : "transparent", cursor: "pointer", fontSize: 14, color: "var(--text-2)", fontWeight: 700, lineHeight: 1 }}>
                                  ⋮
                                </button>
                                {aberto && (
                                  <div style={{ position: "absolute", right: 0, top: "calc(100% + 4px)", background: "var(--bg-card)", border: "0.5px solid var(--border)", borderRadius: 8, boxShadow: "0 4px 16px rgba(0,0,0,0.12)", zIndex: 300, minWidth: 140, overflow: "hidden" }}
                                    onClick={e => e.stopPropagation()}>
                                    {nf.tipo_entrada === "insumos" && (
                                      <button onClick={() => { setAcaoDropdown(null); abrirDevolucao(nf); }}
                                        style={{ display: "block", width: "100%", padding: "8px 14px", border: "none", background: "transparent", cursor: "pointer", fontSize: 12, color: "#791F1F", fontWeight: 600, textAlign: "left" }}>
                                        Devolver
                                      </button>
                                    )}
                                    <button onClick={() => { setAcaoDropdown(null); abrirReclassificar(nf); }}
                                      style={{ display: "block", width: "100%", padding: "8px 14px", border: "none", background: "transparent", cursor: "pointer", fontSize: 12, color: "#7B4A00", fontWeight: 600, textAlign: "left" }}>
                                      Reclassificar
                                    </button>
                                    <button onClick={() => { setAcaoDropdown(null); estornarNFClick(nf); }}
                                      style={{ display: "block", width: "100%", padding: "8px 14px", border: "none", background: "transparent", cursor: "pointer", fontSize: 12, color: "#8A4A00", fontWeight: 600, textAlign: "left" }}>
                                      Estornar
                                    </button>
                                  </div>
                                )}
                              </div>
                            );
                          })()}

                          {/* Excluir */}
                          {nf.status !== "cancelada" && (
                            <button onClick={() => iniciarExclusaoNf(nf)} title="Excluir NF"
                              style={{ padding: "4px 8px", border: "0.5px solid #E24B4A50", borderRadius: 6, background: "#FCEBEB", cursor: "pointer", fontSize: 14, color: "#791F1F", lineHeight: 1 }}>
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
            </div>
          )}
        </div>
      </main>

      {/* ══════════════════════════════════════════════════════
          MODAL VISUALIZADOR DE NF
      ══════════════════════════════════════════════════════ */}
      {nfViewer && (() => {
        const { nf, itens } = nfViewer;
        const fmtDoc = (d: string) => d.length === 14
          ? d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5")
          : d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
        const sm = STATUS_META[nf.status] ?? STATUS_META["pendente"];
        return (
          <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex:2000, display: "flex", alignItems: "center", justifyContent: "center" }}
               onClick={() => setNfViewer(null)}>
            <div style={{ background: "var(--bg-card)", borderRadius: 14, width: 820, maxWidth: "95vw", maxHeight: "90vh", overflow: "auto", boxShadow: "0 8px 40px rgba(0,0,0,0.18)" }}
                 onClick={e => e.stopPropagation()}>

              {/* Header */}
              <div style={{ padding: "20px 24px 16px", borderBottom: "0.5px solid var(--border)", display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
                <div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: "var(--text-1)" }}>
                    NF-e {nf.numero}/{nf.serie}
                    <span style={{ marginLeft: 10 }}>{sm && <span style={{ padding: "2px 10px", borderRadius: 8, fontSize: 11, fontWeight: 700, background: sm.bg, color: sm.cl }}>{sm.label}</span>}</span>
                  </div>
                  <div style={{ fontSize: 12, color: "#666", marginTop: 4, fontFamily: "monospace" }}>{nf.chave_acesso}</div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  {nf.chave_acesso && (
                    <a
                      href={`/api/fiscal/danfe?chave=${nf.chave_acesso}&fazenda_id=${nf.fazenda_id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ padding: "6px 14px", border: "0.5px solid #16A34A60", borderRadius: 8, background: "#F0FDF4", fontSize: 12, color: "#15803D", fontWeight: 700, textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 5 }}
                    >
                      ↗ Abrir DANFE PDF
                    </a>
                  )}
                  <button onClick={() => setNfViewer(null)} style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer", color: "var(--text-3)", lineHeight: 1, padding: 0 }}>×</button>
                </div>
              </div>

              <div style={{ padding: "20px 24px", display: "flex", flexDirection: "column", gap: 20 }}>

                {/* Emitente / Destinatário */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                  <div style={{ background: "var(--bg-card)", border: "0.5px solid var(--border)", borderRadius: 10, padding: "14px 16px" }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: "var(--text-2)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8 }}>Emitente (Fornecedor)</div>
                    <div style={{ fontWeight: 700, fontSize: 14, color: "var(--text-1)" }}>{nf.emitente_nome || "—"}</div>
                    {nf.emitente_cnpj && <div style={{ fontSize: 12, color: "var(--text-2)", fontFamily: "monospace", marginTop: 4 }}>{fmtDoc(nf.emitente_cnpj)}</div>}
                  </div>
                  <div style={{ background: "var(--bg-card)", border: "0.5px solid var(--border)", borderRadius: 10, padding: "14px 16px" }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: "var(--text-2)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8 }}>Destinatário</div>
                    <div style={{ fontWeight: 700, fontSize: 14, color: "var(--text-1)" }}>
                      {nf.nome_destinatario || (nf.cnpj_destino ? (() => {
                        const prod = siegProdutores.find(p => p.cnpj === nf.cnpj_destino?.replace(/\D/g,""));
                        return prod?.nome ?? fmtDoc(nf.cnpj_destino);
                      })() : "—")}
                    </div>
                    {nf.cnpj_destino && <div style={{ fontSize: 12, color: "var(--text-2)", fontFamily: "monospace", marginTop: 4 }}>{fmtDoc(nf.cnpj_destino.replace(/\D/g,""))}</div>}
                  </div>
                </div>

                {/* Dados fiscais */}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
                  {[
                    { label: "Emissão",       value: fmtData(nf.data_emissao) },
                    { label: "Entrada",        value: fmtData(nf.data_entrada) ?? "—" },
                    { label: "Vencimento CP",  value: nf.data_vencimento_cp ? fmtData(nf.data_vencimento_cp) : "—", destaque: !!nf.data_vencimento_cp },
                    { label: "Natureza",       value: nf.natureza || "—" },
                    { label: "CFOP",           value: nf.cfop || "—" },
                    { label: "Valor Total",    value: fmtBRL(nf.valor_total) },
                    { label: "Origem",         value: nf.origem?.toUpperCase() ?? "—" },
                    { label: "Tipo",           value: nf.tipo_entrada ? TIPO_META[nf.tipo_entrada]?.label ?? nf.tipo_entrada : "—" },
                    { label: "Observação",     value: nf.observacao || "—" },
                  ].map(({ label, value, destaque }) => (
                    <div key={label} style={{ background: destaque ? "#FBF3E0" : "var(--bg-card)", border: `0.5px solid ${destaque ? "#C9921B" : "var(--bg-tag)"}`, borderRadius: 8, padding: "10px 12px" }}>
                      <div style={{ fontSize: 10, color: destaque ? "#7A4300" : "var(--text-3)", marginBottom: 4 }}>{label}</div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: destaque ? "#7A4300" : "var(--text-1)", wordBreak: "break-word" }}>{value}</div>
                    </div>
                  ))}
                </div>

                {/* Itens */}
                {itens.length > 0 && (
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-2)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 10 }}>
                      Itens ({itens.length})
                    </div>
                    <div style={{ border: "0.5px solid var(--border)", borderRadius: 10, overflow: "hidden" }}>
                      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                        <thead>
                          <tr style={{ background: "var(--bg-page)" }}>
                            {["#", "Produto / Descrição", "NCM", "CFOP", "Unid.", "Qtde.", "Vl. Unit.", "Vl. Total"].map((h, i) => (
                              <th key={h} style={{ padding: "8px 10px", textAlign: i >= 5 ? "right" : "left", fontWeight: 600, fontSize: 11, color: "var(--text-2)", borderBottom: "0.5px solid var(--border)" }}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {itens.map((it, idx) => (
                            <tr key={it.id} style={{ borderBottom: idx < itens.length - 1 ? "0.5px solid var(--bg-tag)" : "none", background: idx % 2 === 0 ? "#fff" : "#FAFBFD" }}>
                              <td style={{ padding: "8px 10px", color: "var(--text-3)" }}>{idx + 1}</td>
                              <td style={{ padding: "8px 10px", fontWeight: 600, color: "var(--text-1)", maxWidth: 220, wordBreak: "break-word" }}>{it.descricao_produto || it.descricao_nf}</td>
                              <td style={{ padding: "8px 10px", color: "var(--text-2)", fontFamily: "monospace" }}>{it.ncm || "—"}</td>
                              <td style={{ padding: "8px 10px", color: "var(--text-2)", fontFamily: "monospace" }}>{it.cfop || "—"}</td>
                              <td style={{ padding: "8px 10px", color: "var(--text-2)" }}>{it.unidade_nf || it.unidade}</td>
                              <td style={{ padding: "8px 10px", textAlign: "right", color: "var(--text-1)" }}>{Number(it.quantidade).toLocaleString("pt-BR", { maximumFractionDigits: 4 })}</td>
                              <td style={{ padding: "8px 10px", textAlign: "right", color: "var(--text-1)" }}>{fmtBRL(it.valor_unitario)}</td>
                              <td style={{ padding: "8px 10px", textAlign: "right", fontWeight: 700, color: "var(--text-1)" }}>{fmtBRL(it.valor_total)}</td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot>
                          <tr style={{ background: "var(--bg-page)", borderTop: "0.5px solid var(--border)" }}>
                            <td colSpan={7} style={{ padding: "8px 10px", fontWeight: 700, fontSize: 12, textAlign: "right", color: "var(--text-2)" }}>Total</td>
                            <td style={{ padding: "8px 10px", fontWeight: 700, fontSize: 13, textAlign: "right", color: "#111111" }}>
                              {fmtBRL(itens.reduce((s, it) => s + (it.valor_total ?? 0), 0))}
                            </td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  </div>
                )}

              </div>

              {/* Footer */}
              <div style={{ padding: "14px 24px", borderTop: "0.5px solid var(--border)", display: "flex", justifyContent: "flex-end", gap: 10 }}>
                {nf.status === "pendente" && (
                  <button onClick={() => { setNfViewer(null); abrirEditar(nf); }}
                    style={{ padding: "8px 20px", background: "#1A5C38", color: "#fff", border: "none", borderRadius: 8, fontWeight: 600, fontSize: 13, cursor: "pointer" }}>
                    Processar
                  </button>
                )}
                <button onClick={() => setNfViewer(null)}
                  style={{ padding: "8px 20px", background: "var(--bg-page)", color: "var(--text-2)", border: "0.5px solid var(--border)", borderRadius: 8, fontWeight: 600, fontSize: 13, cursor: "pointer" }}>
                  Fechar
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ══════════════════════════════════════════════════════
          WIZARD MODAL
      ══════════════════════════════════════════════════════ */}
      {wizard && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(11,45,80,0.32)", display: "flex", alignItems: "flex-start", justifyContent: "center", zIndex:2000, overflowY: "auto", padding: "24px 0" }}>
          <div style={{ background: "var(--bg-card)", borderRadius: 14, width: "100%", maxWidth: 1140, margin: "0 20px", boxShadow: "0 4px 20px rgba(11,45,80,0.10)" }}>

            {/* Cabeçalho modal */}
            <div style={{ padding: "20px 24px 16px", borderBottom: "0.5px solid var(--bg-tag)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div>
                <div style={{ fontSize: 16, fontWeight: 700, color: "var(--text-1)" }}>
                  {nfEdit ? `NF ${nfEdit.numero}/${nfEdit.serie}` : "Nova NF de Compra"}
                </div>
                <div style={{ fontSize: 12, color: "var(--text-3)", marginTop: 2 }}>
                  {etapa === "origem" ? "Passo 1 — Origem" : etapa === "cabecalho" ? "Passo 2 — Cabeçalho" : "Passo 3 — Itens & Processamento"}
                </div>
              </div>
              {/* Stepper */}
              <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                {(["origem", "cabecalho", "itens"] as Etapa[]).map((e, i) => (
                  <div key={e} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <div style={{ width: 26, height: 26, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, background: etapa === e ? "#1A5C38" : etapa > e ? "#E8E8E8" : "var(--bg-page)", color: etapa === e ? "#fff" : etapa > e ? "#111111" : "var(--text-muted)" }}>
                      {i + 1}
                    </div>
                    {i < 2 && <div style={{ width: 20, height: 1, background: "var(--border-table)" }} />}
                  </div>
                ))}
              </div>
              <button onClick={() => setWizard(false)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 20, color: "var(--text-3)", lineHeight: 1 }}>×</button>
            </div>

            <div style={{ padding: "16px 20px" }}>
              {err && <div style={{ background: "#FCEBEB", border: "0.5px solid #F5C6C6", borderRadius: 8, padding: "8px 12px", fontSize: 13, color: "#791F1F", marginBottom: 12 }}>{err}</div>}

              {/* ─── ETAPA 1: ORIGEM ─────────────────────────── */}
              {etapa === "origem" && (
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text-1)", marginBottom: 16 }}>Como deseja lançar a nota fiscal?</div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 24 }}>
                    {([
                      { v: "manual", icon: "✏️", title: "Manual",           desc: "Digite os dados diretamente" },
                      { v: "xml",    icon: "📄", title: "XML",              desc: "Importe o arquivo XML da NF-e" },
                      { v: "leitor", icon: "▌▌ ▌▌▌▌", title: "Leitor de Chave", desc: "Escaneie o código de barras do DANFE ou digite a chave de acesso" },
                      { v: "sieg",   icon: "🔗", title: "Sieg / API",       desc: "Consulte pelo número de chave via integração Sieg" },
                    ] as { v: OrigEscolha; icon: string; title: string; desc: string }[]).map(({ v, icon, title, desc }) => (
                      <button
                        key={v}
                        onClick={() => { setOrig(v); setLeitorChave(""); setLeitorErro(null); if (v === "leitor") setTimeout(() => leitorRef.current?.focus(), 50); }}
                        style={{ padding: "20px 16px", border: `2px solid ${orig === v ? "#1A5C38" : "var(--border-table)"}`, borderRadius: 12, background: orig === v ? "#E8F5E9" : "var(--bg-card)", cursor: "pointer", textAlign: "center" }}
                      >
                        <div style={{ fontSize: v === "leitor" ? 18 : 28, marginBottom: 8, fontFamily: v === "leitor" ? "monospace" : "inherit", letterSpacing: v === "leitor" ? 2 : 0 }}>{icon}</div>
                        <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text-1)", marginBottom: 4 }}>{title}</div>
                        <div style={{ fontSize: 12, color: "#666" }}>{desc}</div>
                      </button>
                    ))}
                  </div>

                  {/* Upload XML */}
                  {orig === "xml" && (
                    <div style={{ background: "var(--bg-page)", borderRadius: 10, padding: 16, marginBottom: 16 }}>
                      <label style={lbl}>Arquivo XML da NF-e</label>
                      <input
                        ref={xmlInputRef} type="file" accept=".xml"
                        onChange={e => {
                          const f = e.target.files?.[0];
                          if (!f) return;
                          const reader = new FileReader();
                          reader.onload = ev => parsearXml(ev.target?.result as string);
                          reader.readAsText(f);
                        }}
                        style={{ display: "block", fontSize: 13 }}
                      />
                    </div>
                  )}

                  {/* Leitor de Chave de Acesso (código de barras → SEFAZ) */}
                  {orig === "leitor" && (
                    <div style={{ background: "var(--bg-page)", borderRadius: 10, padding: 16, marginBottom: 16 }}>
                      <label style={lbl}>Chave de Acesso — 44 dígitos</label>
                      <div style={{ fontSize: 11, color: "var(--text-3)", marginBottom: 10 }}>
                        Aponte o leitor de código de barras para o DANFE. O sistema consulta a SEFAZ automaticamente ao completar os 44 dígitos.
                      </div>
                      <div style={{ position: "relative" }}>
                        <input
                          ref={leitorRef}
                          value={leitorChave.replace(/(\d{9})(?=\d)/g, "$1 ").replace(/(\d{8})\s(\d{9})(?=\d)/g, "$1 $2 ").trim()}
                          onChange={e => {
                            const digits = e.target.value.replace(/\D/g, "").substring(0, 44);
                            setLeitorChave(digits);
                            setLeitorErro(null);
                            if (digits.length === 44) {
                              setLeitorLoading(true);
                              fetch("/api/nfe/xml-por-chave", {
                                method: "POST",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({ fazendaId, chaveAcesso: digits }),
                              }).then(r => r.json()).then(json => {
                                if (!json.ok || !json.xmlCompleto) { setLeitorErro(json.erro ?? "Não foi possível obter o XML da SEFAZ."); return; }
                                parsearXml(json.xmlCompleto);
                                setOrig("xml"); // após parsear, exibe feedback do modo XML
                              }).catch(() => setLeitorErro("Erro de rede ao consultar a SEFAZ."))
                                .finally(() => setLeitorLoading(false));
                            }
                          }}
                          onPaste={e => {
                            const digits = e.clipboardData.getData("text").replace(/\D/g, "").substring(0, 44);
                            if (digits.length === 44) {
                              e.preventDefault();
                              setLeitorChave(digits);
                              setLeitorErro(null);
                              setLeitorLoading(true);
                              fetch("/api/nfe/xml-por-chave", {
                                method: "POST",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({ fazendaId, chaveAcesso: digits }),
                              }).then(r => r.json()).then(json => {
                                if (!json.ok || !json.xmlCompleto) { setLeitorErro(json.erro ?? "Não foi possível obter o XML."); return; }
                                parsearXml(json.xmlCompleto);
                                setOrig("xml");
                              }).catch(() => setLeitorErro("Erro de rede ao consultar a SEFAZ."))
                                .finally(() => setLeitorLoading(false));
                            }
                          }}
                          disabled={leitorLoading}
                          placeholder="Posicione o cursor aqui e escaneie o código de barras…"
                          style={{ ...inp, fontFamily: "monospace", fontSize: 14, letterSpacing: "0.06em", paddingRight: 110 }}
                          autoComplete="off"
                          autoFocus
                        />
                        <span style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", fontSize: 11, color: leitorChave.length === 44 ? "#16A34A" : "#888" }}>
                          {leitorLoading ? "Consultando SEFAZ…" : `${leitorChave.length}/44`}
                        </span>
                      </div>
                      {/* Barra de progresso */}
                      <div style={{ marginTop: 6, height: 3, background: "#EEE", borderRadius: 2, overflow: "hidden" }}>
                        <div style={{ height: "100%", width: `${(leitorChave.length / 44) * 100}%`, background: leitorChave.length === 44 ? "#16A34A" : "#1A4870", transition: "width 0.1s" }} />
                      </div>
                      {leitorErro && (
                        <div style={{ marginTop: 10, padding: "9px 12px", background: "#FCEBEB", border: "0.5px solid #F5C6C6", borderRadius: 8, fontSize: 12, color: "#E24B4A" }}>
                          {leitorErro}
                          {leitorErro.includes("Certificado") && (
                            <div style={{ marginTop: 4, color: "#555" }}>Configure o certificado A1 em <strong>Configurações → Parâmetros do Sistema → Fiscal</strong>.</div>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Sieg */}
                  {orig === "sieg" && (
                    <div style={{ background: "var(--bg-page)", borderRadius: 10, padding: 16, marginBottom: 16 }}>
                      <label style={lbl}>Chave de Acesso (44 dígitos)</label>
                      <div style={{ display: "flex", gap: 10 }}>
                        <input
                          value={siegChave} onChange={e => setSiegChave(e.target.value.replace(/\D/g, ""))}
                          placeholder="00000000000000000000000000000000000000000000"
                          maxLength={44} style={{ ...inp, flex: 1, fontFamily: "monospace", fontSize: 12 }}
                        />
                        <button onClick={buscarSieg} disabled={siegLoading} style={{ ...btnV, whiteSpace: "nowrap" }}>
                          {siegLoading ? "Buscando…" : "Consultar"}
                        </button>
                      </div>
                      <div style={{ fontSize: 11, color: "var(--text-3)", marginTop: 6 }}>
                        Integração com Sieg, Arquivei ou qualquer gestor fiscal via API /api/sieg
                      </div>
                    </div>
                  )}

                  {/* Tipo de entrada */}
                  <div style={{ marginBottom: 24 }}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text-1)", marginBottom: 12 }}>Tipo de entrada</div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                      {(Object.entries(TIPO_LABELS) as [TipoEntrada, typeof TIPO_LABELS[TipoEntrada]][]).map(([v, meta]) => (
                        <button
                          key={v}
                          onClick={() => setTipo(v)}
                          style={{ padding: "14px 16px", border: `2px solid ${tipo === v ? "#111111" : "var(--border-table)"}`, borderRadius: 10, background: tipo === v ? meta.cor : "var(--bg-card)", cursor: "pointer", textAlign: "left" }}
                        >
                          <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text-1)", marginBottom: 4 }}>{meta.label}</div>
                          <div style={{ fontSize: 11, color: "var(--text-2)", lineHeight: 1.5 }}>{meta.desc}</div>
                        </button>
                      ))}
                    </div>
                  </div>

                  <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
                    <button style={btnR} onClick={() => setWizard(false)}>Cancelar</button>
                    <button style={btnV} onClick={() => setEtapa("cabecalho")}>Próximo →</button>
                  </div>
                </div>
              )}

              {/* ─── ETAPA 2: CABEÇALHO ──────────────────────── */}
              {etapa === "cabecalho" && (
                <div>

                  {/* ── Vínculo com Pedido de Compra — ao topo ── */}
                  <div style={{ background: cab.pedido_compra_id ? "#E8F5E9" : "var(--bg-page)", border: `0.5px solid ${cab.pedido_compra_id ? "#86EFAC" : "var(--border-table)"}`, borderRadius: 10, padding: "10px 14px", marginBottom: 14 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: cab.pedido_compra_id ? 8 : 0 }}>
                      <span style={{ fontSize: 12, fontWeight: 600, color: cab.pedido_compra_id ? "#1A6B3C" : "var(--text-1)" }}>
                        {cab.pedido_compra_id ? "✓ Vinculado ao Pedido de Compra" : "Vincular a um Pedido de Compra"}
                      </span>
                      <span style={{ fontSize: 11, color: "var(--text-3)" }}>{cab.pedido_compra_id ? "" : "— opcional. Ao selecionar, os campos serão preenchidos automaticamente."}</span>
                    </div>
                    <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                      <select
                        value={cab.pedido_compra_id}
                        onChange={e => onPedidoChange(e.target.value)}
                        style={{ ...inp, flex: 1, background: cab.pedido_compra_id ? "#F0FDF4" : "var(--bg-input)", fontWeight: cab.pedido_compra_id ? 600 : 400, color: cab.pedido_compra_id ? "#166534" : "var(--text-1)" }}
                      >
                        <option value="">— Sem pedido vinculado —</option>
                        {wPedidos.filter(p => {
                          // Filtra pedidos pelo CNPJ do emitente desta NF
                          if (!cab.emitente_cnpj) return true;
                          const cnpjNf = cab.emitente_cnpj.replace(/\D/g, "");
                          if (!cnpjNf) return true;
                          const fornCnpj = pessoas.find(x => x.id === p.fornecedor_id)?.cpf_cnpj?.replace(/\D/g, "") ?? "";
                          return !fornCnpj || fornCnpj === cnpjNf;
                        }).map(p => {
                          const forn = pessoas.find(x => x.id === p.fornecedor_id)?.nome ?? p.contato_fornecedor ?? "—";
                          const nr = p.nr_pedido ?? p.numero ?? p.id.substring(0, 8);
                          return <option key={p.id} value={p.id}>{forn} — PC {nr} ({p.status})</option>;
                        })}
                      </select>
                      {cab.pedido_compra_id && (
                        <button onClick={() => onPedidoChange("")} style={{ padding: "7px 12px", borderRadius: 7, border: "0.5px solid #86EFAC", background: "transparent", color: "#166534", cursor: "pointer", fontSize: 11, whiteSpace: "nowrap" as const }}>
                          ✕ Desvincular
                        </button>
                      )}
                    </div>
                    {cab.pedido_compra_id && (
                      <div style={{ marginTop: 8, fontSize: 11, color: "#1A6B3C", display: "flex", gap: 14 }}>
                        {cab.emitente_nome && <span>Fornecedor: <strong>{cab.emitente_nome}</strong></span>}
                        {cab.ano_safra_id && <span>Safra: <strong>{anosSafra.find(a => a.id === cab.ano_safra_id)?.descricao}</strong></span>}
                        {cab.data_vencimento_cp && <span>Vencimento: <strong>{fmtData(cab.data_vencimento_cp)}</strong></span>}
                      </div>
                    )}
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 10 }}>
                    <div>
                      <label style={lbl}>Número da NF *</label>
                      <input value={cab.numero} onChange={e => setCab(p=>({...p,numero:e.target.value}))} style={inp} />
                    </div>
                    <div>
                      <label style={lbl}>Série</label>
                      <input value={cab.serie} onChange={e => setCab(p=>({...p,serie:e.target.value}))} style={inp} />
                    </div>
                    <div>
                      <label style={lbl}>CFOP</label>
                      <input
                        value={cab.cfop}
                        onChange={e => setCab(p=>({...p,cfop:e.target.value}))}
                        onBlur={e => {
                          const cfop = e.target.value.trim();
                          const nat = CFOP_NATUREZA[cfop];
                          if (nat && !cab.natureza) setCab(p => ({ ...p, natureza: nat }));
                        }}
                        placeholder="1101, 2101…"
                        style={inp}
                      />
                    </div>
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 14 }}>
                    <div>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 3 }}>
                        <label style={{ ...lbl, marginBottom: 0 }}>Emitente (Fornecedor) *</label>
                        {!cab.pessoa_id && cab.emitente_nome && (
                          <button
                            disabled={savingForn}
                            onClick={async () => {
                              if (!fazendaId || !cab.emitente_nome) return;
                              setSavingForn(true);
                              try {
                                const nova = await criarPessoa({
                                  fazenda_id: fazendaId,
                                  nome:       cab.emitente_nome,
                                  tipo:       "pj",
                                  cliente:    false,
                                  fornecedor: true,
                                  cpf_cnpj:   cab.emitente_cnpj || undefined,
                                  municipio:  cab.emitente_municipio || undefined,
                                  estado:     cab.emitente_estado   || undefined,
                                });
                                await carregar();
                                setCab(p => ({ ...p, pessoa_id: nova.id }));
                              } catch (e) {
                                alert("Erro ao cadastrar fornecedor: " + (e instanceof Error ? e.message : e));
                              } finally {
                                setSavingForn(false);
                              }
                            }}
                            style={{ fontSize: 10, padding: "2px 9px", borderRadius: 6, border: "0.5px solid #111111", background: "#E8E8E8", color: "#0D0D0D", cursor: "pointer", fontWeight: 600, whiteSpace: "nowrap" as const }}
                          >
                            {savingForn ? "…" : "+ Cadastrar"}
                          </button>
                        )}
                      </div>
                      {/* Dropdown customizado — nome e CNPJ em colunas separadas */}
                      <div style={{ position: "relative" }} onBlur={e => { if (!e.currentTarget.contains(e.relatedTarget as Node)) { setPessoaDropOpen(false); setPessoaBusca(""); } }}>
                        <div
                          tabIndex={0}
                          onClick={() => { setPessoaDropOpen(o => !o); setPessoaBusca(""); }}
                          style={{ ...inp, display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer", userSelect: "none" as const }}
                        >
                          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: cab.pessoa_id ? "var(--text-1)" : "var(--text-3)" }}>
                            {cab.pessoa_id ? (pessoas.find(p => p.id === cab.pessoa_id)?.nome ?? "Selecionar…") : "Selecionar do cadastro…"}
                          </span>
                          <span style={{ fontSize: 10, marginLeft: 6, color: "var(--text-3)", flexShrink: 0 }}>▾</span>
                        </div>
                        {pessoaDropOpen && (
                          <div style={{ position: "absolute", top: "calc(100% + 2px)", left: 0, right: 0, zIndex: 900, background: "var(--bg-card)", border: "0.5px solid var(--border-table)", borderRadius: 8, boxShadow: "0 6px 24px rgba(0,0,0,0.14)", overflow: "hidden" }}>
                            <div style={{ padding: "6px 8px", borderBottom: "0.5px solid var(--border-table)" }}>
                              <input
                                autoFocus
                                placeholder="Buscar por nome ou CNPJ/CPF…"
                                value={pessoaBusca}
                                onChange={e => setPessoaBusca(e.target.value)}
                                style={{ width: "100%", border: "none", outline: "none", fontSize: 12, background: "transparent", color: "var(--text-1)", boxSizing: "border-box" as const }}
                              />
                            </div>
                            <div style={{ maxHeight: 240, overflowY: "auto" }}>
                              <div
                                onMouseDown={e => e.preventDefault()}
                                onClick={() => { onPessoaChange(""); setPessoaDropOpen(false); setPessoaBusca(""); }}
                                style={{ display: "grid", gridTemplateColumns: "1fr 160px", gap: 0, padding: "7px 10px", cursor: "pointer", fontSize: 12, color: "var(--text-3)", borderBottom: "0.5px solid var(--border-table)" }}
                              >
                                <span>— Nenhum —</span><span />
                              </div>
                              {/* Cabeçalho das colunas */}
                              <div style={{ display: "grid", gridTemplateColumns: "1fr 160px", padding: "4px 10px", background: "var(--bg-page)", borderBottom: "0.5px solid var(--border-table)" }}>
                                <span style={{ fontSize: 10, fontWeight: 700, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.04em" }}>Nome</span>
                                <span style={{ fontSize: 10, fontWeight: 700, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.04em" }}>CNPJ / CPF</span>
                              </div>
                              {pessoas
                                .filter(p => {
                                  if (!pessoaBusca) return true;
                                  const q = pessoaBusca.toLowerCase();
                                  return p.nome.toLowerCase().includes(q) || (p.cpf_cnpj ?? "").replace(/\D/g, "").includes(q.replace(/\D/g, ""));
                                })
                                .map(p => (
                                  <div
                                    key={p.id}
                                    onMouseDown={e => e.preventDefault()}
                                    onClick={() => { onPessoaChange(p.id); setPessoaDropOpen(false); setPessoaBusca(""); }}
                                    style={{ display: "grid", gridTemplateColumns: "1fr 160px", padding: "7px 10px", cursor: "pointer", fontSize: 12, borderBottom: "0.5px solid var(--bg-page)", background: p.id === cab.pessoa_id ? "var(--bg-tag)" : undefined }}
                                  >
                                    <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "var(--text-1)", fontWeight: p.id === cab.pessoa_id ? 600 : 400 }}>
                                      {p.id === cab.pessoa_id && "✓ "}{p.nome}
                                    </span>
                                    <span style={{ fontFamily: "monospace", fontSize: 11, color: "var(--text-2)", whiteSpace: "nowrap" }}>
                                      {p.cpf_cnpj ?? "—"}
                                    </span>
                                  </div>
                                ))
                              }
                              {pessoas.filter(p => {
                                if (!pessoaBusca) return true;
                                const q = pessoaBusca.toLowerCase();
                                return p.nome.toLowerCase().includes(q) || (p.cpf_cnpj ?? "").replace(/\D/g,"").includes(q.replace(/\D/g,""));
                              }).length === 0 && (
                                <div style={{ padding: "12px 10px", fontSize: 12, color: "var(--text-3)", textAlign: "center" }}>Nenhum resultado</div>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                    <div>
                      <label style={lbl}>Nome do emitente *</label>
                      <input value={cab.emitente_nome} onChange={e => setCab(p=>({...p,emitente_nome:e.target.value}))} style={inp} />
                    </div>
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14, marginBottom: 14 }}>
                    <div>
                      <label style={lbl}>CNPJ do Emitente</label>
                      <input
                        value={cab.emitente_cnpj}
                        onChange={e => setCab(p => ({ ...p, emitente_cnpj: e.target.value }))}
                        onBlur={e => {
                          // Classificação automática + match de fornecedor ao sair do campo CNPJ
                          const cnpj = e.target.value;
                          const pessoaId = pessoaPorCnpj(cnpj);
                          const regra = aplicarRegraClassificacao(regrasClass, cnpj, cab.emitente_nome, "", "", "");
                          setCab(p => ({
                            ...p,
                            pessoa_id: pessoaId || p.pessoa_id,
                            ...(regra ? {
                              operacao_gerencial_id: regra.operacao_gerencial_id ?? p.operacao_gerencial_id,
                              centro_custo_id:       regra.centro_custo_id       ?? p.centro_custo_id,
                            } : {}),
                          }));
                          if (regra) setSugestaoNome(regra.nome);
                        }}
                        placeholder="00.000.000/0001-00"
                        style={inp}
                      />
                    </div>
                    <div>
                      <label style={lbl}>Data de Emissão *</label>
                      <input type="date" value={cab.data_emissao} onChange={e => setCab(p=>({...p,data_emissao:e.target.value}))} style={inp} />
                    </div>
                    <div>
                      <label style={lbl}>Data de Entrada</label>
                      <input type="date" value={cab.data_entrada} onChange={e => setCab(p=>({...p,data_entrada:e.target.value}))} style={inp} />
                    </div>
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 14 }}>
                    <div>
                      <label style={lbl}>Valor Produtos (R$) *</label>
                      <input value={cab.valor_total} onChange={e => setCab(p=>({...p,valor_total:e.target.value}))} placeholder="0,00" style={inp} />
                    </div>
                    <div>
                      <label style={lbl}>Natureza da Operação</label>
                      <input value={cab.natureza} onChange={e => setCab(p=>({...p,natureza:e.target.value}))} style={inp} />
                    </div>
                  </div>

                  {/* ── Impostos adicionados ao total ── */}
                  <div style={{ background: "#FFFBEB", border: "0.5px solid #FCD34D", borderRadius: 10, padding: 14, marginBottom: 14 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: "#92400E", marginBottom: 10 }}>
                      Impostos Adicionados ao Total
                      <span style={{ fontWeight: 400, color: "var(--text-3)", marginLeft: 8 }}>Deixe em branco se não houver</span>
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 10 }}>
                      {([
                        ["IPI",    "valor_ipi",     "Imp. Produtos Industrializados"],
                        ["ST",     "valor_st",      "Substituição Tributária ICMS"],
                        ["FCP-ST", "valor_fcp_st",  "Fundo de Combate à Pobreza"],
                        ["DIFAL",  "valor_difal",   "Diferencial de Alíquota"],
                        ["Desconto","valor_desconto","Desconto (−)"],
                      ] as [string, keyof typeof cab, string][]).map(([label, field, tooltip]) => (
                        <div key={field} title={tooltip}>
                          <label style={{ ...lbl, color: "#92400E" }}>{label}</label>
                          <input value={String((cab as Record<string, unknown>)[field] ?? "")} onChange={e => setCab(p=>({...p,[field]:e.target.value}))} placeholder="0,00" style={{ ...inp, borderColor: "#FCD34D" }} />
                        </div>
                      ))}
                    </div>
                    {(() => {
                      const vProd   = parseFloat(cab.valor_total)   || 0;
                      const vIpi    = parseFloat(cab.valor_ipi)      || 0;
                      const vSt     = parseFloat(cab.valor_st)       || 0;
                      const vFcp    = parseFloat(cab.valor_fcp_st)   || 0;
                      const vDifal  = parseFloat(cab.valor_difal)    || 0;
                      const vDesc   = parseFloat(cab.valor_desconto) || 0;
                      const total   = vProd + vIpi + vSt + vFcp + vDifal - vDesc;
                      const temExtra = vIpi + vSt + vFcp + vDifal + vDesc > 0;
                      if (!temExtra) return null;
                      return (
                        <div style={{ marginTop: 12, paddingTop: 10, borderTop: "0.5px solid #FCD34D", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                          <div style={{ fontSize: 12, color: "#92400E" }}>
                            Produtos {vProd.toLocaleString("pt-BR",{style:"currency",currency:"BRL"})}
                            {vIpi   > 0 && ` + IPI ${vIpi.toLocaleString("pt-BR",{style:"currency",currency:"BRL"})}`}
                            {vSt    > 0 && ` + ST ${vSt.toLocaleString("pt-BR",{style:"currency",currency:"BRL"})}`}
                            {vFcp   > 0 && ` + FCP-ST ${vFcp.toLocaleString("pt-BR",{style:"currency",currency:"BRL"})}`}
                            {vDifal > 0 && ` + DIFAL ${vDifal.toLocaleString("pt-BR",{style:"currency",currency:"BRL"})}`}
                            {vDesc  > 0 && ` − Desconto ${vDesc.toLocaleString("pt-BR",{style:"currency",currency:"BRL"})}`}
                          </div>
                          <div style={{ fontSize: 15, fontWeight: 700, color: "#92400E" }}>
                            = Total {total.toLocaleString("pt-BR",{style:"currency",currency:"BRL"})}
                          </div>
                        </div>
                      );
                    })()}
                  </div>

                  <div style={{ background: "var(--bg-page)", borderRadius: 10, padding: "10px 12px", marginBottom: 10 }}>
                    <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-1)", marginBottom: 8 }}>Pagamento e Classificação</div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                      <div>
                        <label style={lbl}>Forma de Pagamento</label>
                        <select value={cab.forma_pagamento} onChange={e => setCab(p => ({ ...p, forma_pagamento: e.target.value }))} style={inp}>
                          <option value="">— selecionar —</option>
                          <option value="a_vista">À Vista</option>
                          <option value="prazo_boleto">A Prazo — Boleto</option>
                          <option value="prazo_pix">A Prazo — PIX</option>
                          <option value="prazo_debito">A Prazo — Débito em Conta</option>
                          <option value="prazo_cheque">A Prazo — Cheque</option>
                          <option value="barter">Barter (troca por grãos)</option>
                          <option value="financiamento">Financiamento</option>
                          <option value="outros">Outros</option>
                        </select>
                      </div>
                      <div>
                        <label style={lbl}>Vencimento da CP</label>
                        <input type="date" value={cab.data_vencimento_cp} onChange={e => setCab(p=>({...p,data_vencimento_cp:e.target.value}))} style={inp} />
                      </div>
                      <div>
                        <label style={lbl}>Ano Safra</label>
                        <select value={cab.ano_safra_id} onChange={e => setCab(p=>({...p, ano_safra_id: e.target.value, ciclo_id: ""}))} style={inp}>
                          <option value="">— nenhum —</option>
                          {anosSafra.map(a => <option key={a.id} value={a.id}>{a.descricao}</option>)}
                        </select>
                      </div>
                      <div>
                        <label style={lbl}>Operação Gerencial</label>
                        <SelectBusca
                          value={cab.operacao_gerencial_id}
                          onChange={id => setCab(p => ({ ...p, operacao_gerencial_id: id }))}
                          options={reclassOps.map(o => ({ value: o.id, label: `${o.classificacao ? `${o.classificacao} — ` : ""}${o.descricao}`, group: (o.classificacao ?? "").split(".").slice(0, 3).join(".") || undefined }))}
                          placeholder="— nenhuma —"
                          style={inp}
                        />
                      </div>
                      {/* Rateio nos centros de custos */}
                      <div style={{ gridColumn: "1 / -1" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: ccMode !== "nenhum" ? 10 : 0 }}>
                          <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", userSelect: "none" as const }}>
                            <input type="checkbox" checked={ccMode !== "nenhum"} onChange={e => { setCcMode(e.target.checked ? "global" : "nenhum"); if (!e.target.checked) { setCab(p=>({...p,centro_custo_id:""})); setCcGlobalMaquinaId(""); } }} />
                            <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text-1)" }}>Ratear nos centros de custos?</span>
                          </label>
                          {sugestaoNome && ccMode === "nenhum" && (
                            <span style={{ fontSize: 10, background: "#DCFCE7", color: "#166534", padding: "1px 7px", borderRadius: 10, fontWeight: 600 }}>✦ {sugestaoNome}</span>
                          )}
                        </div>
                        {ccMode !== "nenhum" && (
                          <div style={{ background: "#F6F9FF", border: "0.5px solid #B8D4F0", borderRadius: 10, padding: "12px 14px" }}>
                            {/* Toggle Global vs Por produto */}
                            <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
                              {(["global", "por_produto"] as const).map(m => (
                                <button key={m} onClick={() => setCcMode(m)}
                                  style={{ padding: "5px 14px", borderRadius: 8, border: `0.5px solid ${ccMode === m ? "#1A4870" : "var(--border-table)"}`, background: ccMode === m ? "#1A4870" : "var(--bg-card)", color: ccMode === m ? "#fff" : "var(--text-1)", cursor: "pointer", fontSize: 12, fontWeight: 600 }}>
                                  {m === "global" ? "Global — um único CC para toda a NF" : "Por produto — CC individual por item"}
                                </button>
                              ))}
                            </div>
                            {ccMode === "global" && (
                              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                                <div>
                                  <label style={{ ...lbl, marginBottom: 3 }}>Centro de Custo{sugestaoNome && <span style={{ marginLeft: 6, fontSize: 10, background: "#DCFCE7", color: "#166534", padding: "1px 7px", borderRadius: 10, fontWeight: 600 }}>✦ {sugestaoNome}</span>}</label>
                                  <select value={cab.centro_custo_id} onChange={e => { setSugestaoNome(null); setCab(p=>({...p,centro_custo_id:e.target.value})); setCcGlobalMaquinaId(""); }} style={inp}>
                                    <option value="">— selecionar CC —</option>
                                    {ccOpts.filter(c => !ccOpts.some(x => x.parent_id === c.id)).map(c => <option key={c.id} value={c.id}>{c.manutencao_maquinas ? "🔧 " : ""}{c.codigo ? `${c.codigo} — ` : ""}{c.nome}</option>)}
                                  </select>
                                </div>
                                {ccManutencao(cab.centro_custo_id) && (
                                  <div>
                                    <label style={lbl}>Máquina (manutenção)</label>
                                    <select value={ccGlobalMaquinaId} onChange={e => setCcGlobalMaquinaId(e.target.value)} style={{ ...inp, background: "#FBF0D8", border: "0.5px solid #F6C87A" }}>
                                      <option value="">🔧 Selecionar máquina</option>
                                      {maquinas.map(m => <option key={m.id} value={m.id}>{m.nome}</option>)}
                                    </select>
                                  </div>
                                )}
                              </div>
                            )}
                            {ccMode === "por_produto" && (
                              <div style={{ fontSize: 11, color: "var(--text-2)" }}>Atribua o centro de custo individualmente em cada produto da NF abaixo.</div>
                            )}
                          </div>
                        )}
                      </div>
                      <div>
                        <label style={lbl}>Ciclo</label>
                        <select value={cab.ciclo_id} onChange={e => setCab(p=>({...p, ciclo_id: e.target.value}))} style={inp} disabled={!cab.ano_safra_id}>
                          <option value="">— selecione o ano safra —</option>
                          {ciclosNF.map(c => <option key={c.id} value={c.id}>{c.cultura} {c.descricao ? `— ${c.descricao}` : ""}</option>)}
                        </select>
                      </div>
                      {wProdutores.length > 0 && (
                        <div>
                          <label style={lbl}>Produtor *</label>
                          <select value={cab.produtor_id} onChange={e => setCab(p=>({...p, produtor_id: e.target.value, ie_produtor: ""}))} style={inp}>
                            <option value="">— selecionar —</option>
                            {wProdutores.map(p => <option key={p.id} value={p.id}>{p.nome}{p.cpf_cnpj ? ` — ${p.cpf_cnpj}` : ""}</option>)}
                          </select>
                        </div>
                      )}
                      {cab.produtor_id && (
                        <div>
                          <label style={lbl}>I.E. do Produtor</label>
                          {iesProdutor.length === 0 ? (
                            <input value={cab.ie_produtor} onChange={e => setCab(p => ({ ...p, ie_produtor: e.target.value }))} style={inp} placeholder="Sem IE cadastrada — digite manualmente" />
                          ) : (
                            <select value={cab.ie_produtor} onChange={e => setCab(p => ({ ...p, ie_produtor: e.target.value }))} style={inp}>
                              <option value="">— selecionar IE —</option>
                              {iesProdutor.map(ie => (
                                <option key={ie.id} value={ie.inscricao_estadual}>
                                  {ie.inscricao_estadual}{ie.estado ? ` — ${ie.estado}` : ""}{ie.municipio ? ` / ${ie.municipio}` : ""}
                                </option>
                              ))}
                            </select>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Campos específicos por tipo */}
                  {tipo === "remessa" && (
                    <div style={{ background: "#E6F1FB30", border: "0.5px solid #93C5FD", borderRadius: 10, padding: 14, marginBottom: 14 }}>
                      <div style={{ fontSize: 12, fontWeight: 600, color: "#0C447C", marginBottom: 10 }}>Remessa — Depósito Operacional de Destino</div>
                      <div>
                        <label style={lbl}>Depósito de destino (onde o insumo será armazenado)</label>
                        <select value={cab.deposito_destino_id} onChange={e => setCab(p=>({...p,deposito_destino_id:e.target.value}))} style={inp}>
                          <option value="">Selecionar depósito…</option>
                          {wDepositos.filter(d => !["terceiro","armazem_terceiro"].includes(d.tipo)).map(d => (
                            <option key={d.id} value={d.id}>{d.nome} — {d.tipo}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                  )}

                  {tipo === "vef" && (
                    <div style={{ background: "#FAEEDA50", border: "0.5px solid #F6C87A", borderRadius: 10, padding: 14, marginBottom: 14 }}>
                      <div style={{ fontSize: 12, fontWeight: 600, color: "#633806", marginBottom: 6 }}>VEF — Entrega Futura</div>
                      <div style={{ fontSize: 12, color: "#7A5A12" }}>
                        Um depósito de terceiro será criado automaticamente em nome do emitente ({cab.emitente_nome || "fornecedor"}).
                        Os itens ficarão com saldo em terceiro até a NF de Remessa/Entrega ser lançada.
                      </div>
                    </div>
                  )}

                  {tipo === "custo_direto" && (
                    <div style={{ background: "#E8F5E950", border: "0.5px solid #86EFAC", borderRadius: 10, padding: 14, marginBottom: 14 }}>
                      <div style={{ fontSize: 12, fontWeight: 600, color: "#1A6B3C", marginBottom: 6 }}>Apropriação Direta — sem movimentação de estoque</div>
                      <div style={{ fontSize: 12, color: "#166534" }}>
                        Cada item desta NF será apropriado diretamente a um centro de custo. Nenhum produto será lançado no estoque.
                        Ideal para NFs de mercado, energia, combustível externo, serviços, fretes e demais despesas operacionais.
                      </div>
                    </div>
                  )}

                  <div style={{ marginBottom: 8 }}>
                    <label style={lbl}>Chave de Acesso NF-e (44 dígitos)</label>
                    <input value={cab.chave_acesso} onChange={e => setCab(p=>({...p,chave_acesso:e.target.value.replace(/\D/g,"")}))} maxLength={44} placeholder="Opcional — para rastreabilidade" style={{ ...inp, fontFamily: "monospace", fontSize: 12 }} />
                  </div>

                  {/* ── Classificação Contábil / LCDPR ── */}
                  <div style={{ background: "var(--bg-page)", border: "0.5px solid var(--border)", borderRadius: 8, padding: "8px 12px", marginBottom: 8 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: "#111111", marginBottom: 7, textTransform: "uppercase" as const, letterSpacing: "0.05em" }}>
                      Classificação Contábil / LCDPR
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px 12px" }}>
                      <div>
                        <label style={lbl}>Vínculo de Atividade</label>
                        <select style={inp} value={cab.vinculo_atividade} onChange={e => setCab(p => ({ ...p, vinculo_atividade: e.target.value as typeof cab.vinculo_atividade }))}>
                          <option value="rural">🌱 Atividade Rural (LCDPR)</option>
                          <option value="pessoa_fisica">👤 Pessoa Física (não rural)</option>
                          <option value="investimento">🏗 Investimento / Imobilizado</option>
                          <option value="nao_tributavel">— Não Tributável</option>
                        </select>
                      </div>
                      <div>
                        <label style={lbl}>Entidade Contábil</label>
                        <select style={inp} value={cab.entidade_contabil} onChange={e => setCab(p => ({ ...p, entidade_contabil: e.target.value as "pf" | "pj" }))}>
                          <option value="pf">PF — Produtor Rural (CPF)</option>
                          <option value="pj">PJ — Pessoa Jurídica (CNPJ)</option>
                        </select>
                      </div>
                    </div>
                  </div>

                  <div style={{ marginBottom: 8 }}>
                    <label style={lbl}>Observações</label>
                    <textarea value={cab.observacao} onChange={e => setCab(p=>({...p,observacao:e.target.value}))} rows={2} style={{ ...inp, resize: "vertical" }} />
                  </div>

                  <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                    <button style={btnR} onClick={() => setEtapa("origem")}>← Voltar</button>
                    <div style={{ display: "flex", gap: 10 }}>
                      <button style={btnR} onClick={() => setWizard(false)}>Cancelar</button>
                      <button style={btnV} onClick={async () => {
                        const nf = await salvarRascunho();
                        if (nf) setEtapa("itens");
                      }}>
                        Próximo: Itens →
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* ─── ETAPA 3: ITENS ──────────────────────────── */}
              {etapa === "itens" && (
                <div>
                  {/* Cabeçalho da etapa */}
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
                    <div>
                      <span style={{ fontSize: 14, fontWeight: 600, color: "var(--text-1)" }}>
                        {tipo === "insumos"      ? "Associação de produtos" :
                         tipo === "custo_direto" ? "Itens — Apropriação Direta" :
                         tipo === "vef"          ? "Itens da VEF"           : "Itens da remessa"}
                      </span>
                      {tipo === "insumos" && (
                        <div style={{ fontSize: 12, color: "var(--text-2)", marginTop: 2 }}>
                          Associe cada item da NF ao insumo correspondente no catálogo. Use o toggle "C. Custo" para itens que vão direto ao centro de custo sem entrar no estoque.
                        </div>
                      )}
                      {tipo === "custo_direto" && (
                        <div style={{ fontSize: 12, color: "var(--text-2)", marginTop: 2 }}>
                          Atribua cada item a um centro de custo. Nenhum insumo será lançado no estoque.
                        </div>
                      )}
                    </div>
                    <button
                      onClick={() => setItens(p => [...p, { ...ITEM_VAZIO(), tipo_apropiacao: tipoAprpDefault(tipo) }])}
                      style={{ padding: "6px 14px", border: "0.5px solid #1A5C38", borderRadius: 8, background: "transparent", cursor: "pointer", fontSize: 12, color: "#1A5C38", fontWeight: 600 }}
                    >
                      + Item
                    </button>
                  </div>

                  {/* Painel CC Global — visível para tipo insumos */}
                  {tipo === "insumos" && (
                    <div style={{ background: "#F6F9FF", border: "0.5px solid #B8D4F0", borderRadius: 10, padding: "10px 14px", marginBottom: 14 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                        <span style={{ fontSize: 11, fontWeight: 600, color: "var(--text-2)", whiteSpace: "nowrap" }}>Centro de Custo:</span>
                        {/* Modo toggles */}
                        <div style={{ display: "flex", gap: 4 }}>
                          {([["nenhum", "Sem CC"], ["global", "Global"], ["por_produto", "Por item"]] as const).map(([m, label]) => (
                            <button key={m} onClick={() => { setCcMode(m); if (m !== "global") setCab(p=>({...p,centro_custo_id:""})); }}
                              style={{ fontSize: 10, padding: "2px 9px", borderRadius: 6, border: `0.5px solid ${ccMode === m ? "#1A4870" : "var(--border-table)"}`, background: ccMode === m ? "#1A4870" : "var(--bg-card)", color: ccMode === m ? "#fff" : "var(--text-2)", cursor: "pointer", fontWeight: 600 }}>
                              {label}
                            </button>
                          ))}
                        </div>
                        {/* CC selector — visível no modo global */}
                        {ccMode === "global" && (
                          <>
                            <select value={cab.centro_custo_id}
                              onChange={e => { setSugestaoNome(null); setCab(p=>({...p,centro_custo_id:e.target.value})); setCcGlobalMaquinaId(""); }}
                              style={{ ...inp, fontSize: 12, padding: "4px 10px", minWidth: 200, flex: 1 }}>
                              <option value="">— selecionar CC —</option>
                              {ccOpts.filter(c => !ccOpts.some(x => x.parent_id === c.id)).map(c => (
                                <option key={c.id} value={c.id}>{c.manutencao_maquinas ? "🔧 " : ""}{c.codigo ? `${c.codigo} — ` : ""}{c.nome}</option>
                              ))}
                            </select>
                            {ccManutencao(cab.centro_custo_id) && (
                              <select value={ccGlobalMaquinaId} onChange={e => setCcGlobalMaquinaId(e.target.value)}
                                style={{ ...inp, fontSize: 12, padding: "4px 10px", background: "#FBF0D8", border: "0.5px solid #F6C87A" }}>
                                <option value="">🔧 Máquina (opcional)</option>
                                {maquinas.map(m => <option key={m.id} value={m.id}>{m.nome}</option>)}
                              </select>
                            )}
                          </>
                        )}
                        {ccMode === "por_produto" && (
                          <span style={{ fontSize: 11, color: "var(--text-2)" }}>Use <strong>📦 Estoque</strong> / <strong>💸 C. Custo</strong> em cada item abaixo.</span>
                        )}
                        {ccMode === "nenhum" && sugestaoNome && (
                          <span style={{ fontSize: 10, background: "#DCFCE7", color: "#166534", padding: "1px 7px", borderRadius: 10, fontWeight: 600 }}>✦ {sugestaoNome}</span>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Grid de itens */}
                  <div style={{ border: "0.5px solid var(--border-table)", borderRadius: 10, overflow: "hidden", marginBottom: 16 }}>
                    {/* Cabeçalho */}
                    <div style={{
                      display: "grid",
                      gridTemplateColumns: tipo === "insumos"
                        ? "3fr 68px 90px 90px 110px 180px 28px"
                        : tipo === "custo_direto"
                        ? "2fr 80px 90px 100px 110px 1.5fr 32px"
                        : "2fr 80px 90px 100px 110px 1.5fr 90px 32px",
                      gap: 0, background: "var(--bg-page)", borderBottom: "0.5px solid var(--border-table)"
                    }}>
                      {(tipo === "insumos"
                        ? ["Descrição NF / Catálogo", "Un. NF", "Qtd NF", "Vl. Unit.", "Vl. Total", "Conversão de Unidade", ""]
                        : tipo === "custo_direto"
                        ? ["Descrição", "Unidade", "Quantidade", "Vl. Unit.", "Vl. Total", "Centro de Custo", ""]
                        : ["Descrição", "Unidade", "Quantidade", "Vl. Unit.", "Vl. Total", "Centro Custo", "Apropriação", ""]
                      ).map((h, i) => (
                        <div key={i} style={{ padding: "7px 10px", fontSize: 10, fontWeight: 600, color: "var(--text-2)" }}>{h}</div>
                      ))}
                    </div>

                    {/* Linhas */}
                    {itens.map((it) => {
                      const conv      = getConversao(it.conversao_key);
                      const temConv   = !!conv;
                      const autoConv  = conv?.tipo === "auto";
                      const manualConv = conv?.tipo === "manual";
                      // Conversões disponíveis para a unidade NF deste item
                      const convOptions = TABELA_CONVERSAO.filter(
                        c => normUnidade(it.unidade_nf) === c.de
                      );
                      return (
                      <div key={it.key} style={{ borderBottom: "0.5px solid #F0F2F7" }}>
                        <div style={{
                          display: "grid",
                          gridTemplateColumns: tipo === "insumos"
                            ? "3fr 68px 90px 90px 110px 180px 28px"
                            : tipo === "custo_direto"
                            ? "2fr 80px 90px 100px 110px 1.5fr 32px"
                            : "2fr 80px 90px 100px 110px 1.5fr 90px 32px",
                          gap: 0, alignItems: "start"
                        }}>
                        {tipo === "insumos" ? (
                          <>
                            {/* Col 1 — Descrição NF + seletor de catálogo/CC integrado */}
                            <div style={{ padding: "7px 8px", display: "flex", flexDirection: "column", gap: 3 }}>
                              <input
                                value={it.descricao_nf}
                                onChange={e => setItem(it.key, { descricao_nf: e.target.value, pa_nome: undefined, pa_auto: false, principio_ativo_id: "", nome_comercial_ref: "" })}
                                onBlur={e => resolverItemPA(it.key, e.target.value)}
                                placeholder="Descrição na NF"
                                style={{ ...inp, fontSize: 12, padding: "5px 8px" }}
                              />
                              {it.pa_auto && it.pa_nome ? (
                                <div style={{ fontSize: 10, display: "flex", alignItems: "center", gap: 4, color: "#111111" }}>
                                  <span style={{ background: "#E8E8E8", padding: "1px 5px", borderRadius: 3, fontWeight: 600 }}>PA</span>
                                  <strong>{it.pa_nome}</strong>
                                  <span style={{ color: "#666" }}>← {it.nome_comercial_ref}</span>
                                </div>
                              ) : ccMode === "global" ? (
                                /* Global: mostra o CC herdado (read-only) */
                                <div style={{ padding: "3px 8px", background: "#F6F9FF", border: "0.5px solid #B8D4F0", borderRadius: 6, fontSize: 11 }}>
                                  {cab.centro_custo_id
                                    ? <span style={{ color: "var(--text-1)", fontWeight: 600 }}>{ccOpts.find(c => c.id === cab.centro_custo_id)?.nome ?? "—"}</span>
                                    : <span style={{ color: "var(--text-3)", fontStyle: "italic" }}>← definir CC acima</span>}
                                  {ccManutencao(cab.centro_custo_id) && ccGlobalMaquinaId && (
                                    <span style={{ fontSize: 10, color: "#7A5A12", marginLeft: 6 }}>
                                      🔧 {maquinas.find(m => m.id === ccGlobalMaquinaId)?.nome ?? "máquina"}
                                    </span>
                                  )}
                                </div>
                              ) : (ccMode === "por_produto") ? (
                                /* Por produto: toggle Estoque / C. Custo + campo correspondente */
                                <>
                                  <div style={{ display: "flex", gap: 2 }}>
                                    <button
                                      onClick={() => setItem(it.key, { tipo_apropiacao: "estoque", centro_custo_id: "" })}
                                      style={{ fontSize: 9, padding: "1px 7px", borderRadius: 4, border: `0.5px solid ${it.tipo_apropiacao === "direto" ? "var(--border-table)" : "#111111"}`, background: it.tipo_apropiacao === "direto" ? "#fff" : "#E8E8E8", color: it.tipo_apropiacao === "direto" ? "var(--text-3)" : "#111111", cursor: "pointer", fontWeight: 600 }}
                                    >📦 Estoque</button>
                                    <button
                                      onClick={() => setItem(it.key, { tipo_apropiacao: "direto", insumo_id: "", principio_ativo_id: "", nome_comercial_ref: "" })}
                                      style={{ fontSize: 9, padding: "1px 7px", borderRadius: 4, border: `0.5px solid ${it.tipo_apropiacao === "direto" ? "#1A6B3C" : "var(--border-table)"}`, background: it.tipo_apropiacao === "direto" ? "#E8F5E9" : "var(--bg-card)", color: it.tipo_apropiacao === "direto" ? "#1A6B3C" : "var(--text-3)", cursor: "pointer", fontWeight: 600 }}
                                    >💸 C. Custo</button>
                                  </div>
                                  {it.tipo_apropiacao === "direto" ? (
                                    <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                                      <select value={it.centro_custo_id} onChange={e => setItem(it.key, { centro_custo_id: e.target.value, maquina_id: "" })} style={{ ...inp, fontSize: 11, padding: "4px 8px" }}>
                                        <option value="">— selecionar CC —</option>
                                        {ccOpts.filter(c => !ccOpts.some(x => x.parent_id === c.id)).map(c => (
                                          <option key={c.id} value={c.id}>{c.manutencao_maquinas ? "🔧 " : ""}{c.codigo ? `${c.codigo} ` : ""}{c.nome}</option>
                                        ))}
                                      </select>
                                      {ccManutencao(it.centro_custo_id) && (
                                        <select value={it.maquina_id} onChange={e => setItem(it.key, { maquina_id: e.target.value })} style={{ ...inp, fontSize: 11, padding: "4px 8px", background: "#FBF0D8", border: "0.5px solid #F6C87A" }}>
                                          <option value="">🔧 Máquina (opcional)</option>
                                          {maquinas.map(m => <option key={m.id} value={m.id}>{m.nome}</option>)}
                                        </select>
                                      )}
                                    </div>
                                  ) : (
                                    <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                                      <select value={it.insumo_id} onChange={e => setItem(it.key, { insumo_id: e.target.value })} style={{ ...inp, fontSize: 11, padding: "4px 8px", flex: 1 }}>
                                        <option value="">— catálogo —</option>
                                        {insumos.map(i => <option key={i.id} value={i.id}>{i.nome} ({i.unidade})</option>)}
                                      </select>
                                      <button
                                        onClick={() => abrirNovoInsumo(it.key, it.descricao_nf)}
                                        title="Cadastrar novo produto"
                                        style={{ flexShrink: 0, width: 22, height: 22, borderRadius: 5, border: "0.5px solid #C9921B", background: "#FBF0D8", color: "#7A5A12", cursor: "pointer", fontSize: 14, lineHeight: 1, padding: 0, fontWeight: 700 }}
                                      >+</button>
                                    </div>
                                  )}
                                </>
                              ) : (
                                /* Sem CC (nenhum): só insumo do catálogo */
                                <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                                  <select value={it.insumo_id} onChange={e => setItem(it.key, { insumo_id: e.target.value })} style={{ ...inp, fontSize: 11, padding: "4px 8px", flex: 1 }}>
                                    <option value="">— catálogo —</option>
                                    {insumos.map(i => <option key={i.id} value={i.id}>{i.nome} ({i.unidade})</option>)}
                                  </select>
                                  <button
                                    onClick={() => abrirNovoInsumo(it.key, it.descricao_nf)}
                                    title="Cadastrar novo produto"
                                    style={{ flexShrink: 0, width: 22, height: 22, borderRadius: 5, border: "0.5px solid #C9921B", background: "#FBF0D8", color: "#7A5A12", cursor: "pointer", fontSize: 14, lineHeight: 1, padding: 0, fontWeight: 700 }}
                                  >+</button>
                                </div>
                              )}
                            </div>

                            {/* Col 2 — Un. NF (somente leitura quando há conversão) */}
                            <div style={{ padding: "7px 6px" }}>
                              <input
                                value={it.unidade_nf}
                                readOnly={temConv}
                                onChange={e => !temConv && setItem(it.key, { unidade_nf: e.target.value, conversao_key: "" })}
                                placeholder="UN"
                                style={{ ...inp, fontSize: 11, padding: "5px 6px", background: temConv ? "var(--bg-page)" : undefined, color: temConv ? "var(--text-3)" : undefined }}
                              />
                            </div>

                            {/* Col 4 — Qtd NF (travada quando há conversão) */}
                            <div style={{ padding: "7px 6px" }}>
                              {temConv ? (
                                <div style={{ padding: "5px 8px", fontSize: 12, color: "var(--text-3)", background: "var(--bg-page)", borderRadius: 8, border: "0.5px solid var(--border-table)", textAlign: "right" }}>
                                  {it.qtd_nf.toLocaleString("pt-BR", { maximumFractionDigits: 3 })}
                                </div>
                              ) : (
                                <InputNumerico decimais={3} value={it.qtd_nf || ""} onChange={v => setItem(it.key, { qtd_nf: parseFloat(v)||0 })} style={{ ...inp, fontSize: 12, padding: "5px 8px" }} />
                              )}
                            </div>

                            {/* Col 5 — Vl. Unit. NF (travado quando há conversão) */}
                            <div style={{ padding: "7px 6px" }}>
                              {temConv ? (
                                <div style={{ padding: "5px 8px", fontSize: 12, color: "var(--text-3)", background: "var(--bg-page)", borderRadius: 8, border: "0.5px solid var(--border-table)", textAlign: "right" }}>
                                  {it.vunit_nf.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                                </div>
                              ) : (
                                <InputMonetario value={it.vunit_nf || ""} onChange={v => setItem(it.key, { vunit_nf: v, valor_unitario: v })} style={{ ...inp, fontSize: 12, padding: "5px 8px" }} />
                              )}
                            </div>

                            {/* Col 6 — Vl. Total */}
                            <div style={{ padding: "7px 8px", fontSize: 12, fontWeight: 600, color: "var(--text-1)", paddingTop: 11 }}>
                              {fmtBRL(it.valor_total)}
                            </div>

                            {/* Col 7 — Conversão */}
                            <div style={{ padding: "7px 8px", display: "flex", flexDirection: "column", gap: 4 }}>
                              {it.tipo_apropiacao !== "direto" && (
                                <>
                                  {/* Select de conversão */}
                                  <select
                                    value={it.conversao_key}
                                    onChange={e => setItem(it.key, { conversao_key: e.target.value })}
                                    style={{ ...inp, fontSize: 11, padding: "4px 7px",
                                      background: temConv ? (autoConv ? "#EAF5D5" : "#FFF8E6") : undefined,
                                      color: temConv ? (autoConv ? "#1A5C38" : "#7A5A12") : "var(--text-2)",
                                      border: temConv ? `0.5px solid ${autoConv ? "#B4E2A0" : "#F6C87A"}` : undefined,
                                    }}
                                  >
                                    <option value="">— sem conversão —</option>
                                    {convOptions.length > 0
                                      ? convOptions.map(c => <option key={c.key} value={c.key}>{c.labelSelect}</option>)
                                      : TABELA_CONVERSAO.map(c => <option key={c.key} value={c.key}>{c.labelSelect}</option>)
                                    }
                                  </select>

                                  {/* AUTO: mostra resultado calculado */}
                                  {autoConv && conv && (
                                    <div style={{ fontSize: 11, color: "#1A5C38", background: "#EAF5D5", borderRadius: 6, padding: "3px 8px", fontWeight: 600 }}>
                                      = {it.quantidade.toLocaleString("pt-BR", { maximumFractionDigits: 4 })} {conv.labelPara}
                                    </div>
                                  )}

                                  {/* MANUAL: campo para qtd total na unidade destino */}
                                  {manualConv && conv && (
                                    <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                                      <InputNumerico
                                        decimais={3}
                                        value={it.quantidade || ""}
                                        onChange={v => setItem(it.key, { quantidade: parseFloat(v)||0 })}
                                        placeholder={`Total em ${conv.labelPara}`}
                                        style={{ ...inp, fontSize: 11, padding: "4px 7px", flex: 1 }}
                                      />
                                      <span style={{ fontSize: 11, color: "var(--text-2)", whiteSpace: "nowrap" }}>{conv.labelPara}</span>
                                    </div>
                                  )}
                                </>
                              )}
                            </div>
                          </>
                        ) : tipo === "custo_direto" ? (
                          <>
                            <div style={{ padding: "6px 8px" }}>
                              <input value={it.descricao_nf} onChange={e => setItem(it.key, { descricao_nf: e.target.value })} placeholder="Descrição" style={{ ...inp, fontSize: 12, padding: "5px 8px" }} />
                            </div>
                            <div style={{ padding: "6px 8px" }}>
                              <input value={it.unidade_nf} onChange={e => setItem(it.key, { unidade_nf: e.target.value })} placeholder="UN" style={{ ...inp, fontSize: 12, padding: "5px 8px" }} />
                            </div>
                            <div style={{ padding: "6px 8px" }}>
                              <InputNumerico decimais={3} value={it.quantidade || ""} onChange={v => setItem(it.key, { quantidade: parseFloat(v)||0 })} style={{ ...inp, fontSize: 12, padding: "5px 8px" }} />
                            </div>
                            <div style={{ padding: "6px 8px" }}>
                              <InputMonetario value={it.valor_unitario || ""} onChange={v => setItem(it.key, { valor_unitario: v })} style={{ ...inp, fontSize: 12, padding: "5px 8px" }} />
                            </div>
                            <div style={{ padding: "6px 8px", fontSize: 12, fontWeight: 600, color: "var(--text-1)" }}>
                              {fmtBRL(it.valor_total)}
                            </div>
                            <div style={{ padding: "6px 8px", display: "flex", flexDirection: "column", gap: 4 }}>
                              <select value={it.centro_custo_id} onChange={e => setItem(it.key, { centro_custo_id: e.target.value, maquina_id: "" })} style={{ ...inp, fontSize: 12, padding: "5px 8px" }}>
                                <option value="">— selecionar CC —</option>
                                {ccOpts.map(c => (
                                  <option key={c.id} value={c.id}>
                                    {c.manutencao_maquinas ? "🔧 " : ""}{c.codigo ? `${c.codigo} ` : ""}{c.nome}
                                  </option>
                                ))}
                              </select>
                              {ccManutencao(it.centro_custo_id) && (
                                <select value={it.maquina_id} onChange={e => setItem(it.key, { maquina_id: e.target.value })} style={{ ...inp, fontSize: 11, padding: "4px 8px", background: "#FBF0D8", border: "0.5px solid #F6C87A" }}>
                                  <option value="">🔧 Máquina (opcional)</option>
                                  {maquinas.map(m => <option key={m.id} value={m.id}>{m.nome}</option>)}
                                </select>
                              )}
                            </div>
                          </>
                        ) : (
                          <>
                            <div style={{ padding: "6px 8px" }}>
                              <input value={it.descricao_nf} onChange={e => setItem(it.key, { descricao_nf: e.target.value })} placeholder="Descrição" style={{ ...inp, fontSize: 12, padding: "5px 8px" }} />
                            </div>
                            <div style={{ padding: "6px 8px" }}>
                              <input value={it.unidade_nf} onChange={e => setItem(it.key, { unidade_nf: e.target.value })} placeholder="UN" style={{ ...inp, fontSize: 12, padding: "5px 8px" }} />
                            </div>
                            <div style={{ padding: "6px 8px" }}>
                              <InputNumerico decimais={3} value={it.quantidade || ""} onChange={v => setItem(it.key, { quantidade: parseFloat(v)||0 })} style={{ ...inp, fontSize: 12, padding: "5px 8px" }} />
                            </div>
                            <div style={{ padding: "6px 8px" }}>
                              <InputMonetario value={it.valor_unitario || ""} onChange={v => setItem(it.key, { valor_unitario: v })} style={{ ...inp, fontSize: 12, padding: "5px 8px" }} />
                            </div>
                            <div style={{ padding: "6px 8px", fontSize: 12, fontWeight: 600, color: "var(--text-1)" }}>
                              {fmtBRL(it.valor_total)}
                            </div>
                            <div style={{ padding: "6px 8px" }}>
                              <select value={it.centro_custo_id} onChange={e => setItem(it.key, { centro_custo_id: e.target.value })} style={{ ...inp, fontSize: 12, padding: "5px 8px" }}>
                                <option value="">—</option>
                                {ccOpts.filter(c => !ccOpts.some(x => x.parent_id === c.id)).map(c => <option key={c.id} value={c.id}>{c.codigo ? `${c.codigo} ` : ""}{c.nome}</option>)}
                              </select>
                            </div>
                            <div style={{ padding: "6px 8px" }}>
                              <select value={it.tipo_apropiacao} onChange={e => setItem(it.key, { tipo_apropiacao: e.target.value as NfEntradaItem["tipo_apropiacao"] })} style={{ ...inp, fontSize: 11, padding: "5px 6px" }}>
                                <option value="direto">Direto</option>
                                <option value="estoque">Estoque</option>
                                <option value="maquinario">Maquinário</option>
                                <option value="terceiro">Terceiro</option>
                                <option value="vef">VEF</option>
                                <option value="remessa">Remessa</option>
                              </select>
                            </div>
                          </>
                        )}
                        <div style={{ padding: "6px 8px", textAlign: "center" }}>
                          {itens.length > 1 && (
                            <button onClick={() => setItens(p => p.filter(x => x.key !== it.key))} style={{ background: "none", border: "none", cursor: "pointer", color: "#E24B4A", fontSize: 16, lineHeight: 1 }}>×</button>
                          )}
                        </div>
                        </div>
                        {/* Aviso: bag sem peso informado ainda */}
                        {it.conversao_key === "bag→kg" && it.quantidade <= 0 && (
                          <div style={{ padding: "5px 12px", background: "#FEF3CD", borderTop: "0.5px solid #F6C87A", fontSize: 11, color: "#7A5A12" }}>
                            ⚠️ Informe o peso total em kg no campo de conversão.
                          </div>
                        )}
                      </div>
                    );
                    })}

                    {/* Rodapé totais */}
                    <div style={{ display: "flex", justifyContent: "flex-end", padding: "10px 16px", background: "var(--bg-card)", borderTop: "0.5px solid var(--border-table)", gap: 24 }}>
                      <span style={{ fontSize: 12, color: "var(--text-2)" }}>Cabeçalho NF: <strong>{fmtBRL(parseFloat(cab.valor_total)||0)}</strong></span>
                      <span style={{ fontSize: 12, color: "var(--text-2)" }}>Total itens: <strong style={{ color: Math.abs(totalItens - (parseFloat(cab.valor_total)||0)) > 0.01 ? "#E24B4A" : "#1A5C38" }}>{fmtBRL(totalItens)}</strong></span>
                    </div>
                  </div>

                  {/* Aviso para item sem associação */}
                  {tipo === "insumos" && itens.some(it => !it.insumo_id && !it.principio_ativo_id && it.tipo_apropiacao !== "direto" && it.descricao_nf.trim()) && (
                    <div style={{ background: "#FBF3E0", border: "0.5px solid #F6C87A", borderRadius: 8, padding: "10px 14px", fontSize: 12, color: "#7A5A12", marginBottom: 14 }}>
                      ⚠️ Itens sem insumo ou princípio ativo associado não serão lançados no estoque. Associe, mude para "C. Custo" ou remova-os.
                    </div>
                  )}

                  {/* Resumo do processamento */}
                  <div style={{ background: "var(--bg-page)", borderRadius: 10, padding: 14, marginBottom: 16 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-1)", marginBottom: 10 }}>Resumo do processamento</div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
                      {[
                        { label: "Tipo",              value: TIPO_LABELS[tipo]?.label },
                        { label: "Emitente",          value: cab.emitente_nome || "—" },
                        { label: "Forma de pagamento",value: cab.forma_pagamento ? { a_vista: "À Vista", prazo_boleto: "A Prazo — Boleto", prazo_pix: "A Prazo — PIX", prazo_debito: "A Prazo — Débito", prazo_cheque: "A Prazo — Cheque", barter: "Barter", financiamento: "Financiamento", outros: "Outros" }[cab.forma_pagamento] ?? cab.forma_pagamento : "Não informado" },
                        { label: "Vencimento CP",     value: cab.data_vencimento_cp ? fmtData(cab.data_vencimento_cp) : "Não informado" },
                        { label: "Pedido vinculado",  value: cab.pedido_compra_id ? (pedidos.find(p=>p.id===cab.pedido_compra_id)?.nr_pedido ?? "Sim") : "Não" },
                        { label: "Itens",             value: `${itens.filter(i=>i.descricao_nf.trim()).length} item(s)` },
                        { label: "Valor total",       value: fmtBRL(parseFloat(cab.valor_total)||0) },
                      ].map(({ label, value }) => (
                        <div key={label}>
                          <div style={{ fontSize: 10, color: "var(--text-3)", marginBottom: 2 }}>{label}</div>
                          <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-1)" }}>{value}</div>
                        </div>
                      ))}
                    </div>
                    {tipo === "insumos" && (
                      <div style={{ marginTop: 10, paddingTop: 10, borderTop: "0.5px solid var(--border-table)" }}>
                        <div style={{ fontSize: 11, color: "var(--text-2)" }}>
                            {itens.filter(i => i.principio_ativo_id && i.tipo_apropiacao !== "direto").length} item(s) → estoque PA ·{" "}
                          {itens.filter(i => i.insumo_id && !i.principio_ativo_id && i.tipo_apropiacao !== "direto").length} item(s) → estoque insumo ·{" "}
                          {itens.filter(i => i.tipo_apropiacao === "direto" && i.descricao_nf.trim()).length} item(s) → custo direto ·{" "}
                          {itens.filter(i => !i.insumo_id && !i.principio_ativo_id && i.tipo_apropiacao !== "direto" && i.descricao_nf.trim()).length} item(s) sem associação (ignorados)
                          {depositos.length > 0 && " · Depósito padrão: " + (nomeDeposito(itens.find(i => i.deposito_id && i.tipo_apropiacao !== "direto")?.deposito_id ?? "") || "não definido")}
                        </div>
                      </div>
                    )}
                    {tipo === "custo_direto" && (
                      <div style={{ marginTop: 10, paddingTop: 10, borderTop: "0.5px solid var(--border-table)", fontSize: 11, color: "#1A6B3C" }}>
                        {itens.filter(i => i.centro_custo_id && i.descricao_nf.trim()).length} item(s) com centro de custo ·{" "}
                        {itens.filter(i => !i.centro_custo_id && i.descricao_nf.trim()).length} sem CC (serão lançados sem centro de custo).
                        Nenhuma movimentação de estoque será gerada.
                      </div>
                    )}
                    {tipo === "vef" && (
                      <div style={{ marginTop: 10, paddingTop: 10, borderTop: "0.5px solid var(--border-table)", fontSize: 11, color: "#7A5A12" }}>
                        Um depósito de terceiro será criado automaticamente para {cab.emitente_nome || "o fornecedor"}.
                        Use uma NF de Remessa quando o produto for entregue fisicamente.
                      </div>
                    )}
                    {tipo === "remessa" && (
                      <div style={{ marginTop: 10, paddingTop: 10, borderTop: "0.5px solid var(--border-table)", fontSize: 11, color: "#0C447C" }}>
                        O saldo de terceiro (VEF anterior) será debitado e creditado em: {cab.deposito_destino_id ? nomeDeposito(cab.deposito_destino_id) : "depósito não selecionado"}.
                      </div>
                    )}
                  </div>

                  {/* Checkbox É Combustível + seletores condicionais */}
                  {tipo === "insumos" && (
                    <div style={{ marginBottom: 16 }}>
                      {/* Checkbox */}
                      <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", userSelect: "none", marginBottom: 12 }}>
                        <input
                          type="checkbox"
                          checked={cab.e_combustivel}
                          onChange={e => setCab(p => ({
                            ...p,
                            e_combustivel: e.target.checked,
                            bomba_destino_id:   e.target.checked ? p.bomba_destino_id : "",
                            deposito_destino_id: e.target.checked ? "" : p.deposito_destino_id,
                          }))}
                          style={{ width: 15, height: 15, accentColor: "#C9921B" }}
                        />
                        <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text-1)" }}>É Combustível</span>
                        <span style={{ fontSize: 11, color: "var(--text-3)" }}>credita saldo na bomba / tanque</span>
                      </label>

                      {/* Seletor Bomba — visível quando É Combustível */}
                      {cab.e_combustivel && (
                        <div style={{ background: "#FBF3E0", border: "0.5px solid #C9921B", borderRadius: 10, padding: 14 }}>
                          <div style={{ fontSize: 12, fontWeight: 600, color: "#7A5800", marginBottom: 8 }}>
                            Bomba / Tanque destino (crédito de estoque)
                          </div>
                          <select
                            value={cab.bomba_destino_id}
                            onChange={e => setCab(p => ({ ...p, bomba_destino_id: e.target.value }))}
                            style={{ ...inp, maxWidth: 380, borderColor: "#C9921B" }}
                          >
                            <option value="">Selecione a bomba ou tanque…</option>
                            {wBombas.map(b => (
                              <option key={b.id} value={b.id}>
                                {b.nome} — {b.estoque_atual_l != null ? `${b.estoque_atual_l.toLocaleString("pt-BR")} L atual` : "sem estoque registrado"}
                              </option>
                            ))}
                          </select>
                          {wBombas.length === 0 && (
                            <div style={{ fontSize: 11, color: "#888", marginTop: 6 }}>
                              Nenhuma bomba cadastrada. Acesse Cadastros → Combustíveis &amp; Bombas.
                            </div>
                          )}
                        </div>
                      )}

                      {/* Seletor Depósito — visível quando NÃO é combustível */}
                      {!cab.e_combustivel && itens.some(i => i.tipo_apropiacao !== "direto") && (
                    <div style={{ background: "var(--bg-page)", borderRadius: 10, padding: 14, marginBottom: 16 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
                        <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-1)" }}>Depósito padrão para itens sem depósito individual</div>
                        <div style={{ display: "flex", gap: 4, background: "var(--bg-input)", borderRadius: 6, padding: 2, border: "0.5px solid var(--border-ui)" }}>
                          {(["proprio", "terceiro"] as const).map(t => (
                            <button key={t} onClick={() => setDepFiltro(t)}
                              style={{ fontSize: 10, fontWeight: 600, padding: "2px 10px", borderRadius: 5, border: "none", cursor: "pointer",
                                background: depFiltro === t ? "#111111" : "transparent",
                                color: depFiltro === t ? "#fff" : "var(--text-3)" }}>
                              {t === "proprio" ? "Próprio" : "Terceiro"}
                            </button>
                          ))}
                        </div>
                      </div>
                      <select
                        onChange={e => {
                          const dep = e.target.value;
                          setItens(p => p.map(it => it.deposito_id ? it : { ...it, deposito_id: dep }));
                        }}
                        style={{ ...inp, maxWidth: 380 }}
                      >
                        <option value="">Não definir padrão</option>
                        {depositos
                          .filter(d => depFiltro === "terceiro"
                            ? ["terceiro","armazem_terceiro"].includes(d.tipo)
                            : !["terceiro","armazem_terceiro"].includes(d.tipo))
                          .map(d => (
                            <option key={d.id} value={d.id}>{d.nome} — {d.tipo}</option>
                          ))}
                      </select>
                    </div>
                  )}
                    </div>
                  )}

                  <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                    <button style={btnR} onClick={() => setEtapa("cabecalho")}>← Voltar</button>
                    <div style={{ display: "flex", gap: 10 }}>
                      <button style={btnR} onClick={async () => {
                        // Salvar como pendente sem processar
                        if (nfEdit) {
                          await atualizarNfEntrada(nfEdit.id, { status: "pendente" });
                          await carregar();
                          setWizard(false);
                        }
                      }}>
                        Salvar como Pendente
                      </button>
                      <button
                        style={{ ...btnV, background: saving ? "#ccc" : "#1A5C38" }}
                        onClick={processarNF}
                        disabled={saving}
                      >
                        {saving ? "Processando…" : "✓ Processar NF"}
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════
          MODAL DE DEVOLUÇÃO
      ══════════════════════════════════════════════════════ */}
      {devModal && devNfOrig && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(11,45,80,0.32)", display: "flex", alignItems: "center", justifyContent: "center", zIndex:2000, padding: 24 }}>
          <div style={{ background: "var(--bg-card)", borderRadius: 14, width: "100%", maxWidth: 780, maxHeight: "90vh", overflowY: "auto", boxShadow: "0 4px 20px rgba(11,45,80,0.10)" }}>

            {/* Cabeçalho */}
            <div style={{ padding: "20px 24px 16px", borderBottom: "0.5px solid var(--bg-tag)", display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
              <div>
                <div style={{ fontSize: 15, fontWeight: 700, color: "var(--text-1)" }}>Emitir NF de Devolução de Compra</div>
                <div style={{ fontSize: 12, color: "#666", marginTop: 4 }}>
                  NF de origem: <strong>{devNfOrig.numero}/{devNfOrig.serie}</strong> · {devNfOrig.emitente_nome} · {fmtBRL(devNfOrig.valor_total)}
                </div>
              </div>
              <button onClick={() => setDevModal(false)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 20, color: "var(--text-3)", lineHeight: 1, marginLeft: 16 }}>×</button>
            </div>

            <div style={{ padding: 24 }}>
              {devErr && (
                <div style={{ background: "#FCEBEB", border: "0.5px solid #F5C6C6", borderRadius: 8, padding: "10px 14px", fontSize: 13, color: "#791F1F", marginBottom: 16 }}>{devErr}</div>
              )}

              {/* Cabeçalho da devolução */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 12, marginBottom: 16 }}>
                <div>
                  <label style={lbl}>Data de Emissão</label>
                  <input type="date" value={devData} onChange={e => setDevData(e.target.value)} style={inp} />
                </div>
                <div>
                  <label style={lbl}>Vencimento da CR</label>
                  <input type="date" value={devVenc} onChange={e => setDevVenc(e.target.value)} placeholder="Opcional" style={inp} />
                </div>
                <div>
                  <label style={lbl}>CFOP</label>
                  <select value={devCfop} onChange={e => setDevCfop(e.target.value)} style={inp}>
                    <option value="5201">5201 — Dev. compra intraestadual</option>
                    <option value="6201">6201 — Dev. compra interestadual</option>
                    <option value="5202">5202 — Dev. compra c/ substituição</option>
                    <option value="6202">6202 — Dev. compra c/ substituição interestadual</option>
                  </select>
                </div>
                <div>
                  <label style={lbl}>Observações</label>
                  <input value={devObs} onChange={e => setDevObs(e.target.value)} placeholder="Opcional" style={inp} />
                </div>
              </div>

              {/* Info */}
              <div style={{ background: "#FCEBEB20", border: "0.5px solid #FCBCBC", borderRadius: 8, padding: "10px 14px", fontSize: 12, color: "#791F1F", marginBottom: 16 }}>
                Informe a <strong>quantidade a devolver</strong> por item. Apenas itens com quantidade &gt; 0 serão incluídos.
                A devolução irá: <strong>debitar o estoque</strong> + criar uma <strong>Conta a Receber</strong> (fornecedor deve restituir o valor).
              </div>

              {/* Grid de itens */}
              {devItens.length === 0 ? (
                <div style={{ textAlign: "center", padding: "30px 20px", color: "var(--text-3)", fontSize: 13 }}>
                  Nenhum item de estoque encontrado na NF de origem.
                </div>
              ) : (
                <div style={{ border: "0.5px solid var(--border-table)", borderRadius: 10, overflow: "hidden", marginBottom: 20 }}>
                  <div style={{ display: "grid", gridTemplateColumns: "2fr 80px 100px 100px 110px", background: "var(--bg-page)", borderBottom: "0.5px solid var(--border-table)" }}>
                    {["Produto", "Unidade", "Qtd Original", "Qtd Devolver", "Valor Devolução"].map((h, i) => (
                      <div key={i} style={{ padding: "7px 12px", fontSize: 10, fontWeight: 600, color: "var(--text-2)" }}>{h}</div>
                    ))}
                  </div>
                  {devItens.map(it => (
                    <div key={it.key} style={{ display: "grid", gridTemplateColumns: "2fr 80px 100px 100px 110px", borderBottom: "0.5px solid #F0F2F7", alignItems: "center" }}>
                      <div style={{ padding: "8px 12px", fontSize: 13, color: "var(--text-1)" }}>{it.descricao_produto}</div>
                      <div style={{ padding: "8px 12px", fontSize: 12, color: "var(--text-2)" }}>{it.unidade}</div>
                      <div style={{ padding: "8px 12px", fontSize: 12, color: "var(--text-3)", textAlign: "center" }}>
                        {it.qtdOriginal.toLocaleString("pt-BR", { maximumFractionDigits: 3 })}
                      </div>
                      <div style={{ padding: "6px 8px" }}>
                        <InputNumerico
                          decimais={3}
                          min={0}
                          max={it.qtdOriginal}
                          value={it.quantidade_devolver || ""}
                          onChange={v => {
                            const qtd = Math.min(parseFloat(v) || 0, it.qtdOriginal);
                            setDevItens(prev => prev.map(x =>
                              x.key === it.key
                                ? { ...x, quantidade_devolver: qtd, valor_total: qtd * x.valor_unitario }
                                : x
                            ));
                          }}
                          style={{ ...inp, padding: "5px 8px", fontSize: 12, border: it.quantidade_devolver > 0 ? "0.5px solid #E24B4A" : "0.5px solid var(--border-table)" }}
                        />
                      </div>
                      <div style={{ padding: "8px 12px", fontSize: 13, fontWeight: 600, color: it.quantidade_devolver > 0 ? "#E24B4A" : "var(--text-muted)", textAlign: "right" }}>
                        {it.quantidade_devolver > 0 ? fmtBRL(it.valor_total) : "—"}
                      </div>
                    </div>
                  ))}
                  {/* Rodapé total */}
                  <div style={{ display: "flex", justifyContent: "flex-end", gap: 24, padding: "10px 16px", background: "var(--bg-card)", borderTop: "0.5px solid var(--border-table)" }}>
                    <span style={{ fontSize: 12, color: "var(--text-2)" }}>
                      Itens selecionados: <strong>{devItens.filter(i => i.quantidade_devolver > 0).length}</strong>
                    </span>
                    <span style={{ fontSize: 12, color: "var(--text-2)" }}>
                      Total da devolução: <strong style={{ color: "#E24B4A" }}>
                        {fmtBRL(devItens.reduce((s, i) => s + i.valor_total, 0))}
                      </strong>
                    </span>
                  </div>
                </div>
              )}

              {/* Ações */}
              <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
                <button style={btnR} onClick={() => setDevModal(false)}>Cancelar</button>
                <button
                  onClick={confirmarDevolucao}
                  disabled={devSaving || devItens.filter(i => i.quantidade_devolver > 0).length === 0}
                  style={{ ...btnV, background: devSaving ? "#ccc" : "#E24B4A", cursor: devSaving ? "default" : "pointer" }}
                >
                  {devSaving ? "Processando…" : "↩ Emitir Devolução"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════
          MODAL RECLASSIFICAÇÃO
      ══════════════════════════════════════════════════════ */}
      {modalReclass && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex:2000 }}>
          <div style={{ background: "var(--bg-card)", borderRadius: 14, width: "100%", maxWidth: 480, margin: "0 20px", boxShadow: "0 4px 20px rgba(11,45,80,0.10)" }}>

            {/* Cabeçalho */}
            <div style={{ padding: "18px 22px 14px", borderBottom: "0.5px solid var(--bg-tag)", display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
              <div>
                <div style={{ fontSize: 15, fontWeight: 700, color: "var(--text-1)" }}>Reclassificar NF</div>
                <div style={{ fontSize: 12, color: "var(--text-3)", marginTop: 2 }}>
                  NF {modalReclass.numero}/{modalReclass.serie} — {modalReclass.emitente_nome}
                </div>
                <div style={{ fontSize: 11, color: "#C9921B", marginTop: 4, background: "#FBF3E0", display: "inline-block", padding: "2px 8px", borderRadius: 6 }}>
                  Altera apenas a classificação. Os lançamentos financeiros gerados não são afetados.
                </div>
              </div>
              <button onClick={() => setModalReclass(null)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 20, color: "var(--text-3)", lineHeight: 1, marginLeft: 12 }}>×</button>
            </div>

            <div style={{ padding: "20px 22px" }}>
              {reclassErr && (
                <div style={{ background: "#FCEBEB", border: "0.5px solid #F5C6C6", borderRadius: 8, padding: "10px 14px", fontSize: 13, color: "#791F1F", marginBottom: 16 }}>
                  {reclassErr}
                </div>
              )}

              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                {/* Operação Gerencial */}
                <div>
                  <label style={lbl}>Operação Gerencial</label>
                  <SelectBusca
                    value={reclassOpId}
                    onChange={setReclassOpId}
                    options={reclassOps.map(o => ({ value: o.id, label: `${o.classificacao} — ${o.descricao}`, group: (o.classificacao ?? "").split(".").slice(0, 3).join(".") }))}
                    placeholder="— sem operação —"
                    style={inp}
                  />
                </div>

                {/* Centro de Custo */}
                <div>
                  <label style={lbl}>Centro de Custo</label>
                  <select
                    value={reclassCC}
                    onChange={e => setReclassCC(e.target.value)}
                    style={inp}
                  >
                    <option value="">— sem centro de custo —</option>
                    {centros.filter(c => !centros.some(x => x.parent_id === c.id)).map(cc => (
                      <option key={cc.id} value={cc.id}>{cc.nome}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {/* Rodapé */}
            <div style={{ padding: "14px 22px 18px", borderTop: "0.5px solid var(--bg-tag)", display: "flex", justifyContent: "flex-end", gap: 10 }}>
              <button style={btnR} onClick={() => setModalReclass(null)}>Cancelar</button>
              <button
                onClick={salvarReclassificacao}
                disabled={reclassSaving}
                style={{ ...btnV, background: reclassSaving ? "var(--text-muted)" : "#C9921B", cursor: reclassSaving ? "default" : "pointer" }}
              >
                {reclassSaving ? "Salvando…" : "Salvar Reclassificação"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ——— Modal: Exclusão de NF ——— */}
      {modalExcluir && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(11,45,80,0.32)", display: "flex", alignItems: "center", justifyContent: "center", zIndex:2000 }}
          onClick={e => { if (e.target === e.currentTarget && !modalExcluir.excluindo) setModalExcluir(null); }}>
          <div style={{ background: "var(--bg-card)", borderRadius: 14, padding: 26, width: 480, maxWidth: "92vw" }}>

            {modalExcluir.verificando ? (
              <div style={{ textAlign: "center", padding: "20px 0", color: "var(--text-2)", fontSize: 13 }}>
                Verificando conciliações…
              </div>
            ) : modalExcluir.bloqueado ? (
              <>
                <div style={{ fontWeight: 600, fontSize: 16, color: "#791F1F", marginBottom: 8 }}>⛔ Exclusão bloqueada</div>
                <div style={{ fontSize: 13, color: "var(--text-2)", marginBottom: 20, lineHeight: 1.6 }}>
                  A NF <strong>{modalExcluir.nf.numero}</strong> possui um lançamento financeiro que foi incluído em um lote de pagamento (conciliação bancária). Não é possível excluir — desfaça a conciliação primeiro.
                </div>
                <div style={{ display: "flex", justifyContent: "flex-end" }}>
                  <button style={btnR} onClick={() => setModalExcluir(null)}>Fechar</button>
                </div>
              </>
            ) : (
              <>
                <div style={{ fontWeight: 600, fontSize: 16, color: "var(--text-1)", marginBottom: 4 }}>Excluir NF de Entrada</div>
                <div style={{ fontSize: 12, color: "var(--text-2)", marginBottom: 20 }}>NF {modalExcluir.nf.numero} — {modalExcluir.nf.emitente_nome}</div>

                <div style={{ background: "#FCEBEB", border: "0.5px solid #E24B4A40", borderRadius: 10, padding: "14px 16px", marginBottom: 16 }}>
                  <div style={{ fontWeight: 600, fontSize: 13, color: "#791F1F", marginBottom: 8 }}>Esta ação irá reverter:</div>
                  <ul style={{ margin: 0, padding: "0 0 0 18px", fontSize: 12, color: "var(--text-2)", lineHeight: 1.8 }}>
                    <li>Movimentações de estoque geradas por esta NF</li>
                    <li>Histórico de manutenção de máquinas (se houver)</li>
                    <li>Registros de estoque de terceiros (VEF/remessa)</li>
                    {modalExcluir.lancamento && (
                      <li>
                        Lançamento financeiro (CP) de {modalExcluir.nf.emitente_nome}
                        {modalExcluir.lancamento.status === "baixado" && (
                          <span style={{ marginLeft: 6, background: "#FBF3E0", color: "#7A5200", padding: "1px 7px", borderRadius: 5, fontWeight: 600 }}>
                            ⚠ já baixado — reverterá o pagamento
                          </span>
                        )}
                      </li>
                    )}
                  </ul>
                </div>

                {modalExcluir.lancamento?.status === "baixado" && (
                  <div style={{ background: "#FFF3CD", border: "0.5px solid #F6C87A", borderRadius: 8, padding: "10px 14px", fontSize: 12, color: "#7A5200", marginBottom: 16 }}>
                    ⚠ O lançamento financeiro desta NF já foi marcado como <strong>baixado</strong> (pago). A exclusão irá remover o registro de pagamento e reverter o saldo da conta bancária <strong>{modalExcluir.lancamento.conta_bancaria || "informada"}</strong>.
                  </div>
                )}

                <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                  <button style={btnR} onClick={() => setModalExcluir(null)} disabled={modalExcluir.excluindo}>Cancelar</button>
                  <button
                    onClick={confirmarExclusao}
                    disabled={modalExcluir.excluindo}
                    style={{ padding: "8px 18px", background: modalExcluir.excluindo ? "var(--text-muted)" : "#E24B4A", color: "#fff", border: "none", borderRadius: 8, fontWeight: 600, cursor: modalExcluir.excluindo ? "default" : "pointer", fontSize: 13 }}
                  >
                    {modalExcluir.excluindo ? "Excluindo…" : "Confirmar Exclusão"}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ——— Modal: Cadastro Rápido de Insumo ——— */}
      {modalNovoInsumo && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(11,45,80,0.32)", display: "flex", alignItems: "center", justifyContent: "center", zIndex:2000 }}
          onClick={e => { if (e.target === e.currentTarget) setModalNovoInsumo(null); }}>
          <div style={{ background: "var(--bg-card)", borderRadius: 14, padding: 26, width: 480, maxWidth: "92vw" }}>
            <div style={{ fontWeight: 600, fontSize: 16, color: "var(--text-1)", marginBottom: 4 }}>Cadastrar produto no catálogo</div>
            <div style={{ fontSize: 12, color: "var(--text-2)", marginBottom: 20 }}>
              O produto será criado no catálogo de insumos e já vinculado ao item da NF.
            </div>

            <div style={{ display: "grid", gap: 14 }}>
              <div>
                <label style={lbl}>Nome do produto *</label>
                <input
                  style={inp}
                  value={formNovoInsumo.nome}
                  onChange={e => setFormNovoInsumo(p => ({ ...p, nome: e.target.value }))}
                  placeholder="Nome conforme catálogo interno"
                  autoFocus
                />
                {formNovoInsumo.nome !== modalNovoInsumo.nome && (
                  <button
                    onClick={() => setFormNovoInsumo(p => ({ ...p, nome: modalNovoInsumo.nome }))}
                    style={{ marginTop: 4, fontSize: 11, color: "var(--text-2)", background: "none", border: "none", cursor: "pointer", padding: 0 }}
                  >
                    ↩ Usar descrição da NF: &quot;{modalNovoInsumo.nome}&quot;
                  </button>
                )}
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                <div>
                  <label style={lbl}>Categoria *</label>
                  <select style={inp} value={formNovoInsumo.categoria}
                    onChange={e => setFormNovoInsumo(p => ({ ...p, categoria: e.target.value as Insumo["categoria"] }))}>
                    <optgroup label="Insumos agrícolas">
                      <option value="semente">Semente</option>
                      <option value="fertilizante">Fertilizante</option>
                      <option value="defensivo">Defensivo</option>
                      <option value="inoculante">Inoculante</option>
                      <option value="combustivel">Combustível</option>
                      <option value="produto_agricola">Produto agrícola</option>
                    </optgroup>
                    <optgroup label="Produtos gerais">
                      <option value="peca">Peça</option>
                      <option value="material">Material</option>
                      <option value="uso_consumo">Uso e consumo</option>
                      <option value="escritorio">Escritório</option>
                      <option value="outros">Outros</option>
                    </optgroup>
                  </select>
                </div>
                <div>
                  <label style={lbl}>Unidade de medida *</label>
                  <select style={inp} value={formNovoInsumo.unidade}
                    onChange={e => setFormNovoInsumo(p => ({ ...p, unidade: e.target.value as Insumo["unidade"] }))}>
                    <option value="un">Unidade (un)</option>
                    <option value="kg">Quilograma (kg)</option>
                    <option value="g">Grama (g)</option>
                    <option value="L">Litro (L)</option>
                    <option value="mL">Mililitro (mL)</option>
                    <option value="sc">Saca (sc)</option>
                    <option value="t">Tonelada (t)</option>
                    <option value="m">Metro (m)</option>
                    <option value="m2">Metro² (m²)</option>
                    <option value="cx">Caixa (cx)</option>
                    <option value="pc">Peça (pc)</option>
                    <option value="par">Par</option>
                    <option value="outros">Outros</option>
                  </select>
                </div>
              </div>
            </div>

            {novoInsumoErr && (
              <div style={{ marginTop: 12, background: "#FCEBEB", borderRadius: 8, padding: "8px 12px", fontSize: 12, color: "#791F1F" }}>
                {novoInsumoErr}
              </div>
            )}

            <div style={{ marginTop: 14, background: "#FBF0D8", borderRadius: 8, padding: "8px 12px", fontSize: 11, color: "#7A5A12" }}>
              ◈ Estoque, estoque mínimo e custo médio podem ser ajustados depois em Cadastros → Insumos.
            </div>

            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 18 }}>
              <button style={btnR} onClick={() => setModalNovoInsumo(null)}>Cancelar</button>
              <button
                onClick={salvarNovoInsumo}
                disabled={!formNovoInsumo.nome.trim() || novoInsumoSaving}
                style={{ ...btnV, background: !formNovoInsumo.nome.trim() || novoInsumoSaving ? "var(--text-muted)" : "#C9921B", cursor: !formNovoInsumo.nome.trim() || novoInsumoSaving ? "default" : "pointer" }}
              >
                {novoInsumoSaving ? "Salvando…" : "◈ Cadastrar e vincular"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal: Processar em Lote ── */}
      {batchModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(11,45,80,0.38)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 2100 }}
          onClick={e => { if (e.target === e.currentTarget) setBatchModal(false); }}>
          <div style={{ background: "var(--bg-card)", borderRadius: 14, padding: 26, width: 620, maxWidth: "96vw" }}>
            <div style={{ fontWeight: 700, fontSize: 16, color: "var(--text-1)", marginBottom: 4 }}>
              ⚡ Processar em Lote
            </div>
            <div style={{ fontSize: 12, color: "var(--text-2)", marginBottom: 18 }}>
              {nfsFiltradas.filter(n => selectedNfs.has(n.id) && n.status === "pendente").length} NF(s) pendente(s) selecionada(s).
              Deixe em branco para manter o valor individual de cada NF.
            </div>

            {/* ── Tipo de Destino ── */}
            <div style={{ marginBottom: 18 }}>
              <label style={lbl}>Tipo de Processamento</label>
              <div style={{ display: "flex", gap: 0, borderRadius: 8, overflow: "hidden", border: "0.5px solid var(--border-ui)" }}>
                {([
                  { v: "" as const,        label: "— não alterar —",     desc: "Mantém o tipo de cada NF" },
                  { v: "estoque" as const,  label: "Estoque / Insumos",   desc: "Salva depósito; itens mapeados individualmente" },
                  { v: "direto" as const,   label: "Apropriação Direta",  desc: "Processa sem entrada em estoque" },
                ] as const).map(opt => (
                  <button key={opt.v} onClick={() => setBatchSettings(p => ({ ...p, tipo_destino: opt.v }))}
                    title={opt.desc}
                    style={{
                      flex: 1, padding: "8px 6px", border: "none", cursor: "pointer", fontSize: 12, fontWeight: 600,
                      background: batchSettings.tipo_destino === opt.v
                        ? (opt.v === "direto" ? "#166534" : opt.v === "estoque" ? "#1A4870" : "#374151")
                        : "var(--bg-input)",
                      color: batchSettings.tipo_destino === opt.v ? "#fff" : "var(--text-2)",
                      borderRight: opt.v !== "direto" ? "0.5px solid var(--border-ui)" : "none",
                    }}>
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 16 }}>
              {/* ── Campos comuns ── */}
              <div>
                <label style={lbl}>Vencimento da CP</label>
                <input type="date" value={batchSettings.data_vencimento_cp} onChange={e => setBatchSettings(p => ({ ...p, data_vencimento_cp: e.target.value }))} style={inp} />
              </div>
              <div>
                <label style={lbl}>Ano Safra</label>
                <select value={batchSettings.ano_safra_id} onChange={e => setBatchSettings(p => ({ ...p, ano_safra_id: e.target.value, ciclo_id: "" }))} style={inp}>
                  <option value="">— manter individual —</option>
                  {anosSafra.map(a => <option key={a.id} value={a.id}>{a.descricao}</option>)}
                </select>
              </div>

              {/* Ciclo — só quando há ano safra */}
              {batchSettings.ano_safra_id && (
                <div>
                  <label style={lbl}>Ciclo</label>
                  <select value={batchSettings.ciclo_id} onChange={e => setBatchSettings(p => ({ ...p, ciclo_id: e.target.value }))} style={inp}>
                    <option value="">— manter individual —</option>
                    {batchCiclos.map(c => <option key={c.id} value={c.id}>{c.descricao}</option>)}
                  </select>
                </div>
              )}

              {/* ── Campos específicos de Apropriação Direta ── */}
              {(batchSettings.tipo_destino === "direto" || batchSettings.tipo_destino === "") && (
                <>
                  <div>
                    <label style={lbl}>Centro de Custo</label>
                    <select value={batchSettings.centro_custo_id} onChange={e => setBatchSettings(p => ({ ...p, centro_custo_id: e.target.value }))} style={inp}>
                      <option value="">— manter individual —</option>
                      {ccOpts.filter(c => !ccOpts.some(x => x.parent_id === c.id)).map(c => (
                        <option key={c.id} value={c.id}>{c.codigo ? `${c.codigo} — ` : ""}{c.nome}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label style={lbl}>OG — Operação Gerencial</label>
                    <select value={batchSettings.operacao_gerencial_id} onChange={e => setBatchSettings(p => ({ ...p, operacao_gerencial_id: e.target.value }))} style={inp}>
                      <option value="">— manter individual —</option>
                      {batchOps.map(o => <option key={o.id} value={o.id}>{o.classificacao ? `${o.classificacao} — ` : ""}{o.descricao}</option>)}
                    </select>
                  </div>
                </>
              )}

              {/* ── Campos específicos de Estoque ── */}
              {(batchSettings.tipo_destino === "estoque" || batchSettings.tipo_destino === "") && (
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 3 }}>
                    <label style={{ ...lbl, marginBottom: 0 }}>Depósito de Entrada</label>
                    <div style={{ display: "flex", gap: 3, background: "var(--bg-input)", borderRadius: 6, padding: 2, border: "0.5px solid var(--border-ui)" }}>
                      {(["proprio", "terceiro"] as const).map(t => (
                        <button key={t} onClick={() => setDepFiltro(t)}
                          style={{ fontSize: 9, fontWeight: 600, padding: "1px 8px", borderRadius: 4, border: "none", cursor: "pointer",
                            background: depFiltro === t ? "#111111" : "transparent",
                            color: depFiltro === t ? "#fff" : "var(--text-3)" }}>
                          {t === "proprio" ? "Próprio" : "Terceiro"}
                        </button>
                      ))}
                    </div>
                  </div>
                  <select value={batchSettings.deposito_destino_id} onChange={e => setBatchSettings(p => ({ ...p, deposito_destino_id: e.target.value }))} style={inp}>
                    <option value="">— manter individual —</option>
                    {wDepositos
                      .filter(d => depFiltro === "terceiro"
                        ? ["terceiro","armazem_terceiro"].includes(d.tipo)
                        : !["terceiro","armazem_terceiro"].includes(d.tipo))
                      .map(d => <option key={d.id} value={d.id}>{d.nome}</option>)}
                  </select>
                </div>
              )}

              {/* ── Pedido de Compra (sempre visível) ── */}
              <div style={{ gridColumn: "1 / -1" }}>
                <label style={lbl}>Vincular a Pedido de Compra</label>
                <select value={batchSettings.pedido_compra_id} onChange={e => setBatchSettings(p => ({ ...p, pedido_compra_id: e.target.value }))} style={inp}>
                  <option value="">— sem pedido —</option>
                  {wPedidos.map(p => {
                    const forn = pessoas.find(x => x.id === p.fornecedor_id)?.nome ?? p.contato_fornecedor ?? "—";
                    const nr = p.nr_pedido ?? p.numero ?? p.id.substring(0, 8);
                    return <option key={p.id} value={p.id}>{forn} — PC {nr} ({p.status})</option>;
                  })}
                </select>
              </div>
            </div>

            {/* ── Avisos contextuais ── */}
            {batchSettings.tipo_destino === "direto" && batchSettings.centro_custo_id && (
              <div style={{ background: "#E8F5E9", border: "0.5px solid #86EFAC", borderRadius: 8, padding: "10px 14px", fontSize: 12, color: "#15803D", marginBottom: 16 }}>
                ✓ <strong>Apropriação Direta</strong>: todas as NFs serão processadas agora — os itens saem sem dar entrada em estoque. CC e OG serão aplicados.
              </div>
            )}
            {batchSettings.tipo_destino === "direto" && !batchSettings.centro_custo_id && (
              <div style={{ background: "#FFF8E1", border: "0.5px solid #FDE68A", borderRadius: 8, padding: "10px 14px", fontSize: 12, color: "#92400E", marginBottom: 16 }}>
                ⚠ Informe o Centro de Custo para processar as NFs como Apropriação Direta.
              </div>
            )}
            {batchSettings.tipo_destino === "estoque" && (
              <div style={{ background: "#EFF6FF", border: "0.5px solid #BFDBFE", borderRadius: 8, padding: "10px 14px", fontSize: 12, color: "#1D4ED8", marginBottom: 16 }}>
                ℹ <strong>Estoque / Insumos</strong>: o depósito e as configurações serão salvas. As NFs permanecem <em>Pendentes</em> — abra cada uma para mapear os itens ao catálogo e processar.
              </div>
            )}
            {batchSettings.tipo_destino === "" && batchSettings.centro_custo_id && (
              <div style={{ background: "#E8F5E9", border: "0.5px solid #86EFAC", borderRadius: 8, padding: "10px 14px", fontSize: 12, color: "#15803D", marginBottom: 16 }}>
                ✓ NFs já marcadas como <strong>Custo Direto</strong> serão processadas automaticamente com o CC selecionado.
              </div>
            )}

            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <button style={btnR} onClick={() => setBatchModal(false)} disabled={batchSaving}>Cancelar</button>
              <button
                onClick={processarEmLote}
                disabled={batchSaving || (batchSettings.tipo_destino === "direto" && !batchSettings.centro_custo_id)}
                style={{ ...btnV, opacity: (batchSaving || (batchSettings.tipo_destino === "direto" && !batchSettings.centro_custo_id)) ? 0.5 : 1, cursor: batchSaving ? "default" : "pointer" }}
              >
                {batchSaving ? "Processando…" : "Aplicar e Processar"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal de justificativa SIEG ── */}
      {siegJustModal && (() => {
        const m = MAN_CFG.find(x => x.tipo === siegJustModal.tipo)!;
        return (
          <div style={{ position: "fixed", inset: 0, background: "rgba(11,45,80,0.32)", display: "flex", alignItems: "center", justifyContent: "center", zIndex:2000 }}
            onClick={e => { if (e.target === e.currentTarget) setSiegJustModal(null); }}>
            <div style={{ background: "white", borderRadius: 12, padding: 28, width: 480, maxWidth: "96vw" }}>
              <div style={{ fontWeight: 700, fontSize: 15, color: m.cor, marginBottom: 4 }}>{m.label}</div>
              <div style={{ fontSize: 12, color: "#666", marginBottom: 16 }}>NF {siegJustModal.nf.numero} · {siegJustModal.nf.emitente_nome}</div>
              <label style={{ fontSize: 11, fontWeight: 600, color: "var(--text-2)", display: "block", marginBottom: 4 }}>Justificativa * (mín. 15 caracteres)</label>
              <textarea value={siegJustText} onChange={e => setSiegJustText(e.target.value)} rows={3}
                placeholder="Informe o motivo…"
                style={{ width: "100%", padding: "8px 10px", border: "0.5px solid var(--border)", borderRadius: 8, fontSize: 13, outline: "none", resize: "vertical", boxSizing: "border-box", marginBottom: 6 }} />
              <div style={{ fontSize: 10, color: siegJustText.length >= 15 ? "#16A34A" : "var(--text-muted)", marginBottom: 16 }}>{siegJustText.length}/15 mínimos</div>
              <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
                <button onClick={() => setSiegJustModal(null)} style={{ padding: "8px 16px", border: "0.5px solid var(--border)", borderRadius: 8, background: "white", fontSize: 13, cursor: "pointer", color: "var(--text-2)" }}>Cancelar</button>
                <button disabled={siegJustText.length < 15}
                  onClick={async () => { const {nf,tipo} = siegJustModal; setSiegJustModal(null); await executarManifestacao(nf, tipo, siegJustText); }}
                  style={{ padding: "8px 20px", background: siegJustText.length < 15 ? "var(--border)" : m.cor, color: "white", border: "none", borderRadius: 8, fontWeight: 700, fontSize: 13, cursor: siegJustText.length < 15 ? "default" : "pointer" }}>
                  Confirmar {m.label}
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
