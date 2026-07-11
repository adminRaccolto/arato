"use client";
import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "./AuthProvider";
import { supabase } from "../lib/supabase";
import type { Fazenda } from "../lib/supabase";


// ─── Tipos ───────────────────────────────────────────────────
type NavLink     = { type?: "link";     id: string; label: string; path: string; moduleId?: string };
type NavDivider  = { type: "divider";   label: string };
type NavSubgroup = { type: "subgroup";  id: string; label: string; children: NavLink[]; moduleId?: string };
type NavChild    = NavLink | NavDivider | NavSubgroup;

type NavItem =
  | (NavLink & { minStep?: number })
  | { type: "group"; id: string; label: string; panel?: boolean; minStep?: number; children: NavChild[] };

function extrairGrupos(children: NavChild[]): { label: string; items: NavLink[] }[] {
  const grupos: { label: string; items: NavLink[] }[] = [];
  let atual: { label: string; items: NavLink[] } | null = null;
  for (const c of children) {
    if (c.type === "divider") {
      if (atual) grupos.push(atual);
      atual = { label: c.label, items: [] };
    } else if (atual && c.type !== "subgroup") {
      atual.items.push(c as NavLink);
    }
  }
  if (atual) grupos.push(atual);
  return grupos;
}

// ─── Dados de navegação ──────────────────────────────────────
const NAV: NavItem[] = [

  { id: "dashboard", label: "Dashboard", path: "/", minStep: 0 },
  { id: "mapa",      label: "Mapa",      path: "/mapa",  minStep: 0 },

  {
    type: "group", id: "cadastros", label: "Cadastros", panel: true, minStep: 0,
    children: [
      { type: "divider", label: "Gerais" },
      { id: "cad-produtores",   label: "Produtores",            path: "/cadastros?tab=produtores"   },
      { id: "cad-empresas",     label: "Empresas",              path: "/cadastros?tab=empresas"     },
      { id: "cad-fazendas",     label: "Fazendas & Talhões",    path: "/cadastros?tab=fazendas"     },
      { id: "cad-funcionarios", label: "Funcionários",          path: "/cadastros?tab=funcionarios" },
      { id: "cad-pessoas",        label: "Pessoas",               path: "/cadastros?tab=pessoas"         },
      { id: "cad-imoveis-urbanos", label: "Imóveis Urbanos",     path: "/cadastros?tab=imoveis_urbanos" },
      { type: "divider", label: "Técnicos" },
      { id: "cad-safras",       label: "Safras",                path: "/cadastros?tab=safras"       },
      { id: "cad-insumos",      label: "Insumos",               path: "/cadastros?tab=insumos"      },
      { id: "cad-produtos",     label: "Produtos Agrícolas",    path: "/cadastros?tab=produtos"     },
      { id: "cad-itens",        label: "Itens Gerais",          path: "/cadastros?tab=itens"        },
      { id: "cad-depositos",    label: "Depósitos & Armazéns",  path: "/cadastros?tab=depositos"    },
      { id: "cad-maquinas",     label: "Máquinas",              path: "/cadastros?tab=maquinas"     },
      { id: "cad-combustivel",  label: "Combustíveis & Bombas", path: "/cadastros?tab=combustivel"  },
      { id: "cad-grupos-insumo",   label: "Grupos de Insumos",        path: "/cadastros?tab=grupos_insumo"         },
      { id: "cad-culturas",        label: "Culturas",                 path: "/cadastros?tab=culturas"              },
      { id: "cad-padroes-class",   label: "Padrões de Classificação", path: "/cadastros?tab=padroes_classificacao" },
      { id: "cad-principios-ativos", label: "Princípios Ativos (BOT)", path: "/cadastros?tab=principios_ativos"   },
      { id: "cad-unidades-medida",  label: "Unidades de Medida",     path: "/cadastros?tab=unidades_medida"      },
      { type: "divider", label: "Financeiro" },
      { id: "cad-contas-bancarias", label: "Contas Bancárias",        path: "/cadastros?tab=contas_bancarias"      },
    ],
  },

  {
    type: "group", id: "comercial", label: "Comercial", minStep: 4,
    children: [
      {
        type: "subgroup", id: "sg-faturamento", label: "Faturamento", moduleId: "contratos",
        children: [
          { id: "com-faturamento", label: "NF-e de Saída",      path: "/comercial/faturamento", moduleId: "contratos"  },
          { id: "com-expedicao",   label: "Expedição de Grãos", path: "/expedicao",             moduleId: "expedicao"  },
        ],
      },
      {
        type: "subgroup", id: "sg-contratos-com", label: "Contratos", moduleId: "contratos",
        children: [
          { id: "com-contratos",     label: "Contratos de Grãos",       path: "/contratos",              moduleId: "contratos"   },
          { id: "com-arrendamentos", label: "Contratos de Arrendamento", path: "/contratos/arrendamento", moduleId: "arrendamento" },
          { id: "com-migrar-nf",     label: "Migrar NF entre Contratos", path: "/contratos/migrar-nf",   moduleId: "contratos"   },
        ],
      },
    ],
  },

  {
    type: "group", id: "transporte", label: "Transporte", minStep: 7,
    children: [
      { id: "transp-cadastros", label: "Cadastros de Transporte", path: "/transporte/cadastros", moduleId: "transporte" },
      { type: "divider", label: "Documentos Fiscais" },
      { id: "transp-cte",  label: "CT-e — Conhecimento de Transporte", path: "/transporte/cte",  moduleId: "transporte" },
      { id: "transp-mdfe", label: "MDF-e — Manifesto de Cargas",       path: "/transporte/mdfe", moduleId: "transporte" },
    ],
  },

  {
    type: "group", id: "compras", label: "Compras", minStep: 5,
    children: [
      { id: "comp-pedidos", label: "Pedidos de Compra", path: "/compras", moduleId: "compras" },
      {
        type: "subgroup", id: "sg-entrada-nf", label: "Entrada Manual de NF",
        children: [
          { id: "comp-nf",         label: "NF de Produtos", path: "/compras/nf",         moduleId: "nf_entrada"  },
          { id: "comp-nf-servico", label: "NF de Serviços", path: "/compras/nf-servico", moduleId: "nf_servico"  },
        ],
      },
      {
        type: "subgroup", id: "sg-sieg", label: "Automação SIEG",
        children: [
          { id: "sieg-ligar",      label: "⚡ Ligar / Desligar SIEG",      path: "/configuracoes/automacoes"       },
          { id: "sieg-pendencias", label: "Pendências de Classificação",    path: "/financeiro/pendencias-nf"       },
          { id: "sieg-regras",     label: "Regras de Classificação",        path: "/configuracoes/classificacao"    },
        ],
      },
    ],
  },

  {
    type: "group", id: "estoque", label: "Estoque", minStep: 5,
    children: [
      { id: "est-posicao",          label: "Posição de Estoque",        path: "/estoque"                          },
      { id: "est-kardex",           label: "Kardex (Ficha de Estoque)", path: "/estoque/kardex"                   },
      { id: "est-abastecimento",    label: "Abastecimento de Máquinas", path: "/estoque/abastecimento"            },
    ],
  },

  {
    type: "group", id: "financeiro", label: "Financeiro", minStep: 6,
    children: [
      { id: "fin-pagar",        label: "Contas a Pagar",            path: "/financeiro/pagar",         moduleId: "fin_pagar"     },
      { id: "fin-receber",      label: "Contas a Receber",          path: "/financeiro/receber",       moduleId: "fin_receber"   },
      { id: "fin-adiantamentos",label: "Adiantamentos a Fornecedores", path: "/financeiro/adiantamentos", moduleId: "fin_pagar" },
      { id: "fin-contratos",    label: "Contratos Financeiros",     path: "/financeiro/contratos",     moduleId: "fin_contratos" },
      {
        type: "subgroup", id: "sg-seguros", label: "Seguros & Consórcios", moduleId: "fin_seguros",
        children: [
          { id: "fin-seguros",    label: "Apólices e Sinistros",   path: "/financeiro/seguros",    moduleId: "fin_seguros" },
          { id: "fin-consorcios", label: "Consórcios",             path: "/financeiro/consorcios", moduleId: "fin_seguros" },
        ],
      },
      {
        type: "subgroup", id: "sg-tesouraria", label: "Tesouraria", moduleId: "fin_tesouraria",
        children: [
          { id: "fin-lanc-tesouraria", label: "Lançamento de Tesouraria", path: "/financeiro/tesouraria",           moduleId: "fin_tesouraria" },
          { id: "fin-op-tesouraria",   label: "Operações de Tesouraria",  path: "/financeiro/tesouraria/operacoes", moduleId: "fin_tesouraria" },
          { id: "fin-mutuo",           label: "Mútuos entre Empresas",    path: "/financeiro/tesouraria/mutuo",     moduleId: "fin_tesouraria" },
          { id: "fin-conciliacao",     label: "Conciliação Bancária",     path: "/financeiro/conciliacao",          moduleId: "fin_tesouraria" },
        ],
      },
      {
        type: "subgroup", id: "sg-fin-relatorios", label: "Relatórios", moduleId: "fin_relatorios",
        children: [
          { id: "fin-fluxo-prev",    label: "Fluxo de Caixa Previsto",  path: "/financeiro/relatorios?aba=fluxo&tipo=previsto",  moduleId: "fin_relatorios" },
          { id: "fin-fluxo-real",    label: "Fluxo de Caixa Realizado", path: "/financeiro/relatorios?aba=fluxo&tipo=realizado", moduleId: "fin_relatorios" },
          { id: "fin-cpcr",          label: "CP / CR — Contas",         path: "/financeiro/relatorios?aba=cpcr",                moduleId: "fin_relatorios" },
          { id: "fin-posicao",       label: "Posição por Conta",        path: "/financeiro/relatorios?aba=posicao",             moduleId: "fin_relatorios" },
          { id: "fin-endividamento",    label: "Endividamento",               path: "/financeiro/endividamento",                     moduleId: "fin_relatorios" },
          { id: "fin-classificacao",    label: "Por Classificação",           path: "/relatorios/financeiro-classificacao",           moduleId: "fin_relatorios" },
          { id: "rel-manutencao",       label: "Manutenção de Máquinas",      path: "/relatorios/manutencao",                        moduleId: "fin_relatorios" },
        ],
      },
    ],
  },

  {
    type: "group", id: "lavoura", label: "Lavoura", panel: true, minStep: 3,
    children: [
      { type: "divider", label: "Lançamentos" },
      { id: "lav-correcao",     label: "Correção de Solo",    path: "/lavoura/correcao"              },
      { id: "lav-adubacao",     label: "Adubação de Base",    path: "/lavoura/adubacao"              },
      { id: "lav-plantio",      label: "Plantio",             path: "/lavoura/plantio"               },
      { id: "lav-pulverizacao", label: "Pulverização",        path: "/lavoura/pulverizacao"          },
      { id: "lav-colheita",     label: "Colheita Própria",    path: "/lavoura/colheita"              },
      { id: "lav-rom-entrada",  label: "Romaneio de Entrada", path: "/estoque/romaneio-entrada"      },
      { type: "divider", label: "Planejamento" },
      { id: "lav-planejamento", label: "Planejamento de Safra", path: "/lavoura/planejamento"        },
      { type: "divider", label: "Monitoramento" },
      { id: "lav-recomendacoes",  label: "Recomendações Agronômicas", path: "/lavoura/recomendacoes"   },
      { id: "lav-execucao",       label: "📱 App de Campo (Mobile)",  path: "/campo"                   },
      { id: "lav-pragas",         label: "Pragas & Doenças",          path: "/lavoura/pragas"          },
      { id: "lav-pluviometria",   label: "Pluviometria",              path: "/lavoura/pluviometria"    },
      { type: "divider", label: "Relatórios" },
      { id: "lav-rel-aplicacoes", label: "Aplicações por Ciclo", path: "/lavoura/relatorios/aplicacoes" },
    ],
  },

  {
    type: "group", id: "algodao", label: "Algodão", minStep: 3,
    children: [
      { type: "divider", label: "Lavoura" },
      { id: "alg-safra",    label: "Safra & Operações",        path: "/algodao?aba=safra",      moduleId: "algodao" },
      { id: "alg-bicudo",   label: "Monitoramento de Bicudo",  path: "/algodao?aba=bicudo",     moduleId: "algodao" },
      { type: "divider", label: "Pós-Colheita" },
      { id: "alg-modulos",  label: "Colheita & Módulos",       path: "/algodao?aba=modulos",    moduleId: "algodao" },
      { id: "alg-benef",    label: "Algodoeira / Beneficiamento", path: "/algodao?aba=algodoeira", moduleId: "algodao" },
      { id: "alg-hvi",      label: "HVI & Qualidade",          path: "/algodao?aba=hvi",        moduleId: "algodao" },
      { type: "divider", label: "Gestão" },
      { id: "alg-posicao",  label: "Posição de Algodão",       path: "/algodao?aba=posicao",    moduleId: "algodao" },
    ],
  },

  {
    type: "group", id: "fiscal", label: "Fiscal", minStep: 7,
    children: [
      { id: "fiscal-monitor",       label: "Monitor NF-e Emitidas",  path: "/fiscal",                     moduleId: "fiscal_nfe"  },
      { id: "fiscal-triangulacao",  label: "Triangulação de NF",     path: "/fiscal/triangulacao",        moduleId: "fiscal_nfe"  },
      { id: "fiscal-pendencias",    label: "Pendências Fiscais",      path: "/fiscal/pendencias",          moduleId: "fiscal_nfe"  },
      { id: "fiscal-gnre",          label: "GNRE",                    path: "/fiscal/gnre",                moduleId: "fiscal_nfe"  },
      { id: "fiscal-esocial",    label: "eSocial Rural",         path: "/fiscal/esocial",    moduleId: "fiscal_sped" },
      { id: "fiscal-parcerias",  label: "Parcerias & Grupos",    path: "/parcerias",           moduleId: "fiscal_sped" },
      {
        type: "subgroup", id: "sg-dfe", label: "Documentos Fiscais", moduleId: "fiscal_sped",
        children: [
          { id: "fiscal-lcdpr",         label: "LCDPR",                        path: "/lcdpr",                moduleId: "fiscal_sped" },
          { id: "fiscal-sped-contabil", label: "SPED ECD — Contábil",          path: "/fiscal/sped-contabil", moduleId: "fiscal_sped" },
          { id: "fiscal-ibs",           label: "IBS / CBS — 2027",             path: "/ibs",                  moduleId: "fiscal_sped" },
        ],
      },
      { id: "fiscal-certificado", label: "Certificado Digital", path: "/fiscal?aba=certificado", moduleId: "fiscal_nfe" },
    ],
  },

  {
    type: "group", id: "custos", label: "Custos", minStep: 3,
    children: [
      { id: "custos-dre",        label: "DRE Agrícola",         path: "/custos?aba=dre"                },
      { id: "custos-custoha",    label: "Custo / ha",           path: "/custos?aba=custoha"            },
      { id: "custos-produt",     label: "Produtividade",        path: "/custos?aba=produtividade"      },
      { id: "custos-totais",     label: "Custos Totais",        path: "/custos?aba=custostotais"       },
      { id: "custos-aplicacoes", label: "Aplicações por Ciclo", path: "/lavoura/relatorios/aplicacoes" },
      { id: "custos-rateio",     label: "Regras de Rateio",     path: "/configuracoes/rateio"          },
      { id: "custos-centros",    label: "Centros de Custo",     path: "/cadastros?tab=centros_custo"   },
    ],
  },

  {
    type: "group", id: "configuracoes", label: "Configurações", minStep: 0,
    children: [
      { type: "divider", label: "Fiscal" },
      { id: "conf-modulos",        label: "Parâmetros NF-e / MDF-e",   path: "/configuracoes/modulos",               moduleId: "conf_fiscal" },
      { id: "conf-op-fiscais",     label: "Operações Fiscais",          path: "/configuracoes/modulos?aba=operacoes", moduleId: "conf_fiscal" },
      { id: "conf-historico-cfop", label: "Histórico Fiscal (CFOPs)",   path: "/cadastros?tab=historico_fiscal",      moduleId: "conf_fiscal" },
      { id: "conf-classificacao",  label: "Classificação Automática",   path: "/configuracoes/classificacao",         moduleId: "conf_fiscal" },

      { type: "divider", label: "Financeiro" },
      { id: "conf-plano-contas",  label: "Plano de Contas",       path: "/configuracoes?tab=plano_contas",     moduleId: "conf_financeiro" },
      { id: "conf-op-gerenciais", label: "Operações Gerenciais",  path: "/cadastros?tab=operacoes_gerenciais", moduleId: "conf_financeiro" },
      { id: "conf-formas-pgto",   label: "Formas de Pagamento",   path: "/cadastros?tab=formas_pagamento",     moduleId: "conf_financeiro" },

      { type: "divider", label: "Contabilidade" },
      { id: "conf-contabilidade", label: "Configuração Contábil", path: "/configuracoes/contabilidade", moduleId: "conf_contabilidade" },

      { type: "divider", label: "Usuários" },
      { id: "conf-usuarios", label: "Usuários & Permissões",  path: "/configuracoes/usuarios", moduleId: "usuarios" },

      { type: "divider", label: "Raccolto" },
      { id: "conf-integracoes", label: "Integrações",          path: "/configuracoes/integracoes", moduleId: "conf_raccotlo" },
      { id: "conf-automacoes",  label: "Automações",           path: "/configuracoes/automacoes",  moduleId: "conf_raccotlo" },
      { id: "conf-backup",      label: "Backup & Restauração", path: "/configuracoes/backup",      moduleId: "conf_raccotlo" },
      { id: "conf-importacao",  label: "Importações",          path: "/configuracoes/importacao",  moduleId: "conf_raccotlo" },
      { id: "conf-alertas",    label: "Alertas do Sistema",   path: "/controller",                moduleId: "conf_raccotlo" },
      { id: "conf-logs",        label: "Log do Sistema",       path: "/admin/logs",                moduleId: "conf_raccotlo" },
      { id: "conf-manual",      label: "Manual do Proprietário", path: "/admin/manual",            moduleId: "conf_raccotlo" },
    ],
  },

  {
    type: "group", id: "ajuda", label: "Ajuda", minStep: 0,
    children: [
      { id: "ajuda-learning", label: "Aprendizado", path: "/learning" },
      { id: "ajuda-suporte",  label: "Suporte IA",  path: "/suporte"  },
    ],
  },
];

