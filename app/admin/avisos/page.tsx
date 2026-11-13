"use client";
// Gestão Arato → Avisos aos Clientes. A equipe Raccolto escreve o aviso e ele aparece em popup para os usuários dos
// clientes (components/AvisosSistema.tsx), que dão ciência. Aqui: criar/editar com prévia igual à do cliente, escolher
// público e período, tirar do ar e ver quem já leu e quem ainda não. Rotas em /api/admin/avisos; regras em lib/avisos.ts.
import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../../lib/supabase";
import { confirmarAcao } from "../../../components/ConfirmarAcao";
import { CartaoAviso } from "../../../components/AvisosSistema";
import { STATUS_AVISO, TIPOS_AVISO, statusAviso, validarAviso, type Aviso, type StatusAviso, type TipoAviso } from "../../../lib/avisos";

type AvisoLinha = Aviso & { ciencias: number; usuarios_publico: number; pendentes: number; criado_por?: string | null };
type Conta = { id: string; nome: string };
type Pessoa = { user_id: string; cliente: string; nome: string | null; email: string | null; ciente_em?: string };

const fmtDt = (iso?: string | null) => iso ? new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—";
const doisDig = (n: number) => String(n).padStart(2, "0");
/** ISO → valor do campo data-hora (no fuso do computador). */
const paraCampo = (iso?: string | null) => {
  if (!iso) return "";
  const d = new Date(iso);
  return `${d.getFullYear()}-${doisDig(d.getMonth() + 1)}-${doisDig(d.getDate())}T${doisDig(d.getHours())}:${doisDig(d.getMinutes())}`;
};
const doCampo = (v: string) => v ? new Date(v).toISOString() : null;

const LINKS_SUGERIDOS: [string, string][] = [
  ["/", "Início"], ["/fiscal", "Painel de Notas"], ["/fiscal/documentos", "Documentos Fiscais"], ["/financeiro/pagar", "Contas a Pagar"],
  ["/financeiro/receber", "Contas a Receber"], ["/financeiro", "Fluxo de Caixa"], ["/financeiro/folha", "Folha de Pagamento"],
  ["/estoque", "Estoque"], ["/contratos", "Contratos de Grãos"], ["/compras", "Pedidos de Compra"], ["/atualizacoes", "Central de Atualizações"],
  ["/configuracoes/usuarios", "Usuários e Permissões"],
];

const MODELOS: { nome: string; aviso: Partial<Aviso> }[] = [
  { nome: "Parada programada", aviso: { tipo: "manutencao", obrigatorio: true, titulo: "Parada programada do Arato", mensagem: "Olá! No **sábado, dd/mm, das 19h às 22h** (horário de Mato Grosso), o Arato ficará fora do ar para uma melhoria de infraestrutura.\n\n- Nenhum dado será perdido.\n- Depois da parada, será preciso **entrar de novo** com o mesmo e-mail e senha de sempre.\n- Se possível, conclua os lançamentos antes desse horário.\n\nQualquer dúvida, fale com a Olívia no canto da tela." } },
  { nome: "Novidade", aviso: { tipo: "informativo", obrigatorio: false, titulo: "Novidade no Arato", mensagem: "Olá! Temos uma novidade:\n\n- **O que mudou:** …\n- **Onde encontrar:** …\n\nSe não achar alguma coisa, é só chamar a Olívia no canto da tela." } },
  { nome: "Importante", aviso: { tipo: "importante", obrigatorio: true, titulo: "Atenção", mensagem: "Olá! Precisamos da sua atenção para …" } },
];

const vazio = (): Partial<Aviso> => ({ titulo: "", mensagem: "", tipo: "informativo", publico: "todos", conta_ids: [], inicio: new Date().toISOString(), fim: null, obrigatorio: false, botao_texto: "", botao_link: "", ativo: true });

