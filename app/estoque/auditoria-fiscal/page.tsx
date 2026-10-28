"use client";
// Auditor de estoque de insumos: Fiscal (NFs) × Físico (saldo do sistema), por fazenda ou consolidado do cliente.
// Regra em lib/estoque/auditoria-fiscal.ts (testada). Só leitura — não altera nada.
import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { useAuth } from "../../../components/AuthProvider";
import TopNav from "../../../components/TopNav";
import InputData from "../../../components/InputData";
import { OperationalButton, OperationalHeading } from "../../../components/OperationalUI";
import { supabase } from "../../../lib/supabase";
import { hojeLocal } from "../../../lib/data-local";
import { auditarFiscalFisico, situacaoLinha, CATEGORIAS, type Categoria, type LinhaAud, type MovAud, type NfItemAud, type TransfItemAud } from "../../../lib/estoque/auditoria-fiscal";

type InsumoInfo = { id: string; nome: string; unidade: string | null; categoria: string | null };
const COLS_CAT: { k: Categoria; rot: string }[] = [
  { k: "consumo", rot: "Consumo" }, { k: "ajuste", rot: "Ajustes" }, { k: "apropriacao_direta", rot: "Apropr. direta" },
  { k: "entrada_sem_nf", rot: "Entrada s/ NF" }, { k: "transferencia_sem_nf", rot: "Transf. s/ NF" }, { k: "perda", rot: "Perdas" },
  { k: "remessa", rot: "Remessa/retorno" }, { k: "nf_divergente", rot: "NF × estoque" },
];
const SIT = {
  erro: { rot: "Não fecha", bg: "#FEF2F2", cor: "#B91C1C" },
  atencao: { rot: "Atenção", bg: "#FBF3E0", cor: "#7A5200" },
  ok: { rot: "Explicado", bg: "#DCFCE7", cor: "#166534" },
} as const;
const fmtQ = (v: number) => Math.abs(v) < 0.0005 ? "—" : v.toLocaleString("pt-BR", { maximumFractionDigits: 3 });
const th: CSSProperties = { padding: "7px 8px", fontSize: 11, fontWeight: 600, color: "var(--text-2)", textAlign: "right", whiteSpace: "nowrap", borderBottom: "0.5px solid var(--border-table)", background: "var(--bg-page)", position: "sticky", top: 0 };
const td: CSSProperties = { padding: "6px 8px", fontSize: 12, textAlign: "right", fontVariantNumeric: "tabular-nums", borderBottom: "0.5px solid var(--border-table)" };
const inp: CSSProperties = { padding: "7px 10px", border: "0.5px solid var(--border-table)", borderRadius: 8, fontSize: 13, background: "var(--bg-input)", color: "var(--text-1)" };

async function todas<T>(consulta: (de: number, ate: number) => PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>): Promise<T[]> {
  const out: T[] = [];
  for (let i = 0; ; i += 1000) {
    const { data, error } = await consulta(i, i + 999);
    if (error) throw new Error(error.message);
    out.push(...((data ?? []) as T[]));
    if (!data || data.length < 1000) break;
  }
  return out;
}

