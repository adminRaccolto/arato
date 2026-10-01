"use client";
// ═══════════════════════════════════════════════════════════════════════════
// PILOTO — validação do padrão "tabela de leitura alimentada por trigger"
// (Seção 310 da migration), pedido do dono 01/10/2026.
//
// Em vez de montar a query sob demanda (como /compras/page.tsx faz hoje —
// carrega tudo e filtra no client), esta tela consulta direto a tabela
// desnormalizada rel_pedidos_compra, já com os nomes resolvidos (fornecedor,
// produtor, ano safra, operação) e os totais de NF calculados — mantida
// sincronizada por TRIGGERS no Postgres, não por escrita dupla no código.
//
// Essa tela é só pra validar o padrão em localhost — fora do menu (TopNav),
// ninguém chega nela sem digitar a URL direto. Não interfere em nada do que
// o usuário real logado vê ou usa hoje.
//
// Também valida os outros 2 pontos pedidos junto:
// 1. Popup de filtro ANTES de buscar (não carrega tudo pra filtrar ao vivo).
// 2. Filtro de Status com múltipla seleção (checkboxes, não <select> único).
// ═══════════════════════════════════════════════════════════════════════════
import { useState } from "react";
import { useAuth } from "../../../components/AuthProvider";
import { supabase } from "../../../lib/supabase";
import TopNav from "../../../components/TopNav";

type RelPedido = {
  id: string;
  numero: number | null;
  nr_pedido: string | null;
  fornecedor_nome: string | null;
  fornecedor_cpf_cnpj: string | null;
  produtor_nome: string | null;
  ano_safra_descricao: string | null;
  operacao_nome: string | null;
  data_registro: string | null;
  moeda: string | null;
  status: string;
  fiscal: boolean | null;
  total_financeiro: number | null;
  valor_entrada: number | null;
  valor_a_receber: number | null;
  qtd_nfs_vinculadas: number | null;
  qtd_nfs_processadas: number | null;
  pct_recebido: number | null;
};

const STATUS_OPCOES: { v: string; label: string; bg: string; color: string }[] = [
  { v: "rascunho",              label: "Rascunho",         bg: "#F4F6FA", color: "#555" },
  { v: "aprovado",              label: "Aprovado",         bg: "#E8E8E8", color: "#0D0D0D" },
  { v: "parcialmente_entregue", label: "Parc. Entregue",   bg: "#FBF3E0", color: "#7A5200" },
  { v: "entregue",              label: "Entregue",         bg: "#DCFCE7", color: "#166534" },
  { v: "cancelado",             label: "Cancelado",        bg: "#FCEBEB", color: "#791F1F" },
];

