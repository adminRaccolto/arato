"use client";
import SelectField from "../../../components/SelectField";
import { useState, useEffect, useCallback } from "react";
import { useAuth } from "../../../components/AuthProvider";
import { supabase } from "../../../lib/supabase";
import CompletarPessoas from "./CompletarPessoas";
import { GRUPOS_LIMPEZA, chaveLimpeza, type GrupoLimpeza } from "../../../lib/admin/limpeza";

type Aba = "excluir_cliente" | "limpar_dados" | "manutencao";

type ContaInfo = {
  id: string;
  nome: string;
  tipo: string;
  fazendas: { id: string; nome: string; municipio: string; estado: string }[];
};

type ResultGrupo = { label: string; ok: boolean; deletados: number; erros: string[] };
type Grupo = GrupoLimpeza;
const GRUPOS = GRUPOS_LIMPEZA;

const subKey = chaveLimpeza;

async function postAdmin(rota: string, corpo: unknown): Promise<{ ok: boolean; json: Record<string, unknown> }> {
  const { data: { session } } = await supabase.auth.getSession();
  const res = await fetch(rota, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token ?? ""}` },
    body: JSON.stringify(corpo),
  });
  return { ok: res.ok, json: await res.json().catch(() => ({})) };
}


export default function DadosAdminPage() {
  const { raccotloGestor } = useAuth();
  const [aba, setAba] = useState<Aba>("excluir_cliente");

  // ─── Estado: Excluir Cliente ──────────────────────────────────────────
  const [contas, setContas] = useState<ContaInfo[]>([]);
  const [carregandoContas, setCarregandoContas] = useState(false);
  const [contaSelecionada, setContaSelecionada] = useState<string>("");
  const [confirmaTexto, setConfirmaTexto] = useState("");
  const [deletandoCliente, setDeletandoCliente] = useState(false);
  const [resultadoCliente, setResultadoCliente] = useState<{ ok: boolean; msg: string } | null>(null);

  // ─── Estado: Limpar Dados ─────────────────────────────────────────────
  const [contaLimpar, setContaLimpar] = useState<string>("");
  const [fazendaLimpar, setFazendaLimpar] = useState<string>("");
  // contagens por chave "grupoId/subId"
  const [contagens, setContagens] = useState<Record<string, number>>({});
  const [carregandoContagens, setCarregandoContagens] = useState(false);
  // grupos expandidos no accordion
  const [gruposExpandidos, setGruposExpandidos] = useState<Set<string>>(new Set());
  // sub-itens selecionados para deletar
  const [subSelecionados, setSubSelecionados] = useState<Set<string>>(new Set());
  const [confirmaDeletar, setConfirmaDeletar] = useState("");
  const [deletandoDados, setDeletandoDados] = useState(false);
  const [resultadoLimpeza, setResultadoLimpeza] = useState<ResultGrupo[] | null>(null);

  // ─── Estado: Manutenção ───────────────────────────────────────────────

  if (!raccotloGestor) {
    return (
      <div data-arato-statistic="display" style={{ padding: 40, textAlign: "center", color: "var(--text-3)" }}>
        <div style={{ fontSize: 40, marginBottom: 12 }}>🔒</div>
        <div style={{ fontWeight: 600, fontSize: 16, color: "var(--text-1)" }}>Acesso restrito a Gestores</div>
      </div>
    );
  }

  // ─── Carregar contas via API route (service_role_key — bypassa RLS) ──
  const carregarContas = useCallback(async () => {
    setCarregandoContas(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token ?? "";
      const res = await fetch("/api/admin/listar-contas", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(await res.text());
      const json = await res.json();
      // listar-contas retorna array direto; cada item tem fazendas embutidas via select("*, fazendas(id, nome, municipio, estado)")
      type ContaRaw = { id: string; nome: string; tipo?: string; fazendas?: { id: string; nome: string; municipio: string; estado: string }[] };
      const contasDB: ContaRaw[] = Array.isArray(json) ? json : (json.contas ?? []);
      setContas(contasDB.map(c => ({
        id: c.id,
        nome: c.nome,
        tipo: c.tipo ?? "pf",
        fazendas: (c.fazendas ?? []).map(f => ({ id: f.id, nome: f.nome, municipio: f.municipio ?? "", estado: f.estado ?? "" })),
      })));
    } catch (e) {
      console.error("Erro ao carregar contas:", e);
    } finally {
      setCarregandoContas(false);
    }
  }, []);

  useEffect(() => { carregarContas(); }, [carregarContas]);

  // ─── Carregar contagens (por sub-item) ───────────────────────────────
  async function carregarContagens() {
    if (!contaLimpar || !fazendaLimpar) return;
    setCarregandoContagens(true);
    setContagens({});
    const chaves = GRUPOS.flatMap(g => g.subitens.map(sub => subKey(g.id, sub.id)));
    const { ok, json } = await postAdmin("/api/admin/limpeza", { conta_id: contaLimpar, fazenda_id: fazendaLimpar, chaves, aplicar: false });
    const novo: Record<string, number> = {};
    if (ok) for (const r of json.resultados as { chave: string; contar: number }[]) novo[r.chave] = r.contar;
    else setResultadoLimpeza([{ label: "Contagem", ok: false, deletados: 0, erros: [String(json.error ?? "Não foi possível contar os registros.")] }]);
    setContagens(novo);
    setCarregandoContagens(false);
    if (ok) setResultadoLimpeza(null);
  }

  // ─── Executar limpeza seletiva ────────────────────────────────────────
  async function executarLimpeza() {
    const contaObj = contas.find(c => c.id === contaLimpar);
    if (!contaObj || !fazendaLimpar || subSelecionados.size === 0) return;
    if (confirmaDeletar !== "CONFIRMO") return;
    setDeletandoDados(true);
    setResultadoLimpeza(null);
    const fazIds = fazendaLimpar === "todas" ? contaObj.fazendas.map(f => f.id) : [fazendaLimpar];
    const resultados: ResultGrupo[] = [];
    // Na ordem do catálogo: cada item é uma gravação. Se um não puder sair, ele fica inteiro e os outros seguem.
    const chaves = GRUPOS.flatMap(g => g.subitens.map(sub => subKey(g.id, sub.id))).filter(k => subSelecionados.has(k));
    const { ok, json } = await postAdmin("/api/admin/limpeza", { conta_id: contaLimpar, fazenda_id: fazendaLimpar, chaves, aplicar: true, confirmacao: "CONFIRMO" });
    if (!ok) resultados.push({ label: "Limpeza", ok: false, deletados: 0, erros: [String(json.error ?? "Erro na limpeza.")] });
    else for (const r of json.resultados as { label: string; ok: boolean; total: number; erro?: string }[]) {
      resultados.push({ label: r.label, ok: r.ok, deletados: r.total, erros: r.erro ? [r.erro] : [] });
    }
    if (chaves.some(k => k.endsWith("/zeramento"))) {
      const z = await postAdmin("/api/admin/zeramento-estoque", { fazenda_ids: fazIds, aplicar: true });
      resultados.push({ label: "Estoque & Compras · Zeramento de Estoque", ok: !!z.json.ok, deletados: Number(z.json.total ?? 0), erros: (z.json.erros as string[] | undefined) ?? (z.ok ? [] : [String(z.json.error ?? "Erro no zeramento")]) });
    }
    setResultadoLimpeza(resultados);
    setSubSelecionados(new Set());
    setConfirmaDeletar("");
    await carregarContagens();
    setDeletandoDados(false);
  }

  // ─── Excluir cliente completo ─────────────────────────────────────────
  async function excluirClienteCompleto() {
    const contaObj = contas.find(c => c.id === contaSelecionada);
    if (!contaObj || confirmaTexto !== contaObj.nome) return;
    setDeletandoCliente(true);
    setResultadoCliente(null);
    try {
      const previa = await postAdmin("/api/admin/cancelar-cliente", { conta_id: contaObj.id, acao: "previa" });
      if (!previa.ok) throw new Error(String(previa.json.error ?? "Não foi possível ler os dados do cliente."));
      const maiores = Object.entries(previa.json.tabelas as Record<string, number>).sort((a, b) => b[1] - a[1]).slice(0, 8)
        .map(([t, n]) => `• ${t}: ${n}`).join("\n");
      if (!window.confirm(`Serão apagados ${previa.json.total} registro(s), ${previa.json.fazendas} fazenda(s) e ${previa.json.usuarios} login(s) de "${contaObj.nome}". Uma cópia é guardada antes.\n\nOs maiores:\n${maiores}\n\nContinuar?`)) return;
      const { ok, json } = await postAdmin("/api/admin/cancelar-cliente", { conta_id: contaObj.id, acao: "excluir", confirmacao: confirmaTexto });
      if (!ok) throw new Error(String(json.error ?? "Erro na exclusão."));
      setResultadoCliente({ ok: true, msg: `Cliente "${contaObj.nome}" excluído. ${json.registros} registro(s) e ${json.users_removidos} login(s) removidos. Cópia em backups/${json.backup}.` });
      setContaSelecionada(""); setConfirmaTexto("");
      await carregarContas();
    } catch (e) {
      setResultadoCliente({ ok: false, msg: `Nada foi excluído. ${e instanceof Error ? e.message : String(e)}` });
    } finally {
      setDeletandoCliente(false);
    }
  }

  // ─── Helpers ─────────────────────────────────────────────────────────
  const contaExcluirObj = contas.find(c => c.id === contaSelecionada) ?? null;
  const contaLimparObj  = contas.find(c => c.id === contaLimpar) ?? null;
  const fazLimparNome   = fazendaLimpar === "todas"
    ? "Todas as fazendas"
    : contaLimparObj?.fazendas.find(f => f.id === fazendaLimpar)?.nome ?? "";

  const totalSelecionado = Array.from(subSelecionados).reduce((acc, key) => acc + (contagens[key] ?? 0), 0);

  function toggleSub(grupoId: string, subId: string) {
    const key = subKey(grupoId, subId);
    const novo = new Set(subSelecionados);
    if (novo.has(key)) novo.delete(key); else novo.add(key);
    setSubSelecionados(novo);
  }

  function toggleGrupoTudo(grupo: Grupo) {
    const keys = grupo.subitens.map(s => subKey(grupo.id, s.id));
    const todosSelecionados = keys.every(k => subSelecionados.has(k));
    const novo = new Set(subSelecionados);
    if (todosSelecionados) keys.forEach(k => novo.delete(k));
    else keys.forEach(k => novo.add(k));
    setSubSelecionados(novo);
  }

  function selecionarTudo() {
    const novo = new Set<string>();
    GRUPOS.forEach(g => g.subitens.forEach(s => novo.add(subKey(g.id, s.id))));
    setSubSelecionados(novo);
  }

  const card: React.CSSProperties = { background: "white", borderRadius: 10, border: "0.5px solid var(--border)" };

  return (
    <div>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <div data-arato-page-heading="true" style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
          <h1 data-arato-h1="true" style={{ margin: 0, fontSize: 20, fontWeight: 700, color: "var(--text-1)" }}>Dados & Limpeza de Clientes</h1>
          <span style={{ padding: "2px 10px", background: "#E24B4A", color: "white", borderRadius: 20, fontSize: 11, fontWeight: 700 }}>ZONA DE PERIGO</span>
        </div>
        <p style={{ margin: 0, fontSize: 13, color: "#666" }}>Ações irreversíveis de gestão de dados. Todas as exclusões são permanentes e não podem ser desfeitas.</p>
      </div>

      {/* Abas */}
      <div style={{ display: "flex", gap: 10, marginBottom: 24 }}>
        {([
          { id: "excluir_cliente" as Aba, icon: "🗑️", label: "Excluir Cliente",  desc: "Remove a conta e TODOS os dados permanentemente" },
          { id: "limpar_dados"    as Aba, icon: "🧹", label: "Limpar Dados",     desc: "Selecione exatamente quais dados excluir" },
          { id: "manutencao"      as Aba, icon: "🔧", label: "Manutenção",       desc: "Corrigir dados faltantes em massa (IBGE, etc.)" },
        ]).map(a => (
          <button data-arato-button="toggle" key={a.id} onClick={() => { setAba(a.id); setResultadoCliente(null); setResultadoLimpeza(null); }}
            style={{ padding: "12px 20px", borderRadius: 10, cursor: "pointer", border: `2px solid ${aba === a.id ? "#E24B4A" : "var(--border)"}`, background: aba === a.id ? "#FFF0F0" : "white", textAlign: "left", minWidth: 220 }}>
            <div style={{ fontSize: 18, marginBottom: 4 }}>{a.icon}</div>
            <div style={{ fontWeight: 700, fontSize: 13, color: aba === a.id ? "#E24B4A" : "var(--text-1)" }}>{a.label}</div>
            <div style={{ fontSize: 11, color: "var(--text-3)", marginTop: 2 }}>{a.desc}</div>
          </button>
        ))}
      </div>

      {/* ─── ABA: EXCLUIR CLIENTE ───────────────────────────────────────────── */}
      {aba === "excluir_cliente" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div data-arato-panel="true" style={{ ...card, padding: "14px 16px", display: "flex", alignItems: "center", gap: 12 }}>
            <span style={{ fontWeight: 600, fontSize: 12, color: "var(--text-2)", whiteSpace: "nowrap" }}>1. Cliente</span>
            <SelectField value={contaSelecionada}
              onChange={e => { setContaSelecionada(e.target.value); setConfirmaTexto(""); setResultadoCliente(null); }}
              style={{ flex: 1, padding: "8px 10px", border: "0.5px solid var(--border)", borderRadius: 8, fontSize: 13, outline: "none", background: "white" }}>
              <option value="">— selecione —</option>
              {contas.map(c => <option key={c.id} value={c.id}>{c.nome} ({c.fazendas.length} faz.)</option>)}
            </SelectField>
            <button data-arato-button="secondary" onClick={carregarContas} title="Recarregar" style={{ padding: "7px 10px", border: "0.5px solid var(--border)", borderRadius: 8, fontSize: 13, background: "white", cursor: "pointer", color: "var(--text-2)" }}>
              {carregandoContas ? "⏳" : "↺"}
            </button>
          </div>

          <div>
            {!contaExcluirObj ? (
              <div style={{ ...card, padding: 40, textAlign: "center", color: "var(--text-muted)", fontSize: 14 }}>Selecione um cliente à esquerda.</div>
            ) : (
              <>
                <div style={{ background: "#FFF0F0", border: "1.5px solid #E24B4A", borderRadius: 10, padding: "14px 18px", marginBottom: 16 }}>
                  <div style={{ fontWeight: 700, fontSize: 14, color: "#E24B4A", marginBottom: 6 }}>⚠️ Operação irreversível</div>
                  <div style={{ fontSize: 13, color: "#7A1A1A", lineHeight: 1.7 }}>
                    Você está prestes a excluir permanentemente a conta <strong>{contaExcluirObj.nome}</strong>, suas <strong>{contaExcluirObj.fazendas.length} fazenda{contaExcluirObj.fazendas.length !== 1 ? "s" : ""}</strong> e todos os dados vinculados.
                  </div>
                  {contaExcluirObj.fazendas.length > 0 && (
                    <div style={{ marginTop: 10, display: "flex", gap: 6, flexWrap: "wrap" }}>
                      {contaExcluirObj.fazendas.map(f => (
                        <span key={f.id} style={{ padding: "3px 8px", background: "#FFF", border: "0.5px solid #E24B4A40", borderRadius: 16, fontSize: 11, color: "#7A1A1A" }}>
                          {f.nome} · {f.municipio}/{f.estado}
                        </span>
                      ))}
                    </div>
                  )}
                  <div style={{ marginTop: 10, fontSize: 11, color: "#999" }}>Só exclui cliente com acesso cancelado ou em teste. Antes de apagar, guarda uma cópia em backups. Se algo não puder sair, nada é apagado. Os logins do cliente saem junto; arquivos no Storage (XML, PDF) ficam.</div>
                </div>
                <div data-arato-panel="true" style={{ ...card, padding: "18px 22px" }}>
                  <div style={{ fontWeight: 600, fontSize: 13, color: "var(--text-1)", marginBottom: 8 }}>Para confirmar, digite exatamente o nome da conta:</div>
                  <code style={{ display: "block", background: "var(--bg-page)", padding: "6px 12px", borderRadius: 6, fontSize: 14, color: "#111111", fontWeight: 700, marginBottom: 10 }}>{contaExcluirObj.nome}</code>
                  <input value={confirmaTexto} onChange={e => setConfirmaTexto(e.target.value)} placeholder="Digite o nome da conta aqui..."
                    style={{ width: "100%", padding: "9px 12px", fontSize: 13, boxSizing: "border-box", border: `1.5px solid ${confirmaTexto === contaExcluirObj.nome ? "#E24B4A" : "var(--border)"}`, borderRadius: 8, outline: "none" }} />
                  <button data-arato-button="toggle" onClick={excluirClienteCompleto} disabled={confirmaTexto !== contaExcluirObj.nome || deletandoCliente}
                    style={{ marginTop: 14, width: "100%", padding: "11px 0", borderRadius: 8, border: "none", background: confirmaTexto !== contaExcluirObj.nome ? "var(--border)" : "#E24B4A", color: confirmaTexto !== contaExcluirObj.nome ? "var(--text-3)" : "white", fontWeight: 700, fontSize: 14, cursor: confirmaTexto !== contaExcluirObj.nome ? "default" : "pointer" }}>
                    {deletandoCliente ? "⏳ Excluindo..." : `🗑️ Excluir "${contaExcluirObj.nome}" permanentemente`}
                  </button>
                </div>
              </>
            )}
            {resultadoCliente && (
              <div style={{ marginTop: 14, padding: "14px 18px", borderRadius: 10, background: resultadoCliente.ok ? "#DCFCE7" : "#FFF0F0", border: `0.5px solid ${resultadoCliente.ok ? "#16A34A" : "#E24B4A"}` }}>
                <div style={{ fontWeight: 700, color: resultadoCliente.ok ? "#15803D" : "#E24B4A", marginBottom: 4 }}>
                  {resultadoCliente.ok ? "✓ Excluído com sucesso" : "✗ Erro na exclusão"}
                </div>
                <div style={{ fontSize: 12, color: resultadoCliente.ok ? "#166534" : "#7A1A1A", lineHeight: 1.6 }}>{resultadoCliente.msg}</div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ─── ABA: LIMPAR DADOS ─────────────────────────────────────────────── */}
      {aba === "limpar_dados" && (
        <div data-arato-item-grid="true" style={{ display: "grid", gridTemplateColumns: "260px 1fr", gap: 20, alignItems: "flex-start" }}>

          {/* Painel esquerdo */}
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div data-arato-panel="true" style={{ ...card, padding: "14px 16px" }}>
              <div style={{ fontWeight: 600, fontSize: 12, color: "var(--text-2)", marginBottom: 6 }}>1. Cliente</div>
              <SelectField value={contaLimpar}
                onChange={e => { setContaLimpar(e.target.value); setFazendaLimpar(""); setContagens({}); setSubSelecionados(new Set()); setResultadoLimpeza(null); }}
                style={{ width: "100%", padding: "8px 10px", border: "0.5px solid var(--border)", borderRadius: 8, fontSize: 13, outline: "none", background: "white" }}>
                <option value="">— selecione —</option>
                {contas.map(c => <option key={c.id} value={c.id}>{c.nome} ({c.fazendas.length} faz.)</option>)}
              </SelectField>
            </div>

            {contaLimparObj && (
              <div data-arato-panel="true" style={{ ...card, padding: "14px 16px" }}>
                <div style={{ fontWeight: 600, fontSize: 12, color: "var(--text-2)", marginBottom: 6 }}>2. Fazenda</div>
                <SelectField value={fazendaLimpar}
                  onChange={e => { setFazendaLimpar(e.target.value); setContagens({}); setSubSelecionados(new Set()); setResultadoLimpeza(null); }}
                  style={{ width: "100%", padding: "8px 10px", border: "0.5px solid var(--border)", borderRadius: 8, fontSize: 13, outline: "none", background: "white" }}>
                  <option value="">— selecione —</option>
                  {contaLimparObj.fazendas.length > 1 && <option value="todas">Todas as fazendas</option>}
                  {contaLimparObj.fazendas.map(f => <option key={f.id} value={f.id}>{f.nome} ({f.municipio}/{f.estado})</option>)}
                </SelectField>
                {fazendaLimpar && (
                  <button data-arato-button="secondary" onClick={carregarContagens} disabled={carregandoContagens}
                    style={{ marginTop: 10, width: "100%", padding: "7px 0", border: "0.5px solid #111111", borderRadius: 8, background: "white", color: "#111111", fontWeight: 600, fontSize: 12, cursor: "pointer" }}>
                    {carregandoContagens ? "⏳ Contando..." : "↺ Carregar contagens"}
                  </button>
                )}
              </div>
            )}

            {/* Resumo da seleção */}
            {subSelecionados.size > 0 && (
              <div style={{ background: "#FFF0F0", borderRadius: 10, border: "0.5px solid #E24B4A", padding: "12px 14px" }}>
                <div style={{ fontWeight: 700, fontSize: 12, color: "#E24B4A", marginBottom: 6 }}>
                  {subSelecionados.size} item{subSelecionados.size !== 1 ? "s" : ""} selecionado{subSelecionados.size !== 1 ? "s" : ""}
                </div>
                {GRUPOS.flatMap(g => g.subitens.filter(s => subSelecionados.has(subKey(g.id, s.id))).map(s => (
                  <div key={subKey(g.id, s.id)} style={{ fontSize: 11, color: "#7A1A1A", marginTop: 3, display: "flex", justifyContent: "space-between" }}>
                    <span>• {g.label} · {s.label}</span>
                    <span style={{ fontWeight: 600 }}>{(contagens[subKey(g.id, s.id)] ?? 0).toLocaleString("pt-BR")}</span>
                  </div>
                )))}
                <div style={{ marginTop: 8, borderTop: "0.5px solid #E24B4A40", paddingTop: 6, fontWeight: 700, fontSize: 13, color: "#E24B4A", display: "flex", justifyContent: "space-between" }}>
                  <span>Total</span>
                  <span>{totalSelecionado.toLocaleString("pt-BR")} registros</span>
                </div>
              </div>
            )}

            <div style={{ padding: "10px 12px", background: "#FBF3E0", borderRadius: 8, border: "0.5px solid #C9921B", fontSize: 11, color: "#7A5A12", lineHeight: 1.7 }}>
              <strong>Passo a passo:</strong><br />
              1. Selecione cliente e fazenda<br />
              2. Carregue as contagens<br />
              3. Expanda os grupos e marque os itens<br />
              4. Digite <code>CONFIRMO</code><br />
              5. Execute a limpeza
            </div>
          </div>

          {/* Painel direito — accordion */}
          <div>
            {!fazendaLimpar ? (
              <div style={{ ...card, padding: 40, textAlign: "center", color: "var(--text-muted)", fontSize: 13 }}>
                Selecione cliente e fazenda para ver os grupos disponíveis.
              </div>
            ) : (
              <>
                {/* Header */}
                <div style={{ ...card, padding: "12px 18px", marginBottom: 12, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 14, color: "var(--text-1)" }}>{fazLimparNome}</div>
                    <div style={{ fontSize: 11, color: "var(--text-3)", marginTop: 2 }}>
                      {Object.keys(contagens).length > 0 ? "Clique em um grupo para expandir e selecionar itens" : "Clique em ↺ Carregar contagens"}
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button data-arato-button="secondary" onClick={selecionarTudo}
                      style={{ padding: "5px 10px", border: "0.5px solid var(--border)", borderRadius: 6, fontSize: 11, background: "white", cursor: "pointer", color: "var(--text-2)" }}>
                      Marcar tudo
                    </button>
                    <button data-arato-button="secondary" onClick={() => { setSubSelecionados(new Set()); setGruposExpandidos(new Set()); }}
                      style={{ padding: "5px 10px", border: "0.5px solid var(--border)", borderRadius: 6, fontSize: 11, background: "white", cursor: "pointer", color: "var(--text-2)" }}>
                      Limpar
                    </button>
                  </div>
                </div>

                {/* Accordion de grupos */}
                <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 18 }}>
                  {GRUPOS.map(grupo => {
                    const expandido = gruposExpandidos.has(grupo.id);
                    const subKeys = grupo.subitens.map(s => subKey(grupo.id, s.id));
                    const qtdSelecionados = subKeys.filter(k => subSelecionados.has(k)).length;
                    const qtdTotal = subKeys.reduce((acc, k) => acc + (contagens[k] ?? 0), 0);
                    const todosSelecionados = subKeys.length > 0 && subKeys.every(k => subSelecionados.has(k));
                    const algumSelecionado = subKeys.some(k => subSelecionados.has(k));

                    return (
                      <div key={grupo.id} style={{ border: `1.5px solid ${algumSelecionado ? grupo.cor : expandido ? grupo.cor + "60" : "var(--border)"}`, borderRadius: 10, overflow: "hidden", background: "white" }}>

                        {/* Cabeçalho do grupo — clica para expandir */}
                        <div
                          onClick={() => {
                            const novo = new Set(gruposExpandidos);
                            if (novo.has(grupo.id)) novo.delete(grupo.id); else novo.add(grupo.id);
                            setGruposExpandidos(novo);
                          }}
                          style={{ padding: "12px 16px", cursor: "pointer", display: "flex", alignItems: "center", gap: 10, background: algumSelecionado ? grupo.bg : expandido ? grupo.bg + "80" : "white", userSelect: "none" }}
                        >
                          <span style={{ fontSize: 16 }}>{grupo.icon}</span>
                          <div style={{ flex: 1 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                              <span style={{ fontWeight: 700, fontSize: 13, color: algumSelecionado ? grupo.cor : "var(--text-1)" }}>{grupo.label}</span>
                              {qtdSelecionados > 0 && (
                                <span style={{ padding: "1px 7px", background: grupo.cor, color: "white", borderRadius: 12, fontSize: 10, fontWeight: 700 }}>
                                  {qtdSelecionados}/{grupo.subitens.length}
                                </span>
                              )}
                            </div>
                            <div style={{ fontSize: 11, color: "var(--text-3)", marginTop: 1 }}>
                              {grupo.subitens.length} categoria{grupo.subitens.length !== 1 ? "s" : ""}
                              {Object.keys(contagens).length > 0 && qtdTotal > 0 && (
                                <span style={{ marginLeft: 6, color: grupo.cor, fontWeight: 600 }}>· {qtdTotal.toLocaleString("pt-BR")} registros</span>
                              )}
                            </div>
                          </div>
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            {expandido && (
                              <button data-arato-button="toggle"
                                onClick={e => { e.stopPropagation(); toggleGrupoTudo(grupo); }}
                                style={{ padding: "3px 9px", border: `0.5px solid ${grupo.cor}`, borderRadius: 6, fontSize: 11, background: todosSelecionados ? grupo.cor : "white", color: todosSelecionados ? "white" : grupo.cor, cursor: "pointer", fontWeight: 600 }}
                              >
                                {todosSelecionados ? "Desmarcar todos" : "Selecionar todos"}
                              </button>
                            )}
                            <span style={{ color: "var(--text-muted)", fontSize: 14, transform: expandido ? "rotate(90deg)" : "none", transition: "transform 0.15s" }}>›</span>
                          </div>
                        </div>

                        {/* Sub-itens — visíveis quando expandido */}
                        {expandido && (
                          <div style={{ borderTop: `0.5px solid ${grupo.cor}30` }}>
                            {grupo.subitens.map((sub, idx) => {
                              const key = subKey(grupo.id, sub.id);
                              const sel = subSelecionados.has(key);
                              const qtd = contagens[key] ?? null;
                              return (
                                <div
                                  key={sub.id}
                                  onClick={() => toggleSub(grupo.id, sub.id)}
                                  style={{
                                    padding: "10px 16px 10px 20px",
                                    borderBottom: idx < grupo.subitens.length - 1 ? `0.5px solid ${grupo.cor}20` : "none",
                                    display: "flex", alignItems: "flex-start", gap: 10,
                                    cursor: "pointer",
                                    background: sel ? grupo.bg : "white",
                                    transition: "background 0.1s",
                                  }}
                                >
                                  {/* Checkbox */}
                                  <div style={{ marginTop: 1, width: 16, height: 16, borderRadius: 4, border: `2px solid ${sel ? grupo.cor : "var(--border)"}`, background: sel ? grupo.cor : "white", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                                    {sel && <span style={{ color: "white", fontSize: 10 }}>✓</span>}
                                  </div>

                                  <span style={{ fontSize: 14, flexShrink: 0 }}>{sub.icon}</span>

                                  <div style={{ flex: 1 }}>
                                    <div style={{ fontWeight: sel ? 600 : 400, fontSize: 13, color: sel ? grupo.cor : "var(--text-1)" }}>{sub.label}</div>
                                    {sub.aviso && sel && (
                                      <div style={{ marginTop: 4, padding: "4px 8px", background: "#FBF3E0", borderRadius: 5, fontSize: 11, color: "#7A5A12", lineHeight: 1.4 }}>
                                        ⚠️ {sub.aviso}
                                      </div>
                                    )}
                                  </div>

                                  {qtd !== null ? (
                                    <span style={{ padding: "2px 8px", borderRadius: 12, fontSize: 11, fontWeight: 700, background: qtd > 0 ? (sel ? grupo.cor : grupo.bg) : "var(--bg-page)", color: qtd > 0 ? (sel ? "white" : grupo.cor) : "var(--text-muted)", border: `0.5px solid ${qtd > 0 ? grupo.cor + "40" : "var(--border)"}`, flexShrink: 0 }}>
                                      {qtd.toLocaleString("pt-BR")}
                                    </span>
                                  ) : carregandoContagens ? (
                                    <span style={{ fontSize: 11, color: "var(--text-muted)" }}>...</span>
                                  ) : null}
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Confirmação */}
                {subSelecionados.size > 0 && (
                  <div data-arato-panel="true" style={{ ...card, border: "1.5px solid #E24B4A", padding: "18px 22px" }}>
                    <div style={{ fontWeight: 600, fontSize: 13, color: "var(--text-1)", marginBottom: 8 }}>
                      Digite <code style={{ background: "var(--bg-page)", padding: "2px 7px", borderRadius: 4, color: "#E24B4A", fontWeight: 700 }}>CONFIRMO</code> para habilitar:
                    </div>
                    <input value={confirmaDeletar} onChange={e => setConfirmaDeletar(e.target.value)} placeholder="Digite CONFIRMO"
                      style={{ width: "100%", padding: "9px 12px", fontSize: 13, boxSizing: "border-box", border: `1.5px solid ${confirmaDeletar === "CONFIRMO" ? "#E24B4A" : "var(--border)"}`, borderRadius: 8, outline: "none" }} />
                    <button data-arato-button="toggle" onClick={executarLimpeza} disabled={confirmaDeletar !== "CONFIRMO" || deletandoDados}
                      style={{ marginTop: 12, width: "100%", padding: "11px 0", borderRadius: 8, border: "none", background: confirmaDeletar !== "CONFIRMO" ? "var(--border)" : "#E24B4A", color: confirmaDeletar !== "CONFIRMO" ? "var(--text-3)" : "white", fontWeight: 700, fontSize: 14, cursor: confirmaDeletar !== "CONFIRMO" ? "default" : "pointer" }}>
                      {deletandoDados
                        ? "⏳ Limpando..."
                        : `🧹 Limpar ${subSelecionados.size} item${subSelecionados.size !== 1 ? "s" : ""} · ${totalSelecionado.toLocaleString("pt-BR")} registros`}
                    </button>
                  </div>
                )}

                {/* Resultado */}
                {resultadoLimpeza && (
                  <div style={{ marginTop: 14, ...card, overflow: "hidden" }}>
                    <div style={{ padding: "10px 18px", borderBottom: "0.5px solid var(--border)", fontWeight: 700, fontSize: 13, color: "var(--text-1)" }}>Resultado da limpeza</div>
                    {resultadoLimpeza.map((r, i) => (
                      <div key={i} style={{ padding: "10px 18px", borderBottom: "0.5px solid var(--border)", display: "flex", gap: 10, alignItems: "flex-start" }}>
                        <span style={{ fontSize: 14 }}>{r.ok ? "✅" : "⚠️"}</span>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontWeight: 600, fontSize: 13, color: r.ok ? "#15803D" : "#C9921B" }}>
                            {r.label}
                            {r.deletados > 0 && <span style={{ fontWeight: 400, color: "var(--text-3)", marginLeft: 8 }}>— {r.deletados.toLocaleString("pt-BR")} registros removidos</span>}
                          </div>
                          {r.erros.map((e, j) => <div key={j} style={{ fontSize: 11, color: "#E24B4A", marginTop: 2 }}>✗ {e}</div>)}
                        </div>
                      </div>
                    ))}
                    <div style={{ padding: "10px 18px", background: "var(--bg-page)", display: "flex", justifyContent: "space-between", fontSize: 12 }}>
                      <span style={{ color: "#16A34A", fontWeight: 600 }}>✓ {resultadoLimpeza.filter(r => r.ok).length}/{resultadoLimpeza.length} itens limpos</span>
                      <span style={{ color: "var(--text-3)" }}>{resultadoLimpeza.reduce((acc, r) => acc + r.deletados, 0).toLocaleString("pt-BR")} registros removidos</span>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {/* ─── ABA: MANUTENÇÃO ──────────────────────────────────────────────────── */}
      {aba === "manutencao" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <CompletarPessoas />
        </div>
      )}
    </div>
  );
}
