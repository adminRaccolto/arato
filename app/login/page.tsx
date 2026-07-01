"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabase";

const FOTO_FALLBACK = "https://images.unsplash.com/photo-1500382017468-9049fed747ef?auto=format&fit=crop&w=1920&q=80";

type Modo = "login" | "recuperar";

export default function Login() {
  const [modo,       setModo]       = useState<Modo>("login");
  const [email,      setEmail]      = useState("");
  const [senha,      setSenha]      = useState("");
  const [erro,       setErro]       = useState<string | null>(null);
  const [sucesso,    setSucesso]    = useState<string | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [logoUrl,    setLogoUrl]    = useState("/Logo_Arato.png");
  const [logoRacUrl, setLogoRacUrl] = useState("/Logo_Raccolto.png");
  const [fotoUrl,    setFotoUrl]    = useState(FOTO_FALLBACK);
  const [senhaVis,   setSenhaVis]   = useState(false);
  const router = useRouter();

  useEffect(() => {
    const { data: dataLogo } = supabase.storage.from("logos").getPublicUrl("arato.png");
    if (dataLogo?.publicUrl) setLogoUrl(dataLogo.publicUrl);
    const { data: dataRac } = supabase.storage.from("logos").getPublicUrl("raccolto.png");
    if (dataRac?.publicUrl) setLogoRacUrl(dataRac.publicUrl);
    const { data: dataFoto } = supabase.storage.from("logos").getPublicUrl("login-bg.jpg");
    if (dataFoto?.publicUrl) setFotoUrl(dataFoto.publicUrl);
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

  return (
    <div style={{
      minHeight: "100vh",
      display: "flex",
      fontFamily: "system-ui, -apple-system, sans-serif",
      background: "#0B1E35",
    }}>

      {/* ── PAINEL ESQUERDO — hero visual ── */}
      <div
        className="login-left"
        style={{
          flex: "0 0 58%",
          position: "relative",
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
          justifyContent: "flex-end",
        }}
      >
        {/* Foto de fundo */}
        <div style={{
          position: "absolute", inset: 0,
          backgroundImage: `url('${fotoUrl}')`,
          backgroundSize: "cover",
          backgroundPosition: "center 35%",
          zIndex: 0,
        }} />

        {/* Camada de cor — vignette com gradiente */}
        <div style={{
          position: "absolute", inset: 0,
          background: [
            "linear-gradient(to bottom, rgba(6,15,28,0.30) 0%, rgba(6,15,28,0.05) 35%, rgba(6,15,28,0.55) 70%, rgba(6,15,28,0.92) 100%)",
            "linear-gradient(to right, rgba(6,15,28,0.40) 0%, transparent 50%)",
          ].join(", "),
          zIndex: 1,
        }} />

        {/* Logo no canto superior esquerdo */}
        <div style={{ position: "absolute", top: 40, left: 48, zIndex: 3 }}>
          <img
            src={logoUrl}
            alt="Arato"
            style={{ height: 36, width: "auto", objectFit: "contain", filter: "brightness(0) invert(1)", opacity: 0.9 }}
            onError={e => { (e.target as HTMLImageElement).style.display = "none"; }}
          />
        </div>

        {/* Badge e decoração superior */}
        <div style={{ position: "absolute", top: 44, right: 48, zIndex: 3 }}>
          <div style={{
            display: "inline-flex", alignItems: "center", gap: 6,
            background: "rgba(201,146,27,0.18)",
            border: "1px solid rgba(201,146,27,0.40)",
            borderRadius: 20, padding: "5px 14px",
            fontSize: 10, fontWeight: 700, color: "#FDE9BB",
            letterSpacing: "0.10em", textTransform: "uppercase",
          }}>
            <span style={{ width: 5, height: 5, borderRadius: "50%", background: "#C9921B", display: "inline-block" }} />
            Gestão Agrícola
          </div>
        </div>

        {/* Conteúdo hero — base do painel */}
        <div style={{ position: "relative", zIndex: 2, padding: "0 52px 56px" }}>

          {/* Linha decorativa amber */}
          <div style={{ width: 40, height: 3, background: "#C9921B", borderRadius: 2, marginBottom: 28 }} />

          <h1 style={{
            margin: "0 0 18px",
            fontSize: 48,
            fontWeight: 800,
            color: "#fff",
            lineHeight: 1.1,
            letterSpacing: "-1px",
          }}>
            Menos cliques,<br />
            <span style={{ color: "#C9921B" }}>mais campo.</span>
          </h1>

          <p style={{
            margin: "0 0 40px",
            fontSize: 15,
            color: "rgba(255,255,255,0.60)",
            lineHeight: 1.7,
            maxWidth: 420,
          }}>
            Gerencie safras, contratos, financeiro e emissão de NF‑e
            em um único lugar — de qualquer lugar.
          </p>

          {/* Cards de recursos */}
          <div style={{ display: "flex", flexDirection: "column", gap: 10, maxWidth: 400 }}>
            {[
              { icon: "🌾", titulo: "Lavoura completa", desc: "Plantio, pulverização, colheita e DRE por ciclo" },
              { icon: "📄", titulo: "NF-e integrada",   desc: "Emissão direta para SEFAZ ao confirmar contrato" },
              { icon: "📊", titulo: "Financeiro vivo",  desc: "Fluxo de caixa, contratos e alertas automáticos" },
            ].map(f => (
              <div key={f.titulo} style={{
                display: "flex", gap: 14, alignItems: "flex-start",
                background: "rgba(255,255,255,0.06)",
                backdropFilter: "blur(8px)",
                border: "0.5px solid rgba(255,255,255,0.10)",
                borderRadius: 12, padding: "12px 16px",
              }}>
                <span style={{ fontSize: 18, lineHeight: 1 }}>{f.icon}</span>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "#fff", marginBottom: 2 }}>{f.titulo}</div>
                  <div style={{ fontSize: 11.5, color: "rgba(255,255,255,0.50)", lineHeight: 1.5 }}>{f.desc}</div>
                </div>
              </div>
            ))}
          </div>

          {/* Estatísticas */}
          <div style={{
            display: "flex", gap: 32, marginTop: 36,
            borderTop: "0.5px solid rgba(255,255,255,0.10)",
            paddingTop: 28,
          }}>
            {[
              { v: "100%", l: "Web e mobile" },
              { v: "< 1s",  l: "Resposta" },
              { v: "5 anos", l: "Guarda XML" },
            ].map(m => (
              <div key={m.l}>
                <div style={{ fontSize: 22, fontWeight: 800, color: "#fff", letterSpacing: "-0.5px" }}>{m.v}</div>
                <div style={{ fontSize: 11, color: "rgba(255,255,255,0.40)", marginTop: 3, letterSpacing: "0.03em" }}>{m.l}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── PAINEL DIREITO — formulário ── */}
      <div style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "52px 44px",
        background: "#fff",
        minHeight: "100vh",
        position: "relative",
      }}>

        {/* Detalhe geométrico sutil no canto */}
        <div style={{
          position: "absolute", top: 0, right: 0,
          width: 200, height: 200,
          background: "radial-gradient(circle at top right, rgba(26,72,112,0.06) 0%, transparent 70%)",
          pointerEvents: "none",
        }} />

        <div style={{ width: "100%", maxWidth: 380, position: "relative" }}>

          {/* ── Identidade do produto ── */}
          <div style={{ marginBottom: 44, textAlign: "center" }}>

            {/* Logo Arato — grande e central */}
            <div style={{
              display: "inline-block",
              padding: "18px 32px",
              background: "linear-gradient(135deg, #F7FAFD 0%, #EEF4FB 100%)",
              borderRadius: 20,
              border: "1px solid #DDE8F5",
              boxShadow: "0 4px 24px rgba(26,72,112,0.08)",
              marginBottom: 14,
            }}>
              <img
                src={logoUrl}
                alt="Arato"
                style={{ height: 56, width: "auto", objectFit: "contain", display: "block" }}
                onError={e => {
                  const el = e.target as HTMLImageElement;
                  el.style.display = "none";
                  const fb = el.nextSibling as HTMLElement;
                  if (fb) fb.style.display = "flex";
                }}
              />
              {/* Fallback */}
              <div style={{ display: "none", alignItems: "center", justifyContent: "center", height: 56, fontSize: 28, fontWeight: 900, color: "#1A4870", letterSpacing: "-1px" }}>
                Arato
              </div>
            </div>

            {/* Um produto Raccolto */}
            <div style={{
              display: "flex", alignItems: "center", justifyContent: "center", gap: 7,
            }}>
              <span style={{ fontSize: 11, color: "#A0AEC0", fontWeight: 500, letterSpacing: "0.03em" }}>
                um produto
              </span>
              <img
                src={logoRacUrl}
                alt="Raccolto"
                style={{ height: 16, width: "auto", objectFit: "contain", opacity: 0.65 }}
                onError={e => {
                  const el = e.target as HTMLImageElement;
                  el.style.display = "none";
                  const fb = el.nextSibling as HTMLElement;
                  if (fb) fb.style.display = "inline";
                }}
              />
              <span style={{ display: "none", fontSize: 11, fontWeight: 700, color: "#6B7B8D", letterSpacing: "0.02em" }}>Raccolto</span>
            </div>
          </div>

          {/* Divisor */}
          <div style={{ width: "100%", height: 1, background: "#EEF1F7", marginBottom: 32 }} />

          {/* Título do modo */}
          <div style={{ marginBottom: 28 }}>
            <h2 style={{ margin: "0 0 6px", fontSize: 22, fontWeight: 800, color: "#0B1E35", letterSpacing: "-0.3px" }}>
              {modo === "login" ? "Bem-vindo de volta" : "Recuperar senha"}
            </h2>
            <p style={{ margin: 0, fontSize: 13.5, color: "#8A9AB0", lineHeight: 1.5 }}>
              {modo === "login"
                ? "Entre com suas credenciais para acessar o painel."
                : "Informe seu e-mail e enviaremos um link de redefinição."}
            </p>
          </div>

          {/* Alertas */}
          {erro && (
            <div style={{
              background: "#FEF2F2", border: "1px solid #FECACA",
              borderRadius: 10, padding: "11px 14px", marginBottom: 20,
              fontSize: 13, color: "#B91C1C", display: "flex", gap: 8, alignItems: "flex-start",
            }}>
              <span style={{ fontSize: 15, marginTop: 1, flexShrink: 0 }}>⚠</span>
              {erro}
            </div>
          )}
          {sucesso && (
            <div style={{
              background: "#F0FDF4", border: "1px solid #BBF7D0",
              borderRadius: 10, padding: "11px 14px", marginBottom: 20,
              fontSize: 13, color: "#15803D", display: "flex", gap: 8, alignItems: "flex-start",
            }}>
              <span style={{ fontSize: 15, marginTop: 1, flexShrink: 0 }}>✓</span>
              {sucesso}
            </div>
          )}

          <form onSubmit={modo === "login" ? entrar : recuperarSenha}>

            {/* E-mail */}
            <div style={{ marginBottom: 16 }}>
              <label style={{
                display: "block", fontSize: 12, fontWeight: 600,
                color: "#4A5568", marginBottom: 7, letterSpacing: "0.04em",
                textTransform: "uppercase",
              }}>
                E-mail
              </label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                placeholder="seu@email.com.br"
                style={{
                  width: "100%", padding: "13px 16px",
                  border: "1.5px solid #E2E8F3", borderRadius: 12,
                  fontSize: 14, outline: "none", boxSizing: "border-box",
                  color: "#1a1a1a", background: "#FAFBFD",
                  fontFamily: "system-ui, sans-serif",
                  transition: "border-color 0.15s, box-shadow 0.15s",
                }}
                onFocus={e => {
                  e.target.style.borderColor = "#1A4870";
                  e.target.style.boxShadow = "0 0 0 3px rgba(26,72,112,0.10)";
                }}
                onBlur={e => {
                  e.target.style.borderColor = "#E2E8F3";
                  e.target.style.boxShadow = "none";
                }}
              />
            </div>

            {/* Senha */}
            {modo === "login" && (
              <div style={{ marginBottom: 10 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 7 }}>
                  <label style={{
                    fontSize: 12, fontWeight: 600, color: "#4A5568",
                    letterSpacing: "0.04em", textTransform: "uppercase",
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
                    style={{
                      width: "100%", padding: "13px 48px 13px 16px",
                      border: "1.5px solid #E2E8F3", borderRadius: 12,
                      fontSize: 14, outline: "none", boxSizing: "border-box",
                      color: "#1a1a1a", background: "#FAFBFD",
                      fontFamily: "system-ui, sans-serif",
                      transition: "border-color 0.15s, box-shadow 0.15s",
                    }}
                    onFocus={e => {
                      e.target.style.borderColor = "#1A4870";
                      e.target.style.boxShadow = "0 0 0 3px rgba(26,72,112,0.10)";
                    }}
                    onBlur={e => {
                      e.target.style.borderColor = "#E2E8F3";
                      e.target.style.boxShadow = "none";
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => setSenhaVis(v => !v)}
                    style={{
                      position: "absolute", right: 14, top: "50%", transform: "translateY(-50%)",
                      background: "none", border: "none", cursor: "pointer",
                      color: "#9AA5B4", fontSize: 16, padding: 2, lineHeight: 1,
                    }}
                    title={senhaVis ? "Ocultar senha" : "Mostrar senha"}
                  >
                    {senhaVis
                      ? <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                      : <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                    }
                  </button>
                </div>
              </div>
            )}

            {/* Botão principal */}
            <button
              type="submit"
              disabled={carregando || (modo === "recuperar" && !!sucesso)}
              style={{
                width: "100%", marginTop: modo === "login" ? 24 : 20,
                background: carregando ? "#8BA8C4" : "linear-gradient(135deg, #1A4870 0%, #0B2D50 100%)",
                color: "#fff", border: "none", borderRadius: 12,
                padding: "15px", fontSize: 15, fontWeight: 700,
                cursor: carregando ? "not-allowed" : "pointer",
                letterSpacing: "0.01em",
                transition: "opacity 0.15s, transform 0.1s, box-shadow 0.15s",
                boxShadow: carregando ? "none" : "0 6px 20px rgba(26,72,112,0.35)",
              }}
              onMouseEnter={e => { if (!carregando) { (e.currentTarget as HTMLButtonElement).style.opacity = "0.88"; (e.currentTarget as HTMLButtonElement).style.transform = "translateY(-1px)"; } }}
              onMouseLeave={e => { if (!carregando) { (e.currentTarget as HTMLButtonElement).style.opacity = "1"; (e.currentTarget as HTMLButtonElement).style.transform = "translateY(0)"; } }}
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
                  width: "100%", background: "none", border: "1.5px solid #E2E8F3",
                  borderRadius: 12, padding: "13px", marginTop: 10,
                  fontSize: 14, color: "#4A5568", cursor: "pointer", fontWeight: 500,
                  transition: "border-color 0.15s",
                }}
                onMouseEnter={e => (e.currentTarget.style.borderColor = "#1A4870")}
                onMouseLeave={e => (e.currentTarget.style.borderColor = "#E2E8F3")}
              >
                ← Voltar ao login
              </button>
            )}
          </form>

          {/* Não tem conta */}
          {modo === "login" && (
            <div style={{ marginTop: 24, textAlign: "center" }}>
              <span style={{ fontSize: 13, color: "#A0AEC0" }}>Ainda não tem conta? </span>
              <a href="/planos" style={{ fontSize: 13, color: "#1A4870", fontWeight: 700, textDecoration: "none" }}>
                Conheça os planos →
              </a>
            </div>
          )}

          {/* Rodapé mínimo */}
          <div style={{
            marginTop: 36, textAlign: "center",
          }}>
            <span style={{ fontSize: 11, color: "#CBD5E0" }}>© 2026 Raccolto Consultoria · v1.0</span>
          </div>
        </div>
      </div>

      <style>{`
        @media (max-width: 860px) {
          .login-left { display: none !important; }
        }
      `}</style>
    </div>
  );
}
