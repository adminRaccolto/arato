"use client";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { useState, useEffect, useCallback } from "react";
import { useAuth } from "../../components/AuthProvider";
import { supabase } from "../../lib/supabase"; // usado em carregarFazendas

type FazendaOp = { id: string; nome: string };

const NAV_ITEMS = [
  { href: "/campo",               label: "Início",   icon: "🏠" },
  { href: "/campo/plantio",       label: "Plantio",  icon: "🌱" },
  { href: "/campo/pulverizacao",  label: "Pulv.",    icon: "💧" },
  { href: "/campo/colheita",      label: "Colheita", icon: "🌾" },
  { href: "/campo/abastecimento", label: "Abastecer",icon: "⛽" },
  { href: "/campo/monitoramento", label: "Monitor.", icon: "🐛" },
];

export default function CampoLayoutClient({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const { fazendaId, nomeFazendaSelecionada, setFazendaAtiva, contaId } = useAuth();
  const [fazendas, setFazendas] = useState<FazendaOp[]>([]);
  const [showSwitch, setShowSwitch] = useState(false);

  // Registra service worker para modo offline
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js", { scope: "/campo" }).catch(() => {});
    }
  }, []);

  const carregarFazendas = useCallback(async () => {
    if (!contaId) return;
    const { data } = await supabase
      .from("fazendas")
      .select("id, nome")
      .eq("conta_id", contaId)
      .order("nome");
    setFazendas((data ?? []) as FazendaOp[]);
  }, [contaId]);

  useEffect(() => { carregarFazendas(); }, [carregarFazendas]);


  return (
    <div style={{ fontFamily: "system-ui, sans-serif", background: "var(--bg-page)", minHeight: "100dvh", display: "flex", flexDirection: "column", maxWidth: 480, margin: "0 auto", position: "relative" }}>

      {/* Faixa de topo */}
      <div style={{ background: "#1A4870", color: "#fff", padding: "10px 16px", display: "flex", alignItems: "center", justifyContent: "space-between", position: "sticky", top: 0, zIndex: 50, borderBottom: "0.5px solid #0B2D50" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <img
            src="/Arato_BRANCO.png"
            alt="Arato"
            style={{ height: 26, maxWidth: 86, objectFit: "contain" }}
          />
          <div>
            <div style={{ fontSize: 10, color: "#B0C8E0", letterSpacing: "0.5px", lineHeight: 1 }}>campo</div>
            <button
              onClick={() => fazendas.length > 1 && setShowSwitch(true)}
              style={{
                fontSize: 10, color: fazendas.length > 1 ? "#FDE9BB" : "#B0C8E0",
                marginTop: 3, background: "none", border: "none", padding: 0,
                cursor: fazendas.length > 1 ? "pointer" : "default",
                display: "flex", alignItems: "center", gap: 4,
              }}
            >
              📍 {nomeFazendaSelecionada ?? "Fazenda"}
              {fazendas.length > 1 && <span style={{ fontSize: 9 }}>▾</span>}
            </button>
          </div>
        </div>
        <Link href="/" style={{ fontSize: 11, color: "#B0C8E0", textDecoration: "none", background: "rgba(255,255,255,0.1)", padding: "5px 10px", borderRadius: 6 }}>
          ← Desktop
        </Link>
      </div>

      {/* Modal seletor de fazenda */}
      {showSwitch && (
        <div
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", zIndex: 200, display: "flex", alignItems: "flex-end" }}
          onClick={() => setShowSwitch(false)}
        >
          <div
            style={{ width: "100%", maxWidth: 480, margin: "0 auto", background: "var(--bg-card)", borderRadius: "16px 16px 0 0", padding: "20px 16px", paddingBottom: "calc(20px + env(safe-area-inset-bottom))" }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text-1)", marginBottom: 14 }}>Selecionar Fazenda</div>
            {fazendas.map(f => (
              <button
                key={f.id}
                onClick={async () => { await setFazendaAtiva(f.id, f.nome); setShowSwitch(false); }}
                style={{ width: "100%", display: "flex", alignItems: "center", gap: 12, padding: "14px 0", border: "none", background: "none", cursor: "pointer", borderBottom: "0.5px solid var(--border)", textAlign: "left" }}
              >
                <span style={{ fontSize: 20 }}>🏡</span>
                <span style={{ fontSize: 14, color: f.id === fazendaId ? "#1A4870" : "var(--text-1)", fontWeight: f.id === fazendaId ? 700 : 400 }}>{f.nome}</span>
                {f.id === fazendaId && <span style={{ marginLeft: "auto", color: "#1A4870", fontSize: 16 }}>✓</span>}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Conteúdo */}
      <div style={{ flex: 1, overflowY: "auto", paddingBottom: 80 }}>
        {children}
      </div>

      {/* Barra inferior de navegação */}
      <nav style={{ position: "fixed", bottom: 0, left: "50%", transform: "translateX(-50%)", width: "100%", maxWidth: 480, background: "var(--bg-card)", borderTop: "0.5px solid var(--border)", display: "flex", zIndex: 50, paddingBottom: "env(safe-area-inset-bottom, 0)" }}>
        {NAV_ITEMS.map(item => {
          const active = path === item.href || (item.href !== "/campo" && path.startsWith(item.href));
          return (
            <Link key={item.href} href={item.href} style={{
              flex: 1, display: "flex", flexDirection: "column", alignItems: "center", padding: "10px 2px 8px",
              textDecoration: "none", color: active ? "#1A4870" : "var(--text-3)",
              borderTop: active ? "2.5px solid #1A4870" : "2.5px solid transparent",
              background: active ? "#EFF4FA" : "none",
              minWidth: 0,
            }}>
              <span style={{ fontSize: 18 }}>{item.icon}</span>
              <span style={{ fontSize: 9, marginTop: 3, fontWeight: active ? 700 : 400, whiteSpace: "nowrap" }}>{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
