// Relatório "Compras por Produto" (19/11/2026): movimento só de entrada fiscal de compra, agrupado por produto.
// Regras puras (testadas em compras-produto.test.ts); a tela busca os dados e chama montarComprasPorProduto.
//
// O que é compra:
//  - NF de entrada PROCESSADA (pendente ainda não entrou; cancelada e transferência não são compra);
//  - tipo da NF diferente de remessa e devolução de compra; item com apropriação diferente de remessa;
//  - CFOP do item (ou da NF, se o item não tiver) de compra: x101–x125 (venda/compra de mercadoria, inclui a remessa
//    de entrega futura x116/x117, que é quando a mercadoria chega), x401–x405 (com substituição tributária),
//    x651–x667 (combustíveis) e x929 (registrada em cupom fiscal). Sem CFOP nenhum, o item entra.
//  - Fora: x922 (simples faturamento de entrega futura — sem mercadoria; ela entra depois pela x116/x117, contá-la
//    dobraria a quantidade), transferência, retorno, remessa, devolução, bonificação e "outras" (x949).

// Abrangência "entradas" (24/11/2026): toda NF de entrada processada, como a coluna Fiscal do Auditor de Estoque
// (lib/estoque/auditoria-fiscal.ts) — inclui bonificação, outras entradas, devolução de venda etc.; fora só a NF de
// retorno/remessa de armazém (CFOP_FORA_DO_FISCAL em algum item), porque o produto continua do cliente.
import { CFOP_FORA_DO_FISCAL } from "../estoque/auditoria-fiscal";

export type Abrangencia = "compras" | "entradas";

export type NfCompra = {
  id: string; fazenda_id: string; numero: string | null; serie: string | null; emitente_nome: string | null;
  data_emissao: string | null; data_entrada: string | null; status: string; tipo_entrada: string | null; cfop: string | null;
};
export type ItemCompra = {
  id: string; nf_entrada_id: string; insumo_id: string | null; descricao_produto: string | null; unidade: string | null;
  quantidade: number | null; valor_total: number | null; cfop: string | null; tipo_apropiacao: string | null;
};
export type InsumoInfo = { nome: string; unidade: string | null; grupo: string | null };

export type MovimentoCompra = {
  data: string; nf: string; fornecedor: string; fazenda: string; cfop: string; apropriacao: string;
  quantidade: number; unidade: string; valorUnitario: number; valorTotal: number;
};
export type ProdutoCompra = {
  chave: string; produto: string; grupo: string; doCadastro: boolean; unidade: string;
  quantidade: number; valorTotal: number; precoMedio: number; nfs: number; fornecedores: number;
  ultimaData: string; ultimoPreco: number; movimentos: MovimentoCompra[];
};

const r2 = (v: number) => Math.round(v * 100) / 100;

export function ehCfopCompra(cfop: string | null | undefined): boolean {
  const c = String(cfop ?? "").replace(/\D/g, "");
  if (c.length !== 4) return true; // sem CFOP: não há como excluir
  if (!/^[123567]/.test(c)) return false; // 1/2/3 = CFOP de entrada; 5/6/7 = CFOP do emitente
  const n = Number(c.slice(1));
  return (n >= 101 && n <= 125) || (n >= 401 && n <= 405) || (n >= 651 && n <= 667) || n === 929;
}

export const APROPRIACAO_ROTULO: Record<string, string> = {
  estoque: "Estoque", direto: "Apropriação direta", maquinario: "Maquinário", terceiro: "Terceiro", vef: "Entrega futura",
};

const normalizar = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim().toUpperCase();

export function itemEhCompra(nf: NfCompra, it: ItemCompra): boolean {
  if (nf.status !== "processada") return false;
  if (nf.tipo_entrada === "remessa" || nf.tipo_entrada === "devolucao_compra") return false;
  if (it.tipo_apropiacao === "remessa") return false;
  return ehCfopCompra(it.cfop || nf.cfop);
}

