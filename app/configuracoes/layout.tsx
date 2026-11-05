"use client";
import { usePathname } from "next/navigation";
import { useAuth } from "../../components/AuthProvider";
import { moduloDaTelaDeConfiguracao } from "../../lib/permissoes-configuracao";

// O item some do menu pelo grupo de usuários; aqui a mesma regra vale para quem abre a tela pelo endereço.
export default function ConfiguracoesLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { podeAcessar, modulosCarregados, userRole } = useAuth();
  const modulo = moduloDaTelaDeConfiguracao(pathname);
  if (!modulo) return <>{children}</>;
  if (!userRole || (!modulosCarregados && !podeAcessar(modulo))) return null;
  if (podeAcessar(modulo)) return <>{children}</>;
  return (
    <div style={{ padding: 40, textAlign: "center", color: "var(--text-2)", fontSize: 13 }}>
      <div style={{ fontSize: 15, fontWeight: 600, color: "var(--text-1)", marginBottom: 6 }}>Sem acesso a esta configuração</div>
      Peça a quem administra os usuários para liberar no seu grupo, em Configurações → Usuários e Permissões.
    </div>
  );
}
