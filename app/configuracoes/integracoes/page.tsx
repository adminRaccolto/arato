"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../../lib/supabase";
import { useAuth } from "../../../components/AuthProvider";
import TopNav from "../../../components/TopNav";
import BalancaSerial from "../../../components/BalancaSerial";

// ─── Tipos ───────────────────────────────────────────────────────────────────

type Categoria = "fiscal" | "balanca" | "comunicacao" | "mercado" | "bancario";

interface IntegracaoCatalogo {
  id: string;
  categoria: Categoria;
  nome: string;
  fabricante: string | null;
  descricao: string;
  icone: string;
  config_padrao: Record<string, unknown>;
  requer_hardware: boolean;
  requer_api_key: boolean;
  ativo: boolean;
  ordem: number;
}

interface IntegracaoFazenda {
  id: string;
  fazenda_id: string;
  integracao_id: string;
  config: Record<string, unknown>;
  ativo: boolean;
  testado_em: string | null;
}

interface SiegCfg {
  cnpjs_destino:    string[];   // lista de CPF/CNPJ monitorados
  cnpj_destino?:    string;     // legado — migrado automaticamente
  ultima_sync_data?: string;
  ultima_sync_ts?:   string;
  total_importado?:  string;
  api_key?:          string;    // chave por fazenda (sobrepõe env global)
}

function normalizarSiegCfg(raw: Record<string, unknown>): SiegCfg {
  const base: SiegCfg = {
    cnpjs_destino:    [],
    ultima_sync_data: raw.ultima_sync_data as string | undefined,
    ultima_sync_ts:   raw.ultima_sync_ts   as string | undefined,
    total_importado:  raw.total_importado  as string | undefined,
  };
  if (Array.isArray(raw.cnpjs_destino)) {
    return { ...base, cnpjs_destino: (raw.cnpjs_destino as string[]).map(c => c.replace(/\D/g, "")).filter(Boolean) };
  }
  const legacy = String(raw.cnpj_destino ?? "").replace(/\D/g, "");
  return { ...base, cnpjs_destino: legacy ? [legacy] : [] };
}

interface SiegSyncResult {
  sucesso?:      boolean;
  importados_nfe?: number;
  duplicados_nfe?: number;
  total_xmls?:   number;
  erros?:        string[];
  erro?:         string;
}

const CATEGORIAS: { id: Categoria; label: string; icone: string }[] = [
  { id: "fiscal",      label: "Fiscal",         icone: "📄" },
  { id: "balanca",     label: "Balanças",        icone: "⚖️"  },
  { id: "comunicacao", label: "Comunicação",     icone: "💬"  },
  { id: "mercado",     label: "Mercado",         icone: "📈"  },
  { id: "bancario",    label: "Bancário",        icone: "🏦"  },
];

// ─── Helpers de estilo ────────────────────────────────────────────────────────
const inp = (v: string, onChange: (v: string) => void, placeholder?: string, type = "text") => (
  <input
    type={type}
    value={v}
    onChange={e => onChange(e.target.value)}
    placeholder={placeholder}
    style={{ width: "100%", padding: "8px 12px", borderRadius: 6, border: "0.5px solid #DDE2EE",
             fontSize: 13, boxSizing: "border-box", outline: "none" }}
  />
);

interface CertResult {
  sucesso?: boolean;
  resposta?: unknown;
  erro?: string;
  key_source?: string;
  key_info?: string;
  cnpj?: string;
}