// ─── Mapeamento nav-id → módulos de permissão ───────────────
// Grupo visível se pelo menos 1 dos módulos for acessível.
// IDs batem com MODULOS_PERM em admin/usuarios/page.tsx
// Grupos sem entrada no mapa são sempre visíveis (dashboard, mapa, ajuda).
const NAV_MODULE_MAP: Record<string, string[]> = {
  "cadastros":     ["cadastros"],
  "comercial":     ["contratos", "expedicao", "arrendamento"],
  "transporte":    ["transporte"],
  "compras":       ["compras", "nf_entrada", "nf_servico"],
  "estoque":       ["estoque"],
  "financeiro":    ["fin_receber", "fin_pagar", "fin_contratos", "fin_tesouraria", "fin_seguros"],
  "lavoura":       ["lavoura_plantio", "lavoura_pulv", "lavoura_colheita", "lavoura_plan", "propriedades"],
  "fiscal":        ["fiscal_nfe", "fiscal_sped"],
  "custos":        ["custos", "fin_relatorios"],
  "configuracoes": ["conf_empresa", "conf_fiscal", "conf_financeiro", "conf_contabilidade", "conf_sistema", "conf_importacao", "usuarios", "logs"],
  "algodao":       ["algodao"],
};

// ─── Componente ──────────────────────────────────────────────
interface TopNavProps { automacoesAtivas?: number }

