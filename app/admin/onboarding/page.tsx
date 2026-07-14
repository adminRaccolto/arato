"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import { createClient } from "@supabase/supabase-js";

interface OnboardingSession {
  id: string;
  telefone: string;
  etapa: string;
  concluido: boolean;
  conta_id: string | null;
  fazenda_id: string | null;
  dados_coletados: Record<string, unknown>;
  messages: Array<{ role: string; content: string | unknown[] }>;
  created_at: string;
  updated_at: string;
}

const ETAPA_LABEL: Record<string, string> = {
  inicio: "Início",
  fazenda: "Fazenda",
  talhoes: "Talhões",
  produtores: "Produtores",
  ciclo: "Ciclo",
  fiscal: "Fiscal",
  usuario: "Usuário",
  concluido: "✅ Concluído",
};

const ETAPA_COR: Record<string, string> = {
  inicio: "#888",
  fazenda: "#378ADD",
  talhoes: "#5B6CF8",
  produtores: "#C9921B",
  ciclo: "#16A34A",
  fiscal: "#E24B4A",
  usuario: "#1A4870",
  concluido: "#16A34A",
};

function etapaProgresso(etapa: string): number {
  const ordem = ["inicio", "fazenda", "talhoes", "produtores", "ciclo", "fiscal", "usuario", "concluido"];
  const i = ordem.indexOf(etapa);
  return Math.round(((i < 0 ? 0 : i) / (ordem.length - 1)) * 100);
}

function extrairTexto(content: string | unknown[]): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    const textBlock = content.find((b) => (b as Record<string, string>).type === "text");
    return (textBlock as Record<string, string>)?.text ?? "[ferramenta]";
  }
  return "";
}

