"use client";
import { useState, useEffect, useCallback } from "react";
import { lerFila, removerDaFila, contarPendentes } from "../../lib/offline-store";

type Status = "idle" | "sincronizando" | "ok" | "erro";

export default function SyncButton() {
  const [pendentes, setPendentes] = useState(0);
  const [online, setOnline]       = useState(true);
  const [status, setStatus]       = useState<Status>("idle");
  const [msg, setMsg]             = useState("");

  const atualizar = useCallback(() => {
    setPendentes(contarPendentes());
    setOnline(navigator.onLine);
  }, []);

  useEffect(() => {
    atualizar();
    window.addEventListener("online",  atualizar);
    window.addEventListener("offline", atualizar);
    // Atualiza badge quando a fila muda (outros componentes chamam adicionarNaFila)
    const iv = setInterval(atualizar, 3000);
    return () => {
      window.removeEventListener("online",  atualizar);
      window.removeEventListener("offline", atualizar);
      clearInterval(iv);
    };
  }, [atualizar]);

  async function sincronizar() {
    const fila = lerFila();
    if (fila.length === 0 || !navigator.onLine) return;

    setStatus("sincronizando");
    setMsg("");

    try {
      const res  = await fetch("/api/campo/sync", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ ops: fila }),
      });
      const json = await res.json() as { resultados?: { id: string; ok: boolean; erro?: string }[]; erro?: string };

      if (!res.ok || json.erro) throw new Error(json.erro ?? "Erro no servidor");

      const { resultados = [] } = json;
      const sincronizados = resultados.filter((r) => r.ok).map((r) => r.id);
      const falhas        = resultados.filter((r) => !r.ok);

      if (sincronizados.length > 0) removerDaFila(sincronizados);

      atualizar();

      if (falhas.length === 0) {
        setStatus("ok");
        setMsg(`${sincronizados.length} operaç${sincronizados.length === 1 ? "ão enviada" : "ões enviadas"}`);
      } else {
        setStatus("erro");
        setMsg(`${sincronizados.length} enviadas · ${falhas.length} com erro`);
      }
    } catch (e) {
      setStatus("erro");
      setMsg(e instanceof Error ? e.message : "Erro desconhecido");
    }

    setTimeout(() => { setStatus("idle"); setMsg(""); }, 4000);
  }

  // Não renderiza nada se não há pendentes e status é idle
  if (pendentes === 0 && status === "idle") return null;

  const cor =
    status === "sincronizando" ? "#555555" :
    status === "ok"            ? "#16A34A" :
    status === "erro"          ? "#E24B4A" :
    online                     ? "#C9921B" : "#888888";

  return (
    <div style={{
      position: "fixed",
      bottom: 80,
      right: 16,
      zIndex: 900,
      display: "flex",
      flexDirection: "column",
      alignItems: "flex-end",
      gap: 6,
    }}>
      {/* Mensagem de resultado */}
      {msg && (
        <div style={{
          background: status === "ok" ? "#D1FAE5" : status === "erro" ? "#FEE2E2" : "#F5F5F5",
          color:      status === "ok" ? "#065F46" : status === "erro" ? "#7F1D1D" : "#333",
          fontSize: 11,
          fontWeight: 600,
          padding: "5px 10px",
          borderRadius: 8,
          border: `0.5px solid ${status === "ok" ? "#6EE7B7" : status === "erro" ? "#FCA5A5" : "#DDD"}`,
          maxWidth: 220,
          textAlign: "right",
        }}>
          {msg}
        </div>
      )}

      {/* Botão principal */}
      <button
        onClick={sincronizar}
        disabled={!online || status === "sincronizando" || pendentes === 0}
        title={
          !online           ? "Sem conexão — aguardando internet" :
          pendentes === 0   ? "Nada pendente" :
          `Sincronizar ${pendentes} operaç${pendentes === 1 ? "ão" : "ões"} pendente${pendentes === 1 ? "" : "s"}`
        }
        style={{
          background: cor,
          color: "#fff",
          border: "none",
          borderRadius: 14,
          padding: "10px 16px",
          fontSize: 13,
          fontWeight: 700,
          cursor: (!online || status === "sincronizando" || pendentes === 0) ? "default" : "pointer",
          opacity: (!online || pendentes === 0) && status === "idle" ? 0.6 : 1,
          display: "flex",
          alignItems: "center",
          gap: 8,
          boxShadow: "0 2px 12px rgba(0,0,0,0.18)",
          transition: "background 0.2s",
          minWidth: 130,
          justifyContent: "center",
        }}
      >
        {status === "sincronizando" ? (
          <>
            <span style={{ display: "inline-block", width: 14, height: 14, border: "2px solid rgba(255,255,255,0.4)", borderTopColor: "#fff", borderRadius: "50%", animation: "spin 0.7s linear infinite" }} />
            Enviando…
          </>
        ) : status === "ok" ? (
          <>✓ Sincronizado</>
        ) : status === "erro" ? (
          <>⚠ Tentar novamente</>
        ) : (
          <>
            {!online && <span style={{ fontSize: 10 }}>📡</span>}
            <span>↑ Sincronizar</span>
            {pendentes > 0 && (
              <span style={{
                background: "rgba(255,255,255,0.25)",
                borderRadius: 10,
                padding: "1px 7px",
                fontSize: 11,
                fontWeight: 800,
              }}>
                {pendentes}
              </span>
            )}
          </>
        )}
      </button>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
