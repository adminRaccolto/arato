// Relatório de Pedidos de Compra — visão Por Pedido · Sintético ("Detalhamento por Pedido").
// Pedido do dono 23/10/2026, inspirado em outro sistema: um bloco leve por pedido, em sequência, com cabeçalho em
// células rotuladas, produtos (pedido × atendido × saldo) e parcelas (títulos reais do pedido e das NFs dele, com
// pago e saldo). Mantém o nosso cabeçalho no topo; logo Arato pequena no rodapé de cada página impressa.
// Função pura (sem React) para poder ser testada e renderizada fora da tela.
import { alocarEntregaPorLinha } from "../db";
import type { PedidoCompraItem, NfEntrada, NfEntradaItem } from "../supabase";

export type ParcelaRel = { origem: string; vencimento: string | null; valor: number; pago: number; status: string };
export type ExtraPedido = { ie: string | null; fazenda: string; vencimento: string | null; parcelas: ParcelaRel[] };
export type PedidoSintetico = { id: string; numero: number | null; nr_pedido: string | null; fornecedor_nome: string | null; fornecedor_cpf_cnpj: string | null;
  produtor_nome: string | null; ano_safra_descricao: string | null; data_registro: string; moeda: string | null; status: string; fiscal: boolean | null; total_financeiro: number | null };

const fmtN = (v?: number | null, d = 2) => v != null ? v.toLocaleString("pt-BR", { minimumFractionDigits: d, maximumFractionDigits: d }) : "—";
const fmtData = (s?: string | null) => s ? s.split("-").reverse().join("/") : "—";

