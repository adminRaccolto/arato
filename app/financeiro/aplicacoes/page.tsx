"use client";
import { useState, useEffect, useCallback } from "react";
import TopNav from "../../../components/TopNav";
import { useAuth } from "../../../components/AuthProvider";
import { supabase } from "../../../lib/supabase";
import InputMonetario from "../../../components/InputMonetario";

const inp: React.CSSProperties = { width: "100%", padding: "8px 10px", border: "0.5px solid var(--border-table)", borderRadius: 8, fontSize: 13, color: "var(--text-1)", background: "var(--bg-card)", boxSizing: "border-box", outline: "none" };
const lbl: React.CSSProperties = { fontSize: 11, color: "var(--text-2)", marginBottom: 4, display: "block" };
const btnV: React.CSSProperties = { padding: "8px 20px", background: "#1A4870", color: "#fff", border: "none", borderRadius: 8, fontWeight: 600, cursor: "pointer", fontSize: 13 };
const btnR: React.CSSProperties = { padding: "8px 18px", border: "0.5px solid var(--border-table)", borderRadius: 8, background: "transparent", cursor: "pointer", fontSize: 13, color: "var(--text-1)" };

const fmtBRL  = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fmtPct  = (v: number) => `${v >= 0 ? "+" : ""}${v.toFixed(2)}%`;
const fmtData = (s?: string) => s ? new Date(s + "T12:00:00").toLocaleDateString("pt-BR") : "—";
const hoje    = () => new Date().toISOString().split("T")[0];

// ─── Tipos ───────────────────────────────────────────────────
type TipoAplicacao   = "cdb" | "lci" | "lca" | "cri" | "cra" | "fundos" | "tesouro" | "poupanca" | "outro";
type TipoIndexador   = "cdi" | "ipca" | "prefixado" | "cdi_mais" | "livre";
type StatusAplicacao = "ativa" | "resgatada";
type TipoMovimento   = "aporte" | "rendimento" | "resgate_parcial" | "resgate_total";

interface ContaBancariaMin { id: string; banco?: string; agencia?: string; conta?: string; descricao?: string; tipo?: string; }

interface AplicacaoFinanceira {
  id: string; fazenda_id: string;
  nome: string; tipo: TipoAplicacao; instituicao?: string;
  conta_corrente?: string;    // label da conta corrente (saída de caixa)
  conta_aplicacao?: string;   // nome/descrição da conta de investimento (livre)
  valor_aportado: number; valor_atual: number; rendimentos_brutos: number;
  taxa_contratada?: number; indexador?: TipoIndexador;
  data_inicio: string; data_vencimento?: string;
  status: StatusAplicacao; observacao?: string;
}

interface AplicacaoMovimento {
  id: string; aplicacao_id: string; fazenda_id: string;
  tipo: TipoMovimento; data: string;
  valor_bruto: number; iof: number; ir: number; valor_liquido?: number;
  conta_origem?: string; conta_destino?: string; observacao?: string;
}

const TIPO_LABEL: Record<TipoAplicacao, string> = {
  cdb: "CDB", lci: "LCI", lca: "LCA", cri: "CRI", cra: "CRA",
  fundos: "Fundos", tesouro: "Tesouro", poupanca: "Poupança", outro: "Outro",
};
const TIPO_COR: Record<TipoAplicacao, string> = {
  cdb: "#1A4870", lci: "#16A34A", lca: "#0D9488", cri: "#7C3AED", cra: "#C9921B",
  fundos: "#378ADD", tesouro: "#0B2D50", poupanca: "#16A34A", outro: "#666",
};
const INDEXADOR_LABEL: Record<TipoIndexador, string> = {
  cdi: "CDI", ipca: "IPCA", prefixado: "Prefixado", cdi_mais: "CDI+", livre: "Livre",
};
const MOV_LABEL: Record<TipoMovimento, string> = {
  aporte: "Aporte", rendimento: "Rendimento", resgate_parcial: "Resgate Parcial", resgate_total: "Resgate Total",
};
const MOV_COR: Record<TipoMovimento, string> = {
  aporte: "#1A4870", rendimento: "#16A34A", resgate_parcial: "#C9921B", resgate_total: "#E24B4A",
};

