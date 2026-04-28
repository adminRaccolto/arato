"use client";
import { useState, useEffect, useCallback } from "react";
import TopNav from "../../components/TopNav";
import { useAuth } from "../../components/AuthProvider";
import {
  listarPedidosCompra, criarPedidoCompra, atualizarPedidoCompra, excluirPedidoCompra,
  listarPedidoCompraItens, salvarPedidoCompraItens,
  listarPedidoCompraEntregas, registrarEntrega,
  listarPessoas, listarInsumos, listarTodosCiclos, listarAnosSafra, listarCentrosCustoGeral,
  listarOperacoesGerenciais, criarLancamento,
} from "../../lib/db";
import type { PedidoCompra, PedidoCompraItem, PedidoCompraEntrega, Pessoa, Insumo, Ciclo, AnoSafra, CentroCusto, OperacaoGerencial } from "../../lib/supabase";

// ── Estilos base ─────────────────────────────────────────────
const inp: React.CSSProperties = { width: "100%", padding: "7px 10px", border: "0.5px solid #D4DCE8", borderRadius: 7, fontSize: 13, color: "#1a1a1a", background: "#fff", boxSizing: "border-box", outline: "none" };
const lbl: React.CSSProperties = { fontSize: 11, color: "#555", marginBottom: 3, display: "block" };
const secTit: React.CSSProperties = { fontSize: 11, fontWeight: 600, color: "#1A4870", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10, marginTop: 16, paddingBottom: 4, borderBottom: "0.5px solid #D4DCE8" };
const btnV: React.CSSProperties = { padding: "8px 18px", background: "#1A5CB8", color: "#fff", border: "none", borderRadius: 8, fontWeight: 600, cursor: "pointer", fontSize: 13 };
const btnR: React.CSSProperties = { padding: "8px 16px", border: "0.5px solid #D4DCE8", borderRadius: 8, background: "#fff", cursor: "pointer", fontSize: 13, color: "#555" };
const btnX: React.CSSProperties = { padding: "3px 8px", border: "0.5px solid #E24B4A50", borderRadius: 6, background: "#FCEBEB", cursor: "pointer", fontSize: 11, color: "#791F1F" };

