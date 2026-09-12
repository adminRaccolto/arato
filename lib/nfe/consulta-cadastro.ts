/**
 * lib/nfe/consulta-cadastro.ts
 * Consulta de Cadastro de Contribuintes (webservice CadConsultaCadastro4 — o
 * "Sintegra" da NF-e). Dado um CNPJ/CPF/IE, devolve nome, endereço e situação
 * cadastral direto da base da SEFAZ. Reaproveita o mesmo certificado A1 e o
 * mesmo transporte mTLS já usados na emissão de NF-e (lib/nfe/transmitter.ts).
 *
 * Escopo atual: MT, GO, MS, SP, BA e TO. Demais UFs, sob demanda — adicionar
 * é só incluir uma entrada em UF_CAD_ENDPOINTS (envelope, parsing e
 * certificado já são genéricos por UF, não mudam).
 * Fontes dos endpoints: MT/GO/MS/SP/BA — próprios de cada SEFAZ, confirmados
 * via tabela de webservices do sped-nfe (nfephp-org), mesmo padrão já usado
 * em transmitter.ts para NFeAutorizacao4. TO não tem autorizador próprio —
 * usa SVRS (Sefaz Virtual RS) como processador, inclusive para consulta de
 * cadastro: https://cad.svrs.rs.gov.br/ws/cadconsultacadastro/cadconsultacadastro4.asmx
 *
 * Diferente da emissão de NF-e, não existe noção de homologação aqui: é uma
 * consulta a um cadastro real, não a emissão de um documento — por isso
 * sempre usa o endpoint de produção, mesmo que o emitente esteja configurado
 * em ambiente de homologação para emissão.
 */

import { soapPost, CUF_MAP } from "./transmitter";
import type { PemPair } from "./signer";

interface UFCadEndpoint { prod: string }

const UF_CAD_ENDPOINTS: Record<string, UFCadEndpoint> = {
  MT: { prod: "https://nfe.sefaz.mt.gov.br/nfews/v2/services/CadConsultaCadastro4" },
  GO: { prod: "https://nfe.sefaz.go.gov.br/nfe/services/CadConsultaCadastro4" },
  MS: { prod: "https://nfe.sefaz.ms.gov.br/ws/CadConsultaCadastro4" },
  SP: { prod: "https://nfe.fazenda.sp.gov.br/ws/cadconsultacadastro4.asmx" },
  BA: { prod: "https://nfe.sefaz.ba.gov.br/webservices/CadConsultaCadastro4/CadConsultaCadastro4.asmx" },
  // TO não tem autorizador próprio — usa SVRS como processador (mesmo pra consulta de cadastro)
  TO: { prod: "https://cad.svrs.rs.gov.br/ws/cadconsultacadastro/cadconsultacadastro4.asmx" },
};

function tagVal(xml: string, tag: string): string {
  const m = xml.match(new RegExp(`<(?:[^:>]+:)?${tag}[^>]*>([^<]*)<\\/(?:[^:>]+:)?${tag}>`));
  return m ? m[1] : "";
}

function blocoTag(xml: string, tag: string): string {
  const re = new RegExp(`<(?:[^:>]+:)?${tag}\\b[^>]*>[\\s\\S]*?<\\/(?:[^:>]+:)?${tag}>`);
  return xml.match(re)?.[0] ?? "";
}

function envelopeConsCad(cuf: string, uf: string, ie?: string, cnpj?: string, cpf?: string): string {
  // Prioridade CNPJ → IE → CPF (mesma ordem exigida pelo próprio webservice)
  const ident = cnpj ? `<CNPJ>${cnpj}</CNPJ>` : ie ? `<IE>${ie}</IE>` : cpf ? `<CPF>${cpf}</CPF>` : "";
  return (
    `<?xml version="1.0" encoding="utf-8"?>` +
    `<soap12:Envelope xmlns:soap12="http://www.w3.org/2003/05/soap-envelope">` +
    `<soap12:Header>` +
      `<nfeCabecMsg xmlns="http://www.portalfiscal.inf.br/nfe/wsdl/CadConsultaCadastro2">` +
        `<cUF>${cuf}</cUF><versaoDados>2.00</versaoDados>` +
      `</nfeCabecMsg>` +
    `</soap12:Header>` +
    `<soap12:Body>` +
      `<nfeDadosMsg xmlns="http://www.portalfiscal.inf.br/nfe/wsdl/CadConsultaCadastro2">` +
        `<ConsCad versao="2.00" xmlns="http://www.portalfiscal.inf.br/nfe">` +
          `<infCons><xServ>CONS-CAD</xServ><UF>${uf}</UF>${ident}</infCons>` +
        `</ConsCad>` +
      `</nfeDadosMsg>` +
    `</soap12:Body>` +
    `</soap12:Envelope>`
  );
}

