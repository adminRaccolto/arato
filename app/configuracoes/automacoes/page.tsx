"use client";
import { useState } from "react";
import TopNav from "../../../components/TopNav";
import { useAuth } from "../../../components/AuthProvider";

// ─── Tipos ────────────────────────────────────────────────────
type StatusExec = "idle" | "running" | "ok" | "error";

type Automacao = {
  id: string;
  nome: string;
  descricao: string;
  schedule: string;           // cron expression
  scheduleLabel: string;      // legível
  endpoint: string;
  cor: string;
  icone: string;
  categoria: "alertas" | "relatorios" | "mercado" | "fiscal";
};

const AUTOMACOES: Automacao[] = [
  {
    id: "alertas-vencimento",
    nome: "Alertas de Vencimento",
    descricao: "Verifica CP, CR, arrendamentos e certificado A1 vencendo nos próximos 7 dias e envia e-mail de alerta.",
    schedule: "0 10 * * *",
    scheduleLabel: "Todo dia às 7h",
    endpoint: "/api/cron/alertas-vencimento",
    cor: "#E24B4A",
    icone: "🔔",
    categoria: "alertas",
  },
  {
    id: "relatorio-semanal",
    nome: "Relatório Semanal",
    descricao: "Envia por e-mail o resumo financeiro da semana: CP/CR a vencer, vencidos, saldo projetado e preços de mercado.",
    schedule: "0 10 * * 1",
    scheduleLabel: "Toda segunda-feira às 7h",
    endpoint: "/api/cron/relatorio-semanal",
    cor: "#1A4870",
    icone: "📊",
    categoria: "relatorios",
  },
  {
    id: "precos-mercado",
    nome: "Atualização de Preços",
    descricao: "Atualiza cotações de Soja, Milho, Algodão (CBOT/B3) e USD/BRL. Já roda automaticamente ao abrir o Dashboard.",
    schedule: "0 10 * * *",
    scheduleLabel: "Todo dia às 7h (+ ao vivo no Dashboard)",
    endpoint: "/api/precos",
    cor: "#C9921B",
    icone: "📈",
    categoria: "mercado",
  },
];

const CAT_LABEL: Record<string, string> = {
  alertas:   "Alertas",
  relatorios: "Relatórios",
  mercado:   "Mercado",
  fiscal:    "Fiscal",
};

