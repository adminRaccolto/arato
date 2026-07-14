"use client";
import Link from "next/link";
import { useAuth } from "./AuthProvider";
import { PLANOS_DEFAULT } from "../lib/planos";
import type { PlanoId } from "../lib/planos";

// Qual o plano mínimo que inclui cada módulo
function planoMinimoDoModulo(modulo: string): PlanoId {
  if (PLANOS_DEFAULT.gestao.modulos.includes(modulo)) return "gestao";
  if (PLANOS_DEFAULT.performance.modulos.includes(modulo)) return "performance";
  return "performance";
}

const NOME_PLANO: Record<PlanoId, string> = {
  essencial:   "Essencial",
  gestao:      "Gestão",
  performance: "Performance",
};

const COR_PLANO: Record<PlanoId, string> = {
  essencial:   "#1A4870",
  gestao:      "#1A4870",
  performance: "#C9921B",
};

// ── Tela de acesso suspenso por inadimplência ────────────────────────────────
function TelaInadimplente({ contaStatus }: { contaStatus: string | null }) {
  const vencido = contaStatus === "cancelado" || contaStatus === "inativo";
  return (
    <div style={{
      minHeight: "100vh", background: "var(--bg-page)",
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
      padding: "40px 24px", fontFamily: "system-ui, sans-serif",
    }}>
      <div style={{
        background: "var(--bg-card)", borderRadius: 16,
        border: "2px solid #E24B4A",
        padding: "48px 40px", maxWidth: 500, width: "100%",
        textAlign: "center", boxShadow: "0 8px 40px rgba(0,0,0,0.08)",
      }}>
        <div style={{
          width: 64, height: 64, borderRadius: "50%", background: "#FEF2F2",
          display: "flex", alignItems: "center", justifyContent: "center",
          margin: "0 auto 20px", fontSize: 28,
        }}>⚠️</div>

        <span style={{
          display: "inline-block", fontSize: 11, fontWeight: 700,
          color: "#E24B4A", textTransform: "uppercase", letterSpacing: 2,
          background: "#FEF2F2", padding: "3px 12px", borderRadius: 20, marginBottom: 16,
        }}>
          {vencido ? "Conta encerrada" : "Acesso suspenso"}
        </span>

        <h2 style={{ fontSize: 22, fontWeight: 800, color: "#0B2D50", margin: "0 0 10px" }}>
          {vencido ? "Sua assinatura foi encerrada" : "Pagamento em atraso"}
        </h2>

        <p style={{ fontSize: 14, color: "#666", margin: "0 0 28px", lineHeight: 1.6 }}>
          {vencido
            ? "Sua conta foi encerrada por falta de pagamento. Regularize para reativar o acesso completo."
            : "Identificamos um pagamento em aberto. Regularize para restaurar o acesso completo ao Arato."}
        </p>

        <div style={{
          background: "#FFF9F0", borderRadius: 10, border: "0.5px solid #C9921B50",
          padding: "14px 18px", marginBottom: 28, textAlign: "left",
        }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "#7A5A12", marginBottom: 8 }}>Dados ficam preservados</div>
          <div style={{ fontSize: 13, color: "var(--text-2)", lineHeight: 1.7 }}>
            ✓ Seus dados não são excluídos<br />
            ✓ Acesso restaurado automaticamente após pagamento<br />
            ✓ Suporte disponível via WhatsApp
          </div>
        </div>

        <Link href="/pagamento" style={{
          display: "block", textAlign: "center", padding: "13px 0",
          background: "#E24B4A", color: "#fff", borderRadius: 10,
          fontWeight: 700, fontSize: 15, textDecoration: "none", marginBottom: 12,
        }}>
          Regularizar pagamento →
        </Link>

        <a href="https://wa.me/5565981456825?text=Preciso+regularizar+meu+acesso+ao+Arato"
          target="_blank" rel="noopener noreferrer"
          style={{ display: "block", textAlign: "center", padding: "10px 0", color: "var(--text-3)", fontSize: 13, textDecoration: "none" }}>
          Falar com suporte via WhatsApp
        </a>
      </div>
    </div>
  );
}

interface PlanoGateProps {
  modulo: string;
  children?: React.ReactNode;
}

