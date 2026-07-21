"use client";
import { useState, useEffect, useCallback } from "react";
import TopNav from "../../../components/TopNav";

// ─── Tipos ───────────────────────────────────────────────────────────────────

type StatusCheck = "ok" | "warn" | "erro" | "carregando";

interface DiagResult {
  vars: {
    EVOLUTION_API_URL:  string;
    EVOLUTION_API_KEY:  string;
    EVOLUTION_INSTANCE: string;
    ANTHROPIC_API_KEY:  string;
    OPENAI_API_KEY:     string;
  };
  evolution_status: unknown;
  evolution_webhook: unknown;
  webhook_events:      string[];
  webhook_enabled:     boolean;
  webhook_has_upsert:  boolean;
  usuarios_com_whatsapp: { id: string; nome: string; whatsapp: string; ativo: boolean }[] | string;
}

interface FixResult {
  fixed: boolean;
  body?: string;
  endpoint?: string;
  novaUrl?: string;
  response?: unknown;
  tried?: unknown[];
  error?: string;
}

interface QrResult {
  ok: boolean;
  base64?: string;
  qrcode?: { base64?: string };
  error?: string;
}

interface TestResult {
  ok: boolean;
  log: string[];
  resposta?: string | null;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function statusIcon(s: StatusCheck) {
  if (s === "ok")         return <span style={{ color: "#16A34A", fontWeight: 700 }}>✅</span>;
  if (s === "erro")       return <span style={{ color: "#DC2626", fontWeight: 700 }}>❌</span>;
  if (s === "warn")       return <span style={{ color: "#D97706", fontWeight: 700 }}>⚠️</span>;
  return <span style={{ color: "#888" }}>⏳</span>;
}

function str(v: unknown): string {
  if (typeof v === "string")  return v;
  if (typeof v === "object" && v !== null) return JSON.stringify(v, null, 2);
  return String(v ?? "");
}

function parseConnectionState(evo: unknown): { state: string; status: StatusCheck } {
  const s = str(evo).toLowerCase();
  if (s.includes("open") || s.includes("connected")) return { state: "Conectado", status: "ok" };
  if (s.includes("close") || s.includes("disconnect")) return { state: "Desconectado — precisa escanear QR", status: "erro" };
  if (s.includes("connecting")) return { state: "Conectando…", status: "warn" };
  if (s.includes("erro") || s.includes("error")) return { state: "Erro de conexão", status: "erro" };
  return { state: str(evo).slice(0, 80), status: "warn" };
}

function parseWebhookState(wh: unknown): { url: string; status: StatusCheck } {
  const s = str(wh);
  const match = s.match(/"url"\s*:\s*"([^"]+)"/);
  const url = match?.[1] ?? "";
  if (url.includes("arato.agr.br") || url.includes("web.arato.agr.br")) {
    return { url, status: "ok" };
  }
  if (!url) return { url: "Webhook não configurado", status: "erro" };
  return { url: `URL errada: ${url}`, status: "erro" };
}

// ─── Componente principal ─────────────────────────────────────────────────────

