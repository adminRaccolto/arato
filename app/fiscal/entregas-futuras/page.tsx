"use client";
// Entregas Futuras — saldo a entregar de cada NF de simples faturamento (VEF): comprado, já entregue pelas NFs de
// remessa (Seção 387) e o que falta, por produto; a seta abre as remessas de cada faturamento. Só leitura.
import { Fragment, useEffect, useMemo, useState, type CSSProperties } from "react";
import { useAuth } from "../../../components/AuthProvider";
import TopNav from "../../../components/TopNav";
import { OperationalHeading } from "../../../components/OperationalUI";
import { supabase } from "../../../lib/supabase";

type Et = { id: string; nf_entrada_id: string; insumo_id: string | null; descricao: string; terceiro_nome: string; terceiro_cnpj: string | null; quantidade_original: number; quantidade_saldo: number; status: string; created_at: string };
type Bx = { estoque_terceiro_id: string; remessa_nf_entrada_id: string; quantidade: number; created_at: string };
type Nf = { id: string; numero: string | null; data_emissao: string | null; valor_total: number | null };

const fmtData = (s?: string | null) => s ? s.slice(0, 10).split("-").reverse().join("/") : "—";
const fmtQ = (v: number) => v.toLocaleString("pt-BR", { maximumFractionDigits: 3 });
const fmtBRL = (v?: number | null) => (v ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const th: CSSProperties = { padding: "7px 10px", fontSize: 11, fontWeight: 600, color: "var(--text-2)", textAlign: "left", borderBottom: "0.5px solid var(--border-table)", background: "var(--bg-page)", whiteSpace: "nowrap" };
const td: CSSProperties = { padding: "7px 10px", fontSize: 12, borderBottom: "0.5px solid var(--border-row)", verticalAlign: "top" };
const inp: CSSProperties = { padding: "7px 10px", border: "0.5px solid var(--border-table)", borderRadius: 8, fontSize: 13, background: "var(--bg-input)", color: "var(--text-1)" };

export default function EntregasFuturasPage() {
  const { fazendaIds, fazendaId } = useAuth();
  const ids = useMemo(() => (fazendaIds?.length ? fazendaIds : fazendaId ? [fazendaId] : []), [fazendaIds, fazendaId]);
  const [ets, setEts] = useState<Et[]>([]);
  const [bxs, setBxs] = useState<Bx[]>([]);
  const [nfs, setNfs] = useState<Map<string, Nf>>(new Map());
  const [filtro, setFiltro] = useState<"abertos" | "todos">("abertos");
  const [busca, setBusca] = useState("");
  const [abertos, setAbertos] = useState<Set<string>>(new Set());
  const [carregando, setCarregando] = useState(false);
  const [aviso, setAviso] = useState("");

  useEffect(() => {
    if (!ids.length) return;
    (async () => {
      setCarregando(true);
      const { data: e } = await supabase.from("estoque_terceiros").select("id, nf_entrada_id, insumo_id, descricao, terceiro_nome, terceiro_cnpj, quantidade_original, quantidade_saldo, status, created_at")
        .in("fazenda_id", ids).not("nf_entrada_id", "is", null).order("created_at", { ascending: false }).limit(2000);
      const lista = ((e ?? []) as Et[]);
      setEts(lista);
      const etIds = lista.map(x => x.id);
      const baixas: Bx[] = [];
      for (let k = 0; k < etIds.length; k += 200) {
        const { data, error } = await supabase.from("estoque_terceiros_baixas").select("estoque_terceiro_id, remessa_nf_entrada_id, quantidade, created_at").in("estoque_terceiro_id", etIds.slice(k, k + 200));
        if (error) { setAviso("Rode a Seção 387 do supabase_migrations.sql para ver as remessas de cada faturamento."); break; }
        baixas.push(...((data ?? []) as Bx[]));
      }
      setBxs(baixas);
      const nfIds = [...new Set([...lista.map(x => x.nf_entrada_id), ...baixas.map(b => b.remessa_nf_entrada_id)])];
      const mapa = new Map<string, Nf>();
      for (let k = 0; k < nfIds.length; k += 200) {
        const { data } = await supabase.from("nf_entradas").select("id, numero, data_emissao, valor_total").in("id", nfIds.slice(k, k + 200));
        for (const n of (data ?? []) as Nf[]) mapa.set(n.id, n);
      }
      setNfs(mapa);
      setCarregando(false);
    })();
  }, [ids.join(",")]); // eslint-disable-line react-hooks/exhaustive-deps

  // Um grupo por NF de faturamento
  const grupos = useMemo(() => {
    const m = new Map<string, Et[]>();
    for (const e of ets) (m.get(e.nf_entrada_id) ?? m.set(e.nf_entrada_id, []).get(e.nf_entrada_id)!).push(e);
    return [...m.entries()].map(([nfId, itens]) => {
      const original = itens.reduce((t, i) => t + Number(i.quantidade_original), 0);
      const saldo = itens.reduce((t, i) => t + Number(i.quantidade_saldo), 0);
      return { nfId, nf: nfs.get(nfId), itens, fornecedor: itens[0].terceiro_nome, original, saldo, aberto: itens.some(i => i.status !== "encerrado") };
    }).sort((a, b) => (b.nf?.data_emissao ?? "").localeCompare(a.nf?.data_emissao ?? ""));
  }, [ets, nfs]);
  const t = busca.trim().toLowerCase();
  const lista = grupos.filter(g => (filtro === "todos" || g.aberto) && (!t || g.fornecedor.toLowerCase().includes(t) || (g.nf?.numero ?? "").includes(t) || g.itens.some(i => i.descricao.toLowerCase().includes(t))));

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg-page)" }}>
      <TopNav />
      <div style={{ padding: "14px 20px", maxWidth: 1300, margin: "0 auto" }}>
        <OperationalHeading data-arato-page-heading="true" style={{ marginBottom: 10 }}>
          <h1 data-arato-h1="true" style={{ margin: 0, fontSize: 18, color: "#0B2D50" }}>Entregas Futuras</h1>
          <div style={{ fontSize: 12, color: "var(--text-3)", marginTop: 2 }}>Compra para entrega futura: o que cada NF de simples faturamento comprou, o que já chegou pelas NFs de remessa e o que falta entregar.</div>
        </OperationalHeading>
        <div style={{ display: "flex", gap: 10, marginBottom: 10, flexWrap: "wrap" }}>
          <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Fornecedor, nº da NF ou produto" style={{ ...inp, flex: "1 1 260px" }} />
          <select value={filtro} onChange={e => setFiltro(e.target.value as "abertos" | "todos")} style={inp}>
            <option value="abertos">Com saldo a entregar</option><option value="todos">Todos (inclui entregues)</option>
          </select>
        </div>
        {aviso && <div style={{ padding: 10, background: "#FBF3E0", color: "#7A5200", borderRadius: 8, fontSize: 12, marginBottom: 10 }}>{aviso}</div>}
        <div style={{ background: "#fff", border: "0.5px solid #DDE2EE", borderRadius: 12, overflow: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 860 }}>
            <thead><tr>{["NF faturamento", "Data", "Fornecedor", "Produto", "Comprado", "Entregue", "Falta", "Situação"].map(h => <th key={h} style={{ ...th, textAlign: ["Comprado", "Entregue", "Falta"].includes(h) ? "right" : "left" }}>{h}</th>)}</tr></thead>
            <tbody>
              {carregando ? <tr><td colSpan={8} style={{ ...td, textAlign: "center", padding: 24, color: "var(--text-3)" }}>Carregando…</td></tr>
                : !lista.length ? <tr><td colSpan={8} style={{ ...td, textAlign: "center", padding: 24, color: "var(--text-3)" }}>Nenhum faturamento {filtro === "abertos" ? "com saldo a entregar" : "de entrega futura"}.</td></tr>
                : lista.map(g => {
                  const aberto = abertos.has(g.nfId);
                  const rems = bxs.filter(b => g.itens.some(i => i.id === b.estoque_terceiro_id));
                  const porRemessa = new Map<string, { qtd: number; produtos: Set<string> }>();
                  for (const b of rems) { const r = porRemessa.get(b.remessa_nf_entrada_id) ?? { qtd: 0, produtos: new Set<string>() }; r.qtd += Number(b.quantidade); r.produtos.add(g.itens.find(i => i.id === b.estoque_terceiro_id)?.descricao ?? ""); porRemessa.set(b.remessa_nf_entrada_id, r); }
                  const sit = !g.aberto ? { r: "Entregue", bg: "#DCFCE7", c: "#166534" } : g.saldo < g.original - 0.0001 ? { r: "Parcial", bg: "#FBF3E0", c: "#7A5200" } : { r: "Aguardando entrega", bg: "#D5E8F5", c: "#0B2D50" };
                  return (
                    <Fragment key={g.nfId}>
                      {g.itens.map((i, k) => (
                        <tr key={i.id} style={{ background: aberto ? "#F4F6FA" : undefined }}>
                          {k === 0 && <>
                            <td style={{ ...td, fontWeight: 600, whiteSpace: "nowrap" }} rowSpan={g.itens.length}>
                              <button type="button" onClick={() => setAbertos(p => { const n = new Set(p); if (n.has(g.nfId)) n.delete(g.nfId); else n.add(g.nfId); return n; })} title="Ver as remessas" style={{ background: "none", border: "none", cursor: "pointer", color: "#1A4870", fontSize: 11, padding: "0 6px 0 0" }}>{aberto ? "▼" : "▶"}</button>
                              {g.nf?.numero ?? "—"}<div style={{ fontSize: 11, color: "var(--text-3)", fontWeight: 400 }}>{fmtBRL(g.nf?.valor_total)}</div>
                            </td>
                            <td style={td} rowSpan={g.itens.length}>{fmtData(g.nf?.data_emissao)}</td>
                            <td style={td} rowSpan={g.itens.length}>{g.fornecedor}</td>
                          </>}
                          <td style={td}>{i.descricao}</td>
                          <td style={{ ...td, textAlign: "right" }}>{fmtQ(Number(i.quantidade_original))}</td>
                          <td style={{ ...td, textAlign: "right" }}>{fmtQ(Number(i.quantidade_original) - Number(i.quantidade_saldo))}</td>
                          <td style={{ ...td, textAlign: "right", fontWeight: 600, color: Number(i.quantidade_saldo) > 0.0001 ? "#7A5200" : "var(--text-3)" }}>{fmtQ(Number(i.quantidade_saldo))}</td>
                          {k === 0 && <td style={td} rowSpan={g.itens.length}><span style={{ fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 8, background: sit.bg, color: sit.c }}>{sit.r}</span></td>}
                        </tr>
                      ))}
                      {aberto && (
                        <tr><td colSpan={8} style={{ ...td, background: "#F4F6FA", padding: "8px 16px 12px 34px" }}>
                          <div style={{ fontSize: 11, fontWeight: 700, color: "#0B2D50", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 6 }}>Remessas recebidas ({porRemessa.size})</div>
                          {porRemessa.size === 0 ? <div style={{ fontSize: 12, color: "var(--text-3)" }}>Nenhuma remessa ligada a este faturamento ainda.</div> : (
                            <table style={{ borderCollapse: "collapse", fontSize: 12 }}><tbody>
                              {[...porRemessa.entries()].map(([rid, r]) => (
                                <tr key={rid}><td style={{ padding: "2px 12px 2px 0", fontWeight: 600 }}>NF {nfs.get(rid)?.numero ?? "—"}</td><td style={{ padding: "2px 12px 2px 0" }}>{fmtData(nfs.get(rid)?.data_emissao)}</td><td style={{ padding: "2px 12px 2px 0", color: "var(--text-2)" }}>{[...r.produtos].join(", ")}</td><td style={{ padding: "2px 0", textAlign: "right" }}>{fmtQ(r.qtd)}</td></tr>
                              ))}
                            </tbody></table>
                          )}
                        </td></tr>
                      )}
                    </Fragment>
                  );
                })}
            </tbody>
          </table>
        </div>
        <div style={{ fontSize: 11, color: "var(--text-3)", marginTop: 8 }}>O faturamento entra aqui quando a NF de simples faturamento é processada como &quot;Entrega Futura (VEF)&quot;; cada NF de remessa processada como &quot;Entrega de compra futura&quot; baixa o saldo. Remessas processadas antes de 29/10/2026 baixaram o saldo, mas não ficaram ligadas ao faturamento.</div>
      </div>
    </div>
  );
}
