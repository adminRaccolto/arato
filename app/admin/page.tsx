"use client";
import { useState, useEffect, useRef } from "react";
import TopNav from "../../components/TopNav";
import { useAuth } from "../../components/AuthProvider";

// ─────────────────────────────────────────────────────────────────────────────
// Painel Administrativo — Arato (sistema)
// Esta página NÃO aparece na navegação do cliente.
// Acessível apenas pelo dono/administrador do sistema.
// ─────────────────────────────────────────────────────────────────────────────

function carregarImagem(file: File, onLoad: (b64: string) => void) {
  const reader = new FileReader();
  reader.onload = e => {
    if (!e.target?.result) return;
    const img = new Image();
    img.onload = () => {
      const MAX = 200;
      const ratio = Math.min(MAX / img.width, MAX / img.height, 1);
      const canvas = document.createElement("canvas");
      canvas.width  = Math.round(img.width  * ratio);
      canvas.height = Math.round(img.height * ratio);
      canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
      onLoad(canvas.toDataURL("image/png", 0.85));
    };
    img.src = e.target.result as string;
  };
  reader.readAsDataURL(file);
}

const inputStyle: React.CSSProperties = {
  width: "100%", padding: "8px 10px", border: "0.5px solid #D4DCE8",
  borderRadius: 8, fontSize: 13, color: "#1a1a1a", background: "#fff",
  boxSizing: "border-box", outline: "none",
};
const labelStyle: React.CSSProperties = {
  fontSize: 11, color: "#555", marginBottom: 4, display: "block",
};

