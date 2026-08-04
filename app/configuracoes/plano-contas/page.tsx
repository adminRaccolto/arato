"use client";
import { useState, useEffect } from "react";
import TopNav from "../../../components/TopNav";
import { useAuth } from "../../../components/AuthProvider";
import { type ContaContabil, planoContasPadrao, LCDPR_OPCOES } from "../../../lib/planoContas";
import { listarPlanoContas, salvarContaContabil, excluirContaContabil, seedPlanoContas, listarOperacoesGerenciais, criarOperacaoGerencialCustom, atualizarOperacaoGerencial, excluirOperacaoGerencial } from "../../../lib/db";
import type { OperacaoGerencial } from "../../../lib/supabase";

// ── Helpers ────────────────────────────────────────────────────────────────────
const inp: React.CSSProperties = {
  width: "100%", padding: "8px 10px", border: "0.5px solid var(--border-table)",
  borderRadius: 8, fontSize: 13, color: "var(--text-1)", background: "var(--bg-card)",
  boxSizing: "border-box", outline: "none",
};
const lbl: React.CSSProperties = { fontSize: 11, color: "var(--text-2)", marginBottom: 4, display: "block" };

const TIPO_META: Record<ContaContabil["tipo"], { bg: string; color: string; label: string }> = {
  ativo:   { bg: "#EAF3DE", color: "#1A5C38", label: "ATIVO"    },
  passivo: { bg: "#FCEBEB", color: "#791F1F", label: "PASSIVO"  },
  pl:      { bg: "#F0EAF8", color: "#4B1A8A", label: "PL"       },
  receita: { bg: "#D5E8F5", color: "#0B2D50", label: "RECEITA"  },
  custo:   { bg: "#FAEEDA", color: "#633806", label: "CUSTO"    },
  despesa: { bg: "#FBF3E0", color: "#8B5E14", label: "DESPESA"  },
};

type FiltroTipo = "todos" | ContaContabil["tipo"];

const CONTA_VAZIA: ContaContabil = {
  codigo: "", nome: "", tipo: "despesa", nivel: 2, natureza: "devedora", operacional: true, lcdpr: null,
};