async function api(metodo: "GET" | "POST", corpo?: unknown, query = "") {
  const { data: { session } } = await supabase.auth.getSession();
  const r = await fetch(`/api/admin/avisos${query}`, {
    method: metodo, cache: "no-store",
    headers: { ...(corpo ? { "Content-Type": "application/json" } : {}), Authorization: `Bearer ${session?.access_token ?? ""}` },
    body: corpo ? JSON.stringify(corpo) : undefined,
  });
  const j = await r.json().catch(() => ({ ok: false, error: `Erro ${r.status}` }));
  if (!r.ok || j.ok === false) throw new Error(j.error || `Erro ${r.status}`);
  return j;
}

const inp: React.CSSProperties = { width: "100%", boxSizing: "border-box", padding: "8px 10px", border: "0.5px solid #DDE2EE", borderRadius: 8, fontSize: 13, fontFamily: "inherit", background: "#fff", color: "#1a1a1a" };
const lbl: React.CSSProperties = { display: "block", fontSize: 11, color: "#555", marginBottom: 4, fontWeight: 600 };
const btnP: React.CSSProperties = { padding: "8px 16px", borderRadius: 8, border: "none", background: "#1A4870", color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer" };
const btnS: React.CSSProperties = { padding: "6px 10px", borderRadius: 8, border: "0.5px solid #DDE2EE", background: "#fff", color: "#1a1a1a", fontSize: 12, cursor: "pointer" };

export default function AvisosAdminPage() {
  const [avisos, setAvisos] = useState<AvisoLinha[]>([]);
  const [contas, setContas] = useState<Conta[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");
  const [filtro, setFiltro] = useState<StatusAviso | "todos">("todos");
  const [editando, setEditando] = useState<Partial<Aviso> | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [erroForm, setErroForm] = useState("");
  const [buscaConta, setBuscaConta] = useState("");
  const [ciencias, setCiencias] = useState<{ aviso: AvisoLinha; cientes: Pessoa[]; pendentes: Pessoa[] } | "carregando" | null>(null);
  const [abaCiencia, setAbaCiencia] = useState<"cientes" | "pendentes">("cientes");

  async function carregar() {
    setCarregando(true); setErro("");
    try {
      const j = await api("GET");
      setAvisos(j.avisos ?? []); setContas(j.contas ?? []);
    } catch (e) { setErro(e instanceof Error ? e.message : String(e)); }
    finally { setCarregando(false); }
  }
  useEffect(() => { carregar(); }, []);

  const agora = new Date();
  const contagem = useMemo(() => {
    const c: Record<string, number> = { todos: avisos.length };
    for (const a of avisos) { const s = statusAviso(a); c[s] = (c[s] ?? 0) + 1; }
    return c;
  }, [avisos]);
  const lista = avisos.filter(a => filtro === "todos" || statusAviso(a) === filtro);
  const nomeConta = useMemo(() => new Map(contas.map(c => [c.id, c.nome])), [contas]);

  function abrirNovo(base?: Partial<Aviso>) {
    setErroForm(""); setBuscaConta("");
    setEditando({ ...vazio(), ...(base ?? {}) });
  }
  function duplicar(a: AvisoLinha) {
    abrirNovo({ titulo: a.titulo, mensagem: a.mensagem, tipo: a.tipo, publico: a.publico, conta_ids: a.conta_ids ?? [], obrigatorio: a.obrigatorio, botao_texto: a.botao_texto ?? "", botao_link: a.botao_link ?? "" });
  }

  async function salvar() {
    if (!editando) return;
    const msg = validarAviso(editando);
    if (msg) { setErroForm(msg); return; }
    setSalvando(true); setErroForm("");
    try {
      await api("POST", { operacao: "salvar", aviso: editando });
      setEditando(null);
      await carregar();
    } catch (e) { setErroForm(e instanceof Error ? e.message : String(e)); }
    finally { setSalvando(false); }
  }

  async function acao(a: AvisoLinha, operacao: "ativar" | "encerrar" | "excluir", extra: Record<string, unknown> = {}) {
    const textos = {
      encerrar: { titulo: "Tirar do ar", mensagem: `O aviso "${a.titulo}" deixa de aparecer para os clientes agora. Quem já deu ciência continua registrado.`, perigo: false },
      excluir: { titulo: "Excluir aviso", mensagem: `Excluir "${a.titulo}" e o registro de ciência de ${a.ciencias} usuário(s)? Não dá para desfazer. Para só parar de mostrar, use Tirar do ar.`, perigo: true },
      ativar: { titulo: extra.ativo ? "Reativar aviso" : "Desativar aviso", mensagem: extra.ativo ? `O aviso "${a.titulo}" volta a aparecer, no período configurado, para quem ainda não deu ciência.` : `O aviso "${a.titulo}" deixa de aparecer.`, perigo: false },
    }[operacao];
    if (!(await confirmarAcao(textos))) return;
    try { await api("POST", { operacao, id: a.id, ...extra }); await carregar(); }
    catch (e) { setErro(e instanceof Error ? e.message : String(e)); }
  }

  async function verCiencias(a: AvisoLinha) {
    setCiencias("carregando"); setAbaCiencia("cientes");
    try {
      const j = await api("GET", undefined, `?ciencias=${a.id}`);
      setCiencias({ aviso: a, cientes: j.cientes ?? [], pendentes: j.pendentes ?? [] });
    } catch (e) { setCiencias(null); setErro(e instanceof Error ? e.message : String(e)); }
  }

  const contasFiltradas = contas.filter(c => !buscaConta.trim() || c.nome.toLowerCase().includes(buscaConta.trim().toLowerCase()));
  const set = (p: Partial<Aviso>) => setEditando(e => e ? { ...e, ...p } : e);

  return (
    <div>
      <div data-arato-page-heading="true" style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, flexWrap: "wrap", marginBottom: 20 }}>
        <div>
          <h1 data-arato-h1="true" style={{ fontSize: 22, fontWeight: 800, color: "#0D0D0D", margin: "0 0 4px" }}>Avisos aos Clientes</h1>
          <div style={{ fontSize: 13, color: "#555", maxWidth: 720 }}>
            O aviso aparece em uma janela para os usuários dos clientes escolhidos, no período definido, até cada um clicar em <strong>Li e estou ciente</strong>. Aviso publicado com o cliente já logado aparece em até 10 minutos.
          </div>
        </div>
        <button style={btnP} onClick={() => abrirNovo()}>+ Novo aviso</button>
      </div>

      {erro && (
        <div style={{ background: /Seção 448/.test(erro) ? "#FBF3E0" : "#FCEBEB", border: "0.5px solid #E8D5A8", borderRadius: 8, padding: "10px 14px", fontSize: 13, color: /Seção 448/.test(erro) ? "#7A5A10" : "#791F1F", marginBottom: 16 }}>{erro}</div>
      )}

      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
        {(["todos", "no_ar", "agendado", "encerrado", "desativado"] as const).map(s => (
          <button key={s} onClick={() => setFiltro(s)} style={{ ...btnS, background: filtro === s ? "#D5E8F5" : "#fff", borderColor: filtro === s ? "#1A4870" : "#DDE2EE", color: filtro === s ? "#0B2D50" : "#1a1a1a", fontWeight: filtro === s ? 600 : 400 }}>
            {s === "todos" ? "Todos" : STATUS_AVISO[s].rotulo} ({contagem[s] ?? 0})
          </button>
        ))}
      </div>

      <div style={{ background: "#fff", borderRadius: 12, border: "0.5px solid #DDE2EE", overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, minWidth: 900 }}>
          <thead>
            <tr style={{ background: "#F4F6FA" }}>
              {["Aviso", "Público", "Período", "Situação", "Ciência", ""].map((h, i) => (
                <th key={i} style={{ padding: "10px 12px", textAlign: "left", fontSize: 11, fontWeight: 600, color: "#555", borderBottom: "0.5px solid #DDE2EE" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {carregando && <tr><td colSpan={6} style={{ padding: 24, textAlign: "center", color: "#666" }}>Carregando…</td></tr>}
            {!carregando && lista.length === 0 && <tr><td colSpan={6} style={{ padding: 24, textAlign: "center", color: "#666" }}>{avisos.length ? "Nenhum aviso nesta situação." : "Nenhum aviso cadastrado ainda. Clique em + Novo aviso."}</td></tr>}
            {lista.map(a => {
              const st = statusAviso(a, agora);
              const tipo = TIPOS_AVISO[a.tipo];
              const pct = a.usuarios_publico ? Math.round(a.ciencias / Math.max(a.usuarios_publico, a.ciencias) * 100) : 0;
              return (
                <tr key={a.id} style={{ borderBottom: "0.5px solid #F0F2F7" }}>
                  <td style={{ padding: "10px 12px", maxWidth: 360 }}>
                    <div style={{ fontWeight: 600, color: "#1a1a1a" }}>{a.titulo}</div>
                    <div style={{ display: "flex", gap: 6, marginTop: 4, flexWrap: "wrap" }}>
                      <span style={{ fontSize: 10, fontWeight: 600, color: tipo.cor, background: tipo.fundo, borderRadius: 4, padding: "1px 6px" }}>{tipo.icone} {tipo.rotulo}</span>
                      {a.obrigatorio && <span style={{ fontSize: 10, fontWeight: 600, color: "#7A5A10", background: "#FBF3E0", borderRadius: 4, padding: "1px 6px" }}>Obrigatório</span>}
                    </div>
                  </td>
                  <td style={{ padding: "10px 12px", color: "#555", maxWidth: 220 }}>
                    {a.publico === "todos" ? "Todos os clientes" : (
                      <span title={(a.conta_ids ?? []).map(id => nomeConta.get(id) ?? id).join(", ")}>
                        {(a.conta_ids ?? []).length === 1 ? nomeConta.get(a.conta_ids![0]) ?? "1 cliente" : `${(a.conta_ids ?? []).length} clientes`}
                      </span>
                    )}
                  </td>
                  <td style={{ padding: "10px 12px", color: "#555", whiteSpace: "nowrap", fontSize: 12 }}>
                    {fmtDt(a.inicio)}<br /><span style={{ color: "#666" }}>{a.fim ? `até ${fmtDt(a.fim)}` : "sem data de fim"}</span>
                  </td>
                  <td style={{ padding: "10px 12px" }}>
                    <span style={{ fontSize: 11, fontWeight: 600, color: STATUS_AVISO[st].cor, background: STATUS_AVISO[st].fundo, borderRadius: 4, padding: "2px 8px", whiteSpace: "nowrap" }}>{STATUS_AVISO[st].rotulo}</span>
                  </td>
                  <td style={{ padding: "10px 12px", minWidth: 150 }}>
                    <button onClick={() => verCiencias(a)} style={{ background: "none", border: "none", padding: 0, cursor: "pointer", textAlign: "left", width: "100%" }} title="Ver quem já leu e quem ainda não">
                      <div style={{ fontSize: 12, color: "#1a1a1a" }}><strong>{a.ciencias}</strong> de {a.usuarios_publico} usuários</div>
                      <div style={{ height: 5, background: "#EEF1F6", borderRadius: 3, marginTop: 4, overflow: "hidden" }}><div style={{ width: `${pct}%`, height: "100%", background: "#16A34A" }} /></div>
                    </button>
                  </td>
                  <td style={{ padding: "10px 12px", whiteSpace: "nowrap", textAlign: "right" }}>
                    <div style={{ display: "inline-flex", gap: 6 }}>
                      <button style={btnS} onClick={() => { setErroForm(""); setBuscaConta(""); setEditando({ ...a, conta_ids: a.conta_ids ?? [], botao_texto: a.botao_texto ?? "", botao_link: a.botao_link ?? "" }); }}>Editar</button>
                      <button style={btnS} onClick={() => duplicar(a)}>Duplicar</button>
                      {(st === "no_ar" || st === "agendado") && <button style={btnS} onClick={() => acao(a, "encerrar")}>Tirar do ar</button>}
                      {st === "desativado" && <button style={btnS} onClick={() => acao(a, "ativar", { ativo: true })}>Reativar</button>}
                      <button style={{ ...btnS, color: "#A32D2D" }} onClick={() => acao(a, "excluir")}>Excluir</button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* ── Editor ── */}
      {editando && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(11,45,80,0.32)", zIndex: 2000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
          <div style={{ background: "#F4F6FA", borderRadius: 14, width: "100%", maxWidth: 1180, maxHeight: "94vh", overflowY: "auto", boxShadow: "0 4px 20px rgba(11,45,80,0.18)" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 20px", background: "#fff", borderBottom: "0.5px solid #DDE2EE", borderRadius: "14px 14px 0 0" }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: "#1a1a1a" }}>{editando.id ? "Editar aviso" : "Novo aviso"}</div>
              {!editando.id && (
                <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                  <span style={{ fontSize: 11, color: "#666" }}>Começar de um modelo:</span>
                  {MODELOS.map(m => <button key={m.nome} style={btnS} onClick={() => set(m.aviso)}>{m.nome}</button>)}
                </div>
              )}
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.1fr) minmax(0, 1fr)", gap: 20, padding: 20 }}>
              {/* Formulário */}
              <div style={{ background: "#fff", borderRadius: 12, border: "0.5px solid #DDE2EE", padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
                <div>
                  <label style={lbl}>Título *</label>
                  <input style={inp} value={editando.titulo ?? ""} maxLength={120} onChange={e => set({ titulo: e.target.value })} placeholder="Ex.: Parada programada no sábado" />
                </div>
                <div>
                  <label style={lbl}>Tipo</label>
                  <select style={inp} value={editando.tipo} onChange={e => set({ tipo: e.target.value as TipoAviso })}>
                    {(Object.keys(TIPOS_AVISO) as TipoAviso[]).map(t => <option key={t} value={t}>{TIPOS_AVISO[t].icone} {TIPOS_AVISO[t].rotulo}</option>)}
                  </select>
                </div>
                <div>
                  <label style={lbl}>Mensagem *</label>
                  <textarea style={{ ...inp, minHeight: 170, resize: "vertical", lineHeight: 1.5 }} value={editando.mensagem ?? ""} onChange={e => set({ mensagem: e.target.value })} />
                  <div style={{ fontSize: 11, color: "#666", marginTop: 4 }}>Linha em branco separa parágrafos · linha começando com <code>- </code> vira item de lista · <code>**texto**</code> fica em negrito.</div>
                </div>

                <div>
                  <label style={lbl}>Para quem</label>
                  <div style={{ display: "flex", gap: 16, fontSize: 13, marginBottom: 6 }}>
                    <label style={{ display: "flex", gap: 6, alignItems: "center", cursor: "pointer" }}><input type="radio" checked={editando.publico !== "contas"} onChange={() => set({ publico: "todos" })} /> Todos os clientes</label>
                    <label style={{ display: "flex", gap: 6, alignItems: "center", cursor: "pointer" }}><input type="radio" checked={editando.publico === "contas"} onChange={() => set({ publico: "contas" })} /> Escolher clientes</label>
                  </div>
                  {editando.publico === "contas" && (
                    <div style={{ border: "0.5px solid #DDE2EE", borderRadius: 8, padding: 8 }}>
                      <div style={{ display: "flex", gap: 6, marginBottom: 6 }}>
                        <input style={{ ...inp, padding: "6px 8px" }} placeholder="Buscar cliente" value={buscaConta} onChange={e => setBuscaConta(e.target.value)} />
                        <button style={btnS} onClick={() => set({ conta_ids: [...new Set([...(editando.conta_ids ?? []), ...contasFiltradas.map(c => c.id)])] })}>Marcar</button>
                        <button style={btnS} onClick={() => set({ conta_ids: (editando.conta_ids ?? []).filter(id => !contasFiltradas.some(c => c.id === id)) })}>Desmarcar</button>
                      </div>
                      <div style={{ maxHeight: 160, overflowY: "auto", display: "grid", gridTemplateColumns: "1fr 1fr", gap: "2px 12px" }}>
                        {contasFiltradas.map(c => (
                          <label key={c.id} style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 12, cursor: "pointer", padding: "2px 0" }}>
                            <input type="checkbox" checked={(editando.conta_ids ?? []).includes(c.id)} onChange={e => set({ conta_ids: e.target.checked ? [...(editando.conta_ids ?? []), c.id] : (editando.conta_ids ?? []).filter(x => x !== c.id) })} />
                            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.nome}</span>
                          </label>
                        ))}
                      </div>
                      <div style={{ fontSize: 11, color: "#666", marginTop: 6 }}>{(editando.conta_ids ?? []).length} cliente(s) marcado(s)</div>
                    </div>
                  )}
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  <div>
                    <label style={lbl}>Começa a aparecer em *</label>
                    <input type="datetime-local" style={inp} value={paraCampo(editando.inicio)} onChange={e => set({ inicio: doCampo(e.target.value) ?? undefined })} />
                  </div>
                  <div>
                    <label style={lbl}>Para de aparecer em</label>
                    <input type="datetime-local" style={inp} value={paraCampo(editando.fim)} onChange={e => set({ fim: doCampo(e.target.value) })} />
                    <div style={{ fontSize: 11, color: "#666", marginTop: 4 }}>Em branco: aparece até cada usuário dar ciência ou o aviso ser tirado do ar.</div>
                  </div>
                </div>

                <label style={{ display: "flex", gap: 8, alignItems: "flex-start", fontSize: 13, cursor: "pointer" }}>
                  <input type="checkbox" checked={!!editando.obrigatorio} onChange={e => set({ obrigatorio: e.target.checked })} style={{ marginTop: 2 }} />
                  <span><strong>Obrigatório</strong> — o usuário só fecha clicando em &quot;Li e estou ciente&quot;. Sem marcar, ele também pode clicar em &quot;Ver depois&quot; (volta no próximo login).</span>
                </label>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  <div>
                    <label style={lbl}>Botão extra (opcional)</label>
                    <input style={inp} value={editando.botao_texto ?? ""} onChange={e => set({ botao_texto: e.target.value })} placeholder="Ex.: Abrir o Painel de Notas" />
                  </div>
                  <div>
                    <label style={lbl}>Tela que o botão abre</label>
                    <input style={inp} list="avisos-links" value={editando.botao_link ?? ""} onChange={e => set({ botao_link: e.target.value })} placeholder="/fiscal" />
                    <datalist id="avisos-links">{LINKS_SUGERIDOS.map(([v, r]) => <option key={v} value={v}>{r}</option>)}</datalist>
                  </div>
                </div>
                <div style={{ fontSize: 11, color: "#666", marginTop: -6 }}>O botão extra também registra a ciência e leva o usuário para a tela escolhida.</div>
              </div>

              {/* Prévia */}
              <div>
                <div style={{ fontSize: 11, fontWeight: 600, color: "#555", marginBottom: 8 }}>Prévia: assim o cliente vê</div>
                <div style={{ background: "rgba(11,45,80,0.35)", borderRadius: 12, padding: 16, display: "flex", justifyContent: "center", pointerEvents: "none" }}>
                  <CartaoAviso aviso={{ titulo: editando.titulo ?? "", mensagem: editando.mensagem ?? "", tipo: editando.tipo ?? "informativo", obrigatorio: !!editando.obrigatorio, botao_texto: editando.botao_texto?.trim() || null }} />
                </div>
                {editando.id && (
                  <div style={{ fontSize: 11, color: "#7A5A10", background: "#FBF3E0", borderRadius: 8, padding: "8px 10px", marginTop: 10 }}>
                    Quem já deu ciência não vê a versão alterada. Para avisar todos de novo, use Duplicar e tire este do ar.
                  </div>
                )}
              </div>
            </div>

            {erroForm && <div style={{ margin: "0 20px 12px", background: "#FCEBEB", border: "0.5px solid #F5C6C6", borderRadius: 8, padding: "10px 14px", fontSize: 13, color: "#791F1F" }}>{erroForm}</div>}
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, padding: "0 20px 20px" }}>
              <button style={{ ...btnS, padding: "8px 16px", fontSize: 13 }} onClick={() => setEditando(null)}>Cancelar</button>
              <button style={{ ...btnP, background: salvando ? "#888" : "#1A4870" }} disabled={salvando} onClick={salvar}>{salvando ? "Salvando…" : editando.id ? "Salvar alterações" : "Publicar aviso"}</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Quem leu ── */}
      {ciencias && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(11,45,80,0.32)", zIndex: 2000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
          <div style={{ background: "#fff", borderRadius: 14, width: "100%", maxWidth: 860, maxHeight: "90vh", display: "flex", flexDirection: "column", boxShadow: "0 4px 20px rgba(11,45,80,0.18)" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 20px", borderBottom: "0.5px solid #DDE2EE" }}>
              <div>
                <div style={{ fontSize: 15, fontWeight: 700 }}>Ciência do aviso</div>
                {ciencias !== "carregando" && <div style={{ fontSize: 12, color: "#666", marginTop: 2 }}>{ciencias.aviso.titulo}</div>}
              </div>
              <button onClick={() => setCiencias(null)} style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer", color: "#666" }}>×</button>
            </div>
            {ciencias === "carregando" ? <div style={{ padding: 30, textAlign: "center", color: "#666" }}>Carregando…</div> : (
              <>
                <div style={{ display: "flex", gap: 6, padding: "12px 20px 0" }}>
                  <button style={{ ...btnS, background: abaCiencia === "cientes" ? "#E8F5E9" : "#fff", fontWeight: abaCiencia === "cientes" ? 600 : 400 }} onClick={() => setAbaCiencia("cientes")}>Já deram ciência ({ciencias.cientes.length})</button>
                  <button style={{ ...btnS, background: abaCiencia === "pendentes" ? "#FBF3E0" : "#fff", fontWeight: abaCiencia === "pendentes" ? 600 : 400 }} onClick={() => setAbaCiencia("pendentes")}>Ainda não ({ciencias.pendentes.length})</button>
                </div>
                <div style={{ overflowY: "auto", padding: "12px 20px 20px" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                    <thead><tr style={{ background: "#F4F6FA" }}>
                      {["Cliente", "Usuário", "E-mail", ...(abaCiencia === "cientes" ? ["Ciente em"] : [])].map(h => <th key={h} style={{ padding: "8px 10px", textAlign: "left", fontSize: 11, color: "#555", fontWeight: 600 }}>{h}</th>)}
                    </tr></thead>
                    <tbody>
                      {(abaCiencia === "cientes" ? ciencias.cientes : ciencias.pendentes).map(p => (
                        <tr key={p.user_id} style={{ borderBottom: "0.5px solid #F0F2F7" }}>
                          <td style={{ padding: "7px 10px" }}>{p.cliente}</td>
                          <td style={{ padding: "7px 10px" }}>{p.nome || "—"}</td>
                          <td style={{ padding: "7px 10px", color: "#555" }}>{p.email || "—"}</td>
                          {abaCiencia === "cientes" && <td style={{ padding: "7px 10px", whiteSpace: "nowrap" }}>{fmtDt(p.ciente_em)}</td>}
                        </tr>
                      ))}
                      {(abaCiencia === "cientes" ? ciencias.cientes : ciencias.pendentes).length === 0 && (
                        <tr><td colSpan={4} style={{ padding: 20, textAlign: "center", color: "#666" }}>{abaCiencia === "cientes" ? "Ninguém deu ciência ainda." : "Todos os usuários do público já deram ciência."}</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
