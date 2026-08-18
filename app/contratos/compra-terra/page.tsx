"use client";
import { useState, useEffect, useCallback } from "react";
import TopNav from "../../../components/TopNav";
import { useAuth } from "../../../components/AuthProvider";
import { supabase } from "../../../lib/supabase";

// ── Tipos ─────────────────────────────────────────────────────────────────────
type StatusCCT =
  | "negociacao"
  | "assinado"
  | "escriturado"
  | "registrado"
  | "encerrado"
  | "cancelado";

type FormaPagamento =
  | "a_vista"
  | "financiamento"
  | "parcelado_vendedor"
  | "misto";

interface Pagamento {
  id: string;
  contrato_id: string;
  data_vencimento: string;
  valor: number;
  status: "pendente" | "pago" | "atrasado";
  data_pagamento?: string | null;
  observacao?: string | null;
}

interface ContratoCT {
  id: string;
  fazenda_id: string;
  conta_id?: string | null;
  numero?: string | null;
  status: StatusCCT;
  // Imóvel
  imovel_nome: string;
  imovel_municipio?: string | null;
  imovel_uf?: string | null;
  imovel_area_total_ha?: number | null;
  imovel_area_terra_nua_ha?: number | null;
  imovel_matricula?: string | null;
  imovel_car?: string | null;
  imovel_nirf?: string | null;
  // Partes
  vendedor_id?: string | null;
  comprador_produtor_id?: string | null;
  corretor_id?: string | null;
  comissao_corretor_pct?: number | null;
  // Valor
  valor_total: number;
  valor_terra_nua?: number | null;
  valor_benfeitorias?: number | null;
  itbi_valor?: number | null;
  itbi_pago?: boolean | null;
  data_contrato?: string | null;
  data_previsao_escritura?: string | null;
  // Pagamento
  forma_pagamento?: FormaPagamento | null;
  valor_entrada?: number | null;
  data_entrada?: string | null;
  contrato_financeiro_id?: string | null;
  num_parcelas_vendedor?: number | null;
  // Cartório
  cartorio_nome?: string | null;
  escritura_numero?: string | null;
  escritura_data?: string | null;
  registro_numero?: string | null;
  registro_data?: string | null;
  custo_cartorio?: number | null;
  // Extra
  observacoes?: string | null;
  created_at: string;
  // joins
  vendedor?: { id: string; nome: string } | null;
  corretor?: { id: string; nome: string } | null;
  comprador?: { id: string; nome: string } | null;
  contrato_financeiro?: { id: string; descricao: string; credor: string } | null;
}

// ── Constantes ─────────────────────────────────────────────────────────────────
const STATUS_META: Record<StatusCCT, { label: string; bg: string; cl: string; ordem: number }> = {
  negociacao: { label: "Negociação",  bg: "#E6F1FB", cl: "#0C447C", ordem: 1 },
  assinado:   { label: "Assinado",   bg: "#FBF3E0", cl: "#7A5A12", ordem: 2 },
  escriturado:{ label: "Escriturado",bg: "#EDE9FB", cl: "#4B3B9B", ordem: 3 },
  registrado: { label: "Registrado", bg: "#E8F5EB", cl: "#1A5C35", ordem: 4 },
  encerrado:  { label: "Encerrado",  bg: "#F1EFE8", cl: "#555",    ordem: 5 },
  cancelado:  { label: "Cancelado",  bg: "#FCEBEB", cl: "#791F1F", ordem: 6 },
};

const FORMA_META: Record<FormaPagamento, string> = {
  a_vista:            "À Vista",
  financiamento:      "Financiamento Bancário",
  parcelado_vendedor: "Parcelado ao Vendedor",
  misto:              "Misto (Entrada + Financiamento/Parcelas)",
};

const PIPELINE: StatusCCT[] = ["negociacao", "assinado", "escriturado", "registrado", "encerrado"];

const UFS = ["AC","AL","AM","AP","BA","CE","DF","ES","GO","MA","MG","MS","MT","PA","PB","PE","PI","PR","RJ","RN","RO","RR","RS","SC","SE","SP","TO"];

const fmt = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fmtHa = (v: number | null | undefined) => v ? v.toLocaleString("pt-BR", { maximumFractionDigits: 2 }) + " ha" : "—";
const TODAY = new Date().toISOString().split("T")[0];