export function montarComprasPorProduto(p: {
  nfs: NfCompra[]; itens: ItemCompra[]; insumos: Map<string, InsumoInfo>; fazendas: Map<string, string>;
  filtroProduto?: string; filtroGrupo?: string; filtroFornecedor?: string; filtroApropriacao?: string; soCadastro?: boolean;
  abrangencia?: Abrangencia; filtroInsumoId?: string;
}): ProdutoCompra[] {
  const nfPorId = new Map(p.nfs.map(n => [n.id, n]));
  const todasEntradas = p.abrangencia === "entradas";
  const nfsForaDoFiscal = new Set(todasEntradas
    ? p.itens.filter(i => CFOP_FORA_DO_FISCAL.has(String(i.cfop ?? "").replace(/\D/g, ""))).map(i => i.nf_entrada_id) : []);
  const busca = p.filtroProduto ? normalizar(p.filtroProduto) : "";
  const forn = p.filtroFornecedor ? normalizar(p.filtroFornecedor) : "";
  const mapa = new Map<string, ProdutoCompra & { _nfs: Set<string>; _forn: Set<string> }>();
  for (const it of p.itens) {
    const nf = nfPorId.get(it.nf_entrada_id);
    if (!nf) continue;
    if (todasEntradas ? (nf.status !== "processada" || nfsForaDoFiscal.has(nf.id)) : !itemEhCompra(nf, it)) continue;
    if (p.filtroInsumoId && it.insumo_id !== p.filtroInsumoId) continue;
    const ins = it.insumo_id ? p.insumos.get(it.insumo_id) : undefined;
    if (p.soCadastro && !ins) continue;
    if (p.filtroApropriacao && it.tipo_apropiacao !== p.filtroApropriacao) continue;
    const grupo = ins?.grupo ?? "";
    if (p.filtroGrupo && grupo !== p.filtroGrupo) continue;
    const descricao = String(it.descricao_produto ?? "").trim() || "(sem descrição)";
    const nome = ins?.nome ?? descricao;
    if (busca && !normalizar(nome).includes(busca) && !normalizar(descricao).includes(busca)) continue;
    const fornecedor = String(nf.emitente_nome ?? "").trim() || "—";
    if (forn && !normalizar(fornecedor).includes(forn)) continue;
    const unidade = String((ins ? it.unidade || ins.unidade : it.unidade) ?? "").trim().toUpperCase();
    const chave = ins ? `i:${it.insumo_id}|${unidade}` : `d:${normalizar(descricao)}|${unidade}`;
    let g = mapa.get(chave);
    if (!g) {
      g = { chave, produto: nome, grupo, doCadastro: !!ins, unidade, quantidade: 0, valorTotal: 0, precoMedio: 0, nfs: 0,
        fornecedores: 0, ultimaData: "", ultimoPreco: 0, movimentos: [], _nfs: new Set(), _forn: new Set() };
      mapa.set(chave, g);
    }
    const qtd = Number(it.quantidade ?? 0);
    const valor = Number(it.valor_total ?? 0);
    const data = (nf.data_entrada || nf.data_emissao || "").slice(0, 10);
    const unit = qtd > 0 ? valor / qtd : 0;
    g.quantidade += qtd; g.valorTotal += valor; g._nfs.add(nf.id); g._forn.add(normalizar(fornecedor));
    if (data >= g.ultimaData) { g.ultimaData = data; g.ultimoPreco = unit; }
    g.movimentos.push({
      data, nf: [nf.numero, nf.serie].filter(Boolean).join("/") || "—", fornecedor,
      fazenda: p.fazendas.get(nf.fazenda_id) ?? "—", cfop: String(it.cfop || nf.cfop || ""),
      apropriacao: APROPRIACAO_ROTULO[it.tipo_apropiacao ?? ""] ?? (it.tipo_apropiacao ?? ""),
      quantidade: qtd, unidade, valorUnitario: unit, valorTotal: valor,
    });
  }
  return [...mapa.values()].map(({ _nfs, _forn, ...g }) => ({
    ...g, quantidade: Math.round(g.quantidade * 1000) / 1000, valorTotal: r2(g.valorTotal),
    precoMedio: g.quantidade > 0 ? g.valorTotal / g.quantidade : 0, nfs: _nfs.size, fornecedores: _forn.size,
    movimentos: g.movimentos.sort((a, b) => a.data.localeCompare(b.data) || a.nf.localeCompare(b.nf)),
  })).sort((a, b) => a.produto.localeCompare(b.produto, "pt-BR") || a.unidade.localeCompare(b.unidade));
}