const fmtBRL = (v?: number | null) => (v ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fmtData = (s?: string | null) => s ? s.split("-").reverse().join("/") : "—";

const inp: React.CSSProperties = { padding: "7px 10px", border: "0.5px solid #DDE2EE", borderRadius: 8, fontSize: 13, background: "#fff" };
const lbl: React.CSSProperties = { fontSize: 11, color: "#555", fontWeight: 600, display: "block", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.03em" };

export default function PedidosRelPilotoPage() {
  const { fazendaId, fazendaIds, contaId } = useAuth();

  const [filtroAberto, setFiltroAberto] = useState(true);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState("");
  const [resultado, setResultado] = useState<RelPedido[] | null>(null);
  const [tempoMs, setTempoMs] = useState<number | null>(null);

  // ── Estado do popup de filtro (nada é buscado até "Aplicar") ──
  const [fBusca, setFBusca] = useState("");
  const [fStatus, setFStatus] = useState<Set<string>>(new Set());
  const [fMoeda, setFMoeda] = useState("");
  const [fDataDe, setFDataDe] = useState("");
  const [fDataAte, setFDataAte] = useState("");

  const toggleStatus = (v: string) => setFStatus(prev => {
    const next = new Set(prev);
    next.has(v) ? next.delete(v) : next.add(v);
    return next;
  });

  async function aplicarFiltro() {
    setCarregando(true);
    setErro("");
    const t0 = performance.now();
    try {
      const fids = fazendaIds?.length ? fazendaIds : fazendaId ? [fazendaId] : [];
      let q = supabase.from("rel_pedidos_compra").select("*");
      q = contaId ? q.eq("conta_id", contaId) : q.in("fazenda_id", fids);
      if (fStatus.size > 0) q = q.in("status", Array.from(fStatus));
      if (fMoeda) q = q.eq("moeda", fMoeda);
      if (fDataDe) q = q.gte("data_registro", fDataDe);
      if (fDataAte) q = q.lte("data_registro", fDataAte);
      if (fBusca.trim()) {
        const t = fBusca.trim();
        q = q.or(`fornecedor_nome.ilike.%${t}%,nr_pedido.ilike.%${t}%`);
      }
      q = q.order("data_registro", { ascending: false }).limit(500);

      const { data, error } = await q;
      if (error) throw error;
      setResultado((data ?? []) as RelPedido[]);
      setTempoMs(Math.round(performance.now() - t0));
      setFiltroAberto(false);
    } catch (e: unknown) {
      setErro(e instanceof Error ? e.message : "Erro ao consultar rel_pedidos_compra — a migration da Seção 310 já foi rodada no Supabase?");
    } finally {
      setCarregando(false);
    }
  }

  const totalFiltrado = (resultado ?? []).reduce((s, p) => s + (p.total_financeiro ?? 0), 0);

  return (
    <div style={{ minHeight: "100vh", background: "#F4F6FA", fontFamily: "system-ui, sans-serif", fontSize: 13 }}>
      <TopNav />
      <div style={{ maxWidth: 1300, margin: "0 auto", padding: "22px 20px" }}>

        <div style={{ background: "#111111", color: "#fff", borderRadius: 10, padding: "10px 16px", marginBottom: 16, fontSize: 12, display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 16 }}>🧪</span>
          <div>
            <strong>Piloto — tabela de leitura rel_pedidos_compra</strong>
            <div style={{ color: "#bbb", marginTop: 2 }}>Tela fora do menu, só pra validação local. Lê direto a tabela sincronizada por trigger — não toca em /compras.</div>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
          <h1 style={{ margin: 0, fontSize: 18, color: "#0B2D50" }}>Pedidos de Compra — piloto (query em tabela)</h1>
          <button onClick={() => setFiltroAberto(true)} style={{ ...inp, background: "#2A2A2A", color: "#fff", fontWeight: 600, cursor: "pointer" }}>
            🔍 Filtro
          </button>
        </div>

        {erro && (
          <div style={{ background: "#FCEBEB", border: "0.5px solid #E24B4A60", borderRadius: 8, padding: "10px 14px", marginBottom: 14, color: "#791F1F" }}>
            {erro}
          </div>
        )}

        {resultado === null && !carregando && !erro && (
          <div style={{ background: "#fff", border: "0.5px solid #DDE2EE", borderRadius: 12, padding: 48, textAlign: "center", color: "#888" }}>
            Defina o filtro e clique em Aplicar pra consultar.
          </div>
        )}

        {resultado !== null && (
          <>
            <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 12, fontSize: 12, color: "#555" }}>
              <span><strong>{resultado.length}</strong> pedido(s)</span>
              <span>·</span>
              <span>Total: <strong>{fmtBRL(totalFiltrado)}</strong></span>
              <span>·</span>
              <span style={{ color: "#16A34A" }}>Consulta em {tempoMs}ms (direto na tabela, sem join)</span>
            </div>

            <div style={{ background: "#fff", border: "0.5px solid #DDE2EE", borderRadius: 12, overflow: "hidden" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ background: "#F4F6FA" }}>
                    {["Nº Pedido", "Fornecedor", "Produtor", "Ano Safra", "Operação", "Data", "Moeda", "Total", "Entrada (NF)", "A Receber", "NFs", "Status"].map(h => (
                      <th key={h} style={{ padding: "7px 10px", textAlign: "left", fontSize: 10, fontWeight: 700, color: "#555", borderBottom: "0.5px solid #DDE2EE", whiteSpace: "nowrap" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {resultado.map(p => {
                    const sm = STATUS_OPCOES.find(s => s.v === p.status);
                    return (
                      <tr key={p.id} style={{ borderBottom: "0.5px solid #F0F2F7" }}>
                        <td style={{ padding: "7px 10px", fontWeight: 600 }}>{p.nr_pedido || `#${p.numero}`}</td>
                        <td style={{ padding: "7px 10px" }}>{p.fornecedor_nome ?? "—"}</td>
                        <td style={{ padding: "7px 10px" }}>{p.produtor_nome ?? "—"}</td>
                        <td style={{ padding: "7px 10px" }}>{p.ano_safra_descricao ?? "—"}</td>
                        <td style={{ padding: "7px 10px" }}>{p.operacao_nome ?? "—"}</td>
                        <td style={{ padding: "7px 10px" }}>{fmtData(p.data_registro)}</td>
                        <td style={{ padding: "7px 10px" }}>{p.moeda}</td>
                        <td style={{ padding: "7px 10px", fontWeight: 600, textAlign: "right" }}>{fmtBRL(p.total_financeiro)}</td>
                        <td style={{ padding: "7px 10px", textAlign: "right", color: "#16A34A" }}>{fmtBRL(p.valor_entrada)}</td>
                        <td style={{ padding: "7px 10px", textAlign: "right", color: "#C9921B" }}>{fmtBRL(p.valor_a_receber)}</td>
                        <td style={{ padding: "7px 10px", textAlign: "center" }}>{p.qtd_nfs_processadas}/{p.qtd_nfs_vinculadas}</td>
                        <td style={{ padding: "7px 10px" }}>
                          <span style={{ fontSize: 10, fontWeight: 700, background: sm?.bg ?? "#eee", color: sm?.color ?? "#555", padding: "2px 8px", borderRadius: 8 }}>{sm?.label ?? p.status}</span>
                        </td>
                      </tr>
                    );
                  })}
                  {resultado.length === 0 && (
                    <tr><td colSpan={12} style={{ padding: 32, textAlign: "center", color: "#888" }}>Nenhum pedido encontrado para esse filtro.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      {/* ══ POPUP DE FILTRO — abre ANTES de qualquer busca ══ */}
      {filtroAberto && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.45)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center" }}
          onClick={() => resultado !== null && setFiltroAberto(false)}>
          <div style={{ background: "#fff", borderRadius: 12, padding: 26, width: "min(94vw, 560px)" }} onClick={e => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
              <h2 style={{ margin: 0, fontSize: 16, color: "#0B2D50" }}>Filtrar Pedidos de Compra</h2>
              {resultado !== null && (
                <button onClick={() => setFiltroAberto(false)} style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer", color: "#888" }}>×</button>
              )}
            </div>

            <div style={{ marginBottom: 14 }}>
              <label style={lbl}>Buscar (fornecedor ou nº pedido)</label>
              <input value={fBusca} onChange={e => setFBusca(e.target.value)} placeholder="Ex: ADM, 09087125..." style={{ ...inp, width: "100%", boxSizing: "border-box" }} />
            </div>

            <div style={{ marginBottom: 14 }}>
              <label style={lbl}>Status — pode marcar mais de um</label>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {STATUS_OPCOES.map(s => {
                  const ativo = fStatus.has(s.v);
                  return (
                    <button key={s.v} onClick={() => toggleStatus(s.v)}
                      style={{
                        padding: "6px 12px", borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: "pointer",
                        border: ativo ? `1.5px solid ${s.color}` : "0.5px solid #DDE2EE",
                        background: ativo ? s.bg : "#fff", color: ativo ? s.color : "#555",
                      }}>
                      {ativo ? "✓ " : ""}{s.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 18 }}>
              <div>
                <label style={lbl}>Moeda</label>
                <select value={fMoeda} onChange={e => setFMoeda(e.target.value)} style={{ ...inp, width: "100%", boxSizing: "border-box" }}>
                  <option value="">Todas</option>
                  <option value="R$">R$ (Real)</option>
                  <option value="USD">US$ (Dólar)</option>
                  <option value="barter">Barter</option>
                </select>
              </div>
              <div>
                <label style={lbl}>Data de</label>
                <input type="date" value={fDataDe} onChange={e => setFDataDe(e.target.value)} style={{ ...inp, width: "100%", boxSizing: "border-box" }} />
              </div>
              <div>
                <label style={lbl}>Data até</label>
                <input type="date" value={fDataAte} onChange={e => setFDataAte(e.target.value)} style={{ ...inp, width: "100%", boxSizing: "border-box" }} />
              </div>
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              {(fStatus.size > 0 || fMoeda || fDataDe || fDataAte || fBusca) && (
                <button onClick={() => { setFBusca(""); setFStatus(new Set()); setFMoeda(""); setFDataDe(""); setFDataAte(""); }}
                  style={{ ...inp, background: "#fff", cursor: "pointer", color: "#555" }}>Limpar</button>
              )}
              <button onClick={aplicarFiltro} disabled={carregando}
                style={{ ...inp, background: "#2A2A2A", color: "#fff", fontWeight: 700, cursor: "pointer", padding: "9px 20px" }}>
                {carregando ? "Consultando..." : "Aplicar Filtro"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
