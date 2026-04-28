"use client";
import { useState, useEffect, useCallback } from "react";
import TopNav from "../../../components/TopNav";
import { useAuth } from "../../../components/AuthProvider";
import { supabase } from "../../../lib/supabase";

// ─────────────────────────────────────────────────────────────
// Estilos base
// ─────────────────────────────────────────────────────────────
const inp: React.CSSProperties = { width: "100%", padding: "8px 10px", border: "0.5px solid #D4DCE8", borderRadius: 8, fontSize: 13, color: "#1a1a1a", background: "#fff", boxSizing: "border-box", outline: "none" };
const lbl: React.CSSProperties = { fontSize: 11, color: "#555", marginBottom: 4, display: "block" };
const btnV: React.CSSProperties = { padding: "8px 20px", background: "#1A4870", color: "#fff", border: "none", borderRadius: 8, fontWeight: 600, cursor: "pointer", fontSize: 13 };
const btnR: React.CSSProperties = { padding: "8px 18px", border: "0.5px solid #D4DCE8", borderRadius: 8, background: "transparent", cursor: "pointer", fontSize: 13, color: "#1a1a1a" };

const fmtBRL = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fmtData = (s?: string | null) => s ? new Date(s + "T12:00:00").toLocaleDateString("pt-BR") : "—";
const hoje = () => new Date().toISOString().split("T")[0];

function badge(texto: string, bg = "#D5E8F5", color = "#0B2D50") {
  return <span style={{ fontSize: 10, background: bg, color, padding: "2px 7px", borderRadius: 8, fontWeight: 600 }}>{texto}</span>;
}

// ─────────────────────────────────────────────────────────────
// Tipos
// ─────────────────────────────────────────────────────────────
type StatusConsorcio = "a_contemplar" | "contemplado" | "encerrado" | "cancelado";
type TipoBem = "veiculo" | "imovel" | "maquina" | "caminhao" | "outro";

interface Consorcio {
  id: string;
  fazenda_id: string;
  administradora: string;
  numero_cota: string;
  grupo: string;
  tipo_bem: TipoBem;
  descricao_bem: string;
  valor_credito: number;           // valor da carta de crédito
  valor_parcela_mensal: number;
  total_parcelas: number;
  parcelas_pagas: number;
  data_inicio: string;
  data_contemplacao?: string | null;
  data_encerramento?: string | null;
  status: StatusConsorcio;
  // Após contemplação
  financiamento_id?: string | null; // FK para tabela de financiamentos (se virar financiamento)
  valor_lance?: number | null;      // lance pago na contemplação
  bem_adquirido?: string | null;    // descrição do bem efetivamente comprado
  observacao?: string;
  created_at?: string;
}

interface ParcelaConsorcio {
  id: string;
  consorcio_id: string;
  numero_parcela: number;
  data_vencimento: string;
  data_pagamento?: string | null;
  valor: number;
  pago: boolean;
  tipo_parcela: "mensalidade" | "fundo_reserva" | "seguro" | "taxa_adm" | "lance";
  observacao?: string;
}

const STATUS_META: Record<StatusConsorcio, { label: string; bg: string; cl: string }> = {
  a_contemplar: { label: "A contemplar", bg: "#FBF3E0", cl: "#7B4A00" },
  contemplado:  { label: "Contemplado",  bg: "#E8F5E9", cl: "#1A6B3C" },
  encerrado:    { label: "Encerrado",    bg: "#F3F6F9", cl: "#555"    },
  cancelado:    { label: "Cancelado",    bg: "#FCEBEB", cl: "#791F1F" },
};

const TIPO_BEM_META: Record<TipoBem, { label: string; bg: string; cl: string }> = {
  veiculo:  { label: "Veículo",     bg: "#D5E8F5", cl: "#0B2D50" },
  imovel:   { label: "Imóvel",      bg: "#E8F5E9", cl: "#1A6B3C" },
  maquina:  { label: "Máquina",     bg: "#FBF3E0", cl: "#7B4A00" },
  caminhao: { label: "Caminhão",    bg: "#F3E8FF", cl: "#6B21A8" },
  outro:    { label: "Outro",       bg: "#F3F6F9", cl: "#555"    },
};

