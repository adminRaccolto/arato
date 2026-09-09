"use client";
import { useState, useEffect, useCallback } from "react";
import { createBrowserClient } from "@supabase/ssr";
import { useAuth } from "../../../components/AuthProvider";
import TopNav from "../../../components/TopNav";
import type { Fazenda, Deposito, Insumo, TransferenciaEstoque, TransferenciaEstoqueItem } from "../../../lib/supabase";

// ─── Tipos locais ─────────────────────────────────────────────────────────────

interface TransferenciaComItens extends TransferenciaEstoque {
  itens?: TransferenciaEstoqueItem[];
  fazenda_origem_nome?: string;
  fazenda_destino_nome?: string;
  deposito_origem_nome?: string;
  deposito_destino_nome?: string;
}

interface ItemForm {
  insumo_id: string;
  quantidade: string;
  unidade_medida: string;
  custo_unitario: string;
  variedade: string;
  lote_semente: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const fmtBRL = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fmtData = (d: string) => new Date(d + "T12:00:00").toLocaleDateString("pt-BR");
const hoje = () => new Date().toISOString().slice(0, 10);

// CFOPs comuns para transferência de insumos (sufixo = últimos 3 dígitos)
const CFOP_OPCOES: { sufixo: string; label: string }[] = [
  { sufixo: "152", label: "5152/6152 — Mercadoria adquirida de terceiros (sem ST)" },
  { sufixo: "151", label: "5151/6151 — Produção do próprio estabelecimento (sem ST)" },
  { sufixo: "409", label: "5409/6409 — Produção própria com substituição tributária (ST)" },
  { sufixo: "410", label: "5410/6410 — Mercadoria de terceiros com substituição tributária (ST)" },
  { sufixo: "949", label: "5949/6949 — Outra saída de mercadoria" },
];

function prefixoCfop(estadoOrigem?: string, estadoDestino?: string): "5" | "6" {
  if (!estadoOrigem || !estadoDestino) return "5";
  return estadoOrigem === estadoDestino ? "5" : "6";
}

// ─── Estilos ─────────────────────────────────────────────────────────────────

const card: React.CSSProperties = {
  background: "#fff", border: "0.5px solid #DDE2EE", borderRadius: 12, padding: "20px 24px",
};

const th: React.CSSProperties = {
  padding: "9px 12px", textAlign: "left", fontSize: 11, fontWeight: 700,
  color: "#555", background: "#F4F6FA", borderBottom: "0.5px solid #DDE2EE", whiteSpace: "nowrap",
};

const td: React.CSSProperties = {
  padding: "9px 12px", fontSize: 13, color: "#1a1a1a", borderBottom: "0.5px solid #EEF0F5", verticalAlign: "middle",
};

const btn = (bg: string, color = "#fff"): React.CSSProperties => ({
  padding: "7px 16px", background: bg, color, border: "none", borderRadius: 7,
  fontWeight: 600, cursor: "pointer", fontSize: 12, whiteSpace: "nowrap",
});

const inp: React.CSSProperties = {
  width: "100%", padding: "8px 10px", border: "0.5px solid #DDE2EE", borderRadius: 8,
  fontSize: 13, color: "#1a1a1a", background: "#fff", outline: "none", boxSizing: "border-box",
};

const lbl: React.CSSProperties = {
  fontSize: 11, color: "#555", fontWeight: 600, display: "block", marginBottom: 4,
};

const STATUS_LABEL: Record<string, { txt: string; bg: string; cor: string }> = {
  solicitada:          { txt: "Solicitada (App)",  bg: "#FBF3E0", cor: "#C9921B" },
  rascunho:            { txt: "Rascunho",           bg: "#F4F6FA", cor: "#555"    },
  emitida:             { txt: "NF Emitida",         bg: "#F2F2F2", cor: "#111111" },
  entrada_confirmada:  { txt: "Entrada Confirmada", bg: "#F0FDF4", cor: "#16A34A" },
  cancelada:           { txt: "Cancelada",          bg: "#FFF1F1", cor: "#E24B4A" },
};

// ─── Componente ───────────────────────────────────────────────────────────────

export default function TransferenciasEstoquePage() {
  const { fazendaId, contaId } = useAuth();

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );

  // ── Dados ─────────────────────────────────────────────────────────────────
  const [transferencias, setTransferencias] = useState<TransferenciaComItens[]>([]);
  const [todasFazendas, setTodasFazendas] = useState<Fazenda[]>([]);
  const [depositosPorFazenda, setDepositosPorFazenda] = useState<Record<string, Deposito[]>>({});
  const [insumosPorFazenda, setInsumosPorFazenda] = useState<Record<string, Insumo[]>>({});
  const [carregando, setCarregando] = useState(false);

  // ── Abas ──────────────────────────────────────────────────────────────────
  const [aba, setAba] = useState<"lista" | "solicitacoes">("lista");

  // ── Modal emissão ─────────────────────────────────────────────────────────
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState({
    fazendaOrigemId: fazendaId ?? "",
    depositoOrigemId: "",
    fazendaDestinoId: "",
    depositoDestinoId: "",
    dataTransferencia: hoje(),
    cfopSufixo: "152",
    entradaAutomatica: true,
    observacao: "",
  });
  const [itens, setItens] = useState<ItemForm[]>([
    { insumo_id: "", quantidade: "", unidade_medida: "kg", custo_unitario: "", variedade: "", lote_semente: "" },
  ]);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  // ── Detalhe / Preview DANFE ───────────────────────────────────────────────
  const [detalhe, setDetalhe] = useState<TransferenciaComItens | null>(null);
  const [acaoId, setAcaoId] = useState<string | null>(null);
  const [editandoId, setEditandoId] = useState<string | null>(null);
  // Textos complementares da config fiscal (carregados ao abrir preview)
  const [infCplBase, setInfCplBase] = useState<string>("");
  const [infCplTransf, setInfCplTransf] = useState<string>("");


