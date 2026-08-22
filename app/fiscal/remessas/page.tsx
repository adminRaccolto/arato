"use client";
import { useState, useEffect } from "react";
import TopNav from "../../../components/TopNav";
import { listarNfRemessasLogisticas, atualizarNfRemessaLogistica, listarPessoasDaConta } from "../../../lib/db";
import type { NfRemessaLogistica, Pessoa } from "../../../lib/supabase";
import { useAuth } from "../../../components/AuthProvider";
import { supabase } from "../../../lib/supabase";

const fmtBRL   = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fmtData  = (s?: string) => s ? new Date(s + "T12:00:00").toLocaleDateString("pt-BR") : "—";
const inp: React.CSSProperties  = { width: "100%", padding: "8px 10px", border: "0.5px solid var(--border-table)", borderRadius: 8, fontSize: 13, color: "var(--text-1)", background: "var(--bg-input)", boxSizing: "border-box", outline: "none" };
const lbl: React.CSSProperties  = { fontSize: 11, color: "var(--text-2)", marginBottom: 4, display: "block" };
const btnV: React.CSSProperties = { padding: "8px 20px", background: "#1A4870", color: "#fff", border: "none", borderRadius: 8, fontWeight: 600, cursor: "pointer", fontSize: 13 };
const btnR: React.CSSProperties = { padding: "8px 18px", border: "0.5px solid var(--border-table)", borderRadius: 8, background: "transparent", cursor: "pointer", fontSize: 13, color: "var(--text-1)" };

const STATUS_BADGE: Record<string, { bg: string; cl: string; label: string }> = {
  emitida:   { bg: "#D5E8F5", cl: "#0B2D50", label: "Emitida" },
  retornada: { bg: "#E8F5E9", cl: "#1A6B3C", label: "Retornada" },
  cancelada: { bg: "#FDECEA", cl: "#B91C1C", label: "Cancelada" },
};

interface RetornoForm {
  natureza: string;
  obs: string;
}

