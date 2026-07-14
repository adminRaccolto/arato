"use client";
import { PLANOS_DEFAULT, fmtPreco } from "../../../lib/planos";
import type { PlanoId } from "../../../lib/planos";

const TODOS_MODULOS: { id: string; label: string; grupo: string }[] = [
  { id: "cadastros",         label: "Cadastros",                  grupo: "Campo" },
  { id: "propriedades",      label: "Fazendas & Talhões",         grupo: "Campo" },
  { id: "lavoura_plantio",   label: "Lavoura — Plantio",          grupo: "Campo" },
  { id: "lavoura_pulv",      label: "Lavoura — Pulverização",     grupo: "Campo" },
  { id: "lavoura_colheita",  label: "Lavoura — Colheita",         grupo: "Campo" },
  { id: "lavoura_plan",      label: "Lavoura — Planejamento",     grupo: "Campo" },
  { id: "estoque",           label: "Estoque",                    grupo: "Campo" },
  { id: "contratos",         label: "Comercialização de Grãos",   grupo: "Comercial" },
  { id: "expedicao",         label: "Expedição de Grãos",         grupo: "Comercial" },
  { id: "arrendamento",      label: "Contratos de Arrendamento",  grupo: "Comercial" },
  { id: "compras",           label: "Pedidos de Compra",          grupo: "Comercial" },
  { id: "nf_entrada",        label: "NF de Entrada",              grupo: "Comercial" },
  { id: "nf_servico",        label: "NF de Serviço",              grupo: "Comercial" },
  { id: "fin_pagar",         label: "Contas a Pagar",             grupo: "Financeiro" },
  { id: "fin_receber",       label: "Contas a Receber",           grupo: "Financeiro" },
  { id: "fin_relatorios",    label: "DRE & Relatórios",           grupo: "Financeiro" },
  { id: "fin_contratos",     label: "Contratos Financeiros",      grupo: "Financeiro" },
  { id: "fin_tesouraria",    label: "Tesouraria",                 grupo: "Financeiro" },
  { id: "fin_seguros",       label: "Seguros",                    grupo: "Financeiro" },
  { id: "custos",            label: "Centro de Custos",           grupo: "Financeiro" },
  { id: "fiscal_nfe",        label: "Emissão NF-e (SEFAZ)",       grupo: "Fiscal" },
  { id: "fiscal_sped",       label: "SPED ECD / LCDPR",           grupo: "Fiscal" },
  { id: "transporte",        label: "CT-e & MDF-e",               grupo: "Fiscal" },
  { id: "usuarios",          label: "Usuários & Permissões",      grupo: "Sistema" },
  { id: "automacoes",        label: "Automações",                 grupo: "Sistema" },
  { id: "whatsapp_agente",   label: "Agente WhatsApp",            grupo: "Sistema" },
  { id: "configuracoes",     label: "Configurações",              grupo: "Sistema" },
];

const GRUPOS = ["Campo", "Comercial", "Financeiro", "Fiscal", "Sistema"];
const PLANO_IDS: PlanoId[] = ["essencial", "gestao", "performance"];

const COR: Record<PlanoId, { label: string; borda: string }> = {
  essencial:   { label: "var(--text-2)",    borda: "var(--border-table)" },
  gestao:      { label: "#1A4870", borda: "#1A4870" },
  performance: { label: "#7A5A12", borda: "#C9921B" },
};

