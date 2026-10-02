"use client";
// ═══════════════════════════════════════════════════════════════════════════
// Modal de NF de Produtos (NF-e de entrada/compra) — extraído de
// app/compras/nf/page.tsx (01/10/2026, Fase 2 da unificação de Documentos
// Fiscais, núcleo apenas — ver decisão do dono: devolução, remessa logística,
// reclassificação pós-processamento e ações em lote NÃO foram migradas,
// continuam só em app/compras/nf/page.tsx, que segue existindo e
// funcionando sozinho, intocado).
//
// Núcleo migrado: wizard completo (cabeçalho + itens, incluindo importação
// por XML/chave de acesso/Sieg e todas as guards de validação), salvar
// rascunho, processar (estoque + CP + VEF + retorno de bem do imobilizado),
// excluir (com verificação de lançamento/conciliação) e estornar. Toda a
// lógica foi preservada EXATAMENTE como estava — só a casca mudou (recebe
// {id, onClose, onSaved} em vez de ser a página inteira).
// ═══════════════════════════════════════════════════════════════════════════
import { CFOPS_COMPRA_BEM, CFOPS_BEM_SEM_PAGAMENTO, CFOPS_RETORNO_DE_REMESSA } from "../../lib/cfop-imobilizado";
import { useRouter } from "next/navigation";
import { useState, useEffect, useRef, useCallback } from "react";
import {
  criarNfEntrada, atualizarNfEntrada,
  listarNfEntradaItens, criarNfEntradaItem,
  processarNfEntrada,
  limparMovimentacoesEFinanceiroDaNf,
  listarInsumosParaConta,
  criarInsumo,
  listarDepositosMulti,
  listarPessoasDaConta,
  criarPessoa,
  listarIEsDoProdutor,
  listarCentrosCustoGeralDaConta,
  listarRegrasClassificacao,
  aplicarRegraClassificacao,
  listarOperacoesGerenciaisAtivasDaConta,
  verificarExclusaoNf,
  listarMaquinas,
  listarBombas,
  resolverNomeComercial,
  listarAnosSafra,
  listarCiclos,
  listarPedidoCompraItens,
  listarTransferenciasMaquinas, atualizarTransferenciaMaquina,
  processarDevolucaoCompra,
} from "../../lib/db";
import type { ItemDevolucao } from "../../lib/db";
import { useAuth } from "../AuthProvider";
import type { TransferenciaMaquina, NfEntrada, NfEntradaItem, Insumo, Deposito, BombaCombustivel, Pessoa, CentroCusto, RegraClassificacao, OperacaoGerencial, Maquina, AnoSafra, Ciclo, ProdutorIE, PedidoCompraItem } from "../../lib/supabase";
import { supabase } from "../../lib/supabase";
import InputMonetario from "../InputMonetario";
import InputNumerico from "../InputNumerico";
import SelectBusca from "../SelectBusca";

// ─────────────────────────────────────────────────────────────
// Estilos base
// ─────────────────────────────────────────────────────────────
const inp: React.CSSProperties = { width: "100%", padding: "8px 10px", border: "0.5px solid var(--border-table)", borderRadius: 8, fontSize: 13, color: "var(--text-1)", background: "var(--bg-input)", boxSizing: "border-box", outline: "none" };
const lbl: React.CSSProperties = { fontSize: 11, color: "var(--text-2)", marginBottom: 4, display: "block" };
const btnV: React.CSSProperties = { padding: "8px 20px", background: "#1A5C38", color: "#fff", border: "none", borderRadius: 8, fontWeight: 600, cursor: "pointer", fontSize: 13 };
const btnR: React.CSSProperties = { padding: "8px 18px", border: "0.5px solid var(--border-table)", borderRadius: 8, background: "transparent", cursor: "pointer", fontSize: 13, color: "var(--text-1)" };
const card: React.CSSProperties = { background: "var(--bg-card)", borderRadius: 12, border: "0.5px solid var(--border-table)", padding: "18px 20px", marginBottom: 16 };

const fmtBRL = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
// Valor unitário aparece com 5 casas (preço de insumo/peça costuma ter mais que centavos); o total continua em centavos.
const fmtUnit = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 5, maximumFractionDigits: 5 });
const arred2 = (v: number) => Math.round((v + Number.EPSILON) * 100) / 100;
const fmtData = (s?: string) => s ? new Date(s + "T12:00:00").toLocaleDateString("pt-BR") : "—";

const CFOP_NATUREZA: Record<string, string> = {
  "1101": "Compra para industrialização",
  "1102": "Compra para comercialização",
  "1113": "Compra de material para uso ou consumo",
  "1116": "Compra para industrialização originada de encomenda",
  "1201": "Devolução de venda de produção do estabelecimento",
  "1202": "Devolução de venda de mercadoria adquirida ou recebida de terceiros",
  "1551": "Compra de bem para o ativo imobilizado",
  "1552": "Transferência de bem do ativo imobilizado",
  "1554": "Retorno de bem do ativo imobilizado que tenha saído para uso fora do estabelecimento",
  "1555": "Entrada de bem do ativo imobilizado de terceiro, remetido para uso no estabelecimento",
  "2552": "Transferência de bem do ativo imobilizado",
  "2554": "Retorno de bem do ativo imobilizado que tenha saído para uso fora do estabelecimento",
  "2555": "Entrada de bem do ativo imobilizado de terceiro, remetido para uso no estabelecimento",
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
  "5554": "Remessa de bem do ativo imobilizado para uso fora do estabelecimento",
  "6101": "Venda de produção do estabelecimento",
  "6102": "Venda de mercadoria adquirida ou recebida de terceiros",
  "6554": "Remessa de bem do ativo imobilizado para uso fora do estabelecimento",
};

// CFOPs de compra/remessa de bem do ativo imobilizado — não é insumo de estoque nem despesa
// operacional, é investimento (CAPEX). Item nesse CFOP entra como "Direto" (sem mexer em estoque)
// e a Operação Gerencial vai pra "AQUISIÇÃO DE MAQ. / EQUIP. / IMPLEM." (2.03.01.003), que já é
// excluída do DRE — decisão do dono, 23/09/2026, pra não precisar classificar isso na mão toda vez.
const CFOPS_ATIVO_IMOBILIZADO = new Set([...Array.from(CFOPS_COMPRA_BEM), ...Array.from(CFOPS_BEM_SEM_PAGAMENTO)]);
function tipoApropDeCfop(cfop: string | undefined, fallback: NfEntradaItem["tipo_apropiacao"]): NfEntradaItem["tipo_apropiacao"] {
  return CFOPS_ATIVO_IMOBILIZADO.has((cfop ?? "").trim()) ? "direto" : fallback;
}
const OG_ATIVO_IMOBILIZADO_CODIGO = "2.03.01.003";

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
  // Unidade (caixa/pacote/item) e Caixa não têm peso/volume fixo — sempre manual (depende do produto).
  { key: "un→l",      de: "un",    para: "l",     fator: null,    tipo: "manual", labelSelect: "Un → L    (manual)",  labelPara: "L"    },
  { key: "l→un",       de: "l",    para: "un",    fator: null,    tipo: "manual", labelSelect: "L → Un    (manual)",  labelPara: "un"   },
  { key: "un→kg",     de: "un",    para: "kg",    fator: null,    tipo: "manual", labelSelect: "Un → Kg   (manual)",  labelPara: "kg"   },
  { key: "kg→un",      de: "kg",   para: "un",    fator: null,    tipo: "manual", labelSelect: "Kg → Un   (manual)",  labelPara: "un"   },
  { key: "cx→kg",     de: "cx",    para: "kg",    fator: null,    tipo: "manual", labelSelect: "Caixa → Kg (manual)", labelPara: "kg"   },
  { key: "kg→cx",      de: "kg",   para: "cx",    fator: null,    tipo: "manual", labelSelect: "Kg → Caixa (manual)", labelPara: "cx"   },
];

// Deriva Insumo.tipo ("insumo" | "produto") a partir da categoria — mesmo critério do
// comentário no tipo Insumo (lib/supabase.ts): "insumo" = insumos agrícolas de verdade
// (inclusive os legados micronutriente/biologico/inoculante), "produto" = tudo o mais
// (peças, material, escritório, combustível, produto agrícola…). Nunca gravar "produto"
// fixo — categorias agrícolas cadastradas assim ficam invisíveis/erradas na Posição de
// Estoque e no Kardex.
const CATEGORIAS_INSUMO_AGRICOLA = new Set(["semente", "fertilizante", "defensivo", "corretivo", "micronutriente", "biologico", "inoculante"]);
function tipoPorCategoria(categoria: string): "insumo" | "produto" {
  return CATEGORIAS_INSUMO_AGRICOLA.has(categoria) ? "insumo" : "produto";
}

// Normaliza antes de resolver alias: minúsculas, sem acento, sem espaço/ponto — assim
// "Ton.", "TON", "Big Bag", "Kg." etc. caem todas na mesma chave de lookup.
function normUnidade(u: string) {
  return (u || "")
    .toLowerCase()
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[\s.]/g, "");
}

// Variações reais encontradas em XML de NF-e / digitação manual → forma canônica usada
// em TABELA_CONVERSAO.de/para. Cada unidade listada pelo usuário (e seus plurais/abreviações
// mais comuns) aponta para a mesma chave.
const UNIDADE_ALIASES: Record<string, string> = {
  // Tonelada
  ton: "ton", tn: "ton", t: "ton", tonelada: "ton", toneladas: "ton",
  // Kilo
  kg: "kg", ql: "kg", k: "kg", kilo: "kg", kilos: "kg", quilo: "kg", quilos: "kg",
  // Grama
  g: "g", grama: "g", gramas: "g",
  // Litro
  l: "l", lt: "l", litro: "l", litros: "l",
  // Mililitro
  ml: "ml", mililitro: "ml", mililitros: "ml",
  // Galão
  gl: "galao", drm: "galao", galao: "galao", galoes: "galao",
  // Bag / Big Bag
  bag: "bag", bigbag: "bag", bg: "bag", b: "bag",
  // Unidade
  un: "un", u: "un", unidade: "un", unidades: "un",
  // Caixa
  cx: "cx", caixa: "cx", caixas: "cx",
};

function canonUnidade(u: string) {
  const n = normUnidade(u);
  return UNIDADE_ALIASES[n] ?? n;
}

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
  // Linha específica do pedido vinculado — só relevante quando o pedido tem
  // o mesmo produto em mais de uma linha (embalagens/valores fiscais
  // diferentes); nesse caso a entrega não pode ser calculada só por produto.
  pedido_item_id: string;
  // Resolução via princípio ativo
  pa_nome?: string;
  pa_auto?: boolean;
  // Sementes — múltiplos lotes (insumo_id opcional por lote: permite variedades
  // diferentes dentro do mesmo item de NF — quando ausente, usa o insumo_id do item)
  lotes_semente: { numero: string; quantidade_kg?: number; insumo_id?: string }[];
  // Apropriação
  tipo_apropiacao: NfEntradaItem["tipo_apropiacao"];
  deposito_id: string;
  bomba_id: string;
  maquina_id: string;
  centro_custo_id: string;
  // Apropriação Direta — peça/serviço de manutenção ratado entre várias
  // máquinas (frotas) por percentual manual, em vez de uma máquina só.
  // (combustível não precisa de campo próprio — usa maquina_id acima; o modo
  // do item vem da Operação Gerencial do cabeçalho, não de um estado por item)
  maquinas_rateio: { maquina_id: string; percentual: number }[];
  // Apropriação Direta — hodômetro/horímetro do veículo, só no modo combustível.
  horimetro: number;
  // ICMS retido na origem (Substituição Tributária) — lido do XML, item a item (CST 10/30/60/70
  // no regime normal; CSOSN 201/202/203/500 no Simples Nacional). Informativo: o valor do ICMS-ST
  // já está embutido no valor_total do item (é isso que a NF do fornecedor cobra); não gera
  // lançamento nem cálculo próprio — só sinaliza pra quem está processando.
  cst_icms: string;
  icms_retido: boolean;
  valor_icms_st: number;
}

interface PedidoMin { id: string; nr_pedido?: string; numero?: string; fornecedor_id?: string; contato_fornecedor?: string; status: string; ano_safra_id?: string; ciclo_id?: string; data_vencimento?: string; }

const ITEM_VAZIO = (): ItemRascunho => ({
  key: crypto.randomUUID(),
  descricao_nf: "", ncm: "", cfop: "", unidade_nf: "UN",
  qtd_nf: 0, vunit_nf: 0, valor_total: 0,
  conversao_key: "",
  quantidade: 0, valor_unitario: 0, fator_conversao: 1,
  insumo_id: "", principio_ativo_id: "", nome_comercial_ref: "", pedido_item_id: "",
  lotes_semente: [],
  tipo_apropiacao: "estoque",
  deposito_id: "", bomba_id: "", maquina_id: "", centro_custo_id: "",
  maquinas_rateio: [], horimetro: 0,
  cst_icms: "", icms_retido: false, valor_icms_st: 0,
});

type Etapa = "cabecalho" | "itens";
type OrigEscolha = "manual" | "xml" | "sieg" | "leitor";
type TipoEntrada = "insumos" | "pecas" | "vef" | "remessa" | "custo_direto";

const TIPO_LABELS: Record<TipoEntrada, { label: string; desc: string; cor: string }> = {
  insumos:      { label: "Insumos/Combustíveis (Para Estoque)", desc: "Compra que gera entrada no estoque. Associe cada item da NF ao catálogo de insumos ou combustíveis.",          cor: "#E8E8E8" },
  pecas:        { label: "Peças / Manutenção",       desc: "Compra de peças, pneus ou serviços de manutenção. Cada item é vinculado à maquinário do cadastro.",                    cor: "#E0F0FF" },
  custo_direto: { label: "Apropriação Direta",       desc: "NF sem entrada em estoque. Cada item é apropriado diretamente a um centro de custo (mercado, energia, frete…).",       cor: "#E8F5E9" },
  vef:          { label: "Entrega Futura (VEF)",     desc: "Pago agora, produto entregue depois. Gera depósito em nome do fornecedor.",                                            cor: "#FAEEDA" },
  remessa:      { label: "Remessa / Entrega",        desc: "Entrega de VEF anterior. Debita estoque do fornecedor e credita operacional.",                                         cor: "#E6F1FB" },
};

// ─────────────────────────────────────────────────────────────
// Componente principal
// ─────────────────────────────────────────────────────────────
// Número digitado/salvo em pt-BR OU ponto-decimal ("820,92" / "1.234,56" / "820.92"). parseFloat("820,92")
// devolve 820 — os campos de impostos/desconto perdiam os centavos e o total e as parcelas não fechavam
// (NF 207864: desconto 820,92 → 820,00; achado 25/09/2026).
const numBR = (v: unknown): number => {
  const t = String(v ?? "").trim();
  if (!t) return 0;
  return t.includes(",") ? (parseFloat(t.replace(/\./g, "").replace(",", ".")) || 0) : (parseFloat(t) || 0);
};

