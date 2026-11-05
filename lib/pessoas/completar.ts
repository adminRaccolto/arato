/**
 * Regras de completar o cadastro de pessoas em lote. Só preenche o que está vazio: o que alguém digitou nunca é trocado.
 * A exceção é a situação cadastral, que é um dado da Receita e não do usuário.
 */

export type PessoaCompletar = {
  id: string; nome?: string | null; cpf_cnpj?: string | null; cep?: string | null; municipio?: string | null; estado?: string | null;
  municipio_ibge?: string | null; logradouro?: string | null; numero?: string | null; complemento?: string | null; bairro?: string | null;
  email?: string | null; telefone?: string | null; inscricao_est?: string | null; inscricao_mun?: string | null;
  cnae?: string | null; regime_tributario?: string | null; situacao_cadastral?: string | null;
};

export const digitos = (s?: string | null) => (s ?? "").replace(/\D/g, "");
const vazio = (s?: string | null) => !(s ?? "").trim();

export function mesmoMunicipio(a?: string | null, b?: string | null): boolean {
  const n = (s?: string | null) => (s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
  return n(a) === n(b);
}

export type RespostaCep = { ibge?: string; localidade?: string; uf?: string; bairro?: string };

/** IBGE vindo do CEP. Se a pessoa já tem outra cidade digitada, não grava: é divergência para alguém conferir. */
export function camposPeloCep(p: PessoaCompletar, cep: RespostaCep): { campos: Partial<PessoaCompletar> } | { divergente: string } | null {
  if (!cep.ibge) return null;
  if (!vazio(p.municipio) && !mesmoMunicipio(p.municipio, cep.localidade)) {
    return { divergente: `CEP é de ${cep.localidade}, cadastro diz ${p.municipio}` };
  }
  const campos: Partial<PessoaCompletar> = { municipio_ibge: String(cep.ibge) };
  if (vazio(p.municipio) && cep.localidade) { campos.municipio = cep.localidade; if (cep.uf) campos.estado = cep.uf; }
  else if (vazio(p.estado) && cep.uf) campos.estado = cep.uf;
  if (vazio(p.bairro) && !vazio(cep.bairro)) campos.bairro = cep.bairro;
  return { campos };
}

const formatarCep = (d: string) => (d.length === 8 ? `${d.slice(0, 5)}-${d.slice(5)}` : d);

function formatarTelefone(t: string): string {
  const d = digitos(t);
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return t;
}

const texto = (v: unknown) => (typeof v === "string" ? v.trim() : "");

/**
 * Campos que a consulta do CNPJ preenche. O endereço entra como um bloco: só se a pessoa não tem rua e não tem outro CEP
 * ou outra cidade, para não misturar o endereço digitado com o da Receita.
 */
export function camposDaReceita(p: PessoaCompletar, d: Record<string, unknown>, ibgeDaReceita?: string | null): Partial<PessoaCompletar> {
  const c: Partial<PessoaCompletar> = {};
  const cepReceita = digitos(texto(d.cep));
  const municipio = texto(d.municipio);
  const semRua = vazio(p.logradouro);
  const cepCompativel = vazio(p.cep) || digitos(p.cep) === cepReceita;
  const cidadeCompativel = vazio(p.municipio) || mesmoMunicipio(p.municipio, municipio);

  if (vazio(p.nome) && texto(d.razao_social)) c.nome = texto(d.razao_social);
  if (semRua && cepCompativel && cidadeCompativel && texto(d.logradouro)) {
    c.logradouro = texto(d.logradouro);
    if (vazio(p.numero) && texto(d.numero)) c.numero = texto(d.numero);
    if (vazio(p.complemento) && texto(d.complemento)) c.complemento = texto(d.complemento);
    if (vazio(p.bairro) && texto(d.bairro)) c.bairro = texto(d.bairro);
    if (vazio(p.cep) && cepReceita.length === 8) c.cep = formatarCep(cepReceita);
  }
  if (cepCompativel && cidadeCompativel) {
    if (vazio(p.municipio) && municipio) {
      c.municipio = municipio;
      // Com a cidade vazia, o estado do cadastro costuma ser só o padrão da tela: vale o da Receita
      if (texto(d.uf)) c.estado = texto(d.uf);
    } else if (vazio(p.estado) && texto(d.uf)) c.estado = texto(d.uf);
    if (vazio(p.municipio_ibge) && ibgeDaReceita) c.municipio_ibge = ibgeDaReceita;
  }
  if (vazio(p.email) && texto(d.email)) c.email = texto(d.email).toLowerCase();
  if (vazio(p.telefone) && texto(d.ddd_telefone_1)) c.telefone = formatarTelefone(texto(d.ddd_telefone_1));
  const inscricoes = d.inscricoes_estaduais as { numero?: string }[] | undefined;
  const ie = texto(d.inscricao_estadual) || (Array.isArray(inscricoes) ? texto(inscricoes[0]?.numero) : "");
  if (vazio(p.inscricao_est) && ie) c.inscricao_est = ie;
  if (vazio(p.inscricao_mun) && (texto(d.inscricao_municipal) || texto(d.im))) c.inscricao_mun = texto(d.inscricao_municipal) || texto(d.im);
  if (vazio(p.cnae) && texto(d.cnae_fiscal_descricao)) c.cnae = texto(d.cnae_fiscal_descricao);
  if (vazio(p.regime_tributario) && texto(d.descricao_porte)) c.regime_tributario = texto(d.descricao_porte);
  if (texto(d.descricao_situacao_cadastral) && d.descricao_situacao_cadastral !== p.situacao_cadastral) c.situacao_cadastral = texto(d.descricao_situacao_cadastral);
  return c;
}

export function situacaoInativa(s?: string | null): boolean {
  const v = (s ?? "").trim().toUpperCase();
  return !!v && v !== "ATIVA";
}
