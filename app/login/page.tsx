"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabase";

const BG_FALLBACK = "https://images.unsplash.com/photo-1500382017468-9049fed747ef?auto=format&fit=crop&w=1920&q=80";

type Modo = "login" | "recuperar";

export default function Login() {
  const [modo,         setModo]         = useState<Modo>("login");
  const [email,        setEmail]        = useState("");
  const [senha,        setSenha]        = useState("");
  const [erro,         setErro]         = useState<string | null>(null);
  const [sucesso,      setSucesso]      = useState<string | null>(null);
  const [carregando,   setCarregando]   = useState(false);
  const [bgUrl,    setBgUrl]    = useState(BG_FALLBACK);
  const [senhaVis, setSenhaVis] = useState(false);
  const router = useRouter();

  useEffect(() => {
    // Fundo customizado via Supabase Storage (opcional)
    const { data: dBg } = supabase.storage.from("logos").getPublicUrl("login-bg.jpg");
    if (dBg?.publicUrl) {
      const img = new window.Image();
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

  const inp: React.CSSProperties = {
    width: "100%", padding: "13px 16px",
    border: "1.5px solid rgba(255,255,255,0.50)",
    borderRadius: 12, fontSize: 14,
    outline: "none", boxSizing: "border-box",
    color: "#0B1E35",
    background: "rgba(255,255,255,0.90)",
    fontFamily: "system-ui, sans-serif",
    transition: "border-color 0.15s, box-shadow 0.15s",
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
      {/* Overlay escuro sutil */}
      <div style={{
        position: "fixed", inset: 0, zIndex: 1,
        background: "linear-gradient(160deg, rgba(4,12,24,0.50) 0%, rgba(6,18,36,0.35) 50%, rgba(4,12,24,0.55) 100%)",
      }} />

      {/* ── CARD GLASSMORPHISM ── */}
      <div style={{
        position: "relative", zIndex: 2,
        width: "100%", maxWidth: 440,
        margin: "32px 16px",
        /* Efeito vidro: fundo muito transparente + blur forte */
        background: "rgba(255,255,255,0.16)",
        backdropFilter: "blur(24px) saturate(180%)",
        WebkitBackdropFilter: "blur(24px) saturate(180%)",
        borderRadius: 28,
        border: "1px solid rgba(255,255,255,0.40)",
        boxShadow: [
          "0 32px 80px rgba(0,0,0,0.35)",
          "0 1px 0 rgba(255,255,255,0.55) inset",
          "0 -1px 0 rgba(0,0,0,0.10) inset",
        ].join(", "),
        padding: "44px 44px 36px",
      }}>

        {/* ── LOGO ARATO ── */}
        <div style={{ textAlign: "center", marginBottom: 28 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="https://ptbougxydvxxdlhywhps.supabase.co/storage/v1/object/public/logos/Logo_Arato_Nova.png"
            alt="Arato"
            width={260}
            style={{ objectFit: "contain", display: "block", margin: "0 auto 14px", maxWidth: "100%" }}
          />

        </div>

        {/* Divisor translúcido */}
        <div style={{ height: 1, background: "rgba(255,255,255,0.18)", marginBottom: 28 }} />

        {/* ── TÍTULO ── */}
        <div style={{ marginBottom: 22 }}>
          <h2 style={{
            margin: "0 0 5px", fontSize: 21, fontWeight: 800,
            color: "#fff", letterSpacing: "-0.3px",
            textShadow: "0 1px 8px rgba(0,0,0,0.25)",
          }}>
            {modo === "login" ? "Bem-vindo de volta" : "Recuperar senha"}
          </h2>
          <p style={{ margin: 0, fontSize: 13, color: "rgba(255,255,255,0.68)", lineHeight: 1.5 }}>
            {modo === "login"
              ? "Entre com suas credenciais para acessar o painel."
              : "Informe seu e-mail e enviaremos um link de redefinição."}
          </p>
        </div>

        {/* ── ALERTAS ── */}
        {erro && (
          <div style={{
            background: "rgba(254,242,242,0.92)", border: "1px solid #FECACA",
            borderRadius: 10, padding: "11px 14px", marginBottom: 16,
            fontSize: 13, color: "#B91C1C", display: "flex", gap: 8, alignItems: "flex-start",
          }}>
            <span style={{ flexShrink: 0, marginTop: 1 }}>⚠</span>{erro}
          </div>
        )}
        {sucesso && (
          <div style={{
            background: "rgba(240,253,244,0.92)", border: "1px solid #BBF7D0",
            borderRadius: 10, padding: "11px 14px", marginBottom: 16,
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
              color: "rgba(255,255,255,0.80)", marginBottom: 6,
              letterSpacing: "0.07em", textTransform: "uppercase",
            }}>
              E-mail
            </label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              placeholder="seu@email.com.br"
              style={inp}
              onFocus={e => { e.target.style.borderColor = "#fff"; e.target.style.boxShadow = "0 0 0 3px rgba(255,255,255,0.20)"; }}
              onBlur={e => { e.target.style.borderColor = "rgba(255,255,255,0.50)"; e.target.style.boxShadow = "none"; }}
            />
          </div>

          {/* Senha */}
          {modo === "login" && (
            <div style={{ marginBottom: 8 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                <label style={{
                  fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.80)",
                  letterSpacing: "0.07em", textTransform: "uppercase",
                }}>
                  Senha
                </label>
                <button
                  type="button"
                  onClick={() => { setModo("recuperar"); setErro(null); setSucesso(null); }}
                  style={{
                    background: "none", border: "none", padding: 0,
                    fontSize: 12, color: "rgba(255,255,255,0.85)", cursor: "pointer", fontWeight: 600,
                    textDecoration: "underline", textUnderlineOffset: 3,
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
                  style={{ ...inp, paddingRight: 48 }}
                  onFocus={e => { e.target.style.borderColor = "#fff"; e.target.style.boxShadow = "0 0 0 3px rgba(255,255,255,0.20)"; }}
                  onBlur={e => { e.target.style.borderColor = "rgba(255,255,255,0.50)"; e.target.style.boxShadow = "none"; }}
                />
                <button
                  type="button"
                  onClick={() => setSenhaVis(v => !v)}
                  style={{
                    position: "absolute", right: 14, top: "50%", transform: "translateY(-50%)",
                    background: "none", border: "none", cursor: "pointer",
                    color: "#9AA5B4", lineHeight: 1, padding: 2,
                  }}
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
              background: carregando ? "rgba(26,72,112,0.60)" : "linear-gradient(135deg, #1A4870 0%, #0B2D50 100%)",
              color: "#fff", border: "1px solid rgba(255,255,255,0.20)",
              borderRadius: 12, padding: "15px",
              fontSize: 15, fontWeight: 700,
              cursor: carregando ? "not-allowed" : "pointer",
              transition: "opacity 0.15s, transform 0.1s",
              boxShadow: carregando ? "none" : "0 6px 20px rgba(0,0,0,0.30)",
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
                background: "rgba(255,255,255,0.12)", border: "1px solid rgba(255,255,255,0.30)",
                borderRadius: 12, padding: "13px",
                fontSize: 14, color: "rgba(255,255,255,0.85)", cursor: "pointer", fontWeight: 500,
                transition: "background 0.15s",
              }}
              onMouseEnter={e => (e.currentTarget.style.background = "rgba(255,255,255,0.20)")}
              onMouseLeave={e => (e.currentTarget.style.background = "rgba(255,255,255,0.12)")}
            >
              ← Voltar ao login
            </button>
          )}
        </form>

        {/* Não tem conta */}
        {modo === "login" && (
          <div style={{ marginTop: 22, textAlign: "center" }}>
            <span style={{ fontSize: 13, color: "rgba(255,255,255,0.60)" }}>Ainda não tem conta? </span>
            <a href="/planos" style={{ fontSize: 13, color: "#fff", fontWeight: 700, textDecoration: "none" }}>
              Conheça os planos →
            </a>
          </div>
        )}

        {/* Rodapé */}
        <div style={{ marginTop: 28, textAlign: "center" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6, marginBottom: 8 }}>
            <span style={{ fontSize: 11, color: "rgba(255,255,255,0.45)", fontWeight: 400 }}>um produto</span>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="https://ptbougxydvxxdlhywhps.supabase.co/storage/v1/object/public/logos/Logo_Raccolto.png"
              alt="Raccolto"
              style={{ objectFit: "contain", filter: "brightness(0) invert(1)", opacity: 0.55, height: 16, width: "auto" }}
            />
          </div>
          <span style={{ fontSize: 11, color: "rgba(255,255,255,0.25)" }}>© 2026 Raccolto Consultoria · v1.0</span>
        </div>
      </div>
    </div>
  );
}
