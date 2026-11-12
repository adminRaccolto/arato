import type { NFeInput } from "../nfe/builder";
import { arredondarMoeda } from "../nfe/tributos";

/** O formato do builder difere do formato lido pelo grid/edição de notas_fiscais. */
export function dadosNotaRecuperada(input:Omit<NFeInput,"emitente">) {
  const d=input.destinatario;
  const t=input.transportadora;
  return {
    itens:(input.itens ?? []).map(i=>({item:i.descricao,ncm:i.ncm,cfop:i.cfop,unidade:i.unidade,quantidade:i.quantidade,valor_unitario:i.valor_unitario,
      valor_total:arredondarMoeda(i.quantidade*i.valor_unitario),valor_desconto:i.valor_desconto ?? 0,...(i.cst_icms?{cst:String(i.cst_icms).padStart(3,"0")}:{})})),
    cabecalho:{dest_ie:d?.ie,dest_endereco:d?.logradouro,dest_numero:d?.numero,dest_bairro:d?.bairro,dest_cep:d?.cep,dest_fone:d?.telefone,
      dest_cidade:d?.municipio_nome,dest_municipio_ibge:d?.municipio_ibge,dest_uf:d?.uf,frete_conta:input.frete,
      transportadora:t?.nome,transp_cpf_cnpj:t?.cnpj_cpf,transp_ie:t?.ie,transp_endereco:t?.logradouro,transp_cidade:t?.municipio,placa:t?.placa,uf_placa:t?.uf_placa,
      nf_ref_chave:input.nfe_ref,operacao_fiscal_id:input.operacao_fiscal_id,variaveis_fiscais:input.variaveis_fiscais},
  };
}
