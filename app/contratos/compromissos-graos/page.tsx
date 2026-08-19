"use client";
import { useState, useEffect, useCallback } from "react";
import TopNav from "../../../components/TopNav";
import { useAuth } from "../../../components/AuthProvider";
import { createBrowserClient } from "@supabase/ssr";

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
);

// ── Tipos ──────────────────────────────────────────────────────────────────────
type Origem    = "compra_terra" | "arrendamento" | "barter";
type Commodity = "soja" | "milho" | "algodao" | "trigo" | "sorgo";
type Status    = "pendente" | "parcial" | "entregue" | "vencido";

interface Compromisso {
  id:            string;          // origem_id (cct_pg.id / arr_pg.id / barter.id)
  origem:        Origem;
  descricao:     string;
  contraparte:   string;
  commodity:     Commodity;
  data_vencimento: string;
  sacas_previstas: number;
  sacas_entregues: number;
  sacas_aberto:    number;
  preco_sc_ref:  number | null;
  status:        Status;
  ano_safra_nome?: string;
  obs?:          string;
}

interface Barter {
  id:            string;
  fazenda_id:    string;
  conta_id?:     string | null;
  fornecedor_id?: string | null;
  fornecedor_nome?: string | null;
  descricao:     string;
  commodity:     Commodity;
  sacas_total:   number;
  sacas_entregues: number;
  preco_sc_ref?: number | null;
  valor_insumos?: number | null;
  ano_safra_id?: string | null;
  ciclo_id?:     string | null;
  data_entrega:  string;
  status:        string;
  observacao?:   string | null;
}

interface AnoSafra { id: string; descricao: string }
interface Pessoa   { id: string; nome: string }

// ── Constantes ─────────────────────────────────────────────────────────────────
const ORIGEM_META: Record<Origem, { label: string; bg: string; cl: string }> = {
  compra_terra:  { label: "Compra de Terra", bg: "#EDE9FB", cl: "#4B3B9B" },
  arrendamento:  { label: "Arrendamento",    bg: "#FBF3E0", cl: "#7A5A12" },
  barter:        { label: "Barter",          bg: "#E6F1FB", cl: "#0C447C" },
};

const COMMODITY_LABEL: Record<string, string> = {
  soja: "Soja", milho: "Milho", algodao: "Algodão", trigo: "Trigo", sorgo: "Sorgo",
};

const STATUS_META: Record<Status, { label: string; bg: string; cl: string }> = {
  pendente:  { label: "Pendente",  bg: "#FEF3C7", cl: "#92400E" },
  parcial:   { label: "Parcial",   bg: "#DBEAFE", cl: "#1E40AF" },
  entregue:  { label: "Entregue",  bg: "#D1FAE5", cl: "#065F46" },
  vencido:   { label: "Vencido",   bg: "#FEE2E2", cl: "#991B1B" },
};

const fmtSc  = (v: number) => v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " sc";
const fmtBRL = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fmtData = (s: string) => { const [y, m, d] = s.slice(0, 10).split("-"); return `${d}/${m}/${y}`; };
const hoje = new Date().toISOString().slice(0, 10);

const BLANK_BARTER = {
  fornecedor_id: "", descricao: "", commodity: "soja" as Commodity,
  sacas_total: "", preco_sc_ref: "", valor_insumos: "",
  ano_safra_id: "", ciclo_id: "", data_entrega: "", observacao: "",
};

