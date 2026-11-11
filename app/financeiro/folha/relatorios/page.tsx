"use client";
// Financeiro → Relatórios Financeiros → Folha de Pagamento: o mesmo relatório da aba Relatórios da Folha, em endereço próprio.
import TopNav from "../../../../components/TopNav";
import { useAuth } from "../../../../components/AuthProvider";
import RelatoriosFolha from "../../../../components/folha/RelatoriosFolha";

export default function RelatorioFolhaPage() {
  const { podeAcessar } = useAuth();
  return (
    <div data-arato-page="true" style={{ minHeight: "100vh", background: "var(--bg-page, #F4F6FA)" }}>
      <TopNav />
      <main style={{ maxWidth: 1600, margin: "0 auto", padding: "24px 20px" }}>
        <header data-arato-page-heading="true" style={{ marginBottom: 14 }}>
          <p style={{ margin: 0, fontSize: 11, fontWeight: 600, letterSpacing: ".08em", color: "var(--text-3)" }}>FINANCEIRO · RELATÓRIOS</p>
          <h1 data-arato-h1="true" style={{ margin: "2px 0 0", fontSize: 18, fontWeight: 600, color: "var(--text-1)" }}>Relatório da Folha de Pagamento</h1>
        </header>
        {podeAcessar("folha")
          ? <RelatoriosFolha />
          : <p role="alert">Seu grupo não tem acesso à Folha de Pagamento.</p>}
      </main>
    </div>
  );
}
