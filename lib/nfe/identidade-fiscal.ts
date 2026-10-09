export const somenteDigitos = (valor?: string | null) => (valor ?? "").replace(/\D/g, "");

export interface InscricaoFiscal {
  id: string;
  produtor_id: string;
  inscricao_estadual: string;
  fazenda_id?: string | null;
  estado?: string | null;
  municipio_ibge?: string | null;
  municipio?: string | null;
  cep?: string | null;
  logradouro?: string | null;
  numero?: string | null;
  complemento?: string | null;
  bairro?: string | null;
}

export function selecionarInscricaoFiscal<T extends { inscricao_estadual: string; fazenda_id?: string | null }>(
  inscricoes: T[], ie?: string | null, fazendaId?: string,
): T | null {
  if (somenteDigitos(ie)) {
    const exatas = inscricoes.filter(i => somenteDigitos(i.inscricao_estadual) === somenteDigitos(ie));
    if (exatas.length !== 1) throw new Error("A IE informada não identifica um único estabelecimento desse titular. Confira o cadastro antes de emitir.");
    return exatas[0];
  }
  const locais = fazendaId ? inscricoes.filter(i => i.fazenda_id === fazendaId) : [];
  if (locais.length === 1) return locais[0];
  if (inscricoes.length === 1) return inscricoes[0];
  if (inscricoes.length > 1) throw new Error("Há várias inscrições estaduais para esse titular. Selecione a IE da operação antes de emitir.");
  return null;
}

export function aplicarInscricaoFiscal(
  config: Record<string, string>, inscricao: InscricaoFiscal,
  titular: { nome: string; cpf_cnpj: string | null }, configIe?: Record<string, string>,
): Record<string, string> {
  if (somenteDigitos(titular.cpf_cnpj) !== somenteDigitos(config.cpf_cnpj_emitente)) throw new Error("O titular da IE não corresponde ao CPF/CNPJ do emitente.");
  // A configuração por IE fornece parâmetros de emissão, nunca outra identidade/endereço/certificado.
  const resultado = { ...config };
  const protegidos = new Set(["razao_social", "cpf_cnpj_emitente", "ie_emitente", "uf_emitente", "municipio_ibge", "municipio_nome", "cep", "logradouro", "numero", "complemento", "bairro", "cert_a1_path", "cert_a1_senha"]);
  for (const [campo, valor] of Object.entries(configIe ?? {})) if (!protegidos.has(campo)) resultado[campo] = valor;
  // Endereço vem da IE quando ela tem o campo preenchido (o estabelecimento pode ser
  // mesmo um endereço diferente do cadastro base) — mas NUNCA apaga um campo já
  // preenchido em Parâmetros → Fiscal só porque a IE (Cadastros → Produtores) ainda
  // não tem esse campo específico. Achado real 09/10/2026: toda primeira emissão de
  // cliente novo falhava com "Código IBGE do emitente não configurado" mesmo com o
  // município preenchido certinho em Parâmetros → Fiscal — a IE escolhida aqui vinha
  // sem município_ibge próprio (comum: o cadastro de IE raramente repete o endereço
  // completo) e sobrescrevia o valor correto por um vazio, incondicionalmente.
  return {
    ...resultado, razao_social: titular.nome, ie_emitente: inscricao.inscricao_estadual,
    uf_emitente: inscricao.estado || config.uf_emitente || "",
    municipio_ibge: inscricao.municipio_ibge || config.municipio_ibge || "",
    municipio_nome: inscricao.municipio || config.municipio_nome || "",
    cep: inscricao.cep || config.cep || "",
    logradouro: inscricao.logradouro || config.logradouro || "",
    numero: inscricao.numero || config.numero || "",
    complemento: inscricao.complemento || config.complemento || "",
    bairro: inscricao.bairro || config.bairro || "",
  };
}
