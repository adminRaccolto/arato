"use client";
import { useState, useEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";

// ─── Catálogo de itens disponíveis para atalho ────────────────────────────────
export type ItemAtalho = { id: string; emoji: string; label: string; path: string; grupo: string };

export const CATALOGO_ATALHOS: ItemAtalho[] = [
  // Financeiro
  { id: "cp",        emoji: "💸", label: "Contas a Pagar",        path: "/financeiro/pagar",               grupo: "Financeiro" },
  { id: "cr",        emoji: "💰", label: "Contas a Receber",       path: "/financeiro/receber",             grupo: "Financeiro" },
  { id: "fluxo",     emoji: "📈", label: "Fluxo de Caixa",         path: "/financeiro/relatorios",          grupo: "Financeiro" },
  { id: "contratos-fin", emoji: "🏦", label: "Contratos Financeiros", path: "/financeiro/contratos",        grupo: "Financeiro" },
  { id: "concil",    emoji: "🔄", label: "Conciliação Bancária",    path: "/financeiro/conciliacao",         grupo: "Financeiro" },
  { id: "cartoes",   emoji: "💳", label: "Cartões de Crédito",     path: "/financeiro/cartoes",             grupo: "Financeiro" },
  { id: "endivid",   emoji: "📊", label: "Endividamento",          path: "/financeiro/endividamento",       grupo: "Financeiro" },
  // Suprimentos
  { id: "nf",        emoji: "📄", label: "NF de Produtos",         path: "/compras/nf",                     grupo: "Suprimentos" },
  { id: "pedidos",   emoji: "🛒", label: "Pedidos de Compra",      path: "/compras",                        grupo: "Suprimentos" },
  { id: "estoque",   emoji: "📦", label: "Posição de Estoque",     path: "/estoque",                        grupo: "Suprimentos" },
  { id: "kardex",    emoji: "📋", label: "Kardex",                  path: "/estoque/kardex",                  grupo: "Suprimentos" },
  { id: "abastec",   emoji: "⛽", label: "Abastecimento",           path: "/estoque/abastecimento",          grupo: "Suprimentos" },
  // Comercial
  { id: "contratos", emoji: "🌾", label: "Contratos de Grãos",     path: "/contratos",                      grupo: "Comercial" },
  { id: "expedicao", emoji: "🚛", label: "Expedição",               path: "/expedicao",                      grupo: "Comercial" },
  { id: "balanca",   emoji: "⚖️", label: "Pesagem Avulsa",          path: "/balanca/pesagem-avulsa",         grupo: "Comercial" },
  { id: "romaneios", emoji: "📃", label: "Romaneios de Entrada",    path: "/estoque/romaneio-entrada",       grupo: "Comercial" },
  // Produção
  { id: "plantio",   emoji: "🌱", label: "Plantio",                 path: "/lavoura/plantio",                grupo: "Produção" },
  { id: "pulv",      emoji: "💧", label: "Pulverização",            path: "/lavoura/pulverizacao",           grupo: "Produção" },
  { id: "colheita",  emoji: "🌾", label: "Colheita",                path: "/lavoura/colheita",               grupo: "Produção" },
  { id: "mapa",      emoji: "🗺️", label: "Mapa de Talhões",         path: "/mapa",                           grupo: "Produção" },
  { id: "pluviom",   emoji: "🌧️", label: "Pluviometria",            path: "/lavoura/pluviometria",           grupo: "Produção" },
  { id: "manut",     emoji: "🔧", label: "Manutenções",             path: "/relatorios/manutencao",          grupo: "Produção" },
  // Resultados
  { id: "dre",       emoji: "📉", label: "DRE Agrícola",            path: "/custos?aba=dre",                 grupo: "Resultados" },
  { id: "bi",        emoji: "🔭", label: "BI / Análises",           path: "/bi",                             grupo: "Resultados" },
  { id: "custos",    emoji: "🧮", label: "Custos por ha",           path: "/custos?aba=custoha",             grupo: "Resultados" },
  // Fiscal
  { id: "nfe-saida", emoji: "📤", label: "NF-e de Saída",           path: "/comercial/faturamento",          grupo: "Fiscal" },
  { id: "lcdpr",     emoji: "📑", label: "LCDPR",                   path: "/lcdpr",                          grupo: "Fiscal" },
  // Cadastros
  { id: "pessoas",   emoji: "👥", label: "Pessoas / Entidades",     path: "/cadastros?tab=pessoas",          grupo: "Cadastros" },
  { id: "insumos",   emoji: "🧪", label: "Catálogo de Insumos",     path: "/cadastros?tab=insumos",          grupo: "Cadastros" },
];

const STORAGE_KEY    = "arato-atalhos-v2";   // array de ids
const STORAGE_EXPAND = "arato-sidebar-exp";  // "1" | "0"
const STORAGE_VIS    = "arato-sidebar-vis";  // "1" | "0" — ativa ou oculta

const DEFAULTS = ["cp", "cr", "nf", "contratos", "estoque", "plantio"];

function lerAtalhos(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULTS;
    const ids = JSON.parse(raw) as string[];
    return Array.isArray(ids) ? ids : DEFAULTS;
  } catch { return DEFAULTS; }
}

