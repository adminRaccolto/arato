import type { DestinatarioCfg } from "./builder";

export interface ProdutorDestino {
  id: string;
  nome: string;
  cpf_cnpj: string | null;
}

export interface IeDestino {
  produtor_id: string;
  inscricao_estadual: string;
  estado?: string | null;
  cep?: string | null;
  logradouro?: string | null;
  numero?: string | null;
  bairro?: string | null;
  municipio?: string | null;
  municipio_ibge?: string | null;
}

const digitos = (valor?: string | null) => (valor ?? "").replace(/\D/g, "");

// Nome e endereço só podem vir do titular e do estabelecimento escolhidos.
export function montarDestinatarioTransferencia(
  cpfCnpj: string | undefined,
  ie: string | undefined,
  config: Record<string, string> | null,
  produtores: ProdutorDestino[],
  inscricoes: IeDestino[],
): DestinatarioCfg {
  const documento = digitos(cpfCnpj);
  if (![11, 14].includes(documento.length)) throw new Error("Informe o CPF/CNPJ válido do destinatário da transferência.");
  const candidatos = produtores.filter(p => digitos(p.cpf_cnpj) === documento);
  const endereco = inscricoes.find(i => candidatos.some(p => p.id === i.produtor_id) && digitos(i.inscricao_estadual) === digitos(ie) && !!digitos(ie));
  const titular = endereco ? candidatos.find(p => p.id === endereco.produtor_id) : candidatos.length === 1 ? candidatos[0] : undefined;
  const configTitular = digitos(config?.cpf_cnpj_emitente) === documento ? config : null;
  const nome = titular?.nome?.trim() || configTitular?.razao_social?.trim();
  if (!nome) throw new Error("Não foi possível identificar o nome do titular do CPF/CNPJ de destino. Confira o cadastro do produtor e a configuração fiscal antes de emitir.");
  const configEndereco = configTitular && (!digitos(ie) || digitos(configTitular.ie_emitente) === digitos(ie)) ? configTitular : null;
  if (!endereco && !configEndereco) throw new Error("A IE de destino não foi encontrada para o CPF/CNPJ informado. Confira o cadastro da inscrição estadual antes de emitir.");
  return {
    nome, cpf_cnpj: documento, ie,
    logradouro: endereco ? endereco.logradouro ?? undefined : configEndereco?.logradouro,
    numero: endereco ? endereco.numero ?? undefined : configEndereco?.numero,
    bairro: endereco ? endereco.bairro ?? undefined : configEndereco?.bairro,
    municipio_ibge: endereco ? endereco.municipio_ibge ?? undefined : configEndereco?.municipio_ibge,
    municipio_nome: endereco ? endereco.municipio ?? undefined : configEndereco?.municipio_nome,
    uf: endereco ? endereco.estado ?? undefined : configEndereco?.uf_emitente,
    cep: endereco ? endereco.cep ?? undefined : configEndereco?.cep,
  };
}
