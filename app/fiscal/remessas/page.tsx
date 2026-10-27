"use client";
import { hojeLocal } from "../../../lib/data-local";
import { OperationalButton, OperationalFilters, OperationalGrid, OperationalHeading } from "../../../components/OperationalUI";
import SelectField from "../../../components/SelectField";
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
  const { contaId, fazendaId, fazendaIds } = useAuth();

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
  const [retCpfHint,   setRetCpfHint]    = useState<string | undefined>(undefined);
  const [retProdutorId, setRetProdutorId] = useState<string | undefined>(undefined);
  // Retorno já emitido por outro: condomínio logístico/armazém (chega como NF de entrada) ou nota própria emitida fora
  type DocRetorno = { origem: "nf_entrada" | "nota_propria"; id: string; numero: string; chave: string | null; data: string | null; emitente: string | null; valor: number | null };
  const [retModo, setRetModo] = useState<"emitir" | "vincular">("emitir");
  const [retBusca, setRetBusca] = useState("");
  const [retDocs, setRetDocs] = useState<DocRetorno[]>([]);
  const [retManual, setRetManual] = useState({ numero: "", chave: "", data: "" });
  async function buscarDocsRetorno(texto: string, r: NfRemessaLogistica) {
    setRetBusca(texto);
    const ids = fazendaIds?.length ? fazendaIds : r.fazenda_id ? [r.fazenda_id] : [];
    if (!ids.length) return;
    const t = texto.trim();
    const num = /^\d+$/.test(t) ? t.replace(/^0+/, "") : "";
    let qe = supabase.from("nf_entradas").select("id, numero, chave_acesso, data_emissao, emitente_nome, valor_total, status").in("fazenda_id", ids).neq("status", "cancelada");
    let qp = supabase.from("notas_proprias_externas").select("id, numero, chave_acesso, data_emissao, nome_destinatario, valor_total, status").in("fazenda_id", ids).neq("status", "cancelada");
    if (num) { qe = qe.ilike("numero", `%${num}%`); qp = qp.ilike("numero", `%${num}%`); }
    else if (t) { qe = qe.ilike("emitente_nome", `%${t}%`); qp = qp.ilike("nome_destinatario", `%${t}%`); }
    if (r.nf_remessa_data) { qe = qe.gte("data_emissao", r.nf_remessa_data); qp = qp.gte("data_emissao", r.nf_remessa_data); }
    const [{ data: e }, { data: pr }] = await Promise.all([qe.order("data_emissao", { ascending: false }).limit(20), qp.order("data_emissao", { ascending: false }).limit(10)]);
    setRetDocs([
      ...((e ?? []) as { id: string; numero: string; chave_acesso: string | null; data_emissao: string | null; emitente_nome: string | null; valor_total: number | null }[])
        .map(x => ({ origem: "nf_entrada" as const, id: x.id, numero: x.numero, chave: x.chave_acesso, data: x.data_emissao, emitente: x.emitente_nome, valor: x.valor_total })),
      ...((pr ?? []) as { id: string; numero: string; chave_acesso: string | null; data_emissao: string | null; nome_destinatario: string | null; valor_total: number | null }[])
        .map(x => ({ origem: "nota_propria" as const, id: x.id, numero: x.numero, chave: x.chave_acesso, data: x.data_emissao, emitente: `Nota própria → ${x.nome_destinatario ?? "—"}`, valor: x.valor_total })),
    ]);
  }
  async function vincularRetorno(doc: { numero: string; chave: string | null; data: string | null; descricao: string }) {
    if (!modalRetorno) return;
    if (!doc.numero.trim()) { setRetErro("Informe o número da NF de retorno."); return; }
    setRetEmitindo(true); setRetErro("");
    try {
      const chave = (doc.chave ?? "").replace(/\D/g, "") || undefined;
      await atualizarNfRemessaLogistica(modalRetorno.id, {
        nf_retorno_chave: chave, nf_retorno_numero: doc.numero.trim(), nf_retorno_data: doc.data || hojeLocal(), status: "retornada",
        observacao: [modalRetorno.observacao, `Retorno emitido fora do Arato: ${doc.descricao}`].filter(Boolean).join(" | "),
      });
      setRemessas(prev => prev.map(x => x.id === modalRetorno.id ? { ...x, nf_retorno_chave: chave, nf_retorno_numero: doc.numero.trim(), status: "retornada" } : x));
      setRetOk({ chave: chave ?? "", numero: doc.numero.trim() });
    } catch (e) {
      setRetErro((e as Error).message ?? "Erro ao vincular o retorno.");
    } finally {
      setRetEmitindo(false);
    }
  }

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
    setRetModo("emitir"); setRetDocs([]); setRetManual({ numero: "", chave: "", data: "" });
    // sugestões: NFs recebidas do próprio condomínio/armazém da remessa
    const sugestao = r.destinatario_nome.split(/\s+/).slice(0, 2).join(" ");
    setRetBusca(sugestao);
    buscarDocsRetorno(sugestao, r);
    setRetErro("");
    setRetOk(null);
    // Busca módulos fiscais da fazenda REAL da remessa (não a fazenda ativa
    // do seletor, que pode ser outra na mesma conta)
    const fazendaRemessa = r.fazenda_id ?? fazendaId;
    if (fazendaRemessa) {
      const { data } = await supabase
        .from("configuracoes_modulo")
        .select("modulo, config")
        .eq("fazenda_id", fazendaRemessa)
        .or("modulo.like.fiscal_pf_%,modulo.like.fiscal_emp_%");
      setFiscalMods((data ?? []) as Array<{modulo: string; config: Record<string,string>}>);
    }
    // CPF/CNPJ do produtor dono da NF de compra original — quem responde fiscalmente pelo retorno,
    // não "o primeiro módulo fiscal que aparecer" (a fazenda pode ter vários emitentes configurados).
    setRetCpfHint(undefined);
    setRetProdutorId(undefined);
    if (r.nf_entrada_id) {
      const { data: nfOrig } = await supabase.from("nf_entradas").select("produtor_id").eq("id", r.nf_entrada_id).maybeSingle();
      if (nfOrig?.produtor_id) {
        setRetProdutorId(nfOrig.produtor_id);
        const { data: prod } = await supabase.from("produtores").select("cpf_cnpj").eq("id", nfOrig.produtor_id).maybeSingle();
        setRetCpfHint(prod?.cpf_cnpj ?? undefined);
      }
    }
  }

  async function emitirRetorno() {
    if (!modalRetorno || !(modalRetorno.fazenda_id ?? fazendaId)) return;
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
          fazenda_id:   modalRetorno.fazenda_id ?? fazendaId,
          modulo_key:      fiscalMods[0]?.modulo ?? "",   // fallback — o servidor prefere cpf_cnpj_hint quando resolvível
          produtor_id_hint: retProdutorId,
          cpf_cnpj_hint:   retCpfHint,
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
        nf_retorno_data:     hojeLocal(),
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
        <OperationalHeading data-arato-page-heading="true" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24, flexWrap: "wrap", gap: 12 }}>
          <div>
            <h1 data-arato-h1="true" style={{ fontSize: 20, fontWeight: 700, color: "var(--text-1)", margin: 0 }}>Remessas Logísticas</h1>
          </div>
        </OperationalHeading>

        {/* KPIs */}
        <div data-arato-kpis="true" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 14, marginBottom: 24 }}>
          {[
            { label: "Total Emitidas",   value: String(totalEmitidas),               bg: "#D5E8F5", cl: "#0B2D50" },
            { label: "Aguard. Retorno",  value: String(totalEmitidas - totalRetornadas < 0 ? 0 : totalEmitidas), bg: "#FBF3E0", cl: "#7A5C00" },
            { label: "Retornadas",       value: String(totalRetornadas),              bg: "#E8F5E9", cl: "#1A6B3C" },
            { label: "Valor Total",      value: fmtBRL(totalValor),                  bg: "#F4F6FA", cl: "#1a1a1a" },
          ].map(k => (
            <div data-arato-statistic="display" key={k.label} style={{ background: k.bg, borderRadius: 10, padding: "14px 16px" }}>
              <div style={{ fontSize: 11, color: k.cl, fontWeight: 600, marginBottom: 4 }}>{k.label}</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: k.cl }}>{k.value}</div>
            </div>
          ))}
        </div>

        {/* Filtros */}
        <OperationalFilters data-arato-filters="true" style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
          <input style={{ ...inp, maxWidth: 320 }} placeholder="Buscar por destinatário ou chave NF…" value={busca} onChange={e => setBusca(e.target.value)} />
          <SelectField style={{ ...inp, maxWidth: 180 }} value={filtroSt} onChange={e => setFiltroSt(e.target.value)}>
            <option value="">Todos os status</option>
            <option value="emitida">Emitida</option>
            <option value="retornada">Retornada</option>
            <option value="cancelada">Cancelada</option>
          </SelectField>
          <span style={{ fontSize: 12, color: "var(--text-3)", marginLeft: "auto" }}>{filtradas.length} registro{filtradas.length !== 1 ? "s" : ""}</span>
        </OperationalFilters>

        {/* Tabela */}
        {loading ? (
          <div style={{ padding: 40, textAlign: "center", color: "var(--text-muted)", fontSize: 13 }}>Carregando…</div>
        ) : filtradas.length === 0 ? (
          <div style={{ background: "var(--bg-card)", borderRadius: 12, border: "0.5px solid var(--border)", padding: 40, textAlign: "center", color: "var(--text-muted)", fontSize: 13 }}>
            {busca || filtroSt ? "Nenhuma remessa encontrada para os filtros." : "Nenhuma NF de remessa logística emitida. Use ⋮ → Emitir NF Remessa em uma NF de compra processada."}
          </div>
        ) : (
          <div style={{ background: "var(--bg-card)", borderRadius: 12, border: "0.5px solid var(--border)", overflow: "hidden" }}>
            <div data-arato-grid-container="true" style={{ overflowX: "auto" }}>
              <OperationalGrid data-arato-grid="true" style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
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
                            <OperationalButton data-arato-button="secondary" onClick={() => abrirRetorno(r)}
                              style={{ padding: "5px 12px", border: "0.5px solid #1A4870", borderRadius: 7, background: "transparent", color: "#1A4870", fontSize: 11, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap" }}>
                              Emitir Retorno →
                            </OperationalButton>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </OperationalGrid>
            </div>
          </div>
        )}
      </main>

      {/* ── Modal de Retorno ── */}
      {modalRetorno && (
        <div data-arato-overlay="true" style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 2000 }}>
          <div data-arato-dialog="form" style={{ background: "var(--bg-card)", borderRadius: 14, width: "100%", maxWidth: 580, margin: "0 20px", boxShadow: "0 4px 20px rgba(11,45,80,0.10)", maxHeight: "90vh", display: "flex", flexDirection: "column" }}>
            <div data-arato-dialog-body="true" data-arato-dialog-heading="true" style={{ padding: "18px 22px 14px", borderBottom: "0.5px solid var(--border)", display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div data-arato-dialog-body="true">
                <div data-arato-dialog-body="true" style={{ fontSize: 15, fontWeight: 700, color: "var(--text-1)" }}>Retorno da Remessa</div>
                <div data-arato-dialog-body="true" style={{ fontSize: 12, color: "var(--text-3)", marginTop: 2 }}>
                  Remessa original: {modalRetorno.nf_remessa_numero} — {modalRetorno.destinatario_nome}
                </div>
              </div>
              <OperationalButton data-arato-button="icon" onClick={() => setModalRetorno(null)} style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer", color: "var(--text-3)", lineHeight: 1 }}>×</OperationalButton>
            </div>

            {retOk ? (
              <div style={{ padding: 28, textAlign: "center" }}>
                <div style={{ fontSize: 40, marginBottom: 12 }}>✅</div>
                <div style={{ fontSize: 16, fontWeight: 700, color: "#16A34A", marginBottom: 8 }}>{retModo === "vincular" ? "Retorno vinculado à remessa!" : "NF de Retorno Emitida!"}</div>
                <div style={{ fontSize: 13, color: "var(--text-2)", marginBottom: 4 }}>Número: <strong>{retOk.numero}</strong></div>
                <div style={{ fontSize: 11, fontFamily: "monospace", color: "var(--text-3)", wordBreak: "break-all", marginBottom: 20 }}>{retOk.chave}</div>
                <OperationalButton data-arato-button="primary" onClick={() => setModalRetorno(null)} style={btnV}>Fechar</OperationalButton>
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

                <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
                  {([["emitir", "Emitir NF de retorno pelo Arato"], ["vincular", "Vincular retorno já emitido (condomínio, armazém, outro sistema)"]] as const).map(([m, t]) => (
                    <button key={m} type="button" onClick={() => { setRetModo(m); setRetErro(""); }}
                      style={{ flex: 1, padding: "8px 10px", borderRadius: 8, fontSize: 12, fontWeight: retModo === m ? 700 : 500, cursor: "pointer",
                        border: retModo === m ? "1.5px solid #1A4870" : "0.5px solid var(--border)", background: retModo === m ? "#D5E8F5" : "var(--bg-card)", color: retModo === m ? "#0B2D50" : "var(--text-2)" }}>{t}</button>
                  ))}
                </div>

                {retModo === "vincular" && (
                  <div style={{ marginBottom: 14 }}>
                    <label data-arato-label="true" style={lbl}>NF de retorno recebida (ex.: emitida pela Luft) ou nota própria emitida fora</label>
                    <input style={inp} value={retBusca} onChange={e => buscarDocsRetorno(e.target.value, modalRetorno)} placeholder="Nº da NF ou emitente" />
                    <div style={{ border: "0.5px solid var(--border)", borderRadius: 8, marginTop: 6, maxHeight: 200, overflowY: "auto" }}>
                      {retDocs.length === 0 && <div style={{ padding: 10, fontSize: 12, color: "var(--text-3)" }}>Nenhuma NF encontrada. Digite o número ou o emitente, ou informe abaixo.</div>}
                      {retDocs.map(d => (
                        <div key={`${d.origem}:${d.id}`} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, padding: "6px 10px", borderBottom: "0.5px solid var(--border)", fontSize: 12 }}>
                          <span><strong>NF {d.numero}</strong> · {d.emitente ?? "—"} · {d.data ? d.data.split("-").reverse().join("/") : "—"} · {fmtBRL(d.valor ?? 0)}</span>
                          <OperationalButton data-arato-button="primary" disabled={retEmitindo} onClick={() => vincularRetorno({ numero: d.numero, chave: d.chave, data: d.data, descricao: `NF ${d.numero} — ${d.emitente ?? ""}${d.origem === "nf_entrada" ? " (NF recebida)" : ""}` })}
                            style={{ ...btnV, padding: "4px 10px", fontSize: 11 }}>Vincular</OperationalButton>
                        </div>
                      ))}
                    </div>
                    <div style={{ fontSize: 11, color: "var(--text-3)", margin: "10px 0 6px" }}>Ou informe a NF de retorno:</div>
                    <div style={{ display: "grid", gridTemplateColumns: "110px 1fr 130px auto", gap: 8, alignItems: "end" }}>
                      <input style={inp} placeholder="Número" value={retManual.numero} onChange={e => setRetManual(p => ({ ...p, numero: e.target.value }))} />
                      <input style={inp} placeholder="Chave de acesso (opcional)" value={retManual.chave} onChange={e => setRetManual(p => ({ ...p, chave: e.target.value }))} />
                      <input style={inp} type="date" value={retManual.data} onChange={e => setRetManual(p => ({ ...p, data: e.target.value }))} />
                      <OperationalButton data-arato-button="primary" disabled={retEmitindo} onClick={() => vincularRetorno({ numero: retManual.numero, chave: retManual.chave, data: retManual.data, descricao: `NF ${retManual.numero} (informada à mão)` })} style={{ ...btnV, padding: "7px 12px" }}>Vincular</OperationalButton>
                    </div>
                    {retErro && <div style={{ background: "#FDECEA", color: "#B91C1C", borderRadius: 8, padding: "10px 14px", fontSize: 12, marginTop: 10 }}>{retErro}</div>}
                  </div>
                )}

                {retModo === "emitir" && (<>
                {/* Natureza */}
                <div style={{ marginBottom: 14 }}>
                  <label data-arato-label="true" style={lbl}>Natureza da Operação</label>
                  <input style={inp} value={retForm.natureza} onChange={e => setRetForm(p => ({ ...p, natureza: e.target.value }))} />
                </div>

                {/* Obs */}
                <div style={{ marginBottom: 14 }}>
                  <label data-arato-label="true" style={lbl}>Observações complementares (opcional)</label>
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

                <div data-arato-dialog-actions="true" style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
                  <OperationalButton data-arato-button="secondary" onClick={() => setModalRetorno(null)} style={btnR}>Cancelar</OperationalButton>
                  <OperationalButton data-arato-button="primary" onClick={emitirRetorno} disabled={retEmitindo}
                    style={{ ...btnV, opacity: retEmitindo ? 0.6 : 1 }}>
                    {retEmitindo ? "Emitindo…" : "Emitir NF de Retorno →"}
                  </OperationalButton>
                </div>
                </>)}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
