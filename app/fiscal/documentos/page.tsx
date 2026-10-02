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
  // Seção 322 — só populado pra NF de Produtos (nf_entradas); NFS/CT-e ficam null
  destinatario_nome: string | null;
  destinatario_cnpj: string | null;
  data_entrada: string | null;
  tipo_entrada: string | null;
  origem_doc: string | null;
  duplicatas_xml: { numero: string; data_vencimento: string; valor: number }[] | null;
  processado_por: string | null;
};

const TIPO_ENTRADA_META: Record<string, { bg: string; cl: string; label: string }> = {
  consumo:          { bg: "#F3E8FF", cl: "#6B21A8", label: "Consumo"       },
  insumos:          { bg: "#E8E8E8", cl: "#0D0D0D", label: "Insumos"       },
  combustivel:      { bg: "#FFF0E0", cl: "#7C3A00", label: "Combustível"   },
  pecas:            { bg: "#E0F0FF", cl: "#0A4B8C", label: "Peças / Manut." },
  custo_direto:     { bg: "#E8F5E9", cl: "#1A6B3C", label: "Aprop. Direta" },
  vef:              { bg: "#FAEEDA", cl: "#633806", label: "VEF"            },
  remessa:          { bg: "#E6F1FB", cl: "#0C447C", label: "Remessa"        },
  devolucao_compra: { bg: "#FCEBEB", cl: "#791F1F", label: "Devolução"      },
};
const ORIGEM_DOC_META: Record<string, string> = { manual: "Manual", xml: "XML", sieg: "Sieg", leitor: "Leitor" };

// Detalhe real da NF — buscado sob demanda (lazy, só ao abrir o "⋮" de uma
// linha), porque rel_documentos_fiscais (Seção 321) não carrega esses campos
// específicos de nf_entradas (seriam só pra 1/3 dos tipos de documento).
type NfDetalhe = {
  id: string;
  status: string;
  tipo_entrada: string | null;
  origem: string | null;
  cnpj_destino: string | null;
  chave_acesso: string | null;
  manifestacao_tipo: number | null;
};

