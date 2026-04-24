"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import TopNav from "@/components/TopNav";
import { useAuth } from "@/components/AuthProvider";
import { supabase } from "@/lib/supabase";
import {
  listarConversasSuporte, criarConversaSuporte, excluirConversa,
  listarMensagensSuporte, salvarMensagemSuporte,
} from "@/lib/db";
import type { SuporteConversa, SuporteMensagem } from "@/lib/supabase";

export default function SuportePage() {
  const { fazendaId } = useAuth();
  const [userId, setUserId] = useState<string | null>(null);
  const [conversas, setConversas] = useState<SuporteConversa[]>([]);
  const [conversaAtiva, setConversaAtiva] = useState<SuporteConversa | null>(null);
  const [mensagens, setMensagens] = useState<SuporteMensagem[]>([]);
  const [input, setInput] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [loadingConversas, setLoadingConversas] = useState(true);
  const [loadingMensagens, setLoadingMensagens] = useState(false);
  const [erroGeral, setErroGeral] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => { if (data.user) setUserId(data.user.id); });
  }, []);

  const carregarConversas = useCallback(async () => {
    if (!fazendaId || !userId) return;
    setLoadingConversas(true);
    setErroGeral(null);
    try {
      const data = await listarConversasSuporte(fazendaId, userId);
      setConversas(data);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes("does not exist") || msg.includes("relation")) {
        setErroGeral("As tabelas do Suporte IA ainda não foram criadas no banco de dados. Execute a Migration 47 no Supabase SQL Editor.");
      } else {
        setErroGeral("Erro ao carregar conversas: " + msg);
      }
    } finally { setLoadingConversas(false); }
  }, [fazendaId, userId]);

  useEffect(() => { carregarConversas(); }, [carregarConversas]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [mensagens]);

  async function abrirConversa(conv: SuporteConversa) {
    setConversaAtiva(conv);
    setLoadingMensagens(true);
    try {
      const msgs = await listarMensagensSuporte(conv.id);
      setMensagens(msgs);
    } catch (_) { setMensagens([]); }
    finally { setLoadingMensagens(false); }
    setTimeout(() => inputRef.current?.focus(), 100);
  }

  async function novaConversa() {
    if (!fazendaId || !userId) return;
    setErroGeral(null);
    try {
      const conv = await criarConversaSuporte(fazendaId, userId, "Nova conversa");
      setConversas(prev => [conv, ...prev]);
      setConversaAtiva(conv);
      setMensagens([]);
      setTimeout(() => inputRef.current?.focus(), 100);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes("does not exist") || msg.includes("relation")) {
        setErroGeral("As tabelas do Suporte IA ainda não foram criadas. Execute a Migration 47 no Supabase SQL Editor e tente novamente.");
      } else {
        setErroGeral("Erro ao criar conversa: " + msg);
      }
    }
  }

  async function deletarConversa(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    if (!confirm("Excluir esta conversa?")) return;
    try {
      await excluirConversa(id);
      setConversas(prev => prev.filter(c => c.id !== id));
      if (conversaAtiva?.id === id) { setConversaAtiva(null); setMensagens([]); }
    } catch (_) { /* ignora */ }
  }

  async function enviarMensagem() {
    if (!input.trim() || !conversaAtiva || !fazendaId || enviando) return;
    const texto = input.trim();
    setInput("");
    setEnviando(true);

    try {
      // Salva mensagem do usuário
      const msgUser = await salvarMensagemSuporte({
        conversa_id: conversaAtiva.id,
        fazenda_id: fazendaId,
        role: "user",
        content: texto,
      });
      setMensagens(prev => [...prev, msgUser]);

      // Atualiza título da conversa se for a primeira mensagem
      if (mensagens.length === 0) {
        const titulo = texto.length > 50 ? texto.slice(0, 47) + "..." : texto;
        setConversas(prev => prev.map(c => c.id === conversaAtiva.id ? { ...c, titulo } : c));
      }

      // Chama a API de IA
      const res = await fetch("/api/suporte/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversa_id: conversaAtiva.id,
          fazenda_id: fazendaId,
          mensagens: [...mensagens, msgUser].map(m => ({ role: m.role, content: m.content })),
        }),
      });

      if (!res.ok) throw new Error("Erro na API");
      const { resposta } = await res.json() as { resposta: string };

      // Salva resposta da IA
      const msgAI = await salvarMensagemSuporte({
        conversa_id: conversaAtiva.id,
        fazenda_id: fazendaId,
        role: "assistant",
        content: resposta,
      });
      setMensagens(prev => [...prev, msgAI]);
    } catch (_) {
      setMensagens(prev => [...prev, {
        id: "err-" + Date.now(),
        conversa_id: conversaAtiva.id,
        fazenda_id: fazendaId ?? "",
        role: "assistant",
        content: "Desculpe, ocorreu um erro ao processar sua mensagem. Por favor, tente novamente.",
      }]);
    } finally { setEnviando(false); }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      enviarMensagem();
    }
  }

  const SUGESTOES = [
    "Como faço para emitir uma NF-e de venda de soja?",
    "Como lançar uma pulverização?",
    "Como funciona o ICMS Diferido em MT?",
    "Como cadastrar um arrendamento?",
    "Como configurar os parâmetros fiscais?",
    "Como ver o DRE da safra?",
  ];

  return (
    <div style={{ minHeight: "100vh", background: "#F4F6FA", fontFamily: "system-ui, sans-serif" }}>
      <TopNav />
      <div style={{ maxWidth: 1200, margin: "0 auto", padding: "24px 16px" }}>

        {erroGeral && (
          <div style={{
            background: "#FFF3F3", border: "0.5px solid #E24B4A", borderRadius: 8,
            padding: "10px 16px", marginBottom: 12, fontSize: 13, color: "#c0392b",
            display: "flex", justifyContent: "space-between", alignItems: "center",
          }}>
            <span>⚠️ {erroGeral}</span>
            <button onClick={() => setErroGeral(null)} style={{ background: "none", border: "none", cursor: "pointer", color: "#c0392b", fontSize: 16, padding: "0 4px" }}>×</button>
          </div>
        )}

        <div style={{ display: "grid", gridTemplateColumns: "260px 1fr", gap: 16, height: "calc(100vh - 140px)" }}>

          {/* Sidebar de conversas */}
          <div style={{ background: "#fff", borderRadius: 12, border: "0.5px solid #DDE2EE", display: "flex", flexDirection: "column", overflow: "hidden" }}>
            {/* Header */}
            <div style={{ padding: "14px 16px", borderBottom: "0.5px solid #DDE2EE", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 600, color: "#1A4870" }}>Suporte IA</div>
                <div style={{ fontSize: 11, color: "#888" }}>Assistente Arato</div>
              </div>
              <button
                onClick={novaConversa}
                style={{
                  background: "#1A4870", color: "#fff", border: "none", borderRadius: 7,
                  padding: "5px 10px", fontSize: 12, cursor: "pointer", fontWeight: 600,
                }}
              >
                + Nova
              </button>
            </div>

            {/* Lista de conversas */}
            <div style={{ flex: 1, overflowY: "auto" }}>
              {loadingConversas ? (
                <div style={{ padding: 20, textAlign: "center", color: "#999", fontSize: 13 }}>Carregando...</div>
              ) : conversas.length === 0 ? (
                <div style={{ padding: 20, textAlign: "center", color: "#aaa", fontSize: 13 }}>
                  Nenhuma conversa ainda
                </div>
              ) : (
                conversas.map(conv => {
                  const ativa = conversaAtiva?.id === conv.id;
                  return (
                    <div
                      key={conv.id}
                      onClick={() => abrirConversa(conv)}
                      style={{
                        padding: "10px 14px",
                        background: ativa ? "#D5E8F5" : "transparent",
                        borderLeft: ativa ? "3px solid #1A4870" : "3px solid transparent",
                        cursor: "pointer",
                        borderBottom: "0.5px solid #f0f0f0",
                        display: "flex", justifyContent: "space-between", alignItems: "center",
                      }}
                    >
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{
                          fontSize: 12, fontWeight: ativa ? 600 : 400, color: ativa ? "#1A4870" : "#333",
                          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                        }}>
                          {conv.titulo ?? "Nova conversa"}
                        </div>
                        <div style={{ fontSize: 11, color: "#aaa", marginTop: 1 }}>
                          {conv.updated_at ? new Date(conv.updated_at).toLocaleDateString("pt-BR") : ""}
                        </div>
                      </div>
                      <button
                        onClick={(e) => deletarConversa(conv.id, e)}
                        style={{
                          background: "none", border: "none", color: "#ccc", cursor: "pointer",
                          fontSize: 14, padding: "2px 4px", lineHeight: 1, flexShrink: 0,
                          visibility: ativa ? "visible" : "hidden",
                        }}
                        title="Excluir"
                      >
                        ×
                      </button>
                    </div>
                  );
                })
              )}
            </div>

            {/* Info */}
            <div style={{ padding: "10px 14px", borderTop: "0.5px solid #DDE2EE", background: "#F4F6FA" }}>
              <div style={{ fontSize: 10, color: "#aaa", lineHeight: 1.5 }}>
                Assistente com conhecimento completo do Arato e do agronegócio brasileiro.
              </div>
            </div>
          </div>

          {/* Área de chat */}
          <div style={{ background: "#fff", borderRadius: 12, border: "0.5px solid #DDE2EE", display: "flex", flexDirection: "column", overflow: "hidden" }}>
            {conversaAtiva ? (
              <>
                {/* Header do chat */}
                <div style={{ padding: "12px 20px", borderBottom: "0.5px solid #DDE2EE", display: "flex", alignItems: "center", gap: 10 }}>
                  <div style={{
                    width: 32, height: 32, background: "#1A4870", borderRadius: "50%",
                    display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 16, flexShrink: 0,
                  }}>🤖</div>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: "#1a1a1a" }}>{conversaAtiva.titulo ?? "Nova conversa"}</div>
                    <div style={{ fontSize: 11, color: "#16A34A" }}>● Online</div>
                  </div>
                </div>

                {/* Mensagens */}
                <div style={{ flex: 1, overflowY: "auto", padding: "20px", display: "flex", flexDirection: "column", gap: 16 }}>
                  {loadingMensagens ? (
                    <div style={{ textAlign: "center", color: "#999", fontSize: 13, marginTop: 40 }}>Carregando...</div>
                  ) : mensagens.length === 0 ? (
                    <div style={{ textAlign: "center", marginTop: 40 }}>
                      <div style={{ fontSize: 40, marginBottom: 12 }}>🤖</div>
                      <div style={{ fontSize: 16, fontWeight: 600, color: "#1A4870", marginBottom: 6 }}>
                        Olá! Sou o assistente do Arato.
                      </div>
                      <div style={{ fontSize: 13, color: "#666", marginBottom: 24 }}>
                        Posso ajudar com dúvidas sobre o sistema, regras fiscais e práticas do agronegócio.
                      </div>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, justifyContent: "center" }}>
                        {SUGESTOES.map(s => (
                          <button
                            key={s}
                            onClick={() => { setInput(s); setTimeout(() => inputRef.current?.focus(), 50); }}
                            style={{
                              background: "#F4F6FA", border: "0.5px solid #DDE2EE", borderRadius: 99,
                              padding: "6px 14px", fontSize: 12, color: "#555", cursor: "pointer",
                            }}
                          >
                            {s}
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : (
                    mensagens.map(msg => (
                      <div
                        key={msg.id}
                        style={{
                          display: "flex",
                          justifyContent: msg.role === "user" ? "flex-end" : "flex-start",
                          gap: 10,
                        }}
                      >
                        {msg.role === "assistant" && (
                          <div style={{
                            width: 28, height: 28, background: "#1A4870", borderRadius: "50%",
                            display: "flex", alignItems: "center", justifyContent: "center",
                            color: "#fff", fontSize: 14, flexShrink: 0, marginTop: 2,
                          }}>🤖</div>
                        )}
                        <div style={{
                          maxWidth: "72%",
                          background: msg.role === "user" ? "#1A4870" : "#F4F6FA",
                          color: msg.role === "user" ? "#fff" : "#1a1a1a",
                          borderRadius: msg.role === "user" ? "16px 16px 4px 16px" : "16px 16px 16px 4px",
                          padding: "10px 14px",
                          fontSize: 13, lineHeight: 1.6,
                          border: msg.role === "assistant" ? "0.5px solid #DDE2EE" : "none",
                          whiteSpace: "pre-wrap",
                        }}>
                          {msg.content}
                        </div>
                        {msg.role === "user" && (
                          <div style={{
                            width: 28, height: 28, background: "#FDE9BB", borderRadius: "50%",
                            display: "flex", alignItems: "center", justifyContent: "center",
                            fontSize: 12, flexShrink: 0, marginTop: 2, color: "#C9921B", fontWeight: 700,
                          }}>
                            {userId?.[0]?.toUpperCase() ?? "U"}
                          </div>
                        )}
                      </div>
                    ))
                  )}

                  {/* Indicador "digitando" */}
                  {enviando && (
                    <div style={{ display: "flex", gap: 10 }}>
                      <div style={{
                        width: 28, height: 28, background: "#1A4870", borderRadius: "50%",
                        display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 14, flexShrink: 0,
                      }}>🤖</div>
                      <div style={{
                        background: "#F4F6FA", border: "0.5px solid #DDE2EE",
                        borderRadius: "16px 16px 16px 4px", padding: "12px 16px",
                      }}>
                        <div style={{ display: "flex", gap: 4 }}>
                          {[0, 1, 2].map(i => (
                            <div key={i} style={{
                              width: 6, height: 6, background: "#1A4870", borderRadius: "50%",
                              animation: `pulse 1.2s ease-in-out ${i * 0.2}s infinite`,
                            }} />
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                  <div ref={endRef} />
                </div>

                {/* Input */}
                <div style={{ padding: "12px 16px", borderTop: "0.5px solid #DDE2EE", display: "flex", gap: 8, alignItems: "flex-end" }}>
                  <textarea
                    ref={inputRef}
                    value={input}
                    onChange={e => setInput(e.target.value)}
                    onKeyDown={onKeyDown}
                    placeholder="Digite sua dúvida... (Enter para enviar, Shift+Enter para nova linha)"
                    disabled={enviando}
                    rows={1}
                    style={{
                      flex: 1, border: "0.5px solid #DDE2EE", borderRadius: 10, padding: "9px 14px",
                      fontSize: 13, resize: "none", outline: "none", lineHeight: 1.5,
                      minHeight: 40, maxHeight: 120, overflowY: "auto",
                      fontFamily: "system-ui, sans-serif",
                      background: enviando ? "#F4F6FA" : "#fff",
                    }}
                    onInput={(e) => {
                      const t = e.target as HTMLTextAreaElement;
                      t.style.height = "auto";
                      t.style.height = Math.min(t.scrollHeight, 120) + "px";
                    }}
                  />
                  <button
                    onClick={enviarMensagem}
                    disabled={!input.trim() || enviando}
                    style={{
                      background: (!input.trim() || enviando) ? "#ccc" : "#1A4870",
                      color: "#fff", border: "none", borderRadius: 10,
                      width: 40, height: 40, fontSize: 18, cursor: (!input.trim() || enviando) ? "not-allowed" : "pointer",
                      display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
                    }}
                  >
                    ↑
                  </button>
                </div>
              </>
            ) : (
              /* Estado vazio — sem conversa selecionada */
              <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 40, textAlign: "center" }}>
                <div style={{ fontSize: 56, marginBottom: 16 }}>🤖</div>
                <div style={{ fontSize: 20, fontWeight: 700, color: "#1A4870", marginBottom: 8 }}>Suporte IA</div>
                <div style={{ fontSize: 14, color: "#666", maxWidth: 380, lineHeight: 1.6, marginBottom: 24 }}>
                  Tire dúvidas sobre o Arato, regras fiscais do agronegócio e melhores práticas do campo.
                  Selecione uma conversa ou crie uma nova.
                </div>
                <button
                  onClick={novaConversa}
                  style={{
                    background: "#1A4870", color: "#fff", border: "none", borderRadius: 10,
                    padding: "12px 28px", fontSize: 14, fontWeight: 600, cursor: "pointer",
                  }}
                >
                  Iniciar nova conversa
                </button>
              </div>
            )}
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