export default function OnboardingAdminPage() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  const [sessions, setSessions] = useState<OnboardingSession[]>([]);
  const [selected, setSelected] = useState<OnboardingSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [filtro, setFiltro] = useState<"todos" | "ativos" | "concluidos">("todos");

  // Modo teste
  const [testPhone, setTestPhone] = useState("test_" + Date.now());
  const [testInput, setTestInput] = useState("");
  const [testSending, setTestSending] = useState(false);
  const [testMessages, setTestMessages] = useState<Array<{ role: string; content: string }>>([]);
  const endRef = useRef<HTMLDivElement>(null);

  const carregar = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from("agente_onboarding")
      .select("*")
      .order("updated_at", { ascending: false })
      .limit(50);
    setSessions((data ?? []) as OnboardingSession[]);
    setLoading(false);
  }, []);

  useEffect(() => { carregar(); }, [carregar]);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [testMessages]);

  const sessoesFiltradas = sessions.filter(s => {
    if (filtro === "ativos") return !s.concluido;
    if (filtro === "concluidos") return s.concluido;
    return true;
  });

  async function enviarTeste() {
    if (!testInput.trim() || testSending) return;
    const msg = testInput.trim();
    setTestInput("");
    setTestSending(true);

    setTestMessages(prev => [...prev, { role: "user", content: msg }]);

    try {
      const res = await fetch("/api/agente/implantar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ telefone: testPhone, mensagem: msg, modo_teste: true }),
      });
      const json = await res.json() as { resposta?: string; error?: string; etapa?: string };

      const resposta = json.resposta ?? json.error ?? "Sem resposta";
      setTestMessages(prev => [...prev, { role: "assistant", content: resposta }]);

      // Recarrega lista para refletir nova sessão
      carregar();
    } catch (e) {
      setTestMessages(prev => [...prev, { role: "assistant", content: `Erro: ${e}` }]);
    } finally {
      setTestSending(false);
    }
  }

  async function excluirSessao(id: string) {
    if (!confirm("Excluir esta sessão de onboarding?")) return;
    await supabase.from("agente_onboarding").delete().eq("id", id);
    setSessions(prev => prev.filter(s => s.id !== id));
    if (selected?.id === id) setSelected(null);
  }

  function novoTeste() {
    setTestPhone("test_" + Date.now());
    setTestMessages([]);
  }

  return (
    <div style={{ fontFamily: "system-ui, sans-serif", fontSize: 13, color: "var(--text-1, #1a1a1a)", minHeight: "100vh", background: "var(--bg-page, #F4F6FA)" }}>

      {/* Header */}
      <div style={{ background: "var(--bg-card, #fff)", borderBottom: "0.5px solid var(--border, #DDE2EE)", padding: "16px 24px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <div style={{ fontSize: 16, fontWeight: 700, color: "#1A4870" }}>Agente Implantador</div>
          <div style={{ fontSize: 11, color: "var(--text-3, #888)" }}>Onboarding autônomo de novos clientes via WhatsApp</div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            onClick={carregar}
            style={{ background: "var(--bg-page, #F4F6FA)", border: "0.5px solid var(--border, #DDE2EE)", borderRadius: 7, padding: "6px 14px", fontSize: 12, cursor: "pointer", color: "var(--text-2, #555)" }}
          >
            ↺ Atualizar
          </button>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "300px 1fr 380px", gap: 0, height: "calc(100vh - 65px)" }}>

        {/* ── Coluna 1: Lista de sessões ── */}
        <div style={{ background: "var(--bg-card, #fff)", borderRight: "0.5px solid var(--border, #DDE2EE)", display: "flex", flexDirection: "column", overflow: "hidden" }}>
          {/* Filtros */}
          <div style={{ padding: "10px 12px", borderBottom: "0.5px solid var(--border, #DDE2EE)", display: "flex", gap: 4 }}>
            {(["todos", "ativos", "concluidos"] as const).map(f => (
              <button
                key={f}
                onClick={() => setFiltro(f)}
                style={{
                  flex: 1, padding: "4px 0", fontSize: 11, borderRadius: 6, border: "none", cursor: "pointer",
                  background: filtro === f ? "#1A4870" : "var(--bg-page, #F4F6FA)",
                  color: filtro === f ? "#fff" : "var(--text-2, #555)",
                  fontWeight: filtro === f ? 600 : 400,
                }}
              >
                {f === "todos" ? "Todos" : f === "ativos" ? "Ativos" : "Concluídos"}
              </button>
            ))}
          </div>

          {/* Lista */}
          <div style={{ flex: 1, overflowY: "auto" }}>
            {loading ? (
              <div style={{ padding: 20, textAlign: "center", color: "var(--text-3, #888)" }}>Carregando...</div>
            ) : sessoesFiltradas.length === 0 ? (
              <div style={{ padding: 20, textAlign: "center", color: "var(--text-3, #888)" }}>Nenhuma sessão</div>
            ) : (
              sessoesFiltradas.map(s => {
                const ativa = selected?.id === s.id;
                const prog = etapaProgresso(s.etapa);
                return (
                  <div
                    key={s.id}
                    onClick={() => setSelected(s)}
                    style={{
                      padding: "10px 12px",
                      borderBottom: "0.5px solid var(--border, #DDE2EE)",
                      background: ativa ? "#D5E8F5" : "transparent",
                      borderLeft: ativa ? "3px solid #1A4870" : "3px solid transparent",
                      cursor: "pointer",
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 4 }}>
                      <div style={{ fontWeight: 600, fontSize: 12, color: ativa ? "#1A4870" : "var(--text-1, #1a1a1a)" }}>
                        {(s.dados_coletados.fazenda as Record<string, string> | undefined)?.nome ?? s.telefone}
                      </div>
                      <button
                        onClick={e => { e.stopPropagation(); excluirSessao(s.id); }}
                        style={{ background: "none", border: "none", color: "#ccc", cursor: "pointer", fontSize: 14, padding: "0 2px", visibility: ativa ? "visible" : "hidden" }}
                      >
                        ×
                      </button>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                      <span style={{
                        fontSize: 10, padding: "1px 7px", borderRadius: 8, fontWeight: 600,
                        background: s.concluido ? "#D1FAE5" : "#EFF3FA",
                        color: ETAPA_COR[s.etapa] ?? "#555",
                      }}>
                        {ETAPA_LABEL[s.etapa] ?? s.etapa}
                      </span>
                      <span style={{ fontSize: 10, color: "var(--text-3, #888)" }}>
                        {new Date(s.updated_at).toLocaleDateString("pt-BR")}
                      </span>
                    </div>
                    <div style={{ height: 3, background: "var(--border, #DDE2EE)", borderRadius: 2 }}>
                      <div style={{ height: "100%", width: `${prog}%`, background: s.concluido ? "#16A34A" : "#1A4870", borderRadius: 2, transition: "width 0.3s" }} />
                    </div>
                    <div style={{ fontSize: 10, color: "var(--text-3, #888)", marginTop: 3 }}>
                      {s.telefone.startsWith("test") ? "🧪 Modo teste" : `📱 ${s.telefone}`}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* ── Coluna 2: Histórico da sessão selecionada ── */}
        <div style={{ background: "var(--bg-page, #F4F6FA)", overflow: "hidden", display: "flex", flexDirection: "column" }}>
          {selected ? (
            <>
              {/* Header da sessão */}
              <div style={{ background: "var(--bg-card, #fff)", padding: "12px 20px", borderBottom: "0.5px solid var(--border, #DDE2EE)" }}>
                <div style={{ fontWeight: 700, fontSize: 14, color: "#1A4870" }}>
                  {(selected.dados_coletados.fazenda as Record<string, string> | undefined)?.nome ?? selected.telefone}
                </div>
                <div style={{ fontSize: 11, color: "var(--text-3, #888)", marginTop: 2 }}>
                  Etapa: <strong>{ETAPA_LABEL[selected.etapa]}</strong> · Última atualização: {new Date(selected.updated_at).toLocaleString("pt-BR")}
                </div>
                {/* Dados coletados */}
                {Object.keys(selected.dados_coletados).length > 0 && (
                  <div style={{ marginTop: 8, display: "flex", flexWrap: "wrap", gap: 6 }}>
                    {!!selected.dados_coletados.fazenda && (
                      <span style={{ fontSize: 10, background: "#D5E8F5", color: "#0B2D50", padding: "2px 8px", borderRadius: 8 }}>
                        🏡 {(selected.dados_coletados.fazenda as Record<string, string>).nome} · {String((selected.dados_coletados.fazenda as Record<string, unknown>).area_total_ha)}ha
                      </span>
                    )}
                    {!!((selected.dados_coletados.talhoes as unknown[] | undefined)?.length) && (
                      <span style={{ fontSize: 10, background: "#EFF3FA", color: "#1A4870", padding: "2px 8px", borderRadius: 8 }}>
                        🌾 {(selected.dados_coletados.talhoes as unknown[]).length} talhão(s)
                      </span>
                    )}
                    {!!((selected.dados_coletados.produtores as unknown[] | undefined)?.length) && (
                      <span style={{ fontSize: 10, background: "#FBF3E0", color: "#7A5200", padding: "2px 8px", borderRadius: 8 }}>
                        👤 {(selected.dados_coletados.produtores as unknown[]).length} produtor(es)
                      </span>
                    )}
                    {!!selected.dados_coletados.ciclo && (
                      <span style={{ fontSize: 10, background: "#D1FAE5", color: "#065F46", padding: "2px 8px", borderRadius: 8 }}>
                        📅 {(selected.dados_coletados.ciclo as Record<string, string>).cultura} {(selected.dados_coletados.ciclo as Record<string, string>).ano_safra}
                      </span>
                    )}
                    {!!selected.dados_coletados.usuario && (
                      <span style={{ fontSize: 10, background: "#F3E8FF", color: "#6B21A8", padding: "2px 8px", borderRadius: 8 }}>
                        🔑 {(selected.dados_coletados.usuario as Record<string, string>).email}
                      </span>
                    )}
                  </div>
                )}
              </div>

              {/* Conversa */}
              <div style={{ flex: 1, overflowY: "auto", padding: "16px 20px", display: "flex", flexDirection: "column", gap: 12 }}>
                {selected.messages.map((msg, i) => {
                  const texto = extrairTexto(msg.content as string | unknown[]);
                  if (!texto || texto === "[ferramenta]") return null;
                  return (
                    <div key={i} style={{ display: "flex", justifyContent: msg.role === "user" ? "flex-end" : "flex-start", gap: 8 }}>
                      {msg.role === "assistant" && (
                        <div style={{ width: 26, height: 26, background: "#1A4870", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 12, flexShrink: 0 }}>🤖</div>
                      )}
                      <div style={{
                        maxWidth: "75%",
                        background: msg.role === "user" ? "#1A4870" : "var(--bg-card, #fff)",
                        color: msg.role === "user" ? "#fff" : "var(--text-1, #1a1a1a)",
                        borderRadius: msg.role === "user" ? "16px 16px 4px 16px" : "16px 16px 16px 4px",
                        padding: "8px 12px", fontSize: 12, lineHeight: 1.6,
                        border: msg.role === "assistant" ? "0.5px solid var(--border, #DDE2EE)" : "none",
                        whiteSpace: "pre-wrap",
                      }}>
                        {texto}
                      </div>
                      {msg.role === "user" && (
                        <div style={{ width: 26, height: 26, background: "#FDE9BB", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, color: "#C9921B", flexShrink: 0 }}>C</div>
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          ) : (
            <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", color: "var(--text-3, #888)", gap: 8 }}>
              <div style={{ fontSize: 40 }}>📋</div>
              <div style={{ fontSize: 13 }}>Selecione uma sessão para ver o histórico</div>
            </div>
          )}
        </div>

        {/* ── Coluna 3: Painel de teste ── */}
        <div style={{ borderLeft: "0.5px solid var(--border, #DDE2EE)", background: "var(--bg-card, #fff)", display: "flex", flexDirection: "column", overflow: "hidden" }}>
          <div style={{ padding: "12px 16px", borderBottom: "0.5px solid var(--border, #DDE2EE)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <div style={{ fontWeight: 600, fontSize: 13, color: "#1A4870" }}>🧪 Modo Teste</div>
              <div style={{ fontSize: 10, color: "var(--text-3, #888)" }}>Simula uma conversa WhatsApp</div>
            </div>
            <button
              onClick={novoTeste}
              style={{ background: "var(--bg-page, #F4F6FA)", border: "0.5px solid var(--border, #DDE2EE)", borderRadius: 6, padding: "4px 10px", fontSize: 11, cursor: "pointer", color: "var(--text-2, #555)" }}
            >
              + Nova sessão
            </button>
          </div>

          {/* Config do teste */}
          <div style={{ padding: "8px 14px", borderBottom: "0.5px solid var(--border, #DDE2EE)", background: "var(--bg-page, #F4F6FA)" }}>
            <label style={{ fontSize: 10, color: "var(--text-3, #888)", display: "block", marginBottom: 3 }}>ID da sessão de teste</label>
            <input
              value={testPhone}
              onChange={e => setTestPhone(e.target.value)}
              style={{ width: "100%", border: "0.5px solid var(--border, #DDE2EE)", borderRadius: 6, padding: "5px 8px", fontSize: 11, boxSizing: "border-box", background: "var(--bg-card, #fff)" }}
            />
          </div>

          {/* Mensagens do teste */}
          <div style={{ flex: 1, overflowY: "auto", padding: "12px 14px", display: "flex", flexDirection: "column", gap: 10 }}>
            {testMessages.length === 0 ? (
              <div style={{ textAlign: "center", marginTop: 40, color: "var(--text-3, #888)" }}>
                <div style={{ fontSize: 28, marginBottom: 8 }}>💬</div>
                <div style={{ fontSize: 12 }}>Digite uma mensagem para iniciar o onboarding de teste</div>
                <div style={{ fontSize: 11, marginTop: 8, color: "var(--text-muted, #aaa)" }}>
                  Sugestão: "Olá, quero configurar meu sistema"
                </div>
              </div>
            ) : (
              testMessages.map((msg, i) => (
                <div key={i} style={{ display: "flex", justifyContent: msg.role === "user" ? "flex-end" : "flex-start", gap: 6 }}>
                  {msg.role === "assistant" && (
                    <div style={{ width: 24, height: 24, background: "#1A4870", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 11, flexShrink: 0 }}>🤖</div>
                  )}
                  <div style={{
                    maxWidth: "80%",
                    background: msg.role === "user" ? "#1A4870" : "var(--bg-page, #F4F6FA)",
                    color: msg.role === "user" ? "#fff" : "var(--text-1, #1a1a1a)",
                    borderRadius: msg.role === "user" ? "14px 14px 4px 14px" : "14px 14px 14px 4px",
                    padding: "7px 11px", fontSize: 12, lineHeight: 1.5,
                    border: msg.role === "assistant" ? "0.5px solid var(--border, #DDE2EE)" : "none",
                    whiteSpace: "pre-wrap",
                  }}>
                    {msg.content}
                  </div>
                </div>
              ))
            )}
            {testSending && (
              <div style={{ display: "flex", gap: 6 }}>
                <div style={{ width: 24, height: 24, background: "#1A4870", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 11, flexShrink: 0 }}>🤖</div>
                <div style={{ background: "var(--bg-page, #F4F6FA)", border: "0.5px solid var(--border, #DDE2EE)", borderRadius: "14px 14px 14px 4px", padding: "10px 14px" }}>
                  <div style={{ display: "flex", gap: 3 }}>
                    {[0, 1, 2].map(i => (
                      <div key={i} style={{ width: 5, height: 5, background: "#1A4870", borderRadius: "50%", animation: `pulse 1.2s ease-in-out ${i * 0.2}s infinite` }} />
                    ))}
                  </div>
                </div>
              </div>
            )}
            <div ref={endRef} />
          </div>

          {/* Input do teste */}
          <div style={{ padding: "10px 12px", borderTop: "0.5px solid var(--border, #DDE2EE)", display: "flex", gap: 6 }}>
            <input
              value={testInput}
              onChange={e => setTestInput(e.target.value)}
              onKeyDown={e => e.key === "Enter" && enviarTeste()}
              placeholder="Digite uma mensagem..."
              disabled={testSending}
              style={{
                flex: 1, border: "0.5px solid var(--border, #DDE2EE)", borderRadius: 8, padding: "7px 12px",
                fontSize: 12, outline: "none", background: testSending ? "var(--bg-page, #F4F6FA)" : "var(--bg-card, #fff)",
              }}
            />
            <button
              onClick={enviarTeste}
              disabled={!testInput.trim() || testSending}
              style={{
                background: !testInput.trim() || testSending ? "#ccc" : "#1A4870",
                color: "#fff", border: "none", borderRadius: 8,
                width: 36, height: 36, fontSize: 16, cursor: !testInput.trim() || testSending ? "not-allowed" : "pointer",
                display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
              }}
            >
              ↑
            </button>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes pulse {
          0%, 80%, 100% { transform: scale(0.8); opacity: 0.4; }
          40% { transform: scale(1); opacity: 1; }
        }
      `}</style>
    </div>
  );
}
