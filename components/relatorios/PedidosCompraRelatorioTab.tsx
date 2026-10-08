"use client";
// ═══════════════════════════════════════════════════════════════════════════
// Aba "Pedidos de Compra" do espaço dedicado de Relatórios
// (Financeiro → Relatórios Financeiros → Pedidos de Compra).
//
// Pedido do dono 01/10/2026: separar RELATÓRIO (consultar com filtro, gerar
// PDF/XLSX) de LANÇAMENTO (tela de trabalho, grid sempre visível com ações
// inline) — esse componente é só relatório, auto-contido, sem nenhuma ação
// de escrita.
//
// Fonte: rel_pedidos_compra (trigger-sync, Seções 310/311) — já vem com
// fornecedor/produtor/ano safra/operação resolvidos, então este componente
// não precisa carregar pessoas/produtores/anos_safra separadamente só pra
// montar o cabeçalho do relatório. Os itens do pedido e das NFs vinculadas
// (necessários no corpo do relatório) são buscados ao vivo por pedido
// selecionado, via lib/db.ts (mesmas funções já usadas em Compras).
// ═══════════════════════════════════════════════════════════════════════════
import InputData from "../../components/InputData";
import { useState } from "react";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../AuthProvider";
import { listarPedidoCompraItens, listarNfEntradasPorPedido, alocarEntregaPorLinha, listarInsumosParaConta, listarGruposInsumoDaConta } from "../../lib/db";
import type { PedidoCompraItem, NfEntrada, NfEntradaItem, Insumo, GrupoInsumo } from "../../lib/supabase";

type RelPedido = {
  id: string;
  fazenda_id: string;
  numero: number | null;
  nr_pedido: string | null;
  nr_pedido_fornecedor: string | null;
  fornecedor_id: string | null;
  fornecedor_nome: string | null;
  fornecedor_cpf_cnpj: string | null;
  produtor_nome: string | null;
  ano_safra_id: string | null;
  ano_safra_descricao: string | null;
  operacao_nome: string | null;
  data_registro: string;
  moeda: string | null;
  status: string;
  fiscal: boolean | null;
  total_financeiro: number | null;
};

const STATUS_MAP: Record<string, { label: string; bg: string; color: string }> = {
  rascunho:               { label: "Rascunho",         bg: "#F4F6FA", color: "#555" },
  aprovado:               { label: "Aprovado",          bg: "#E8E8E8", color: "#0D0D0D" },
  parcialmente_entregue:  { label: "Parc. Entregue",    bg: "#FBF3E0", color: "#7A5200" },
  entregue:               { label: "Entregue",          bg: "#DCFCE7", color: "#166534" },
  cancelado:              { label: "Cancelado",         bg: "#FCEBEB", color: "#791F1F" },
};
const STATUS_OPCOES = Object.keys(STATUS_MAP) as (keyof typeof STATUS_MAP)[];

const fmtBRL = (v?: number | null) => (v ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fmtUSD = (v?: number | null) => `US$ ${(v ?? 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtMoeda = (v: number | null | undefined, moeda: string) => moeda === "USD" ? fmtUSD(v) : moeda === "barter" ? `${(v ?? 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })} sc` : fmtBRL(v);
const fmtN = (v?: number | null, d = 2) => v != null ? v.toLocaleString("pt-BR", { minimumFractionDigits: d, maximumFractionDigits: d }) : "—";
const fmtData = (s?: string | null) => s ? s.split("-").reverse().join("/") : "—";

type LinhaConsolidada = {
  insumoId: string;
  nome: string;
  unidade: string;
  qtdPedida: number;
  qtdEntregue: number;
  qtdCancelada: number;
  saldo: number;
  valorPorMoeda: Record<string, number>;
  pedidos: { numero: string; fornecedor: string; data: string; moeda: string; qtdPedida: number; qtdEntregue: number; cancelada: number; saldo: number; valorTotal: number }[];
};

function fmtValorPorMoeda(v: Record<string, number>): string {
  const entries = Object.entries(v);
  if (entries.length === 0) return "—";
  return entries.map(([moeda, val]) => fmtMoeda(val, moeda)).join(" · ");
}

// Agrupa os itens de todos os pedidos já filtrados por insumo_id — o Insumo
// é a peça central, não o pedido. Mesma lógica de entrega (alocarEntregaPorLinha
// pra pedido fiscal, qtd_entregue direto pra manual) já usada na visão por pedido.
function consolidarPorInsumo(
  dados: { ped: RelPedido; itens: PedidoCompraItem[]; nfs: NfEntrada[]; nfItens: NfEntradaItem[] }[],
): LinhaConsolidada[] {
  const mapa = new Map<string, LinhaConsolidada>();
  for (const { ped, itens, nfs, nfItens } of dados) {
    const ehFiscal = ped.fiscal ?? false;
    const nfsProcessadasIds = new Set(nfs.filter(n => n.status === "processada").map(n => n.id));
    const entregaPorLinha = ehFiscal
      ? alocarEntregaPorLinha(itens, nfItens.filter(it => nfsProcessadasIds.has(it.nf_entrada_id ?? "")))
      : new Map<string, number>();
    const moeda = ped.moeda ?? "R$";
    for (const it of itens) {
      if (!it.insumo_id) continue; // só agrupa itens vinculados a um insumo do catálogo
      const entregue = ehFiscal ? (entregaPorLinha.get(it.id) ?? 0) : (it.qtd_entregue ?? 0);
      const cancelada = it.qtd_cancelada ?? 0;
      const saldo = Math.max(0, it.quantidade - cancelada - entregue);
      const valorTotal = it.valor_total ?? (it.quantidade * it.valor_unitario);

      let linha = mapa.get(it.insumo_id);
      if (!linha) {
        linha = { insumoId: it.insumo_id, nome: it.nome_item, unidade: it.unidade, qtdPedida: 0, qtdEntregue: 0, qtdCancelada: 0, saldo: 0, valorPorMoeda: {}, pedidos: [] };
        mapa.set(it.insumo_id, linha);
      }
      linha.qtdPedida += it.quantidade;
      linha.qtdEntregue += entregue;
      linha.qtdCancelada += cancelada;
      linha.saldo += saldo;
      linha.valorPorMoeda[moeda] = (linha.valorPorMoeda[moeda] ?? 0) + valorTotal;
      linha.pedidos.push({
        numero: ped.nr_pedido || `#${ped.numero}`,
        fornecedor: ped.fornecedor_nome ?? "—",
        data: ped.data_registro,
        moeda, qtdPedida: it.quantidade, qtdEntregue: entregue, cancelada, saldo, valorTotal,
      });
    }
  }
  return Array.from(mapa.values()).sort((a, b) => a.nome.localeCompare(b.nome));
}

