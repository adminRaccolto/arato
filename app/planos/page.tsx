import Link from "next/link";
import { PLANOS_DEFAULT, fmtPreco, fetchPlanosPrecos } from "../../lib/planos";
import type { PlanoId } from "../../lib/planos";

export const dynamic = "force-dynamic"; // sempre busca preços atuais do banco

const ORDEM: PlanoId[] = ["essencial", "gestao", "performance"];

const COR: Record<PlanoId, { borda: string; bg: string; badge: string; btn: string }> = {
  essencial:   { borda: "#D4DCE8", bg: "#fff",    badge: "#F3F6F9", btn: "#1A4870" },
  gestao:      { borda: "#1A4870", bg: "#F0F7FF", badge: "#1A4870", btn: "#1A4870" },
  performance: { borda: "#C9921B", bg: "#FEFCF5", badge: "#C9921B", btn: "#C9921B" },
};

export default async function PlanosPage() {
  const precos = await fetchPlanosPrecos();

  return (
    <div style={{ fontFamily: "system-ui, sans-serif", background: "#F4F6FA", minHeight: "100vh" }}>

      {/* ── Navbar pública ── */}
      <nav style={{
        background: "#fff", borderBottom: "0.5px solid #D4DCE8",
        padding: "0 32px", height: 60,
        display: "flex", alignItems: "center", justifyContent: "space-between",
        position: "sticky", top: 0, zIndex: 100,
      }}>
        <img src="https://ptbougxydvxxdlhywhps.supabase.co/storage/v1/object/public/logoshttps://ptbougxydvxxdlhywhps.supabase.co/storage/v1/object/public/logos/Logo_Arato_Nova.png" alt="Arato" style={{ height: 34, objectFit: "contain" }} />
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <Link href="/login" style={{ fontSize: 13, color: "#555", textDecoration: "none", padding: "7px 16px", border: "0.5px solid #D4DCE8", borderRadius: 8 }}>
            Já tenho conta
          </Link>
          <Link href="/cadastro" style={{ fontSize: 13, color: "#fff", textDecoration: "none", padding: "8px 20px", background: "#1A4870", borderRadius: 8, fontWeight: 600 }}>
            Começar grátis
          </Link>
        </div>
      </nav>

      <main style={{ maxWidth: 1100, margin: "0 auto", padding: "56px 24px 80px" }}>

        {/* ── Hero ── */}
        <div style={{ textAlign: "center", marginBottom: 48 }}>
          <div style={{ display: "inline-block", padding: "4px 14px", background: "#D5E8F5", borderRadius: 20, fontSize: 12, fontWeight: 600, color: "#1A4870", marginBottom: 16 }}>
            🌱 14 dias grátis — sem cartão
          </div>
          <h1 style={{ margin: "0 0 16px", fontSize: 38, fontWeight: 800, color: "#0B2D50", lineHeight: 1.2 }}>
            Escolha o plano certo<br />para a sua fazenda
          </h1>
          <p style={{ margin: "0 auto 0", fontSize: 16, color: "#555", maxWidth: 540, lineHeight: 1.6 }}>
            Do plantio ao financeiro, o Arato organiza toda a sua operação agrícola em um só lugar.
            Cobrança mensal recorrente, cancele quando quiser.
          </p>
        </div>

        {/* ── Cards ── */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 24, marginBottom: 64 }}>
          {ORDEM.map(pid => {
            const p = PLANOS_DEFAULT[pid];
            const c = COR[pid];

            return (
              <div key={pid} style={{
                background: c.bg, border: `${pid === "gestao" ? "2px" : "0.5px"} solid ${c.borda}`,
                borderRadius: 16, padding: "28px 28px 32px",
                display: "flex", flexDirection: "column",
                boxShadow: pid === "gestao" ? "0 8px 32px rgba(26,72,112,0.12)" : "0 2px 8px rgba(0,0,0,0.06)",
                position: "relative",
              }}>

                {pid === "gestao" && (
                  <div style={{
                    position: "absolute", top: -13, left: "50%", transform: "translateX(-50%)",
                    background: "#1A4870", color: "#fff", borderRadius: 20,
                    padding: "3px 16px", fontSize: 11, fontWeight: 700, whiteSpace: "nowrap",
                  }}>
                    ⭐ Mais popular
                  </div>
                )}
                {pid === "performance" && (
                  <div style={{
                    position: "absolute", top: -13, left: "50%", transform: "translateX(-50%)",
                    background: "#C9921B", color: "#fff", borderRadius: 20,
                    padding: "3px 16px", fontSize: 11, fontWeight: 700, whiteSpace: "nowrap",
                  }}>
                    🚀 Operação completa
                  </div>
                )}

                <div style={{ marginBottom: 6 }}>
                  <span style={{ background: c.badge, color: pid === "essencial" ? "#555" : "#fff", padding: "2px 10px", borderRadius: 6, fontSize: 11, fontWeight: 700 }}>
                    {p.nome}
                  </span>
                </div>

                <div style={{ fontSize: 13, color: "#666", marginBottom: 20, marginTop: 8, lineHeight: 1.4 }}>
                  {p.descricao}
                </div>

                <div style={{ marginBottom: 4 }}>
                  <span style={{ fontSize: 36, fontWeight: 800, color: "#0B2D50" }}>
                    {fmtPreco(precos[pid])}
                  </span>
                  <span style={{ fontSize: 13, color: "#888" }}>/mês</span>
                </div>

                <div style={{ fontSize: 11, color: "#888", marginBottom: 24 }}>
                  14 dias grátis · cobrança mensal recorrente
                </div>

                <Link
                  href={`/cadastro?plano=${pid}`}
                  style={{
                    display: "block", textAlign: "center",
                    padding: "12px 0", background: c.btn, color: "#fff",
                    borderRadius: 10, fontWeight: 700, fontSize: 14,
                    textDecoration: "none", marginBottom: 28,
                    transition: "opacity 0.15s",
                  }}
                  onMouseEnter={e => (e.currentTarget.style.opacity = "0.88")}
                  onMouseLeave={e => (e.currentTarget.style.opacity = "1")}
                >
                  Começar grátis
                </Link>

                <div style={{ borderTop: "0.5px solid #DDE2EE", paddingTop: 20 }}>
                  {p.features_marketing.map((f, i) => (
                    <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 8, marginBottom: 10 }}>
                      <span style={{ color: "#16A34A", fontSize: 13, flexShrink: 0, marginTop: 1 }}>✓</span>
                      <span style={{ fontSize: 13, color: "#333", lineHeight: 1.4 }}>{f}</span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        {/* ── Comparativo completo ── */}
        <div style={{ background: "#fff", borderRadius: 16, border: "0.5px solid #D4DCE8", overflow: "hidden", marginBottom: 64 }}>
          <div style={{ padding: "24px 32px", borderBottom: "0.5px solid #E4E9F0" }}>
            <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: "#0B2D50" }}>Comparativo completo</h2>
          </div>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: "#F3F6F9" }}>
                <th style={{ padding: "12px 24px", textAlign: "left", fontSize: 12, fontWeight: 600, color: "#555", width: "40%" }}>Funcionalidade</th>
                {ORDEM.map(pid => (
                  <th key={pid} style={{ padding: "12px 16px", textAlign: "center", fontSize: 13, fontWeight: 700, color: COR[pid].btn, width: "20%" }}>
                    {PLANOS_DEFAULT[pid].nome}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[
                ["Cadastros e Talhões", true, true, true],
                ["Lavoura completa", true, true, true],
                ["Contas a Pagar e Receber", true, true, true],
                ["Relatório de Aplicações", true, true, true],
                ["DRE Agrícola", false, true, true],
                ["Comercialização de Grãos", false, true, true],
                ["Compras e Pedidos", false, true, true],
                ["NF de Entrada", false, true, true],
                ["Financeiro completo", false, true, true],
                ["CT-e e MDF-e", false, true, true],
                ["Arrendamentos", false, true, true],
                ["Emissão de NF-e (SEFAZ)", false, false, true],
                ["SPED ECD / LCDPR", false, false, true],
                ["eSocial Rural", false, false, true],
                ["Automações", false, false, true],
                ["Agente WhatsApp (IA)", false, false, true],
                ["Usuários", "2", "5", "Ilimitado"],
              ].map(([label, ess, gest, perf], i) => (
                <tr key={i} style={{ borderBottom: "0.5px solid #EEF1F6", background: i % 2 === 0 ? "#fff" : "#FAFBFD" }}>
                  <td style={{ padding: "11px 24px", fontSize: 13, color: "#333" }}>{label}</td>
                  {[ess, gest, perf].map((v, j) => (
                    <td key={j} style={{ padding: "11px 16px", textAlign: "center" }}>
                      {typeof v === "boolean" ? (
                        v ? <span style={{ color: "#16A34A", fontSize: 16 }}>✓</span>
                          : <span style={{ color: "#D4DCE8", fontSize: 14 }}>—</span>
                      ) : (
                        <span style={{ fontSize: 12, fontWeight: 600, color: "#1A4870" }}>{v}</span>
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* ── FAQ ── */}
        <div style={{ maxWidth: 680, margin: "0 auto", marginBottom: 64 }}>
          <h2 style={{ textAlign: "center", fontSize: 22, fontWeight: 700, color: "#0B2D50", marginBottom: 32 }}>Perguntas frequentes</h2>
          {[
            ["Como funciona o período de teste gratuito?", "Você tem 14 dias para testar todas as funcionalidades do plano escolhido, sem precisar de cartão de crédito. Ao final do trial, você receberá um link de pagamento via PIX."],
            ["Posso mudar de plano depois?", "Sim. Você pode fazer upgrade ou downgrade a qualquer momento pelo painel Configurações > Plano. O valor é ajustado na próxima mensalidade."],
            ["O que acontece se eu não pagar?", "Sua conta entra em modo somente leitura — você continua vendo todos os seus dados e pode exportar, mas novos lançamentos ficam bloqueados até a regularização."],
            ["Meus dados ficam seguros?", "Sim. Todos os dados ficam no Supabase (PostgreSQL) com isolamento por empresa (RLS). Nenhum dado de um cliente é visível para outro."],
            ["Aceita PIX e boleto?", "Sim. A cobrança é feita via Asaas — aceita PIX, boleto bancário e cartão de crédito."],
          ].map(([q, a], i) => (
            <details key={i} style={{ background: "#fff", border: "0.5px solid #D4DCE8", borderRadius: 10, marginBottom: 10, padding: "16px 20px" }}>
              <summary style={{ fontSize: 14, fontWeight: 600, color: "#0B2D50", cursor: "pointer", listStyle: "none", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                {q} <span style={{ fontSize: 18, color: "#888" }}>+</span>
              </summary>
              <p style={{ margin: "12px 0 0", fontSize: 13, color: "#555", lineHeight: 1.6 }}>{a}</p>
            </details>
          ))}
        </div>

        {/* ── CTA final ── */}
        <div style={{ textAlign: "center", background: "#1A4870", borderRadius: 16, padding: "48px 32px", color: "#fff" }}>
          <h2 style={{ margin: "0 0 12px", fontSize: 26, fontWeight: 800 }}>Comece hoje, gratuitamente</h2>
          <p style={{ margin: "0 0 28px", fontSize: 15, opacity: 0.8 }}>14 dias de teste sem cartão. Configure em minutos.</p>
          <Link href="/cadastro" style={{
            display: "inline-block", padding: "14px 40px",
            background: "#C9921B", color: "#fff", borderRadius: 10,
            fontWeight: 700, fontSize: 15, textDecoration: "none",
          }}>
            Criar conta grátis →
          </Link>
        </div>

      </main>

      <footer style={{ textAlign: "center", padding: "24px", fontSize: 12, color: "#aaa", borderTop: "0.5px solid #D4DCE8", background: "#fff" }}>
        © {new Date().getFullYear()} Arato — Gestão Agrícola · <a href="/login" style={{ color: "#1A4870", textDecoration: "none" }}>Entrar</a>
      </footer>
    </div>
  );
}
