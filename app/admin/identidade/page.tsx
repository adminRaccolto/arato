"use client";
import { useState, useRef, useEffect, useCallback } from "react";
import { supabase } from "../../../lib/supabase";

// ── Defaults ─────────────────────────────────────────────────────────────────

const PALETA_DEFAULT = [
  { key: "azul_petroleo",  nome: "Azul petróleo",  hex: "#1A4870", desc: "Principal — NavBar, botões, bordas" },
  { key: "azul_escuro",    nome: "Azul escuro",    hex: "#0B2D50", desc: "Texto sobre fundo azul claro" },
  { key: "azul_claro",     nome: "Azul claro",     hex: "#D5E8F5", desc: "Fundo de itens ativos" },
  { key: "mostarda",       nome: "Mostarda",       hex: "#C9921B", desc: "Ação do usuário, accent" },
  { key: "mostarda_claro", nome: "Mostarda claro", hex: "#FBF3E0", desc: "Fundo de badges mostarda" },
  { key: "fundo_geral",    nome: "Fundo geral",    hex: "#F4F6FA", desc: "Background da página" },
  { key: "vermelho",       nome: "Vermelho",       hex: "#E24B4A", desc: "Erros, urgência alta" },
  { key: "verde",          nome: "Verde",          hex: "#16A34A", desc: "Colheita, positivo" },
];

const IDENTIDADE_DEFAULT = {
  nome_produto:    "Arato",
  tagline:         "Menos cliques, mais campo",
  empresa_emissora:"Raccolto Consultoria e Treinamentos LTDA",
  cnpj_emitente:   "49.578.526/0001-42",
  dominio_app:     "app.arato.agr.br",
  dominio_landing: "raccolto.com.br",
  email_suporte:   "consultor@raccolto.com.br",
  whatsapp_suporte:"(65) 98145-6825",
};

const ENV_VARS = [
  { key: "NEXT_PUBLIC_SUPABASE_URL",      desc: "URL do projeto Supabase",             obrigatorio: true },
  { key: "NEXT_PUBLIC_SUPABASE_ANON_KEY", desc: "Chave pública (anon) do Supabase",   obrigatorio: true },
  { key: "SUPABASE_SERVICE_ROLE_KEY",     desc: "Chave service role (privada)",        obrigatorio: true },
  { key: "CRON_SECRET",                   desc: "Secret para autenticar crons Vercel", obrigatorio: false },
  { key: "RESEND_API_KEY",                desc: "API Key do Resend (e-mail)",          obrigatorio: false },
  { key: "RESEND_FROM",                   desc: "Remetente padrão dos e-mails",        obrigatorio: false },
  { key: "ASAAS_API_KEY",                 desc: "API Key Asaas (pagamentos)",          obrigatorio: false },
  { key: "ASAAS_ENV",                     desc: "sandbox | production",                obrigatorio: false },
  { key: "ASAAS_WEBHOOK_TOKEN",           desc: "Token webhook Asaas",                 obrigatorio: false },
  { key: "RACCOLTO_PUBLIC_API_KEY",       desc: "Key para integração site Raccolto",   obrigatorio: false },
  { key: "NEXT_PUBLIC_APP_URL",           desc: "URL pública do Arato",               obrigatorio: false },
  { key: "ADMIN_SECRET_KEY",              desc: "Key para criar clientes via admin",   obrigatorio: false },
  { key: "OPENAI_API_KEY",               desc: "OpenAI — Whisper / GPT",              obrigatorio: false },
  { key: "ANTHROPIC_API_KEY",            desc: "Claude — Agente WhatsApp",            obrigatorio: false },
];

const MODULO = "identidade";

// ─────────────────────────────────────────────────────────────────────────────

