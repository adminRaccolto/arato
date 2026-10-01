"use client";
// ═══════════════════════════════════════════════════════════════════════════
// PILOTO 2 — rel_lancamentos (Seção 312), 2º domínio do padrão validado no
// Pedido de Compra. Pedido do dono 01/10/2026.
//
// Une `lancamentos` (produtor) e `empresa_lancamentos` (empresa) numa tabela
// de leitura única, sincronizada por trigger — mesma consulta traz CP/CR de
// produtor e de empresa juntos, com status normalizado entre as duas.
//
// IMPORTANTE: só leitura. Nenhuma ação de baixa/estorno/reprogramação fica
// nesta tela — isso continua em Financeiro → Contas a Pagar/Receber, batendo
// direto nas tabelas originais. Esta tela é só pra validar a consulta.
//
// Fora do menu (TopNav) — só acessível digitando a URL. Não interfere em
// nada do que o usuário real logado vê ou usa hoje.
// ═══════════════════════════════════════════════════════════════════════════
import { useState, useEffect } from "react";
import { useAuth } from "../../../components/AuthProvider";
import { supabase } from "../../../lib/supabase";
import TopNav from "../../../components/TopNav";

type RelLancamento = {
  id: string;
  origem_tabela: string;
  tipo: string | null;
  descricao: string | null;
  categoria: string | null;
  valor: number | null;
  valor_pago: number | null;
  moeda: string | null;
  status_origem: string | null;
  status_normalizado: string | null;
  data_vencimento: string | null;
  data_baixa: string | null;
  pessoa_nome: string | null;
  empresa_nome: string | null;
  produtor_nome: string | null;
  centro_custo_nome: string | null;
  ano_safra_descricao: string | null;
  operacao_gerencial_nome: string | null;
  conciliado: boolean | null;
};

const STATUS_OPCOES: { v: string; label: string; bg: string; color: string }[] = [
  { v: "em_aberto", label: "Em Aberto", bg: "#E8E8E8", color: "#0D0D0D" },
  { v: "vencido",   label: "Vencido",   bg: "#FCEBEB", color: "#791F1F" },
  { v: "parcial",   label: "Parcial",   bg: "#FBF3E0", color: "#7A5200" },
  { v: "baixado",   label: "Baixado",   bg: "#DCFCE7", color: "#166534" },
  { v: "cancelado", label: "Cancelado", bg: "#F4F6FA", color: "#555" },
];
const TIPO_OPCOES = [
  { v: "pagar",   label: "Contas a Pagar" },
  { v: "receber", label: "Contas a Receber" },
];
const ORIGEM_OPCOES = [
  { v: "lancamentos",          label: "Produtor" },
  { v: "empresa_lancamentos",  label: "Empresa" },
];

