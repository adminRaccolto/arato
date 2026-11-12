"use client";
import { useClienteRelatorio } from "../../components/useClienteRelatorio";
import { gerarArquivoLCDPR } from "../../lib/lcdpr/arquivo";
import { htmlLCDPR, selecionarMovimentos, motivosMovimento, valorCaixa, textoLCDPR, numeroContaLCDPR, validarParticipantes, type MotivoLCDPR, type ParticipanteLCDPR } from "../../lib/lcdpr/modelo";
import { lerPaginas } from "../../lib/paginar";
import { fetchFinanceiro } from "../../lib/financeiro/requisicao";
import { hojeLocal } from "../../lib/data-local";
import { OperationalButton, OperationalGrid, OperationalHeading } from "../../components/OperationalUI";
import SelectField from "../../components/SelectField";
import InputData from "../../components/InputData";
import { confirmarAcao } from "../../components/ConfirmarAcao";
import { useState, useEffect, useMemo, useRef } from "react";
import TopNav from "../../components/TopNav";
import InputNumerico from "../../components/InputNumerico";
import { useAuth } from "../../components/AuthProvider";
import {
  listarLancamentos,
  listarProdutoresDaConta,
  listarEmpresasDaConta,
} from "../../lib/db";
import { supabase } from "../../lib/supabase";
import type { Lancamento } from "../../lib/supabase";
import PlanoGate from "../../components/PlanoGate";
import { abrirPreviewImpressao, nomeRelatorio } from "../../lib/print";

// ─── Leiaute oficial do LCDPR — Anexo ao Ato Declaratório Executivo COPES nº
// 1/2020 (leiaute 1.3), confirmado registro a registro contra o Manual de
// Preenchimento publicado em gov.br/receitafederal. O arquivo tem só 3 blocos:
// Bloco 0 (0000/0010/0030/0040/0045/0050), Bloco Q (Q100/Q200), Bloco 9 (9999).
// Não existem os registros "LC01/LC10/LC20/LC99" nem um esquema de 10
// categorias de receita/despesa — o único campo de classificação real é
// Q100.TIPO_LANC, com apenas 3 valores possíveis.

const COD_VERSAO = "0013"; // leiaute 1.3

// Tipo de Documento (Q100.TIPO_DOC) — 6 valores oficiais
const TIPO_DOC_LABEL: Record<string, string> = {
  "1": "Nota Fiscal", "2": "Fatura", "3": "Recibo",
  "4": "Contrato", "5": "Folha de Pagamento", "6": "Outros",
};
function mapTipoDoc(s?: string): string {
  if (["1","2","3","4","5","6"].includes(s ?? "")) return s!;
  const l = (s ?? "").toUpperCase();
  if (l === "NF" || l.includes("NOTA FISCAL")) return "1";
  if (l === "FATURA" || l === "DUPLICATA") return "2";
  if (l === "RECIBO") return "3";
  if (l === "CONTRATO") return "4";
  if (l === "FOLHA" || l.includes("FOLHA")) return "5";
  return "6"; // BOLETO, CHEQUE, PIX, TED, OUTROS e qualquer valor não mapeado
}

// Tipo de Lançamento (Q100.TIPO_LANC) — o único código de classificação que
// existe de verdade no arquivo. 1=Receita · 2=Despesa (custeio+investimento) ·
// 3=Receita de produtos entregues no ano referente a adiantamento (barter).
function tipoLancDe(l: Lancamento): "1" | "2" | "3" {
  if (l.tipo === "receber" && l.moeda === "barter") return "3";
  return l.tipo === "receber" ? "1" : "2";
}

// Categorias de movimentação interna — não são receita/despesa real, é só
// dinheiro trocando de mão entre as próprias contas do cliente. Nunca entram
// no Livro Caixa do LCDPR nem no relatório PDF.
// "Mútuo entre Empresas" — Financeiro → Tesouraria, entre produtores/empresas.
// "Transferência entre Contas" — Tesouraria (entre contas do mesmo produtor)
// E também usada pela Conciliação Bancária ao casar um PIX do extrato — achado
// real: 21 lançamentos "RECEBIMENTO PIX... EDINEIA OGLIARI PINHATA" (outra
// produtora da mesma conta) todos categorizados assim, não como Mútuo.
const CATEGORIAS_INTERNAS = new Set(["Mútuo entre Empresas", "Transferência entre Contas"]);

// ─── Interfaces ──────────────────────────────────────────────────────────────

interface ConfigLCDPR {
  participacoes: Record<string, number>;   // cpf_numerico → % (0-100)
  saldos_iniciais: Record<string, number>; // "AAAA" → R$
}
const CONFIG_VAZIA: ConfigLCDPR = { participacoes: {}, saldos_iniciais: {} };

interface EntradaLCDPR {
  atualizadoEm?:string;tipoDocOriginal?:string|null;
  importacao_ref?:string;
  id: string;
  data: string;
  historico: string;
  tipoDoc: string;      // "1"–"6"
  numDoc: string;
  cpfCnpj: string;
  tipoLanc: "1" | "2" | "3";
  fazendaId: string;
  contaBancariaRef: string; // valor bruto de lancamentos.conta_bancaria (uuid ou texto)
  receita: number;
  despesa: number;
  origem: "auto" | "manual" | "importado";
  lancId?: string;
  produtorId?: string | null;   // dono do lançamento — do próprio lançamento, senão herda da fazenda
  produtorCpf?: string;
  compartilhada?: boolean;
  produtorNome?: string;        // resolvido pra exibir no relatório "Todos os Produtores"
  ogClassificacao?: string;     // Operação Gerencial vinculada — só usado na coluna "O.G." do PDF/XLSX
  ogDescricao?: string;
}

interface ProdutorLcdpr { id: string; nome: string; cpf: string; logradouro?:string; numero_end?:string; complemento?:string; bairro?:string; estado?:string; municipio_ibge?:string; cep?:string; }

interface FazLcdpr {
  id: string; nome: string;
  produtor_id: string | null;
  cpf_cnpj_fiscal: string | null;
  nirf: string | null; itr: string | null; municipio: string | null;
  estado: string | null; area_total_ha: number | null;
  caepf: string | null;
  tipo_exploracao: number | null;
  participacao_lcdpr: number | null;
  lcdpr_participantes?: ParticipanteLCDPR[];
  lcdpr_responsavel?: boolean;
  municipio_ibge: string | null;
  arrendada?: boolean | null;
  cep: string | null; logradouro: string | null; numero_end: string | null;
  complemento: string | null; bairro: string | null;
}

interface ContaLcdpr {
  id: string;
  nome: string;
  banco: string | null;
  banco_id: string | null;
  codigo_bacen: string | null;
  agencia: string | null;
  conta: string | null;
  conta_dv: string | null;
  tipo_conta: string;
  produtor_id: string | null;
  fazenda_id: string;
}

interface ContadorInfo {
  nome: string; cpf_cnpj: string; crc: string; email: string; telefone: string;
}
const CONTADOR_VAZIO: ContadorInfo = { nome: "", cpf_cnpj: "", crc: "", email: "", telefone: "" };

