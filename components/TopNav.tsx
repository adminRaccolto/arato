"use client";
import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "./AuthProvider";
import { supabase } from "../lib/supabase";
import type { Fazenda } from "../lib/supabase";


// ─── Tipos ───────────────────────────────────────────────────
type NavLink     = { type?: "link";     id: string; label: string; path: string };
type NavDivider  = { type: "divider";   label: string };
type NavSubgroup = { type: "subgroup";  id: string; label: string; children: NavLink[] };
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

  {
    type: "group", id: "cadastros", label: "Cadastros", panel: true, minStep: 0,
    children: [
      { type: "divider", label: "Gerais" },
      { id: "cad-produtores",   label: "Produtores",            path: "/cadastros?tab=produtores"   },
      { id: "cad-empresas",     label: "Empresas",              path: "/cadastros?tab=empresas"     },
      { id: "cad-fazendas",     label: "Fazendas & Talhões",    path: "/cadastros?tab=fazendas"     },
      { id: "cad-funcionarios", label: "Funcionários",          path: "/cadastros?tab=funcionarios" },
      { id: "cad-pessoas",      label: "Pessoas",               path: "/cadastros?tab=pessoas"      },
      { type: "divider", label: "Técnicos" },
      { id: "cad-safras",       label: "Safras",                path: "/cadastros?tab=safras"       },
      { id: "cad-insumos",      label: "Insumos",               path: "/cadastros?tab=insumos"      },
      { id: "cad-depositos",    label: "Depósitos & Armazéns",  path: "/cadastros?tab=depositos"    },
      { id: "cad-maquinas",     label: "Máquinas",              path: "/cadastros?tab=maquinas"     },
      { id: "cad-combustivel",  label: "Combustíveis & Bombas", path: "/cadastros?tab=combustivel"  },
      { id: "cad-grupos-insumo",   label: "Grupos de Insumos",        path: "/cadastros?tab=grupos_insumo"         },
      { id: "cad-padroes-class",   label: "Padrões de Classificação", path: "/cadastros?tab=padroes_classificacao" },
      { type: "divider", label: "Financeiro" },
      { id: "cad-contas-bancarias", label: "Contas Bancárias",        path: "/cadastros?tab=contas_bancarias"      },
    ],
  },

  {
    type: "group", id: "comercial", label: "Comercial", minStep: 4,
    children: [
      { id: "com-contratos",     label: "Contratos de Grãos",       path: "/contratos"              },
      { id: "com-arrendamentos", label: "Contratos de Arrendamento", path: "/contratos/arrendamento" },
      { id: "com-expedicao",     label: "Expedição de Grãos",        path: "/expedicao"              },
    ],
  },

  {
    type: "group", id: "transporte", label: "Transporte", minStep: 7,
    children: [
      { id: "transp-cte",  label: "CT-e — Conhecimento de Transporte", path: "/transporte/cte"  },
      { id: "transp-mdfe", label: "MDF-e — Manifesto de Cargas",       path: "/transporte/mdfe" },
    ],
  },

  {
    type: "group", id: "compras-estoque", label: "Compras & Estoque", minStep: 5,
    children: [
      { id: "comp-pedidos",  label: "Pedidos de Compra",  path: "/compras"  },
      {
        type: "subgroup", id: "sg-entrada-nf", label: "Entrada de Notas Fiscais",
        children: [
          { id: "comp-nf",         label: "NF de Produtos", path: "/compras/nf"         },
          { id: "comp-nf-servico", label: "NF de Serviços", path: "/compras/nf-servico" },
        ],
      },
      { id: "comp-estoque",       label: "Posição de Estoque",        path: "/estoque"                },
      { id: "comp-abastecimento", label: "Abastecimento de Máquinas", path: "/estoque/abastecimento"  },
    ],
  },

  {
    type: "group", id: "financeiro", label: "Financeiro", minStep: 6,
    children: [
      { id: "fin-pagar",   label: "Contas a Pagar",   path: "/financeiro/pagar"   },
      { id: "fin-receber", label: "Contas a Receber",  path: "/financeiro/receber" },
      {
        type: "subgroup", id: "sg-tesouraria", label: "Tesouraria",
        children: [
          { id: "fin-lanc-tesouraria", label: "Lançamento de Tesouraria", path: "/financeiro/tesouraria"           },
          { id: "fin-op-tesouraria",   label: "Operações de Tesouraria",  path: "/financeiro/tesouraria/operacoes" },
          { id: "fin-mutuo",           label: "Mútuos entre Empresas",    path: "/financeiro/tesouraria/mutuo"     },
          { id: "fin-conciliacao",     label: "Conciliação Bancária",     path: "/financeiro/conciliacao"          },
          { id: "fin-contratos",       label: "Contratos Financeiros",    path: "/financeiro/contratos"            },
        ],
      },
      {
        type: "subgroup", id: "sg-fin-relatorios", label: "Relatórios",
        children: [
          { id: "fin-fluxo",   label: "Fluxo de Caixa",      path: "/financeiro/relatorios?aba=fluxo"   },
          { id: "fin-cpcr",    label: "CP / CR — Contas",     path: "/financeiro/relatorios?aba=cpcr"    },
          { id: "fin-dfc",     label: "DFC — Demonstrativo",  path: "/financeiro/relatorios?aba=dfc"     },
          { id: "fin-posicao", label: "Posição por Conta",    path: "/financeiro/relatorios?aba=posicao" },
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
      { type: "divider", label: "Planejamento" },
      { id: "lav-planejamento", label: "Planejamento de Safra", path: "/lavoura/planejamento"        },
      { type: "divider", label: "Monitoramento" },
      { id: "lav-pragas",         label: "Pragas & Doenças",     path: "/lavoura/pragas"                },
      { type: "divider", label: "Relatórios" },
      { id: "lav-rel-aplicacoes", label: "Aplicações por Ciclo", path: "/lavoura/relatorios/aplicacoes" },
    ],
  },

  {
    type: "group", id: "fiscal", label: "Fiscal", minStep: 7,
    children: [
      {
        type: "subgroup", id: "sg-notas-saida", label: "Notas de Saída",
        children: [
          { id: "fiscal-venda",        label: "Notas de Venda",       path: "/fiscal?aba=venda"        },
          { id: "fiscal-devolucao",    label: "Nota de Devolução",    path: "/fiscal?aba=devolucao"    },
          { id: "fiscal-cancelamento", label: "Cancelamento de Nota", path: "/fiscal?aba=cancelamento" },
          { id: "fiscal-complemento",  label: "Nota de Complemento",  path: "/fiscal?aba=complemento" },
        ],
      },
      {
        type: "subgroup", id: "sg-notas-entrada", label: "Notas de Entrada",
        children: [
          { id: "fiscal-manifestacao", label: "Manifestação do Destinatário", path: "/fiscal/manifestacao" },
        ],
      },
      { id: "fiscal-pendencias", label: "Pendências Fiscais", path: "/fiscal/pendencias" },
      {
        type: "subgroup", id: "sg-obrigacoes", label: "Obrigações Acessórias",
        children: [
          { id: "fiscal-lcdpr",        label: "LCDPR",               path: "/lcdpr"                },
          { id: "fiscal-sped-contabil",label: "SPED ECD — Contábil", path: "/fiscal/sped-contabil" },
          { id: "fiscal-ibs",          label: "IBS / CBS — 2027",    path: "/ibs"                  },
        ],
      },
      { id: "fiscal-certificado", label: "Certificado Digital", path: "/fiscal?aba=certificado" },
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
      { type: "divider", label: "Cadastro" },
      { id: "conf-empresa",     label: "Empresa",        path: "/configuracoes?tab=empresa"     },
      { id: "conf-certificado", label: "Certificado A1", path: "/configuracoes?tab=certificado" },
      {
        type: "subgroup", id: "sg-parametros", label: "Parâmetros",
        children: [
          { id: "conf-modulos",       label: "Parâmetros do Sistema",    path: "/configuracoes/modulos"          },
          { id: "conf-plano-contas",  label: "Plano de Contas",          path: "/configuracoes?tab=plano_contas" },
          { id: "conf-classificacao", label: "Classificação Automática", path: "/configuracoes/classificacao"    },
          { id: "conf-op-fiscais",    label: "Operações Fiscais",        path: "/configuracoes/modulos?aba=operacoes" },
          { id: "conf-op-gerenciais", label: "Operações Gerenciais",     path: "/cadastros?tab=operacoes_gerenciais" },
          { id: "conf-formas-pgto",   label: "Formas de Pagamento",      path: "/cadastros?tab=formas_pagamento"     },
        ],
      },
      {
        type: "subgroup", id: "sg-contabilidade-conf", label: "Contabilidade",
        children: [
          { id: "conf-contabilidade", label: "Configuração Contábil", path: "/configuracoes/contabilidade" },
        ],
      },
      { id: "conf-automacoes",   label: "Automações",           path: "/configuracoes/automacoes"  },
      { id: "conf-backup",       label: "Backup & Restauração", path: "/configuracoes/backup"      },
      { id: "conf-importacao",   label: "Importações",          path: "/configuracoes/importacao"  },
      { type: "divider", label: "Ferramentas do Sistema" },
      { id: "conf-usuarios", label: "Usuários & Permissões", path: "/admin/usuarios" },
      { id: "conf-logs",     label: "Log do Sistema",        path: "/admin/logs"     },
      { id: "conf-manual",   label: "Manual do Proprietário", path: "/admin/manual"  },
    ],
  },

  {
    type: "group", id: "ajuda", label: "Ajuda", minStep: 0,
    children: [
      { id: "ajuda-learning",   label: "Aprendizado",  path: "/learning"   },
      { id: "ajuda-controller", label: "Controller",   path: "/controller" },
      { id: "ajuda-suporte",    label: "Suporte IA",   path: "/suporte"    },
    ],
  },
];

// ─── Componente ──────────────────────────────────────────────
interface TopNavProps { automacoesAtivas?: number }

export default function TopNav({ automacoesAtivas = 5 }: TopNavProps) {
  const [dropdown,         setDropdown]         = useState<string | null>(null);
  const [openSub,          setOpenSub]          = useState<string | null>(null);
  const [panelGroup,       setPanelGroup]        = useState<string>("Imóvel Rural");
  const [fazenda,          setFazenda]          = useState<Fazenda | null>(null);
  const [logoArato,        setLogoArato]        = useState<string | null>(null);
  const [nomeArato,        setNomeArato]        = useState("Arato");
  const [logoFazenda,      setLogoFazenda]      = useState<string | null>(null);
  const [fazendas,         setFazendas]         = useState<Fazenda[]>([]);
  const [farmSwitcherOpen, setFarmSwitcherOpen] = useState(false);

  const pathname = usePathname();
  const { fazendaId, contaId, nomeUsuario, signOut, userRole, nomeFazendaSelecionada, clearFazenda, setFazendaAtiva, onboardingAtivo, stepsCompletos } = useAuth();
  const navRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!fazendaId) return;
    supabase.from("fazendas").select("*").eq("id", fazendaId).single()
      .then(({ data }) => { if (data) setFazenda(data); });
  }, [fazendaId]);

  useEffect(() => {
    if (!contaId) return;
    supabase.from("fazendas").select("*").eq("conta_id", contaId).order("nome")
      .then(({ data }) => { if (data) setFazendas(data); });
  }, [contaId]);

  useEffect(() => {
    // Logo do sistema: lida do Supabase Storage (bucket "logos", arquivo "arato.png")
    // Para trocar a logo: Supabase → Storage → logos → fazer upload do novo arquivo com o mesmo nome
    const { data } = supabase.storage.from("logos").getPublicUrl("arato.png");
    if (data?.publicUrl) setLogoArato(data.publicUrl);
  }, []);

  useEffect(() => {
    if (!fazendaId) return;
    const lf = localStorage.getItem(`fazenda_logo_${fazendaId}`);
    if (lf) setLogoFazenda(lf);
  }, [fazendaId]);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (navRef.current && !navRef.current.contains(e.target as Node)) {
        setDropdown(null);
        setOpenSub(null);
        setFarmSwitcherOpen(false);
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
    if (item.id === "comercial")       return pathname === "/contratos" || pathname.startsWith("/expedicao") || pathname.startsWith("/contratos");
    if (item.id === "transporte")      return pathname.startsWith("/transporte");
    if (item.id === "compras-estoque") return pathname.startsWith("/compras") || pathname === "/estoque";
    if (item.id === "financeiro")      return pathname.startsWith("/financeiro");
    if (item.id === "lavoura")         return pathname.startsWith("/lavoura");
    if (item.id === "fiscal")          return pathname === "/fiscal" || pathname === "/lcdpr" || pathname === "/ibs" || pathname.startsWith("/fiscal");
    if (item.id === "custos")          return pathname.startsWith("/custos") || pathname.startsWith("/relatorios/dre");
    if (item.id === "configuracoes")   return pathname.startsWith("/configuracoes") || pathname.startsWith("/admin");
    if (item.id === "ajuda")           return pathname === "/learning" || pathname === "/controller" || pathname === "/suporte";
    return false;
  };

  // Verifica se algum link dentro de um subgroup está ativo
  const subgroupAtivo = (sg: NavSubgroup) => sg.children.some(c => isAtivo(c.path));

  const iniciaisFazenda = fazenda
    ? fazenda.nome.split(" ").slice(0, 2).map(w => w[0]).join("").toUpperCase()
    : "—";

  // ── Renderiza item do dropdown (link, divider ou subgroup) ──
  function renderChild(child: NavChild, idx: number) {
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
            display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "8px 14px", cursor: "default", gap: 24,
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
            <div style={{
              position: "absolute", top: -6, left: "100%",
              background: "#fff", borderRadius: 10,
              border: "0.5px solid #D4DCE8",
              boxShadow: "0 8px 28px rgba(0,0,0,0.14)",
              minWidth: 210, zIndex: 300, padding: "6px 0",
              marginLeft: 4,
            }}>
              <div style={{ padding: "6px 14px 4px", fontSize: 10, fontWeight: 700, color: "#888", textTransform: "uppercase", letterSpacing: "0.07em" }}>
                {sg.label}
              </div>
              {sg.children.map(gc => {
                const ativoGc = isAtivo(gc.path);
                return (
                  <Link
                    key={gc.id}
                    href={gc.path}
                    onClick={() => { setDropdown(null); setOpenSub(null); }}
                    style={{
                      display: "flex", alignItems: "center",
                      padding: "8px 14px", textDecoration: "none", fontSize: 13,
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
        position: "sticky", top: 0, zIndex: 100, flexShrink: 0,
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
          {fazenda && (
            <div style={{ position: "relative" }}>
              <div
                style={{ display: "flex", alignItems: "center", gap: 10, cursor: fazendas.length > 1 ? "pointer" : "default", borderRadius: 8, padding: "4px 8px", background: farmSwitcherOpen ? "#F3F6F9" : "transparent" }}
                onClick={() => fazendas.length > 1 && setFarmSwitcherOpen(o => !o)}
              >
                {logoFazenda ? (
                  <img src={logoFazenda} alt="Logo fazenda" style={{ width: 36, height: 36, borderRadius: 9, objectFit: "contain", border: "0.5px solid #D4DCE8" }} />
                ) : (
                  <div style={{ width: 36, height: 36, borderRadius: 9, background: "#F3F6F9", border: "0.5px solid #D4DCE8", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700, color: "#1A4870" }}>
                    {iniciaisFazenda}
                  </div>
                )}
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "#1a1a1a", lineHeight: 1.25 }}>{fazenda.nome}</div>
                  <div style={{ fontSize: 11, color: "#666" }}>
                    {fazenda.municipio} · {fazenda.estado}
                    {fazenda.area_total_ha ? ` · ${fazenda.area_total_ha.toLocaleString("pt-BR")} ha` : ""}
                  </div>
                </div>
                {fazendas.length > 1 && (
                  <span style={{ fontSize: 10, color: "#888", transform: farmSwitcherOpen ? "rotate(180deg)" : "rotate(0)", transition: "transform 0.15s" }}>▼</span>
                )}
              </div>
              {farmSwitcherOpen && fazendas.length > 1 && (
                <div style={{ position: "absolute", top: "calc(100% + 4px)", left: 0, background: "#fff", border: "0.5px solid #D4DCE8", borderRadius: 10, boxShadow: "0 4px 16px rgba(0,0,0,0.10)", minWidth: 220, zIndex: 200, overflow: "hidden" }}>
                  <div style={{ padding: "6px 12px 4px", fontSize: 10, color: "#888", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.5px" }}>Trocar fazenda</div>
                  {fazendas.map(f => (
                    <div
                      key={f.id}
                      onClick={() => { setFazendaAtiva(f.id, f.nome); setFarmSwitcherOpen(false); }}
                      style={{ padding: "8px 14px", cursor: "pointer", display: "flex", alignItems: "center", gap: 8, background: f.id === fazendaId ? "#EAF3FB" : "transparent" }}
                      onMouseEnter={e => (e.currentTarget.style.background = f.id === fazendaId ? "#EAF3FB" : "#F3F6F9")}
                      onMouseLeave={e => (e.currentTarget.style.background = f.id === fazendaId ? "#EAF3FB" : "transparent")}
                    >
                      <div style={{ width: 28, height: 28, borderRadius: 7, background: "#F3F6F9", border: "0.5px solid #D4DCE8", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 700, color: "#1A4870", flexShrink: 0 }}>
                        {f.nome.split(" ").slice(0, 2).map(w => w[0]).join("").toUpperCase()}
                      </div>
                      <div>
                        <div style={{ fontSize: 12, fontWeight: f.id === fazendaId ? 700 : 500, color: "#1a1a1a" }}>{f.nome}</div>
                        <div style={{ fontSize: 10, color: "#666" }}>{f.municipio} · {f.estado}</div>
                      </div>
                      {f.id === fazendaId && <span style={{ marginLeft: "auto", fontSize: 10, color: "#1A4870" }}>✓</span>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          <div style={{ width: 1, height: 32, background: "#D4DCE8" }} />

          {/* Badge "Acessando como Raccolto" */}
          {userRole === "raccotlo" && nomeFazendaSelecionada && (
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{
                background: "#FBF3E0", border: "0.5px solid #C9921B",
                borderRadius: 6, padding: "4px 10px",
                fontSize: 11, color: "#7A5A12", fontWeight: 600,
                display: "flex", alignItems: "center", gap: 6,
              }}>
                <span style={{ opacity: 0.7 }}>Acessando:</span>
                <span>{nomeFazendaSelecionada}</span>
              </div>
              <button
                onClick={clearFazenda}
                style={{
                  background: "none", border: "0.5px solid #C9921B",
                  borderRadius: 6, padding: "4px 10px", cursor: "pointer",
                  fontSize: 11, color: "#7A5A12", fontWeight: 600,
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
                      zIndex: 200, display: "flex", overflow: "hidden", minWidth: 360,
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
                    minWidth: 220, zIndex: 200, padding: "6px 0",
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

        {userRole === "raccotlo" && (
          <Link
            href="/bi"
            style={{
              display: "flex", alignItems: "center", gap: 5,
              padding: "5px 12px", borderRadius: 6, textDecoration: "none",
              background: pathname === "/bi" ? "rgba(255,255,255,0.20)" : "rgba(201,146,27,0.25)",
              color: "#FDE9BB", fontWeight: pathname === "/bi" ? 700 : 600,
              fontSize: 13, whiteSpace: "nowrap",
              border: "0.5px solid rgba(201,146,27,0.5)",
              marginLeft: "auto",
            }}
          >
            BI Raccotlo
          </Link>
        )}
      </nav>
    </header>
  );
}
