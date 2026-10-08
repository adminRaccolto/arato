"use client";
// ═══════════════════════════════════════════════════════════════════════════
// Relatório de Pedidos de Compra — hospedado em Comercial & Logística (não em
// Financeiro). Pedido do dono 08/10/2026: o relatório só fazia sentido estar
// em Financeiro → Relatórios Financeiros por reaproveitar a mesma página
// `app/financeiro/relatorios` (aba=pedidos_compra); o nav de Comercial &
// Logística já linkava pra lá, dando a impressão de ser um atalho pro
// Financeiro. Movido pra viver de verdade aqui — o componente em si
// (PedidosCompraRelatorioTab) já era autocontido, sem nenhuma dependência do
// resto da página de relatórios financeiros.
// ═══════════════════════════════════════════════════════════════════════════
import TopNav from "../../../components/TopNav";
import PlanoGate from "../../../components/PlanoGate";
import PedidosCompraRelatorioTab from "../../../components/relatorios/PedidosCompraRelatorioTab";

export default function RelatorioPedidosCompraPage() {
  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh", background: "var(--bg-page)", fontFamily: "system-ui, sans-serif", fontSize: 13 }}>
      <TopNav />
      <main style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
        <PlanoGate modulo="compras">
          <header style={{ background: "var(--bg-card)", borderBottom: "0.5px solid var(--border-table)", padding: "10px 22px" }}>
            <h1 style={{ margin: 0, fontSize: 17, fontWeight: 600, color: "var(--text-1)" }}>Pedidos de Compra</h1>
            <p style={{ margin: 0, fontSize: 11, color: "#444" }}>Comercial &amp; Logística → Relatórios</p>
          </header>
          <PedidosCompraRelatorioTab />
        </PlanoGate>
      </main>
    </div>
  );
}
