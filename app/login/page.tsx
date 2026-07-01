"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabase";

const BG_FALLBACK = "https://images.unsplash.com/photo-1500382017468-9049fed747ef?auto=format&fit=crop&w=1920&q=80";

type Modo = "login" | "recuperar";

export default function Login() {
  const [modo,       setModo]       = useState<Modo>("login");
  const [email,      setEmail]      = useState("");
  const [senha,      setSenha]      = useState("");
  const [erro,       setErro]       = useState<string | null>(null);
  const [sucesso,    setSucesso]    = useState<string | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [logoUrl,    setLogoUrl]    = useState("/Logo_Arato.png");
  const [bgUrl,      setBgUrl]      = useState(BG_FALLBACK);
  const [senhaVis,   setSenhaVis]   = useState(false);
  const router = useRouter();

  useEffect(() => {
    // Só sobrescreve se o arquivo realmente existir no storage
    const { data: dLogo } = supabase.storage.from("logos").getPublicUrl("arato.png");
    if (dLogo?.publicUrl) {
      const img = new Image();
      img.onload = () => setLogoUrl(dLogo.publicUrl);
      img.src = dLogo.publicUrl;
    }
    const { data: dBg } = supabase.storage.from("logos").getPublicUrl("login-bg.jpg");
    if (dBg?.publicUrl) {
      const img = new Image();
      img.onload = () => setBgUrl(dBg.publicUrl);
      img.src = dBg.publicUrl;
    }
  }, []);

  async function entrar(e: React.FormEvent) {
    e.preventDefault();
    setCarregando(true);
    setErro(null);
    const { error } = await supabase.auth.signInWithPassword({ email, password: senha });
    if (error) { setErro("E-mail ou senha incorretos."); setCarregando(false); return; }
    router.push("/");
    router.refresh();
  }

  async function recuperarSenha(e: React.FormEvent) {
    e.preventDefault();
    setCarregando(true);
    setErro(null);
    setSucesso(null);
    const redirectTo = `${window.location.origin}/auth/nova-senha`;
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
    setCarregando(false);
    if (error) { setErro("Não foi possível enviar o e-mail. Verifique o endereço."); return; }
    setSucesso("Link enviado! Verifique sua caixa de entrada.");
  }

  const inpStyle: React.CSSProperties = {
    width: "100%", padding: "13px 16px",
    border: "1.5px solid rgba(255,255,255,0.35)",
    borderRadius: 12, fontSize: 14,
    outline: "none", boxSizing: "border-box",
    color: "#0B1E35", background: "rgba(255,255,255,0.82)",
    fontFamily: "system-ui, sans-serif",
    transition: "border-color 0.15s, box-shadow 0.15s",
    backdropFilter: "blur(4px)",
  };

  return (
    <div style={{
      minHeight: "100vh",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      fontFamily: "system-ui, -apple-system, sans-serif",
      position: "relative",
      overflow: "hidden",
    }}>

      {/* ── FUNDO FULL-SCREEN ── */}
      <div style={{
        position: "fixed", inset: 0, zIndex: 0,
        backgroundImage: `url('${bgUrl}')`,
        backgroundSize: "cover",
        backgroundPosition: "center 40%",
      }} />

      {/* Camada de cor sobre a foto */}
      <div style={{
        position: "fixed", inset: 0, zIndex: 1,
        background: [
          "linear-gradient(160deg, rgba(5,14,26,0.55) 0%, rgba(8,24,44,0.30) 50%, rgba(5,14,26,0.60) 100%)",
        ].join(", "),
      }} />

      {/* ── CARD GLASS CENTRALIZADO ── */}
      <div style={{
        position: "relative", zIndex: 2,
        width: "100%", maxWidth: 460,
        margin: "32px 16px",
        background: "rgba(255,255,255,0.88)",
        backdropFilter: "blur(28px) saturate(180%)",
        WebkitBackdropFilter: "blur(28px) saturate(180%)",
        borderRadius: 28,
        border: "1px solid rgba(255,255,255,0.60)",
        boxShadow: "0 32px 80px rgba(0,0,0,0.30), 0 2px 0 rgba(255,255,255,0.50) inset",
        padding: "44px 44px 36px",
      }}>

        {/* ── IDENTIDADE ── */}
        <div style={{ textAlign: "center", marginBottom: 32 }}>

          {/* Logo Arato — 112px */}
          <img
            src={logoUrl}
            alt="Arato"
            style={{
              height: 112, width: "auto",
              objectFit: "contain",
              display: "block",
              margin: "0 auto 16px",
            }}
            onError={e => {
              const el = e.target as HTMLImageElement;
              el.style.display = "none";
              const fb = el.nextElementSibling as HTMLElement;
              if (fb) fb.style.display = "flex";
            }}
          />
          {/* Fallback texto */}
          <div style={{
            display: "none", alignItems: "center", justifyContent: "center",
            height: 112, fontSize: 42, fontWeight: 900, color: "#1A4870", letterSpacing: "-2px",
            marginBottom: 16,
          }}>
            Arato
          </div>

          {/* Um produto Raccolto */}
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
          }}>
            <span style={{ fontSize: 12, color: "#8A9AB0", fontWeight: 400 }}>um produto</span>
            <img
              src="/Logo_Raccolto.png"
              alt="Raccolto"
              style={{
                height: 22, width: "auto",
                objectFit: "contain",
                display: "inline-block",
                verticalAlign: "middle",
              }}
              onError={e => {
                const el = e.target as HTMLImageElement;
                el.style.display = "none";
                const fb = el.nextElementSibling as HTMLElement;
                if (fb) fb.style.display = "inline";
              }}
            />
            <span style={{ display: "none", fontSize: 13, fontWeight: 700, color: "#1A4870" }}>Raccolto</span>
          </div>
        </div>

        {/* Divisor */}
        <div style={{ height: 1, background: "rgba(0,0,0,0.08)", marginBottom: 28 }} />

        {/* ── TÍTULO ── */}
        <div style={{ marginBottom: 24 }}>
          <h2 style={{ margin: "0 0 5px", fontSize: 21, fontWeight: 800, color: "#0B1E35", letterSpacing: "-0.3px" }}>
            {modo === "login" ? "Bem-vindo de volta" : "Recuperar senha"}
          </h2>
          <p style={{ margin: 0, fontSize: 13, color: "#7A8A9A", lineHeight: 1.5 }}>
            {modo === "login"
              ? "Entre com suas credenciais para acessar o painel."
              : "Informe seu e-mail e enviaremos um link de redefinição."}
          </p>
        </div>

        {/* ── ALERTAS ── */}
        {erro && (
          <div style={{
            background: "#FEF2F2", border: "1px solid #FECACA",
            borderRadius: 10, padding: "11px 14px", marginBottom: 18,
            fontSize: 13, color: "#B91C1C", display: "flex", gap: 8, alignItems: "flex-start",
          }}>
            <span style={{ flexShrink: 0, marginTop: 1 }}>⚠</span>{erro}
          </div>
        )}
        {sucesso && (
          <div style={{
            background: "#F0FDF4", border: "1px solid #BBF7D0",
            borderRadius: 10, padding: "11px 14px", marginBottom: 18,
            fontSize: 13, color: "#15803D", display: "flex", gap: 8, alignItems: "flex-start",
          }}>
            <span style={{ flexShrink: 0, marginTop: 1 }}>✓</span>{sucesso}
          </div>
        )}

        {/* ── FORMULÁRIO ── */}
        <form onSubmit={modo === "login" ? entrar : recuperarSenha}>

          {/* E-mail */}
          <div style={{ marginBottom: 14 }}>
            <label style={{
              display: "block", fontSize: 11, fontWeight: 700,
              color: "#4A5568", marginBottom: 6,
              letterSpacing: "0.06em", textTransform: "uppercase",
            }}>
              E-mail
            </label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              placeholder="seu@email.com.br"
              style={inpStyle}
              onFocus={e => { e.target.style.borderColor = "#1A4870"; e.target.style.boxShadow = "0 0 0 3px rgba(26,72,112,0.12)"; }}
              onBlur={e => { e.target.style.borderColor = "rgba(255,255,255,0.35)"; e.target.style.boxShadow = "none"; }}
            />
          </div>

          {/* Senha */}
          {modo === "login" && (
            <div style={{ marginBottom: 8 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                <label style={{
                  fontSize: 11, fontWeight: 700, color: "#4A5568",
                  letterSpacing: "0.06em", textTransform: "uppercase",
                }}>
                  Senha
                </label>
                <button
                  type="button"
                  onClick={() => { setModo("recuperar"); setErro(null); setSucesso(null); }}
                  style={{
                    background: "none", border: "none", padding: 0,
                    fontSize: 12, color: "#1A4870", cursor: "pointer", fontWeight: 600,
                  }}
                >
                  Esqueceu a senha?
                </button>
              </div>
              <div style={{ position: "relative" }}>
                <input
                  type={senhaVis ? "text" : "password"}
                  value={senha}
                  onChange={e => setSenha(e.target.value)}
                  required
                  placeholder="••••••••"
                  style={{ ...inpStyle, paddingRight: 48 }}
                  onFocus={e => { e.target.style.borderColor = "#1A4870"; e.target.style.boxShadow = "0 0 0 3px rgba(26,72,112,0.12)"; }}
                  onBlur={e => { e.target.style.borderColor = "rgba(255,255,255,0.35)"; e.target.style.boxShadow = "none"; }}
                />
                <button
                  type="button"
                  onClick={() => setSenhaVis(v => !v)}
                  style={{
                    position: "absolute", right: 14, top: "50%", transform: "translateY(-50%)",
                    background: "none", border: "none", cursor: "pointer",
                    color: "#9AA5B4", lineHeight: 1, padding: 2,
                  }}
                  title={senhaVis ? "Ocultar" : "Mostrar"}
                >
                  {senhaVis
                    ? <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                    : <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                  }
                </button>
              </div>
            </div>
          )}

          {/* Botão entrar */}
          <button
            type="submit"
            disabled={carregando || (modo === "recuperar" && !!sucesso)}
            style={{
              width: "100%", marginTop: 22,
              background: carregando ? "#8BA8C4" : "linear-gradient(135deg, #1A4870 0%, #0B2D50 100%)",
              color: "#fff", border: "none", borderRadius: 12,
              padding: "15px", fontSize: 15, fontWeight: 700,
              cursor: carregando ? "not-allowed" : "pointer",
              transition: "opacity 0.15s, transform 0.1s",
              boxShadow: carregando ? "none" : "0 6px 20px rgba(26,72,112,0.40)",
              letterSpacing: "0.01em",
            }}
            onMouseEnter={e => { if (!carregando) { const b = e.currentTarget; b.style.opacity = "0.88"; b.style.transform = "translateY(-1px)"; } }}
            onMouseLeave={e => { if (!carregando) { const b = e.currentTarget; b.style.opacity = "1"; b.style.transform = "translateY(0)"; } }}
          >
            {modo === "login"
              ? (carregando ? "Entrando…" : "Entrar")
              : (carregando ? "Enviando…" : "Enviar link de recuperação")}
          </button>

          {modo === "recuperar" && (
            <button
              type="button"
              onClick={() => { setModo("login"); setErro(null); setSucesso(null); }}
              style={{
                width: "100%", marginTop: 10,
                background: "rgba(255,255,255,0.50)", border: "1.5px solid rgba(0,0,0,0.12)",
                borderRadius: 12, padding: "13px",
                fontSize: 14, color: "#4A5568", cursor: "pointer", fontWeight: 500,
                transition: "border-color 0.15s",
              }}
              onMouseEnter={e => (e.currentTarget.style.borderColor = "#1A4870")}
              onMouseLeave={e => (e.currentTarget.style.borderColor = "rgba(0,0,0,0.12)")}
            >
              ← Voltar ao login
            </button>
          )}
        </form>

        {/* Não tem conta */}
        {modo === "login" && (
          <div style={{ marginTop: 22, textAlign: "center" }}>
            <span style={{ fontSize: 13, color: "#9AA5B4" }}>Ainda não tem conta? </span>
            <a href="/planos" style={{ fontSize: 13, color: "#1A4870", fontWeight: 700, textDecoration: "none" }}>
              Conheça os planos →
            </a>
          </div>
        )}

        {/* Rodapé */}
        <div style={{ marginTop: 28, textAlign: "center" }}>
          <span style={{ fontSize: 11, color: "#B0BEC5" }}>© 2026 Raccolto Consultoria · v1.0</span>
        </div>
      </div>

      {/* Tagline discreta no rodapé da tela */}
      <div style={{
        position: "fixed", bottom: 24, left: 0, right: 0, zIndex: 3,
        textAlign: "center", pointerEvents: "none",
      }}>
        <span style={{
          fontSize: 12, color: "rgba(255,255,255,0.45)",
          fontWeight: 500, letterSpacing: "0.05em",
        }}>
          Gestão Agrícola Inteligente · Menos cliques, mais campo.
        </span>
      </div>
    </div>
  );
}
