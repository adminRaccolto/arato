"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../../lib/supabase";

export default function CampoLogin() {
  const [email,      setEmail]      = useState("");
  const [senha,      setSenha]      = useState("");
  const [erro,       setErro]       = useState<string | null>(null);
  const [loading,    setLoading]    = useState(false);
  const [senhaVis,   setSenhaVis]   = useState(false);
  const [logoUrl,    setLogoUrl]    = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    // Verifica se já está logado — redireciona direto
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) router.replace("/campo");
    });
    // Logo customizada do cliente (opcional)
    const { data } = supabase.storage.from("logos").getPublicUrl("campo-logo.png");
    if (data?.publicUrl) {
      const img = new window.Image();
      img.onload = () => setLogoUrl(data.publicUrl);
      img.src = data.publicUrl;
    }
  }, []);

  async function entrar(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password: senha });
    if (error) {
      setErro("E-mail ou senha incorretos.");
      setLoading(false);
      return;
    }
    router.replace("/campo");
  }

  return (
    <div style={{
      minHeight: "100dvh",
      background: "#0D1117",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      fontFamily: "system-ui, sans-serif",
      padding: "24px 20px",
    }}>
      {/* Card central */}
      <div style={{
        width: "100%",
        maxWidth: 380,
        background: "#161B22",
        borderRadius: 20,
        border: "0.5px solid rgba(255,255,255,0.10)",
        padding: "40px 32px",
        boxShadow: "0 20px 60px rgba(0,0,0,0.5)",
      }}>
        {/* Logo */}
        <div style={{ textAlign: "center", marginBottom: 36 }}>
          {logoUrl ? (
            <img src={logoUrl} alt="Logo" style={{ height: 40, marginBottom: 16, objectFit: "contain" }} />
          ) : (
            <img src="/Arato_BRANCO.png" alt="Arato" style={{ height: 32, marginBottom: 16, opacity: 0.9, objectFit: "contain" }} />
          )}
          <div style={{ fontSize: 22, fontWeight: 700, color: "#FFFFFF", marginBottom: 4 }}>
            App Campo
          </div>
          <div style={{ fontSize: 13, color: "rgba(255,255,255,0.45)" }}>
            Acesse com seu e-mail e senha
          </div>
        </div>

        <form onSubmit={entrar} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {/* E-mail */}
          <div>
            <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: "rgba(255,255,255,0.55)", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.06em" }}>
              E-mail
            </label>
            <input
              type="email"
              autoComplete="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="seu@email.com"
              required
              style={{
                width: "100%", boxSizing: "border-box",
                padding: "13px 16px",
                background: "rgba(255,255,255,0.06)",
                border: "1px solid rgba(255,255,255,0.15)",
                borderRadius: 10,
                fontSize: 15,
                color: "#FFFFFF",
                outline: "none",
              }}
              onFocus={e => (e.currentTarget.style.borderColor = "#4A8FC7")}
              onBlur={e => (e.currentTarget.style.borderColor = "rgba(255,255,255,0.15)")}
            />
          </div>

          {/* Senha */}
          <div>
            <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: "rgba(255,255,255,0.55)", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.06em" }}>
              Senha
            </label>
            <div style={{ position: "relative" }}>
              <input
                type={senhaVis ? "text" : "password"}
                autoComplete="current-password"
                value={senha}
                onChange={e => setSenha(e.target.value)}
                placeholder="••••••••"
                required
                style={{
                  width: "100%", boxSizing: "border-box",
                  padding: "13px 48px 13px 16px",
                  background: "rgba(255,255,255,0.06)",
                  border: "1px solid rgba(255,255,255,0.15)",
                  borderRadius: 10,
                  fontSize: 15,
                  color: "#FFFFFF",
                  outline: "none",
                }}
                onFocus={e => (e.currentTarget.style.borderColor = "#4A8FC7")}
                onBlur={e => (e.currentTarget.style.borderColor = "rgba(255,255,255,0.15)")}
              />
              <button
                type="button"
                onClick={() => setSenhaVis(v => !v)}
                style={{
                  position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)",
                  background: "none", border: "none", cursor: "pointer",
                  fontSize: 16, color: "rgba(255,255,255,0.45)", padding: 0,
                }}
                aria-label={senhaVis ? "Esconder senha" : "Ver senha"}
              >
                {senhaVis ? "🙈" : "👁"}
              </button>
            </div>
          </div>

          {/* Erro */}
          {erro && (
            <div style={{
              background: "rgba(226,75,74,0.15)",
              border: "1px solid rgba(226,75,74,0.35)",
              borderRadius: 8,
              padding: "10px 14px",
              fontSize: 13,
              color: "#F87171",
            }}>
              {erro}
            </div>
          )}

          {/* Botão entrar */}
          <button
            type="submit"
            disabled={loading || !email || !senha}
            style={{
              width: "100%",
              padding: "14px",
              marginTop: 4,
              background: loading || !email || !senha ? "rgba(74,143,199,0.4)" : "#4A8FC7",
              border: "none",
              borderRadius: 10,
              fontSize: 15,
              fontWeight: 700,
              color: "#FFFFFF",
              cursor: loading || !email || !senha ? "not-allowed" : "pointer",
              transition: "background 0.15s",
            }}
          >
            {loading ? "Entrando…" : "Entrar"}
          </button>
        </form>

        {/* Rodapé */}
        <div style={{ marginTop: 28, textAlign: "center", fontSize: 12, color: "rgba(255,255,255,0.25)" }}>
          Apenas para operadores de campo.{" "}
          <a href="/login" style={{ color: "rgba(255,255,255,0.4)", textDecoration: "underline" }}>
            Acesso ao ERP
          </a>
        </div>
      </div>

      {/* Versão */}
      <div style={{ marginTop: 20, fontSize: 11, color: "rgba(255,255,255,0.18)" }}>
        Arato Agro · App Campo
      </div>
    </div>
  );
}