function salvarAtalhos(ids: string[]) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(ids)); } catch { /* noop */ }
}

// ═══════════════════════════════════════════════════════════════
export default function SidebarAtalhos() {
  const pathname              = usePathname();
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
      montado && ativada &&
      !pathname?.startsWith("/app/campo") &&
      !pathname?.startsWith("/login") &&
      !pathname?.startsWith("/admin");
    document.documentElement.style.setProperty("--sidebar-w", show ? W + "px" : "0px");
  }, [montado, ativada, pathname, W]);

  if (!montado) return null;

  // Não mostrar em páginas do app campo (mobile) nem login
  if (pathname?.startsWith("/app/campo") || pathname?.startsWith("/login") || pathname?.startsWith("/admin")) return null;

  // Sidebar desativada — mostra aba mínima para reativar
  if (!ativada) {
    return (
      <button
        onClick={() => { setAtivada(true); try { localStorage.setItem(STORAGE_VIS, "1"); } catch { /* noop */ } }}
        title="Mostrar barra de atalhos"
        style={{
          position: "fixed", left: 0, top: "50%", transform: "translateY(-50%)",
          zIndex: 300, width: 14, height: 52,
          background: "var(--bg-card)", border: "0.5px solid var(--border-table)",
          borderLeft: "none", borderRadius: "0 8px 8px 0",
          cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
          color: "var(--text-3)", fontSize: 9, padding: 0,
          boxShadow: "2px 0 8px rgba(0,0,0,0.08)",
        }}
      >
        ▶
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
      <div ref={sideRef}
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
          <button onClick={toggleExpanir} title={expandida ? "Recolher" : "Expandir"}
            style={{ background: "none", border: "none", cursor: "pointer", padding: 4, color: "var(--text-3)", fontSize: 16, lineHeight: 1, display: "flex", alignItems: "center" }}>
            {expandida ? "◀" : "▶"}
          </button>
        </div>

        {/* Lista de atalhos */}
        <div style={{ flex: 1, overflowY: "auto", padding: "6px 0" }}>
          {itensAtuais.map(item => {
            const ativo = pathname === item.path || pathname?.startsWith(item.path + "?");
            return (
              <button key={item.id}
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
          <button onClick={abrirModal} title="Configurar atalhos"
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
          <button
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
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 1000, display: "flex", alignItems: "flex-start", justifyContent: "flex-start", paddingTop: 92, paddingLeft: W }}>
          <div ref={modalRef} style={{ background: "var(--bg-card)", borderRadius: "0 12px 12px 0", width: 360, maxHeight: "calc(100vh - 92px)", display: "flex", flexDirection: "column", boxShadow: "4px 0 24px rgba(0,0,0,0.15)" }}>

            {/* Header */}
            <div style={{ padding: "14px 18px", borderBottom: "0.5px solid var(--border-table)", display: "flex", justifyContent: "space-between", alignItems: "center", flexShrink: 0 }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 14 }}>Configurar Atalhos</div>
                <div style={{ fontSize: 11, color: "var(--text-3)", marginTop: 2 }}>{selecionados.length} selecionados</div>
              </div>
              <button onClick={() => setModal(false)} style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer", color: "var(--text-2)" }}>×</button>
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
                        <button onClick={() => moverItem(id, -1)} disabled={idx === 0}
                          style={{ background: "none", border: "none", cursor: idx === 0 ? "default" : "pointer", color: idx === 0 ? "#ccc" : "var(--text-2)", fontSize: 13, padding: "0 3px" }}>▲</button>
                        <button onClick={() => moverItem(id, 1)} disabled={idx === selecionados.length - 1}
                          style={{ background: "none", border: "none", cursor: idx === selecionados.length - 1 ? "default" : "pointer", color: idx === selecionados.length - 1 ? "#ccc" : "var(--text-2)", fontSize: 13, padding: "0 3px" }}>▼</button>
                        <button onClick={() => toggleItem(id)}
                          style={{ background: "none", border: "none", cursor: "pointer", color: "#E24B4A", fontSize: 14, padding: "0 3px" }}>×</button>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Catálogo */}
            <div style={{ flex: 1, overflowY: "auto", padding: "10px 18px" }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: "var(--text-3)", marginBottom: 8, letterSpacing: ".08em", textTransform: "uppercase" }}>Adicionar atalhos</div>
              {grupos.map(grupo => (
                <div key={grupo} style={{ marginBottom: 12 }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: "var(--text-2)", marginBottom: 4, letterSpacing: ".06em" }}>{grupo}</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
                    {CATALOGO_ATALHOS.filter(i => i.grupo === grupo).map(item => {
                      const selecionado = selecionados.includes(item.id);
                      return (
                        <button key={item.id} onClick={() => toggleItem(item.id)}
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
            <div style={{ padding: "12px 18px", borderTop: "0.5px solid var(--border-table)", display: "flex", gap: 8, justifyContent: "flex-end", flexShrink: 0 }}>
              <button onClick={() => setModal(false)}
                style={{ padding: "7px 16px", border: "0.5px solid var(--border-table)", borderRadius: 8, background: "var(--bg-page)", color: "var(--text-1)", cursor: "pointer", fontSize: 13 }}>
                Cancelar
              </button>
              <button onClick={salvar}
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
