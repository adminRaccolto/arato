"use client";
import { useState, useEffect, useCallback } from "react";
import { supabase } from "../../../lib/supabase";
import type { OperacaoGerencial } from "../../../lib/supabase";

// ─── Estilos base ─────────────────────────────────────────────────────────────
const inp: React.CSSProperties = { width: "100%", padding: "8px 10px", border: "0.5px solid #D4DCE8", borderRadius: 8, fontSize: 13, color: "#1a1a1a", background: "#fff", boxSizing: "border-box" };
const lbl: React.CSSProperties = { fontSize: 11, color: "#555", marginBottom: 3, display: "block" };
const card: React.CSSProperties = { background: "#fff", borderRadius: 12, border: "0.5px solid #D4DCE8", overflow: "hidden" };
const btnP: React.CSSProperties = { padding: "8px 18px", background: "#1A4870", color: "#fff", border: "none", borderRadius: 8, fontWeight: 600, cursor: "pointer", fontSize: 13 };
const btnS: React.CSSProperties = { padding: "8px 16px", border: "0.5px solid #D4DCE8", borderRadius: 8, background: "transparent", cursor: "pointer", fontSize: 13, color: "#555" };

// ─── Tipo local ───────────────────────────────────────────────────────────────
type OpTemplate = OperacaoGerencial;

const FORM_VAZIO = (): Partial<OperacaoGerencial> => ({
  classificacao: "", descricao: "", tipo: "despesa", tipo_lcdpr: "",
  inativo: false, informa_complemento: false,
  permite_notas_fiscais: false, permite_cp_cr: false, permite_adiantamentos: false,
  permite_tesouraria: false, permite_baixas: false, permite_custo_produto: false,
  permite_contrato_financeiro: false, permite_estoque: false,
  permite_pedidos_venda: false, permite_manutencao: false,
  marcar_fiscal_padrao: false, permite_energia_eletrica: false,
  gerar_financeiro: false, gerar_financeiro_gerencial: false,
  valida_propriedade: false, custo_absorcao: false, custo_abc: false,
  atualizar_custo_estoque: false, manutencao_reparos: false, gerar_depreciacao: false,
  obs_legal: "", conta_debito: "", conta_credito: "",
  parent_id: undefined,
});