export default function PlanoGate({ modulo, children }: PlanoGateProps) {
  const { podeAcessarPlano, planoAtual, userRole, inadimplente, contaStatus } = useAuth();

  // Inadimplente: bloqueia TUDO independente do plano
  if (inadimplente && userRole !== "raccotlo") {
    return <TelaInadimplente contaStatus={contaStatus} />;
  }

  // raccotlo tem acesso irrestrito; plano ainda carregando → não bloqueia
  if (podeAcessarPlano(modulo)) return children ? <>{children}</> : null;

  const planoNecessario = planoMinimoDoModulo(modulo);
  const plano           = PLANOS_DEFAULT[planoNecessario];
  const cor             = COR_PLANO[planoNecessario];
  const planoAtualNome  = planoAtual ? NOME_PLANO[planoAtual] : null;

  return (
    <div style={{
      minHeight: "100vh", background: "var(--bg-page)",
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
      padding: "40px 24px", fontFamily: "system-ui, sans-serif",
    }}>
      <div style={{
        background: "var(--bg-card)", borderRadius: 16,
        border: `2px solid ${cor}`,
        padding: "48px 40px", maxWidth: 520, width: "100%",
        textAlign: "center",
        boxShadow: "0 8px 40px rgba(0,0,0,0.08)",
      }}>
        {/* Ícone */}
        <div style={{
          width: 64, height: 64, borderRadius: "50%",
          background: planoNecessario === "performance" ? "#FBF3E0" : "#D5E8F5",
          display: "flex", alignItems: "center", justifyContent: "center",
          margin: "0 auto 20px", fontSize: 28,
        }}>
          🔒
        </div>

        {/* Título */}
        <div style={{ marginBottom: 8 }}>
          <span style={{
            display: "inline-block", fontSize: 11, fontWeight: 700,
            color: cor, textTransform: "uppercase", letterSpacing: 2,
            background: planoNecessario === "performance" ? "#FBF3E0" : "#D5E8F5",
            padding: "3px 12px", borderRadius: 20, marginBottom: 14,
          }}>
            Plano {NOME_PLANO[planoNecessario]}
          </span>
        </div>

        <h2 style={{ fontSize: 22, fontWeight: 800, color: "#0B2D50", margin: "0 0 10px" }}>
          Este módulo não está incluso no seu plano
        </h2>

        {planoAtualNome && (
          <p style={{ fontSize: 14, color: "#666", margin: "0 0 24px" }}>
            Você está no plano <strong>{planoAtualNome}</strong>.
            Faça upgrade para o plano <strong>{NOME_PLANO[planoNecessario]}</strong> para acessar este módulo.
          </p>
        )}

        {/* O que o upgrade desbloqueia */}
        <div style={{
          background: "var(--bg-page)", borderRadius: 10,
          padding: "16px 20px", marginBottom: 28, textAlign: "left",
        }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: 1, marginBottom: 10 }}>
            O plano {NOME_PLANO[planoNecessario]} inclui
          </div>
          {plano.features_marketing.map((f, i) => (
            <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 8, marginBottom: 7 }}>
              <span style={{ color: "#16A34A", fontSize: 13, flexShrink: 0, marginTop: 1 }}>✓</span>
              <span style={{ fontSize: 13, color: "#333", lineHeight: 1.4 }}>{f}</span>
            </div>
          ))}
        </div>

        {/* Preço */}
        <div style={{ marginBottom: 24 }}>
          <span style={{ fontSize: 32, fontWeight: 900, color: "#0B2D50" }}>
            {plano.preco_mensal.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
          </span>
          <span style={{ fontSize: 14, color: "var(--text-3)" }}>/mês</span>
        </div>

        {/* CTAs */}
        <Link
          href={`/planos`}
          style={{
            display: "block", textAlign: "center",
            padding: "13px 0", background: cor, color: "#fff",
            borderRadius: 10, fontWeight: 700, fontSize: 15,
            textDecoration: "none", marginBottom: 12,
          }}
        >
          Fazer upgrade →
        </Link>

        <Link
          href="/"
          style={{
            display: "block", textAlign: "center",
            padding: "10px 0", color: "var(--text-3)",
            fontSize: 13, textDecoration: "none",
          }}
        >
          ← Voltar ao Dashboard
        </Link>
      </div>
    </div>
  );
}