export default function BotDiagPage() {
  const [diag, setDiag]         = useState<DiagResult | null>(null);
  const [carregando, setCarr]   = useState(false);
  const [fixResult, setFix]     = useState<FixResult | null>(null);
  const [fixLoading, setFixL]   = useState(false);
  const [qrLoading, setQrL]     = useState(false);
  const [qrBase64, setQr]       = useState<string | null>(null);
  const [qrMsg, setQrMsg]       = useState<string | null>(null);
  const [testLoading, setTestL]       = useState(false);
  const [testMsg, setTestMsg]         = useState<string | null>(null);
  const [testeNum, setTesteNum]       = useState("");
  const [testeMens, setTesteMens]     = useState("olá, quanto tenho a pagar essa semana?");
  const [testeResult, setTesteResult] = useState<TestResult | null>(null);
  const [testeLoading, setTesteLoading] = useState(false);

  const [simNum, setSimNum]       = useState("");
  const [simMens, setSimMens]     = useState("quanto tenho a pagar essa semana?");
  const [simLoading, setSimLoading] = useState(false);
  const [simResult, setSimResult] = useState<{ ok: boolean; status?: number; response?: unknown; error?: string } | null>(null);

  const carregar = useCallback(async () => {
    setCarr(true);
    setDiag(null);
    try {
      const r = await fetch("/api/whatsapp/status");
      const json = await r.json() as DiagResult;
      setDiag(json);
    } catch (e) {
      setDiag(null);
      console.error(e);
    }
    setCarr(false);
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  async function fixarWebhook() {
    setFixL(true);
    setFix(null);
    try {
      const r = await fetch("/api/whatsapp/fix-webhook", { method: "POST" });
      const json = await r.json() as FixResult;
      setFix(json);
      if (json.fixed) setTimeout(carregar, 1500);
    } catch (e) { setFix({ fixed: false, error: String(e) }); }
    setFixL(false);
  }

  async function gerarQr() {
    setQrL(true);
    setQr(null);
    setQrMsg(null);
    try {
      const r = await fetch("/api/whatsapp/reconectar", { method: "POST" });
      const json = await r.json() as QrResult;
      const base64 = json.base64 ?? json.qrcode?.base64;
      if (base64) {
        setQr(base64.startsWith("data:") ? base64 : `data:image/png;base64,${base64}`);
        setQrMsg("Escaneie no WhatsApp → Aparelhos Conectados → Conectar um aparelho. Expira em ~60s.");
      } else if (json.error) {
        setQrMsg("Erro: " + json.error);
      } else {
        setQrMsg("Resposta: " + JSON.stringify(json).slice(0, 120));
      }
    } catch (e) { setQrMsg("Falha: " + String(e)); }
    setQrL(false);
  }

  async function testarBot() {
    setTestL(true);
    setTestMsg(null);
    try {
      const r = await fetch("/api/whatsapp/webhook");
      const json = await r.json() as { status?: string };
      setTestMsg("Webhook ativo: " + (json.status ?? JSON.stringify(json)));
    } catch (e) { setTestMsg("Erro: " + String(e)); }
    setTestL(false);
  }

  async function testarFluxo() {
    if (!testeNum.trim()) return;
    setTesteLoading(true);
    setTesteResult(null);
    try {
      const r = await fetch("/api/whatsapp/test-webhook", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ telefone: testeNum.trim().replace(/\D/g, ""), mensagem: testeMens.trim() }),
      });
      const json = await r.json() as TestResult;
      setTesteResult(json);
    } catch (e) {
      setTesteResult({ ok: false, log: ["❌ Erro ao chamar API: " + String(e)] });
    }
    setTesteLoading(false);
  }

  async function simularEvento() {
    if (!simNum.trim()) return;
    setSimLoading(true);
    setSimResult(null);
    try {
      const r = await fetch("/api/whatsapp/simular-evento", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ telefone: simNum.trim().replace(/\D/g, ""), mensagem: simMens.trim() }),
      });
      const json = await r.json() as { ok: boolean; status?: number; response?: unknown; error?: string };
      setSimResult(json);
    } catch (e) {
      setSimResult({ ok: false, error: String(e) });
    }
    setSimLoading(false);
  }

  // ── Interpretação dos resultados ──────────────────────────────────────────
  const conn   = diag ? parseConnectionState(diag.evolution_status) : null;
  const wh     = diag ? parseWebhookState(diag.evolution_webhook)   : null;
  const varOk  = (k: keyof DiagResult["vars"]) => diag?.vars[k]?.startsWith("❌") === false;
  const usuarios = Array.isArray(diag?.usuarios_com_whatsapp) ? diag!.usuarios_com_whatsapp : [];
  const temUpsert = diag?.webhook_has_upsert ?? false;
  const eventos   = diag?.webhook_events ?? [];

  const cardStyle: React.CSSProperties = { background: "var(--bg-card)", border: "0.5px solid var(--border-table)", borderRadius: 12, padding: "20px 24px", marginBottom: 16 };
  const lbl: React.CSSProperties = { fontSize: 11, fontWeight: 700, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 4, display: "block" };
  const btn = (bg: string): React.CSSProperties => ({ padding: "9px 20px", background: bg, color: "#fff", border: "none", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer" });

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh", background: "var(--bg-page)", fontFamily: "system-ui, sans-serif", fontSize: 13 }}>
      <TopNav />
      <main style={{ flex: 1, maxWidth: 860, margin: "0 auto", padding: "24px 24px 40px", width: "100%" }}>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: "var(--text-1)" }}>Bot IA — WhatsApp</h1>
            <p style={{ margin: "4px 0 0", fontSize: 12, color: "var(--text-3)" }}>Diagnóstico e controle do assistente via WhatsApp</p>
          </div>
          <button onClick={carregar} disabled={carregando} style={{ ...btn("#1A4870"), opacity: carregando ? 0.6 : 1 }}>
            {carregando ? "Verificando…" : "↻ Atualizar status"}
          </button>
        </div>

        {/* ── 1. Resumo visual ── */}
        {diag && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 12, marginBottom: 20 }}>
            {[
              { label: "WhatsApp",        st: conn!.status,                                                          detalhe: conn!.state },
              { label: "Webhook URL",     st: wh!.status,                                                            detalhe: wh!.url.length > 36 ? "…" + wh!.url.slice(-36) : wh!.url },
              { label: "Eventos (evo)",   st: temUpsert ? "ok" as const : "erro" as const,                           detalhe: temUpsert ? "MESSAGES_UPSERT ✓" : "MESSAGES_UPSERT não marcado!" },
              { label: "IA (Claude)",     st: varOk("ANTHROPIC_API_KEY") ? "ok" as const : "erro" as const,          detalhe: diag.vars.ANTHROPIC_API_KEY },
              { label: "Usuários bot",    st: usuarios.length > 0 ? "ok" as const : "warn" as const,                 detalhe: `${usuarios.length} com WhatsApp` },
            ].map(c => (
              <div key={c.label} style={{ background: "var(--bg-card)", border: `0.5px solid ${c.st === "erro" ? "#FECACA" : "var(--border-table)"}`, borderRadius: 10, padding: "14px 16px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
                  {statusIcon(c.st)}
                  <span style={{ fontSize: 12, fontWeight: 700, color: "var(--text-1)" }}>{c.label}</span>
                </div>
                <div style={{ fontSize: 11, color: c.st === "erro" ? "#991B1B" : "var(--text-3)", wordBreak: "break-all" }}>{c.detalhe}</div>
              </div>
            ))}
          </div>
        )}

        {/* ── 2. WhatsApp / Conexão ── */}
        <div style={cardStyle}>
          <div style={{ fontWeight: 700, fontSize: 15, color: "var(--text-1)", marginBottom: 14, display: "flex", alignItems: "center", gap: 8 }}>
            💬 Conexão WhatsApp
            {conn && <>{statusIcon(conn.status)}<span style={{ fontWeight: 400, fontSize: 12, color: "var(--text-3)" }}>{conn.state}</span></>}
          </div>

          {conn?.status !== "ok" && (
            <div style={{ background: "#FEF3C7", border: "0.5px solid #FCD34D", borderRadius: 8, padding: "10px 14px", marginBottom: 14, fontSize: 12, color: "#92400E" }}>
              <strong>WhatsApp desconectado.</strong> O número não está conectado na Evolution API. Gere um QR Code e escaneie pelo celular.
            </div>
          )}

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button onClick={gerarQr} disabled={qrLoading} style={{ ...btn("#25D366"), opacity: qrLoading ? 0.6 : 1 }}>
              {qrLoading ? "Gerando…" : "Gerar QR Code"}
            </button>
            <button onClick={testarBot} disabled={testLoading} style={{ ...btn("#1A4870"), opacity: testLoading ? 0.6 : 1 }}>
              {testLoading ? "Testando…" : "Verificar endpoint webhook"}
            </button>
          </div>

          {qrMsg && (
            <div style={{ marginTop: 12, fontSize: 12, padding: "8px 12px", borderRadius: 8,
                          background: qrMsg.startsWith("Erro") || qrMsg.startsWith("Falha") ? "#FEE2E2" : "#F0FFF4",
                          color:      qrMsg.startsWith("Erro") || qrMsg.startsWith("Falha") ? "#991B1B" : "#166534",
                          border: `0.5px solid ${qrMsg.startsWith("Erro") || qrMsg.startsWith("Falha") ? "#FECACA" : "#BBF7D0"}` }}>
              {qrMsg}
            </div>
          )}
          {testMsg && (
            <div style={{ marginTop: 10, fontSize: 12, padding: "8px 12px", borderRadius: 8, background: "#F0F4FA", color: "#1A4870", border: "0.5px solid #B0CEF0" }}>
              {testMsg}
            </div>
          )}
          {qrBase64 && (
            <div style={{ marginTop: 16, display: "flex", gap: 24, alignItems: "flex-start", flexWrap: "wrap" }}>
              <img src={qrBase64} alt="QR Code" style={{ width: 220, height: 220, border: "4px solid #25D366", borderRadius: 12 }} />
              <div style={{ fontSize: 12, color: "var(--text-2)", maxWidth: 300, lineHeight: 1.7 }}>
                <strong>Como conectar:</strong><br />
                1. Abra o WhatsApp no celular<br />
                2. Toque nos três pontos → <em>Aparelhos Conectados</em><br />
                3. Toque em <em>Conectar um aparelho</em><br />
                4. Escaneie o QR code ao lado<br /><br />
                <span style={{ color: "#D97706" }}>⚠️ O QR expira em ~60 segundos.</span><br />
                <button onClick={gerarQr} disabled={qrLoading} style={{ marginTop: 8, padding: "5px 12px", borderRadius: 6, border: "0.5px solid var(--border)", background: "var(--bg-page)", fontSize: 11, cursor: "pointer", color: "#1A4870" }}>
                  Renovar QR
                </button>
              </div>
            </div>
          )}

          {diag && (
            <details style={{ marginTop: 14 }}>
              <summary style={{ fontSize: 11, color: "var(--text-3)", cursor: "pointer" }}>Ver resposta bruta da Evolution API</summary>
              <pre style={{ fontSize: 10, background: "#F4F6FA", padding: 10, borderRadius: 6, marginTop: 6, overflow: "auto", maxHeight: 150 }}>{str(diag.evolution_status)}</pre>
            </details>
          )}
        </div>

        {/* ── 3. Webhook ── */}
        <div style={cardStyle}>
          <div style={{ fontWeight: 700, fontSize: 15, color: "var(--text-1)", marginBottom: 6, display: "flex", alignItems: "center", gap: 8 }}>
            🔗 Webhook
            {wh && <>{statusIcon(wh.status)}</>}
          </div>
          <p style={{ margin: "0 0 14px", fontSize: 12, color: "var(--text-3)" }}>
            O webhook é a URL que a Evolution API usa para nos avisar quando chega uma mensagem no WhatsApp.<br />
            URL correta: <code style={{ background: "#F0F4FA", padding: "2px 6px", borderRadius: 4 }}>https://web.arato.agr.br/api/whatsapp/webhook</code>
          </p>

          {wh?.status !== "ok" && (
            <div style={{ background: "#FEE2E2", border: "0.5px solid #FECACA", borderRadius: 8, padding: "10px 14px", marginBottom: 14, fontSize: 12, color: "#991B1B" }}>
              <strong>Webhook não configurado ou com URL errada.</strong> O WhatsApp está recebendo as mensagens, mas a Evolution API não está repassando para o Arato.
              Clique em "Corrigir Webhook" para resolver automaticamente.
            </div>
          )}

          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <button onClick={fixarWebhook} disabled={fixLoading} style={{ ...btn(wh?.status === "ok" ? "#16A34A" : "#DC2626"), opacity: fixLoading ? 0.6 : 1 }}>
              {fixLoading ? "Corrigindo…" : wh?.status === "ok" ? "✅ Webhook OK — Reconfigurar" : "⚠️ Corrigir Webhook agora"}
            </button>
          </div>

          {fixResult && (
            <div style={{ marginTop: 12, fontSize: 12, padding: "10px 14px", borderRadius: 8,
                          background: fixResult.fixed ? "#F0FFF4" : "#FEF3C7",
                          color:      fixResult.fixed ? "#166534" : "#92400E",
                          border: `0.5px solid ${fixResult.fixed ? "#BBF7D0" : "#FCD34D"}` }}>
              {fixResult.fixed
                ? `✅ Webhook corrigido via ${fixResult.endpoint} (${fixResult.body}). URL: ${fixResult.novaUrl}`
                : `⚠️ Não consegui corrigir automaticamente. ${fixResult.error ?? "Tente manualmente nas configurações da Evolution API."}`}
              {!fixResult.fixed && fixResult.tried && (
                <details style={{ marginTop: 6 }}><summary style={{ cursor: "pointer" }}>Ver tentativas</summary>
                  <pre style={{ fontSize: 10, marginTop: 4, overflow: "auto", maxHeight: 120 }}>{str(fixResult.tried)}</pre>
                </details>
              )}
            </div>
          )}

          {/* Eventos configurados */}
          {diag && (
            <div style={{ marginTop: 14 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 8 }}>Eventos configurados na Evolution API</div>
              {!temUpsert ? (
                <div style={{ background: "#FEE2E2", border: "0.5px solid #FECACA", borderRadius: 8, padding: "12px 16px", fontSize: 12, color: "#991B1B" }}>
                  <strong>⚠️ MESSAGES_UPSERT não está na lista de eventos!</strong><br />
                  <span style={{ display: "block", marginTop: 4, lineHeight: 1.6 }}>
                    Esse é o evento que avisa o Arato quando chega uma mensagem. Sem ele, o bot nunca recebe nada.
                    <br />Clique em <strong>"Corrigir Webhook"</strong> acima, ou acesse o painel da Evolution API manualmente em{" "}
                    <code style={{ background: "rgba(0,0,0,0.06)", padding: "1px 4px", borderRadius: 3 }}>http://178.105.50.101:8080</code>{" "}
                    e marque o evento <strong>MESSAGES_UPSERT</strong> no webhook da instância.
                  </span>
                  <div style={{ marginTop: 8, fontSize: 11, color: "#7F1D1D" }}>
                    Eventos detectados: {eventos.length === 0 ? <em>nenhum</em> : eventos.join(", ")}
                  </div>
                </div>
              ) : (
                <div style={{ background: "#F0FFF4", border: "0.5px solid #BBF7D0", borderRadius: 8, padding: "10px 14px", fontSize: 12, color: "#166534" }}>
                  ✅ Eventos configurados: {eventos.join(", ")}
                </div>
              )}
            </div>
          )}

          {diag && (
            <details style={{ marginTop: 14 }}>
              <summary style={{ fontSize: 11, color: "var(--text-3)", cursor: "pointer" }}>Ver configuração bruta do webhook</summary>
              <pre style={{ fontSize: 10, background: "#F4F6FA", padding: 10, borderRadius: 6, marginTop: 6, overflow: "auto", maxHeight: 150 }}>{str(diag.evolution_webhook)}</pre>
            </details>
          )}
        </div>

        {/* ── 4. Variáveis de ambiente ── */}
        <div style={cardStyle}>
          <div style={{ fontWeight: 700, fontSize: 15, color: "var(--text-1)", marginBottom: 14 }}>🔑 Variáveis de Ambiente</div>
          {diag ? (
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ background: "#F4F6FA" }}>
                  <th style={{ padding: "7px 12px", textAlign: "left", fontSize: 11, fontWeight: 700, color: "var(--text-3)", textTransform: "uppercase" }}>Variável</th>
                  <th style={{ padding: "7px 12px", textAlign: "left", fontSize: 11, fontWeight: 700, color: "var(--text-3)", textTransform: "uppercase" }}>Status</th>
                  <th style={{ padding: "7px 12px", textAlign: "left", fontSize: 11, fontWeight: 700, color: "var(--text-3)", textTransform: "uppercase" }}>Valor (parcial)</th>
                </tr>
              </thead>
              <tbody>
                {(Object.entries(diag.vars) as [string, string][]).map(([k, v], i) => {
                  const ok = !v.startsWith("❌");
                  return (
                    <tr key={k} style={{ borderTop: i > 0 ? "0.5px solid var(--border-row)" : "none" }}>
                      <td style={{ padding: "8px 12px", fontFamily: "monospace", fontSize: 12, color: "var(--text-1)" }}>{k}</td>
                      <td style={{ padding: "8px 12px" }}>{ok ? statusIcon("ok") : statusIcon("erro")}</td>
                      <td style={{ padding: "8px 12px", fontSize: 11, color: "var(--text-3)", fontFamily: "monospace" }}>{v}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : (
            <span style={{ color: "var(--text-3)" }}>{carregando ? "Verificando…" : "—"}</span>
          )}
          {diag && !varOk("ANTHROPIC_API_KEY") && (
            <div style={{ marginTop: 12, background: "#FEE2E2", border: "0.5px solid #FECACA", borderRadius: 8, padding: "10px 14px", fontSize: 12, color: "#991B1B" }}>
              <strong>ANTHROPIC_API_KEY ausente.</strong> O bot não consegue processar mensagens sem essa chave.
              Configure em <strong>Vercel → Settings → Environment Variables</strong> e faça redeploy.
            </div>
          )}
          {diag && !varOk("EVOLUTION_API_URL") && (
            <div style={{ marginTop: 12, background: "#FEE2E2", border: "0.5px solid #FECACA", borderRadius: 8, padding: "10px 14px", fontSize: 12, color: "#991B1B" }}>
              <strong>EVOLUTION_API_URL ausente.</strong> Configure em Vercel → Environment Variables.
            </div>
          )}
        </div>

        {/* ── 5. Usuários cadastrados ── */}
        <div style={cardStyle}>
          <div style={{ fontWeight: 700, fontSize: 15, color: "var(--text-1)", marginBottom: 6 }}>📱 Usuários com WhatsApp Cadastrado</div>
          <p style={{ margin: "0 0 14px", fontSize: 12, color: "var(--text-3)" }}>
            Só esses números conseguem usar o bot. Cadastre o WhatsApp em <strong>Cadastros → Usuários</strong>.
          </p>
          {!diag ? (
            <span style={{ color: "var(--text-3)" }}>{carregando ? "Carregando…" : "—"}</span>
          ) : usuarios.length === 0 ? (
            <div style={{ background: "#FEF3C7", border: "0.5px solid #FCD34D", borderRadius: 8, padding: "10px 14px", fontSize: 12, color: "#92400E" }}>
              Nenhum usuário tem WhatsApp cadastrado. Adicione o número em Cadastros → Usuários → campo WhatsApp.
            </div>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ background: "#F4F6FA" }}>
                  {["Nome", "WhatsApp", "Status"].map(h => (
                    <th key={h} style={{ padding: "7px 12px", textAlign: "left", fontSize: 11, fontWeight: 700, color: "var(--text-3)", textTransform: "uppercase" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {usuarios.map((u, i) => (
                  <tr key={u.id} style={{ borderTop: i > 0 ? "0.5px solid var(--border-row)" : "none" }}>
                    <td style={{ padding: "8px 12px", color: "var(--text-1)", fontWeight: 600 }}>{u.nome}</td>
                    <td style={{ padding: "8px 12px", fontFamily: "monospace", fontSize: 12, color: "var(--text-2)" }}>+{u.whatsapp}</td>
                    <td style={{ padding: "8px 12px" }}>
                      <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 5, background: u.ativo ? "#D5E8F5" : "#F1EFE8", color: u.ativo ? "#0B2D50" : "var(--text-2)" }}>
                        {u.ativo ? "Ativo" : "Inativo"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* ── 5b. Teste de fluxo completo ── */}
        <div style={cardStyle}>
          <div style={{ fontWeight: 700, fontSize: 15, color: "var(--text-1)", marginBottom: 6 }}>🧪 Testar Fluxo Completo</div>
          <p style={{ margin: "0 0 14px", fontSize: 12, color: "var(--text-3)" }}>
            Simula uma mensagem chegando e testa cada etapa: busca do usuário → Claude → Evolution API (enviará uma mensagem de teste real no WhatsApp).
          </p>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr auto", gap: 10, alignItems: "flex-end" }}>
            <div>
              <label style={{ ...lbl }}>Número (DDI+DDD+número)</label>
              <input
                style={{ width: "100%", padding: "8px 10px", border: "0.5px solid var(--border-table)", borderRadius: 8, fontSize: 13, boxSizing: "border-box" as const }}
                placeholder="5565999990000"
                value={testeNum}
                onChange={e => setTesteNum(e.target.value.replace(/\D/g, ""))}
              />
            </div>
            <div>
              <label style={{ ...lbl }}>Mensagem de teste</label>
              <input
                style={{ width: "100%", padding: "8px 10px", border: "0.5px solid var(--border-table)", borderRadius: 8, fontSize: 13, boxSizing: "border-box" as const }}
                value={testeMens}
                onChange={e => setTesteMens(e.target.value)}
              />
            </div>
            <button
              onClick={testarFluxo}
              disabled={testeLoading || !testeNum.trim()}
              style={{ ...btn("#1A4870"), opacity: testeLoading || !testeNum.trim() ? 0.5 : 1, whiteSpace: "nowrap" as const }}
            >
              {testeLoading ? "Testando…" : "▶ Executar teste"}
            </button>
          </div>

          {testeResult && (
            <div style={{ marginTop: 14 }}>
              <div style={{ background: testeResult.ok ? "#F0FFF4" : "#FEF2F2", border: `0.5px solid ${testeResult.ok ? "#BBF7D0" : "#FECACA"}`, borderRadius: 8, padding: "12px 14px" }}>
                <div style={{ fontWeight: 700, fontSize: 13, color: testeResult.ok ? "#166534" : "#991B1B", marginBottom: 10 }}>
                  {testeResult.ok ? "✅ Fluxo completo OK — bot funcionando" : "❌ Problema encontrado — veja o log abaixo"}
                </div>
                <div style={{ display: "grid", gap: 4 }}>
                  {testeResult.log.map((linha, i) => (
                    <div key={i} style={{ fontSize: 12, fontFamily: "monospace", color: linha.startsWith("❌") ? "#991B1B" : linha.startsWith("✅") ? "#166534" : "#555", padding: "2px 0", borderBottom: i < testeResult.log.length - 1 ? "0.5px solid rgba(0,0,0,0.06)" : "none" }}>
                      {linha}
                    </div>
                  ))}
                </div>
                {testeResult.resposta && (
                  <div style={{ marginTop: 10, background: "rgba(255,255,255,0.6)", borderRadius: 6, padding: "8px 12px", fontSize: 12 }}>
                    <strong>Resposta do Claude:</strong><br />
                    <span style={{ color: "#1A4870" }}>{testeResult.resposta.slice(0, 300)}{testeResult.resposta.length > 300 ? "…" : ""}</span>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* ── 5c. Simulação direta — bypass Evolution ── */}
        <div style={cardStyle}>
          <div style={{ fontWeight: 700, fontSize: 15, color: "var(--text-1)", marginBottom: 4 }}>🔬 Simulação Direta (sem Evolution API)</div>
          <p style={{ margin: "0 0 14px", fontSize: 12, color: "var(--text-3)", lineHeight: 1.6 }}>
            Envia um payload falso <em>diretamente</em> ao webhook, como se fosse a Evolution API. Se funcionar aqui mas o bot não responder no WhatsApp, o problema é definitivamente nos <strong>eventos da Evolution API</strong> (MESSAGES_UPSERT desmarcado). Se não funcionar aqui, há um bug no código do webhook.
          </p>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr auto", gap: 10, alignItems: "flex-end" }}>
            <div>
              <label style={{ ...lbl }}>Número (DDI+DDD+número)</label>
              <input
                style={{ width: "100%", padding: "8px 10px", border: "0.5px solid var(--border-table)", borderRadius: 8, fontSize: 13, boxSizing: "border-box" as const }}
                placeholder="5565999990000"
                value={simNum}
                onChange={e => setSimNum(e.target.value.replace(/\D/g, ""))}
              />
            </div>
            <div>
              <label style={{ ...lbl }}>Mensagem simulada</label>
              <input
                style={{ width: "100%", padding: "8px 10px", border: "0.5px solid var(--border-table)", borderRadius: 8, fontSize: 13, boxSizing: "border-box" as const }}
                value={simMens}
                onChange={e => setSimMens(e.target.value)}
              />
            </div>
            <button
              onClick={simularEvento}
              disabled={simLoading || !simNum.trim()}
              style={{ ...btn("#C9921B"), opacity: simLoading || !simNum.trim() ? 0.5 : 1, whiteSpace: "nowrap" as const }}
            >
              {simLoading ? "Simulando…" : "⚡ Simular"}
            </button>
          </div>

          {simResult && (
            <div style={{ marginTop: 14, padding: "12px 14px", borderRadius: 8, background: simResult.ok ? "#F0FFF4" : "#FEF2F2", border: `0.5px solid ${simResult.ok ? "#BBF7D0" : "#FECACA"}` }}>
              <div style={{ fontWeight: 700, fontSize: 13, color: simResult.ok ? "#166534" : "#991B1B", marginBottom: 6 }}>
                {simResult.ok
                  ? "✅ Webhook processou com sucesso — o problema é na Evolution API (eventos não configurados)"
                  : "❌ Webhook retornou erro — verifique os logs na Vercel"}
              </div>
              <div style={{ fontSize: 11, fontFamily: "monospace", color: "var(--text-3)" }}>
                Status HTTP: {simResult.status ?? "—"} | Resposta: {str(simResult.response).slice(0, 200)}
                {simResult.error && <> | Erro: {simResult.error}</>}
              </div>
            </div>
          )}
        </div>

        {/* ── 6. Checklist de resolução ── */}
        <div style={cardStyle}>
          <div style={{ fontWeight: 700, fontSize: 15, color: "var(--text-1)", marginBottom: 14 }}>🔧 O que verificar quando o bot não responde</div>
          <div style={{ display: "grid", gap: 10 }}>
            {[
              { n: "1", titulo: "WhatsApp desconectado", desc: 'Clique em "Gerar QR Code" acima e escaneie pelo celular. É a causa mais comum após dias sem uso.' },
              { n: "2", titulo: "Webhook não configurado", desc: 'Clique em "Corrigir Webhook". Acontece depois de redeployments ou quando a URL muda.' },
              { n: "3", titulo: "Número não cadastrado", desc: "O WhatsApp do usuário precisa estar na tabela Usuários (campo WhatsApp, com DDI+DDD+número). Veja a lista acima." },
              { n: "4", titulo: "ANTHROPIC_API_KEY ausente", desc: "Configure a chave da API do Claude em Vercel → Settings → Environment Variables e faça redeploy." },
              { n: "5", titulo: "Timeout no Vercel", desc: "O plano Pro tem limite de 5 min de execução. Mensagens muito longas podem estourar. Verifique os logs em Vercel → Deployments → Functions." },
            ].map(item => (
              <div key={item.n} style={{ display: "flex", gap: 12, padding: "10px 14px", background: "#F4F6FA", borderRadius: 8 }}>
                <span style={{ minWidth: 24, height: 24, background: "#1A4870", color: "#fff", borderRadius: 12, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, flexShrink: 0 }}>{item.n}</span>
                <div>
                  <div style={{ fontWeight: 700, color: "var(--text-1)", fontSize: 13, marginBottom: 3 }}>{item.titulo}</div>
                  <div style={{ fontSize: 12, color: "var(--text-3)", lineHeight: 1.5 }}>{item.desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

      </main>
    </div>
  );
}