const inp: React.CSSProperties = { padding: "7px 10px", border: "0.5px solid var(--border-table)", borderRadius: 8, fontSize: 13, background: "var(--bg-card)" };
const lbl: React.CSSProperties = { fontSize: 11, color: "#555", fontWeight: 600, display: "block", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.03em" };
const btnV: React.CSSProperties = { padding: "8px 18px", background: "#2A2A2A", color: "#fff", border: "none", borderRadius: 8, fontWeight: 600, cursor: "pointer", fontSize: 13 };
const btnR: React.CSSProperties = { padding: "8px 16px", border: "0.5px solid var(--border-table)", borderRadius: 8, background: "var(--bg-card)", cursor: "pointer", fontSize: 13, color: "var(--text-2)" };

function logoFazendaSrc(fzId?: string | null): string | null {
  if (!fzId) return null;
  try { return localStorage.getItem(`fazenda_logo_${fzId}`); } catch { return null; }
}

export default function PedidosCompraRelatorioTab() {
  const { fazendaId, fazendaIds, contaId, nomeUsuario } = useAuth();

  const [modalAberto, setModalAberto] = useState(false);
  const [gerando, setGerando] = useState(false);
  const [erro, setErro] = useState("");

  const [opcoesFornecedor, setOpcoesFornecedor] = useState<{ id: string; nome: string }[]>([]);
  const [opcoesAnoSafra,   setOpcoesAnoSafra]   = useState<{ id: string; descricao: string }[]>([]);
  const [opcoesCarregadas, setOpcoesCarregadas] = useState(false);
  // Grupo (grupos_insumos, mesmo padrão já usado no Relatório de Aplicações por
  // Ciclo) e Item (insumo) — pra achar em qual pedido um produto está, em vez
  // de só filtrar pelo cabeçalho do pedido.
  const [grupos,  setGrupos]  = useState<GrupoInsumo[]>([]);
  const [insumos, setInsumos] = useState<Insumo[]>([]);

  const [fFornecedor, setFFornecedor] = useState("");
  const [fNrPedForn,  setFNrPedForn]  = useState("");
  const [fStatus,     setFStatus]     = useState<Set<string>>(new Set());
  const [fAnoSafra,   setFAnoSafra]   = useState("");
  const [fGrupoId,    setFGrupoId]    = useState("");
  const [fInsumoId,   setFInsumoId]   = useState("");
  const [fDataDe,     setFDataDe]     = useState("");
  const [fDataAte,    setFDataAte]    = useState("");
  // Visão: "pedido" = relatório original (1 página por pedido, com as NFs
  // vinculadas); "insumo" = novo relatório pedido pelo dono 08/10/2026 —
  // agrupa pedidos_compra_itens por insumo_id em vez de por pedido_id, pra
  // responder "em quais pedidos esse produto está" de forma consolidada.
  const [fVisao,      setFVisao]      = useState<"pedido" | "insumo">("pedido");
  const [fTipo,       setFTipo]       = useState<"sintetico" | "analitico">("analitico");
  const [fFormato,    setFFormato]    = useState<"pdf" | "xlsx">("pdf");

  // Item filtrado pelo grupo escolhido (se houver) — cascata igual ao resto do sistema.
  const insumosDoGrupo = fGrupoId ? insumos.filter(i => i.grupo_id === fGrupoId) : insumos;

  const toggleStatus = (v: string) => setFStatus(prev => {
    const next = new Set(prev);
    next.has(v) ? next.delete(v) : next.add(v);
    return next;
  });

  async function abrirModal() {
    setErro("");
    setModalAberto(true);
    if (opcoesCarregadas) return;
    try {
      const fids = fazendaIds?.length ? fazendaIds : fazendaId ? [fazendaId] : [];
      let q = supabase.from("rel_pedidos_compra").select("fornecedor_id, fornecedor_nome, ano_safra_id, ano_safra_descricao");
      q = contaId ? q.eq("conta_id", contaId) : q.in("fazenda_id", fids);
      const [{ data }, gruposData, insumosData] = await Promise.all([
        q,
        listarGruposInsumoDaConta(fazendaId),
        listarInsumosParaConta(contaId, fazendaId ?? undefined),
      ]);
      const forn = new Map<string, string>();
      const safra = new Map<string, string>();
      for (const r of data ?? []) {
        if (r.fornecedor_id && r.fornecedor_nome) forn.set(r.fornecedor_id, r.fornecedor_nome);
        if (r.ano_safra_id && r.ano_safra_descricao) safra.set(r.ano_safra_id, r.ano_safra_descricao);
      }
      setOpcoesFornecedor(Array.from(forn, ([id, nome]) => ({ id, nome })).sort((a, b) => a.nome.localeCompare(b.nome)));
      setOpcoesAnoSafra(Array.from(safra, ([id, descricao]) => ({ id, descricao })).sort((a, b) => b.descricao.localeCompare(a.descricao)));
      setGrupos(gruposData.sort((a, b) => a.nome.localeCompare(b.nome)));
      setInsumos(insumosData.sort((a, b) => a.nome.localeCompare(b.nome)));
      setOpcoesCarregadas(true);
    } catch { /* silencioso — dropdowns ficam vazios, filtro de texto continua funcionando */ }
  }

  // Resolve quais pedidos têm o item/grupo escolhido — null = sem restrição
  // (nenhum filtro de produto marcado); [] = filtro marcado mas nada encontrado.
  async function resolverPedidoIdsPorProduto(): Promise<string[] | null> {
    if (!fInsumoId && !fGrupoId) return null;
    const fids = fazendaIds?.length ? fazendaIds : fazendaId ? [fazendaId] : [];
    const insumoIds = fInsumoId ? [fInsumoId] : insumosDoGrupo.map(i => i.id);
    if (insumoIds.length === 0) return [];
    const { data, error } = await supabase
      .from("pedidos_compra_itens")
      .select("pedido_id")
      .in("fazenda_id", fids)
      .in("insumo_id", insumoIds);
    if (error) throw error;
    return Array.from(new Set((data ?? []).map(r => r.pedido_id as string)));
  }

  async function buscarPedidosFiltrados(): Promise<RelPedido[]> {
    const fids = fazendaIds?.length ? fazendaIds : fazendaId ? [fazendaId] : [];
    const pedidoIdsPorProduto = await resolverPedidoIdsPorProduto();
    if (pedidoIdsPorProduto !== null && pedidoIdsPorProduto.length === 0) return [];
    let q = supabase.from("rel_pedidos_compra").select("*");
    q = contaId ? q.eq("conta_id", contaId) : q.in("fazenda_id", fids);
    if (fFornecedor) q = q.eq("fornecedor_id", fFornecedor);
    if (fNrPedForn.trim()) q = q.ilike("nr_pedido_fornecedor", `%${fNrPedForn.trim()}%`);
    if (fStatus.size > 0) q = q.in("status", Array.from(fStatus));
    if (fAnoSafra) q = q.eq("ano_safra_id", fAnoSafra);
    if (pedidoIdsPorProduto) q = q.in("id", pedidoIdsPorProduto);
    if (fDataDe) q = q.gte("data_registro", fDataDe);
    if (fDataAte) q = q.lte("data_registro", fDataAte);
    q = q.order("numero", { ascending: true });
    const { data, error } = await q;
    if (error) throw error;
    return (data ?? []) as RelPedido[];
  }

  // ── Construção do HTML de 1 página (1 pedido) ──
  function buildPaginaPedidoHtml(
    ped: RelPedido, itens: PedidoCompraItem[], nfs: NfEntrada[], nfItens: NfEntradaItem[],
  ): string {
    const logo = logoFazendaSrc(ped.fazenda_id);
    const moeda = ped.moeda ?? "R$";
    const ehFiscal = ped.fiscal ?? false;
    const nfsProcessadasIds = new Set(nfs.filter(n => n.status === "processada").map(n => n.id));
    const entregaPorLinha = ehFiscal
      ? alocarEntregaPorLinha(itens, nfItens.filter(it => nfsProcessadasIds.has(it.nf_entrada_id ?? "")))
      : new Map<string, number>();

    const NF_STATUS_REL: Record<string, { label: string; cor: string }> = {
      digitando: { label: "Digitando", cor: "#555" }, pendente: { label: "Pendente", cor: "#7A5200" },
      processada: { label: "Processada", cor: "#166534" }, cancelada: { label: "Cancelada", cor: "#791F1F" },
    };
    const valorEntrada  = nfs.filter(n => n.status === "processada").reduce((s, n) => s + (n.valor_total ?? 0), 0);
    const valorTotalPed = ped.total_financeiro ?? 0;
    const valorAReceber = Math.max(0, valorTotalPed - valorEntrada);
    const pctRecebido   = valorTotalPed > 0 ? Math.min(100, (valorEntrada / valorTotalPed) * 100) : 0;

    const td = (v: string, right = false, bold = false) =>
      `<td style="padding:4px 7px;border:1px solid #E5E7EB;${right ? "text-align:right;" : ""}${bold ? "font-weight:700;" : ""}white-space:nowrap">${v}</td>`;

    const linhasItens = itens.map(it => {
      const entregue = ehFiscal ? (entregaPorLinha.get(it.id) ?? 0) : (it.qtd_entregue ?? 0);
      const cancelada = it.qtd_cancelada ?? 0;
      const saldo = Math.max(0, it.quantidade - cancelada - entregue);
      return `<tr>${td(it.nome_item)}${td(it.unidade)}${td(fmtN(it.quantidade), true)}${td(fmtMoeda(it.valor_unitario, moeda), true)}${td(fmtMoeda(it.valor_total ?? (it.quantidade * it.valor_unitario), moeda), true, true)}${td(fmtN(entregue), true)}${td(fmtN(saldo), true)}</tr>`;
    }).join("");
    const totalItensPedido = itens.reduce((s, it) => s + (it.valor_total ?? (it.quantidade * it.valor_unitario)), 0);

    const colsNfHeader = fTipo === "sintetico"
      ? ["Nº / Série", "Data Emissão", "Emitente", "Status", "Valor Total"]
      : ["Produto", "Un.", "Qtd.", "Vlr. Unit.", "Vlr. Total"];
    let linhasNfs = "";
    if (nfs.length === 0) {
      linhasNfs = `<tr><td colspan="5" style="padding:14px 10px;text-align:center;color:#888;border:1px solid #E5E7EB">Nenhuma NF de entrada vinculada a este pedido.</td></tr>`;
    } else if (fTipo === "sintetico") {
      linhasNfs = nfs.map(nf => {
        const sm = NF_STATUS_REL[nf.status] ?? NF_STATUS_REL.pendente;
        return `<tr><td style="padding:4px 7px;border:1px solid #E5E7EB">${nf.numero}/${nf.serie}</td>${td(fmtData(nf.data_emissao))}<td style="padding:4px 7px;border:1px solid #E5E7EB">${nf.emitente_nome}</td><td style="padding:4px 7px;border:1px solid #E5E7EB;color:${sm.cor};font-weight:600">${sm.label}</td>${td(fmtBRL(nf.valor_total), true, true)}</tr>`;
      }).join("");
    } else {
      for (const nf of nfs) {
        const sm = NF_STATUS_REL[nf.status] ?? NF_STATUS_REL.pendente;
        linhasNfs += `<tr style="background:#F3F6F9"><td colspan="5" style="padding:5px 8px;border:1px solid #E5E7EB;font-weight:700">NF ${nf.numero}/${nf.serie} — ${fmtData(nf.data_emissao)} — ${nf.emitente_nome}<span style="float:right;color:${sm.cor}">${sm.label} · ${fmtBRL(nf.valor_total)}</span></td></tr>`;
        const itensDaNf = nfItens.filter(it => it.nf_entrada_id === nf.id);
        if (itensDaNf.length === 0) {
          linhasNfs += `<tr><td colspan="5" style="padding:4px 10px 4px 18px;border:1px solid #E5E7EB;color:#888;font-style:italic">Sem itens detalhados</td></tr>`;
        } else {
          linhasNfs += itensDaNf.map(it => `<tr><td style="padding:3px 8px 3px 18px;border:1px solid #E5E7EB">${it.descricao_produto}</td>${td(it.unidade)}${td(fmtN(it.quantidade), true)}${td(fmtBRL(it.valor_unitario), true)}${td(fmtBRL(it.valor_total), true, true)}</tr>`).join("");
        }
      }
    }

    return `<div class="rt-page">
<div style="border-bottom:2px solid #111111;padding-bottom:10px;margin-bottom:10px;display:flex;justify-content:space-between;align-items:flex-start">
  <div style="display:flex;align-items:center;gap:12px">
    ${logo ? `<img src="${logo}" style="height:40px;object-fit:contain">` : ""}
    <div><div style="font-size:14pt;font-weight:700;color:#111111">RacTech</div></div>
  </div>
  <div style="text-align:right">
    <div style="font-size:13pt;font-weight:700;color:#111111">RELATÓRIO DE PEDIDO DE COMPRA</div>
    <div style="font-size:9pt;color:#555">${ped.nr_pedido || `Pedido #${ped.numero}`}${ehFiscal ? " · Fiscal" : ""}</div>
  </div>
</div>
<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:0;border:1px solid #DDE2EE;border-radius:4px;margin-bottom:10px;font-size:8.5pt;overflow:hidden">
  <div style="padding:7px 10px;border-right:1px solid #DDE2EE;border-bottom:1px solid #DDE2EE"><span style="color:#888">Fornecedor: </span><strong>${ped.fornecedor_nome ?? "—"}</strong>${ped.fornecedor_cpf_cnpj ? `<div style="color:#888;font-size:7.5pt">${ped.fornecedor_cpf_cnpj}</div>` : ""}</div>
  <div style="padding:7px 10px;border-right:1px solid #DDE2EE;border-bottom:1px solid #DDE2EE"><span style="color:#888">Produtor: </span><strong>${ped.produtor_nome ?? "—"}</strong></div>
  <div style="padding:7px 10px;border-bottom:1px solid #DDE2EE"><span style="color:#888">Data do Pedido: </span><strong>${fmtData(ped.data_registro)}</strong></div>
  <div style="padding:7px 10px;border-right:1px solid #DDE2EE"><span style="color:#888">Ano Safra: </span><strong>${ped.ano_safra_descricao ?? "—"}</strong></div>
  <div style="padding:7px 10px;border-right:1px solid #DDE2EE"><span style="color:#888">Operação: </span><strong>${ped.operacao_nome ?? "—"}</strong></div>
  <div style="padding:7px 10px"><span style="color:#888">Status: </span><strong>${STATUS_MAP[ped.status]?.label ?? ped.status}</strong></div>
</div>
<div style="font-size:10pt;font-weight:700;color:#111111;margin:10px 0 4px">Itens do Pedido</div>
<table style="width:100%;border-collapse:collapse;font-size:8pt">
  <thead><tr>
    <th style="background:#111111;color:#fff;padding:4px 7px;text-align:left;border:1px solid #111111">Item</th>
    <th style="background:#111111;color:#fff;padding:4px 7px;text-align:left;border:1px solid #111111">Un.</th>
    <th style="background:#111111;color:#fff;padding:4px 7px;text-align:right;border:1px solid #111111">Qtd. Pedida</th>
    <th style="background:#111111;color:#fff;padding:4px 7px;text-align:right;border:1px solid #111111">Vlr. Unit.</th>
    <th style="background:#111111;color:#fff;padding:4px 7px;text-align:right;border:1px solid #111111">Vlr. Total</th>
    <th style="background:#111111;color:#fff;padding:4px 7px;text-align:right;border:1px solid #111111">Qtd. Entregue</th>
    <th style="background:#111111;color:#fff;padding:4px 7px;text-align:right;border:1px solid #111111">Saldo</th>
  </tr></thead>
  <tbody>${linhasItens}</tbody>
  <tfoot><tr>
    <td colspan="4" style="background:#111111;color:#fff;font-weight:700;padding:4px 7px;border:1px solid #111111">TOTAL DO PEDIDO</td>
    <td style="background:#111111;color:#fff;font-weight:700;padding:4px 7px;text-align:right;border:1px solid #111111">${fmtMoeda(totalItensPedido, moeda)}</td>
    <td colspan="2" style="background:#111111;border:1px solid #111111"></td>
  </tr></tfoot>
</table>
<div style="font-size:10pt;font-weight:700;color:#111111;margin:12px 0 4px">Notas Fiscais de Entrada Vinculadas${fTipo === "sintetico" ? " (sintético)" : ""}</div>
<table style="width:100%;border-collapse:collapse;font-size:8pt">
  <thead><tr>${colsNfHeader.map((c, i) => `<th style="background:#111111;color:#fff;padding:4px 7px;text-align:${i >= colsNfHeader.length - 1 ? "right" : "left"};border:1px solid #111111">${c}</th>`).join("")}</tr></thead>
  <tbody>${linhasNfs}</tbody>
</table>
<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:6px;margin-top:14px">
  ${[
    { l: "Valor do Pedido", v: fmtMoeda(valorTotalPed, moeda), hl: false },
    { l: "Valor de Entrada (NF)", v: fmtBRL(valorEntrada), hl: true },
    { l: "Valor a Receber (NF)", v: fmtBRL(valorAReceber), hl: false },
    { l: "% Recebido", v: `${Math.round(pctRecebido)}%`, hl: false },
  ].map(s => `<div style="border:1px solid #DDE2EE;border-radius:4px;padding:6px 9px;background:${s.hl ? "#111111" : "#fff"};color:${s.hl ? "#fff" : "#111111"}"><div style="font-size:7pt;color:${s.hl ? "rgba(255,255,255,0.8)" : "#888"};margin-bottom:2px">${s.l}</div><div style="font-size:11pt;font-weight:700">${s.v}</div></div>`).join("")}
</div>
<div style="margin-top:14px;padding-top:6px;border-top:1px solid #DDE2EE;font-size:7pt;color:#888">
  Gerado por ${nomeUsuario ?? "—"} em ${new Date().toLocaleString("pt-BR")} — RacTech · Gestão Agrícola de Precisão · Relatório (rel_pedidos_compra)
</div>
</div>`;
  }

  // ── Construção do HTML da visão "Consolidado por Insumo" (1 página só) ──
  function buildPaginaConsolidadoHtml(linhas: LinhaConsolidada[], titulo: string, tipo: "sintetico" | "analitico"): string {
    const td = (v: string, right = false, bold = false) =>
      `<td style="padding:4px 7px;border:1px solid #E5E7EB;${right ? "text-align:right;" : ""}${bold ? "font-weight:700;" : ""}white-space:nowrap">${v}</td>`;

    const totais = { pedida: 0, entregue: 0, cancelada: 0, saldo: 0, porMoeda: {} as Record<string, number> };
    const linhasHtml = linhas.map(l => {
      totais.pedida += l.qtdPedida; totais.entregue += l.qtdEntregue; totais.cancelada += l.qtdCancelada; totais.saldo += l.saldo;
      for (const [m, v] of Object.entries(l.valorPorMoeda)) totais.porMoeda[m] = (totais.porMoeda[m] ?? 0) + v;
      const principal = `<tr>${td(l.nome)}${td(l.unidade)}${td(fmtN(l.qtdPedida), true)}${td(fmtN(l.qtdEntregue), true)}${td(fmtN(l.qtdCancelada), true)}${td(fmtN(l.saldo), true)}${td(fmtValorPorMoeda(l.valorPorMoeda), true, true)}${td(String(l.pedidos.length), true)}</tr>`;
      if (tipo !== "analitico") return principal;
      const detalhe = l.pedidos.map(p =>
        `<tr style="background:#F8FAFC;font-size:7.5pt;color:#555"><td colspan="2" style="padding:3px 7px 3px 20px;border:1px solid #E5E7EB">↳ ${p.numero} — ${p.fornecedor} (${fmtData(p.data)})</td>${td(fmtN(p.qtdPedida), true)}${td(fmtN(p.qtdEntregue), true)}${td(fmtN(p.cancelada), true)}${td(fmtN(p.saldo), true)}${td(fmtMoeda(p.valorTotal, p.moeda), true)}${td("", true)}</tr>`
      ).join("");
      return principal + detalhe;
    }).join("");

    return `<div class="rt-page">
<div style="border-bottom:2px solid #111111;padding-bottom:10px;margin-bottom:10px;display:flex;justify-content:space-between;align-items:flex-start">
  <div><div style="font-size:14pt;font-weight:700;color:#111111">RacTech</div></div>
  <div style="text-align:right">
    <div style="font-size:13pt;font-weight:700;color:#111111">PEDIDOS DE COMPRA — CONSOLIDADO POR INSUMO</div>
    <div style="font-size:9pt;color:#555">${titulo}</div>
  </div>
</div>
<table style="width:100%;border-collapse:collapse;font-size:8pt">
  <thead><tr>
    <th style="background:#111111;color:#fff;padding:4px 7px;text-align:left;border:1px solid #111111">Item (Insumo)</th>
    <th style="background:#111111;color:#fff;padding:4px 7px;text-align:left;border:1px solid #111111">Un.</th>
    <th style="background:#111111;color:#fff;padding:4px 7px;text-align:right;border:1px solid #111111">Qtd. Pedida</th>
    <th style="background:#111111;color:#fff;padding:4px 7px;text-align:right;border:1px solid #111111">Qtd. Entregue</th>
    <th style="background:#111111;color:#fff;padding:4px 7px;text-align:right;border:1px solid #111111">Qtd. Cancelada</th>
    <th style="background:#111111;color:#fff;padding:4px 7px;text-align:right;border:1px solid #111111">Saldo</th>
    <th style="background:#111111;color:#fff;padding:4px 7px;text-align:right;border:1px solid #111111">Valor Total</th>
    <th style="background:#111111;color:#fff;padding:4px 7px;text-align:right;border:1px solid #111111">Nº Pedidos</th>
  </tr></thead>
  <tbody>${linhasHtml}</tbody>
  <tfoot><tr>
    <td colspan="2" style="background:#111111;color:#fff;font-weight:700;padding:4px 7px;border:1px solid #111111">TOTAL</td>
    <td style="background:#111111;color:#fff;font-weight:700;padding:4px 7px;text-align:right;border:1px solid #111111">${fmtN(totais.pedida)}</td>
    <td style="background:#111111;color:#fff;font-weight:700;padding:4px 7px;text-align:right;border:1px solid #111111">${fmtN(totais.entregue)}</td>
    <td style="background:#111111;color:#fff;font-weight:700;padding:4px 7px;text-align:right;border:1px solid #111111">${fmtN(totais.cancelada)}</td>
    <td style="background:#111111;color:#fff;font-weight:700;padding:4px 7px;text-align:right;border:1px solid #111111">${fmtN(totais.saldo)}</td>
    <td style="background:#111111;color:#fff;font-weight:700;padding:4px 7px;text-align:right;border:1px solid #111111">${fmtValorPorMoeda(totais.porMoeda)}</td>
    <td style="background:#111111;border:1px solid #111111"></td>
  </tr></tfoot>
</table>
<div style="margin-top:14px;padding-top:6px;border-top:1px solid #DDE2EE;font-size:7pt;color:#888">
  Gerado por ${nomeUsuario ?? "—"} em ${new Date().toLocaleString("pt-BR")} — RacTech · Gestão Agrícola de Precisão · Relatório consolidado por insumo
</div>
</div>`;
  }

  function buildRelatorioHtml(paginas: string[], tituloToolbar: string): string {
    return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${tituloToolbar}</title>
<style>
  body{margin:0;font-family:Arial,sans-serif;font-size:9pt;color:#1a1a1a;background:#D1D5DB}
  .rt-toolbar{position:sticky;top:0;background:#111111;padding:10px 24px;display:flex;align-items:center;justify-content:space-between;z-index:100;box-shadow:0 2px 8px rgba(0,0,0,.2)}
  .rt-toolbar span{color:#fff;font-size:13px;font-weight:700}
  .rt-btn{background:#fff;color:#111111;border:none;padding:8px 20px;border-radius:8px;font-size:13px;font-weight:700;cursor:pointer}
  .rt-page-wrapper{display:flex;flex-direction:column;align-items:center;padding:24px;gap:24px}
  .rt-page{background:#fff;width:210mm;min-height:277mm;padding:14mm;box-shadow:0 4px 24px rgba(0,0,0,.18);box-sizing:border-box}
  @page{size:A4 portrait;margin:14mm}
  @media print{body{background:#fff}.rt-toolbar{display:none!important}.rt-page-wrapper{padding:0;gap:0}.rt-page{box-shadow:none;width:100%;min-height:0;padding:0;page-break-after:always}.rt-page:last-child{page-break-after:auto}}
</style></head><body>
<div class="rt-toolbar"><span>${tituloToolbar}</span><button class="rt-btn" onclick="window.print()">&#128438; Imprimir / Salvar PDF</button></div>
<div class="rt-page-wrapper">${paginas.join("")}</div>
</body></html>`;
  }

  async function gerar() {
    setErro("");
    setGerando(true);
    try {
      const pedidos = await buscarPedidosFiltrados();
      if (pedidos.length === 0) { setErro("Nenhum pedido encontrado para esse filtro."); return; }

      const dados = await Promise.all(pedidos.map(async ped => {
        const [itens, nfData] = await Promise.all([
          listarPedidoCompraItens(ped.id),
          ped.fiscal ? listarNfEntradasPorPedido(ped.id) : Promise.resolve({ nfs: [], itens: [] }),
        ]);
        return { ped, itens, nfs: nfData.nfs, nfItens: nfData.itens };
      }));

      const partes: string[] = [];
      if (fFornecedor) partes.push(opcoesFornecedor.find(f => f.id === fFornecedor)?.nome ?? "Fornecedor");
      if (fNrPedForn.trim()) partes.push(`Pedido Fornecedor "${fNrPedForn.trim()}"`);
      if (fInsumoId) partes.push(`Item: ${insumos.find(i => i.id === fInsumoId)?.nome ?? ""}`);
      else if (fGrupoId) partes.push(`Grupo: ${grupos.find(g => g.id === fGrupoId)?.nome ?? ""}`);
      if (partes.length === 0) partes.push("Todos os fornecedores");
      const titulo = `${partes.join(" · ")} — ${pedidos.length} pedido(s)`;

      if (fVisao === "insumo") {
        const linhas = consolidarPorInsumo(dados);
        if (linhas.length === 0) { setErro("Nenhum item de catálogo (insumo) encontrado nos pedidos filtrados."); return; }

        if (fFormato === "pdf") {
          const pagina = buildPaginaConsolidadoHtml(linhas, titulo, fTipo);
          const win = window.open("", "_blank");
          if (!win) throw new Error("O navegador bloqueou a abertura da nova aba — permita pop-ups pra este site.");
          win.document.write(buildRelatorioHtml([pagina], `Consolidado por Insumo — ${titulo} — RacTech`));
          win.document.close();
          win.focus();
        } else {
          const XLSX = await import("xlsx");
          const linhasResumo = linhas.map(l => ({
            "Item": l.nome, "Un.": l.unidade, "Qtd. Pedida": l.qtdPedida, "Qtd. Entregue": l.qtdEntregue,
            "Qtd. Cancelada": l.qtdCancelada, "Saldo": l.saldo, "Valor Total": fmtValorPorMoeda(l.valorPorMoeda), "Nº de Pedidos": l.pedidos.length,
          }));
          const wb = XLSX.utils.book_new();
          XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(linhasResumo), "Resumo");
          if (fTipo === "analitico") {
            const linhasDet: Record<string, string | number>[] = [];
            for (const l of linhas) {
              for (const p of l.pedidos) {
                linhasDet.push({
                  "Item": l.nome, "Nº Pedido": p.numero, "Fornecedor": p.fornecedor, "Data": fmtData(p.data),
                  "Qtd. Pedida": p.qtdPedida, "Qtd. Entregue": p.qtdEntregue, "Qtd. Cancelada": p.cancelada,
                  "Saldo": p.saldo, "Valor Total": p.valorTotal, "Moeda": p.moeda,
                });
              }
            }
            XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(linhasDet), "Detalhado");
          }
          XLSX.writeFile(wb, `Consolidado_Insumo_${titulo.replace(/[^\w\s-]/g, "").replace(/\s+/g, "_")}_${new Date().toISOString().slice(0, 10)}.xlsx`);
        }
        setModalAberto(false);
        return;
      }

      if (fFormato === "pdf") {
        const paginas = dados.map(d => buildPaginaPedidoHtml(d.ped, d.itens, d.nfs, d.nfItens));
        const win = window.open("", "_blank");
        if (!win) throw new Error("O navegador bloqueou a abertura da nova aba — permita pop-ups pra este site.");
        win.document.write(buildRelatorioHtml(paginas, `${titulo} — RacTech`));
        win.document.close();
        win.focus();
      } else {
        const XLSX = await import("xlsx");
        const linhasResumo = dados.map(({ ped, nfs }) => {
          const valorEntrada = nfs.filter(n => n.status === "processada").reduce((s, n) => s + (n.valor_total ?? 0), 0);
          const valorTotal = ped.total_financeiro ?? 0;
          return {
            "Nº Pedido": ped.nr_pedido || `#${ped.numero}`, "Nº Pedido Fornecedor": ped.nr_pedido_fornecedor ?? "",
            "Fornecedor": ped.fornecedor_nome ?? "", "Produtor": ped.produtor_nome ?? "", "Ano Safra": ped.ano_safra_descricao ?? "",
            "Operação": ped.operacao_nome ?? "", "Data": fmtData(ped.data_registro), "Moeda": ped.moeda ?? "R$",
            "Status": STATUS_MAP[ped.status]?.label ?? ped.status, "Valor do Pedido": valorTotal,
            "Valor de Entrada": valorEntrada, "Valor a Receber": Math.max(0, valorTotal - valorEntrada), "Qtd. NFs": nfs.length,
          };
        });
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(linhasResumo), "Resumo");
        if (fTipo === "analitico") {
          const linhasDet: Record<string, string | number>[] = [];
          for (const { ped, nfs, nfItens } of dados) {
            for (const nf of nfs) {
              const itensDaNf = nfItens.filter(it => it.nf_entrada_id === nf.id);
              if (itensDaNf.length === 0) {
                linhasDet.push({ "Nº Pedido": ped.nr_pedido || `#${ped.numero}`, "Fornecedor": ped.fornecedor_nome ?? "", "NF": `${nf.numero}/${nf.serie}`, "Data Emissão": fmtData(nf.data_emissao), "Status NF": nf.status, "Produto": "", "Un.": "", "Qtd.": "", "Vlr. Unit.": "", "Vlr. Total": "" });
                continue;
              }
              for (const it of itensDaNf) {
                linhasDet.push({ "Nº Pedido": ped.nr_pedido || `#${ped.numero}`, "Fornecedor": ped.fornecedor_nome ?? "", "NF": `${nf.numero}/${nf.serie}`, "Data Emissão": fmtData(nf.data_emissao), "Status NF": nf.status, "Produto": it.descricao_produto, "Un.": it.unidade, "Qtd.": it.quantidade, "Vlr. Unit.": it.valor_unitario, "Vlr. Total": it.valor_total });
              }
            }
          }
          XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(linhasDet), "Detalhado");
        }
        XLSX.writeFile(wb, `${titulo.replace(/[^\w\s-]/g, "").replace(/\s+/g, "_")}_${new Date().toISOString().slice(0, 10)}.xlsx`);
      }
      setModalAberto(false);
    } catch (e: unknown) {
      // Erro do Supabase/Postgrest não é instanceof Error (é um objeto plano
      // com .message) — sem isso, a mensagem real nunca aparecia, só o texto
      // genérico (achado real: "Could not find the table" escondido atrás de
      // "Erro ao gerar relatório").
      const msg = e instanceof Error ? e.message
        : (e && typeof e === "object" && "message" in e) ? String((e as { message: unknown }).message)
        : "Erro ao gerar relatório";
      setErro(msg);
    } finally {
      setGerando(false);
    }
  }

  return (
    <div style={{ padding: "16px 22px" }}>
      <div style={{ background: "var(--bg-card)", border: "0.5px solid var(--border-table)", borderRadius: 12, padding: 32, textAlign: "center" }}>
        <div style={{ fontSize: 32, marginBottom: 10 }}>🖨</div>
        <div style={{ fontSize: 15, fontWeight: 700, color: "var(--text-1)", marginBottom: 6 }}>Relatório de Pedidos de Compra</div>
        <div style={{ fontSize: 12, color: "var(--text-2)", marginBottom: 18, maxWidth: 480, marginLeft: "auto", marginRight: "auto" }}>
          Filtre por fornecedor, nº do pedido do fornecedor, status, grupo, item (insumo), ano safra e período. Visão Por Pedido (1 página por pedido) ou Consolidado por Insumo (soma pedida/entregue/saldo de um produto em todos os pedidos que o contém). Gera direto em PDF (pra imprimir) ou XLSX (baixa).
        </div>
        <button onClick={abrirModal} style={btnV}>🔍 Abrir Filtro e Gerar</button>
      </div>

      {modalAberto && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.45)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center" }}
          onClick={() => setModalAberto(false)}>
          <div style={{ background: "var(--bg-card)", borderRadius: 12, padding: 26, width: "min(94vw, 620px)", maxHeight: "92vh", overflowY: "auto" }} onClick={e => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
              <h2 style={{ margin: 0, fontSize: 17, color: "var(--text-1)" }}>🖨 Relatório de Pedidos de Compra</h2>
              <button onClick={() => setModalAberto(false)} style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer", color: "var(--text-2)" }}>×</button>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 14 }}>
              <div>
                <label style={lbl}>Fornecedor</label>
                <select value={fFornecedor} onChange={e => setFFornecedor(e.target.value)} style={inp}>
                  <option value="">Todos os fornecedores</option>
                  {opcoesFornecedor.map(f => <option key={f.id} value={f.id}>{f.nome}</option>)}
                </select>
              </div>
              <div>
                <label style={lbl}>Nº Pedido do Fornecedor</label>
                <input value={fNrPedForn} onChange={e => setFNrPedForn(e.target.value)} placeholder="Vazio = todos os pedidos" style={inp} />
              </div>
            </div>

            <div style={{ marginBottom: 14 }}>
              <label style={lbl}>Status — marque quantos quiser (vazio = todos)</label>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "6px 18px", border: "0.5px solid var(--border-table)", borderRadius: 8, padding: "10px 12px" }}>
                {STATUS_OPCOES.map(st => (
                  <label key={st} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--text-1)", cursor: "pointer" }}>
                    <input type="checkbox" checked={fStatus.has(st)} onChange={() => toggleStatus(st)} />
                    {STATUS_MAP[st].label}
                  </label>
                ))}
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 14 }}>
              <div>
                <label style={lbl}>Grupo</label>
                <select value={fGrupoId} onChange={e => { setFGrupoId(e.target.value); setFInsumoId(""); }} style={inp}>
                  <option value="">Todos os grupos</option>
                  {grupos.map(g => <option key={g.id} value={g.id}>{g.nome}</option>)}
                </select>
              </div>
              <div>
                <label style={lbl}>Item (insumo)</label>
                <select value={fInsumoId} onChange={e => setFInsumoId(e.target.value)} style={inp}>
                  <option value="">Todos os itens{fGrupoId ? " do grupo" : ""}</option>
                  {insumosDoGrupo.map(i => <option key={i.id} value={i.id}>{i.nome}</option>)}
                </select>
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 14 }}>
              <div>
                <label style={lbl}>Ano Safra</label>
                <select value={fAnoSafra} onChange={e => setFAnoSafra(e.target.value)} style={inp}>
                  <option value="">Todas as safras</option>
                  {opcoesAnoSafra.map(a => <option key={a.id} value={a.id}>{a.descricao}</option>)}
                </select>
              </div>
              <div>
                <label style={lbl}>Data de</label>
                <InputData type="date" value={fDataDe} onChange={e => setFDataDe(e.target.value)} style={inp} />
              </div>
              <div>
                <label style={lbl}>Data até</label>
                <InputData type="date" value={fDataAte} onChange={e => setFDataAte(e.target.value)} style={inp} />
              </div>
            </div>

            <div style={{ marginBottom: 14 }}>
              <label style={lbl}>Visão</label>
              <div style={{ display: "flex", gap: 14, border: "0.5px solid var(--border-table)", borderRadius: 8, padding: "10px 12px" }}>
                {([["pedido", "Por Pedido (1 página por pedido)"], ["insumo", "Consolidado por Insumo (todos os pedidos somados)"]] as const).map(([v, label]) => (
                  <label key={v} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, cursor: "pointer" }}>
                    <input type="checkbox" checked={fVisao === v} onChange={() => setFVisao(v)} />
                    {label}
                  </label>
                ))}
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 18 }}>
              <div>
                <label style={lbl}>Tipo</label>
                <div style={{ display: "flex", gap: 14, border: "0.5px solid var(--border-table)", borderRadius: 8, padding: "10px 12px" }}>
                  {fVisao === "pedido"
                    ? ([["sintetico", "Sintético (só as NFs)"], ["analitico", "Analítico (NFs abertas)"]] as const).map(([v, label]) => (
                        <label key={v} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, cursor: "pointer" }}>
                          <input type="checkbox" checked={fTipo === v} onChange={() => setFTipo(v)} />
                          {label}
                        </label>
                      ))
                    : ([["sintetico", "Resumo (só o consolidado)"], ["analitico", "Detalhado (com os pedidos de cada item)"]] as const).map(([v, label]) => (
                        <label key={v} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, cursor: "pointer" }}>
                          <input type="checkbox" checked={fTipo === v} onChange={() => setFTipo(v)} />
                          {label}
                        </label>
                      ))}
                </div>
              </div>
              <div>
                <label style={lbl}>Emissão</label>
                <div style={{ display: "flex", gap: 14, border: "0.5px solid var(--border-table)", borderRadius: 8, padding: "10px 12px" }}>
                  {([["pdf", "PDF (imprimir)"], ["xlsx", "XLSX (baixar)"]] as const).map(([v, label]) => (
                    <label key={v} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, cursor: "pointer" }}>
                      <input type="checkbox" checked={fFormato === v} onChange={() => setFFormato(v)} />
                      {label}
                    </label>
                  ))}
                </div>
              </div>
            </div>

            {erro && (
              <div style={{ background: "#FCEBEB", border: "0.5px solid #E24B4A60", borderRadius: 8, padding: "8px 12px", marginBottom: 14, fontSize: 12, color: "#791F1F" }}>
                {erro}
              </div>
            )}

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, borderTop: "0.5px solid var(--border-table)", paddingTop: 16 }}>
              <button onClick={() => setModalAberto(false)} style={btnR}>Cancelar</button>
              <button onClick={gerar} disabled={gerando} style={{ ...btnV, opacity: gerando ? 0.6 : 1 }}>
                {gerando ? "Gerando..." : "Gerar Relatório"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
