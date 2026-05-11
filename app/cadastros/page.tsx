"use client";
import { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
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
  listarAnosSafra, criarAnoSafra, atualizarAnoSafra, excluirAnoSafra,
  listarCiclos, criarCiclo, atualizarCiclo, excluirCiclo,
  listarMaquinas, criarMaquina, atualizarMaquina, excluirMaquina,
  listarBombas, criarBomba, atualizarBomba, excluirBomba,
  listarFuncionarios, criarFuncionario, atualizarFuncionario, excluirFuncionario,
  listarGrupos, criarGrupo, atualizarGrupo, excluirGrupo,
  listarUsuarios, criarUsuario, atualizarUsuario, excluirUsuario,
  listarDepositos, criarDeposito, atualizarDeposito, excluirDeposito,
  listarGruposInsumo, criarGrupoInsumo, atualizarGrupoInsumo, excluirGrupoInsumo,
  listarSubgruposInsumo, criarSubgrupoInsumo, atualizarSubgrupoInsumo, excluirSubgrupoInsumo,
  seederGruposInsumo,
  listarTiposPessoa, criarTipoPessoa, atualizarTipoPessoa, excluirTipoPessoa,
  listarCentrosCustoGeral, criarCentroCusto, atualizarCentroCusto, excluirCentroCusto,
  listarCategoriasLancamento, criarCategoriaLancamento, atualizarCategoriaLancamento, excluirCategoriaLancamento,
  listarInsumos, criarInsumo, atualizarInsumo, excluirInsumo,
  listarFormasPagamento, criarFormaPagamento, atualizarFormaPagamento, excluirFormaPagamento,
  listarOperacoesGerenciais, criarOperacaoGerencial, atualizarOperacaoGerencial, excluirOperacaoGerencial,
  listarContas, criarConta, atualizarConta, excluirConta,
  listarPlanoContas,
} from "../../lib/db";
import { useAuth } from "../../components/AuthProvider";
import { supabase } from "../../lib/supabase";
import { planoContasPadrao, labelConta, type ContaContabil } from "../../lib/planoContas";
import { seedOperacoesGerenciais } from "../../lib/seedOperacoesGerenciais";
import type {
  Fazenda as FazendaDB, Talhao,
  Produtor, Empresa, MatriculaImovel, Pessoa,
  AnoSafra, Ciclo, CicloTalhao, Maquina, BombaCombustivel,
  Funcionario, GrupoUsuario, Usuario, Deposito,
  GrupoInsumo, SubgrupoInsumo, TipoPessoa, CentroCusto, CategoriaLancamento,
  Insumo, OperacaoGerencial, FormaPagamento, PadraoClassificacao, ContaBancaria,
} from "../../lib/supabase";