type Fazenda = { id: string; nome: string; municipio?: string };
type ResultadoSync = {
  fazenda_id: string; fazenda_nome: string;
  inseridos: number; atualizados: number; erros: number;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
function depth(classificacao: string) {
  return classificacao.split(".").length - 1;
}
function corTipo(tipo: string) {
  return tipo === "receita"
    ? { bg: "#EAF3DE", color: "#1A5C38", label: "Receita" }
    : { bg: "#FBF3E0", color: "#7A5A12", label: "Despesa" };
}

// ─── Componente ───────────────────────────────────────────────────────────────
export default function PadroesPage() {
  const [templates, setTemplates] = useState<OpTemplate[]>([]);
  const [fazendas,  setFazendas]  = useState<Fazenda[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [busca,     setBusca]     = useState("");
  const [filtroTipo, setFiltroTipo] = useState<"todos" | "receita" | "despesa">("todos");

  // Modal CRUD
  const [modal, setModal]   = useState<"novo" | "editar" | null>(null);
  const [form,  setForm]    = useState<Partial<OperacaoGerencial>>(FORM_VAZIO());
  const [saving, setSaving] = useState(false);
  const [formErr, setFormErr] = useState("");
  const [deletandoId, setDeletandoId] = useState<string | null>(null);

  // Seed padrões
  const [seeding, setSeeding] = useState(false);

  // Painel de sincronização
  const [syncOpen,    setSyncOpen]    = useState(false);
  const [syncSelect,  setSyncSelect]  = useState<Set<string>>(new Set());
  const [syncing,     setSyncing]     = useState(false);
  const [syncResult,  setSyncResult]  = useState<ResultadoSync[] | null>(null);
  const [syncErr,     setSyncErr]     = useState("");
  const [syncBanner,  setSyncBanner]  = useState<string | null>(null);

  // ── Carregar ────────────────────────────────────────────────────────────────
  const carregar = useCallback(async () => {
    setLoading(true);
    const [{ data: tmpl }, contasRes] = await Promise.all([
      supabase.from("operacoes_gerenciais").select("*").is("fazenda_id", null).order("classificacao"),
      // Usa API route com service_role_key para ver fazendas de todos os clientes
      supabase.auth.getSession().then(({ data: { session } }) =>
        fetch("/api/admin/listar-contas", {
          headers: { Authorization: `Bearer ${session?.access_token ?? ""}` },
        }).then(r => r.json()).catch(() => ({ fazendas: [] }))
      ).catch(() => ({ fazendas: [] })),
    ]);
    setTemplates((tmpl ?? []) as OpTemplate[]);
    const todasFazendas = (contasRes?.fazendas ?? []) as Fazenda[];
    // Ordena por nome
    todasFazendas.sort((a, b) => a.nome.localeCompare(b.nome));
    setFazendas(todasFazendas);
    setLoading(false);
  }, []);

  // ── Carregar padrões do sistema ─────────────────────────────────────────────
  async function carregarPadroes() {
    if (!confirm(`Isso vai substituir TODOS os templates atuais (${templates.length} operações) pelo plano padrão do sistema. Continuar?`)) return;
    setSeeding(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token ?? "";
      const res = await fetch("/api/admin/seed-templates", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Erro desconhecido");
      await carregar();
      setSyncBanner(`✓ ${data.inseridos} operações padrão carregadas. Clique em "Sincronizar" para propagar aos clientes.`);
    } catch (e) {
      alert("Erro ao carregar padrões: " + (e instanceof Error ? e.message : String(e)));
    } finally {
      setSeeding(false);
    }
  }

  useEffect(() => { carregar(); }, [carregar]);

  // ── Abrir novo / editar ────────────────────────────────────────────────────
  function abrirNovo() {
    setForm(FORM_VAZIO());
    setFormErr("");
    setModal("novo");
  }
  function abrirEditar(op: OpTemplate) {
    setForm({ ...op });
    setFormErr("");
    setModal("editar");
  }

  // ── Salvar template ─────────────────────────────────────────────────────────
  async function salvar() {
    if (!form.classificacao?.trim()) { setFormErr("Código é obrigatório."); return; }
    if (!form.descricao?.trim())     { setFormErr("Descrição é obrigatória."); return; }
    setSaving(true); setFormErr("");
    try {
      const payload = { ...form, fazenda_id: null };
      if (modal === "editar" && form.id) {
        const { error } = await supabase.from("operacoes_gerenciais").update(payload).eq("id", form.id);
        if (error) throw error;
      } else {
        // Verifica duplicidade de classificacao no template
        const existe = templates.find(t => t.classificacao === form.classificacao?.trim());
        if (existe) { setFormErr(`Código "${form.classificacao}" já existe no template.`); setSaving(false); return; }
        const { error } = await supabase.from("operacoes_gerenciais").insert(payload);
        if (error) throw error;
      }
      await carregar();
      setModal(null);
      setSyncBanner(`✓ Operação ${modal === "novo" ? "criada" : "atualizada"}. Lembre-se de clicar em "Sincronizar" para propagar aos clientes.`);
    } catch (e) {
      setFormErr(e instanceof Error ? e.message : "Erro ao salvar.");
    } finally {
      setSaving(false);
    }
  }

  // ── Excluir template ────────────────────────────────────────────────────────
  async function excluir(id: string) {
    if (!confirm("Excluir esta operação do template? Isso não afeta os clientes que já têm o registro.")) return;
    setDeletandoId(id);
    await supabase.from("operacoes_gerenciais").delete().eq("id", id);
    setDeletandoId(null);
    await carregar();
    setSyncBanner("✓ Operação excluída do template. Lembre-se de clicar em \"Sincronizar\" para propagar a alteração.");
  }

  // ── Sincronizar ─────────────────────────────────────────────────────────────
  async function sincronizar() {
    if (syncSelect.size === 0 && !confirm("Nenhuma fazenda selecionada — sincronizar com TODAS?")) return;
    setSyncing(true); setSyncErr(""); setSyncResult(null);
    try {
      const res = await fetch("/api/admin/sincronizar-padroes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          modulo: "operacoes_gerenciais",
          fazenda_ids: syncSelect.size > 0 ? Array.from(syncSelect) : [],
        }),
      });
      const data = await res.json();
      if (!res.ok || data.erro) throw new Error(data.erro ?? "Erro desconhecido");
      setSyncResult(data.resultados ?? []);
    } catch (e) {
      setSyncErr(e instanceof Error ? e.message : "Erro na sincronização.");
    } finally {
      setSyncing(false);
    }
  }

  // ── Filtro ──────────────────────────────────────────────────────────────────
  const filtrados = templates.filter(t => {
    if (filtroTipo !== "todos" && t.tipo !== filtroTipo) return false;
    if (busca) {
      const b = busca.toLowerCase();
      return t.classificacao.includes(b) || t.descricao.toLowerCase().includes(b);
    }
    return true;
  });

  // ── UI ──────────────────────────────────────────────────────────────────────
  return (
    <div style={{ maxWidth: 1200 }}>

      {/* Cabeçalho */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ fontSize: 20, fontWeight: 700, color: "#1a1a1a" }}>Padrões do Sistema</div>
          <button
            onClick={carregarPadroes}
            disabled={seeding}
            style={{ padding: "8px 18px", background: "#FBF3E0", color: "#7A5A10", border: "0.5px solid #C9921B", borderRadius: 8, fontWeight: 600, cursor: seeding ? "not-allowed" : "pointer", fontSize: 13, opacity: seeding ? 0.6 : 1 }}
          >
            {seeding ? "Carregando…" : "↺ Carregar Plano Padrão"}
          </button>
        </div>
        <div style={{ fontSize: 13, color: "#666", marginTop: 4 }}>
          Cadastros de base que podem ser sincronizados com os clientes. Alterações aqui não afetam clientes automaticamente — use "Sincronizar" para propagar.
        </div>
      </div>

      {/* Banner de aviso de sincronização */}
      {syncBanner && (
        <div style={{ background: "#FBF3E0", border: "0.5px solid #C9921B", borderRadius: 8, padding: "10px 16px", marginBottom: 16, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
          <span style={{ fontSize: 13, color: "#7A5A10", fontWeight: 500 }}>{syncBanner}</span>
          <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
            <button
              onClick={() => { setSyncBanner(null); setSyncSelect(new Set(fazendas.map(f => f.id))); sincronizar(); }}
              style={{ padding: "5px 14px", background: "#C9921B", color: "#fff", border: "none", borderRadius: 6, fontWeight: 600, cursor: "pointer", fontSize: 12 }}
            >
              Sincronizar agora →
            </button>
            <button onClick={() => setSyncBanner(null)} style={{ padding: "5px 10px", border: "0.5px solid #D4DCE8", borderRadius: 6, background: "transparent", cursor: "pointer", fontSize: 12, color: "#666" }}>
              Depois
            </button>
          </div>
        </div>
      )}

      {/* Abas de módulo (por enquanto só Operações Gerenciais) */}
      <div style={{ display: "flex", gap: 4, marginBottom: 20 }}>
        {[{ key: "op_ger", label: "Operações Gerenciais (Plano de Contas)" }].map(m => (
          <div key={m.key} style={{ padding: "8px 18px", borderRadius: 8, background: "#1A4870", color: "#fff", fontSize: 13, fontWeight: 600, cursor: "default" }}>
            {m.label}
          </div>
        ))}
        <div style={{ padding: "8px 18px", borderRadius: 8, border: "0.5px dashed #D4DCE8", color: "#aaa", fontSize: 13, cursor: "default" }}>
          Regras de Classificação — em breve
        </div>
        <div style={{ padding: "8px 18px", borderRadius: 8, border: "0.5px dashed #D4DCE8", color: "#aaa", fontSize: 13, cursor: "default" }}>
          CFOPs — em breve
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 340px", gap: 20, alignItems: "start" }}>

        {/* ── COLUNA ESQUERDA: Template ── */}
        <div>
          {/* Toolbar */}
          <div style={{ display: "flex", gap: 10, marginBottom: 14, alignItems: "center", flexWrap: "wrap" }}>
            <input
              value={busca}
              onChange={e => setBusca(e.target.value)}
              placeholder="Buscar por código ou descrição…"
              style={{ ...inp, maxWidth: 280 }}
            />
            {(["todos","receita","despesa"] as const).map(t => (
              <button key={t} onClick={() => setFiltroTipo(t)} style={{
                padding: "6px 14px", borderRadius: 20, border: "0.5px solid",
                borderColor: filtroTipo === t ? "#1A4870" : "#D4DCE8",
                background: filtroTipo === t ? "#D5E8F5" : "transparent",
                color: filtroTipo === t ? "#0B2D50" : "#666",
                fontWeight: filtroTipo === t ? 600 : 400, fontSize: 12, cursor: "pointer",
              }}>
                {t === "todos" ? `Todos (${templates.length})` : t === "receita" ? `Receitas (${templates.filter(x=>x.tipo==="receita").length})` : `Despesas (${templates.filter(x=>x.tipo==="despesa").length})`}
              </button>
            ))}
            <div style={{ flex: 1 }} />
            <button onClick={abrirNovo} style={{ ...btnP, fontSize: 12, padding: "7px 16px" }}>
              + Nova Operação
            </button>
          </div>

          <div style={card}>
            {loading ? (
              <div style={{ padding: 32, textAlign: "center", color: "#888", fontSize: 13 }}>Carregando…</div>
            ) : filtrados.length === 0 ? (
              <div style={{ padding: 40, textAlign: "center" }}>
                <div style={{ fontSize: 14, color: "#888", marginBottom: 8 }}>Nenhum template cadastrado</div>
                <div style={{ fontSize: 12, color: "#aaa", marginBottom: 16 }}>Crie as operações gerenciais padrão que serão sincronizadas com os clientes.</div>
                <button onClick={abrirNovo} style={btnP}>+ Criar primeira operação</button>
              </div>
            ) : (
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ background: "#F3F6F9" }}>
                    {["Código", "Descrição", "Tipo", "LCDPR", "Débito", "Crédito", ""].map((h, i) => (
                      <th key={i} style={{ padding: "8px 14px", textAlign: i >= 2 ? "center" : "left", fontSize: 10, fontWeight: 600, color: "#555", borderBottom: "0.5px solid #D4DCE8" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtrados.map(op => {
                    const d = depth(op.classificacao);
                    const ct = corTipo(op.tipo);
                    const isGrupo = d === 0;
                    return (
                      <tr key={op.id} style={{ borderBottom: "0.5px solid #F0F2F7", background: isGrupo ? "#F8FAFD" : op.inativo ? "#FAFAFA" : "white" }}>
                        <td style={{ padding: "7px 14px", fontFamily: "monospace", fontSize: 12, color: "#1a1a1a", whiteSpace: "nowrap" }}>
                          {op.classificacao}
                        </td>
                        <td style={{ padding: "7px 14px", maxWidth: 280 }}>
                          <span style={{ paddingLeft: d * 12, fontSize: isGrupo ? 13 : 12, fontWeight: isGrupo ? 700 : 400, color: op.inativo ? "#999" : "#1a1a1a" }}>
                            {op.descricao}
                          </span>
                          {op.inativo && <span style={{ marginLeft: 6, fontSize: 9, background: "#F3F3F3", color: "#999", padding: "1px 5px", borderRadius: 4 }}>INATIVO</span>}
                        </td>
                        <td style={{ padding: "7px 14px", textAlign: "center" }}>
                          <span style={{ fontSize: 10, background: ct.bg, color: ct.color, padding: "2px 8px", borderRadius: 8, fontWeight: 600 }}>{ct.label}</span>
                        </td>
                        <td style={{ padding: "7px 14px", textAlign: "center", fontSize: 11, color: "#666" }}>
                          {op.tipo_lcdpr || "—"}
                        </td>
                        <td style={{ padding: "7px 14px", textAlign: "center", fontFamily: "monospace", fontSize: 11, color: "#555" }}>
                          {op.conta_debito || "—"}
                        </td>
                        <td style={{ padding: "7px 14px", textAlign: "center", fontFamily: "monospace", fontSize: 11, color: "#555" }}>
                          {op.conta_credito || "—"}
                        </td>
                        <td style={{ padding: "7px 10px", textAlign: "right", whiteSpace: "nowrap" }}>
                          <button onClick={() => abrirEditar(op)} style={{ fontSize: 11, padding: "3px 10px", border: "0.5px solid #D4DCE8", borderRadius: 6, background: "transparent", color: "#555", cursor: "pointer", marginRight: 4 }}>
                            Editar
                          </button>
                          <button
                            onClick={() => excluir(op.id)}
                            disabled={deletandoId === op.id}
                            style={{ fontSize: 11, padding: "3px 8px", border: "0.5px solid #E24B4A50", borderRadius: 6, background: "transparent", color: "#E24B4A", cursor: "pointer" }}
                          >
                            ✕
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>

          {/* Nota sobre templates */}
          {templates.length > 0 && (
            <div style={{ marginTop: 12, padding: "10px 14px", background: "#F4F6FA", borderRadius: 8, fontSize: 11, color: "#666" }}>
              <strong style={{ color: "#1A4870" }}>{templates.length}</strong> operações no template.
              Clientes com operações próprias de mesmo código terão <strong>todos os campos atualizados</strong> na próxima sincronização (modo Merge).
              Operações que o cliente criou com códigos diferentes não são afetadas.
            </div>
          )}
        </div>

        {/* ── COLUNA DIREITA: Sincronização ── */}
        <div style={{ position: "sticky", top: 80 }}>
          <div style={{ ...card, border: "0.5px solid #1A4870" }}>
            <div style={{ padding: "14px 16px", borderBottom: "0.5px solid #D4DCE8", background: "#F0F5FA" }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: "#1A4870" }}>Sincronizar com Clientes</div>
              <div style={{ fontSize: 11, color: "#666", marginTop: 3 }}>
                Modo: <strong>Merge</strong> — adiciona novos e atualiza existentes. Nunca remove.
              </div>
            </div>

            <div style={{ padding: 16 }}>
              {/* Selecionar fazendas */}
              <div style={{ marginBottom: 12 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                  <label style={{ fontSize: 12, fontWeight: 600, color: "#1a1a1a" }}>
                    Fazendas ({fazendas.length})
                  </label>
                  <div style={{ display: "flex", gap: 6 }}>
                    <button
                      onClick={() => setSyncSelect(new Set(fazendas.map(f => f.id)))}
                      style={{ fontSize: 10, padding: "2px 8px", border: "0.5px solid #D4DCE8", borderRadius: 5, background: "transparent", cursor: "pointer", color: "#555" }}
                    >
                      Todas
                    </button>
                    <button
                      onClick={() => setSyncSelect(new Set())}
                      style={{ fontSize: 10, padding: "2px 8px", border: "0.5px solid #D4DCE8", borderRadius: 5, background: "transparent", cursor: "pointer", color: "#555" }}
                    >
                      Limpar
                    </button>
                  </div>
                </div>
                <div style={{ maxHeight: 220, overflowY: "auto", border: "0.5px solid #D4DCE8", borderRadius: 8 }}>
                  {fazendas.length === 0 ? (
                    <div style={{ padding: 16, textAlign: "center", fontSize: 12, color: "#888" }}>Nenhuma fazenda encontrada</div>
                  ) : fazendas.map(f => (
                    <label key={f.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 12px", cursor: "pointer", borderBottom: "0.5px solid #F0F2F7", background: syncSelect.has(f.id) ? "#EEF5FD" : "transparent" }}>
                      <input
                        type="checkbox"
                        checked={syncSelect.has(f.id)}
                        onChange={e => {
                          const s = new Set(syncSelect);
                          if (e.target.checked) s.add(f.id); else s.delete(f.id);
                          setSyncSelect(s);
                        }}
                        style={{ accentColor: "#1A4870" }}
                      />
                      <div>
                        <div style={{ fontSize: 12, fontWeight: syncSelect.has(f.id) ? 600 : 400, color: "#1a1a1a" }}>{f.nome}</div>
                        {f.municipio && <div style={{ fontSize: 10, color: "#888" }}>{f.municipio}</div>}
                      </div>
                    </label>
                  ))}
                </div>
                <div style={{ marginTop: 6, fontSize: 11, color: "#888" }}>
                  {syncSelect.size === 0
                    ? "Nenhuma selecionada — vai sincronizar todas ao confirmar"
                    : `${syncSelect.size} fazenda(s) selecionada(s)`}
                </div>
              </div>

              {/* Aviso template vazio */}
              {templates.length === 0 && (
                <div style={{ background: "#FBF3E0", border: "0.5px solid #F6C87A", borderRadius: 8, padding: "8px 12px", fontSize: 11, color: "#7A5A12", marginBottom: 12 }}>
                  ⚠️ Nenhum template cadastrado. Crie as operações antes de sincronizar.
                </div>
              )}

              {syncErr && (
                <div style={{ background: "#FCEBEB", border: "0.5px solid #F5C6C6", borderRadius: 8, padding: "8px 12px", fontSize: 11, color: "#791F1F", marginBottom: 12 }}>
                  {syncErr}
                </div>
              )}

              <button
                onClick={sincronizar}
                disabled={syncing || templates.length === 0}
                style={{ ...btnP, width: "100%", opacity: (syncing || templates.length === 0) ? 0.6 : 1, cursor: (syncing || templates.length === 0) ? "not-allowed" : "pointer" }}
              >
                {syncing ? "Sincronizando…" : `Sincronizar ${templates.length} operações →`}
              </button>

              {/* Resultado */}
              {syncResult && (
                <div style={{ marginTop: 14 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: "#1a1a1a", marginBottom: 8 }}>
                    Resultado
                  </div>
                  <div style={{ maxHeight: 200, overflowY: "auto" }}>
                    {syncResult.map(r => (
                      <div key={r.fazenda_id} style={{ padding: "7px 10px", borderBottom: "0.5px solid #F0F2F7", fontSize: 11 }}>
                        <div style={{ fontWeight: 600, color: "#1a1a1a", marginBottom: 2 }}>{r.fazenda_nome}</div>
                        <div style={{ display: "flex", gap: 10 }}>
                          <span style={{ background: "#EAF3DE", color: "#1A5C38", padding: "1px 7px", borderRadius: 5, fontWeight: 600 }}>+{r.inseridos} novos</span>
                          <span style={{ background: "#D5E8F5", color: "#0B2D50", padding: "1px 7px", borderRadius: 5, fontWeight: 600 }}>{r.atualizados} atualizados</span>
                          {r.erros > 0 && <span style={{ background: "#FCEBEB", color: "#791F1F", padding: "1px 7px", borderRadius: 5, fontWeight: 600 }}>{r.erros} erros</span>}
                        </div>
                      </div>
                    ))}
                  </div>
                  <div style={{ marginTop: 8, padding: "8px 10px", background: "#EAF3DE", borderRadius: 8, fontSize: 11, color: "#1A5C38", fontWeight: 600 }}>
                    ✓ {syncResult.reduce((a, r) => a + r.inseridos + r.atualizados, 0)} registros sincronizados
                    em {syncResult.length} fazenda(s).
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════
          MODAL CRUD — Nova / Editar Operação
      ══════════════════════════════════════════════════════ */}
      {modal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(11,45,80,0.32)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 500, padding: 24 }}>
          <div style={{ background: "#fff", borderRadius: 14, width: "100%", maxWidth: 700, maxHeight: "90vh", overflowY: "auto", boxShadow: "0 4px 20px rgba(11,45,80,0.10)" }}>

            <div style={{ padding: "18px 24px 14px", borderBottom: "0.5px solid #EEF1F6", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: "#1a1a1a" }}>
                {modal === "novo" ? "Nova Operação — Template" : `Editar: ${form.classificacao}`}
              </div>
              <button onClick={() => setModal(null)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 20, color: "#888" }}>×</button>
            </div>

            <div style={{ padding: 24 }}>
              {formErr && (
                <div style={{ background: "#FCEBEB", border: "0.5px solid #F5C6C6", borderRadius: 8, padding: "8px 12px", fontSize: 12, color: "#791F1F", marginBottom: 16 }}>
                  {formErr}
                </div>
              )}

              {/* Identificação */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr 1fr", gap: 14, marginBottom: 14 }}>
                <div>
                  <label style={lbl}>Código *</label>
                  <input value={form.classificacao ?? ""} onChange={e => setForm(p => ({ ...p, classificacao: e.target.value }))} placeholder="1.01.001" style={{ ...inp, fontFamily: "monospace" }} />
                </div>
                <div>
                  <label style={lbl}>Descrição *</label>
                  <input value={form.descricao ?? ""} onChange={e => setForm(p => ({ ...p, descricao: e.target.value }))} placeholder="Nome da operação" style={inp} />
                </div>
                <div>
                  <label style={lbl}>Tipo *</label>
                  <select value={form.tipo ?? "despesa"} onChange={e => setForm(p => ({ ...p, tipo: e.target.value as "receita" | "despesa" }))} style={inp}>
                    <option value="despesa">Despesa</option>
                    <option value="receita">Receita</option>
                  </select>
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14, marginBottom: 14 }}>
                <div>
                  <label style={lbl}>Conta Pai (Parent)</label>
                  <select value={form.parent_id ?? ""} onChange={e => setForm(p => ({ ...p, parent_id: e.target.value || undefined }))} style={inp}>
                    <option value="">— Raiz (sem pai) —</option>
                    {templates.filter(t => !form.id || t.id !== form.id).map(t => (
                      <option key={t.id} value={t.id}>{t.classificacao} — {t.descricao}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label style={lbl}>LCDPR (código)</label>
                  <input value={form.tipo_lcdpr ?? ""} onChange={e => setForm(p => ({ ...p, tipo_lcdpr: e.target.value }))} placeholder="ex: 201" style={inp} />
                </div>
                <div style={{ display: "flex", flexDirection: "column", justifyContent: "flex-end" }}>
                  <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 12 }}>
                    <input type="checkbox" checked={form.inativo ?? false} onChange={e => setForm(p => ({ ...p, inativo: e.target.checked }))} />
                    Inativo
                  </label>
                </div>
              </div>

              {/* Permissões */}
              <div style={{ background: "#F4F6FA", border: "0.5px solid #DDE2EE", borderRadius: 8, padding: "12px 14px", marginBottom: 14 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "#1A4870", marginBottom: 10, textTransform: "uppercase" as const, letterSpacing: "0.05em" }}>Permite usar em</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "6px 16px" }}>
                  {([
                    ["permite_notas_fiscais",     "Notas Fiscais"],
                    ["permite_cp_cr",             "CP / CR"],
                    ["permite_adiantamentos",     "Adiantamentos"],
                    ["permite_tesouraria",        "Tesouraria"],
                    ["permite_baixas",            "Baixas"],
                    ["permite_custo_produto",     "Custo de Produto"],
                    ["permite_contrato_financeiro","Contratos Financeiros"],
                    ["permite_estoque",           "Estoque"],
                    ["permite_pedidos_venda",     "Pedidos de Venda"],
                    ["permite_manutencao",        "Manutenção"],
                    ["gerar_financeiro",          "Gerar CP/CR"],
                    ["gerar_depreciacao",         "Gerar Depreciação"],
                  ] as [keyof OperacaoGerencial, string][]).map(([field, label]) => (
                    <label key={field} style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", fontSize: 12 }}>
                      <input
                        type="checkbox"
                        checked={Boolean(form[field])}
                        onChange={e => setForm(p => ({ ...p, [field]: e.target.checked }))}
                        style={{ accentColor: "#1A4870" }}
                      />
                      {label}
                    </label>
                  ))}
                </div>
              </div>

              {/* Contabilidade */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 14 }}>
                <div>
                  <label style={lbl}>Conta Débito (SPED)</label>
                  <input value={form.conta_debito ?? ""} onChange={e => setForm(p => ({ ...p, conta_debito: e.target.value }))} placeholder="ex: 3.1.01.001" style={{ ...inp, fontFamily: "monospace" }} />
                </div>
                <div>
                  <label style={lbl}>Conta Crédito (SPED)</label>
                  <input value={form.conta_credito ?? ""} onChange={e => setForm(p => ({ ...p, conta_credito: e.target.value }))} placeholder="ex: 1.1.01.002" style={{ ...inp, fontFamily: "monospace" }} />
                </div>
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
                <button style={btnS} onClick={() => setModal(null)}>Cancelar</button>
                <button style={{ ...btnP, opacity: saving ? 0.7 : 1 }} onClick={salvar} disabled={saving}>
                  {saving ? "Salvando…" : modal === "novo" ? "Criar Operação" : "Salvar Alterações"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