interface ImportRow {
  importacaoRef?:string;
  data: string; historico: string; tipoDoc: string;
  cpfCnpj: string; tipo: "receber" | "pagar"; valor: number;
  _status: "ok" | "erro"; _msg: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const anoAtual = new Date().getFullYear();
const ANOS     = [anoAtual - 2, anoAtual - 1, anoAtual, anoAtual + 1];
const fmtBRL   = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fmtData  = (s: string) => { const [y, m, d] = (s ?? "").split("-"); return `${d}/${m}/${y}`; };
const cpfNum   = (s: string) => (s ?? "").replace(/\D/g, "");
const hoje     = () => hojeLocal();
// Normaliza texto pra comparação (maiúsculas, sem acento) — usado pra detectar
// transferência entre produtores/empresas da mesma conta pelo nome quando o
// lançamento não tem pessoa_id vinculado (ex: PIX importado do extrato, cujo
// histórico só traz o nome de quem pagou/recebeu em texto livre).
const normTxt  = (s: string) => (s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase();
const fmtCPF   = (s: string) => s.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
// Formatação de valor monetário/numérico pro leiaute: sem separador de milhar,
// vírgula decimal removida, sempre 2 casas. Ex: 1129998,99 -> "112999899"
const fmtValorLC = (v: number) => Math.round((v ?? 0) * 100).toString();
const fmtDataLC  = (iso: string) => { if (!iso || iso.length < 10) return ""; const [y, m, d] = iso.split("-"); return `${d}${m}${y}`; };
const TIPO_EXPLORACAO_LABEL: Record<number, string> = {
  1: "Individual (imóvel próprio)", 2: "Condomínio", 3: "Imóvel arrendado",
  4: "Parceria", 5: "Comodato", 6: "Outros",
};

type Aba = "livro" | "participacoes" | "cadastro" | "importacao" | "exportacao" | "auditoria";

// Motivo pelo qual um lançamento pago (baixado/parcial), de uma fazenda PF,
// não entra no Livro Caixa do LCDPR — cada um corresponde a uma regra real do
// filtro de elegibilidade abaixo. Um item pode ter mais de um motivo.
type MotivoExclusaoLcdpr = MotivoLCDPR;

interface ItemAuditoriaLcdpr {
  lancamento: Lancamento;
  motivos: MotivoExclusaoLcdpr[];
  incluido: boolean;
  produtorNome: string;
  competencia: string; // "YYYY-MM"
}

const MOTIVO_LABEL: Record<MotivoExclusaoLcdpr, string> = {
  apoio_baixa:       "Baixa de apoio (não é caixa próprio)",
  entidade_pj:       "Entidade Contábil do lançamento = PJ",
  titular_pj:        "Titular do lançamento é PJ (CNPJ)",
  categoria_interna: "Categoria interna (Mútuo/Transferência)",
  previsao: "Previsão não efetivada",
  data_ausente: "Data da baixa não informada — confira no financeiro",
  compensacao: "Compensação de crédito — confira o tratamento da origem",
  titular_ausente:"Sem titular identificado — corrigir produtor ou cadastro do imóvel",
  parcial_legado: "Parcial histórico acumulado — conferir eventos de pagamento",
  valor_invalido: "Valor de caixa ausente ou inválido",
  vinculo_nao_rural: "Vínculo de Atividade ≠ Rural",
};

// ═════════════════════════════════════════════════════════════════════════════
export default function LCDPR() {
  const { fazendaId, fazendaIds, contaId, contaNome: contaNomeAuth, podeAcessarPlano } = useAuth();
  const clienteRelatorio = useClienteRelatorio();   // nome da conta (cliente) para o nome dos relatórios
  // Busca contas.nome pelo contaId desta tela (não pelo do AuthProvider) —
  // um raccotlo navegando pela conta de um cliente tem conta_id NULL no
  // próprio perfil, então useAuth().contaNome nunca carrega pra ele, mesmo
  // com os dados do cliente certos aparecendo em todo o resto da tela.
  const [contaNomeFetch, setContaNomeFetch] = useState<string | null>(null);
  const contaNome = contaNomeFetch ?? contaNomeAuth;

  const [aba, setAba]         = useState<Aba>("livro");
  const [anoSel, setAnoSel]   = useState(anoAtual);
  const [erroCarga,setErroCarga] = useState("");
  const [novoProdutorId,setNovoProdutorId] = useState("");
  const [novoImovelId,setNovoImovelId] = useState("");
  const [gravandoMovimento,setGravandoMovimento] = useState(false);
  const [versaoMovimentos,setVersaoMovimentos] = useState(0);
  const [loading, setLoading] = useState(true);
  const [entradas, setEntradas] = useState<EntradaLCDPR[]>([]);
  const [auditoriaLcdpr, setAuditoriaLcdpr] = useState<ItemAuditoriaLcdpr[]>([]);
  const [filtroAuditoria, setFiltroAuditoria] = useState<"todos" | "incluidos" | "excluidos">("excluidos");
  const [mesAuditoria, setMesAuditoria] = useState<string>("todos"); // "todos" ou "01".."12"

  const [config, setConfig]       = useState<ConfigLCDPR>(CONFIG_VAZIA);
  const [configFazendaId, setConfigFazendaId] = useState<string | null>(null); // onde a config do cliente está gravada
  const [savingCfg, setSavingCfg] = useState(false);

  const [fazDados, setFazDados]               = useState<FazLcdpr[]>([]);
  const [produtoresDados, setProdutoresDados] = useState<ProdutorLcdpr[]>([]);
  const [contasDados, setContasDados]         = useState<ContaLcdpr[]>([]);
  const [bancosMap, setBancosMap]             = useState<Map<string, string>>(new Map()); // nome normalizado → codigo_compe
  const [pessoasCpfMap, setPessoasCpfMap]     = useState<Map<string, string>>(new Map()); // pessoa_id → cpf_cnpj
  const [ogMap, setOgMap]                     = useState<Map<string, { classificacao: string; descricao: string }>>(new Map()); // operacao_gerencial_id → OG — só usado na coluna "O.G." do PDF/XLSX

  const [contador, setContador]         = useState<ContadorInfo>(CONTADOR_VAZIO);
  const [savingContador, setSavingContador] = useState(false);
  const [fazEdit, setFazEdit]           = useState<Map<string, Partial<FazLcdpr>>>(new Map());
  const [savingFazIds, setSavingFazIds] = useState<Set<string>>(new Set());

  const [modalManual, setModalManual] = useState(false);
  const [fManual, setFManual] = useState({
    data: hoje(), historico: "", tipoDoc: "6", cpfCnpj: "",
    valor: 0, tipo: "receita" as "receita" | "despesa",
  });

  const importRef = useRef<HTMLInputElement>(null);
  const [importRows, setImportRows]         = useState<ImportRow[]>([]);
  const [importLoading, setImportLoading]   = useState(false);
  const [importFeedback, setImportFeedback] = useState("");

  const [produtorFiltro, setProdutorFiltro] = useState("todos");
  const [modoExport, setModoExport]         = useState<"anual" | "mensal">("anual");
  const [mesExport, setMesExport]           = useState(new Date().getMonth() + 1);
  const [formatoExport, setFormatoExport]   = useState<"txt" | "xlsx" | "pdf">("txt");

  useEffect(()=>{setProdutorFiltro("todos");setNovoProdutorId("");setNovoImovelId("");setImportRows([]);setModalManual(false);},[contaId,fazendaIds?.join(",")]);

  // ── Carga principal ────────────────────────────────────────────────────────
  useEffect(() => {
    let ativo = true;
    setEntradas([]); setAuditoriaLcdpr([]); setFazDados([]); setProdutoresDados([]); setContasDados([]); setContador(CONTADOR_VAZIO); setErroCarga("");
    const ids = fazendaIds?.length ? fazendaIds : fazendaId ? [fazendaId] : [];
    if (!ids.length) {setLoading(false);return;}
    setLoading(true);
    const sb = supabase;

    Promise.all([
      Promise.all(ids.map(fid => listarLancamentos(fid))).then(all => all.flat()),
      sb.from("apoio_baixas").select("lancamento_id").in("fazenda_id", ids).throwOnError(),
      sb.from("fazendas").select("id,nome,produtor_id,cpf_cnpj_fiscal,nirf,itr,municipio,estado,area_total_ha,arrendada,cep,logradouro,numero_end,complemento,bairro,caepf,tipo_exploracao,participacao_lcdpr,municipio_ibge,entidade_contabil,lcdpr_participantes,lcdpr_responsavel").in("id", ids).throwOnError(),
      contaId ? listarProdutoresDaConta(contaId) : Promise.resolve([]),
      // Configuração do LCDPR é do cliente: lê a cópia de qualquer fazenda dele.
      sb.from("configuracoes_modulo").select("config, fazenda_id").in("fazenda_id", ids).eq("modulo", "lcdpr").order("fazenda_id").limit(1).maybeSingle().throwOnError(),
      lerPaginas((a,b)=>sb.from("contas_bancarias").select("id,nome,banco,banco_id,codigo_bacen,agencia,conta,conta_dv,tipo_conta,produtor_id,cotitulares,fazenda_id").in("fazenda_id", ids).order("id").range(a,b)).then(data=>({data})),
      sb.from("bancos").select("nome,nome_curto,codigo_compe").throwOnError(),
      lerPaginas((a,b)=>sb.from("pessoas").select("id,cpf_cnpj").in("fazenda_id", ids).order("id").range(a,b)).then(data=>({data})),
      contaId ? sb.from("lcdpr_contador").select("*").eq("conta_id", contaId).maybeSingle().throwOnError() : Promise.resolve({ data: null }),
      listarEmpresasDaConta(ids),
      contaId ? sb.from("contas").select("nome").eq("id", contaId).maybeSingle().throwOnError() : Promise.resolve({ data: null }),
      // OGs ficam gravadas por fazenda_id (conta_id nulo) — filtrar só por conta_id/globais
      // deixava a coluna O.G. em branco. Paginado: passa de 1.000 linhas.
      (async () => {
        const filtro = [`fazenda_id.in.(${ids.join(",")})`, "and(fazenda_id.is.null,conta_id.is.null)", ...(contaId ? [`conta_id.eq.${contaId}`] : [])].join(",");
        const rows: { id: string; classificacao: string; descricao: string }[] = [];
        for (let from = 0; ; from += 1000) {
          const { data, error } = await sb.from("operacoes_gerenciais").select("id,classificacao,descricao").or(filtro).order("id").range(from, from + 999);
          if(error) throw error;
          rows.push(...((data ?? []) as typeof rows));
          if (!data || data.length < 1000) break;
        }
        return { data: rows };
      })(),
      lerPaginas((a,b)=>sb.from("lcdpr_movimentos").select("id,dados,updated_at").in("fazenda_id",ids).eq("excluido",false).gte("data",String(anoSel)+"-01-01").lte("data",String(anoSel)+"-12-31").order("id").range(a,b)).then(data=>({data})),
    ]).then(([lans, { data: apoioBaixas }, { data: fazRows }, prodRows, { data: cfgRow }, { data: contasRows }, { data: bancosRows }, { data: pessoasRows }, { data: contadorRow }, empresasRows, { data: contaRow }, { data: ogRows }, { data: manuais }]) => {
      if(!ativo) return;
      setFazDados((fazRows ?? []) as FazLcdpr[]);
      setContaNomeFetch((contaRow as { nome?: string } | null)?.nome ?? null);
      setProdutoresDados(
        (prodRows ?? [])
          .map((p: { id: string; nome: string; cpf_cnpj?: string }) => ({...p, id: p.id, nome: p.nome, cpf: cpfNum(p.cpf_cnpj ?? ""), numero_end:(p as {numero?:string}).numero}))
          .filter((p: ProdutorLcdpr) => p.cpf.length === 11)
      );
      setConfig((cfgRow as { config?: ConfigLCDPR } | null)?.config ?? CONFIG_VAZIA);
      setConfigFazendaId((cfgRow as { fazenda_id?: string } | null)?.fazenda_id ?? null);
      setContasDados((contasRows ?? []) as ContaLcdpr[]);

      const bMap = new Map<string, string>();
      for (const b of (bancosRows ?? []) as { nome: string; nome_curto?: string; codigo_compe: string }[]) {
        bMap.set(b.nome.toLowerCase(), b.codigo_compe);
        if (b.nome_curto) bMap.set(b.nome_curto.toLowerCase(), b.codigo_compe);
      }
      setBancosMap(bMap);

      const pMap = new Map<string, string>();
      for (const p of (pessoasRows ?? []) as { id: string; cpf_cnpj?: string }[]) if (p.cpf_cnpj) pMap.set(p.id, p.cpf_cnpj);
      setPessoasCpfMap(pMap);

      // Operação Gerencial vinculada a cada lançamento — só usada na coluna
      // "O.G." das exportações PDF/XLSX (não entra no arquivo oficial nem na
      // tela do Livro Caixa).
      const ogMapLocal = new Map<string, { classificacao: string; descricao: string }>();
      for (const o of (ogRows ?? []) as { id: string; classificacao: string; descricao: string }[]) ogMapLocal.set(o.id, o);
      setOgMap(ogMapLocal);

      if (contadorRow) setContador({
        nome: contadorRow.nome ?? "", cpf_cnpj: contadorRow.cpf_cnpj ?? "", crc: contadorRow.crc ?? "",
        email: contadorRow.email ?? "", telefone: contadorRow.telefone ?? "",
      });

      const apoioIds = new Set((apoioBaixas ?? []).map((b: { lancamento_id: string }) => b.lancamento_id));

      // Titular (produtor) de cada lançamento — mesma resolução usada mais abaixo
      // pra montar os itens (produtor_id direto, senão o titular da fazenda) — mas
      // precisa vir antes do filtro de elegibilidade: LCDPR é exclusivo de PF, e um
      // lançamento pode ter como titular um "produtor" que na verdade é uma empresa
      // (CNPJ) — ex: uma transportadora do grupo cadastrada em Produtores só pra
      // conseguir lançar custos dela no mesmo sistema. `entidade_contabil` sozinho
      // não pega esse caso: ele reflete a entidade padrão da FAZENDA (herdada via
      // trigger), não a do titular específico marcado no lançamento.
      const fazProdutorMapPreFiltro = new Map<string, string>();
      for (const f of (fazRows ?? []) as {id:string;produtor_id?:string|null;cpf_cnpj_fiscal?:string}[]) {
        const titular=f.produtor_id || (prodRows ?? []).find(p=>cpfNum(p.cpf_cnpj ?? "")===cpfNum(f.cpf_cnpj_fiscal ?? "")&&!!cpfNum(f.cpf_cnpj_fiscal ?? ""))?.id;
        if(titular)fazProdutorMapPreFiltro.set(f.id,titular);
      }
      const produtoresPJIds = new Set(
        (prodRows ?? [])
          .filter((p: { cpf_cnpj?: string }) => cpfNum(p.cpf_cnpj ?? "").length !== 11)
          .map((p: { id: string }) => p.id)
      );

      const filtrados = lans.filter((l:Lancamento)=>
        ["baixado","pago","parcial"].includes(l.status) && l.data_baixa?.slice(0,4)===String(anoSel) &&
        motivosMovimento(l,apoioIds,fazProdutorMapPreFiltro,produtoresPJIds).length===0);

      // ── Auditoria: todo pagamento (baixado/parcial) de fazenda PF no
      // período, mostrando pra cada um se entrou no LCDPR e, se não entrou,
      // por quê — reaplica as MESMAS regras do filtro acima individualmente
      // (em vez de parar na primeira que falhar) pra dar visibilidade
      // completa, item a item, de todo motivo de exclusão que se aplica.
      // Base "de fazenda PF": entidade_contabil da FAZENDA (não do
      // lançamento — essa é uma das coisas auditadas) — fazenda sem o campo
      // preenchido é tratada como PF (era o único caso até a Seção 76).
      const fazendasPF = new Set(
        (fazRows ?? [])
          .filter((f: { entidade_contabil?: string | null }) => !f.entidade_contabil || f.entidade_contabil === "pf")
          .map((f: { id: string }) => f.id)
      );
      const basePagosPF = lans.filter((l: Lancamento) => {
        if (!["baixado","pago","parcial"].includes(l.status)) return false;
        if (!fazendasPF.has(l.fazenda_id)&&l.entidade_contabil!=="pf") return false;
        return !l.data_baixa || l.data_baixa.slice(0,4)===String(anoSel);
      });
      // Produtor "dono" de cada lançamento: usa lancamentos.produtor_id quando
      // preenchido; senão herda da fazenda (fazendas.produtor_id — a maioria
      // dos lançamentos hoje não tem produtor_id direto, mas toda fazenda tem
      // um titular). Usado pra exibir no relatório "Todos os Produtores" e na
      // coluna Produtor da Auditoria.
      const fazProdutorMap = fazProdutorMapPreFiltro;
      const produtorNomeMap = new Map<string, string>();
      for (const p of (prodRows ?? []) as { id: string; nome: string; cpf_cnpj?: string }[]) {
        produtorNomeMap.set(p.id, p.nome);
      }
      const auditoria: ItemAuditoriaLcdpr[] = basePagosPF.map((l: Lancamento) => {
        const motivos = motivosMovimento(l,apoioIds,fazProdutorMapPreFiltro,produtoresPJIds);
        const titularId = l.produtor_id ?? fazProdutorMapPreFiltro.get(l.fazenda_id) ?? null;
        const dt = l.data_baixa ?? l.data_vencimento ?? l.data_lancamento ?? "";
        return {
          lancamento: l, motivos, incluido: motivos.length === 0,
          produtorNome: titularId ? (produtorNomeMap.get(titularId) ?? "—") : "—",
          competencia: dt.slice(0, 7),
        };
      });
      setAuditoriaLcdpr(auditoria);

      const items: EntradaLCDPR[] = filtrados.map((l: Lancamento) => {
        const produtorId = l.produtor_id ?? fazProdutorMap.get(l.fazenda_id) ?? null;
        return {
          id: l.id,
          data: l.data_baixa!,
          historico: l.descricao ?? l.categoria ?? "",
          tipoDocOriginal:l.tipo_documento_lcdpr ?? null,
          tipoDoc: mapTipoDoc(l.tipo_documento_lcdpr || (l.origem_lancamento==="folha"?"FOLHA":undefined)),
          numDoc: l.numero_documento ?? l.nfe_numero ?? "",
          cpfCnpj: (l.pessoa_id ? pMap.get(l.pessoa_id) : undefined) || (l.origem_lancamento==="folha"?cpfNum((prodRows ?? []).find(p=>p.id===produtorId)?.cpf_cnpj ?? ""):""),
          tipoLanc: tipoLancDe(l),
          fazendaId: l.fazenda_id,
          contaBancariaRef: l.conta_bancaria ?? "",
          receita: l.tipo === "receber" ? valorCaixa(l) : 0,
          despesa: l.tipo === "pagar"   ? valorCaixa(l) : 0,
          origem: "auto" as const, lancId: l.id,
          produtorId,
          produtorCpf: cpfNum((prodRows ?? []).find(p=>p.id===produtorId)?.cpf_cnpj ?? (fazRows ?? []).find(f=>f.id===l.fazenda_id)?.cpf_cnpj_fiscal ?? ""),
          compartilhada: !l.produtor_id && (((fazRows ?? []).find(f=>f.id===l.fazenda_id)?.tipo_exploracao ?? 1)!==1),
          produtorNome: produtorId ? (produtorNomeMap.get(produtorId) ?? "—") : "—",
          ogClassificacao: l.operacao_gerencial_id ? ogMapLocal.get(l.operacao_gerencial_id)?.classificacao : undefined,
          ogDescricao:     l.operacao_gerencial_id ? ogMapLocal.get(l.operacao_gerencial_id)?.descricao : undefined,
        };
      });
      items.sort((a, b) => a.data.localeCompare(b.data));
      setEntradas([...items,...(manuais ?? []).map(m=>({...m.dados,id:m.id,atualizadoEm:m.updated_at} as EntradaLCDPR))].sort((a,b)=>a.data.localeCompare(b.data)||a.id.localeCompare(b.id)));
    }).catch(e=>{if(ativo)setErroCarga((e as {message?:string}).message ?? String(e));}).finally(() => {if(ativo)setLoading(false);});
    return ()=>{ativo=false;};
  }, [fazendaId, fazendaIds?.join(","), contaId, anoSel, versaoMovimentos]);

  // ── Persistência da configuração ──────────────────────────────────────────
  const salvarConfig = async (nova: ConfigLCDPR) => {
    if (!(await confirmarAcao({ titulo: "Confirmar ação", mensagem: "Confira os dados antes de confirmar. Os registros serão gravados ao confirmar. (Salvar config)", perigo: false }))) return;
    const fazCfg = configFazendaId ?? fazendaIds?.[0] ?? fazendaId;
    if (!fazCfg) return;
    setSavingCfg(true);
    try {
      const {error} = await supabase.from("configuracoes_modulo").upsert(
        { fazenda_id: fazCfg, modulo: "lcdpr", config: nova },
        { onConflict: "fazenda_id,modulo" }
      );
      if(error)throw error;
      setConfig(nova);
    } catch(e){alert((e as {message?:string}).message ?? String(e));} finally {
      setSavingCfg(false);
    }
  };

  const salvarContador = async () => {
    if (!(await confirmarAcao({ titulo: "Confirmar ação", mensagem: "Confira os dados antes de confirmar. Os registros serão gravados ao confirmar. (Salvar contador)", perigo: false }))) return;
    if (!contaId) return;
    setSavingContador(true);
    try {
      const {error} = await supabase.from("lcdpr_contador").upsert(
        { conta_id: contaId, ...contador, updated_at: new Date().toISOString() },
        { onConflict: "conta_id" }
      );
      if(error)throw error;
    } catch(e){alert((e as {message?:string}).message ?? String(e));} finally {
      setSavingContador(false);
    }
  };

  const editarFaz = (id: string, patch: Partial<FazLcdpr>) => {
    setFazEdit(prev => { const n = new Map(prev); n.set(id, { ...(n.get(id) ?? {}), ...patch }); return n; });
  };
  const salvarFaz = async (id: string) => {
    if (!(await confirmarAcao({ titulo: "Confirmar ação", mensagem: "Confira os dados antes de confirmar. Os registros serão gravados ao confirmar. (Salvar faz)", perigo: false }))) return;
    const patch = fazEdit.get(id);
    if (!patch) return;
    setSavingFazIds(prev => new Set(prev).add(id));
    try {
      const {data,error} = await supabase.from("fazendas").update(patch).eq("id", id).select("id").maybeSingle();
      if(error)throw error;if(!data)throw new Error("O imóvel não foi atualizado.");
      setFazDados(prev => prev.map(f => f.id === id ? { ...f, ...patch } : f));
      setFazEdit(prev => { const n = new Map(prev); n.delete(id); return n; });
    } catch(e){alert((e as {message?:string}).message ?? String(e));} finally {
      setSavingFazIds(prev => { const n = new Set(prev); n.delete(id); return n; });
    }
  };

  // ── Computados ────────────────────────────────────────────────────────────
  const saldoInicial = 0;
  const totalReceitas = entradas.reduce((s, e) => s + e.receita, 0);
  const totalDespesas = entradas.reduce((s, e) => s + e.despesa, 0);
  const saldoFinal    = saldoInicial + totalReceitas - totalDespesas;

  const produtoresLcdpr = useMemo<ProdutorLcdpr[]>(() => {
    const m = new Map<string, string>();
    for (const p of produtoresDados) if (!m.has(p.cpf)) m.set(p.cpf, p.nome);
    for (const f of fazDados) {
      const c = cpfNum(f.cpf_cnpj_fiscal ?? "");
      if (c.length === 11 && !m.has(c)) m.set(c, f.nome);
    }
    return Array.from(m.entries()).map(([cpf, nome]) => ({ id: cpf, cpf, nome }));
  }, [produtoresDados, fazDados]);

  const entradasDoTitular = useMemo(()=>selecionarMovimentos(entradas,produtorFiltro,produtoresDados,fazDados,anoSel),[entradas,produtorFiltro,produtoresDados,fazDados,anoSel]);
  const entradasExport = useMemo(()=>selecionarMovimentos(entradas,produtorFiltro,produtoresDados,fazDados,anoSel,modoExport==="mensal"?mesExport:undefined),[entradas,produtorFiltro,produtoresDados,fazDados,anoSel,modoExport,mesExport]);
  const saldoInicialExport = modoExport==="mensal" ? entradasDoTitular.filter(e=>Number(e.data.slice(5,7))<mesExport).reduce((s,e)=>s+e.receita-e.despesa,0) : 0;
  const fazsExport = useMemo(()=>{
    if(produtorFiltro==="todos")return fazDados;
    const ids = new Set(produtoresDados.filter(p=>p.cpf===produtorFiltro).map(p=>p.id));
    const usadas = new Set(entradasDoTitular.map(e=>e.fazendaId));
    return fazDados.filter(f=>usadas.has(f.id)||cpfNum(f.cpf_cnpj_fiscal ?? "")===produtorFiltro||ids.has(f.produtor_id ?? "")||f.lcdpr_participantes?.some(p=>cpfNum(p.cpf)===produtorFiltro));
  },[fazDados,produtoresDados,produtorFiltro,entradasDoTitular]);

  // Fazendas com dados incompletos pro registro 0040 (CAEPF é condicionalmente
  // obrigatório — sinalizado, mas não bloqueia a geração)
  const fazendasSemCaepf = fazDados.filter(f => !f.caepf && f.produtor_id);
  const fazendasColetivas = fazDados.filter(f => (f.tipo_exploracao ?? 1) !== 1 || (f.participacao_lcdpr ?? 100) < 100);

  const mesesResumo = Array.from({ length: 12 }, (_, i) => {
    const mm  = String(i + 1).padStart(2, "0");
    const its = entradas.filter(e => e.data.slice(5, 7) === mm);
    return {
      mes:  new Date(`${anoSel}-${mm}-01`).toLocaleString("pt-BR", { month: "long" }),
      rec:  its.reduce((s, e) => s + e.receita, 0),
      desp: its.reduce((s, e) => s + e.despesa, 0),
    };
  });

  // ── Ações ─────────────────────────────────────────────────────────────────
  const gravarMovimentos = async (linhas:EntradaLCDPR[]) => {
    if(!fazendaId)throw new Error("Fazenda não identificada.");
    const {data:{session}}=await supabase.auth.getSession();
    const response=await fetchFinanceiro("/api/lcdpr/movimentos",{method:"POST",headers:{"Content-Type":"application/json",...(session?{Authorization:"Bearer "+session.access_token}:{})},body:JSON.stringify({acao:"incluir",fazenda_id:fazendaId,linhas})});
    const json=await response.json();if(!response.ok||!json.ok)throw new Error(json.error ?? "Os movimentos não foram gravados.");
    setVersaoMovimentos(v=>v+1);return json;
  };
  const adicionarManual = async () => {
    if(gravandoMovimento)return;
    const produtor=produtoresDados.find(p=>p.id===novoProdutorId);
    if(!produtor||!novoImovelId){alert("Escolha o produtor e o imóvel do movimento.");return;}
    setGravandoMovimento(true);
    try {
      await gravarMovimentos([{id:"",data:fManual.data,historico:fManual.historico,tipoDoc:fManual.tipoDoc,numDoc:"",cpfCnpj:fManual.cpfCnpj,
        tipoLanc:fManual.tipo==="receita"?"1":"2",fazendaId:novoImovelId,contaBancariaRef:"",receita:fManual.tipo==="receita"?fManual.valor:0,
        despesa:fManual.tipo==="despesa"?fManual.valor:0,origem:"manual",produtorId:produtor.id,produtorCpf:produtor.cpf,produtorNome:produtor.nome}]);
      setModalManual(false);setFManual({data:hoje(),historico:"",tipoDoc:"6",cpfCnpj:"",valor:0,tipo:"receita"});
    } catch(e){alert((e as Error).message);}finally{setGravandoMovimento(false);}
  };
  const alterarMovimento = async (id:string,acao:string,tipoDoc?:string,motivo?:string) => {
    const {data:{session}}=await supabase.auth.getSession();
    const response=await fetch("/api/lcdpr/movimentos",{method:"POST",headers:{"Content-Type":"application/json",...(session?{Authorization:"Bearer "+session.access_token}:{})},body:JSON.stringify({id,acao,tipoDoc,motivo,atualizado_em:entradas.find(e=>e.id===id)?.atualizadoEm})});
    const result=await response.json();if(!response.ok||!result.ok)throw new Error(result.error ?? "Movimento não atualizado.");
    setEntradas(prev=>prev.map(e=>e.id===id?{...e,atualizadoEm:result.updated_at}:e));
  };
  const removerLancamento = async (id:string) => {
    const motivo=prompt("Motivo da exclusão deste movimento do LCDPR:");if(motivo===null)return;
    if(motivo.trim().length<3){alert("Informe um motivo com pelo menos três caracteres.");return;}
    try{await alterarMovimento(id,"excluir",undefined,motivo);setEntradas(prev=>prev.filter(e=>e.id!==id));}catch(e){alert((e as Error).message);}
  };
  const gravandoDocumento=useRef(false);
  const [documentoOcupado,setDocumentoOcupado]=useState("");
  const atualizarTipoDoc=async(id:string,tipoDoc:string)=>{
    if(gravandoDocumento.current)return;
    const entrada=entradas.find(e=>e.id===id);if(!entrada)return;
    gravandoDocumento.current=true;setDocumentoOcupado(id);
    try {
      if(entrada.origem==="auto"){
        let q=supabase.from("lancamentos").update({tipo_documento_lcdpr:TIPO_DOC_LABEL[tipoDoc]}).eq("id",id);
        q=entrada.tipoDocOriginal==null?q.is("tipo_documento_lcdpr",null):q.eq("tipo_documento_lcdpr",entrada.tipoDocOriginal);
        const {data,error}=await q.select("id").maybeSingle();
        if(error)throw error;if(!data)throw new Error("O documento foi alterado. Recarregue o livro antes de salvar.");
      }else await alterarMovimento(id,"documento",tipoDoc);
      setEntradas(prev=>prev.map(e=>e.id===id?{...e,tipoDoc,tipoDocOriginal:TIPO_DOC_LABEL[tipoDoc]}:e));
    }catch(e){alert((e as {message?:string}).message ?? String(e));}
    finally{gravandoDocumento.current=false;setDocumentoOcupado("");}
  };

  // ── Importação XLS/CSV ────────────────────────────────────────────────────
  const handleImportFile = async (file: File) => {
    setImportLoading(true); setImportFeedback("");
    try {
      const XLSX = await import("xlsx");
      const buffer=await file.arrayBuffer();
      const hash=Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",buffer))).map(v=>v.toString(16).padStart(2,"0")).join("");
      const wb=XLSX.read(buffer);
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[wb.SheetNames[0]], { defval: "" });
      const parsed: ImportRow[] = rows.map((r,indice) => {
        const g = (...keys: string[]) => keys.reduce<string>((a, k) => a || String(r[k] ?? ""), "").trim();
        const dataRaw = g("Data", "data");
        const hist    = g("Histórico", "Historico", "historico", "Descrição", "descricao");
        const docRaw  = g("Documento", "documento");
        const cpf     = g("CPF/CNPJ", "cpf_cnpj");
        const tipoRaw = g("Tipo", "tipo").toLowerCase();
        const bruto=r["Valor"] ?? r["valor"];
        const valRaw=typeof bruto==="number"?bruto:Number(String(bruto ?? "").includes(",")?String(bruto).replace(/\./g,"").replace(",","."):bruto);
        const erros: string[] = [];
        if (!hist) erros.push("Histórico obrigatório");
        if(!Number.isFinite(valRaw)||valRaw<=0)erros.push("Valor positivo obrigatório");
        let dataIso=dataRaw;
        const dataBruta=r["Data"] ?? r["data"];
        if(typeof dataBruta==="number"){
          const d=XLSX.SSF.parse_date_code(dataBruta,{date1904:wb.Workbook?.WBProps?.date1904===true});
          if(d)dataIso=`${d.y}-${String(d.m).padStart(2,"0")}-${String(d.d).padStart(2,"0")}`;
        }
        if (dataRaw.includes("/")) {
          const p = dataRaw.split("/");
          if (p.length === 3) dataIso = `${p[2].length === 4 ? p[2] : `20${p[2]}`}-${p[1].padStart(2,"0")}-${p[0].padStart(2,"0")}`;
        }
        if (!/^\d{4}-\d{2}-\d{2}$/.test(dataIso)||!Number.isFinite(Date.parse(dataIso+"T12:00:00Z"))||new Date(dataIso+"T12:00:00Z").toISOString().slice(0,10)!==dataIso) erros.push("Data inválida (DD/MM/AAAA)");
        const isR = tipoRaw.startsWith("r");
        if (!isR && !tipoRaw.startsWith("d")) erros.push('Tipo deve ser "Receita" ou "Despesa"');
        return {
          importacaoRef:hash+":"+(indice+2),data: dataIso, historico: hist, tipoDoc: mapTipoDoc(docRaw), cpfCnpj: cpf,
          tipo: isR ? "receber" : "pagar" as "receber" | "pagar", valor: valRaw,
          _status: erros.length ? "erro" : "ok" as "ok" | "erro", _msg: erros.join("; "),
        };
      });
      setImportRows(parsed);
    } catch { setImportFeedback("Erro ao ler o arquivo. Use o modelo fornecido."); }
    finally { setImportLoading(false); }
  };

  const confirmarImport = async () => {
    if(gravandoMovimento)return;
    const produtor=produtoresDados.find(p=>p.id===novoProdutorId);
    if(!produtor||!novoImovelId){setImportFeedback("Escolha o produtor e o imóvel dos movimentos importados.");return;}
    const validas=importRows.filter(r=>r._status==="ok");if(!validas.length)return;
    setGravandoMovimento(true);
    try {
      const gravacao=await gravarMovimentos(validas.map(r=>({id:"",importacao_ref:r.importacaoRef,data:r.data,historico:r.historico,tipoDoc:r.tipoDoc,numDoc:"",cpfCnpj:r.cpfCnpj,tipoLanc:r.tipo==="receber"?"1":"2",
        fazendaId:novoImovelId,contaBancariaRef:"",receita:r.tipo==="receber"?r.valor:0,despesa:r.tipo==="pagar"?r.valor:0,
        origem:"importado",produtorId:produtor.id,produtorCpf:produtor.cpf,produtorNome:produtor.nome})));
      setImportRows([]);setImportFeedback(gravacao.criados+" movimentos gravados; "+gravacao.reutilizados+" já importados.");setAba("livro");
    } catch(e){setImportFeedback((e as Error).message);}finally{setGravandoMovimento(false);}
  };

  const baixarModelo = async () => {
    const XLSX = await import("xlsx");
    const dados = [
      ["Data", "Histórico", "Documento", "CPF/CNPJ", "Tipo", "Valor"],
      ["15/03/2025", "Venda de soja — Bunge S.A.", "NF", "03.755.877/0001-00", "Receita", "185000,00"],
      ["20/03/2025", "Adubo NPK 20-05-20 — COP", "NF", "04.803.396/0001-44", "Despesa", "42000,00"],
    ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(dados), "Modelo LCDPR");
    XLSX.writeFile(wb, "Modelo_LCDPR.xlsx");
  };

  // ── Resolução de imóvel (0040) e conta (0050) por lançamento ──────────────
  function resolverBanco(nomeBanco: string | null): string {
    if (!nomeBanco) return "";
    const c = bancosMap.get(nomeBanco.toLowerCase());
    return c ?? "";
  }

  // ── Geração do arquivo .txt (Leiaute 1.3 — ADE COPES nº 1/2020) ───────────
  const gerarLCDPR = () => {
    if(produtorFiltro==="todos")throw new Error("Escolha um CPF para gerar o TXT oficial. A visão Todos é gerencial.");
    if(modoExport!=="anual")throw new Error("O TXT oficial reúne o ano do declarante. Use Excel ou PDF para conferir um mês.");
    const pendentes=auditoriaLcdpr.filter(a=>a.motivos.some(m=>["data_ausente","parcial_legado","valor_invalido","compensacao","titular_ausente"].includes(m)) &&
      (a.motivos.includes("titular_ausente") || produtoresDados.some(p=>p.cpf===produtorFiltro&&p.id===(a.lancamento.produtor_id ?? fazDados.find(f=>f.id===a.lancamento.fazenda_id)?.produtor_id)) ||
       cpfNum(fazDados.find(f=>f.id===a.lancamento.fazenda_id)?.cpf_cnpj_fiscal ?? "")===produtorFiltro));
    if(pendentes.length)throw new Error("Há "+pendentes.length+" movimentos pendentes de conferência na aba Auditoria. Regularize a origem antes de gerar o TXT.");
    const cpfSel   = produtorFiltro !== "todos" ? produtorFiltro : "";
    const produtor=produtoresDados.find(p=>p.cpf===cpfSel);
    if(!produtor)throw new Error("Complete o cadastro do declarante em Cadastros → Produtores.");
    const conteudo=gerarArquivoLCDPR({cpf:cpfSel,nome:produtor.nome,ano:anoSel,declarante:produtor,imoveis:fazsExport,contas:contasDados,produtores:produtoresDados,
      movimentos:entradasExport,contador,codigoBanco:resolverBanco});
    const blob=new Blob([conteudo],{type:"text/plain;charset=utf-8"});const url=URL.createObjectURL(blob);const link=document.createElement("a");
    link.href=url;link.download="LCDPR_"+cpfSel+"_"+anoSel+".txt";link.click();URL.revokeObjectURL(url);
  };

  const gerarXLSX = async () => {
    const XLSX = await import("xlsx");
    const cpfSel = produtorFiltro !== "todos" ? produtorFiltro : "";
    const nomeProd = produtoresLcdpr.find(p => p.cpf === cpfSel)?.nome ?? (produtorFiltro==="todos"?"TODOS OS PRODUTORES":"PRODUTOR RURAL");
    const nomeArq  = nomeProd.toUpperCase().replace(/[^A-Z0-9 ]/g, "").trim();
    const mm       = String(mesExport).padStart(2, "0");
    const comp     = modoExport === "mensal" ? `COMP ${mm}-${anoSel}` : `COMP ${anoSel}`;
    const periodo  = modoExport === "mensal"
      ? new Date(anoSel, mesExport - 1, 1).toLocaleString("pt-BR", { month: "long", year: "numeric" })
      : String(anoSel);

    const cabecalho = [["LCDPR — Livro Caixa e Escrituração Rural"], [`Produtor: ${nomeProd} — CPF: ${fmtCPF(cpfSel)}`], [`Período: ${periodo}`], []];
    const header    = ["Data", "Histórico", "O.G.", "Tipo Doc.", "CPF/CNPJ Parte", "Tipo Lanç.", "Receitas (R$)", "Despesas (R$)"];
    const TIPO_LANC_LABEL: Record<string, string> = { "1": "Receita", "2": "Despesa", "3": "Receita — adiantamento (barter)" };
    const rows = entradasExport.map(e => [
      fmtData(e.data),
      e.historico,
      e.ogClassificacao ? `${e.ogClassificacao} — ${e.ogDescricao ?? ""}` : "",
      TIPO_DOC_LABEL[e.tipoDoc] ?? e.tipoDoc,
      e.cpfCnpj,
      TIPO_LANC_LABEL[e.tipoLanc] ?? e.tipoLanc,
      e.receita > 0 ? e.receita : "",
      e.despesa > 0 ? e.despesa : "",
    ]);
    const totalRec  = entradasExport.reduce((s, e) => s + e.receita, 0);
    const totalDesp = entradasExport.reduce((s, e) => s + e.despesa, 0);
    const rodape    = [["", "", "", "", "", "TOTAL", totalRec, totalDesp]];

    const ws = XLSX.utils.aoa_to_sheet([...cabecalho, header, ...rows, [], ...rodape]);
    ws["!cols"] = [{ wch: 12 }, { wch: 45 }, { wch: 32 }, { wch: 16 }, { wch: 18 }, { wch: 28 }, { wch: 14 }, { wch: 14 }];

    const resumoHeader = ["Mês", "Receitas (R$)", "Despesas (R$)", "Resultado (R$)"];
    const mesesResumoXlsx = Array.from({ length: 12 }, (_, i) => {
      const mes = i + 1;
      const mm2 = String(mes).padStart(2, "0");
      const itens = entradas.filter(e => e.data.slice(0, 7) === `${anoSel}-${mm2}`);
      const rec = itens.reduce((s, e) => s + e.receita, 0);
      const dep = itens.reduce((s, e) => s + e.despesa, 0);
      return [new Date(anoSel, i, 1).toLocaleString("pt-BR", { month: "long" }), rec || "", dep || "", (rec - dep) || ""];
    });
    const ws2 = XLSX.utils.aoa_to_sheet([resumoHeader, ...mesesResumoXlsx]);
    ws2["!cols"] = [{ wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 14 }];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Lançamentos");
    XLSX.utils.book_append_sheet(wb, ws2, "Resumo Mensal");
    XLSX.writeFile(wb, `${nomeRelatorio("LCDPR", clienteRelatorio ?? nomeArq, `${anoSel}-01-01`, `${anoSel}-12-31`)}.xlsx`);
  };

  // ── Relatório PDF — visão estruturada do Livro Caixa (não é o arquivo
  // oficial de entrega, que é o .txt leiaute 1.3 gerado acima) ──────────────
  const gerarPDF = async () => {
    const periodo  = modoExport === "mensal"
      ? new Date(anoSel, mesExport - 1, 1).toLocaleString("pt-BR", { month: "long", year: "numeric" })
      : `01/01/${anoSel} a 31/12/${anoSel}`;

    const cpfSel = produtorFiltro !== "todos" ? produtorFiltro : "";
    const nomeProd = cpfSel ? (produtoresLcdpr.find(p => p.cpf === cpfSel)?.nome ?? "Produtor Rural") : "Todos os Produtores";
    const cpfCnpjSel = cpfSel;
    const entidadeLabel = "Pessoa Física";
    const entradasReport = entradasExport;
    const saldoInicialReport = saldoInicialExport;

    const contasReaisExport = contasDados.filter(c => c.tipo_conta !== "caixa" && c.tipo_conta !== "transitoria");
    const TIPO_LANC_LABEL: Record<string, string> = { "1": "Receita", "2": "Despesa", "3": "Adiant. (barter)" };

    const totalRecExport  = entradasReport.reduce((s, e) => s + e.receita, 0);
    const totalDespExport = entradasReport.reduce((s, e) => s + e.despesa, 0);
    const saldoFinalExport = saldoInicialReport + totalRecExport - totalDespExport;

    const th = `padding:5px 7px;text-align:left;font-size:9px;font-weight:700;color:#fff;background:#1A5C38;white-space:nowrap;`;
    const thNum = th + `text-align:right;`;
    const td = `padding:4px 7px;font-size:9.5px;color:#1a1a1a;border-bottom:0.5px solid #E8ECEF;`;
    const tdNum = td + `text-align:right;font-variant-numeric:tabular-nums;`;

    let saldoCorr = saldoInicialReport;
    // Coluna Produtor só aparece com "Todos os Produtores" selecionado — é
    // quando fica ambíguo de quem é cada lançamento; com um produtor
    // específico selecionado, toda linha já é dele, óbvio.
    const mostrarColunaProdutor = produtorFiltro === "todos";
    const linhasLivro = entradasReport.map((e, i) => {
      saldoCorr += e.receita - e.despesa;
      const bg = i % 2 === 0 ? "#fff" : "#F7F9FA";
      return `<tr style="background:${bg}">
        <td style="${td}">${fmtData(e.data)}</td>
        ${mostrarColunaProdutor ? `<td style="${td}">${htmlLCDPR(e.produtorNome || "—")}</td>` : ""}
        <td style="${td}"><span style="font-size:8.5px;font-weight:700;padding:1px 5px;border-radius:3px;background:${e.tipoLanc === "2" ? "#FCEBEB" : "#EAF3DE"};color:${e.tipoLanc === "2" ? "#791F1F" : "#1A5C38"};">${TIPO_LANC_LABEL[e.tipoLanc] ?? e.tipoLanc}</span></td>
        <td style="${td}">${htmlLCDPR(e.historico || "—")}</td>
        <td style="${td}">${e.ogClassificacao ? `${htmlLCDPR(e.ogClassificacao)} — ${htmlLCDPR(e.ogDescricao ?? "")}` : "—"}</td>
        <td style="${td}">${TIPO_DOC_LABEL[e.tipoDoc] ?? e.tipoDoc}</td>
        <td style="${td}">${htmlLCDPR(e.cpfCnpj || "—")}</td>
        <td style="${tdNum};color:#1A5C38;">${e.receita > 0 ? fmtBRL(e.receita) : "—"}</td>
        <td style="${tdNum};color:#E24B4A;">${e.despesa > 0 ? fmtBRL(e.despesa) : "—"}</td>
        <td style="${tdNum};font-weight:700;color:${saldoCorr >= 0 ? "#1a1a1a" : "#E24B4A"};">${fmtBRL(saldoCorr)}</td>
      </tr>`;
    }).join("");

    // Produtores do LCDPR com nome, CPF e % de distribuição — vai no cabeçalho
    // mesmo com "Todos os Produtores" selecionado (antes o cabeçalho só dizia
    // "Todos os Produtores" e CPF "—", sem dizer quem são nem a quota de cada um).
    const produtoresHeader = produtoresLcdpr.map(p => ({
      nome:htmlLCDPR(p.nome),
      cpf:  fmtCPF(p.cpf) || "—",
    }));
    const thProd = `padding:4px 7px;text-align:left;font-size:8.5px;font-weight:700;color:#1A4870;border-bottom:0.5px solid #DDE2EE;white-space:nowrap;`;
    const tdProd = `padding:3px 7px;font-size:9px;color:#1a1a1a;border-bottom:0.5px solid #F0F3F7;`;
    // Com um produtor específico selecionado o cabeçalho já traz nome, CPF e
    // quota-parte dele — listar todos de novo só confundiria de quem é o livro.
    const blocoProdutores = (produtoresHeader.length === 0 || produtorFiltro !== "todos") ? "" : `
      <div style="margin-bottom:16px;">
        <div style="font-size:9.5px;font-weight:700;color:#666;margin-bottom:4px;">Produtores abrangidos</div>
        <table style="border-collapse:collapse;min-width:340px;">
          <thead><tr>
            <th style="${thProd}">Nome</th><th style="${thProd}">CPF</th>
          </tr></thead>
          <tbody>
            ${produtoresHeader.map(p => `<tr>
              <td style="${tdProd}">${p.nome}</td>
              <td style="${tdProd};font-variant-numeric:tabular-nums;">${p.cpf}</td>
            </tr>`).join("")}
          </tbody>
        </table>
      </div>`;

    const linhasImoveis = fazsExport.map(f => `<tr>
      <td style="${td}">${htmlLCDPR(f.nome)}</td>
      <td style="${td}">${htmlLCDPR([f.municipio,f.estado].filter(Boolean).join(" / ") || "—")}</td>
      <td style="${td}">${htmlLCDPR(f.caepf || "—")}</td>
      <td style="${td}">${htmlLCDPR(f.itr || "—")}</td>
      <td style="${td}">${TIPO_EXPLORACAO_LABEL[f.tipo_exploracao ?? 1] ?? "—"}</td>
      <td style="${tdNum}">${(f.participacao_lcdpr ?? 100).toFixed(2)}%</td>
      <td style="${tdNum}">${f.area_total_ha ? `${f.area_total_ha.toLocaleString("pt-BR")} ha` : "—"}</td>
    </tr>`).join("");

    const linhasContas = contasReaisExport.length > 0 ? contasReaisExport.map(c => `<tr>
      <td style="${td}">${htmlLCDPR(c.nome)}</td>
      <td style="${td}">${htmlLCDPR(c.banco || "—")}</td>
      <td style="${td}">${htmlLCDPR(c.agencia || "—")}</td>
      <td style="${td}">${htmlLCDPR(c.conta || "—")}${c.conta_dv ? `-${htmlLCDPR(c.conta_dv)}` : ""}</td>
      <td style="${td}">${c.tipo_conta === "corrente" ? "Corrente" : c.tipo_conta === "poupanca" ? "Poupança" : c.tipo_conta}</td>
    </tr>`).join("") : `<tr><td colspan="5" style="${td};text-align:center;color:#999;">Nenhuma conta bancária cadastrada</td></tr>`;

    const html = `
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:16px;padding-bottom:12px;border-bottom:0.5px solid #DDE2EE;font-size:11px;">
        <table style="border-collapse:collapse;">
          ${contaNome ? `<tr><td style="padding:2px 10px 2px 0;color:#666;">Cliente</td><td style="font-weight:700;">${htmlLCDPR(contaNome)}</td></tr>` : ""}
          <tr><td style="padding:2px 10px 2px 0;color:#666;">Produtor</td><td style="font-weight:700;">${htmlLCDPR(nomeProd)}</td></tr>
          <tr><td style="padding:2px 10px 2px 0;color:#666;">CPF</td><td>${fmtCPF(cpfCnpjSel) || "—"}</td></tr>
          <tr><td style="padding:2px 10px 2px 0;color:#666;">Período</td><td style="text-transform:capitalize;">${periodo}</td></tr>
        </table>
        <table style="border-collapse:collapse;text-align:right;">
          <tr><td style="padding:2px 0;color:#666;">Regime</td><td style="padding-left:10px;">Caixa — ${entidadeLabel}</td></tr>
          <tr><td style="padding:2px 0;color:#666;">Leiaute</td><td style="padding-left:10px;">1.3 — Anexo ADE COPES nº 1/2020</td></tr>
          ${produtorFiltro !== "todos" ? `<tr><td style="padding:2px 0;color:#666;">Quota-parte aplicada</td><td style="padding-left:10px;">Por imóvel (apenas movimentos compartilhados)</td></tr>` : ""}
        </table>
      </div>

      ${blocoProdutores}

      <h2 style="font-size:12px;font-weight:700;color:#1A4870;margin:0 0 8px;">Imóveis Rurais</h2>
      <div class="auto-fit-table" style="margin-bottom:16px;">
        <table style="width:100%;border-collapse:collapse;">
          <thead><tr>
            <th style="${th}">Nome</th><th style="${th}">Município / UF</th><th style="${th}">CAEPF</th>
            <th style="${th}">ITR</th><th style="${th}">Tipo de Exploração</th><th style="${thNum}">Participação</th><th style="${thNum}">Área</th>
          </tr></thead>
          <tbody>${linhasImoveis || `<tr><td colspan="7" style="${td};text-align:center;color:#999;">Nenhum imóvel cadastrado</td></tr>`}</tbody>
        </table>
      </div>

      <h2 style="font-size:12px;font-weight:700;color:#1A4870;margin:0 0 8px;">Contas Bancárias</h2>
      <div class="auto-fit-table" style="margin-bottom:16px;">
        <table style="width:100%;border-collapse:collapse;">
          <thead><tr>
            <th style="${th}">Nome</th><th style="${th}">Banco</th><th style="${th}">Agência</th><th style="${th}">Conta</th><th style="${th}">Tipo</th>
          </tr></thead>
          <tbody>${linhasContas}</tbody>
        </table>
      </div>

      <h2 style="font-size:12px;font-weight:700;color:#1A4870;margin:0 0 8px;">Livro Caixa — Lançamentos${modoExport === "mensal" ? ` (${periodo})` : ""}</h2>
      <div class="auto-fit-table" style="margin-bottom:6px;">
        <table style="width:100%;border-collapse:collapse;">
          <thead><tr>
            <th style="${th}">Data</th>${mostrarColunaProdutor ? `<th style="${th}">Produtor</th>` : ""}<th style="${th}">Tipo</th><th style="${th}">Histórico</th><th style="${th}">O.G.</th><th style="${th}">Doc.</th>
            <th style="${th}">CPF/CNPJ contraparte</th><th style="${thNum}">Receita</th><th style="${thNum}">Despesa</th><th style="${thNum}">Saldo</th>
          </tr></thead>
          <tbody>
            ${linhasLivro || `<tr><td colspan="${mostrarColunaProdutor ? 10 : 9}" style="${td};text-align:center;color:#999;">Nenhum lançamento no período</td></tr>`}
          </tbody>
          <tfoot>
            <tr style="background:#EDF4FB;">
              <td colspan="${mostrarColunaProdutor ? 7 : 6}" style="${td};font-weight:700;text-align:right;">TOTAL DO PERÍODO</td>
              <td style="${tdNum};font-weight:700;color:#1A5C38;">${fmtBRL(totalRecExport)}</td>
              <td style="${tdNum};font-weight:700;color:#E24B4A;">${fmtBRL(totalDespExport)}</td>
              <td style="${tdNum};font-weight:700;">${fmtBRL(saldoFinalExport)}</td>
            </tr>
          </tfoot>
        </table>
      </div>


      <div style="display:flex;justify-content:space-between;margin-top:30px;padding-top:14px;border-top:0.5px solid #DDE2EE;font-size:10px;">
        <div>
          <div style="color:#666;margin-bottom:2px;">Responsável Técnico</div>
          <div style="font-weight:700;">${htmlLCDPR(contador.nome || "—")}</div>
          <div style="color:#666;">${contador.cpf_cnpj ? `CPF/CNPJ: ${htmlLCDPR(contador.cpf_cnpj)}` : ""}${contador.crc ? ` · CRC: ${htmlLCDPR(contador.crc)}` : ""}</div>
        </div>
        <div style="text-align:right;">
          <div style="color:#666;margin-bottom:2px;">Prazo de entrega</div>
          <div style="font-weight:700;">Conforme o calendário da DIRPF do exercício</div>
        </div>
      </div>
    `;

    abrirPreviewImpressao(
      "LCDPR — Livro Caixa Digital do Produtor Rural",
      html,
      { orientation: "landscape", subtitulo: `${htmlLCDPR(nomeProd)} · ${periodo}`, fazenda: contaNome ?? nomeProd, nomeArquivo: nomeRelatorio("LCDPR", clienteRelatorio ?? nomeProd, `${anoSel}-01-01`, `${anoSel}-12-31`) },
    );
  };

  const exportar = async () => {
    try {
    if(loading||erroCarga)throw new Error(erroCarga || "Aguarde o carregamento do livro.");
    if (formatoExport === "txt")  gerarLCDPR();
    else if (formatoExport === "xlsx") await gerarXLSX();
    else await gerarPDF();
    } catch(e){alert((e as Error).message);}
  };

  // ─────────────────────────────────────────────────────────────────────────
  const inpS: React.CSSProperties = { width: "100%", padding: "8px 10px", border: "0.5px solid var(--border-table)", borderRadius: 8, fontSize: 13, color: "var(--text-1)", background: "var(--bg-input)", boxSizing: "border-box", outline: "none" };
  const lblS: React.CSSProperties = { fontSize: 11, color: "var(--text-2)", marginBottom: 4, display: "block" };

  if (!podeAcessarPlano("fiscal_sped")) return <PlanoGate modulo="fiscal_sped" />;

  // ═════════════════════════════════════════════════════════════════════════
  return (
    <div data-arato-page="true" style={{ display: "flex", flexDirection: "column", minHeight: "100vh", background: "var(--bg-page)", fontFamily: "system-ui, sans-serif", fontSize: 13 }}>
      <TopNav />
      <main style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>

        {/* ── Cabeçalho ── */}
        <OperationalHeading as="header" data-arato-page-heading="true" style={{ background: "var(--bg-card)", borderBottom: "0.5px solid var(--border-table)", padding: "10px 22px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
          <div>
            <h1 data-arato-h1="true" style={{ margin: 0, fontSize: 17, fontWeight: 600, color: "var(--text-1)" }}>LCDPR — Livro Caixa Digital do Produtor Rural</h1>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <SelectField value={anoSel} onChange={e => setAnoSel(Number(e.target.value))}
              style={{ padding: "6px 10px", border: "0.5px solid var(--border-table)", borderRadius: 8, fontSize: 13, color: "var(--text-1)", background: "var(--bg-card)", cursor: "pointer" }}>
              {ANOS.map(a => <option key={a}>{a}</option>)}
            </SelectField>
            <OperationalButton data-arato-button="primary" onClick={() => setModalManual(true)}
              style={{ padding: "8px 16px", background: "#C9921B", color: "#fff", border: "none", borderRadius: 8, fontWeight: 600, cursor: "pointer", fontSize: 13 }}>
              + Lançamento manual
            </OperationalButton>
          </div>
        </OperationalHeading>

        <div style={{ padding: "16px 22px", flex: 1 }}>
          {erroCarga && <p role="alert" style={{color:"#a00"}}>Não foi possível carregar o LCDPR: {erroCarga}</p>}

          {/* ── KPI cards ── */}
          <div data-arato-kpis="true" style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 10, marginBottom: 12 }}>
            {([
              { label: "Saldo Inicial",  val: saldoInicial,  cor: "var(--text-1)",                                            bg: "var(--bg-card)" },
              { label: "Total Receitas", val: totalReceitas, cor: "#1A5C38",                                                  bg: "#EAF3DE" },
              { label: "Total Despesas", val: totalDespesas, cor: "#E24B4A",                                                  bg: "#FCEBEB" },
              { label: "Saldo Final",    val: saldoFinal,    cor: saldoFinal >= 0 ? "#1A5C38" : "#E24B4A",                    bg: saldoFinal >= 0 ? "#EAF3DE" : "#FCEBEB" },
              { label: "Lançamentos",    val: entradas.length, cor: "var(--text-1)", bg: "var(--bg-card)", cnt: true },
            ] as { label: string; val: number; cor: string; bg: string; cnt?: boolean }[]).map((c, i) => (
              <div key={i} style={{ background: c.bg, border: "0.5px solid var(--border-table)", borderRadius: 10, padding: "12px 14px" }}>
                <div style={{ fontSize: 11, color: "var(--text-2)", marginBottom: 4 }}>{c.label}</div>
                <div style={{ fontSize: 17, fontWeight: 700, color: c.cor }}>{c.cnt ? c.val : fmtBRL(c.val)}</div>
              </div>
            ))}
          </div>

          {/* ── Alertas de cadastro incompleto ── */}
          {(fazendasSemCaepf.length > 0 || fazendasColetivas.length > 0) && (
            <div style={{ background: "#FBF3E0", border: "0.5px solid #C9921B60", borderRadius: 8, padding: "8px 14px", marginBottom: 10, display: "flex", flexDirection: "column", gap: 4, fontSize: 12 }}>
              {fazendasSemCaepf.length > 0 && (
                <span style={{ color: "#7A5A12" }}>
                  ⚠ <strong>{fazendasSemCaepf.length}</strong> fazenda{fazendasSemCaepf.length !== 1 ? "s" : ""} sem CAEPF cadastrado — complete o cadastro antes de gerar o TXT oficial. Configure em{" "}
                  <OperationalButton data-arato-button="toggle" onClick={() => setAba("cadastro")} style={{ background: "none", border: "none", color: "#C9921B", cursor: "pointer", fontWeight: 600, fontSize: 12, padding: 0, textDecoration: "underline" }}>Cadastro LCDPR</OperationalButton>.
                </span>
              )}
              {fazendasColetivas.length > 0 && (
                <span style={{ color: "#7A5A12" }}>
                  ⚠ <strong>{fazendasColetivas.length}</strong> fazenda{fazendasColetivas.length !== 1 ? "s têm" : " tem"} exploração coletiva ou participação abaixo de 100% — confira os terceiros e percentuais no Cadastro LCDPR para gerar o registro 0045.
                </span>
              )}
            </div>
          )}

          {/* ── Barra de info: prazo + saldo inicial ── */}
          <div data-arato-panel="true" style={{ background: "var(--bg-card)", border: "0.5px solid var(--border-table)", borderRadius: 8, padding: "8px 16px", marginBottom: 14, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, fontSize: 12 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ color: "var(--text-2)" }}>📅 Prazo de entrega:</span>
              <strong style={{ color: "var(--text-1)" }}>30/04/{anoSel + 1}</strong>
              <span style={{ color: "var(--text-3)", fontSize: 11 }}>(junto com a DIRPF — art. 5º IN RFB 1.848/2018)</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ color: "var(--text-2)" }}>Saldo em 01/01/{anoSel}:</span>
              <strong>R$ 0,00 (resultado anual da atividade)</strong>
              {savingCfg && <span style={{ fontSize: 10, color: "#aaa" }}>salvando…</span>}
            </div>
          </div>

