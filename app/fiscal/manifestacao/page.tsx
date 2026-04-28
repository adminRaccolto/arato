"use client";
import TopNav from "@/components/TopNav";

// ─── Tipos preservados para integração futura com SIEG ───────────────────────
export type TipoDoc   = "NFe" | "CTe" | "NFSe";
export type Situacao  = "pendente" | "ciencia" | "confirmado" | "desconhecido" | "nao_realizada" | "importada";

export interface NFeItem {
  id:           string;
  chave:        string;
  numero:       number;
  serie:        string;
  tipo:         TipoDoc;
  fornecedor:   string;
  cnpj_cpf:     string;
  ie:           string;
  data_emissao: string;
  valor:        number;
  nsu:          number;
  situacao:     Situacao;
}

// ─── Componente principal ─────────────────────────────────────────────────────
export default function ManifestacaoPage() {
  return (
    <div style={{ minHeight: "100vh", background: "#F4F6FA", fontFamily: "system-ui, sans-serif" }}>
      <TopNav />

      <div style={{ maxWidth: 900, margin: "0 auto", padding: "40px 16px" }}>

        {/* Cabeçalho */}
        <div style={{ marginBottom: 32 }}>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: "#1a1a1a", margin: "0 0 6px" }}>
            Manifestação do Destinatário
          </h1>
          <p style={{ margin: 0, fontSize: 13, color: "#666" }}>
            Consulta e manifestação de NF-e, CT-e e NFS-e recebidas via SEFAZ
          </p>
        </div>

        {/* Estado vazio — SIEG não configurado */}
        <div style={{
          background: "#fff",
          border: "0.5px solid #DDE2EE",
          borderRadius: 16,
          padding: "64px 40px",
          textAlign: "center",
        }}>
          <div style={{
            width: 64, height: 64,
            background: "#F4F6FA",
            border: "0.5px solid #DDE2EE",
            borderRadius: 16,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 28, margin: "0 auto 24px",
          }}>
            🔌
          </div>

          <div style={{ fontSize: 17, fontWeight: 700, color: "#1a1a1a", marginBottom: 10 }}>
            Integração com SIEG não configurada
          </div>

          <div style={{ fontSize: 13, color: "#666", maxWidth: 500, margin: "0 auto 28px", lineHeight: 1.7 }}>
            Para consultar e manifestar notas fiscais recebidas, é necessário configurar
            a integração com a API do <strong>SIEG</strong> (Sistema de Informações ao Emitente de GIA).
            Entre em contato com o suporte para configurar o token de acesso.
          </div>

          <div style={{
            display: "inline-flex", flexDirection: "column", gap: 10,
            background: "#F4F6FA", border: "0.5px solid #DDE2EE",
            borderRadius: 12, padding: "18px 28px", textAlign: "left",
            fontSize: 13, color: "#444",
          }}>
            <div style={{ fontWeight: 700, color: "#1a1a1a", marginBottom: 4 }}>
              O que esta tela fará quando configurada:
            </div>
            {[
              "Consulta automática de NF-e, CT-e e NFS-e recebidas",
              "Manifestação em lote: Ciência, Confirmação, Desconhecimento",
              "Importação direta para Compras & Estoque",
              "Alerta de notas pendentes de manifestação (prazo: 30 dias)",
            ].map((item, i) => (
              <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
                <span style={{ color: "#16A34A", fontWeight: 700, flexShrink: 0 }}>✓</span>
                <span>{item}</span>
              </div>
            ))}
          </div>
        </div>

      </div>
    </div>
  );
}
