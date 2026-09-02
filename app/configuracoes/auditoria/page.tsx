"use client";
import { useState, useEffect, useCallback, useMemo } from "react";
import { createBrowserClient } from "@supabase/ssr";
import TopNav from "@/components/TopNav";

const sb = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

type AuditEntry = {
  id: string;
  fazenda_id: string | null;
  tabela: string;
  registro_id: string | null;
  acao: "INSERT" | "UPDATE" | "DELETE" | "LOGIN" | "CUSTOM";
  dados_antes: Record<string, unknown> | null;
  dados_depois: Record<string, unknown> | null;
  campos_alterados: string[] | null;
  usuario_app: string | null;
  created_at: string;
};

const TABELA_LABEL: Record<string, string> = {
  lancamentos: "CP / CR",
  folha_pagamento: "Folha de Pagamento",
  folha_funcionarios: "Func. na Folha",
  contratos: "Contratos de Grãos",
  contratos_financeiros: "Contratos Financeiros",
  romaneios: "Romaneios",
  pedidos_compra: "Pedidos de Compra",
};

const ACAO_CONFIG = {
  INSERT: { label: "Criado",   bg: "#DCFCE7", color: "#15803D", border: "#86EFAC" },
  UPDATE: { label: "Alterado", bg: "#FEF9C3", color: "#854D0E", border: "#FDE047" },
  DELETE: { label: "Excluído", bg: "#FEE2E2", color: "#B91C1C", border: "#FCA5A5" },
  LOGIN:  { label: "Login",    bg: "#EFF6FF", color: "#1D4ED8", border: "#93C5FD" },
  CUSTOM: { label: "Ação",     bg: "#F3F4F6", color: "#374151", border: "#D1D5DB" },
};

const CAMPOS_SENSIVEIS = ["senha", "password", "token", "secret", "chave_pix"];

