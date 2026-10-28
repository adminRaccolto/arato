// NCM de referência dos produtos agrícolas na NF de VENDA (grão para comercialização, não semente). A fonte da NF é o
// cadastro de Produtos Agrícolas do cliente (nome, NCM, unidade); esta tabela só preenche o NCM vazio pelo "Carregar
// Padrões" e é o último recurso quando o produto do contrato não tem cadastro — a tela avisa nesse caso.
//
// Achado 28/10/2026: a tabela fixa antiga usava NCM de SEMENTE para milho (1005.10.90), arroz (1006.10.10) e um sorgo
// inexistente (1007.90.10). Grão é 1005.90.10 / 1006.10.92 / 1007.90.00. Confirmar com o contador do cliente.

const norm = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

const REGRAS: { teste: RegExp; ncm: string; descricao: string }[] = [
  { teste: /semente|semeadura/, ncm: "", descricao: "semente: NCM próprio, informar no cadastro" },
  { teste: /caroco de algodao|caroco algodao/, ncm: "1207.29.00", descricao: "Caroço de algodão (exceto para semeadura)" },
  { teste: /algodao.*pluma|pluma/, ncm: "5201.00.10", descricao: "Algodão simplesmente debulhado (pluma)" },
  { teste: /pipoca/, ncm: "1005.90.10", descricao: "Milho em grão, exceto para semeadura" },
  { teste: /milho/, ncm: "1005.90.10", descricao: "Milho em grão, exceto para semeadura" },
  { teste: /soja/, ncm: "1201.90.00", descricao: "Soja, mesmo triturada, exceto para semeadura" },
  { teste: /trigo/, ncm: "1001.99.00", descricao: "Trigo, exceto para semeadura" },
  { teste: /sorgo/, ncm: "1007.90.00", descricao: "Sorgo de grão, exceto para semeadura" },
  { teste: /arroz/, ncm: "1006.10.92", descricao: "Arroz com casca, não parboilizado" },
];

/** NCM de referência pelo nome do produto (null quando não há referência segura). */
export function ncmPadraoDoProduto(nome: string | null | undefined): { ncm: string; descricao: string } | null {
  const n = norm(nome ?? "");
  if (!n.trim()) return null;
  const r = REGRAS.find(x => x.teste.test(n));
  return r && r.ncm ? { ncm: r.ncm, descricao: r.descricao } : null;
}

/** Produto do cadastro que corresponde ao produto escrito no contrato (pelo id ligado ou pelo nome). */
export function produtoDoContrato<T extends { id: string; nome: string }>(produtos: T[], produtoId: string | null | undefined, nomeContrato: string | null | undefined): T | undefined {
  if (produtoId) { const p = produtos.find(x => x.id === produtoId); if (p) return p; }
  const alvo = norm(nomeContrato ?? "").trim();
  if (!alvo) return undefined;
  return produtos.find(x => norm(x.nome).trim() === alvo)
    ?? (produtos.filter(x => norm(x.nome).startsWith(alvo) || alvo.startsWith(norm(x.nome))).length === 1
      ? produtos.find(x => norm(x.nome).startsWith(alvo) || alvo.startsWith(norm(x.nome))) : undefined);
}

/** NCM formatado 0000.00.00 (aceita só dígitos). */
export const fmtNcm = (v: string | null | undefined) => {
  const d = (v ?? "").replace(/\D/g, "");
  return d.length === 8 ? `${d.slice(0, 4)}.${d.slice(4, 6)}.${d.slice(6)}` : (v ?? "");
};