          {/* ── Abas ── */}
          <div style={{ background: "var(--bg-card)", border: "0.5px solid var(--border-table)", borderRadius: 12, overflow: "hidden" }}>
            <div data-arato-tabs="true" data-arato-grid-container="true" style={{ display: "flex", borderBottom: "0.5px solid var(--border-table)", overflowX: "auto" }}>
              {([
                ["livro",         "Livro Caixa"],
                ["participacoes", "Produtores e Participações"],
                ["auditoria",     "Auditoria"],
                ["cadastro",      "Cadastro LCDPR"],
                ["importacao",    "Importação"],
                ["exportacao",    "Exportação"],
              ] as [Aba, string][]).map(([k, lbl]) => (
                <OperationalButton data-arato-tab-active={aba === (k)} data-arato-tab="true" data-arato-button="toggle" key={k} onClick={() => setAba(k)} style={{
                  padding: "10px 18px", border: "none",
                  background: aba === k ? "#fff" : "var(--bg-card)",
                  borderBottom: aba === k ? "2px solid #1A5C38" : "2px solid transparent",
                  cursor: "pointer", fontSize: 13, fontWeight: aba === k ? 600 : 400,
                  color: aba === k ? "#1A5C38" : "var(--text-2)", whiteSpace: "nowrap",
                }}>
                  {lbl}
                  {k === "cadastro" && (fazendasSemCaepf.length > 0) && (
                    <span style={{ marginLeft: 6, fontSize: 10, background: "#FBF3E0", color: "#7A5A12", padding: "1px 5px", borderRadius: 4, fontWeight: 600 }}>{fazendasSemCaepf.length}</span>
                  )}
                  {k === "auditoria" && auditoriaLcdpr.some(a => !a.incluido) && (
                    <span style={{ marginLeft: 6, fontSize: 10, background: "#FCEBEB", color: "#791F1F", padding: "1px 5px", borderRadius: 4, fontWeight: 600 }}>
                      {auditoriaLcdpr.filter(a => !a.incluido).length}
                    </span>
                  )}
                </OperationalButton>
              ))}
            </div>