const fmtBRL = (v?: number | null) => (v ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fmtUSD = (v?: number | null) => `US$ ${(v ?? 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtMoeda = (v: number | null | undefined, moeda: string) => moeda === "USD" ? fmtUSD(v) : fmtBRL(v);
const fmtN   = (v?: number | null, d = 2) => v != null ? v.toLocaleString("pt-BR", { minimumFractionDigits: d, maximumFractionDigits: d }) : "—";
const fmtData = (s?: string) => s ? s.split("-").reverse().join("/") : "—";
const hoje = () => new Date().toISOString().split("T")[0];

const STATUS_MAP: Record<PedidoCompra["status"], { label: string; bg: string; color: string }> = {
  rascunho:               { label: "Rascunho",          bg: "#F3F6F9", color: "#555"    },
  aprovado:               { label: "Aprovado",           bg: "#D5E8F5", color: "#0B2D50" },
  parcialmente_entregue:  { label: "Parc. Entregue",    bg: "#FBF3E0", color: "#7A5200" },
  entregue:               { label: "Entregue",           bg: "#DCFCE7", color: "#166534" },
  cancelado:              { label: "Cancelado",          bg: "#FCEBEB", color: "#791F1F" },
};

type ItemForm = {
  id?: string;
  tipo_item: "produto" | "servico";
  insumo_id: string;
  nome_item: string;
  unidade: string;
  quantidade: string;
  valor_unitario: string;
  qtd_cancelada: string;
  qtd_entregue: number;
  centro_custo_id: string;
};

const ITEM_VAZIO: ItemForm = {
  tipo_item: "produto", insumo_id: "", nome_item: "", unidade: "kg",
  quantidade: "", valor_unitario: "", qtd_cancelada: "0", qtd_entregue: 0, centro_custo_id: "",
};

type FormPedido = {
  status: PedidoCompra["status"];
  data_registro: string; tipo: string; fiscal: boolean; cotacao_moeda: string;
  possui_ordem_compra: boolean; entrega_unica: boolean;
  antecipacao_juros_pct: string; desc_antecipacao_pct: string; desc_pontualidade_pct: string;
  acrescimos_valor: string; desconto_pct: string; desconto_valor: string;
  frete_total: string; frete_tipo: string;
  operacao: string; operacao_nf: string; operacao_nf_auto: boolean;
  ano_safra_id: string; ciclo_id: string;
  data_vencimento: string;
  meio_pagamento: string; barter_ano_safra_id: string; barter_ciclo_id: string;
  aprovador: string; nr_pedido: string; nr_solicitacao: string;
  fornecedor_id: string; nr_pedido_fornecedor: string; variacao_cambial: string;
  deposito_previsao: string; contato_fornecedor: string;
  comprador_id: string; transportador: string;
  propriedade_entrega: string; endereco_entrega: string; cidade_entrega: string;
  previsao_entrega_unica: string; data_entrega_total: string; observacao: string;
};

const PEDIDO_VAZIO: FormPedido = {
  data_registro: hoje(), tipo: "Pedido Compra", fiscal: false, status: "rascunho",
  cotacao_moeda: "R$", possui_ordem_compra: false, entrega_unica: true,
  antecipacao_juros_pct: "", desc_antecipacao_pct: "", desc_pontualidade_pct: "",
  acrescimos_valor: "", desconto_pct: "", desconto_valor: "",
  frete_total: "", frete_tipo: "Pago",
  operacao: "", operacao_nf: "", operacao_nf_auto: true,
  ano_safra_id: "", ciclo_id: "",
  data_vencimento: "",
  meio_pagamento: "", barter_ano_safra_id: "", barter_ciclo_id: "",
  aprovador: "", nr_pedido: "", nr_solicitacao: "",
  fornecedor_id: "", nr_pedido_fornecedor: "", variacao_cambial: "",
  deposito_previsao: "", contato_fornecedor: "",
  comprador_id: "", transportador: "", propriedade_entrega: "",
  endereco_entrega: "", cidade_entrega: "",
  previsao_entrega_unica: "", data_entrega_total: "", observacao: "",
};

export default function ComprasPage() {
  const { fazendaId } = useAuth();

  const [pedidos,         setPedidos]         = useState<PedidoCompra[]>([]);
  const [pessoas,         setPessoas]         = useState<Pessoa[]>([]);
  const [insumos,         setInsumos]         = useState<Insumo[]>([]);
  const [ciclos,          setCiclos]          = useState<Ciclo[]>([]);
  const [anosSafra,       setAnosSafra]       = useState<AnoSafra[]>([]);
  const [centrosCusto,    setCentrosCusto]    = useState<CentroCusto[]>([]);
  const [operacoes,       setOperacoes]       = useState<OperacaoGerencial[]>([]);
  const [loading,       setLoading]       = useState(true);
  const [salvando,      setSalvando]      = useState(false);
  const [erro,          setErro]          = useState<string | null>(null);

  // Modal novo pedido
  const [modal,         setModal]         = useState(false);
  const [abaModal,      setAbaModal]      = useState<"principal"|"desconto"|"entrega"|"cobranca"|"observacao">("principal");
  const [abaItens,      setAbaItens]      = useState<"itens"|"servicos"|"cc">("itens");
  const [f,             setF]             = useState({ ...PEDIDO_VAZIO });
  const [itens,         setItens]         = useState<ItemForm[]>([{ ...ITEM_VAZIO }]);
  const [pedidoEdit,    setPedidoEdit]    = useState<string | null>(null);

  // Modal entregas
  const [modalEntrega,  setModalEntrega]  = useState<{ pedido: PedidoCompra; itens: PedidoCompraItem[] } | null>(null);
  const [entregas,      setEntregas]      = useState<PedidoCompraEntrega[]>([]);
  const [formEntrega,   setFormEntrega]   = useState({ item_id: "", data_entrega: hoje(), quantidade_entregue: "", observacao: "" });

  // Modal relatório NFs
  const [modalRelatorio, setModalRelatorio] = useState<{ pedido: PedidoCompra; itens: PedidoCompraItem[]; entregas: PedidoCompraEntrega[] } | null>(null);

  // ── Carregamento ─────────────────────────────────────────────

  const carregar = useCallback(async () => {
    if (!fazendaId) return;
    setLoading(true);
    try {
      const [ped, pes, ins, cic, anos, cc, ops] = await Promise.all([
        listarPedidosCompra(fazendaId),
        listarPessoas(fazendaId),
        listarInsumos(fazendaId),
        listarTodosCiclos(fazendaId),
        listarAnosSafra(fazendaId),
        listarCentrosCustoGeral(fazendaId),
        listarOperacoesGerenciais(fazendaId),
      ]);
      setPedidos(ped);
      setPessoas(pes);
      setInsumos(ins);
      setCiclos(cic);
      setAnosSafra(anos);
      setCentrosCusto(cc);
      setOperacoes(ops);
    } catch (e: unknown) {
      setErro(e instanceof Error ? e.message : "Erro ao carregar");
    } finally {
      setLoading(false);
    }
  }, [fazendaId]);

  useEffect(() => { carregar(); }, [carregar]);

  // ── Helpers de label ─────────────────────────────────────────

  const nomePessoa = (id?: string) => id ? (pessoas.find(p => p.id === id)?.nome ?? "—") : "—";
  const nomeCiclo = (id?: string) => {
    if (!id) return "";
    const c = ciclos.find(x => x.id === id);
    if (!c) return "";
    const ano = anosSafra.find(a => a.id === c.ano_safra_id)?.descricao ?? "";
    const CULT: Record<string,string> = { soja:"Soja", milho1:"Milho 1ª", milho2:"Milho 2ª", algodao:"Algodão", sorgo:"Sorgo", trigo:"Trigo" };
    return `${CULT[c.cultura] ?? c.cultura}${ano ? ` · ${ano}` : ""}`;
  };
  const nomeOp = (idOrText?: string) => {
    if (!idOrText) return "—";
    const op = operacoes.find(o => o.id === idOrText);
    return op ? `${op.classificacao} — ${op.descricao}` : idOrText;
  };
  const ciclosFiltrados = (anoSafraId: string) =>
    anoSafraId ? ciclos.filter(c => c.ano_safra_id === anoSafraId) : ciclos;

  // ── Cálculos do pedido ────────────────────────────────────────

  const calcItem = (it: ItemForm) => {
    const qty = parseFloat(it.quantidade) || 0;
    const vu  = parseFloat(it.valor_unitario) || 0;
    return qty * vu;
  };
  const totalItens = itens.reduce((s, it) => s + calcItem(it), 0);

  // ── Abrir modal novo/editar ──────────────────────────────────

  const abrirNovo = () => {
    setF({ ...PEDIDO_VAZIO });
    setItens([{ ...ITEM_VAZIO }]);
    setPedidoEdit(null);
    setAbaModal("principal");
    setAbaItens("itens");
    setModal(true);
  };

  const abrirEditar = async (ped: PedidoCompra) => {
    setF({
      data_registro: ped.data_registro, tipo: ped.tipo ?? "Pedido Compra",
      fiscal: ped.fiscal ?? false, status: ped.status,
      cotacao_moeda: ped.cotacao_moeda ?? "R$", possui_ordem_compra: ped.possui_ordem_compra ?? false,
      entrega_unica: ped.entrega_unica ?? true,
      antecipacao_juros_pct: String(ped.antecipacao_juros_pct ?? ""),
      desc_antecipacao_pct: String(ped.desc_antecipacao_pct ?? ""),
      desc_pontualidade_pct: String(ped.desc_pontualidade_pct ?? ""),
      acrescimos_valor: String(ped.acrescimos_valor ?? ""),
      desconto_pct: String(ped.desconto_pct ?? ""),
      desconto_valor: String(ped.desconto_valor ?? ""),
      frete_total: String(ped.frete_total ?? ""),
      frete_tipo: ped.frete_tipo ?? "Pago",
      operacao: ped.operacao ?? "",
      operacao_nf: ped.operacao_nf ?? "", operacao_nf_auto: !ped.operacao_nf || ped.operacao_nf === ped.operacao,
      ano_safra_id: ped.ano_safra_id ?? "", ciclo_id: ped.ciclo_id ?? "",
      data_vencimento: ped.data_vencimento ?? "",
      meio_pagamento: ped.meio_pagamento ?? "",
      barter_ano_safra_id: ped.barter_ano_safra_id ?? "", barter_ciclo_id: ped.barter_ciclo_id ?? "",
      aprovador: ped.aprovador ?? "", nr_pedido: ped.nr_pedido ?? "",
      nr_solicitacao: ped.nr_solicitacao ?? "",
      fornecedor_id: ped.fornecedor_id ?? "", nr_pedido_fornecedor: ped.nr_pedido_fornecedor ?? "",
      variacao_cambial: String(ped.variacao_cambial ?? ""),
      deposito_previsao: ped.deposito_previsao ?? "", contato_fornecedor: ped.contato_fornecedor ?? "",
      comprador_id: ped.comprador_id ?? "", transportador: ped.transportador ?? "",
      propriedade_entrega: ped.propriedade_entrega ?? "",
      endereco_entrega: ped.endereco_entrega ?? "", cidade_entrega: ped.cidade_entrega ?? "",
      previsao_entrega_unica: ped.previsao_entrega_unica ?? "",
      data_entrega_total: ped.data_entrega_total ?? "", observacao: ped.observacao ?? "",
    });
    const itensSalvos = await listarPedidoCompraItens(ped.id);
    setItens(itensSalvos.length > 0 ? itensSalvos.map(it => ({
      id: it.id, tipo_item: it.tipo_item, insumo_id: it.insumo_id ?? "",
      nome_item: it.nome_item, unidade: it.unidade,
      quantidade: String(it.quantidade), valor_unitario: String(it.valor_unitario),
      qtd_cancelada: String(it.qtd_cancelada ?? 0), qtd_entregue: it.qtd_entregue ?? 0,
      centro_custo_id: it.centro_custo_id ?? "",
    })) : [{ ...ITEM_VAZIO }]);
    setPedidoEdit(ped.id);
    setAbaModal("principal");
    setAbaItens("itens");
    setModal(true);
  };

  // ── Salvar pedido ─────────────────────────────────────────────

  const salvar = async () => {
    if (!fazendaId) return;
    if (!f.fornecedor_id && !f.contato_fornecedor.trim()) { setErro("Informe o fornecedor"); return; }
    setSalvando(true); setErro(null);
    try {
      const payload: Omit<PedidoCompra, "id" | "created_at" | "numero"> = {
        fazenda_id: fazendaId, status: f.status,
        data_registro: f.data_registro, tipo: f.tipo, fiscal: f.fiscal,
        operacao: f.operacao || undefined,
        operacao_nf: f.operacao_nf || undefined,
        ano_safra_id: f.ano_safra_id || undefined,
        ciclo_id: f.ciclo_id || undefined,
        data_vencimento: f.data_vencimento || undefined,
        meio_pagamento: (f.meio_pagamento as PedidoCompra["meio_pagamento"]) || undefined,
        barter_ano_safra_id: f.barter_ano_safra_id || undefined,
        barter_ciclo_id: f.barter_ciclo_id || undefined,
        aprovador: f.aprovador || undefined, nr_pedido: f.nr_pedido || undefined,
        nr_solicitacao: f.nr_solicitacao || undefined,
        fornecedor_id: f.fornecedor_id || undefined,
        nr_pedido_fornecedor: f.nr_pedido_fornecedor || undefined,
        cotacao_moeda: f.cotacao_moeda,
        variacao_cambial: f.variacao_cambial ? parseFloat(f.variacao_cambial) : undefined,
        deposito_previsao: f.deposito_previsao || undefined,
        contato_fornecedor: f.contato_fornecedor || undefined,
        possui_ordem_compra: f.possui_ordem_compra,
        antecipacao_juros_pct: f.antecipacao_juros_pct ? parseFloat(f.antecipacao_juros_pct) : undefined,
        desc_antecipacao_pct: f.desc_antecipacao_pct ? parseFloat(f.desc_antecipacao_pct) : undefined,
        desc_pontualidade_pct: f.desc_pontualidade_pct ? parseFloat(f.desc_pontualidade_pct) : undefined,
        acrescimos_valor: f.acrescimos_valor ? parseFloat(f.acrescimos_valor) : undefined,
        desconto_pct: f.desconto_pct ? parseFloat(f.desconto_pct) : undefined,
        desconto_valor: f.desconto_valor ? parseFloat(f.desconto_valor) : undefined,
        frete_tipo: f.frete_tipo || undefined, frete_total: f.frete_total ? parseFloat(f.frete_total) : undefined,
        comprador_id: f.comprador_id || undefined,
        entrega_unica: f.entrega_unica,
        previsao_entrega_unica: f.previsao_entrega_unica || undefined,
        data_entrega_total: f.data_entrega_total || undefined,
        transportador: f.transportador || undefined,
        propriedade_entrega: f.propriedade_entrega || undefined,
        endereco_entrega: f.endereco_entrega || undefined,
        cidade_entrega: f.cidade_entrega || undefined,
        observacao: f.observacao || undefined,
        total_produtos_servicos: totalItens,
        total_financeiro: totalItens,
      };
      let pedidoId: string;
      if (pedidoEdit) {
        await atualizarPedidoCompra(pedidoEdit, payload);
        pedidoId = pedidoEdit;
      } else {
        const novo = await criarPedidoCompra(payload);
        pedidoId = novo.id;
      }
      const itensSalvar: Omit<PedidoCompraItem, "id" | "created_at" | "valor_total">[] = itens
        .filter(it => it.nome_item.trim())
        .map(it => ({
          pedido_id: pedidoId, fazenda_id: fazendaId,
          tipo_item: it.tipo_item,
          insumo_id: it.insumo_id || undefined,
          nome_item: it.nome_item, unidade: it.unidade,
          quantidade: parseFloat(it.quantidade) || 0,
          valor_unitario: parseFloat(it.valor_unitario) || 0,
          qtd_cancelada: parseFloat(it.qtd_cancelada) || 0,
          qtd_entregue: it.qtd_entregue,
          centro_custo_id: it.centro_custo_id || undefined,
        }));
      await salvarPedidoCompraItens(pedidoId, fazendaId, itensSalvar);

      // Gera CP em Contas a Pagar quando pedido é aprovado
      const pedidoExistente = pedidoEdit ? pedidos.find(p => p.id === pedidoEdit) : null;
      const deveGerarCP = f.status === "aprovado" && totalItens > 0 && !pedidoExistente?.lancamento_id;
      if (deveGerarCP) {
        const isUSD = f.cotacao_moeda === "USD";
        const fornecedorNome = pessoas.find(p => p.id === f.fornecedor_id)?.nome ?? f.contato_fornecedor ?? "Fornecedor";
        // Usa data_vencimento se informada; caso contrário, previsão de entrega ou data de registro
        const vencimento = f.data_vencimento || f.previsao_entrega_unica || f.data_registro;
        try {
          const lanc = await criarLancamento({
            fazenda_id:        fazendaId!,
            tipo:              "pagar",
            moeda:             isUSD ? "USD" : "BRL",
            cotacao_usd:       isUSD && f.variacao_cambial ? parseFloat(f.variacao_cambial) : undefined,
            descricao:         `Pedido de Compra nº ${f.nr_pedido || pedidoId.slice(0,8)} — ${fornecedorNome}`,
            categoria:         "Insumos",
            data_lancamento:   f.data_registro,
            data_vencimento:   vencimento,
            valor:             totalItens,
            status:            "em_aberto",
            auto:              true,
            pessoa_id:         f.fornecedor_id || undefined,
            origem_lancamento: "pedido_compra",
            pedido_compra_id:  pedidoId,
          });
          await atualizarPedidoCompra(pedidoId, { lancamento_id: lanc.id });
        } catch (lancErr: unknown) {
          const msg = (lancErr as { message?: string })?.message ?? String(lancErr);
          setErro(`Pedido salvo, mas erro ao gerar CP: ${msg}. Execute a migration de rastreabilidade no Supabase.`);
        }
      }

      setModal(false);
      await carregar();
    } catch (e: unknown) {
      setErro(e instanceof Error ? e.message : "Erro ao salvar");
    } finally {
      setSalvando(false);
    }
  };

  // ── Abrir modal entregas ──────────────────────────────────────

  const abrirEntregas = async (ped: PedidoCompra) => {
    const [its, ents] = await Promise.all([
      listarPedidoCompraItens(ped.id),
      listarPedidoCompraEntregas(ped.id),
    ]);
    setModalEntrega({ pedido: ped, itens: its });
    setEntregas(ents);
    setFormEntrega({ item_id: its[0]?.id ?? "", data_entrega: hoje(), quantidade_entregue: "", observacao: "" });
  };

  const salvarEntrega = async () => {
    if (!fazendaId || !modalEntrega || !formEntrega.item_id || !formEntrega.quantidade_entregue) return;
    setSalvando(true);
    try {
      const nova = await registrarEntrega({
        pedido_id: modalEntrega.pedido.id, fazenda_id: fazendaId,
        item_id: formEntrega.item_id,
        data_entrega: formEntrega.data_entrega,
        quantidade_entregue: parseFloat(formEntrega.quantidade_entregue),
        observacao: formEntrega.observacao || undefined,
      });
      setEntregas(e => [...e, nova]);
      const its = await listarPedidoCompraItens(modalEntrega.pedido.id);
      setModalEntrega(p => p ? { ...p, itens: its } : null);
      setFormEntrega(p => ({ ...p, quantidade_entregue: "" }));
      await carregar();
    } catch (e: unknown) {
      setErro(e instanceof Error ? e.message : "Erro ao registrar entrega");
    } finally {
      setSalvando(false);
    }
  };

  // ── Stats ─────────────────────────────────────────────────────

  const totalPedidos   = pedidos.length;
  const totalAberto    = pedidos.filter(p => p.status === "aprovado" || p.status === "parcialmente_entregue").length;
  const valorAberto    = pedidos.filter(p => p.status === "aprovado" || p.status === "parcialmente_entregue").reduce((s, p) => s + (p.total_financeiro ?? 0), 0);
  const totalEntregues = pedidos.filter(p => p.status === "entregue").length;

  // ── Render ────────────────────────────────────────────────────

  const tabAba = (id: typeof abaModal, label: string) => (
    <button onClick={() => setAbaModal(id)} style={{
      padding: "7px 16px", fontSize: 12, fontWeight: abaModal === id ? 600 : 400,
      color: abaModal === id ? "#1A5CB8" : "#555", background: "none", border: "none",
      borderBottom: abaModal === id ? "2px solid #1A5CB8" : "2px solid transparent",
      cursor: "pointer", whiteSpace: "nowrap",
    }}>{label}</button>
  );

  const tabItens = (id: typeof abaItens, label: string) => (
    <button onClick={() => setAbaItens(id)} style={{
      padding: "5px 14px", fontSize: 11, fontWeight: abaItens === id ? 600 : 400,
      color: abaItens === id ? "#1A5CB8" : "#666", background: abaItens === id ? "#EBF3FD" : "none",
      border: "0.5px solid " + (abaItens === id ? "#1A5CB880" : "#D4DCE8"),
      borderRadius: "6px 6px 0 0", cursor: "pointer",
    }}>{label}</button>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh", background: "#F4F6FA", fontFamily: "system-ui, sans-serif", fontSize: 13 }}>
      <TopNav />
      <main style={{ flex: 1, display: "flex", flexDirection: "column" }}>

        {/* Header */}
        <header style={{ background: "#fff", borderBottom: "0.5px solid #D4DCE8", padding: "10px 22px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 17, color: "#1a1a1a", fontWeight: 600 }}>Pedidos de Compra</h1>
            <p style={{ margin: 0, fontSize: 11, color: "#555" }}>Controle de compras de insumos, serviços e materiais</p>
          </div>
          <button style={btnV} onClick={abrirNovo}>+ Novo Pedido</button>
        </header>

        <div style={{ padding: "18px 22px", flex: 1 }}>

          {/* Stats */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 16 }}>
            {[
              { label: "Total de pedidos",   valor: String(totalPedidos),       cor: "#1A4870" },
              { label: "Pedidos em aberto",  valor: String(totalAberto),        cor: "#C9921B" },
              { label: "Valor em aberto",    valor: fmtBRL(valorAberto),        cor: "#E24B4A" },
              { label: "Pedidos entregues",  valor: String(totalEntregues),     cor: "#16A34A" },
            ].map((s, i) => (
              <div key={i} style={{ background: "#fff", border: "0.5px solid #D4DCE8", borderRadius: 12, padding: "14px 16px" }}>
                <div style={{ fontSize: 11, color: "#555", marginBottom: 6 }}>{s.label}</div>
                <div style={{ fontSize: 18, fontWeight: 600, color: s.cor }}>{s.valor}</div>
              </div>
            ))}
          </div>

          {erro && (
            <div style={{ background: "#FCEBEB", border: "0.5px solid #E24B4A60", borderRadius: 8, padding: "8px 14px", marginBottom: 12, fontSize: 12, color: "#791F1F", display: "flex", justifyContent: "space-between" }}>
              {erro} <button onClick={() => setErro(null)} style={{ background: "none", border: "none", cursor: "pointer", color: "#791F1F" }}>×</button>
            </div>
          )}

          {/* Tabela */}
          {loading ? (
            <div style={{ textAlign: "center", padding: 48, color: "#555" }}>Carregando...</div>
          ) : pedidos.length === 0 ? (
            <div style={{ background: "#fff", border: "0.5px solid #D4DCE8", borderRadius: 12, padding: 48, textAlign: "center", color: "#555" }}>
              Nenhum pedido de compra cadastrado.
            </div>
          ) : (
            <div style={{ background: "#fff", border: "0.5px solid #D4DCE8", borderRadius: 12, overflow: "hidden" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ background: "#F3F6F9" }}>
                    {["Nº", "Fornecedor", "Safra", "Data", "Tipo", "Total", "Status", ""].map((h, i) => (
                      <th key={i} style={{ padding: "8px 14px", textAlign: i === 0 ? "center" : i >= 5 ? "center" : "left", fontSize: 11, fontWeight: 600, color: "#555", borderBottom: "0.5px solid #D4DCE8" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {pedidos.map((ped, i) => {
                    const st = STATUS_MAP[ped.status];
                    return (
                      <tr key={ped.id} style={{ borderBottom: i < pedidos.length - 1 ? "0.5px solid #DEE5EE" : "none" }}>
                        <td style={{ padding: "10px 14px", textAlign: "center", fontWeight: 600, color: "#1A4870" }}>#{ped.numero ?? "—"}</td>
                        <td style={{ padding: "10px 14px" }}>
                          <div style={{ fontWeight: 600, color: "#1a1a1a" }}>{nomePessoa(ped.fornecedor_id)}</div>
                          {ped.nr_pedido && <div style={{ fontSize: 11, color: "#555" }}>Ped.: {ped.nr_pedido}</div>}
                        </td>
                        <td style={{ padding: "10px 14px", color: "#555" }}>{ped.safra_texto || nomeCiclo(ped.ciclo_id) || "—"}</td>
                        <td style={{ padding: "10px 14px", color: "#1a1a1a" }}>{fmtData(ped.data_registro)}</td>
                        <td style={{ padding: "10px 14px", color: "#555" }}>{ped.tipo ?? "—"}</td>
                        <td style={{ padding: "10px 14px", textAlign: "center", fontWeight: 600, color: "#1A4870" }}>{fmtBRL(ped.total_financeiro)}</td>
                        <td style={{ padding: "10px 14px", textAlign: "center" }}>
                          <span style={{ fontSize: 10, background: st.bg, color: st.color, padding: "2px 8px", borderRadius: 8, fontWeight: 600 }}>{st.label}</span>
                        </td>
                        <td style={{ padding: "10px 14px" }}>
                          <div style={{ display: "flex", gap: 5, justifyContent: "flex-end" }}>
                            <button style={{ ...btnR, fontSize: 11, padding: "4px 10px" }} onClick={() => abrirEntregas(ped)}>Entregas</button>
                            <button style={{ ...btnR, fontSize: 11, padding: "4px 10px" }} onClick={async () => {
                              const [its, ents] = await Promise.all([listarPedidoCompraItens(ped.id), listarPedidoCompraEntregas(ped.id)]);
                              setModalRelatorio({ pedido: ped, itens: its, entregas: ents });
                            }}>Relatório</button>
                            <button style={{ ...btnR, fontSize: 11, padding: "4px 10px" }} onClick={() => abrirEditar(ped)}>Editar</button>
                            <button style={btnX} onClick={async () => { if (confirm("Excluir pedido?")) { await excluirPedidoCompra(ped.id); await carregar(); } }}>✕</button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>

      {/* ── MODAL NOVO / EDITAR PEDIDO ── */}
      {modal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 110 }}
          onClick={e => { if (e.target === e.currentTarget) setModal(false); }}>
          <div style={{ background: "#fff", borderRadius: 14, width: 920, maxWidth: "98vw", maxHeight: "95vh", overflowY: "auto" }}>

            {/* Header modal */}
            <div style={{ padding: "16px 22px 0", borderBottom: "0.5px solid #D4DCE8" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                <div style={{ fontWeight: 600, fontSize: 15, color: "#1a1a1a" }}>{pedidoEdit ? "Editar Pedido de Compra" : "Novo Pedido de Compra"}</div>
                <button onClick={() => setModal(false)} style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer", color: "#555" }}>×</button>
              </div>
              {/* Abas */}
              <div style={{ display: "flex", gap: 0, overflowX: "auto" }}>
                {tabAba("principal",  "Principal")}
                {tabAba("desconto",   "Desconto / Juros")}
                {tabAba("entrega",    "Entrega")}
                {tabAba("cobranca",   "Cobrança")}
                {tabAba("observacao", "Observação")}
              </div>
            </div>

            <div style={{ padding: "18px 22px" }}>

              {/* ── ABA PRINCIPAL ── */}
              {abaModal === "principal" && (<>
                {/* Linha 1: Operação + Safra + Pedido + Datas */}
                <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr 1fr 1fr", gap: 12, marginBottom: 12 }}>
                  <div>
                    <label style={lbl}>Operação</label>
                    <select style={inp} value={f.operacao} onChange={e => {
                      const opId = e.target.value;
                      const op = operacoes.find(o => o.id === opId);
                      const autoNf = !!op?.permite_notas_fiscais;
                      setF(p => ({ ...p, operacao: opId, operacao_nf: autoNf ? opId : p.operacao_nf, operacao_nf_auto: autoNf }));
                    }}>
                      <option value="">— Selecionar —</option>
                      {operacoes.filter(o => o.permite_cp_cr && !o.inativo).map(o => (
                        <option key={o.id} value={o.id}>{o.classificacao} — {o.descricao}</option>
                      ))}
                      {operacoes.filter(o => o.permite_cp_cr && !o.inativo).length === 0 && (
                        <option disabled value="">Configure em Cadastros → Operações Gerenciais</option>
                      )}
                    </select>
                  </div>
                  <div>
                    <label style={lbl}>Ano Safra</label>
                    <select style={inp} value={f.ano_safra_id} onChange={e => setF(p => ({ ...p, ano_safra_id: e.target.value, ciclo_id: "" }))}>
                      <option value="">— Todos —</option>
                      {anosSafra.map(a => <option key={a.id} value={a.id}>{a.descricao}</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={lbl}>Ciclo</label>
                    <select style={inp} value={f.ciclo_id} onChange={e => setF(p => ({ ...p, ciclo_id: e.target.value }))}>
                      <option value="">— Selecionar —</option>
                      {ciclosFiltrados(f.ano_safra_id).map(c => {
                        const CULT: Record<string,string> = { soja:"Soja", milho1:"Milho 1ª", milho2:"Milho 2ª", algodao:"Algodão", sorgo:"Sorgo", trigo:"Trigo" };
                        return <option key={c.id} value={c.id}>{CULT[c.cultura] ?? c.cultura}</option>;
                      })}
                    </select>
                  </div>
                  <div>
                    <label style={lbl}>Nr. Pedido/Ordem</label>
                    <input style={inp} value={f.nr_pedido} onChange={e => setF(p => ({ ...p, nr_pedido: e.target.value }))} />
                  </div>
                  <div>
                    <label style={lbl}>Data Registro *</label>
                    <input style={inp} type="date" value={f.data_registro} onChange={e => setF(p => ({ ...p, data_registro: e.target.value }))} />
                  </div>
                  <div>
                    <label style={lbl}>Data Vencimento</label>
                    <input style={inp} type="date" value={f.data_vencimento} onChange={e => setF(p => ({ ...p, data_vencimento: e.target.value }))} />
                  </div>
                </div>

                {/* Linha 2: Aprovador + Tipo + Status + Moeda + Flags + Nr. Solicitação */}
                <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr 1fr 1fr", gap: 12, marginBottom: 12 }}>
                  <div>
                    <label style={lbl}>Aprovador</label>
                    <input style={inp} value={f.aprovador} onChange={e => setF(p => ({ ...p, aprovador: e.target.value }))} />
                  </div>
                  <div>
                    <label style={lbl}>Tipo</label>
                    <select style={inp} value={f.tipo} onChange={e => setF(p => ({ ...p, tipo: e.target.value }))}>
                      <option>Pedido Compra</option>
                      <option>Ordem de Serviço</option>
                      <option>Contrato</option>
                    </select>
                  </div>
                  <div>
                    <label style={lbl}>Status</label>
                    <select style={inp} value={f.status} onChange={e => setF(p => ({ ...p, status: e.target.value as PedidoCompra["status"] }))}>
                      <option value="rascunho">Rascunho</option>
                      <option value="aprovado">Aprovado</option>
                      <option value="cancelado">Cancelado</option>
                    </select>
                  </div>
                  <div>
                    <label style={lbl}>Cotação Moeda</label>
                    <select style={inp} value={f.cotacao_moeda} onChange={e => setF(p => ({ ...p, cotacao_moeda: e.target.value }))}>
                      <option value="R$">R$</option>
                      <option value="USD">USD</option>
                    </select>
                  </div>
                  <div>
                    <label style={lbl}>Nr. Solicitação</label>
                    <input style={inp} value={f.nr_solicitacao} onChange={e => setF(p => ({ ...p, nr_solicitacao: e.target.value }))} />
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", justifyContent: "flex-end", gap: 4, paddingBottom: 2 }}>
                    <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", fontSize: 12 }}>
                      <input type="checkbox" checked={f.fiscal} onChange={e => setF(p => ({ ...p, fiscal: e.target.checked }))} />
                      Fiscal
                    </label>
                    <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", fontSize: 12 }}>
                      <input type="checkbox" checked={f.possui_ordem_compra} onChange={e => setF(p => ({ ...p, possui_ordem_compra: e.target.checked }))} />
                      Possui O.C.
                    </label>
                  </div>
                </div>

                {/* Linha 3: Fornecedor + Nr. Ped. Forn. + Contato + Variação Cambial */}
                <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr", gap: 12, marginBottom: 12 }}>
                  <div>
                    <label style={lbl}>
                      Fornecedor *
                      {pessoas.length === 0 && (
                        <span style={{ marginLeft: 6, fontSize: 10, color: "#888", fontWeight: 400 }}>
                          — <a href="/cadastros?tab=pessoas" target="_blank" style={{ color: "#1A4870" }}>Cadastrar em Pessoas</a>
                        </span>
                      )}
                    </label>
                    {pessoas.length > 0 ? (
                      <select style={inp} value={f.fornecedor_id} onChange={e => setF(p => ({ ...p, fornecedor_id: e.target.value, contato_fornecedor: "" }))}>
                        <option value="">— Selecionar —</option>
                        {pessoas.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
                      </select>
                    ) : (
                      <input
                        style={inp}
                        placeholder="Digite o nome do fornecedor"
                        value={f.contato_fornecedor}
                        onChange={e => setF(p => ({ ...p, contato_fornecedor: e.target.value, fornecedor_id: "" }))}
                      />
                    )}
                  </div>
                  <div>
                    <label style={lbl}>Nr. Pedido Fornecedor</label>
                    <input style={inp} value={f.nr_pedido_fornecedor} onChange={e => setF(p => ({ ...p, nr_pedido_fornecedor: e.target.value }))} />
                  </div>
                  <div>
                    <label style={lbl}>Contato Fornecedor</label>
                    <input style={inp} value={f.contato_fornecedor} onChange={e => setF(p => ({ ...p, contato_fornecedor: e.target.value }))} />
                  </div>
                  <div>
                    <label style={lbl}>Variação Cambial</label>
                    <input style={inp} type="number" step="0.0001" value={f.variacao_cambial} onChange={e => setF(p => ({ ...p, variacao_cambial: e.target.value }))} placeholder="0,0000" />
                  </div>
                </div>

                {/* Linha 4: Operação NF (auto) + Meio de Pagamento */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 4 }}>
                  <div>
                    <label style={{ ...lbl, display: "flex", alignItems: "center", gap: 6 }}>
                      Operação das Notas Fiscais
                      {f.operacao_nf_auto && f.operacao_nf
                        ? <span style={{ fontSize: 10, background: "#D5E8F5", color: "#0B2D50", padding: "1px 6px", borderRadius: 6, fontWeight: 600 }}>Auto</span>
                        : f.operacao_nf
                        ? <span style={{ fontSize: 10, background: "#FBF3E0", color: "#8A6200", padding: "1px 6px", borderRadius: 6, fontWeight: 600 }}>Manual</span>
                        : null}
                    </label>
                    {f.operacao_nf_auto && f.operacao_nf ? (
                      <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                        <div style={{ ...inp, flex: 1, background: "#F4F6FA", color: "#555", fontSize: 12 }}>
                          {nomeOp(f.operacao_nf)}
                        </div>
                        <button type="button" onClick={() => setF(p => ({ ...p, operacao_nf_auto: false }))}
                          style={{ fontSize: 11, padding: "7px 10px", border: "0.5px solid #D4DCE8", borderRadius: 7, background: "#fff", cursor: "pointer", color: "#555", whiteSpace: "nowrap" }}>
                          Alterar
                        </button>
                      </div>
                    ) : (
                      <select style={inp} value={f.operacao_nf} onChange={e => setF(p => ({ ...p, operacao_nf: e.target.value, operacao_nf_auto: false }))}>
                        <option value="">— Selecionar —</option>
                        {operacoes.filter(o => o.permite_notas_fiscais && !o.inativo).map(o => (
                          <option key={o.id} value={o.id}>{o.classificacao} — {o.descricao}</option>
                        ))}
                        {operacoes.filter(o => o.permite_notas_fiscais && !o.inativo).length === 0 && (
                          <option disabled value="">Configure em Cadastros → Operações Gerenciais</option>
                        )}
                      </select>
                    )}
                  </div>

                  {/* Meio de Pagamento */}
                  <div>
                    <label style={lbl}>Meio de Pagamento</label>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      {([
                        { v: "pix",          label: "PIX"           },
                        { v: "transferencia", label: "Transferência" },
                        { v: "boleto",       label: "Boleto"        },
                        { v: "barter",       label: "Barter"        },
                      ] as { v: string; label: string }[]).map(({ v, label }) => (
                        <button key={v} type="button"
                          onClick={() => setF(p => ({ ...p, meio_pagamento: p.meio_pagamento === v ? "" : v }))}
                          style={{
                            padding: "6px 14px", borderRadius: 20, fontSize: 12, fontWeight: 600, cursor: "pointer",
                            border: "0.5px solid",
                            borderColor: f.meio_pagamento === v ? (v === "barter" ? "#C9921B" : "#1A5CB8") : "#D4DCE8",
                            background:  f.meio_pagamento === v ? (v === "barter" ? "#FBF3E0" : "#D5E8F5") : "#fff",
                            color:       f.meio_pagamento === v ? (v === "barter" ? "#7A5200" : "#0B2D50") : "#555",
                          }}>
                          {label}
                        </button>
                      ))}
                    </div>

                    {/* Barter: campos de comprometimento de safra */}
                    {f.meio_pagamento === "barter" && (
                      <div style={{ marginTop: 10, padding: "12px 14px", background: "#FBF3E0", borderRadius: 8, border: "0.5px solid #C9921B50" }}>
                        <div style={{ fontSize: 11, color: "#7A5200", fontWeight: 600, marginBottom: 8 }}>
                          Barter — compromete saldo de grãos na safra indicada
                        </div>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                          <div>
                            <label style={{ ...lbl, color: "#7A5200" }}>Ano Safra (Barter)</label>
                            <select style={inp} value={f.barter_ano_safra_id} onChange={e => setF(p => ({ ...p, barter_ano_safra_id: e.target.value, barter_ciclo_id: "" }))}>
                              <option value="">— Selecionar —</option>
                              {anosSafra.map(a => <option key={a.id} value={a.id}>{a.descricao}</option>)}
                            </select>
                          </div>
                          <div>
                            <label style={{ ...lbl, color: "#7A5200" }}>Ciclo (Barter)</label>
                            <select style={inp} value={f.barter_ciclo_id} onChange={e => setF(p => ({ ...p, barter_ciclo_id: e.target.value }))}>
                              <option value="">— Selecionar —</option>
                              {ciclosFiltrados(f.barter_ano_safra_id).map(c => {
                                const CULT: Record<string,string> = { soja:"Soja", milho1:"Milho 1ª", milho2:"Milho 2ª", algodao:"Algodão", sorgo:"Sorgo", trigo:"Trigo" };
                                return <option key={c.id} value={c.id}>{CULT[c.cultura] ?? c.cultura}</option>;
                              })}
                            </select>
                          </div>
                        </div>
                        <div style={{ fontSize: 10, color: "#7A5200", marginTop: 6 }}>
                          Contrato de Barter criado automaticamente ao aprovar o pedido
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Grade de itens */}
                <div style={{ marginTop: 18 }}>
                  <div style={{ display: "flex", gap: 4, marginBottom: 0 }}>
                    {tabItens("itens",    "Itens")}
                    {tabItens("servicos", "Serviços")}
                    {tabItens("cc",       "Centro de Custo")}
                  </div>
                  <div style={{ border: "0.5px solid #D4DCE8", borderRadius: "0 8px 8px 8px", padding: 12 }}>
                    {(abaItens === "itens" || abaItens === "servicos") && (() => {
                      const tipo = abaItens === "itens" ? "produto" : "servico";
                      const lista = itens.map((it, idx) => ({ ...it, _idx: idx })).filter(it => it.tipo_item === tipo);
                      return (<>
                        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                          <thead><tr style={{ background: "#F3F6F9" }}>
                            {["Tipo Item","Item","Un.","Quantidade","Valor Unitário","Valor Total","Qtd. Cancel.",""].map((h, i) => (
                              <th key={i} style={{ padding: "6px 8px", textAlign: i >= 3 ? "right" : "left", fontSize: 11, fontWeight: 600, color: "#555", borderBottom: "0.5px solid #D4DCE8" }}>{h}</th>
                            ))}
                          </tr></thead>
                          <tbody>
                            {lista.length === 0 && (
                              <tr><td colSpan={8} style={{ padding: "16px 8px", textAlign: "center", color: "#888", fontSize: 12 }}>Nenhum item. Clique em "+ Item" para adicionar.</td></tr>
                            )}
                            {lista.map(it => (
                              <tr key={it._idx} style={{ borderBottom: "0.5px solid #DEE5EE" }}>
                                <td style={{ padding: "5px 6px", width: 90 }}>
                                  <span style={{ fontSize: 10, background: it.tipo_item === "produto" ? "#D5E8F5" : "#FBF3E0", color: it.tipo_item === "produto" ? "#0B2D50" : "#7A5200", padding: "2px 6px", borderRadius: 6, fontWeight: 600 }}>{it.tipo_item === "produto" ? "Produto" : "Serviço"}</span>
                                </td>
                                <td style={{ padding: "5px 6px" }}>
                                  <select style={{ ...inp, fontSize: 12 }} value={it.insumo_id} onChange={e => {
                                    const ins = insumos.find(i => i.id === e.target.value);
                                    setItens(prev => prev.map((x, j) => j === it._idx ? { ...x, insumo_id: e.target.value, nome_item: ins?.nome ?? x.nome_item, unidade: ins?.unidade ?? x.unidade } : x));
                                  }}>
                                    <option value="">— Selecionar insumo —</option>
                                    {insumos.map(i => <option key={i.id} value={i.id}>{i.nome} ({i.unidade})</option>)}
                                  </select>
                                  {!it.insumo_id && <input style={{ ...inp, fontSize: 12, marginTop: 4 }} value={it.nome_item} onChange={e => setItens(prev => prev.map((x, j) => j === it._idx ? { ...x, nome_item: e.target.value } : x))} placeholder="Ou digite o nome" />}
                                </td>
                                <td style={{ padding: "5px 6px", width: 60 }}>
                                  <select style={{ ...inp, fontSize: 12 }} value={it.unidade} onChange={e => setItens(prev => prev.map((x, j) => j === it._idx ? { ...x, unidade: e.target.value } : x))}>
                                    {["kg","sc","t","L","mL","g","un","cx","m","m²","m³","hr"].map(u => <option key={u} value={u}>{u}</option>)}
                                  </select>
                                </td>
                                <td style={{ padding: "5px 6px", width: 90 }}>
                                  <input style={{ ...inp, fontSize: 12, textAlign: "right" }} type="number" step="0.001" value={it.quantidade} onChange={e => setItens(prev => prev.map((x, j) => j === it._idx ? { ...x, quantidade: e.target.value } : x))} placeholder="0" />
                                </td>
                                <td style={{ padding: "5px 6px", width: 110 }}>
                                  <input style={{ ...inp, fontSize: 12, textAlign: "right" }} type="number" step="0.01" value={it.valor_unitario} onChange={e => setItens(prev => prev.map((x, j) => j === it._idx ? { ...x, valor_unitario: e.target.value } : x))} placeholder="0,00" />
                                </td>
                                <td style={{ padding: "5px 6px", textAlign: "right", width: 100, color: "#1A4870", fontWeight: 600 }}>
                                  {calcItem(it) > 0 ? fmtMoeda(calcItem(it), f.cotacao_moeda) : "—"}
                                </td>
                                <td style={{ padding: "5px 6px", width: 80 }}>
                                  <input style={{ ...inp, fontSize: 12, textAlign: "right" }} type="number" step="0.001" value={it.qtd_cancelada} onChange={e => setItens(prev => prev.map((x, j) => j === it._idx ? { ...x, qtd_cancelada: e.target.value } : x))} />
                                </td>
                                <td style={{ padding: "5px 6px", width: 36 }}>
                                  <button style={btnX} onClick={() => setItens(prev => prev.filter((_, j) => j !== it._idx))}>✕</button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                          <tfoot>
                            <tr style={{ background: "#F3F6F9" }}>
                              <td colSpan={5} style={{ padding: "6px 8px", textAlign: "right", fontSize: 11, color: "#555", fontWeight: 600 }}>Total {tipo === "produto" ? "Produtos" : "Serviços"}</td>
                              <td style={{ padding: "6px 8px", textAlign: "right", fontWeight: 700, color: "#1A4870" }}>{fmtMoeda(lista.reduce((s, it) => s + calcItem(it), 0), f.cotacao_moeda)}</td>
                              <td colSpan={2} />
                            </tr>
                          </tfoot>
                        </table>
                        <button style={{ ...btnR, fontSize: 11, marginTop: 8 }} onClick={() => setItens(p => [...p, { ...ITEM_VAZIO, tipo_item: tipo }])}>+ Item</button>
                      </>);
                    })()}
                    {abaItens === "cc" && (
                      <div>
                        <div style={{ fontSize: 12, color: "#555", marginBottom: 10 }}>Vincule cada item a um centro de custo:</div>
                        {itens.filter(it => it.nome_item || it.insumo_id).map((it, idx) => (
                          <div key={idx} style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 8, padding: "8px 10px", background: "#F8FAFD", borderRadius: 7, border: "0.5px solid #D4DCE8" }}>
                            <div style={{ fontSize: 12, color: "#1a1a1a", display: "flex", alignItems: "center" }}>{it.nome_item || insumos.find(i => i.id === it.insumo_id)?.nome || "Item sem nome"}</div>
                            <div>
                              <label style={lbl}>Centro de Custo</label>
                              <select style={inp} value={it.centro_custo_id} onChange={e => setItens(prev => prev.map((x, j) => j === idx ? { ...x, centro_custo_id: e.target.value } : x))}>
                                <option value="">— Sem vínculo —</option>
                                {centrosCusto.map(cc => <option key={cc.id} value={cc.id}>{cc.codigo ? `${cc.codigo} — ` : ""}{cc.nome}</option>)}
                              </select>
                            </div>
                          </div>
                        ))}
                        {itens.filter(it => it.nome_item || it.insumo_id).length === 0 && (
                          <div style={{ color: "#888", fontSize: 12, textAlign: "center", padding: 16 }}>Adicione itens na aba "Itens" primeiro.</div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </>)}

              {/* ── ABA DESCONTO / JUROS ── */}
              {abaModal === "desconto" && (<>
                <div style={secTit}>Antecipação, Pontualidade e Juros</div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
                  <div><label style={lbl}>Antec. e Juros (%)</label><input style={inp} type="number" step="0.01" value={f.antecipacao_juros_pct} onChange={e => setF(p => ({ ...p, antecipacao_juros_pct: e.target.value }))} /></div>
                  <div><label style={lbl}>% Desc. Antecip.</label><input style={inp} type="number" step="0.01" value={f.desc_antecipacao_pct} onChange={e => setF(p => ({ ...p, desc_antecipacao_pct: e.target.value }))} /></div>
                  <div><label style={lbl}>% Desc. Pontual.</label><input style={inp} type="number" step="0.01" value={f.desc_pontualidade_pct} onChange={e => setF(p => ({ ...p, desc_pontualidade_pct: e.target.value }))} /></div>
                  <div><label style={lbl}>Acréscimos (R$)</label><input style={inp} type="number" step="0.01" value={f.acrescimos_valor} onChange={e => setF(p => ({ ...p, acrescimos_valor: e.target.value }))} /></div>
                </div>
                <div style={secTit}>Descontos</div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
                  <div><label style={lbl}>% Desconto</label><input style={inp} type="number" step="0.01" value={f.desconto_pct} onChange={e => setF(p => ({ ...p, desconto_pct: e.target.value }))} /></div>
                  <div><label style={lbl}>Valor Desconto (R$)</label><input style={inp} type="number" step="0.01" value={f.desconto_valor} onChange={e => setF(p => ({ ...p, desconto_valor: e.target.value }))} /></div>
                  <div><label style={lbl}>Comprador</label>
                    <select style={inp} value={f.comprador_id} onChange={e => setF(p => ({ ...p, comprador_id: e.target.value }))}>
                      <option value="">—</option>
                      {pessoas.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
                    </select>
                  </div>
                </div>
                <div style={secTit}>Frete</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  <div><label style={lbl}>Tipo de Frete</label>
                    <select style={inp} value={f.frete_tipo} onChange={e => setF(p => ({ ...p, frete_tipo: e.target.value }))}>
                      <option>Pago</option><option>CIF</option><option>FOB</option><option>Isento</option>
                    </select>
                  </div>
                  <div><label style={lbl}>Total Frete (R$)</label><input style={inp} type="number" step="0.01" value={f.frete_total} onChange={e => setF(p => ({ ...p, frete_total: e.target.value }))} /></div>
                </div>
              </>)}

              {/* ── ABA ENTREGA ── */}
              {abaModal === "entrega" && (<>
                <div style={secTit}>Datas de Entrega</div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
                  <div style={{ display: "flex", flexDirection: "column", justifyContent: "center" }}>
                    <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, cursor: "pointer" }}>
                      <input type="checkbox" checked={f.entrega_unica} onChange={e => setF(p => ({ ...p, entrega_unica: e.target.checked }))} />
                      Entrega Única
                    </label>
                  </div>
                  <div><label style={lbl}>Previsão Entrega Única</label><input style={inp} type="date" value={f.previsao_entrega_unica} onChange={e => setF(p => ({ ...p, previsao_entrega_unica: e.target.value }))} /></div>
                  <div><label style={lbl}>Data Entrega Total</label><input style={inp} type="date" value={f.data_entrega_total} onChange={e => setF(p => ({ ...p, data_entrega_total: e.target.value }))} /></div>
                </div>
                <div style={secTit}>Local de Entrega</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  <div><label style={lbl}>Transportador</label><input style={inp} value={f.transportador} onChange={e => setF(p => ({ ...p, transportador: e.target.value }))} /></div>
                  <div><label style={lbl}>Propriedade</label><input style={inp} value={f.propriedade_entrega} onChange={e => setF(p => ({ ...p, propriedade_entrega: e.target.value }))} /></div>
                  <div><label style={lbl}>Endereço</label><input style={inp} value={f.endereco_entrega} onChange={e => setF(p => ({ ...p, endereco_entrega: e.target.value }))} /></div>
                  <div><label style={lbl}>Cidade</label><input style={inp} value={f.cidade_entrega} onChange={e => setF(p => ({ ...p, cidade_entrega: e.target.value }))} /></div>
                </div>
              </>)}

              {/* ── ABA COBRANÇA ── */}
              {abaModal === "cobranca" && (<>
                <div style={secTit}>Cobrança</div>
                <div style={{ marginBottom: 14, padding: "10px 14px", background: "#D5E8F5", borderRadius: 8, fontSize: 12, color: "#0B2D50" }}>
                  Condições de pagamento (À Vista / Parcelado) são definidas na tela <strong>Contas a Pagar</strong> ao registrar o lançamento vinculado a este pedido.
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  <div><label style={lbl}>Depósito do Fornecedor para Previsão</label><input style={inp} value={f.deposito_previsao} onChange={e => setF(p => ({ ...p, deposito_previsao: e.target.value }))} /></div>
                  <div>
                    <label style={lbl}>Comprador</label>
                    <select style={inp} value={f.comprador_id} onChange={e => setF(p => ({ ...p, comprador_id: e.target.value }))}>
                      <option value="">—</option>
                      {pessoas.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
                    </select>
                  </div>
                </div>
              </>)}

              {/* ── ABA OBSERVAÇÃO ── */}
              {abaModal === "observacao" && (<>
                <div style={secTit}>Observação</div>
                <textarea style={{ ...inp, height: 140, resize: "vertical" }} value={f.observacao} onChange={e => setF(p => ({ ...p, observacao: e.target.value }))} placeholder="Observações gerais sobre o pedido..." />
              </>)}

              {/* Footer */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 22, paddingTop: 14, borderTop: "0.5px solid #D4DCE8" }}>
                <div style={{ fontSize: 13, color: "#555" }}>
                  Total Financeiro: <strong style={{ color: "#1A4870", fontSize: 15 }}>{fmtMoeda(totalItens, f.cotacao_moeda)}</strong>
                  {"  ·  "}Total Prod+Serviços: <strong style={{ color: "#1A4870", fontSize: 15 }}>{fmtMoeda(totalItens, f.cotacao_moeda)}</strong>
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <button style={btnR} onClick={() => setModal(false)}>Cancelar</button>
                  <button style={{ ...btnV, opacity: salvando || (!f.fornecedor_id && !f.contato_fornecedor.trim()) ? 0.5 : 1 }} disabled={salvando || (!f.fornecedor_id && !f.contato_fornecedor.trim())} onClick={salvar}>
                    {salvando ? "Salvando…" : pedidoEdit ? "Salvar Alterações" : "Criar Pedido"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL ENTREGAS ── */}
      {modalEntrega && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 120 }}
          onClick={e => { if (e.target === e.currentTarget) setModalEntrega(null); }}>
          <div style={{ background: "#fff", borderRadius: 14, width: 720, maxWidth: "97vw", maxHeight: "90vh", overflowY: "auto" }}>
            <div style={{ padding: "16px 22px", borderBottom: "0.5px solid #D4DCE8", display: "flex", justifyContent: "space-between" }}>
              <div>
                <div style={{ fontWeight: 600, fontSize: 15 }}>Entregas — {nomePessoa(modalEntrega.pedido.fornecedor_id)}</div>
                <div style={{ fontSize: 11, color: "#555" }}>Pedido #{modalEntrega.pedido.numero} · {fmtData(modalEntrega.pedido.data_registro)}</div>
              </div>
              <button onClick={() => setModalEntrega(null)} style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer", color: "#555" }}>×</button>
            </div>
            <div style={{ padding: 22 }}>

              {/* Situação dos itens */}
              <div style={secTit}>Situação dos Itens</div>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, marginBottom: 16 }}>
                <thead><tr style={{ background: "#F3F6F9" }}>
                  {["Item","Un.","Qtd. Pedida","Qtd. Entregue","Saldo","Status"].map((h, i) => (
                    <th key={i} style={{ padding: "6px 10px", textAlign: i >= 2 ? "right" : "left", fontSize: 11, fontWeight: 600, color: "#555", borderBottom: "0.5px solid #D4DCE8" }}>{h}</th>
                  ))}
                </tr></thead>
                <tbody>
                  {modalEntrega.itens.map(it => {
                    const entregue = it.qtd_entregue ?? 0;
                    const cancelada = it.qtd_cancelada ?? 0;
                    const pendente = Math.max(0, it.quantidade - cancelada - entregue);
                    const pct = it.quantidade > 0 ? (entregue / (it.quantidade - cancelada)) * 100 : 0;
                    return (
                      <tr key={it.id} style={{ borderBottom: "0.5px solid #DEE5EE" }}>
                        <td style={{ padding: "8px 10px" }}>{it.nome_item}</td>
                        <td style={{ padding: "8px 10px" }}>{it.unidade}</td>
                        <td style={{ padding: "8px 10px", textAlign: "right" }}>{fmtN(it.quantidade)}</td>
                        <td style={{ padding: "8px 10px", textAlign: "right", color: "#16A34A", fontWeight: 600 }}>{fmtN(entregue)}</td>
                        <td style={{ padding: "8px 10px", textAlign: "right", color: pendente > 0 ? "#C9921B" : "#16A34A", fontWeight: 600 }}>{fmtN(pendente)}</td>
                        <td style={{ padding: "8px 10px", textAlign: "right" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8, justifyContent: "flex-end" }}>
                            <div style={{ width: 60, height: 6, background: "#D4DCE8", borderRadius: 3, overflow: "hidden" }}>
                              <div style={{ width: `${Math.min(100, pct)}%`, height: "100%", background: pct >= 100 ? "#16A34A" : "#1A5CB8", borderRadius: 3 }} />
                            </div>
                            <span style={{ fontSize: 10, color: "#555" }}>{Math.round(pct)}%</span>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              {/* Registrar nova entrega */}
              <div style={secTit}>Registrar Nova Entrega</div>
              <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 2fr", gap: 12, alignItems: "end" }}>
                <div>
                  <label style={lbl}>Item</label>
                  <select style={inp} value={formEntrega.item_id} onChange={e => setFormEntrega(p => ({ ...p, item_id: e.target.value }))}>
                    {modalEntrega.itens.map(it => <option key={it.id} value={it.id}>{it.nome_item} ({it.unidade})</option>)}
                  </select>
                </div>
                <div>
                  <label style={lbl}>Data Entrega</label>
                  <input style={inp} type="date" value={formEntrega.data_entrega} onChange={e => setFormEntrega(p => ({ ...p, data_entrega: e.target.value }))} />
                </div>
                <div>
                  <label style={lbl}>Qtd. Entregue</label>
                  <input style={inp} type="number" step="0.001" value={formEntrega.quantidade_entregue} onChange={e => setFormEntrega(p => ({ ...p, quantidade_entregue: e.target.value }))} placeholder="0,000" />
                </div>
                <div>
                  <label style={lbl}>Obs.</label>
                  <input style={inp} value={formEntrega.observacao} onChange={e => setFormEntrega(p => ({ ...p, observacao: e.target.value }))} placeholder="Ex: NF 1234" />
                </div>
              </div>
              <button style={{ ...btnV, marginTop: 12, opacity: salvando || !formEntrega.quantidade_entregue ? 0.5 : 1 }}
                disabled={salvando || !formEntrega.quantidade_entregue} onClick={salvarEntrega}>
                {salvando ? "Salvando…" : "Confirmar Entrega"}
              </button>

              {/* Histórico de entregas */}
              {entregas.length > 0 && (<>
                <div style={{ ...secTit, marginTop: 20 }}>Histórico de Entregas</div>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                  <thead><tr style={{ background: "#F3F6F9" }}>
                    {["Item","Data","Qtd. Entregue","Obs."].map((h, i) => (
                      <th key={i} style={{ padding: "6px 10px", textAlign: i >= 2 ? "right" : "left", fontSize: 11, fontWeight: 600, color: "#555", borderBottom: "0.5px solid #D4DCE8" }}>{h}</th>
                    ))}
                  </tr></thead>
                  <tbody>
                    {entregas.map((e, i) => (
                      <tr key={e.id} style={{ borderBottom: i < entregas.length - 1 ? "0.5px solid #DEE5EE" : "none" }}>
                        <td style={{ padding: "7px 10px" }}>{modalEntrega.itens.find(it => it.id === e.item_id)?.nome_item ?? "—"}</td>
                        <td style={{ padding: "7px 10px" }}>{fmtData(e.data_entrega)}</td>
                        <td style={{ padding: "7px 10px", textAlign: "right", fontWeight: 600, color: "#16A34A" }}>{fmtN(e.quantidade_entregue)}</td>
                        <td style={{ padding: "7px 10px", textAlign: "right", color: "#555" }}>{e.observacao ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>)}
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL RELATÓRIO ── */}
      {modalRelatorio && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 130 }}
          onClick={e => { if (e.target === e.currentTarget) setModalRelatorio(null); }}>
          <div style={{ background: "#fff", borderRadius: 14, width: 700, maxWidth: "97vw", maxHeight: "90vh", overflowY: "auto" }}>
            <div style={{ padding: "16px 22px", borderBottom: "0.5px solid #D4DCE8", display: "flex", justifyContent: "space-between" }}>
              <div>
                <div style={{ fontWeight: 600, fontSize: 15 }}>Relatório do Pedido #{modalRelatorio.pedido.numero}</div>
                <div style={{ fontSize: 11, color: "#555" }}>{nomePessoa(modalRelatorio.pedido.fornecedor_id)} · {fmtData(modalRelatorio.pedido.data_registro)}</div>
              </div>
              <button onClick={() => setModalRelatorio(null)} style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer", color: "#555" }}>×</button>
            </div>
            <div style={{ padding: 22 }}>
              <div style={secTit}>Itens do Pedido</div>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                <thead><tr style={{ background: "#F3F6F9" }}>
                  {["Item","Un.","Qtd.","Valor Unit.","Valor Total","Qtd. Entregue","Saldo"].map((h, i) => (
                    <th key={i} style={{ padding: "6px 10px", textAlign: i >= 2 ? "right" : "left", fontSize: 11, fontWeight: 600, color: "#555", borderBottom: "0.5px solid #D4DCE8" }}>{h}</th>
                  ))}
                </tr></thead>
                <tbody>
                  {modalRelatorio.itens.map((it, i) => (
                    <tr key={it.id} style={{ borderBottom: i < modalRelatorio.itens.length - 1 ? "0.5px solid #DEE5EE" : "none" }}>
                      <td style={{ padding: "8px 10px", fontWeight: 600 }}>{it.nome_item}</td>
                      <td style={{ padding: "8px 10px" }}>{it.unidade}</td>
                      <td style={{ padding: "8px 10px", textAlign: "right" }}>{fmtN(it.quantidade)}</td>
                      <td style={{ padding: "8px 10px", textAlign: "right" }}>{fmtBRL(it.valor_unitario)}</td>
                      <td style={{ padding: "8px 10px", textAlign: "right", fontWeight: 600, color: "#1A4870" }}>{fmtBRL((it.valor_total ?? it.quantidade * it.valor_unitario))}</td>
                      <td style={{ padding: "8px 10px", textAlign: "right", color: "#16A34A", fontWeight: 600 }}>{fmtN(it.qtd_entregue ?? 0)}</td>
                      <td style={{ padding: "8px 10px", textAlign: "right", color: "#C9921B", fontWeight: 600 }}>{fmtN(Math.max(0, it.quantidade - (it.qtd_cancelada ?? 0) - (it.qtd_entregue ?? 0)))}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr style={{ background: "#F3F6F9", fontWeight: 600 }}>
                    <td colSpan={4} style={{ padding: "8px 10px", textAlign: "right", fontSize: 11, color: "#555" }}>TOTAL PEDIDO</td>
                    <td style={{ padding: "8px 10px", textAlign: "right", color: "#1A4870" }}>{fmtBRL(modalRelatorio.itens.reduce((s, it) => s + (it.valor_total ?? it.quantidade * it.valor_unitario), 0))}</td>
                    <td colSpan={2} />
                  </tr>
                </tfoot>
              </table>

              {modalRelatorio.entregas.length > 0 && (<>
                <div style={{ ...secTit, marginTop: 20 }}>Entregas Registradas</div>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                  <thead><tr style={{ background: "#F3F6F9" }}>
                    {["Item","Data Entrega","Qtd. Entregue","Obs."].map((h, i) => (
                      <th key={i} style={{ padding: "6px 10px", textAlign: i >= 2 ? "right" : "left", fontSize: 11, fontWeight: 600, color: "#555", borderBottom: "0.5px solid #D4DCE8" }}>{h}</th>
                    ))}
                  </tr></thead>
                  <tbody>
                    {modalRelatorio.entregas.map((e, i) => (
                      <tr key={e.id} style={{ borderBottom: i < modalRelatorio.entregas.length - 1 ? "0.5px solid #DEE5EE" : "none" }}>
                        <td style={{ padding: "7px 10px" }}>{modalRelatorio.itens.find(it => it.id === e.item_id)?.nome_item ?? "—"}</td>
                        <td style={{ padding: "7px 10px" }}>{fmtData(e.data_entrega)}</td>
                        <td style={{ padding: "7px 10px", textAlign: "right", fontWeight: 600, color: "#16A34A" }}>{fmtN(e.quantidade_entregue)}</td>
                        <td style={{ padding: "7px 10px", textAlign: "right", color: "#555" }}>{e.observacao ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>)}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