// ─── Página ───────────────────────────────────────────────────
export default function AutomacoesPage() {
  const { nomeUsuario } = useAuth();
  const [status, setStatus] = useState<Record<string, StatusExec>>({});
  const [resultados, setResultados] = useState<Record<string, string>>({});
  const [emailConfig, setEmailConfig] = useState({ from: "", destinatario: "" });
  const [salvandoEmail, setSalvandoEmail] = useState(false);

  async function executar(aut: Automacao) {
    setStatus(s => ({ ...s, [aut.id]: "running" }));
    setResultados(r => ({ ...r, [aut.id]: "" }));
    try {
      const res = await fetch(aut.endpoint, { method: "GET" });
      const json = await res.json().catch(() => ({}));
      if (res.ok) {
        const msg = json.enviados != null
          ? `Concluído — ${json.enviados} e-mail${json.enviados !== 1 ? "s" : ""} enviado${json.enviados !== 1 ? "s" : ""}`
          : json.msg ?? "Executado com sucesso";
        setResultados(r => ({ ...r, [aut.id]: msg }));
        setStatus(s => ({ ...s, [aut.id]: "ok" }));
      } else {
        setResultados(r => ({ ...r, [aut.id]: json.error ?? `Erro HTTP ${res.status}` }));
        setStatus(s => ({ ...s, [aut.id]: "error" }));
      }
    } catch (err) {
      setResultados(r => ({ ...r, [aut.id]: String(err) }));
      setStatus(s => ({ ...s, [aut.id]: "error" }));
    }
    // reset badge após 8s
    setTimeout(() => setStatus(s => ({ ...s, [aut.id]: "idle" })), 8000);
  }

  const categorias = [...new Set(AUTOMACOES.map(a => a.categoria))];

  return (
    <>
      <TopNav />
      <main style={{ padding: "24px 28px", background: "#F4F6FA", minHeight: "calc(100vh - 96px)", fontFamily: "system-ui, sans-serif" }}>

        {/* ── Cabeçalho ── */}
        <div style={{ marginBottom: 24 }}>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: "#1a1a1a", margin: 0 }}>Automações</h1>
          <p style={{ fontSize: 13, color: "#666", margin: "4px 0 0" }}>
            Jobs agendados que rodam automaticamente na Vercel. Você pode disparar manualmente para testar.
          </p>
        </div>

        {/* ── Banner infraestrutura ── */}
        <div style={{ background: "#EBF5FF", border: "0.5px solid #93C5FD", borderRadius: 10, padding: "12px 16px", marginBottom: 24, display: "flex", gap: 12, alignItems: "flex-start" }}>
          <span style={{ fontSize: 18 }}>⚙️</span>
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: "#1e40af" }}>Cron Jobs na Vercel</div>
            <div style={{ fontSize: 12, color: "#1e40af", marginTop: 2 }}>
              Os jobs rodam automaticamente no horário programado. O agendamento usa UTC — os horários abaixo já estão convertidos para horário de Brasília (UTC-3).
              Para monitorar execuções: Vercel Dashboard → Functions → Cron Jobs.
            </div>
          </div>
        </div>

        {/* ── Cards por categoria ── */}
        {categorias.map(cat => {
          const lista = AUTOMACOES.filter(a => a.categoria === cat);
          return (
            <div key={cat} style={{ marginBottom: 28 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: "#888", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 10 }}>
                {CAT_LABEL[cat]}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {lista.map(aut => {
                  const st = status[aut.id] ?? "idle";
                  const res = resultados[aut.id];
                  return (
                    <div
                      key={aut.id}
                      style={{
                        background: "#fff",
                        border: `0.5px solid ${st === "ok" ? "#86EFAC" : st === "error" ? "#FECACA" : "#DDE2EE"}`,
                        borderRadius: 10,
                        padding: "16px 20px",
                        display: "flex",
                        alignItems: "flex-start",
                        gap: 16,
                        transition: "border-color 0.3s",
                      }}
                    >
                      {/* Ícone */}
                      <div style={{ width: 44, height: 44, borderRadius: 10, background: `${aut.cor}18`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, flexShrink: 0 }}>
                        {aut.icone}
                      </div>

                      {/* Info */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
                          <span style={{ fontSize: 14, fontWeight: 700, color: "#1a1a1a" }}>{aut.nome}</span>
                          <span style={{ fontSize: 11, color: "#888", background: "#F3F6F9", padding: "2px 8px", borderRadius: 20, border: "0.5px solid #DDE2EE" }}>
                            🕐 {aut.scheduleLabel}
                          </span>
                        </div>
                        <p style={{ fontSize: 13, color: "#555", margin: 0, lineHeight: 1.5 }}>{aut.descricao}</p>

                        {/* Endpoint */}
                        <div style={{ marginTop: 8, fontSize: 11, color: "#aaa", fontFamily: "monospace" }}>
                          GET {aut.endpoint}
                        </div>

                        {/* Resultado */}
                        {res && (
                          <div style={{
                            marginTop: 8, fontSize: 12, padding: "6px 10px", borderRadius: 6,
                            background: st === "error" ? "#FEF2F2" : "#F0FDF4",
                            color: st === "error" ? "#991B1B" : "#166534",
                            border: `0.5px solid ${st === "error" ? "#FECACA" : "#86EFAC"}`,
                          }}>
                            {st === "error" ? "✗ " : "✓ "}{res}
                          </div>
                        )}
                      </div>

                      {/* Botão executar */}
                      <button
                        onClick={() => executar(aut)}
                        disabled={st === "running"}
                        style={{
                          padding: "8px 16px", borderRadius: 7, border: "none", cursor: st === "running" ? "not-allowed" : "pointer",
                          background: st === "running" ? "#F3F6F9"
                            : st === "ok" ? "#16A34A"
                            : st === "error" ? "#E24B4A"
                            : aut.cor,
                          color: st === "running" ? "#aaa" : "#fff",
                          fontSize: 12, fontWeight: 600, whiteSpace: "nowrap", flexShrink: 0,
                          transition: "background 0.3s",
                          minWidth: 100,
                        }}
                      >
                        {st === "running" ? "Executando..." : st === "ok" ? "✓ Concluído" : st === "error" ? "✗ Erro" : "▶ Executar"}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}

        {/* ── Configuração de e-mail ── */}
        <div style={{ background: "#fff", border: "0.5px solid #DDE2EE", borderRadius: 10, padding: "20px 24px", marginBottom: 24 }}>
          <h2 style={{ fontSize: 15, fontWeight: 700, color: "#1a1a1a", margin: "0 0 4px" }}>Configuração de E-mail</h2>
          <p style={{ fontSize: 12, color: "#888", margin: "0 0 16px" }}>
            O e-mail do destinatário é carregado automaticamente do perfil de cada usuário cadastrado. Configure abaixo o remetente.
          </p>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, maxWidth: 600 }}>
            <div>
              <label style={{ fontSize: 11, color: "#888", display: "block", marginBottom: 4 }}>Remetente (variável RESEND_FROM)</label>
              <input
                value={emailConfig.from}
                onChange={e => setEmailConfig(c => ({ ...c, from: e.target.value }))}
                placeholder="alertas@ractech.com.br"
                style={{ width: "100%", padding: "8px 10px", borderRadius: 7, border: "0.5px solid #DDE2EE", fontSize: 13, boxSizing: "border-box" }}
              />
              <div style={{ fontSize: 11, color: "#aaa", marginTop: 4 }}>
                Configure em Vercel → Settings → Environment Variables → <code>RESEND_FROM</code>
              </div>
            </div>
            <div>
              <label style={{ fontSize: 11, color: "#888", display: "block", marginBottom: 4 }}>Destinatário padrão (fallback)</label>
              <input
                value={emailConfig.destinatario}
                onChange={e => setEmailConfig(c => ({ ...c, destinatario: e.target.value }))}
                placeholder={nomeUsuario ? `${nomeUsuario}@email.com` : "email@fazenda.com"}
                style={{ width: "100%", padding: "8px 10px", borderRadius: 7, border: "0.5px solid #DDE2EE", fontSize: 13, boxSizing: "border-box" }}
              />
              <div style={{ fontSize: 11, color: "#aaa", marginTop: 4 }}>
                Usado quando o perfil não tem e-mail cadastrado
              </div>
            </div>
          </div>
        </div>

        {/* ── Variáveis de ambiente necessárias ── */}
        <div style={{ background: "#FAFBFD", border: "0.5px solid #DDE2EE", borderRadius: 10, padding: "16px 20px" }}>
          <h2 style={{ fontSize: 13, fontWeight: 700, color: "#333", margin: "0 0 12px" }}>Variáveis de Ambiente Necessárias</h2>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {[
              { key: "RESEND_API_KEY", desc: "Chave da API Resend para envio de e-mails", link: "https://resend.com/api-keys", obrig: true },
              { key: "RESEND_FROM", desc: "E-mail remetente verificado no Resend (ex: alertas@ractech.com.br)", obrig: true },
              { key: "SUPABASE_SERVICE_ROLE_KEY", desc: "Service Role Key do Supabase — permite leitura sem RLS", obrig: true },
              { key: "CRON_SECRET", desc: "Segredo para proteger os endpoints cron de chamadas externas", obrig: false },
              { key: "NEXT_PUBLIC_APP_URL", desc: "URL pública do app (ex: https://arato.vercel.app) — usada pelo relatório semanal para buscar preços", obrig: false },
            ].map(v => (
              <div key={v.key} style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "8px 0", borderBottom: "0.5px solid #F0F2F8" }}>
                <code style={{ fontSize: 12, background: "#F0F2F8", padding: "2px 8px", borderRadius: 5, color: "#1A4870", minWidth: 240, flexShrink: 0 }}>{v.key}</code>
                <span style={{ fontSize: 12, color: "#555", flex: 1 }}>{v.desc}</span>
                <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 10, background: v.obrig ? "#FEF2F2" : "#F3F6F9", color: v.obrig ? "#991B1B" : "#888", border: `0.5px solid ${v.obrig ? "#FECACA" : "#DDE2EE"}`, flexShrink: 0 }}>
                  {v.obrig ? "Obrigatório" : "Opcional"}
                </span>
              </div>
            ))}
          </div>
          <div style={{ marginTop: 10, fontSize: 12, color: "#888" }}>
            Configure em: Vercel Dashboard → Project → Settings → Environment Variables
          </div>
        </div>

      </main>
    </>
  );
}