function displayBRL(stored: string): string {
  if (!stored) return "";
  const n = parseFloat(stored);
  if (isNaN(n)) return stored;
  return n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function parseBRLInput(typed: string): string {
  const digits = typed.replace(/\D/g, "");
  if (!digits) return "";
  return (parseInt(digits, 10) / 100).toFixed(2);
}

// ── Formulário vazio ────────────────────────────────────────────────────────────
const FORM_VAZIO = {
  numero: "",
  status: "negociacao" as StatusCCT,
  imovel_nome: "",
  imovel_municipio: "",
  imovel_uf: "MT",
  imovel_area_total_ha: "",
  imovel_area_terra_nua_ha: "",
  imovel_matricula: "",
  imovel_car: "",
  imovel_nirf: "",
  vendedor_id: "",
  comprador_produtor_id: "",
  corretor_id: "",
  comissao_corretor_pct: "",
  valor_total: "",
  valor_terra_nua: "",
  valor_benfeitorias: "",
  itbi_valor: "",
  itbi_pago: false,
  data_contrato: TODAY,
  data_previsao_escritura: "",
  forma_pagamento: "a_vista" as FormaPagamento,
  valor_entrada: "",
  data_entrada: "",
  contrato_financeiro_id: "",
  num_parcelas_vendedor: "",
  dia_vencimento_parcela: "10",
  periodicidade: "anual" as "anual" | "semestral",
  data_primeira_parcela: "",
  cartorio_nome: "",
  escritura_numero: "",
  escritura_data: "",
  registro_numero: "",
  registro_data: "",
  custo_cartorio: "",
  observacoes: "",
};

// ── Gerador de preview de parcelas ────────────────────────────────────────────
type FormParc = {
  valor_total: string;
  valor_entrada: string;
  num_parcelas_vendedor: string;
  periodicidade: "anual" | "semestral";
  data_primeira_parcela: string;
  data_contrato: string;
};

function gerarPreviewParcelas(form: FormParc): { n: number; data: string; valor: number }[] {
  const n = +form.num_parcelas_vendedor;
  if (!n || n < 1 || !form.valor_total) return [];

  const saldo = +form.valor_total - (+form.valor_entrada || 0);
  if (saldo <= 0) return [];

  const mesesEntre = form.periodicidade === "anual" ? 12 : 6;
  const valorBase = Math.floor((saldo / n) * 100) / 100; // trunca centavos
  const resto = +(saldo - valorBase * (n - 1)).toFixed(2); // última parcela absorve diferença de arredondamento

  // Data base: data_primeira_parcela ou data_contrato + 1 intervalo
  let base: Date;
  if (form.data_primeira_parcela) {
    base = new Date(form.data_primeira_parcela + "T00:00");
  } else {
    base = form.data_contrato ? new Date(form.data_contrato + "T00:00") : new Date();
    base.setMonth(base.getMonth() + mesesEntre);
  }

  return Array.from({ length: n }, (_, i) => {
    const d = new Date(base);
    d.setMonth(d.getMonth() + i * mesesEntre);
    return {
      n: i + 1,
      data: d.toISOString().split("T")[0],
      valor: i === n - 1 ? resto : valorBase,
    };
  });
}

// ── Componente principal ────────────────────────────────────────────────────────
export default function CompraTerrPage() {
  const { fazendaId, contaId } = useAuth();
  const [aba, setAba] = useState<"lista" | "pagamentos">("lista");
  const [contratos, setContratos] = useState<ContratoCT[]>([]);
  const [pagamentos, setPagamentos] = useState<Pagamento[]>([]);
  const [pessoas, setPessoas] = useState<{ id: string; nome: string }[]>([]);
  const [produtores, setProdutores] = useState<{ id: string; nome: string }[]>([]);
  const [contrFinanc, setContrFinanc] = useState<{ id: string; descricao: string; credor: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [abaModal, setAbaModal] = useState<"imovel" | "partes" | "valor" | "cartorio">("imovel");
  const [form, setForm] = useState({ ...FORM_VAZIO });
  const [editId, setEditId] = useState<string | null>(null);
  const [viewOnly, setViewOnly] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [expandido, setExpandido] = useState<string | null>(null);
  const [filtroStatus, setFiltroStatus] = useState<StatusCCT | "todos">("todos");
  const [baixando, setBaixando] = useState<string | null>(null);
  const [parcelasEditadas, setParcelasEditadas] = useState<Record<string, { data_vencimento?: string; valor?: string }>>({});
  const [salvandoParcelas, setSalvandoParcelas] = useState(false);
  const [parcelasCustom, setParcelasCustom] = useState<{ n: number; data: string; valor: string }[] | null>(null);

  const carregar = useCallback(async () => {
    if (!fazendaId) return;
    setLoading(true);
    try {
      // Resolve todas as fazendas da conta para busca multi-fazenda
      let fazIds: string[] = [fazendaId];
      if (contaId) {
        const { data: fzs } = await supabase.from("fazendas").select("id").eq("conta_id", contaId);
        if (fzs?.length) fazIds = fzs.map(f => f.id);
      }

      const [ctRes, pgRes, pesRes, prodRes, cfRes] = await Promise.all([
        supabase.from("contratos_compra_terra")
          .select(`*, vendedor:pessoas!contratos_compra_terra_vendedor_id_fkey(id,nome), corretor:pessoas!contratos_compra_terra_corretor_id_fkey(id,nome), comprador:produtores!contratos_compra_terra_comprador_produtor_id_fkey(id,nome), contrato_financeiro:contratos_financeiros(id,descricao,credor)`)
          .in("fazenda_id", fazIds)
          .order("created_at", { ascending: false }),
        supabase.from("cct_pagamentos")
          .select("*")
          .in("fazenda_id", fazIds)
          .order("data_vencimento"),
        supabase.from("pessoas").select("id, nome").in("fazenda_id", fazIds).order("nome"),
        supabase.from("produtores").select("id, nome").eq("conta_id", contaId ?? "").order("nome"),
        supabase.from("contratos_financeiros").select("id, descricao, credor").in("fazenda_id", fazIds).eq("status", "ativo").order("descricao"),
      ]);

      setContratos((ctRes.data ?? []) as ContratoCT[]);
      setPagamentos((pgRes.data ?? []) as Pagamento[]);
      setPessoas((pesRes.data ?? []) as { id: string; nome: string }[]);
      setProdutores((prodRes.data ?? []) as { id: string; nome: string }[]);
      setContrFinanc((cfRes.data ?? []) as { id: string; descricao: string; credor: string }[]);
    } finally {
      setLoading(false);
    }
  }, [fazendaId, contaId]);

  useEffect(() => { carregar(); }, [carregar]);

  // ── CRUD ─────────────────────────────────────────────────────────────────────
  const abrir = (ct?: ContratoCT, soLeitura = false) => {
    if (ct) {
      setForm({
        numero: ct.numero ?? "",
        status: ct.status,
        imovel_nome: ct.imovel_nome,
        imovel_municipio: ct.imovel_municipio ?? "",
        imovel_uf: ct.imovel_uf ?? "MT",
        imovel_area_total_ha: ct.imovel_area_total_ha?.toString() ?? "",
        imovel_area_terra_nua_ha: ct.imovel_area_terra_nua_ha?.toString() ?? "",
        imovel_matricula: ct.imovel_matricula ?? "",
        imovel_car: ct.imovel_car ?? "",
        imovel_nirf: ct.imovel_nirf ?? "",
        vendedor_id: ct.vendedor_id ?? "",
        comprador_produtor_id: ct.comprador_produtor_id ?? "",
        corretor_id: ct.corretor_id ?? "",
        comissao_corretor_pct: ct.comissao_corretor_pct?.toString() ?? "",
        valor_total: ct.valor_total?.toString() ?? "",
        valor_terra_nua: ct.valor_terra_nua?.toString() ?? "",
        valor_benfeitorias: ct.valor_benfeitorias?.toString() ?? "",
        itbi_valor: ct.itbi_valor?.toString() ?? "",
        itbi_pago: ct.itbi_pago ?? false,
        data_contrato: ct.data_contrato ?? TODAY,
        data_previsao_escritura: ct.data_previsao_escritura ?? "",
        forma_pagamento: ct.forma_pagamento ?? "a_vista",
        valor_entrada: ct.valor_entrada?.toString() ?? "",
        data_entrada: ct.data_entrada ?? "",
        contrato_financeiro_id: ct.contrato_financeiro_id ?? "",
        num_parcelas_vendedor: ct.num_parcelas_vendedor?.toString() ?? "",
        dia_vencimento_parcela: "10",
        periodicidade: "anual" as "anual" | "semestral",
        data_primeira_parcela: "",
        cartorio_nome: ct.cartorio_nome ?? "",
        escritura_numero: ct.escritura_numero ?? "",
        escritura_data: ct.escritura_data ?? "",
        registro_numero: ct.registro_numero ?? "",
        registro_data: ct.registro_data ?? "",
        custo_cartorio: ct.custo_cartorio?.toString() ?? "",
        observacoes: ct.observacoes ?? "",
      });
      setEditId(ct.id);
    } else {
      setForm({ ...FORM_VAZIO });
      setEditId(null);
    }
    setViewOnly(soLeitura);
    setAbaModal("imovel");
    setParcelasCustom(null);
    setShowModal(true);
  };

  const salvar = async () => {
    if (!fazendaId || !form.imovel_nome || !form.valor_total) return;
    setSalvando(true);
    try {
      const payload = {
        fazenda_id: fazendaId,
        conta_id: contaId,
        numero: form.numero || null,
        status: form.status,
        imovel_nome: form.imovel_nome,
        imovel_municipio: form.imovel_municipio || null,
        imovel_uf: form.imovel_uf || null,
        imovel_area_total_ha: form.imovel_area_total_ha ? +form.imovel_area_total_ha : null,
        imovel_area_terra_nua_ha: form.imovel_area_terra_nua_ha ? +form.imovel_area_terra_nua_ha : null,
        imovel_matricula: form.imovel_matricula || null,
        imovel_car: form.imovel_car || null,
        imovel_nirf: form.imovel_nirf || null,
        vendedor_id: form.vendedor_id || null,
        comprador_produtor_id: form.comprador_produtor_id || null,
        corretor_id: form.corretor_id || null,
        comissao_corretor_pct: form.comissao_corretor_pct ? +form.comissao_corretor_pct : null,
        valor_total: +form.valor_total,
        valor_terra_nua: form.valor_terra_nua ? +form.valor_terra_nua : null,
        valor_benfeitorias: form.valor_benfeitorias ? +form.valor_benfeitorias : null,
        itbi_valor: form.itbi_valor ? +form.itbi_valor : null,
        itbi_pago: form.itbi_pago,
        data_contrato: form.data_contrato || null,
        data_previsao_escritura: form.data_previsao_escritura || null,
        forma_pagamento: form.forma_pagamento || null,
        valor_entrada: form.valor_entrada ? +form.valor_entrada : null,
        data_entrada: form.data_entrada || null,
        contrato_financeiro_id: form.contrato_financeiro_id || null,
        num_parcelas_vendedor: form.num_parcelas_vendedor ? +form.num_parcelas_vendedor : null,
        cartorio_nome: form.cartorio_nome || null,
        escritura_numero: form.escritura_numero || null,
        escritura_data: form.escritura_data || null,
        registro_numero: form.registro_numero || null,
        registro_data: form.registro_data || null,
        custo_cartorio: form.custo_cartorio ? +form.custo_cartorio : null,
        observacoes: form.observacoes || null,
      };

      let contratoId = editId;
      if (editId) {
        await supabase.from("contratos_compra_terra").update(payload).eq("id", editId);
      } else {
        const { data } = await supabase.from("contratos_compra_terra").insert(payload).select("id").single();
        contratoId = data?.id ?? null;
      }

      // Gera parcelas ao vendedor quando necessário
      const precisaParcelas =
        contratoId &&
        !editId &&
        (form.forma_pagamento === "parcelado_vendedor" || form.forma_pagamento === "misto") &&
        form.num_parcelas_vendedor &&
        +form.num_parcelas_vendedor > 0;

      if (precisaParcelas && contratoId) {
        const fonte = parcelasCustom
          ? parcelasCustom.map(p => ({ data: p.data, valor: parseFloat(p.valor) || 0 }))
          : gerarPreviewParcelas(form);
        const rows = fonte.map(p => ({
          contrato_id: contratoId,
          fazenda_id: fazendaId,
          data_vencimento: p.data,
          valor: p.valor,
          status: "pendente" as const,
        }));
        await supabase.from("cct_pagamentos").insert(rows);
      }

      setShowModal(false);
      carregar();
    } finally {
      setSalvando(false);
    }
  };

  const avancarStatus = async (ct: ContratoCT) => {
    const prox = PIPELINE[PIPELINE.indexOf(ct.status) + 1];
    if (!prox) return;
    await supabase.from("contratos_compra_terra").update({ status: prox }).eq("id", ct.id);
    carregar();
  };

  const excluirContrato = async (ct: ContratoCT) => {
    if (!confirm(`Excluir o contrato "${ct.imovel_nome}"?\n\nTodos os pagamentos vinculados serão excluídos. Essa ação não pode ser desfeita.`)) return;
    await supabase.from("cct_pagamentos").delete().eq("contrato_id", ct.id);
    await supabase.from("contratos_compra_terra").delete().eq("id", ct.id);
    setContratos(p => p.filter(x => x.id !== ct.id));
    setPagamentos(p => p.filter(x => x.contrato_id !== ct.id));
    setExpandido(null);
  };

  const editarPagamento = (id: string, campo: "data_vencimento" | "valor", valor: string) => {
    setParcelasEditadas(prev => ({ ...prev, [id]: { ...prev[id], [campo]: valor } }));
  };

  const salvarAjustesPagamentos = async () => {
    const ids = Object.keys(parcelasEditadas);
    if (ids.length === 0) return;
    setSalvandoParcelas(true);
    try {
      await Promise.all(ids.map(id => {
        const ed = parcelasEditadas[id];
        const upd: Record<string, unknown> = {};
        if (ed.data_vencimento) upd.data_vencimento = ed.data_vencimento;
        if (ed.valor !== undefined) upd.valor = parseFloat(ed.valor) || 0;
        return supabase.from("cct_pagamentos").update(upd).eq("id", id);
      }));
      setParcelasEditadas({});
      carregar();
    } finally {
      setSalvandoParcelas(false);
    }
  };

  const baixarPagamento = async (pg: Pagamento) => {
    if (baixando) return;
    const dataStr = prompt("Data do pagamento (AAAA-MM-DD):", TODAY);
    if (!dataStr) return;
    setBaixando(pg.id);
    await supabase.from("cct_pagamentos").update({ status: "pago", data_pagamento: dataStr }).eq("id", pg.id);
    setBaixando(null);
    carregar();
  };

  // ── Dados derivados ─────────────────────────────────────────────────────────
  const filtrados = filtroStatus === "todos" ? contratos : contratos.filter(c => c.status === filtroStatus);
  const areaTotal = contratos.filter(c => c.status !== "cancelado").reduce((s, c) => s + (c.imovel_area_total_ha ?? 0), 0);
  const valorTotal = contratos.filter(c => c.status !== "cancelado").reduce((s, c) => s + (c.valor_total ?? 0), 0);
  const pendentesCartorio = contratos.filter(c => c.status === "assinado" || c.status === "escriturado").length;
  const pgPendentes = pagamentos.filter(p => p.status !== "pago");
  const pgAtrasados = pagamentos.filter(p => p.status !== "pago" && p.data_vencimento < TODAY);

  const inp: React.CSSProperties = { width: "100%", padding: "7px 10px", border: "0.5px solid #DDE2EE", borderRadius: 6, fontSize: 13, boxSizing: "border-box" as const, background: "var(--bg-card)" };
  const lbl: React.CSSProperties = { display: "block", fontSize: 11, fontWeight: 600, color: "#555", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.04em" };
  const g3: React.CSSProperties = { display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14 };
  const g2: React.CSSProperties = { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 };

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div style={{ minHeight: "100vh", background: "#F4F6FA" }}>
      <TopNav />
      <div style={{ maxWidth: 1200, margin: "0 auto", padding: "24px 20px" }}>

        {/* Cabeçalho */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
          <div>
            <h1 style={{ fontSize: 20, fontWeight: 700, color: "#1A4870", margin: 0 }}>Compra de Terra</h1>
            <p style={{ fontSize: 13, color: "#666", margin: "4px 0 0" }}>Contratos de aquisição de imóveis rurais</p>
          </div>
          <button
            onClick={() => abrir()}
            style={{ background: "#1A4870", color: "#fff", border: "none", borderRadius: 8, padding: "9px 18px", fontSize: 13, fontWeight: 600, cursor: "pointer" }}
          >
            + Novo Contrato
          </button>
        </div>

        {/* KPI cards */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14, marginBottom: 24 }}>
          {[
            { label: "Área Total Adquirida", value: fmtHa(areaTotal), sub: "imóveis ativos", cl: "#1A4870" },
            { label: "Valor Total Contratado", value: fmt(valorTotal), sub: `${contratos.filter(c => c.status !== "cancelado").length} contratos`, cl: "#1A4870" },
            { label: "Pendentes de Cartório", value: String(pendentesCartorio), sub: "escritura ou registro", cl: pendentesCartorio > 0 ? "#C9921B" : "#16A34A" },
            { label: "Parcelas em Aberto", value: String(pgPendentes.length), sub: pgAtrasados.length > 0 ? `${pgAtrasados.length} atrasadas` : "tudo em dia", cl: pgAtrasados.length > 0 ? "#E24B4A" : "#16A34A" },
          ].map(k => (
            <div key={k.label} style={{ background: "#fff", borderRadius: 10, padding: "16px 18px", border: "0.5px solid #DDE2EE" }}>
              <div style={{ fontSize: 11, color: "#888", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6 }}>{k.label}</div>
              <div style={{ fontSize: 22, fontWeight: 700, color: k.cl }}>{k.value}</div>
              <div style={{ fontSize: 11, color: "#999", marginTop: 4 }}>{k.sub}</div>
            </div>
          ))}
        </div>

        {/* Abas */}
        <div style={{ display: "flex", gap: 6, marginBottom: 18 }}>
          {(["lista", "pagamentos"] as const).map(a => (
            <button key={a} onClick={() => setAba(a)} style={{ padding: "7px 16px", borderRadius: 6, border: "0.5px solid #DDE2EE", background: aba === a ? "#1A4870" : "#fff", color: aba === a ? "#fff" : "#555", fontSize: 13, fontWeight: aba === a ? 600 : 400, cursor: "pointer" }}>
              {a === "lista" ? "Contratos" : `Pagamentos${pgPendentes.length ? ` (${pgPendentes.length})` : ""}`}
            </button>
          ))}
        </div>

        {/* ── ABA LISTA ── */}
        {aba === "lista" && (
          <div style={{ background: "#fff", borderRadius: 12, border: "0.5px solid #DDE2EE", overflow: "hidden" }}>
            {/* Filtros */}
            <div style={{ padding: "14px 18px", borderBottom: "0.5px solid #DDE2EE", display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button onClick={() => setFiltroStatus("todos")} style={{ padding: "5px 13px", borderRadius: 20, border: "0.5px solid #DDE2EE", background: filtroStatus === "todos" ? "#1A4870" : "#fff", color: filtroStatus === "todos" ? "#fff" : "#555", fontSize: 12, cursor: "pointer" }}>
                Todos ({contratos.length})
              </button>
              {(Object.keys(STATUS_META) as StatusCCT[]).map(s => {
                const qt = contratos.filter(c => c.status === s).length;
                if (!qt) return null;
                const m = STATUS_META[s];
                return (
                  <button key={s} onClick={() => setFiltroStatus(s)} style={{ padding: "5px 13px", borderRadius: 20, border: `0.5px solid ${m.cl}44`, background: filtroStatus === s ? m.cl : m.bg, color: filtroStatus === s ? "#fff" : m.cl, fontSize: 12, cursor: "pointer" }}>
                    {m.label} ({qt})
                  </button>
                );
              })}
            </div>

            {loading ? (
              <div style={{ padding: 40, textAlign: "center", color: "#888" }}>Carregando…</div>
            ) : filtrados.length === 0 ? (
              <div style={{ padding: 48, textAlign: "center", color: "#aaa" }}>
                <div style={{ fontSize: 36, marginBottom: 12 }}>🌾</div>
                <div>Nenhum contrato cadastrado</div>
                <button onClick={() => abrir()} style={{ marginTop: 16, background: "#1A4870", color: "#fff", border: "none", borderRadius: 8, padding: "9px 18px", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>+ Novo Contrato</button>
              </div>
            ) : (
              <div>
                {filtrados.map(ct => {
                  const sm = STATUS_META[ct.status];
                  const pgCt = pagamentos.filter(p => p.contrato_id === ct.id);
                  const pgPagos = pgCt.filter(p => p.status === "pago").length;
                  const pgAtras = pgCt.filter(p => p.status !== "pago" && p.data_vencimento < TODAY).length;
                  const exp = expandido === ct.id;
                  const pipeIdx = PIPELINE.indexOf(ct.status);
                  const podAvancar = pipeIdx >= 0 && pipeIdx < PIPELINE.length - 1;

                  return (
                    <div key={ct.id} style={{ borderBottom: "0.5px solid #DDE2EE" }}>
                      {/* Linha principal */}
                      <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 18px", cursor: "pointer" }} onClick={() => setExpandido(exp ? null : ct.id)}>
                        <div style={{ flex: "0 0 auto" }}>
                          <div style={{ fontSize: 13, fontWeight: 700, color: "#1a1a1a" }}>{ct.imovel_nome}</div>
                          <div style={{ fontSize: 11, color: "#888", marginTop: 2 }}>
                            {ct.imovel_municipio && ct.imovel_uf ? `${ct.imovel_municipio} – ${ct.imovel_uf}` : ""}
                            {ct.imovel_area_total_ha ? ` · ${fmtHa(ct.imovel_area_total_ha)}` : ""}
                          </div>
                        </div>
                        <div style={{ flex: 1 }} />
                        {ct.vendedor && <div style={{ fontSize: 12, color: "#555", textAlign: "right" }}><div style={{ fontSize: 10, color: "#888" }}>Vendedor</div>{ct.vendedor.nome}</div>}
                        <div style={{ textAlign: "right" }}>
                          <div style={{ fontSize: 10, color: "#888" }}>Valor</div>
                          <div style={{ fontSize: 14, fontWeight: 700, color: "#1A4870", fontVariantNumeric: "tabular-nums" }}>{fmt(ct.valor_total)}</div>
                        </div>
                        <div>
                          <span style={{ padding: "3px 10px", borderRadius: 12, background: sm.bg, color: sm.cl, fontSize: 11, fontWeight: 600 }}>{sm.label}</span>
                        </div>
                        {pgAtras > 0 && <span style={{ padding: "2px 8px", borderRadius: 10, background: "#FCEBEB", color: "#E24B4A", fontSize: 11, fontWeight: 600 }}>{pgAtras} atrasada{pgAtras > 1 ? "s" : ""}</span>}
                        <div style={{ color: "#aaa", fontSize: 12 }}>{exp ? "▲" : "▼"}</div>
                      </div>

                      {/* Expansão */}
                      {exp && (
                        <div style={{ padding: "0 18px 18px", background: "#FAFBFC" }}>
                          {/* Pipeline */}
                          <div style={{ display: "flex", gap: 0, marginBottom: 18, marginTop: 4 }}>
                            {PIPELINE.map((s, i) => {
                              const ativo = s === ct.status;
                              const passado = PIPELINE.indexOf(ct.status) > i;
                              const m = STATUS_META[s];
                              return (
                                <div key={s} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", position: "relative" }}>
                                  {i > 0 && <div style={{ position: "absolute", left: 0, top: 11, width: "50%", height: 2, background: passado || ativo ? "#1A4870" : "#DDE2EE" }} />}
                                  {i < PIPELINE.length - 1 && <div style={{ position: "absolute", right: 0, top: 11, width: "50%", height: 2, background: passado ? "#1A4870" : "#DDE2EE" }} />}
                                  <div style={{ width: 24, height: 24, borderRadius: "50%", background: ativo ? "#1A4870" : passado ? "#1A4870" : "#DDE2EE", display: "flex", alignItems: "center", justifyContent: "center", position: "relative", zIndex: 1 }}>
                                    {passado ? <span style={{ color: "#fff", fontSize: 12 }}>✓</span> : <span style={{ width: 8, height: 8, borderRadius: "50%", background: ativo ? "#fff" : "#aaa", display: "block" }} />}
                                  </div>
                                  <div style={{ fontSize: 10, marginTop: 4, color: ativo ? "#1A4870" : passado ? "#555" : "#aaa", fontWeight: ativo ? 600 : 400 }}>{m.label}</div>
                                </div>
                              );
                            })}
                          </div>

                          {/* Detalhes em grade */}
                          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 12, marginBottom: 16 }}>
                            <div><div style={{ ...lbl }}>Matrícula</div><div style={{ fontSize: 13 }}>{ct.imovel_matricula || "—"}</div></div>
                            <div><div style={{ ...lbl }}>CAR</div><div style={{ fontSize: 13 }}>{ct.imovel_car || "—"}</div></div>
                            <div><div style={{ ...lbl }}>NIRF</div><div style={{ fontSize: 13 }}>{ct.imovel_nirf || "—"}</div></div>
                            <div><div style={{ ...lbl }}>Data Contrato</div><div style={{ fontSize: 13 }}>{ct.data_contrato ? new Date(ct.data_contrato + "T00:00").toLocaleDateString("pt-BR") : "—"}</div></div>
                            <div><div style={{ ...lbl }}>Forma Pagamento</div><div style={{ fontSize: 13 }}>{ct.forma_pagamento ? FORMA_META[ct.forma_pagamento] : "—"}</div></div>
                            <div><div style={{ ...lbl }}>Entrada</div><div style={{ fontSize: 13 }}>{ct.valor_entrada ? fmt(ct.valor_entrada) : "—"}</div></div>
                            <div><div style={{ ...lbl }}>ITBI</div><div style={{ fontSize: 13 }}>{ct.itbi_valor ? fmt(ct.itbi_valor) : "—"} {ct.itbi_pago ? <span style={{ color: "#16A34A", fontSize: 11 }}>✓ Pago</span> : ct.itbi_valor ? <span style={{ color: "#C9921B", fontSize: 11 }}>Pendente</span> : null}</div></div>
                            <div><div style={{ ...lbl }}>Custo Cartório</div><div style={{ fontSize: 13 }}>{ct.custo_cartorio ? fmt(ct.custo_cartorio) : "—"}</div></div>
                            {ct.escritura_numero && <div><div style={{ ...lbl }}>Escritura</div><div style={{ fontSize: 13 }}>Nº {ct.escritura_numero}{ct.escritura_data ? ` — ${new Date(ct.escritura_data + "T00:00").toLocaleDateString("pt-BR")}` : ""}</div></div>}
                            {ct.registro_numero && <div><div style={{ ...lbl }}>Registro</div><div style={{ fontSize: 13 }}>Nº {ct.registro_numero}{ct.registro_data ? ` — ${new Date(ct.registro_data + "T00:00").toLocaleDateString("pt-BR")}` : ""}</div></div>}
                            {ct.corretor && <div><div style={{ ...lbl }}>Corretor</div><div style={{ fontSize: 13 }}>{ct.corretor.nome}{ct.comissao_corretor_pct ? ` (${ct.comissao_corretor_pct}%)` : ""}</div></div>}
                            {ct.contrato_financeiro && <div><div style={{ ...lbl }}>Financiamento</div><div style={{ fontSize: 13 }}>{ct.contrato_financeiro.descricao} – {ct.contrato_financeiro.credor}</div></div>}
                          </div>

                          {/* Parcelas resumo */}
                          {pgCt.length > 0 && (
                            <div style={{ background: "#fff", borderRadius: 8, padding: "10px 14px", border: "0.5px solid #DDE2EE", marginBottom: 14 }}>
                              <div style={{ fontSize: 12, fontWeight: 600, color: "#555", marginBottom: 8 }}>PARCELAS AO VENDEDOR</div>
                              <div style={{ display: "flex", gap: 20 }}>
                                <div><span style={{ fontSize: 11, color: "#888" }}>Total: </span><span style={{ fontSize: 13, fontWeight: 600 }}>{pgCt.length}</span></div>
                                <div><span style={{ fontSize: 11, color: "#16A34A" }}>Pagas: {pgPagos}</span></div>
                                {pgAtras > 0 && <div><span style={{ fontSize: 11, color: "#E24B4A" }}>Atrasadas: {pgAtras}</span></div>}
                                <div><span style={{ fontSize: 11, color: "#888" }}>Pendentes: {pgCt.filter(p => p.status !== "pago").length}</span></div>
                              </div>
                            </div>
                          )}

                          {/* Observações */}
                          {ct.observacoes && <div style={{ fontSize: 12, color: "#666", marginBottom: 14, padding: "8px 12px", background: "#fff", borderRadius: 6, border: "0.5px solid #DDE2EE" }}>{ct.observacoes}</div>}

                          {/* Ações */}
                          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                            <button onClick={() => abrir(ct, true)} style={{ padding: "7px 14px", borderRadius: 6, border: "0.5px solid #DDE2EE", background: "#fff", fontSize: 12, cursor: "pointer", color: "#555" }}>Abrir</button>
                            <button onClick={() => abrir(ct, false)} style={{ padding: "7px 14px", borderRadius: 6, border: "0.5px solid #1A4870", background: "#fff", fontSize: 12, cursor: "pointer", color: "#1A4870" }}>✏ Editar</button>
                            {podAvancar && ct.status !== "cancelado" && (
                              <button onClick={() => avancarStatus(ct)} style={{ padding: "7px 14px", borderRadius: 6, border: "none", background: "#1A4870", color: "#fff", fontSize: 12, cursor: "pointer", fontWeight: 600 }}>
                                Avançar para {STATUS_META[PIPELINE[pipeIdx + 1]].label} →
                              </button>
                            )}
                            <div style={{ flex: 1 }} />
                            <button onClick={() => excluirContrato(ct)} style={{ padding: "7px 14px", borderRadius: 6, border: "0.5px solid #E24B4A", background: "#FCEBEB", fontSize: 12, cursor: "pointer", color: "#E24B4A", fontWeight: 600 }}>🗑 Excluir</button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ── ABA PAGAMENTOS ── */}
        {aba === "pagamentos" && (
          <div style={{ background: "#fff", borderRadius: 12, border: "0.5px solid #DDE2EE", overflow: "hidden" }}>
            <div style={{ padding: "12px 18px", borderBottom: "0.5px solid #DDE2EE", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: "#1A4870" }}>Parcelas Diretas ao Vendedor</div>
              {Object.keys(parcelasEditadas).length > 0 && (
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ fontSize: 12, color: "#7A4300" }}>✏ Ajustes não salvos</span>
                  <button onClick={salvarAjustesPagamentos} disabled={salvandoParcelas} style={{ padding: "5px 14px", borderRadius: 6, border: "none", background: "#C9921B", color: "#fff", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
                    {salvandoParcelas ? "Salvando…" : "Salvar ajustes"}
                  </button>
                </div>
              )}
            </div>
            {pagamentos.length === 0 ? (
              <div style={{ padding: 40, textAlign: "center", color: "#aaa" }}>Nenhuma parcela registrada</div>
            ) : (
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr style={{ background: "#F4F6FA" }}>
                    {["Imóvel", "Vencimento ✏", "Valor ✏", "Status", "Pago em", ""].map((h, i) => (
                      <th key={i} style={{ padding: "9px 14px", fontWeight: 600, fontSize: 11, color: i === 1 || i === 2 ? "#C9921B" : "#888", textAlign: "left", textTransform: "uppercase", letterSpacing: "0.04em" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {pagamentos.map((pg, i) => {
                    const ct = contratos.find(c => c.id === pg.contrato_id);
                    const atrasado = pg.status !== "pago" && pg.data_vencimento < TODAY;
                    const stBg = pg.status === "pago" ? "#E8F5EB" : atrasado ? "#FCEBEB" : "#FBF3E0";
                    const stCl = pg.status === "pago" ? "#16A34A" : atrasado ? "#E24B4A" : "#C9921B";
                    const stLabel = pg.status === "pago" ? "Pago" : atrasado ? "Atrasado" : "Pendente";
                    const ed = parcelasEditadas[pg.id];
                    const dataEditada = !!ed?.data_vencimento;
                    const valorEditado = ed?.valor !== undefined;
                    const inpBase: React.CSSProperties = { border: "0.5px solid #DDE2EE", borderRadius: 4, padding: "3px 6px", fontSize: 12, background: "transparent", width: "100%" };
                    const inpEdit: React.CSSProperties = { ...inpBase, background: "#FBF3E0", border: "0.5px solid #C9921B", fontWeight: 600 };
                    return (
                      <tr key={pg.id} style={{ background: pg.status === "pago" ? "#F0FDF4" : i % 2 === 0 ? "#fff" : "#FAFBFC", borderBottom: "0.5px solid #DDE2EE" }}>
                        <td style={{ padding: "7px 14px" }}>{ct?.imovel_nome ?? "—"}</td>
                        <td style={{ padding: "4px 10px", minWidth: 140 }}>
                          <input
                            type="date"
                            value={ed?.data_vencimento ?? pg.data_vencimento}
                            onChange={e => editarPagamento(pg.id, "data_vencimento", e.target.value)}
                            style={dataEditada ? inpEdit : inpBase}
                          />
                        </td>
                        <td style={{ padding: "4px 10px", minWidth: 120 }}>
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            value={valorEditado ? ed!.valor! : pg.valor}
                            onChange={e => editarPagamento(pg.id, "valor", e.target.value)}
                            style={{ ...(valorEditado ? inpEdit : inpBase), textAlign: "right" }}
                          />
                        </td>
                        <td style={{ padding: "7px 14px" }}>
                          <span style={{ padding: "2px 8px", borderRadius: 10, background: stBg, color: stCl, fontSize: 11, fontWeight: 600 }}>{stLabel}</span>
                        </td>
                        <td style={{ padding: "7px 14px", color: "#888", fontSize: 12 }}>{pg.data_pagamento ? new Date(pg.data_pagamento + "T00:00").toLocaleDateString("pt-BR") : "—"}</td>
                        <td style={{ padding: "7px 14px" }}>
                          {pg.status !== "pago" && (
                            <button onClick={() => baixarPagamento(pg)} disabled={baixando === pg.id} style={{ padding: "4px 12px", borderRadius: 6, border: "0.5px solid #16A34A", background: "#fff", color: "#16A34A", fontSize: 12, cursor: "pointer" }}>
                              {baixando === pg.id ? "…" : "Baixar"}
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>

      {/* ── MODAL ── */}
      {showModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 20 }}>
          <div style={{ background: "#fff", borderRadius: 14, width: "100%", maxWidth: 860, maxHeight: "90vh", overflow: "hidden", display: "flex", flexDirection: "column" }}>
            {/* Header modal */}
            <div style={{ padding: "18px 24px", borderBottom: "0.5px solid #DDE2EE", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 16, color: "#1A4870" }}>{viewOnly ? "Contrato de Compra" : editId ? "Editar Contrato" : "Novo Contrato de Compra de Terra"}</div>
                {editId && <div style={{ fontSize: 12, color: "#888", marginTop: 2 }}>{form.imovel_nome}</div>}
              </div>
              <button onClick={() => setShowModal(false)} style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer", color: "#888", lineHeight: 1 }}>×</button>
            </div>

            {/* Abas modal */}
            <div style={{ display: "flex", borderBottom: "0.5px solid #DDE2EE", padding: "0 24px" }}>
              {(["imovel", "partes", "valor", "cartorio"] as const).map(a => {
                const labels = { imovel: "Imóvel", partes: "Partes", valor: "Valor & Pagamento", cartorio: "Cartório" };
                return (
                  <button key={a} onClick={() => setAbaModal(a)} style={{ padding: "10px 18px", border: "none", borderBottom: abaModal === a ? "2px solid #1A4870" : "2px solid transparent", background: "none", fontSize: 13, fontWeight: abaModal === a ? 600 : 400, color: abaModal === a ? "#1A4870" : "#888", cursor: "pointer" }}>
                    {labels[a]}
                  </button>
                );
              })}
            </div>

            {/* Corpo modal */}
            <div style={{ flex: 1, overflow: "auto", padding: "20px 24px" }}>

              {/* ── ABA IMÓVEL ── */}
              {abaModal === "imovel" && (
                <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                  <div style={g2}>
                    <div>
                      <label style={lbl}>Nome / Identificação do Imóvel *</label>
                      <input style={inp} value={form.imovel_nome} disabled={viewOnly} onChange={e => setForm(p => ({ ...p, imovel_nome: e.target.value }))} placeholder="Ex: Fazenda Boa Vista — Gleba Norte" />
                    </div>
                    <div>
                      <label style={lbl}>Nº do Contrato (interno)</label>
                      <input style={inp} value={form.numero} disabled={viewOnly} onChange={e => setForm(p => ({ ...p, numero: e.target.value }))} placeholder="Ex: CCT-001/2026" />
                    </div>
                  </div>
                  <div style={g3}>
                    <div>
                      <label style={lbl}>Município</label>
                      <input style={inp} value={form.imovel_municipio} disabled={viewOnly} onChange={e => setForm(p => ({ ...p, imovel_municipio: e.target.value }))} />
                    </div>
                    <div>
                      <label style={lbl}>UF</label>
                      <select style={inp} value={form.imovel_uf} disabled={viewOnly} onChange={e => setForm(p => ({ ...p, imovel_uf: e.target.value }))}>
                        {UFS.map(u => <option key={u}>{u}</option>)}
                      </select>
                    </div>
                    <div>
                      <label style={lbl}>Área Total (ha)</label>
                      <input style={inp} type="number" step="0.01" value={form.imovel_area_total_ha} disabled={viewOnly} onChange={e => setForm(p => ({ ...p, imovel_area_total_ha: e.target.value }))} />
                    </div>
                  </div>
                  <div style={g3}>
                    <div>
                      <label style={lbl}>Área Terra Nua (ha)</label>
                      <input style={inp} type="number" step="0.01" value={form.imovel_area_terra_nua_ha} disabled={viewOnly} onChange={e => setForm(p => ({ ...p, imovel_area_terra_nua_ha: e.target.value }))} />
                    </div>
                    <div>
                      <label style={lbl}>Matrícula do Imóvel</label>
                      <input style={inp} value={form.imovel_matricula} disabled={viewOnly} onChange={e => setForm(p => ({ ...p, imovel_matricula: e.target.value }))} placeholder="Nº da matrícula no CRI" />
                    </div>
                    <div>
                      <label style={lbl}>Código CAR</label>
                      <input style={inp} value={form.imovel_car} disabled={viewOnly} onChange={e => setForm(p => ({ ...p, imovel_car: e.target.value }))} />
                    </div>
                  </div>
                  <div style={{ ...g2, maxWidth: 380 }}>
                    <div>
                      <label style={lbl}>NIRF</label>
                      <input style={inp} value={form.imovel_nirf} disabled={viewOnly} onChange={e => setForm(p => ({ ...p, imovel_nirf: e.target.value }))} />
                    </div>
                    <div>
                      <label style={lbl}>Status</label>
                      <select style={inp} value={form.status} disabled={viewOnly} onChange={e => setForm(p => ({ ...p, status: e.target.value as StatusCCT }))}>
                        {(Object.keys(STATUS_META) as StatusCCT[]).map(s => <option key={s} value={s}>{STATUS_META[s].label}</option>)}
                      </select>
                    </div>
                  </div>
                </div>
              )}

              {/* ── ABA PARTES ── */}
              {abaModal === "partes" && (
                <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                  <div style={g2}>
                    <div>
                      <label style={lbl}>Vendedor (Alienante) *</label>
                      <select style={inp} value={form.vendedor_id} disabled={viewOnly} onChange={e => setForm(p => ({ ...p, vendedor_id: e.target.value }))}>
                        <option value="">— Selecionar —</option>
                        {pessoas.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
                      </select>
                    </div>
                    <div>
                      <label style={lbl}>Comprador (Produtor)</label>
                      <select style={inp} value={form.comprador_produtor_id} disabled={viewOnly} onChange={e => setForm(p => ({ ...p, comprador_produtor_id: e.target.value }))}>
                        <option value="">— Selecionar —</option>
                        {produtores.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
                      </select>
                    </div>
                  </div>
                  <div style={{ ...g2, maxWidth: 560 }}>
                    <div>
                      <label style={lbl}>Corretor / Intermediário</label>
                      <select style={inp} value={form.corretor_id} disabled={viewOnly} onChange={e => setForm(p => ({ ...p, corretor_id: e.target.value }))}>
                        <option value="">— Nenhum —</option>
                        {pessoas.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
                      </select>
                    </div>
                    <div>
                      <label style={lbl}>Comissão Corretor (%)</label>
                      <input style={inp} type="number" step="0.01" value={form.comissao_corretor_pct} disabled={viewOnly} onChange={e => setForm(p => ({ ...p, comissao_corretor_pct: e.target.value }))} placeholder="Ex: 3" />
                    </div>
                  </div>
                  {form.comissao_corretor_pct && form.valor_total && (
                    <div style={{ padding: "10px 14px", background: "#FBF3E0", borderRadius: 8, border: "0.5px solid #F0D9A0", fontSize: 13, color: "#7A5A12" }}>
                      Comissão do corretor: {fmt(+form.valor_total * +form.comissao_corretor_pct / 100)}
                    </div>
                  )}
                  <div style={{ ...g2, maxWidth: 380 }}>
                    <div>
                      <label style={lbl}>Data do Contrato</label>
                      <input style={inp} type="date" value={form.data_contrato} disabled={viewOnly} onChange={e => setForm(p => ({ ...p, data_contrato: e.target.value }))} />
                    </div>
                    <div>
                      <label style={lbl}>Previsão Escritura</label>
                      <input style={inp} type="date" value={form.data_previsao_escritura} disabled={viewOnly} onChange={e => setForm(p => ({ ...p, data_previsao_escritura: e.target.value }))} />
                    </div>
                  </div>
                </div>
              )}

              {/* ── ABA VALOR & PAGAMENTO ── */}
              {abaModal === "valor" && (
                <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                  <div style={g3}>
                    <div>
                      <label style={lbl}>Valor Total do Imóvel (R$) *</label>
                      <input style={inp} type="text" inputMode="numeric" value={displayBRL(form.valor_total)} disabled={viewOnly} onChange={e => setForm(p => ({ ...p, valor_total: parseBRLInput(e.target.value) }))} />
                    </div>
                    <div>
                      <label style={lbl}>Valor Terra Nua (R$)</label>
                      <input style={inp} type="number" step="0.01" value={form.valor_terra_nua} disabled={viewOnly} onChange={e => setForm(p => ({ ...p, valor_terra_nua: e.target.value }))} />
                    </div>
                    <div>
                      <label style={lbl}>Valor Benfeitorias (R$)</label>
                      <input style={inp} type="number" step="0.01" value={form.valor_benfeitorias} disabled={viewOnly} onChange={e => setForm(p => ({ ...p, valor_benfeitorias: e.target.value }))} />
                    </div>
                  </div>

                  <div style={{ ...g2, maxWidth: 560 }}>
                    <div>
                      <label style={lbl}>ITBI Estimado (R$)</label>
                      <input style={inp} type="number" step="0.01" value={form.itbi_valor} disabled={viewOnly} onChange={e => setForm(p => ({ ...p, itbi_valor: e.target.value }))} />
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", justifyContent: "flex-end" }}>
                      <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, cursor: "pointer", userSelect: "none" }}>
                        <input type="checkbox" checked={form.itbi_pago} disabled={viewOnly} onChange={e => setForm(p => ({ ...p, itbi_pago: e.target.checked }))} />
                        ITBI já pago
                      </label>
                    </div>
                  </div>

                  <div style={{ height: 1, background: "#DDE2EE" }} />

                  <div>
                    <label style={lbl}>Forma de Pagamento *</label>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      {(Object.keys(FORMA_META) as FormaPagamento[]).map(f => (
                        <label key={f} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, cursor: "pointer", padding: "7px 14px", borderRadius: 8, border: `0.5px solid ${form.forma_pagamento === f ? "#1A4870" : "#DDE2EE"}`, background: form.forma_pagamento === f ? "#EBF2FB" : "#fff", userSelect: "none" }}>
                          <input type="radio" name="forma" value={f} checked={form.forma_pagamento === f} disabled={viewOnly} onChange={() => setForm(p => ({ ...p, forma_pagamento: f }))} style={{ accentColor: "#1A4870" }} />
                          {FORMA_META[f]}
                        </label>
                      ))}
                    </div>
                  </div>

                  {/* Campos condicionais por forma */}
                  {(form.forma_pagamento === "misto" || form.forma_pagamento === "parcelado_vendedor" || form.forma_pagamento === "financiamento") && (
                    <div style={g2}>
                      <div>
                        <label style={lbl}>Entrada / Sinal (R$)</label>
                        <input style={inp} type="text" inputMode="numeric" value={displayBRL(form.valor_entrada)} disabled={viewOnly} onChange={e => setForm(p => ({ ...p, valor_entrada: parseBRLInput(e.target.value) }))} />
                      </div>
                      <div>
                        <label style={lbl}>Data da Entrada</label>
                        <input style={inp} type="date" value={form.data_entrada} disabled={viewOnly} onChange={e => setForm(p => ({ ...p, data_entrada: e.target.value }))} />
                      </div>
                    </div>
                  )}

                  {(form.forma_pagamento === "financiamento" || form.forma_pagamento === "misto") && (
                    <div>
                      <label style={lbl}>Contrato de Financiamento (vinculado)</label>
                      <select style={inp} value={form.contrato_financeiro_id} disabled={viewOnly} onChange={e => setForm(p => ({ ...p, contrato_financeiro_id: e.target.value }))}>
                        <option value="">— Selecionar financiamento —</option>
                        {contrFinanc.map(cf => <option key={cf.id} value={cf.id}>{cf.descricao} – {cf.credor}</option>)}
                      </select>
                    </div>
                  )}

                  {(form.forma_pagamento === "parcelado_vendedor" || (form.forma_pagamento === "misto" && !form.contrato_financeiro_id)) && (
                    <div style={{ border: "0.5px solid #DDE2EE", borderRadius: 10, overflow: "hidden" }}>
                      {/* Cabeçalho da seção */}
                      <div style={{ padding: "10px 14px", background: "#F4F6FA", borderBottom: "0.5px solid #DDE2EE", fontSize: 12, fontWeight: 600, color: "#555", textTransform: "uppercase", letterSpacing: "0.04em" }}>
                        Cronograma de Parcelas ao Vendedor
                      </div>
                      <div style={{ padding: 14, display: "flex", flexDirection: "column", gap: 14 }}>

                        {/* Periodicidade + Qtd + Data 1ª */}
                        <div style={{ display: "grid", gridTemplateColumns: "auto auto 1fr", gap: 12, alignItems: "end" }}>
                          <div>
                            <label style={lbl}>Periodicidade</label>
                            <div style={{ display: "flex", gap: 0, borderRadius: 6, overflow: "hidden", border: "0.5px solid #DDE2EE" }}>
                              {(["anual", "semestral"] as const).map(p => (
                                <button key={p} type="button" disabled={viewOnly} onClick={() => setForm(f => ({ ...f, periodicidade: p }))}
                                  style={{ padding: "7px 18px", border: "none", background: form.periodicidade === p ? "#1A4870" : "#fff", color: form.periodicidade === p ? "#fff" : "#555", fontSize: 13, fontWeight: form.periodicidade === p ? 600 : 400, cursor: viewOnly ? "default" : "pointer" }}>
                                  {p.charAt(0).toUpperCase() + p.slice(1)}
                                </button>
                              ))}
                            </div>
                          </div>
                          <div>
                            <label style={lbl}>Nº de Parcelas</label>
                            <input style={{ ...inp, width: 80 }} type="number" min="1" max="30" value={form.num_parcelas_vendedor} disabled={viewOnly}
                              onChange={e => setForm(p => ({ ...p, num_parcelas_vendedor: e.target.value }))} />
                          </div>
                          <div>
                            <label style={lbl}>Data da 1ª Parcela</label>
                            <input style={inp} type="date" value={form.data_primeira_parcela} disabled={viewOnly}
                              onChange={e => setForm(p => ({ ...p, data_primeira_parcela: e.target.value }))} />
                          </div>
                        </div>

                        {/* Grid de preview / edição de parcelas */}
                        {(() => {
                          const autoParc = gerarPreviewParcelas(form);
                          if (!autoParc.length) return (
                            <div style={{ padding: "12px 0", fontSize: 12, color: "#aaa", textAlign: "center" }}>
                              Preencha o valor total, entrada e número de parcelas para ver o cronograma.
                            </div>
                          );
                          const isCustom = parcelasCustom !== null;
                          const parcelas: Array<{ n: number; data: string; valor: number | string }> =
                            isCustom ? parcelasCustom! : autoParc;
                          const saldo = +form.valor_total - (+form.valor_entrada || 0);
                          return (
                            <div>
                              {/* Resumo + botão personalizar */}
                              <div style={{ display: "flex", gap: 16, fontSize: 12, color: "#555", marginBottom: 10, padding: "8px 12px", background: "#EBF2FB", borderRadius: 7, border: "0.5px solid #BDD5EE", alignItems: "center", flexWrap: "wrap" }}>
                                <span>Saldo a parcelar: <strong style={{ color: "#1A4870" }}>{fmt(saldo)}</strong></span>
                                <span>÷ {parcelas.length} parcelas {form.periodicidade === "anual" ? "anuais" : "semestrais"}</span>
                                {!isCustom && <span>= <strong style={{ color: "#1A4870" }}>{fmt(+(parcelas[0]?.valor || 0))}/parcela</strong></span>}
                                {!isCustom && +parcelas[parcelas.length - 1]?.valor !== +parcelas[0]?.valor && (
                                  <span style={{ color: "#888" }}>(última: {fmt(+parcelas[parcelas.length - 1].valor)})</span>
                                )}
                                {isCustom && <span style={{ color: "#C9921B", fontWeight: 600 }}>✏ Personalizado</span>}
                                {!viewOnly && (
                                  <div style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
                                    {isCustom ? (
                                      <button type="button" onClick={() => setParcelasCustom(null)}
                                        style={{ fontSize: 11, padding: "3px 10px", border: "0.5px solid #DDE2EE", borderRadius: 6, background: "#fff", color: "#555", cursor: "pointer" }}>
                                        ↺ Restaurar automático
                                      </button>
                                    ) : (
                                      <button type="button" onClick={() => setParcelasCustom(autoParc.map(p => ({ n: p.n, data: p.data, valor: p.valor.toFixed(2) })))}
                                        style={{ fontSize: 11, padding: "3px 10px", border: "0.5px solid #C9921B", borderRadius: 6, background: "#FBF3E0", color: "#7A5A12", cursor: "pointer" }}>
                                        ✏ Personalizar datas/valores
                                      </button>
                                    )}
                                  </div>
                                )}
                              </div>

                              {/* Tabela */}
                              <div style={{ maxHeight: 260, overflowY: "auto", border: "0.5px solid #DDE2EE", borderRadius: 8, overflow: "hidden" }}>
                                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                                  <thead>
                                    <tr style={{ background: "#F4F6FA", position: "sticky", top: 0 }}>
                                      <th style={{ padding: "6px 12px", textAlign: "left", fontWeight: 600, color: "#888", fontSize: 11, textTransform: "uppercase" }}>Nº</th>
                                      <th style={{ padding: "6px 12px", textAlign: "left", fontWeight: 600, color: "#888", fontSize: 11, textTransform: "uppercase" }}>Vencimento</th>
                                      <th style={{ padding: "6px 12px", textAlign: "right", fontWeight: 600, color: "#888", fontSize: 11, textTransform: "uppercase" }}>Valor (R$)</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {parcelas.map((p, i) => (
                                      <tr key={i} style={{ borderTop: "0.5px solid #DDE2EE", background: i % 2 === 0 ? "#fff" : "#FAFBFC" }}>
                                        <td style={{ padding: "6px 12px", color: "#888", fontVariantNumeric: "tabular-nums" }}>{p.n}</td>
                                        <td style={{ padding: "4px 8px", fontVariantNumeric: "tabular-nums" }}>
                                          {isCustom && !viewOnly ? (
                                            <input type="date" value={p.data}
                                              onChange={e => setParcelasCustom(prev => prev!.map((x, j) => j === i ? { ...x, data: e.target.value } : x))}
                                              style={{ border: "0.5px solid #DDE2EE", borderRadius: 5, padding: "3px 6px", fontSize: 12, background: "#FBF3E0", width: "100%" }} />
                                          ) : (
                                            new Date(p.data + "T00:00").toLocaleDateString("pt-BR")
                                          )}
                                        </td>
                                        <td style={{ padding: "4px 8px", textAlign: "right", fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>
                                          {isCustom && !viewOnly ? (
                                            <input type="text" inputMode="numeric" value={displayBRL(String(p.valor))}
                                              onChange={e => setParcelasCustom(prev => prev!.map((x, j) => j === i ? { ...x, valor: parseBRLInput(e.target.value) } : x))}
                                              style={{ border: "0.5px solid #DDE2EE", borderRadius: 5, padding: "3px 6px", fontSize: 12, width: 120, textAlign: "right", background: "#FBF3E0" }} />
                                          ) : (
                                            fmt(+p.valor)
                                          )}
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                  <tfoot>
                                    <tr style={{ background: "#F4F6FA", borderTop: "0.5px solid #DDE2EE" }}>
                                      <td colSpan={2} style={{ padding: "6px 12px", fontWeight: 600, fontSize: 12 }}>Total parcelado</td>
                                      <td style={{ padding: "6px 12px", textAlign: "right", fontWeight: 700, color: "#1A4870", fontVariantNumeric: "tabular-nums" }}>
                                        {fmt(parcelas.reduce((s, p) => s + +p.valor, 0))}
                                      </td>
                                    </tr>
                                  </tfoot>
                                </table>
                              </div>
                            </div>
                          );
                        })()}
                      </div>
                    </div>
                  )}

                  {/* Resumo */}
                  {form.valor_total && (
                    <div style={{ padding: "12px 16px", background: "#EBF2FB", borderRadius: 8, border: "0.5px solid #BDD5EE", fontSize: 13, color: "#0C447C" }}>
                      <div style={{ fontWeight: 600, marginBottom: 8 }}>Resumo Financeiro</div>
                      <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
                        <div>Valor total: <strong>{fmt(+form.valor_total)}</strong></div>
                        {form.imovel_area_total_ha && <div>Preço/ha: <strong>{fmt(+form.valor_total / +form.imovel_area_total_ha)}</strong></div>}
                        {form.valor_entrada && <div>Entrada: <strong>{fmt(+form.valor_entrada)}</strong> ({(+form.valor_entrada / +form.valor_total * 100).toFixed(1)}%)</div>}
                        {form.itbi_valor && <div>ITBI: <strong>{fmt(+form.itbi_valor)}</strong></div>}
                        {form.custo_cartorio && <div>Cartório: <strong>{fmt(+form.custo_cartorio)}</strong></div>}
                        {(+form.valor_total + (+form.itbi_valor || 0) + (+form.custo_cartorio || 0)) > +form.valor_total && (
                          <div>Custo total aquisição: <strong>{fmt(+form.valor_total + (+form.itbi_valor || 0) + (+form.custo_cartorio || 0))}</strong></div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* ── ABA CARTÓRIO ── */}
              {abaModal === "cartorio" && (
                <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                  <div>
                    <label style={lbl}>Cartório de Registro de Imóveis</label>
                    <input style={inp} value={form.cartorio_nome} disabled={viewOnly} onChange={e => setForm(p => ({ ...p, cartorio_nome: e.target.value }))} placeholder="Nome e comarca do cartório" />
                  </div>
                  <div style={{ height: 1, background: "#DDE2EE" }} />
                  <div style={{ fontSize: 12, fontWeight: 600, color: "#555", textTransform: "uppercase", letterSpacing: "0.04em" }}>Escritura Pública</div>
                  <div style={g3}>
                    <div>
                      <label style={lbl}>Nº da Escritura</label>
                      <input style={inp} value={form.escritura_numero} disabled={viewOnly} onChange={e => setForm(p => ({ ...p, escritura_numero: e.target.value }))} />
                    </div>
                    <div>
                      <label style={lbl}>Data da Escritura</label>
                      <input style={inp} type="date" value={form.escritura_data} disabled={viewOnly} onChange={e => setForm(p => ({ ...p, escritura_data: e.target.value }))} />
                    </div>
                    <div>
                      <label style={lbl}>Custo do Cartório (R$)</label>
                      <input style={inp} type="number" step="0.01" value={form.custo_cartorio} disabled={viewOnly} onChange={e => setForm(p => ({ ...p, custo_cartorio: e.target.value }))} />
                    </div>
                  </div>
                  <div style={{ height: 1, background: "#DDE2EE" }} />
                  <div style={{ fontSize: 12, fontWeight: 600, color: "#555", textTransform: "uppercase", letterSpacing: "0.04em" }}>Registro no CRI</div>
                  <div style={g2}>
                    <div>
                      <label style={lbl}>Nº do Registro</label>
                      <input style={inp} value={form.registro_numero} disabled={viewOnly} onChange={e => setForm(p => ({ ...p, registro_numero: e.target.value }))} />
                    </div>
                    <div>
                      <label style={lbl}>Data do Registro</label>
                      <input style={inp} type="date" value={form.registro_data} disabled={viewOnly} onChange={e => setForm(p => ({ ...p, registro_data: e.target.value }))} />
                    </div>
                  </div>
                  <div style={{ height: 1, background: "#DDE2EE" }} />
                  <div>
                    <label style={lbl}>Observações Gerais</label>
                    <textarea style={{ ...inp, height: 80, resize: "vertical" } as React.CSSProperties} value={form.observacoes} disabled={viewOnly} onChange={e => setForm(p => ({ ...p, observacoes: e.target.value }))} placeholder="Pendências, condicionantes, cláusulas especiais..." />
                  </div>
                </div>
              )}
            </div>

            {/* Footer modal */}
            <div style={{ padding: "14px 24px", borderTop: "0.5px solid #DDE2EE", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ display: "flex", gap: 8 }}>
                {(["imovel", "partes", "valor", "cartorio"] as const).map((a, i) => (
                  <button key={a} onClick={() => setAbaModal(a)} style={{ width: 8, height: 8, borderRadius: "50%", background: abaModal === a ? "#1A4870" : "#DDE2EE", border: "none", cursor: "pointer", padding: 0 }} />
                ))}
              </div>
              <div style={{ display: "flex", gap: 10 }}>
                <button onClick={() => setShowModal(false)} style={{ padding: "8px 18px", borderRadius: 8, border: "0.5px solid #DDE2EE", background: "#fff", fontSize: 13, cursor: "pointer", color: "#555" }}>Fechar</button>
                {!viewOnly && (
                  <button onClick={salvar} disabled={salvando || !form.imovel_nome || !form.valor_total} style={{ padding: "8px 22px", borderRadius: 8, border: "none", background: "#1A4870", color: "#fff", fontSize: 13, fontWeight: 600, cursor: salvando ? "default" : "pointer", opacity: salvando ? 0.7 : 1 }}>
                    {salvando ? "Salvando…" : editId ? "Salvar Alterações" : "Criar Contrato"}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
