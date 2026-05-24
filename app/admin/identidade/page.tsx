"use client";
import { useState, useRef } from "react";
import { supabase } from "../../../lib/supabase";

// ── Configurações de identidade visual do Arato ──────────────────────────────
// Aqui o admin Raccolto pode trocar logo, nome do produto, cores, etc.

const PALETA = [
  { nome: "Azul petróleo",  hex: "#1A4870", desc: "Principal — NavBar, botões, bordas" },
  { nome: "Azul escuro",    hex: "#0B2D50", desc: "Texto sobre fundo azul claro" },
  { nome: "Azul claro",     hex: "#D5E8F5", desc: "Fundo de itens ativos" },
  { nome: "Mostarda",       hex: "#C9921B", desc: "Ação do usuário, accent" },
  { nome: "Mostarda claro", hex: "#FBF3E0", desc: "Fundo de badges mostarda" },
  { nome: "Fundo geral",    hex: "#F4F6FA", desc: "Background da página" },
  { nome: "Vermelho",       hex: "#E24B4A", desc: "Erros, urgência alta" },
  { nome: "Verde",          hex: "#16A34A", desc: "Colheita, positivo" },
];

const ENV_VARS = [
  { key: "NEXT_PUBLIC_SUPABASE_URL",     desc: "URL do projeto Supabase",             obrigatorio: true },
  { key: "NEXT_PUBLIC_SUPABASE_ANON_KEY",desc: "Chave pública (anon) do Supabase",   obrigatorio: true },
  { key: "SUPABASE_SERVICE_ROLE_KEY",    desc: "Chave service role (privada)",        obrigatorio: true },
  { key: "CRON_SECRET",                  desc: "Secret para autenticar crons Vercel", obrigatorio: false },
  { key: "RESEND_API_KEY",               desc: "API Key do Resend (e-mail)",          obrigatorio: false },
  { key: "RESEND_FROM",                  desc: "Remetente padrão dos e-mails",        obrigatorio: false },
  { key: "ASAAS_API_KEY",               desc: "API Key Asaas (pagamentos)",          obrigatorio: false },
  { key: "ASAAS_ENV",                   desc: "sandbox | production",                obrigatorio: false },
  { key: "ASAAS_WEBHOOK_TOKEN",         desc: "Token webhook Asaas",                 obrigatorio: false },
  { key: "RACCOLTO_PUBLIC_API_KEY",     desc: "Key para integração site Raccolto",   obrigatorio: false },
  { key: "NEXT_PUBLIC_APP_URL",         desc: "URL pública do Arato",               obrigatorio: false },
  { key: "ADMIN_SECRET_KEY",            desc: "Key para criar clientes via admin",   obrigatorio: false },
  { key: "OPENAI_API_KEY",              desc: "OpenAI — Whisper / GPT",              obrigatorio: false },
  { key: "ANTHROPIC_API_KEY",           desc: "Claude — Agente WhatsApp",            obrigatorio: false },
];

