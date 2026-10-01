"use client";
// ═══════════════════════════════════════════════════════════════════════════
// Documentos Fiscais — NF de Produtos + NF de Serviços unificados numa tela
// só, ordenados por data, filtro por tipo (Seção 321 da migration, trigger-
// sync de nf_entradas + nf_servicos + ctes em rel_documentos_fiscais).
// Promovida de piloto em 01/10/2026, a pedido do dono, pra teste real.
//
// Processamento de cada tipo acontece via MODAL dentro desta mesma tela,
// sem redirecionar: "+ Nova NF de Produtos"/"+ Nova NF de Serviço" ou
// clicar numa linha abre o modal certo (ModalNf / ModalNfServico — núcleo
// de cada wizard extraído das telas antigas, lógica preservada).
//
// As 4 lacunas da Fase 2 (devolução, reclassificação, remessa logística e
// ações em lote) foram todas fechadas entre 01/10 e 02/10/2026 — ver
// histórico no CLAUDE.md. CT-e ainda não tem modal nesta tela — continua
// só em Fretes e Transporte → CT-e (frente separada, modal a construir do
// zero, não uma extração da tela antiga).
//
// Ações em lote (seleção por checkbox, restrita a linhas de tipo NF): Ver
// condições de habilitação iguais à tela antiga — só NFs pendentes entram
// no "Processar em Lote"; qualquer seleção permite Imprimir.
// ═══════════════════════════════════════════════════════════════════════════
import { useState, useEffect } from "react";
import { useAuth } from "../../../components/AuthProvider";
import { supabase } from "../../../lib/supabase";
import TopNav from "../../../components/TopNav";
import ModalNfServico from "../../../components/fiscal/ModalNfServico";
import ModalNf from "../../../components/fiscal/ModalNf";
import ModalProcessarLote from "../../../components/fiscal/ModalProcessarLote";

type RelDocFiscal = {
  id: string;
  origem_tabela: string;
  tipo_doc: "NF" | "NFS" | "CTE";
  fazenda_id: string | null;
  numero: string | null;
  serie: string | null;
  chave: string | null;
  data_doc: string | null;
  participante_nome: string | null;
  participante_cnpj: string | null;
  valor_total: number | null;
  status_origem: string | null;
  status_normalizado: string | null;
  cfop: string | null;
  natureza_operacao: string | null;
  observacao: string | null;
};

const TIPO_OPCOES: { v: string; label: string; bg: string; color: string }[] = [
  { v: "NF",  label: "NF de Produtos",  bg: "#E6F1FB", color: "#0C447C" },
  { v: "NFS", label: "NF de Serviços",  bg: "#F5F3FF", color: "#5B21B6" },
  { v: "CTE", label: "CT-e",            bg: "#FBF3E0", color: "#7A5200" },
];
const STATUS_OPCOES: { v: string; label: string; bg: string; color: string }[] = [
  { v: "pendente",   label: "Pendente",   bg: "#E8E8E8", color: "#0D0D0D" },
  { v: "processada", label: "Processada", bg: "#DCFCE7", color: "#166534" },
  { v: "cancelada",  label: "Cancelada",  bg: "#FCEBEB", color: "#791F1F" },
];

