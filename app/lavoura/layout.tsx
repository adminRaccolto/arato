"use client";
import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "../../components/AuthProvider";

const TABS = [
  { id: "inicio",    label: "Início",    icon: "🌾", path: "/lavoura" },
  { id: "execucao",  label: "Tarefas",   icon: "✅", path: "/lavoura/execucao" },
  { id: "novo",      label: "Lançar",    icon: "➕", path: null },
  { id: "relatorio", label: "Relatório", icon: "📊", path: "/lavoura/relatorios/aplicacoes" },
  { id: "mais",      label: "Mais",      icon: "☰",  path: null },
];

const ACOES = [
  { label: "Plantio",         icon: "🌱", path: "/lavoura/plantio" },
  { label: "Pulverização",    icon: "💧", path: "/lavoura/pulverizacao" },
  { label: "Adubação",        icon: "🧪", path: "/lavoura/adubacao" },
  { label: "Correção de Solo",icon: "🪨", path: "/lavoura/correcao" },
  { label: "Colheita",        icon: "🚜", path: "/lavoura/colheita" },
  { label: "Pragas & Doenças",icon: "🔍", path: "/lavoura/pragas" },
];

const MAIS = [
  { label: "Recomendações Agronômicas", icon: "📋", path: "/lavoura/recomendacoes" },
  { label: "Planejamento de Safra",     icon: "📅", path: "/lavoura/planejamento" },
  { label: "Safras & Ciclos",           icon: "🌾", path: "/lavoura" },
];

export default function LavouraLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { nomeFazendaSelecionada } = useAuth();
  const [sheet, setSheet] = useState<"novo" | "mais" | null>(null);

  function activeTab() {
    if (pathname === "/lavoura") return "inicio";
    if (pathname.startsWith("/lavoura/execucao")) return "execucao";
    if (pathname.startsWith("/lavoura/relatorios")) return "relatorio";
    if (
      pathname.startsWith("/lavoura/recomendacoes") ||
      pathname.startsWith("/lavoura/planejamento")
    ) return "mais";
    return "";
  }

  const cur = activeTab();

  function navTo(path: string) {
    setSheet(null);
    router.push(path);
  }

  return (
    <div className="lavoura-app-shell">
      {/* ── Mobile Header ──────────────────────────────── */}
      <div className="lavoura-mobile-header">
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 20 }}>🌾</span>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, lineHeight: 1.1 }}>Lavoura</div>
            <div style={{ fontSize: 10, opacity: 0.75, lineHeight: 1.1 }}>
              {nomeFazendaSelecionada ?? "Fazenda"}
            </div>
          </div>
        </div>
        <button
          onClick={() => router.back()}
          style={{
            background: "none", border: "none", color: "#fff",
            fontSize: 22, cursor: "pointer", padding: "4px 8px",
            display: pathname === "/lavoura" ? "none" : "block",
          }}
        >
          ‹
        </button>
      </div>

      {/* ── Page content ───────────────────────────────── */}
      <div className="lavoura-content-mobile">
        {children}
      </div>

      {/* ── Action sheet backdrop ───────────────────────── */}
      {sheet && (
        <div
          onClick={() => setSheet(null)}
          style={{
            position: "fixed", inset: 0,
            background: "rgba(0,0,0,0.4)",
            zIndex: 940,
          }}
        />
      )}

      {/* ── Action sheet: Lançar ───────────────────────── */}
      {sheet === "novo" && (
        <div className="lavoura-action-sheet">
          <div style={{
            width: 40, height: 4, borderRadius: 2,
            background: "#DDE2EE", margin: "0 auto 12px",
          }} />
          <div style={{ padding: "0 8px 4px 16px", fontSize: 11, fontWeight: 700, color: "#888", textTransform: "uppercase", letterSpacing: "0.06em" }}>
            Nova operação
          </div>
          {ACOES.map(a => (
            <button
              key={a.path}
              onClick={() => navTo(a.path)}
              style={{
                display: "flex", alignItems: "center", gap: 14,
                width: "100%", padding: "13px 20px",
                background: "none", border: "none",
                textAlign: "left", cursor: "pointer",
                fontSize: 14, color: "#1a1a1a",
                borderBottom: "0.5px solid #F0F2F7",
              }}
            >
              <span style={{ fontSize: 20, width: 28, textAlign: "center" }}>{a.icon}</span>
              {a.label}
            </button>
          ))}
        </div>
      )}

      {/* ── Action sheet: Mais ──────────────────────────── */}
      {sheet === "mais" && (
        <div className="lavoura-action-sheet">
          <div style={{
            width: 40, height: 4, borderRadius: 2,
            background: "#DDE2EE", margin: "0 auto 12px",
          }} />
          <div style={{ padding: "0 8px 4px 16px", fontSize: 11, fontWeight: 700, color: "#888", textTransform: "uppercase", letterSpacing: "0.06em" }}>
            Mais opções
          </div>
          {MAIS.map(m => (
            <button
              key={m.path}
              onClick={() => navTo(m.path)}
              style={{
                display: "flex", alignItems: "center", gap: 14,
                width: "100%", padding: "13px 20px",
                background: "none", border: "none",
                textAlign: "left", cursor: "pointer",
                fontSize: 14, color: "#1a1a1a",
                borderBottom: "0.5px solid #F0F2F7",
              }}
            >
              <span style={{ fontSize: 20, width: 28, textAlign: "center" }}>{m.icon}</span>
              {m.label}
            </button>
          ))}
        </div>
      )}

      {/* ── Bottom Tab Bar ─────────────────────────────── */}
      <nav className="lavoura-bottom-tabs">
        {TABS.map(tab => {
          const isActive = cur === tab.id;
          const isAction = tab.id === "novo";
          if (isAction) {
            return (
              <button
                key={tab.id}
                onClick={() => setSheet(sheet === "novo" ? null : "novo")}
                style={{
                  flex: 1, display: "flex", flexDirection: "column",
                  alignItems: "center", justifyContent: "center",
                  border: "none", cursor: "pointer",
                  background: "none", gap: 2,
                }}
              >
                <div style={{
                  width: 44, height: 44, borderRadius: "50%",
                  background: "#1A4870",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  boxShadow: "0 2px 10px rgba(26,72,112,0.4)",
                  marginTop: -20,
                  fontSize: 20, color: "#fff",
                }}>
                  ➕
                </div>
                <span style={{ fontSize: 10, color: "#888", marginTop: 2 }}>{tab.label}</span>
              </button>
            );
          }
          const isMais = tab.id === "mais";
          const content = (
            <>
              <span style={{ fontSize: 20 }}>{tab.icon}</span>
              <span style={{ fontSize: 10, color: isActive ? "#1A4870" : "#888" }}>{tab.label}</span>
            </>
          );
          if (isMais) {
            return (
              <button
                key={tab.id}
                onClick={() => setSheet(sheet === "mais" ? null : "mais")}
                style={{
                  flex: 1, display: "flex", flexDirection: "column",
                  alignItems: "center", justifyContent: "center",
                  border: "none", cursor: "pointer",
                  background: sheet === "mais" ? "#F0F5FA" : "none", gap: 2,
                }}
              >
                {content}
              </button>
            );
          }
          return (
            <Link
              key={tab.id}
              href={tab.path!}
              style={{
                flex: 1, display: "flex", flexDirection: "column",
                alignItems: "center", justifyContent: "center",
                textDecoration: "none",
                background: isActive ? "#F0F5FA" : "none", gap: 2,
                borderTop: isActive ? "2px solid #1A4870" : "2px solid transparent",
              }}
            >
              {content}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