export default function TopNav({ automacoesAtivas = 5 }: TopNavProps) {
  const [dropdown,         setDropdown]         = useState<string | null>(null);
  const [openSub,          setOpenSub]          = useState<string | null>(null);
  const [panelGroup,       setPanelGroup]        = useState<string>("Imóvel Rural");
  const [fazenda,          setFazenda]          = useState<Fazenda | null>(null);
  const [produtorNome,     setProdutorNome]     = useState<string | null>(null);
  const [logoArato,        setLogoArato]        = useState<string | null>(null);
  const [nomeArato,        setNomeArato]        = useState("Arato");
  const [qtdPendencias,    setQtdPendencias]    = useState(0);

  const pathname = usePathname();
  const { fazendaId, contaId, nomeUsuario, signOut, userRole, raccotloGestor, nomeFazendaSelecionada, nomeProdutor, clearFazenda, onboardingAtivo, stepsCompletos, podeAcessar, podeAcessarPlano, logoCliente } = useAuth();
  const navRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!fazendaId) return;
    supabase.from("fazendas").select("*").eq("id", fazendaId).single()
      .then(({ data }) => {
        if (data) {
          setFazenda(data);
          // Busca nome do produtor principal para exibir no topo
          if (data.produtor_id) {
            supabase.from("produtores").select("nome").eq("id", data.produtor_id).single()
              .then(({ data: p }) => { if (p) setProdutorNome(p.nome); });
          } else {
            setProdutorNome(null);
          }
        }
      });
  }, [fazendaId]);

  useEffect(() => {
    if (!fazendaId) return;
    supabase
      .from("pendencias_operacionais")
      .select("id", { count: "exact", head: true })
      .eq("fazenda_id", fazendaId)
      .eq("status", "pendente")
      .then(({ count }) => setQtdPendencias(count ?? 0));
  }, [fazendaId, pathname]);


  useEffect(() => {
    // Logo do sistema: lida do Supabase Storage (bucket "logos", arquivo "arato.png")
    // Para trocar a logo: Supabase → Storage → logos → fazer upload do novo arquivo com o mesmo nome
    const { data } = supabase.storage.from("logos").getPublicUrl("arato.png");
    if (data?.publicUrl) setLogoArato(data.publicUrl);
  }, []);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (navRef.current && !navRef.current.contains(e.target as Node)) {
        setDropdown(null);
        setOpenSub(null);
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  const isAtivo = (path: string) => {
    const [p, q] = path.split("?");
    if (q) {
      const params = new URLSearchParams(q);
      const tab = params.get("tab");
      const aba = params.get("aba");
      const cur = typeof window !== "undefined" ? new URLSearchParams(window.location.search) : new URLSearchParams();
      if (tab) return pathname === p && cur.get("tab") === tab;
      if (aba) return pathname === p && cur.get("aba") === aba;
    }
    return pathname === path;
  };

  const grupoAtivo = (item: Extract<NavItem, { type: "group" }>) => {
    if (item.id === "cadastros")       return pathname === "/cadastros";
    if (item.id === "comercial")       return pathname === "/contratos" || pathname.startsWith("/expedicao") || pathname.startsWith("/contratos") || pathname.startsWith("/comercial");
    if (item.id === "transporte")      return pathname.startsWith("/transporte");
    if (item.id === "compras")  return pathname.startsWith("/compras") || pathname === "/fiscal/manifestacao" || pathname === "/financeiro/pendencias-nf";
    if (item.id === "estoque")  return (pathname === "/estoque" || pathname.startsWith("/estoque")) && pathname !== "/estoque/romaneio-entrada";
    if (item.id === "financeiro")      return pathname.startsWith("/financeiro");
    if (item.id === "lavoura")         return pathname.startsWith("/lavoura") || pathname === "/estoque/romaneio-entrada";
    if (item.id === "fiscal")          return pathname === "/fiscal" || pathname === "/lcdpr" || pathname === "/ibs" || pathname === "/parcerias" || pathname.startsWith("/fiscal");
    if (item.id === "custos")          return pathname.startsWith("/custos") || pathname.startsWith("/relatorios/dre");
    if (item.id === "configuracoes")   return pathname.startsWith("/configuracoes") || pathname.startsWith("/admin");
    if (item.id === "algodao")         return pathname.startsWith("/algodao");
    if (item.id === "ajuda")           return pathname === "/learning" || pathname === "/suporte";
    return false;
  };

  // Verifica se algum link dentro de um subgroup está ativo
  const subgroupAtivo = (sg: NavSubgroup) => sg.children.some(c => isAtivo(c.path));

  const nomeIdentidade = produtorNome ?? fazenda?.nome ?? null;
  const iniciaisFazenda = nomeIdentidade
    ? nomeIdentidade.split(" ").slice(0, 2).map(w => w[0]).join("").toUpperCase()
    : "—";

  // ── Renderiza item do dropdown (link, divider ou subgroup) ──
  function renderChild(child: NavChild, idx: number) {
    // Filtra links/subgroups com módulo sem acesso (por permissão de usuário OU por plano)
    if (child.type !== "divider") {
      const mid = (child as NavLink | NavSubgroup).moduleId;
      if (mid && !podeAcessar(mid)) return null;
      if (mid && !podeAcessarPlano(mid)) return null;
    }

    // Divider
    if (child.type === "divider") {
      return (
        <div key={`div-${idx}`} style={{
          padding: idx === 0 ? "6px 14px 4px" : "10px 14px 4px",
          fontSize: 10, fontWeight: 700, color: "#888",
          textTransform: "uppercase", letterSpacing: "0.07em",
          borderTop: idx > 0 ? "0.5px solid #EEF1F6" : "none",
          marginTop: idx > 0 ? 4 : 0,
        }}>
          {child.label}
        </div>
      );
    }

    // Subgroup (flyout)
    if (child.type === "subgroup") {
      const sg = child as NavSubgroup;
      const isOpen = openSub === sg.id;
      const temAtivo = subgroupAtivo(sg);
      return (
        <div
          key={sg.id}
          style={{ position: "relative" }}
          onMouseEnter={() => setOpenSub(sg.id)}
          onMouseLeave={() => setOpenSub(null)}
        >
          <div style={{
            display: "flex", alignItems: "center",
            padding: "8px 14px", cursor: "default", gap: 8, whiteSpace: "nowrap",
            background: isOpen ? "#EBF5FF" : temAtivo ? "#F0F8FF" : "transparent",
            borderLeft: temAtivo ? "3px solid #1A4870" : "3px solid transparent",
          }}>
            <span style={{ fontSize: 13, color: temAtivo ? "#0B2D50" : "#222", fontWeight: temAtivo ? 600 : 400 }}>
              {sg.label}
            </span>
            <span style={{ fontSize: 9, color: isOpen ? "#1A4870" : "#aaa", flexShrink: 0 }}>▶</span>
          </div>

          {/* Flyout lateral */}
          {isOpen && (
            <>
            {/* Ponte invisível: cobre o gap de 4px entre o item e o flyout */}
            <div style={{
              position: "absolute", top: 0, left: "100%",
              width: 8, height: "100%", background: "transparent",
            }} />
            <div style={{
              position: "absolute", top: -6, left: "calc(100% + 4px)",
              background: "#fff", borderRadius: 10,
              border: "0.5px solid #D4DCE8",
              boxShadow: "0 8px 28px rgba(0,0,0,0.14)",
              minWidth: 210, zIndex: 1100, padding: "6px 0",
            }}>
              <div style={{ padding: "6px 14px 4px", fontSize: 10, fontWeight: 700, color: "#888", textTransform: "uppercase", letterSpacing: "0.07em" }}>
                {sg.label}
              </div>
              {sg.children.filter(gc => (!gc.moduleId || podeAcessar(gc.moduleId)) && (!gc.moduleId || podeAcessarPlano(gc.moduleId))).map(gc => {
                const ativoGc = isAtivo(gc.path);
                return (
                  <Link
                    key={gc.id}
                    href={gc.path}
                    onClick={() => { setDropdown(null); setOpenSub(null); }}
                    style={{
                      display: "flex", alignItems: "center",
                      padding: "8px 14px", textDecoration: "none", fontSize: 13,
                      whiteSpace: "nowrap",
                      color: ativoGc ? "#0B2D50" : "#222",
                      fontWeight: ativoGc ? 600 : 400,
                      background: ativoGc ? "#D5E8F5" : "transparent",
                      borderLeft: ativoGc ? "3px solid #1A4870" : "3px solid transparent",
                    }}
                  >
                    {gc.label}
                  </Link>
                );
              })}
            </div>
            </>
          )}
        </div>
      );
    }

    // Link simples
    const link = child as NavLink;
    const ativoLink = isAtivo(link.path);
    return (
      <Link
        key={link.id}
        href={link.path}
        onClick={() => { setDropdown(null); setOpenSub(null); }}
        style={{
          display: "flex", alignItems: "center",
          padding: "8px 14px", textDecoration: "none", fontSize: 13,
          whiteSpace: "nowrap",
          color: ativoLink ? "#0B2D50" : "#222",
          fontWeight: ativoLink ? 600 : 400,
          background: ativoLink ? "#D5E8F5" : "transparent",
          borderLeft: ativoLink ? "3px solid #1A4870" : "3px solid transparent",
        }}
      >
        {link.label}
      </Link>
    );
  }

  return (
    <header
      ref={navRef}
      style={{
        position: "sticky", top: 0, zIndex: 1000, flexShrink: 0,
        background: "#ffffff",
        boxShadow: "0 1px 3px rgba(0,0,0,0.08)",
        fontFamily: "system-ui, sans-serif",
        overflow: "visible",
      }}
    >
      {/* ── Faixa 1 ── */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "0 16px", height: 56,
        borderBottom: "0.5px solid #D4DCE8",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {logoArato ? (
            <img src={logoArato} alt={nomeArato} style={{ height: 36, maxWidth: 130, objectFit: "contain" }} />
          ) : (
            <img src="/Logo_Arato.png" alt="Arato" style={{ height: 36, width: "auto", objectFit: "contain" }} />
          )}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          {fazenda && !(userRole === "raccotlo" && fazendaId && (nomeProdutor || nomeFazendaSelecionada)) && (
            <div style={{ position: "relative" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, borderRadius: 8, padding: "4px 8px" }}>
                {logoCliente ? (
                  <img src={logoCliente} alt="Logo fazenda" style={{ width: 36, height: 36, borderRadius: 9, objectFit: "contain", border: "0.5px solid #D4DCE8" }} />
                ) : (
                  <div style={{ width: 36, height: 36, borderRadius: 9, background: "#F3F6F9", border: "0.5px solid #D4DCE8", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700, color: "#1A4870" }}>
                    {iniciaisFazenda}
                  </div>
                )}
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "#1a1a1a", lineHeight: 1.25 }}>
                    {produtorNome ?? fazenda.nome}
                  </div>
                  <div style={{ fontSize: 11, color: "#666" }}>
                    {produtorNome ? `${fazenda.nome} · ` : ""}
                    {fazenda.municipio} · {fazenda.estado}
                    {fazenda.area_total_ha ? ` · ${fazenda.area_total_ha.toLocaleString("pt-BR")} ha` : ""}
                  </div>
                </div>
              </div>
            </div>
          )}

          <div style={{ width: 1, height: 32, background: "#D4DCE8" }} />

          {/* Nome + logo do cliente ativo (raccotlo navegando por um cliente) */}
          {userRole === "raccotlo" && fazendaId && (nomeProdutor || nomeFazendaSelecionada) && (
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              {logoCliente
                ? <img src={logoCliente} alt="" style={{ height: 26, width: 26, objectFit: "contain", borderRadius: 4, border: "0.5px solid #DDE2EE" }} />
                : (
                  <div style={{ width: 26, height: 26, borderRadius: 4, background: "#D5E8F5", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 700, color: "#1A4870", flexShrink: 0 }}>
                    {(nomeProdutor || nomeFazendaSelecionada || "").substring(0, 2).toUpperCase()}
                  </div>
                )
              }
              <div style={{ maxWidth: 200 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: "#1a1a1a", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {nomeProdutor || nomeFazendaSelecionada}
                </div>
                {fazenda && (
                  <div style={{ fontSize: 11, color: "#666", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {nomeProdutor ? `${fazenda.nome} · ` : ""}{fazenda.municipio} · {fazenda.estado}
                  </div>
                )}
              </div>
              <button
                onClick={clearFazenda}
                style={{
                  background: "none", border: "0.5px solid #D4DCE8",
                  borderRadius: 6, padding: "4px 10px", cursor: "pointer",
                  fontSize: 11, color: "#555", fontWeight: 600,
                }}
              >
                Trocar cliente
              </button>
              <div style={{ width: 1, height: 24, background: "#D4DCE8" }} />
            </div>
          )}

          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ width: 30, height: 30, background: "#FDE9BB", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, color: "#7A5A12", flexShrink: 0 }}>
              {nomeUsuario ? nomeUsuario.substring(0, 2).toUpperCase() : "—"}
            </div>
            {nomeUsuario && (
              <span style={{ fontSize: 13, color: "#444", fontWeight: 500, maxWidth: 140, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {nomeUsuario}
              </span>
            )}
            <button onClick={signOut} style={{ background: "none", border: "0.5px solid #D4DCE8", cursor: "pointer", color: "#555", fontSize: 12, padding: "4px 10px", borderRadius: 6 }}>
              Sair
            </button>
          </div>
        </div>
      </div>

      {/* ── Faixa 2: navegação ── */}
      <nav style={{ display: "flex", alignItems: "center", padding: "0 16px", height: 40, gap: 2, background: "#1A5C38", overflow: "visible" }}>
        {NAV.map(item => {
          // Filtra por permissão de usuário E por plano: grupo visível se ≥1 módulo mapeado for acessível em ambos
          const navId  = item.type === "group" ? item.id : (item as NavLink).id;
          const modulos = NAV_MODULE_MAP[navId];
          if (modulos && !modulos.some(m => podeAcessar(m))) return null;
          if (modulos && !modulos.some(m => podeAcessarPlano(m))) return null;

          // During onboarding, items with minStep > stepsCompletos are locked
          const isLocked = onboardingAtivo && (item.minStep ?? 0) > stepsCompletos;
          if (isLocked) {
            return (
              <div key={item.type === "group" ? item.id : (item as NavLink).id} style={{
                display: "flex", alignItems: "center", gap: 4,
                padding: "5px 12px", borderRadius: 6,
                color: "rgba(255,255,255,0.35)",
                fontSize: 13, cursor: "not-allowed", userSelect: "none",
                whiteSpace: "nowrap",
              }} title={`Disponível após a etapa ${item.minStep ?? 0} da implantação`}>
                {"label" in item ? item.label : ""}
                <span style={{ fontSize: 9, opacity: 0.6 }}>🔒</span>
              </div>
            );
          }

          if (item.type === "group") {
            const ativo = grupoAtivo(item);
            const open  = dropdown === item.id;

            // ── Painel duplo (Cadastros, Lavoura) ──
            if (item.panel) {
              const grupos     = extrairGrupos(item.children);
              const grupoAtual = grupos.find(g => g.label === panelGroup) ?? grupos[0];
              return (
                <div key={item.id} style={{ position: "relative" }}>
                  <button
                    onClick={() => { setDropdown(open ? null : item.id); setOpenSub(null); }}
                    style={{
                      display: "flex", alignItems: "center", gap: 4,
                      padding: "5px 12px", borderRadius: 6, border: "none",
                      background: ativo ? "rgba(255,255,255,0.20)" : open ? "rgba(255,255,255,0.10)" : "transparent",
                      cursor: "pointer", whiteSpace: "nowrap",
                      color: "#fff", fontWeight: ativo ? 600 : 400, fontSize: 13,
                    }}
                  >
                    {item.label}
                    <span style={{ fontSize: 7, color: "rgba(255,255,255,0.55)", transform: open ? "rotate(180deg)" : "none", transition: "transform 0.15s", display: "inline-block" }}>▼</span>
                  </button>

                  {open && (
                    <div style={{
                      position: "absolute", top: "calc(100% + 4px)", left: 0,
                      background: "#fff", borderRadius: 10,
                      border: "0.5px solid #D4DCE8",
                      boxShadow: "0 8px 28px rgba(0,0,0,0.14)",
                      zIndex: 1100, display: "flex", overflow: "hidden", minWidth: 360,
                    }}>
                      <div style={{ width: 160, background: "#F3F6F9", borderRight: "0.5px solid #D4DCE8", padding: "6px 0" }}>
                        {grupos.map(g => {
                          const sel = g.label === panelGroup;
                          const temAtivo = g.items.some(i => isAtivo(i.path));
                          return (
                            <div
                              key={g.label}
                              onMouseEnter={() => setPanelGroup(g.label)}
                              style={{
                                display: "flex", alignItems: "center", justifyContent: "space-between",
                                padding: "9px 14px", cursor: "default",
                                background: sel ? "#fff" : "transparent",
                                borderLeft: sel ? "3px solid #1A4870" : "3px solid transparent",
                                borderRight: sel ? "0.5px solid #fff" : "none",
                                marginRight: sel ? -1 : 0,
                              }}
                            >
                              <span style={{ fontSize: 13, fontWeight: sel || temAtivo ? 600 : 400, color: temAtivo ? "#1A4870" : "#333" }}>
                                {g.label}
                              </span>
                              <span style={{ fontSize: 9, color: sel ? "#1A4870" : "#666" }}>▶</span>
                            </div>
                          );
                        })}
                      </div>
                      <div style={{ flex: 1, padding: "6px 0", minWidth: 180 }}>
                        <div style={{ padding: "6px 14px 4px", fontSize: 10, fontWeight: 700, color: "#888", textTransform: "uppercase", letterSpacing: "0.07em" }}>
                          {grupoAtual?.label}
                        </div>
                        {grupoAtual?.items.map(child => {
                          const ativoChild = isAtivo(child.path);
                          return (
                            <Link
                              key={child.id}
                              href={child.path}
                              onClick={() => setDropdown(null)}
                              style={{
                                display: "flex", alignItems: "center",
                                padding: "8px 14px", textDecoration: "none", fontSize: 13,
                                color: ativoChild ? "#0B2D50" : "#222",
                                fontWeight: ativoChild ? 600 : 400,
                                background: ativoChild ? "#D5E8F5" : "transparent",
                                borderLeft: ativoChild ? "3px solid #1A4870" : "3px solid transparent",
                              }}
                            >
                              {child.label}
                            </Link>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              );
            }

            // ── Dropdown com subgroups ──
            return (
              <div key={item.id} style={{ position: "relative" }}>
                <button
                  onClick={() => { setDropdown(open ? null : item.id); setOpenSub(null); }}
                  style={{
                    display: "flex", alignItems: "center", gap: 4,
                    padding: "5px 12px", borderRadius: 6, border: "none",
                    background: ativo ? "rgba(255,255,255,0.20)" : open ? "rgba(255,255,255,0.10)" : "transparent",
                    cursor: "pointer", whiteSpace: "nowrap",
                    color: "#fff", fontWeight: ativo ? 600 : 400, fontSize: 13,
                  }}
                >
                  {item.label}
                  <span style={{ fontSize: 7, color: "rgba(255,255,255,0.55)", transform: open ? "rotate(180deg)" : "none", transition: "transform 0.15s", display: "inline-block" }}>▼</span>
                </button>

                {open && (
                  <div style={{
                    position: "absolute", top: "calc(100% + 4px)", left: 0,
                    background: "#fff", borderRadius: 10,
                    border: "0.5px solid #D4DCE8",
                    boxShadow: "0 8px 28px rgba(0,0,0,0.14)",
                    minWidth: 220, zIndex: 1100, padding: "6px 0",
                  }}>
                    {item.children.map((child, idx) => renderChild(child, idx))}
                  </div>
                )}
              </div>
            );
          }

          // ── Link simples ──
          const ativo = isAtivo((item as NavLink).path);
          return (
            <Link
              key={item.id}
              href={(item as NavLink).path}
              style={{
                display: "flex", alignItems: "center", gap: 5,
                padding: "5px 12px", borderRadius: 6, textDecoration: "none",
                background: ativo ? "rgba(255,255,255,0.20)" : "transparent",
                color: "#fff", fontWeight: ativo ? 600 : 400, fontSize: 13, whiteSpace: "nowrap",
              }}
            >
              {item.label}
            </Link>
          );
        })}

        {/* Pendências — visível sempre que houver ≥1 pendente */}
        {qtdPendencias > 0 && (
          <Link
            href="/pendencias/operacionais"
            style={{
              display: "flex", alignItems: "center", gap: 6,
              padding: "5px 12px", borderRadius: 6, textDecoration: "none",
              background: pathname.startsWith("/pendencias") ? "rgba(255,255,255,0.20)" : "rgba(245,158,11,0.18)",
              color: "#FDE9BB", fontWeight: 600, fontSize: 13, whiteSpace: "nowrap",
              border: "0.5px solid rgba(245,158,11,0.55)",
            }}
          >
            Pendências
            <span style={{
              background: "#F59E0B", color: "#1a1a1a", borderRadius: 20,
              fontSize: 10, fontWeight: 800, padding: "1px 6px", lineHeight: 1.5,
            }}>
              {qtdPendencias}
            </span>
          </Link>
        )}

        {(userRole === "raccotlo" || userRole === "raccotlo_gestor" || userRole === "raccotlo_seletor") && (
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginLeft: "auto" }}>
            {raccotloGestor && (
              <Link
                href="/admin"
                style={{
                  display: "flex", alignItems: "center", gap: 5,
                  padding: "5px 14px", borderRadius: 6, textDecoration: "none",
                  background: pathname.startsWith("/admin") ? "rgba(255,255,255,0.22)" : "rgba(201,146,27,0.30)",
                  color: "#FDE9BB", fontWeight: pathname.startsWith("/admin") ? 700 : 600,
                  fontSize: 13, whiteSpace: "nowrap",
                  border: "0.5px solid rgba(201,146,27,0.6)",
                }}
              >
                ⚙ Gestão Arato
              </Link>
            )}
            {raccotloGestor && (
              <Link
                href="/bi"
                style={{
                  display: "flex", alignItems: "center", gap: 5,
                  padding: "5px 12px", borderRadius: 6, textDecoration: "none",
                  background: pathname === "/bi" ? "rgba(255,255,255,0.20)" : "rgba(255,255,255,0.08)",
                  color: "#FDE9BB", fontWeight: pathname === "/bi" ? 700 : 400,
                  fontSize: 13, whiteSpace: "nowrap",
                  border: "0.5px solid rgba(255,255,255,0.2)",
                }}
              >
                BI Raccotlo
              </Link>
            )}
            {(userRole === "raccotlo" || userRole === "raccotlo_gestor" || userRole === "raccotlo_seletor") && (
              <Link
                href="/raccotlo"
                style={{
                  display: "flex", alignItems: "center", gap: 5,
                  padding: "5px 12px", borderRadius: 6, textDecoration: "none",
                  background: pathname === "/raccotlo" ? "rgba(255,255,255,0.20)" : "rgba(255,255,255,0.06)",
                  color: "rgba(255,255,255,0.55)", fontWeight: 400,
                  fontSize: 12, whiteSpace: "nowrap",
                  border: "0.5px solid rgba(255,255,255,0.12)",
                }}
              >
                Hub
              </Link>
            )}
          </div>
        )}
      </nav>
    </header>
  );
}
