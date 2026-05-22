"use client";
import { useAuth } from "./AuthProvider";
import { usePathname } from "next/navigation";

// Páginas onde o banner não aparece (login, cadastro, planos)
const ROTAS_PUBLICAS = ["/login", "/planos", "/cadastro", "/alterar-senha", "/seletor-cliente"];

export default function BannerInadimplente() {
  const { inadimplente, contaStatus } = useAuth();
  const pathname = usePathname();

  // Não exibe em rotas públicas
  if (ROTAS_PUBLICAS.some(r => pathname.startsWith(r))) return null;
  // Só exibe quando inadimplente
  if (!inadimplente) return null;

  return (
    <div style={{
      background: "#FEF2F2",
      borderBottom: "0.5px solid #FCA5A5",
      padding: "8px 20px",
      display: "flex", alignItems: "center", justifyContent: "space-between",
      fontSize: 13, color: "#B91C1C",
      zIndex: 99, flexShrink: 0,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ fontSize: 15 }}>⚠️</span>
        <span>
          <strong>Pagamento em atraso.</strong> Novos lançamentos estão bloqueados.
          Você pode visualizar e exportar seus dados normalmente.
        </span>
      </div>
      <a
        href="mailto:financeiro@arato.agr.br?subject=Regularizar pagamento"
        style={{
          fontSize: 12, fontWeight: 700, color: "#B91C1C",
          border: "0.5px solid #F87171", borderRadius: 6,
          padding: "4px 12px", textDecoration: "none", whiteSpace: "nowrap", flexShrink: 0,
        }}
      >
        Regularizar →
      </a>
    </div>
  );
}