// ── Componente ─────────────────────────────────────────────────────────────────
export default function CompromissosGraos() {
  const { fazendaId, fazendaIds, contaId } = useAuth();

  const [compromissos, setCompromissos] = useState<Compromisso[]>([]);
  const [barters,      setBarters]      = useState<Barter[]>([]);
  const [anosSafra,    setAnosSafra]    = useState<AnoSafra[]>([]);
  const [pessoas,      setPessoas]      = useState<Pessoa[]>([]);
  const [precos,       setPrecos]       = useState<Record<string, number>>({});
  const [loading,      setLoading]      = useState(true);

  // Filtros
  const [fOrigem,    setFOrigem]    = useState<Origem | "">("");
  const [fCommodity, setFCommodity] = useState<Commodity | "">("");
  const [fStatus,    setFStatus]    = useState<"" | "pendente" | "entregue">("");
  const [fBusca,     setFBusca]     = useState("");

  // Modal Novo Barter
  const [modalBarter, setModalBarter] = useState(false);
  const [formBarter,  setFormBarter]  = useState(BLANK_BARTER);
  const [salvando,    setSalvando]    = useState(false);

  // Modal Baixar
  const [modalBaixar, setModalBaixar] = useState<Compromisso | null>(null);
  const [fBaixaData,  setFBaixaData]  = useState(hoje);
  const [fBaixaSacas, setFBaixaSacas] = useState("");
  const [baixando,    setBaixando]    = useState(false);

  // ── Carregar ──────────────────────────────────────────────────────────────
  const carregar = useCallback(async () => {
    if (!fazendaId) return;
    setLoading(true);
    const ids = fazendaIds?.length ? fazendaIds : [fazendaId];

    const [
      { data: cctPgs },
      { data: arrPgs },
      { data: barterRows },
      { data: anos },
      { data: pess },
      precosResult,
    ] = await Promise.all([
      // cct_pagamentos com sacas
      supabase.from("cct_pagamentos")
        .select(`id, contrato_id, data_vencimento, quantidade_sacas, produto, preco_sc_ref, status, moeda_parcela,
                 contratos_compra_terra!inner(imovel_nome, fazenda_id, conta_id,
                   vendedor:pessoas!contratos_compra_terra_vendedor_id_fkey(nome))`)
        .in("contratos_compra_terra.fazenda_id", ids)
        .in("moeda_parcela", ["saca_soja", "saca_milho", "saca_algodao"]),

      // arrendamento_pagamentos com sacas
      supabase.from("arrendamento_pagamentos")
        .select(`id, data_vencimento, sacas_previstas, sacas_pagas, commodity, preco_sc_referencia, status,
                 arrendamentos!inner(descricao, fazenda_id, forma_pagamento,
                   proprietario:pessoas!arrendamentos_proprietario_id_fkey(nome))`)
        .in("arrendamentos.fazenda_id", ids)
        .not("commodity", "is", null),

      // barter
      supabase.from("barter_compromissos")
        .select(`*, fornecedor:pessoas!barter_compromissos_fornecedor_id_fkey(nome)`)
        .in("fazenda_id", ids)
        .order("data_entrega"),

      supabase.from("anos_safra").select("id,descricao").order("descricao", { ascending: false }),
      supabase.from("pessoas").select("id,nome").order("nome"),
      fetch("/api/precos").then(r => r.json()).catch(() => ({})),
    ]);

    setAnosSafra((anos ?? []) as AnoSafra[]);
    setPessoas((pess ?? []) as Pessoa[]);
    setBarters((barterRows ?? []) as Barter[]);

    // PTAX para conversão USD se houver
    const pc: Record<string, number> = {};
    if (precosResult?.sojaReaisSc)  pc.soja    = precosResult.sojaReaisSc;
    if (precosResult?.milhoReaisSc) pc.milho   = precosResult.milhoReaisSc;
    setPrecos(pc);

    const lista: Compromisso[] = [];

    // 1. Compra de Terra
    for (const pg of (cctPgs ?? []) as any[]) {
      const cct  = pg.contratos_compra_terra;
      const prod = MOEDA_PARA_COMMODITY[pg.moeda_parcela as string] ?? "soja";
      const sc   = pg.quantidade_sacas ?? 0;
      const statusNorm: Status =
        pg.status === "pago"     ? "entregue" :
        pg.status === "atrasado" ? "vencido"  : "pendente";
      lista.push({
        id:              pg.id,
        origem:          "compra_terra",
        descricao:       cct?.imovel_nome ?? "Compra de Terra",
        contraparte:     (cct?.vendedor as any)?.nome ?? "—",
        commodity:       prod as Commodity,
        data_vencimento: pg.data_vencimento,
        sacas_previstas: sc,
        sacas_entregues: statusNorm === "entregue" ? sc : 0,
        sacas_aberto:    statusNorm === "entregue" ? 0 : sc,
        preco_sc_ref:    pg.preco_sc_ref ?? null,
        status:          statusNorm,
      });
    }

    // 2. Arrendamentos com sacas
    for (const pg of (arrPgs ?? []) as any[]) {
      const arr  = pg.arrendamentos;
      const sc   = pg.sacas_previstas ?? 0;
      const pago = pg.sacas_pagas     ?? 0;
      const statusNorm: Status =
        pg.status === "pago"    ? "entregue" :
        pg.status === "parcial" ? "parcial"  :
        pg.data_vencimento < hoje ? "vencido" : "pendente";
      lista.push({
        id:              pg.id,
        origem:          "arrendamento",
        descricao:       arr?.descricao ?? "Arrendamento",
        contraparte:     (arr?.proprietario as any)?.nome ?? "—",
        commodity:       (pg.commodity ?? "soja") as Commodity,
        data_vencimento: pg.data_vencimento,
        sacas_previstas: sc,
        sacas_entregues: pago,
        sacas_aberto:    Math.max(0, sc - pago),
        preco_sc_ref:    pg.preco_sc_referencia ?? null,
        status:          statusNorm,
      });
    }

    // 3. Barter
    for (const bt of (barterRows ?? []) as Barter[]) {
      const entregues = bt.sacas_entregues ?? 0;
      const aberto    = Math.max(0, bt.sacas_total - entregues);
      const statusNorm: Status =
        bt.status === "entregue" ? "entregue" :
        bt.status === "parcial"  ? "parcial"  :
        bt.data_entrega < hoje   ? "vencido"  : "pendente";
      lista.push({
        id:              bt.id,
        origem:          "barter",
        descricao:       bt.descricao,
        contraparte:     bt.fornecedor_nome ?? "—",
        commodity:       bt.commodity,
        data_vencimento: bt.data_entrega,
        sacas_previstas: bt.sacas_total,
        sacas_entregues: entregues,
        sacas_aberto:    aberto,
        preco_sc_ref:    bt.preco_sc_ref ?? null,
        status:          statusNorm,
        obs:             bt.observacao ?? undefined,
      });
    }

    lista.sort((a, b) => a.data_vencimento.localeCompare(b.data_vencimento));
    setCompromissos(lista);
    setLoading(false);
  }, [fazendaId, fazendaIds]);

  useEffect(() => { carregar(); }, [carregar]);

  // ── Filtros ───────────────────────────────────────────────────────────────
  const filtrados = compromissos.filter(c => {
    if (fOrigem    && c.origem    !== fOrigem)    return false;
    if (fCommodity && c.commodity !== fCommodity) return false;
    if (fStatus === "pendente" && c.status === "entregue") return false;
    if (fStatus === "entregue" && c.status !== "entregue") return false;
    if (fBusca && !c.descricao.toLowerCase().includes(fBusca.toLowerCase()) &&
                  !c.contraparte.toLowerCase().includes(fBusca.toLowerCase())) return false;
    return true;
  });

  // ── KPIs ──────────────────────────────────────────────────────────────────
  type Kpi = { previstas: number; entregues: number; aberto: number };
  const kpi: Record<string, Kpi> = {};
  for (const c of filtrados) {
    if (!kpi[c.commodity]) kpi[c.commodity] = { previstas: 0, entregues: 0, aberto: 0 };
    kpi[c.commodity].previstas  += c.sacas_previstas;
    kpi[c.commodity].entregues  += c.sacas_entregues;
    kpi[c.commodity].aberto     += c.sacas_aberto;
  }

  // ── Salvar Barter ─────────────────────────────────────────────────────────
  async function salvarBarter() {
    if (!fazendaId || !contaId) return;
    if (!formBarter.descricao || !formBarter.sacas_total || !formBarter.data_entrega) {
      alert("Preencha Descrição, Sacas e Data de Entrega."); return;
    }
    setSalvando(true);
    const payload: any = {
      fazenda_id:    fazendaId,
      conta_id:      contaId,
      descricao:     formBarter.descricao,
      commodity:     formBarter.commodity,
      sacas_total:   parseFloat(formBarter.sacas_total) || 0,
      sacas_entregues: 0,
      preco_sc_ref:  formBarter.preco_sc_ref ? parseFloat(formBarter.preco_sc_ref) : null,
      valor_insumos: formBarter.valor_insumos ? parseFloat(formBarter.valor_insumos.replace(",", ".")) : null,
      data_entrega:  formBarter.data_entrega,
      status:        "pendente",
    };
    if (formBarter.fornecedor_id) payload.fornecedor_id = formBarter.fornecedor_id;
    if (formBarter.ano_safra_id)  payload.ano_safra_id  = formBarter.ano_safra_id;
    if (formBarter.observacao)    payload.observacao     = formBarter.observacao;

    const { error } = await supabase.from("barter_compromissos").insert(payload);
    if (error) { alert("Erro ao salvar: " + error.message); setSalvando(false); return; }
    setModalBarter(false);
    setFormBarter(BLANK_BARTER);
    await carregar();
    setSalvando(false);
  }

  // ── Baixar compromisso ────────────────────────────────────────────────────
  async function confirmarBaixa() {
    if (!modalBaixar) return;
    setBaixando(true);
    const sacas = parseFloat(fBaixaSacas) || modalBaixar.sacas_aberto;

    if (modalBaixar.origem === "barter") {
      const bt = barters.find(b => b.id === modalBaixar.id);
      if (!bt) { setBaixando(false); return; }
      const novaEntregue = (bt.sacas_entregues ?? 0) + sacas;
      const novoStatus   = novaEntregue >= bt.sacas_total ? "entregue" : "parcial";
      await supabase.from("barter_compromissos").update({
        sacas_entregues: novaEntregue,
        status: novoStatus,
        data_entrega_realizada: fBaixaData,
      }).eq("id", modalBaixar.id);

    } else if (modalBaixar.origem === "compra_terra") {
      await supabase.from("cct_pagamentos").update({
        status: "pago", data_pagamento: fBaixaData,
      }).eq("id", modalBaixar.id);

    } else if (modalBaixar.origem === "arrendamento") {
      await supabase.from("arrendamento_pagamentos").update({
        sacas_pagas: sacas, status: "pago", data_pagamento: fBaixaData,
      }).eq("id", modalBaixar.id);
    }

    setModalBaixar(null);
    setFBaixaSacas("");
    setFBaixaData(hoje);
    await carregar();
    setBaixando(false);
  }

  // ── Estilos ───────────────────────────────────────────────────────────────
  const inp: React.CSSProperties = {
    padding: "8px 10px", borderRadius: 8, border: "0.5px solid var(--border)",
    fontSize: 13, background: "var(--bg-card)", color: "var(--text-1)", width: "100%", outline: "none",
  };
  const sel: React.CSSProperties = { ...inp, cursor: "pointer" };
  const btn = (bg: string, cl = "#fff"): React.CSSProperties => ({
    padding: "8px 18px", borderRadius: 8, border: "none", fontSize: 13,
    fontWeight: 600, cursor: "pointer", background: bg, color: cl,
  });

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <>
      <TopNav />
      <div style={{ padding: "24px 32px", background: "var(--bg-page)", minHeight: "100vh" }}>

        {/* Cabeçalho */}
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 20 }}>
          <div>
            <h1 style={{ fontSize: 20, fontWeight: 700, color: "var(--text-1)", margin: 0 }}>Compromissos em Grãos</h1>
            <div style={{ fontSize: 13, color: "var(--text-3)", marginTop: 2 }}>
              Compras de terra, arrendamentos e barter pagos em sacas — visão unificada
            </div>
          </div>
          <button onClick={() => { setFormBarter(BLANK_BARTER); setModalBarter(true); }}
            style={btn("#1A4870")}>
            + Novo Barter
          </button>
        </div>

        {/* KPIs por commodity */}
        {!loading && Object.keys(kpi).length > 0 && (
          <div style={{ display: "flex", gap: 12, marginBottom: 20, flexWrap: "wrap" }}>
            {Object.entries(kpi).map(([comm, k]) => {
              const prAtual = precos[comm] ?? null;
              const valorAberto = prAtual ? k.aberto * prAtual : null;
              return (
                <div key={comm} style={{ background: "var(--bg-card)", borderRadius: 12, border: "0.5px solid var(--border)", padding: "14px 20px", minWidth: 200, flex: 1 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-3)", textTransform: "uppercase", marginBottom: 8 }}>
                    {COMMODITY_LABEL[comm] ?? comm}
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
                    <div>
                      <div style={{ fontSize: 10, color: "var(--text-3)" }}>Comprometidas</div>
                      <div style={{ fontSize: 15, fontWeight: 700, color: "var(--text-1)" }}>{fmtSc(k.previstas)}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: 10, color: "var(--text-3)" }}>Entregues</div>
                      <div style={{ fontSize: 15, fontWeight: 700, color: "#16A34A" }}>{fmtSc(k.entregues)}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: 10, color: "var(--text-3)" }}>Em Aberto</div>
                      <div style={{ fontSize: 15, fontWeight: 700, color: "#E24B4A" }}>{fmtSc(k.aberto)}</div>
                      {valorAberto !== null && (
                        <div style={{ fontSize: 10, color: "var(--text-3)" }}>≈ {fmtBRL(valorAberto)}</div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Filtros */}
        <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
          <input placeholder="Buscar imóvel, contraparte…" value={fBusca} onChange={e => setFBusca(e.target.value)}
            style={{ ...sel, maxWidth: 240 }} />
          <select value={fOrigem} onChange={e => setFOrigem(e.target.value as Origem | "")} style={{ ...sel, minWidth: 160 }}>
            <option value="">Todas as origens</option>
            <option value="compra_terra">Compra de Terra</option>
            <option value="arrendamento">Arrendamento</option>
            <option value="barter">Barter</option>
          </select>
          <select value={fCommodity} onChange={e => setFCommodity(e.target.value as Commodity | "")} style={{ ...sel, minWidth: 130 }}>
            <option value="">Todas as commodities</option>
            <option value="soja">Soja</option>
            <option value="milho">Milho</option>
            <option value="algodao">Algodão</option>
          </select>
          <div style={{ display: "flex", gap: 6 }}>
            {[{ l: "Todos", v: "" }, { l: "Em Aberto", v: "pendente" }, { l: "Entregues", v: "entregue" }].map(f => (
              <button key={f.v} onClick={() => setFStatus(f.v as any)}
                style={{ padding: "7px 14px", borderRadius: 20, border: "0.5px solid var(--border)", fontSize: 12, cursor: "pointer",
                  background: fStatus === f.v ? "#1A4870" : "var(--bg-card)", color: fStatus === f.v ? "#fff" : "var(--text-2)" }}>
                {f.l}
              </button>
            ))}
          </div>
          {(fOrigem || fCommodity || fStatus || fBusca) && (
            <button onClick={() => { setFOrigem(""); setFCommodity(""); setFStatus(""); setFBusca(""); }}
              style={{ ...btn("var(--bg-page)", "var(--text-3)"), border: "0.5px solid var(--border)" }}>
              Limpar
            </button>
          )}
        </div>

        {/* Tabela */}
        {loading ? (
          <div style={{ textAlign: "center", padding: 60, color: "var(--text-3)" }}>Carregando compromissos…</div>
        ) : filtrados.length === 0 ? (
          <div style={{ textAlign: "center", padding: 60, background: "var(--bg-card)", borderRadius: 12, border: "0.5px solid var(--border)" }}>
            <div style={{ fontSize: 15, fontWeight: 600, color: "var(--text-2)" }}>Nenhum compromisso em grãos</div>
            <div style={{ fontSize: 13, color: "var(--text-3)", marginTop: 4 }}>
              Registre parcelas em sacas nos Contratos de Compra de Terra, em Arrendamentos, ou clique em "+ Novo Barter".
            </div>
          </div>
        ) : (
          <div style={{ background: "var(--bg-card)", borderRadius: 12, border: "0.5px solid var(--border)", overflow: "hidden" }}>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr style={{ background: "#111111", color: "#fff" }}>
                    {["Origem", "Descrição / Contraparte", "Commodity", "Vencimento", "Previstas", "Entregues", "Em Aberto", "Ref R$/sc", "Status", ""].map(h => (
                      <th key={h} style={{ padding: "10px 12px", textAlign: h === "Previstas" || h === "Entregues" || h === "Em Aberto" || h === "Ref R$/sc" ? "right" : "left", fontWeight: 600, fontSize: 11, whiteSpace: "nowrap" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtrados.map((c, i) => {
                    const om = ORIGEM_META[c.origem];
                    const sm = STATUS_META[c.status];
                    return (
                      <tr key={c.id} style={{ borderBottom: "0.5px solid var(--border)", background: i % 2 === 0 ? "var(--bg-card)" : "var(--bg-page)" }}>
                        <td style={{ padding: "10px 12px" }}>
                          <span style={{ fontSize: 11, fontWeight: 600, background: om.bg, color: om.cl, borderRadius: 4, padding: "2px 7px", whiteSpace: "nowrap" }}>
                            {om.label}
                          </span>
                        </td>
                        <td style={{ padding: "10px 12px" }}>
                          <div style={{ fontWeight: 600, color: "var(--text-1)" }}>{c.descricao}</div>
                          <div style={{ fontSize: 11, color: "var(--text-3)" }}>{c.contraparte}</div>
                          {c.obs && <div style={{ fontSize: 10, color: "var(--text-3)", fontStyle: "italic" }}>{c.obs}</div>}
                        </td>
                        <td style={{ padding: "10px 12px", whiteSpace: "nowrap" }}>
                          {COMMODITY_LABEL[c.commodity] ?? c.commodity}
                        </td>
                        <td style={{ padding: "10px 12px", whiteSpace: "nowrap" }}>
                          {fmtData(c.data_vencimento)}
                          {c.status !== "entregue" && c.data_vencimento < hoje && (
                            <div style={{ fontSize: 10, color: "#E24B4A", fontWeight: 600 }}>Vencido</div>
                          )}
                        </td>
                        <td style={{ padding: "10px 12px", textAlign: "right", whiteSpace: "nowrap" }}>
                          {fmtSc(c.sacas_previstas)}
                        </td>
                        <td style={{ padding: "10px 12px", textAlign: "right", whiteSpace: "nowrap", color: "#16A34A", fontWeight: 600 }}>
                          {c.sacas_entregues > 0 ? fmtSc(c.sacas_entregues) : <span style={{ color: "var(--text-3)" }}>—</span>}
                        </td>
                        <td style={{ padding: "10px 12px", textAlign: "right", whiteSpace: "nowrap", color: c.sacas_aberto > 0 ? "#E24B4A" : "var(--text-3)", fontWeight: c.sacas_aberto > 0 ? 700 : 400 }}>
                          {c.sacas_aberto > 0 ? fmtSc(c.sacas_aberto) : "—"}
                        </td>
                        <td style={{ padding: "10px 12px", textAlign: "right", whiteSpace: "nowrap", color: "var(--text-2)" }}>
                          {c.preco_sc_ref ? fmtBRL(c.preco_sc_ref) : "—"}
                        </td>
                        <td style={{ padding: "10px 12px" }}>
                          <span style={{ fontSize: 11, fontWeight: 600, background: sm.bg, color: sm.cl, borderRadius: 4, padding: "2px 7px" }}>
                            {sm.label}
                          </span>
                        </td>
                        <td style={{ padding: "10px 12px", whiteSpace: "nowrap" }}>
                          {c.status !== "entregue" && (
                            <button onClick={() => { setModalBaixar(c); setFBaixaSacas(String(c.sacas_aberto)); setFBaixaData(hoje); }}
                              style={{ padding: "5px 12px", background: "#1A4870", color: "#fff", border: "none", borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: "pointer" }}>
                              Baixar
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

      </div>

      {/* ── Modal Novo Barter ──────────────────────────────────────────────── */}
      {modalBarter && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.45)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ background: "var(--bg-card)", borderRadius: 16, padding: 28, width: 600, maxHeight: "90vh", overflowY: "auto", boxShadow: "0 8px 40px rgba(0,0,0,.25)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
              <h2 style={{ fontSize: 17, fontWeight: 700, margin: 0 }}>Novo Compromisso de Barter</h2>
              <button onClick={() => setModalBarter(false)} style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer", color: "var(--text-3)" }}>✕</button>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
              <div style={{ gridColumn: "1/-1" }}>
                <label style={{ fontSize: 12, color: "var(--text-3)", fontWeight: 600 }}>Descrição *</label>
                <input style={{ ...inp, marginTop: 4 }} value={formBarter.descricao}
                  onChange={e => setFormBarter(p => ({ ...p, descricao: e.target.value }))}
                  placeholder="Ex: Barter insumos Safra 24/25 — Sementes Bom Futuro" />
              </div>

              <div>
                <label style={{ fontSize: 12, color: "var(--text-3)", fontWeight: 600 }}>Fornecedor</label>
                <select style={{ ...sel, marginTop: 4 }} value={formBarter.fornecedor_id}
                  onChange={e => setFormBarter(p => ({ ...p, fornecedor_id: e.target.value }))}>
                  <option value="">Selecionar…</option>
                  {pessoas.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
                </select>
              </div>

              <div>
                <label style={{ fontSize: 12, color: "var(--text-3)", fontWeight: 600 }}>Commodity *</label>
                <select style={{ ...sel, marginTop: 4 }} value={formBarter.commodity}
                  onChange={e => setFormBarter(p => ({ ...p, commodity: e.target.value as Commodity }))}>
                  <option value="soja">Soja</option>
                  <option value="milho">Milho</option>
                  <option value="algodao">Algodão</option>
                  <option value="trigo">Trigo</option>
                  <option value="sorgo">Sorgo</option>
                </select>
              </div>

              <div>
                <label style={{ fontSize: 12, color: "var(--text-3)", fontWeight: 600 }}>Sacas comprometidas *</label>
                <input type="number" style={{ ...inp, marginTop: 4 }} value={formBarter.sacas_total}
                  onChange={e => setFormBarter(p => ({ ...p, sacas_total: e.target.value }))}
                  placeholder="Ex: 4.200" step="0.001" min="0" />
              </div>

              <div>
                <label style={{ fontSize: 12, color: "var(--text-3)", fontWeight: 600 }}>Data de entrega *</label>
                <input type="date" style={{ ...inp, marginTop: 4 }} value={formBarter.data_entrega}
                  onChange={e => setFormBarter(p => ({ ...p, data_entrega: e.target.value }))} />
              </div>

              <div>
                <label style={{ fontSize: 12, color: "var(--text-3)", fontWeight: 600 }}>Preço de referência (R$/sc)</label>
                <input type="number" style={{ ...inp, marginTop: 4 }} value={formBarter.preco_sc_ref}
                  onChange={e => setFormBarter(p => ({ ...p, preco_sc_ref: e.target.value }))}
                  placeholder="Ex: 118,50" step="0.01" min="0" />
              </div>

              <div>
                <label style={{ fontSize: 12, color: "var(--text-3)", fontWeight: 600 }}>Valor dos insumos (R$)</label>
                <input type="number" style={{ ...inp, marginTop: 4 }} value={formBarter.valor_insumos}
                  onChange={e => setFormBarter(p => ({ ...p, valor_insumos: e.target.value }))}
                  placeholder="Ex: 498.600,00" step="0.01" min="0" />
              </div>

              <div>
                <label style={{ fontSize: 12, color: "var(--text-3)", fontWeight: 600 }}>Ano Safra</label>
                <select style={{ ...sel, marginTop: 4 }} value={formBarter.ano_safra_id}
                  onChange={e => setFormBarter(p => ({ ...p, ano_safra_id: e.target.value }))}>
                  <option value="">Selecionar…</option>
                  {anosSafra.map(a => <option key={a.id} value={a.id}>{a.descricao}</option>)}
                </select>
              </div>

              <div style={{ gridColumn: "1/-1" }}>
                <label style={{ fontSize: 12, color: "var(--text-3)", fontWeight: 600 }}>Observação</label>
                <textarea style={{ ...inp, marginTop: 4, resize: "vertical", minHeight: 60 }}
                  value={formBarter.observacao}
                  onChange={e => setFormBarter(p => ({ ...p, observacao: e.target.value }))}
                  placeholder="Detalhes do barter, condições, tipo de insumo…" />
              </div>
            </div>

            {/* Preview */}
            {formBarter.sacas_total && formBarter.preco_sc_ref && (
              <div style={{ marginTop: 16, padding: "12px 16px", background: "#EBF3FC", borderRadius: 8, border: "0.5px solid #1A487040" }}>
                <span style={{ fontSize: 12, color: "#0C447C", fontWeight: 600 }}>
                  Valor estimado do compromisso:{" "}
                  {fmtBRL((parseFloat(formBarter.sacas_total) || 0) * (parseFloat(formBarter.preco_sc_ref) || 0))}
                </span>
              </div>
            )}

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 20 }}>
              <button onClick={() => setModalBarter(false)} style={btn("var(--bg-page)", "var(--text-2)")}>Cancelar</button>
              <button onClick={salvarBarter} disabled={salvando} style={btn("#1A4870")}>
                {salvando ? "Salvando…" : "Salvar Barter"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal Baixar ───────────────────────────────────────────────────── */}
      {modalBaixar && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.45)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ background: "var(--bg-card)", borderRadius: 16, padding: 28, width: 440, boxShadow: "0 8px 40px rgba(0,0,0,.25)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <h2 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>Registrar Entrega</h2>
              <button onClick={() => setModalBaixar(null)} style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer", color: "var(--text-3)" }}>✕</button>
            </div>

            <div style={{ background: "var(--bg-page)", borderRadius: 8, padding: "10px 14px", marginBottom: 16 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-1)" }}>{modalBaixar.descricao}</div>
              <div style={{ fontSize: 12, color: "var(--text-3)" }}>
                {ORIGIN_LABEL[modalBaixar.origem]} · {COMMODITY_LABEL[modalBaixar.commodity]} · Vencimento: {fmtData(modalBaixar.data_vencimento)}
              </div>
              <div style={{ fontSize: 12, color: "#E24B4A", fontWeight: 600, marginTop: 4 }}>
                Em aberto: {fmtSc(modalBaixar.sacas_aberto)}
              </div>
            </div>

            <div style={{ display: "grid", gap: 12 }}>
              <div>
                <label style={{ fontSize: 12, color: "var(--text-3)", fontWeight: 600 }}>Data de entrega</label>
                <input type="date" style={{ ...inp, marginTop: 4 }} value={fBaixaData} onChange={e => setFBaixaData(e.target.value)} />
              </div>
              <div>
                <label style={{ fontSize: 12, color: "var(--text-3)", fontWeight: 600 }}>
                  Sacas entregues{modalBaixar.origem === "compra_terra" ? " (baixa completa — valor em sacas registrado no contrato)" : ""}
                </label>
                {modalBaixar.origem === "compra_terra" ? (
                  <div style={{ padding: "8px 10px", borderRadius: 8, border: "0.5px solid var(--border)", fontSize: 13, background: "var(--bg-page)", color: "var(--text-3)", marginTop: 4 }}>
                    {fmtSc(modalBaixar.sacas_previstas)} — baixa total
                  </div>
                ) : (
                  <input type="number" style={{ ...inp, marginTop: 4 }} value={fBaixaSacas}
                    onChange={e => setFBaixaSacas(e.target.value)}
                    placeholder={String(modalBaixar.sacas_aberto)} step="0.001" min="0" max={modalBaixar.sacas_aberto} />
                )}
              </div>
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 20 }}>
              <button onClick={() => setModalBaixar(null)} style={btn("var(--bg-page)", "var(--text-2)")}>Cancelar</button>
              <button onClick={confirmarBaixa} disabled={baixando} style={btn("#16A34A")}>
                {baixando ? "Registrando…" : "✓ Confirmar Entrega"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ── Helpers inline ─────────────────────────────────────────────────────────────
const MOEDA_PARA_COMMODITY: Record<string, string> = {
  saca_soja:    "soja",
  saca_milho:   "milho",
  saca_algodao: "algodao",
};

const ORIGIN_LABEL: Record<Origem, string> = {
  compra_terra: "Compra de Terra",
  arrendamento: "Arrendamento",
  barter:       "Barter",
};
