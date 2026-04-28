"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "./AuthProvider";
import { supabase } from "../lib/supabase";
import type { Fazenda } from "../lib/supabase";

type NavItem =
  | { type?: "link";  id: string; label: string; icon: string; path: string; badge?: number }
  | { type: "group"; id: string; label: string; icon: string; children: { id: string; label: string; path: string }[] };

const navItems: NavItem[] = [
  { id: "dashboard",     label: "Dashboard",    icon: "▦", path: "/" },
  {
    type: "group",
    id: "lavoura",
    label: "Lavoura",
    icon: "❧",
    children: [
      { id: "lav-correcao",       label: "Correção de Solo",      path: "/lavoura/correcao"         },
      { id: "lav-adubacao",       label: "Adubação de Base",      path: "/lavoura/adubacao"         },
      { id: "lav-plantio",        label: "Plantio",               path: "/lavoura/plantio"          },
      { id: "lav-pulverizacao",   label: "Pulverização",          path: "/lavoura/pulverizacao"     },
      { id: "lav-colheita",       label: "Colheita Própria",      path: "/lavoura/colheita"         },
    ],
  },
  {
    type: "group",
    id: "financeiro",
    label: "Financeiro",
    icon: "◈",
    children: [
      { id: "fin-receber",   label: "Contas a Receber",     path: "/financeiro/receber"  },
      { id: "fin-pagar",     label: "Contas a Pagar",       path: "/financeiro/pagar"    },
      { id: "fin-fluxo",     label: "Fluxo de Caixa",       path: "/financeiro"          },
      { id: "fin-contratos", label: "Contratos Financeiros", path: "/financeiro/contratos" },
    ],
  },
  { id: "estoque",       label: "Estoque",      icon: "▣", path: "/estoque" },
  { id: "fiscal",        label: "Fiscal / NF-e",icon: "◉", path: "/fiscal" },
  { id: "relatorios",    label: "Relatórios",   icon: "▤", path: "/relatorios" },
  {
    type: "group",
    id: "cadastros",
    label: "Cadastros",
    icon: "▧",
    children: [
      { id: "cad-auxiliares",   label: "Tabelas Auxiliares", path: "/cadastros?tab=auxiliares"  },
      { id: "cad-produtores",   label: "Produtores",         path: "/cadastros?tab=produtores"  },
      { id: "cad-fazendas",     label: "Fazendas",           path: "/cadastros?tab=fazendas"    },
      { id: "cad-pessoas",      label: "Pessoas",            path: "/cadastros?tab=pessoas"     },
      { id: "cad-insumos",      label: "Insumos",            path: "/cadastros?tab=insumos"     },
      { id: "cad-safras",       label: "Safras & Ciclos",    path: "/cadastros?tab=safras"      },
      { id: "cad-maquinas",     label: "Máquinas",           path: "/cadastros?tab=maquinas"    },
      { id: "cad-combustivel",  label: "Combustíveis",       path: "/cadastros?tab=combustivel" },
      { id: "cad-funcionarios", label: "Funcionários",       path: "/cadastros?tab=funcionarios"},
      { id: "cad-usuarios",     label: "Usuários",           path: "/cadastros?tab=usuarios"    },
      { id: "cad-depositos",    label: "Depósitos",          path: "/cadastros?tab=depositos"   },
    ],
  },
  { id: "automacoes",    label: "Automações",   icon: "⟳", path: "/automacoes" },
  { id: "configuracoes", label: "Configurações",icon: "◎", path: "/configuracoes" },
];

interface SidebarProps {
  automacoesAtivas?: number;
}

