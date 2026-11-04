// Duplicar NF de venda: a cópia nasce como rascunho (nada vai à SEFAZ) e leva só o que serve para um novo faturamento.
// Lista fechada de propósito: chave, protocolo, romaneio e NF referenciada são da nota original e nunca passam para a cópia.
type NotaOrigem = {
  fazenda_id: string; tipo?: string | null; status: string; numero: string; serie?: string | null; cfop?: string | null; natureza?: string | null;
  destinatario?: string | null; cnpj_destinatario?: string | null; valor_total: number; observacao?: string | null;
  itens_json?: unknown; dados_nf_json?: unknown; id: string;
};

const CAMPOS_COPIADOS = [
  "modulo_key", "produtor_id", "ie_id", "emit_cnpj", "emit_ie",
  "dest_tipo_pessoa", "dest_ie", "dest_endereco", "dest_numero", "dest_bairro", "dest_cep", "dest_fone", "dest_cidade", "dest_uf", "dest_municipio_ibge",
  "frete_conta", "transportadora", "transp_cpf_cnpj", "transp_ie", "transp_endereco", "transp_numero", "transp_cidade", "placa", "uf_placa",
  "peso_bruto", "peso_liquido", "especie", "local_entrega", "contrato_numero", "contrato_id", "recebimento_por_carga",
];

export const ehRascunho = (n: { status: string; dados_nf_json?: unknown }) =>
  n.status === "em_digitacao" && (n.dados_nf_json as { rascunho?: boolean } | null | undefined)?.rascunho === true;

// NF que referencia outra (retorno, complementar, devolução, remessa de venda à ordem) depende da nota de origem: não se duplica.
export function podeDuplicarNota(n: NotaOrigem): boolean {
  const dj = (n.dados_nf_json ?? {}) as Record<string, unknown>;
  return n.tipo === "saida" && ["autorizada", "cancelada", "rejeitada", "denegada"].includes(n.status)
    && !dj.nf_ref_chave && !/devolu/i.test(n.natureza ?? "");
}

export function montarRascunhoDuplicado(n: NotaOrigem, numeracao: { numero: string; serie?: string | null }, hoje: string) {
  const dj = (n.dados_nf_json ?? {}) as Record<string, unknown>;
  const copia: Record<string, unknown> = {};
  for (const k of CAMPOS_COPIADOS) if (dj[k] !== undefined && dj[k] !== null && dj[k] !== "") copia[k] = dj[k];
  return {
    fazenda_id: n.fazenda_id, tipo: "saida" as const, status: "em_digitacao" as const,
    numero: numeracao.numero, serie: numeracao.serie ?? n.serie ?? "1",
    data_emissao: hoje, destinatario: n.destinatario ?? "", cnpj_destinatario: n.cnpj_destinatario ?? undefined,
    cfop: n.cfop ?? "", natureza: n.natureza ?? "", valor_total: n.valor_total, observacao: n.observacao ?? undefined, auto: false,
    itens_json: n.itens_json, dados_nf_json: { ...copia, rascunho: true, duplicada_de: n.id, duplicada_de_numero: n.numero },
  };
}