  // ── Helper API route (service_role_key) ─────────────────────────────────
  async function acao(
    tipo: string,
    id?: string,
    transferencia?: Record<string, unknown>,
    itensList?: Array<Record<string, unknown>>,
  ): Promise<{ ok: boolean; error?: string; [k: string]: unknown }> {
    const res = await fetch("/api/campo/transferencia-acao", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ acao: tipo, transferencia_id: id, transferencia, itens: itensList }),
    });
    return res.json();
  }

  // ── Carregar dados ────────────────────────────────────────────────────────
  const carregar = useCallback(async () => {
    if (!fazendaId) return;
    setCarregando(true);
    try {
      // Todas as fazendas da conta para seleção
      const res = await fetch("/api/fazenda/da-conta", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fazenda_id: fazendaId, conta_id: contaId }),
      });
      const json = await res.json() as { ok: boolean; fazendas?: Fazenda[] };
      const fazendas = json.fazendas ?? [];
      setTodasFazendas(fazendas);

      // Depósitos de todas as fazendas
      const depMap: Record<string, Deposito[]> = {};
      await Promise.all(fazendas.map(async (f) => {
        const { data } = await supabase.from("depositos").select("*").eq("fazenda_id", f.id).order("nome");
        depMap[f.id] = (data ?? []) as Deposito[];
      }));
      setDepositosPorFazenda(depMap);

      // Insumos de todas as fazendas
      const insMap: Record<string, Insumo[]> = {};
      await Promise.all(fazendas.map(async (f) => {
        const { data } = await supabase
          .from("insumos").select("id,nome,unidade,estoque,categoria,deposito_id,custo_medio")
          .eq("fazenda_id", f.id).order("nome");
        insMap[f.id] = (data ?? []) as Insumo[];
      }));
      setInsumosPorFazenda(insMap);

      // Transferências via API route (service_role_key, sem RLS)
      const fazIds = fazendas.map(f => f.id);
      const trRes = await fetch("/api/campo/transferencias-lista", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fazenda_ids: fazIds }),
      });
      const trJson = await trRes.json() as { ok: boolean; data?: Record<string, unknown>[] };
      const transfs = trJson.data ?? [];

      const fazMap = Object.fromEntries(fazendas.map(f => [f.id, f.nome]));
      const enriched: TransferenciaComItens[] = transfs.map((t: Record<string, unknown>) => ({
        ...t as unknown as TransferenciaEstoque,
        itens: (t.transferencias_estoque_itens as TransferenciaEstoqueItem[]) ?? [],
        fazenda_origem_nome:  fazMap[t.fazenda_origem_id as string] ?? "—",
        fazenda_destino_nome: fazMap[t.fazenda_destino_id as string] ?? "—",
        deposito_origem_nome: depMap[t.fazenda_origem_id as string]?.find(d => d.id === t.deposito_origem_id)?.nome ?? "—",
        deposito_destino_nome: depMap[t.fazenda_destino_id as string]?.find(d => d.id === t.deposito_destino_id)?.nome ?? "—",
      }));
      setTransferencias(enriched);
    } finally {
      setCarregando(false);
    }
  }, [fazendaId, contaId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { carregar(); }, [carregar]);
  useEffect(() => {
    if (fazendaId) setForm(f => ({ ...f, fazendaOrigemId: fazendaId }));
  }, [fazendaId]);


  // ── Computed ──────────────────────────────────────────────────────────────
  const fazendaOrigem = todasFazendas.find(f => f.id === form.fazendaOrigemId);
  const fazendaDestino = todasFazendas.find(f => f.id === form.fazendaDestinoId);
  const depositosOrigem = depositosPorFazenda[form.fazendaOrigemId] ?? [];
  const depositosDestino = depositosPorFazenda[form.fazendaDestinoId] ?? [];
  // Todos os insumos da conta (todas as fazendas) para lookup de nome e unidade
  const todosInsumos = Object.values(insumosPorFazenda).flat();
  const insumosOrigem = form.fazendaOrigemId ? (insumosPorFazenda[form.fazendaOrigemId] ?? []) : todosInsumos;
  const prefixo = prefixoCfop(fazendaOrigem?.estado, fazendaDestino?.estado);
  const cfopCalculado = prefixo + form.cfopSufixo;
  const estadosDiferentes = fazendaOrigem?.estado !== fazendaDestino?.estado && !!fazendaOrigem && !!fazendaDestino;

  const solicitacoes = transferencias.filter(t => t.status === "solicitada");
  const historico = transferencias.filter(t => t.status !== "solicitada");

  // ── Itens form helpers ─────────────────────────────────────────────────────
  function addItem() {
    setItens(prev => [...prev, { insumo_id: "", quantidade: "", unidade_medida: "kg", custo_unitario: "", variedade: "", lote_semente: "" }]);
  }
  function removeItem(i: number) {
    setItens(prev => prev.filter((_, idx) => idx !== i));
  }
  function updateItem(i: number, field: keyof ItemForm, value: string) {
    setItens(prev => prev.map((it, idx) => {
      if (idx !== i) return it;
      const updated = { ...it, [field]: value };
      // Auto-fill unidade do insumo selecionado
      if (field === "insumo_id" && value) {
        const ins = todosInsumos.find(x => x.id === value);
        if (ins) updated.unidade_medida = ins.unidade ?? "kg";
      }
      return updated;
    }));
  }

  // ── Salvar transferência ──────────────────────────────────────────────────
  async function salvar(status: "rascunho" | "emitida") {
    if (!form.fazendaOrigemId || !form.fazendaDestinoId) {
      setErro("Selecione origem e destino."); return;
    }
    if (itens.some(it => !it.insumo_id || !it.quantidade)) {
      setErro("Preencha todos os itens."); return;
    }
    if (form.fazendaOrigemId === form.fazendaDestinoId && form.depositoOrigemId === form.depositoDestinoId) {
      setErro("Origem e destino não podem ser iguais."); return;
    }
    setSalvando(true); setErro(null);
    try {
      const itensParsed = itens.map(it => ({
        insumo_id:      it.insumo_id,
        quantidade:     parseFloat(it.quantidade.replace(",", ".")),
        unidade_medida: it.unidade_medida,
        custo_unitario: it.custo_unitario ? parseFloat(it.custo_unitario.replace(",", ".")) : null,
        variedade:      it.variedade || null,
        lote_semente:   it.lote_semente || null,
      }));
      const payload = {
        fazenda_origem_id:    form.fazendaOrigemId,
        deposito_origem_id:   form.depositoOrigemId || null,
        fazenda_destino_id:   form.fazendaDestinoId,
        deposito_destino_id:  form.depositoDestinoId || null,
        cfop:                 cfopCalculado,
        ie_diferentes:        estadosDiferentes,
        entrada_automatica:   form.entradaAutomatica,
        status,
        data_transferencia:   form.dataTransferencia,
        data_emissao:         status === "emitida" ? new Date().toISOString() : null,
        observacao:           form.observacao || null,
        via_app:              false,
      };
      const res = editandoId
        ? await acao("atualizar", editandoId, payload, itensParsed)
        : await acao("salvar", undefined, { ...payload, numero: `TRF-${Date.now().toString().slice(-6)}` }, itensParsed);
      if (!res.ok) throw new Error(res.error ?? "Erro ao salvar");
      setModal(false);
      resetForm();
      await carregar();
    } catch (e) {
      setErro(String(e));
    } finally {
      setSalvando(false);
    }
  }

  async function confirmarEntrada(t: TransferenciaComItens) {
    setAcaoId(t.id);
    try {
      const res = await acao("confirmar_entrada", t.id);
      if (!res.ok) alert(res.error ?? "Erro ao confirmar entrada");
      else await carregar();
    } finally { setAcaoId(null); }
  }

  async function emitirSolicitacao(t: TransferenciaComItens) {
    setAcaoId(t.id);
    try {
      const res = await acao("emitir", t.id);
      if (!res.ok) alert(res.error ?? "Erro ao emitir NF");
      else await carregar();
    } finally { setAcaoId(null); }
  }

  async function cancelar(id: string) {
    if (!confirm("Cancelar esta transferência?")) return;
    setAcaoId(id);
    try {
      const res = await acao("cancelar", id);
      if (!res.ok) alert(res.error ?? "Erro ao cancelar");
      else await carregar();
    } finally { setAcaoId(null); }
  }

  function resetForm() {
    setForm({ fazendaOrigemId: fazendaId ?? "", depositoOrigemId: "", fazendaDestinoId: "", depositoDestinoId: "", dataTransferencia: hoje(), cfopSufixo: "152", entradaAutomatica: true, observacao: "" });
    setItens([{ insumo_id: "", quantidade: "", unidade_medida: "kg", custo_unitario: "", variedade: "", lote_semente: "" }]);
    setErro(null);
    setEditandoId(null);
  }

  async function abrirDetalhe(t: TransferenciaComItens) {
    setDetalhe(t);
    // Carrega textos complementares da config fiscal do emitente (fazenda origem)
    try {
      const { data } = await supabase
        .from("configuracoes_modulo")
        .select("config")
        .eq("fazenda_id", t.fazenda_origem_id ?? fazendaId)
        .like("modulo", "produtor_%")
        .limit(1)
        .single();
      if (data?.config) {
        const cfg = data.config as Record<string, string>;
        const partes: string[] = [];
        if (cfg.inf_cpl_padrao) partes.push(cfg.inf_cpl_padrao.trim());
        if (cfg.inf_cpl_cnd)    partes.push(cfg.inf_cpl_cnd.trim());
        if (cfg.icms_diferido_ativo === "true") partes.push(cfg.inf_cpl_icms_diferido || "ICMS diferido conforme art. 572 do RICMS/MT.");
        if (cfg.inf_cpl_base_reduzida) partes.push(cfg.inf_cpl_base_reduzida.trim());
        if (cfg.funrural_retido === "true") partes.push(cfg.inf_cpl_funrural || "Funrural retido na fonte pelo adquirente.");
        setInfCplBase(partes.filter(Boolean).join(" "));
        setInfCplTransf(cfg.inf_cpl_transferencia ?? "");
      }
    } catch { /* sem config fiscal — tudo bem */ }
  }

  function abrirEditar(t: TransferenciaComItens) {
    const cfopSufixo = t.cfop ? t.cfop.replace(/^[56]/, "") : "152";
    setForm({
      fazendaOrigemId:   t.fazenda_origem_id ?? "",
      depositoOrigemId:  t.deposito_origem_id ?? "",
      fazendaDestinoId:  t.fazenda_destino_id ?? "",
      depositoDestinoId: t.deposito_destino_id ?? "",
      dataTransferencia: t.data_transferencia ? t.data_transferencia.slice(0, 10) : hoje(),
      cfopSufixo,
      entradaAutomatica: t.entrada_automatica ?? true,
      observacao:        t.observacao ?? "",
    });
    setItens(
      (t.itens ?? []).length > 0
        ? (t.itens ?? []).map(i => ({
            insumo_id:      i.insumo_id,
            quantidade:     String(i.quantidade),
            unidade_medida: i.unidade_medida ?? "kg",
            custo_unitario: i.custo_unitario != null ? String(i.custo_unitario) : "",
            variedade:      i.variedade ?? "",
            lote_semente:   i.lote_semente ?? "",
          }))
        : [{ insumo_id: "", quantidade: "", unidade_medida: "kg", custo_unitario: "", variedade: "", lote_semente: "" }]
    );
    setEditandoId(t.id);
    setErro(null);
    setModal(true);
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <>
    <TopNav />
    <div style={{ padding: "24px 28px", width: "100%", boxSizing: "border-box", fontFamily: "system-ui, sans-serif" }}>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: "#1a1a1a", margin: 0 }}>Transferência entre Fazendas</h1>
          <p style={{ fontSize: 13, color: "#888", margin: "3px 0 0" }}>NF de transferência de insumos · CFOP 5409 / 6409</p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={() => carregar()} style={btn("#F4F6FA", "#555")} title="Atualizar lista">
            🔄 Atualizar
          </button>
          <button onClick={() => { resetForm(); setModal(true); }} style={btn("#111111")}>
            + Nova Transferência
          </button>
        </div>
      </div>

      {/* KPI */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12, marginBottom: 22 }}>
        {[
          { label: "Aguardando Emissão",      val: historico.filter(t => t.status === "rascunho").length,            cor: historico.filter(t => t.status === "rascunho").length > 0 ? "#C9921B" : "#888" },
          { label: "Solicitações App Campo",  val: solicitacoes.length,                                              cor: solicitacoes.length > 0 ? "#C9921B" : "#888" },
          { label: "NFs Emitidas",            val: historico.filter(t => t.status === "emitida").length,             cor: "#111111" },
          { label: "Entradas Confirmadas",    val: historico.filter(t => t.status === "entrada_confirmada").length,  cor: "#16A34A" },
        ].map(k => (
          <div key={k.label} style={{ ...card, borderLeft: `3px solid ${k.cor}`, padding: "14px 18px" }}>
            <div style={{ fontSize: 11, color: "#888", fontWeight: 600, marginBottom: 4 }}>{k.label}</div>
            <div style={{ fontSize: 24, fontWeight: 700, color: k.cor }}>{k.val}</div>
          </div>
        ))}
      </div>

      {/* Abas */}
      <div style={{ display: "flex", borderBottom: "0.5px solid #DDE2EE", marginBottom: 20 }}>
        {([
          { id: "solicitacoes", label: `Solicitações App Campo${solicitacoes.length > 0 ? ` (${solicitacoes.length})` : ""}` },
          { id: "lista",        label: `Transferências (${historico.length})` },
        ] as const).map(t => (
          <button key={t.id} onClick={() => setAba(t.id)} style={{
            padding: "10px 20px", border: "none", background: "transparent", cursor: "pointer",
            fontSize: 13, fontWeight: aba === t.id ? 700 : 400,
            color: aba === t.id ? "#111111" : "#666",
            borderBottom: aba === t.id ? "2.5px solid #111111" : "2.5px solid transparent",
          }}>
            {t.label}
            {t.id === "solicitacoes" && solicitacoes.length > 0 && (
              <span style={{ marginLeft: 6, padding: "1px 6px", background: "#C9921B", color: "#fff", borderRadius: 10, fontSize: 10, fontWeight: 700 }}>
                {solicitacoes.length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ── Aba Solicitações ──────────────────────────────────────────────── */}
      {aba === "solicitacoes" && (
        <div style={{ ...card, padding: 0, overflow: "hidden" }}>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  {["Data","Solicitante","Urgência","Origem","Destino","Itens","Depósito Origem","Depósito Destino","Ações"].map(h => (
                    <th key={h} style={th}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {solicitacoes.length === 0 && (
                  <tr><td colSpan={9} style={{ ...td, textAlign: "center", color: "#888", padding: 40 }}>
                    {carregando ? "Carregando…" : "Nenhuma solicitação pendente do app campo."}
                  </td></tr>
                )}
                {solicitacoes.map(t => (
                  <tr key={t.id} style={{ background: t.urgencia === "urgente" ? "#FFFBEB" : "#fff" }}>
                    <td style={td}>{fmtData(t.data_transferencia)}</td>
                    <td style={td}>{t.solicitante_nome ?? "—"}</td>
                    <td style={td}>
                      <span style={{
                        padding: "2px 8px", borderRadius: 4, fontSize: 11, fontWeight: 700,
                        background: t.urgencia === "urgente" ? "#FEF2F2" : "#F0FDF4",
                        color: t.urgencia === "urgente" ? "#E24B4A" : "#16A34A",
                      }}>
                        {t.urgencia === "urgente" ? "🔴 Urgente" : "🟢 Programado"}
                      </span>
                    </td>
                    <td style={td}><strong>{t.fazenda_origem_nome}</strong></td>
                    <td style={td}><strong>{t.fazenda_destino_nome}</strong></td>
                    <td style={{ ...td, textAlign: "center" }}>{t.itens?.length ?? 0}</td>
                    <td style={{ ...td, color: "#666", fontSize: 12 }}>{t.deposito_origem_nome}</td>
                    <td style={{ ...td, color: "#666", fontSize: 12 }}>{t.deposito_destino_nome}</td>
                    <td style={td}>
                      <div style={{ display: "flex", gap: 6 }}>
                        <button onClick={() => abrirDetalhe(t)} style={btn("#F4F6FA", "#555")}>Ver</button>
                        <button
                          onClick={() => emitirSolicitacao(t)}
                          disabled={acaoId === t.id}
                          style={btn("#111111")}
                        >
                          {acaoId === t.id ? "…" : "Emitir NF"}
                        </button>
                        <button onClick={() => cancelar(t.id)} disabled={acaoId === t.id} style={btn("#E24B4A")}>
                          Cancelar
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Aba Lista ─────────────────────────────────────────────────────── */}
      {aba === "lista" && (
        <div style={{ ...card, padding: 0, overflow: "hidden" }}>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  {["Nº","Data","Origem","Destino","CFOP","Status","Itens","NF Número","Ações"].map(h => (
                    <th key={h} style={th}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {historico.length === 0 && (
                  <tr><td colSpan={9} style={{ ...td, textAlign: "center", color: "#888", padding: 40 }}>
                    {carregando ? "Carregando…" : "Nenhuma transferência registrada."}
                  </td></tr>
                )}
                {historico.map(t => {
                  const st = STATUS_LABEL[t.status] ?? STATUS_LABEL.rascunho;
                  return (
                    <tr key={t.id}>
                      <td style={{ ...td, fontFamily: "monospace", fontSize: 12, color: "#888" }}>{t.numero ?? "—"}</td>
                      <td style={td}>{fmtData(t.data_transferencia)}</td>
                      <td style={td}>
                        <div style={{ fontWeight: 600 }}>{t.fazenda_origem_nome}</div>
                        <div style={{ fontSize: 11, color: "#888" }}>{t.deposito_origem_nome !== "—" ? t.deposito_origem_nome : ""}</div>
                      </td>
                      <td style={td}>
                        <div style={{ fontWeight: 600 }}>{t.fazenda_destino_nome}</div>
                        <div style={{ fontSize: 11, color: "#888" }}>{t.deposito_destino_nome !== "—" ? t.deposito_destino_nome : ""}</div>
                      </td>
                      <td style={{ ...td, fontFamily: "monospace", fontSize: 12 }}>{t.cfop}</td>
                      <td style={td}>
                        <span style={{ padding: "3px 8px", borderRadius: 5, fontSize: 11, fontWeight: 700, background: st.bg, color: st.cor }}>
                          {st.txt}
                        </span>
                        {t.ie_diferentes && (
                          <div style={{ fontSize: 10, color: "#C9921B", marginTop: 3 }}>⚠ IEs distintas</div>
                        )}
                      </td>
                      <td style={{ ...td, textAlign: "center" }}>{t.itens?.length ?? 0}</td>
                      <td style={{ ...td, fontFamily: "monospace", fontSize: 12, color: "#666" }}>
                        {t.nf_numero ?? "—"}
                      </td>
                      <td style={td}>
                        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                          <button onClick={() => abrirDetalhe(t)} style={btn("#F4F6FA", "#555")}>
                            {t.status === "emitida" || t.status === "entrada_confirmada" ? "Visualizar NF" : "Visualizar"}
                          </button>
                          {t.status === "rascunho" && (
                            <button onClick={() => abrirEditar(t)} style={btn("#1A4870")}>
                              Editar
                            </button>
                          )}
                          {t.status === "rascunho" && (
                            <button onClick={() => emitirSolicitacao(t)} disabled={acaoId === t.id} style={btn("#111111")}>
                              {acaoId === t.id ? "…" : "Emitir NF"}
                            </button>
                          )}
                          {t.nf_chave && (
                            <a
                              href={`/api/fiscal/danfe?chave=${t.nf_chave}&fazenda_id=${t.fazenda_origem_id}`}
                              target="_blank"
                              rel="noreferrer"
                              style={{ ...btn("#378ADD"), textDecoration: "none", display: "inline-flex", alignItems: "center" }}
                            >
                              DANFE
                            </a>
                          )}
                          {t.status === "emitida" && !t.entrada_automatica && (
                            <button onClick={() => confirmarEntrada(t)} disabled={acaoId === t.id} style={btn("#16A34A")}>
                              {acaoId === t.id ? "…" : "Confirmar Entrada"}
                            </button>
                          )}
                          {(t.status === "rascunho" || t.status === "emitida") && (
                            <button onClick={() => cancelar(t.id)} disabled={acaoId === t.id} style={btn("#E24B4A")}>
                              Cancelar
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
      )}

      {/* ── Modal Nova Transferência ─────────────────────────────────────── */}
      {modal && (
        <div onClick={() => setModal(false)} style={{
          position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 1000,
          display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "20px 12px", overflowY: "auto",
        }}>
          <div onClick={e => e.stopPropagation()} style={{
            ...card, width: 860, maxWidth: "98vw", boxShadow: "0 12px 40px rgba(0,0,0,0.18)",
          }}>
            <h3 style={{ margin: "0 0 20px", fontSize: 16, fontWeight: 700 }}>
              {editandoId ? "Editar Transferência de Insumos" : "Nova Transferência de Insumos"}
            </h3>

            {/* Alertas */}
            {estadosDiferentes && (
              <div style={{ background: "#FBF3E0", border: "0.5px solid #C9921B", borderRadius: 8, padding: "10px 14px", marginBottom: 16, fontSize: 12, color: "#7A5A12" }}>
                ⚠️ <strong>IEs distintas (estados diferentes):</strong> CFOP {cfopCalculado} será usado.
                Se os estabelecimentos tiverem IEs distintas, pode ser necessário emitir uma NF de entrada no destino.
                A opção "Entrada Automática" lança o crédito no estoque destino sem NF de entrada formal.
              </div>
            )}

            {/* Origem / Destino */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
              {/* Origem */}
              <div style={{ border: "0.5px solid #DDE2EE", borderRadius: 10, padding: "14px 16px" }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: "#111111", marginBottom: 12, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                  Origem
                </div>
                <div style={{ marginBottom: 10 }}>
                  <label style={lbl}>Fazenda Origem *</label>
                  <select value={form.fazendaOrigemId} onChange={e => setForm(f => ({ ...f, fazendaOrigemId: e.target.value, depositoOrigemId: "" }))} style={inp}>
                    <option value="">— Selecione —</option>
                    {todasFazendas.map(f => <option key={f.id} value={f.id}>{f.nome}</option>)}
                  </select>
                </div>
                <div>
                  <label style={lbl}>Depósito Origem *</label>
                  {depositosOrigem.length === 0 ? (
                    <p style={{ fontSize: 12, color: "#E24B4A", margin: 0 }}>
                      ⚠️ Nenhum depósito cadastrado para esta fazenda.
                      Cadastre em Cadastros → Depósitos antes de continuar.
                    </p>
                  ) : (
                    <select value={form.depositoOrigemId} onChange={e => setForm(f => ({ ...f, depositoOrigemId: e.target.value }))} style={inp}>
                      <option value="">— Selecione o depósito —</option>
                      {depositosOrigem.map(d => <option key={d.id} value={d.id}>{d.nome}</option>)}
                    </select>
                  )}
                </div>
              </div>

              {/* Destino */}
              <div style={{ border: "0.5px solid #DDE2EE", borderRadius: 10, padding: "14px 16px" }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: "#C9921B", marginBottom: 12, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                  Destino
                </div>
                <div style={{ marginBottom: 10 }}>
                  <label style={lbl}>Fazenda Destino *</label>
                  <select value={form.fazendaDestinoId} onChange={e => setForm(f => ({ ...f, fazendaDestinoId: e.target.value, depositoDestinoId: "" }))} style={inp}>
                    <option value="">— Selecione —</option>
                    {todasFazendas.filter(f => f.id !== form.fazendaOrigemId).map(f => <option key={f.id} value={f.id}>{f.nome}</option>)}
                  </select>
                </div>
                <div>
                  <label style={lbl}>Depósito Destino *</label>
                  {form.fazendaDestinoId && depositosDestino.length === 0 ? (
                    <p style={{ fontSize: 12, color: "#E24B4A", margin: 0 }}>
                      ⚠️ Nenhum depósito cadastrado para esta fazenda.
                      Cadastre em Cadastros → Depósitos antes de continuar.
                    </p>
                  ) : (
                    <select value={form.depositoDestinoId} onChange={e => setForm(f => ({ ...f, depositoDestinoId: e.target.value }))} style={inp} disabled={!form.fazendaDestinoId}>
                      <option value="">— Selecione o depósito —</option>
                      {depositosDestino.map(d => <option key={d.id} value={d.id}>{d.nome}</option>)}
                    </select>
                  )}
                </div>
              </div>
            </div>

            {/* Config geral */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14, marginBottom: 16 }}>
              <div>
                <label style={lbl}>Data de Transferência</label>
                <input type="date" value={form.dataTransferencia} onChange={e => setForm(f => ({ ...f, dataTransferencia: e.target.value }))} style={inp} />
              </div>
              <div>
                <label style={lbl}>CFOP — <span style={{ color: "#1A4870", fontWeight: 700 }}>{cfopCalculado}</span></label>
                <select
                  value={form.cfopSufixo}
                  onChange={e => setForm(f => ({ ...f, cfopSufixo: e.target.value }))}
                  style={inp}
                  title="O prefixo 5 (mesmo estado) ou 6 (inter-estadual) é calculado automaticamente"
                >
                  {CFOP_OPCOES.map(o => (
                    <option key={o.sufixo} value={o.sufixo}>{o.label}</option>
                  ))}
                </select>
              </div>
              <div style={{ display: "flex", flexDirection: "column" }}>
                <label style={lbl}>Opções</label>
                <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", marginTop: 4 }}>
                  <input
                    type="checkbox"
                    checked={form.entradaAutomatica}
                    onChange={e => setForm(f => ({ ...f, entradaAutomatica: e.target.checked }))}
                  />
                  <span style={{ fontSize: 13, color: "#1a1a1a" }}>Entrada automática no destino</span>
                </label>
                <span style={{ fontSize: 11, color: "#888", marginTop: 3 }}>
                  {form.entradaAutomatica ? "✓ Estoque destino será creditado ao emitir" : "Entrada deve ser confirmada manualmente"}
                </span>
              </div>
            </div>

            {/* Itens */}
            <div style={{ marginBottom: 16 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: "#1a1a1a" }}>Itens da Transferência</span>
                <button onClick={addItem} style={{ ...btn("#F4F6FA", "#111111"), border: "0.5px solid #111111" }}>+ Adicionar Item</button>
              </div>
              <div style={{ border: "0.5px solid #DDE2EE", borderRadius: 8, overflow: "hidden" }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr>
                      {["Insumo *","Qtd *","Unidade","Custo Unit. (R$)","Valor Total","Variedade","Lote",""].map(h => (
                        <th key={h} style={{ ...th, fontSize: 11 }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {itens.map((it, i) => {
                      const insumoSel = todosInsumos.find(x => x.id === it.insumo_id);
                      const qtd = parseFloat(it.quantidade.replace(",", ".")) || 0;
                      const custo = parseFloat(it.custo_unitario.replace(",", ".")) || (insumoSel?.custo_medio ?? 0);
                      const total = qtd * custo;
                      const isSemente = insumoSel?.categoria === "semente";
                      return (
                        <tr key={i}>
                          <td style={td}>
                            <select value={it.insumo_id} onChange={e => updateItem(i, "insumo_id", e.target.value)} style={{ ...inp, width: 220 }}>
                              <option value="">— Selecione —</option>
                              {todosInsumos.filter(ins => (ins.estoque ?? 0) > 0).map(ins => (
                                <option key={ins.id} value={ins.id}>
                                  {ins.nome} (Est: {(ins.estoque ?? 0).toFixed(2)} {ins.unidade})
                                </option>
                              ))}
                            </select>
                          </td>
                          <td style={td}>
                            <input type="text" value={it.quantidade} onChange={e => updateItem(i, "quantidade", e.target.value)} placeholder="0,000" style={{ ...inp, width: 90 }} />
                          </td>
                          <td style={td}>
                            <input type="text" value={it.unidade_medida} onChange={e => updateItem(i, "unidade_medida", e.target.value)} style={{ ...inp, width: 70 }} />
                          </td>
                          <td style={td}>
                            <input type="text" value={it.custo_unitario} onChange={e => updateItem(i, "custo_unitario", e.target.value)} placeholder={custo ? custo.toFixed(4) : "0,0000"} style={{ ...inp, width: 110 }} />
                          </td>
                          <td style={{ ...td, fontVariantNumeric: "tabular-nums", fontWeight: 600 }}>
                            {total > 0 ? fmtBRL(total) : "—"}
                          </td>
                          <td style={td}>
                            {isSemente
                              ? <input type="text" value={it.variedade} onChange={e => updateItem(i, "variedade", e.target.value)} placeholder="Ex: TMG 7062" style={{ ...inp, width: 120 }} />
                              : <span style={{ color: "var(--text-3)", fontSize: 11 }}>—</span>}
                          </td>
                          <td style={td}>
                            {isSemente
                              ? <input type="text" value={it.lote_semente} onChange={e => updateItem(i, "lote_semente", e.target.value)} placeholder="Ex: L2025-001" style={{ ...inp, width: 100 }} />
                              : <span style={{ color: "var(--text-3)", fontSize: 11 }}>—</span>}
                          </td>
                          <td style={td}>
                            {itens.length > 1 && (
                              <button onClick={() => removeItem(i)} style={btn("#FEF2F2", "#E24B4A")}>✕</button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Observação */}
            <div style={{ marginBottom: 20 }}>
              <label style={lbl}>Observação</label>
              <input type="text" value={form.observacao} onChange={e => setForm(f => ({ ...f, observacao: e.target.value }))} style={inp} placeholder="Motivo da transferência, referências…" />
            </div>

            {erro && (
              <div style={{ padding: "10px 14px", background: "#FFF1F1", border: "0.5px solid #E24B4A", borderRadius: 8, fontSize: 12, color: "#B91C1C", marginBottom: 14 }}>
                {erro}
              </div>
            )}

            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <button onClick={() => setModal(false)} style={{ ...btn("#F4F6FA", "#555"), border: "0.5px solid #DDE2EE" }}>
                Cancelar
              </button>
              <button onClick={() => salvar("rascunho")} disabled={salvando} style={btn("#111111")}>
                {salvando ? "…" : editandoId ? "Salvar Alterações" : "Salvar Transferência"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Preview DANFE ─────────────────────────────────────────────────── */}
      {detalhe && (() => {
        const st = STATUS_LABEL[detalhe.status] ?? STATUS_LABEL.rascunho;
        const isRascunho = detalhe.status === "rascunho";
        const totalGeral = (detalhe.itens ?? []).reduce((s, it) => s + (it.valor_total ?? (it.custo_unitario ?? 0) * it.quantidade), 0);
        const infCpl = [infCplTransf, infCplBase].filter(Boolean).join(" | ");
        const border = "1px solid #ccc";
        const cellSt: React.CSSProperties = { padding: "6px 8px", fontSize: 11, borderRight: border, borderBottom: border };
        return (
          <div onClick={() => setDetalhe(null)} style={{
            position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 1000,
            display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "24px 12px", overflowY: "auto",
          }}>
            <div onClick={e => e.stopPropagation()} style={{ background: "#fff", width: "min(820px, 98vw)", borderRadius: 4, boxShadow: "0 12px 48px rgba(0,0,0,0.22)", fontFamily: "Arial, sans-serif" }}>

              {/* Barra de status */}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 16px", background: isRascunho ? "#FBF3E0" : "#DCFCE7", borderBottom: border }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, color: isRascunho ? "#7A5A12" : "#15803D" }}>
                    {isRascunho ? "PRÉ-VISUALIZAÇÃO DA NF-e — RASCUNHO" : "NF-e EMITIDA"}
                  </span>
                  <span style={{ padding: "2px 8px", borderRadius: 4, fontSize: 11, fontWeight: 700, background: st.bg, color: st.cor }}>{st.txt}</span>
                </div>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  {detalhe.nf_chave && (
                    <a href={`/api/fiscal/danfe?chave=${detalhe.nf_chave}&fazenda_id=${detalhe.fazenda_origem_id}`}
                       target="_blank" rel="noopener noreferrer"
                       style={{ fontSize: 12, fontWeight: 600, color: "#1A4870", textDecoration: "underline" }}>
                      Abrir DANFE PDF
                    </a>
                  )}
                  <button onClick={() => setDetalhe(null)} style={{ fontSize: 18, background: "none", border: "none", cursor: "pointer", color: "#555", lineHeight: 1 }}>✕</button>
                </div>
              </div>

              <div style={{ padding: "0 0 0 0" }}>
                {/* Cabeçalho DANFE */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 180px", borderBottom: border }}>
                  {/* Emitente */}
                  <div style={{ padding: "12px 14px", borderRight: border }}>
                    <div style={{ fontSize: 9, color: "#888", textTransform: "uppercase", marginBottom: 2 }}>EMITENTE</div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: "#111" }}>{detalhe.fazenda_origem_nome}</div>
                    <div style={{ fontSize: 11, color: "#555", marginTop: 2 }}>
                      {detalhe.deposito_origem_nome && detalhe.deposito_origem_nome !== "—" ? detalhe.deposito_origem_nome : "Sem depósito especificado"}
                    </div>
                    <div style={{ fontSize: 11, color: "#555", marginTop: 4 }}>
                      <strong>Nat. da Operação:</strong> Transferência de Insumos entre Estabelecimentos
                    </div>
                  </div>
                  {/* Número / CFOP */}
                  <div style={{ padding: "12px 14px", textAlign: "center" }}>
                    <div style={{ fontSize: 9, color: "#888", textTransform: "uppercase", marginBottom: 4 }}>NF-e</div>
                    <div style={{ fontSize: 22, fontWeight: 700, color: "#111", letterSpacing: 1 }}>
                      {detalhe.nf_numero ? String(detalhe.nf_numero).padStart(9, "0") : "A EMITIR"}
                    </div>
                    <div style={{ fontSize: 11, color: "#666", marginTop: 4 }}>
                      CFOP <strong>{detalhe.cfop}</strong>
                    </div>
                    <div style={{ fontSize: 11, color: "#666" }}>
                      Data: <strong>{fmtData(detalhe.data_transferencia)}</strong>
                    </div>
                    {detalhe.ie_diferentes && (
                      <div style={{ marginTop: 6, fontSize: 10, color: "#C9921B", fontWeight: 700 }}>⚠ INTERESTADUAL</div>
                    )}
                  </div>
                </div>

                {/* Destinatário */}
                <div style={{ padding: "10px 14px", borderBottom: border }}>
                  <div style={{ fontSize: 9, color: "#888", textTransform: "uppercase", marginBottom: 2 }}>DESTINATÁRIO</div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "#111" }}>{detalhe.fazenda_destino_nome}</div>
                  <div style={{ fontSize: 11, color: "#555", marginTop: 2 }}>
                    {detalhe.deposito_destino_nome && detalhe.deposito_destino_nome !== "—" ? detalhe.deposito_destino_nome : "Sem depósito especificado"}
                  </div>
                </div>

                {/* Itens */}
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
                    <thead>
                      <tr style={{ background: "#f5f5f5" }}>
                        {["#","DESCRIÇÃO DO PRODUTO","QTD","UNID","VALOR UNIT.","VALOR TOTAL"].map((h, i) => (
                          <th key={h} style={{ ...cellSt, fontWeight: 700, textAlign: i >= 2 ? "right" : "left", fontSize: 10, background: "#f0f0f0" }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {(detalhe.itens ?? []).map((it, idx) => {
                        const ins = todosInsumos.find(x => x.id === it.insumo_id);
                        const nome = ins?.nome ?? it.insumo_id;
                        const vlUnit = it.custo_unitario ?? ins?.custo_medio ?? 0;
                        const vlTotal = it.valor_total ?? vlUnit * it.quantidade;
                        return (
                          <tr key={it.id ?? idx} style={{ background: idx % 2 === 0 ? "#fff" : "#fafafa" }}>
                            <td style={{ ...cellSt, width: 28, textAlign: "center", color: "#888" }}>{idx + 1}</td>
                            <td style={{ ...cellSt, fontWeight: 600, color: "#111" }}>
                              {nome}
                              {it.variedade && <span style={{ color: "#888", fontWeight: 400 }}> · {it.variedade}</span>}
                              {it.lote_semente && <span style={{ color: "#888", fontWeight: 400 }}> · Lote: {it.lote_semente}</span>}
                            </td>
                            <td style={{ ...cellSt, textAlign: "right" }}>{it.quantidade.toFixed(3)}</td>
                            <td style={{ ...cellSt, textAlign: "right" }}>{it.unidade_medida}</td>
                            <td style={{ ...cellSt, textAlign: "right" }}>{vlUnit ? fmtBRL(vlUnit) : "—"}</td>
                            <td style={{ ...cellSt, textAlign: "right", fontWeight: 600 }}>{vlTotal ? fmtBRL(vlTotal) : "—"}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Totais */}
                <div style={{ display: "flex", justifyContent: "flex-end", padding: "10px 14px", borderBottom: border, borderTop: border, background: "#f9f9f9", gap: 32 }}>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: 9, color: "#888", textTransform: "uppercase" }}>Total de Itens</div>
                    <div style={{ fontSize: 13, fontWeight: 700 }}>{(detalhe.itens ?? []).length}</div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: 9, color: "#888", textTransform: "uppercase" }}>Valor Total da NF</div>
                    <div style={{ fontSize: 16, fontWeight: 700, color: "#1A4870" }}>{totalGeral ? fmtBRL(totalGeral) : "—"}</div>
                  </div>
                </div>

                {/* Info Complementar */}
                <div style={{ padding: "10px 14px", borderBottom: border }}>
                  <div style={{ fontSize: 9, color: "#888", textTransform: "uppercase", marginBottom: 4 }}>INFORMAÇÕES COMPLEMENTARES (infCpl)</div>
                  {infCpl ? (
                    <div style={{ fontSize: 11, color: "#111", lineHeight: 1.7 }}>{infCpl}</div>
                  ) : (
                    <div style={{ fontSize: 11, color: "#aaa", fontStyle: "italic" }}>
                      Nenhum texto configurado. Configure em{" "}
                      <a href="/configuracoes/modulos?aba=fiscal" target="_blank" style={{ color: "#1A4870" }}>
                        Parâmetros do Sistema → Fiscal → Textos por Tipo de Operação
                      </a>.
                    </div>
                  )}
                  {detalhe.observacao && (
                    <div style={{ marginTop: 6, fontSize: 11, color: "#555" }}>
                      <strong>Obs. interna:</strong> {detalhe.observacao}
                    </div>
                  )}
                </div>

                {/* Rodapé */}
                <div style={{ padding: "8px 14px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  {detalhe.nf_chave ? (
                    <div style={{ fontSize: 9, color: "#888", fontFamily: "monospace", letterSpacing: 0.5 }}>
                      Chave: {detalhe.nf_chave}
                    </div>
                  ) : (
                    <div style={{ fontSize: 10, color: "#C9921B", fontStyle: "italic" }}>
                      Chave de acesso gerada após emissão na SEFAZ
                    </div>
                  )}
                  {detalhe.solicitante_nome && (
                    <div style={{ fontSize: 10, color: "#888" }}>Solicitado via App: {detalhe.solicitante_nome}</div>
                  )}
                </div>
              </div>

              {/* Botões */}
              <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, padding: "12px 16px", borderTop: border, background: "#fafafa" }}>
                {isRascunho && (
                  <button onClick={() => { setDetalhe(null); abrirEditar(detalhe); }} style={{ ...btn("#1A4870") }}>
                    Editar Rascunho
                  </button>
                )}
                <button onClick={() => setDetalhe(null)} style={{ ...btn("#F4F6FA", "#555"), border: "0.5px solid #DDE2EE" }}>
                  Fechar
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
    </>
  );
}