// ─── Modal Sieg ───────────────────────────────────────────────────────────────
function ModalSieg({
  fazendaId,
  contaId,
  cfgInicial,
  onClose,
  onSaved,
}: {
  fazendaId: string;
  contaId: string | null;
  cfgInicial: SiegCfg;
  onClose: () => void;
  onSaved: (cfg: SiegCfg) => void;
}) {
  const [cfg,      setCfg]     = useState<SiegCfg>(cfgInicial);
  const [novoDoc,  setNovoDoc] = useState("");
  const [saving,   setSaving]  = useState(false);
  const [syncing,  setSyncing] = useState(false);
  const [result,   setResult]  = useState<SiegSyncResult | null>(null);
  const [tab,      setTab]     = useState<"config" | "cert">("config");

  // Produtores cadastrados para sugestão automática
  const [produtoresSugeridos, setProdutoresSugeridos] = useState<{ nome: string; cpf_cnpj: string }[]>([]);

  useEffect(() => {
    const query = supabase.from("produtores").select("nome, cpf_cnpj").not("cpf_cnpj", "is", null);
    const promise = contaId
      ? query.eq("conta_id", contaId)
      : query.eq("fazenda_id", fazendaId);
    promise.then(({ data }) => {
      if (data) setProdutoresSugeridos(
        data
          .map(p => ({ nome: p.nome as string, cpf_cnpj: (p.cpf_cnpj as string).replace(/\D/g, "") }))
          .filter(p => p.cpf_cnpj.length === 11 || p.cpf_cnpj.length === 14)
      );
    });
  }, [fazendaId, contaId]);

  // Registro de certificado
  const [certCnpj,    setCertCnpj]    = useState("");
  const [certNfe,     setCertNfe]     = useState(true);
  const [certCte,     setCertCte]     = useState(true);
  const [certSaving,  setCertSaving]  = useState(false);
  const [certResults, setCertResults] = useState<CertResult[]>([]);
  const [diagResult,  setDiagResult]  = useState<Record<string, unknown> | null>(null);
  const [diagLoading, setDiagLoading] = useState(false);

  function adicionarDoc() {
    const limpo = novoDoc.replace(/\D/g, "");
    if (!limpo || cfg.cnpjs_destino.includes(limpo)) { setNovoDoc(""); return; }
    setCfg(prev => ({ ...prev, cnpjs_destino: [...prev.cnpjs_destino, limpo] }));
    setNovoDoc("");
  }

  function removerDoc(doc: string) {
    setCfg(prev => ({ ...prev, cnpjs_destino: prev.cnpjs_destino.filter(d => d !== doc) }));
  }

  function formatarDoc(d: string) {
    if (d.length === 11) return d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
    if (d.length === 14) return d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5");
    return d;
  }

  async function salvar() {
    setSaving(true);
    await supabase.from("configuracoes_modulo").upsert({ fazenda_id: fazendaId, modulo: "sieg", config: cfg });
    setSaving(false);
    onSaved(cfg);
    onClose();
  }

  async function sincronizar() {
    if (cfg.cnpjs_destino.length === 0) { alert("Adicione ao menos um CPF ou CNPJ antes de sincronizar."); return; }
    setSyncing(true);
    setResult(null);
    await supabase.from("configuracoes_modulo").upsert({ fazenda_id: fazendaId, modulo: "sieg", config: cfg });
    try {
      const res = await fetch("/api/integracoes/sieg-sync", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fazenda_id: fazendaId }),
      });
      const data = await res.json() as SiegSyncResult;
      setResult(data);
      if (data.sucesso) {
        setCfg(prev => ({
          ...prev,
          ultima_sync_data: new Date().toISOString().slice(0, 10),
          total_importado: String((parseInt(prev.total_importado || "0") + (data.importados_nfe ?? 0))),
        }));
      }
    } catch (e) { setResult({ erro: String(e) }); }
    setSyncing(false);
  }

  async function registrarCnpj(cnpj: string) {
    setCertSaving(true);
    try {
      const res = await fetch("/api/integracoes/sieg-cert", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fazenda_id: fazendaId, cnpj, consulta_nfe: certNfe, consulta_cte: certCte }),
      });
      const data = await res.json() as CertResult;
      setCertResults(prev => {
        const idx = prev.findIndex(r => r.cnpj === cnpj.replace(/\D/g, ""));
        if (idx >= 0) { const next = [...prev]; next[idx] = data; return next; }
        return [...prev, data];
      });
    } catch (e) {
      setCertResults(prev => [...prev, { erro: String(e), cnpj: cnpj.replace(/\D/g, "") }]);
    }
    setCertSaving(false);
  }

  async function testarDiagnostico() {
    setDiagLoading(true);
    setDiagResult(null);
    try {
      const res = await fetch(`/api/integracoes/sieg-test?fazenda_id=${fazendaId}`);
      const data = await res.json() as Record<string, unknown>;
      setDiagResult(data);
    } catch (e) { setDiagResult({ erro_rede: String(e) }); }
    setDiagLoading(false);
  }

  async function registrarTodos() {
    const lista = certCnpj ? [certCnpj] : cfg.cnpjs_destino;
    if (lista.length === 0) { alert("Nenhum CNPJ/CPF cadastrado."); return; }
    setCertResults([]);
    for (const cnpj of lista) await registrarCnpj(cnpj);
  }

  const fmtData = (d?: string) => d ? new Date(d + "T12:00:00").toLocaleDateString("pt-BR") : "—";

  const temChaveFazenda = !!(cfg.api_key?.trim());

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex:2000,
                  display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ background: "var(--bg-card)", borderRadius: 12, padding: 32, width: 700,
                    maxHeight: "92vh", overflowY: "auto", boxShadow: "0 20px 60px rgba(0,0,0,0.2)" }}>

        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 20 }}>
          <div style={{ fontSize: 32 }}>📥</div>
          <div>
            <div style={{ fontSize: 18, fontWeight: 700, color: "var(--text-1)" }}>Sieg DFe Monitor</div>
            <div style={{ fontSize: 12, color: "var(--text-3)" }}>sieg.com.br</div>
          </div>
        </div>

        {/* Tabs */}
        <div style={{ display: "flex", gap: 0, marginBottom: 24, borderBottom: "0.5px solid #DDE2EE" }}>
          {([
            { id: "config", label: "Configuração" },
            { id: "cert",   label: "Registro no Sieg" },
          ] as const).map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              style={{ padding: "9px 20px", border: "none", background: "transparent",
                       borderBottom: tab === t.id ? "2px solid #1A4870" : "2px solid transparent",
                       color: tab === t.id ? "#1A4870" : "#666",
                       fontWeight: tab === t.id ? 700 : 400, fontSize: 13, cursor: "pointer" }}>
              {t.label}
            </button>
          ))}
        </div>

        {/* ── Aba Configuração ── */}
        {tab === "config" && (
          <>
            <p style={{ margin: "0 0 20px", fontSize: 13, color: "var(--text-2)", lineHeight: 1.6 }}>
              O Sieg monitora a distribuição DFe da SEFAZ e importa automaticamente as NF-e recebidas
              para cada CPF/CNPJ cadastrado abaixo.
            </p>

            {/* API Key */}
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-2)", textTransform: "uppercase",
                            letterSpacing: "0.05em", marginBottom: 6 }}>
                API Key Sieg
                <span style={{ fontWeight: 400, color: "var(--text-3)", textTransform: "none", marginLeft: 6 }}>
                  (obtenha em sieg.com.br → Minha conta → API)
                </span>
              </div>
              <input
                type="password"
                placeholder="Cole aqui a API Key da sua conta Sieg"
                value={cfg.api_key ?? ""}
                onChange={e => setCfg(prev => ({ ...prev, api_key: e.target.value }))}
                style={{ width: "100%", padding: "9px 12px", border: "0.5px solid #DDE2EE", borderRadius: 8,
                         fontSize: 13, boxSizing: "border-box", fontFamily: "monospace" }}
              />
              {/* Diagnóstico de qual chave está ativa */}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between",
                            marginTop: 6 }}>
                <div style={{ fontSize: 11, color: temChaveFazenda ? "#EF9F27" : "#16A34A" }}>
                  {temChaveFazenda
                    ? "⚠ Chave desta fazenda será usada (sobrepõe a chave global da Vercel)"
                    : "✓ Será usada a chave global configurada pela Raccolto na Vercel"}
                </div>
                {temChaveFazenda && (
                  <button
                    onClick={() => setCfg(prev => ({ ...prev, api_key: "" }))}
                    style={{ fontSize: 11, color: "#E24B4A", background: "none", border: "none",
                             cursor: "pointer", textDecoration: "underline", padding: 0 }}>
                    Limpar (usar global)
                  </button>
                )}
              </div>
            </div>

            {/* CPFs/CNPJs */}
            <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-2)", textTransform: "uppercase",
                          letterSpacing: "0.05em", marginBottom: 8 }}>
              CPF / CNPJ monitorados <span style={{ color: "#E24B4A" }}>*</span>
            </div>

            {cfg.cnpjs_destino.length > 0 && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
                {cfg.cnpjs_destino.map(doc => (
                  <div key={doc} style={{ display: "flex", alignItems: "center", gap: 6,
                                          padding: "5px 10px 5px 12px", background: "#EFF6FF",
                                          border: "0.5px solid #378ADD", borderRadius: 20, fontSize: 13 }}>
                    <span style={{ fontFamily: "monospace", color: "#1A4870", fontWeight: 600 }}>
                      {formatarDoc(doc)}
                    </span>
                    <span style={{ fontSize: 11, color: "var(--text-3)" }}>{doc.length === 11 ? "CPF" : "CNPJ"}</span>
                    <button onClick={() => removerDoc(doc)}
                      style={{ background: "none", border: "none", cursor: "pointer", color: "#E24B4A",
                               fontSize: 14, lineHeight: 1, padding: "0 2px", marginLeft: 2 }}>×</button>
                  </div>
                ))}
              </div>
            )}

            {/* Produtores cadastrados — sugestões rápidas */}
            {produtoresSugeridos.length > 0 && (
              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 11, color: "var(--text-3)", marginBottom: 6 }}>
                  Produtores cadastrados — clique para incluir:
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {produtoresSugeridos.map(p => {
                    const jaAdicionado = cfg.cnpjs_destino.includes(p.cpf_cnpj);
                    return (
                      <button
                        key={p.cpf_cnpj}
                        onClick={() => {
                          if (!jaAdicionado) {
                            setCfg(prev => ({ ...prev, cnpjs_destino: [...prev.cnpjs_destino, p.cpf_cnpj] }));
                          }
                        }}
                        style={{
                          padding: "5px 12px", borderRadius: 20, fontSize: 12, fontWeight: 600,
                          cursor: jaAdicionado ? "default" : "pointer",
                          border: `0.5px solid ${jaAdicionado ? "#86EFAC" : "var(--border)"}`,
                          background: jaAdicionado ? "#F0FFF4" : "var(--bg-page)",
                          color: jaAdicionado ? "#16A34A" : "#1A4870",
                        }}
                        title={jaAdicionado ? "Já monitorado" : `Adicionar ${p.cpf_cnpj}`}
                      >
                        {jaAdicionado ? "✓ " : ""}{p.nome}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            <div style={{ display: "flex", gap: 8 }}>
              <input
                value={novoDoc}
                onChange={e => setNovoDoc(e.target.value.replace(/\D/g, ""))}
                onKeyDown={e => e.key === "Enter" && adicionarDoc()}
                maxLength={14}
                placeholder="CPF (11 dígitos) ou CNPJ (14 dígitos)"
                style={{ flex: 1, padding: "8px 12px", borderRadius: 6, border: "0.5px solid #DDE2EE",
                         fontSize: 13, outline: "none", fontFamily: "monospace" }}
              />
              <button onClick={adicionarDoc} disabled={novoDoc.length < 11}
                style={{ padding: "8px 18px",
                         background: novoDoc.length >= 11 ? "#1A4870" : "var(--bg-page)",
                         color: novoDoc.length >= 11 ? "#fff" : "var(--text-3)",
                         border: "0.5px solid #DDE2EE", borderRadius: 6, fontSize: 13,
                         fontWeight: 600, cursor: novoDoc.length >= 11 ? "pointer" : "not-allowed" }}>
                + Adicionar
              </button>
            </div>
            <div style={{ fontSize: 11, color: "var(--text-3)", marginTop: 6 }}>
              Pressione Enter ou clique Adicionar. Pode cadastrar quantos CPFs/CNPJs precisar.
            </div>

            {/* Última sync */}
            {cfg.ultima_sync_data && (
              <div style={{ marginTop: 20, padding: "12px 16px", background: "#F0FFF4",
                            border: "0.5px solid #86EFAC", borderRadius: 8 }}>
                <div style={{ fontSize: 12, color: "#16A34A", fontWeight: 600 }}>
                  Última sincronização: {fmtData(cfg.ultima_sync_data)}
                </div>
                <div style={{ fontSize: 12, color: "var(--text-2)", marginTop: 2 }}>
                  Total importado: {cfg.total_importado ?? "0"} NF-e
                </div>
              </div>
            )}

            {/* Resultado sync */}
            {result && (
              <div style={{ marginTop: 16, padding: "14px 18px", borderRadius: 8,
                            background: result.sucesso ? "#F0FFF4" : "#FFF5F5",
                            border: `0.5px solid ${result.sucesso ? "#86EFAC" : "#FCA5A5"}` }}>
                {result.sucesso ? (
                  <div style={{ fontSize: 13, color: "#16A34A" }}>
                    <strong>Sincronização concluída.</strong><br />
                    XMLs recebidos: {result.total_xmls} &nbsp;·&nbsp;
                    Importados: <strong>{result.importados_nfe}</strong> &nbsp;·&nbsp;
                    Duplicados ignorados: {result.duplicados_nfe}
                    {result.erros && result.erros.length > 0 && (
                      <div style={{ marginTop: 8, color: "#EF9F27", fontSize: 12 }}>
                        Avisos: {result.erros.join("; ")}
                      </div>
                    )}
                  </div>
                ) : (
                  <div style={{ fontSize: 13, color: "#E24B4A" }}>
                    <strong>Erro:</strong> {result.erro}
                  </div>
                )}
              </div>
            )}

            {/* Ações */}
            <div style={{ display: "flex", gap: 10, marginTop: 28, justifyContent: "space-between",
                          alignItems: "center" }}>
              <button onClick={sincronizar} disabled={syncing || cfg.cnpjs_destino.length === 0}
                style={{ padding: "9px 22px",
                         background: syncing || cfg.cnpjs_destino.length === 0 ? "var(--border)" : "#16A34A",
                         color: "#fff", border: "none", borderRadius: 8, fontSize: 13, fontWeight: 600,
                         cursor: syncing || cfg.cnpjs_destino.length === 0 ? "not-allowed" : "pointer" }}>
                {syncing ? "Sincronizando…" : "⟳ Sincronizar Agora"}
              </button>
              <div style={{ display: "flex", gap: 10 }}>
                <button onClick={onClose}
                  style={{ padding: "9px 20px", background: "var(--bg-card)", border: "0.5px solid #DDE2EE",
                           borderRadius: 8, fontSize: 13, cursor: "pointer" }}>
                  Cancelar
                </button>
                <button onClick={salvar} disabled={saving}
                  style={{ padding: "9px 24px", background: "#1A4870", color: "#fff",
                           border: "none", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
                  {saving ? "Salvando…" : "Salvar"}
                </button>
              </div>
            </div>

            <div style={{ marginTop: 20, padding: "10px 14px", background: "var(--bg-page)",
                          border: "0.5px solid #DDE2EE", borderRadius: 8, fontSize: 11, color: "#666" }}>
              💡 A sincronização automática diária já está configurada via Cron Job na Vercel.
              Use o botão acima para sincronizar manualmente a qualquer momento.
            </div>
          </>
        )}

        {/* ── Aba Registro no Sieg ── */}
        {tab === "cert" && (
          <>
            <div style={{ padding: "14px 18px", background: "#F0F4FF", border: "0.5px solid #7C8FD9",
                          borderRadius: 8, fontSize: 13, color: "#3B5BDB", marginBottom: 24, lineHeight: 1.6 }}>
              <strong>Por que registrar?</strong><br />
              O Sieg precisa saber quais CNPJs/CPFs monitorar na distribuição da SEFAZ.
              Sem o registro, a API retorna erro 401 mesmo com a chave correta.
              Registre cada documento que deseja monitorar.
            </div>

            {/* Opção: CNPJ específico ou todos */}
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-2)", textTransform: "uppercase",
                            letterSpacing: "0.05em", marginBottom: 8 }}>
                CNPJ / CPF a registrar
              </div>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <input
                  value={certCnpj}
                  onChange={e => setCertCnpj(e.target.value.replace(/\D/g, ""))}
                  maxLength={14}
                  placeholder="Deixe em branco para registrar todos da lista"
                  style={{ flex: 1, padding: "9px 12px", border: "0.5px solid #DDE2EE", borderRadius: 8,
                           fontSize: 13, fontFamily: "monospace", boxSizing: "border-box" }}
                />
              </div>
              <div style={{ fontSize: 11, color: "var(--text-3)", marginTop: 5 }}>
                CNPJs cadastrados: {cfg.cnpjs_destino.length === 0 ? "nenhum" : cfg.cnpjs_destino.map(d => formatarDoc(d)).join(", ")}
              </div>
            </div>

            {/* Flags */}
            <div style={{ display: "flex", gap: 24, marginBottom: 24 }}>
              <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 13 }}>
                <input type="checkbox" checked={certNfe} onChange={e => setCertNfe(e.target.checked)}
                  style={{ width: 16, height: 16 }} />
                Monitorar NF-e (Modelo 55)
              </label>
              <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 13 }}>
                <input type="checkbox" checked={certCte} onChange={e => setCertCte(e.target.checked)}
                  style={{ width: 16, height: 16 }} />
                Monitorar CT-e
              </label>
            </div>

            {/* Resultados */}
            {certResults.length > 0 && (
              <div style={{ marginBottom: 20, display: "flex", flexDirection: "column", gap: 8 }}>
                {certResults.map((r, i) => (
                  <div key={i} style={{ padding: "12px 16px", borderRadius: 8,
                                        background: r.sucesso ? "#F0FFF4" : "#FFF5F5",
                                        border: `0.5px solid ${r.sucesso ? "#86EFAC" : "#FCA5A5"}` }}>
                    <div style={{ fontSize: 12, fontWeight: 700,
                                  color: r.sucesso ? "#16A34A" : "#E24B4A" }}>
                      {r.cnpj ? formatarDoc(r.cnpj) : "—"} — {r.sucesso ? "Registrado com sucesso" : "Erro"}
                    </div>
                    {r.key_info && (
                      <div style={{ fontSize: 11, color: r.sucesso ? "var(--text-2)" : "#b45309",
                                    marginTop: 3, fontFamily: "monospace" }}>
                        Chave: {r.key_info}
                      </div>
                    )}
                    {r.sucesso && (
                      <div style={{ fontSize: 11, color: "var(--text-2)", marginTop: 3 }}>
                        Resposta: {typeof r.resposta === "string" ? r.resposta : JSON.stringify(r.resposta)}
                      </div>
                    )}
                    {!r.sucesso && (
                      <div style={{ fontSize: 11, color: "#E24B4A", marginTop: 3 }}>{r.erro}</div>
                    )}
                  </div>
                ))}
              </div>
            )}

            <button onClick={registrarTodos} disabled={certSaving}
              style={{ width: "100%", padding: "11px 0",
                       background: certSaving ? "var(--border)" : "#1A4870",
                       color: "#fff", border: "none", borderRadius: 8, fontSize: 14,
                       fontWeight: 700, cursor: certSaving ? "not-allowed" : "pointer" }}>
              {certSaving
                ? "Registrando…"
                : certCnpj
                  ? `Registrar ${formatarDoc(certCnpj)} no Sieg`
                  : `Registrar ${cfg.cnpjs_destino.length} CNPJ(s) no Sieg`}
            </button>

            <div style={{ marginTop: 16, padding: "10px 14px", background: "var(--bg-page)",
                          border: "0.5px solid #DDE2EE", borderRadius: 8, fontSize: 11, color: "#666",
                          lineHeight: 1.6 }}>
              💡 Se os CNPJs já foram registrados anteriormente no portal Sieg, este botão apenas
              confirma o registro (não causa duplicatas). Pode executar quantas vezes precisar.
            </div>

            {/* Diagnóstico */}
            <div style={{ marginTop: 20, borderTop: "0.5px solid #DDE2EE", paddingTop: 20 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between",
                            marginBottom: 10 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-2)" }}>Diagnóstico da chave</div>
                <button onClick={testarDiagnostico} disabled={diagLoading}
                  style={{ padding: "6px 14px", background: diagLoading ? "var(--bg-page)" : "var(--bg-card)",
                           border: "0.5px solid #DDE2EE", borderRadius: 6, fontSize: 12,
                           cursor: diagLoading ? "not-allowed" : "pointer", color: "#1A4870", fontWeight: 600 }}>
                  {diagLoading ? "Testando…" : "Testar chave agora"}
                </button>
              </div>
              {diagResult && (() => {
                const ok      = Boolean(diagResult.sieg_ok);
                const status  = String(diagResult.sieg_status ?? "—");
                const kd      = diagResult.keyDiag as Record<string, unknown> | undefined;
                const resp    = typeof diagResult.sieg_resposta === "string"
                  ? diagResult.sieg_resposta
                  : JSON.stringify(diagResult.sieg_resposta);
                const errNet  = diagResult.erro_rede ? String(diagResult.erro_rede) : null;
                return (
                  <div style={{ padding: "14px 16px", background: ok ? "#F0FFF4" : "#FFF5F5",
                                border: `0.5px solid ${ok ? "#86EFAC" : "#FCA5A5"}`,
                                borderRadius: 8, fontSize: 12 }}>
                    {kd && (
                      <div style={{ fontFamily: "monospace", color: "var(--text-2)", marginBottom: 10,
                                    lineHeight: 1.8 }}>
                        <span style={{ fontWeight: 700 }}>Fonte:</span> {String(kd.fonte)}<br />
                        <span style={{ fontWeight: 700 }}>Comprimento:</span> {String(kd.comprimento)} chars<br />
                        <span style={{ fontWeight: 700 }}>Início:</span> {String(kd.inicio)} &nbsp;
                        <span style={{ fontWeight: 700 }}>Fim:</span> {String(kd.fim)}<br />
                        {Boolean(kd.foi_decoded) && (
                          <span style={{ color: "#EF9F27" }}>⚠ Chave tinha URL-encoding — corrigida automaticamente</span>
                        )}
                      </div>
                    )}
                    <div style={{ fontWeight: 700, color: ok ? "#16A34A" : "#E24B4A", marginBottom: 4 }}>
                      HTTP {status} — {ok ? "Autenticado ✓" : "Falha na autenticação ✗"}
                    </div>
                    <div style={{ fontFamily: "monospace", color: "var(--text-2)", wordBreak: "break-all" }}>
                      {resp as string}
                    </div>
                    {errNet && <div style={{ color: "#E24B4A", marginTop: 6 }}>{errNet}</div>}
                  </div>
                );
              })()}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ─── Modal genérico (catálogo DB) ────────────────────────────────────────────
function ModalConfigurar({
  integracao, fazendaConfig, onSave, onClose,
}: {
  integracao: IntegracaoCatalogo;
  fazendaConfig: IntegracaoFazenda | null;
  onSave: (config: Record<string, unknown>, ativo: boolean) => Promise<void>;
  onClose: () => void;
}) {
  const [config,  setConfig]  = useState<Record<string, unknown>>(fazendaConfig?.config ?? integracao.config_padrao);
  const [ativo,   setAtivo]   = useState(fazendaConfig?.ativo ?? false);
  const [saving,  setSaving]  = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);
  const [qrBase64, setQrBase64]   = useState<string | null>(null);
  const [qrStatus, setQrStatus]   = useState<string | null>(null);
  const [qrLoading, setQrLoading] = useState(false);

  function setField(k: string, v: unknown) { setConfig(prev => ({ ...prev, [k]: v })); }

  async function reconectarWhatsApp() {
    setQrLoading(true);
    setQrBase64(null);
    setQrStatus(null);
    try {
      const r = await fetch("/api/whatsapp/reconectar", { method: "POST" });
      const json = await r.json() as Record<string, unknown>;
      if (json.base64) {
        setQrBase64(json.base64 as string);
        setQrStatus("Escaneie o QR code no WhatsApp → Aparelhos Conectados → Conectar um aparelho. Expira em ~60s.");
      } else if (json.error) {
        setQrStatus("Erro: " + String(json.error));
      } else {
        setQrStatus("Resposta inesperada: " + JSON.stringify(json).slice(0, 120));
      }
    } catch (e) {
      setQrStatus("Falha ao chamar API: " + String(e));
    }
    setQrLoading(false);
  }

  async function testarBalanca() {
    setTesting(true);
    setTestResult(null);
    try {
      // @ts-ignore — Web Serial API
      const port = await navigator.serial.requestPort();
      await port.open({
        baudRate: Number(config.baudRate ?? 9600),
        dataBits: Number(config.dataBits ?? 8),
        stopBits: Number(config.stopBits ?? 1),
        parity:   String(config.parity ?? "none") as "none" | "even" | "odd",
      });
      const reader = port.readable.getReader();
      let raw = "";
      const timeout = new Promise<void>(r => setTimeout(r, 3000));
      const read = (async () => {
        const decoder = new TextDecoder();
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          raw += decoder.decode(value);
          if (raw.length > 200) break;
        }
      })();
      await Promise.race([read, timeout]);
      reader.cancel();
      await port.close();
      const regex = new RegExp(String(config.responseRegex ?? "([\\d.]+)"));
      const match = regex.exec(raw);
      setTestResult(match
        ? `Peso lido: ${match[1]} ${config.weightUnit ?? "kg"}`
        : `Dados: "${raw.slice(0,80)}" — regex não encontrou peso.`
      );
    } catch (e: unknown) {
      setTestResult("Erro: " + String((e as Error).message ?? e));
    }
    setTesting(false);
  }

  const isBalanca = integracao.categoria === "balanca";
  const isEvo     = integracao.nome.includes("Evolution");
  const isResend  = integracao.nome.includes("Resend");

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex:2000,
                  display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ background: "var(--bg-card)", borderRadius: 12, padding: 32, width: 640,
                    maxHeight: "85vh", overflowY: "auto", boxShadow: "0 20px 60px rgba(0,0,0,0.2)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24 }}>
          <span style={{ fontSize: 28 }}>{integracao.icone}</span>
          <div>
            <div style={{ fontSize: 17, fontWeight: 700, color: "var(--text-1)" }}>{integracao.nome}</div>
            {integracao.fabricante && <div style={{ fontSize: 12, color: "var(--text-3)" }}>{integracao.fabricante}</div>}
          </div>
          <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 13, color: "var(--text-2)" }}>Ativo</span>
            <div onClick={() => setAtivo(v => !v)}
              style={{ width: 44, height: 24, borderRadius: 12, background: ativo ? "#1A4870" : "var(--border)",
                       cursor: "pointer", position: "relative", transition: "background .2s" }}>
              <div style={{ width: 18, height: 18, borderRadius: 9, background: "var(--bg-card)", position: "absolute",
                            top: 3, left: ativo ? 23 : 3, transition: "left .2s", boxShadow: "0 1px 3px rgba(0,0,0,0.3)" }} />
            </div>
          </div>
        </div>
        <p style={{ margin: "0 0 20px", fontSize: 13, color: "var(--text-2)", lineHeight: 1.5 }}>{integracao.descricao}</p>

        {isBalanca && (
          <>
            <div style={{ fontSize: 12, color: "var(--text-3)", background: "#FBF3E0", border: "0.5px solid #C9921B",
                          borderRadius: 8, padding: "10px 14px", marginBottom: 16 }}>
              Protocolo pré-configurado pela Raccolto. Requer cabo RS-232 ou adaptador USB-Serial.
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              {[
                { key: "baudRate", label: "Baud Rate",  type: "select", opts: [1200,2400,4800,9600,19200,38400] },
                { key: "dataBits", label: "Data Bits",  type: "select", opts: [7, 8] },
                { key: "stopBits", label: "Stop Bits",  type: "select", opts: [1, 2] },
                { key: "parity",   label: "Paridade",   type: "select", opts: ["none","even","odd"] },
                { key: "weightUnit",label:"Unidade",    type: "select", opts: ["kg","t"] },
              ].map(f => (
                <div key={f.key}>
                  <div style={{ fontSize: 11, color: "var(--text-3)", fontWeight: 600, marginBottom: 4,
                                textTransform: "uppercase" }}>{f.label}</div>
                  <select value={String(config[f.key] ?? "")} disabled
                    style={{ width: "100%", padding: "6px 10px", borderRadius: 6,
                             border: "0.5px solid #DDE2EE", fontSize: 13, background: "var(--bg-page)", color: "var(--text-2)" }}>
                    {f.opts.map(o => <option key={o}>{o}</option>)}
                  </select>
                </div>
              ))}
            </div>
            <button onClick={testarBalanca} disabled={testing}
              style={{ marginTop: 16, padding: "9px 20px", background: "var(--bg-page)", border: "0.5px solid #DDE2EE",
                       borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer", color: "#1A4870" }}>
              {testing ? "Aguardando leitura..." : "Testar Balança (Web Serial)"}
            </button>
            {testResult && (
              <div style={{ marginTop: 10, padding: "10px 14px",
                            background: testResult.startsWith("Peso") ? "#F0FFF4" : "#FFF5F5",
                            border: `0.5px solid ${testResult.startsWith("Peso") ? "#16A34A" : "#E24B4A"}`,
                            borderRadius: 8, fontSize: 13, color: testResult.startsWith("Peso") ? "#16A34A" : "#E24B4A" }}>
                {testResult}
              </div>
            )}
          </>
        )}

        {isEvo && (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {[
              { key: "server_url", label: "URL do Servidor", placeholder: "http://108.174.147.118:8080" },
              { key: "instance",   label: "Instância",       placeholder: "arato" },
              { key: "api_key",    label: "API Key",         placeholder: "d606738..." },
            ].map(f => (
              <div key={f.key}>
                <div style={{ fontSize: 11, color: "var(--text-3)", fontWeight: 600, marginBottom: 4,
                              textTransform: "uppercase" }}>{f.label}</div>
                <input placeholder={f.placeholder} value={String(config[f.key] ?? "")}
                  onChange={e => setField(f.key, e.target.value)}
                  style={{ width: "100%", padding: "8px 12px", borderRadius: 6,
                           border: "0.5px solid #DDE2EE", fontSize: 13, boxSizing: "border-box" }} />
              </div>
            ))}

            {/* Reconectar WhatsApp */}
            <div style={{ borderTop: "0.5px solid #DDE2EE", paddingTop: 16, marginTop: 4 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: "#1A4870", marginBottom: 10 }}>
                Conexão WhatsApp
              </div>
              <button onClick={reconectarWhatsApp} disabled={qrLoading}
                style={{ padding: "9px 20px", background: qrLoading ? "var(--border)" : "#25D366",
                         color: "#fff", border: "none", borderRadius: 8,
                         fontSize: 13, fontWeight: 600, cursor: qrLoading ? "default" : "pointer" }}>
                {qrLoading ? "Gerando QR Code…" : "Gerar QR Code para Conectar"}
              </button>

              {qrStatus && (
                <div style={{ marginTop: 10, fontSize: 12, padding: "8px 12px", borderRadius: 8,
                              background: qrStatus.startsWith("Erro") || qrStatus.startsWith("Falha") ? "#FEE2E2" : "#F0FFF4",
                              color: qrStatus.startsWith("Erro") || qrStatus.startsWith("Falha") ? "#991B1B" : "#166534",
                              border: `0.5px solid ${qrStatus.startsWith("Erro") || qrStatus.startsWith("Falha") ? "#FECACA" : "#BBF7D0"}` }}>
                  {qrStatus}
                </div>
              )}

              {qrBase64 && (
                <div style={{ marginTop: 14, textAlign: "center" }}>
                  <img src={qrBase64} alt="QR Code WhatsApp"
                    style={{ width: 240, height: 240, border: "4px solid #25D366", borderRadius: 12, display: "block", margin: "0 auto" }} />
                  <div style={{ fontSize: 11, color: "var(--text-3)", marginTop: 8 }}>
                    Se expirar, clique em "Gerar QR Code" novamente
                  </div>
                  <button onClick={reconectarWhatsApp} disabled={qrLoading}
                    style={{ marginTop: 8, padding: "6px 14px", background: "var(--bg-page)",
                             border: "0.5px solid #DDE2EE", borderRadius: 6,
                             fontSize: 12, cursor: "pointer", color: "#1A4870" }}>
                    Renovar QR Code
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {isResend && (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {[
              { key: "api_key",      label: "Resend API Key",   placeholder: "re_..." },
              { key: "from_address", label: "E-mail remetente", placeholder: "noreply@fazenda.com.br" },
            ].map(f => (
              <div key={f.key}>
                <div style={{ fontSize: 11, color: "var(--text-3)", fontWeight: 600, marginBottom: 4,
                              textTransform: "uppercase" }}>{f.label}</div>
                <input placeholder={f.placeholder} value={String(config[f.key] ?? "")}
                  onChange={e => setField(f.key, e.target.value)}
                  style={{ width: "100%", padding: "8px 12px", borderRadius: 6,
                           border: "0.5px solid #DDE2EE", fontSize: 13, boxSizing: "border-box" }} />
              </div>
            ))}
          </div>
        )}

        {!isBalanca && !isEvo && !isResend && (
          <div style={{ fontSize: 13, color: "var(--text-2)", background: "var(--bg-page)", borderRadius: 8, padding: 16 }}>
            Esta integração não requer configuração adicional.
          </div>
        )}

        <div style={{ display: "flex", gap: 12, marginTop: 28, justifyContent: "flex-end" }}>
          <button onClick={onClose}
            style={{ padding: "9px 20px", background: "var(--bg-card)", border: "0.5px solid #DDE2EE",
                     borderRadius: 8, fontSize: 13, cursor: "pointer" }}>
            Cancelar
          </button>
          <button onClick={async () => { setSaving(true); await onSave(config, ativo); setSaving(false); onClose(); }}
            disabled={saving}
            style={{ padding: "9px 24px", background: "#1A4870", color: "#fff",
                     border: "none", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
            {saving ? "Salvando..." : "Salvar"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Página principal ────────────────────────────────────────────────────────
export default function IntegracoesPage() {
  const { fazendaId, contaId } = useAuth();
  const router = useRouter();
  const [abaCat,  setAbaCat]  = useState<Categoria>("fiscal");
  const [catalogo, setCatalogo] = useState<IntegracaoCatalogo[]>([]);
  const [configs,  setConfigs]  = useState<IntegracaoFazenda[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [modal,    setModal]    = useState<IntegracaoCatalogo | null>(null);

  // Sieg — config vinda do configuracoes_modulo
  const [siegCfg,   setSiegCfg]   = useState<SiegCfg>({ cnpjs_destino: [] });
  const [siegAtivo, setSiegAtivo] = useState(false);
  const [modalSieg, setModalSieg] = useState(false);

  async function carregar() {
    setLoading(true);
    const [{ data: cat }, { data: cfg }, { data: siegRow }] = await Promise.all([
      supabase.from("integracoes_catalogo").select("*").eq("ativo", true).order("ordem"),
      supabase.from("integracoes_fazenda").select("*").eq("fazenda_id", fazendaId ?? ""),
      supabase.from("configuracoes_modulo").select("config")
        .eq("fazenda_id", fazendaId ?? "").eq("modulo", "sieg").maybeSingle(),
    ]);
    setCatalogo((cat ?? []) as IntegracaoCatalogo[]);
    setConfigs((cfg ?? []) as IntegracaoFazenda[]);
    if (siegRow?.config) {
      const c = normalizarSiegCfg(siegRow.config as Record<string, unknown>);
      setSiegCfg(c);
      setSiegAtivo(c.cnpjs_destino.length > 0);
    }
    setLoading(false);
  }

  useEffect(() => { if (fazendaId) carregar(); }, [fazendaId]);

  function configDe(id: string) { return configs.find(c => c.integracao_id === id) ?? null; }

  async function salvarCatalog(integracaoId: string, config: Record<string, unknown>, ativo: boolean) {
    const ex = configDe(integracaoId);
    if (ex) {
      await supabase.from("integracoes_fazenda")
        .update({ config, ativo, testado_em: ativo ? new Date().toISOString() : null })
        .eq("id", ex.id);
    } else {
      await supabase.from("integracoes_fazenda")
        .insert({ fazenda_id: fazendaId, integracao_id: integracaoId, config, ativo });
    }
    await carregar();
  }

  const itensCatalogo = catalogo.filter(c => c.categoria === abaCat);
  const totalAtivos   = configs.filter(c => c.ativo).length + (siegAtivo ? 1 : 0);
  const fmtData = (d?: string) => d ? new Date(d + "T12:00:00").toLocaleDateString("pt-BR") : null;

  return (
    <>
      <TopNav />
      <div style={{ padding: "24px 32px", maxWidth: 1100, margin: "0 auto" }}>

        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: "var(--text-1)" }}>Integrações</h1>
            <p style={{ margin: "4px 0 0", fontSize: 13, color: "var(--text-3)" }}>
              {totalAtivos > 0 ? `${totalAtivos} integração${totalAtivos > 1 ? "ões" : ""} ativa${totalAtivos > 1 ? "s" : ""}` : "Nenhuma integração ativa"}
            </p>
          </div>
        </div>

        {/* Tabs */}
        <div style={{ display: "flex", gap: 8, marginBottom: 24, borderBottom: "0.5px solid #DDE2EE" }}>
          {CATEGORIAS.map(cat => {
            const ativosNoCat = cat.id === "fiscal"
              ? (siegAtivo ? 1 : 0)
              : configs.filter(c => catalogo.find(i => i.id === c.integracao_id)?.categoria === cat.id && c.ativo).length;
            return (
              <button key={cat.id} onClick={() => setAbaCat(cat.id)}
                style={{ padding: "10px 20px", border: "none", borderRadius: "8px 8px 0 0",
                         background: abaCat === cat.id ? "#fff" : "transparent",
                         borderBottom: abaCat === cat.id ? "2px solid #1A4870" : "2px solid transparent",
                         color: abaCat === cat.id ? "#1A4870" : "#666",
                         fontWeight: abaCat === cat.id ? 700 : 400,
                         fontSize: 13, cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}>
                <span>{cat.icone}</span>
                {cat.label}
                {ativosNoCat > 0 && (
                  <span style={{ background: "#1A4870", color: "#fff", borderRadius: 10,
                                 padding: "1px 7px", fontSize: 11, fontWeight: 700 }}>
                    {ativosNoCat}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {loading ? (
          <div style={{ textAlign: "center", padding: 60, color: "var(--text-3)", fontSize: 14 }}>Carregando...</div>
        ) : (
          <>
            {/* ── Aba Fiscal ── */}
            {abaCat === "fiscal" && (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 16 }}>

                {/* Card Sieg */}
                <div style={{ background: "var(--bg-card)", borderRadius: 12,
                              border: `0.5px solid ${siegAtivo ? "#1A4870" : "var(--border)"}`,
                              padding: 20, display: "flex", flexDirection: "column", gap: 12,
                              boxShadow: siegAtivo ? "0 0 0 1px rgba(26,72,112,0.08)" : "none" }}>
                  <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
                    <div style={{ fontSize: 28, lineHeight: 1 }}>📥</div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text-1)" }}>Sieg DFe Monitor</div>
                      <div style={{ fontSize: 11, color: "var(--text-3)" }}>sieg.com.br</div>
                    </div>
                    <div style={{ padding: "3px 10px", borderRadius: 20, fontSize: 11, fontWeight: 700,
                                  background: siegAtivo ? "#D5E8F5" : "var(--bg-page)",
                                  color: siegAtivo ? "#1A4870" : "var(--text-3)" }}>
                      {siegAtivo ? "Ativo" : "Inativo"}
                    </div>
                  </div>

                  <p style={{ margin: 0, fontSize: 12, color: "#666", lineHeight: 1.5 }}>
                    Recebe automaticamente todas as NF-e emitidas para o CNPJ do produtor via distribuição SEFAZ.
                    Elimina o cadastro manual de NF de entrada de insumos.
                  </p>

                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    <span style={{ padding: "2px 8px", background: "#F0F4FF", color: "#3B5BDB",
                                   border: "0.5px solid #7C8FD9", borderRadius: 20, fontSize: 11 }}>
                      Requer API Key
                    </span>
                    <span style={{ padding: "2px 8px", background: "#EFF6FF", color: "#1A4870",
                                   border: "0.5px solid #378ADD", borderRadius: 20, fontSize: 11 }}>
                      NF-e Modelo 55
                    </span>
                    {fmtData(siegCfg.ultima_sync_data) && (
                      <span style={{ padding: "2px 8px", background: "var(--bg-page)", color: "var(--text-2)",
                                     borderRadius: 20, fontSize: 11 }}>
                        Sync: {fmtData(siegCfg.ultima_sync_data)}
                      </span>
                    )}
                  </div>

                  <button onClick={() => setModalSieg(true)}
                    style={{ marginTop: "auto", padding: "9px 0",
                             background: siegAtivo ? "#1A4870" : "var(--bg-page)",
                             color: siegAtivo ? "#fff" : "#1A4870",
                             border: `0.5px solid ${siegAtivo ? "#1A4870" : "var(--border)"}`,
                             borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer", width: "100%" }}>
                    {siegAtivo ? "Gerenciar" : "Configurar"}
                  </button>
                </div>

                {/* OFX */}
                <div style={{ background: "var(--bg-card)", borderRadius: 12, border: "0.5px solid #DDE2EE", padding: 20, display: "flex", flexDirection: "column", gap: 10, minHeight: 160 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <div style={{ width: 40, height: 40, borderRadius: 10, background: "#EAF3FB", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20 }}>🏦</div>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 14, color: "var(--text-1)" }}>Importação OFX</div>
                      <div style={{ fontSize: 11, color: "var(--text-3)" }}>Conciliação bancária automática</div>
                    </div>
                    <span style={{ marginLeft: "auto", background: "#DCFCE7", color: "#166534", padding: "2px 8px", borderRadius: 10, fontSize: 10, fontWeight: 700 }}>ATIVO</span>
                  </div>
                  <div style={{ fontSize: 12, color: "var(--text-2)", flex: 1, lineHeight: 1.6 }}>
                    Importe extratos OFX de qualquer banco brasileiro. O sistema concilia automaticamente com CP/CR cadastrados.
                  </div>
                  <button onClick={() => router.push("/financeiro/conciliacao")}
                    style={{ padding: "8px 0", background: "#1A4870", color: "#fff", border: "none", borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: "pointer", width: "100%" }}>
                    Acessar Conciliação
                  </button>
                </div>

                {/* GNRE */}
                <div style={{ background: "var(--bg-card)", borderRadius: 12, border: "0.5px solid #DDE2EE", padding: 20, display: "flex", flexDirection: "column", gap: 10, minHeight: 160 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <div style={{ width: 40, height: 40, borderRadius: 10, background: "#FEF3C7", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20 }}>📋</div>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 14, color: "var(--text-1)" }}>GNRE</div>
                      <div style={{ fontSize: 11, color: "var(--text-3)" }}>Guias Nacionais de Recolhimento</div>
                    </div>
                    <span style={{ marginLeft: "auto", background: "#DCFCE7", color: "#166534", padding: "2px 8px", borderRadius: 10, fontSize: 10, fontWeight: 700 }}>ATIVO</span>
                  </div>
                  <div style={{ fontSize: 12, color: "var(--text-2)", flex: 1, lineHeight: 1.6 }}>
                    Emita e controle GNREs para DIFAL (EC 87/2015), substituição tributária e antecipação de ICMS nas operações interestaduais.
                  </div>
                  <button onClick={() => router.push("/fiscal/gnre")}
                    style={{ padding: "8px 0", background: "#1A4870", color: "#fff", border: "none", borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: "pointer", width: "100%" }}>
                    Acessar GNRE
                  </button>
                </div>

                {/* eSocial Rural */}
                <div style={{ background: "var(--bg-card)", borderRadius: 12, border: "0.5px solid #DDE2EE", padding: 20, display: "flex", flexDirection: "column", gap: 10, minHeight: 160 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <div style={{ width: 40, height: 40, borderRadius: 10, background: "#EDE9FE", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20 }}>👷</div>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 14, color: "var(--text-1)" }}>eSocial Rural</div>
                      <div style={{ fontSize: 11, color: "var(--text-3)" }}>Trabalhadores e eventos rurais</div>
                    </div>
                    <span style={{ marginLeft: "auto", background: "#DCFCE7", color: "#166534", padding: "2px 8px", borderRadius: 10, fontSize: 10, fontWeight: 700 }}>ATIVO</span>
                  </div>
                  <div style={{ fontSize: 12, color: "var(--text-2)", flex: 1, lineHeight: 1.6 }}>
                    Gerencie CLT e avulsos rurais (TSVE), gere eventos eSocial (S-2200, S-2300, S-1200) e calcule a folha com FUNRURAL e SENAR.
                  </div>
                  <button onClick={() => router.push("/fiscal/esocial")}
                    style={{ padding: "8px 0", background: "#1A4870", color: "#fff", border: "none", borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: "pointer", width: "100%" }}>
                    Acessar eSocial
                  </button>
                </div>
              </div>
            )}

            {/* ── Abas do catálogo DB ── */}
            {abaCat !== "fiscal" && (
              itensCatalogo.length === 0 ? (
                <div style={{ textAlign: "center", padding: 60 }}>
                  <div style={{ fontSize: 40, marginBottom: 12 }}>🔌</div>
                  <div style={{ fontSize: 15, fontWeight: 600, color: "var(--text-2)" }}>Nenhuma integração disponível</div>
                  <div style={{ fontSize: 13, color: "var(--text-3)", marginTop: 4 }}>Serão adicionadas pela equipe Raccolto.</div>
                </div>
              ) : (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 16 }}>
                  {itensCatalogo.map(intg => {
                    const cfg = configDe(intg.id);
                    const ativo = cfg?.ativo ?? false;
                    const testadoEm = cfg?.testado_em ? new Date(cfg.testado_em).toLocaleDateString("pt-BR") : null;
                    return (
                      <div key={intg.id} style={{ background: "var(--bg-card)", borderRadius: 12,
                                                   border: `0.5px solid ${ativo ? "#1A4870" : "var(--border)"}`,
                                                   padding: 20, display: "flex", flexDirection: "column", gap: 12,
                                                   boxShadow: ativo ? "0 0 0 1px rgba(26,72,112,0.08)" : "none" }}>
                        <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
                          <div style={{ fontSize: 28, lineHeight: 1 }}>{intg.icone}</div>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text-1)" }}>{intg.nome}</div>
                            {intg.fabricante && <div style={{ fontSize: 11, color: "var(--text-3)" }}>{intg.fabricante}</div>}
                          </div>
                          <div style={{ padding: "3px 10px", borderRadius: 20, fontSize: 11, fontWeight: 700,
                                        background: ativo ? "#D5E8F5" : "var(--bg-page)",
                                        color: ativo ? "#1A4870" : "var(--text-3)" }}>
                            {ativo ? "Ativo" : "Inativo"}
                          </div>
                        </div>
                        <p style={{ margin: 0, fontSize: 12, color: "#666", lineHeight: 1.5 }}>{intg.descricao}</p>
                        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                          {intg.requer_hardware && (
                            <span style={{ padding: "2px 8px", background: "#FBF3E0", color: "#7A5A12",
                                           border: "0.5px solid #C9921B", borderRadius: 20, fontSize: 11 }}>
                              Requer hardware
                            </span>
                          )}
                          {intg.requer_api_key && (
                            <span style={{ padding: "2px 8px", background: "#F0F4FF", color: "#3B5BDB",
                                           border: "0.5px solid #7C8FD9", borderRadius: 20, fontSize: 11 }}>
                              Requer API Key
                            </span>
                          )}
                          {testadoEm && (
                            <span style={{ padding: "2px 8px", background: "var(--bg-page)", color: "var(--text-2)",
                                           borderRadius: 20, fontSize: 11 }}>
                              Testado em {testadoEm}
                            </span>
                          )}
                        </div>
                        <button onClick={() => setModal(intg)}
                          style={{ marginTop: "auto", padding: "9px 0",
                                   background: ativo ? "#1A4870" : "var(--bg-page)",
                                   color: ativo ? "#fff" : "#1A4870",
                                   border: `0.5px solid ${ativo ? "#1A4870" : "var(--border)"}`,
                                   borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer", width: "100%" }}>
                          {ativo ? "Gerenciar" : "Configurar"}
                        </button>
                      </div>
                    );
                  })}
                </div>
              )
            )}

            {abaCat === "balanca" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 20, marginTop: 4 }}>

                {/* Card Toledo PRIX */}
                <div style={{ background: "var(--bg-card)", borderRadius: 12, border: "0.5px solid #1A4870", padding: 20, maxWidth: 560 }}>
                  <div style={{ display: "flex", alignItems: "flex-start", gap: 14, marginBottom: 14 }}>
                    <div style={{ fontSize: 32, lineHeight: 1 }}>⚖️</div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text-1)" }}>Toledo PRIX</div>
                      <div style={{ fontSize: 11, color: "var(--text-3)", marginTop: 2 }}>Toledo do Brasil · Balança de pesagem de caminhões</div>
                      <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
                        <span style={{ padding: "2px 8px", background: "#FBF3E0", color: "#7A5A12", border: "0.5px solid #C9921B", borderRadius: 20, fontSize: 11 }}>Requer hardware</span>
                        <span style={{ padding: "2px 8px", background: "#DCFCE7", color: "#166534", border: "0.5px solid #16A34A40", borderRadius: 20, fontSize: 11 }}>Integrado</span>
                      </div>
                    </div>
                  </div>

                  <div style={{ fontSize: 12, color: "var(--text-2)", lineHeight: 1.6, marginBottom: 14 }}>
                    Leitura automática do peso via porta serial USB. Ao abrir um romaneio,
                    clique em <strong>"Conectar"</strong> e os campos de Peso Bruto e Tara
                    serão preenchidos diretamente da balança com um clique.
                  </div>

                  {/* Parâmetros técnicos */}
                  <div style={{ background: "var(--bg-page)", borderRadius: 8, padding: "10px 14px", marginBottom: 16, display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px 20px" }}>
                    {[
                      ["Protocolo",    "RS-232 via USB"],
                      ["Baud rate",    "9600"],
                      ["Paridade",     "None"],
                      ["Data bits",    "8"],
                      ["Stop bits",    "1"],
                      ["Conector",     "RJ45 proprietário Toledo → DB9 → USB-Serial"],
                    ].map(([k, v]) => (
                      <div key={k} style={{ display: "flex", gap: 6, fontSize: 11 }}>
                        <span style={{ color: "var(--text-3)", whiteSpace: "nowrap" }}>{k}:</span>
                        <span style={{ color: "var(--text-1)", fontWeight: 600 }}>{v}</span>
                      </div>
                    ))}
                  </div>

                  {/* Teste de conexão ao vivo */}
                  <div style={{ borderTop: "0.5px solid #EEF1F6", paddingTop: 14 }}>
                    <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-2)", marginBottom: 8 }}>Testar conexão</div>
                    <BalancaSerial
                      onCapturarBruto={kg => alert(`✓ Peso Bruto capturado: ${kg.toLocaleString("pt-BR")} kg`)}
                      onCapturarTara={kg  => alert(`✓ Tara capturada: ${kg.toLocaleString("pt-BR")} kg`)}
                    />
                    <div style={{ fontSize: 10, color: "var(--text-3)", marginTop: 4 }}>
                      Use este painel para confirmar que a balança está enviando dados corretamente antes de usar no romaneio.
                    </div>
                  </div>
                </div>

                {/* Dica de hardware */}
                <div style={{ padding: "12px 16px", background: "#F0F4FF", border: "0.5px solid #7C8FD9", borderRadius: 8, fontSize: 12, color: "#3B5BDB", maxWidth: 560 }}>
                  <strong>Cabo necessário:</strong> Toledo RJ45 proprietário → DB9 fêmea + adaptador USB-Serial (Prolific PL2303 ou FTDI).
                  Disponível em lojas de automação ou diretamente com a Toledo do Brasil.
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Modal Sieg */}
      {modalSieg && fazendaId && (
        <ModalSieg
          fazendaId={fazendaId}
          contaId={contaId ?? null}
          cfgInicial={siegCfg}
          onClose={() => setModalSieg(false)}
          onSaved={cfg => { setSiegCfg(cfg); setSiegAtivo(cfg.cnpjs_destino.length > 0); }}
        />
      )}

      {/* Modal catálogo */}
      {modal && (
        <ModalConfigurar
          integracao={modal}
          fazendaConfig={configDe(modal.id)}
          onSave={(c, a) => salvarCatalog(modal.id, c, a)}
          onClose={() => setModal(null)}
        />
      )}
    </>
  );
}