const fmtBRL = (v?: number | null) => (v ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fmtData = (s?: string | null) => s ? s.split("-").reverse().join("/") : "—";

const inp: React.CSSProperties = { padding: "7px 10px", border: "0.5px solid #DDE2EE", borderRadius: 8, fontSize: 13, background: "#fff" };
const lblMini: React.CSSProperties = { fontSize: 10, color: "#888", fontWeight: 600, display: "block", marginBottom: 3, textTransform: "uppercase", letterSpacing: "0.03em" };
const chip = (ativo: boolean): React.CSSProperties => ({
  padding: "5px 11px", borderRadius: 7, fontSize: 11, fontWeight: 600, cursor: "pointer",
  border: ativo ? "1.5px solid #2A2A2A" : "0.5px solid #DDE2EE", background: ativo ? "#2A2A2A" : "#fff", color: ativo ? "#fff" : "#555",
});

export default function DocumentosFiscaisPage() {
  const { fazendaId, fazendaIds, contaId } = useAuth();

  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");
  const [resultado, setResultado] = useState<RelDocFiscal[] | null>(null);

  const [fTipo,    setFTipo]    = useState<Set<string>>(new Set());
  const [fStatus,  setFStatus]  = useState<Set<string>>(new Set());
  const [fBusca,   setFBusca]   = useState("");
  const [fDataDe,  setFDataDe]  = useState("");
  const [fDataAte, setFDataAte] = useState("");

  const toggle = (set: Set<string>, setFn: (s: Set<string>) => void, v: string) => {
    const next = new Set(set);
    next.has(v) ? next.delete(v) : next.add(v);
    setFn(next);
  };

  async function carregar() {
    const fids = fazendaIds?.length ? fazendaIds : fazendaId ? [fazendaId] : [];
    if (!fids.length && !contaId) return;
    setCarregando(true);
    setErro("");
    try {
      let q = supabase.from("rel_documentos_fiscais").select("*");
      q = contaId ? q.eq("conta_id", contaId) : q.in("fazenda_id", fids);
      if (fTipo.size > 0) q = q.in("tipo_doc", Array.from(fTipo));
      if (fStatus.size > 0) q = q.in("status_normalizado", Array.from(fStatus));
      if (fDataDe) q = q.gte("data_doc", fDataDe);
      if (fDataAte) q = q.lte("data_doc", fDataAte);
      if (fBusca.trim()) {
        const t = fBusca.trim();
        q = q.or(`numero.ilike.%${t}%,participante_nome.ilike.%${t}%,chave.ilike.%${t}%`);
      }
      q = q.order("data_doc", { ascending: false }).limit(1000);

      const { data, error } = await q;
      if (error) throw error;
      setResultado((data ?? []) as RelDocFiscal[]);
    } catch (e: unknown) {
      setErro(e instanceof Error ? e.message : "Erro ao consultar documentos fiscais.");
    } finally {
      setCarregando(false);
    }
  }

  useEffect(() => { carregar(); }, [fazendaId, fazendaIds?.join(","), contaId]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Modais por tipo ligados nesta fase ──
  const [modalNfs, setModalNfs] = useState<{ id: string | null } | null>(null);
  const [modalNf,  setModalNf]  = useState<{ id: string | null } | null>(null);

  // ── Ações em lote — seleção restrita a linhas de tipo NF (a única com
  // processamento em lote implementado; NFS/CT-e nunca tiveram essa ação) ──
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());
  const [modalLote, setModalLote] = useState(false);

  const linhas = (resultado ?? []).filter(d => {
    if (fTipo.size > 0 && !fTipo.has(d.tipo_doc)) return false;
    if (fStatus.size > 0 && !fStatus.has(d.status_normalizado ?? "")) return false;
    return true;
  });

  const porTipo = TIPO_OPCOES.map(t => ({ ...t, qtd: linhas.filter(l => l.tipo_doc === t.v).length, total: linhas.filter(l => l.tipo_doc === t.v).reduce((s, l) => s + (l.valor_total ?? 0), 0) }));

  return (
    <div style={{ minHeight: "100vh", background: "#F4F6FA", fontFamily: "system-ui, sans-serif", fontSize: 13 }}>
      <TopNav />
      <div style={{ maxWidth: 1500, margin: "0 auto", padding: "22px 20px" }}>

        <div style={{ background: "#FBF3E0", border: "0.5px solid #C9921B60", borderRadius: 10, padding: "10px 16px", marginBottom: 16, fontSize: 12, display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 16 }}>ℹ</span>
          <div style={{ color: "#7A5200" }}>
            CT-e ainda não tem modal nesta tela — continua em <strong>Fretes e Transporte → CT-e</strong>.
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 18, color: "#0B2D50" }}>Documentos Fiscais</h1>
            <p style={{ margin: "2px 0 0", fontSize: 11, color: "#888" }}>NF de Produtos e NF de Serviços juntos, ordenados por data</p>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={() => setModalNf({ id: null })} style={{ ...inp, background: "#0C447C", color: "#fff", fontWeight: 600, cursor: "pointer" }}>
              + Nova NF de Produtos
            </button>
            <button onClick={() => setModalNfs({ id: null })} style={{ ...inp, background: "#5B21B6", color: "#fff", fontWeight: 600, cursor: "pointer" }}>
              + Nova NF de Serviço
            </button>
          </div>
        </div>

        {/* ── Barra de filtros sempre visível ── */}
        <div style={{ background: "#fff", border: "0.5px solid #DDE2EE", borderRadius: 10, padding: "12px 14px", marginBottom: 14, display: "flex", flexWrap: "wrap", gap: 14, alignItems: "flex-end" }}>
          <div style={{ flex: "1 1 180px", minWidth: 160 }}>
            <label style={lblMini}>Buscar (número, participante, chave)</label>
            <input value={fBusca} onChange={e => setFBusca(e.target.value)} onKeyDown={e => e.key === "Enter" && carregar()} style={{ ...inp, width: "100%", boxSizing: "border-box" }} />
          </div>
          <div>
            <label style={lblMini}>Tipo</label>
            <div style={{ display: "flex", gap: 6 }}>
              {TIPO_OPCOES.map(t => <button key={t.v} onClick={() => toggle(fTipo, setFTipo, t.v)} style={chip(fTipo.has(t.v))}>{t.label}</button>)}
            </div>
          </div>
          <div>
            <label style={lblMini}>Status</label>
            <div style={{ display: "flex", gap: 6 }}>
              {STATUS_OPCOES.map(s => <button key={s.v} onClick={() => toggle(fStatus, setFStatus, s.v)} style={chip(fStatus.has(s.v))}>{s.label}</button>)}
            </div>
          </div>
          <div>
            <label style={lblMini}>Data de</label>
            <input type="date" value={fDataDe} onChange={e => setFDataDe(e.target.value)} style={inp} />
          </div>
          <div>
            <label style={lblMini}>até</label>
            <input type="date" value={fDataAte} onChange={e => setFDataAte(e.target.value)} style={inp} />
          </div>
          <button onClick={carregar} disabled={carregando} style={{ ...inp, background: "#2A2A2A", color: "#fff", fontWeight: 600, cursor: "pointer" }}>
            {carregando ? "Atualizando..." : "↻ Atualizar"}
          </button>
        </div>

        {erro && (
          <div style={{ background: "#FCEBEB", border: "0.5px solid #E24B4A60", borderRadius: 8, padding: "10px 14px", marginBottom: 14, color: "#791F1F" }}>
            {erro}
          </div>
        )}

        <div style={{ display: "flex", gap: 12, marginBottom: 14, flexWrap: "wrap" }}>
          {porTipo.map(t => (
            <div key={t.v} style={{ background: "#fff", border: "0.5px solid #DDE2EE", borderRadius: 10, padding: "8px 14px", flex: "1 1 160px" }}>
              <span style={{ fontSize: 10, fontWeight: 700, background: t.bg, color: t.color, padding: "2px 8px", borderRadius: 6 }}>{t.label}</span>
              <div style={{ fontSize: 16, fontWeight: 700, marginTop: 4 }}>{t.qtd}</div>
              <div style={{ fontSize: 11, color: "#888" }}>{fmtBRL(t.total)}</div>
            </div>
          ))}
        </div>

        {/* ── Barra de ações em lote — só quando há seleção ── */}
        {selecionados.size > 0 && (() => {
          const sel = linhas.filter(l => selecionados.has(l.id));
          const selPendentesNf = sel.filter(l => l.tipo_doc === "NF" && l.status_normalizado === "pendente");
          return (
            <div style={{ background: "#111111", borderRadius: 10, padding: "10px 18px", marginBottom: 12, display: "flex", alignItems: "center", gap: 14 }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: "#fff" }}>
                {sel.length} selecionada{sel.length > 1 ? "s" : ""}
              </span>
              <button
                onClick={() => {
                  if (!selPendentesNf.length) { alert("Nenhuma NF pendente selecionada para processar."); return; }
                  setModalLote(true);
                }}
                style={{ padding: "6px 16px", background: "#fff", color: "#111111", border: "none", borderRadius: 8, fontWeight: 700, fontSize: 12, cursor: "pointer" }}
              >
                ⚡ Processar em lote
              </button>
              <button
                onClick={() => {
                  const html = `
                    <html><head><title>Documentos Fiscais Selecionados</title><style>
                      body{font-family:Arial,sans-serif;font-size:11px;margin:20px}
                      table{width:100%;border-collapse:collapse;margin-bottom:16px}
                      th,td{padding:5px 8px;border:0.5px solid #ccc;text-align:left}
                      th{background:#f5f5f5;font-weight:600}
                      h2{margin:0 0 12px;font-size:14px}
                      .rodape{margin-top:20px;font-size:10px;color:#999}
                      @page{size:A4 landscape}
                    </style></head><body>
                    <h2>Documentos Fiscais — ${new Date().toLocaleDateString("pt-BR")}</h2>
                    <table><thead><tr>
                      <th>Tipo</th><th>Número</th><th>Série</th><th>Participante</th><th>Data</th><th>Valor</th><th>Status</th>
                    </tr></thead><tbody>
                    ${sel.map(n => `<tr>
                      <td>${n.tipo_doc}</td>
                      <td>${n.numero ?? "—"}</td>
                      <td>${n.serie ?? "—"}</td>
                      <td>${n.participante_nome ?? "—"}</td>
                      <td>${fmtData(n.data_doc)}</td>
                      <td>${fmtBRL(n.valor_total)}</td>
                      <td>${n.status_normalizado ?? "—"}</td>
                    </tr>`).join("")}
                    </tbody><tfoot><tr>
                      <td colspan="5" style="font-weight:600;text-align:right">Total (${sel.length}):</td>
                      <td style="font-weight:600">${fmtBRL(sel.reduce((s, n) => s + (n.valor_total ?? 0), 0))}</td>
                      <td></td>
                    </tr></tfoot></table>
                    <div class="rodape">Gerado em ${new Date().toLocaleString("pt-BR")}</div>
                    </body></html>`;
                  const win = window.open("", "_blank");
                  if (win) { win.document.write(html); win.document.close(); win.print(); }
                }}
                style={{ padding: "6px 16px", background: "transparent", color: "#fff", border: "0.5px solid rgba(255,255,255,0.5)", borderRadius: 8, fontWeight: 600, fontSize: 12, cursor: "pointer" }}
              >
                🖨 Imprimir
              </button>
              <button
                onClick={() => setSelecionados(new Set())}
                style={{ padding: "6px 12px", background: "transparent", color: "rgba(255,255,255,0.7)", border: "0.5px solid rgba(255,255,255,0.3)", borderRadius: 8, fontSize: 12, cursor: "pointer" }}
              >
                Limpar seleção
              </button>
            </div>
          );
        })()}

        <div style={{ background: "#fff", border: "0.5px solid #DDE2EE", borderRadius: 12, overflow: "hidden", overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: "#F4F6FA" }}>
                <th style={{ padding: "7px 10px", borderBottom: "0.5px solid #DDE2EE", width: 32 }}>
                  <input
                    type="checkbox"
                    checked={linhas.some(l => l.tipo_doc === "NF") && linhas.filter(l => l.tipo_doc === "NF").every(l => selecionados.has(l.id))}
                    onChange={e => {
                      const idsNf = linhas.filter(l => l.tipo_doc === "NF").map(l => l.id);
                      setSelecionados(e.target.checked ? new Set(idsNf) : new Set());
                    }}
                    style={{ cursor: "pointer" }}
                  />
                </th>
                {["Tipo", "Data", "Número", "Série", "Participante", "CNPJ", "CFOP", "Valor", "Status", "Observação"].map(h => (
                  <th key={h} style={{ padding: "7px 10px", textAlign: "left", fontSize: 10, fontWeight: 700, color: "#555", borderBottom: "0.5px solid #DDE2EE", whiteSpace: "nowrap" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {carregando && (
                <tr><td colSpan={11} style={{ padding: 32, textAlign: "center", color: "#888" }}>Carregando...</td></tr>
              )}
              {!carregando && linhas.map(d => {
                const tm = TIPO_OPCOES.find(t => t.v === d.tipo_doc);
                const sm = STATUS_OPCOES.find(s => s.v === d.status_normalizado);
                const clicavel = d.tipo_doc === "NFS" || d.tipo_doc === "NF";
                const abrir = () => {
                  if (d.tipo_doc === "NFS") setModalNfs({ id: d.id });
                  else if (d.tipo_doc === "NF") setModalNf({ id: d.id });
                };
                return (
                  <tr key={d.id}
                    style={{ borderBottom: "0.5px solid #F0F2F7", background: selecionados.has(d.id) ? "#F2F2F2" : undefined }}>
                    <td style={{ padding: "7px 10px" }} onClick={e => e.stopPropagation()}>
                      {d.tipo_doc === "NF" && (
                        <input
                          type="checkbox"
                          checked={selecionados.has(d.id)}
                          onChange={e => {
                            setSelecionados(prev => {
                              const next = new Set(prev);
                              e.target.checked ? next.add(d.id) : next.delete(d.id);
                              return next;
                            });
                          }}
                          style={{ cursor: "pointer" }}
                        />
                      )}
                    </td>
                    <td style={{ padding: "7px 10px", cursor: clicavel ? "pointer" : "default" }}
                      onClick={() => clicavel && abrir()}
                      title={clicavel ? "Abrir documento" : "CT-e ainda não tem modal nesta tela — use Fretes e Transporte → CT-e"}>
                      <span style={{ fontSize: 10, fontWeight: 700, background: tm?.bg ?? "#eee", color: tm?.color ?? "#555", padding: "2px 8px", borderRadius: 6 }}>{tm?.label ?? d.tipo_doc}</span>
                    </td>
                    <td style={{ padding: "7px 10px", whiteSpace: "nowrap", cursor: clicavel ? "pointer" : "default" }} onClick={() => clicavel && abrir()}>{fmtData(d.data_doc)}</td>
                    <td style={{ padding: "7px 10px", cursor: clicavel ? "pointer" : "default" }} onClick={() => clicavel && abrir()}>{d.numero ?? "—"}</td>
                    <td style={{ padding: "7px 10px", cursor: clicavel ? "pointer" : "default" }} onClick={() => clicavel && abrir()}>{d.serie ?? "—"}</td>
                    <td style={{ padding: "7px 10px", cursor: clicavel ? "pointer" : "default" }} onClick={() => clicavel && abrir()}>{d.participante_nome ?? "—"}</td>
                    <td style={{ padding: "7px 10px", color: "#888", fontFamily: "monospace", cursor: clicavel ? "pointer" : "default" }} onClick={() => clicavel && abrir()}>{d.participante_cnpj ?? "—"}</td>
                    <td style={{ padding: "7px 10px", color: "#888", cursor: clicavel ? "pointer" : "default" }} onClick={() => clicavel && abrir()}>{d.cfop ?? "—"}</td>
                    <td style={{ padding: "7px 10px", textAlign: "right", fontWeight: 600, cursor: clicavel ? "pointer" : "default" }} onClick={() => clicavel && abrir()}>{fmtBRL(d.valor_total)}</td>
                    <td style={{ padding: "7px 10px", cursor: clicavel ? "pointer" : "default" }} onClick={() => clicavel && abrir()}>
                      <span style={{ fontSize: 10, fontWeight: 700, background: sm?.bg ?? "#eee", color: sm?.color ?? "#555", padding: "2px 8px", borderRadius: 8 }}>{sm?.label ?? d.status_normalizado}</span>
                    </td>
                    <td style={{ padding: "7px 10px", color: "#888", maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", cursor: clicavel ? "pointer" : "default" }} onClick={() => clicavel && abrir()} title={d.observacao ?? undefined}>{d.observacao ?? d.natureza_operacao ?? "—"}</td>
                  </tr>
                );
              })}
              {!carregando && linhas.length === 0 && (
                <tr><td colSpan={11} style={{ padding: 32, textAlign: "center", color: "#888" }}>Nenhum documento encontrado para esse filtro.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {modalLote && (
        <ModalProcessarLote
          nfs={linhas.filter(l => l.tipo_doc === "NF" && l.status_normalizado === "pendente" && selecionados.has(l.id)).map(l => ({ id: l.id, fazenda_id: l.fazenda_id, numero: l.numero }))}
          onClose={() => setModalLote(false)}
          onSaved={() => { carregar(); setSelecionados(new Set()); }}
        />
      )}

      {modalNfs && fazendaId && (
        <ModalNfServico
          id={modalNfs.id}
          fazendaIdPadrao={fazendaId}
          onClose={() => setModalNfs(null)}
          onSaved={carregar}
        />
      )}

      {modalNf && fazendaId && (
        <ModalNf
          id={modalNf.id}
          onClose={() => setModalNf(null)}
          onSaved={carregar}
        />
      )}
    </div>
  );
}