export default function IdentidadePage() {
  // Logo
  const [logoUrl,    setLogoUrl]    = useState<string | null>(null);
  const [uploading,  setUploading]  = useState(false);
  const [uploadMsg,  setUploadMsg]  = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Paleta
  const [paleta,        setPaleta]        = useState(PALETA_DEFAULT.map(c => ({ ...c })));
  const [paletaEditIdx, setPaletaEditIdx] = useState<number | null>(null);
  const [paletaSaving,  setPaletaSaving]  = useState(false);
  const [paletaSaved,   setPaletaSaved]   = useState(false);

  // Identidade
  const [identidade,      setIdentidade]      = useState({ ...IDENTIDADE_DEFAULT });
  const [identidadeEdit,  setIdentidadeEdit]  = useState(false);
  const [identidadeSaving,setIdentidadeSaving]= useState(false);
  const [identidadeSaved, setIdentidadeSaved] = useState(false);

  // Carrega configurações salvas do Supabase
  const carregar = useCallback(async () => {
    const { data } = await supabase
      .from("configuracoes_modulo")
      .select("valor")
      .eq("modulo", MODULO)
      .maybeSingle();

    if (data?.valor) {
      const v = data.valor as Record<string, unknown>;
      if (v.paleta) setPaleta(v.paleta as typeof PALETA_DEFAULT);
      if (v.identidade) setIdentidade(v.identidade as typeof IDENTIDADE_DEFAULT);
      if (v.logo_url) setLogoUrl(v.logo_url as string);
    }
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  async function salvarConfig(patch: Record<string, unknown>) {
    // Lê config atual para fazer merge
    const { data: atual } = await supabase
      .from("configuracoes_modulo")
      .select("valor")
      .eq("modulo", MODULO)
      .maybeSingle();

    const valorAtual = (atual?.valor ?? {}) as Record<string, unknown>;
    const novoValor  = { ...valorAtual, ...patch };

    await supabase.from("configuracoes_modulo").upsert(
      { modulo: MODULO, fazenda_id: null, valor: novoValor },
      { onConflict: "modulo,fazenda_id" }
    );
  }

  // ── Logo ──────────────────────────────────────────────────────────────────
  async function uploadLogo(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setUploadMsg(null);
    try {
      const ext  = file.name.split(".").pop() ?? "png";
      const path = `logos/arato-logo.${ext}`;
      const { error } = await supabase.storage.from("logos").upload(path, file, { upsert: true });
      if (error) throw error;
      const { data } = supabase.storage.from("logos").getPublicUrl(path);
      setLogoUrl(data.publicUrl);
      await salvarConfig({ logo_url: data.publicUrl });
      setUploadMsg("Logo enviada! Recarregue o app para ver no TopNav.");
    } catch (err: unknown) {
      setUploadMsg(`Erro: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setUploading(false);
    }
  }

  // ── Paleta ────────────────────────────────────────────────────────────────
  function editarCor(idx: number) { setPaletaEditIdx(idx); }

  function alterarHex(idx: number, hex: string) {
    setPaleta(prev => prev.map((c, i) => i === idx ? { ...c, hex } : c));
  }

  async function salvarPaleta() {
    setPaletaSaving(true);
    await salvarConfig({ paleta });
    setPaletaSaving(false);
    setPaletaSaved(true);
    setPaletaEditIdx(null);
    setTimeout(() => setPaletaSaved(false), 2500);
  }

  function cancelarPaleta() {
    carregar(); // recarrega do banco
    setPaletaEditIdx(null);
  }

  // ── Identidade ────────────────────────────────────────────────────────────
  async function salvarIdentidade() {
    setIdentidadeSaving(true);
    await salvarConfig({ identidade });
    setIdentidadeSaving(false);
    setIdentidadeSaved(true);
    setIdentidadeEdit(false);
    setTimeout(() => setIdentidadeSaved(false), 2500);
  }

  const CAMPOS_IDENTIDADE: { key: keyof typeof IDENTIDADE_DEFAULT; label: string; tipo?: string }[] = [
    { key: "nome_produto",    label: "Nome do produto" },
    { key: "tagline",         label: "Tagline" },
    { key: "empresa_emissora",label: "Empresa emissora" },
    { key: "cnpj_emitente",  label: "CNPJ emitente" },
    { key: "dominio_app",    label: "Domínio do app" },
    { key: "dominio_landing",label: "Domínio landing" },
    { key: "email_suporte",  label: "E-mail suporte", tipo: "email" },
    { key: "whatsapp_suporte",label: "WhatsApp suporte", tipo: "tel" },
  ];

  const paletaAlterada = paletaEditIdx !== null;

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div>
      {/* Header */}
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: "#0B2D50", margin: 0 }}>Identidade Arato</h1>
        <p style={{ fontSize: 13, color: "#666", margin: "6px 0 0" }}>
          Configurações visuais e de infraestrutura do produto. Alterações são salvas no Supabase.
        </p>
      </div>

      {/* ── Logo ── */}
      <div style={{
        background: "#fff", borderRadius: 12,
        border: "0.5px solid #DDE2EE",
        padding: "24px 28px", marginBottom: 20,
      }}>
        <h2 style={{ fontSize: 15, fontWeight: 700, color: "#0B2D50", margin: "0 0 16px" }}>Logo do Produto</h2>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 24 }}>
          <div style={{
            width: 200, height: 80, border: "0.5px dashed #DDE2EE",
            borderRadius: 10, background: "#F8FAFC",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            {logoUrl
              ? <img src={logoUrl} alt="Logo" style={{ maxHeight: 62, maxWidth: 180, objectFit: "contain" }} />
              : <span style={{ fontSize: 12, color: "#888" }}>Prévia da logo</span>
            }
          </div>
          <div>
            <div style={{ fontSize: 13, color: "#555", marginBottom: 12, lineHeight: 1.5 }}>
              A logo é exibida no TopNav e na tela de login.<br />
              Formatos aceitos: PNG, SVG, WebP. Tamanho ideal: 280×80px.
            </div>
            <input ref={fileRef} type="file" accept="image/*" style={{ display: "none" }} onChange={uploadLogo} />
            <button
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              style={{
                padding: "8px 20px", borderRadius: 8,
                border: "0.5px solid #1A4870", background: "#fff",
                fontSize: 13, cursor: "pointer", color: "#1A4870", fontWeight: 600,
              }}
            >
              {uploading ? "Enviando…" : "Fazer upload"}
            </button>
            {uploadMsg && (
              <div style={{
                marginTop: 10, padding: "8px 12px",
                background: uploadMsg.startsWith("Erro") ? "#FEF2F2" : "#F0FDF4",
                borderRadius: 8, fontSize: 12,
                color: uploadMsg.startsWith("Erro") ? "#E24B4A" : "#15803D",
              }}>
                {uploadMsg}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Paleta de Cores ── */}
      <div style={{
        background: "#fff", borderRadius: 12,
        border: "0.5px solid #DDE2EE",
        padding: "24px 28px", marginBottom: 20,
      }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
          <h2 style={{ fontSize: 15, fontWeight: 700, color: "#0B2D50", margin: 0 }}>Paleta de Cores</h2>
          <div style={{ display: "flex", gap: 8 }}>
            {paletaAlterada && (
              <button
                onClick={cancelarPaleta}
                style={{
                  padding: "7px 14px", borderRadius: 8,
                  border: "0.5px solid #DDE2EE", background: "#fff",
                  fontSize: 12, cursor: "pointer", color: "#555",
                }}
              >
                Cancelar
              </button>
            )}
            <button
              onClick={paletaAlterada ? salvarPaleta : undefined}
              disabled={!paletaAlterada || paletaSaving}
              style={{
                padding: "7px 16px", borderRadius: 8, fontSize: 12, fontWeight: 600,
                border: "none", cursor: paletaAlterada ? "pointer" : "default",
                background: paletaAlterada ? "#1A4870" : "#F0F2F7",
                color: paletaAlterada ? "#fff" : "#999",
                transition: "all 0.15s",
              }}
            >
              {paletaSaving ? "Salvando…" : paletaSaved ? "✓ Salvo" : "Salvar cores"}
            </button>
          </div>
        </div>
        <p style={{ fontSize: 12, color: "#888", margin: "0 0 16px" }}>
          Clique em qualquer cor para editar o valor hexadecimal. As cores afetam o design system do app.
        </p>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
          {paleta.map((cor, idx) => {
            const editando = paletaEditIdx === idx;
            return (
              <div
                key={cor.key}
                onClick={() => !editando && editarCor(idx)}
                style={{
                  border: editando ? "1.5px solid #1A4870" : "0.5px solid #DDE2EE",
                  borderRadius: 10, overflow: "hidden",
                  cursor: editando ? "default" : "pointer",
                  transition: "border 0.15s",
                  boxShadow: editando ? "0 0 0 3px #1A487020" : "none",
                }}
              >
                {/* Swatch — clicável para abrir color picker nativo */}
                <div style={{ position: "relative", height: 52 }}>
                  <div style={{ height: 52, background: cor.hex, transition: "background 0.2s" }} />
                  {editando && (
                    <input
                      type="color"
                      value={cor.hex}
                      onChange={e => alterarHex(idx, e.target.value)}
                      onClick={e => e.stopPropagation()}
                      style={{
                        position: "absolute", inset: 0, width: "100%", height: "100%",
                        opacity: 0, cursor: "pointer",
                      }}
                      title="Clique para abrir o seletor de cor"
                    />
                  )}
                  {!editando && (
                    <div style={{
                      position: "absolute", top: 6, right: 6,
                      background: "rgba(255,255,255,0.85)", borderRadius: 4,
                      padding: "2px 6px", fontSize: 10, color: "#555",
                    }}>
                      ✎
                    </div>
                  )}
                </div>

                <div style={{ padding: "10px 12px" }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: "#1a1a1a" }}>{cor.nome}</div>

                  {editando ? (
                    <input
                      type="text"
                      value={cor.hex}
                      onChange={e => alterarHex(idx, e.target.value)}
                      onClick={e => e.stopPropagation()}
                      maxLength={7}
                      style={{
                        width: "100%", marginTop: 4,
                        fontSize: 12, fontFamily: "monospace",
                        border: "0.5px solid #1A4870", borderRadius: 5,
                        padding: "3px 7px", color: "#1A4870", fontWeight: 700,
                        background: "#F4F8FF",
                      }}
                    />
                  ) : (
                    <div style={{ fontSize: 11, color: "#888", fontFamily: "monospace", marginTop: 2 }}>
                      {cor.hex}
                    </div>
                  )}

                  <div style={{ fontSize: 11, color: "#666", marginTop: 4, lineHeight: 1.4 }}>{cor.desc}</div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Identificação do Produto ── */}
      <div style={{
        background: "#fff", borderRadius: 12,
        border: "0.5px solid #DDE2EE",
        padding: "24px 28px", marginBottom: 20,
      }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
          <h2 style={{ fontSize: 15, fontWeight: 700, color: "#0B2D50", margin: 0 }}>
            Identificação do Produto
            {identidadeSaved && (
              <span style={{ fontSize: 12, color: "#16A34A", fontWeight: 600, marginLeft: 10 }}>✓ Salvo</span>
            )}
          </h2>
          <div style={{ display: "flex", gap: 8 }}>
            {identidadeEdit ? (
              <>
                <button
                  onClick={() => { setIdentidadeEdit(false); carregar(); }}
                  style={{
                    padding: "7px 14px", borderRadius: 8,
                    border: "0.5px solid #DDE2EE", background: "#fff",
                    fontSize: 12, cursor: "pointer", color: "#555",
                  }}
                >
                  Cancelar
                </button>
                <button
                  onClick={salvarIdentidade}
                  disabled={identidadeSaving}
                  style={{
                    padding: "7px 18px", borderRadius: 8, fontSize: 12, fontWeight: 700,
                    border: "none", cursor: "pointer",
                    background: "#1A4870", color: "#fff",
                  }}
                >
                  {identidadeSaving ? "Salvando…" : "Salvar"}
                </button>
              </>
            ) : (
              <button
                onClick={() => setIdentidadeEdit(true)}
                style={{
                  padding: "7px 16px", borderRadius: 8,
                  border: "0.5px solid #1A4870", background: "#fff",
                  fontSize: 12, cursor: "pointer", color: "#1A4870", fontWeight: 600,
                }}
              >
                ✎ Editar
              </button>
            )}
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
          {CAMPOS_IDENTIDADE.map(({ key, label, tipo }) => (
            <div key={key} style={{
              background: identidadeEdit ? "#fff" : "#F8FAFC",
              borderRadius: 8,
              border: identidadeEdit ? "1px solid #1A487040" : "0.5px solid #DDE2EE",
              padding: "12px 16px",
              transition: "all 0.15s",
            }}>
              <div style={{
                fontSize: 11, fontWeight: 700, color: identidadeEdit ? "#1A4870" : "#888",
                textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 6,
              }}>
                {label}
              </div>
              {identidadeEdit ? (
                <input
                  type={tipo ?? "text"}
                  value={identidade[key]}
                  onChange={e => setIdentidade(prev => ({ ...prev, [key]: e.target.value }))}
                  style={{
                    width: "100%", fontSize: 13, color: "#1a1a1a",
                    border: "none", outline: "none", background: "transparent",
                    fontWeight: 600, padding: 0,
                  }}
                />
              ) : (
                <div style={{ fontSize: 13, color: "#1a1a1a", fontWeight: 600 }}>
                  {identidade[key]}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* ── Variáveis de Ambiente ── */}
      <div style={{
        background: "#fff", borderRadius: 12,
        border: "0.5px solid #DDE2EE",
        padding: "24px 28px", marginBottom: 20,
      }}>
        <h2 style={{ fontSize: 15, fontWeight: 700, color: "#0B2D50", margin: "0 0 4px" }}>Variáveis de Ambiente</h2>
        <p style={{ fontSize: 12, color: "#888", margin: "0 0 16px" }}>
          Configure em <strong>Vercel → Settings → Environment Variables</strong>. Obrigatórias bloqueiam o funcionamento se ausentes.
        </p>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ background: "#F8FAFC" }}>
              <th style={{ padding: "8px 12px", textAlign: "left", fontSize: 11, fontWeight: 700, color: "#555", borderBottom: "0.5px solid #DDE2EE" }}>Variável</th>
              <th style={{ padding: "8px 12px", textAlign: "left", fontSize: 11, fontWeight: 700, color: "#555", borderBottom: "0.5px solid #DDE2EE" }}>Descrição</th>
              <th style={{ padding: "8px 12px", textAlign: "center", fontSize: 11, fontWeight: 700, color: "#555", borderBottom: "0.5px solid #DDE2EE", width: 110 }}>Status</th>
            </tr>
          </thead>
          <tbody>
            {ENV_VARS.map((v, i) => (
              <tr key={v.key} style={{ background: i % 2 === 0 ? "#fff" : "#FAFBFD" }}>
                <td style={{ padding: "10px 12px", fontFamily: "monospace", fontSize: 12, color: "#1A4870", borderBottom: "0.5px solid #F0F2F7" }}>
                  {v.key}
                </td>
                <td style={{ padding: "10px 12px", fontSize: 12, color: "#555", borderBottom: "0.5px solid #F0F2F7" }}>
                  {v.desc}
                </td>
                <td style={{ padding: "10px 12px", textAlign: "center", borderBottom: "0.5px solid #F0F2F7" }}>
                  <span style={{
                    display: "inline-block", fontSize: 10, fontWeight: 700,
                    padding: "2px 8px", borderRadius: 20,
                    background: v.obrigatorio ? "#FEF2F2" : "#F4F6FA",
                    color: v.obrigatorio ? "#E24B4A" : "#888",
                  }}>
                    {v.obrigatorio ? "Obrigatório" : "Opcional"}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ── Links úteis ── */}
      <div style={{ background: "#0B1E35", borderRadius: 12, padding: "20px 24px" }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: "rgba(255,255,255,0.5)", marginBottom: 14, textTransform: "uppercase", letterSpacing: 1 }}>
          Links Úteis
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
          {[
            { label: "Vercel Dashboard",  url: "https://vercel.com/dashboard" },
            { label: "Supabase Studio",   url: "https://supabase.com/dashboard" },
            { label: "Asaas Sandbox",     url: "https://sandbox.asaas.com" },
            { label: "Resend Dashboard",  url: "https://resend.com/dashboard" },
            { label: "Documentação ACBr", url: "https://www.projetoacbr.com.br" },
            { label: "Suporte Técnico",   url: "mailto:consultor@raccolto.com.br" },
          ].map(({ label, url }) => (
            <a key={url} href={url} target="_blank" rel="noopener noreferrer" style={{
              display: "block", padding: "10px 14px",
              background: "rgba(255,255,255,0.07)",
              border: "0.5px solid rgba(255,255,255,0.1)",
              borderRadius: 8, textDecoration: "none",
              fontSize: 12, color: "rgba(255,255,255,0.7)", fontWeight: 500,
            }}>
              {label} ↗
            </a>
          ))}
        </div>
      </div>
    </div>
  );
}
