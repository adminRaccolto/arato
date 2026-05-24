"use client";
import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "../../components/AuthProvider";
import { supabase } from "../../lib/supabase";

// ─── Sidebar navigation ──────────────────────────────────────────────────────

type NavItem =
  | { type: "link";    id: string; label: string; icon: string; path: string }
  | { type: "divider"; label: string };

const NAV: NavItem[] = [
  { type: "link",    id: "overview",  label: "Visão Geral",           icon: "◈", path: "/admin"           },
  { type: "divider", label: "Clientes" },
  { type: "link",    id: "clientes",  label: "Lista de Clientes",      icon: "👥", path: "/admin/clientes" },
  { type: "link",    id: "novo",      label: "Novo Cliente",           icon: "＋", path: "/admin/clientes/novo" },
  { type: "divider", label: "Produto" },
  { type: "link",    id: "planos",    label: "Planos & Preços",        icon: "💰", path: "/admin/planos"   },
  { type: "link",    id: "modulos",   label: "Módulos do Sistema",     icon: "⬡",  path: "/admin/modulos"  },
  { type: "divider", label: "Acesso" },
  { type: "link",    id: "usuarios",  label: "Usuários & Permissões",  icon: "🔑", path: "/admin/usuarios" },
  { type: "link",    id: "logs",      label: "Logs do Sistema",        icon: "📋", path: "/admin/logs"     },
  { type: "divider", label: "Sistema" },
  { type: "link",    id: "identidade",label: "Identidade Arato",       icon: "🎨", path: "/admin/identidade" },
  { type: "link",    id: "manual",    label: "Manual & Docs",          icon: "📖", path: "/admin/manual"   },
];

