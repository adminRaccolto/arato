"use client";
import { useState, useEffect, useCallback } from "react";
import TopNav from "@/components/TopNav";
import { useAuth } from "@/components/AuthProvider";
import { listarAlertasController, reconhecerAlerta, resolverAlerta, upsertAlertaController } from "@/lib/db";
import type { ControllerAlerta } from "@/lib/supabase";

type Severidade = ControllerAlerta["severidade"];
type Categoria = ControllerAlerta["categoria"];

const SEV_COR: Record<Severidade, string> = {
  critico: "#E24B4A",
  alto: "#EF9F27",
  medio: "#378ADD",
  baixo: "#888",
};
const SEV_BG: Record<Severidade, string> = {
  critico: "#FEF2F2",
  alto: "#FFF7ED",
  medio: "#EFF6FF",
  baixo: "#F9FAFB",
};
const SEV_LABEL: Record<Severidade, string> = {
  critico: "Crítico",
  alto: "Alto",
  medio: "Médio",
  baixo: "Baixo",
};

const CAT_ICONE: Record<Categoria, string> = {
  Fiscal: "📄",
  Financeiro: "💰",
  Contratos: "📋",
  Lavoura: "🌱",
  Cadastros: "🗂️",
  Estoque: "📦",
  Arrendamentos: "🏡",
};

