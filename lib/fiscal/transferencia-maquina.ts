// Regras da NF-e de transferência de máquina entre fazendas do mesmo cliente.
type ProdutorDest = {
  nome: string; cpf_cnpj?: string | null; logradouro?: string | null; numero?: string | null; bairro?: string | null;
  municipio?: string | null; municipio_ibge?: string | null; estado?: string | null; cep?: string | null;
};
type InscricaoDest = {
  inscricao_estadual: string; logradouro?: string | null; numero?: string | null; bairro?: string | null;
  municipio?: string | null; municipio_ibge?: string | null; estado?: string | null; cep?: string | null;
};

const digitos = (v?: string | null) => (v ?? "").replace(/\D/g, "");

// CFOP de saída 5xxx (dentro do estado) vira 6xxx quando o destino fica em outro estado.
export function cfopPorDestino(cfop: string, ufEmitente?: string | null, ufDestino?: string | null): string {
  const emit = (ufEmitente ?? "").trim().toUpperCase();
  const dest = (ufDestino ?? "").trim().toUpperCase();
  return cfop.startsWith("5") && emit && dest && emit !== dest ? `6${cfop.slice(1)}` : cfop;
}

// O endereço da IE é o do estabelecimento de destino; o do produtor só preenche o que a IE não tiver.
// O município e o IBGE vêm sempre do mesmo cadastro, para o nome não divergir do código na nota.
export function destinatarioDaInscricao(produtor: ProdutorDest, ie: InscricaoDest) {
  const municipioDaIe = !!(ie.municipio_ibge || ie.municipio);
  return {
    nome: produtor.nome,
    cpf_cnpj: produtor.cpf_cnpj ?? undefined,
    ie: digitos(ie.inscricao_estadual),
    logradouro: ie.logradouro || produtor.logradouro || undefined,
    numero: ie.logradouro ? ie.numero || undefined : produtor.numero || undefined,
    bairro: ie.logradouro ? ie.bairro || undefined : produtor.bairro || undefined,
    municipio: (municipioDaIe ? ie.municipio : produtor.municipio) || undefined,
    municipio_ibge: (municipioDaIe ? ie.municipio_ibge : produtor.municipio_ibge) || undefined,
    estado: ie.estado || produtor.estado || undefined,
    cep: ie.cep || produtor.cep || undefined,
  };
}

// Mesma IE na origem e no destino é o mesmo estabelecimento: não há transferência.
export function mesmoEstabelecimento(ieEmitente?: string | null, ieDestino?: string | null): boolean {
  const a = digitos(ieEmitente);
  return !!a && a === digitos(ieDestino);
}