export default function Admin() {
  const { fazendaId } = useAuth();

  const [logoArato,    setLogoArato]    = useState<string | null>(null);
  const [nomeArato,    setNomeArato]    = useState("Arato");
  const [taglineArato, setTaglineArato] = useState("Gestão Agrícola");
  const [logoFazenda,  setLogoFazenda]  = useState<string | null>(null);
  const inputArato   = useRef<HTMLInputElement>(null);
  const inputFazenda = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const lr = localStorage.getItem("arato_logo");
    const nr = localStorage.getItem("arato_nome");
    const tr = localStorage.getItem("arato_tagline");
    if (lr) setLogoArato(lr);
    if (nr) setNomeArato(nr);
    if (tr) setTaglineArato(tr);
  }, []);

  useEffect(() => {
    if (!fazendaId) return;
    const lf = localStorage.getItem(`fazenda_logo_${fazendaId}`);
    if (lf) setLogoFazenda(lf);
  }, [fazendaId]);

  function salvarArato() {
    try {
      localStorage.setItem("arato_nome", nomeArato);
      localStorage.setItem("arato_tagline", taglineArato);
      if (logoArato) localStorage.setItem("arato_logo", logoArato);
      alert("Identidade salva. Recarregue para ver no cabeçalho.");
    } catch {
      alert("Erro ao salvar: imagem muito grande. Tente uma imagem menor.");
    }
  }

  function salvarFazenda() {
    if (!fazendaId) return;
    try {
      if (logoFazenda) localStorage.setItem(`fazenda_logo_${fazendaId}`, logoFazenda);
      alert("Logo da fazenda salvo. Recarregue para ver no cabeçalho.");
    } catch {
      alert("Erro ao salvar: imagem muito grande. Tente uma imagem menor.");
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh", background: "#F3F6F9", fontFamily: "system-ui, sans-serif", fontSize: 13 }}>
      <TopNav />
      <main style={{ flex: 1, padding: "20px 24px" }}>

        {/* Header */}
        <header style={{ background: "#fff", borderRadius: 12, border: "0.5px solid #D4DCE8", padding: "14px 22px", marginBottom: 20, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ width: 32, height: 32, borderRadius: 8, background: "#1A5C38", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <span style={{ color: "#fff", fontSize: 14 }}>⚙</span>
              </div>
              <div>
                <h1 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: "#1a1a1a" }}>Painel Administrativo</h1>
                <p style={{ margin: 0, fontSize: 11, color: "#555" }}>Configurações do sistema Arato — não visível para clientes</p>
              </div>
            </div>
          </div>
          <div style={{ background: "#FBF3E0", border: "0.5px solid #C9921B50", borderRadius: 8, padding: "6px 14px", fontSize: 11, color: "#7A5A12", fontWeight: 600 }}>
            ◈ Área restrita — somente administrador Arato
          </div>
        </header>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>

          {/* ── Identidade Arato ── */}
          <div style={{ background: "#fff", borderRadius: 12, border: "0.5px solid #D4DCE8", padding: "22px 24px" }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: "#1a1a1a", marginBottom: 4 }}>Identidade Arato</div>
            <div style={{ fontSize: 12, color: "#555", marginBottom: 20 }}>
              Sua marca aparece no cabeçalho de todos os clientes. Configure logo, nome e tagline.
            </div>

            {/* Preview */}
            <div style={{ marginBottom: 16 }}>
              <label style={labelStyle}>Preview do cabeçalho</label>
              <div style={{
                height: 80, borderRadius: 10, border: "0.5px dashed #D4DCE8",
                background: "#F3F6F9", display: "flex", alignItems: "center",
                justifyContent: "center", gap: 12,
              }}>
                {logoArato ? (
                  <img src={logoArato} alt="Logo Arato" style={{ maxHeight: 56, maxWidth: 200, objectFit: "contain" }} />
                ) : (
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <div style={{ width: 36, height: 36, background: "#1A5C38", borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <span style={{ color: "#fff", fontWeight: 800, fontSize: 13 }}>A</span>
                    </div>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: "#1a1a1a" }}>{nomeArato}</div>
                      <div style={{ fontSize: 10, color: "#666" }}>{taglineArato}</div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Upload */}
            <div style={{ marginBottom: 14 }}>
              <label style={labelStyle}>Logo (PNG/SVG, fundo transparente)</label>
              <div style={{ display: "flex", gap: 8 }}>
                <input ref={inputArato} type="file" accept="image/png,image/svg+xml,image/jpeg"
                  style={{ display: "none" }}
                  onChange={e => { const f = e.target.files?.[0]; if (f) carregarImagem(f, setLogoArato); }} />
                <button onClick={() => inputArato.current?.click()}
                  style={{ padding: "7px 14px", border: "0.5px solid #D4DCE8", borderRadius: 8, background: "#fff", cursor: "pointer", fontSize: 12, color: "#555" }}>
                  Escolher arquivo
                </button>
                {logoArato && (
                  <button onClick={() => { setLogoArato(null); localStorage.removeItem("arato_logo"); }}
                    style={{ padding: "7px 14px", border: "0.5px solid #E24B4A50", borderRadius: 8, background: "#FCEBEB", cursor: "pointer", fontSize: 12, color: "#791F1F" }}>
                    Remover
                  </button>
                )}
              </div>
            </div>

            {/* Nome e tagline */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 20 }}>
              <div>
                <label style={labelStyle}>Nome da empresa</label>
                <input style={inputStyle} value={nomeArato} onChange={e => setNomeArato(e.target.value)} />
              </div>
              <div>
                <label style={labelStyle}>Tagline</label>
                <input style={inputStyle} value={taglineArato} onChange={e => setTaglineArato(e.target.value)} />
              </div>
            </div>

            <button onClick={salvarArato}
              style={{ padding: "9px 22px", background: "#1A5C38", color: "#fff", border: "none", borderRadius: 8, fontWeight: 600, cursor: "pointer", fontSize: 13 }}>
              Salvar identidade Arato
            </button>
          </div>

          {/* ── Logo do cliente ── */}
          <div style={{ background: "#fff", borderRadius: 12, border: "0.5px solid #D4DCE8", padding: "22px 24px" }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: "#1a1a1a", marginBottom: 4 }}>Logo do Cliente Ativo</div>
            <div style={{ fontSize: 12, color: "#555", marginBottom: 20 }}>
              Logo da fazenda aparece no cabeçalho do cliente logado. Configure para cada cliente no primeiro acesso.
            </div>

            {/* Preview */}
            <div style={{ marginBottom: 16 }}>
              <label style={labelStyle}>Preview</label>
              <div style={{
                height: 80, borderRadius: 10, border: "0.5px dashed #D4DCE8",
                background: "#F3F6F9", display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                {logoFazenda ? (
                  <img src={logoFazenda} alt="Logo fazenda" style={{ maxHeight: 56, maxWidth: 200, objectFit: "contain" }} />
                ) : (
                  <div style={{ textAlign: "center" }}>
                    <div style={{ fontSize: 28, color: "#D4DCE8", marginBottom: 4 }}>▣</div>
                    <div style={{ fontSize: 11, color: "#888" }}>Sem logo — exibe iniciais da fazenda</div>
                  </div>
                )}
              </div>
            </div>

            {/* Upload */}
            <div style={{ marginBottom: 20 }}>
              <label style={labelStyle}>Logo (PNG/SVG, fundo transparente)</label>
              <div style={{ display: "flex", gap: 8 }}>
                <input ref={inputFazenda} type="file" accept="image/png,image/svg+xml,image/jpeg"
                  style={{ display: "none" }}
                  onChange={e => { const f = e.target.files?.[0]; if (f) carregarImagem(f, setLogoFazenda); }} />
                <button onClick={() => inputFazenda.current?.click()}
                  style={{ padding: "7px 14px", border: "0.5px solid #D4DCE8", borderRadius: 8, background: "#fff", cursor: "pointer", fontSize: 12, color: "#555" }}>
                  Escolher arquivo
                </button>
                {logoFazenda && (
                  <button onClick={() => { setLogoFazenda(null); if (fazendaId) localStorage.removeItem(`fazenda_logo_${fazendaId}`); }}
                    style={{ padding: "7px 14px", border: "0.5px solid #E24B4A50", borderRadius: 8, background: "#FCEBEB", cursor: "pointer", fontSize: 12, color: "#791F1F" }}>
                    Remover
                  </button>
                )}
              </div>
            </div>

            <button onClick={salvarFazenda}
              style={{ padding: "9px 22px", background: "#1A5C38", color: "#fff", border: "none", borderRadius: 8, fontWeight: 600, cursor: "pointer", fontSize: 13 }}>
              Salvar logo da fazenda
            </button>

            <div style={{ marginTop: 16, padding: "10px 14px", background: "#F3F6F9", borderRadius: 8, border: "0.5px solid #D4DCE8", fontSize: 11, color: "#666", lineHeight: 1.6 }}>
              Os logos são armazenados localmente no navegador. Para cada cliente, configure no primeiro acesso neste dispositivo.
            </div>
          </div>

        </div>

        <p style={{ textAlign: "center", fontSize: 11, color: "#aaa", marginTop: 32 }}>
          Arato · Painel Administrativo · <a href="/configuracoes" style={{ color: "#1A5C38", textDecoration: "none" }}>← Voltar para Configurações do cliente</a>
        </p>
      </main>
    </div>
  );
}
