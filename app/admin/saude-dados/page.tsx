"use client";
// Admin Raccolto → Saúde dos dados: achados do auditor automático (lib/auditoria/saude). Só equipe Raccolto
// (o layout do /admin já barra quem não é raccotlo e a rota /api/admin/saude-dados confere de novo).
import { useEffect, useMemo, useState } from "react";
import SelectField from "../../../components/SelectField";

type Achado = {
  id: string; regra: string; chave: string; conta_id: string | null; fazenda_id: string | null; titulo: string; valor: number | null;
  detalhe: Record<string, unknown>; status: "novo" | "em_analise" | "resolvido" | "ignorado"; motivo: string | null;
  primeiro_em: string; ultimo_em: string; resolvido_em: string | null; atualizado_por: string | null;
};
type Regra = { nome: string; gravidade: "alta" | "media" | "baixa"; descricao: string; correcao: string };
type Execucao = { id: string; em: string; origem: string | null; abertos: number | null; novos: number | null; resolvidos: number | null; duracao_ms: number | null; erro: string | null };

const GRAV = { alta: { cor: "#E24B4A", bg: "#FCEBEB", rot: "Alta" }, media: { cor: "#EF9F27", bg: "#FEF3E2", rot: "Média" }, baixa: { cor: "#378ADD", bg: "#E6F0FB", rot: "Baixa" } };
const STATUS = {
  novo: { rot: "Novo", bg: "#D5E8F5", cor: "#0B2D50" }, em_analise: { rot: "Em análise", bg: "#FBF3E0", cor: "#7A5A10" },
  resolvido: { rot: "Resolvido", bg: "#E8F5E9", cor: "#166534" }, ignorado: { rot: "Ignorado", bg: "#F1EFE8", cor: "#666" },
};
const fmtBRL = (v: number | null) => v == null ? "—" : v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fmtDt = (iso?: string | null) => iso ? new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—";
const fmtData = (v: unknown) => { const s = String(v ?? ""); return /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10).split("-").reverse().join("/") : s; };
const texto = (v: unknown) => String(v ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

// Detalhe em linguagem de gente: só os campos que ajudam a agir
const ROTULOS: Record<string, string> = {
  pago_em: "Pago em", valor_pago: "Valor pago", excluido_em: "Excluído em", excluido_por: "Excluído por", processado_por: "Processado por",
  emissao: "Emissão", prestacao: "Prestação", cfops: "CFOP", titulo_em_aberto_vencimento: "Título em aberto vence", titulo_em_aberto_valor: "Título em aberto",
  nf: "NF", saldo: "Saldo", vencimento: "Vencimento", valor_titulo: "Valor do título", juros: "Juros", multa: "Multa", copias: "Cópias", status: "Status",
  pedido: "Tem pedido", empresa: "Título da Empresa", origem: "Origem do título",
};
function linhasDetalhe(d: Record<string, unknown>): string[] {
  const out: string[] = [];
  for (const [k, v] of Object.entries(d)) {
    if (v == null || v === "" || k.endsWith("_id") || k === "tabela" || k === "conta_bancaria") continue;
    if (k === "titulo_excluido" && typeof v === "object") { const t = v as Record<string, unknown>; out.push(`Título excluído em ${fmtDt(String(t.quando))} por ${t.quem}`); continue; }
    const rot = ROTULOS[k]; if (!rot) continue;
    const val = typeof v === "boolean" ? (v ? "sim" : "não") : Array.isArray(v) ? v.join(", ") : /valor|juros|multa/.test(k) ? fmtBRL(Number(v)) : k.endsWith("_em") ? (String(v).length > 10 ? fmtDt(String(v)) : fmtData(v)) : fmtData(v);
    out.push(`${rot}: ${val}`);
  }
  return out;
}

export default function SaudeDadosPage() {
  const [achados, setAchados] = useState<Achado[]>([]);
  const [regras, setRegras] = useState<Record<string, Regra>>({});
  const [contas, setContas] = useState<Record<string, string>>({});
  const [fazendas, setFazendas] = useState<Record<string, string>>({});
  const [execucoes, setExecucoes] = useState<Execucao[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [rodando, setRodando] = useState(false);
  const [erro, setErro] = useState("");
  const [msg, setMsg] = useState("");
  const [fConta, setFConta] = useState("");
  const [fRegra, setFRegra] = useState("");
  const [fStatus, setFStatus] = useState("abertos");
  const [busca, setBusca] = useState("");
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [aberto, setAberto] = useState<string | null>(null);

  async function carregar() {
    setCarregando(true); setErro("");
    try {
      const r = await fetch("/api/admin/saude-dados");
      const j = await r.json();
      if (!j.ok) throw new Error(j.error ?? "Erro ao carregar");
      setAchados(j.achados); setRegras(j.regras); setExecucoes(j.execucoes);
      setContas(Object.fromEntries((j.contas as { id: string; nome: string }[]).map(c => [c.id, c.nome])));
      setFazendas(Object.fromEntries((j.fazendas as { id: string; nome: string }[]).map(f => [f.id, f.nome])));
      setSel(new Set());
    } catch (e) { setErro(e instanceof Error ? e.message : String(e)); }
    finally { setCarregando(false); }
  }
  useEffect(() => { carregar(); }, []);

  async function rodar() {
    setRodando(true); setMsg(""); setErro("");
    try {
      const j = await (await fetch("/api/admin/saude-dados", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ acao: "executar" }) })).json();
      if (!j.ok) throw new Error(j.erro ?? j.error ?? "Erro ao rodar");
      setMsg(`Auditoria concluída em ${Math.round(j.duracao_ms / 1000)}s: ${j.abertos} em aberto, ${j.novos} novos, ${j.resolvidos} resolvidos sozinhos.`);
      await carregar();
    } catch (e) { setErro(e instanceof Error ? e.message : String(e)); }
    finally { setRodando(false); }
  }

  async function mudarStatus(ids: string[], status: Achado["status"]) {
    let motivo: string | undefined;
    if (status === "ignorado") { motivo = window.prompt("Motivo para ignorar (fica registrado):") ?? undefined; if (!motivo?.trim()) return; }
    const j = await (await fetch("/api/admin/saude-dados", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ acao: "status", ids, status, motivo }) })).json();
    if (!j.ok) { setErro(j.error ?? "Erro ao atualizar"); return; }
    await carregar();
  }

  const visiveis = useMemo(() => achados.filter(a => {
    if (fStatus === "abertos" ? !(a.status === "novo" || a.status === "em_analise") : fStatus && a.status !== fStatus) return false;
    if (fConta && a.conta_id !== fConta) return false;
    if (fRegra && a.regra !== fRegra) return false;
    if (busca.trim() && !texto(`${a.titulo} ${contas[a.conta_id ?? ""] ?? ""}`).includes(texto(busca.trim()))) return false;
    return true;
  }).sort((x, y) => {
    const g = { alta: 0, media: 1, baixa: 2 };
    return (g[regras[x.regra]?.gravidade ?? "baixa"] - g[regras[y.regra]?.gravidade ?? "baixa"]) || (Number(y.valor ?? 0) - Number(x.valor ?? 0));
  }), [achados, fStatus, fConta, fRegra, busca, regras, contas]);

  // Resumo por regra (sempre sobre os abertos, respeitando o filtro de cliente)
  const resumo = useMemo(() => {
    const m = new Map<string, { qtd: number; valor: number; novos: number }>();
    for (const a of achados) {
      if (!(a.status === "novo" || a.status === "em_analise") || (fConta && a.conta_id !== fConta)) continue;
      const r = m.get(a.regra) ?? { qtd: 0, valor: 0, novos: 0 };
      r.qtd++; r.valor += Number(a.valor ?? 0); if (a.status === "novo") r.novos++;
      m.set(a.regra, r);
    }
    return [...m.entries()].sort((x, y) => ({ alta: 0, media: 1, baixa: 2 }[regras[x[0]]?.gravidade ?? "baixa"] - { alta: 0, media: 1, baixa: 2 }[regras[y[0]]?.gravidade ?? "baixa"]) || y[1].qtd - x[1].qtd);
  }, [achados, fConta, regras]);

  const contasComAchado = useMemo(() => [...new Set(achados.map(a => a.conta_id).filter((c): c is string => !!c))].sort((a, b) => (contas[a] ?? "").localeCompare(contas[b] ?? "")), [achados, contas]);
  const ultima = execucoes[0];
  const btn: React.CSSProperties = { padding: "6px 12px", borderRadius: 8, border: "0.5px solid #DDE2EE", background: "#fff", fontSize: 12, fontWeight: 600, cursor: "pointer", color: "#1a1a1a" };
  const inp: React.CSSProperties = { padding: "6px 10px", borderRadius: 8, border: "0.5px solid #DDE2EE", fontSize: 13, background: "#fff" };

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh", background: "var(--bg-page)", fontFamily: "system-ui, sans-serif", fontSize: 13 }}>
      <header data-arato-page-heading="true" style={{ background: "var(--bg-card)", borderBottom: "0.5px solid var(--border-table)", padding: "12px 22px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
        <div>
          <h1 data-arato-h1="true" style={{ margin: 0, fontSize: 17, fontWeight: 600, color: "var(--text-1)" }}>Saúde dos dados</h1>
          <div style={{ fontSize: 11, color: "#666", marginTop: 2 }}>
            Auditor automático de todas as contas · {ultima ? <>última execução {fmtDt(ultima.em)} ({ultima.origem ?? "cron"}){ultima.erro ? <span style={{ color: "#E24B4A" }}> — erro: {ultima.erro}</span> : ""}</> : "ainda não executado"} · visível só para a equipe Raccolto
          </div>
        </div>
        <button type="button" onClick={rodar} disabled={rodando} style={{ ...btn, background: "#1A4870", color: "#fff", border: "none", padding: "8px 16px" }}>
          {rodando ? "Rodando… (até 1 min)" : "↻ Rodar auditoria agora"}
        </button>
      </header>

      <main style={{ padding: "16px 22px", display: "flex", flexDirection: "column", gap: 14 }}>
        {erro && <div style={{ padding: 10, background: "#FCEBEB", color: "#791F1F", borderRadius: 8 }}>{erro}</div>}
        {msg && <div style={{ padding: 10, background: "#E8F5E9", color: "#166534", borderRadius: 8 }}>{msg}</div>}

        {/* Resumo por regra — clique filtra */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(230px, 1fr))", gap: 10 }}>
          {resumo.map(([regra, r]) => {
            const g = GRAV[regras[regra]?.gravidade ?? "baixa"];
            const ativo = fRegra === regra;
            return (
              <button key={regra} type="button" onClick={() => setFRegra(ativo ? "" : regra)} title={regras[regra]?.descricao}
                style={{ textAlign: "left", background: "#fff", border: `0.5px solid ${ativo ? "#1A4870" : "#DDE2EE"}`, borderLeft: `3px solid ${g.cor}`, borderRadius: 10, padding: "10px 12px", cursor: "pointer", display: "flex", flexDirection: "column", gap: 4 }}>
                <span style={{ fontSize: 11, fontWeight: 600, color: "#555" }}>{regras[regra]?.nome ?? regra}</span>
                <span style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                  <span style={{ fontSize: 20, fontWeight: 700, color: "#1a1a1a", fontVariantNumeric: "tabular-nums" }}>{r.qtd}</span>
                  {r.valor > 0 && <span style={{ fontSize: 11, color: "#666" }}>{fmtBRL(r.valor)}</span>}
                </span>
                <span style={{ fontSize: 10, color: g.cor, fontWeight: 600 }}>{g.rot}{r.novos ? ` · ${r.novos} novo${r.novos > 1 ? "s" : ""}` : ""}</span>
              </button>
            );
          })}
          {!carregando && resumo.length === 0 && <div style={{ color: "#166534", fontWeight: 600 }}>Nenhum problema em aberto{fConta ? " para este cliente" : ""}.</div>}
        </div>

        {/* Filtros */}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <SelectField value={fConta} onChange={e => setFConta(e.target.value)} style={{ ...inp, minWidth: 220 }}>
            <option value="">Todos os clientes</option>
            {contasComAchado.map(c => <option key={c} value={c}>{contas[c] ?? c}</option>)}
          </SelectField>
          <SelectField value={fRegra} onChange={e => setFRegra(e.target.value)} style={{ ...inp, minWidth: 220 }}>
            <option value="">Todas as regras</option>
            {Object.entries(regras).map(([k, r]) => <option key={k} value={k}>{r.nome}</option>)}
          </SelectField>
          <SelectField value={fStatus} onChange={e => setFStatus(e.target.value)} style={inp}>
            <option value="abertos">Em aberto (novo + em análise)</option>
            <option value="novo">Novo</option><option value="em_analise">Em análise</option><option value="resolvido">Resolvido</option><option value="ignorado">Ignorado</option><option value="">Todos</option>
          </SelectField>
          <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar item ou cliente…" style={{ ...inp, minWidth: 220 }} />
          <span style={{ color: "#666", fontSize: 12 }}>{visiveis.length} item(ns)</span>
          {sel.size > 0 && (
            <span style={{ display: "flex", gap: 6, marginLeft: "auto" }}>
              <span style={{ fontSize: 12, color: "#555", alignSelf: "center" }}>{sel.size} selecionado(s):</span>
              <button type="button" style={btn} onClick={() => mudarStatus([...sel], "em_analise")}>Em análise</button>
              <button type="button" style={btn} onClick={() => mudarStatus([...sel], "resolvido")}>Resolvido</button>
              <button type="button" style={btn} onClick={() => mudarStatus([...sel], "ignorado")}>Ignorar…</button>
              <button type="button" style={btn} onClick={() => mudarStatus([...sel], "novo")}>Reabrir</button>
            </span>
          )}
        </div>

        {/* Lista */}
        <div style={{ background: "#fff", border: "0.5px solid #DDE2EE", borderRadius: 12, overflow: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 980 }}>
            <thead><tr style={{ background: "#F4F6FA", textAlign: "left" }}>
              <th style={{ padding: "8px 10px", width: 28 }}>
                <input type="checkbox" aria-label="Selecionar todos" checked={visiveis.length > 0 && visiveis.every(a => sel.has(a.id))}
                  onChange={e => setSel(e.target.checked ? new Set(visiveis.map(a => a.id)) : new Set())} />
              </th>
              {["Cliente", "Problema", "Item", "Valor", "Desde", "Status"].map(h => <th key={h} style={{ padding: "8px 10px", fontSize: 11, color: "#555", fontWeight: 700, textAlign: h === "Valor" ? "right" : "left" }}>{h}</th>)}
            </tr></thead>
            <tbody>
              {carregando && <tr><td colSpan={7} style={{ padding: 24, textAlign: "center", color: "#888" }}>Carregando…</td></tr>}
              {!carregando && visiveis.length === 0 && <tr><td colSpan={7} style={{ padding: 24, textAlign: "center", color: "#888" }}>{achados.length ? "Nada com esse filtro." : "Nenhum achado ainda. Clique em Rodar auditoria agora."}</td></tr>}
              {visiveis.slice(0, 500).map(a => {
                const r = regras[a.regra]; const g = GRAV[r?.gravidade ?? "baixa"]; const st = STATUS[a.status]; const exp = aberto === a.id;
                return [
                  <tr key={a.id} onClick={() => setAberto(exp ? null : a.id)} style={{ borderTop: "0.5px solid #EEF1F6", cursor: "pointer", background: exp ? "#F7FAFD" : undefined }}>
                    <td style={{ padding: "7px 10px", borderLeft: `3px solid ${g.cor}` }} onClick={e => e.stopPropagation()}>
                      <input type="checkbox" aria-label="Selecionar" checked={sel.has(a.id)} onChange={e => setSel(p => { const n = new Set(p); if (e.target.checked) n.add(a.id); else n.delete(a.id); return n; })} />
                    </td>
                    <td style={{ padding: "7px 10px", whiteSpace: "nowrap" }}>{contas[a.conta_id ?? ""] ?? "—"}{a.fazenda_id && fazendas[a.fazenda_id] ? <div style={{ fontSize: 10, color: "#888" }}>{fazendas[a.fazenda_id]}</div> : null}</td>
                    <td style={{ padding: "7px 10px" }}><span style={{ fontSize: 11, fontWeight: 600, color: g.cor }}>{r?.nome ?? a.regra}</span></td>
                    <td style={{ padding: "7px 10px", maxWidth: 420 }}>{a.titulo}<div style={{ fontSize: 11, color: "#666" }}>{linhasDetalhe(a.detalhe).slice(0, 3).join(" · ")}</div></td>
                    <td style={{ padding: "7px 10px", textAlign: "right", whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>{fmtBRL(a.valor)}</td>
                    <td style={{ padding: "7px 10px", whiteSpace: "nowrap", fontSize: 11, color: "#666" }}>{fmtDt(a.primeiro_em)}</td>
                    <td style={{ padding: "7px 10px" }}><span style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 10, background: st.bg, color: st.cor }}>{st.rot}</span></td>
                  </tr>,
                  exp && (
                    <tr key={a.id + ":d"} style={{ background: "#F7FAFD" }}>
                      <td />
                      <td colSpan={6} style={{ padding: "4px 10px 14px", fontSize: 12, color: "#333" }}>
                        <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)", gap: 16 }}>
                          <div>
                            <div style={{ fontWeight: 700, marginBottom: 4 }}>O que é</div>
                            <div style={{ color: "#555", lineHeight: 1.5 }}>{r?.descricao}</div>
                            <div style={{ fontWeight: 700, margin: "10px 0 4px" }}>Como corrigir</div>
                            <div style={{ color: "#555", lineHeight: 1.5 }}>{r?.correcao}</div>
                          </div>
                          <div>
                            <div style={{ fontWeight: 700, marginBottom: 4 }}>Detalhe</div>
                            {linhasDetalhe(a.detalhe).map((l, i) => <div key={i} style={{ color: "#555" }}>{l}</div>)}
                            <div style={{ color: "#888", marginTop: 8, fontSize: 11 }}>Visto pela primeira vez {fmtDt(a.primeiro_em)} · última verificação {fmtDt(a.ultimo_em)}{a.atualizado_por ? ` · status por ${a.atualizado_por}` : ""}{a.motivo ? ` · motivo: ${a.motivo}` : ""}</div>
                            <div style={{ display: "flex", gap: 6, marginTop: 10, flexWrap: "wrap" }}>
                              {a.status !== "em_analise" && <button type="button" style={btn} onClick={() => mudarStatus([a.id], "em_analise")}>Em análise</button>}
                              {a.status !== "resolvido" && <button type="button" style={btn} onClick={() => mudarStatus([a.id], "resolvido")}>Resolvido</button>}
                              {a.status !== "ignorado" && <button type="button" style={btn} onClick={() => mudarStatus([a.id], "ignorado")}>Ignorar…</button>}
                              {(a.status === "resolvido" || a.status === "ignorado") && <button type="button" style={btn} onClick={() => mudarStatus([a.id], "novo")}>Reabrir</button>}
                            </div>
                          </div>
                        </div>
                      </td>
                    </tr>
                  ),
                ];
              })}
            </tbody>
          </table>
          {visiveis.length > 500 && <div style={{ padding: 10, fontSize: 12, color: "#666" }}>Mostrando 500 de {visiveis.length}. Use os filtros para ver o resto.</div>}
        </div>

        <div style={{ fontSize: 11, color: "#888", lineHeight: 1.6 }}>
          Roda sozinho todo dia às 6h30. Um problema que deixa de acontecer é marcado Resolvido automaticamente; um Resolvido que volta a acontecer é reaberto como Novo. Itens Ignorados (com motivo) não voltam.
        </div>
      </main>
    </div>
  );
}
