"use client";
import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { hasClientWorkspace } from "../lib/layout-preferences";
import { useAuth } from "./AuthProvider";
export default function LayoutShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { emailUsuario, contaId, fazendaId } = useAuth();
  const workspace = hasClientWorkspace(pathname, emailUsuario, contaId, fazendaId);
  useEffect(() => { document.documentElement.dataset.layoutWorkspace = String(workspace); }, [workspace]);
  return <div className="arato-layout-shell" data-arato-workspace={workspace ? "true" : undefined} data-route={pathname}>
    <div id="arato-content" tabIndex={-1}>{children}</div>
  </div>;
}