export default function RemessasLogisticasPage() {
  const { contaId, fazendaId } = useAuth();

  const [remessas,   setRemessas]   = useState<NfRemessaLogistica[]>([]);
  const [pessoas,    setPessoas]    = useState<Pessoa[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [busca,      setBusca]      = useState("");
  const [filtroSt,   setFiltroSt]   = useState("");

  // Modal de retorno
  const [modalRetorno, setModalRetorno] = useState<NfRemessaLogistica | null>(null);
  const [retForm,      setRetForm]      = useState<RetornoForm>({ natureza: "Retorno de armazenagem de condomínio logístico", obs: "" });
  const [retEmitindo,  setRetEmitindo]  = useState(false);
  const [retErro,      setRetErro]      = useState("");
  const [retOk,        setRetOk]        = useState<{chave: string; numero: string} | null>(null);
  const [fiscalMods,   setFiscalMods]   = useState<Array<{modulo: string; config: Record<string,string>}>>([]);

  useEffect(() => {
    if (!contaId) return;
    (async () => {
      setLoading(true);
      const [r, p] = await Promise.all([
        listarNfRemessasLogisticas(contaId),
        listarPessoasDaConta(contaId),
      ]);
      setRemessas(r);
      setPessoas(p);
      setLoading(false);
    })();
  }, [contaId]);

  async function abrirRetorno(r: NfRemessaLogistica) {
    setModalRetorno(r);
    setRetForm({ natureza: "Retorno de armazenagem de condomínio logístico", obs: "" });
    setRetErro("");
    setRetOk(null);
    // Busca módulos fiscais da fazenda
    if (fazendaId) {
      const { data } = await supabase
        .from("configuracoes_modulo")
        .select("modulo, config")
        .eq("fazenda_id", fazendaId)
        .or("modulo.like.fiscal_pf_%,modulo.like.fiscal_emp_%");
      setFiscalMods((data ?? []) as Array<{modulo: string; config: Record<string,string>}>);
    }
  }

  async function emitirRetorno() {
    if (!modalRetorno || !fazendaId) return;
    setRetEmitindo(true);
    setRetErro("");
    try {
      // Itens da remessa original
      const itensOrig = (modalRetorno.itens_json as Array<{
        descricao_produto: string; ncm?: string; quantidade: number;
        valor_unitario: number; valor_total: number; unidade: string; unidade_nf?: string;
      }> | null) ?? [];
      if (!itensOrig.length) throw new Error("Nenhum item registrado na remessa original.");

      const itensNfe = itensOrig.map((it, i) => ({
        descricao:      it.descricao_produto,
        ncm:            it.ncm ?? "31052000",
        cfop:           modalRetorno.cfop_retorno,
        unidade:        (it.unidade_nf ?? it.unidade).toUpperCase(),
        quantidade:     it.quantidade,
        valor_unitario: it.valor_unitario,
      }));

      const dest = pessoas.find(p => p.id === modalRetorno.destinatario_pessoa_id);

      const resp = await fetch("/api/fiscal/emitir-nfe", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fazenda_id:   fazendaId,
          modulo_key:   fiscalMods[0]?.modulo ?? "",
          destinatario: {
            nome:           modalRetorno.destinatario_nome,
            cpf_cnpj:       dest ? (dest.cpf_cnpj ?? "").replace(/\D/g, "") || undefined : undefined,
            ie:             dest?.inscricao_est || undefined,
            logradouro:     dest?.logradouro || undefined,
            numero:         dest?.numero || undefined,
            bairro:         dest?.bairro || undefined,
            municipio_ibge: dest?.municipio_ibge || undefined,
            municipio_nome: dest?.municipio || undefined,
            uf:             modalRetorno.destinatario_uf || undefined,
            cep:            dest ? (dest.cep ?? "").replace(/\D/g, "") || undefined : undefined,
          },
          itens:    itensNfe,
          natureza: retForm.natureza,
          inf_cpl:  `Retorno de remessa — NF ref: ${modalRetorno.nf_remessa_chave ?? modalRetorno.nf_remessa_numero ?? ""}${retForm.obs ? `\n${retForm.obs}` : ""}`,
          frete:    "9",
          nfe_ref:  modalRetorno.nf_remessa_chave || undefined,
          tipo:     "1",
        }),
      });
      const res = await resp.json() as { sucesso: boolean; chave?: string; numero?: string; protocolo?: string; cStat?: string; xMotivo?: string };
      if (!res.sucesso || !res.chave) throw new Error(`SEFAZ [${res.cStat}]: ${res.xMotivo}`);

      // Atualiza registro
      await atualizarNfRemessaLogistica(modalRetorno.id, {
        nf_retorno_chave:    res.chave,
        nf_retorno_numero:   res.numero,
        nf_retorno_protocolo: res.protocolo,
        nf_retorno_data:     new Date().toISOString().split("T")[0],
        status:              "retornada",
      });
      setRemessas(prev => prev.map(r => r.id === modalRetorno.id ? { ...r, nf_retorno_chave: res.chave, nf_retorno_numero: res.numero, status: "retornada" } : r));
      setRetOk({ chave: res.chave, numero: res.numero ?? "" });
    } catch (e) {
      setRetErro((e as Error).message ?? "Erro ao emitir NF de retorno.");
    } finally {
      setRetEmitindo(false);
    }
  }

  const filtradas = remessas.filter(r => {
    if (filtroSt && r.status !== filtroSt) return false;
    const q = busca.toLowerCase();
    if (!q) return true;
    return (
      r.destinatario_nome.toLowerCase().includes(q) ||
      (r.nf_compra_chave ?? "").includes(q) ||
      (r.nf_remessa_chave ?? "").includes(q) ||
      (r.nf_remessa_numero ?? "").includes(q)
    );
  });

  const totalEmitidas   = remessas.filter(r => r.status === "emitida").length;
  const totalRetornadas = remessas.filter(r => r.status === "retornada").length;
  const totalValor      = remessas.reduce((s, r) => s + r.valor_total, 0);

  return (
    <>
      <TopNav />
      <main style={{ maxWidth: 1300, margin: "0 auto", padding: "28px 24px" }}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24, flexWrap: "wrap", gap: 12 }}>
          <div>
            <h1 style={{ fontSize: 20, fontWeight: 700, color: "var(--text-1)", margin: 0 }}>Remessas Logísticas</h1>
            <p style={{ fontSize: 13, color: "var(--text-3)", margin: "4px 0 0" }}>NFs 5905/6905 emitidas para armazenagem em condomínio logístico e respectivos retornos 5906/6906</p>
          </div>
        </div>

        {/* KPIs */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 14, marginBottom: 24 }}>
          {[
            { label: "Total Emitidas",   value: String(totalEmitidas),               bg: "#D5E8F5", cl: "#0B2D50" },
            { label: "Aguard. Retorno",  value: String(totalEmitidas - totalRetornadas < 0 ? 0 : totalEmitidas), bg: "#FBF3E0", cl: "#7A5C00" },
            { label: "Retornadas",       value: String(totalRetornadas),              bg: "#E8F5E9", cl: "#1A6B3C" },
            { label: "Valor Total",      value: fmtBRL(totalValor),                  bg: "#F4F6FA", cl: "#1a1a1a" },
          ].map(k => (
            <div key={k.label} style={{ background: k.bg, borderRadius: 10, padding: "14px 16px" }}>
              <div style={{ fontSize: 11, color: k.cl, fontWeight: 600, marginBottom: 4 }}>{k.label}</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: k.cl }}>{k.value}</div>
            </div>
          ))}
        </div>

        {/* Filtros */}
        <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
          <input style={{ ...inp, maxWidth: 320 }} placeholder="Buscar por destinatário ou chave NF…" value={busca} onChange={e => setBusca(e.target.value)} />
          <select style={{ ...inp, maxWidth: 180 }} value={filtroSt} onChange={e => setFiltroSt(e.target.value)}>
            <option value="">Todos os status</option>
            <option value="emitida">Emitida</option>
            <option value="retornada">Retornada</option>
            <option value="cancelada">Cancelada</option>
          </select>
          <span style={{ fontSize: 12, color: "var(--text-3)", marginLeft: "auto" }}>{filtradas.length} registro{filtradas.length !== 1 ? "s" : ""}</span>
        </div>

        {/* Tabela */}
        {loading ? (
          <div style={{ padding: 40, textAlign: "center", color: "var(--text-muted)", fontSize: 13 }}>Carregando…</div>
        ) : filtradas.length === 0 ? (
          <div style={{ background: "var(--bg-card)", borderRadius: 12, border: "0.5px solid var(--border)", padding: 40, textAlign: "center", color: "var(--text-muted)", fontSize: 13 }}>
            {busca || filtroSt ? "Nenhuma remessa encontrada para os filtros." : "Nenhuma NF de remessa logística emitida. Use ⋮ → Emitir NF Remessa em uma NF de compra processada."}
          </div>
        ) : (
          <div style={{ background: "var(--bg-card)", borderRadius: 12, border: "0.5px solid var(--border)", overflow: "hidden" }}>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr style={{ background: "var(--bg-nav)", borderBottom: "0.5px solid var(--border)" }}>
                    <th style={{ padding: "11px 14px", textAlign: "left", fontWeight: 600, fontSize: 11, color: "var(--text-2)", whiteSpace: "nowrap" }}>Destinatário</th>
                    <th style={{ padding: "11px 10px", textAlign: "center", fontWeight: 600, fontSize: 11, color: "var(--text-2)" }}>Status</th>
                    <th style={{ padding: "11px 10px", textAlign: "center", fontWeight: 600, fontSize: 11, color: "var(--text-2)" }}>Data Remessa</th>
                    <th style={{ padding: "11px 10px", textAlign: "center", fontWeight: 600, fontSize: 11, color: "var(--text-2)" }}>NF Remessa</th>
                    <th style={{ padding: "11px 10px", textAlign: "center", fontWeight: 600, fontSize: 11, color: "var(--text-2)" }}>CFOP</th>
                    <th style={{ padding: "11px 10px", textAlign: "right",  fontWeight: 600, fontSize: 11, color: "var(--text-2)" }}>Valor</th>
                    <th style={{ padding: "11px 10px", textAlign: "center", fontWeight: 600, fontSize: 11, color: "var(--text-2)" }}>NF Compra (ref)</th>
                    <th style={{ padding: "11px 10px", textAlign: "center", fontWeight: 600, fontSize: 11, color: "var(--text-2)" }}>NF Retorno</th>
                    <th style={{ padding: "11px 10px", textAlign: "center", fontWeight: 600, fontSize: 11, color: "var(--text-2)" }}>Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {filtradas.map((r, i) => {
                    const badge = STATUS_BADGE[r.status] ?? { bg: "#eee", cl: "#333", label: r.status };
                    return (
                      <tr key={r.id} style={{ borderBottom: i < filtradas.length - 1 ? "0.5px solid var(--border)" : "none", background: i % 2 === 0 ? "transparent" : "var(--bg-stripe)" }}>
                        <td style={{ padding: "10px 14px", color: "var(--text-1)", fontWeight: 500 }}>
                          <div>{r.destinatario_nome}</div>
                          {r.destinatario_uf && <div style={{ fontSize: 10, color: "var(--text-3)" }}>{r.destinatario_uf}</div>}
                        </td>
                        <td style={{ padding: "10px 10px", textAlign: "center" }}>
                          <span style={{ fontSize: 10, background: badge.bg, color: badge.cl, borderRadius: 20, padding: "2px 8px", fontWeight: 700, whiteSpace: "nowrap" }}>{badge.label}</span>
                        </td>
                        <td style={{ padding: "10px 10px", textAlign: "center", fontSize: 12, color: "var(--text-2)" }}>{fmtData(r.nf_remessa_data)}</td>
                        <td style={{ padding: "10px 10px", textAlign: "center" }}>
                          {r.nf_remessa_numero ? (
                            <div>
                              <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-1)" }}>{r.nf_remessa_numero}</div>
                              {r.nf_remessa_chave && <div style={{ fontSize: 9, fontFamily: "monospace", color: "var(--text-3)", wordBreak: "break-all", maxWidth: 200 }}>{r.nf_remessa_chave.slice(0, 22)}…</div>}
                            </div>
                          ) : <span style={{ color: "var(--text-muted)" }}>—</span>}
                        </td>
                        <td style={{ padding: "10px 10px", textAlign: "center" }}>
                          <span style={{ fontSize: 11, background: "#D5E8F5", color: "#0B2D50", borderRadius: 6, padding: "2px 7px", fontWeight: 600 }}>{r.cfop_remessa}</span>
                        </td>
                        <td style={{ padding: "10px 10px", textAlign: "right", fontWeight: 600, color: "var(--text-1)", fontVariantNumeric: "tabular-nums" }}>
                          {fmtBRL(r.valor_total)}
                        </td>
                        <td style={{ padding: "10px 10px", textAlign: "center" }}>
                          {r.nf_compra_chave ? (
                            <span style={{ fontSize: 9, fontFamily: "monospace", color: "var(--text-3)" }} title={r.nf_compra_chave}>{r.nf_compra_chave.slice(0, 22)}…</span>
                          ) : <span style={{ color: "var(--text-muted)", fontSize: 12 }}>—</span>}
                        </td>
                        <td style={{ padding: "10px 10px", textAlign: "center" }}>
                          {r.nf_retorno_chave ? (
                            <div>
                              <div style={{ fontSize: 12, fontWeight: 600, color: "#16A34A" }}>{r.nf_retorno_numero}</div>
                              <div style={{ fontSize: 10, color: "var(--text-3)" }}>{fmtData(r.nf_retorno_data)}</div>
                            </div>
                          ) : (
                            r.status === "emitida" ? (
                              <span style={{ fontSize: 10, color: "#C9921B", background: "#FBF3E0", borderRadius: 20, padding: "2px 7px" }}>Pendente</span>
                            ) : <span style={{ color: "var(--text-muted)", fontSize: 12 }}>—</span>
                          )}
                        </td>
                        <td style={{ padding: "10px 10px", textAlign: "center" }}>
                          {r.status === "emitida" && (
                            <button onClick={() => abrirRetorno(r)}
                              style={{ padding: "5px 12px", border: "0.5px solid #1A4870", borderRadius: 7, background: "transparent", color: "#1A4870", fontSize: 11, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap" }}>
                              Emitir Retorno →
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>

      {/* ── Modal de Retorno ── */}
      {modalRetorno && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 2000 }}>
          <div style={{ background: "var(--bg-card)", borderRadius: 14, width: "100%", maxWidth: 580, margin: "0 20px", boxShadow: "0 4px 20px rgba(11,45,80,0.10)", maxHeight: "90vh", display: "flex", flexDirection: "column" }}>
            <div style={{ padding: "18px 22px 14px", borderBottom: "0.5px solid var(--border)", display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div>
                <div style={{ fontSize: 15, fontWeight: 700, color: "var(--text-1)" }}>Emitir NF de Retorno</div>
                <div style={{ fontSize: 12, color: "var(--text-3)", marginTop: 2 }}>
                  Remessa original: {modalRetorno.nf_remessa_numero} — {modalRetorno.destinatario_nome}
                </div>
              </div>
              <button onClick={() => setModalRetorno(null)} style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer", color: "var(--text-3)", lineHeight: 1 }}>×</button>
            </div>

            {retOk ? (
              <div style={{ padding: 28, textAlign: "center" }}>
                <div style={{ fontSize: 40, marginBottom: 12 }}>✅</div>
                <div style={{ fontSize: 16, fontWeight: 700, color: "#16A34A", marginBottom: 8 }}>NF de Retorno Emitida!</div>
                <div style={{ fontSize: 13, color: "var(--text-2)", marginBottom: 4 }}>Número: <strong>{retOk.numero}</strong></div>
                <div style={{ fontSize: 11, fontFamily: "monospace", color: "var(--text-3)", wordBreak: "break-all", marginBottom: 20 }}>{retOk.chave}</div>
                <button onClick={() => setModalRetorno(null)} style={btnV}>Fechar</button>
              </div>
            ) : (
              <div style={{ padding: "18px 22px", overflowY: "auto", flex: 1 }}>
                {/* Info resumo */}
                <div style={{ background: "var(--bg-stripe)", borderRadius: 8, padding: "12px 14px", fontSize: 12, color: "var(--text-1)", marginBottom: 16 }}>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                    <div><span style={{ color: "var(--text-3)" }}>Destinatário:</span><br/><strong>{modalRetorno.destinatario_nome}</strong></div>
                    <div><span style={{ color: "var(--text-3)" }}>CFOP Retorno:</span><br/>
                      <span style={{ background: "#D5E8F5", color: "#0B2D50", borderRadius: 6, padding: "2px 7px", fontWeight: 700 }}>{modalRetorno.cfop_retorno}</span>
                      <span style={{ marginLeft: 6, fontSize: 11, color: "var(--text-3)" }}>({modalRetorno.cfop_retorno === "5906" ? "Intra-estadual" : "Inter-estadual"})</span>
                    </div>
                    <div><span style={{ color: "var(--text-3)" }}>NF Remessa ref.:</span><br/><span style={{ fontFamily: "monospace", fontSize: 10 }}>{modalRetorno.nf_remessa_chave?.slice(0, 30)}…</span></div>
                    <div><span style={{ color: "var(--text-3)" }}>Valor Total:</span><br/><strong>{fmtBRL(modalRetorno.valor_total)}</strong></div>
                  </div>
                </div>

                {/* Natureza */}
                <div style={{ marginBottom: 14 }}>
                  <label style={lbl}>Natureza da Operação</label>
                  <input style={inp} value={retForm.natureza} onChange={e => setRetForm(p => ({ ...p, natureza: e.target.value }))} />
                </div>

                {/* Obs */}
                <div style={{ marginBottom: 14 }}>
                  <label style={lbl}>Observações complementares (opcional)</label>
                  <textarea style={{ ...inp, minHeight: 56, resize: "vertical" }}
                    value={retForm.obs} onChange={e => setRetForm(p => ({ ...p, obs: e.target.value }))}
                    placeholder="Ex: Retorno integral, produto em bom estado…" />
                </div>

                <div style={{ background: "#D5E8F5", borderRadius: 8, padding: "10px 14px", fontSize: 12, color: "#0B2D50", marginBottom: 16 }}>
                  Os itens da remessa original serão incluídos na NF de retorno.
                  A NF de remessa será referenciada via &lt;NFref&gt;.
                </div>

                {retErro && (
                  <div style={{ background: "#FDECEA", color: "#B91C1C", borderRadius: 8, padding: "10px 14px", fontSize: 12, marginBottom: 14 }}>
                    {retErro}
                  </div>
                )}

                <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
                  <button onClick={() => setModalRetorno(null)} style={btnR}>Cancelar</button>
                  <button onClick={emitirRetorno} disabled={retEmitindo}
                    style={{ ...btnV, opacity: retEmitindo ? 0.6 : 1 }}>
                    {retEmitindo ? "Emitindo…" : "Emitir NF de Retorno →"}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
