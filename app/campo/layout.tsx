"use client";
import { usePathname } from "next/navigation";
import Link from "next/link";

const NAV_ITEMS = [
  { href: "/campo",               label: "Início",        icon: "🏠" },
  { href: "/campo/monitoramento", label: "Monitoramento", icon: "🐛" },
  { href: "/lavoura/plantio",     label: "Plantio",       icon: "🌱" },
  { href: "/lavoura/pulverizacao",label: "Pulverização",  icon: "💧" },
  { href: "/lavoura/colheita",    label: "Colheita",      icon: "🌾" },
];

export default function CampoLayout({ children }: { children: React.ReactNode }) {
  const path = usePathname();

  return (
    <div style={{ fontFamily: "system-ui, sans-serif", background: "#F4F6FA", minHeight: "100dvh", display: "flex", flexDirection: "column", maxWidth: 480, margin: "0 auto", position: "relative" }}>

      {/* Faixa de topo */}
      <div style={{ background: "#1A4870", color: "#fff", padding: "10px 16px", display: "flex", alignItems: "center", justifyContent: "space-between", position: "sticky", top: 0, zIndex: 50, borderBottom: "0.5px solid #0B2D50" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/Logo_Arato.png" alt="Arato" style={{ height: 32, width: "auto", objectFit: "contain" }} />
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, letterSpacing: "-0.3px", lineHeight: 1 }}>arato</div>
            <div style={{ fontSize: 10, color: "#B0C8E0", marginTop: 2 }}>operações rurais</div>
          </div>
        </div>
        <Link href="/" style={{ fontSize: 11, color: "#B0C8E0", textDecoration: "none", background: "rgba(255,255,255,0.1)", padding: "5px 10px", borderRadius: 6 }}>
          ← Desktop
        </Link>
      </div>

      {/* Conteúdo */}
      <div style={{ flex: 1, overflowY: "auto", paddingBottom: 80 }}>
        {children}
      </div>

      {/* Barra inferior de navegação */}
      <nav style={{ position: "fixed", bottom: 0, left: "50%", transform: "translateX(-50%)", width: "100%", maxWidth: 480, background: "#fff", borderTop: "0.5px solid #DDE2EE", display: "flex", zIndex: 50, paddingBottom: "env(safe-area-inset-bottom, 0)" }}>
        {NAV_ITEMS.map(item => {
          const active = path === item.href || (item.href !== "/campo" && path.startsWith(item.href));
          return (
            <Link key={item.href} href={item.href} style={{
              flex: 1, display: "flex", flexDirection: "column", alignItems: "center", padding: "10px 4px 8px",
              textDecoration: "none", color: active ? "#1A4870" : "#888",
              borderTop: active ? "2.5px solid #1A4870" : "2.5px solid transparent",
              background: active ? "#EFF4FA" : "none",
            }}>
              <span style={{ fontSize: 20 }}>{item.icon}</span>
              <span style={{ fontSize: 10, marginTop: 3, fontWeight: active ? 700 : 400, whiteSpace: "nowrap" }}>{item.label}</span>
            </Link>
          );
        })}
      </nav>

    </div>
  );
}
