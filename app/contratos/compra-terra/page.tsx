"use client";
import { useState, useEffect, useCallback } from "react";
import TopNav from "../../../components/TopNav";
import { useAuth } from "../../../components/AuthProvider";
import { supabase } from "../../../lib/supabase";

// ── Tipos ─────────────────────────────────────────────────────────────────────
type StatusCCT = "negociacao" | "assinado" | "escriturado" | "registrado" | "encerrado" | "cancelado";
type FormaPagamento = "a_vista" | "financiamento" | "parcelado_vendedor" | "misto";
type MoedaParcela = "BRL" | "saca_soja" | "saca_milho" | "saca_algodao";

interface Pagamento {
  id: string;
  contrato_id: string;
  data_vencimento: string;
  valor: number;
  status: "pendente" | "pago" | "atrasado";
  data_pagamento?: string | null;
  observacao?: string | null;
  lancamento_id?: string | null;
  moeda_parcela?: MoedaParcela | null;
  quantidade_sacas?: number | null;
  produto?: string | null;
  preco_sc_ref?: number | null;
  ano_safra_id?: string | null;
  ciclo_id?: string | null;
}

interface ContratoCT {
  id: string;
  fazenda_id: string;
  conta_id?: string | null;
  numero?: string | null;
  status: StatusCCT;
  imovel_nome: string;
  imovel_municipio?: string | null;
  imovel_uf?: string | null;
  imovel_area_total_ha?: number | null;
  imovel_area_terra_nua_ha?: number | null;
  imovel_matricula?: string | null;
  imovel_car?: string | null;
  imovel_nirf?: string | null;
  vendedor_id?: string | null;
  comprador_produtor_id?: string | null;
  corretor_id?: string | null;
  comissao_corretor_pct?: number | null;
  valor_total: number;
  valor_terra_nua?: number | null;
  valor_benfeitorias?: number | null;
  itbi_valor?: number | null;
  itbi_pago?: boolean | null;
  data_contrato?: string | null;
  data_previsao_escritura?: string | null;
  forma_pagamento?: FormaPagamento | null;
  valor_entrada?: number | null;
  data_entrada?: string | null;
  contrato_financeiro_id?: string | null;
  num_parcelas_vendedor?: number | null;
  cartorio_nome?: string | null;
  escritura_numero?: string | null;
  escritura_data?: string | null;
  registro_numero?: string | null;
  registro_data?: string | null;
  custo_cartorio?: number | null;
  observacoes?: string | null;
  created_at: string;
  vendedor?: { id: string; nome: string } | null;
  corretor?: { id: string; nome: string } | null;
  comprador?: { id: string; nome: string } | null;
  contrato_financeiro?: { id: string; descricao: string; credor: string } | null;
}

// Cada linha na grade de parcelas (preview + customizado)
type ParcelaRow = {
  n:              number;
  data:           string;
  valor:          string;           // BRL em ponto (ex: "125000.00")
  moeda_parcela:  MoedaParcela;
  quantidade_sacas: string;         // sacas em texto (ex: "4000.0000")
  produto:        string;           // "soja" | "milho" | "algodao"
  preco_sc_ref:   string;           // R$/sc de referência
  ano_safra_id:   string;
  ciclo_id:       string;
};

// ── Constantes ────────────────────────────────────────────────────────────────
const STATUS_META: Record<StatusCCT, { label: string; bg: string; cl: string; ordem: number }> = {
  negociacao:  { label: "Negociação",  bg: "#E6F1FB", cl: "#0C447C", ordem: 1 },
  assinado:    { label: "Assinado",    bg: "#FBF3E0", cl: "#7A5A12", ordem: 2 },
  escriturado: { label: "Escriturado", bg: "#EDE9FB", cl: "#4B3B9B", ordem: 3 },
  registrado:  { label: "Registrado",  bg: "#E8F5EB", cl: "#1A5C35", ordem: 4 },
  encerrado:   { label: "Encerrado",   bg: "#F1EFE8", cl: "#555",    ordem: 5 },
  cancelado:   { label: "Cancelado",   bg: "#FCEBEB", cl: "#791F1F", ordem: 6 },
};

const FORMA_META: Record<FormaPagamento, string> = {
  a_vista:            "À Vista",
  financiamento:      "Financiamento Bancário",
  parcelado_vendedor: "Parcelado ao Vendedor",
  misto:              "Misto (Entrada + Parcelas/Financiamento)",
};

const MOEDA_META: Record<MoedaParcela, { label: string; produto: string }> = {
  BRL:          { label: "R$ (Reais)",       produto: "" },
  saca_soja:    { label: "Sacas de Soja",    produto: "soja" },
  saca_milho:   { label: "Sacas de Milho",   produto: "milho" },
  saca_algodao: { label: "Sacas de Algodão", produto: "algodao" },
};

const PIPELINE: StatusCCT[] = ["negociacao", "assinado", "escriturado", "registrado", "encerrado"];
const UFS = ["AC","AL","AM","AP","BA","CE","DF","ES","GO","MA","MG","MS","MT","PA","PB","PE","PI","PR","RJ","RN","RO","RR","RS","SC","SE","SP","TO"];

const fmt    = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fmtHa  = (v: number | null | undefined) => v ? v.toLocaleString("pt-BR", { maximumFractionDigits: 2 }) + " ha" : "—";
const fmtSc  = (v: number | null | undefined) => v ? v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " sc" : "—";
const TODAY  = new Date().toISOString().split("T")[0];

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

// ── Gerador de preview de parcelas ────────────────────────────────────────────
type FormParc = {
  valor_total: string; valor_entrada: string;
  num_parcelas_vendedor: string; periodicidade: "anual" | "semestral";
  data_primeira_parcela: string; data_contrato: string;
};

function gerarPreviewParcelas(form: FormParc, moedaPadrao: MoedaParcela, scRef: string, anoSafraId: string, cicloId: string): ParcelaRow[] {
  const n = +form.num_parcelas_vendedor;
  if (!n || n < 1 || !form.valor_total) return [];

  const saldo = +form.valor_total - (+form.valor_entrada || 0);
  if (saldo <= 0) return [];

  const mesesEntre = form.periodicidade === "anual" ? 12 : 6;
  const valorBase = Math.floor((saldo / n) * 100) / 100;
  const resto = +(saldo - valorBase * (n - 1)).toFixed(2);

  let base: Date;
  if (form.data_primeira_parcela) {
    base = new Date(form.data_primeira_parcela + "T00:00");
  } else {
    base = form.data_contrato ? new Date(form.data_contrato + "T00:00") : new Date();
    base.setMonth(base.getMonth() + mesesEntre);
  }

  const scRefNum = parseFloat(scRef) || 0;
  const produto = MOEDA_META[moedaPadrao]?.produto || "";

  return Array.from({ length: n }, (_, i) => {
    const d = new Date(base);
    d.setMonth(d.getMonth() + i * mesesEntre);
    const valorBRL = i === n - 1 ? resto : valorBase;
    const qtdSacas = moedaPadrao !== "BRL" && scRefNum > 0 ? (valorBRL / scRefNum) : 0;
    return {
      n: i + 1,
      data: d.toISOString().split("T")[0],
      valor: valorBRL.toFixed(2),
      moeda_parcela: moedaPadrao,
      quantidade_sacas: qtdSacas > 0 ? qtdSacas.toFixed(4) : "",
      produto,
      preco_sc_ref: scRef,
      ano_safra_id: anoSafraId,
      ciclo_id: cicloId,
    };
  });
}

// ── Formulário vazio ──────────────────────────────────────────────────────────
const FORM_VAZIO = {
  numero: "", status: "negociacao" as StatusCCT,
  imovel_nome: "", imovel_municipio: "", imovel_uf: "MT",
  imovel_area_total_ha: "", imovel_area_terra_nua_ha: "",
  imovel_matricula: "", imovel_car: "", imovel_nirf: "",
  vendedor_id: "", comprador_produtor_id: "", corretor_id: "",
  comissao_corretor_pct: "",
  valor_total: "", valor_terra_nua: "", valor_benfeitorias: "",
  itbi_valor: "", itbi_pago: false,
  data_contrato: TODAY, data_previsao_escritura: "",
  forma_pagamento: "a_vista" as FormaPagamento,
  valor_entrada: "", data_entrada: "",
  contrato_financeiro_id: "",
  num_parcelas_vendedor: "",
  periodicidade: "anual" as "anual" | "semestral",
  data_primeira_parcela: "",
  // moeda padrão das parcelas
  moeda_parcela_padrao: "BRL" as MoedaParcela,
  preco_sc_ref_padrao: "",
  ano_safra_id_padrao: "", ciclo_id_padrao: "",
  cartorio_nome: "", escritura_numero: "", escritura_data: "",
  registro_numero: "", registro_data: "", custo_cartorio: "",
  observacoes: "",
};