export interface CadastroConsultado {
  cStat: string;
  xMotivo: string;
  encontrados: number;
  ie?: string;
  cnpj?: string;
  cpf?: string;
  uf?: string;
  situacao?: "habilitada" | "desabilitada";
  nome?: string;
  logradouro?: string;
  numero?: string;
  complemento?: string;
  bairro?: string;
  municipio?: string;
  municipio_ibge?: string;
  cep?: string;
}

function parseConsCad(soapResp: string): CadastroConsultado {
  const fault = blocoTag(soapResp, "Fault");
  if (fault) {
    const motivo = tagVal(fault, "faultstring") || tagVal(fault, "Text") || "SOAP Fault sem descrição";
    return { cStat: "999", xMotivo: `Falha na comunicação com a SEFAZ: ${motivo}`, encontrados: 0 };
  }

  const cStat   = tagVal(soapResp, "cStat");
  const xMotivo = tagVal(soapResp, "xMotivo");
  const infCadBlocks = soapResp.match(/<infCad\b[\s\S]*?<\/infCad>/g) ?? [];

  if (!infCadBlocks.length) {
    return { cStat: cStat || "999", xMotivo: xMotivo || "SEFAZ não retornou dados cadastrais para essa consulta", encontrados: 0 };
  }

  // cStat 112 = múltiplos contribuintes encontrados — usa o primeiro, mas avisa a quantidade
  const first = infCadBlocks[0] ?? "";
  const ender = blocoTag(first, "ender");
  const cSit  = tagVal(first, "cSit");

  return {
    cStat:      cStat || "111",
    xMotivo:    xMotivo || "Consulta realizada com sucesso",
    encontrados: infCadBlocks.length,
    ie:             tagVal(first, "IE")  || undefined,
    cnpj:           tagVal(first, "CNPJ") || undefined,
    cpf:            tagVal(first, "CPF")  || undefined,
    uf:             tagVal(first, "UF")   || undefined,
    situacao:       cSit === "1" ? "habilitada" : cSit === "0" ? "desabilitada" : undefined,
    nome:           tagVal(first, "xNome") || undefined,
    logradouro:     tagVal(ender, "xLgr")    || undefined,
    numero:         tagVal(ender, "nro")     || undefined,
    complemento:    tagVal(ender, "xCpl")    || undefined,
    bairro:         tagVal(ender, "xBairro") || undefined,
    municipio:      tagVal(ender, "xMun")    || undefined,
    municipio_ibge: tagVal(ender, "cMun")    || undefined,
    cep:            tagVal(ender, "CEP")     || undefined,
  };
}

export async function consultarCadastroContribuinte(
  uf: string,
  pem: PemPair,
  opts: { ie?: string; cnpj?: string; cpf?: string },
): Promise<CadastroConsultado> {
  const ufUpper = uf.toUpperCase();
  const ep = UF_CAD_ENDPOINTS[ufUpper];
  if (!ep) {
    return {
      cStat: "CFG",
      xMotivo: `Consulta de Cadastro (Sintegra) ainda não implementada para a UF ${ufUpper}. Suporte atual: MT, GO, MS, SP, BA, TO.`,
      encontrados: 0,
    };
  }
  const cuf = CUF_MAP[ufUpper] ?? "51";
  const body = envelopeConsCad(
    cuf,
    ufUpper,
    opts.ie?.replace(/\D/g, "") || undefined,
    opts.cnpj?.replace(/\D/g, "") || undefined,
    opts.cpf?.replace(/\D/g, "") || undefined,
  );
  const resp = await soapPost(ep.prod, body, pem);
  return parseConsCad(resp);
}
