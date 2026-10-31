"use client";
import { useState, useEffect, useRef } from "react";
import { useAuth } from "./AuthProvider";
import { hasClientWorkspace } from "../lib/layout-preferences";
import { NAV, type NavLink } from "../lib/navigation";
import { usePathname, useRouter } from "next/navigation";

// ─── Catálogo de itens disponíveis para atalho ────────────────────────────────
export type ItemAtalho = { id: string; emoji: string; label: string; path: string; grupo: string };

// Catálogo montado do MENU ATUAL (lib/navigation.ts) — antes era uma lista fixa antiga, com telas que mudaram de lugar
// (ex.: "NF de Produtos" em /compras/nf, "NF-e de Saída" em /comercial/faturamento). Achado 31/10/2026.
const EMOJI_GRUPO: Record<string, string> = {
  cadastros: "👥", producao: "🌱", "documentos-fiscais": "📄", comercial: "🌾", financeiro: "💰",
  fiscal: "📑", resultados: "📊", configuracoes: "⚙️", ajuda: "❓",
};
// Atalhos da lista antiga: id antigo → [endereço, emoji]. Usado para migrar atalhos já salvos e manter o emoji conhecido.
const LEGADO: Record<string, [string, string]> = {
  "cp": ["/financeiro/pagar", "💸"],
  "cr": ["/financeiro/receber", "💰"],
  "fluxo": ["/financeiro/relatorios", "📈"],
  "contratos-fin": ["/financeiro/contratos", "🏦"],
  "concil": ["/financeiro/conciliacao", "🔄"],
  "cartoes": ["/financeiro/cartoes", "💳"],
  "endivid": ["/financeiro/endividamento", "📊"],
  "nf": ["/fiscal/documentos", "📄"],
  "pedidos": ["/compras", "🛒"],
  "estoque": ["/estoque", "📦"],
  "kardex": ["/estoque/kardex", "📋"],
  "abastec": ["/estoque/abastecimento", "⛽"],
  "contratos": ["/contratos", "🌾"],
  "expedicao": ["/expedicao", "🚛"],
  "balanca": ["/balanca/pesagem-avulsa", "⚖️"],
  "romaneios": ["/estoque/romaneio-entrada", "📃"],
  "plantio": ["/lavoura/plantio", "🌱"],
  "pulv": ["/lavoura/pulverizacao", "💧"],
  "colheita": ["/lavoura/colheita", "🌾"],
  "mapa": ["/mapa", "🗺️"],
  "pluviom": ["/lavoura/pluviometria", "🌧️"],
  "manut": ["/relatorios/manutencao", "🔧"],
  "dre": ["/custos?aba=dre", "📉"],
  "bi": ["/bi", "🔭"],
  "custos": ["/custos?aba=custoha", "🧮"],
  "nfe-saida": ["/comercial/faturamento", "📤"],
  "lcdpr": ["/lcdpr", "📑"],
  "pessoas": ["/cadastros?tab=pessoas", "👥"],
  "insumos": ["/cadastros?tab=insumos", "🧪"],
};
const EMOJI_POR_PATH = new Map(Object.values(LEGADO).map(([path, emoji]) => [path, emoji]));

function montarCatalogo(): ItemAtalho[] {
  const out: ItemAtalho[] = [];
  for (const n of NAV) {
    if (n.type !== "group") {
      if (n.path && n.path !== "/") out.push({ id: n.id, emoji: EMOJI_POR_PATH.get(n.path) ?? "⭐", label: n.label, path: n.path, grupo: "Geral" });
      continue;
    }
    const links = n.children.flatMap(c => c.type === "divider" ? [] : c.type === "subgroup" ? c.children : [c as NavLink]);
    for (const l of links) if (l.path && !l.disabled && !out.some(o => o.id === l.id))
      out.push({ id: l.id, emoji: EMOJI_POR_PATH.get(l.path) ?? EMOJI_GRUPO[n.id] ?? "•", label: l.label, path: l.path, grupo: n.label });
  }
  return out;
}
export const CATALOGO_ATALHOS: ItemAtalho[] = montarCatalogo();