export default function Sidebar({ automacoesAtivas = 5 }: SidebarProps) {
  const [aberto, setAberto]               = useState(true);
  const [gruposAbertos, setGruposAbertos] = useState<Set<string>>(new Set(["cadastros", "financeiro", "lavoura"]));
  const [fazenda, setFazenda]             = useState<Fazenda | null>(null);
  const pathname = usePathname();
  const { fazendaId, nomeUsuario, signOut } = useAuth();

  useEffect(() => {
    if (!fazendaId) return;
    async function loadFazenda() {
      const { data } = await supabase.from("fazendas").select("*").eq("id", fazendaId).single();
      if (data) setFazenda(data);
    }
    loadFazenda();
  }, [fazendaId]);

  const toggleGrupo = (id: string) =>
    setGruposAbertos(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s; });

  const isAtivo = (path: string) => {
    const [p, q] = path.split("?");
    if (q) {
      const tab = new URLSearchParams(q).get("tab");
      const currentTab = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("tab") : null;
      return pathname === p && currentTab === tab;
    }
    return pathname === path;
  };

  const grupoAtivo = (item: Extract<NavItem, { type: "group" }>) => {
    if (item.id === "cadastros") return pathname === "/cadastros" || item.children.some(c => isAtivo(c.path));
    if (item.id === "financeiro") return pathname.startsWith("/financeiro") || item.children.some(c => isAtivo(c.path));
    if (item.id === "lavoura") return pathname.startsWith("/lavoura") || item.children.some(c => isAtivo(c.path));
    return item.children.some(c => isAtivo(c.path));
  };

  return (
    <aside style={{
      width: aberto ? 220 : 52,
      background: "#ffffff",
      borderRight: "0.5px solid #D4DCE8",
      display: "flex",
      flexDirection: "column",
      transition: "width 0.18s",
      overflow: "hidden",
      flexShrink: 0,
    }}>
      {/* Logo */}
      <div style={{ padding: "14px 12px", borderBottom: "0.5px solid #D4DCE8", display: "flex", alignItems: "center", gap: 10 }}>
        <div style={{
          width: 30, height: 30, background: "#1A4870", borderRadius: 7,
          display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
        }}>
          <span style={{ color: "#fff", fontWeight: 600, fontSize: 13 }}>RT</span>
        </div>
        {aberto && <span style={{ fontWeight: 600, fontSize: 15, color: "#1a1a1a" }}>Arato</span>}
        <button
          onClick={() => setAberto(a => !a)}
          style={{ marginLeft: "auto", background: "none", border: "none", cursor: "pointer", color: "#555", fontSize: 16, padding: 0, flexShrink: 0 }}
        >
          {aberto ? "←" : "→"}
        </button>
      </div>

      {/* Fazenda ativa */}
      {aberto && fazenda && (
        <div style={{ padding: "8px 12px 10px", borderBottom: "0.5px solid #D4DCE8" }}>
          <div style={{ fontSize: 10, color: "#444", marginBottom: 2, textTransform: "uppercase", letterSpacing: "0.05em" }}>
            Fazenda ativa
          </div>
          <div style={{ fontSize: 13, fontWeight: 600, color: "#1a1a1a" }}>{fazenda.nome}</div>
          <div style={{ fontSize: 11, color: "#555" }}>
            {fazenda.municipio} · {fazenda.estado} · {(fazenda.area_total_ha ?? 0).toLocaleString("pt-BR")} ha
          </div>
        </div>
      )}

      {/* Nav */}
      <nav style={{ flex: 1, padding: "6px 0", overflowY: "auto" }}>
        {navItems.map(item => {
          if (item.type === "group") {
            const expanded = gruposAbertos.has(item.id);
            const ativo    = grupoAtivo(item);
            return (
              <div key={item.id}>
                {/* Cabeçalho do grupo */}
                <button
                  onClick={() => toggleGrupo(item.id)}
                  style={{
                    width: "100%", display: "flex", alignItems: "center",
                    gap: 10, padding: aberto ? "9px 14px" : "9px 16px",
                    background: ativo ? "#D5E8F5" : "transparent",
                    border: "none",
                    borderLeft: ativo ? "2px solid #1A4870" : "2px solid transparent",
                    cursor: "pointer",
                    color: ativo ? "#0B2D50" : "#666",
                    fontWeight: ativo ? 600 : 400,
                    fontSize: 13, textAlign: "left",
                  }}
                >
                  <span style={{ fontSize: 14, flexShrink: 0 }}>{item.icon}</span>
                  {aberto && (
                    <>
                      <span style={{ flex: 1 }}>{item.label}</span>
                      <span style={{
                        fontSize: 10, color: ativo ? "#0B2D50" : "#444",
                        transform: expanded ? "rotate(90deg)" : "rotate(0deg)",
                        transition: "transform 0.15s", display: "inline-block",
                      }}>▶</span>
                    </>
                  )}
                </button>

                {/* Sub-itens */}
                {aberto && expanded && (
                  <div style={{ background: "#F8FAFD", borderBottom: "0.5px solid #DEE5EE" }}>
                    {item.children.map(child => {
                      const ativoChild = isAtivo(child.path);
                      return (
                        <Link
                          key={child.id}
                          href={child.path}
                          style={{
                            display: "flex", alignItems: "center",
                            gap: 8, padding: "7px 14px 7px 36px",
                            background: ativoChild ? "#D5E8F5" : "transparent",
                            borderLeft: ativoChild ? "2px solid #1A4870" : "2px solid transparent",
                            textDecoration: "none",
                            color: ativoChild ? "#0B2D50" : "#444",
                            fontWeight: ativoChild ? 600 : 400,
                            fontSize: 12,
                          }}
                        >
                          <span style={{ fontSize: 10, color: ativoChild ? "#1A4870" : "#666" }}>◆</span>
                          {child.label}
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          }

          // Item normal
          const ativa = isAtivo(item.path);
          return (
            <Link
              key={item.id}
              href={item.path}
              style={{
                display: "flex", alignItems: "center",
                gap: 10, padding: aberto ? "9px 14px" : "9px 16px",
                background: ativa ? "#D5E8F5" : "transparent",
                borderLeft: ativa ? "2px solid #1A4870" : "2px solid transparent",
                textDecoration: "none",
                color: ativa ? "#0B2D50" : "#666",
                fontWeight: ativa ? 600 : 400,
                fontSize: 13,
              }}
            >
              <span style={{ fontSize: 14, flexShrink: 0 }}>{item.icon}</span>
              {aberto && item.label}
              {aberto && item.id === "automacoes" && (
                <span style={{
                  marginLeft: "auto", background: "#1A4870", color: "#fff",
                  fontSize: 10, padding: "1px 6px", borderRadius: 10,
                }}>
                  {automacoesAtivas}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      {/* Usuário */}
      <div style={{ padding: "10px 12px", borderTop: "0.5px solid #D4DCE8", display: "flex", alignItems: "center", gap: 8 }}>
        <div style={{
          width: 28, height: 28, background: "#FDE9BB", borderRadius: "50%",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 11, fontWeight: 600, color: "#7A5A12", flexShrink: 0,
        }}>
          {nomeUsuario ? nomeUsuario.substring(0, 2).toUpperCase() : "—"}
        </div>
        {aberto && (
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12, color: "#1a1a1a", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {nomeUsuario ?? "Usuário"}
            </div>
          </div>
        )}
        {aberto && (
          <button
            onClick={signOut}
            title="Sair"
            style={{ background: "none", border: "none", cursor: "pointer", color: "#444", fontSize: 14, padding: 0, flexShrink: 0 }}
          >
            ⎋
          </button>
        )}
      </div>
    </aside>
  );
}
