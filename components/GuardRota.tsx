"use client";
// Bloqueia a tela aberta pelo endereço quando o grupo do usuário não tem o módulo dela (fase 3, 16/11/2026).
// O menu já esconde o item (lib/navigation.ts); aqui vale a mesma regra para quem digita a URL ou usa um link salvo.
// Equipe Raccolto/BPO passa sempre. A tela de módulo com várias abas (ex.: Cadastros) confere a aba por conta própria.
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { useAuth } from "./AuthProvider";
import TopNav from "./TopNav";
import { modulosDaRota } from "../lib/rotas-permissao";
import { nomeModulo } from "../lib/modulos";

const EQUIPE = ["raccotlo", "raccotlo_gestor", "raccotlo_operacional", "raccotlo_seletor", "bpo"];

export function SemPermissao({ modulos }: { modulos: string[] }) {
  return (
    <>
      <TopNav />
      <div style={{ display: "flex", justifyContent: "center", padding: "60px 16px" }}>
        <div style={{ background: "var(--bg-card)", border: "0.5px solid var(--border)", borderRadius: 12, padding: "28px 26px", maxWidth: 460, textAlign: "center" }}>
          <div style={{ fontSize: 26, marginBottom: 10 }}>🔒</div>
          <div style={{ fontSize: 15, fontWeight: 600, color: "var(--text-1)", marginBottom: 8 }}>Sem acesso a esta tela</div>
          <div style={{ fontSize: 13, color: "var(--text-2)", lineHeight: 1.6, marginBottom: 16 }}>
            Seu grupo de usuário não tem <strong>{modulos.map(nomeModulo).join(" / ")}</strong> marcado. Peça a quem
            administra os usuários para liberar em Configurações → Usuários e Permissões.
          </div>
          <Link href="/" style={{ fontSize: 13, color: "#1A4870", fontWeight: 600 }}>Voltar ao início</Link>
        </div>
      </div>
    </>
  );
}

/** true/false quando já dá para decidir; null enquanto as permissões do cliente carregam. */
export function usePodeAbrir(modulos: string[] | null): boolean | null {
  const { userRole, podeAcessar, modulosCarregados } = useAuth();
  if (!modulos) return true;
  if (EQUIPE.includes(userRole ?? "")) return true;
  if (!userRole) return null;
  // Enquanto o grupo carrega, segue a mesma regra de app/configuracoes/layout.tsx: não deixa tela em branco esperando;
  // o bloqueio entra assim que as permissões chegam.
  if (!modulosCarregados) return modulos.some(m => podeAcessar(m)) ? true : null;
  return modulos.some(m => podeAcessar(m));
}

export default function GuardRota({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const modulos = modulosDaRota(pathname ?? "/");
  const pode = usePodeAbrir(modulos);
  if (pode === null) return null;
  if (!pode) return <SemPermissao modulos={modulos!} />;
  return <>{children}</>;
}
