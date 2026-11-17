// Operação Gerencial por tipo de documento de entrada (Seção 455, 17/11/2026): NF de Produtos, NF de Serviços (NFS-e) e
// CT-e têm marcas próprias. Marca NULL (banco antes da Seção 455, ou OG criada por um caminho que não grava as marcas)
// segue a regra que valia antes, a mesma usada para preencher as colunas na migração — a lista de cada tela não muda.
export type DocEntrada = "nf_produtos" | "nfs" | "cte";

export type OgMarcas = {
  tipo?: string | null;
  permite_notas_fiscais?: boolean | null;
  permite_cp_cr?: boolean | null;
  permite_nf_produtos?: boolean | null;
  permite_nfs?: boolean | null;
  permite_cte?: boolean | null;
};

/** A OG aparece neste tipo de documento de entrada? */
export function ogAceitaDocumento(op: OgMarcas, doc: DocEntrada): boolean {
  const despesa = op.tipo === "despesa";
  const nf = !!op.permite_notas_fiscais;
  const cp = !!op.permite_cp_cr;
  if (doc === "nf_produtos") return op.permite_nf_produtos ?? (nf || (despesa && cp));
  if (doc === "nfs") return op.permite_nfs ?? (despesa && (nf || cp));
  return op.permite_cte ?? (despesa && cp);
}

/** O banco já tem as colunas da Seção 455? (a linha lida traz a chave, mesmo com valor NULL) */
export const bancoTemMarcasPorDocumento = (linhas: object[]): boolean => linhas.some(l => "permite_nfs" in l);

export const ROTULO_DOC: Record<DocEntrada, string> = { nf_produtos: "NF de Produtos", nfs: "NF de Serviços (NFS-e)", cte: "CT-e (Frete)" };