// ─── Componente principal ────────────────────────────────────
export default function AplicacoesFinanceirasPage() {
  const { fazendaId } = useAuth();

  const [aplicacoes, setAplicacoes]   = useState<AplicacaoFinanceira[]>([]);
  const [movimentos, setMovimentos]   = useState<AplicacaoMovimento[]>([]);
  const [contas, setContas]           = useState<ContaBancariaMin[]>([]);
  const [expand, setExpand]           = useState<string | null>(null);

  // Modal nova/editar
  const [modalNova, setModalNova]   = useState(false);
  const [editando, setEditando]     = useState<AplicacaoFinanceira | null>(null);
  const [nForm, setNForm] = useState({
    nome: "", tipo: "cdb" as TipoAplicacao, instituicao: "",
    conta_corrente: "", conta_aplicacao: "",
    valor_inicial: 0, taxa_contratada: 0, indexador: "cdi" as TipoIndexador,
    data_inicio: hoje(), data_vencimento: "", observacao: "",
  });
  const [nSaving, setNSaving] = useState(false);
  const [nErr, setNErr]       = useState("");

  // Modal aporte
  const [modalAporte, setModalAporte]   = useState<AplicacaoFinanceira | null>(null);
  const [aForm, setAForm] = useState({ valor: 0, data: hoje(), conta_corrente: "", observacao: "" });
  const [aSaving, setASaving] = useState(false);
  const [aErr, setAErr]       = useState("");

  // Modal rendimento
  const [modalRend, setModalRend]   = useState<AplicacaoFinanceira | null>(null);
  const [rForm, setRForm] = useState({ valor_bruto: 0, data: hoje(), tipo_registro: "acruado" as "acruado" | "recebido", conta_destino: "", observacao: "" });
  const [rSaving, setRSaving] = useState(false);
  const [rErr, setRErr]       = useState("");

  // Modal resgate
  const [modalResgate, setModalResgate]   = useState<AplicacaoFinanceira | null>(null);
  const [rgForm, setRgForm] = useState({ tipo: "resgate_parcial" as "resgate_parcial" | "resgate_total", valor_bruto: 0, iof: 0, ir: 0, data: hoje(), conta_destino: "", observacao: "" });
  const [rgSaving, setRgSaving] = useState(false);
  const [rgErr, setRgErr]       = useState("");

  // ─── Carregar ─────────────────────────────────────────────
  const carregar = useCallback(async () => {
    if (!fazendaId) return;
    const [{ data: ap }, { data: mv }, { data: cb }] = await Promise.all([
      supabase.from("aplicacoes_financeiras").select("*").eq("fazenda_id", fazendaId).order("data_inicio", { ascending: false }),
      supabase.from("aplicacao_movimentos").select("*").eq("fazenda_id", fazendaId).order("data", { ascending: false }),
      supabase.from("contas_bancarias").select("id, banco, agencia, conta, descricao, tipo").eq("fazenda_id", fazendaId),
    ]);
    setAplicacoes(ap ?? []);
    setMovimentos(mv ?? []);
    setContas(cb ?? []);
  }, [fazendaId]);

  useEffect(() => { carregar(); }, [carregar]);

  const contaLabel = (c: ContaBancariaMin) =>
    `${c.banco ?? ""} ${c.agencia ? `Ag. ${c.agencia}` : ""} ${c.conta ? `C/C ${c.conta}` : ""}`.trim() || c.descricao || c.id;
  const contaOpts = contas.map(c => <option key={c.id} value={contaLabel(c)}>{contaLabel(c)}</option>);
  // Agrupa investimento em cima para facilitar seleção de conta aplicação
  const contaOptsGrupo = (() => {
    const inv  = contas.filter(c => c.tipo === "investimento");
    const rest = contas.filter(c => c.tipo !== "investimento");
    return [
      inv.length  > 0 && <optgroup key="inv"  label="● Conta Investimento">{inv.map(c =>  <option key={c.id} value={contaLabel(c)}>{contaLabel(c)}</option>)}</optgroup>,
      rest.length > 0 && <optgroup key="rest" label="Outras Contas">{rest.map(c => <option key={c.id} value={contaLabel(c)}>{contaLabel(c)}</option>)}</optgroup>,
    ].filter(Boolean);
  })();

  // ─── KPIs ─────────────────────────────────────────────────
  const ativas = aplicacoes.filter(a => a.status === "ativa");
  const totalAtual        = ativas.reduce((s, a) => s + a.valor_atual, 0);
  const totalAportado     = ativas.reduce((s, a) => s + a.valor_aportado, 0);
  const totalRendBrutos   = ativas.reduce((s, a) => s + a.rendimentos_brutos, 0);
  const irEstimado        = totalRendBrutos * 0.15;
  const saldoLiquidoEst   = totalAtual - irEstimado;
  const rentabilidadePct  = totalAportado > 0 ? ((totalAtual - totalAportado) / totalAportado) * 100 : 0;

  // ─── Helpers de lancamento ────────────────────────────────
  async function criarLancamento(payload: {
    tipo: "pagar" | "receber"; categoria: string; descricao: string;
    valor: number; data: string; conta?: string;
  }) {
    await supabase.from("lancamentos").insert({
      fazenda_id: fazendaId,
      tipo: payload.tipo, moeda: "BRL",
      descricao: payload.descricao, categoria: payload.categoria,
      valor: payload.valor,
      data_lancamento: payload.data, data_vencimento: payload.data,
      status: "baixado", auto: false,
      conta_bancaria: payload.conta || null,
      origem_lancamento: "aplicacao_financeira",
    });
  }

  // ─── Nova/Editar Aplicação ────────────────────────────────
  function abrirNova(a?: AplicacaoFinanceira) {
    if (a) {
      setEditando(a);
      setNForm({ nome: a.nome, tipo: a.tipo, instituicao: a.instituicao ?? "", conta_corrente: a.conta_corrente ?? "", conta_aplicacao: a.conta_aplicacao ?? "", valor_inicial: a.valor_aportado, taxa_contratada: a.taxa_contratada ?? 0, indexador: a.indexador ?? "cdi", data_inicio: a.data_inicio, data_vencimento: a.data_vencimento ?? "", observacao: a.observacao ?? "" });
    } else {
      setEditando(null);
      setNForm({ nome: "", tipo: "cdb", instituicao: "", conta_corrente: "", conta_aplicacao: "", valor_inicial: 0, taxa_contratada: 0, indexador: "cdi", data_inicio: hoje(), data_vencimento: "", observacao: "" });
    }
    setNErr(""); setModalNova(true);
  }

  async function salvarNova() {
    if (!fazendaId) return;
    if (!nForm.nome.trim()) { setNErr("Informe o nome da aplicação."); return; }
    if (!editando && nForm.valor_inicial <= 0) { setNErr("Informe o valor inicial."); return; }
    setNSaving(true); setNErr("");
    try {
      if (editando) {
        await supabase.from("aplicacoes_financeiras").update({
          nome: nForm.nome.trim(), tipo: nForm.tipo, instituicao: nForm.instituicao || null,
          conta_corrente: nForm.conta_corrente || null, conta_aplicacao: nForm.conta_aplicacao || null,
          taxa_contratada: nForm.taxa_contratada || null, indexador: nForm.indexador,
          data_vencimento: nForm.data_vencimento || null, observacao: nForm.observacao || null,
        }).eq("id", editando.id);
      } else {
        const { data: ap } = await supabase.from("aplicacoes_financeiras").insert({
          fazenda_id: fazendaId,
          nome: nForm.nome.trim(), tipo: nForm.tipo, instituicao: nForm.instituicao || null,
          conta_corrente: nForm.conta_corrente || null, conta_aplicacao: nForm.conta_aplicacao || null,
          valor_aportado: nForm.valor_inicial, valor_atual: nForm.valor_inicial, rendimentos_brutos: 0,
          taxa_contratada: nForm.taxa_contratada || null, indexador: nForm.indexador,
          data_inicio: nForm.data_inicio, data_vencimento: nForm.data_vencimento || null,
          status: "ativa", observacao: nForm.observacao || null,
        }).select().single();

        if (ap && nForm.valor_inicial > 0) {
          // Movimento inicial de aporte
          await supabase.from("aplicacao_movimentos").insert({
            aplicacao_id: ap.id, fazenda_id: fazendaId,
            tipo: "aporte", data: nForm.data_inicio,
            valor_bruto: nForm.valor_inicial, iof: 0, ir: 0, valor_liquido: nForm.valor_inicial,
            conta_origem: nForm.conta_corrente || null,
            conta_destino: nForm.conta_aplicacao || null,
          });
          // Double-entry: saída da corrente + entrada na investimento
          const descApl = `Aporte em ${nForm.nome.trim()} — ${TIPO_LABEL[nForm.tipo]}`;
          const inserts = [];
          if (nForm.conta_corrente)  inserts.push({ fazenda_id: fazendaId, tipo: "pagar"   as const, moeda: "BRL", descricao: `${descApl} ← saída`, categoria: "Aporte em Aplicação Financeira", valor: nForm.valor_inicial, data_lancamento: nForm.data_inicio, data_vencimento: nForm.data_inicio, status: "baixado" as const, auto: false, conta_bancaria: nForm.conta_corrente, origem_lancamento: "aplicacao_financeira" });
          if (nForm.conta_aplicacao) inserts.push({ fazenda_id: fazendaId, tipo: "receber" as const, moeda: "BRL", descricao: `${descApl} → entrada`, categoria: "Aporte em Aplicação Financeira", valor: nForm.valor_inicial, data_lancamento: nForm.data_inicio, data_vencimento: nForm.data_inicio, status: "baixado" as const, auto: false, conta_bancaria: nForm.conta_aplicacao, origem_lancamento: "aplicacao_financeira" });
          if (inserts.length > 0) await supabase.from("lancamentos").insert(inserts);
        }
      }
      await carregar(); setModalNova(false);
    } catch (e: unknown) { setNErr(e instanceof Error ? e.message : "Erro ao salvar."); }
    finally { setNSaving(false); }
  }

  // ─── Aporte ───────────────────────────────────────────────
  function abrirAporte(a: AplicacaoFinanceira) {
    setModalAporte(a);
    setAForm({ valor: 0, data: hoje(), conta_corrente: a.conta_corrente ?? "", observacao: "" });
    setAErr("");
  }

  async function salvarAporte() {
    if (!modalAporte || !fazendaId) return;
    if (aForm.valor <= 0) { setAErr("Informe o valor do aporte."); return; }
    setASaving(true); setAErr("");
    try {
      // Movimento
      await supabase.from("aplicacao_movimentos").insert({
        aplicacao_id: modalAporte.id, fazenda_id: fazendaId,
        tipo: "aporte", data: aForm.data,
        valor_bruto: aForm.valor, iof: 0, ir: 0, valor_liquido: aForm.valor,
        conta_origem: aForm.conta_corrente || null,
        conta_destino: modalAporte.conta_aplicacao || null,
        observacao: aForm.observacao || null,
      });
      // Atualiza saldos
      await supabase.from("aplicacoes_financeiras").update({
        valor_aportado: modalAporte.valor_aportado + aForm.valor,
        valor_atual: modalAporte.valor_atual + aForm.valor,
      }).eq("id", modalAporte.id);
      // Double-entry: saída corrente + entrada investimento
      const descAp = `Aporte em ${modalAporte.nome} — ${TIPO_LABEL[modalAporte.tipo]}`;
      const insAp = [];
      if (aForm.conta_corrente)          insAp.push({ fazenda_id: fazendaId, tipo: "pagar"   as const, moeda: "BRL", descricao: `${descAp} ← saída`, categoria: "Aporte em Aplicação Financeira", valor: aForm.valor, data_lancamento: aForm.data, data_vencimento: aForm.data, status: "baixado" as const, auto: false, conta_bancaria: aForm.conta_corrente, origem_lancamento: "aplicacao_financeira" });
      if (modalAporte.conta_aplicacao)   insAp.push({ fazenda_id: fazendaId, tipo: "receber" as const, moeda: "BRL", descricao: `${descAp} → entrada`, categoria: "Aporte em Aplicação Financeira", valor: aForm.valor, data_lancamento: aForm.data, data_vencimento: aForm.data, status: "baixado" as const, auto: false, conta_bancaria: modalAporte.conta_aplicacao, origem_lancamento: "aplicacao_financeira" });
      if (insAp.length > 0) await supabase.from("lancamentos").insert(insAp);
      await carregar(); setModalAporte(null);
    } catch (e: unknown) { setAErr(e instanceof Error ? e.message : "Erro."); }
    finally { setASaving(false); }
  }

  // ─── Rendimento ───────────────────────────────────────────
  function abrirRendimento(a: AplicacaoFinanceira) {
    setModalRend(a);
    setRForm({ valor_bruto: 0, data: hoje(), tipo_registro: "acruado", conta_destino: a.conta_corrente ?? "", observacao: "" });
    setRErr("");
  }

  async function salvarRendimento() {
    if (!modalRend || !fazendaId) return;
    if (rForm.valor_bruto <= 0) { setRErr("Informe o valor do rendimento."); return; }
    setRSaving(true); setRErr("");
    try {
      // Movimento
      await supabase.from("aplicacao_movimentos").insert({
        aplicacao_id: modalRend.id, fazenda_id: fazendaId,
        tipo: "rendimento", data: rForm.data,
        valor_bruto: rForm.valor_bruto, iof: 0, ir: 0, valor_liquido: rForm.valor_bruto,
        conta_destino: rForm.tipo_registro === "recebido" ? rForm.conta_destino : null,
        observacao: rForm.observacao || null,
      });
      // Atualiza saldos
      await supabase.from("aplicacoes_financeiras").update({
        valor_atual: modalRend.valor_atual + rForm.valor_bruto,
        rendimentos_brutos: modalRend.rendimentos_brutos + rForm.valor_bruto,
      }).eq("id", modalRend.id);
      // Lançamento financeiro só se rendimento foi efetivamente recebido na conta
      if (rForm.tipo_registro === "recebido" && rForm.conta_destino) {
        await criarLancamento({
          tipo: "receber", categoria: "Rendimento Financeiro",
          descricao: `Rendimento de ${modalRend.nome} — ${TIPO_LABEL[modalRend.tipo]}`,
          valor: rForm.valor_bruto, data: rForm.data, conta: rForm.conta_destino,
        });
      }
      await carregar(); setModalRend(null);
    } catch (e: unknown) { setRErr(e instanceof Error ? e.message : "Erro."); }
    finally { setRSaving(false); }
  }

  // ─── Resgate ──────────────────────────────────────────────
  function abrirResgate(a: AplicacaoFinanceira) {
    setModalResgate(a);
    setRgForm({ tipo: "resgate_parcial", valor_bruto: 0, iof: 0, ir: 0, data: hoje(), conta_destino: a.conta_corrente ?? "", observacao: "" });
    setRgErr("");
  }

  async function salvarResgate() {
    if (!modalResgate || !fazendaId) return;
    if (rgForm.valor_bruto <= 0) { setRgErr("Informe o valor do resgate."); return; }
    if (rgForm.valor_bruto > modalResgate.valor_atual) { setRgErr(`Valor maior que o saldo atual (${fmtBRL(modalResgate.valor_atual)}).`); return; }
    setRgSaving(true); setRgErr("");
    try {
      const valorLiquido = rgForm.valor_bruto - rgForm.iof - rgForm.ir;
      const isTotal = rgForm.tipo === "resgate_total";

      // Movimento
      await supabase.from("aplicacao_movimentos").insert({
        aplicacao_id: modalResgate.id, fazenda_id: fazendaId,
        tipo: rgForm.tipo, data: rgForm.data,
        valor_bruto: rgForm.valor_bruto, iof: rgForm.iof, ir: rgForm.ir, valor_liquido: valorLiquido,
        conta_origem: modalResgate.conta_aplicacao || null,
        conta_destino: rgForm.conta_destino || null,
        observacao: rgForm.observacao || null,
      });

      // Atualiza saldo
      const novoValorAtual = isTotal ? 0 : modalResgate.valor_atual - rgForm.valor_bruto;
      await supabase.from("aplicacoes_financeiras").update({
        valor_atual: novoValorAtual,
        status: isTotal ? "resgatada" : "ativa",
      }).eq("id", modalResgate.id);

      // Double-entry: saída investimento + entrada corrente + IOF/IR
      const descRsg = `Resgate de ${modalResgate.nome} — ${TIPO_LABEL[modalResgate.tipo]}`;
      const insRsg: object[] = [];
      if (modalResgate.conta_aplicacao) insRsg.push({ fazenda_id: fazendaId, tipo: "pagar"   as const, moeda: "BRL", descricao: `${descRsg} ← saída aplicação`, categoria: "Resgate de Aplicação Financeira", valor: rgForm.valor_bruto, data_lancamento: rgForm.data, data_vencimento: rgForm.data, status: "baixado" as const, auto: false, conta_bancaria: modalResgate.conta_aplicacao, origem_lancamento: "aplicacao_financeira" });
      if (rgForm.conta_destino)          insRsg.push({ fazenda_id: fazendaId, tipo: "receber" as const, moeda: "BRL", descricao: `${descRsg} → entrada líquida`, categoria: "Resgate de Aplicação Financeira", valor: valorLiquido, data_lancamento: rgForm.data, data_vencimento: rgForm.data, status: "baixado" as const, auto: false, conta_bancaria: rgForm.conta_destino, origem_lancamento: "aplicacao_financeira" });
      if (rgForm.iof > 0 && rgForm.conta_destino) insRsg.push({ fazenda_id: fazendaId, tipo: "pagar" as const, moeda: "BRL", descricao: `IOF s/ ${descRsg}`, categoria: "IOF — Aplicação Financeira", valor: rgForm.iof, data_lancamento: rgForm.data, data_vencimento: rgForm.data, status: "baixado" as const, auto: false, conta_bancaria: rgForm.conta_destino, origem_lancamento: "aplicacao_financeira" });
      if (rgForm.ir  > 0 && rgForm.conta_destino) insRsg.push({ fazenda_id: fazendaId, tipo: "pagar" as const, moeda: "BRL", descricao: `IR s/ ${descRsg}`, categoria: "IR — Rendimentos Financeiros", valor: rgForm.ir,  data_lancamento: rgForm.data, data_vencimento: rgForm.data, status: "baixado" as const, auto: false, conta_bancaria: rgForm.conta_destino, origem_lancamento: "aplicacao_financeira" });
      if (insRsg.length > 0) await supabase.from("lancamentos").insert(insRsg);

      await carregar(); setModalResgate(null);
    } catch (e: unknown) { setRgErr(e instanceof Error ? e.message : "Erro."); }
    finally { setRgSaving(false); }
  }

  // ─── Render ───────────────────────────────────────────────
  return (
    <div style={{ minHeight: "100vh", background: "var(--bg-page)" }}>
      <TopNav />
      <main style={{ maxWidth: 1100, margin: "0 auto", padding: "28px 20px" }}>

        {/* Cabeçalho */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 22 }}>
          <div>
            <h1 style={{ fontSize: 20, fontWeight: 700, color: "var(--text-1)", margin: 0 }}>Aplicações Financeiras</h1>
            <p style={{ fontSize: 13, color: "#666", marginTop: 4, marginBottom: 0 }}>
              CDB, LCI, LCA, Tesouro Direto, Fundos — controle de aportes, rendimentos e resgates
            </p>
          </div>
          <button onClick={() => abrirNova()} style={btnV}>+ Nova Aplicação</button>
        </div>

        {/* KPIs */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 12, marginBottom: 22 }}>
          {[
            { label: "Saldo Atual",        value: fmtBRL(totalAtual),       sub: `${ativas.length} aplicações ativas`, color: "#1A4870" },
            { label: "Total Aportado",     value: fmtBRL(totalAportado),    sub: "capital investido",                  color: "#0B2D50" },
            { label: "Rendimentos Brutos", value: fmtBRL(totalRendBrutos),  sub: `${fmtPct(rentabilidadePct)} de rentabilidade`,    color: "#16A34A" },
            { label: "IR Estimado (15%)",  value: fmtBRL(irEstimado),       sub: "sobre rendimentos",                  color: "#EF9F27" },
            { label: "Saldo Líquido Est.", value: fmtBRL(saldoLiquidoEst),  sub: "após IR estimado",                  color: "#0D9488" },
          ].map(k => (
            <div key={k.label} style={{ background: "var(--bg-card)", borderRadius: 12, border: "0.5px solid var(--border-table)", padding: "14px 16px" }}>
              <div style={{ fontSize: 10, color: "#666", marginBottom: 5 }}>{k.label}</div>
              <div style={{ fontSize: 16, fontWeight: 700, color: k.color }}>{k.value}</div>
              <div style={{ fontSize: 10, color: "var(--text-3)", marginTop: 2 }}>{k.sub}</div>
            </div>
          ))}
        </div>

        {/* Lista de aplicações */}
        {aplicacoes.length === 0 ? (
          <div style={{ background: "var(--bg-card)", borderRadius: 12, border: "0.5px solid var(--border-table)", padding: 48, textAlign: "center", color: "var(--text-3)", fontSize: 13 }}>
            Nenhuma aplicação financeira cadastrada.<br />
            <span style={{ fontSize: 12 }}>Use "+ Nova Aplicação" para registrar um CDB, LCI, Tesouro Direto, etc.</span>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {/* Ativas */}
            {ativas.length > 0 && <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-2)", marginTop: 4 }}>ATIVAS ({ativas.length})</div>}
            {ativas.map(a => <CardAplicacao key={a.id} a={a} movimentos={movimentos.filter(m => m.aplicacao_id === a.id)} expand={expand} setExpand={setExpand} abrirNova={abrirNova} abrirAporte={abrirAporte} abrirRendimento={abrirRendimento} abrirResgate={abrirResgate} />)}

            {/* Resgatadas */}
            {aplicacoes.filter(a => a.status === "resgatada").length > 0 && (
              <>
                <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-2)", marginTop: 8 }}>ENCERRADAS</div>
                {aplicacoes.filter(a => a.status === "resgatada").map(a => <CardAplicacao key={a.id} a={a} movimentos={movimentos.filter(m => m.aplicacao_id === a.id)} expand={expand} setExpand={setExpand} abrirNova={abrirNova} abrirAporte={abrirAporte} abrirRendimento={abrirRendimento} abrirResgate={abrirResgate} />)}
              </>
            )}
          </div>
        )}
      </main>

      {/* ═══════════ MODAL NOVA APLICAÇÃO ═══════════ */}
      {modalNova && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 2000, overflowY: "auto", padding: "24px 0" }}>
          <div style={{ background: "var(--bg-card)", borderRadius: 14, width: "100%", maxWidth: 640, margin: "0 20px", boxShadow: "0 4px 20px rgba(11,45,80,0.10)" }}>
            <div style={{ padding: "18px 22px 14px", borderBottom: "0.5px solid var(--bg-tag)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: "var(--text-1)" }}>{editando ? "Editar Aplicação" : "Nova Aplicação Financeira"}</div>
              <button onClick={() => setModalNova(false)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 20, color: "var(--text-3)" }}>×</button>
            </div>
            <div style={{ padding: "20px 22px", display: "flex", flexDirection: "column", gap: 14 }}>
              {nErr && <div style={{ background: "#FCEBEB", border: "0.5px solid #F5C6C6", borderRadius: 8, padding: "10px 14px", fontSize: 13, color: "#791F1F" }}>{nErr}</div>}

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div style={{ gridColumn: "1 / -1" }}>
                  <label style={lbl}>Nome da Aplicação</label>
                  <input value={nForm.nome} onChange={e => setNForm(f => ({ ...f, nome: e.target.value }))} style={inp} placeholder="Ex.: CDB Bradesco 105% CDI" />
                </div>
                <div>
                  <label style={lbl}>Tipo</label>
                  <select value={nForm.tipo} onChange={e => setNForm(f => ({ ...f, tipo: e.target.value as TipoAplicacao }))} style={inp}>
                    {Object.entries(TIPO_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </select>
                </div>
                <div>
                  <label style={lbl}>Instituição (banco / corretora)</label>
                  <input value={nForm.instituicao} onChange={e => setNForm(f => ({ ...f, instituicao: e.target.value }))} style={inp} placeholder="Ex.: Bradesco, XP, Nubank" />
                </div>

                {/* Contas */}
                <div style={{ gridColumn: "1 / -1", background: "var(--bg-page)", borderRadius: 8, padding: "12px 14px", display: "flex", flexDirection: "column", gap: 10 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-2)" }}>Contas envolvidas</div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                    <div>
                      <label style={lbl}>Conta Corrente — dinheiro SAI daqui ao aportar</label>
                      <select value={nForm.conta_corrente} onChange={e => setNForm(f => ({ ...f, conta_corrente: e.target.value }))} style={inp}>
                        <option value="">— não informado —</option>
                        {contaOpts}
                      </select>
                    </div>
                    <div>
                      <label style={lbl}>Conta Investimento — dinheiro ENTRA aqui ao aportar</label>
                      <select value={nForm.conta_aplicacao} onChange={e => setNForm(f => ({ ...f, conta_aplicacao: e.target.value }))} style={inp}>
                        <option value="">— não informado —</option>
                        {contaOptsGrupo}
                      </select>
                      <div style={{ fontSize: 10, color: "var(--text-3)", marginTop: 3 }}>Cadastre em Cadastros → Contas Bancárias como tipo "Conta Investimento"</div>
                    </div>
                  </div>
                </div>

                {!editando && (
                  <div>
                    <label style={lbl}>Valor do Aporte Inicial (R$)</label>
                    <InputMonetario value={nForm.valor_inicial} onChange={v => setNForm(f => ({ ...f, valor_inicial: v }))} style={inp} />
                  </div>
                )}
                <div>
                  <label style={lbl}>Taxa Contratada (%)</label>
                  <InputMonetario value={nForm.taxa_contratada} onChange={v => setNForm(f => ({ ...f, taxa_contratada: v }))} style={inp} placeholder="Ex.: 105,00 para CDB 105% CDI" />
                </div>
                <div>
                  <label style={lbl}>Indexador</label>
                  <select value={nForm.indexador} onChange={e => setNForm(f => ({ ...f, indexador: e.target.value as TipoIndexador }))} style={inp}>
                    {Object.entries(INDEXADOR_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </select>
                </div>
                <div>
                  <label style={lbl}>Data de Início</label>
                  <input type="date" value={nForm.data_inicio} onChange={e => setNForm(f => ({ ...f, data_inicio: e.target.value }))} style={inp} />
                </div>
                <div>
                  <label style={lbl}>Data de Vencimento</label>
                  <input type="date" value={nForm.data_vencimento} onChange={e => setNForm(f => ({ ...f, data_vencimento: e.target.value }))} style={inp} />
                </div>
                <div style={{ gridColumn: "1 / -1" }}>
                  <label style={lbl}>Observação</label>
                  <textarea value={nForm.observacao} onChange={e => setNForm(f => ({ ...f, observacao: e.target.value }))} rows={2} style={{ ...inp, resize: "vertical" }} />
                </div>
              </div>
            </div>
            <div style={{ padding: "14px 22px 18px", borderTop: "0.5px solid var(--bg-tag)", display: "flex", justifyContent: "flex-end", gap: 10 }}>
              <button style={btnR} onClick={() => setModalNova(false)}>Cancelar</button>
              <button onClick={salvarNova} disabled={nSaving} style={{ ...btnV, cursor: nSaving ? "default" : "pointer", background: nSaving ? "var(--text-muted)" : "#1A4870" }}>{nSaving ? "Salvando…" : "Salvar"}</button>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════ MODAL APORTE ═══════════ */}
      {modalAporte && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 2000 }}>
          <div style={{ background: "var(--bg-card)", borderRadius: 14, width: "100%", maxWidth: 440, margin: "0 20px", boxShadow: "0 4px 20px rgba(11,45,80,0.10)" }}>
            <div style={{ padding: "18px 22px 14px", borderBottom: "0.5px solid var(--bg-tag)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <div style={{ fontSize: 15, fontWeight: 700, color: "var(--text-1)" }}>Novo Aporte</div>
                <div style={{ fontSize: 12, color: "var(--text-3)", marginTop: 2 }}>{modalAporte.nome}</div>
              </div>
              <button onClick={() => setModalAporte(null)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 20, color: "var(--text-3)" }}>×</button>
            </div>
            <div style={{ padding: "20px 22px", display: "flex", flexDirection: "column", gap: 12 }}>
              {aErr && <div style={{ background: "#FCEBEB", border: "0.5px solid #F5C6C6", borderRadius: 8, padding: "10px 14px", fontSize: 13, color: "#791F1F" }}>{aErr}</div>}
              <div>
                <label style={lbl}>Conta de Origem (saída de caixa)</label>
                <select value={aForm.conta_corrente} onChange={e => setAForm(f => ({ ...f, conta_corrente: e.target.value }))} style={inp}>
                  <option value="">— não informado —</option>
                  {contaOpts}
                </select>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div>
                  <label style={lbl}>Valor (R$)</label>
                  <InputMonetario value={aForm.valor} onChange={v => setAForm(f => ({ ...f, valor: v }))} style={inp} />
                </div>
                <div>
                  <label style={lbl}>Data</label>
                  <input type="date" value={aForm.data} onChange={e => setAForm(f => ({ ...f, data: e.target.value }))} style={inp} />
                </div>
              </div>
              <div>
                <label style={lbl}>Observação</label>
                <input value={aForm.observacao} onChange={e => setAForm(f => ({ ...f, observacao: e.target.value }))} style={inp} />
              </div>
            </div>
            <div style={{ padding: "14px 22px 18px", borderTop: "0.5px solid var(--bg-tag)", display: "flex", justifyContent: "flex-end", gap: 10 }}>
              <button style={btnR} onClick={() => setModalAporte(null)}>Cancelar</button>
              <button onClick={salvarAporte} disabled={aSaving} style={{ ...btnV, cursor: aSaving ? "default" : "pointer", background: aSaving ? "var(--text-muted)" : "#1A4870" }}>{aSaving ? "Salvando…" : "Salvar"}</button>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════ MODAL RENDIMENTO ═══════════ */}
      {modalRend && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 2000 }}>
          <div style={{ background: "var(--bg-card)", borderRadius: 14, width: "100%", maxWidth: 460, margin: "0 20px", boxShadow: "0 4px 20px rgba(11,45,80,0.10)" }}>
            <div style={{ padding: "18px 22px 14px", borderBottom: "0.5px solid var(--bg-tag)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <div style={{ fontSize: 15, fontWeight: 700, color: "var(--text-1)" }}>Registrar Rendimento</div>
                <div style={{ fontSize: 12, color: "var(--text-3)", marginTop: 2 }}>{modalRend.nome} · Saldo atual: {fmtBRL(modalRend.valor_atual)}</div>
              </div>
              <button onClick={() => setModalRend(null)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 20, color: "var(--text-3)" }}>×</button>
            </div>
            <div style={{ padding: "20px 22px", display: "flex", flexDirection: "column", gap: 12 }}>
              {rErr && <div style={{ background: "#FCEBEB", border: "0.5px solid #F5C6C6", borderRadius: 8, padding: "10px 14px", fontSize: 13, color: "#791F1F" }}>{rErr}</div>}
              <div>
                <label style={lbl}>Tipo de Registro</label>
                <div style={{ display: "flex", gap: 8 }}>
                  {([
                    { v: "acruado",  label: "Acruado na Aplicação",   desc: "Aumenta saldo, sem entrada em conta" },
                    { v: "recebido", label: "Recebido em Conta",       desc: "Entra na conta corrente" },
                  ] as { v: "acruado" | "recebido"; label: string; desc: string }[]).map(opt => (
                    <button key={opt.v} onClick={() => setRForm(f => ({ ...f, tipo_registro: opt.v }))}
                      style={{ flex: 1, padding: "10px 12px", border: `2px solid ${rForm.tipo_registro === opt.v ? "#16A34A" : "var(--border-table)"}`, borderRadius: 8, background: rForm.tipo_registro === opt.v ? "#DCFCE7" : "var(--bg-card)", cursor: "pointer", textAlign: "left" }}>
                      <div style={{ fontSize: 12, fontWeight: 600, color: rForm.tipo_registro === opt.v ? "#166534" : "var(--text-1)" }}>{opt.label}</div>
                      <div style={{ fontSize: 10, color: "#666", marginTop: 2 }}>{opt.desc}</div>
                    </button>
                  ))}
                </div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div>
                  <label style={lbl}>Valor do Rendimento (R$)</label>
                  <InputMonetario value={rForm.valor_bruto} onChange={v => setRForm(f => ({ ...f, valor_bruto: v }))} style={inp} />
                </div>
                <div>
                  <label style={lbl}>Data</label>
                  <input type="date" value={rForm.data} onChange={e => setRForm(f => ({ ...f, data: e.target.value }))} style={inp} />
                </div>
              </div>
              {rForm.tipo_registro === "recebido" && (
                <div>
                  <label style={lbl}>Conta de Destino (onde o dinheiro entra)</label>
                  <select value={rForm.conta_destino} onChange={e => setRForm(f => ({ ...f, conta_destino: e.target.value }))} style={inp}>
                    <option value="">— não informado —</option>
                    {contaOpts}
                  </select>
                </div>
              )}
              <div>
                <label style={lbl}>Observação</label>
                <input value={rForm.observacao} onChange={e => setRForm(f => ({ ...f, observacao: e.target.value }))} style={inp} />
              </div>
              <div style={{ background: "#ECFDF5", borderRadius: 8, padding: "10px 14px", fontSize: 12, color: "#166534" }}>
                {rForm.tipo_registro === "acruado"
                  ? "O rendimento será incorporado ao saldo da aplicação. O lançamento financeiro ocorrerá no resgate."
                  : "Será gerado um lançamento de Receita Financeira na conta selecionada."}
              </div>
            </div>
            <div style={{ padding: "14px 22px 18px", borderTop: "0.5px solid var(--bg-tag)", display: "flex", justifyContent: "flex-end", gap: 10 }}>
              <button style={btnR} onClick={() => setModalRend(null)}>Cancelar</button>
              <button onClick={salvarRendimento} disabled={rSaving} style={{ ...btnV, cursor: rSaving ? "default" : "pointer", background: rSaving ? "var(--text-muted)" : "#16A34A" }}>{rSaving ? "Salvando…" : "Registrar"}</button>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════ MODAL RESGATE ═══════════ */}
      {modalResgate && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 2000 }}>
          <div style={{ background: "var(--bg-card)", borderRadius: 14, width: "100%", maxWidth: 500, margin: "0 20px", boxShadow: "0 4px 20px rgba(11,45,80,0.10)" }}>
            <div style={{ padding: "18px 22px 14px", borderBottom: "0.5px solid var(--bg-tag)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <div style={{ fontSize: 15, fontWeight: 700, color: "var(--text-1)" }}>Resgate</div>
                <div style={{ fontSize: 12, color: "var(--text-3)", marginTop: 2 }}>{modalResgate.nome} · Saldo: {fmtBRL(modalResgate.valor_atual)}</div>
              </div>
              <button onClick={() => setModalResgate(null)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 20, color: "var(--text-3)" }}>×</button>
            </div>
            <div style={{ padding: "20px 22px", display: "flex", flexDirection: "column", gap: 12 }}>
              {rgErr && <div style={{ background: "#FCEBEB", border: "0.5px solid #F5C6C6", borderRadius: 8, padding: "10px 14px", fontSize: 13, color: "#791F1F" }}>{rgErr}</div>}

              <div>
                <label style={lbl}>Tipo de Resgate</label>
                <div style={{ display: "flex", gap: 8 }}>
                  {([
                    { v: "resgate_parcial", label: "Parcial",        cor: "#C9921B" },
                    { v: "resgate_total",   label: "Total (Encerrar)", cor: "#E24B4A" },
                  ] as { v: "resgate_parcial" | "resgate_total"; label: string; cor: string }[]).map(opt => (
                    <button key={opt.v} onClick={() => {
                      setRgForm(f => ({
                        ...f, tipo: opt.v,
                        valor_bruto: opt.v === "resgate_total" ? modalResgate.valor_atual : f.valor_bruto,
                      }));
                    }}
                      style={{ flex: 1, padding: "9px 14px", border: `2px solid ${rgForm.tipo === opt.v ? opt.cor : "var(--border-table)"}`, borderRadius: 8, background: rgForm.tipo === opt.v ? "#FFF8F0" : "var(--bg-card)", cursor: "pointer", fontSize: 12, fontWeight: 600, color: rgForm.tipo === opt.v ? opt.cor : "var(--text-2)" }}>
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label style={lbl}>Conta de Destino (onde o dinheiro entra)</label>
                <select value={rgForm.conta_destino} onChange={e => setRgForm(f => ({ ...f, conta_destino: e.target.value }))} style={inp}>
                  <option value="">— não informado —</option>
                  {contaOpts}
                </select>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
                <div style={{ gridColumn: "1 / -1" }}>
                  <label style={lbl}>Valor Bruto do Resgate (R$)</label>
                  <InputMonetario value={rgForm.valor_bruto} onChange={v => setRgForm(f => ({ ...f, valor_bruto: v }))} style={inp} />
                </div>
                <div>
                  <label style={lbl}>IOF (R$)</label>
                  <InputMonetario value={rgForm.iof} onChange={v => setRgForm(f => ({ ...f, iof: v }))} style={inp} placeholder="0,00" />
                </div>
                <div>
                  <label style={lbl}>IR s/ Rendimentos (R$)</label>
                  <InputMonetario value={rgForm.ir} onChange={v => setRgForm(f => ({ ...f, ir: v }))} style={inp} placeholder="0,00" />
                </div>
                <div>
                  <label style={lbl}>Valor Líquido</label>
                  <div style={{ ...inp, background: "var(--bg-page)", fontWeight: 700, color: "#16A34A", display: "flex", alignItems: "center" }}>
                    {fmtBRL(rgForm.valor_bruto - rgForm.iof - rgForm.ir)}
                  </div>
                </div>
              </div>
              <div>
                <label style={lbl}>Data do Resgate</label>
                <input type="date" value={rgForm.data} onChange={e => setRgForm(f => ({ ...f, data: e.target.value }))} style={inp} />
              </div>
              <div>
                <label style={lbl}>Observação</label>
                <input value={rgForm.observacao} onChange={e => setRgForm(f => ({ ...f, observacao: e.target.value }))} style={inp} />
              </div>
              {(rgForm.iof > 0 || rgForm.ir > 0) && (
                <div style={{ background: "#FBF3E0", borderRadius: 8, padding: "10px 14px", fontSize: 12, color: "#7A5200" }}>
                  Serão criados lançamentos separados de IOF {rgForm.iof > 0 ? `(${fmtBRL(rgForm.iof)})` : ""} e IR {rgForm.ir > 0 ? `(${fmtBRL(rgForm.ir)})` : ""} como despesas financeiras.
                </div>
              )}
            </div>
            <div style={{ padding: "14px 22px 18px", borderTop: "0.5px solid var(--bg-tag)", display: "flex", justifyContent: "flex-end", gap: 10 }}>
              <button style={btnR} onClick={() => setModalResgate(null)}>Cancelar</button>
              <button onClick={salvarResgate} disabled={rgSaving} style={{ ...btnV, cursor: rgSaving ? "default" : "pointer", background: rgSaving ? "var(--text-muted)" : "#E24B4A" }}>{rgSaving ? "Resgatando…" : "Confirmar Resgate"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Card de aplicação individual ────────────────────────────
function CardAplicacao({ a, movimentos, expand, setExpand, abrirNova, abrirAporte, abrirRendimento, abrirResgate }: {
  a: AplicacaoFinanceira;
  movimentos: AplicacaoMovimento[];
  expand: string | null;
  setExpand: (id: string | null) => void;
  abrirNova: (a: AplicacaoFinanceira) => void;
  abrirAporte: (a: AplicacaoFinanceira) => void;
  abrirRendimento: (a: AplicacaoFinanceira) => void;
  abrirResgate: (a: AplicacaoFinanceira) => void;
}) {
  const fmtBRL = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  const fmtData = (s?: string) => s ? new Date(s + "T12:00:00").toLocaleDateString("pt-BR") : "—";

  const rentPct = a.valor_aportado > 0 ? ((a.valor_atual - a.valor_aportado) / a.valor_aportado) * 100 : 0;
  const isResgatada = a.status === "resgatada";
  const exp = expand === a.id;

  return (
    <div style={{ background: "var(--bg-card)", borderRadius: 12, border: "0.5px solid var(--border-table)", overflow: "hidden", opacity: isResgatada ? 0.7 : 1 }}>
      <div onClick={() => setExpand(exp ? null : a.id)} style={{ display: "grid", gridTemplateColumns: "2fr 130px 130px 120px 130px 220px", alignItems: "center", gap: 12, padding: "14px 18px", cursor: "pointer" }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 10, background: TIPO_COR[a.tipo] + "20", color: TIPO_COR[a.tipo], padding: "2px 7px", borderRadius: 6, fontWeight: 700 }}>{TIPO_LABEL[a.tipo]}</span>
            <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text-1)" }}>{a.nome}</span>
          </div>
          <div style={{ fontSize: 11, color: "var(--text-3)", marginTop: 3 }}>
            {a.instituicao && <span>{a.instituicao} · </span>}
            {a.taxa_contratada && <span>{a.taxa_contratada}% {a.indexador ? INDEXADOR_LABEL[a.indexador] : ""} · </span>}
            {a.conta_corrente && <span style={{ color: "#1A4870" }}>CC: {a.conta_corrente} → </span>}
            {a.conta_aplicacao && <span style={{ color: "#0D9488" }}>{a.conta_aplicacao}</span>}
          </div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 10, color: "#666" }}>Aportado</div>
          <div style={{ fontSize: 13, fontWeight: 600 }}>{fmtBRL(a.valor_aportado)}</div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 10, color: "#666" }}>Valor Atual</div>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#1A4870" }}>{fmtBRL(a.valor_atual)}</div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 10, color: "#666" }}>Rendimento</div>
          <div style={{ fontSize: 13, fontWeight: 600, color: rentPct >= 0 ? "#16A34A" : "#E24B4A" }}>
            {fmtBRL(a.rendimentos_brutos)}<br />
            <span style={{ fontSize: 10 }}>{rentPct >= 0 ? "+" : ""}{rentPct.toFixed(2)}%</span>
          </div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 10, color: "#666" }}>Vencimento</div>
          <div style={{ fontSize: 12, color: "var(--text-1)" }}>{fmtData(a.data_vencimento)}</div>
        </div>
        <div style={{ display: "flex", gap: 6, justifyContent: "flex-end", alignItems: "center", flexWrap: "wrap" }}>
          <span style={{ fontSize: 10, background: isResgatada ? "#EEE" : "#DCFCE7", color: isResgatada ? "#666" : "#166534", padding: "2px 7px", borderRadius: 8, fontWeight: 600 }}>
            {isResgatada ? "Encerrada" : "Ativa"}
          </span>
          {!isResgatada && <>
            <button onClick={e => { e.stopPropagation(); abrirAporte(a); }} style={{ padding: "4px 9px", border: "0.5px solid #1A487050", borderRadius: 6, background: "#D5E8F5", cursor: "pointer", fontSize: 11, color: "#0B2D50", fontWeight: 600 }}>Aporte</button>
            <button onClick={e => { e.stopPropagation(); abrirRendimento(a); }} style={{ padding: "4px 9px", border: "0.5px solid #16A34A50", borderRadius: 6, background: "#DCFCE7", cursor: "pointer", fontSize: 11, color: "#166534", fontWeight: 600 }}>Rendimento</button>
            <button onClick={e => { e.stopPropagation(); abrirResgate(a); }} style={{ padding: "4px 9px", border: "0.5px solid #E24B4A50", borderRadius: 6, background: "#FCEBEB", cursor: "pointer", fontSize: 11, color: "#791F1F", fontWeight: 600 }}>Resgatar</button>
          </>}
          <button onClick={e => { e.stopPropagation(); abrirNova(a); }} style={{ padding: "4px 9px", border: "0.5px solid var(--border-table)", borderRadius: 6, background: "transparent", cursor: "pointer", fontSize: 11, color: "var(--text-2)" }}>Editar</button>
        </div>
      </div>

      {exp && (
        <div style={{ borderTop: "0.5px solid var(--bg-tag)", padding: "12px 18px", background: "var(--bg-card)" }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-2)", marginBottom: 8 }}>Histórico de Movimentações</div>
          {movimentos.length === 0 ? (
            <div style={{ fontSize: 12, color: "var(--text-muted)" }}>Sem movimentações registradas.</div>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead><tr style={{ background: "var(--bg-tag)" }}>
                {["Data", "Tipo", "Valor Bruto", "IOF", "IR", "Líquido", "Conta", "Obs."].map(h => (
                  <th key={h} style={{ padding: "6px 10px", textAlign: h === "Obs." || h === "Conta" || h === "Tipo" ? "left" : "right", color: "var(--text-2)", fontWeight: 600 }}>{h}</th>
                ))}
              </tr></thead>
              <tbody>
                {movimentos.map(m => (
                  <tr key={m.id} style={{ borderBottom: "0.5px solid var(--bg-tag)" }}>
                    <td style={{ padding: "6px 10px", textAlign: "right", whiteSpace: "nowrap" }}>{fmtData(m.data)}</td>
                    <td style={{ padding: "6px 10px" }}>
                      <span style={{ fontSize: 10, background: MOV_COR[m.tipo] + "18", color: MOV_COR[m.tipo], padding: "2px 7px", borderRadius: 6, fontWeight: 600 }}>{MOV_LABEL[m.tipo]}</span>
                    </td>
                    <td style={{ padding: "6px 10px", textAlign: "right", fontWeight: 600 }}>{fmtBRL(m.valor_bruto)}</td>
                    <td style={{ padding: "6px 10px", textAlign: "right", color: m.iof > 0 ? "#E24B4A" : "var(--text-3)" }}>{m.iof > 0 ? fmtBRL(m.iof) : "—"}</td>
                    <td style={{ padding: "6px 10px", textAlign: "right", color: m.ir > 0 ? "#E24B4A" : "var(--text-3)" }}>{m.ir > 0 ? fmtBRL(m.ir) : "—"}</td>
                    <td style={{ padding: "6px 10px", textAlign: "right", fontWeight: 700, color: m.tipo === "resgate_parcial" || m.tipo === "resgate_total" ? "#16A34A" : "var(--text-1)" }}>{fmtBRL(m.valor_liquido ?? m.valor_bruto)}</td>
                    <td style={{ padding: "6px 10px", color: "#1A4870", fontSize: 11 }}>{m.conta_destino ?? m.conta_origem ?? "—"}</td>
                    <td style={{ padding: "6px 10px", color: "#666" }}>{m.observacao ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}
