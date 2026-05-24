"use client";
import { useState } from "react";
import { PLANOS_DEFAULT, fmtPreco } from "../../../lib/planos";
import type { PlanoId } from "../../../lib/planos";

// ── Todos os módulos disponíveis (fonte de verdade visual) ───────────────────
const TODOS_MODULOS: { id: string; label: string; grupo: string }[] = [
  // Campo
  { id: "cadastros",         label: "Cadastros",                  grupo: "Campo" },
  { id: "propriedades",      label: "Fazendas & Talhões",         grupo: "Campo" },
  { id: "lavoura_plantio",   label: "Lavoura — Plantio",          grupo: "Campo" },
  { id: "lavoura_pulv",      label: "Lavoura — Pulverização",     grupo: "Campo" },
  { id: "lavoura_colheita",  label: "Lavoura — Colheita",         grupo: "Campo" },
  { id: "lavoura_plan",      label: "Lavoura — Planejamento",     grupo: "Campo" },
  { id: "estoque",           label: "Estoque",                    grupo: "Campo" },
  // Comercial
  { id: "contratos",         label: "Comercialização de Grãos",   grupo: "Comercial" },
  { id: "expedicao",         label: "Expedição de Grãos",         grupo: "Comercial" },
  { id: "arrendamento",      label: "Contratos de Arrendamento",  grupo: "Comercial" },
  { id: "compras",           label: "Pedidos de Compra",          grupo: "Comercial" },
  { id: "nf_entrada",        label: "NF de Entrada",              grupo: "Comercial" },
  { id: "nf_servico",        label: "NF de Serviço",              grupo: "Comercial" },
  // Financeiro
  { id: "fin_pagar",         label: "Contas a Pagar",             grupo: "Financeiro" },
  { id: "fin_receber",       label: "Contas a Receber",           grupo: "Financeiro" },
  { id: "fin_relatorios",    label: "DRE & Relatórios",           grupo: "Financeiro" },
  { id: "fin_contratos",     label: "Contratos Financeiros",      grupo: "Financeiro" },
  { id: "fin_tesouraria",    label: "Tesouraria",                 grupo: "Financeiro" },
  { id: "fin_seguros",       label: "Seguros",                    grupo: "Financeiro" },
  { id: "custos",            label: "Centro de Custos",           grupo: "Financeiro" },
  // Fiscal
  { id: "fiscal_nfe",        label: "Emissão NF-e (SEFAZ)",       grupo: "Fiscal" },
  { id: "fiscal_sped",       label: "SPED ECD / LCDPR",           grupo: "Fiscal" },
  { id: "transporte",        label: "CT-e & MDF-e",               grupo: "Fiscal" },
  // Sistema
  { id: "usuarios",          label: "Usuários & Permissões",      grupo: "Sistema" },
  { id: "automacoes",        label: "Automações",                 grupo: "Sistema" },
  { id: "whatsapp_agente",   label: "Agente WhatsApp",            grupo: "Sistema" },
  { id: "configuracoes",     label: "Configurações",              grupo: "Sistema" },
];

const GRUPOS = ["Campo", "Comercial", "Financeiro", "Fiscal", "Sistema"];
const PLANO_IDS: PlanoId[] = ["essencial", "gestao", "performance"];

const COR_PLANO: Record<PlanoId, { bg: string; border: string; label: string }> = {
  essencial:   { bg: "#EFF6FF", border: "#3B82F6", label: "#1D4ED8" },
  gestao:      { bg: "#F0FDF4", border: "#22C55E", label: "#15803D" },
  performance: { bg: "#FBF3E0", border: "#C9921B", label: "#7A5A12" },
};

