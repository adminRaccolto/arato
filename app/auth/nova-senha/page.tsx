"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../../lib/supabase";

export default function NovaSenha() {
  const [senha,       setSenha]       = useState("");
  const [confirma,    setConfirma]    = useState("");
  const [erro,        setErro]        = useState<string | null>(null);
  const [sucesso,     setSucesso]     = useState(false);
  const [carregando,  setCarregando]  = useState(false);
  const [sessaoOk,    setSessaoOk]    = useState(false);
  const router = useRouter();

  useEffect(() => {
    // Supabase processa o token do hash automaticamente ao carregar a página
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) setSessaoOk(true);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") setSessaoOk(true);
    });

    return () => listener.subscription.unsubscribe();
  }, []);

  async function definirNovaSenha(e: React.FormEvent) {
    e.preventDefault();
    if (senha !== confirma) { setErro("As senhas não coincidem."); return; }
    if (senha.length < 6)   { setErro("A senha deve ter pelo menos 6 caracteres."); return; }

    setCarregando(true);
    setErro(null);
    const { error } = await supabase.auth.updateUser({ password: senha });
    setCarregando(false);

    if (error) { setErro("Não foi possível atualizar a senha. Tente novamente."); return; }
    setSucesso(true);
    setTimeout(() => router.push("/"), 2500);
  }

  const inputStyle: React.CSSProperties = {
    width: "100%", padding: "11px 14px",
    border: "1px solid #E0E6EE", borderRadius: 10,
    fontSize: 13, outline: "none", boxSizing: "border-box",
    color: "#1a1a1a", background: "#F7F9FB",
  };

  return (
    <div style={{
      minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center",
      background: "linear-gradient(160deg, #0B2D50 0%, #1A4870 100%)",
      fontFamily: "system-ui, sans-serif",
    }}>
      <div style={{
        width: "100%", maxWidth: 400, margin: "24px",
        background: "#fff", borderRadius: 20,
        boxShadow: "0 24px 64px rgba(0,0,0,0.35)",
        overflow: "hidden",
      }}>
        {/* Topo */}
        <div style={{
          background: "#fff", padding: "32px 40px 24px",
          textAlign: "center", borderBottom: "0.5px solid #EEF1F6",
        }}>
          <img src="/Logo_Arato.png" alt="Arato" style={{ height: 48, width: "auto", objectFit: "contain", marginBottom: 12 }} />
          <div style={{ color: "#aaa", fontSize: 11, letterSpacing: "0.12em", textTransform: "uppercase" }}>
            Menos clique, mais gestão
          </div>
        </div>

        {/* Conteúdo */}
        <div style={{ padding: "32px 40px 36px" }}>
          <h2 style={{ margin: "0 0 4px", fontSize: 20, fontWeight: 700, color: "#1a1a1a" }}>
            Nova senha
          </h2>
          <p style={{ margin: "0 0 28px", fontSize: 13, color: "#888" }}>
            Defina sua nova senha de acesso
          </p>

          {!sessaoOk && (
            <div style={{
              background: "#FFF8E1", border: "0.5px solid rgba(201,146,27,0.4)",
              borderRadius: 8, padding: "9px 12px", marginBottom: 20,
              fontSize: 12, color: "#7A5000",
            }}>
              Aguardando validação do link… Se demorar, volte ao e-mail e clique no link novamente.
            </div>
          )}

          {erro && (
            <div style={{
              background: "#FDECEA", border: "0.5px solid rgba(226,75,74,0.4)",
              borderRadius: 8, padding: "9px 12px", marginBottom: 20,
              fontSize: 12, color: "#8B1A1A",
            }}>
              {erro}
            </div>
          )}

          {sucesso ? (
            <div style={{
              background: "#EDFAF3", border: "0.5px solid rgba(22,163,74,0.4)",
              borderRadius: 8, padding: "16px 12px", textAlign: "center",
              fontSize: 13, color: "#145C33",
            }}>
              Senha atualizada com sucesso! Redirecionando…
            </div>
          ) : (
            <form onSubmit={definirNovaSenha}>
              <div style={{ marginBottom: 16 }}>
                <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "#555", marginBottom: 6, letterSpacing: "0.06em" }}>
                  NOVA SENHA
                </label>
                <input
                  type="password"
                  value={senha}
                  onChange={e => setSenha(e.target.value)}
                  required
                  placeholder="Mínimo 6 caracteres"
                  style={inputStyle}
                  onFocus={e => e.target.style.borderColor = "#1A4870"}
                  onBlur={e => e.target.style.borderColor = "#E0E6EE"}
                />
              </div>

              <div style={{ marginBottom: 28 }}>
                <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "#555", marginBottom: 6, letterSpacing: "0.06em" }}>
                  CONFIRMAR SENHA
                </label>
                <input
                  type="password"
                  value={confirma}
                  onChange={e => setConfirma(e.target.value)}
                  required
                  placeholder="Repita a nova senha"
                  style={inputStyle}
                  onFocus={e => e.target.style.borderColor = "#1A4870"}
                  onBlur={e => e.target.style.borderColor = "#E0E6EE"}
                />
              </div>

              <button
                type="submit"
                disabled={carregando || !sessaoOk}
                style={{
                  width: "100%",
                  background: (carregando || !sessaoOk) ? "#aaa" : "#1A5C38",
                  color: "#fff", border: "none", borderRadius: 10,
                  padding: "13px", fontSize: 14, fontWeight: 700,
                  cursor: (carregando || !sessaoOk) ? "not-allowed" : "pointer",
                  boxShadow: (carregando || !sessaoOk) ? "none" : "0 4px 14px rgba(26,92,56,0.4)",
                }}
              >
                {carregando ? "Salvando…" : "Salvar nova senha"}
              </button>
            </form>
          )}
        </div>

        <div style={{
          padding: "12px 40px 16px", borderTop: "0.5px solid #EEF1F6",
          display: "flex", justifyContent: "space-between", alignItems: "center",
        }}>
          <span style={{ fontSize: 11, color: "#bbb" }}>Raccolto Consultoria</span>
          <span style={{ fontSize: 11, color: "#bbb" }}>© 2026</span>
        </div>
      </div>
    </div>
  );
}
