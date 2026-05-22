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
  const [fotoUrl,    setFotoUrl]    = useState(FOTO_FALLBACK);
  const [senhaVis,   setSenhaVis]   = useState(false);
  const router = useRouter();

  useEffect(() => {
    const { data: dataLogo } = supabase.storage.from("logos").getPublicUrl("arato.png");
    if (dataLogo?.publicUrl) setLogoUrl(dataLogo.publicUrl);
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

  const inp: React.CSSProperties = {
    width: "100%", padding: "13px 16px",
    border: "1.5px solid #E4EAF2", borderRadius: 12,
    fontSize: 14, outline: "none", boxSizing: "border-box",
    color: "#1a1a1a", background: "#FAFBFD",
    fontFamily: "system-ui, sans-serif",
    transition: "border-color 0.15s, box-shadow 0.15s",
  };

  return (
    <div style={{
      minHeight: "100vh",
      display: "flex",
      fontFamily: "system-ui, -apple-system, sans-serif",
      background: "#fff",
    }}>

      {/* ── PAINEL ESQUERDO — imagem + marca ── */}
      <div style={{
        flex: "0 0 55%",
        position: "relative",
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
      }}
        className="login-left-panel"
      >
        {/* Foto de fundo */}
        <div style={{
          position: "absolute", inset: 0,
          backgroundImage: `url('${fotoUrl}')`,
          backgroundSize: "cover",
          backgroundPosition: "center 30%",
          zIndex: 0,
        }} />

        {/* Gradiente escurecedor — mais forte embaixo para o texto */}
        <div style={{
          position: "absolute", inset: 0,
          background: "linear-gradient(160deg, rgba(7,22,40,0.78) 0%, rgba(11,40,72,0.60) 45%, rgba(6,18,32,0.82) 100%)",
          zIndex: 1,
        }} />

        {/* Conteúdo sobre a imagem */}
        <div style={{ position: "relative", zIndex: 2, padding: "40px 48px" }}>
          {/* Logo branca */}
          <img
            src={logoUrl}
            alt="Arato"
            style={{ height: 42, width: "auto", objectFit: "contain", filter: "brightness(0) invert(1)" }}
            onError={e => { (e.target as HTMLImageElement).style.display = "none"; }}
          />
        </div>

        {/* Texto hero na base */}
        <div style={{ position: "relative", zIndex: 2, padding: "0 48px 52px" }}>
          <div style={{
            display: "inline-block",
            background: "rgba(201,146,27,0.22)",
            border: "1px solid rgba(201,146,27,0.5)",
            borderRadius: 20,
            padding: "4px 14px",
            fontSize: 11,
            fontWeight: 700,
            color: "#FDE9BB",
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            marginBottom: 18,
          }}>
            Gestão Agrícola Inteligente
          </div>
          <h1 style={{
            margin: "0 0 16px",
            fontSize: 36,
            fontWeight: 800,
            color: "#fff",
            lineHeight: 1.2,
            letterSpacing: "-0.5px",
          }}>
            Menos cliques,<br />mais campo.
          </h1>
          <p style={{
            margin: 0,
            fontSize: 15,
            color: "rgba(255,255,255,0.65)",
            lineHeight: 1.6,
            maxWidth: 380,
          }}>
            Gerencie safras, contratos, financeiro e emissão de NF-e em um único lugar — de qualquer lugar.
          </p>

          {/* Métricas rápidas */}
          <div style={{
            display: "flex", gap: 28, marginTop: 36,
            borderTop: "0.5px solid rgba(255,255,255,0.12)",
            paddingTop: 28,
          }}>
            {[
              { v: "100%", l: "Web e mobile" },
              { v: "< 1s",  l: "Tempo de resposta" },
              { v: "NF-e",  l: "Emissão integrada" },
            ].map(m => (
              <div key={m.l}>
                <div style={{ fontSize: 20, fontWeight: 800, color: "#fff" }}>{m.v}</div>
                <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", marginTop: 2 }}>{m.l}</div>
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
        padding: "48px 40px",
        background: "#fff",
        minHeight: "100vh",
      }}>

        {/* Bloco central do formulário — largura máxima */}
        <div style={{ width: "100%", maxWidth: 400 }}>

          {/* Logo (mobile / redundância) */}
          <div style={{ marginBottom: 40 }}>
            <img
              src={logoUrl}
              alt="Arato"
              style={{ height: 38, width: "auto", objectFit: "contain" }}
              onError={e => {
                const el = e.target as HTMLImageElement;
                el.style.display = "none";
                const next = el.nextSibling as HTMLElement;
                if (next) next.style.display = "block";
              }}
            />
            {/* Fallback texto caso logo não carregue */}
            <div style={{ display: "none", fontSize: 24, fontWeight: 800, color: "#1A4870" }}>Arato</div>
          </div>

          {/* Título */}
          <h2 style={{ margin: "0 0 6px", fontSize: 26, fontWeight: 800, color: "#0B1E35", letterSpacing: "-0.3px" }}>
            {modo === "login" ? "Bem-vindo de volta" : "Recuperar senha"}
          </h2>
          <p style={{ margin: "0 0 36px", fontSize: 14, color: "#7A8A9A", lineHeight: 1.5 }}>
            {modo === "login"
              ? "Entre com suas credenciais para acessar o painel."
              : "Informe seu e-mail e enviaremos um link de redefinição."}
          </p>

          {/* Alertas */}
          {erro && (
            <div style={{
              background: "#FEF2F2", border: "1px solid #FECACA",
              borderRadius: 10, padding: "11px 14px", marginBottom: 24,
              fontSize: 13, color: "#B91C1C", display: "flex", gap: 8, alignItems: "flex-start",
            }}>
              <span style={{ fontSize: 15, marginTop: 1 }}>⚠</span>
              {erro}
            </div>
          )}
          {sucesso && (
            <div style={{
              background: "#F0FDF4", border: "1px solid #BBF7D0",
              borderRadius: 10, padding: "11px 14px", marginBottom: 24,
              fontSize: 13, color: "#15803D", display: "flex", gap: 8, alignItems: "flex-start",
            }}>
              <span style={{ fontSize: 15, marginTop: 1 }}>✓</span>
              {sucesso}
            </div>
          )}

          <form onSubmit={modo === "login" ? entrar : recuperarSenha}>

            {/* E-mail */}
            <div style={{ marginBottom: 18 }}>
              <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#4A5568", marginBottom: 7, letterSpacing: "0.02em" }}>
                E-mail
              </label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                placeholder="seu@email.com.br"
                style={inp}
                onFocus={e => { e.target.style.borderColor = "#1A4870"; e.target.style.boxShadow = "0 0 0 3px rgba(26,72,112,0.08)"; }}
                onBlur={e => { e.target.style.borderColor = "#E4EAF2"; e.target.style.boxShadow = "none"; }}
              />
            </div>

            {/* Senha */}
            {modo === "login" && (
              <div style={{ marginBottom: 10 }}>
                <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#4A5568", marginBottom: 7 }}>
                  Senha
                </label>
                <div style={{ position: "relative" }}>
                  <input
                    type={senhaVis ? "text" : "password"}
                    value={senha}
                    onChange={e => setSenha(e.target.value)}
                    required
                    placeholder="••••••••"
                    style={{ ...inp, paddingRight: 48 }}
                    onFocus={e => { e.target.style.borderColor = "#1A4870"; e.target.style.boxShadow = "0 0 0 3px rgba(26,72,112,0.08)"; }}
                    onBlur={e => { e.target.style.borderColor = "#E4EAF2"; e.target.style.boxShadow = "none"; }}
                  />
                  <button
                    type="button"
                    onClick={() => setSenhaVis(v => !v)}
                    style={{
                      position: "absolute", right: 14, top: "50%", transform: "translateY(-50%)",
                      background: "none", border: "none", cursor: "pointer",
                      color: "#9AA5B4", fontSize: 16, padding: 2,
                    }}
                    title={senhaVis ? "Ocultar senha" : "Mostrar senha"}
                  >
                    {senhaVis ? "🙈" : "👁"}
                  </button>
                </div>
              </div>
            )}

            {/* Esqueceu senha */}
            {modo === "login" && (
              <div style={{ textAlign: "right", marginBottom: 28 }}>
                <button
                  type="button"
                  onClick={() => { setModo("recuperar"); setErro(null); setSucesso(null); }}
                  style={{
                    background: "none", border: "none", padding: 0,
                    fontSize: 13, color: "#1A4870", cursor: "pointer", fontWeight: 500,
                  }}
                >
                  Esqueceu sua senha?
                </button>
              </div>
            )}

            {/* Botão principal */}
            <button
              type="submit"
              disabled={carregando || (modo === "recuperar" && !!sucesso)}
              style={{
                width: "100%",
                background: carregando ? "#8BA8C4" : "#1A4870",
                color: "#fff", border: "none", borderRadius: 12,
                padding: "15px", fontSize: 15, fontWeight: 700,
                cursor: carregando ? "not-allowed" : "pointer",
                letterSpacing: "0.01em",
                transition: "background 0.15s, transform 0.1s",
                boxShadow: carregando ? "none" : "0 4px 16px rgba(26,72,112,0.30)",
              }}
              onMouseEnter={e => { if (!carregando) (e.target as HTMLButtonElement).style.background = "#0B2D50"; }}
              onMouseLeave={e => { if (!carregando) (e.target as HTMLButtonElement).style.background = "#1A4870"; }}
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
                  width: "100%", background: "none", border: "1.5px solid #E4EAF2",
                  borderRadius: 12, padding: "13px", marginTop: 12,
                  fontSize: 14, color: "#4A5568", cursor: "pointer", fontWeight: 500,
                  transition: "border-color 0.15s",
                }}
                onMouseEnter={e => (e.currentTarget.style.borderColor = "#1A4870")}
                onMouseLeave={e => (e.currentTarget.style.borderColor = "#E4EAF2")}
              >
                ← Voltar ao login
              </button>
            )}
          </form>

          {/* Não tem conta? */}
          {modo === "login" && (
            <div style={{ marginTop: 28, textAlign: "center" }}>
              <span style={{ fontSize: 13, color: "#9AA5B4" }}>Ainda não tem conta? </span>
              <a href="/planos" style={{ fontSize: 13, color: "#1A4870", fontWeight: 600, textDecoration: "none" }}>
                Conheça os planos →
              </a>
            </div>
          )}

          {/* Rodapé */}
          <div style={{
            marginTop: 32,
            paddingTop: 24,
            borderTop: "0.5px solid #EEF1F6",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}>
            <span style={{ fontSize: 12, color: "#C0CAD6" }}>Raccolto Consultoria · © 2026</span>
            <span style={{ fontSize: 12, color: "#C0CAD6" }}>v1.0</span>
          </div>
        </div>
      </div>

      {/* Responsivo: esconde painel esquerdo em telas pequenas */}
      <style>{`
        @media (max-width: 768px) {
          .login-left-panel { display: none !important; }
        }
      `}</style>
    </div>
  );
}
