"use client";
import { useState, useEffect, useCallback } from "react";
import TopNav from "../../../components/TopNav";
import { useAuth } from "../../../components/AuthProvider";
import { supabase } from "../../../lib/supabase";
import InputMonetario from "../../../components/InputMonetario";
import InputNumerico from "../../../components/InputNumerico";
import PlanoGate from "../../../components/PlanoGate";

// ─────────────────────────────────────────────────────────────
// Estilos base
// ─────────────────────────────────────────────────────────────
const inp: React.CSSProperties = { width: "100%", padding: "8px 10px", border: "0.5px solid var(--border-table)", borderRadius: 8, fontSize: 13, color: "var(--text-1)", background: "var(--bg-card)", boxSizing: "border-box", outline: "none" };
const lbl: React.CSSProperties = { fontSize: 11, color: "var(--text-2)", marginBottom: 4, display: "block" };
const btnV: React.CSSProperties = { padding: "8px 20px", background: "#111111", color: "#fff", border: "none", borderRadius: 8, fontWeight: 600, cursor: "pointer", fontSize: 13 };
const btnR: React.CSSProperties = { padding: "8px 18px", border: "0.5px solid var(--border-table)", borderRadius: 8, background: "transparent", cursor: "pointer", fontSize: 13, color: "var(--text-1)" };

const fmtBRL = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fmtData = (s?: string | null) => s ? new Date(s + "T12:00:00").toLocaleDateString("pt-BR") : "—";
const hoje = () => new Date().toISOString().split("T")[0];

function badge(texto: string, bg = "#E8E8E8", color = "#0D0D0D") {
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
  valor_credito: number;
  valor_parcela_mensal: number;
  total_parcelas: number;
  parcelas_pagas: number;
  data_inicio: string;
  data_contemplacao?: string | null;
  data_encerramento?: string | null;
  status: StatusConsorcio;
  produtor_id?: string | null;
  financiamento_id?: string | null;
  valor_lance?: number | null;
  bem_adquirido?: string | null;
  observacao?: string;
  created_at?: string;
}

interface ProdutorSimples {
  id: string;
  nome: string;
  cpf_cnpj?: string | null;
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
  encerrado:    { label: "Encerrado",    bg: "var(--bg-page)", cl: "var(--text-2)"    },
  cancelado:    { label: "Cancelado",    bg: "#FCEBEB", cl: "#791F1F" },
};

const TIPO_BEM_META: Record<TipoBem, { label: string; bg: string; cl: string }> = {
  veiculo:  { label: "Veículo",     bg: "#E8E8E8", cl: "#0D0D0D" },
  imovel:   { label: "Imóvel",      bg: "#E8F5E9", cl: "#1A6B3C" },
  maquina:  { label: "Máquina",     bg: "#FBF3E0", cl: "#7B4A00" },
  caminhao: { label: "Caminhão",    bg: "#F3E8FF", cl: "#6B21A8" },
  outro:    { label: "Outro",       bg: "var(--bg-page)", cl: "var(--text-2)"    },
};

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────
async function buscarOgId(fazendaId: string, classificacao: string): Promise<string | null> {
  const { data } = await supabase
    .from("operacoes_gerenciais")
    .select("id")
    .eq("fazenda_id", fazendaId)
    .eq("classificacao", classificacao)
    .maybeSingle();
  return data?.id ?? null;
}