export default function ControllerPage() {
  const { fazendaId } = useAuth();
  const [alertas, setAlertas] = useState<ControllerAlerta[]>([]);
  const [loading, setLoading] = useState(true);
  const [executando, setExecutando] = useState(false);
  const [filtroSev, setFiltroSev] = useState<Severidade | "todos">("todos");
  const [filtroCat, setFiltroCat] = useState<Categoria | "todos">("todos");
  const [mostrarResolvidos, setMostrarResolvidos] = useState(false);
  const [msg, setMsg] = useState("");

  const carregar = useCallback(async () => {
    if (!fazendaId) return;
    setLoading(true);
    try {
      const data = await listarAlertasController(fazendaId);
      setAlertas(data);
    } catch (_) { /* ignora */ }
    finally { setLoading(false); }
  }, [fazendaId]);

  useEffect(() => { carregar(); }, [carregar]);

  async function executarVerificacoes() {
    if (!fazendaId) return;
    setExecutando(true);
    setMsg("Executando verificações...");
    try {
      await rodarChecks(fazendaId);
      await carregar();
      setMsg("Verificações concluídas.");
      setTimeout(() => setMsg(""), 3000);
    } catch (e: unknown) {
      const err = e instanceof Error ? e.message : String(e);
      setMsg("Erro: " + err);
    } finally { setExecutando(false); }
  }

  async function ackAlerta(id: string) {
    await reconhecerAlerta(id, "sistema");
    setAlertas(prev => prev.map(a => a.id === id ? { ...a, acknowledged_at: new Date().toISOString(), acknowledged_by: "sistema" } : a));
  }

  async function fecharAlerta(id: string) {
    await resolverAlerta(id);
    setAlertas(prev => prev.filter(a => a.id !== id));
  }

  const alertasFiltrados = alertas
    .filter(a => filtroSev === "todos" || a.severidade === filtroSev)
    .filter(a => filtroCat === "todos" || a.categoria === filtroCat)
    .filter(a => mostrarResolvidos || !a.resolved_at);

  const contadores: Record<Severidade, number> = {
    critico: alertas.filter(a => a.severidade === "critico" && !a.resolved_at).length,
    alto: alertas.filter(a => a.severidade === "alto" && !a.resolved_at).length,
    medio: alertas.filter(a => a.severidade === "medio" && !a.resolved_at).length,
    baixo: alertas.filter(a => a.severidade === "baixo" && !a.resolved_at).length,
  };
  const totalAtivos = alertas.filter(a => !a.resolved_at).length;

  return (
    <div style={{ minHeight: "100vh", background: "#F4F6FA", fontFamily: "system-ui, sans-serif" }}>
      <TopNav />
      <div style={{ maxWidth: 1200, margin: "0 auto", padding: "24px 16px" }}>

        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 600, color: "#1A4870", margin: 0 }}>Controller</h1>
            <p style={{ margin: "4px 0 0", color: "#666", fontSize: 13 }}>
              Monitoramento automático de inconsistências e alertas operacionais
            </p>
          </div>
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            {msg && <span style={{ fontSize: 12, color: "#555", fontStyle: "italic" }}>{msg}</span>}
            <button
              onClick={executarVerificacoes}
              disabled={executando}
              style={{
                background: "#1A4870", color: "#fff", border: "none", borderRadius: 8,
                padding: "8px 18px", fontSize: 13, fontWeight: 600, cursor: executando ? "not-allowed" : "pointer",
                opacity: executando ? 0.7 : 1, display: "flex", alignItems: "center", gap: 6,
              }}
            >
              {executando ? "⟳ Verificando..." : "⟳ Executar Verificações"}
            </button>
          </div>
        </div>

        {/* KPI cards */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 20 }}>
          {(["critico", "alto", "medio", "baixo"] as Severidade[]).map(sev => (
            <button
              key={sev}
              onClick={() => setFiltroSev(filtroSev === sev ? "todos" : sev)}
              style={{
                background: filtroSev === sev ? SEV_BG[sev] : "#fff",
                border: `0.5px solid ${filtroSev === sev ? SEV_COR[sev] : "#DDE2EE"}`,
                borderLeft: `4px solid ${SEV_COR[sev]}`,
                borderRadius: 8, padding: "14px 16px", textAlign: "left", cursor: "pointer",
              }}
            >
              <div style={{ fontSize: 24, fontWeight: 700, color: SEV_COR[sev] }}>{contadores[sev]}</div>
              <div style={{ fontSize: 12, color: "#666", marginTop: 2 }}>Alertas {SEV_LABEL[sev]}s</div>
            </button>
          ))}
        </div>

        {/* Filtros */}
        <div style={{ background: "#fff", borderRadius: 10, border: "0.5px solid #DDE2EE", padding: "12px 16px", marginBottom: 16, display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
          <span style={{ fontSize: 12, color: "#888", fontWeight: 600 }}>FILTRAR:</span>

          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {(["todos", "Fiscal", "Financeiro", "Contratos", "Lavoura", "Cadastros", "Estoque", "Arrendamentos"] as (Categoria | "todos")[]).map(cat => (
              <button
                key={cat}
                onClick={() => setFiltroCat(cat)}
                style={{
                  background: filtroCat === cat ? "#D5E8F5" : "#F4F6FA",
                  border: `0.5px solid ${filtroCat === cat ? "#1A4870" : "#DDE2EE"}`,
                  color: filtroCat === cat ? "#1A4870" : "#555",
                  borderRadius: 99, padding: "4px 12px", fontSize: 12, cursor: "pointer", fontWeight: filtroCat === cat ? 600 : 400,
                }}
              >
                {cat === "todos" ? "Todas" : `${CAT_ICONE[cat as Categoria]} ${cat}`}
              </button>
            ))}
          </div>

          <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 6 }}>
            <input
              type="checkbox"
              id="mostrar-resolvidos"
              checked={mostrarResolvidos}
              onChange={e => setMostrarResolvidos(e.target.checked)}
              style={{ cursor: "pointer" }}
            />
            <label htmlFor="mostrar-resolvidos" style={{ fontSize: 12, color: "#888", cursor: "pointer" }}>
              Mostrar resolvidos
            </label>
          </div>
        </div>

        {/* Lista de alertas */}
        {loading ? (
          <div style={{ textAlign: "center", padding: 48, color: "#999", fontSize: 14 }}>Carregando alertas...</div>
        ) : alertasFiltrados.length === 0 ? (
          <div style={{ background: "#fff", borderRadius: 12, border: "0.5px solid #DDE2EE", padding: 48, textAlign: "center" }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>{totalAtivos === 0 ? "✅" : "🔍"}</div>
            <div style={{ fontSize: 16, fontWeight: 600, color: totalAtivos === 0 ? "#16A34A" : "#1A4870" }}>
              {totalAtivos === 0 ? "Tudo em ordem!" : "Nenhum alerta para os filtros selecionados"}
            </div>
            <div style={{ fontSize: 13, color: "#888", marginTop: 6 }}>
              {totalAtivos === 0
                ? "Todas as verificações passaram. Execute novamente para atualizar."
                : "Tente ajustar os filtros acima."}
            </div>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {alertasFiltrados.map(a => {
              const resolved = !!a.resolved_at;
              const acked = !!a.acknowledged_at;
              return (
                <div
                  key={a.id}
                  style={{
                    background: resolved ? "#F9FAFB" : SEV_BG[a.severidade],
                    border: `0.5px solid ${resolved ? "#DDE2EE" : SEV_COR[a.severidade]}`,
                    borderLeft: `4px solid ${resolved ? "#ccc" : SEV_COR[a.severidade]}`,
                    borderRadius: 10, padding: "14px 16px",
                    opacity: resolved ? 0.65 : 1,
                  }}
                >
                  <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
                    <div style={{ flexShrink: 0, marginTop: 1 }}>
                      <span style={{ fontSize: 20 }}>{CAT_ICONE[a.categoria]}</span>
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", gap: 8, marginBottom: 4, flexWrap: "wrap", alignItems: "center" }}>
                        <span style={{
                          fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.5px",
                          background: resolved ? "#ccc" : SEV_COR[a.severidade],
                          color: "#fff", padding: "2px 7px", borderRadius: 99,
                        }}>
                          {resolved ? "Resolvido" : SEV_LABEL[a.severidade]}
                        </span>
                        <span style={{
                          fontSize: 10, background: "#F4F6FA", border: "0.5px solid #DDE2EE",
                          color: "#555", padding: "2px 7px", borderRadius: 99,
                        }}>
                          {a.categoria}
                        </span>
                        {acked && !resolved && (
                          <span style={{ fontSize: 10, color: "#16A34A" }}>✓ Reconhecido</span>
                        )}
                      </div>

                      <div style={{ fontSize: 14, fontWeight: 600, color: "#1a1a1a", marginBottom: 4 }}>{a.titulo}</div>
                      <div style={{ fontSize: 13, color: "#555", lineHeight: 1.5 }}>{a.descricao}</div>

                      {a.suggested_action && (
                        <div style={{ marginTop: 8, padding: "6px 10px", background: "rgba(255,255,255,0.7)", borderRadius: 6, fontSize: 12, color: "#333" }}>
                          <strong>Ação sugerida:</strong> {a.suggested_action}
                        </div>
                      )}

                      <div style={{ marginTop: 8, fontSize: 11, color: "#aaa" }}>
                        Detectado em {a.first_seen_at ? new Date(a.first_seen_at).toLocaleString("pt-BR") : "—"}
                        {a.acknowledged_at && ` · Reconhecido em ${new Date(a.acknowledged_at).toLocaleString("pt-BR")}`}
                        {a.resolved_at && ` · Resolvido em ${new Date(a.resolved_at).toLocaleString("pt-BR")}`}
                      </div>
                    </div>

                    {!resolved && (
                      <div style={{ display: "flex", gap: 6, flexShrink: 0, flexDirection: "column", alignItems: "flex-end" }}>
                        {!acked && (
                          <button
                            onClick={() => ackAlerta(a.id)}
                            style={{
                              background: "#fff", border: "0.5px solid #DDE2EE", borderRadius: 6,
                              padding: "5px 10px", fontSize: 11, color: "#555", cursor: "pointer",
                              whiteSpace: "nowrap",
                            }}
                          >
                            Reconhecer
                          </button>
                        )}
                        <button
                          onClick={() => fecharAlerta(a.id)}
                          style={{
                            background: "#16A34A", border: "none", borderRadius: 6,
                            padding: "5px 10px", fontSize: 11, color: "#fff", cursor: "pointer",
                            whiteSpace: "nowrap",
                          }}
                        >
                          Resolver ✓
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Info */}
        <div style={{ marginTop: 20, background: "#fff", borderRadius: 10, border: "0.5px solid #DDE2EE", padding: 16 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: "#888", marginBottom: 8 }}>VERIFICAÇÕES DISPONÍVEIS</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 8 }}>
            {[
              { cat: "Fiscal", checks: ["NF-e sem autorização", "Certificado A1 vencendo", "Notas em rejeição"] },
              { cat: "Financeiro", checks: ["CP vencidas sem baixa", "CR em atraso", "Saldo bancário divergente"] },
              { cat: "Contratos", checks: ["Contrato sem embarque 30 dias", "Prazo expirado", "Saldo negativo de grãos"] },
              { cat: "Lavoura", checks: ["Ciclo sem operação 20 dias", "Talhão sem ciclo ativo"] },
              { cat: "Arrendamentos", checks: ["Parcela vencendo em 15 dias"] },
              { cat: "Estoque", checks: ["Produto abaixo do mínimo", "NF entrada sem conferência"] },
            ].map(grupo => (
              <div key={grupo.cat} style={{ background: "#F4F6FA", borderRadius: 8, padding: "10px 12px" }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: "#1A4870", marginBottom: 4 }}>
                  {CAT_ICONE[grupo.cat as Categoria]} {grupo.cat}
                </div>
                {grupo.checks.map(c => (
                  <div key={c} style={{ fontSize: 11, color: "#666", padding: "1px 0" }}>• {c}</div>
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Verificações do Controller ───────────────────────────────
async function rodarChecks(fazenda_id: string) {
  const { supabase } = await import("@/lib/supabase");
  const hoje = new Date();

  // ── Fiscal: Certificado A1 ──────────────────────────────
  try {
    const { data: config } = await supabase
      .from("configuracoes_modulo")
      .select("valor")
      .eq("fazenda_id", fazenda_id)
      .eq("modulo", "fiscal")
      .single();
    const cert = config?.valor?.cert_validade;
    if (cert) {
      const venc = new Date(cert);
      const dias = Math.ceil((venc.getTime() - hoje.getTime()) / 86400000);
      if (dias <= 30) {
        await upsertAlertaController({
          fazenda_id,
          categoria: "Fiscal",
          severidade: dias <= 7 ? "critico" : dias <= 15 ? "alto" : "medio",
          titulo: "Certificado A1 vencendo",
          descricao: `O certificado digital A1 vence em ${dias} dias (${venc.toLocaleDateString("pt-BR")}). Sem certificado válido, não é possível emitir NF-e.`,
          suggested_action: "Renove o certificado A1 junto à Autoridade Certificadora (AC).",
          check_key: "fiscal_cert_a1_vencimento",
          affected_id: fazenda_id,
          resolved_at: undefined,
          acknowledged_at: undefined,
          acknowledged_by: undefined,
        });
      }
    }
  } catch (_) { /* configuraçõe não encontrada */ }

  // ── Financeiro: CP vencidas ─────────────────────────────
  try {
    const { data: cps } = await supabase
      .from("lancamentos")
      .select("id, descricao, valor, vencimento")
      .eq("fazenda_id", fazenda_id)
      .eq("tipo", "debito")
      .eq("status", "previsto")
      .lt("vencimento", hoje.toISOString().slice(0, 10));

    if (cps && cps.length > 0) {
      const total = cps.reduce((s: number, l: { valor: number }) => s + (l.valor ?? 0), 0);
      await upsertAlertaController({
        fazenda_id,
        categoria: "Financeiro",
        severidade: cps.length > 3 ? "critico" : "alto",
        titulo: `${cps.length} conta${cps.length > 1 ? "s" : ""} a pagar vencida${cps.length > 1 ? "s" : ""}`,
        descricao: `Existem ${cps.length} lançamentos de débito vencidos sem baixa, totalizando R$ ${total.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}.`,
        suggested_action: "Acesse Financeiro → Contas a Pagar para registrar as baixas.",
        check_key: "financeiro_cp_vencidas",
        affected_id: fazenda_id,
        resolved_at: undefined,
        acknowledged_at: undefined,
        acknowledged_by: undefined,
      });
    }
  } catch (_) { /* tabela não encontrada */ }

  // ── Financeiro: CR vencidas ─────────────────────────────
  try {
    const { data: crs } = await supabase
      .from("lancamentos")
      .select("id, descricao, valor, vencimento")
      .eq("fazenda_id", fazenda_id)
      .eq("tipo", "credito")
      .eq("status", "previsto")
      .lt("vencimento", hoje.toISOString().slice(0, 10));

    if (crs && crs.length > 0) {
      const total = crs.reduce((s: number, l: { valor: number }) => s + (l.valor ?? 0), 0);
      await upsertAlertaController({
        fazenda_id,
        categoria: "Financeiro",
        severidade: "medio",
        titulo: `${crs.length} conta${crs.length > 1 ? "s" : ""} a receber vencida${crs.length > 1 ? "s" : ""}`,
        descricao: `Existem ${crs.length} recebíveis vencidos sem baixa, totalizando R$ ${total.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}.`,
        suggested_action: "Acesse Financeiro → Contas a Receber e verifique cada lançamento.",
        check_key: "financeiro_cr_vencidas",
        affected_id: fazenda_id,
        resolved_at: undefined,
        acknowledged_at: undefined,
        acknowledged_by: undefined,
      });
    }
  } catch (_) { /* ignora */ }

  // ── Arrendamentos: parcelas vencendo em 15 dias ─────────
  try {
    const em15 = new Date(hoje.getTime() + 15 * 86400000).toISOString().slice(0, 10);
    const { data: parcs } = await supabase
      .from("arrendamento_pagamentos")
      .select("id, arrendamento_id, vencimento, valor")
      .eq("fazenda_id", fazenda_id)
      .eq("status", "previsto")
      .lte("vencimento", em15)
      .gte("vencimento", hoje.toISOString().slice(0, 10));

    if (parcs && parcs.length > 0) {
      await upsertAlertaController({
        fazenda_id,
        categoria: "Arrendamentos",
        severidade: "medio",
        titulo: `${parcs.length} parcela${parcs.length > 1 ? "s" : ""} de arrendamento vencendo`,
        descricao: `Há ${parcs.length} parcela${parcs.length > 1 ? "s" : ""} de arrendamento vencendo nos próximos 15 dias.`,
        suggested_action: "Acesse Comercial → Contratos de Arrendamento → aba Pagamentos.",
        check_key: "arrendamentos_parcelas_vencendo",
        affected_id: fazenda_id,
        resolved_at: undefined,
        acknowledged_at: undefined,
        acknowledged_by: undefined,
      });
    }
  } catch (_) { /* ignora */ }

  // ── Estoque: produtos abaixo do mínimo ──────────────────
  try {
    const { data: prods } = await supabase
      .from("insumos")
      .select("id, nome, estoque_atual, estoque_minimo")
      .eq("fazenda_id", fazenda_id)
      .not("estoque_minimo", "is", null);

    const abaixo = (prods ?? []).filter((p: { estoque_atual: number; estoque_minimo: number }) =>
      p.estoque_atual !== null && p.estoque_minimo !== null && p.estoque_atual < p.estoque_minimo
    );
    if (abaixo.length > 0) {
      await upsertAlertaController({
        fazenda_id,
        categoria: "Estoque",
        severidade: "medio",
        titulo: `${abaixo.length} produto${abaixo.length > 1 ? "s" : ""} abaixo do estoque mínimo`,
        descricao: `Os seguintes produtos estão abaixo do mínimo: ${abaixo.slice(0, 3).map((p: { nome: string }) => p.nome).join(", ")}${abaixo.length > 3 ? ` e mais ${abaixo.length - 3}` : ""}.`,
        suggested_action: "Acesse Estoque → Posição para ver a lista completa e crie pedidos de compra.",
        check_key: "estoque_abaixo_minimo",
        affected_id: fazenda_id,
        resolved_at: undefined,
        acknowledged_at: undefined,
        acknowledged_by: undefined,
      });
    }
  } catch (_) { /* ignora */ }
}
