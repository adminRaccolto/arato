"use client";
export const dynamic = "force-dynamic";
import React, { useState, useEffect, useRef, useCallback, useMemo, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { supabase } from "../../../lib/supabase";
import { useAuth } from "../../../components/AuthProvider";
import TopNav from "../../../components/TopNav";
import SelectBusca from "../../../components/SelectBusca";
import { listarCentrosCustoGeralDaConta, listarPessoasDaConta, listarProdutoresDaConta } from "../../../lib/db";
import { avaliarLinhas, escolherRegra, sugerirTextoRegra, diferencaSoma, normalizarTexto, type LancMatch } from "../../../lib/conciliacao-match";

// ─── Tipos ────────────────────────────────────────────────────────────────────
interface ContaBancaria { id: string; nome: string; banco: string; agencia?: string; conta?: string; produtor_id?: string | null; fazenda_id?: string; conjunta?: boolean | null; cotitulares?: { produtor_id?: string | null }[] | null }

interface LinhaOFX {
  id: string;
  data: string;
  descricao: string;
  valor: number;
  tipo: "credito" | "debito";
  conciliado: boolean;
  lancamento_id?: string;
  lancamento_ids?: string[];
  lancamento_desc?: string;
  lancamento_valor?: number;
  // Como foi conciliada e com que confiança (Seção 277). "sugestao_*" = confiança média:
  // o sistema achou um lançamento provável, mas só concilia com um clique do usuário.
  origem_vinculo?: "regra" | "exato" | "sugestao" | "manual" | null;
  confianca?: "alta" | "media" | null;
  regra_id?: string | null;
  sugestao_lancamento_id?: string | null;
  sugestao_motivo?: string | null;
}

interface RegraConc {
  id: string;
  conta_bancaria_id: string | null;
  texto: string;
  tipo: "debito" | "credito";
  acao: "lancar" | "transferencia";
  operacao_classificacao: string | null;
  operacao_descricao: string | null;
  centro_custo_id: string | null;
  pessoa_id: string | null;
  conta_destino_id: string | null;
  ativa: boolean;
  usos: number;
}

// A migração Seção 277 (colunas novas em extrato_transacoes) pode ainda não ter sido
// executada: sem este flag, qualquer select/upsert com as colunas novas derrubaria a tela.
let COLUNAS_NOVAS = false;

interface Lancamento {
  id: string;
  tipo: "receber" | "pagar";
  descricao: string;
  valor: number;
  valor_pago?: number;
  data_vencimento: string;
  data_baixa?: string;
  status: string;
  categoria?: string;
  conta_bancaria?: string;
  produtor_id?: string | null;
  conciliado?: boolean;
  moeda?: string;
  pessoa_id?: string | null;
  lote_id?: string | null;
}

// Borderô = lote de pagamento do Contas a Pagar (pagamento_lotes + pagamento_lote_itens). Um borderô
// gera UMA saída no extrato (o total), então é conciliado como unidade — não título a título.
interface LoteInfo {
  id: string;
  status: string;                       // "pendente" (ainda não baixou) | "pago"
  tipo: "pagar" | "receber";
  valor_total: number;
  data_pagamento: string | null;
  conta_bancaria: string | null;
  descricao: string | null;
  conciliado: boolean;
  itens: { lancamento_id: string; valor_pago: number; valor_multa: number | null; valor_juros: number | null; valor_desconto: number | null }[];
}

interface Extrato {
  id: string;
  conta_id: string;
  conta_nome: string;
  data_importacao: string;
  data_inicio: string;
  data_fim: string;
  total_linhas: number;
  conciliados: number;
  pendentes: number;
  linhas: LinhaOFX[];
  usuario_nome?: string;
  ofx_storage_path?: string;
}

interface Pendencia {
  id: string;
  fitid: string;
  conta_id?: string;
  conta_nome?: string;
  data: string;
  descricao: string;
  valor: number;
  tipo: string;
  status: string;
}

interface HistoricoConciliacao {
  id: string;
  fazenda_id: string;
  extrato_id: string;
  fitid: string;
  conta_nome: string;
  data_transacao: string;
  descricao: string;
  valor: number;
  tipo: string;
  acao: "conciliado" | "desvinculado";
  lancamento_ids: string[];
  lancamento_desc: string;
  created_at: string;
  periodo_inicio?: string;
  periodo_fim?: string;
}

interface FormTesouraria {
  descricao: string;
  tipo: "pagar" | "receber";
  valor: number;
  data: string;
  tipo_op: string;  // id da operação de tesouraria (padrão ou custom)
  og_id: string;    // operacao_gerencial_id para vínculo fiscal
  conta_origem: string;
  conta_destino: string;
}

interface OpTesouraria {
  id: string;
  nome: string;
  tipo: "entrada" | "saida" | "ambos" | "transferencia" | "ajuste";
  descricao?: string;
  operacao_gerencial_id?: string | null;
}

interface OgMin { id: string; classificacao: string; descricao: string; tipo: string; fazenda_id?: string | null; }

// Operações padrão idênticas às de app/financeiro/tesouraria/operacoes/page.tsx
const OPS_TESOURARIA_PADRAO: OpTesouraria[] = [
  { id: "__taxa__",          nome: "Taxa Bancária",             tipo: "saida",        descricao: "TED, DOC, boletos, tarifas de manutenção, IOF" },
  { id: "__resgate__",       nome: "Resgate de Aplicação",      tipo: "entrada",      descricao: "Resgate de investimentos financeiros" },
  { id: "__aplicacao__",     nome: "Aplicação Financeira",      tipo: "saida",        descricao: "Investimento em CDB, LCA, tesouro direto, etc." },
  { id: "__transferencia__", nome: "Transferência entre Contas",tipo: "transferencia",descricao: "Movimentação entre contas bancárias próprias" },
  { id: "__ajuste__",        nome: "Ajuste de Saldo",           tipo: "ajuste",       descricao: "Correção de divergência entre saldo real e sistema" },
  { id: "__mutuo__",         nome: "Mútuo entre Empresas",      tipo: "ambos",        descricao: "Empréstimos entre empresas do grupo" },
  { id: "__seguro__",        nome: "Seguros",                   tipo: "saida",        descricao: "Prêmios e parcelas de apólices de seguro" },
  { id: "__consorcio__",     nome: "Consórcio",                 tipo: "saida",        descricao: "Parcelas mensais de consórcio" },
  { id: "__outros__",        nome: "Outros",                    tipo: "ambos",        descricao: "Operações financeiras diversas não classificadas" },
];

// ─── Parse OFX ────────────────────────────────────────────────────────────────
function parseOFX(texto: string): LinhaOFX[] {
  const linhas: LinhaOFX[] = [];
  const transacoes = texto.split(/<STMTTRN>/i).slice(1);
  for (const t of transacoes) {
    const get = (tag: string) => {
      const m = t.match(new RegExp(`<${tag}>([^<\r\n]+)`, "i"));
      return m ? m[1].trim() : "";
    };
    const fitid  = get("FITID");
    const dtPost = get("DTPOSTED");
    const trnAmt = parseFloat(get("TRNAMT").replace(",", "."));
    const memo   = get("MEMO") || get("NAME") || "(sem descrição)";
    if (!fitid || isNaN(trnAmt)) continue;
    const data = dtPost.length >= 8
      ? `${dtPost.slice(0, 4)}-${dtPost.slice(4, 6)}-${dtPost.slice(6, 8)}`
      : "";
    linhas.push({ id: fitid, data, descricao: memo, valor: Math.abs(trnAmt), tipo: trnAmt > 0 ? "credito" : "debito", conciliado: false });
  }
  return linhas.sort((a, b) => a.data.localeCompare(b.data));
}

// fetch com o token de acesso do navegador. As rotas de API validam o usuário, e o cookie de sessão
// pode estar expirado em aba ociosa (as rotas /api não passam pelo proxy que o renova); o token
// vindo do cliente Supabase é renovado automaticamente.
async function authFetch(url: string, init: RequestInit = {}) {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return fetch(url, { ...init, headers: { ...(init.headers as Record<string, string> | undefined), ...(token ? { Authorization: `Bearer ${token}` } : {}) } });
}

// Paginação segura: PostgREST devolve no máximo 1.000 linhas por consulta e corta o
// resto SEM erro — várias telas daqui perdiam linhas assim (achado real: contas com
// >1.000 transações mostravam só as 1.000 mais antigas).
async function paginar<T>(
  montar: (de: number, ate: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
): Promise<T[]> {
  const PAGE = 1000;
  const tudo: T[] = [];
  for (let de = 0; ; de += PAGE) {
    const { data, error } = await montar(de, de + PAGE - 1);
    if (error) throw new Error(error.message);
    tudo.push(...(data ?? []));
    if (!data || data.length < PAGE) break;
  }
  return tudo;
}

// ─── Sincronização com extrato_transacoes (fonte única de conciliação) ────────
// Tabela criada na Fase 1 (uma transação = um registro, único por
// conta_bancaria_id+fitid, em vez de presa dentro do JSON de um import) e
// adotada como fonte ativa da tela na Fase 3 (carregarExtratoUnificado). Esta
// função é o ponto único que grava nela toda vez que algo muda — tanto um
// import de OFX quanto uma ação de conciliação (vincular/desvincular/
// tesouraria/agrupar) — mantendo extratos_bancarios só como log histórico
// de auditoria (quem importou, quando, arquivo original).
//
// modo "import": um OFX pode trazer de novo uma transação que já foi
//   conciliada antes (por outro extrato ou ação manual) — nunca regride
//   conciliado=true pra false nesse caso; só preenche o que ainda não tinha.
// modo "acao": o usuário acabou de vincular/desvincular/lançar tesouraria
//   nesta linha agora — reflete exatamente o que a tela mandou, sem
//   comparar com o que já existia (a ação atual é que vale).
async function syncExtratoTransacoes(
  fazendaId: string,
  contaId: string | null | undefined,
  contaNome: string | null | undefined,
  linhas: LinhaOFX[],
  extratoId: string,
  modo: "import" | "acao",
): Promise<boolean> {
  if (!linhas.length) return true;
  if (!contaId) return false; // sem conta vinculada não dá pra deduplicar (chave exige conta_bancaria_id)

  // Achados da auditoria 21/09/2026: (1) a consulta `.in("fitid", <todos>)` estourava o
  // limite de URL em extratos grandes; o erro era ignorado, `existentes` vinha vazio e o
  // upsert seguinte GRAVAVA conciliado=false por cima das conciliações existentes
  // ("contas desconciliam"); (2) FITID repetido no mesmo lote derruba o upsert inteiro
  // ("ON CONFLICT … a second time"); (3) qualquer erro só ia pro console e a tela seguia
  // como se tivesse salvo. Agora: lotes pequenos, erro propaga (retorna false) e o
  // lote nunca regride conciliação se a leitura do estado atual falhou.
  // primeiro_/ultimo_extrato_id têm FK para extratos_bancarios: só um id que existe lá pode ser
  // gravado. O id "virtual-…" da visão contínua nunca existe — usá-lo derrubava TODA ação manual.
  const idExtratoValido = extratoId && !extratoId.startsWith("virtual-") ? extratoId : null;
  const vistos = new Set<string>();
  const unicas = linhas.filter(l => (vistos.has(l.id) ? false : (vistos.add(l.id), true)));

  const LOTE = 150;
  const mapaExistente = new Map<string, { fitid: string; valor: number; conciliado: boolean; lancamento_id: string | null; lancamento_ids: string[] | null; lancamento_desc: string | null; lancamento_valor: number | null; primeiro_extrato_id: string | null; ultimo_extrato_id?: string | null; origem_vinculo?: string | null; confianca?: string | null; regra_id?: string | null }>();
  for (let i = 0; i < unicas.length; i += LOTE) {
    const { data, error } = await supabase.from("extrato_transacoes")
      .select("fitid, valor, conciliado, lancamento_id, lancamento_ids, lancamento_desc, lancamento_valor, primeiro_extrato_id, ultimo_extrato_id" + (COLUNAS_NOVAS ? ", origem_vinculo, confianca, regra_id" : ""))
      .eq("conta_bancaria_id", contaId).in("fitid", unicas.slice(i, i + LOTE).map(l => l.id));
    if (error) { console.error("[syncExtratoTransacoes] leitura", error); return false; }
    for (const e of ((data ?? []) as unknown as Record<string, unknown>[])) mapaExistente.set(e.fitid as string, e as never);
  }

  const rows = unicas.map(l => {
    const ex = mapaExistente.get(l.id);
    // Alguns bancos (ex: Cresol) não geram FITID estável — é literalmente
    // "data + sequência daquele dia dentro do arquivo", não um id do banco.
    // Reimportar um período sobreposto pode reaproveitar o mesmo FITID pra
    // uma transação DIFERENTE (se a ordem/quantidade de lançamentos daquele
    // dia mudou entre os dois exports) — sem essa checagem, preservaria a
    // conciliação antiga colada numa transação nova e diferente (valor/data
    // sobrescritos, mas o vínculo do lançamento antigo mantido). Só confia
    // que é a mesma transação se o valor bater; senão trata como nova linha.
    const mesmaTransacao = !ex || Math.abs(ex.valor - l.valor) < 0.01;
    // Import nunca regride: se já estava conciliado, preserva o vínculo
    // existente mesmo que esta importação não tenha encontrado o match.
    const preservarConciliado = modo === "import" && mesmaTransacao && ex?.conciliado && !l.conciliado;
    return {
      fazenda_id: fazendaId,
      conta_bancaria_id: contaId,
      conta_nome: contaNome ?? null,
      fitid: l.id,
      data: l.data,
      descricao: l.descricao,
      valor: l.valor,
      tipo: l.tipo,
      conciliado: preservarConciliado ? true : l.conciliado,
      lancamento_id: preservarConciliado ? (ex?.lancamento_id ?? null) : (l.lancamento_id ?? null),
      lancamento_ids: preservarConciliado ? (ex?.lancamento_ids ?? null) : (l.lancamento_ids ?? null),
      lancamento_desc: preservarConciliado ? (ex?.lancamento_desc ?? null) : (l.lancamento_desc ?? null),
      lancamento_valor: preservarConciliado ? (ex?.lancamento_valor ?? null) : (l.lancamento_valor ?? null),
      primeiro_extrato_id: ex?.primeiro_extrato_id ?? idExtratoValido,
      ultimo_extrato_id: idExtratoValido ?? ex?.ultimo_extrato_id ?? null,
      updated_at: new Date().toISOString(),
      ...(COLUNAS_NOVAS ? {
        origem_vinculo: preservarConciliado ? (ex?.origem_vinculo ?? null) : (l.conciliado ? (l.origem_vinculo ?? "manual") : null),
        confianca: preservarConciliado ? (ex?.confianca ?? null) : (l.conciliado ? (l.confianca ?? null) : null),
        regra_id: preservarConciliado ? (ex?.regra_id ?? null) : (l.conciliado ? (l.regra_id ?? null) : null),
        sugestao_lancamento_id: l.conciliado || preservarConciliado ? null : (l.sugestao_lancamento_id ?? null),
        sugestao_motivo: l.conciliado || preservarConciliado ? null : (l.sugestao_motivo ?? null),
      } : {}),
    };
  });

  for (let i = 0; i < rows.length; i += LOTE) {
    const { error } = await supabase.from("extrato_transacoes").upsert(rows.slice(i, i + LOTE), { onConflict: "conta_bancaria_id,fitid" });
    if (error) { console.error("[syncExtratoTransacoes] gravação", error); return false; }
  }
  return true;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
const fmtBRL = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fmtDt  = (s?: string) => s ? s.split("-").reverse().join("/") : "—";
const hoje   = () => new Date().toISOString().slice(0, 10);

const ehParcial = (l: Lancamento) =>
  l.valor_pago !== undefined && l.valor_pago !== null && l.valor_pago > 0 && l.valor_pago < l.valor;

const statusMeta = (l: Lancamento): { label: string; bg: string; color: string } => {
  if (ehParcial(l)) return { label: "parcial", bg: "#FEF9C3", color: "#A16207" };
  if (l.status === "baixado") return { label: "baixado", bg: "#DCFCE7", color: "#16A34A" };
  if (l.status === "vencido") return { label: "vencido", bg: "#FEE2E2", color: "#DC2626" };
  return { label: "aberto", bg: "#FEF3C7", color: "#92400E" };
};

const COLS_OFX = "88px minmax(150px,1fr) 100px 128px 132px";

// Cores de status: só número NEGATIVO em vermelho queimado; sinaleiro verde = conciliado, mostarda = pendente
const COR_NEG  = "#A93226";
const COR_OK   = "#2E7D4F";
const COR_PEND = "#C9921B";
function Sinal({ cor, titulo }: { cor: string; titulo?: string }) {
  return <span title={titulo} style={{ display: "inline-block", width: 9, height: 9, borderRadius: "50%", background: cor, flexShrink: 0 }} />;
}

const lblRegra: React.CSSProperties = { fontSize: 11, fontWeight: 600, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.05em", display: "block", marginBottom: 4 };
const inpRegra: React.CSSProperties = { width: "100%", padding: "7px 10px", border: "0.5px solid var(--border)", borderRadius: 8, fontSize: 13, background: "var(--bg-card)", outline: "none", boxSizing: "border-box" };

const ORIGEM_META: Record<string, { label: string; bg: string; cor: string }> = {
  regra:    { label: "Regra",           bg: "#F1F3F6", cor: "#555" },
  exato:    { label: "Automático",      bg: "#F1F3F6", cor: "#555" },
  sugestao: { label: "Sugestão aceita", bg: "#F1F3F6", cor: "#555" },
  manual:   { label: "Manual",          bg: "#F1F3F6", cor: "#555" },
};


// ─── Componente ───────────────────────────────────────────────────────────────
export default function Conciliacao() {
  return <Suspense><ConciliacaoInner /></Suspense>;
}

function ConciliacaoInner() {
  const { fazendaId, fazendaIds, contaId, nomeUsuario } = useAuth();
  const searchParams = useSearchParams();
  const inputRef = useRef<HTMLInputElement>(null);

  const [contas, setContas]           = useState<ContaBancaria[]>([]);
  const [lancamentos, setLancamentos] = useState<Lancamento[]>([]);
  const [extratos, setExtratos]       = useState<Extrato[]>([]);
  const [extrato, setExtrato]         = useState<Extrato | null>(null);
  // Fase 3 — pendências agregadas por conta bancária, lidas de extrato_transacoes
  // (fonte única e contínua) em vez da lista fragmentada de extratos_bancarios.
  const [pendPorConta, setPendPorConta] = useState<{ conta_bancaria_id: string; conta_nome: string; pendentes: number }[]>([]);
  const [loading, setLoading]         = useState(false);
  const [abaAtiva, setAbaAtiva]       = useState<"extrato"|"historico"|"inconsistencias"|"regras">(() => searchParams.get("pendentes") === "true" ? "inconsistencias" : "extrato");
  const [historico, setHistorico]     = useState<HistoricoConciliacao[]>([]);
  const [expandedHist, setExpandedHist] = useState<string | null>(null);
  const [pendencias, setPendencias]   = useState<Pendencia[]>([]);
  const [regras, setRegras]           = useState<RegraConc[]>([]);
  // "Criar regra desta linha" no modal de tesouraria
  const [criarRegra, setCriarRegra]   = useState<{ ativo: boolean; texto: string; escopo: "conta" | "todas" }>({ ativo: false, texto: "", escopo: "todas" });
  // Aba Regras
  const [ccLista, setCcLista]         = useState<{ id: string; codigo?: string | null; nome: string; parent_id?: string | null }[]>([]);
  const [pessoasLista, setPessoasLista] = useState<{ id: string; nome: string }[]>([]);
  const [pendGlobais, setPendGlobais] = useState<{ descricao: string; tipo: string; conta_bancaria_id: string }[]>([]);
  const FORM_REGRA_VAZIO = { id: "", texto: "", tipo: "debito" as "debito" | "credito", conta_bancaria_id: "", acao: "lancar" as "lancar" | "transferencia", og_id: "", centro_custo_id: "", pessoa_id: "", conta_destino_id: "" };
  const [fRegra, setFRegra]           = useState(FORM_REGRA_VAZIO);
  const [savingRegra, setSavingRegra] = useState(false);
  const [aplicandoRegras, setAplicandoRegras] = useState(false);
  const [resumoImport, setResumoImport] = useState<null | { total: number; jaConciliadas: number; exatas: number; porRegra: number; sugestoes: number; pendentes: number; semOG: number; falhas: number }>(null);
  const [migracaoOk, setMigracaoOk]   = useState(true);
  const [subInconsist, setSubInconsist] = useState<"com_conta"|"sem_conta">("com_conta");

  const [contaSel, setContaSel]     = useState<string>("");
  const [filtroPend, setFiltroPend] = useState(() => searchParams.get("pendentes") === "true");
  const [busca, setBusca]           = useState("");
  const [buscaValor, setBuscaValor] = useState("");

  // Visão dentro do extrato aberto: linhas do OFX (padrão) ou CP/CR em aberto
  // cruzadas com o extrato atual (pra achar quem já está no banco mas ainda
  // não foi baixado no sistema).

  // Seleção múltipla de linhas OFX pendentes — pra lançar um único CP/CR
  // agrupado (ex: vários pedágios do mesmo dia) e conciliar todas de uma vez.
  const [selecaoMultipla, setSelecaoMultipla] = useState<Set<string>>(new Set());
  const [modalAgrupado, setModalAgrupado]     = useState(false);
  const [descAgrupado, setDescAgrupado]       = useState("");
  const [ogAgrupado, setOgAgrupado]           = useState("");
  const [savingAgrupado, setSavingAgrupado]   = useState(false);

  // Painel esquerdo — filtros
  const [buscaLanc, setBuscaLanc]           = useState("");
  const [filtroLancTipo, setFiltroLancTipo] = useState<"todos"|"pagar"|"receber">("todos");
  // Intervalo do lado CP/CR. Padrão: o mês completo corrente; ao abrir/importar um extrato adota o
  // intervalo do OFX. Baixados filtram por data de baixa; não baixados por data de vencimento.
  const mesCorrente = () => {
    const d = new Date();
    return { de: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`, ate: new Date(d.getFullYear(), d.getMonth() + 1, 0).toLocaleDateString("sv-SE") };
  };
  const [filtroLancDe, setFiltroLancDe]     = useState<string>(() => mesCorrente().de);
  const [filtroLancAte, setFiltroLancAte]   = useState<string>(() => mesCorrente().ate);
  // Abas do lado do sistema (esquerda): conciliados/baixados · abertos · conferência (largura total)
  const [abaSistema, setAbaSistema]         = useState<"conciliados" | "abertos" | "conferencia">("abertos");
  const [pessoasNomes, setPessoasNomes]     = useState<Map<string, string>>(new Map());
  const [lotes, setLotes]                   = useState<Map<string, LoteInfo>>(new Map());
  const [lotesAbertos, setLotesAbertos]     = useState<Set<string>>(new Set());   // borderôs expandidos na lista
  const [incluirBaixados, setIncluirBaixados] = useState(false);                  // aba de abertos: também baixados ainda não conciliados
  const [produtoresNomes, setProdutoresNomes] = useState<Map<string, string>>(new Map());

  // Período de fetch dos lançamentos (header — antes de importar OFX)
  const [periodoFetchDe, setPeriodoFetchDe] = useState<string>(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
  });
  const [periodoFetchAte, setPeriodoFetchAte] = useState<string>(() => {
    const d = new Date();
    const ultimo = new Date(d.getFullYear(), d.getMonth() + 1, 0);
    return ultimo.toISOString().slice(0, 10);
  });

  // Vinculação (bordero)
  const [linhaAtiva, setLinhaAtiva] = useState<LinhaOFX | null>(null);
  const [lancsSel, setLancsSel]     = useState<Set<string>>(new Set());
  const [salvando, setSalvando]     = useState(false);

  // Tesouraria inline
  const [modalTes, setModalTes]   = useState<LinhaOFX | null>(null);
  const [fTes, setFTes]           = useState<FormTesouraria>({ descricao: "", tipo: "pagar", valor: 0, data: "", tipo_op: "__taxa__", og_id: "", conta_origem: "", conta_destino: "" });
  const [savingTes, setSavingTes] = useState(false);
  const [opsCustom, setOpsCustom] = useState<OpTesouraria[]>([]);
  // As O.G. existem uma cópia por fazenda: a lista bruta traz todas; o seletor usa uma só por
  // classificação (preferindo a da fazenda ativa) e, ao gravar, o id é trocado pelo da fazenda
  // da conta bancária (ogParaFazenda).
  const [ogsBrutas, setOgsBrutas] = useState<OgMin[]>([]);
  const ogsDisponiveis = useMemo(() => {
    const porCls = new Map<string, OgMin>();
    for (const o of ogsBrutas) {
      const atual = porCls.get(o.classificacao);
      const pontos = (x: OgMin) => (x.fazenda_id === fazendaId ? 2 : x.fazenda_id ? 1 : 0);
      if (!atual || pontos(o) > pontos(atual)) porCls.set(o.classificacao, o);
    }
    return Array.from(porCls.values()).sort((a, b) => a.classificacao.localeCompare(b.classificacao));
  }, [ogsBrutas, fazendaId]);
  const ogParaFazenda = (ogId: string | null | undefined, fazId: string | null | undefined): string | null => {
    if (!ogId) return null;
    const cls = ogsBrutas.find(o => o.id === ogId)?.classificacao;
    if (!cls || !fazId) return ogId;
    return ogsBrutas.find(o => o.classificacao === cls && o.fazenda_id === fazId)?.id ?? ogId;
  };

  // Colunas redimensionáveis

  // Busca TODOS os lançamentos (não só os 600/1000 mais recentes) — o corte
  // fixo escondia lançamentos mais antigos por completo da conciliação (achado
  // real 18/09/2026: conta com 1438 lançamentos, só 600 chegavam a entrar em
  // memória — quase 60% invisíveis pro matching e pra tela). Fetch normal sem
  // paginação também bateria no limite padrão de 1000 do Supabase pra contas
  // grandes; paginado aqui do mesmo jeito que outras funções já fazem em
  // lib/db.ts.
  async function buscarTodosLancamentosConciliacao(
    fazIds: string[],
    filtroData?: { de: string; ate: string },
  ): Promise<Lancamento[]> {
    const PAGE = 1000;
    let all: Lancamento[] = [];
    let from = 0;
    while (true) {
      let q = supabase.from("lancamentos")
        .select("id,tipo,descricao,valor,valor_pago,data_vencimento,data_baixa,status,categoria,conta_bancaria,produtor_id,conciliado,moeda,pessoa_id,lote_id")
        .in("fazenda_id", fazIds)
        .not("status", "eq", "cancelado")
        // desempate por id: só data_vencimento é chave não-única e a paginação por range
        // pulava/duplicava lançamentos na fronteira das páginas.
        .order("data_vencimento", { ascending: false })
        .order("id", { ascending: true })
        .range(from, from + PAGE - 1);
      if (filtroData) q = q.gte("data_vencimento", filtroData.de).lte("data_vencimento", filtroData.ate);
      const { data, error } = await q;
      if (error) throw error;
      all = all.concat((data ?? []) as Lancamento[]);
      if (!data || data.length < PAGE) break;
      from += PAGE;
    }
    return all;
  }

  // ── Carregar dados ──────────────────────────────────────────────────────────
  const carregar = useCallback(async () => {
    if (!fazendaId) return;
    const [cR, lData, exR, hR, ogR, gsR, pR, etR, colR, regR, pesR, prodR] = await Promise.all([
      supabase.from("contas_bancarias").select("id,nome,banco,agencia,conta,produtor_id,fazenda_id,conjunta,cotitulares").in("fazenda_id", fazendaIds).order("nome"),
      buscarTodosLancamentosConciliacao(fazendaIds),
      // sem `linhas` (JSON de todas as transações de cada import): a tela só usa o cabeçalho
      // do log, e o payload inteiro travava o carregamento em contas com muitos imports.
      supabase.from("extratos_bancarios").select("id,fazenda_id,conta_id,conta_nome,data_importacao,data_inicio,data_fim,total_linhas,conciliados,pendentes,usuario_nome,ofx_storage_path").in("fazenda_id", fazendaIds).order("data_importacao", { ascending: false }),
      supabase.from("historico_conciliacao").select("*").in("fazenda_id", fazendaIds).order("created_at", { ascending: false }).limit(200),
      supabase.from("operacoes_tesouraria")
        .select("id,nome,tipo,operacao_gerencial_id")
        .in("fazenda_id", fazendaIds)
        .eq("ativo", true)
        .order("nome"),
      // OGs do cliente ficam gravadas por fazenda_id (conta_id nulo) — filtrar só por
      // conta_id/globais devolvia ~300 de milhares e o seletor de O.G. da tesouraria
      // vinha sem as contas do cliente (origem dos lançamentos de tarifa/IOF sem O.G.).
      paginar<OgMin>((de, ate) => supabase.from("operacoes_gerenciais")
        .select("id,classificacao,descricao,tipo,fazenda_id")
        .or([`fazenda_id.in.(${fazendaIds.join(",")})`, "and(fazenda_id.is.null,conta_id.is.null)", ...(contaId ? [`conta_id.eq.${contaId}`] : [])].join(","))
        .neq("inativo", true)
        .order("classificacao").order("id").range(de, ate))
        .then(data => ({ data, error: null }), error => ({ data: null, error })),
      supabase.from("conciliacao_pendencias")
        .select("id,fitid,conta_id,conta_nome,data,descricao,valor,tipo,status")
        .in("fazenda_id", fazendaIds)
        .not("status", "in", "(ignorada,ignorado)")
        .order("data", { ascending: false }),
      paginar<{ conta_bancaria_id: string; conta_nome: string | null; fitid: string }>((de, ate) => supabase.from("extrato_transacoes")
        .select("conta_bancaria_id,conta_nome,fitid")
        .in("fazenda_id", fazendaIds)
        .eq("conciliado", false)
        .not("conta_bancaria_id", "is", null)
        .order("id").range(de, ate))
        .then(data => ({ data, error: null }), error => ({ data: null, error })),
      // detecta se a migração Seção 277 já foi executada (colunas novas em extrato_transacoes)
      supabase.from("extrato_transacoes").select("origem_vinculo").limit(1),
      authFetch("/api/financeiro/conciliacao-regras").then(r => r.json()).catch(() => null),
      listarPessoasDaConta(fazendaId).catch(() => []),
      contaId ? listarProdutoresDaConta(contaId).catch(() => []) : Promise.resolve([]),
    ]);
    setPessoasNomes(new Map((pesR as { id: string; nome: string }[]).map(p => [p.id, p.nome])));
    setProdutoresNomes(new Map((prodR as { id: string; nome: string }[]).map(p => [p.id, p.nome])));
    COLUNAS_NOVAS = !colR.error;
    setMigracaoOk(COLUNAS_NOVAS && regR?.migracao !== false);
    setRegras(((regR?.regras ?? []) as RegraConc[]));
    if (cR.data) setContas(cR.data as ContaBancaria[]);
    setLancamentos(lData);
    // Borderôs (lotes de pagamento) e seus títulos
    try {
      const lt = await paginar<Omit<LoteInfo, "itens">>((de, ate) => supabase.from("pagamento_lotes")
        .select("id,status,tipo,valor_total,data_pagamento,conta_bancaria,descricao,conciliado")
        .in("fazenda_id", fazendaIds).order("id").range(de, ate) as unknown as PromiseLike<{ data: Omit<LoteInfo, "itens">[] | null; error: { message: string } | null }>);
      const mapa = new Map<string, LoteInfo>(lt.map(l => [l.id, { ...l, valor_total: Number(l.valor_total), itens: [] }]));
      const ids = Array.from(mapa.keys());
      for (let i = 0; i < ids.length; i += 100) {
        const it = await paginar<{ lote_id: string; lancamento_id: string; valor_pago: number; valor_multa: number | null; valor_juros: number | null; valor_desconto: number | null }>((de, ate) => supabase.from("pagamento_lote_itens")
          .select("lote_id,lancamento_id,valor_pago,valor_multa,valor_juros,valor_desconto").in("lote_id", ids.slice(i, i + 100)).order("id").range(de, ate));
        for (const x of it) mapa.get(x.lote_id)?.itens.push({ lancamento_id: x.lancamento_id, valor_pago: Number(x.valor_pago), valor_multa: x.valor_multa, valor_juros: x.valor_juros, valor_desconto: x.valor_desconto });
      }
      setLotes(mapa);
    } catch (e) { console.error("[carregar] borderôs", e); }
    if (hR.data) setHistorico(hR.data as HistoricoConciliacao[]);
    if (ogR.data) setOpsCustom(ogR.data as OpTesouraria[]);
    if (gsR.data) setOgsBrutas(gsR.data as OgMin[]);
    // "Inconsistências" lia conciliacao_pendencias (tabela legada, nunca limpa): 68% das
    // linhas já estavam conciliadas ou nem existiam mais em extrato_transacoes (fonte
    // única). Só mostra pendência de conta bancária que ainda está pendente de verdade.
    const pendVivas = new Set((etR.data ?? []).map(r => `${r.conta_bancaria_id}|${r.fitid}`));
    if (pR.data) setPendencias((pR.data as Pendencia[]).filter(p => !p.conta_id || pendVivas.has(`${p.conta_id}|${p.fitid}`)));
    if (etR.data) {
      const mapa = new Map<string, { conta_bancaria_id: string; conta_nome: string; pendentes: number }>();
      for (const row of etR.data as { conta_bancaria_id: string; conta_nome: string | null }[]) {
        const atual = mapa.get(row.conta_bancaria_id);
        if (atual) atual.pendentes++;
        else mapa.set(row.conta_bancaria_id, { conta_bancaria_id: row.conta_bancaria_id, conta_nome: row.conta_nome ?? "—", pendentes: 1 });
      }
      setPendPorConta(Array.from(mapa.values()).sort((a, b) => b.pendentes - a.pendentes));
    }

    if (exR.data) {
      // Só o log de auditoria (histórico de importações) — Fase 3 não abre
      // mais automaticamente um card isolado a partir daqui; o ponto de
      // entrada agora é o banner de pendências por conta (pendPorConta,
      // agregado de extrato_transacoes) ou a seleção manual de conta+período.
      setExtratos((exR.data as unknown as Extrato[]).map(e => ({ ...e, linhas: [] })));
    }
  }, [fazendaId, fazendaIds, contaId, searchParams]);

  useEffect(() => { carregar(); }, [carregar]);

  // Ao abrir/importar um extrato, o intervalo do lado CP/CR passa a ser o intervalo do OFX;
  // sem extrato aberto, volta ao mês completo corrente. O usuário pode alterar depois.
  useEffect(() => {
    if (!extrato) { const m = mesCorrente(); setFiltroLancDe(m.de); setFiltroLancAte(m.ate); return; }
    setFiltroLancDe(extrato.data_inicio);
    setFiltroLancAte(extrato.data_fim);
    setAbaSistema("abertos");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [extrato?.id]);

  // Aba Regras: listas de centro de custo/pessoa e as pendências atuais (pra "quantas linhas pega")
  useEffect(() => {
    if (abaAtiva !== "regras" || !fazendaId) return;
    listarCentrosCustoGeralDaConta(fazendaId).then(l => setCcLista(l as never)).catch(() => {});
    listarPessoasDaConta(fazendaId).then(l => setPessoasLista((l as { id: string; nome: string }[]).map(p => ({ id: p.id, nome: p.nome })))).catch(() => {});
    paginar<{ descricao: string; tipo: string; conta_bancaria_id: string }>((de, ate) => supabase.from("extrato_transacoes")
      .select("descricao,tipo,conta_bancaria_id").in("fazenda_id", fazendaIds).eq("conciliado", false).not("conta_bancaria_id", "is", null).order("id").range(de, ate))
      .then(setPendGlobais).catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [abaAtiva, fazendaId]);

  const [lancRefresh, setLancRefresh] = useState(false);
  async function recarregarLancamentos() {
    if (!fazendaId || lancRefresh) return;
    setLancRefresh(true);
    try {
      const data = await buscarTodosLancamentosConciliacao(fazendaIds);
      setLancamentos(data);
    } finally { setLancRefresh(false); }
  }

  // ── Fase 3 — visão unificada e contínua por conta bancária + período ──────────
  // Substitui o card por-importação: lê direto de extrato_transacoes (fonte
  // única, deduplicada por conta+fitid), monta um Extrato "virtual" com o
  // mesmo formato de sempre (id prefixado "virtual-", nunca gravado em
  // extratos_bancarios) e abre no mesmo editor de sempre — vincular,
  // tesouraria e agrupar continuam funcionando sem alteração porque só
  // enxergam extrato.linhas. persistExtrato grava a ação por lançamento_id
  // (linha a linha) e por extrato_transacoes (fitid+conta) — nenhum dos dois
  // depende de um extratos_bancarios.id real, então o id virtual não regride
  // nada mesmo sem existir como linha própria naquela tabela.
  async function carregarExtratoUnificado(contaBancariaId: string, dataIni: string, dataFim: string) {
    if (!fazendaId || !contaBancariaId || !dataIni || !dataFim) return;
    setLoading(true);
    try {
      // Paginado: sem isso um período com >1.000 transações vinha cortado em 1.000 —
      // justamente as MAIS RECENTES sumiam (ordem por data crescente).
      const data = await paginar<Record<string, unknown>>((de, ate) => supabase
        .from("extrato_transacoes")
        .select("fitid,data,descricao,valor,tipo,conciliado,lancamento_id,lancamento_ids,lancamento_desc,lancamento_valor" + (COLUNAS_NOVAS ? ",origem_vinculo,confianca,regra_id,sugestao_lancamento_id,sugestao_motivo" : ""))
        .eq("conta_bancaria_id", contaBancariaId)
        .in("fazenda_id", fazendaIds)
        .gte("data", dataIni)
        .lte("data", dataFim)
        .order("data", { ascending: true }).order("fitid", { ascending: true })
        .range(de, ate) as unknown as PromiseLike<{ data: Record<string, unknown>[] | null; error: { message: string } | null }>);

      const linhas: LinhaOFX[] = data.map(t => ({
        id: t.fitid as string,
        data: t.data as string,
        descricao: t.descricao as string,
        valor: Number(t.valor),
        tipo: t.tipo as "credito" | "debito",
        conciliado: !!t.conciliado,
        lancamento_id: (t.lancamento_id as string) ?? undefined,
        lancamento_ids: (t.lancamento_ids as string[]) ?? undefined,
        lancamento_desc: (t.lancamento_desc as string) ?? undefined,
        lancamento_valor: t.lancamento_valor != null ? Number(t.lancamento_valor) : undefined,
        origem_vinculo: (t.origem_vinculo as LinhaOFX["origem_vinculo"]) ?? null,
        confianca: (t.confianca as LinhaOFX["confianca"]) ?? null,
        regra_id: (t.regra_id as string) ?? null,
        sugestao_lancamento_id: (t.sugestao_lancamento_id as string) ?? null,
        sugestao_motivo: (t.sugestao_motivo as string) ?? null,
      }));
      const contaObj = contas.find(c => c.id === contaBancariaId);
      const conciliadoN = linhas.filter(l => l.conciliado).length;

      const unificado: Extrato = {
        id: `virtual-${contaBancariaId}-${dataIni}-${dataFim}`,
        conta_id: contaBancariaId,
        conta_nome: contaObj?.nome ?? "",
        data_importacao: hoje(),
        data_inicio: dataIni,
        data_fim: dataFim,
        total_linhas: linhas.length,
        conciliados: conciliadoN,
        pendentes: linhas.length - conciliadoN,
        linhas,
      };
      setExtrato(unificado);
      setAbaAtiva("extrato");
      setLinhaAtiva(null);
      setLancsSel(new Set());
    } catch (e) {
      console.error("[carregarExtratoUnificado]", e);
      alert("Não foi possível carregar a conciliação desta conta. Tente novamente.");
    } finally {
      setLoading(false);
    }
  }

  // Abre a conciliação da conta com TODO o extrato já importado (do 1º ao último lançamento).
  async function abrirContaCompleta(contaBancariaId: string) {
    setContaSel(contaBancariaId);
    const [{ data: ini }, { data: fim }] = await Promise.all([
      supabase.from("extrato_transacoes").select("data").eq("conta_bancaria_id", contaBancariaId).in("fazenda_id", fazendaIds).order("data", { ascending: true }).limit(1),
      supabase.from("extrato_transacoes").select("data").eq("conta_bancaria_id", contaBancariaId).in("fazenda_id", fazendaIds).order("data", { ascending: false }).limit(1),
    ]);
    if (!ini?.[0] || !fim?.[0]) { alert("Esta conta ainda não tem extrato importado. Use \"Importar OFX\"."); return; }
    carregarExtratoUnificado(contaBancariaId, ini[0].data as string, fim[0].data as string);
  }
  const abrirContaPendente = abrirContaCompleta;

  // ── Upload OFX ─────────────────────────────────────────────────────────────
  async function handleOFX(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !fazendaId) return;
    // Conta bancária é obrigatória pra importar — a chave de deduplicação é conta+FITID.
    if (!contaSel) {
      alert("Selecione a conta bancária antes de importar o OFX.");
      if (inputRef.current) inputRef.current.value = "";
      return;
    }
    setLoading(true);
    try {
      // Bancos como Cresol/BB exportam OFX em Windows-1252: ler como UTF-8 vira "�" na
      // descrição ("INTEGRALIZA��O") e quebra a busca por texto. Tenta UTF-8 e cai
      // pra Windows-1252 quando aparece o caractere de substituição.
      const buf = await file.arrayBuffer();
      let texto = new TextDecoder("utf-8").decode(buf);
      if (texto.includes("\uFFFD")) texto = new TextDecoder("windows-1252").decode(buf);
      let linhas = parseOFX(texto);
      if (linhas.length === 0) {
        alert("Nenhuma transação encontrada no arquivo OFX.");
        return;
      }
      // FITID repetido dentro do mesmo arquivo (banco sem id estável) derrubava o
      // upsert do lote inteiro. Desempata com sufixo determinístico (mesma ordem do
      // arquivo → mesmo id numa reimportação).
      const contFit = new Map<string, number>();
      linhas = linhas.map(l => {
        const n = (contFit.get(l.id) ?? 0) + 1;
        contFit.set(l.id, n);
        return n === 1 ? l : { ...l, id: `${l.id}~${n}` };
      });

      const dataInicio  = linhas[0]?.data ?? hoje();
      const dataFim     = linhas[linhas.length - 1]?.data ?? hoje();
      const dIniMatch = new Date(dataInicio + "T00:00:00");
      dIniMatch.setDate(dIniMatch.getDate() - 15);
      const dFimMatch = new Date(dataFim + "T00:00:00");
      dFimMatch.setDate(dFimMatch.getDate() + 15);
      const iniMatch = dIniMatch.toISOString().slice(0, 10);
      const fimMatch = dFimMatch.toISOString().slice(0, 10);

      // Lançamentos frescos do período do OFX (±15 dias). Antes o select omitia
      // conta_bancaria: o merge SUBSTITUÍA os lançamentos do estado por cópias sem
      // conta, e os baixados sumiam do painel esquerdo até recarregar a página.
      const lancFresh = await paginar<Lancamento>((de, ate) => supabase.from("lancamentos")
        .select("id,tipo,descricao,valor,valor_pago,data_vencimento,data_baixa,status,categoria,conta_bancaria,produtor_id,conciliado,moeda,pessoa_id,lote_id")
        .in("fazenda_id", fazendaIds)
        .not("status", "eq", "cancelado")
        .gte("data_vencimento", iniMatch)
        .lte("data_vencimento", fimMatch)
        .order("id").range(de, ate));
      let lancParaMatch = lancamentos;
      if (lancFresh.length > 0) {
        const mapa = new Map(lancamentos.map(l => [l.id, l]));
        for (const l of lancFresh) mapa.set(l.id, l);
        lancParaMatch = Array.from(mapa.values()).sort((a, b) => b.data_vencimento.localeCompare(a.data_vencimento));
        setLancamentos(lancParaMatch);
      }

      // Estado atual do banco: quem já está conciliado (não re-casar) e quais lançamentos
      // já estão ligados a alguma linha (de qualquer conta) — base do "1 lançamento ↔ 1 linha".
      const conciliadasNoBanco = await paginar<{ fitid: string; conta_bancaria_id: string | null; lancamento_id: string | null; lancamento_ids: string[] | null }>((de, ate) => supabase.from("extrato_transacoes")
        .select("fitid,conta_bancaria_id,lancamento_id,lancamento_ids")
        .in("fazenda_id", fazendaIds).eq("conciliado", true)
        .gte("data", iniMatch).lte("data", fimMatch)
        .order("id").range(de, ate));
      const lancamentosJaVinculados = new Set<string>();
      const fitidsJaConciliados = new Set<string>();
      for (const r of conciliadasNoBanco) {
        for (const id of (r.lancamento_ids?.length ? r.lancamento_ids : r.lancamento_id ? [r.lancamento_id] : [])) lancamentosJaVinculados.add(id);
        if (r.conta_bancaria_id === contaSel) fitidsJaConciliados.add(r.fitid);
      }

      const contaObj = contas.find(c => c.id === contaSel);
      // Confiança do casamento (proposta aprovada 21/09/2026): só "alta" concilia e baixa
      // sozinha; "média" vira sugestão (um clique); o resto fica pendente para as regras/manual.
      const titulares = [contaObj?.produtor_id, ...(contaObj?.cotitulares ?? []).map(c => c.produtor_id)].filter(Boolean) as string[];
      const novasLinhas = linhas.filter(l => !fitidsJaConciliados.has(l.id));
      const aval = avaliarLinhas(
        novasLinhas.map(l => ({ id: l.id, data: l.data, valor: l.valor, tipo: l.tipo, descricao: l.descricao })),
        lancParaMatch as LancMatch[],
        { conta: contaSel ? { id: contaSel, titulares } : null, lancamentosJaVinculados },
      );
      let nAlta = 0;
      linhas = linhas.map(l => {
        const a = aval.get(l.id);
        if (!a?.lancamento) return l;
        const c = a.lancamento;
        if (a.nivel === "alta") {
          nAlta++;
          return { ...l, conciliado: true, lancamento_id: c.id, lancamento_ids: [c.id], lancamento_desc: c.descricao, lancamento_valor: Number(c.valor_pago ?? c.valor), origem_vinculo: "exato" as const, confianca: "alta" as const };
        }
        // sem a migração Seção 277 não há onde guardar a sugestão: a linha simplesmente fica pendente
        if (a.nivel === "media" && COLUNAS_NOVAS) return { ...l, sugestao_lancamento_id: c.id, sugestao_motivo: a.motivos.join("; ") };
        return l;
      });
      const conciliadoN = linhas.filter(l => l.conciliado).length;

      const novoExtrato: Extrato = {
        id: `ext-${Date.now()}`,
        conta_id: contaSel,
        conta_nome: contaObj?.nome ?? contaSel,
        data_importacao: hoje(),
        data_inicio: dataInicio,
        data_fim: dataFim,
        total_linhas: linhas.length,
        conciliados: conciliadoN,
        pendentes: linhas.length - conciliadoN,
        linhas,
      };

      // Ordem importa: (1) registro do import em extratos_bancarios — as transações apontam para ele
      // por FK (primeiro_/ultimo_extrato_id); gravá-las antes derrubava TODO import; (2) transações
      // (fonte única); (3) só então as baixas. Falhou (1) ou (2) = nada é baixado nem conciliado.
      const ofxPath = `ofx-conciliacao/${fazendaId}/${novoExtrato.id}.ofx`;
      const up = await supabase.storage.from("arquivos").upload(ofxPath, new Blob([texto], { type: "text/plain" }), { upsert: false });
      if (up.error) console.error("[handleOFX] upload OFX", up.error);
      const logIns = await supabase.from("extratos_bancarios").insert({
        id: novoExtrato.id, fazenda_id: fazendaId,
        conta_id: contaSel || null, conta_nome: novoExtrato.conta_nome,
        data_importacao: novoExtrato.data_importacao,
        data_inicio: dataInicio, data_fim: dataFim,
        total_linhas: linhas.length, conciliados: conciliadoN,
        pendentes: linhas.length - conciliadoN, linhas,
        usuario_nome:    nomeUsuario ?? null,
        ofx_storage_path: up.error ? null : ofxPath,
      });
      if (logIns.error) {
        console.error("[handleOFX] registro do import", logIns.error);
        alert("Não foi possível registrar a importação do extrato. Nada foi baixado nem conciliado — tente importar novamente.");
        return;
      }
      const okSync = await syncExtratoTransacoes(fazendaId, contaSel, novoExtrato.conta_nome, linhas, novoExtrato.id, "import");
      if (!okSync) {
        // desfaz o registro do import (e o arquivo) para não deixar um import "fantasma" no histórico
        await supabase.from("extratos_bancarios").delete().eq("id", novoExtrato.id);
        if (!up.error) await supabase.storage.from("arquivos").remove([ofxPath]);
        alert("Não foi possível gravar as transações do extrato. Nada foi baixado nem conciliado — tente importar novamente.");
        return;
      }

      // Baixa os lançamentos que o auto-match acabou de vincular (autoMatch só marca
      // conciliado e vincula — sem este passo ficavam "em_aberto"; achado real 18/09/2026:
      // 133 de ~970 transações conciliadas com lançamento ainda em aberto). Também grava a
      // conta bancária nos já baixados que estavam sem conta (Posição Bancária).
      const vinculadasAuto = linhas
        .filter(l => l.conciliado && !fitidsJaConciliados.has(l.id) && (l.lancamento_ids?.length || l.lancamento_id))
        .flatMap(l => (l.lancamento_ids?.length ? l.lancamento_ids : [l.lancamento_id!]).map(id => ({ id, linha: l })));
      const paraBaixarAuto = vinculadasAuto.reduce((acc, { id, linha }) => {
        const l = lancParaMatch.find(x => x.id === id);
        if (l && l.status !== "baixado" && l.status !== "parcial" && !acc.some(a => a.id === id)) {
          acc.push({ id, data_baixa: linha.data, valor_pago: l.valor_pago ?? l.valor, conta_bancaria: contaSel || undefined });
        }
        return acc;
      }, [] as { id: string; data_baixa: string; valor_pago: number; conta_bancaria?: string }[]);
      const definirContaAuto = vinculadasAuto
        .map(({ id }) => lancParaMatch.find(x => x.id === id))
        .filter((l): l is Lancamento => !!l && (l.status === "baixado" || l.status === "parcial") && !l.conta_bancaria)
        .map(l => ({ id: l.id, conta_bancaria: contaSel }));
      const idsConciliarAuto = Array.from(new Set(vinculadasAuto.map(v => v.id)));

      if (paraBaixarAuto.length > 0 || definirContaAuto.length > 0 || idsConciliarAuto.length > 0) {
        try {
          const res = await authFetch("/api/financeiro/persistir-extrato", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              id: novoExtrato.id,
              linhas: novoExtrato.linhas,
              conciliados: novoExtrato.conciliados,
              pendentes: novoExtrato.pendentes,
              baixar: paraBaixarAuto,
              definir_conta: definirContaAuto,
              lancamento_ids_conciliados: idsConciliarAuto,
            }),
          });
          const json = await res.json().catch(() => ({ ok: false, error: "resposta inválida" }));
          if (!res.ok || json?.ok === false) {
            alert(`As transações foram importadas, mas a baixa automática dos lançamentos falhou (${json?.error ?? res.status}). Abra a conciliação e use "Baixar e Conciliar" nas linhas afetadas.`);
          }
        } catch (err) {
          console.error("[handleOFX] baixa automática", err);
          alert("As transações foram importadas, mas a baixa automática dos lançamentos falhou. Abra a conciliação e use \"Baixar e Conciliar\" nas linhas afetadas.");
        }
        setLancamentos(prev => prev.map(l => {
          const bx = paraBaixarAuto.find(b => b.id === l.id);
          if (bx) return { ...l, status: "baixado" as const, data_baixa: bx.data_baixa, valor_pago: bx.valor_pago, conta_bancaria: bx.conta_bancaria ?? l.conta_bancaria, conciliado: true };
          const dc = definirContaAuto.find(d => d.id === l.id);
          if (dc) return { ...l, conta_bancaria: dc.conta_bancaria, conciliado: true };
          return idsConciliarAuto.includes(l.id) ? { ...l, conciliado: true } : l;
        }));
      }

      // Regras de conciliação (tarifa, IOF, juros, aplicação…): cada linha ainda pendente cujo
      // histórico casa com uma regra vira lançamento já classificado. Roda no servidor.
      const aplicadosPorRegra = new Set<string>();
      let semOGRegras = 0, falhasRegras = 0;
      if (migracaoOk && regras.some(r => r.ativa)) {
        const pendentesFit = linhas.filter(l => !l.conciliado).map(l => l.id);
        for (let i = 0; i < pendentesFit.length; i += 400) {
          try {
            const r = await authFetch("/api/financeiro/conciliacao-regras/aplicar", {
              method: "POST", headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ conta_bancaria_id: contaSel, fitids: pendentesFit.slice(i, i + 400) }),
            }).then(x => x.json());
            if (r?.ok) {
              for (const f of (r.fitidsAplicados ?? []) as string[]) aplicadosPorRegra.add(f);
              semOGRegras += r.semOG ?? 0; falhasRegras += r.nFalhas ?? 0;
            } else { falhasRegras++; console.error("[handleOFX] regras", r); }
          } catch (err) { falhasRegras++; console.error("[handleOFX] regras", err); }
        }
      }
      const sugeridas = linhas.filter(l => !l.conciliado && l.sugestao_lancamento_id && !aplicadosPorRegra.has(l.id)).length;
      setResumoImport({
        total: linhas.length,
        jaConciliadas: linhas.filter(l => fitidsJaConciliados.has(l.id)).length,
        exatas: nAlta, porRegra: aplicadosPorRegra.size, sugestoes: sugeridas,
        pendentes: Math.max(0, linhas.filter(l => !l.conciliado && !fitidsJaConciliados.has(l.id)).length - aplicadosPorRegra.size - sugeridas),
        semOG: semOGRegras, falhas: falhasRegras,
      });

      const naoConc = linhas.filter(l => !l.conciliado && !aplicadosPorRegra.has(l.id));
      if (naoConc.length > 0) {
        const { error: ePend } = await supabase.from("conciliacao_pendencias").upsert(
          naoConc.map(l => ({
            fazenda_id: fazendaId, conta_id: contaSel || null,
            conta_nome: contaObj?.nome ?? null, fitid: l.id,
            data: l.data, descricao: l.descricao, valor: l.valor,
            tipo: l.tipo, status: "pendente",
          })),
          { onConflict: "fazenda_id,fitid", ignoreDuplicates: true }
        );
        if (ePend) console.error("[handleOFX] pendências", ePend);
      }

      // Fase 3 — abre a visão contínua da conta (não o card isolado deste
      // import), estendendo o período já filtrado pra cobrir o OFX inteiro.
      // ao importar, a tela adota o intervalo do OFX importado
      await carregarExtratoUnificado(contaSel, dataInicio, dataFim);
      // banner de pendências, contagens e histórico ficavam desatualizados após o import
      carregar();
    } catch (err) {
      console.error("[handleOFX]", err);
      alert("Não foi possível importar o OFX: " + (err instanceof Error ? err.message : "erro desconhecido") + ". Tente novamente.");
    } finally {
      setLoading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  // Exclui um extrato importado (uso principal: apagar cópia duplicada de uma
  // reimportação de OFX). Remove só o registro do extrato e o arquivo OFX no
  // Storage — não mexe nos lançamentos: se algum já foi marcado como
  // conciliado a partir deste extrato, o lançamento continua conciliado
  // (o vínculo é só removido daqui). Isso evita desfazer conciliações reais
  // por engano ao limpar uma cópia velha/duplicada.
  async function excluirExtrato(ext: Extrato) {
    const aviso = ext.conciliados > 0
      ? `Este extrato tem ${ext.conciliados} linha(s) já conciliada(s). Os lançamentos vinculados a partir dele CONTINUAM conciliados — só o registro deste extrato é removido.\n\n`
      : "";
    if (!confirm(`${aviso}Excluir o extrato "${ext.conta_nome}" (${fmtDt(ext.data_inicio)} a ${fmtDt(ext.data_fim)})?\n\nEssa ação não pode ser desfeita.`)) return;
    setLoading(true);
    try {
      // Via API route com service_role_key — o delete direto do cliente
      // podia falhar silenciosamente com sessão/JWT expirado (achado real
      // 18/09/2026: "não tem mais como excluir"), mesmo padrão já usado em
      // persistExtrato pro mesmo motivo.
      const res = await authFetch(`/api/financeiro/persistir-extrato?id=${ext.id}`, { method: "DELETE" });
      const json = await res.json().catch(() => ({ ok: false }));
      if (!res.ok || json?.ok === false) throw new Error(json?.error);
      setExtratos(prev => prev.filter(e => e.id !== ext.id));
      if (extrato?.id === ext.id) setExtrato(null);
    } catch {
      alert("Não foi possível excluir o extrato. Tente novamente.");
    } finally {
      setLoading(false);
    }
  }

  // ── Persistir extrato atualizado ───────────────────────────────────────────
  // Usa API route com service_role_key — imune a JWT expirado.
  // O estado local é atualizado imediatamente (optimistic); a persistência é async.
  // Retorna se a escrita foi confirmada no banco — antes era "atire e esqueça"
  // (não aguardava, não checava resposta): a tela já mostrava tudo conciliado
  // via estado otimista mesmo que a escrita de verdade falhasse, e não havia
  // como saber a diferença entre "salvou" e "pareceu salvar". Quem chama isso
  // deve aguardar e avisar o usuário em caso de falha, em vez de deixar a
  // tela "conciliada" sem estar realmente gravada.
  async function persistExtrato(
    upd: Extrato,
    opts?: {
      conciliarIds?: string[];
      desconciliarIds?: string[];
      baixar?: { id: string; data_baixa: string; valor_pago: number; status?: "baixado" | "parcial"; conta_bancaria?: string }[];
      definirConta?: { id: string; conta_bancaria: string }[];
      moverConta?: { id: string; conta_bancaria: string }[];
    },
  ): Promise<boolean> {
    // Estado otimista COM rollback: antes, se a gravação falhasse a tela continuava
    // mostrando a linha conciliada (só um alert dizia o contrário) e, ao recarregar, a
    // conciliação "sumia". Agora a falha devolve a tela ao estado anterior.
    const extratoAnterior = extrato;
    const extratosAnteriores = extratos;
    const reverter = () => { setExtrato(extratoAnterior); setExtratos(extratosAnteriores); };
    setExtrato(upd);
    setExtratos(prev => prev.map(e => e.id === upd.id ? upd : e));
    try {
      const res = await authFetch("/api/financeiro/persistir-extrato", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: upd.id,
          linhas: upd.linhas,
          conciliados: upd.conciliados,
          pendentes: upd.pendentes,
          lancamento_ids_conciliados: opts?.conciliarIds,
          lancamento_ids_desconciliados: opts?.desconciliarIds,
          baixar: opts?.baixar,
          definir_conta: opts?.definirConta,
          mover_conta: opts?.moverConta,
        }),
      });
      const json = await res.json().catch(() => ({ ok: false }));
      if (!res.ok || json?.ok === false) {
        console.error("[persistExtrato] falhou:", json);
        reverter();
        return false;
      }
      // Mantém extrato_transacoes (fonte ativa da tela) em dia com toda ação
      // feita aqui (vincular, desvincular, tesouraria, agrupar). Modo "acao":
      // reflete exatamente o que o usuário acabou de decidir, sem comparar
      // com o que já existia.
      const okSync = await syncExtratoTransacoes(fazendaId!, upd.conta_id || null, upd.conta_nome, upd.linhas, upd.id, "acao");
      if (!okSync) {
        // O lançamento já foi baixado/conciliado pela API, mas extrato_transacoes (o que a
        // tela lê ao reabrir) não foi atualizada. Repetir a ação é seguro (idempotente).
        reverter();
        return false;
      }
      return true;
    } catch (e) {
      console.error("[persistExtrato]", e);
      reverter();
      return false;
    }
  }

  // ── Registrar no histórico ─────────────────────────────────────────────────
  async function registrarHistorico(linha: LinhaOFX, acao: "conciliado" | "desvinculado", lancsIds: string[], lancDesc: string) {
    if (!fazendaId || !extrato) return;
    const row = {
      fazenda_id: fazendaId, extrato_id: extrato.id, fitid: linha.id,
      conta_nome: extrato.conta_nome, data_transacao: linha.data,
      descricao: linha.descricao, valor: linha.valor, tipo: linha.tipo,
      acao, lancamento_ids: lancsIds, lancamento_desc: lancDesc,
      // Período que estava filtrado no momento da conciliação
      periodo_inicio: filtroLancDe || extrato.data_inicio,
      periodo_fim:    filtroLancAte || extrato.data_fim,
    };
    const { data } = await supabase.from("historico_conciliacao").insert(row).select().single();
    if (data) setHistorico(prev => [data as HistoricoConciliacao, ...prev]);
  }

  // ── Confirmar vínculo — Baixar + Conciliar em um passo ────────────────────
  // linhaParam: usado quando chamado direto do botão OFX (estado ainda não atualizou)
  // idsParam: usado pela aba "CP/CR em Aberto" — evita depender de lancsSel
  // (que teria valor desatualizado se setado no mesmo ciclo de render)
  // Quanto ainda falta pagar de um lançamento: aberto = valor; parcial = saldo; baixado = o que já foi pago.
  const valorRestante = (l: Lancamento) =>
    l.status === "baixado" ? Number(l.valor_pago ?? l.valor)
    : ehParcial(l) ? Math.max(0, Number(l.valor) - Number(l.valor_pago ?? 0))
    : Number(l.valor);

  async function confirmarVinculo(linhaParam?: LinhaOFX, idsParam?: string[], origem: "manual" | "sugestao" = "manual") {
    const linha = linhaParam ?? linhaAtiva;
    const idsSel = idsParam ?? Array.from(lancsSel);
    if (!linha || idsSel.length === 0 || !extrato || !fazendaId) return;
    const ids = idsSel;
    const selecionados = ids.map(id => lancamentos.find(x => x.id === id)).filter((l): l is Lancamento => !!l);

    // Borderô (lote de pagamento do CP): a linha do banco é o TOTAL dele — concilia por inteiro,
    // nunca só parte dos títulos.
    const lotesSel = new Map<string, LoteInfo>();
    for (const l of selecionados) { const lt = loteDe(l); if (lt) lotesSel.set(lt.id, lt); }
    for (const lt of lotesSel.values()) {
      if (lt.itens.some(i => !ids.includes(i.lancamento_id))) {
        alert(`Este lançamento faz parte de um borderô de ${lt.itens.length} título(s) (${fmtBRL(lt.itens.reduce((sm, i) => sm + i.valor_pago, 0))}). A linha do extrato é o total do borderô — selecione o borderô inteiro.`);
        return;
      }
    }
    const unico = selecionados.length === 1 && lotesSel.size === 0;

    // 1 lançamento ↔ 1 linha: lançamento já conciliado com outra linha não pode ser reaproveitado
    // (era como o mesmo CP acabava ligado a várias linhas do extrato). Parcial que já tem a marca
    // pode receber outro pagamento.
    const jaConc = selecionados.filter(l => l.conciliado && !ehParcial(l) && !extrato.linhas.some(x => x.id === linha.id && (x.lancamento_ids?.includes(l.id) || x.lancamento_id === l.id)));
    if (jaConc.length > 0) {
      alert(`"${jaConc[0].descricao}" já está conciliado com outra linha do extrato. Desvincule a outra linha antes de usá-lo aqui.`);
      return;
    }

    // Conta correta: lançamento baixado em OUTRA conta bancária só entra aqui se o usuário
    // confirmar mover a baixa para a conta deste extrato.
    const outraConta = selecionados.filter(l => (l.status === "baixado" || ehParcial(l)) && l.conta_bancaria && l.conta_bancaria !== extrato.conta_id);
    let moverConta: { id: string; conta_bancaria: string }[] = [];
    if (outraConta.length > 0) {
      const nomeConta = (id?: string) => contas.find(c => c.id === id)?.nome ?? "outra conta";
      const lista = outraConta.slice(0, 3).map(l => `• ${l.descricao} — baixado em ${nomeConta(l.conta_bancaria)}`).join("\n");
      if (!confirm(`${outraConta.length === 1 ? "Este lançamento foi baixado" : "Estes lançamentos foram baixados"} em outra conta bancária:\n${lista}\n\nMover a baixa para ${extrato.conta_nome}?`)) return;
      moverConta = outraConta.map(l => ({ id: l.id, conta_bancaria: extrato.conta_id }));
    }

    // O que cada lançamento recebe com esta linha:
    //  • aberto  → paga; se a linha é menor que o valor, baixa PARCIAL (acumula o valor pago)
    //  • parcial → se a linha é o pagamento que já está registrado (valor pago), só vincula;
    //              senão é um novo pagamento: soma ao valor pago (parcial até quitar)
    //  • baixado → só vincula
    type Plano = { l: Lancamento; baixa: boolean; pago: number; status: "baixado" | "parcial"; esp?: number; porLote?: boolean };
    const planos: Plano[] = selecionados.map(l => {
      // Título de borderô: o valor a cobrir é o do item do borderô. Borderô pendente é baixado pela
      // confirmação do lote (mesma rota do Contas a Pagar); borderô já pago só vincula.
      const lt = loteDe(l);
      const it = lt ? itemDoLote(l) : undefined;
      if (lt && it) {
        const esp = Number(it.valor_pago);
        if (lt.status === "pendente") {
          const total = Number(l.valor_pago ?? 0) + esp;
          const desc = Number(it.valor_desconto ?? 0);
          return { l, baixa: false, porLote: true, esp, pago: Math.round(total * 100) / 100, status: (total + desc >= Number(l.valor) - 0.01 ? "baixado" : "parcial") as "baixado" | "parcial" };
        }
        return { l, baixa: false, esp, pago: Number(l.valor_pago ?? l.valor), status: (l.status === "baixado" ? "baixado" : "parcial") as "baixado" | "parcial" };
      }
      if (l.status === "baixado") return { l, baixa: false, pago: Number(l.valor_pago ?? l.valor), status: "baixado" as const };
      const pagoAntes = Number(l.valor_pago ?? 0);
      if (ehParcial(l) && unico && Math.abs(linha.valor - pagoAntes) <= 0.02) {
        return { l, baixa: false, pago: pagoAntes, status: "parcial" as const };   // pagamento já registrado
      }
      const pagaAgora = unico ? linha.valor : valorRestante(l);
      const total = pagoAntes + pagaAgora;
      return { l, baixa: true, pago: Math.round(total * 100) / 100, status: total >= Number(l.valor) - 0.01 ? "baixado" as const : "parcial" as const };
    });

    // Valor: para um único lançamento em aberto/parcial, linha menor ou igual ao saldo é pagamento
    // (parcial ou total), não diferença; linha MAIOR que o saldo (juros/multa) exige motivo.
    // Vários lançamentos (borderô): a soma precisa bater com a linha, senão exige motivo.
    let justificativa = "";
    const esperado = unico && planos[0].baixa ? valorRestante(planos[0].l) : planos.reduce((sm, p) => sm + (p.esp ?? (p.baixa ? valorRestante(p.l) : p.pago)), 0);
    const dif = Math.round((linha.valor - esperado) * 100) / 100;
    const excesso = unico && planos[0].baixa ? dif > 0.02 : Math.abs(dif) > 0.02;
    if (excesso) {
      const resp = window.prompt(`A linha do extrato (${fmtBRL(linha.valor)}) difere do esperado (${fmtBRL(esperado)}) em ${fmtBRL(Math.abs(dif))}.\n\nInforme o motivo da diferença (juros, multa, desconto…) para confirmar:`);
      if (!resp || !resp.trim()) return;
      justificativa = resp.trim();
    } else if (unico && planos[0].baixa && planos[0].status === "parcial") {
      if (!confirm(`Baixa PARCIAL: a linha (${fmtBRL(linha.valor)}) é menor que o saldo do lançamento (${fmtBRL(esperado)}).\n\nO lançamento fica parcial, com saldo de ${fmtBRL(Number(planos[0].l.valor) - planos[0].pago)}. Confirmar?`)) return;
    }

    setSalvando(true);
    const baixas = planos.filter(p => p.baixa);

    // Confirma o pagamento dos borderôs pendentes com a data e a conta do banco (baixa todos os títulos)
    for (const lt of Array.from(lotesSel.values()).filter(x => x.status === "pendente")) {
      const r = await authFetch("/api/financeiro/bordero-acao", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ acao: "confirmar", lote_id: lt.id, data_pagamento: linha.data, conta_bancaria: extrato.conta_id }),
      }).then(x => x.json()).catch(() => null);
      if (!r?.ok) {
        alert("Não foi possível confirmar o pagamento do borderô: " + (r?.error ?? "erro desconhecido") + ". Nada foi conciliado.");
        setSalvando(false);
        carregar();
        return;
      }
    }
    if (lotesSel.size > 0) {
      setLotes(prev => {
        const n = new Map(prev);
        for (const lt of lotesSel.values()) n.set(lt.id, { ...lt, status: "pago", data_pagamento: lt.status === "pendente" ? linha.data : lt.data_pagamento, conta_bancaria: lt.conta_bancaria ?? extrato.conta_id, conciliado: true });
        return n;
      });
    }

    // Atualiza estado local imediatamente (optimistic)
    setLancamentos(prev => prev.map(l => {
      const pl = planos.find(p => p.l.id === l.id);
      if (!pl) return l;
      return { ...l, ...(pl.baixa || pl.porLote ? { status: pl.status, data_baixa: linha.data, valor_pago: pl.pago } : {}), conta_bancaria: extrato.conta_id || l.conta_bancaria, conciliado: true };
    }));

    // Vincular à linha OFX
    const primeiro = selecionados[0];
    const umLoteInteiro = lotesSel.size === 1 && ids.length === Array.from(lotesSel.values())[0].itens.length;
    const descVinc = umLoteInteiro ? `Borderô · ${ids.length} título(s)` : ids.length === 1 && primeiro ? primeiro.descricao : `${ids.length} lançamentos (bordero)`;
    const valorVinc = esperado;

    const novasLinhas = extrato.linhas.map(l =>
      l.id === linha.id
        ? { ...l, conciliado: true, lancamento_id: ids[0], lancamento_ids: ids, lancamento_desc: descVinc, lancamento_valor: unico ? linha.valor : valorVinc,
            origem_vinculo: origem, confianca: origem === "sugestao" ? ("media" as const) : null, regra_id: null, sugestao_lancamento_id: null, sugestao_motivo: null }
        : l
    );
    const conciliadoN = novasLinhas.filter(l => l.conciliado).length;
    // Persiste via service_role_key — imune a JWT expirado — inclui baixa e flag conciliado
    const ok = await persistExtrato(
      { ...extrato, linhas: novasLinhas, conciliados: conciliadoN, pendentes: novasLinhas.length - conciliadoN },
      {
        conciliarIds: ids,
        baixar: baixas.map(p => ({ id: p.l.id, data_baixa: linha.data, valor_pago: p.pago, status: p.status, conta_bancaria: extrato.conta_id || undefined })),
        moverConta,
        // já baixado sem conta bancária → grava a conta deste extrato (senão a Posição
        // Bancária nunca fecha com o extrato)
        definirConta: planos
          .filter(p => !p.baixa && (p.l.status === "baixado" || p.l.status === "parcial") && !p.l.conta_bancaria)
          .map(p => ({ id: p.l.id, conta_bancaria: extrato.conta_id })),
      },
    );

    if (!ok) {
      alert("Não foi possível salvar a conciliação — tente novamente. A tela pode estar mostrando um estado que ainda não foi gravado.");
      setSalvando(false);
      carregar();
      return;
    }

    if (fazendaId) {
      supabase.from("conciliacao_pendencias")
        .update({ status: "resolvido", lancamento_id: ids[0] })
        .eq("fazenda_id", fazendaId).eq("fitid", linha.id).eq("conta_id", extrato.conta_id);
      registrarHistorico(linha, "conciliado", ids, justificativa ? `${descVinc} · diferença justificada: ${justificativa}` : descVinc);
    }

    setLinhaAtiva(null);
    setLancsSel(new Set());
    setSalvando(false);
  }

  // ── Salvar lançamento de tesouraria e conciliar ───────────────────────────
  async function salvarTesouraria() {
    if (!modalTes || !fazendaId || !extrato) return;
    setSavingTes(true);

    const todasOps: OpTesouraria[] = [...OPS_TESOURARIA_PADRAO, ...opsCustom];
    const opSel = todasOps.find(o => o.id === fTes.tipo_op);
    const ogId = fTes.og_id || opSel?.operacao_gerencial_id || null;
    const isTransf = fTes.tipo_op === "__transferencia__";

    // ── Transferência entre contas: cria CP na origem e CR no destino ──────
    if (isTransf) {
      if (!fTes.conta_origem || !fTes.conta_destino) {
        alert("Selecione a conta de origem e a conta de destino.");
        setSavingTes(false);
        return;
      }
      const origemNome  = contas.find(c => c.id === fTes.conta_origem)?.nome ?? fTes.conta_origem;
      const destinoNome = contas.find(c => c.id === fTes.conta_destino)?.nome ?? fTes.conta_destino;
      // Cada perna pertence à fazenda/titular da SUA conta bancária (antes as duas iam pra
      // fazenda ativa na tela, distorcendo LCDPR/DRE por fazenda em conta multi-fazenda).
      const cOrigem  = contas.find(c => c.id === fTes.conta_origem);
      const cDestino = contas.find(c => c.id === fTes.conta_destino);
      const base = {
        valor: fTes.valor || modalTes.valor,
        valor_pago: fTes.valor || modalTes.valor,
        data_lancamento: fTes.data || modalTes.data,
        data_vencimento: fTes.data || modalTes.data,
        data_baixa: fTes.data || modalTes.data,
        status: "baixado" as const,
        categoria: "Transferência entre Contas",
        operacao_gerencial_id: ogId,
        origem_lancamento: "tesouraria",
      };
      const { data: rows, error } = await supabase
        .from("lancamentos")
        .insert([
          { ...base, fazenda_id: cOrigem?.fazenda_id  ?? fazendaId, produtor_id: cOrigem?.produtor_id  ?? null, tipo: "pagar"   as const, descricao: `Transferência → ${destinoNome}`, conta_bancaria: fTes.conta_origem },
          { ...base, fazenda_id: cDestino?.fazenda_id ?? fazendaId, produtor_id: cDestino?.produtor_id ?? null, tipo: "receber" as const, descricao: `Transferência ← ${origemNome}`,  conta_bancaria: fTes.conta_destino },
        ])
        .select();

      if (error || !rows?.length) {
        alert("Erro ao salvar transferência: " + (error?.message ?? "erro desconhecido"));
        setSavingTes(false);
        return;
      }

      setLancamentos(prev => [...(rows as Lancamento[]), ...prev]);

      // Vincula a linha OFX ao lançamento da conta corrente selecionada
      const lancToLink = rows.find(r => r.conta_bancaria === contaSel) ?? rows[0];
      const ids = [lancToLink.id];
      const desc = lancToLink.descricao as string;
      const novasLinhas = extrato.linhas.map(l =>
        l.id === modalTes.id
          ? { ...l, conciliado: true, lancamento_id: lancToLink.id, lancamento_ids: ids, lancamento_desc: desc, lancamento_valor: fTes.valor || modalTes.valor }
          : l
      );
      const conciliadoN = novasLinhas.filter(l => l.conciliado).length;
      const okTransf = await persistExtrato(
        { ...extrato, linhas: novasLinhas, conciliados: conciliadoN, pendentes: novasLinhas.length - conciliadoN },
        { conciliarIds: ids },
      );
      if (!okTransf) {
        alert("Lançamento criado, mas não foi possível salvar a conciliação — tente vincular de novo.");
        setSavingTes(false);
        return;
      }
      if (fazendaId) {
        supabase.from("conciliacao_pendencias")
          .update({ status: "resolvido", lancamento_id: lancToLink.id })
          .eq("fazenda_id", fazendaId).eq("fitid", modalTes.id);
        registrarHistorico(modalTes, "conciliado", ids, desc);
      }
      const erroRegraT = await criarRegraDaLinha(modalTes, { acao: "transferencia", conta_destino_id: modalTes.tipo === "debito" ? fTes.conta_destino : fTes.conta_origem });
      if (erroRegraT) alert("Lançamento conciliado, mas a regra não foi criada: " + erroRegraT);
      setModalTes(null);
      setSavingTes(false);
      return;
    }

    // ── Demais operações: cria um único lançamento ─────────────────────────
    // O.G. obrigatória: era opcional e 64 lançamentos de tarifa/IOF/juros criados aqui
    // ficaram sem Operação Gerencial (coluna O.G. do LCDPR em branco, DRE sem classificar).
    if (!ogId) {
      alert("Selecione a Operação Gerencial do lançamento — ela classifica a despesa/receita no DRE e no LCDPR.");
      setSavingTes(false);
      return;
    }
    // Sem conta_bancaria o lançamento nascia "solto": a Posição Bancária nunca fechava com
    // o extrato. Fazenda e titular vêm da conta bancária do extrato, não da fazenda ativa.
    const contaDoExtrato = contas.find(c => c.id === extrato.conta_id);
    const { data: novoLanc, error } = await supabase
      .from("lancamentos")
      .insert({
        fazenda_id: contaDoExtrato?.fazenda_id ?? fazendaId,
        produtor_id: contaDoExtrato?.produtor_id ?? null,
        conta_bancaria: extrato.conta_id,
        origem_lancamento: "tesouraria",
        tipo: fTes.tipo,
        descricao: fTes.descricao || modalTes.descricao,
        valor: fTes.valor || modalTes.valor,
        valor_pago: fTes.valor || modalTes.valor,
        data_lancamento: fTes.data || modalTes.data,
        data_vencimento: fTes.data || modalTes.data,
        data_baixa: modalTes.data,
        status: "baixado",
        categoria: opSel?.nome ?? "Tesouraria",
        operacao_gerencial_id: ogParaFazenda(ogId, contaDoExtrato?.fazenda_id ?? fazendaId),
      })
      .select()
      .single();

    if (error || !novoLanc) {
      alert("Erro ao salvar lançamento: " + (error?.message ?? "erro desconhecido"));
      setSavingTes(false);
      return;
    }

    setLancamentos(prev => [novoLanc as Lancamento, ...prev]);

    const ids = [novoLanc.id];
    const desc = fTes.descricao || modalTes.descricao;
    const novasLinhas = extrato.linhas.map(l =>
      l.id === modalTes.id
        ? { ...l, conciliado: true, lancamento_id: novoLanc.id, lancamento_ids: ids, lancamento_desc: desc, lancamento_valor: fTes.valor || modalTes.valor }
        : l
    );
    const conciliadoN = novasLinhas.filter(l => l.conciliado).length;
    const okTes = await persistExtrato(
      { ...extrato, linhas: novasLinhas, conciliados: conciliadoN, pendentes: novasLinhas.length - conciliadoN },
      { conciliarIds: ids },
    );
    if (!okTes) {
      alert("Lançamento criado, mas não foi possível salvar a conciliação — tente vincular de novo.");
      setSavingTes(false);
      return;
    }

    if (fazendaId) {
      supabase.from("conciliacao_pendencias")
        .update({ status: "resolvido", lancamento_id: novoLanc.id })
        .eq("fazenda_id", fazendaId).eq("fitid", modalTes.id);
      registrarHistorico(modalTes, "conciliado", ids, desc);
    }

    const erroRegra = await criarRegraDaLinha(modalTes, { acao: "lancar", og_id: ogId ?? undefined });
    if (erroRegra) alert("Lançamento conciliado, mas a regra não foi criada: " + erroRegra);
    setModalTes(null);
    setSavingTes(false);
  }

  // ── Lançamento agrupado — várias linhas OFX pendentes (mesmo dia, mesma
  // natureza — ex: vários pedágios) viram UM único CP/CR, já baixado, e todas
  // as linhas selecionadas ficam conciliadas contra esse mesmo lançamento.
  async function salvarLancamentoAgrupado() {
    if (!extrato || !fazendaId || selecaoMultipla.size < 2) return;
    const linhasSel = extrato.linhas.filter(l => selecaoMultipla.has(l.id));
    if (linhasSel.length < 2) return;

    const tipos = new Set(linhasSel.map(l => l.tipo));
    if (tipos.size > 1) {
      alert("As linhas selecionadas misturam crédito e débito — selecione apenas linhas do mesmo tipo pra agrupar num único CP/CR.");
      return;
    }
    const datas = new Set(linhasSel.map(l => l.data));
    if (datas.size > 1) {
      alert("As linhas selecionadas são de datas diferentes — selecione linhas do mesmo dia pra agrupar num único CP/CR.");
      return;
    }
    if (!descAgrupado.trim()) {
      alert("Informe uma descrição para o lançamento agrupado.");
      return;
    }

    setSavingAgrupado(true);
    const tipoLanc: "pagar" | "receber" = linhasSel[0].tipo === "credito" ? "receber" : "pagar";
    const dataComum = linhasSel[0].data;
    const valorTotal = linhasSel.reduce((s, l) => s + l.valor, 0);
    const ogSel = ogsDisponiveis.find(o => o.id === ogAgrupado);
    if (!ogAgrupado) {
      alert("Selecione a Operação Gerencial do lançamento agrupado.");
      setSavingAgrupado(false);
      return;
    }
    const contaDoExtratoAgr = contas.find(c => c.id === extrato.conta_id);

    const { data: novoLanc, error } = await supabase
      .from("lancamentos")
      .insert({
        fazenda_id: contaDoExtratoAgr?.fazenda_id ?? fazendaId,
        produtor_id: contaDoExtratoAgr?.produtor_id ?? null,
        origem_lancamento: "tesouraria",
        tipo: tipoLanc,
        descricao: descAgrupado.trim(),
        valor: valorTotal,
        valor_pago: valorTotal,
        data_lancamento: dataComum,
        data_vencimento: dataComum,
        data_baixa: dataComum,
        status: "baixado",
        categoria: ogSel?.descricao ?? "Conciliação agrupada",
        operacao_gerencial_id: ogParaFazenda(ogAgrupado, contaDoExtratoAgr?.fazenda_id ?? fazendaId),
        conta_bancaria: extrato.conta_id,
      })
      .select()
      .single();

    if (error || !novoLanc) {
      alert("Erro ao salvar lançamento agrupado: " + (error?.message ?? "erro desconhecido"));
      setSavingAgrupado(false);
      return;
    }

    setLancamentos(prev => [novoLanc as Lancamento, ...prev]);

    const idsLinhas = new Set(linhasSel.map(l => l.id));
    const novasLinhas = extrato.linhas.map(l =>
      idsLinhas.has(l.id)
        ? { ...l, conciliado: true, lancamento_id: novoLanc.id, lancamento_ids: [novoLanc.id], lancamento_desc: descAgrupado.trim(), lancamento_valor: l.valor }
        : l
    );
    const conciliadoN = novasLinhas.filter(l => l.conciliado).length;
    const okAgr = await persistExtrato(
      { ...extrato, linhas: novasLinhas, conciliados: conciliadoN, pendentes: novasLinhas.length - conciliadoN },
      { conciliarIds: [novoLanc.id] },
    );
    if (!okAgr) {
      alert("Lançamento criado, mas não foi possível salvar a conciliação das linhas — tente vincular de novo.");
      setSavingAgrupado(false);
      return;
    }

    if (fazendaId) {
      for (const l of linhasSel) {
        supabase.from("conciliacao_pendencias")
          .update({ status: "resolvido", lancamento_id: novoLanc.id })
          .eq("fazenda_id", fazendaId).eq("fitid", l.id);
        registrarHistorico(l, "conciliado", [novoLanc.id], descAgrupado.trim());
      }
    }

    setSelecaoMultipla(new Set());
    setModalAgrupado(false);
    setSavingAgrupado(false);
  }

  // ── Desvincular ────────────────────────────────────────────────────────────
  async function desvincular(linhaId: string) {
    if (!extrato) return;
    const linhaOriginal = extrato.linhas.find(l => l.id === linhaId);
    const idsDesconciliados = linhaOriginal?.lancamento_ids ?? (linhaOriginal?.lancamento_id ? [linhaOriginal.lancamento_id] : []);
    const linhas = extrato.linhas.map(l =>
      l.id === linhaId ? { ...l, conciliado: false, lancamento_id: undefined, lancamento_ids: undefined, lancamento_desc: undefined, lancamento_valor: undefined } : l
    );
    const conciliadoN = linhas.filter(l => l.conciliado).length;
    // Desconcilia os lançamentos (conciliado=false) para remover badge em CP/CR
    const ok = await persistExtrato(
      { ...extrato, linhas, conciliados: conciliadoN, pendentes: linhas.length - conciliadoN },
      { desconciliarIds: idsDesconciliados.length ? idsDesconciliados : undefined },
    );
    if (!ok) {
      alert("Não foi possível desvincular — tente novamente.");
      return;
    }
    if (fazendaId && linhaOriginal) {
      registrarHistorico(linhaOriginal, "desvinculado", linhaOriginal.lancamento_ids ?? [], linhaOriginal.lancamento_desc ?? "");
    }
  }

  // ── Regras de conciliação ──────────────────────────────────────────────────
  async function recarregarRegras() {
    try {
      const r = await authFetch("/api/financeiro/conciliacao-regras").then(x => x.json());
      if (r?.ok) setRegras(r.regras as RegraConc[]);
    } catch { /* mantém as atuais */ }
  }

  // Cria a regra a partir de uma linha classificada à mão ("sempre fazer isso para textos como…")
  async function criarRegraDaLinha(linha: LinhaOFX, dados: { acao: "lancar" | "transferencia"; og_id?: string; conta_destino_id?: string }): Promise<string | null> {
    if (!criarRegra.ativo) return null;
    const og = dados.og_id ? ogsDisponiveis.find(o => o.id === dados.og_id) : undefined;
    try {
      const r = await authFetch("/api/financeiro/conciliacao-regras", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          texto: criarRegra.texto, tipo: linha.tipo,
          acao: dados.acao,
          conta_bancaria_id: criarRegra.escopo === "conta" ? extrato?.conta_id : null,
          operacao_classificacao: og?.classificacao ?? null, operacao_descricao: og?.descricao ?? null,
          conta_destino_id: dados.conta_destino_id ?? null,
        }),
      }).then(x => x.json());
      if (!r?.ok) return r?.error ?? "erro desconhecido";
      recarregarRegras();
      return null;
    } catch (e) { return e instanceof Error ? e.message : "erro desconhecido"; }
  }

  async function salvarRegraForm() {
    const og = ogsDisponiveis.find(o => o.id === fRegra.og_id);
    setSavingRegra(true);
    try {
      const r = await authFetch("/api/financeiro/conciliacao-regras", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          texto: fRegra.texto, tipo: fRegra.tipo, acao: fRegra.acao,
          conta_bancaria_id: fRegra.conta_bancaria_id || null,
          operacao_classificacao: og?.classificacao ?? null, operacao_descricao: og?.descricao ?? null,
          centro_custo_id: fRegra.centro_custo_id || null, pessoa_id: fRegra.pessoa_id || null,
          conta_destino_id: fRegra.conta_destino_id || null,
        }),
      }).then(x => x.json());
      if (!r?.ok) { alert("Não foi possível salvar a regra: " + (r?.error ?? "erro desconhecido")); return; }
      setFRegra(FORM_REGRA_VAZIO);
      await recarregarRegras();
    } finally { setSavingRegra(false); }
  }

  async function alternarRegra(r: RegraConc) {
    const res = await authFetch(`/api/financeiro/conciliacao-regras?id=${r.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ativa: !r.ativa }) }).then(x => x.json()).catch(() => null);
    if (!res?.ok) { alert("Não foi possível alterar a regra."); return; }
    setRegras(prev => prev.map(x => x.id === r.id ? { ...x, ativa: !r.ativa } : x));
  }

  async function excluirRegra(r: RegraConc) {
    if (!confirm(`Excluir a regra "${r.texto}"? Lançamentos já criados por ela não são alterados.`)) return;
    const res = await authFetch(`/api/financeiro/conciliacao-regras?id=${r.id}`, { method: "DELETE" }).then(x => x.json()).catch(() => null);
    if (!res?.ok) { alert("Não foi possível excluir a regra."); return; }
    setRegras(prev => prev.filter(x => x.id !== r.id));
  }

  // Quantas linhas PENDENTES (de todas as contas) uma regra pegaria hoje
  function contarBatidas(r: RegraConc): number {
    const alvo = ` ${normalizarTexto(r.texto)} `;
    return pendGlobais.filter(l => l.tipo === r.tipo && (!r.conta_bancaria_id || r.conta_bancaria_id === l.conta_bancaria_id)
      && ` ${normalizarTexto(l.descricao)} `.includes(alvo)).length;
  }

  // Aplica as regras às pendentes da conta aberta (o mesmo que roda no import)
  async function aplicarRegrasNaConta() {
    if (!extrato) return;
    setAplicandoRegras(true);
    try {
      const r = await authFetch("/api/financeiro/conciliacao-regras/aplicar", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conta_bancaria_id: extrato.conta_id }),
      }).then(x => x.json());
      if (!r?.ok) { alert("Não foi possível aplicar as regras: " + (r?.error ?? "erro desconhecido")); return; }
      if (r.migracao === false) { alert("Execute a migração Seção 277 no Supabase para usar regras de conciliação."); return; }
      alert(`${r.aplicadas ?? 0} linha(s) conciliada(s) por regra` + (r.semOG ? ` · ${r.semOG} regra(s) sem a O.G. cadastrada nesta fazenda` : "") + (r.nFalhas ? ` · ${r.nFalhas} falha(s)` : ""));
      await carregarExtratoUnificado(extrato.conta_id, extrato.data_inicio, extrato.data_fim);
      carregar();
    } finally { setAplicandoRegras(false); }
  }

  // ── Sugestões (confiança média) ───────────────────────────────────────────
  // Em lote e numa única gravação: aceitar várias em sequência, cada uma sobre o `extrato` do
  // momento, faria a 2ª sobrescrever a 1ª (a conciliação anterior voltava a pendente).
  async function aceitarSugestoes(alvo: LinhaOFX[]) {
    if (!extrato || !fazendaId || alvo.length === 0) return;
    setSalvando(true);
    const usados = new Set<string>();
    const aceitas: { linha: LinhaOFX; l: Lancamento }[] = [];
    const puladas: string[] = [];
    for (const linha of alvo) {
      const l = linha.sugestao_lancamento_id ? lancamentos.find(x => x.id === linha.sugestao_lancamento_id) : undefined;
      if (!l) { puladas.push(`${fmtDt(linha.data)} ${linha.descricao.slice(0, 30)}: lançamento não encontrado`); continue; }
      if (l.conciliado || usados.has(l.id)) { puladas.push(`${l.descricao.slice(0, 30)}: já conciliado com outra linha`); continue; }
      if ((l.status === "baixado" || ehParcial(l)) && l.conta_bancaria && l.conta_bancaria !== extrato.conta_id) { puladas.push(`${l.descricao.slice(0, 30)}: baixado em outra conta`); continue; }
      usados.add(l.id); aceitas.push({ linha, l });
    }
    if (aceitas.length === 0) { setSalvando(false); alert("Nenhuma sugestão pôde ser aceita:\n" + puladas.slice(0, 5).join("\n")); return; }

    const ids = new Set(aceitas.map(a => a.linha.id));
    const novasLinhas = extrato.linhas.map(x => {
      const a = aceitas.find(y => y.linha.id === x.id);
      return a ? { ...x, conciliado: true, lancamento_id: a.l.id, lancamento_ids: [a.l.id], lancamento_desc: a.l.descricao, lancamento_valor: x.valor,
        origem_vinculo: "sugestao" as const, confianca: "media" as const, sugestao_lancamento_id: null, sugestao_motivo: null } : x;
    });
    const conciliadoN = novasLinhas.filter(x => x.conciliado).length;
    const abertas = aceitas.filter(a => a.l.status !== "baixado" && a.l.status !== "parcial");
    const ok = await persistExtrato(
      { ...extrato, linhas: novasLinhas, conciliados: conciliadoN, pendentes: novasLinhas.length - conciliadoN },
      {
        conciliarIds: aceitas.map(a => a.l.id),
        baixar: abertas.map(a => ({ id: a.l.id, data_baixa: a.linha.data, valor_pago: a.linha.valor, conta_bancaria: extrato.conta_id })),
        definirConta: aceitas.filter(a => (a.l.status === "baixado" || ehParcial(a.l)) && !a.l.conta_bancaria).map(a => ({ id: a.l.id, conta_bancaria: extrato.conta_id })),
      },
    );
    setSalvando(false);
    if (!ok) { alert("Não foi possível salvar as conciliações — tente novamente."); return; }
    setLancamentos(prev => prev.map(l => {
      const a = aceitas.find(y => y.l.id === l.id);
      if (!a) return l;
      const baixa = abertas.some(b => b.l.id === l.id);
      return { ...l, conciliado: true, conta_bancaria: extrato.conta_id, ...(baixa ? { status: "baixado", data_baixa: a.linha.data, valor_pago: a.linha.valor } : {}) };
    }));
    for (const a of aceitas) registrarHistorico(a.linha, "conciliado", [a.l.id], a.l.descricao);
    if (puladas.length) alert(`${aceitas.length} aceita(s). ${puladas.length} não pôde(ram) ser aceita(s):\n` + puladas.slice(0, 5).join("\n"));
    void ids;
  }

  async function ignorarSugestao(linha: LinhaOFX) {
    if (!extrato) return;
    const novasLinhas = extrato.linhas.map(x => x.id === linha.id ? { ...x, sugestao_lancamento_id: null, sugestao_motivo: null } : x);
    const ok = await persistExtrato({ ...extrato, linhas: novasLinhas });
    if (!ok) alert("Não foi possível descartar a sugestão — tente novamente.");
  }

  // ── Abrir modal tesouraria ─────────────────────────────────────────────────
  function abrirTesouraria(linha: LinhaOFX) {
    setModalTes(linha);
    setCriarRegra({ ativo: false, texto: sugerirTextoRegra(linha.descricao), escopo: "todas" });
    const opPadrao = linha.tipo === "credito" ? "__resgate__" : "__taxa__";
    setFTes({
      descricao: linha.descricao,
      tipo: linha.tipo === "debito" ? "pagar" : "receber",
      valor: linha.valor,
      data: linha.data,
      tipo_op: opPadrao,
      og_id: "",
      // Pré-preenche a conta corrente selecionada no lado correto da transferência
      conta_origem: linha.tipo === "debito" ? (contaSel || "") : "",
      conta_destino: linha.tipo === "credito" ? (contaSel || "") : "",
    });
  }


  // ── Filtros ────────────────────────────────────────────────────────────────
  const linhasFiltradas = (extrato?.linhas ?? []).filter(l => {
    if (filtroPend && l.conciliado) return false;
    if (busca) {
      const q = busca.toLowerCase();
      if (!l.descricao.toLowerCase().includes(q) && !l.id.toLowerCase().includes(q)) return false;
    }
    if (buscaValor) {
      // Aceita "67", "67,17" ou "67.17" — compara pelo valor formatado (sem
      // símbolo de moeda) pra casar mesmo com busca parcial, e também pelo
      // número exato quando o usuário digita um valor completo.
      const q = buscaValor.trim().replace(",", ".");
      const alvo = parseFloat(q);
      const bateExato = !isNaN(alvo) && Math.abs(l.valor - alvo) < 0.01;
      const bateTexto = l.valor.toFixed(2).replace(".", ",").includes(buscaValor.trim().replace(".", ","));
      if (!bateExato && !bateTexto) return false;
    }
    return true;
  });

  // ═══ LADO DO SISTEMA (esquerda) — dados derivados ═══════════════════════════
  const contaNomeDe = (id?: string | null) => (id ? (contas.find(c => c.id === id)?.nome ?? "—") : "—");
  // "Produtor da baixa" = titular da conta bancária em que o lançamento foi baixado
  const produtorDaBaixa = (l: Lancamento) => {
    const c = l.conta_bancaria ? contas.find(x => x.id === l.conta_bancaria) : undefined;
    return c?.produtor_id ? (produtoresNomes.get(c.produtor_id) ?? "—") : "—";
  };
  // Sem fornecedor/cliente cadastrado no lançamento (34% dos baixados), cai na descrição
  const fornecedorDe = (l: Lancamento) => (l.pessoa_id ? pessoasNomes.get(l.pessoa_id) : undefined) ?? l.descricao;
  const emIntervalo = (d?: string | null) => !!d && (!filtroLancDe || d >= filtroLancDe) && (!filtroLancAte || d <= filtroLancAte);
  const passaTipo = (l: Lancamento) => filtroLancTipo === "todos" || l.tipo === filtroLancTipo;
  const buscaTxt = buscaLanc.trim();
  const bateBusca = (texto: string, valor: number) => {
    if (!buscaTxt) return true;
    const num = parseFloat(buscaTxt.replace(/\./g, "").replace(",", "."));
    const porValor = !isNaN(num) && (Math.abs(valor - num) < 0.01 || valor.toFixed(2).replace(".", ",").includes(buscaTxt.replace(".", ",")));
    return porValor || normalizarTexto(texto).includes(normalizarTexto(buscaTxt));
  };
  const passaBuscaLanc = (l: Lancamento) => bateBusca(`${fornecedorDe(l)} ${l.descricao} ${l.categoria ?? ""}`, Number(l.valor_pago ?? l.valor));

  // Lançamentos ligados às linhas do extrato aberto → como foram conciliados
  const origemPorLanc = new Map<string, string>();
  for (const ln of extrato?.linhas ?? []) {
    if (!ln.conciliado) continue;
    for (const id of (ln.lancamento_ids?.length ? ln.lancamento_ids : ln.lancamento_id ? [ln.lancamento_id] : [])) origemPorLanc.set(id, ln.origem_vinculo ?? "anterior");
  }
  const ORIGEM_LANC: Record<string, { label: string; bg: string; cor: string }> = {
    exato:    { label: "Automático",      bg: "#F1F3F6", cor: "#555" },
    regra:    { label: "Regra",           bg: "#F1F3F6", cor: "#555" },
    sugestao: { label: "Sugestão aceita", bg: "#F1F3F6", cor: "#555" },
    manual:   { label: "Manual",          bg: "#F1F3F6", cor: "#555" },
    anterior: { label: "Anterior",        bg: "#F1F3F6", cor: "#888" },
  };

  // ── Borderôs (lotes de pagamento do CP) ─────────────────────────────────────
  // Um borderô gera UMA saída no extrato (o total). Por isso ele é uma linha só nas listas e é
  // conciliado por inteiro — nunca título a título.
  const loteDe = (l: Lancamento) => (l.lote_id ? lotes.get(l.lote_id) : undefined);
  const itemDoLote = (l: Lancamento) => loteDe(l)?.itens.find(i => i.lancamento_id === l.id);
  // Quanto a linha do banco deve cobrir por este lançamento: no borderô é o valor do item; fora dele, o que falta pagar
  const valorParaLinha = (l: Lancamento) => { const it = itemDoLote(l); return it ? Number(it.valor_pago) : valorRestante(l); };
  const compsDoLote = (lt: LoteInfo) => lt.itens.map(i => lancamentos.find(x => x.id === i.lancamento_id)).filter((x): x is Lancamento => !!x);
  type LinhaSis = { key: string; lote?: LoteInfo; comps: Lancamento[]; l: Lancamento };
  // Só borderô com 2+ títulos vira linha agrupada; com 1 título continua uma linha normal (a confirmação
  // do pagamento passa pelo borderô do mesmo jeito)
  const agruparLotes = (lista: Lancamento[]): LinhaSis[] => {
    const vistos = new Set<string>();
    const out: LinhaSis[] = [];
    for (const l of lista) {
      const lt = loteDe(l);
      if (lt && lt.itens.length > 1) {
        if (vistos.has(lt.id)) continue;
        vistos.add(lt.id);
        const comps = compsDoLote(lt);
        out.push({ key: lt.id, lote: lt, comps: comps.length ? comps : [l], l: comps[0] ?? l });
      } else out.push({ key: l.id, comps: [l], l });
    }
    return out;
  };
  const valorLinhaSis = (r: LinhaSis) => (r.lote ? r.comps.reduce((sm, c) => sm + valorParaLinha(c), 0) : valorRestante(r.l));
  const receberLinhaSis = (r: LinhaSis) => (r.lote ? r.lote.tipo === "receber" : r.l.tipo === "receber");
  const selecionadaLinhaSis = (r: LinhaSis) => r.comps.length > 0 && r.comps.every(c => lancsSel.has(c.id));
  const alternarLinhaSis = (r: LinhaSis) => setLancsSel(prev => {
    const n = new Set(prev);
    const todos = r.comps.every(c => n.has(c.id));
    for (const c of r.comps) { if (todos) n.delete(c.id); else n.add(c.id); }
    return n;
  });

  // Aba 1 — conciliados e baixados (filtro: data de baixa)
  const lancConciliadosLista = lancamentos
    .filter(l => origemPorLanc.has(l.id) && passaTipo(l) && (buscaTxt ? passaBuscaLanc(l) : emIntervalo(l.data_baixa ?? l.data_vencimento)))
    .sort((a, b) => (b.data_baixa ?? b.data_vencimento).localeCompare(a.data_baixa ?? a.data_vencimento));
  const linhasConciliados = agruparLotes(lancConciliadosLista);

  // Índice das linhas PENDENTES do OFX por valor — só para DESTACAR o que bate
  const indicePend = new Map<number, LinhaOFX[]>();
  for (const ln of extrato?.linhas ?? []) {
    if (ln.conciliado) continue;
    const k = Math.round(ln.valor);
    const arr = indicePend.get(k);
    if (arr) arr.push(ln); else indicePend.set(k, [ln]);
  }
  const linhasQueBatemValor = (alvo: number, receber: boolean): LinhaOFX[] => {
    const k = Math.round(alvo);
    return [k - 1, k, k + 1].flatMap(x => indicePend.get(x) ?? [])
      .filter(x => Math.abs(x.valor - alvo) <= 0.02 && ((x.tipo === "credito") === receber));
  };
  const igualAoValorSis = (r: LinhaSis) => !!linhaAtiva && Math.abs(valorLinhaSis(r) - linhaAtiva.valor) <= 0.02;

  // Aba 2 — CP/CR abertos e parciais (filtro: data de vencimento; a busca ignora o intervalo).
  // "Incluir baixados": também os já baixados que ainda não foram conciliados (ex.: borderô pago no CP).
  const baseAbertos = lancamentos.filter(l => {
    if (l.status === "cancelado" || !passaTipo(l)) return false;
    if (l.status !== "baixado") return buscaTxt ? passaBuscaLanc(l) : emIntervalo(l.data_vencimento);
    if (!incluirBaixados || l.conciliado || origemPorLanc.has(l.id)) return false;
    return buscaTxt ? passaBuscaLanc(l) : emIntervalo(l.data_baixa ?? l.data_vencimento);
  });
  const linhasAbertos = (() => {
    let rows = agruparLotes(baseAbertos);
    const dataRef = (r: LinhaSis) => r.comps.map(c => c.data_vencimento).sort()[0] ?? r.l.data_vencimento;
    if (linhaAtiva) {
      rows = rows.filter(r => (linhaAtiva.tipo === "credito") === receberLinhaSis(r));
      return rows.sort((x, y) => {
        const ex = igualAoValorSis(x) ? 0 : 1, ey = igualAoValorSis(y) ? 0 : 1;
        if (ex !== ey) return ex - ey;
        const dist = (r: LinhaSis) => Math.abs(new Date(dataRef(r) + "T00:00:00").getTime() - new Date(linhaAtiva.data + "T00:00:00").getTime());
        return dist(x) - dist(y);
      });
    }
    return rows.sort((x, y) => dataRef(x).localeCompare(dataRef(y)));
  })();

  // Aba 3 — conferência: cada linha conciliada do OFX com os lançamentos a ela ligados
  const paresConf = (extrato?.linhas ?? [])
    .filter(x => x.conciliado && (buscaTxt ? true : emIntervalo(x.data)))
    .map(x => {
      const ids = x.lancamento_ids?.length ? x.lancamento_ids : x.lancamento_id ? [x.lancamento_id] : [];
      const ls = ids.map(id => lancamentos.find(l => l.id === id)).filter((l): l is Lancamento => !!l);
      const alertas: string[] = [];
      if (ls.length < ids.length) alertas.push("lançamento fora da lista carregada");
      for (const l of ls) if (extrato && l.conta_bancaria && l.conta_bancaria !== extrato.conta_id) alertas.push(`"${l.descricao.slice(0, 26)}" está baixado em ${contaNomeDe(l.conta_bancaria)}`);
      if (ls.length === ids.length && ls.length > 0 && !ls.some(ehParcial)) {
        const dif = diferencaSoma(x.valor, ls);
        if (Math.abs(dif) > 0.02) alertas.push(`soma dos lançamentos ${fmtBRL(x.valor - dif)} ≠ linha ${fmtBRL(x.valor)}`);
      }
      return { x, ls, alertas, grupos: agruparLotes(ls) };
    })
    .filter(({ x, ls }) => !buscaTxt || bateBusca(`${x.descricao} ${ls.map(l => `${fornecedorDe(l)} ${l.descricao}`).join(" ")}`, x.valor));

  // Lado do OFX: linhas que batem com o(s) lançamento(s)/borderô selecionado(s) — só destaque
  const alvoSelecionado = (() => {
    if (lancsSel.size === 0) return null;
    const sel = Array.from(lancsSel).map(id => lancamentos.find(x => x.id === id)).filter((l): l is Lancamento => !!l);
    if (sel.length === 0) return null;
    return { valor: sel.reduce((sm, l) => sm + valorParaLinha(l), 0), receber: sel[0].tipo === "receber" };
  })();
  const linhaBateComSelecao = (x: LinhaOFX) =>
    !!alvoSelecionado && !x.conciliado && (x.tipo === "credito") === alvoSelecionado.receber && Math.abs(x.valor - alvoSelecionado.valor) <= 0.02;

  const tipoBaixaMeta = (l: Lancamento) =>
    l.status === "baixado" ? { t: "Baixado", bg: "#F1F3F6", c: "#666", w: 500 }
    : ehParcial(l)         ? { t: "Parcial", bg: "#E3EAF3", c: "#1A4870", w: 700 }
    : l.status === "vencido" ? { t: "Vencido", bg: "#F1F3F6", c: "#A93226", w: 700 }
    : { t: "Aberto", bg: "#F1F3F6", c: "#333", w: 600 };

  // Linha da tabela do sistema (abas 1 e 2) — lançamento ou borderô
  const COLS_SIS_ABERTOS = "24px 78px 78px minmax(120px,1.5fr) minmax(90px,1fr) minmax(100px,1fr) 88px 100px";
  const COLS_SIS_CONC    = "78px 78px minmax(120px,1.5fr) minmax(90px,1fr) minmax(100px,1fr) 88px 100px 84px";
  const renderLinhaSistema = (r: LinhaSis, i: number, modo: "conciliados" | "abertos") => {
    const l = r.l;
    const lt = r.lote;
    const sel = selecionadaLinhaSis(r);
    const tb = tipoBaixaMeta(l);
    const alvo = valorLinhaSis(r);
    const batem = modo === "abertos" ? linhasQueBatemValor(alvo, receberLinhaSis(r)) : [];
    const destaque = modo === "abertos" && (igualAoValorSis(r) || (!linhaAtiva && batem.length > 0));
    const og = origemPorLanc.get(l.id);
    const om = og ? ORIGEM_LANC[og] ?? ORIGEM_LANC.anterior : null;
    const conciliadoRow = modo === "conciliados" || r.comps.every(c => c.conciliado);
    const expandido = !!lt && lotesAbertos.has(lt.id);
    const vencs = r.comps.map(c => c.data_vencimento).sort();
    const baixas = r.comps.map(c => c.data_baixa).filter(Boolean).sort() as string[];
    const valorMostrado = lt ? alvo : Number(modo === "conciliados" ? (l.valor_pago ?? l.valor) : l.valor);
    const negativo = lt ? lt.tipo === "pagar" : l.tipo === "pagar";
    return (
      <div key={r.key} style={{ borderBottom: "0.5px solid var(--bg-tag)" }}>
        <div
          onClick={modo === "abertos" ? () => alternarLinhaSis(r) : undefined}
          style={{
            display: "grid", gridTemplateColumns: modo === "abertos" ? COLS_SIS_ABERTOS : COLS_SIS_CONC, gap: 8, alignItems: "center",
            padding: "7px 10px", fontSize: 12,
            background: sel ? "#DCE6F2" : destaque ? "#EEF3F9" : "transparent",
            borderLeft: sel || destaque ? "3px solid #1A4870" : "3px solid transparent",
            cursor: modo === "abertos" ? "pointer" : "default",
          }}>
          {modo === "abertos" && <input type="checkbox" checked={sel} readOnly style={{ accentColor: "#1A4870", cursor: "pointer" }} />}
          <div style={{ color: "var(--text-2)", whiteSpace: "nowrap" }}>{fmtDt(vencs[0] ?? l.data_vencimento)}</div>
          <div style={{ color: "var(--text-2)", whiteSpace: "nowrap" }}>{lt?.data_pagamento ? fmtDt(lt.data_pagamento) : baixas[0] ? fmtDt(baixas[baixas.length - 1]) : "—"}</div>
          <div style={{ minWidth: 0 }} title={lt ? `Borderô${lt.descricao ? " · " + lt.descricao : ""} · ${r.comps.length} títulos` : `${l.descricao}${l.categoria ? " · " + l.categoria : ""}`}>
            <div style={{ fontWeight: 600, color: "var(--text-1)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {lt ? (
                <>
                  <span style={{ fontSize: 9, fontWeight: 700, padding: "1px 5px", borderRadius: 6, background: "#E3EAF3", color: "#1A4870", marginRight: 5 }}>BORDERÔ</span>
                  {r.comps.length} títulos{lt.descricao ? ` · ${lt.descricao}` : ""}
                </>
              ) : (
                <>
                  {titularDivergente(l) && <span title={`Titular do CP (${produtoresNomes.get(l.produtor_id ?? "") ?? "outro"}) é diferente do titular da conta do extrato — não indica conta errada`} style={{ fontSize: 9, fontWeight: 600, padding: "1px 5px", borderRadius: 6, background: "#F1F3F6", color: "#666", marginRight: 5 }}>titular ≠</span>}
                  {fornecedorDe(l)}
                </>
              )}
            </div>
            {lt ? (
              <button onClick={e => { e.stopPropagation(); setLotesAbertos(prev => { const n = new Set(prev); if (n.has(lt.id)) n.delete(lt.id); else n.add(lt.id); return n; }); }}
                style={{ background: "none", border: "none", padding: 0, fontSize: 10, color: "#1A4870", cursor: "pointer", textDecoration: "underline" }}>
                {expandido ? "ocultar títulos" : "ver títulos"}
              </button>
            ) : fornecedorDe(l) !== l.descricao && <div style={{ fontSize: 10, color: "var(--text-3)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{l.descricao}</div>}
            {modo === "abertos" && batem.length > 0 && (
              <div style={{ fontSize: 10, fontWeight: 700, color: "#1A4870" }}>= valor de {batem.length} linha{batem.length > 1 ? "s" : ""} do OFX ({batem.slice(0, 2).map(b => fmtDt(b.data).slice(0, 5)).join(", ")}{batem.length > 2 ? "…" : ""})</div>
            )}
          </div>
          <div style={{ color: "var(--text-2)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title="Titular da conta em que foi baixado">{produtorDaBaixa(l)}</div>
          <div style={{ color: "var(--text-2)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{contaNomeDe(lt?.conta_bancaria ?? l.conta_bancaria)}</div>
          <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <Sinal cor={conciliadoRow ? COR_OK : COR_PEND} titulo={conciliadoRow ? "Conciliado" : "Pendente"} />
            <span style={{ fontSize: 10, fontWeight: tb.w, padding: "2px 7px", borderRadius: 6, background: tb.bg, color: tb.c }}>{lt ? (lt.status === "pago" ? "Baixado" : "Aberto") : tb.t}</span>
          </div>
          <div style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
            <div style={{ fontWeight: 700, color: negativo ? COR_NEG : "var(--text-1)" }}>{negativo ? "−" : "+"}{fmtBRL(valorMostrado)}</div>
            {!lt && ehParcial(l) && <div style={{ fontSize: 10, color: "var(--text-3)" }}>saldo {fmtBRL(valorRestante(l))}</div>}
          </div>
          {modo === "conciliados" && om && <div><span style={{ fontSize: 10, fontWeight: 500, padding: "2px 7px", borderRadius: 6, background: om.bg, color: om.cor, whiteSpace: "nowrap" }}>{om.label}</span></div>}
        </div>
        {lt && expandido && (
          <div style={{ background: "var(--bg-page)", padding: "4px 10px 6px 44px" }}>
            {r.comps.map(c => (
              <div key={c.id} style={{ display: "flex", justifyContent: "space-between", gap: 10, fontSize: 11, color: "var(--text-2)", padding: "2px 0" }}>
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{fmtDt(c.data_vencimento)} · {fornecedorDe(c)}{fornecedorDe(c) !== c.descricao ? ` — ${c.descricao}` : ""}</span>
                <span style={{ fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>{fmtBRL(valorParaLinha(c))}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  // Titular da conta bancária do extrato aberto — pra comparar com o titular
  // (produtor_id) de cada CP/CR na sugestão manual. Achado real 18/09/2026:
  // contas com vários titulares (cada um com contas bancárias próprias) não
  // tinham NENHUMA checagem disso — um CP do produtor A podia casar com o
  // extrato do produtor B só porque o valor bateu. No automático (autoMatch,
  // ao importar) isso agora bloqueia de vez. Aqui, na sugestão manual (o
  // usuário está escolhendo, não o sistema), não bloqueia — só sinaliza:
  // fonte cinza (em vez de preta) + símbolo "≠", sem texto de aviso.
  const titularContaAtiva = extrato ? contas.find(c => c.id === extrato.conta_id)?.produtor_id : undefined;
  function titularDivergente(l: Lancamento): boolean {
    return !!titularContaAtiva && !!l.produtor_id && l.produtor_id !== titularContaAtiva;
  }

  // Rótulo do botão confirmar
  const todosJaBaixados = Array.from(lancsSel).every(id => {
    const l = lancamentos.find(x => x.id === id);
    return l?.status === "baixado";
  });
  const btnConfirmarLabel = salvando ? "Salvando..." : todosJaBaixados ? "✓ Vincular" : "✓ Baixar e Conciliar";

  const totalCreditos = (extrato?.linhas ?? []).filter(l => l.tipo === "credito").reduce((s, l) => s + l.valor, 0);
  const totalDebitos  = (extrato?.linhas ?? []).filter(l => l.tipo === "debito").reduce((s, l) => s + l.valor, 0);
  const saldo         = totalCreditos - totalDebitos;
  const pct           = extrato && extrato.total_linhas > 0 ? Math.round((extrato.conciliados / extrato.total_linhas) * 100) : 0;

  // Sugestões (confiança média) ainda não aceitas nem descartadas
  const sugestoesPend = (extrato?.linhas ?? []).filter(l => !l.conciliado && l.sugestao_lancamento_id);

  // Fechamento da conta: movimento líquido do extrato x movimento líquido baixado no sistema
  // NESTA conta, no período coberto pelas linhas. Diferença zero = conta fechada.
  const fechamento = (() => {
    if (!extrato || extrato.linhas.length === 0) return null;
    const datas = extrato.linhas.map(l => l.data).sort();
    const ini = datas[0], fim = datas[datas.length - 1];
    let sistema = 0, qtd = 0;
    for (const l of lancamentos) {
      if (!(l.status === "baixado" || ehParcial(l))) continue;
      if (l.conta_bancaria !== extrato.conta_id) continue;
      if (l.moeda && l.moeda !== "BRL") continue;
      const dt = l.data_baixa ?? l.data_vencimento;
      if (dt < ini || dt > fim) continue;
      sistema += (l.tipo === "receber" ? 1 : -1) * Number(l.valor_pago ?? l.valor);
      qtd++;
    }
    const dif = Math.round((saldo - sistema) * 100) / 100;
    return { ini, fim, sistema, qtd, dif, fechada: Math.abs(dif) < 0.01 };
  })();

  // ─── Estilos compartilhados ────────────────────────────────────────────────
  const thStyle: React.CSSProperties = {
    padding: "8px 10px", textAlign: "left", fontWeight: 600, fontSize: 11,
    color: "#666", borderBottom: "0.5px solid var(--border)", whiteSpace: "nowrap",
    position: "relative", userSelect: "none", background: "var(--bg-page)",
  };

  // ─── RENDER ───────────────────────────────────────────────────────────────
  return (
    <div style={{ fontFamily: "system-ui, sans-serif", minHeight: "100vh", background: "var(--bg-page)" }}>
      <TopNav />

      {/* ── Modal Tesouraria ──────────────────────────────────────────────── */}
      {modalTes && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ background: "var(--bg-card)", borderRadius: 14, border: "0.5px solid var(--border)", width: 480, boxShadow: "0 20px 60px rgba(0,0,0,0.25)" }}>
            <div style={{ padding: "16px 20px", borderBottom: "0.5px solid var(--border)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 15, color: "var(--text-1)" }}>Lançamento de Tesouraria</div>
                <div style={{ fontSize: 12, color: "var(--text-3)", marginTop: 2 }}>Criar lançamento e conciliar em um passo</div>
              </div>
              <button onClick={() => setModalTes(null)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 20, color: "var(--text-3)", lineHeight: 1 }}>×</button>
            </div>

            {/* Linha OFX de referência */}
            <div style={{ margin: "14px 20px 0", padding: "10px 14px", background: "var(--bg-page)", borderRadius: 8, border: "0.5px solid var(--border)" }}>
              <div style={{ fontSize: 11, color: "var(--text-3)", marginBottom: 4 }}>Transação no extrato</div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-1)" }}>{modalTes.descricao}</div>
                  <div style={{ fontSize: 11, color: "var(--text-3)", marginTop: 2 }}>{fmtDt(modalTes.data)} · FITID: {modalTes.id}</div>
                </div>
                <div style={{ fontWeight: 700, fontSize: 15, color: modalTes.tipo === "credito" ? "#16A34A" : "#E24B4A" }}>
                  {modalTes.tipo === "credito" ? "+" : "−"}{fmtBRL(modalTes.valor)}
                </div>
              </div>
            </div>

            <div style={{ padding: "14px 20px 20px", display: "flex", flexDirection: "column", gap: 12 }}>
              {fTes.tipo_op === "__transferencia__" ? (
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  <div>
                    <label style={{ fontSize: 11, fontWeight: 600, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Conta Origem (débito)</label>
                    <select value={fTes.conta_origem} onChange={e => setFTes(f => ({ ...f, conta_origem: e.target.value }))}
                      style={{ width: "100%", marginTop: 4, padding: "7px 10px", border: `0.5px solid ${fTes.conta_origem ? "#1A4870" : "#E24B4A"}`, borderRadius: 8, fontSize: 13, background: "var(--bg-card)", outline: "none" }}>
                      <option value="">— Selecione —</option>
                      {contas.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={{ fontSize: 11, fontWeight: 600, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Conta Destino (crédito)</label>
                    <select value={fTes.conta_destino} onChange={e => setFTes(f => ({ ...f, conta_destino: e.target.value }))}
                      style={{ width: "100%", marginTop: 4, padding: "7px 10px", border: `0.5px solid ${fTes.conta_destino ? "#16A34A" : "#E24B4A"}`, borderRadius: 8, fontSize: 13, background: "var(--bg-card)", outline: "none" }}>
                      <option value="">— Selecione —</option>
                      {contas.filter(c => c.id !== fTes.conta_origem).map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
                    </select>
                  </div>
                </div>
              ) : (
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  <div>
                    <label style={{ fontSize: 11, fontWeight: 600, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Tipo</label>
                    <select value={fTes.tipo} onChange={e => setFTes(f => ({ ...f, tipo: e.target.value as "pagar"|"receber" }))}
                      style={{ width: "100%", marginTop: 4, padding: "7px 10px", border: "0.5px solid var(--border)", borderRadius: 8, fontSize: 13, background: "var(--bg-card)", outline: "none" }}>
                      <option value="pagar">Conta a Pagar (saída)</option>
                      <option value="receber">Conta a Receber (entrada)</option>
                    </select>
                  </div>
                  <div>
                    <label style={{ fontSize: 11, fontWeight: 600, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Valor</label>
                    <input type="number" step="0.01" value={fTes.valor} onChange={e => setFTes(f => ({ ...f, valor: parseFloat(e.target.value) || 0 }))}
                      style={{ width: "100%", marginTop: 4, padding: "7px 10px", border: "0.5px solid var(--border)", borderRadius: 8, fontSize: 13, outline: "none", boxSizing: "border-box" }} />
                  </div>
                </div>
              )}

              <div>
                <label style={{ fontSize: 11, fontWeight: 600, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Descrição</label>
                <input value={fTes.descricao} onChange={e => setFTes(f => ({ ...f, descricao: e.target.value }))}
                  style={{ width: "100%", marginTop: 4, padding: "7px 10px", border: "0.5px solid var(--border)", borderRadius: 8, fontSize: 13, outline: "none", boxSizing: "border-box" }} />
              </div>

              <div>
                <label style={{ fontSize: 11, fontWeight: 600, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Operação de Tesouraria</label>
                <select
                  value={fTes.tipo_op}
                  onChange={e => {
                    const op = [...OPS_TESOURARIA_PADRAO, ...opsCustom].find(o => o.id === e.target.value);
                    setFTes(f => ({
                      ...f,
                      tipo_op: e.target.value,
                      tipo: op?.tipo === "entrada" ? "receber" : op?.tipo === "saida" ? "pagar" : f.tipo,
                      // Auto-preenche OG se a op custom tiver vínculo
                      og_id: op?.operacao_gerencial_id ?? f.og_id,
                    }));
                  }}
                  style={{ width: "100%", marginTop: 4, padding: "7px 10px", border: "0.5px solid var(--border)", borderRadius: 8, fontSize: 13, background: "var(--bg-card)", outline: "none" }}>
                  <optgroup label="Operações Padrão">
                    {OPS_TESOURARIA_PADRAO.map(o => (
                      <option key={o.id} value={o.id}>{o.nome}</option>
                    ))}
                  </optgroup>
                  {opsCustom.length > 0 && (
                    <optgroup label="Operações da Fazenda">
                      {opsCustom.map(o => (
                        <option key={o.id} value={o.id}>{o.nome}{o.operacao_gerencial_id ? " ✓" : ""}</option>
                      ))}
                    </optgroup>
                  )}
                </select>
              </div>

              <div>
                <label style={{ fontSize: 11, fontWeight: 600, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Operação Gerencial *</label>
                <div style={{ marginTop: 4 }}>
                  {fTes.tipo_op === "__transferencia__" ? (
                    <div style={{ fontSize: 11, color: "var(--text-3)" }}>Transferência entre contas próprias não tem O.G. (não entra no LCDPR nem no DRE).</div>
                  ) : (
                    <SelectBusca
                      value={fTes.og_id}
                      onChange={id => setFTes(f => ({ ...f, og_id: id }))}
                      options={ogsDisponiveis
                        .filter(g => g.tipo === (fTes.tipo === "pagar" ? "despesa" : "receita"))
                        .map(g => ({ value: g.id, label: `${g.classificacao} — ${g.descricao}`, group: (g.classificacao ?? "").split(".").slice(0, 3).join(".") || undefined }))}
                      placeholder="Selecionar operação…"
                      style={{ width: "100%", padding: "7px 10px", border: `0.5px solid ${fTes.og_id ? "#16A34A" : "var(--border)"}`, borderRadius: 8, fontSize: 13, background: "var(--bg-card)", outline: "none", boxSizing: "border-box" }}
                    />
                  )}
                </div>
                {fTes.og_id && fTes.tipo_op !== "__transferencia__" && (
                  <div style={{ marginTop: 3, fontSize: 10, color: "#16A34A" }}>✓ Lançamento impactará DRE, LCDPR e SPED ECD</div>
                )}
              </div>

              {migracaoOk && (
                <div style={{ background: criarRegra.ativo ? "#E6F0FB" : "var(--bg-page)", border: "0.5px solid var(--border)", borderRadius: 8, padding: "9px 12px" }}>
                  <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, fontWeight: 600, color: "var(--text-1)", cursor: "pointer" }}>
                    <input type="checkbox" checked={criarRegra.ativo} onChange={e => setCriarRegra(c => ({ ...c, ativo: e.target.checked }))} />
                    Fazer o mesmo sempre que o extrato disser algo como isto
                  </label>
                  {criarRegra.ativo && (
                    <div style={{ marginTop: 8, display: "grid", gridTemplateColumns: "1fr auto", gap: 8, alignItems: "end" }}>
                      <div>
                        <div style={{ fontSize: 10, color: "var(--text-3)", marginBottom: 2 }}>Texto que identifica (palavras contidas no histórico)</div>
                        <input value={criarRegra.texto} onChange={e => setCriarRegra(c => ({ ...c, texto: e.target.value }))}
                          style={{ width: "100%", padding: "6px 9px", border: "0.5px solid var(--border)", borderRadius: 6, fontSize: 12, outline: "none", boxSizing: "border-box" }} />
                      </div>
                      <select value={criarRegra.escopo} onChange={e => setCriarRegra(c => ({ ...c, escopo: e.target.value as "conta" | "todas" }))}
                        style={{ padding: "6px 8px", border: "0.5px solid var(--border)", borderRadius: 6, fontSize: 12, background: "var(--bg-card)" }}>
                        <option value="todas">Todas as contas</option>
                        <option value="conta">Só esta conta</option>
                      </select>
                    </div>
                  )}
                </div>
              )}

              <div>
                <label style={{ fontSize: 11, fontWeight: 600, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Data</label>
                <input type="date" value={fTes.data} onChange={e => setFTes(f => ({ ...f, data: e.target.value }))}
                  style={{ width: "100%", marginTop: 4, padding: "7px 10px", border: "0.5px solid var(--border)", borderRadius: 8, fontSize: 13, outline: "none", boxSizing: "border-box" }} />
              </div>

              <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
                <button onClick={() => setModalTes(null)} disabled={savingTes}
                  style={{ flex: 1, padding: "9px", border: "0.5px solid var(--border)", borderRadius: 8, background: "var(--bg-card)", fontSize: 13, color: "var(--text-2)", cursor: "pointer" }}>
                  Cancelar
                </button>
                <button onClick={salvarTesouraria} disabled={savingTes || fTes.valor <= 0 || (fTes.tipo_op === "__transferencia__" ? (!fTes.conta_origem || !fTes.conta_destino) : (!fTes.descricao || !fTes.og_id))}
                  style={{ flex: 2, padding: "9px", border: "none", borderRadius: 8, background: savingTes ? "#999" : "#1A4870", color: "#fff", fontSize: 13, fontWeight: 700, cursor: savingTes ? "default" : "pointer" }}>
                  {savingTes ? "Salvando..." : "✓ Salvar e Conciliar"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Resumo da importação ───────────────────────────────────────────── */}
      {resumoImport && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ background: "var(--bg-card)", borderRadius: 14, border: "0.5px solid var(--border)", width: 460, boxShadow: "0 20px 60px rgba(0,0,0,0.25)", padding: "20px 22px" }}>
            <div style={{ fontWeight: 700, fontSize: 16, color: "var(--text-1)" }}>Importação concluída</div>
            <div style={{ fontSize: 12, color: "var(--text-3)", marginTop: 2, marginBottom: 14 }}>{resumoImport.total} transações no arquivo{resumoImport.jaConciliadas > 0 ? ` · ${resumoImport.jaConciliadas} já estavam conciliadas` : ""}</div>
            {[
              { n: resumoImport.porRegra,  label: "conciliadas por regra",           dica: "lançadas e classificadas automaticamente", cor: "#1A4870", bg: "#E6F0FB" },
              { n: resumoImport.exatas,    label: "conciliadas por casamento exato", dica: "valor, conta, titular e data conferem",   cor: "#166534", bg: "#E4F6EA" },
              { n: resumoImport.sugestoes, label: "sugestões para revisar",          dica: "um clique confirma (aceitar todas está no topo)", cor: "#8A5A00", bg: "#FFF3D6" },
              { n: resumoImport.pendentes, label: "pendentes",                        dica: "sem lançamento correspondente",           cor: "#92400E", bg: "#FEF3C7" },
            ].map(x => (
              <div key={x.label} style={{ display: "flex", alignItems: "center", gap: 12, padding: "8px 12px", borderRadius: 8, background: x.bg, marginBottom: 6 }}>
                <div style={{ fontSize: 20, fontWeight: 800, color: x.cor, minWidth: 44, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{x.n}</div>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: x.cor }}>{x.label}</div>
                  <div style={{ fontSize: 11, color: "var(--text-3)" }}>{x.dica}</div>
                </div>
              </div>
            ))}
            {(resumoImport.semOG > 0 || resumoImport.falhas > 0) && (
              <div style={{ fontSize: 12, color: "#991B1B", background: "#FDECEC", borderRadius: 8, padding: "8px 12px", marginTop: 8 }}>
                {resumoImport.semOG > 0 && <div>{resumoImport.semOG} linha(s) casaram com regra, mas a O.G. da regra não existe na fazenda desta conta — ficaram pendentes.</div>}
                {resumoImport.falhas > 0 && <div>{resumoImport.falhas} falha(s) ao aplicar regras — ficaram pendentes.</div>}
              </div>
            )}
            <div style={{ textAlign: "right", marginTop: 14 }}>
              <button onClick={() => setResumoImport(null)} style={{ padding: "8px 22px", border: "none", borderRadius: 8, background: "#1A4870", color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>Revisar</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal Lançamento Agrupado ─────────────────────────────────────── */}
      {modalAgrupado && extrato && (() => {
        const linhasSel = extrato.linhas.filter(l => selecaoMultipla.has(l.id));
        const tipoLanc: "pagar" | "receber" = linhasSel[0]?.tipo === "credito" ? "receber" : "pagar";
        const valorTotal = linhasSel.reduce((s, l) => s + l.valor, 0);
        const dataComum = linhasSel[0]?.data;
        return (
          <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <div style={{ background: "var(--bg-card)", borderRadius: 14, border: "0.5px solid var(--border)", width: 480, boxShadow: "0 20px 60px rgba(0,0,0,0.25)" }}>
              <div style={{ padding: "16px 20px", borderBottom: "0.5px solid var(--border)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 15, color: "var(--text-1)" }}>Lançamento CP/CR Agrupado</div>
                  <div style={{ fontSize: 12, color: "var(--text-3)", marginTop: 2 }}>Um único lançamento, conciliado contra {linhasSel.length} linhas do extrato</div>
                </div>
                <button onClick={() => setModalAgrupado(false)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 20, color: "var(--text-3)", lineHeight: 1 }}>×</button>
              </div>

              <div style={{ margin: "14px 20px 0", padding: "10px 14px", background: "var(--bg-page)", borderRadius: 8, border: "0.5px solid var(--border)" }}>
                <div style={{ fontSize: 11, color: "var(--text-3)", marginBottom: 6 }}>Linhas selecionadas — {fmtDt(dataComum)}</div>
                {linhasSel.map(l => (
                  <div key={l.id} style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "var(--text-2)", padding: "2px 0" }}>
                    <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 300 }}>{l.descricao}</span>
                    <span style={{ fontWeight: 600 }}>{fmtBRL(l.valor)}</span>
                  </div>
                ))}
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, fontWeight: 700, color: "var(--text-1)", borderTop: "0.5px solid var(--border)", marginTop: 6, paddingTop: 6 }}>
                  <span>Total ({tipoLanc === "pagar" ? "CP" : "CR"})</span>
                  <span>{fmtBRL(valorTotal)}</span>
                </div>
              </div>

              <div style={{ padding: "14px 20px 20px", display: "flex", flexDirection: "column", gap: 12 }}>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 600, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Descrição</label>
                  <input value={descAgrupado} onChange={e => setDescAgrupado(e.target.value)} placeholder="Ex: Pedágios do dia"
                    style={{ width: "100%", marginTop: 4, padding: "7px 10px", border: `0.5px solid ${descAgrupado.trim() ? "var(--border)" : "#E24B4A"}`, borderRadius: 8, fontSize: 13, outline: "none", boxSizing: "border-box" }} />
                </div>

                <div>
                  <label style={{ fontSize: 11, fontWeight: 600, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Operação Gerencial (opcional)</label>
                  <select value={ogAgrupado} onChange={e => setOgAgrupado(e.target.value)}
                    style={{ width: "100%", marginTop: 4, padding: "7px 10px", border: "0.5px solid var(--border)", borderRadius: 8, fontSize: 13, background: "var(--bg-card)", outline: "none" }}>
                    <option value="">— Sem vínculo —</option>
                    {ogsDisponiveis.filter(g => g.tipo === (tipoLanc === "pagar" ? "despesa" : "receita")).map(g => (
                      <option key={g.id} value={g.id}>{g.classificacao} — {g.descricao}</option>
                    ))}
                  </select>
                </div>

                <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
                  <button onClick={() => setModalAgrupado(false)} disabled={savingAgrupado}
                    style={{ flex: 1, padding: "9px", border: "0.5px solid var(--border)", borderRadius: 8, background: "var(--bg-card)", fontSize: 13, color: "var(--text-2)", cursor: "pointer" }}>
                    Cancelar
                  </button>
                  <button onClick={salvarLancamentoAgrupado} disabled={savingAgrupado || !descAgrupado.trim()}
                    style={{ flex: 2, padding: "9px", border: "none", borderRadius: 8, background: savingAgrupado ? "#999" : "#1A5CB8", color: "#fff", fontSize: 13, fontWeight: 700, cursor: savingAgrupado ? "default" : "pointer" }}>
                    {savingAgrupado ? "Salvando..." : "✓ Lançar e Conciliar Todas"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      <div style={{ maxWidth: extrato ? "none" : 1700, margin: "0 auto", padding: extrato ? "10px 14px" : "18px 20px" }}>

        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 4 }}>Financeiro</div>
            <h1 style={{ margin: 0, fontSize: 21, fontWeight: 700, color: "var(--text-1)" }}>Conciliação Bancária</h1>
            <p style={{ margin: "3px 0 0", fontSize: 13, color: "#666" }}>
              Importe o OFX · o sistema concilia automaticamente · histórico salvo na nuvem
            </p>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6, alignItems: "flex-end" }}>
            <div style={{ display: "flex", gap: 8 }}>
              <select value={contaSel} onChange={e => setContaSel(e.target.value)}
                style={{ padding: "7px 10px", border: "0.5px solid var(--border)", borderRadius: 8, fontSize: 13, background: "var(--bg-card)", outline: "none" }}>
                <option value="">— Conta bancária —</option>
                {contas.map(c => <option key={c.id} value={c.id}>{c.nome} · {c.banco}</option>)}
              </select>
              <button onClick={() => inputRef.current?.click()} disabled={loading}
                style={{ padding: "7px 18px", background: "#111", color: "#fff", border: "none", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
                {loading ? "Processando..." : "Importar OFX"}
              </button>
              <input ref={inputRef} type="file" accept=".ofx,.OFX" onChange={handleOFX} style={{ display: "none" }} />
            </div>
            <div style={{ fontSize: 11, color: "var(--text-3)" }}>Suporta OFX de qualquer banco brasileiro</div>
          </div>
        </div>

        {/* Abas: Extratos / Inconsistências / Histórico */}
        {!extrato && (
          <div style={{ display: "flex", gap: 6, marginBottom: 16 }}>
            {([
              ["extrato",         "Extratos OFX"],
              ["regras",          `Regras${regras.length > 0 ? ` (${regras.length})` : ""}`],
              ["inconsistencias", `Inconsistências${pendencias.length > 0 ? ` (${pendencias.length})` : ""}`],
              ["historico",       `Histórico (${extratos.length})`],
            ] as const).map(([k, lbl]) => (
              <button key={k} onClick={() => setAbaAtiva(k)}
                style={{
                  padding: "6px 16px", borderRadius: 8,
                  border: `0.5px solid ${abaAtiva === k ? (k === "inconsistencias" ? "#C9921B" : "#1A5CB8") : "var(--border)"}`,
                  background: abaAtiva === k ? (k === "inconsistencias" ? "#C9921B" : "#1A5CB8") : "var(--bg-card)",
                  color: abaAtiva === k ? "#fff" : "var(--text-2)",
                  fontSize: 13, fontWeight: abaAtiva === k ? 700 : 400, cursor: "pointer",
                }}>
                {lbl}
              </button>
            ))}
          </div>
        )}

        {/* Banner: pendências por conta bancária — agregado de extrato_transacoes,
            fonte única e contínua (substitui a leitura por card de import). */}
        {!extrato && abaAtiva === "extrato" && !contaSel && pendPorConta.length > 0 && (
          <div style={{ background: "#FEF3C7", border: "0.5px solid #F59E0B", borderRadius: 10, padding: "12px 18px", marginBottom: 16, display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
            <div style={{ fontSize: 20 }}>⏳</div>
            <div style={{ flex: 1, minWidth: 200 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#92400E" }}>
                {pendPorConta.length === 1
                  ? `${pendPorConta[0].conta_nome} tem ${pendPorConta[0].pendentes} transação(ões) pendente(s)`
                  : `${pendPorConta.length} contas com transações pendentes`}
              </div>
              <div style={{ fontSize: 12, color: "#78350F", marginTop: 2 }}>Clique na conta para ver a conciliação contínua (últimos 6 meses)</div>
            </div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {pendPorConta.map(p => (
                <button key={p.conta_bancaria_id} onClick={() => abrirContaPendente(p.conta_bancaria_id)}
                  style={{ padding: "6px 14px", background: "#C9921B", color: "#fff", border: "none", borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap" }}>
                  {p.conta_nome} ({p.pendentes}) →
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Conciliação contínua por conta bancária — substitui a lista fragmentada
            de cards por importação. Um OFX pode ser importado várias vezes por
            semana; todas as transações do período aparecem juntas aqui, não
            importa quantos arquivos foram importados. */}
        {!extrato && abaAtiva === "extrato" && (
          <div style={{ background: "var(--bg-card)", borderRadius: 12, border: "0.5px solid var(--border)", padding: "22px 24px", marginBottom: 20 }}>
            {!contaSel ? (
              <div style={{ textAlign: "center", color: "var(--text-3)", fontSize: 13, padding: "16px 0" }}>
                <div style={{ fontSize: 32, marginBottom: 10 }}>🏦</div>
                <div style={{ fontWeight: 600, color: "var(--text-1)", marginBottom: 4 }}>Selecione uma conta bancária acima</div>
                <div style={{ fontSize: 12 }}>A conciliação é contínua por conta — todas as transações do período selecionado aparecem juntas, não importa quantos OFX foram importados.</div>
              </div>
            ) : (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 14, color: "var(--text-1)" }}>{contas.find(c => c.id === contaSel)?.nome ?? "—"}</div>
                  <div style={{ fontSize: 12, color: "var(--text-3)", marginTop: 2 }}>Abre todo o extrato já importado desta conta · para conciliar um arquivo novo, use "Importar OFX"</div>
                </div>
                <button
                  onClick={() => abrirContaCompleta(contaSel)}
                  disabled={loading}
                  style={{ padding: "9px 20px", background: "#1A5CB8", color: "#fff", border: "none", borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: loading ? "default" : "pointer", opacity: loading ? 0.6 : 1 }}>
                  {loading ? "Carregando..." : "Ver conciliação →"}
                </button>
              </div>
            )}
          </div>
        )}

        {/* ═══ ABA REGRAS ═══ */}
        {!extrato && abaAtiva === "regras" && (
          <div style={{ background: "var(--bg-card)", borderRadius: 12, border: "0.5px solid var(--border)", padding: "18px 20px", marginBottom: 20 }}>
            {!migracaoOk && (
              <div style={{ background: "#FFF3D6", border: "0.5px solid #E8C36A", borderRadius: 8, padding: "10px 14px", fontSize: 12, color: "#8A5A00", marginBottom: 14 }}>
                Para usar regras e a confiança do vínculo, execute a migração <strong>Seção 277</strong> (final do arquivo <code>supabase_migrations.sql</code>) no Supabase SQL Editor.
              </div>
            )}
            <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text-1)", marginBottom: 4 }}>Regras de conciliação</div>
            <div style={{ fontSize: 12, color: "var(--text-3)", marginBottom: 14, lineHeight: 1.5 }}>
              Quando o histórico do extrato contém o texto da regra, o Arato cria o lançamento já classificado (Operação Gerencial, centro de custo, pessoa) e concilia sozinho — ideal para IOF, tarifas, juros e aplicações. As regras valem para todas as contas ou só para uma.
              Dica: você também cria regras direto da linha do extrato, em <em>+ Tesouraria → Criar regra</em>.
            </div>

            {/* Nova regra */}
            <div style={{ background: "var(--bg-page)", borderRadius: 10, padding: "12px 14px", marginBottom: 16, display: "grid", gridTemplateColumns: "2fr 1fr 1.4fr 1.2fr", gap: 10, alignItems: "end" }}>
              <div>
                <label style={lblRegra}>Texto no histórico do extrato</label>
                <input value={fRegra.texto} onChange={e => setFRegra(f => ({ ...f, texto: e.target.value }))} placeholder="Ex.: cobranca de iof"
                  style={inpRegra} />
              </div>
              <div>
                <label style={lblRegra}>Natureza</label>
                <select value={fRegra.tipo} onChange={e => setFRegra(f => ({ ...f, tipo: e.target.value as "debito" | "credito", og_id: "" }))} style={inpRegra}>
                  <option value="debito">Débito (saída)</option>
                  <option value="credito">Crédito (entrada)</option>
                </select>
              </div>
              <div>
                <label style={lblRegra}>Conta bancária</label>
                <select value={fRegra.conta_bancaria_id} onChange={e => setFRegra(f => ({ ...f, conta_bancaria_id: e.target.value }))} style={inpRegra}>
                  <option value="">Todas as contas</option>
                  {contas.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
                </select>
              </div>
              <div>
                <label style={lblRegra}>O que fazer</label>
                <select value={fRegra.acao} onChange={e => setFRegra(f => ({ ...f, acao: e.target.value as "lancar" | "transferencia" }))} style={inpRegra}>
                  <option value="lancar">Lançar e conciliar</option>
                  <option value="transferencia">Transferência entre contas</option>
                </select>
              </div>
              {fRegra.acao === "lancar" ? (
                <>
                  <div style={{ gridColumn: "1 / 3" }}>
                    <label style={lblRegra}>Operação Gerencial *</label>
                    <SelectBusca value={fRegra.og_id} onChange={id => setFRegra(f => ({ ...f, og_id: id }))}
                      options={ogsDisponiveis.filter(g => g.tipo === (fRegra.tipo === "debito" ? "despesa" : "receita")).map(g => ({ value: g.id, label: `${g.classificacao} — ${g.descricao}`, group: (g.classificacao ?? "").split(".").slice(0, 3).join(".") || undefined }))}
                      placeholder="Selecionar operação…" style={inpRegra} />
                  </div>
                  <div>
                    <label style={lblRegra}>Centro de custo</label>
                    <select value={fRegra.centro_custo_id} onChange={e => setFRegra(f => ({ ...f, centro_custo_id: e.target.value }))} style={inpRegra}>
                      <option value="">Sem centro de custo</option>
                      {ccLista.filter(c => !ccLista.some(x => x.parent_id === c.id)).map(c => <option key={c.id} value={c.id}>{c.codigo ? `${c.codigo} — ` : ""}{c.nome}</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={lblRegra}>Pessoa (favorecido)</label>
                    <select value={fRegra.pessoa_id} onChange={e => setFRegra(f => ({ ...f, pessoa_id: e.target.value }))} style={inpRegra}>
                      <option value="">Nenhuma</option>
                      {pessoasLista.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
                    </select>
                  </div>
                </>
              ) : (
                <div style={{ gridColumn: "1 / 3" }}>
                  <label style={lblRegra}>Conta da outra ponta *</label>
                  <select value={fRegra.conta_destino_id} onChange={e => setFRegra(f => ({ ...f, conta_destino_id: e.target.value }))} style={inpRegra}>
                    <option value="">— Selecione —</option>
                    {contas.filter(c => c.id !== fRegra.conta_bancaria_id).map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
                  </select>
                </div>
              )}
              <div style={{ gridColumn: "3 / 5", textAlign: "right" }}>
                <button onClick={salvarRegraForm}
                  disabled={savingRegra || !migracaoOk || normalizarTexto(fRegra.texto).length < 3 || (fRegra.acao === "lancar" ? !fRegra.og_id : !fRegra.conta_destino_id)}
                  style={{ padding: "8px 20px", borderRadius: 8, border: "none", background: "#1A4870", color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer", opacity: (savingRegra || !migracaoOk || normalizarTexto(fRegra.texto).length < 3 || (fRegra.acao === "lancar" ? !fRegra.og_id : !fRegra.conta_destino_id)) ? 0.5 : 1 }}>
                  {savingRegra ? "Salvando…" : "+ Salvar regra"}
                </button>
              </div>
            </div>

            {/* Lista */}
            {regras.length === 0 ? (
              <div style={{ textAlign: "center", color: "var(--text-3)", fontSize: 12, padding: "14px 0" }}>Nenhuma regra ainda.</div>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                  <thead>
                    <tr>{["Ativa", "Texto", "Natureza", "Conta", "Ação", "Centro de custo / Pessoa", "Usos", "Pega hoje", ""].map(h => (
                      <th key={h} style={{ ...thStyle, position: "static" }}>{h}</th>
                    ))}</tr>
                  </thead>
                  <tbody>
                    {regras.map(r => (
                      <tr key={r.id} style={{ borderBottom: "0.5px solid var(--bg-tag)", opacity: r.ativa ? 1 : 0.5 }}>
                        <td style={{ padding: "8px 10px" }}><input type="checkbox" checked={r.ativa} onChange={() => alternarRegra(r)} style={{ cursor: "pointer" }} /></td>
                        <td style={{ padding: "8px 10px", fontWeight: 600, color: "var(--text-1)" }}>{r.texto}</td>
                        <td style={{ padding: "8px 10px", color: r.tipo === "debito" ? "#E24B4A" : "#16A34A" }}>{r.tipo === "debito" ? "Débito" : "Crédito"}</td>
                        <td style={{ padding: "8px 10px", color: "var(--text-2)" }}>{r.conta_bancaria_id ? (contas.find(c => c.id === r.conta_bancaria_id)?.nome ?? "—") : "Todas"}</td>
                        <td style={{ padding: "8px 10px", color: "var(--text-2)" }}>
                          {r.acao === "lancar" ? `${r.operacao_classificacao ?? ""} — ${r.operacao_descricao ?? ""}` : `Transferência ↔ ${contas.find(c => c.id === r.conta_destino_id)?.nome ?? "—"}`}
                        </td>
                        <td style={{ padding: "8px 10px", color: "var(--text-3)" }}>
                          {[ccLista.find(c => c.id === r.centro_custo_id)?.nome, pessoasLista.find(p => p.id === r.pessoa_id)?.nome].filter(Boolean).join(" · ") || "—"}
                        </td>
                        <td style={{ padding: "8px 10px", color: "var(--text-3)" }}>{r.usos}</td>
                        <td style={{ padding: "8px 10px", color: "var(--text-3)" }}>{contarBatidas(r)} pendente(s)</td>
                        <td style={{ padding: "8px 10px" }}>
                          <button onClick={() => excluirRegra(r)} style={{ background: "none", border: "none", cursor: "pointer", color: "#E24B4A", fontSize: 15 }}>×</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ═══ ABA INCONSISTÊNCIAS ═══ */}
        {!extrato && abaAtiva === "inconsistencias" && (() => {
          const comConta    = pendencias.filter(p => p.conta_id);
          const semContaOFX = pendencias.filter(p => !p.conta_id);

          // Agrupa OFX-com-conta por conta_nome
          const grupos = new Map<string, { conta_nome: string; itens: Pendencia[] }>();
          for (const p of comConta) {
            const key = p.conta_nome ?? p.conta_id ?? "—";
            if (!grupos.has(key)) grupos.set(key, { conta_nome: key, itens: [] });
            grupos.get(key)!.itens.push(p);
          }
          const gruposList = Array.from(grupos.values()).sort((a, b) => a.conta_nome.localeCompare(b.conta_nome));

          return (
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

              {/* Sub-abas */}
              <div style={{ display: "flex", gap: 6 }}>
                {([
                  ["com_conta",     `OFX sem lançamento — por conta (${comConta.length})`],
                  ["sem_conta",     `OFX sem conta bancária (${semContaOFX.length})`],
                ] as const).map(([k, lbl]) => (
                  <button key={k} onClick={() => setSubInconsist(k)}
                    style={{ padding: "5px 13px", borderRadius: 7, border: `0.5px solid ${subInconsist === k ? "#C9921B" : "var(--border)"}`, background: subInconsist === k ? "#FBF3E0" : "var(--bg-card)", color: subInconsist === k ? "#92400E" : "var(--text-2)", fontSize: 12, fontWeight: subInconsist === k ? 700 : 400, cursor: "pointer" }}>
                    {lbl}
                  </button>
                ))}
              </div>

              {/* OFX sem lançamento — por conta */}
              {subInconsist === "com_conta" && (
                gruposList.length === 0 ? (
                  <div style={{ background: "var(--bg-card)", borderRadius: 12, border: "0.5px solid var(--border)", padding: "40px 24px", textAlign: "center", color: "var(--text-3)", fontSize: 13 }}>
                    <div style={{ fontSize: 32, marginBottom: 8 }}>✅</div>
                    <div style={{ fontWeight: 600, color: "var(--text-2)" }}>Sem inconsistências com conta bancária indicada</div>
                  </div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                    {gruposList.map(g => (
                      <div key={g.conta_nome} style={{ background: "var(--bg-card)", borderRadius: 12, border: "0.5px solid #F59E0B", overflow: "hidden" }}>
                        <div style={{ padding: "10px 16px", background: "#FEF3C7", borderBottom: "0.5px solid #F59E0B", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                          <div style={{ fontWeight: 700, fontSize: 13, color: "#92400E" }}>🏦 {g.conta_nome}</div>
                          <span style={{ fontSize: 11, background: "#F59E0B", color: "#fff", borderRadius: 8, padding: "2px 8px", fontWeight: 600 }}>{g.itens.length} sem lançamento</span>
                        </div>
                        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                          <thead>
                            <tr style={{ background: "var(--bg-page)" }}>
                              {["Data", "Descrição no Extrato", "Valor", "Tipo", "Ação"].map(h => (
                                <th key={h} style={{ padding: "8px 12px", textAlign: "left", fontWeight: 600, fontSize: 11, color: "#666", borderBottom: "0.5px solid var(--border)" }}>{h}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {g.itens.map((p, i) => (
                              <tr key={p.id} style={{ borderBottom: i < g.itens.length - 1 ? "0.5px solid var(--bg-tag)" : "none" }}>
                                <td style={{ padding: "8px 12px", color: "var(--text-3)", whiteSpace: "nowrap" }}>{fmtDt(p.data)}</td>
                                <td style={{ padding: "8px 12px", color: "var(--text-1)", maxWidth: 400 }}>{p.descricao}</td>
                                <td style={{ padding: "8px 12px", fontWeight: 700, whiteSpace: "nowrap", color: p.tipo === "credito" ? "#16A34A" : "#E24B4A" }}>
                                  {p.tipo === "credito" ? "+" : "−"}{fmtBRL(p.valor)}
                                </td>
                                <td style={{ padding: "8px 12px" }}>
                                  <span style={{ fontSize: 10, padding: "2px 7px", borderRadius: 6, background: p.tipo === "credito" ? "#DCFCE7" : "#FEE2E2", color: p.tipo === "credito" ? "#16A34A" : "#DC2626", fontWeight: 600 }}>
                                    {p.tipo === "credito" ? "Crédito" : "Débito"}
                                  </span>
                                </td>
                                <td style={{ padding: "8px 12px" }}>
                                  <button
                                    onClick={async () => {
                                      await supabase.from("conciliacao_pendencias").update({ status: "ignorada" }).eq("id", p.id);
                                      setPendencias(prev => prev.filter(x => x.id !== p.id));
                                    }}
                                    style={{ fontSize: 11, padding: "3px 9px", borderRadius: 6, border: "0.5px solid var(--border)", background: "var(--bg-card)", color: "var(--text-3)", cursor: "pointer" }}
                                  >
                                    Ignorar
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ))}
                  </div>
                )
              )}

              {/* OFX sem conta bancária */}
              {subInconsist === "sem_conta" && (
                semContaOFX.length === 0 ? (
                  <div style={{ background: "var(--bg-card)", borderRadius: 12, border: "0.5px solid var(--border)", padding: "40px 24px", textAlign: "center", color: "var(--text-3)", fontSize: 13 }}>
                    <div style={{ fontSize: 32, marginBottom: 8 }}>✅</div>
                    <div style={{ fontWeight: 600, color: "var(--text-2)" }}>Todos os extratos foram importados com conta bancária selecionada</div>
                  </div>
                ) : (
                  <div style={{ background: "var(--bg-card)", borderRadius: 12, border: "0.5px solid var(--border)", overflow: "hidden" }}>
                    <div style={{ padding: "10px 16px", background: "var(--bg-page)", borderBottom: "0.5px solid var(--border)" }}>
                      <div style={{ fontWeight: 700, fontSize: 13, color: "var(--text-1)" }}>Transações OFX sem conta bancária indicada</div>
                      <div style={{ fontSize: 11, color: "var(--text-3)", marginTop: 2 }}>Esses itens foram importados sem selecionar uma conta — impossível conciliar corretamente</div>
                    </div>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                      <thead>
                        <tr style={{ background: "var(--bg-page)" }}>
                          {["Data", "Descrição", "Valor", "Tipo", ""].map(h => (
                            <th key={h} style={{ padding: "8px 12px", textAlign: "left", fontWeight: 600, fontSize: 11, color: "#666", borderBottom: "0.5px solid var(--border)" }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {semContaOFX.map((p, i) => (
                          <tr key={p.id} style={{ borderBottom: i < semContaOFX.length - 1 ? "0.5px solid var(--bg-tag)" : "none" }}>
                            <td style={{ padding: "8px 12px", color: "var(--text-3)", whiteSpace: "nowrap" }}>{fmtDt(p.data)}</td>
                            <td style={{ padding: "8px 12px", color: "var(--text-1)" }}>{p.descricao}</td>
                            <td style={{ padding: "8px 12px", fontWeight: 700, color: p.tipo === "credito" ? "#16A34A" : "#E24B4A" }}>
                              {p.tipo === "credito" ? "+" : "−"}{fmtBRL(p.valor)}
                            </td>
                            <td style={{ padding: "8px 12px" }}>
                              <span style={{ fontSize: 10, padding: "2px 7px", borderRadius: 6, background: p.tipo === "credito" ? "#DCFCE7" : "#FEE2E2", color: p.tipo === "credito" ? "#16A34A" : "#DC2626", fontWeight: 600 }}>
                                {p.tipo === "credito" ? "Crédito" : "Débito"}
                              </span>
                            </td>
                            <td style={{ padding: "8px 12px" }}>
                              <button
                                onClick={async () => {
                                  await supabase.from("conciliacao_pendencias").update({ status: "ignorada" }).eq("id", p.id);
                                  setPendencias(prev => prev.filter(x => x.id !== p.id));
                                }}
                                style={{ fontSize: 11, padding: "3px 9px", borderRadius: 6, border: "0.5px solid var(--border)", background: "var(--bg-card)", color: "var(--text-3)", cursor: "pointer" }}
                              >
                                Ignorar
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )
              )}


            </div>
          );
        })()}

        {/* ═══ ABA HISTÓRICO ═══ */}
        {!extrato && abaAtiva === "historico" && (() => {
          const historicoDeExtrato = (exId: string) =>
            historico.filter(h => h.extrato_id === exId);

          const baixarOFX = async (ex: Extrato) => {
            if (!ex.ofx_storage_path) return;
            const { data } = await supabase.storage.from("arquivos").createSignedUrl(ex.ofx_storage_path, 120);
            if (data?.signedUrl) window.open(data.signedUrl, "_blank");
          };

          // Fase 3 — "Reabrir" não pula mais pro snapshot congelado deste import
          // (extratos_bancarios.linhas pode estar desatualizado: ações feitas
          // depois pela visão contínua não escrevem mais de volta aqui). Em vez
          // disso abre a visão contínua da mesma conta+período — sempre fiel ao
          // estado atual. Sem conta_id (import legado sem conta vinculada), cai
          // no snapshot antigo por não ter outra fonte pra usar.
          const reabrirExtrato = (ex: Extrato) => {
            if (ex.conta_id) {
              carregarExtratoUnificado(ex.conta_id, ex.data_inicio, ex.data_fim);
            } else {
              setExtrato(ex);
              setAbaAtiva("extrato");
              setLinhaAtiva(null);
              setLancsSel(new Set());
            }
          };

          return (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>

              {/* Header info */}
              <div style={{ fontSize: 12, color: "var(--text-3)", padding: "4px 2px" }}>
                {extratos.length} importações de OFX registradas — histórico de auditoria (quem importou, quando, arquivo original). Clique em <strong>Ver conciliação</strong> para abrir o estado atual e completo da conta neste período.
              </div>

              {extratos.length === 0 ? (
                <div style={{ background: "var(--bg-card)", borderRadius: 12, border: "0.5px solid var(--border)", padding: "40px 24px", textAlign: "center", color: "var(--text-3)", fontSize: 13 }}>
                  <div style={{ fontSize: 32, marginBottom: 8 }}>📋</div>
                  <div style={{ fontWeight: 600, color: "var(--text-2)" }}>Nenhuma sessão de conciliação ainda</div>
                  <div style={{ fontSize: 12, marginTop: 4 }}>Importe um arquivo OFX para iniciar a conciliação bancária.</div>
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {extratos.map(ex => {
                    const isOpen = expandedHist === ex.id;
                    const movs = historicoDeExtrato(ex.id);
                    const concil  = movs.filter(m => m.acao === "conciliado").length;
                    const desvincl = movs.filter(m => m.acao === "desvinculado").length;
                    return (
                      <div key={ex.id} style={{ background: "var(--bg-card)", borderRadius: 12, border: `0.5px solid ${isOpen ? "#1A5CB8" : "var(--border)"}`, overflow: "hidden" }}>
                        {/* Linha resumo */}
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 120px 120px auto", gap: 12, padding: "12px 16px", alignItems: "center" }}>
                          {/* Conta + período */}
                          <div>
                            <div style={{ fontWeight: 700, fontSize: 13, color: "var(--text-1)" }}>{ex.conta_nome || "Conta não identificada"}</div>
                            <div style={{ fontSize: 11, color: "var(--text-3)", marginTop: 2 }}>{fmtDt(ex.data_inicio)} a {fmtDt(ex.data_fim)}</div>
                          </div>
                          {/* Usuário + data importação */}
                          <div>
                            <div style={{ fontSize: 12, color: "var(--text-2)" }}>{ex.usuario_nome ?? "—"}</div>
                            <div style={{ fontSize: 11, color: "var(--text-3)", marginTop: 2 }}>
                              {new Date(ex.data_importacao + "T00:00:00").toLocaleDateString("pt-BR")}
                              {" · "}{ex.total_linhas} transações
                            </div>
                          </div>
                          {/* Conciliadas / pendentes */}
                          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                            <span style={{ fontSize: 11, fontWeight: 700, background: "#DCFCE7", color: "#16A34A", padding: "2px 8px", borderRadius: 6, width: "fit-content" }}>
                              {ex.conciliados} conciliadas
                            </span>
                            {ex.pendentes > 0 && (
                              <span style={{ fontSize: 11, fontWeight: 700, background: "#FEE2E2", color: "#DC2626", padding: "2px 8px", borderRadius: 6, width: "fit-content" }}>
                                {ex.pendentes} pendentes
                              </span>
                            )}
                          </div>
                          {/* OFX download */}
                          <div>
                            {ex.ofx_storage_path ? (
                              <button onClick={() => baixarOFX(ex)} style={{ fontSize: 11, padding: "4px 10px", borderRadius: 6, border: "0.5px solid #1A5CB8", background: "#D5E8F5", color: "#1A4870", cursor: "pointer", fontWeight: 600 }}>
                                ↓ OFX
                              </button>
                            ) : (
                              <span style={{ fontSize: 11, color: "var(--text-muted)" }}>sem arquivo</span>
                            )}
                          </div>
                          {/* Ações */}
                          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                            <button
                              onClick={() => reabrirExtrato(ex)}
                              style={{ fontSize: 11, padding: "5px 12px", borderRadius: 6, border: "0.5px solid #C9921B", background: "#FBF3E0", color: "#92400E", cursor: "pointer", fontWeight: 700, whiteSpace: "nowrap" }}
                            >
                              Ver conciliação
                            </button>
                            <button
                              title="Excluir este registro de importação (não desfaz conciliações já feitas)"
                              onClick={() => excluirExtrato(ex)}
                              style={{ fontSize: 11, padding: "5px 8px", borderRadius: 6, border: "0.5px solid var(--border)", background: "var(--bg-page)", color: "var(--text-3)", cursor: "pointer" }}
                            >
                              🗑
                            </button>
                            {movs.length > 0 && (
                              <button
                                onClick={() => setExpandedHist(isOpen ? null : ex.id)}
                                style={{ fontSize: 11, padding: "5px 10px", borderRadius: 6, border: "0.5px solid var(--border)", background: "var(--bg-page)", color: "var(--text-3)", cursor: "pointer" }}
                              >
                                {isOpen ? "▲" : `▼ ${movs.length}`}
                              </button>
                            )}
                          </div>
                        </div>

                        {/* Detalhe expandido */}
                        {isOpen && movs.length > 0 && (
                          <div style={{ borderTop: "0.5px solid var(--border)" }}>
                            <div style={{ padding: "8px 16px", background: "var(--bg-page)", display: "flex", gap: 16, alignItems: "center" }}>
                              <span style={{ fontSize: 11, color: "var(--text-3)" }}>
                                Movimentações desta sessão — {concil > 0 && <span style={{ color: "#16A34A", fontWeight: 600 }}>{concil} conciliadas</span>}
                                {concil > 0 && desvincl > 0 && " · "}
                                {desvincl > 0 && <span style={{ color: "#E24B4A", fontWeight: 600 }}>{desvincl} desvinculadas</span>}
                              </span>
                            </div>
                            <div style={{ overflowX: "auto" }}>
                              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                                <thead>
                                  <tr style={{ background: "var(--bg-page)" }}>
                                    {["Data", "Descrição OFX", "Valor", "Lançamento", "Ação"].map(col => (
                                      <th key={col} style={{ padding: "6px 12px", textAlign: "left", fontWeight: 600, fontSize: 10, color: "#666", borderBottom: "0.5px solid var(--border)", whiteSpace: "nowrap" }}>{col}</th>
                                    ))}
                                  </tr>
                                </thead>
                                <tbody>
                                  {movs.map((m, mi) => (
                                    <tr key={m.id} style={{ borderBottom: mi < movs.length - 1 ? "0.5px solid var(--bg-tag)" : "none", background: m.acao === "desvinculado" ? "rgba(239,68,68,0.02)" : "transparent" }}>
                                      <td style={{ padding: "7px 12px", color: "var(--text-3)", whiteSpace: "nowrap" }}>{fmtDt(m.data_transacao)}</td>
                                      <td style={{ padding: "7px 12px", color: "var(--text-1)", maxWidth: 260, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.descricao}</td>
                                      <td style={{ padding: "7px 12px", fontWeight: 700, whiteSpace: "nowrap", color: m.tipo === "credito" ? "#16A34A" : "#E24B4A" }}>
                                        {m.tipo === "credito" ? "+" : "−"}{fmtBRL(m.valor)}
                                      </td>
                                      <td style={{ padding: "7px 12px", fontSize: 11, color: "var(--text-2)", maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.lancamento_desc || "—"}</td>
                                      <td style={{ padding: "7px 12px" }}>
                                        <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 5, background: m.acao === "conciliado" ? "#DCFCE7" : "rgba(239,68,68,0.1)", color: m.acao === "conciliado" ? "#16A34A" : "#E24B4A" }}>
                                          {m.acao === "conciliado" ? "✓" : "✗"}
                                        </span>
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })()}

        {/* ═══ EXTRATO ATIVO — layout lado a lado ═══ */}
        {extrato && (
          <>
            {/* Cabeçalho compacto do extrato */}
            <div style={{ background: "var(--bg-card)", borderRadius: 10, border: "0.5px solid var(--border)", padding: "8px 14px", marginBottom: 10, display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
              <button onClick={() => { setExtrato(null); setLinhaAtiva(null); setLancsSel(new Set()); }}
                style={{ background: "none", border: "0.5px solid var(--border)", borderRadius: 6, cursor: "pointer", color: "var(--text-2)", fontSize: 14, padding: "2px 9px", lineHeight: 1.2 }}>←</button>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 14, color: "var(--text-1)" }}>{extrato.conta_nome}</div>
                <div style={{ fontSize: 11, color: "var(--text-3)" }}>{fmtDt(extrato.data_inicio)} até {fmtDt(extrato.data_fim)} · {extrato.total_linhas} transações</div>
              </div>
              <div style={{ flex: 1, minWidth: 180 }}>
                <div style={{ height: 4, background: "var(--bg-tag)", borderRadius: 2, overflow: "hidden" }}>
                  <div style={{ width: `${pct}%`, height: "100%", background: "#1A4870", transition: "width 0.3s" }} />
                </div>
                <div style={{ fontSize: 11, color: "var(--text-3)", marginTop: 3 }}>
                  {extrato.conciliados} conciliadas · {extrato.pendentes} pendentes{sugestoesPend.length > 0 ? ` · ${sugestoesPend.length} sugestões` : ""} · {pct}%
                  {pct === 100 && " — extrato conciliado por completo"}
                </div>
              </div>
              {fechamento && extrato.pendentes === 0 && (
                <div style={{ fontSize: 11, color: "var(--text-2)" }}>
                  Fechamento {fmtDt(fechamento.ini)} a {fmtDt(fechamento.fim)}: extrato {fmtBRL(saldo)} · sistema {fmtBRL(fechamento.sistema)}
                  {fechamento.fechada ? " — fecha" : <strong style={{ color: "#A93226" }}> — diferença {fmtBRL(fechamento.dif)}</strong>}
                </div>
              )}
              {sugestoesPend.length > 0 && (
                <button onClick={() => aceitarSugestoes(sugestoesPend)} disabled={salvando}
                  style={{ padding: "5px 12px", borderRadius: 7, border: "none", background: "#1A4870", color: "#fff", fontSize: 12, fontWeight: 600, cursor: salvando ? "default" : "pointer" }}>
                  Aceitar todas as sugestões ({sugestoesPend.length})
                </button>
              )}
              {migracaoOk && regras.some(r => r.ativa) && extrato.pendentes > 0 && (
                <button onClick={aplicarRegrasNaConta} disabled={aplicandoRegras}
                  style={{ padding: "5px 12px", borderRadius: 7, border: "0.5px solid #1A4870", background: "#fff", color: "#1A4870", fontSize: 12, fontWeight: 600, cursor: aplicandoRegras ? "default" : "pointer", opacity: aplicandoRegras ? 0.6 : 1 }}>
                  {aplicandoRegras ? "Aplicando…" : "Aplicar regras às pendentes"}
                </button>
              )}
            </div>

            {/* ═══ TELA DIVIDIDA — esquerda: sistema (CP/CR) · direita: extrato OFX ═══ */}
            <div style={{ display: "grid", gridTemplateColumns: abaSistema === "conferencia" ? "minmax(0,1fr)" : "minmax(0,1fr) minmax(0,1fr)", gap: 10, alignItems: "stretch", height: "calc(100vh - 176px)", minHeight: 440 }}>

              {/* ─── ESQUERDA: lançamentos do sistema ─────────────────────── */}
              <div style={{ background: "var(--bg-card)", borderRadius: 10, border: `1px solid ${linhaAtiva ? "#1A4870" : "var(--border)"}`, overflow: "hidden", minWidth: 0, minHeight: 0, display: "flex", flexDirection: "column" }}>
                {/* Abas do sistema */}
                <div style={{ display: "flex", gap: 4, padding: "8px 10px", borderBottom: "0.5px solid var(--border)", background: linhaAtiva ? "#EEF3F9" : "var(--bg-page)", flexWrap: "wrap" }}>
                  {([
                    ["conciliados", `Conciliados / baixados (${linhasConciliados.length})`],
                    ["abertos",     `CP/CR abertos (${linhasAbertos.length})`],
                    ["conferencia", `Conferência (${paresConf.length})`],
                  ] as const).map(([k, lbl]) => (
                    <button key={k} onClick={() => setAbaSistema(k)}
                      style={{ padding: "6px 12px", borderRadius: 8, border: `0.5px solid ${abaSistema === k ? "#1A4870" : "var(--border)"}`, background: abaSistema === k ? "#1A4870" : "var(--bg-card)", color: abaSistema === k ? "#fff" : "var(--text-2)", fontSize: 12, fontWeight: abaSistema === k ? 700 : 500, cursor: "pointer", whiteSpace: "nowrap" }}>
                      {lbl}
                    </button>
                  ))}
                  <button onClick={recarregarLancamentos} title="Atualizar lançamentos" disabled={lancRefresh}
                    style={{ marginLeft: "auto", background: "none", border: "0.5px solid var(--border)", borderRadius: 6, cursor: lancRefresh ? "default" : "pointer", fontSize: 13, color: "var(--text-2)", padding: "2px 8px", opacity: lancRefresh ? 0.5 : 1 }}>
                    {lancRefresh ? "…" : "↻"}
                  </button>
                </div>

                {/* Intervalo, tipo e busca */}
                <div style={{ padding: "8px 12px", borderBottom: "0.5px solid var(--border)", display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <span style={{ fontSize: 10, fontWeight: 700, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Período</span>
                  <input type="date" value={filtroLancDe} onChange={e => setFiltroLancDe(e.target.value)}
                    style={{ padding: "3px 6px", borderRadius: 6, border: "0.5px solid var(--border)", fontSize: 12, outline: "none" }} />
                  <span style={{ fontSize: 11, color: "var(--text-3)" }}>até</span>
                  <input type="date" value={filtroLancAte} onChange={e => setFiltroLancAte(e.target.value)}
                    style={{ padding: "3px 6px", borderRadius: 6, border: "0.5px solid var(--border)", fontSize: 12, outline: "none" }} />
                  <button onClick={() => { setFiltroLancDe(extrato.data_inicio); setFiltroLancAte(extrato.data_fim); }} title="Voltar ao intervalo do OFX aberto"
                    style={{ fontSize: 11, padding: "3px 9px", borderRadius: 6, border: "0.5px solid var(--border)", background: "var(--bg-card)", color: "var(--text-2)", cursor: "pointer" }}>Intervalo do OFX</button>
                  <div style={{ display: "flex", gap: 3, marginLeft: 4 }}>
                    {(["todos", "pagar", "receber"] as const).map(t => (
                      <button key={t} onClick={() => setFiltroLancTipo(t)}
                        style={{ fontSize: 11, padding: "3px 9px", borderRadius: 6, border: "0.5px solid var(--border)", background: filtroLancTipo === t ? "#111" : "var(--bg-card)", color: filtroLancTipo === t ? "#fff" : "var(--text-2)", cursor: "pointer", fontWeight: 600 }}>
                        {t === "todos" ? "Todos" : t === "pagar" ? "CP" : "CR"}
                      </button>
                    ))}
                  </div>
                  {abaSistema === "abertos" && (
                    <label title="Mostra também lançamentos e borderôs já baixados no Contas a Pagar que ainda não foram conciliados com o extrato"
                      style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, color: "var(--text-2)", cursor: "pointer", whiteSpace: "nowrap" }}>
                      <input type="checkbox" checked={incluirBaixados} onChange={e => setIncluirBaixados(e.target.checked)} /> Incluir baixados
                    </label>
                  )}
                  <input placeholder="Buscar fornecedor, descrição ou valor…" value={buscaLanc} onChange={e => setBuscaLanc(e.target.value)}
                    style={{ flex: "1 1 170px", minWidth: 150, padding: "4px 9px", borderRadius: 6, border: "0.5px solid var(--border)", fontSize: 12, outline: "none" }} />
                </div>
                <div style={{ padding: "5px 12px", fontSize: 11, color: "var(--text-3)", background: "var(--bg-page)", borderBottom: "0.5px solid var(--border)" }}>
                  {abaSistema === "conciliados" && "Lançamentos ligados a linhas deste extrato (baixados automaticamente ou à mão). Período por data de baixa."}
                  {abaSistema === "abertos" && (linhaAtiva
                    ? <>Passo 2: marque o(s) lançamento(s) da linha de <strong style={{ color: linhaAtiva.tipo === "debito" ? COR_NEG : "var(--text-1)" }}>{linhaAtiva.tipo === "debito" ? "−" : "+"}{fmtBRL(linhaAtiva.valor)}</strong>. Período por data de vencimento; a busca ignora o período.</>
                    : <>Passo 1: clique em <strong>Vincular</strong> numa linha do OFX. Em <span style={{ color: "#1A4870", fontWeight: 700 }}>destaque azul</span>, lançamentos de valor igual a uma linha pendente. Período por data de vencimento; a busca ignora o período.</>)}
                  {abaSistema === "conferencia" && "Cada linha conciliada do OFX com o(s) lançamento(s) ligado(s). Período por data do pagamento no OFX."}
                </div>

                {/* Conteúdo da aba */}
                {abaSistema !== "conferencia" ? (
                  <div style={{ overflowX: "auto", flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
                    <div style={{ minWidth: 760, flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
                      <div style={{ display: "grid", gridTemplateColumns: abaSistema === "abertos" ? COLS_SIS_ABERTOS : COLS_SIS_CONC, gap: 8, padding: "7px 10px", fontSize: 10, fontWeight: 700, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.04em", borderBottom: "0.5px solid var(--border)", background: "var(--bg-page)" }}>
                        {abaSistema === "abertos" && <div />}
                        <div>Vencim.</div><div>Baixa</div><div>Fornecedor / Cliente</div><div>Produtor da baixa</div><div>Conta de baixa</div><div>Tipo</div><div style={{ textAlign: "right" }}>Valor</div>
                        {abaSistema === "conciliados" && <div>Origem</div>}
                      </div>
                      <div style={{ flex: 1, minHeight: 0, overflowY: "auto" }}>
                        {(abaSistema === "abertos" ? linhasAbertos : linhasConciliados).slice(0, 300).map((l, i) => renderLinhaSistema(l, i, abaSistema))}
                        {(abaSistema === "abertos" ? linhasAbertos : linhasConciliados).length === 0 && (
                          <div style={{ padding: 28, textAlign: "center", color: "var(--text-3)", fontSize: 12 }}>
                            {abaSistema === "abertos" ? "Nenhum CP/CR aberto neste período." : "Nenhum lançamento conciliado neste período."}
                          </div>
                        )}
                        {(abaSistema === "abertos" ? linhasAbertos : linhasConciliados).length > 300 && (
                          <div style={{ padding: "8px 14px", textAlign: "center", fontSize: 11, color: "var(--text-3)", borderTop: "0.5px solid var(--bg-tag)" }}>
                            +{(abaSistema === "abertos" ? linhasAbertos : linhasConciliados).length - 300} ocultos — use a busca ou reduza o período
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ) : (
                  /* ── Conferência: sistema × OFX, em pares (largura total) ── */
                  <div style={{ overflowX: "auto", flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
                    <div style={{ minWidth: 980, flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", borderBottom: "0.5px solid var(--border)", background: "var(--bg-page)" }}>
                        <div style={{ padding: "7px 12px", fontSize: 10, fontWeight: 700, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.04em" }}>Sistema — baixados e conciliados</div>
                        <div style={{ padding: "7px 12px", fontSize: 10, fontWeight: 700, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.04em", borderLeft: "0.5px solid var(--border)" }}>Extrato OFX — linhas utilizadas</div>
                      </div>
                      <div style={{ flex: 1, minHeight: 0, overflowY: "auto" }}>
                        {paresConf.map(({ x, ls, alertas, grupos }) => {
                          const om = ORIGEM_META[x.origem_vinculo ?? "manual"] ?? ORIGEM_META.manual;
                          const GRID_L = "78px minmax(110px,1.5fr) minmax(90px,1fr) 88px 96px";
                          return (
                            <div key={x.id} style={{ borderBottom: "0.5px solid var(--border)" }}>
                              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr" }}>
                                <div>
                                  {ls.length === 0 && <div style={{ padding: "9px 12px", fontSize: 12, color: "var(--text-3)" }}>{x.lancamento_desc ?? "Lançamento não encontrado"}</div>}
                                  {grupos.map(g => {
                                    const l = g.l;
                                    const tb = tipoBaixaMeta(l);
                                    const lt = g.lote;
                                    const valor = lt ? valorLinhaSis(g) : Number(l.valor_pago ?? l.valor);
                                    const negativo = lt ? lt.tipo === "pagar" : l.tipo === "pagar";
                                    return (
                                      <div key={g.key}>
                                        <div style={{ display: "grid", gridTemplateColumns: GRID_L, gap: 8, alignItems: "center", padding: "7px 12px", fontSize: 12 }}>
                                          <div style={{ color: "var(--text-2)" }}>{lt?.data_pagamento ? fmtDt(lt.data_pagamento) : l.data_baixa ? fmtDt(l.data_baixa) : "—"}</div>
                                          <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontWeight: 600, color: "var(--text-1)" }} title={lt ? `Borderô${lt.descricao ? " · " + lt.descricao : ""}` : l.descricao}>
                                            {lt ? (
                                              <>
                                                <span style={{ fontSize: 9, fontWeight: 700, padding: "1px 5px", borderRadius: 6, background: "#E3EAF3", color: "#1A4870", marginRight: 5 }}>BORDERÔ</span>
                                                {g.comps.length} títulos{lt.descricao ? ` · ${lt.descricao}` : ""}
                                                <button onClick={() => setLotesAbertos(prev => { const n = new Set(prev); if (n.has(lt.id)) n.delete(lt.id); else n.add(lt.id); return n; })}
                                                  style={{ background: "none", border: "none", padding: 0, marginLeft: 6, fontSize: 10, color: "#1A4870", cursor: "pointer", textDecoration: "underline", fontWeight: 500 }}>
                                                  {lotesAbertos.has(lt.id) ? "ocultar" : "ver títulos"}
                                                </button>
                                              </>
                                            ) : fornecedorDe(l)}
                                          </div>
                                          <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "var(--text-2)" }} title="Conta de baixa">{contaNomeDe(lt?.conta_bancaria ?? l.conta_bancaria)}</div>
                                          <div style={{ display: "flex", alignItems: "center", gap: 5 }}><Sinal cor={COR_OK} titulo="Conciliado" /><span style={{ fontSize: 10, fontWeight: tb.w, padding: "2px 6px", borderRadius: 6, background: tb.bg, color: tb.c }}>{lt ? "Baixado" : tb.t}</span></div>
                                          <div style={{ textAlign: "right", fontWeight: 700, fontVariantNumeric: "tabular-nums", color: negativo ? COR_NEG : "var(--text-1)" }}>{negativo ? "−" : "+"}{fmtBRL(valor)}</div>
                                        </div>
                                        {lt && lotesAbertos.has(lt.id) && (
                                          <div style={{ background: "var(--bg-page)", padding: "3px 12px 6px 30px" }}>
                                            {g.comps.map(c => (
                                              <div key={c.id} style={{ display: "flex", justifyContent: "space-between", gap: 10, fontSize: 11, color: "var(--text-2)", padding: "1px 0" }}>
                                                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{fmtDt(c.data_vencimento)} · {fornecedorDe(c)}</span>
                                                <span style={{ fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>{fmtBRL(valorParaLinha(c))}</span>
                                              </div>
                                            ))}
                                          </div>
                                        )}
                                      </div>
                                    );
                                  })}
                                </div>
                                <div style={{ borderLeft: "0.5px solid var(--border)", display: "grid", gridTemplateColumns: "78px minmax(120px,1.6fr) 96px 110px 84px", gap: 8, alignItems: "center", padding: "7px 12px", fontSize: 12 }}>
                                  <div style={{ color: "var(--text-2)" }}>{fmtDt(x.data)}</div>
                                  <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "var(--text-1)" }} title={x.descricao}>{x.descricao}</div>
                                  <div style={{ textAlign: "right", fontWeight: 700, fontVariantNumeric: "tabular-nums", color: x.tipo === "debito" ? COR_NEG : "var(--text-1)" }}>{x.tipo === "credito" ? "+" : "−"}{fmtBRL(x.valor)}</div>
                                  <div><span style={{ fontSize: 10, fontWeight: 500, padding: "2px 7px", borderRadius: 6, background: om.bg, color: om.cor, whiteSpace: "nowrap" }}>{om.label}{x.confianca === "media" ? " · média" : ""}</span></div>
                                  <div style={{ textAlign: "right" }}>
                                    <button onClick={() => desvincular(x.id)}
                                      style={{ padding: "3px 8px", borderRadius: 6, border: "0.5px solid var(--border)", background: "var(--bg-card)", color: "var(--text-3)", fontSize: 11, cursor: "pointer", whiteSpace: "nowrap" }}>Desvincular</button>
                                  </div>
                                </div>
                              </div>
                              {alertas.length > 0 && (
                                <div style={{ padding: "0 12px 7px", display: "flex", gap: 6, flexWrap: "wrap" }}>
                                  {alertas.map(a => <span key={a} style={{ fontSize: 10, fontWeight: 600, color: "#A93226", background: "#FDF1F0", borderRadius: 6, padding: "1px 7px" }}>Atenção: {a}</span>)}
                                </div>
                              )}
                            </div>
                          );
                        })}
                        {paresConf.length === 0 && (
                          <div style={{ padding: 28, textAlign: "center", color: "var(--text-3)", fontSize: 12 }}>Nenhuma linha conciliada neste período.</div>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {/* Soma dos selecionados × linha ativa e confirmação (aba de abertos) */}
                {abaSistema === "abertos" && linhaAtiva && lancsSel.size > 0 && (() => {
                  const sel = Array.from(lancsSel).map(id => lancamentos.find(x => x.id === id)).filter((l): l is Lancamento => !!l);
                  const esperado = sel.reduce((sm, l) => sm + valorParaLinha(l), 0);
                  const dif = Math.round((linhaAtiva.valor - esperado) * 100) / 100;
                  const parcial = sel.length === 1 && dif < -0.02;
                  const ok = Math.abs(dif) <= 0.02;
                  return (
                    <div style={{ padding: "6px 14px", fontSize: 11, display: "flex", justifyContent: "space-between", gap: 8, background: "var(--bg-page)", color: "var(--text-2)", borderTop: "0.5px solid var(--border)" }}>
                      <span>Linha {fmtBRL(linhaAtiva.valor)} · Lançamentos {fmtBRL(esperado)}</span>
                      <strong style={{ color: ok || parcial ? "var(--text-1)" : "#A93226" }}>{ok ? "Diferença R$ 0,00" : parcial ? `Baixa parcial — saldo ficará ${fmtBRL(Math.abs(dif))}` : `Diferença ${fmtBRL(Math.abs(dif))} — exige motivo`}</strong>
                    </div>
                  );
                })()}
                {abaSistema === "abertos" && (linhaAtiva || lancsSel.size > 0) && (
                  <div style={{ padding: "8px 14px", background: "#1A4870", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 12, color: "#fff", fontWeight: 600 }}>
                      {lancsSel.size} selecionado{lancsSel.size !== 1 ? "s" : ""}{lancsSel.size > 1 ? " (bordero)" : ""}
                      {!linhaAtiva && " — clique em Vincular numa linha do OFX"}
                    </span>
                    <div style={{ display: "flex", gap: 6 }}>
                      <button onClick={() => { setLancsSel(new Set()); setLinhaAtiva(null); }}
                        style={{ fontSize: 11, padding: "3px 9px", background: "transparent", color: "rgba(255,255,255,0.8)", border: "0.5px solid rgba(255,255,255,0.35)", borderRadius: 6, cursor: "pointer" }}>Cancelar</button>
                      {linhaAtiva && lancsSel.size > 0 && (
                        <button onClick={() => confirmarVinculo()} disabled={salvando}
                          style={{ fontSize: 11, padding: "3px 12px", background: "#fff", color: "#1A4870", border: "none", borderRadius: 6, cursor: salvando ? "default" : "pointer", fontWeight: 700 }}>
                          {btnConfirmarLabel}
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* ─── DIREITA: extrato OFX ─────────────────────────────────── */}
              {abaSistema !== "conferencia" && (
              <div style={{ background: "var(--bg-card)", borderRadius: 10, border: "0.5px solid var(--border)", overflow: "hidden", minWidth: 0, minHeight: 0, display: "flex", flexDirection: "column" }}>
                <div style={{ padding: "8px 12px", borderBottom: "0.5px solid var(--border)", background: "var(--bg-page)", display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-1)", whiteSpace: "nowrap" }}>Extrato OFX · {fmtDt(extrato.data_inicio)} a {fmtDt(extrato.data_fim)}</div>
                  <input placeholder="Buscar descrição ou FITID…" value={busca} onChange={e => setBusca(e.target.value)}
                    style={{ flex: "1 1 130px", minWidth: 110, padding: "4px 9px", borderRadius: 6, border: "0.5px solid var(--border)", fontSize: 12, outline: "none" }} />
                  <input placeholder="Valor…" value={buscaValor} onChange={e => setBuscaValor(e.target.value)}
                    style={{ width: 84, padding: "4px 9px", borderRadius: 6, border: "0.5px solid var(--border)", fontSize: 12, outline: "none" }} />
                  <label style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12, cursor: "pointer", color: "var(--text-2)", whiteSpace: "nowrap" }}>
                    <input type="checkbox" checked={filtroPend} onChange={e => setFiltroPend(e.target.checked)} /> Só pendentes
                  </label>
                  <span style={{ marginLeft: "auto", fontSize: 11, color: "var(--text-3)", whiteSpace: "nowrap" }}>{linhasFiltradas.length} de {extrato.total_linhas}</span>
                </div>

                {selecaoMultipla.size > 0 && (
                  <div style={{ padding: "7px 12px", borderBottom: "0.5px solid var(--border)", background: "#EEF3F9", display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                    <span style={{ fontSize: 12, color: "#1A4870", fontWeight: 600 }}>
                      {selecaoMultipla.size} linha{selecaoMultipla.size > 1 ? "s" : ""} selecionada{selecaoMultipla.size > 1 ? "s" : ""}
                      {selecaoMultipla.size > 1 && ` · Total ${fmtBRL(Array.from(selecaoMultipla).reduce((sm, id) => sm + (extrato.linhas.find(l => l.id === id)?.valor ?? 0), 0))}`}
                    </span>
                    <button disabled={selecaoMultipla.size < 2}
                      onClick={() => { setDescAgrupado(""); setOgAgrupado(""); setModalAgrupado(true); }}
                      title={selecaoMultipla.size < 2 ? "Selecione pelo menos 2 linhas" : undefined}
                      style={{ padding: "4px 12px", borderRadius: 6, border: "0.5px solid #1A4870", background: selecaoMultipla.size < 2 ? "var(--bg-card)" : "#1A4870", color: selecaoMultipla.size < 2 ? "#1A4870" : "#fff", fontSize: 11, fontWeight: 600, cursor: selecaoMultipla.size < 2 ? "default" : "pointer" }}>
                      Lançar CP/CR agrupado
                    </button>
                    <button onClick={() => setSelecaoMultipla(new Set())}
                      style={{ padding: "4px 10px", borderRadius: 6, border: "0.5px solid var(--border)", background: "var(--bg-card)", color: "var(--text-3)", fontSize: 11, cursor: "pointer" }}>Limpar</button>
                  </div>
                )}

                <div style={{ overflowX: "auto", flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
                  <div style={{ minWidth: 640, flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
                    <div style={{ display: "grid", gridTemplateColumns: COLS_OFX, gap: 8, padding: "7px 10px", fontSize: 10, fontWeight: 700, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.04em", borderBottom: "0.5px solid var(--border)", background: "var(--bg-page)" }}>
                      <div>Data pagto.</div><div>Histórico</div><div style={{ textAlign: "right" }}>Valor</div><div>Situação</div><div>Ação</div>
                    </div>
                    <div style={{ flex: 1, minHeight: 0, overflowY: "auto" }}>
                      {linhasFiltradas.map(l => {
                        const isAtiva = linhaAtiva?.id === l.id;
                        const bate = linhaBateComSelecao(l);
                        const sug = !l.conciliado && l.sugestao_lancamento_id ? lancamentos.find(x => x.id === l.sugestao_lancamento_id) : undefined;
                        const o = ORIGEM_META[l.origem_vinculo ?? "manual"] ?? ORIGEM_META.manual;
                        const reg = l.regra_id ? regras.find(r => r.id === l.regra_id) : undefined;
                        return (
                          <div key={l.id} style={{
                            display: "grid", gridTemplateColumns: COLS_OFX, gap: 8, alignItems: "center", padding: "7px 10px", fontSize: 12,
                            borderBottom: "0.5px solid var(--bg-tag)",
                            background: isAtiva ? "#DCE6F2" : bate ? "#EEF3F9" : "transparent",
                            borderLeft: bate || isAtiva ? "3px solid #1A4870" : "3px solid transparent",
                          }}>
                            <div style={{ color: "var(--text-2)", whiteSpace: "nowrap" }}>
                              {!l.conciliado && (
                                <input type="checkbox" checked={selecaoMultipla.has(l.id)}
                                  onChange={e => setSelecaoMultipla(prev => { const n = new Set(prev); if (e.target.checked) n.add(l.id); else n.delete(l.id); return n; })}
                                  style={{ marginRight: 5, verticalAlign: "middle", cursor: "pointer" }} title="Selecionar para lançamento agrupado" />
                              )}
                              {fmtDt(l.data)}
                            </div>
                            <div style={{ minWidth: 0 }} title={`${l.descricao} · FITID ${l.id}`}>
                              <div style={{ fontWeight: 500, color: "var(--text-1)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{l.descricao}</div>
                              {l.conciliado && l.lancamento_desc && (
                                <div style={{ fontSize: 10, color: "var(--text-3)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                  → {l.lancamento_desc}{(l.lancamento_ids?.length ?? 0) > 1 ? ` (bordero ${l.lancamento_ids!.length})` : ""}
                                </div>
                              )}
                              {sug && (
                                <div style={{ fontSize: 10, color: "var(--text-3)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                                  title={l.sugestao_motivo ? `Confirmar porque: ${l.sugestao_motivo}` : undefined}>
                                  Sugestão: {sug.descricao} · {fmtBRL(valorRestante(sug))}{l.sugestao_motivo ? ` · ${l.sugestao_motivo}` : ""}
                                </div>
                              )}
                            </div>
                            <div style={{ textAlign: "right", whiteSpace: "nowrap", fontWeight: 700, fontVariantNumeric: "tabular-nums", color: l.tipo === "debito" ? COR_NEG : "var(--text-1)" }}>
                              {l.tipo === "credito" ? "+" : "−"}{fmtBRL(l.valor)}
                            </div>
                            <div>
                              {l.conciliado ? (
                                <div style={{ display: "flex", flexDirection: "column", gap: 3, alignItems: "flex-start" }}>
                                  <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11, fontWeight: 600, color: "var(--text-1)", whiteSpace: "nowrap" }}><Sinal cor={COR_OK} />Conciliado</span>
                                  <span title={l.confianca ? `Confiança ${l.confianca}` : undefined} style={{ padding: "1px 6px", borderRadius: 6, fontSize: 9, fontWeight: 500, background: o.bg, color: o.cor, whiteSpace: "nowrap" }}>
                                    {o.label}{reg ? `: ${reg.texto}` : ""}{l.confianca === "media" ? " · média" : ""}
                                  </span>
                                </div>
                              ) : sug ? (
                                <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11, fontWeight: 600, color: "var(--text-1)", whiteSpace: "nowrap" }}><Sinal cor={COR_PEND} />Sugestão</span>
                              ) : (
                                <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11, fontWeight: 600, color: "var(--text-1)", whiteSpace: "nowrap" }}><Sinal cor={COR_PEND} />Pendente</span>
                              )}
                            </div>
                            <div>
                              {l.conciliado ? (
                                <button onClick={() => { desvincular(l.id); if (isAtiva) { setLinhaAtiva(null); setLancsSel(new Set()); } }}
                                  style={{ padding: "3px 8px", borderRadius: 6, border: "0.5px solid var(--border)", background: "var(--bg-card)", color: "var(--text-3)", fontSize: 11, cursor: "pointer", whiteSpace: "nowrap" }}>Desvincular</button>
                              ) : (
                                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                                  {sug && !isAtiva && (
                                    <div style={{ display: "flex", gap: 4 }}>
                                      <button disabled={salvando} onClick={() => aceitarSugestoes([l])}
                                        style={{ padding: "3px 8px", borderRadius: 6, border: "none", background: "#1A4870", color: "#fff", fontSize: 11, fontWeight: 700, cursor: salvando ? "default" : "pointer", whiteSpace: "nowrap" }}>Aceitar</button>
                                      <button disabled={salvando} onClick={() => ignorarSugestao(l)} title="Descartar a sugestão"
                                        style={{ padding: "3px 7px", borderRadius: 6, border: "0.5px solid var(--border)", background: "var(--bg-card)", color: "var(--text-3)", fontSize: 11, cursor: "pointer" }}>✕</button>
                                    </div>
                                  )}
                                  <button disabled={salvando}
                                    onClick={() => {
                                      if (isAtiva) { setLinhaAtiva(null); return; }
                                      setAbaSistema("abertos");
                                      if (lancsSel.size > 0) { setLinhaAtiva(l); confirmarVinculo(l); }
                                      else setLinhaAtiva(l);
                                    }}
                                    style={{ padding: "3px 9px", borderRadius: 6, border: "0.5px solid #1A4870", background: isAtiva || lancsSel.size > 0 ? "#1A4870" : "#fff", color: isAtiva || lancsSel.size > 0 ? "#fff" : "#1A4870", fontSize: 11, fontWeight: 600, cursor: salvando ? "default" : "pointer", whiteSpace: "nowrap" }}>
                                    {isAtiva && salvando ? "Salvando…" : isAtiva ? "Cancelar" : lancsSel.size > 0 ? `↗ Vincular (${lancsSel.size})` : "Vincular"}
                                  </button>
                                  {!isAtiva && (
                                    <button onClick={() => abrirTesouraria(l)}
                                      style={{ padding: "2px 8px", borderRadius: 6, border: "0.5px solid var(--border)", background: "var(--bg-card)", color: "var(--text-2)", fontSize: 10, cursor: "pointer", whiteSpace: "nowrap" }}>+ Tesouraria</button>
                                  )}
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                      {linhasFiltradas.length === 0 && (
                        <div style={{ padding: 28, textAlign: "center", color: "var(--text-3)", fontSize: 13 }}>Nenhuma transação encontrada.</div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
              )}
            </div>

          </>
        )}
      </div>
    </div>
  );
}
