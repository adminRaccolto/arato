"use client";
import { usePathname } from "next/navigation";
import { hasClientWorkspace } from "../lib/layout-preferences";
import GridDensitySettings from "./GridDensitySettings";
import { useAuth } from "./AuthProvider";

export default function Footer() {
  const { anoSafraVigenteDesc, emailUsuario, contaId, fazendaId } = useAuth();

  const pathname = usePathname();
  if (!hasClientWorkspace(pathname, emailUsuario, contaId, fazendaId)) return null;

  return (
    <footer style={{
      position: "fixed",
      bottom: 0,
      left: 0,
      right: 0,
      height: 28,
      background: "var(--footer-bg, #E8ECF2)",
      borderTop: "0.5px solid var(--footer-border, #D0D5E0)",
      display: "flex",
      alignItems: "center",
      paddingInline: 16,
      gap: 18,
      zIndex: 100,
      fontSize: 11,
      color: "var(--footer-text, #666)",
      userSelect: "none",
    }}>
      <span style={{ fontWeight: 600, color: "var(--footer-text-strong, #444)" }}>
        {anoSafraVigenteDesc}
      </span>

      <details className="density-disclosure footer-density" style={{ marginLeft: "auto" }}><summary title="Densidade dos grids">Densidade ▴</summary><div><GridDensitySettings /></div></details>
      <span style={{ color: "#BBB", fontWeight: 400 }}>
        Arato
      </span>
    </footer>
  );
}