export default function AuditoriaFiscalEstoque() {
  const { fazendaIds, fazendaId } = useAuth();
  const ids = useMemo(() => (fazendaIds?.length ? fazendaIds : fazendaId ? [fazendaId] : []), [fazendaIds, fazendaId]);
  const [ate, setAte] = useState(hojeLocal());
  const [visao, setVisao] = useState<"fazenda" | "cliente">("cliente");
  const [fazFiltro, setFazFiltro] = useState("");
  const [sitFiltro, setSitFiltro] = useState<"" | "erro" | "atencao" | "ok">("");
  const [busca, setBusca] = useState("");
  const [fazendas, setFazendas] = useState<{ id: string; nome: string }[]>([]);
  const [insumos, setInsumos] = useState<Map<string, InsumoInfo>>(new Map());
  const [linhas, setLinhas] = useState<LinhaAud[]>([]);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState("");

  async function carregar() {
    if (!ids.length) return;
    setCarregando(true); setErro("");
    try {
      const { data: fz } = await supabase.from("fazendas").select("id, nome").in("id", ids).order("nome");
      setFazendas((fz ?? []) as { id: string; nome: string }[]);
      // NFs de entrada processadas até a data
      const nfs = await todas<{ id: string; fazenda_id: string }>((a, b) => supabase.from("nf_entradas").select("id, fazenda_id")
        .in("fazenda_id", ids).eq("status", "processada").lte("data_emissao", ate).order("id").range(a, b));
      const fazDaNf = new Map(nfs.map(n => [n.id, n.fazenda_id]));
      const nfItens: NfItemAud[] = [];
      for (let k = 0; k < nfs.length; k += 150) {
        const lote = nfs.slice(k, k + 150).map(n => n.id);
        const its = await todas<{ nf_entrada_id: string; insumo_id: string; quantidade: number; tipo_apropiacao: string | null; cfop: string | null }>((a, b) =>
          supabase.from("nf_entrada_itens").select("id, nf_entrada_id, insumo_id, quantidade, tipo_apropiacao, cfop").in("nf_entrada_id", lote).not("insumo_id", "is", null).order("id").range(a, b));
        for (const i of its) nfItens.push({ ...i, quantidade: Number(i.quantidade ?? 0), fazenda_id: fazDaNf.get(i.nf_entrada_id)! });
      }
      // Movimentações até a data
      const movs = (await todas<MovAud & { quantidade: number }>((a, b) => supabase.from("movimentacoes_estoque")
        .select("id, fazenda_id, insumo_id, tipo, quantidade, motivo, nf_entrada_id, nota_propria_externa_id, romaneio_entrada_id, operacao, ciclo_id")
        .in("fazenda_id", ids).lte("data", ate).not("insumo_id", "is", null).order("id").range(a, b))).map(m => ({ ...m, quantidade: Number(m.quantidade ?? 0) }));
      // Transferências entre fazendas (com ou sem NF) até a data
      const trs = await todas<{ id: string; numero: string; status: string; nf_chave: string | null; fazenda_origem_id: string; fazenda_destino_id: string }>((a, b) =>
        supabase.from("transferencias_estoque").select("id, numero, status, nf_chave, fazenda_origem_id, fazenda_destino_id")
          .or(`fazenda_origem_id.in.(${ids.join(",")}),fazenda_destino_id.in.(${ids.join(",")})`).lte("data_transferencia", ate).order("id").range(a, b));
      const transf: TransfItemAud[] = [];
      for (let k = 0; k < trs.length; k += 150) {
        const lote = trs.slice(k, k + 150);
        const its = await todas<{ transferencia_id: string; insumo_id: string; quantidade: number; fazenda_estoque_id: string | null }>((a, b) =>
          supabase.from("transferencias_estoque_itens").select("id, transferencia_id, insumo_id, quantidade, fazenda_estoque_id").in("transferencia_id", lote.map(t => t.id)).order("id").range(a, b));
        for (const i of its) {
          const t = lote.find(x => x.id === i.transferencia_id)!;
          transf.push({ numero: t.numero, status: t.status, com_nf: !!t.nf_chave, fazenda_origem_id: i.fazenda_estoque_id ?? t.fazenda_origem_id, fazenda_destino_id: t.fazenda_destino_id, insumo_id: i.insumo_id, quantidade: Number(i.quantidade ?? 0) });
        }
      }
      const res = auditarFiscalFisico(nfItens, movs, transf).filter(l => ids.includes(l.fazenda_id));
      // Nomes, unidades e categoria dos itens — só insumos (grãos ficam de fora por ora)
      const idsIns = [...new Set(res.map(l => l.insumo_id))];
      const mapa = new Map<string, InsumoInfo>();
      for (let k = 0; k < idsIns.length; k += 200) {
        const { data } = await supabase.from("insumos").select("id, nome, unidade, categoria").in("id", idsIns.slice(k, k + 200));
        for (const i of (data ?? []) as InsumoInfo[]) mapa.set(i.id, i);
      }
      setInsumos(mapa);
      setLinhas(res.filter(l => mapa.has(l.insumo_id) && mapa.get(l.insumo_id)!.categoria !== "produto_agricola"));
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    } finally {
      setCarregando(false);
    }
  }
  useEffect(() => { carregar(); }, [ids.join(","), ate]); // eslint-disable-line react-hooks/exhaustive-deps

  // Consolidado do cliente: soma as fazendas (estoque guardado numa fazenda com NF de outra se anula)
  const exibidas = useMemo(() => {
    let base = fazFiltro ? linhas.filter(l => l.fazenda_id === fazFiltro) : linhas;
    if (visao === "cliente") {
      const m = new Map<string, LinhaAud>();
      for (const l of base) {
        const a = m.get(l.insumo_id);
        if (!a) { m.set(l.insumo_id, { ...l, fazenda_id: "", categorias: { ...l.categorias } }); continue; }
        for (const k of ["fiscal", "fisico", "diferenca", "fiscal_nf", "fiscal_transf", "fiscal_devolucao", "nao_explicado"] as const) a[k] = Math.round((a[k] + l[k]) * 1000) / 1000;
        for (const c of Object.keys(a.categorias) as Categoria[]) a.categorias[c] = Math.round((a.categorias[c] + l.categorias[c]) * 1000) / 1000;
      }
      base = [...m.values()];
    }
    const t = busca.trim().toLowerCase();
    return base
      .filter(l => !t || (insumos.get(l.insumo_id)?.nome ?? "").toLowerCase().includes(t))
      .filter(l => !sitFiltro || situacaoLinha(l) === sitFiltro)
      .sort((a, b) => {
        const ord = { erro: 0, atencao: 1, ok: 2 };
        return ord[situacaoLinha(a)] - ord[situacaoLinha(b)] || (insumos.get(a.insumo_id)?.nome ?? "").localeCompare(insumos.get(b.insumo_id)?.nome ?? "");
      });
  }, [linhas, visao, fazFiltro, busca, sitFiltro, insumos]);

  const conta = (s: "erro" | "atencao" | "ok") => exibidas.filter(l => situacaoLinha(l) === s).length;
  const nomeFaz = (id: string) => fazendas.find(f => f.id === id)?.nome ?? "—";

  async function exportar() {
    const XLSX = await import("xlsx");
    const dados = exibidas.map(l => ({
      Item: insumos.get(l.insumo_id)?.nome ?? l.insumo_id, Unidade: insumos.get(l.insumo_id)?.unidade ?? "",
      ...(visao === "fazenda" ? { Fazenda: nomeFaz(l.fazenda_id) } : {}),
      Fiscal: l.fiscal, Físico: l.fisico, Diferença: l.diferenca,
      ...Object.fromEntries(COLS_CAT.map(c => [CATEGORIAS[c.k], l.categorias[c.k]])),
      Situação: SIT[situacaoLinha(l)].rot,
    }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(dados), "Fiscal x Físico");
    XLSX.writeFile(wb, `Auditor estoque fiscal x fisico ${ate}.xlsx`);
  }

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg-page)" }}>
      <TopNav />
      <div style={{ padding: "14px 20px" }}>
        <OperationalHeading data-arato-page-heading="true" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 10, gap: 12, flexWrap: "wrap" }}>
          <div>
            <h1 data-arato-h1="true" style={{ margin: 0, fontSize: 18, color: "#0B2D50" }}>Auditor de Estoque — Fiscal × Físico</h1>
            <div style={{ fontSize: 12, color: "var(--text-3)", marginTop: 2 }}>Insumos. Fiscal = NFs (entradas, transferências com NF, devoluções). Físico = saldo do sistema. A diferença é explicada por tipo de movimento.</div>
          </div>
          <OperationalButton data-arato-button="secondary" onClick={exportar} disabled={!exibidas.length} style={{ ...inp, cursor: "pointer", fontWeight: 600 }}>⬇ Exportar XLSX</OperationalButton>
        </OperationalHeading>

        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end", background: "#fff", border: "0.5px solid #DDE2EE", borderRadius: 10, padding: "10px 14px", marginBottom: 10 }}>
          <div><div style={{ fontSize: 11, color: "var(--text-2)", marginBottom: 3 }}>Posição até</div><InputData type="date" value={ate} onChange={e => setAte(e.target.value)} style={inp} /></div>
          <div><div style={{ fontSize: 11, color: "var(--text-2)", marginBottom: 3 }}>Visão</div>
            <select value={visao} onChange={e => setVisao(e.target.value as "fazenda" | "cliente")} style={inp}>
              <option value="fazenda">Por fazenda (IE)</option><option value="cliente">Consolidado do cliente</option>
            </select></div>
          <div><div style={{ fontSize: 11, color: "var(--text-2)", marginBottom: 3 }}>Fazenda</div>
            <select value={fazFiltro} onChange={e => setFazFiltro(e.target.value)} style={inp}>
              <option value="">Todas</option>{fazendas.map(f => <option key={f.id} value={f.id}>{f.nome}</option>)}
            </select></div>
          <div><div style={{ fontSize: 11, color: "var(--text-2)", marginBottom: 3 }}>Situação</div>
            <select value={sitFiltro} onChange={e => setSitFiltro(e.target.value as typeof sitFiltro)} style={inp}>
              <option value="">Todas</option><option value="erro">Não fecha</option><option value="atencao">Atenção</option><option value="ok">Explicado</option>
            </select></div>
          <div style={{ flex: "1 1 200px" }}><div style={{ fontSize: 11, color: "var(--text-2)", marginBottom: 3 }}>Buscar item</div><input value={busca} onChange={e => setBusca(e.target.value)} style={{ ...inp, width: "100%", boxSizing: "border-box" }} placeholder="Nome do insumo" /></div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 10, marginBottom: 10 }}>
          {([["erro", "NF × estoque não batem, ou físico negativo"], ["atencao", "Entrada ou transferência sem NF / físico acima do fiscal"], ["ok", "Diferença só de consumo, ajustes e apropriação direta"]] as const).map(([s, dica]) => (
            <button key={s} type="button" onClick={() => setSitFiltro(sitFiltro === s ? "" : s)} style={{ textAlign: "left", cursor: "pointer", background: SIT[s].bg, border: `0.5px solid ${sitFiltro === s ? SIT[s].cor : "transparent"}`, borderRadius: 10, padding: "10px 14px" }}>
              <div style={{ fontSize: 11, color: SIT[s].cor, fontWeight: 600 }}>{SIT[s].rot}</div>
              <div style={{ fontSize: 20, fontWeight: 700, color: SIT[s].cor }}>{conta(s)}</div>
              <div style={{ fontSize: 10, color: SIT[s].cor }}>{dica}</div>
            </button>
          ))}
        </div>

        {erro && <div style={{ padding: 10, background: "#FEF2F2", color: "#B91C1C", borderRadius: 8, fontSize: 12, marginBottom: 10 }}>{erro}</div>}

        <div style={{ background: "#fff", border: "0.5px solid #DDE2EE", borderRadius: 12, overflow: "auto", maxHeight: "calc(100vh - 330px)" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead><tr>
              <th style={{ ...th, textAlign: "left" }}>Item</th>
              {visao === "fazenda" && <th style={{ ...th, textAlign: "left" }}>Fazenda</th>}
              <th style={th}>Fiscal</th><th style={th}>Físico</th><th style={th}>Diferença</th>
              {COLS_CAT.map(c => <th key={c.k} style={{ ...th, fontWeight: 400 }} title={CATEGORIAS[c.k]}>{c.rot}</th>)}
              <th style={{ ...th, textAlign: "center" }}>Situação</th>
            </tr></thead>
            <tbody>
              {carregando ? <tr><td colSpan={13} style={{ ...td, textAlign: "center", color: "var(--text-3)", padding: 24 }}>Calculando…</td></tr>
                : !exibidas.length ? <tr><td colSpan={13} style={{ ...td, textAlign: "center", color: "var(--text-3)", padding: 24 }}>Nenhum item para os filtros.</td></tr>
                : exibidas.map(l => {
                  const s = situacaoLinha(l); const ins = insumos.get(l.insumo_id);
                  return (
                    <tr key={`${l.fazenda_id}|${l.insumo_id}`}>
                      <td style={{ ...td, textAlign: "left" }}>{ins?.nome ?? "—"} <span style={{ color: "var(--text-3)", fontSize: 11 }}>{ins?.unidade ?? ""}</span></td>
                      {visao === "fazenda" && <td style={{ ...td, textAlign: "left", color: "var(--text-2)" }}>{nomeFaz(l.fazenda_id)}</td>}
                      <td style={td}>{fmtQ(l.fiscal)}</td>
                      <td style={td}>{fmtQ(l.fisico)}</td>
                      <td style={{ ...td, fontWeight: 600, color: Math.abs(l.diferenca) < 0.0005 ? "var(--text-3)" : l.diferenca < 0 ? "#B91C1C" : "#7A5200" }}>{fmtQ(l.diferenca)}</td>
                      {COLS_CAT.map(c => <td key={c.k} style={{ ...td, color: c.k === "nf_divergente" && Math.abs(l.categorias[c.k]) > 0.0005 ? "#B91C1C" : "var(--text-2)" }}>{fmtQ(l.categorias[c.k])}</td>)}
                      <td style={{ ...td, textAlign: "center" }}><span style={{ fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 8, background: SIT[s].bg, color: SIT[s].cor }}>{SIT[s].rot}</span></td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>
        <div style={{ fontSize: 11, color: "var(--text-3)", marginTop: 8 }}>
          Diferença = Físico − Fiscal = soma das colunas à direita. &quot;NF × estoque&quot; ≠ 0 indica NF processada que não movimentou o estoque (ou movimentou em dobro / quantidade diferente). Remessa e retorno de armazém não mudam o fiscal: o produto continua seu.
        </div>
      </div>
    </div>
  );
}