            {/* ═══ ABA: LIVRO CAIXA ═══ */}
            {aba === "livro" && (
              <div>
                {loading ? (
                  <div style={{ padding: 40, textAlign: "center", color: "var(--text-2)" }}>Carregando lançamentos…</div>
                ) : entradas.length === 0 ? (
                  <div data-arato-statistic="display" style={{ padding: 48, textAlign: "center", color: "var(--text-2)" }}>
                    <div style={{ fontSize: 32, marginBottom: 8 }}>📋</div>
                    <div style={{ fontWeight: 600, color: "var(--text-1)", marginBottom: 4 }}>Nenhum lançamento baixado em {anoSel}</div>
                    <div style={{ fontSize: 12, color: "#666", lineHeight: 1.7 }}>
                      Lançamentos baixados no Financeiro com entidade PF aparecem aqui automaticamente.<br />
                      Verifique o ano ou use "+ Lançamento manual" para inserir dados históricos.
                    </div>
                  </div>
                ) : (
                  <div data-arato-grid-container="true" style={{ overflowX: "auto" }}>
                    <OperationalGrid data-arato-grid="true" style={{ width: "100%", borderCollapse: "collapse", minWidth: 880 }}>
                      <thead>
                        <tr style={{ background: "var(--bg-page)" }}>
                          {["Data", "Tipo", "Histórico", "Doc.", "CPF/CNPJ contraparte", "Receita", "Despesa", "Saldo", ""].map((h, i) => (
                            <th key={i} style={{ padding: "8px 12px", textAlign: i >= 5 && i <= 7 ? "right" : "left", fontSize: 11, fontWeight: 600, color: "var(--text-2)", borderBottom: "0.5px solid var(--border-table)", whiteSpace: "nowrap" }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {(() => {
                          let saldo = saldoInicial;
                          const TIPO_LANC_LABEL: Record<string, string> = { "1": "Receita", "2": "Despesa", "3": "Adiant." };
                          return entradas.map((e, i) => {
                            saldo += e.receita - e.despesa;
                            return (
                              <tr key={e.id} style={{ borderBottom: i < entradas.length - 1 ? "0.5px solid var(--border-row)" : "none", background: e.origem !== "auto" ? "#FFFDF5" : "transparent" }}>
                                <td style={{ padding: "8px 12px", whiteSpace: "nowrap", fontSize: 12 }}>{fmtData(e.data)}</td>
                                <td style={{ padding: "8px 12px" }}>
                                  <span style={{
                                    fontSize: 10, padding: "2px 7px", borderRadius: 6, fontWeight: 600,
                                    background: e.tipoLanc === "2" ? "#FCEBEB" : "#EAF3DE",
                                    color: e.tipoLanc === "2" ? "#791F1F" : "#1A5C38",
                                  }}>
                                    {TIPO_LANC_LABEL[e.tipoLanc]}
                                  </span>
                                </td>
                                <td style={{ padding: "8px 12px", maxWidth: 260 }}>
                                  <div style={{ fontWeight: 500, color: "var(--text-1)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{e.historico}</div>
                                </td>
                                <td style={{ padding: "4px 8px" }}>
                                  <SelectField
                                    value={e.tipoDoc} disabled={!!documentoOcupado}
                                    onChange={ev => atualizarTipoDoc(e.id, ev.target.value)}
                                    style={{ fontSize: 11, padding: "3px 5px", border: "0.5px solid var(--border-table)", borderRadius: 5, color: "var(--text-1)", background: "var(--bg-card)", maxWidth: 150 }}
                                  >
                                    {Object.entries(TIPO_DOC_LABEL).map(([k, v]) => <option key={k} value={k}>{k} — {v}</option>)}
                                  </SelectField>
                                </td>
                                <td style={{ padding: "8px 12px", fontSize: 11, color: "var(--text-2)", fontVariantNumeric: "tabular-nums" }}>{e.cpfCnpj || "—"}</td>
                                <td style={{ padding: "8px 12px", textAlign: "right", color: e.receita > 0 ? "#1A5C38" : "#ccc", fontWeight: e.receita > 0 ? 600 : 400, fontVariantNumeric: "tabular-nums" }}>
                                  {e.receita > 0 ? fmtBRL(e.receita) : "—"}
                                </td>
                                <td style={{ padding: "8px 12px", textAlign: "right", color: e.despesa > 0 ? "#E24B4A" : "#ccc", fontWeight: e.despesa > 0 ? 600 : 400, fontVariantNumeric: "tabular-nums" }}>
                                  {e.despesa > 0 ? fmtBRL(e.despesa) : "—"}
                                </td>
                                <td style={{ padding: "8px 12px", textAlign: "right", fontWeight: 600, fontVariantNumeric: "tabular-nums", color: saldo >= 0 ? "var(--text-1)" : "#E24B4A" }}>
                                  {fmtBRL(saldo)}
                                </td>
                                <td style={{ padding: "8px 6px", textAlign: "center" }}>
                                  {e.origem !== "auto" ? (
                                    <OperationalButton data-arato-button="danger" onClick={() => removerLancamento(e.id)} style={{ fontSize: 11, padding: "2px 7px", borderRadius: 6, border: "0.5px solid #E24B4A50", background: "#FCEBEB", color: "#791F1F", cursor: "pointer" }}>✕</OperationalButton>
                                  ) : (
                                    <span title="Originado de baixa financeira — não pode ser excluído" style={{ fontSize: 14, cursor: "default", opacity: 0.35 }}>🔒</span>
                                  )}
                                </td>
                              </tr>
                            );
                          });
                        })()}
                      </tbody>
                      <tfoot>
                        <tr style={{ background: "var(--bg-page)", borderTop: "1px solid var(--border-table)" }}>
                          <td colSpan={5} style={{ padding: "10px 12px", fontWeight: 700, color: "var(--text-1)" }}>TOTAL {anoSel}</td>
                          <td style={{ padding: "10px 12px", textAlign: "right", fontWeight: 700, color: "#1A5C38", fontVariantNumeric: "tabular-nums" }}>{fmtBRL(totalReceitas)}</td>
                          <td style={{ padding: "10px 12px", textAlign: "right", fontWeight: 700, color: "#E24B4A", fontVariantNumeric: "tabular-nums" }}>{fmtBRL(totalDespesas)}</td>
                          <td style={{ padding: "10px 12px", textAlign: "right", fontWeight: 700, fontVariantNumeric: "tabular-nums", color: saldoFinal >= 0 ? "#1A5C38" : "#E24B4A" }}>{fmtBRL(saldoFinal)}</td>
                          <td />
                        </tr>
                      </tfoot>
                    </OperationalGrid>
                  </div>
                )}
              </div>
            )}

            {/* ═══ ABA: PRODUTORES E PARTICIPAÇÕES ═══ */}
            {aba === "participacoes" && (
              <div style={{padding:24}}>
                <p>Cada CPF exporta seus movimentos exclusivos. A participação nos movimentos compartilhados é definida por imóvel, junto aos terceiros da exploração.</p>
                <OperationalButton data-arato-button="primary" onClick={()=>setAba("cadastro")}>Configurar imóveis e participantes</OperationalButton>
                {produtoresLcdpr.map(p=><div key={p.cpf} style={{padding:12,borderBottom:"1px solid var(--border-table)"}}>{fmtCPF(p.cpf)} — {p.nome}</div>)}
              </div>
            )}

            {/* ═══ ABA: AUDITORIA ═══ */}
            {aba === "auditoria" && (() => {
              const mesesDisponiveis = [...new Set(auditoriaLcdpr.map(a => a.competencia).filter(Boolean))].sort();
              const lista = auditoriaLcdpr.filter(a =>
                (filtroAuditoria === "todos" ? true : filtroAuditoria === "incluidos" ? a.incluido : !a.incluido)
                && (mesAuditoria === "todos" ? true : a.competencia === mesAuditoria)
              );
              const totalPago    = auditoriaLcdpr.reduce((s, a) => s + (a.lancamento.valor_pago ?? a.lancamento.valor ?? 0), 0);
              const totalInclu   = auditoriaLcdpr.filter(a => a.incluido).reduce((s, a) => s + (a.lancamento.valor_pago ?? a.lancamento.valor ?? 0), 0);
              const totalExcl    = totalPago - totalInclu;
              const qtdInclu     = auditoriaLcdpr.filter(a => a.incluido).length;
              const qtdExcl      = auditoriaLcdpr.length - qtdInclu;
              const porMotivo = (Object.keys(MOTIVO_LABEL) as MotivoExclusaoLcdpr[]).map(m => ({
                motivo: m,
                qtd: auditoriaLcdpr.filter(a => a.motivos.includes(m)).length,
              })).filter(x => x.qtd > 0);
              return (
                <div style={{ padding: 20 }}>
                  <div style={{ fontSize: 13, color: "var(--text-2)", marginBottom: 16, lineHeight: 1.6 }}>
                    Todo lançamento <strong>baixado ou parcial</strong>, de fazenda <strong>Pessoa Física</strong>, em {anoSel} —
                    comparado contra o que de fato entra no Livro Caixa do LCDPR. Cada item excluído mostra o motivo
                    exato — use pra validar se a exclusão está certa ou se é um dado de cadastro pra corrigir
                    (Entidade Contábil, Vínculo de Atividade, categoria, ou o titular do lançamento).
                  </div>

                  <div data-arato-kpis="true" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginBottom: 18 }}>
                    <div data-arato-statistic="display" style={{ background: "var(--bg-page)", border: "0.5px solid var(--border-table)", borderRadius: 10, padding: "12px 16px" }}>
                      <div style={{ fontSize: 11, color: "var(--text-3)" }}>Total pago no período ({auditoriaLcdpr.length} lançamentos)</div>
                      <div style={{ fontSize: 18, fontWeight: 700, color: "var(--text-1)" }}>{fmtBRL(totalPago)}</div>
                    </div>
                    <div data-arato-statistic="display" style={{ background: "#E8F5E9", border: "0.5px solid #86EFAC", borderRadius: 10, padding: "12px 16px" }}>
                      <div style={{ fontSize: 11, color: "#1A6B3C" }}>✓ No LCDPR ({qtdInclu})</div>
                      <div style={{ fontSize: 18, fontWeight: 700, color: "#1A6B3C" }}>{fmtBRL(totalInclu)}</div>
                    </div>
                    <div data-arato-statistic="display" style={{ background: qtdExcl > 0 ? "#FCEBEB" : "var(--bg-page)", border: `0.5px solid ${qtdExcl > 0 ? "#F5C6C6" : "var(--border-table)"}`, borderRadius: 10, padding: "12px 16px" }}>
                      <div style={{ fontSize: 11, color: qtdExcl > 0 ? "#791F1F" : "var(--text-3)" }}>✗ Fora do LCDPR ({qtdExcl})</div>
                      <div style={{ fontSize: 18, fontWeight: 700, color: qtdExcl > 0 ? "#791F1F" : "var(--text-1)" }}>{fmtBRL(totalExcl)}</div>
                    </div>
                  </div>

                  {porMotivo.length > 0 && (
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 18 }}>
                      {porMotivo.map(({ motivo, qtd }) => (
                        <span key={motivo} style={{ fontSize: 11, background: "#FBF3E0", color: "#7A5A12", padding: "4px 10px", borderRadius: 6, fontWeight: 600 }}>
                          {MOTIVO_LABEL[motivo]}: {qtd}
                        </span>
                      ))}
                    </div>
                  )}

                  <div style={{ display: "flex", gap: 8, marginBottom: 14, alignItems: "center" }}>
                    {([["excluidos", "Fora do LCDPR"], ["incluidos", "No LCDPR"], ["todos", "Todos"]] as const).map(([v, lbl]) => (
                      <OperationalButton data-arato-button="toggle" key={v} onClick={() => setFiltroAuditoria(v)} style={{
                        padding: "6px 14px", borderRadius: 8, border: "0.5px solid var(--border-table)",
                        background: filtroAuditoria === v ? "#1A5C38" : "var(--bg-card)",
                        color: filtroAuditoria === v ? "#fff" : "var(--text-2)",
                        cursor: "pointer", fontSize: 12, fontWeight: 600,
                      }}>
                        {lbl}
                      </OperationalButton>
                    ))}
                    <SelectField value={mesAuditoria} onChange={e => setMesAuditoria(e.target.value)} style={{
                      padding: "6px 10px", borderRadius: 8, border: "0.5px solid var(--border-table)",
                      background: "var(--bg-card)", color: "var(--text-2)", fontSize: 12, marginLeft: 8,
                    }}>
                      <option value="todos">Todos os meses</option>
                      {mesesDisponiveis.map(m => (
                        <option key={m} value={m}>{fmtData(`${m}-01`).slice(3)}</option>
                      ))}
                    </SelectField>
                  </div>

                  {lista.length === 0 ? (
                    <div style={{ padding: 32, textAlign: "center", color: "var(--text-3)", fontSize: 13 }}>
                      Nenhum lançamento nessa condição em {anoSel}.
                    </div>
                  ) : (
                    <div data-arato-grid-container="true" style={{ overflowX: "auto" }}>
                      <OperationalGrid data-arato-grid="true" style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                        <thead>
                          <tr style={{ borderBottom: "0.5px solid var(--border-table)" }}>
                            {["Data", "Produtor", "Descrição", "Valor", "Status LCDPR", "Motivo(s)"].map(h => (
                              <th key={h} style={{ padding: "8px 10px", textAlign: h === "Valor" ? "right" : "left", fontSize: 11, fontWeight: 600, color: "var(--text-2)" }}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {lista.map(({ lancamento: l, motivos, incluido, produtorNome }, i) => (
                            <tr key={l.id} style={{ borderBottom: i < lista.length - 1 ? "0.5px solid var(--bg-tag)" : "none" }}>
                              <td style={{ padding: "8px 10px", color: "var(--text-2)", whiteSpace: "nowrap" }}>{fmtData(l.data_baixa ?? l.data_vencimento)}</td>
                              <td style={{ padding: "8px 10px", color: "var(--text-2)", whiteSpace: "nowrap" }}>{produtorNome}</td>
                              <td style={{ padding: "8px 10px", color: "var(--text-1)" }}>{l.descricao ?? l.categoria ?? "—"}</td>
                              <td style={{ padding: "8px 10px", textAlign: "right", fontWeight: 600, whiteSpace: "nowrap" }}>{fmtBRL(l.valor_pago ?? l.valor ?? 0)}</td>
                              <td style={{ padding: "8px 10px" }}>
                                <span style={{ padding: "2px 8px", borderRadius: 6, fontSize: 11, fontWeight: 600, background: incluido ? "#E8F5E9" : "#FCEBEB", color: incluido ? "#1A6B3C" : "#791F1F" }}>
                                  {incluido ? "✓ No LCDPR" : "✗ Fora"}
                                </span>
                              </td>
                              <td style={{ padding: "8px 10px", color: "var(--text-3)", fontSize: 11 }}>
                                {motivos.length > 0 ? motivos.map(m => MOTIVO_LABEL[m]).join(" · ") : "—"}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </OperationalGrid>
                    </div>
                  )}
                </div>
              );
            })()}

            {/* ═══ ABA: CADASTRO LCDPR (imóveis + contador) ═══ */}
            {aba === "cadastro" && (
              <div style={{ padding: 20 }}>
                <div style={{ background: "#EEF4FF", border: "0.5px solid #93C5FD", borderRadius: 10, padding: "12px 16px", marginBottom: 18, fontSize: 12, color: "#1e40af", lineHeight: 1.6 }}>
                  <strong>Registro 0040 do LCDPR</strong> — cada fazenda vira um "imóvel rural" no arquivo. CAEPF e tipo de
                  exploração são exigidos pela Receita para imóveis explorados individualmente por pessoa física.
                </div>

                <div style={{ fontWeight: 600, fontSize: 13, color: "var(--text-1)", marginBottom: 10 }}>Imóveis (fazendas)</div>
                <div style={{ border: "0.5px solid var(--border-table)", borderRadius: 10, overflow: "hidden", marginBottom: 24 }}>
                  <OperationalGrid data-arato-grid="true" style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead>
                      <tr style={{ background: "var(--bg-page)" }}>
                        {["Fazenda", "CAEPF", "Tipo de Exploração", "Participação (%)", "Terceiros (0045)", ""].map((h, i) => (
                          <th key={i} style={{ padding: "8px 12px", textAlign: "left", fontSize: 11, fontWeight: 600, color: "var(--text-2)", borderBottom: "0.5px solid var(--border-table)" }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {fazDados.map(f => {
                        const edit = fazEdit.get(f.id);
                        const caepf = edit?.caepf ?? f.caepf ?? "";
                        const tipoExp = edit?.tipo_exploracao ?? f.tipo_exploracao ?? (f.arrendada ? 3 : 1);
                        const participacao = edit?.participacao_lcdpr ?? f.participacao_lcdpr ?? 100;
                        const mudou = !!edit;
                        return (
                          <tr key={f.id} style={{ borderBottom: "0.5px solid var(--border-row)" }}>
                            <td style={{ padding: "8px 12px", fontWeight: 500 }}>{f.nome}</td>
                            <td style={{ padding: "6px 12px" }}>
                              <input value={caepf} placeholder="14 dígitos" maxLength={14}
                                onChange={e => editarFaz(f.id, { caepf: e.target.value.replace(/\D/g, "") })}
                                style={{ ...inpS, fontFamily: "monospace" }} />
                            </td>
                            <td style={{ padding: "6px 12px" }}>
                              <SelectField value={tipoExp} onChange={e => editarFaz(f.id, { tipo_exploracao: Number(e.target.value) })} style={inpS}>
                                {Object.entries(TIPO_EXPLORACAO_LABEL).map(([k, v]) => <option key={k} value={k}>{k} — {v}</option>)}
                              </SelectField>
                            </td>
                            <td style={{ padding: "6px 12px", width: 110 }}>
                              <input type="number" min={0} max={100} step={0.01} value={participacao}
                                onChange={e => editarFaz(f.id, { participacao_lcdpr: Math.min(100, Math.max(0, parseFloat(e.target.value) || 0)) })}
                                style={inpS} />
                            </td>
                            <td style={{padding:8,minWidth:330}}>
                              {(edit?.lcdpr_participantes ?? f.lcdpr_participantes ?? []).map((p,i)=><div key={i} style={{display:"flex",gap:4,marginBottom:6}}>
                                <input aria-label="CPF/CNPJ do terceiro" placeholder="CPF/CNPJ" value={p.cpf} onChange={e=>editarFaz(f.id,{lcdpr_participantes:(edit?.lcdpr_participantes ?? f.lcdpr_participantes ?? []).map((v,n)=>n===i?{...v,cpf:e.target.value.replace(/\D/g,"")}:v)})} style={{...inpS,width:125}}/>
                                <input aria-label="Nome do terceiro" placeholder="Nome" value={p.nome} onChange={e=>editarFaz(f.id,{lcdpr_participantes:(edit?.lcdpr_participantes ?? f.lcdpr_participantes ?? []).map((v,n)=>n===i?{...v,nome:e.target.value}:v)})} style={inpS}/>
                                <SelectField aria-label="Tipo de terceiro" value={p.tipo} onChange={e=>editarFaz(f.id,{lcdpr_participantes:(edit?.lcdpr_participantes ?? f.lcdpr_participantes ?? []).map((v,n)=>n===i?{...v,tipo:Number(e.target.value)}:v)})}><option value={1}>Condômino</option><option value={2}>Arrendador</option><option value={3}>Parceiro</option><option value={4}>Comodante</option><option value={5}>Outros</option></SelectField>
                                <input aria-label="Participação do terceiro" type="number" min={0} max={100} value={p.participacao} onChange={e=>editarFaz(f.id,{lcdpr_participantes:(edit?.lcdpr_participantes ?? f.lcdpr_participantes ?? []).map((v,n)=>n===i?{...v,participacao:Number(e.target.value)}:v)})} style={{...inpS,width:70}}/>
                                <OperationalButton data-arato-button="danger" onClick={()=>editarFaz(f.id,{lcdpr_participantes:(edit?.lcdpr_participantes ?? f.lcdpr_participantes ?? []).filter((_,n)=>n!==i)})}>×</OperationalButton>
                              </div>)}
                              <OperationalButton data-arato-button="secondary" onClick={()=>editarFaz(f.id,{lcdpr_participantes:[...(edit?.lcdpr_participantes ?? f.lcdpr_participantes ?? []),{cpf:"",nome:"",tipo:1,participacao:0}]})}>+ Terceiro</OperationalButton>
                              <label style={{display:"block",marginTop:8}}><input type="checkbox" checked={edit?.lcdpr_responsavel ?? f.lcdpr_responsavel ?? true} onChange={e=>editarFaz(f.id,{lcdpr_responsavel:e.target.checked})}/> Declarante é o responsável pelo CAEPF</label>
                            </td>
                            <td style={{ padding: "6px 10px", textAlign: "center" }}>
                              {mudou && (
                                <OperationalButton data-arato-button="primary" onClick={() => salvarFaz(f.id)} disabled={savingFazIds.has(f.id)}
                                  style={{ padding: "4px 12px", background: "#1A5C38", color: "#fff", border: "none", borderRadius: 6, fontWeight: 600, cursor: "pointer", fontSize: 11 }}>
                                  {savingFazIds.has(f.id) ? "…" : "Salvar"}
                                </OperationalButton>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </OperationalGrid>
                </div>

                <div style={{ fontWeight: 600, fontSize: 13, color: "var(--text-1)", marginBottom: 10 }}>Contas bancárias (registro 0050)</div>
                <div style={{ border: "0.5px solid var(--border-table)", borderRadius: 10, overflow: "hidden", marginBottom: 24, fontSize: 12 }}>
                  <OperationalGrid data-arato-grid="true" style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead>
                      <tr style={{ background: "var(--bg-page)" }}>
                        {["Conta", "Banco", "Agência", "Nº Conta", "Tipo"].map((h, i) => (
                          <th key={i} style={{ padding: "8px 12px", textAlign: "left", fontSize: 11, fontWeight: 600, color: "var(--text-2)", borderBottom: "0.5px solid var(--border-table)" }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {contasDados.length === 0 ? (
                        <tr><td colSpan={5} style={{ padding: 20, textAlign: "center", color: "var(--text-3)" }}>Nenhuma conta bancária cadastrada nesta fazenda.</td></tr>
                      ) : contasDados.map(c => (
                        <tr key={c.id} style={{ borderBottom: "0.5px solid var(--border-row)" }}>
                          <td style={{ padding: "8px 12px" }}>{c.nome}</td>
                          <td style={{ padding: "8px 12px" }}>{c.banco ?? "—"} {resolverBanco(c.banco) && <span style={{ color: "var(--text-3)" }}>({resolverBanco(c.banco)})</span>}</td>
                          <td style={{ padding: "8px 12px" }}>{c.agencia ?? "—"}</td>
                          <td style={{ padding: "8px 12px" }}>{c.conta ?? "—"}</td>
                          <td style={{ padding: "8px 12px" }}>
                            <span style={{ fontSize: 10, padding: "2px 7px", borderRadius: 6, background: c.tipo_conta === "caixa" ? "#FBF3E0" : c.tipo_conta === "transitoria" ? "#EEF4FF" : "#EAF3DE", color: c.tipo_conta === "caixa" ? "#7A5A12" : c.tipo_conta === "transitoria" ? "#1e40af" : "#1A5C38" }}>
                              {c.tipo_conta === "caixa" ? "espécie (000)" : c.tipo_conta === "transitoria" ? "trânsito (999)" : c.tipo_conta}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </OperationalGrid>
                </div>
                <div style={{ fontSize: 11, color: "var(--text-3)", marginBottom: 24 }}>
                  Contas do tipo "espécie" e "trânsito" usam os códigos especiais 000/999 do leiaute — não entram como conta cadastrada no registro 0050. Para editar banco/agência/conta, use Cadastros → Contas Bancárias.
                </div>

                <div style={{ fontWeight: 600, fontSize: 13, color: "var(--text-1)", marginBottom: 10 }}>Contador responsável (registro 9999)</div>
                <div data-arato-fields="true" style={{ display: "grid", gridTemplateColumns: "2fr 1.3fr 1fr", gap: 12, maxWidth: 700 }}>
                  <div>
                    <label data-arato-label="true" style={lblS}>Nome</label>
                    <input value={contador.nome} onChange={e => setContador(p => ({ ...p, nome: e.target.value }))} style={inpS} />
                  </div>
                  <div>
                    <label data-arato-label="true" style={lblS}>CPF/CNPJ</label>
                    <input value={contador.cpf_cnpj} onChange={e => setContador(p => ({ ...p, cpf_cnpj: e.target.value.replace(/\D/g, "") }))} style={{ ...inpS, fontFamily: "monospace" }} />
                  </div>
                  <div>
                    <label data-arato-label="true" style={lblS}>CRC</label>
                    <input value={contador.crc} onChange={e => setContador(p => ({ ...p, crc: e.target.value }))} style={inpS} />
                  </div>
                  <div>
                    <label data-arato-label="true" style={lblS}>E-mail</label>
                    <input value={contador.email} onChange={e => setContador(p => ({ ...p, email: e.target.value }))} style={inpS} />
                  </div>
                  <div>
                    <label data-arato-label="true" style={lblS}>Telefone</label>
                    <input value={contador.telefone} onChange={e => setContador(p => ({ ...p, telefone: e.target.value }))} style={inpS} />
                  </div>
                  <div style={{ display: "flex", alignItems: "flex-end" }}>
                    <OperationalButton data-arato-button="primary" onClick={salvarContador} disabled={savingContador}
                      style={{ padding: "8px 16px", background: "#1A5C38", color: "#fff", border: "none", borderRadius: 8, fontWeight: 600, cursor: "pointer", fontSize: 12 }}>
                      {savingContador ? "Salvando…" : "Salvar contador"}
                    </OperationalButton>
                  </div>
                </div>
              </div>
            )}

            {/* ═══ ABA: IMPORTAÇÃO ═══ */}
            {aba === "importacao" && (
              <div style={{ padding: 24 }}>
                <div data-arato-item-grid="true" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24, alignItems: "start" }}>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 14, color: "var(--text-1)", marginBottom: 12 }}>Importar lançamentos via planilha</div><div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:12}}>
              <label>Produtor<SelectField value={novoProdutorId} onChange={e=>setNovoProdutorId(e.target.value)} style={inpS}><option value="">Selecione</option>{produtoresDados.map(p=><option key={p.id} value={p.id}>{p.nome} — {fmtCPF(p.cpf)}</option>)}</SelectField></label>
              <label>Imóvel<SelectField value={novoImovelId} onChange={e=>setNovoImovelId(e.target.value)} style={inpS}><option value="">Selecione</option>{fazDados.map(f=><option key={f.id} value={f.id}>{f.nome}</option>)}</SelectField></label>
            </div>
                    <div style={{ fontSize: 12, color: "var(--text-2)", lineHeight: 1.7, marginBottom: 16 }}>
                      Para lançamentos históricos ou oriundos de outro sistema. Os movimentos são gravados no LCDPR do produtor e imóvel escolhidos, sem gerar uma nova conta no financeiro.
                    </div>
                    <OperationalButton data-arato-button="secondary" onClick={baixarModelo}
                      style={{ padding: "7px 14px", background: "var(--bg-card)", color: "var(--text-1)", border: "0.5px solid var(--border-table)", borderRadius: 8, cursor: "pointer", fontSize: 12, marginBottom: 16, display: "flex", alignItems: "center", gap: 6 }}>
                      ⬇ Baixar modelo Excel
                    </OperationalButton>
                    <div data-arato-statistic="action" onClick={() => importRef.current?.click()}
                      onDragOver={e => { e.preventDefault(); (e.currentTarget as HTMLElement).style.borderColor = "#1A5C38"; }}
                      onDragLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = "var(--border-table)"; }}
                      onDrop={e => { e.preventDefault(); (e.currentTarget as HTMLElement).style.borderColor = "var(--border-table)"; const f = e.dataTransfer.files[0]; if (f) handleImportFile(f); }}
                      style={{ border: "1.5px dashed var(--border-table)", borderRadius: 10, padding: "28px 20px", textAlign: "center", cursor: "pointer", transition: "border-color 0.2s" }}>
                      <div style={{ fontSize: 24, marginBottom: 8 }}>📂</div>
                      <div style={{ fontWeight: 600, color: "var(--text-1)" }}>{importLoading ? "Processando…" : "Arraste ou clique para selecionar"}</div>
                      <div style={{ fontSize: 11, color: "var(--text-3)", marginTop: 4 }}>XLS, XLSX ou CSV</div>
                    </div>
                    <input ref={importRef} type="file" accept=".xls,.xlsx,.csv" style={{ display: "none" }}
                      onChange={e => { const f = e.target.files?.[0]; if (f) handleImportFile(f); e.target.value = ""; }} />
                    {importFeedback && (
                      <div style={{ marginTop: 12, background: "#EAF3DE", borderRadius: 8, padding: "8px 14px", color: "#1A5C38", fontSize: 12, fontWeight: 600 }}>{importFeedback}</div>
                    )}
                  </div>

                  <div style={{ background: "var(--bg-page)", borderRadius: 10, padding: "16px 18px", border: "0.5px solid var(--border-table)", fontSize: 12 }}>
                    <div style={{ fontWeight: 600, color: "var(--text-1)", marginBottom: 12 }}>Colunas esperadas na planilha</div>
                    {[
                      { col: "Data *",          desc: "DD/MM/AAAA ou AAAA-MM-DD" },
                      { col: "Histórico *",      desc: "Descrição do lançamento (até 60 chars)" },
                      { col: "Tipo *",           desc: "Receita ou Despesa" },
                      { col: "Valor *",          desc: "Número com vírgula. Ex: 185.000,00" },
                      { col: "Documento",        desc: "NF, Recibo, Fatura, Contrato, Folha, Outros" },
                      { col: "CPF/CNPJ",         desc: "CPF/CNPJ da contraparte" },
                    ].map(f => (
                      <div key={f.col} style={{ display: "flex", gap: 8, marginBottom: 7 }}>
                        <span style={{ fontWeight: 600, color: "var(--text-1)", minWidth: 130, flexShrink: 0 }}>{f.col}</span>
                        <span style={{ color: "var(--text-2)" }}>{f.desc}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {importRows.length > 0 && (
                  <div style={{ marginTop: 24 }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                      <div style={{ fontWeight: 600, color: "var(--text-1)" }}>
                        Preview — {importRows.length} linha{importRows.length !== 1 ? "s" : ""}
                        {" "}({importRows.filter(r => r._status === "ok").length} válidas, {importRows.filter(r => r._status === "erro").length} com erro)
                      </div>
                      <OperationalButton data-arato-button="primary" onClick={confirmarImport} disabled={gravandoMovimento || !importRows.some(r => r._status === "ok")}
                        style={{ padding: "8px 18px", background: "#1A5C38", color: "#fff", border: "none", borderRadius: 8, fontWeight: 600, cursor: "pointer", fontSize: 13, opacity: importRows.some(r => r._status === "ok") ? 1 : 0.5 }}>
                        Confirmar importação
                      </OperationalButton>
                    </div>
                    <div data-arato-grid-container="true" style={{ overflowX: "auto", border: "0.5px solid var(--border-table)", borderRadius: 10 }}>
                      <OperationalGrid data-arato-grid="true" style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                        <thead>
                          <tr style={{ background: "var(--bg-page)" }}>
                            {["Status", "Data", "Histórico", "Tipo", "Valor", "Erro"].map((h, i) => (
                              <th key={i} style={{ padding: "7px 10px", textAlign: "left", fontSize: 11, fontWeight: 600, color: "var(--text-2)", borderBottom: "0.5px solid var(--border-table)" }}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {importRows.map((r, i) => (
                            <tr key={i} style={{ borderBottom: "0.5px solid var(--border-row)", background: r._status === "erro" ? "#FCEBEB" : "transparent" }}>
                              <td style={{ padding: "6px 10px" }}>{r._status === "ok" ? "✓" : "✕"}</td>
                              <td style={{ padding: "6px 10px" }}>{r.data}</td>
                              <td style={{ padding: "6px 10px" }}>{r.historico}</td>
                              <td style={{ padding: "6px 10px" }}>{r.tipo === "receber" ? "Receita" : "Despesa"}</td>
                              <td style={{ padding: "6px 10px" }}>{fmtBRL(r.valor)}</td>
                              <td style={{ padding: "6px 10px", color: "#791F1F" }}>{r._msg}</td>
                            </tr>
                          ))}
                        </tbody>
                      </OperationalGrid>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ═══ ABA: EXPORTAÇÃO ═══ */}
            {aba === "exportacao" && (
              <div style={{ padding: 24 }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 14, color: "var(--text-1)", marginBottom: 16 }}>Configurar exportação</div>

                    <div style={{ marginBottom: 16 }}>
                      <label data-arato-label="true" style={lblS}>Produtor</label>
                      <SelectField value={produtorFiltro} onChange={e => setProdutorFiltro(e.target.value)} style={inpS}>
                        <option value="todos">Todos os produtores (visão gerencial)</option>
                        {produtoresLcdpr.map(p => <option key={p.cpf} value={p.cpf}>{fmtCPF(p.cpf)} — {p.nome}</option>)}
                      </SelectField>
                    </div>

                    <div style={{ marginBottom: 16 }}>
                      <label data-arato-label="true" style={lblS}>Período</label>
                      <div style={{ display: "flex", gap: 8 }}>
                        <OperationalButton data-arato-button="toggle" onClick={() => setModoExport("anual")} style={{ flex: 1, padding: "8px", borderRadius: 8, border: `1px solid ${modoExport === "anual" ? "#1A5C38" : "var(--border-table)"}`, background: modoExport === "anual" ? "#EAF3DE" : "var(--bg-card)", color: modoExport === "anual" ? "#1A5C38" : "var(--text-2)", fontWeight: 600, cursor: "pointer", fontSize: 12 }}>Ano inteiro ({anoSel})</OperationalButton>
                        <OperationalButton data-arato-button="toggle" onClick={() => setModoExport("mensal")} style={{ flex: 1, padding: "8px", borderRadius: 8, border: `1px solid ${modoExport === "mensal" ? "#1A5C38" : "var(--border-table)"}`, background: modoExport === "mensal" ? "#EAF3DE" : "var(--bg-card)", color: modoExport === "mensal" ? "#1A5C38" : "var(--text-2)", fontWeight: 600, cursor: "pointer", fontSize: 12 }}>Um mês</OperationalButton>
                      </div>
                      {modoExport === "mensal" && (
                        <SelectField value={mesExport} onChange={e => setMesExport(Number(e.target.value))} style={{ ...inpS, marginTop: 8 }}>
                          {Array.from({ length: 12 }, (_, i) => (
                            <option key={i + 1} value={i + 1}>{new Date(anoSel, i, 1).toLocaleString("pt-BR", { month: "long" })}</option>
                          ))}
                        </SelectField>
                      )}
                    </div>

                    <div style={{ marginBottom: 20 }}>
                      <label data-arato-label="true" style={lblS}>Formato</label>
                      <div style={{ display: "flex", gap: 8 }}>
                        {([["txt", "📄 .txt (LCDPR)"], ["xlsx", "📊 Excel"], ["pdf", "📑 Relatório PDF"]] as [typeof formatoExport, string][])
                          .map(([f, lbl]) => (
                          <OperationalButton data-arato-button="toggle" key={f} onClick={() => setFormatoExport(f)} style={{ flex: 1, padding: "8px", borderRadius: 8, border: `1px solid ${formatoExport === f ? "#1A5C38" : "var(--border-table)"}`, background: formatoExport === f ? "#EAF3DE" : "var(--bg-card)", color: formatoExport === f ? "#1A5C38" : "var(--text-2)", fontWeight: 600, cursor: "pointer", fontSize: 12 }}>{lbl}</OperationalButton>
                        ))}
                      </div>
                    </div>

                    <OperationalButton data-arato-button="primary" onClick={exportar}
                      style={{ width: "100%", padding: "12px", background: "#1A5C38", color: "#fff", border: "none", borderRadius: 10, fontWeight: 700, cursor: "pointer", fontSize: 14 }}>
                      ⬇ Gerar e baixar
                    </OperationalButton>
                  </div>

                  <div style={{ background: "var(--bg-page)", borderRadius: 10, padding: "16px 18px", border: "0.5px solid var(--border-table)" }}>
                    <div style={{ fontWeight: 600, color: "var(--text-1)", marginBottom: 12 }}>Resumo mensal — {anoSel}</div>
                    <OperationalGrid data-arato-grid="true" style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                      <tbody>
                        {mesesResumo.map((m, i) => (
                          <tr key={i} style={{ borderBottom: "0.5px solid var(--border-row)" }}>
                            <td style={{ padding: "5px 4px", textTransform: "capitalize", color: "var(--text-2)" }}>{m.mes}</td>
                            <td style={{ padding: "5px 4px", textAlign: "right", color: "#1A5C38" }}>{m.rec > 0 ? fmtBRL(m.rec) : "—"}</td>
                            <td style={{ padding: "5px 4px", textAlign: "right", color: "#E24B4A" }}>{m.desp > 0 ? fmtBRL(m.desp) : "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </OperationalGrid>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </main>

      {/* ── Modal: lançamento manual ── */}
      {modalManual && (
        <div data-arato-overlay="true" style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }}>
          <div data-arato-dialog="form" style={{ background: "var(--bg-card)", borderRadius: 14, padding: 24, width: 460 }}>
            <div data-arato-dialog-body="true" style={{ fontWeight: 600, fontSize: 15, color: "var(--text-1)", marginBottom: 16 }}>Lançamento manual (histórico / fora do Financeiro)</div>
            <div data-arato-dialog-body="true" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div data-arato-dialog-body="true" style={{ display: "flex", gap: 8 }}>
                <OperationalButton data-arato-button="toggle" onClick={() => setFManual(p => ({ ...p, tipo: "receita" }))} style={{ flex: 1, padding: 8, borderRadius: 8, border: `1px solid ${fManual.tipo === "receita" ? "#1A5C38" : "var(--border-table)"}`, background: fManual.tipo === "receita" ? "#EAF3DE" : "var(--bg-card)", color: fManual.tipo === "receita" ? "#1A5C38" : "var(--text-2)", fontWeight: 600, cursor: "pointer" }}>Receita</OperationalButton>
                <OperationalButton data-arato-button="toggle" onClick={() => setFManual(p => ({ ...p, tipo: "despesa" }))} style={{ flex: 1, padding: 8, borderRadius: 8, border: `1px solid ${fManual.tipo === "despesa" ? "#E24B4A" : "var(--border-table)"}`, background: fManual.tipo === "despesa" ? "#FCEBEB" : "var(--bg-card)", color: fManual.tipo === "despesa" ? "#E24B4A" : "var(--text-2)", fontWeight: 600, cursor: "pointer" }}>Despesa</OperationalButton>
              </div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:12}}>
              <label>Produtor<SelectField value={novoProdutorId} onChange={e=>setNovoProdutorId(e.target.value)} style={inpS}><option value="">Selecione</option>{produtoresDados.map(p=><option key={p.id} value={p.id}>{p.nome} — {fmtCPF(p.cpf)}</option>)}</SelectField></label>
              <label>Imóvel<SelectField value={novoImovelId} onChange={e=>setNovoImovelId(e.target.value)} style={inpS}><option value="">Selecione</option>{fazDados.map(f=><option key={f.id} value={f.id}>{f.nome}</option>)}</SelectField></label>
            </div>
              <div data-arato-dialog-body="true"><label data-arato-label="true" style={lblS}>Data</label><InputData type="date" value={fManual.data} onChange={e => setFManual(p => ({ ...p, data: e.target.value }))} style={inpS} /></div>
              <div data-arato-dialog-body="true"><label data-arato-label="true" style={lblS}>Histórico</label><input value={fManual.historico} onChange={e => setFManual(p => ({ ...p, historico: e.target.value }))} style={inpS} placeholder="Ex: Venda de 100 sacas de milho" /></div>
              <div data-arato-dialog-body="true" data-arato-fields="true" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <div>
                  <label data-arato-label="true" style={lblS}>Documento</label>
                  <SelectField value={fManual.tipoDoc} onChange={e => setFManual(p => ({ ...p, tipoDoc: e.target.value }))} style={inpS}>
                    {Object.entries(TIPO_DOC_LABEL).map(([k, v]) => <option key={k} value={k}>{k} — {v}</option>)}
                  </SelectField>
                </div>
                <div><label data-arato-label="true" style={lblS}>CPF/CNPJ contraparte</label><input value={fManual.cpfCnpj} onChange={e => setFManual(p => ({ ...p, cpfCnpj: e.target.value.replace(/\D/g, "") }))} style={inpS} /></div>
              </div>
              <div data-arato-dialog-body="true">
                <label data-arato-label="true" style={lblS}>Valor</label>
                <InputNumerico value={fManual.valor} onChange={v => setFManual(p => ({ ...p, valor: Number(v) }))} style={inpS} />
              </div>
            </div>
            <div data-arato-dialog-body="true" data-arato-dialog-actions="true" style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 20 }}>
              <OperationalButton data-arato-button="secondary" onClick={() => setModalManual(false)} style={{ padding: "8px 18px", border: "0.5px solid var(--border-table)", borderRadius: 8, background: "var(--bg-card)", cursor: "pointer", fontSize: 13 }}>Cancelar</OperationalButton>
              <OperationalButton data-arato-button="primary" onClick={adicionarManual} disabled={gravandoMovimento} style={{ padding: "8px 20px", background: "#C9921B", color: "#fff", border: "none", borderRadius: 8, fontWeight: 600, cursor: "pointer", fontSize: 13 }}>Adicionar</OperationalButton>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