/** Atalho salvo com id da lista antiga → o item do menu atual com o mesmo endereço (ou some, se a tela não existe mais). */
function migrarId(id: string): string | null {
  if (CATALOGO_ATALHOS.some(i => i.id === id)) return id;
  const path = LEGADO[id]?.[0];
  if (!path) return null;
  const base = (x: string) => x.split("?")[0];
  return (CATALOGO_ATALHOS.find(i => i.path === path) ?? CATALOGO_ATALHOS.find(i => base(i.path) === base(path)))?.id ?? null;
}

const STORAGE_KEY    = "arato-atalhos-v2";   // array de ids
const STORAGE_EXPAND = "arato-sidebar-exp";  // "1" | "0"
const STORAGE_VIS    = "arato-sidebar-vis";  // "1" | "0" — ativa ou oculta

const DEFAULTS = ["cp", "cr", "nf", "contratos", "estoque", "plantio"].map(migrarId).filter((x): x is string => !!x);

function lerAtalhos(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULTS;
    const ids = JSON.parse(raw) as string[];
    return Array.isArray(ids) ? [...new Set(ids.map(migrarId).filter((x): x is string => !!x))] : DEFAULTS;
  } catch { return DEFAULTS; }
}

function salvarAtalhos(ids: string[]) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(ids)); } catch { /* noop */ }
}

