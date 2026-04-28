"use client";
import { useState, useEffect } from "react";
import TopNav from "../../../components/TopNav";
import { useAuth } from "../../../components/AuthProvider";
import { supabase } from "../../../lib/supabase";

// ── Tipos ──────────────────────────────────────────────────────────────────────
type AcaoLog = "insert" | "update" | "delete" | "login" | "logout" | "export" | "view";

interface LogEntry {
  id: string;
  fazenda_id: string;
  usuario_id?: string;
  usuario_nome?: string;
  usuario_email?: string;
  acao: AcaoLog;
  modulo: string;
  entidade?: string;
  entidade_id?: string;
  descricao: string;
  dados_antes?: Record<string, unknown>;
  dados_depois?: Record<string, unknown>;
  ip?: string;
  created_at: string;
}

type FiltroLog = {
  modulo:   string;
  acao:     string;
  usuario:  string;
  inicio:   string;
  fim:      string;
  busca:    string;
};

// ── Helpers ────────────────────────────────────────────────────────────────────
const fmtDt = (iso: string) =>
  new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit" });

const ACAO_META: Record<AcaoLog, { label: string; cor: string; bg: string }> = {
  insert:  { label: "Inserção",    cor: "#16A34A", bg: "#DCFCE7" },
  update:  { label: "Edição",      cor: "#C9921B", bg: "#FBF3E0" },
  delete:  { label: "Exclusão",    cor: "#E24B4A", bg: "#FCEBEB" },
  login:   { label: "Login",       cor: "#1A4870", bg: "#D5E8F5" },
  logout:  { label: "Logout",      cor: "#555555", bg: "#F1F5F9" },
  export:  { label: "Exportação",  cor: "#7C3AED", bg: "#EDE9FE" },
  view:    { label: "Visualização",cor: "#378ADD", bg: "#EFF7FF" },
};

const MODULOS_LISTA = [
  "dashboard","propriedades","lavoura","financeiro","estoque","contratos",
  "compras","fiscal","expedicao","transporte","relatorios","cadastros","configuracoes",
];

const inputStyle: React.CSSProperties = {
  padding: "7px 10px", border: "0.5px solid #D4DCE8", borderRadius: 8,
  fontSize: 12, color: "#1a1a1a", background: "#fff", outline: "none",
};