// ─── Layout ──────────────────────────────────────────────────────────────────

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { userRole, raccotloGestor } = useAuth();
  const router   = useRouter();
  const pathname = usePathname();
  const [logoUrl, setLogoUrl] = useState("/Logo_Raccolto.png");

  // Auth guard
  useEffect(() => {
    if (userRole === null) return;
    if (userRole !== "raccotlo") router.replace("/");
  }, [userRole, router]);

  useEffect(() => {
    const { data } = supabase.storage.from("logos").getPublicUrl("raccolto.png");
    if (data?.publicUrl) setLogoUrl(data.publicUrl);
  }, []);

  function isActive(path: string) {
    if (path === "/admin") return pathname === "/admin";
    return pathname.startsWith(path);
  }

  async function sair() {
    await supabase.auth.signOut();
    router.push("/login");
  }

  if (userRole === null) return null; // carregando

  return (
    <div style={{
      display: "flex", minHeight: "100vh",
      fontFamily: "system-ui, -apple-system, sans-serif",
      fontSize: 13,
    }}>

      {/* ── SIDEBAR ── */}
      <aside style={{
        width: 240, flexShrink: 0,
        background: "#0B1E35",
        display: "flex", flexDirection: "column",
        position: "fixed", top: 0, left: 0, bottom: 0,
        zIndex: 100,
      }}>

        {/* Logo Raccolto */}
        <div style={{
          padding: "20px 20px 16px",
          borderBottom: "0.5px solid rgba(255,255,255,0.08)",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <img
              src={logoUrl}
              alt="Raccolto"
              style={{ height: 28, width: "auto", objectFit: "contain", filter: "brightness(0) invert(1)" }}
              onError={e => { (e.target as HTMLImageElement).style.display = "none"; }}
            />
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#fff", letterSpacing: "-0.2px" }}>Raccolto</div>
              <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", marginTop: 1 }}>Painel Admin</div>
            </div>
          </div>

          {/* Badge raccotlo */}
          {raccotloGestor && (
            <div style={{
              marginTop: 12,
              background: "rgba(201,146,27,0.15)",
              border: "0.5px solid rgba(201,146,27,0.3)",
              borderRadius: 6, padding: "4px 10px",
              fontSize: 10, color: "#FDE9BB", fontWeight: 600,
            }}>
              ◈ Acesso Raccotlo Gestor
            </div>
          )}
        </div>

        {/* Navigation */}
        <nav style={{ flex: 1, padding: "12px 10px", overflowY: "auto" }}>
          {NAV.map((item, i) => {
            if (item.type === "divider") {
              return (
                <div key={i} style={{
                  padding: "16px 10px 6px",
                  fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,0.3)",
                  letterSpacing: "0.08em", textTransform: "uppercase",
                }}>
                  {item.label}
                </div>
              );
            }
            const active = isActive(item.path);
            return (
              <Link key={item.id} href={item.path} style={{
                display: "flex", alignItems: "center", gap: 10,
                padding: "8px 12px", borderRadius: 8, marginBottom: 2,
                textDecoration: "none",
                background: active ? "rgba(255,255,255,0.10)" : "transparent",
                color: active ? "#fff" : "rgba(255,255,255,0.55)",
                fontWeight: active ? 600 : 400,
                fontSize: 13,
                transition: "all 0.12s",
                borderLeft: active ? "2px solid #C9921B" : "2px solid transparent",
              }}
                onMouseEnter={e => { if (!active) e.currentTarget.style.background = "rgba(255,255,255,0.06)"; }}
                onMouseLeave={e => { if (!active) e.currentTarget.style.background = "transparent"; }}
              >
                <span style={{ fontSize: 14, width: 18, textAlign: "center" }}>{item.icon}</span>
                {item.label}
              </Link>
            );
          })}
        </nav>

        {/* Bottom — link to app + user */}
        <div style={{
          padding: "12px 14px",
          borderTop: "0.5px solid rgba(255,255,255,0.08)",
        }}>
          <Link href="/" style={{
            display: "flex", alignItems: "center", gap: 8,
            padding: "8px 12px", borderRadius: 8, marginBottom: 8,
            textDecoration: "none", color: "rgba(255,255,255,0.45)",
            fontSize: 12, border: "0.5px solid rgba(255,255,255,0.1)",
            background: "rgba(255,255,255,0.04)",
          }}>
            <span>←</span> Voltar ao Arato
          </Link>
          <button onClick={sair} style={{
            display: "flex", alignItems: "center", gap: 8, width: "100%",
            padding: "7px 12px", borderRadius: 8,
            border: "none", background: "transparent", cursor: "pointer",
            color: "rgba(255,255,255,0.35)", fontSize: 12, textAlign: "left",
          }}>
            <span>⎋</span> Sair
          </button>
        </div>
      </aside>

      {/* ── CONTEÚDO ── */}
      <div style={{ marginLeft: 240, flex: 1, minHeight: "100vh", background: "#F0F3F8" }}>

        {/* Top bar */}
        <div style={{
          position: "sticky", top: 0, zIndex: 50,
          background: "#fff",
          borderBottom: "0.5px solid #DDE2EE",
          padding: "0 28px",
          height: 52,
          display: "flex", alignItems: "center", justifyContent: "space-between",
        }}>
          {/* Breadcrumb simples */}
          <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: "#555" }}>
            <span style={{ color: "#888" }}>Admin</span>
            {pathname !== "/admin" && (
              <>
                <span style={{ color: "#DDE2EE" }}>/</span>
                <span style={{ color: "#1a1a1a", fontWeight: 600, textTransform: "capitalize" }}>
                  {pathname.split("/admin/")[1]?.split("/")[0]?.replace(/-/g, " ") ?? ""}
                </span>
              </>
            )}
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {/* Ambiente */}
            <div style={{
              background: "#FBF3E0", border: "0.5px solid #C9921B50",
              borderRadius: 6, padding: "4px 10px",
              fontSize: 11, color: "#7A5A12", fontWeight: 600,
            }}>
              ◈ Raccotlo Admin
            </div>

            {/* Link para o app em produção */}
            <a
              href="https://arato.agr.br"
              target="_blank"
              rel="noopener noreferrer"
              style={{
                padding: "6px 14px", borderRadius: 6,
                border: "0.5px solid #DDE2EE", background: "#F8FAFC",
                fontSize: 12, color: "#555", textDecoration: "none", fontWeight: 500,
              }}
            >
              Arato produção ↗
            </a>
          </div>
        </div>

        {/* Page content */}
        <div style={{ padding: "24px 28px" }}>
          {children}
        </div>
      </div>
    </div>
  );
}
