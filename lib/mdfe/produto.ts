export const TIPOS_CARGA = [
  ["01", "Granel sólido"], ["02", "Granel líquido"], ["03", "Frigorificada"],
  ["04", "Conteinerizada"], ["05", "Carga geral"], ["06", "Neogranel"],
  ["07", "Perigosa (granel sólido)"], ["08", "Perigosa (granel líquido)"],
  ["09", "Perigosa (frigorificada)"], ["10", "Perigosa (conteinerizada)"],
  ["11", "Perigosa (carga geral)"],
] as const;

export interface ProdutoMDFe {
  descricao: string;
  tipo_carga: string;
  ncm: string;
  cep_carregamento: string;
  cep_descarregamento: string;
}

export function validarProdutoMDFe(produto: ProdutoMDFe | null | undefined, obrigatorio: boolean, documentos: number): string | null {
  if (!produto) return obrigatorio ? "Edite o MDF-e e preencha o produto predominante e o tipo de carga em Dados da Carga." : null;
  if (typeof produto.descricao !== "string" || !produto.descricao.trim() || produto.descricao.trim().length > 120) return "Informe a descrição do produto predominante (até 120 caracteres).";
  if (!TIPOS_CARGA.some(([codigo]) => codigo === produto.tipo_carga)) return "Selecione o tipo de carga do produto predominante.";
  if (produto.ncm && !/^\d{8}$/.test(produto.ncm)) return "O NCM do produto deve ter 8 dígitos.";
  if ((obrigatorio && documentos === 1) || produto.cep_carregamento || produto.cep_descarregamento) {
    if (!/^\d{8}$/.test(produto.cep_carregamento) || !/^\d{8}$/.test(produto.cep_descarregamento)) return "Informe os CEPs reais de carregamento e descarregamento (8 dígitos) em Dados da Carga. Para um único documento vinculado, os locais da carga lotação são obrigatórios.";
  }
  return null;
}