export default function PlanosPage() {
  return (
    <div>
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: "#0B2D50", margin: "0 0 4px" }}>Planos & Módulos</h1>
        <p style={{ fontSize: 13, color: "#666", margin: 0 }}>
          Para alterar preços, edite <code style={{ background: "#F3F6F9", padding: "1px 6px", borderRadius: 4 }}>lib/planos.ts</code> e faça deploy.
          Cobrança e links de pagamento são gerenciados pelo <strong>Mentorasys</strong>.
        </p>
      </div>

      {/* Cards dos planos */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 20, marginBottom: 36 }}>
        {PLANO_IDS.map(pid => {
          const p = PLANOS_DEFAULT[pid];
          const cor = COR[pid];
          return (
            <div key={pid} style={{
              background: "var(--bg-card)",
              border: `1.5px solid ${cor.borda}40`,
              borderRadius: 14,
              padding: "24px 22px",
            }}>
              {p.destaque && (
                <div style={{
                  display: "inline-block", fontSize: 10, fontWeight: 700,
                  color: cor.label, textTransform: "uppercase", letterSpacing: 1.5,
                  background: `${cor.borda}20`, padding: "3px 10px",
                  borderRadius: 20, marginBottom: 10,
                }}>
                  ★ Destaque
                </div>
              )}
              <h2 style={{ fontSize: 18, fontWeight: 800, color: "#0B2D50", margin: "0 0 4px" }}>{p.nome}</h2>
              <p style={{ fontSize: 12, color: "#666", margin: "0 0 16px", lineHeight: 1.5 }}>{p.descricao}</p>
              <div style={{ marginBottom: 4 }}>
                <span style={{ fontSize: 26, fontWeight: 900, color: "#0B2D50" }}>{fmtPreco(p.preco_mensal)}</span>
                <span style={{ fontSize: 13, color: "var(--text-3)" }}>/mês</span>
              </div>
              <div style={{ fontSize: 11, color: "var(--text-3)", marginBottom: 16 }}>
                Trial: {p.trial_dias} dias · Usuários: {p.limite_usuarios ?? "ilimitados"}
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                {p.modulos.map(m => (
                  <span key={m} style={{
                    fontSize: 10, padding: "2px 7px",
                    background: `${cor.borda}18`, color: cor.label,
                    borderRadius: 20, fontWeight: 500,
                  }}>
                    {TODOS_MODULOS.find(x => x.id === m)?.label ?? m}
                  </span>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* Tabela comparativa */}
      <div style={{ background: "var(--bg-card)", borderRadius: 12, border: "0.5px solid #DDE2EE", overflow: "hidden" }}>
        <div style={{ padding: "16px 20px", borderBottom: "0.5px solid #DDE2EE", background: "#F8FAFC" }}>
          <h2 style={{ fontSize: 15, fontWeight: 700, color: "#0B2D50", margin: 0 }}>Tabela Comparativa de Módulos</h2>
        </div>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: "#F8FAFC" }}>
                <th style={{ padding: "12px 16px", textAlign: "left", fontSize: 12, fontWeight: 700, color: "var(--text-2)", borderBottom: "0.5px solid #DDE2EE", width: 220 }}>Módulo</th>
                {PLANO_IDS.map(pid => (
                  <th key={pid} style={{ padding: "12px 16px", textAlign: "center", fontSize: 12, fontWeight: 700, borderBottom: "0.5px solid #DDE2EE", color: COR[pid].label }}>
                    {PLANOS_DEFAULT[pid].nome}
                    <div style={{ fontSize: 11, fontWeight: 400, color: "var(--text-3)", marginTop: 2 }}>{fmtPreco(PLANOS_DEFAULT[pid].preco_mensal)}/mês</div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {GRUPOS.map(grupo => {
                const mods = TODOS_MODULOS.filter(m => m.grupo === grupo);
                return [
                  <tr key={`hdr-${grupo}`}>
                    <td colSpan={4} style={{
                      padding: "10px 16px 4px",
                      fontSize: 10, fontWeight: 700, color: "var(--text-3)",
                      textTransform: "uppercase", letterSpacing: 1,
                      background: "var(--bg-page)",
                    }}>
                      {grupo}
                    </td>
                  </tr>,
                  ...mods.map((mod, idx) => (
                    <tr key={mod.id} style={{ background: idx % 2 === 0 ? "#fff" : "#FAFBFD" }}>
                      <td style={{ padding: "10px 16px", fontSize: 13, color: "var(--text-1)", borderBottom: "0.5px solid #F0F2F7" }}>
                        {mod.label}
                      </td>
                      {PLANO_IDS.map(pid => {
                        const inc = PLANOS_DEFAULT[pid].modulos.includes(mod.id);
                        return (
                          <td key={pid} style={{ padding: "10px 16px", textAlign: "center", fontSize: 16, borderBottom: "0.5px solid #F0F2F7" }}>
                            {inc
                              ? <span style={{ color: "#16A34A" }}>✓</span>
                              : <span style={{ color: "var(--border)" }}>—</span>}
                          </td>
                        );
                      })}
                    </tr>
                  )),
                ];
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
