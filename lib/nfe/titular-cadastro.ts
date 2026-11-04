// Identidade do emitente vem do cadastro. Leitura única para NF-e, CT-e e MDF-e.
import type { SupabaseClient } from "@supabase/supabase-js";
import { ibgeDoMunicipio } from "../fiscal/municipios-ibge";
import { aplicarIdentidadeTitular, documentoDoModulo, ibgeValido, somenteDigitos, type TitularCadastro } from "./identidade-fiscal";

function formatarDocumento(digitos: string): string {
  if (digitos.length === 11) return digitos.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, "$1.$2.$3-$4");
  if (digitos.length === 14) return digitos.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5");
  return digitos;
}

// Cadastros com este documento no cliente. O cliente é o filtro: o cadastro pode ter o carimbo de uma fazenda que nem é mais dele.
export async function produtoresDoDocumento<T extends string>(db: SupabaseClient, fazendaIds: string[], documento: string, colunas: T) {
  const { data: fazenda } = await db.from("fazendas").select("conta_id").eq("id", fazendaIds[0]).maybeSingle();
  const { data, error } = await db.from("produtores").select(`${colunas}, conta_id, fazenda_id`)
    .or(`cpf_cnpj.eq.${documento},cpf_cnpj.eq.${formatarDocumento(documento)}`);
  if (error) throw error;
  type Linha = { id: string; nome: string; cpf_cnpj: string | null; conta_id: string | null; fazenda_id: string | null };
  return ((data ?? []) as unknown as Linha[])
    .filter(p => (!!p.conta_id && p.conta_id === fazenda?.conta_id) || (!!p.fazenda_id && fazendaIds.includes(p.fazenda_id)));
}

export async function buscarTitularCadastro(db: SupabaseClient, fazendaIds: string[], documento: string): Promise<TitularCadastro | null> {
  if (documento.length === 14) {
    const { data: empresas, error } = await db.from("empresas")
      .select("razao_social, nome, cpf_cnpj, inscricao_est, logradouro, numero, bairro, municipio, municipio_ibge, estado, cep, telefone")
      .in("fazenda_id", fazendaIds).or(`cpf_cnpj.eq.${documento},cpf_cnpj.eq.${formatarDocumento(documento)}`).limit(1);
    if (error) throw error;
    const emp = empresas?.[0];
    if (emp) return { ...emp, nome: emp.razao_social || emp.nome };
  }
  const produtores = await produtoresDoDocumento(db, fazendaIds, documento, "nome, cpf_cnpj, inscricao_est, logradouro, numero, complemento, bairro, municipio, municipio_ibge, estado, cep, telefone");
  // O mesmo CPF pode ter cadastros como "FULANO" e "FULANO E OUTROS": o nome base é o do titular sozinho
  return ([...produtores].sort((a, b) => (a.nome ?? "").length - (b.nome ?? "").length)[0] as TitularCadastro | undefined) ?? null;
}

// Cadastro com o nome do município e sem o código: o CT-e levava o código vazio e a SEFAZ recusava com a rejeição 215 (04/11/2026).
function completarIbgeDoMunicipio(config: Record<string, string>): Record<string, string> {
  if (ibgeValido(config.municipio_ibge)) return config;
  const ibge = ibgeDoMunicipio(config.uf_emitente, config.municipio_nome);
  return ibge ? { ...config, municipio_ibge: ibge } : config;
}

// Sem documento na chave (configurações antigas), a configuração fica como está.
export async function configComIdentidade(db: SupabaseClient, fazendaIds: string[], modulo: string, config: Record<string, string>): Promise<Record<string, string>> {
  const documento = documentoDoModulo(modulo);
  if (!documento) return config;
  const titular = await buscarTitularCadastro(db, fazendaIds, somenteDigitos(documento));
  return completarIbgeDoMunicipio(aplicarIdentidadeTitular(config, documento, titular));
}