const fmtBRL = (v?: number | null) => (v ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fmtData = (s?: string | null) => s ? s.split("-").reverse().join("/") : "—";

const inp: React.CSSProperties = { padding: "7px 10px", border: "0.5px solid #DDE2EE", borderRadius: 8, fontSize: 13, background: "#fff" };
const lbl: React.CSSProperties = { fontSize: 11, color: "#555", fontWeight: 600, display: "block", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.03em" };

export default function LancamentosRelPilotoPage() {
  const { fazendaId, fazendaIds, contaId } = useAuth();

  const [filtroAberto, setFiltroAberto] = useState(true);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState("");
  const [resultado, setResultado] = useState<RelLancamento[] | null>(null);
  const [tempoMs, setTempoMs] = useState<number | null>(null);

  const [opcoesPessoa, setOpcoesPessoa] = useState<{ nome: string }[]>([]);

  const [fTipo,       setFTipo]       = useState<Set<string>>(new Set());
  const [fOrigem,     setFOrigem]     = useState<Set<string>>(new Set());
  const [fStatus,     setFStatus]     = useState<Set<string>>(new Set());
  const [fBusca,      setFBusca]      = useState("");
  const [fDataDe,     setFDataDe]     = useState("");
  const [fDataAte,    setFDataAte]    = useState("");

  const toggle = (set: Set<string>, setFn: (s: Set<string>) => void, v: string) => {
    const next = new Set(set);
    next.has(v) ? next.delete(v) : next.add(v);
    setFn(next);
  };

  useEffect(() => {
    const fids = fazendaIds?.length ? fazendaIds : fazendaId ? [fazendaId] : [];
    if (!fids.length && !contaId) return;
    (async () => {
      let q = supabase.from("rel_lancamentos").select("pessoa_nome").not("pessoa_nome", "is", null).limit(2000);
      q = contaId ? q.eq("conta_id", contaId) : q.in("fazenda_id", fids);
      const { data } = await q;
      const nomes = new Set<string>();
      for (const r of data ?? []) if (r.pessoa_nome) nomes.add(r.pessoa_nome);
      setOpcoesPessoa(Array.from(nomes).sort().map(nome => ({ nome })));
    })();
  }, [fazendaId, fazendaIds, contaId]);

  async function aplicarFiltro() {
    setCarregando(true);
    setErro("");
    const t0 = performance.now();
    try {
      const fids = fazendaIds?.length ? fazendaIds : fazendaId ? [fazendaId] : [];
      let q = supabase.from("rel_lancamentos").select("*");
      q = contaId ? q.eq("conta_id", contaId) : q.in("fazenda_id", fids);
      if (fTipo.size > 0) q = q.in("tipo", Array.from(fTipo));
      if (fOrigem.size > 0) q = q.in("origem_tabela", Array.from(fOrigem));
      if (fStatus.size > 0) q = q.in("status_normalizado", Array.from(fStatus));
      if (fDataDe) q = q.gte("data_vencimento", fDataDe);
      if (fDataAte) q = q.lte("data_vencimento", fDataAte);
      if (fBusca.trim()) {
        const t = fBusca.trim();
        q = q.or(`descricao.ilike.%${t}%,pessoa_nome.ilike.%${t}%,empresa_nome.ilike.%${t}%`);
      }
      q = q.order("data_vencimento", { ascending: false }).limit(500);

      const { data, error } = await q;
      if (error) throw error;
      setResultado((data ?? []) as RelLancamento[]);
      setTempoMs(Math.round(performance.now() - t0));
      setFiltroAberto(false);
    } catch (e: unknown) {
      setErro(e instanceof Error ? e.message : "Erro ao consultar rel_lancamentos — a migration da Seção 312 já foi rodada no Supabase?");
    } finally {
      setCarregando(false);
    }
  }

  const limparFiltro = () => {
    setFTipo(new Set()); setFOrigem(new Set()); setFStatus(new Set());
    setFBusca(""); setFDataDe(""); setFDataAte("");
  };
  const temFiltro = fTipo.size > 0 || fOrigem.size > 0 || fStatus.size > 0 || fBusca || fDataDe || fDataAte;

  const totalPagar   = (resultado ?? []).filter(l => l.tipo === "pagar").reduce((s, l) => s + (l.valor ?? 0), 0);
  const totalReceber = (resultado ?? []).filter(l => l.tipo === "receber").reduce((s, l) => s + (l.valor ?? 0), 0);

  return (
    <div style={{ minHeight: "100vh", background: "#F4F6FA", fontFamily: "system-ui, sans-serif", fontSize: 13 }}>
      <TopNav />
      <div style={{ maxWidth: 1400, margin: "0 auto", padding: "22px 20px" }}>

        <div style={{ background: "#111111", color: "#fff", borderRadius: 10, padding: "10px 16px", marginBottom: 16, fontSize: 12, display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 16 }}>🧪</span>
          <div>
            <strong>Piloto 2 — tabela de leitura rel_lancamentos (CP/CR unificado)</strong>
            <div style={{ color: "#bbb", marginTop: 2 }}>Tela fora do menu, só leitura, só pra validação local. Une lancamentos + empresa_lancamentos — não toca em Financeiro.</div>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
          <h1 style={{ margin: 0, fontSize: 18, color: "#0B2D50" }}>CP/CR — piloto (query em tabela unificada)</h1>
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
              <span><strong>{resultado.length}</strong> lançamento(s)</span>
              <span>·</span>
              <span>A Pagar: <strong style={{ color: "#E24B4A" }}>{fmtBRL(totalPagar)}</strong></span>
              <span>·</span>
              <span>A Receber: <strong style={{ color: "#16A34A" }}>{fmtBRL(totalReceber)}</strong></span>
              <span>·</span>
              <span style={{ color: "#16A34A" }}>Consulta em {tempoMs}ms (direto na tabela, sem join)</span>
            </div>

            <div style={{ background: "#fff", border: "0.5px solid #DDE2EE", borderRadius: 12, overflow: "hidden", overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ background: "#F4F6FA" }}>
                    {["Origem", "Tipo", "Descrição", "Pessoa/Empresa", "Produtor", "Centro Custo", "Vencimento", "Baixa", "Valor", "Pago", "Status"].map(h => (
                      <th key={h} style={{ padding: "7px 10px", textAlign: "left", fontSize: 10, fontWeight: 700, color: "#555", borderBottom: "0.5px solid #DDE2EE", whiteSpace: "nowrap" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {resultado.map(l => {
                    const sm = STATUS_OPCOES.find(s => s.v === l.status_normalizado);
                    return (
                      <tr key={l.id} style={{ borderBottom: "0.5px solid #F0F2F7" }}>
                        <td style={{ padding: "7px 10px" }}>
                          <span style={{ fontSize: 10, fontWeight: 700, background: l.origem_tabela === "lancamentos" ? "#E6F1FB" : "#F5F3FF", color: l.origem_tabela === "lancamentos" ? "#0C447C" : "#5B21B6", padding: "2px 7px", borderRadius: 6 }}>
                            {l.origem_tabela === "lancamentos" ? "Produtor" : "Empresa"}
                          </span>
                        </td>
                        <td style={{ padding: "7px 10px" }}>{l.tipo === "pagar" ? "A Pagar" : "A Receber"}</td>
                        <td style={{ padding: "7px 10px" }}>{l.descricao ?? "—"}</td>
                        <td style={{ padding: "7px 10px" }}>{l.empresa_nome ?? l.pessoa_nome ?? "—"}</td>
                        <td style={{ padding: "7px 10px" }}>{l.produtor_nome ?? "—"}</td>
                        <td style={{ padding: "7px 10px" }}>{l.centro_custo_nome ?? "—"}</td>
                        <td style={{ padding: "7px 10px" }}>{fmtData(l.data_vencimento)}</td>
                        <td style={{ padding: "7px 10px" }}>{fmtData(l.data_baixa)}</td>
                        <td style={{ padding: "7px 10px", fontWeight: 600, textAlign: "right", color: l.tipo === "pagar" ? "#E24B4A" : "#16A34A" }}>{fmtBRL(l.valor)}</td>
                        <td style={{ padding: "7px 10px", textAlign: "right" }}>{fmtBRL(l.valor_pago)}</td>
                        <td style={{ padding: "7px 10px" }}>
                          <span style={{ fontSize: 10, fontWeight: 700, background: sm?.bg ?? "#eee", color: sm?.color ?? "#555", padding: "2px 8px", borderRadius: 8 }}>{sm?.label ?? l.status_normalizado}</span>
                        </td>
                      </tr>
                    );
                  })}
                  {resultado.length === 0 && (
                    <tr><td colSpan={11} style={{ padding: 32, textAlign: "center", color: "#888" }}>Nenhum lançamento encontrado para esse filtro.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      {/* ══ POPUP DE FILTRO ══ */}
      {filtroAberto && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.45)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center" }}
          onClick={() => resultado !== null && setFiltroAberto(false)}>
          <div style={{ background: "#fff", borderRadius: 12, padding: 26, width: "min(94vw, 620px)", maxHeight: "92vh", overflowY: "auto" }} onClick={e => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
              <h2 style={{ margin: 0, fontSize: 16, color: "#0B2D50" }}>Filtrar Contas a Pagar / Receber</h2>
              {resultado !== null && (
                <button onClick={() => setFiltroAberto(false)} style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer", color: "#888" }}>×</button>
              )}
            </div>

            <div style={{ marginBottom: 14 }}>
              <label style={lbl}>Buscar (descrição, pessoa ou empresa)</label>
              <input value={fBusca} onChange={e => setFBusca(e.target.value)} placeholder="Ex: Adubo, ADM, Muriana..." style={{ ...inp, width: "100%", boxSizing: "border-box" }} list="pessoas-opcoes" />
              <datalist id="pessoas-opcoes">
                {opcoesPessoa.map(p => <option key={p.nome} value={p.nome} />)}
              </datalist>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 14 }}>
              <div>
                <label style={lbl}>Tipo</label>
                <div style={{ display: "flex", flexDirection: "column", gap: 6, border: "0.5px solid #DDE2EE", borderRadius: 8, padding: "10px 12px" }}>
                  {TIPO_OPCOES.map(t => (
                    <label key={t.v} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, cursor: "pointer" }}>
                      <input type="checkbox" checked={fTipo.has(t.v)} onChange={() => toggle(fTipo, setFTipo, t.v)} />
                      {t.label}
                    </label>
                  ))}
                </div>
              </div>
              <div>
                <label style={lbl}>Origem</label>
                <div style={{ display: "flex", flexDirection: "column", gap: 6, border: "0.5px solid #DDE2EE", borderRadius: 8, padding: "10px 12px" }}>
                  {ORIGEM_OPCOES.map(o => (
                    <label key={o.v} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, cursor: "pointer" }}>
                      <input type="checkbox" checked={fOrigem.has(o.v)} onChange={() => toggle(fOrigem, setFOrigem, o.v)} />
                      {o.label}
                    </label>
                  ))}
                </div>
              </div>
            </div>

            <div style={{ marginBottom: 14 }}>
              <label style={lbl}>Status — pode marcar mais de um</label>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "6px 18px", border: "0.5px solid #DDE2EE", borderRadius: 8, padding: "10px 12px" }}>
                {STATUS_OPCOES.map(s => (
                  <label key={s.v} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "#333", cursor: "pointer" }}>
                    <input type="checkbox" checked={fStatus.has(s.v)} onChange={() => toggle(fStatus, setFStatus, s.v)} />
                    {s.label}
                  </label>
                ))}
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 18 }}>
              <div>
                <label style={lbl}>Vencimento de</label>
                <input type="date" value={fDataDe} onChange={e => setFDataDe(e.target.value)} style={{ ...inp, width: "100%", boxSizing: "border-box" }} />
              </div>
              <div>
                <label style={lbl}>Vencimento até</label>
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
