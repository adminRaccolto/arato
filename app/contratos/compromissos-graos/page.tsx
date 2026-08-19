"use client";
import { useState, useEffect, useCallback } from "react";
import TopNav from "../../../components/TopNav";
import { useAuth } from "../../../components/AuthProvider";
import { createBrowserClient } from "@supabase/ssr";

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
);

type Compromisso = {
  id: string;
  numero: string;
  produto: string;
  quantidade_sc: number;
  entregue_sc: number;
  preco: number | null;
  data_contrato: string | null;
  data_entrega: string;
  status: "aberto" | "parcial" | "encerrado" | "cancelado";
  comprador: string;
  pessoa_id: string | null;
  produtor_id: string | null;
  ano_safra_id: string | null;
  ciclo_id: string | null;
  is_arrendamento: boolean;
  arrendamento_id: string | null;
  is_compra_terra: boolean;
  cct_pagamento_id: string | null;
  is_barter: boolean;
  pedido_compra_id: string | null;
  observacao: string | null;
  // joined
  pessoa_nome?: string;
  produtor_nome?: string;
  ano_safra_desc?: string;
};

type Commodity = "Soja" | "Milho" | "Algodão" | "Trigo" | "Sorgo";

const COMMODITIES: Commodity[] = ["Soja", "Milho", "Algodão", "Trigo", "Sorgo"];

const ORIGEM_LABEL: Record<string, string> = {
  arrendamento: "Arrendamento",
  compra_terra: "Compra de Terra",
  barter:       "Barter",
};

const STATUS_COLOR: Record<string, string> = {
  aberto:     "#1A4870",
  parcial:    "#EF9F27",
  encerrado:  "#16A34A",
  cancelado:  "#E24B4A",
};

const PROD_COLOR: Record<string, string> = {
  Soja:    "#16A34A",
  Milho:   "#C9921B",
  Algodão: "#8B5CF6",
  Trigo:   "#EF9F27",
  Sorgo:   "#E24B4A",
};

function getOrigem(c: Compromisso): string {
  if (c.is_arrendamento) return "arrendamento";
  if (c.is_compra_terra) return "compra_terra";
  if (c.is_barter)       return "barter";
  return "outro";
}

