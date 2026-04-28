"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabase";

// Fallback enquanto a foto do Supabase não carrega
const FOTO_FALLBACK = "https://images.unsplash.com/photo-1574323347407-f5e1ad6d020b?w=1920&q=80";

export default function Login() {
  const [email,      setEmail]      = useState("");
  const [senha,      setSenha]      = useState("");
  const [erro,       setErro]       = useState<string | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [logoUrl,      setLogoUrl]      = useState("/Logo_Arato.png");
  const [fotoUrl,      setFotoUrl]      = useState(FOTO_FALLBACK);
  const [logoRodape,   setLogoRodape]   = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    const { data: dataLogo } = supabase.storage.from("logos").getPublicUrl("arato.png");
    if (dataLogo?.publicUrl) setLogoUrl(dataLogo.publicUrl);

    const { data: dataFoto } = supabase.storage.from("logos").getPublicUrl("login-bg.jpg");
    if (dataFoto?.publicUrl) setFotoUrl(dataFoto.publicUrl);

    // Imagem pequena no rodapé (ex: logo Raccolto) — arquivo "rodape.png" no bucket logos
    const { data: dataRodape } = supabase.storage.from("logos").getPublicUrl("rodape.png");
    if (dataRodape?.publicUrl) setLogoRodape(dataRodape.publicUrl);
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

  return (
    <div style={{
      minHeight: "100vh",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      fontFamily: "system-ui, sans-serif",
      position: "relative",
      overflow: "hidden",
    }}>

      {/* ── Foto de fundo ── */}
      <div style={{
        position: "absolute", inset: 0,
        backgroundImage: `url('${fotoUrl}')`,
        backgroundSize: "cover",
        backgroundPosition: "center",
        filter: "brightness(0.55)",
        zIndex: 0,
      }} />

      {/* ── Overlay gradiente sutil ── */}
      <div style={{
        position: "absolute", inset: 0,
        background: "linear-gradient(160deg, rgba(10,30,50,0.55) 0%, rgba(26,72,112,0.35) 100%)",
        zIndex: 1,
      }} />

      {/* ── Card de login ── */}
      <div style={{
        position: "relative", zIndex: 2,
        width: "100%", maxWidth: 400,
        margin: "24px",
        background: "rgba(255,255,255,0.94)",
        backdropFilter: "blur(20px)",
        WebkitBackdropFilter: "blur(20px)",
        borderRadius: 20,
        boxShadow: "0 24px 64px rgba(0,0,0,0.35), 0 0 0 0.5px rgba(255,255,255,0.3)",
        overflow: "hidden",
      }}>

        {/* ── Topo branco com logo ── */}
        <div style={{
          background: "#fff",
          padding: "32px 40px 24px",
          textAlign: "center",
          borderBottom: "0.5px solid #EEF1F6",
        }}>
          <img
            src={logoUrl}
            alt="Arato"
            style={{ height: 48, width: "auto", objectFit: "contain", marginBottom: 12 }}
          />
          <div style={{ color: "#aaa", fontSize: 11, letterSpacing: "0.12em", textTransform: "uppercase" }}>
            Menos clique, mais gestão
          </div>
        </div>

        {/* ── Formulário ── */}
        <div style={{ padding: "32px 40px 36px" }}>

          <h2 style={{ margin: "0 0 4px", fontSize: 20, fontWeight: 700, color: "#1a1a1a" }}>
            Bem-vindo
          </h2>
          <p style={{ margin: "0 0 28px", fontSize: 13, color: "#888" }}>
            Entre com sua conta para acessar o sistema
          </p>

          {erro && (
            <div style={{
              background: "#FDECEA", border: "0.5px solid rgba(226,75,74,0.4)",
              borderRadius: 8, padding: "9px 12px", marginBottom: 20,
              fontSize: 12, color: "#8B1A1A",
            }}>
              {erro}
            </div>
          )}

          <form onSubmit={entrar}>
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "#555", marginBottom: 6, letterSpacing: "0.06em" }}>
                E-MAIL
              </label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                placeholder="seu@email.com"
                style={{
                  width: "100%", padding: "11px 14px",
                  border: "1px solid #E0E6EE", borderRadius: 10,
                  fontSize: 13, outline: "none", boxSizing: "border-box",
                  color: "#1a1a1a", background: "#F7F9FB",
                  transition: "border-color 0.15s",
                }}
                onFocus={e => e.target.style.borderColor = "#1A4870"}
                onBlur={e => e.target.style.borderColor = "#E0E6EE"}
              />
            </div>

            <div style={{ marginBottom: 28 }}>
              <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "#555", marginBottom: 6, letterSpacing: "0.06em" }}>
                SENHA
              </label>
              <input
                type="password"
                value={senha}
                onChange={e => setSenha(e.target.value)}
                required
                placeholder="••••••••"
                style={{
                  width: "100%", padding: "11px 14px",
                  border: "1px solid #E0E6EE", borderRadius: 10,
                  fontSize: 13, outline: "none", boxSizing: "border-box",
                  color: "#1a1a1a", background: "#F7F9FB",
                }}
                onFocus={e => e.target.style.borderColor = "#1A4870"}
                onBlur={e => e.target.style.borderColor = "#E0E6EE"}
              />
            </div>

            <button
              type="submit"
              disabled={carregando}
              style={{
                width: "100%",
                background: carregando ? "#aaa" : "#1A5C38",
                color: "#fff", border: "none", borderRadius: 10,
                padding: "13px", fontSize: 14, fontWeight: 700,
                cursor: carregando ? "not-allowed" : "pointer",
                letterSpacing: "0.02em",
                transition: "background 0.15s, transform 0.1s",
                boxShadow: carregando ? "none" : "0 4px 14px rgba(26,92,56,0.4)",
              }}
            >
              {carregando ? "Entrando…" : "Entrar"}
            </button>
          </form>
        </div>

        {/* ── Rodapé do card ── */}
        <div style={{
          padding: "12px 40px 16px",
          borderTop: "0.5px solid #EEF1F6",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}>
          {logoRodape
            ? <img src={logoRodape} alt="Logo" style={{ height: 28, width: "auto", objectFit: "contain", opacity: 0.7 }} />
            : <span style={{ fontSize: 11, color: "#bbb" }}>Raccolto Consultoria</span>
          }
          <span style={{ fontSize: 11, color: "#bbb" }}>© 2026</span>
        </div>
      </div>
    </div>
  );
}