const MAN_CFG = [
  { tipo: 0, label: "Ciência",       cor: "#444444", bg: "#F2F2F2", status: "ciencia",        justObrig: false },
  { tipo: 1, label: "Confirmar",     cor: "#16A34A", bg: "#DCFCE7", status: "confirmada",      justObrig: false },
  { tipo: 2, label: "Desconhecer",   cor: "#C9921B", bg: "#FBF3E0", status: "desconhecimento", justObrig: true  },
  { tipo: 3, label: "Não Realizada", cor: "#E24B4A", bg: "#FFF0F0", status: "nao_realizada",   justObrig: true  },
] as const;
type ManStatus = "pendente" | "ciencia" | "confirmada" | "desconhecimento" | "nao_realizada";
const MAN_ST: Record<ManStatus, { label: string; short: string; cor: string; bg: string }> = {
  pendente:        { label: "Pendente",        short: "Pend.", cor: "#888",    bg: "#F3F4F6" },
  ciencia:         { label: "Ciência",         short: "Ci.",   cor: "#444444", bg: "#F2F2F2" },
  confirmada:      { label: "Confirmada",      short: "Conf.", cor: "#16A34A", bg: "#DCFCE7" },
  desconhecimento: { label: "Desconhecimento", short: "Desc.", cor: "#C9921B", bg: "#FBF3E0" },
  nao_realizada:   { label: "Não Realizada",   short: "N.R.",  cor: "#E24B4A", bg: "#FFF0F0" },
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
  const [modalNfs, setModalNfs] = useState<{ id: string | null; viewOnly?: boolean } | null>(null);
  const [modalNf,  setModalNf]  = useState<{ id: string | null; acaoInicial?: "devolver" | "estornar" } | null>(null);

  // ── Ações em lote — seleção restrita a linhas de tipo NF (a única com
  // processamento em lote implementado; NFS/CT-e nunca tiveram essa ação) ──
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());
  const [modalLote, setModalLote] = useState(false);

  // ── "⋮" de ações por linha (Processar/Estornar/Devolver/Manifestar) —
  // o detalhe real da NF é buscado sob demanda, só quando o dropdown é
  // aberto, pra não disparar 1 query por linha renderizada ──
  const [acaoDropdown, setAcaoDropdown] = useState<string | null>(null);
  const [acaoDetalhe,  setAcaoDetalhe]  = useState<Record<string, NfDetalhe>>({});
  const [acaoCarregando, setAcaoCarregando] = useState<string | null>(null);

  async function abrirAcaoDropdown(d: RelDocFiscal) {
    if (acaoDropdown === d.id) { setAcaoDropdown(null); return; }
    setAcaoDropdown(d.id);
    if (!acaoDetalhe[d.id]) {
      setAcaoCarregando(d.id);
      const { data } = await supabase.from("nf_entradas")
        .select("id, status, tipo_entrada, origem, cnpj_destino, chave_acesso, manifestacao_tipo")
        .eq("id", d.id).maybeSingle();
      if (data) setAcaoDetalhe(prev => ({ ...prev, [d.id]: data as NfDetalhe }));
      setAcaoCarregando(null);
    }
  }

  async function estornarNfGrid(d: RelDocFiscal) {
    const ok = confirm(
      `Estornar NF ${d.numero}?\n\n` +
      `Isso irá:\n• Reverter todo o estoque creditado por esta NF\n• Cancelar o lançamento financeiro (CP) associado\n• Retornar a NF para "Rascunho" para reprocessamento\n\n` +
      `Use isto se o estoque ficou duplicado ou incorreto.`
    );
    if (!ok) return;
    try {
      const res = await fetch("/api/compras/estornar-nf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nf_id: d.id }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error((json as { error?: string }).error ?? `Erro HTTP ${res.status}`);
      }
      alert(`NF ${d.numero} estornada. O estoque foi revertido. Reabra a NF para corrigir os itens e reprocessar.`);
      carregar();
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : "Erro ao estornar NF");
    }
  }

  // ── Manifestação SIEG — inline, fora do modal (nunca foi parte do wizard
  // na tela antiga; é um controle só de grid, por isso fica aqui direto) ──
  const [manDropdown, setManDropdown] = useState<string | null>(null);
  const [siegBusy,  setSiegBusy]  = useState<Record<string, boolean>>({});
  const [siegErros, setSiegErros] = useState<Record<string, string>>({});
  const [siegJustModal, setSiegJustModal] = useState<{ d: RelDocFiscal; tipo: number } | null>(null);
  const [siegJustText,  setSiegJustText]  = useState("");

  async function executarManifestacao(d: RelDocFiscal, nf: NfDetalhe, tipo: number, justificativa?: string) {
    setSiegBusy(p => ({ ...p, [d.id]: true }));
    setSiegErros(p => { const n = { ...p }; delete n[d.id]; return n; });
    try {
      const res = await fetch("/api/integracoes/sieg-manifestar", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fazenda_id: d.fazenda_id, nf_id: d.id, chave_acesso: nf.chave_acesso, cnpj_destinatario: nf.cnpj_destino, tipo, justificativa }),
      });
      const j = await res.json() as Record<string, unknown>;
      if (j.erro) {
        setSiegErros(p => ({ ...p, [d.id]: String(j.erro) }));
      } else {
        setAcaoDetalhe(prev => ({ ...prev, [d.id]: { ...nf, manifestacao_tipo: tipo } }));
      }
    } catch (e) { setSiegErros(p => ({ ...p, [d.id]: String(e) })); }
    finally { setSiegBusy(p => ({ ...p, [d.id]: false })); }
  }

  function manifestar(d: RelDocFiscal, nf: NfDetalhe, tipo: number) {
    if (!nf.cnpj_destino) { setSiegErros(p => ({ ...p, [d.id]: "NF sem CNPJ de destinatário — manifeste pela tela antiga (/compras/nf)." })); return; }
    const m = MAN_CFG.find(x => x.tipo === tipo)!;
    if (m.justObrig) { setSiegJustModal({ d, tipo }); setSiegJustText(""); return; }
    executarManifestacao(d, nf, tipo);
  }

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

        <div style={{ background: "#fff", border: "0.5px solid #DDE2EE", borderRadius: 12, overflow: "auto", maxHeight: "calc(100vh - 420px)" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed" }}>
            <colgroup>
              <col style={{ width: 32 }} />    {/* checkbox */}
              <col style={{ width: 90 }} />    {/* Tipo */}
              <col style={{ width: 76 }} />    {/* Emissão */}
              <col style={{ width: 78 }} />    {/* Número */}
              <col style={{ width: 46 }} />    {/* Série */}
              <col style={{ width: "13%" }} /> {/* Emitente — flex */}
              <col style={{ width: 104 }} />   {/* CNPJ emitente */}
              <col style={{ width: "13%" }} /> {/* Destinatário — flex */}
              <col style={{ width: 56 }} />    {/* CFOP */}
              <col style={{ width: 76 }} />    {/* Entrada */}
              <col style={{ width: 96 }} />    {/* Tipo (entrada) */}
              <col style={{ width: 64 }} />    {/* Origem */}
              <col style={{ width: "11%" }} /> {/* Operação NF — flex */}
              <col style={{ width: 96 }} />    {/* Parcelamento */}
              <col style={{ width: 104 }} />   {/* Valor */}
              <col style={{ width: 80 }} />    {/* Status */}
              <col style={{ width: 90 }} />    {/* Processado por */}
              <col style={{ width: "9%" }} />  {/* Observação — flex */}
              <col style={{ width: 230 }} />   {/* Ações */}
            </colgroup>
            <thead>
              <tr style={{ background: "#F4F6FA", position: "sticky", top: 0, zIndex: 1 }}>
                <th style={{ padding: "7px 10px", borderBottom: "0.5px solid #DDE2EE", background: "#F4F6FA" }}>
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
                {["Tipo", "Emissão", "Número", "Série", "Emitente", "CNPJ", "Destinatário", "CFOP", "Entrada", "Tipo", "Origem", "Operação NF", "Parcelamento", "Valor", "Status", "Processado por", "Observação"].map(h => (
                  <th key={h} style={{ padding: "7px 10px", textAlign: "left", fontSize: 10, fontWeight: 700, color: "#555", borderBottom: "0.5px solid #DDE2EE", whiteSpace: "nowrap", background: "#F4F6FA" }}>{h}</th>
                ))}
                <th style={{ padding: "7px 10px", textAlign: "right", fontSize: 10, fontWeight: 700, color: "#555", borderBottom: "0.5px solid #DDE2EE", whiteSpace: "nowrap", background: "#F4F6FA" }}>Ações</th>
              </tr>
            </thead>
            <tbody>
              {carregando && (
                <tr><td colSpan={19} style={{ padding: 32, textAlign: "center", color: "#888" }}>Carregando...</td></tr>
              )}
              {!carregando && linhas.map(d => {
                const tm = TIPO_OPCOES.find(t => t.v === d.tipo_doc);
                const sm = STATUS_OPCOES.find(s => s.v === d.status_normalizado);
                const clicavel = d.tipo_doc === "NFS" || d.tipo_doc === "NF";
                const abrir = () => {
                  if (d.tipo_doc === "NFS") setModalNfs({ id: d.id, viewOnly: d.status_normalizado === "processada" });
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
                    <td style={{ padding: "7px 10px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", cursor: clicavel ? "pointer" : "default" }} onClick={() => clicavel && abrir()}>{d.numero ?? "—"}</td>
                    <td style={{ padding: "7px 10px", cursor: clicavel ? "pointer" : "default" }} onClick={() => clicavel && abrir()}>{d.serie ?? "—"}</td>
                    <td style={{ padding: "7px 10px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", cursor: clicavel ? "pointer" : "default" }} onClick={() => clicavel && abrir()} title={d.participante_nome ?? undefined}>{d.participante_nome ?? "—"}</td>
                    <td style={{ padding: "7px 10px", color: "#888", fontFamily: "monospace", fontSize: 11, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", cursor: clicavel ? "pointer" : "default" }} onClick={() => clicavel && abrir()} title={d.participante_cnpj ?? undefined}>{d.participante_cnpj ?? "—"}</td>
                    <td style={{ padding: "7px 10px", fontSize: 11, overflow: "hidden", cursor: clicavel ? "pointer" : "default" }} onClick={() => clicavel && abrir()}>
                      {d.destinatario_nome
                        ? <>
                            <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{d.destinatario_nome}</div>
                            {d.destinatario_cnpj && <div style={{ fontSize: 10, color: "#888", fontFamily: "monospace" }}>{d.destinatario_cnpj}</div>}
                          </>
                        : <span style={{ color: "#888" }}>—</span>}
                    </td>
                    <td style={{ padding: "7px 10px", color: "#888", cursor: clicavel ? "pointer" : "default" }} onClick={() => clicavel && abrir()}>{d.cfop ?? "—"}</td>
                    <td style={{ padding: "7px 10px", color: "#888", fontSize: 11, cursor: clicavel ? "pointer" : "default" }} onClick={() => clicavel && abrir()}>{fmtData(d.data_entrada)}</td>
                    <td style={{ padding: "7px 10px", cursor: clicavel ? "pointer" : "default" }} onClick={() => clicavel && abrir()}>
                      {d.tipo_entrada
                        ? (() => { const tem = TIPO_ENTRADA_META[d.tipo_entrada]; return <span style={{ fontSize: 10, fontWeight: 700, background: tem?.bg ?? "#eee", color: tem?.cl ?? "#555", padding: "2px 7px", borderRadius: 6 }}>{tem?.label ?? d.tipo_entrada}</span>; })()
                        : <span style={{ color: "#888", fontSize: 11 }}>—</span>}
                    </td>
                    <td style={{ padding: "7px 10px", cursor: clicavel ? "pointer" : "default" }} onClick={() => clicavel && abrir()}>
                      {d.origem_doc
                        ? <span style={{ fontSize: 10, fontWeight: 700, background: "#F4F6FA", color: "#555", padding: "2px 7px", borderRadius: 6, border: "0.5px solid #DDE2EE" }}>{ORIGEM_DOC_META[d.origem_doc] ?? d.origem_doc}</span>
                        : <span style={{ color: "#888", fontSize: 11 }}>—</span>}
                    </td>
                    <td style={{ padding: "7px 10px", color: "#888", fontSize: 11, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", cursor: clicavel ? "pointer" : "default" }} onClick={() => clicavel && abrir()} title={d.natureza_operacao ?? undefined}>{d.natureza_operacao ?? "—"}</td>
                    <td style={{ padding: "7px 10px", cursor: clicavel ? "pointer" : "default" }} onClick={() => clicavel && abrir()}>
                      {(() => {
                        const dups = d.duplicatas_xml ?? [];
                        if (dups.length === 0) return <span style={{ fontSize: 11, color: "#888" }}>à vista</span>;
                        if (dups.length === 1) return <span style={{ fontSize: 11, color: "#7B4A00" }}>à prazo</span>;
                        return (
                          <div title={dups.map(dp => `${dp.numero || "—"}: ${fmtBRL(dp.valor)} em ${fmtData(dp.data_vencimento)}`).join("\n")}>
                            <span style={{ fontSize: 10, fontWeight: 700, background: "#EDF4FB", color: "#0B3A6B", padding: "2px 7px", borderRadius: 6 }}>{dups.length}x</span>
                          </div>
                        );
                      })()}
                    </td>
                    <td style={{ padding: "7px 10px", textAlign: "right", fontWeight: 600, cursor: clicavel ? "pointer" : "default" }} onClick={() => clicavel && abrir()}>{fmtBRL(d.valor_total)}</td>
                    <td style={{ padding: "7px 10px", cursor: clicavel ? "pointer" : "default" }} onClick={() => clicavel && abrir()}>
                      <span style={{ fontSize: 10, fontWeight: 700, background: sm?.bg ?? "#eee", color: sm?.color ?? "#555", padding: "2px 8px", borderRadius: 8 }}>{sm?.label ?? d.status_normalizado}</span>
                    </td>
                    <td style={{ padding: "7px 10px", color: "#888", fontSize: 11, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", cursor: clicavel ? "pointer" : "default" }} onClick={() => clicavel && abrir()}>{d.processado_por ?? "—"}</td>
                    <td style={{ padding: "7px 10px", color: "#888", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", cursor: clicavel ? "pointer" : "default" }} onClick={() => clicavel && abrir()} title={d.observacao ?? undefined}>{d.observacao ?? "—"}</td>
                    <td style={{ padding: "7px 10px", textAlign: "right" }} onClick={e => e.stopPropagation()}>
                      {d.tipo_doc === "NF" && (() => {
                        const nf = acaoDetalhe[d.id];
                        const carregandoDetalhe = acaoCarregando === d.id;
                        const aberto = acaoDropdown === d.id;
                        const pendente = d.status_normalizado === "pendente";
                        const processada = d.status_normalizado === "processada";
                        return (
                          <div style={{ display: "flex", gap: 5, justifyContent: "flex-end", alignItems: "center", flexWrap: "nowrap" }}>
                            {/* Processar — direto, sem precisar abrir o "⋮" (só precisa do status, já vem no row) */}
                            {pendente && (
                              <button onClick={() => setModalNf({ id: d.id })}
                                style={{ padding: "3px 8px", border: "none", borderRadius: 6, background: "#1A5C38", color: "#fff", fontWeight: 700, fontSize: 10, cursor: "pointer", whiteSpace: "nowrap" }}>
                                Processar
                              </button>
                            )}
                            {/* DANFE — direto, sem precisar abrir o "⋮" (chave já vem no row) */}
                            {processada && d.chave && (
                              <a href={`/api/fiscal/danfe?chave=${d.chave}&fazenda_id=${d.fazenda_id ?? ""}`}
                                target="_blank" rel="noopener noreferrer"
                                style={{ padding: "3px 7px", border: "0.5px solid #86EFAC", borderRadius: 6, background: "#F0FDF4", color: "#15803D", fontWeight: 700, fontSize: 10, textDecoration: "none", whiteSpace: "nowrap" }}>
                                ↗ DANFE
                              </a>
                            )}
                            {/* Manifestação SIEG — só aparece depois do detalhe carregado e só pra NFs de origem SIEG */}
                            {nf?.origem === "sieg" && (() => {
                              const isBusy = siegBusy[d.id];
                              const manTipo = nf.manifestacao_tipo ?? null;
                              const manSt = manTipo !== null ? (MAN_CFG.find(m => m.tipo === manTipo)?.status ?? "pendente") : "pendente";
                              const stCfg = MAN_ST[manSt as ManStatus] ?? MAN_ST.pendente;
                              const manAberto = manDropdown === d.id;
                              return (
                                <div style={{ position: "relative" }}>
                                  <button
                                    disabled={isBusy}
                                    onClick={() => setManDropdown(manAberto ? null : d.id)}
                                    style={{ padding: "2px 6px", border: `0.5px solid ${stCfg.cor}60`, borderRadius: 6, background: stCfg.bg, color: stCfg.cor, fontWeight: 700, fontSize: 10, cursor: isBusy ? "default" : "pointer", whiteSpace: "nowrap", display: "flex", alignItems: "center", gap: 3 }}>
                                    {isBusy ? "⏳" : stCfg.short} {!isBusy && "▾"}
                                  </button>
                                  {manAberto && (
                                    <div style={{ position: "absolute", right: 0, top: "calc(100% + 4px)", background: "#fff", border: "0.5px solid #DDE2EE", borderRadius: 8, boxShadow: "0 4px 16px rgba(0,0,0,0.12)", zIndex: 400, minWidth: 150, overflow: "hidden" }}>
                                      {MAN_CFG.map(m => (
                                        <button key={m.tipo}
                                          onClick={() => { setManDropdown(null); manifestar(d, nf, m.tipo); }}
                                          style={{ display: "block", width: "100%", padding: "7px 12px", border: "none", background: m.tipo === manTipo ? m.bg : "transparent", color: m.cor, fontWeight: m.tipo === manTipo ? 700 : 600, fontSize: 11, cursor: "pointer", textAlign: "left" }}>
                                          {m.tipo === manTipo ? "✓ " : ""}{m.label}
                                        </button>
                                      ))}
                                    </div>
                                  )}
                                  {siegErros[d.id] && <div style={{ position: "absolute", right: 0, top: "100%", fontSize: 9, color: "#E24B4A", background: "#fff", border: "0.5px solid #F5C6C6", borderRadius: 6, padding: "3px 6px", whiteSpace: "nowrap", zIndex: 400 }}>{siegErros[d.id]}</div>}
                                </div>
                              );
                            })()}
                            <div style={{ position: "relative" }}>
                              <button
                                onClick={() => abrirAcaoDropdown(d)}
                                style={{ padding: "3px 7px", border: "0.5px solid #DDE2EE", borderRadius: 6, background: aberto ? "#F4F6FA" : "transparent", cursor: "pointer", fontSize: 13, color: "#555", fontWeight: 700, lineHeight: 1 }}>
                                ⋮
                              </button>
                              {aberto && (
                                <div style={{ position: "absolute", right: 0, top: "calc(100% + 4px)", background: "#fff", border: "0.5px solid #DDE2EE", borderRadius: 8, boxShadow: "0 4px 16px rgba(0,0,0,0.12)", zIndex: 300, minWidth: 180, overflow: "hidden" }}>
                                  {carregandoDetalhe && (
                                    <div style={{ padding: "10px 12px", fontSize: 11, color: "#888" }}>Carregando…</div>
                                  )}
                                  {!carregandoDetalhe && nf && (
                                    <>
                                      {nf.status === "processada" && (
                                        <button onClick={() => { setAcaoDropdown(null); setModalNf({ id: d.id }); }}
                                          style={{ display: "block", width: "100%", padding: "7px 12px", border: "none", background: "transparent", cursor: "pointer", fontSize: 12, color: "#1A4870", fontWeight: 600, textAlign: "left" }}>
                                          Abrir (somente leitura)
                                        </button>
                                      )}
                                      {nf.status === "processada" && nf.tipo_entrada === "insumos" && (
                                        <button onClick={() => { setAcaoDropdown(null); setModalNf({ id: d.id, acaoInicial: "devolver" }); }}
                                          style={{ display: "block", width: "100%", padding: "7px 12px", border: "none", background: "transparent", cursor: "pointer", fontSize: 12, color: "#791F1F", fontWeight: 600, textAlign: "left" }}>
                                          ↩ Devolver (nota de devolução)
                                        </button>
                                      )}
                                      {nf.status === "processada" && (
                                        <button onClick={() => { setAcaoDropdown(null); estornarNfGrid(d); }}
                                          style={{ display: "block", width: "100%", padding: "7px 12px", border: "none", background: "transparent", cursor: "pointer", fontSize: 12, color: "#8A4A00", fontWeight: 600, textAlign: "left" }}>
                                          ↺ Estornar
                                        </button>
                                      )}
                                      {nf.status === "pendente" && (
                                        <button onClick={() => { setAcaoDropdown(null); setModalNf({ id: d.id }); }}
                                          style={{ display: "block", width: "100%", padding: "7px 12px", border: "none", background: "transparent", cursor: "pointer", fontSize: 12, color: "#1A4870", fontWeight: 600, textAlign: "left" }}>
                                          Editar NF
                                        </button>
                                      )}
                                      {nf.status !== "pendente" && nf.status !== "processada" && (
                                        <div style={{ padding: "8px 12px", fontSize: 11, color: "#888" }}>Sem ações para o status atual.</div>
                                      )}
                                    </>
                                  )}
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })()}
                    </td>
                  </tr>
                );
              })}
              {!carregando && linhas.length === 0 && (
                <tr><td colSpan={19} style={{ padding: 32, textAlign: "center", color: "#888" }}>Nenhum documento encontrado para esse filtro.</td></tr>
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
          viewOnlyInicial={modalNfs.viewOnly}
          onClose={() => setModalNfs(null)}
          onSaved={carregar}
        />
      )}

      {modalNf && fazendaId && (
        <ModalNf
          id={modalNf.id}
          acaoInicial={modalNf.acaoInicial}
          onClose={() => setModalNf(null)}
          onSaved={carregar}
        />
      )}

      {/* ── Justificativa obrigatória pra Desconhecer/Não Realizada (manifestação SIEG) ── */}
      {siegJustModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 2200 }}>
          <div style={{ background: "#fff", borderRadius: 14, width: "100%", maxWidth: 420, margin: "0 20px", padding: 22 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: "#0B2D50", marginBottom: 4 }}>
              {MAN_CFG.find(m => m.tipo === siegJustModal.tipo)?.label} — Justificativa
            </div>
            <div style={{ fontSize: 12, color: "#888", marginBottom: 14 }}>
              NF {siegJustModal.d.numero}/{siegJustModal.d.serie} — mínimo 15 caracteres, exigido pela SEFAZ.
            </div>
            <textarea value={siegJustText} onChange={e => setSiegJustText(e.target.value)} rows={3}
              style={{ width: "100%", padding: "8px 10px", border: "0.5px solid #DDE2EE", borderRadius: 8, fontSize: 13, boxSizing: "border-box", resize: "vertical" }} />
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 14 }}>
              <button onClick={() => setSiegJustModal(null)} style={{ ...inp, cursor: "pointer" }}>Cancelar</button>
              <button
                disabled={siegJustText.trim().length < 15}
                onClick={async () => {
                  const { d, tipo } = siegJustModal;
                  const nf = acaoDetalhe[d.id];
                  setSiegJustModal(null);
                  if (nf) await executarManifestacao(d, nf, tipo, siegJustText);
                }}
                style={{ ...inp, background: siegJustText.trim().length < 15 ? "#ccc" : "#2A2A2A", color: "#fff", fontWeight: 600, cursor: siegJustText.trim().length < 15 ? "default" : "pointer" }}
              >
                Confirmar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
