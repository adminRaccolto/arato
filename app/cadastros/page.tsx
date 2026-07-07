"use client";
import { useState, useEffect, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import TopNav from "../../components/TopNav";
import {
  listarFazendas, criarFazenda, atualizarFazenda, excluirFazenda,
  listarTalhoes, criarTalhao, atualizarTalhao,
  listarProdutores, listarProdutoresDaConta, criarProdutor, atualizarProdutor, excluirProdutor,
  criarContaTenant,
  listarEmpresas, criarEmpresa, atualizarEmpresa, excluirEmpresa,
  listarMatriculas, criarMatricula, atualizarMatricula, excluirMatricula,
  listarArrendamentos, salvarArrendamentos,
  listarPessoas, criarPessoa, atualizarPessoa, excluirPessoa,
  listarAnosSafra, criarAnoSafra, atualizarAnoSafra, excluirAnoSafra, encerrarAnoSafra, reabrirAnoSafra,
  listarCiclos, criarCiclo, atualizarCiclo, excluirCiclo,
  listarMaquinas, criarMaquina, atualizarMaquina, excluirMaquina, excluirMaquinas,
  listarContratosFinanceiros,
  listarBombas, criarBomba, atualizarBomba, excluirBomba,
  listarFuncionarios, criarFuncionario, atualizarFuncionario, excluirFuncionario,
  listarPremiacoesFuncionario, criarPremiacao, excluirPremiacao,
  listarFeriasFuncionario, salvarFeriasGozo, sincronizarPeriodosFerias, processarFolhaMensal,
  listarGrupos, criarGrupo, atualizarGrupo, excluirGrupo,
  listarUsuarios, criarUsuario, atualizarUsuario, excluirUsuario,
  listarDepositos, criarDeposito, atualizarDeposito, excluirDeposito,
  listarGruposInsumo, criarGrupoInsumo, atualizarGrupoInsumo, excluirGrupoInsumo,
  listarSubgruposInsumo, criarSubgrupoInsumo, atualizarSubgrupoInsumo, excluirSubgrupoInsumo,
  seederGruposInsumo,
  seederProdutosAgricolas,
  listarTiposPessoa, criarTipoPessoa, atualizarTipoPessoa, excluirTipoPessoa,
  listarCentrosCustoGeral, criarCentroCusto, atualizarCentroCusto, excluirCentroCusto,
  listarCategoriasLancamento, criarCategoriaLancamento, atualizarCategoriaLancamento, excluirCategoriaLancamento,
  listarInsumos, criarInsumo, atualizarInsumo, excluirInsumo,
  listarFormasPagamento, criarFormaPagamento, atualizarFormaPagamento, excluirFormaPagamento,
  listarOperacoesGerenciais, criarOperacaoGerencial, atualizarOperacaoGerencial, excluirOperacaoGerencial,
  listarBancos, listarContas, criarConta, atualizarContaBancaria, excluirConta,
  listarPlanoContas,
  listarPrincipiosAtivos, criarPrincipioAtivo, atualizarPrincipioAtivo, excluirPrincipioAtivo,
  listarNomesComerciais, salvarNomeComercial, excluirNomeComercial,
  listarIEsDoProdutor, salvarIEsDoProdutor,
  listarImoveisUrbanos, criarImovelUrbano, atualizarImovelUrbano, excluirImovelUrbano,
  excluirTalhao, listarArrendamentosTalhao, salvarArrendamentosTalhao, listarArrendamentosUsadosFazenda,
  listarDocumentacaoTalhao, salvarDocumentacaoTalhao,
} from "../../lib/db";
import { useAuth } from "../../components/AuthProvider";
import { supabase } from "../../lib/supabase";
import { planoContasPadrao, labelConta, type ContaContabil } from "../../lib/planoContas";
import { seedOperacoesGerenciais } from "../../lib/seedOperacoesGerenciais";
import InputMonetario from "../../components/InputMonetario";
import InputNumerico from "../../components/InputNumerico";
import ProdutorCombo from "../../components/ProdutorCombo";
import type {
  Fazenda as FazendaDB, Talhao, Arrendamento,
  Produtor, ProdutorIE, Empresa, MatriculaImovel, Pessoa,
  AnoSafra, Ciclo, CicloTalhao, Maquina, BombaCombustivel,
  Funcionario, FuncionarioPremiacao, FuncionarioFerias, GrupoUsuario, Usuario, Deposito,
  GrupoInsumo, SubgrupoInsumo, TipoPessoa, CentroCusto, CategoriaLancamento,
  Insumo, OperacaoGerencial, FormaPagamento, PadraoClassificacao, ContaBancaria, Banco,
  PrincipioAtivo, NomeComercial, ContratoFinanceiro, UnidadeMedida, Cultura as CulturaItem,
  ImovelUrbano,
} from "../../lib/supabase";

// ── Local types for inline editing ──────────────────────────
type ArrFaz = {
  _key: string;
  id?: string;
  proprietario_id: string;
  proprietario_nome: string;
  area_ha: string;
  forma_pagamento: "sc_soja" | "sc_milho" | "sc_soja_milho" | "brl";
  sc_ha: string;         // sacas soja/ha (sc_soja e sc_soja_milho)
  sc_milho_ha: string;   // sacas milho/ha (sc_milho e sc_soja_milho)
  valor_brl: string;
  ano_safra_id: string;
  inicio: string;
  vencimento: string;
  renovacao_auto: boolean;
  observacao: string;
  produtor_id: string;
  produtor_id_2: string;
  aberto: boolean;
  mats: { _key: string; id?: string; numero: string; area_ha: string; cartorio: string }[];
};
type FazMatLocal = {
  _key: string;
  id?: string;
  produtor_id: string;
  numero: string;
  cartorio: string;
  area_ha: string;
  descricao: string;
  em_garantia: boolean;
  garantia_banco: string;
  garantia_valor: string;
  garantia_vencimento: string;
};

type TabCad = "produtores" | "empresas" | "fazendas" | "funcionarios" | "pessoas" | "safras" | "insumos" | "produtos" | "itens" | "depositos" | "maquinas" | "combustivel" | "grupos_insumo" | "centros_custo" | "formas_pagamento" | "operacoes_gerenciais" | "padroes_classificacao" | "contas_bancarias" | "historico_fiscal" | "principios_ativos" | "unidades_medida" | "culturas" | "imoveis_urbanos";

type TabGroup = { group: string; tabs: { key: TabCad; label: string }[] };

const TAB_GROUPS: TabGroup[] = [
  { group: "Cadastros Gerais", tabs: [
    { key: "produtores",      label: "Produtores"      },
    { key: "fazendas",        label: "Fazendas"        },
    { key: "funcionarios",    label: "Funcionários"    },
    { key: "pessoas",         label: "Pessoas"         },
    { key: "imoveis_urbanos", label: "Imóveis Urbanos" },
  ]},
  { group: "Cadastros Técnicos", tabs: [
    { key: "safras",                  label: "Safras"                    },
    { key: "insumos",                 label: "Insumos"                   },
    { key: "produtos",                label: "Produtos Agrícolas"        },
    { key: "itens",                   label: "Itens Gerais"              },
    { key: "depositos",               label: "Depósitos & Armazéns"      },
    { key: "maquinas",                label: "Máquinas e Veículos"       },
    { key: "combustivel",             label: "Combustíveis & Bombas"     },
    { key: "grupos_insumo",           label: "Grupos de Insumos"         },
    { key: "culturas",                 label: "Culturas"                  },
    { key: "padroes_classificacao",   label: "Padrões de Classificação"  },
    { key: "principios_ativos",       label: "Princípios Ativos (BOT)"   },
    { key: "unidades_medida",         label: "Unidades de Medida"        },
  ]},
  { group: "Financeiro", tabs: [
    { key: "centros_custo",        label: "Centros de Custo"     },
    { key: "operacoes_gerenciais", label: "Operações Gerenciais" },
    { key: "historico_fiscal",     label: "Histórico Fiscal (CFOPs)" },
    { key: "formas_pagamento",     label: "Formas de Pagamento"  },
    { key: "contas_bancarias",     label: "Contas Bancárias"     },
  ]},
];

const ESTADOS = ["AC","AL","AP","AM","BA","CE","DF","ES","GO","MA","MT","MS","MG","PA","PB","PR","PE","PI","RJ","RN","RS","RO","RR","SC","SP","SE","TO"];
const SOLOS   = ["LVdf","LAd","LVd","NVef","CXbd","PVAd","RQo"];
const CULTURAS = ["Soja","Milho","Algodão","Trigo","Sorgo","Feijão","Arroz"];
const MODULOS  = ["dashboard","propriedades","lavoura","financeiro","estoque","fiscal","relatorios","cadastros","automacoes","configuracoes"];

const inp: React.CSSProperties = { width: "100%", padding: "8px 10px", border: "0.5px solid #D4DCE8", borderRadius: 8, fontSize: 13, color: "#1a1a1a", background: "#fff", boxSizing: "border-box", outline: "none" };
const lbl: React.CSSProperties = { fontSize: 11, color: "#555", marginBottom: 4, display: "block" };
const btnV: React.CSSProperties = { padding: "8px 18px", background: "#1A5C38", color: "#fff", border: "none", borderRadius: 8, fontWeight: 600, cursor: "pointer", fontSize: 13 };
const btnR: React.CSSProperties = { padding: "8px 18px", border: "0.5px solid #D4DCE8", borderRadius: 8, background: "transparent", cursor: "pointer", fontSize: 13, color: "#1a1a1a" };
const btnX: React.CSSProperties = { padding: "4px 10px", border: "0.5px solid #E24B4A50", borderRadius: 6, background: "#FCEBEB", cursor: "pointer", fontSize: 11, color: "#791F1F" };
const btnE: React.CSSProperties = { padding: "4px 10px", border: "0.5px solid #D4DCE8", borderRadius: 6, background: "transparent", cursor: "pointer", fontSize: 11, color: "#666" };

function diasAteDate(d: string): number {
  return Math.ceil((new Date(d).getTime() - Date.now()) / 86400000);
}

function badge(texto: string, bg = "#D5E8F5", color = "#0B2D50") {
  return <span style={{ fontSize: 10, background: bg, color, padding: "2px 7px", borderRadius: 8, fontWeight: 600 }}>{texto}</span>;
}

function maskCpfCnpj(v: string, tipo: "pf" | "pj") {
  const d = v.replace(/\D/g, "");
  if (tipo === "pf") {
    if (d.length <= 3)  return d;
    if (d.length <= 6)  return d.replace(/(\d{3})(\d+)/, "$1.$2");
    if (d.length <= 9)  return d.replace(/(\d{3})(\d{3})(\d+)/, "$1.$2.$3");
    return d.slice(0, 11).replace(/(\d{3})(\d{3})(\d{3})(\d{1,2})/, "$1.$2.$3-$4");
  }
  if (d.length <= 2)  return d;
  if (d.length <= 5)  return d.replace(/(\d{2})(\d+)/, "$1.$2");
  if (d.length <= 8)  return d.replace(/(\d{2})(\d{3})(\d+)/, "$1.$2.$3");
  if (d.length <= 12) return d.replace(/(\d{2})(\d{3})(\d{3})(\d+)/, "$1.$2.$3/$4");
  return d.slice(0, 14).replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5");
}

function maskPhone(v: string) {
  const d = v.replace(/\D/g, "").slice(0, 11);
  if (d.length === 0) return "";
  if (d.length <= 2)  return `(${d}`;
  if (d.length <= 6)  return `(${d.slice(0,2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0,2)}) ${d.slice(2,6)}-${d.slice(6)}`;
  return `(${d.slice(0,2)}) ${d.slice(2,7)}-${d.slice(7)}`;
}

function maskCep(v: string) {
  const d = v.replace(/\D/g, "").slice(0, 8);
  if (d.length <= 5) return d;
  return `${d.slice(0,5)}-${d.slice(5)}`;
}

// ── Modal wrapper ──────────────────────────────────────
function Modal({ titulo, subtitulo, onClose, children, width = 860 }: { titulo: string; subtitulo?: string; onClose: () => void; children: React.ReactNode; width?: number }) {
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 120 }}
      >
      <div style={{ background: "#fff", borderRadius: 14, padding: 28, width, maxWidth: "96vw", maxHeight: "94vh", overflowY: "auto" }}>
        <div style={{ fontWeight: 600, fontSize: 15, color: "#1a1a1a", marginBottom: subtitulo ? 2 : 18 }}>{titulo}</div>
        {subtitulo && <div style={{ fontSize: 12, color: "#555", marginBottom: 18 }}>{subtitulo}</div>}
        {children}
      </div>
    </div>
  );
}

// ── Linha de tabela padrão ──────────────────────────────
function TH({ cols }: { cols: string[] }) {
  return (
    <thead>
      <tr style={{ background: "#F3F6F9" }}>
        {cols.map((c, i) => (
          <th key={i} style={{ padding: "8px 14px", textAlign: i === 0 ? "left" : "center", fontSize: 11, fontWeight: 600, color: "#555", borderBottom: "0.5px solid #D4DCE8", whiteSpace: "nowrap" }}>{c}</th>
        ))}
      </tr>
    </thead>
  );
}

// ══════════════════════════════════════════════════════
// PÁGINA PRINCIPAL
// ══════════════════════════════════════════════════════
function CadastrosInner() {
  const params = useSearchParams();
  const router = useRouter();
  const { fazendaId, contaId, userRole } = useAuth();
  const [aba, setAba] = useState<TabCad>((params.get("tab") as TabCad) ?? "produtores");

  // Sincroniza a aba sempre que o query param ?tab= mudar na URL
  useEffect(() => {
    const tab = params.get("tab") as TabCad | null;
    if (tab) setAba(tab);
  }, [params]);

  // ── Estado global ──
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro]         = useState<string | null>(null);

  // ── Produtores ──
  const [produtores, setProdutores]   = useState<Produtor[]>([]);
  const [modalProd, setModalProd]     = useState(false);
  const [editProd, setEditProd]       = useState<Produtor | null>(null);
  const [fProd, setFProd]             = useState({ nome: "", tipo: "pf" as "pf"|"pj", incra: "", cpf_cnpj: "", inscricao_est: "", email: "", telefone: "", cep: "", logradouro: "", numero: "", complemento: "", bairro: "", municipio: "", estado: "MT", razao_social: "", regime_tributario: "", car: "", nirf: "", itr: "", email_relatorios: "", _empresaId: "" });
  // Mapa produtor_id → empresa_id para Produtores PJ (preenchido ao salvar/carregar)
  const [prodEmpresaMap, setProdEmpresaMap] = useState<Record<string, string>>({});
  const [buscandoCep, setBuscandoCep] = useState(false);
  const [tabProd, setTabProd]         = useState<"dados"|"ies">("dados");
  const [prodIEs, setProdIEs]         = useState<ProdutorIE[]>([]);
  const [newIE, setNewIE]             = useState({ inscricao_estadual: "", municipio: "", estado: "MT", fazenda_id: "" });

  // ── Fazendas ──
  const [fazendas, setFazendas]       = useState<FazendaDB[]>([]);
  const fazIdEff: string | null = fazendaId ?? (fazendas.length > 0 ? fazendas[0].id : null);
  const [talhoes, setTalhoes]         = useState<Record<string, Talhao[]>>({});
  const [matriculas, setMatriculas]   = useState<Record<string, MatriculaImovel[]>>({});
  const [expandFaz, setExpandFaz]     = useState<Set<string>>(new Set());
  const [modalFaz, setModalFaz]       = useState(false);
  const [editFaz, setEditFaz]         = useState<FazendaDB | null>(null);
  const [tabFaz, setTabFaz]           = useState<"geral"|"matriculas"|"cars"|"nirfs"|"itrs"|"ccirs"|"arrendamentos">("geral");
  type FazCar  = { _key: string; id?: string; numero: string; status: string; area_ha: string; vencimento: string; observacao: string; mats_vinculadas: string[] };
  type FazNirf = { _key: string; id?: string; numero: string; situacao: string; area_ha: string; observacao: string; mats_vinculadas: string[] };
  type FazItr  = { _key: string; id?: string; exercicio: string; numero_declaracao: string; nirf_numero: string; vencimento: string; area_tributavel_ha: string; valor_apurado: string; status_pagamento: string; observacao: string; mats_vinculadas: string[] };
  type FazCcir = { _key: string; id?: string; numero: string; exercicio: string; vencimento: string; area_ha: string; modulo_fiscal: string; situacao: string; observacao: string; mats_vinculadas: string[] };
  const [fazCars,  setFazCars]  = useState<FazCar[]>([]);
  const [fazNirfs, setFazNirfs] = useState<FazNirf[]>([]);
  const [fazItrs,  setFazItrs]  = useState<FazItr[]>([]);
  const [fazCcirs, setFazCcirs] = useState<FazCcir[]>([]);
  const [buscandoCepFaz, setBuscandoCepFaz] = useState(false);
  const [cepAutoOk, setCepAutoOk]           = useState(false);
  const [fazArrendamentos, setFazArrendamentos] = useState<ArrFaz[]>([]);
  const [fazMatsLocal, setFazMatsLocal] = useState<FazMatLocal[]>([]);
  const [fFaz, setFFaz]               = useState({
    nome: "", municipio: "", estado: "MT", area: "", cnpj: "",
    produtor_id: "", empresa_id: "",
    cep: "", logradouro: "", numero_end: "", complemento: "", bairro: "",
  });
  const [modalTalhao, setModalTalhao] = useState<string | null>(null); // fazenda_id
  const [editTalhao, setEditTalhao]   = useState<Talhao | null>(null);
  const [fTalhao, setFTalhao]         = useState({ nome: "", area: "", area_plantada: "", solo: "LVdf", lat: "", lng: "", tipo_posse: "proprio" as "proprio"|"arrendado", arrendamento_ids: [] as string[], matricula_ids: [] as string[], car_ids: [] as string[] });
  const [talhaoArrs, setTalhaoArrs]   = useState<Arrendamento[]>([]); // arrendamentos da fazenda no modal talhão
  const [talhaoArrsUsados, setTalhaoArrsUsados] = useState<string[]>([]); // ids já vinculados a outros talhões
  const [talhaoMatsFaz, setTalhaoMatsFaz] = useState<{ id: string; numero: string; cartorio?: string; area_ha?: number }[]>([]);
  const [talhaoCarsFaz, setTalhaoCarsFaz] = useState<{ id: string; numero: string; status: string; area_ha?: number }[]>([]);
  const [modalMatricula, setModalMatricula] = useState<string | null>(null); // fazenda_id
  const [editMatricula, setEditMatricula]   = useState<MatriculaImovel | null>(null);
  const [fMat, setFMat]               = useState({ produtor_id: "", numero: "", cartorio: "", area_ha: "", descricao: "", em_garantia: false, garantia_banco: "", garantia_valor: "", garantia_vencimento: "" });

  // ── Empresas ──
  const [empresas, setEmpresas]       = useState<Empresa[]>([]);
  const [modalEmp, setModalEmp]       = useState(false);
  const [editEmp, setEditEmp]         = useState<Empresa | null>(null);
  const [fEmp, setFEmp]               = useState({ nome: "", razao_social: "", tipo: "pj" as "pf"|"pj", cpf_cnpj: "", inscricao_est: "", regime_tributario: "", produtor_id: "", municipio: "", estado: "MT", car: "", nirf: "", itr: "", email: "", email_relatorios: "", telefone: "" });

  // ── Pessoas ──
  const [pessoas, setPessoas]         = useState<Pessoa[]>([]);
  const [modalPes, setModalPes]       = useState(false);
  const [editPes, setEditPes]         = useState<Pessoa | null>(null);
  const [fPes, setFPes]               = useState({ nome: "", tipo: "pj" as "pf"|"pj", cliente: true, fornecedor: false, cpf_cnpj: "", inscricao_est: "", email: "", telefone: "", cep: "", logradouro: "", numero: "", complemento: "", bairro: "", municipio: "", estado: "MT", nome_contato: "", telefone_contato: "", banco_nome: "", banco_agencia: "", banco_conta: "", banco_tipo: "", pix_chave: "", pix_tipo: "", regime_tributario: "", cnae: "", situacao_cadastral: "", subcategorias: [] as string[], criar_deposito_terceiro: false });
  const [novaSubcat, setNovaSubcat]   = useState("");
  const [filtroPes,  setFiltroPes]    = useState({ subcat: "", busca: "" });
  const [buscandoCnpj, setBuscandoCnpj] = useState(false);

  // ── Safras ──
  const [anosSafra, setAnosSafra]     = useState<AnoSafra[]>([]);
  const [ciclos, setCiclos]           = useState<Ciclo[]>([]);
  const [anoSel, setAnoSel]           = useState<string | null>(null);
  const [modalAno, setModalAno]       = useState(false);
  const [editAno, setEditAno]         = useState<AnoSafra | null>(null);
  const [fAno, setFAno]               = useState({ descricao: "", data_inicio: "", data_fim: "" });
  const [modalCiclo, setModalCiclo]   = useState(false);
  const [editCiclo, setEditCiclo]     = useState<Ciclo | null>(null);
  const [fCiclo, setFCiclo]           = useState({ descricao: "", cultura: "Soja", data_inicio: "", data_fim: "", produtividade_esperada_sc_ha: "", preco_esperado_sc: "", is_auxiliar: false, ciclo_pai_id: "", absorcao_pct: "100", motivo_auxiliar: "", produto_agricola_id: "" });
  // talhões vinculados ao ciclo: { talhao_id -> area_plantada_ha (string para input) }
  const [cicloTalhoes, setCicloTalhoes] = useState<Record<string, string>>({});
  // área já comprometida por OUTROS ciclos que se sobrepõem no tempo: { talhao_id -> ha }
  const [ocupadoEmOutrosCiclos, setOcupado] = useState<Record<string, number>>({});

  // ── Máquinas ──
  const [maquinas, setMaquinas]       = useState<Maquina[]>([]);
  const [selMaquinas, setSelMaquinas] = useState<Set<string>>(new Set());
  const [contratsFinanc, setContratsFinanc] = useState<ContratoFinanceiro[]>([]);
  const [modalMaq, setModalMaq]       = useState(false);
  const [editMaq, setEditMaq]         = useState<Maquina | null>(null);
  const [fMaq, setFMaq]               = useState({ nome: "", tipo: "trator" as Maquina["tipo"], marca: "", modelo: "", ano: "", patrimonio: "", chassi: "", horimetro_atual: "", proprietario_id: "", nr_nf_aquisicao: "", data_aquisicao: "", valor_aquisicao: "", contrato_financiamento_id: "", status_financiamento: "proprio" as NonNullable<Maquina["status_financiamento"]>, data_quitacao: "", seguro_seguradora: "", seguro_corretora: "", seguro_numero_apolice: "", seguro_data_contratacao: "", seguro_vencimento_apolice: "", seguro_premio: "" });
  const [tabMaq, setTabMaq]           = useState<"geral" | "aquisicao" | "seguro">("geral");

  // ── Bombas ──
  const [bombas, setBombas]           = useState<BombaCombustivel[]>([]);
  const [modalBomba, setModalBomba]   = useState(false);
  const [editBomba, setEditBomba]     = useState<BombaCombustivel | null>(null);
  const [fBomba, setFBomba]           = useState({ nome: "", combustivel: "diesel_s10" as BombaCombustivel["combustivel"], capacidade_l: "", estoque_atual_l: "0", consume_estoque: true });

  // ── Funcionários ──
  const [funcs, setFuncs]                   = useState<Funcionario[]>([]);
  const [modalFunc, setModalFunc]           = useState(false);
  const [editFunc, setEditFunc]             = useState<Funcionario | null>(null);
  const [abaFunc, setAbaFunc]               = useState<"dados"|"remuneracao"|"premiacoes"|"ferias">("dados");
  const [fFunc, setFFunc]                   = useState({
    nome: "", cpf: "", rg: "", data_nascimento: "", pis_nis: "",
    ctps_numero: "", ctps_serie: "", ctps_uf: "",
    tipo: "clt" as Funcionario["tipo"], tipo_vinculo_esocial: "",
    funcao: "", data_admissao: "", data_demissao: "", ativo: true,
    salario_base: "", piso_categoria: "",
    fgts_pct: "8", inss_empregador_pct: "20", sat_rat_pct: "1", sistema_s_pct: "5.8",
    provisao_13_pct: "8.33", provisao_ferias_pct: "11.11", usar_funrural: false,
    banco_pagamento: "", agencia_pagamento: "", conta_pagamento: "",
    centro_custo_id: "", produtor_id: "",
  });
  const [premiacoes, setPremiacoes]         = useState<FuncionarioPremiacao[]>([]);
  const [ferias, setFerias]                 = useState<FuncionarioFerias[]>([]);
  const [modalPremiacao, setModalPremiacao] = useState(false);
  const [fPremiacao, setFPremiacao]         = useState({ mes_referencia: "", data_pagamento: "", descricao: "", valor: "" });
  const [modalGozo, setModalGozo]           = useState<FuncionarioFerias | null>(null);
  const [fGozo, setFGozo]                   = useState({ data_inicio_gozo: "", data_fim_gozo: "", dias_gozados: "30", abono_pecuniario: false, dias_abono: "10" });
  const [mesProcessar, setMesProcessar]     = useState(() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`; });
  const [processando, setProcessando]       = useState(false);

  // ── Imóveis Urbanos ──
  const [imoveisUrbanos, setImoveisUrbanos]   = useState<ImovelUrbano[]>([]);
  const [modalIU, setModalIU]                 = useState(false);
  const [editIU, setEditIU]                   = useState<ImovelUrbano | null>(null);
  const [fIU, setFIU]                         = useState({ matricula: "", tipo: "outro" as ImovelUrbano["tipo"], descricao: "", logradouro: "", numero_end: "", complemento: "", bairro: "", cep: "", municipio: "", estado: "MT", area_m2: "", valor_avaliacao: "", observacao: "" });

  // ── Depósitos ──
  const [depositos, setDepositos]     = useState<Deposito[]>([]);
  const [modalDep, setModalDep]       = useState(false);
  const [editDep, setEditDep]         = useState<Deposito | null>(null);
  const [fDep, setFDep]               = useState({ nome: "", tipo: "insumo_fazenda" as Deposito["tipo"], capacidade_sc: "" });

  // ── Contas Bancárias ──
  const [contas, setContas]           = useState<ContaBancaria[]>([]);
  const [bancos, setBancos]           = useState<Banco[]>([]);
  const [modalConta, setModalConta]   = useState(false);
  const [editConta, setEditConta]     = useState<ContaBancaria | null>(null);
  const [fConta, setFConta]           = useState({ nome: "", banco_id: "", banco: "", agencia: "", agencia_dv: "", conta: "", conta_dv: "", moeda: "BRL" as "BRL"|"USD", ativa: true, empresa_id: "", tipo_conta: "corrente" as "corrente"|"poupanca"|"investimento"|"caixa"|"transitoria", saldo_inicial: "" });

  // ── Insumos ──
  const [insumos, setInsumos]         = useState<Insumo[]>([]);
  const [filtroIns, setFiltroIns]     = useState("todos");
  const [buscaIns, setBuscaIns]       = useState("");
  const [filtroCult, setFiltroCult]   = useState("todos");
  const [buscaProd, setBuscaProd]     = useState("");
  const [filtroIt, setFiltroIt]       = useState("todos");
  const [buscaIt, setBuscaIt]         = useState("");
  const [modalIns, setModalIns]       = useState(false);
  const [editIns, setEditIns]         = useState<Insumo | null>(null);
  const [fIns, setFIns]               = useState({
    nome: "", categoria: "defensivo" as Insumo["categoria"],
    subgrupo: "", unidade: "L" as Insumo["unidade"],
    fabricante: "", estoque: "0", estoque_minimo: "0",
    valor_unitario: "0", lote: "", validade: "",
    deposito_id: "", bomba_id: "", principio_ativo_id: "",
  });

  // ── Tabelas Auxiliares ──
  type SubAbaAux = "grupos_insumo" | "tipos_pessoa" | "centros_custo" | "categorias";
  const [subAbaAux, setSubAbaAux]             = useState<SubAbaAux>("grupos_insumo");
  const [gruposInsumo, setGruposInsumo]       = useState<GrupoInsumo[]>([]);
  const [subgruposInsumo, setSubgruposInsumo] = useState<SubgrupoInsumo[]>([]);
  const [seedingGrupos, setSeedingGrupos]       = useState(false);
  const [seedingSafras, setSeedingSafras]       = useState(false);
  const [seedingProdutos, setSeedingProdutos]   = useState(false);
  const [tiposPessoa, setTiposPessoa]         = useState<TipoPessoa[]>([]);
  const [centrosCusto, setCentrosCusto]       = useState<CentroCusto[]>([]);
  const [categoriasLanc, setCategoriasLanc]   = useState<CategoriaLancamento[]>([]);
  // modais aux
  const [modalGrupoIns, setModalGrupoIns]     = useState(false);
  const [editGrupoIns, setEditGrupoIns]       = useState<GrupoInsumo | null>(null);
  const [fGrupoIns, setFGrupoIns]             = useState({ nome: "", cor: "#1A4870" });
  const [modalSubgIns, setModalSubgIns]       = useState(false);
  const [editSubgIns, setEditSubgIns]         = useState<SubgrupoInsumo | null>(null);
  const [fSubgIns, setFSubgIns]               = useState({ nome: "", grupo_id: "" });
  const [modalTipoPes, setModalTipoPes]       = useState(false);
  const [editTipoPes, setEditTipoPes]         = useState<TipoPessoa | null>(null);
  const [fTipoPes, setFTipoPes]               = useState({ nome: "", descricao: "" });
  const [modalCC, setModalCC]                 = useState(false);
  const [editCC, setEditCC]                   = useState<CentroCusto | null>(null);
  const [fCC, setFCC]                         = useState({ codigo: "", nome: "", tipo: "despesa" as CentroCusto["tipo"], parent_id: "", manutencao_maquinas: false });
  const [modalCatLanc, setModalCatLanc]       = useState(false);
  const [editCatLanc, setEditCatLanc]         = useState<CategoriaLancamento | null>(null);
  const [fCatLanc, setFCatLanc]               = useState({ nome: "", tipo: "ambos" as CategoriaLancamento["tipo"] });

  // ── Operações Gerenciais / Plano de Contas ──
  const [opGers, setOpGers]           = useState<OperacaoGerencial[]>([]);
  const [planoContasDB, setPlanoContasDB] = useState<ContaContabil[]>([]);
  const [modalOpGer, setModalOpGer]   = useState(false);
  const [editOpGer, setEditOpGer]     = useState<OperacaoGerencial | null>(null);
  const [abaOpGer, setAbaOpGer]       = useState<"principal"|"estoque"|"fiscal"|"financeiro"|"contabilidade"|"cfop">("principal");
  const [erroOpGer, setErroOpGer]     = useState<string | null>(null);
  const [cfopsOp, setCfopsOp]         = useState<import("../../lib/supabase").OperacaoCfopFiscal[]>([]);
  const [loadingCfops, setLoadingCfops] = useState(false);
  const [modalCfop, setModalCfop]     = useState(false);
  const [fCfop, setFCfop]             = useState({ cfop: "", descricao_cfop: "", cst_pis: "08", cst_cofins: "08", tipo_pessoa: "Indiferente", ncm: "", fins_exportacao: false, compoe_faturamento: true });
  const OG_VAZIO = {
    parent_id: "",
    classificacao: "", descricao: "", tipo: "despesa" as OperacaoGerencial["tipo"],
    tipo_lcdpr: "",
    permite_notas_fiscais: false, permite_cp_cr: false, permite_adiantamentos: false,
    permite_tesouraria: false, permite_baixas: false, permite_custo_produto: false,
    permite_contrato_financeiro: false, permite_estoque: false, permite_pedidos_venda: false,
    permite_manutencao: false, marcar_fiscal_padrao: false, permite_energia_eletrica: false,
    operacao_estoque: "" as OperacaoGerencial["operacao_estoque"] | "",
    tipo_custo_estoque: "nenhum" as OperacaoGerencial["tipo_custo_estoque"],
    obs_legal: "", natureza_receita: "", impostos: [] as string[],
    gerar_financeiro: false, gerar_financeiro_gerencial: false, valida_propriedade: false,
    custo_absorcao: false, custo_abc: false, atualizar_custo_estoque: false,
    manutencao_reparos: false, gerar_depreciacao: false,
    tipo_formula: "" as OperacaoGerencial["tipo_formula"] | "", modelo_contabil: "",
    inativo: false, informa_complemento: false,
    conta_debito: "", conta_credito: "",
    historico_tesouraria_id: "" as number | "",
    historico_tesouraria_nome: "",
  };
  const [fOG, setFOG] = useState({ ...OG_VAZIO });

  const [seedingOpGer, setSeedingOpGer] = useState(false);
  const [seedingCfop, setSeedingCfop] = useState(false);

  // ── Histórico Fiscal (leitura) ──
  type HisFiscalRow = {
    id: string; cfop: string; descricao_cfop: string | null;
    operacao_nf: string | null; tipo_pessoa: string | null;
    cst_pis: string | null; cst_cofins: string | null;
    ncm: string | null; fins_exportacao: boolean; compoe_faturamento: boolean;
    op_classificacao: string; op_descricao: string; op_tipo: string;
  };
  const [hisFiscal, setHisFiscal]           = useState<HisFiscalRow[]>([]);
  const [loadingHisFiscal, setLoadingHisFiscal] = useState(false);
  const [hfBusca, setHfBusca]               = useState("");
  const [hfFiltroCfop, setHfFiltroCfop]     = useState("");
  const [hfFiltroTipo, setHfFiltroTipo]     = useState<""|"receita"|"despesa">("");
  const [hfFiltroNf, setHfFiltroNf]         = useState("");

  // ── Formas de Pagamento ──
  const [formasPagamento, setFormasPagamento] = useState<FormaPagamento[]>([]);
  const [modalFP, setModalFP]                 = useState(false);
  const [editFP, setEditFP]                   = useState<FormaPagamento | null>(null);
  const [fFP, setFFP]                         = useState({ nome: "", parcelas: "", dias: "", descricao: "" });

  // ── Usuários ──
  const [grupos, setGrupos]           = useState<GrupoUsuario[]>([]);
  const [usuarios, setUsuarios]       = useState<Usuario[]>([]);
  const [subAbaUser, setSubAbaUser]   = useState<"grupos"|"usuarios">("grupos");
  const [modalGrupo, setModalGrupo]   = useState(false);
  const [editGrupo, setEditGrupo]     = useState<GrupoUsuario | null>(null);
  const [fGrupo, setFGrupo]           = useState({ nome: "", descricao: "", permissoes: {} as Record<string, string> });
  const [modalUser, setModalUser]     = useState(false);
  const [editUser, setEditUser]       = useState<Usuario | null>(null);
  const [fUser, setFUser]             = useState({ nome: "", email: "", grupo_id: "", whatsapp: "" });

  // ── Princípios Ativos ──
  const [principios, setPrincipios]         = useState<PrincipioAtivo[]>([]);
  const [nomesComerciais, setNomesComerciais] = useState<NomeComercial[]>([]);
  const [paBusca, setPaBusca]               = useState("");
  const [paCategoria, setPaCategoria]       = useState("");
  const [paExpandido, setPaExpandido]       = useState<string | null>(null); // id do PA expandido
  const [modalPA, setModalPA]               = useState(false);
  const [editPA, setEditPA]                 = useState<PrincipioAtivo | null>(null);
  const [fPA, setFPA]                       = useState({ nome: "", categoria: "herbicida" as PrincipioAtivo["categoria"], unidade: "L" as PrincipioAtivo["unidade"], observacao: "" });
  const [modalNC, setModalNC]               = useState<string | null>(null); // principio_ativo_id
  const [fNC, setFNC]                       = useState({ nome_comercial: "" });
  const [salvandobotPA, setSalvandoPA]      = useState(false);

  // ── Unidades de Medida ──
  const [unidades, setUnidades]           = useState<UnidadeMedida[]>([]);
  const [modalUM, setModalUM]             = useState(false);
  const [editUM, setEditUM]               = useState<UnidadeMedida | null>(null);
  const [fUM, setFUM]                     = useState({ sigla: "", nome: "", tipo: "quantidade" as UnidadeMedida["tipo"], fator_base: "", base_sigla: "", inativo: false });
  const [salvandoUM, setSalvandoUM]       = useState(false);
  const [umBusca, setUmBusca]             = useState("");
  const [umTipo, setUmTipo]               = useState("");

  // ── Culturas ──
  const [culturasList, setCulturasList]   = useState<CulturaItem[]>([]);
  const [insumosPA, setInsumosPA]         = useState<Insumo[]>([]);   // produto_agricola para vínculo
  const [modalCultura, setModalCultura]   = useState(false);
  const [editCultura, setEditCultura]     = useState<CulturaItem | null>(null);
  const [fCultura, setFCultura]           = useState({ nome: "", categoria: "graos", unidade: "sc", ncm: "", observacao: "", ativa: true, ordem: "", fator_conversao_kg: "60" });
  const [salvandoCultura, setSalvandoCultura] = useState(false);
  const [culturaBusca, setCulturaBusca]   = useState("");

  // ── Padrões de Classificação ──
  const [padroesCls, setPadroesCls]     = useState<PadraoClassificacao[]>([]);
  const [modalPCls, setModalPCls]       = useState(false);
  const [editPCls, setEditPCls]         = useState<PadraoClassificacao | null>(null);
  const [fPCls, setFPCls]               = useState({
    commodity: "Soja", nome_padrao: "", ativo: true,
    umidade_padrao: "14", impureza_padrao: "1", avariados_padrao: "8",
    ardidos_max: "8", mofados_max: "", esverdeados_max: "8",
    quebrados_max: "30", ph_minimo: "78",
    carunchados_max: "3", kg_saca: "60",
  });

  // ── Carregar dados conforme aba ──
  useEffect(() => {
    if (!fazendaId) return;
    setErro(null);
    const carregarProdutores = () => contaId
      ? listarProdutoresDaConta(contaId, fazendaId ?? undefined).then(setProdutores).catch(e => setErro(e.message))
      : listarProdutores(fazendaId).then(setProdutores).catch(e => setErro(e.message));
    const carregarProdutoresSilencioso = () => contaId
      ? listarProdutoresDaConta(contaId, fazendaId ?? undefined).then(setProdutores).catch(() => {})
      : listarProdutores(fazendaId).then(setProdutores).catch(() => {});

    if (aba === "produtores")  carregarProdutores();
    if (aba === "fazendas") {
      if (userRole === "raccotlo" && (contaId || fazendaId)) {
        // Raccotlo admin: usa endpoint server-side (service role) para listar todas as fazendas da conta do cliente
        fetch("/api/fazenda/da-conta", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ conta_id: contaId, fazenda_id: fazendaId }),
        })
          .then(r => r.json())
          .then(json => {
            if (json.ok) setFazendas(json.fazendas ?? []);
            else setErro(json.error ?? "Erro ao carregar fazendas");
          })
          .catch(e => setErro(e.message));
      } else {
        listarFazendas().then(setFazendas).catch(e => setErro(e.message));
      }
      carregarProdutoresSilencioso();
      listarEmpresas(fazendaId).then(emps => {
        setEmpresas(emps);
        // Rebuild mapa produtor → empresa para Produtores PJ
        const map: Record<string, string> = {};
        emps.forEach(e => { if (e.produtor_id) map[e.produtor_id] = e.id; });
        setProdEmpresaMap(map);
      }).catch(() => {});
      listarPessoas(fazendaId).then(setPessoas).catch(() => {});
    }
    if (aba === "pessoas")     listarPessoas(fazendaId).then(setPessoas).catch(e => setErro(e.message));
    if (aba === "safras")      listarAnosSafra(fazendaId).then(setAnosSafra).catch(e => setErro(e.message));
    if (aba === "maquinas") {
      listarMaquinas(fazendaId).then(setMaquinas).catch(e => setErro(e.message));
      listarPessoas(fazendaId).then(setPessoas).catch(() => {});
      listarContratosFinanceiros(fazendaId).then(setContratsFinanc).catch(() => {});
    }
    if (aba === "combustivel") listarBombas(fazendaId).then(setBombas).catch(e => setErro(e.message));
    if (aba === "insumos" || aba === "produtos" || aba === "itens") {
      listarInsumos(fazendaId).then(async lista => {
        setInsumos(lista);
        // Auto-seed na primeira abertura da aba Produtos se não há nenhum produto agrícola
        if (aba === "produtos" && lista.filter(i => i.categoria === "produto_agricola").length === 0) {
          try {
            await seederProdutosAgricolas(fazendaId);
            listarInsumos(fazendaId).then(setInsumos).catch(() => {});
          } catch {}
        }
      }).catch(e => setErro(e.message));
      listarGruposInsumo(fazendaId).then(setGruposInsumo).catch(() => {});
      listarSubgruposInsumo(fazendaId).then(setSubgruposInsumo).catch(() => {});
      listarDepositos(fazendaId).then(setDepositos).catch(() => {});
      listarBombas(fazendaId).then(setBombas).catch(() => {});
      listarPrincipiosAtivos().then(setPrincipios).catch(() => {});
    }
    if (aba === "depositos")       listarDepositos(fazendaId).then(setDepositos).catch(e => setErro(e.message));
    if (aba === "imoveis_urbanos") listarImoveisUrbanos(fazendaId).then(setImoveisUrbanos).catch(e => setErro(e.message));
    if (aba === "contas_bancarias") {
      listarContas(fazendaId).then(setContas).catch(e => setErro(e.message));
      if (bancos.length === 0) listarBancos().then(setBancos).catch(() => {});
      if (produtores.length === 0) carregarProdutoresSilencioso();
    }
    if (aba === "funcionarios") {
      listarFuncionarios(fazendaId).then(setFuncs).catch(e => setErro(e.message));
      if (produtores.length === 0) carregarProdutoresSilencioso();
      if (centrosCusto.length === 0) listarCentrosCustoGeral(fazendaId).then(setCentrosCusto).catch(() => {});
    }
    if (aba === "grupos_insumo") {
      listarGruposInsumo(fazendaId).then(async lista => {
        if (lista.length === 0) {
          // Auto-seed na primeira vez que o usuário abre a aba sem grupos
          await seederGruposInsumo(fazendaId);
          const [g, s] = await Promise.all([listarGruposInsumo(fazendaId), listarSubgruposInsumo(fazendaId)]);
          setGruposInsumo(g);
          setSubgruposInsumo(s);
        } else {
          setGruposInsumo(lista);
          listarSubgruposInsumo(fazendaId).then(setSubgruposInsumo).catch(() => {});
        }
      }).catch(e => setErro(e.message));
    }
    if (aba === "centros_custo")    listarCentrosCustoGeral(fazendaId).then(setCentrosCusto).catch(e => setErro(e.message));
    if (aba === "formas_pagamento")     listarFormasPagamento(fazendaId).then(setFormasPagamento).catch(e => setErro(e.message));
    if (aba === "operacoes_gerenciais") {
      listarOperacoesGerenciais(fazendaId).then(setOpGers).catch(e => setErro(e.message));
      listarPlanoContas(fazendaId).then(r => setPlanoContasDB(r.length > 0 ? r : planoContasPadrao)).catch(() => setPlanoContasDB(planoContasPadrao));
    }
    if (aba === "padroes_classificacao") supabase.from("padroes_classificacao").select("*").eq("fazenda_id", fazendaId).order("commodity").order("nome_padrao").then(({ data, error }) => { if (error) setErro(error.message); else setPadroesCls((data ?? []) as PadraoClassificacao[]); });
    if (aba === "principios_ativos") {
      listarPrincipiosAtivos().then(setPrincipios).catch(e => setErro(e.message));
      listarNomesComerciais().then(setNomesComerciais).catch(() => {});
    }
    if (aba === "unidades_medida") {
      supabase.from("unidades_medida").select("*").order("tipo").order("sigla")
        .then(({ data, error }) => { if (error) setErro(error.message); else setUnidades((data ?? []) as UnidadeMedida[]); });
    }
    if (aba === "culturas" || aba === "safras") {
      // Carrega insumos produto_agricola — auto-seed se vazio
      supabase.from("insumos").select("id,nome,unidade").eq("fazenda_id", fazendaId).eq("categoria","produto_agricola").order("nome")
        .then(async ({ data }) => {
          if (data && data.length > 0) { setInsumosPA(data as Insumo[]); return; }
          await supabase.from("insumos").insert([
            { fazenda_id: fazendaId, tipo: "produto", nome: "Soja",             categoria: "produto_agricola", unidade: "sc",     estoque: 0, estoque_minimo: 0, valor_unitario: 0 },
            { fazenda_id: fazendaId, tipo: "produto", nome: "Milho",            categoria: "produto_agricola", unidade: "sc",     estoque: 0, estoque_minimo: 0, valor_unitario: 0 },
            { fazenda_id: fazendaId, tipo: "produto", nome: "Algodão em Pluma", categoria: "produto_agricola", unidade: "outros", estoque: 0, estoque_minimo: 0, valor_unitario: 0 },
            { fazenda_id: fazendaId, tipo: "produto", nome: "Arroz",            categoria: "produto_agricola", unidade: "sc",     estoque: 0, estoque_minimo: 0, valor_unitario: 0 },
            { fazenda_id: fazendaId, tipo: "produto", nome: "Trigo",            categoria: "produto_agricola", unidade: "sc",     estoque: 0, estoque_minimo: 0, valor_unitario: 0 },
            { fazenda_id: fazendaId, tipo: "produto", nome: "Sorgo",            categoria: "produto_agricola", unidade: "sc",     estoque: 0, estoque_minimo: 0, valor_unitario: 0 },
          ]);
          const { data: seeded } = await supabase.from("insumos").select("id,nome,unidade").eq("fazenda_id", fazendaId).eq("categoria","produto_agricola").order("nome");
          setInsumosPA((seeded ?? []) as Insumo[]);
        });
      supabase.from("culturas").select("*").eq("fazenda_id", fazendaId).order("ordem").order("nome")
        .then(async ({ data, error }) => {
          if (error) return;
          if (!data || data.length === 0) {
            // Auto-seed via API route com service_role_key (bypass RLS para admin Raccotlo)
            const res = await fetch("/api/culturas-seed", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ fazenda_id: fazendaId }),
            });
            if (res.ok) {
              const json = await res.json();
              setCulturasList((json.culturas ?? []) as CulturaItem[]);
            }
          } else {
            setCulturasList(data as CulturaItem[]);
          }
        });
    }
    if (aba === "historico_fiscal") {
      setLoadingHisFiscal(true);
      supabase
        .from("operacao_cfop_fiscal")
        .select("*, operacoes_gerenciais(classificacao, descricao, tipo)")
        .eq("fazenda_id", fazendaId)
        .eq("ativo", true)
        .order("cfop")
        .then(({ data, error }) => {
          setLoadingHisFiscal(false);
          if (error) { setErro(error.message); return; }
          setHisFiscal((data ?? []).map((r: Record<string, unknown>) => {
            const op = (r.operacoes_gerenciais as Record<string, string> | null) ?? {};
            return {
              id:               String(r.id),
              cfop:             String(r.cfop ?? ""),
              descricao_cfop:   r.descricao_cfop as string | null,
              operacao_nf:      r.operacao_nf as string | null,
              tipo_pessoa:      r.tipo_pessoa as string | null,
              cst_pis:          r.cst_pis as string | null,
              cst_cofins:       r.cst_cofins as string | null,
              ncm:              r.ncm as string | null,
              fins_exportacao:  Boolean(r.fins_exportacao),
              compoe_faturamento: Boolean(r.compoe_faturamento),
              op_classificacao: op.classificacao ?? "—",
              op_descricao:     op.descricao ?? "—",
              op_tipo:          op.tipo ?? "",
            };
          }));
        });
    }
  }, [aba, fazendaId]);

  // Carrega talhões/matrículas ao expandir fazenda
  const toggleFaz = async (id: string) => {
    setExpandFaz(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s; });
    if (!talhoes[id]) {
      const [t, m] = await Promise.all([listarTalhoes(id), listarMatriculas(id).catch(() => [] as MatriculaImovel[])]);
      setTalhoes(prev => ({ ...prev, [id]: t }));
      setMatriculas(prev => ({ ...prev, [id]: m }));
    }
  };

  // Carrega ciclos ao selecionar Ano Safra
  const selecionarAno = async (id: string) => {
    setAnoSel(id);
    listarCiclos(id).then(setCiclos).catch(() => setCiclos([]));
  };

  // ── Helpers de save ──
  async function salvar(fn: () => Promise<void>) {
    try {
      setSalvando(true);
      await fn();
    } catch (e: unknown) {
      // Extrai detalhes do erro Supabase (PostgrestError) ou erro padrão
      let msg = "Erro desconhecido";
      if (e && typeof e === "object") {
        const pe = e as Record<string, unknown>;
        const parts: string[] = [];
        if (pe.message)  parts.push(String(pe.message));
        if (pe.details)  parts.push("Detalhe: " + String(pe.details));
        if (pe.hint)     parts.push("Dica: " + String(pe.hint));
        if (pe.code)     parts.push("Código: " + String(pe.code));
        if (parts.length) msg = parts.join("\n");
      }
      console.error("Erro ao salvar:", e);
      alert(msg);
    } finally {
      setSalvando(false);
    }
  }

  // ─────────────── PRODUTORES ───────────────
  const abrirModalProd = async (p?: Produtor) => {
    setEditProd(p ?? null);
    // Para Produtor PJ em edição, carrega dados da empresa vinculada
    let empVinculada: Empresa | null = null;
    if (p?.tipo === "pj") {
      const empList = await listarEmpresas(p.fazenda_id);
      empVinculada = empList.find(e => e.produtor_id === p.id) ?? null;
    }
    setFProd(p ? {
      nome: p.nome, tipo: p.tipo, incra: p.incra ?? "", cpf_cnpj: p.cpf_cnpj ?? "",
      inscricao_est: p.inscricao_est ?? "", email: p.email ?? "", telefone: p.telefone ?? "",
      cep: p.cep ?? "", logradouro: p.logradouro ?? "", numero: p.numero ?? "",
      complemento: p.complemento ?? "", bairro: p.bairro ?? "",
      municipio: p.municipio ?? "", estado: p.estado ?? "MT",
      razao_social: empVinculada?.razao_social ?? "",
      regime_tributario: empVinculada?.regime_tributario ?? "",
      car: empVinculada?.car ?? "", nirf: empVinculada?.nirf ?? "", itr: empVinculada?.itr ?? "",
      email_relatorios: empVinculada?.email_relatorios ?? "",
      _empresaId: empVinculada?.id ?? "",
    } : {
      nome: "", tipo: "pf", incra: "", cpf_cnpj: "", inscricao_est: "", email: "", telefone: "",
      cep: "", logradouro: "", numero: "", complemento: "", bairro: "", municipio: "", estado: "MT",
      razao_social: "", regime_tributario: "", car: "", nirf: "", itr: "", email_relatorios: "", _empresaId: "",
    });
    setTabProd("dados");
    setNewIE({ inscricao_estadual: "", municipio: "", estado: "MT", fazenda_id: "" });
    setProdIEs(p ? await listarIEsDoProdutor(p.id, fazendaId ?? undefined) : []);
    setModalProd(true);
  };

  const buscarCepProd = async (cep: string) => {
    const limpo = cep.replace(/\D/g, "");
    if (limpo.length !== 8) return;
    setBuscandoCep(true);
    try {
      const res = await fetch(`https://viacep.com.br/ws/${limpo}/json/`);
      const d = await res.json();
      if (!d.erro) {
        setFProd(p => ({
          ...p,
          logradouro: d.logradouro ?? p.logradouro,
          bairro:     d.bairro     ?? p.bairro,
          municipio:  d.localidade ?? p.municipio,
          estado:     d.uf         ?? p.estado,
        }));
      }
    } catch { /* silencioso — usuário preenche manualmente */ }
    finally { setBuscandoCep(false); }
  };
  const salvarProd = () => salvar(async () => {
    if (!fProd.nome.trim()) return;
    // Resolve fazenda_id — obrigatório no DB
    let fazIdProd = fazendaId;
    if (!fazIdProd) {
      // Tenta a primeira fazenda da lista carregada (raccotlo acessando cliente ou cliente com múltiplas fazendas)
      fazIdProd = fazendas[0]?.id ?? null;
    }
    if (!fazIdProd) {
      alert("Cadastre uma fazenda antes de adicionar um produtor.");
      return;
    }
    const pp: Omit<Produtor, "id" | "created_at"> = {
      fazenda_id: fazIdProd,
      conta_id: contaId ?? undefined,
      nome: fProd.nome.trim(), tipo: fProd.tipo,
      incra: fProd.incra || undefined,
      cpf_cnpj: fProd.cpf_cnpj || undefined,
      inscricao_est: fProd.inscricao_est || undefined,
      email: fProd.email || undefined,
      telefone: fProd.telefone || undefined,
      cep: fProd.cep || undefined,
      logradouro: fProd.logradouro || undefined,
      numero: fProd.numero || undefined,
      complemento: fProd.complemento || undefined,
      bairro: fProd.bairro || undefined,
      municipio: fProd.municipio || undefined,
      estado: fProd.estado || undefined,
    };
    let prodId: string;
    if (editProd) {
      await atualizarProdutor(editProd.id, pp);
      setProdutores(p => p.map(x => x.id === editProd.id ? { ...x, ...pp } : x));
      prodId = editProd.id;
    } else {
      const n = await criarProdutor(pp);
      setProdutores(p => [...p, n]);
      prodId = n.id;
    }
    // Se PJ → sincronizar/criar Empresa vinculada automaticamente
    if (fProd.tipo === "pj") {
      const empPayload: Omit<Empresa, "id" | "created_at"> = {
        fazenda_id: fazIdProd,
        produtor_id: prodId,
        nome: fProd.nome.trim(),
        razao_social: fProd.razao_social || fProd.nome.trim(),
        tipo: "pj",
        cpf_cnpj: fProd.cpf_cnpj || undefined,
        inscricao_est: fProd.inscricao_est || undefined,
        regime_tributario: fProd.regime_tributario || undefined,
        municipio: fProd.municipio || undefined,
        estado: fProd.estado || undefined,
        car: fProd.car || undefined,
        nirf: fProd.nirf || undefined,
        itr: fProd.itr || undefined,
        email: fProd.email || undefined,
        email_relatorios: fProd.email_relatorios || undefined,
        telefone: fProd.telefone || undefined,
      };
      let empId = fProd._empresaId;
      if (empId) {
        await atualizarEmpresa(empId, empPayload);
        setEmpresas(prev => prev.map(x => x.id === empId ? { ...x, ...empPayload } : x));
      } else {
        const nova = await criarEmpresa(empPayload);
        empId = nova.id;
        setEmpresas(prev => [...prev, nova]);
      }
      setProdEmpresaMap(prev => ({ ...prev, [prodId]: empId }));
    }
    await salvarIEsDoProdutor(prodId, prodIEs.map(ie => ({
      produtor_id: prodId,
      fazenda_id: fazendaId ?? null,
      inscricao_estadual: ie.inscricao_estadual,
      municipio: ie.municipio ?? null,
      estado: ie.estado,
      ativa: ie.ativa,
    })), fazendaId ?? undefined);
    setModalProd(false);
  });

  // ─────────────── FAZENDAS ───────────────
  const buscarCepIU = async (cep: string) => {
    const limpo = cep.replace(/\D/g, "");
    if (limpo.length !== 8) return;
    try {
      const res = await fetch(`https://viacep.com.br/ws/${limpo}/json/`);
      const d = await res.json();
      if (!d.erro) setFIU(p => ({ ...p, logradouro: d.logradouro ?? p.logradouro, bairro: d.bairro ?? p.bairro, municipio: d.localidade ?? p.municipio, estado: d.uf ?? p.estado }));
    } catch { /* silencioso */ }
  };

  const buscarCepFaz = async (cep: string) => {
    const limpo = cep.replace(/\D/g, "");
    if (limpo.length !== 8) return;
    setBuscandoCepFaz(true);
    try {
      const res = await fetch(`https://viacep.com.br/ws/${limpo}/json/`);
      const d = await res.json();
      if (!d.erro) {
        setFFaz(p => ({
          ...p,
          logradouro: d.logradouro ?? p.logradouro,
          bairro:     d.bairro     ?? p.bairro,
          municipio:  d.localidade ?? p.municipio,
          estado:     d.uf         ?? p.estado,
        }));
        setCepAutoOk(true);
        setTimeout(() => setCepAutoOk(false), 3000);
      }
    } catch { /* silencioso */ }
    finally { setBuscandoCepFaz(false); }
  };

  const _fFazVazio = () => ({
    nome: "", municipio: "", estado: "MT", area: "", cnpj: "",
    produtor_id: "", empresa_id: "",
    cep: "", logradouro: "", numero_end: "", complemento: "", bairro: "",
  });

  const abrirModalFaz = async (f?: FazendaDB) => {
    setEditFaz(f ?? null);
    setTabFaz("geral");
    setCepAutoOk(false);
    setFFaz(f ? {
      nome: f.nome, municipio: f.municipio, estado: f.estado,
      area: String(f.area_total_ha), cnpj: f.cnpj ?? "",
      produtor_id: f.produtor_id ?? "", empresa_id: f.empresa_id ?? "",
      cep: f.cep ?? "", logradouro: f.logradouro ?? "",
      numero_end: f.numero_end ?? "", complemento: f.complemento ?? "",
      bairro: f.bairro ?? "",
    } : _fFazVazio());
    // Carrega matrículas da fazenda para edição inline
    if (f) {
      const mats = matriculas[f.id] ?? [];
      setFazMatsLocal(mats.map(m => ({
        _key: m.id, id: m.id,
        produtor_id: m.produtor_id ?? "", numero: m.numero,
        cartorio: m.cartorio ?? "", area_ha: String(m.area_ha ?? ""),
        descricao: m.descricao ?? "", em_garantia: m.em_garantia ?? false,
        garantia_banco: m.garantia_banco ?? "", garantia_valor: String(m.garantia_valor ?? ""),
        garantia_vencimento: m.garantia_vencimento ?? "",
      })));
      // Carrega arrendamentos
      try {
        const arrs = await listarArrendamentos(f.id);
        setFazArrendamentos(arrs.map(a => ({
          _key: a.id, id: a.id,
          proprietario_id: a.proprietario_id ?? "",
          proprietario_nome: a.proprietario_nome ?? "",
          area_ha: String(a.area_ha),
          forma_pagamento: a.forma_pagamento,
          sc_ha: String(a.sc_ha ?? ""),
          sc_milho_ha: String((a as { sc_milho_ha?: number | null }).sc_milho_ha ?? ""),
          valor_brl: String(a.valor_brl ?? ""),
          ano_safra_id: a.ano_safra_id ?? "",
          inicio: a.inicio ?? "",
          vencimento: a.vencimento ?? "",
          renovacao_auto: a.renovacao_auto ?? false,
          observacao: a.observacao ?? "",
          produtor_id: (a as { produtor_id?: string | null }).produtor_id ?? "",
          produtor_id_2: (a as { produtor_id_2?: string | null }).produtor_id_2 ?? "",
          aberto: false,
          mats: [],
        })));
      } catch { setFazArrendamentos([]); }
      // Carrega CARs múltiplos
      try {
        const { data: carsData } = await supabase.from("fazenda_cars").select("*, car_matriculas(matricula_id)").eq("fazenda_id", f.id).order("created_at");
        setFazCars((carsData ?? []).map((c: Record<string, unknown>) => ({
          _key: String(c.id), id: String(c.id),
          numero: String(c.numero ?? ""), status: String(c.status ?? "ativo"),
          area_ha: String(c.area_ha ?? ""), vencimento: String(c.vencimento ?? ""),
          observacao: String(c.observacao ?? ""),
          mats_vinculadas: ((c.car_matriculas as Array<{ matricula_id: string }>) ?? []).map((m) => m.matricula_id),
        })));
      } catch { setFazCars([]); }
      // Carrega NIRFs múltiplos
      try {
        const { data: nirfsData } = await supabase.from("fazenda_nirfs").select("*, nirf_matriculas(matricula_id)").eq("fazenda_id", f.id).order("created_at");
        setFazNirfs((nirfsData ?? []).map((n: Record<string, unknown>) => ({
          _key: String(n.id), id: String(n.id),
          numero: String(n.numero ?? ""), situacao: String(n.situacao ?? "ativo"),
          area_ha: String(n.area_ha ?? ""), observacao: String(n.observacao ?? ""),
          mats_vinculadas: ((n.nirf_matriculas as Array<{ matricula_id: string }>) ?? []).map((m) => m.matricula_id),
        })));
      } catch { setFazNirfs([]); }
      // Carrega ITRs múltiplos
      try {
        const { data: itrsData } = await supabase.from("fazenda_itrs").select("*, itr_matriculas(matricula_id)").eq("fazenda_id", f.id).order("exercicio", { ascending: false });
        setFazItrs((itrsData ?? []).map((t: Record<string, unknown>) => ({
          _key: String(t.id), id: String(t.id),
          exercicio: String(t.exercicio ?? ""), numero_declaracao: String(t.numero_declaracao ?? ""),
          nirf_numero: String(t.nirf_numero ?? ""), vencimento: String(t.vencimento ?? ""),
          area_tributavel_ha: String(t.area_tributavel_ha ?? ""), valor_apurado: String(t.valor_apurado ?? ""),
          status_pagamento: String(t.status_pagamento ?? "pendente"), observacao: String(t.observacao ?? ""),
          mats_vinculadas: ((t.itr_matriculas as Array<{ matricula_id: string }>) ?? []).map((m) => m.matricula_id),
        })));
      } catch { setFazItrs([]); }
      // Carrega CCIRs múltiplos
      try {
        const { data: ccirsData } = await supabase.from("fazenda_ccirs").select("*, ccir_matriculas(matricula_id)").eq("fazenda_id", f.id).order("exercicio", { ascending: false });
        setFazCcirs((ccirsData ?? []).map((c: Record<string, unknown>) => ({
          _key: String(c.id), id: String(c.id),
          numero: String(c.numero ?? ""), exercicio: String(c.exercicio ?? ""),
          vencimento: String(c.vencimento ?? ""), area_ha: String(c.area_ha ?? ""),
          modulo_fiscal: String(c.modulo_fiscal ?? ""), situacao: String(c.situacao ?? "regular"),
          observacao: String(c.observacao ?? ""),
          mats_vinculadas: ((c.ccir_matriculas as Array<{ matricula_id: string }>) ?? []).map((m) => m.matricula_id),
        })));
      } catch { setFazCcirs([]); }
    } else {
      setFazMatsLocal([]);
      setFazArrendamentos([]);
      setFazCars([]);
      setFazNirfs([]);
      setFazItrs([]);
      setFazCcirs([]);
    }
    setModalFaz(true);
  };

  const salvarFaz = () => salvar(async () => {
    if (!fFaz.nome.trim() || !fFaz.area) return;
    const { data: { user } } = await supabase.auth.getUser();

    // Campos de formulário — nunca incluem owner_user_id/conta_id (imutáveis)
    const camposForm = {
      nome: fFaz.nome.trim(), municipio: fFaz.municipio.trim(), estado: fFaz.estado,
      area_total_ha: Number(fFaz.area), cnpj: fFaz.cnpj || undefined,
      produtor_id: fFaz.produtor_id || undefined, empresa_id: fFaz.empresa_id || undefined,
      cep: fFaz.cep || undefined, logradouro: fFaz.logradouro || undefined,
      numero_end: fFaz.numero_end || undefined, complemento: fFaz.complemento || undefined,
      bairro: fFaz.bairro || undefined,
    };

    let fazId: string;
    if (editFaz) {
      // Edição: atualiza apenas campos de formulário — owner_user_id e conta_id são imutáveis
      await atualizarFazenda(editFaz.id, camposForm);
      setFazendas(p => p.map(x => x.id === editFaz.id ? { ...x, ...camposForm } : x));
      fazId = editFaz.id;
    } else {
      // Nova fazenda: determina conta_id pelo contexto (conta, não usuário individual)
      let contaIdParaFaz: string | undefined = contaId ?? undefined;

      let ownerUserId: string | undefined = user?.id;

      if (userRole === "raccotlo" && fazendaId) {
        // Raccotlo criando fazenda para o cliente ativo — resolve conta_id e owner via API (service role)
        const r = await fetch("/api/fazenda/da-conta", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ fazenda_id: fazendaId }),
        });
        const j = await r.json();
        if (j.conta_id) contaIdParaFaz = j.conta_id;
        // Busca owner via perfis do cliente (anon consegue ler perfis com user_id próprio)
        const { data: cp } = await supabase.from("perfis").select("user_id")
          .eq("conta_id", j.conta_id ?? "").neq("role", "raccotlo").limit(1).maybeSingle();
        if (cp?.user_id) ownerUserId = cp.user_id;
      }

      const novaFazPayload: Omit<FazendaDB, "id" | "created_at"> = {
        ...camposForm,
        conta_id: contaIdParaFaz,
        owner_user_id: ownerUserId,
      };

      let n: FazendaDB;
      if (userRole === "raccotlo") {
        // Usa API com service role para contornar RLS no INSERT (owner_user_id ≠ raccotlo uid)
        const res = await fetch("/api/fazenda/criar", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(novaFazPayload),
        });
        const json = await res.json();
        if (!json.ok) throw new Error(json.error ?? "Erro ao criar fazenda");
        n = json.fazenda;
      } else {
        n = await criarFazenda(novaFazPayload);
      }
      setFazendas(p => [...p, n]);
      fazId = n.id;
      // Bootstrap: se ainda não há fazendaId no contexto (primeiro login do cliente)
      // Usa API server-side para contornar RLS no INSERT em contas
      if (!fazendaId && user) {
        const bsRes = await fetch("/api/conta/bootstrap", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ fazenda_id: fazId, nome: user.email }),
        });
        const bsJson = await bsRes.json();
        if (!bsJson.ok) throw new Error(bsJson.error ?? "Erro ao configurar conta");
        alert("Fazenda criada com sucesso! Recarregue a página (Cmd+R) para ativar o sistema.");
      }
    }
    // Salva matrículas inline
    const matsExist = matriculas[fazId] ?? [];
    const matsNovosIds = new Set(fazMatsLocal.filter(m => m.id).map(m => m.id as string));
    for (const ex of matsExist) { if (!matsNovosIds.has(ex.id)) await excluirMatricula(ex.id); }
    for (const m of fazMatsLocal) {
      const mp = { fazenda_id: fazId, produtor_id: m.produtor_id || undefined, numero: m.numero, cartorio: m.cartorio || undefined, area_ha: m.area_ha ? Number(m.area_ha) : undefined, descricao: m.descricao || undefined, em_garantia: m.em_garantia, garantia_banco: m.em_garantia ? m.garantia_banco || undefined : undefined, garantia_valor: m.em_garantia && m.garantia_valor ? Number(m.garantia_valor) : undefined, garantia_vencimento: m.em_garantia ? m.garantia_vencimento || undefined : undefined };
      if (m.id) await atualizarMatricula(m.id, mp);
      else await criarMatricula(mp);
    }
    // Salva arrendamentos múltiplos
    await salvarArrendamentos(fazId, fazArrendamentos.map(a => ({
      id: a.id,
      proprietario_id: a.proprietario_id || undefined,
      proprietario_nome: a.proprietario_nome || undefined,
      area_ha: Number(a.area_ha) || 0,
      forma_pagamento: a.forma_pagamento,
      sc_ha: a.sc_ha ? Number(a.sc_ha) : undefined,
      sc_milho_ha: a.sc_milho_ha ? Number(a.sc_milho_ha) : undefined,
      valor_brl: a.valor_brl ? Number(a.valor_brl) : undefined,
      ano_safra_id: a.ano_safra_id || undefined,
      inicio: a.inicio || undefined,
      vencimento: a.vencimento || undefined,
      renovacao_auto: a.renovacao_auto,
      observacao: a.observacao || undefined,
      produtor_id: a.produtor_id || undefined,
      produtor_id_2: a.produtor_id_2 || undefined,
      mats: a.mats.map(m => ({ id: m.id, numero: m.numero, area_ha: m.area_ha ? Number(m.area_ha) : undefined, cartorio: m.cartorio || undefined })),
    })));
    // Salva CARs múltiplos
    const { data: existingCars } = await supabase.from("fazenda_cars").select("id").eq("fazenda_id", fazId);
    const existIds = new Set((existingCars ?? []).map((c: { id: string }) => c.id));
    const keptIds  = new Set(fazCars.filter(c => c.id).map(c => c.id as string));
    for (const eid of existIds) { if (!keptIds.has(eid)) await supabase.from("fazenda_cars").delete().eq("id", eid); }
    for (const c of fazCars) {
      const payload = { fazenda_id: fazId, numero: c.numero.trim(), status: c.status, area_ha: c.area_ha ? Number(c.area_ha) : null, vencimento: c.vencimento || null, observacao: c.observacao || null };
      let carId = c.id;
      if (c.id) {
        const { error: upErr } = await supabase.from("fazenda_cars").update(payload).eq("id", c.id);
        if (upErr) throw new Error("Erro ao salvar CAR: " + upErr.message);
      } else {
        const { data: nc, error: insErr } = await supabase.from("fazenda_cars").insert(payload).select("id").single();
        if (insErr) throw new Error("Erro ao inserir CAR: " + insErr.message);
        carId = nc?.id;
      }
      if (carId) {
        await supabase.from("car_matriculas").delete().eq("car_id", carId);
        for (const matId of c.mats_vinculadas) {
          const { error: mErr } = await supabase.from("car_matriculas").insert({ car_id: carId, matricula_id: matId });
          if (mErr) throw new Error("Erro ao vincular matrícula ao CAR: " + mErr.message);
        }
      }
    }
    // Salva NIRFs múltiplos
    const { data: existingNirfs } = await supabase.from("fazenda_nirfs").select("id").eq("fazenda_id", fazId);
    const existNirfIds = new Set((existingNirfs ?? []).map((n: { id: string }) => n.id));
    const keptNirfIds  = new Set(fazNirfs.filter(n => n.id).map(n => n.id as string));
    for (const eid of existNirfIds) { if (!keptNirfIds.has(eid)) await supabase.from("fazenda_nirfs").delete().eq("id", eid); }
    for (const n of fazNirfs) {
      const payload = { fazenda_id: fazId, numero: n.numero.trim(), situacao: n.situacao, area_ha: n.area_ha ? Number(n.area_ha) : null, observacao: n.observacao || null };
      let nirfId = n.id;
      if (n.id) {
        const { error: upErr } = await supabase.from("fazenda_nirfs").update(payload).eq("id", n.id);
        if (upErr) throw new Error("Erro ao salvar NIRF: " + upErr.message);
      } else {
        const { data: nn, error: insErr } = await supabase.from("fazenda_nirfs").insert(payload).select("id").single();
        if (insErr) throw new Error("Erro ao inserir NIRF: " + insErr.message);
        nirfId = nn?.id;
      }
      if (nirfId) {
        await supabase.from("nirf_matriculas").delete().eq("nirf_id", nirfId);
        for (const matId of n.mats_vinculadas) {
          const { error: mErr } = await supabase.from("nirf_matriculas").insert({ nirf_id: nirfId, matricula_id: matId });
          if (mErr) throw new Error("Erro ao vincular matrícula ao NIRF: " + mErr.message);
        }
      }
    }
    // Salva ITRs múltiplos
    const { data: existingItrs } = await supabase.from("fazenda_itrs").select("id").eq("fazenda_id", fazId);
    const existItrIds = new Set((existingItrs ?? []).map((t: { id: string }) => t.id));
    const keptItrIds  = new Set(fazItrs.filter(t => t.id).map(t => t.id as string));
    for (const eid of existItrIds) { if (!keptItrIds.has(eid)) await supabase.from("fazenda_itrs").delete().eq("id", eid); }
    for (const t of fazItrs) {
      const payload = { fazenda_id: fazId, exercicio: t.exercicio, numero_declaracao: t.numero_declaracao || null, nirf_numero: t.nirf_numero || null, vencimento: t.vencimento || null, area_tributavel_ha: t.area_tributavel_ha ? Number(t.area_tributavel_ha) : null, valor_apurado: t.valor_apurado ? Number(t.valor_apurado) : null, status_pagamento: t.status_pagamento, observacao: t.observacao || null };
      let itrId = t.id;
      if (t.id) {
        const { error: upErr } = await supabase.from("fazenda_itrs").update(payload).eq("id", t.id);
        if (upErr) throw new Error("Erro ao salvar ITR: " + upErr.message);
      } else {
        const { data: nt, error: insErr } = await supabase.from("fazenda_itrs").insert(payload).select("id").single();
        if (insErr) throw new Error("Erro ao inserir ITR: " + insErr.message);
        itrId = nt?.id;
      }
      if (itrId) {
        await supabase.from("itr_matriculas").delete().eq("itr_id", itrId);
        for (const matId of t.mats_vinculadas) {
          const { error: mErr } = await supabase.from("itr_matriculas").insert({ itr_id: itrId, matricula_id: matId });
          if (mErr) throw new Error("Erro ao vincular matrícula ao ITR: " + mErr.message);
        }
      }
    }
    // Salva CCIRs múltiplos
    const { data: existingCcirs } = await supabase.from("fazenda_ccirs").select("id").eq("fazenda_id", fazId);
    const existCcirIds = new Set((existingCcirs ?? []).map((c: { id: string }) => c.id));
    const keptCcirIds  = new Set(fazCcirs.filter(c => c.id).map(c => c.id as string));
    for (const eid of existCcirIds) { if (!keptCcirIds.has(eid)) await supabase.from("fazenda_ccirs").delete().eq("id", eid); }
    for (const c of fazCcirs) {
      const payload = { fazenda_id: fazId, numero: c.numero.trim(), exercicio: c.exercicio || null, vencimento: c.vencimento || null, area_ha: c.area_ha ? Number(c.area_ha) : null, modulo_fiscal: c.modulo_fiscal ? Number(c.modulo_fiscal) : null, situacao: c.situacao, observacao: c.observacao || null };
      let ccirId = c.id;
      if (c.id) {
        const { error: upErr } = await supabase.from("fazenda_ccirs").update(payload).eq("id", c.id);
        if (upErr) throw new Error("Erro ao salvar CCIR: " + upErr.message);
      } else {
        const { data: nc, error: insErr } = await supabase.from("fazenda_ccirs").insert(payload).select("id").single();
        if (insErr) throw new Error("Erro ao inserir CCIR: " + insErr.message);
        ccirId = nc?.id;
      }
      if (ccirId) {
        await supabase.from("ccir_matriculas").delete().eq("ccir_id", ccirId);
        for (const matId of c.mats_vinculadas) {
          const { error: mErr } = await supabase.from("ccir_matriculas").insert({ ccir_id: ccirId, matricula_id: matId });
          if (mErr) throw new Error("Erro ao vincular matrícula ao CCIR: " + mErr.message);
        }
      }
    }
    setModalFaz(false);
  });

  const abrirModalTalhao = async (fid: string, t?: Talhao) => {
    setModalTalhao(fid); setEditTalhao(t ?? null);
    // Carrega tudo em paralelo: arrendamentos, ids vinculados, ids usados por outros talhões, documentação (mats/CARs)
    const [arrFaz, arrIds, usados, docIds, fazDocs] = await Promise.all([
      fetch(`/api/fazenda/arrendamentos?fazenda_id=${fid}`).then(r => r.ok ? r.json() : { arrendamentos: [] }).catch(() => ({ arrendamentos: [] })),
      t ? listarArrendamentosTalhao(t.id).catch(() => [] as string[]) : Promise.resolve([] as string[]),
      listarArrendamentosUsadosFazenda(fid, t?.id).catch(() => [] as string[]),
      t ? listarDocumentacaoTalhao(t.id).catch(() => ({ matricula_ids: [] as string[], car_ids: [] as string[] })) : Promise.resolve({ matricula_ids: [] as string[], car_ids: [] as string[] }),
      fetch(`/api/talhao-documentacao?fazenda_id=${fid}`).then(r => r.ok ? r.json() : { matriculas: [], cars: [] }).catch(() => ({ matriculas: [], cars: [] })),
    ]);
    setTalhaoArrs(arrFaz.arrendamentos ?? []);
    setTalhaoArrsUsados(usados);
    setTalhaoMatsFaz(fazDocs.matriculas ?? []);
    setTalhaoCarsFaz(fazDocs.cars ?? []);
    setFTalhao({
      nome: t?.nome ?? "", area: String(t?.area_ha ?? ""), area_plantada: String(t?.area_plantada_ha ?? ""),
      solo: t?.tipo_solo ?? "LVdf",
      lat: String(t?.lat ?? ""), lng: String(t?.lng ?? ""),
      tipo_posse: t?.tipo_posse ?? "proprio",
      arrendamento_ids: arrIds,
      matricula_ids: docIds.matricula_ids,
      car_ids: docIds.car_ids,
    });
  };
  const salvarTalhao = () => salvar(async () => {
    if (!modalTalhao || !fTalhao.nome.trim() || !fTalhao.area) return;
    const novaArea = Number(fTalhao.area);
    const faz = fazendas.find(f => f.id === modalTalhao);
    const talsExist = talhoes[modalTalhao] ?? [];
    // Soma área dos outros talhões (excluindo o que está sendo editado)
    const areaOutros = talsExist
      .filter(t => t.id !== editTalhao?.id)
      .reduce((s, t) => s + (t.area_ha ?? 0), 0);
    if (faz && (areaOutros + novaArea) > faz.area_total_ha) {
      const disponivel = faz.area_total_ha - areaOutros;
      throw new Error(
        `Área excedida! Esta fazenda tem ${faz.area_total_ha.toLocaleString("pt-BR")} ha no total.\n` +
        `Já cadastrado: ${areaOutros.toLocaleString("pt-BR")} ha · Disponível: ${disponivel.toLocaleString("pt-BR")} ha.\n` +
        `Reduza a área deste talhão para no máximo ${disponivel.toLocaleString("pt-BR")} ha.`
      );
    }
    const payload = { fazenda_id: modalTalhao, nome: fTalhao.nome.trim(), area_ha: novaArea, area_plantada_ha: fTalhao.area_plantada ? Number(fTalhao.area_plantada) : undefined, tipo_solo: fTalhao.solo || undefined, lat: fTalhao.lat ? Number(fTalhao.lat) : undefined, lng: fTalhao.lng ? Number(fTalhao.lng) : undefined, tipo_posse: fTalhao.tipo_posse };
    const idsVinculados = fTalhao.tipo_posse === "arrendado" ? fTalhao.arrendamento_ids : [];
    if (editTalhao) {
      await atualizarTalhao(editTalhao.id, payload);
      await Promise.all([
        salvarArrendamentosTalhao(editTalhao.id, idsVinculados),
        salvarDocumentacaoTalhao(editTalhao.id, fTalhao.matricula_ids, fTalhao.car_ids),
      ]);
      setTalhoes(prev => ({ ...prev, [modalTalhao]: (prev[modalTalhao] ?? []).map(x => x.id === editTalhao.id ? { ...x, ...payload } : x) }));
    } else {
      const n = await criarTalhao(payload);
      await Promise.all([
        salvarArrendamentosTalhao(n.id, idsVinculados),
        salvarDocumentacaoTalhao(n.id, fTalhao.matricula_ids, fTalhao.car_ids),
      ]);
      setTalhoes(prev => ({ ...prev, [modalTalhao]: [...(prev[modalTalhao] ?? []), n] }));
    }
    setModalTalhao(null);
  });

  const abrirModalMatricula = (fid: string, m?: MatriculaImovel) => {
    setModalMatricula(fid); setEditMatricula(m ?? null);
    setFMat(m ? { produtor_id: m.produtor_id ?? "", numero: m.numero, cartorio: m.cartorio ?? "", area_ha: String(m.area_ha ?? ""), descricao: m.descricao ?? "", em_garantia: m.em_garantia, garantia_banco: m.garantia_banco ?? "", garantia_valor: String(m.garantia_valor ?? ""), garantia_vencimento: m.garantia_vencimento ?? "" } : { produtor_id: "", numero: "", cartorio: "", area_ha: "", descricao: "", em_garantia: false, garantia_banco: "", garantia_valor: "", garantia_vencimento: "" });
  };
  const salvarMatricula = () => salvar(async () => {
    if (!modalMatricula || !fMat.numero.trim()) return;
    const payload: Omit<MatriculaImovel, "id"|"created_at"> = { fazenda_id: modalMatricula, produtor_id: fMat.produtor_id, numero: fMat.numero.trim(), cartorio: fMat.cartorio || undefined, area_ha: fMat.area_ha ? Number(fMat.area_ha) : undefined, descricao: fMat.descricao || undefined, em_garantia: fMat.em_garantia, garantia_banco: fMat.em_garantia ? fMat.garantia_banco || undefined : undefined, garantia_valor: fMat.em_garantia && fMat.garantia_valor ? Number(fMat.garantia_valor) : undefined, garantia_vencimento: fMat.em_garantia ? fMat.garantia_vencimento || undefined : undefined };
    if (editMatricula) {
      await atualizarMatricula(editMatricula.id, payload);
      setMatriculas(prev => ({ ...prev, [modalMatricula]: (prev[modalMatricula] ?? []).map(x => x.id === editMatricula.id ? { ...x, ...payload } : x) }));
    } else {
      const n = await criarMatricula(payload);
      setMatriculas(prev => ({ ...prev, [modalMatricula]: [...(prev[modalMatricula] ?? []), n] }));
    }
    setModalMatricula(null);
  });

  // ─────────────── EMPRESAS ───────────────
  const abrirModalEmp = (e?: Empresa) => {
    setEditEmp(e ?? null);
    setFEmp(e ? {
      nome: e.nome, razao_social: e.razao_social ?? "", tipo: e.tipo,
      cpf_cnpj: e.cpf_cnpj ?? "", inscricao_est: e.inscricao_est ?? "",
      regime_tributario: e.regime_tributario ?? "",
      produtor_id: e.produtor_id ?? "", municipio: e.municipio ?? "", estado: e.estado ?? "MT",
      car: e.car ?? "", nirf: e.nirf ?? "", itr: e.itr ?? "",
      email: e.email ?? "", email_relatorios: e.email_relatorios ?? "", telefone: e.telefone ?? "",
    } : { nome: "", razao_social: "", tipo: "pj", cpf_cnpj: "", inscricao_est: "", regime_tributario: "", produtor_id: "", municipio: "", estado: "MT", car: "", nirf: "", itr: "", email: "", email_relatorios: "", telefone: "" });
    setModalEmp(true);
  };
  const salvarEmp = () => salvar(async () => {
    if (!fEmp.nome.trim()) return;
    const payload = {
      fazenda_id: fazIdEff!, nome: fEmp.nome.trim(),
      razao_social: fEmp.razao_social || undefined, tipo: fEmp.tipo,
      cpf_cnpj: fEmp.cpf_cnpj || undefined, inscricao_est: fEmp.inscricao_est || undefined,
      regime_tributario: fEmp.regime_tributario || undefined,
      produtor_id: fEmp.produtor_id || undefined,
      municipio: fEmp.municipio || undefined, estado: fEmp.estado || undefined,
      car: fEmp.car || undefined, nirf: fEmp.nirf || undefined, itr: fEmp.itr || undefined,
      email: fEmp.email || undefined, email_relatorios: fEmp.email_relatorios || undefined,
      telefone: fEmp.telefone || undefined,
    };
    if (editEmp) { await atualizarEmpresa(editEmp.id, payload); setEmpresas(p => p.map(x => x.id === editEmp.id ? { ...x, ...payload } : x)); }
    else { const n = await criarEmpresa(payload); setEmpresas(p => [...p, n]); }
    setModalEmp(false);
  });

  // ─────────────── PESSOAS ───────────────
  const abrirModalPes = (p?: Pessoa) => {
    setEditPes(p ?? null);
    setNovaSubcat("");
    setFPes(p ? {
      nome: p.nome, tipo: p.tipo, cliente: p.cliente, fornecedor: p.fornecedor,
      cpf_cnpj: p.cpf_cnpj ?? "", inscricao_est: p.inscricao_est ?? "",
      email: p.email ?? "", telefone: p.telefone ?? "",
      cep: p.cep ?? "", logradouro: p.logradouro ?? "", numero: p.numero ?? "",
      complemento: p.complemento ?? "", bairro: p.bairro ?? "",
      municipio: p.municipio ?? "", estado: p.estado ?? "MT",
      nome_contato: p.nome_contato ?? "", telefone_contato: p.telefone_contato ?? "",
      banco_nome: p.banco_nome ?? "", banco_agencia: p.banco_agencia ?? "",
      banco_conta: p.banco_conta ?? "", banco_tipo: p.banco_tipo ?? "",
      pix_chave: p.pix_chave ?? "", pix_tipo: p.pix_tipo ?? "",
      regime_tributario: p.regime_tributario ?? "", cnae: p.cnae ?? "", situacao_cadastral: p.situacao_cadastral ?? "",
      subcategorias: p.subcategorias ?? [],
      criar_deposito_terceiro: false,
    } : {
      nome: "", tipo: "pj", cliente: true, fornecedor: false,
      cpf_cnpj: "", inscricao_est: "", email: "", telefone: "",
      cep: "", logradouro: "", numero: "", complemento: "", bairro: "", municipio: "", estado: "MT",
      nome_contato: "", telefone_contato: "",
      banco_nome: "", banco_agencia: "", banco_conta: "", banco_tipo: "",
      pix_chave: "", pix_tipo: "",
      regime_tributario: "", cnae: "", situacao_cadastral: "",
      subcategorias: [],
      criar_deposito_terceiro: false,
    });
    setModalPes(true);
  };
  const salvarPes = () => salvar(async () => {
    if (!fPes.nome.trim()) return;
    // Não salvar o campo de controle de UI no banco
    const { criar_deposito_terceiro, ...pesPayload } = fPes;
    if (editPes) {
      await atualizarPessoa(editPes.id, pesPayload);
      setPessoas(p => p.map(x => x.id === editPes.id ? { ...x, ...pesPayload } : x));
    } else {
      const n = await criarPessoa({ ...pesPayload, fazenda_id: fazIdEff! });
      setPessoas(p => [...p, n]);
      // Cria depósito de terceiro vinculado automaticamente
      if (criar_deposito_terceiro && fPes.cliente) {
        const endereco = [fPes.logradouro, fPes.numero, fPes.bairro, fPes.municipio, fPes.estado]
          .filter(Boolean).join(", ");
        const dep = await criarDeposito({
          fazenda_id: fazIdEff!,
          nome: fPes.nome.trim(),
          tipo: "terceiro" as const,
          capacidade_sc: undefined,
          ativo: true,
          descricao: `Depósito de terceiro — ${fPes.nome.trim()}${endereco ? ` · ${endereco}` : ""}`,
          pessoa_id: n.id,
        });
        setDepositos(p => [...p, dep]);
      }
    }
    setModalPes(false);
  });
  const buscarCnpjPes = async () => {
    const raw = fPes.cpf_cnpj.replace(/\D/g, "");
    if (raw.length !== 14) return;
    setBuscandoCnpj(true);
    try {
      const r = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${raw}`);
      if (!r.ok) { alert("CNPJ não encontrado na Receita Federal"); return; }
      const d = await r.json();
      const cepRaw = (d.cep ?? "").replace(/\D/g, "");
      setFPes(p => ({
        ...p,
        nome: d.razao_social || p.nome,
        logradouro: d.logradouro || "",
        numero: d.numero || "",
        complemento: d.complemento || "",
        bairro: d.bairro || "",
        municipio: d.municipio || "",
        estado: d.uf || "MT",
        cep: cepRaw.length === 8 ? `${cepRaw.slice(0,5)}-${cepRaw.slice(5)}` : cepRaw,
        email: d.email || p.email,
        telefone: d.ddd_telefone_1 ? maskPhone(d.ddd_telefone_1) : p.telefone,
        regime_tributario: d.descricao_porte || "",
        cnae: d.cnae_fiscal_descricao || "",
        situacao_cadastral: d.descricao_situacao_cadastral || "",
      }));
    } catch { alert("Erro ao consultar CNPJ. Tente novamente."); }
    finally { setBuscandoCnpj(false); }
  };
  const buscarCepPes = async (cep: string) => {
    const raw = cep.replace(/\D/g, "");
    if (raw.length !== 8) return;
    try {
      const r = await fetch(`https://viacep.com.br/ws/${raw}/json/`);
      if (!r.ok) return;
      const d = await r.json();
      if (d.erro) return;
      setFPes(p => ({ ...p, logradouro: d.logradouro || "", bairro: d.bairro || "", municipio: d.localidade || "", estado: d.uf || "MT" }));
    } catch {}
  };

  // ─────────────── SAFRAS ───────────────
  const seederSafras = async () => {
    if (!fazendaId) return;
    setSeedingSafras(true);
    try {
      const safrasPadrao = [
        { descricao: "SAFRA 2026/2027", data_inicio: "2026-07-01", data_fim: "2027-06-30" },
        { descricao: "SAFRA 2027/2028", data_inicio: "2027-07-01", data_fim: "2028-06-30" },
        { descricao: "SAFRA 2028/2029", data_inicio: "2028-07-01", data_fim: "2029-06-30" },
        { descricao: "SAFRA 2029/2030", data_inicio: "2029-07-01", data_fim: "2030-06-30" },
        { descricao: "SAFRA 2030/2031", data_inicio: "2030-07-01", data_fim: "2031-06-30" },
        { descricao: "SAFRA 2031/2032", data_inicio: "2031-07-01", data_fim: "2032-06-30" },
        { descricao: "SAFRA 2032/2033", data_inicio: "2032-07-01", data_fim: "2033-06-30" },
        { descricao: "SAFRA 2033/2034", data_inicio: "2033-07-01", data_fim: "2034-06-30" },
        { descricao: "SAFRA 2034/2035", data_inicio: "2034-07-01", data_fim: "2035-06-30" },
      ];
      const existentes = new Set(anosSafra.map(a => a.descricao));
      for (const s of safrasPadrao) {
        if (!existentes.has(s.descricao)) {
          const n = await criarAnoSafra({ ...s, fazenda_id: fazendaId });
          setAnosSafra(p => [...p, n]);
        }
      }
    } finally {
      setSeedingSafras(false);
    }
  };
  const abrirModalAno = (a?: AnoSafra) => {
    setEditAno(a ?? null);
    setFAno(a ? { descricao: a.descricao, data_inicio: a.data_inicio, data_fim: a.data_fim } : { descricao: "", data_inicio: "", data_fim: "" });
    setModalAno(true);
  };
  const salvarAno = () => salvar(async () => {
    if (!fAno.descricao.trim() || !fAno.data_inicio || !fAno.data_fim) return;
    if (editAno) { await atualizarAnoSafra(editAno.id, fAno); setAnosSafra(p => p.map(x => x.id === editAno.id ? { ...x, ...fAno } : x)); }
    else { const n = await criarAnoSafra({ ...fAno, fazenda_id: fazIdEff! }); setAnosSafra(p => [...p, n]); }
    setModalAno(false);
  });
  // Calcula quantos ha cada talhão já tem comprometido em ciclos que se sobrepõem
  // ao intervalo [inicio, fim], excluindo o próprio ciclo em edição (excluirCicloId)
  const calcularOcupacao = async (inicio: string, fim: string, excluirCicloId?: string) => {
    if (!fazendaId || !inicio || !fim) { setOcupado({}); return; }
    // Busca todos os ciclos da fazenda cujas datas se sobrepõem com [inicio, fim]
    const { data: ciclosOverlap } = await supabase
      .from("ciclos")
      .select("id")
      .eq("fazenda_id", fazendaId)
      .lte("data_inicio", fim)   // ciclo começa antes do fim do atual
      .gte("data_fim",    inicio); // ciclo termina depois do início do atual
    if (!ciclosOverlap || ciclosOverlap.length === 0) { setOcupado({}); return; }
    const ids = ciclosOverlap
      .map((c: { id: string }) => c.id)
      .filter(id => id !== excluirCicloId);
    if (ids.length === 0) { setOcupado({}); return; }
    const { data: cts } = await supabase
      .from("ciclo_talhoes")
      .select("talhao_id,area_plantada_ha")
      .in("ciclo_id", ids);
    const soma: Record<string, number> = {};
    (cts ?? []).forEach((r: { talhao_id: string; area_plantada_ha: number }) => {
      soma[r.talhao_id] = (soma[r.talhao_id] ?? 0) + (r.area_plantada_ha ?? 0);
    });
    setOcupado(soma);
  };

  const abrirModalCiclo = async (c?: Ciclo) => {
    if (!anoSel) return;
    setOcupado({});
    setEditCiclo(c ?? null);
    // Garante que talhões de todas as fazendas estejam carregados (importados via SQL ou nunca expandidos)
    const fazendasSemTalhoes = fazendas.filter(f => !talhoes[f.id]);
    if (fazendasSemTalhoes.length > 0) {
      const resultados = await Promise.all(fazendasSemTalhoes.map(f => listarTalhoes(f.id)));
      setTalhoes(prev => {
        const novo = { ...prev };
        fazendasSemTalhoes.forEach((f, i) => { novo[f.id] = resultados[i]; });
        return novo;
      });
    }
    const inicio = c?.data_inicio ?? "";
    const fim    = c?.data_fim    ?? "";
    // Garante que insumosPA esteja carregado (pode chegar vazio se modal abrir antes do fetch async)
    let paList = insumosPA;
    if (paList.length === 0) {
      const { data: paData } = await supabase.from("insumos").select("id,nome,unidade")
        .eq("fazenda_id", fazIdEff!).eq("categoria", "produto_agricola").order("nome");
      paList = (paData ?? []) as Insumo[];
      if (paList.length > 0) setInsumosPA(paList);
    }
    const autoPA = (cultura: string) => {
      const base = cultura.split(/[\s,]+/)[0].toLowerCase();
      return paList.find(i => i.nome.toLowerCase().startsWith(base))?.id ?? "";
    };
    setFCiclo(c ? {
      descricao: c.descricao, cultura: c.cultura,
      data_inicio: inicio, data_fim: fim,
      produtividade_esperada_sc_ha: c.produtividade_esperada_sc_ha != null ? String(c.produtividade_esperada_sc_ha) : "",
      preco_esperado_sc: c.preco_esperado_sc != null ? String(c.preco_esperado_sc) : "",
      is_auxiliar: c.is_auxiliar ?? false,
      ciclo_pai_id: c.ciclo_pai_id ?? "",
      absorcao_pct: c.absorcao_pct != null ? String(c.absorcao_pct) : "100",
      motivo_auxiliar: c.motivo_auxiliar ?? "",
      produto_agricola_id: c.produto_agricola_id ?? autoPA(c.cultura),
    } : { descricao: "", cultura: "Soja", data_inicio: "", data_fim: "", produtividade_esperada_sc_ha: "", preco_esperado_sc: "", is_auxiliar: false, ciclo_pai_id: "", absorcao_pct: "100", motivo_auxiliar: "", produto_agricola_id: autoPA("Soja") });
    // carrega talhões vinculados se editando
    if (c) {
      const { data: ct } = await supabase.from("ciclo_talhoes").select("talhao_id,area_plantada_ha").eq("ciclo_id", c.id);
      const mapa: Record<string, string> = {};
      (ct ?? []).forEach((r: { talhao_id: string; area_plantada_ha: number }) => { mapa[r.talhao_id] = String(r.area_plantada_ha); });
      setCicloTalhoes(mapa);
      if (inicio && fim) await calcularOcupacao(inicio, fim, c.id);
    } else {
      setCicloTalhoes({});
    }
    setModalCiclo(true);
  };
  const salvarCiclo = () => salvar(async () => {
    if (!anoSel || !fCiclo.descricao.trim() || !fCiclo.data_inicio || !fCiclo.data_fim) return;
    // Validar travas de área
    const todosTalhoes = Object.values(talhoes).flat();
    const errosArea: string[] = [];
    Object.entries(cicloTalhoes).forEach(([tid, areaStr]) => {
      const area = parseFloat(areaStr) || 0;
      if (area <= 0) return;
      const talhao = todosTalhoes.find(t => t.id === tid);
      if (!talhao) return;
      const ocupado = ocupadoEmOutrosCiclos[tid] ?? 0;
      const disponivel = talhao.area_ha - ocupado;
      if (area > talhao.area_ha) {
        errosArea.push(`"${talhao.nome}": ${area}ha informado mas área total é ${talhao.area_ha}ha`);
      } else if (area > disponivel) {
        errosArea.push(`"${talhao.nome}": ${area}ha informado mas disponível é ${disponivel.toFixed(2)}ha (${ocupado.toFixed(2)}ha já comprometido em ciclos sobrepostos)`);
      }
    });
    if (errosArea.length > 0) { alert("Área excedida:\n\n" + errosArea.join("\n")); return; }
    const payload = {
      descricao: fCiclo.descricao, cultura: fCiclo.cultura,
      data_inicio: fCiclo.data_inicio, data_fim: fCiclo.data_fim,
      produtividade_esperada_sc_ha: fCiclo.produtividade_esperada_sc_ha ? parseFloat(fCiclo.produtividade_esperada_sc_ha) : null,
      preco_esperado_sc: fCiclo.preco_esperado_sc ? parseFloat(fCiclo.preco_esperado_sc) : null,
      is_auxiliar: fCiclo.is_auxiliar,
      ciclo_pai_id: fCiclo.is_auxiliar && fCiclo.ciclo_pai_id ? fCiclo.ciclo_pai_id : null,
      absorcao_pct: fCiclo.is_auxiliar ? (parseFloat(fCiclo.absorcao_pct) || 100) : null,
      motivo_auxiliar: fCiclo.is_auxiliar && fCiclo.motivo_auxiliar.trim() ? fCiclo.motivo_auxiliar.trim() : null,
      produto_agricola_id: fCiclo.produto_agricola_id || null,
    };
    let cicloId: string;
    if (editCiclo) {
      await atualizarCiclo(editCiclo.id, payload);
      setCiclos(p => p.map(x => x.id === editCiclo.id ? { ...x, ...payload } : x));
      cicloId = editCiclo.id;
    } else {
      const n = await criarCiclo({ ...payload, ano_safra_id: anoSel, fazenda_id: fazIdEff! });
      setCiclos(p => [...p, n]);
      cicloId = n.id;
    }
    // salva talhões vinculados
    await supabase.from("ciclo_talhoes").delete().eq("ciclo_id", cicloId);
    const rows = Object.entries(cicloTalhoes)
      .filter(([, area]) => parseFloat(area) > 0)
      .map(([talhao_id, area]) => ({ ciclo_id: cicloId, talhao_id, area_plantada_ha: parseFloat(area), fazenda_id: fazIdEff! }));
    if (rows.length > 0) await supabase.from("ciclo_talhoes").insert(rows);
    setModalCiclo(false);
  });

  // ─────────────── MÁQUINAS ───────────────
  const isVeiculo = (tipo: string) => ["carro", "caminhao"].includes(tipo);
  const abrirModalMaq = (m?: Maquina) => {
    setEditMaq(m ?? null);
    setTabMaq("geral");
    setFMaq(m ? {
      nome: m.nome, tipo: m.tipo, marca: m.marca ?? "", modelo: m.modelo ?? "",
      ano: String(m.ano ?? ""), patrimonio: m.patrimonio ?? "", chassi: m.chassi ?? "",
      horimetro_atual: String(m.horimetro_atual ?? ""),
      proprietario_id: m.proprietario_id ?? "",
      nr_nf_aquisicao: m.nr_nf_aquisicao ?? "", data_aquisicao: m.data_aquisicao ?? "",
      valor_aquisicao: String(m.valor_aquisicao ?? ""),
      contrato_financiamento_id: m.contrato_financiamento_id ?? "",
      status_financiamento: m.status_financiamento ?? "proprio",
      data_quitacao: m.data_quitacao ?? "",
      seguro_seguradora: m.seguro_seguradora ?? "", seguro_corretora: m.seguro_corretora ?? "",
      seguro_numero_apolice: m.seguro_numero_apolice ?? "",
      seguro_data_contratacao: m.seguro_data_contratacao ?? "",
      seguro_vencimento_apolice: m.seguro_vencimento_apolice ?? "",
      seguro_premio: String(m.seguro_premio ?? ""),
    } : { nome: "", tipo: "trator", marca: "", modelo: "", ano: "", patrimonio: "", chassi: "", horimetro_atual: "", proprietario_id: "", nr_nf_aquisicao: "", data_aquisicao: "", valor_aquisicao: "", contrato_financiamento_id: "", status_financiamento: "proprio" as const, data_quitacao: "", seguro_seguradora: "", seguro_corretora: "", seguro_numero_apolice: "", seguro_data_contratacao: "", seguro_vencimento_apolice: "", seguro_premio: "" });
    setModalMaq(true);
  };
  const salvarMaq = () => salvar(async () => {
    if (!fMaq.nome.trim()) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const payload: any = {
      fazenda_id: fazIdEff!, nome: fMaq.nome.trim(), tipo: fMaq.tipo,
      marca: fMaq.marca || undefined, modelo: fMaq.modelo || undefined,
      ano: fMaq.ano ? Number(fMaq.ano) : undefined, patrimonio: fMaq.patrimonio || undefined,
      chassi: fMaq.chassi || undefined,
      horimetro_atual: fMaq.horimetro_atual ? Number(fMaq.horimetro_atual) : undefined,
      proprietario_id: fMaq.proprietario_id || undefined,
      nr_nf_aquisicao: fMaq.nr_nf_aquisicao || undefined,
      data_aquisicao: fMaq.data_aquisicao || undefined,
      valor_aquisicao: fMaq.valor_aquisicao ? Number(fMaq.valor_aquisicao) : undefined,
      contrato_financiamento_id: fMaq.contrato_financiamento_id || undefined,
      status_financiamento: fMaq.status_financiamento || "proprio",
      data_quitacao: fMaq.status_financiamento === "quitado" ? (fMaq.data_quitacao || undefined) : undefined,
      seguro_seguradora: fMaq.seguro_seguradora || undefined,
      seguro_corretora: fMaq.seguro_corretora || undefined,
      seguro_numero_apolice: fMaq.seguro_numero_apolice || undefined,
      seguro_data_contratacao: fMaq.seguro_data_contratacao || undefined,
      seguro_vencimento_apolice: fMaq.seguro_vencimento_apolice || undefined,
      seguro_premio: fMaq.seguro_premio ? Number(fMaq.seguro_premio) : undefined,
      ativa: true,
    };
    if (editMaq) { await atualizarMaquina(editMaq.id, payload); setMaquinas(p => p.map(x => x.id === editMaq.id ? { ...x, ...payload } : x)); }
    else { const n = await criarMaquina(payload); setMaquinas(p => [...p, n]); }
    setModalMaq(false);
  });

  // ─────────────── BOMBAS ───────────────
  const abrirModalBomba = (b?: BombaCombustivel) => {
    setEditBomba(b ?? null);
    setFBomba(b ? { nome: b.nome, combustivel: b.combustivel, capacidade_l: String(b.capacidade_l ?? ""), estoque_atual_l: String(b.estoque_atual_l), consume_estoque: b.consume_estoque !== false } : { nome: "", combustivel: "diesel_s10", capacidade_l: "", estoque_atual_l: "0", consume_estoque: true });
    setModalBomba(true);
  };
  const salvarBomba = () => salvar(async () => {
    if (!fBomba.nome.trim()) return;
    const payload = { fazenda_id: fazIdEff!, nome: fBomba.nome.trim(), combustivel: fBomba.combustivel, capacidade_l: fBomba.capacidade_l ? Number(fBomba.capacidade_l) : undefined, estoque_atual_l: Number(fBomba.estoque_atual_l) || 0, consume_estoque: fBomba.consume_estoque, ativa: true };
    if (editBomba) { await atualizarBomba(editBomba.id, payload); setBombas(p => p.map(x => x.id === editBomba.id ? { ...x, ...payload } : x)); }
    else { const n = await criarBomba(payload); setBombas(p => [...p, n]); }
    setModalBomba(false);
  });

  // ─────────────── DEPÓSITOS ───────────────
  const abrirModalDep = (d?: Deposito) => {
    setEditDep(d ?? null);
    setFDep(d ? { nome: d.nome, tipo: d.tipo, capacidade_sc: String(d.capacidade_sc ?? "") } : { nome: "", tipo: "insumo_fazenda", capacidade_sc: "" });
    setModalDep(true);
  };
  const salvarDep = () => salvar(async () => {
    if (!fDep.nome.trim()) return;
    const payload = { fazenda_id: fazIdEff!, nome: fDep.nome.trim(), tipo: fDep.tipo, capacidade_sc: fDep.capacidade_sc ? Number(fDep.capacidade_sc) : undefined, ativo: true };
    if (editDep) { await atualizarDeposito(editDep.id, payload); setDepositos(p => p.map(x => x.id === editDep.id ? { ...x, ...payload } : x)); }
    else { const n = await criarDeposito(payload); setDepositos(p => [...p, n]); }
    setModalDep(false);
  });

  // ─────────────── FUNCIONÁRIOS ───────────────
  const abrirModalFunc = async (f?: Funcionario) => {
    setEditFunc(f ?? null);
    setAbaFunc("dados");
    setFFunc(f ? {
      nome: f.nome, cpf: f.cpf ?? "", rg: f.rg ?? "", data_nascimento: f.data_nascimento ?? "",
      pis_nis: f.pis_nis ?? "", ctps_numero: f.ctps_numero ?? "", ctps_serie: f.ctps_serie ?? "", ctps_uf: f.ctps_uf ?? "",
      tipo: f.tipo, tipo_vinculo_esocial: f.tipo_vinculo_esocial ?? "",
      funcao: f.funcao ?? "", data_admissao: f.data_admissao ?? "", data_demissao: f.data_demissao ?? "", ativo: f.ativo,
      salario_base: f.salario_base ? String(f.salario_base) : "",
      piso_categoria: f.piso_categoria ? String(f.piso_categoria) : "",
      fgts_pct: String(f.fgts_pct ?? 8), inss_empregador_pct: String(f.inss_empregador_pct ?? (f.usar_funrural ? 1.5 : 20)),
      sat_rat_pct: String(f.sat_rat_pct ?? 1), sistema_s_pct: String(f.sistema_s_pct ?? (f.usar_funrural ? 0.2 : 5.8)),
      provisao_13_pct: String(f.provisao_13_pct ?? 8.33), provisao_ferias_pct: String(f.provisao_ferias_pct ?? 11.11),
      usar_funrural: f.usar_funrural ?? false,
      banco_pagamento: f.banco_pagamento ?? "", agencia_pagamento: f.agencia_pagamento ?? "", conta_pagamento: f.conta_pagamento ?? "",
      centro_custo_id: f.centro_custo_id ?? "", produtor_id: f.produtor_id ?? "",
    } : {
      nome: "", cpf: "", rg: "", data_nascimento: "", pis_nis: "",
      ctps_numero: "", ctps_serie: "", ctps_uf: "",
      tipo: "clt" as Funcionario["tipo"], tipo_vinculo_esocial: "",
      funcao: "", data_admissao: "", data_demissao: "", ativo: true,
      salario_base: "", piso_categoria: "",
      fgts_pct: "8", inss_empregador_pct: "20", sat_rat_pct: "1", sistema_s_pct: "5.8",
      provisao_13_pct: "8.33", provisao_ferias_pct: "11.11", usar_funrural: false,
      banco_pagamento: "", agencia_pagamento: "", conta_pagamento: "",
      centro_custo_id: "", produtor_id: "",
    });
    if (f) {
      const [p, fer] = await Promise.all([listarPremiacoesFuncionario(f.id), listarFeriasFuncionario(f.id)]);
      setPremiacoes(p); setFerias(fer);
    } else { setPremiacoes([]); setFerias([]); }
    setModalFunc(true);
  };

  const salvarFunc = () => salvar(async () => {
    if (!fFunc.nome.trim()) return;
    const payload: Omit<Funcionario, "id" | "created_at"> = {
      fazenda_id: fazIdEff!, nome: fFunc.nome.trim(), cpf: fFunc.cpf || undefined,
      rg: fFunc.rg || undefined, data_nascimento: fFunc.data_nascimento || undefined,
      pis_nis: fFunc.pis_nis || undefined, ctps_numero: fFunc.ctps_numero || undefined,
      ctps_serie: fFunc.ctps_serie || undefined, ctps_uf: fFunc.ctps_uf || undefined,
      tipo: fFunc.tipo, tipo_vinculo_esocial: fFunc.tipo_vinculo_esocial || undefined,
      funcao: fFunc.funcao || undefined,
      data_admissao: fFunc.data_admissao || undefined, data_demissao: fFunc.data_demissao || undefined,
      ativo: fFunc.ativo,
      salario_base: fFunc.salario_base ? Number(fFunc.salario_base) : undefined,
      piso_categoria: fFunc.piso_categoria ? Number(fFunc.piso_categoria) : undefined,
      fgts_pct: Number(fFunc.fgts_pct) || 8,
      inss_empregador_pct: Number(fFunc.inss_empregador_pct) || (fFunc.usar_funrural ? 1.5 : 20),
      sat_rat_pct: Number(fFunc.sat_rat_pct) || 1,
      sistema_s_pct: Number(fFunc.sistema_s_pct) || (fFunc.usar_funrural ? 0.2 : 5.8),
      provisao_13_pct: Number(fFunc.provisao_13_pct) || 8.33,
      provisao_ferias_pct: Number(fFunc.provisao_ferias_pct) || 11.11,
      usar_funrural: fFunc.usar_funrural,
      banco_pagamento: fFunc.banco_pagamento || undefined,
      agencia_pagamento: fFunc.agencia_pagamento || undefined,
      conta_pagamento: fFunc.conta_pagamento || undefined,
      centro_custo_id: fFunc.centro_custo_id || undefined,
      produtor_id: fFunc.produtor_id || undefined,
    };
    let funcId: string;
    if (editFunc) {
      await atualizarFuncionario(editFunc.id, payload);
      setFuncs(p => p.map(x => x.id === editFunc.id ? { ...x, ...payload } : x));
      funcId = editFunc.id;
    } else {
      const n = await criarFuncionario(payload);
      setFuncs(p => [...p, n]);
      funcId = n.id;
    }
    if (fFunc.data_admissao) {
      await sincronizarPeriodosFerias(funcId, fazIdEff!, fFunc.data_admissao);
    }
    setModalFunc(false);
  });

  const salvarPremiacao = () => salvar(async () => {
    if (!editFunc || !fPremiacao.descricao || !fPremiacao.valor) return;
    const p = await criarPremiacao({
      funcionario_id: editFunc.id, fazenda_id: fazIdEff!,
      mes_referencia: fPremiacao.mes_referencia,
      data_pagamento: fPremiacao.data_pagamento || undefined,
      descricao: fPremiacao.descricao, valor: Number(fPremiacao.valor),
      lancado_financeiro: false,
    });
    setPremiacoes(prev => [p, ...prev]);
    setModalPremiacao(false);
    setFPremiacao({ mes_referencia: "", data_pagamento: "", descricao: "", valor: "" });
  });

  const salvarGozo = () => salvar(async () => {
    if (!modalGozo) return;
    const dados: Partial<FuncionarioFerias> = {
      data_inicio_gozo: fGozo.data_inicio_gozo || undefined,
      data_fim_gozo: fGozo.data_fim_gozo || undefined,
      dias_gozados: Number(fGozo.dias_gozados) || 30,
      abono_pecuniario: fGozo.abono_pecuniario,
      dias_abono: fGozo.abono_pecuniario ? (Number(fGozo.dias_abono) || 10) : 0,
      status: "concedido",
    };
    await salvarFeriasGozo(modalGozo.id, dados);
    setFerias(prev => prev.map(f => f.id === modalGozo.id ? { ...f, ...dados } : f));
    setModalGozo(null);
  });

  async function processarFolha() {
    if (!fazendaId) return;
    setProcessando(true);
    try {
      const { gerados } = await processarFolhaMensal(fazendaId, mesProcessar);
      alert(`${gerados} lançamento(s) gerado(s) em Contas a Pagar para ${mesProcessar}.`);
    } catch (e: unknown) {
      alert("Erro: " + (e instanceof Error ? e.message : String(e)));
    } finally { setProcessando(false); }
  }

  // ─────────────── GRUPOS ───────────────
  const abrirModalGrupo = (g?: GrupoUsuario) => {
    setEditGrupo(g ?? null);
    const perms: Record<string, string> = {};
    MODULOS.forEach(m => perms[m] = g?.permissoes?.[m] ?? "leitura");
    setFGrupo({ nome: g?.nome ?? "", descricao: g?.descricao ?? "", permissoes: perms });
    setModalGrupo(true);
  };
  const salvarGrupo = () => salvar(async () => {
    if (!fGrupo.nome.trim()) return;
    if (editGrupo) { await atualizarGrupo(editGrupo.id, fGrupo); setGrupos(p => p.map(x => x.id === editGrupo.id ? { ...x, ...fGrupo } : x)); }
    else { const n = await criarGrupo(fGrupo); setGrupos(p => [...p, n]); }
    setModalGrupo(false);
  });

  // ─────────────── USUÁRIOS ───────────────
  const abrirModalUser = (u?: Usuario) => {
    setEditUser(u ?? null);
    setFUser(u ? { nome: u.nome, email: u.email, grupo_id: u.grupo_id ?? "", whatsapp: u.whatsapp ?? "" } : { nome: "", email: "", grupo_id: "", whatsapp: "" });
    setModalUser(true);
  };
  const salvarUser = () => salvar(async () => {
    if (!fUser.nome.trim() || !fUser.email.trim()) return;
    const whatsapp = fUser.whatsapp.trim() || undefined;
    const payload = { nome: fUser.nome.trim(), email: fUser.email.trim(), grupo_id: fUser.grupo_id || undefined, whatsapp, ativo: true };
    if (editUser) {
      await atualizarUsuario(editUser.id, payload);
      setUsuarios(p => p.map(x => x.id === editUser.id ? { ...x, ...payload } : x));
    } else {
      const n = await criarUsuario(payload);
      setUsuarios(p => [...p, n]);
    }
    setModalUser(false);
  });

  // ══════ RENDER ══════
  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh", background: "#F3F6F9", fontFamily: "system-ui, sans-serif", fontSize: 13 }}>
      <TopNav />
      <main style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>

        <header style={{ background: "#fff", borderBottom: "0.5px solid #D4DCE8", padding: "10px 22px" }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 17, color: "#1a1a1a", fontWeight: 600 }}>
              {TAB_GROUPS.flatMap(g => g.tabs).find(t => t.key === aba)?.label ?? "Cadastros"}
            </h1>
            <p style={{ margin: 0, fontSize: 11, color: "#888" }}>
              {TAB_GROUPS.find(g => g.tabs.some(t => t.key === aba))?.group}
            </p>
          </div>
        </header>

        <div style={{ padding: "20px 22px", flex: 1, overflowY: "auto" }}>
          {erro && <div style={{ background: "#FCEBEB", borderRadius: 8, padding: "10px 14px", marginBottom: 14, fontSize: 12, color: "#791F1F" }}>⚠ {erro}</div>}

          {/* ══ PRODUTORES ══ */}
          {aba === "produtores" && (
            <div style={{ background: "#fff", border: "0.5px solid #D4DCE8", borderRadius: 12, overflow: "hidden" }}>
              <div style={{ padding: "14px 18px", borderBottom: "0.5px solid #DEE5EE", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div style={{ color: "#1a1a1a", fontWeight: 600, fontSize: 14 }}>Produtores <span style={{ fontSize: 11, color: "#444", fontWeight: 400 }}>({produtores.length})</span></div>
                <button style={btnV} onClick={() => abrirModalProd()}>+ Novo Produtor</button>
              </div>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <TH cols={["Nome", "Tipo", "CPF / CNPJ", "Município / Estado", "Contato", ""]} />
                <tbody>
                  {produtores.length === 0 && <tr><td colSpan={6} style={{ padding: 32, textAlign: "center", color: "#444" }}>Nenhum produtor cadastrado</td></tr>}
                  {produtores.map((p, i) => (
                    <tr key={p.id} style={{ borderBottom: i < produtores.length - 1 ? "0.5px solid #DEE5EE" : "none" }}>
                      <td style={{ padding: "10px 14px", color: "#1a1a1a", fontWeight: 600 }}>{p.nome}</td>
                      <td style={{ padding: "10px 14px", textAlign: "center" }}>{badge(p.tipo.toUpperCase(), p.tipo === "pj" ? "#E6F1FB" : "#FBF0D8", p.tipo === "pj" ? "#0C447C" : "#7A5A12")}</td>
                      <td style={{ padding: "10px 14px", textAlign: "center", color: "#1a1a1a" }}>{p.cpf_cnpj || "—"}</td>
                      <td style={{ padding: "10px 14px", textAlign: "center", color: "#1a1a1a" }}>{p.municipio ? `${p.municipio} · ${p.estado}` : "—"}</td>
                      <td style={{ padding: "10px 14px", textAlign: "center", color: "#1a1a1a" }}>{p.email || p.telefone || "—"}</td>
                      <td style={{ padding: "10px 14px", textAlign: "right" }}>
                        <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                          <button style={btnE} onClick={() => abrirModalProd(p)}>Editar</button>
                          <button style={btnX} onClick={() => { if (confirm("Excluir produtor?")) excluirProdutor(p.id).then(() => setProdutores(x => x.filter(r => r.id !== p.id))); }}>✕</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* ══ EMPRESAS ══ */}
          {/* ══ FAZENDAS ══ */}
          {aba === "fazendas" && (
            <div>
              <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginBottom: 12 }}>
                <button style={{ padding: "7px 14px", background: "white", border: "0.5px solid #1A4870", borderRadius: 8, color: "#1A4870", fontSize: 13, fontWeight: 600, cursor: "pointer" }} onClick={() => router.push("/configuracoes/importacao?aba=fazendas_imp")}>⬆ Importar em lote</button>
                <button style={btnV} onClick={() => abrirModalFaz()}>+ Nova Fazenda</button>
              </div>
              {fazendas.length === 0 && <div style={{ background: "#fff", border: "0.5px solid #D4DCE8", borderRadius: 12, padding: 32, textAlign: "center", color: "#444" }}>Nenhuma fazenda cadastrada</div>}
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {fazendas.map(f => {
                  const exp  = expandFaz.has(f.id);
                  const tals = talhoes[f.id] ?? [];
                  const mats = matriculas[f.id] ?? [];
                  return (
                    <div key={f.id} style={{ background: "#fff", border: "0.5px solid #D4DCE8", borderRadius: 12, overflow: "hidden" }}>
                      {/* Cabeçalho da fazenda */}
                      <div style={{ padding: "13px 16px", display: "flex", alignItems: "center", gap: 12 }}>
                        <div style={{ width: 38, height: 38, background: "#D5E8F5", borderRadius: 9, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 17, flexShrink: 0 }}>⬡</div>
                        <div style={{ flex: 1, minWidth: 0, cursor: "pointer" }} onClick={() => toggleFaz(f.id)} role="button">
                          <div style={{ color: "#1a1a1a", fontWeight: 600, fontSize: 14 }}>{f.nome}</div>
                          <div style={{ fontSize: 11, color: "#555" }}>{f.municipio} · {f.estado} · {(f.area_total_ha ?? 0).toLocaleString("pt-BR")} ha
                            {f.arrendada && f.arrendamento_area_ha ? ` · ${f.arrendamento_area_ha.toLocaleString("pt-BR")} ha arrendados` : ""}
                          </div>
                        </div>
                        <div style={{ display: "flex", gap: 6, flexShrink: 0, alignItems: "center" }}>
                          {f.arrendada && (() => {
                            if (!f.arrendamento_vencimento) return badge("Arrendada", "#FBF3E0", "#7A5A12");
                            const dias = Math.ceil((new Date(f.arrendamento_vencimento).getTime() - Date.now()) / 86400000);
                            if (dias < 0)   return badge("Arrendamento vencido", "#FCEBEB", "#791F1F");
                            if (dias <= 60) return badge(`Arrendamento vence em ${dias}d`, "#FCEBEB", "#791F1F");
                            if (dias <= 180) return badge(`Arrendamento vence em ${dias}d`, "#FBF3E0", "#7A5A12");
                            return badge("Arrendada", "#FBF3E0", "#7A5A12");
                          })()}
                          {f.car  && badge("CAR")}
                          {f.itr  && badge("ITR")}
                          {f.nirf && badge("NIRF")}
                          <button style={{ ...btnE, fontSize: 12, border: "0.5px solid #1A4870", color: "#0B2D50", background: "#D5E8F5" }} onClick={() => { if (!exp) toggleFaz(f.id); abrirModalTalhao(f.id); }}>+ Talhão</button>
                          <button style={btnE} onClick={() => abrirModalFaz(f)}>Editar</button>
                          <button style={btnX} onClick={() => { if (confirm(`Excluir "${f.nome}" e todos os seus talhões?`)) excluirFazenda(f.id).then(() => setFazendas(p => p.filter(x => x.id !== f.id))).catch(e => alert(e.message)); }}>✕</button>
                          <button onClick={() => toggleFaz(f.id)} style={{ padding: "5px 12px", border: "0.5px solid #D4DCE8", borderRadius: 8, background: exp ? "#F4F6FA" : "#fff", cursor: "pointer", fontSize: 12, color: "#444", display: "flex", alignItems: "center", gap: 5 }}>
                            {exp ? "▲ Recolher" : "▼ Talhões / Matrículas"}
                          </button>
                        </div>
                      </div>

                      {exp && (
                        <div style={{ borderTop: "0.5px solid #DEE5EE" }}>
                          {/* Dados fiscais */}
                          <div style={{ padding: "8px 16px", background: "#F3F6F9", display: "flex", flexWrap: "wrap", gap: "6px 24px", fontSize: 11, color: "#666", borderBottom: "0.5px solid #DEE5EE" }}>
                            {[["CNPJ", f.cnpj],["CAR", f.car ? f.car.substring(0,20)+"…" : null],["ITR", f.itr],["NIRF", f.nirf]].map(([k,v]) => (
                              <span key={k}>{k}: <strong style={{ color: "#1a1a1a" }}>{v || "—"}</strong></span>
                            ))}
                          </div>

                          {/* Arrendamento */}
                          {f.arrendada && (
                            <div style={{ padding: "8px 16px", background: "#FBF3E0", display: "flex", flexWrap: "wrap", gap: "6px 24px", fontSize: 11, color: "#7A5A12", borderBottom: "0.5px solid #C9921B30" }}>
                              <span style={{ fontWeight: 600 }}>◈ Área Arrendada</span>
                              {f.arrendamento_proprietario && <span>Proprietário: <strong>{f.arrendamento_proprietario}</strong></span>}
                              {f.arrendamento_area_ha && <span>Área: <strong>{f.arrendamento_area_ha.toLocaleString("pt-BR")} ha</strong></span>}
                              {f.arrendamento_valor_sc_ha && <span>Valor: <strong>{f.arrendamento_valor_sc_ha} sc/ha/ano</strong></span>}
                              {f.arrendamento_valor_brl_ha && <span>Valor: <strong>R$ {f.arrendamento_valor_brl_ha.toLocaleString("pt-BR")}/ano</strong></span>}
                              {f.arrendamento_inicio && <span>Início: <strong>{f.arrendamento_inicio}</strong></span>}
                              {f.arrendamento_vencimento && <span>Vencimento: <strong>{f.arrendamento_vencimento}</strong></span>}
                              {f.arrendamento_renovacao_auto && <span style={{ background: "#D5E8F5", color: "#0B2D50", padding: "1px 7px", borderRadius: 6, fontWeight: 600 }}>Renovação automática</span>}
                            </div>
                          )}

                          {/* Matrículas */}
                          <div style={{ padding: "10px 16px", borderBottom: "0.5px solid #DEE5EE" }}>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                              <div style={{ fontSize: 12, fontWeight: 600, color: "#555" }}>Matrículas de Imóvel ({mats.length})</div>
                              <button style={{ ...btnE, fontSize: 12, border: "0.5px solid #C9921B", color: "#C9921B", background: "#FBF0D8" }} onClick={() => abrirModalMatricula(f.id)}>+ Nova Matrícula</button>
                            </div>
                            {mats.length === 0 ? <div style={{ fontSize: 12, color: "#444", padding: "6px 0" }}>Nenhuma matrícula vinculada</div> : (
                              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                                <TH cols={["Nº Matrícula", "Cartório", "Área (ha)", "Produtor", "Garantia", ""]} />
                                <tbody>
                                  {mats.map((m, mi) => {
                                    const prod = produtores.find(p => p.id === m.produtor_id);
                                    return (
                                      <tr key={m.id} style={{ borderBottom: mi < mats.length - 1 ? "0.5px solid #DEE5EE" : "none" }}>
                                        <td style={{ padding: "8px 14px", color: "#1a1a1a", fontWeight: 600 }}>{m.numero}</td>
                                        <td style={{ padding: "8px 14px", color: "#1a1a1a" }}>{m.cartorio || "—"}</td>
                                        <td style={{ padding: "8px 14px", textAlign: "center" }}>{m.area_ha?.toLocaleString("pt-BR") ?? "—"}</td>
                                        <td style={{ padding: "8px 14px", color: "#1a1a1a" }}>{prod?.nome ?? "—"}</td>
                                        <td style={{ padding: "8px 14px", textAlign: "center" }}>
                                          {m.em_garantia ? badge("⚠ Em garantia", "#FCEBEB", "#791F1F") : badge("Livre", "#D5E8F5", "#0B2D50")}
                                          {m.em_garantia && m.garantia_banco && <div style={{ fontSize: 10, color: "#444", marginTop: 2 }}>{m.garantia_banco}</div>}
                                        </td>
                                        <td style={{ padding: "8px 14px", textAlign: "right" }}>
                                          <div style={{ display: "flex", gap: 5, justifyContent: "flex-end" }}>
                                            <button style={btnE} onClick={() => abrirModalMatricula(f.id, m)}>Editar</button>
                                            <button style={btnX} onClick={() => { if (confirm("Excluir matrícula?")) excluirMatricula(m.id).then(() => setMatriculas(prev => ({ ...prev, [f.id]: (prev[f.id] ?? []).filter(x => x.id !== m.id) }))); }}>✕</button>
                                          </div>
                                        </td>
                                      </tr>
                                    );
                                  })}
                                </tbody>
                              </table>
                            )}
                          </div>

                          {/* Talhões */}
                          <div style={{ padding: "10px 16px" }}>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                              <div style={{ fontSize: 12, fontWeight: 600, color: "#555" }}>Talhões ({tals.length})</div>
                              <button style={{ ...btnE, fontSize: 12, border: "0.5px solid #1A4870", color: "#0B2D50", background: "#D5E8F5" }} onClick={() => abrirModalTalhao(f.id)}>+ Novo Talhão</button>
                            </div>
                            {(() => {
                              const totalTal = tals.reduce((s, t) => s + (t.area_ha ?? 0), 0);
                              const totalFaz = f.area_total_ha ?? 0;
                              const diff = totalTal - totalFaz;
                              const pct = totalFaz > 0 ? Math.min(100, (totalTal / totalFaz) * 100) : 0;
                              const cor = Math.abs(diff) < 0.01 ? "#16A34A" : diff > 0 ? "#E24B4A" : "#C9921B";
                              const bgCor = Math.abs(diff) < 0.01 ? "#DCF5E8" : diff > 0 ? "#FCEBEB" : "#FEF3CD";
                              if (tals.length === 0) return null;
                              return (
                                <div style={{ padding: "8px 12px", borderRadius: 8, background: bgCor, border: `0.5px solid ${cor}40`, marginBottom: 10, display: "flex", alignItems: "center", gap: 16, fontSize: 12 }}>
                                  <div style={{ flex: 1 }}>
                                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                                      <span style={{ color: "#555" }}>Área cadastrada em talhões</span>
                                      <span style={{ fontWeight: 600, color: cor }}>{totalTal.toLocaleString("pt-BR", { minimumFractionDigits: 2 })} / {totalFaz.toLocaleString("pt-BR", { minimumFractionDigits: 2 })} ha</span>
                                    </div>
                                    <div style={{ height: 6, background: "#E0E0E0", borderRadius: 3, overflow: "hidden" }}>
                                      <div style={{ height: "100%", width: `${pct}%`, background: cor, borderRadius: 3, transition: "width 0.3s" }} />
                                    </div>
                                  </div>
                                  <div style={{ whiteSpace: "nowrap", fontWeight: 600, color: cor }}>
                                    {Math.abs(diff) < 0.01 ? "✓ Completo" : diff < 0 ? `${Math.abs(diff).toLocaleString("pt-BR", { minimumFractionDigits: 2 })} ha disponível` : `⚠ ${diff.toLocaleString("pt-BR", { minimumFractionDigits: 2 })} ha excedido`}
                                  </div>
                                </div>
                              );
                            })()}
                            {tals.length === 0 ? <div style={{ fontSize: 12, color: "#444", padding: "6px 0" }}>Nenhum talhão cadastrado</div> : (
                              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                                <TH cols={["Talhão", "Área Total (ha)", "Área Plantada (ha)", "Posse", "Solo", "Latitude", "Longitude", ""]} />
                                <tbody>
                                  {tals.map((t, ti) => (
                                    <tr key={t.id} style={{ borderBottom: ti < tals.length - 1 ? "0.5px solid #DEE5EE" : "none" }}>
                                      <td style={{ padding: "8px 14px", color: "#1a1a1a", fontWeight: 600 }}>{t.nome}</td>
                                      <td style={{ padding: "8px 14px", textAlign: "center" }}>{(t.area_ha ?? 0).toLocaleString("pt-BR")}</td>
                                      <td style={{ padding: "8px 14px", textAlign: "center" }}>
                                        {t.area_plantada_ha != null
                                          ? <span style={{ fontWeight: 600, color: "#16A34A" }}>{t.area_plantada_ha.toLocaleString("pt-BR")}</span>
                                          : <span style={{ color: "#aaa" }}>—</span>}
                                      </td>
                                      <td style={{ padding: "8px 14px", textAlign: "center" }}>
                                        {t.tipo_posse === "arrendado"
                                          ? <span style={{ fontSize: 11, background: "#FBF3E0", color: "#7A4300", padding: "2px 7px", borderRadius: 5, fontWeight: 600 }}>🤝 Arrendado</span>
                                          : <span style={{ fontSize: 11, background: "#DCF5E8", color: "#14532D", padding: "2px 7px", borderRadius: 5, fontWeight: 600 }}>🏡 Próprio</span>
                                        }
                                      </td>
                                      <td style={{ padding: "8px 14px", textAlign: "center" }}><span style={{ fontSize: 11, background: "#F1EFE8", color: "#555", padding: "2px 7px", borderRadius: 5 }}>{t.tipo_solo || "—"}</span></td>
                                      <td style={{ padding: "8px 14px", textAlign: "center", color: "#1a1a1a", fontSize: 12 }}>{t.lat ?? "—"}</td>
                                      <td style={{ padding: "8px 14px", textAlign: "center", color: "#1a1a1a", fontSize: 12 }}>{t.lng ?? "—"}</td>
                                      <td style={{ padding: "8px 14px", textAlign: "right" }}>
                                        <div style={{ display: "flex", gap: 5, justifyContent: "flex-end" }}>
                                          <button style={btnE} onClick={() => abrirModalTalhao(f.id, t)}>Editar</button>
                                          <button
                                            style={{ ...btnE, color: "#E24B4A", border: "0.5px solid #E24B4A" }}
                                            onClick={async () => {
                                              if (!confirm(`Excluir talhão "${t.nome}"? Esta ação não pode ser desfeita.`)) return;
                                              await excluirTalhao(t.id);
                                              setTalhoes(prev => ({ ...prev, [f.id]: (prev[f.id] ?? []).filter(x => x.id !== t.id) }));
                                            }}
                                          >Excluir</button>
                                        </div>
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ══ PESSOAS ══ */}
          {aba === "pessoas" && (() => {
            const SUBCATS_PADRAO = [
              "Prestador de Serviço",
              "Loja de Peças, Acessórios e Ferramentas",
              "Instituição Financeira",
              "Arrendante",
              "Loja de Máquinas e Implementos",
              "Mercado / Supermercado",
              "Fornecedor de Insumos",
              "Fornecedor de Combustíveis",
            ];
            // Coletar todas as subcategorias existentes (padrão + custom) para o filtro
            const todasSubcats = Array.from(new Set([
              ...SUBCATS_PADRAO,
              ...pessoas.flatMap(p => p.subcategorias ?? []),
            ]));
            const pessoasFilt = pessoas.filter(p => {
              if (filtroPes.busca && !p.nome.toLowerCase().includes(filtroPes.busca.toLowerCase())) return false;
              if (filtroPes.subcat && !(p.subcategorias ?? []).includes(filtroPes.subcat)) return false;
              return true;
            });
            return (
              <div style={{ background: "#fff", border: "0.5px solid #D4DCE8", borderRadius: 12, overflow: "hidden" }}>
                <div style={{ padding: "14px 18px", borderBottom: "0.5px solid #DEE5EE", display: "flex", gap: 12, alignItems: "center" }}>
                  <div style={{ color: "#1a1a1a", fontWeight: 600, fontSize: 14, flexShrink: 0 }}>Pessoas <span style={{ fontSize: 11, color: "#444", fontWeight: 400 }}>({pessoas.length})</span></div>
                  <input style={{ ...inp, width: 200, padding: "6px 10px", fontSize: 12 }} placeholder="Buscar por nome…" value={filtroPes.busca} onChange={e => setFiltroPes(f => ({ ...f, busca: e.target.value }))} />
                  <select style={{ ...inp, width: 240, padding: "6px 10px", fontSize: 12 }} value={filtroPes.subcat} onChange={e => setFiltroPes(f => ({ ...f, subcat: e.target.value }))}>
                    <option value="">Todas as subcategorias</option>
                    {todasSubcats.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                  {(filtroPes.busca || filtroPes.subcat) && (
                    <button style={{ ...btnE, fontSize: 11, whiteSpace: "nowrap" }} onClick={() => setFiltroPes({ subcat: "", busca: "" })}>✕ Limpar</button>
                  )}
                  <button style={{ ...btnV, marginLeft: "auto" }} onClick={() => abrirModalPes()}>+ Nova Pessoa</button>
                </div>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <TH cols={["Nome", "Subcategorias", "Tipo", "CPF / CNPJ", "Papel", "Município", "Contato", ""]} />
                  <tbody>
                    {pessoasFilt.length === 0 && <tr><td colSpan={8} style={{ padding: 32, textAlign: "center", color: "#444" }}>Nenhuma pessoa encontrada</td></tr>}
                    {pessoasFilt.map((p, i) => (
                      <tr key={p.id} style={{ borderBottom: i < pessoasFilt.length - 1 ? "0.5px solid #DEE5EE" : "none" }}>
                        <td style={{ padding: "10px 14px", color: "#1a1a1a", fontWeight: 600 }}>{p.nome}</td>
                        <td style={{ padding: "10px 14px", maxWidth: 260 }}>
                          <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                            {(p.subcategorias ?? []).length === 0
                              ? <span style={{ fontSize: 11, color: "#aaa" }}>—</span>
                              : (p.subcategorias ?? []).map(s => (
                                <span key={s} style={{
                                  fontSize: 10, padding: "2px 7px", borderRadius: 10,
                                  background: SUBCATS_PADRAO.includes(s) ? "#EBF3FC" : "#FBF3E0",
                                  color: SUBCATS_PADRAO.includes(s) ? "#0C447C" : "#7A5A12",
                                  fontWeight: 600, whiteSpace: "nowrap",
                                }}>{s}</span>
                              ))
                            }
                          </div>
                        </td>
                        <td style={{ padding: "10px 14px", textAlign: "center" }}>{badge(p.tipo.toUpperCase(), p.tipo === "pj" ? "#E6F1FB" : "#FBF0D8", p.tipo === "pj" ? "#0C447C" : "#7A5A12")}</td>
                        <td style={{ padding: "10px 14px", textAlign: "center", color: "#1a1a1a" }}>{p.cpf_cnpj || "—"}</td>
                        <td style={{ padding: "10px 14px", textAlign: "center" }}>
                          <div style={{ display: "flex", gap: 4, justifyContent: "center" }}>
                            {p.cliente    && badge("Cliente", "#D5E8F5", "#0B2D50")}
                            {p.fornecedor && badge("Fornecedor", "#E6F1FB", "#0C447C")}
                          </div>
                        </td>
                        <td style={{ padding: "10px 14px", textAlign: "center", color: "#1a1a1a" }}>{p.municipio ? `${p.municipio} · ${p.estado}` : "—"}</td>
                        <td style={{ padding: "10px 14px", textAlign: "center", color: "#1a1a1a" }}>{p.email || p.telefone || "—"}</td>
                        <td style={{ padding: "10px 14px", textAlign: "right" }}>
                          <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                            <button style={btnE} onClick={() => abrirModalPes(p)}>Editar</button>
                            <button style={btnX} onClick={() => { if (confirm("Excluir pessoa?")) excluirPessoa(p.id).then(() => setPessoas(x => x.filter(r => r.id !== p.id))).catch(e => alert("Não foi possível excluir: " + (e?.message ?? e))); }}>✕</button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          })()}

          {/* ══ SAFRAS & CICLOS ══ */}
          {aba === "safras" && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1.5fr", gap: 16, alignItems: "start" }}>
              {/* Anos Safra */}
              <div style={{ background: "#fff", border: "0.5px solid #D4DCE8", borderRadius: 12, overflow: "hidden" }}>
                <div style={{ padding: "13px 16px", borderBottom: "0.5px solid #DEE5EE", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div style={{ color: "#1a1a1a", fontWeight: 600, fontSize: 13 }}>Anos Safra</div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button style={{ ...btnE, padding: "6px 12px", fontSize: 12, opacity: seedingSafras ? 0.6 : 1 }} disabled={seedingSafras} onClick={seederSafras}>
                      {seedingSafras ? "Carregando…" : "↺ Pré-carregar safras"}
                    </button>
                    <button style={{ ...btnV, padding: "6px 12px", fontSize: 12 }} onClick={() => abrirModalAno()}>+ Novo</button>
                  </div>
                </div>
                {anosSafra.length === 0 && <div style={{ padding: 24, textAlign: "center", color: "#444", fontSize: 12 }}>Nenhum ano safra cadastrado</div>}
                {anosSafra.map(a => {
                  const encerrada = a.status === "encerrada";
                  return (
                    <div key={a.id} onClick={() => selecionarAno(a.id)}
                      style={{ padding: "11px 16px", borderBottom: "0.5px solid #DEE5EE", cursor: "pointer", background: anoSel === a.id ? "#D5E8F5" : "transparent", borderLeft: anoSel === a.id ? "3px solid #1A4870" : encerrada ? "3px solid #ccc" : "3px solid transparent", opacity: encerrada ? 0.75 : 1 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                        <span style={{ fontWeight: 600, fontSize: 13, color: anoSel === a.id ? "#0B2D50" : "#1a1a1a" }}>{a.descricao}</span>
                        {encerrada
                          ? <span style={{ fontSize: 10, background: "#EEE", color: "#555", borderRadius: 5, padding: "2px 7px", fontWeight: 700 }}>ENCERRADA</span>
                          : <span style={{ fontSize: 10, background: "#D5F5E3", color: "#14532D", borderRadius: 5, padding: "2px 7px", fontWeight: 700 }}>ATIVA</span>
                        }
                      </div>
                      <div style={{ fontSize: 11, color: "#555", marginTop: 2 }}>{a.data_inicio} → {a.data_fim}</div>
                      <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
                        <button style={btnE} onClick={e => { e.stopPropagation(); abrirModalAno(a); }}>Editar</button>
                        {encerrada ? (
                          <button style={{ ...btnE, background: "#fff", color: "#1A4870", borderColor: "#1A4870" }} onClick={e => {
                            e.stopPropagation();
                            if (!confirm(`Reabrir a safra "${a.descricao}"?\n\nA safra voltará a aceitar novos lançamentos.`)) return;
                            reabrirAnoSafra(a.id).then(() => setAnosSafra(p => p.map(x => x.id === a.id ? { ...x, status: "ativa" as const } : x)));
                          }}>↩ Reabrir</button>
                        ) : (
                          <button style={{ ...btnE, color: "#8B1A1A", borderColor: "#E24B4A60" }} onClick={e => {
                            e.stopPropagation();
                            if (!confirm(`Encerrar a safra "${a.descricao}"?\n\nA safra não aceitará mais novos contratos, romaneios ou operações de lavoura.\nOs contratos abertos serão mantidos (use Comercialização para encerrá-los em lote).`)) return;
                            encerrarAnoSafra(a.id, fazIdEff!).then(n => {
                              setAnosSafra(p => p.map(x => x.id === a.id ? { ...x, status: "encerrada" as const } : x));
                              if (n > 0) alert(`Safra encerrada. ${n} contrato(s) foram encerrados.`);
                            });
                          }}>⊘ Encerrar</button>
                        )}
                        <button style={btnX} onClick={e => { e.stopPropagation(); if (confirm("Excluir ano safra?")) excluirAnoSafra(a.id).then(() => { setAnosSafra(x => x.filter(r => r.id !== a.id)); if (anoSel === a.id) { setAnoSel(null); setCiclos([]); } }); }}>✕</button>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Ciclos */}
              <div style={{ background: "#fff", border: "0.5px solid #D4DCE8", borderRadius: 12, overflow: "hidden" }}>
                <div style={{ padding: "13px 16px", borderBottom: "0.5px solid #DEE5EE", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div style={{ color: "#1a1a1a", fontWeight: 600, fontSize: 13 }}>
                    Ciclos {anoSel && <span style={{ fontSize: 11, color: "#555", fontWeight: 400 }}>— {anosSafra.find(a => a.id === anoSel)?.descricao}</span>}
                  </div>
                  {anoSel && <button style={{ ...btnV, padding: "6px 12px", fontSize: 12 }} onClick={() => abrirModalCiclo()}>+ Novo Ciclo</button>}
                </div>
                {!anoSel && <div style={{ padding: 24, textAlign: "center", color: "#444", fontSize: 12 }}>Selecione um Ano Safra para ver os ciclos</div>}
                {anoSel && ciclos.length === 0 && <div style={{ padding: 24, textAlign: "center", color: "#444", fontSize: 12 }}>Nenhum ciclo cadastrado para este ano safra</div>}
                {ciclos.map((c, ci) => {
                  const prod = c.produtividade_esperada_sc_ha;
                  const preco = c.preco_esperado_sc;
                  const area = c.area_plantada_ha;
                  const sacasEsp = prod && area ? area * prod : null;
                  const receitaEsp = sacasEsp && preco ? sacasEsp * preco : null;
                  const isAux = c.is_auxiliar;
                  const nomePai = isAux && c.ciclo_pai_id ? ciclos.find(x => x.id === c.ciclo_pai_id)?.descricao : null;
                  const auxiliaresDeste = ciclos.filter(x => x.ciclo_pai_id === c.id);
                  return (
                    <div key={c.id} style={{ padding: "11px 16px", borderBottom: ci < ciclos.length - 1 ? "0.5px solid #DEE5EE" : "none", background: isAux ? "#FFFBF3" : "transparent", borderLeft: isAux ? "3px solid #C9921B" : "3px solid transparent", paddingLeft: isAux ? 13 : 16 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                        <div>
                          <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                            {isAux && <span style={{ fontSize:9, fontWeight:700, background:"#C9921B", color:"#fff", borderRadius:4, padding:"2px 6px", textTransform:"uppercase", letterSpacing:".04em" }}>AUX</span>}
                            <div style={{ color: isAux ? "#7A5200" : "#1a1a1a", fontWeight: 600, fontSize: 13 }}>{c.descricao}</div>
                          </div>
                          {isAux && nomePai && (
                            <div style={{ fontSize:11, color:"#C9921B", marginTop:2, display:"flex", alignItems:"center", gap:4 }}>
                              ↳ Custos absorvidos por: <strong>{nomePai}</strong>
                              {c.absorcao_pct != null && c.absorcao_pct !== 100 && <span style={{ background:"#FDE9BB", color:"#7A5200", borderRadius:4, padding:"1px 5px", fontSize:10 }}>{c.absorcao_pct}%</span>}
                              {c.motivo_auxiliar && <span style={{ color:"#888", marginLeft:4 }}>· {c.motivo_auxiliar}</span>}
                            </div>
                          )}
                          <div style={{ fontSize: 11, color: "#555", marginTop: 2 }}>{c.data_inicio} → {c.data_fim}</div>
                          <div style={{ marginTop: 4, display: "flex", gap: 6, flexWrap: "wrap" }}>
                            {badge(c.cultura, isAux ? "#FDE9BB" : "#D5E8F5", isAux ? "#7A5200" : "#0B2D50")}
                            {area != null && <span style={{ fontSize: 10, background: "#F0FDF7", color: "#14532D", borderRadius: 5, padding: "2px 7px", fontWeight: 600 }}>{area.toLocaleString("pt-BR", { maximumFractionDigits: 2 })} ha plantados</span>}
                            {!isAux && prod != null && <span style={{ fontSize: 10, background: "#FBF3E0", color: "#7A5A12", borderRadius: 5, padding: "2px 7px", fontWeight: 600 }}>Prod. esp.: {prod.toLocaleString("pt-BR", { maximumFractionDigits: 2 })} sc/ha</span>}
                            {!isAux && preco != null && <span style={{ fontSize: 10, background: "#FBF3E0", color: "#7A5A12", borderRadius: 5, padding: "2px 7px", fontWeight: 600 }}>Preço esp.: R${preco.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}/sc</span>}
                            {auxiliaresDeste.length > 0 && <span style={{ fontSize:10, background:"#FBF3E0", color:"#C9921B", borderRadius:5, padding:"2px 7px", fontWeight:600 }}>{auxiliaresDeste.length} auxiliar{auxiliaresDeste.length > 1 ? "es" : ""} vinculado{auxiliaresDeste.length > 1 ? "s" : ""}</span>}
                          </div>
                          {!isAux && receitaEsp != null && (
                            <div style={{ fontSize: 11, color: "#14532D", marginTop: 4, fontWeight: 600 }}>
                              Receita bruta estimada: {receitaEsp.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                              <span style={{ fontWeight: 400, color: "#555", marginLeft: 6 }}>({sacasEsp!.toLocaleString("pt-BR", { maximumFractionDigits: 0 })} sc esperadas)</span>
                            </div>
                          )}
                        </div>
                        <div style={{ display: "flex", gap: 5 }}>
                          <button style={btnE} onClick={() => abrirModalCiclo(c)}>Editar</button>
                          <button style={btnX} onClick={() => { if (confirm("Excluir ciclo?")) excluirCiclo(c.id).then(() => setCiclos(x => x.filter(r => r.id !== c.id))); }}>✕</button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ══ MÁQUINAS E VEÍCULOS ══ */}
          {aba === "maquinas" && (() => {
            const todosMaqSel = maquinas.length > 0 && maquinas.every(m => selMaquinas.has(m.id));
            const algumMaqSel = maquinas.some(m => selMaquinas.has(m.id));
            const thS: React.CSSProperties = { padding: "8px 14px", textAlign: "center" as const, fontSize: 11, fontWeight: 600, color: "#555", borderBottom: "0.5px solid #D4DCE8", whiteSpace: "nowrap" as const };
            return (
            <div style={{ background: "#fff", border: "0.5px solid #D4DCE8", borderRadius: 12, overflow: "hidden" }}>
              <div style={{ padding: "14px 18px", borderBottom: "0.5px solid #DEE5EE", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                <div style={{ color: "#1a1a1a", fontWeight: 600, fontSize: 14 }}>Máquinas e Veículos <span style={{ fontSize: 11, color: "#444", fontWeight: 400 }}>({maquinas.length})</span></div>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  {selMaquinas.size > 0 && (
                    <button
                      style={{ padding: "7px 14px", background: "#E24B4A", color: "#fff", border: "none", borderRadius: 8, fontWeight: 600, cursor: "pointer", fontSize: 13 }}
                      onClick={async () => {
                        const ids = Array.from(selMaquinas);
                        if (!confirm(`Excluir ${ids.length} máquina${ids.length > 1 ? "s" : ""}? Esta ação não pode ser desfeita.`)) return;
                        try {
                          await excluirMaquinas(ids);
                          setMaquinas(p => p.filter(m => !selMaquinas.has(m.id)));
                          setSelMaquinas(new Set());
                        } catch { alert("Erro ao excluir. Verifique se as máquinas possuem registros vinculados."); }
                      }}
                    >
                      Excluir {selMaquinas.size} selecionada{selMaquinas.size > 1 ? "s" : ""}
                    </button>
                  )}
                  <button style={btnV} onClick={() => abrirModalMaq()}>+ Nova Máquina / Veículo</button>
                </div>
              </div>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ background: "#F3F6F9" }}>
                    <th style={{ ...thS, width: 40, padding: "8px 12px" }}>
                      <input type="checkbox" checked={todosMaqSel} ref={el => { if (el) el.indeterminate = algumMaqSel && !todosMaqSel; }}
                        onChange={e => setSelMaquinas(e.target.checked ? new Set(maquinas.map(m => m.id)) : new Set())}
                        style={{ cursor: "pointer", width: 15, height: 15 }} />
                    </th>
                    {["Nome", "Proprietário", "Patrimônio", "Tipo", "Marca / Modelo", "Ano", "Km / Horímetro", "Seguro", "Financiamento", ""].map((c, i) => (
                      <th key={i} style={{ ...thS, textAlign: i === 0 ? "left" : "center" }}>{c}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {maquinas.length === 0 && <tr><td colSpan={10} style={{ padding: 32, textAlign: "center", color: "#444" }}>Nenhuma máquina ou veículo cadastrado</td></tr>}
                  {maquinas.map((m, i) => {
                    const vencSeguro = m.seguro_vencimento_apolice ? diasAteDate(m.seguro_vencimento_apolice) : null;
                    const corSeguro = vencSeguro === null ? "#888" : vencSeguro < 0 ? "#E24B4A" : vencSeguro <= 15 ? "#EF9F27" : "#16A34A";
                    const sel = selMaquinas.has(m.id);
                    return (
                      <tr key={m.id} style={{ borderBottom: i < maquinas.length - 1 ? "0.5px solid #DEE5EE" : "none", background: sel ? "#EBF5FF" : "transparent" }}>
                        <td style={{ padding: "10px 12px", textAlign: "center" }}>
                          <input type="checkbox" checked={sel}
                            onChange={e => setSelMaquinas(prev => { const s = new Set(prev); e.target.checked ? s.add(m.id) : s.delete(m.id); return s; })}
                            style={{ cursor: "pointer", width: 15, height: 15 }} />
                        </td>
                        <td style={{ padding: "10px 14px", color: "#1a1a1a", fontWeight: 600 }}>
                          {m.nome}
                          {m.nr_nf_aquisicao && <div style={{ fontSize: 10, color: "#888", fontWeight: 400 }}>NF: {m.nr_nf_aquisicao}</div>}
                        </td>
                        <td style={{ padding: "10px 14px", textAlign: "center", color: "#444", fontSize: 12 }}>
                          {m.proprietario_id ? (pessoas.find(p => p.id === m.proprietario_id)?.nome ?? "—") : <span style={{ color: "#aaa" }}>—</span>}
                        </td>
                        <td style={{ padding: "10px 14px", textAlign: "center", fontWeight: 600, color: "#1A4870", fontFamily: "monospace", fontSize: 12 }}>{m.patrimonio || "—"}</td>
                        <td style={{ padding: "10px 14px", textAlign: "center" }}>{badge(m.tipo === "carro" ? "Carro" : m.tipo, "#F1EFE8", "#555")}</td>
                        <td style={{ padding: "10px 14px", textAlign: "center", color: "#1a1a1a" }}>{[m.marca, m.modelo].filter(Boolean).join(" ") || "—"}</td>
                        <td style={{ padding: "10px 14px", textAlign: "center", color: "#1a1a1a" }}>{m.ano ?? "—"}</td>
                        <td style={{ padding: "10px 14px", textAlign: "center", color: "#1a1a1a", fontVariantNumeric: "tabular-nums" }}>
                          {m.horimetro_atual != null
                            ? <>{m.horimetro_atual.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} {isVeiculo(m.tipo) ? "km" : "h"}</>
                            : "—"}
                        </td>
                        <td style={{ padding: "10px 14px", textAlign: "center" }}>
                          {m.seguro_vencimento_apolice
                            ? <span style={{ fontSize: 11, color: corSeguro, fontWeight: 600 }}>
                                {vencSeguro! < 0 ? "Vencido" : vencSeguro! <= 15 ? `${vencSeguro}d` : m.seguro_vencimento_apolice.split("-").reverse().join("/")}
                              </span>
                            : <span style={{ color: "#888", fontSize: 11 }}>—</span>}
                        </td>
                        <td style={{ padding: "10px 14px", textAlign: "center" }}>
                          {!m.status_financiamento || m.status_financiamento === "proprio"
                            ? badge("Próprio", "#F1EFE8", "#555")
                            : m.status_financiamento === "financiado"
                            ? badge("Financiado", "#FBF3E0", "#7A5520")
                            : badge("Quitado", "#D5F0DD", "#1A5C38")}
                        </td>
                        <td style={{ padding: "10px 14px", textAlign: "right" }}>
                          <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                            <button style={btnE} onClick={() => abrirModalMaq(m)}>Editar</button>
                            <button style={btnX} onClick={() => { if (confirm("Excluir?")) excluirMaquina(m.id).then(() => setMaquinas(x => x.filter(r => r.id !== m.id))); }}>✕</button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            );
          })()}

          {/* ══ COMBUSTÍVEIS ══ */}
          {aba === "combustivel" && (
            <div style={{ background: "#fff", border: "0.5px solid #D4DCE8", borderRadius: 12, overflow: "hidden" }}>
              <div style={{ padding: "14px 18px", borderBottom: "0.5px solid #DEE5EE", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div style={{ color: "#1a1a1a", fontWeight: 600, fontSize: 14 }}>Bombas de Combustível <span style={{ fontSize: 11, color: "#444", fontWeight: 400 }}>({bombas.length})</span></div>
                <button style={btnV} onClick={() => abrirModalBomba()}>+ Nova Bomba</button>
              </div>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <TH cols={["Nome / Localização", "Combustível", "Capacidade (L)", "Estoque atual (L)", "% Cheio", "Controle", "Status", ""]} />
                <tbody>
                  {bombas.length === 0 && <tr><td colSpan={8} style={{ padding: 32, textAlign: "center", color: "#444" }}>Nenhuma bomba cadastrada</td></tr>}
                  {bombas.map((b, i) => {
                    const pct = b.capacidade_l ? Math.round(b.estoque_atual_l / b.capacidade_l * 100) : null;
                    const corComb: Record<string, [string,string]> = { diesel_s10: ["#E6F1FB","#0C447C"], diesel_s500: ["#E6F1FB","#0B2D50"], gasolina: ["#FAEEDA","#633806"], etanol: ["#D5E8F5","#0B2D50"], arla: ["#FBF0D8","#7A5A12"] };
                    const [bg, cl] = corComb[b.combustivel] ?? ["#F1EFE8","#555"];
                    return (
                      <tr key={b.id} style={{ borderBottom: i < bombas.length - 1 ? "0.5px solid #DEE5EE" : "none" }}>
                        <td style={{ padding: "10px 14px", color: "#1a1a1a", fontWeight: 600 }}>{b.nome}</td>
                        <td style={{ padding: "10px 14px", textAlign: "center" }}>{badge(b.combustivel.replace("_"," ").toUpperCase(), bg, cl)}</td>
                        <td style={{ padding: "10px 14px", textAlign: "center", color: "#1a1a1a" }}>{b.capacidade_l?.toLocaleString("pt-BR") ?? "—"}</td>
                        <td style={{ padding: "10px 14px", textAlign: "center", color: "#1a1a1a", fontWeight: 600 }}>{b.estoque_atual_l.toLocaleString("pt-BR")}</td>
                        <td style={{ padding: "10px 14px", textAlign: "center" }}>
                          {pct !== null ? (
                            <div style={{ display: "flex", alignItems: "center", gap: 6, justifyContent: "center" }}>
                              <div style={{ width: 60, height: 6, background: "#DEE5EE", borderRadius: 3, overflow: "hidden" }}>
                                <div style={{ height: "100%", width: `${pct}%`, background: pct < 20 ? "#E24B4A" : pct < 40 ? "#EF9F27" : "#1A4870", borderRadius: 3 }} />
                              </div>
                              <span style={{ fontSize: 11, color: "#555" }}>{pct}%</span>
                            </div>
                          ) : "—"}
                        </td>
                        <td style={{ padding: "10px 14px", textAlign: "center" }}>{badge(b.consume_estoque !== false ? "Estoque" : "Posto externo", b.consume_estoque !== false ? "#D5E8F5" : "#FBF3E0", b.consume_estoque !== false ? "#0B2D50" : "#7A5A12")}</td>
                        <td style={{ padding: "10px 14px", textAlign: "center" }}>{badge(b.ativa ? "Ativa" : "Inativa", b.ativa ? "#D5E8F5" : "#F1EFE8", b.ativa ? "#0B2D50" : "#555")}</td>
                        <td style={{ padding: "10px 14px", textAlign: "right" }}>
                          <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                            <button style={btnE} onClick={() => abrirModalBomba(b)}>Editar</button>
                            <button style={btnX} onClick={() => { if (confirm("Excluir bomba?")) excluirBomba(b.id).then(() => setBombas(x => x.filter(r => r.id !== b.id))); }}>✕</button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* ══ GRUPOS DE INSUMOS ══ */}
          {aba === "grupos_insumo" && (
            <div style={{ display: "flex", gap: 16 }}>
              {/* Grupos */}
              <div style={{ flex: 1, background: "#fff", border: "0.5px solid #D4DCE8", borderRadius: 12, overflow: "hidden" }}>
                <div style={{ padding: "14px 18px", borderBottom: "0.5px solid #DEE5EE", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div>
                    <div style={{ color: "#1a1a1a", fontWeight: 600, fontSize: 14 }}>Grupos de Insumos</div>
                    <div style={{ fontSize: 11, color: "#555", marginTop: 2 }}>Sementes · Fertilizantes · Defensivos · Inoculantes · Combustíveis…</div>
                  </div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button style={{ ...btnE, fontSize: 12 }} disabled={seedingGrupos} onClick={async () => {
                      if (!confirm("Isso apagará todos os grupos e subgrupos existentes e carregará os padrões do sistema. Confirmar?")) return;
                      setSeedingGrupos(true);
                      try {
                        // Remove todos os existentes e re-seed
                        for (const g of gruposInsumo) await excluirGrupoInsumo(g.id);
                        await seederGruposInsumo(fazIdEff!);
                        const [gs, ss] = await Promise.all([listarGruposInsumo(fazIdEff!), listarSubgruposInsumo(fazIdEff!)]);
                        setGruposInsumo(gs);
                        setSubgruposInsumo(ss);
                      } catch (e) { alert((e as {message?:string})?.message || JSON.stringify(e)); }
                      finally { setSeedingGrupos(false); }
                    }}>{seedingGrupos ? "Carregando…" : "↺ Restaurar padrões"}</button>
                    <button style={btnV} onClick={() => { setEditGrupoIns(null); setFGrupoIns({ nome: "", cor: "#1A4870" }); setModalGrupoIns(true); }}>+ Novo Grupo</button>
                  </div>
                </div>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <TH cols={["Cor", "Nome", ""]} />
                  <tbody>
                    {seedingGrupos && <tr><td colSpan={3} style={{ padding: 24, textAlign: "center", color: "#1A4870", fontSize: 12 }}>Carregando grupos padrão…</td></tr>}
                    {!seedingGrupos && gruposInsumo.length === 0 && <tr><td colSpan={3} style={{ padding: 24, textAlign: "center", color: "#444", fontSize: 12 }}>Nenhum grupo cadastrado</td></tr>}
                    {gruposInsumo.map((g, i) => (
                      <tr key={g.id} style={{ borderBottom: i < gruposInsumo.length - 1 ? "0.5px solid #DEE5EE" : "none" }}>
                        <td style={{ padding: "10px 14px", width: 40 }}><div style={{ width: 18, height: 18, borderRadius: 4, background: g.cor ?? "#666" }} /></td>
                        <td style={{ padding: "10px 14px", color: "#1a1a1a", fontWeight: 600 }}>{g.nome}</td>
                        <td style={{ padding: "10px 14px", textAlign: "right" }}>
                          <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                            <button style={btnE} onClick={() => { setEditGrupoIns(g); setFGrupoIns({ nome: g.nome, cor: g.cor ?? "#1A4870" }); setModalGrupoIns(true); }}>Editar</button>
                            <button style={btnX} onClick={() => { if (confirm("Excluir grupo?")) excluirGrupoInsumo(g.id).then(() => setGruposInsumo(x => x.filter(r => r.id !== g.id))); }}>✕</button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {/* Subgrupos */}
              <div style={{ flex: 1, background: "#fff", border: "0.5px solid #D4DCE8", borderRadius: 12, overflow: "hidden" }}>
                <div style={{ padding: "14px 18px", borderBottom: "0.5px solid #DEE5EE", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div>
                    <div style={{ color: "#1a1a1a", fontWeight: 600, fontSize: 14 }}>Subgrupos de Insumos</div>
                    <div style={{ fontSize: 11, color: "#555", marginTop: 2 }}>Ex: Herbicidas, Fungicidas, NPK, Micronutrientes</div>
                  </div>
                  <button style={btnV} onClick={() => { setEditSubgIns(null); setFSubgIns({ nome: "", grupo_id: gruposInsumo[0]?.id ?? "" }); setModalSubgIns(true); }}>+ Novo Subgrupo</button>
                </div>
                <div style={{ overflowY: "auto", maxHeight: 520 }}>
                  {subgruposInsumo.length === 0 && !seedingGrupos && (
                    <div style={{ padding: 24, textAlign: "center", color: "#444", fontSize: 12 }}>Nenhum subgrupo cadastrado</div>
                  )}
                  {gruposInsumo.map(g => {
                    const subs = subgruposInsumo.filter(s => s.grupo_id === g.id);
                    if (subs.length === 0) return null;
                    return (
                      <div key={g.id}>
                        <div style={{ padding: "7px 14px", background: "#F3F6F9", borderBottom: "0.5px solid #DEE5EE", display: "flex", alignItems: "center", gap: 8 }}>
                          <div style={{ width: 10, height: 10, borderRadius: 3, background: g.cor ?? "#666", flexShrink: 0 }} />
                          <span style={{ fontSize: 11, fontWeight: 700, color: "#1a1a1a", textTransform: "uppercase", letterSpacing: "0.04em" }}>{g.nome}</span>
                          <span style={{ fontSize: 11, color: "#888", marginLeft: "auto" }}>{subs.length}</span>
                        </div>
                        {subs.map((s, i) => (
                          <div key={s.id} style={{ display: "flex", alignItems: "center", padding: "8px 14px 8px 32px", borderBottom: i < subs.length - 1 ? "0.5px solid #F0F3F8" : "0.5px solid #DEE5EE" }}>
                            <span style={{ flex: 1, fontSize: 13, color: "#1a1a1a" }}>{s.nome}</span>
                            <div style={{ display: "flex", gap: 6 }}>
                              <button style={btnE} onClick={() => { setEditSubgIns(s); setFSubgIns({ nome: s.nome, grupo_id: s.grupo_id }); setModalSubgIns(true); }}>Editar</button>
                              <button style={btnX} onClick={() => { if (confirm("Excluir subgrupo?")) excluirSubgrupoInsumo(s.id).then(() => setSubgruposInsumo(x => x.filter(r => r.id !== s.id))); }}>✕</button>
                            </div>
                          </div>
                        ))}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* ══ TABELAS AUXILIARES (oculto da nav — acessível via URL direta) ══ */}
          {(aba as string) === "auxiliares" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

              {/* Sub-abas */}
              <div style={{ display: "flex", gap: 0, background: "#fff", border: "0.5px solid #D4DCE8", borderRadius: 8, overflow: "hidden", width: "fit-content" }}>
                {([
                  { key: "grupos_insumo", label: "Grupos de Insumos" },
                  { key: "tipos_pessoa",  label: "Tipos de Pessoa"   },
                  { key: "centros_custo", label: "Centros de Custo"  },
                  { key: "categorias",    label: "Categorias Financeiras" },
                ] as { key: SubAbaAux; label: string }[]).map(s => (
                  <button key={s.key} onClick={() => setSubAbaAux(s.key)} style={{
                    padding: "8px 18px", border: "none",
                    background: subAbaAux === s.key ? "#1A4870" : "transparent",
                    color: subAbaAux === s.key ? "#fff" : "#666",
                    fontWeight: subAbaAux === s.key ? 600 : 400,
                    cursor: "pointer", fontSize: 13, whiteSpace: "nowrap",
                  }}>
                    {s.label}
                  </button>
                ))}
              </div>

              {/* ── Grupos de Insumos ── */}
              {subAbaAux === "grupos_insumo" && (
                <div style={{ display: "flex", gap: 16 }}>
                  {/* Grupos */}
                  <div style={{ flex: 1, background: "#fff", border: "0.5px solid #D4DCE8", borderRadius: 12, overflow: "hidden" }}>
                    <div style={{ padding: "14px 18px", borderBottom: "0.5px solid #DEE5EE", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <div>
                        <div style={{ color: "#1a1a1a", fontWeight: 600, fontSize: 14 }}>Grupos</div>
                        <div style={{ fontSize: 11, color: "#555", marginTop: 2 }}>Ex: Sementes, Fertilizantes, Defensivos, Produtos Agrícolas</div>
                      </div>
                      <button style={btnV} onClick={() => { setEditGrupoIns(null); setFGrupoIns({ nome: "", cor: "#1A4870" }); setModalGrupoIns(true); }}>+ Novo</button>
                    </div>
                    <table style={{ width: "100%", borderCollapse: "collapse" }}>
                      <TH cols={["Cor", "Nome", ""]} />
                      <tbody>
                        {gruposInsumo.length === 0 && <tr><td colSpan={3} style={{ padding: 24, textAlign: "center", color: "#444", fontSize: 12 }}>Nenhum grupo cadastrado</td></tr>}
                        {gruposInsumo.map((g, i) => (
                          <tr key={g.id} style={{ borderBottom: i < gruposInsumo.length - 1 ? "0.5px solid #DEE5EE" : "none" }}>
                            <td style={{ padding: "10px 14px", width: 40 }}>
                              <div style={{ width: 18, height: 18, borderRadius: 4, background: g.cor ?? "#666" }} />
                            </td>
                            <td style={{ padding: "10px 14px", color: "#1a1a1a", fontWeight: 600 }}>{g.nome}</td>
                            <td style={{ padding: "10px 14px", textAlign: "right" }}>
                              <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                                <button style={btnE} onClick={() => { setEditGrupoIns(g); setFGrupoIns({ nome: g.nome, cor: g.cor ?? "#1A4870" }); setModalGrupoIns(true); }}>Editar</button>
                                <button style={btnX} onClick={() => { if (confirm("Excluir grupo?")) excluirGrupoInsumo(g.id).then(() => setGruposInsumo(x => x.filter(r => r.id !== g.id))); }}>✕</button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Subgrupos */}
                  <div style={{ flex: 1, background: "#fff", border: "0.5px solid #D4DCE8", borderRadius: 12, overflow: "hidden" }}>
                    <div style={{ padding: "14px 18px", borderBottom: "0.5px solid #DEE5EE", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <div>
                        <div style={{ color: "#1a1a1a", fontWeight: 600, fontSize: 14 }}>Subgrupos</div>
                        <div style={{ fontSize: 11, color: "#555", marginTop: 2 }}>Ex: Herbicidas, Fungicidas, NPK, Micronutrientes</div>
                      </div>
                      <button style={btnV} onClick={() => { setEditSubgIns(null); setFSubgIns({ nome: "", grupo_id: gruposInsumo[0]?.id ?? "" }); setModalSubgIns(true); }}>+ Novo</button>
                    </div>
                    <table style={{ width: "100%", borderCollapse: "collapse" }}>
                      <TH cols={["Nome", "Grupo", ""]} />
                      <tbody>
                        {subgruposInsumo.length === 0 && <tr><td colSpan={3} style={{ padding: 24, textAlign: "center", color: "#444", fontSize: 12 }}>Nenhum subgrupo cadastrado</td></tr>}
                        {subgruposInsumo.map((s, i) => {
                          const g = gruposInsumo.find(x => x.id === s.grupo_id);
                          return (
                            <tr key={s.id} style={{ borderBottom: i < subgruposInsumo.length - 1 ? "0.5px solid #DEE5EE" : "none" }}>
                              <td style={{ padding: "10px 14px", color: "#1a1a1a", fontWeight: 600 }}>{s.nome}</td>
                              <td style={{ padding: "10px 14px" }}>
                                {g && <span style={{ fontSize: 11, background: g.cor ?? "#D5E8F5", color: "#0B2D50", padding: "2px 8px", borderRadius: 8 }}>{g.nome}</span>}
                              </td>
                              <td style={{ padding: "10px 14px", textAlign: "right" }}>
                                <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                                  <button style={btnE} onClick={() => { setEditSubgIns(s); setFSubgIns({ nome: s.nome, grupo_id: s.grupo_id }); setModalSubgIns(true); }}>Editar</button>
                                  <button style={btnX} onClick={() => { if (confirm("Excluir subgrupo?")) excluirSubgrupoInsumo(s.id).then(() => setSubgruposInsumo(x => x.filter(r => r.id !== s.id))); }}>✕</button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* ── Tipos de Pessoa ── */}
              {subAbaAux === "tipos_pessoa" && (
                <div style={{ background: "#fff", border: "0.5px solid #D4DCE8", borderRadius: 12, overflow: "hidden" }}>
                  <div style={{ padding: "14px 18px", borderBottom: "0.5px solid #DEE5EE", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div>
                      <div style={{ color: "#1a1a1a", fontWeight: 600, fontSize: 14 }}>Tipos de Pessoa</div>
                      <div style={{ fontSize: 11, color: "#555", marginTop: 2 }}>Ex: Cliente, Fornecedor, Transportador, Prestador de Serviço, Banco, Instituição Financeira, Produtor</div>
                    </div>
                    <button style={btnV} onClick={() => { setEditTipoPes(null); setFTipoPes({ nome: "", descricao: "" }); setModalTipoPes(true); }}>+ Novo Tipo</button>
                  </div>
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <TH cols={["Nome", "Descrição", ""]} />
                    <tbody>
                      {tiposPessoa.length === 0 && <tr><td colSpan={3} style={{ padding: 32, textAlign: "center", color: "#444" }}>Nenhum tipo cadastrado</td></tr>}
                      {tiposPessoa.map((t, i) => (
                        <tr key={t.id} style={{ borderBottom: i < tiposPessoa.length - 1 ? "0.5px solid #DEE5EE" : "none" }}>
                          <td style={{ padding: "10px 14px", color: "#1a1a1a", fontWeight: 600 }}>{t.nome}</td>
                          <td style={{ padding: "10px 14px", color: "#1a1a1a", fontSize: 12 }}>{t.descricao || "—"}</td>
                          <td style={{ padding: "10px 14px", textAlign: "right" }}>
                            <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                              <button style={btnE} onClick={() => { setEditTipoPes(t); setFTipoPes({ nome: t.nome, descricao: t.descricao ?? "" }); setModalTipoPes(true); }}>Editar</button>
                              <button style={btnX} onClick={() => { if (confirm("Excluir tipo?")) excluirTipoPessoa(t.id).then(() => setTiposPessoa(x => x.filter(r => r.id !== t.id))); }}>✕</button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* ── Centros de Custo ── */}
              {subAbaAux === "centros_custo" && (
                <div style={{ background: "#fff", border: "0.5px solid #D4DCE8", borderRadius: 12, overflow: "hidden" }}>
                  <div style={{ padding: "14px 18px", borderBottom: "0.5px solid #DEE5EE", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div>
                      <div style={{ color: "#1a1a1a", fontWeight: 600, fontSize: 14 }}>Centros de Custo</div>
                      <div style={{ fontSize: 11, color: "#555", marginTop: 2 }}>Estrutura hierárquica para rateio de receitas e despesas por área, safra ou atividade</div>
                    </div>
                    <button style={btnV} onClick={() => { setEditCC(null); setFCC({ codigo: "", nome: "", tipo: "despesa", parent_id: "", manutencao_maquinas: false }); setModalCC(true); }}>+ Novo</button>
                  </div>
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <TH cols={["Código", "Nome", "Tipo", "Centro Pai", ""]} />
                    <tbody>
                      {centrosCusto.length === 0 && <tr><td colSpan={5} style={{ padding: 32, textAlign: "center", color: "#444" }}>Nenhum centro de custo cadastrado</td></tr>}
                      {centrosCusto.map((c, i) => {
                        const pai = centrosCusto.find(x => x.id === c.parent_id);
                        const corTipo: Record<string, [string,string]> = {
                          receita: ["#D5E8F5","#0B2D50"],
                          despesa: ["#FCEBEB","#791F1F"],
                          neutro:  ["#F1EFE8","#666"],
                        };
                        const [bg, cl] = corTipo[c.tipo] ?? ["#F1EFE8","#666"];
                        return (
                          <tr key={c.id} style={{ borderBottom: i < centrosCusto.length - 1 ? "0.5px solid #DEE5EE" : "none" }}>
                            <td style={{ padding: "10px 14px", color: "#1a1a1a", fontSize: 12, whiteSpace: "nowrap" }}>{c.codigo || "—"}</td>
                            <td style={{ padding: "10px 14px", color: "#1a1a1a", fontWeight: 600 }}>{c.nome}</td>
                            <td style={{ padding: "10px 14px", textAlign: "center" }}>{badge(c.tipo, bg, cl)}</td>
                            <td style={{ padding: "10px 14px", fontSize: 12, color: "#1a1a1a" }}>{pai?.nome || "—"}</td>
                            <td style={{ padding: "10px 14px", textAlign: "right" }}>
                              <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                                <button style={btnE} onClick={() => { setEditCC(c); setFCC({ codigo: c.codigo ?? "", nome: c.nome, tipo: c.tipo, parent_id: c.parent_id ?? "", manutencao_maquinas: c.manutencao_maquinas ?? false }); setModalCC(true); }}>Editar</button>
                                <button style={btnX} onClick={() => { if (confirm("Excluir?")) excluirCentroCusto(c.id).then(() => setCentrosCusto(x => x.filter(r => r.id !== c.id))); }}>✕</button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              {/* ── Categorias de Lançamento ── */}
              {subAbaAux === "categorias" && (
                <div style={{ background: "#fff", border: "0.5px solid #D4DCE8", borderRadius: 12, overflow: "hidden" }}>
                  <div style={{ padding: "14px 18px", borderBottom: "0.5px solid #DEE5EE", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div>
                      <div style={{ color: "#1a1a1a", fontWeight: 600, fontSize: 14 }}>Categorias Financeiras</div>
                      <div style={{ fontSize: 11, color: "#555", marginTop: 2 }}>Categorias usadas em Contas a Pagar, Contas a Receber e Fluxo de Caixa</div>
                    </div>
                    <button style={btnV} onClick={() => { setEditCatLanc(null); setFCatLanc({ nome: "", tipo: "ambos" }); setModalCatLanc(true); }}>+ Nova Categoria</button>
                  </div>
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <TH cols={["Nome", "Uso", ""]} />
                    <tbody>
                      {categoriasLanc.length === 0 && <tr><td colSpan={3} style={{ padding: 32, textAlign: "center", color: "#444" }}>Nenhuma categoria cadastrada</td></tr>}
                      {categoriasLanc.map((c, i) => {
                        const corTipo: Record<string,[string,string]> = {
                          pagar:   ["#FCEBEB","#791F1F"],
                          receber: ["#D5E8F5","#0B2D50"],
                          ambos:   ["#E6F1FB","#0C447C"],
                        };
                        const [bg, cl] = corTipo[c.tipo] ?? ["#F1EFE8","#666"];
                        const labelTipo = { pagar: "CP — A Pagar", receber: "CR — A Receber", ambos: "CP e CR" }[c.tipo];
                        return (
                          <tr key={c.id} style={{ borderBottom: i < categoriasLanc.length - 1 ? "0.5px solid #DEE5EE" : "none" }}>
                            <td style={{ padding: "10px 14px", color: "#1a1a1a", fontWeight: 600 }}>{c.nome}</td>
                            <td style={{ padding: "10px 14px", textAlign: "center" }}>{badge(labelTipo ?? c.tipo, bg, cl)}</td>
                            <td style={{ padding: "10px 14px", textAlign: "right" }}>
                              <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                                <button style={btnE} onClick={() => { setEditCatLanc(c); setFCatLanc({ nome: c.nome, tipo: c.tipo }); setModalCatLanc(true); }}>Editar</button>
                                <button style={btnX} onClick={() => { if (confirm("Excluir?")) excluirCategoriaLancamento(c.id).then(() => setCategoriasLanc(x => x.filter(r => r.id !== c.id))); }}>✕</button>
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

          {/* ══ CENTROS DE CUSTO (aba dedicada) ══ */}
          {aba === "centros_custo" && (
            <div style={{ background: "#fff", border: "0.5px solid #D4DCE8", borderRadius: 12, overflow: "hidden" }}>
              <div style={{ padding: "14px 18px", borderBottom: "0.5px solid #DEE5EE", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <div style={{ color: "#1a1a1a", fontWeight: 600, fontSize: 14 }}>Centros de Custo</div>
                  <div style={{ fontSize: 11, color: "#555", marginTop: 2 }}>Estrutura hierárquica para rateio de receitas e despesas por área, safra ou atividade</div>
                </div>
                <button style={btnV} onClick={() => { setEditCC(null); setFCC({ codigo: "", nome: "", tipo: "despesa", parent_id: "", manutencao_maquinas: false }); setModalCC(true); }}>+ Novo</button>
              </div>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <TH cols={["Código", "Nome", "Tipo", "Centro Pai", ""]} />
                <tbody>
                  {centrosCusto.length === 0 && <tr><td colSpan={5} style={{ padding: 32, textAlign: "center", color: "#444" }}>Nenhum centro de custo cadastrado</td></tr>}
                  {centrosCusto.map((c, i) => {
                    const pai = centrosCusto.find(x => x.id === c.parent_id);
                    const corTipo: Record<string, [string,string]> = {
                      receita: ["#D5E8F5","#0B2D50"],
                      despesa: ["#FCEBEB","#791F1F"],
                      neutro:  ["#F1EFE8","#666"],
                    };
                    const [bg, cl] = corTipo[c.tipo] ?? ["#F1EFE8","#666"];
                    return (
                      <tr key={c.id} style={{ borderBottom: i < centrosCusto.length - 1 ? "0.5px solid #DEE5EE" : "none" }}>
                        <td style={{ padding: "10px 14px", fontSize: 12, color: "#1a1a1a", whiteSpace: "nowrap" }}>{c.codigo || "—"}</td>
                        <td style={{ padding: "10px 14px", color: "#1a1a1a", fontWeight: 600 }}>{c.nome}</td>
                        <td style={{ padding: "10px 14px", textAlign: "center" }}>{badge(c.tipo, bg, cl)}</td>
                        <td style={{ padding: "10px 14px", fontSize: 12, color: "#1a1a1a" }}>{pai?.nome || "—"}</td>
                        <td style={{ padding: "10px 14px", textAlign: "right" }}>
                          <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                            <button style={btnE} onClick={() => { setEditCC(c); setFCC({ codigo: c.codigo ?? "", nome: c.nome, tipo: c.tipo, parent_id: c.parent_id ?? "", manutencao_maquinas: c.manutencao_maquinas ?? false }); setModalCC(true); }}>Editar</button>
                            <button style={btnX} onClick={() => { if (confirm("Excluir?")) excluirCentroCusto(c.id).then(() => setCentrosCusto(x => x.filter(r => r.id !== c.id))); }}>✕</button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* ══ OPERAÇÕES GERENCIAIS / PLANO DE CONTAS ══ */}
          {aba === "operacoes_gerenciais" && (
            <div style={{ background: "#fff", border: "0.5px solid #D4DCE8", borderRadius: 12, overflow: "hidden" }}>
              <div style={{ padding: "14px 18px", borderBottom: "0.5px solid #DEE5EE", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <div style={{ color: "#1a1a1a", fontWeight: 600, fontSize: 14 }}>Operações Gerenciais — Plano de Contas</div>
                  <div style={{ fontSize: 11, color: "#555", marginTop: 2 }}>Classificação hierárquica de receitas e despesas com configurações fiscal, estoque e financeiro</div>
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <button
                    style={{ padding: "8px 16px", border: "0.5px solid #C9921B", borderRadius: 8, background: "#FBF3E0", color: "#7A5A10", fontWeight: 600, cursor: seedingOpGer ? "not-allowed" : "pointer", fontSize: 13, opacity: seedingOpGer ? 0.6 : 1 }}
                    disabled={seedingOpGer}
                    onClick={async () => {
                      if (!confirm("Isso vai substituir TODAS as operações existentes pelo plano padrão. Continuar?")) return;
                      setSeedingOpGer(true);
                      try {
                        const { inseridos } = await seedOperacoesGerenciais(fazIdEff!);
                        const lista = await listarOperacoesGerenciais(fazIdEff!);
                        setOpGers(lista);
                        alert(`Plano importado com sucesso! ${inseridos} operações criadas.`);
                      } catch (e: unknown) {
                        const msg = e instanceof Error
                          ? e.message
                          : (e && typeof e === "object" && "message" in e)
                            ? String((e as Record<string, unknown>).message)
                            : JSON.stringify(e);
                        alert("Erro ao importar:\n" + msg);
                      } finally {
                        setSeedingOpGer(false);
                      }
                    }}
                  >{seedingOpGer ? "Importando…" : "↓ Importar Plano Padrão"}</button>
                  <button
                    style={{ padding: "8px 16px", border: "0.5px solid #1A4870", borderRadius: 8, background: "#D5E8F5", color: "#0B2D50", fontWeight: 600, cursor: seedingCfop ? "not-allowed" : "pointer", fontSize: 13, opacity: seedingCfop ? 0.6 : 1 }}
                    disabled={seedingCfop}
                    onClick={async () => {
                      if (!confirm("Isso vai substituir TODOS os CFOPs vinculados às operações pelo padrão do sistema (352 registros). Continuar?")) return;
                      setSeedingCfop(true);
                      try {
                        const res = await fetch("/api/seed-cfops", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ fazenda_id: fazIdEff }),
                        });
                        const json = await res.json();
                        if (!res.ok) throw new Error(json.error ?? "Erro desconhecido");
                        const { inseridos, ignorados } = json as { inseridos: number; ignorados: number };
                        alert(`CFOPs importados com sucesso!\n${inseridos} registros inseridos${ignorados > 0 ? `\n${ignorados} ignorados (operações sem ref_id correspondente)` : ""}.`);
                      } catch (e: unknown) {
                        const msg = e instanceof Error ? e.message : JSON.stringify(e);
                        alert("Erro ao importar CFOPs:\n" + msg);
                      } finally {
                        setSeedingCfop(false);
                      }
                    }}
                  >{seedingCfop ? "Importando CFOPs…" : "↓ Importar CFOPs Padrão"}</button>
                  <button
                    onClick={() => {
                      const sorted = [...opGers].sort((a, b) => a.classificacao.localeCompare(b.classificacao, "pt-BR", { numeric: false }));
                      const linhas = sorted.map(o => {
                        const nivel = (o.classificacao.match(/\./g) || []).length;
                        const telas = [o.permite_notas_fiscais && "NF", o.permite_cp_cr && "CP/CR", o.permite_tesouraria && "Tesouraria", o.permite_baixas && "Baixas", o.permite_adiantamentos && "Adiant.", o.permite_pedidos_venda && "Ped.Venda", o.permite_estoque && "Estoque"].filter(Boolean).join(" · ");
                        const pad = "&nbsp;".repeat(nivel * 4);
                        return `<tr style="background:${nivel===0?"#F0F4FA":"#fff"};border-bottom:0.5px solid #DDE2EE">
                          <td style="padding:6px 10px;font-family:monospace;font-size:11px;color:#555;white-space:nowrap">${o.classificacao}</td>
                          <td style="padding:6px 10px;font-size:12px">${pad}${nivel>0?"└ ":""}${o.descricao}</td>
                          <td style="padding:6px 10px;text-align:center;font-size:11px;color:${o.tipo==="receita"?"#1A5C1A":"#791F1F"};font-weight:600">${o.tipo==="receita"?"Receita":"Despesa"}</td>
                          <td style="padding:6px 10px;font-size:10px;color:#555">${telas}</td>
                          <td style="padding:6px 10px;font-size:11px;color:#555">${o.historico_tesouraria_nome||"—"}</td>
                        </tr>`;
                      }).join("");
                      const w = window.open("", "_blank", "width=900,height=700");
                      if (!w) return;
                      w.document.write(`<!DOCTYPE html><html><head><title>Plano de Contas Gerencial</title>
                        <style>body{font-family:Arial,sans-serif;margin:20px;font-size:12px}
                        h2{color:#1A4870;margin-bottom:4px}p{color:#888;font-size:11px;margin:0 0 14px}
                        table{width:100%;border-collapse:collapse}th{background:#1A4870;color:#fff;padding:7px 10px;text-align:left;font-size:11px}
                        @media print{@page{size:A4 landscape;margin:15mm}}</style></head>
                        <body><h2>Plano de Contas Gerencial</h2>
                        <p>Emitido em ${new Date().toLocaleDateString("pt-BR")} — ${sorted.length} operações</p>
                        <table><thead><tr><th>Código</th><th>Descrição</th><th>Tipo</th><th>Telas</th><th>Tesouraria</th></tr></thead>
                        <tbody>${linhas}</tbody></table>
                        <script>window.onload=function(){window.print();}<\/script></body></html>`);
                      w.document.close();
                    }}
                    style={{ fontSize: 13, padding: "8px 14px", border: "0.5px solid #DDE2EE", borderRadius: 8, background: "#F4F6FA", color: "#555", cursor: "pointer", fontWeight: 600 }}
                  >🖨 Imprimir</button>
                  <button
                    onClick={async () => {
                      const XLSX = await import("xlsx");
                      const sorted = [...opGers].sort((a, b) => a.classificacao.localeCompare(b.classificacao, "pt-BR", { numeric: false }));
                      const dados = sorted.map(o => ({
                        "Código":          o.classificacao,
                        "Descrição":       o.descricao,
                        "Tipo":            o.tipo === "receita" ? "Receita" : "Despesa",
                        "NF":              o.permite_notas_fiscais ? "Sim" : "",
                        "CP/CR":           o.permite_cp_cr ? "Sim" : "",
                        "Tesouraria":      o.permite_tesouraria ? "Sim" : "",
                        "Baixas":          o.permite_baixas ? "Sim" : "",
                        "Pedido Venda":    o.permite_pedidos_venda ? "Sim" : "",
                        "Estoque":         o.permite_estoque ? "Sim" : "",
                        "Conta Débito":    o.conta_debito || "",
                        "Conta Crédito":   o.conta_credito || "",
                        "Tesouraria Hist.":o.historico_tesouraria_nome || "",
                        "Inativo":         o.inativo ? "Sim" : "Não",
                      }));
                      const ws = XLSX.utils.json_to_sheet(dados);
                      // Larguras das colunas
                      ws["!cols"] = [
                        { wch: 18 }, { wch: 45 }, { wch: 10 }, { wch: 6 }, { wch: 7 }, { wch: 10 },
                        { wch: 8 }, { wch: 12 }, { wch: 8 }, { wch: 16 }, { wch: 16 }, { wch: 20 }, { wch: 8 },
                      ];
                      const wb = XLSX.utils.book_new();
                      XLSX.utils.book_append_sheet(wb, ws, "Plano de Contas");
                      XLSX.writeFile(wb, `plano_gerencial_${new Date().toISOString().split("T")[0]}.xlsx`);
                    }}
                    style={{ fontSize: 13, padding: "8px 14px", border: "0.5px solid #16A34A", borderRadius: 8, background: "#F0FDF4", color: "#16A34A", cursor: "pointer", fontWeight: 600 }}
                  >⬇ XLSX</button>
                  <button style={btnV} onClick={() => { setEditOpGer(null); setFOG({ ...OG_VAZIO }); setAbaOpGer("principal"); setModalOpGer(true); }}>+ Nova Operação</button>
                </div>
              </div>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <TH cols={["Código / Descrição", "Tipo", "Telas", "Tesouraria", "Ativo", ""]} />
                <tbody>
                  {opGers.length === 0 && <tr><td colSpan={4} style={{ padding: 32, textAlign: "center", color: "#888" }}>Nenhuma operação cadastrada. Clique em "+ Nova Operação" para começar.</td></tr>}
                  {[...opGers].sort((a, b) => a.classificacao.localeCompare(b.classificacao, "pt-BR", { numeric: false })).map((o, i, arr) => {
                    const nivel = (o.classificacao.match(/\./g) || []).length;
                    const telas: string[] = [];
                    if (o.permite_notas_fiscais)  telas.push("NF");
                    if (o.permite_cp_cr)          telas.push("CP/CR");
                    if (o.permite_tesouraria)     telas.push("Tesouraria");
                    if (o.permite_baixas)         telas.push("Baixas");
                    if (o.permite_adiantamentos)  telas.push("Adiant.");
                    if (o.permite_pedidos_venda)  telas.push("Ped.Venda");
                    if (o.permite_estoque)        telas.push("Estoque");
                    return (
                      <tr key={o.id} style={{ borderBottom: i < arr.length - 1 ? "0.5px solid #DEE5EE" : "none", opacity: o.inativo ? 0.5 : 1, background: nivel === 0 ? "#F8FAFD" : "#fff" }}>
                        <td style={{ padding: "9px 14px" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8, paddingLeft: nivel * 20 }}>
                            {nivel > 0 && <span style={{ color: "#BCC8D8", fontSize: 11, userSelect: "none" }}>{"└─"}</span>}
                            <span style={{ fontSize: 11, color: "#888", fontFamily: "monospace", minWidth: 80 }}>{o.classificacao}</span>
                            <span style={{ color: "#1a1a1a", fontWeight: nivel === 0 ? 600 : 400, fontSize: 13 }}>{o.descricao}</span>
                            {o.inativo && <span style={{ fontSize: 10, color: "#888", background: "#F3F3F3", padding: "1px 5px", borderRadius: 4 }}>inativo</span>}
                          </div>
                        </td>
                        <td style={{ padding: "9px 14px", textAlign: "center", whiteSpace: "nowrap" }}>
                          {badge(o.tipo === "receita" ? "Receita" : "Despesa",
                            o.tipo === "receita" ? "#EBF5EB" : "#FCEBEB",
                            o.tipo === "receita" ? "#1A5C1A" : "#791F1F")}
                        </td>
                        <td style={{ padding: "9px 14px" }}>
                          <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                            {telas.map(t => <span key={t} style={{ fontSize: 10, background: "#F3F6F9", color: "#555", padding: "2px 6px", borderRadius: 4 }}>{t}</span>)}
                          </div>
                        </td>
                        <td style={{ padding: "9px 14px", fontSize: 11, color: "#555", whiteSpace: "nowrap" }}>
                          {o.historico_tesouraria_nome
                            ? <span style={{ fontSize: 10, background: "#D5E8F5", color: "#0B2D50", padding: "2px 6px", borderRadius: 4 }}>{o.historico_tesouraria_nome}</span>
                            : <span style={{ color: "#ccc" }}>—</span>}
                        </td>
                        <td style={{ padding: "9px 14px", textAlign: "center" }}>
                          <button
                            onClick={() => {
                              const novo = !o.inativo;
                              atualizarOperacaoGerencial(o.id, { inativo: novo })
                                .then(() => setOpGers(x => x.map(r => r.id === o.id ? { ...r, inativo: novo } : r)))
                                .catch(e => alert(e.message));
                            }}
                            title={o.inativo ? "Clique para ativar" : "Clique para desativar"}
                            style={{
                              padding: "3px 10px", borderRadius: 12, border: "0.5px solid",
                              cursor: "pointer", fontSize: 11, fontWeight: 600,
                              background: o.inativo ? "#F3F3F3" : "#EBF5EB",
                              color:      o.inativo ? "#888"    : "#1A5C1A",
                              borderColor: o.inativo ? "#CCC"   : "#A3D9A3",
                            }}
                          >{o.inativo ? "Inativo" : "Ativo"}</button>
                        </td>
                        <td style={{ padding: "9px 14px", textAlign: "right" }}>
                          <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                            <button style={btnE} onClick={() => {
                              setEditOpGer(o);
                              setFOG({
                                parent_id: o.parent_id ?? "",
                                classificacao: o.classificacao, descricao: o.descricao, tipo: o.tipo,
                                tipo_lcdpr: o.tipo_lcdpr ?? "",
                                permite_notas_fiscais: o.permite_notas_fiscais ?? false,
                                permite_cp_cr: o.permite_cp_cr ?? false,
                                permite_adiantamentos: o.permite_adiantamentos ?? false,
                                permite_tesouraria: o.permite_tesouraria ?? false,
                                permite_baixas: o.permite_baixas ?? false,
                                permite_custo_produto: o.permite_custo_produto ?? false,
                                permite_contrato_financeiro: o.permite_contrato_financeiro ?? false,
                                permite_estoque: o.permite_estoque ?? false,
                                permite_pedidos_venda: o.permite_pedidos_venda ?? false,
                                permite_manutencao: o.permite_manutencao ?? false,
                                marcar_fiscal_padrao: o.marcar_fiscal_padrao ?? false,
                                permite_energia_eletrica: o.permite_energia_eletrica ?? false,
                                operacao_estoque: o.operacao_estoque ?? "",
                                tipo_custo_estoque: o.tipo_custo_estoque ?? "nenhum",
                                obs_legal: o.obs_legal ?? "", natureza_receita: o.natureza_receita ?? "",
                                impostos: o.impostos ?? [],
                                gerar_financeiro: o.gerar_financeiro ?? false,
                                gerar_financeiro_gerencial: o.gerar_financeiro_gerencial ?? false,
                                valida_propriedade: o.valida_propriedade ?? false,
                                custo_absorcao: o.custo_absorcao ?? false,
                                custo_abc: o.custo_abc ?? false,
                                atualizar_custo_estoque: o.atualizar_custo_estoque ?? false,
                                manutencao_reparos: o.manutencao_reparos ?? false,
                                gerar_depreciacao: o.gerar_depreciacao ?? false,
                                tipo_formula: o.tipo_formula ?? "", modelo_contabil: o.modelo_contabil ?? "",
                                inativo: o.inativo ?? false, informa_complemento: o.informa_complemento ?? false,
                                conta_debito: o.conta_debito ?? "", conta_credito: o.conta_credito ?? "",
                                historico_tesouraria_id: o.historico_tesouraria_id ?? "",
                                historico_tesouraria_nome: o.historico_tesouraria_nome ?? "",
                              });
                              setAbaOpGer("principal");
                              setCfopsOp([]);
                              setModalOpGer(true);
                            }}>Editar</button>
                            <button style={btnX} onClick={() => { if (confirm("Excluir operação?")) excluirOperacaoGerencial(o.id).then(() => setOpGers(x => x.filter(r => r.id !== o.id))); }}>✕</button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* ══ HISTÓRICO FISCAL (CFOPs) ══ */}
          {aba === "historico_fiscal" && (() => {
            const opNfOptions = Array.from(new Set(hisFiscal.map(r => r.operacao_nf).filter(Boolean))).sort() as string[];
            const linhas = hisFiscal.filter(r => {
              const buscaOk = !hfBusca || r.op_classificacao.includes(hfBusca) || r.op_descricao.toLowerCase().includes(hfBusca.toLowerCase()) || r.cfop.includes(hfBusca) || (r.descricao_cfop ?? "").toLowerCase().includes(hfBusca.toLowerCase());
              const cfopOk  = !hfFiltroCfop || r.cfop.startsWith(hfFiltroCfop);
              const tipoOk  = !hfFiltroTipo || r.op_tipo === hfFiltroTipo;
              const nfOk    = !hfFiltroNf   || r.operacao_nf === hfFiltroNf;
              return buscaOk && cfopOk && tipoOk && nfOk;
            });

            // Agrupar por operação
            const grupos = new Map<string, { classificacao: string; descricao: string; tipo: string; rows: typeof linhas }>();
            for (const r of linhas) {
              const key = r.op_classificacao;
              if (!grupos.has(key)) grupos.set(key, { classificacao: r.op_classificacao, descricao: r.op_descricao, tipo: r.op_tipo, rows: [] });
              grupos.get(key)!.rows.push(r);
            }
            const gruposArr = Array.from(grupos.values()).sort((a, b) => a.classificacao.localeCompare(b.classificacao));

            return (
              <div style={{ background: "#fff", border: "0.5px solid #D4DCE8", borderRadius: 12, overflow: "hidden" }}>
                {/* Cabeçalho */}
                <div style={{ padding: "14px 18px", borderBottom: "0.5px solid #DEE5EE" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 10 }}>
                    <div>
                      <div style={{ color: "#1a1a1a", fontWeight: 600, fontSize: 14 }}>Histórico Fiscal — CFOPs vinculados às Operações Gerenciais</div>
                      <div style={{ fontSize: 11, color: "#555", marginTop: 2 }}>
                        {loadingHisFiscal ? "Carregando…" : `${hisFiscal.length} registros · ${grupos.size || gruposArr.length} operações · ${linhas.length} exibidos`}
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: 8 }}>
                      <button
                        disabled={seedingCfop}
                        onClick={async () => {
                          if (!confirm("Isso vai substituir TODOS os CFOPs vinculados às operações pelo padrão do sistema (352 registros). Continuar?")) return;
                          setSeedingCfop(true);
                          try {
                            const res = await fetch("/api/seed-cfops", {
                              method: "POST",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({ fazenda_id: fazIdEff }),
                            });
                            const json = await res.json();
                            if (!res.ok) throw new Error(json.error ?? "Erro desconhecido");
                            const { inseridos, ignorados } = json as { inseridos: number; ignorados: number };
                            alert(`CFOPs importados com sucesso!\n${inseridos} registros inseridos${ignorados > 0 ? `\n${ignorados} ignorados` : ""}.`);
                            // Recarregar
                            setLoadingHisFiscal(true);
                            const { data } = await supabase.from("operacao_cfop_fiscal").select("*, operacoes_gerenciais(classificacao, descricao, tipo)").eq("fazenda_id", fazIdEff!).eq("ativo", true).order("cfop");
                            setLoadingHisFiscal(false);
                            setHisFiscal((data ?? []).map((r: Record<string, unknown>) => { const op = (r.operacoes_gerenciais as Record<string, string> | null) ?? {}; return { id: String(r.id), cfop: String(r.cfop ?? ""), descricao_cfop: r.descricao_cfop as string | null, operacao_nf: r.operacao_nf as string | null, tipo_pessoa: r.tipo_pessoa as string | null, cst_pis: r.cst_pis as string | null, cst_cofins: r.cst_cofins as string | null, ncm: r.ncm as string | null, fins_exportacao: Boolean(r.fins_exportacao), compoe_faturamento: Boolean(r.compoe_faturamento), op_classificacao: op.classificacao ?? "—", op_descricao: op.descricao ?? "—", op_tipo: op.tipo ?? "" }; }));
                          } catch (e: unknown) {
                            alert("Erro: " + (e instanceof Error ? e.message : JSON.stringify(e)));
                          } finally {
                            setSeedingCfop(false);
                          }
                        }}
                        style={{ fontSize: 12, padding: "7px 14px", border: "0.5px solid #C9921B", borderRadius: 8, background: "#FBF3E0", color: "#7A5A10", cursor: seedingCfop ? "not-allowed" : "pointer", fontWeight: 600, opacity: seedingCfop ? 0.6 : 1 }}
                      >{seedingCfop ? "Importando…" : "↓ Importar CFOPs Padrão"}</button>
                      <button
                        onClick={() => { setLoadingHisFiscal(true); supabase.from("operacao_cfop_fiscal").select("*, operacoes_gerenciais(classificacao, descricao, tipo)").eq("fazenda_id", fazIdEff!).eq("ativo", true).order("cfop").then(({ data }) => { setLoadingHisFiscal(false); setHisFiscal((data ?? []).map((r: Record<string, unknown>) => { const op = (r.operacoes_gerenciais as Record<string, string> | null) ?? {}; return { id: String(r.id), cfop: String(r.cfop ?? ""), descricao_cfop: r.descricao_cfop as string | null, operacao_nf: r.operacao_nf as string | null, tipo_pessoa: r.tipo_pessoa as string | null, cst_pis: r.cst_pis as string | null, cst_cofins: r.cst_cofins as string | null, ncm: r.ncm as string | null, fins_exportacao: Boolean(r.fins_exportacao), compoe_faturamento: Boolean(r.compoe_faturamento), op_classificacao: op.classificacao ?? "—", op_descricao: op.descricao ?? "—", op_tipo: op.tipo ?? "" }; })); }); }}
                        style={{ fontSize: 12, padding: "7px 14px", border: "0.5px solid #DDE2EE", borderRadius: 8, background: "#F4F6FA", color: "#555", cursor: "pointer" }}
                      >↺ Atualizar</button>
                    </div>
                  </div>
                  {/* Filtros */}
                  <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
                    <input
                      value={hfBusca} onChange={e => setHfBusca(e.target.value)}
                      placeholder="Buscar operação, CFOP ou descrição…"
                      style={{ flex: "1 1 220px", minWidth: 180, padding: "7px 10px", border: "0.5px solid #D4DCE8", borderRadius: 8, fontSize: 13 }}
                    />
                    <input
                      value={hfFiltroCfop} onChange={e => setHfFiltroCfop(e.target.value)}
                      placeholder="Filtra por CFOP ex: 5101"
                      style={{ width: 130, padding: "7px 10px", border: "0.5px solid #D4DCE8", borderRadius: 8, fontSize: 13 }}
                    />
                    <select value={hfFiltroTipo} onChange={e => setHfFiltroTipo(e.target.value as ""| "receita"|"despesa")}
                      style={{ padding: "7px 10px", border: "0.5px solid #D4DCE8", borderRadius: 8, fontSize: 13 }}>
                      <option value="">Receita + Despesa</option>
                      <option value="receita">Receitas</option>
                      <option value="despesa">Despesas</option>
                    </select>
                    <select value={hfFiltroNf} onChange={e => setHfFiltroNf(e.target.value)}
                      style={{ padding: "7px 10px", border: "0.5px solid #D4DCE8", borderRadius: 8, fontSize: 13, maxWidth: 220 }}>
                      <option value="">Todas as operações NF</option>
                      {opNfOptions.map(o => <option key={o} value={o}>{o}</option>)}
                    </select>
                    {(hfBusca || hfFiltroCfop || hfFiltroTipo || hfFiltroNf) && (
                      <button onClick={() => { setHfBusca(""); setHfFiltroCfop(""); setHfFiltroTipo(""); setHfFiltroNf(""); }}
                        style={{ padding: "7px 12px", border: "0.5px solid #E24B4A", borderRadius: 8, background: "#FFF0F0", color: "#E24B4A", fontSize: 12, cursor: "pointer" }}>
                        ✕ Limpar filtros
                      </button>
                    )}
                  </div>
                </div>

                {/* Corpo */}
                <div style={{ padding: "12px 18px" }}>
                  {loadingHisFiscal && <div style={{ textAlign: "center", padding: 40, color: "#888" }}>Carregando…</div>}
                  {!loadingHisFiscal && hisFiscal.length === 0 && (
                    <div style={{ textAlign: "center", padding: 32, color: "#888", fontSize: 13 }}>
                      Nenhum CFOP vinculado. Clique em <strong>"↓ Importar CFOPs Padrão"</strong> acima para carregar os 352 registros padrão do sistema.
                    </div>
                  )}
                  {!loadingHisFiscal && hisFiscal.length > 0 && gruposArr.length === 0 && (
                    <div style={{ textAlign: "center", padding: 24, color: "#888", fontSize: 13 }}>Nenhum resultado para os filtros aplicados.</div>
                  )}
                  {gruposArr.map(g => (
                    <div key={g.classificacao} style={{ marginBottom: 20 }}>
                      {/* Cabeçalho do grupo */}
                      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6, padding: "6px 0" }}>
                        <span style={{ fontFamily: "monospace", fontSize: 11, color: "#888", minWidth: 90 }}>{g.classificacao}</span>
                        <span style={{ fontWeight: 600, fontSize: 13, color: "#1a1a1a" }}>{g.descricao}</span>
                        {badge(g.tipo === "receita" ? "Receita" : "Despesa",
                          g.tipo === "receita" ? "#EBF5EB" : "#FCEBEB",
                          g.tipo === "receita" ? "#1A5C1A" : "#791F1F")}
                        <span style={{ fontSize: 11, color: "#888" }}>{g.rows.length} CFOP{g.rows.length !== 1 ? "s" : ""}</span>
                      </div>
                      {/* Tabela de CFOPs */}
                      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, background: "#F8FAFD", borderRadius: 8, overflow: "hidden" }}>
                        <thead>
                          <tr style={{ background: "#EEF3FA" }}>
                            {["CFOP","Descrição do CFOP","Operação NF","CST PIS","CST COFINS","NCM","Fins Exp.","Comp. Fat."].map(h => (
                              <th key={h} style={{ padding: "6px 10px", textAlign: "left", fontWeight: 600, color: "#555", fontSize: 11, whiteSpace: "nowrap" }}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {g.rows.sort((a, b) => a.cfop.localeCompare(b.cfop)).map((r, i) => (
                            <tr key={r.id} style={{ borderTop: i > 0 ? "0.5px solid #DDE5EF" : "none", background: i % 2 === 0 ? "#F8FAFD" : "#fff" }}>
                              <td style={{ padding: "6px 10px", fontFamily: "monospace", fontWeight: 700, color: "#1A4870" }}>{r.cfop}</td>
                              <td style={{ padding: "6px 10px", color: "#333", maxWidth: 260, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.descricao_cfop ?? "—"}</td>
                              <td style={{ padding: "6px 10px", color: "#555", whiteSpace: "nowrap" }}>{r.operacao_nf ?? "—"}</td>
                              <td style={{ padding: "6px 10px", textAlign: "center" }}>
                                {r.cst_pis ? <span style={{ fontFamily: "monospace", background: "#D5E8F5", color: "#0B2D50", padding: "2px 6px", borderRadius: 4 }}>{r.cst_pis}</span> : <span style={{ color: "#ccc" }}>—</span>}
                              </td>
                              <td style={{ padding: "6px 10px", textAlign: "center" }}>
                                {r.cst_cofins ? <span style={{ fontFamily: "monospace", background: "#D5E8F5", color: "#0B2D50", padding: "2px 6px", borderRadius: 4 }}>{r.cst_cofins}</span> : <span style={{ color: "#ccc" }}>—</span>}
                              </td>
                              <td style={{ padding: "6px 10px", fontFamily: "monospace", color: "#666" }}>{r.ncm ?? "—"}</td>
                              <td style={{ padding: "6px 10px", textAlign: "center" }}>
                                {r.fins_exportacao
                                  ? <span style={{ fontSize: 10, background: "#FBF3E0", color: "#7A5A10", padding: "2px 6px", borderRadius: 4 }}>Sim</span>
                                  : <span style={{ color: "#ccc", fontSize: 11 }}>—</span>}
                              </td>
                              <td style={{ padding: "6px 10px", textAlign: "center" }}>
                                {r.compoe_faturamento
                                  ? <span style={{ fontSize: 10, background: "#EBF5EB", color: "#1A5C1A", padding: "2px 6px", borderRadius: 4 }}>Sim</span>
                                  : <span style={{ fontSize: 10, background: "#F3F3F3", color: "#888", padding: "2px 6px", borderRadius: 4 }}>Não</span>}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ))}
                </div>
              </div>
            );
          })()}

          {/* ══ FORMAS DE PAGAMENTO ══ */}
          {aba === "formas_pagamento" && (
            <div style={{ background: "#fff", border: "0.5px solid #D4DCE8", borderRadius: 12, overflow: "hidden" }}>
              <div style={{ padding: "14px 18px", borderBottom: "0.5px solid #DEE5EE", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <div style={{ color: "#1a1a1a", fontWeight: 600, fontSize: 14 }}>Formas de Pagamento</div>
                  <div style={{ fontSize: 11, color: "#555", marginTop: 2 }}>Condições de pagamento usadas em Pedidos de Compra, Contratos e lançamentos financeiros</div>
                </div>
                <button style={btnV} onClick={() => { setEditFP(null); setFFP({ nome: "", parcelas: "", dias: "", descricao: "" }); setModalFP(true); }}>+ Nova Forma</button>
              </div>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <TH cols={["Nome", "Parcelas", "Intervalo (dias)", "Descrição", ""]} />
                <tbody>
                  {formasPagamento.length === 0 && <tr><td colSpan={5} style={{ padding: 32, textAlign: "center", color: "#444" }}>Nenhuma forma de pagamento cadastrada</td></tr>}
                  {formasPagamento.map((fp, i) => (
                    <tr key={fp.id} style={{ borderBottom: i < formasPagamento.length - 1 ? "0.5px solid #DEE5EE" : "none" }}>
                      <td style={{ padding: "10px 14px", color: "#1a1a1a", fontWeight: 600 }}>{fp.nome}</td>
                      <td style={{ padding: "10px 14px", textAlign: "center" }}>
                        {fp.parcelas ? badge(String(fp.parcelas) + "x", "#D5E8F5", "#0B2D50") : <span style={{ color: "#888", fontSize: 12 }}>—</span>}
                      </td>
                      <td style={{ padding: "10px 14px", fontSize: 12, color: "#1a1a1a" }}>{fp.dias || "—"}</td>
                      <td style={{ padding: "10px 14px", fontSize: 12, color: "#555" }}>{fp.descricao || "—"}</td>
                      <td style={{ padding: "10px 14px", textAlign: "right" }}>
                        <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                          <button style={btnE} onClick={() => { setEditFP(fp); setFFP({ nome: fp.nome, parcelas: String(fp.parcelas ?? ""), dias: fp.dias ?? "", descricao: fp.descricao ?? "" }); setModalFP(true); }}>Editar</button>
                          <button style={btnX} onClick={() => { if (confirm("Excluir?")) excluirFormaPagamento(fp.id).then(() => setFormasPagamento(x => x.filter(r => r.id !== fp.id))); }}>✕</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* ══ INSUMOS ══ */}
          {aba === "insumos" && (() => {
            const CATS: { key: Insumo["categoria"]; label: string; bg: string; cl: string }[] = [
              { key: "semente",        label: "Semente",        bg: "#D5E8F5", cl: "#0B2D50" },
              { key: "fertilizante",   label: "Fertilizante",   bg: "#E6F1FB", cl: "#0C447C" },
              { key: "defensivo",      label: "Defensivo",      bg: "#FAEEDA", cl: "#633806" },
              { key: "corretivo",      label: "Corretivo",      bg: "#E8F5EB", cl: "#1A5C35" },
              { key: "micronutriente", label: "Micronutriente", bg: "#EDE9FB", cl: "#4B3B9B" },
              { key: "biologico",      label: "Biológico",      bg: "#F0F9F2", cl: "#167A3C" },
              { key: "inoculante",     label: "Inoculante",     bg: "#FBF3E0", cl: "#8B5E14" },
            ];
            const catMap = Object.fromEntries(CATS.map(c => [c.key, c]));

            const CATS_INSUMO_KEYS = CATS.map(c => c.key);
            const insBase = insumos.filter(i => CATS_INSUMO_KEYS.includes(i.categoria));
            const insFiltr = insBase.filter(i => {
              const matchCat  = filtroIns === "todos" || i.categoria === filtroIns;
              const matchBusca = !buscaIns || i.nome.toLowerCase().includes(buscaIns.toLowerCase()) || (i.fabricante ?? "").toLowerCase().includes(buscaIns.toLowerCase());
              return matchCat && matchBusca;
            });

            const totalValor = insFiltr.reduce((s, i) => s + (i.estoque * i.valor_unitario), 0);
            const abaixoMin  = insBase.filter(i => i.estoque < i.estoque_minimo).length;

            const abrirModalIns = (ins?: Insumo) => {
              setEditIns(ins ?? null);
              setFIns(ins ? {
                nome: ins.nome, categoria: ins.categoria, subgrupo: ins.subgrupo ?? "",
                unidade: ins.unidade, fabricante: ins.fabricante ?? "",
                estoque: String(ins.estoque), estoque_minimo: String(ins.estoque_minimo),
                valor_unitario: String(ins.valor_unitario), lote: ins.lote ?? "", validade: ins.validade ?? "",
                deposito_id: ins.deposito_id ?? "", bomba_id: ins.bomba_id ?? "",
                principio_ativo_id: ins.principio_ativo_id ?? "",
              } : { nome: "", categoria: "defensivo", subgrupo: "", unidade: "L", fabricante: "", estoque: "0", estoque_minimo: "0", valor_unitario: "0", lote: "", validade: "", deposito_id: "", bomba_id: "", principio_ativo_id: "" });
              setModalIns(true);
            };

            const salvarIns = async () => {
              const isPA = ["defensivo","fertilizante","inoculante","biologico","micronutriente"].includes(fIns.categoria);
              if (isPA && !fIns.principio_ativo_id) {
                setErro("Selecione o princípio ativo antes de salvar."); return;
              }
              if (!isPA && !fIns.nome.trim()) {
                setErro("Informe o nome do insumo."); return;
              }
              setSalvando(true);
              setErro("");
              try {
                const isComb = fIns.categoria === "combustivel";
                const payload: Omit<Insumo, "id" | "created_at"> = {
                  fazenda_id:          fazIdEff!,
                  nome:                fIns.nome.trim(),
                  categoria:           fIns.categoria,
                  subgrupo:            fIns.subgrupo || undefined,
                  unidade:             isComb ? "L" : fIns.unidade,
                  fabricante:          isComb ? undefined : (fIns.fabricante || undefined),
                  estoque:             parseFloat(fIns.estoque) || 0,
                  estoque_minimo:      parseFloat(fIns.estoque_minimo) || 0,
                  valor_unitario:      parseFloat(fIns.valor_unitario) || 0,
                  lote:                isComb ? undefined : (fIns.lote || undefined),
                  validade:            isComb ? undefined : (fIns.validade || undefined),
                  deposito_id:         isComb ? undefined : (fIns.deposito_id || undefined),
                  bomba_id:            isComb ? (fIns.bomba_id || undefined) : undefined,
                  principio_ativo_id:  (!isComb && fIns.principio_ativo_id) ? fIns.principio_ativo_id : undefined,
                  tipo:                (["produto_agricola","peca","material","uso_consumo","escritorio","combustivel"] as string[]).includes(fIns.categoria) ? "produto" as const : "insumo" as const,
                };
                if (editIns) {
                  await atualizarInsumo(editIns.id, payload);
                  setInsumos(x => x.map(r => r.id === editIns.id ? { ...r, ...payload } : r));
                } else {
                  const n = await criarInsumo(payload);
                  setInsumos(x => [...x, n].sort((a, b) => a.nome.localeCompare(b.nome)));
                }
                setModalIns(false);
              } catch (e: unknown) { setErro((e as {message?:string})?.message || JSON.stringify(e)); }
              finally { setSalvando(false); }
            };

            // Subgrupos filtrados pela categoria selecionada no form (via gruposInsumo)
            const gruposDaCategoria = gruposInsumo; // pode filtrar por nome se quiser
            const subgruposDoCadastro = subgruposInsumo;

            return (
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>

                {/* Stats */}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
                  {[
                    { label: "Total de insumos",    valor: insBase.length.toString(),        cor: "#1a1a1a" },
                    { label: "Abaixo do mínimo",    valor: abaixoMin.toString(),             cor: abaixoMin > 0 ? "#E24B4A" : "#444" },
                    { label: "Valor em estoque",    valor: totalValor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }), cor: "#1A4870" },
                    { label: "Itens no filtro",     valor: insFiltr.length.toString(),       cor: "#378ADD" },
                  ].map((s, i) => (
                    <div key={i} style={{ background: "#fff", border: "0.5px solid #D4DCE8", borderRadius: 10, padding: "12px 16px" }}>
                      <div style={{ fontSize: 11, color: "#444", marginBottom: 4 }}>{s.label}</div>
                      <div style={{ fontSize: 18, fontWeight: 700, color: s.cor }}>{s.valor}</div>
                    </div>
                  ))}
                </div>

                {/* Toolbar */}
                <div style={{ background: "#fff", border: "0.5px solid #D4DCE8", borderRadius: 12, padding: "12px 16px", display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                  <input
                    style={{ ...inp, width: 220, flex: "0 0 220px" }}
                    placeholder="Buscar por nome ou fabricante…"
                    value={buscaIns}
                    onChange={e => setBuscaIns(e.target.value)}
                  />
                  <div style={{ display: "flex", gap: 6, flex: 1, flexWrap: "wrap" }}>
                    <button onClick={() => setFiltroIns("todos")} style={{ padding: "5px 12px", borderRadius: 20, border: "0.5px solid", borderColor: filtroIns === "todos" ? "#1A4870" : "#D4DCE8", background: filtroIns === "todos" ? "#D5E8F5" : "transparent", color: filtroIns === "todos" ? "#0B2D50" : "#666", fontSize: 12, cursor: "pointer", fontWeight: filtroIns === "todos" ? 600 : 400 }}>
                      Todos ({insBase.length})
                    </button>
                    {CATS.map(c => {
                      const qtd = insBase.filter(i => i.categoria === c.key).length;
                      if (qtd === 0) return null;
                      return (
                        <button key={c.key} onClick={() => setFiltroIns(c.key)} style={{ padding: "5px 12px", borderRadius: 20, border: "0.5px solid", borderColor: filtroIns === c.key ? c.cl : "#D4DCE8", background: filtroIns === c.key ? c.bg : "transparent", color: filtroIns === c.key ? c.cl : "#666", fontSize: 12, cursor: "pointer", fontWeight: filtroIns === c.key ? 600 : 400 }}>
                          {c.label} ({qtd})
                        </button>
                      );
                    })}
                  </div>
                  <button style={btnV} onClick={() => { setFIns(p => ({ ...p, categoria: "defensivo" as Insumo["categoria"] })); abrirModalIns(); }}>+ Novo Insumo</button>
                </div>

                {/* Tabela */}
                <div style={{ background: "#fff", border: "0.5px solid #D4DCE8", borderRadius: 12, overflow: "hidden" }}>
                  {insFiltr.length === 0 ? (
                    <div style={{ padding: 40, textAlign: "center", color: "#444", fontSize: 13 }}>
                      {buscaIns ? `Nenhum insumo encontrado para "${buscaIns}"` : "Nenhum insumo cadastrado. Use '+ Novo Insumo' para cadastrar sementes, fertilizantes, defensivos, corretivos, micronutrientes ou biológicos."}
                    </div>
                  ) : (
                    <table style={{ width: "100%", borderCollapse: "collapse" }}>
                      <TH cols={["Nome / Fabricante", "Categoria", "Subgrupo", "Unid.", "Estoque", "Mín.", "Valor Unit.", "Total", "Validade", ""]} />
                      <tbody>
                        {insFiltr.map((ins, i) => {
                          const cat = catMap[ins.categoria];
                          const abaixo = ins.estoque < ins.estoque_minimo;
                          const total  = ins.estoque * ins.valor_unitario;
                          return (
                            <tr key={ins.id} style={{ borderBottom: i < insFiltr.length - 1 ? "0.5px solid #DEE5EE" : "none", background: abaixo ? "#FFFAF5" : "transparent" }}>
                              <td style={{ padding: "10px 14px" }}>
                                <div style={{ fontWeight: 600, fontSize: 13, color: "#1a1a1a" }}>{ins.nome}</div>
                                {ins.fabricante && <div style={{ fontSize: 11, color: "#555" }}>{ins.fabricante}</div>}
                                {ins.lote && <div style={{ fontSize: 10, color: "#444" }}>Lote: {ins.lote}</div>}
                              </td>
                              <td style={{ padding: "10px 14px", textAlign: "center" }}>
                                {cat && <span style={{ fontSize: 10, background: cat.bg, color: cat.cl, padding: "2px 8px", borderRadius: 8, fontWeight: 600 }}>{cat.label}</span>}
                              </td>
                              <td style={{ padding: "10px 14px", textAlign: "center", fontSize: 12, color: "#1a1a1a" }}>
                                {ins.subgrupo || "—"}
                              </td>
                              <td style={{ padding: "10px 14px", textAlign: "center", fontSize: 12, color: "#1a1a1a" }}>{ins.unidade}</td>
                              <td style={{ padding: "10px 14px", textAlign: "right", fontWeight: 600, color: abaixo ? "#E24B4A" : "#1a1a1a" }}>
                                {ins.estoque.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}
                                {abaixo && <span style={{ marginLeft: 5, fontSize: 9, background: "#FCEBEB", color: "#791F1F", padding: "1px 5px", borderRadius: 6 }}>⚠ baixo</span>}
                              </td>
                              <td style={{ padding: "10px 14px", textAlign: "right", fontSize: 12, color: "#1a1a1a" }}>
                                {ins.estoque_minimo.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}
                              </td>
                              <td style={{ padding: "10px 14px", textAlign: "right", fontSize: 12, color: "#1a1a1a" }}>
                                {ins.valor_unitario.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                              </td>
                              <td style={{ padding: "10px 14px", textAlign: "right", fontWeight: 700, color: "#1a1a1a", fontSize: 12 }}>
                                {total.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                              </td>
                              <td style={{ padding: "10px 14px", textAlign: "center", fontSize: 11, color: ins.validade && ins.validade < new Date().toISOString().split("T")[0] ? "#E24B4A" : "#555" }}>
                                {ins.validade ? new Date(ins.validade + "T12:00").toLocaleDateString("pt-BR") : "—"}
                              </td>
                              <td style={{ padding: "10px 14px", textAlign: "right" }}>
                                <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                                  <button style={btnE} onClick={() => abrirModalIns(ins)}>Editar</button>
                                  <button style={btnX} onClick={() => { if (confirm(`Excluir "${ins.nome}"?`)) excluirInsumo(ins.id).then(() => setInsumos(x => x.filter(r => r.id !== ins.id))); }}>✕</button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                      <tfoot>
                        <tr style={{ background: "#F3F6F9" }}>
                          <td colSpan={7} style={{ padding: "8px 14px", fontSize: 11, color: "#555" }}>{insFiltr.length} itens</td>
                          <td style={{ padding: "8px 14px", textAlign: "right", fontWeight: 700, color: "#1A4870" }}>
                            {totalValor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                          </td>
                          <td colSpan={2} />
                        </tr>
                      </tfoot>
                    </table>
                  )}
                </div>

                {/* Modal Insumo */}
                {modalIns && (() => {
                  const isComb = fIns.categoria === "combustivel";
                  return (
                  <Modal titulo={editIns ? `Editar: ${editIns.nome}` : "Novo Insumo"} onClose={() => setModalIns(false)} width={720}>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                      {/* Categoria sempre primeiro */}
                      <div>
                        <label style={lbl}>Categoria *</label>
                        <select style={inp} value={fIns.categoria} onChange={e => {
                          const cat = e.target.value as Insumo["categoria"];
                          setFIns(p => ({ ...p, categoria: cat, subgrupo: "", unidade: cat === "semente" ? "kg" : p.unidade, principio_ativo_id: "", nome: "" }));
                        }}>
                          <option value="corretivo">Corretivo de Solo</option>
                          <option value="fertilizante">Fertilizante</option>
                          <option value="semente">Semente</option>
                          <option value="defensivo">Defensivo</option>
                        </select>
                      </div>
                      {/* Subgrupo */}
                      <div>
                        <label style={lbl}>Subgrupo</label>
                        {subgruposDoCadastro.length > 0 ? (
                          <select style={inp} value={fIns.subgrupo} onChange={e => setFIns(p => ({ ...p, subgrupo: e.target.value }))}>
                            <option value="">— Selecione —</option>
                            {subgruposDoCadastro.map(s => {
                              const g = gruposDaCategoria.find(x => x.id === s.grupo_id);
                              return <option key={s.id} value={s.nome}>{g ? `${g.nome} › ` : ""}{s.nome}</option>;
                            })}
                          </select>
                        ) : (
                          <input style={inp} placeholder={isComb ? "Ex: Diesel, Gasolina" : "Ex: Herbicida"} value={fIns.subgrupo} onChange={e => setFIns(p => ({ ...p, subgrupo: e.target.value }))} />
                        )}
                      </div>

                      {/* ── Defensivos / Fertilizantes: PA é o nome canônico ── */}
                      {["defensivo","fertilizante"].includes(fIns.categoria) ? (
                        <>
                          {/* Seletor de PA — o nome do insumo deriva daqui */}
                          <div style={{ gridColumn: "1/-1" }}>
                            <label style={lbl}>
                              Princípio Ativo *
                              <span style={{ fontWeight: 400, color: "#888", marginLeft: 4 }}>
                                — o estoque é registrado pelo ingrediente ativo, não pela marca
                              </span>
                            </label>
                            {principios.length === 0 ? (
                              <div style={{ padding: "10px 12px", background: "#FBF3E0", borderRadius: 8, fontSize: 12, color: "#7A5A12", border: "0.5px solid #F0D9A0" }}>
                                Nenhum princípio ativo cadastrado. Acesse <strong>Cadastros → Princípios Ativos (BOT)</strong> para criar antes de cadastrar este insumo.
                              </div>
                            ) : (
                              <select style={inp} value={fIns.principio_ativo_id} onChange={e => {
                                const paId = e.target.value;
                                const pa = principios.find(p => p.id === paId);
                                setFIns(prev => ({ ...prev, principio_ativo_id: paId, nome: pa?.nome ?? "", unidade: pa?.unidade ?? prev.unidade }));
                              }}>
                                <option value="">— Selecione o princípio ativo —</option>
                                {principios
                                  .filter(pa => {
                                    if (fIns.categoria === "defensivo") return ["herbicida","fungicida","inseticida","acaricida"].includes(pa.categoria);
                                    if (fIns.categoria === "biologico" || fIns.categoria === "inoculante") return pa.categoria === "inoculante" || pa.categoria === "outro";
                                    if (fIns.categoria === "micronutriente") return pa.categoria === "fertilizante" || pa.categoria === "outro";
                                    return pa.categoria === fIns.categoria;
                                  })
                                  .map(pa => <option key={pa.id} value={pa.id}>{pa.nome}</option>)}
                              </select>
                            )}
                          </div>
                          {/* Nome: leitura — preenchido pelo PA */}
                          <div style={{ gridColumn: "1/-1" }}>
                            <label style={lbl}>Nome no estoque <span style={{ fontWeight: 400, color: "#888" }}>(preenchido automaticamente pelo PA)</span></label>
                            <input
                              style={{ ...inp, background: "#F4F6FA", color: fIns.nome ? "#1a1a1a" : "#aaa" }}
                              value={fIns.nome || "Selecione o princípio ativo acima"}
                              readOnly
                            />
                          </div>
                          {/* Fabricante: opcional, só para referência */}
                          <div style={{ gridColumn: "1/-1" }}>
                            <label style={lbl}>Fabricante / Marca habitual <span style={{ fontWeight: 400, color: "#888" }}>(opcional — apenas para referência)</span></label>
                            <input style={inp} placeholder="Ex: Bayer, Syngenta — não afeta o estoque" value={fIns.fabricante} onChange={e => setFIns(p => ({ ...p, fabricante: e.target.value }))} />
                          </div>
                        </>
                      ) : (
                        /* ── Semente / Combustível / Outros: nome livre ── */
                        <>
                          <div style={{ gridColumn: "1/-1" }}>
                            <label style={lbl}>Nome *</label>
                            <input style={inp}
                              placeholder={isComb ? "Ex: Diesel S10, Gasolina" : fIns.categoria === "semente" ? "Ex: Soja TMG 3770 IPRO" : "Ex: Calcário Dolomítico"}
                              value={fIns.nome}
                              onChange={e => setFIns(p => ({ ...p, nome: e.target.value }))} />
                          </div>
                          {!isComb && (
                            <div>
                              <label style={lbl}>Fabricante / Marca</label>
                              <input style={inp} placeholder="Ex: Bayer, Syngenta" value={fIns.fabricante} onChange={e => setFIns(p => ({ ...p, fabricante: e.target.value }))} />
                            </div>
                          )}
                        </>
                      )}
                      {/* Unidade */}
                      <div>
                        <label style={lbl}>Unidade *</label>
                        {isComb || fIns.categoria === "semente" ? (
                          <div>
                            <input style={{ ...inp, background: "#F4F6FA", color: "#555" }}
                              value={isComb ? "L (litros)" : "kg (quilogramas)"}
                              readOnly />
                            {fIns.categoria === "semente" && (
                              <div style={{ fontSize: 10, color: "#1A4870", marginTop: 3 }}>
                                Sementes são controladas em <strong>kg</strong>. Entradas em "bag" são convertidas automaticamente.
                              </div>
                            )}
                          </div>
                        ) : (
                          <select style={inp} value={fIns.unidade} onChange={e => setFIns(p => ({ ...p, unidade: e.target.value as Insumo["unidade"] }))}>
                            <option value="kg">kg</option>
                            <option value="g">g (gramas)</option>
                            <option value="L">L (litros)</option>
                            <option value="mL">mL (mililitros)</option>
                            <option value="sc">sc (sacas 60kg)</option>
                            <option value="t">t (tonelada)</option>
                            <option value="un">un (unidade)</option>
                            <option value="m">m (metro)</option>
                            <option value="m2">m² (metro quadrado)</option>
                            <option value="cx">cx (caixa)</option>
                            <option value="pc">pc (peça)</option>
                            <option value="par">par</option>
                            <option value="outros">outros</option>
                          </select>
                        )}
                      </div>
                      {/* Bomba (combustível) ou Depósito (outros) */}
                      {isComb ? (
                        <div>
                          <label style={lbl}>Bomba associada</label>
                          <select style={inp} value={fIns.bomba_id} onChange={e => setFIns(p => ({ ...p, bomba_id: e.target.value }))}>
                            <option value="">— Selecione a bomba —</option>
                            {bombas.map(b => (
                              <option key={b.id} value={b.id}>{b.nome} {b.consume_estoque ? "🏠 Fazenda" : "⛽ Posto"}</option>
                            ))}
                          </select>
                        </div>
                      ) : (
                        <div>
                          <label style={lbl}>Depósito padrão</label>
                          <select style={inp} value={fIns.deposito_id} onChange={e => setFIns(p => ({ ...p, deposito_id: e.target.value }))}>
                            <option value="">— Selecione —</option>
                            {depositos.filter(d => d.ativo).map(d => (
                              <option key={d.id} value={d.id}>{d.nome}</option>
                            ))}
                          </select>
                        </div>
                      )}
                      {/* Estoque atual — bloqueado em edição */}
                      <div>
                        <label style={lbl}>Estoque atual ({isComb ? "L" : fIns.unidade})</label>
                        {editIns ? (
                          <div style={{ padding: "8px 10px", background: "#F8FAFB", borderRadius: 7, border: "0.5px solid #DDE2EE", fontSize: 13, color: "#888", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                            <span>{fIns.estoque} {isComb ? "L" : fIns.unidade}</span>
                            <span style={{ fontSize: 11, color: "#C9921B" }}>Altere via Ajuste de Estoque</span>
                          </div>
                        ) : (
                          <InputMonetario style={inp} min="0" value={fIns.estoque} onChange={v => setFIns(p => ({ ...p, estoque: String(v) }))} />
                        )}
                      </div>
                      {/* Estoque mínimo */}
                      <div>
                        <label style={lbl}>Estoque mínimo (alerta)</label>
                        <InputMonetario style={inp} min="0" value={fIns.estoque_minimo} onChange={v => setFIns(p => ({ ...p, estoque_minimo: String(v) }))} />
                      </div>
                      {/* Valor unitário */}
                      <div>
                        <label style={lbl}>Valor unitário (R$/{isComb ? "L" : fIns.unidade})</label>
                        <InputMonetario style={inp} min="0" value={fIns.valor_unitario} onChange={v => setFIns(p => ({ ...p, valor_unitario: String(v) }))} />
                      </div>
                      {/* Lote e Validade — apenas para não-combustível */}
                      {!isComb && (
                        <>
                          <div>
                            <label style={lbl}>Lote</label>
                            <input style={inp} placeholder="Opcional" value={fIns.lote} onChange={e => setFIns(p => ({ ...p, lote: e.target.value }))} />
                          </div>
                          <div>
                            <label style={lbl}>Validade</label>
                            <input style={inp} type="date" value={fIns.validade} onChange={e => setFIns(p => ({ ...p, validade: e.target.value }))} />
                          </div>
                        </>
                      )}
                    </div>

                    {/* Preview valor total */}
                    {parseFloat(fIns.estoque) > 0 && parseFloat(fIns.valor_unitario) > 0 && (
                      <div style={{ marginTop: 14, background: "#D5E8F5", borderRadius: 8, padding: "8px 12px", fontSize: 12, color: "#0B2D50" }}>
                        Valor em estoque: <strong>{(parseFloat(fIns.estoque) * parseFloat(fIns.valor_unitario)).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</strong>
                      </div>
                    )}

                    <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 20 }}>
                      <button style={btnR} onClick={() => setModalIns(false)}>Cancelar</button>
                      <button style={{ ...btnV, opacity: salvando || (["defensivo","fertilizante","inoculante","biologico","micronutriente"].includes(fIns.categoria) ? !fIns.principio_ativo_id : !fIns.nome.trim()) ? 0.5 : 1 }} disabled={salvando || (["defensivo","fertilizante","inoculante","biologico","micronutriente"].includes(fIns.categoria) ? !fIns.principio_ativo_id : !fIns.nome.trim())} onClick={salvarIns}>
                        {salvando ? "Salvando…" : "Salvar"}
                      </button>
                    </div>
                  </Modal>
                  );
                })()}
              </div>
            );
          })()}

          {/* ══ PRODUTOS AGRÍCOLAS ══ */}
          {aba === "produtos" && (() => {
            const CULTURAS = [
              { key: "soja",          label: "Soja",          bg: "#D5E8F5", cl: "#0B2D50" },
              { key: "milho",         label: "Milho",         bg: "#FEF3C7", cl: "#78350F" },
              { key: "algodao",       label: "Algodão",       bg: "#F1F0FB", cl: "#4B3B9B" },
              { key: "milho_pipoca",  label: "Milho Pipoca",  bg: "#FEF9C3", cl: "#713F12" },
              { key: "trigo",         label: "Trigo",         bg: "#FEF3E2", cl: "#7A4300" },
              { key: "sorgo",         label: "Sorgo",         bg: "#FDE8D8", cl: "#7C3D12" },
              { key: "milheto",       label: "Milheto",       bg: "#DCFCE7", cl: "#14532D" },
              { key: "gergelim",      label: "Gergelim",      bg: "#FFF7ED", cl: "#7C2D12" },
              { key: "girassol",      label: "Girassol",      bg: "#FEFCE8", cl: "#713F12" },
              { key: "brachiaria",    label: "Brachiaria",    bg: "#ECFDF5", cl: "#065F46" },
              { key: "eucalipto",     label: "Eucalipto",     bg: "#E8F5EB", cl: "#1A5C35" },
              { key: "outros",        label: "Outros",        bg: "#F1EFE8", cl: "#555"    },
            ];
            const cultMap = Object.fromEntries(CULTURAS.map(c => [c.key, c]));

            const prodBase = insumos.filter(i => i.categoria === "produto_agricola");

            const prodFiltr = prodBase.filter(i => {
              const matchCult  = filtroCult === "todos" || i.subgrupo === filtroCult;
              const matchBusca = !buscaProd || i.nome.toLowerCase().includes(buscaProd.toLowerCase());
              return matchCult && matchBusca;
            });

            const totalValorProd = prodFiltr.reduce((s, i) => s + (i.estoque * i.valor_unitario), 0);

            const abrirModalProd = (ins?: Insumo) => {
              setEditIns(ins ?? null);
              setFIns(ins ? {
                nome: ins.nome, categoria: "produto_agricola",
                subgrupo: ins.subgrupo ?? "", unidade: ins.unidade,
                fabricante: ins.fabricante ?? "",
                estoque: String(ins.estoque), estoque_minimo: String(ins.estoque_minimo),
                valor_unitario: String(ins.valor_unitario), lote: ins.lote ?? "", validade: ins.validade ?? "",
                deposito_id: ins.deposito_id ?? "", bomba_id: "", principio_ativo_id: "",
              } : { nome: "", categoria: "produto_agricola" as Insumo["categoria"], subgrupo: "soja", unidade: "sc", fabricante: "", estoque: "0", estoque_minimo: "0", valor_unitario: "0", lote: "", validade: "", deposito_id: "", bomba_id: "", principio_ativo_id: "" });
              setModalIns(true);
            };

            const salvarProd = async () => {
              if (!fIns.nome.trim()) { setErro("Informe o nome do produto."); return; }
              setSalvando(true); setErro("");
              try {
                const payload: Omit<Insumo, "id" | "created_at"> = {
                  fazenda_id: fazIdEff!, nome: fIns.nome.trim(),
                  categoria: "produto_agricola", subgrupo: fIns.subgrupo || undefined,
                  unidade: fIns.unidade, fabricante: fIns.fabricante || undefined,
                  estoque: parseFloat(fIns.estoque) || 0,
                  estoque_minimo: parseFloat(fIns.estoque_minimo) || 0,
                  valor_unitario: parseFloat(fIns.valor_unitario) || 0,
                  lote: fIns.lote || undefined, validade: fIns.validade || undefined,
                  deposito_id: fIns.deposito_id || undefined, tipo: "produto",
                };
                if (editIns) {
                  await atualizarInsumo(editIns.id, payload);
                  setInsumos(x => x.map(r => r.id === editIns.id ? { ...r, ...payload } : r));
                } else {
                  const n = await criarInsumo(payload);
                  setInsumos(x => [...x, n].sort((a, b) => a.nome.localeCompare(b.nome)));
                }
                setModalIns(false);
              } catch (e: unknown) { setErro((e as {message?:string})?.message || JSON.stringify(e)); }
              finally { setSalvando(false); }
            };

            return (
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
                  {[
                    { label: "Culturas cadastradas", valor: prodBase.length.toString(),       cor: "#1a1a1a" },
                    { label: "Valor em estoque",     valor: totalValorProd.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }), cor: "#1A4870" },
                    { label: "Culturas distintas",   valor: [...new Set(prodBase.map(i => i.subgrupo ?? "outros"))].length.toString(), cor: "#16A34A" },
                    { label: "No filtro",            valor: prodFiltr.length.toString(),       cor: "#378ADD" },
                  ].map((s, i) => (
                    <div key={i} style={{ background: "#fff", border: "0.5px solid #D4DCE8", borderRadius: 10, padding: "12px 16px" }}>
                      <div style={{ fontSize: 11, color: "#444", marginBottom: 4 }}>{s.label}</div>
                      <div style={{ fontSize: 18, fontWeight: 700, color: s.cor }}>{s.valor}</div>
                    </div>
                  ))}
                </div>

                <div style={{ background: "#fff", border: "0.5px solid #D4DCE8", borderRadius: 12, padding: "12px 16px", display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                  <input style={{ ...inp, width: 220 }} placeholder="Buscar produto…" value={buscaProd} onChange={e => setBuscaProd(e.target.value)} />
                  <div style={{ display: "flex", gap: 6, flex: 1, flexWrap: "wrap" }}>
                    <button onClick={() => setFiltroCult("todos")} style={{ padding: "5px 12px", borderRadius: 20, border: "0.5px solid", borderColor: filtroCult === "todos" ? "#1A4870" : "#D4DCE8", background: filtroCult === "todos" ? "#D5E8F5" : "transparent", color: filtroCult === "todos" ? "#0B2D50" : "#666", fontSize: 12, cursor: "pointer", fontWeight: filtroCult === "todos" ? 600 : 400 }}>
                      Todos ({prodBase.length})
                    </button>
                    {CULTURAS.map(c => {
                      const qtd = prodBase.filter(i => (i.subgrupo ?? "outros") === c.key).length;
                      if (qtd === 0) return null;
                      return (
                        <button key={c.key} onClick={() => setFiltroCult(c.key)} style={{ padding: "5px 12px", borderRadius: 20, border: "0.5px solid", borderColor: filtroCult === c.key ? c.cl : "#D4DCE8", background: filtroCult === c.key ? c.bg : "transparent", color: filtroCult === c.key ? c.cl : "#666", fontSize: 12, cursor: "pointer", fontWeight: filtroCult === c.key ? 600 : 400 }}>
                          {c.label} ({qtd})
                        </button>
                      );
                    })}
                  </div>
                  <button
                    style={{ ...btnE, padding: "6px 12px", fontSize: 12, opacity: seedingProdutos ? 0.6 : 1 }}
                    disabled={seedingProdutos}
                    title="Insere os 11 produtos agrícolas padrão do sistema (soja, milho, algodão, etc.) que ainda não existem"
                    onClick={async () => {
                      if (!fazIdEff) return;
                      setSeedingProdutos(true);
                      try {
                        const n = await seederProdutosAgricolas(fazIdEff);
                        const lista = await listarInsumos(fazIdEff);
                        setInsumos(lista);
                        if (n === 0) alert("Todos os produtos padrão já estão cadastrados.");
                        else alert(`${n} produto${n > 1 ? "s" : ""} adicionado${n > 1 ? "s" : ""} com sucesso.`);
                      } catch (e: unknown) {
                        alert("Erro: " + ((e as {message?:string})?.message ?? String(e)));
                      } finally {
                        setSeedingProdutos(false);
                      }
                    }}
                  >
                    {seedingProdutos ? "Carregando…" : "↺ Carregar Padrões"}
                  </button>
                  <button style={btnV} onClick={() => abrirModalProd()}>+ Novo Produto</button>
                </div>

                <div style={{ background: "#fff", border: "0.5px solid #D4DCE8", borderRadius: 12, overflow: "hidden" }}>
                  {prodFiltr.length === 0 ? (
                    <div style={{ padding: 40, textAlign: "center", color: "#444", fontSize: 13 }}>
                      {buscaProd ? `Nenhum produto encontrado para "${buscaProd}"` : "Nenhum produto agrícola cadastrado. Clique em '↺ Carregar Padrões' ou use '+ Novo Produto'."}
                    </div>
                  ) : (
                    <table style={{ width: "100%", borderCollapse: "collapse" }}>
                      <TH cols={["Variedade / Nome", "Cultura", "Unid.", "Estoque", "Valor Unit.", "Total em Estoque", ""]} />
                      <tbody>
                        {prodFiltr.map((ins, i) => {
                          const cult = cultMap[ins.subgrupo ?? "outros"] ?? cultMap["outros"];
                          const total = ins.estoque * ins.valor_unitario;
                          return (
                            <tr key={ins.id} style={{ borderBottom: i < prodFiltr.length - 1 ? "0.5px solid #DEE5EE" : "none" }}>
                              <td style={{ padding: "10px 14px" }}>
                                <div style={{ fontWeight: 600, fontSize: 13, color: "#1a1a1a" }}>{ins.nome}</div>
                                {ins.fabricante && <div style={{ fontSize: 11, color: "#555" }}>{ins.fabricante}</div>}
                              </td>
                              <td style={{ padding: "10px 14px", textAlign: "center" }}>
                                {cult && <span style={{ fontSize: 10, background: cult.bg, color: cult.cl, padding: "2px 8px", borderRadius: 8, fontWeight: 600 }}>{cult.label}</span>}
                              </td>
                              <td style={{ padding: "10px 14px", textAlign: "center", fontSize: 12 }}>{ins.unidade}</td>
                              <td style={{ padding: "10px 14px", textAlign: "right", fontWeight: 600 }}>{ins.estoque.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}</td>
                              <td style={{ padding: "10px 14px", textAlign: "right", fontSize: 12 }}>{ins.valor_unitario.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</td>
                              <td style={{ padding: "10px 14px", textAlign: "right", fontWeight: 700, color: "#1A4870" }}>{total.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</td>
                              <td style={{ padding: "10px 14px", textAlign: "right" }}>
                                <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                                  <button style={btnE} onClick={() => abrirModalProd(ins)}>Editar</button>
                                  <button style={btnX} onClick={() => { if (confirm(`Excluir "${ins.nome}"?`)) excluirInsumo(ins.id).then(() => setInsumos(x => x.filter(r => r.id !== ins.id))); }}>✕</button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                      <tfoot>
                        <tr style={{ background: "#F3F6F9" }}>
                          <td colSpan={5} style={{ padding: "8px 14px", fontSize: 11, color: "#555" }}>{prodFiltr.length} produtos</td>
                          <td style={{ padding: "8px 14px", textAlign: "right", fontWeight: 700, color: "#1A4870" }}>
                            {totalValorProd.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                          </td>
                          <td />
                        </tr>
                      </tfoot>
                    </table>
                  )}
                </div>

                {modalIns && editIns?.categoria === "produto_agricola" || (modalIns && fIns.categoria === "produto_agricola") ? (
                  <Modal titulo={editIns ? `Editar: ${editIns.nome}` : "Novo Produto Agrícola"} onClose={() => setModalIns(false)} width={680}>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                      <div>
                        <label style={lbl}>Cultura *</label>
                        <select style={inp} value={fIns.subgrupo} onChange={e => setFIns(p => ({ ...p, subgrupo: e.target.value }))}>
                          {CULTURAS.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
                        </select>
                      </div>
                      <div>
                        <label style={lbl}>Unidade *</label>
                        <select style={inp} value={fIns.unidade} onChange={e => setFIns(p => ({ ...p, unidade: e.target.value as Insumo["unidade"] }))}>
                          <option value="sc">sc (sacas 60kg)</option>
                          <option value="@">@ (arrobas 15kg)</option>
                          <option value="kg">kg</option>
                          <option value="t">t (tonelada)</option>
                          <option value="m3">m³</option>
                        </select>
                      </div>
                      <div style={{ gridColumn: "1/-1" }}>
                        <label style={lbl}>Nome / Variedade *</label>
                        <input style={inp} placeholder="Ex: Soja TMG 7067 IPRO, Milho 30F90, Algodão FM 985 GLTP" value={fIns.nome} onChange={e => setFIns(p => ({ ...p, nome: e.target.value }))} />
                      </div>
                      <div>
                        <label style={lbl}>Empresa / Sementes</label>
                        <input style={inp} placeholder="Ex: TMG, Pioneer, Bayer" value={fIns.fabricante} onChange={e => setFIns(p => ({ ...p, fabricante: e.target.value }))} />
                      </div>
                      <div>
                        <label style={lbl}>Depósito / Armazém padrão</label>
                        <select style={inp} value={fIns.deposito_id} onChange={e => setFIns(p => ({ ...p, deposito_id: e.target.value }))}>
                          <option value="">— Selecione —</option>
                          {depositos.filter(d => d.ativo).map(d => <option key={d.id} value={d.id}>{d.nome}</option>)}
                        </select>
                      </div>
                      <div>
                        <label style={lbl}>Estoque atual</label>
                        <InputNumerico style={inp} decimais={3} value={fIns.estoque} onChange={v => setFIns(p => ({ ...p, estoque: v }))} />
                      </div>
                      <div>
                        <label style={lbl}>Valor unitário (R$/{fIns.unidade})</label>
                        <InputMonetario style={inp} value={fIns.valor_unitario} onChange={v => setFIns(p => ({ ...p, valor_unitario: String(v) }))} />
                      </div>
                      {parseFloat(fIns.estoque) > 0 && parseFloat(fIns.valor_unitario) > 0 && (
                        <div style={{ gridColumn: "1/-1", background: "#D5E8F5", borderRadius: 8, padding: "8px 12px", fontSize: 12, color: "#0B2D50" }}>
                          Valor em estoque: <strong>{(parseFloat(fIns.estoque) * parseFloat(fIns.valor_unitario)).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</strong>
                        </div>
                      )}
                      <div style={{ gridColumn: "1/-1", display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 4 }}>
                        <button style={btnR} onClick={() => setModalIns(false)}>Cancelar</button>
                        <button style={{ ...btnV, opacity: salvando || !fIns.nome.trim() ? 0.5 : 1 }} disabled={salvando || !fIns.nome.trim()} onClick={salvarProd}>
                          {salvando ? "Salvando…" : "Salvar"}
                        </button>
                      </div>
                    </div>
                  </Modal>
                ) : null}
              </div>
            );
          })()}

          {/* ══ ITENS GERAIS ══ */}
          {aba === "itens" && (() => {
            const CATS_IT: { key: Insumo["categoria"]; label: string; bg: string; cl: string }[] = [
              { key: "peca",        label: "Peça",          bg: "#EDE9FB", cl: "#4B3B9B" },
              { key: "material",    label: "Material",      bg: "#FEF3E2", cl: "#7A4300" },
              { key: "uso_consumo", label: "Uso/Consumo",   bg: "#FBF3E0", cl: "#8B5E14" },
              { key: "escritorio",  label: "Escritório",    bg: "#F0F9F2", cl: "#167A3C" },
              { key: "combustivel", label: "Combustível",   bg: "#FCEBEB", cl: "#791F1F" },
              { key: "outros",      label: "Outros",        bg: "#F1EFE8", cl: "#666"    },
            ];
            const catItMap = Object.fromEntries(CATS_IT.map(c => [c.key, c]));
            const CATS_IT_KEYS = CATS_IT.map(c => c.key);

            const itBase = insumos.filter(i => CATS_IT_KEYS.includes(i.categoria));

            const itFiltr = itBase.filter(i => {
              const matchCat   = filtroIt === "todos" || i.categoria === filtroIt;
              const matchBusca = !buscaIt || i.nome.toLowerCase().includes(buscaIt.toLowerCase()) || (i.fabricante ?? "").toLowerCase().includes(buscaIt.toLowerCase());
              return matchCat && matchBusca;
            });

            const totalValorIt = itFiltr.reduce((s, i) => s + (i.estoque * i.valor_unitario), 0);
            const abaixoMinIt  = itBase.filter(i => i.estoque < i.estoque_minimo).length;

            const abrirModalIt = (ins?: Insumo) => {
              setEditIns(ins ?? null);
              setFIns(ins ? {
                nome: ins.nome, categoria: ins.categoria, subgrupo: ins.subgrupo ?? "",
                unidade: ins.unidade, fabricante: ins.fabricante ?? "",
                estoque: String(ins.estoque), estoque_minimo: String(ins.estoque_minimo),
                valor_unitario: String(ins.valor_unitario), lote: ins.lote ?? "", validade: ins.validade ?? "",
                deposito_id: ins.deposito_id ?? "", bomba_id: ins.bomba_id ?? "", principio_ativo_id: "",
              } : { nome: "", categoria: "material" as Insumo["categoria"], subgrupo: "", unidade: "un", fabricante: "", estoque: "0", estoque_minimo: "0", valor_unitario: "0", lote: "", validade: "", deposito_id: "", bomba_id: "", principio_ativo_id: "" });
              setModalIns(true);
            };

            const salvarIt = async () => {
              if (!fIns.nome.trim()) { setErro("Informe o nome do item."); return; }
              setSalvando(true); setErro("");
              try {
                const isComb = fIns.categoria === "combustivel";
                const payload: Omit<Insumo, "id" | "created_at"> = {
                  fazenda_id: fazIdEff!, nome: fIns.nome.trim(), categoria: fIns.categoria,
                  subgrupo: fIns.subgrupo || undefined,
                  unidade: isComb ? "L" : fIns.unidade,
                  fabricante: fIns.fabricante || undefined,
                  estoque: parseFloat(fIns.estoque) || 0,
                  estoque_minimo: parseFloat(fIns.estoque_minimo) || 0,
                  valor_unitario: parseFloat(fIns.valor_unitario) || 0,
                  lote: fIns.lote || undefined, validade: fIns.validade || undefined,
                  deposito_id: fIns.deposito_id || undefined,
                  bomba_id: isComb ? (fIns.bomba_id || undefined) : undefined,
                  tipo: "produto",
                };
                if (editIns) {
                  await atualizarInsumo(editIns.id, payload);
                  setInsumos(x => x.map(r => r.id === editIns.id ? { ...r, ...payload } : r));
                } else {
                  const n = await criarInsumo(payload);
                  setInsumos(x => [...x, n].sort((a, b) => a.nome.localeCompare(b.nome)));
                }
                setModalIns(false);
              } catch (e: unknown) { setErro((e as {message?:string})?.message || JSON.stringify(e)); }
              finally { setSalvando(false); }
            };

            return (
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
                  {[
                    { label: "Total de itens",   valor: itBase.length.toString(),       cor: "#1a1a1a" },
                    { label: "Abaixo do mínimo", valor: abaixoMinIt.toString(),          cor: abaixoMinIt > 0 ? "#E24B4A" : "#444" },
                    { label: "Valor em estoque", valor: totalValorIt.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }), cor: "#1A4870" },
                    { label: "No filtro",        valor: itFiltr.length.toString(),       cor: "#378ADD" },
                  ].map((s, i) => (
                    <div key={i} style={{ background: "#fff", border: "0.5px solid #D4DCE8", borderRadius: 10, padding: "12px 16px" }}>
                      <div style={{ fontSize: 11, color: "#444", marginBottom: 4 }}>{s.label}</div>
                      <div style={{ fontSize: 18, fontWeight: 700, color: s.cor }}>{s.valor}</div>
                    </div>
                  ))}
                </div>

                <div style={{ background: "#fff", border: "0.5px solid #D4DCE8", borderRadius: 12, padding: "12px 16px", display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                  <input style={{ ...inp, width: 220 }} placeholder="Buscar item…" value={buscaIt} onChange={e => setBuscaIt(e.target.value)} />
                  <div style={{ display: "flex", gap: 6, flex: 1, flexWrap: "wrap" }}>
                    <button onClick={() => setFiltroIt("todos")} style={{ padding: "5px 12px", borderRadius: 20, border: "0.5px solid", borderColor: filtroIt === "todos" ? "#1A4870" : "#D4DCE8", background: filtroIt === "todos" ? "#D5E8F5" : "transparent", color: filtroIt === "todos" ? "#0B2D50" : "#666", fontSize: 12, cursor: "pointer", fontWeight: filtroIt === "todos" ? 600 : 400 }}>
                      Todos ({itBase.length})
                    </button>
                    {CATS_IT.map(c => {
                      const qtd = itBase.filter(i => i.categoria === c.key).length;
                      if (qtd === 0) return null;
                      return (
                        <button key={c.key} onClick={() => setFiltroIt(c.key)} style={{ padding: "5px 12px", borderRadius: 20, border: "0.5px solid", borderColor: filtroIt === c.key ? c.cl : "#D4DCE8", background: filtroIt === c.key ? c.bg : "transparent", color: filtroIt === c.key ? c.cl : "#666", fontSize: 12, cursor: "pointer", fontWeight: filtroIt === c.key ? 600 : 400 }}>
                          {c.label} ({qtd})
                        </button>
                      );
                    })}
                  </div>
                  <button style={btnV} onClick={() => abrirModalIt()}>+ Novo Item</button>
                </div>

                <div style={{ background: "#fff", border: "0.5px solid #D4DCE8", borderRadius: 12, overflow: "hidden" }}>
                  {itFiltr.length === 0 ? (
                    <div style={{ padding: 40, textAlign: "center", color: "#444", fontSize: 13 }}>
                      {buscaIt ? `Nenhum item encontrado para "${buscaIt}"` : "Nenhum item geral cadastrado. Use '+ Novo Item' para peças, materiais, combustíveis, escritório, etc."}
                    </div>
                  ) : (
                    <table style={{ width: "100%", borderCollapse: "collapse" }}>
                      <TH cols={["Nome / Fabricante", "Categoria", "Subgrupo", "Unid.", "Estoque", "Mín.", "Valor Unit.", "Total", ""]} />
                      <tbody>
                        {itFiltr.map((ins, i) => {
                          const cat = catItMap[ins.categoria];
                          const abaixo = ins.estoque < ins.estoque_minimo;
                          const total  = ins.estoque * ins.valor_unitario;
                          return (
                            <tr key={ins.id} style={{ borderBottom: i < itFiltr.length - 1 ? "0.5px solid #DEE5EE" : "none", background: abaixo ? "#FFFAF5" : "transparent" }}>
                              <td style={{ padding: "10px 14px" }}>
                                <div style={{ fontWeight: 600, fontSize: 13 }}>{ins.nome}</div>
                                {ins.fabricante && <div style={{ fontSize: 11, color: "#555" }}>{ins.fabricante}</div>}
                              </td>
                              <td style={{ padding: "10px 14px", textAlign: "center" }}>
                                {cat && <span style={{ fontSize: 10, background: cat.bg, color: cat.cl, padding: "2px 8px", borderRadius: 8, fontWeight: 600 }}>{cat.label}</span>}
                              </td>
                              <td style={{ padding: "10px 14px", textAlign: "center", fontSize: 12 }}>{ins.subgrupo || "—"}</td>
                              <td style={{ padding: "10px 14px", textAlign: "center", fontSize: 12 }}>{ins.unidade}</td>
                              <td style={{ padding: "10px 14px", textAlign: "right", fontWeight: 600, color: abaixo ? "#E24B4A" : "#1a1a1a" }}>
                                {ins.estoque.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}
                                {abaixo && <span style={{ marginLeft: 5, fontSize: 9, background: "#FCEBEB", color: "#791F1F", padding: "1px 5px", borderRadius: 6 }}>⚠ baixo</span>}
                              </td>
                              <td style={{ padding: "10px 14px", textAlign: "right", fontSize: 12 }}>{ins.estoque_minimo.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}</td>
                              <td style={{ padding: "10px 14px", textAlign: "right", fontSize: 12 }}>{ins.valor_unitario.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</td>
                              <td style={{ padding: "10px 14px", textAlign: "right", fontWeight: 700, color: "#1a1a1a", fontSize: 12 }}>{total.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</td>
                              <td style={{ padding: "10px 14px", textAlign: "right" }}>
                                <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                                  <button style={btnE} onClick={() => abrirModalIt(ins)}>Editar</button>
                                  <button style={btnX} onClick={() => { if (confirm(`Excluir "${ins.nome}"?`)) excluirInsumo(ins.id).then(() => setInsumos(x => x.filter(r => r.id !== ins.id))); }}>✕</button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                      <tfoot>
                        <tr style={{ background: "#F3F6F9" }}>
                          <td colSpan={7} style={{ padding: "8px 14px", fontSize: 11, color: "#555" }}>{itFiltr.length} itens</td>
                          <td style={{ padding: "8px 14px", textAlign: "right", fontWeight: 700, color: "#1A4870" }}>
                            {totalValorIt.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                          </td>
                          <td />
                        </tr>
                      </tfoot>
                    </table>
                  )}
                </div>

                {modalIns && !["produto_agricola","semente","fertilizante","defensivo","corretivo"].includes(fIns.categoria) && (
                  <Modal titulo={editIns ? `Editar: ${editIns.nome}` : "Novo Item Geral"} onClose={() => setModalIns(false)} width={680}>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                      <div>
                        <label style={lbl}>Categoria *</label>
                        <select style={inp} value={fIns.categoria} onChange={e => {
                          const cat = e.target.value as Insumo["categoria"];
                          setFIns(p => ({ ...p, categoria: cat, unidade: cat === "combustivel" ? "L" : cat === "semente" ? "kg" : p.unidade }));
                        }}>
                          <option value="combustivel">Combustível</option>
                          <option value="biologico">Biológico / Inoculante</option>
                          <option value="peca">Peça / Manutenção</option>
                          <option value="material">Material</option>
                          <option value="uso_consumo">Uso e Consumo</option>
                          <option value="escritorio">Escritório</option>
                          <option value="outros">Outros</option>
                        </select>
                      </div>
                      <div>
                        <label style={lbl}>Unidade *</label>
                        {fIns.categoria === "combustivel" ? (
                          <input style={{ ...inp, background: "#F4F6FA", color: "#555" }} value="L (litros)" readOnly />
                        ) : (
                          <select style={inp} value={fIns.unidade} onChange={e => setFIns(p => ({ ...p, unidade: e.target.value as Insumo["unidade"] }))}>
                            <option value="un">un (unidade)</option>
                            <option value="kg">kg</option>
                            <option value="L">L (litros)</option>
                            <option value="m">m (metro)</option>
                            <option value="m2">m² (metro quadrado)</option>
                            <option value="cx">cx (caixa)</option>
                            <option value="pc">pc (peça)</option>
                            <option value="par">par</option>
                            <option value="outros">outros</option>
                          </select>
                        )}
                      </div>
                      <div style={{ gridColumn: "1/-1" }}>
                        <label style={lbl}>Nome *</label>
                        <input style={inp} placeholder={fIns.categoria === "combustivel" ? "Ex: Diesel S10, Gasolina" : "Ex: Filtro de óleo, Graxeira"} value={fIns.nome} onChange={e => setFIns(p => ({ ...p, nome: e.target.value }))} />
                      </div>
                      <div>
                        <label style={lbl}>Subgrupo</label>
                        <input style={inp} placeholder="Ex: Manutenção, Lubrificantes" value={fIns.subgrupo} onChange={e => setFIns(p => ({ ...p, subgrupo: e.target.value }))} />
                      </div>
                      <div>
                        <label style={lbl}>Fabricante / Marca</label>
                        <input style={inp} placeholder="Ex: Bosch, 3M" value={fIns.fabricante} onChange={e => setFIns(p => ({ ...p, fabricante: e.target.value }))} />
                      </div>
                      <div>
                        <label style={lbl}>Estoque atual</label>
                        <InputNumerico style={inp} decimais={3} value={fIns.estoque} onChange={v => setFIns(p => ({ ...p, estoque: v }))} />
                      </div>
                      <div>
                        <label style={lbl}>Estoque mínimo</label>
                        <InputNumerico style={inp} decimais={3} value={fIns.estoque_minimo} onChange={v => setFIns(p => ({ ...p, estoque_minimo: v }))} />
                      </div>
                      <div>
                        <label style={lbl}>Valor unitário (R$)</label>
                        <InputMonetario style={inp} value={fIns.valor_unitario} onChange={v => setFIns(p => ({ ...p, valor_unitario: String(v) }))} />
                      </div>
                      <div>
                        <label style={lbl}>Depósito padrão</label>
                        <select style={inp} value={fIns.deposito_id} onChange={e => setFIns(p => ({ ...p, deposito_id: e.target.value }))}>
                          <option value="">— Selecione —</option>
                          {depositos.filter(d => d.ativo).map(d => <option key={d.id} value={d.id}>{d.nome}</option>)}
                        </select>
                      </div>
                      {fIns.categoria === "combustivel" && (
                        <div>
                          <label style={lbl}>Bomba associada</label>
                          <select style={inp} value={fIns.bomba_id} onChange={e => setFIns(p => ({ ...p, bomba_id: e.target.value }))}>
                            <option value="">— Selecione —</option>
                            {bombas.map(b => <option key={b.id} value={b.id}>{b.nome}</option>)}
                          </select>
                        </div>
                      )}
                      {parseFloat(fIns.estoque) > 0 && parseFloat(fIns.valor_unitario) > 0 && (
                        <div style={{ gridColumn: "1/-1", background: "#D5E8F5", borderRadius: 8, padding: "8px 12px", fontSize: 12, color: "#0B2D50" }}>
                          Valor em estoque: <strong>{(parseFloat(fIns.estoque) * parseFloat(fIns.valor_unitario)).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</strong>
                        </div>
                      )}
                      <div style={{ gridColumn: "1/-1", display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 4 }}>
                        <button style={btnR} onClick={() => setModalIns(false)}>Cancelar</button>
                        <button style={{ ...btnV, opacity: salvando || !fIns.nome.trim() ? 0.5 : 1 }} disabled={salvando || !fIns.nome.trim()} onClick={salvarIt}>
                          {salvando ? "Salvando…" : "Salvar"}
                        </button>
                      </div>
                    </div>
                  </Modal>
                )}
              </div>
            );
          })()}

          {/* ══ DEPÓSITOS ══ */}
          {aba === "depositos" && (
            <div style={{ background: "#fff", border: "0.5px solid #D4DCE8", borderRadius: 12, overflow: "hidden" }}>
              <div style={{ padding: "14px 18px", borderBottom: "0.5px solid #DEE5EE", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <div style={{ color: "#1a1a1a", fontWeight: 600, fontSize: 14 }}>Depósitos e Armazéns <span style={{ fontSize: 11, color: "#444", fontWeight: 400 }}>({depositos.filter(d => d.ativo).length} ativos)</span></div>
                  <div style={{ fontSize: 11, color: "#555", marginTop: 2 }}>Armazéns, silos e galpões para estoque de grãos e insumos</div>
                </div>
                <button style={btnV} onClick={() => abrirModalDep()}>+ Novo Depósito</button>
              </div>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <TH cols={["Nome", "Tipo", "Capacidade (sc)", "Status", ""]} />
                <tbody>
                  {depositos.length === 0 && <tr><td colSpan={5} style={{ padding: 32, textAlign: "center", color: "#444" }}>Nenhum depósito cadastrado</td></tr>}
                  {depositos.map((d, i) => {
                    const corTipo: Record<string, [string,string]> = {
                      insumo_fazenda:   ["#D5E8F5","#0B2D50"],
                      armazem_fazenda:  ["#E6F1FB","#0C447C"],
                      almoxarifado:     ["#FAEEDA","#633806"],
                      oficina:          ["#F1EFE8","#555"],
                      terceiro:         ["#FBF3E0","#C9921B"],
                      armazem_terceiro: ["#FBF0D8","#7A5A12"],
                    };
                    const labelTipoDep: Record<string,string> = {
                      insumo_fazenda:   "Insumo - Fazenda",
                      armazem_fazenda:  "Armazém/Silo - Fazenda",
                      almoxarifado:     "Almoxarifado - Fazenda",
                      oficina:          "Oficina - Fazenda",
                      terceiro:         "Depósito de Terceiros",
                      armazem_terceiro: "Armazém/Silo Terceiros",
                    };
                    const [bg, cl] = corTipo[d.tipo] ?? ["#F1EFE8","#555"];
                    return (
                      <tr key={d.id} style={{ borderBottom: i < depositos.length - 1 ? "0.5px solid #DEE5EE" : "none" }}>
                        <td style={{ padding: "10px 14px", color: "#1a1a1a", fontWeight: 600 }}>{d.nome}</td>
                        <td style={{ padding: "10px 14px", textAlign: "center" }}>{badge(labelTipoDep[d.tipo] ?? d.tipo, bg, cl)}</td>
                        <td style={{ padding: "10px 14px", textAlign: "center", color: "#1a1a1a" }}>{d.capacidade_sc ? d.capacidade_sc.toLocaleString("pt-BR") + " sc" : "—"}</td>
                        <td style={{ padding: "10px 14px", textAlign: "center" }}>{badge(d.ativo ? "Ativo" : "Inativo", d.ativo ? "#D5E8F5" : "#F1EFE8", d.ativo ? "#0B2D50" : "#555")}</td>
                        <td style={{ padding: "10px 14px", textAlign: "right" }}>
                          <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                            <button style={btnE} onClick={() => abrirModalDep(d)}>Editar</button>
                            <button style={btnX} onClick={() => { if (confirm("Excluir depósito?")) excluirDeposito(d.id).then(() => setDepositos(x => x.filter(r => r.id !== d.id))); }}>✕</button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* ══ FUNCIONÁRIOS ══ */}
          {aba === "funcionarios" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              {/* Cabeçalho + controles */}
              <div style={{ background: "#fff", border: "0.5px solid #D4DCE8", borderRadius: 12, overflow: "hidden" }}>
                <div style={{ padding: "14px 18px", borderBottom: "0.5px solid #DEE5EE", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
                  <div style={{ color: "#1a1a1a", fontWeight: 600, fontSize: 14 }}>
                    Funcionários <span style={{ fontSize: 11, color: "#444", fontWeight: 400 }}>({funcs.filter(f => f.ativo).length} ativos)</span>
                  </div>
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <span style={{ fontSize: 12, color: "#555" }}>Processar folha:</span>
                    <input type="month" value={mesProcessar} onChange={e => setMesProcessar(e.target.value)} style={{ ...inp, width: 140, padding: "6px 10px" }} />
                    <button style={{ ...btnV, background: "#C9921B", borderColor: "#C9921B", opacity: processando ? 0.6 : 1 }} disabled={processando} onClick={processarFolha}>
                      {processando ? "Processando…" : "Gerar Folha →"}
                    </button>
                    <button style={btnV} onClick={() => abrirModalFunc()}>+ Novo</button>
                  </div>
                </div>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <TH cols={["Nome", "Vínculo", "Função", "Admissão", "Salário Base", "Custo Total Est.", "Status", ""]} />
                  <tbody>
                    {funcs.length === 0 && <tr><td colSpan={8} style={{ padding: 32, textAlign: "center", color: "#444" }}>Nenhum funcionário cadastrado</td></tr>}
                    {funcs.map((f, i) => {
                      const corVinc: Record<string, [string,string]> = { clt: ["#D5E8F5","#0B2D50"], diarista: ["#FAEEDA","#633806"], empreiteiro: ["#E6F1FB","#0C447C"], outro: ["#F1EFE8","#555"] };
                      const [bg, cl] = corVinc[f.tipo] ?? ["#F1EFE8","#555"];
                      const sal = f.salario_base ?? 0;
                      const encargos = sal > 0 ? sal * (
                        (Number(f.fgts_pct ?? 8) + Number(f.inss_empregador_pct ?? (f.usar_funrural ? 1.5 : 20)) +
                         Number(f.sat_rat_pct ?? 1) + Number(f.sistema_s_pct ?? (f.usar_funrural ? 0.2 : 5.8)) +
                         Number(f.provisao_13_pct ?? 8.33) + Number(f.provisao_ferias_pct ?? 11.11)) / 100
                      ) : 0;
                      const custoTotal = sal + encargos;
                      return (
                        <tr key={f.id} style={{ borderBottom: i < funcs.length - 1 ? "0.5px solid #DEE5EE" : "none" }}>
                          <td style={{ padding: "10px 14px", color: "#1a1a1a", fontWeight: 600 }}>{f.nome}</td>
                          <td style={{ padding: "10px 14px", textAlign: "center" }}>{badge(f.tipo.toUpperCase(), bg, cl)}</td>
                          <td style={{ padding: "10px 14px", textAlign: "center", color: "#1a1a1a" }}>{f.funcao || "—"}</td>
                          <td style={{ padding: "10px 14px", textAlign: "center", color: "#1a1a1a" }}>{f.data_admissao || "—"}</td>
                          <td style={{ padding: "10px 14px", textAlign: "right", color: "#1a1a1a" }}>{sal > 0 ? `R$ ${sal.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}` : "—"}</td>
                          <td style={{ padding: "10px 14px", textAlign: "right", color: custoTotal > 0 ? "#C9921B" : "#888", fontWeight: custoTotal > 0 ? 600 : 400 }}>{custoTotal > 0 ? `R$ ${custoTotal.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}` : "—"}</td>
                          <td style={{ padding: "10px 14px", textAlign: "center" }}>{badge(f.ativo ? "Ativo" : "Inativo", f.ativo ? "#D5E8F5" : "#F1EFE8", f.ativo ? "#0B2D50" : "#555")}</td>
                          <td style={{ padding: "10px 14px", textAlign: "right" }}>
                            <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                              <button style={btnE} onClick={() => abrirModalFunc(f)}>Editar</button>
                              <button style={btnX} onClick={() => { if (confirm("Excluir?")) excluirFuncionario(f.id).then(() => setFuncs(x => x.filter(r => r.id !== f.id))); }}>✕</button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ══ PADRÕES DE CLASSIFICAÇÃO ══ */}
          {aba === "padroes_classificacao" && (() => {
            const COMMODITIES = ["Soja","Milho","Algodão","Sorgo","Trigo"];
            const isSoja  = (c: string) => c === "Soja";
            const isMilho = (c: string) => c.startsWith("Milho");

            const abrirModalPCls = (p?: PadraoClassificacao) => {
              setEditPCls(p ?? null);
              setFPCls(p ? {
                commodity: p.commodity, nome_padrao: p.nome_padrao, ativo: p.ativo,
                umidade_padrao: String(p.umidade_padrao),
                impureza_padrao: String(p.impureza_padrao),
                avariados_padrao: String(p.avariados_padrao),
                ardidos_max: p.ardidos_max != null ? String(p.ardidos_max) : "",
                mofados_max: p.mofados_max != null ? String(p.mofados_max) : "",
                esverdeados_max: p.esverdeados_max != null ? String(p.esverdeados_max) : "",
                quebrados_max: p.quebrados_max != null ? String(p.quebrados_max) : "",
                ph_minimo: p.ph_minimo != null ? String(p.ph_minimo) : "",
                carunchados_max: p.carunchados_max != null ? String(p.carunchados_max) : "",
                kg_saca: String(p.kg_saca),
              } : {
                commodity: "Soja", nome_padrao: "", ativo: true,
                umidade_padrao: "14", impureza_padrao: "1", avariados_padrao: "8",
                ardidos_max: "8", mofados_max: "", esverdeados_max: "8",
                quebrados_max: "30", ph_minimo: "78", carunchados_max: "", kg_saca: "60",
              });
              setModalPCls(true);
            };

            const salvarPCls = async () => {
              await salvar(async () => {
                const payload = {
                  fazenda_id: fazIdEff!,
                  commodity: fPCls.commodity,
                  nome_padrao: fPCls.nome_padrao.trim(),
                  ativo: fPCls.ativo,
                  umidade_padrao: parseFloat(fPCls.umidade_padrao) || 0,
                  impureza_padrao: parseFloat(fPCls.impureza_padrao) || 0,
                  avariados_padrao: parseFloat(fPCls.avariados_padrao) || 0,
                  ardidos_max: fPCls.ardidos_max ? parseFloat(fPCls.ardidos_max) : null,
                  mofados_max: fPCls.mofados_max ? parseFloat(fPCls.mofados_max) : null,
                  esverdeados_max: fPCls.esverdeados_max ? parseFloat(fPCls.esverdeados_max) : null,
                  quebrados_max: fPCls.quebrados_max ? parseFloat(fPCls.quebrados_max) : null,
                  ph_minimo: fPCls.ph_minimo ? parseFloat(fPCls.ph_minimo) : null,
                  carunchados_max: fPCls.carunchados_max ? parseFloat(fPCls.carunchados_max) : null,
                  kg_saca: parseFloat(fPCls.kg_saca) || 60,
                };
                if (editPCls) {
                  const { data } = await supabase.from("padroes_classificacao").update(payload).eq("id", editPCls.id).select().single();
                  setPadroesCls(x => x.map(r => r.id === editPCls.id ? (data as PadraoClassificacao) : r));
                } else {
                  const { data } = await supabase.from("padroes_classificacao").insert(payload).select().single();
                  setPadroesCls(x => [...x, data as PadraoClassificacao]);
                }
                setModalPCls(false);
              });
            };

            const excluirPCls = async (id: string) => {
              if (!confirm("Excluir padrão de classificação?")) return;
              await supabase.from("padroes_classificacao").delete().eq("id", id);
              setPadroesCls(x => x.filter(r => r.id !== id));
            };

            // Agrupa por commodity
            const porComm: Record<string, PadraoClassificacao[]> = {};
            for (const p of padroesCls) {
              if (!porComm[p.commodity]) porComm[p.commodity] = [];
              porComm[p.commodity].push(p);
            }

            const fmt = (v?: number | null) => v != null ? `${v}%` : "—";
            const fmtN = (v?: number | null) => v != null ? `${v}` : "—";

            return (
              <div>
                {/* Cabeçalho */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 14, color: "#1a1a1a" }}>Padrões de Classificação</div>
                    <div style={{ fontSize: 11, color: "#666", marginTop: 2 }}>Tabelas de referência para cálculo de desconto por commodity — ABIOVE / IN MAPA 11/2007 (Soja) / IN MAPA 60/2011 (Milho)</div>
                  </div>
                  <button style={btnV} onClick={() => abrirModalPCls()}>+ Novo Padrão</button>
                </div>

                {/* Seed com padrões oficiais */}
                {padroesCls.length === 0 && (
                  <div style={{ background: "#FBF3E0", border: "0.5px solid #F0D090", borderRadius: 10, padding: "14px 18px", marginBottom: 16, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 13, color: "#633806" }}>Nenhum padrão cadastrado</div>
                      <div style={{ fontSize: 11, color: "#633806", marginTop: 3 }}>Clique em "Carregar Padrões Oficiais" para pré-cadastrar ABIOVE (Soja) e IN MAPA 60/2011 (Milho).</div>
                    </div>
                    <button style={{ padding: "8px 16px", background: "#C9921B", color: "#fff", border: "none", borderRadius: 8, fontWeight: 600, cursor: "pointer", fontSize: 13, whiteSpace: "nowrap" }}
                      onClick={async () => {
                        const defaults = [
                          { commodity: "Soja", nome_padrao: "ABIOVE 2025", ativo: true, umidade_padrao: 14, impureza_padrao: 1, avariados_padrao: 8, ardidos_max: 8, mofados_max: null, esverdeados_max: 8, quebrados_max: 30, ph_minimo: 78, carunchados_max: null, kg_saca: 60 },
                          { commodity: "Milho", nome_padrao: "IN MAPA 60/2011", ativo: true, umidade_padrao: 14.5, impureza_padrao: 1, avariados_padrao: 6, ardidos_max: 3, mofados_max: null, esverdeados_max: null, quebrados_max: null, ph_minimo: 74, carunchados_max: 3, kg_saca: 60 },
                        ].map(d => ({ ...d, fazenda_id: fazIdEff! }));
                        const { data } = await supabase.from("padroes_classificacao").insert(defaults).select();
                        if (data) setPadroesCls(data as PadraoClassificacao[]);
                      }}>
                      Carregar Padrões Oficiais
                    </button>
                  </div>
                )}

                {/* Tabelas por commodity */}
                {Object.entries(porComm).map(([comm, lista]) => (
                  <div key={comm} style={{ background: "#fff", border: "0.5px solid #D4DCE8", borderRadius: 12, overflow: "hidden", marginBottom: 14 }}>
                    <div style={{ padding: "10px 16px", background: "#F3F6F9", borderBottom: "0.5px solid #D4DCE8", display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ fontWeight: 700, fontSize: 13, color: "#1A4870" }}>{comm}</span>
                      <span style={{ fontSize: 11, color: "#666" }}>{lista.length} padrão{lista.length !== 1 ? "s" : ""}</span>
                    </div>
                    <table style={{ width: "100%", borderCollapse: "collapse" }}>
                      <thead>
                        <tr style={{ background: "#F8FAFD" }}>
                          <th style={{ padding: "8px 14px", textAlign: "left", fontSize: 11, fontWeight: 600, color: "#555", borderBottom: "0.5px solid #D4DCE8" }}>Nome do Padrão</th>
                          <th style={{ padding: "8px 10px", textAlign: "center", fontSize: 11, fontWeight: 600, color: "#555", borderBottom: "0.5px solid #D4DCE8" }}>Umidade</th>
                          <th style={{ padding: "8px 10px", textAlign: "center", fontSize: 11, fontWeight: 600, color: "#555", borderBottom: "0.5px solid #D4DCE8" }}>Impureza</th>
                          <th style={{ padding: "8px 10px", textAlign: "center", fontSize: 11, fontWeight: 600, color: "#555", borderBottom: "0.5px solid #D4DCE8" }}>Avariados</th>
                          {isSoja(comm) && <>
                            <th style={{ padding: "8px 10px", textAlign: "center", fontSize: 11, fontWeight: 600, color: "#555", borderBottom: "0.5px solid #D4DCE8" }}>Ardidos</th>
                            <th style={{ padding: "8px 10px", textAlign: "center", fontSize: 11, fontWeight: 600, color: "#555", borderBottom: "0.5px solid #D4DCE8" }}>Esverdeados</th>
                            <th style={{ padding: "8px 10px", textAlign: "center", fontSize: 11, fontWeight: 600, color: "#555", borderBottom: "0.5px solid #D4DCE8" }}>Quebrados</th>
                            <th style={{ padding: "8px 10px", textAlign: "center", fontSize: 11, fontWeight: 600, color: "#555", borderBottom: "0.5px solid #D4DCE8" }}>PH mín.</th>
                          </>}
                          {isMilho(comm) && <>
                            <th style={{ padding: "8px 10px", textAlign: "center", fontSize: 11, fontWeight: 600, color: "#555", borderBottom: "0.5px solid #D4DCE8" }}>Ardidos+Brot.</th>
                            <th style={{ padding: "8px 10px", textAlign: "center", fontSize: 11, fontWeight: 600, color: "#555", borderBottom: "0.5px solid #D4DCE8" }}>Carunchados</th>
                            <th style={{ padding: "8px 10px", textAlign: "center", fontSize: 11, fontWeight: 600, color: "#555", borderBottom: "0.5px solid #D4DCE8" }}>PH mín.</th>
                          </>}
                          <th style={{ padding: "8px 10px", textAlign: "center", fontSize: 11, fontWeight: 600, color: "#555", borderBottom: "0.5px solid #D4DCE8" }}>Kg/sc</th>
                          <th style={{ padding: "8px 10px", textAlign: "center", fontSize: 11, fontWeight: 600, color: "#555", borderBottom: "0.5px solid #D4DCE8" }}>Status</th>
                          <th style={{ padding: "8px 10px", borderBottom: "0.5px solid #D4DCE8" }}></th>
                        </tr>
                      </thead>
                      <tbody>
                        {lista.map((p, pi) => (
                          <tr key={p.id} style={{ borderBottom: pi < lista.length - 1 ? "0.5px solid #DEE5EE" : "none" }}>
                            <td style={{ padding: "10px 14px", fontWeight: 600, color: "#1a1a1a" }}>{p.nome_padrao}</td>
                            <td style={{ padding: "10px 10px", textAlign: "center", color: "#1a1a1a" }}>{fmt(p.umidade_padrao)}</td>
                            <td style={{ padding: "10px 10px", textAlign: "center", color: "#1a1a1a" }}>{fmt(p.impureza_padrao)}</td>
                            <td style={{ padding: "10px 10px", textAlign: "center", color: "#1a1a1a" }}>{fmt(p.avariados_padrao)}</td>
                            {isSoja(comm) && <>
                              <td style={{ padding: "10px 10px", textAlign: "center", color: "#1a1a1a" }}>{fmt(p.ardidos_max)}</td>
                              <td style={{ padding: "10px 10px", textAlign: "center", color: "#1a1a1a" }}>{fmt(p.esverdeados_max)}</td>
                              <td style={{ padding: "10px 10px", textAlign: "center", color: "#1a1a1a" }}>{fmt(p.quebrados_max)}</td>
                              <td style={{ padding: "10px 10px", textAlign: "center", color: "#1a1a1a" }}>{fmtN(p.ph_minimo)}</td>
                            </>}
                            {isMilho(comm) && <>
                              <td style={{ padding: "10px 10px", textAlign: "center", color: "#1a1a1a" }}>{fmt(p.ardidos_max)}</td>
                              <td style={{ padding: "10px 10px", textAlign: "center", color: "#1a1a1a" }}>{fmt(p.carunchados_max)}</td>
                              <td style={{ padding: "10px 10px", textAlign: "center", color: "#1a1a1a" }}>{fmtN(p.ph_minimo)}</td>
                            </>}
                            <td style={{ padding: "10px 10px", textAlign: "center", color: "#1a1a1a" }}>{p.kg_saca}</td>
                            <td style={{ padding: "10px 10px", textAlign: "center" }}>{badge(p.ativo ? "Ativo" : "Inativo", p.ativo ? "#D5E8F5" : "#F1EFE8", p.ativo ? "#0B2D50" : "#555")}</td>
                            <td style={{ padding: "10px 10px", textAlign: "right" }}>
                              <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                                <button style={btnE} onClick={() => abrirModalPCls(p)}>Editar</button>
                                <button style={btnX} onClick={() => excluirPCls(p.id)}>✕</button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ))}

                {/* Modal Padrão de Classificação */}
                {modalPCls && (
                  <Modal titulo={editPCls ? "Editar Padrão de Classificação" : "Novo Padrão de Classificação"} subtitulo="Parâmetros de referência para cálculo de descontos no romaneio" onClose={() => setModalPCls(false)} width={860}>
                    {/* Identificação */}
                    <div style={{ fontSize: 11, fontWeight: 600, color: "#1A4870", marginBottom: 8, paddingBottom: 4, borderBottom: "0.5px solid #D4DCE8" }}>Identificação</div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14, marginBottom: 18 }}>
                      <div>
                        <label style={lbl}>Commodity *</label>
                        <select style={inp} value={fPCls.commodity} onChange={e => {
                          const c = e.target.value;
                          setFPCls(p => ({
                            ...p, commodity: c,
                            ardidos_max: isSoja(c) ? "8" : "3",
                            esverdeados_max: isSoja(c) ? "8" : "",
                            quebrados_max: isSoja(c) ? "30" : "",
                            ph_minimo: isSoja(c) ? "78" : "74",
                            carunchados_max: isMilho(c) ? "3" : "",
                            umidade_padrao: isMilho(c) ? "14.5" : "14",
                            avariados_padrao: isMilho(c) ? "6" : "8",
                          }));
                        }}>
                          {COMMODITIES.map(c => <option key={c} value={c}>{c}</option>)}
                        </select>
                      </div>
                      <div>
                        <label style={lbl}>Nome do Padrão *</label>
                        <input style={inp} placeholder="Ex: ABIOVE 2025, Padrão Bunge" value={fPCls.nome_padrao} onChange={e => setFPCls(p => ({ ...p, nome_padrao: e.target.value }))} />
                      </div>
                      <div>
                        <label style={lbl}>Peso da Saca (kg)</label>
                        <InputMonetario style={inp} min="50" max="70" value={fPCls.kg_saca} onChange={v => setFPCls(p => ({ ...p, kg_saca: String(v) }))} />
                      </div>
                    </div>

                    {/* Padrões base */}
                    <div style={{ fontSize: 11, fontWeight: 600, color: "#1A4870", marginBottom: 8, paddingBottom: 4, borderBottom: "0.5px solid #D4DCE8" }}>Parâmetros Base (acima do limite = desconto)</div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14, marginBottom: 18 }}>
                      <div>
                        <label style={lbl}>Umidade máx. (%)</label>
                        <InputMonetario style={inp} placeholder={isMilho(fPCls.commodity) ? "14,5%" : "14%"} value={fPCls.umidade_padrao} onChange={v => setFPCls(p => ({ ...p, umidade_padrao: String(v) }))} />
                      </div>
                      <div>
                        <label style={lbl}>Impureza máx. (%)</label>
                        <InputMonetario style={inp} placeholder="1%" value={fPCls.impureza_padrao} onChange={v => setFPCls(p => ({ ...p, impureza_padrao: String(v) }))} />
                      </div>
                      <div>
                        <label style={lbl}>Avariados totais máx. (%)</label>
                        <InputMonetario style={inp} value={fPCls.avariados_padrao} onChange={v => setFPCls(p => ({ ...p, avariados_padrao: String(v) }))} />
                      </div>
                    </div>

                    {/* Sub-parâmetros — Soja */}
                    {isSoja(fPCls.commodity) && <>
                      <div style={{ fontSize: 11, fontWeight: 600, color: "#1A4870", marginBottom: 8, paddingBottom: 4, borderBottom: "0.5px solid #D4DCE8" }}>Sub-parâmetros Soja (ABIOVE / IN MAPA 11/2007)</div>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 14, marginBottom: 18 }}>
                        <div>
                          <label style={lbl}>Ardidos máx. (%)</label>
                          <InputMonetario style={inp} placeholder="8%" value={fPCls.ardidos_max} onChange={v => setFPCls(p => ({ ...p, ardidos_max: String(v) }))} />
                        </div>
                        <div>
                          <label style={lbl}>Mofados máx. (%)</label>
                          <InputMonetario style={inp} placeholder="Incluso nos ardidos" value={fPCls.mofados_max} onChange={v => setFPCls(p => ({ ...p, mofados_max: String(v) }))} />
                        </div>
                        <div>
                          <label style={lbl}>Esverdeados máx. (%)</label>
                          <InputMonetario style={inp} placeholder="8%" value={fPCls.esverdeados_max} onChange={v => setFPCls(p => ({ ...p, esverdeados_max: String(v) }))} />
                        </div>
                        <div>
                          <label style={lbl}>Quebrados máx. (%)</label>
                          <InputMonetario style={inp} placeholder="30%" value={fPCls.quebrados_max} onChange={v => setFPCls(p => ({ ...p, quebrados_max: String(v) }))} />
                        </div>
                        <div>
                          <label style={lbl}>PH mínimo (kg/hl)</label>
                          <InputMonetario style={inp} placeholder="78" value={fPCls.ph_minimo} onChange={v => setFPCls(p => ({ ...p, ph_minimo: String(v) }))} />
                        </div>
                      </div>
                    </>}

                    {/* Sub-parâmetros — Milho */}
                    {isMilho(fPCls.commodity) && <>
                      <div style={{ fontSize: 11, fontWeight: 600, color: "#1A4870", marginBottom: 8, paddingBottom: 4, borderBottom: "0.5px solid #D4DCE8" }}>Sub-parâmetros Milho (IN MAPA 60/2011)</div>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 14, marginBottom: 18 }}>
                        <div>
                          <label style={lbl}>Ardidos+Brotados máx. (%)</label>
                          <InputMonetario style={inp} placeholder="3%" value={fPCls.ardidos_max} onChange={v => setFPCls(p => ({ ...p, ardidos_max: String(v) }))} />
                        </div>
                        <div>
                          <label style={lbl}>Carunchados máx. (%)</label>
                          <InputMonetario style={inp} placeholder="3%" value={fPCls.carunchados_max} onChange={v => setFPCls(p => ({ ...p, carunchados_max: String(v) }))} />
                        </div>
                        <div>
                          <label style={lbl}>PH mínimo (kg/hl)</label>
                          <InputMonetario style={inp} placeholder="74" value={fPCls.ph_minimo} onChange={v => setFPCls(p => ({ ...p, ph_minimo: String(v) }))} />
                        </div>
                      </div>
                    </>}

                    {/* Status e ações */}
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 8 }}>
                      <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, cursor: "pointer" }}>
                        <input type="checkbox" checked={fPCls.ativo} onChange={e => setFPCls(p => ({ ...p, ativo: e.target.checked }))} />
                        Padrão ativo
                      </label>
                      <div style={{ display: "flex", gap: 8 }}>
                        <button style={btnR} onClick={() => setModalPCls(false)}>Cancelar</button>
                        <button style={{ ...btnV, opacity: !fPCls.nome_padrao.trim() || salvando ? 0.5 : 1 }} disabled={!fPCls.nome_padrao.trim() || salvando} onClick={salvarPCls}>
                          {salvando ? "Salvando…" : "Salvar Padrão"}
                        </button>
                      </div>
                    </div>
                  </Modal>
                )}
              </div>
            );
          })()}

          {/* ══ USUÁRIOS (movido para Configurações) ══ */}
          {(aba as string) === "usuarios" && (
            <div>
              <div style={{ display: "flex", gap: 0, marginBottom: 14, background: "#fff", border: "0.5px solid #D4DCE8", borderRadius: 8, overflow: "hidden", width: "fit-content" }}>
                {(["grupos","usuarios"] as const).map(s => (
                  <button key={s} onClick={() => setSubAbaUser(s)} style={{ padding: "8px 20px", border: "none", background: subAbaUser === s ? "#1A4870" : "transparent", color: subAbaUser === s ? "#fff" : "#666", fontWeight: subAbaUser === s ? 600 : 400, cursor: "pointer", fontSize: 13 }}>
                    {s === "grupos" ? "Grupos" : "Usuários"}
                  </button>
                ))}
              </div>

              {subAbaUser === "grupos" && (
                <div style={{ background: "#fff", border: "0.5px solid #D4DCE8", borderRadius: 12, overflow: "hidden" }}>
                  <div style={{ padding: "14px 18px", borderBottom: "0.5px solid #DEE5EE", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div style={{ color: "#1a1a1a", fontWeight: 600, fontSize: 14 }}>Grupos de Usuários</div>
                    <button style={btnV} onClick={() => abrirModalGrupo()}>+ Novo Grupo</button>
                  </div>
                  {grupos.length === 0 && <div style={{ padding: 32, textAlign: "center", color: "#444" }}>Nenhum grupo cadastrado</div>}
                  {grupos.map((g, gi) => (
                    <div key={g.id} style={{ padding: "12px 18px", borderBottom: gi < grupos.length - 1 ? "0.5px solid #DEE5EE" : "none", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <div>
                        <div style={{ color: "#1a1a1a", fontWeight: 600 }}>{g.nome}</div>
                        {g.descricao && <div style={{ fontSize: 11, color: "#555", marginTop: 2 }}>{g.descricao}</div>}
                        <div style={{ display: "flex", gap: 4, marginTop: 6, flexWrap: "wrap" }}>
                          {MODULOS.slice(0, 5).map(m => <span key={m} style={{ fontSize: 9, background: g.permissoes[m] === "nenhum" ? "#F1EFE8" : "#D5E8F5", color: g.permissoes[m] === "nenhum" ? "#555" : "#0B2D50", padding: "1px 6px", borderRadius: 5 }}>{m}</span>)}
                          {MODULOS.length > 5 && <span style={{ fontSize: 9, color: "#444" }}>+{MODULOS.length - 5} módulos</span>}
                        </div>
                      </div>
                      <div style={{ display: "flex", gap: 6 }}>
                        <button style={btnE} onClick={() => abrirModalGrupo(g)}>Editar permissões</button>
                        <button style={btnX} onClick={() => { if (confirm("Excluir grupo?")) excluirGrupo(g.id).then(() => setGrupos(x => x.filter(r => r.id !== g.id))); }}>✕</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {subAbaUser === "usuarios" && (
                <div style={{ background: "#fff", border: "0.5px solid #D4DCE8", borderRadius: 12, overflow: "hidden" }}>
                  <div style={{ padding: "14px 18px", borderBottom: "0.5px solid #DEE5EE", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div style={{ color: "#1a1a1a", fontWeight: 600, fontSize: 14 }}>Usuários</div>
                    <button style={btnV} onClick={() => abrirModalUser()}>+ Novo Usuário</button>
                  </div>
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <TH cols={["Nome", "E-mail", "Grupo", "Status", ""]} />
                    <tbody>
                      {usuarios.length === 0 && <tr><td colSpan={5} style={{ padding: 32, textAlign: "center", color: "#444" }}>Nenhum usuário cadastrado</td></tr>}
                      {usuarios.map((u, i) => {
                        const gr = grupos.find(g => g.id === u.grupo_id);
                        return (
                          <tr key={u.id} style={{ borderBottom: i < usuarios.length - 1 ? "0.5px solid #DEE5EE" : "none" }}>
                            <td style={{ padding: "10px 14px", color: "#1a1a1a", fontWeight: 600 }}>{u.nome}</td>
                            <td style={{ padding: "10px 14px", color: "#1a1a1a" }}>{u.email}</td>
                            <td style={{ padding: "10px 14px", textAlign: "center" }}>{gr ? badge(gr.nome, "#FBF0D8", "#7A5A12") : <span style={{ color: "#444" }}>—</span>}</td>
                            <td style={{ padding: "10px 14px", textAlign: "center" }}>{badge(u.ativo ? "Ativo" : "Inativo", u.ativo ? "#D5E8F5" : "#F1EFE8", u.ativo ? "#0B2D50" : "#555")}</td>
                            <td style={{ padding: "10px 14px", textAlign: "right" }}>
                              <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                                <button style={btnE} onClick={() => abrirModalUser(u)}>Editar</button>
                                <button style={btnX} onClick={() => { if (confirm("Excluir usuário?")) excluirUsuario(u.id).then(() => setUsuarios(x => x.filter(r => r.id !== u.id))); }}>✕</button>
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
          {/* ── ABA: CONTAS BANCÁRIAS ── */}
          {aba === "contas_bancarias" && (
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 14, color: "#1a1a1a" }}>Contas Bancárias <span style={{ fontSize: 11, color: "#555", fontWeight: 400 }}>({contas.filter(c => c.ativa).length} ativas)</span></div>
                  <div style={{ fontSize: 11, color: "#666", marginTop: 2 }}>Contas utilizadas no Fluxo de Caixa, CP/CR e LCDPR</div>
                </div>
                <button style={btnV} onClick={() => { setEditConta(null); setFConta({ nome: "", banco_id: "", banco: "", agencia: "", agencia_dv: "", conta: "", conta_dv: "", moeda: "BRL", ativa: true, empresa_id: "", tipo_conta: "corrente", saldo_inicial: "" }); if (bancos.length === 0) listarBancos().then(setBancos).catch(() => {}); setModalConta(true); }}>+ Nova Conta</button>
              </div>
              {contas.length === 0 ? (
                <div style={{ textAlign: "center", padding: "48px 0", color: "#888", fontSize: 13 }}>Nenhuma conta bancária cadastrada</div>
              ) : (
                <div style={{ border: "0.5px solid #D4DCE8", borderRadius: 12, overflow: "hidden" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                    <thead>
                      <tr style={{ background: "#F4F6FA" }}>
                        {["Nome / Apelido", "Tipo", "Banco", "Conta", "Saldo Inicial", "Moeda", "Status", ""].map(h => (
                          <th key={h} style={{ padding: "10px 14px", textAlign: h === "Saldo Inicial" ? "right" : "left", fontWeight: 600, fontSize: 11, color: "#555", borderBottom: "0.5px solid #D4DCE8" }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {contas.map((c, i) => {
                        const tipoCor: Record<string, { bg: string; color: string; label: string }> = {
                          corrente:    { bg: "#D5E8F5", color: "#0B2D50", label: "Corrente" },
                          investimento:{ bg: "#DCF5E8", color: "#14532D", label: "Investimento" },
                          caixa:       { bg: "#FBF3E0", color: "#7A5A12", label: "Caixa" },
                          transitoria: { bg: "#F4F6FA", color: "#555",    label: "Transitória" },
                        };
                        const tp = tipoCor[c.tipo_conta ?? "corrente"] ?? tipoCor.corrente;
                        return (
                        <tr key={c.id} style={{ borderBottom: i < contas.length - 1 ? "0.5px solid #EEF1F7" : "none", background: i % 2 === 0 ? "#fff" : "#FAFBFD" }}>
                          <td style={{ padding: "10px 14px", fontWeight: 600, color: "#1a1a1a" }}>{c.nome}</td>
                          <td style={{ padding: "10px 14px" }}>
                            <span style={{ background: tp.bg, color: tp.color, borderRadius: 6, padding: "2px 8px", fontSize: 11, fontWeight: 600 }}>{tp.label}</span>
                          </td>
                          <td style={{ padding: "10px 14px", color: "#555" }}>
                            {(() => {
                              const b = bancos.find(x => x.id === c.banco_id);
                              const nome = b ? `${b.nome_curto} (${b.codigo_compe})` : (c.banco || "—");
                              const ag = c.agencia ? [c.agencia, c.agencia_dv].filter(Boolean).join("-") : "";
                              return ag ? `${nome} · Ag. ${ag}` : nome;
                            })()}
                          </td>
                          <td style={{ padding: "10px 14px", color: "#555" }}>
                            {c.conta ? [c.conta, c.conta_dv].filter(Boolean).join("-") : "—"}
                          </td>
                          <td style={{ padding: "10px 14px", textAlign: "right", color: (c.saldo_inicial ?? 0) >= 0 ? "#1A4870" : "#E24B4A", fontWeight: 600, fontSize: 12 }}>
                            {(c.saldo_inicial ?? 0) !== 0 ? (c.saldo_inicial! < 0 ? "− " : "") + Math.abs(c.saldo_inicial!).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : "—"}
                          </td>
                          <td style={{ padding: "10px 14px" }}>
                            <span style={{ background: c.moeda === "USD" ? "#FBF3E0" : "#D5E8F5", color: c.moeda === "USD" ? "#7A5A12" : "#0B2D50", borderRadius: 6, padding: "2px 8px", fontSize: 11, fontWeight: 600 }}>{c.moeda}</span>
                          </td>
                          <td style={{ padding: "10px 14px" }}>
                            <span style={{ background: c.ativa ? "#DCF5E8" : "#F4F6FA", color: c.ativa ? "#14532D" : "#888", borderRadius: 6, padding: "2px 8px", fontSize: 11, fontWeight: 600 }}>{c.ativa ? "Ativa" : "Inativa"}</span>
                          </td>
                          <td style={{ padding: "10px 14px", textAlign: "right" }}>
                            <button style={btnX} onClick={() => { setEditConta(c); setFConta({ nome: c.nome, banco_id: c.banco_id ?? "", banco: c.banco ?? "", agencia: c.agencia ?? "", agencia_dv: c.agencia_dv ?? "", conta: c.conta ?? "", conta_dv: c.conta_dv ?? "", moeda: c.moeda, ativa: c.ativa, empresa_id: c.empresa_id ?? "", tipo_conta: (c.tipo_conta ?? "corrente") as "corrente"|"poupanca"|"investimento"|"caixa"|"transitoria", saldo_inicial: String(c.saldo_inicial ?? "") }); if (bancos.length === 0) listarBancos().then(setBancos).catch(() => {}); setModalConta(true); }}>Editar</button>
                            <button style={{ ...btnX, marginLeft: 6, color: "#E24B4A" }} onClick={async () => { if (!confirm("Excluir esta conta?")) return; await excluirConta(c.id); setContas(x => x.filter(r => r.id !== c.id)); }}>Excluir</button>
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

          {/* ══════════════════════════════════════════════════════════════════
              ABA — IMÓVEIS URBANOS
          ══════════════════════════════════════════════════════════════════ */}
          {aba === "imoveis_urbanos" && (
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 15 }}>Imóveis Urbanos</div>
                  <div style={{ fontSize: 12, color: "#555", marginTop: 2 }}>Apartamentos, casas, salas comerciais e terrenos usados como garantia em operações financeiras.</div>
                </div>
                <button style={{ ...btnV, background: "#1A4870" }} onClick={() => { setEditIU(null); setFIU({ matricula: "", tipo: "outro", descricao: "", logradouro: "", numero_end: "", complemento: "", bairro: "", cep: "", municipio: "", estado: "MT", area_m2: "", valor_avaliacao: "", observacao: "" }); setModalIU(true); }}>+ Cadastrar Imóvel</button>
              </div>

              {imoveisUrbanos.length === 0 ? (
                <div style={{ textAlign: "center", padding: "40px 0", color: "#888", fontSize: 13 }}>Nenhum imóvel urbano cadastrado.</div>
              ) : (
                <div style={{ background: "#fff", border: "0.5px solid #DDE2EE", borderRadius: 10, overflow: "hidden" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                    <TH cols={["Descrição", "Tipo", "Matrícula", "Município / UF", "Área (m²)", "Valor Avaliação", ""]} />
                    <tbody>
                      {imoveisUrbanos.map((u, i) => {
                        const TIPO_IU: Record<ImovelUrbano["tipo"], string> = { apartamento: "Apto.", casa: "Casa", comercial: "Comercial", terreno: "Terreno", outro: "Outro" };
                        return (
                          <tr key={u.id} style={{ borderBottom: i < imoveisUrbanos.length - 1 ? "0.5px solid #EEF1F6" : "none" }}>
                            <td style={{ padding: "10px 14px", fontWeight: 600 }}>{u.descricao}</td>
                            <td style={{ padding: "10px 14px", textAlign: "center" }}><span style={{ fontSize: 11, background: "#EFF4FA", color: "#1A4870", padding: "2px 8px", borderRadius: 8, fontWeight: 600 }}>{TIPO_IU[u.tipo]}</span></td>
                            <td style={{ padding: "10px 14px", color: "#555" }}>{u.matricula || "—"}</td>
                            <td style={{ padding: "10px 14px", color: "#555" }}>{u.municipio ? `${u.municipio} — ${u.estado}` : u.estado}</td>
                            <td style={{ padding: "10px 14px", textAlign: "center" }}>{u.area_m2 ? `${Number(u.area_m2).toLocaleString("pt-BR")} m²` : "—"}</td>
                            <td style={{ padding: "10px 14px", textAlign: "center", fontWeight: 600, color: u.valor_avaliacao ? "#1a1a1a" : "#aaa" }}>{u.valor_avaliacao ? `R$ ${Number(u.valor_avaliacao).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}` : "—"}</td>
                            <td style={{ padding: "10px 14px", textAlign: "right", display: "flex", gap: 6 }}>
                              <button style={btnE} onClick={() => { setEditIU(u); setFIU({ matricula: u.matricula ?? "", tipo: u.tipo, descricao: u.descricao, logradouro: u.logradouro ?? "", numero_end: u.numero_end ?? "", complemento: u.complemento ?? "", bairro: u.bairro ?? "", cep: u.cep ?? "", municipio: u.municipio ?? "", estado: u.estado, area_m2: String(u.area_m2 ?? ""), valor_avaliacao: String(u.valor_avaliacao ?? ""), observacao: u.observacao ?? "" }); setModalIU(true); }}>Editar</button>
                              <button style={btnX} onClick={() => { if (confirm("Excluir este imóvel?")) excluirImovelUrbano(u.id).then(() => setImoveisUrbanos(p => p.filter(x => x.id !== u.id))); }}>✕</button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              {modalIU && (
                <Modal titulo={editIU ? "Editar Imóvel Urbano" : "Novo Imóvel Urbano"} subtitulo="Imóvel usado como garantia em operações financeiras" onClose={() => setModalIU(false)} width={760}>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14 }}>
                    <div style={{ gridColumn: "1/-1" }}>
                      <label style={lbl}>Descrição *</label>
                      <input style={inp} placeholder="Ex: Apto 302 — Ed. Vida Nova" value={fIU.descricao} onChange={e => setFIU(p => ({ ...p, descricao: e.target.value }))} />
                    </div>
                    <div>
                      <label style={lbl}>Tipo</label>
                      <select style={inp} value={fIU.tipo} onChange={e => setFIU(p => ({ ...p, tipo: e.target.value as ImovelUrbano["tipo"] }))}>
                        <option value="apartamento">Apartamento</option>
                        <option value="casa">Casa</option>
                        <option value="comercial">Sala / Loja Comercial</option>
                        <option value="terreno">Terreno</option>
                        <option value="outro">Outro</option>
                      </select>
                    </div>
                    <div>
                      <label style={lbl}>Matrícula (CRI)</label>
                      <input style={inp} placeholder="Ex: 12.345" value={fIU.matricula} onChange={e => setFIU(p => ({ ...p, matricula: e.target.value }))} />
                    </div>
                    <div>
                      <label style={lbl}>Área (m²)</label>
                      <InputNumerico style={inp} placeholder="0,00" value={fIU.area_m2} onChange={v => setFIU(p => ({ ...p, area_m2: v }))} />
                    </div>
                    <div style={{ gridColumn: "1/-1" }}><hr style={{ border: "none", borderTop: "0.5px solid #DDE2EE", margin: "4px 0 6px" }} /></div>
                    <div>
                      <label style={lbl}>CEP</label>
                      <input style={inp} placeholder="00000-000" value={fIU.cep} onChange={e => { const v = maskCep(e.target.value); setFIU(p => ({ ...p, cep: v })); buscarCepIU(v); }} />
                    </div>
                    <div style={{ gridColumn: "span 2" }}>
                      <label style={lbl}>Logradouro</label>
                      <input style={inp} placeholder="Rua, Av., Alameda…" value={fIU.logradouro} onChange={e => setFIU(p => ({ ...p, logradouro: e.target.value }))} />
                    </div>
                    <div>
                      <label style={lbl}>Número</label>
                      <input style={inp} placeholder="Nº" value={fIU.numero_end} onChange={e => setFIU(p => ({ ...p, numero_end: e.target.value }))} />
                    </div>
                    <div>
                      <label style={lbl}>Complemento</label>
                      <input style={inp} placeholder="Apto, Sala…" value={fIU.complemento} onChange={e => setFIU(p => ({ ...p, complemento: e.target.value }))} />
                    </div>
                    <div>
                      <label style={lbl}>Bairro</label>
                      <input style={inp} value={fIU.bairro} onChange={e => setFIU(p => ({ ...p, bairro: e.target.value }))} />
                    </div>
                    <div style={{ gridColumn: "span 2" }}>
                      <label style={lbl}>Município</label>
                      <input style={inp} value={fIU.municipio} onChange={e => setFIU(p => ({ ...p, municipio: e.target.value }))} />
                    </div>
                    <div>
                      <label style={lbl}>UF</label>
                      <select style={inp} value={fIU.estado} onChange={e => setFIU(p => ({ ...p, estado: e.target.value }))}>
                        {["AC","AL","AP","AM","BA","CE","DF","ES","GO","MA","MT","MS","MG","PA","PB","PR","PE","PI","RJ","RN","RS","RO","RR","SC","SP","SE","TO"].map(uf => <option key={uf} value={uf}>{uf}</option>)}
                      </select>
                    </div>
                    <div style={{ gridColumn: "1/-1" }}><hr style={{ border: "none", borderTop: "0.5px solid #DDE2EE", margin: "4px 0 6px" }} /></div>
                    <div style={{ gridColumn: "span 3" }}>
                      <label style={lbl}>Valor de Avaliação (R$)</label>
                      <InputMonetario style={inp} value={fIU.valor_avaliacao} onChange={v => setFIU(p => ({ ...p, valor_avaliacao: String(v) }))} />
                    </div>
                    <div style={{ gridColumn: "1/-1" }}>
                      <label style={lbl}>Observações</label>
                      <textarea style={{ ...inp, height: 60, resize: "vertical" }} value={fIU.observacao} onChange={e => setFIU(p => ({ ...p, observacao: e.target.value }))} placeholder="Laudo de avaliação, matrícula com ônus, etc." />
                    </div>
                  </div>
                  <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 20 }}>
                    <button style={btnR} onClick={() => setModalIU(false)}>Cancelar</button>
                    <button style={btnV} onClick={async () => {
                      if (!fIU.descricao.trim()) { alert("Informe a descrição do imóvel."); return; }
                      const payload = { fazenda_id: fazendaId!, matricula: fIU.matricula || undefined, tipo: fIU.tipo, descricao: fIU.descricao.trim(), logradouro: fIU.logradouro || undefined, numero_end: fIU.numero_end || undefined, complemento: fIU.complemento || undefined, bairro: fIU.bairro || undefined, cep: fIU.cep || undefined, municipio: fIU.municipio || undefined, estado: fIU.estado, area_m2: fIU.area_m2 ? Number(fIU.area_m2) : undefined, valor_avaliacao: fIU.valor_avaliacao ? Number(fIU.valor_avaliacao) : undefined, observacao: fIU.observacao || undefined };
                      if (editIU) {
                        await atualizarImovelUrbano(editIU.id, payload);
                        setImoveisUrbanos(p => p.map(x => x.id === editIU.id ? { ...x, ...payload } : x));
                      } else {
                        const n = await criarImovelUrbano(payload);
                        setImoveisUrbanos(p => [...p, n]);
                      }
                      setModalIU(false);
                    }}>Salvar</button>
                  </div>
                </Modal>
              )}
            </div>
          )}

          {/* ══════════════════════════════════════════════════════════════════
              ABA — PRINCÍPIOS ATIVOS (BOT + NF de Entrada)
          ══════════════════════════════════════════════════════════════════ */}
          {aba === "principios_ativos" && (() => {
            const CATEGORIAS_PA: PrincipioAtivo["categoria"][] = ["herbicida","fungicida","inseticida","acaricida","fertilizante","inoculante","outro"];
            const COR_CAT: Record<string, { bg: string; color: string }> = {
              herbicida:    { bg: "#DCF5E8", color: "#14532D" },
              fungicida:    { bg: "#D5E8F5", color: "#0B2D50" },
              inseticida:   { bg: "#FBF3E0", color: "#7A5A12" },
              acaricida:    { bg: "#F5E8F5", color: "#5B1B8A" },
              fertilizante: { bg: "#E8F5DC", color: "#2D5314" },
              inoculante:   { bg: "#DCF5F0", color: "#0B4D3A" },
              outro:        { bg: "#F4F6FA", color: "#555"    },
            };

            const paFiltrados = principios
              .filter(p => !paCategoria || p.categoria === paCategoria)
              .filter(p => !paBusca || p.nome.toLowerCase().includes(paBusca.toLowerCase()));

            const ncsPorPA = (paId: string) => nomesComerciais.filter(n => n.principio_ativo_id === paId);

            const preCarregarPA = async () => {
              if (!confirm("Isso irá adicionar os princípios ativos registrados no MAPA + principais nomes comerciais usados no Brasil. Continuar?")) return;
              setSalvandoPA(true);
              try {
                const precarga: Array<{ nome: string; categoria: PrincipioAtivo["categoria"]; unidade: PrincipioAtivo["unidade"]; nomes: string[] }> = [
                  // Herbicidas
                  { nome: "Glifosato 480 g/L",       categoria: "herbicida",    unidade: "L",  nomes: ["Eficaz","Roundup Transorb","Roundup Original","Zapp Qi 480","Trop","Glifosato Nortox","Roundup WG","Kilo","GT Plus","Agrisato"] },
                  { nome: "Glifosato 720 g/L",        categoria: "herbicida",    unidade: "L",  nomes: ["Roundup Original DI","Roundup Ultramax","Zapp Qi 620"] },
                  { nome: "Atrazina 500 g/L",         categoria: "herbicida",    unidade: "L",  nomes: ["Gesaprim 500","Atrazina Nortox","Primoleo","Atranex"] },
                  { nome: "Clomazone 500 g/L",        categoria: "herbicida",    unidade: "L",  nomes: ["Gamit 360","Clomazone Nortox","Range"] },
                  { nome: "Haloxifope-P 120 g/L",     categoria: "herbicida",    unidade: "L",  nomes: ["Verdict","Haloxifope Nortox"] },
                  { nome: "Imazetapir 100 g/L",       categoria: "herbicida",    unidade: "L",  nomes: ["Pivot H","Imazo","Imazetapir Nortox"] },
                  { nome: "Lactofen 240 g/L",         categoria: "herbicida",    unidade: "L",  nomes: ["Cobra","Lactofen Nortox"] },
                  { nome: "Diclosulam 840 g/kg",      categoria: "herbicida",    unidade: "kg", nomes: ["Spider","Diclosulam Nortox"] },
                  { nome: "Flumioxazina 500 g/kg",    categoria: "herbicida",    unidade: "kg", nomes: ["Flumyzin 500","Stag"] },
                  { nome: "Clorimurom-etílico 250 g/kg", categoria: "herbicida", unidade: "kg", nomes: ["Classic","Clorimurom Nortox"] },
                  { nome: "S-Metolacloro 960 g/L",    categoria: "herbicida",    unidade: "L",  nomes: ["Dual Gold","Pampa Gold"] },
                  // Fungicidas
                  { nome: "Azoxistrobina+Ciproconazol 200+80 g/L", categoria: "fungicida", unidade: "L", nomes: ["Priori Xtra","Opera Ultra","Cypress","Ativum"] },
                  { nome: "Piraclostrobina+Epoxiconazol 133+50 g/L", categoria: "fungicida", unidade: "L", nomes: ["Opera","Fusão"] },
                  { nome: "Carbendazim 500 g/L",      categoria: "fungicida",    unidade: "L",  nomes: ["Derosal 500","Benzamin","Carbendazim Nortox"] },
                  { nome: "Tebuconazol 200 g/L",      categoria: "fungicida",    unidade: "L",  nomes: ["Folicur","Triade","Tebuconazol Nortox","Elite"] },
                  { nome: "Mancozebe 800 g/kg",       categoria: "fungicida",    unidade: "kg", nomes: ["Manzate 800","Dithane NT","Unizeb Gold"] },
                  { nome: "Trifloxistrobina+Protioconazol 150+175 g/L", categoria: "fungicida", unidade: "L", nomes: ["Fox","Fox Xpro"] },
                  { nome: "Fluxapiroxade+Piraclostrobina 50+100 g/L", categoria: "fungicida", unidade: "L", nomes: ["Orkestra SC"] },
                  { nome: "Benzovindiflupir+Azoxistrobina 75+300 g/kg", categoria: "fungicida", unidade: "kg", nomes: ["Elatus"] },
                  // Inseticidas
                  { nome: "Imidacloprido 700 g/kg",   categoria: "inseticida",   unidade: "kg", nomes: ["Gaucho 700","Imidacloprid Nortox","Nipsit Inside"] },
                  { nome: "Lambdacialotrina 50 g/L",  categoria: "inseticida",   unidade: "L",  nomes: ["Karate Zeon","Karis","Lambda-Cy","Kaiso"] },
                  { nome: "Tiametoxam 250 g/L",       categoria: "inseticida",   unidade: "L",  nomes: ["Actara","Engeo Pleno S"] },
                  { nome: "Clorpirifós 480 g/L",      categoria: "inseticida",   unidade: "L",  nomes: ["Lorsban 480 BR","Clorpirifós Nortox","Pirinex"] },
                  { nome: "Acefato 750 g/kg",         categoria: "inseticida",   unidade: "kg", nomes: ["Orthene 750","Acefato Nortox","Staron"] },
                  { nome: "Metamidofós 600 g/L",      categoria: "inseticida",   unidade: "L",  nomes: ["Hamidop","Tamaron BR","Metamidofós Nortox"] },
                  { nome: "Beta-Ciflutrina+Imidacloprido 12.5+100 g/L", categoria: "inseticida", unidade: "L", nomes: ["Connect"] },
                  { nome: "Espinosade 480 g/L",       categoria: "inseticida",   unidade: "L",  nomes: ["Tracer","Spinoace"] },
                  // Acaricidas
                  { nome: "Abamectina 18 g/L",        categoria: "acaricida",    unidade: "L",  nomes: ["Vertimec","Avert","Abamex"] },
                  { nome: "Espirodiclofeno 240 g/L",  categoria: "acaricida",    unidade: "L",  nomes: ["Envidor"] },
                  // Fertilizantes foliares
                  { nome: "Boro 150 g/L",             categoria: "fertilizante", unidade: "L",  nomes: ["Borogran","Solubor","Bórax Nortox"] },
                  { nome: "Molibdênio+Cobalto",       categoria: "fertilizante", unidade: "L",  nomes: ["CoMo","Vital Micro","Metalosate Combi"] },
                  // Inoculantes
                  { nome: "Bradyrhizobium japonicum",  categoria: "inoculante",  unidade: "L",  nomes: ["Masterfix Soja","Nitrobacter","Cell Tech","Gelfix Super"] },
                  { nome: "Azospirillum brasilense",   categoria: "inoculante",  unidade: "L",  nomes: ["Nitragin AZ","Masterfix Gramíneas"] },
                ];
                for (const item of precarga) {
                  let pa: PrincipioAtivo;
                  const existente = principios.find(p => p.nome === item.nome);
                  if (existente) {
                    pa = existente;
                  } else {
                    pa = await criarPrincipioAtivo({ nome: item.nome, categoria: item.categoria, unidade: item.unidade });
                  }
                  for (const nc of item.nomes) {
                    const jaExiste = nomesComerciais.find(n => n.nome_comercial.toLowerCase() === nc.toLowerCase());
                    if (!jaExiste) {
                      await salvarNomeComercial({ nome_comercial: nc, principio_ativo_id: pa.id, confirmado: true });
                    }
                  }
                }
                const [pas, ncs] = await Promise.all([listarPrincipiosAtivos(), listarNomesComerciais()]);
                setPrincipios(pas);
                setNomesComerciais(ncs);
              } catch(e: unknown) { alert((e as Error).message); }
              finally { setSalvandoPA(false); }
            };

            return (
              <div>
                {/* Cabeçalho */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16, gap: 12, flexWrap: "wrap" }}>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 14, color: "#1a1a1a" }}>
                      Princípios Ativos
                      <span style={{ fontSize: 11, color: "#555", fontWeight: 400, marginLeft: 6 }}>
                        ({principios.length} cadastrados · {nomesComerciais.length} nomes comerciais mapeados)
                      </span>
                    </div>
                    <div style={{ fontSize: 11, color: "#666", marginTop: 2 }}>
                      Mapeamento nome comercial → princípio ativo. Usado pelo BOT e na entrada de NF para deduzir o estoque correto.
                      Sementes <strong>não</strong> usam este mapeamento — cada variedade é um produto distinto.
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button style={{ ...btnV, background: "#F4F6FA", color: "#555", border: "0.5px solid #D4DCE8" }}
                      onClick={preCarregarPA} disabled={salvandobotPA}>
                      {salvandobotPA ? "Carregando..." : "Pré-carregar (MAPA)"}
                    </button>
                    <button style={btnV} onClick={() => { setEditPA(null); setFPA({ nome: "", categoria: "herbicida", unidade: "L", observacao: "" }); setModalPA(true); }}>
                      + Novo Princípio Ativo
                    </button>
                  </div>
                </div>

                {/* Filtros */}
                <div style={{ display: "flex", gap: 10, marginBottom: 14, flexWrap: "wrap" }}>
                  <input
                    placeholder="Buscar por nome..."
                    value={paBusca} onChange={e => setPaBusca(e.target.value)}
                    style={{ ...inp, width: 240, fontSize: 12, padding: "6px 10px" }}
                  />
                  <select value={paCategoria} onChange={e => setPaCategoria(e.target.value)} style={{ ...inp, fontSize: 12, padding: "6px 10px" }}>
                    <option value="">Todas as categorias</option>
                    {CATEGORIAS_PA.map(c => <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>)}
                  </select>
                </div>

                {/* Lista */}
                {paFiltrados.length === 0 ? (
                  <div style={{ textAlign: "center", padding: "56px 0", color: "#888", fontSize: 13 }}>
                    {principios.length === 0
                      ? <span>Nenhum princípio ativo cadastrado. Clique em <strong>Pré-carregar (MAPA)</strong> para adicionar os defensivos registrados no Brasil.</span>
                      : "Nenhum resultado para os filtros selecionados"}
                  </div>
                ) : (
                  <div style={{ border: "0.5px solid #D4DCE8", borderRadius: 12, overflow: "hidden" }}>
                    {paFiltrados.map((pa, idx) => {
                      const cor = COR_CAT[pa.categoria] ?? COR_CAT.outro;
                      const ncs = ncsPorPA(pa.id);
                      const expandido = paExpandido === pa.id;
                      return (
                        <div key={pa.id} style={{ borderBottom: idx < paFiltrados.length - 1 ? "0.5px solid #EEF1F7" : "none" }}>
                          {/* Linha principal */}
                          <div style={{ display: "flex", alignItems: "center", padding: "10px 14px", background: expandido ? "#F8FAFB" : idx % 2 === 0 ? "#fff" : "#FAFBFD", gap: 12 }}>
                            <button
                              onClick={() => setPaExpandido(expandido ? null : pa.id)}
                              style={{ background: "none", border: "none", cursor: "pointer", fontSize: 14, color: "#888", width: 20, flexShrink: 0 }}>
                              {expandido ? "▼" : "▶"}
                            </button>
                            <div style={{ flex: 1, fontWeight: 600, color: "#1a1a1a", fontSize: 13 }}>{pa.nome}</div>
                            <span style={{ ...cor, borderRadius: 6, padding: "2px 10px", fontSize: 11, fontWeight: 600 }}>{pa.categoria}</span>
                            <span style={{ background: "#F4F6FA", color: "#555", borderRadius: 6, padding: "2px 8px", fontSize: 11, fontWeight: 600 }}>{pa.unidade}</span>
                            <span style={{ fontSize: 11, color: "#888" }}>
                              {ncs.length} {ncs.length === 1 ? "nome" : "nomes"}
                            </span>
                            <button style={btnX} onClick={() => setModalNC(pa.id)}>+ Nome Comercial</button>
                            <button style={btnX} onClick={() => {
                              setEditPA(pa);
                              setFPA({ nome: pa.nome, categoria: pa.categoria, unidade: pa.unidade, observacao: pa.observacao ?? "" });
                              setModalPA(true);
                            }}>Editar</button>
                            <button style={{ ...btnX, color: "#E24B4A" }} onClick={async () => {
                              if (!confirm(`Excluir "${pa.nome}" e todos os seus nomes comerciais?`)) return;
                              await excluirPrincipioAtivo(pa.id);
                              setPrincipios(x => x.filter(r => r.id !== pa.id));
                              setNomesComerciais(x => x.filter(r => r.principio_ativo_id !== pa.id));
                            }}>Excluir</button>
                          </div>

                          {/* Nomes comerciais expandidos */}
                          {expandido && (
                            <div style={{ background: "#F4F6FA", borderTop: "0.5px solid #E5E9F2", padding: "10px 14px 14px 48px" }}>
                              {ncs.length === 0 ? (
                                <div style={{ fontSize: 12, color: "#888", fontStyle: "italic" }}>
                                  Nenhum nome comercial cadastrado. Clique em "+ Nome Comercial" para adicionar.
                                </div>
                              ) : (
                                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                                  {ncs.map(nc => (
                                    <div key={nc.id} style={{
                                      display: "flex", alignItems: "center", gap: 6,
                                      background: nc.confirmado ? "#fff" : "#FBF3E0",
                                      border: `0.5px solid ${nc.confirmado ? "#D4DCE8" : "#F6C87A"}`,
                                      borderRadius: 8, padding: "4px 10px", fontSize: 12
                                    }}>
                                      <span style={{ fontWeight: 600, color: "#1a1a1a" }}>{nc.nome_comercial}</span>
                                      {!nc.confirmado && <span style={{ fontSize: 10, color: "#C9921B" }}>pendente</span>}
                                      <button
                                        onClick={async () => {
                                          if (!confirm(`Remover "${nc.nome_comercial}"?`)) return;
                                          await excluirNomeComercial(nc.id);
                                          setNomesComerciais(x => x.filter(r => r.id !== nc.id));
                                        }}
                                        style={{ background: "none", border: "none", cursor: "pointer", color: "#E24B4A", fontSize: 14, lineHeight: 1, padding: 0 }}>×</button>
                                    </div>
                                  ))}
                                </div>
                              )}
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

          {/* ══════ ABA: UNIDADES DE MEDIDA ══════ */}
          {aba === "unidades_medida" && (() => {
            const TIPOS_UM: UnidadeMedida["tipo"][] = ["massa","volume","area","comprimento","quantidade","outro"];
            const TIPO_LABEL: Record<UnidadeMedida["tipo"], string> = {
              massa:       "Massa",
              volume:      "Volume",
              area:        "Área",
              comprimento: "Comprimento",
              quantidade:  "Quantidade",
              outro:       "Outro",
            };
            const TIPO_COR: Record<UnidadeMedida["tipo"], { bg: string; color: string }> = {
              massa:       { bg: "#D5E8F5", color: "#0B2D50" },
              volume:      { bg: "#DCF5F0", color: "#0B4D3A" },
              area:        { bg: "#DCF5E8", color: "#14532D" },
              comprimento: { bg: "#FBF3E0", color: "#7A5A12" },
              quantidade:  { bg: "#F4F6FA", color: "#555"    },
              outro:       { bg: "#F0F2F7", color: "#888"    },
            };

            const umFiltradas = unidades.filter(u => {
              if (umTipo && u.tipo !== umTipo) return false;
              if (umBusca) {
                const b = umBusca.toLowerCase();
                return u.sigla.toLowerCase().includes(b) || u.nome.toLowerCase().includes(b);
              }
              return true;
            });

            const abrirNovaUM = () => {
              setEditUM(null);
              setFUM({ sigla: "", nome: "", tipo: "quantidade", fator_base: "", base_sigla: "", inativo: false });
              setModalUM(true);
            };
            const abrirEditarUM = (u: UnidadeMedida) => {
              setEditUM(u);
              setFUM({ sigla: u.sigla, nome: u.nome, tipo: u.tipo, fator_base: u.fator_base != null ? String(u.fator_base) : "", base_sigla: u.base_sigla ?? "", inativo: u.inativo ?? false });
              setModalUM(true);
            };
            const excluirUM = async (id: string) => {
              if (!confirm("Excluir esta unidade de medida? Ela pode estar em uso em insumos e NFs.")) return;
              await supabase.from("unidades_medida").delete().eq("id", id);
              setUnidades(x => x.filter(u => u.id !== id));
            };

            // Agrupar por tipo para exibição
            const porTipo = TIPOS_UM.map(t => ({
              tipo: t,
              label: TIPO_LABEL[t],
              cor: TIPO_COR[t],
              items: umFiltradas.filter(u => u.tipo === t),
            })).filter(g => g.items.length > 0);

            return (
              <div>
                {/* Cabeçalho */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16, gap: 12, flexWrap: "wrap" }}>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 14, color: "#1a1a1a" }}>
                      Unidades de Medida
                      <span style={{ fontSize: 11, color: "#555", fontWeight: 400, marginLeft: 6 }}>
                        ({unidades.length} cadastradas · compartilhadas com todos os clientes)
                      </span>
                    </div>
                    <div style={{ fontSize: 11, color: "#666", marginTop: 2 }}>
                      Usadas em insumos, produtos, notas fiscais e operações. Alterações aqui refletem imediatamente para todos.
                    </div>
                  </div>
                  <button style={btnV} onClick={abrirNovaUM}>+ Nova Unidade</button>
                </div>

                {/* Filtros */}
                <div style={{ display: "flex", gap: 10, marginBottom: 14, flexWrap: "wrap", alignItems: "center" }}>
                  <input placeholder="Buscar sigla ou nome…" value={umBusca} onChange={e => setUmBusca(e.target.value)}
                    style={{ ...inp, width: 220, fontSize: 12, padding: "6px 10px" }} />
                  <select value={umTipo} onChange={e => setUmTipo(e.target.value)}
                    style={{ ...inp, width: 160, fontSize: 12, padding: "6px 10px" }}>
                    <option value="">Todos os tipos</option>
                    {TIPOS_UM.map(t => <option key={t} value={t}>{TIPO_LABEL[t]}</option>)}
                  </select>
                  <span style={{ fontSize: 11, color: "#888" }}>{umFiltradas.length} resultado(s)</span>
                </div>

                {/* Tabela agrupada por tipo */}
                {unidades.length === 0 ? (
                  <div style={{ textAlign: "center", padding: "48px 0", color: "#888" }}>
                    <div style={{ fontSize: 14, marginBottom: 8 }}>Nenhuma unidade cadastrada</div>
                    <div style={{ fontSize: 12, marginBottom: 16 }}>Execute a migration no Supabase para carregar as unidades padrão.</div>
                    <button style={btnV} onClick={abrirNovaUM}>+ Cadastrar primeira unidade</button>
                  </div>
                ) : porTipo.length === 0 ? (
                  <div style={{ textAlign: "center", padding: 32, color: "#888", fontSize: 13 }}>Nenhum resultado para o filtro aplicado.</div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                    {porTipo.map(grupo => (
                      <div key={grupo.tipo} style={{ background: "#fff", border: "0.5px solid #D4DCE8", borderRadius: 10, overflow: "hidden" }}>
                        {/* Header do grupo */}
                        <div style={{ background: grupo.cor.bg, padding: "8px 14px", display: "flex", alignItems: "center", gap: 8, borderBottom: "0.5px solid #D4DCE8" }}>
                          <span style={{ fontSize: 12, fontWeight: 700, color: grupo.cor.color, textTransform: "uppercase", letterSpacing: "0.05em" }}>{grupo.label}</span>
                          <span style={{ fontSize: 11, color: grupo.cor.color, opacity: 0.7 }}>({grupo.items.length})</span>
                        </div>
                        {/* Tabela de itens */}
                        <table style={{ width: "100%", borderCollapse: "collapse" }}>
                          <thead>
                            <tr style={{ background: "#FAFBFC" }}>
                              {["Sigla", "Nome", "Conversão", "Status", ""].map((h, i) => (
                                <th key={i} style={{ padding: "7px 14px", textAlign: i >= 3 ? "center" : "left", fontSize: 10, fontWeight: 600, color: "#888", borderBottom: "0.5px solid #EEF1F6" }}>{h}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {grupo.items.map(u => (
                              <tr key={u.id} style={{ borderBottom: "0.5px solid #F0F2F7", background: u.inativo ? "#FAFAFA" : "white" }}>
                                <td style={{ padding: "8px 14px" }}>
                                  <span style={{ fontFamily: "monospace", fontSize: 13, fontWeight: 700, color: u.inativo ? "#aaa" : "#1A4870", background: "#EEF5FD", padding: "2px 8px", borderRadius: 5 }}>
                                    {u.sigla}
                                  </span>
                                </td>
                                <td style={{ padding: "8px 14px", fontSize: 13, color: u.inativo ? "#aaa" : "#1a1a1a" }}>
                                  {u.nome}
                                  {u.inativo && <span style={{ marginLeft: 8, fontSize: 9, background: "#F3F3F3", color: "#999", padding: "1px 5px", borderRadius: 4, fontWeight: 600 }}>INATIVO</span>}
                                </td>
                                <td style={{ padding: "8px 14px", fontSize: 11, color: "#555" }}>
                                  {u.fator_base != null && u.base_sigla
                                    ? `1 ${u.sigla} = ${u.fator_base} ${u.base_sigla}`
                                    : <span style={{ color: "#ccc" }}>—</span>}
                                </td>
                                <td style={{ padding: "8px 14px", textAlign: "center" }}>
                                  {u.inativo
                                    ? <span style={{ fontSize: 10, background: "#F3F3F3", color: "#888", padding: "2px 7px", borderRadius: 8 }}>Inativo</span>
                                    : <span style={{ fontSize: 10, background: "#DCF5E8", color: "#14532D", padding: "2px 7px", borderRadius: 8 }}>Ativo</span>}
                                </td>
                                <td style={{ padding: "8px 10px", textAlign: "right", whiteSpace: "nowrap" }}>
                                  <button onClick={() => abrirEditarUM(u)} style={{ fontSize: 11, padding: "3px 10px", border: "0.5px solid #D4DCE8", borderRadius: 6, background: "transparent", color: "#555", cursor: "pointer", marginRight: 4 }}>
                                    Editar
                                  </button>
                                  <button onClick={() => excluirUM(u.id)} style={{ fontSize: 11, padding: "3px 8px", border: "0.5px solid #E24B4A50", borderRadius: 6, background: "transparent", color: "#E24B4A", cursor: "pointer" }}>
                                    ✕
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })()}

          {aba === "culturas" && (() => {
            const CAT_LABEL: Record<string, string> = {
              graos:     "Grãos",
              fibra:     "Fibra",
              hortifruti:"Hortifrúti",
              pastagem:  "Pastagem",
              cobertura: "Cobertura de Solo",
              outro:     "Outro",
            };
            const CAT_COR: Record<string, { bg: string; color: string }> = {
              graos:     { bg: "#D5E8F5", color: "#0B2D50"  },
              fibra:     { bg: "#FBF3E0", color: "#7A5A12"  },
              hortifruti:{ bg: "#DCF5E8", color: "#14532D"  },
              pastagem:  { bg: "#EAFFE6", color: "#166534"  },
              cobertura: { bg: "#F0F2F7", color: "#444"     },
              outro:     { bg: "#F4F6FA", color: "#888"     },
            };
            const UN_LABEL: Record<string, string> = { sc: "Saca (60 kg)", "@": "Arroba (15 kg)", kg: "Quilograma", t: "Tonelada", cx: "Caixa", fardo: "Fardo", outro: "Outro" };

            const filtradas = culturasList.filter(c =>
              !culturaBusca || c.nome.toLowerCase().includes(culturaBusca.toLowerCase())
            );

            // Fator padrão por unidade
            const fatorPorUnidade = (un: string): string => {
              if (un === "@") return "15";
              if (un === "kg") return "1";
              if (un === "t")  return "1000";
              return "60";
            };

            const abrirModal = (c?: CulturaItem) => {
              if (c) {
                setEditCultura(c);
                setFCultura({
                  nome: c.nome, categoria: c.categoria, unidade: c.unidade,
                  ncm: c.ncm ?? "", observacao: c.observacao ?? "", ativa: c.ativa,
                  ordem: c.ordem != null ? String(c.ordem) : "",
                  fator_conversao_kg: c.fator_conversao_kg != null ? String(c.fator_conversao_kg) : fatorPorUnidade(c.unidade),
                });
              } else {
                setEditCultura(null);
                setFCultura({ nome: "", categoria: "graos", unidade: "sc", ncm: "", observacao: "", ativa: true, ordem: "", fator_conversao_kg: "60" });
              }
              setModalCultura(true);
            };

            const salvar = async () => {
              if (!fCultura.nome.trim()) { alert("Nome obrigatório"); return; }
              setSalvandoCultura(true);
              const payload = {
                fazenda_id:          fazendaId,
                nome:                fCultura.nome.trim(),
                categoria:           fCultura.categoria,
                unidade:             fCultura.unidade,
                ncm:                 fCultura.ncm.trim() || null,
                observacao:          fCultura.observacao.trim() || null,
                ativa:               fCultura.ativa,
                ordem:               fCultura.ordem !== "" ? parseInt(fCultura.ordem) : null,
                fator_conversao_kg:  parseFloat(fCultura.fator_conversao_kg) || 60,
              };
              if (editCultura) {
                await supabase.from("culturas").update(payload).eq("id", editCultura.id);
              } else {
                await supabase.from("culturas").insert(payload);
              }
              const { data } = await supabase.from("culturas").select("*").eq("fazenda_id", fazendaId).order("ordem").order("nome");
              setCulturasList((data ?? []) as CulturaItem[]);
              setModalCultura(false);
              setSalvandoCultura(false);
            };

            const excluir = async (id: string) => {
              if (!confirm("Excluir esta cultura?")) return;
              await supabase.from("culturas").delete().eq("id", id);
              setCulturasList(prev => prev.filter(c => c.id !== id));
            };

            return (
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <input style={{ ...inp, width: 260 }} placeholder="Buscar cultura…" value={culturaBusca} onChange={e => setCulturaBusca(e.target.value)} />
                    <span style={{ fontSize: 12, color: "#888" }}>{filtradas.length} cultura{filtradas.length !== 1 ? "s" : ""}</span>
                  </div>
                  <button style={{ ...btnV, background: "#1A4870" }} onClick={() => abrirModal()}>+ Nova Cultura</button>
                </div>

                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                  <thead>
                    <tr style={{ borderBottom: "0.5px solid #DDE2EE" }}>
                      {["Nome","Categoria","Unidade","NCM","Ordem","Status",""].map((h, i) => (
                        <th key={i} style={{ textAlign: i === 6 ? "right" : "left", padding: "6px 10px", fontSize: 11, color: "#888", fontWeight: 600 }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filtradas.length === 0 && (
                      <tr><td colSpan={7} style={{ textAlign: "center", padding: 32, color: "#888", fontSize: 13 }}>
                        Nenhuma cultura cadastrada. Clique em "Nova Cultura" para começar.
                      </td></tr>
                    )}
                    {filtradas.map(c => {
                      const cc = CAT_COR[c.categoria] ?? CAT_COR.outro;
                      return (
                        <tr key={c.id} style={{ borderBottom: "0.5px solid #F0F2F7" }}>
                          <td style={{ padding: "10px 10px", fontWeight: 600 }}>{c.nome}</td>
                          <td style={{ padding: "10px 10px" }}>
                            <span style={{ fontSize: 11, background: cc.bg, color: cc.color, padding: "2px 8px", borderRadius: 8, fontWeight: 600 }}>
                              {CAT_LABEL[c.categoria] ?? c.categoria}
                            </span>
                          </td>
                          <td style={{ padding: "10px 10px", color: "#555" }}>{UN_LABEL[c.unidade] ?? c.unidade}</td>
                          <td style={{ padding: "10px 10px", color: "#888", fontFamily: "monospace", fontSize: 12 }}>{c.ncm || "—"}</td>
                          <td style={{ padding: "10px 10px", color: "#888", textAlign: "center" }}>{c.ordem ?? "—"}</td>
                          <td style={{ padding: "10px 10px" }}>
                            {c.ativa
                              ? <span style={{ fontSize: 11, background: "#EAFFE6", color: "#14532D", padding: "2px 8px", borderRadius: 8 }}>Ativa</span>
                              : <span style={{ fontSize: 11, background: "#F4F6FA", color: "#888", padding: "2px 8px", borderRadius: 8 }}>Inativa</span>}
                          </td>
                          <td style={{ padding: "10px 10px", textAlign: "right" }}>
                            <button style={btnE} onClick={() => abrirModal(c)}>Editar</button>
                            {" "}
                            <button style={btnX} onClick={() => excluir(c.id)}>Excluir</button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>

                {modalCultura && (
                  <div style={{ position: "fixed", inset: 0, background: "rgba(11,45,80,0.28)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }}>
                    <div style={{ background: "#fff", borderRadius: 12, padding: 32, width: 560, maxHeight: "90vh", overflowY: "auto" }}>
                      <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 4 }}>{editCultura ? "Editar Cultura" : "Nova Cultura"}</div>
                      <div style={{ fontSize: 12, color: "#888", marginBottom: 20 }}>Culturas disponíveis nos ciclos de safra</div>

                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 16 }}>
                        <div style={{ gridColumn: "1/-1" }}>
                          <label style={lbl}>Nome *</label>
                          <input style={inp} value={fCultura.nome} onChange={e => setFCultura(p => ({ ...p, nome: e.target.value }))} placeholder="Ex: Soja, Milho 2ª, Algodão…" autoFocus />
                        </div>
                        <div>
                          <label style={lbl}>Categoria *</label>
                          <select style={inp} value={fCultura.categoria} onChange={e => setFCultura(p => ({ ...p, categoria: e.target.value }))}>
                            <option value="graos">Grãos</option>
                            <option value="fibra">Fibra</option>
                            <option value="hortifruti">Hortifrúti</option>
                            <option value="pastagem">Pastagem</option>
                            <option value="cobertura">Cobertura de Solo</option>
                            <option value="outro">Outro</option>
                          </select>
                        </div>
                        <div>
                          <label style={lbl}>Unidade de Medida *</label>
                          <select style={inp} value={fCultura.unidade} onChange={e => setFCultura(p => ({ ...p, unidade: e.target.value }))}>
                            <option value="sc">Saca (60 kg)</option>
                            <option value="@">Arroba (15 kg)</option>
                            <option value="kg">Quilograma</option>
                            <option value="t">Tonelada</option>
                            <option value="cx">Caixa</option>
                            <option value="fardo">Fardo</option>
                            <option value="outro">Outro</option>
                          </select>
                        </div>
                        <div>
                          <label style={lbl}>NCM</label>
                          <input style={inp} value={fCultura.ncm} onChange={e => setFCultura(p => ({ ...p, ncm: e.target.value }))} placeholder="Ex: 1201.10.00" maxLength={10} />
                        </div>
                        <div>
                          <label style={lbl}>Ordem de exibição</label>
                          <InputNumerico style={inp} decimais={0} value={fCultura.ordem} onChange={v => setFCultura(p => ({ ...p, ordem: v }))} placeholder="1, 2, 3…" />
                        </div>
                        <div style={{ gridColumn: "1/-1" }}>
                          <label style={lbl}>Fator de conversão (kg ÷ fator = unidade comercial)</label>
                          <InputNumerico style={inp} decimais={3} value={fCultura.fator_conversao_kg}
                            onChange={v => setFCultura(p => ({ ...p, fator_conversao_kg: v }))}
                            placeholder="60 = sc, 15 = @, 1 = kg" />
                          <div style={{ fontSize: 11, color: "#888", marginTop: 3 }}>Soja/Milho = 60 · Algodão = 15 · kg puro = 1</div>
                        </div>
                        <div style={{ gridColumn: "1/-1" }}>
                          <label style={lbl}>Observação</label>
                          <input style={inp} value={fCultura.observacao} onChange={e => setFCultura(p => ({ ...p, observacao: e.target.value }))} />
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <input type="checkbox" checked={fCultura.ativa} onChange={e => setFCultura(p => ({ ...p, ativa: e.target.checked }))} id="culturaAtiva" />
                          <label htmlFor="culturaAtiva" style={{ fontSize: 13, cursor: "pointer" }}>Cultura ativa (aparece nos ciclos)</label>
                        </div>
                      </div>

                      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 8 }}>
                        <button style={btnR} onClick={() => setModalCultura(false)}>Cancelar</button>
                        <button style={{ ...btnV, background: "#1A4870", opacity: salvandoCultura ? 0.6 : 1 }} onClick={salvar} disabled={salvandoCultura}>
                          {salvandoCultura ? "Salvando…" : editCultura ? "Salvar alterações" : "Criar cultura"}
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })()}

        </div>
      </main>

      {/* ══════ MODAIS ══════ */}

      {/* Modal Conta Bancária */}
      {modalConta && (
        <Modal titulo={editConta ? "Editar Conta Bancária" : "Nova Conta Bancária"} onClose={() => setModalConta(false)} width={720}>
          {(() => {
            const bancoDados = bancos.find(b => b.id === fConta.banco_id);
            const fmtCnpj = (s: string) => s.length === 14 ? `${s.slice(0,2)}.${s.slice(2,5)}.${s.slice(5,8)}/${s.slice(8,12)}-${s.slice(12)}` : s;
            return (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14, marginBottom: 14 }}>

                {/* Nome */}
                <div style={{ gridColumn: "1 / -1" }}>
                  <label style={lbl}>Nome / Apelido *</label>
                  <input style={inp} placeholder="Ex: Bradesco PJ Rural, Sicredi Conta Movimento" value={fConta.nome} onChange={e => setFConta(p => ({ ...p, nome: e.target.value }))} />
                </div>

                {/* Empresa */}
                {empresas.length > 0 && (
                  <div style={{ gridColumn: "1 / -1" }}>
                    <label style={lbl}>Empresa vinculada</label>
                    <select style={inp} value={fConta.empresa_id} onChange={e => setFConta(p => ({ ...p, empresa_id: e.target.value }))}>
                      <option value="">— Sem vínculo (fazenda) —</option>
                      {empresas.map(e => <option key={e.id} value={e.id}>{e.razao_social ?? e.nome ?? e.id}</option>)}
                    </select>
                  </div>
                )}

                {/* Banco select */}
                <div style={{ gridColumn: "1 / 3" }}>
                  <label style={lbl}>Banco *</label>
                  <select style={inp} value={fConta.banco_id}
                    onChange={e => {
                      const b = bancos.find(x => x.id === e.target.value);
                      setFConta(p => ({ ...p, banco_id: e.target.value, banco: b?.nome_curto ?? "" }));
                    }}>
                    <option value="">— Selecione o banco —</option>
                    {bancos.map(b => (
                      <option key={b.id} value={b.id}>{b.codigo_compe} · {b.nome_curto} — {b.nome}</option>
                    ))}
                  </select>
                </div>

                {/* Código COMPE */}
                <div>
                  <label style={lbl}>Cód. COMPE</label>
                  <input style={{ ...inp, background: "#F4F6FA", color: "#555", cursor: "default" }} readOnly
                    value={bancoDados?.codigo_compe ?? "—"} />
                </div>

                {/* CNPJ do banco */}
                {bancoDados && (
                  <div style={{ gridColumn: "1 / -1" }}>
                    <label style={lbl}>CNPJ do Banco</label>
                    <input style={{ ...inp, background: "#F4F6FA", color: "#555", cursor: "default" }} readOnly
                      value={fmtCnpj(bancoDados.cnpj)} />
                  </div>
                )}

                {/* Agência + DV + Conta + DV */}
                <div style={{ gridColumn: "1 / -1", display: "grid", gridTemplateColumns: "2fr 1fr 2fr 1fr", gap: 10 }}>
                  <div>
                    <label style={lbl}>Agência</label>
                    <input style={inp} placeholder="0000" value={fConta.agencia}
                      onChange={e => setFConta(p => ({ ...p, agencia: e.target.value.replace(/\D/g, "") }))} maxLength={6} />
                  </div>
                  <div>
                    <label style={lbl}>Dígito Ag.</label>
                    <input style={inp} placeholder="0" value={fConta.agencia_dv}
                      onChange={e => setFConta(p => ({ ...p, agencia_dv: e.target.value.replace(/[^0-9xX]/g, "").slice(0,1) }))} maxLength={1} />
                  </div>
                  <div>
                    <label style={lbl}>Conta</label>
                    <input style={inp} placeholder="000000" value={fConta.conta}
                      onChange={e => setFConta(p => ({ ...p, conta: e.target.value.replace(/\D/g, "") }))} maxLength={12} />
                  </div>
                  <div>
                    <label style={lbl}>Dígito Cta.</label>
                    <input style={inp} placeholder="0" value={fConta.conta_dv}
                      onChange={e => setFConta(p => ({ ...p, conta_dv: e.target.value.replace(/[^0-9xX]/g, "").slice(0,1) }))} maxLength={1} />
                  </div>
                </div>

                {/* Tipo / Saldo / Moeda */}
                <div>
                  <label style={lbl}>Tipo de Conta *</label>
                  <select style={inp} value={fConta.tipo_conta} onChange={e => setFConta(p => ({ ...p, tipo_conta: e.target.value as typeof fConta.tipo_conta }))}>
                    <option value="corrente">Conta Corrente</option>
                    <option value="poupanca">Conta Poupança</option>
                    <option value="investimento">Conta Investimento</option>
                    <option value="caixa">Caixa</option>
                    <option value="transitoria">Transitória</option>
                  </select>
                </div>
                <div>
                  <label style={lbl}>Saldo Inicial (R$)</label>
                  <InputMonetario style={inp} placeholder="0,00" value={fConta.saldo_inicial} onChange={v => setFConta(p => ({ ...p, saldo_inicial: String(v) }))} />
                </div>
                <div>
                  <label style={lbl}>Moeda</label>
                  <select style={inp} value={fConta.moeda} onChange={e => setFConta(p => ({ ...p, moeda: e.target.value as "BRL"|"USD" }))}>
                    <option value="BRL">BRL — Real</option>
                    <option value="USD">USD — Dólar</option>
                  </select>
                </div>

                {/* Ativa */}
                <div style={{ gridColumn: "1 / -1", display: "flex", alignItems: "center", gap: 8 }}>
                  <input type="checkbox" id="contaAtiva" checked={fConta.ativa} onChange={e => setFConta(p => ({ ...p, ativa: e.target.checked }))} />
                  <label htmlFor="contaAtiva" style={{ fontSize: 13, color: "#1a1a1a", cursor: "pointer" }}>Conta ativa</label>
                </div>
              </div>
            );
          })()}

          <div style={{ fontSize: 11, color: "#888", marginBottom: 12 }}>
            Código COMPE e CNPJ são usados automaticamente em <strong>CNAB/Borderô</strong>, <strong>OFX/Conciliação</strong>, <strong>LCDPR</strong> e <strong>SPED ECD</strong>.
          </div>
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 8 }}>
            <button style={btnR} onClick={() => setModalConta(false)}>Cancelar</button>
            <button style={{ ...btnV, opacity: salvando || !fConta.nome.trim() ? 0.5 : 1 }} disabled={salvando || !fConta.nome.trim()}
              onClick={async () => {
                if (!fazendaId) return;
                setSalvando(true);
                try {
                  const saldoIni = fConta.saldo_inicial !== "" ? parseFloat(fConta.saldo_inicial) : 0;
                  const banco = bancos.find(b => b.id === fConta.banco_id);
                  const payload = {
                    fazenda_id: fazendaId,
                    empresa_id: fConta.empresa_id || empresas[0]?.id || null,
                    nome: fConta.nome.trim(),
                    banco_id: fConta.banco_id || null,
                    banco: banco?.nome_curto || fConta.banco || undefined,
                    agencia: fConta.agencia || undefined,
                    agencia_dv: fConta.agencia_dv || null,
                    conta: fConta.conta || undefined,
                    conta_dv: fConta.conta_dv || null,
                    moeda: fConta.moeda,
                    ativa: fConta.ativa,
                    tipo_conta: fConta.tipo_conta,
                    saldo_inicial: isNaN(saldoIni) ? 0 : saldoIni,
                  };
                  if (editConta) {
                    await atualizarContaBancaria(editConta.id, payload);
                    setContas(x => x.map(r => r.id === editConta.id ? { ...r, ...payload } : r));
                  } else {
                    const nova = await criarConta(payload);
                    setContas(x => [...x, nova]);
                  }
                  setModalConta(false);
                } catch (e: unknown) { setErro((e as {message?:string})?.message || JSON.stringify(e)); }
                finally { setSalvando(false); }
              }}>
              {salvando ? "Salvando…" : "Salvar"}
            </button>
          </div>
        </Modal>
      )}

      {/* Modal Produtor */}
      {modalProd && (
        <Modal titulo={editProd ? "Editar Produtor" : "Novo Produtor"} onClose={() => setModalProd(false)} width={960}>
          {/* Abas */}
          <div style={{ display: "flex", gap: 0, borderBottom: "0.5px solid #DDE2EE", marginBottom: 20 }}>
            {([["dados","Dados Cadastrais"],["ies",`Inscrições Estaduais${prodIEs.length > 0 ? ` (${prodIEs.length})` : ""}`]] as [string,string][]).map(([k,l]) => (
              <button key={k} onClick={() => setTabProd(k as "dados"|"ies")} style={{ padding: "8px 18px", fontSize: 13, fontWeight: tabProd === k ? 600 : 400, color: tabProd === k ? "#1A4870" : "#666", background: "none", border: "none", borderBottom: tabProd === k ? "2px solid #1A4870" : "2px solid transparent", cursor: "pointer", marginBottom: -1 }}>{l}</button>
            ))}
          </div>

          {tabProd === "dados" && (<>
            {/* Identificação */}
            <div style={{ fontSize: 11, fontWeight: 600, color: "#1A4870", marginBottom: 8, paddingBottom: 4, borderBottom: "0.5px solid #D4DCE8" }}>Identificação</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14, marginBottom: 16 }}>
              <div style={{ gridColumn: "1/-1" }}><label style={lbl}>Nome completo / Razão Social *</label><input style={inp} value={fProd.nome} onChange={e => setFProd(p => ({ ...p, nome: e.target.value }))} /></div>
              <div>
                <label style={lbl}>Tipo *</label>
                <select style={inp} value={fProd.tipo} onChange={e => setFProd(p => ({ ...p, tipo: e.target.value as "pf"|"pj", cpf_cnpj: "" }))}>
                  <option value="pf">Pessoa Física (CPF)</option>
                  <option value="pj">Pessoa Jurídica (CNPJ)</option>
                </select>
              </div>
              <div><label style={lbl}>{fProd.tipo === "pf" ? "CPF" : "CNPJ"}</label><input style={inp} value={fProd.cpf_cnpj} onChange={e => setFProd(p => ({ ...p, cpf_cnpj: maskCpfCnpj(e.target.value, p.tipo) }))} placeholder={fProd.tipo === "pf" ? "000.000.000-00" : "00.000.000/0001-00"} /></div>
              <div><label style={lbl}>INCRA</label><input style={inp} value={fProd.incra} onChange={e => setFProd(p => ({ ...p, incra: e.target.value }))} placeholder="Nº certificado INCRA" /></div>
              <div><label style={lbl}>E-mail</label><input style={inp} type="email" value={fProd.email} onChange={e => setFProd(p => ({ ...p, email: e.target.value }))} /></div>
              <div><label style={lbl}>Telefone</label><input style={inp} value={fProd.telefone} onChange={e => setFProd(p => ({ ...p, telefone: e.target.value }))} /></div>
            </div>

            {/* Dados PJ — exibidos somente quando tipo = pj */}
            {fProd.tipo === "pj" && (<>
              <div style={{ fontSize: 11, fontWeight: 600, color: "#1A4870", marginBottom: 8, marginTop: 16, paddingBottom: 4, borderBottom: "0.5px solid #D4DCE8" }}>Dados da Empresa (PJ)</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14, marginBottom: 16 }}>
                <div style={{ gridColumn: "1/3" }}>
                  <label style={lbl}>Razão Social</label>
                  <input style={inp} value={fProd.razao_social} onChange={e => setFProd(p => ({ ...p, razao_social: e.target.value }))} placeholder="Razão social registrada" />
                </div>
                <div>
                  <label style={lbl}>Regime Tributário</label>
                  <select style={inp} value={fProd.regime_tributario} onChange={e => setFProd(p => ({ ...p, regime_tributario: e.target.value }))}>
                    <option value="">Selecione…</option>
                    <option value="Produtor Rural PJ">Produtor Rural PJ</option>
                    <option value="Simples Nacional">Simples Nacional</option>
                    <option value="Lucro Presumido">Lucro Presumido</option>
                    <option value="Lucro Real">Lucro Real</option>
                    <option value="MEI">MEI</option>
                  </select>
                </div>
                <div>
                  <label style={lbl}>CAR — Cadastro Ambiental Rural</label>
                  <input style={inp} value={fProd.car} onChange={e => setFProd(p => ({ ...p, car: e.target.value }))} placeholder="MT-XXXXXXXX-XXXXXXXXXXXXX" />
                </div>
                <div>
                  <label style={lbl}>NIRF</label>
                  <input style={inp} value={fProd.nirf} onChange={e => setFProd(p => ({ ...p, nirf: e.target.value }))} />
                </div>
                <div>
                  <label style={lbl}>ITR</label>
                  <input style={inp} value={fProd.itr} onChange={e => setFProd(p => ({ ...p, itr: e.target.value }))} />
                </div>
                <div style={{ gridColumn: "1/-1" }}>
                  <label style={lbl}>E-mail para relatórios automáticos</label>
                  <input style={inp} type="email" value={fProd.email_relatorios} onChange={e => setFProd(p => ({ ...p, email_relatorios: e.target.value }))} placeholder="Receberá DRE semanal, alertas de vencimento, etc." />
                </div>
              </div>
            </>)}

            {/* Endereço */}
            <div style={{ fontSize: 11, fontWeight: 600, color: "#1A4870", marginBottom: 8, paddingBottom: 4, borderBottom: "0.5px solid #D4DCE8" }}>Endereço</div>
            <div style={{ display: "grid", gridTemplateColumns: "140px 1fr 1fr", gap: 14, marginBottom: 12 }}>
              <div>
                <label style={lbl}>CEP</label>
                <div style={{ position: "relative" }}>
                  <input style={{ ...inp, paddingRight: 32 }} value={fProd.cep} placeholder="00000-000" maxLength={9}
                    onChange={e => {
                      const v = e.target.value.replace(/\D/g, "").slice(0, 8);
                      const masked = v.length > 5 ? `${v.slice(0,5)}-${v.slice(5)}` : v;
                      setFProd(p => ({ ...p, cep: masked }));
                      if (v.length === 8) buscarCepProd(v);
                    }}
                  />
                  {buscandoCep && <span style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", fontSize: 11, color: "#1A4870" }}>⟳</span>}
                </div>
              </div>
              <div style={{ gridColumn: "2/-1" }}>
                <label style={lbl}>Logradouro</label>
                <input style={inp} value={fProd.logradouro} onChange={e => setFProd(p => ({ ...p, logradouro: e.target.value }))} placeholder="Rua, Avenida, Rodovia…" />
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "80px 1fr 1fr 1fr 80px", gap: 14 }}>
              <div><label style={lbl}>Número</label><input style={inp} value={fProd.numero} onChange={e => setFProd(p => ({ ...p, numero: e.target.value }))} placeholder="S/N" /></div>
              <div><label style={lbl}>Complemento</label><input style={inp} value={fProd.complemento} onChange={e => setFProd(p => ({ ...p, complemento: e.target.value }))} placeholder="Sala, Bloco…" /></div>
              <div><label style={lbl}>Bairro</label><input style={inp} value={fProd.bairro} onChange={e => setFProd(p => ({ ...p, bairro: e.target.value }))} /></div>
              <div><label style={lbl}>Município</label><input style={inp} value={fProd.municipio} onChange={e => setFProd(p => ({ ...p, municipio: e.target.value }))} /></div>
              <div><label style={lbl}>UF</label><select style={inp} value={fProd.estado} onChange={e => setFProd(p => ({ ...p, estado: e.target.value }))}>{ESTADOS.map(s => <option key={s}>{s}</option>)}</select></div>
            </div>
          </>)}

          {tabProd === "ies" && (<>
            <div style={{ fontSize: 12, color: "#555", marginBottom: 16, background: "#F4F6FA", border: "0.5px solid #DDE2EE", borderRadius: 8, padding: "10px 14px" }}>
              Cada Inscrição Estadual corresponde a um imóvel rural em um município específico.
              O sistema usará automaticamente a IE da fazenda de origem ao emitir NF-e.
            </div>

            {/* Tabela de IEs existentes */}
            {prodIEs.length > 0 && (
              <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 16, fontSize: 13 }}>
                <thead>
                  <tr style={{ background: "#F4F6FA" }}>
                    {["Inscrição Estadual","Município","UF","Fazenda vinculada","Ativa",""].map(h => (
                      <th key={h} style={{ padding: "7px 10px", textAlign: "left", fontWeight: 600, fontSize: 11, color: "#555", borderBottom: "0.5px solid #DDE2EE" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {prodIEs.map((ie, i) => (
                    <tr key={ie.id ?? i} style={{ borderBottom: "0.5px solid #EEF1F7" }}>
                      <td style={{ padding: "7px 10px", fontWeight: 600, color: "#1A4870" }}>{ie.inscricao_estadual}</td>
                      <td style={{ padding: "7px 10px" }}>{ie.municipio ?? "—"}</td>
                      <td style={{ padding: "7px 10px" }}>{ie.estado}</td>
                      <td style={{ padding: "7px 10px", color: "#888" }}>
                        {ie.fazenda_id ? (fazendas.find(f => f.id === ie.fazenda_id)?.nome ?? ie.fazenda_id) : "—"}
                      </td>
                      <td style={{ padding: "7px 10px" }}>
                        <input type="checkbox" checked={ie.ativa} onChange={e => setProdIEs(p => p.map((x,j) => j===i ? {...x, ativa: e.target.checked} : x))} />
                      </td>
                      <td style={{ padding: "7px 10px" }}>
                        <button onClick={() => setProdIEs(p => p.filter((_,j) => j!==i))} style={{ background: "none", border: "none", color: "#E24B4A", cursor: "pointer", fontSize: 16, lineHeight: 1 }}>×</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {prodIEs.length === 0 && (
              <div style={{ textAlign: "center", color: "#888", fontSize: 13, padding: "20px 0 16px" }}>Nenhuma inscrição estadual cadastrada</div>
            )}

            {/* Linha para adicionar nova IE */}
            <div style={{ background: "#F4F6FA", border: "0.5px solid #DDE2EE", borderRadius: 8, padding: "14px 16px" }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: "#1A4870", marginBottom: 10 }}>Adicionar Inscrição Estadual</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 80px 1fr auto", gap: 10, alignItems: "flex-end" }}>
                <div>
                  <label style={lbl}>IE *</label>
                  <input style={inp} value={newIE.inscricao_estadual} onChange={e => setNewIE(p => ({ ...p, inscricao_estadual: e.target.value.replace(/\D/g,"") }))} placeholder="Apenas dígitos" />
                </div>
                <div>
                  <label style={lbl}>Município</label>
                  <input style={inp} value={newIE.municipio} onChange={e => setNewIE(p => ({ ...p, municipio: e.target.value }))} />
                </div>
                <div>
                  <label style={lbl}>UF</label>
                  <select style={inp} value={newIE.estado} onChange={e => setNewIE(p => ({ ...p, estado: e.target.value }))}>
                    {ESTADOS.map(s => <option key={s}>{s}</option>)}
                  </select>
                </div>
                <div>
                  <label style={lbl}>Fazenda vinculada</label>
                  <select style={inp} value={newIE.fazenda_id} onChange={e => setNewIE(p => ({ ...p, fazenda_id: e.target.value }))}>
                    <option value="">Nenhuma</option>
                    {fazendas.map(f => <option key={f.id} value={f.id}>{f.nome}</option>)}
                  </select>
                </div>
                <button
                  disabled={!newIE.inscricao_estadual.trim()}
                  onClick={() => {
                    if (!newIE.inscricao_estadual.trim()) return;
                    setProdIEs(p => [...p, {
                      id: crypto.randomUUID(),
                      produtor_id: editProd?.id ?? "",
                      fazenda_id: newIE.fazenda_id || null,
                      inscricao_estadual: newIE.inscricao_estadual.trim(),
                      municipio: newIE.municipio.trim() || null,
                      estado: newIE.estado,
                      ativa: true,
                    }]);
                    setNewIE({ inscricao_estadual: "", municipio: "", estado: "MT", fazenda_id: "" });
                  }}
                  style={{ ...btnV, padding: "8px 16px", opacity: !newIE.inscricao_estadual.trim() ? 0.5 : 1, whiteSpace: "nowrap" }}
                >+ Adicionar</button>
              </div>
            </div>
          </>)}

          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 20 }}>
            <button style={btnR} onClick={() => setModalProd(false)}>Cancelar</button>
            <button style={{ ...btnV, opacity: salvando || !fProd.nome.trim() ? 0.5 : 1 }} disabled={salvando || !fProd.nome.trim()} onClick={salvarProd}>{salvando ? "Salvando…" : "Salvar"}</button>
          </div>
        </Modal>
      )}



      {/* Modal Fazenda */}
      {modalFaz && (() => {
        const totalMatHA = fazMatsLocal.reduce((s, m) => s + (Number(m.area_ha) || 0), 0);
        const totalFazHA = Number(fFaz.area) || 0;
        const diffHA = totalMatHA - totalFazHA;
        const matStatus = totalMatHA === 0 ? "vazio" : Math.abs(diffHA) < 0.01 ? "ok" : diffHA < 0 ? "deficit" : "sobreposicao";
        const totalArrHA = fazArrendamentos.reduce((s, a) => s + (Number(a.area_ha) || 0), 0);
        const hoje = new Date().toISOString().slice(0, 10);
        const diasAte = (d?: string) => d ? Math.ceil((new Date(d).getTime() - Date.now()) / 86400000) : null;
        const certBadge = (venc?: string) => {
          const d = diasAte(venc);
          if (!venc) return null;
          if (d !== null && d < 0) return <span style={{ fontSize: 10, background: "#FCEBEB", color: "#791F1F", padding: "2px 7px", borderRadius: 8, fontWeight: 600, marginLeft: 8 }}>VENCIDO</span>;
          if (d !== null && d <= 30) return <span style={{ fontSize: 10, background: "#FEF3CD", color: "#7A5A12", padding: "2px 7px", borderRadius: 8, fontWeight: 600, marginLeft: 8 }}>vence em {d}d</span>;
          return <span style={{ fontSize: 10, background: "#DCF5E8", color: "#14532D", padding: "2px 7px", borderRadius: 8, fontWeight: 600, marginLeft: 8 }}>OK</span>;
        };
        return (
          <Modal titulo={editFaz ? "Editar Fazenda" : "Nova Fazenda"} subtitulo="Uma fazenda pode pertencer a um Produtor (PF/parceria) ou a uma Empresa (PJ)" onClose={() => setModalFaz(false)} width={1100}>
            {/* ── Tab navigation ── */}
            <div style={{ display: "flex", borderBottom: "0.5px solid #D4DCE8", marginBottom: 22, gap: 0 }}>
              {([["geral","Dados Gerais"],["matriculas",`Matrículas${fazMatsLocal.length > 0 ? ` (${fazMatsLocal.length})` : ""}`],["cars",`CAR${fazCars.length > 0 ? ` (${fazCars.length})` : ""}`],["nirfs",`NIRF${fazNirfs.length > 0 ? ` (${fazNirfs.length})` : ""}`],["itrs",`ITR${fazItrs.length > 0 ? ` (${fazItrs.length})` : ""}`],["ccirs",`CCIR${fazCcirs.length > 0 ? ` (${fazCcirs.length})` : ""}`],["arrendamentos",`Arrendamentos${fazArrendamentos.length > 0 ? ` (${fazArrendamentos.length})` : ""}`]] as [string,string][]).map(([k, l]) => (
                <button key={k} onClick={() => setTabFaz(k as typeof tabFaz)} style={{ padding: "10px 18px", border: "none", borderBottom: tabFaz === k ? "2px solid #1A4870" : "2px solid transparent", background: "none", cursor: "pointer", fontSize: 13, color: tabFaz === k ? "#1A4870" : "#555", fontWeight: tabFaz === k ? 600 : 400 }}>{l}</button>
              ))}
            </div>

            {/* ════ TAB: DADOS GERAIS ════ */}
            {tabFaz === "geral" && (
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: "#1A4870", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 10 }}>Identificação</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14, marginBottom: 20 }}>
                  <div style={{ gridColumn: "1/-1" }}><label style={lbl}>Nome da fazenda *</label><input style={inp} value={fFaz.nome} onChange={e => setFFaz(p => ({ ...p, nome: e.target.value }))} /></div>
                  <div style={{ gridColumn: "1/-1" }}>
                    <label style={lbl}>Produtor / Empresa responsável *</label>
                    <ProdutorCombo
                      produtores={produtores}
                      value={fFaz.produtor_id}
                      onChange={pid => {
                        const prod = produtores.find(x => x.id === pid);
                        const empId = prod?.tipo === "pj" ? (prodEmpresaMap[pid] ?? "") : "";
                        setFFaz(p => ({
                          ...p,
                          produtor_id: pid,
                          empresa_id: empId,
                          ...(prod?.cpf_cnpj ? { cnpj: prod.cpf_cnpj } : {}),
                        }));
                      }}
                      placeholder="Selecione…"
                    />
                  </div>
                  <div><label style={lbl}>Área total (ha) *</label><InputMonetario style={inp} value={fFaz.area} onChange={v => setFFaz(p => ({ ...p, area: String(v) }))} /></div>
                  <div>
                    <label style={lbl}>CNPJ / CPF</label>
                    <input style={inp} value={fFaz.cnpj} onChange={e => setFFaz(p => ({ ...p, cnpj: e.target.value }))} placeholder="Preenchido automaticamente ao selecionar produtor/empresa" />
                  </div>
                  <div />
                </div>

                <div style={{ fontSize: 11, fontWeight: 700, color: "#1A4870", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 10, paddingTop: 4, borderTop: "0.5px solid #D4DCE8" }}>Endereço</div>
                <div style={{ display: "grid", gridTemplateColumns: "160px 1fr", gap: 14, marginBottom: 14 }}>
                  <div>
                    <label style={lbl}>CEP{buscandoCepFaz && <span style={{ marginLeft: 6, color: "#888", fontSize: 11 }}>⟳ buscando…</span>}{cepAutoOk && <span style={{ marginLeft: 6, color: "#16A34A", fontSize: 11, fontWeight: 600 }}>✓ endereço preenchido</span>}</label>
                    <input style={inp} value={fFaz.cep} placeholder="00000-000" onChange={e => { const v = maskCep(e.target.value); setFFaz(p => ({ ...p, cep: v })); if (v.replace(/\D/g,"").length === 8) buscarCepFaz(v); }} />
                  </div>
                  <div><label style={lbl}>Logradouro</label><input style={inp} value={fFaz.logradouro} onChange={e => setFFaz(p => ({ ...p, logradouro: e.target.value }))} /></div>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "80px 1fr 1fr 1fr 80px", gap: 14, marginBottom: 4 }}>
                  <div><label style={lbl}>Número</label><input style={inp} value={fFaz.numero_end} onChange={e => setFFaz(p => ({ ...p, numero_end: e.target.value }))} /></div>
                  <div><label style={lbl}>Complemento</label><input style={inp} value={fFaz.complemento} onChange={e => setFFaz(p => ({ ...p, complemento: e.target.value }))} /></div>
                  <div><label style={lbl}>Bairro</label><input style={inp} value={fFaz.bairro} onChange={e => setFFaz(p => ({ ...p, bairro: e.target.value }))} /></div>
                  <div>
                    <label style={lbl}>Município</label>
                    <input style={{ ...inp, ...(cepAutoOk ? { borderColor: "#16A34A" } : {}) }} value={fFaz.municipio} onChange={e => setFFaz(p => ({ ...p, municipio: e.target.value }))} />
                  </div>
                  <div>
                    <label style={lbl}>UF</label>
                    <select style={{ ...inp, ...(cepAutoOk ? { borderColor: "#16A34A" } : {}) }} value={fFaz.estado} onChange={e => setFFaz(p => ({ ...p, estado: e.target.value }))}>{ESTADOS.map(s => <option key={s}>{s}</option>)}</select>
                  </div>
                </div>
              </div>
            )}

            {/* ════ TAB: MATRÍCULAS ════ */}
            {tabFaz === "matriculas" && (
              <div>
                {/* Comparativo de área */}
                <div style={{ padding: "12px 16px", borderRadius: 10, background: matStatus === "ok" ? "#DCF5E8" : matStatus === "deficit" ? "#FEF3CD" : matStatus === "sobreposicao" ? "#FCEBEB" : "#F4F6FA", border: `0.5px solid ${matStatus === "ok" ? "#86EFAC" : matStatus === "deficit" ? "#FDE68A" : matStatus === "sobreposicao" ? "#FCA5A5" : "#D4DCE8"}`, marginBottom: 16, display: "flex", alignItems: "center", gap: 20 }}>
                  <div><span style={{ fontSize: 12, color: "#555" }}>Área fazenda:</span> <strong>{totalFazHA.toFixed(2)} ha</strong></div>
                  <div><span style={{ fontSize: 12, color: "#555" }}>Área matriculada:</span> <strong>{totalMatHA.toFixed(2)} ha</strong></div>
                  {matStatus === "deficit" && <span style={{ fontSize: 12, color: "#7A5A12", fontWeight: 600 }}>⚠ Faltam {Math.abs(diffHA).toFixed(2)} ha sem matrícula</span>}
                  {matStatus === "sobreposicao" && <span style={{ fontSize: 12, color: "#791F1F", fontWeight: 600 }}>⚠ Sobreposição de {diffHA.toFixed(2)} ha</span>}
                  {matStatus === "ok" && <span style={{ fontSize: 12, color: "#14532D", fontWeight: 600 }}>✓ Área completamente matriculada</span>}
                  {matStatus === "vazio" && <span style={{ fontSize: 12, color: "#888" }}>Nenhuma matrícula cadastrada</span>}
                </div>

                {/* Tabela inline de matrículas */}
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, marginBottom: 14 }}>
                  <thead><tr style={{ background: "#F4F6FA" }}>{["N° Matrícula","Cartório","Área (ha)","Produtor","Garantia",""].map(h => <th key={h} style={{ padding: "7px 10px", textAlign: "left", fontSize: 11, color: "#555", fontWeight: 600, borderBottom: "0.5px solid #D4DCE8" }}>{h}</th>)}</tr></thead>
                  <tbody>
                    {fazMatsLocal.map((m, i) => (
                      <tr key={m._key} style={{ borderBottom: "0.5px solid #F0F2F8" }}>
                        <td style={{ padding: "6px 10px" }}><input style={{ ...inp, padding: "5px 8px", fontSize: 12 }} value={m.numero} onChange={e => setFazMatsLocal(p => p.map((x,j) => j===i ? {...x,numero:e.target.value} : x))} placeholder="Nº" /></td>
                        <td style={{ padding: "6px 10px" }}><input style={{ ...inp, padding: "5px 8px", fontSize: 12 }} value={m.cartorio} onChange={e => setFazMatsLocal(p => p.map((x,j) => j===i ? {...x,cartorio:e.target.value} : x))} placeholder="Cartório" /></td>
                        <td style={{ padding: "6px 10px", width: 100 }}><InputNumerico style={{ ...inp, padding: "5px 8px", fontSize: 12 }} decimais={4} value={m.area_ha} onChange={v => setFazMatsLocal(p => p.map((x,j) => j===i ? {...x,area_ha:v} : x))} placeholder="0,0000" /></td>
                        <td style={{ padding: "6px 10px", minWidth: 200 }}>
                          <ProdutorCombo
                            produtores={produtores}
                            value={m.produtor_id}
                            onChange={id => setFazMatsLocal(p => p.map((x,j) => j===i ? {...x,produtor_id:id} : x))}
                            placeholder="—"
                            dropdownMinWidth={420}
                          />
                        </td>
                        <td style={{ padding: "6px 10px" }}>
                          <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", fontSize: 12 }}><input type="checkbox" checked={m.em_garantia} onChange={e => setFazMatsLocal(p => p.map((x,j) => j===i ? {...x,em_garantia:e.target.checked} : x))} />Em garantia</label>
                        </td>
                        <td style={{ padding: "6px 10px" }}><button style={btnX} onClick={() => setFazMatsLocal(p => p.filter((_,j) => j!==i))}>Remover</button></td>
                      </tr>
                    ))}
                    {fazMatsLocal.length === 0 && <tr><td colSpan={6} style={{ padding: 20, textAlign: "center", color: "#888", fontSize: 12 }}>Nenhuma matrícula cadastrada. Clique em "+ Adicionar" abaixo.</td></tr>}
                  </tbody>
                </table>
                <button style={{ ...btnV, background: "#C9921B", fontSize: 12, padding: "7px 14px" }} onClick={() => setFazMatsLocal(p => [...p, { _key: `new_${Date.now()}`, produtor_id: "", numero: "", cartorio: "", area_ha: "", descricao: "", em_garantia: false, garantia_banco: "", garantia_valor: "", garantia_vencimento: "" }])}>+ Adicionar Matrícula</button>
              </div>
            )}

            {/* ════ TAB: CARs MÚLTIPLOS ════ */}
            {tabFaz === "cars" && (
              <div>
                <div style={{ fontSize: 12, color: "#555", marginBottom: 14 }}>Uma fazenda pode ter múltiplos CARs — por exemplo, quando há gleba destacada, desmembramento ou diferentes módulos fiscais. Cada CAR pode ser vinculado a uma ou mais Matrículas.</div>
                <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 12 }}>
                  <button style={{ padding: "7px 16px", background: "#1A4870", color: "#fff", border: "none", borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: "pointer" }}
                    onClick={() => setFazCars(p => [...p, { _key: `new_${Date.now()}`, numero: "", status: "ativo", area_ha: "", vencimento: "", observacao: "", mats_vinculadas: [] }])}>
                    + Adicionar CAR
                  </button>
                </div>
                {fazCars.length === 0 ? (
                  <div style={{ textAlign: "center", padding: "30px 20px", color: "#888", fontSize: 13, border: "1.5px dashed #D4DCE8", borderRadius: 10 }}>
                    Nenhum CAR cadastrado. Clique em "+ Adicionar CAR".
                  </div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                    {fazCars.map((c, ci) => (
                      <div key={c._key} style={{ border: "0.5px solid #D4DCE8", borderRadius: 10, background: "#FAFBFC", overflow: "hidden" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", background: "#F4F6FA", borderBottom: "0.5px solid #D4DCE8" }}>
                          <span style={{ fontWeight: 700, fontSize: 13, color: "#1A4870", flex: 1 }}>
                            {c.numero || "CAR sem número"}
                          </span>
                          <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 8, fontWeight: 600, background: c.status === "ativo" ? "#DCFCE7" : "#FEE2E2", color: c.status === "ativo" ? "#166534" : "#991B1B" }}>
                            {c.status === "ativo" ? "Ativo" : "Cancelado"}
                          </span>
                          <button style={{ padding: "3px 10px", background: "#E24B4A", color: "#fff", border: "none", borderRadius: 6, fontSize: 11, cursor: "pointer" }}
                            onClick={() => setFazCars(p => p.filter((_,j) => j !== ci))}>Remover</button>
                        </div>
                        <div style={{ padding: "14px 16px", display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr", gap: 12 }}>
                          <div>
                            <label style={lbl}>Número do CAR *</label>
                            <input style={inp} value={c.numero} placeholder="MT-XXXXXXXX-XXXXXXXXXXXXXXXXXXXX" onChange={e => setFazCars(p => p.map((x,j) => j===ci ? {...x,numero:e.target.value} : x))} />
                          </div>
                          <div>
                            <label style={lbl}>Status</label>
                            <select style={inp} value={c.status} onChange={e => setFazCars(p => p.map((x,j) => j===ci ? {...x,status:e.target.value} : x))}>
                              <option value="ativo">Ativo</option>
                              <option value="cancelado">Cancelado</option>
                              <option value="pendente">Pendente análise</option>
                            </select>
                          </div>
                          <div>
                            <label style={lbl}>Área declarada (ha)</label>
                            <InputNumerico style={inp} value={c.area_ha} onChange={v => setFazCars(p => p.map((x,j) => j===ci ? {...x,area_ha:v} : x))} />
                          </div>
                          <div>
                            <label style={lbl}>Vencimento</label>
                            <input style={inp} type="date" value={c.vencimento} onChange={e => setFazCars(p => p.map((x,j) => j===ci ? {...x,vencimento:e.target.value} : x))} />
                          </div>
                          <div style={{ gridColumn: "1/-1" }}>
                            <label style={lbl}>Matrículas vinculadas a este CAR</label>
                            {fazMatsLocal.length === 0 ? (
                              <div style={{ fontSize: 11, color: "#888" }}>Cadastre matrículas na aba Matrículas primeiro.</div>
                            ) : (
                              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 4 }}>
                                {fazMatsLocal.map(m => {
                                  const sel = c.mats_vinculadas.includes(m._key);
                                  return (
                                    <button key={m._key} type="button"
                                      onClick={() => setFazCars(p => p.map((x,j) => j!==ci ? x : { ...x, mats_vinculadas: sel ? x.mats_vinculadas.filter(id => id !== m._key) : [...x.mats_vinculadas, m._key] }))}
                                      style={{ padding: "4px 10px", borderRadius: 8, border: `0.5px solid ${sel ? "#1A4870" : "#D4DCE8"}`, background: sel ? "#EFF4FA" : "#fff", fontSize: 11, color: sel ? "#1A4870" : "#555", cursor: "pointer", fontWeight: sel ? 700 : 400 }}>
                                      {m.numero || "Matr. sem número"}
                                    </button>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                          <div style={{ gridColumn: "1/-1" }}>
                            <label style={lbl}>Observações</label>
                            <input style={inp} value={c.observacao} onChange={e => setFazCars(p => p.map((x,j) => j===ci ? {...x,observacao:e.target.value} : x))} placeholder="Ex: CAR da gleba destacada (loteamento 2019)" />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* ════ TAB: NIRFs MÚLTIPLOS ════ */}
            {tabFaz === "nirfs" && (
              <div>
                <div style={{ fontSize: 12, color: "#555", marginBottom: 14 }}>NIRF — Número do Imóvel na Receita Federal. Uma fazenda pode ter múltiplos NIRFs quando há glebas registradas separadamente. Cada NIRF pode ser vinculado a uma ou mais Matrículas.</div>
                <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 12 }}>
                  <button style={{ padding: "7px 16px", background: "#1A4870", color: "#fff", border: "none", borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: "pointer" }}
                    onClick={() => setFazNirfs(p => [...p, { _key: `new_${Date.now()}`, numero: "", situacao: "ativo", area_ha: "", observacao: "", mats_vinculadas: [] }])}>
                    + Adicionar NIRF
                  </button>
                </div>
                {fazNirfs.length === 0 ? (
                  <div style={{ textAlign: "center", padding: "30px 20px", color: "#888", fontSize: 13, border: "1.5px dashed #D4DCE8", borderRadius: 10 }}>
                    Nenhum NIRF cadastrado. Clique em "+ Adicionar NIRF".
                  </div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                    {fazNirfs.map((n, ni) => (
                      <div key={n._key} style={{ border: "0.5px solid #D4DCE8", borderRadius: 10, background: "#FAFBFC", overflow: "hidden" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", background: "#F4F6FA", borderBottom: "0.5px solid #D4DCE8" }}>
                          <span style={{ fontWeight: 700, fontSize: 13, color: "#1A4870", flex: 1 }}>
                            {n.numero || "NIRF sem número"}
                          </span>
                          <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 8, fontWeight: 600, background: n.situacao === "ativo" ? "#DCFCE7" : n.situacao === "suspenso" ? "#FEF3CD" : "#FEE2E2", color: n.situacao === "ativo" ? "#166534" : n.situacao === "suspenso" ? "#7A5A12" : "#991B1B" }}>
                            {n.situacao === "ativo" ? "Ativo" : n.situacao === "suspenso" ? "Suspenso" : "Cancelado"}
                          </span>
                          <button style={{ padding: "3px 10px", background: "#E24B4A", color: "#fff", border: "none", borderRadius: 6, fontSize: 11, cursor: "pointer" }}
                            onClick={() => setFazNirfs(p => p.filter((_,j) => j !== ni))}>Remover</button>
                        </div>
                        <div style={{ padding: "14px 16px", display: "grid", gridTemplateColumns: "2fr 1fr 1fr", gap: 12 }}>
                          <div>
                            <label style={lbl}>Número do NIRF *</label>
                            <input style={inp} value={n.numero} placeholder="Ex: 1234567" onChange={e => setFazNirfs(p => p.map((x,j) => j===ni ? {...x,numero:e.target.value} : x))} />
                          </div>
                          <div>
                            <label style={lbl}>Situação</label>
                            <select style={inp} value={n.situacao} onChange={e => setFazNirfs(p => p.map((x,j) => j===ni ? {...x,situacao:e.target.value} : x))}>
                              <option value="ativo">Ativo</option>
                              <option value="suspenso">Suspenso</option>
                              <option value="cancelado">Cancelado</option>
                            </select>
                          </div>
                          <div>
                            <label style={lbl}>Área declarada (ha)</label>
                            <InputNumerico style={inp} decimais={4} value={n.area_ha} placeholder="0,0000" onChange={v => setFazNirfs(p => p.map((x,j) => j===ni ? {...x,area_ha:v} : x))} />
                          </div>
                          <div style={{ gridColumn: "1/-1" }}>
                            <label style={lbl}>Matrículas vinculadas a este NIRF</label>
                            {fazMatsLocal.length === 0 ? (
                              <div style={{ fontSize: 11, color: "#888" }}>Cadastre matrículas na aba Matrículas primeiro.</div>
                            ) : (
                              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 4 }}>
                                {fazMatsLocal.map(m => {
                                  const sel = n.mats_vinculadas.includes(m._key);
                                  return (
                                    <button key={m._key} type="button"
                                      onClick={() => setFazNirfs(p => p.map((x,j) => j!==ni ? x : { ...x, mats_vinculadas: sel ? x.mats_vinculadas.filter(id => id !== m._key) : [...x.mats_vinculadas, m._key] }))}
                                      style={{ padding: "4px 10px", borderRadius: 8, border: `0.5px solid ${sel ? "#1A4870" : "#D4DCE8"}`, background: sel ? "#EFF4FA" : "#fff", fontSize: 11, color: sel ? "#1A4870" : "#555", cursor: "pointer", fontWeight: sel ? 700 : 400 }}>
                                      {m.numero || "Matr. sem número"}
                                    </button>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                          <div style={{ gridColumn: "1/-1" }}>
                            <label style={lbl}>Observações</label>
                            <input style={inp} value={n.observacao} onChange={e => setFazNirfs(p => p.map((x,j) => j===ni ? {...x,observacao:e.target.value} : x))} placeholder="Ex: NIRF da gleba destacada" />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* ════ TAB: ITRs MÚLTIPLOS ════ */}
            {tabFaz === "itrs" && (
              <div>
                <div style={{ fontSize: 12, color: "#555", marginBottom: 14 }}>ITR — Imposto Territorial Rural (DITR). Registro por exercício. Cada DITR pode ser vinculado a um NIRF e a uma ou mais Matrículas.</div>
                <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 12 }}>
                  <button style={{ padding: "7px 16px", background: "#1A4870", color: "#fff", border: "none", borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: "pointer" }}
                    onClick={() => setFazItrs(p => [...p, { _key: `new_${Date.now()}`, exercicio: String(new Date().getFullYear()), numero_declaracao: "", nirf_numero: "", vencimento: "", area_tributavel_ha: "", valor_apurado: "", status_pagamento: "pendente", observacao: "", mats_vinculadas: [] }])}>
                    + Adicionar ITR
                  </button>
                </div>
                {fazItrs.length === 0 ? (
                  <div style={{ textAlign: "center", padding: "30px 20px", color: "#888", fontSize: 13, border: "1.5px dashed #D4DCE8", borderRadius: 10 }}>
                    Nenhum ITR cadastrado. Clique em "+ Adicionar ITR".
                  </div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                    {fazItrs.map((t, ti) => (
                      <div key={t._key} style={{ border: "0.5px solid #D4DCE8", borderRadius: 10, background: "#FAFBFC", overflow: "hidden" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", background: "#F4F6FA", borderBottom: "0.5px solid #D4DCE8" }}>
                          <span style={{ fontWeight: 700, fontSize: 13, color: "#1A4870", flex: 1 }}>
                            ITR {t.exercicio || "—"}{t.numero_declaracao ? ` · DITR ${t.numero_declaracao}` : ""}
                          </span>
                          <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 8, fontWeight: 600, background: t.status_pagamento === "pago" ? "#DCFCE7" : t.status_pagamento === "parcelado" ? "#EFF4FA" : "#FEE2E2", color: t.status_pagamento === "pago" ? "#166534" : t.status_pagamento === "parcelado" ? "#0B2D50" : "#991B1B" }}>
                            {t.status_pagamento === "pago" ? "Pago" : t.status_pagamento === "parcelado" ? "Parcelado" : "Pendente"}
                          </span>
                          {t.vencimento && certBadge(t.vencimento)}
                          <button style={{ padding: "3px 10px", background: "#E24B4A", color: "#fff", border: "none", borderRadius: 6, fontSize: 11, cursor: "pointer" }}
                            onClick={() => setFazItrs(p => p.filter((_,j) => j !== ti))}>Remover</button>
                        </div>
                        <div style={{ padding: "14px 16px", display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 12 }}>
                          <div>
                            <label style={lbl}>Exercício (ano) *</label>
                            <input style={inp} value={t.exercicio} placeholder="2025" onChange={e => setFazItrs(p => p.map((x,j) => j===ti ? {...x,exercicio:e.target.value} : x))} />
                          </div>
                          <div>
                            <label style={lbl}>Nº Declaração (DITR)</label>
                            <input style={inp} value={t.numero_declaracao} placeholder="Nº da DITR" onChange={e => setFazItrs(p => p.map((x,j) => j===ti ? {...x,numero_declaracao:e.target.value} : x))} />
                          </div>
                          <div>
                            <label style={lbl}>NIRF vinculado</label>
                            <input style={inp} value={t.nirf_numero} placeholder="Nº do NIRF" onChange={e => setFazItrs(p => p.map((x,j) => j===ti ? {...x,nirf_numero:e.target.value} : x))} />
                          </div>
                          <div>
                            <label style={lbl}>Vencimento</label>
                            <input style={inp} type="date" value={t.vencimento} onChange={e => setFazItrs(p => p.map((x,j) => j===ti ? {...x,vencimento:e.target.value} : x))} />
                          </div>
                          <div>
                            <label style={lbl}>Área tributável (ha)</label>
                            <InputNumerico style={inp} decimais={4} value={t.area_tributavel_ha} placeholder="0,0000" onChange={v => setFazItrs(p => p.map((x,j) => j===ti ? {...x,area_tributavel_ha:v} : x))} />
                          </div>
                          <div>
                            <label style={lbl}>Valor apurado (R$)</label>
                            <InputNumerico style={inp} value={t.valor_apurado} placeholder="0,00" onChange={v => setFazItrs(p => p.map((x,j) => j===ti ? {...x,valor_apurado:v} : x))} />
                          </div>
                          <div>
                            <label style={lbl}>Status pagamento</label>
                            <select style={inp} value={t.status_pagamento} onChange={e => setFazItrs(p => p.map((x,j) => j===ti ? {...x,status_pagamento:e.target.value} : x))}>
                              <option value="pendente">Pendente</option>
                              <option value="pago">Pago</option>
                              <option value="parcelado">Parcelado</option>
                            </select>
                          </div>
                          <div style={{ gridColumn: "1/-1" }}>
                            <label style={lbl}>Matrículas vinculadas a este ITR</label>
                            {fazMatsLocal.length === 0 ? (
                              <div style={{ fontSize: 11, color: "#888" }}>Cadastre matrículas na aba Matrículas primeiro.</div>
                            ) : (
                              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 4 }}>
                                {fazMatsLocal.map(m => {
                                  const sel = t.mats_vinculadas.includes(m._key);
                                  return (
                                    <button key={m._key} type="button"
                                      onClick={() => setFazItrs(p => p.map((x,j) => j!==ti ? x : { ...x, mats_vinculadas: sel ? x.mats_vinculadas.filter(id => id !== m._key) : [...x.mats_vinculadas, m._key] }))}
                                      style={{ padding: "4px 10px", borderRadius: 8, border: `0.5px solid ${sel ? "#1A4870" : "#D4DCE8"}`, background: sel ? "#EFF4FA" : "#fff", fontSize: 11, color: sel ? "#1A4870" : "#555", cursor: "pointer", fontWeight: sel ? 700 : 400 }}>
                                      {m.numero || "Matr. sem número"}
                                    </button>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                          <div style={{ gridColumn: "1/-1" }}>
                            <label style={lbl}>Observações</label>
                            <input style={inp} value={t.observacao} onChange={e => setFazItrs(p => p.map((x,j) => j===ti ? {...x,observacao:e.target.value} : x))} placeholder="Ex: Pagamento parcelado em 2x" />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* ════ TAB: CCIRs MÚLTIPLOS ════ */}
            {tabFaz === "ccirs" && (
              <div>
                <div style={{ fontSize: 12, color: "#555", marginBottom: 14 }}>CCIR — Certidão de Cadastro de Imóvel Rural (INCRA). Renovada anualmente. Cada CCIR pode ser vinculado a uma ou mais Matrículas.</div>
                <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 12 }}>
                  <button style={{ padding: "7px 16px", background: "#1A4870", color: "#fff", border: "none", borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: "pointer" }}
                    onClick={() => setFazCcirs(p => [...p, { _key: `new_${Date.now()}`, numero: "", exercicio: String(new Date().getFullYear()), vencimento: "", area_ha: "", modulo_fiscal: "", situacao: "regular", observacao: "", mats_vinculadas: [] }])}>
                    + Adicionar CCIR
                  </button>
                </div>
                {fazCcirs.length === 0 ? (
                  <div style={{ textAlign: "center", padding: "30px 20px", color: "#888", fontSize: 13, border: "1.5px dashed #D4DCE8", borderRadius: 10 }}>
                    Nenhum CCIR cadastrado. Clique em "+ Adicionar CCIR".
                  </div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                    {fazCcirs.map((c, ci) => (
                      <div key={c._key} style={{ border: "0.5px solid #D4DCE8", borderRadius: 10, background: "#FAFBFC", overflow: "hidden" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", background: "#F4F6FA", borderBottom: "0.5px solid #D4DCE8" }}>
                          <span style={{ fontWeight: 700, fontSize: 13, color: "#1A4870", flex: 1 }}>
                            {c.numero || "CCIR sem número"}{c.exercicio ? ` · ${c.exercicio}` : ""}
                          </span>
                          <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 8, fontWeight: 600, background: c.situacao === "regular" ? "#DCFCE7" : c.situacao === "pendente" ? "#FEF3CD" : "#FEE2E2", color: c.situacao === "regular" ? "#166534" : c.situacao === "pendente" ? "#7A5A12" : "#991B1B" }}>
                            {c.situacao === "regular" ? "Regular" : c.situacao === "pendente" ? "Pendente" : "Irregular"}
                          </span>
                          {c.vencimento && certBadge(c.vencimento)}
                          <button style={{ padding: "3px 10px", background: "#E24B4A", color: "#fff", border: "none", borderRadius: 6, fontSize: 11, cursor: "pointer" }}
                            onClick={() => setFazCcirs(p => p.filter((_,j) => j !== ci))}>Remover</button>
                        </div>
                        <div style={{ padding: "14px 16px", display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr", gap: 12 }}>
                          <div>
                            <label style={lbl}>Número do CCIR *</label>
                            <input style={inp} value={c.numero} placeholder="Nº do CCIR (INCRA)" onChange={e => setFazCcirs(p => p.map((x,j) => j===ci ? {...x,numero:e.target.value} : x))} />
                          </div>
                          <div>
                            <label style={lbl}>Exercício (ano)</label>
                            <input style={inp} value={c.exercicio} placeholder="2025" onChange={e => setFazCcirs(p => p.map((x,j) => j===ci ? {...x,exercicio:e.target.value} : x))} />
                          </div>
                          <div>
                            <label style={lbl}>Vencimento</label>
                            <input style={inp} type="date" value={c.vencimento} onChange={e => setFazCcirs(p => p.map((x,j) => j===ci ? {...x,vencimento:e.target.value} : x))} />
                          </div>
                          <div>
                            <label style={lbl}>Situação</label>
                            <select style={inp} value={c.situacao} onChange={e => setFazCcirs(p => p.map((x,j) => j===ci ? {...x,situacao:e.target.value} : x))}>
                              <option value="regular">Regular</option>
                              <option value="pendente">Pendente</option>
                              <option value="irregular">Irregular</option>
                            </select>
                          </div>
                          <div>
                            <label style={lbl}>Área (ha)</label>
                            <InputNumerico style={inp} decimais={4} value={c.area_ha} placeholder="0,0000" onChange={v => setFazCcirs(p => p.map((x,j) => j===ci ? {...x,area_ha:v} : x))} />
                          </div>
                          <div>
                            <label style={lbl}>Módulo fiscal (ha)</label>
                            <InputNumerico style={inp} value={c.modulo_fiscal} placeholder="Ex: 55,00" onChange={v => setFazCcirs(p => p.map((x,j) => j===ci ? {...x,modulo_fiscal:v} : x))} />
                          </div>
                          <div style={{ gridColumn: "1/-1" }}>
                            <label style={lbl}>Matrículas vinculadas a este CCIR</label>
                            {fazMatsLocal.length === 0 ? (
                              <div style={{ fontSize: 11, color: "#888" }}>Cadastre matrículas na aba Matrículas primeiro.</div>
                            ) : (
                              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 4 }}>
                                {fazMatsLocal.map(m => {
                                  const sel = c.mats_vinculadas.includes(m._key);
                                  return (
                                    <button key={m._key} type="button"
                                      onClick={() => setFazCcirs(p => p.map((x,j) => j!==ci ? x : { ...x, mats_vinculadas: sel ? x.mats_vinculadas.filter(id => id !== m._key) : [...x.mats_vinculadas, m._key] }))}
                                      style={{ padding: "4px 10px", borderRadius: 8, border: `0.5px solid ${sel ? "#1A4870" : "#D4DCE8"}`, background: sel ? "#EFF4FA" : "#fff", fontSize: 11, color: sel ? "#1A4870" : "#555", cursor: "pointer", fontWeight: sel ? 700 : 400 }}>
                                      {m.numero || "Matr. sem número"}
                                    </button>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                          <div style={{ gridColumn: "1/-1" }}>
                            <label style={lbl}>Observações</label>
                            <input style={inp} value={c.observacao} onChange={e => setFazCcirs(p => p.map((x,j) => j===ci ? {...x,observacao:e.target.value} : x))} placeholder="Ex: CCIR referente à gleba norte" />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* ════ TAB: ARRENDAMENTOS ════ */}
            {tabFaz === "arrendamentos" && (
              <div>
                {fazArrendamentos.length > 0 && (
                  <div style={{ padding: "10px 14px", background: "#F4F6FA", borderRadius: 8, marginBottom: 16, fontSize: 12, color: "#555" }}>
                    Total arrendado: <strong>{totalArrHA.toFixed(2)} ha</strong> em {fazArrendamentos.length} contrato(s) · {totalFazHA > 0 ? ((totalArrHA/totalFazHA)*100).toFixed(0) : 0}% da área total
                  </div>
                )}
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  {fazArrendamentos.map((a, ai) => {
                    const ehSacas = a.forma_pagamento !== "brl";
                    const ehMisto = a.forma_pagamento === "sc_soja_milho";
                    const label = { sc_soja: "Sacas de soja", sc_milho: "Sacas de milho", sc_soja_milho: "Sc soja + milho", brl: "Valor em R$" }[a.forma_pagamento];
                    const totalScsSoja = ((Number(a.area_ha)||0) * (Number(a.sc_ha)||0)).toFixed(1);
                    const totalScsMilho = ((Number(a.area_ha)||0) * (Number(a.sc_milho_ha)||0)).toFixed(1);
                    const totalScs = ehSacas && !ehMisto ? ((Number(a.area_ha)||0) * (Number(a.sc_ha)||0)).toFixed(1) : null;
                    const brlPorHa = !ehSacas && Number(a.area_ha) > 0 ? (Number(a.valor_brl) / Number(a.area_ha)).toFixed(2) : null;
                    return (
                      <div key={a._key} style={{ border: "0.5px solid #D4DCE8", borderRadius: 10, background: "#FAFBFC", overflow: "hidden" }}>
                        {/* Card header */}
                        <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 16px", background: "#F4F6FA", borderBottom: "0.5px solid #D4DCE8" }}>
                          <span style={{ fontWeight: 600, fontSize: 13, flex: 1 }}>
                            {a.proprietario_nome || a.proprietario_id && pessoas.find(p => p.id === a.proprietario_id)?.nome || "Proprietário não definido"}
                            {a.produtor_id && (() => {
                              const p1 = produtores.find(p => p.id === a.produtor_id);
                              const p2 = a.produtor_id_2 ? produtores.find(p => p.id === a.produtor_id_2) : null;
                              if (!p1) return null;
                              return <span style={{ fontWeight: 400, fontSize: 11, color: "#1A4870", marginLeft: 8 }}>({p1.nome}{p2 ? ` + ${p2.nome}` : ""})</span>;
                            })()}
                          </span>
                          {a.area_ha && <span style={{ fontSize: 12, color: "#555" }}>{Number(a.area_ha).toFixed(2)} ha</span>}
                          {ehMisto && Number(a.sc_ha) > 0 && <span style={{ fontSize: 10, background: "#DCF5E8", color: "#14532D", padding: "2px 8px", borderRadius: 8, fontWeight: 600 }}>Sc soja + milho</span>}
                          {!ehMisto && ehSacas && <span style={{ fontSize: 10, background: "#DCF5E8", color: "#14532D", padding: "2px 8px", borderRadius: 8, fontWeight: 600 }}>Gera contrato grãos</span>}
                          {!ehSacas && Number(a.valor_brl) > 0 && <span style={{ fontSize: 10, background: "#FBF3E0", color: "#7A5A12", padding: "2px 8px", borderRadius: 8, fontWeight: 600 }}>R$ {Number(a.valor_brl).toLocaleString("pt-BR",{minimumFractionDigits:2})}/ano</span>}
                          {!ehSacas && <span style={{ fontSize: 10, background: "#FBF3E0", color: "#7A5A12", padding: "2px 8px", borderRadius: 8, fontWeight: 600 }}>Impacta fluxo de caixa</span>}
                          <span style={{ fontSize: 10, background: "#D5E8F5", color: "#0B2D50", padding: "2px 8px", borderRadius: 8, fontWeight: 600 }}>{label}</span>
                          <button style={{ ...btnX, marginLeft: 4 }} onClick={() => setFazArrendamentos(p => p.filter((_,j) => j!==ai))}>Remover</button>
                        </div>
                        {/* Card body */}
                        <div style={{ padding: "14px 16px" }}>
                          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 12 }}>
                            <div>
                              <label style={lbl}>Proprietário / Locador</label>
                              <select style={inp} value={a.proprietario_id} onChange={e => {
                                const pid = e.target.value;
                                const pnome = pessoas.find(p => p.id === pid)?.nome ?? "";
                                setFazArrendamentos(p => p.map((x,j) => j===ai ? {...x,proprietario_id:pid,proprietario_nome:pnome} : x));
                              }}>
                                <option value="">Selecione a pessoa…</option>
                                {pessoas.map(p => <option key={p.id} value={p.id}>{p.nome} ({p.tipo.toUpperCase()})</option>)}
                              </select>
                            </div>
                            <div>
                              <label style={lbl}>Área arrendada (ha)</label>
                              <InputMonetario style={inp} value={a.area_ha} onChange={v => setFazArrendamentos(p => p.map((x,j) => j===ai ? {...x,area_ha:String(v)} : x))} />
                            </div>
                            <div>
                              <label style={lbl}>Forma de pagamento</label>
                              <select style={inp} value={a.forma_pagamento} onChange={e => setFazArrendamentos(p => p.map((x,j) => j===ai ? {...x,forma_pagamento:e.target.value as ArrFaz["forma_pagamento"]} : x))}>
                                <option value="sc_soja">Sacas de soja / ha / ano</option>
                                <option value="sc_milho">Sacas de milho / ha / ano</option>
                                <option value="sc_soja_milho">Sc soja + milho (misto)</option>
                                <option value="brl">Valor em R$ (total ano)</option>
                              </select>
                            </div>
                            {/* Sc soja (único ou parte do misto) */}
                            {ehSacas && !ehMisto && (
                              <div>
                                <label style={lbl}>Sacas / ha / ano</label>
                                <InputNumerico style={inp} placeholder="ex: 12" value={a.sc_ha} onChange={v => setFazArrendamentos(p => p.map((x,j) => j===ai ? {...x,sc_ha:v} : x))} />
                                {totalScs && <div style={{ fontSize: 10, color: "#14532D", marginTop: 3 }}>Total: {totalScs} sc comprometidas</div>}
                              </div>
                            )}
                            {/* Misto: dois campos separados */}
                            {ehMisto && (
                              <>
                                <div>
                                  <label style={lbl}>Soja (sc/ha/ano) <span style={{ fontSize: 9, color: "#16A34A", fontWeight: 600 }}>SOJA</span></label>
                                  <InputNumerico style={inp} placeholder="ex: 8" value={a.sc_ha} onChange={v => setFazArrendamentos(p => p.map((x,j) => j===ai ? {...x,sc_ha:v} : x))} />
                                  {Number(a.sc_ha) > 0 && <div style={{ fontSize: 10, color: "#14532D", marginTop: 3 }}>Total: {totalScsSoja} sc soja comprometidas</div>}
                                </div>
                                <div>
                                  <label style={lbl}>Milho (sc/ha/ano) <span style={{ fontSize: 9, color: "#C9921B", fontWeight: 600 }}>MILHO</span></label>
                                  <InputNumerico style={inp} placeholder="ex: 20" value={a.sc_milho_ha} onChange={v => setFazArrendamentos(p => p.map((x,j) => j===ai ? {...x,sc_milho_ha:v} : x))} />
                                  {Number(a.sc_milho_ha) > 0 && <div style={{ fontSize: 10, color: "#7A5200", marginTop: 3 }}>Total: {totalScsMilho} sc milho comprometidas</div>}
                                </div>
                              </>
                            )}
                            {!ehSacas && (
                              <div>
                                <label style={lbl}>Valor total do arrendamento (R$/ano)</label>
                                <InputMonetario style={inp} value={a.valor_brl} onChange={v => setFazArrendamentos(p => p.map((x,j) => j===ai ? {...x,valor_brl:String(v)} : x))} />
                                {brlPorHa && <div style={{ fontSize: 10, color: "#C9921B", marginTop: 3 }}>Equivale a R$ {Number(brlPorHa).toLocaleString("pt-BR",{minimumFractionDigits:2})}/ha · Impacta fluxo de caixa</div>}
                              </div>
                            )}
                            <div><label style={lbl}>Início</label><input style={inp} type="date" value={a.inicio} onChange={e => setFazArrendamentos(p => p.map((x,j) => j===ai ? {...x,inicio:e.target.value} : x))} /></div>
                            <div><label style={lbl}>Vencimento</label><input style={inp} type="date" value={a.vencimento} onChange={e => setFazArrendamentos(p => p.map((x,j) => j===ai ? {...x,vencimento:e.target.value} : x))} /></div>
                            <div style={{ display: "flex", alignItems: "flex-end", paddingBottom: 2 }}>
                              <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 13 }}>
                                <input type="checkbox" checked={a.renovacao_auto} onChange={e => setFazArrendamentos(p => p.map((x,j) => j===ai ? {...x,renovacao_auto:e.target.checked} : x))} />
                                Renovação automática
                              </label>
                            </div>
                            <div style={{ gridColumn: "1/3" }}><label style={lbl}>Observação</label><input style={inp} value={a.observacao} onChange={e => setFazArrendamentos(p => p.map((x,j) => j===ai ? {...x,observacao:e.target.value} : x))} /></div>
                            <div>
                              <label style={lbl}>Agricultor Responsável (LCDPR)</label>
                              <ProdutorCombo
                                produtores={produtores}
                                value={a.produtor_id}
                                onChange={id => setFazArrendamentos(p => p.map((x,j) => j===ai ? {...x,produtor_id:id} : x))}
                                placeholder="Não especificado"
                              />
                            </div>
                            <div>
                              <label style={lbl}>2º Agricultor (contrato conjunto)</label>
                              <ProdutorCombo
                                produtores={produtores}
                                value={a.produtor_id_2}
                                onChange={id => setFazArrendamentos(p => p.map((x,j) => j===ai ? {...x,produtor_id_2:id} : x))}
                                placeholder="—"
                                excludeId={a.produtor_id || undefined}
                              />
                            </div>
                          </div>
                          {/* Matrículas do arrendamento */}
                          <div style={{ paddingTop: 10, borderTop: "0.5px solid #EEF1F8" }}>
                            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                              <span style={{ fontSize: 11, fontWeight: 700, color: "#555", textTransform: "uppercase", letterSpacing: 0.5 }}>Matrículas vinculadas a este arrendamento ({a.mats.length})</span>
                              <button style={{ ...btnV, background: "#C9921B", fontSize: 11, padding: "5px 10px" }} onClick={() => setFazArrendamentos(p => p.map((x,j) => j===ai ? {...x, mats:[...x.mats,{_key:`m_${Date.now()}`,numero:"",area_ha:"",cartorio:""}]} : x))}>+ Matrícula</button>
                            </div>
                            {a.mats.map((m, mi) => (
                              <div key={m._key} style={{ display: "grid", gridTemplateColumns: "1fr 100px 1fr auto", gap: 8, marginBottom: 8 }}>
                                <div><input style={{ ...inp, padding: "6px 8px", fontSize: 12 }} value={m.numero} onChange={e => setFazArrendamentos(p => p.map((x,j) => j===ai ? {...x, mats: x.mats.map((mm,k) => k===mi ? {...mm,numero:e.target.value} : mm)} : x))} placeholder="N° matrícula" /></div>
                                <div><InputMonetario style={{ ...inp, padding: "6px 8px", fontSize: 12 }} value={m.area_ha} onChange={v => setFazArrendamentos(p => p.map((x,j) => j===ai ? {...x, mats: x.mats.map((mm,k) => k===mi ? {...mm,area_ha:String(v)} : mm)} : x))} placeholder="ha" /></div>
                                <div><input style={{ ...inp, padding: "6px 8px", fontSize: 12 }} value={m.cartorio} onChange={e => setFazArrendamentos(p => p.map((x,j) => j===ai ? {...x, mats: x.mats.map((mm,k) => k===mi ? {...mm,cartorio:e.target.value} : mm)} : x))} placeholder="Cartório" /></div>
                                <button style={btnX} onClick={() => setFazArrendamentos(p => p.map((x,j) => j===ai ? {...x, mats: x.mats.filter((_,k) => k!==mi)} : x))}>✕</button>
                              </div>
                            ))}
                            {a.mats.length === 0 && <div style={{ fontSize: 12, color: "#888", padding: "8px 0" }}>Nenhuma matrícula vinculada a este arrendamento.</div>}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  {fazArrendamentos.length === 0 && (
                    <div style={{ textAlign: "center", padding: 40, color: "#888", fontSize: 13, border: "0.5px dashed #D4DCE8", borderRadius: 10 }}>
                      Nenhuma área arrendada cadastrada.<br /><span style={{ fontSize: 12 }}>Clique em "+ Novo Arrendamento" abaixo.</span>
                    </div>
                  )}
                </div>
                <button style={{ ...btnV, background: "#C9921B", marginTop: 14 }} onClick={() => setFazArrendamentos(p => [...p, { _key: `arr_${Date.now()}`, proprietario_id: "", proprietario_nome: "", area_ha: "", forma_pagamento: "sc_soja", sc_ha: "", sc_milho_ha: "", valor_brl: "", ano_safra_id: "", inicio: "", vencimento: "", renovacao_auto: false, observacao: "", produtor_id: "", produtor_id_2: "", aberto: true, mats: [] }])}>+ Novo Arrendamento</button>
                {!fFaz.area && <div style={{ fontSize: 11, color: "#888", marginTop: 8 }}>Dica: preencha a Área total na aba Dados Gerais para calcular percentuais.</div>}
              </div>
            )}

            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 24, paddingTop: 16, borderTop: "0.5px solid #D4DCE8" }}>
              <button style={btnR} onClick={() => setModalFaz(false)}>Cancelar</button>
              <button style={{ ...btnV, opacity: salvando || !fFaz.nome.trim() || !fFaz.area ? 0.5 : 1 }} disabled={salvando || !fFaz.nome.trim() || !fFaz.area} onClick={salvarFaz}>{salvando ? "Salvando…" : "Salvar Fazenda"}</button>
            </div>
          </Modal>
        );
      })()}

      {/* Modal Talhão */}
      {modalTalhao && (
        <Modal titulo={editTalhao ? "Editar Talhão" : "Novo Talhão"} subtitulo={fazendas.find(f => f.id === modalTalhao)?.nome} onClose={() => setModalTalhao(null)} width={760}>

          {/* Linha 1: Nome + Áreas + Tipo de Posse */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 140px 140px 220px", gap: 14, marginBottom: 14 }}>
            <div><label style={lbl}>Nome *</label><input style={inp} value={fTalhao.nome} onChange={e => setFTalhao(p => ({ ...p, nome: e.target.value }))} /></div>
            <div>
              <label style={lbl}>Área Total (ha) *</label>
              <InputNumerico style={inp} value={fTalhao.area} onChange={v => setFTalhao(p => ({ ...p, area: v }))} />
            </div>
            <div>
              <label style={lbl}>Área Plantada (ha)</label>
              <InputNumerico style={inp} placeholder={fTalhao.area || "—"} value={fTalhao.area_plantada} onChange={v => setFTalhao(p => ({ ...p, area_plantada: v }))} />
            </div>
            <div>
              <label style={lbl}>Tipo de Posse</label>
              <div style={{ display: "flex", border: "0.5px solid #D4DCE8", borderRadius: 8, overflow: "hidden" }}>
                {(["proprio", "arrendado"] as const).map(v => (
                  <button key={v} type="button"
                    onClick={() => setFTalhao(p => ({ ...p, tipo_posse: v, arrendamento_ids: v === "proprio" ? [] : p.arrendamento_ids }))}
                    style={{ flex: 1, padding: "8px 0", border: "none", cursor: "pointer", fontSize: 13, fontWeight: fTalhao.tipo_posse === v ? 700 : 400,
                      background: fTalhao.tipo_posse === v ? (v === "arrendado" ? "#C9921B" : "#1A4870") : "#fff",
                      color: fTalhao.tipo_posse === v ? "#fff" : "#555" }}>
                    {v === "proprio" ? "🏡 Próprio" : "🤝 Arrendado"}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Arrendamentos vinculados — múltiplos, só quando arrendado */}
          {fTalhao.tipo_posse === "arrendado" && (
            <div style={{ marginBottom: 14, padding: "14px 16px", background: "#FBF3E0", border: "0.5px solid #C9921B40", borderRadius: 10 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                <label style={{ ...lbl, color: "#7A4300", marginBottom: 0 }}>
                  Contratos de Arrendamento vinculados
                  {fTalhao.arrendamento_ids.length > 0 && (
                    <span style={{ marginLeft: 6, background: "#C9921B", color: "#fff", borderRadius: 10, padding: "0 7px", fontSize: 11, fontWeight: 700 }}>
                      {fTalhao.arrendamento_ids.length}
                    </span>
                  )}
                </label>
                {fTalhao.arrendamento_ids.length > 0 && (
                  <button type="button" onClick={() => setFTalhao(p => ({ ...p, arrendamento_ids: [] }))}
                    style={{ fontSize: 11, color: "#7A4300", background: "none", border: "none", cursor: "pointer", textDecoration: "underline" }}>
                    Limpar seleção
                  </button>
                )}
              </div>
              {talhaoArrs.length === 0 ? (
                <div style={{ fontSize: 12, color: "#7A4300" }}>
                  Nenhum arrendamento cadastrado para esta fazenda. Cadastre em Fazendas › aba Arrendamentos primeiro.
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {talhaoArrs.filter(a => !talhaoArrsUsados.includes(a.id)).map(a => {
                    const prop = pessoas.find(p => p.id === a.proprietario_id);
                    const proprietario = prop?.nome ?? a.proprietario_nome ?? "Proprietário não informado";
                    const valorLabel = a.forma_pagamento === "sc_soja_milho"
                      ? `${a.sc_ha ?? 0} sc soja + ${a.sc_milho_ha ?? 0} sc milho/ha`
                      : a.forma_pagamento === "brl"
                        ? `R$ ${(a.valor_brl ?? 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}/ano`
                        : `${(a.sc_ha ?? 0).toLocaleString("pt-BR")} sc ${{ sc_soja: "soja", sc_milho: "milho" }[a.forma_pagamento] ?? ""}/ha`;
                    const checked = fTalhao.arrendamento_ids.includes(a.id);
                    const toggle = () => setFTalhao(p => ({
                      ...p,
                      arrendamento_ids: checked
                        ? p.arrendamento_ids.filter(id => id !== a.id)
                        : [...p.arrendamento_ids, a.id],
                    }));
                    return (
                      <label key={a.id} onClick={toggle} style={{ display: "flex", alignItems: "flex-start", gap: 10, cursor: "pointer",
                        padding: "8px 10px", borderRadius: 7, border: `0.5px solid ${checked ? "#C9921B" : "#DDD"}`,
                        background: checked ? "#FFF7E8" : "#fff", transition: "all .15s" }}>
                        <div style={{ marginTop: 2, width: 16, height: 16, flexShrink: 0, borderRadius: 4,
                          border: `2px solid ${checked ? "#C9921B" : "#ccc"}`,
                          background: checked ? "#C9921B" : "#fff", display: "flex", alignItems: "center", justifyContent: "center" }}>
                          {checked && <span style={{ color: "#fff", fontSize: 11, fontWeight: 700, lineHeight: 1 }}>✓</span>}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: 600, fontSize: 13, color: "#3A2000" }}>{proprietario}</div>
                          <div style={{ fontSize: 11, color: "#7A4300", marginTop: 2, display: "flex", gap: 12, flexWrap: "wrap" }}>
                            {a.area_ha && <span>📐 {a.area_ha.toLocaleString("pt-BR")} ha</span>}
                            <span>💰 {valorLabel}</span>
                            {a.inicio && <span>Início: {new Date(a.inicio + "T12:00").toLocaleDateString("pt-BR")}</span>}
                            {a.vencimento && <span>Venc.: {new Date(a.vencimento + "T12:00").toLocaleDateString("pt-BR")}</span>}
                          </div>
                        </div>
                      </label>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Documentação — Matrículas e CARs */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 14 }}>

            {/* Matrículas */}
            <div style={{ padding: "12px 14px", background: "#EEF5FF", border: "0.5px solid #1A487040", borderRadius: 10 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                <label style={{ ...lbl, color: "#0B2D50", marginBottom: 0 }}>
                  Matrículas de Imóvel
                  {fTalhao.matricula_ids.length > 0 && (
                    <span style={{ marginLeft: 6, background: "#1A4870", color: "#fff", borderRadius: 10, padding: "0 7px", fontSize: 11, fontWeight: 700 }}>
                      {fTalhao.matricula_ids.length}
                    </span>
                  )}
                </label>
                {fTalhao.matricula_ids.length > 0 && (
                  <button type="button" onClick={() => setFTalhao(p => ({ ...p, matricula_ids: [] }))}
                    style={{ fontSize: 11, color: "#0B2D50", background: "none", border: "none", cursor: "pointer", textDecoration: "underline" }}>
                    Limpar
                  </button>
                )}
              </div>
              {talhaoMatsFaz.length === 0 ? (
                <div style={{ fontSize: 12, color: "#5A7090" }}>
                  Nenhuma matrícula cadastrada nesta fazenda. Cadastre em Fazendas › aba Matrículas primeiro.
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 5, maxHeight: 180, overflowY: "auto" }}>
                  {talhaoMatsFaz.map(m => {
                    const checked = fTalhao.matricula_ids.includes(m.id);
                    const toggle = () => setFTalhao(p => ({
                      ...p,
                      matricula_ids: checked ? p.matricula_ids.filter(id => id !== m.id) : [...p.matricula_ids, m.id],
                    }));
                    return (
                      <label key={m.id} onClick={toggle} style={{ display: "flex", alignItems: "flex-start", gap: 8, cursor: "pointer",
                        padding: "6px 8px", borderRadius: 7, border: `0.5px solid ${checked ? "#1A4870" : "#C5D8EE"}`,
                        background: checked ? "#D5E8F5" : "#fff", transition: "all .15s" }}>
                        <div style={{ marginTop: 1, width: 15, height: 15, flexShrink: 0, borderRadius: 3,
                          border: `2px solid ${checked ? "#1A4870" : "#9AB5CC"}`,
                          background: checked ? "#1A4870" : "#fff", display: "flex", alignItems: "center", justifyContent: "center" }}>
                          {checked && <span style={{ color: "#fff", fontSize: 10, fontWeight: 700, lineHeight: 1 }}>✓</span>}
                        </div>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontWeight: 600, fontSize: 12, color: "#0B2D50" }}>Matrícula {m.numero}</div>
                          {(m.cartorio || m.area_ha) && (
                            <div style={{ fontSize: 11, color: "#5A7090", marginTop: 1 }}>
                              {m.cartorio && <span>{m.cartorio}</span>}
                              {m.area_ha && <span style={{ marginLeft: m.cartorio ? 8 : 0 }}>📐 {Number(m.area_ha).toLocaleString("pt-BR")} ha</span>}
                            </div>
                          )}
                        </div>
                      </label>
                    );
                  })}
                </div>
              )}
            </div>

            {/* CARs */}
            <div style={{ padding: "12px 14px", background: "#F0FAF0", border: "0.5px solid #16A34A40", borderRadius: 10 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                <label style={{ ...lbl, color: "#14532D", marginBottom: 0 }}>
                  CAR — Cadastro Ambiental Rural
                  {fTalhao.car_ids.length > 0 && (
                    <span style={{ marginLeft: 6, background: "#16A34A", color: "#fff", borderRadius: 10, padding: "0 7px", fontSize: 11, fontWeight: 700 }}>
                      {fTalhao.car_ids.length}
                    </span>
                  )}
                </label>
                {fTalhao.car_ids.length > 0 && (
                  <button type="button" onClick={() => setFTalhao(p => ({ ...p, car_ids: [] }))}
                    style={{ fontSize: 11, color: "#14532D", background: "none", border: "none", cursor: "pointer", textDecoration: "underline" }}>
                    Limpar
                  </button>
                )}
              </div>
              {talhaoCarsFaz.length === 0 ? (
                <div style={{ fontSize: 12, color: "#3D7A3D" }}>
                  Nenhum CAR cadastrado nesta fazenda. Cadastre em Fazendas › aba CAR primeiro.
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 5, maxHeight: 180, overflowY: "auto" }}>
                  {talhaoCarsFaz.map(c => {
                    const checked = fTalhao.car_ids.includes(c.id);
                    const toggle = () => setFTalhao(p => ({
                      ...p,
                      car_ids: checked ? p.car_ids.filter(id => id !== c.id) : [...p.car_ids, c.id],
                    }));
                    const statusColor = c.status === "ativo" ? "#16A34A" : c.status === "pendente" ? "#EF9F27" : "#888";
                    return (
                      <label key={c.id} onClick={toggle} style={{ display: "flex", alignItems: "flex-start", gap: 8, cursor: "pointer",
                        padding: "6px 8px", borderRadius: 7, border: `0.5px solid ${checked ? "#16A34A" : "#B8DDB8"}`,
                        background: checked ? "#DCFCE7" : "#fff", transition: "all .15s" }}>
                        <div style={{ marginTop: 1, width: 15, height: 15, flexShrink: 0, borderRadius: 3,
                          border: `2px solid ${checked ? "#16A34A" : "#8FBF8F"}`,
                          background: checked ? "#16A34A" : "#fff", display: "flex", alignItems: "center", justifyContent: "center" }}>
                          {checked && <span style={{ color: "#fff", fontSize: 10, fontWeight: 700, lineHeight: 1 }}>✓</span>}
                        </div>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontWeight: 600, fontSize: 12, color: "#14532D", wordBreak: "break-all" }}>
                            {c.numero}
                            <span style={{ marginLeft: 6, fontSize: 10, color: statusColor, fontWeight: 700, textTransform: "uppercase" }}>{c.status}</span>
                          </div>
                          {c.area_ha && (
                            <div style={{ fontSize: 11, color: "#3D7A3D", marginTop: 1 }}>📐 {Number(c.area_ha).toLocaleString("pt-BR")} ha</div>
                          )}
                        </div>
                      </label>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Linha 2: Solo + GPS */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14 }}>
            <div><label style={lbl}>Tipo de Solo</label><select style={inp} value={fTalhao.solo} onChange={e => setFTalhao(p => ({ ...p, solo: e.target.value }))}>{SOLOS.map(s => <option key={s}>{s}</option>)}</select></div>
            <div><label style={lbl}>Latitude GPS</label><InputNumerico style={inp} decimais={4} placeholder="-13.8283" value={fTalhao.lat} onChange={v => setFTalhao(p => ({ ...p, lat: v }))} /></div>
            <div><label style={lbl}>Longitude GPS</label><InputNumerico style={inp} decimais={4} placeholder="-56.0801" value={fTalhao.lng} onChange={v => setFTalhao(p => ({ ...p, lng: v }))} /></div>
          </div>

          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 20 }}>
            <button style={btnR} onClick={() => setModalTalhao(null)}>Cancelar</button>
            <button style={{ ...btnV, background: "#C9921B", opacity: salvando || !fTalhao.nome.trim() || !fTalhao.area ? 0.5 : 1 }} disabled={salvando || !fTalhao.nome.trim() || !fTalhao.area} onClick={salvarTalhao}>{salvando ? "Salvando…" : "Salvar Talhão"}</button>
          </div>
        </Modal>
      )}

      {/* Modal Matrícula */}
      {modalMatricula && (
        <Modal titulo={editMatricula ? "Editar Matrícula" : "Nova Matrícula"} subtitulo={fazendas.find(f => f.id === modalMatricula)?.nome} onClose={() => setModalMatricula(null)} width={760}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14 }}>
            <div><label style={lbl}>Nº Matrícula *</label><input style={inp} value={fMat.numero} onChange={e => setFMat(p => ({ ...p, numero: e.target.value }))} /></div>
            <div><label style={lbl}>Cartório</label><input style={inp} value={fMat.cartorio} onChange={e => setFMat(p => ({ ...p, cartorio: e.target.value }))} /></div>
            <div><label style={lbl}>Área registrada (ha)</label><InputNumerico style={inp} decimais={4} value={fMat.area_ha} onChange={v => setFMat(p => ({ ...p, area_ha: v }))} /></div>
            <div style={{ gridColumn: "1/3" }}>
              <label style={lbl}>Produtor vinculado</label>
              <ProdutorCombo
                produtores={produtores}
                value={fMat.produtor_id}
                onChange={id => setFMat(p => ({ ...p, produtor_id: id }))}
                placeholder="Selecione…"
              />
            </div>
            <div />
            <div style={{ gridColumn: "1/-1" }}><label style={lbl}>Descrição</label><input style={inp} value={fMat.descricao} onChange={e => setFMat(p => ({ ...p, descricao: e.target.value }))} /></div>
            <div style={{ gridColumn: "1/-1" }}>
              <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 13, color: "#1a1a1a" }}>
                <input type="checkbox" checked={fMat.em_garantia} onChange={e => setFMat(p => ({ ...p, em_garantia: e.target.checked }))} />
                Matrícula dada em garantia em operação financeira
              </label>
            </div>
            {fMat.em_garantia && (
              <>
                <div><label style={lbl}>Banco / Instituição</label><input style={inp} value={fMat.garantia_banco} onChange={e => setFMat(p => ({ ...p, garantia_banco: e.target.value }))} /></div>
                <div><label style={lbl}>Valor da garantia (R$)</label><InputMonetario style={inp} value={fMat.garantia_valor} onChange={v => setFMat(p => ({ ...p, garantia_valor: String(v) }))} /></div>
                <div><label style={lbl}>Vencimento da garantia</label><input style={inp} type="date" value={fMat.garantia_vencimento} onChange={e => setFMat(p => ({ ...p, garantia_vencimento: e.target.value }))} /></div>
              </>
            )}
          </div>
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 20 }}>
            <button style={btnR} onClick={() => setModalMatricula(null)}>Cancelar</button>
            <button style={{ ...btnV, background: "#C9921B", opacity: salvando || !fMat.numero.trim() ? 0.5 : 1 }} disabled={salvando || !fMat.numero.trim()} onClick={salvarMatricula}>{salvando ? "Salvando…" : "Salvar Matrícula"}</button>
          </div>
        </Modal>
      )}

      {/* Modal Pessoa */}
      {modalPes && (
        <Modal titulo={editPes ? "Editar Pessoa" : "Nova Pessoa"} onClose={() => setModalPes(false)} width={960}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 0, columnGap: 16, rowGap: 0 }}>

            {/* ── Seção 1: Identificação ── */}
            <div style={{ gridColumn: "1/-1", fontSize: 11, fontWeight: 700, color: "#1A4870", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 10 }}>Identificação</div>
            <div style={{ gridColumn: "1/-1", marginBottom: 14 }}><label style={lbl}>Nome / Razão Social *</label><input style={inp} value={fPes.nome} onChange={e => setFPes(p => ({ ...p, nome: e.target.value }))} /></div>
            <div style={{ marginBottom: 14 }}>
              <label style={lbl}>Tipo</label>
              <select style={inp} value={fPes.tipo} onChange={e => setFPes(p => ({ ...p, tipo: e.target.value as "pf"|"pj", cpf_cnpj: "" }))}>
                <option value="pj">Pessoa Jurídica (CNPJ)</option>
                <option value="pf">Pessoa Física (CPF)</option>
              </select>
            </div>
            <div style={{ marginBottom: 14 }}>
              <label style={lbl}>{fPes.tipo === "pf" ? "CPF" : "CNPJ"}</label>
              <div style={{ display: "flex", gap: 6 }}>
                <input style={{ ...inp, flex: 1 }} value={fPes.cpf_cnpj} onChange={e => setFPes(p => ({ ...p, cpf_cnpj: maskCpfCnpj(e.target.value, p.tipo) }))} placeholder={fPes.tipo === "pf" ? "000.000.000-00" : "00.000.000/0001-00"} />
                {fPes.tipo === "pj" && <button style={{ ...btnR, padding: "7px 10px", fontSize: 11, whiteSpace: "nowrap" }} onClick={buscarCnpjPes} disabled={buscandoCnpj}>{buscandoCnpj ? "…" : "Buscar"}</button>}
              </div>
            </div>
            <div style={{ marginBottom: 14 }}><label style={lbl}>Inscrição Estadual</label><input style={inp} value={fPes.inscricao_est} onChange={e => setFPes(p => ({ ...p, inscricao_est: e.target.value }))} /></div>
            <div style={{ gridColumn: "1/-1", display: "flex", gap: 24, padding: "8px 12px", background: "#F4F6FA", borderRadius: 8, marginBottom: 14 }}>
              <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", fontSize: 13 }}><input type="checkbox" checked={fPes.cliente} onChange={e => setFPes(p => ({ ...p, cliente: e.target.checked, criar_deposito_terceiro: e.target.checked ? p.criar_deposito_terceiro : false }))} />Cliente comprador</label>
              <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", fontSize: 13 }}><input type="checkbox" checked={fPes.fornecedor} onChange={e => setFPes(p => ({ ...p, fornecedor: e.target.checked }))} />Fornecedor</label>
              {fPes.cliente && !editPes && (
                <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", fontSize: 13, color: "#1A4870", fontWeight: 500 }}>
                  <input type="checkbox" checked={fPes.criar_deposito_terceiro} onChange={e => setFPes(p => ({ ...p, criar_deposito_terceiro: e.target.checked }))} />
                  Criar depósito de terceiro vinculado
                  <span style={{ fontSize: 11, color: "#888", fontWeight: 400 }}>(para controle de insumos em poder deste cliente)</span>
                </label>
              )}
            </div>
            <div style={{ marginBottom: 14 }}><label style={lbl}>E-mail</label><input style={inp} type="email" value={fPes.email} onChange={e => setFPes(p => ({ ...p, email: e.target.value }))} /></div>
            <div style={{ marginBottom: 14 }}><label style={lbl}>Telefone</label><input style={inp} value={fPes.telefone} onChange={e => setFPes(p => ({ ...p, telefone: maskPhone(e.target.value) }))} placeholder="(00) 00000-0000" /></div>
            <div style={{ marginBottom: 14 }}><label style={lbl}>Nome do Contato</label><input style={inp} value={fPes.nome_contato} onChange={e => setFPes(p => ({ ...p, nome_contato: e.target.value }))} /></div>
            <div style={{ marginBottom: 20 }}><label style={lbl}>Telefone WhatsApp (contato)</label><input style={inp} value={fPes.telefone_contato} onChange={e => setFPes(p => ({ ...p, telefone_contato: maskPhone(e.target.value) }))} placeholder="(00) 00000-0000" /></div>

            {/* ── Seção 2: Endereço ── */}
            <div style={{ gridColumn: "1/-1", fontSize: 11, fontWeight: 700, color: "#1A4870", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 10, paddingTop: 4, borderTop: "0.5px solid #D4DCE8" }}>Endereço</div>
            <div style={{ marginBottom: 14 }}>
              <label style={lbl}>CEP</label>
              <input style={inp} value={fPes.cep} placeholder="00000-000" onChange={e => { const v = maskCep(e.target.value); setFPes(p => ({ ...p, cep: v })); buscarCepPes(v); }} />
            </div>
            <div style={{ gridColumn: "2/4", marginBottom: 14 }}><label style={lbl}>Logradouro</label><input style={inp} value={fPes.logradouro} onChange={e => setFPes(p => ({ ...p, logradouro: e.target.value }))} /></div>
            <div style={{ marginBottom: 14 }}><label style={lbl}>Número</label><input style={inp} value={fPes.numero} onChange={e => setFPes(p => ({ ...p, numero: e.target.value }))} /></div>
            <div style={{ marginBottom: 14 }}><label style={lbl}>Complemento</label><input style={inp} value={fPes.complemento} onChange={e => setFPes(p => ({ ...p, complemento: e.target.value }))} /></div>
            <div style={{ marginBottom: 14 }}><label style={lbl}>Bairro</label><input style={inp} value={fPes.bairro} onChange={e => setFPes(p => ({ ...p, bairro: e.target.value }))} /></div>
            <div style={{ gridColumn: "1/3", marginBottom: 20 }}><label style={lbl}>Município</label><input style={inp} value={fPes.municipio} onChange={e => setFPes(p => ({ ...p, municipio: e.target.value }))} /></div>
            <div style={{ marginBottom: 20 }}><label style={lbl}>Estado</label><select style={inp} value={fPes.estado} onChange={e => setFPes(p => ({ ...p, estado: e.target.value }))}>{ESTADOS.map(s => <option key={s}>{s}</option>)}</select></div>

            {/* ── Seção 3: Tributação ── */}
            <div style={{ gridColumn: "1/-1", fontSize: 11, fontWeight: 700, color: "#1A4870", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 10, paddingTop: 4, borderTop: "0.5px solid #D4DCE8" }}>Tributação</div>
            <div style={{ marginBottom: fPes.situacao_cadastral ? 14 : 20 }}>
              <label style={lbl}>Regime Tributário</label>
              <select style={inp} value={fPes.regime_tributario} onChange={e => setFPes(p => ({ ...p, regime_tributario: e.target.value }))}>
                <option value="">Não informado</option>
                <option value="simples">Simples Nacional</option>
                <option value="presumido">Lucro Presumido</option>
                <option value="real">Lucro Real</option>
                <option value="mei">MEI</option>
                <option value="produtor_rural">Produtor Rural (PF)</option>
                <option value="isento">Isento / Não contribuinte</option>
              </select>
            </div>
            <div style={{ marginBottom: fPes.situacao_cadastral ? 14 : 20 }}><label style={lbl}>CNAE Principal</label><input style={inp} value={fPes.cnae} onChange={e => setFPes(p => ({ ...p, cnae: e.target.value }))} placeholder="0000-0/00" /></div>
            {fPes.situacao_cadastral
              ? <div style={{ marginBottom: 20 }}><label style={lbl}>Situação Cadastral</label><input style={{ ...inp, background: "#F4F6FA", color: "#555" }} value={fPes.situacao_cadastral} readOnly /></div>
              : <div />
            }

            {/* ── Seção 4: Subcategorias ── */}
            {(() => {
              const SUBCATS_PADRAO = [
                "Prestador de Serviço",
                "Loja de Peças, Acessórios e Ferramentas",
                "Instituição Financeira",
                "Arrendante",
                "Loja de Máquinas e Implementos",
                "Mercado / Supermercado",
                "Fornecedor de Insumos",
                "Fornecedor de Combustíveis",
              ];
              const toggle = (v: string) => setFPes(p => ({
                ...p,
                subcategorias: p.subcategorias.includes(v)
                  ? p.subcategorias.filter(x => x !== v)
                  : [...p.subcategorias, v],
              }));
              const adicionarCustom = () => {
                const v = novaSubcat.trim();
                if (!v || fPes.subcategorias.includes(v)) { setNovaSubcat(""); return; }
                setFPes(p => ({ ...p, subcategorias: [...p.subcategorias, v] }));
                setNovaSubcat("");
              };
              return (
                <div style={{ gridColumn: "1/-1", marginBottom: 20, paddingTop: 4, borderTop: "0.5px solid #D4DCE8" }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: "#1A4870", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 12 }}>Subcategorias</div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 10 }}>
                    {SUBCATS_PADRAO.map(s => {
                      const ativo = fPes.subcategorias.includes(s);
                      return (
                        <button key={s} onClick={() => toggle(s)} style={{
                          padding: "5px 12px", border: `0.5px solid ${ativo ? "#1A4870" : "#D4DCE8"}`,
                          borderRadius: 20, fontSize: 12, cursor: "pointer", userSelect: "none",
                          background: ativo ? "#D5E8F5" : "#fff",
                          color: ativo ? "#0B2D50" : "#555",
                          fontWeight: ativo ? 600 : 400,
                        }}>{ativo ? "✓ " : ""}{s}</button>
                      );
                    })}
                    {/* Subcategorias customizadas (não padrão) */}
                    {fPes.subcategorias.filter(s => !SUBCATS_PADRAO.includes(s)).map(s => (
                      <span key={s} style={{ display: "flex", alignItems: "center", gap: 4, padding: "5px 10px", border: "0.5px solid #C9921B", borderRadius: 20, fontSize: 12, background: "#FBF3E0", color: "#7A5A12", fontWeight: 600 }}>
                        {s}
                        <button onClick={() => toggle(s)} style={{ border: "none", background: "transparent", cursor: "pointer", color: "#C9921B", fontSize: 13, lineHeight: 1, padding: "0 0 0 2px" }}>×</button>
                      </span>
                    ))}
                  </div>
                  {/* Adicionar subcategoria personalizada */}
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <input style={{ ...inp, width: 260, fontSize: 12 }}
                      value={novaSubcat}
                      onChange={e => setNovaSubcat(e.target.value)}
                      onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); adicionarCustom(); } }}
                      placeholder="Adicionar subcategoria personalizada…" />
                    <button onClick={adicionarCustom} style={{ padding: "7px 14px", border: "0.5px solid #C9921B", borderRadius: 8, background: "#FBF3E0", color: "#7A5A12", cursor: "pointer", fontSize: 12, fontWeight: 600, whiteSpace: "nowrap" }}>+ Adicionar</button>
                  </div>
                </div>
              );
            })()}

            {/* ── Seção 5: Pagamento (somente fornecedor) ── */}
            {fPes.fornecedor && (
              <>
                <div style={{ gridColumn: "1/-1", fontSize: 11, fontWeight: 700, color: "#1A4870", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 10, paddingTop: 4, borderTop: "0.5px solid #D4DCE8" }}>Dados de Pagamento</div>
                <div style={{ marginBottom: 14 }}><label style={lbl}>Banco</label><input style={inp} value={fPes.banco_nome} onChange={e => setFPes(p => ({ ...p, banco_nome: e.target.value }))} placeholder="Ex: Banco do Brasil" /></div>
                <div style={{ marginBottom: 14 }}>
                  <label style={lbl}>Tipo de Conta</label>
                  <select style={inp} value={fPes.banco_tipo} onChange={e => setFPes(p => ({ ...p, banco_tipo: e.target.value }))}>
                    <option value="">Selecione</option>
                    <option value="corrente">Corrente</option>
                    <option value="poupanca">Poupança</option>
                    <option value="pagamento">Conta Pagamento</option>
                  </select>
                </div>
                <div style={{ marginBottom: 14 }}><label style={lbl}>Agência</label><input style={inp} value={fPes.banco_agencia} onChange={e => setFPes(p => ({ ...p, banco_agencia: e.target.value }))} placeholder="0000" /></div>
                <div style={{ marginBottom: 14 }}><label style={lbl}>Conta</label><input style={inp} value={fPes.banco_conta} onChange={e => setFPes(p => ({ ...p, banco_conta: e.target.value }))} placeholder="00000-0" /></div>
                <div style={{ marginBottom: 14 }}>
                  <label style={lbl}>Tipo de Chave PIX</label>
                  <select style={inp} value={fPes.pix_tipo} onChange={e => {
                    const tipo = e.target.value;
                    setFPes(p => ({
                      ...p,
                      pix_tipo: tipo,
                      pix_chave: (tipo === "cpf" || tipo === "cnpj") ? (p.cpf_cnpj ?? "") : p.pix_chave,
                    }));
                  }}>
                    <option value="">Sem PIX</option>
                    <option value="cpf">CPF</option>
                    <option value="cnpj">CNPJ</option>
                    <option value="email">E-mail</option>
                    <option value="telefone">Telefone</option>
                    <option value="aleatoria">Chave Aleatória</option>
                  </select>
                </div>
                <div style={{ marginBottom: 14 }}><label style={lbl}>Chave PIX</label><input style={{ ...inp, background: fPes.pix_tipo ? "#fff" : "#F4F6FA" }} value={fPes.pix_chave} disabled={!fPes.pix_tipo} onChange={e => setFPes(p => ({ ...p, pix_chave: e.target.value }))} /></div>
              </>
            )}
          </div>

          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 8 }}>
            <button style={btnR} onClick={() => setModalPes(false)}>Cancelar</button>
            <button style={{ ...btnV, opacity: salvando || !fPes.nome.trim() ? 0.5 : 1 }} disabled={salvando || !fPes.nome.trim()} onClick={salvarPes}>{salvando ? "Salvando…" : "Salvar"}</button>
          </div>
        </Modal>
      )}

      {/* Modal Ano Safra */}
      {modalAno && (
        <Modal titulo={editAno ? "Editar Ano Safra" : "Novo Ano Safra"} onClose={() => setModalAno(false)}>
          <div style={{ display: "grid", gap: 14 }}>
            <div><label style={lbl}>Descrição * (ex: 2026/2027)</label><input style={inp} placeholder="2026/2027" value={fAno.descricao} onChange={e => setFAno(p => ({ ...p, descricao: e.target.value }))} /></div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
              <div><label style={lbl}>Início *</label><input style={inp} type="date" value={fAno.data_inicio} onChange={e => setFAno(p => ({ ...p, data_inicio: e.target.value }))} /></div>
              <div><label style={lbl}>Fim *</label><input style={inp} type="date" value={fAno.data_fim} onChange={e => setFAno(p => ({ ...p, data_fim: e.target.value }))} /></div>
            </div>
            <div style={{ fontSize: 11, color: "#555", background: "#F3F6F9", padding: "8px 10px", borderRadius: 6 }}>Ex: Ano Safra 2026/2027 → início 01/08/2026, fim 31/07/2027</div>
          </div>
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 20 }}>
            <button style={btnR} onClick={() => setModalAno(false)}>Cancelar</button>
            <button style={{ ...btnV, opacity: salvando || !fAno.descricao.trim() || !fAno.data_inicio || !fAno.data_fim ? 0.5 : 1 }} disabled={salvando || !fAno.descricao.trim() || !fAno.data_inicio || !fAno.data_fim} onClick={salvarAno}>{salvando ? "Salvando…" : "Salvar"}</button>
          </div>
        </Modal>
      )}

      {/* Modal Ciclo */}
      {modalCiclo && (
        <Modal titulo={editCiclo ? "Editar Ciclo" : "Novo Ciclo"} subtitulo={anosSafra.find(a => a.id === anoSel)?.descricao} onClose={() => setModalCiclo(false)} width={860}>
          {/* Toggle Auxiliar */}
          <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:18, padding:"10px 14px", background:fCiclo.is_auxiliar?"#FBF3E0":"#F8FAFD", borderRadius:10, border:`0.5px solid ${fCiclo.is_auxiliar?"#C9921B":"#D4DCE8"}` }}>
            <label style={{ display:"flex", alignItems:"center", gap:8, cursor:"pointer", userSelect:"none" }}>
              <input type="checkbox" checked={fCiclo.is_auxiliar} onChange={e => setFCiclo(p => ({ ...p, is_auxiliar: e.target.checked, ciclo_pai_id: "", absorcao_pct: "100" }))} style={{ width:16, height:16, cursor:"pointer" }} />
              <span style={{ fontSize:13, fontWeight:700, color:fCiclo.is_auxiliar?"#7A5200":"#1a1a1a" }}>Ciclo Auxiliar</span>
            </label>
            <span style={{ fontSize:11, color:"#888" }}>
              {fCiclo.is_auxiliar
                ? "Sem receita própria — custos absorvidos pelo ciclo principal vinculado"
                : "Ciclo produtivo com receita (soja, milho, algodão…). Marque como auxiliar para culturas de cobertura, adubação verde, etc."}
            </span>
          </div>

          {/* Seção Auxiliar — ciclo pai + absorção */}
          {fCiclo.is_auxiliar && (
            <div style={{ display:"grid", gridTemplateColumns:"2fr 1fr 1fr", gap:14, marginBottom:18, padding:"14px 16px", background:"#FFFBF3", borderRadius:10, border:"0.5px solid #EDD8A0" }}>
              <div>
                <label style={lbl}>Ciclo Principal (absorve os custos) *</label>
                <select style={inp} value={fCiclo.ciclo_pai_id} onChange={e => setFCiclo(p => ({ ...p, ciclo_pai_id: e.target.value }))}>
                  <option value="">— selecione —</option>
                  {ciclos.filter(c => !c.is_auxiliar && c.id !== editCiclo?.id).map(c => (
                    <option key={c.id} value={c.id}>{c.descricao}</option>
                  ))}
                </select>
              </div>
              <div>
                <label style={lbl}>% de Absorção dos Custos</label>
                <InputNumerico style={inp} decimais={0} min="1" max="100" placeholder="100"
                  value={fCiclo.absorcao_pct}
                  onChange={v => setFCiclo(p => ({ ...p, absorcao_pct: v }))} />
              </div>
              <div>
                <label style={lbl}>Tipo / Motivo</label>
                <select style={inp} value={fCiclo.motivo_auxiliar} onChange={e => setFCiclo(p => ({ ...p, motivo_auxiliar: e.target.value }))}>
                  <option value="">— selecione —</option>
                  <option value="Milheto (cobertura de solo)">Milheto (cobertura de solo)</option>
                  <option value="Crotalária (adubação verde)">Crotalária (adubação verde)</option>
                  <option value="Braquiária (palhada/rotação)">Braquiária (palhada/rotação)</option>
                  <option value="Nabo forrageiro">Nabo forrageiro</option>
                  <option value="Urochloa inter-safra">Urochloa inter-safra</option>
                  <option value="Aveia (cobertura/pastejo)">Aveia (cobertura/pastejo)</option>
                  <option value="Feijão guandu">Feijão guandu</option>
                  <option value="Sorgo biomassa">Sorgo biomassa</option>
                  <option value="Outro">Outro</option>
                </select>
              </div>
              {fCiclo.ciclo_pai_id && (
                <div style={{ gridColumn:"1/-1", background:"#FDE9BB", borderRadius:8, padding:"8px 12px", fontSize:11, color:"#7A5200" }}>
                  Os custos deste ciclo serão somados ao DRE do ciclo <strong>{ciclos.find(c => c.id === fCiclo.ciclo_pai_id)?.descricao}</strong>{fCiclo.absorcao_pct !== "100" ? ` (${fCiclo.absorcao_pct}% de absorção)` : ""}.
                  A cultura principal continua com suas próprias receitas e operações.
                </div>
              )}
            </div>
          )}

          {/* Dados básicos */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14, marginBottom: 20 }}>
            <div style={{ gridColumn: "1/-1" }}><label style={lbl}>Descrição * (ex: Soja 2026/2027)</label><input style={inp} placeholder={fCiclo.is_auxiliar ? "Ex: Milheto 2025/2026" : "Soja 2026/2027"} value={fCiclo.descricao} onChange={e => setFCiclo(p => ({ ...p, descricao: e.target.value }))} /></div>
            <div>
              <label style={lbl}>Cultura *</label>
              <select style={inp} value={fCiclo.cultura} onChange={e => {
                const nome = e.target.value;
                const base = nome.split(/[\s,]+/)[0].toLowerCase();
                const match = insumosPA.find(i => i.nome.toLowerCase().startsWith(base));
                setFCiclo(p => ({ ...p, cultura: nome, produto_agricola_id: match?.id ?? p.produto_agricola_id }));
              }}>
                {(culturasList.filter(c => c.ativa).length > 0
                  ? culturasList.filter(c => c.ativa).map(c => c.nome)
                  : CULTURAS
                ).map(c => <option key={c}>{c}</option>)}
              </select>
            </div>
            {!fCiclo.is_auxiliar && (
              <div style={{ gridColumn: "1/-1" }}>
                <label style={lbl}>Produto colhido neste ciclo *</label>
                <select style={inp} value={fCiclo.produto_agricola_id} onChange={e => setFCiclo(p => ({ ...p, produto_agricola_id: e.target.value }))}>
                  <option value="">— selecione o produto que vai para o estoque —</option>
                  {insumosPA.map(i => <option key={i.id} value={i.id}>{i.nome} ({i.unidade})</option>)}
                </select>
                {insumosPA.length === 0 && (
                  <div style={{ fontSize:11, color:"#C9921B", marginTop:4 }}>
                    Nenhum produto agrícola cadastrado. Vá em Cadastros → Insumos e crie os produtos (Soja Convencional, Soja Transgênica, Milho, etc.) com categoria <strong>Produto Agrícola</strong>.
                  </div>
                )}
                {fCiclo.produto_agricola_id && (
                  <div style={{ fontSize:11, color:"#1A4870", marginTop:4 }}>
                    ⚡ A colheita deste ciclo dará entrada de <strong>{insumosPA.find(i => i.id === fCiclo.produto_agricola_id)?.nome}</strong> no estoque automaticamente.
                  </div>
                )}
              </div>
            )}
            <div><label style={lbl}>Início *</label><input style={inp} type="date" value={fCiclo.data_inicio} onChange={e => { const v = e.target.value; setFCiclo(p => ({ ...p, data_inicio: v })); if (v && fCiclo.data_fim) calcularOcupacao(v, fCiclo.data_fim, editCiclo?.id); }} /></div>
            <div><label style={lbl}>Fim *</label><input style={inp} type="date" value={fCiclo.data_fim} onChange={e => { const v = e.target.value; setFCiclo(p => ({ ...p, data_fim: v })); if (fCiclo.data_inicio && v) calcularOcupacao(fCiclo.data_inicio, v, editCiclo?.id); }} /></div>
            {!fCiclo.is_auxiliar && <div>
              <label style={lbl}>Produtividade esperada (sc/ha)</label>
              <InputMonetario style={inp} placeholder="Ex: 62,00" value={fCiclo.produtividade_esperada_sc_ha}
                onChange={v => setFCiclo(p => ({ ...p, produtividade_esperada_sc_ha: String(v) }))} />
            </div>}
            {!fCiclo.is_auxiliar && <div>
              <label style={lbl}>Preço de venda esperado (R$/sc)</label>
              <InputMonetario style={inp} placeholder="Ex: 118,50" value={fCiclo.preco_esperado_sc}
                onChange={v => setFCiclo(p => ({ ...p, preco_esperado_sc: String(v) }))} />
            </div>}
            {/* Preview receita esperada */}
            {(() => {
              const talhoesSel = Object.entries(cicloTalhoes).filter(([, a]) => parseFloat(a) > 0);
              const areaTotal = talhoesSel.reduce((s, [, a]) => s + parseFloat(a), 0);
              const prod = parseFloat(fCiclo.produtividade_esperada_sc_ha) || 0;
              const preco = parseFloat(fCiclo.preco_esperado_sc) || 0;
              const sacas = areaTotal * prod;
              const receita = sacas * preco;
              if (areaTotal > 0 && prod > 0) return (
                <div style={{ gridColumn: "1/-1", background: "#ECFDF5", borderRadius: 8, padding: "10px 14px", fontSize: 12, color: "#14532D" }}>
                  <strong>{areaTotal.toLocaleString("pt-BR", { maximumFractionDigits: 2 })} ha</strong> plantados ·{" "}
                  <strong>{sacas.toLocaleString("pt-BR", { maximumFractionDigits: 0 })} sc</strong> esperadas
                  {preco > 0 && <> · Receita bruta estimada: <strong>{receita.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</strong></>}
                </div>
              );
              return null;
            })()}
          </div>

          {/* Talhões do ciclo */}
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontWeight: 600, fontSize: 13, color: "#1a1a1a", marginBottom: 10 }}>
              Talhões Plantados neste Ciclo
              <span style={{ fontSize: 11, fontWeight: 400, color: "#555", marginLeft: 8 }}>
                (informe a área efetivamente plantada — usada para rateio de custos por ha)
              </span>
            </div>
            {/* Agrupar talhões por fazenda */}
            {Object.entries(talhoes).length === 0 ? (
              <div style={{ fontSize: 12, color: "#888", padding: "10px 0" }}>Nenhum talhão cadastrado. Cadastre talhões nas fazendas primeiro.</div>
            ) : (
              <div style={{ border: "0.5px solid #D4DCE8", borderRadius: 8, overflow: "hidden" }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr style={{ background: "#F3F6F9" }}>
                      <th style={{ padding: "7px 12px", textAlign: "left",   fontSize: 11, fontWeight: 600, color: "#555", borderBottom: "0.5px solid #D4DCE8" }}>Talhão</th>
                      <th style={{ padding: "7px 12px", textAlign: "center", fontSize: 11, fontWeight: 600, color: "#555", borderBottom: "0.5px solid #D4DCE8" }}>Área total (ha)</th>
                      <th style={{ padding: "7px 12px", textAlign: "center", fontSize: 11, fontWeight: 600, color: "#555", borderBottom: "0.5px solid #D4DCE8" }}>Disponível (ha)</th>
                      <th style={{ padding: "7px 12px", textAlign: "center", fontSize: 11, fontWeight: 600, color: "#555", borderBottom: "0.5px solid #D4DCE8" }}>Área plantada (ha)</th>
                      <th style={{ padding: "7px 12px", textAlign: "center", fontSize: 11, fontWeight: 600, color: "#555", borderBottom: "0.5px solid #D4DCE8" }}>Incluir</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.values(talhoes).flat().map((t, ti, arr) => {
                      const areaSel   = cicloTalhoes[t.id] ?? "";
                      const marcado   = parseFloat(areaSel) > 0;
                      const ocupado   = ocupadoEmOutrosCiclos[t.id] ?? 0;
                      const disponivel = Math.max(0, t.area_ha - ocupado);
                      const areaNum   = parseFloat(areaSel) || 0;
                      const excede    = areaNum > disponivel || areaNum > t.area_ha;
                      const temConflito = ocupado > 0;
                      return (
                        <tr key={t.id} style={{ borderBottom: ti < arr.length - 1 ? "0.5px solid #EEF1F6" : "none", background: excede ? "#FFF5F5" : marcado ? "#FAFEF8" : "transparent" }}>
                          <td style={{ padding: "7px 12px", fontSize: 12, fontWeight: marcado ? 600 : 400, color: "#1a1a1a" }}>{t.nome}</td>
                          <td style={{ padding: "7px 12px", textAlign: "center", fontSize: 12, color: "#555" }}>{t.area_ha.toLocaleString("pt-BR", { maximumFractionDigits: 2 })} ha</td>
                          <td style={{ padding: "7px 12px", textAlign: "center", fontSize: 12 }}>
                            {temConflito ? (
                              <span style={{ color: disponivel === 0 ? "#E24B4A" : "#C9921B", fontWeight: 600 }}>
                                {disponivel.toLocaleString("pt-BR", { maximumFractionDigits: 2 })} ha
                                <span style={{ fontSize: 10, fontWeight: 400, color: "#888", display: "block" }}>
                                  {ocupado.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}ha em uso
                                </span>
                              </span>
                            ) : (
                              <span style={{ color: "#16A34A", fontWeight: 600 }}>
                                {disponivel.toLocaleString("pt-BR", { maximumFractionDigits: 2 })} ha
                              </span>
                            )}
                          </td>
                          <td style={{ padding: "7px 12px", textAlign: "center" }}>
                            {marcado && (
                              <div>
                                <InputMonetario
                                  style={{ width: 90, padding: "4px 8px", border: `0.5px solid ${excede ? "#E24B4A" : "#D4DCE8"}`, borderRadius: 6, fontSize: 12, textAlign: "right", outline: "none", background: excede ? "#FFF5F5" : "#fff" }} min="0" max={disponivel}
                                  value={areaSel}
                                  onChange={v => {
                                    setCicloTalhoes(p => ({ ...p, [t.id]: String(v) }));
                                  }}
                                />
                                {excede && (
                                  <div style={{ fontSize: 10, color: "#E24B4A", marginTop: 2 }}>
                                    máx {disponivel.toLocaleString("pt-BR", { maximumFractionDigits: 2 })} ha
                                  </div>
                                )}
                              </div>
                            )}
                          </td>
                          <td style={{ padding: "7px 12px", textAlign: "center" }}>
                            <input type="checkbox" checked={marcado} disabled={disponivel === 0}
                              onChange={e => setCicloTalhoes(p => {
                                if (e.target.checked) {
                                  // Usa área plantada do talhão (se informada), caso contrário área total — mas nunca excede o disponível
                                  const areaDefault = Math.min(t.area_plantada_ha ?? t.area_ha, disponivel);
                                  return { ...p, [t.id]: String(areaDefault) };
                                }
                                const n = { ...p }; delete n[t.id]; return n;
                              })} />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <button style={btnR} onClick={() => setModalCiclo(false)}>Cancelar</button>
            <button style={{ ...btnV, opacity: salvando || !fCiclo.descricao.trim() || !fCiclo.data_inicio || !fCiclo.data_fim ? 0.5 : 1 }} disabled={salvando || !fCiclo.descricao.trim() || !fCiclo.data_inicio || !fCiclo.data_fim} onClick={salvarCiclo}>{salvando ? "Salvando…" : "Salvar"}</button>
          </div>
        </Modal>
      )}

      {/* Modal Máquina / Veículo */}
      {modalMaq && (
        <Modal titulo={editMaq ? "Editar Máquina / Veículo" : "Nova Máquina / Veículo"} onClose={() => setModalMaq(false)} width={820}>
          {/* Abas internas */}
          <div style={{ display: "flex", gap: 0, borderBottom: "0.5px solid #DEE5EE", marginBottom: 18 }}>
            {(["geral", "aquisicao", "seguro"] as const).map(t => (
              <button key={t} onClick={() => setTabMaq(t)} style={{ padding: "8px 20px", border: "none", borderBottom: tabMaq === t ? "2px solid #1A5CB8" : "2px solid transparent", background: "transparent", fontWeight: tabMaq === t ? 600 : 400, color: tabMaq === t ? "#1A5CB8" : "#555", cursor: "pointer", fontSize: 13 }}>
                {t === "geral" ? "Dados Gerais" : t === "aquisicao" ? "Aquisição / Financiamento" : "Seguro"}
              </button>
            ))}
          </div>

          {/* Aba Dados Gerais */}
          {tabMaq === "geral" && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14 }}>
              <div style={{ gridColumn: "1/-1" }}><label style={lbl}>Nome *</label><input style={inp} value={fMaq.nome} onChange={e => setFMaq(p => ({ ...p, nome: e.target.value }))} /></div>
              <div>
                <label style={lbl}>Tipo *</label>
                <select style={inp} value={fMaq.tipo} onChange={e => setFMaq(p => ({ ...p, tipo: e.target.value as Maquina["tipo"] }))}>
                  <option value="trator">Trator</option>
                  <option value="colheitadeira">Colheitadeira</option>
                  <option value="pulverizador">Pulverizador</option>
                  <option value="plantadeira">Plantadeira</option>
                  <option value="caminhao">Caminhão</option>
                  <option value="carro">Carro / Veículo Leve</option>
                  <option value="implemento">Implemento</option>
                  <option value="outro">Outro</option>
                </select>
              </div>
              <div><label style={lbl}>Marca</label><input style={inp} value={fMaq.marca} onChange={e => setFMaq(p => ({ ...p, marca: e.target.value }))} /></div>
              <div><label style={lbl}>Modelo</label><input style={inp} value={fMaq.modelo} onChange={e => setFMaq(p => ({ ...p, modelo: e.target.value }))} /></div>
              <div><label style={lbl}>Ano de fabricação</label><InputNumerico style={inp} decimais={0} placeholder="2020" value={fMaq.ano} onChange={v => setFMaq(p => ({ ...p, ano: v }))} /></div>
              <div><label style={lbl}>Patrimônio / Placa</label><input style={inp} placeholder="Ex: FAZ-0001 ou ABC-1234" value={fMaq.patrimonio} onChange={e => setFMaq(p => ({ ...p, patrimonio: e.target.value }))} /></div>
              <div>
                <label style={lbl}>Chassi / Nº de Série</label>
                <input style={{ ...inp, fontFamily: "monospace", letterSpacing: 1 }} placeholder="Ex: 9BW258090B3128765" value={fMaq.chassi} onChange={e => setFMaq(p => ({ ...p, chassi: e.target.value.toUpperCase() }))} />
              </div>
              <div>
                <label style={lbl}>{isVeiculo(fMaq.tipo) ? "Odômetro atual (km)" : "Horímetro atual (h)"}</label>
                <InputNumerico style={inp} min="0" placeholder={isVeiculo(fMaq.tipo) ? "Ex: 125000" : "Ex: 4320"} value={fMaq.horimetro_atual} onChange={v => setFMaq(p => ({ ...p, horimetro_atual: v }))} />
              </div>
            </div>
          )}

          {/* Aba Aquisição / Financiamento */}
          {tabMaq === "aquisicao" && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14 }}>
              <div style={{ gridColumn: "1/-1", fontSize: 11, fontWeight: 600, color: "#1A4870", textTransform: "uppercase", letterSpacing: "0.06em", paddingBottom: 4, borderBottom: "0.5px solid #D4DCE8" }}>Proprietário e Aquisição</div>
              <div style={{ gridColumn: "1/-1" }}>
                <label style={lbl}>Proprietário (para o IR)</label>
                <select style={inp} value={fMaq.proprietario_id} onChange={e => setFMaq(p => ({ ...p, proprietario_id: e.target.value }))}>
                  <option value="">— selecione —</option>
                  {pessoas.map(p => <option key={p.id} value={p.id}>{p.nome}{p.cpf_cnpj ? ` — ${p.cpf_cnpj}` : ""}</option>)}
                </select>
              </div>
              <div><label style={lbl}>Nº da NF de Aquisição</label><input style={inp} placeholder="Ex: 000.123456" value={fMaq.nr_nf_aquisicao} onChange={e => setFMaq(p => ({ ...p, nr_nf_aquisicao: e.target.value }))} /></div>
              <div><label style={lbl}>Data de Aquisição</label><input style={inp} type="date" value={fMaq.data_aquisicao} onChange={e => setFMaq(p => ({ ...p, data_aquisicao: e.target.value }))} /></div>
              <div>
                <label style={lbl}>Valor de Aquisição (R$)</label>
                <InputMonetario style={inp} min="0" placeholder="0,00" value={fMaq.valor_aquisicao} onChange={v => setFMaq(p => ({ ...p, valor_aquisicao: String(v) }))} />
              </div>

              <div style={{ gridColumn: "1/-1", borderTop: "0.5px solid #DDE2EE", paddingTop: 14, marginTop: 4 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: "#1A4870", textTransform: "uppercase", letterSpacing: "0.06em", paddingBottom: 4, borderBottom: "0.5px solid #D4DCE8", marginBottom: 6 }}>Financiamento</div>
              </div>
              <div>
                <label style={lbl}>Status</label>
                <select style={inp} value={fMaq.status_financiamento} onChange={e => setFMaq(p => ({ ...p, status_financiamento: e.target.value as NonNullable<Maquina["status_financiamento"]> }))}>
                  <option value="proprio">Próprio (sem financiamento)</option>
                  <option value="financiado">Financiamento Ativo</option>
                  <option value="quitado">Quitado</option>
                </select>
              </div>
              <div style={{ gridColumn: "2/4" }}>
                <label style={lbl}>Contrato de Financiamento</label>
                <select style={inp} value={fMaq.contrato_financiamento_id} onChange={e => setFMaq(p => ({ ...p, contrato_financiamento_id: e.target.value }))}>
                  <option value="">— selecione —</option>
                  {contratsFinanc.map(c => <option key={c.id} value={c.id}>{c.descricao}{c.numero_documento ? ` — Nº ${c.numero_documento}` : ""} ({c.credor})</option>)}
                </select>
              </div>
              {fMaq.status_financiamento === "quitado" && (
                <div>
                  <label style={lbl}>Data de Quitação</label>
                  <input style={inp} type="date" value={fMaq.data_quitacao} onChange={e => setFMaq(p => ({ ...p, data_quitacao: e.target.value }))} />
                </div>
              )}
              {fMaq.status_financiamento === "financiado" && fMaq.contrato_financiamento_id && (
                <div style={{ gridColumn: "1/-1", background: "#FBF3E0", border: "0.5px solid #C9921B30", borderRadius: 8, padding: "10px 14px", fontSize: 12, color: "#7A5520" }}>
                  ⚠ O status muda automaticamente para <strong>Quitado</strong> quando a última parcela do contrato vinculado for baixada.
                </div>
              )}
            </div>
          )}

          {/* Aba Seguro */}
          {tabMaq === "seguro" && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14 }}>
              <div><label style={lbl}>Seguradora</label><input style={inp} placeholder="Ex: Porto Seguro, Bradesco Seguros" value={fMaq.seguro_seguradora} onChange={e => setFMaq(p => ({ ...p, seguro_seguradora: e.target.value }))} /></div>
              <div><label style={lbl}>Corretora</label><input style={inp} placeholder="Ex: Corretora XYZ" value={fMaq.seguro_corretora} onChange={e => setFMaq(p => ({ ...p, seguro_corretora: e.target.value }))} /></div>
              <div><label style={lbl}>Nº da Apólice</label><input style={inp} placeholder="Ex: 000.123456-7" value={fMaq.seguro_numero_apolice} onChange={e => setFMaq(p => ({ ...p, seguro_numero_apolice: e.target.value }))} /></div>
              <div>
                <label style={lbl}>Data de Contratação</label>
                <input style={inp} type="date" value={fMaq.seguro_data_contratacao} onChange={e => setFMaq(p => ({ ...p, seguro_data_contratacao: e.target.value }))} />
              </div>
              <div>
                <label style={lbl}>Vencimento da Apólice</label>
                <input style={inp} type="date" value={fMaq.seguro_vencimento_apolice} onChange={e => setFMaq(p => ({ ...p, seguro_vencimento_apolice: e.target.value }))} />
              </div>
              <div>
                <label style={lbl}>Prêmio anual (R$)</label>
                <InputMonetario style={inp} min="0" placeholder="Ex: 3500.00" value={fMaq.seguro_premio} onChange={v => setFMaq(p => ({ ...p, seguro_premio: String(v) }))} />
              </div>
              {fMaq.seguro_vencimento_apolice && (() => {
                const dias = diasAteDate(fMaq.seguro_vencimento_apolice);
                const cor = dias < 0 ? "#E24B4A" : dias <= 15 ? "#EF9F27" : "#16A34A";
                const txt = dias < 0 ? `Apólice VENCIDA há ${Math.abs(dias)} dias` : dias <= 15 ? `⚠️ Vence em ${dias} dias` : `✓ Válida — vence em ${dias} dias`;
                return <div style={{ gridColumn: "1/-1", background: dias <= 15 ? "#FFF8ED" : "#F0FDF4", border: `0.5px solid ${cor}30`, borderRadius: 8, padding: "10px 14px", color: cor, fontWeight: 600, fontSize: 12 }}>{txt}</div>;
              })()}
            </div>
          )}

          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 20 }}>
            <button style={btnR} onClick={() => setModalMaq(false)}>Cancelar</button>
            <button style={{ ...btnV, opacity: salvando || !fMaq.nome.trim() ? 0.5 : 1 }} disabled={salvando || !fMaq.nome.trim()} onClick={salvarMaq}>{salvando ? "Salvando…" : "Salvar"}</button>
          </div>
        </Modal>
      )}

      {/* Modal Bomba */}
      {modalBomba && (
        <Modal titulo={editBomba ? "Editar Bomba" : "Nova Bomba de Combustível"} onClose={() => setModalBomba(false)} width={720}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14 }}>
            <div style={{ gridColumn: "1/-1" }}><label style={lbl}>Nome / Localização *</label><input style={inp} placeholder="Ex: Bomba 1 — Pátio Principal" value={fBomba.nome} onChange={e => setFBomba(p => ({ ...p, nome: e.target.value }))} /></div>
            <div>
              <label style={lbl}>Combustível *</label>
              <select style={inp} value={fBomba.combustivel} onChange={e => setFBomba(p => ({ ...p, combustivel: e.target.value as BombaCombustivel["combustivel"] }))}>
                <option value="diesel_s10">Diesel S-10</option>
                <option value="diesel_s500">Diesel S-500</option>
                <option value="gasolina">Gasolina</option>
                <option value="etanol">Etanol</option>
                <option value="arla">Arla 32</option>
              </select>
            </div>
            <div><label style={lbl}>Capacidade do tanque (L)</label><InputNumerico style={inp} decimais={0} value={fBomba.capacidade_l} onChange={v => setFBomba(p => ({ ...p, capacidade_l: v }))} /></div>
            <div>
              <label style={lbl}>Estoque atual (L)</label>
              {editBomba ? (
                <div style={{ padding: "8px 10px", background: "#F8FAFB", borderRadius: 7, border: "0.5px solid #DDE2EE", fontSize: 13, color: "#888", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span>{fBomba.estoque_atual_l} L</span>
                  <span style={{ fontSize: 11, color: "#C9921B" }}>Altere via Ajuste de Estoque</span>
                </div>
              ) : (
                <InputNumerico style={inp} value={fBomba.estoque_atual_l} onChange={v => setFBomba(p => ({ ...p, estoque_atual_l: v }))} />
              )}
            </div>
            <div style={{ gridColumn: "1/-1", display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", background: "#F4F6FA", borderRadius: 8, border: "0.5px solid #DDE2EE" }}>
              <input type="checkbox" id="consume_estoque" checked={fBomba.consume_estoque} onChange={e => setFBomba(p => ({ ...p, consume_estoque: e.target.checked }))} style={{ width: 16, height: 16, cursor: "pointer" }} />
              <label htmlFor="consume_estoque" style={{ fontSize: 13, color: "#1a1a1a", cursor: "pointer", fontWeight: 600 }}>Controla estoque interno</label>
              <span style={{ fontSize: 12, color: "#666" }}>— Marque para bombas físicas da fazenda (tanques próprios). Desmarque para postos externos ou despesas diretas sem controle de estoque.</span>
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 20 }}>
            <button style={btnR} onClick={() => setModalBomba(false)}>Cancelar</button>
            <button style={{ ...btnV, opacity: salvando || !fBomba.nome.trim() ? 0.5 : 1 }} disabled={salvando || !fBomba.nome.trim()} onClick={salvarBomba}>{salvando ? "Salvando…" : "Salvar"}</button>
          </div>
        </Modal>
      )}

      {/* ── Modais Tabelas Auxiliares ── */}

      {/* Modal Grupo Insumo */}
      {modalGrupoIns && (
        <Modal titulo={editGrupoIns ? "Editar Grupo" : "Novo Grupo de Insumo"} onClose={() => setModalGrupoIns(false)}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 80px", gap: 14 }}>
            <div><label style={lbl}>Nome *</label><input style={inp} placeholder="Ex: Defensivos" value={fGrupoIns.nome} onChange={e => setFGrupoIns(p => ({ ...p, nome: e.target.value }))} /></div>
            <div>
              <label style={lbl}>Cor</label>
              <input type="color" value={fGrupoIns.cor} onChange={e => setFGrupoIns(p => ({ ...p, cor: e.target.value }))}
                style={{ ...inp, padding: 4, height: 36, cursor: "pointer" }} />
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 20 }}>
            <button style={btnR} onClick={() => setModalGrupoIns(false)}>Cancelar</button>
            <button style={{ ...btnV, opacity: salvando || !fGrupoIns.nome.trim() ? 0.5 : 1 }} disabled={salvando || !fGrupoIns.nome.trim()}
              onClick={async () => {
                setSalvando(true);
                try {
                  if (editGrupoIns) {
                    await atualizarGrupoInsumo(editGrupoIns.id, fGrupoIns);
                    setGruposInsumo(x => x.map(r => r.id === editGrupoIns.id ? { ...r, ...fGrupoIns } : r));
                  } else {
                    const n = await criarGrupoInsumo({ fazenda_id: fazIdEff!, ...fGrupoIns });
                    setGruposInsumo(x => [...x, n]);
                  }
                  setModalGrupoIns(false);
                } catch (e: unknown) { setErro((e as {message?:string})?.message || JSON.stringify(e)); }
                finally { setSalvando(false); }
              }}>
              {salvando ? "Salvando…" : "Salvar"}
            </button>
          </div>
        </Modal>
      )}

      {/* Modal Subgrupo Insumo */}
      {modalSubgIns && (
        <Modal titulo={editSubgIns ? "Editar Subgrupo" : "Novo Subgrupo de Insumo"} onClose={() => setModalSubgIns(false)}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            <div><label style={lbl}>Nome *</label><input style={inp} placeholder="Ex: Herbicida" value={fSubgIns.nome} onChange={e => setFSubgIns(p => ({ ...p, nome: e.target.value }))} /></div>
            <div>
              <label style={lbl}>Grupo *</label>
              <select style={inp} value={fSubgIns.grupo_id} onChange={e => setFSubgIns(p => ({ ...p, grupo_id: e.target.value }))}>
                <option value="">Selecione o grupo…</option>
                {gruposInsumo.map(g => <option key={g.id} value={g.id}>{g.nome}</option>)}
              </select>
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 20 }}>
            <button style={btnR} onClick={() => setModalSubgIns(false)}>Cancelar</button>
            <button style={{ ...btnV, opacity: salvando || !fSubgIns.nome.trim() || !fSubgIns.grupo_id ? 0.5 : 1 }}
              disabled={salvando || !fSubgIns.nome.trim() || !fSubgIns.grupo_id}
              onClick={async () => {
                setSalvando(true);
                try {
                  if (editSubgIns) {
                    await atualizarSubgrupoInsumo(editSubgIns.id, fSubgIns);
                    setSubgruposInsumo(x => x.map(r => r.id === editSubgIns.id ? { ...r, ...fSubgIns } : r));
                  } else {
                    const n = await criarSubgrupoInsumo({ fazenda_id: fazIdEff!, ...fSubgIns });
                    setSubgruposInsumo(x => [...x, n]);
                  }
                  setModalSubgIns(false);
                } catch (e: unknown) { setErro((e as {message?:string})?.message || JSON.stringify(e)); }
                finally { setSalvando(false); }
              }}>
              {salvando ? "Salvando…" : "Salvar"}
            </button>
          </div>
        </Modal>
      )}

      {/* Modal Tipo Pessoa */}
      {modalTipoPes && (
        <Modal titulo={editTipoPes ? "Editar Tipo de Pessoa" : "Novo Tipo de Pessoa"} onClose={() => setModalTipoPes(false)}>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div><label style={lbl}>Nome *</label><input style={inp} placeholder="Ex: Fornecedor de Insumos" value={fTipoPes.nome} onChange={e => setFTipoPes(p => ({ ...p, nome: e.target.value }))} /></div>
            <div><label style={lbl}>Descrição</label><input style={inp} placeholder="Ex: Revendas agrícolas e distribuidores" value={fTipoPes.descricao} onChange={e => setFTipoPes(p => ({ ...p, descricao: e.target.value }))} /></div>
          </div>
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 20 }}>
            <button style={btnR} onClick={() => setModalTipoPes(false)}>Cancelar</button>
            <button style={{ ...btnV, opacity: salvando || !fTipoPes.nome.trim() ? 0.5 : 1 }} disabled={salvando || !fTipoPes.nome.trim()}
              onClick={async () => {
                setSalvando(true);
                try {
                  if (editTipoPes) {
                    await atualizarTipoPessoa(editTipoPes.id, fTipoPes);
                    setTiposPessoa(x => x.map(r => r.id === editTipoPes.id ? { ...r, ...fTipoPes } : r));
                  } else {
                    const n = await criarTipoPessoa({ fazenda_id: fazIdEff!, ...fTipoPes });
                    setTiposPessoa(x => [...x, n]);
                  }
                  setModalTipoPes(false);
                } catch (e: unknown) { setErro((e as {message?:string})?.message || JSON.stringify(e)); }
                finally { setSalvando(false); }
              }}>
              {salvando ? "Salvando…" : "Salvar"}
            </button>
          </div>
        </Modal>
      )}

      {/* Modal Centro de Custo */}
      {modalCC && (
        <Modal titulo={editCC ? "Editar Centro de Custo" : "Novo Centro de Custo"} onClose={() => setModalCC(false)}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            <div><label style={lbl}>Código</label><input style={inp} placeholder="Ex: 1.1.01" value={fCC.codigo} onChange={e => setFCC(p => ({ ...p, codigo: e.target.value }))} /></div>
            <div>
              <label style={lbl}>Tipo *</label>
              <select style={inp} value={fCC.tipo} onChange={e => setFCC(p => ({ ...p, tipo: e.target.value as CentroCusto["tipo"] }))}>
                <option value="despesa">Despesa</option>
                <option value="receita">Receita</option>
                <option value="neutro">Neutro</option>
              </select>
            </div>
            <div style={{ gridColumn: "1/-1" }}><label style={lbl}>Nome *</label><input style={inp} placeholder="Ex: Lavoura — Soja — Talhão 3" value={fCC.nome} onChange={e => setFCC(p => ({ ...p, nome: e.target.value }))} /></div>
            <div style={{ gridColumn: "1/-1" }}>
              <label style={lbl}>Centro Pai (opcional)</label>
              <select style={inp} value={fCC.parent_id} onChange={e => setFCC(p => ({ ...p, parent_id: e.target.value }))}>
                <option value="">— Nenhum (raiz) —</option>
                {centrosCusto.filter(c => !editCC || c.id !== editCC.id).map(c => <option key={c.id} value={c.id}>{c.codigo ? `${c.codigo} — ` : ""}{c.nome}</option>)}
              </select>
            </div>
            <div style={{ gridColumn: "1/-1" }}>
              <label style={{ display: "flex", alignItems: "flex-start", gap: 10, cursor: "pointer", padding: "10px 12px", background: fCC.manutencao_maquinas ? "#E8F5E9" : "#F4F6FA", border: `0.5px solid ${fCC.manutencao_maquinas ? "#86EFAC" : "#DDE2EE"}`, borderRadius: 8 }}>
                <input
                  type="checkbox"
                  checked={fCC.manutencao_maquinas}
                  onChange={e => setFCC(p => ({ ...p, manutencao_maquinas: e.target.checked }))}
                  style={{ marginTop: 2, flexShrink: 0, accentColor: "#1A5C38", width: 15, height: 15 }}
                />
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "#1a1a1a" }}>Centro de Custo destinado a Manutenção de Máquinas</div>
                  <div style={{ fontSize: 11, color: "#555", marginTop: 2 }}>
                    Ao apropriar custo a este CC, o sistema oferecerá vincular também à máquina específica.
                    Permite rastrear custo total no CC e custo por máquina individualmente.
                  </div>
                </div>
              </label>
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 20 }}>
            <button style={btnR} onClick={() => setModalCC(false)}>Cancelar</button>
            <button style={{ ...btnV, opacity: salvando || !fCC.nome.trim() ? 0.5 : 1 }} disabled={salvando || !fCC.nome.trim()}
              onClick={async () => {
                setSalvando(true);
                try {
                  const payload = { fazenda_id: fazIdEff!, codigo: fCC.codigo || undefined, nome: fCC.nome, tipo: fCC.tipo, parent_id: fCC.parent_id || undefined, manutencao_maquinas: fCC.manutencao_maquinas };
                  if (editCC) {
                    await atualizarCentroCusto(editCC.id, payload);
                    setCentrosCusto(x => x.map(r => r.id === editCC.id ? { ...r, ...payload } : r));
                  } else {
                    const n = await criarCentroCusto(payload);
                    setCentrosCusto(x => [...x, n]);
                  }
                  setModalCC(false);
                } catch (e: unknown) { setErro((e as {message?:string})?.message || JSON.stringify(e)); }
                finally { setSalvando(false); }
              }}>
              {salvando ? "Salvando…" : "Salvar"}
            </button>
          </div>
        </Modal>
      )}

      {/* Modal Categoria de Lançamento */}
      {modalCatLanc && (
        <Modal titulo={editCatLanc ? "Editar Categoria" : "Nova Categoria Financeira"} onClose={() => setModalCatLanc(false)}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            <div style={{ gridColumn: "1/-1" }}><label style={lbl}>Nome *</label><input style={inp} placeholder="Ex: Insumos — Defensivos" value={fCatLanc.nome} onChange={e => setFCatLanc(p => ({ ...p, nome: e.target.value }))} /></div>
            <div style={{ gridColumn: "1/-1" }}>
              <label style={lbl}>Uso *</label>
              <select style={inp} value={fCatLanc.tipo} onChange={e => setFCatLanc(p => ({ ...p, tipo: e.target.value as CategoriaLancamento["tipo"] }))}>
                <option value="pagar">Somente Contas a Pagar (CP)</option>
                <option value="receber">Somente Contas a Receber (CR)</option>
                <option value="ambos">CP e CR</option>
              </select>
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 20 }}>
            <button style={btnR} onClick={() => setModalCatLanc(false)}>Cancelar</button>
            <button style={{ ...btnV, opacity: salvando || !fCatLanc.nome.trim() ? 0.5 : 1 }} disabled={salvando || !fCatLanc.nome.trim()}
              onClick={async () => {
                setSalvando(true);
                try {
                  if (editCatLanc) {
                    await atualizarCategoriaLancamento(editCatLanc.id, fCatLanc);
                    setCategoriasLanc(x => x.map(r => r.id === editCatLanc.id ? { ...r, ...fCatLanc } : r));
                  } else {
                    const n = await criarCategoriaLancamento({ fazenda_id: fazIdEff!, ...fCatLanc });
                    setCategoriasLanc(x => [...x, n]);
                  }
                  setModalCatLanc(false);
                } catch (e: unknown) { setErro((e as {message?:string})?.message || JSON.stringify(e)); }
                finally { setSalvando(false); }
              }}>
              {salvando ? "Salvando…" : "Salvar"}
            </button>
          </div>
        </Modal>
      )}

      {/* ══ Modal Operações Gerenciais / Plano de Contas ══ */}
      {modalOpGer && (
        <Modal titulo={editOpGer ? "Editar Operação Gerencial" : "Nova Operação Gerencial"} onClose={() => setModalOpGer(false)} width={820}>

          {/* Cabeçalho fixo — campos sempre visíveis */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: 12, marginBottom: 10 }}>
            <div>
              <label style={lbl}>Operação Pai (hierarquia)</label>
              <select style={inp} value={fOG.parent_id} onChange={e => setFOG(p => ({ ...p, parent_id: e.target.value }))}>
                <option value="">— Nível raiz (sem pai) —</option>
                {opGers
                  .filter(o => !editOpGer || o.id !== editOpGer.id)
                  .sort((a, b) => a.classificacao.localeCompare(b.classificacao))
                  .map(o => <option key={o.id} value={o.id}>{o.classificacao} — {o.descricao}</option>)
                }
              </select>
            </div>
            <div>
              <label style={lbl}>Descrição *</label>
              <input style={inp} placeholder="Ex: Compra de Defensivos" value={fOG.descricao}
                onChange={e => setFOG(p => ({ ...p, descricao: e.target.value }))} />
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "140px 1fr 160px 200px", gap: 12, marginBottom: 14 }}>
            <div>
              <label style={lbl}>Classificação *</label>
              <input style={{ ...inp, fontFamily: "monospace" }} placeholder="1.01.001" value={fOG.classificacao}
                onChange={e => setFOG(p => ({ ...p, classificacao: e.target.value }))} />
            </div>
            <div style={{ display: "flex", gap: 14, alignItems: "flex-end", paddingBottom: 2 }}>
              <label style={{ fontSize: 11, color: "#555", marginBottom: 6 }}>Tipo</label>
              {(["receita","despesa"] as const).map(t => (
                <label key={t} style={{ display: "flex", alignItems: "center", gap: 5, cursor: "pointer", fontSize: 13 }}>
                  <input type="radio" checked={fOG.tipo === t} onChange={() => setFOG(p => ({ ...p, tipo: t }))} />
                  {t === "receita" ? "Receita" : "Despesa"}
                </label>
              ))}
            </div>
            <div>
              <label style={lbl}>Tipo Doc. LCDPR</label>
              <select style={inp} value={fOG.tipo_lcdpr} onChange={e => setFOG(p => ({ ...p, tipo_lcdpr: e.target.value }))}>
                <option value="">— Nenhum —</option>
                <option value="1">1 — Nota Fiscal</option>
                <option value="2">2 — Recibo</option>
                <option value="3">3 — Folha de Pagamento</option>
                <option value="4">4 — Pró-Labore</option>
                <option value="5">5 — Outros</option>
              </select>
            </div>
            <div style={{ display: "flex", gap: 16, alignItems: "flex-end", paddingBottom: 6 }}>
              {([
                { key: "inativo",             label: "Inativo"             },
                { key: "informa_complemento", label: "Inf. Complemento"   },
              ] as { key: keyof typeof fOG; label: string }[]).map(({ key, label }) => (
                <label key={key} style={{ display: "flex", alignItems: "center", gap: 5, cursor: "pointer", fontSize: 12 }}>
                  <input type="checkbox" checked={!!fOG[key]} onChange={e => setFOG(p => ({ ...p, [key]: e.target.checked }))} />
                  {label}
                </label>
              ))}
            </div>
          </div>

          {/* Sub-abas */}
          <div style={{ display: "flex", gap: 0, borderBottom: "0.5px solid #D4DCE8", marginBottom: 16 }}>
            {([
              { key: "principal",     label: "Principal"         },
              { key: "estoque",       label: "Estoque"           },
              { key: "fiscal",        label: "Fiscal"            },
              { key: "financeiro",    label: "Financeiro/Custos" },
              { key: "contabilidade", label: "Contabilidade"     },
              { key: "cfop",          label: "Histórico Fiscal"  },
            ] as { key: typeof abaOpGer; label: string }[]).map(a => (
              <button key={a.key} onClick={() => {
                setAbaOpGer(a.key);
                if (a.key === "cfop" && editOpGer && cfopsOp.length === 0 && !loadingCfops) {
                  setLoadingCfops(true);
                  import("../../lib/db").then(m => m.listarCfopsPorOperacao(editOpGer.id))
                    .then(d => { setCfopsOp(d); setLoadingCfops(false); })
                    .catch(() => setLoadingCfops(false));
                }
              }} style={{
                padding: "7px 18px", border: "none", cursor: "pointer", fontSize: 13, background: "transparent",
                borderBottom: abaOpGer === a.key ? "2px solid #1A5CB8" : "2px solid transparent",
                color: abaOpGer === a.key ? "#1A5CB8" : "#555",
                fontWeight: abaOpGer === a.key ? 600 : 400,
              }}>{a.label}</button>
            ))}
          </div>

          {/* ── Aba Principal ── */}
          {abaOpGer === "principal" && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
              <div>
                <div style={{ fontSize: 11, fontWeight: 600, color: "#1A4870", marginBottom: 8, textTransform: "uppercase" }}>Lançamentos nas Telas</div>
                {([
                  { key: "permite_notas_fiscais",      label: "Notas Fiscais"          },
                  { key: "permite_cp_cr",              label: "Contas a Pagar/Receber" },
                  { key: "permite_adiantamentos",      label: "Adiantamentos"          },
                  { key: "permite_tesouraria",         label: "Tesouraria"             },
                  { key: "permite_baixas",             label: "Baixas"                 },
                  { key: "permite_custo_produto",      label: "Custo de Produto"       },
                  { key: "permite_contrato_financeiro",label: "Contrato Financeiro"    },
                ] as { key: keyof typeof fOG; label: string }[]).map(({ key, label }) => (
                  <label key={key} style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 7, cursor: "pointer", fontSize: 13 }}>
                    <input type="checkbox" checked={!!fOG[key]} onChange={e => setFOG(p => ({ ...p, [key]: e.target.checked }))} />
                    {label}
                  </label>
                ))}
              </div>
              <div>
                <div style={{ fontSize: 11, fontWeight: 600, color: "#1A4870", marginBottom: 8, textTransform: "uppercase" }}>Lançamentos Específicos</div>
                {([
                  { key: "permite_estoque",          label: "Estoque"                               },
                  { key: "permite_pedidos_venda",    label: "Pedidos de Venda"                      },
                  { key: "permite_manutencao",       label: "Manutenção e Reparos"                  },
                  { key: "marcar_fiscal_padrao",     label: "Marcar como Fiscal por Padrão"         },
                  { key: "permite_energia_eletrica", label: "Importação de Energia Elétrica"        },
                ] as { key: keyof typeof fOG; label: string }[]).map(({ key, label }) => (
                  <label key={key} style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 7, cursor: "pointer", fontSize: 13 }}>
                    <input type="checkbox" checked={!!fOG[key]} onChange={e => setFOG(p => ({ ...p, [key]: e.target.checked }))} />
                    {label}
                  </label>
                ))}
              </div>
            </div>
          )}

          {/* ── Aba Estoque ── */}
          {abaOpGer === "estoque" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
              <div>
                <div style={{ fontSize: 11, fontWeight: 600, color: "#1A4870", marginBottom: 8, textTransform: "uppercase" }}>Operação de Estoque</div>
                <div style={{ display: "flex", gap: 24 }}>
                  {(["entrada","saida","neutra"] as const).map(v => (
                    <label key={v} style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", fontSize: 13 }}>
                      <input type="radio" checked={fOG.operacao_estoque === v} onChange={() => setFOG(p => ({ ...p, operacao_estoque: v }))} />
                      {v === "entrada" ? "Entrada" : v === "saida" ? "Saída" : "Neutra"}
                    </label>
                  ))}
                  <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", fontSize: 13 }}>
                    <input type="radio" checked={!fOG.operacao_estoque} onChange={() => setFOG(p => ({ ...p, operacao_estoque: "" }))} />
                    Não Aplica
                  </label>
                </div>
              </div>
              <div>
                <div style={{ fontSize: 11, fontWeight: 600, color: "#1A4870", marginBottom: 8, textTransform: "uppercase" }}>Tipo de Custo no Estoque</div>
                <div style={{ display: "flex", gap: 24 }}>
                  {(["gasto","ajuste","contrato","nenhum"] as const).map(v => (
                    <label key={v} style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", fontSize: 13 }}>
                      <input type="radio" checked={fOG.tipo_custo_estoque === v} onChange={() => setFOG(p => ({ ...p, tipo_custo_estoque: v }))} />
                      {v.charAt(0).toUpperCase() + v.slice(1)}
                    </label>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ── Aba Fiscal ── */}
          {abaOpGer === "fiscal" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div>
                  <label style={lbl}>OBS Legal (texto padrão na NF-e)</label>
                  <input style={inp} placeholder="Texto que aparece no campo infCpl da NF-e" value={fOG.obs_legal}
                    onChange={e => setFOG(p => ({ ...p, obs_legal: e.target.value }))} />
                </div>
                <div>
                  <label style={lbl}>Natureza da Receita</label>
                  <input style={inp} value={fOG.natureza_receita}
                    onChange={e => setFOG(p => ({ ...p, natureza_receita: e.target.value }))} />
                </div>
              </div>
              <div>
                <div style={{ fontSize: 11, fontWeight: 600, color: "#1A4870", marginBottom: 10, textTransform: "uppercase" }}>Impostos / Retenções</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {[
                    { key: "icms",         label: "ICMS"         },
                    { key: "funrural",     label: "FUNRURAL"     },
                    { key: "fethab1",      label: "FETHAB 1"     },
                    { key: "fethab2",      label: "FETHAB 2"     },
                    { key: "iagro",        label: "IAGRO"        },
                    { key: "senar",        label: "SENAR"        },
                    { key: "cbs",          label: "CBS"          },
                    { key: "ibs_estadual", label: "IBS Estadual" },
                  ].map(({ key, label }) => (
                    <label key={key} style={{
                      display: "flex", alignItems: "center", gap: 6, cursor: "pointer", fontSize: 13,
                      padding: "6px 12px", border: "0.5px solid #D4DCE8", borderRadius: 6,
                      background: fOG.impostos.includes(key) ? "#D5E8F5" : "#fff",
                    }}>
                      <input type="checkbox" checked={fOG.impostos.includes(key)}
                        onChange={e => setFOG(p => ({
                          ...p, impostos: e.target.checked ? [...p.impostos, key] : p.impostos.filter(x => x !== key)
                        }))} />
                      {label}
                    </label>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ── Aba Financeiro/Custos ── */}
          {abaOpGer === "financeiro" && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
              <div>
                <div style={{ fontSize: 11, fontWeight: 600, color: "#1A4870", marginBottom: 8, textTransform: "uppercase" }}>Financeiro</div>
                {([
                  { key: "gerar_financeiro",           label: "Gerar Financeiro"                  },
                  { key: "gerar_financeiro_gerencial",  label: "Gerar Financeiro Gerencial"        },
                  { key: "valida_propriedade",         label: "Valida Propriedade no Lançamento"  },
                ] as { key: keyof typeof fOG; label: string }[]).map(({ key, label }) => (
                  <label key={key} style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 8, cursor: "pointer", fontSize: 13 }}>
                    <input type="checkbox" checked={!!fOG[key]} onChange={e => setFOG(p => ({ ...p, [key]: e.target.checked }))} />
                    {label}
                  </label>
                ))}
                <div style={{ fontSize: 11, fontWeight: 600, color: "#1A4870", marginBottom: 8, marginTop: 16, textTransform: "uppercase" }}>Custos</div>
                {([
                  { key: "custo_absorcao",          label: "Custo por Absorção"            },
                  { key: "custo_abc",               label: "Custo ABC"                     },
                  { key: "atualizar_custo_estoque", label: "Atualizar Custo do Estoque"    },
                ] as { key: keyof typeof fOG; label: string }[]).map(({ key, label }) => (
                  <label key={key} style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 8, cursor: "pointer", fontSize: 13 }}>
                    <input type="checkbox" checked={!!fOG[key]} onChange={e => setFOG(p => ({ ...p, [key]: e.target.checked }))} />
                    {label}
                  </label>
                ))}
              </div>
              <div>
                <div style={{ fontSize: 11, fontWeight: 600, color: "#1A4870", marginBottom: 8, textTransform: "uppercase" }}>Patrimonial</div>
                {([
                  { key: "manutencao_reparos", label: "Manutenção e Reparos" },
                  { key: "gerar_depreciacao",  label: "Gerar Depreciação"    },
                ] as { key: keyof typeof fOG; label: string }[]).map(({ key, label }) => (
                  <label key={key} style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 8, cursor: "pointer", fontSize: 13 }}>
                    <input type="checkbox" checked={!!fOG[key]} onChange={e => setFOG(p => ({ ...p, [key]: e.target.checked }))} />
                    {label}
                  </label>
                ))}
                <div style={{ fontSize: 11, color: "#888", marginTop: 12, fontStyle: "italic" }}>
                  Tipo de Fórmula e Modelo Contábil → aba Contabilidade
                </div>
              </div>
            </div>
          )}

          {/* ── Aba Contabilidade ── */}
          {abaOpGer === "contabilidade" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                <div>
                  <label style={lbl}>Conta Contábil — Débito</label>
                  <select style={{ ...inp, fontFamily: "monospace" }} value={fOG.conta_debito}
                    onChange={e => setFOG(p => ({ ...p, conta_debito: e.target.value }))}>
                    <option value="">— Selecione a conta de débito —</option>
                    {planoContasDB.map(c => {
                      const d = c.codigo ? c.codigo.split('.').length - 1 : 0;
                      return (
                        <option key={c.codigo} value={c.codigo}
                          style={{ paddingLeft: d * 12, fontWeight: d <= 1 ? 600 : 400 }}>
                          {"\u00A0".repeat(d * 3)}{labelConta(c)}
                        </option>
                      );
                    })}
                  </select>
                  <div style={{ fontSize: 11, color: "#888", marginTop: 4 }}>Conta de débito no razão contábil</div>
                </div>
                <div>
                  <label style={lbl}>Conta Contábil — Crédito</label>
                  <select style={{ ...inp, fontFamily: "monospace" }} value={fOG.conta_credito}
                    onChange={e => setFOG(p => ({ ...p, conta_credito: e.target.value }))}>
                    <option value="">— Selecione a conta de crédito —</option>
                    {planoContasDB.map(c => {
                      const d = c.codigo ? c.codigo.split('.').length - 1 : 0;
                      return (
                        <option key={c.codigo} value={c.codigo}
                          style={{ paddingLeft: d * 12, fontWeight: d <= 1 ? 600 : 400 }}>
                          {"\u00A0".repeat(d * 3)}{labelConta(c)}
                        </option>
                      );
                    })}
                  </select>
                  <div style={{ fontSize: 11, color: "#888", marginTop: 4 }}>Conta de crédito no razão contábil</div>
                </div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                <div>
                  <label style={lbl}>Tipo de Fórmula</label>
                  <select style={inp} value={fOG.tipo_formula} onChange={e => setFOG(p => ({ ...p, tipo_formula: e.target.value as OperacaoGerencial["tipo_formula"] | "" }))}>
                    <option value="">— Nenhuma —</option>
                    <option value="baixas">Baixas</option>
                    <option value="tesouraria">Tesouraria</option>
                    <option value="adiantamentos">Adiantamentos</option>
                  </select>
                </div>
                <div>
                  <label style={lbl}>Modelo Contábil</label>
                  <input style={inp} placeholder="Código do modelo de lançamento contábil" value={fOG.modelo_contabil}
                    onChange={e => setFOG(p => ({ ...p, modelo_contabil: e.target.value }))} />
                </div>
              </div>
              <div style={{ padding: "12px 16px", background: "#F8FAFD", borderRadius: 8, border: "0.5px solid #D4DCE8" }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: "#1A4870", marginBottom: 6 }}>COMO FUNCIONA</div>
                <div style={{ fontSize: 12, color: "#555", lineHeight: 1.6 }}>
                  Ao lançar uma despesa ou receita nesta operação, o sistema gera automaticamente a partida contábil:<br />
                  <strong>Débito</strong> na conta informada acima → <strong>Crédito</strong> na contra-partida.<br />
                  Deixe em branco se a operação não gera lançamento contábil automático.
                </div>
              </div>
            </div>
          )}

          {/* ── Aba Histórico Fiscal (CFOPs) ── */}
          {abaOpGer === "cfop" && (
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                <div style={{ fontSize: 12, color: "#555" }}>CFOPs e CSTs PIS/COFINS válidos para esta operação</div>
                {editOpGer && (
                  <button style={{ ...btnV, fontSize: 12, padding: "6px 14px" }} onClick={() => {
                    setFCfop({ cfop: "", descricao_cfop: "", cst_pis: "08", cst_cofins: "08", tipo_pessoa: "Indiferente", ncm: "", fins_exportacao: false, compoe_faturamento: true });
                    setModalCfop(true);
                  }}>+ Adicionar CFOP</button>
                )}
              </div>
              {!editOpGer && <div style={{ padding: 16, background: "#FBF3E0", borderRadius: 8, color: "#7A5A10", fontSize: 12 }}>Salve a operação primeiro para adicionar CFOPs.</div>}
              {loadingCfops && <div style={{ textAlign: "center", padding: 20, color: "#888" }}>Carregando…</div>}
              {!loadingCfops && cfopsOp.length === 0 && editOpGer && <div style={{ textAlign: "center", padding: 20, color: "#888", fontSize: 12 }}>Nenhum CFOP cadastrado. Adicione para habilitar preenchimento automático nas NFs.</div>}
              {cfopsOp.length > 0 && (
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                  <thead>
                    <tr style={{ background: "#F8FAFD", borderBottom: "0.5px solid #D4DCE8" }}>
                      {["CFOP","Descrição","CST PIS","CST COFINS","Tipo Pessoa","Fins Exp.","Comp. Fat.",""].map(h => (
                        <th key={h} style={{ padding: "8px 10px", textAlign: "left", fontSize: 11, color: "#555", fontWeight: 600 }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {cfopsOp.map((c, i) => (
                      <tr key={c.id} style={{ borderBottom: "0.5px solid #F0F0F0" }}>
                        <td style={{ padding: "7px 10px", fontFamily: "monospace", fontWeight: 600 }}>{c.cfop}</td>
                        <td style={{ padding: "7px 10px", maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.descricao_cfop ?? "—"}</td>
                        <td style={{ padding: "7px 10px", textAlign: "center" }}>{c.cst_pis ?? "—"}</td>
                        <td style={{ padding: "7px 10px", textAlign: "center" }}>{c.cst_cofins ?? "—"}</td>
                        <td style={{ padding: "7px 10px" }}>{c.tipo_pessoa ?? "Indiferente"}</td>
                        <td style={{ padding: "7px 10px", textAlign: "center" }}>{c.fins_exportacao ? "Sim" : "Não"}</td>
                        <td style={{ padding: "7px 10px", textAlign: "center" }}>{c.compoe_faturamento ? "Sim" : "Não"}</td>
                        <td style={{ padding: "7px 10px" }}>
                          <button style={btnX} onClick={() => {
                            if (!confirm("Remover este CFOP?")) return;
                            import("../../lib/db").then(m => m.excluirCfopFiscal(c.id))
                              .then(() => setCfopsOp(x => x.filter(r => r.id !== c.id)));
                          }}>✕</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              {/* Campo Tesouraria na mesma aba */}
              <div style={{ marginTop: 16, borderTop: "0.5px solid #D4DCE8", paddingTop: 14 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: "#1A4870", marginBottom: 10 }}>HISTÓRICO TESOURARIA</div>
                <div style={{ display: "grid", gridTemplateColumns: "160px 1fr", gap: 12 }}>
                  <div>
                    <label style={lbl}>ID Tesouraria</label>
                    <select style={inp} value={String(fOG.historico_tesouraria_id ?? "")}
                      onChange={e => {
                        const id = e.target.value;
                        const nomes: Record<string,string> = { "1": "PAGAMENTO CONTAS", "2": "COMPENSAÇÃO CHEQUE PRÓPRIO", "3": "RECEBIMENTO CONTAS", "4": "DEPÓSITO BANCÁRIO", "345": "TRANSF. VALORES", "386": "IMPLANTAÇÃO DE SALDO D", "387": "IMPLANTAÇÃO DE SALDO C" };
                        setFOG(p => ({ ...p, historico_tesouraria_id: id ? Number(id) : "", historico_tesouraria_nome: nomes[id] ?? "" }));
                      }}>
                      <option value="">— Nenhum —</option>
                      <option value="1">1 — PAGAMENTO CONTAS</option>
                      <option value="2">2 — COMPENSAÇÃO CHEQUE PRÓPRIO</option>
                      <option value="3">3 — RECEBIMENTO CONTAS</option>
                      <option value="4">4 — DEPÓSITO BANCÁRIO</option>
                      <option value="345">345 — TRANSF. VALORES</option>
                      <option value="386">386 — IMPLANTAÇÃO DE SALDO D</option>
                      <option value="387">387 — IMPLANTAÇÃO DE SALDO C</option>
                    </select>
                  </div>
                  <div>
                    <label style={lbl}>Nome Histórico</label>
                    <input style={inp} readOnly value={fOG.historico_tesouraria_nome} placeholder="Preenchido automaticamente" />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ── Modal CFOP ── */}
          {modalCfop && editOpGer && (
            <div style={{ position: "fixed", inset: 0, background: "#00000060", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <div style={{ background: "#fff", borderRadius: 12, padding: 24, width: 520, boxShadow: "0 8px 32px #0003" }}>
                <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 16 }}>Adicionar CFOP — {fOG.classificacao} {fOG.descricao}</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: 12, marginBottom: 12 }}>
                  <div>
                    <label style={lbl}>CFOP *</label>
                    <input style={{ ...inp, fontFamily: "monospace" }} maxLength={4} placeholder="5101"
                      value={fCfop.cfop} onChange={e => setFCfop(p => ({ ...p, cfop: e.target.value.replace(/\D/g, "") }))} />
                  </div>
                  <div>
                    <label style={lbl}>Descrição CFOP</label>
                    <input style={inp} placeholder="Ex: VENDA DE PRODUÇÃO DO ESTABELECIMENTO"
                      value={fCfop.descricao_cfop} onChange={e => setFCfop(p => ({ ...p, descricao_cfop: e.target.value }))} />
                  </div>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 12 }}>
                  <div>
                    <label style={lbl}>CST PIS</label>
                    <select style={inp} value={fCfop.cst_pis} onChange={e => setFCfop(p => ({ ...p, cst_pis: e.target.value }))}>
                      <option value="07">07 — Isenta</option>
                      <option value="08">08 — Sem incidência</option>
                      <option value="49">49 — Outras saídas</option>
                      <option value="50">50 — Com crédito básico</option>
                      <option value="70">70 — Aquisição suspenção</option>
                      <option value="99">99 — Outras operações</option>
                    </select>
                  </div>
                  <div>
                    <label style={lbl}>CST COFINS</label>
                    <select style={inp} value={fCfop.cst_cofins} onChange={e => setFCfop(p => ({ ...p, cst_cofins: e.target.value }))}>
                      <option value="07">07 — Isenta</option>
                      <option value="08">08 — Sem incidência</option>
                      <option value="49">49 — Outras saídas</option>
                      <option value="50">50 — Com crédito básico</option>
                      <option value="70">70 — Aquisição suspenção</option>
                      <option value="99">99 — Outras operações</option>
                    </select>
                  </div>
                  <div>
                    <label style={lbl}>Tipo Pessoa</label>
                    <select style={inp} value={fCfop.tipo_pessoa} onChange={e => setFCfop(p => ({ ...p, tipo_pessoa: e.target.value }))}>
                      <option value="Indiferente">Indiferente</option>
                      <option value="PF">PF</option>
                      <option value="PJ">PJ</option>
                    </select>
                  </div>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
                  <div>
                    <label style={lbl}>NCM (opcional)</label>
                    <input style={inp} placeholder="Ex: 12019000" value={fCfop.ncm}
                      onChange={e => setFCfop(p => ({ ...p, ncm: e.target.value }))} />
                  </div>
                  <div style={{ display: "flex", gap: 20, alignItems: "flex-end", paddingBottom: 4 }}>
                    <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 13 }}>
                      <input type="checkbox" checked={fCfop.fins_exportacao} onChange={e => setFCfop(p => ({ ...p, fins_exportacao: e.target.checked }))} />
                      Fins Exportação
                    </label>
                    <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 13 }}>
                      <input type="checkbox" checked={fCfop.compoe_faturamento} onChange={e => setFCfop(p => ({ ...p, compoe_faturamento: e.target.checked }))} />
                      Compõe Faturamento
                    </label>
                  </div>
                </div>
                <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                  <button style={btnR} onClick={() => setModalCfop(false)}>Cancelar</button>
                  <button style={btnV} disabled={!fCfop.cfop} onClick={async () => {
                    if (!fCfop.cfop || !fazendaId) return;
                    const novo = await import("../../lib/db").then(m => m.salvarCfopFiscal({
                      operacao_gerencial_id: editOpGer.id,
                      fazenda_id: fazendaId,
                      cfop: fCfop.cfop,
                      descricao_cfop: fCfop.descricao_cfop || undefined,
                      cst_pis: fCfop.cst_pis || undefined,
                      cst_cofins: fCfop.cst_cofins || undefined,
                      tipo_pessoa: fCfop.tipo_pessoa,
                      ncm: fCfop.ncm || undefined,
                      fins_exportacao: fCfop.fins_exportacao,
                      compoe_faturamento: fCfop.compoe_faturamento,
                      ativo: true,
                    }));
                    setCfopsOp(x => [...x, novo]);
                    setModalCfop(false);
                  }}>Salvar CFOP</button>
                </div>
              </div>
            </div>
          )}

          {/* Footer */}
          {erroOpGer && (
            <div style={{ margin: "0 0 10px", padding: "8px 14px", background: "#FCEBEB", border: "0.5px solid #E24B4A50", borderRadius: 8, color: "#791F1F", fontSize: 12 }}>
              {erroOpGer}
            </div>
          )}
          <div style={{ marginTop: 20, paddingTop: 14, borderTop: "0.5px solid #D4DCE8", display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <button style={btnR} onClick={() => { setModalOpGer(false); setErroOpGer(null); }}>Cancelar</button>
            <button style={btnV} disabled={!fOG.classificacao.trim() || !fOG.descricao.trim() || salvando || !fazendaId}
              onClick={async () => {
                setErroOpGer(null);
                await salvar(async () => {
                  const payload: Omit<OperacaoGerencial, "id" | "created_at"> = {
                    fazenda_id: fazIdEff!,
                    parent_id: fOG.parent_id || undefined,
                    classificacao: fOG.classificacao, descricao: fOG.descricao, tipo: fOG.tipo,
                    tipo_lcdpr: fOG.tipo_lcdpr || undefined,
                    inativo: fOG.inativo, informa_complemento: fOG.informa_complemento,
                    permite_notas_fiscais: fOG.permite_notas_fiscais,
                    permite_cp_cr: fOG.permite_cp_cr,
                    permite_adiantamentos: fOG.permite_adiantamentos,
                    permite_tesouraria: fOG.permite_tesouraria,
                    permite_baixas: fOG.permite_baixas,
                    permite_custo_produto: fOG.permite_custo_produto,
                    permite_contrato_financeiro: fOG.permite_contrato_financeiro,
                    permite_estoque: fOG.permite_estoque,
                    permite_pedidos_venda: fOG.permite_pedidos_venda,
                    permite_manutencao: fOG.permite_manutencao,
                    marcar_fiscal_padrao: fOG.marcar_fiscal_padrao,
                    permite_energia_eletrica: fOG.permite_energia_eletrica,
                    operacao_estoque: fOG.operacao_estoque || undefined,
                    tipo_custo_estoque: fOG.tipo_custo_estoque,
                    obs_legal: fOG.obs_legal || undefined,
                    natureza_receita: fOG.natureza_receita || undefined,
                    impostos: fOG.impostos.length > 0 ? fOG.impostos : undefined,
                    gerar_financeiro: fOG.gerar_financeiro,
                    gerar_financeiro_gerencial: fOG.gerar_financeiro_gerencial,
                    valida_propriedade: fOG.valida_propriedade,
                    custo_absorcao: fOG.custo_absorcao,
                    custo_abc: fOG.custo_abc,
                    atualizar_custo_estoque: fOG.atualizar_custo_estoque,
                    manutencao_reparos: fOG.manutencao_reparos,
                    gerar_depreciacao: fOG.gerar_depreciacao,
                    tipo_formula: fOG.tipo_formula || undefined,
                    modelo_contabil: fOG.modelo_contabil || undefined,
                    conta_debito: fOG.conta_debito || undefined,
                    conta_credito: fOG.conta_credito || undefined,
                    historico_tesouraria_id: fOG.historico_tesouraria_id !== "" ? Number(fOG.historico_tesouraria_id) : undefined,
                    historico_tesouraria_nome: fOG.historico_tesouraria_nome || undefined,
                  };
                  if (editOpGer) {
                    await atualizarOperacaoGerencial(editOpGer.id, payload);
                    setOpGers(x => x.map(r => r.id === editOpGer.id ? { ...r, ...payload } : r));
                  } else {
                    const n = await criarOperacaoGerencial(payload);
                    setOpGers(x => [...x, n]);
                  }
                  setErroOpGer(null);
                  setModalOpGer(false);
                }).catch((e: unknown) => {
                  const msg = (e instanceof Error ? e.message : String(e)) ?? "Erro ao salvar";
                  setErroOpGer(msg);
                });
              }}>{salvando ? "Salvando…" : "Salvar Operação"}</button>
          </div>
        </Modal>
      )}

      {/* Modal Forma de Pagamento */}
      {modalFP && (
        <Modal titulo={editFP ? "Editar Forma de Pagamento" : "Nova Forma de Pagamento"} onClose={() => setModalFP(false)}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            <div style={{ gridColumn: "1/-1" }}>
              <label style={lbl}>Nome *</label>
              <input style={inp} placeholder="Ex: 30/60/90 dias" value={fFP.nome} onChange={e => setFFP(p => ({ ...p, nome: e.target.value }))} />
            </div>
            <div>
              <label style={lbl}>Nº de Parcelas</label>
              <InputNumerico style={inp} decimais={0} min="1" placeholder="Ex: 3" value={fFP.parcelas} onChange={v => setFFP(p => ({ ...p, parcelas: v }))} />
            </div>
            <div>
              <label style={lbl}>Intervalo (dias)</label>
              <input style={inp} placeholder="Ex: 30/60/90" value={fFP.dias} onChange={e => setFFP(p => ({ ...p, dias: e.target.value }))} />
            </div>
            <div style={{ gridColumn: "1/-1" }}>
              <label style={lbl}>Descrição</label>
              <input style={inp} value={fFP.descricao} onChange={e => setFFP(p => ({ ...p, descricao: e.target.value }))} />
            </div>
            <button style={{ ...btnV, gridColumn: "1/-1" }} disabled={!fFP.nome.trim() || salvando} onClick={async () => {
              await salvar(async () => {
                const payload = {
                  nome: fFP.nome, descricao: fFP.descricao || undefined,
                  parcelas: fFP.parcelas ? parseInt(fFP.parcelas) : undefined,
                  dias: fFP.dias || undefined,
                };
                if (editFP) {
                  await atualizarFormaPagamento(editFP.id, payload);
                  setFormasPagamento(x => x.map(r => r.id === editFP.id ? { ...r, ...payload } : r));
                } else {
                  const n = await criarFormaPagamento({ fazenda_id: fazIdEff!, ...payload });
                  setFormasPagamento(x => [...x, n]);
                }
                setModalFP(false);
              });
            }}>{salvando ? "Salvando…" : "Salvar"}</button>
          </div>
        </Modal>
      )}

      {/* Modal Depósito */}
      {modalDep && (
        <Modal titulo={editDep ? "Editar Depósito" : "Novo Depósito"} onClose={() => setModalDep(false)}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            <div style={{ gridColumn: "1/-1" }}><label style={lbl}>Nome *</label><input style={inp} placeholder="Ex: Armazém 1 — Sede" value={fDep.nome} onChange={e => setFDep(p => ({ ...p, nome: e.target.value }))} /></div>
            <div>
              <label style={lbl}>Tipo *</label>
              <select style={inp} value={fDep.tipo} onChange={e => setFDep(p => ({ ...p, tipo: e.target.value as Deposito["tipo"] }))}>
                <option value="insumo_fazenda">Depósito de Insumo — Fazenda</option>
                <option value="armazem_fazenda">Armazém / Silo — Fazenda</option>
                <option value="almoxarifado">Almoxarifado — Fazenda</option>
                <option value="oficina">Oficina — Fazenda</option>
                <option value="terceiro">Depósito de Terceiros</option>
                <option value="armazem_terceiro">Armazém / Silo Terceiros</option>
              </select>
            </div>
            <div><label style={lbl}>Capacidade (sacas)</label><InputNumerico style={inp} decimais={0} placeholder="Ex: 50000" value={fDep.capacidade_sc} onChange={v => setFDep(p => ({ ...p, capacidade_sc: v }))} /></div>
          </div>
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 20 }}>
            <button style={btnR} onClick={() => setModalDep(false)}>Cancelar</button>
            <button style={{ ...btnV, opacity: salvando || !fDep.nome.trim() ? 0.5 : 1 }} disabled={salvando || !fDep.nome.trim()} onClick={salvarDep}>{salvando ? "Salvando…" : "Salvar"}</button>
          </div>
        </Modal>
      )}

      {/* Modal Funcionário — 4 abas */}
      {modalFunc && (() => {
        const sal   = Number(fFunc.salario_base) || 0;
        const funrural = fFunc.usar_funrural;
        const encFgts    = sal * (Number(fFunc.fgts_pct) / 100);
        const encInss    = sal * (Number(fFunc.inss_empregador_pct) / 100);
        const encSat     = sal * (Number(fFunc.sat_rat_pct) / 100);
        const encSistS   = sal * (Number(fFunc.sistema_s_pct) / 100);
        const encProv13  = sal * (Number(fFunc.provisao_13_pct) / 100);
        const encProvFer = sal * (Number(fFunc.provisao_ferias_pct) / 100);
        const totalEncargos = encFgts + encInss + encSat + encSistS + encProv13 + encProvFer;
        const custoTotal = sal + totalEncargos;
        const R = (v: number) => v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

        const hoje = new Date();
        const ferDisp = ferias.filter(f => f.status === "disponivel" || f.status === "vencido").length;

        return (
          <Modal titulo={editFunc ? `Funcionário — ${editFunc.nome}` : "Novo Funcionário"} onClose={() => setModalFunc(false)} width={920}>
            {/* Tabs */}
            <div style={{ display: "flex", borderBottom: "0.5px solid #DEE5EE", marginBottom: 20, gap: 0 }}>
              {(["dados","remuneracao","premiacoes","ferias"] as const).map(t => {
                const labels: Record<string, string> = { dados: "Dados Pessoais", remuneracao: "Remuneração", premiacoes: `Premiações (${premiacoes.length})`, ferias: `Férias${ferDisp > 0 ? ` ⚠ ${ferDisp}` : ""}` };
                return (
                  <button key={t} onClick={() => setAbaFunc(t)} style={{ padding: "8px 18px", fontSize: 12, fontWeight: abaFunc === t ? 700 : 400, color: abaFunc === t ? "#1A4870" : "#666", background: "none", border: "none", borderBottom: abaFunc === t ? "2px solid #1A4870" : "2px solid transparent", cursor: "pointer", whiteSpace: "nowrap" }}>
                    {labels[t]}
                  </button>
                );
              })}
            </div>

            {/* ABA DADOS */}
            {abaFunc === "dados" && (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14 }}>
                <div style={{ gridColumn: "1/-1" }}><label style={lbl}>Nome completo *</label><input style={inp} value={fFunc.nome} onChange={e => setFFunc(p => ({ ...p, nome: e.target.value }))} /></div>
                <div><label style={lbl}>CPF</label><input style={inp} value={fFunc.cpf} onChange={e => setFFunc(p => ({ ...p, cpf: maskCpfCnpj(e.target.value, "pf") }))} placeholder="000.000.000-00" /></div>
                <div><label style={lbl}>RG</label><input style={inp} value={fFunc.rg} onChange={e => setFFunc(p => ({ ...p, rg: e.target.value }))} placeholder="00.000.000-0" /></div>
                <div><label style={lbl}>Data de nascimento</label><input style={inp} type="date" value={fFunc.data_nascimento} onChange={e => setFFunc(p => ({ ...p, data_nascimento: e.target.value }))} /></div>
                <div><label style={lbl}>PIS / NIS</label><input style={inp} value={fFunc.pis_nis} onChange={e => setFFunc(p => ({ ...p, pis_nis: e.target.value }))} placeholder="000.00000.00-0" /></div>
                <div><label style={lbl}>CTPS Número</label><input style={inp} value={fFunc.ctps_numero} onChange={e => setFFunc(p => ({ ...p, ctps_numero: e.target.value }))} /></div>
                <div><label style={lbl}>CTPS Série</label><input style={inp} value={fFunc.ctps_serie} onChange={e => setFFunc(p => ({ ...p, ctps_serie: e.target.value }))} /></div>
                <div><label style={lbl}>CTPS UF</label>
                  <select style={inp} value={fFunc.ctps_uf} onChange={e => setFFunc(p => ({ ...p, ctps_uf: e.target.value }))}>
                    <option value="">—</option>
                    {["AC","AL","AM","AP","BA","CE","DF","ES","GO","MA","MG","MS","MT","PA","PB","PE","PI","PR","RJ","RN","RO","RR","RS","SC","SE","SP","TO"].map(uf => <option key={uf} value={uf}>{uf}</option>)}
                  </select>
                </div>
                <div><label style={lbl}>Vínculo *</label>
                  <select style={inp} value={fFunc.tipo} onChange={e => setFFunc(p => ({ ...p, tipo: e.target.value as Funcionario["tipo"] }))}>
                    <option value="clt">CLT</option>
                    <option value="diarista">Diarista / Volante</option>
                    <option value="empreiteiro">Empreiteiro</option>
                    <option value="outro">Outro</option>
                  </select>
                </div>
                <div><label style={lbl}>Vínculo eSocial</label>
                  <select style={inp} value={fFunc.tipo_vinculo_esocial} onChange={e => setFFunc(p => ({ ...p, tipo_vinculo_esocial: e.target.value }))}>
                    <option value="">— (automático pelo vínculo)</option>
                    <option value="clt">CLT</option>
                    <option value="avulso_rural">Avulso Rural</option>
                    <option value="tsve">TSVE (Trab. Sem Vínculo Empregatício)</option>
                    <option value="meeiro">Meeiro</option>
                    <option value="parceiro">Parceiro</option>
                    <option value="estagiario">Estagiário</option>
                  </select>
                </div>
                <div><label style={lbl}>Função / Cargo</label><input style={inp} value={fFunc.funcao} onChange={e => setFFunc(p => ({ ...p, funcao: e.target.value }))} placeholder="Operador de máquina, tratorista…" /></div>
                <div><label style={lbl}>Data de admissão</label><input style={inp} type="date" value={fFunc.data_admissao} onChange={e => setFFunc(p => ({ ...p, data_admissao: e.target.value }))} /></div>
                <div><label style={lbl}>Data de demissão</label><input style={inp} type="date" value={fFunc.data_demissao} onChange={e => setFFunc(p => ({ ...p, data_demissao: e.target.value }))} /></div>
                <div style={{ gridColumn: "1/-1" }}>
                  <label style={lbl}>Banco para pagamento</label>
                  <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 2fr", gap: 10 }}>
                    <input style={inp} value={fFunc.banco_pagamento} onChange={e => setFFunc(p => ({ ...p, banco_pagamento: e.target.value }))} placeholder="Banco" />
                    <input style={inp} value={fFunc.agencia_pagamento} onChange={e => setFFunc(p => ({ ...p, agencia_pagamento: e.target.value }))} placeholder="Agência" />
                    <input style={inp} value={fFunc.conta_pagamento} onChange={e => setFFunc(p => ({ ...p, conta_pagamento: e.target.value }))} placeholder="Conta" />
                  </div>
                </div>
                <div>
                  <label style={lbl}>Produtor vinculado</label>
                  <ProdutorCombo
                    produtores={produtores}
                    value={fFunc.produtor_id}
                    onChange={id => setFFunc(p => ({ ...p, produtor_id: id }))}
                    placeholder="— Sem vínculo —"
                  />
                </div>
                <div>
                  <label style={lbl}>Centro de Custo</label>
                  <select style={inp} value={fFunc.centro_custo_id} onChange={e => setFFunc(p => ({ ...p, centro_custo_id: e.target.value }))}>
                    <option value="">— Sem vínculo —</option>
                    {centrosCusto.filter(c => !centrosCusto.some(x => x.parent_id === c.id)).map(c => (
                      <option key={c.id} value={c.id}>{c.codigo ? `${c.codigo} — ` : ""}{c.nome}</option>
                    ))}
                  </select>
                </div>
                <div style={{ gridColumn: "1/-1", display: "flex", alignItems: "center", gap: 8 }}>
                  <input type="checkbox" id="funcAtivo" checked={fFunc.ativo} onChange={e => setFFunc(p => ({ ...p, ativo: e.target.checked }))} />
                  <label htmlFor="funcAtivo" style={{ fontSize: 12, color: "#555" }}>Funcionário ativo</label>
                </div>
              </div>
            )}

            {/* ABA REMUNERAÇÃO */}
            {abaFunc === "remuneracao" && (
              <div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14, marginBottom: 20 }}>
                  <div><label style={lbl}>Salário base (R$)</label><InputMonetario style={inp} value={fFunc.salario_base} onChange={v => setFFunc(p => ({ ...p, salario_base: String(v) }))} placeholder="0,00" /></div>
                  <div><label style={lbl}>Piso da categoria (R$)</label><InputMonetario style={inp} value={fFunc.piso_categoria} onChange={v => setFFunc(p => ({ ...p, piso_categoria: String(v) }))} placeholder="referência" /></div>
                  <div style={{ display: "flex", alignItems: "flex-end", paddingBottom: 4 }}>
                    <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: "#555", cursor: "pointer" }}>
                      <input type="checkbox" checked={fFunc.usar_funrural} onChange={e => {
                        const v = e.target.checked;
                        setFFunc(p => ({ ...p, usar_funrural: v, inss_empregador_pct: v ? "1.5" : "20", sistema_s_pct: v ? "0.2" : "5.8" }));
                      }} />
                      Empregador rural (Funrural)
                    </label>
                  </div>
                </div>

                <div style={{ background: "#F8FAFD", border: "0.5px solid #D4DCE8", borderRadius: 10, padding: "14px 16px", marginBottom: 20 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: "#1A4870", marginBottom: 12 }}>Encargos trabalhistas — valores editáveis</div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
                    {[
                      { key: "fgts_pct", label: "FGTS (%)", valor: encFgts },
                      { key: "inss_empregador_pct", label: funrural ? "Funrural (%)" : "INSS Empregador (%)", valor: encInss },
                      { key: "sat_rat_pct", label: "SAT / RAT (%)", valor: encSat },
                      { key: "sistema_s_pct", label: funrural ? "SENAR (%)" : "Sistema S (%)", valor: encSistS },
                      { key: "provisao_13_pct", label: "Provisão 13º (%)", valor: encProv13 },
                      { key: "provisao_ferias_pct", label: "Provisão Férias + 1/3 (%)", valor: encProvFer },
                    ].map(({ key, label, valor }) => (
                      <div key={key}>
                        <label style={lbl}>{label}</label>
                        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                          <InputMonetario style={{ ...inp, width: 80 }} value={(fFunc as unknown as Record<string,string>)[key]} onChange={v => setFFunc(p => ({ ...p, [key]: String(v) }))} />
                          <span style={{ fontSize: 11, color: "#888" }}>{sal > 0 ? `= R$ ${R(valor)}` : ""}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {sal > 0 && (
                  <div style={{ background: "#EDF4FB", border: "0.5px solid #B0CEEA", borderRadius: 10, padding: "14px 18px" }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: "#1A4870", marginBottom: 10 }}>Custo mensal estimado</div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, fontSize: 12 }}>
                      <div><span style={{ color: "#555" }}>Salário base:</span> <strong>R$ {R(sal)}</strong></div>
                      <div><span style={{ color: "#555" }}>Total encargos:</span> <strong>R$ {R(totalEncargos)}</strong></div>
                      <div><span style={{ color: "#C9921B" }}>Custo total:</span> <strong style={{ color: "#C9921B", fontSize: 14 }}>R$ {R(custoTotal)}</strong></div>
                    </div>
                    <div style={{ marginTop: 8, fontSize: 11, color: "#666" }}>
                      Percentual de encargos sobre salário: {sal > 0 ? ((totalEncargos/sal)*100).toFixed(1) : 0}% — Custo/hora (220h): R$ {R(custoTotal/220)}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ABA PREMIAÇÕES */}
            {abaFunc === "premiacoes" && (
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                  <span style={{ fontSize: 12, color: "#555" }}>Prêmios e gratificações variáveis (não ocorrem todo mês)</span>
                  {editFunc && <button style={btnV} onClick={() => setModalPremiacao(true)}>+ Registrar Premiação</button>}
                </div>
                {!editFunc && <div style={{ padding: "20px", textAlign: "center", color: "#888", fontSize: 12 }}>Salve o funcionário primeiro para registrar premiações.</div>}
                {editFunc && premiacoes.length === 0 && <div style={{ padding: "20px", textAlign: "center", color: "#888", fontSize: 12 }}>Nenhuma premiação registrada.</div>}
                {premiacoes.length > 0 && (
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                    <thead>
                      <tr style={{ background: "#F4F6FA" }}>
                        {["Mês ref.", "Descrição", "Dt. Pagamento", "Valor", ""].map((h, i) => (
                          <th key={i} style={{ padding: "8px 12px", textAlign: i > 2 ? "right" : "left", fontWeight: 600, color: "#555", fontSize: 11, borderBottom: "0.5px solid #DEE5EE" }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {premiacoes.map((p, i) => (
                        <tr key={p.id} style={{ borderBottom: i < premiacoes.length-1 ? "0.5px solid #F0F2F6" : "none" }}>
                          <td style={{ padding: "8px 12px", color: "#555" }}>{p.mes_referencia}</td>
                          <td style={{ padding: "8px 12px", color: "#1a1a1a" }}>{p.descricao}</td>
                          <td style={{ padding: "8px 12px", color: "#555" }}>{p.data_pagamento || "—"}</td>
                          <td style={{ padding: "8px 12px", textAlign: "right", fontWeight: 600, color: "#1A4870" }}>R$ {R(p.valor)}</td>
                          <td style={{ padding: "8px 12px", textAlign: "right" }}>
                            <button style={btnX} onClick={() => { if (confirm("Excluir?")) excluirPremiacao(p.id).then(() => setPremiacoes(x => x.filter(r => r.id !== p.id))); }}>✕</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
                {premiacoes.length > 0 && (
                  <div style={{ marginTop: 12, padding: "10px 14px", background: "#F8FAFD", borderRadius: 8, display: "flex", justifyContent: "flex-end", fontSize: 12 }}>
                    <span>Total premiações: <strong>R$ {R(premiacoes.reduce((s,p) => s + p.valor, 0))}</strong></span>
                  </div>
                )}
              </div>
            )}

            {/* ABA FÉRIAS */}
            {abaFunc === "ferias" && (
              <div>
                {ferias.length === 0 && <div style={{ padding: "20px", textAlign: "center", color: "#888", fontSize: 12 }}>{editFunc ? "Nenhum período aquisitivo encontrado. Salve com data de admissão para calcular automaticamente." : "Salve o funcionário com data de admissão para calcular períodos de férias."}</div>}
                {ferias.length > 0 && (
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                    <thead>
                      <tr style={{ background: "#F4F6FA" }}>
                        {["Período aquisitivo", "Vencimento", "Status", "Gozo", "Dias", ""].map((h, i) => (
                          <th key={i} style={{ padding: "8px 12px", textAlign: "left", fontWeight: 600, color: "#555", fontSize: 11, borderBottom: "0.5px solid #DEE5EE" }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {ferias.map((fer, i) => {
                        const vencConc = new Date(fer.periodo_fim);
                        vencConc.setFullYear(vencConc.getFullYear() + 1);
                        const diasRestVenc = Math.ceil((vencConc.getTime() - hoje.getTime()) / 86400000);
                        const corStatus: Record<string, [string,string]> = {
                          aquisindo: ["#EDF4FB","#0B3A6B"], disponivel: ["#D5F0E0","#145C33"],
                          concedido: ["#FBF3E0","#7A5000"], gozado: ["#F4F6FA","#555"], vencido: ["#FDECEA","#8B1A1A"],
                        };
                        const [bgS, clS] = corStatus[fer.status] ?? ["#F4F6FA","#555"];
                        return (
                          <tr key={fer.id} style={{ borderBottom: i < ferias.length-1 ? "0.5px solid #F0F2F6" : "none" }}>
                            <td style={{ padding: "10px 12px", color: "#1a1a1a" }}>{fer.periodo_inicio} → {fer.periodo_fim}</td>
                            <td style={{ padding: "10px 12px", color: diasRestVenc < 60 && fer.status !== "gozado" ? "#C9331B" : "#555" }}>
                              {vencConc.toISOString().slice(0,10)}
                              {fer.status === "disponivel" && diasRestVenc < 60 && <span style={{ marginLeft: 4, fontSize: 10, color: "#C9331B", fontWeight: 700 }}> ⚠ {diasRestVenc}d</span>}
                            </td>
                            <td style={{ padding: "10px 12px" }}>{badge(fer.status.toUpperCase(), bgS, clS)}</td>
                            <td style={{ padding: "10px 12px", color: "#555" }}>
                              {fer.data_inicio_gozo ? `${fer.data_inicio_gozo} → ${fer.data_fim_gozo || "?"}` : "—"}
                            </td>
                            <td style={{ padding: "10px 12px", color: "#1a1a1a" }}>
                              {fer.dias_gozados ? `${fer.dias_gozados}d${fer.abono_pecuniario ? ` + ${fer.dias_abono}d abono` : ""}` : "30d"}
                            </td>
                            <td style={{ padding: "10px 12px", textAlign: "right" }}>
                              {(fer.status === "disponivel" || fer.status === "vencido") && (
                                <button style={btnE} onClick={() => { setModalGozo(fer); setFGozo({ data_inicio_gozo: "", data_fim_gozo: "", dias_gozados: "30", abono_pecuniario: false, dias_abono: "10" }); }}>
                                  Conceder
                                </button>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>
            )}

            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 20, borderTop: "0.5px solid #EEF1F6", paddingTop: 16 }}>
              <button style={btnR} onClick={() => setModalFunc(false)}>Cancelar</button>
              <button style={{ ...btnV, opacity: salvando || !fFunc.nome.trim() ? 0.5 : 1 }} disabled={salvando || !fFunc.nome.trim()} onClick={salvarFunc}>{salvando ? "Salvando…" : "Salvar Funcionário"}</button>
            </div>
          </Modal>
        );
      })()}

      {/* Modal Nova Premiação */}
      {modalPremiacao && (
        <Modal titulo="Registrar Premiação" onClose={() => setModalPremiacao(false)} width={500}>
          <div style={{ display: "grid", gap: 14 }}>
            <div><label style={lbl}>Mês de referência</label><input style={inp} type="month" value={fPremiacao.mes_referencia} onChange={e => setFPremiacao(p => ({ ...p, mes_referencia: e.target.value }))} /></div>
            <div><label style={lbl}>Descrição *</label><input style={inp} value={fPremiacao.descricao} onChange={e => setFPremiacao(p => ({ ...p, descricao: e.target.value }))} placeholder="Prêmio produtividade, gratificação safra…" /></div>
            <div><label style={lbl}>Valor (R$) *</label><InputMonetario style={inp} value={fPremiacao.valor} onChange={v => setFPremiacao(p => ({ ...p, valor: String(v) }))} /></div>
            <div><label style={lbl}>Data de pagamento</label><input style={inp} type="date" value={fPremiacao.data_pagamento} onChange={e => setFPremiacao(p => ({ ...p, data_pagamento: e.target.value }))} /></div>
          </div>
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 20 }}>
            <button style={btnR} onClick={() => setModalPremiacao(false)}>Cancelar</button>
            <button style={{ ...btnV, opacity: salvando || !fPremiacao.descricao || !fPremiacao.valor ? 0.5 : 1 }} disabled={salvando || !fPremiacao.descricao || !fPremiacao.valor} onClick={salvarPremiacao}>{salvando ? "Salvando…" : "Salvar"}</button>
          </div>
        </Modal>
      )}

      {/* Modal Concessão de Férias */}
      {modalGozo && (
        <Modal titulo={`Conceder Férias — Período ${modalGozo.periodo_inicio}`} onClose={() => setModalGozo(null)} width={500}>
          <div style={{ display: "grid", gap: 14 }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div><label style={lbl}>Início do gozo</label><input style={inp} type="date" value={fGozo.data_inicio_gozo} onChange={e => { const v = e.target.value; setFGozo(p => ({ ...p, data_inicio_gozo: v })); }} /></div>
              <div><label style={lbl}>Fim do gozo</label><input style={inp} type="date" value={fGozo.data_fim_gozo} onChange={e => setFGozo(p => ({ ...p, data_fim_gozo: e.target.value }))} /></div>
            </div>
            <div><label style={lbl}>Dias de gozo</label><InputNumerico style={inp} decimais={0} value={fGozo.dias_gozados} onChange={v => setFGozo(p => ({ ...p, dias_gozados: v }))} /></div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <input type="checkbox" id="abonoPec" checked={fGozo.abono_pecuniario} onChange={e => setFGozo(p => ({ ...p, abono_pecuniario: e.target.checked }))} />
              <label htmlFor="abonoPec" style={{ fontSize: 12, color: "#555" }}>Abono pecuniário (venda de 1/3 dos dias)</label>
            </div>
            {fGozo.abono_pecuniario && (
              <div><label style={lbl}>Dias de abono</label><InputNumerico style={inp} decimais={0} value={fGozo.dias_abono} onChange={v => setFGozo(p => ({ ...p, dias_abono: v }))} /></div>
            )}
          </div>
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 20 }}>
            <button style={btnR} onClick={() => setModalGozo(null)}>Cancelar</button>
            <button style={{ ...btnV, opacity: salvando ? 0.5 : 1 }} disabled={salvando} onClick={salvarGozo}>{salvando ? "Salvando…" : "Confirmar"}</button>
          </div>
        </Modal>
      )}

      {/* Modal Grupo */}
      {modalGrupo && (
        <Modal titulo={editGrupo ? "Editar Grupo" : "Novo Grupo de Usuários"} onClose={() => setModalGrupo(false)} width={700}>
          <div style={{ display: "grid", gap: 14 }}>
            <div><label style={lbl}>Nome do grupo *</label><input style={inp} value={fGrupo.nome} onChange={e => setFGrupo(p => ({ ...p, nome: e.target.value }))} /></div>
            <div><label style={lbl}>Descrição</label><input style={inp} value={fGrupo.descricao} onChange={e => setFGrupo(p => ({ ...p, descricao: e.target.value }))} /></div>
            <div>
              <label style={lbl}>Permissões por módulo</label>
              <div style={{ border: "0.5px solid #D4DCE8", borderRadius: 8, overflow: "hidden" }}>
                {MODULOS.map((m, mi) => (
                  <div key={m} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 12px", borderBottom: mi < MODULOS.length - 1 ? "0.5px solid #DEE5EE" : "none", background: mi % 2 === 0 ? "#fff" : "#F8FAFD" }}>
                    <span style={{ fontSize: 12, color: "#1a1a1a", textTransform: "capitalize" }}>{m}</span>
                    <select style={{ ...inp, width: "auto", padding: "4px 8px", fontSize: 12 }} value={fGrupo.permissoes[m] ?? "leitura"} onChange={e => setFGrupo(p => ({ ...p, permissoes: { ...p.permissoes, [m]: e.target.value } }))}>
                      <option value="nenhum">Sem acesso</option>
                      <option value="leitura">Somente leitura</option>
                      <option value="escrita">Leitura e escrita</option>
                      <option value="admin">Administrador</option>
                    </select>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 20 }}>
            <button style={btnR} onClick={() => setModalGrupo(false)}>Cancelar</button>
            <button style={{ ...btnV, opacity: salvando || !fGrupo.nome.trim() ? 0.5 : 1 }} disabled={salvando || !fGrupo.nome.trim()} onClick={salvarGrupo}>{salvando ? "Salvando…" : "Salvar"}</button>
          </div>
        </Modal>
      )}

      {/* Modal Usuário */}
      {modalUser && (
        <Modal titulo={editUser ? "Editar Usuário" : "Novo Usuário"} onClose={() => setModalUser(false)}>
          <div style={{ display: "grid", gap: 14 }}>
            <div><label style={lbl}>Nome *</label><input style={inp} value={fUser.nome} onChange={e => setFUser(p => ({ ...p, nome: e.target.value }))} /></div>
            <div><label style={lbl}>E-mail *</label><input style={inp} type="email" value={fUser.email} onChange={e => setFUser(p => ({ ...p, email: e.target.value }))} /></div>
            <div>
              <label style={lbl}>Grupo de acesso</label>
              <select style={inp} value={fUser.grupo_id} onChange={e => setFUser(p => ({ ...p, grupo_id: e.target.value }))}>
                <option value="">Sem grupo</option>
                {grupos.map(g => <option key={g.id} value={g.id}>{g.nome}</option>)}
              </select>
            </div>
            <div>
              <label style={lbl}>WhatsApp (assistente IA)</label>
              <input
                style={inp}
                type="tel"
                value={fUser.whatsapp}
                onChange={e => setFUser(p => ({ ...p, whatsapp: e.target.value.replace(/\D/g, "") }))}
                placeholder="5565999990000 (DDI+DDD+número)"
                maxLength={15}
              />
              <span style={{ fontSize: 11, color: "#888", marginTop: 3, display: "block" }}>
                Formato internacional sem espaços. Ex: 5565999990000
              </span>
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 20 }}>
            <button style={btnR} onClick={() => setModalUser(false)}>Cancelar</button>
            <button style={{ ...btnV, opacity: salvando || !fUser.nome.trim() || !fUser.email.trim() ? 0.5 : 1 }} disabled={salvando || !fUser.nome.trim() || !fUser.email.trim()} onClick={salvarUser}>{salvando ? "Salvando…" : "Salvar"}</button>
          </div>
        </Modal>
      )}
      {/* Modal Princípio Ativo */}
      {modalPA && (
        <Modal titulo={editPA ? "Editar Princípio Ativo" : "Novo Princípio Ativo"} onClose={() => setModalPA(false)} width={560}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14 }}>
            <div style={{ gridColumn: "1 / -1" }}>
              <label style={lbl}>Nome completo (com concentração) *</label>
              <input style={inp} placeholder="Ex: Glifosato 480 g/L" value={fPA.nome} onChange={e => setFPA(p => ({ ...p, nome: e.target.value }))} />
            </div>
            <div>
              <label style={lbl}>Categoria *</label>
              <select style={inp} value={fPA.categoria} onChange={e => setFPA(p => ({ ...p, categoria: e.target.value as PrincipioAtivo["categoria"] }))}>
                {(["herbicida","fungicida","inseticida","acaricida","fertilizante","inoculante","outro"] as PrincipioAtivo["categoria"][]).map(c => (
                  <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>
                ))}
              </select>
            </div>
            <div>
              <label style={lbl}>Unidade de estoque *</label>
              <select style={inp} value={fPA.unidade} onChange={e => setFPA(p => ({ ...p, unidade: e.target.value as PrincipioAtivo["unidade"] }))}>
                {(["L","kg","g","mL","un"] as PrincipioAtivo["unidade"][]).map(u => <option key={u} value={u}>{u}</option>)}
              </select>
            </div>
            <div style={{ gridColumn: "1 / -1" }}>
              <label style={lbl}>Observação</label>
              <input style={inp} placeholder="Ex: MAPA registro nº 12345" value={fPA.observacao} onChange={e => setFPA(p => ({ ...p, observacao: e.target.value }))} />
            </div>
          </div>
          <div style={{ background: "#F4F6FA", borderRadius: 8, padding: "10px 14px", marginTop: 14, fontSize: 12, color: "#555", lineHeight: 1.6 }}>
            <strong>Não cadastrar sementes aqui.</strong> Cada variedade de semente (TMG 3770, Brasmax Lança, etc.) é um produto distinto no estoque — use a aba Insumos.
          </div>
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 20 }}>
            <button style={btnR} onClick={() => setModalPA(false)}>Cancelar</button>
            <button style={{ ...btnV, opacity: !fPA.nome.trim() ? 0.5 : 1 }} disabled={!fPA.nome.trim()} onClick={async () => {
              setSalvandoPA(true);
              try {
                if (editPA) {
                  await atualizarPrincipioAtivo(editPA.id, { nome: fPA.nome, categoria: fPA.categoria, unidade: fPA.unidade, observacao: fPA.observacao });
                  setPrincipios(x => x.map(p => p.id === editPA.id ? { ...p, ...fPA } : p));
                } else {
                  const novo = await criarPrincipioAtivo({ nome: fPA.nome, categoria: fPA.categoria, unidade: fPA.unidade, observacao: fPA.observacao });
                  setPrincipios(x => [...x, novo]);
                }
                setModalPA(false);
              } catch(e: unknown) { alert((e as Error).message); }
              finally { setSalvandoPA(false); }
            }}>
              {salvandobotPA ? "Salvando…" : "Salvar"}
            </button>
          </div>
        </Modal>
      )}

      {/* Modal Novo Nome Comercial */}
      {modalNC && (
        <Modal titulo="Adicionar Nome Comercial" onClose={() => setModalNC(null)} width={480}>
          {(() => {
            const pa = principios.find(p => p.id === modalNC);
            return (
              <div>
                <div style={{ background: "#D5E8F5", borderRadius: 8, padding: "10px 14px", marginBottom: 16, fontSize: 12, color: "#0B2D50" }}>
                  Princípio ativo: <strong>{pa?.nome}</strong> ({pa?.categoria} · {pa?.unidade})
                </div>
                <label style={lbl}>Nome Comercial *</label>
                <input style={inp} placeholder="Ex: Eficaz, Roundup Transorb" value={fNC.nome_comercial} onChange={e => setFNC({ nome_comercial: e.target.value })} autoFocus />
                <div style={{ fontSize: 11, color: "#888", marginTop: 6 }}>
                  Digite exatamente como o agricultor costuma escrever. Pode adicionar um por vez. A busca é case-insensitive.
                </div>
                <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 20 }}>
                  <button style={btnR} onClick={() => { setModalNC(null); setFNC({ nome_comercial: "" }); }}>Fechar</button>
                  <button style={{ ...btnV, opacity: !fNC.nome_comercial.trim() ? 0.5 : 1 }} disabled={!fNC.nome_comercial.trim()} onClick={async () => {
                    if (!modalNC) return;
                    try {
                      const novo = await salvarNomeComercial({ nome_comercial: fNC.nome_comercial.trim(), principio_ativo_id: modalNC, confirmado: true });
                      setNomesComerciais(x => [...x.filter(n => n.id !== novo.id), novo]);
                      setFNC({ nome_comercial: "" });
                    } catch(e: unknown) { alert((e as Error).message); }
                  }}>
                    + Adicionar
                  </button>
                </div>
              </div>
            );
          })()}
        </Modal>
      )}

      {/* Modal Unidade de Medida */}
      {modalUM && (
        <Modal titulo={editUM ? `Editar: ${editUM.sigla}` : "Nova Unidade de Medida"} onClose={() => setModalUM(false)} width={540}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: 14, marginBottom: 14 }}>
            <div>
              <label style={lbl}>Sigla *</label>
              <input style={{ ...inp, fontFamily: "monospace", fontWeight: 700 }}
                placeholder="kg, L, sc, un…"
                value={fUM.sigla}
                onChange={e => setFUM(p => ({ ...p, sigla: e.target.value }))}
                disabled={!!editUM}
              />
              {editUM && <div style={{ fontSize: 10, color: "#888", marginTop: 3 }}>A sigla não pode ser alterada.</div>}
            </div>
            <div>
              <label style={lbl}>Nome completo *</label>
              <input style={inp} placeholder="Ex: Quilograma, Litro, Saca (60 kg)"
                value={fUM.nome}
                onChange={e => setFUM(p => ({ ...p, nome: e.target.value }))} />
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14, marginBottom: 14 }}>
            <div>
              <label style={lbl}>Tipo *</label>
              <select style={inp} value={fUM.tipo} onChange={e => setFUM(p => ({ ...p, tipo: e.target.value as UnidadeMedida["tipo"] }))}>
                {(["massa","volume","area","comprimento","quantidade","outro"] as UnidadeMedida["tipo"][]).map(t => (
                  <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>
                ))}
              </select>
            </div>
            <div>
              <label style={lbl}>Fator de conversão</label>
              <InputNumerico style={inp} decimais={4} placeholder="Ex: 60"
                value={fUM.fator_base}
                onChange={v => setFUM(p => ({ ...p, fator_base: v }))} />
            </div>
            <div>
              <label style={lbl}>Para unidade base</label>
              <input style={{ ...inp, fontFamily: "monospace" }} placeholder="Ex: kg"
                value={fUM.base_sigla}
                onChange={e => setFUM(p => ({ ...p, base_sigla: e.target.value }))} />
            </div>
          </div>
          {fUM.fator_base && fUM.base_sigla && fUM.sigla && (
            <div style={{ background: "#D5E8F5", borderRadius: 8, padding: "8px 12px", marginBottom: 14, fontSize: 12, color: "#0B2D50" }}>
              1 {fUM.sigla || "?"} = {fUM.fator_base} {fUM.base_sigla}
            </div>
          )}
          <div style={{ marginBottom: 20 }}>
            <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 12 }}>
              <input type="checkbox" checked={fUM.inativo} onChange={e => setFUM(p => ({ ...p, inativo: e.target.checked }))} />
              Inativo (oculto nas listas de seleção)
            </label>
          </div>
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <button style={btnR} onClick={() => setModalUM(false)}>Cancelar</button>
            <button
              style={{ ...btnV, opacity: (!fUM.sigla.trim() || !fUM.nome.trim() || salvandoUM) ? 0.5 : 1 }}
              disabled={!fUM.sigla.trim() || !fUM.nome.trim() || salvandoUM}
              onClick={async () => {
                setSalvandoUM(true);
                try {
                  const payload = {
                    sigla: fUM.sigla.trim(),
                    nome: fUM.nome.trim(),
                    tipo: fUM.tipo,
                    fator_base: fUM.fator_base ? Number(fUM.fator_base) : null,
                    base_sigla: fUM.base_sigla.trim() || null,
                    inativo: fUM.inativo,
                  };
                  if (editUM) {
                    const { data, error } = await supabase.from("unidades_medida").update(payload).eq("id", editUM.id).select().single();
                    if (error) throw error;
                    setUnidades(x => x.map(u => u.id === editUM.id ? (data as UnidadeMedida) : u));
                  } else {
                    const { data, error } = await supabase.from("unidades_medida").insert(payload).select().single();
                    if (error) throw error;
                    setUnidades(x => [...x, data as UnidadeMedida].sort((a, b) => a.tipo.localeCompare(b.tipo) || a.sigla.localeCompare(b.sigla)));
                  }
                  setModalUM(false);
                } catch (e: unknown) { alert((e as Error).message); }
                finally { setSalvandoUM(false); }
              }}
            >
              {salvandoUM ? "Salvando…" : "Salvar"}
            </button>
          </div>
        </Modal>
      )}

    </div>
  );
}

export default function Cadastros() {
  return <Suspense><CadastrosInner /></Suspense>;
}
