"use client";
// ═══════════════════════════════════════════════════════════════════════════
// PILOTO — validação do padrão "tabela de leitura alimentada por trigger"
// aplicado à Comercialização de Grãos (Seção 319 da migration), pedido do
// dono 01/10/2026: continuar levando o padrão validado em Pedido de Compra
// (310/311), Financeiro (312+317) e Estoque (318) pra outro domínio.
//
// Diferente dos domínios anteriores, `contratos` já era bem desnormalizada
// (produtor_nome/comprador gravados direto) — o problema real encontrado foi
// outro: produtor_nome vem NULL em vários contratos reais mesmo com
// produtor_id preenchido, e não existia conta_id na tabela (toda consulta
// multi-fazenda precisava resolver fazenda_ids antes de filtrar).
// rel_contratos resolve os dois — conta_id denormalizado + produtor_nome/
// comprador_nome sempre corretos (COALESCE com produtores/pessoas) — e já
// calcula saldo_sc (quantidade_sc - entregue_sc).
//
// Essa tela é só pra validar o padrão em localhost — fora do menu (TopNav),
// ninguém chega nela sem digitar a URL direto. Não interfere em nada do que
// o usuário real logado vê ou usa hoje (não toca em /contratos).
// ═══════════════════════════════════════════════════════════════════════════
import { useState, useEffect } from "react";
import { useAuth } from "../../../components/AuthProvider";
import { supabase } from "../../../lib/supabase";
import TopNav from "../../../components/TopNav";

type RelContrato = {
  id: string;
  numero: string | null;
  tipo: string | null;
  modalidade: string | null;
  status: string;
  moeda: string | null;
  produto: string | null;
  produtor_id: string | null;
  produtor_nome: string | null;
  pessoa_id: string | null;
  comprador_nome: string | null;
  ano_safra_id: string | null;
  ano_safra_descricao: string | null;
  ciclo_descricao: string | null;
  preco: number | null;
  quantidade_sc: number | null;
  entregue_sc: number | null;
  saldo_sc: number | null;
  data_contrato: string | null;
  data_entrega: string | null;
  is_arrendamento: boolean | null;
  is_compra_terra: boolean | null;
  is_barter: boolean | null;
};

const STATUS_OPCOES: { v: string; label: string; bg: string; color: string }[] = [
  { v: "aberto",     label: "Aberto",     bg: "#E8E8E8", color: "#0D0D0D" },
  { v: "parcial",    label: "Parcial",    bg: "#FBF3E0", color: "#7A5200" },
  { v: "encerrado",  label: "Encerrado",  bg: "#DCFCE7", color: "#166534" },
  { v: "cancelado",  label: "Cancelado",  bg: "#FCEBEB", color: "#791F1F" },
];

const fmtNum = (v?: number | null) => (v ?? 0).toLocaleString("pt-BR", { maximumFractionDigits: 2 });
const fmtData = (s?: string | null) => s ? s.split("-").reverse().join("/") : "—";

