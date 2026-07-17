"use client";
import { useState, useEffect } from "react";
import { PLANOS_DEFAULT } from "../../../lib/planos";
import type { PlanoId } from "../../../lib/planos";

// ─── Tipos ───────────────────────────────────────────────────────────────────

interface ContaSimples {
  id: string;
  nome: string;
  pacote?: string;
  status?: string;
}

// ─── Definição dos módulos por grupo ─────────────────────────────────────────

const MODULOS_LABEL: Record<string, string> = {
  cadastros:       "Cadastros",
  propriedades:    "Fazendas & Talhões",
  lavoura_plantio: "Plantio",
  lavoura_pulv:    "Pulverização",
  lavoura_colheita:"Colheita",
  lavoura_plan:    "Planejamento de Safra",
  estoque:         "Estoque",
  contratos:       "Contratos de Grãos",
  expedicao:       "Expedição",
  arrendamento:    "Arrendamentos",
  compras:         "Pedidos de Compra",
  nf_entrada:      "NF de Entrada",
  nf_servico:      "NF de Serviços",
  fin_pagar:       "Contas a Pagar",
  fin_receber:     "Contas a Receber",
  custos:          "DRE Agrícola",
  fin_relatorios:  "Rel. Financeiros",
  fin_contratos:   "Contratos Financeiros",
  fin_tesouraria:  "Tesouraria",
  fin_seguros:     "Seguros",
  transporte:      "CT-e / MDF-e",
  usuarios:        "Gestão de Usuários",
  fiscal_nfe:      "Emissão NF-e (SEFAZ)",
  fiscal_sped:     "SPED ECD / LCDPR",
  configuracoes:   "Configurações",
  bi:              "BI — Raccotlo Intelligence",
  // ── Add-ons opcionais (vendidos separadamente) ──
  algodao:          "🌱 Módulo Algodão (Add-on)",
  cerealista:       "🌾 Módulo Cerealista (Add-on)",
  sementes:         "🫘 Módulo Sementes (Add-on)",
  pecuaria:         "🐄 Módulo Pecuário (Add-on)",
  apoio_financeiro: "💼 Apoio Financeiro (Add-on)",
};

const GRUPOS_MODULOS: { label: string; modulos: string[] }[] = [
  {
    label: "Campo",
    modulos: ["cadastros", "propriedades", "lavoura_plantio", "lavoura_pulv", "lavoura_colheita", "lavoura_plan", "estoque"],
  },
  {
    label: "Comercial",
    modulos: ["contratos", "expedicao", "arrendamento", "compras", "nf_entrada", "nf_servico"],
  },
  {
    label: "Financeiro",
    modulos: ["fin_pagar", "fin_receber", "custos", "fin_relatorios", "fin_contratos", "fin_tesouraria", "fin_seguros"],
  },
  {
    label: "Fiscal",
    modulos: ["fiscal_nfe", "fiscal_sped", "transporte"],
  },
  {
    label: "Sistema",
    modulos: ["usuarios", "configuracoes", "bi"],
  },
  {
    label: "Add-ons Opcionais",
    modulos: ["algodao", "cerealista", "sementes", "pecuaria", "apoio_financeiro"],
  },
];

// ─── Estilos ─────────────────────────────────────────────────────────────────

const inp: React.CSSProperties = {
  width: "100%", padding: "8px 10px",
  border: "0.5px solid var(--border-table)", borderRadius: 8,
  fontSize: 13, color: "var(--text-1)", background: "var(--bg-card)",
  boxSizing: "border-box", outline: "none",
};

const lbl: React.CSSProperties = {
  fontSize: 11, color: "var(--text-2)", marginBottom: 4, display: "block", fontWeight: 600,
};

const btnPrimary: React.CSSProperties = {
  padding: "9px 22px", background: "#0B1E35", color: "#fff",
  border: "none", borderRadius: 8, fontWeight: 600, cursor: "pointer", fontSize: 13,
};

const btnSecondary: React.CSSProperties = {
  padding: "9px 18px", background: "var(--bg-card)", color: "var(--text-2)",
  border: "0.5px solid var(--border-table)", borderRadius: 8, fontWeight: 600, cursor: "pointer", fontSize: 13,
};

// ─── Página ───────────────────────────────────────────────────────────────────