export function buildSinteticoHtml(dados: { ped: PedidoSintetico; itens: PedidoCompraItem[]; nfs: NfEntrada[]; nfItens: NfEntradaItem[] }[], extras: Map<string, ExtraPedido>, filtrosTexto: string, ctx: { contaNome: string | null; nomeUsuario: string | null; logoCliente: string | null; nomeArquivo: string; origem: string; statusLabel: (s: string) => string }): string {
  const cel = (rot: string, val: string, extra = "") => `<div class="sx-cel" ${extra}><div class="sx-rot">${rot}</div><div class="sx-val">${val}</div></div>`;
  const blocosPedidos = dados.map(({ ped, itens, nfs, nfItens }) => {
    const ex = extras.get(ped.id);
    const moeda = ped.moeda ?? "R$";
    const sufixo = moeda === "USD" ? "US$" : moeda === "barter" ? "sc" : "R$";
    const ehFiscal = ped.fiscal ?? false;
    const proc = new Set(nfs.filter(n => n.status === "processada").map(n => n.id));
    const entregaPorLinha = ehFiscal ? alocarEntregaPorLinha(itens, nfItens.filter(it => proc.has(it.nf_entrada_id ?? ""))) : new Map<string, number>();
    let valorAtendido = 0;
    const linhas = itens.map((it, i) => {
      const atendida = ehFiscal ? (entregaPorLinha.get(it.id) ?? 0) : (it.qtd_entregue ?? 0);
      const cancelada = it.qtd_cancelada ?? 0;
      const saldo = Math.max(0, it.quantidade - cancelada - atendida);
      const vAt = atendida * (it.valor_unitario ?? 0);
      valorAtendido += vAt;
      return `<tr><td>${i + 1}</td><td>${it.nome_item}</td><td class="r">${fmtN(it.valor_unitario)}</td><td>${it.unidade ?? ""}</td><td class="r">${fmtN(it.quantidade, 3)}</td><td class="r">${fmtN(atendida, 3)}</td><td class="r">${fmtN(cancelada, 3)}</td><td class="r">${fmtN(saldo, 3)}</td><td class="r">${fmtN(vAt)}</td></tr>`;
    }).join("");
    const parcelas = ex?.parcelas ?? [];
    const pago = parcelas.reduce((s, p) => s + p.pago, 0);
    const aPagar = parcelas.reduce((s, p) => s + Math.max(0, p.valor - p.pago), 0);
    const sitParc = (p: ParcelaRel) => p.pago >= p.valor - 0.01 ? `<span class="ok">Pago</span>` : p.pago > 0 ? `<span class="pend">Parcial</span>` : `<span class="pend">Pendente</span>`;
    const linhasParc = parcelas.map((p, i) => `<tr><td>${i + 1}</td><td>${p.origem}</td><td>${fmtData(p.vencimento)}</td><td class="r">${fmtN(p.valor)}</td><td class="r">${fmtN(p.pago)}</td><td class="r">${fmtN(Math.max(0, p.valor - p.pago))}</td><td>${sitParc(p)}</td></tr>`).join("");
    return `<div class="sx-ped">
<div class="sx-grid" style="grid-template-columns:1fr 2fr 1fr">
  ${cel("Pedido nº", ped.nr_pedido || String(ped.numero ?? "—"))}
  ${cel("Fornecedor", `${ped.fornecedor_nome ?? "—"} <span class="sx-doc">${ped.fornecedor_cpf_cnpj ?? ""}</span>`)}
  ${cel("Situação do pedido", ctx.statusLabel(ped.status))}
</div>
<div class="sx-grid" style="grid-template-columns:1fr">
  ${cel("Produtor", `${ped.produtor_nome ?? "—"}${ex?.ie ? ` <span class="sx-doc">IE ${ex.ie}</span>` : ""}`)}
</div>
<div class="sx-grid" style="grid-template-columns:repeat(4,1fr)">
  ${cel("Fazenda", ex?.fazenda ?? "—")}${cel("Safra", ped.ano_safra_descricao ?? "—")}${cel("Emissão", fmtData(ped.data_registro))}${cel("Vencimento", fmtData(ex?.vencimento ?? null))}
</div>
<div class="sx-grid" style="grid-template-columns:repeat(4,1fr)">
  ${cel(`Valor total · ${sufixo}`, fmtN(ped.total_financeiro ?? 0))}${cel(`Atendido · ${sufixo}`, fmtN(valorAtendido))}${cel("Pago · R$", fmtN(pago))}${cel("A pagar · R$", `<span class="pend">${fmtN(aPagar)}</span>`)}
</div>
<div class="sx-sec">PRODUTOS <span>(${itens.length})</span></div>
<table class="sx-tab"><thead><tr><th>ID</th><th>Descrição</th><th class="r">Vlr. Un.</th><th>Unid.</th><th class="r">Quant. Total</th><th class="r">Quant. Atendida</th><th class="r">Quant. Cancelada</th><th class="r">Quant. Saldo</th><th class="r">Valor Atendido</th></tr></thead><tbody>${linhas || `<tr><td colspan="9" class="vazio">Sem itens</td></tr>`}</tbody></table>
<div class="sx-sec">PARCELAS <span>(${parcelas.length})</span></div>
<table class="sx-tab"><thead><tr><th>Nº</th><th>Origem</th><th>Vencimento</th><th class="r">Valor da Parcela</th><th class="r">Valor Pago</th><th class="r">Saldo</th><th>Situação</th></tr></thead><tbody>${linhasParc || `<tr><td colspan="7" class="vazio">Sem títulos no financeiro</td></tr>`}</tbody></table>
</div>`;
  }).join("");
  const arato = `${ctx.origem}/logo_Arato_Nova.png`;
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${ctx.nomeArquivo}</title>
<style>
body{margin:0;font-family:Arial,sans-serif;font-size:8.5pt;color:#1a1a1a;background:#D1D5DB}
.rt-toolbar{position:sticky;top:0;background:#111111;padding:10px 24px;display:flex;align-items:center;justify-content:space-between;z-index:100}
.rt-toolbar span{color:#fff;font-size:13px;font-weight:700}
.rt-btn{background:#fff;color:#111111;border:none;padding:8px 20px;border-radius:8px;font-size:13px;font-weight:700;cursor:pointer}
.rt-folha{background:#fff;width:277mm;margin:24px auto;padding:12mm;box-shadow:0 4px 24px rgba(0,0,0,.18);box-sizing:border-box}
.sx-filtros{display:flex;flex-wrap:wrap;gap:6px 22px;padding:8px 0;border-top:0.5px solid #DDE2EE;border-bottom:0.5px solid #DDE2EE;margin:10px 0 12px;font-size:8pt}
.sx-filtros b{color:#6B7A90;font-weight:600}
.sx-ped{border:0.5px solid #DDE2EE;border-radius:4px;margin-bottom:12px;page-break-inside:avoid;break-inside:avoid}
.sx-grid{display:grid;background:#F4F6FA;border-bottom:0.5px solid #DDE2EE}
.sx-cel{padding:5px 9px;border-right:0.5px solid #DDE2EE}
.sx-cel:last-child{border-right:none}
.sx-rot{font-size:6.5pt;color:#6B7A90;font-weight:700;text-transform:uppercase;letter-spacing:.05em;margin-bottom:2px}
.sx-val{font-size:9pt;font-weight:700;color:#1a1a1a}
.sx-doc{font-weight:400;color:#6B7A90}
.sx-sec{font-size:8pt;font-weight:700;margin:10px 10px 4px}
.sx-sec span{color:#6B7A90;font-weight:400}
.sx-tab{width:calc(100% - 20px);margin:0 10px 8px;border-collapse:collapse;font-size:8pt}
.sx-tab th{text-align:left;font-weight:700;padding:4px 6px;border-bottom:0.5px solid #C9D1DD}
.sx-tab td{padding:4px 6px;border-bottom:0.5px solid #EEF1F6}
.sx-tab .r{text-align:right}
.sx-tab .vazio{color:#888;text-align:center}
.pend{color:#E8892B;font-weight:600}
.ok{color:#16A34A;font-weight:600}
/* Rodapé com a logo Arato em cada página impressa: fica fixo no fim da página, e o tfoot vazio da tabela que envolve
   o conteúdo se repete em toda página, reservando o espaço para o conteúdo não passar por baixo dele. */
.sx-wrap{width:100%;border-collapse:collapse}
.sx-wrap>tbody>tr>td,.sx-wrap>tfoot>tr>td{padding:0}
.sx-rodape,.sx-espaco{display:none}
@page{size:A4 landscape;margin:10mm 10mm 6mm}
@media print{
  body{background:#fff}.rt-toolbar{display:none!important}.rt-folha{box-shadow:none;width:100%;margin:0;padding:0}
  .sx-espaco{display:block;height:9mm}
  .sx-rodape{display:flex;position:fixed;bottom:0;left:0;right:0;height:7mm;justify-content:center;align-items:center;gap:5px;font-size:6pt;color:#9AA4B2;border-top:0.5px solid #E5E9F0;background:#fff}
  .sx-rodape img{height:8px}
}
</style></head><body>
<div class="rt-toolbar"><span>Pedidos de Compra — Detalhamento por Pedido — Arato</span><button class="rt-btn" onclick="window.print()">&#128438; Imprimir / Salvar PDF</button></div>
<div class="rt-folha">
<table class="sx-wrap"><tfoot><tr><td><div class="sx-espaco"></div></td></tr></tfoot><tbody><tr><td>
<div style="border-bottom:2px solid #111111;padding-bottom:10px;display:flex;justify-content:space-between;align-items:flex-start">
  <div style="display:flex;align-items:center;gap:12px">
    ${ctx.logoCliente ? `<img src="${ctx.logoCliente}" style="height:40px;object-fit:contain">` : ""}
    <div>
      <div style="font-size:14pt;font-weight:700;color:#111111;line-height:1.2">${ctx.contaNome ?? "—"}</div>
      <div style="font-size:7.5pt;color:#888;margin-top:3px">Emitido por ${ctx.nomeUsuario ?? "—"} em ${new Date().toLocaleString("pt-BR")}</div>
    </div>
  </div>
  <div style="text-align:right">
    <div style="font-size:13pt;font-weight:700;color:#111111">PEDIDOS DE COMPRA</div>
    <div style="font-size:8.5pt;color:#555">${dados.length} pedido(s)</div>
  </div>
</div>
<div class="sx-filtros">${filtrosTexto}</div>
${blocosPedidos}
</td></tr></tbody></table>
</div>
<div class="sx-rodape"><img src="${arato}" alt="Arato" onerror="this.style.display='none'"><span>Arato · Gestão Agrícola</span></div>
</body></html>`;
}