// ── Página ─────────────────────────────────────────────────────────────────────
export default function LogSistema() {
  const { fazendaId } = useAuth();
  const [logs, setLogs]           = useState<LogEntry[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro]           = useState<string | null>(null);
  const [detalhe, setDetalhe]     = useState<LogEntry | null>(null);
  const [pagina, setPagina]       = useState(1);
  const POR_PAGINA = 50;

  const hoje = new Date().toISOString().slice(0, 10);
  const [filtro, setFiltro] = useState<FiltroLog>({
    modulo: "", acao: "", usuario: "", inicio: "", fim: hoje, busca: "",
  });

  const setF = (p: Partial<FiltroLog>) => { setFiltro(f => ({ ...f, ...p })); setPagina(1); };

  useEffect(() => {
    if (!fazendaId) return;
    setCarregando(true);
    setErro(null);

    let q = supabase
      .from("logs_sistema")
      .select("*")
      .eq("fazenda_id", fazendaId)
      .order("created_at", { ascending: false })
      .limit(1000);

    if (filtro.inicio) q = q.gte("created_at", filtro.inicio + "T00:00:00");
    if (filtro.fim)    q = q.lte("created_at", filtro.fim    + "T23:59:59");
    if (filtro.modulo) q = q.eq("modulo", filtro.modulo);
    if (filtro.acao)   q = q.eq("acao", filtro.acao);

    q.then(({ data, error }) => {
      if (error) setErro(error.message);
      else setLogs((data ?? []) as LogEntry[]);
      setCarregando(false);
    });
  }, [fazendaId, filtro.inicio, filtro.fim, filtro.modulo, filtro.acao]);

  // Filtro client-side para busca e usuário
  const logsFiltrados = logs.filter(l => {
    if (filtro.usuario && !l.usuario_nome?.toLowerCase().includes(filtro.usuario.toLowerCase()) &&
        !l.usuario_email?.toLowerCase().includes(filtro.usuario.toLowerCase())) return false;
    if (filtro.busca) {
      const q = filtro.busca.toLowerCase();
      if (!l.descricao.toLowerCase().includes(q) &&
          !(l.entidade ?? "").toLowerCase().includes(q) &&
          !(l.modulo).toLowerCase().includes(q)) return false;
    }
    return true;
  });

  const totalPaginas = Math.max(1, Math.ceil(logsFiltrados.length / POR_PAGINA));
  const logsVisiveis = logsFiltrados.slice((pagina - 1) * POR_PAGINA, pagina * POR_PAGINA);

  // KPIs
  const kpis = {
    total:   logsFiltrados.length,
    insert:  logsFiltrados.filter(l => l.acao === "insert").length,
    update:  logsFiltrados.filter(l => l.acao === "update").length,
    delete:  logsFiltrados.filter(l => l.acao === "delete").length,
  };

  // Usuários únicos
  const usuariosUnicos = Array.from(new Set(logs.map(l => l.usuario_nome ?? l.usuario_email ?? "Sistema").filter(Boolean)));

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh", background: "#F3F6F9", fontFamily: "system-ui, sans-serif", fontSize: 13 }}>
      <TopNav />
      <main style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>

        {/* Cabeçalho */}
        <header style={{ background: "#fff", borderBottom: "0.5px solid #D4DCE8", padding: "10px 22px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 17, fontWeight: 600, color: "#1a1a1a" }}>Log do Sistema</h1>
            <p style={{ margin: 0, fontSize: 11, color: "#555" }}>Rastreamento completo de inserções, edições e exclusões por usuário</p>
          </div>
          <button
            onClick={() => {
              const csv = [
                ["Data/Hora","Usuário","Módulo","Ação","Descrição","Entidade","IP"],
                ...logsFiltrados.map(l => [fmtDt(l.created_at), l.usuario_nome ?? l.usuario_email ?? "—", l.modulo, l.acao, l.descricao, l.entidade ?? "", l.ip ?? ""])
              ].map(r => r.join(";")).join("\n");
              const a = document.createElement("a");
              a.href = "data:text/csv;charset=utf-8,\uFEFF" + encodeURIComponent(csv);
              a.download = `logs_${new Date().toISOString().slice(0,10)}.csv`;
              a.click();
            }}
            style={{ background: "#1A4870", color: "#fff", border: "none", borderRadius: 8, padding: "8px 16px", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
            ↓ Exportar CSV
          </button>
        </header>

        <div style={{ padding: "16px 22px", flex: 1 }}>

          {/* KPIs */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 16 }}>
            {[
              { label: "Total de eventos",  valor: kpis.total,  cor: "#1A4870", bg: "#D5E8F5" },
              { label: "Inserções",         valor: kpis.insert, cor: "#16A34A", bg: "#DCFCE7" },
              { label: "Edições",           valor: kpis.update, cor: "#C9921B", bg: "#FBF3E0" },
              { label: "Exclusões",         valor: kpis.delete, cor: "#E24B4A", bg: "#FCEBEB" },
            ].map((k, i) => (
              <div key={i} style={{ background: "#fff", border: "0.5px solid #D4DCE8", borderRadius: 12, padding: "12px 16px", display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{ width: 40, height: 40, borderRadius: 10, background: k.bg, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, fontWeight: 700, color: k.cor }}>
                  {k.valor.toLocaleString("pt-BR")}
                </div>
                <div>
                  <div style={{ fontSize: 10, color: "#555" }}>{k.label}</div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: k.cor }}>
                    {kpis.total > 0 ? Math.round(k.valor / kpis.total * 100) + "%" : "—"}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Filtros */}
          <div style={{ background: "#fff", border: "0.5px solid #D4DCE8", borderRadius: 12, padding: "14px 18px", marginBottom: 14, display: "flex", flexWrap: "wrap", gap: 10, alignItems: "flex-end" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <label style={{ fontSize: 10, color: "#555" }}>Início</label>
              <input type="date" value={filtro.inicio} onChange={e => setF({ inicio: e.target.value })} style={{ ...inputStyle, width: 130 }} />
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <label style={{ fontSize: 10, color: "#555" }}>Fim</label>
              <input type="date" value={filtro.fim} onChange={e => setF({ fim: e.target.value })} style={{ ...inputStyle, width: 130 }} />
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <label style={{ fontSize: 10, color: "#555" }}>Módulo</label>
              <select value={filtro.modulo} onChange={e => setF({ modulo: e.target.value })} style={{ ...inputStyle, width: 150 }}>
                <option value="">Todos</option>
                {MODULOS_LISTA.map(m => <option key={m} value={m}>{m.charAt(0).toUpperCase() + m.slice(1)}</option>)}
              </select>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <label style={{ fontSize: 10, color: "#555" }}>Ação</label>
              <select value={filtro.acao} onChange={e => setF({ acao: e.target.value })} style={{ ...inputStyle, width: 140 }}>
                <option value="">Todas</option>
                {(Object.keys(ACAO_META) as AcaoLog[]).map(a => (
                  <option key={a} value={a}>{ACAO_META[a].label}</option>
                ))}
              </select>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <label style={{ fontSize: 10, color: "#555" }}>Usuário</label>
              <select value={filtro.usuario} onChange={e => setF({ usuario: e.target.value })} style={{ ...inputStyle, width: 180 }}>
                <option value="">Todos</option>
                {usuariosUnicos.map(u => <option key={u} value={u}>{u}</option>)}
              </select>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 4, flex: 1, minWidth: 160 }}>
              <label style={{ fontSize: 10, color: "#555" }}>Busca</label>
              <input value={filtro.busca} onChange={e => setF({ busca: e.target.value })}
                placeholder="Descrição, entidade…" style={{ ...inputStyle, width: "100%" }} />
            </div>
            <button onClick={() => { setFiltro({ modulo: "", acao: "", usuario: "", inicio: "", fim: hoje, busca: "" }); setPagina(1); }}
              style={{ padding: "7px 14px", background: "#F4F6FA", border: "0.5px solid #D4DCE8", borderRadius: 8, fontSize: 12, color: "#555", cursor: "pointer" }}>
              Limpar
            </button>
          </div>

          {/* Tabela */}
          <div style={{ background: "#fff", border: "0.5px solid #D4DCE8", borderRadius: 12, overflow: "hidden" }}>
            <div style={{ padding: "11px 18px", borderBottom: "0.5px solid #DEE5EE", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span style={{ fontWeight: 600, fontSize: 13, color: "#1a1a1a" }}>
                {logsFiltrados.length.toLocaleString("pt-BR")} evento{logsFiltrados.length !== 1 ? "s" : ""}
              </span>
              {totalPaginas > 1 && (
                <div style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 12 }}>
                  <button onClick={() => setPagina(p => Math.max(1, p - 1))} disabled={pagina === 1}
                    style={{ padding: "3px 10px", border: "0.5px solid #D4DCE8", borderRadius: 6, background: "#fff", cursor: pagina === 1 ? "not-allowed" : "pointer", opacity: pagina === 1 ? 0.4 : 1 }}>‹</button>
                  <span style={{ color: "#555" }}>Página {pagina} de {totalPaginas}</span>
                  <button onClick={() => setPagina(p => Math.min(totalPaginas, p + 1))} disabled={pagina === totalPaginas}
                    style={{ padding: "3px 10px", border: "0.5px solid #D4DCE8", borderRadius: 6, background: "#fff", cursor: pagina === totalPaginas ? "not-allowed" : "pointer", opacity: pagina === totalPaginas ? 0.4 : 1 }}>›</button>
                </div>
              )}
            </div>

            {carregando ? (
              <div style={{ padding: 40, textAlign: "center", color: "#888" }}>Carregando logs…</div>
            ) : erro ? (
              <div style={{ padding: 20, background: "#FCEBEB", color: "#791F1F", fontSize: 12, margin: 16, borderRadius: 8 }}>
                ⚠ {erro} — Execute a migration abaixo para criar a tabela <code>logs_sistema</code>.
              </div>
            ) : logsFiltrados.length === 0 ? (
              <div style={{ padding: 40, textAlign: "center", color: "#888", fontSize: 13 }}>
                Nenhum log encontrado para os filtros selecionados.
              </div>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                  <thead>
                    <tr style={{ background: "#F4F6FA" }}>
                      {["Data / Hora", "Usuário", "Módulo", "Ação", "Descrição", "Entidade", ""].map(h => (
                        <th key={h} style={{ padding: "8px 14px", textAlign: "left", fontWeight: 600, fontSize: 11, color: "#555", borderBottom: "0.5px solid #DEE5EE", whiteSpace: "nowrap" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {logsVisiveis.map((l, i) => {
                      const meta = ACAO_META[l.acao] ?? { label: l.acao, cor: "#555", bg: "#F4F4F4" };
                      return (
                        <tr key={l.id} style={{ borderBottom: i < logsVisiveis.length - 1 ? "0.5px solid #F0F3F8" : "none", background: i % 2 === 0 ? "#fff" : "#FAFBFD" }}>
                          <td style={{ padding: "8px 14px", color: "#444", whiteSpace: "nowrap", fontFamily: "monospace", fontSize: 11 }}>{fmtDt(l.created_at)}</td>
                          <td style={{ padding: "8px 14px", color: "#1a1a1a", maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            <div style={{ fontWeight: 500 }}>{l.usuario_nome ?? "—"}</div>
                            {l.usuario_email && <div style={{ fontSize: 10, color: "#888" }}>{l.usuario_email}</div>}
                          </td>
                          <td style={{ padding: "8px 14px" }}>
                            <span style={{ fontSize: 10, background: "#EFF3FA", color: "#1A4870", padding: "2px 7px", borderRadius: 8, fontWeight: 600, textTransform: "capitalize" }}>{l.modulo}</span>
                          </td>
                          <td style={{ padding: "8px 14px" }}>
                            <span style={{ fontSize: 10, background: meta.bg, color: meta.cor, padding: "2px 8px", borderRadius: 10, fontWeight: 600 }}>{meta.label}</span>
                          </td>
                          <td style={{ padding: "8px 14px", color: "#444", maxWidth: 280, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{l.descricao}</td>
                          <td style={{ padding: "8px 14px", color: "#666", fontSize: 11 }}>{l.entidade ?? "—"}</td>
                          <td style={{ padding: "8px 14px" }}>
                            {(l.dados_antes || l.dados_depois) && (
                              <button onClick={() => setDetalhe(l)}
                                style={{ background: "none", border: "0.5px solid #D4DCE8", borderRadius: 6, padding: "3px 8px", fontSize: 11, color: "#555", cursor: "pointer" }}>
                                Detalhes
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Info migration */}
          {!carregando && erro && (
            <div style={{ marginTop: 16, background: "#FBF3E0", border: "0.5px solid #C9921B50", borderRadius: 8, padding: "12px 16px", fontSize: 12, color: "#555" }}>
              <strong style={{ color: "#C9921B" }}>Migration necessária:</strong> execute no Supabase SQL Editor:
              <pre style={{ marginTop: 8, background: "#fff", padding: 12, borderRadius: 6, fontSize: 11, overflowX: "auto", color: "#1a1a1a" }}>{`CREATE TABLE IF NOT EXISTS logs_sistema (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fazenda_id    UUID NOT NULL REFERENCES fazendas(id),
  usuario_id    UUID,
  usuario_nome  TEXT,
  usuario_email TEXT,
  acao          TEXT NOT NULL CHECK (acao IN ('insert','update','delete','login','logout','export','view')),
  modulo        TEXT NOT NULL,
  entidade      TEXT,
  entidade_id   UUID,
  descricao     TEXT NOT NULL,
  dados_antes   JSONB,
  dados_depois  JSONB,
  ip            TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_logs_fazenda_created ON logs_sistema(fazenda_id, created_at DESC);
CREATE INDEX idx_logs_acao            ON logs_sistema(acao);
CREATE INDEX idx_logs_modulo          ON logs_sistema(modulo);
ALTER TABLE logs_sistema ENABLE ROW LEVEL SECURITY;
CREATE POLICY logs_leitura ON logs_sistema FOR SELECT USING (fazenda_id = current_setting('app.fazenda_id')::uuid);`}</pre>
            </div>
          )}

        </div>
      </main>

      {/* Modal detalhe */}
      {detalhe && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center" }}
          onClick={e => { if (e.target === e.currentTarget) setDetalhe(null); }}>
          <div style={{ background: "#fff", borderRadius: 12, width: 700, maxWidth: "95vw", maxHeight: "85vh", overflow: "auto", boxShadow: "0 8px 40px rgba(0,0,0,0.2)" }}>
            <div style={{ padding: "16px 22px", borderBottom: "0.5px solid #DEE5EE", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 14, color: "#1a1a1a" }}>Detalhe do Log</div>
                <div style={{ fontSize: 11, color: "#555", marginTop: 2 }}>{fmtDt(detalhe.created_at)} · {detalhe.usuario_nome ?? detalhe.usuario_email ?? "Sistema"}</div>
              </div>
              <button onClick={() => setDetalhe(null)} style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer", color: "#555" }}>✕</button>
            </div>
            <div style={{ padding: "16px 22px", display: "grid", gap: 14 }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
                {[
                  { label: "Módulo",   valor: detalhe.modulo },
                  { label: "Ação",     valor: ACAO_META[detalhe.acao]?.label ?? detalhe.acao },
                  { label: "Entidade", valor: detalhe.entidade ?? "—" },
                  { label: "Descrição", valor: detalhe.descricao },
                  { label: "IP",       valor: detalhe.ip ?? "—" },
                  { label: "ID",       valor: detalhe.entidade_id ?? "—" },
                ].map(f => (
                  <div key={f.label} style={{ background: "#F4F6FA", borderRadius: 8, padding: "8px 12px" }}>
                    <div style={{ fontSize: 10, color: "#555", marginBottom: 3 }}>{f.label}</div>
                    <div style={{ fontSize: 12, fontWeight: 500, color: "#1a1a1a", wordBreak: "break-all" }}>{f.valor}</div>
                  </div>
                ))}
              </div>
              {detalhe.dados_antes && (
                <div>
                  <div style={{ fontSize: 11, fontWeight: 600, color: "#E24B4A", marginBottom: 6 }}>Antes da alteração</div>
                  <pre style={{ background: "#FFF5F5", padding: 12, borderRadius: 8, fontSize: 11, overflowX: "auto", color: "#1a1a1a" }}>
                    {JSON.stringify(detalhe.dados_antes, null, 2)}
                  </pre>
                </div>
              )}
              {detalhe.dados_depois && (
                <div>
                  <div style={{ fontSize: 11, fontWeight: 600, color: "#16A34A", marginBottom: 6 }}>Depois da alteração</div>
                  <pre style={{ background: "#F0FDF4", padding: 12, borderRadius: 8, fontSize: 11, overflowX: "auto", color: "#1a1a1a" }}>
                    {JSON.stringify(detalhe.dados_depois, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
