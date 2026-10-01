"use client";
// ═══════════════════════════════════════════════════════════════════════════
// PILOTO — Fase 1 da unificação de NF de Produtos + NF de Serviços + CT-e
// numa tela só (Seção 321 da migration), pedido do dono 01/10/2026.
//
// Esta é a validação da listagem unificada (lê rel_documentos_fiscais,
// trigger-sync das 3 tabelas) — ordenada por data, filtro por tipo.
//
// Fase 2 (em andamento): o processamento de cada tipo entra como MODAL
// dentro desta mesma tela, sem redirecionar — "tudo acontece na tela de
// Documentos Fiscais" (instrução do dono). Núcleo ligado até aqui:
//   NF de Serviço — ModalNfServico, extraído de app/compras/nf-servico/page.tsx
//   NF de Produtos — ModalNf, extraído (núcleo: wizard+salvar/processar/
//     excluir/estornar — devolução, remessa logística, reclassificação e
//     ações em lote NÃO migradas, continuam só em app/compras/nf/page.tsx)
// Ambas as páginas originais continuam existindo e funcionando sozinhas,
// intocadas. CT-e (deixado de fora por decisão do dono) continua só na
// tela própria (app/transporte/cte) — sem modal unificado por enquanto.
//
// Essa tela é só pra validar o padrão em localhost — fora do menu (TopNav),
// ninguém chega nela sem digitar a URL direto.
// ═══════════════════════════════════════════════════════════════════════════
import { useState, useEffect } from "react";
import { useAuth } from "../../../components/AuthProvider";
import { supabase } from "../../../lib/supabase";
import TopNav from "../../../components/TopNav";
import ModalNfServico from "../../../components/fiscal/ModalNfServico";
import ModalNf from "../../../components/fiscal/ModalNf";

type RelDocFiscal = {
  id: string;
  origem_tabela: string;
  tipo_doc: "NF" | "NFS" | "CTE";
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

export default function DocumentosFiscaisRelPilotoPage() {
  const { fazendaId, fazendaIds, contaId } = useAuth();

  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");
  const [resultado, setResultado] = useState<RelDocFiscal[] | null>(null);
  const [tempoMs, setTempoMs] = useState<number | null>(null);

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
    const t0 = performance.now();
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
      setTempoMs(Math.round(performance.now() - t0));
    } catch (e: unknown) {
      setErro(e instanceof Error ? e.message : "Erro ao consultar rel_documentos_fiscais — a migration da Seção 321 já foi rodada no Supabase?");
    } finally {
      setCarregando(false);
    }
  }

  useEffect(() => { carregar(); }, [fazendaId, fazendaIds?.join(","), contaId]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Modais por tipo ligados nesta fase ──
  const [modalNfs, setModalNfs] = useState<{ id: string | null } | null>(null);
  const [modalNf,  setModalNf]  = useState<{ id: string | null } | null>(null);

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

        <div style={{ background: "#111111", color: "#fff", borderRadius: 10, padding: "10px 16px", marginBottom: 16, fontSize: 12, display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 16 }}>🧪</span>
          <div>
            <strong>Piloto — Fase 1: tabela de leitura rel_documentos_fiscais</strong>
            <div style={{ color: "#bbb", marginTop: 2 }}>Tela fora do menu, só pra validação local. NF de Produtos + NF de Serviços + CT-e juntos, lidos direto da tabela sincronizada por trigger. Não toca em nenhuma das 3 telas reais.</div>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
          <h1 style={{ margin: 0, fontSize: 18, color: "#0B2D50" }}>Documentos Fiscais — piloto (query em tabela)</h1>
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
          <div style={{ background: "#111111", color: "#fff", borderRadius: 10, padding: "8px 14px", flex: "1 1 160px" }}>
            <span style={{ fontSize: 10, color: "#bbb" }}>Consulta</span>
            <div style={{ fontSize: 16, fontWeight: 700, marginTop: 4, color: "#16A34A" }}>{tempoMs}ms</div>
            <div style={{ fontSize: 11, color: "#bbb" }}>direto na tabela, sem join</div>
          </div>
        </div>

        <div style={{ background: "#fff", border: "0.5px solid #DDE2EE", borderRadius: 12, overflow: "hidden", overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: "#F4F6FA" }}>
                {["Tipo", "Data", "Número", "Série", "Participante", "CNPJ", "CFOP", "Valor", "Status", "Observação"].map(h => (
                  <th key={h} style={{ padding: "7px 10px", textAlign: "left", fontSize: 10, fontWeight: 700, color: "#555", borderBottom: "0.5px solid #DDE2EE", whiteSpace: "nowrap" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {carregando && (
                <tr><td colSpan={10} style={{ padding: 32, textAlign: "center", color: "#888" }}>Carregando...</td></tr>
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
                  <tr key={d.id} onClick={() => clicavel && abrir()}
                    style={{ borderBottom: "0.5px solid #F0F2F7", cursor: clicavel ? "pointer" : "default" }}
                    title={clicavel ? "Abrir documento" : "Processamento deste tipo ainda não ligado nesta fase"}>
                    <td style={{ padding: "7px 10px" }}>
                      <span style={{ fontSize: 10, fontWeight: 700, background: tm?.bg ?? "#eee", color: tm?.color ?? "#555", padding: "2px 8px", borderRadius: 6 }}>{tm?.label ?? d.tipo_doc}</span>
                    </td>
                    <td style={{ padding: "7px 10px", whiteSpace: "nowrap" }}>{fmtData(d.data_doc)}</td>
                    <td style={{ padding: "7px 10px" }}>{d.numero ?? "—"}</td>
                    <td style={{ padding: "7px 10px" }}>{d.serie ?? "—"}</td>
                    <td style={{ padding: "7px 10px" }}>{d.participante_nome ?? "—"}</td>
                    <td style={{ padding: "7px 10px", color: "#888", fontFamily: "monospace" }}>{d.participante_cnpj ?? "—"}</td>
                    <td style={{ padding: "7px 10px", color: "#888" }}>{d.cfop ?? "—"}</td>
                    <td style={{ padding: "7px 10px", textAlign: "right", fontWeight: 600 }}>{fmtBRL(d.valor_total)}</td>
                    <td style={{ padding: "7px 10px" }}>
                      <span style={{ fontSize: 10, fontWeight: 700, background: sm?.bg ?? "#eee", color: sm?.color ?? "#555", padding: "2px 8px", borderRadius: 8 }}>{sm?.label ?? d.status_normalizado}</span>
                    </td>
                    <td style={{ padding: "7px 10px", color: "#888", maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={d.observacao ?? undefined}>{d.observacao ?? d.natureza_operacao ?? "—"}</td>
                  </tr>
                );
              })}
              {!carregando && linhas.length === 0 && (
                <tr><td colSpan={10} style={{ padding: 32, textAlign: "center", color: "#888" }}>Nenhum documento encontrado para esse filtro.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

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