// ─────────────────────────────────────────────────────────────
// Componente principal
// ─────────────────────────────────────────────────────────────
export default function ConsorciosPage() {
  const { fazendaId } = useAuth();
  const [aba, setAba] = useState<"lista" | "parcelas">("lista");

  // Dados
  const [consorcios, setConsorcios] = useState<Consorcio[]>([]);
  const [parcelas,   setParcelas]   = useState<ParcelaConsorcio[]>([]);
  const [expandido,  setExpandido]  = useState<string | null>(null);

  // Modal consórcio
  const [modalConsor,  setModalConsor]  = useState(false);
  const [consorEdit,   setConsorEdit]   = useState<Consorcio | null>(null);
  const CONSOR_VAZIO = () => ({
    administradora: "", numero_cota: "", grupo: "",
    tipo_bem: "maquina" as TipoBem, descricao_bem: "",
    valor_credito: "", valor_parcela_mensal: "",
    total_parcelas: "60", parcelas_pagas: "0",
    data_inicio: hoje(), status: "a_contemplar" as StatusConsorcio,
    observacao: "",
  });
  const [cForm,   setCForm]   = useState(CONSOR_VAZIO());
  const [cSaving, setCSaving] = useState(false);
  const [cErr,    setCErr]    = useState("");

  // Modal contemplação
  const [modalContempl, setModalContempl] = useState<Consorcio | null>(null);
  const [contemplForm, setContemplForm] = useState({
    data_contemplacao: hoje(),
    valor_lance: "",
    bem_adquirido: "",
    migrar_financiamento: false,
  });
  const [contemplSaving, setContemplSaving] = useState(false);
  const [contemplErr, setContemplErr] = useState("");

  // Modal pagar parcela
  const [modalParcela, setModalParcela] = useState<ParcelaConsorcio | null>(null);
  const [parcelaData, setParcelaData] = useState(hoje());
  const [parcelaSaving, setParcelaSaving] = useState(false);

  // ── Carregar ───────────────────────────────────────────────
  const carregar = useCallback(async () => {
    if (!fazendaId) return;
    const { data: cd } = await supabase
      .from("consorcios")
      .select("*")
      .eq("fazenda_id", fazendaId)
      .order("data_inicio", { ascending: false });
    setConsorcios(cd ?? []);

    if (cd && cd.length > 0) {
      const ids = cd.map((c: Consorcio) => c.id);
      const { data: pd } = await supabase
        .from("parcelas_consorcio")
        .select("*")
        .in("consorcio_id", ids)
        .order("numero_parcela");
      setParcelas(pd ?? []);
    }
  }, [fazendaId]);

  useEffect(() => { carregar(); }, [carregar]);

  // ── KPIs ──────────────────────────────────────────────────
  const aContemplar = consorcios.filter(c => c.status === "a_contemplar");
  const contemplados = consorcios.filter(c => c.status === "contemplado");
  const totalCredito = aContemplar.reduce((s, c) => s + c.valor_credito, 0);
  const totalMensal  = consorcios
    .filter(c => c.status === "a_contemplar" || c.status === "contemplado")
    .reduce((s, c) => s + c.valor_parcela_mensal, 0);
  const parcelasAtrasadas = parcelas.filter(p =>
    !p.pago && new Date(p.data_vencimento) < new Date()
  );

  // ── CRUD Consórcio ────────────────────────────────────────
  function abrirConsorcio(c?: Consorcio) {
    if (c) {
      setConsorEdit(c);
      setCForm({
        administradora: c.administradora, numero_cota: c.numero_cota,
        grupo: c.grupo, tipo_bem: c.tipo_bem, descricao_bem: c.descricao_bem,
        valor_credito: String(c.valor_credito),
        valor_parcela_mensal: String(c.valor_parcela_mensal),
        total_parcelas: String(c.total_parcelas),
        parcelas_pagas: String(c.parcelas_pagas),
        data_inicio: c.data_inicio, status: c.status,
        observacao: c.observacao ?? "",
      });
    } else {
      setConsorEdit(null);
      setCForm(CONSOR_VAZIO());
    }
    setCErr("");
    setModalConsor(true);
  }

  async function salvarConsorcio() {
    if (!fazendaId) return;
    if (!cForm.administradora.trim()) { setCErr("Informe a administradora."); return; }
    if (!cForm.numero_cota.trim())    { setCErr("Informe o número da cota."); return; }
    setCSaving(true); setCErr("");
    try {
      const payload = {
        fazenda_id: fazendaId,
        administradora: cForm.administradora.trim(),
        numero_cota: cForm.numero_cota.trim(),
        grupo: cForm.grupo,
        tipo_bem: cForm.tipo_bem,
        descricao_bem: cForm.descricao_bem,
        valor_credito: parseFloat(cForm.valor_credito) || 0,
        valor_parcela_mensal: parseFloat(cForm.valor_parcela_mensal) || 0,
        total_parcelas: parseInt(cForm.total_parcelas) || 0,
        parcelas_pagas: parseInt(cForm.parcelas_pagas) || 0,
        data_inicio: cForm.data_inicio,
        status: cForm.status,
        observacao: cForm.observacao || null,
      };
      if (consorEdit) {
        await supabase.from("consorcios").update(payload).eq("id", consorEdit.id);
      } else {
        await supabase.from("consorcios").insert(payload);
      }
      await carregar();
      setModalConsor(false);
    } catch (e: unknown) {
      setCErr(e instanceof Error ? e.message : "Erro ao salvar.");
    } finally {
      setCSaving(false);
    }
  }

  // ── Contemplação ──────────────────────────────────────────
  function abrirContemplacao(c: Consorcio) {
    setModalContempl(c);
    setContemplForm({
      data_contemplacao: hoje(), valor_lance: "", bem_adquirido: "",
      migrar_financiamento: false,
    });
    setContemplErr("");
  }

  async function confirmarContemplacao() {
    if (!modalContempl) return;
    if (!contemplForm.data_contemplacao) { setContemplErr("Informe a data de contemplação."); return; }
    setContemplSaving(true); setContemplErr("");
    try {
      const updates: Partial<Consorcio> = {
        status: "contemplado",
        data_contemplacao: contemplForm.data_contemplacao,
        valor_lance: parseFloat(contemplForm.valor_lance) || null,
        bem_adquirido: contemplForm.bem_adquirido || null,
      };
      await supabase.from("consorcios").update(updates).eq("id", modalContempl.id);

      // Se migrar para financiamento, inserimos um registro básico
      if (contemplForm.migrar_financiamento) {
        await supabase.from("financiamentos").insert({
          fazenda_id: modalContempl.fazenda_id,
          descricao: `Consórcio contemplado — ${modalContempl.descricao_bem || modalContempl.numero_cota}`,
          valor_financiado: modalContempl.valor_credito,
          saldo_devedor: modalContempl.valor_credito - (parseFloat(contemplForm.valor_lance) || 0),
          data_contratacao: contemplForm.data_contemplacao,
          status: "ativo",
          origem: "consorcio",
          consorcio_id: modalContempl.id,
        }).select().single().then(() => {}); // best-effort — tabela pode não existir ainda
      }

      await carregar();
      setModalContempl(null);
    } catch (e: unknown) {
      setContemplErr(e instanceof Error ? e.message : "Erro ao confirmar.");
    } finally {
      setContemplSaving(false);
    }
  }

  // ── Pagar parcela ─────────────────────────────────────────
  async function pagarParcela() {
    if (!modalParcela) return;
    setParcelaSaving(true);
    try {
      await supabase.from("parcelas_consorcio").update({ pago: true, data_pagamento: parcelaData }).eq("id", modalParcela.id);
      // Incrementa parcelas_pagas no consórcio
      const c = consorcios.find(c => c.id === modalParcela.consorcio_id);
      if (c) await supabase.from("consorcios").update({ parcelas_pagas: c.parcelas_pagas + 1 }).eq("id", c.id);
      await carregar();
      setModalParcela(null);
    } finally {
      setParcelaSaving(false);
    }
  }

  // ── Gerar parcelas ────────────────────────────────────────
  async function gerarParcelas(c: Consorcio) {
    const existem = parcelas.filter(p => p.consorcio_id === c.id);
    if (existem.length > 0) {
      if (!confirm(`Este consórcio já tem ${existem.length} parcelas. Deseja apagar e regenerar?`)) return;
      await supabase.from("parcelas_consorcio").delete().eq("consorcio_id", c.id);
    }
    const novas: Omit<ParcelaConsorcio, "id" | "created_at">[] = [];
    const base = new Date(c.data_inicio + "T12:00:00");
    for (let i = 1; i <= c.total_parcelas; i++) {
      const d = new Date(base);
      d.setMonth(d.getMonth() + i - 1);
      novas.push({
        consorcio_id: c.id,
        numero_parcela: i,
        data_vencimento: d.toISOString().split("T")[0],
        data_pagamento: null,
        valor: c.valor_parcela_mensal,
        pago: i <= c.parcelas_pagas,
        tipo_parcela: "mensalidade",
        observacao: undefined,
      } as Omit<ParcelaConsorcio, "id" | "created_at">);
    }
    if (novas.length > 0) await supabase.from("parcelas_consorcio").insert(novas);
    await carregar();
  }

  // ── Parcelas visíveis ─────────────────────────────────────
  const parcelasVisiveis = aba === "parcelas"
    ? parcelas.filter(p => !p.pago && new Date(p.data_vencimento) >= new Date(new Date().setDate(new Date().getDate() - 5)))
    : parcelas.filter(p => expandido && p.consorcio_id === expandido);

  return (
    <div style={{ minHeight: "100vh", background: "#F4F6FA" }}>
      <TopNav />

      <main style={{ maxWidth: 1100, margin: "0 auto", padding: "28px 20px" }}>

        {/* Cabeçalho */}
        <div style={{ marginBottom: 22 }}>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: "#1a1a1a", margin: 0 }}>Controle de Consórcios</h1>
          <p style={{ fontSize: 13, color: "#666", marginTop: 4, marginBottom: 0 }}>
            Cotas em andamento — acompanhe parcelas, contemplações e migração para financiamento
          </p>
        </div>

        {/* KPI cards */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14, marginBottom: 22 }}>
          {[
            { label: "A Contemplar",      value: aContemplar.length.toString(),    sub: "cotas ativas",       color: "#C9921B" },
            { label: "Contemplados",       value: contemplados.length.toString(),   sub: "em uso",             color: "#1A6B3C" },
            { label: "Crédito Disponível", value: fmtBRL(totalCredito),            sub: "a contemplar",       color: "#1A4870" },
            { label: "Parcelas Atrasadas", value: parcelasAtrasadas.length.toString(), sub: "requer atenção",  color: parcelasAtrasadas.length > 0 ? "#E24B4A" : "#555" },
          ].map(k => (
            <div key={k.label} style={{ background: "#fff", borderRadius: 12, border: "0.5px solid #D4DCE8", padding: "16px 18px" }}>
              <div style={{ fontSize: 11, color: "#666", marginBottom: 6 }}>{k.label}</div>
              <div style={{ fontSize: 20, fontWeight: 700, color: k.color }}>{k.value}</div>
              <div style={{ fontSize: 11, color: "#888", marginTop: 2 }}>{k.sub}</div>
            </div>
          ))}
        </div>

        {/* Alerta parcelas atrasadas */}
        {parcelasAtrasadas.length > 0 && (
          <div style={{ background: "#FCEBEB", border: "0.5px solid #E24B4A40", borderRadius: 10, padding: "10px 16px", marginBottom: 18, fontSize: 12, color: "#791F1F" }}>
            <strong>{parcelasAtrasadas.length} parcela{parcelasAtrasadas.length !== 1 ? "s atrasadas" : " atrasada"} —</strong> total em atraso: <strong>{fmtBRL(parcelasAtrasadas.reduce((s, p) => s + p.valor, 0))}</strong>
          </div>
        )}

        {/* Abas */}
        <div style={{ display: "flex", gap: 0, marginBottom: 20, borderBottom: "0.5px solid #D4DCE8" }}>
          {([
            { id: "lista",    label: "Consórcios"                 },
            { id: "parcelas", label: "Próximas Parcelas"          },
          ] as { id: typeof aba; label: string }[]).map(a => (
            <button key={a.id} onClick={() => setAba(a.id)} style={{
              padding: "9px 20px", border: "none", background: "none", cursor: "pointer",
              fontSize: 13, fontWeight: aba === a.id ? 700 : 400,
              color: aba === a.id ? "#1A4870" : "#666",
              borderBottom: aba === a.id ? "2.5px solid #1A4870" : "2.5px solid transparent",
              marginBottom: -1,
            }}>{a.label}</button>
          ))}
        </div>

        {/* ── ABA LISTA ──────────────────────────────────────── */}
        {aba === "lista" && (
          <div>
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginBottom: 14 }}>
              <button onClick={() => abrirConsorcio()} style={btnV}>+ Novo Consórcio</button>
            </div>

            {consorcios.length === 0 ? (
              <div style={{ background: "#fff", borderRadius: 12, border: "0.5px solid #D4DCE8", padding: 40, textAlign: "center", color: "#888", fontSize: 13 }}>
                Nenhum consórcio cadastrado.
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {consorcios.map(c => {
                  const sm = STATUS_META[c.status];
                  const tb = TIPO_BEM_META[c.tipo_bem];
                  const progresso = c.total_parcelas > 0 ? (c.parcelas_pagas / c.total_parcelas) * 100 : 0;
                  const parcelasC = parcelas.filter(p => p.consorcio_id === c.id);
                  const exp = expandido === c.id;
                  const saldoRestante = (c.total_parcelas - c.parcelas_pagas) * c.valor_parcela_mensal;
                  return (
                    <div key={c.id} style={{ background: "#fff", borderRadius: 12, border: "0.5px solid #D4DCE8", overflow: "hidden" }}>
                      {/* Linha resumo */}
                      <div
                        onClick={() => setExpandido(exp ? null : c.id)}
                        style={{ display: "grid", gridTemplateColumns: "1fr 110px 130px 130px 110px 200px", alignItems: "center", gap: 12, padding: "14px 18px", cursor: "pointer" }}
                      >
                        <div>
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <span style={{ fontSize: 13, fontWeight: 600, color: "#1a1a1a" }}>
                              {c.administradora} — Cota {c.numero_cota}
                            </span>
                            {badge(tb.label, tb.bg, tb.cl)}
                          </div>
                          <div style={{ fontSize: 12, color: "#666", marginTop: 3 }}>
                            {c.descricao_bem || "Bem não especificado"} {c.grupo ? `· Grupo ${c.grupo}` : ""}
                          </div>
                          {c.status === "contemplado" && c.bem_adquirido && (
                            <div style={{ fontSize: 11, color: "#1A6B3C", marginTop: 2 }}>Bem adquirido: {c.bem_adquirido}</div>
                          )}
                        </div>
                        <div style={{ textAlign: "right" }}>
                          <div style={{ fontSize: 11, color: "#666" }}>Crédito</div>
                          <div style={{ fontSize: 13, fontWeight: 600 }}>{fmtBRL(c.valor_credito)}</div>
                        </div>
                        <div style={{ textAlign: "right" }}>
                          <div style={{ fontSize: 11, color: "#666" }}>Parcela Mensal</div>
                          <div style={{ fontSize: 13, fontWeight: 600, color: "#C9921B" }}>{fmtBRL(c.valor_parcela_mensal)}</div>
                        </div>
                        <div style={{ textAlign: "right" }}>
                          <div style={{ fontSize: 11, color: "#666" }}>Saldo a pagar</div>
                          <div style={{ fontSize: 13, fontWeight: 600, color: "#E24B4A" }}>{fmtBRL(saldoRestante)}</div>
                        </div>
                        <div>
                          <div style={{ fontSize: 11, color: "#666", marginBottom: 3 }}>Progresso</div>
                          <div style={{ height: 6, background: "#EEF1F6", borderRadius: 3, overflow: "hidden" }}>
                            <div style={{ height: "100%", width: `${Math.min(100, progresso)}%`, background: c.status === "contemplado" ? "#16A34A" : "#1A4870", borderRadius: 3 }} />
                          </div>
                          <div style={{ fontSize: 10, color: "#888", marginTop: 2 }}>{c.parcelas_pagas}/{c.total_parcelas} parcelas</div>
                        </div>
                        <div style={{ display: "flex", gap: 6, justifyContent: "flex-end", alignItems: "center", flexWrap: "wrap" }}>
                          {badge(sm.label, sm.bg, sm.cl)}
                          {c.status === "a_contemplar" && (
                            <button onClick={e => { e.stopPropagation(); abrirContemplacao(c); }} style={{ padding: "4px 10px", border: "0.5px solid #16A34A50", borderRadius: 6, background: "#E8F5E9", cursor: "pointer", fontSize: 11, color: "#1A6B3C", fontWeight: 600 }}>
                              Contemplar
                            </button>
                          )}
                          {parcelasC.length === 0 && (
                            <button onClick={e => { e.stopPropagation(); gerarParcelas(c); }} style={{ padding: "4px 10px", border: "0.5px solid #1A487050", borderRadius: 6, background: "#D5E8F5", cursor: "pointer", fontSize: 11, color: "#0B2D50", fontWeight: 600 }}>
                              Gerar Parcelas
                            </button>
                          )}
                          <button onClick={e => { e.stopPropagation(); abrirConsorcio(c); }} style={{ padding: "4px 10px", border: "0.5px solid #D4DCE8", borderRadius: 6, background: "transparent", cursor: "pointer", fontSize: 11, color: "#555" }}>
                            Editar
                          </button>
                        </div>
                      </div>

                      {/* Parcelas expandidas */}
                      {exp && (
                        <div style={{ borderTop: "0.5px solid #EEF1F6", padding: "12px 18px", background: "#F8FAFB" }}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                            <div style={{ fontSize: 12, fontWeight: 600, color: "#555" }}>
                              Parcelas ({parcelasC.length}) — mensalidade mensal {fmtBRL(c.valor_parcela_mensal)}
                            </div>
                            {parcelasC.length > 0 && (
                              <button onClick={() => gerarParcelas(c)} style={{ padding: "4px 10px", border: "0.5px solid #D4DCE8", borderRadius: 6, background: "transparent", cursor: "pointer", fontSize: 11, color: "#555" }}>
                                Regenerar
                              </button>
                            )}
                          </div>
                          {parcelasC.length === 0 ? (
                            <div style={{ fontSize: 12, color: "#aaa" }}>Clique em "Gerar Parcelas" para criar o cronograma.</div>
                          ) : (
                            <div style={{ maxHeight: 240, overflowY: "auto" }}>
                              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                                <thead>
                                  <tr style={{ background: "#EEF1F6", position: "sticky", top: 0 }}>
                                    {["Nº", "Vencimento", "Valor", "Status", ""].map(h => (
                                      <th key={h} style={{ padding: "6px 10px", textAlign: h === "Valor" ? "right" : "left", color: "#555", fontWeight: 600 }}>{h}</th>
                                    ))}
                                  </tr>
                                </thead>
                                <tbody>
                                  {parcelasC.slice(0, 36).map(p => {
                                    const vencido = !p.pago && new Date(p.data_vencimento) < new Date();
                                    return (
                                      <tr key={p.id} style={{ borderBottom: "0.5px solid #EEF1F6", background: vencido ? "#FFFCF5" : "#fff" }}>
                                        <td style={{ padding: "5px 10px", color: "#888" }}>{p.numero_parcela}</td>
                                        <td style={{ padding: "5px 10px", color: vencido ? "#E24B4A" : "#1a1a1a" }}>{fmtData(p.data_vencimento)}</td>
                                        <td style={{ padding: "5px 10px", textAlign: "right", fontWeight: 600 }}>{fmtBRL(p.valor)}</td>
                                        <td style={{ padding: "5px 10px" }}>
                                          {p.pago ? badge("Pago", "#E8F5E9", "#1A6B3C") : vencido ? badge("Atrasado", "#FCEBEB", "#791F1F") : badge("Pendente", "#FBF3E0", "#7B4A00")}
                                        </td>
                                        <td style={{ padding: "5px 10px", textAlign: "right" }}>
                                          {!p.pago && (
                                            <button onClick={() => { setModalParcela(p); setParcelaData(hoje()); }} style={{ padding: "3px 8px", border: "0.5px solid #1A487050", borderRadius: 5, background: "#D5E8F5", cursor: "pointer", fontSize: 10, color: "#0B2D50", fontWeight: 600 }}>
                                              Pagar
                                            </button>
                                          )}
                                        </td>
                                      </tr>
                                    );
                                  })}
                                  {parcelasC.length > 36 && (
                                    <tr><td colSpan={5} style={{ padding: "6px 10px", textAlign: "center", fontSize: 11, color: "#888" }}>+ {parcelasC.length - 36} parcelas futuras</td></tr>
                                  )}
                                </tbody>
                              </table>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ── ABA PRÓXIMAS PARCELAS ─────────────────────────── */}
        {aba === "parcelas" && (
          <div>
            {/* Resumo mensal */}
            <div style={{ background: "#fff", borderRadius: 12, border: "0.5px solid #D4DCE8", padding: "14px 18px", marginBottom: 16, display: "flex", gap: 24, alignItems: "center" }}>
              <div>
                <div style={{ fontSize: 11, color: "#666" }}>Compromisso mensal total</div>
                <div style={{ fontSize: 18, fontWeight: 700, color: "#1A4870" }}>{fmtBRL(totalMensal)}</div>
              </div>
              <div style={{ width: 1, height: 40, background: "#EEF1F6" }} />
              <div style={{ fontSize: 12, color: "#555" }}>
                {consorcios.filter(c => c.status === "a_contemplar" || c.status === "contemplado").length} consórcio(s) ativo(s)
              </div>
            </div>

            {parcelasVisiveis.length === 0 ? (
              <div style={{ background: "#fff", borderRadius: 12, border: "0.5px solid #D4DCE8", padding: 40, textAlign: "center", color: "#888", fontSize: 13 }}>
                Nenhuma parcela pendente.
              </div>
            ) : (
              <div style={{ background: "#fff", borderRadius: 12, border: "0.5px solid #D4DCE8", overflow: "hidden" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                  <thead>
                    <tr style={{ background: "#F8FAFB" }}>
                      {["Vencimento", "Consórcio", "Cota", "Parcela Nº", "Valor", "Status", ""].map(h => (
                        <th key={h} style={{ padding: "10px 14px", textAlign: h === "Valor" ? "right" : "left", color: "#555", fontWeight: 600, fontSize: 11, borderBottom: "0.5px solid #EEF1F6" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {parcelasVisiveis.map(p => {
                      const c = consorcios.find(c => c.id === p.consorcio_id);
                      const vencido = new Date(p.data_vencimento) < new Date();
                      return (
                        <tr key={p.id} style={{ borderBottom: "0.5px solid #EEF1F6", background: vencido ? "#FFFCF5" : "#fff" }}>
                          <td style={{ padding: "10px 14px", color: vencido ? "#E24B4A" : "#1a1a1a", fontWeight: vencido ? 600 : 400 }}>{fmtData(p.data_vencimento)}</td>
                          <td style={{ padding: "10px 14px" }}>{c?.administradora ?? "—"}</td>
                          <td style={{ padding: "10px 14px", color: "#666" }}>{c?.numero_cota ?? "—"}</td>
                          <td style={{ padding: "10px 14px", color: "#888" }}>{p.numero_parcela}</td>
                          <td style={{ padding: "10px 14px", textAlign: "right", fontWeight: 600 }}>{fmtBRL(p.valor)}</td>
                          <td style={{ padding: "10px 14px" }}>
                            {p.pago ? badge("Pago", "#E8F5E9", "#1A6B3C") : vencido ? badge("Atrasado", "#FCEBEB", "#791F1F") : badge("Pendente", "#FBF3E0", "#7B4A00")}
                          </td>
                          <td style={{ padding: "10px 14px", textAlign: "right" }}>
                            {!p.pago && (
                              <button onClick={() => { setModalParcela(p); setParcelaData(hoje()); }} style={{ padding: "4px 10px", border: "0.5px solid #1A487050", borderRadius: 6, background: "#D5E8F5", cursor: "pointer", fontSize: 11, color: "#0B2D50", fontWeight: 600 }}>
                                Pagar
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </main>

      {/* ══════════════════════════════════════════════════════
          MODAL CONSÓRCIO
      ══════════════════════════════════════════════════════ */}
      {modalConsor && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "flex-start", justifyContent: "center", zIndex: 200, overflowY: "auto", padding: "24px 0" }}>
          <div style={{ background: "#fff", borderRadius: 14, width: "100%", maxWidth: 620, margin: "0 20px", boxShadow: "0 16px 48px rgba(0,0,0,0.18)" }}>
            <div style={{ padding: "18px 22px 14px", borderBottom: "0.5px solid #EEF1F6", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: "#1a1a1a" }}>{consorEdit ? "Editar Consórcio" : "Novo Consórcio"}</div>
              <button onClick={() => setModalConsor(false)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 20, color: "#888" }}>×</button>
            </div>
            <div style={{ padding: "20px 22px" }}>
              {cErr && <div style={{ background: "#FCEBEB", border: "0.5px solid #F5C6C6", borderRadius: 8, padding: "10px 14px", fontSize: 13, color: "#791F1F", marginBottom: 14 }}>{cErr}</div>}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
                <div>
                  <label style={lbl}>Administradora</label>
                  <input value={cForm.administradora} onChange={e => setCForm(f => ({ ...f, administradora: e.target.value }))} style={inp} placeholder="Ex.: Porto Seguro" />
                </div>
                <div>
                  <label style={lbl}>Número da Cota</label>
                  <input value={cForm.numero_cota} onChange={e => setCForm(f => ({ ...f, numero_cota: e.target.value }))} style={inp} placeholder="000001" />
                </div>
                <div>
                  <label style={lbl}>Grupo</label>
                  <input value={cForm.grupo} onChange={e => setCForm(f => ({ ...f, grupo: e.target.value }))} style={inp} placeholder="Ex.: 0042" />
                </div>
                <div>
                  <label style={lbl}>Tipo de Bem</label>
                  <select value={cForm.tipo_bem} onChange={e => setCForm(f => ({ ...f, tipo_bem: e.target.value as TipoBem }))} style={inp}>
                    {Object.entries(TIPO_BEM_META).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                  </select>
                </div>
                <div style={{ gridColumn: "2 / -1" }}>
                  <label style={lbl}>Descrição do Bem</label>
                  <input value={cForm.descricao_bem} onChange={e => setCForm(f => ({ ...f, descricao_bem: e.target.value }))} style={inp} placeholder="Ex.: John Deere 5075E ou Caminhão VUC" />
                </div>
                <div>
                  <label style={lbl}>Valor do Crédito (R$)</label>
                  <input type="number" step="0.01" min="0" value={cForm.valor_credito} onChange={e => setCForm(f => ({ ...f, valor_credito: e.target.value }))} style={inp} />
                </div>
                <div>
                  <label style={lbl}>Parcela Mensal (R$)</label>
                  <input type="number" step="0.01" min="0" value={cForm.valor_parcela_mensal} onChange={e => setCForm(f => ({ ...f, valor_parcela_mensal: e.target.value }))} style={inp} />
                </div>
                <div>
                  <label style={lbl}>Total de Parcelas</label>
                  <input type="number" min="1" value={cForm.total_parcelas} onChange={e => setCForm(f => ({ ...f, total_parcelas: e.target.value }))} style={inp} />
                </div>
                <div>
                  <label style={lbl}>Data de Início</label>
                  <input type="date" value={cForm.data_inicio} onChange={e => setCForm(f => ({ ...f, data_inicio: e.target.value }))} style={inp} />
                </div>
                <div>
                  <label style={lbl}>Parcelas Pagas</label>
                  <input type="number" min="0" value={cForm.parcelas_pagas} onChange={e => setCForm(f => ({ ...f, parcelas_pagas: e.target.value }))} style={inp} />
                </div>
                <div>
                  <label style={lbl}>Status</label>
                  <select value={cForm.status} onChange={e => setCForm(f => ({ ...f, status: e.target.value as StatusConsorcio }))} style={inp}>
                    {Object.entries(STATUS_META).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                  </select>
                </div>
                <div style={{ gridColumn: "1 / -1" }}>
                  <label style={lbl}>Observação</label>
                  <textarea value={cForm.observacao} onChange={e => setCForm(f => ({ ...f, observacao: e.target.value }))} rows={2} style={{ ...inp, resize: "vertical" }} />
                </div>
              </div>
            </div>
            <div style={{ padding: "14px 22px 18px", borderTop: "0.5px solid #EEF1F6", display: "flex", justifyContent: "flex-end", gap: 10 }}>
              <button style={btnR} onClick={() => setModalConsor(false)}>Cancelar</button>
              <button onClick={salvarConsorcio} disabled={cSaving} style={{ ...btnV, background: cSaving ? "#aaa" : "#1A4870", cursor: cSaving ? "default" : "pointer" }}>
                {cSaving ? "Salvando…" : "Salvar"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════
          MODAL CONTEMPLAÇÃO
      ══════════════════════════════════════════════════════ */}
      {modalContempl && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200 }}>
          <div style={{ background: "#fff", borderRadius: 14, width: "100%", maxWidth: 500, margin: "0 20px", boxShadow: "0 16px 48px rgba(0,0,0,0.18)" }}>
            <div style={{ padding: "18px 22px 14px", borderBottom: "0.5px solid #EEF1F6", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <div style={{ fontSize: 15, fontWeight: 700, color: "#1a1a1a" }}>Registrar Contemplação</div>
                <div style={{ fontSize: 12, color: "#888", marginTop: 2 }}>
                  {modalContempl.administradora} — Cota {modalContempl.numero_cota} · Crédito {fmtBRL(modalContempl.valor_credito)}
                </div>
              </div>
              <button onClick={() => setModalContempl(null)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 20, color: "#888" }}>×</button>
            </div>
            <div style={{ padding: "20px 22px", display: "flex", flexDirection: "column", gap: 12 }}>
              {contemplErr && <div style={{ background: "#FCEBEB", border: "0.5px solid #F5C6C6", borderRadius: 8, padding: "10px 14px", fontSize: 13, color: "#791F1F" }}>{contemplErr}</div>}

              <div>
                <label style={lbl}>Data de Contemplação</label>
                <input type="date" value={contemplForm.data_contemplacao} onChange={e => setContemplForm(f => ({ ...f, data_contemplacao: e.target.value }))} style={inp} />
              </div>
              <div>
                <label style={lbl}>Valor do Lance (R$) — se contemplado por lance</label>
                <input type="number" step="0.01" min="0" value={contemplForm.valor_lance} onChange={e => setContemplForm(f => ({ ...f, valor_lance: e.target.value }))} style={inp} placeholder="0,00 se contemplado por sorteio" />
              </div>
              <div>
                <label style={lbl}>Bem Adquirido</label>
                <input value={contemplForm.bem_adquirido} onChange={e => setContemplForm(f => ({ ...f, bem_adquirido: e.target.value }))} style={inp} placeholder="Ex.: John Deere 5075E, ano 2024" />
              </div>
              <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, cursor: "pointer", userSelect: "none" }}>
                <input
                  type="checkbox"
                  checked={contemplForm.migrar_financiamento}
                  onChange={e => setContemplForm(f => ({ ...f, migrar_financiamento: e.target.checked }))}
                  style={{ width: 16, height: 16 }}
                />
                <span>Migrar saldo para módulo de Financiamentos</span>
              </label>
              {contemplForm.migrar_financiamento && (
                <div style={{ background: "#D5E8F5", borderRadius: 8, padding: "10px 14px", fontSize: 12, color: "#0B2D50" }}>
                  Será criado um financiamento com saldo de {fmtBRL(modalContempl.valor_credito - (parseFloat(contemplForm.valor_lance) || 0))}. As parcelas remanescentes continuarão sendo controladas aqui.
                </div>
              )}
            </div>
            <div style={{ padding: "14px 22px 18px", borderTop: "0.5px solid #EEF1F6", display: "flex", justifyContent: "flex-end", gap: 10 }}>
              <button style={btnR} onClick={() => setModalContempl(null)}>Cancelar</button>
              <button onClick={confirmarContemplacao} disabled={contemplSaving} style={{ ...btnV, background: contemplSaving ? "#aaa" : "#16A34A", cursor: contemplSaving ? "default" : "pointer" }}>
                {contemplSaving ? "Confirmando…" : "Confirmar Contemplação"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════
          MODAL PAGAR PARCELA
      ══════════════════════════════════════════════════════ */}
      {modalParcela && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200 }}>
          <div style={{ background: "#fff", borderRadius: 14, width: "100%", maxWidth: 360, margin: "0 20px", boxShadow: "0 16px 48px rgba(0,0,0,0.18)" }}>
            <div style={{ padding: "18px 22px 14px", borderBottom: "0.5px solid #EEF1F6", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <div style={{ fontSize: 15, fontWeight: 700, color: "#1a1a1a" }}>Confirmar Pagamento</div>
                <div style={{ fontSize: 12, color: "#888", marginTop: 2 }}>Parcela {modalParcela.numero_parcela} — {fmtBRL(modalParcela.valor)} — venc. {fmtData(modalParcela.data_vencimento)}</div>
              </div>
              <button onClick={() => setModalParcela(null)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 20, color: "#888" }}>×</button>
            </div>
            <div style={{ padding: "20px 22px" }}>
              <label style={lbl}>Data do Pagamento</label>
              <input type="date" value={parcelaData} onChange={e => setParcelaData(e.target.value)} style={inp} />
            </div>
            <div style={{ padding: "14px 22px 18px", borderTop: "0.5px solid #EEF1F6", display: "flex", justifyContent: "flex-end", gap: 10 }}>
              <button style={btnR} onClick={() => setModalParcela(null)}>Cancelar</button>
              <button onClick={pagarParcela} disabled={parcelaSaving} style={{ ...btnV, background: parcelaSaving ? "#aaa" : "#1A4870", cursor: parcelaSaving ? "default" : "pointer" }}>
                {parcelaSaving ? "Salvando…" : "Confirmar Pagamento"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
