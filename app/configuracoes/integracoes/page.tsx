"use client";
import { useState, useEffect } from "react";
import { supabase } from "../../../lib/supabase";
import { useAuth } from "../../../components/AuthProvider";
import TopNav from "../../../components/TopNav";

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
  cnpj_destino:     string;
  ultima_sync_data?: string;
  ultima_sync_ts?:   string;
  total_importado?:  string;
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

// ─── Modal Sieg ───────────────────────────────────────────────────────────────
function ModalSieg({
  fazendaId,
  cfgInicial,
  onClose,
  onSaved,
}: {
  fazendaId: string;
  cfgInicial: SiegCfg;
  onClose: () => void;
  onSaved: (cfg: SiegCfg) => void;
}) {
  const [cfg,     setCfg]     = useState<SiegCfg>(cfgInicial);
  const [saving,  setSaving]  = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [result,  setResult]  = useState<SiegSyncResult | null>(null);

  function set(k: keyof SiegCfg, v: string) {
    setCfg(prev => ({ ...prev, [k]: v }));
  }

  async function salvar() {
    setSaving(true);
    await supabase.from("configuracoes_modulo").upsert({
      fazenda_id: fazendaId,
      modulo:     "sieg",
      config:     cfg,
    });
    setSaving(false);
    onSaved(cfg);
    onClose();
  }

  async function sincronizar() {
    if (!cfg.cnpj_destino) { alert("Informe o CNPJ/CPF antes de sincronizar."); return; }
    setSyncing(true);
    setResult(null);
    // Salva o CNPJ antes de sincronizar
    await supabase.from("configuracoes_modulo").upsert({ fazenda_id: fazendaId, modulo: "sieg", config: cfg });
    try {
      const res = await fetch("/api/integracoes/sieg-sync", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ fazenda_id: fazendaId }),
      });
      const data = await res.json() as SiegSyncResult;
      setResult(data);
      if (data.sucesso) {
        setCfg(prev => ({
          ...prev,
          ultima_sync_data: new Date().toISOString().slice(0, 10),
          total_importado:  String((parseInt(prev.total_importado || "0") + (data.importados_nfe ?? 0))),
        }));
      }
    } catch (e) {
      setResult({ erro: String(e) });
    }
    setSyncing(false);
  }

  const fmtData = (d?: string) => d ? new Date(d + "T12:00:00").toLocaleDateString("pt-BR") : "—";

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 1000,
                  display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ background: "#fff", borderRadius: 12, padding: 32, width: 680,
                    maxHeight: "90vh", overflowY: "auto", boxShadow: "0 20px 60px rgba(0,0,0,0.2)" }}>

        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 24 }}>
          <div style={{ fontSize: 32 }}>📥</div>
          <div>
            <div style={{ fontSize: 18, fontWeight: 700, color: "#1a1a1a" }}>Sieg DFe Monitor</div>
            <div style={{ fontSize: 12, color: "#888" }}>sieg.com.br</div>
          </div>
        </div>

        <p style={{ margin: "0 0 20px", fontSize: 13, color: "#555", lineHeight: 1.6 }}>
          O Sieg monitora a distribuição DFe da SEFAZ e disponibiliza via API todas as NF-e emitidas
          para o CNPJ do produtor. A sincronização importa automaticamente as NF de Entrada pendentes.
        </p>

        {/* Info banner — API Key gerenciada pela Raccolto */}
        <div style={{ background: "#F0FFF4", border: "0.5px solid #86EFAC", borderRadius: 8,
                      padding: "10px 14px", marginBottom: 20, fontSize: 12, color: "#15803D", lineHeight: 1.6 }}>
          <strong>API Key gerenciada pela Raccolto.</strong> Você não precisa contratar o Sieg — ele já está
          ativo na plataforma. Informe apenas o CNPJ ou CPF desta fazenda para filtrar os documentos corretos.
        </div>

        {/* Campo CNPJ */}
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#555", textTransform: "uppercase",
                        letterSpacing: "0.05em", marginBottom: 4 }}>
            CNPJ / CPF da fazenda <span style={{ color: "#E24B4A" }}>*</span>
          </div>
          {inp(cfg.cnpj_destino, v => set("cnpj_destino", v.replace(/\D/g, "")), "00000000000000 — somente números")}
          <div style={{ fontSize: 11, color: "#888", marginTop: 4 }}>
            O Sieg filtrará somente as NF-e emitidas para este CNPJ/CPF.
            Se o campo estiver vazio, o sistema tentará usar o CNPJ configurado no módulo Fiscal.
          </div>
        </div>

        {/* Status última sync */}
        {cfg.ultima_sync_data && (
          <div style={{ marginTop: 20, padding: "12px 16px", background: "#F0FFF4",
                        border: "0.5px solid #86EFAC", borderRadius: 8 }}>
            <div style={{ fontSize: 12, color: "#16A34A", fontWeight: 600 }}>
              Última sincronização: {fmtData(cfg.ultima_sync_data)}
            </div>
            <div style={{ fontSize: 12, color: "#555", marginTop: 2 }}>
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
        <div style={{ display: "flex", gap: 10, marginTop: 28, justifyContent: "space-between", alignItems: "center" }}>
          <button
            onClick={sincronizar}
            disabled={syncing || !cfg.cnpj_destino}
            style={{ padding: "9px 22px", background: syncing ? "#DDE2EE" : "#16A34A",
                     color: "#fff", border: "none", borderRadius: 8, fontSize: 13,
                     fontWeight: 600, cursor: syncing ? "not-allowed" : "pointer" }}
          >
            {syncing ? "Sincronizando…" : "⟳ Sincronizar Agora"}
          </button>

          <div style={{ display: "flex", gap: 10 }}>
            <button onClick={onClose}
              style={{ padding: "9px 20px", background: "#fff", border: "0.5px solid #DDE2EE",
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

        {/* Dica de cron */}
        <div style={{ marginTop: 20, padding: "10px 14px", background: "#F4F6FA",
                      border: "0.5px solid #DDE2EE", borderRadius: 8, fontSize: 11, color: "#666" }}>
          💡 A sincronização automática diária já está configurada via Cron Job na Vercel.
          Use o botão acima para sincronizar manualmente a qualquer momento.
        </div>
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

  function setField(k: string, v: unknown) { setConfig(prev => ({ ...prev, [k]: v })); }

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
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 1000,
                  display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ background: "#fff", borderRadius: 12, padding: 32, width: 640,
                    maxHeight: "85vh", overflowY: "auto", boxShadow: "0 20px 60px rgba(0,0,0,0.2)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24 }}>
          <span style={{ fontSize: 28 }}>{integracao.icone}</span>
          <div>
            <div style={{ fontSize: 17, fontWeight: 700, color: "#1a1a1a" }}>{integracao.nome}</div>
            {integracao.fabricante && <div style={{ fontSize: 12, color: "#888" }}>{integracao.fabricante}</div>}
          </div>
          <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 13, color: "#555" }}>Ativo</span>
            <div onClick={() => setAtivo(v => !v)}
              style={{ width: 44, height: 24, borderRadius: 12, background: ativo ? "#1A4870" : "#DDE2EE",
                       cursor: "pointer", position: "relative", transition: "background .2s" }}>
              <div style={{ width: 18, height: 18, borderRadius: 9, background: "#fff", position: "absolute",
                            top: 3, left: ativo ? 23 : 3, transition: "left .2s", boxShadow: "0 1px 3px rgba(0,0,0,0.3)" }} />
            </div>
          </div>
        </div>
        <p style={{ margin: "0 0 20px", fontSize: 13, color: "#555", lineHeight: 1.5 }}>{integracao.descricao}</p>

        {isBalanca && (
          <>
            <div style={{ fontSize: 12, color: "#888", background: "#FBF3E0", border: "0.5px solid #C9921B",
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
                  <div style={{ fontSize: 11, color: "#888", fontWeight: 600, marginBottom: 4,
                                textTransform: "uppercase" }}>{f.label}</div>
                  <select value={String(config[f.key] ?? "")} disabled
                    style={{ width: "100%", padding: "6px 10px", borderRadius: 6,
                             border: "0.5px solid #DDE2EE", fontSize: 13, background: "#F4F6FA", color: "#555" }}>
                    {f.opts.map(o => <option key={o}>{o}</option>)}
                  </select>
                </div>
              ))}
            </div>
            <button onClick={testarBalanca} disabled={testing}
              style={{ marginTop: 16, padding: "9px 20px", background: "#F4F6FA", border: "0.5px solid #DDE2EE",
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
                <div style={{ fontSize: 11, color: "#888", fontWeight: 600, marginBottom: 4,
                              textTransform: "uppercase" }}>{f.label}</div>
                <input placeholder={f.placeholder} value={String(config[f.key] ?? "")}
                  onChange={e => setField(f.key, e.target.value)}
                  style={{ width: "100%", padding: "8px 12px", borderRadius: 6,
                           border: "0.5px solid #DDE2EE", fontSize: 13, boxSizing: "border-box" }} />
              </div>
            ))}
          </div>
        )}

        {isResend && (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {[
              { key: "api_key",      label: "Resend API Key",   placeholder: "re_..." },
              { key: "from_address", label: "E-mail remetente", placeholder: "noreply@fazenda.com.br" },
            ].map(f => (
              <div key={f.key}>
                <div style={{ fontSize: 11, color: "#888", fontWeight: 600, marginBottom: 4,
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
          <div style={{ fontSize: 13, color: "#555", background: "#F4F6FA", borderRadius: 8, padding: 16 }}>
            Esta integração não requer configuração adicional.
          </div>
        )}

        <div style={{ display: "flex", gap: 12, marginTop: 28, justifyContent: "flex-end" }}>
          <button onClick={onClose}
            style={{ padding: "9px 20px", background: "#fff", border: "0.5px solid #DDE2EE",
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
  const { fazendaId } = useAuth();
  const [abaCat,  setAbaCat]  = useState<Categoria>("fiscal");
  const [catalogo, setCatalogo] = useState<IntegracaoCatalogo[]>([]);
  const [configs,  setConfigs]  = useState<IntegracaoFazenda[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [modal,    setModal]    = useState<IntegracaoCatalogo | null>(null);

  // Sieg — config vinda do configuracoes_modulo
  const [siegCfg,   setSiegCfg]   = useState<SiegCfg>({ cnpj_destino: "" });
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
      const c = siegRow.config as SiegCfg;
      setSiegCfg(c);
      setSiegAtivo(!!(c.cnpj_destino));
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
            <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: "#1a1a1a" }}>Integrações</h1>
            <p style={{ margin: "4px 0 0", fontSize: 13, color: "#888" }}>
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
          <div style={{ textAlign: "center", padding: 60, color: "#888", fontSize: 14 }}>Carregando...</div>
        ) : (
          <>
            {/* ── Aba Fiscal ── */}
            {abaCat === "fiscal" && (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 16 }}>

                {/* Card Sieg */}
                <div style={{ background: "#fff", borderRadius: 12,
                              border: `0.5px solid ${siegAtivo ? "#1A4870" : "#DDE2EE"}`,
                              padding: 20, display: "flex", flexDirection: "column", gap: 12,
                              boxShadow: siegAtivo ? "0 0 0 1px rgba(26,72,112,0.08)" : "none" }}>
                  <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
                    <div style={{ fontSize: 28, lineHeight: 1 }}>📥</div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 14, fontWeight: 700, color: "#1a1a1a" }}>Sieg DFe Monitor</div>
                      <div style={{ fontSize: 11, color: "#888" }}>sieg.com.br</div>
                    </div>
                    <div style={{ padding: "3px 10px", borderRadius: 20, fontSize: 11, fontWeight: 700,
                                  background: siegAtivo ? "#D5E8F5" : "#F4F6FA",
                                  color: siegAtivo ? "#1A4870" : "#888" }}>
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
                      <span style={{ padding: "2px 8px", background: "#F4F6FA", color: "#555",
                                     borderRadius: 20, fontSize: 11 }}>
                        Sync: {fmtData(siegCfg.ultima_sync_data)}
                      </span>
                    )}
                  </div>

                  <button onClick={() => setModalSieg(true)}
                    style={{ marginTop: "auto", padding: "9px 0",
                             background: siegAtivo ? "#1A4870" : "#F4F6FA",
                             color: siegAtivo ? "#fff" : "#1A4870",
                             border: `0.5px solid ${siegAtivo ? "#1A4870" : "#DDE2EE"}`,
                             borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer", width: "100%" }}>
                    {siegAtivo ? "Gerenciar" : "Configurar"}
                  </button>
                </div>

                {/* Placeholder futuras integrações fiscais */}
                <div style={{ background: "#F8FAFF", borderRadius: 12, border: "0.5px dashed #B0C8E8",
                              padding: 20, display: "flex", flexDirection: "column", gap: 8,
                              alignItems: "center", justifyContent: "center", minHeight: 160, color: "#888" }}>
                  <div style={{ fontSize: 28 }}>🔜</div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "#555" }}>Mais em breve</div>
                  <div style={{ fontSize: 12, textAlign: "center" }}>
                    Importação OFX, GNRE, eSocial Rural…
                  </div>
                </div>
              </div>
            )}

            {/* ── Abas do catálogo DB ── */}
            {abaCat !== "fiscal" && (
              itensCatalogo.length === 0 ? (
                <div style={{ textAlign: "center", padding: 60 }}>
                  <div style={{ fontSize: 40, marginBottom: 12 }}>🔌</div>
                  <div style={{ fontSize: 15, fontWeight: 600, color: "#555" }}>Nenhuma integração disponível</div>
                  <div style={{ fontSize: 13, color: "#888", marginTop: 4 }}>Serão adicionadas pela equipe Raccolto.</div>
                </div>
              ) : (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 16 }}>
                  {itensCatalogo.map(intg => {
                    const cfg = configDe(intg.id);
                    const ativo = cfg?.ativo ?? false;
                    const testadoEm = cfg?.testado_em ? new Date(cfg.testado_em).toLocaleDateString("pt-BR") : null;
                    return (
                      <div key={intg.id} style={{ background: "#fff", borderRadius: 12,
                                                   border: `0.5px solid ${ativo ? "#1A4870" : "#DDE2EE"}`,
                                                   padding: 20, display: "flex", flexDirection: "column", gap: 12,
                                                   boxShadow: ativo ? "0 0 0 1px rgba(26,72,112,0.08)" : "none" }}>
                        <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
                          <div style={{ fontSize: 28, lineHeight: 1 }}>{intg.icone}</div>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontSize: 14, fontWeight: 700, color: "#1a1a1a" }}>{intg.nome}</div>
                            {intg.fabricante && <div style={{ fontSize: 11, color: "#888" }}>{intg.fabricante}</div>}
                          </div>
                          <div style={{ padding: "3px 10px", borderRadius: 20, fontSize: 11, fontWeight: 700,
                                        background: ativo ? "#D5E8F5" : "#F4F6FA",
                                        color: ativo ? "#1A4870" : "#888" }}>
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
                            <span style={{ padding: "2px 8px", background: "#F4F6FA", color: "#555",
                                           borderRadius: 20, fontSize: 11 }}>
                              Testado em {testadoEm}
                            </span>
                          )}
                        </div>
                        <button onClick={() => setModal(intg)}
                          style={{ marginTop: "auto", padding: "9px 0",
                                   background: ativo ? "#1A4870" : "#F4F6FA",
                                   color: ativo ? "#fff" : "#1A4870",
                                   border: `0.5px solid ${ativo ? "#1A4870" : "#DDE2EE"}`,
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
              <div style={{ marginTop: 20, padding: "14px 18px", background: "#F0F4FF",
                            border: "0.5px solid #7C8FD9", borderRadius: 8, fontSize: 13, color: "#3B5BDB" }}>
                A leitura de balança usa a <strong>Web Serial API</strong>, disponível no Google Chrome 89+.
                O PC precisa estar fisicamente conectado à balança via cabo serial/USB.
              </div>
            )}
          </>
        )}
      </div>

      {/* Modal Sieg */}
      {modalSieg && fazendaId && (
        <ModalSieg
          fazendaId={fazendaId}
          cfgInicial={siegCfg}
          onClose={() => setModalSieg(false)}
          onSaved={cfg => { setSiegCfg(cfg); setSiegAtivo(!!(cfg.cnpj_destino)); }}
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
