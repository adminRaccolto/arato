"use client";
import { useState, useEffect, useCallback } from "react";
import TopNav from "../../../components/TopNav";
import { useAuth } from "../../../components/AuthProvider";
import { supabase } from "../../../lib/supabase";
import PlanoGate from "../../../components/PlanoGate";

// ─── Tipos ────────────────────────────────────────────────────

type StatusExec = "idle" | "running" | "ok" | "error";

type Automacao = {
  id:            string;
  nome:          string;
  descricao:     string;
  schedule:      string;
  scheduleLabel: string;
  endpoint:      string;
  cor:           string;
  icone:         string;
  categoria:     "alertas" | "relatorios" | "mercado" | "fiscal";
  temConfig?:    boolean;
};

const AUTOMACOES: Automacao[] = [
  {
    id:            "alertas-vencimento",
    nome:          "Alertas de Vencimento",
    descricao:     "Verifica CP, CR, arrendamentos e certificado A1 vencendo nos próximos 7 dias e envia e-mail de alerta.",
    schedule:      "0 10 * * *",
    scheduleLabel: "Todo dia às 7h BRT",
    endpoint:      "/api/cron/alertas-vencimento",
    cor:           "#E24B4A",
    icone:         "🔔",
    categoria:     "alertas",
  },
  {
    id:            "relatorio-semanal",
    nome:          "Relatório Semanal",
    descricao:     "Envia por e-mail o resumo financeiro da semana: CP/CR a vencer, vencidos, saldo projetado e preços de mercado.",
    schedule:      "0 10 * * 1",
    scheduleLabel: "Toda segunda-feira às 7h BRT",
    endpoint:      "/api/cron/relatorio-semanal",
    cor:           "#1A4870",
    icone:         "📊",
    categoria:     "relatorios",
  },
  {
    id:            "precos-mercado",
    nome:          "Atualização de Preços",
    descricao:     "Atualiza cotações de Soja, Milho, Algodão (CBOT/B3) e USD/BRL. Já roda automaticamente ao abrir o Dashboard.",
    schedule:      "0 10 * * *",
    scheduleLabel: "Todo dia às 7h BRT (+ ao vivo no Dashboard)",
    endpoint:      "/api/precos",
    cor:           "#C9921B",
    icone:         "📈",
    categoria:     "mercado",
  },
  {
    id:            "sieg-sync",
    nome:          "Importação Automática SIEG",
    descricao:     "Consulta a API SIEG 2× ao dia, baixa NF-e e NF-Se recebidas, cria fornecedor automaticamente (se novo), lança Conta a Pagar, arquiva XML e classifica itens via regras.",
    schedule:      "0 11,20 * * *",
    scheduleLabel: "2× ao dia: 8h e 17h BRT",
    endpoint:      "/api/cron/sieg-sync",
    cor:           "#16A34A",
    icone:         "🔄",
    categoria:     "fiscal",
    temConfig:     true,
  },
];

const CAT_LABEL: Record<string, string> = {
  alertas:    "Alertas",
  relatorios: "Relatórios",
  mercado:    "Mercado",
  fiscal:     "Fiscal — SIEG",
};

// ─── Página ───────────────────────────────────────────────────

