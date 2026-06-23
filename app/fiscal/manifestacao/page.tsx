"use client";
import { useState, useEffect, useCallback } from "react";
import TopNav from "../../../components/TopNav";
import { useAuth } from "../../../components/AuthProvider";
import { supabase } from "../../../lib/supabase";

type NfRow = {
  id:                string;
  numero:            string;
  serie:             string;
  chave_acesso:      string;
  data_emissao:      string;
  emitente_nome:     string;
  emitente_cnpj:     string;
  valor_total:       number;
  natureza:          string;
  status:            string;
  origem:            string | null;
  manifestacao_tipo: number | null;
  manifestacao_data: string | null;
  manifestacao_msg:  string | null;
};

type FiltroAba = "pendentes" | "todas" | "ciencia" | "confirmada" | "desconhecimento" | "nao_realizada";

const MAN_CFG = [
  { tipo: 0, label: "Ciência",       cor: "#378ADD", bg: "#EFF6FF", status: "ciencia",        desc: "Ciente da existência da NF" },
  { tipo: 1, label: "Confirmar",     cor: "#16A34A", bg: "#DCFCE7", status: "confirmada",      desc: "Confirmação da operação" },
  { tipo: 2, label: "Desconhecer",   cor: "#C9921B", bg: "#FBF3E0", status: "desconhecimento", desc: "Desconheço esta operação", justObrig: true },
  { tipo: 3, label: "Não Realizada", cor: "#E24B4A", bg: "#FFF0F0", status: "nao_realizada",   desc: "Operação não foi realizada", justObrig: true },
];

const ST_CFG: Record<string, { label: string; cor: string; bg: string }> = {
  pendente:        { label: "Pendente",        cor: "#888",    bg: "#F3F4F6" },
  ciencia:         { label: "Ciência",         cor: "#378ADD", bg: "#EFF6FF" },
  confirmada:      { label: "Confirmada",      cor: "#16A34A", bg: "#DCFCE7" },
  desconhecimento: { label: "Desconhecimento", cor: "#C9921B", bg: "#FBF3E0" },
  nao_realizada:   { label: "Não Realizada",   cor: "#E24B4A", bg: "#FFF0F0" },
};

const fmtR$   = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fmtData = (s?: string | null) => { if (!s) return "—"; const [y,m,d]=s.split("-"); return `${d}/${m}/${y}`; };
const fmtDoc  = (s: string) => s.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5");

