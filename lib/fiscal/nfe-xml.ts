// Leitura de XML de NF-e e tabelas de CFOP de remessa/retorno — usadas por Entrada de Nota Própria, Remessas e Retornos.

// Remessa emitida fora do Arato ligada a uma NF de entrada processada: entra no mesmo controle de remessas logísticas da
// remessa emitida pelo Arato (botão Emitir NF Remessa da NF de entrada). CFOP de retorno pelo CFOP da remessa.
export const CFOP_RETORNO: Record<string, string> = { "5905": "5906", "6905": "6906", "5901": "5902", "6901": "6902", "5915": "5916", "6915": "6916", "5934": "5906", "6934": "6906", "5949": "5949", "6949": "6949" };
export const ehCfopRemessa = (c: string) => c in CFOP_RETORNO;

// Leitura completa do XML da NF-e (cabeçalho, emitente, destinatário, itens, protocolo). Antes só lia número, série,
// data, natureza e valor — emitente, destinatário e itens ficavam em branco.
export function lerXmlNfe(xml: string) {
  const tag = (src: string, t: string) => src.match(new RegExp(`<${t}>([^<]*)</${t}>`))?.[1] ?? "";
  const bloco = (src: string, t: string) => src.match(new RegExp(`<${t}[ >][\\s\\S]*?</${t}>`))?.[0] ?? "";
  const ide = bloco(xml, "ide"), emit = bloco(xml, "emit"), ender = bloco(emit, "enderEmit"), dest = bloco(xml, "dest"), enderDest = bloco(dest, "enderDest");
  const dets = xml.match(/<det [\s\S]*?<\/det>/g) ?? [];
  return {
    numero: tag(ide, "nNF"), serie: tag(ide, "serie"), chave: xml.match(/Id=["']NFe(\d{44})["']/)?.[1] ?? "",
    data_emissao: (tag(ide, "dhEmi") || tag(ide, "dEmi")).slice(0, 10), natureza: tag(ide, "natOp"),
    valor_total: Number(tag(xml, "vNF") || 0),
    cnpj_emitente: tag(emit, "CNPJ") || tag(emit, "CPF"), nome_emitente: tag(emit, "xNome"),
    cnpj_destinatario: tag(dest, "CNPJ") || tag(dest, "CPF"), nome_destinatario: tag(dest, "xNome"), dest_uf: tag(enderDest, "UF"),
    protocolo: tag(xml, "nProt"), tpNF: tag(ide, "tpNF"),
    emit_dados: { emit_razao: tag(emit, "xNome"), emit_cnpj: tag(emit, "CNPJ") || tag(emit, "CPF"), emit_ie: tag(emit, "IE"),
      emit_endereco: tag(ender, "xLgr"), emit_numero: tag(ender, "nro"), emit_bairro: tag(ender, "xBairro"), emit_municipio: tag(ender, "xMun"),
      emit_uf: tag(ender, "UF"), emit_cep: tag(ender, "CEP"), emit_fone: tag(ender, "fone") },
    dest_dados: { dest_ie: tag(dest, "IE"), dest_uf: tag(enderDest, "UF"), dest_cidade: tag(enderDest, "xMun"), dest_endereco: tag(enderDest, "xLgr"), dest_numero: tag(enderDest, "nro") },
    itens: dets.map(d => { const pr = bloco(d, "prod"); return {
      descricao: tag(pr, "xProd"), unidade: tag(pr, "uCom") || "un", quantidade: Number(tag(pr, "qCom") || 0),
      valor_unitario: Number(tag(pr, "vUnCom") || 0), valor_total: Number(tag(pr, "vProd") || 0), ncm: tag(pr, "NCM"), cfop: tag(pr, "CFOP"),
    }; }),
  };
}