const inp: React.CSSProperties = { padding: "7px 10px", border: "0.5px solid #DDE2EE", borderRadius: 8, fontSize: 13, background: "#fff" };
const lbl: React.CSSProperties = { fontSize: 11, color: "#555", fontWeight: 600, display: "block", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.03em" };

export default function PosicaoContratosRelPilotoPage() {
  const { fazendaId, fazendaIds, contaId } = useAuth();

  const [filtroAberto, setFiltroAberto] = useState(true);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState("");
  const [resultado, setResultado] = useState<RelContrato[] | null>(null);
  const [tempoMs, setTempoMs] = useState<number | null>(null);

  const [opcoesProduto,   setOpcoesProduto]   = useState<string[]>([]);
  const [opcoesComprador, setOpcoesComprador] = useState<{ id: string; nome: string }[]>([]);
  const [opcoesAnoSafra,  setOpcoesAnoSafra]  = useState<{ id: string; descricao: string }[]>([]);

  const [fProduto,   setFProduto]   = useState("");
  const [fComprador, setFComprador] = useState("");
  const [fStatus,    setFStatus]    = useState<Set<string>>(new Set());
  const [fAnoSafra,  setFAnoSafra]  = useState("");
  const [fDataDe,    setFDataDe]    = useState("");
  const [fDataAte,   setFDataAte]   = useState("");

  const toggleStatus = (v: string) => setFStatus(prev => {
    const next = new Set(prev);
    next.has(v) ? next.delete(v) : next.add(v);
    return next;
  });

  useEffect(() => {
    const fids = fazendaIds?.length ? fazendaIds : fazendaId ? [fazendaId] : [];
    if (!fids.length && !contaId) return;
    (async () => {
      let q = supabase.from("rel_contratos").select("produto, pessoa_id, comprador_nome, ano_safra_id, ano_safra_descricao");
      q = contaId ? q.eq("conta_id", contaId) : q.in("fazenda_id", fids);
      const { data } = await q;
      const prod = new Set<string>();
      const comp = new Map<string, string>();
      const safra = new Map<string, string>();
      for (const r of data ?? []) {
        if (r.produto) prod.add(r.produto);
        if (r.pessoa_id && r.comprador_nome) comp.set(r.pessoa_id, r.comprador_nome);
        if (r.ano_safra_id && r.ano_safra_descricao) safra.set(r.ano_safra_id, r.ano_safra_descricao);
      }
      setOpcoesProduto(Array.from(prod).sort());
      setOpcoesComprador(Array.from(comp, ([id, nome]) => ({ id, nome })).sort((a, b) => a.nome.localeCompare(b.nome)));
      setOpcoesAnoSafra(Array.from(safra, ([id, descricao]) => ({ id, descricao })).sort((a, b) => b.descricao.localeCompare(a.descricao)));
    })();
  }, [fazendaId, fazendaIds, contaId]);

  async function aplicarFiltro() {
    setCarregando(true);
    setErro("");
    const t0 = performance.now();
    try {
      const fids = fazendaIds?.length ? fazendaIds : fazendaId ? [fazendaId] : [];
      let q = supabase.from("rel_contratos").select("*");
      q = contaId ? q.eq("conta_id", contaId) : q.in("fazenda_id", fids);
      if (fProduto) q = q.eq("produto", fProduto);
      if (fComprador) q = q.eq("pessoa_id", fComprador);
      if (fStatus.size > 0) q = q.in("status", Array.from(fStatus));
      if (fAnoSafra) q = q.eq("ano_safra_id", fAnoSafra);
      if (fDataDe) q = q.gte("data_contrato", fDataDe);
      if (fDataAte) q = q.lte("data_contrato", fDataAte);
      q = q.order("data_contrato", { ascending: false }).limit(1000);

      const { data, error } = await q;
      if (error) throw error;
      setResultado((data ?? []) as RelContrato[]);
      setTempoMs(Math.round(performance.now() - t0));
      setFiltroAberto(false);
    } catch (e: unknown) {
      setErro(e instanceof Error ? e.message : "Erro ao consultar rel_contratos — a migration da Seção 319 já foi rodada no Supabase?");
    } finally {
      setCarregando(false);
    }
  }

  const limparFiltro = () => {
    setFProduto(""); setFComprador(""); setFStatus(new Set()); setFAnoSafra("");
    setFDataDe(""); setFDataAte("");
  };
  const temFiltro = fProduto || fComprador || fStatus.size > 0 || fAnoSafra || fDataDe || fDataAte;

  const totalSc = (resultado ?? []).reduce((s, c) => s + (c.quantidade_sc ?? 0), 0);
  const totalSaldoSc = (resultado ?? []).reduce((s, c) => s + (c.saldo_sc ?? 0), 0);
  const semProdutorNome = (resultado ?? []).filter(c => c.produtor_id && !c.produtor_nome).length;

  return (
    <div style={{ minHeight: "100vh", background: "#F4F6FA", fontFamily: "system-ui, sans-serif", fontSize: 13 }}>
      <TopNav />
      <div style={{ maxWidth: 1500, margin: "0 auto", padding: "22px 20px" }}>

        <div style={{ background: "#111111", color: "#fff", borderRadius: 10, padding: "10px 16px", marginBottom: 16, fontSize: 12, display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 16 }}>🧪</span>
          <div>
            <strong>Piloto — tabela de leitura rel_contratos</strong>
            <div style={{ color: "#bbb", marginTop: 2 }}>Tela fora do menu, só pra validação local. Lê direto a tabela sincronizada por trigger — não toca em /contratos.</div>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
          <h1 style={{ margin: 0, fontSize: 18, color: "#0B2D50" }}>Posição de Comercialização — piloto (query em tabela)</h1>
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
              <span><strong>{resultado.length}</strong> contrato(s)</span>
              <span>·</span>
              <span>Total: <strong>{fmtNum(totalSc)} sc</strong></span>
              <span>·</span>
              <span>Saldo a entregar: <strong style={{ color: "#C9921B" }}>{fmtNum(totalSaldoSc)} sc</strong></span>
              {semProdutorNome > 0 && (
                <>
                  <span>·</span>
                  <span style={{ color: "#16A34A" }}>{semProdutorNome} corrigido(s) via COALESCE (produtor_nome estava NULL no original)</span>
                </>
              )}
              <span>·</span>
              <span style={{ color: "#16A34A" }}>Consulta em {tempoMs}ms (direto na tabela, sem join)</span>
            </div>

            <div style={{ background: "#fff", border: "0.5px solid #DDE2EE", borderRadius: 12, overflow: "hidden", overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ background: "#F4F6FA" }}>
                    {["Nº Contrato", "Produto", "Produtor", "Comprador", "Ano Safra", "Preço", "Qtd (sc)", "Entregue (sc)", "Saldo (sc)", "Data Contrato", "Data Entrega", "Status"].map(h => (
                      <th key={h} style={{ padding: "7px 10px", textAlign: "left", fontSize: 10, fontWeight: 700, color: "#555", borderBottom: "0.5px solid #DDE2EE", whiteSpace: "nowrap" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {resultado.map(c => {
                    const sm = STATUS_OPCOES.find(s => s.v === c.status);
                    return (
                      <tr key={c.id} style={{ borderBottom: "0.5px solid #F0F2F7" }}>
                        <td style={{ padding: "7px 10px", fontWeight: 600 }}>{c.numero}</td>
                        <td style={{ padding: "7px 10px" }}>{c.produto ?? "—"}</td>
                        <td style={{ padding: "7px 10px" }}>{c.produtor_nome ?? "—"}</td>
                        <td style={{ padding: "7px 10px" }}>{c.comprador_nome ?? "—"}</td>
                        <td style={{ padding: "7px 10px" }}>{c.ano_safra_descricao ?? "—"}</td>
                        <td style={{ padding: "7px 10px", textAlign: "right" }}>{c.moeda === "USD" ? "US$" : "R$"} {fmtNum(c.preco)}</td>
                        <td style={{ padding: "7px 10px", textAlign: "right" }}>{fmtNum(c.quantidade_sc)}</td>
                        <td style={{ padding: "7px 10px", textAlign: "right", color: "#16A34A" }}>{fmtNum(c.entregue_sc)}</td>
                        <td style={{ padding: "7px 10px", textAlign: "right", fontWeight: 600, color: "#C9921B" }}>{fmtNum(c.saldo_sc)}</td>
                        <td style={{ padding: "7px 10px" }}>{fmtData(c.data_contrato)}</td>
                        <td style={{ padding: "7px 10px" }}>{fmtData(c.data_entrega)}</td>
                        <td style={{ padding: "7px 10px" }}>
                          <span style={{ fontSize: 10, fontWeight: 700, background: sm?.bg ?? "#eee", color: sm?.color ?? "#555", padding: "2px 8px", borderRadius: 8 }}>{sm?.label ?? c.status}</span>
                        </td>
                      </tr>
                    );
                  })}
                  {resultado.length === 0 && (
                    <tr><td colSpan={12} style={{ padding: 32, textAlign: "center", color: "#888" }}>Nenhum contrato encontrado para esse filtro.</td></tr>
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
              <h2 style={{ margin: 0, fontSize: 16, color: "#0B2D50" }}>Filtrar Posição de Comercialização</h2>
              {resultado !== null && (
                <button onClick={() => setFiltroAberto(false)} style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer", color: "#888" }}>×</button>
              )}
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 14 }}>
              <div>
                <label style={lbl}>Produto</label>
                <select value={fProduto} onChange={e => setFProduto(e.target.value)} style={{ ...inp, width: "100%", boxSizing: "border-box" }}>
                  <option value="">Todos os produtos</option>
                  {opcoesProduto.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>
              <div>
                <label style={lbl}>Comprador</label>
                <select value={fComprador} onChange={e => setFComprador(e.target.value)} style={{ ...inp, width: "100%", boxSizing: "border-box" }}>
                  <option value="">Todos os compradores</option>
                  {opcoesComprador.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
                </select>
              </div>
            </div>

            <div style={{ marginBottom: 14 }}>
              <label style={lbl}>Status — pode marcar mais de um</label>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "6px 18px", border: "0.5px solid #DDE2EE", borderRadius: 8, padding: "10px 12px" }}>
                {STATUS_OPCOES.map(s => (
                  <label key={s.v} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "#333", cursor: "pointer" }}>
                    <input type="checkbox" checked={fStatus.has(s.v)} onChange={() => toggleStatus(s.v)} />
                    {s.label}
                  </label>
                ))}
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 10, marginBottom: 14 }}>
              <div>
                <label style={lbl}>Ano Safra</label>
                <select value={fAnoSafra} onChange={e => setFAnoSafra(e.target.value)} style={{ ...inp, width: "100%", boxSizing: "border-box" }}>
                  <option value="">Todas as safras</option>
                  {opcoesAnoSafra.map(a => <option key={a.id} value={a.id}>{a.descricao}</option>)}
                </select>
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 18 }}>
              <div>
                <label style={lbl}>Data contrato de</label>
                <input type="date" value={fDataDe} onChange={e => setFDataDe(e.target.value)} style={{ ...inp, width: "100%", boxSizing: "border-box" }} />
              </div>
              <div>
                <label style={lbl}>até</label>
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