export default function IdentidadePage() {
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadMsg, setUploadMsg] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function uploadLogo(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setUploadMsg(null);
    try {
      const ext = file.name.split(".").pop() ?? "png";
      const path = `logos/arato-logo.${ext}`;
      const { error } = await supabase.storage.from("logos").upload(path, file, { upsert: true });
      if (error) throw error;
      const { data } = supabase.storage.from("logos").getPublicUrl(path);
      setLogoUrl(data.publicUrl);
      setUploadMsg("Logo enviada com sucesso! Recarregue a página para ver a atualização no TopNav.");
    } catch (err: unknown) {
      setUploadMsg(`Erro: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setUploading(false);
    }
  }

  return (
    <div>
      {/* Header */}
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: "#0B2D50", margin: 0 }}>Identidade Arato</h1>
        <p style={{ fontSize: 13, color: "#666", margin: "6px 0 0" }}>
          Configurações visuais e de infraestrutura do produto.
        </p>
      </div>

      {/* Logo */}
      <div style={{
        background: "#fff", borderRadius: 12,
        border: "0.5px solid #DDE2EE",
        padding: "24px 28px", marginBottom: 20,
      }}>
        <h2 style={{ fontSize: 15, fontWeight: 700, color: "#0B2D50", margin: "0 0 16px" }}>Logo do Produto</h2>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 24 }}>
          <div style={{
            width: 180, height: 72, border: "0.5px dashed #DDE2EE",
            borderRadius: 10, background: "#F8FAFC",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            {logoUrl
              ? <img src={logoUrl} alt="Logo" style={{ maxHeight: 56, maxWidth: 160, objectFit: "contain" }} />
              : <span style={{ fontSize: 12, color: "#888" }}>Prévia</span>
            }
          </div>

          <div>
            <div style={{ fontSize: 13, color: "#555", marginBottom: 12 }}>
              A logo é exibida no TopNav e na tela de login.
              Formatos aceitos: PNG, SVG, WebP. Tamanho ideal: 280×80px.
            </div>
            <input
              ref={fileRef} type="file" accept="image/*"
              style={{ display: "none" }}
              onChange={uploadLogo}
            />
            <button
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              style={{
                padding: "8px 20px", borderRadius: 8,
                border: "0.5px solid #DDE2EE", background: "#fff",
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

      {/* Paleta de cores */}
      <div style={{
        background: "#fff", borderRadius: 12,
        border: "0.5px solid #DDE2EE",
        padding: "24px 28px", marginBottom: 20,
      }}>
        <h2 style={{ fontSize: 15, fontWeight: 700, color: "#0B2D50", margin: "0 0 16px" }}>Paleta de Cores</h2>
        <p style={{ fontSize: 12, color: "#888", margin: "0 0 16px" }}>
          Cores definidas no design system. Alterações exigem edição do código-fonte (globals.css / inline styles).
        </p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
          {PALETA.map(cor => (
            <div key={cor.hex} style={{
              border: "0.5px solid #DDE2EE",
              borderRadius: 10, overflow: "hidden",
            }}>
              <div style={{ height: 48, background: cor.hex }} />
              <div style={{ padding: "10px 12px" }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: "#1a1a1a" }}>{cor.nome}</div>
                <div style={{ fontSize: 11, color: "#888", fontFamily: "monospace" }}>{cor.hex}</div>
                <div style={{ fontSize: 11, color: "#666", marginTop: 3, lineHeight: 1.4 }}>{cor.desc}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Informações do produto */}
      <div style={{
        background: "#fff", borderRadius: 12,
        border: "0.5px solid #DDE2EE",
        padding: "24px 28px", marginBottom: 20,
      }}>
        <h2 style={{ fontSize: 15, fontWeight: 700, color: "#0B2D50", margin: "0 0 16px" }}>Identificação do Produto</h2>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          {[
            { label: "Nome do produto",    value: "Arato" },
            { label: "Tagline",            value: "Menos cliques, mais campo" },
            { label: "Empresa emissora",   value: "Raccolto Consultoria e Treinamentos LTDA" },
            { label: "CNPJ emitente",      value: "49.578.526/0001-42" },
            { label: "Domínio do app",     value: "app.arato.agr.br" },
            { label: "Domínio landing",    value: "raccolto.com.br" },
            { label: "E-mail suporte",     value: "consultor@raccolto.com.br" },
            { label: "WhatsApp suporte",   value: "(65) 98145-6825" },
          ].map(({ label, value }) => (
            <div key={label} style={{
              background: "#F8FAFC", borderRadius: 8,
              border: "0.5px solid #DDE2EE",
              padding: "12px 16px",
            }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#888", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 4 }}>
                {label}
              </div>
              <div style={{ fontSize: 13, color: "#1a1a1a", fontWeight: 600 }}>{value}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Variáveis de ambiente */}
      <div style={{
        background: "#fff", borderRadius: 12,
        border: "0.5px solid #DDE2EE",
        padding: "24px 28px", marginBottom: 20,
      }}>
        <h2 style={{ fontSize: 15, fontWeight: 700, color: "#0B2D50", margin: "0 0 4px" }}>Variáveis de Ambiente</h2>
        <p style={{ fontSize: 12, color: "#888", margin: "0 0 16px" }}>
          Configure em Vercel → Settings → Environment Variables. Variáveis marcadas como obrigatórias são essenciais para o funcionamento.
        </p>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ background: "#F8FAFC" }}>
              <th style={{ padding: "8px 12px", textAlign: "left", fontSize: 11, fontWeight: 700, color: "#555", borderBottom: "0.5px solid #DDE2EE" }}>Variável</th>
              <th style={{ padding: "8px 12px", textAlign: "left", fontSize: 11, fontWeight: 700, color: "#555", borderBottom: "0.5px solid #DDE2EE" }}>Descrição</th>
              <th style={{ padding: "8px 12px", textAlign: "center", fontSize: 11, fontWeight: 700, color: "#555", borderBottom: "0.5px solid #DDE2EE", width: 100 }}>Status</th>
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

      {/* Links úteis */}
      <div style={{
        background: "#0B1E35", borderRadius: 12,
        padding: "20px 24px",
      }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: "rgba(255,255,255,0.5)", marginBottom: 14, textTransform: "uppercase", letterSpacing: 1 }}>
          Links Úteis
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
          {[
            { label: "Vercel Dashboard",       url: "https://vercel.com/dashboard" },
            { label: "Supabase Studio",        url: "https://supabase.com/dashboard" },
            { label: "Asaas Sandbox",          url: "https://sandbox.asaas.com" },
            { label: "Resend Dashboard",       url: "https://resend.com/dashboard" },
            { label: "Documentação ACBr",      url: "https://www.projetoacbr.com.br" },
            { label: "Suporte Técnico",        url: "mailto:consultor@raccolto.com.br" },
          ].map(({ label, url }) => (
            <a
              key={url}
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: "block", padding: "10px 14px",
                background: "rgba(255,255,255,0.07)",
                border: "0.5px solid rgba(255,255,255,0.1)",
                borderRadius: 8, textDecoration: "none",
                fontSize: 12, color: "rgba(255,255,255,0.7)",
                fontWeight: 500,
              }}
            >
              {label} ↗
            </a>
          ))}
        </div>
      </div>
    </div>
  );
}
