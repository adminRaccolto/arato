"use client";
import { usePathname } from "next/navigation";
import { isPublicLayout } from "../lib/layout-preferences";
import LayoutSettings from "./LayoutSettings";
import { useAuth } from "./AuthProvider";

export default function Footer() {
  const { anoSafraVigenteDesc } = useAuth();

  const pathname = usePathname();
  if (isPublicLayout(pathname)) return null;

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

      <details className="layout-disclosure footer-layout" style={{ marginLeft: "auto" }}><summary title="Modelo de layout e densidade">Layout ▴</summary><div><LayoutSettings density /></div></details>
      <span style={{ color: "#BBB", fontWeight: 400 }}>
        Arato
      </span>
    </footer>
  );
}