function fmtSc(v: number | null | undefined) {
  if (v == null) return "—";
  return v.toLocaleString("pt-BR", { minimumFractionDigits: 3, maximumFractionDigits: 3 }) + " sc";
}
function fmtBRL(v: number | null | undefined) {
  if (v == null || v === 0) return "—";
  return "R$ " + v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtDate(d: string | null | undefined) {
  if (!d) return "—";
  const [y, m, dd] = d.split("-");
  return `${dd}/${m}/${y}`;
}

export default function CompromissosGraosPage() {
  const { fazendaId, fazendaIds } = useAuth();

  const [items, setItems]   = useState<Compromisso[]>([]);
  const [loading, setLoading] = useState(false);

  // Filtros
  const [filtroProduto, setFiltroProduto] = useState<string>("todos");
  const [filtroOrigem, setFiltroOrigem]   = useState<string>("todos");
  const [filtroStatus, setFiltroStatus]   = useState<string>("aberto");
  const [filtroSafra, setFiltroSafra]     = useState<string>("todos");
  const [busca, setBusca]                 = useState("");

  const [safras, setSafras] = useState<{ id: string; descricao: string }[]>([]);

  const carregar = useCallback(async () => {
    if (!fazendaId) return;
    setLoading(true);
    try {
      const ids = fazendaIds?.length ? fazendaIds : [fazendaId];

      const [{ data }, { data: safrasData }] = await Promise.all([
        supabase
          .from("contratos")
          .select(`
            id, numero, produto, quantidade_sc, entregue_sc, preco,
            data_contrato, data_entrega, status, comprador,
            pessoa_id, produtor_id, ano_safra_id, ciclo_id,
            is_arrendamento, arrendamento_id,
            is_compra_terra, cct_pagamento_id,
            is_barter, pedido_compra_id,
            observacao,
            pessoas:pessoa_id(nome),
            produtores:produtor_id(nome),
            anos_safra:ano_safra_id(descricao)
          `)
          .in("fazenda_id", ids)
          .or("is_arrendamento.eq.true,is_compra_terra.eq.true,is_barter.eq.true")
          .order("data_entrega", { ascending: true }),
        supabase
          .from("anos_safra")
          .select("id, descricao")
          .in("fazenda_id", ids)
          .order("descricao", { ascending: false }),
      ]);

      setSafras(safrasData ?? []);

      const list: Compromisso[] = (data ?? []).map((r: Record<string, unknown>) => ({
        id:               r.id as string,
        numero:           r.numero as string,
        produto:          r.produto as string,
        quantidade_sc:    (r.quantidade_sc as number) ?? 0,
        entregue_sc:      (r.entregue_sc as number) ?? 0,
        preco:            r.preco as number | null,
        data_contrato:    r.data_contrato as string | null,
        data_entrega:     r.data_entrega as string,
        status:           r.status as Compromisso["status"],
        comprador:        r.comprador as string,
        pessoa_id:        r.pessoa_id as string | null,
        produtor_id:      r.produtor_id as string | null,
        ano_safra_id:     r.ano_safra_id as string | null,
        ciclo_id:         r.ciclo_id as string | null,
        is_arrendamento:  (r.is_arrendamento as boolean) ?? false,
        arrendamento_id:  r.arrendamento_id as string | null,
        is_compra_terra:  (r.is_compra_terra as boolean) ?? false,
        cct_pagamento_id: r.cct_pagamento_id as string | null,
        is_barter:        (r.is_barter as boolean) ?? false,
        pedido_compra_id: r.pedido_compra_id as string | null,
        observacao:       r.observacao as string | null,
        pessoa_nome:      (r.pessoas as Record<string, string> | null)?.nome ?? (r.comprador as string),
        produtor_nome:    (r.produtores as Record<string, string> | null)?.nome ?? undefined,
        ano_safra_desc:   (r.anos_safra as Record<string, string> | null)?.descricao ?? undefined,
      }));

      setItems(list);
    } finally {
      setLoading(false);
    }
  }, [fazendaId, fazendaIds]);

  useEffect(() => { carregar(); }, [carregar]);

  // Filtrados
  const filtrados = items.filter(c => {
    if (filtroStatus !== "todos" && c.status !== filtroStatus) return false;
    if (filtroProduto !== "todos" && c.produto !== filtroProduto) return false;
    if (filtroOrigem !== "todos" && getOrigem(c) !== filtroOrigem) return false;
    if (filtroSafra !== "todos" && c.ano_safra_id !== filtroSafra) return false;
    if (busca) {
      const q = busca.toLowerCase();
      if (
        !c.numero?.toLowerCase().includes(q) &&
        !c.comprador?.toLowerCase().includes(q) &&
        !c.produto?.toLowerCase().includes(q)
      ) return false;
    }
    return true;
  });

  // KPIs por commodity
  const kpiPorCommodity = COMMODITIES.map(prod => {
    const rows = filtrados.filter(c => c.produto === prod);
    if (rows.length === 0) return null;
    const sacas    = rows.reduce((s, c) => s + c.quantidade_sc, 0);
    const entregue = rows.reduce((s, c) => s + c.entregue_sc, 0);
    const saldo    = sacas - entregue;
    const valorEst = rows.reduce((s, c) => s + (c.preco ?? 0) * (c.quantidade_sc - c.entregue_sc), 0);
    return { prod, sacas, entregue, saldo, valorEst, count: rows.length };
  }).filter(Boolean) as { prod: string; sacas: number; entregue: number; saldo: number; valorEst: number; count: number }[];

  const totalSacas    = filtrados.reduce((s, c) => s + c.quantidade_sc, 0);
  const totalEntregue = filtrados.reduce((s, c) => s + c.entregue_sc, 0);
  const totalSaldo    = totalSacas - totalEntregue;

  const inp: React.CSSProperties = { width: "100%", padding: "7px 10px", border: "0.5px solid #DDE2EE", borderRadius: 6, fontSize: 13, boxSizing: "border-box" as const, background: "#fff" };
  const lbl: React.CSSProperties = { display: "block", fontSize: 11, fontWeight: 600, color: "#555", marginBottom: 4, textTransform: "uppercase" as const, letterSpacing: "0.04em" };

  return (
    <div style={{ minHeight: "100vh", background: "#F4F6FA" }}>
      <TopNav />

      <div style={{ maxWidth: 1280, margin: "0 auto", padding: "24px 20px" }}>

        {/* Cabeçalho */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
          <div>
            <h1 style={{ fontSize: 20, fontWeight: 700, color: "#1A4870", margin: 0 }}>Compromissos em Grãos</h1>
            <p style={{ fontSize: 13, color: "#666", margin: "4px 0 0" }}>
              Sacas comprometidas por arrendamento, compra de terra e barter — relatório consolidado
            </p>
          </div>
          <button
            onClick={() => window.print()}
            style={{ background: "#fff", color: "#1A4870", border: "0.5px solid #1A4870", borderRadius: 8, padding: "8px 16px", fontSize: 13, fontWeight: 600, cursor: "pointer" }}
            className="no-print"
          >
            🖨 Imprimir
          </button>
        </div>

        {/* Filtros */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr 2fr", gap: 12, marginBottom: 20, background: "#fff", padding: 16, borderRadius: 10, border: "0.5px solid #DDE2EE" }} className="no-print">
          <div>
            <label style={lbl}>Status</label>
            <select value={filtroStatus} onChange={e => setFiltroStatus(e.target.value)} style={inp}>
              <option value="todos">Todos</option>
              <option value="aberto">Aberto</option>
              <option value="parcial">Parcial</option>
              <option value="encerrado">Encerrado</option>
            </select>
          </div>
          <div>
            <label style={lbl}>Commodity</label>
            <select value={filtroProduto} onChange={e => setFiltroProduto(e.target.value)} style={inp}>
              <option value="todos">Todas</option>
              {COMMODITIES.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
          <div>
            <label style={lbl}>Origem</label>
            <select value={filtroOrigem} onChange={e => setFiltroOrigem(e.target.value)} style={inp}>
              <option value="todos">Todas</option>
              <option value="arrendamento">Arrendamento</option>
              <option value="compra_terra">Compra de Terra</option>
              <option value="barter">Barter</option>
            </select>
          </div>
          <div>
            <label style={lbl}>Safra</label>
            <select value={filtroSafra} onChange={e => setFiltroSafra(e.target.value)} style={inp}>
              <option value="todos">Todas</option>
              {safras.map(s => <option key={s.id} value={s.id}>{s.descricao}</option>)}
            </select>
          </div>
          <div>
            <label style={lbl}>Busca</label>
            <input
              type="text"
              placeholder="Nº contrato, contraparte, produto…"
              value={busca}
              onChange={e => setBusca(e.target.value)}
              style={inp}
            />
          </div>
        </div>

        {/* KPI cards — totais */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginBottom: 20 }}>
          {[
            { label: "Sacas Comprometidas", val: fmtSc(totalSacas),    sub: `${filtrados.length} contrato${filtrados.length !== 1 ? "s" : ""}` },
            { label: "Sacas Entregues",     val: fmtSc(totalEntregue), sub: totalSacas > 0 ? `${((totalEntregue/totalSacas)*100).toFixed(1)}% do total` : "—" },
            { label: "Saldo a Entregar",    val: fmtSc(totalSaldo),    sub: "em aberto", color: totalSaldo > 0 ? "#E24B4A" : "#16A34A" },
          ].map(k => (
            <div key={k.label} style={{ background: "#fff", borderRadius: 10, padding: "14px 18px", border: "0.5px solid #DDE2EE" }}>
              <div style={{ fontSize: 11, color: "#888", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em" }}>{k.label}</div>
              <div style={{ fontSize: 20, fontWeight: 700, color: k.color ?? "#1A4870", margin: "6px 0 2px", fontVariantNumeric: "tabular-nums" }}>{k.val}</div>
              <div style={{ fontSize: 11, color: "#888" }}>{k.sub}</div>
            </div>
          ))}
        </div>

        {/* KPI por commodity */}
        {kpiPorCommodity.length > 0 && (
          <div style={{ display: "grid", gridTemplateColumns: `repeat(${Math.min(kpiPorCommodity.length, 4)}, 1fr)`, gap: 12, marginBottom: 20 }}>
            {kpiPorCommodity.map(k => (
              <div key={k.prod} style={{ background: "#fff", borderRadius: 10, padding: "14px 18px", border: "0.5px solid #DDE2EE", borderLeft: `3px solid ${PROD_COLOR[k.prod] ?? "#1A4870"}` }}>
                <div style={{ fontSize: 11, color: PROD_COLOR[k.prod] ?? "#888", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 6 }}>
                  {k.prod}
                </div>
                <div style={{ fontSize: 15, fontWeight: 700, color: "#1a1a1a", fontVariantNumeric: "tabular-nums" }}>{fmtSc(k.sacas)}</div>
                <div style={{ fontSize: 11, color: "#888", marginTop: 2 }}>comprometidas · {k.count} contrato{k.count !== 1 ? "s" : ""}</div>
                <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8, fontSize: 11 }}>
                  <span style={{ color: "#16A34A" }}>Entregue: {fmtSc(k.entregue)}</span>
                  <span style={{ color: k.saldo > 0 ? "#E24B4A" : "#16A34A", fontWeight: 600 }}>Saldo: {fmtSc(k.saldo)}</span>
                </div>
                <div style={{ height: 4, background: "#F0F0F0", borderRadius: 4, marginTop: 8 }}>
                  <div style={{ height: 4, borderRadius: 4, background: PROD_COLOR[k.prod] ?? "#1A4870", width: k.sacas > 0 ? `${Math.min(100, (k.entregue/k.sacas)*100)}%` : "0%" }} />
                </div>
                {k.valorEst > 0 && (
                  <div style={{ fontSize: 11, color: "#888", marginTop: 6 }}>
                    Valor est. saldo: {fmtBRL(k.valorEst)}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Tabela */}
        <div style={{ background: "#fff", borderRadius: 10, border: "0.5px solid #DDE2EE", overflow: "hidden" }}>
          <div style={{ padding: "14px 18px", borderBottom: "0.5px solid #DDE2EE" }}>
            <span style={{ fontWeight: 600, color: "#1A4870", fontSize: 14 }}>
              {filtrados.length} compromisso{filtrados.length !== 1 ? "s" : ""}
            </span>
          </div>

          {loading ? (
            <div style={{ padding: 40, textAlign: "center", color: "#888", fontSize: 13 }}>Carregando…</div>
          ) : filtrados.length === 0 ? (
            <div style={{ padding: 40, textAlign: "center", color: "#888", fontSize: 13 }}>
              Nenhum compromisso com os filtros selecionados.
            </div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                <thead>
                  <tr style={{ background: "#F4F6FA" }}>
                    {["Nº", "Commodity", "Origem", "Contraparte", "Safra", "Entrega", "Comprometido", "Entregue", "Saldo", "Preço Ref.", "Status"].map(h => (
                      <th key={h} style={{ padding: "10px 12px", textAlign: "left", fontWeight: 600, fontSize: 11, color: "#555", textTransform: "uppercase", letterSpacing: "0.04em", borderBottom: "0.5px solid #DDE2EE", whiteSpace: "nowrap" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtrados.map((c, i) => {
                    const saldo = c.quantidade_sc - c.entregue_sc;
                    const org   = getOrigem(c);
                    return (
                      <tr key={c.id} style={{ background: i % 2 === 0 ? "#fff" : "#FAFBFC" }}>
                        <td style={{ padding: "10px 12px", color: "#1A4870", fontWeight: 600, whiteSpace: "nowrap" }}>{c.numero}</td>
                        <td style={{ padding: "10px 12px" }}>
                          <span style={{ display: "inline-block", padding: "2px 8px", borderRadius: 20, fontSize: 11, fontWeight: 700, background: `${PROD_COLOR[c.produto] ?? "#888"}22`, color: PROD_COLOR[c.produto] ?? "#888" }}>
                            {c.produto}
                          </span>
                        </td>
                        <td style={{ padding: "10px 12px" }}>
                          <span style={{
                            display: "inline-block", padding: "2px 8px", borderRadius: 20, fontSize: 11, fontWeight: 600,
                            background: org === "arrendamento" ? "#D5E8F5" : org === "compra_terra" ? "#FBF3E0" : "#EDE9FE",
                            color:      org === "arrendamento" ? "#1A4870"  : org === "compra_terra" ? "#C9921B"  : "#7C3AED",
                          }}>
                            {ORIGEM_LABEL[org] ?? "—"}
                          </span>
                        </td>
                        <td style={{ padding: "10px 12px", maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {c.pessoa_nome ?? c.comprador ?? "—"}
                        </td>
                        <td style={{ padding: "10px 12px", color: "#555", whiteSpace: "nowrap" }}>
                          {c.ano_safra_desc ?? "—"}
                        </td>
                        <td style={{ padding: "10px 12px", color: "#555", whiteSpace: "nowrap" }}>
                          {fmtDate(c.data_entrega)}
                        </td>
                        <td style={{ padding: "10px 12px", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>
                          {fmtSc(c.quantidade_sc)}
                        </td>
                        <td style={{ padding: "10px 12px", fontVariantNumeric: "tabular-nums", color: "#16A34A", whiteSpace: "nowrap" }}>
                          {fmtSc(c.entregue_sc)}
                        </td>
                        <td style={{ padding: "10px 12px", fontVariantNumeric: "tabular-nums", color: saldo > 0 ? "#E24B4A" : "#16A34A", fontWeight: 600, whiteSpace: "nowrap" }}>
                          {fmtSc(saldo)}
                        </td>
                        <td style={{ padding: "10px 12px", color: "#555", whiteSpace: "nowrap" }}>
                          {c.preco ? fmtBRL(c.preco) + "/sc" : "—"}
                        </td>
                        <td style={{ padding: "10px 12px" }}>
                          <span style={{ display: "inline-block", padding: "2px 8px", borderRadius: 20, fontSize: 11, fontWeight: 600, background: `${STATUS_COLOR[c.status] ?? "#888"}22`, color: STATUS_COLOR[c.status] ?? "#888" }}>
                            {c.status.charAt(0).toUpperCase() + c.status.slice(1)}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr style={{ background: "#F4F6FA", fontWeight: 700 }}>
                    <td colSpan={6} style={{ padding: "10px 12px", fontSize: 12, color: "#1A4870" }}>Total</td>
                    <td style={{ padding: "10px 12px", fontSize: 12, fontVariantNumeric: "tabular-nums" }}>{fmtSc(totalSacas)}</td>
                    <td style={{ padding: "10px 12px", fontSize: 12, fontVariantNumeric: "tabular-nums", color: "#16A34A" }}>{fmtSc(totalEntregue)}</td>
                    <td style={{ padding: "10px 12px", fontSize: 12, fontVariantNumeric: "tabular-nums", color: totalSaldo > 0 ? "#E24B4A" : "#16A34A" }}>{fmtSc(totalSaldo)}</td>
                    <td colSpan={2} />
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>
      </div>

      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { background: white; }
          thead { display: table-header-group; }
          tbody tr { page-break-inside: avoid; }
          table { page-break-inside: auto; }
        }
      `}</style>
    </div>
  );
}
