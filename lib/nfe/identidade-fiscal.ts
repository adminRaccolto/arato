export const somenteDigitos = (valor?: string | null) => (valor ?? "").replace(/\D/g, "");

const nomeMunicipio = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
// Sem um dos nomes não há o que comparar: vale como o mesmo município.
export const mesmoMunicipio = (a?: string | null, b?: string | null) => !a || !b || nomeMunicipio(a) === nomeMunicipio(b);

/** Código IBGE do município pelo nome, sem diferenciar acento ou maiúscula. */
export const ibgePeloNome = (lista: { id: number; nome: string }[], nome?: string | null): string => {
  if (!nome) return "";
  const achado = lista.find(m => nomeMunicipio(m.nome) === nomeMunicipio(nome));
  return achado ? String(achado.id) : "";
};

export const ibgeValido = (valor?: string | null) => /^\d{7}$/.test(valor ?? "");

export interface TitularCadastro {
  nome: string;
  cpf_cnpj?: string | null;
  inscricao_est?: string | null;
  logradouro?: string | null;
  numero?: string | null;
  complemento?: string | null;
  bairro?: string | null;
  municipio?: string | null;
  municipio_ibge?: string | null;
  estado?: string | null;
  cep?: string | null;
  telefone?: string | null;
}

/** CPF/CNPJ do titular na chave do módulo fiscal; chaves antigas, sem documento, devolvem null. */
export const documentoDoModulo = (modulo: string): string | null => modulo.match(/^fiscal_(?:pf|emp)_(\d{11}|\d{14})$/)?.[1] ?? null;

/**
 * Identidade do emitente: o cadastro é a origem, e a configuração fiscal só completa o que estiver em branco nele.
 * CPF/CNPJ vazio na configuração não é divergência; só bloqueia quando está preenchido e é de outra pessoa.
 * A IE de produtor é escolhida depois, entre as inscrições dele. Município e IBGE vêm sempre do mesmo lugar.
 */
export function aplicarIdentidadeTitular(config: Record<string, string>, documento: string, titular: TitularCadastro | null): Record<string, string> {
  const preenchido = somenteDigitos(config.cpf_cnpj_emitente);
  if (preenchido && preenchido !== documento) throw new Error("O CPF/CNPJ da configuração fiscal não corresponde ao titular selecionado. Confira Parâmetros → Fiscal.");
  const municipioDoCadastro = !!titular?.municipio_ibge || !config.municipio_ibge;
  const campo = (doCadastro: string | null | undefined, chave: string) => doCadastro || config[chave] || "";
  return {
    ...config,
    cpf_cnpj_emitente: config.cpf_cnpj_emitente || titular?.cpf_cnpj || documento,
    razao_social: campo(titular?.nome, "razao_social"),
    ie_emitente: documento.length === 14 ? campo(titular?.inscricao_est, "ie_emitente") : (config.ie_emitente ?? ""),
    logradouro: campo(titular?.logradouro, "logradouro"),
    numero: campo(titular?.numero, "numero"),
    complemento: campo(titular?.complemento, "complemento"),
    bairro: campo(titular?.bairro, "bairro"),
    municipio_nome: municipioDoCadastro ? campo(titular?.municipio, "municipio_nome") : config.municipio_nome ?? "",
    municipio_ibge: municipioDoCadastro ? campo(titular?.municipio_ibge, "municipio_ibge") : config.municipio_ibge,
    uf_emitente: campo(titular?.estado, "uf_emitente"),
    cep: campo(somenteDigitos(titular?.cep), "cep"),
    fone: campo(titular?.telefone, "fone"),
  };
}

/** Emitente padrão só existe quando é único, na fazenda ou no cliente. Entre titulares diferentes, quem chama precisa escolher. */
export function escolherModuloUnico(linhas: { modulo: string; fazenda_id: string }[], fazendaId: string): string {
  const unico = (l: { modulo: string }[]) => { const m = [...new Set(l.map(x => x.modulo))]; return m.length === 1 ? m[0] : ""; };
  const locais = linhas.filter(l => l.fazenda_id === fazendaId);
  return locais.length ? unico(locais) : unico(linhas);
}

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