function fmtTs(ts: string) {
  const d = new Date(ts);
  return d.toLocaleDateString("pt-BR") + " " + d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function fmtVal(v: unknown): string {
  if (v === null || v === undefined) return "—";
  if (typeof v === "boolean") return v ? "Sim" : "Não";
  if (typeof v === "number") return v.toLocaleString("pt-BR", { maximumFractionDigits: 4 });
  if (typeof v === "string") {
    if (/^\d{4}-\d{2}-\d{2}T/.test(v)) return new Date(v).toLocaleString("pt-BR");
    if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return new Date(v + "T12:00:00").toLocaleDateString("pt-BR");
    if (v.length > 80) return v.slice(0, 80) + "…";
    return v;
  }
  if (typeof v === "object") return JSON.stringify(v).slice(0, 100);
  return String(v);
}

function campoLabel(campo: string): string {
  const mapa: Record<string, string> = {
    valor: "Valor", status: "Status", descricao: "Descrição",
    data_vencimento: "Vencimento", data_baixa: "Data Baixa", valor_pago: "Valor Pago",
    categoria: "Categoria", pessoa_id: "Fornecedor/Cliente", fazenda_id: "Fazenda",
    competencia: "Competência", valor_bruto: "Valor Bruto", valor_liquido: "Valor Líquido",
    produto: "Produto", quantidade_kg: "Quantidade (kg)", preco: "Preço",
    numero: "Número", obs: "Observação", moeda: "Moeda",
    nome: "Nome", salario_base: "Salário Base", salario_bruto: "Salário Bruto",
    inss_patronal: "INSS Patronal", fgts_total: "FGTS",
    natureza: "Natureza", origem_lancamento: "Origem",
    valor_financiado: "Valor Financiado", tipo: "Tipo",
  };
  return mapa[campo] ?? campo.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
}

function resumoRegistro(tabela: string, dados: Record<string, unknown> | null): string {
  if (!dados) return "";
  const campos: Record<string, string[]> = {
    lancamentos: ["descricao", "valor", "data_vencimento", "categoria"],
    folha_pagamento: ["competencia", "status", "valor_bruto"],
    folha_funcionarios: ["folha_id"],
    contratos: ["numero", "produto", "quantidade_kg", "status"],
    contratos_financeiros: ["descricao", "valor_financiado", "status"],
    romaneios: ["numero_romaneio", "produto", "peso_liquido_kg"],
    pedidos_compra: ["numero", "status", "valor_total"],
  };
  const chaves = campos[tabela] ?? ["id"];
  return chaves.map(c => dados[c] != null ? fmtVal(dados[c]) : null).filter(Boolean).join(" · ") || dados["id"] as string || "";
}

// ── Componente DiffRow ──────────────────────────────────────────────────────
function DiffRow({ campo, antes, depois }: { campo: string; antes: unknown; depois: unknown }) {
  const isSens = CAMPOS_SENSIVEIS.some(s => campo.toLowerCase().includes(s));
  const aStr = isSens ? "••••••" : fmtVal(antes);
  const dStr = isSens ? "••••••" : fmtVal(depois);
  return (
    <div style={{ display: "grid", gridTemplateColumns: "160px 1fr 24px 1fr", gap: 6, alignItems: "start", padding: "4px 0", borderBottom: "0.5px solid #F0F0F0" }}>
      <div style={{ fontSize: 11, color: "#666", fontWeight: 600 }}>{campoLabel(campo)}</div>
      <div style={{ fontSize: 11, color: "#B91C1C", background: "#FEF2F2", borderRadius: 4, padding: "2px 6px", wordBreak: "break-all" }}>{aStr}</div>
      <div style={{ fontSize: 13, color: "#9CA3AF", textAlign: "center" }}>→</div>
      <div style={{ fontSize: 11, color: "#15803D", background: "#F0FDF4", borderRadius: 4, padding: "2px 6px", wordBreak: "break-all" }}>{dStr}</div>
    </div>
  );
}

// ── Componente ExpandedDetail ───────────────────────────────────────────────
function ExpandedDetail({ entry }: { entry: AuditEntry }) {
  const campos = entry.campos_alterados ?? [];

  if (entry.acao === "DELETE" && entry.dados_antes) {
    const chaves = ["id", "descricao", "nome", "competencia", "numero", "produto", "valor", "valor_bruto", "data_vencimento", "status", "categoria"];
    const exibir = chaves.filter(c => entry.dados_antes![c] != null);
    return (
      <div style={{ background: "#FEF2F2", borderRadius: 8, padding: "12px 16px", margin: "6px 0" }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: "#B91C1C", marginBottom: 8 }}>📄 Snapshot do registro excluído</div>
        <div style={{ display: "grid", gridTemplateColumns: "160px 1fr", gap: "4px 12px" }}>
          {exibir.map(c => (
            <><div key={c + "l"} style={{ fontSize: 11, color: "#7F1D1D", fontWeight: 600 }}>{campoLabel(c)}</div>
            <div key={c + "v"} style={{ fontSize: 11, color: "#B91C1C" }}>{fmtVal(entry.dados_antes![c])}</div></>
          ))}
        </div>
        <details style={{ marginTop: 10 }}>
          <summary style={{ fontSize: 10, color: "#9CA3AF", cursor: "pointer" }}>Ver registro completo</summary>
          <pre style={{ fontSize: 10, color: "#374151", background: "#F9FAFB", borderRadius: 4, padding: 8, marginTop: 4, overflowX: "auto", maxHeight: 200 }}>
            {JSON.stringify(entry.dados_antes, null, 2)}
          </pre>
        </details>
      </div>
    );
  }

  if (entry.acao === "UPDATE" && campos.length > 0) {
    return (
      <div style={{ background: "#FFFBEB", borderRadius: 8, padding: "12px 16px", margin: "6px 0" }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: "#854D0E", marginBottom: 8 }}>
          ✏ {campos.length} campo{campos.length > 1 ? "s" : ""} alterado{campos.length > 1 ? "s" : ""}
        </div>
        {campos.map(c => (
          <DiffRow key={c} campo={c} antes={entry.dados_antes?.[c]} depois={entry.dados_depois?.[c]} />
        ))}
      </div>
    );
  }

  if (entry.acao === "INSERT" && entry.dados_depois) {
    const chaves = ["id", "descricao", "nome", "competencia", "numero", "produto", "valor", "valor_bruto", "data_vencimento", "status", "categoria"];
    const exibir = chaves.filter(c => entry.dados_depois![c] != null);
    return (
      <div style={{ background: "#F0FDF4", borderRadius: 8, padding: "12px 16px", margin: "6px 0" }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: "#15803D", marginBottom: 8 }}>📄 Registro criado</div>
        <div style={{ display: "grid", gridTemplateColumns: "160px 1fr", gap: "4px 12px" }}>
          {exibir.map(c => (
            <><div key={c + "l"} style={{ fontSize: 11, color: "#14532D", fontWeight: 600 }}>{campoLabel(c)}</div>
            <div key={c + "v"} style={{ fontSize: 11, color: "#15803D" }}>{fmtVal(entry.dados_depois![c])}</div></>
          ))}
        </div>
      </div>
    );
  }

  return <div style={{ fontSize: 11, color: "#9CA3AF", padding: "8px 0" }}>Sem detalhes disponíveis.</div>;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-/i;

