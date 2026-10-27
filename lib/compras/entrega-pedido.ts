// Quanto de cada linha do pedido de compra já foi entregue pelas NFs de entrada processadas.
// Sem acesso a banco: usado pelas telas, pelos relatórios e pelas rotas do servidor (estornar/excluir NF).
import { fatorUnidade } from "../estoque/unidades.ts";

type Linha = { id: string; insumo_id?: string | null; quantidade: number; unidade?: string | null };
type ItemNf = { insumo_id?: string | null; pedido_item_id?: string | null; quantidade: number; unidade?: string | null };

// A NF entra sempre na unidade do cadastro do item; a linha do pedido pode estar noutra (pedidos antigos em bag, t…).
// Converte quando é seguro (t → kg, lt → L); sem conversão segura (bag × kg) a entrega não é somada na linha — somar
// kg em bag dava "71.520 de 97 bags" (73.732%) e encerrava o pedido antes da hora.
function fatorParaLinha(nf: ItemNf, linha: Linha | undefined): number | null {
  if (!linha || !nf.unidade || !linha.unidade) return 1;
  return fatorUnidade(nf.unidade, linha.unidade);
}

function destinoDoItem(nf: ItemNf, porId: Map<string, Linha>, porInsumo: Map<string, Linha[]>): Linha | undefined {
  return (nf.pedido_item_id ? porId.get(nf.pedido_item_id) : undefined) ?? porInsumo.get(nf.insumo_id ?? "")?.[0];
}

function indexar(linhas: Linha[]) {
  const porId = new Map<string, Linha>();
  const porInsumo = new Map<string, Linha[]>();
  for (const l of linhas) {
    if (!l.insumo_id) continue;
    porId.set(l.id, l);
    porInsumo.set(l.insumo_id, [...(porInsumo.get(l.insumo_id) ?? []), l]);
  }
  return { porId, porInsumo };
}

/**
 * Pedido pode ter o mesmo produto em mais de uma linha (embalagens ou valor por unidade diferentes): prioriza o
 * vínculo exato (nf_entrada_itens.pedido_item_id); sem ele, preenche as linhas do mesmo produto em ordem, e a sobra
 * fica na última (divergência real à vista). Quantidades já convertidas para a unidade da linha.
 */
export function alocarEntregaPorLinha(linhas: Linha[], nfItens: ItemNf[]): Map<string, number> {
  const entregue = new Map<string, number>();
  const { porId, porInsumo } = indexar(linhas);
  for (const l of porId.values()) entregue.set(l.id, 0);

  const naoVinculadoPorInsumo = new Map<string, number>();
  for (const nf of nfItens) {
    if (!nf.insumo_id) continue;
    const fator = fatorParaLinha(nf, destinoDoItem(nf, porId, porInsumo));
    if (fator === null) continue;
    const qtd = nf.quantidade * fator;
    if (nf.pedido_item_id && entregue.has(nf.pedido_item_id)) {
      entregue.set(nf.pedido_item_id, (entregue.get(nf.pedido_item_id) ?? 0) + qtd);
    } else {
      naoVinculadoPorInsumo.set(nf.insumo_id, (naoVinculadoPorInsumo.get(nf.insumo_id) ?? 0) + qtd);
    }
  }

  for (const [insumoId, linhasDoProduto] of porInsumo) {
    let restante = naoVinculadoPorInsumo.get(insumoId) ?? 0;
    if (restante <= 0) continue;
    for (const l of linhasDoProduto) {
      if (restante <= 0) break;
      const jaAlocado = entregue.get(l.id) ?? 0;
      const aplicar = Math.min(restante, Math.max(0, l.quantidade - jaAlocado));
      entregue.set(l.id, jaAlocado + aplicar);
      restante -= aplicar;
    }
    if (restante > 0 && linhasDoProduto.length > 0) {
      const ultima = linhasDoProduto[linhasDoProduto.length - 1];
      entregue.set(ultima.id, (entregue.get(ultima.id) ?? 0) + restante);
    }
  }
  return entregue;
}

/** Linhas que receberam NF numa unidade sem conversão segura para a do pedido (a entrega delas não é somada). */
export function linhasSemConversao(linhas: Linha[], nfItens: ItemNf[]): Map<string, string> {
  const { porId, porInsumo } = indexar(linhas);
  const out = new Map<string, string>();
  for (const nf of nfItens) {
    if (!nf.insumo_id) continue;
    const linha = destinoDoItem(nf, porId, porInsumo);
    if (linha && fatorParaLinha(nf, linha) === null) out.set(linha.id, String(nf.unidade));
  }
  return out;
}

/**
 * Status do pedido pela entrega de cada linha. Pedido que já recebeu NF processada nunca volta para "aprovado": linha
 * pedida numa unidade sem conversão (bag × kg) fica com entrega 0 até o pedido ser ajustado, mas a mercadoria chegou.
 */
export function statusPorEntrega(
  linhas: { id: string; quantidade: number; qtd_cancelada?: number | null }[],
  entregue: Map<string, number>,
  temNfProcessada: boolean,
): "entregue" | "parcialmente_entregue" | "aprovado" {
  const todo = linhas.every(l => (entregue.get(l.id) ?? 0) >= l.quantidade - (l.qtd_cancelada ?? 0));
  const algum = temNfProcessada || linhas.some(l => (entregue.get(l.id) ?? 0) > 0);
  return todo ? "entregue" : algum ? "parcialmente_entregue" : "aprovado";
}

/**
 * Volume de uma NF na unidade do pedido (relatório de pedidos: coluna Volume das parcelas). Soma por unidade: itens
 * sem conversão segura para a unidade da linha ficam na unidade da própria NF.
 */
export function volumeDaNf(linhas: Linha[], nfItens: ItemNf[]): { quantidade: number; unidade: string }[] {
  const { porId, porInsumo } = indexar(linhas);
  const soma = new Map<string, number>();
  for (const nf of nfItens) {
    // Item da NF sem vínculo com o cadastro: num pedido de um produto só, é desse produto
    const linha = (nf.insumo_id ? destinoDoItem(nf, porId, porInsumo) : undefined) ?? (linhas.length === 1 ? linhas[0] : undefined);
    const fator = linha ? fatorParaLinha(nf, linha) : null;
    const unidade = (fator !== null && linha ? (linha.unidade || nf.unidade) : nf.unidade) ?? "";
    soma.set(unidade, (soma.get(unidade) ?? 0) + nf.quantidade * (fator ?? 1));
  }
  return Array.from(soma, ([unidade, quantidade]) => ({ quantidade, unidade }));
}