// ─────────────────────────────────────────────────────────────
// Componente principal
// ─────────────────────────────────────────────────────────────
export default function ConsorciosPage() {
  const { fazendaId, fazendaIds, contaId, podeAcessarPlano, contaModulosOverrides } = useAuth();
  const [aba, setAba] = useState<"lista" | "parcelas">("lista");

  // IDs das operações gerenciais de consórcio
  const [ogNaoContemplado, setOgNaoContemplado] = useState<string | null>(null);
  const [ogContemplado,    setOgContemplado]    = useState<string | null>(null);

  // ── IA Extração de Extrato ──────────────────────────────────
  const [iaCarregando, setIaCarregando] = useState(false);
  const [iaMensagem,   setIaMensagem]   = useState("");
  const [iaNome,       setIaNome]       = useState("");

  // Dados
  const [consorcios, setConsorcios] = useState<Consorcio[]>([]);
  const [parcelas,   setParcelas]   = useState<ParcelaConsorcio[]>([]);
  const [expandido,  setExpandido]  = useState<string | null>(null);
  const [produtores, setProdutores] = useState<ProdutorSimples[]>([]);
  const [busca,      setBusca]      = useState("");

  // Modal consórcio
  const [modalConsor,  setModalConsor]  = useState(false);
  const [consorEdit,   setConsorEdit]   = useState<Consorcio | null>(null);
  const CONSOR_VAZIO = () => ({
    administradora: "", numero_cota: "", grupo: "",
    tipo_bem: "maquina" as TipoBem, descricao_bem: "",
    valor_credito: 0, valor_parcela_mensal: 0,
    total_parcelas: "60", parcelas_pagas: "0",
    data_inicio: hoje(), status: "a_contemplar" as StatusConsorcio,
    observacao: "", produtor_id: "",
  });
  const [cForm,   setCForm]   = useState(CONSOR_VAZIO());
  const [cSaving, setCSaving] = useState(false);
  const [cErr,    setCErr]    = useState("");

  // Modal contemplação
  const [modalContempl, setModalContempl] = useState<Consorcio | null>(null);
  const [contemplForm, setContemplForm] = useState({
    data_contemplacao: hoje(),
    valor_lance: 0,
    bem_adquirido: "",
    migrar_financiamento: false,
  });
  const [contemplSaving, setContemplSaving] = useState(false);
  const [contemplErr, setContemplErr] = useState("");

  // Modal pagar parcela
  const [modalParcela, setModalParcela] = useState<ParcelaConsorcio | null>(null);
  const [parcelaData, setParcelaData] = useState(hoje());
  const [parcelaSaving, setParcelaSaving] = useState(false);

  // Rateio por ciclo
  const [tabConsor,       setTabConsor]       = useState<"dados" | "rateio">("dados");
  const [rateioLinhas,    setRateioLinhas]    = useState<{ ciclo_id: string; percentual: string }[]>([]);
  const [rateioSaving,    setRateioSaving]    = useState(false);
  const [rateioErr,       setRateioErr]       = useState("");
  const [rateioOk,        setRateioOk]        = useState(false);
  const [anoSafraFiltroR, setAnoSafraFiltroR] = useState("");
  const [anosRat,         setAnosRat]         = useState<{ id: string; descricao: string }[]>([]);
  const [ciclosRat,       setCiclosRat]       = useState<{ id: string; descricao: string; cultura: string | null; ano_safra_id: string }[]>([]);

  // ── Carregar ───────────────────────────────────────────────
  const carregar = useCallback(async () => {
    if (!contaId && !fazendaId) return;
    const param = contaId && !contaId.startsWith("sem_conta_")
      ? `conta_id=${contaId}`
      : `fazenda_ids=${(fazendaIds.length > 0 ? fazendaIds : [fazendaId]).join(",")}`;
    const res = await fetch(`/api/financeiro/consorcios?${param}`);
    if (!res.ok) return;
    const d = await res.json() as { consorcios: Consorcio[]; parcelas: ParcelaConsorcio[] };
    setConsorcios(d.consorcios ?? []);
    setParcelas(d.parcelas ?? []);
  }, [contaId, fazendaId, fazendaIds]);

  useEffect(() => { carregar(); }, [carregar]);

  // Carrega produtores da conta
  useEffect(() => {
    if (!contaId) return;
    supabase.from("produtores").select("id, nome, cpf_cnpj").eq("conta_id", contaId).order("nome")
      .then(({ data }) => setProdutores((data ?? []) as ProdutorSimples[]));
  }, [contaId]);

  // Carrega OG IDs de consórcio quando a fazenda está disponível
  useEffect(() => {
    if (!fazendaId) return;
    Promise.all([
      buscarOgId(fazendaId, "2.03.01.006"),
      buscarOgId(fazendaId, "2.03.01.007"),
    ]).then(([nc, co]) => {
      setOgNaoContemplado(nc);
      setOgContemplado(co);
    });
  }, [fazendaId]);

  // Carrega anos/ciclos quando o modal de consórcio abre
  useEffect(() => {
    if (!modalConsor || !fazendaId) return;
    Promise.all([
      supabase.from("anos_safra").select("id, descricao").eq("fazenda_id", fazendaId).order("descricao", { ascending: false }),
      supabase.from("ciclos").select("id, descricao, cultura, ano_safra_id").eq("fazenda_id", fazendaId).order("descricao"),
    ]).then(([{ data: anos }, { data: cics }]) => {
      setAnosRat((anos ?? []) as { id: string; descricao: string }[]);
      setCiclosRat((cics ?? []) as { id: string; descricao: string; cultura: string | null; ano_safra_id: string }[]);
    });
  }, [modalConsor, fazendaId]);

  // Carrega rateio existente ao editar um consórcio
  useEffect(() => {
    if (!modalConsor || !consorEdit) { setRateioLinhas([]); return; }
    supabase.from("consorcio_rateios")
      .select("ciclo_id, percentual")
      .eq("consorcio_id", consorEdit.id)
      .then(({ data }) => {
        setRateioLinhas((data ?? []).map((r: { ciclo_id: string | null; percentual: number }) => ({
          ciclo_id: r.ciclo_id ?? "",
          percentual: String(r.percentual),
        })));
      });
  }, [modalConsor, consorEdit]);

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
  async function extrairPdfConsorcio(file: File) {
    setIaCarregando(true);
    setIaMensagem("Analisando extrato com IA…");
    setIaNome(file.name);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/ai/extrair-consorcio", { method: "POST", body: fd });
      const dados = await res.json() as Record<string, unknown> & { error?: string };
      if (!res.ok || dados.error) { setIaMensagem(`Erro: ${dados.error ?? "Falha ao processar PDF."}`); return; }

      const d = dados as {
        administradora?: string | null; consorciado_nome?: string | null;
        consorciado_cpf?: string | null;
        grupo?: string | null; numero_cota?: string | null;
        valor_credito_atual?: number | null; valor_parcela_atual?: number | null;
        parcelas_pagas?: number | null; total_parcelas?: number | null;
        data_primeira_parcela?: string | null;
        tipo_bem?: string | null; descricao_bem?: string | null;
        confianca?: string;
      };

      // Tenta encontrar o produtor pelo CPF/CNPJ ou nome extraídos do PDF
      const normCpf = (s?: string | null) => (s ?? "").replace(/\D/g, "");
      const cpfIa = normCpf(d.consorciado_cpf);
      let produtorIdIa = "";
      if (cpfIa) {
        const match = produtores.find(p => normCpf(p.cpf_cnpj) === cpfIa);
        if (match) produtorIdIa = match.id;
      }
      if (!produtorIdIa && d.consorciado_nome) {
        const nomeIa = d.consorciado_nome.toLowerCase().trim();
        const match = produtores.find(p => p.nome.toLowerCase().trim() === nomeIa);
        if (match) produtorIdIa = match.id;
      }

      setConsorEdit(null);
      setCForm({
        administradora:      d.administradora      ?? "",
        numero_cota:         d.numero_cota != null ? String(d.numero_cota) : "",
        grupo:               d.grupo        != null ? String(d.grupo)        : "",
        tipo_bem:            (d.tipo_bem as TipoBem) ?? "outro",
        descricao_bem:       d.descricao_bem       ?? "",
        valor_credito:       d.valor_credito_atual  ?? 0,
        valor_parcela_mensal:d.valor_parcela_atual  ?? 0,
        total_parcelas:      d.total_parcelas ? String(d.total_parcelas) : "0",
        parcelas_pagas:      d.parcelas_pagas ? String(d.parcelas_pagas) : "0",
        data_inicio:         d.data_primeira_parcela || hoje(),
        status:              "a_contemplar" as StatusConsorcio,
        observacao:          "",
        produtor_id:         produtorIdIa,
      });
      // garantir que data_inicio é YYYY-MM-DD (IA pode retornar "" em vez de null)
      setCForm(f => ({ ...f, data_inicio: f.data_inicio || hoje() }));
      setCErr("");
      setModalConsor(true);
      const prodMatch = produtorIdIa ? produtores.find(p => p.id === produtorIdIa)?.nome : null;
      setIaMensagem(
        d.confianca === "alta"
          ? `✅ Extrato lido com alta confiança — ${d.administradora ?? ""} Grupo ${d.grupo ?? "—"} Cota ${d.numero_cota ?? "—"}${prodMatch ? ` · Agricultor: ${prodMatch}` : ""}`
          : d.confianca === "media"
          ? `⚠️ Alguns campos podem precisar de revisão — verifique antes de salvar.`
          : `⚠️ Confiança baixa — revise todos os dados antes de salvar.`,
      );
    } catch (e: unknown) {
      setIaMensagem(`Erro: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setIaCarregando(false);
    }
  }

  function abrirConsorcio(c?: Consorcio) {
    if (c) {
      setConsorEdit(c);
      setCForm({
        administradora: c.administradora, numero_cota: c.numero_cota,
        grupo: c.grupo, tipo_bem: c.tipo_bem, descricao_bem: c.descricao_bem,
        valor_credito: c.valor_credito ?? 0,
        valor_parcela_mensal: c.valor_parcela_mensal ?? 0,
        total_parcelas: String(c.total_parcelas),
        parcelas_pagas: String(c.parcelas_pagas),
        data_inicio: c.data_inicio, status: c.status,
        observacao: c.observacao ?? "",
        produtor_id: c.produtor_id ?? "",
      });
    } else {
      setConsorEdit(null);
      setCForm(CONSOR_VAZIO());
    }
    setCErr("");
    setTabConsor("dados");
    setRateioErr("");
    setRateioOk(false);
    setAnoSafraFiltroR("");
    setModalConsor(true);
  }

  async function salvarConsorcio() {
    // setCSaving(true) PRIMEIRO — garante feedback visual imediato em qualquer cenário
    setCSaving(true);
    setCErr("");
    try {
      if (!fazendaId)                   throw new Error("Nenhuma fazenda ativa. Selecione uma fazenda no topo da página.");
      if (!cForm.administradora?.trim()) throw new Error("Informe a administradora.");
      if (!cForm.numero_cota?.trim())    throw new Error("Informe o número da cota.");
      if (!cForm.data_inicio)            throw new Error("Informe a data de início.");

      const payload: Record<string, unknown> = {
        fazenda_id: fazendaId,
        administradora: cForm.administradora.trim(),
        numero_cota: cForm.numero_cota.trim(),
        grupo: cForm.grupo ?? "",
        tipo_bem: cForm.tipo_bem,
        descricao_bem: cForm.descricao_bem ?? "",
        valor_credito: Number(cForm.valor_credito) || 0,
        valor_parcela_mensal: Number(cForm.valor_parcela_mensal) || 0,
        total_parcelas: parseInt(String(cForm.total_parcelas)) || 0,
        parcelas_pagas: parseInt(String(cForm.parcelas_pagas)) || 0,
        data_inicio: cForm.data_inicio,
        status: cForm.status,
        observacao: cForm.observacao || null,
        produtor_id: cForm.produtor_id || null,
      };
      if (consorEdit) payload.id = consorEdit.id;

      const res = await fetch("/api/financeiro/consorcios", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json() as { ok?: boolean; error?: string };
      if (!res.ok) throw new Error(json.error ?? "Erro ao salvar.");

      await carregar();
      setModalConsor(false);
    } catch (e: unknown) {
      setCErr(e instanceof Error ? e.message : String(e));
    } finally {
      setCSaving(false);
    }
  }

  // ── Contemplação ──────────────────────────────────────────
  function abrirContemplacao(c: Consorcio) {
    setModalContempl(c);
    setContemplForm({
      data_contemplacao: hoje(), valor_lance: 0, bem_adquirido: "",
      migrar_financiamento: false,
    });
    setContemplErr("");
  }

  async function confirmarContemplacao() {
    if (!modalContempl || !fazendaId) return;
    if (!contemplForm.data_contemplacao) { setContemplErr("Informe a data de contemplação."); return; }
    setContemplSaving(true); setContemplErr("");
    try {
      // 1. Atualiza status do consórcio
      const { error: updErr } = await supabase.from("consorcios").update({
        status: "contemplado",
        data_contemplacao: contemplForm.data_contemplacao,
        valor_lance: contemplForm.valor_lance || null,
        bem_adquirido: contemplForm.bem_adquirido || null,
      }).eq("id", modalContempl.id);
      if (updErr) throw new Error(updErr.message);

      // 2. Reclassifica CPs abertas: OG "Não Contemplado" → "Contemplado"
      const ogAlvo = ogContemplado ?? await buscarOgId(fazendaId, "2.03.01.007");
      if (ogAlvo) {
        const { data: cpAbertas } = await supabase
          .from("lancamentos")
          .select("id")
          .eq("consorcio_id", modalContempl.id)
          .eq("tipo", "pagar")
          .neq("status", "pago");
        if (cpAbertas && cpAbertas.length > 0) {
          await supabase
            .from("lancamentos")
            .update({ operacao_gerencial_id: ogAlvo })
            .in("id", cpAbertas.map((l: { id: string }) => l.id));
        }
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
      // Marca o lancamento (CP) vinculado como pago
      await supabase.from("lancamentos").update({ status: "pago", data_baixa: parcelaData, valor_pago: modalParcela.valor })
        .eq("consorcio_id", modalParcela.consorcio_id)
        .eq("numero_documento", String(modalParcela.numero_parcela))
        .eq("tipo", "pagar")
        .neq("status", "pago");
      // Incrementa parcelas_pagas no consórcio
      const c = consorcios.find(c => c.id === modalParcela.consorcio_id);
      if (c) await supabase.from("consorcios").update({ parcelas_pagas: c.parcelas_pagas + 1 }).eq("id", c.id);
      await carregar();
      setModalParcela(null);
    } finally {
      setParcelaSaving(false);
    }
  }

  // ── Salvar rateio por ciclo ───────────────────────────────
  async function salvarRateio() {
    if (!consorEdit) return;
    setRateioSaving(true);
    setRateioErr("");
    setRateioOk(false);
    try {
      const linhasValidas = rateioLinhas.filter(l => l.ciclo_id && Number(l.percentual) > 0);
      const total = linhasValidas.reduce((s, l) => s + (Number(l.percentual) || 0), 0);
      if (linhasValidas.length > 0 && Math.abs(total - 100) >= 0.01) {
        throw new Error(`Total ${total.toFixed(2)}% — o rateio deve somar exatamente 100%.`);
      }
      const res = await fetch("/api/financeiro/consorcios", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          consorcio_id: consorEdit.id,
          rateios: linhasValidas.map(l => ({ ciclo_id: l.ciclo_id, percentual: Number(l.percentual) })),
        }),
      });
      const json = await res.json() as { ok?: boolean; error?: string };
      if (!res.ok) throw new Error(json.error ?? "Erro ao salvar rateio.");
      setRateioOk(true);
    } catch (e: unknown) {
      setRateioErr(e instanceof Error ? e.message : String(e));
    } finally {
      setRateioSaving(false);
    }
  }

  // ── Gerar parcelas + CPs no financeiro ───────────────────
  // Usa API route (service_role_key) — imune a JWT expirado e RLS.
  async function gerarParcelas(c: Consorcio) {
    // Usa o fazenda_id do próprio consórcio — funciona mesmo sem fazenda ativa no contexto
    const fId = c.fazenda_id || fazendaId;
    if (!fId) return;
    const existem = parcelas.filter(p => p.consorcio_id === c.id);
    if (existem.length > 0) {
      if (!confirm(`Este consórcio já tem ${existem.length} parcelas. Deseja apagar e regenerar?`)) return;
    }
    const res = await fetch("/api/financeiro/consorcios", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        consorcio_id:        c.id,
        fazenda_id:          fId,
        administradora:      c.administradora,
        numero_cota:         c.numero_cota,
        valor_parcela_mensal: c.valor_parcela_mensal,
        total_parcelas:      c.total_parcelas,
        parcelas_pagas:      c.parcelas_pagas,
        data_inicio:         c.data_inicio,
        status:              c.status,
      }),
    });
    const json = await res.json() as { ok?: boolean; parcelas?: number; cps?: number; error?: string };
    if (!res.ok) { alert(json.error ?? "Erro ao gerar parcelas."); return; }
    await carregar();
    alert(`✅ ${json.parcelas ?? 0} parcelas criadas — ${json.cps ?? 0} CPs lançadas no financeiro.${json.rateio ? `\nRateio ativo: ${json.ciclos ?? 0} ciclo(s) — uma CP por ciclo por parcela.` : ""}\n\nPara ver as CPs vencidas, clique na aba "Vencidos" em Contas a Pagar.`);
  }

  // ── Parcelas visíveis ─────────────────────────────────────
  const parcelasVisiveis = aba === "parcelas"
    ? parcelas.filter(p => !p.pago && new Date(p.data_vencimento) >= new Date(new Date().setDate(new Date().getDate() - 5)))
    : parcelas.filter(p => expandido && p.consorcio_id === expandido);

  if (!podeAcessarPlano("fin_tesouraria")) return <PlanoGate modulo="fin_tesouraria" />;
  return (
    <div style={{ minHeight: "100vh", background: "var(--bg-page)" }}>
      <TopNav />

      <main style={{ maxWidth: 1100, margin: "0 auto", padding: "28px 20px" }}>

        {/* Cabeçalho */}
        <div style={{ marginBottom: 22 }}>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: "var(--text-1)", margin: 0 }}>Controle de Consórcios</h1>
          <p style={{ fontSize: 13, color: "#666", marginTop: 4, marginBottom: 0 }}>
            Cotas em andamento — acompanhe parcelas, contemplações e migração para financiamento
          </p>
        </div>

        {/* KPI cards */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14, marginBottom: 22 }}>
          {[
            { label: "A Contemplar",      value: aContemplar.length.toString(),    sub: "cotas ativas",       color: "#C9921B" },
            { label: "Contemplados",       value: contemplados.length.toString(),   sub: "em uso",             color: "#1A6B3C" },
            { label: "Crédito Disponível", value: fmtBRL(totalCredito),            sub: "a contemplar",       color: "#111111" },
            { label: "Parcelas Atrasadas", value: parcelasAtrasadas.length.toString(), sub: "requer atenção",  color: parcelasAtrasadas.length > 0 ? "#E24B4A" : "var(--text-2)" },
          ].map(k => (
            <div key={k.label} style={{ background: "var(--bg-card)", borderRadius: 12, border: "0.5px solid var(--border-table)", padding: "16px 18px" }}>
              <div style={{ fontSize: 11, color: "#666", marginBottom: 6 }}>{k.label}</div>
              <div style={{ fontSize: 20, fontWeight: 700, color: k.color }}>{k.value}</div>
              <div style={{ fontSize: 11, color: "var(--text-3)", marginTop: 2 }}>{k.sub}</div>
            </div>
          ))}
        </div>

        {/* Banner IA Extrato Consórcio */}
        {contaModulosOverrides["ia_consorcio"] === true && (
          <div style={{ background: "linear-gradient(135deg,#E8F0FE,#F0F4FF)", border: "0.5px solid #B8CCF8", borderRadius: 12, padding: "14px 20px", marginBottom: 18, display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
            <div style={{ flex: 1, minWidth: 200 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#1A4870", marginBottom: 2 }}>
                🤖 Importar Extrato de Consórcio com IA
              </div>
              <div style={{ fontSize: 12, color: "#0B2D50" }}>
                Envie o extrato analítico em PDF — o Arato preenche os campos automaticamente.
              </div>
              {iaMensagem && (
                <div style={{ marginTop: 6, fontSize: 12, color: iaMensagem.startsWith("✅") ? "#1A6B3C" : iaMensagem.startsWith("Erro") ? "#791F1F" : "#7B4A00", fontWeight: iaMensagem.startsWith("✅") ? 600 : 400 }}>
                  {iaMensagem}{iaNome ? ` · ${iaNome}` : ""}
                </div>
              )}
            </div>
            <label style={{ display: "inline-flex", alignItems: "center", gap: 8, background: iaCarregando ? "#888" : "#1A4870", color: "#fff", padding: "8px 18px", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: iaCarregando ? "not-allowed" : "pointer" }}>
              {iaCarregando ? "Analisando…" : "📄 Enviar PDF"}
              <input type="file" accept="application/pdf" style={{ display: "none" }} disabled={iaCarregando}
                onChange={e => { const f = e.target.files?.[0]; if (f) extrairPdfConsorcio(f); e.target.value = ""; }}
              />
            </label>
          </div>
        )}

        {/* Alerta parcelas atrasadas */}
        {parcelasAtrasadas.length > 0 && (
          <div style={{ background: "#FCEBEB", border: "0.5px solid #E24B4A40", borderRadius: 10, padding: "10px 16px", marginBottom: 18, fontSize: 12, color: "#791F1F" }}>
            <strong>{parcelasAtrasadas.length} parcela{parcelasAtrasadas.length !== 1 ? "s atrasadas" : " atrasada"} —</strong> total em atraso: <strong>{fmtBRL(parcelasAtrasadas.reduce((s, p) => s + p.valor, 0))}</strong>
          </div>
        )}

        {/* Abas */}
        <div style={{ display: "flex", gap: 0, marginBottom: 20, borderBottom: "0.5px solid var(--border-table)" }}>
          {([
            { id: "lista",    label: "Consórcios"                 },
            { id: "parcelas", label: "Próximas Parcelas"          },
          ] as { id: typeof aba; label: string }[]).map(a => (
            <button key={a.id} onClick={() => setAba(a.id)} style={{
              padding: "9px 20px", border: "none", background: "none", cursor: "pointer",
              fontSize: 13, fontWeight: aba === a.id ? 700 : 400,
              color: aba === a.id ? "#111111" : "#666",
              borderBottom: aba === a.id ? "2.5px solid #111111" : "2.5px solid transparent",
              marginBottom: -1,
            }}>{a.label}</button>
          ))}
        </div>

        {/* ── ABA LISTA ──────────────────────────────────────── */}
        {aba === "lista" && (
          <div>
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginBottom: 14, alignItems: "center" }}>
              <div style={{ position: "relative", flex: 1, maxWidth: 340 }}>
                <span style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "#aaa", fontSize: 14, pointerEvents: "none" }}>🔍</span>
                <input
                  value={busca}
                  onChange={e => setBusca(e.target.value)}
                  placeholder="Filtrar por grupo ou número da cota…"
                  style={{ width: "100%", padding: "8px 10px 8px 32px", border: "0.5px solid var(--border-table)", borderRadius: 8, fontSize: 13, background: "var(--bg-page)", color: "var(--text-1)", boxSizing: "border-box" }}
                />
                {busca && <button onClick={() => setBusca("")} style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: "#aaa", fontSize: 14 }}>✕</button>}
              </div>
              <button onClick={() => abrirConsorcio()} style={btnV}>+ Novo Consórcio</button>
            </div>

            {(() => {
              const termo = busca.trim().toLowerCase();
              const filtrados = termo
                ? consorcios.filter(c =>
                    c.numero_cota.toLowerCase().includes(termo) ||
                    (c.grupo ?? "").toLowerCase().includes(termo) ||
                    c.administradora.toLowerCase().includes(termo)
                  )
                : consorcios;

              if (consorcios.length === 0) return (
              <div style={{ background: "var(--bg-card)", borderRadius: 12, border: "0.5px solid var(--border-table)", padding: 40, textAlign: "center", color: "var(--text-3)", fontSize: 13 }}>
                Nenhum consórcio cadastrado.
              </div>
              );
              if (filtrados.length === 0) return (
              <div style={{ background: "var(--bg-card)", borderRadius: 12, border: "0.5px solid var(--border-table)", padding: 40, textAlign: "center", color: "var(--text-3)", fontSize: 13 }}>
                Nenhum consórcio encontrado para <strong>"{busca}"</strong>.
              </div>
              );
              return (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {filtrados.map(c => {
                  const sm = STATUS_META[c.status];
                  const tb = TIPO_BEM_META[c.tipo_bem];
                  const progresso = c.total_parcelas > 0 ? (c.parcelas_pagas / c.total_parcelas) * 100 : 0;
                  const parcelasC = parcelas.filter(p => p.consorcio_id === c.id);
                  const exp = expandido === c.id;
                  const saldoRestante = (c.total_parcelas - c.parcelas_pagas) * c.valor_parcela_mensal;
                  return (
                    <div key={c.id} style={{ background: "var(--bg-card)", borderRadius: 12, border: "0.5px solid var(--border-table)", overflow: "hidden" }}>
                      {/* Linha resumo */}
                      <div
                        onClick={() => setExpandido(exp ? null : c.id)}
                        style={{ display: "grid", gridTemplateColumns: "1fr 110px 130px 130px 110px 200px", alignItems: "center", gap: 12, padding: "14px 18px", cursor: "pointer" }}
                      >
                        <div>
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text-1)" }}>
                              {c.administradora} — Cota {c.numero_cota}
                            </span>
                            {badge(tb.label, tb.bg, tb.cl)}
                          </div>
                          <div style={{ fontSize: 12, color: "#666", marginTop: 3 }}>
                            {c.descricao_bem || "Bem não especificado"} {c.grupo ? `· Grupo ${c.grupo}` : ""}
                          </div>
                          {c.produtor_id && (() => {
                            const prod = produtores.find(p => p.id === c.produtor_id);
                            return prod ? <div style={{ fontSize: 11, color: "#1A4870", marginTop: 2 }}>Agricultor: {prod.nome}</div> : null;
                          })()}
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
                          <div style={{ height: 6, background: "var(--bg-tag)", borderRadius: 3, overflow: "hidden" }}>
                            <div style={{ height: "100%", width: `${Math.min(100, progresso)}%`, background: c.status === "contemplado" ? "#16A34A" : "#111111", borderRadius: 3 }} />
                          </div>
                          <div style={{ fontSize: 10, color: "var(--text-3)", marginTop: 2 }}>{c.parcelas_pagas}/{c.total_parcelas} parcelas</div>
                        </div>
                        <div style={{ display: "flex", gap: 6, justifyContent: "flex-end", alignItems: "center", flexWrap: "wrap" }}>
                          {badge(sm.label, sm.bg, sm.cl)}
                          {c.status === "a_contemplar" && (
                            <button onClick={e => { e.stopPropagation(); abrirContemplacao(c); }} style={{ padding: "4px 10px", border: "0.5px solid #16A34A50", borderRadius: 6, background: "#E8F5E9", cursor: "pointer", fontSize: 11, color: "#1A6B3C", fontWeight: 600 }}>
                              Contemplar
                            </button>
                          )}
                          {parcelasC.length === 0 && (
                            <button onClick={e => { e.stopPropagation(); gerarParcelas(c); }} style={{ padding: "4px 10px", border: "0.5px solid #11111150", borderRadius: 6, background: "#E8E8E8", cursor: "pointer", fontSize: 11, color: "#0D0D0D", fontWeight: 600 }}>
                              Gerar Parcelas
                            </button>
                          )}
                          <button onClick={e => { e.stopPropagation(); abrirConsorcio(c); }} style={{ padding: "4px 10px", border: "0.5px solid var(--border-table)", borderRadius: 6, background: "transparent", cursor: "pointer", fontSize: 11, color: "var(--text-2)" }}>
                            Editar
                          </button>
                        </div>
                      </div>

                      {/* Parcelas expandidas */}
                      {exp && (
                        <div style={{ borderTop: "0.5px solid var(--bg-tag)", padding: "12px 18px", background: "var(--bg-card)" }}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                            <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-2)" }}>
                              Parcelas ({parcelasC.length}) — mensalidade mensal {fmtBRL(c.valor_parcela_mensal)}
                            </div>
                            {parcelasC.length > 0 && (
                              <button onClick={() => gerarParcelas(c)} style={{ padding: "4px 10px", border: "0.5px solid var(--border-table)", borderRadius: 6, background: "transparent", cursor: "pointer", fontSize: 11, color: "var(--text-2)" }}>
                                Regenerar
                              </button>
                            )}
                          </div>
                          {parcelasC.length === 0 ? (
                            <div style={{ fontSize: 12, color: "var(--text-muted)" }}>Clique em "Gerar Parcelas" para criar o cronograma.</div>
                          ) : (
                            <div style={{ maxHeight: 240, overflowY: "auto" }}>
                              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                                <thead>
                                  <tr style={{ background: "var(--bg-tag)", position: "sticky", top: 0 }}>
                                    {["Nº", "Vencimento", "Valor", "Status", ""].map(h => (
                                      <th key={h} style={{ padding: "6px 10px", textAlign: h === "Valor" ? "right" : "left", color: "var(--text-2)", fontWeight: 600 }}>{h}</th>
                                    ))}
                                  </tr>
                                </thead>
                                <tbody>
                                  {parcelasC.slice(0, 36).map(p => {
                                    const vencido = !p.pago && new Date(p.data_vencimento) < new Date();
                                    return (
                                      <tr key={p.id} style={{ borderBottom: "0.5px solid var(--bg-tag)", background: vencido ? "#FFFCF5" : "var(--bg-card)" }}>
                                        <td style={{ padding: "5px 10px", color: "var(--text-3)" }}>{p.numero_parcela}</td>
                                        <td style={{ padding: "5px 10px", color: vencido ? "#E24B4A" : "var(--text-1)" }}>{fmtData(p.data_vencimento)}</td>
                                        <td style={{ padding: "5px 10px", textAlign: "right", fontWeight: 600 }}>{fmtBRL(p.valor)}</td>
                                        <td style={{ padding: "5px 10px" }}>
                                          {p.pago ? badge("Pago", "#E8F5E9", "#1A6B3C") : vencido ? badge("Atrasado", "#FCEBEB", "#791F1F") : badge("Pendente", "#FBF3E0", "#7B4A00")}
                                        </td>
                                        <td style={{ padding: "5px 10px", textAlign: "right" }}>
                                          {!p.pago && (
                                            <button onClick={() => { setModalParcela(p); setParcelaData(hoje()); }} style={{ padding: "3px 8px", border: "0.5px solid #11111150", borderRadius: 5, background: "#E8E8E8", cursor: "pointer", fontSize: 10, color: "#0D0D0D", fontWeight: 600 }}>
                                              Pagar
                                            </button>
                                          )}
                                        </td>
                                      </tr>
                                    );
                                  })}
                                  {parcelasC.length > 36 && (
                                    <tr><td colSpan={5} style={{ padding: "6px 10px", textAlign: "center", fontSize: 11, color: "var(--text-3)" }}>+ {parcelasC.length - 36} parcelas futuras</td></tr>
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
              );
            })()}
          </div>
        )}

        {/* ── ABA PRÓXIMAS PARCELAS ─────────────────────────── */}
        {aba === "parcelas" && (
          <div>
            {/* Resumo mensal */}
            <div style={{ background: "var(--bg-card)", borderRadius: 12, border: "0.5px solid var(--border-table)", padding: "14px 18px", marginBottom: 16, display: "flex", gap: 24, alignItems: "center" }}>
              <div>
                <div style={{ fontSize: 11, color: "#666" }}>Compromisso mensal total</div>
                <div style={{ fontSize: 18, fontWeight: 700, color: "#111111" }}>{fmtBRL(totalMensal)}</div>
              </div>
              <div style={{ width: 1, height: 40, background: "var(--bg-tag)" }} />
              <div style={{ fontSize: 12, color: "var(--text-2)" }}>
                {consorcios.filter(c => c.status === "a_contemplar" || c.status === "contemplado").length} consórcio(s) ativo(s)
              </div>
            </div>

            {parcelasVisiveis.length === 0 ? (
              <div style={{ background: "var(--bg-card)", borderRadius: 12, border: "0.5px solid var(--border-table)", padding: 40, textAlign: "center", color: "var(--text-3)", fontSize: 13 }}>
                Nenhuma parcela pendente.
              </div>
            ) : (
              <div style={{ background: "var(--bg-card)", borderRadius: 12, border: "0.5px solid var(--border-table)", overflow: "hidden" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                  <thead>
                    <tr style={{ background: "var(--bg-card)" }}>
                      {["Vencimento", "Consórcio", "Cota", "Parcela Nº", "Valor", "Status", ""].map(h => (
                        <th key={h} style={{ padding: "10px 14px", textAlign: h === "Valor" ? "right" : "left", color: "var(--text-2)", fontWeight: 600, fontSize: 11, borderBottom: "0.5px solid var(--bg-tag)" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {parcelasVisiveis.map(p => {
                      const c = consorcios.find(c => c.id === p.consorcio_id);
                      const vencido = new Date(p.data_vencimento) < new Date();
                      return (
                        <tr key={p.id} style={{ borderBottom: "0.5px solid var(--bg-tag)", background: vencido ? "#FFFCF5" : "var(--bg-card)" }}>
                          <td style={{ padding: "10px 14px", color: vencido ? "#E24B4A" : "var(--text-1)", fontWeight: vencido ? 600 : 400 }}>{fmtData(p.data_vencimento)}</td>
                          <td style={{ padding: "10px 14px" }}>{c?.administradora ?? "—"}</td>
                          <td style={{ padding: "10px 14px", color: "#666" }}>{c?.numero_cota ?? "—"}</td>
                          <td style={{ padding: "10px 14px", color: "var(--text-3)" }}>{p.numero_parcela}</td>
                          <td style={{ padding: "10px 14px", textAlign: "right", fontWeight: 600 }}>{fmtBRL(p.valor)}</td>
                          <td style={{ padding: "10px 14px" }}>
                            {p.pago ? badge("Pago", "#E8F5E9", "#1A6B3C") : vencido ? badge("Atrasado", "#FCEBEB", "#791F1F") : badge("Pendente", "#FBF3E0", "#7B4A00")}
                          </td>
                          <td style={{ padding: "10px 14px", textAlign: "right" }}>
                            {!p.pago && (
                              <button onClick={() => { setModalParcela(p); setParcelaData(hoje()); }} style={{ padding: "4px 10px", border: "0.5px solid #11111150", borderRadius: 6, background: "#E8E8E8", cursor: "pointer", fontSize: 11, color: "#0D0D0D", fontWeight: 600 }}>
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
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "flex-start", justifyContent: "center", zIndex:2000, overflowY: "auto", padding: "24px 0" }}>
          <div style={{ background: "var(--bg-card)", borderRadius: 14, width: "100%", maxWidth: 620, margin: "0 20px", boxShadow: "0 4px 20px rgba(11,45,80,0.10)" }}>
            {/* Cabeçalho */}
            <div style={{ padding: "18px 22px 14px", borderBottom: "0.5px solid var(--bg-tag)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: "var(--text-1)" }}>{consorEdit ? "Editar Consórcio" : "Novo Consórcio"}</div>
              <button onClick={() => setModalConsor(false)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 20, color: "var(--text-3)" }}>×</button>
            </div>

            {/* Tab bar */}
            <div style={{ display: "flex", borderBottom: "0.5px solid var(--bg-tag)" }}>
              {(["dados", "rateio"] as const).map(t => {
                const nCiclos = rateioLinhas.filter(l => l.ciclo_id).length;
                const label = t === "dados" ? "Dados" : nCiclos > 0 ? `Rateio (${nCiclos})` : "Rateio";
                return (
                  <button key={t} onClick={() => { setTabConsor(t); setRateioErr(""); setRateioOk(false); }}
                    style={{ padding: "9px 20px", border: "none", background: "none", cursor: "pointer", fontSize: 13,
                      fontWeight: tabConsor === t ? 700 : 400,
                      color: tabConsor === t ? "#111111" : "#666",
                      borderBottom: tabConsor === t ? "2.5px solid #111111" : "2.5px solid transparent",
                      marginBottom: -1 }}>
                    {label}
                  </button>
                );
              })}
            </div>

            {/* TAB: DADOS */}
            {tabConsor === "dados" && (
            <div style={{ padding: "20px 22px" }}>
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
                  <InputMonetario style={inp} value={cForm.valor_credito} onChange={v => setCForm(f => ({ ...f, valor_credito: v }))} />
                </div>
                <div>
                  <label style={lbl}>Parcela Mensal (R$)</label>
                  <InputMonetario style={inp} value={cForm.valor_parcela_mensal} onChange={v => setCForm(f => ({ ...f, valor_parcela_mensal: v }))} />
                </div>
                <div>
                  <label style={lbl}>Total de Parcelas</label>
                  <InputNumerico decimais={0} min="1" value={cForm.total_parcelas} onChange={v => setCForm(f => ({ ...f, total_parcelas: v }))} style={inp} />
                </div>
                <div>
                  <label style={lbl}>Data de Início</label>
                  <input type="date" value={cForm.data_inicio} onChange={e => setCForm(f => ({ ...f, data_inicio: e.target.value }))} style={inp} />
                </div>
                <div>
                  <label style={lbl}>Parcelas Pagas</label>
                  <InputNumerico decimais={0} min="0" value={cForm.parcelas_pagas} onChange={v => setCForm(f => ({ ...f, parcelas_pagas: v }))} style={inp} />
                </div>
                <div>
                  <label style={lbl}>Status</label>
                  <select value={cForm.status} onChange={e => setCForm(f => ({ ...f, status: e.target.value as StatusConsorcio }))} style={inp}>
                    {Object.entries(STATUS_META).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                  </select>
                </div>
                <div style={{ gridColumn: "1 / -1" }}>
                  <label style={lbl}>Agricultor / Consorciado</label>
                  <select value={cForm.produtor_id} onChange={e => setCForm(f => ({ ...f, produtor_id: e.target.value }))} style={inp}>
                    <option value="">— Selecione —</option>
                    {produtores.map(p => <option key={p.id} value={p.id}>{p.nome}{p.cpf_cnpj ? ` — ${p.cpf_cnpj}` : ""}</option>)}
                  </select>
                </div>
                <div style={{ gridColumn: "1 / -1" }}>
                  <label style={lbl}>Observação</label>
                  <textarea value={cForm.observacao} onChange={e => setCForm(f => ({ ...f, observacao: e.target.value }))} rows={2} style={{ ...inp, resize: "vertical" }} />
                </div>
              </div>
            </div>
            )}

            {/* TAB: RATEIO */}
            {tabConsor === "rateio" && (
            <div style={{ padding: "20px 22px" }}>
              <div style={{ background: "#FBF3E0", border: "0.5px solid #C9921B40", borderRadius: 8, padding: "10px 14px", fontSize: 12, color: "#7B4A00", marginBottom: 16 }}>
                Após salvar o rateio, clique em <strong>Regenerar</strong> no card do consórcio para aplicar às CPs do financeiro.
              </div>
              {!consorEdit ? (
                <div style={{ background: "var(--bg-page)", border: "0.5px solid var(--border-table)", borderRadius: 8, padding: "16px", fontSize: 13, color: "var(--text-2)", textAlign: "center" }}>
                  Salve o consórcio primeiro para configurar o rateio.
                </div>
              ) : (
              <>
                {/* Filtro por Ano Safra */}
                <div style={{ marginBottom: 14 }}>
                  <label style={lbl}>Filtrar ciclos por Ano Safra</label>
                  <select value={anoSafraFiltroR} onChange={e => setAnoSafraFiltroR(e.target.value)} style={{ ...inp, maxWidth: 280 }}>
                    <option value="">— Todos os anos —</option>
                    {anosRat.map(a => <option key={a.id} value={a.id}>{a.descricao}</option>)}
                  </select>
                </div>

                {/* Linhas de rateio */}
                <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 10 }}>
                  {rateioLinhas.map((linha, idx) => {
                    const opsCiclos = ciclosRat.filter(c => !anoSafraFiltroR || c.ano_safra_id === anoSafraFiltroR);
                    return (
                      <div key={idx} style={{ display: "grid", gridTemplateColumns: "1fr 130px 36px", gap: 8, alignItems: "center" }}>
                        <select
                          value={linha.ciclo_id}
                          onChange={e => setRateioLinhas(ls => ls.map((l, i) => i === idx ? { ...l, ciclo_id: e.target.value } : l))}
                          style={inp}
                        >
                          <option value="">— Selecione o ciclo —</option>
                          {opsCiclos.map(c => (
                            <option key={c.id} value={c.id}>
                              {c.cultura ? `${c.cultura} · ` : ""}{c.descricao}
                            </option>
                          ))}
                        </select>
                        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                          <input
                            type="number" min="0" max="100" step="0.01"
                            value={linha.percentual}
                            onChange={e => setRateioLinhas(ls => ls.map((l, i) => i === idx ? { ...l, percentual: e.target.value } : l))}
                            style={{ ...inp, textAlign: "right", width: "100%" }}
                            placeholder="0,00"
                          />
                          <span style={{ fontSize: 12, color: "var(--text-2)", whiteSpace: "nowrap" }}>%</span>
                        </div>
                        <button
                          onClick={() => setRateioLinhas(ls => ls.filter((_, i) => i !== idx))}
                          style={{ width: 36, height: 36, display: "flex", alignItems: "center", justifyContent: "center", background: "#FCEBEB", border: "0.5px solid #E24B4A40", borderRadius: 8, cursor: "pointer", fontSize: 16, color: "#791F1F" }}
                        >×</button>
                      </div>
                    );
                  })}
                </div>

                <button
                  onClick={() => setRateioLinhas(ls => [...ls, { ciclo_id: "", percentual: "" }])}
                  style={{ padding: "6px 14px", border: "0.5px solid var(--border-table)", borderRadius: 8, background: "var(--bg-page)", cursor: "pointer", fontSize: 12, color: "var(--text-2)", marginBottom: 16 }}
                >+ Adicionar Ciclo</button>

                {/* Barra de total */}
                {rateioLinhas.length > 0 && (() => {
                  const total = rateioLinhas.reduce((s, l) => s + (Number(l.percentual) || 0), 0);
                  const ok100 = Math.abs(total - 100) < 0.01;
                  return (
                    <div style={{ marginBottom: 4 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 4, fontWeight: 600, color: ok100 ? "#1A6B3C" : total > 100 ? "#791F1F" : "#7B4A00" }}>
                        <span>Total rateio</span>
                        <span>{total.toFixed(2)}%</span>
                      </div>
                      <div style={{ height: 8, background: "var(--bg-tag)", borderRadius: 4, overflow: "hidden" }}>
                        <div style={{ height: "100%", width: `${Math.min(100, total)}%`, background: ok100 ? "#16A34A" : total > 100 ? "#E24B4A" : "#C9921B", borderRadius: 4, transition: "width 0.2s, background 0.2s" }} />
                      </div>
                      {!ok100 && total > 0 && (
                        <div style={{ fontSize: 11, color: "#7B4A00", marginTop: 4 }}>
                          {total < 100 ? `Faltam ${(100 - total).toFixed(2)}% para completar 100%` : `Excesso de ${(total - 100).toFixed(2)}%`}
                        </div>
                      )}
                    </div>
                  );
                })()}
              </>
              )}
            </div>
            )}

            {/* Rodapé */}
            <div style={{ padding: "14px 22px 18px", borderTop: "0.5px solid var(--bg-tag)" }}>
              {tabConsor === "dados" && cErr && (
                <div style={{ background: "#FCEBEB", border: "0.5px solid #F5C6C6", borderRadius: 8, padding: "10px 14px", fontSize: 13, color: "#791F1F", marginBottom: 12 }}>{cErr}</div>
              )}
              {tabConsor === "rateio" && rateioErr && (
                <div style={{ background: "#FCEBEB", border: "0.5px solid #F5C6C6", borderRadius: 8, padding: "10px 14px", fontSize: 13, color: "#791F1F", marginBottom: 12 }}>{rateioErr}</div>
              )}
              {tabConsor === "rateio" && rateioOk && (
                <div style={{ background: "#E8F5E9", border: "0.5px solid #16A34A40", borderRadius: 8, padding: "10px 14px", fontSize: 13, color: "#1A6B3C", marginBottom: 12 }}>
                  ✅ Rateio salvo. Use &quot;Regenerar&quot; para aplicar às CPs existentes.
                </div>
              )}
              <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
                <button style={btnR} onClick={() => setModalConsor(false)}>Cancelar</button>
                {tabConsor === "dados" && (
                  <button onClick={salvarConsorcio} disabled={cSaving} style={{ ...btnV, background: cSaving ? "var(--text-muted)" : "#111111", cursor: cSaving ? "default" : "pointer" }}>
                    {cSaving ? "Salvando…" : "Salvar"}
                  </button>
                )}
                {tabConsor === "rateio" && (
                  <button onClick={salvarRateio} disabled={rateioSaving || !consorEdit} style={{ ...btnV, background: rateioSaving || !consorEdit ? "var(--text-muted)" : "#111111", cursor: rateioSaving || !consorEdit ? "default" : "pointer" }}>
                    {rateioSaving ? "Salvando…" : "Salvar Rateio"}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════
          MODAL CONTEMPLAÇÃO
      ══════════════════════════════════════════════════════ */}
      {modalContempl && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex:2000 }}>
          <div style={{ background: "var(--bg-card)", borderRadius: 14, width: "100%", maxWidth: 500, margin: "0 20px", boxShadow: "0 4px 20px rgba(11,45,80,0.10)" }}>
            <div style={{ padding: "18px 22px 14px", borderBottom: "0.5px solid var(--bg-tag)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <div style={{ fontSize: 15, fontWeight: 700, color: "var(--text-1)" }}>Registrar Contemplação</div>
                <div style={{ fontSize: 12, color: "var(--text-3)", marginTop: 2 }}>
                  {modalContempl.administradora} — Cota {modalContempl.numero_cota} · Crédito {fmtBRL(modalContempl.valor_credito)}
                </div>
              </div>
              <button onClick={() => setModalContempl(null)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 20, color: "var(--text-3)" }}>×</button>
            </div>
            <div style={{ padding: "20px 22px", display: "flex", flexDirection: "column", gap: 12 }}>
              {contemplErr && <div style={{ background: "#FCEBEB", border: "0.5px solid #F5C6C6", borderRadius: 8, padding: "10px 14px", fontSize: 13, color: "#791F1F" }}>{contemplErr}</div>}

              <div>
                <label style={lbl}>Data de Contemplação</label>
                <input type="date" value={contemplForm.data_contemplacao} onChange={e => setContemplForm(f => ({ ...f, data_contemplacao: e.target.value }))} style={inp} />
              </div>
              <div>
                <label style={lbl}>Valor do Lance (R$) — se contemplado por lance</label>
                <InputMonetario style={inp} value={contemplForm.valor_lance} onChange={v => setContemplForm(f => ({ ...f, valor_lance: v }))} placeholder="0,00 se contemplado por sorteio" />
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
                <div style={{ background: "#E8E8E8", borderRadius: 8, padding: "10px 14px", fontSize: 12, color: "#0D0D0D" }}>
                  Será criado um financiamento com saldo de {fmtBRL(modalContempl.valor_credito - (contemplForm.valor_lance || 0))}. As parcelas remanescentes continuarão sendo controladas aqui.
                </div>
              )}
            </div>
            <div style={{ padding: "14px 22px 18px", borderTop: "0.5px solid var(--bg-tag)", display: "flex", justifyContent: "flex-end", gap: 10 }}>
              <button style={btnR} onClick={() => setModalContempl(null)}>Cancelar</button>
              <button onClick={confirmarContemplacao} disabled={contemplSaving} style={{ ...btnV, background: contemplSaving ? "var(--text-muted)" : "#16A34A", cursor: contemplSaving ? "default" : "pointer" }}>
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
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex:2000 }}>
          <div style={{ background: "var(--bg-card)", borderRadius: 14, width: "100%", maxWidth: 360, margin: "0 20px", boxShadow: "0 4px 20px rgba(11,45,80,0.10)" }}>
            <div style={{ padding: "18px 22px 14px", borderBottom: "0.5px solid var(--bg-tag)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <div style={{ fontSize: 15, fontWeight: 700, color: "var(--text-1)" }}>Confirmar Pagamento</div>
                <div style={{ fontSize: 12, color: "var(--text-3)", marginTop: 2 }}>Parcela {modalParcela.numero_parcela} — {fmtBRL(modalParcela.valor)} — venc. {fmtData(modalParcela.data_vencimento)}</div>
              </div>
              <button onClick={() => setModalParcela(null)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 20, color: "var(--text-3)" }}>×</button>
            </div>
            <div style={{ padding: "20px 22px" }}>
              <label style={lbl}>Data do Pagamento</label>
              <input type="date" value={parcelaData} onChange={e => setParcelaData(e.target.value)} style={inp} />
            </div>
            <div style={{ padding: "14px 22px 18px", borderTop: "0.5px solid var(--bg-tag)", display: "flex", justifyContent: "flex-end", gap: 10 }}>
              <button style={btnR} onClick={() => setModalParcela(null)}>Cancelar</button>
              <button onClick={pagarParcela} disabled={parcelaSaving} style={{ ...btnV, background: parcelaSaving ? "var(--text-muted)" : "#111111", cursor: parcelaSaving ? "default" : "pointer" }}>
                {parcelaSaving ? "Salvando…" : "Confirmar Pagamento"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