// ── Página principal ────────────────────────────────────────────────────────
export default function AuditoriaPage() {
  const [logs, setLogs]         = useState<AuditEntry[]>([]);
  const [loading, setLoading]   = useState(true);
  const [expandido, setExpandido] = useState<Set<string>>(new Set());
  const [pagina, setPagina]     = useState(0);
  const [usersMap, setUsersMap] = useState<Record<string, string>>({});
  const PAGE = 100;

  // Carrega mapa UUID→nome para resolver registros já gravados como UUID
  useEffect(() => {
    sb.from("perfis").select("user_id, nome").then(({ data }) => {
      if (!data) return;
      const m: Record<string, string> = {};
      data.forEach(p => { if (p.user_id && p.nome) m[p.user_id] = p.nome; });
      setUsersMap(m);
    });
  }, []);

  const resolveUser = (uid: string | null) => {
    if (!uid) return null;
    if (UUID_RE.test(uid)) return usersMap[uid] ?? uid.slice(0, 8) + "…";
    return uid;
  };

  // Filtros
  const hoje = new Date().toISOString().slice(0, 10);
  const [fDe,     setFDe]     = useState(() => { const d = new Date(); d.setDate(d.getDate() - 7); return d.toISOString().slice(0, 10); });
  const [fAte,    setFAte]    = useState(hoje);
  const [fTabela, setFTabela] = useState("");
  const [fAcao,   setFAcao]   = useState("");
  const [fBusca,  setFBusca]  = useState("");

  const carregar = useCallback(async () => {
    setLoading(true);
    try {
      let q = sb.from("audit_log")
        .select("*")
        .gte("created_at", fDe + "T00:00:00")
        .lte("created_at", fAte + "T23:59:59")
        .order("created_at", { ascending: false })
        .range(pagina * PAGE, (pagina + 1) * PAGE - 1);

      if (fTabela) q = q.eq("tabela", fTabela);
      if (fAcao)   q = q.eq("acao",   fAcao);

      const { data, error } = await q;
      if (error) throw error;
      setLogs(prev => pagina === 0 ? (data ?? []) : [...prev, ...(data ?? [])]);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [fDe, fAte, fTabela, fAcao, pagina]);

  useEffect(() => { setPagina(0); }, [fDe, fAte, fTabela, fAcao]);
  useEffect(() => { carregar(); }, [carregar]);

  const logsFiltrados = useMemo(() => {
    if (!fBusca) return logs;
    const q = fBusca.toLowerCase();
    return logs.filter(l =>
      (l.tabela ?? "").includes(q) ||
      (l.acao ?? "").toLowerCase().includes(q) ||
      (l.registro_id ?? "").includes(q) ||
      (l.usuario_app ?? "").toLowerCase().includes(q) ||
      JSON.stringify(l.dados_depois ?? {}).toLowerCase().includes(q) ||
      JSON.stringify(l.dados_antes ?? {}).toLowerCase().includes(q)
    );
  }, [logs, fBusca]);

  // Stat cards
  const hojeStr = hoje;
  const logsHoje = logs.filter(l => l.created_at.startsWith(hojeStr));
  const deletesHoje = logsHoje.filter(l => l.acao === "DELETE").length;
  const tabelaMaisAtiva = useMemo(() => {
    const cnt: Record<string, number> = {};
    logs.forEach(l => { cnt[l.tabela] = (cnt[l.tabela] ?? 0) + 1; });
    const top = Object.entries(cnt).sort((a, b) => b[1] - a[1])[0];
    return top ? `${TABELA_LABEL[top[0]] ?? top[0]} (${top[1]})` : "—";
  }, [logs]);

  const toggleExpandido = (id: string) =>
    setExpandido(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s; });

  const card = {
    background: "#fff", borderRadius: 12, padding: "14px 18px",
    border: "0.5px solid #DDE2EE", flex: 1, minWidth: 160,
  } as React.CSSProperties;

  return (
    <div style={{ minHeight: "100vh", background: "#F4F6FA" }}>
      <TopNav />
      <div style={{ maxWidth: 1400, margin: "0 auto", padding: "28px 24px" }}>

        {/* Cabeçalho */}
        <div style={{ marginBottom: 20 }}>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: "#0B2D50", margin: 0 }}>Monitor de Auditoria</h1>
          <p style={{ fontSize: 12, color: "#888", margin: "4px 0 0" }}>
            Histórico de inserções, alterações e exclusões nas tabelas críticas do sistema.
            Os registros começam a partir da ativação do monitor.
          </p>
        </div>

        {/* Stat cards */}
        <div style={{ display: "flex", gap: 12, marginBottom: 20, flexWrap: "wrap" }}>
          <div style={card}>
            <div style={{ fontSize: 10, color: "#888", marginBottom: 4, fontWeight: 600 }}>EVENTOS HOJE</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: "#0B2D50" }}>{logsHoje.length}</div>
          </div>
          <div style={{ ...card, background: deletesHoje > 0 ? "#FEF2F2" : "#fff", border: `0.5px solid ${deletesHoje > 0 ? "#FCA5A5" : "#DDE2EE"}` }}>
            <div style={{ fontSize: 10, color: deletesHoje > 0 ? "#B91C1C" : "#888", marginBottom: 4, fontWeight: 600 }}>EXCLUSÕES HOJE</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: deletesHoje > 0 ? "#B91C1C" : "#0B2D50" }}>{deletesHoje}</div>
          </div>
          <div style={card}>
            <div style={{ fontSize: 10, color: "#888", marginBottom: 4, fontWeight: 600 }}>TABELA MAIS ATIVA</div>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#0B2D50" }}>{tabelaMaisAtiva}</div>
          </div>
          <div style={card}>
            <div style={{ fontSize: 10, color: "#888", marginBottom: 4, fontWeight: 600 }}>TOTAL NO PERÍODO</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: "#0B2D50" }}>{logs.length}</div>
          </div>
        </div>

        {/* Filtros */}
        <div style={{ background: "#fff", borderRadius: 12, padding: "14px 18px", border: "0.5px solid #DDE2EE", marginBottom: 16, display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
          <div>
            <div style={{ fontSize: 10, color: "#888", marginBottom: 3, fontWeight: 600 }}>DE</div>
            <input type="date" value={fDe} onChange={e => setFDe(e.target.value)}
              style={{ border: "0.5px solid #DDE2EE", borderRadius: 6, padding: "5px 8px", fontSize: 12, color: "#333" }} />
          </div>
          <div>
            <div style={{ fontSize: 10, color: "#888", marginBottom: 3, fontWeight: 600 }}>ATÉ</div>
            <input type="date" value={fAte} onChange={e => setFAte(e.target.value)}
              style={{ border: "0.5px solid #DDE2EE", borderRadius: 6, padding: "5px 8px", fontSize: 12, color: "#333" }} />
          </div>
          <div>
            <div style={{ fontSize: 10, color: "#888", marginBottom: 3, fontWeight: 600 }}>TABELA</div>
            <select value={fTabela} onChange={e => setFTabela(e.target.value)}
              style={{ border: "0.5px solid #DDE2EE", borderRadius: 6, padding: "5px 8px", fontSize: 12, color: "#333", background: "#fff" }}>
              <option value="">Todas</option>
              {Object.entries(TABELA_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
          <div>
            <div style={{ fontSize: 10, color: "#888", marginBottom: 3, fontWeight: 600 }}>AÇÃO</div>
            <select value={fAcao} onChange={e => setFAcao(e.target.value)}
              style={{ border: "0.5px solid #DDE2EE", borderRadius: 6, padding: "5px 8px", fontSize: 12, color: "#333", background: "#fff" }}>
              <option value="">Todas</option>
              <option value="INSERT">Criação</option>
              <option value="UPDATE">Alteração</option>
              <option value="DELETE">Exclusão</option>
            </select>
          </div>
          <div style={{ flex: 1, minWidth: 180 }}>
            <div style={{ fontSize: 10, color: "#888", marginBottom: 3, fontWeight: 600 }}>BUSCA</div>
            <input placeholder="Buscar em dados, ID, usuário…" value={fBusca} onChange={e => setFBusca(e.target.value)}
              style={{ border: "0.5px solid #DDE2EE", borderRadius: 6, padding: "5px 8px", fontSize: 12, color: "#333", width: "100%", boxSizing: "border-box" }} />
          </div>
          <button onClick={() => { setFDe(new Date(Date.now() - 7*86400000).toISOString().slice(0,10)); setFAte(hoje); setFTabela(""); setFAcao(""); setFBusca(""); }}
            style={{ border: "0.5px solid #DDE2EE", borderRadius: 6, padding: "5px 12px", fontSize: 12, color: "#666", background: "#F9FAFB", cursor: "pointer" }}>
            Limpar
          </button>
        </div>

        {/* Tabela de logs */}
        <div style={{ background: "#fff", borderRadius: 12, border: "0.5px solid #DDE2EE", overflow: "hidden" }}>
          {loading && pagina === 0 ? (
            <div style={{ padding: 40, textAlign: "center", color: "#888", fontSize: 13 }}>Carregando…</div>
          ) : logsFiltrados.length === 0 ? (
            <div style={{ padding: 40, textAlign: "center", color: "#888", fontSize: 13 }}>
              Nenhum evento encontrado no período.<br />
              <span style={{ fontSize: 11, color: "#aaa" }}>Os triggers começam a gravar a partir de agora — eventos anteriores não são retroativos.</span>
            </div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                <thead>
                  <tr style={{ background: "#F4F6FA", borderBottom: "0.5px solid #DDE2EE" }}>
                    <th style={{ padding: "10px 12px", textAlign: "left", fontSize: 10, fontWeight: 700, color: "#888", whiteSpace: "nowrap" }}>QUANDO</th>
                    <th style={{ padding: "10px 8px", textAlign: "center", fontSize: 10, fontWeight: 700, color: "#888" }}>AÇÃO</th>
                    <th style={{ padding: "10px 8px", textAlign: "left", fontSize: 10, fontWeight: 700, color: "#888" }}>TABELA</th>
                    <th style={{ padding: "10px 8px", textAlign: "left", fontSize: 10, fontWeight: 700, color: "#888" }}>RESUMO</th>
                    <th style={{ padding: "10px 8px", textAlign: "left", fontSize: 10, fontWeight: 700, color: "#888" }}>CAMPOS ALTERADOS</th>
                    <th style={{ padding: "10px 8px", textAlign: "left", fontSize: 10, fontWeight: 700, color: "#888" }}>USUÁRIO</th>
                    <th style={{ padding: "10px 8px", textAlign: "center", fontSize: 10, fontWeight: 700, color: "#888" }}>ID</th>
                    <th style={{ padding: "10px 8px", width: 36 }}></th>
                  </tr>
                </thead>
                <tbody>
                  {logsFiltrados.map((l, i) => {
                    const ac = ACAO_CONFIG[l.acao] ?? ACAO_CONFIG.CUSTOM;
                    const aberto = expandido.has(l.id);
                    const resumo = resumoRegistro(l.tabela, l.dados_depois ?? l.dados_antes);
                    const campos = l.campos_alterados ?? [];
                    const isDelete = l.acao === "DELETE";
                    return (
                      <>
                        <tr key={l.id}
                          onClick={() => toggleExpandido(l.id)}
                          style={{
                            borderBottom: "0.5px solid #F0F0F0",
                            background: isDelete ? "#FFF5F5" : aberto ? "#FAFCFF" : i % 2 === 0 ? "#fff" : "#FAFAFA",
                            cursor: "pointer",
                            borderLeft: `3px solid ${ac.border}`,
                          }}>
                          <td style={{ padding: "9px 12px", whiteSpace: "nowrap", color: "#555", fontSize: 11 }}>{fmtTs(l.created_at)}</td>
                          <td style={{ padding: "9px 8px", textAlign: "center" }}>
                            <span style={{ fontSize: 10, fontWeight: 700, background: ac.bg, color: ac.color, border: `0.5px solid ${ac.border}`, borderRadius: 5, padding: "2px 8px", whiteSpace: "nowrap" }}>
                              {ac.label}
                            </span>
                          </td>
                          <td style={{ padding: "9px 8px", whiteSpace: "nowrap", color: "#374151", fontWeight: 600, fontSize: 11 }}>
                            {TABELA_LABEL[l.tabela] ?? l.tabela}
                          </td>
                          <td style={{ padding: "9px 8px", color: "#555", maxWidth: 280, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {resumo}
                          </td>
                          <td style={{ padding: "9px 8px", maxWidth: 240 }}>
                            {campos.length > 0 ? (
                              <div style={{ display: "flex", flexWrap: "wrap", gap: 3 }}>
                                {campos.slice(0, 5).map(c => (
                                  <span key={c} style={{ fontSize: 9, background: "#FEF9C3", color: "#854D0E", border: "0.5px solid #FDE047", borderRadius: 4, padding: "1px 5px", fontWeight: 600 }}>
                                    {campoLabel(c)}
                                  </span>
                                ))}
                                {campos.length > 5 && <span style={{ fontSize: 9, color: "#9CA3AF" }}>+{campos.length - 5}</span>}
                              </div>
                            ) : <span style={{ color: "#D1D5DB" }}>—</span>}
                          </td>
                          <td style={{ padding: "9px 8px", color: "#555", fontSize: 11, whiteSpace: "nowrap" }}>
                            {(() => {
                              const nome = resolveUser(l.usuario_app);
                              return nome
                                ? <span title={l.usuario_app ?? undefined} style={{ fontSize: 10 }}>{nome}</span>
                                : <span style={{ color: "#D1D5DB", fontSize: 10 }}>Sistema</span>;
                            })()}
                          </td>
                          <td style={{ padding: "9px 8px", textAlign: "center" }}>
                            {l.registro_id && (
                              <span style={{ fontSize: 9, color: "#9CA3AF", fontFamily: "monospace" }}>
                                {l.registro_id.slice(0, 8)}…
                              </span>
                            )}
                          </td>
                          <td style={{ padding: "9px 8px", textAlign: "center" }}>
                            <span style={{ fontSize: 12, color: "#9CA3AF" }}>{aberto ? "▲" : "▼"}</span>
                          </td>
                        </tr>
                        {aberto && (
                          <tr key={l.id + "_detail"}>
                            <td colSpan={8} style={{ padding: "0 16px 12px", background: isDelete ? "#FFF5F5" : "#FAFCFF" }}>
                              <ExpandedDetail entry={l} />
                            </td>
                          </tr>
                        )}
                      </>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Rodapé */}
          <div style={{ padding: "10px 16px", borderTop: "0.5px solid #F0F0F0", display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 11, color: "#888" }}>
            <span>Exibindo {logsFiltrados.length} eventos</span>
            {logs.length === PAGE * (pagina + 1) && (
              <button onClick={() => setPagina(p => p + 1)} disabled={loading}
                style={{ border: "0.5px solid #DDE2EE", borderRadius: 6, padding: "5px 14px", fontSize: 11, color: "#1A4870", background: "#EFF6FF", cursor: "pointer", fontWeight: 600 }}>
                {loading ? "Carregando…" : "Carregar mais"}
              </button>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
