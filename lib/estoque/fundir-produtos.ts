// Fundir cadastros de produto (Gestão Arato → Correções → Fundir Produtos, só equipe Raccolto) — 23/11/2026.
// Regras puras da tela; quem funde de verdade é o banco (Seção 461 → fn_mesclar_insumos_escolhendo, que usa o motor
// da Seção 366: troca o produto em NF, movimentações de estoque e todo vínculo, numa transação, com desfazer).

export type ProdutoFusao = {
  id: string; nome: string; unidade: string | null; tipo: string | null; categoria: string | null; subgrupo: string | null;
  grupo_id: string | null; fabricante: string | null; ncm: string | null; principio_ativo_id: string | null;
  cultura_id: string | null; estoque_minimo: number | null; deposito_padrao_id: string | null; foto_url: string | null;
  estoque: number | null; custo_medio: number | null; ativo: boolean | null; created_at?: string | null;
  movimentos?: number; itensNf?: number;
};

/** Campos que podem vir de qualquer um dos cadastros fundidos (mesma lista aceita pela Seção 461). */
export const CAMPOS_FUSAO = [
  { campo: "nome", rotulo: "Nome" },
  { campo: "ncm", rotulo: "NCM" },
  { campo: "categoria", rotulo: "Categoria" },
  { campo: "grupo_id", rotulo: "Grupo" },
  { campo: "subgrupo", rotulo: "Subgrupo" },
  { campo: "fabricante", rotulo: "Fabricante" },
  { campo: "principio_ativo_id", rotulo: "Princípio ativo" },
  { campo: "cultura_id", rotulo: "Cultura" },
  { campo: "estoque_minimo", rotulo: "Estoque mínimo" },
  { campo: "deposito_padrao_id", rotulo: "Depósito padrão" },
  { campo: "foto_url", rotulo: "Foto" },
] as const;
export type CampoFusao = (typeof CAMPOS_FUSAO)[number]["campo"];

const unidadeNorm = (u: string | null | undefined) => String(u ?? "").trim().toLowerCase();
const vazio = (v: unknown) => v == null || (typeof v === "string" && v.trim() === "");

/** Motivos que impedem a fusão (o banco recusa os mesmos). */
export function problemasFusao(itens: ProdutoFusao[]): string[] {
  const p: string[] = [];
  if (itens.length < 2) p.push("Marque pelo menos dois cadastros.");
  const unidades = [...new Set(itens.map(i => unidadeNorm(i.unidade)))];
  if (unidades.length > 1) p.push(`Unidades diferentes (${unidades.map(u => u || "sem unidade").join(", ")}): só dá para fundir cadastros com a mesma unidade de medida.`);
  const tipos = [...new Set(itens.map(i => i.tipo ?? "insumo"))];
  if (tipos.length > 1) p.push("Tipos diferentes (insumo × produto agrícola): não podem ser fundidos.");
  return p;
}

/** Campos em que os cadastros marcados têm valores diferentes (só esses pedem escolha). */
export function camposDivergentes(itens: ProdutoFusao[]): CampoFusao[] {
  return CAMPOS_FUSAO.map(c => c.campo).filter(campo => {
    const valores = new Set(itens.map(i => (vazio(i[campo]) ? "" : String(i[campo]).trim())));
    return valores.size > 1;
  });
}

/** Escolha inicial de cada campo: o valor do cadastro que fica; se ele estiver vazio, o primeiro preenchido. */
export function escolhaInicial(itens: ProdutoFusao[], destinoId: string): Record<CampoFusao, string> {
  const destino = itens.find(i => i.id === destinoId);
  const out = {} as Record<CampoFusao, string>;
  for (const campo of camposDivergentes(itens)) {
    out[campo] = destino && !vazio(destino[campo]) ? destino.id : (itens.find(i => !vazio(i[campo]))?.id ?? destinoId);
  }
  return out;
}

/** Campos a gravar no cadastro que fica: só os escolhidos de outro cadastro e com valor diferente. */
export function camposParaGravar(itens: ProdutoFusao[], destinoId: string, escolhas: Partial<Record<CampoFusao, string>>): Partial<Record<CampoFusao, unknown>> {
  const destino = itens.find(i => i.id === destinoId);
  if (!destino) return {};
  const out: Partial<Record<CampoFusao, unknown>> = {};
  for (const [campo, deId] of Object.entries(escolhas) as [CampoFusao, string][]) {
    if (!deId || deId === destinoId) continue;
    const fonte = itens.find(i => i.id === deId);
    if (!fonte) continue;
    const valor = fonte[campo];
    if (String(valor ?? "") !== String(destino[campo] ?? "")) out[campo] = vazio(valor) ? null : valor;
  }
  return out;
}

/** Sugestão do cadastro que fica: o com mais movimentações e notas; empate, o mais antigo. */
export function sugerirDestino(itens: ProdutoFusao[]): string | null {
  if (!itens.length) return null;
  return [...itens].sort((a, b) =>
    ((b.movimentos ?? 0) + (b.itensNf ?? 0)) - ((a.movimentos ?? 0) + (a.itensNf ?? 0))
    || String(a.created_at ?? "").localeCompare(String(b.created_at ?? "")))[0].id;
}

/** Prévia do resultado: saldo somado e custo médio ponderado pelos saldos positivos (mesma conta da Seção 366). */
export function previaFusao(itens: ProdutoFusao[], destinoId: string): { saldo: number; custoMedio: number | null; movimentos: number; itensNf: number } {
  const saldo = itens.reduce((s, i) => s + Number(i.estoque ?? 0), 0);
  const base = itens.filter(i => Number(i.estoque ?? 0) > 0 && Number(i.custo_medio ?? 0) > 0);
  const qtd = base.reduce((s, i) => s + Number(i.estoque), 0);
  const destino = itens.find(i => i.id === destinoId);
  const custoMedio = qtd > 0 ? base.reduce((s, i) => s + Number(i.estoque) * Number(i.custo_medio), 0) / qtd : (destino?.custo_medio ?? null);
  return {
    saldo: Math.round(saldo * 1000) / 1000, custoMedio,
    movimentos: itens.filter(i => i.id !== destinoId).reduce((s, i) => s + (i.movimentos ?? 0), 0),
    itensNf: itens.filter(i => i.id !== destinoId).reduce((s, i) => s + (i.itensNf ?? 0), 0),
  };
}
