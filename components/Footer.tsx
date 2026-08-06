"use client";
import { useAuth } from "./AuthProvider";

export default function Footer() {
  const { anoSafraVigenteDesc, nomeFazendaSelecionada } = useAuth();

  // Só renderiza se o usuário estiver logado
  if (!anoSafraVigenteDesc && !nomeFazendaSelecionada) return null;

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
      {anoSafraVigenteDesc && (
        <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
          <span style={{ color: "#999", fontWeight: 400 }}>Ano Safra</span>
          <span style={{ fontWeight: 700, color: "var(--footer-text-strong, #444)" }}>
            {anoSafraVigenteDesc}
          </span>
        </span>
      )}

      {/* Divisor — só quando há mais de uma informação */}
      {anoSafraVigenteDesc && nomeFazendaSelecionada && (
        <span style={{ width: 1, height: 14, background: "#CCC", display: "inline-block" }} />
      )}

      {nomeFazendaSelecionada && (
        <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
          <span style={{ color: "#999" }}>Fazenda</span>
          <span style={{ fontWeight: 600, color: "var(--footer-text-strong, #444)" }}>
            {nomeFazendaSelecionada}
          </span>
        </span>
      )}

      {/* Espaço reservado para futuras informações (versão, status de sync, etc.) */}
      <span style={{ marginLeft: "auto", color: "#BBB", fontWeight: 400 }}>
        Arato
      </span>
    </footer>
  );
}
