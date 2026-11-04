// Preço por kg da NF de venda a partir do contrato. contratos.preco é por saca (ou por kg nos produtos com fator 1, como gergelim):
// o que vale é o item do contrato, valor total ÷ kg. Sem item em kg, cai no preço ÷ kg da saca do produto.
// A NF sai em reais: contrato em dólar converte pela cotação do contrato ou, sem ela, pela PTAX informada.
type ContratoPreco = { produto?: string | null; preco?: number | null; moeda?: string | null; cotacao_usd?: number | null };
type ItemContrato = { produto?: string | null; unidade?: string | null; quantidade?: number | null; valor_total?: number | null };

export function precoKgDoContrato(c: ContratoPreco, itens: ItemContrato[], kgSaca: number, ptax?: number | null): { precoKg: number; aviso: string } {
  const emKg = itens.filter(i => (i.unidade ?? "").toLowerCase() === "kg" && Number(i.quantidade) > 0 && Number(i.valor_total) > 0);
  const doProduto = emKg.filter(i => i.produto === c.produto);
  const base = doProduto.length ? doProduto : emKg;
  const kg = base.reduce((s, i) => s + Number(i.quantidade), 0);
  const precoOriginal = kg > 0 ? base.reduce((s, i) => s + Number(i.valor_total), 0) / kg : Number(c.preco ?? 0) / (kgSaca || 60);
  if (c.moeda !== "USD") return { precoKg: precoOriginal, aviso: "" };
  const cotacao = Number(c.cotacao_usd) > 0 ? Number(c.cotacao_usd) : Number(ptax) > 0 ? Number(ptax) : 0;
  if (!cotacao) return { precoKg: 0, aviso: "Contrato em dólar sem cotação: informe o preço em reais no item." };
  const fonte = Number(c.cotacao_usd) > 0 ? "cotação do contrato" : "PTAX do dia";
  return { precoKg: precoOriginal * cotacao, aviso: `Contrato em dólar: preço convertido a R$ ${cotacao.toLocaleString("pt-BR", { minimumFractionDigits: 4 })} (${fonte}). Confira.` };
}
