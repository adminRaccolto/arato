"use client";
// ═══════════════════════════════════════════════════════════════════════════
// PILOTO — validação do padrão "tabela de leitura alimentada por trigger"
// aplicado ao Estoque (Seção 318 da migration), pedido do dono 01/10/2026:
// continuar levando o padrão validado em Pedido de Compra (310/311) e
// Lançamentos CP/CR (312+317) pra outro domínio.
//
// Em vez de montar os joins sob demanda (insumo, depósito, ciclo/ano safra,
// NF de origem — como as telas de Estoque fazem hoje, client-side), esta
// tela consulta direto rel_movimentacoes_estoque, já com tudo resolvido e
// valor_total calculado — mantida sincronizada por TRIGGER no Postgres a
// cada INSERT/UPDATE/DELETE em movimentacoes_estoque, não por escrita dupla
// no código (a escrita real continua 100% em movimentacoes_estoque, nos
// dezenas de pontos que já existem em lib/db.ts).
//
// Essa tela é só pra validar o padrão em localhost — fora do menu (TopNav),
// ninguém chega nela sem digitar a URL direto. Não interfere em nada do que
// o usuário real logado vê ou usa hoje (não toca em /estoque).
//
// Tela de RELATÓRIO (filtro antes de buscar) — não é lançamento: movimentação
// de estoque é sempre gerada por outra tela/operação (NF, romaneio, consumo
// em lavoura, etc.), nunca editada diretamente aqui.
// ═══════════════════════════════════════════════════════════════════════════
import { useState, useEffect } from "react";
import { useAuth } from "../../../components/AuthProvider";
import { supabase } from "../../../lib/supabase";
import TopNav from "../../../components/TopNav";

type RelMovimentacao = {
  id: string;
  fazenda_id: string | null;
  insumo_id: string | null;
  insumo_nome: string | null;
  insumo_categoria: string | null;
  insumo_unidade: string | null;
  deposito_id: string | null;
  deposito_nome: string | null;
  tipo: string;
  motivo: string | null;
  quantidade: number;
  valor_unitario: number | null;
  custo_unitario_na_baixa: number | null;
  valor_total: number | null;
  data: string;
  ciclo_id: string | null;
  ciclo_descricao: string | null;
  ciclo_cultura: string | null;
  ano_safra_id: string | null;
  ano_safra_descricao: string | null;
  operacao: string | null;
  origem: string | null;
  nf_entrada_numero: string | null;
  observacao: string | null;
  auto: boolean;
};

const TIPO_OPCOES: { v: string; label: string; bg: string; color: string }[] = [
  { v: "entrada", label: "Entrada", bg: "#DCFCE7", color: "#166534" },
  { v: "saida",   label: "Saída",   bg: "#FCEBEB", color: "#791F1F" },
  { v: "ajuste",  label: "Ajuste",  bg: "#FBF3E0", color: "#7A5200" },
];