// ── Local types for inline editing ──────────────────────────
type ArrFaz = {
  _key: string;
  id?: string;
  proprietario_id: string;
  proprietario_nome: string;
  area_ha: string;
  forma_pagamento: "sc_soja" | "sc_milho" | "sc_soja_milho" | "brl";
  sc_ha: string;
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

type TabCad = "produtores" | "empresas" | "fazendas" | "funcionarios" | "pessoas" | "safras" | "insumos" | "depositos" | "maquinas" | "combustivel" | "grupos_insumo" | "centros_custo" | "formas_pagamento" | "operacoes_gerenciais" | "padroes_classificacao" | "contas_bancarias";

type TabGroup = { group: string; tabs: { key: TabCad; label: string }[] };

const TAB_GROUPS: TabGroup[] = [
  { group: "Cadastros Gerais", tabs: [
    { key: "produtores",   label: "Produtores"   },
    { key: "empresas",     label: "Empresas"     },
    { key: "fazendas",     label: "Fazendas"     },
    { key: "funcionarios", label: "Funcionários" },
    { key: "pessoas",      label: "Pessoas"      },
  ]},
  { group: "Cadastros Técnicos", tabs: [
    { key: "safras",                  label: "Safras"                    },
    { key: "insumos",                 label: "Insumos"                   },
    { key: "depositos",               label: "Depósitos & Armazéns"      },
    { key: "maquinas",                label: "Máquinas e Veículos"       },
    { key: "combustivel",             label: "Combustíveis & Bombas"     },
    { key: "grupos_insumo",           label: "Grupos de Insumos"         },
    { key: "padroes_classificacao",   label: "Padrões de Classificação"  },
  ]},
  { group: "Financeiro", tabs: [
    { key: "centros_custo",        label: "Centros de Custo"     },
    { key: "operacoes_gerenciais", label: "Operações Gerenciais" },
    { key: "formas_pagamento",     label: "Formas de Pagamento"  },
    { key: "contas_bancarias",     label: "Contas Bancárias"     },
  ]},
];

const ESTADOS = ["AC","AL","AP","AM","BA","CE","DF","ES","GO","MA","MT","MS","MG","PA","PB","PR","PE","PI","RJ","RN","RS","RO","RR","SC","SP","SE","TO"];
const SOLOS   = ["LVdf","LAd","LVd","NVef","CXbd","PVAd","RQo"];
const CULTURAS = ["Soja","Milho 1ª","Milho 2ª (Safrinha)","Algodão","Trigo","Sorgo","Feijão","Arroz"];
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
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
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
  const [fProd, setFProd]             = useState({ nome: "", tipo: "pf" as "pf"|"pj", incra: "", cpf_cnpj: "", inscricao_est: "", email: "", telefone: "", cep: "", logradouro: "", numero: "", complemento: "", bairro: "", municipio: "", estado: "MT" });
  const [buscandoCep, setBuscandoCep] = useState(false);

  // ── Fazendas ──
  const [fazendas, setFazendas]       = useState<FazendaDB[]>([]);
  const [talhoes, setTalhoes]         = useState<Record<string, Talhao[]>>({});
  const [matriculas, setMatriculas]   = useState<Record<string, MatriculaImovel[]>>({});
  const [expandFaz, setExpandFaz]     = useState<Set<string>>(new Set());
  const [modalFaz, setModalFaz]       = useState(false);
  const [editFaz, setEditFaz]         = useState<FazendaDB | null>(null);
  const [tabFaz, setTabFaz]           = useState<"geral"|"matriculas"|"certidoes"|"arrendamentos">("geral");
  const [buscandoCepFaz, setBuscandoCepFaz] = useState(false);
  const [fazArrendamentos, setFazArrendamentos] = useState<ArrFaz[]>([]);
  const [fazMatsLocal, setFazMatsLocal] = useState<FazMatLocal[]>([]);
  const [fFaz, setFFaz]               = useState({
    nome: "", municipio: "", estado: "MT", area: "", cnpj: "",
    car: "", car_vencimento: "", itr: "", itr_vencimento: "",
    ccir: "", ccir_vencimento: "", nirf: "",
    produtor_id: "", empresa_id: "",
    cep: "", logradouro: "", numero_end: "", complemento: "", bairro: "",
  });
  const [modalTalhao, setModalTalhao] = useState<string | null>(null); // fazenda_id
  const [editTalhao, setEditTalhao]   = useState<Talhao | null>(null);
  const [fTalhao, setFTalhao]         = useState({ nome: "", area: "", solo: "LVdf", lat: "", lng: "" });
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
  const [fCiclo, setFCiclo]           = useState({ descricao: "", cultura: "Soja", data_inicio: "", data_fim: "", produtividade_esperada_sc_ha: "", preco_esperado_sc: "" });
  // talhões vinculados ao ciclo: { talhao_id -> area_plantada_ha (string para input) }
  const [cicloTalhoes, setCicloTalhoes] = useState<Record<string, string>>({});
  // área já comprometida por OUTROS ciclos que se sobrepõem no tempo: { talhao_id -> ha }
  const [ocupadoEmOutrosCiclos, setOcupado] = useState<Record<string, number>>({});

  // ── Máquinas ──
  const [maquinas, setMaquinas]       = useState<Maquina[]>([]);
  const [modalMaq, setModalMaq]       = useState(false);
  const [editMaq, setEditMaq]         = useState<Maquina | null>(null);
  const [fMaq, setFMaq]               = useState({ nome: "", tipo: "trator" as Maquina["tipo"], marca: "", modelo: "", ano: "", patrimonio: "", chassi: "", horimetro_atual: "", seguro_seguradora: "", seguro_corretora: "", seguro_numero_apolice: "", seguro_data_contratacao: "", seguro_vencimento_apolice: "", seguro_premio: "" });
  const [tabMaq, setTabMaq]           = useState<"geral" | "seguro">("geral");

  // ── Bombas ──
  const [bombas, setBombas]           = useState<BombaCombustivel[]>([]);
  const [modalBomba, setModalBomba]   = useState(false);
  const [editBomba, setEditBomba]     = useState<BombaCombustivel | null>(null);
  const [fBomba, setFBomba]           = useState({ nome: "", combustivel: "diesel_s10" as BombaCombustivel["combustivel"], capacidade_l: "", estoque_atual_l: "0", consume_estoque: true });

  // ── Funcionários ──
  const [funcs, setFuncs]             = useState<Funcionario[]>([]);
  const [modalFunc, setModalFunc]     = useState(false);
  const [editFunc, setEditFunc]       = useState<Funcionario | null>(null);
  const [fFunc, setFFunc]             = useState({ nome: "", cpf: "", tipo: "clt" as Funcionario["tipo"], funcao: "", data_admissao: "" });

  // ── Depósitos ──
  const [depositos, setDepositos]     = useState<Deposito[]>([]);
  const [modalDep, setModalDep]       = useState(false);
  const [editDep, setEditDep]         = useState<Deposito | null>(null);
  const [fDep, setFDep]               = useState({ nome: "", tipo: "insumo_fazenda" as Deposito["tipo"], capacidade_sc: "" });

  // ── Contas Bancárias ──
  const [contas, setContas]           = useState<ContaBancaria[]>([]);
  const [modalConta, setModalConta]   = useState(false);
  const [editConta, setEditConta]     = useState<ContaBancaria | null>(null);
  const [fConta, setFConta]           = useState({ nome: "", banco: "", agencia: "", conta: "", moeda: "BRL" as "BRL"|"USD", ativa: true, empresa_id: "", tipo_conta: "corrente" as "corrente"|"investimento"|"caixa"|"transitoria", saldo_inicial: "" });

  // ── Insumos ──
  const [insumos, setInsumos]         = useState<Insumo[]>([]);
  const [filtroIns, setFiltroIns]     = useState("todos");
  const [buscaIns, setBuscaIns]       = useState("");
  const [modalIns, setModalIns]       = useState(false);
  const [editIns, setEditIns]         = useState<Insumo | null>(null);
  const [fIns, setFIns]               = useState({
    nome: "", categoria: "defensivo" as Insumo["categoria"],
    subgrupo: "", unidade: "L" as Insumo["unidade"],
    fabricante: "", estoque: "0", estoque_minimo: "0",
    valor_unitario: "0", lote: "", validade: "",
    deposito_id: "", bomba_id: "",
  });

  // ── Tabelas Auxiliares ──
  type SubAbaAux = "grupos_insumo" | "tipos_pessoa" | "centros_custo" | "categorias";
  const [subAbaAux, setSubAbaAux]             = useState<SubAbaAux>("grupos_insumo");
  const [gruposInsumo, setGruposInsumo]       = useState<GrupoInsumo[]>([]);
  const [subgruposInsumo, setSubgruposInsumo] = useState<SubgrupoInsumo[]>([]);
  const [seedingGrupos, setSeedingGrupos]     = useState(false);
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
  const [abaOpGer, setAbaOpGer]       = useState<"principal"|"estoque"|"fiscal"|"financeiro"|"contabilidade">("principal");
  const [erroOpGer, setErroOpGer]     = useState<string | null>(null);
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
  };
  const [fOG, setFOG] = useState({ ...OG_VAZIO });

  const [seedingOpGer, setSeedingOpGer] = useState(false);

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
      ? listarProdutoresDaConta(contaId).then(setProdutores).catch(e => setErro(e.message))
      : listarProdutores(fazendaId).then(setProdutores).catch(e => setErro(e.message));
    const carregarProdutoresSilencioso = () => contaId
      ? listarProdutoresDaConta(contaId).then(setProdutores).catch(() => {})
      : listarProdutores(fazendaId).then(setProdutores).catch(() => {});

    if (aba === "produtores")  carregarProdutores();
    if (aba === "empresas") {
      listarEmpresas(fazendaId).then(setEmpresas).catch(e => setErro(e.message));
      carregarProdutoresSilencioso();
    }
    if (aba === "fazendas") {
      if (userRole === "raccotlo" && fazendaId) {
        // Raccotlo admin: busca todas as fazendas da conta do cliente ativo
        supabase.from("fazendas").select("conta_id").eq("id", fazendaId).single()
          .then(({ data: af }) => {
            const q = af?.conta_id
              ? supabase.from("fazendas").select("*").eq("conta_id", af.conta_id).order("nome")
              : supabase.from("fazendas").select("*").eq("id", fazendaId);
            q.then(({ data, error }) => {
              if (error) setErro(error.message);
              else setFazendas(data ?? []);
            });
          });
      } else {
        listarFazendas().then(setFazendas).catch(e => setErro(e.message));
      }
      carregarProdutoresSilencioso();
      listarEmpresas(fazendaId).then(setEmpresas).catch(() => {});
      listarPessoas(fazendaId).then(setPessoas).catch(() => {});
    }
    if (aba === "pessoas")     listarPessoas(fazendaId).then(setPessoas).catch(e => setErro(e.message));
    if (aba === "safras")      listarAnosSafra(fazendaId).then(setAnosSafra).catch(e => setErro(e.message));
    if (aba === "maquinas")    listarMaquinas(fazendaId).then(setMaquinas).catch(e => setErro(e.message));
    if (aba === "combustivel") listarBombas(fazendaId).then(setBombas).catch(e => setErro(e.message));
    if (aba === "insumos") {
      listarInsumos(fazendaId).then(setInsumos).catch(e => setErro(e.message));
      listarGruposInsumo(fazendaId).then(setGruposInsumo).catch(() => {});
      listarSubgruposInsumo(fazendaId).then(setSubgruposInsumo).catch(() => {});
      listarDepositos(fazendaId).then(setDepositos).catch(() => {});
      listarBombas(fazendaId).then(setBombas).catch(() => {});
    }
    if (aba === "depositos")       listarDepositos(fazendaId).then(setDepositos).catch(e => setErro(e.message));
    if (aba === "contas_bancarias") {
      listarContas(fazendaId).then(setContas).catch(e => setErro(e.message));
      if (produtores.length === 0) carregarProdutoresSilencioso();
    }
    if (aba === "funcionarios") listarFuncionarios(fazendaId).then(setFuncs).catch(e => setErro(e.message));
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
  const abrirModalProd = (p?: Produtor) => {
    setEditProd(p ?? null);
    setFProd(p ? {
      nome: p.nome, tipo: p.tipo, incra: p.incra ?? "", cpf_cnpj: p.cpf_cnpj ?? "",
      inscricao_est: p.inscricao_est ?? "", email: p.email ?? "", telefone: p.telefone ?? "",
      cep: p.cep ?? "", logradouro: p.logradouro ?? "", numero: p.numero ?? "",
      complemento: p.complemento ?? "", bairro: p.bairro ?? "",
      municipio: p.municipio ?? "", estado: p.estado ?? "MT",
    } : {
      nome: "", tipo: "pf", incra: "", cpf_cnpj: "", inscricao_est: "", email: "", telefone: "",
      cep: "", logradouro: "", numero: "", complemento: "", bairro: "", municipio: "", estado: "MT",
    });
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
    const pp: Omit<Produtor, "id" | "created_at"> = {
      fazenda_id: fazendaId!,
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
    if (editProd) { await atualizarProdutor(editProd.id, pp); setProdutores(p => p.map(x => x.id === editProd.id ? { ...x, ...pp } : x)); }
    else { const n = await criarProdutor(pp); setProdutores(p => [...p, n]); }
    setModalProd(false);
  });

  // ─────────────── FAZENDAS ───────────────
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
      }
    } catch { /* silencioso */ }
    finally { setBuscandoCepFaz(false); }
  };

  const _fFazVazio = () => ({
    nome: "", municipio: "", estado: "MT", area: "", cnpj: "",
    car: "", car_vencimento: "", itr: "", itr_vencimento: "",
    ccir: "", ccir_vencimento: "", nirf: "",
    produtor_id: "", empresa_id: "",
    cep: "", logradouro: "", numero_end: "", complemento: "", bairro: "",
  });

  const abrirModalFaz = async (f?: FazendaDB) => {
    setEditFaz(f ?? null);
    setTabFaz("geral");
    setFFaz(f ? {
      nome: f.nome, municipio: f.municipio, estado: f.estado,
      area: String(f.area_total_ha), cnpj: f.cnpj ?? "",
      car: f.car ?? "", car_vencimento: f.car_vencimento ?? "",
      itr: f.itr ?? "", itr_vencimento: f.itr_vencimento ?? "",
      ccir: f.ccir ?? "", ccir_vencimento: f.ccir_vencimento ?? "",
      nirf: f.nirf ?? "",
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
    } else {
      setFazMatsLocal([]);
      setFazArrendamentos([]);
    }
    setModalFaz(true);
  };

  const salvarFaz = () => salvar(async () => {
    if (!fFaz.nome.trim() || !fFaz.area) return;
    const { data: { user } } = await supabase.auth.getUser();

    // Determinar owner_user_id e conta_id para a nova fazenda
    let ownerUserId = user?.id;
    let contaIdParaFaz: string | undefined = contaId ?? undefined;

    if (userRole === "raccotlo" && fazendaId) {
      // Raccotlo admin: usar o cliente da fazenda ativa como dono
      const { data: clientPerfil } = await supabase
        .from("perfis").select("user_id, conta_id")
        .eq("fazenda_id", fazendaId)
        .neq("role", "raccotlo")
        .limit(1).maybeSingle();
      if (clientPerfil?.user_id) ownerUserId = clientPerfil.user_id;
      if (clientPerfil?.conta_id) contaIdParaFaz = clientPerfil.conta_id;
      // Fallback: buscar conta_id da fazenda ativa
      if (!contaIdParaFaz) {
        const { data: af } = await supabase.from("fazendas").select("conta_id").eq("id", fazendaId).single();
        if (af?.conta_id) contaIdParaFaz = af.conta_id;
      }
    }

    const payload: Omit<FazendaDB, "id" | "created_at"> = {
      nome: fFaz.nome.trim(), municipio: fFaz.municipio.trim(), estado: fFaz.estado,
      area_total_ha: Number(fFaz.area), cnpj: fFaz.cnpj || undefined,
      car: fFaz.car || undefined, car_vencimento: fFaz.car_vencimento || undefined,
      itr: fFaz.itr || undefined, itr_vencimento: fFaz.itr_vencimento || undefined,
      ccir: fFaz.ccir || undefined, ccir_vencimento: fFaz.ccir_vencimento || undefined,
      nirf: fFaz.nirf || undefined,
      produtor_id: fFaz.produtor_id || undefined, empresa_id: fFaz.empresa_id || undefined,
      cep: fFaz.cep || undefined, logradouro: fFaz.logradouro || undefined,
      numero_end: fFaz.numero_end || undefined, complemento: fFaz.complemento || undefined,
      bairro: fFaz.bairro || undefined,
      owner_user_id: ownerUserId,
      conta_id: contaIdParaFaz,
    };
    let fazId: string;
    if (editFaz) {
      await atualizarFazenda(editFaz.id, payload);
      setFazendas(p => p.map(x => x.id === editFaz.id ? { ...x, ...payload } : x));
      fazId = editFaz.id;
    } else {
      const n = await criarFazenda(payload);
      setFazendas(p => [...p, n]);
      fazId = n.id;
      // Bootstrap: se ainda não há fazendaId no contexto, criar conta e vincular perfil
      if (!fazendaId) {
        if (user) {
          // Criar conta para o novo usuário se ainda não existir
          let novaContaId = contaId;
          if (!novaContaId) {
            const { data: perfAtual } = await supabase.from("perfis").select("conta_id, nome").eq("user_id", user.id).maybeSingle();
            novaContaId = (perfAtual as { conta_id?: string } | null)?.conta_id ?? null;
            if (!novaContaId) {
              const nc = await criarContaTenant({ nome: (perfAtual as { nome?: string } | null)?.nome || user.email || "Minha Conta", tipo: "pf" });
              novaContaId = nc.id;
              // Vincular conta_id à fazenda recém-criada
              await supabase.from("fazendas").update({ conta_id: novaContaId }).eq("id", fazId);
            }
          }
          await supabase.from("perfis").upsert(
            { user_id: user.id, fazenda_id: fazId, conta_id: novaContaId, nome: user.email },
            { onConflict: "user_id" }
          );
          alert("Fazenda criada com sucesso! Recarregue a página (Cmd+R) para ativar o sistema.");
        }
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
    setModalFaz(false);
  });

  const abrirModalTalhao = (fid: string, t?: Talhao) => {
    setModalTalhao(fid); setEditTalhao(t ?? null);
    setFTalhao(t ? { nome: t.nome, area: String(t.area_ha), solo: t.tipo_solo ?? "LVdf", lat: String(t.lat ?? ""), lng: String(t.lng ?? "") } : { nome: "", area: "", solo: "LVdf", lat: "", lng: "" });
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
    const payload = { fazenda_id: modalTalhao, nome: fTalhao.nome.trim(), area_ha: novaArea, tipo_solo: fTalhao.solo || undefined, lat: fTalhao.lat ? Number(fTalhao.lat) : undefined, lng: fTalhao.lng ? Number(fTalhao.lng) : undefined };
    if (editTalhao) {
      await atualizarTalhao(editTalhao.id, payload);
      setTalhoes(prev => ({ ...prev, [modalTalhao]: (prev[modalTalhao] ?? []).map(x => x.id === editTalhao.id ? { ...x, ...payload } : x) }));
    } else {
      const n = await criarTalhao(payload);
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
      fazenda_id: fazendaId!, nome: fEmp.nome.trim(),
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
      const n = await criarPessoa({ ...pesPayload, fazenda_id: fazendaId! });
      setPessoas(p => [...p, n]);
      // Cria depósito de terceiro vinculado automaticamente
      if (criar_deposito_terceiro && fPes.cliente) {
        const endereco = [fPes.logradouro, fPes.numero, fPes.bairro, fPes.municipio, fPes.estado]
          .filter(Boolean).join(", ");
        const dep = await criarDeposito({
          fazenda_id: fazendaId!,
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
  const abrirModalAno = (a?: AnoSafra) => {
    setEditAno(a ?? null);
    setFAno(a ? { descricao: a.descricao, data_inicio: a.data_inicio, data_fim: a.data_fim } : { descricao: "", data_inicio: "", data_fim: "" });
    setModalAno(true);
  };
  const salvarAno = () => salvar(async () => {
    if (!fAno.descricao.trim() || !fAno.data_inicio || !fAno.data_fim) return;
    if (editAno) { await atualizarAnoSafra(editAno.id, fAno); setAnosSafra(p => p.map(x => x.id === editAno.id ? { ...x, ...fAno } : x)); }
    else { const n = await criarAnoSafra({ ...fAno, fazenda_id: fazendaId! }); setAnosSafra(p => [...p, n]); }
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
    const inicio = c?.data_inicio ?? "";
    const fim    = c?.data_fim    ?? "";
    setFCiclo(c ? {
      descricao: c.descricao, cultura: c.cultura,
      data_inicio: inicio, data_fim: fim,
      produtividade_esperada_sc_ha: c.produtividade_esperada_sc_ha != null ? String(c.produtividade_esperada_sc_ha) : "",
      preco_esperado_sc: c.preco_esperado_sc != null ? String(c.preco_esperado_sc) : "",
    } : { descricao: "", cultura: "Soja", data_inicio: "", data_fim: "", produtividade_esperada_sc_ha: "", preco_esperado_sc: "" });
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
    };
    let cicloId: string;
    if (editCiclo) {
      await atualizarCiclo(editCiclo.id, payload);
      setCiclos(p => p.map(x => x.id === editCiclo.id ? { ...x, ...payload } : x));
      cicloId = editCiclo.id;
    } else {
      const n = await criarCiclo({ ...payload, ano_safra_id: anoSel, fazenda_id: fazendaId! });
      setCiclos(p => [...p, n]);
      cicloId = n.id;
    }
    // salva talhões vinculados
    await supabase.from("ciclo_talhoes").delete().eq("ciclo_id", cicloId);
    const rows = Object.entries(cicloTalhoes)
      .filter(([, area]) => parseFloat(area) > 0)
      .map(([talhao_id, area]) => ({ ciclo_id: cicloId, talhao_id, area_plantada_ha: parseFloat(area), fazenda_id: fazendaId! }));
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
      seguro_seguradora: m.seguro_seguradora ?? "", seguro_corretora: m.seguro_corretora ?? "",
      seguro_numero_apolice: m.seguro_numero_apolice ?? "",
      seguro_data_contratacao: m.seguro_data_contratacao ?? "",
      seguro_vencimento_apolice: m.seguro_vencimento_apolice ?? "",
      seguro_premio: String(m.seguro_premio ?? ""),
    } : { nome: "", tipo: "trator", marca: "", modelo: "", ano: "", patrimonio: "", chassi: "", horimetro_atual: "", seguro_seguradora: "", seguro_corretora: "", seguro_numero_apolice: "", seguro_data_contratacao: "", seguro_vencimento_apolice: "", seguro_premio: "" });
    setModalMaq(true);
  };
  const salvarMaq = () => salvar(async () => {
    if (!fMaq.nome.trim()) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const payload: any = {
      fazenda_id: fazendaId!, nome: fMaq.nome.trim(), tipo: fMaq.tipo,
      marca: fMaq.marca || undefined, modelo: fMaq.modelo || undefined,
      ano: fMaq.ano ? Number(fMaq.ano) : undefined, patrimonio: fMaq.patrimonio || undefined,
      chassi: fMaq.chassi || undefined,
      horimetro_atual: fMaq.horimetro_atual ? Number(fMaq.horimetro_atual) : undefined,
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
    const payload = { fazenda_id: fazendaId!, nome: fBomba.nome.trim(), combustivel: fBomba.combustivel, capacidade_l: fBomba.capacidade_l ? Number(fBomba.capacidade_l) : undefined, estoque_atual_l: Number(fBomba.estoque_atual_l) || 0, consume_estoque: fBomba.consume_estoque, ativa: true };
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
    const payload = { fazenda_id: fazendaId!, nome: fDep.nome.trim(), tipo: fDep.tipo, capacidade_sc: fDep.capacidade_sc ? Number(fDep.capacidade_sc) : undefined, ativo: true };
    if (editDep) { await atualizarDeposito(editDep.id, payload); setDepositos(p => p.map(x => x.id === editDep.id ? { ...x, ...payload } : x)); }
    else { const n = await criarDeposito(payload); setDepositos(p => [...p, n]); }
    setModalDep(false);
  });

  // ─────────────── FUNCIONÁRIOS ───────────────
  const abrirModalFunc = (f?: Funcionario) => {
    setEditFunc(f ?? null);
    setFFunc(f ? { nome: f.nome, cpf: f.cpf ?? "", tipo: f.tipo, funcao: f.funcao ?? "", data_admissao: f.data_admissao ?? "" } : { nome: "", cpf: "", tipo: "clt", funcao: "", data_admissao: "" });
    setModalFunc(true);
  };
  const salvarFunc = () => salvar(async () => {
    if (!fFunc.nome.trim()) return;
    const payload = { fazenda_id: fazendaId!, nome: fFunc.nome.trim(), cpf: fFunc.cpf || undefined, tipo: fFunc.tipo, funcao: fFunc.funcao || undefined, data_admissao: fFunc.data_admissao || undefined, ativo: true };
    if (editFunc) { await atualizarFuncionario(editFunc.id, payload); setFuncs(p => p.map(x => x.id === editFunc.id ? { ...x, ...payload } : x)); }
    else { const n = await criarFuncionario(payload); setFuncs(p => [...p, n]); }
    setModalFunc(false);
  });

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
          {aba === "empresas" && (
            <div style={{ background: "#fff", border: "0.5px solid #D4DCE8", borderRadius: 12, overflow: "hidden" }}>
              <div style={{ padding: "14px 18px", borderBottom: "0.5px solid #DEE5EE", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <div style={{ color: "#1a1a1a", fontWeight: 600, fontSize: 14 }}>Empresas <span style={{ fontSize: 11, color: "#444", fontWeight: 400 }}>({empresas.length})</span></div>
                  <div style={{ fontSize: 11, color: "#555", marginTop: 2 }}>Entidades jurídicas vinculadas a um Produtor. Uma Fazenda pode pertencer à Empresa ou diretamente ao Produtor (PF).</div>
                </div>
                <button style={btnV} onClick={() => abrirModalEmp()}>+ Nova Empresa</button>
              </div>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <TH cols={["Empresa / Razão Social", "Tipo / Regime", "CNPJ / CPF", "Produtor", "Registros rurais", "Município", ""]} />
                <tbody>
                  {empresas.length === 0 && <tr><td colSpan={7} style={{ padding: 32, textAlign: "center", color: "#444" }}>Nenhuma empresa cadastrada</td></tr>}
                  {empresas.map((e, i) => {
                    const prod = produtores.find(p => p.id === e.produtor_id);
                    return (
                      <tr key={e.id} style={{ borderBottom: i < empresas.length - 1 ? "0.5px solid #DEE5EE" : "none" }}>
                        <td style={{ padding: "10px 14px", color: "#1a1a1a", fontWeight: 600 }}>
                          {e.nome}
                          {e.razao_social && e.razao_social !== e.nome && <div style={{ fontSize: 11, color: "#555", fontWeight: 400 }}>{e.razao_social}</div>}
                        </td>
                        <td style={{ padding: "10px 14px", textAlign: "center" }}>
                          {badge(e.tipo.toUpperCase(), e.tipo === "pj" ? "#E6F1FB" : "#FBF0D8", e.tipo === "pj" ? "#0C447C" : "#7A5A12")}
                          {e.regime_tributario && <div style={{ fontSize: 10, color: "#555", marginTop: 3 }}>{e.regime_tributario}</div>}
                        </td>
                        <td style={{ padding: "10px 14px", textAlign: "center", color: "#1a1a1a" }}>{e.cpf_cnpj || "—"}</td>
                        <td style={{ padding: "10px 14px", textAlign: "center", color: "#1a1a1a" }}>{prod ? prod.nome : "—"}</td>
                        <td style={{ padding: "10px 14px", textAlign: "center" }}>
                          <div style={{ display: "flex", gap: 3, justifyContent: "center", flexWrap: "wrap" }}>
                            {e.car  && badge("CAR",  "#EAF3DE", "#1A5C38")}
                            {e.nirf && badge("NIRF", "#D5E8F5", "#0B2D50")}
                            {e.itr  && badge("ITR",  "#FBF3E0", "#7A5A12")}
                            {!e.car && !e.nirf && !e.itr && <span style={{ color: "#888", fontSize: 11 }}>—</span>}
                          </div>
                        </td>
                        <td style={{ padding: "10px 14px", textAlign: "center", color: "#1a1a1a" }}>{e.municipio ? `${e.municipio} · ${e.estado}` : "—"}</td>
                        <td style={{ padding: "10px 14px", textAlign: "right" }}>
                          <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                            <button style={btnE} onClick={() => abrirModalEmp(e)}>Editar</button>
                            <button style={btnX} onClick={() => { if (confirm("Excluir empresa?")) excluirEmpresa(e.id).then(() => setEmpresas(x => x.filter(r => r.id !== e.id))); }}>✕</button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* ══ FAZENDAS ══ */}
          {aba === "fazendas" && (
            <div>
              <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 12 }}>
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
                              {f.arrendamento_valor_brl_ha && <span>Valor: <strong>R$ {f.arrendamento_valor_brl_ha.toLocaleString("pt-BR")}/ha/ano</strong></span>}
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
                                <TH cols={["Talhão", "Área (ha)", "Solo", "Latitude", "Longitude", ""]} />
                                <tbody>
                                  {tals.map((t, ti) => (
                                    <tr key={t.id} style={{ borderBottom: ti < tals.length - 1 ? "0.5px solid #DEE5EE" : "none" }}>
                                      <td style={{ padding: "8px 14px", color: "#1a1a1a", fontWeight: 600 }}>{t.nome}</td>
                                      <td style={{ padding: "8px 14px", textAlign: "center" }}>{(t.area_ha ?? 0).toLocaleString("pt-BR")}</td>
                                      <td style={{ padding: "8px 14px", textAlign: "center" }}><span style={{ fontSize: 11, background: "#F1EFE8", color: "#555", padding: "2px 7px", borderRadius: 5 }}>{t.tipo_solo || "—"}</span></td>
                                      <td style={{ padding: "8px 14px", textAlign: "center", color: "#1a1a1a", fontSize: 12 }}>{t.lat ?? "—"}</td>
                                      <td style={{ padding: "8px 14px", textAlign: "center", color: "#1a1a1a", fontSize: 12 }}>{t.lng ?? "—"}</td>
                                      <td style={{ padding: "8px 14px", textAlign: "right" }}>
                                        <div style={{ display: "flex", gap: 5, justifyContent: "flex-end" }}>
                                          <button style={btnE} onClick={() => abrirModalTalhao(f.id, t)}>Editar</button>
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
                  <button style={{ ...btnV, padding: "6px 12px", fontSize: 12 }} onClick={() => abrirModalAno()}>+ Novo</button>
                </div>
                {anosSafra.length === 0 && <div style={{ padding: 24, textAlign: "center", color: "#444", fontSize: 12 }}>Nenhum ano safra cadastrado</div>}
                {anosSafra.map(a => (
                  <div key={a.id} onClick={() => selecionarAno(a.id)}
                    style={{ padding: "11px 16px", borderBottom: "0.5px solid #DEE5EE", cursor: "pointer", background: anoSel === a.id ? "#D5E8F5" : "transparent", borderLeft: anoSel === a.id ? "3px solid #1A4870" : "3px solid transparent" }}>
                    <div style={{ fontWeight: 600, fontSize: 13, color: anoSel === a.id ? "#0B2D50" : "#1a1a1a" }}>{a.descricao}</div>
                    <div style={{ fontSize: 11, color: "#555", marginTop: 2 }}>{a.data_inicio} → {a.data_fim}</div>
                    <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
                      <button style={btnE} onClick={e => { e.stopPropagation(); abrirModalAno(a); }}>Editar</button>
                      <button style={btnX} onClick={e => { e.stopPropagation(); if (confirm("Excluir ano safra?")) excluirAnoSafra(a.id).then(() => { setAnosSafra(x => x.filter(r => r.id !== a.id)); if (anoSel === a.id) { setAnoSel(null); setCiclos([]); } }); }}>✕</button>
                    </div>
                  </div>
                ))}
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
                  return (
                    <div key={c.id} style={{ padding: "11px 16px", borderBottom: ci < ciclos.length - 1 ? "0.5px solid #DEE5EE" : "none" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                        <div>
                          <div style={{ color: "#1a1a1a", fontWeight: 600, fontSize: 13 }}>{c.descricao}</div>
                          <div style={{ fontSize: 11, color: "#555", marginTop: 2 }}>{c.data_inicio} → {c.data_fim}</div>
                          <div style={{ marginTop: 4, display: "flex", gap: 6, flexWrap: "wrap" }}>
                            {badge(c.cultura, "#D5E8F5", "#0B2D50")}
                            {area != null && <span style={{ fontSize: 10, background: "#F0FDF7", color: "#14532D", borderRadius: 5, padding: "2px 7px", fontWeight: 600 }}>{area.toLocaleString("pt-BR", { maximumFractionDigits: 2 })} ha plantados</span>}
                            {prod != null && <span style={{ fontSize: 10, background: "#FBF3E0", color: "#7A5A12", borderRadius: 5, padding: "2px 7px", fontWeight: 600 }}>Prod. esp.: {prod.toLocaleString("pt-BR", { maximumFractionDigits: 2 })} sc/ha</span>}
                            {preco != null && <span style={{ fontSize: 10, background: "#FBF3E0", color: "#7A5A12", borderRadius: 5, padding: "2px 7px", fontWeight: 600 }}>Preço esp.: R${preco.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}/sc</span>}
                          </div>
                          {receitaEsp != null && (
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
          {aba === "maquinas" && (
            <div style={{ background: "#fff", border: "0.5px solid #D4DCE8", borderRadius: 12, overflow: "hidden" }}>
              <div style={{ padding: "14px 18px", borderBottom: "0.5px solid #DEE5EE", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div style={{ color: "#1a1a1a", fontWeight: 600, fontSize: 14 }}>Máquinas e Veículos <span style={{ fontSize: 11, color: "#444", fontWeight: 400 }}>({maquinas.length})</span></div>
                <button style={btnV} onClick={() => abrirModalMaq()}>+ Nova Máquina / Veículo</button>
              </div>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <TH cols={["Nome", "Tipo", "Marca / Modelo", "Chassi", "Ano", "Km / Horímetro", "Seguro", "Status", ""]} />
                <tbody>
                  {maquinas.length === 0 && <tr><td colSpan={9} style={{ padding: 32, textAlign: "center", color: "#444" }}>Nenhuma máquina ou veículo cadastrado</td></tr>}
                  {maquinas.map((m, i) => {
                    const vencSeguro = m.seguro_vencimento_apolice ? diasAteDate(m.seguro_vencimento_apolice) : null;
                    const corSeguro = vencSeguro === null ? "#888" : vencSeguro < 0 ? "#E24B4A" : vencSeguro <= 15 ? "#EF9F27" : "#16A34A";
                    return (
                      <tr key={m.id} style={{ borderBottom: i < maquinas.length - 1 ? "0.5px solid #DEE5EE" : "none" }}>
                        <td style={{ padding: "10px 14px", color: "#1a1a1a", fontWeight: 600 }}>{m.nome}</td>
                        <td style={{ padding: "10px 14px", textAlign: "center" }}>{badge(m.tipo === "carro" ? "Carro" : m.tipo, "#F1EFE8", "#555")}</td>
                        <td style={{ padding: "10px 14px", textAlign: "center", color: "#1a1a1a" }}>{[m.marca, m.modelo].filter(Boolean).join(" ") || "—"}</td>
                        <td style={{ padding: "10px 14px", textAlign: "center", color: "#666", fontSize: 12, fontFamily: "monospace" }}>{m.chassi || "—"}</td>
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
                        <td style={{ padding: "10px 14px", textAlign: "center" }}>{badge(m.ativa ? "Ativa" : "Inativa", m.ativa ? "#D5E8F5" : "#F1EFE8", m.ativa ? "#0B2D50" : "#555")}</td>
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
          )}

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
                        await seederGruposInsumo(fazendaId!);
                        const [gs, ss] = await Promise.all([listarGruposInsumo(fazendaId!), listarSubgruposInsumo(fazendaId!)]);
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
                        const { inseridos } = await seedOperacoesGerenciais(fazendaId!);
                        const lista = await listarOperacoesGerenciais(fazendaId!);
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
                  <button onClick={() => window.print()} className="no-print" style={{ fontSize: 13, padding: "8px 14px", border: "0.5px solid #DDE2EE", borderRadius: 8, background: "#F4F6FA", color: "#555", cursor: "pointer", fontWeight: 600 }}>
                    🖨 Imprimir
                  </button>
                  <button style={btnV} onClick={() => { setEditOpGer(null); setFOG({ ...OG_VAZIO }); setAbaOpGer("principal"); setModalOpGer(true); }}>+ Nova Operação</button>
                </div>
              </div>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <TH cols={["Código / Descrição", "Tipo", "Telas", "Ativo", ""]} />
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
                              });
                              setAbaOpGer("principal"); setModalOpGer(true);
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
              { key: "semente",         label: "Semente",         bg: "#D5E8F5", cl: "#0B2D50" },
              { key: "fertilizante",    label: "Fertilizante",    bg: "#E6F1FB", cl: "#0C447C" },
              { key: "defensivo",       label: "Defensivo",       bg: "#FAEEDA", cl: "#633806" },
              { key: "inoculante",      label: "Inoculante",      bg: "#FBF3E0", cl: "#8B5E14" },
              { key: "produto_agricola",label: "Prod. Agrícola",  bg: "#FEF3E2", cl: "#7A4300" },
              { key: "combustivel",     label: "Combustível",     bg: "#FCEBEB", cl: "#791F1F" },
              { key: "outros",          label: "Outros",          bg: "#F1EFE8", cl: "#666"    },
            ];
            const catMap = Object.fromEntries(CATS.map(c => [c.key, c]));

            const insFiltr = insumos.filter(i => {
              const matchCat  = filtroIns === "todos" || i.categoria === filtroIns;
              const matchBusca = !buscaIns || i.nome.toLowerCase().includes(buscaIns.toLowerCase()) || (i.fabricante ?? "").toLowerCase().includes(buscaIns.toLowerCase());
              return matchCat && matchBusca;
            });

            const totalValor = insFiltr.reduce((s, i) => s + (i.estoque * i.valor_unitario), 0);
            const abaixoMin  = insumos.filter(i => i.estoque < i.estoque_minimo).length;

            const abrirModalIns = (ins?: Insumo) => {
              setEditIns(ins ?? null);
              setFIns(ins ? {
                nome: ins.nome, categoria: ins.categoria, subgrupo: ins.subgrupo ?? "",
                unidade: ins.unidade, fabricante: ins.fabricante ?? "",
                estoque: String(ins.estoque), estoque_minimo: String(ins.estoque_minimo),
                valor_unitario: String(ins.valor_unitario), lote: ins.lote ?? "", validade: ins.validade ?? "",
                deposito_id: ins.deposito_id ?? "", bomba_id: ins.bomba_id ?? "",
              } : { nome: "", categoria: "defensivo", subgrupo: "", unidade: "L", fabricante: "", estoque: "0", estoque_minimo: "0", valor_unitario: "0", lote: "", validade: "", deposito_id: "", bomba_id: "" });
              setModalIns(true);
            };

            const salvarIns = async () => {
              setSalvando(true);
              try {
                const isComb = fIns.categoria === "combustivel";
                const payload: Omit<Insumo, "id" | "created_at"> = {
                  fazenda_id:     fazendaId!,
                  nome:           fIns.nome.trim(),
                  categoria:      fIns.categoria,
                  subgrupo:       fIns.subgrupo || undefined,
                  unidade:        isComb ? "L" : fIns.unidade,
                  fabricante:     isComb ? undefined : (fIns.fabricante || undefined),
                  estoque:        parseFloat(fIns.estoque) || 0,
                  estoque_minimo: parseFloat(fIns.estoque_minimo) || 0,
                  valor_unitario: parseFloat(fIns.valor_unitario) || 0,
                  lote:           isComb ? undefined : (fIns.lote || undefined),
                  validade:       isComb ? undefined : (fIns.validade || undefined),
                  deposito_id:    isComb ? undefined : (fIns.deposito_id || undefined),
                  bomba_id:       isComb ? (fIns.bomba_id || undefined) : undefined,
                  tipo:           (["peca","material","uso_consumo","escritorio"] as string[]).includes(fIns.categoria) ? "produto" as const : "insumo" as const,
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
                    { label: "Total de itens",      valor: insumos.length.toString(),       cor: "#1a1a1a" },
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
                      Todos ({insumos.length})
                    </button>
                    {CATS.map(c => {
                      const qtd = insumos.filter(i => i.categoria === c.key).length;
                      if (qtd === 0) return null;
                      return (
                        <button key={c.key} onClick={() => setFiltroIns(c.key)} style={{ padding: "5px 12px", borderRadius: 20, border: "0.5px solid", borderColor: filtroIns === c.key ? c.cl : "#D4DCE8", background: filtroIns === c.key ? c.bg : "transparent", color: filtroIns === c.key ? c.cl : "#666", fontSize: 12, cursor: "pointer", fontWeight: filtroIns === c.key ? 600 : 400 }}>
                          {c.label} ({qtd})
                        </button>
                      );
                    })}
                  </div>
                  <button style={btnV} onClick={() => abrirModalIns()}>+ Novo Insumo</button>
                </div>

                {/* Tabela */}
                <div style={{ background: "#fff", border: "0.5px solid #D4DCE8", borderRadius: 12, overflow: "hidden" }}>
                  {insFiltr.length === 0 ? (
                    <div style={{ padding: 40, textAlign: "center", color: "#444", fontSize: 13 }}>
                      {buscaIns ? `Nenhum insumo encontrado para "${buscaIns}"` : "Nenhum insumo cadastrado nesta categoria."}
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
                      {/* Nome */}
                      <div style={{ gridColumn: "1/-1" }}>
                        <label style={lbl}>Nome *</label>
                        <input style={inp} placeholder={isComb ? "Ex: Diesel S10, Gasolina" : "Ex: Roundup Original"} value={fIns.nome} onChange={e => setFIns(p => ({ ...p, nome: e.target.value }))} />
                      </div>
                      {/* Categoria */}
                      <div>
                        <label style={lbl}>Categoria *</label>
                        <select style={inp} value={fIns.categoria} onChange={e => {
                          const cat = e.target.value as Insumo["categoria"];
                          setFIns(p => ({ ...p, categoria: cat, subgrupo: "", unidade: cat === "combustivel" ? "L" : p.unidade }));
                        }}>
                          <option value="semente">Semente</option>
                          <option value="fertilizante">Fertilizante</option>
                          <option value="defensivo">Defensivo</option>
                          <option value="inoculante">Inoculante</option>
                          <option value="produto_agricola">Produto Agrícola</option>
                          <option value="combustivel">Combustível</option>
                          <option value="outros">Outros</option>
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
                      {/* Fabricante/Marca — apenas para não-combustível */}
                      {!isComb && (
                        <div>
                          <label style={lbl}>Fabricante / Marca</label>
                          <input style={inp} placeholder="Ex: Bayer, Syngenta" value={fIns.fabricante} onChange={e => setFIns(p => ({ ...p, fabricante: e.target.value }))} />
                        </div>
                      )}
                      {/* Unidade */}
                      <div>
                        <label style={lbl}>Unidade *</label>
                        {isComb ? (
                          <input style={{ ...inp, background: "#F4F6FA", color: "#555" }} value="L (litros)" readOnly />
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
                      {/* Estoque atual */}
                      <div>
                        <label style={lbl}>Estoque atual ({isComb ? "L" : fIns.unidade})</label>
                        <input style={inp} type="number" min="0" step="0.01" value={fIns.estoque} onChange={e => setFIns(p => ({ ...p, estoque: e.target.value }))} />
                      </div>
                      {/* Estoque mínimo */}
                      <div>
                        <label style={lbl}>Estoque mínimo (alerta)</label>
                        <input style={inp} type="number" min="0" step="0.01" value={fIns.estoque_minimo} onChange={e => setFIns(p => ({ ...p, estoque_minimo: e.target.value }))} />
                      </div>
                      {/* Valor unitário */}
                      <div>
                        <label style={lbl}>Valor unitário (R$/{isComb ? "L" : fIns.unidade})</label>
                        <input style={inp} type="number" min="0" step="0.01" value={fIns.valor_unitario} onChange={e => setFIns(p => ({ ...p, valor_unitario: e.target.value }))} />
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
                      <button style={{ ...btnV, opacity: salvando || !fIns.nome.trim() ? 0.5 : 1 }} disabled={salvando || !fIns.nome.trim()} onClick={salvarIns}>
                        {salvando ? "Salvando…" : "Salvar"}
                      </button>
                    </div>
                  </Modal>
                  );
                })()}
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
            <div style={{ background: "#fff", border: "0.5px solid #D4DCE8", borderRadius: 12, overflow: "hidden" }}>
              <div style={{ padding: "14px 18px", borderBottom: "0.5px solid #DEE5EE", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div style={{ color: "#1a1a1a", fontWeight: 600, fontSize: 14 }}>Funcionários <span style={{ fontSize: 11, color: "#444", fontWeight: 400 }}>({funcs.filter(f => f.ativo).length} ativos)</span></div>
                <button style={btnV} onClick={() => abrirModalFunc()}>+ Novo Funcionário</button>
              </div>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <TH cols={["Nome", "CPF", "Vínculo", "Função", "Admissão", "Status", ""]} />
                <tbody>
                  {funcs.length === 0 && <tr><td colSpan={7} style={{ padding: 32, textAlign: "center", color: "#444" }}>Nenhum funcionário cadastrado</td></tr>}
                  {funcs.map((f, i) => {
                    const corVinc: Record<string, [string,string]> = { clt: ["#D5E8F5","#0B2D50"], diarista: ["#FAEEDA","#633806"], empreiteiro: ["#E6F1FB","#0C447C"], outro: ["#F1EFE8","#555"] };
                    const [bg, cl] = corVinc[f.tipo] ?? ["#F1EFE8","#555"];
                    return (
                      <tr key={f.id} style={{ borderBottom: i < funcs.length - 1 ? "0.5px solid #DEE5EE" : "none" }}>
                        <td style={{ padding: "10px 14px", color: "#1a1a1a", fontWeight: 600 }}>{f.nome}</td>
                        <td style={{ padding: "10px 14px", textAlign: "center", color: "#1a1a1a" }}>{f.cpf || "—"}</td>
                        <td style={{ padding: "10px 14px", textAlign: "center" }}>{badge(f.tipo.toUpperCase(), bg, cl)}</td>
                        <td style={{ padding: "10px 14px", textAlign: "center", color: "#1a1a1a" }}>{f.funcao || "—"}</td>
                        <td style={{ padding: "10px 14px", textAlign: "center", color: "#1a1a1a" }}>{f.data_admissao || "—"}</td>
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
          )}

          {/* ══ PADRÕES DE CLASSIFICAÇÃO ══ */}
          {aba === "padroes_classificacao" && (() => {
            const COMMODITIES = ["Soja","Milho 1ª","Milho 2ª (Safrinha)","Algodão","Sorgo","Trigo"];
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
                  fazenda_id: fazendaId!,
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
                          { commodity: "Milho 1ª", nome_padrao: "IN MAPA 60/2011", ativo: true, umidade_padrao: 14.5, impureza_padrao: 1, avariados_padrao: 6, ardidos_max: 3, mofados_max: null, esverdeados_max: null, quebrados_max: null, ph_minimo: 74, carunchados_max: 3, kg_saca: 60 },
                          { commodity: "Milho 2ª (Safrinha)", nome_padrao: "IN MAPA 60/2011", ativo: true, umidade_padrao: 14.5, impureza_padrao: 1, avariados_padrao: 6, ardidos_max: 3, mofados_max: null, esverdeados_max: null, quebrados_max: null, ph_minimo: 74, carunchados_max: 3, kg_saca: 60 },
                        ].map(d => ({ ...d, fazenda_id: fazendaId! }));
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
                        <input style={inp} type="number" min="50" max="70" step="0.01" value={fPCls.kg_saca} onChange={e => setFPCls(p => ({ ...p, kg_saca: e.target.value }))} />
                      </div>
                    </div>

                    {/* Padrões base */}
                    <div style={{ fontSize: 11, fontWeight: 600, color: "#1A4870", marginBottom: 8, paddingBottom: 4, borderBottom: "0.5px solid #D4DCE8" }}>Parâmetros Base (acima do limite = desconto)</div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14, marginBottom: 18 }}>
                      <div>
                        <label style={lbl}>Umidade máx. (%)</label>
                        <input style={inp} type="number" step="0.01" placeholder={isMilho(fPCls.commodity) ? "14,5%" : "14%"} value={fPCls.umidade_padrao} onChange={e => setFPCls(p => ({ ...p, umidade_padrao: e.target.value }))} />
                      </div>
                      <div>
                        <label style={lbl}>Impureza máx. (%)</label>
                        <input style={inp} type="number" step="0.01" placeholder="1%" value={fPCls.impureza_padrao} onChange={e => setFPCls(p => ({ ...p, impureza_padrao: e.target.value }))} />
                      </div>
                      <div>
                        <label style={lbl}>Avariados totais máx. (%)</label>
                        <input style={inp} type="number" step="0.01" value={fPCls.avariados_padrao} onChange={e => setFPCls(p => ({ ...p, avariados_padrao: e.target.value }))} />
                      </div>
                    </div>

                    {/* Sub-parâmetros — Soja */}
                    {isSoja(fPCls.commodity) && <>
                      <div style={{ fontSize: 11, fontWeight: 600, color: "#1A4870", marginBottom: 8, paddingBottom: 4, borderBottom: "0.5px solid #D4DCE8" }}>Sub-parâmetros Soja (ABIOVE / IN MAPA 11/2007)</div>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 14, marginBottom: 18 }}>
                        <div>
                          <label style={lbl}>Ardidos máx. (%)</label>
                          <input style={inp} type="number" step="0.01" placeholder="8%" value={fPCls.ardidos_max} onChange={e => setFPCls(p => ({ ...p, ardidos_max: e.target.value }))} />
                        </div>
                        <div>
                          <label style={lbl}>Mofados máx. (%)</label>
                          <input style={inp} type="number" step="0.01" placeholder="Incluso nos ardidos" value={fPCls.mofados_max} onChange={e => setFPCls(p => ({ ...p, mofados_max: e.target.value }))} />
                        </div>
                        <div>
                          <label style={lbl}>Esverdeados máx. (%)</label>
                          <input style={inp} type="number" step="0.01" placeholder="8%" value={fPCls.esverdeados_max} onChange={e => setFPCls(p => ({ ...p, esverdeados_max: e.target.value }))} />
                        </div>
                        <div>
                          <label style={lbl}>Quebrados máx. (%)</label>
                          <input style={inp} type="number" step="0.01" placeholder="30%" value={fPCls.quebrados_max} onChange={e => setFPCls(p => ({ ...p, quebrados_max: e.target.value }))} />
                        </div>
                        <div>
                          <label style={lbl}>PH mínimo (kg/hl)</label>
                          <input style={inp} type="number" step="0.01" placeholder="78" value={fPCls.ph_minimo} onChange={e => setFPCls(p => ({ ...p, ph_minimo: e.target.value }))} />
                        </div>
                      </div>
                    </>}

                    {/* Sub-parâmetros — Milho */}
                    {isMilho(fPCls.commodity) && <>
                      <div style={{ fontSize: 11, fontWeight: 600, color: "#1A4870", marginBottom: 8, paddingBottom: 4, borderBottom: "0.5px solid #D4DCE8" }}>Sub-parâmetros Milho (IN MAPA 60/2011)</div>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 14, marginBottom: 18 }}>
                        <div>
                          <label style={lbl}>Ardidos+Brotados máx. (%)</label>
                          <input style={inp} type="number" step="0.01" placeholder="3%" value={fPCls.ardidos_max} onChange={e => setFPCls(p => ({ ...p, ardidos_max: e.target.value }))} />
                        </div>
                        <div>
                          <label style={lbl}>Carunchados máx. (%)</label>
                          <input style={inp} type="number" step="0.01" placeholder="3%" value={fPCls.carunchados_max} onChange={e => setFPCls(p => ({ ...p, carunchados_max: e.target.value }))} />
                        </div>
                        <div>
                          <label style={lbl}>PH mínimo (kg/hl)</label>
                          <input style={inp} type="number" step="0.01" placeholder="74" value={fPCls.ph_minimo} onChange={e => setFPCls(p => ({ ...p, ph_minimo: e.target.value }))} />
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
                <button style={btnV} onClick={() => { setEditConta(null); setFConta({ nome: "", banco: "", agencia: "", conta: "", moeda: "BRL", ativa: true, empresa_id: "", tipo_conta: "corrente", saldo_inicial: "" }); setModalConta(true); }}>+ Nova Conta</button>
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
                          <td style={{ padding: "10px 14px", color: "#555" }}>{c.banco ? `${c.banco}${c.agencia ? ` · ${c.agencia}` : ""}` : "—"}</td>
                          <td style={{ padding: "10px 14px", color: "#555" }}>{c.conta || "—"}</td>
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
                            <button style={btnX} onClick={() => { setEditConta(c); setFConta({ nome: c.nome, banco: c.banco ?? "", agencia: c.agencia ?? "", conta: c.conta ?? "", moeda: c.moeda, ativa: c.ativa, empresa_id: c.empresa_id ?? "", tipo_conta: (c.tipo_conta ?? "corrente") as "corrente"|"investimento"|"caixa"|"transitoria", saldo_inicial: String(c.saldo_inicial ?? "") }); setModalConta(true); }}>Editar</button>
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

        </div>
      </main>

      {/* ══════ MODAIS ══════ */}

      {/* Modal Conta Bancária */}
      {modalConta && (
        <Modal titulo={editConta ? "Editar Conta Bancária" : "Nova Conta Bancária"} onClose={() => setModalConta(false)} width={680}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14, marginBottom: 14 }}>
            <div style={{ gridColumn: "1 / -1" }}>
              <label style={lbl}>Nome / Apelido *</label>
              <input style={inp} placeholder="Ex: Bradesco PJ, Sicredi Rural" value={fConta.nome} onChange={e => setFConta(p => ({ ...p, nome: e.target.value }))} />
            </div>
            {empresas.length > 0 && (
              <div style={{ gridColumn: "1 / -1" }}>
                <label style={lbl}>Empresa vinculada</label>
                <select style={inp} value={fConta.empresa_id} onChange={e => setFConta(p => ({ ...p, empresa_id: e.target.value }))}>
                  <option value="">— Sem vínculo —</option>
                  {empresas.map(e => <option key={e.id} value={e.id}>{e.razao_social ?? e.nome ?? e.id}</option>)}
                </select>
              </div>
            )}
            <div>
              <label style={lbl}>Banco</label>
              <input style={inp} placeholder="Ex: Bradesco, Sicredi, BB" value={fConta.banco} onChange={e => setFConta(p => ({ ...p, banco: e.target.value }))} />
            </div>
            <div>
              <label style={lbl}>Agência</label>
              <input style={inp} placeholder="0000-0" value={fConta.agencia} onChange={e => setFConta(p => ({ ...p, agencia: e.target.value }))} />
            </div>
            <div>
              <label style={lbl}>Conta</label>
              <input style={inp} placeholder="00000-0" value={fConta.conta} onChange={e => setFConta(p => ({ ...p, conta: e.target.value }))} />
            </div>
            <div>
              <label style={lbl}>Tipo de Conta *</label>
              <select style={inp} value={fConta.tipo_conta} onChange={e => setFConta(p => ({ ...p, tipo_conta: e.target.value as "corrente"|"investimento"|"caixa"|"transitoria" }))}>
                <option value="corrente">Conta Corrente</option>
                <option value="investimento">Conta Investimento</option>
                <option value="caixa">Conta Caixa</option>
                <option value="transitoria">Conta Transitória</option>
              </select>
            </div>
            <div>
              <label style={lbl}>Saldo Inicial (R$)</label>
              <input style={inp} type="number" step="0.01" placeholder="0,00" value={fConta.saldo_inicial} onChange={e => setFConta(p => ({ ...p, saldo_inicial: e.target.value }))} />
            </div>
            <div>
              <label style={lbl}>Moeda</label>
              <select style={inp} value={fConta.moeda} onChange={e => setFConta(p => ({ ...p, moeda: e.target.value as "BRL"|"USD" }))}>
                <option value="BRL">BRL — Real</option>
                <option value="USD">USD — Dólar</option>
              </select>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, paddingTop: 18 }}>
              <input type="checkbox" id="contaAtiva" checked={fConta.ativa} onChange={e => setFConta(p => ({ ...p, ativa: e.target.checked }))} />
              <label htmlFor="contaAtiva" style={{ fontSize: 13, color: "#1a1a1a", cursor: "pointer" }}>Conta ativa</label>
            </div>
          </div>
          <div style={{ fontSize: 11, color: "#888", marginBottom: 12 }}>
            Contas do tipo <strong>Caixa</strong> e <strong>Transitória</strong> são excluídas automaticamente do Fluxo de Caixa.
          </div>
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 8 }}>
            <button style={btnR} onClick={() => setModalConta(false)}>Cancelar</button>
            <button style={{ ...btnV, opacity: salvando || !fConta.nome.trim() ? 0.5 : 1 }} disabled={salvando || !fConta.nome.trim()}
              onClick={async () => {
                if (!fazendaId) return;
                setSalvando(true);
                try {
                  const saldoIni = fConta.saldo_inicial !== "" ? parseFloat(fConta.saldo_inicial) : 0;
                  const payload = { fazenda_id: fazendaId, empresa_id: fConta.empresa_id || empresas[0]?.id || null, nome: fConta.nome.trim(), banco: fConta.banco || undefined, agencia: fConta.agencia || undefined, conta: fConta.conta || undefined, moeda: fConta.moeda, ativa: fConta.ativa, tipo_conta: fConta.tipo_conta, saldo_inicial: isNaN(saldoIni) ? 0 : saldoIni };
                  if (editConta) {
                    await atualizarConta(editConta.id, payload);
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
        <Modal titulo={editProd ? "Editar Produtor" : "Novo Produtor"} onClose={() => setModalProd(false)} width={920}>
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
            <div><label style={lbl}>Inscrição Estadual</label><input style={inp} value={fProd.inscricao_est} onChange={e => setFProd(p => ({ ...p, inscricao_est: e.target.value }))} /></div>
            <div><label style={lbl}>INCRA</label><input style={inp} value={fProd.incra} onChange={e => setFProd(p => ({ ...p, incra: e.target.value }))} placeholder="Nº certificado INCRA" /></div>
            <div><label style={lbl}>E-mail</label><input style={inp} type="email" value={fProd.email} onChange={e => setFProd(p => ({ ...p, email: e.target.value }))} /></div>
            <div><label style={lbl}>Telefone</label><input style={inp} value={fProd.telefone} onChange={e => setFProd(p => ({ ...p, telefone: e.target.value }))} /></div>
          </div>

          {/* Endereço */}
          <div style={{ fontSize: 11, fontWeight: 600, color: "#1A4870", marginBottom: 8, paddingBottom: 4, borderBottom: "0.5px solid #D4DCE8" }}>Endereço</div>
          <div style={{ display: "grid", gridTemplateColumns: "140px 1fr 1fr", gap: 14, marginBottom: 12 }}>
            {/* CEP — busca automática */}
            <div>
              <label style={lbl}>CEP</label>
              <div style={{ position: "relative" }}>
                <input style={{ ...inp, paddingRight: 32 }}
                  value={fProd.cep}
                  placeholder="00000-000"
                  maxLength={9}
                  onChange={e => {
                    const v = e.target.value.replace(/\D/g, "").slice(0, 8);
                    const masked = v.length > 5 ? `${v.slice(0,5)}-${v.slice(5)}` : v;
                    setFProd(p => ({ ...p, cep: masked }));
                    if (v.length === 8) buscarCepProd(v);
                  }}
                />
                {buscandoCep && (
                  <span style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", fontSize: 11, color: "#1A4870" }}>⟳</span>
                )}
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

          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 20 }}>
            <button style={btnR} onClick={() => setModalProd(false)}>Cancelar</button>
            <button style={{ ...btnV, opacity: salvando || !fProd.nome.trim() ? 0.5 : 1 }} disabled={salvando || !fProd.nome.trim()} onClick={salvarProd}>{salvando ? "Salvando…" : "Salvar"}</button>
          </div>
        </Modal>
      )}

      {/* Modal Empresa */}
      {modalEmp && (
        <Modal titulo={editEmp ? "Editar Empresa" : "Nova Empresa"} subtitulo="Entidade jurídica ou pessoa física empresária que opera as fazendas" onClose={() => setModalEmp(false)} width={920}>

          {/* ─ Dados cadastrais ─ */}
          <div style={{ fontSize: 11, fontWeight: 700, color: "#555", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10 }}>Dados cadastrais</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14, marginBottom: 20 }}>
            <div style={{ gridColumn: "1/3" }}><label style={lbl}>Nome Fantasia *</label><input style={inp} value={fEmp.nome} onChange={e => setFEmp(p => ({ ...p, nome: e.target.value }))} /></div>
            <div>
              <label style={lbl}>Tipo *</label>
              <select style={inp} value={fEmp.tipo} onChange={e => setFEmp(p => ({ ...p, tipo: e.target.value as "pf"|"pj", cpf_cnpj: "" }))}>
                <option value="pj">Pessoa Jurídica (CNPJ)</option>
                <option value="pf">Pessoa Física (CPF)</option>
              </select>
            </div>
            <div style={{ gridColumn: "1/3" }}><label style={lbl}>Razão Social</label><input style={inp} value={fEmp.razao_social} onChange={e => setFEmp(p => ({ ...p, razao_social: e.target.value }))} /></div>
            <div><label style={lbl}>{fEmp.tipo === "pf" ? "CPF" : "CNPJ"}</label><input style={inp} value={fEmp.cpf_cnpj} onChange={e => setFEmp(p => ({ ...p, cpf_cnpj: maskCpfCnpj(e.target.value, p.tipo) }))} placeholder={fEmp.tipo === "pf" ? "000.000.000-00" : "00.000.000/0001-00"} /></div>
            <div><label style={lbl}>Inscrição Estadual</label><input style={inp} value={fEmp.inscricao_est} onChange={e => setFEmp(p => ({ ...p, inscricao_est: e.target.value }))} /></div>
            <div>
              <label style={lbl}>Regime Tributário</label>
              <select style={inp} value={fEmp.regime_tributario} onChange={e => setFEmp(p => ({ ...p, regime_tributario: e.target.value }))}>
                <option value="">Selecione…</option>
                <option>Produtor Rural — Pessoa Física</option>
                <option>Produtor Rural — Pessoa Jurídica</option>
                <option>Simples Nacional</option>
                <option>Lucro Presumido</option>
                <option>Lucro Real</option>
                <option>MEI</option>
              </select>
            </div>
            <div><label style={lbl}>Município</label><input style={inp} value={fEmp.municipio} onChange={e => setFEmp(p => ({ ...p, municipio: e.target.value }))} /></div>
            <div><label style={lbl}>Estado</label><select style={inp} value={fEmp.estado} onChange={e => setFEmp(p => ({ ...p, estado: e.target.value }))}>{ESTADOS.map(s => <option key={s}>{s}</option>)}</select></div>
            <div style={{ gridColumn: "1/-1" }}>
              <label style={lbl}>Produtor / Sócio principal</label>
              <select style={inp} value={fEmp.produtor_id} onChange={e => setFEmp(p => ({ ...p, produtor_id: e.target.value }))}>
                <option value="">Não vinculado</option>
                {produtores.map(p => <option key={p.id} value={p.id}>{p.nome} ({p.tipo.toUpperCase()})</option>)}
              </select>
            </div>
          </div>

          {/* ─ Registros rurais ─ */}
          <div style={{ fontSize: 11, fontWeight: 700, color: "#555", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10, paddingTop: 16, borderTop: "0.5px solid #D4DCE8" }}>Registros rurais</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14, marginBottom: 20 }}>
            <div><label style={lbl}>NIRF</label><input style={inp} value={fEmp.nirf} onChange={e => setFEmp(p => ({ ...p, nirf: e.target.value }))} /></div>
            <div><label style={lbl}>ITR</label><input style={inp} value={fEmp.itr} onChange={e => setFEmp(p => ({ ...p, itr: e.target.value }))} /></div>
            <div />
            <div style={{ gridColumn: "1/-1" }}><label style={lbl}>CAR — Cadastro Ambiental Rural</label><input style={inp} value={fEmp.car} onChange={e => setFEmp(p => ({ ...p, car: e.target.value }))} placeholder="MT-XXXXXXXX-XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX" /></div>
          </div>

          {/* ─ Contato e notificações ─ */}
          <div style={{ fontSize: 11, fontWeight: 700, color: "#555", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10, paddingTop: 16, borderTop: "0.5px solid #D4DCE8" }}>Contato e notificações</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14 }}>
            <div><label style={lbl}>E-mail principal</label><input style={inp} type="email" value={fEmp.email} onChange={e => setFEmp(p => ({ ...p, email: e.target.value }))} /></div>
            <div><label style={lbl}>E-mail para relatórios automáticos</label><input style={inp} type="email" value={fEmp.email_relatorios} onChange={e => setFEmp(p => ({ ...p, email_relatorios: e.target.value }))} /></div>
            <div><label style={lbl}>Telefone</label><input style={inp} value={fEmp.telefone} onChange={e => setFEmp(p => ({ ...p, telefone: e.target.value }))} /></div>
          </div>

          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 24 }}>
            <button style={btnR} onClick={() => setModalEmp(false)}>Cancelar</button>
            <button style={{ ...btnV, opacity: salvando || !fEmp.nome.trim() ? 0.5 : 1 }} disabled={salvando || !fEmp.nome.trim()} onClick={salvarEmp}>{salvando ? "Salvando…" : "Salvar"}</button>
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
              {([["geral","Dados Gerais"],["matriculas",`Matrículas${fazMatsLocal.length > 0 ? ` (${fazMatsLocal.length})` : ""}`],["certidoes","Certidões"],["arrendamentos",`Arrendamentos${fazArrendamentos.length > 0 ? ` (${fazArrendamentos.length})` : ""}`]] as [string,string][]).map(([k, l]) => (
                <button key={k} onClick={() => setTabFaz(k as typeof tabFaz)} style={{ padding: "10px 18px", border: "none", borderBottom: tabFaz === k ? "2px solid #1A4870" : "2px solid transparent", background: "none", cursor: "pointer", fontSize: 13, color: tabFaz === k ? "#1A4870" : "#555", fontWeight: tabFaz === k ? 600 : 400 }}>{l}</button>
              ))}
            </div>

            {/* ════ TAB: DADOS GERAIS ════ */}
            {tabFaz === "geral" && (
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: "#1A4870", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 10 }}>Identificação</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14, marginBottom: 20 }}>
                  <div style={{ gridColumn: "1/-1" }}><label style={lbl}>Nome da fazenda *</label><input style={inp} value={fFaz.nome} onChange={e => setFFaz(p => ({ ...p, nome: e.target.value }))} /></div>
                  <div style={{ gridColumn: "1/3" }}>
                    <label style={lbl}>Produtor responsável <span style={{ color: "#888", fontWeight: 400 }}>(PF ou parceria)</span></label>
                    <select style={inp} value={fFaz.produtor_id} onChange={e => setFFaz(p => ({ ...p, produtor_id: e.target.value }))}>
                      <option value="">Nenhum (vínculo via empresa)</option>
                      {produtores.map(p => <option key={p.id} value={p.id}>{p.nome} ({p.tipo.toUpperCase()})</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={lbl}>Empresa responsável <span style={{ color: "#888", fontWeight: 400 }}>(PJ)</span></label>
                    <select style={inp} value={fFaz.empresa_id} onChange={e => setFFaz(p => ({ ...p, empresa_id: e.target.value }))}>
                      <option value="">Nenhuma</option>
                      {empresas.map(e => <option key={e.id} value={e.id}>{e.nome}</option>)}
                    </select>
                  </div>
                  <div><label style={lbl}>Área total (ha) *</label><input style={inp} type="number" step="0.01" value={fFaz.area} onChange={e => setFFaz(p => ({ ...p, area: e.target.value }))} /></div>
                  <div><label style={lbl}>CNPJ / CPF</label><input style={inp} value={fFaz.cnpj} onChange={e => setFFaz(p => ({ ...p, cnpj: e.target.value }))} /></div>
                  <div />
                </div>

                <div style={{ fontSize: 11, fontWeight: 700, color: "#1A4870", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 10, paddingTop: 4, borderTop: "0.5px solid #D4DCE8" }}>Endereço</div>
                <div style={{ display: "grid", gridTemplateColumns: "160px 1fr", gap: 14, marginBottom: 14 }}>
                  <div>
                    <label style={lbl}>CEP{buscandoCepFaz && <span style={{ marginLeft: 6, color: "#888", fontSize: 11 }}>⟳</span>}</label>
                    <input style={inp} value={fFaz.cep} placeholder="00000-000" onChange={e => { const v = maskCep(e.target.value); setFFaz(p => ({ ...p, cep: v })); if (v.replace(/\D/g,"").length === 8) buscarCepFaz(v); }} />
                  </div>
                  <div><label style={lbl}>Logradouro</label><input style={inp} value={fFaz.logradouro} onChange={e => setFFaz(p => ({ ...p, logradouro: e.target.value }))} /></div>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "80px 1fr 1fr 1fr 80px", gap: 14, marginBottom: 4 }}>
                  <div><label style={lbl}>Número</label><input style={inp} value={fFaz.numero_end} onChange={e => setFFaz(p => ({ ...p, numero_end: e.target.value }))} /></div>
                  <div><label style={lbl}>Complemento</label><input style={inp} value={fFaz.complemento} onChange={e => setFFaz(p => ({ ...p, complemento: e.target.value }))} /></div>
                  <div><label style={lbl}>Bairro</label><input style={inp} value={fFaz.bairro} onChange={e => setFFaz(p => ({ ...p, bairro: e.target.value }))} /></div>
                  <div><label style={lbl}>Município</label><input style={inp} value={fFaz.municipio} onChange={e => setFFaz(p => ({ ...p, municipio: e.target.value }))} /></div>
                  <div><label style={lbl}>UF</label><select style={inp} value={fFaz.estado} onChange={e => setFFaz(p => ({ ...p, estado: e.target.value }))}>{ESTADOS.map(s => <option key={s}>{s}</option>)}</select></div>
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
                        <td style={{ padding: "6px 10px", width: 100 }}><input style={{ ...inp, padding: "5px 8px", fontSize: 12 }} type="number" step="0.0001" value={m.area_ha} onChange={e => setFazMatsLocal(p => p.map((x,j) => j===i ? {...x,area_ha:e.target.value} : x))} placeholder="0,0000" /></td>
                        <td style={{ padding: "6px 10px" }}>
                          <select style={{ ...inp, padding: "5px 8px", fontSize: 12 }} value={m.produtor_id} onChange={e => setFazMatsLocal(p => p.map((x,j) => j===i ? {...x,produtor_id:e.target.value} : x))}>
                            <option value="">—</option>
                            {produtores.map(pr => <option key={pr.id} value={pr.id}>{pr.nome}</option>)}
                          </select>
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

            {/* ════ TAB: CERTIDÕES ════ */}
            {tabFaz === "certidoes" && (
              <div>
                <div style={{ fontSize: 12, color: "#555", marginBottom: 18 }}>Controle de documentos rurais com alertas de vencimento. O sistema alerta com 30, 15, 7 e 1 dia antes do vencimento.</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
                  {/* CAR */}
                  <div style={{ padding: 16, borderRadius: 10, border: "0.5px solid #D4DCE8", background: "#FAFBFC" }}>
                    <div style={{ display: "flex", alignItems: "center", marginBottom: 12 }}>
                      <span style={{ fontSize: 13, fontWeight: 700, color: "#1A4870" }}>CAR — Cadastro Ambiental Rural</span>
                      {certBadge(fFaz.car_vencimento)}
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 10 }}>
                      <div><label style={lbl}>Número</label><input style={inp} value={fFaz.car} onChange={e => setFFaz(p => ({ ...p, car: e.target.value }))} placeholder="MT-XXXXXXXX-XXXXXXXXXXXX" /></div>
                      <div><label style={lbl}>Vencimento</label><input style={inp} type="date" value={fFaz.car_vencimento} onChange={e => setFFaz(p => ({ ...p, car_vencimento: e.target.value }))} /></div>
                    </div>
                  </div>
                  {/* ITR */}
                  <div style={{ padding: 16, borderRadius: 10, border: "0.5px solid #D4DCE8", background: "#FAFBFC" }}>
                    <div style={{ display: "flex", alignItems: "center", marginBottom: 12 }}>
                      <span style={{ fontSize: 13, fontWeight: 700, color: "#1A4870" }}>ITR — Imposto Territorial Rural</span>
                      {certBadge(fFaz.itr_vencimento)}
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 10 }}>
                      <div><label style={lbl}>NIRF / Número</label><input style={inp} value={fFaz.itr} onChange={e => setFFaz(p => ({ ...p, itr: e.target.value }))} placeholder="Nº do lançamento ITR" /></div>
                      <div><label style={lbl}>Vencimento</label><input style={inp} type="date" value={fFaz.itr_vencimento} onChange={e => setFFaz(p => ({ ...p, itr_vencimento: e.target.value }))} /></div>
                    </div>
                  </div>
                  {/* CCIR */}
                  <div style={{ padding: 16, borderRadius: 10, border: "0.5px solid #D4DCE8", background: "#FAFBFC" }}>
                    <div style={{ display: "flex", alignItems: "center", marginBottom: 12 }}>
                      <span style={{ fontSize: 13, fontWeight: 700, color: "#1A4870" }}>CCIR — Certidão de Cadastro de Imóvel Rural</span>
                      {certBadge(fFaz.ccir_vencimento)}
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 10 }}>
                      <div><label style={lbl}>Número</label><input style={inp} value={fFaz.ccir} onChange={e => setFFaz(p => ({ ...p, ccir: e.target.value }))} placeholder="Nº do CCIR" /></div>
                      <div><label style={lbl}>Vencimento</label><input style={inp} type="date" value={fFaz.ccir_vencimento} onChange={e => setFFaz(p => ({ ...p, ccir_vencimento: e.target.value }))} /></div>
                    </div>
                  </div>
                  {/* NIRF */}
                  <div style={{ padding: 16, borderRadius: 10, border: "0.5px solid #D4DCE8", background: "#FAFBFC" }}>
                    <div style={{ display: "flex", alignItems: "center", marginBottom: 12 }}>
                      <span style={{ fontSize: 13, fontWeight: 700, color: "#1A4870" }}>NIRF — Número no Registro Federal</span>
                    </div>
                    <div><label style={lbl}>NIRF</label><input style={inp} value={fFaz.nirf} onChange={e => setFFaz(p => ({ ...p, nirf: e.target.value }))} placeholder="Nº do imóvel na Receita Federal" /></div>
                  </div>
                </div>
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
                    const label = { sc_soja: "Sacas de soja", sc_milho: "Sacas de milho", sc_soja_milho: "Sc soja + milho", brl: "Valor em R$" }[a.forma_pagamento];
                    const totalScs = ehSacas ? ((Number(a.area_ha)||0) * (Number(a.sc_ha)||0)).toFixed(1) : null;
                    const totalBrl = !ehSacas ? ((Number(a.area_ha)||0) * (Number(a.valor_brl)||0)).toFixed(2) : null;
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
                          {ehSacas && <span style={{ fontSize: 10, background: "#DCF5E8", color: "#14532D", padding: "2px 8px", borderRadius: 8, fontWeight: 600 }}>Gera contrato grãos</span>}
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
                              <input style={inp} type="number" step="0.01" value={a.area_ha} onChange={e => setFazArrendamentos(p => p.map((x,j) => j===ai ? {...x,area_ha:e.target.value} : x))} />
                            </div>
                            <div>
                              <label style={lbl}>Forma de pagamento</label>
                              <select style={inp} value={a.forma_pagamento} onChange={e => setFazArrendamentos(p => p.map((x,j) => j===ai ? {...x,forma_pagamento:e.target.value as ArrFaz["forma_pagamento"]} : x))}>
                                <option value="sc_soja">Sacas de soja / ha / ano</option>
                                <option value="sc_milho">Sacas de milho / ha / ano</option>
                                <option value="sc_soja_milho">Sc soja + milho (misto)</option>
                                <option value="brl">Valor em R$ / ha / ano</option>
                              </select>
                            </div>
                            {ehSacas && (
                              <div>
                                <label style={lbl}>Sacas / ha / ano</label>
                                <input style={inp} type="number" step="0.1" placeholder="ex: 12" value={a.sc_ha} onChange={e => setFazArrendamentos(p => p.map((x,j) => j===ai ? {...x,sc_ha:e.target.value} : x))} />
                                {totalScs && <div style={{ fontSize: 10, color: "#14532D", marginTop: 3 }}>Total: {totalScs} sc comprometidas</div>}
                              </div>
                            )}
                            {!ehSacas && (
                              <div>
                                <label style={lbl}>Valor R$ / ha / ano</label>
                                <input style={inp} type="number" step="0.01" value={a.valor_brl} onChange={e => setFazArrendamentos(p => p.map((x,j) => j===ai ? {...x,valor_brl:e.target.value} : x))} />
                                {totalBrl && <div style={{ fontSize: 10, color: "#C9921B", marginTop: 3 }}>Total: R$ {Number(totalBrl).toLocaleString("pt-BR",{minimumFractionDigits:2})}</div>}
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
                              <select style={inp} value={a.produtor_id} onChange={e => setFazArrendamentos(p => p.map((x,j) => j===ai ? {...x,produtor_id:e.target.value} : x))}>
                                <option value="">Não especificado</option>
                                {produtores.map(pr => <option key={pr.id} value={pr.id}>{pr.nome}</option>)}
                              </select>
                            </div>
                            <div>
                              <label style={lbl}>2º Agricultor (contrato conjunto)</label>
                              <select style={inp} value={a.produtor_id_2} onChange={e => setFazArrendamentos(p => p.map((x,j) => j===ai ? {...x,produtor_id_2:e.target.value} : x))}>
                                <option value="">—</option>
                                {produtores.filter(pr => pr.id !== a.produtor_id).map(pr => <option key={pr.id} value={pr.id}>{pr.nome}</option>)}
                              </select>
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
                                <div><input style={{ ...inp, padding: "6px 8px", fontSize: 12 }} type="number" step="0.01" value={m.area_ha} onChange={e => setFazArrendamentos(p => p.map((x,j) => j===ai ? {...x, mats: x.mats.map((mm,k) => k===mi ? {...mm,area_ha:e.target.value} : mm)} : x))} placeholder="ha" /></div>
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
                <button style={{ ...btnV, background: "#C9921B", marginTop: 14 }} onClick={() => setFazArrendamentos(p => [...p, { _key: `arr_${Date.now()}`, proprietario_id: "", proprietario_nome: "", area_ha: "", forma_pagamento: "sc_soja", sc_ha: "", valor_brl: "", ano_safra_id: "", inicio: "", vencimento: "", renovacao_auto: false, observacao: "", produtor_id: "", produtor_id_2: "", aberto: true, mats: [] }])}>+ Novo Arrendamento</button>
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
        <Modal titulo={editTalhao ? "Editar Talhão" : "Novo Talhão"} subtitulo={fazendas.find(f => f.id === modalTalhao)?.nome} onClose={() => setModalTalhao(null)} width={720}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14 }}>
            <div style={{ gridColumn: "1/3" }}><label style={lbl}>Nome *</label><input style={inp} value={fTalhao.nome} onChange={e => setFTalhao(p => ({ ...p, nome: e.target.value }))} /></div>
            <div><label style={lbl}>Área (ha) *</label><input style={inp} type="number" value={fTalhao.area} onChange={e => setFTalhao(p => ({ ...p, area: e.target.value }))} /></div>
            <div><label style={lbl}>Tipo de Solo</label><select style={inp} value={fTalhao.solo} onChange={e => setFTalhao(p => ({ ...p, solo: e.target.value }))}>{SOLOS.map(s => <option key={s}>{s}</option>)}</select></div>
            <div><label style={lbl}>Latitude GPS</label><input style={inp} type="number" step="0.0001" placeholder="-13.8283" value={fTalhao.lat} onChange={e => setFTalhao(p => ({ ...p, lat: e.target.value }))} /></div>
            <div><label style={lbl}>Longitude GPS</label><input style={inp} type="number" step="0.0001" placeholder="-56.0801" value={fTalhao.lng} onChange={e => setFTalhao(p => ({ ...p, lng: e.target.value }))} /></div>
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
            <div><label style={lbl}>Área registrada (ha)</label><input style={inp} type="number" step="0.0001" value={fMat.area_ha} onChange={e => setFMat(p => ({ ...p, area_ha: e.target.value }))} /></div>
            <div style={{ gridColumn: "1/3" }}>
              <label style={lbl}>Produtor vinculado</label>
              <select style={inp} value={fMat.produtor_id} onChange={e => setFMat(p => ({ ...p, produtor_id: e.target.value }))}>
                <option value="">Selecione…</option>
                {produtores.map(p => <option key={p.id} value={p.id}>{p.nome} ({p.tipo.toUpperCase()})</option>)}
              </select>
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
                <div><label style={lbl}>Valor da garantia (R$)</label><input style={inp} type="number" value={fMat.garantia_valor} onChange={e => setFMat(p => ({ ...p, garantia_valor: e.target.value }))} /></div>
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
          {/* Dados básicos */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14, marginBottom: 20 }}>
            <div style={{ gridColumn: "1/-1" }}><label style={lbl}>Descrição * (ex: Soja 2026/2027)</label><input style={inp} placeholder="Soja 2026/2027" value={fCiclo.descricao} onChange={e => setFCiclo(p => ({ ...p, descricao: e.target.value }))} /></div>
            <div>
              <label style={lbl}>Cultura *</label>
              <select style={inp} value={fCiclo.cultura} onChange={e => setFCiclo(p => ({ ...p, cultura: e.target.value }))}>
                {CULTURAS.map(c => <option key={c}>{c}</option>)}
              </select>
            </div>
            <div><label style={lbl}>Início *</label><input style={inp} type="date" value={fCiclo.data_inicio} onChange={e => { const v = e.target.value; setFCiclo(p => ({ ...p, data_inicio: v })); if (v && fCiclo.data_fim) calcularOcupacao(v, fCiclo.data_fim, editCiclo?.id); }} /></div>
            <div><label style={lbl}>Fim *</label><input style={inp} type="date" value={fCiclo.data_fim} onChange={e => { const v = e.target.value; setFCiclo(p => ({ ...p, data_fim: v })); if (fCiclo.data_inicio && v) calcularOcupacao(fCiclo.data_inicio, v, editCiclo?.id); }} /></div>
            <div>
              <label style={lbl}>Produtividade esperada (sc/ha)</label>
              <input style={inp} type="number" step="0.01" placeholder="Ex: 62,00" value={fCiclo.produtividade_esperada_sc_ha}
                onChange={e => setFCiclo(p => ({ ...p, produtividade_esperada_sc_ha: e.target.value }))} />
            </div>
            <div>
              <label style={lbl}>Preço de venda esperado (R$/sc)</label>
              <input style={inp} type="number" step="0.01" placeholder="Ex: 118,50" value={fCiclo.preco_esperado_sc}
                onChange={e => setFCiclo(p => ({ ...p, preco_esperado_sc: e.target.value }))} />
            </div>
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
                                <input
                                  style={{ width: 90, padding: "4px 8px", border: `0.5px solid ${excede ? "#E24B4A" : "#D4DCE8"}`, borderRadius: 6, fontSize: 12, textAlign: "right", outline: "none", background: excede ? "#FFF5F5" : "#fff" }}
                                  type="number" step="0.01" min="0" max={disponivel}
                                  value={areaSel}
                                  onChange={e => {
                                    const v = e.target.value;
                                    setCicloTalhoes(p => ({ ...p, [t.id]: v }));
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
                                if (e.target.checked) return { ...p, [t.id]: String(disponivel) };
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
            {(["geral", "seguro"] as const).map(t => (
              <button key={t} onClick={() => setTabMaq(t)} style={{ padding: "8px 20px", border: "none", borderBottom: tabMaq === t ? "2px solid #1A5CB8" : "2px solid transparent", background: "transparent", fontWeight: tabMaq === t ? 600 : 400, color: tabMaq === t ? "#1A5CB8" : "#555", cursor: "pointer", fontSize: 13 }}>
                {t === "geral" ? "Dados Gerais" : "Seguro"}
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
              <div><label style={lbl}>Ano de fabricação</label><input style={inp} type="number" placeholder="2020" value={fMaq.ano} onChange={e => setFMaq(p => ({ ...p, ano: e.target.value }))} /></div>
              <div><label style={lbl}>Patrimônio / Placa</label><input style={inp} placeholder="Ex: FAZ-0001 ou ABC-1234" value={fMaq.patrimonio} onChange={e => setFMaq(p => ({ ...p, patrimonio: e.target.value }))} /></div>
              <div>
                <label style={lbl}>Chassi / Nº de Série</label>
                <input style={{ ...inp, fontFamily: "monospace", letterSpacing: 1 }} placeholder="Ex: 9BW258090B3128765" value={fMaq.chassi} onChange={e => setFMaq(p => ({ ...p, chassi: e.target.value.toUpperCase() }))} />
              </div>
              <div>
                <label style={lbl}>{isVeiculo(fMaq.tipo) ? "Odômetro atual (km)" : "Horímetro atual (h)"}</label>
                <input style={inp} type="number" min="0" step="0.1" placeholder={isVeiculo(fMaq.tipo) ? "Ex: 125000" : "Ex: 4320"} value={fMaq.horimetro_atual} onChange={e => setFMaq(p => ({ ...p, horimetro_atual: e.target.value }))} />
              </div>
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
                <input style={inp} type="number" min="0" step="0.01" placeholder="Ex: 3500.00" value={fMaq.seguro_premio} onChange={e => setFMaq(p => ({ ...p, seguro_premio: e.target.value }))} />
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
            <div><label style={lbl}>Capacidade do tanque (L)</label><input style={inp} type="number" value={fBomba.capacidade_l} onChange={e => setFBomba(p => ({ ...p, capacidade_l: e.target.value }))} /></div>
            <div><label style={lbl}>Estoque atual (L)</label><input style={inp} type="number" value={fBomba.estoque_atual_l} onChange={e => setFBomba(p => ({ ...p, estoque_atual_l: e.target.value }))} /></div>
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
                    const n = await criarGrupoInsumo({ fazenda_id: fazendaId!, ...fGrupoIns });
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
                    const n = await criarSubgrupoInsumo({ fazenda_id: fazendaId!, ...fSubgIns });
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
                    const n = await criarTipoPessoa({ fazenda_id: fazendaId!, ...fTipoPes });
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
                  const payload = { fazenda_id: fazendaId!, codigo: fCC.codigo || undefined, nome: fCC.nome, tipo: fCC.tipo, parent_id: fCC.parent_id || undefined, manutencao_maquinas: fCC.manutencao_maquinas };
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
                    const n = await criarCategoriaLancamento({ fazenda_id: fazendaId!, ...fCatLanc });
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
            ] as { key: typeof abaOpGer; label: string }[]).map(a => (
              <button key={a.key} onClick={() => setAbaOpGer(a.key)} style={{
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
                    fazenda_id: fazendaId!,
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
              <input style={inp} type="number" min="1" placeholder="Ex: 3" value={fFP.parcelas} onChange={e => setFFP(p => ({ ...p, parcelas: e.target.value }))} />
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
                  const n = await criarFormaPagamento({ fazenda_id: fazendaId!, ...payload });
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
            <div><label style={lbl}>Capacidade (sacas)</label><input style={inp} type="number" placeholder="Ex: 50000" value={fDep.capacidade_sc} onChange={e => setFDep(p => ({ ...p, capacidade_sc: e.target.value }))} /></div>
          </div>
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 20 }}>
            <button style={btnR} onClick={() => setModalDep(false)}>Cancelar</button>
            <button style={{ ...btnV, opacity: salvando || !fDep.nome.trim() ? 0.5 : 1 }} disabled={salvando || !fDep.nome.trim()} onClick={salvarDep}>{salvando ? "Salvando…" : "Salvar"}</button>
          </div>
        </Modal>
      )}

      {/* Modal Funcionário */}
      {modalFunc && (
        <Modal titulo={editFunc ? "Editar Funcionário" : "Novo Funcionário"} onClose={() => setModalFunc(false)} width={780}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14 }}>
            <div style={{ gridColumn: "1/-1" }}><label style={lbl}>Nome *</label><input style={inp} value={fFunc.nome} onChange={e => setFFunc(p => ({ ...p, nome: e.target.value }))} /></div>
            <div><label style={lbl}>CPF</label><input style={inp} value={fFunc.cpf} onChange={e => setFFunc(p => ({ ...p, cpf: maskCpfCnpj(e.target.value, "pf") }))} placeholder="000.000.000-00" /></div>
            <div>
              <label style={lbl}>Vínculo *</label>
              <select style={inp} value={fFunc.tipo} onChange={e => setFFunc(p => ({ ...p, tipo: e.target.value as Funcionario["tipo"] }))}>
                <option value="clt">CLT</option>
                <option value="diarista">Diarista</option>
                <option value="empreiteiro">Empreiteiro</option>
                <option value="outro">Outro</option>
              </select>
            </div>
            <div><label style={lbl}>Função / Cargo</label><input style={inp} value={fFunc.funcao} onChange={e => setFFunc(p => ({ ...p, funcao: e.target.value }))} /></div>
            <div><label style={lbl}>Data de admissão</label><input style={inp} type="date" value={fFunc.data_admissao} onChange={e => setFFunc(p => ({ ...p, data_admissao: e.target.value }))} /></div>
          </div>
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 20 }}>
            <button style={btnR} onClick={() => setModalFunc(false)}>Cancelar</button>
            <button style={{ ...btnV, opacity: salvando || !fFunc.nome.trim() ? 0.5 : 1 }} disabled={salvando || !fFunc.nome.trim()} onClick={salvarFunc}>{salvando ? "Salvando…" : "Salvar"}</button>
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
    </div>
  );
}

export default function Cadastros() {
  return <Suspense><CadastrosInner /></Suspense>;
}