// ── Componente ─────────────────────────────────────────────────────────────────
export default function PlanoContasPage() {
  const { fazendaId, contaId } = useAuth();

  // ── Aba ───────────────────────────────────────────────────────────────────
  const [aba, setAba] = useState<"plano" | "operacoes">("plano");

  // ── Plano de Contas ────────────────────────────────────────────────────────
  const [contas,      setContas]      = useState<ContaContabil[]>([]);
  const [ogRef,       setOgRef]       = useState<Record<string, number>>({}); // código → qtd OGs
  const [filtro,      setFiltro]      = useState<FiltroTipo>("todos");
  const [busca,       setBusca]       = useState("");
  const [loading,     setLoading]     = useState(true);
  const [seeding,     setSeeding]     = useState(false);
  const [modal,       setModal]       = useState(false);
  const [editCod,     setEditCod]     = useState<string | null>(null);
  const [form,        setForm]        = useState<ContaContabil>(CONTA_VAZIA);
  const [salvando,    setSalvando]    = useState(false);
  const [erro,        setErro]        = useState<string | null>(null);

  // ── Operações Gerenciais ───────────────────────────────────────────────────
  const [ogs,         setOgs]         = useState<OperacaoGerencial[]>([]);
  const [loadOg,      setLoadOg]      = useState(false);
  const [filtroOg,    setFiltroOg]    = useState<"todos" | "receita" | "despesa">("todos");
  const [buscaOg,     setBuscaOg]     = useState("");
  const [modalOg,     setModalOg]     = useState(false);
  const [editOgId,    setEditOgId]    = useState<string | null>(null);
  const [formOg,      setFormOg]      = useState<Partial<OperacaoGerencial>>({});
  const [salvandoOg,  setSalvandoOg]  = useState(false);
  const [erroOg,      setErroOg]      = useState<string | null>(null);

  const OG_VAZIA: Partial<OperacaoGerencial> = {
    classificacao: "", descricao: "", tipo: "despesa", inativo: false,
    permite_cp_cr: true, permite_notas_fiscais: false,
    custo_absorcao: true, custo_abc: true, gerar_financeiro: true,
  };

  // ── Carga Plano de Contas ──────────────────────────────────────────────────
  useEffect(() => {
    if (!fazendaId) return;
    setLoading(true);
    Promise.all([
      listarPlanoContas(fazendaId),
      listarOperacoesGerenciais(fazendaId),
    ]).then(([pdc, ogList]) => {
      setContas(pdc.length > 0 ? pdc : planoContasPadrao);
      const ref: Record<string, number> = {};
      for (const og of ogList) {
        if (og.conta_debito)  ref[og.conta_debito]  = (ref[og.conta_debito]  || 0) + 1;
        if (og.conta_credito) ref[og.conta_credito] = (ref[og.conta_credito] || 0) + 1;
      }
      setOgRef(ref);
    }).catch(() => {}).finally(() => setLoading(false));
  }, [fazendaId]);

  // ── Carga Operações Gerenciais ─────────────────────────────────────────────
  useEffect(() => {
    if (!fazendaId || aba !== "operacoes") return;
    setLoadOg(true);
    listarOperacoesGerenciais(fazendaId)
      .then(setOgs)
      .catch(() => {})
      .finally(() => setLoadOg(false));
  }, [fazendaId, aba]);

  // ── Filtro ─────────────────────────────────────────────────────────────────
  const contasFiltradas = contas
    .filter(c => filtro === "todos" || c.tipo === filtro)
    .filter(c => {
      if (!busca) return true;
      const q = busca.toLowerCase();
      return c.codigo.toLowerCase().includes(q) || c.nome.toLowerCase().includes(q);
    });

  // ── Modal ──────────────────────────────────────────────────────────────────
  function abrirNova() {
    setEditCod(null);
    setForm(CONTA_VAZIA);
    setErro(null);
    setModal(true);
  }
  function abrirEditar(c: ContaContabil) {
    setEditCod(c.codigo);
    setForm({ ...c });
    setErro(null);
    setModal(true);
  }
  async function salvar() {
    if (!fazendaId || !form.codigo || !form.nome) { setErro("Código e Nome são obrigatórios."); return; }
    setSalvando(true); setErro(null);
    try {
      await salvarContaContabil(fazendaId, form);
      const atualizado = await listarPlanoContas(fazendaId);
      setContas(atualizado);
      setModal(false);
    } catch (e: unknown) {
      setErro(e instanceof Error ? e.message : "Erro ao salvar.");
    } finally { setSalvando(false); }
  }
  async function excluir(codigo: string) {
    if (!fazendaId) return;
    if (!confirm(`Excluir a conta ${codigo}? Esta ação não pode ser desfeita.`)) return;
    try {
      await excluirContaContabil(fazendaId, codigo);
      setContas(p => p.filter(c => c.codigo !== codigo));
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : "Erro ao excluir.");
    }
  }
  async function importarPadrao() {
    if (!fazendaId) return;
    if (!confirm(`Isso vai substituir todas as contas pelo plano padrão (${planoContasPadrao.length} contas). Continuar?`)) return;
    setSeeding(true);
    try {
      await seedPlanoContas(fazendaId, planoContasPadrao);
      const novo = await listarPlanoContas(fazendaId);
      setContas(novo);
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : "Erro ao importar.");
    } finally { setSeeding(false); }
  }

  // ── OG: modal ─────────────────────────────────────────────────────────────
  function abrirNovaOg() {
    setEditOgId(null);
    setFormOg({ ...OG_VAZIA });
    setErroOg(null);
    setModalOg(true);
  }
  function abrirEditarOg(og: OperacaoGerencial) {
    setEditOgId(og.id);
    setFormOg({ ...og });
    setErroOg(null);
    setModalOg(true);
  }
  async function salvarOg() {
    if (!formOg.classificacao || !formOg.descricao) { setErroOg("Código e Descrição são obrigatórios."); return; }
    if (!contaId) { setErroOg("Conta não identificada."); return; }
    setSalvandoOg(true); setErroOg(null);
    try {
      if (editOgId) {
        await atualizarOperacaoGerencial(editOgId, formOg);
      } else {
        await criarOperacaoGerencialCustom(contaId, formOg as Omit<OperacaoGerencial, "id"|"created_at"|"conta_id"|"fazenda_id">);
      }
      const lista = await listarOperacoesGerenciais(fazendaId!);
      setOgs(lista);
      setModalOg(false);
    } catch (e: unknown) {
      setErroOg(e instanceof Error ? e.message : "Erro ao salvar.");
    } finally { setSalvandoOg(false); }
  }
  async function excluirOg(og: OperacaoGerencial) {
    if (og.conta_id === null) { alert("Esta operação faz parte do padrão Raccotlo e não pode ser excluída aqui."); return; }
    if (!confirm(`Excluir "${og.descricao}"?`)) return;
    try {
      await excluirOperacaoGerencial(og.id);
      setOgs(p => p.filter(o => o.id !== og.id));
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : "Erro ao excluir.");
    }
  }

  // ── Export XLSX ────────────────────────────────────────────────────────────
  async function exportarXlsx() {
    const XLSX = await import("xlsx");
    const dados = contasFiltradas.map(c => ({
      "Código":      c.codigo,
      "Nome":        c.nome,
      "Tipo":        TIPO_META[c.tipo]?.label ?? c.tipo,
      "Natureza":    c.natureza ?? "",
      "Nível":       c.nivel,
      "Pai":         c.pai ?? "",
      "Transitória": c.transitoria ? "Sim" : "Não",
      "Operacional": c.operacional !== false ? "Sim" : "Não",
      "LCDPR":       c.lcdpr ?? "",
      "OGs vinculadas": ogRef[c.codigo] ?? 0,
    }));
    const ws = XLSX.utils.json_to_sheet(dados);
    ws["!cols"] = [{ wch: 14 }, { wch: 45 }, { wch: 10 }, { wch: 10 }, { wch: 7 }, { wch: 14 }, { wch: 11 }, { wch: 12 }, { wch: 8 }, { wch: 14 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Plano de Contas");
    XLSX.writeFile(wb, `plano_contas_${new Date().toISOString().split("T")[0]}.xlsx`);
  }

  // ── Contagens para os filtros ──────────────────────────────────────────────
  const counts: Record<string, number> = { todos: contas.length };
  for (const c of contas) counts[c.tipo] = (counts[c.tipo] || 0) + 1;

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div style={{ minHeight: "100vh", background: "var(--bg-page)", fontFamily: "system-ui, sans-serif" }}>
      <TopNav />
      <div style={{ maxWidth: 1300, margin: "0 auto", padding: "28px 24px" }}>

        {/* Abas */}
        <div style={{ display: "flex", gap: 4, marginBottom: 24, borderBottom: "0.5px solid var(--border-table)", paddingBottom: 0 }}>
          {([
            { key: "plano",    label: "Plano de Contas Contábil" },
            { key: "operacoes", label: "Operações Gerenciais" },
          ] as { key: "plano"|"operacoes"; label: string }[]).map(a => (
            <button key={a.key} onClick={() => setAba(a.key)} style={{
              padding: "8px 18px", borderRadius: "8px 8px 0 0", border: "0.5px solid",
              borderBottom: "none", fontWeight: 600, fontSize: 13, cursor: "pointer",
              borderColor: aba === a.key ? "var(--border-table)" : "transparent",
              background: aba === a.key ? "var(--bg-card)" : "transparent",
              color: aba === a.key ? "var(--text-1)" : "var(--text-3)",
              marginBottom: -1,
            }}>{a.label}</button>
          ))}
        </div>

        {/* ── ABA: Plano de Contas ── */}
        {aba === "plano" && <>

        {/* Cabeçalho */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
          <div>
            <div style={{ fontSize: 20, fontWeight: 700, color: "var(--text-1)" }}>Plano de Contas</div>
            <div style={{ fontSize: 13, color: "var(--text-3)", marginTop: 4 }}>
              Estrutura contábil formal · SPED ECD · LCDPR · DRE
            </div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={exportarXlsx}
              style={{ fontSize: 12, padding: "7px 14px", border: "0.5px solid #16A34A", borderRadius: 8, background: "#F0FDF4", color: "#16A34A", cursor: "pointer", fontWeight: 600 }}>
              ⬇ XLSX
            </button>
            <button
              onClick={importarPadrao} disabled={seeding}
              style={{ fontSize: 12, padding: "7px 14px", border: "0.5px solid #C9921B", borderRadius: 8, background: "#FBF3E0", color: "#7A5A10", cursor: seeding ? "not-allowed" : "pointer", fontWeight: 600, opacity: seeding ? 0.7 : 1 }}>
              {seeding ? "Importando…" : "↓ Importar Padrão"}
            </button>
            <button onClick={abrirNova}
              style={{ fontSize: 12, padding: "7px 14px", border: "0.5px solid #1A4870", borderRadius: 8, background: "#1A4870", color: "#fff", cursor: "pointer", fontWeight: 600 }}>
              + Nova Conta
            </button>
          </div>
        </div>

        {/* Filtros + busca */}
        <div style={{ background: "var(--bg-card)", borderRadius: 10, border: "0.5px solid var(--border-table)", marginBottom: 16, padding: "10px 14px", display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          {([
            ["todos", "Todos"], ["ativo", "Ativo"], ["passivo", "Passivo"], ["pl", "PL"],
            ["receita", "Receita"], ["custo", "Custo"], ["despesa", "Despesa"],
          ] as [FiltroTipo, string][]).map(([k, label]) => (
            <button key={k} onClick={() => setFiltro(k)} style={{
              padding: "4px 12px", borderRadius: 16, border: "0.5px solid",
              borderColor: filtro === k ? "#1A4870" : "var(--border-table)",
              background: filtro === k ? "#D5E8F5" : "transparent",
              color: filtro === k ? "#0B2D50" : "var(--text-3)", fontWeight: filtro === k ? 600 : 400, fontSize: 12, cursor: "pointer",
            }}>
              {label}
              <span style={{ marginLeft: 5, fontSize: 10, background: filtro === k ? "#1A4870" : "var(--border-row)", color: filtro === k ? "#fff" : "var(--text-3)", padding: "1px 5px", borderRadius: 6 }}>
                {counts[k] ?? 0}
              </span>
            </button>
          ))}
          <div style={{ flex: 1, minWidth: 200 }}>
            <input
              value={busca} onChange={e => setBusca(e.target.value)}
              placeholder="Buscar por código ou nome…"
              style={{ ...inp, padding: "5px 10px", width: "100%", maxWidth: 280 }}
            />
          </div>
          <span style={{ fontSize: 11, color: "var(--text-3)" }}>
            <span style={{ background: "#EAF3DE", color: "#1A5C38", padding: "1px 6px", borderRadius: 5, fontWeight: 600, marginRight: 4 }}>
              {contas.filter(c => c.lcdpr).length}
            </span>
            com LCDPR
          </span>
        </div>

        {/* Tabela */}
        <div style={{ background: "var(--bg-card)", border: "0.5px solid var(--border-table)", borderRadius: 10, overflow: "hidden" }}>
          {loading ? (
            <div style={{ padding: 40, textAlign: "center", color: "var(--text-3)", fontSize: 13 }}>Carregando plano de contas…</div>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed" }}>
              <colgroup>
                <col style={{ width: 130 }} />
                <col />
                <col style={{ width: 90 }} />
                <col style={{ width: 90 }} />
                <col style={{ width: 80 }} />
                <col style={{ width: 80 }} />
                <col style={{ width: 70 }} />
                <col style={{ width: 80 }} />
              </colgroup>
              <thead>
                <tr style={{ background: "var(--bg-page)" }}>
                  {["Código", "Nome da Conta", "Tipo", "Natureza", "LCDPR", "OGs", "Oper.", ""].map((h, i) => (
                    <th key={i} style={{ padding: "8px 12px", textAlign: i >= 2 ? "center" : "left", fontSize: 11, fontWeight: 600, color: "var(--text-2)", borderBottom: "0.5px solid var(--border-table)" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {contasFiltradas.length === 0 && (
                  <tr><td colSpan={8} style={{ padding: 32, textAlign: "center", color: "var(--text-3)", fontSize: 13 }}>
                    Nenhuma conta encontrada. Use "↓ Importar Padrão" para carregar o plano contábil agrícola.
                  </td></tr>
                )}
                {contasFiltradas.map((c, ci) => {
                  const meta = TIPO_META[c.tipo];
                  const depth = c.codigo ? c.codigo.split(".").length - 1 : 0;
                  const isGrupo = depth <= 1;
                  const ogCount = ogRef[c.codigo] ?? 0;
                  return (
                    <tr key={c.codigo} style={{
                      borderBottom: "0.5px solid var(--border-row)",
                      background: isGrupo ? "var(--bg-page)" : ci % 2 === 0 ? "var(--bg-card)" : "var(--bg-row-alt, var(--bg-card))",
                    }}>
                      <td style={{ padding: "7px 12px", fontFamily: "monospace", fontSize: 12, color: "var(--text-2)", fontWeight: isGrupo ? 700 : 400 }}>
                        {c.codigo}
                      </td>
                      <td style={{ padding: "7px 12px", fontSize: isGrupo ? 13 : 12, fontWeight: isGrupo ? 600 : 400, color: "var(--text-1)" }}>
                        <span style={{ paddingLeft: depth * 14, display: "inline-block" }}>
                          {!isGrupo && <span style={{ color: "var(--text-3)", marginRight: 4 }}>└</span>}
                          {c.nome}
                          {c.transitoria && (
                            <span style={{ marginLeft: 6, fontSize: 9, background: "#FBF3E0", color: "#8B5E14", padding: "1px 5px", borderRadius: 4, fontWeight: 600 }}>TRANS.</span>
                          )}
                        </span>
                      </td>
                      <td style={{ padding: "7px 12px", textAlign: "center" }}>
                        <span style={{ fontSize: 10, background: meta.bg, color: meta.color, padding: "2px 7px", borderRadius: 6, fontWeight: 700 }}>{meta.label}</span>
                      </td>
                      <td style={{ padding: "7px 12px", textAlign: "center", fontSize: 11, color: "var(--text-2)" }}>
                        {c.natureza ?? "—"}
                      </td>
                      <td style={{ padding: "7px 12px", textAlign: "center", fontSize: 11 }}>
                        {c.lcdpr ? (
                          <span style={{ background: "#EAF3DE", color: "#1A5C38", padding: "2px 6px", borderRadius: 4, fontWeight: 600 }}>{c.lcdpr}</span>
                        ) : <span style={{ color: "var(--text-3)" }}>—</span>}
                      </td>
                      <td style={{ padding: "7px 12px", textAlign: "center" }}>
                        {ogCount > 0 ? (
                          <a href={`/configuracoes/operacoes-gerenciais?conta=${c.codigo}`}
                            style={{ background: "#D5E8F5", color: "#0B2D50", padding: "2px 8px", borderRadius: 6, fontSize: 11, fontWeight: 700, textDecoration: "none" }}
                            title="Ver operações gerenciais que usam esta conta">
                            {ogCount} OG
                          </a>
                        ) : <span style={{ color: "var(--text-3)", fontSize: 11 }}>—</span>}
                      </td>
                      <td style={{ padding: "7px 12px", textAlign: "center", fontSize: 11, color: c.operacional !== false ? "#16A34A" : "var(--text-3)" }}>
                        {c.operacional !== false ? "Sim" : "Não"}
                      </td>
                      <td style={{ padding: "7px 12px", textAlign: "right" }}>
                        <div style={{ display: "flex", gap: 4, justifyContent: "flex-end" }}>
                          <button onClick={() => abrirEditar(c)}
                            title="Editar" style={{ background: "var(--bg-page)", border: "0.5px solid var(--border-table)", borderRadius: 6, padding: "3px 8px", cursor: "pointer", fontSize: 12, color: "var(--text-2)" }}>✎</button>
                          <button onClick={() => excluir(c.codigo)}
                            title="Excluir" style={{ background: "#FCEBEB", border: "0.5px solid #F5C2C2", borderRadius: 6, padding: "3px 8px", cursor: "pointer", fontSize: 12, color: "#791F1F" }}>✕</button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Legenda */}
        <div style={{ marginTop: 12, display: "flex", gap: 16, flexWrap: "wrap", fontSize: 11, color: "var(--text-3)" }}>
          <span>Linhas destacadas = grupos (nível ≤ 1)</span>
          <span>OGs = operações gerenciais que referenciam esta conta como débito ou crédito</span>
          <span>Operacional = visível nos dropdowns dos módulos</span>
        </div>

        </> /* fim aba plano */}

        {/* ── ABA: Operações Gerenciais ── */}
        {aba === "operacoes" && <>

          {/* Cabeçalho OG */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
            <div>
              <div style={{ fontSize: 16, fontWeight: 700, color: "var(--text-1)" }}>Operações Gerenciais</div>
              <div style={{ fontSize: 12, color: "var(--text-3)", marginTop: 3 }}>
                Padrão Raccotlo (bloqueado) · Suas adições (editáveis)
              </div>
            </div>
            <button onClick={abrirNovaOg}
              style={{ fontSize: 12, padding: "7px 14px", border: "0.5px solid #1A4870", borderRadius: 8, background: "#1A4870", color: "#fff", cursor: "pointer", fontWeight: 600 }}>
              + Nova Operação
            </button>
          </div>

          {/* Filtros OG */}
          <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap", alignItems: "center" }}>
            {(["todos","receita","despesa"] as const).map(k => (
              <button key={k} onClick={() => setFiltroOg(k)} style={{
                padding: "4px 12px", borderRadius: 16, border: "0.5px solid",
                borderColor: filtroOg === k ? "#1A4870" : "var(--border-table)",
                background: filtroOg === k ? "#D5E8F5" : "transparent",
                color: filtroOg === k ? "#0B2D50" : "var(--text-3)", fontWeight: filtroOg === k ? 600 : 400, fontSize: 12, cursor: "pointer",
              }}>
                {k === "todos" ? "Todos" : k === "receita" ? "Receitas" : "Despesas"}
                <span style={{ marginLeft: 5, fontSize: 10, background: filtroOg === k ? "#1A4870" : "var(--border-table)", color: filtroOg === k ? "#fff" : "var(--text-3)", padding: "1px 5px", borderRadius: 6 }}>
                  {ogs.filter(o => filtroOg === "todos" || o.tipo === k).length}
                </span>
              </button>
            ))}
            <input value={buscaOg} onChange={e => setBuscaOg(e.target.value)} placeholder="Buscar…"
              style={{ padding: "5px 10px", border: "0.5px solid var(--border-table)", borderRadius: 8, fontSize: 12, color: "var(--text-1)", background: "var(--bg-card)", outline: "none", width: 220 }} />
            <span style={{ fontSize: 11, color: "var(--text-3)", marginLeft: "auto" }}>
              <span style={{ background: "#D5E8F5", color: "#0B2D50", padding: "1px 6px", borderRadius: 5, fontWeight: 600, marginRight: 4 }}>
                {ogs.filter(o => o.conta_id === null && o.fazenda_id === null).length}
              </span>
              padrão Raccotlo ·
              <span style={{ background: "#FBF3E0", color: "#7A5A10", padding: "1px 6px", borderRadius: 5, fontWeight: 600, marginLeft: 6, marginRight: 4 }}>
                {ogs.filter(o => o.conta_id !== null).length}
              </span>
              adições suas
            </span>
          </div>

          {/* Tabela OG */}
          <div style={{ background: "var(--bg-card)", border: "0.5px solid var(--border-table)", borderRadius: 10, overflow: "hidden" }}>
            {loadOg ? (
              <div style={{ padding: 40, textAlign: "center", color: "var(--text-3)", fontSize: 13 }}>Carregando operações…</div>
            ) : (
              <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed" }}>
                <colgroup>
                  <col style={{ width: 120 }} />
                  <col />
                  <col style={{ width: 80 }} />
                  <col style={{ width: 110 }} />
                  <col style={{ width: 110 }} />
                  <col style={{ width: 90 }} />
                </colgroup>
                <thead>
                  <tr style={{ background: "var(--bg-page)" }}>
                    {["Código", "Descrição", "Tipo", "Cta. Débito", "Cta. Crédito", ""].map((h, i) => (
                      <th key={i} style={{ padding: "8px 12px", textAlign: i >= 2 ? "center" : "left", fontSize: 11, fontWeight: 600, color: "var(--text-2)", borderBottom: "0.5px solid var(--border-table)" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {ogs
                    .filter(o => filtroOg === "todos" || o.tipo === filtroOg)
                    .filter(o => {
                      if (!buscaOg) return true;
                      const q = buscaOg.toLowerCase();
                      return o.classificacao.toLowerCase().includes(q) || o.descricao.toLowerCase().includes(q);
                    })
                    .map((og, ci) => {
                      const isGlobal = og.conta_id === null && og.fazenda_id === null;
                      return (
                        <tr key={og.id} style={{ borderBottom: "0.5px solid var(--border-row)", background: ci % 2 === 0 ? "var(--bg-card)" : "var(--bg-row-alt, var(--bg-card))" }}>
                          <td style={{ padding: "7px 12px", fontFamily: "monospace", fontSize: 12, color: "var(--text-2)" }}>{og.classificacao}</td>
                          <td style={{ padding: "7px 12px", fontSize: 12, color: "var(--text-1)" }}>
                            {og.descricao}
                            {isGlobal && (
                              <span style={{ marginLeft: 8, fontSize: 9, background: "#D5E8F5", color: "#0B2D50", padding: "1px 5px", borderRadius: 4, fontWeight: 700 }}>RACCOTLO</span>
                            )}
                          </td>
                          <td style={{ padding: "7px 12px", textAlign: "center" }}>
                            <span style={{ fontSize: 10, padding: "2px 7px", borderRadius: 6, fontWeight: 700,
                              background: og.tipo === "receita" ? "#EAF3DE" : "#FCEBEB",
                              color: og.tipo === "receita" ? "#1A5C38" : "#791F1F" }}>
                              {og.tipo === "receita" ? "RECEITA" : "DESPESA"}
                            </span>
                          </td>
                          <td style={{ padding: "7px 12px", textAlign: "center", fontSize: 11, fontFamily: "monospace", color: "var(--text-2)" }}>{og.conta_debito ?? "—"}</td>
                          <td style={{ padding: "7px 12px", textAlign: "center", fontSize: 11, fontFamily: "monospace", color: "var(--text-2)" }}>{og.conta_credito ?? "—"}</td>
                          <td style={{ padding: "7px 12px", textAlign: "right" }}>
                            {isGlobal ? (
                              <span style={{ fontSize: 10, color: "var(--text-muted)", fontStyle: "italic" }}>somente leitura</span>
                            ) : (
                              <div style={{ display: "flex", gap: 4, justifyContent: "flex-end" }}>
                                <button onClick={() => abrirEditarOg(og)}
                                  style={{ background: "var(--bg-page)", border: "0.5px solid var(--border-table)", borderRadius: 6, padding: "3px 8px", cursor: "pointer", fontSize: 12, color: "var(--text-2)" }}>✎</button>
                                <button onClick={() => excluirOg(og)}
                                  style={{ background: "#FCEBEB", border: "0.5px solid #F5C2C2", borderRadius: 6, padding: "3px 8px", cursor: "pointer", fontSize: 12, color: "#791F1F" }}>✕</button>
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            )}
          </div>

        </> /* fim aba operacoes */}

      </div>

      {/* ── Modal Operação Gerencial ──────────────────────────────────────────── */}
      {modalOg && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ background: "var(--bg-card)", borderRadius: 12, width: 680, maxHeight: "90vh", overflowY: "auto", boxShadow: "0 8px 40px rgba(0,0,0,0.3)" }}>
            <div style={{ padding: "16px 20px", borderBottom: "0.5px solid var(--border-table)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ fontWeight: 700, fontSize: 15, color: "var(--text-1)" }}>
                {editOgId ? "Editar Operação" : "Nova Operação Gerencial"}
                {!editOgId && <span style={{ marginLeft: 10, fontSize: 11, background: "#FBF3E0", color: "#7A5A10", padding: "2px 8px", borderRadius: 6 }}>adição da sua conta</span>}
              </div>
              <button onClick={() => setModalOg(false)} style={{ background: "none", border: "none", fontSize: 18, cursor: "pointer", color: "var(--text-3)" }}>✕</button>
            </div>
            <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 14 }}>

              <div style={{ display: "grid", gridTemplateColumns: "160px 1fr 120px", gap: 12 }}>
                <div>
                  <label style={lbl}>Código *</label>
                  <input style={{ ...inp, fontFamily: "monospace" }} value={formOg.classificacao ?? ""}
                    onChange={e => setFormOg(p => ({ ...p, classificacao: e.target.value }))}
                    placeholder="Ex: 2.01.05.001" disabled={!!editOgId} />
                </div>
                <div>
                  <label style={lbl}>Descrição *</label>
                  <input style={inp} value={formOg.descricao ?? ""}
                    onChange={e => setFormOg(p => ({ ...p, descricao: e.target.value }))}
                    placeholder="Ex: ALUGUEL DE MÁQUINAS ESPECÍFICAS" />
                </div>
                <div>
                  <label style={lbl}>Tipo *</label>
                  <select style={inp} value={formOg.tipo ?? "despesa"} onChange={e => setFormOg(p => ({ ...p, tipo: e.target.value as "receita"|"despesa" }))}>
                    <option value="despesa">Despesa</option>
                    <option value="receita">Receita</option>
                  </select>
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div>
                  <label style={lbl}>Conta Débito (código contábil)</label>
                  <input style={{ ...inp, fontFamily: "monospace" }} value={formOg.conta_debito ?? ""}
                    onChange={e => setFormOg(p => ({ ...p, conta_debito: e.target.value || undefined }))}
                    placeholder="Ex: 5.5" />
                </div>
                <div>
                  <label style={lbl}>Conta Crédito (código contábil)</label>
                  <input style={{ ...inp, fontFamily: "monospace" }} value={formOg.conta_credito ?? ""}
                    onChange={e => setFormOg(p => ({ ...p, conta_credito: e.target.value || undefined }))}
                    placeholder="Ex: 2.1.1.2" />
                </div>
              </div>

              <div style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
                {([
                  ["permite_cp_cr",         "Permite CP/CR"],
                  ["permite_notas_fiscais",  "Permite NF"],
                  ["custo_absorcao",         "Custo Absorção"],
                  ["custo_abc",              "Custo ABC"],
                  ["gerar_financeiro",       "Gera Financeiro"],
                ] as [keyof OperacaoGerencial, string][]).map(([k, label]) => (
                  <label key={k} style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", fontSize: 12 }}>
                    <input type="checkbox" checked={!!(formOg as Record<string, unknown>)[k]}
                      onChange={e => setFormOg(p => ({ ...p, [k]: e.target.checked }))} />
                    {label}
                  </label>
                ))}
              </div>

              {erroOg && <div style={{ padding: "8px 12px", background: "#FCEBEB", borderRadius: 6, fontSize: 12, color: "#791F1F" }}>{erroOg}</div>}
            </div>
            <div style={{ padding: "12px 20px", borderTop: "0.5px solid var(--border-table)", display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button onClick={() => setModalOg(false)} style={{ padding: "8px 18px", borderRadius: 8, border: "0.5px solid var(--border-table)", background: "var(--bg-page)", color: "var(--text-2)", cursor: "pointer", fontSize: 13 }}>Cancelar</button>
              <button onClick={salvarOg} disabled={salvandoOg} style={{ padding: "8px 20px", borderRadius: 8, border: "none", background: "#C9921B", color: "#fff", cursor: salvandoOg ? "not-allowed" : "pointer", fontSize: 13, fontWeight: 600, opacity: salvandoOg ? 0.7 : 1 }}>
                {salvandoOg ? "Salvando…" : editOgId ? "Salvar" : "Criar Operação"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal Conta ─────────────────────────────────────────────────────── */}
      {modal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ background: "var(--bg-card)", borderRadius: 12, width: 680, maxHeight: "90vh", overflowY: "auto", boxShadow: "0 8px 40px rgba(0,0,0,0.3)" }}>
            <div style={{ padding: "16px 20px", borderBottom: "0.5px solid var(--border-table)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ fontWeight: 700, fontSize: 15, color: "var(--text-1)" }}>
                {editCod ? `Editar Conta — ${editCod}` : "Nova Conta Contábil"}
              </div>
              <button onClick={() => setModal(false)} style={{ background: "none", border: "none", fontSize: 18, cursor: "pointer", color: "var(--text-3)" }}>✕</button>
            </div>
            <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 16 }}>

              <div style={{ display: "grid", gridTemplateColumns: "160px 1fr", gap: 12 }}>
                <div>
                  <label style={lbl}>Código *</label>
                  <input style={{ ...inp, fontFamily: "monospace" }} value={form.codigo}
                    onChange={e => setForm(p => ({ ...p, codigo: e.target.value }))}
                    placeholder="Ex: 5.01.001" disabled={!!editCod} />
                </div>
                <div>
                  <label style={lbl}>Nome da Conta *</label>
                  <input style={inp} value={form.nome}
                    onChange={e => setForm(p => ({ ...p, nome: e.target.value }))}
                    placeholder="Ex: Receita com Venda de Soja" />
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 80px", gap: 12 }}>
                <div>
                  <label style={lbl}>Tipo *</label>
                  <select style={inp} value={form.tipo} onChange={e => setForm(p => ({ ...p, tipo: e.target.value as ContaContabil["tipo"] }))}>
                    <option value="ativo">Ativo</option>
                    <option value="passivo">Passivo</option>
                    <option value="pl">Patrimônio Líquido</option>
                    <option value="receita">Receita</option>
                    <option value="custo">Custo</option>
                    <option value="despesa">Despesa</option>
                  </select>
                </div>
                <div>
                  <label style={lbl}>Natureza</label>
                  <select style={inp} value={form.natureza ?? ""} onChange={e => setForm(p => ({ ...p, natureza: e.target.value as ContaContabil["natureza"] || undefined }))}>
                    <option value="">— Não definida —</option>
                    <option value="devedora">Devedora</option>
                    <option value="credora">Credora</option>
                  </select>
                </div>
                <div>
                  <label style={lbl}>Nível</label>
                  <input type="number" min={0} max={5} style={inp} value={form.nivel}
                    onChange={e => setForm(p => ({ ...p, nivel: Number(e.target.value) }))} />
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div>
                  <label style={lbl}>Conta Pai (código)</label>
                  <input style={{ ...inp, fontFamily: "monospace" }} value={form.pai ?? ""}
                    onChange={e => setForm(p => ({ ...p, pai: e.target.value || undefined }))}
                    placeholder="Deixe vazio para conta raiz" />
                  <div style={{ fontSize: 10, color: "var(--text-3)", marginTop: 3 }}>
                    Código da conta pai na hierarquia contábil
                  </div>
                </div>
                <div>
                  <label style={lbl}>Código LCDPR</label>
                  <select style={inp} value={form.lcdpr ?? ""} onChange={e => setForm(p => ({ ...p, lcdpr: e.target.value || null }))}>
                    {LCDPR_OPCOES.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
              </div>

              <div style={{ display: "flex", gap: 24 }}>
                <label style={{ display: "flex", alignItems: "center", gap: 7, cursor: "pointer", fontSize: 13 }}>
                  <input type="checkbox" checked={!!form.operacional}
                    onChange={e => setForm(p => ({ ...p, operacional: e.target.checked }))} />
                  Conta operacional (visível nos módulos)
                </label>
                <label style={{ display: "flex", alignItems: "center", gap: 7, cursor: "pointer", fontSize: 13 }}>
                  <input type="checkbox" checked={!!form.transitoria}
                    onChange={e => setForm(p => ({ ...p, transitoria: e.target.checked }))} />
                  Conta transitória (zera no encerramento)
                </label>
              </div>

              {/* Info visual do tipo selecionado */}
              <div style={{ padding: "10px 14px", borderRadius: 8, background: TIPO_META[form.tipo]?.bg, border: `0.5px solid ${TIPO_META[form.tipo]?.color}30` }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: TIPO_META[form.tipo]?.color, marginBottom: 4 }}>
                  {TIPO_META[form.tipo]?.label}
                </div>
                <div style={{ fontSize: 11, color: "var(--text-2)" }}>
                  {form.tipo === "ativo"   && "Bens e direitos da fazenda (estoques, contas a receber, imobilizado)"}
                  {form.tipo === "passivo" && "Obrigações e dívidas (fornecedores, financiamentos, impostos a pagar)"}
                  {form.tipo === "pl"      && "Patrimônio líquido (capital, reservas, lucros acumulados)"}
                  {form.tipo === "receita" && "Receitas de venda de grãos, serviços rurais, subvenções"}
                  {form.tipo === "custo"   && "Custo dos produtos vendidos (CMV, custos diretos de produção)"}
                  {form.tipo === "despesa" && "Despesas operacionais, administrativas e financeiras"}
                </div>
              </div>

              {erro && <div style={{ padding: "8px 12px", background: "#FCEBEB", borderRadius: 6, fontSize: 12, color: "#791F1F" }}>{erro}</div>}
            </div>
            <div style={{ padding: "12px 20px", borderTop: "0.5px solid var(--border-table)", display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button onClick={() => setModal(false)} style={{ padding: "8px 18px", borderRadius: 8, border: "0.5px solid var(--border-table)", background: "var(--bg-page)", color: "var(--text-2)", cursor: "pointer", fontSize: 13 }}>Cancelar</button>
              <button onClick={salvar} disabled={salvando} style={{ padding: "8px 20px", borderRadius: 8, border: "none", background: "#1A4870", color: "#fff", cursor: salvando ? "not-allowed" : "pointer", fontSize: 13, fontWeight: 600, opacity: salvando ? 0.7 : 1 }}>
                {salvando ? "Salvando…" : editCod ? "Salvar Alterações" : "Criar Conta"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
