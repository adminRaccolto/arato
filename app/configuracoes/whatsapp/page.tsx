"use client";
import { useEffect, useState } from "react";

type Status = {
  vars?: Record<string, string>;
  evolution_status?: { instance?: { state?: string } };
  evolution_webhook?: { url?: string; enabled?: boolean; updatedAt?: string };
  usuarios_com_whatsapp?: { id: string; nome: string; whatsapp: string; ativo: boolean }[];
};

const ESTADO_LABEL: Record<string, { label: string; cor: string; bg: string }> = {
  open:        { label: "Conectado ✅",     cor: "#16A34A", bg: "#F0FDF4" },
  close:       { label: "Desconectado ❌",   cor: "#E24B4A", bg: "#FEF2F2" },
  connecting:  { label: "Conectando…",       cor: "#EF9F27", bg: "#FFF7ED" },
};

export default function WhatsAppPage() {
  const [status, setStatus]     = useState<Status | null>(null);
  const [loading, setLoading]   = useState(true);
  const [qrBase64, setQrBase64] = useState<string | null>(null);
  const [qrMsg,    setQrMsg]    = useState<string | null>(null);
  const [qrLoad,   setQrLoad]   = useState(false);

  async function carregar() {
    setLoading(true);
    try {
      const r = await fetch("/api/whatsapp/status");
      setStatus(await r.json());
    } catch { /* ignora */ }
    setLoading(false);
  }

  useEffect(() => { carregar(); }, []);

  async function reconectar() {
    setQrLoad(true);
    setQrBase64(null);
    setQrMsg(null);
    try {
      const r = await fetch("/api/whatsapp/reconectar", { method: "POST" });
      const j = await r.json() as Record<string, unknown>;
      if (j.base64) {
        setQrBase64(j.base64 as string);
        setQrMsg("Escaneie com WhatsApp → Aparelhos Conectados → Conectar um aparelho. Expira em ~60s.");
      } else if (j.code === "CONNECTED" || String(j.state ?? "").toLowerCase() === "open") {
        setQrMsg("✅ Já está conectado! Atualize o status abaixo.");
      } else {
        setQrMsg("Resposta: " + JSON.stringify(j).slice(0, 200));
      }
    } catch (e) {
      setQrMsg("Erro: " + String(e));
    }
    setQrLoad(false);
  }

  const estado = status?.evolution_status?.instance?.state ?? "—";
  const estadoInfo = ESTADO_LABEL[estado] ?? { label: estado, cor: "#555", bg: "#f4f6fa" };

  return (
    <div style={{ padding: "32px 40px", maxWidth: 760, margin: "0 auto" }}>
      <div style={{ marginBottom: 28 }}>
        <div style={{ fontSize: 22, fontWeight: 700, color: "#1a1a1a" }}>WhatsApp — Bot IA</div>
        <div style={{ fontSize: 13, color: "#666", marginTop: 4 }}>
          Gerencie a conexão do bot com o WhatsApp via Evolution API.
        </div>
      </div>

      {/* Status card */}
      <div style={{ background: "#fff", border: "0.5px solid #DDE2EE", borderRadius: 12, padding: 24, marginBottom: 20 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: "#888", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 16 }}>
          Estado da Conexão
        </div>

        {loading ? (
          <div style={{ color: "#888", fontSize: 14 }}>Carregando…</div>
        ) : (
          <>
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
              <div style={{
                background: estadoInfo.bg, border: `0.5px solid ${estadoInfo.cor}`,
                borderRadius: 8, padding: "6px 16px", fontSize: 14, fontWeight: 700, color: estadoInfo.cor,
              }}>
                {estadoInfo.label}
              </div>
              <button onClick={carregar} style={{
                background: "none", border: "0.5px solid #DDE2EE", borderRadius: 6,
                padding: "5px 14px", fontSize: 12, color: "#555", cursor: "pointer",
              }}>
                ↻ Atualizar
              </button>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, fontSize: 13 }}>
              {status?.vars && Object.entries(status.vars).map(([k, v]) => (
                <div key={k} style={{ background: "#F4F6FA", borderRadius: 6, padding: "8px 12px" }}>
                  <div style={{ fontSize: 11, color: "#888", marginBottom: 2 }}>{k}</div>
                  <div style={{ color: v.startsWith("❌") ? "#E24B4A" : "#16A34A", fontWeight: 600 }}>{v}</div>
                </div>
              ))}
            </div>

            {status?.evolution_webhook?.url && (
              <div style={{ marginTop: 12, padding: "8px 12px", background: "#F4F6FA", borderRadius: 6, fontSize: 12, color: "#555" }}>
                <strong>Webhook:</strong> {status.evolution_webhook.url}
                {" · "}
                <span style={{ color: status.evolution_webhook.enabled ? "#16A34A" : "#E24B4A" }}>
                  {status.evolution_webhook.enabled ? "ativo" : "inativo"}
                </span>
              </div>
            )}
          </>
        )}
      </div>

      {/* Reconectar */}
      <div style={{ background: "#fff", border: "0.5px solid #DDE2EE", borderRadius: 12, padding: 24, marginBottom: 20 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: "#888", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 12 }}>
          Reconectar WhatsApp
        </div>
        <p style={{ fontSize: 13, color: "#555", marginBottom: 16, lineHeight: 1.6 }}>
          Use quando o estado estiver <strong>Desconectado</strong>. Um QR code será gerado — escaneie com o WhatsApp que será o número do bot.
        </p>

        <button
          onClick={reconectar}
          disabled={qrLoad}
          style={{
            background: "#1A4870", color: "#fff", border: "none", borderRadius: 8,
            padding: "10px 24px", fontSize: 14, fontWeight: 600, cursor: qrLoad ? "not-allowed" : "pointer",
            opacity: qrLoad ? 0.7 : 1, marginBottom: 16,
          }}
        >
          {qrLoad ? "Gerando QR code…" : "📲 Gerar QR Code / Reconectar"}
        </button>

        {qrMsg && (
          <div style={{ fontSize: 13, color: "#555", marginBottom: 12, padding: "10px 14px", background: "#F4F6FA", borderRadius: 8 }}>
            {qrMsg}
          </div>
        )}

        {qrBase64 && (
          <div style={{ textAlign: "center", padding: 20, background: "#fff", border: "0.5px solid #DDE2EE", borderRadius: 12, display: "inline-block" }}>
            <img
              src={qrBase64.startsWith("data:") ? qrBase64 : `data:image/png;base64,${qrBase64}`}
              alt="QR Code WhatsApp"
              style={{ width: 240, height: 240, display: "block" }}
            />
            <div style={{ fontSize: 12, color: "#888", marginTop: 8 }}>
              Abra o WhatsApp → ⋮ → Aparelhos Conectados → Conectar um aparelho
            </div>
          </div>
        )}
      </div>

      {/* Usuários */}
      {status?.usuarios_com_whatsapp && status.usuarios_com_whatsapp.length > 0 && (
        <div style={{ background: "#fff", border: "0.5px solid #DDE2EE", borderRadius: 12, padding: 24 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "#888", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 12 }}>
            Usuários com WhatsApp cadastrado ({status.usuarios_com_whatsapp.length})
          </div>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: "0.5px solid #DDE2EE" }}>
                <th style={{ textAlign: "left", padding: "6px 8px", color: "#888", fontWeight: 600 }}>Nome</th>
                <th style={{ textAlign: "left", padding: "6px 8px", color: "#888", fontWeight: 600 }}>WhatsApp</th>
                <th style={{ textAlign: "center", padding: "6px 8px", color: "#888", fontWeight: 600 }}>Ativo</th>
              </tr>
            </thead>
            <tbody>
              {status.usuarios_com_whatsapp.map(u => (
                <tr key={u.id} style={{ borderBottom: "0.5px solid #F4F6FA" }}>
                  <td style={{ padding: "7px 8px", color: "#1a1a1a" }}>{u.nome}</td>
                  <td style={{ padding: "7px 8px", color: "#555", fontFamily: "monospace" }}>{u.whatsapp}</td>
                  <td style={{ padding: "7px 8px", textAlign: "center" }}>
                    <span style={{ color: u.ativo ? "#16A34A" : "#E24B4A" }}>{u.ativo ? "✓" : "✗"}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