export default function ManifestacaoPage() {
  const { fazendaId } = useAuth();
  const [nfs,          setNfs]          = useState<NfRow[]>([]);
  const [loading,      setLoading]      = useState(false);
  const [syncing,      setSyncing]      = useState(false);
  const [syncMsg,      setSyncMsg]      = useState("");
  const [filtroAba,    setFiltroAba]    = useState<FiltroAba>("pendentes");
  const [busca,        setBusca]        = useState("");
  const [cnpjDest,          setCnpjDest]          = useState("");
  const [cnpjsDisponiveis,  setCnpjsDisponiveis]  = useState<string[]>([]);
  const [busy,         setBusy]         = useState<Record<string, boolean>>({});
  const [erros,        setErros]        = useState<Record<string, string>>({});
  const [justModal,    setJustModal]    = useState<{ nf: NfRow; tipo: number } | null>(null);
  const [justText,     setJustText]     = useState("");

  const carregar = useCallback(async (cnpjFiltro?: string) => {
    if (!fazendaId) return;
    setLoading(true);
    let query = supabase
      .from("nf_entradas")
      .select("id,numero,serie,chave_acesso,data_emissao,emitente_nome,emitente_cnpj,valor_total,natureza,status,origem,manifestacao_tipo,manifestacao_data,manifestacao_msg")
      .eq("fazenda_id", fazendaId)
      .order("data_emissao", { ascending: false })
      .limit(500);
    // Filtra por destinatário quando especificado explicitamente
    if (cnpjFiltro) query = query.eq("cnpj_destino", cnpjFiltro);
    const { data } = await query;
    setNfs((data ?? []) as NfRow[]);

    // CNPJs do destinatário — lidos do módulo SIEG (cnpjs_destino = array)
    // ou módulo fiscal (cpf_cnpj_emitente = string)
    const { data: cfgs } = await supabase
      .from("configuracoes_modulo")
      .select("config, modulo")
      .eq("fazenda_id", fazendaId)
      .in("modulo", ["sieg", "fiscal", "fiscal_nfe"])
      .limit(5);
    const todosDocumentos: string[] = [];
    for (const row of (cfgs ?? [])) {
      const c = (row.config ?? {}) as Record<string, unknown>;
      // Array (SIEG)
      if (Array.isArray(c.cnpjs_destino)) {
        for (const d of c.cnpjs_destino as string[]) {
          const num = d.replace(/\D/g, "");
          if (num && !todosDocumentos.includes(num)) todosDocumentos.push(num);
        }
      }
      // String simples
      const single = String(c.cnpj_destino ?? c.cpf_cnpj_emitente ?? c.cnpj ?? "").replace(/\D/g, "");
      if (single && !todosDocumentos.includes(single)) todosDocumentos.push(single);
    }
    setCnpjsDisponiveis(todosDocumentos);
    // Define o CPF inicial sem sobrescrever a seleção atual do usuário
    if (todosDocumentos.length > 0 && !cnpjDest) setCnpjDest(todosDocumentos[0]);
    setLoading(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fazendaId]);

  useEffect(() => { carregar(); }, [carregar]);

  // Quando o CPF selecionado muda, recarrega as NFs e sincroniza o SIEG para esse CPF
  async function trocarCnpj(novo: string) {
    setCnpjDest(novo);
    // Recarrega do banco com o novo filtro
    if (!fazendaId) return;
    setLoading(true);
    const { data } = await supabase
      .from("nf_entradas")
      .select("id,numero,serie,chave_acesso,data_emissao,emitente_nome,emitente_cnpj,valor_total,natureza,status,origem,manifestacao_tipo,manifestacao_data,manifestacao_msg")
      .eq("fazenda_id", fazendaId)
      .eq("cnpj_destino", novo)
      .order("data_emissao", { ascending: false })
      .limit(500);
    setNfs((data ?? []) as NfRow[]);
    setLoading(false);
    // Sincroniza SIEG para este CPF específico em background
    setSyncing(true); setSyncMsg("Sincronizando para este destinatário...");
    fetch("/api/integracoes/sieg-sync", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ fazenda_id: fazendaId }) })
      .then(r => r.json()).then(async (d: Record<string, unknown>) => {
        if (d.erro) { setSyncMsg(`✗ ${d.erro}`); }
        else {
          const imp = Number(d.importados_nfe ?? 0);
          setSyncMsg(`✓ ${imp} NF-e importada${imp !== 1 ? "s" : ""} para este destinatário`);
          // Recarrega novamente após sync
          const { data: d2 } = await supabase
            .from("nf_entradas")
            .select("id,numero,serie,chave_acesso,data_emissao,emitente_nome,emitente_cnpj,valor_total,natureza,status,origem,manifestacao_tipo,manifestacao_data,manifestacao_msg")
            .eq("fazenda_id", fazendaId).eq("cnpj_destino", novo)
            .order("data_emissao", { ascending: false }).limit(500);
          setNfs((d2 ?? []) as NfRow[]);
        }
      }).catch(e => setSyncMsg(`✗ ${e}`))
      .finally(() => setSyncing(false));
  }

  async function sincronizar() {
    if (!fazendaId) return;
    setSyncing(true); setSyncMsg("");
    try {
      const res  = await fetch("/api/integracoes/sieg-sync", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ fazenda_id: fazendaId }) });
      const data = await res.json() as Record<string, unknown>;
      if (data.erro) {
        setSyncMsg(`✗ ${data.erro}`);
      } else {
        const imp = Number(data.importados_nfe ?? 0);
        const dup = Number(data.duplicados_nfe ?? 0);
        setSyncMsg(`✓ ${imp} NF-e importada${imp !== 1 ? "s" : ""} · ${dup} duplicada${dup !== 1 ? "s" : ""}`);
      }
      // Recarrega do banco sempre — NFs anteriores já podem existir
      await carregar();
    } catch (e) { setSyncMsg(`✗ Erro de rede: ${e}`); }
    finally { setSyncing(false); }
  }

  async function executarManifestacao(nf: NfRow, tipo: number, justificativa?: string) {
    setBusy(p => ({ ...p, [nf.id]: true }));
    setErros(p => { const n = { ...p }; delete n[nf.id]; return n; });
    try {
      const res  = await fetch("/api/integracoes/sieg-manifestar", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fazenda_id: fazendaId, nf_id: nf.id, chave_acesso: nf.chave_acesso, cnpj_destinatario: cnpjDest, tipo, justificativa }),
      });
      const data = await res.json() as Record<string, unknown>;
      if (data.erro) setErros(p => ({ ...p, [nf.id]: String(data.erro) }));
      else setNfs(prev => prev.map(n => n.id === nf.id ? { ...n, status: String(data.status ?? ""), manifestacao_tipo: tipo, manifestacao_data: new Date().toISOString().slice(0, 10) } : n));
    } catch (e) { setErros(p => ({ ...p, [nf.id]: String(e) })); }
    finally { setBusy(p => ({ ...p, [nf.id]: false })); }
  }

  function manifestar(nf: NfRow, tipo: number) {
    if (!cnpjDest) { setErros(p => ({ ...p, [nf.id]: "CNPJ do destinatário não configurado em Parâmetros NF-e." })); return; }
    const m = MAN_CFG.find(x => x.tipo === tipo);
    if (m?.justObrig) { setJustModal({ nf, tipo }); setJustText(""); return; }
    executarManifestacao(nf, tipo);
  }

  const nfsFilt = nfs.filter(n => {
    if (filtroAba === "pendentes" && n.status !== "pendente") return false;
    if (filtroAba !== "todas" && filtroAba !== "pendentes" && n.status !== filtroAba) return false;
    if (busca) { const q = busca.toLowerCase(); if (!n.numero.includes(busca) && !n.emitente_nome.toLowerCase().includes(q) && !(n.chave_acesso ?? "").includes(busca)) return false; }
    return true;
  });

  const pendentes   = nfs.filter(n => n.status === "pendente").length;
  const manifestadas = nfs.filter(n => n.status !== "pendente").length;
  const valorPend   = nfs.filter(n => n.status === "pendente").reduce((s, n) => s + (n.valor_total ?? 0), 0);

  return (
    <>
      <TopNav />
      <div style={{ background: "#F4F6FA", minHeight: "100vh", padding: "24px 28px" }}>

        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: "#1a1a1a" }}>Manifestação do Destinatário</h1>
            <p style={{ margin: "4px 0 0", fontSize: 13, color: "#666" }}>Consulta e manifestação de NF-e, CT-e e NFS-e recebidas via SIEG</p>
          </div>
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            {cnpjsDisponiveis.length > 1 ? (
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ fontSize: 11, color: "#555" }}>Destinatário:</span>
                <select
                  value={cnpjDest}
                  onChange={e => trocarCnpj(e.target.value)}
                  style={{ padding: "4px 8px", border: "0.5px solid #DDE2EE", borderRadius: 6, fontSize: 12, outline: "none", background: "white", color: "#1a1a1a" }}
                >
                  {cnpjsDisponiveis.map(d => (
                    <option key={d} value={d}>{fmtDoc(d)}</option>
                  ))}
                </select>
              </div>
            ) : cnpjDest ? (
              <div style={{ fontSize: 11, color: "#555", background: "#D5E8F5", padding: "4px 10px", borderRadius: 6 }}>
                Destinatário: <strong>{fmtDoc(cnpjDest)}</strong>
              </div>
            ) : null}
            <button onClick={sincronizar} disabled={syncing}
              style={{ padding: "8px 18px", background: syncing ? "#DDE2EE" : "#1A4870", color: syncing ? "#888" : "white", border: "none", borderRadius: 8, fontWeight: 600, fontSize: 13, cursor: syncing ? "default" : "pointer" }}>
              {syncing ? "⏳ Sincronizando…" : "⟳ Sincronizar com SIEG"}
            </button>
          </div>
        </div>

        {syncMsg && (
          <div style={{ marginBottom: 16, padding: "10px 14px", borderRadius: 8, background: syncMsg.startsWith("✗") ? "#FFF0F0" : "#DCFCE7", border: `0.5px solid ${syncMsg.startsWith("✗") ? "#E24B4A" : "#16A34A"}`, fontSize: 13, fontWeight: 600, color: syncMsg.startsWith("✗") ? "#E24B4A" : "#15803D" }}>
            {syncMsg}
          </div>
        )}

        {/* KPIs */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 20 }}>
          {[
            { label: "Total NFs",      v: nfs.length,  cor: "#1A4870", fmtR: false },
            { label: "Pendentes",      v: pendentes,   cor: "#C9921B", fmtR: false },
            { label: "Manifestadas",   v: manifestadas,cor: "#16A34A", fmtR: false },
            { label: "Valor Pendente", v: valorPend,   cor: "#E24B4A", fmtR: true  },
          ].map(({ label, v, cor, fmtR }) => (
            <div key={label} style={{ background: "white", borderRadius: 10, border: "0.5px solid #DDE2EE", padding: "14px 18px" }}>
              <div style={{ fontSize: 11, color: "#888", marginBottom: 4 }}>{label}</div>
              <div style={{ fontSize: 22, fontWeight: 700, color: cor }}>{fmtR ? fmtR$(v) : v.toLocaleString("pt-BR")}</div>
            </div>
          ))}
        </div>

        {/* Tabs + busca */}
        <div style={{ background: "white", borderRadius: "12px 12px 0 0", border: "0.5px solid #DDE2EE", display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0 14px" }}>
          <div style={{ display: "flex" }}>
            {([
              { id: "pendentes",       label: "Pendentes",       cnt: pendentes },
              { id: "todas",           label: "Todas",           cnt: nfs.length },
              { id: "ciencia",         label: "Ciência",         cnt: nfs.filter(n=>n.status==="ciencia").length },
              { id: "confirmada",      label: "Confirmadas",     cnt: nfs.filter(n=>n.status==="confirmada").length },
              { id: "desconhecimento", label: "Desconhecimento", cnt: nfs.filter(n=>n.status==="desconhecimento").length },
              { id: "nao_realizada",   label: "Não Realizada",   cnt: nfs.filter(n=>n.status==="nao_realizada").length },
            ] as { id: FiltroAba; label: string; cnt: number }[]).map(a => (
              <button key={a.id} onClick={() => setFiltroAba(a.id)} style={{ padding: "12px 14px", border: "none", background: "transparent", fontWeight: filtroAba===a.id?700:400, fontSize: 13, color: filtroAba===a.id?"#1a1a1a":"#888", borderBottom: `2px solid ${filtroAba===a.id?"#1A4870":"transparent"}`, cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}>
                {a.label}
                {a.cnt > 0 && <span style={{ fontSize: 10, background: filtroAba===a.id?"#D5E8F5":"#F0F0F0", color: filtroAba===a.id?"#1A4870":"#888", padding: "1px 6px", borderRadius: 8 }}>{a.cnt}</span>}
              </button>
            ))}
          </div>
          <input value={busca} onChange={e=>setBusca(e.target.value)} placeholder="🔍 NF, emitente, chave…"
            style={{ padding: "5px 10px", border: "0.5px solid #DDE2EE", borderRadius: 7, fontSize: 12, outline: "none", width: 220 }} />
        </div>

        {/* Tabela */}
        <div style={{ background: "white", border: "0.5px solid #DDE2EE", borderTop: "none", borderRadius: "0 0 12px 12px", overflow: "hidden" }}>
          {loading ? (
            <div style={{ padding: 40, textAlign: "center", color: "#888", fontSize: 13 }}>Carregando…</div>
          ) : nfsFilt.length === 0 ? (
            <div style={{ padding: 40, textAlign: "center", color: "#aaa", fontSize: 14 }}>
              {filtroAba === "pendentes" ? "Nenhuma NF pendente de manifestação." : "Nenhuma NF encontrada neste filtro."}
              <div style={{ marginTop: 12 }}>
                <button onClick={sincronizar} style={{ color: "#1A4870", background: "none", border: "none", cursor: "pointer", fontWeight: 600, fontSize: 13, textDecoration: "underline" }}>Sincronizar com SIEG agora</button>
              </div>
            </div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                <thead>
                  <tr style={{ background: "#F8FAFC", borderBottom: "0.5px solid #DDE2EE" }}>
                    {["NF / Série", "Emitente", "CNPJ Emit.", "Data Emissão", "Valor", "Status", "Ações"].map((h, i) => (
                      <th key={i} style={{ padding: "9px 12px", textAlign: i>=3?"center":"left", fontWeight: 600, color: "#555", fontSize: 11, whiteSpace: "nowrap" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {nfsFilt.map((nf, idx) => {
                    const st   = ST_CFG[nf.status] ?? ST_CFG.pendente;
                    const isBusy = busy[nf.id];
                    const erro  = erros[nf.id];
                    return (
                      <tr key={nf.id} style={{ borderBottom: "0.5px solid #EEF1F6", background: idx%2===0?"white":"#FAFBFD", verticalAlign: "top" }}>
                        <td style={{ padding: "9px 12px", fontWeight: 600, color: "#1a1a1a", whiteSpace: "nowrap" }}>
                          {nf.numero}
                          {nf.serie && <span style={{ color: "#888", fontWeight: 400 }}> /{nf.serie}</span>}
                          {nf.chave_acesso && <div style={{ fontSize: 9, color: "#bbb", fontFamily: "monospace", marginTop: 2 }}>{nf.chave_acesso.slice(0,22)}…</div>}
                        </td>
                        <td style={{ padding: "9px 12px", maxWidth: 200 }}>
                          <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{nf.emitente_nome || "—"}</div>
                        </td>
                        <td style={{ padding: "9px 12px", fontFamily: "monospace", fontSize: 11, color: "#555", whiteSpace: "nowrap" }}>
                          {nf.emitente_cnpj ? fmtDoc(nf.emitente_cnpj) : "—"}
                        </td>
                        <td style={{ padding: "9px 12px", textAlign: "center", whiteSpace: "nowrap" }}>{fmtData(nf.data_emissao)}</td>
                        <td style={{ padding: "9px 12px", textAlign: "center", fontWeight: 600, color: "#1A4870" }}>{fmtR$(nf.valor_total??0)}</td>
                        <td style={{ padding: "9px 12px", textAlign: "center" }}>
                          <span style={{ padding: "3px 8px", borderRadius: 10, fontSize: 10, fontWeight: 700, background: st.bg, color: st.cor }}>{isBusy?"⏳…":st.label}</span>
                          {nf.manifestacao_data && <div style={{ fontSize: 9, color: "#aaa", marginTop: 2 }}>{fmtData(nf.manifestacao_data)}</div>}
                          {erro && <div style={{ fontSize: 10, color: "#E24B4A", marginTop: 4, maxWidth: 180 }}>{erro}</div>}
                        </td>
                        <td style={{ padding: "9px 12px", textAlign: "center" }}>
                          {(nf.status === "pendente" || nf.status === "ciencia") && (
                            <div style={{ display: "flex", gap: 4, justifyContent: "center", flexWrap: "wrap" }}>
                              {MAN_CFG.filter(m => {
                                if (m.status === nf.status) return false; // já neste status
                                if (nf.status === "ciencia" && m.tipo === 0) return false; // ciência já feita
                                return true;
                              }).map(m => (
                                <button key={m.tipo} onClick={() => !isBusy && manifestar(nf, m.tipo)} disabled={isBusy} title={m.desc}
                                  style={{ padding: "3px 8px", borderRadius: 6, border: `0.5px solid ${m.cor}50`, background: m.bg, color: m.cor, fontWeight: 600, fontSize: 10, cursor: isBusy?"default":"pointer", opacity: isBusy?0.5:1, whiteSpace: "nowrap" }}>
                                  {m.label}
                                </button>
                              ))}
                            </div>
                          )}
                          {nf.status !== "pendente" && nf.status !== "ciencia" && <span style={{ fontSize: 10, color: "#aaa" }}>—</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <div style={{ padding: "10px 14px", borderTop: "0.5px solid #EEF1F6", fontSize: 11, color: "#888", display: "flex", justifyContent: "space-between" }}>
                <span>{nfsFilt.length} NF{nfsFilt.length!==1?"s":""} exibida{nfsFilt.length!==1?"s":""}</span>
                <span>Valor total: <strong style={{ color:"#1a1a1a" }}>{fmtR$(nfsFilt.reduce((s,n)=>s+(n.valor_total??0),0))}</strong></span>
              </div>
            </div>
          )}
        </div>

        {/* Legenda */}
        <div style={{ marginTop: 14, display: "flex", gap: 14, flexWrap: "wrap" }}>
          {MAN_CFG.map(m => (
            <div key={m.tipo} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, color: "#555" }}>
              <span style={{ width: 10, height: 10, borderRadius: 2, background: m.cor, display: "inline-block" }} />
              <strong style={{ color: m.cor }}>{m.label}</strong> — {m.desc}
              {m.justObrig && <span style={{ fontSize: 10, color: "#aaa" }}>(exige justificativa)</span>}
            </div>
          ))}
        </div>
      </div>

      {/* Modal justificativa */}
      {justModal && (() => {
        const m = MAN_CFG.find(x => x.tipo === justModal.tipo)!;
        return (
          <div style={{ position: "fixed", inset: 0, background: "rgba(11,45,80,0.32)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200 }}
            onClick={e => { if (e.target === e.currentTarget) setJustModal(null); }}>
            <div style={{ background: "white", borderRadius: 12, padding: 28, width: 480, maxWidth: "96vw" }}>
              <div style={{ fontWeight: 700, fontSize: 15, color: m.cor, marginBottom: 4 }}>{m.label}</div>
              <div style={{ fontSize: 12, color: "#666", marginBottom: 16 }}>NF {justModal.nf.numero} · {justModal.nf.emitente_nome}</div>
              <label style={{ fontSize: 11, fontWeight: 600, color: "#555", display: "block", marginBottom: 4 }}>Justificativa * (mín. 15 caracteres)</label>
              <textarea value={justText} onChange={e=>setJustText(e.target.value)} rows={3}
                placeholder="Informe o motivo…"
                style={{ width: "100%", padding: "8px 10px", border: "0.5px solid #DDE2EE", borderRadius: 8, fontSize: 13, outline: "none", resize: "vertical", boxSizing: "border-box", marginBottom: 6 }} />
              <div style={{ fontSize: 10, color: justText.length>=15?"#16A34A":"#aaa", marginBottom: 16 }}>{justText.length}/15 mínimos</div>
              <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
                <button onClick={()=>setJustModal(null)} style={{ padding: "8px 16px", border: "0.5px solid #DDE2EE", borderRadius: 8, background: "white", fontSize: 13, cursor: "pointer", color: "#555" }}>Cancelar</button>
                <button disabled={justText.length<15}
                  onClick={async()=>{ const {nf,tipo}=justModal; setJustModal(null); await executarManifestacao(nf,tipo,justText); }}
                  style={{ padding: "8px 20px", background: justText.length<15?"#DDE2EE":m.cor, color: "white", border: "none", borderRadius: 8, fontWeight: 700, fontSize: 13, cursor: justText.length<15?"default":"pointer" }}>
                  Confirmar {m.label}
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </>
  );
}
