"use client";
import { useState, useEffect, useCallback } from "react";
import TopNav from "../../../components/TopNav";
import { useAuth } from "../../../components/AuthProvider";

interface BackupItem {
  nome: string;
  tamanho_bytes: number;
  criado_em: string;
  download_url: string | null;
}

const fmtDt = (s: string) => {
  if (!s) return "—";
  const d = new Date(s);
  return d.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
};

const fmtTamanho = (bytes: number) => {
  if (bytes < 1024)       return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
};

// Extrai data legível do nome do arquivo: "2026-04-23T06-00-00.json"
const nomeParaData = (nome: string) => {
  try {
    const s = nome.replace(".json", "").replace(/T/, " ").replace(/-(\d{2})-(\d{2})$/, ":$1:$2");
    const d = new Date(s);
    if (isNaN(d.getTime())) return nome;
    return d.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
  } catch { return nome; }
};

export default function BackupPage() {
  const { userRole, fazendaId } = useAuth();

  const [backups,        setBackups]        = useState<BackupItem[]>([]);
  const [loading,        setLoading]        = useState(true);
  const [criando,        setCriando]        = useState(false);
  const [restaurando,    setRestaurando]    = useState<string | null>(null);
  const [confirmacao,    setConfirmacao]    = useState("");
  const [modalRestaura,  setModalRestaura]  = useState<BackupItem | null>(null);
  const [resultado,      setResultado]      = useState<{ tipo: "ok" | "erro"; msg: string } | null>(null);
  const [detalhes,       setDetalhes]       = useState<Record<string, { restaurados: number; erro?: string }> | null>(null);

  const carregarBackups = useCallback(async () => {
    if (!fazendaId) return;
    setLoading(true);
    try {
      const r = await fetch(`/api/backup?fazenda_id=${fazendaId}`);
      const json = await r.json();
      setBackups(json.backups ?? []);
    } catch {
      setBackups([]);
    }
    setLoading(false);
  }, [fazendaId]);

  useEffect(() => { carregarBackups(); }, [carregarBackups]);

  async function criarBackup() {
    if (!fazendaId) return;
    setCriando(true);
    setResultado(null);
    try {
      const r = await fetch("/api/backup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fazenda_id: fazendaId }),
      });
      const json = await r.json();
      if (json.sucesso) {
        setResultado({ tipo: "ok", msg: `Backup criado com sucesso: ${json.arquivo}` });
        await carregarBackups();
      } else {
        setResultado({ tipo: "erro", msg: json.erro ?? "Erro ao criar backup" });
      }
    } catch (e) {
      setResultado({ tipo: "erro", msg: String(e) });
    }
    setCriando(false);
  }

  async function restaurarBackup() {
    if (!modalRestaura || confirmacao !== "RESTAURAR") return;
    setRestaurando(modalRestaura.nome);
    setResultado(null);
    setDetalhes(null);
    try {
      const r = await fetch("/api/backup/restore", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fazenda_id: fazendaId, arquivo: modalRestaura.nome, confirmacao }),
      });
      const json = await r.json();
      if (json.sucesso) {
        setResultado({ tipo: "ok", msg: `Restauração concluída: ${json.total_restaurados.toLocaleString("pt-BR")} registros restaurados.` });
        setDetalhes(json.tabelas);
      } else {
        setResultado({ tipo: "erro", msg: json.error ?? json.avisos ?? "Erro na restauração" });
        if (json.tabelas) setDetalhes(json.tabelas);
      }
    } catch (e) {
      setResultado({ tipo: "erro", msg: String(e) });
    }
    setRestaurando(null);
    setModalRestaura(null);
    setConfirmacao("");
  }

  const ultimoBackup = backups[0] ?? null;
  const tamanhoTotal = backups.reduce((s, b) => s + b.tamanho_bytes, 0);

  const podeRestaurar = userRole === "raccotlo" || userRole === "admin";

  return (
    <div style={{ minHeight: "100vh", background: "#F4F6FA", fontFamily: "system-ui, sans-serif" }}>
      <TopNav />

      <div style={{ maxWidth: 960, margin: "0 auto", padding: "28px 24px" }}>

        {/* Cabeçalho */}
        <div style={{ marginBottom: 24 }}>
          <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: "#1a1a1a" }}>Proteção de Dados — Backup & Restauração</h1>
          <p style={{ margin: "4px 0 0", fontSize: 13, color: "#666" }}>
            Exporta todos os dados da fazenda para um arquivo JSON seguro armazenado na nuvem.
          </p>
        </div>

        {/* Banner resultado */}
        {resultado && (
          <div style={{ marginBottom: 18, padding: "12px 16px", borderRadius: 8, background: resultado.tipo === "ok" ? "#ECFDF5" : "#FCEBEB", border: `0.5px solid ${resultado.tipo === "ok" ? "#BBF7D0" : "#FECACA"}`, color: resultado.tipo === "ok" ? "#14532D" : "#791F1F", fontSize: 13, display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
            <span>{resultado.tipo === "ok" ? "✓ " : "✗ "}{resultado.msg}</span>
            <button onClick={() => { setResultado(null); setDetalhes(null); }} style={{ border: "none", background: "none", cursor: "pointer", fontSize: 16, color: "inherit", padding: 0, flexShrink: 0 }}>✕</button>
          </div>
        )}

        {/* Cards de status */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 14, marginBottom: 22 }}>
          {[
            {
              label: "Último Backup",
              valor: ultimoBackup ? nomeParaData(ultimoBackup.nome) : "Nenhum ainda",
              sub: ultimoBackup ? fmtTamanho(ultimoBackup.tamanho_bytes) : "Crie o primeiro backup agora",
              cor: ultimoBackup ? "#14532D" : "#7A5A12",
              bg: ultimoBackup ? "#ECFDF5" : "#FBF3E0",
            },
            {
              label: "Total de Backups",
              valor: `${backups.length} arquivo${backups.length !== 1 ? "s" : ""}`,
              sub: `${fmtTamanho(tamanhoTotal)} armazenados`,
              cor: "#0C447C",
              bg: "#EBF3FC",
            },
            {
              label: "Backup Automático",
              valor: "Diário — 3h BRT",
              sub: "Cron configurado na Vercel",
              cor: "#14532D",
              bg: "#ECFDF5",
            },
          ].map(c => (
            <div key={c.label} style={{ background: c.bg, borderRadius: 10, padding: "16px 18px", border: "0.5px solid #DDE2EE" }}>
              <div style={{ fontSize: 11, color: "#666", marginBottom: 5 }}>{c.label}</div>
              <div style={{ fontSize: 16, fontWeight: 700, color: c.cor }}>{c.valor}</div>
              <div style={{ fontSize: 11, color: "#888", marginTop: 3 }}>{c.sub}</div>
            </div>
          ))}
        </div>

        {/* Ação principal */}
        <div style={{ background: "#fff", borderRadius: 12, border: "0.5px solid #DDE2EE", padding: "20px 24px", marginBottom: 22, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 20 }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: "#1a1a1a", marginBottom: 4 }}>Criar Backup Agora</div>
            <div style={{ fontSize: 12, color: "#555", lineHeight: 1.5 }}>
              Exporta todas as tabelas da fazenda (cadastros, lavoura, financeiro, estoque, etc.) para um arquivo JSON
              armazenado com segurança no Supabase Storage.
            </div>
          </div>
          <button
            onClick={criarBackup}
            disabled={criando}
            style={{
              padding: "11px 28px", borderRadius: 8, border: "none", cursor: criando ? "not-allowed" : "pointer",
              background: criando ? "#9AB5D0" : "#1A4870", color: "#fff", fontSize: 13, fontWeight: 700,
              whiteSpace: "nowrap", minWidth: 180,
            }}
          >
            {criando ? "Gerando backup…" : "Criar Backup Agora"}
          </button>
        </div>

        {/* Tabela de backups */}
        <div style={{ background: "#fff", borderRadius: 12, border: "0.5px solid #DDE2EE", overflow: "hidden", marginBottom: 22 }}>
          <div style={{ padding: "14px 18px", borderBottom: "0.5px solid #DDE2EE", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontWeight: 700, fontSize: 13, color: "#1a1a1a" }}>Histórico de Backups</span>
            <button onClick={carregarBackups} disabled={loading} style={{ padding: "5px 10px", borderRadius: 7, border: "0.5px solid #D4DCE8", background: "#fff", fontSize: 12, cursor: "pointer", color: "#555" }}>
              {loading ? "…" : "↻ Atualizar"}
            </button>
          </div>

          {loading ? (
            <div style={{ padding: "32px 18px", textAlign: "center", color: "#aaa", fontSize: 13 }}>Carregando…</div>
          ) : backups.length === 0 ? (
            <div style={{ padding: "48px 18px", textAlign: "center" }}>
              <div style={{ fontSize: 32, marginBottom: 10 }}>💾</div>
              <div style={{ fontSize: 14, fontWeight: 600, color: "#555", marginBottom: 6 }}>Nenhum backup encontrado</div>
              <div style={{ fontSize: 12, color: "#888" }}>
                Crie o primeiro backup agora ou verifique se o bucket <strong>backups</strong> foi criado no Supabase Storage.
              </div>
            </div>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ background: "#F8FAFD" }}>
                  {["Data/Hora", "Arquivo", "Tamanho", "Ações"].map((h, i) => (
                    <th key={h} style={{ padding: "9px 16px", textAlign: i === 3 ? "right" : "left", fontSize: 11, fontWeight: 600, color: "#555", borderBottom: "0.5px solid #DDE2EE" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {backups.map((b, i) => (
                  <tr key={b.nome} style={{ borderBottom: i < backups.length - 1 ? "0.5px solid #EEF1F6" : "none" }}>
                    <td style={{ padding: "10px 16px", fontSize: 13, color: "#1a1a1a", fontWeight: 500 }}>{nomeParaData(b.nome)}</td>
                    <td style={{ padding: "10px 16px", fontSize: 11, color: "#888", fontFamily: "monospace" }}>{b.nome}</td>
                    <td style={{ padding: "10px 16px", fontSize: 12, color: "#555" }}>{fmtTamanho(b.tamanho_bytes)}</td>
                    <td style={{ padding: "10px 16px", textAlign: "right", display: "flex", gap: 8, justifyContent: "flex-end" }}>
                      {b.download_url && (
                        <a
                          href={b.download_url}
                          download={b.nome}
                          style={{ padding: "5px 12px", borderRadius: 6, border: "0.5px solid #D4DCE8", background: "#fff", fontSize: 11, color: "#1A4870", textDecoration: "none", fontWeight: 600 }}
                        >
                          ⬇ Baixar
                        </a>
                      )}
                      {podeRestaurar && (
                        <button
                          onClick={() => { setModalRestaura(b); setConfirmacao(""); setResultado(null); setDetalhes(null); }}
                          style={{ padding: "5px 12px", borderRadius: 6, border: "0.5px solid #FECACA", background: "#FFF8F8", fontSize: 11, color: "#791F1F", cursor: "pointer", fontWeight: 600 }}
                        >
                          ↩ Restaurar
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Detalhes da última restauração */}
        {detalhes && (
          <div style={{ background: "#fff", borderRadius: 12, border: "0.5px solid #DDE2EE", overflow: "hidden", marginBottom: 22 }}>
            <div style={{ padding: "12px 18px", borderBottom: "0.5px solid #DDE2EE", fontWeight: 700, fontSize: 12, color: "#1a1a1a" }}>Detalhes da Restauração</div>
            <div style={{ padding: "14px 18px", display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 10 }}>
              {Object.entries(detalhes).filter(([, v]) => v.restaurados > 0 || v.erro).map(([tabela, v]) => (
                <div key={tabela} style={{ padding: "8px 10px", borderRadius: 7, background: v.erro ? "#FCEBEB" : "#ECFDF5", border: `0.5px solid ${v.erro ? "#FECACA" : "#BBF7D0"}` }}>
                  <div style={{ fontSize: 10, fontWeight: 600, color: v.erro ? "#791F1F" : "#14532D" }}>{tabela}</div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: v.erro ? "#E24B4A" : "#16A34A" }}>{v.erro ? "Erro" : `${v.restaurados} reg.`}</div>
                  {v.erro && <div style={{ fontSize: 9, color: "#888", marginTop: 2, wordBreak: "break-all" }}>{v.erro}</div>}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Instruções de configuração */}
        <div style={{ background: "#fff", borderRadius: 12, border: "0.5px solid #DDE2EE", padding: "18px 22px" }}>
          <div style={{ fontWeight: 700, fontSize: 13, color: "#1a1a1a", marginBottom: 14 }}>Configuração Necessária</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {[
              {
                passo: "1",
                titulo: "Criar bucket no Supabase Storage",
                desc: 'Acesse Supabase → Storage → New Bucket → nome: "backups" → marque como Private → Save.',
                status: "pendente",
              },
              {
                passo: "2",
                titulo: "Variável de ambiente SUPABASE_SERVICE_ROLE_KEY",
                desc: "Vercel → Project → Settings → Environment Variables. Necessária para o backup ter acesso a todas as tabelas.",
                status: "pendente",
              },
              {
                passo: "3",
                titulo: "Variável CRON_SECRET",
                desc: "Protege o endpoint do cron contra chamadas não autorizadas. Gere um token aleatório e adicione na Vercel.",
                status: "pendente",
              },
              {
                passo: "4",
                titulo: "Backup automático diário",
                desc: "Já configurado em vercel.json: /api/cron/backup roda todo dia às 3h BRT (6h UTC). Ativa automaticamente no deploy.",
                status: "configurado",
              },
              {
                passo: "5",
                titulo: "Migration da tabela backup_logs",
                desc: "Execute a seção 60 do supabase_migrations.sql no Supabase SQL Editor para criar a tabela de logs.",
                status: "pendente",
              },
            ].map(p => (
              <div key={p.passo} style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
                <div style={{ width: 24, height: 24, borderRadius: "50%", background: p.status === "configurado" ? "#ECFDF5" : "#EBF3FC", border: `0.5px solid ${p.status === "configurado" ? "#BBF7D0" : "#BFD9F2"}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, color: p.status === "configurado" ? "#14532D" : "#0C447C", flexShrink: 0, marginTop: 1 }}>
                  {p.status === "configurado" ? "✓" : p.passo}
                </div>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: "#1a1a1a" }}>{p.titulo}</div>
                  <div style={{ fontSize: 11, color: "#666", marginTop: 2, lineHeight: 1.5 }}>{p.desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Modal Restauração ─────────────────────────────────────── */}
      {modalRestaura && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
          <div style={{ background: "#fff", borderRadius: 14, width: "100%", maxWidth: 500, padding: "28px 28px 24px", boxShadow: "0 20px 60px rgba(0,0,0,0.25)" }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: "#791F1F", marginBottom: 6 }}>Restaurar Backup</div>
            <div style={{ fontSize: 12, color: "#555", marginBottom: 18, lineHeight: 1.6 }}>
              Esta operação vai sobrescrever os dados atuais com os dados do backup selecionado.
              Registros novos criados após o backup <strong>não serão apagados</strong> (modo upsert).
            </div>

            <div style={{ background: "#FBF3E0", border: "0.5px solid #FDE9BB", borderRadius: 8, padding: "10px 14px", marginBottom: 18, fontSize: 12, color: "#7A5A12" }}>
              <strong>Backup:</strong> {nomeParaData(modalRestaura.nome)}<br />
              <strong>Tamanho:</strong> {fmtTamanho(modalRestaura.tamanho_bytes)}
            </div>

            <div style={{ marginBottom: 20 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: "#1a1a1a", display: "block", marginBottom: 6 }}>
                Para confirmar, digite <strong style={{ color: "#E24B4A" }}>RESTAURAR</strong>:
              </label>
              <input
                type="text"
                value={confirmacao}
                onChange={e => setConfirmacao(e.target.value)}
                placeholder="RESTAURAR"
                style={{ width: "100%", padding: "10px 12px", border: `0.5px solid ${confirmacao === "RESTAURAR" ? "#16A34A" : "#D4DCE8"}`, borderRadius: 8, fontSize: 14, outline: "none", boxSizing: "border-box", letterSpacing: 1 }}
              />
            </div>

            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <button
                onClick={() => { setModalRestaura(null); setConfirmacao(""); }}
                style={{ padding: "9px 20px", borderRadius: 8, border: "0.5px solid #D4DCE8", background: "#fff", fontSize: 13, cursor: "pointer", color: "#555" }}
              >
                Cancelar
              </button>
              <button
                onClick={restaurarBackup}
                disabled={confirmacao !== "RESTAURAR" || !!restaurando}
                style={{ padding: "9px 20px", borderRadius: 8, border: "none", background: confirmacao !== "RESTAURAR" || restaurando ? "#ccc" : "#E24B4A", color: "#fff", fontSize: 13, fontWeight: 700, cursor: confirmacao !== "RESTAURAR" || restaurando ? "not-allowed" : "pointer" }}
              >
                {restaurando ? "Restaurando…" : "Confirmar Restauração"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
