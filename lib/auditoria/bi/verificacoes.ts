// Verificações de dados da aba BI → Auditoria (visível ao cliente). Regras puras sobre os dados do CLIENTE ATIVO
// (todas as fazendas da conta) — carregados no servidor por lib/auditoria/bi/carregar.ts. Antes elas consultavam
// colunas inexistentes, o erro era engolido e a tela mostrava ✓ verde em tudo (achado real 23/10/2026).
import type { InsumoCadastro } from "../../estoque/duplicados";

const UNIDADES: Record<string, string> = {
  kg: "KG", kgs: "KG", quilo: "KG", quilos: "KG", kilo: "KG", kilograma: "KG", kilogramas: "KG",
  l: "L", lt: "L", lts: "L", litro: "L", litros: "L",
  un: "UN", und: "UN", unid: "UN", unidade: "UN", unidades: "UN", pc: "UN", pca: "UN", peca: "UN", pecas: "UN",
  sc: "SC", saca: "SC", sacas: "SC", t: "T", ton: "T", tonelada: "T", toneladas: "T",
  g: "G", gr: "G", grama: "G", ml: "ML", bag: "BAG", bg: "BAG", bags: "BAG", cx: "CX", caixa: "CX", ds: "DOSE", dz: "DOSE", dose: "DOSE", doses: "DOSE", gl: "GL", galao: "GL",
};
/** KG, L, UN, SC… — "Kg", "KGS" e "quilo" são a mesma unidade. */
export const normalizarUnidade = (u?: string | null): string => {
  const k = (u ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z]/g, "");
  return UNIDADES[k] ?? k.toUpperCase();
};

export type ItemNfEntrada = { id: string; nf_entrada_id: string; insumo_id: string | null; descricao_produto?: string | null; unidade_nf?: string | null; unidade?: string | null; fator_conversao?: number | null; quantidade?: number | null };

/**
 * Item de NF que entrou no estoque numa unidade diferente da do cadastro SEM fator de conversão — a quantidade foi
 * somada como se fosse a mesma unidade (ex.: NF em L, cadastro em KG; NF em TON somada como KG).
 */
export function unidadeDivergente(item: ItemNfEntrada, insumo: InsumoCadastro | undefined): boolean {
  if (!insumo?.unidade || !item.unidade_nf) return false;
  const nf = normalizarUnidade(item.unidade_nf), cad = normalizarUnidade(insumo.unidade);
  if (!nf || !cad || nf === cad) return false;
  const fator = Number(item.fator_conversao ?? 0);
  return !(fator > 0 && fator !== 1);
}