export default function PlanosPage() {
  const [editPlano, setEditPlano] = useState<PlanoId | null>(null);
  const [precos, setPrecos] = useState<Record<PlanoId, number>>({
    essencial:   PLANOS_DEFAULT.essencial.preco_mensal,
    gestao:      PLANOS_DEFAULT.gestao.preco_mensal,
    performance: PLANOS_DEFAULT.performance.preco_mensal,
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  async function salvarPreco(planoId: PlanoId) {
    setSaving(true);
    await new Promise(r => setTimeout(r, 600)); // simula save via DB
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
    setEditPlano(null);
  }

  return (
    <div>
      {/* Header */}
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: "#0B2D50", margin: 0 }}>Planos & Preços</h1>
        <p style={{ fontSize: 13, color: "#666", margin: "6px 0 0" }}>
          Configuração dos planos do Arato — preços e módulos inclusos.
          <span style={{
            display: "inline-block", marginLeft: 10,
            background: "#FBF3E0", border: "0.5px solid #C9921B50",
            borderRadius: 6, padding: "2px 8px",
            fontSize: 11, color: "#7A5A12", fontWeight: 600,
          }}>
            ⚠ Preços em produção — edite com cuidado
          </span>
        </p>
      </div>

      {/* Cards dos planos */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 20, marginBottom: 36 }}>
        {PLANO_IDS.map(pid => {
          const p = PLANOS_DEFAULT[pid];
          const cor = COR_PLANO[pid];
          const editando = editPlano === pid;
          return (
            <div key={pid} style={{
              background: cor.bg,
              border: `1.5px solid ${cor.border}40`,
              borderRadius: 14,
              padding: "24px 22px",
            }}>
              {p.destaque && (
                <div style={{
                  display: "inline-block", fontSize: 10, fontWeight: 700,
                  color: cor.label, textTransform: "uppercase", letterSpacing: 1.5,
                  background: `${cor.border}20`, padding: "3px 10px",
                  borderRadius: 20, marginBottom: 10,
                }}>
                  ★ Destaque
                </div>
              )}

              <h2 style={{ fontSize: 18, fontWeight: 800, color: "#0B2D50", margin: "0 0 4px" }}>
                {p.nome}
              </h2>
              <p style={{ fontSize: 12, color: "#666", margin: "0 0 16px", lineHeight: 1.5 }}>
                {p.descricao}
              </p>

              {/* Preço */}
              <div style={{ marginBottom: 16 }}>
                {editando ? (
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 13, color: "#555" }}>R$</span>
                    <input
                      type="number"
                      value={precos[pid]}
                      onChange={e => setPrecos(prev => ({ ...prev, [pid]: +e.target.value }))}
                      style={{
                        width: 100, fontSize: 22, fontWeight: 800,
                        border: `1.5px solid ${cor.border}`,
                        borderRadius: 8, padding: "4px 8px",
                        background: "#fff", color: "#0B2D50",
                      }}
                    />
                    <span style={{ fontSize: 13, color: "#888" }}>/mês</span>
                  </div>
                ) : (
                  <div>
                    <span style={{ fontSize: 26, fontWeight: 900, color: "#0B2D50" }}>
                      {fmtPreco(precos[pid])}
                    </span>
                    <span style={{ fontSize: 13, color: "#888" }}>/mês</span>
                  </div>
                )}
                <div style={{ fontSize: 11, color: "#888", marginTop: 4 }}>
                  Trial: {p.trial_dias} dias · Usuários: {p.limite_usuarios ?? "ilimitados"}
                </div>
              </div>

              {/* Ações */}
              <div style={{ display: "flex", gap: 8 }}>
                {editando ? (
                  <>
                    <button
                      onClick={() => salvarPreco(pid)}
                      disabled={saving}
                      style={{
                        flex: 1, padding: "8px 0",
                        background: cor.border, color: "#fff", border: "none",
                        borderRadius: 8, fontWeight: 700, fontSize: 13, cursor: "pointer",
                      }}
                    >
                      {saving ? "Salvando…" : saved ? "✓ Salvo" : "Salvar"}
                    </button>
                    <button
                      onClick={() => setEditPlano(null)}
                      style={{
                        padding: "8px 12px", background: "#fff",
                        border: `0.5px solid ${cor.border}80`,
                        borderRadius: 8, fontSize: 13, cursor: "pointer", color: "#555",
                      }}
                    >
                      Cancelar
                    </button>
                  </>
                ) : (
                  <button
                    onClick={() => setEditPlano(pid)}
                    style={{
                      padding: "8px 16px", background: "#fff",
                      border: `0.5px solid ${cor.border}80`,
                      borderRadius: 8, fontSize: 13, cursor: "pointer",
                      color: cor.label, fontWeight: 600,
                    }}
                  >
                    ✎ Editar preço
                  </button>
                )}
              </div>

              {/* Módulos inclusos */}
              <div style={{ marginTop: 16 }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: "#888", textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>
                  Módulos inclusos ({p.modulos.length})
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                  {p.modulos.map(m => (
                    <span key={m} style={{
                      fontSize: 10, padding: "2px 7px",
                      background: `${cor.border}18`, color: cor.label,
                      borderRadius: 20, fontWeight: 500,
                    }}>
                      {TODOS_MODULOS.find(x => x.id === m)?.label ?? m}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Tabela comparativa */}
      <div style={{
        background: "#fff", borderRadius: 12,
        border: "0.5px solid #DDE2EE",
        overflow: "hidden", marginBottom: 28,
      }}>
        <div style={{
          padding: "16px 20px", borderBottom: "0.5px solid #DDE2EE",
          background: "#F8FAFC",
        }}>
          <h2 style={{ fontSize: 15, fontWeight: 700, color: "#0B2D50", margin: 0 }}>
            Tabela Comparativa de Módulos
          </h2>
        </div>

        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: "#F8FAFC" }}>
                <th style={{ padding: "12px 16px", textAlign: "left", fontSize: 12, fontWeight: 700, color: "#555", borderBottom: "0.5px solid #DDE2EE", width: 220 }}>
                  Módulo
                </th>
                {PLANO_IDS.map(pid => (
                  <th key={pid} style={{
                    padding: "12px 16px", textAlign: "center",
                    fontSize: 12, fontWeight: 700, borderBottom: "0.5px solid #DDE2EE",
                    color: COR_PLANO[pid].label,
                  }}>
                    {PLANOS_DEFAULT[pid].nome}
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
                      fontSize: 10, fontWeight: 700, color: "#888",
                      textTransform: "uppercase", letterSpacing: 1,
                      background: "#F4F6FA",
                    }}>
                      {grupo}
                    </td>
                  </tr>,
                  ...mods.map((mod, idx) => (
                    <tr key={mod.id} style={{ background: idx % 2 === 0 ? "#fff" : "#FAFBFD" }}>
                      <td style={{ padding: "10px 16px", fontSize: 13, color: "#1a1a1a", borderBottom: "0.5px solid #F0F2F7" }}>
                        {mod.label}
                      </td>
                      {PLANO_IDS.map(pid => {
                        const inc = PLANOS_DEFAULT[pid].modulos.includes(mod.id);
                        return (
                          <td key={pid} style={{
                            padding: "10px 16px", textAlign: "center",
                            fontSize: 16, borderBottom: "0.5px solid #F0F2F7",
                          }}>
                            {inc
                              ? <span style={{ color: "#16A34A" }}>✓</span>
                              : <span style={{ color: "#DDE2EE" }}>—</span>
                            }
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

      {/* SQL helper */}
      <div style={{
        background: "#0B1E35", borderRadius: 12,
        padding: "20px 24px",
        marginBottom: 8,
      }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: "rgba(255,255,255,0.5)", marginBottom: 10, textTransform: "uppercase", letterSpacing: 1 }}>
          SQL — Atualizar preço no banco Supabase
        </div>
        <pre style={{
          fontSize: 12, color: "#A5D6FF",
          margin: 0, whiteSpace: "pre-wrap",
          fontFamily: "monospace",
        }}>{`-- Executar no Supabase SQL Editor:
UPDATE planos SET preco_mensal = <NOVO_VALOR> WHERE id = '<essencial|gestao|performance>';
-- Ou criar a tabela se ainda não existir:
CREATE TABLE IF NOT EXISTS planos (
  id         text PRIMARY KEY,
  nome       text,
  preco_mensal numeric,
  trial_dias int,
  modulos    text[],
  updated_at timestamptz default now()
);`}</pre>
      </div>
    </div>
  );
}
