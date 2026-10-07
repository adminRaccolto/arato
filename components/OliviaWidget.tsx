"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import { useAuth } from "./AuthProvider";
import { supabase } from "../lib/supabase";
import {
  listarConversasSuporte, criarConversaSuporte, excluirConversa,
  listarMensagensSuporte, atualizarTituloConversa,
} from "../lib/db";
import type { SuporteConversa, SuporteMensagem } from "../lib/supabase";

/**
 * Olívia como balão flutuante — canto inferior direito, aberto em qualquer tela.
 * Antes ficava só na página /suporte: para seguir uma instrução da Olívia era preciso
 * sair do chat, ir até a tela certa, fazer a ação, e voltar, perdendo o fio da conversa
 * em instruções longas (achado real 07/10/2026, pedido do dono). Agora o chat fica aberto
 * por cima de qualquer tela enquanto o usuário navega, e só fecha com o botão ×.
 *
 * Mesma lógica de dados da página (conversas/mensagens salvas no banco, API de IA) —
 * só a interface foi compactada para caber num painel pequeno.
 */
export default function OliviaWidget() {
  const { fazendaId } = useAuth();
  const [aberto, setAberto] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [conversas, setConversas] = useState<SuporteConversa[]>([]);
  const [conversaAtiva, setConversaAtiva] = useState<SuporteConversa | null>(null);
  const [mensagens, setMensagens] = useState<SuporteMensagem[]>([]);
  const [mostrarLista, setMostrarLista] = useState(false);
  const [input, setInput] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [carregado, setCarregado] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => { if (data.user) setUserId(data.user.id); });
  }, []);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [mensagens]);

  const abrirConversa = useCallback(async (conv: SuporteConversa) => {
    setConversaAtiva(conv);
    setMostrarLista(false);
    try {
      const msgs = await listarMensagensSuporte(conv.id);
      setMensagens(msgs);
    } catch { setMensagens([]); }
    setTimeout(() => inputRef.current?.focus(), 100);
  }, []);

  // Ao abrir o balão pela primeira vez: carrega as conversas e já entra na mais recente
  // (ou cria uma nova, se não houver nenhuma) — sem o estado "vazio" de tela cheia da página.
  useEffect(() => {
    if (!aberto || carregado || !fazendaId || !userId) return;
    setCarregado(true);
    (async () => {
      try {
        const data = await listarConversasSuporte(fazendaId, userId);
        setConversas(data);
        if (data.length > 0) await abrirConversa(data[0]);
        else {
          const conv = await criarConversaSuporte(fazendaId, userId, "Nova conversa");
          setConversas([conv]);
          setConversaAtiva(conv);
        }
      } catch { /* silencioso — o balão só não abre histórico, não trava o resto da tela */ }
      setTimeout(() => inputRef.current?.focus(), 150);
    })();
  }, [aberto, carregado, fazendaId, userId, abrirConversa]);

  async function novaConversa() {
    if (!fazendaId || !userId) return;
    const conv = await criarConversaSuporte(fazendaId, userId, "Nova conversa");
    setConversas(prev => [conv, ...prev]);
    setConversaAtiva(conv);
    setMensagens([]);
    setMostrarLista(false);
    setTimeout(() => inputRef.current?.focus(), 100);
  }

  async function deletarConversa(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    if (!confirm("Excluir esta conversa?")) return;
    await excluirConversa(id).catch(() => {});
    setConversas(prev => prev.filter(c => c.id !== id));
    if (conversaAtiva?.id === id) {
      const restante = conversas.filter(c => c.id !== id)[0];
      if (restante) abrirConversa(restante); else { setConversaAtiva(null); setMensagens([]); }
    }
  }

  async function enviarMensagem() {
    if (!input.trim() || !conversaAtiva || !fazendaId || enviando) return;
    const texto = input.trim();
    setInput("");
    setEnviando(true);
    try {
      const userRes = await fetch("/api/suporte/mensagem", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversa_id: conversaAtiva.id, fazenda_id: fazendaId, role: "user", content: texto }),
      });
      const userJson = await userRes.json() as { ok: boolean; mensagem?: SuporteMensagem };
      if (!userJson.ok || !userJson.mensagem) throw new Error("Erro ao salvar mensagem");
      const msgUser = userJson.mensagem;
      setMensagens(prev => [...prev, msgUser]);

      if (mensagens.length === 0) {
        const titulo = texto.length > 50 ? texto.slice(0, 47) + "..." : texto;
        setConversas(prev => prev.map(c => c.id === conversaAtiva.id ? { ...c, titulo } : c));
        setConversaAtiva(prev => prev ? { ...prev, titulo } : prev);
        atualizarTituloConversa(conversaAtiva.id, titulo).catch(() => {});
      }

      const res = await fetch("/api/suporte/chat", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversa_id: conversaAtiva.id, fazenda_id: fazendaId,
          mensagens: [...mensagens, msgUser].map(m => ({ role: m.role, content: m.content })),
        }),
      });
      if (!res.ok) {
        const errJson = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(errJson.error ?? `HTTP ${res.status}`);
      }
      const { resposta } = await res.json() as { resposta: string };

      const aiRes = await fetch("/api/suporte/mensagem", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversa_id: conversaAtiva.id, fazenda_id: fazendaId, role: "assistant", content: resposta }),
      });
      const aiJson = await aiRes.json() as { ok: boolean; mensagem?: SuporteMensagem };
      const msgAI = aiJson.mensagem ?? { id: "ai-" + Date.now(), conversa_id: conversaAtiva.id, fazenda_id: fazendaId ?? "", role: "assistant" as const, content: resposta };
      setMensagens(prev => [...prev, msgAI]);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      const isApiKey = msg.includes("ANTHROPIC_API_KEY") || msg.includes("401") || msg.includes("Authentication");
      setMensagens(prev => [...prev, {
        id: "err-" + Date.now(), conversa_id: conversaAtiva.id, fazenda_id: fazendaId ?? "", role: "assistant",
        content: isApiKey
          ? "⚠️ Chave da API de IA não configurada. Acesse Vercel → Project → Settings → Environment Variables e adicione ANTHROPIC_API_KEY."
          : `⚠️ Erro: ${msg}`,
      }]);
    } finally { setEnviando(false); }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); enviarMensagem(); }
  }

  // Sem fazenda ativa (não logado, ou tela pública) — balão não aparece
  if (!fazendaId) return null;

  return (
    <>
      {/* Balão fechado */}
      {!aberto && (
        <button
          onClick={() => setAberto(true)}
          title="Falar com a Olívia"
          style={{
            position: "fixed", right: 20, bottom: 20, zIndex: 2000,
            width: 58, height: 58, borderRadius: "50%", border: "none", cursor: "pointer",
            background: "#1A4870", boxShadow: "0 4px 16px rgba(11,45,80,0.35)",
            padding: 0, overflow: "hidden",
          }}
        >
          <img src="/suporte-avatar.jpg" alt="Olívia" style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "top center" }} />
        </button>
      )}

      {/* Painel aberto — fecha só pelo botão ×, nunca ao clicar fora nem ao navegar */}
      {aberto && (
        <div style={{
          position: "fixed", right: 20, bottom: 20, zIndex: 2000,
          width: 360, height: 520, maxHeight: "calc(100vh - 40px)",
          background: "#fff", borderRadius: 14, boxShadow: "0 8px 32px rgba(11,45,80,0.28)",
          border: "0.5px solid #DDE2EE", display: "flex", flexDirection: "column", overflow: "hidden",
        }}>
          {/* Header */}
          <div style={{ padding: "10px 12px", background: "#1A4870", display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
            <img src="/suporte-avatar.jpg" alt="Olívia" style={{ width: 30, height: 30, borderRadius: "50%", objectFit: "cover", objectPosition: "top center", flexShrink: 0 }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#fff", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {conversaAtiva?.titulo ?? "Olívia"}
              </div>
              <div style={{ fontSize: 10, color: "#D5E8F5" }}>● Online</div>
            </div>
            <button onClick={() => setMostrarLista(m => !m)} title="Conversas"
              style={{ background: "rgba(255,255,255,0.15)", border: "none", borderRadius: 6, color: "#fff", width: 26, height: 26, cursor: "pointer", fontSize: 13 }}>☰</button>
            <button onClick={novaConversa} title="Nova conversa"
              style={{ background: "rgba(255,255,255,0.15)", border: "none", borderRadius: 6, color: "#fff", width: 26, height: 26, cursor: "pointer", fontSize: 15 }}>+</button>
            <button onClick={() => setAberto(false)} title="Fechar"
              style={{ background: "none", border: "none", color: "#fff", width: 22, height: 22, cursor: "pointer", fontSize: 16, lineHeight: 1 }}>×</button>
          </div>

          {/* Lista de conversas — recolhida por padrão */}
          {mostrarLista && (
            <div style={{ borderBottom: "0.5px solid #DDE2EE", maxHeight: 160, overflowY: "auto", flexShrink: 0 }}>
              {conversas.length === 0 ? (
                <div style={{ padding: 12, fontSize: 12, color: "#888", textAlign: "center" }}>Nenhuma conversa ainda</div>
              ) : conversas.map(conv => {
                const ativa = conversaAtiva?.id === conv.id;
                return (
                  <div key={conv.id} onClick={() => abrirConversa(conv)}
                    style={{ padding: "7px 12px", background: ativa ? "#F4F6FA" : "transparent", cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "0.5px solid #F0F2F7" }}>
                    <div style={{ fontSize: 12, fontWeight: ativa ? 600 : 400, color: "#1a1a1a", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>
                      {conv.titulo ?? "Nova conversa"}
                    </div>
                    <button onClick={e => deletarConversa(conv.id, e)} style={{ background: "none", border: "none", color: "#ccc", cursor: "pointer", fontSize: 13, flexShrink: 0 }}>×</button>
                  </div>
                );
              })}
            </div>
          )}

          {/* Mensagens */}
          <div style={{ flex: 1, overflowY: "auto", padding: 14, display: "flex", flexDirection: "column", gap: 10, background: "#F9FAFC" }}>
            {mensagens.length === 0 && (
              <div style={{ fontSize: 12, color: "#888", textAlign: "center", marginTop: 20 }}>
                Como posso ajudar?
              </div>
            )}
            {mensagens.map(msg => (
              <div key={msg.id} style={{ display: "flex", justifyContent: msg.role === "user" ? "flex-end" : "flex-start", gap: 7 }}>
                {msg.role === "assistant" && (
                  <img src="/suporte-avatar.jpg" alt="Olívia" style={{ width: 22, height: 22, borderRadius: "50%", objectFit: "cover", objectPosition: "top center", flexShrink: 0, marginTop: 2 }} />
                )}
                <div style={{
                  maxWidth: "78%",
                  background: msg.role === "user" ? "#1A4870" : "#fff",
                  color: msg.role === "user" ? "#fff" : "#1a1a1a",
                  borderRadius: msg.role === "user" ? "12px 12px 3px 12px" : "12px 12px 12px 3px",
                  padding: "7px 11px", fontSize: 12.5, lineHeight: 1.55,
                  border: msg.role === "assistant" ? "0.5px solid #DDE2EE" : "none",
                  whiteSpace: "pre-wrap",
                }}>
                  {msg.content}
                </div>
              </div>
            ))}
            {enviando && (
              <div style={{ display: "flex", gap: 7 }}>
                <img src="/suporte-avatar.jpg" alt="Olívia" style={{ width: 22, height: 22, borderRadius: "50%", objectFit: "cover", objectPosition: "top center", flexShrink: 0 }} />
                <div style={{ background: "#fff", border: "0.5px solid #DDE2EE", borderRadius: "12px 12px 12px 3px", padding: "9px 12px" }}>
                  <div style={{ display: "flex", gap: 3 }}>
                    {[0, 1, 2].map(i => (
                      <div key={i} style={{ width: 5, height: 5, background: "#1A4870", borderRadius: "50%", animation: `oliviaPulse 1.2s ease-in-out ${i * 0.2}s infinite` }} />
                    ))}
                  </div>
                </div>
              </div>
            )}
            <div ref={endRef} />
          </div>

          {/* Input */}
          <div style={{ padding: "10px 10px", borderTop: "0.5px solid #DDE2EE", display: "flex", gap: 6, alignItems: "flex-end", flexShrink: 0, background: "#fff" }}>
            <textarea
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder="Digite sua dúvida..."
              disabled={enviando}
              rows={1}
              style={{
                flex: 1, border: "0.5px solid #DDE2EE", borderRadius: 8, padding: "7px 10px",
                fontSize: 12.5, resize: "none", outline: "none", lineHeight: 1.5,
                minHeight: 34, maxHeight: 90, overflowY: "auto", fontFamily: "inherit",
                background: enviando ? "#F4F6FA" : "#fff",
              }}
              onInput={(e) => {
                const t = e.target as HTMLTextAreaElement;
                t.style.height = "auto";
                t.style.height = Math.min(t.scrollHeight, 90) + "px";
              }}
            />
            <button
              onClick={enviarMensagem}
              disabled={!input.trim() || enviando}
              style={{
                background: (!input.trim() || enviando) ? "#ccc" : "#1A4870",
                color: "#fff", border: "none", borderRadius: 8,
                width: 34, height: 34, fontSize: 15, cursor: (!input.trim() || enviando) ? "default" : "pointer",
                display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
              }}
            >
              ↑
            </button>
          </div>
        </div>
      )}

      <style>{`
        @keyframes oliviaPulse {
          0%, 80%, 100% { transform: scale(0.8); opacity: 0.4; }
          40% { transform: scale(1); opacity: 1; }
        }
      `}</style>
    </>
  );
}
