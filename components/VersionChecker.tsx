"use client";
import { useEffect, useRef, useState } from "react";

const CHECK_INTERVAL_MS = 3 * 60 * 1000; // verifica a cada 3 minutos

export default function VersionChecker() {
  const [desatualizado, setDesatualizado] = useState(false);
  const versaoInicial = useRef<string | null>(null);

  useEffect(() => {
    async function checar() {
      try {
        const r = await fetch("/api/version", { cache: "no-store" });
        const { deploymentId } = await r.json() as { deploymentId: string };
        if (!versaoInicial.current) {
          versaoInicial.current = deploymentId;
        } else if (deploymentId !== versaoInicial.current) {
          setDesatualizado(true);
        }
      } catch {
        // ignora falha de rede — não mostra banner
      }
    }

    checar();
    const id = setInterval(checar, CHECK_INTERVAL_MS);
    return () => clearInterval(id);
  }, []);

  if (!desatualizado) return null;

  return (
    <div style={{
      position: "fixed", bottom: 20, left: "50%", transform: "translateX(-50%)",
      zIndex: 9999, background: "#1A4870", color: "#fff",
      borderRadius: 12, padding: "14px 24px",
      boxShadow: "0 8px 32px rgba(0,0,0,0.25)",
      display: "flex", alignItems: "center", gap: 16,
      fontSize: 13, fontWeight: 500, whiteSpace: "nowrap",
    }}>
      <span>🔄 Nova versão disponível</span>
      <button
        onClick={() => window.location.reload()}
        style={{
          background: "#C9921B", color: "#fff", border: "none",
          borderRadius: 8, padding: "7px 16px", fontSize: 13,
          fontWeight: 700, cursor: "pointer",
        }}
      >
        Atualizar agora
      </button>
      <button
        onClick={() => setDesatualizado(false)}
        style={{
          background: "transparent", color: "rgba(255,255,255,0.6)",
          border: "none", fontSize: 18, cursor: "pointer", lineHeight: 1, padding: 0,
        }}
        aria-label="Fechar"
      >
        ×
      </button>
    </div>
  );
}
