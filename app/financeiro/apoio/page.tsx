"use client";
import { useState, useEffect, useCallback } from "react";
import { createBrowserClient } from "@supabase/ssr";
import { useAuth } from "../../../components/AuthProvider";
import TopNav from "../../../components/TopNav";
import {
  listarPessoasDaConta,
  listarAnosSafra,
  listarTodosCiclos,
  listarOperacoesGerenciaisAtivas,
  listarContas,
} from "../../../lib/db";
import type { Pessoa, AnoSafra, Ciclo, OperacaoGerencial, ContaBancaria } from "../../../lib/supabase";

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface Lancamento {
  id: string;
  tipo: "pagar" | "receber";
  descricao: string;
  valor: number;
  data_vencimento: string;
  data_baixa: string | null;
  status: string;
  categoria: string | null;
  pessoa_id: string | null;
  observacao: string | null;
  moeda?: string;
}

interface ApoioBaixa {
  id: string;
  lancamento_id: string;
  data_baixa: string;
  observacao: string | null;
  conta_bancaria_id: string | null;
}

interface ApoioLancamento {
  id: string;
  fazenda_id: string;
  tipo: "pagar" | "receber";
  descricao: string;
  valor: number;
  data_vencimento: string;
  data_baixa: string | null;
  baixado: boolean;
  pessoa_nome: string | null;
  pessoa_id: string | null;
  categoria: string | null;
  observacao: string | null;
  ano_safra_id: string | null;
  ciclo_id: string | null;
  operacao_gerencial_id: string | null;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const fmtBRL = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const fmtData = (d: string) =>
  d ? new Date(d + "T12:00:00").toLocaleDateString("pt-BR") : "—";

function mesAtual() {
  const hoje = new Date();
  const y = hoje.getFullYear();
  const m = String(hoje.getMonth() + 1).padStart(2, "0");
  return { ini: `${y}-${m}-01`, fim: `${y}-${m}-31` };
}

function hoje() {
  return new Date().toISOString().slice(0, 10);
}

// ─── Estilos ─────────────────────────────────────────────────────────────────

const card: React.CSSProperties = {
  background: "#fff", border: "0.5px solid #DDE2EE", borderRadius: 12, padding: "20px 24px",
};

const th: React.CSSProperties = {
  padding: "9px 12px", textAlign: "left", fontSize: 11, fontWeight: 700,
  color: "#555", background: "#F4F6FA", borderBottom: "0.5px solid #DDE2EE",
  whiteSpace: "nowrap",
};

const td: React.CSSProperties = {
  padding: "9px 12px", fontSize: 13, color: "#1a1a1a", borderBottom: "0.5px solid #EEF0F5",
  verticalAlign: "middle",
};

const btn = (bg: string, color = "#fff"): React.CSSProperties => ({
  padding: "5px 12px", background: bg, color, border: "none",
  borderRadius: 6, fontWeight: 600, cursor: "pointer", fontSize: 12,
});

const inp: React.CSSProperties = {
  padding: "8px 10px", border: "0.5px solid #DDE2EE", borderRadius: 8,
  fontSize: 13, color: "#1a1a1a", background: "#fff", outline: "none",
  boxSizing: "border-box",
};

const lbl: React.CSSProperties = {
  fontSize: 11, color: "#555", fontWeight: 600, display: "block", marginBottom: 3,
};

// ─── Formulário vazio ─────────────────────────────────────────────────────────

const FORM_VAZIO = {
  tipo: "pagar" as "pagar" | "receber",
  descricao: "",
  valorMask: "",
  data_vencimento: "",
  pessoa_id: "",
  ano_safra_id: "",
  ciclo_id: "",
  operacao_gerencial_id: "",
  categoria: "",
  observacao: "",
};

// ─── Página ───────────────────────────────────────────────────────────────────

export default function ApoioFinanceiroPage() {
  const { fazendaId, fazendaIds, contaId, podeAcessarPlano } = useAuth();

  const { ini: iniPadrao, fim: fimPadrao } = mesAtual();
  const [dataIni, setDataIni] = useState(iniPadrao);
  const [dataFim, setDataFim] = useState(fimPadrao);

  // ── Dados principais ──────────────────────────────────────────────────────
  const [lancamentos, setLancamentos] = useState<Lancamento[]>([]);
  const [apoioBaixas, setApoioBaixas] = useState<ApoioBaixa[]>([]);
  const [apoioLancs, setApoioLancs] = useState<ApoioLancamento[]>([]);
  const [carregando, setCarregando] = useState(false);

  // ── Dados de referência ───────────────────────────────────────────────────
  const [pessoas, setPessoas] = useState<Pessoa[]>([]);
  const [anosSafra, setAnosSafra] = useState<AnoSafra[]>([]);
  const [todosCiclos, setTodosCiclos] = useState<Ciclo[]>([]);
  const [opGerenciais, setOpGerenciais] = useState<OperacaoGerencial[]>([]);
  const [contasBancarias, setContasBancarias] = useState<ContaBancaria[]>([]);

  // ── Abas ──────────────────────────────────────────────────────────────────
  const [aba, setAba] = useState<"compartilhado" | "exclusivo">("compartilhado");

  // ── Filtro compartilhado ──────────────────────────────────────────────────
  const [filtroTipo, setFiltroTipo] = useState<"" | "pagar" | "receber">("");
  const [filtroStatus, setFiltroStatus] = useState<"" | "aberto" | "baixado_apoio" | "baixado_oficial">("");

  // ── Modal novo lançamento ─────────────────────────────────────────────────
  const [modalAberto, setModalAberto] = useState(false);
  const [formApoio, setFormApoio] = useState(FORM_VAZIO);
  const [salvando, setSalvando] = useState(false);

  // ── Modal baixar (com conta bancária) ─────────────────────────────────────
  const [modalBaixar, setModalBaixar] = useState<Lancamento | null>(null);
  const [baixarForm, setBaixarForm] = useState({ data_baixa: hoje(), conta_bancaria_id: "", observacao: "" });
  const [salvandoBaixa, setSalvandoBaixa] = useState(false);

  // ── Feedback ──────────────────────────────────────────────────────────────
  const [acaoId, setAcaoId] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  // ── Seleção em lote (aba exclusivo) ───────────────────────────────────────
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());
  const [modalBaixaLote, setModalBaixaLote] = useState(false);
  const [baixaLoteData, setBaixaLoteData] = useState(hoje());
  const [salvandoLote, setSalvandoLote] = useState(false);

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );

  // ── Carregar dados de referência ──────────────────────────────────────────
  useEffect(() => {
    if (!fazendaId) return;
    Promise.all([
      listarPessoasDaConta(fazendaId).catch(() => [] as Pessoa[]),
      listarAnosSafra(fazendaId).catch(() => [] as AnoSafra[]),
      listarTodosCiclos(fazendaId).catch(() => [] as Ciclo[]),
      listarOperacoesGerenciaisAtivas(fazendaId).catch(() => [] as OperacaoGerencial[]),
      listarContas(fazendaId).catch(() => [] as ContaBancaria[]),
    ]).then(([p, a, c, o, cb]) => {
      setPessoas(p);
      setAnosSafra(a);
      setTodosCiclos(c);
      setOpGerenciais(o);
      setContasBancarias(cb);
    });
  }, [fazendaId]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Ciclos filtrados por ano safra ────────────────────────────────────────
  const ciclosFiltrados = formApoio.ano_safra_id
    ? todosCiclos.filter((c) => c.ano_safra_id === formApoio.ano_safra_id)
    : todosCiclos;

  // ── Carregar lançamentos ──────────────────────────────────────────────────
  const carregar = useCallback(async () => {
    if (!fazendaId) return;
    setCarregando(true);
    try {
      const { data: lancs } = await supabase
        .from("lancamentos")
        .select("id,tipo,descricao,valor,data_vencimento,data_baixa,status,categoria,pessoa_id,observacao,moeda")
        .in("fazenda_id", fazendaIds)
        .gte("data_vencimento", dataIni)
        .lte("data_vencimento", dataFim)
        .order("data_vencimento")
        .limit(10000);

      setLancamentos((lancs ?? []) as Lancamento[]);

      if (lancs && lancs.length > 0) {
        const ids = lancs.map((l) => l.id);
        const { data: baixas } = await supabase
          .from("apoio_baixas")
          .select("*")
          .in("lancamento_id", ids);
        setApoioBaixas((baixas ?? []) as ApoioBaixa[]);
      } else {
        setApoioBaixas([]);
      }

      const { data: apoio } = await supabase
        .from("apoio_lancamentos")
        .select("*")
        .in("fazenda_id", fazendaIds)
        .gte("data_vencimento", dataIni)
        .lte("data_vencimento", dataFim)
        .order("data_vencimento")
        .limit(10000);

      setApoioLancs((apoio ?? []) as ApoioLancamento[]);
    } finally {
      setCarregando(false);
    }
  }, [fazendaId, dataIni, dataFim]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { carregar(); }, [carregar]);

  // ── Status de cada lançamento no contexto Apoio ───────────────────────────
  const baixaApoioPorLancId = new Map(apoioBaixas.map((b) => [b.lancamento_id, b]));

  function statusApoio(l: Lancamento): "baixado_oficial" | "baixado_apoio" | "aberto" {
    if (l.status === "baixado" && !baixaApoioPorLancId.has(l.id)) return "baixado_oficial";
    if (baixaApoioPorLancId.has(l.id)) return "baixado_apoio";
    return "aberto";
  }

  // ── Abrir modal de baixar ─────────────────────────────────────────────────
  function abrirModalBaixar(l: Lancamento) {
    setModalBaixar(l);
    setBaixarForm({ data_baixa: hoje(), conta_bancaria_id: "", observacao: "" });
  }

  // ── Confirmar baixa com conta bancária ────────────────────────────────────
  async function confirmarBaixa() {
    if (!fazendaId || !modalBaixar) return;
    setSalvandoBaixa(true);
    const payload: Record<string, unknown> = {
      fazenda_id: fazendaId,
      lancamento_id: modalBaixar.id,
      data_baixa: baixarForm.data_baixa,
      observacao: baixarForm.observacao || null,
    };
    if (baixarForm.conta_bancaria_id) payload.conta_bancaria_id = baixarForm.conta_bancaria_id;

    const [{ error }] = await Promise.all([
      supabase.from("apoio_baixas").insert(payload),
      supabase.from("lancamentos").update({ status: "baixado", data_baixa: baixarForm.data_baixa }).eq("id", modalBaixar.id),
    ]);
    setSalvandoBaixa(false);
    if (!error) {
      setModalBaixar(null);
      await carregar();
    }
  }

  // ── Desfazer baixa Apoio (reverte lançamento para em_aberto) ─────────────
  async function desfazerBaixaApoio(l: Lancamento) {
    setAcaoId(l.id);
    const baixa = baixaApoioPorLancId.get(l.id);
    if (!baixa) { setAcaoId(null); return; }
    await Promise.all([
      supabase.from("apoio_baixas").delete().eq("id", baixa.id),
      supabase.from("lancamentos").update({ status: "em_aberto", data_baixa: null }).eq("id", l.id),
    ]);
    await carregar();
    setAcaoId(null);
  }

  // ── Reabrir baixa oficial (reverte para em_aberto sem tocar apoio_baixas) ─
  async function reabrirBaixaOficial(l: Lancamento) {
    if (!confirm(`Reabrir a baixa de "${l.descricao}"? O status voltará para Em Aberto.`)) return;
    setAcaoId(l.id);
    await supabase.from("lancamentos").update({ status: "em_aberto", data_baixa: null }).eq("id", l.id);
    await carregar();
    setAcaoId(null);
  }

  // ── Salvar novo lançamento exclusivo ──────────────────────────────────────
  async function salvarApoioLanc() {
    if (!fazendaId || !formApoio.descricao || !formApoio.data_vencimento) return;
    const valor = parseFloat(formApoio.valorMask.replace(/\./g, "").replace(",", ".")) || 0;
    setSalvando(true);

    const pessoaSelecionada = pessoas.find((p) => p.id === formApoio.pessoa_id);

    const { error } = await supabase.from("apoio_lancamentos").insert({
      fazenda_id:              fazendaId,
      tipo:                    formApoio.tipo,
      descricao:               formApoio.descricao,
      valor,
      data_vencimento:         formApoio.data_vencimento,
      pessoa_id:               formApoio.pessoa_id || null,
      pessoa_nome:             pessoaSelecionada?.nome || null,
      ano_safra_id:            formApoio.ano_safra_id || null,
      ciclo_id:                formApoio.ciclo_id || null,
      operacao_gerencial_id:   formApoio.operacao_gerencial_id || null,
      categoria:               formApoio.categoria || null,
      observacao:              formApoio.observacao || null,
    });
    setSalvando(false);
    if (!error) {
      setModalAberto(false);
      setFormApoio(FORM_VAZIO);
      await carregar();
    }
  }

  async function baixarApoioExclusivo(a: ApoioLancamento) {
    if (!fazendaId) return;
    setAcaoId(a.id);
    await supabase.from("apoio_lancamentos")
      .update({ baixado: true, data_baixa: hoje() }).eq("id", a.id);
    await carregar();
    setAcaoId(null);
  }

  async function desfazerBaixaExclusivo(a: ApoioLancamento) {
    setAcaoId(a.id);
    await supabase.from("apoio_lancamentos")
      .update({ baixado: false, data_baixa: null }).eq("id", a.id);
    await carregar();
    setAcaoId(null);
  }

  async function excluirApoioExclusivo(a: ApoioLancamento) {
    if (!confirm(`Excluir "${a.descricao}"?`)) return;
    setAcaoId(a.id);
    await supabase.from("apoio_lancamentos").delete().eq("id", a.id);
    await carregar();
    setAcaoId(null);
  }

  // ── Baixa em lote (exclusivo) — via API para bypassar RLS multi-fazenda ──
  async function baixarEmLote() {
    if (!selecionados.size || !baixaLoteData) return;
    setSalvandoLote(true);
    const ids = Array.from(selecionados);
    const resp = await fetch("/api/apoio-bulk", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "baixar", ids, data: { data_baixa: baixaLoteData }, conta_id: contaId }),
    });
    const json = await resp.json();
    setSalvandoLote(false);
    if (resp.ok) {
      setModalBaixaLote(false);
      setSelecionados(new Set());
      setMsg(`${json.ok} lançamento(s) baixado(s) com sucesso.`);
      setTimeout(() => setMsg(null), 4000);
      await carregar();
    } else {
      setMsg(`Erro: ${json.error}`);
    }
  }

  function toggleSelecionado(id: string) {
    setSelecionados((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function toggleSelecionarTodos() {
    const abertos = apoioLancs.filter((a) => !a.baixado).map((a) => a.id);
    if (abertos.every((id) => selecionados.has(id))) {
      setSelecionados(new Set());
    } else {
      setSelecionados(new Set(abertos));
    }
  }

  async function excluirEmLote() {
    if (!selecionados.size) return;
    if (!confirm(`Excluir ${selecionados.size} lançamento(s) permanentemente?`)) return;
    const ids = Array.from(selecionados);
    const resp = await fetch("/api/apoio-bulk", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "delete", ids, conta_id: contaId }),
    });
    const json = await resp.json();
    if (resp.ok) {
      setSelecionados(new Set());
      setMsg(`${json.ok} lançamento(s) excluído(s).`);
      setTimeout(() => setMsg(null), 4000);
      await carregar();
    } else {
      setMsg(`Erro: ${json.error}`);
    }
  }

  async function excluirTudo() {
    if (!confirm("Excluir TODOS os lançamentos do Apoio Financeiro desta conta?\n\nEsta ação remove todos os registros de todas as fazendas, independente do filtro de datas.")) return;
    if (!confirm("Confirmar exclusão total? Esta ação não pode ser desfeita.")) return;
    const resp = await fetch("/api/apoio-bulk", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "delete-all", conta_id: contaId, fazenda_ids: fazendaIds }),
    });
    const json = await resp.json();
    if (resp.ok) {
      setSelecionados(new Set());
      setApoioLancs([]);
      setMsg(`${json.ok} lançamento(s) excluído(s).`);
      setTimeout(() => setMsg(null), 5000);
    } else {
      setMsg(`Erro: ${json.error}`);
    }
  }

  // ── Excel export ──────────────────────────────────────────────────────────
  async function exportarExcel() {
    const XLSX = await import("xlsx");
    const wb = XLSX.utils.book_new();

    const rowsOficial = lancamentos.map((l) => {
      const sa = statusApoio(l);
      const ba = baixaApoioPorLancId.get(l.id);
      return {
        "Tipo":               l.tipo === "pagar" ? "Pagar" : "Receber",
        "Descrição":          l.descricao,
        "Categoria":          l.categoria ?? "",
        "Vencimento":         l.data_vencimento,
        "Valor":              l.valor,
        "Status Oficial":     l.status,
        "Status Apoio":       sa === "baixado_oficial" ? "Baixado (Oficial)" : sa === "baixado_apoio" ? "Baixado (Apoio)" : "Aberto",
        "Data Baixa Oficial": l.data_baixa ?? "",
        "Data Baixa Apoio":   ba?.data_baixa ?? "",
      };
    });
    const ws1 = XLSX.utils.json_to_sheet(rowsOficial);
    XLSX.utils.book_append_sheet(wb, ws1, "CP-CR Oficial");

    const rowsExclusivo = apoioLancs.map((a) => ({
      "Tipo":       a.tipo === "pagar" ? "Pagar" : "Receber",
      "Descrição":  a.descricao,
      "Pessoa":     a.pessoa_nome ?? "",
      "Categoria":  a.categoria ?? "",
      "Vencimento": a.data_vencimento,
      "Valor":      a.valor,
      "Status":     a.baixado ? "Baixado" : "Aberto",
      "Data Baixa": a.data_baixa ?? "",
      "Observação": a.observacao ?? "",
    }));
    const ws2 = XLSX.utils.json_to_sheet(rowsExclusivo.length ? rowsExclusivo : [{ "(vazio)": "" }]);
    XLSX.utils.book_append_sheet(wb, ws2, "Apoio Exclusivo");

    type EntradaFluxo = { data: string; descricao: string; origem: string; tipo: string; valor: number; pago: boolean; sinal: number };
    const entradas: EntradaFluxo[] = [
      ...lancamentos.map((l) => ({
        data: l.data_vencimento, descricao: l.descricao, origem: "Oficial",
        tipo: l.tipo === "pagar" ? "Pagar" : "Receber", valor: l.valor,
        pago: statusApoio(l) !== "aberto", sinal: l.tipo === "receber" ? 1 : -1,
      })),
      ...apoioLancs.map((a) => ({
        data: a.data_vencimento, descricao: a.descricao, origem: "Apoio",
        tipo: a.tipo === "pagar" ? "Pagar" : "Receber", valor: a.valor,
        pago: a.baixado, sinal: a.tipo === "receber" ? 1 : -1,
      })),
    ].sort((a, b) => a.data.localeCompare(b.data));

    let saldo = 0;
    const rowsFluxo = entradas.map((e) => {
      saldo += e.sinal * e.valor;
      return {
        "Data": e.data, "Origem": e.origem, "Tipo": e.tipo, "Descrição": e.descricao,
        "Pago?": e.pago ? "Sim" : "Não",
        "Crédito": e.sinal > 0 ? e.valor : "",
        "Débito": e.sinal < 0 ? e.valor : "",
        "Saldo Projetado": saldo,
      };
    });
    const ws3 = XLSX.utils.json_to_sheet(rowsFluxo.length ? rowsFluxo : [{ "(vazio)": "" }]);
    XLSX.utils.book_append_sheet(wb, ws3, "Fluxo Consolidado");

    XLSX.writeFile(wb, `Apoio_Financeiro_${dataIni}_${dataFim}_${hoje()}.xlsx`);
    setMsg("Excel exportado com sucesso.");
    setTimeout(() => setMsg(null), 3000);
  }

  // ── KPIs ──────────────────────────────────────────────────────────────────
  const totalCP  = lancamentos.filter((l) => l.tipo === "pagar").reduce((s, l) => s + l.valor, 0);
  const totalCR  = lancamentos.filter((l) => l.tipo === "receber").reduce((s, l) => s + l.valor, 0);
  const abertoCP = lancamentos.filter((l) => l.tipo === "pagar"   && statusApoio(l) === "aberto").reduce((s, l) => s + l.valor, 0);
  const abertoCR = lancamentos.filter((l) => l.tipo === "receber" && statusApoio(l) === "aberto").reduce((s, l) => s + l.valor, 0);
  const exclCP   = apoioLancs.filter((a) => a.tipo === "pagar").reduce((s, a) => s + a.valor, 0);
  const exclCR   = apoioLancs.filter((a) => a.tipo === "receber").reduce((s, a) => s + a.valor, 0);

  // ── Filtragem compartilhado ───────────────────────────────────────────────
  const lancsFiltrados = lancamentos.filter((l) => {
    if (filtroTipo && l.tipo !== filtroTipo) return false;
    if (filtroStatus) {
      const sa = statusApoio(l);
      if (filtroStatus !== sa) return false;
    }
    return true;
  });

  // ── Verificação de acesso ─────────────────────────────────────────────────
  if (!podeAcessarPlano("apoio_financeiro")) {
    return (
      <>
        <TopNav />
        <div style={{ padding: 48, textAlign: "center" }}>
          <p style={{ fontSize: 15, color: "#555" }}>
            O módulo <strong>Apoio Financeiro</strong> não está habilitado para esta conta.
          </p>
        </div>
      </>
    );
  }

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <>
      <TopNav />
      <div style={{ padding: "24px 28px", maxWidth: 1300, fontFamily: "system-ui, sans-serif" }}>

        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
          <div>
            <h1 style={{ fontSize: 20, fontWeight: 700, color: "#1a1a1a", margin: 0 }}>Apoio Financeiro</h1>
            <p style={{ fontSize: 13, color: "#888", margin: "3px 0 0" }}>
              Visão paralela do financeiro — não integrada ao LCDPR
            </p>
          </div>
          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <label style={{ ...lbl, margin: 0 }}>De</label>
              <input type="date" value={dataIni} onChange={(e) => setDataIni(e.target.value)} style={{ ...inp, width: 140 }} />
              <label style={{ ...lbl, margin: 0 }}>Até</label>
              <input type="date" value={dataFim} onChange={(e) => setDataFim(e.target.value)} style={{ ...inp, width: 140 }} />
            </div>
            <button onClick={carregar} style={btn("#1A4870")} disabled={carregando}>
              {carregando ? "…" : "Atualizar"}
            </button>
            <button onClick={exportarExcel} style={btn("#16A34A")}>
              ↓ Exportar Excel
            </button>
          </div>
        </div>

        {msg && (
          <div style={{ background: "#F0FDF4", border: "0.5px solid #16A34A", borderRadius: 8, padding: "10px 16px", marginBottom: 16, fontSize: 13, color: "#166534" }}>
            {msg}
          </div>
        )}

        {/* KPI cards */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12, marginBottom: 24 }}>
          {[
            { label: "CP Oficial (total)", valor: fmtBRL(totalCP), sub: `${fmtBRL(abertoCP)} em aberto`, cor: "#E24B4A" },
            { label: "CR Oficial (total)", valor: fmtBRL(totalCR), sub: `${fmtBRL(abertoCR)} em aberto`, cor: "#16A34A" },
            { label: "Apoio Exclusivo — Pagar", valor: fmtBRL(exclCP), sub: `${apoioLancs.filter(a => a.tipo === "pagar" && !a.baixado).length} em aberto`, cor: "#C9921B" },
            { label: "Apoio Exclusivo — Receber", valor: fmtBRL(exclCR), sub: `${apoioLancs.filter(a => a.tipo === "receber" && !a.baixado).length} em aberto`, cor: "#378ADD" },
          ].map((k) => (
            <div key={k.label} style={{ ...card, borderLeft: `3px solid ${k.cor}` }}>
              <div style={{ fontSize: 11, color: "#888", fontWeight: 600, marginBottom: 4 }}>{k.label}</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: k.cor }}>{k.valor}</div>
              <div style={{ fontSize: 11, color: "#888", marginTop: 2 }}>{k.sub}</div>
            </div>
          ))}
        </div>

        {/* Abas */}
        <div style={{ display: "flex", gap: 0, borderBottom: "0.5px solid #DDE2EE", marginBottom: 20 }}>
          {([
            { id: "compartilhado", label: `CP/CR Compartilhado (${lancamentos.length})` },
            { id: "exclusivo",     label: `Apoio Exclusivo (${apoioLancs.length})` },
          ] as const).map((t) => (
            <button
              key={t.id}
              onClick={() => setAba(t.id)}
              style={{
                padding: "10px 20px", border: "none", background: "transparent", cursor: "pointer",
                fontSize: 13, fontWeight: aba === t.id ? 700 : 400,
                color: aba === t.id ? "#1A4870" : "#666",
                borderBottom: aba === t.id ? "2.5px solid #1A4870" : "2.5px solid transparent",
              }}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* ── Aba: Compartilhado ──────────────────────────────────────────────── */}
        {aba === "compartilhado" && (
          <div>
            <div style={{ display: "flex", gap: 10, marginBottom: 14, flexWrap: "wrap" }}>
              <select value={filtroTipo} onChange={(e) => setFiltroTipo(e.target.value as typeof filtroTipo)} style={{ ...inp, width: 160 }}>
                <option value="">Todos os tipos</option>
                <option value="pagar">Contas a Pagar</option>
                <option value="receber">Contas a Receber</option>
              </select>
              <select value={filtroStatus} onChange={(e) => setFiltroStatus(e.target.value as typeof filtroStatus)} style={{ ...inp, width: 200 }}>
                <option value="">Todos os status</option>
                <option value="aberto">Aberto</option>
                <option value="baixado_apoio">Baixado (Apoio)</option>
                <option value="baixado_oficial">Baixado (Oficial)</option>
              </select>
              <span style={{ fontSize: 12, color: "#888", alignSelf: "center" }}>
                {lancsFiltrados.length} lançamento(s)
              </span>
            </div>

            <div style={{ ...card, padding: 0, overflow: "hidden" }}>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr>
                      {["Vencimento", "Tipo", "Descrição", "Categoria", "Valor", "Status Oficial", "Status Apoio", "Ação"].map((h) => (
                        <th key={h} style={th}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {lancsFiltrados.length === 0 && (
                      <tr>
                        <td colSpan={8} style={{ ...td, textAlign: "center", color: "#888", padding: 32 }}>
                          {carregando ? "Carregando…" : "Nenhum lançamento no período."}
                        </td>
                      </tr>
                    )}
                    {lancsFiltrados.map((l) => {
                      const sa = statusApoio(l);
                      const emAcao = acaoId === l.id;
                      const ba = baixaApoioPorLancId.get(l.id);
                      const contaNome = ba?.conta_bancaria_id
                        ? (contasBancarias.find((c) => c.id === ba.conta_bancaria_id)?.nome ?? "")
                        : "";
                      return (
                        <tr key={l.id} style={{ background: sa === "baixado_oficial" ? "#F9FFF9" : sa === "baixado_apoio" ? "#FFF8F0" : "#fff" }}>
                          <td style={td}>{fmtData(l.data_vencimento)}</td>
                          <td style={td}>
                            <span style={{
                              padding: "2px 8px", borderRadius: 4, fontSize: 11, fontWeight: 700,
                              background: l.tipo === "pagar" ? "#FEF2F2" : "#F0FDF4",
                              color: l.tipo === "pagar" ? "#E24B4A" : "#16A34A",
                            }}>
                              {l.tipo === "pagar" ? "Pagar" : "Receber"}
                            </span>
                          </td>
                          <td style={td}>{l.descricao}</td>
                          <td style={{ ...td, color: "#888" }}>{l.categoria ?? "—"}</td>
                          <td style={{ ...td, fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>
                            {fmtBRL(l.valor)}
                          </td>
                          <td style={td}>
                            <span style={{
                              padding: "2px 8px", borderRadius: 4, fontSize: 11, fontWeight: 700,
                              background: l.status === "baixado" ? "#F0FDF4" : "#FEF9EE",
                              color: l.status === "baixado" ? "#16A34A" : "#C9921B",
                            }}>
                              {l.status === "baixado" ? "Baixado" : "Aberto"}
                            </span>
                          </td>
                          <td style={td}>
                            {sa === "baixado_oficial" && (
                              <span style={{ fontSize: 11, color: "#16A34A", fontWeight: 600 }}>
                                ✓ Oficial{l.data_baixa ? ` ${fmtData(l.data_baixa)}` : ""}
                              </span>
                            )}
                            {sa === "baixado_apoio" && (
                              <div>
                                <div style={{ fontSize: 11, color: "#C9921B", fontWeight: 600 }}>
                                  ✓ Apoio{ba?.data_baixa ? ` ${fmtData(ba.data_baixa)}` : ""}
                                </div>
                                {contaNome && <div style={{ fontSize: 10, color: "#888" }}>{contaNome}</div>}
                              </div>
                            )}
                            {sa === "aberto" && (
                              <span style={{ fontSize: 11, color: "#888" }}>Aberto</span>
                            )}
                          </td>
                          <td style={td}>
                            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                              {sa === "aberto" && (
                                <button
                                  onClick={() => abrirModalBaixar(l)}
                                  disabled={emAcao}
                                  style={btn("#C9921B")}
                                >
                                  Baixar
                                </button>
                              )}
                              {sa === "baixado_apoio" && (
                                <button
                                  onClick={() => desfazerBaixaApoio(l)}
                                  disabled={emAcao}
                                  style={btn("#888")}
                                >
                                  {emAcao ? "…" : "Reabrir"}
                                </button>
                              )}
                              {sa === "baixado_oficial" && (
                                <button
                                  onClick={() => reabrirBaixaOficial(l)}
                                  disabled={emAcao}
                                  style={{ ...btn("#888"), fontSize: 11 }}
                                >
                                  {emAcao ? "…" : "Reabrir"}
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            <p style={{ fontSize: 11, color: "#aaa", marginTop: 12 }}>
              ℹ️ "Baixar" registra a quitação no contexto do Apoio Financeiro. "Reabrir" reverte a baixa.
            </p>
          </div>
        )}

        {/* ── Aba: Apoio Exclusivo ────────────────────────────────────────────── */}
        {aba === "exclusivo" && (
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14, flexWrap: "wrap", gap: 10 }}>
              {selecionados.size > 0 ? (
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ fontSize: 13, color: "#555", fontWeight: 600 }}>
                    {selecionados.size} selecionado(s)
                  </span>
                  <button
                    onClick={() => { setBaixaLoteData(hoje()); setModalBaixaLote(true); }}
                    style={btn("#C9921B")}
                  >
                    Baixar Selecionados
                  </button>
                  <button onClick={excluirEmLote} style={btn("#E24B4A")}>
                    Excluir Selecionados
                  </button>
                  <button onClick={() => setSelecionados(new Set())} style={{ ...btn("#F4F6FA", "#555"), border: "0.5px solid #DDE2EE" }}>
                    Limpar Seleção
                  </button>
                </div>
              ) : (
                <span style={{ fontSize: 12, color: "#aaa" }}>
                  Selecione lançamentos para baixa em lote
                </span>
              )}
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={excluirTudo} style={{ ...btn("#E24B4A"), background: "white", color: "#E24B4A", border: "0.5px solid #E24B4A" }}>
                  🗑 Excluir Tudo
                </button>
                <button onClick={() => { setFormApoio(FORM_VAZIO); setModalAberto(true); }} style={btn("#1A4870")}>
                  + Novo Lançamento
                </button>
              </div>
            </div>

            <div style={{ ...card, padding: 0, overflow: "hidden" }}>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr>
                      <th style={{ ...th, width: 36 }}>
                        <input
                          type="checkbox"
                          checked={apoioLancs.filter((a) => !a.baixado).length > 0 && apoioLancs.filter((a) => !a.baixado).every((a) => selecionados.has(a.id))}
                          onChange={toggleSelecionarTodos}
                          title="Selecionar todos em aberto"
                        />
                      </th>
                      {["Vencimento", "Tipo", "Descrição", "Pessoa/Fornecedor", "Categoria", "Valor", "Status", "Ações"].map((h) => (
                        <th key={h} style={th}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {apoioLancs.length === 0 && (
                      <tr>
                        <td colSpan={9} style={{ ...td, textAlign: "center", color: "#888", padding: 32 }}>
                          {carregando ? "Carregando…" : "Nenhum lançamento exclusivo cadastrado."}
                        </td>
                      </tr>
                    )}
                    {apoioLancs.map((a) => {
                      const emAcao = acaoId === a.id;
                      const selecionado = selecionados.has(a.id);
                      const pessoaNome = a.pessoa_id
                        ? (pessoas.find((p) => p.id === a.pessoa_id)?.nome ?? a.pessoa_nome ?? "—")
                        : (a.pessoa_nome ?? "—");
                      return (
                        <tr key={a.id} style={{ background: selecionado ? "#FFF8F0" : a.baixado ? "#F9FFF9" : "#fff" }}>
                          <td style={{ ...td, textAlign: "center" }}>
                            {!a.baixado && (
                              <input
                                type="checkbox"
                                checked={selecionado}
                                onChange={() => toggleSelecionado(a.id)}
                              />
                            )}
                          </td>
                          <td style={td}>{fmtData(a.data_vencimento)}</td>
                          <td style={td}>
                            <span style={{
                              padding: "2px 8px", borderRadius: 4, fontSize: 11, fontWeight: 700,
                              background: a.tipo === "pagar" ? "#FEF2F2" : "#F0FDF4",
                              color: a.tipo === "pagar" ? "#E24B4A" : "#16A34A",
                            }}>
                              {a.tipo === "pagar" ? "Pagar" : "Receber"}
                            </span>
                          </td>
                          <td style={td}>{a.descricao}</td>
                          <td style={{ ...td, color: "#555" }}>{pessoaNome}</td>
                          <td style={{ ...td, color: "#888" }}>{a.categoria ?? "—"}</td>
                          <td style={{ ...td, fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>
                            {fmtBRL(a.valor)}
                          </td>
                          <td style={td}>
                            {a.baixado ? (
                              <span style={{ fontSize: 11, fontWeight: 700, color: "#16A34A" }}>
                                ✓ Baixado{a.data_baixa ? ` ${fmtData(a.data_baixa)}` : ""}
                              </span>
                            ) : (
                              <span style={{ fontSize: 11, color: "#C9921B", fontWeight: 600 }}>Aberto</span>
                            )}
                          </td>
                          <td style={td}>
                            <div style={{ display: "flex", gap: 6 }}>
                              {!a.baixado ? (
                                <button onClick={() => baixarApoioExclusivo(a)} disabled={emAcao} style={btn("#C9921B")}>
                                  {emAcao ? "…" : "Baixar"}
                                </button>
                              ) : (
                                <button onClick={() => desfazerBaixaExclusivo(a)} disabled={emAcao} style={btn("#888")}>
                                  {emAcao ? "…" : "Reabrir"}
                                </button>
                              )}
                              <button onClick={() => excluirApoioExclusivo(a)} disabled={emAcao} style={btn("#E24B4A")}>
                                {emAcao ? "…" : "Excluir"}
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            <p style={{ fontSize: 11, color: "#aaa", marginTop: 12 }}>
              ℹ️ Lançamentos aqui são exclusivos do Apoio Financeiro. Não aparecem no sistema oficial nem no LCDPR.
            </p>
          </div>
        )}

        {/* ── Modal: Baixar com conta bancária ──────────────────────────────── */}
        {modalBaixar && (
          <div
            onClick={() => setModalBaixar(null)}
            style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.35)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center" }}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              style={{ ...card, width: 420, maxWidth: "95vw", boxShadow: "0 8px 32px rgba(0,0,0,0.15)" }}
            >
              <h3 style={{ margin: "0 0 4px", fontSize: 16, fontWeight: 700, color: "#1a1a1a" }}>
                Registrar Baixa — Apoio
              </h3>
              <p style={{ margin: "0 0 18px", fontSize: 12, color: "#888" }}>
                {modalBaixar.descricao} · {fmtBRL(modalBaixar.valor)}
              </p>

              <div style={{ display: "grid", gap: 14 }}>
                <div>
                  <label style={lbl}>Data da Baixa *</label>
                  <input
                    type="date"
                    value={baixarForm.data_baixa}
                    onChange={(e) => setBaixarForm({ ...baixarForm, data_baixa: e.target.value })}
                    style={{ ...inp, width: "100%" }}
                  />
                </div>
                <div>
                  <label style={lbl}>Conta Bancária</label>
                  <select
                    value={baixarForm.conta_bancaria_id}
                    onChange={(e) => setBaixarForm({ ...baixarForm, conta_bancaria_id: e.target.value })}
                    style={{ ...inp, width: "100%" }}
                  >
                    <option value="">— Selecione a conta —</option>
                    {contasBancarias.map((c) => (
                      <option key={c.id} value={c.id}>{c.nome} — {c.banco}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label style={lbl}>Observação</label>
                  <input
                    type="text"
                    placeholder="Opcional"
                    value={baixarForm.observacao}
                    onChange={(e) => setBaixarForm({ ...baixarForm, observacao: e.target.value })}
                    style={{ ...inp, width: "100%" }}
                  />
                </div>
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 20 }}>
                <button onClick={() => setModalBaixar(null)} style={{ ...btn("#F4F6FA", "#555"), border: "0.5px solid #DDE2EE" }}>
                  Cancelar
                </button>
                <button
                  onClick={confirmarBaixa}
                  disabled={salvandoBaixa || !baixarForm.data_baixa}
                  style={btn("#C9921B")}
                >
                  {salvandoBaixa ? "Salvando…" : "Confirmar Baixa"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── Modal: Baixa em Lote ──────────────────────────────────────────── */}
        {modalBaixaLote && (
          <div
            onClick={() => setModalBaixaLote(false)}
            style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.35)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center" }}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              style={{ ...card, width: 400, maxWidth: "95vw", boxShadow: "0 8px 32px rgba(0,0,0,0.15)" }}
            >
              <h3 style={{ margin: "0 0 4px", fontSize: 16, fontWeight: 700, color: "#1a1a1a" }}>
                Baixa em Lote
              </h3>
              <p style={{ margin: "0 0 18px", fontSize: 12, color: "#888" }}>
                {selecionados.size} lançamento(s) selecionado(s) serão marcados como baixados.
              </p>

              <div>
                <label style={lbl}>Data da Baixa *</label>
                <input
                  type="date"
                  value={baixaLoteData}
                  onChange={(e) => setBaixaLoteData(e.target.value)}
                  style={{ ...inp, width: "100%" }}
                />
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 20 }}>
                <button onClick={() => setModalBaixaLote(false)} style={{ ...btn("#F4F6FA", "#555"), border: "0.5px solid #DDE2EE" }}>
                  Cancelar
                </button>
                <button
                  onClick={baixarEmLote}
                  disabled={salvandoLote || !baixaLoteData}
                  style={btn("#C9921B")}
                >
                  {salvandoLote ? "Baixando…" : `Confirmar Baixa (${selecionados.size})`}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── Modal: Novo Lançamento Exclusivo ──────────────────────────────── */}
        {modalAberto && (
          <div
            onClick={() => setModalAberto(false)}
            style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.35)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center" }}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              style={{ ...card, width: 680, maxWidth: "95vw", maxHeight: "90vh", overflowY: "auto", boxShadow: "0 8px 32px rgba(0,0,0,0.15)" }}
            >
              <h3 style={{ margin: "0 0 18px", fontSize: 16, fontWeight: 700, color: "#1a1a1a" }}>
                Novo Lançamento — Apoio Exclusivo
              </h3>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                {/* Tipo */}
                <div>
                  <label style={lbl}>Tipo *</label>
                  <select
                    value={formApoio.tipo}
                    onChange={(e) => setFormApoio({ ...formApoio, tipo: e.target.value as "pagar" | "receber" })}
                    style={{ ...inp, width: "100%" }}
                  >
                    <option value="pagar">Contas a Pagar</option>
                    <option value="receber">Contas a Receber</option>
                  </select>
                </div>

                {/* Vencimento */}
                <div>
                  <label style={lbl}>Vencimento *</label>
                  <input
                    type="date"
                    value={formApoio.data_vencimento}
                    onChange={(e) => setFormApoio({ ...formApoio, data_vencimento: e.target.value })}
                    style={{ ...inp, width: "100%" }}
                  />
                </div>

                {/* Descrição */}
                <div style={{ gridColumn: "1 / -1" }}>
                  <label style={lbl}>Descrição *</label>
                  <input
                    type="text"
                    placeholder="Ex: Pagamento pessoal - aluguel"
                    value={formApoio.descricao}
                    onChange={(e) => setFormApoio({ ...formApoio, descricao: e.target.value })}
                    style={{ ...inp, width: "100%" }}
                  />
                </div>

                {/* Valor */}
                <div>
                  <label style={lbl}>Valor (R$)</label>
                  <input
                    type="text"
                    placeholder="0,00"
                    value={formApoio.valorMask}
                    onChange={(e) => setFormApoio({ ...formApoio, valorMask: e.target.value })}
                    style={{ ...inp, width: "100%" }}
                  />
                </div>

                {/* Pessoa / Fornecedor */}
                <div>
                  <label style={lbl}>Pessoa / Fornecedor</label>
                  <select
                    value={formApoio.pessoa_id}
                    onChange={(e) => setFormApoio({ ...formApoio, pessoa_id: e.target.value })}
                    style={{ ...inp, width: "100%" }}
                  >
                    <option value="">— Selecione —</option>
                    {pessoas.map((p) => (
                      <option key={p.id} value={p.id}>{p.nome}</option>
                    ))}
                  </select>
                </div>

                {/* Ano Safra */}
                <div>
                  <label style={lbl}>Ano Safra</label>
                  <select
                    value={formApoio.ano_safra_id}
                    onChange={(e) => setFormApoio({ ...formApoio, ano_safra_id: e.target.value, ciclo_id: "" })}
                    style={{ ...inp, width: "100%" }}
                  >
                    <option value="">— Selecione —</option>
                    {anosSafra.map((a) => (
                      <option key={a.id} value={a.id}>{a.descricao}</option>
                    ))}
                  </select>
                </div>

                {/* Ciclo */}
                <div>
                  <label style={lbl}>Ciclo</label>
                  <select
                    value={formApoio.ciclo_id}
                    onChange={(e) => setFormApoio({ ...formApoio, ciclo_id: e.target.value })}
                    style={{ ...inp, width: "100%" }}
                    disabled={!formApoio.ano_safra_id && todosCiclos.length === 0}
                  >
                    <option value="">— Selecione —</option>
                    {ciclosFiltrados.map((c) => (
                      <option key={c.id} value={c.id}>{c.descricao ?? c.cultura}</option>
                    ))}
                  </select>
                </div>

                {/* Operação Gerencial */}
                <div style={{ gridColumn: "1 / -1" }}>
                  <label style={lbl}>Operação Gerencial</label>
                  <select
                    value={formApoio.operacao_gerencial_id}
                    onChange={(e) => setFormApoio({ ...formApoio, operacao_gerencial_id: e.target.value })}
                    style={{ ...inp, width: "100%" }}
                  >
                    <option value="">— Selecione —</option>
                    {opGerenciais.map((o) => (
                      <option key={o.id} value={o.id}>{o.descricao}</option>
                    ))}
                  </select>
                </div>

                {/* Categoria */}
                <div>
                  <label style={lbl}>Categoria (livre)</label>
                  <input
                    type="text"
                    placeholder="Ex: Pessoal, Família…"
                    value={formApoio.categoria}
                    onChange={(e) => setFormApoio({ ...formApoio, categoria: e.target.value })}
                    style={{ ...inp, width: "100%" }}
                  />
                </div>

                {/* Observação */}
                <div>
                  <label style={lbl}>Observação</label>
                  <input
                    type="text"
                    value={formApoio.observacao}
                    onChange={(e) => setFormApoio({ ...formApoio, observacao: e.target.value })}
                    style={{ ...inp, width: "100%" }}
                  />
                </div>
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 20 }}>
                <button onClick={() => setModalAberto(false)} style={{ ...btn("#F4F6FA", "#555"), border: "0.5px solid #DDE2EE" }}>
                  Cancelar
                </button>
                <button
                  onClick={salvarApoioLanc}
                  disabled={salvando || !formApoio.descricao || !formApoio.data_vencimento}
                  style={btn("#1A4870")}
                >
                  {salvando ? "Salvando…" : "Salvar"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