// ═══════════════════════════════════════════════════════════════
export default function SidebarAtalhos() {
  const pathname              = usePathname();
  const { emailUsuario, contaId, fazendaId } = useAuth();
  const workspace = hasClientWorkspace(pathname, emailUsuario, contaId, fazendaId);
  const router                = useRouter();
  const [expandida,  setExpandida]  = useState(false);
  const [atalhos,    setAtalhos]    = useState<string[]>([]);
  const [modal,      setModal]      = useState(false);
  const [selecionados, setSelecionados] = useState<string[]>([]);
  const [montado,    setMontado]    = useState(false);
  const [ativada,    setAtivada]    = useState(true);
  const sideRef  = useRef<HTMLDivElement>(null);
  const modalRef = useRef<HTMLDivElement>(null);

  // Largura calculada antes dos effects para usar como dependência
  const W = expandida ? 216 : 52;

  // Só renderiza no client (evita mismatch SSR)
  useEffect(() => {
    setMontado(true);
    setAtalhos(lerAtalhos());
    const exp = localStorage.getItem(STORAGE_EXPAND);
    setExpandida(exp === "1");
    const vis = localStorage.getItem(STORAGE_VIS);
    setAtivada(vis !== "0");
  }, []);

  // Clique fora do modal fecha — verifica sideRef E modalRef
  useEffect(() => {
    if (!modal) return;
    const handler = (e: MouseEvent) => {
      const fora =
        sideRef.current  && !sideRef.current.contains(e.target as Node) &&
        modalRef.current && !modalRef.current.contains(e.target as Node);
      if (fora) setModal(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [modal]);

  // CSS variable --sidebar-w: empurra o conteúdo da página para a direita
  useEffect(() => {
    const show =
      workspace && montado && ativada &&
      !pathname?.startsWith("/campo") &&
      !pathname?.startsWith("/login") &&
      !pathname?.startsWith("/admin");
    document.documentElement.style.setProperty("--sidebar-w", show ? W + "px" : "0px");
  }, [montado, ativada, pathname, W, workspace]);

  if (!montado || !workspace) return null;

  // Não mostrar no App Campo (mobile), login, admin
  if (pathname?.startsWith("/campo") || pathname?.startsWith("/login") || pathname?.startsWith("/admin")) return null;

  // Sidebar desativada — mostra aba visível para reativar
  if (!ativada) {
    return (
      <button data-arato-button="primary"
        onClick={() => { setAtivada(true); try { localStorage.setItem(STORAGE_VIS, "1"); } catch { /* noop */ } }}
        title="Mostrar barra de atalhos"
        style={{
          position: "fixed", left: 0, top: "50%", transform: "translateY(-50%)",
          zIndex: 400, width: 22, height: 80,
          background: "#1A4870", border: "none",
          borderRadius: "0 10px 10px 0",
          cursor: "pointer", display: "flex", flexDirection: "column",
          alignItems: "center", justifyContent: "center", gap: 3,
          padding: 0,
          boxShadow: "3px 0 12px rgba(0,0,0,0.18)",
        }}
      >
        <span style={{ color: "#fff", fontSize: 10, lineHeight: 1 }}>▶</span>
        <span style={{
          color: "rgba(255,255,255,0.8)", fontSize: 8, fontWeight: 700,
          writingMode: "vertical-rl", textOrientation: "mixed",
          letterSpacing: "0.06em", textTransform: "uppercase",
          transform: "rotate(180deg)",
        }}>
          Atalhos
        </span>
      </button>
    );
  }

  const itensAtuais = atalhos.map(id => CATALOGO_ATALHOS.find(i => i.id === id)).filter(Boolean) as ItemAtalho[];

  const toggleExpanir = () => {
    const novo = !expandida;
    setExpandida(novo);
    try { localStorage.setItem(STORAGE_EXPAND, novo ? "1" : "0"); } catch { /* noop */ }
  };

  const abrirModal = () => {
    setSelecionados([...atalhos]);
    setModal(true);
  };

  const toggleItem = (id: string) => {
    setSelecionados(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const moverItem = (id: string, dir: -1 | 1) => {
    setSelecionados(prev => {
      const idx = prev.indexOf(id);
      if (idx === -1) return prev;
      const novo = [...prev];
      const destino = idx + dir;
      if (destino < 0 || destino >= novo.length) return prev;
      [novo[idx], novo[destino]] = [novo[destino], novo[idx]];
      return novo;
    });
  };

  const salvar = () => {
    salvarAtalhos(selecionados);
    setAtalhos(selecionados);
    setModal(false);
  };

  const grupos = Array.from(new Set(CATALOGO_ATALHOS.map(i => i.grupo)));

  return (
    <>
      {/* Sidebar */}
      <div data-arato-statistic="action" ref={sideRef}
        style={{
          position: "fixed", left: 0, top: 92, bottom: 0, zIndex: 300,
          width: W, background: "var(--bg-card)",
          borderRight: "0.5px solid var(--border-table)",
          display: "flex", flexDirection: "column",
          transition: "width 0.2s ease",
          boxShadow: expandida ? "2px 0 12px rgba(0,0,0,0.06)" : "none",
          overflow: "hidden",
        }}
      >
        {/* Botão toggle + título */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: expandida ? "space-between" : "center",
          padding: expandida ? "10px 12px 10px 14px" : "10px 0",
          borderBottom: "0.5px solid var(--border-table)", flexShrink: 0,
        }}>
          {expandida && (
            <span style={{ fontSize: 10, fontWeight: 700, color: "var(--text-3)", letterSpacing: ".1em", textTransform: "uppercase" }}>
              Atalhos
            </span>
          )}
          <button data-arato-button="secondary" onClick={toggleExpanir} title={expandida ? "Recolher" : "Expandir"}
            style={{ background: "none", border: "none", cursor: "pointer", padding: 4, color: "var(--text-3)", fontSize: 16, lineHeight: 1, display: "flex", alignItems: "center" }}>
            {expandida ? "◀" : "▶"}
          </button>
        </div>

        {/* Lista de atalhos */}
        <div data-arato-statistic="action" style={{ flex: 1, overflowY: "auto", padding: "6px 0" }}>
          {itensAtuais.map(item => {
            const ativo = pathname === item.path || pathname?.startsWith(item.path + "?");
            return (
              <button data-arato-button="toggle" key={item.id}
                onClick={() => router.push(item.path)}
                title={item.label}
                style={{
                  width: "100%", display: "flex", alignItems: "center",
                  gap: expandida ? 10 : 0, justifyContent: expandida ? "flex-start" : "center",
                  padding: expandida ? "8px 14px" : "8px 0",
                  background: ativo ? "var(--bg-page)" : "transparent",
                  border: "none", borderLeft: ativo ? "3px solid #1A4870" : "3px solid transparent",
                  cursor: "pointer", textAlign: "left",
                  transition: "background 0.1s",
                }}
                onMouseEnter={e => { if (!ativo) (e.currentTarget as HTMLButtonElement).style.background = "var(--bg-page)"; }}
                onMouseLeave={e => { if (!ativo) (e.currentTarget as HTMLButtonElement).style.background = "transparent"; }}
              >
                <span style={{ fontSize: 18, lineHeight: 1, flexShrink: 0, width: 24, textAlign: "center" }}>{item.emoji}</span>
                {expandida && (
                  <span style={{ fontSize: 12, color: ativo ? "#1A4870" : "var(--text-1)", fontWeight: ativo ? 700 : 400, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {item.label}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Rodapé: configurar + ocultar */}
        <div style={{ borderTop: "0.5px solid var(--border-table)", padding: "4px 0", flexShrink: 0 }}>
          {/* Botão configurar atalhos */}
          <button data-arato-button="secondary" onClick={abrirModal} title="Configurar atalhos"
            style={{
              width: "100%", display: "flex", alignItems: "center",
              gap: expandida ? 10 : 0, justifyContent: expandida ? "flex-start" : "center",
              padding: expandida ? "6px 14px" : "6px 0",
              background: "none", border: "none", cursor: "pointer",
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = "var(--bg-page)"; }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = "none"; }}
          >
            <span style={{ fontSize: 15, lineHeight: 1, flexShrink: 0, width: 24, textAlign: "center" }}>⚙️</span>
            {expandida && <span style={{ fontSize: 11, color: "var(--text-2)", whiteSpace: "nowrap" }}>Configurar atalhos</span>}
          </button>

          {/* Botão ocultar barra */}
          <button data-arato-button="secondary"
            onClick={() => { setAtivada(false); try { localStorage.setItem(STORAGE_VIS, "0"); } catch { /* noop */ } }}
            title="Ocultar barra de atalhos"
            style={{
              width: "100%", display: "flex", alignItems: "center",
              gap: expandida ? 10 : 0, justifyContent: expandida ? "flex-start" : "center",
              padding: expandida ? "6px 14px" : "6px 0",
              background: "none", border: "none", cursor: "pointer",
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = "var(--bg-page)"; }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = "none"; }}
          >
            <span style={{ fontSize: 15, lineHeight: 1, flexShrink: 0, width: 24, textAlign: "center", opacity: 0.55 }}>✕</span>
            {expandida && <span style={{ fontSize: 11, color: "var(--text-3)", whiteSpace: "nowrap" }}>Ocultar barra</span>}
          </button>
        </div>
      </div>

      {/* ═══ MODAL CONFIGURAÇÃO ═══ */}
      {modal && (
        <div data-arato-overlay="true" style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 1000, display: "flex", alignItems: "flex-start", justifyContent: "flex-start", paddingTop: 92, paddingLeft: W }}>
          <div data-arato-dialog="confirmation" ref={modalRef} style={{ background: "var(--bg-card)", borderRadius: "0 12px 12px 0", width: 360, maxHeight: "calc(100vh - 92px)", display: "flex", flexDirection: "column", boxShadow: "4px 0 24px rgba(0,0,0,0.15)" }}>

            {/* Header */}
            <div data-arato-dialog-body="true" data-arato-dialog-heading="true" style={{ padding: "14px 18px", borderBottom: "0.5px solid var(--border-table)", display: "flex", justifyContent: "space-between", alignItems: "center", flexShrink: 0 }}>
              <div data-arato-dialog-body="true">
                <div data-arato-dialog-body="true" style={{ fontWeight: 700, fontSize: 14 }}>Configurar Atalhos</div>
                <div data-arato-dialog-body="true" style={{ fontSize: 11, color: "var(--text-3)", marginTop: 2 }}>{selecionados.length} selecionados</div>
              </div>
              <button data-arato-button="icon" onClick={() => setModal(false)} style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer", color: "var(--text-2)" }}>×</button>
            </div>

            {/* Selecionados — ordem atual */}
            {selecionados.length > 0 && (
              <div style={{ padding: "10px 18px", borderBottom: "0.5px solid var(--border-table)", flexShrink: 0 }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: "var(--text-3)", marginBottom: 6, letterSpacing: ".08em", textTransform: "uppercase" }}>Ordem na sidebar</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                  {selecionados.map((id, idx) => {
                    const item = CATALOGO_ATALHOS.find(i => i.id === id);
                    if (!item) return null;
                    return (
                      <div key={id} style={{ display: "flex", alignItems: "center", gap: 6, padding: "3px 0" }}>
                        <span style={{ fontSize: 14 }}>{item.emoji}</span>
                        <span style={{ fontSize: 12, flex: 1 }}>{item.label}</span>
                        <button data-arato-button="secondary" onClick={() => moverItem(id, -1)} disabled={idx === 0}
                          style={{ background: "none", border: "none", cursor: idx === 0 ? "default" : "pointer", color: idx === 0 ? "#ccc" : "var(--text-2)", fontSize: 13, padding: "0 3px" }}>▲</button>
                        <button data-arato-button="secondary" onClick={() => moverItem(id, 1)} disabled={idx === selecionados.length - 1}
                          style={{ background: "none", border: "none", cursor: idx === selecionados.length - 1 ? "default" : "pointer", color: idx === selecionados.length - 1 ? "#ccc" : "var(--text-2)", fontSize: 13, padding: "0 3px" }}>▼</button>
                        <button data-arato-button="icon" onClick={() => toggleItem(id)}
                          style={{ background: "none", border: "none", cursor: "pointer", color: "#E24B4A", fontSize: 14, padding: "0 3px" }}>×</button>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Catálogo */}
            <div data-arato-dialog-body="true" style={{ flex: 1, overflowY: "auto", padding: "10px 18px" }}>
              <div data-arato-dialog-body="true" style={{ fontSize: 10, fontWeight: 700, color: "var(--text-3)", marginBottom: 8, letterSpacing: ".08em", textTransform: "uppercase" }}>Adicionar atalhos</div>
              {grupos.map(grupo => (
                <div key={grupo} style={{ marginBottom: 12 }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: "var(--text-2)", marginBottom: 4, letterSpacing: ".06em" }}>{grupo}</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
                    {CATALOGO_ATALHOS.filter(i => i.grupo === grupo).map(item => {
                      const selecionado = selecionados.includes(item.id);
                      return (
                        <button data-arato-button="toggle" key={item.id} onClick={() => toggleItem(item.id)}
                          style={{
                            display: "flex", alignItems: "center", gap: 8, padding: "5px 8px",
                            borderRadius: 6, border: selecionado ? "0.5px solid #1A4870" : "0.5px solid transparent",
                            background: selecionado ? "#EEF4FF" : "transparent",
                            cursor: "pointer", textAlign: "left", width: "100%",
                          }}>
                          <span style={{ fontSize: 15 }}>{item.emoji}</span>
                          <span style={{ fontSize: 12, flex: 1, color: selecionado ? "#1A4870" : "var(--text-1)", fontWeight: selecionado ? 600 : 400 }}>{item.label}</span>
                          {selecionado && <span style={{ fontSize: 11, color: "#1A4870", fontWeight: 700 }}>✓</span>}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>

            {/* Footer */}
            <div data-arato-dialog-body="true" data-arato-dialog-actions="true" style={{ padding: "12px 18px", borderTop: "0.5px solid var(--border-table)", display: "flex", gap: 8, justifyContent: "flex-end", flexShrink: 0 }}>
              <button data-arato-button="secondary" onClick={() => setModal(false)}
                style={{ padding: "7px 16px", border: "0.5px solid var(--border-table)", borderRadius: 8, background: "var(--bg-page)", color: "var(--text-1)", cursor: "pointer", fontSize: 13 }}>
                Cancelar
              </button>
              <button data-arato-button="primary" onClick={salvar}
                style={{ padding: "7px 20px", background: "#1A4870", color: "#fff", border: "none", borderRadius: 8, cursor: "pointer", fontSize: 13, fontWeight: 600 }}>
                Salvar
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
