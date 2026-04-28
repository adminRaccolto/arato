"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabase";

export default function AlterarSenha() {
  const [novaSenha,    setNovaSenha]    = useState("");
  const [confirmSenha, setConfirmSenha] = useState("");
  const [salvando,     setSalvando]     = useState(false);
  const [erro,         setErro]         = useState<string | null>(null);
  const [showSenha,    setShowSenha]    = useState(false);
  const router = useRouter();

  const senhasOk = novaSenha.length >= 8 && novaSenha === confirmSenha;

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    if (!senhasOk) return;
    setSalvando(true);
    setErro(null);

    // 1. Trocar a senha
    const { error: senhaErr } = await supabase.auth.updateUser({ password: novaSenha });
    if (senhaErr) { setErro("Erro ao atualizar senha: " + senhaErr.message); setSalvando(false); return; }

    // 2. Limpar a flag de troca obrigatória
    await supabase.auth.updateUser({ data: { must_change_password: false } });

    router.push("/");
    router.refresh();
  }

  return (
    <div style={{
      minHeight: "100vh", background: "#F0F4FA",
      display: "flex", alignItems: "center", justifyContent: "center",
      fontFamily: "system-ui, sans-serif", padding: 16,
    }}>
      <div style={{ width: "100%", maxWidth: 400 }}>

        <div style={{ textAlign: "center", marginBottom: 24 }}>
          <img src="/Logo_Arato.png" alt="Arato" style={{ height: 38, marginBottom: 10 }} />
        </div>

        <div style={{ background: "#fff", borderRadius: 14, boxShadow: "0 4px 24px rgba(0,0,0,0.09)", padding: "36px 40px" }}>
          <h2 style={{ margin: "0 0 6px", fontSize: 18, fontWeight: 700, color: "#1a1a1a" }}>Crie sua senha</h2>
          <p style={{ margin: "0 0 28px", fontSize: 13, color: "#666", lineHeight: 1.5 }}>
            Este é seu primeiro acesso. Defina uma senha pessoal para continuar.
          </p>

          {erro && (
            <div style={{ background: "#FDECEA", border: "0.5px solid #E24B4A60", borderRadius: 8, padding: "9px 12px", marginBottom: 18, fontSize: 12, color: "#8B1A1A" }}>
              {erro}
            </div>
          )}

          <form onSubmit={salvar} style={{ display: "grid", gap: 16 }}>
            <div>
              <label style={{ fontSize: 11, fontWeight: 700, color: "#555", marginBottom: 5, display: "block", letterSpacing: "0.04em" }}>
                NOVA SENHA
              </label>
              <div style={{ position: "relative" }}>
                <input
                  type={showSenha ? "text" : "password"}
                  value={novaSenha}
                  onChange={e => setNovaSenha(e.target.value)}
                  required
                  autoFocus
                  placeholder="Mínimo 8 caracteres"
                  style={{
                    width: "100%", padding: "10px 44px 10px 12px", border: "0.5px solid #D4DCE8",
                    borderRadius: 8, fontSize: 13, color: "#1a1a1a", background: "#fff",
                    boxSizing: "border-box", outline: "none",
                    borderColor: novaSenha && novaSenha.length < 8 ? "#E24B4A" : "#D4DCE8",
                  }}
                />
                <button
                  type="button"
                  onClick={() => setShowSenha(s => !s)}
                  style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: "#888", fontSize: 12 }}>
                  {showSenha ? "Ocultar" : "Ver"}
                </button>
              </div>
              {novaSenha && novaSenha.length < 8 && (
                <div style={{ fontSize: 11, color: "#E24B4A", marginTop: 4 }}>Mínimo 8 caracteres</div>
              )}
            </div>

            <div>
              <label style={{ fontSize: 11, fontWeight: 700, color: "#555", marginBottom: 5, display: "block", letterSpacing: "0.04em" }}>
                CONFIRMAR SENHA
              </label>
              <input
                type={showSenha ? "text" : "password"}
                value={confirmSenha}
                onChange={e => setConfirmSenha(e.target.value)}
                required
                placeholder="Repita a nova senha"
                style={{
                  width: "100%", padding: "10px 12px", border: "0.5px solid #D4DCE8",
                  borderRadius: 8, fontSize: 13, color: "#1a1a1a", background: "#fff",
                  boxSizing: "border-box", outline: "none",
                  borderColor: confirmSenha && confirmSenha !== novaSenha ? "#E24B4A" : "#D4DCE8",
                }}
              />
              {confirmSenha && confirmSenha !== novaSenha && (
                <div style={{ fontSize: 11, color: "#E24B4A", marginTop: 4 }}>As senhas não coincidem</div>
              )}
            </div>

            {/* Indicador de força */}
            {novaSenha && (
              <div style={{ display: "flex", gap: 5 }}>
                {[1, 2, 3, 4].map(n => {
                  const forca = novaSenha.length >= 8 ? (
                    [/[A-Z]/, /[0-9]/, /[^A-Za-z0-9]/].filter(r => r.test(novaSenha)).length + 1
                  ) : 0;
                  return (
                    <div key={n} style={{
                      flex: 1, height: 4, borderRadius: 4,
                      background: n <= forca
                        ? forca >= 4 ? "#16A34A" : forca >= 3 ? "#C9921B" : "#378ADD"
                        : "#E8ECF4",
                      transition: "background 0.2s",
                    }} />
                  );
                })}
              </div>
            )}

            <button
              type="submit"
              disabled={salvando || !senhasOk}
              style={{
                width: "100%", padding: "12px", background: "#1A5C38",
                color: "#fff", border: "none", borderRadius: 8,
                fontSize: 14, fontWeight: 700, cursor: salvando || !senhasOk ? "not-allowed" : "pointer",
                opacity: !senhasOk ? 0.45 : 1,
                marginTop: 4,
              }}>
              {salvando ? "Salvando…" : "Confirmar nova senha →"}
            </button>
          </form>
        </div>

        <div style={{ textAlign: "center", marginTop: 16, fontSize: 11, color: "#aaa" }}>
          Arato — Menos clique, mais gestão
        </div>
      </div>
    </div>
  );
}