const fmtBRL = (v?: number | null) => (v ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fmtData = (s?: string | null) => s ? s.split("-").reverse().join("/") : "—";

const inp: React.CSSProperties = { padding: "7px 10px", border: "0.5px solid #DDE2EE", borderRadius: 8, fontSize: 13, background: "#fff" };
const lbl: React.CSSProperties = { fontSize: 11, color: "#555", fontWeight: 600, display: "block", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.03em" };

export default function MovimentacoesRelPilotoPage() {
  const { fazendaId, fazendaIds, contaId } = useAuth();

  const [filtroAberto, setFiltroAberto] = useState(true);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState("");
  const [resultado, setResultado] = useState<RelMovimentacao[] | null>(null);
  const [tempoMs, setTempoMs] = useState<number | null>(null);

  // ── Opções dos dropdowns — vêm da própria rel_movimentacoes_estoque
  //    (distinct), carregadas uma vez ao abrir a tela ──
  const [opcoesInsumo,   setOpcoesInsumo]   = useState<{ id: string; nome: string }[]>([]);
  const [opcoesDeposito, setOpcoesDeposito] = useState<{ id: string; nome: string }[]>([]);
  const [opcoesAnoSafra, setOpcoesAnoSafra] = useState<{ id: string; descricao: string }[]>([]);

  // ── Estado do popup de filtro (nada é buscado até "Aplicar") ──
  const [fInsumo,    setFInsumo]    = useState("");
  const [fDeposito,  setFDeposito]  = useState("");
  const [fTipo,      setFTipo]      = useState<Set<string>>(new Set());
  const [fAnoSafra,  setFAnoSafra]  = useState("");
  const [fBusca,     setFBusca]     = useState("");
  const [fDataDe,    setFDataDe]    = useState("");
  const [fDataAte,   setFDataAte]   = useState("");

  const toggleTipo = (v: string) => setFTipo(prev => {
    const next = new Set(prev);
    next.has(v) ? next.delete(v) : next.add(v);
    return next;
  });

  useEffect(() => {
    const fids = fazendaIds?.length ? fazendaIds : fazendaId ? [fazendaId] : [];
    if (!fids.length && !contaId) return;
    (async () => {
      let q = supabase.from("rel_movimentacoes_estoque").select("insumo_id, insumo_nome, deposito_id, deposito_nome, ano_safra_id, ano_safra_descricao");
      q = contaId ? q.eq("conta_id", contaId) : q.in("fazenda_id", fids);
      const { data } = await q;
      const ins = new Map<string, string>();
      const dep = new Map<string, string>();
      const safra = new Map<string, string>();
      for (const r of data ?? []) {
        if (r.insumo_id && r.insumo_nome) ins.set(r.insumo_id, r.insumo_nome);
        if (r.deposito_id && r.deposito_nome) dep.set(r.deposito_id, r.deposito_nome);
        if (r.ano_safra_id && r.ano_safra_descricao) safra.set(r.ano_safra_id, r.ano_safra_descricao);
      }
      setOpcoesInsumo(Array.from(ins, ([id, nome]) => ({ id, nome })).sort((a, b) => a.nome.localeCompare(b.nome)));
      setOpcoesDeposito(Array.from(dep, ([id, nome]) => ({ id, nome })).sort((a, b) => a.nome.localeCompare(b.nome)));
      setOpcoesAnoSafra(Array.from(safra, ([id, descricao]) => ({ id, descricao })).sort((a, b) => b.descricao.localeCompare(a.descricao)));
    })();
  }, [fazendaId, fazendaIds, contaId]);

  async function aplicarFiltro() {
    setCarregando(true);
    setErro("");
    const t0 = performance.now();
    try {
      const fids = fazendaIds?.length ? fazendaIds : fazendaId ? [fazendaId] : [];
      let q = supabase.from("rel_movimentacoes_estoque").select("*");
      q = contaId ? q.eq("conta_id", contaId) : q.in("fazenda_id", fids);
      if (fInsumo) q = q.eq("insumo_id", fInsumo);
      if (fDeposito) q = q.eq("deposito_id", fDeposito);
      if (fTipo.size > 0) q = q.in("tipo", Array.from(fTipo));
      if (fAnoSafra) q = q.eq("ano_safra_id", fAnoSafra);
      if (fDataDe) q = q.gte("data", fDataDe);
      if (fDataAte) q = q.lte("data", fDataAte);
      if (fBusca.trim()) {
        const t = fBusca.trim();
        q = q.or(`observacao.ilike.%${t}%,operacao.ilike.%${t}%,insumo_nome.ilike.%${t}%`);
      }
      q = q.order("data", { ascending: false }).limit(1000);

      const { data, error } = await q;
      if (error) throw error;
      setResultado((data ?? []) as RelMovimentacao[]);
      setTempoMs(Math.round(performance.now() - t0));
      setFiltroAberto(false);
    } catch (e: unknown) {
      setErro(e instanceof Error ? e.message : "Erro ao consultar rel_movimentacoes_estoque — a migration da Seção 318 já foi rodada no Supabase?");
    } finally {
      setCarregando(false);
    }
  }

  const limparFiltro = () => {
    setFInsumo(""); setFDeposito(""); setFTipo(new Set()); setFAnoSafra("");
    setFBusca(""); setFDataDe(""); setFDataAte("");
  };
  const temFiltro = fInsumo || fDeposito || fTipo.size > 0 || fAnoSafra || fBusca || fDataDe || fDataAte;

  const totalEntradas = (resultado ?? []).filter(m => m.tipo === "entrada").reduce((s, m) => s + (m.valor_total ?? 0), 0);
  const totalSaidas   = (resultado ?? []).filter(m => m.tipo === "saida").reduce((s, m) => s + (m.valor_total ?? 0), 0);

  return (
    <div style={{ minHeight: "100vh", background: "#F4F6FA", fontFamily: "system-ui, sans-serif", fontSize: 13 }}>
      <TopNav />
      <div style={{ maxWidth: 1500, margin: "0 auto", padding: "22px 20px" }}>

        <div style={{ background: "#111111", color: "#fff", borderRadius: 10, padding: "10px 16px", marginBottom: 16, fontSize: 12, display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 16 }}>🧪</span>
          <div>
            <strong>Piloto — tabela de leitura rel_movimentacoes_estoque</strong>
            <div style={{ color: "#bbb", marginTop: 2 }}>Tela fora do menu, só pra validação local. Lê direto a tabela sincronizada por trigger — não toca em /estoque.</div>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
          <h1 style={{ margin: 0, fontSize: 18, color: "#0B2D50" }}>Movimentações de Estoque — piloto (query em tabela)</h1>
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
            <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 12, fontSize: 12, color: "#555", flexWrap: "wrap" }}>
              <span><strong>{resultado.length}</strong> movimentação(ões)</span>
              <span>·</span>
              <span>Entradas: <strong style={{ color: "#16A34A" }}>{fmtBRL(totalEntradas)}</strong></span>
              <span>·</span>
              <span>Saídas: <strong style={{ color: "#E24B4A" }}>{fmtBRL(totalSaidas)}</strong></span>
              <span>·</span>
              <span style={{ color: "#16A34A" }}>Consulta em {tempoMs}ms (direto na tabela, sem join)</span>
            </div>

            <div style={{ background: "#fff", border: "0.5px solid #DDE2EE", borderRadius: 12, overflow: "hidden", overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ background: "#F4F6FA" }}>
                    {["Data", "Tipo", "Insumo", "Categoria", "Depósito", "Qtd", "Unid.", "Valor Unit.", "Valor Total", "Safra", "Ciclo", "Operação", "NF Origem", "Observação"].map(h => (
                      <th key={h} style={{ padding: "7px 10px", textAlign: "left", fontSize: 10, fontWeight: 700, color: "#555", borderBottom: "0.5px solid #DDE2EE", whiteSpace: "nowrap" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {resultado.map(m => {
                    const tm = TIPO_OPCOES.find(t => t.v === m.tipo);
                    return (
                      <tr key={m.id} style={{ borderBottom: "0.5px solid #F0F2F7" }}>
                        <td style={{ padding: "7px 10px", whiteSpace: "nowrap" }}>{fmtData(m.data)}</td>
                        <td style={{ padding: "7px 10px" }}>
                          <span style={{ fontSize: 10, fontWeight: 700, background: tm?.bg ?? "#eee", color: tm?.color ?? "#555", padding: "2px 8px", borderRadius: 8 }}>{tm?.label ?? m.tipo}</span>
                        </td>
                        <td style={{ padding: "7px 10px" }}>{m.insumo_nome ?? "—"}</td>
                        <td style={{ padding: "7px 10px", color: "#888" }}>{m.insumo_categoria ?? "—"}</td>
                        <td style={{ padding: "7px 10px" }}>{m.deposito_nome ?? "—"}</td>
                        <td style={{ padding: "7px 10px", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{m.quantidade?.toLocaleString("pt-BR")}</td>
                        <td style={{ padding: "7px 10px", color: "#888" }}>{m.insumo_unidade ?? "—"}</td>
                        <td style={{ padding: "7px 10px", textAlign: "right" }}>{fmtBRL(m.valor_unitario ?? m.custo_unitario_na_baixa)}</td>
                        <td style={{ padding: "7px 10px", textAlign: "right", fontWeight: 600 }}>{fmtBRL(m.valor_total)}</td>
                        <td style={{ padding: "7px 10px" }}>{m.ano_safra_descricao ?? "—"}</td>
                        <td style={{ padding: "7px 10px" }}>{m.ciclo_descricao ?? "—"}</td>
                        <td style={{ padding: "7px 10px", color: "#888" }}>{m.operacao ?? "—"}</td>
                        <td style={{ padding: "7px 10px", color: "#888" }}>{m.nf_entrada_numero ?? "—"}</td>
                        <td style={{ padding: "7px 10px", color: "#888", maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={m.observacao ?? undefined}>{m.observacao ?? "—"}</td>
                      </tr>
                    );
                  })}
                  {resultado.length === 0 && (
                    <tr><td colSpan={14} style={{ padding: 32, textAlign: "center", color: "#888" }}>Nenhuma movimentação encontrada para esse filtro.</td></tr>
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
          <div style={{ background: "#fff", borderRadius: 12, padding: 26, width: "min(94vw, 620px)", maxHeight: "92vh", overflowY: "auto" }} onClick={e => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
              <h2 style={{ margin: 0, fontSize: 16, color: "#0B2D50" }}>Filtrar Movimentações de Estoque</h2>
              {resultado !== null && (
                <button onClick={() => setFiltroAberto(false)} style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer", color: "#888" }}>×</button>
              )}
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 14 }}>
              <div>
                <label style={lbl}>Insumo</label>
                <select value={fInsumo} onChange={e => setFInsumo(e.target.value)} style={{ ...inp, width: "100%", boxSizing: "border-box" }}>
                  <option value="">Todos os insumos</option>
                  {opcoesInsumo.map(i => <option key={i.id} value={i.id}>{i.nome}</option>)}
                </select>
              </div>
              <div>
                <label style={lbl}>Depósito</label>
                <select value={fDeposito} onChange={e => setFDeposito(e.target.value)} style={{ ...inp, width: "100%", boxSizing: "border-box" }}>
                  <option value="">Todos os depósitos</option>
                  {opcoesDeposito.map(d => <option key={d.id} value={d.id}>{d.nome}</option>)}
                </select>
              </div>
            </div>

            <div style={{ marginBottom: 14 }}>
              <label style={lbl}>Tipo — pode marcar mais de um</label>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "6px 18px", border: "0.5px solid #DDE2EE", borderRadius: 8, padding: "10px 12px" }}>
                {TIPO_OPCOES.map(t => (
                  <label key={t.v} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "#333", cursor: "pointer" }}>
                    <input type="checkbox" checked={fTipo.has(t.v)} onChange={() => toggleTipo(t.v)} />
                    {t.label}
                  </label>
                ))}
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 14 }}>
              <div>
                <label style={lbl}>Ano Safra</label>
                <select value={fAnoSafra} onChange={e => setFAnoSafra(e.target.value)} style={{ ...inp, width: "100%", boxSizing: "border-box" }}>
                  <option value="">Todas as safras</option>
                  {opcoesAnoSafra.map(a => <option key={a.id} value={a.id}>{a.descricao}</option>)}
                </select>
              </div>
              <div>
                <label style={lbl}>Buscar (insumo, operação, observação)</label>
                <input value={fBusca} onChange={e => setFBusca(e.target.value)} style={{ ...inp, width: "100%", boxSizing: "border-box" }} />
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 18 }}>
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
              {temFiltro && (
                <button onClick={limparFiltro} style={{ ...inp, background: "#fff", cursor: "pointer", color: "#555" }}>Limpar</button>
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