export default function ModulosPage() {
  const [contas, setContas] = useState<ContaSimples[]>([]);
  const [contaId, setContaId] = useState("");
  const [contaSel, setContaSel] = useState<ContaSimples | null>(null);
  const [overrides, setOverrides] = useState<Record<string, boolean>>({});
  const [carregando, setCarregando] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [msg, setMsg] = useState<{ tipo: "ok" | "erro"; texto: string } | null>(null);

  // Carrega lista de contas via API route (service_role — ignora RLS)
  useEffect(() => {
    fetch("/api/admin/listar-contas")
      .then(r => r.json())
      .then((data: ContaSimples[] | { error: string }) => {
        if (Array.isArray(data)) setContas(data);
      });
  }, []);

  // Quando troca de conta, carrega overrides do banco via API route
  async function selecionarConta(id: string) {
    setContaId(id);
    const sel = contas.find(c => c.id === id) ?? null;
    setContaSel(sel);
    if (!id) { setOverrides({}); return; }
    setCarregando(true);
    const res = await fetch(`/api/admin/conta-modulos?conta_id=${id}`);
    const data = await res.json() as { modulo: string; habilitado: boolean }[];
    const mapa: Record<string, boolean> = {};
    if (Array.isArray(data)) data.forEach((r) => { mapa[r.modulo] = r.habilitado; });
    setOverrides(mapa);
    setCarregando(false);
  }

  // Determina se módulo está habilitado (override > plano padrão)
  function estaHabilitado(modulo: string): boolean {
    if (modulo in overrides) return overrides[modulo];
    const plano = contaSel?.pacote as PlanoId | undefined;
    if (!plano || !PLANOS_DEFAULT[plano]) return false;
    return PLANOS_DEFAULT[plano].modulos.includes(modulo);
  }

  // Determina se módulo está no plano padrão da conta
  function noPlano(modulo: string): boolean {
    const plano = contaSel?.pacote as PlanoId | undefined;
    if (!plano || !PLANOS_DEFAULT[plano]) return false;
    return PLANOS_DEFAULT[plano].modulos.includes(modulo);
  }

  function toggleModulo(modulo: string) {
    const atual = estaHabilitado(modulo);
    setOverrides(prev => ({ ...prev, [modulo]: !atual }));
  }

  async function salvarAlteracoes() {
    if (!contaId) return;
    setSalvando(true); setMsg(null);
    try {
      const todos = Object.keys(MODULOS_LABEL);
      const modulos = todos
        .filter(m => estaHabilitado(m) !== noPlano(m) || m in overrides)
        .map(m => ({ modulo: m, habilitado: estaHabilitado(m) }));

      if (modulos.length > 0) {
        const res = await fetch("/api/admin/conta-modulos", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ conta_id: contaId, modulos }),
        });
        if (!res.ok) {
          const err = await res.json() as { error?: string };
          throw new Error(err.error ?? "Erro ao salvar");
        }
      }
      setMsg({ tipo: "ok", texto: "Módulos salvos com sucesso." });
    } catch (e) {
      setMsg({ tipo: "erro", texto: String(e) });
    } finally {
      setSalvando(false);
    }
  }

  function resetarParaPadrao() {
    setOverrides({});
    setMsg(null);
  }

  const modulosExtras = contaId
    ? Object.keys(MODULOS_LABEL).filter(m => estaHabilitado(m) && !noPlano(m)).length
    : 0;

  return (
    <div style={{ fontFamily: "system-ui, sans-serif", fontSize: 13 }}>

      {/* Header */}
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ margin: "0 0 2px", fontSize: 22, fontWeight: 800, color: "#0B1E35", letterSpacing: "-0.3px" }}>
          Módulos por Conta
        </h1>
        <p style={{ margin: 0, fontSize: 13, color: "var(--text-3)" }}>
          Habilite ou desabilite módulos individualmente por cliente
        </p>
      </div>

      {/* Aviso */}
      {modulosExtras > 0 && (
        <div style={{ padding: "10px 14px", background: "#FBF3E0", border: "0.5px solid #C9921B50", borderRadius: 8, marginBottom: 16, fontSize: 12, color: "#7A5A12" }}>
          <strong>Atenção:</strong> {modulosExtras} módulo{modulosExtras !== 1 ? "s" : ""} habilitado{modulosExtras !== 1 ? "s" : ""} além do plano contratado. Podem ser faturados separadamente.
        </div>
      )}

      {/* Seleção de conta */}
      <div style={{ background: "var(--bg-card)", borderRadius: 12, border: "0.5px solid var(--border)", padding: "20px 24px", marginBottom: 20 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 16, alignItems: "flex-end" }}>
          <div>
            <label style={lbl}>Selecionar conta *</label>
            <select style={inp} value={contaId} onChange={e => selecionarConta(e.target.value)}>
              <option value="">— Selecione uma conta —</option>
              {contas.map(c => (
                <option key={c.id} value={c.id}>
                  {c.nome}{c.pacote ? ` (${c.pacote})` : ""}{c.status === "trial" ? " [Trial]" : ""}
                </option>
              ))}
            </select>
          </div>
          {contaId && (
            <button style={btnSecondary} onClick={resetarParaPadrao}>
              ↺ Resetar para padrão
            </button>
          )}
        </div>

        {contaSel && (
          <div style={{ marginTop: 14, display: "flex", gap: 10, alignItems: "center" }}>
            <div style={{ fontSize: 12, color: "var(--text-2)" }}>Plano atual:</div>
            {contaSel.pacote ? (
              <span style={{ padding: "3px 10px", background: "#D5E8F5", color: "#1A4870", borderRadius: 6, fontSize: 12, fontWeight: 700 }}>
                {PLANOS_DEFAULT[contaSel.pacote as PlanoId]?.nome ?? contaSel.pacote}
              </span>
            ) : (
              <span style={{ fontSize: 12, color: "var(--text-muted)" }}>Sem plano definido</span>
            )}
            <div style={{ fontSize: 11, color: "var(--text-3)", marginLeft: 4 }}>
              — Módulos do plano aparecem marcados por padrão
            </div>
          </div>
        )}
      </div>

      {/* Módulos */}
      {contaId && (
        carregando ? (
          <div style={{ padding: "48px 0", textAlign: "center", color: "var(--text-3)" }}>Carregando módulos…</div>
        ) : (
          <>
            {GRUPOS_MODULOS.map(grupo => (
              <div key={grupo.label} style={{ background: "var(--bg-card)", borderRadius: 12, border: "0.5px solid var(--border)", marginBottom: 14, overflow: "hidden" }}>
                <div style={{ padding: "12px 20px", borderBottom: "0.5px solid var(--bg-tag)", background: "var(--bg-card)" }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: "#0B1E35", textTransform: "uppercase", letterSpacing: "0.04em" }}>
                    {grupo.label}
                  </span>
                </div>
                <div style={{ padding: "8px 20px" }}>
                  {grupo.modulos.map(modulo => {
                    const hab      = estaHabilitado(modulo);
                    const dePlano  = noPlano(modulo);
                    const override = modulo in overrides;
                    return (
                      <div key={modulo} style={{
                        display: "flex", alignItems: "center", justifyContent: "space-between",
                        padding: "10px 0", borderBottom: "0.5px solid #F3F6F9",
                      }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                          {/* Toggle switch */}
                          <div
                            onClick={() => toggleModulo(modulo)}
                            style={{
                              width: 40, height: 22, borderRadius: 11, cursor: "pointer",
                              background: hab ? "#16A34A" : "var(--border-table)",
                              position: "relative", transition: "background 0.2s",
                              flexShrink: 0,
                            }}
                          >
                            <div style={{
                              position: "absolute", top: 3,
                              left: hab ? 21 : 3,
                              width: 16, height: 16, borderRadius: "50%",
                              background: "var(--bg-card)",
                              boxShadow: "0 1px 3px #0003",
                              transition: "left 0.2s",
                            }} />
                          </div>
                          <div>
                            <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-1)" }}>
                              {MODULOS_LABEL[modulo] ?? modulo}
                            </div>
                            <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 1 }}>
                              {modulo}
                            </div>
                          </div>
                        </div>
                        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                          {dePlano && (
                            <span style={{ fontSize: 10, background: "#D5E8F5", color: "#1A4870", borderRadius: 4, padding: "2px 7px", fontWeight: 600 }}>
                              Incluso no plano
                            </span>
                          )}
                          {!dePlano && hab && (
                            <span style={{ fontSize: 10, background: "#FBF3E0", color: "#C9921B", borderRadius: 4, padding: "2px 7px", fontWeight: 600 }}>
                              Extra
                            </span>
                          )}
                          {override && (
                            <span style={{ fontSize: 10, background: "#F3F4F6", color: "#666", borderRadius: 4, padding: "2px 7px" }}>
                              Override
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}

            {msg && (
              <div style={{ padding: "10px 14px", borderRadius: 8, marginBottom: 14, fontSize: 12,
                background: msg.tipo === "ok" ? "#F0FDF4" : "#FEF2F2",
                color: msg.tipo === "ok" ? "#16A34A" : "#991B1B",
                border: `0.5px solid ${msg.tipo === "ok" ? "#16A34A40" : "#E24B4A40"}`,
              }}>
                {msg.texto}
              </div>
            )}

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, paddingTop: 4 }}>
              <button style={btnSecondary} onClick={resetarParaPadrao}>Resetar para padrão</button>
              <button style={btnPrimary} onClick={salvarAlteracoes} disabled={salvando}>
                {salvando ? "Salvando…" : "Salvar alterações"}
              </button>
            </div>

            {/* Nota de migration */}
            <div style={{ marginTop: 20, padding: "10px 14px", background: "#EFF6FF", borderRadius: 8, border: "0.5px solid #378ADD40", fontSize: 11, color: "#1A4870", lineHeight: 1.7 }}>
              <strong>Migration necessária:</strong> Execute no Supabase SQL Editor se a tabela não existir:
              <code style={{ display: "block", marginTop: 6, background: "#D5E8F5", borderRadius: 4, padding: "6px 10px", fontFamily: "monospace", fontSize: 10, color: "#0B2D50", overflowX: "auto", whiteSpace: "pre" }}>
                {`CREATE TABLE IF NOT EXISTS conta_modulos (\n  conta_id uuid REFERENCES contas(id) ON DELETE CASCADE,\n  modulo text NOT NULL,\n  habilitado boolean NOT NULL DEFAULT true,\n  PRIMARY KEY (conta_id, modulo)\n);\nCREATE INDEX IF NOT EXISTS idx_conta_modulos_conta ON conta_modulos(conta_id);`}
              </code>
            </div>
          </>
        )
      )}

      {!contaId && (
        <div style={{ padding: "60px 0", textAlign: "center", color: "var(--text-muted)" }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>⬡</div>
          <div style={{ fontSize: 14, color: "var(--text-3)" }}>Selecione uma conta para gerenciar seus módulos</div>
        </div>
      )}
    </div>
  );
}