// ── Componente principal ──────────────────────────────────────────────────────
export default function CompraTerrPage() {
  const { fazendaId, contaId } = useAuth();
  const [aba, setAba] = useState<"lista" | "pagamentos">("lista");
  const [contratos, setContratos]         = useState<ContratoCT[]>([]);
  const [pagamentos, setPagamentos]       = useState<Pagamento[]>([]);
  const [pessoas, setPessoas]             = useState<{ id: string; nome: string }[]>([]);
  const [produtores, setProdutores]       = useState<{ id: string; nome: string }[]>([]);
  const [contrFinanc, setContrFinanc]     = useState<{ id: string; descricao: string; credor: string }[]>([]);
  const [anosSafra, setAnosSafra]         = useState<{ id: string; descricao: string }[]>([]);
  const [ciclos, setCiclos]               = useState<{ id: string; descricao?: string; cultura?: string; ano_safra_id?: string; preco_esperado_sc?: number | null }[]>([]);
  const [loading, setLoading]             = useState(true);
  const [showModal, setShowModal]         = useState(false);
  const [abaModal, setAbaModal]           = useState<"imovel" | "partes" | "valor" | "cartorio">("imovel");
  const [form, setForm]                   = useState({ ...FORM_VAZIO });
  const [editId, setEditId]               = useState<string | null>(null);
  const [viewOnly, setViewOnly]           = useState(false);
  const [salvando, setSalvando]           = useState(false);
  const [expandido, setExpandido]         = useState<string | null>(null);
  const [filtroStatus, setFiltroStatus]   = useState<StatusCCT | "todos">("todos");
  const [baixando, setBaixando]           = useState<string | null>(null);
  const [parcelasEditadas, setParcelasEditadas] = useState<Record<string, { data_vencimento?: string; valor?: string }>>({});
  const [salvandoParcelas, setSalvandoParcelas] = useState(false);
  const [parcelasCustom, setParcelasCustom]     = useState<ParcelaRow[] | null>(null);

  const carregar = useCallback(async () => {
    if (!fazendaId) return;
    setLoading(true);
    try {
      let fazIds: string[] = [fazendaId];
      if (contaId) {
        const { data: fzs } = await supabase.from("fazendas").select("id").eq("conta_id", contaId);
        if (fzs?.length) fazIds = fzs.map(f => f.id);
      }

      const [ctRes, pgRes, pesRes, prodRes, cfRes, asRes, cicRes] = await Promise.all([
        supabase.from("contratos_compra_terra")
          .select(`*, vendedor:pessoas!contratos_compra_terra_vendedor_id_fkey(id,nome), corretor:pessoas!contratos_compra_terra_corretor_id_fkey(id,nome), comprador:produtores!contratos_compra_terra_comprador_produtor_id_fkey(id,nome), contrato_financeiro:contratos_financeiros(id,descricao,credor)`)
          .in("fazenda_id", fazIds).order("created_at", { ascending: false }),
        supabase.from("cct_pagamentos")
          .select("*, lancamento_id, moeda_parcela, quantidade_sacas, produto, preco_sc_ref, ano_safra_id, ciclo_id")
          .in("fazenda_id", fazIds).order("data_vencimento"),
        supabase.from("pessoas").select("id, nome").in("fazenda_id", fazIds).order("nome"),
        supabase.from("produtores").select("id, nome").eq("conta_id", contaId ?? "").order("nome"),
        supabase.from("contratos_financeiros").select("id, descricao, credor").in("fazenda_id", fazIds).eq("status", "ativo").order("descricao"),
        supabase.from("anos_safra").select("id, descricao").in("fazenda_id", fazIds).order("descricao", { ascending: false }),
        supabase.from("ciclos").select("id, descricao, cultura, ano_safra_id, preco_esperado_sc").in("fazenda_id", fazIds).order("descricao"),
      ]);

      setContratos((ctRes.data ?? []) as ContratoCT[]);
      setPagamentos((pgRes.data ?? []) as Pagamento[]);
      setPessoas((pesRes.data ?? []) as { id: string; nome: string }[]);
      setProdutores((prodRes.data ?? []) as { id: string; nome: string }[]);
      setContrFinanc((cfRes.data ?? []) as { id: string; descricao: string; credor: string }[]);
      setAnosSafra((asRes.data ?? []) as { id: string; descricao: string }[]);
      setCiclos((cicRes.data ?? []) as { id: string; descricao?: string; cultura?: string; ano_safra_id?: string; preco_esperado_sc?: number | null }[]);
    } finally {
      setLoading(false);
    }
  }, [fazendaId, contaId]);

  useEffect(() => { carregar(); }, [carregar]);

  // Quando muda a safra padrão, auto-fill do preço esperado do ciclo
  useEffect(() => {
    const c = ciclos.find(x => x.id === form.ciclo_id_padrao);
    if (c?.preco_esperado_sc && !form.preco_sc_ref_padrao) {
      setForm(p => ({ ...p, preco_sc_ref_padrao: c.preco_esperado_sc!.toFixed(2) }));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.ciclo_id_padrao]);

  // ── CRUD ─────────────────────────────────────────────────────────────────────
  const abrir = (ct?: ContratoCT, soLeitura = false) => {
    if (ct) {
      setForm({
        numero: ct.numero ?? "", status: ct.status,
        imovel_nome: ct.imovel_nome, imovel_municipio: ct.imovel_municipio ?? "",
        imovel_uf: ct.imovel_uf ?? "MT",
        imovel_area_total_ha: ct.imovel_area_total_ha?.toString() ?? "",
        imovel_area_terra_nua_ha: ct.imovel_area_terra_nua_ha?.toString() ?? "",
        imovel_matricula: ct.imovel_matricula ?? "", imovel_car: ct.imovel_car ?? "",
        imovel_nirf: ct.imovel_nirf ?? "",
        vendedor_id: ct.vendedor_id ?? "", comprador_produtor_id: ct.comprador_produtor_id ?? "",
        corretor_id: ct.corretor_id ?? "", comissao_corretor_pct: ct.comissao_corretor_pct?.toString() ?? "",
        valor_total: ct.valor_total?.toString() ?? "", valor_terra_nua: ct.valor_terra_nua?.toString() ?? "",
        valor_benfeitorias: ct.valor_benfeitorias?.toString() ?? "",
        itbi_valor: ct.itbi_valor?.toString() ?? "", itbi_pago: ct.itbi_pago ?? false,
        data_contrato: ct.data_contrato ?? TODAY, data_previsao_escritura: ct.data_previsao_escritura ?? "",
        forma_pagamento: ct.forma_pagamento ?? "a_vista",
        valor_entrada: ct.valor_entrada?.toString() ?? "", data_entrada: ct.data_entrada ?? "",
        contrato_financeiro_id: ct.contrato_financeiro_id ?? "",
        num_parcelas_vendedor: ct.num_parcelas_vendedor?.toString() ?? "",
        periodicidade: "anual" as "anual" | "semestral", data_primeira_parcela: "",
        moeda_parcela_padrao: "BRL", preco_sc_ref_padrao: "",
        ano_safra_id_padrao: "", ciclo_id_padrao: "",
        cartorio_nome: ct.cartorio_nome ?? "", escritura_numero: ct.escritura_numero ?? "",
        escritura_data: ct.escritura_data ?? "", registro_numero: ct.registro_numero ?? "",
        registro_data: ct.registro_data ?? "", custo_cartorio: ct.custo_cartorio?.toString() ?? "",
        observacoes: ct.observacoes ?? "",
      });
      setEditId(ct.id);
      // Carrega parcelas existentes
      const existentes = pagamentos
        .filter(p => p.contrato_id === ct.id)
        .sort((a, b) => a.data_vencimento.localeCompare(b.data_vencimento));
      setParcelasCustom(existentes.length > 0
        ? existentes.map((p, i) => ({
            n: i + 1, data: p.data_vencimento, valor: p.valor.toFixed(2),
            moeda_parcela: (p.moeda_parcela as MoedaParcela) ?? "BRL",
            quantidade_sacas: p.quantidade_sacas?.toString() ?? "",
            produto: p.produto ?? "",
            preco_sc_ref: p.preco_sc_ref?.toString() ?? "",
            ano_safra_id: p.ano_safra_id ?? "",
            ciclo_id: p.ciclo_id ?? "",
          }))
        : null);
    } else {
      setForm({ ...FORM_VAZIO });
      setEditId(null);
      setParcelasCustom(null);
    }
    setViewOnly(soLeitura);
    setAbaModal("imovel");
    setShowModal(true);
  };

  const salvar = async () => {
    if (!fazendaId || !form.imovel_nome || !form.valor_total) return;
    setSalvando(true);
    try {
      const payload = {
        fazenda_id: fazendaId, conta_id: contaId,
        numero: form.numero || null, status: form.status,
        imovel_nome: form.imovel_nome, imovel_municipio: form.imovel_municipio || null,
        imovel_uf: form.imovel_uf || null,
        imovel_area_total_ha: form.imovel_area_total_ha ? +form.imovel_area_total_ha : null,
        imovel_area_terra_nua_ha: form.imovel_area_terra_nua_ha ? +form.imovel_area_terra_nua_ha : null,
        imovel_matricula: form.imovel_matricula || null, imovel_car: form.imovel_car || null,
        imovel_nirf: form.imovel_nirf || null,
        vendedor_id: form.vendedor_id || null, comprador_produtor_id: form.comprador_produtor_id || null,
        corretor_id: form.corretor_id || null,
        comissao_corretor_pct: form.comissao_corretor_pct ? +form.comissao_corretor_pct : null,
        valor_total: +form.valor_total,
        valor_terra_nua: form.valor_terra_nua ? +form.valor_terra_nua : null,
        valor_benfeitorias: form.valor_benfeitorias ? +form.valor_benfeitorias : null,
        itbi_valor: form.itbi_valor ? +form.itbi_valor : null, itbi_pago: form.itbi_pago,
        data_contrato: form.data_contrato || null,
        data_previsao_escritura: form.data_previsao_escritura || null,
        forma_pagamento: form.forma_pagamento || null,
        valor_entrada: form.valor_entrada ? +form.valor_entrada : null,
        data_entrada: form.data_entrada || null,
        contrato_financeiro_id: form.contrato_financeiro_id || null,
        num_parcelas_vendedor: form.num_parcelas_vendedor ? +form.num_parcelas_vendedor : null,
        cartorio_nome: form.cartorio_nome || null, escritura_numero: form.escritura_numero || null,
        escritura_data: form.escritura_data || null, registro_numero: form.registro_numero || null,
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

      // Gera/recria parcelas ao vendedor
      const precisaParcelas =
        contratoId &&
        (form.forma_pagamento === "parcelado_vendedor" || form.forma_pagamento === "misto") &&
        form.num_parcelas_vendedor && +form.num_parcelas_vendedor > 0;

      if (precisaParcelas && contratoId) {
        // Remove parcelas anteriores (via API com service_role_key)
        if (editId) {
          await fetch("/api/contratos/compra-terra/parcelas", {
            method: "DELETE",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ contrato_id: contratoId }),
          });
        }

        // Constrói array de parcelas final
        const autoParc = gerarPreviewParcelas(
          form, form.moeda_parcela_padrao, form.preco_sc_ref_padrao,
          form.ano_safra_id_padrao, form.ciclo_id_padrao,
        );
        const fonte: ParcelaRow[] = parcelasCustom ?? autoParc;
        const total = fonte.length;

        const parcelasPayload = fonte.map((p, i) => {
          const valorBRL = parseFloat(p.valor) || 0;
          const qtd = parseFloat(p.quantidade_sacas) || 0;
          return {
            num_parcela:      i + 1,
            total_parcelas:   total,
            data_vencimento:  p.data,
            valor:            valorBRL,
            moeda_parcela:    p.moeda_parcela || "BRL",
            quantidade_sacas: qtd > 0 ? qtd : null,
            produto:          p.produto || null,
            preco_sc_ref:     p.preco_sc_ref ? parseFloat(p.preco_sc_ref) : null,
            ano_safra_id:     p.ano_safra_id || null,
            ciclo_id:         p.ciclo_id     || null,
          };
        });

        const res = await fetch("/api/contratos/compra-terra/parcelas", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contrato_id:  contratoId,
            fazenda_id:   fazendaId,
            imovel_nome:  form.imovel_nome,
            produtor_id:  form.comprador_produtor_id || null,
            parcelas:     parcelasPayload,
          }),
        });
        const json = await res.json() as { ok: boolean; error?: string };
        if (!json.ok) {
          alert("Contrato salvo, mas erro ao gerar parcelas CP: " + (json.error ?? "desconhecido"));
        }
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
    if (!confirm(`Excluir o contrato "${ct.imovel_nome}"?\n\nTodos os pagamentos e lançamentos vinculados serão excluídos.`)) return;
    await fetch("/api/contratos/compra-terra/parcelas", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contrato_id: ct.id }),
    });
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
    if (!ids.length) return;
    setSalvandoParcelas(true);
    try {
      for (const id of ids) {
        const ed = parcelasEditadas[id];
        const pg = pagamentos.find(p => p.id === id);
        const upd: Record<string, unknown> = {};
        if (ed.data_vencimento) upd.data_vencimento = ed.data_vencimento;
        if (ed.valor !== undefined) upd.valor = parseFloat(ed.valor) || 0;
        if (!Object.keys(upd).length) continue;
        await supabase.from("cct_pagamentos").update(upd).eq("id", id);
        if (pg?.lancamento_id) {
          await fetch("/api/financeiro/lancamentos", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id: pg.lancamento_id, patch: upd }),
          });
        }
      }
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

    let sacasEfetivas = pg.quantidade_sacas;
    let valorPago = pg.valor;

    if (pg.moeda_parcela && pg.moeda_parcela !== "BRL") {
      const scStr = prompt(
        `Pagamento em ${MOEDA_META[pg.moeda_parcela]?.label}.\nSacas previstas: ${fmtSc(pg.quantidade_sacas)}\nSacas entregues:`,
        pg.quantidade_sacas?.toFixed(4) ?? "",
      );
      sacasEfetivas = scStr ? parseFloat(scStr) : pg.quantidade_sacas;
      // Recalcula valor BRL se mudou a quantidade
      if (sacasEfetivas && pg.preco_sc_ref) {
        valorPago = parseFloat((sacasEfetivas * pg.preco_sc_ref).toFixed(2));
      }
    }

    setBaixando(pg.id);
    try {
      await supabase.from("cct_pagamentos").update({
        status: "pago", data_pagamento: dataStr,
        quantidade_sacas: sacasEfetivas ?? pg.quantidade_sacas,
      }).eq("id", pg.id);

      if (pg.lancamento_id) {
        await fetch("/api/financeiro/lancamentos", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: pg.lancamento_id,
            patch: { status: "baixado", data_baixa: dataStr, valor_pago: valorPago },
          }),
        });
      }
    } finally {
      setBaixando(null);
      carregar();
    }
  };

  // Recalcula valor BRL quando muda sacas ou preço numa parcela custom
  const recalcularBRL = (idx: number, prev: ParcelaRow[]): ParcelaRow[] => {
    const p = prev[idx];
    if (!p || p.moeda_parcela === "BRL") return prev;
    const qtd = parseFloat(p.quantidade_sacas) || 0;
    const prc = parseFloat(p.preco_sc_ref) || 0;
    if (qtd > 0 && prc > 0) {
      const valorBRL = (qtd * prc).toFixed(2);
      return prev.map((x, i) => i === idx ? { ...x, valor: valorBRL } : x);
    }
    return prev;
  };

  // ── Dados derivados ───────────────────────────────────────────────────────
  const filtrados  = filtroStatus === "todos" ? contratos : contratos.filter(c => c.status === filtroStatus);
  const pgPendentes = pagamentos.filter(p => p.status !== "pago");
  const pgAtrasados = pagamentos.filter(p => p.status !== "pago" && p.data_vencimento < TODAY);

  const inp:  React.CSSProperties = { width: "100%", padding: "7px 10px", border: "0.5px solid #DDE2EE", borderRadius: 6, fontSize: 13, boxSizing: "border-box" as const, background: "var(--bg-card)" };
  const lbl:  React.CSSProperties = { display: "block", fontSize: 11, fontWeight: 600, color: "#555", marginBottom: 4, textTransform: "uppercase" as const, letterSpacing: "0.04em" };
  const g3:   React.CSSProperties = { display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14 };
  const g2:   React.CSSProperties = { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 };

  // Ciclos filtrados pelo ano safra padrão selecionado
  const ciclosFiltrados = form.ano_safra_id_padrao
    ? ciclos.filter(c => c.ano_safra_id === form.ano_safra_id_padrao)
    : ciclos;

  // ── Render ────────────────────────────────────────────────────────────────
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
          <button onClick={() => abrir()} style={{ background: "#1A4870", color: "#fff", border: "none", borderRadius: 8, padding: "9px 18px", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
            + Novo Contrato
          </button>
        </div>

        {/* KPI Cards */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14, marginBottom: 20 }}>
          {[
            { label: "Contratos Ativos", val: contratos.filter(c => !["cancelado","encerrado"].includes(c.status)).length.toString(), sub: `${contratos.length} total` },
            { label: "Área Adquirida", val: fmtHa(contratos.filter(c => c.status !== "cancelado").reduce((s, c) => s + (c.imovel_area_total_ha ?? 0), 0)), sub: "em imóveis ativos" },
            { label: "Valor Contratado", val: fmt(contratos.filter(c => c.status !== "cancelado").reduce((s, c) => s + (c.valor_total ?? 0), 0)), sub: "valor total" },
            { label: "Parcelas Pendentes", val: pgPendentes.length.toString(), sub: pgAtrasados.length > 0 ? `${pgAtrasados.length} atrasada(s)` : "em dia", subColor: pgAtrasados.length > 0 ? "#E24B4A" : "#16A34A" },
          ].map(k => (
            <div key={k.label} style={{ background: "#fff", borderRadius: 10, padding: "14px 18px", border: "0.5px solid #DDE2EE" }}>
              <div style={{ fontSize: 11, color: "#888", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em" }}>{k.label}</div>
              <div style={{ fontSize: 20, fontWeight: 700, color: "#1A4870", margin: "6px 0 2px", fontVariantNumeric: "tabular-nums" }}>{k.val}</div>
              <div style={{ fontSize: 11, color: k.subColor ?? "#888" }}>{k.sub}</div>
            </div>
          ))}
        </div>

        {/* Abas */}
        <div style={{ display: "flex", gap: 0, marginBottom: 16, background: "#fff", borderRadius: 10, border: "0.5px solid #DDE2EE", overflow: "hidden", width: "fit-content" }}>
          {(["lista", "pagamentos"] as const).map(a => (
            <button key={a} onClick={() => setAba(a)} style={{ padding: "9px 22px", border: "none", background: aba === a ? "#1A4870" : "transparent", color: aba === a ? "#fff" : "#555", fontSize: 13, fontWeight: aba === a ? 600 : 400, cursor: "pointer" }}>
              {a === "lista" ? "Contratos" : `Parcelas (${pagamentos.length})`}
            </button>
          ))}
        </div>

        {/* Filtros de status (aba lista) */}
        {aba === "lista" && (
          <div style={{ display: "flex", gap: 6, marginBottom: 12, flexWrap: "wrap" }}>
            {(["todos", ...Object.keys(STATUS_META)] as ("todos" | StatusCCT)[]).map(s => (
              <button key={s} onClick={() => setFiltroStatus(s)} style={{ padding: "4px 12px", borderRadius: 20, border: `0.5px solid ${filtroStatus === s ? "#1A4870" : "#DDE2EE"}`, background: filtroStatus === s ? "#1A4870" : "#fff", color: filtroStatus === s ? "#fff" : "#555", fontSize: 12, cursor: "pointer", fontWeight: filtroStatus === s ? 600 : 400 }}>
                {s === "todos" ? "Todos" : STATUS_META[s as StatusCCT].label}
              </button>
            ))}
          </div>
        )}

        {/* ── ABA LISTA ── */}
        {aba === "lista" && (
          <div style={{ background: "#fff", borderRadius: 12, border: "0.5px solid #DDE2EE", overflow: "hidden" }}>
            {loading ? (
              <div style={{ padding: 40, textAlign: "center", color: "#aaa" }}>Carregando…</div>
            ) : filtrados.length === 0 ? (
              <div style={{ padding: 40, textAlign: "center", color: "#aaa" }}>
                <div style={{ fontSize: 32, marginBottom: 10 }}>🏡</div>
                <div style={{ fontSize: 14, fontWeight: 600, color: "#555", marginBottom: 6 }}>Nenhum contrato cadastrado</div>
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
                        <span style={{ padding: "3px 10px", borderRadius: 12, background: sm.bg, color: sm.cl, fontSize: 11, fontWeight: 600 }}>{sm.label}</span>
                        {pgAtras > 0 && <span style={{ padding: "2px 8px", borderRadius: 10, background: "#FCEBEB", color: "#E24B4A", fontSize: 11, fontWeight: 600 }}>{pgAtras} atrasada{pgAtras > 1 ? "s" : ""}</span>}
                        <div style={{ color: "#aaa", fontSize: 12 }}>{exp ? "▲" : "▼"}</div>
                      </div>

                      {exp && (
                        <div style={{ padding: "0 18px 18px", background: "#FAFBFC" }}>
                          {/* Pipeline */}
                          <div style={{ display: "flex", gap: 0, marginBottom: 18, marginTop: 4 }}>
                            {PIPELINE.map((s, i) => {
                              const ativo = s === ct.status;
                              const passado = PIPELINE.indexOf(ct.status) > i;
                              return (
                                <div key={s} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", position: "relative" }}>
                                  {i > 0 && <div style={{ position: "absolute", left: 0, top: 11, width: "50%", height: 2, background: passado || ativo ? "#1A4870" : "#DDE2EE" }} />}
                                  {i < PIPELINE.length - 1 && <div style={{ position: "absolute", right: 0, top: 11, width: "50%", height: 2, background: passado ? "#1A4870" : "#DDE2EE" }} />}
                                  <div style={{ width: 24, height: 24, borderRadius: "50%", background: ativo ? "#1A4870" : passado ? "#1A4870" : "#DDE2EE", display: "flex", alignItems: "center", justifyContent: "center", position: "relative", zIndex: 1 }}>
                                    {passado ? <span style={{ color: "#fff", fontSize: 12 }}>✓</span> : <span style={{ width: 8, height: 8, borderRadius: "50%", background: ativo ? "#fff" : "#aaa", display: "block" }} />}
                                  </div>
                                  <div style={{ fontSize: 10, marginTop: 4, color: ativo ? "#1A4870" : passado ? "#555" : "#aaa", fontWeight: ativo ? 600 : 400 }}>{STATUS_META[s].label}</div>
                                </div>
                              );
                            })}
                          </div>

                          {/* Detalhes */}
                          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 12, marginBottom: 16 }}>
                            <div><div style={{ ...lbl }}>Matrícula</div><div style={{ fontSize: 13 }}>{ct.imovel_matricula || "—"}</div></div>
                            <div><div style={{ ...lbl }}>CAR</div><div style={{ fontSize: 13 }}>{ct.imovel_car || "—"}</div></div>
                            <div><div style={{ ...lbl }}>NIRF</div><div style={{ fontSize: 13 }}>{ct.imovel_nirf || "—"}</div></div>
                            <div><div style={{ ...lbl }}>Data Contrato</div><div style={{ fontSize: 13 }}>{ct.data_contrato ? new Date(ct.data_contrato + "T00:00").toLocaleDateString("pt-BR") : "—"}</div></div>
                            <div><div style={{ ...lbl }}>Forma Pagamento</div><div style={{ fontSize: 13 }}>{ct.forma_pagamento ? FORMA_META[ct.forma_pagamento] : "—"}</div></div>
                            <div><div style={{ ...lbl }}>Entrada</div><div style={{ fontSize: 13 }}>{ct.valor_entrada ? fmt(ct.valor_entrada) : "—"}</div></div>
                            <div><div style={{ ...lbl }}>ITBI</div><div style={{ fontSize: 13 }}>{ct.itbi_valor ? fmt(ct.itbi_valor) : "—"} {ct.itbi_pago ? <span style={{ color: "#16A34A", fontSize: 11 }}>✓ Pago</span> : ct.itbi_valor ? <span style={{ color: "#C9921B", fontSize: 11 }}>Pendente</span> : null}</div></div>
                            <div><div style={{ ...lbl }}>Custo Cartório</div><div style={{ fontSize: 13 }}>{ct.custo_cartorio ? fmt(ct.custo_cartorio) : "—"}</div></div>
                            {ct.corretor && <div><div style={{ ...lbl }}>Corretor</div><div style={{ fontSize: 13 }}>{ct.corretor.nome}{ct.comissao_corretor_pct ? ` (${ct.comissao_corretor_pct}%)` : ""}</div></div>}
                            {ct.contrato_financeiro && <div><div style={{ ...lbl }}>Financiamento</div><div style={{ fontSize: 13 }}>{ct.contrato_financeiro.descricao}</div></div>}
                          </div>

                          {/* Parcelas resumo */}
                          {pgCt.length > 0 && (
                            <div style={{ background: "#fff", borderRadius: 8, padding: "10px 14px", border: "0.5px solid #DDE2EE", marginBottom: 14 }}>
                              <div style={{ fontSize: 12, fontWeight: 600, color: "#555", marginBottom: 8 }}>PARCELAS AO VENDEDOR</div>
                              <div style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
                                <div><span style={{ fontSize: 11, color: "#888" }}>Total: </span><span style={{ fontSize: 13, fontWeight: 600 }}>{pgCt.length}</span></div>
                                <div><span style={{ fontSize: 11, color: "#16A34A" }}>Pagas: {pgPagos}</span></div>
                                {pgAtras > 0 && <div><span style={{ fontSize: 11, color: "#E24B4A" }}>Atrasadas: {pgAtras}</span></div>}
                                <div><span style={{ fontSize: 11, color: "#888" }}>Pendentes: {pgCt.filter(p => p.status !== "pago").length}</span></div>
                                {pgCt.some(p => p.moeda_parcela && p.moeda_parcela !== "BRL") && (
                                  <div><span style={{ fontSize: 11, color: "#1A4870" }}>Em grãos: {pgCt.filter(p => p.moeda_parcela && p.moeda_parcela !== "BRL").length} parcela(s)</span></div>
                                )}
                              </div>
                            </div>
                          )}

                          {ct.observacoes && <div style={{ fontSize: 12, color: "#666", marginBottom: 14, padding: "8px 12px", background: "#fff", borderRadius: 6, border: "0.5px solid #DDE2EE" }}>{ct.observacoes}</div>}

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
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                  <thead>
                    <tr style={{ background: "#F4F6FA" }}>
                      {["Imóvel", "Vencimento ✏", "Valor ✏", "Moeda", "Sacas", "Status", "Pago em", ""].map((h, i) => (
                        <th key={i} style={{ padding: "9px 12px", fontWeight: 600, fontSize: 11, color: i === 1 || i === 2 ? "#C9921B" : "#888", textAlign: "left", textTransform: "uppercase", letterSpacing: "0.04em", whiteSpace: "nowrap" }}>{h}</th>
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
                      const inpBase: React.CSSProperties = { border: "0.5px solid #DDE2EE", borderRadius: 4, padding: "3px 6px", fontSize: 12, background: "transparent", width: "100%" };
                      const inpEdit: React.CSSProperties = { ...inpBase, background: "#FBF3E0", border: "0.5px solid #C9921B", fontWeight: 600 };
                      const isGrao = pg.moeda_parcela && pg.moeda_parcela !== "BRL";
                      return (
                        <tr key={pg.id} style={{ background: pg.status === "pago" ? "#F0FDF4" : i % 2 === 0 ? "#fff" : "#FAFBFC", borderBottom: "0.5px solid #DDE2EE" }}>
                          <td style={{ padding: "7px 12px" }}>{ct?.imovel_nome ?? "—"}</td>
                          <td style={{ padding: "4px 8px", minWidth: 130 }}>
                            <input type="date" value={ed?.data_vencimento ?? pg.data_vencimento} onChange={e => editarPagamento(pg.id, "data_vencimento", e.target.value)} style={ed?.data_vencimento ? inpEdit : inpBase} />
                          </td>
                          <td style={{ padding: "4px 8px", minWidth: 110 }}>
                            <input type="number" step="0.01" min="0" value={ed?.valor !== undefined ? ed.valor : pg.valor} onChange={e => editarPagamento(pg.id, "valor", e.target.value)} style={{ ...(ed?.valor !== undefined ? inpEdit : inpBase), textAlign: "right" }} />
                          </td>
                          <td style={{ padding: "7px 12px", whiteSpace: "nowrap" }}>
                            {isGrao ? (
                              <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 10, background: "#E6F1FB", color: "#0C447C", fontWeight: 600 }}>
                                {MOEDA_META[pg.moeda_parcela!]?.label ?? pg.moeda_parcela}
                              </span>
                            ) : <span style={{ color: "#888", fontSize: 12 }}>R$</span>}
                          </td>
                          <td style={{ padding: "7px 12px", fontVariantNumeric: "tabular-nums", color: isGrao ? "#0C447C" : "#aaa" }}>
                            {isGrao ? fmtSc(pg.quantidade_sacas) : "—"}
                          </td>
                          <td style={{ padding: "7px 12px" }}>
                            <span style={{ padding: "2px 8px", borderRadius: 10, background: stBg, color: stCl, fontSize: 11, fontWeight: 600 }}>{stLabel}</span>
                          </td>
                          <td style={{ padding: "7px 12px", color: "#888", fontSize: 12 }}>{pg.data_pagamento ? new Date(pg.data_pagamento + "T00:00").toLocaleDateString("pt-BR") : "—"}</td>
                          <td style={{ padding: "7px 12px" }}>
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
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── MODAL ── */}
      {showModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 20 }}>
          <div style={{ background: "#fff", borderRadius: 14, width: "100%", maxWidth: 900, maxHeight: "92vh", overflow: "hidden", display: "flex", flexDirection: "column" }}>

            {/* Header modal */}
            <div style={{ padding: "18px 24px", borderBottom: "0.5px solid #DDE2EE", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 16, color: "#1A4870" }}>{viewOnly ? "Contrato de Compra" : editId ? "Editar Contrato" : "Novo Contrato de Compra de Terra"}</div>
                {viewOnly && <div style={{ fontSize: 12, color: "#888", marginTop: 2 }}>Somente leitura</div>}
              </div>
              <button onClick={() => setShowModal(false)} style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer", color: "#aaa", lineHeight: 1 }}>✕</button>
            </div>

            {/* Abas do modal */}
            <div style={{ display: "flex", borderBottom: "0.5px solid #DDE2EE", background: "#FAFBFC" }}>
              {(["imovel", "partes", "valor", "cartorio"] as const).map(a => (
                <button key={a} onClick={() => setAbaModal(a)} style={{ padding: "10px 20px", border: "none", borderBottom: abaModal === a ? "2px solid #1A4870" : "2px solid transparent", background: "transparent", fontSize: 13, fontWeight: abaModal === a ? 600 : 400, color: abaModal === a ? "#1A4870" : "#666", cursor: "pointer" }}>
                  {{ imovel: "Imóvel", partes: "Partes", valor: "Valor & Pagamento", cartorio: "Cartório & Obs." }[a]}
                </button>
              ))}
            </div>

            {/* Corpo do modal */}
            <div style={{ flex: 1, overflowY: "auto", padding: "20px 24px" }}>

              {/* ── ABA IMÓVEL ── */}
              {abaModal === "imovel" && (
                <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                  <div style={g2}>
                    <div><label style={lbl}>Nome / Identificação do Imóvel *</label>
                      <input style={inp} value={form.imovel_nome} disabled={viewOnly} onChange={e => setForm(p => ({ ...p, imovel_nome: e.target.value }))} placeholder="Ex: Fazenda Boa Vista — Gleba Norte" /></div>
                    <div><label style={lbl}>Nº do Contrato (interno)</label>
                      <input style={inp} value={form.numero} disabled={viewOnly} onChange={e => setForm(p => ({ ...p, numero: e.target.value }))} placeholder="Ex: CCT-001/2026" /></div>
                  </div>
                  <div style={g3}>
                    <div><label style={lbl}>Município</label>
                      <input style={inp} value={form.imovel_municipio} disabled={viewOnly} onChange={e => setForm(p => ({ ...p, imovel_municipio: e.target.value }))} /></div>
                    <div><label style={lbl}>UF</label>
                      <select style={inp} value={form.imovel_uf} disabled={viewOnly} onChange={e => setForm(p => ({ ...p, imovel_uf: e.target.value }))}>
                        {UFS.map(u => <option key={u}>{u}</option>)}
                      </select></div>
                    <div><label style={lbl}>Área Total (ha)</label>
                      <input style={inp} type="number" step="0.01" value={form.imovel_area_total_ha} disabled={viewOnly} onChange={e => setForm(p => ({ ...p, imovel_area_total_ha: e.target.value }))} /></div>
                  </div>
                  <div style={g3}>
                    <div><label style={lbl}>Área Terra Nua (ha)</label>
                      <input style={inp} type="number" step="0.01" value={form.imovel_area_terra_nua_ha} disabled={viewOnly} onChange={e => setForm(p => ({ ...p, imovel_area_terra_nua_ha: e.target.value }))} /></div>
                    <div><label style={lbl}>Matrícula do Imóvel</label>
                      <input style={inp} value={form.imovel_matricula} disabled={viewOnly} onChange={e => setForm(p => ({ ...p, imovel_matricula: e.target.value }))} placeholder="Nº da matrícula no CRI" /></div>
                    <div><label style={lbl}>Código CAR</label>
                      <input style={inp} value={form.imovel_car} disabled={viewOnly} onChange={e => setForm(p => ({ ...p, imovel_car: e.target.value }))} /></div>
                  </div>
                  <div style={{ ...g2, maxWidth: 380 }}>
                    <div><label style={lbl}>NIRF</label>
                      <input style={inp} value={form.imovel_nirf} disabled={viewOnly} onChange={e => setForm(p => ({ ...p, imovel_nirf: e.target.value }))} /></div>
                    <div><label style={lbl}>Status</label>
                      <select style={inp} value={form.status} disabled={viewOnly} onChange={e => setForm(p => ({ ...p, status: e.target.value as StatusCCT }))}>
                        {(Object.keys(STATUS_META) as StatusCCT[]).map(s => <option key={s} value={s}>{STATUS_META[s].label}</option>)}
                      </select></div>
                  </div>
                </div>
              )}

              {/* ── ABA PARTES ── */}
              {abaModal === "partes" && (
                <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                  <div style={g2}>
                    <div><label style={lbl}>Vendedor (Alienante) *</label>
                      <select style={inp} value={form.vendedor_id} disabled={viewOnly} onChange={e => setForm(p => ({ ...p, vendedor_id: e.target.value }))}>
                        <option value="">— Selecionar —</option>
                        {pessoas.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
                      </select></div>
                    <div><label style={lbl}>Comprador (Produtor)</label>
                      <select style={inp} value={form.comprador_produtor_id} disabled={viewOnly} onChange={e => setForm(p => ({ ...p, comprador_produtor_id: e.target.value }))}>
                        <option value="">— Selecionar —</option>
                        {produtores.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
                      </select></div>
                  </div>
                  <div style={{ ...g2, maxWidth: 560 }}>
                    <div><label style={lbl}>Corretor / Intermediário</label>
                      <select style={inp} value={form.corretor_id} disabled={viewOnly} onChange={e => setForm(p => ({ ...p, corretor_id: e.target.value }))}>
                        <option value="">— Nenhum —</option>
                        {pessoas.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
                      </select></div>
                    <div><label style={lbl}>Comissão Corretor (%)</label>
                      <input style={inp} type="number" step="0.01" value={form.comissao_corretor_pct} disabled={viewOnly} onChange={e => setForm(p => ({ ...p, comissao_corretor_pct: e.target.value }))} placeholder="Ex: 3" /></div>
                  </div>
                  {form.comissao_corretor_pct && form.valor_total && (
                    <div style={{ padding: "10px 14px", background: "#FBF3E0", borderRadius: 8, border: "0.5px solid #F0D9A0", fontSize: 13, color: "#7A5A12" }}>
                      Comissão do corretor: {fmt(+form.valor_total * +form.comissao_corretor_pct / 100)}
                    </div>
                  )}
                  <div style={{ ...g2, maxWidth: 380 }}>
                    <div><label style={lbl}>Data do Contrato</label>
                      <input style={inp} type="date" value={form.data_contrato} disabled={viewOnly} onChange={e => setForm(p => ({ ...p, data_contrato: e.target.value }))} /></div>
                    <div><label style={lbl}>Previsão Escritura</label>
                      <input style={inp} type="date" value={form.data_previsao_escritura} disabled={viewOnly} onChange={e => setForm(p => ({ ...p, data_previsao_escritura: e.target.value }))} /></div>
                  </div>
                </div>
              )}

              {/* ── ABA VALOR & PAGAMENTO ── */}
              {abaModal === "valor" && (
                <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                  <div style={g3}>
                    <div><label style={lbl}>Valor Total do Imóvel (R$) *</label>
                      <input style={inp} type="text" inputMode="numeric" value={displayBRL(form.valor_total)} disabled={viewOnly} onChange={e => setForm(p => ({ ...p, valor_total: parseBRLInput(e.target.value) }))} /></div>
                    <div><label style={lbl}>Valor Terra Nua (R$)</label>
                      <input style={inp} type="number" step="0.01" value={form.valor_terra_nua} disabled={viewOnly} onChange={e => setForm(p => ({ ...p, valor_terra_nua: e.target.value }))} /></div>
                    <div><label style={lbl}>Valor Benfeitorias (R$)</label>
                      <input style={inp} type="number" step="0.01" value={form.valor_benfeitorias} disabled={viewOnly} onChange={e => setForm(p => ({ ...p, valor_benfeitorias: e.target.value }))} /></div>
                  </div>

                  <div style={{ ...g2, maxWidth: 560 }}>
                    <div><label style={lbl}>ITBI Estimado (R$)</label>
                      <input style={inp} type="number" step="0.01" value={form.itbi_valor} disabled={viewOnly} onChange={e => setForm(p => ({ ...p, itbi_valor: e.target.value }))} /></div>
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

                  {(form.forma_pagamento === "misto" || form.forma_pagamento === "parcelado_vendedor" || form.forma_pagamento === "financiamento") && (
                    <div style={g2}>
                      <div><label style={lbl}>Entrada / Sinal (R$)</label>
                        <input style={inp} type="text" inputMode="numeric" value={displayBRL(form.valor_entrada)} disabled={viewOnly} onChange={e => setForm(p => ({ ...p, valor_entrada: parseBRLInput(e.target.value) }))} /></div>
                      <div><label style={lbl}>Data da Entrada</label>
                        <input style={inp} type="date" value={form.data_entrada} disabled={viewOnly} onChange={e => setForm(p => ({ ...p, data_entrada: e.target.value }))} /></div>
                    </div>
                  )}

                  {(form.forma_pagamento === "financiamento" || form.forma_pagamento === "misto") && (
                    <div><label style={lbl}>Contrato de Financiamento (vinculado)</label>
                      <select style={inp} value={form.contrato_financeiro_id} disabled={viewOnly} onChange={e => setForm(p => ({ ...p, contrato_financeiro_id: e.target.value }))}>
                        <option value="">— Selecionar financiamento —</option>
                        {contrFinanc.map(cf => <option key={cf.id} value={cf.id}>{cf.descricao} – {cf.credor}</option>)}
                      </select></div>
                  )}

                  {/* ── Cronograma de Parcelas ── */}
                  {(form.forma_pagamento === "parcelado_vendedor" || (form.forma_pagamento === "misto" && !form.contrato_financeiro_id)) && (
                    <div style={{ border: "0.5px solid #DDE2EE", borderRadius: 10, overflow: "hidden" }}>
                      <div style={{ padding: "10px 14px", background: "#F4F6FA", borderBottom: "0.5px solid #DDE2EE", fontSize: 12, fontWeight: 600, color: "#555", textTransform: "uppercase", letterSpacing: "0.04em" }}>
                        Cronograma de Parcelas ao Vendedor
                      </div>
                      <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 14 }}>

                        {/* Linha 1: periodicidade, Nº parcelas, data 1ª */}
                        <div style={{ display: "grid", gridTemplateColumns: "auto auto 1fr", gap: 12, alignItems: "end" }}>
                          <div>
                            <label style={lbl}>Periodicidade</label>
                            <div style={{ display: "flex", gap: 0, borderRadius: 6, overflow: "hidden", border: "0.5px solid #DDE2EE" }}>
                              {(["anual", "semestral"] as const).map(p => (
                                <button key={p} type="button" disabled={viewOnly} onClick={() => { setForm(f => ({ ...f, periodicidade: p })); setParcelasCustom(null); }}
                                  style={{ padding: "7px 18px", border: "none", background: form.periodicidade === p ? "#1A4870" : "#fff", color: form.periodicidade === p ? "#fff" : "#555", fontSize: 13, fontWeight: form.periodicidade === p ? 600 : 400, cursor: viewOnly ? "default" : "pointer" }}>
                                  {p.charAt(0).toUpperCase() + p.slice(1)}
                                </button>
                              ))}
                            </div>
                          </div>
                          <div>
                            <label style={lbl}>Nº de Parcelas</label>
                            <input style={{ ...inp, width: 80 }} type="number" min="1" max="30" value={form.num_parcelas_vendedor} disabled={viewOnly}
                              onChange={e => { setForm(p => ({ ...p, num_parcelas_vendedor: e.target.value })); setParcelasCustom(null); }} />
                          </div>
                          <div>
                            <label style={lbl}>Data da 1ª Parcela</label>
                            <input style={inp} type="date" value={form.data_primeira_parcela} disabled={viewOnly}
                              onChange={e => { setForm(p => ({ ...p, data_primeira_parcela: e.target.value })); setParcelasCustom(null); }} />
                          </div>
                        </div>

                        {/* Linha 2: moeda padrão das parcelas */}
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
                          <div>
                            <label style={lbl}>Moeda das Parcelas (padrão)</label>
                            <select style={inp} value={form.moeda_parcela_padrao} disabled={viewOnly}
                              onChange={e => { setForm(p => ({ ...p, moeda_parcela_padrao: e.target.value as MoedaParcela })); setParcelasCustom(null); }}>
                              {(Object.keys(MOEDA_META) as MoedaParcela[]).map(m => <option key={m} value={m}>{MOEDA_META[m].label}</option>)}
                            </select>
                          </div>
                          {form.moeda_parcela_padrao !== "BRL" && (
                            <div>
                              <label style={lbl}>Preço de referência (R$/sc)</label>
                              <input style={inp} type="number" step="0.01" placeholder="Ex: 120.00" value={form.preco_sc_ref_padrao} disabled={viewOnly}
                                onChange={e => { setForm(p => ({ ...p, preco_sc_ref_padrao: e.target.value })); setParcelasCustom(null); }} />
                            </div>
                          )}
                          <div></div>
                        </div>

                        {/* Linha 3: Rateio por vencimento — safra/ciclo padrão */}
                        <div style={{ background: "#EBF2FB", borderRadius: 8, padding: "10px 12px", border: "0.5px solid #BDD5EE" }}>
                          <div style={{ fontSize: 11, fontWeight: 700, color: "#0C447C", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.04em" }}>
                            Rateio por Vencimento — Safra / Ciclo Padrão
                          </div>
                          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                            <div>
                              <label style={{ ...lbl, color: "#0C447C" }}>Ano Safra</label>
                              <select style={inp} value={form.ano_safra_id_padrao} disabled={viewOnly}
                                onChange={e => setForm(p => ({ ...p, ano_safra_id_padrao: e.target.value, ciclo_id_padrao: "" }))}>
                                <option value="">— Sem safra —</option>
                                {anosSafra.map(a => <option key={a.id} value={a.id}>{a.descricao}</option>)}
                              </select>
                            </div>
                            <div>
                              <label style={{ ...lbl, color: "#0C447C" }}>Ciclo / Empreendimento</label>
                              <select style={inp} value={form.ciclo_id_padrao} disabled={viewOnly}
                                onChange={e => setForm(p => ({ ...p, ciclo_id_padrao: e.target.value }))}>
                                <option value="">— Sem ciclo —</option>
                                {ciclosFiltrados.map(c => <option key={c.id} value={c.id}>{c.descricao || c.cultura}</option>)}
                              </select>
                            </div>
                          </div>
                          <div style={{ fontSize: 11, color: "#378ADD", marginTop: 6 }}>
                            Os valores padrão acima serão aplicados a todas as parcelas. Na grade abaixo, você pode substituir individualmente.
                          </div>
                        </div>

                        {/* Grade de parcelas */}
                        {(() => {
                          const autoParc = gerarPreviewParcelas(form, form.moeda_parcela_padrao, form.preco_sc_ref_padrao, form.ano_safra_id_padrao, form.ciclo_id_padrao);
                          if (!autoParc.length) return (
                            <div style={{ padding: "12px 0", fontSize: 12, color: "#aaa", textAlign: "center" }}>
                              Preencha o valor total, entrada e número de parcelas para ver o cronograma.
                            </div>
                          );
                          const isCustom = parcelasCustom !== null;
                          const parcelas: ParcelaRow[] = isCustom ? parcelasCustom! : autoParc;
                          const saldo = +form.valor_total - (+form.valor_entrada || 0);

                          return (
                            <div>
                              {/* Resumo */}
                              <div style={{ display: "flex", gap: 16, fontSize: 12, color: "#555", marginBottom: 10, padding: "8px 12px", background: "#EBF2FB", borderRadius: 7, border: "0.5px solid #BDD5EE", alignItems: "center", flexWrap: "wrap" }}>
                                <span>Saldo: <strong style={{ color: "#1A4870" }}>{fmt(saldo)}</strong></span>
                                <span>÷ {parcelas.length} parcelas {form.periodicidade === "anual" ? "anuais" : "semestrais"}</span>
                                {form.moeda_parcela_padrao !== "BRL" && form.preco_sc_ref_padrao && (
                                  <span style={{ color: "#0C447C", fontWeight: 600 }}>≈ {fmtSc(saldo / (parseFloat(form.preco_sc_ref_padrao) || 1))} de {MOEDA_META[form.moeda_parcela_padrao].label.replace("Sacas de ", "")}</span>
                                )}
                                {isCustom && <span style={{ color: "#C9921B", fontWeight: 600 }}>✏ Personalizado</span>}
                                {!viewOnly && (
                                  <div style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
                                    {isCustom ? (
                                      <button type="button" onClick={() => setParcelasCustom(null)} style={{ fontSize: 11, padding: "3px 10px", border: "0.5px solid #DDE2EE", borderRadius: 6, background: "#fff", color: "#555", cursor: "pointer" }}>↺ Restaurar automático</button>
                                    ) : (
                                      <button type="button" onClick={() => setParcelasCustom(autoParc)} style={{ fontSize: 11, padding: "3px 10px", border: "0.5px solid #C9921B", borderRadius: 6, background: "#FBF3E0", color: "#7A5A12", cursor: "pointer" }}>✏ Personalizar</button>
                                    )}
                                  </div>
                                )}
                              </div>

                              {/* Tabela de parcelas */}
                              <div style={{ maxHeight: 320, overflowY: "auto", overflowX: "auto", border: "0.5px solid #DDE2EE", borderRadius: 8 }}>
                                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, minWidth: 720 }}>
                                  <thead>
                                    <tr style={{ background: "#F4F6FA", position: "sticky", top: 0 }}>
                                      {["#", "Vencimento", "Moeda", "Sacas", "Preço R$/sc", "Valor R$", "Ano Safra", "Ciclo"].map((h, i) => (
                                        <th key={i} style={{ padding: "6px 10px", textAlign: i >= 3 ? "right" : "left", fontWeight: 600, color: "#888", fontSize: 11, textTransform: "uppercase", whiteSpace: "nowrap" }}>{h}</th>
                                      ))}
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {parcelas.map((p, i) => {
                                      const isGrao = p.moeda_parcela !== "BRL";
                                      const ciclosParcela = p.ano_safra_id
                                        ? ciclos.filter(c => c.ano_safra_id === p.ano_safra_id)
                                        : ciclos;
                                      return (
                                        <tr key={i} style={{ borderTop: "0.5px solid #DDE2EE", background: i % 2 === 0 ? "#fff" : "#FAFBFC" }}>
                                          <td style={{ padding: "5px 10px", color: "#888", width: 32, fontVariantNumeric: "tabular-nums" }}>{p.n}</td>
                                          <td style={{ padding: "4px 6px", minWidth: 120 }}>
                                            {isCustom && !viewOnly ? (
                                              <input type="date" value={p.data} onChange={e => setParcelasCustom(prev => prev!.map((x, j) => j === i ? { ...x, data: e.target.value } : x))}
                                                style={{ border: "0.5px solid #DDE2EE", borderRadius: 5, padding: "3px 6px", fontSize: 12, background: "#FBF3E0", width: "100%" }} />
                                            ) : new Date(p.data + "T00:00").toLocaleDateString("pt-BR")}
                                          </td>
                                          <td style={{ padding: "4px 6px", minWidth: 110 }}>
                                            {isCustom && !viewOnly ? (
                                              <select value={p.moeda_parcela} onChange={e => {
                                                const novaM = e.target.value as MoedaParcela;
                                                setParcelasCustom(prev => prev!.map((x, j) => j === i
                                                  ? { ...x, moeda_parcela: novaM, produto: MOEDA_META[novaM]?.produto || "", quantidade_sacas: novaM === "BRL" ? "" : x.quantidade_sacas }
                                                  : x));
                                              }} style={{ border: "0.5px solid #DDE2EE", borderRadius: 5, padding: "3px 5px", fontSize: 11, width: "100%", background: "#FBF3E0" }}>
                                                {(Object.keys(MOEDA_META) as MoedaParcela[]).map(m => <option key={m} value={m}>{MOEDA_META[m].label}</option>)}
                                              </select>
                                            ) : (
                                              <span style={{ fontSize: 11, padding: "2px 6px", borderRadius: 8, background: isGrao ? "#E6F1FB" : "#F4F6FA", color: isGrao ? "#0C447C" : "#888" }}>
                                                {isGrao ? MOEDA_META[p.moeda_parcela]?.label : "R$"}
                                              </span>
                                            )}
                                          </td>
                                          <td style={{ padding: "4px 6px", minWidth: 90, textAlign: "right" }}>
                                            {isCustom && !viewOnly && isGrao ? (
                                              <input type="number" step="0.0001" min="0" value={p.quantidade_sacas} onChange={e => {
                                                setParcelasCustom(prev => {
                                                  const updated = prev!.map((x, j) => j === i ? { ...x, quantidade_sacas: e.target.value } : x);
                                                  return recalcularBRL(i, updated);
                                                });
                                              }} style={{ border: "0.5px solid #DDE2EE", borderRadius: 5, padding: "3px 6px", fontSize: 12, width: 80, textAlign: "right", background: "#FBF3E0" }} />
                                            ) : isGrao ? (
                                              <span style={{ fontVariantNumeric: "tabular-nums" }}>{parseFloat(p.quantidade_sacas || "0").toFixed(2)}</span>
                                            ) : <span style={{ color: "#ccc" }}>—</span>}
                                          </td>
                                          <td style={{ padding: "4px 6px", minWidth: 90, textAlign: "right" }}>
                                            {isCustom && !viewOnly && isGrao ? (
                                              <input type="number" step="0.01" min="0" value={p.preco_sc_ref} onChange={e => {
                                                setParcelasCustom(prev => {
                                                  const updated = prev!.map((x, j) => j === i ? { ...x, preco_sc_ref: e.target.value } : x);
                                                  return recalcularBRL(i, updated);
                                                });
                                              }} style={{ border: "0.5px solid #DDE2EE", borderRadius: 5, padding: "3px 6px", fontSize: 12, width: 80, textAlign: "right", background: "#FBF3E0" }} />
                                            ) : isGrao && p.preco_sc_ref ? (
                                              <span style={{ fontVariantNumeric: "tabular-nums" }}>R$ {parseFloat(p.preco_sc_ref).toFixed(2)}</span>
                                            ) : <span style={{ color: "#ccc" }}>—</span>}
                                          </td>
                                          <td style={{ padding: "4px 6px", minWidth: 110, textAlign: "right", fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>
                                            {isCustom && !viewOnly && !isGrao ? (
                                              <input type="text" inputMode="numeric" value={displayBRL(p.valor)} onChange={e => setParcelasCustom(prev => prev!.map((x, j) => j === i ? { ...x, valor: parseBRLInput(e.target.value) } : x))}
                                                style={{ border: "0.5px solid #DDE2EE", borderRadius: 5, padding: "3px 6px", fontSize: 12, width: 100, textAlign: "right", background: "#FBF3E0" }} />
                                            ) : fmt(parseFloat(p.valor) || 0)}
                                          </td>
                                          <td style={{ padding: "4px 6px", minWidth: 110 }}>
                                            {isCustom && !viewOnly ? (
                                              <select value={p.ano_safra_id} onChange={e => setParcelasCustom(prev => prev!.map((x, j) => j === i ? { ...x, ano_safra_id: e.target.value, ciclo_id: "" } : x))}
                                                style={{ border: "0.5px solid #DDE2EE", borderRadius: 5, padding: "3px 5px", fontSize: 11, width: "100%", background: "#F4F6FA" }}>
                                                <option value="">— Padrão —</option>
                                                {anosSafra.map(a => <option key={a.id} value={a.id}>{a.descricao}</option>)}
                                              </select>
                                            ) : (
                                              <span style={{ fontSize: 11, color: "#555" }}>{anosSafra.find(a => a.id === p.ano_safra_id)?.descricao || (form.ano_safra_id_padrao ? anosSafra.find(a => a.id === form.ano_safra_id_padrao)?.descricao : "—")}</span>
                                            )}
                                          </td>
                                          <td style={{ padding: "4px 6px", minWidth: 120 }}>
                                            {isCustom && !viewOnly ? (
                                              <select value={p.ciclo_id} onChange={e => setParcelasCustom(prev => prev!.map((x, j) => j === i ? { ...x, ciclo_id: e.target.value } : x))}
                                                style={{ border: "0.5px solid #DDE2EE", borderRadius: 5, padding: "3px 5px", fontSize: 11, width: "100%", background: "#F4F6FA" }}>
                                                <option value="">— Padrão —</option>
                                                {ciclosParcela.map(c => <option key={c.id} value={c.id}>{c.descricao || c.cultura}</option>)}
                                              </select>
                                            ) : (
                                              <span style={{ fontSize: 11, color: "#555" }}>{ciclos.find(c => c.id === p.ciclo_id)?.descricao || (form.ciclo_id_padrao ? ciclos.find(c => c.id === form.ciclo_id_padrao)?.descricao : "—")}</span>
                                            )}
                                          </td>
                                        </tr>
                                      );
                                    })}
                                  </tbody>
                                  <tfoot>
                                    <tr style={{ background: "#F4F6FA", borderTop: "0.5px solid #DDE2EE" }}>
                                      <td colSpan={5} style={{ padding: "6px 10px", fontWeight: 600, fontSize: 12 }}>Total parcelado</td>
                                      <td style={{ padding: "6px 10px", textAlign: "right", fontWeight: 700, color: "#1A4870", fontVariantNumeric: "tabular-nums" }}>
                                        {fmt(parcelas.reduce((s, p) => s + (parseFloat(p.valor) || 0), 0))}
                                      </td>
                                      <td colSpan={2} />
                                    </tr>
                                  </tfoot>
                                </table>
                              </div>

                              {/* Info sobre OG */}
                              <div style={{ fontSize: 11, color: "#378ADD", marginTop: 8, padding: "6px 10px", background: "#F0F7FF", borderRadius: 6, border: "0.5px solid #BDD5EE" }}>
                                As parcelas serão lançadas em <strong>Contas a Pagar</strong> com a Operação Gerencial <strong>2.03.01.001 — COMPRA DE IMÓVEIS</strong> (Investimento, LCDPR Tipo 2). Vinculadas ao DRE como CAPEX.
                              </div>
                            </div>
                          );
                        })()}
                      </div>
                    </div>
                  )}

                  {/* Resumo financeiro */}
                  {form.valor_total && (
                    <div style={{ padding: "12px 16px", background: "#EBF2FB", borderRadius: 8, border: "0.5px solid #BDD5EE", fontSize: 13, color: "#0C447C" }}>
                      <div style={{ fontWeight: 600, marginBottom: 8 }}>Resumo Financeiro</div>
                      <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
                        <div>Valor total: <strong>{fmt(+form.valor_total)}</strong></div>
                        {form.imovel_area_total_ha && <div>Preço/ha: <strong>{fmt(+form.valor_total / +form.imovel_area_total_ha)}</strong></div>}
                        {form.valor_entrada && <div>Entrada: <strong>{fmt(+form.valor_entrada)}</strong> ({(+form.valor_entrada / +form.valor_total * 100).toFixed(1)}%)</div>}
                        {form.itbi_valor && <div>ITBI: <strong>{fmt(+form.itbi_valor)}</strong></div>}
                        {form.custo_cartorio && <div>Cartório: <strong>{fmt(+form.custo_cartorio)}</strong></div>}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* ── ABA CARTÓRIO ── */}
              {abaModal === "cartorio" && (
                <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                  <div><label style={lbl}>Cartório de Registro de Imóveis</label>
                    <input style={inp} value={form.cartorio_nome} disabled={viewOnly} onChange={e => setForm(p => ({ ...p, cartorio_nome: e.target.value }))} placeholder="Nome e comarca do cartório" /></div>
                  <div style={{ height: 1, background: "#DDE2EE" }} />
                  <div style={{ fontSize: 12, fontWeight: 600, color: "#555", textTransform: "uppercase", letterSpacing: "0.04em" }}>Escritura Pública</div>
                  <div style={g3}>
                    <div><label style={lbl}>Nº da Escritura</label>
                      <input style={inp} value={form.escritura_numero} disabled={viewOnly} onChange={e => setForm(p => ({ ...p, escritura_numero: e.target.value }))} /></div>
                    <div><label style={lbl}>Data da Escritura</label>
                      <input style={inp} type="date" value={form.escritura_data} disabled={viewOnly} onChange={e => setForm(p => ({ ...p, escritura_data: e.target.value }))} /></div>
                    <div><label style={lbl}>Custo do Cartório (R$)</label>
                      <input style={inp} type="number" step="0.01" value={form.custo_cartorio} disabled={viewOnly} onChange={e => setForm(p => ({ ...p, custo_cartorio: e.target.value }))} /></div>
                  </div>
                  <div style={{ height: 1, background: "#DDE2EE" }} />
                  <div style={{ fontSize: 12, fontWeight: 600, color: "#555", textTransform: "uppercase", letterSpacing: "0.04em" }}>Registro no CRI</div>
                  <div style={g2}>
                    <div><label style={lbl}>Nº do Registro</label>
                      <input style={inp} value={form.registro_numero} disabled={viewOnly} onChange={e => setForm(p => ({ ...p, registro_numero: e.target.value }))} /></div>
                    <div><label style={lbl}>Data do Registro</label>
                      <input style={inp} type="date" value={form.registro_data} disabled={viewOnly} onChange={e => setForm(p => ({ ...p, registro_data: e.target.value }))} /></div>
                  </div>
                  <div style={{ height: 1, background: "#DDE2EE" }} />
                  <div><label style={lbl}>Observações Gerais</label>
                    <textarea style={{ ...inp, height: 80, resize: "vertical" } as React.CSSProperties} value={form.observacoes} disabled={viewOnly} onChange={e => setForm(p => ({ ...p, observacoes: e.target.value }))} placeholder="Pendências, condicionantes, cláusulas especiais..." /></div>
                </div>
              )}
            </div>

            {/* Footer modal */}
            <div style={{ padding: "14px 24px", borderTop: "0.5px solid #DDE2EE", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ display: "flex", gap: 8 }}>
                {(["imovel", "partes", "valor", "cartorio"] as const).map(a => (
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
