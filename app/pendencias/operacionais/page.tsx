"use client";
import { useState, useEffect, useCallback } from "react";
import TopNav from "../../../components/TopNav";
import { useAuth } from "../../../components/AuthProvider";
import { listarPendenciasOperacionais, cancelarPendenciaOperacional, type PendenciaRow } from "../../../lib/db";
import { supabase } from "../../../lib/supabase";

type Insumo = { id: string; nome: string; unidade: string; estoque: number; custo_medio: number };

const subtipoLabel: Record<string, string> = {
  pulverizacao:  "Pulverização",
  adubacao:      "Adubação",
  plantio:       "Plantio",
  correcao_solo: "Correção de Solo",
};

const subtipoIcon: Record<string, string> = {
  pulverizacao:  "💧",
  adubacao:      "🌱",
  plantio:       "🌾",
  correcao_solo: "🪨",
};

function fmtData(iso?: string) {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function fmtDataCurta(val?: unknown) {
  if (!val) return "—";
  const s = String(val);
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
    const [y, m, d] = s.split("T")[0].split("-");
    return `${d}/${m}/${y}`;
  }
  return s;
}

export default function PendenciasOperacionais() {
  const { fazendaId } = useAuth() as { fazendaId: string };

  const [pendencias,    setPendencias]    = useState<PendenciaRow[]>([]);
  const [loading,       setLoading]       = useState(true);
  const [filtroStatus,  setFiltroStatus]  = useState<"todos" | "pendente" | "resolvida" | "cancelada">("pendente");
  const [filtroTipo,    setFiltroTipo]    = useState("todos");

  // Modal de resolução
  const [modal,         setModal]         = useState<PendenciaRow | null>(null);
  const [insumos,       setInsumos]       = useState<Insumo[]>([]);
  const [insumoSel,     setInsumoSel]     = useState("");
  const [buscaInsumo,   setBuscaInsumo]   = useState("");
  const [resolving,     setResolving]     = useState(false);
  const [msgModal,      setMsgModal]      = useState<{ ok: boolean; texto: string } | null>(null);

  // Modal de cancelamento
  const [cancelId,      setCancelId]      = useState<string | null>(null);
  const [canceling,     setCanceling]     = useState(false);

  const carregar = useCallback(async () => {
    if (!fazendaId) return;
    setLoading(true);
    try {
      const rows = await listarPendenciasOperacionais(fazendaId);
      setPendencias(rows);
    } finally {
      setLoading(false);
    }
  }, [fazendaId]);

  useEffect(() => { carregar(); }, [carregar]);

  // Carrega insumos quando abre modal
  useEffect(() => {
    if (!modal || !fazendaId) return;
    setInsumoSel("");
    setBuscaInsumo(modal.produto_nome_pendente ?? "");
    setMsgModal(null);
    supabase.from("insumos").select("id, nome, unidade, estoque, custo_medio")
      .eq("fazenda_id", fazendaId).order("nome")
      .then(({ data }) => setInsumos((data ?? []) as Insumo[]));
  }, [modal, fazendaId]);

  const insumosFiltrados = buscaInsumo.trim()
    ? insumos.filter(i => i.nome.toLowerCase().includes(buscaInsumo.toLowerCase()))
    : insumos;

  async function confirmarResolucao() {
    if (!modal || !insumoSel || !fazendaId) return;
    setResolving(true);
    setMsgModal(null);
    try {
      const res = await fetch("/api/pendencias/reprocessar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pendenciaId: modal.id, insumoId: insumoSel, fazendaId }),
      });
      const json = await res.json();
      if (json.ok) {
        setMsgModal({ ok: true, texto: json.mensagem ?? "Pendência resolvida com sucesso!" });
        await carregar();
        setTimeout(() => { setModal(null); setMsgModal(null); }, 2000);
      } else {
        setMsgModal({ ok: false, texto: json.mensagem ?? "Erro ao reprocessar." });
      }
    } catch (e) {
      setMsgModal({ ok: false, texto: `Erro: ${String(e)}` });
    } finally {
      setResolving(false);
    }
  }

  async function confirmarCancelamento() {
    if (!cancelId) return;
    setCanceling(true);
    try {
      await cancelarPendenciaOperacional(cancelId);
      await carregar();
      setCancelId(null);
    } finally {
      setCanceling(false);
    }
  }

  const pendenciasFiltradas = pendencias.filter(p => {
    if (filtroStatus !== "todos" && p.status !== filtroStatus) return false;
    if (filtroTipo !== "todos" && p.subtipo !== filtroTipo) return false;
    return true;
  });

  const cntPendente  = pendencias.filter(p => p.status === "pendente").length;
  const cntResolvida = pendencias.filter(p => p.status === "resolvida").length;

  const statusBadge = (s: string) => {
    if (s === "pendente")   return { bg: "#FEF3C7", color: "#92400E", label: "Pendente" };
    if (s === "resolvida")  return { bg: "#D1FAE5", color: "#065F46", label: "Resolvida" };
    if (s === "cancelada")  return { bg: "#F3F4F6", color: "#6B7280", label: "Cancelada" };
    return { bg: "#F3F4F6", color: "#666", label: s };
  };

  const dadosOriginais = (p: PendenciaRow) => p.dados_originais ?? {};

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh", background: "#F4F6FA", fontFamily: "system-ui, sans-serif" }}>
      <TopNav />

      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "28px 20px", width: "100%" }}>

        {/* Cabeçalho */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: "#1a1a1a" }}>Pendências Operacionais</h1>
            <p style={{ margin: "4px 0 0", fontSize: 13, color: "#666" }}>
              Operações registradas pelo WhatsApp que precisam de vinculação de insumo
            </p>
          </div>
          <button
            onClick={carregar}
            style={{ background: "#1A5C38", color: "#fff", border: "none", borderRadius: 8, padding: "8px 16px", fontSize: 13, cursor: "pointer", fontWeight: 600 }}
          >
            Atualizar
          </button>
        </div>

        {/* KPIs */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginBottom: 20 }}>
          {[
            { label: "Pendentes",  value: cntPendente,  bg: "#FEF3C7", color: "#92400E", border: "#FCD34D" },
            { label: "Resolvidas", value: cntResolvida, bg: "#D1FAE5", color: "#065F46", border: "#6EE7B7" },
            { label: "Total",      value: pendencias.length, bg: "#EFF6FF", color: "#1D4ED8", border: "#BFDBFE" },
          ].map(k => (
            <div key={k.label} style={{ background: k.bg, border: `0.5px solid ${k.border}`, borderRadius: 10, padding: "14px 18px" }}>
              <div style={{ fontSize: 11, color: k.color, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4 }}>{k.label}</div>
              <div style={{ fontSize: 28, fontWeight: 700, color: k.color }}>{k.value}</div>
            </div>
          ))}
        </div>

        {/* Filtros */}
        <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
          {(["todos", "pendente", "resolvida", "cancelada"] as const).map(s => (
            <button
              key={s}
              onClick={() => setFiltroStatus(s)}
              style={{
                border: "0.5px solid", borderRadius: 6, padding: "5px 14px", fontSize: 12, cursor: "pointer", fontWeight: 600,
                background: filtroStatus === s ? "#1A5C38" : "#fff",
                color:      filtroStatus === s ? "#fff" : "#555",
                borderColor: filtroStatus === s ? "#1A5C38" : "#D4DCE8",
              }}
            >
              {s === "todos" ? "Todos" : s === "pendente" ? "Pendentes" : s === "resolvida" ? "Resolvidas" : "Canceladas"}
            </button>
          ))}
          <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 12, color: "#666" }}>Tipo:</span>
            <select
              value={filtroTipo}
              onChange={e => setFiltroTipo(e.target.value)}
              style={{ border: "0.5px solid #D4DCE8", borderRadius: 6, padding: "5px 10px", fontSize: 12, background: "#fff", color: "#333" }}
            >
              <option value="todos">Todos</option>
              {Object.entries(subtipoLabel).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Lista */}
        {loading ? (
          <div style={{ textAlign: "center", padding: "60px 0", color: "#888", fontSize: 14 }}>Carregando...</div>
        ) : pendenciasFiltradas.length === 0 ? (
          <div style={{ textAlign: "center", padding: "60px 0", background: "#fff", borderRadius: 12, border: "0.5px solid #D4DCE8" }}>
            <div style={{ fontSize: 36, marginBottom: 12 }}>✅</div>
            <div style={{ fontSize: 15, fontWeight: 600, color: "#1a1a1a" }}>Sem pendências!</div>
            <div style={{ fontSize: 13, color: "#888", marginTop: 4 }}>
              {filtroStatus === "pendente" ? "Todas as operações foram resolvidas." : "Nenhum registro encontrado com estes filtros."}
            </div>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {pendenciasFiltradas.map(p => {
              const badge = statusBadge(p.status);
              const dados = dadosOriginais(p);
              const icone = subtipoIcon[p.subtipo ?? ""] ?? "📋";
              const label = subtipoLabel[p.subtipo ?? ""] ?? p.subtipo ?? "Operação";
              return (
                <div
                  key={p.id}
                  style={{
                    background: "#fff", border: "0.5px solid #D4DCE8", borderRadius: 12,
                    padding: "16px 20px", display: "flex", alignItems: "flex-start", gap: 16,
                    borderLeft: p.status === "pendente" ? "4px solid #F59E0B" : p.status === "resolvida" ? "4px solid #10B981" : "4px solid #D4DCE8",
                  }}
                >
                  {/* Ícone */}
                  <div style={{ fontSize: 28, flexShrink: 0, paddingTop: 2 }}>{icone}</div>

                  {/* Conteúdo */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6, flexWrap: "wrap" }}>
                      <span style={{ fontWeight: 700, fontSize: 14, color: "#1a1a1a" }}>{label}</span>
                      <span style={{ background: badge.bg, color: badge.color, borderRadius: 20, padding: "2px 10px", fontSize: 11, fontWeight: 700 }}>
                        {badge.label}
                      </span>
                      <span style={{ fontSize: 11, color: "#888", marginLeft: "auto" }}>{fmtData(p.criado_em)}</span>
                    </div>

                    {/* Produto pendente */}
                    {p.produto_nome_pendente && (
                      <div style={{ fontSize: 13, color: "#444", marginBottom: 4 }}>
                        <span style={{ color: "#888" }}>Produto informado: </span>
                        <span style={{ fontWeight: 600, color: "#92400E" }}>"{p.produto_nome_pendente}"</span>
                        <span style={{ fontSize: 11, color: "#888", marginLeft: 6 }}>não encontrado no cadastro</span>
                      </div>
                    )}

                    {/* Talhão */}
                    {p.talhao_nome_pendente && (
                      <div style={{ fontSize: 12, color: "#666", marginBottom: 4 }}>
                        <span style={{ color: "#aaa" }}>Talhão: </span>{p.talhao_nome_pendente}
                      </div>
                    )}

                    {/* Dados originais resumidos */}
                    <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginTop: 6 }}>
                      {!!dados.data_op && (
                        <span style={{ fontSize: 11, color: "#555" }}>
                          <span style={{ color: "#aaa" }}>Data: </span>{fmtDataCurta(String(dados.data_op))}
                        </span>
                      )}
                      {!!dados.area_ha && (
                        <span style={{ fontSize: 11, color: "#555" }}>
                          <span style={{ color: "#aaa" }}>Área: </span>{Number(dados.area_ha as number).toLocaleString("pt-BR")} ha
                        </span>
                      )}
                      {!!dados.dose && (
                        <span style={{ fontSize: 11, color: "#555" }}>
                          <span style={{ color: "#aaa" }}>Dose: </span>{String(dados.dose)} {String(dados.unidade ?? "")}
                        </span>
                      )}
                      {!!dados.safra && (
                        <span style={{ fontSize: 11, color: "#555" }}>
                          <span style={{ color: "#aaa" }}>Safra: </span>{String(dados.safra)}
                        </span>
                      )}
                    </div>

                    {/* Se resolvida: mostra info de resolução */}
                    {p.status === "resolvida" && p.resolvido_em && (
                      <div style={{ marginTop: 8, fontSize: 12, color: "#065F46", background: "#D1FAE5", borderRadius: 6, padding: "4px 10px", display: "inline-block" }}>
                        Resolvida em {fmtData(p.resolvido_em)}
                      </div>
                    )}
                  </div>

                  {/* Ações */}
                  <div style={{ display: "flex", flexDirection: "column", gap: 6, flexShrink: 0 }}>
                    {p.status === "pendente" && (
                      <>
                        <button
                          onClick={() => setModal(p)}
                          style={{
                            background: "#1A5C38", color: "#fff", border: "none",
                            borderRadius: 7, padding: "7px 16px", fontSize: 12,
                            cursor: "pointer", fontWeight: 700, whiteSpace: "nowrap",
                          }}
                        >
                          Resolver
                        </button>
                        <button
                          onClick={() => setCancelId(p.id)}
                          style={{
                            background: "none", color: "#E24B4A", border: "0.5px solid #E24B4A",
                            borderRadius: 7, padding: "6px 16px", fontSize: 12,
                            cursor: "pointer", fontWeight: 600, whiteSpace: "nowrap",
                          }}
                        >
                          Cancelar
                        </button>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Modal: Resolver Pendência ── */}
      {modal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
          <div style={{ background: "#fff", borderRadius: 14, width: "100%", maxWidth: 560, padding: "28px 28px 24px", boxShadow: "0 20px 60px rgba(0,0,0,0.22)" }}>

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
              <div>
                <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: "#1a1a1a" }}>
                  {subtipoIcon[modal.subtipo ?? ""]} Resolver Pendência — {subtipoLabel[modal.subtipo ?? ""] ?? modal.subtipo}
                </h2>
                <p style={{ margin: "4px 0 0", fontSize: 12, color: "#666" }}>
                  Vincule o insumo correto para reprocessar a operação completa.
                </p>
              </div>
              <button onClick={() => setModal(null)} style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer", color: "#888", padding: "0 4px" }}>×</button>
            </div>

            {/* Resumo da pendência */}
            <div style={{ background: "#FEF9E7", border: "0.5px solid #FCD34D", borderRadius: 10, padding: "12px 16px", marginBottom: 20 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: "#92400E", marginBottom: 8 }}>Dados originais da operação</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px 16px" }}>
                {[
                  ["Produto informado", modal.produto_nome_pendente ?? "—"],
                  ["Talhão", modal.talhao_nome_pendente ?? "—"],
                  ["Data", fmtDataCurta(modal.dados_originais?.data_op)],
                  ["Área", modal.dados_originais?.area_ha ? `${modal.dados_originais.area_ha} ha` : "—"],
                  ["Dose", modal.dados_originais?.dose ? `${modal.dados_originais.dose} ${modal.dados_originais?.unidade ?? ""}` : "—"],
                  ["Safra", String(modal.dados_originais?.safra ?? "—")],
                ].map(([k, v]) => (
                  <div key={k}>
                    <span style={{ fontSize: 11, color: "#888" }}>{k}: </span>
                    <span style={{ fontSize: 12, fontWeight: 600, color: "#333" }}>{v}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Busca de insumo */}
            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: "#444", display: "block", marginBottom: 6 }}>
                Buscar insumo correto
              </label>
              <input
                type="text"
                value={buscaInsumo}
                onChange={e => { setBuscaInsumo(e.target.value); setInsumoSel(""); }}
                placeholder="Digite o nome do insumo..."
                style={{ width: "100%", border: "0.5px solid #D4DCE8", borderRadius: 8, padding: "9px 12px", fontSize: 13, outline: "none", boxSizing: "border-box" }}
              />
            </div>

            {/* Lista de insumos filtrados */}
            <div style={{ maxHeight: 220, overflowY: "auto", border: "0.5px solid #D4DCE8", borderRadius: 8, marginBottom: 16 }}>
              {insumosFiltrados.length === 0 ? (
                <div style={{ padding: "16px", textAlign: "center", fontSize: 13, color: "#888" }}>
                  Nenhum insumo encontrado
                </div>
              ) : (
                insumosFiltrados.map(ins => {
                  const sel = insumoSel === ins.id;
                  return (
                    <div
                      key={ins.id}
                      onClick={() => setInsumoSel(ins.id)}
                      style={{
                        display: "flex", alignItems: "center", justifyContent: "space-between",
                        padding: "10px 14px", cursor: "pointer",
                        background: sel ? "#D5E8F5" : "transparent",
                        borderLeft: sel ? "3px solid #1A4870" : "3px solid transparent",
                        borderBottom: "0.5px solid #EEF1F6",
                      }}
                    >
                      <div>
                        <div style={{ fontSize: 13, fontWeight: sel ? 700 : 500, color: "#1a1a1a" }}>{ins.nome}</div>
                        <div style={{ fontSize: 11, color: "#888", marginTop: 1 }}>
                          Unidade: {ins.unidade} · Estoque: {Number(ins.estoque ?? 0).toLocaleString("pt-BR")} · Custo médio: R$ {Number(ins.custo_medio ?? 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                        </div>
                      </div>
                      {sel && <span style={{ fontSize: 14, color: "#1A4870" }}>✓</span>}
                    </div>
                  );
                })
              )}
            </div>

            {/* O que vai acontecer */}
            {insumoSel && (
              <div style={{ background: "#EFF6FF", border: "0.5px solid #BFDBFE", borderRadius: 8, padding: "10px 14px", marginBottom: 16, fontSize: 12, color: "#1D4ED8" }}>
                <div style={{ fontWeight: 700, marginBottom: 4 }}>Ao confirmar, o sistema vai:</div>
                <ul style={{ margin: "0 0 0 16px", padding: 0, lineHeight: 1.8 }}>
                  <li>Inserir o item na operação original ({subtipoLabel[modal.subtipo ?? ""] ?? modal.subtipo})</li>
                  <li>Baixar o estoque do insumo selecionado</li>
                  <li>Registrar movimentação de saída</li>
                  <li>Criar lançamento de Contas a Pagar</li>
                  <li>Marcar esta pendência como Resolvida</li>
                </ul>
              </div>
            )}

            {/* Feedback */}
            {msgModal && (
              <div style={{
                borderRadius: 8, padding: "10px 14px", marginBottom: 14, fontSize: 13, fontWeight: 600,
                background: msgModal.ok ? "#D1FAE5" : "#FEE2E2",
                color: msgModal.ok ? "#065F46" : "#991B1B",
                border: `0.5px solid ${msgModal.ok ? "#6EE7B7" : "#FCA5A5"}`,
              }}>
                {msgModal.ok ? "✅ " : "❌ "}{msgModal.texto}
              </div>
            )}

            {/* Botões */}
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <button
                onClick={() => setModal(null)}
                disabled={resolving}
                style={{ background: "none", border: "0.5px solid #D4DCE8", borderRadius: 8, padding: "9px 20px", fontSize: 13, cursor: "pointer", color: "#555" }}
              >
                Fechar
              </button>
              <button
                onClick={confirmarResolucao}
                disabled={!insumoSel || resolving}
                style={{
                  background: insumoSel && !resolving ? "#1A5C38" : "#ccc",
                  color: "#fff", border: "none", borderRadius: 8, padding: "9px 24px",
                  fontSize: 13, cursor: insumoSel && !resolving ? "pointer" : "not-allowed",
                  fontWeight: 700,
                }}
              >
                {resolving ? "Processando..." : "Confirmar e Reprocessar"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal: Confirmar Cancelamento ── */}
      {cancelId && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
          <div style={{ background: "#fff", borderRadius: 14, width: "100%", maxWidth: 420, padding: "28px", boxShadow: "0 20px 60px rgba(0,0,0,0.22)" }}>
            <h2 style={{ margin: "0 0 10px", fontSize: 16, fontWeight: 700, color: "#1a1a1a" }}>Cancelar pendência?</h2>
            <p style={{ margin: "0 0 20px", fontSize: 13, color: "#555", lineHeight: 1.6 }}>
              A operação continuará registrada mas sem o item de insumo. O custo e o estoque <strong>não</strong> serão afetados. Esta ação não pode ser desfeita.
            </p>
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <button
                onClick={() => setCancelId(null)}
                disabled={canceling}
                style={{ background: "none", border: "0.5px solid #D4DCE8", borderRadius: 8, padding: "8px 18px", fontSize: 13, cursor: "pointer" }}
              >
                Não cancelar
              </button>
              <button
                onClick={confirmarCancelamento}
                disabled={canceling}
                style={{ background: "#E24B4A", color: "#fff", border: "none", borderRadius: 8, padding: "8px 18px", fontSize: 13, cursor: "pointer", fontWeight: 700 }}
              >
                {canceling ? "Cancelando..." : "Sim, cancelar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