export default function ModalNf({
  id, onClose, onSaved, acaoInicial,
}: {
  id: string | null;
  onClose: () => void;
  onSaved: () => void;
  // Dispara uma ação assim que a NF carrega, sem exigir um segundo clique no
  // rodapé — usado pelo "⋮" do grid unificado (Documentos Fiscais) pra dar
  // acesso a Estornar/Devolver direto da lista, sem duplicar a lógica fiscal
  // aqui (ela continua existindo só uma vez, nas funções já extraídas).
  acaoInicial?: "devolver" | "estornar";
}) {
  const { fazendaId, fazendaIds, contaId, nomeUsuario } = useAuth();
  const router = useRouter();

  // Dados mestre (apoio ao wizard — carregados pelo modal, não por uma lista)
  const [insumos, setInsumos]     = useState<Insumo[]>([]);
  const [depositos, setDepositos] = useState<Deposito[]>([]);
  const [pessoas, setPessoas]     = useState<Pessoa[]>([]);
  const [centros, setCentros]     = useState<CentroCusto[]>([]);
  const [maquinas, setMaquinas]   = useState<Maquina[]>([]);
  const [pedidos, setPedidos]     = useState<PedidoMin[]>([]);
  const [pedidoItensVinculado, setPedidoItensVinculado] = useState<PedidoCompraItem[]>([]);
  const [regrasClass, setRegrasClass] = useState<RegraClassificacao[]>([]);
  // Dados do wizard — recarregados para a fazenda específica desta NF
  const [wCentros,    setWCentros]    = useState<CentroCusto[]>([]);
  const [wDepositos,  setWDepositos]  = useState<Deposito[]>([]);
  const [wBombas,     setWBombas]     = useState<BombaCombustivel[]>([]);
  const [wPedidos,    setWPedidos]    = useState<PedidoMin[]>([]);
  const [wProdutores, setWProdutores] = useState<Array<{id: string; nome: string; cpf_cnpj?: string}>>([]);
  const [iesProdutor,  setIesProdutor]  = useState<ProdutorIE[]>([]);
  const [sugestaoNome, setSugestaoNome] = useState<string | null>(null);
  const [depFiltro, setDepFiltro] = useState<"proprio" | "terceiro">("proprio");

  // SIEG — consulta de 1 chave (não é o painel de sincronização em lote, que fica só na lista)
  const [siegChave, setSiegChave] = useState("");
  const [siegLoading, setSiegLoading] = useState(false);
  const [wizardResyncando,  setWizardResyncando]  = useState(false);
  const [xmlSemItens,       setXmlSemItens]       = useState(false);
  const xmlRawRef = useRef<string | null>(null);

  // Dropdown customizado de fornecedor (nome + CNPJ em colunas separadas)
  const [pessoaDropOpen, setPessoaDropOpen] = useState(false);
  const [pessoaBusca,    setPessoaBusca]    = useState("");

  // Wizard
  const [etapa,   setEtapa]   = useState<Etapa>("cabecalho");
  const [orig,    setOrig]    = useState<OrigEscolha>("manual");
  const [tipo,    setTipo]    = useState<TipoEntrada>("insumos");
  const [saving,  setSaving]  = useState(false);
  const [err,     setErr]     = useState("");
  const [carregandoNf, setCarregandoNf] = useState(!!id);

  const [nfEdit, setNfEdit] = useState<NfEntrada | null>(null);
  // Retorno de bem do imobilizado: remessas abertas (Transferência de Máquinas) que esta NF pode baixar
  const [transfCandidatas, setTransfCandidatas] = useState<TransferenciaMaquina[]>([]);
  const [transfVinculoId, setTransfVinculoId] = useState("");
  const [refNfeXml, setRefNfeXml] = useState("");

  // Operações Gerenciais ativas — usado no select do cabeçalho e no cálculo
  // de modoDireto (combustível/manutenção/CC) em Apropriação Direta.
  const [reclassOps, setReclassOps] = useState<OperacaoGerencial[]>([]);

  // Cabeçalho da NF
  const [cab, setCab] = useState({
    numero: "", serie: "1", chave_acesso: "",
    emitente_nome: "", emitente_cnpj: "",
    emitente_municipio: "", emitente_estado: "",
    nome_destinatario: "", cnpj_destino: "",
    pessoa_id: "", cfop: "",
    data_emissao: "", data_entrada: new Date().toISOString().split("T")[0],
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
    vinculo_atividade: "rural" as "rural" | "pessoa_fisica" | "investimento" | "nao_tributavel",
    entidade_contabil: "pf" as "pf" | "pj",
    valor_ipi:     "",
    valor_st:      "",
    valor_fcp_st:  "",
    valor_difal:   "",
    valor_desconto:"",
    valor_icms_deson: "",
  });
  const [anosSafra,   setAnosSafra]   = useState<AnoSafra[]>([]);
  const [ciclosNF,    setCiclosNF]    = useState<Ciclo[]>([]);
  const [savingForn, setSavingForn] = useState(false);
  const [ccGlobalMaquinaId, setCcGlobalMaquinaId] = useState("");

  // Itens
  const [itens, setItens] = useState<ItemRascunho[]>([ITEM_VAZIO()]);

  // Leitor de chave (código de barras → SEFAZ)
  const [leitorChave, setLeitorChave]     = useState("");
  const [leitorLoading, setLeitorLoading] = useState(false);
  const [leitorErro, setLeitorErro]       = useState<string | null>(null);
  const leitorRef = useRef<HTMLInputElement>(null);

  // Parcelamento da CP gerada pelo processamento da NF
  const [nfCondicao,    setNfCondicao]    = useState<"avista" | "prazo">("avista");
  const [nfQtdParcelas, setNfQtdParcelas] = useState("2");
  const [nfFreq,        setNfFreq]        = useState("1");
  const [nfParcelas,    setNfParcelas]    = useState<{ data: string; valorMask: string }[]>([]);

  // Modal: exclusão de NF com reversão
  const [modalExcluir, setModalExcluir] = useState<{
    nf: NfEntrada;
    lancamento: { id: string; status: string; lote_id: string | null; conta_bancaria: string | null } | null;
    verificando: boolean;
    excluindo: boolean;
    bloqueado: boolean;
  } | null>(null);

  // Modal: cadastro rápido de insumo dentro do wizard
  const [modalNovoInsumo, setModalNovoInsumo] = useState<{ itemKey: string; nome: string } | null>(null);
  const [formNovoInsumo, setFormNovoInsumo] = useState<{
    nome: string; categoria: Insumo["categoria"]; unidade: Insumo["unidade"];
  }>({ nome: "", categoria: "outros", unidade: "un" });
  const [novoInsumoSaving, setNovoInsumoSaving] = useState(false);
  const [novoInsumoErr,    setNovoInsumoErr]    = useState("");

  // ── Devolução de Compra — emite NF-e de devolução de verdade (saída,
  // volta ao fornecedor) antes de escriturar qualquer coisa no sistema.
  const [fiscalModulos, setFiscalModulos] = useState<Array<{ modulo: string; config: Record<string, string> }>>([]);
  interface DevItem extends ItemDevolucao {
    key: string;
    qtdOriginal: number;
    qtdOriginalNF?: number;
    unidadeOriginalNF?: string;
    ncm?: string;
  }
  const [devModal,   setDevModal]   = useState(false);
  const [devNfOrig,  setDevNfOrig]  = useState<NfEntrada | null>(null);
  const [devCpfHint, setDevCpfHint] = useState<string | undefined>(undefined);
  const [devFatorDesconto, setDevFatorDesconto] = useState(1);
  const [devItens,   setDevItens]   = useState<DevItem[]>([]);
  const [devCfop,    setDevCfop]    = useState("5201");
  const [devData,    setDevData]    = useState(new Date().toISOString().split("T")[0]);
  const [devVenc,    setDevVenc]    = useState("");
  const [devObs,     setDevObs]     = useState("");
  const [devSaving,  setDevSaving]  = useState(false);
  const [devErr,     setDevErr]     = useState("");

  // ── Reclassificação pós-processamento — só muda OG/CC, não mexe em
  // estoque/financeiro já lançado.
  const [modalReclass,  setModalReclass]  = useState<NfEntrada | null>(null);
  const [reclassOpId,   setReclassOpId]   = useState("");
  const [reclassCC,     setReclassCC]     = useState("");
  const [reclassSaving, setReclassSaving] = useState(false);
  const [reclassErr,    setReclassErr]    = useState("");

  const xmlInputRef = useRef<HTMLInputElement>(null);

  // ── Carregar cadastros de apoio (uma vez, ao montar) — substitui o
  // carregar() de lista da página original, que também alimentava esses
  // mesmos estados (insumos/depositos/pessoas/centros/maquinas/regrasClass/
  // anosSafra/pedidos) além dos estados só-de-grid que ficaram pra trás.
  const carregarApoio = useCallback(async () => {
    if (!fazendaId) return;
    const idsParaNf = fazendaIds.length > 1 ? fazendaIds : [fazendaId];
    const [insData, depData, pesData] = await Promise.all([
      listarInsumosParaConta(contaId, fazendaId),
      listarDepositosMulti(idsParaNf),
      listarPessoasDaConta(fazendaId),
    ]);
    setInsumos(insData);
    setDepositos(depData);
    setPessoas(pesData);
    try { setCentros(await listarCentrosCustoGeralDaConta(fazendaId)); } catch {}
    try { setMaquinas(await listarMaquinas(fazendaId)); } catch {}
    try { setRegrasClass(await listarRegrasClassificacao(fazendaId)); } catch {}
    try { setReclassOps(await listarOperacoesGerenciaisAtivasDaConta({ tipo: "despesa", permite: "cp_cr" }, fazendaId)); } catch {}
    try { setAnosSafra(await listarAnosSafra(fazendaId)); } catch {}
    try {
      const { data } = await supabase
        .from("pedidos_compra")
        .select("id, numero, nr_pedido, fornecedor_id, contato_fornecedor, status, ano_safra_id, ciclo_id, data_vencimento")
        .in("fazenda_id", fazendaIds)
        .in("status", ["rascunho", "aprovado", "parcialmente_entregue", "entregue"])
        .order("created_at", { ascending: false });
      setPedidos((data ?? []) as PedidoMin[]);
    } catch {}
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fazendaId, fazendaIds, contaId]);

  useEffect(() => { carregarApoio(); }, [carregarApoio]);

  // ── Helpers ─────────────────────────────────────────────────
  const nomeDeposito   = (id: string) => depositos.find(d => d.id === id)?.nome ?? "—";
  const nomeInsumo     = (id: string) => insumos.find(i => i.id === id)?.nome ?? "—";
  // Linhas do pedido vinculado que correspondem a um produto — quando há mais
  // de uma (embalagens/valores fiscais diferentes do mesmo produto no mesmo
  // pedido), a entrega não pode ser calculada só pelo produto: precisa saber
  // qual linha exata está sendo atendida.
  const linhasPedidoDoProduto = (insumoId: string) =>
    pedidoItensVinculado.filter(pi => pi.insumo_id === insumoId);
  // ccOpts: usa wCentros (específico da fazenda da NF) com fallback para centros (da conta)
  // Garante que o dropdown de CC nunca fique vazio enquanto wCentros carrega
  const ccOpts = wCentros.length > 0 ? wCentros : centros;
  const ccManutencao   = (id: string) => !!ccOpts.find(c => c.id === id)?.manutencao_maquinas;
  async function abrirNovo() {
    setNfEdit(null);
    setEtapa("cabecalho");
    setOrig("manual");
    setTipo("insumos");
    setCab({
      numero: "", serie: "1", chave_acesso: "",
      emitente_nome: "", emitente_cnpj: "",
      emitente_municipio: "", emitente_estado: "",
      nome_destinatario: "", cnpj_destino: "",
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
      valor_ipi: "", valor_st: "", valor_fcp_st: "", valor_difal: "", valor_desconto: "", valor_icms_deson: "",
    });
    setItens([ITEM_VAZIO()]);
    setErr("");
    setXmlSemItens(false);
    setSiegChave("");
    setLeitorChave("");
    setLeitorErro(null);
    setNfCondicao("avista");
    setNfParcelas([]);
    setNfQtdParcelas("2");
    setNfFreq("1");
    // Carrega CC/depósitos frescos da fazenda ativa (evita race condition com centros ainda carregando)
    if (fazendaId) await carregarWizardData(fazendaId);
  }

  // ── Abrir edição ──────────────────────────────────────────
  async function abrirEditar(nf: NfEntrada) {
    // Garante wProdutores (e demais dados auxiliares) carregados antes de abrir —
    // achado real: abrir uma NF direto da lista (sem passar pelo fluxo de "nova NF")
    // nunca disparava esse carregamento, então produtorPorCnpj() abaixo rodava
    // contra um array vazio e nunca auto-preenchia o Produtor.
    await carregarWizardData(nf.fazenda_id ?? fazendaId ?? "");
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
      nome_destinatario: nf.nome_destinatario ?? "",
      cnpj_destino:      nf.cnpj_destino      ?? "",
      pessoa_id: nf.pessoa_id ?? pessoaPorCnpj(nf.emitente_cnpj ?? ""),
      cfop: nf.cfop ?? "",
      data_emissao: nf.data_emissao,
      data_entrada: nf.data_entrada ?? new Date().toISOString().split("T")[0],
      // "Valor Produtos" precisa ser o BRUTO (o painel de impostos soma/subtrai por cima pra
      // chegar no valor líquido salvo em nf.valor_total). NFs processadas depois da correção têm
      // valor_produtos salvo separadamente (bruto de verdade); NFs mais antigas ou importadas via
      // SIEG nunca tiveram esse campo preenchido — nesse caso cai em nf.valor_total (histórico:
      // podia já ser líquido), e é corrigido de novo abaixo assim que os itens carregam (a soma dos
      // itens é sempre bruta, não importa a origem). Achado real: reabrir uma NF assim e preencher
      // ICMS Deson subtraía o desconto DUAS vezes (nf.valor_total já vinha líquido).
      valor_total: String(nf.valor_produtos || nf.valor_total),
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
      // Produtor = destinatário da NF (nosso produtor, CPF no campo cnpj_destino)
      produtor_id: nf.produtor_id ?? produtorPorCnpj(nf.cnpj_destino ?? "", nf.nome_destinatario ?? undefined),
      ie_produtor: (nf as Record<string,unknown>).ie_produtor as string ?? "",
      vinculo_atividade: (nf.vinculo_atividade ?? "rural") as "rural" | "pessoa_fisica" | "investimento" | "nao_tributavel",
      entidade_contabil: (nf.entidade_contabil ?? "pf") as "pf" | "pj",
      valor_ipi:      String((nf as Record<string,unknown>).valor_ipi      ?? ""),
      valor_st:       String((nf as Record<string,unknown>).valor_st       ?? ""),
      valor_fcp_st:   String((nf as Record<string,unknown>).valor_fcp_st   ?? ""),
      valor_difal:    String((nf as Record<string,unknown>).valor_difal    ?? ""),
      valor_desconto: String((nf as Record<string,unknown>).valor_desconto ?? ""),
      valor_icms_deson: String((nf as Record<string,unknown>).valor_icms_deson ?? ""),
    });
    // Carregar itens existentes
    let itensCarregadosDoBd = false;
    try {
      const itensDB = await listarNfEntradaItens(nf.id);
      if (itensDB.length > 0) {
        itensCarregadosDoBd = true;
        setItens(itensDB.map(i => {
          const fator   = i.fator_conversao ?? 1;
          // Prefere a quantidade original persistida (qtd_nf) — só reverte por
          // fator_conversao em itens antigos, processados antes dessa coluna existir.
          const qtdNf   = i.qtd_nf ?? (fator > 0 ? i.quantidade / fator : i.quantidade);
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
            pedido_item_id:     i.pedido_item_id       ?? "",
            tipo_apropiacao:    i.tipo_apropiacao,
            deposito_id:        i.deposito_id         ?? "",
            bomba_id:           i.bomba_id            ?? "",
            maquina_id:         i.maquina_id          ?? "",
            centro_custo_id:    i.centro_custo_id     ?? "",
            maquinas_rateio:    Array.isArray(i.maquinas_rateio) ? i.maquinas_rateio : [],
            cst_icms:           (i as Record<string, unknown>).cst_icms as string ?? "",
            icms_retido:        !!(i as Record<string, unknown>).icms_retido,
            valor_icms_st:      (i as Record<string, unknown>).valor_icms_st as number ?? 0,
            horimetro:          i.horimetro ?? 0,
            lotes_semente:      Array.isArray(i.lotes_semente) ? i.lotes_semente : (i.lote_semente ? [{ numero: i.lote_semente }] : []),
            pa_nome:  i.principio_ativo_id ? i.descricao_produto : undefined,
            pa_auto:  !!i.principio_ativo_id,
          };
        }));
        // Sem valor_produtos confiável no cabeçalho (NF antiga ou importada via SIEG, que nunca
        // preencheu essa coluna): reconstrói o bruto pela soma dos itens, que é sempre o valor de
        // produto de cada linha — não importa a origem da NF.
        if (!nf.valor_produtos) {
          const somaItensBruto = itensDB.reduce((s, i) => s + (i.valor_total || 0), 0);
          if (somaItensBruto > 0) setCab(p => ({ ...p, valor_total: String(somaItensBruto) }));
        }
      }
    } catch { /* falha silenciosa — tenta XML abaixo */ }

    // Se BD não tem itens (NF importada via SIEG antes de salvar itens, ou erro no BD)
    // tenta carregar o XML do Storage (salvo pelo SIEG) ou da SEFAZ
    if (!itensCarregadosDoBd && nf.chave_acesso && nf.chave_acesso.replace(/\D/g,"").length === 44) {
      try {
        const xmlRes = await fetch("/api/nfe/xml-por-chave", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ fazendaId: nf.fazenda_id ?? fazendaId, chaveAcesso: nf.chave_acesso, ambiente: "producao" }),
        });
        const xmlJson = await xmlRes.json();
        if (xmlJson.ok && xmlJson.xmlCompleto) parsearXml(xmlJson.xmlCompleto);
      } catch { /* sem XML disponível — usuário preenche manualmente */ }
    }
    // NF pendente que já tem itens no BD (importada via Sieg): o XML é a fonte dos totais e das parcelas.
    if (itensCarregadosDoBd && nf.status !== "processada" && nf.chave_acesso && nf.chave_acesso.replace(/\D/g,"").length === 44) {
      try {
        const xr = await fetch("/api/nfe/xml-por-chave", { method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ fazendaId: nf.fazenda_id ?? fazendaId, chaveAcesso: nf.chave_acesso, ambiente: "producao" }) });
        const xj = await xr.json();
        if (xj.ok && xj.xmlCompleto) aplicarTotaisDoXml(xj.xmlCompleto);
      } catch { /* sem XML: mantém os valores do cadastro */ }
    }
    setEtapa("cabecalho");
    setErr("");
    // Carrega CC/depósitos/pedidos frescos para a fazenda desta NF (sempre fresh, sem cache)
    const nfFazId = nf.fazenda_id ?? fazendaId ?? "";
    await carregarWizardData(nfFazId || fazendaId || "");
  }

  // Re-sync de uma NF diretamente de dentro do wizard (sem fechar o modal)
  async function resyncWizard() {
    if (!nfEdit?.chave_acesso || !fazendaId) return;
    setWizardResyncando(true);
    try {
      const base  = nfEdit.data_emissao ?? new Date().toISOString().slice(0, 10);
      const dtIni = new Date(new Date(base).getTime() - 7 * 86_400_000).toISOString().slice(0, 10);
      const dtFim = new Date(new Date(base).getTime() + 7 * 86_400_000).toISOString().slice(0, 10);
      const res = await fetch("/api/integracoes/sieg-sync", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fazenda_id: nfEdit.fazenda_id ?? fazendaId,
          data_inicio: dtIni, data_fim: dtFim,
          force_reimport: true,
          chaves_acesso: [nfEdit.chave_acesso],
        }),
      });
      const d = await res.json() as Record<string, unknown>;
      if (d.erro) { alert(`Erro ao re-sincronizar: ${d.erro}`); return; }
      // Recarrega itens do banco (agora populados pelo re-sync)
      const novosItens = await listarNfEntradaItens(nfEdit.id);
      if (novosItens.length > 0) {
        setItens(novosItens.map(i => {
          const fator  = i.fator_conversao ?? 1;
          // Prefere a quantidade original persistida (qtd_nf) — só reverte por
          // fator_conversao em itens antigos, processados antes dessa coluna existir.
          const qtdNf  = i.qtd_nf ?? (fator > 0 ? i.quantidade / fator : i.quantidade);
          const convKey = fator !== 1
            ? (TABELA_CONVERSAO.find(c => Math.abs((c.fator ?? 1) - fator) < 0.00001)?.key ?? "")
            : "";
          return {
            key: i.id, descricao_nf: i.descricao_nf ?? i.descricao_produto,
            ncm: i.ncm ?? "", cfop: i.cfop ?? "",
            unidade_nf: i.unidade_nf ?? i.unidade, qtd_nf: qtdNf,
            vunit_nf: i.valor_unitario, valor_total: i.valor_total,
            conversao_key: convKey, quantidade: i.quantidade,
            valor_unitario: i.valor_unitario, fator_conversao: fator,
            insumo_id: i.insumo_id ?? "", principio_ativo_id: i.principio_ativo_id ?? "",
            nome_comercial_ref: i.nome_comercial_ref ?? "", pedido_item_id: i.pedido_item_id ?? "",
            tipo_apropiacao: i.tipo_apropiacao,
            deposito_id: i.deposito_id ?? "", bomba_id: i.bomba_id ?? "",
            maquina_id: i.maquina_id ?? "", centro_custo_id: i.centro_custo_id ?? "",
            maquinas_rateio: Array.isArray(i.maquinas_rateio) ? i.maquinas_rateio : [],
            horimetro: i.horimetro ?? 0,
            lotes_semente: Array.isArray(i.lotes_semente) ? i.lotes_semente : (i.lote_semente ? [{ numero: i.lote_semente }] : []),
            pa_nome: i.principio_ativo_id ? i.descricao_produto : undefined,
            pa_auto: !!i.principio_ativo_id,
            cst_icms: (i as Record<string, unknown>).cst_icms as string ?? "",
            icms_retido: !!(i as Record<string, unknown>).icms_retido,
            valor_icms_st: (i as Record<string, unknown>).valor_icms_st as number ?? 0,
          };
        }));
        // Atualiza nfEdit com destinatário preenchido pelo re-sync
        const { data: nfAtual } = await supabase.from("nf_entradas").select("cnpj_destino,nome_destinatario").eq("id", nfEdit.id).maybeSingle();
        if (nfAtual) {
          setNfEdit(p => p ? { ...p, nome_destinatario: nfAtual.nome_destinatario ?? p.nome_destinatario, cnpj_destino: nfAtual.cnpj_destino ?? p.cnpj_destino } : p);
        }
      } else {
        alert("Re-sincronização concluída, mas o XML do SIEG ainda não tem itens para esta NF.");
      }
    } catch (e) { alert(`Erro: ${e}`); }
    finally { setWizardResyncando(false); }
  }

  // Duplicatas do XML (<cobr><dup>) viram as parcelas do CP — o total das duplicatas é o valor LÍQUIDO da
  // nota (com desconto/impostos), não a divisão dos produtos.
  function aplicarDuplicatasXml(doc: Document) {
    const dups = Array.from(doc.getElementsByTagName("dup"));
    const lista = dups.map(d => ({
      data:  (d.getElementsByTagName("dVenc")[0]?.textContent ?? "").slice(0, 10),
      valor: parseFloat(d.getElementsByTagName("vDup")[0]?.textContent ?? "0") || 0,
    })).filter(d => d.data && d.valor > 0);
    if (lista.length > 1) {
      setNfCondicao("prazo");
      setNfQtdParcelas(String(lista.length));
      setNfParcelas(lista.map(d => ({ data: d.data, valorMask: d.valor.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) })));
    }
  }

  // NF já importada (Sieg) reaberta no assistente: os TOTAIS da nota (desconto, IPI, ST, FCP-ST, DIFAL,
  // ICMS deson.) e as duplicatas vêm do XML — o cadastro guardava só o vNF. Só cabeçalho: itens não mudam.
  function aplicarTotaisDoXml(xmlText: string) {
    try {
      const doc = new DOMParser().parseFromString(xmlText, "text/xml");
      if (doc.querySelector("parsererror")) return;
      const tot = doc.getElementsByTagName("ICMSTot")[0];
      const g = (tag: string) => parseFloat(tot?.getElementsByTagName(tag)[0]?.textContent ?? "0") || 0;
      const vProd = g("vProd");
      if (vProd <= 0) return;
      const f = (n: number) => (n > 0 ? String(n) : "");
      setCab(p => ({
        ...p,
        valor_total: String(vProd),
        valor_ipi: f(g("vIPI")), valor_st: f(g("vST")), valor_fcp_st: f(g("vFCPST")),
        valor_difal: f(g("vICMSUFDest")), valor_desconto: f(g("vDesc")), valor_icms_deson: f(g("vICMSDeson")),
      }));
      aplicarDuplicatasXml(doc);
      setRefNfeXml(doc.getElementsByTagName("refNFe")[0]?.textContent?.trim() ?? "");
    } catch { /* mantém o que já está */ }
  }

  // ── Parse XML ─────────────────────────────────────────────
  function parsearXml(xmlText: string) {
    // Armazena o XML bruto para upload no Storage em salvarRascunho()
    xmlRawRef.current = xmlText;
    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(xmlText, "text/xml");
      const emit = doc.querySelector("emit");
      const dest = doc.querySelector("dest");
      const ide  = doc.querySelector("ide");
      const total = doc.querySelector("total ICMSTot, ICMSTot");

      const xNome   = emit?.querySelector("xNome")?.textContent ?? "";
      const cnpj    = emit?.querySelector("CNPJ")?.textContent ?? "";
      const nNF     = ide?.querySelector("nNF")?.textContent   ?? "";
      const serie   = ide?.querySelector("serie")?.textContent ?? "1";
      const dhEmi   = ide?.querySelector("dhEmi")?.textContent ?? "";
      const natOp   = ide?.querySelector("natOp")?.textContent ?? "";
      const vNF     = total?.querySelector("vNF")?.textContent ?? "0";
      // Totais de impostos do <ICMSTot> — hoje esses campos eram só manuais (o usuário tinha que
      // digitar), então uma NF com ICMS-ST/IPI/DIFAL processava sem esses valores se ninguém lembrasse.
      const getTot = (tag: string) => parseFloat(total?.querySelector(tag)?.textContent ?? "0") || 0;
      const vProdTot = getTot("vProd");   // total dos produtos, SEM os impostos — é o que preenche "Valor Total" (o painel de impostos soma por cima)
      const vSTTot   = getTot("vST");     // ICMS retido por Substituição Tributária
      const vIPITot  = getTot("vIPI");
      const vFCPSTTot = getTot("vFCPST");
      const vDifalTot = getTot("vICMSUFDest");  // DIFAL devido à UF de destino
      const vDescTot  = getTot("vDesc");
      const vIcmsDesonTot = getTot("vICMSDeson");
      const chNFe   = doc.querySelector("chNFe, infNFe")?.getAttribute("Id")?.replace(/^NFe/, "") ?? "";
      const enderEmit = emit?.querySelector("enderEmit");
      const xMun    = enderEmit?.querySelector("xMun")?.textContent ?? "";
      const ufEmit  = enderEmit?.querySelector("UF")?.textContent   ?? "";

      // Destinatário — campo <dest> presente na NF-e completa (não apenas no resumo SIEG)
      const destNome = dest?.querySelector("xNome")?.textContent ?? "";
      const destCnpj = (dest?.querySelector("CNPJ") ?? dest?.querySelector("CPF"))?.textContent ?? "";

      // Tenta classificação automática com o CNPJ/nome do emitente
      const regraHeader = aplicarRegraClassificacao(regrasClass, cnpj, xNome, "", "", "");
      setSugestaoNome(regraHeader?.nome ?? null);

      // Pagamento — <pag><detPag><tPag>
      const TPAG_MAP: Record<string, string> = {
        "01": "Dinheiro", "02": "Cheque", "03": "Cartão de Crédito",
        "04": "Cartão de Débito", "05": "Crédito Loja",
        "14": "Duplicata / Boleto", "15": "Boleto Bancário",
        "17": "PIX", "18": "Transferência Bancária",
        "90": "Sem Pagamento", "99": "Outros",
      };
      const tPagEl  = doc.querySelector("pag detPag tPag") ?? doc.getElementsByTagName("tPag")[0];
      const tPagCod = tPagEl?.textContent ?? "";
      const formaPagXml = TPAG_MAP[tPagCod] || (tPagCod ? `Cód ${tPagCod}` : "");

      // Vencimento — <cobr><dup> (1ª duplicata) ou <cobr><fat>
      const cobr     = doc.querySelector("cobr") ?? doc.getElementsByTagName("cobr")[0];
      const dupEl    = cobr?.querySelector("dup") ?? cobr?.getElementsByTagName("dup")[0];
      const fatEl    = cobr?.querySelector("fat") ?? cobr?.getElementsByTagName("fat")[0];
      const dVencRaw = dupEl?.querySelector("dVenc")?.textContent
                    ?? dupEl?.getElementsByTagName("dVenc")[0]?.textContent
                    ?? fatEl?.querySelector("dVenc")?.textContent
                    ?? fatEl?.getElementsByTagName("dVenc")[0]?.textContent
                    ?? "";
      const vencISO = dVencRaw ? dVencRaw.substring(0, 10) : "";

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
        // Antes usava vNF (total FINAL, já com impostos embutidos) — o painel de "Impostos
        // Adicionados" soma por cima do Valor Total, então usar vNF fazia contar o ST/IPI/DIFAL
        // duas vezes na hora de salvar. vProd (produtos, sem impostos) é o valor certo aqui.
        valor_total: vProdTot > 0 ? String(vProdTot) : vNF,
        valor_ipi:     vIPITot   > 0 ? String(vIPITot)   : p.valor_ipi,
        valor_st:      vSTTot    > 0 ? String(vSTTot)    : p.valor_st,
        valor_fcp_st:  vFCPSTTot > 0 ? String(vFCPSTTot) : p.valor_fcp_st,
        valor_difal:   vDifalTot > 0 ? String(vDifalTot) : p.valor_difal,
        valor_desconto: vDescTot > 0 ? String(vDescTot)  : p.valor_desconto,
        valor_icms_deson: vIcmsDesonTot > 0 ? String(vIcmsDesonTot) : p.valor_icms_deson,
        natureza: natOp,
        // Destinatário da NF (nossa fazenda — preenchido se presente no XML)
        nome_destinatario: destNome || p.nome_destinatario,
        cnpj_destino:      destCnpj || p.cnpj_destino,
        // auto-preenche fornecedor se CNPJ bater com cadastro
        pessoa_id: pessoaAutoId || p.pessoa_id,
        // auto-preenche produtor pelo CPF/CNPJ do destinatário da NF
        produtor_id: produtorPorCnpj(destCnpj, destNome) || p.produtor_id,
        // aplica sugestão apenas se o campo ainda não foi preenchido
        operacao_gerencial_id: regraHeader?.operacao_gerencial_id ?? p.operacao_gerencial_id,
        centro_custo_id:       regraHeader?.centro_custo_id       ?? p.centro_custo_id,
        // Pagamento extraído do XML
        forma_pagamento:   formaPagXml  || p.forma_pagamento,
        data_vencimento_cp: vencISO     || p.data_vencimento_cp,
      }));
      aplicarDuplicatasXml(doc);
      setRefNfeXml(doc.getElementsByTagName("refNFe")[0]?.textContent?.trim() ?? "");

      // Verifica se o DOMParser retornou um erro de parse
      if (doc.querySelector("parsererror")) {
        setErr("Erro ao ler o XML da NF-e. Verifique se o arquivo não está corrompido ou com encoding inválido.");
        return;
      }

      // Itens — querySelectorAll pode falhar com xmlns declarado; fallback para getElementsByTagName
      let dets = Array.from(doc.querySelectorAll("det"));
      if (dets.length === 0) dets = Array.from(doc.getElementsByTagName("det"));
      setXmlSemItens(dets.length === 0);
      if (dets.length > 0) {
        setItens(dets.map(det => {
          // getElementsByTagName é mais robusto que querySelector em XMLs com namespace
          const getTag = (parent: Element, tag: string) =>
            parent.querySelector(tag)?.textContent ?? parent.getElementsByTagName(tag)[0]?.textContent ?? "";
          const prod = det.querySelector("prod") ?? det.getElementsByTagName("prod")[0];
          if (!prod) return { ...ITEM_VAZIO() };
          const xProd  = getTag(prod, "xProd");
          const NCM    = getTag(prod, "NCM");
          const CFOP   = getTag(prod, "CFOP");
          const uCom   = getTag(prod, "uCom") || "UN";
          const qCom   = parseFloat(getTag(prod, "qCom")  || "0");
          const vUnCom = parseFloat(getTag(prod, "vUnCom") || "0");
          const vProd  = parseFloat(getTag(prod, "vProd")  || "0");
          // Unidade tributável — em sementes costuma ter qTrib em KG mesmo quando uCom = BAG
          const uTrib  = getTag(prod, "uTrib");
          const qTrib  = parseFloat(getTag(prod, "qTrib") || "0");

          // ── Detecção de conversão BAG → KG via campos da NF ─────────────────
          // Se uCom = BAG e uTrib tem o peso, pre-preenche conversão manual com o total.
          const uComCanon  = canonUnidade(uCom);
          const uTribCanon = canonUnidade(uTrib);
          const isBag      = uComCanon === "bag";

          let convKey    = "";
          let qtdCatalogo = qCom; // default = NF qty
          let qtdKgPreenchida = 0;

          if (isBag) {
            convKey = "bag→kg";
            if (uTribCanon === "kg" && qTrib > 0) {
              qtdCatalogo     = qTrib;
              qtdKgPreenchida = qTrib;
            } else if (uTribCanon === "ton" && qTrib > 0) {
              qtdCatalogo     = qTrib * 1000;
              qtdKgPreenchida = qTrib * 1000;
            }
            // Sem qTrib: conversão bag→kg selecionada mas qtd_catalogo = 0 (usuário digita)
          } else {
            // Tenta auto-matching: unidade NF bate com alguma conversão conhecida "de"
            const autoMatch = TABELA_CONVERSAO.find(
              c => c.tipo === "auto" && uComCanon === c.de
            );
            if (autoMatch && autoMatch.fator) {
              convKey     = autoMatch.key;
              qtdCatalogo = qCom * autoMatch.fator;
            } else {
              qtdCatalogo = qCom;
            }
          }

          const fatorDeriv = qCom > 0 ? qtdCatalogo / qCom : 1;

          // ICMS do item — o filho de <imposto><ICMS> tem nome dinâmico (ICMS00, ICMS10, ICMS60,
          // ICMSSN101, ICMSSN500...); CST é do regime normal, CSOSN do Simples Nacional. CSTs que
          // indicam ICMS já retido/recolhido por Substituição Tributária: 10, 30, 60, 70 (normal) e
          // 201, 202, 203, 500 (Simples). vICMSST é o valor do imposto retido, quando informado.
          const icmsBlock = det.querySelector("imposto ICMS") ?? det.getElementsByTagName("ICMS")[0];
          const icmsFilho = icmsBlock?.firstElementChild ?? null;
          const cstTxt   = icmsFilho ? getTag(icmsFilho, "CST") : "";
          const csosnTxt = icmsFilho ? getTag(icmsFilho, "CSOSN") : "";
          const cstIcms  = cstTxt || csosnTxt;
          const CSTS_ST_RETIDO = ["10", "30", "60", "70", "201", "202", "203", "500"];
          const icmsRetido = CSTS_ST_RETIDO.includes(cstIcms);
          const vIcmsSt = icmsFilho ? parseFloat(getTag(icmsFilho, "vICMSST") || "0") || 0 : 0;

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
            insumo_id: "", principio_ativo_id: "", nome_comercial_ref: "", pedido_item_id: "",
            lotes_semente: [],
            tipo_apropiacao: tipoApropDeCfop(CFOP, "estoque"),
            deposito_id: "", bomba_id: "", maquina_id: "",
            centro_custo_id: regraItem?.centro_custo_id ?? "",
            maquinas_rateio: [], horimetro: 0,
            cst_icms: cstIcms, icms_retido: icmsRetido, valor_icms_st: vIcmsSt,
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
      const res = await fetch(`/api/sieg?chave=${siegChave.trim()}&fazenda_id=${fazendaId ?? ""}`);
      const errText = !res.ok ? await res.text().catch(() => "Erro na consulta Sieg") : "";
      if (!res.ok) throw new Error(errText || "NF não encontrada no Sieg");
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
    // Guard: uma NF já processada não pode ser editada por aqui — isso reabria o status dela
    // ("pendente") sem passar pelo Estornar, deixando estoque/financeiro já lançados enquanto o
    // cabeçalho mudava por baixo. Confere local e no banco (estado local pode estar desatualizado).
    if (nfEdit?.status === "processada") {
      setErr("Esta NF já foi processada. Estorne antes de editar (reverte estoque e financeiro), edite e processe de novo.");
      return null;
    }
    if (nfEdit) {
      const { data: nfAtual } = await supabase.from("nf_entradas").select("status").eq("id", nfEdit.id).single();
      if (nfAtual?.status === "processada") {
        setErr("Esta NF já foi processada. Estorne antes de editar (reverte estoque e financeiro), edite e processe de novo.");
        return null;
      }
    }
    const payload: Omit<NfEntrada, "id" | "created_at"> = {
      fazenda_id:            fazendaId,
      numero:                cab.numero,
      serie:                 cab.serie,
      chave_acesso:          cab.chave_acesso || undefined,
      emitente_nome:         cab.emitente_nome,
      emitente_cnpj:         cab.emitente_cnpj || undefined,
      nome_destinatario:     cab.nome_destinatario || undefined,
      cnpj_destino:          cab.cnpj_destino || undefined,
      pessoa_id:             cab.pessoa_id    || undefined,
      cfop:                  cab.cfop         || undefined,
      data_emissao:          cab.data_emissao,
      data_entrada:          cab.data_entrada || undefined,
      valor_total:           (numBR(cab.valor_total)||0) + (numBR(cab.valor_ipi)||0) + (numBR(cab.valor_st)||0) + (numBR(cab.valor_fcp_st)||0) + (numBR(cab.valor_difal)||0) - (numBR(cab.valor_desconto)||0) - (numBR(cab.valor_icms_deson)||0),
      natureza:              cab.natureza     || undefined,
      status:                "pendente",
      origem:                orig,
      tipo_entrada:          cab.e_combustivel ? "combustivel" : (nfEdit?.tipo_entrada ? tipo : (tipo !== "insumos" ? tipo : undefined)),
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
      valor_produtos:        numBR(cab.valor_total) || 0,
      valor_ipi:             numBR(cab.valor_ipi)    || 0,
      valor_st:              numBR(cab.valor_st)     || 0,
      valor_fcp_st:          numBR(cab.valor_fcp_st) || 0,
      valor_difal:           numBR(cab.valor_difal)  || 0,
      valor_desconto:        numBR(cab.valor_desconto) || 0,
      valor_icms_deson:      numBR(cab.valor_icms_deson) || 0,
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

      // ── Persistência de itens + XML (imune a JWT expirado via API route) ──
      // Salva os itens brutos do estado atual e faz upload do XML no Storage.
      // Garante que reabrir a NF sempre mostre os itens corretamente.
      const itensPayload = itens
        .filter(i => i.descricao_nf?.trim())
        .map(i => ({
          descricao_nf:    i.descricao_nf,
          ncm:             i.ncm   || undefined,
          cfop:            i.cfop  || undefined,
          unidade_nf:      i.unidade_nf,
          quantidade:      i.quantidade,
          valor_unitario:  i.vunit_nf,
          valor_total:     i.valor_total,
          fator_conversao: i.fator_conversao ?? 1,
        }));

      const chaveRaw = (cab.chave_acesso || nf.chave_acesso || "").replace(/\D/g, "");
      fetch("/api/compras/nf-rascunho-itens", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nf_id:        nf.id,
          fazenda_id:   fazendaId,
          chave_acesso: chaveRaw.length === 44 ? chaveRaw : undefined,
          xml_text:     xmlRawRef.current ?? undefined,
          itens:        itensPayload,
        }),
      }).catch(() => { /* falha silenciosa — itens ainda podem ser salvos em processarNF */ });

      return nf;
    } catch (e: unknown) {
      const err = e as { message?: string; details?: string; hint?: string; code?: string };
      const msg = [err.message, err.details, err.hint].filter(Boolean).join(" | ");
      setErr(msg || JSON.stringify(e));
      return null;
    }
  }

  // ── Gerar grid de parcelas para parcelamento ─────────────
  function gerarParcelasNf() {
    const venc = cab.data_vencimento_cp;
    if (!venc) { alert("Informe o 1º vencimento antes de gerar as parcelas."); return; }
    const qtd  = Math.max(2, parseInt(nfQtdParcelas) || 2);
    const freq = Math.max(1, parseInt(nfFreq) || 1);
    // Total LÍQUIDO do cabeçalho (produtos + IPI/ST/FCP/DIFAL − desconto − ICMS deson.) — antes usava o
    // valor salvo/bruto e as parcelas somavam os produtos sem o desconto.
    const totalVal = numBR(cab.valor_total) + numBR(cab.valor_ipi) + numBR(cab.valor_st) + numBR(cab.valor_fcp_st) + numBR(cab.valor_difal) - numBR(cab.valor_desconto) - numBR(cab.valor_icms_deson);
    const valorParc = totalVal > 0 ? totalVal / qtd : 0;
    const novas = Array.from({ length: qtd }, (_, i) => {
      const d = new Date(venc + "T12:00");
      d.setMonth(d.getMonth() + i * freq);
      return { data: d.toISOString().split("T")[0], valorMask: valorParc.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) };
    });
    setNfParcelas(novas);
  }

  // ── Processar NF (finalizar) ──────────────────────────────
  async function processarNF() {
    if (!fazendaId || !nfEdit) return;
    // Guard local: evita duplo clique com estado local desatualizado
    if (nfEdit.status === "processada") {
      alert("Esta NF já foi processada. Para reprocessar, clique em 'Estornar' primeiro para reverter o estoque e o lançamento financeiro.");
      return;
    }
    // Guard DB: estado local pode estar desatualizado — verifica no banco antes de prosseguir
    const { data: nfAtual } = await supabase.from("nf_entradas").select("status").eq("id", nfEdit.id).single();
    if (nfAtual?.status === "processada") {
      alert("Esta NF já foi processada. Atualize a página para ver o estado atual.");
      return;
    }
    // Guard: operação gerencial é obrigatória.
    // Exceção: NF com classificação automática aplicada (sugestaoNome != null) —
    // a regra já carrega a informação gerencial e o bloqueio seria redundante.
    if (!cab.operacao_gerencial_id && !sugestaoNome && !CFOPS_BEM_SEM_PAGAMENTO.has((cab.cfop ?? "").trim())) {
      setErr("Selecione uma Operação Gerencial antes de processar a NF.");
      return;
    }
    // Guard: item de estoque/terceiro/VEF/remessa sem insumo ou princípio ativo associado
    // não pode ser processado — antes era só um aviso (⚠️ "não serão lançados no estoque")
    // e o item era silenciosamente ignorado, criando NF processada com valor de itens
    // maior que o efetivamente lançado. Item "C. Custo" (tipo_apropiacao "direto") é a
    // forma correta de lançar algo sem produto — continua permitido sem associação.
    for (const it of itens) {
      if (!it.descricao_nf.trim()) continue;
      if (tipo === "custo_direto" || it.tipo_apropiacao === "direto" || it.tipo_apropiacao === "maquinario") continue;
      if (!it.insumo_id && !it.principio_ativo_id) {
        setErr(`Item "${it.descricao_nf}": associe um insumo ou princípio ativo do catálogo antes de processar. Se não for um produto de estoque, lance-o numa NF do tipo "Apropriação Direta".`);
        return;
      }
    }
    // Guard: pedido vinculado tem o mesmo produto em mais de uma linha e o
    // item não diz qual linha está atendendo — sem isso a entrega do pedido
    // fica ambígua (o sistema não sabe se essa NF atende a linha de 760L ou
    // a de 560L, por exemplo, e a única saída seria adivinhar).
    if (cab.pedido_compra_id) {
      for (const it of itens) {
        if (!it.descricao_nf.trim() || !it.insumo_id) continue;
        if (linhasPedidoDoProduto(it.insumo_id).length > 1 && !it.pedido_item_id) {
          setErr(`Item "${it.descricao_nf}": o pedido vinculado tem "${nomeInsumo(it.insumo_id)}" em mais de uma linha — selecione qual linha do pedido este item está atendendo.`);
          return;
        }
      }
    }
    // Guard: lotes de semente com número mas sem peso — bloqueia (peso é obrigatório por lote)
    for (const it of itens) {
      if (!it.lotes_semente?.length || it.lotes_semente.length < 2) continue;
      const semPeso = it.lotes_semente.filter(l => l.numero && !(l.quantidade_kg ?? 0));
      if (semPeso.length > 0) {
        setErr(`Item "${it.descricao_nf || it.insumo_id}": lote(s) ${semPeso.map(l => l.numero || "sem número").join(", ")} sem peso informado. Preencha o peso de cada lote.`);
        return;
      }
      // Divergência de peso é permitida — o custo unitário será ajustado automaticamente
      // para manter o valor total da NF: custo/kg = valor_total / soma_lotes
    }
    // Guard: em Apropriação Direta, a Operação Gerencial escolhida no cabeçalho
    // decide o que cada item precisa — combustível pede o veículo, manutenção
    // pede rateio por frota somando 100%, qualquer outra OG pede o CC. Os três
    // são obrigatórios no seu respectivo modo (nenhum item passa em branco).
    if (tipo === "custo_direto") {
      for (const it of itens) {
        if (!it.descricao_nf.trim()) continue;
        // Achado real 29/09/2026 (pedido do dono): veículo deixou de ser obrigatório em
        // combustível — nem toda compra é abastecimento de um veículo específico (pode ser
        // reposição de tanque/bomba, ver o botão "É reposição de tanque" acima). Continua
        // disponível pra quem quer registrar no histórico de abastecimento; se informar o
        // veículo, o horímetro continua pedido (é o que alimenta esse histórico).
        if (modoDireto === "combustivel" && it.maquina_id && !it.horimetro) {
          setErr(`Item "${it.descricao_nf}": informe o hodômetro/horímetro do veículo — obrigatório pra registrar no histórico de abastecimento.`);
          return;
        }
        if (modoDireto === "combustivel" && !cab.centro_custo_id) {
          setErr(`Item "${it.descricao_nf}": selecione o Centro de Custo do lançamento (campo no topo da NF).`);
          return;
        }
        if (modoDireto === "combustivel" && !cab.ano_safra_id) {
          setErr(`Item "${it.descricao_nf}": selecione o Ano Safra (campo no topo da NF).`);
          return;
        }
        // Manutenção: rateio por frota é opcional (critério do operador). Sem máquina,
        // o custo entra normalmente no CC de manutenção, só não aparece no relatório
        // de custo por frota. Linhas em branco são ignoradas; se houver máquina
        // informada, o rateio precisa somar 100%.
        if (modoDireto === "manutencao") {
          const preenchidas = it.maquinas_rateio.filter(r => r.maquina_id);
          if (preenchidas.length > 0) {
            const totalPct = preenchidas.reduce((s, r) => s + (r.percentual || 0), 0);
            if (Math.abs(totalPct - 100) > 0.01) {
              setErr(`Item "${it.descricao_nf}": o rateio por frota soma ${totalPct.toFixed(1)}% — precisa somar exatamente 100%, ou remova as máquinas (opcional).`);
              return;
            }
          }
        }
        if (modoDireto === "cc" && !it.centro_custo_id) {
          setErr(`Item "${it.descricao_nf}": selecione o Centro de Custo.`);
          return;
        }
      }
    }
    // Guard: unidade que vai para o estoque precisa bater com a unidade do cadastro do
    // insumo — senão a quantidade da NF é creditada silenciosamente na unidade errada
    // (ex: NF em kg, insumo cadastrado em L). "ton" e "t" são tratadas como sinônimos.
    if (tipo === "insumos") {
      for (const it of itens) {
        if (!it.insumo_id) continue;
        const insumo = insumos.find(i => i.id === it.insumo_id);
        if (!insumo) continue;
        const conv = getConversao(it.conversao_key);
        const unidadeEfetiva = conv ? conv.para : it.unidade_nf;
        if (canonUnidade(unidadeEfetiva) !== canonUnidade(insumo.unidade)) {
          setErr(`Item "${it.descricao_nf || insumo.nome}": a unidade que vai para o estoque (${unidadeEfetiva || "—"}) não bate com a unidade cadastrada do insumo (${insumo.unidade}). Selecione uma conversão compatível em "Conversão de Unidade", ou corrija a unidade na NF. Se a conversão depender da densidade do produto (ex: L ↔ kg), calcule o fator manualmente fora do sistema e ajuste a quantidade antes de processar.`);
          return;
        }
      }
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

      // 1. Limpar itens E movimentos/financeiro vinculados antes de recriar.
      //    Itens são recriados com novos UUIDs a cada tentativa. Usa a mesma função
      //    de lib/db.ts que o Estornar usa — reverte o saldo do insumo antes de
      //    apagar a movimentação (o delete direto daqui não revertia, o que por si
      //    já deixava o saldo furado a cada reprocessamento) e limpa pelo link
      //    direto nf_entrada_id, não mais só nf_entrada_item_id (que orfaniza e
      //    escapa da limpeza se uma tentativa anterior falhou no meio do processo —
      //    causa raiz real da duplicação de estoque/CP na NF 26967, set/2026).
      await limparMovimentacoesEFinanceiroDaNf(nfEdit.id);
      await supabase.from("nf_entrada_itens").delete().eq("nf_entrada_id", nfEdit.id);

      // 1b. Recriar todos os itens do estado atual
      for (const it of itens) {
        if (!it.descricao_nf.trim()) continue;
        // Insumo (tipo "insumos") é sempre "estoque" — não existe mais toggle
        // de custo direto por item dentro desse modo (isso agora só existe
        // como o tipo de entrada "Apropriação Direta", que troca a NF inteira).
        const tipoAprp: NfEntradaItem["tipo_apropiacao"] =
          tipo === "vef"          ? "vef"     :
          tipo === "remessa"      ? "remessa" :
          tipo === "custo_direto" ? "direto"  :
          it.tipo_apropiacao;
        // Insumo/estoque nunca leva centro de custo na entrada — a apropriação
        // de custo é no consumo (quando sai do estoque pra uma operação), não
        // na compra. Limpa aqui também pra reprocessar uma NF antiga (de antes
        // dessa mudança) já corrigir o dado, não só bloquear na tela nova.
        if (tipo === "insumos") { it.centro_custo_id = ""; it.maquina_id = ""; }
        // Apropriação Direta: a OG do cabeçalho já definiu o modo do item (combustível
        // → veículo, manutenção → rateio por frota, outra → CC) — limpa os campos que
        // não fazem sentido no modo atual, pra reprocessar uma NF antiga também corrigir
        // dado deixado de um modo anterior (ex: trocou a OG depois de já ter marcado).
        if (tipo === "custo_direto") {
          if (modoDireto !== "combustivel") { it.maquina_id = ""; it.horimetro = 0; }
          it.maquinas_rateio = modoDireto === "manutencao" ? it.maquinas_rateio.filter(r => r.maquina_id) : [];
          if (modoDireto !== "cc") it.centro_custo_id = "";
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
          pedido_item_id:      it.pedido_item_id       || undefined,
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
          qtd_nf:              it.qtd_nf,       // quantidade como emitida na NF — nunca é alterada pela conversão
          valor_unitario:      it.vunit_nf,     // preço original da NF (custo real = valor_total/qtd em db.ts)
          valor_total:         it.valor_total,
          tipo_apropiacao:     tipoAprp,
          // Combustível não tem seletor de CC por item (usa o do cabeçalho, agora obrigatório
          // ali — veículo deixou de ser o campo obrigatório, ver guard acima).
          centro_custo_id:     it.centro_custo_id || (modoDireto === "combustivel" ? cab.centro_custo_id : undefined) || undefined,
          // Só envia quando usado (true / não-vazio) — evita mandar essas colunas em
          // toda NF de Apropriação Direta enquanto a Seção 271 (novas colunas) não
          // tiver sido executada no banco; item que não usa o recurso novo continua
          // processando normalmente mesmo antes da migration.
          e_combustivel:       (tipo === "custo_direto" && modoDireto === "combustivel") ? true : undefined,
          maquinas_rateio:     tipo === "custo_direto" && it.maquinas_rateio.length ? it.maquinas_rateio : undefined,
          horimetro:           (tipo === "custo_direto" && modoDireto === "combustivel" && it.horimetro) ? it.horimetro : undefined,
          lotes_semente:       it.lotes_semente?.length ? it.lotes_semente : undefined,
          lote_semente:        it.lotes_semente?.length === 1 ? it.lotes_semente[0].numero : undefined,
          alerta_preco:        false,
          // ICMS retido (ST) do XML — só enviado quando detectado, mesmo padrão de "não travar em
          // fazenda sem a migration nova" já usado acima pra maquinas_rateio/horimetro.
          cst_icms:            it.cst_icms || undefined,
          icms_retido:         it.icms_retido || undefined,
          valor_icms_st:       it.valor_icms_st || undefined,
        };
        await criarNfEntradaItem(itemPayload);
      }

      // 2. Processar: movimentações de estoque, CP, VEF etc.
      const itensDB = await listarNfEntradaItens(nfEdit.id);
      // Deriva a máquina do item de manutenção (primeiro item com maquina_id)
      const maquinaIdDominante = itensDB.find(i => i.maquina_id)?.maquina_id || undefined;
      // Achado real 28/09/2026: usava nfEdit.valor_total (o que foi salvo da ÚLTIMA vez que o
      // cabeçalho foi gravado) em vez do total calculado agora a partir de `cab` — se o usuário
      // ajustou Desconto ou ICMS Desonerado no cabeçalho e processou sem passar de novo pelo
      // "Avançar" (que é quem resalva o cabeçalho), o CP/estoque saíam com o total ANTIGO, sem o
      // ajuste, e por isso "o valor total da NF não bate". Agora recalcula sempre na hora de
      // processar, com a mesma fórmula usada no cabeçalho e nas parcelas (produtos + impostos −
      // desconto − ICMS deson.), e resalva o cabeçalho pra não ficar dessincronizado de novo.
      const totalLiquidoAgora = numBR(cab.valor_total) + numBR(cab.valor_ipi) + numBR(cab.valor_st)
        + numBR(cab.valor_fcp_st) + numBR(cab.valor_difal) - numBR(cab.valor_desconto) - numBR(cab.valor_icms_deson);
      if (Math.abs(totalLiquidoAgora - nfEdit.valor_total) > 0.01) {
        await atualizarNfEntrada(nfEdit.id, { valor_total: totalLiquidoAgora });
      }
      await processarNfEntrada(
        nfEdit.id,
        fazendaId,
        itensDB,
        totalLiquidoAgora,
        nfEdit.emitente_nome,
        nfEdit.data_emissao ?? nfEdit.data_entrada,
        nfEdit.emitente_cnpj,
        {
          nfeNumero:           nfEdit.numero,
          dataVencimentoCp:    cab.data_vencimento_cp || nfEdit.data_vencimento_cp,
          formaPagamento:      (nfEdit as Record<string,unknown>).forma_pagamento as string | undefined,
          tipoEntrada:         nfEdit.tipo_entrada,
          anoSafraId:          nfEdit.ano_safra_id,
          cicloId:             nfEdit.ciclo_id,
          operacaoGerencialId: cab.operacao_gerencial_id || nfEdit.operacao_gerencial_id || undefined,
          centroCustoId:       cab.centro_custo_id    || nfEdit.centro_custo_id    || undefined,
          pedidoCompraId:      cab.pedido_compra_id   || nfEdit.pedido_compra_id   || undefined,
          produtorId:          cab.produtor_id        || nfEdit.produtor_id        || undefined,
          maquinaId:           maquinaIdDominante,
          parcelas: (nfCondicao === "prazo" && nfParcelas.length > 1)
            ? nfParcelas.map(p => ({
                data:  p.data,
                valor: parseFloat(p.valorMask.replace(/\./g, "").replace(",", ".")) || 0,
              }))
            : undefined,
        },
      );

      // 2b. Verificação de integridade — confirma que o lançamento financeiro (CP)
      // foi realmente criado antes de marcar a NF como processada. Achado real:
      // uma NF ficou "processada", com estoque e itens ok, mas sem nenhum CP
      // vinculado — silenciosamente. NF só de remessa não gera CP (esperado);
      // qualquer outro caso sem CP/emp_lancamento agora é bloqueado aqui em vez
      // de deixar a NF marcada como concluída de forma enganosa.
      const temApenasRemessa = itensDB.length > 0 && itensDB.every(i => i.tipo_apropiacao === "remessa");
      const semPagamentoBem = CFOPS_BEM_SEM_PAGAMENTO.has(((cab.cfop || nfEdit.cfop) ?? "").trim());
      if (!temApenasRemessa && !semPagamentoBem) {
        const { data: nfPosProc } = await supabase
          .from("nf_entradas")
          .select("lancamento_id, emp_lancamento_id")
          .eq("id", nfEdit.id)
          .single();
        if (!nfPosProc?.lancamento_id && !nfPosProc?.emp_lancamento_id) {
          throw new Error("O estoque foi movimentado, mas o lançamento financeiro (CP) não foi criado. A NF NÃO foi marcada como processada — tente novamente; se o erro persistir, avise o suporte antes de reprocessar.");
        }
      }

      // 2c. Retorno de bem: baixa a remessa vinculada em Fiscal → Transferência de Máquinas
      if (transfVinculoId) {
        await atualizarTransferenciaMaquina(transfVinculoId, {
          status: "retornada",
          nf_retorno_chave:  cab.chave_acesso || nfEdit.chave_acesso || undefined,
          nf_retorno_numero: nfEdit.numero,
          nf_retorno_data:   cab.data_emissao || nfEdit.data_emissao || new Date().toISOString().slice(0, 10),
        });
      }

      // 3. Marcar como processada
      await atualizarNfEntrada(nfEdit.id, { status: "processada", processado_por: nomeUsuario ?? undefined });

      // 3b. Pedido vinculado que ainda não estava marcado "Fiscal" — achado real
      // 01/10/2026: um pedido criado sem marcar essa flag, mas que recebe uma NF
      // de verdade aqui, ficava com a tela de Entregas mostrando o formulário
      // manual errado e a quantidade entregue nunca batia (recalcularEntregaPedidoFiscal
      // já foi corrigido pra não depender só dessa flag, mas a tela de Entregas/
      // NFs Vinculadas ainda escolhe o layout certo por ela). Marca automaticamente
      // pra não precisar o usuário lembrar de ter marcado isso na criação do pedido.
      const pedidoVinculadoId = cab.pedido_compra_id || nfEdit.pedido_compra_id;
      if (pedidoVinculadoId) {
        const { data: pedAtual } = await supabase.from("pedidos_compra").select("fiscal").eq("id", pedidoVinculadoId).maybeSingle();
        if (pedAtual && !pedAtual.fiscal) {
          await supabase.from("pedidos_compra").update({ fiscal: true }).eq("id", pedidoVinculadoId);
        }
      }

      onSaved();
      onClose();
    } catch (e: unknown) {
      // Erros do Supabase (PostgrestError) são objetos simples, não `instanceof Error` —
      // sem esse fallback pro .message, a causa real ficava escondida atrás de um
      // "Erro ao processar NF" genérico, impossível de diagnosticar pela tela.
      const msg = e instanceof Error
        ? e.message
        : (e && typeof e === "object" && "message" in e ? String((e as { message: unknown }).message) : null);
      setErr(msg || "Erro ao processar NF (sem detalhe do servidor — veja o console)");
      console.error("[processarNF] erro completo:", e);
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
        onSaved();
        onClose();
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
      onSaved();
      onClose();
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
      alert(`NF ${nf.numero} estornada. O estoque foi revertido. Reabra a NF para corrigir os itens e reprocessar.`);
      onSaved();
      onClose();
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : "Erro ao estornar NF");
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
    // Configuração fiscal da fazenda de origem — a devolução emite uma NF-e de verdade (saída, de
    // volta ao fornecedor), não só um registro interno. Sem ela, a devolução fica bloqueada.
    supabase.from("configuracoes_modulo").select("modulo, config")
      .eq("fazenda_id", nf.fazenda_id).or("modulo.like.fiscal_pf_%,modulo.like.fiscal_emp_%")
      .then(r => setFiscalModulos((r.data ?? []) as Array<{ modulo: string; config: Record<string, string> }>));
    // CPF/CNPJ do produtor dono da NF de origem — quem responde fiscalmente pela devolução;
    // uma fazenda pode ter vários emitentes configurados, não vale pegar "o primeiro" ao acaso.
    setDevCpfHint(undefined);
    if (nf.produtor_id) {
      supabase.from("produtores").select("cpf_cnpj").eq("id", nf.produtor_id).maybeSingle()
        .then(r => setDevCpfHint(r.data?.cpf_cnpj ?? undefined));
    }
    // Carrega os itens da NF original
    try {
      const itensDB = await listarNfEntradaItens(nf.id);
      // O valor de cada item na NF é o BRUTO (o que o fornecedor cobrou por aquele produto); o que
      // deve ser devolvido/ressarcido é o LÍQUIDO — mesmo princípio já aplicado ao custo de estoque.
      // Reconstrói o fator pela soma dos itens (sempre bruta) contra o valor líquido da NF — não
      // confia em valor_produtos do cabeçalho, que pode estar desatualizado em NFs antigas/importadas.
      const somaItensGross = itensDB.reduce((s, i) => s + (i.valor_total || 0), 0);
      const fatorDesconto = somaItensGross > 0 && nf.valor_total > 0 ? nf.valor_total / somaItensGross : 1;
      setDevFatorDesconto(fatorDesconto);
      const devs: DevItem[] = itensDB
        .filter(i => i.insumo_id && i.tipo_apropiacao === "estoque")
        .map(i => ({
          key:                 i.id,
          insumo_id:           i.insumo_id!,
          descricao_produto:   i.descricao_produto,
          unidade:             i.unidade,
          deposito_id:         i.deposito_id,
          qtdOriginal:         i.quantidade,
          qtdOriginalNF:       i.qtd_nf ?? undefined,
          unidadeOriginalNF:   i.unidade_nf ?? undefined,
          ncm:                 i.ncm ?? undefined,
          quantidade_devolver: 0,
          valor_unitario:      i.valor_unitario * fatorDesconto,
          valor_total:         0,
        }));
      setDevItens(devs);
    } catch {
      setDevItens([]);
    }
    setDevModal(true);
  }

  // ── Confirmar devolução ───────────────────────────────────
  // Emite a NF-e de devolução DE VERDADE na SEFAZ (saída, de volta ao fornecedor — CFOP 5201/6201)
  // antes de gravar qualquer coisa no sistema: sem NF-e autorizada não há como o caminhão sair com a
  // mercadoria de forma regular, então nada é escriturado se a SEFAZ rejeitar.
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
      if (!i.ncm) {
        setDevErr(`"${i.descricao_produto}" está sem NCM na NF original — corrija o cadastro do insumo antes de devolver.`);
        return;
      }
    }
    if (!fiscalModulos[0]) {
      setDevErr("Nenhuma configuração fiscal encontrada para esta fazenda em Parâmetros → Fiscal. Configure o emitente antes de devolver.");
      return;
    }
    setDevSaving(true);
    setDevErr("");
    try {
      const itensNfe = itensParaDevolver.map(i => ({
        descricao:      i.descricao_produto,
        ncm:             i.ncm!,
        cfop:            devCfop,
        unidade:         i.unidade.toUpperCase(),
        quantidade:      i.quantidade_devolver,
        valor_unitario:  i.valor_unitario,
      }));
      const resp = await fetch("/api/fiscal/emitir-nfe", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          // A NF de origem pode ser de qualquer fazenda do cliente — nunca a "fazendaId" ativa da
          // sessão, senão o emissor busca config e cadastro de Pessoas na fazenda errada e falha.
          fazenda_id:   devNfOrig.fazenda_id,
          modulo_key:      fiscalModulos[0].modulo,
          produtor_id_hint: devNfOrig.produtor_id,
          cpf_cnpj_hint:   devCpfHint,
          destinatario: {
            nome:     devNfOrig.emitente_nome,
            cpf_cnpj: (devNfOrig.emitente_cnpj ?? "").replace(/\D/g, "") || undefined,
          },
          itens:    itensNfe,
          natureza: "Devolução de Compra",
          inf_cpl:  `Devolução referente à NF ${devNfOrig.numero}/${devNfOrig.serie}${devNfOrig.chave_acesso ? ` — chave ${devNfOrig.chave_acesso}` : ""}.${devObs ? ` ${devObs}` : ""}`,
          frete:    "9",
          nfe_ref:  devNfOrig.chave_acesso || undefined,
          tipo:     "1",
          fin_nfe:  "4",   // devolução — SEFAZ rejeita (328) CFOP de devolução sem essa finalidade
        }),
      });
      const res = await resp.json() as { sucesso: boolean; chave?: string; numero?: string; protocolo?: string; cStat?: string; xMotivo?: string };
      if (!res.sucesso || !res.chave) {
        setDevErr(`SEFAZ ${res.cStat}: ${res.xMotivo}`);
        return;
      }
      const serieReal = res.chave.substring(22, 25).replace(/^0+(?=\d)/, "") || "0";
      await processarDevolucaoCompra(
        devNfOrig.fazenda_id,
        devNfOrig.id,
        res.numero ?? "",
        serieReal,
        devCfop,
        devNfOrig.emitente_nome,
        devNfOrig.emitente_cnpj,
        devNfOrig.pessoa_id,
        devData,
        devVenc || undefined,
        itensParaDevolver,
        { chave_acesso: res.chave, protocolo: res.protocolo },
      );
      onSaved();
      setDevModal(false);
    } catch (e: unknown) {
      setDevErr(e instanceof Error ? e.message : "Erro ao processar devolução");
    } finally {
      setDevSaving(false);
    }
  }

  // ── Reclassificação pós-processamento ───────────────────────────────────
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
      onSaved();
      setModalReclass(null);
    } catch (e: unknown) {
      setReclassErr(e instanceof Error ? e.message : "Erro ao salvar.");
    } finally {
      setReclassSaving(false);
    }
  }

  // ── Reparar NF: repopula destinatário + itens via XML da SEFAZ ─────────
  function abrirNovoInsumo(itemKey: string, descricaoNf: string) {
    setFormNovoInsumo({ nome: descricaoNf, categoria: "outros", unidade: "un" });
    setNovoInsumoErr("");
    setModalNovoInsumo({ itemKey, nome: descricaoNf });
  }

  async function salvarNovoInsumo() {
    if (!fazendaId || !formNovoInsumo.nome.trim()) return;
    setNovoInsumoSaving(true);
    setNovoInsumoErr("");
    try {
      const criado = await criarInsumo({
        fazenda_id:      fazendaId,
        tipo:            tipoPorCategoria(formNovoInsumo.categoria),
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
  async function carregarProdutoresFiltro(fId: string) {
    const allFazIds = fazendaIds.length > 1 ? fazendaIds : (fId ? [fId] : []);
    try {
      const params = new URLSearchParams();
      if (contaId) params.set("conta_id", contaId);
      if (allFazIds.length > 0) params.set("fazenda_ids", allFazIds.join(","));
      if (contaId || allFazIds.length > 0) {
        const res = await fetch(`/api/produtores/listar?${params}`);
        const json = await res.json();
        setWProdutores((json.produtores ?? []) as Array<{id:string;nome:string;cpf_cnpj?:string}>);
      } else {
        setWProdutores([]);
      }
    } catch { setWProdutores([]); }
  }

  useEffect(() => {
    if (fazendaId) carregarProdutoresFiltro(fazendaId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fazendaId, fazendaIds, contaId]);

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
    await carregarProdutoresFiltro(fId);
    try {
      const allIds = fazendaIds.length > 0 ? fazendaIds : (fId ? [fId] : []);
      if (!allIds.length) { setWPedidos([]); return; }
      const { data } = await supabase
        .from("pedidos_compra")
        .select("id, numero, nr_pedido, fornecedor_id, contato_fornecedor, status, ano_safra_id, ciclo_id, data_vencimento")
        .in("fazenda_id", allIds)
        .in("status", ["rascunho", "aprovado", "parcialmente_entregue", "entregue"])
        .order("created_at", { ascending: false });
      setWPedidos((data ?? []) as PedidoMin[]);
    } catch { setWPedidos([]); }
  }
  // Carrega ciclos quando o ano safra muda no formulário
  useEffect(() => {
    if (!cab.ano_safra_id) { setCiclosNF([]); return; }
    listarCiclos(cab.ano_safra_id, fazendaId).then(setCiclosNF).catch(() => setCiclosNF([]));
  }, [cab.ano_safra_id, fazendaId]);

  // Reforço do auto-preenchimento de Produtor: se wProdutores só termina de carregar
  // DEPOIS que a NF já foi aberta (abrirEditar roda antes do re-render refletir o
  // fetch), o cálculo original ficou com array vazio. Assim que wProdutores chega,
  // tenta de novo — só se o campo ainda estiver vazio, para não sobrescrever escolha manual.
  useEffect(() => {
    if (!nfEdit || cab.produtor_id || !cab.cnpj_destino || wProdutores.length === 0) return;
    const encontrado = produtorPorCnpj(cab.cnpj_destino, cab.nome_destinatario);
    if (encontrado) setCab(p => ({ ...p, produtor_id: encontrado }));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wProdutores, nfEdit, cab.cnpj_destino]);

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

  // Carrega os itens do pedido vinculado — usado pra detectar produto
  // duplicado (mais de uma linha do mesmo produto) e pedir pra escolher a
  // linha certa na associação de produtos.
  useEffect(() => {
    if (!cab.pedido_compra_id) { setPedidoItensVinculado([]); return; }
    listarPedidoCompraItens(cab.pedido_compra_id).then(setPedidoItensVinculado).catch(() => setPedidoItensVinculado([]));
  }, [cab.pedido_compra_id]);
  function pessoaPorCnpj(cnpj: string): string {
    if (!cnpj) return "";
    const norm = cnpj.replace(/\D/g, "");
    return pessoas.find(p => (p.cpf_cnpj ?? "").replace(/\D/g, "") === norm)?.id ?? "";
  }

  // Um mesmo CPF pode ter mais de um cadastro de Produtor (ex: "FULANO" solo e
  // "FULANO E OUTRO" numa exploração conjunta) — cada um com sua própria I.E. e
  // endereço. Achado real: o match só por CPF pegava o registro errado, o que
  // numa remessa emitiria com o endereço vinculado à I.E. errada. Quando há mais
  // de 1 candidato com o mesmo CPF, desempata pelo nome do destinatário da NF
  // (vem exatamente como está no cadastro certo, ex: "...E OUTRO"). Se mesmo
  // assim ficar ambíguo, não arrisca — deixa em branco para seleção manual.
  function produtorPorCnpj(cnpj: string, nomeDestino?: string): string {
    if (!cnpj) return "";
    const norm = cnpj.replace(/\D/g, "");
    const candidatos = wProdutores.filter(p => (p.cpf_cnpj ?? "").replace(/\D/g, "") === norm);
    if (candidatos.length <= 1) return candidatos[0]?.id ?? "";
    if (nomeDestino) {
      const normNome = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim();
      const alvo = normNome(nomeDestino);
      const porNome = candidatos.find(p => normNome(p.nome) === alvo);
      if (porNome) return porNome.id;
    }
    return ""; // ambíguo — melhor pedir seleção manual do que arriscar o produtor errado
  }

  // ── Auto-fill emitente quando pessoa selecionada ─────────
  // Alerta se a pessoa escolhida tiver CPF/CNPJ diferente do emitente já
  // capturado do XML — evita vincular a NF ao fornecedor errado (achado real:
  // NF de Luiz Fiorese ficou classificada como "Quati S.A." por seleção equivocada).
  function onPessoaChange(id: string) {
    const p = pessoas.find(x => x.id === id);
    if (p) {
      const cnpjXml = (cab.emitente_cnpj ?? "").replace(/\D/g, "");
      const cnpjPessoa = (p.cpf_cnpj ?? "").replace(/\D/g, "");
      if (cnpjXml && cnpjPessoa && cnpjXml !== cnpjPessoa) {
        const confirmado = confirm(
          `Atenção: o CPF/CNPJ do emitente capturado nesta NF (${cab.emitente_cnpj}) é diferente do CPF/CNPJ de "${p.nome}" (${p.cpf_cnpj}).\n\n` +
          `Selecionar esta pessoa vai vincular a NF a um fornecedor diferente do que realmente emitiu o documento.\n\n` +
          `Confirma mesmo assim?`
        );
        if (!confirmado) return;
      }
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
        updated.valor_total    = arred2((updated.qtd_nf || 0) * (updated.vunit_nf || 0));
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

  // ── Retorno de bem: carrega remessas abertas e sugere a correta (refNFe do XML, senão CNPJ do emitente) ──
  useEffect(() => {
    const c = (cab.cfop || "").trim();
    if (!CFOPS_RETORNO_DE_REMESSA.has(c) || !contaId) { setTransfCandidatas([]); setTransfVinculoId(""); return; }
    let vivo = true;
    listarTransferenciasMaquinas(contaId).then(all => {
      if (!vivo) return;
      const abertas = all.filter(t => t.status === "emitida" && (t.direcao ?? "saida") === "saida");
      setTransfCandidatas(abertas);
      const cnpj = (cab.emitente_cnpj || "").replace(/\D/g, "");
      const porChave = refNfeXml ? abertas.find(t => t.nf_saida_chave === refNfeXml) : undefined;
      const porCnpj = abertas.filter(t => cnpj && (t.destinatario_cnpj || "").replace(/\D/g, "") === cnpj);
      setTransfVinculoId(prev => prev || porChave?.id || (porCnpj.length === 1 ? porCnpj[0].id : ""));
    }).catch(() => { if (vivo) setTransfCandidatas([]); });
    return () => { vivo = false; };
  }, [cab.cfop, cab.emitente_cnpj, refNfeXml, contaId]);

  // ── Auto-fill tipo_apropiacao por tipo de entrada ─────────
  const tipoAprpDefault = (t: TipoEntrada): NfEntradaItem["tipo_apropiacao"] =>
    tipoApropDeCfop(cab.cfop,
      t === "vef"          ? "vef"        :
      t === "remessa"      ? "remessa"    :
      t === "custo_direto" ? "direto"     :
      t === "pecas"        ? "maquinario" :
      "estoque"
    );

  // ── Totais ─────────────────────────────────────────────────
  const totalItens = itens.reduce((s, i) => s + i.valor_total, 0);


  // ── Carrega a NF (edição/visualização) ou abre em branco (nova) ──
  useEffect(() => {
    if (!fazendaId) return;
    if (!id) {
      abrirNovo();
      setCarregandoNf(false);
      return;
    }
    (async () => {
      setCarregandoNf(true);
      const { data } = await supabase.from("nf_entradas").select("*").eq("id", id).maybeSingle();
      const nf = data as NfEntrada | null;
      if (!nf) { setErr("NF não encontrada."); setCarregandoNf(false); return; }
      await abrirEditar(nf);
      setCarregandoNf(false);
      if (acaoInicial === "devolver" && nf.status === "processada" && nf.tipo_entrada === "insumos") {
        abrirDevolucao(nf);
      } else if (acaoInicial === "estornar" && nf.status === "processada") {
        estornarNFClick(nf);
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, fazendaId]);


  // NF processada não pode ser editada por aqui — só via Estornar (reverte
  // estoque/financeiro) ou pelas ações dedicadas (Devolver/Reclassificar/
  // Remessa), que continuam funcionando normalmente por serem overlays
  // separados, fora da área travada abaixo. Sem toggle "Editar": editar de
  // verdade exige Estornar primeiro, não é uma trava que se destrava sozinha.
  const viewOnly = nfEdit?.status === "processada";
  const lockStyle: React.CSSProperties = viewOnly ? { pointerEvents: "none", opacity: 0.6 } : {};

  // Apropriação Direta: a Operação Gerencial escolhida no cabeçalho decide como
  // cada item é lançado — nunca os dois ao mesmo tempo na mesma NF.
  const opSelecionada = reclassOps.find(o => o.id === cab.operacao_gerencial_id);
  const modoDireto: "combustivel" | "manutencao" | "cc" =
    opSelecionada?.permite_combustivel ? "combustivel" :
    opSelecionada?.permite_manutencao  ? "manutencao"  : "cc";

  if (carregandoNf) {
    return (
      <div style={{ position: "fixed", inset: 0, background: "rgba(11,45,80,0.32)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 2000 }}>
        <div style={{ background: "var(--bg-card)", borderRadius: 14, padding: 40, color: "var(--text-2)", fontSize: 13 }}>Carregando NF…</div>
      </div>
    );
  }

  return (
    <>
        <div style={{ position: "fixed", inset: 0, background: "rgba(11,45,80,0.32)", display: "flex", alignItems: "flex-start", justifyContent: "center", zIndex:2000, overflowY: "auto", padding: "24px 0" }}>
          <div style={{ background: "var(--bg-card)", borderRadius: 14, width: "100%", maxWidth: 1140, margin: "0 20px", boxShadow: "0 4px 20px rgba(11,45,80,0.10)" }}>

            {/* Cabeçalho modal */}
            <div style={{ padding: "20px 24px 16px", borderBottom: "0.5px solid var(--bg-tag)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div>
                <div style={{ fontSize: 16, fontWeight: 700, color: "var(--text-1)" }}>
                  {nfEdit ? `NF ${nfEdit.numero}/${nfEdit.serie}` : "Nova NF de Compra"}
                </div>
                <div style={{ fontSize: 12, color: "var(--text-3)", marginTop: 2 }}>
                  {etapa === "cabecalho" ? "Passo 1 — Cabeçalho" : "Passo 2 — Itens & Processamento"}
                </div>
              </div>
              {/* Stepper */}
              <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                {(["cabecalho", "itens"] as Etapa[]).map((e, i) => (
                  <div key={e} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <div style={{ width: 26, height: 26, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, background: etapa === e ? "#1A5C38" : etapa > e ? "#E8E8E8" : "var(--bg-page)", color: etapa === e ? "#fff" : etapa > e ? "#111111" : "var(--text-muted)" }}>
                      {i + 1}
                    </div>
                    {i < 1 && <div style={{ width: 20, height: 1, background: "var(--border-table)" }} />}
                  </div>
                ))}
              </div>
              <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 20, color: "var(--text-3)", lineHeight: 1 }}>×</button>
            </div>

            <div style={{ padding: "16px 20px" }}>
              {err && <div style={{ background: "#FCEBEB", border: "0.5px solid #F5C6C6", borderRadius: 8, padding: "8px 12px", fontSize: 13, color: "#791F1F", marginBottom: 12 }}>{err}</div>}
              {viewOnly && (
                <div style={{ background: "#F4F6FA", border: "0.5px solid var(--border-table)", borderRadius: 8, padding: "8px 14px", fontSize: 12, color: "var(--text-2)", marginBottom: 12 }}>
                  🔒 NF já processada — somente leitura. Para editar cabeçalho/itens, use <strong>↺ Estornar</strong> primeiro (reverte estoque e financeiro); Devolver, Reclassificar e Emitir Remessa continuam disponíveis normalmente.
                </div>
              )}

              {/* ─── ETAPA 1: CABEÇALHO ──────────────────────── */}
              {etapa === "cabecalho" && (
                <>
                <div style={lockStyle}>

                  {/* ── Barra compacta: Como lançar + Tipo de entrada ── */}
                  <div style={{ background: "var(--bg-page)", border: "0.5px solid var(--border)", borderRadius: 10, padding: "12px 14px", marginBottom: 16 }}>
                    <div style={{ display: "flex", gap: 16, alignItems: "flex-start", flexWrap: "wrap" }}>
                      {/* Como lançar */}
                      <div style={{ flex: "1 1 auto" }}>
                        <div style={{ fontSize: 10, fontWeight: 700, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: ".08em", marginBottom: 6 }}>Como lançar</div>
                        <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                          {([
                            { v: "manual", label: "✏ Manual" },
                            { v: "xml",    label: "📄 XML" },
                            { v: "leitor", label: "▌▌ Chave / Leitor" },
                            { v: "sieg",   label: "🔗 Sieg / API" },
                          ] as { v: OrigEscolha; label: string }[]).map(({ v, label }) => (
                            <button key={v}
                              onClick={() => { setOrig(v); setLeitorChave(""); setLeitorErro(null); if (v === "leitor") setTimeout(() => leitorRef.current?.focus(), 50); }}
                              style={{ padding: "5px 12px", border: `1.5px solid ${orig === v ? "#1A5C38" : "var(--border-table)"}`, borderRadius: 6, background: orig === v ? "#E8F5E9" : "var(--bg-card)", cursor: "pointer", fontSize: 12, fontWeight: orig === v ? 700 : 400, color: orig === v ? "#1A5C38" : "var(--text-2)", whiteSpace: "nowrap" }}>
                              {label}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Tipo de entrada */}
                      <div style={{ flex: "1 1 200px" }}>
                        <div style={{ fontSize: 10, fontWeight: 700, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: ".08em", marginBottom: 6 }}>Tipo de Entrada</div>
                        <select value={tipo} onChange={e => setTipo(e.target.value as TipoEntrada)}
                          style={{ ...inp, fontWeight: 600, background: TIPO_LABELS[tipo]?.cor ?? "var(--bg-input)" }}>
                          {(Object.entries(TIPO_LABELS) as [TipoEntrada, typeof TIPO_LABELS[TipoEntrada]][]).map(([v, meta]) => (
                            <option key={v} value={v}>{meta.label}</option>
                          ))}
                        </select>
                        {TIPO_LABELS[tipo] && (
                          <div style={{ fontSize: 11, color: "var(--text-3)", marginTop: 3 }}>{TIPO_LABELS[tipo].desc}</div>
                        )}
                      </div>
                    </div>

                    {/* Painel de input por origem (colapsável) */}
                    {orig === "xml" && (
                      <div style={{ marginTop: 10, paddingTop: 10, borderTop: "0.5px solid var(--border-table)" }}>
                        <label style={lbl}>Arquivo XML da NF-e</label>
                        <input ref={xmlInputRef} type="file" accept=".xml"
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

                    {orig === "leitor" && (
                      <div style={{ marginTop: 10, paddingTop: 10, borderTop: "0.5px solid var(--border-table)" }}>
                        <label style={lbl}>Chave de Acesso — 44 dígitos (escaneie ou digite)</label>
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
                                  setOrig("xml");
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
                            placeholder="Posicione o cursor aqui e escaneie…"
                            style={{ ...inp, fontFamily: "monospace", fontSize: 13, letterSpacing: "0.05em", paddingRight: 100 }}
                            autoComplete="off"
                            autoFocus
                          />
                          <span style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", fontSize: 11, color: leitorChave.length === 44 ? "#16A34A" : "#888" }}>
                            {leitorLoading ? "Consultando…" : `${leitorChave.length}/44`}
                          </span>
                        </div>
                        <div style={{ marginTop: 4, height: 3, background: "#EEE", borderRadius: 2, overflow: "hidden" }}>
                          <div style={{ height: "100%", width: `${(leitorChave.length / 44) * 100}%`, background: leitorChave.length === 44 ? "#16A34A" : "#1A4870", transition: "width 0.1s" }} />
                        </div>
                        {leitorErro && (
                          <div style={{ marginTop: 8, padding: "8px 12px", background: "#FCEBEB", border: "0.5px solid #F5C6C6", borderRadius: 8, fontSize: 12, color: "#E24B4A" }}>
                            {leitorErro}
                            {leitorErro.includes("Certificado") && (
                              <div style={{ marginTop: 4, color: "#555" }}>Configure o certificado A1 em <strong>Configurações → Parâmetros do Sistema → Fiscal</strong>.</div>
                            )}
                          </div>
                        )}
                      </div>
                    )}

                    {orig === "sieg" && (
                      <div style={{ marginTop: 10, paddingTop: 10, borderTop: "0.5px solid var(--border-table)" }}>
                        <label style={lbl}>Chave de Acesso Sieg (44 dígitos)</label>
                        <div style={{ display: "flex", gap: 10 }}>
                          <input value={siegChave} onChange={e => setSiegChave(e.target.value.replace(/\D/g, ""))}
                            placeholder="00000000000000000000000000000000000000000000"
                            maxLength={44} style={{ ...inp, flex: 1, fontFamily: "monospace", fontSize: 12 }}
                          />
                          <button onClick={buscarSieg} disabled={siegLoading} style={{ ...btnV, whiteSpace: "nowrap" }}>
                            {siegLoading ? "Buscando…" : "Consultar"}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* ── Vínculo com Pedido de Compra — ao topo ── */}
                  <div style={{ background: cab.pedido_compra_id ? "#E8F5E9" : "var(--bg-page)", border: `0.5px solid ${cab.pedido_compra_id ? "#86EFAC" : "var(--border-table)"}`, borderRadius: 10, padding: "10px 14px", marginBottom: 14 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: cab.pedido_compra_id ? 8 : 0 }}>
                      <span style={{ fontSize: 12, fontWeight: 600, color: cab.pedido_compra_id ? "#1A6B3C" : "var(--text-1)" }}>
                        {cab.pedido_compra_id ? "✓ Vinculado ao Pedido de Compra" : "Vincular a um Pedido de Compra"}
                      </span>
                      <span style={{ fontSize: 11, color: "var(--text-3)" }}>{cab.pedido_compra_id ? "" : "— opcional. Ao selecionar, os campos serão preenchidos automaticamente."}</span>
                    </div>
                    <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                      <SelectBusca
                        value={cab.pedido_compra_id}
                        onChange={v => onPedidoChange(v)}
                        placeholder="— Sem pedido vinculado —"
                        style={{ ...inp, flex: 1, background: cab.pedido_compra_id ? "#F0FDF4" : "var(--bg-input)", fontWeight: cab.pedido_compra_id ? 600 : 400, color: cab.pedido_compra_id ? "#166534" : "var(--text-1)" }}
                        options={wPedidos.map(p => {
                          const forn = pessoas.find(x => x.id === p.fornecedor_id)?.nome ?? p.contato_fornecedor ?? "—";
                          const nr = p.nr_pedido ?? p.numero ?? p.id.substring(0, 8);
                          const cnpjNf = cab.emitente_cnpj?.replace(/\D/g, "") ?? "";
                          const fornCnpj = pessoas.find(x => x.id === p.fornecedor_id)?.cpf_cnpj?.replace(/\D/g, "") ?? "";
                          const match = cnpjNf && fornCnpj && fornCnpj === cnpjNf;
                          return { value: p.id, label: `${match ? "★ " : ""}${forn} — PC ${nr} (${p.status})` };
                        })}
                      />
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
                          // CFOP de ativo imobilizado — classifica sozinho pra CAPEX (fora do DRE),
                          // sem precisar escolher na mão toda vez.
                          if (CFOPS_ATIVO_IMOBILIZADO.has(cfop)) {
                            const ogCapex = reclassOps.find(o => o.classificacao === OG_ATIVO_IMOBILIZADO_CODIGO);
                            if (CFOPS_COMPRA_BEM.has(cfop) && ogCapex && !cab.operacao_gerencial_id) setCab(p => ({ ...p, operacao_gerencial_id: ogCapex.id }));
                            setItens(prev => prev.map(it => ({ ...it, tipo_apropiacao: "direto" })));
                          }
                        }}
                        placeholder="1101, 2101…"
                        style={inp}
                      />
                    </div>
                  </div>

                  {CFOPS_BEM_SEM_PAGAMENTO.has((cab.cfop || "").trim()) && (
                    <div style={{ border: "0.5px solid #C9921B", background: "#FBF3E0", borderRadius: 10, padding: "12px 14px", marginBottom: 14 }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: "#7A5500" }}>Bem do ativo imobilizado — {CFOPS_RETORNO_DE_REMESSA.has((cab.cfop || "").trim()) ? "retorno / entrada de bem" : "transferência de bem"}</div>
                      <div style={{ fontSize: 11, color: "#7A5500", marginTop: 2 }}>Sem cobrança: esta NF não gera Contas a Pagar nem movimenta estoque, e não exige Operação Gerencial.</div>
                      {CFOPS_RETORNO_DE_REMESSA.has((cab.cfop || "").trim()) && (
                        <div style={{ marginTop: 10 }}>
                          <label style={lbl}>Baixar a remessa correspondente (Fiscal → Transferência de Máquinas)</label>
                          <select value={transfVinculoId} onChange={e => setTransfVinculoId(e.target.value)} style={inp}>
                            <option value="">— não vincular a nenhuma remessa —</option>
                            {transfCandidatas.map(t => (
                              <option key={t.id} value={t.id}>
                                {t.maquina_nome} · {t.destinatario_nome} · NF {t.nf_saida_numero ?? "s/nº"}{t.nf_saida_data ? ` de ${t.nf_saida_data.split("-").reverse().join("/")}` : ""}
                              </option>
                            ))}
                          </select>
                          <div style={{ fontSize: 10, color: "#7A5500", marginTop: 3 }}>
                            {transfCandidatas.length === 0 ? "Nenhuma remessa aberta encontrada." : transfVinculoId ? "Ao processar, a remessa selecionada passa a Retornada com os dados desta NF." : "Selecione a remessa para dar baixa nela ao processar."}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

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
                                setPessoas(prev => [...prev, nova]);
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
                                  const qDigits = q.replace(/\D/g, "");
                                  return p.nome.toLowerCase().includes(q) || (qDigits.length > 0 && (p.cpf_cnpj ?? "").replace(/\D/g, "").includes(qDigits));
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
                                const qDigits = q.replace(/\D/g,"");
                                return p.nome.toLowerCase().includes(q) || (qDigits.length > 0 && (p.cpf_cnpj ?? "").replace(/\D/g,"").includes(qDigits));
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
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 10 }}>
                      {([
                        ["IPI",    "valor_ipi",     "Imp. Produtos Industrializados"],
                        ["ST",     "valor_st",      "Substituição Tributária ICMS"],
                        ["FCP-ST", "valor_fcp_st",  "Fundo de Combate à Pobreza"],
                        ["DIFAL",  "valor_difal",   "Diferencial de Alíquota"],
                        ["Desconto","valor_desconto","Desconto (−)"],
                        ["ICMS Deson.","valor_icms_deson","ICMS Desonerado (−) — redução/isenção reconhecida pelo emitente, comum em exportação/armazém alfandegado"],
                      ] as [string, keyof typeof cab, string][]).map(([label, field, tooltip]) => (
                        <div key={field} title={tooltip}>
                          <label style={{ ...lbl, color: "#92400E" }}>{label}</label>
                          <input value={String((cab as Record<string, unknown>)[field] ?? "")} onChange={e => setCab(p=>({...p,[field]:e.target.value}))} placeholder="0,00" style={{ ...inp, borderColor: "#FCD34D" }} />
                        </div>
                      ))}
                    </div>
                    {(() => {
                      const vProd   = numBR(cab.valor_total)   || 0;
                      const vIpi    = numBR(cab.valor_ipi)      || 0;
                      const vSt     = numBR(cab.valor_st)       || 0;
                      const vFcp    = numBR(cab.valor_fcp_st)   || 0;
                      const vDifal  = numBR(cab.valor_difal)    || 0;
                      const vDesc   = numBR(cab.valor_desconto) || 0;
                      const vDeson  = numBR(cab.valor_icms_deson) || 0;
                      const total   = vProd + vIpi + vSt + vFcp + vDifal - vDesc - vDeson;
                      const temExtra = vIpi + vSt + vFcp + vDifal + vDesc + vDeson > 0;
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
                            {vDeson > 0 && ` − ICMS Deson. ${vDeson.toLocaleString("pt-BR",{style:"currency",currency:"BRL"})}`}
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
                        <label style={lbl}>Vencimento da CP {nfCondicao === "prazo" && <span style={{ fontWeight: 400, color: "var(--text-3)" }}>(1º vencimento)</span>}</label>
                        <input type="date" value={cab.data_vencimento_cp} onChange={e => { setCab(p=>({...p,data_vencimento_cp:e.target.value})); setNfParcelas([]); }} style={inp} />
                      </div>
                      {/* ── Parcelamento ── */}
                      <div style={{ gridColumn: "1 / -1" }}>
                        <label style={{ ...lbl, marginBottom: 6 }}>Condição de Pagamento</label>
                        <div style={{ display: "flex", gap: 6, marginBottom: nfCondicao === "prazo" ? 10 : 0 }}>
                          {(["avista", "prazo"] as const).map(v => (
                            <button key={v} onClick={() => { setNfCondicao(v); setNfParcelas([]); }}
                              style={{ padding: "5px 14px", borderRadius: 8, border: `0.5px solid ${nfCondicao === v ? "#1A4870" : "var(--border-table)"}`, background: nfCondicao === v ? "#1A4870" : "var(--bg-card)", color: nfCondicao === v ? "#fff" : "var(--text-1)", cursor: "pointer", fontSize: 12, fontWeight: 600 }}>
                              {v === "avista" ? "À Vista" : "Parcelado"}
                            </button>
                          ))}
                        </div>
                        {nfCondicao === "prazo" && (
                          <div style={{ background: "#F6F9FF", border: "0.5px solid #B8D4F0", borderRadius: 10, padding: "12px 14px" }}>
                            <div style={{ display: "flex", gap: 10, alignItems: "flex-end", marginBottom: nfParcelas.length > 0 ? 12 : 0 }}>
                              <div>
                                <label style={lbl}>Nº de Parcelas</label>
                                <input type="number" min="2" max="120" value={nfQtdParcelas}
                                  onChange={e => { setNfQtdParcelas(e.target.value); setNfParcelas([]); }}
                                  style={{ ...inp, width: 80 }} />
                              </div>
                              <div>
                                <label style={lbl}>Intervalo (meses)</label>
                                <select value={nfFreq} onChange={e => { setNfFreq(e.target.value); setNfParcelas([]); }} style={{ ...inp, width: 120 }}>
                                  <option value="1">Mensal</option>
                                  <option value="2">Bimestral</option>
                                  <option value="3">Trimestral</option>
                                  <option value="6">Semestral</option>
                                  <option value="12">Anual</option>
                                </select>
                              </div>
                              <button onClick={gerarParcelasNf}
                                style={{ padding: "7px 16px", background: "#C9921B", color: "#fff", border: "none", borderRadius: 8, fontWeight: 600, fontSize: 12, cursor: "pointer" }}>
                                Gerar parcelas
                              </button>
                            </div>
                            {nfParcelas.length > 0 && (
                              <div>
                                <div style={{ display: "grid", gridTemplateColumns: "110px 1fr 28px", gap: 4, marginBottom: 4, paddingBottom: 4, borderBottom: "0.5px solid #C5D9EE" }}>
                                  <span style={{ fontSize: 10, fontWeight: 600, color: "var(--text-3)", textTransform: "uppercase" }}>Vencimento</span>
                                  <span style={{ fontSize: 10, fontWeight: 600, color: "var(--text-3)", textTransform: "uppercase" }}>Valor (R$)</span>
                                  <span />
                                </div>
                                {nfParcelas.map((p, i) => (
                                  <div key={i} style={{ display: "grid", gridTemplateColumns: "110px 1fr 28px", gap: 4, marginBottom: 4, alignItems: "center" }}>
                                    <input type="date" value={p.data}
                                      onChange={e => setNfParcelas(prev => prev.map((x, j) => j === i ? { ...x, data: e.target.value } : x))}
                                      style={{ ...inp, fontSize: 12 }} />
                                    <input type="text" value={p.valorMask}
                                      onChange={e => setNfParcelas(prev => prev.map((x, j) => j === i ? { ...x, valorMask: e.target.value } : x))}
                                      style={{ ...inp, fontSize: 12, textAlign: "right" }} />
                                    <span style={{ fontSize: 10, color: "var(--text-3)", fontWeight: 600 }}>{i + 1}/{nfParcelas.length}</span>
                                  </div>
                                ))}
                                {(() => {
                                  const soma = nfParcelas.reduce((s, p) => s + (parseFloat(p.valorMask.replace(/\./g, "").replace(",", ".")) || 0), 0);
                                  const total = parseFloat(nfEdit?.valor_total?.toString() ?? cab.valor_total) || 0;
                                  const diff  = Math.abs(soma - total);
                                  return diff > 0.01 ? (
                                    <div style={{ fontSize: 11, color: "#B91C1C", marginTop: 6 }}>
                                      ⚠ Soma das parcelas ({soma.toLocaleString("pt-BR",{style:"currency",currency:"BRL"})}) difere do total da NF ({total.toLocaleString("pt-BR",{style:"currency",currency:"BRL"})})
                                    </div>
                                  ) : (
                                    <div style={{ fontSize: 11, color: "#166534", marginTop: 6 }}>
                                      ✓ Soma confere: {soma.toLocaleString("pt-BR",{style:"currency",currency:"BRL"})}
                                    </div>
                                  );
                                })()}
                              </div>
                            )}
                            {nfParcelas.length === 0 && (
                              <div style={{ fontSize: 11, color: "var(--text-3)", marginTop: 4 }}>Clique em "Gerar parcelas" para criar o cronograma editável.</div>
                            )}
                          </div>
                        )}
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
                      <div>
                        <label style={lbl}>Ciclo</label>
                        <select value={cab.ciclo_id} onChange={e => setCab(p=>({...p, ciclo_id: e.target.value}))} style={inp} disabled={!cab.ano_safra_id}>
                          <option value="">— selecione o ano safra —</option>
                          {ciclosNF.map(c => <option key={c.id} value={c.id}>{c.cultura} {c.descricao ? `— ${c.descricao}` : ""}</option>)}
                        </select>
                      </div>
                      <div>
                        <label style={lbl}>Produtor</label>
                        <select value={cab.produtor_id} onChange={e => setCab(p=>({...p, produtor_id: e.target.value, ie_produtor: ""}))} style={inp}>
                          <option value="">— selecionar —</option>
                          {wProdutores.map(p => <option key={p.id} value={p.id}>{p.nome}{p.cpf_cnpj ? ` — ${p.cpf_cnpj}` : ""}</option>)}
                        </select>
                      </div>
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
                          {wDepositos.filter(d => !["terceiro","armazem_terceiro"].includes(d.tipo)).length > 0 && (
                            <optgroup label="Depósitos Próprios">
                              {wDepositos.filter(d => !["terceiro","armazem_terceiro"].includes(d.tipo)).map(d => (
                                <option key={d.id} value={d.id}>{d.nome}</option>
                              ))}
                            </optgroup>
                          )}
                          {wDepositos.filter(d => ["terceiro","armazem_terceiro"].includes(d.tipo)).length > 0 && (
                            <optgroup label="Depósitos de Terceiro">
                              {wDepositos.filter(d => ["terceiro","armazem_terceiro"].includes(d.tipo)).map(d => (
                                <option key={d.id} value={d.id}>{d.nome}</option>
                              ))}
                            </optgroup>
                          )}
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
                        Ideal para NFs de mercado, energia, combustível externo (abastecimento direto de um veículo, fora da fazenda), serviços, fretes e demais despesas operacionais.
                      </div>
                    </div>
                  )}

                  {tipo === "custo_direto" && modoDireto === "combustivel" && (
                    <div style={{ background: "#FBF3E0", border: "0.5px solid #C9921B", borderRadius: 10, padding: 14, marginBottom: 14, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                      <div style={{ fontSize: 12, color: "#7A5800" }}>
                        Aqui só cabe abastecimento DIRETO de um veículo (posto de terceiro). Se esta NF é uma
                        <strong> compra de combustível para o tanque/bomba da fazenda</strong>, mude para Compra Normal —
                        aí aparece o catálogo do produto e o crédito na bomba, sem exigir veículo.
                      </div>
                      <button
                        onClick={() => {
                          // Preserva descrição/quantidade/valor já digitados — só troca o tipo da NF
                          // (habilita o catálogo + bomba/tanque) e a apropriação de cada item, que
                          // ainda estava marcada "direto" (sem estoque) por ter sido criada em
                          // Apropriação Direta.
                          setTipo("insumos");
                          setCab(p => ({ ...p, e_combustivel: true }));
                          setItens(prev => prev.map(it => ({ ...it, tipo_apropiacao: "estoque" })));
                        }}
                        style={{ padding: "7px 14px", borderRadius: 8, border: "none", background: "#C9921B", color: "#fff", fontWeight: 700, fontSize: 12, cursor: "pointer", whiteSpace: "nowrap" }}
                      >
                        É reposição de tanque → Mudar para Compra Normal
                      </button>
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
                </div>

                  <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
                    <button style={btnR} onClick={onClose}>Cancelar</button>
                    <button style={btnV} onClick={async () => {
                      // Em modo de visualização (NF processada), só navega — não tenta
                      // salvar (salvarRascunho() bloquearia com o guard de "já processada").
                      if (viewOnly) { setEtapa("itens"); return; }
                      // Apropriação Direta: a Operação Gerencial decide como cada item vai
                      // ser lançado (combustível → frota; manutenção → rateio por frota;
                      // outra → só CC) — sem ela escolhida ainda não dá pra montar a tela
                      // de itens direito, então trava aqui em vez de só no processamento.
                      if (tipo === "custo_direto" && !cab.operacao_gerencial_id && !sugestaoNome) {
                        setErr("Selecione uma Operação Gerencial antes de continuar para os itens — ela determina se cada item vai pedir veículo (combustível), rateio por frota (manutenção) ou centro de custo.");
                        return;
                      }
                      setErr("");
                      const nf = await salvarRascunho();
                      if (nf) setEtapa("itens");
                    }}>
                      {viewOnly ? "Ver Itens →" : "Próximo: Itens →"}
                    </button>
                  </div>
                </>
              )}

              {/* ─── ETAPA 3: ITENS ──────────────────────────── */}
              {etapa === "itens" && (
                <>
                <div style={lockStyle}>
                  {/* Banner de re-sync para NFs do SIEG sem itens */}
                  {itens.length === 0 && nfEdit?.origem === "sieg" && nfEdit?.chave_acesso && (
                    <div style={{ background: "#FFF8E6", border: "0.5px solid #F0C040", borderRadius: 8, padding: "10px 14px", marginBottom: 14, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                      <span style={{ fontSize: 13, color: "#7A5500" }}>
                        ⚠ Esta NF foi importada sem itens (possível contingência ou XML incompleto no SIEG).
                      </span>
                      <button
                        onClick={resyncWizard}
                        disabled={wizardResyncando}
                        style={{ padding: "5px 14px", borderRadius: 7, border: "0.5px solid #C9921B", background: wizardResyncando ? "#f5e0a0" : "#FBF3E0", color: "#7A5500", fontSize: 12, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap" }}
                      >
                        {wizardResyncando ? "Re-sincronizando…" : "🔄 Re-sincronizar do SIEG"}
                      </button>
                    </div>
                  )}
                  {/* Banner: XML carregado mas nenhum <det> encontrado */}
                  {xmlSemItens && (
                    <div style={{ background: "#FCEBEB", border: "0.5px solid #E24B4A50", borderRadius: 8, padding: "10px 14px", marginBottom: 14 }}>
                      <div style={{ fontSize: 13, color: "#791F1F", fontWeight: 600, marginBottom: 4 }}>
                        ⚠ O XML foi lido mas nenhum item ({"<det>"}) foi encontrado
                      </div>
                      <div style={{ fontSize: 12, color: "#791F1F" }}>
                        Isso pode ocorrer por encoding inválido, XML compactado ou NF-e de serviço (sem linha de produtos).
                        Tente: (1) voltar ao Cabeçalho e recarregar o XML, (2) adicionar os itens manualmente abaixo, ou
                        (3) buscar via Chave de Acesso no Cabeçalho.
                      </div>
                    </div>
                  )}
                  {/* Banner: itens zerados vindo de qualquer origem (apenas 1 item vazio gerado por padrão) */}
                  {!xmlSemItens && itens.length === 1 && !itens[0].descricao_nf && itens[0].valor_total === 0 && nfEdit?.chave_acesso && nfEdit?.chave_acesso.replace(/\D/g,"").length === 44 && (
                    <div style={{ background: "#FFF8E6", border: "0.5px solid #F0C040", borderRadius: 8, padding: "10px 14px", marginBottom: 14, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                      <span style={{ fontSize: 13, color: "#7A5500" }}>
                        Nenhum item carregado. Volte ao Cabeçalho e importe o XML ou busque via Leitor de Chave.
                      </span>
                      {nfEdit?.origem === "sieg" && (
                        <button onClick={resyncWizard} disabled={wizardResyncando}
                          style={{ padding: "5px 14px", borderRadius: 7, border: "0.5px solid #C9921B", background: wizardResyncando ? "#f5e0a0" : "#FBF3E0", color: "#7A5500", fontSize: 12, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap" }}>
                          {wizardResyncando ? "Re-sincronizando…" : "🔄 Re-sincronizar do SIEG"}
                        </button>
                      )}
                    </div>
                  )}
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
                          Associe cada item da NF ao insumo correspondente no catálogo. Sem centro de custo aqui — a apropriação de custo é no consumo do estoque, não na compra. Item que não é produto de estoque (frete, taxa, serviço) use o tipo de entrada "Apropriação Direta".
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

                  {/* Centro de custo do lançamento (CP) — fica aqui, junto dos itens, pra dar
                      pra julgar se é apropriação direta vendo o que a NF traz. É só uma tag
                      financeira do pagamento (relatório de caixa por CC); itens de estoque
                      nunca levam CC. Sempre ativo — sem checkbox. */}
                  {tipo !== "insumos" && (
                    <div style={{ marginBottom: 16 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-1)", marginBottom: 8, display: "flex", alignItems: "center", gap: 10 }}>
                        Centro de custo do lançamento
                      </div>
                    <div style={{ background: "#F6F9FF", border: "0.5px solid #B8D4F0", borderRadius: 10, padding: "12px 14px" }}>
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
                      {/* Aplica o CC escolhido aqui a todos os itens de uma vez — evita
                          repetir a mesma seleção item a item quando a NF inteira (ex: NF de
                          mercado com 20+ itens) vai pro mesmo centro de custo. Item a item
                          continua disponível pra quando algum item precisa de um CC diferente. */}
                      {cab.centro_custo_id && itens.some(i => i.descricao_nf.trim()) && (
                        <button
                          onClick={() => setItens(prev => prev.map(it => it.descricao_nf.trim() ? { ...it, centro_custo_id: cab.centro_custo_id, maquina_id: ccGlobalMaquinaId || it.maquina_id } : it))}
                          style={{ marginTop: 10, padding: "6px 12px", border: "0.5px solid #1A4870", borderRadius: 6, background: "#fff", color: "#1A4870", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
                          ↓ Aplicar este centro de custo a todos os itens
                        </button>
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
                        c => canonUnidade(it.unidade_nf) === c.de
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
                              {it.icms_retido && (
                                <div title={`CST/CSOSN ${it.cst_icms}${it.valor_icms_st ? ` · ICMS-ST na NF: ${it.valor_icms_st.toLocaleString("pt-BR",{style:"currency",currency:"BRL"})}` : ""}`}
                                  style={{ fontSize: 10, display: "inline-flex", alignItems: "center", gap: 4, alignSelf: "flex-start", background: "#FEF3C7", color: "#92400E", padding: "1px 6px", borderRadius: 4, fontWeight: 600 }}>
                                  ICMS retido (ST) — CST {it.cst_icms}
                                </div>
                              )}
                              {it.pa_auto && it.pa_nome ? (
                                <div style={{ fontSize: 10, display: "flex", alignItems: "center", gap: 4, color: "#111111" }}>
                                  <span style={{ background: "#E8E8E8", padding: "1px 5px", borderRadius: 3, fontWeight: 600 }}>PA</span>
                                  <strong>{it.pa_nome}</strong>
                                  <span style={{ color: "#666" }}>← {it.nome_comercial_ref}</span>
                                </div>
                              ) : (
                                /* Item de estoque: só insumo do catálogo — sem centro de custo
                                   (a apropriação de custo é no consumo, não na compra). */
                                <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                                  <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                                    <select value={it.insumo_id} onChange={e => {
                                        const nid = e.target.value;
                                        const ins = insumos.find(i => i.id === nid);
                                        const autoLotes = ins?.categoria === "semente" && it.lotes_semente.length === 0
                                          ? [{ numero: "", quantidade_kg: undefined }]
                                          : it.lotes_semente;
                                        const linhas = linhasPedidoDoProduto(nid);
                                        // Reavalia a conversão ao (re)escolher o insumo — uma conversão auto-detectada
                                        // na importação (baseada só na unidade da NF, sem saber ainda qual catálogo
                                        // seria escolhido) pode não fazer sentido pro insumo selecionado agora. Ex:
                                        // NF em "L" bate com a regra "L→mL" e multiplica ×1000 mesmo quando o insumo
                                        // do catálogo também é "L" — sem conversão nenhuma sendo necessária de verdade.
                                        let patchConv: Partial<typeof it> = {};
                                        if (ins) {
                                          if (canonUnidade(it.unidade_nf) === canonUnidade(ins.unidade)) {
                                            // Mesma unidade dos dois lados — nunca deveria converter.
                                            patchConv = { conversao_key: "", quantidade: it.qtd_nf, fator_conversao: 1 };
                                          } else {
                                            // Unidades diferentes de verdade — só aplica automática se existir o
                                            // par exato (NF → catálogo); senão deixa sem conversão e o alerta
                                            // de unidade divergente orienta o usuário a escolher manualmente.
                                            const parExato = TABELA_CONVERSAO.find(
                                              c => c.tipo === "auto" && c.de === canonUnidade(it.unidade_nf) && c.para === canonUnidade(ins.unidade)
                                            );
                                            patchConv = parExato && parExato.fator
                                              ? { conversao_key: parExato.key, quantidade: it.qtd_nf * parExato.fator, fator_conversao: parExato.fator }
                                              : { conversao_key: "", quantidade: it.qtd_nf, fator_conversao: 1 };
                                          }
                                        }
                                        setItem(it.key, { insumo_id: nid, lotes_semente: autoLotes, pedido_item_id: linhas.length === 1 ? linhas[0].id : "", ...patchConv });
                                      }} style={{ ...inp, fontSize: 11, padding: "4px 8px", flex: 1 }}>
                                      <option value="">— catálogo —</option>
                                      {insumos.map(i => <option key={i.id} value={i.id}>{i.nome} ({i.unidade})</option>)}
                                    </select>
                                    <button
                                      onClick={() => abrirNovoInsumo(it.key, it.descricao_nf)}
                                      title="Cadastrar novo produto"
                                      style={{ flexShrink: 0, width: 22, height: 22, borderRadius: 5, border: "0.5px solid #C9921B", background: "#FBF0D8", color: "#7A5A12", cursor: "pointer", fontSize: 14, lineHeight: 1, padding: 0, fontWeight: 700 }}
                                    >+</button>
                                  </div>
                                  {it.insumo_id && linhasPedidoDoProduto(it.insumo_id).length > 1 && (
                                    <select value={it.pedido_item_id} onChange={e => setItem(it.key, { pedido_item_id: e.target.value })}
                                      style={{ ...inp, fontSize: 10, padding: "3px 6px", background: it.pedido_item_id ? "#FFF8E6" : "#FEE2E2", border: `0.5px solid ${it.pedido_item_id ? "#F6C87A" : "#FCA5A5"}` }}>
                                      <option value="">⚠ qual linha do pedido?</option>
                                      {linhasPedidoDoProduto(it.insumo_id).map(pi => (
                                        <option key={pi.id} value={pi.id}>{pi.quantidade.toLocaleString("pt-BR", { maximumFractionDigits: 3 })} {pi.unidade} (saldo {Math.max(0, pi.quantidade - (pi.qtd_cancelada ?? 0) - (pi.qtd_entregue ?? 0)).toLocaleString("pt-BR", { maximumFractionDigits: 3 })})</option>
                                      ))}
                                    </select>
                                  )}
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
                                  {fmtUnit(it.vunit_nf)}
                                </div>
                              ) : (
                                <InputMonetario decimais={5} value={it.vunit_nf || ""} onChange={v => setItem(it.key, { vunit_nf: v, valor_unitario: v })} style={{ ...inp, fontSize: 12, padding: "5px 8px" }} />
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

                                  {/* Alerta: unidade que vai pro estoque não bate com a do cadastro */}
                                  {(() => {
                                    const insumoDoItem = insumos.find(i => i.id === it.insumo_id);
                                    if (!insumoDoItem) return null;
                                    const unidadeEfetiva = conv ? conv.para : it.unidade_nf;
                                    if (canonUnidade(unidadeEfetiva) === canonUnidade(insumoDoItem.unidade)) return null;
                                    return (
                                      <div style={{ fontSize: 10, color: "#B91C1C", background: "#FEE2E2", borderRadius: 6, padding: "3px 8px", fontWeight: 600 }}>
                                        ⚠ NF em {unidadeEfetiva || "—"} ≠ cadastro em {insumoDoItem.unidade}
                                      </div>
                                    );
                                  })()}
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
                              <InputNumerico decimais={3} value={it.quantidade || ""} onChange={v => setItem(it.key, { quantidade: parseFloat(v)||0, qtd_nf: parseFloat(v)||0 })} style={{ ...inp, fontSize: 12, padding: "5px 8px" }} />
                            </div>
                            <div style={{ padding: "6px 8px" }}>
                              <InputMonetario decimais={5} value={it.valor_unitario || ""} onChange={v => setItem(it.key, { valor_unitario: v, vunit_nf: v })} style={{ ...inp, fontSize: 12, padding: "5px 8px" }} />
                            </div>
                            <div style={{ padding: "6px 8px", fontSize: 12, fontWeight: 600, color: "var(--text-1)" }}>
                              {fmtBRL(it.valor_total)}
                            </div>
                            <div style={{ padding: "6px 8px" }}>
                              {/* A Operação Gerencial (escolhida no cabeçalho) já diz o que este
                                  item precisa: combustível pede só o veículo, manutenção permite
                                  ratear entre várias máquinas, qualquer outra OG pede só o CC —
                                  sem alternar manualmente, sem repetir a mesma classificação da
                                  OG dentro de cada item. */}
                              {modoDireto === "combustivel" ? (
                                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                                  <select value={it.maquina_id} onChange={e => setItem(it.key, { maquina_id: e.target.value })} style={{ ...inp, fontSize: 12, padding: "5px 8px", background: "#FFF0E0", border: "0.5px solid #F0B060" }}>
                                    <option value="">⛽ Veículo que abasteceu —</option>
                                    {maquinas.map(m => <option key={m.id} value={m.id}>{m.nome}</option>)}
                                  </select>
                                  {/* Data, tipo de combustível, valor/L e valor total já vêm da NF —
                                      só falta o hodômetro/horímetro pra alimentar o histórico de
                                      abastecimento do veículo (mesmo registro que o abastecimento
                                      pela bomba em Estoque já cria). */}
                                  <InputNumerico decimais={1} value={it.horimetro || ""} onChange={v => setItem(it.key, { horimetro: parseFloat(v) || 0 })} placeholder="Hodômetro/Horímetro" style={{ ...inp, fontSize: 11, padding: "4px 8px", background: "#FFF0E0", border: "0.5px solid #F0B060" }} />
                                </div>
                              ) : modoDireto === "manutencao" ? (
                                <span style={{ fontSize: 11, color: "var(--text-3)" }}>🔧 Rateio por frota abaixo ↓</span>
                              ) : (
                                <select value={it.centro_custo_id} onChange={e => setItem(it.key, { centro_custo_id: e.target.value })} style={{ ...inp, fontSize: 12, padding: "5px 8px" }}>
                                  <option value="">— selecionar CC —</option>
                                  {ccOpts.map(c => <option key={c.id} value={c.id}>{c.codigo ? `${c.codigo} ` : ""}{c.nome}</option>)}
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
                              <InputNumerico decimais={3} value={it.quantidade || ""} onChange={v => setItem(it.key, { quantidade: parseFloat(v)||0, qtd_nf: parseFloat(v)||0 })} style={{ ...inp, fontSize: 12, padding: "5px 8px" }} />
                            </div>
                            <div style={{ padding: "6px 8px" }}>
                              <InputMonetario decimais={5} value={it.valor_unitario || ""} onChange={v => setItem(it.key, { valor_unitario: v, vunit_nf: v })} style={{ ...inp, fontSize: 12, padding: "5px 8px" }} />
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
                        {/* Rateio de custo por frota — peça/serviço de manutenção (Apropriação Direta)
                            apropriado a mais de uma máquina, cada uma com seu percentual do valor do item */}
                        {tipo === "custo_direto" && modoDireto === "manutencao" && (() => {
                          const totalPct = it.maquinas_rateio.reduce((s, r) => s + (r.percentual || 0), 0);
                          const ok = it.maquinas_rateio.length > 0 && Math.abs(totalPct - 100) < 0.01;
                          return (
                            <div style={{ padding: "8px 12px", background: "#FBF0D8", borderTop: "0.5px solid #F6C87A" }}>
                              <div style={{ fontSize: 11, fontWeight: 600, color: "#7A5A12", marginBottom: 6 }}>🔧 Rateio de custo por frota (opcional) — se informar máquinas, some 100%</div>
                              {it.maquinas_rateio.map((r, idx) => (
                                <div key={idx} style={{ display: "flex", gap: 8, marginBottom: 4, alignItems: "center" }}>
                                  <select value={r.maquina_id} onChange={e => {
                                    const novo = it.maquinas_rateio.map((x, i) => i === idx ? { ...x, maquina_id: e.target.value } : x);
                                    setItem(it.key, { maquinas_rateio: novo });
                                  }} style={{ ...inp, fontSize: 12, flex: 1, background: "#fff" }}>
                                    <option value="">— máquina —</option>
                                    {maquinas.map(m => <option key={m.id} value={m.id}>{m.nome}</option>)}
                                  </select>
                                  <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                                    <InputNumerico decimais={1} value={r.percentual || ""} onChange={v => {
                                      const novo = it.maquinas_rateio.map((x, i) => i === idx ? { ...x, percentual: parseFloat(v) || 0 } : x);
                                      setItem(it.key, { maquinas_rateio: novo });
                                    }} style={{ ...inp, fontSize: 12, width: 70, background: "#fff" }} />
                                    <span style={{ fontSize: 11, color: "#7A5A12" }}>%</span>
                                  </div>
                                  <button onClick={() => setItem(it.key, { maquinas_rateio: it.maquinas_rateio.filter((_, i) => i !== idx) })} style={{ background: "none", border: "none", cursor: "pointer", color: "#E24B4A", fontSize: 14, lineHeight: 1 }}>×</button>
                                </div>
                              ))}
                              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                                <button onClick={() => setItem(it.key, { maquinas_rateio: [...it.maquinas_rateio, { maquina_id: "", percentual: it.maquinas_rateio.length === 0 ? 100 : 0 }] })} style={{ fontSize: 11, padding: "4px 10px", borderRadius: 6, border: "0.5px solid #F6C87A", background: "#fff", cursor: "pointer", color: "#7A5A12" }}>+ Adicionar máquina</button>
                                {it.maquinas_rateio.length > 0 && (
                                  <span style={{ fontSize: 11, fontWeight: 600, color: ok ? "#166534" : "#B91C1C" }}>Total: {totalPct.toFixed(1)}%{!ok ? " — deve somar 100%" : ""}</span>
                                )}
                              </div>
                            </div>
                          );
                        })()}
                        {/* Lotes de semente — aparece somente quando insumo é semente */}
                        {tipo === "insumos" && insumos.find(i => i.id === it.insumo_id)?.categoria === "semente" && (() => {
                          const unidadeItem = insumos.find(i => i.id === it.insumo_id)?.unidade ?? "kg";
                          const isBAG = String(unidadeItem).toLowerCase() === "bag";
                          const labelQtd = isBAG ? "Qtd (bags)*" : "Peso (kg)*";
                          const multiLote = it.lotes_semente.length > 1;
                          const totalLotes = it.lotes_semente.reduce((s, l) => s + (l.quantidade_kg ?? 0), 0);
                          const qtdTotal = it.quantidade;
                          const diff = totalLotes > 0 ? Math.abs(totalLotes - qtdTotal) : null;
                          const ok = diff !== null && diff <= 0.01;
                          const loteSemPeso = multiLote && it.lotes_semente.some(l => l.numero && !(l.quantidade_kg ?? 0));
                          return (
                          <div style={{ borderTop: "0.5px solid var(--border-table)", padding: "8px 12px", background: "#F0F7F1" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                              <span style={{ fontSize: 11, fontWeight: 700, color: "#1A5C38" }}>🌱 Lotes de Semente</span>
                              <button
                                onClick={() => setItem(it.key, { lotes_semente: [...it.lotes_semente, { numero: "", quantidade_kg: undefined }] })}
                                style={{ fontSize: 11, padding: "2px 10px", borderRadius: 5, border: "0.5px solid #16A34A", background: "#E8F5E9", color: "#16A34A", cursor: "pointer", fontWeight: 700 }}
                              >+ Lote</button>
                              {it.lotes_semente.length === 0 && (
                                <span style={{ fontSize: 10, color: "#6B7A6E" }}>Adicione ao menos um lote para rastreabilidade</span>
                              )}
                              {multiLote && ok && (
                                <span style={{ fontSize: 10, fontWeight: 700, color: "#16A34A" }}>✓ {it.lotes_semente.length} lotes · totais conferem · cada lote terá entrada separada no estoque</span>
                              )}
                              {multiLote && !ok && totalLotes > 0 && (
                                <span style={{ fontSize: 10, fontWeight: 600, color: "#C9921B" }}>{it.lotes_semente.length} lotes</span>
                              )}
                            </div>
                            {multiLote && (
                              <div style={{ fontSize: 10, color: "#1A5C38", background: "#D8F0DC", border: "0.5px solid #A4D4AA", borderRadius: 6, padding: "4px 10px", marginBottom: 8 }}>
                                💡 Com múltiplos lotes, informe o peso de cada um — cada lote gerará uma entrada separada no estoque.
                              </div>
                            )}
                            {it.lotes_semente.length > 1 && (
                              <div style={{ fontSize: 10, color: "#1A5C38", background: "#D8F0DC", border: "0.5px solid #A4D4AA", borderRadius: 6, padding: "4px 10px", marginBottom: 8 }}>
                                🧬 Cada lote pode ser de uma variedade diferente — a NF pode trazer mais de uma. Deixe em branco se for a mesma variedade do item.
                              </div>
                            )}
                            {it.lotes_semente.length > 0 && (
                              <div style={{ display: "grid", gridTemplateColumns: "1fr 150px 100px 14px", gap: "0 6px", marginBottom: 4, padding: "0 2px" }}>
                                <span style={{ fontSize: 10, fontWeight: 600, color: "var(--text-3)" }}>Nº do Lote *</span>
                                <span style={{ fontSize: 10, fontWeight: 600, color: "var(--text-3)" }}>Variedade (se diferente)</span>
                                <span style={{ fontSize: 10, fontWeight: 600, color: "var(--text-3)" }}>{labelQtd}</span>
                                <span />
                              </div>
                            )}
                            {it.lotes_semente.map((lote, li) => {
                              const semPesoEste = multiLote && lote.numero && !(lote.quantidade_kg ?? 0);
                              return (
                              <div key={li} style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 4 }}>
                                <input
                                  placeholder="Ex: LS2025-001"
                                  value={lote.numero}
                                  onChange={e => {
                                    const novos = it.lotes_semente.map((l, i) => i === li ? { ...l, numero: e.target.value } : l);
                                    setItem(it.key, { lotes_semente: novos });
                                  }}
                                  style={{ ...inp, fontSize: 11, padding: "4px 8px", flex: 1 }}
                                />
                                <select
                                  value={lote.insumo_id ?? ""}
                                  onChange={e => {
                                    const novos = it.lotes_semente.map((l, i) => i === li ? { ...l, insumo_id: e.target.value || undefined } : l);
                                    setItem(it.key, { lotes_semente: novos });
                                  }}
                                  title="Variedade deste lote, se diferente da variedade do item"
                                  style={{ ...inp, fontSize: 11, padding: "4px 8px", width: 150, flexShrink: 0, color: lote.insumo_id ? "#1A5C38" : "var(--text-3)" }}
                                >
                                  <option value="">— igual ao item —</option>
                                  {insumos.filter(i => i.categoria === "semente").map(i => (
                                    <option key={i.id} value={i.id}>{i.nome}</option>
                                  ))}
                                </select>
                                <input
                                  type="number"
                                  min={0}
                                  step={0.01}
                                  placeholder={isBAG ? "bags" : "kg"}
                                  value={lote.quantidade_kg ?? ""}
                                  onChange={e => {
                                    const v = parseFloat(e.target.value) || undefined;
                                    const novos = it.lotes_semente.map((l, i) => i === li ? { ...l, quantidade_kg: v } : l);
                                    setItem(it.key, { lotes_semente: novos });
                                  }}
                                  style={{ ...inp, fontSize: 11, padding: "4px 8px", width: 100, flexShrink: 0, borderColor: semPesoEste ? "#E24B4A" : undefined }}
                                />
                                <button
                                  onClick={() => setItem(it.key, { lotes_semente: it.lotes_semente.filter((_, i) => i !== li) })}
                                  style={{ background: "none", border: "none", cursor: "pointer", color: "#E24B4A", fontSize: 15, flexShrink: 0 }}
                                >×</button>
                              </div>
                              );
                            })}
                            {/* Barra de totais — só quando múltiplos lotes */}
                            {multiLote && totalLotes > 0 && (() => {
                              const valorTotalItem = it.valor_total ?? 0;
                              const precoAjustado = totalLotes > 0 && valorTotalItem > 0
                                ? valorTotalItem / totalLotes
                                : null;
                              const precoOriginal = it.quantidade > 0 && valorTotalItem > 0
                                ? valorTotalItem / it.quantidade
                                : null;
                              const divergeValor = precoAjustado !== null && precoOriginal !== null && Math.abs(precoAjustado - precoOriginal) > 0.001;
                              return (
                              <div style={{ marginTop: 6 }}>
                                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: ok ? "#16A34A" : "#C9921B", marginBottom: 3 }}>
                                  <span>Total lotes: <strong>{totalLotes.toLocaleString("pt-BR", { maximumFractionDigits: 2 })} {isBAG ? "bags" : "kg"}</strong></span>
                                  <span>Total NF: <strong>{qtdTotal.toLocaleString("pt-BR", { maximumFractionDigits: 2 })} {isBAG ? "bags" : "kg"}</strong></span>
                                </div>
                                <div style={{ height: 4, background: "#D1E8D4", borderRadius: 4, overflow: "hidden" }}>
                                  <div style={{ height: "100%", width: `${Math.min((totalLotes / (qtdTotal || 1)) * 100, 100)}%`, background: ok ? "#16A34A" : "#C9921B", transition: "width 0.2s" }} />
                                </div>
                                {divergeValor && diff !== null && diff > 0.01 && (
                                  <div style={{ fontSize: 10, color: "#1A4870", background: "#E8F0FA", border: "0.5px solid #B0C8E0", borderRadius: 5, padding: "4px 8px", marginTop: 4 }}>
                                    ℹ️ Peso dos lotes difere da NF em {diff.toLocaleString("pt-BR", { maximumFractionDigits: 2 })} {isBAG ? "bags" : "kg"}.<br />
                                    O valor total <strong>(R$ {valorTotalItem.toLocaleString("pt-BR", { minimumFractionDigits: 2 })})</strong> é mantido — o custo unitário será ajustado para <strong>R$ {precoAjustado!.toLocaleString("pt-BR", { minimumFractionDigits: 4, maximumFractionDigits: 4 })}/{isBAG ? "bag" : "kg"}</strong> (era R$ {precoOriginal!.toLocaleString("pt-BR", { minimumFractionDigits: 4, maximumFractionDigits: 4 })}/{isBAG ? "bag" : "kg"}).
                                  </div>
                                )}
                                {ok && (
                                  <div style={{ fontSize: 10, color: "#16A34A", marginTop: 3 }}>
                                    ✓ Totais conferem — cada lote entrará no estoque com R$ {precoOriginal?.toLocaleString("pt-BR", { minimumFractionDigits: 4, maximumFractionDigits: 4 })}/{isBAG ? "bag" : "kg"}.
                                  </div>
                                )}
                                {loteSemPeso && (
                                  <div style={{ fontSize: 10, color: "#E24B4A", marginTop: 3 }}>
                                    ⚠️ Há lotes sem peso informado — preencha ou remova-os.
                                  </div>
                                )}
                              </div>
                              );
                            })()}
                          </div>
                          );
                        })()}
                      </div>
                    );
                    })}

                    {/* Rodapé totais */}
                    <div style={{ display: "flex", justifyContent: "flex-end", padding: "10px 16px", background: "var(--bg-card)", borderTop: "0.5px solid var(--border-table)", gap: 24 }}>
                      <span style={{ fontSize: 12, color: "var(--text-2)" }}>Cabeçalho NF: <strong>{fmtBRL(numBR(cab.valor_total)||0)}</strong></span>
                      <span style={{ fontSize: 12, color: "var(--text-2)" }}>Total itens: <strong style={{ color: Math.abs(totalItens - (numBR(cab.valor_total)||0)) > 0.01 ? "#E24B4A" : "#1A5C38" }}>{fmtBRL(totalItens)}</strong></span>
                    </div>
                  </div>

                  {/* Aviso para item sem associação */}
                  {tipo === "insumos" && itens.some(it => !it.insumo_id && !it.principio_ativo_id && it.descricao_nf.trim()) && (
                    <div style={{ background: "#FBF3E0", border: "0.5px solid #F6C87A", borderRadius: 8, padding: "10px 14px", fontSize: 12, color: "#7A5A12", marginBottom: 14 }}>
                      ⚠️ Itens sem insumo ou princípio ativo associado impedem o processamento da NF. Associe um produto do catálogo ou remova o item — item que não é produto de estoque use o tipo de entrada "Apropriação Direta".
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
                        { label: "Valor produtos",    value: fmtBRL(numBR(cab.valor_total)||0) },
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
                            {itens.filter(i => i.principio_ativo_id).length} item(s) → estoque PA ·{" "}
                          {itens.filter(i => i.insumo_id && !i.principio_ativo_id).length} item(s) → estoque insumo ·{" "}
                          {itens.filter(i => !i.insumo_id && !i.principio_ativo_id && i.descricao_nf.trim()).length} item(s) sem associação (ignorados)
                          {depositos.length > 0 && " · Depósito padrão: " + (nomeDeposito(itens.find(i => i.deposito_id)?.deposito_id ?? "") || "não definido")}
                        </div>
                      </div>
                    )}
                    {tipo === "custo_direto" && (
                      <div style={{ marginTop: 10, paddingTop: 10, borderTop: "0.5px solid var(--border-table)", fontSize: 11, color: "#1A6B3C" }}>
                        {modoDireto === "combustivel" && (
                          <>⛽ Combustível — {itens.filter(i => i.maquina_id && i.descricao_nf.trim()).length}/{itens.filter(i => i.descricao_nf.trim()).length} item(s) com veículo selecionado (opcional — obrigatório é Centro de Custo e Ano Safra, no topo da NF).</>
                        )}
                        {modoDireto === "manutencao" && (
                          <>🔧 Manutenção — {itens.filter(i => i.maquinas_rateio.length > 0 && i.descricao_nf.trim()).length}/{itens.filter(i => i.descricao_nf.trim()).length} item(s) com rateio por frota (opcional).</>
                        )}
                        {modoDireto === "cc" && (
                          <>{itens.filter(i => i.centro_custo_id && i.descricao_nf.trim()).length}/{itens.filter(i => i.descricao_nf.trim()).length} item(s) com centro de custo.</>
                        )}
                        {" "}Nenhuma movimentação de estoque será gerada.
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
                </div>

                  <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                    <div style={{ display: "flex", gap: 10 }}>
                      <button style={btnR} onClick={() => setEtapa("cabecalho")}>← Voltar</button>
                      {/* Estornar/Excluir — ficam aqui dentro do modal (não há mais botões de
                          linha por tipo na grid unificada); mesmas condições de status do
                          dropdown de ações da tela antiga. */}
                      {nfEdit && nfEdit.status === "processada" && (
                        <button onClick={() => estornarNFClick(nfEdit)} style={{ ...btnR, borderColor: "#F6C87A", background: "#FEF3E2", color: "#8A4A00" }}>↺ Estornar</button>
                      )}
                      {nfEdit && nfEdit.status === "processada" && nfEdit.tipo_entrada === "insumos" && (
                        <button onClick={() => abrirDevolucao(nfEdit)} style={{ ...btnR, borderColor: "#E24B4A50", color: "#791F1F" }}>↩ Devolver</button>
                      )}
                      {nfEdit && nfEdit.status === "processada" && nfEdit.tipo_entrada === "insumos" && (
                        <button onClick={() => router.push(`/fiscal?aba=venda&modo=remessa&nf_entrada_id=${nfEdit.id}`)} style={{ ...btnR, borderColor: "#1A487050", color: "#1A4870" }}>🚚 Emitir NF Remessa</button>
                      )}
                      {nfEdit && nfEdit.status === "processada" && (
                        <button onClick={() => abrirReclassificar(nfEdit)} style={{ ...btnR, borderColor: "#C9921B50", color: "#7A5200" }}>🏷 Reclassificar</button>
                      )}
                      {nfEdit && nfEdit.status !== "cancelada" && (
                        <button onClick={() => iniciarExclusaoNf(nfEdit)} style={{ ...btnR, borderColor: "#E24B4A50", background: "#FCEBEB", color: "#791F1F" }}>🗑 Excluir</button>
                      )}
                    </div>
                    {!viewOnly && (
                      <div style={{ display: "flex", gap: 10 }}>
                        <button style={btnR} onClick={async () => {
                          // Salvar como pendente sem processar
                          if (nfEdit) {
                            await atualizarNfEntrada(nfEdit.id, { status: "pendente" });
                            onSaved();
                            onClose();
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
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      {modalExcluir && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(11,45,80,0.32)", display: "flex", alignItems: "center", justifyContent: "center", zIndex:2000 }}
         >
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

      {modalNovoInsumo && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(11,45,80,0.32)", display: "flex", alignItems: "center", justifyContent: "center", zIndex:2000 }}
         >
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
                {Math.abs(devFatorDesconto - 1) > 0.001 && (
                  <div style={{ fontSize: 11, color: "#7A4300", marginTop: 4 }} title="A NF original teve desconto/acréscimo no total em relação à soma dos itens — o valor devolvido por item já sai ajustado nessa mesma proporção.">
                    Valor por item ajustado em {((devFatorDesconto - 1) * 100).toFixed(1)}% pro rata do {devFatorDesconto < 1 ? "desconto" : "acréscimo"} da NF original
                  </div>
                )}
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
                      <div style={{ padding: "8px 12px", fontSize: 13, color: "var(--text-1)" }}>
                        {it.descricao_produto}
                        {it.qtdOriginalNF != null && it.unidadeOriginalNF && it.unidadeOriginalNF !== it.unidade && (
                          <div style={{ fontSize: 10, color: "var(--text-3)", marginTop: 2 }}>
                            NF original: {it.qtdOriginalNF.toLocaleString("pt-BR", { maximumFractionDigits: 3 })} {it.unidadeOriginalNF}
                          </div>
                        )}
                      </div>
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
                <div>
                  <label style={lbl}>Centro de Custo</label>
                  <select value={reclassCC} onChange={e => setReclassCC(e.target.value)} style={inp}>
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

    </>
  );
}