export default function AutomacoesPage() {
  const { fazendaId, nomeUsuario, podeAcessarPlano } = useAuth();

  const [status,    setStatus]    = useState<Record<string, StatusExec>>({});
  const [resultados,setResultados]= useState<Record<string, string>>({});
  const [emailConfig, setEmailConfig] = useState({ from: "", destinatario: "" });

  // Toggle e config por automação
  const [ativas,   setAtivas]   = useState<Record<string, boolean>>({});
  const [configs,  setConfigs]  = useState<Record<string, Record<string, string>>>({});
  const [salvando, setSalvando] = useState<Record<string, boolean>>({});

  // Modal config SIEG
  const [modalSieg, setModalSieg] = useState(false);
  const [siegForm,  setSiegForm]  = useState({ api_key: "", cnpjs: "" });

  // ── Carrega configurações salvas ─────────────────────────

  const carregarConfigs = useCallback(async () => {
    if (!fazendaId) return;
    const { data } = await supabase
      .from("configuracoes_automacao")
      .select("automacao_id, ativa, config")
      .eq("fazenda_id", fazendaId);
    const ativasMap: Record<string, boolean> = {};
    const cfgMap:    Record<string, Record<string, string>> = {};
    for (const row of data ?? []) {
      ativasMap[row.automacao_id] = row.ativa;
      cfgMap[row.automacao_id]    = (row.config ?? {}) as Record<string, string>;
    }
    setAtivas(ativasMap);
    setConfigs(cfgMap);
    if (cfgMap["sieg-sync"]) {
      setSiegForm({
        api_key: cfgMap["sieg-sync"].api_key ?? "",
        cnpjs:   cfgMap["sieg-sync"].cnpjs   ?? "",
      });
    }
  }, [fazendaId]);

  useEffect(() => { carregarConfigs(); }, [carregarConfigs]);

  // ── Toggle ativa/desativa ────────────────────────────────

  async function toggleAtiva(autId: string, novoValor: boolean) {
    if (!fazendaId) return;
    setAtivas(prev => ({ ...prev, [autId]: novoValor }));
    const { data: exists } = await supabase
      .from("configuracoes_automacao").select("id")
      .eq("fazenda_id", fazendaId).eq("automacao_id", autId).maybeSingle();
    if (exists) {
      await supabase.from("configuracoes_automacao")
        .update({ ativa: novoValor })
        .eq("fazenda_id", fazendaId).eq("automacao_id", autId);
    } else {
      await supabase.from("configuracoes_automacao")
        .insert({ fazenda_id: fazendaId, automacao_id: autId, ativa: novoValor, config: {} });
    }
  }

  // ── Salva config SIEG ────────────────────────────────────

  async function salvarSieg() {
    if (!fazendaId) return;
    setSalvando(prev => ({ ...prev, "sieg-sync": true }));
    const cfg = { api_key: siegForm.api_key, cnpjs: siegForm.cnpjs };
    const { data: exists } = await supabase
      .from("configuracoes_automacao").select("id")
      .eq("fazenda_id", fazendaId).eq("automacao_id", "sieg-sync").maybeSingle();
    if (exists) {
      await supabase.from("configuracoes_automacao")
        .update({ config: cfg })
        .eq("fazenda_id", fazendaId).eq("automacao_id", "sieg-sync");
    } else {
      await supabase.from("configuracoes_automacao")
        .insert({ fazenda_id: fazendaId, automacao_id: "sieg-sync", ativa: false, config: cfg });
    }
    setConfigs(prev => ({ ...prev, "sieg-sync": cfg }));
    setSalvando(prev => ({ ...prev, "sieg-sync": false }));
    setModalSieg(false);
  }

  // ── Executar manualmente ────────────────────────────────

  async function executar(aut: Automacao) {
    setStatus(s  => ({ ...s, [aut.id]: "running" }));
    setResultados(r => ({ ...r, [aut.id]: "" }));
    try {
      const res  = await fetch(aut.endpoint, { method: "GET" });
      const json = await res.json().catch(() => ({}));
      if (res.ok) {
        const msg = json.importadas != null
          ? `${json.importadas} NF(s) importada(s) — ${json.classificadas ?? 0} classificadas, ${json.pendentes ?? 0} pendentes`
          : json.enviados != null
          ? `${json.enviados} e-mail(s) enviado(s)`
          : json.msg ?? "Executado com sucesso";
        setResultados(r => ({ ...r, [aut.id]: msg }));
        setStatus(s    => ({ ...s, [aut.id]: "ok" }));
      } else {
        setResultados(r => ({ ...r, [aut.id]: json.error ?? json.erro ?? `Erro HTTP ${res.status}` }));
        setStatus(s    => ({ ...s, [aut.id]: "error" }));
      }
    } catch (err) {
      setResultados(r => ({ ...r, [aut.id]: String(err) }));
      setStatus(s    => ({ ...s, [aut.id]: "error" }));
    }
    setTimeout(() => setStatus(s => ({ ...s, [aut.id]: "idle" })), 10000);
  }

  const categorias = [...new Set(AUTOMACOES.map(a => a.categoria))];

  if (!podeAcessarPlano("automacoes")) return <PlanoGate modulo="automacoes" />;
  return (
    <>
      <TopNav />
      <main style={{ padding: "24px 28px", background: "var(--bg-page)", minHeight: "calc(100vh - 96px)", fontFamily: "system-ui, sans-serif" }}>

        <div style={{ marginBottom: 24 }}>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: "var(--text-1)", margin: 0 }}>Automações</h1>
          <p style={{ fontSize: 13, color: "#666", margin: "4px 0 0" }}>
            Jobs agendados que rodam automaticamente. Use o toggle para ativar/desativar por fazenda.
          </p>
        </div>

        {/* Banner */}
        <div style={{ background: "#EBF5FF", border: "0.5px solid #93C5FD", borderRadius: 10, padding: "12px 16px", marginBottom: 24, display: "flex", gap: 12, alignItems: "flex-start" }}>
          <span style={{ fontSize: 18 }}>⚙️</span>
          <div style={{ fontSize: 12, color: "#1e40af", lineHeight: 1.6 }}>
            <strong>Cron Jobs na Vercel</strong> — os horários usam UTC convertido para Brasília (UTC-3).
            Monitore execuções em: Vercel Dashboard → Functions → Cron Jobs.
            O botão <strong>▶ Executar</strong> dispara manualmente para testar.
          </div>
        </div>

        {/* Cards por categoria */}
        {categorias.map(cat => {
          const lista = AUTOMACOES.filter(a => a.categoria === cat);
          return (
            <div key={cat} style={{ marginBottom: 28 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 10 }}>
                {CAT_LABEL[cat]}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {lista.map(aut => {
                  const st   = status[aut.id]    ?? "idle";
                  const res  = resultados[aut.id];
                  const ativa = ativas[aut.id]   ?? false;
                  const cfg  = configs[aut.id]   ?? {};
                  const semConfig = aut.temConfig && !cfg.api_key;

                  return (
                    <div
                      key={aut.id}
                      style={{
                        background: "var(--bg-card)",
                        border: `0.5px solid ${st === "ok" ? "#86EFAC" : st === "error" ? "#FECACA" : ativa ? "#93C5FD" : "var(--border)"}`,
                        borderRadius: 10,
                        padding: "16px 20px",
                        display: "flex",
                        alignItems: "flex-start",
                        gap: 16,
                        transition: "border-color 0.3s",
                        opacity: aut.temConfig && !ativa ? 0.85 : 1,
                      }}
                    >
                      {/* Ícone */}
                      <div style={{ width: 44, height: 44, borderRadius: 10, background: `${aut.cor}18`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, flexShrink: 0 }}>
                        {aut.icone}
                      </div>

                      {/* Info */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4, flexWrap: "wrap" }}>
                          <span style={{ fontSize: 14, fontWeight: 700, color: "var(--text-1)" }}>{aut.nome}</span>
                          <span style={{ fontSize: 11, color: "var(--text-3)", background: "#F3F6F9", padding: "2px 8px", borderRadius: 20, border: "0.5px solid var(--border)" }}>
                            🕐 {aut.scheduleLabel}
                          </span>
                          {ativa && (
                            <span style={{ fontSize: 10, color: "#166534", background: "#DCFCE7", padding: "2px 8px", borderRadius: 20, border: "0.5px solid #86EFAC", fontWeight: 600 }}>
                              ● Ativa
                            </span>
                          )}
                          {semConfig && (
                            <span style={{ fontSize: 10, color: "#92400E", background: "#FEF3C7", padding: "2px 8px", borderRadius: 20, border: "0.5px solid #FCD34D", fontWeight: 600 }}>
                              ⚠ Configure antes de ativar
                            </span>
                          )}
                        </div>
                        <p style={{ fontSize: 13, color: "var(--text-2)", margin: 0, lineHeight: 1.5 }}>{aut.descricao}</p>

                        {/* Config SIEG resumida */}
                        {aut.temConfig && cfg.cnpjs && (
                          <div style={{ marginTop: 6, fontSize: 11, color: "#1A4870", background: "#EBF5FF", padding: "4px 10px", borderRadius: 6, display: "inline-flex", alignItems: "center", gap: 6 }}>
                            <span>CNPJ(s) monitorados: <strong>{cfg.cnpjs}</strong></span>
                            <button
                              onClick={() => { setSiegForm({ api_key: cfg.api_key ?? "", cnpjs: cfg.cnpjs ?? "" }); setModalSieg(true); }}
                              style={{ background: "none", border: "none", color: "#1A4870", fontSize: 11, cursor: "pointer", fontWeight: 600, padding: 0 }}
                            >
                              Editar
                            </button>
                          </div>
                        )}

                        <div style={{ marginTop: 8, fontSize: 11, color: "var(--text-muted)", fontFamily: "monospace" }}>
                          GET {aut.endpoint}
                        </div>

                        {res && (
                          <div style={{
                            marginTop: 8, fontSize: 12, padding: "6px 10px", borderRadius: 6,
                            background: st === "error" ? "#FEF2F2" : "#F0FDF4",
                            color: st === "error" ? "#991B1B" : "#166534",
                            border: `0.5px solid ${st === "error" ? "#FECACA" : "#86EFAC"}`,
                          }}>
                            {st === "error" ? "✗ " : "✓ "}{res}
                          </div>
                        )}
                      </div>

                      {/* Controles */}
                      <div style={{ display: "flex", flexDirection: "column", gap: 8, alignItems: "flex-end", flexShrink: 0 }}>
                        {/* Toggle ON/OFF */}
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <span style={{ fontSize: 11, color: "var(--text-3)" }}>{ativa ? "Ativa" : "Inativa"}</span>
                          <button
                            onClick={() => {
                              if (aut.temConfig && !ativa && !cfg.api_key) {
                                setSiegForm({ api_key: cfg.api_key ?? "", cnpjs: cfg.cnpjs ?? "" });
                                setModalSieg(true);
                              } else {
                                toggleAtiva(aut.id, !ativa);
                              }
                            }}
                            style={{
                              width: 44, height: 24, borderRadius: 12, border: "none", cursor: "pointer",
                              background: ativa ? "#16A34A" : "var(--border)",
                              position: "relative", transition: "background 0.25s",
                              flexShrink: 0,
                            }}
                          >
                            <span style={{
                              position: "absolute", top: 4, left: ativa ? 23 : 4,
                              width: 16, height: 16, borderRadius: "50%", background: "var(--bg-card)",
                              transition: "left 0.25s", display: "block",
                              boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
                            }} />
                          </button>
                        </div>

                        {/* Botão config SIEG */}
                        {aut.temConfig && (
                          <button
                            onClick={() => { setSiegForm({ api_key: cfg.api_key ?? "", cnpjs: cfg.cnpjs ?? "" }); setModalSieg(true); }}
                            style={{
                              padding: "6px 12px", borderRadius: 6, border: "0.5px solid var(--border)",
                              background: "var(--bg-card)", color: "var(--text-2)", fontSize: 11, fontWeight: 600, cursor: "pointer",
                            }}
                          >
                            ⚙️ Configurar
                          </button>
                        )}

                        {/* Botão executar */}
                        <button
                          onClick={() => executar(aut)}
                          disabled={st === "running"}
                          style={{
                            padding: "7px 14px", borderRadius: 7, border: "none", cursor: st === "running" ? "not-allowed" : "pointer",
                            background: st === "running" ? "#F3F6F9"
                              : st === "ok"      ? "#16A34A"
                              : st === "error"   ? "#E24B4A"
                              : aut.cor,
                            color: st === "running" ? "var(--text-muted)" : "#fff",
                            fontSize: 12, fontWeight: 600, whiteSpace: "nowrap",
                            transition: "background 0.3s", minWidth: 90,
                          }}
                        >
                          {st === "running" ? "Executando…" : st === "ok" ? "✓ OK" : st === "error" ? "✗ Erro" : "▶ Executar"}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}

        {/* Configuração de e-mail */}
        <div style={{ background: "var(--bg-card)", border: "0.5px solid var(--border)", borderRadius: 10, padding: "20px 24px", marginBottom: 24 }}>
          <h2 style={{ fontSize: 15, fontWeight: 700, color: "var(--text-1)", margin: "0 0 4px" }}>Configuração de E-mail</h2>
          <p style={{ fontSize: 12, color: "var(--text-3)", margin: "0 0 16px" }}>
            Configure o remetente dos alertas automáticos.
          </p>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, maxWidth: 600 }}>
            <div>
              <label style={{ fontSize: 11, color: "var(--text-3)", display: "block", marginBottom: 4 }}>Remetente (RESEND_FROM)</label>
              <input
                value={emailConfig.from}
                onChange={e => setEmailConfig(c => ({ ...c, from: e.target.value }))}
                placeholder="alertas@ractech.com.br"
                style={{ width: "100%", padding: "8px 10px", borderRadius: 7, border: "0.5px solid var(--border)", fontSize: 13, boxSizing: "border-box" }}
              />
              <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 4 }}>
                Configure em Vercel → Settings → Env → <code>RESEND_FROM</code>
              </div>
            </div>
            <div>
              <label style={{ fontSize: 11, color: "var(--text-3)", display: "block", marginBottom: 4 }}>Destinatário padrão (fallback)</label>
              <input
                value={emailConfig.destinatario}
                onChange={e => setEmailConfig(c => ({ ...c, destinatario: e.target.value }))}
                placeholder={nomeUsuario ? "email@fazenda.com" : "email@fazenda.com"}
                style={{ width: "100%", padding: "8px 10px", borderRadius: 7, border: "0.5px solid var(--border)", fontSize: 13, boxSizing: "border-box" }}
              />
            </div>
          </div>
        </div>

        {/* Variáveis de ambiente */}
        <div style={{ background: "#FAFBFD", border: "0.5px solid var(--border)", borderRadius: 10, padding: "16px 20px" }}>
          <h2 style={{ fontSize: 13, fontWeight: 700, color: "#333", margin: "0 0 12px" }}>Variáveis de Ambiente (Vercel)</h2>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {[
              { key: "RESEND_API_KEY",             desc: "Chave da API Resend para envio de e-mails",               obrig: true  },
              { key: "RESEND_FROM",                 desc: "E-mail remetente verificado no Resend",                   obrig: true  },
              { key: "SUPABASE_SERVICE_ROLE_KEY",   desc: "Service Role Key do Supabase — acesso irrestrito",        obrig: true  },
              { key: "SIEG_API_KEY",                desc: "API Key global da SIEG (alternativa à configuração por fazenda)", obrig: false },
              { key: "CRON_SECRET",                 desc: "Segredo para proteger os endpoints cron de chamadas externas", obrig: false },
              { key: "NEXT_PUBLIC_APP_URL",          desc: "URL pública do app (ex: https://web.arato.agr.br)",        obrig: false },
            ].map(v => (
              <div key={v.key} style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "7px 0", borderBottom: "0.5px solid #F0F2F8" }}>
                <code style={{ fontSize: 12, background: "#F0F2F8", padding: "2px 8px", borderRadius: 5, color: "#1A4870", minWidth: 240, flexShrink: 0 }}>{v.key}</code>
                <span style={{ fontSize: 12, color: "var(--text-2)", flex: 1 }}>{v.desc}</span>
                <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 10, background: v.obrig ? "#FEF2F2" : "#F3F6F9", color: v.obrig ? "#991B1B" : "var(--text-3)", border: `0.5px solid ${v.obrig ? "#FECACA" : "var(--border)"}`, flexShrink: 0 }}>
                  {v.obrig ? "Obrigatório" : "Opcional"}
                </span>
              </div>
            ))}
          </div>
        </div>
      </main>

      {/* ── Modal Configuração SIEG ── */}
      {modalSieg && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex:2000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
          <div style={{ background: "var(--bg-card)", borderRadius: 12, width: "min(560px, 97vw)", padding: 28 }}>
            <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 6 }}>🔄 Configuração SIEG</div>
            <p style={{ fontSize: 12, color: "#666", margin: "0 0 20px", lineHeight: 1.6 }}>
              A chave de API pode ser configurada aqui (por fazenda) ou via variável de ambiente
              <code style={{ fontSize: 11, background: "#F0F2F8", padding: "1px 5px", borderRadius: 4, marginLeft: 4 }}>SIEG_API_KEY</code>
              na Vercel (global para todas as fazendas).
            </p>

            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 11, color: "var(--text-3)", display: "block", marginBottom: 4, fontWeight: 600 }}>API Key SIEG</label>
              <input
                type="password"
                value={siegForm.api_key}
                onChange={e => setSiegForm(f => ({ ...f, api_key: e.target.value }))}
                placeholder="Cole aqui a chave de API da SIEG..."
                style={{ width: "100%", padding: "8px 10px", borderRadius: 7, border: "0.5px solid var(--border)", fontSize: 13, boxSizing: "border-box", fontFamily: "monospace" }}
              />
              <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 3 }}>
                Disponível no painel SIEG → Configurações → API Key. Se o campo estiver vazio, usa SIEG_API_KEY da Vercel.
              </div>
            </div>

            <div style={{ marginBottom: 24 }}>
              <label style={{ fontSize: 11, color: "var(--text-3)", display: "block", marginBottom: 4, fontWeight: 600 }}>CNPJ(s) para monitorar</label>
              <input
                value={siegForm.cnpjs}
                onChange={e => setSiegForm(f => ({ ...f, cnpjs: e.target.value }))}
                placeholder="00.000.000/0001-00, 11.111.111/0001-11"
                style={{ width: "100%", padding: "8px 10px", borderRadius: 7, border: "0.5px solid var(--border)", fontSize: 13, boxSizing: "border-box" }}
              />
              <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 3 }}>
                Separe múltiplos CNPJs com vírgula. O sistema consulta todos e importa NFs destinadas a eles.
              </div>
            </div>

            <div style={{ background: "#F0FDF4", border: "0.5px solid #86EFAC", borderRadius: 8, padding: "10px 14px", marginBottom: 20, fontSize: 12, color: "#166534" }}>
              <strong>Após salvar:</strong> ative o toggle da automação SIEG para que o cron execute automaticamente 2× ao dia.
              Você pode clicar em <strong>▶ Executar</strong> para testar manualmente.
            </div>

            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <button
                onClick={() => setModalSieg(false)}
                style={{ padding: "8px 20px", borderRadius: 7, border: "0.5px solid var(--border)", background: "var(--bg-card)", color: "var(--text-2)", fontSize: 13, fontWeight: 600, cursor: "pointer" }}
              >
                Cancelar
              </button>
              <button
                onClick={salvarSieg}
                disabled={salvando["sieg-sync"]}
                style={{ padding: "8px 22px", borderRadius: 7, border: "none", background: "#1A4870", color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer" }}
              >
                {salvando["sieg-sync"] ? "Salvando…" : "Salvar Configuração"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
