/**
 * lib/cte/distribuicao.ts
 * NT 2015.002 — CTeDistribuicaoDFe
 * Baixa CT-e de terceiros em que a fazenda é remetente, destinatária, tomadora, etc.
 * Endpoint nacional (não per-UF) com mTLS + certificado A1.
 */

import https from "https";
import { gunzipSync } from "node:zlib";
import type { PemPair } from "../nfe/signer";
import { ICP_BRASIL_CA_BUNDLE } from "./transmitter";

const SOAP_NS     = "http://www.portalfiscal.inf.br/cte/wsdl/CTeDistribuicaoDFe";
const SOAP_ACTION = `${SOAP_NS}/cteDistDFeInteresse`;

export type AmbienteDist = "producao" | "homologacao";

export interface DocRecebido {
  nsu:    string;
  schema: string;
  xml:    string;
}

export interface ResultadoDistribuicao {
  cStat:   string;
  xMotivo: string;
  ultNSU:  string;
  maxNSU:  string;
  docs:    DocRecebido[];
}

// ── Campos extraídos do XML para salvar no banco ──────────────────────────────
export interface CTeRecebidoMeta {
  chave_acesso?:     string;
  numero_cte?:       string;
  serie?:            string;
  data_emissao?:     string;
  emitente_cnpj?:    string;
  emitente_nome?:    string;
  remetente_cnpj?:   string;
  remetente_nome?:   string;
  destinatario_cnpj?:string;
  destinatario_nome?:string;
  municipio_origem?:  string;
  uf_origem?:         string;
  municipio_destino?: string;
  uf_destino?:        string;
  valor_frete?:       number;
  valor_mercadoria?:  number;
  produto_descricao?: string;
}

// ─────────────────────────────────────────────────────────────────────────────

function ep(ambiente: AmbienteDist): string {
  return ambiente === "producao"
    ? "https://www.cte.fazenda.gov.br/CTeDistribuicaoDFe/CTeDistribuicaoDFe.asmx"
    : "https://hom.cte.fazenda.gov.br/CTeDistribuicaoDFe/CTeDistribuicaoDFe.asmx";
}

function buildEnvelope(cnpj: string, cUF: string, tpAmb: string, ultNSU: string): string {
  const nsuPad = ultNSU.padStart(15, "0");
  const dados  = `<distDFeInt versao="1.00" xmlns="http://www.portalfiscal.inf.br/cte"><tpAmb>${tpAmb}</tpAmb><cUFAutor>${cUF}</cUFAutor><CNPJ>${cnpj}</CNPJ><distNSU><ultNSU>${nsuPad}</ultNSU></distNSU></distDFeInt>`;
  return `<?xml version="1.0" encoding="utf-8"?><soap12:Envelope xmlns:soap12="http://www.w3.org/2003/05/soap-envelope"><soap12:Header><cteCabecMsg xmlns="${SOAP_NS}"><cUF>${cUF}</cUF><versaoDados>1.00</versaoDados></cteCabecMsg></soap12:Header><soap12:Body><cteDistDFeInteresse xmlns="${SOAP_NS}"><cteDistDFeInteresseRequest><nfeDadosMsg>${dados}</nfeDadosMsg></cteDistDFeInteresseRequest></cteDistDFeInteresse></soap12:Body></soap12:Envelope>`;
}

function soapPost(url: string, body: string, pem: PemPair): Promise<string> {
  return new Promise((resolve, reject) => {
    const u          = new URL(url);
    const bodyBuffer = Buffer.from(body, "utf8");
    const req = https.request({
      hostname: u.hostname, port: 443,
      path: u.pathname + u.search, method: "POST",
      headers: {
        "Content-Type":   `application/soap+xml; charset=utf-8; action="${SOAP_ACTION}"`,
        "SOAPAction":     `"${SOAP_ACTION}"`,
        "Content-Length": bodyBuffer.length,
      },
      cert: pem.certChain ?? pem.cert,
      key:  pem.key,
      ca:   ICP_BRASIL_CA_BUNDLE,
      rejectUnauthorized: true,
    }, (res) => {
      let data = "";
      res.setEncoding("utf8");
      res.on("data", (c) => { data += c; });
      res.on("end", () => {
        console.log(`[CT-e Dist] ${u.hostname} → HTTP ${res.statusCode}`);
        if (res.statusCode !== 200)
          return reject(new Error(`HTTP ${res.statusCode}: ${data.slice(0, 400)}`));
        resolve(data);
      });
    });
    req.on("error", reject);
    req.end(bodyBuffer);
  });
}

function tagVal(xml: string, tag: string): string {
  const m = xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`));
  return m ? m[1].trim() : "";
}

function parseResponse(soap: string): ResultadoDistribuicao {
  const cStat   = tagVal(soap, "cStat");
  const xMotivo = tagVal(soap, "xMotivo");
  const ultNSU  = tagVal(soap, "ultNSU");
  const maxNSU  = tagVal(soap, "maxNSU");

  const docs: DocRecebido[] = [];
  const re = /<docZip\s([^>]+)>([\s\S]+?)<\/docZip>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(soap)) !== null) {
    const attrs   = m[1];
    const b64     = m[2].trim();
    const nsuM    = attrs.match(/NSU="([^"]+)"/);
    const schemM  = attrs.match(/schema="([^"]+)"/);
    const nsu     = nsuM    ? nsuM[1]   : "";
    const schema  = schemM  ? schemM[1] : "";
    try {
      const xml = gunzipSync(Buffer.from(b64, "base64")).toString("utf-8");
      docs.push({ nsu, schema, xml });
    } catch {
      console.warn(`[CT-e Dist] Falha ao descomprimir NSU ${nsu}`);
    }
  }

  return { cStat, xMotivo, ultNSU, maxNSU, docs };
}

// ── Extrai metadados do XML para persistência ─────────────────────────────────
export function extrairMetaCTe(xml: string): CTeRecebidoMeta {
  const tv = (tag: string) => tagVal(xml, tag);

  // chave de acesso: atributo Id do elemento Signature ou campo chCTe
  const chM = xml.match(/chCTe="([^"]+)"|Id="CTe([0-9]{44})"/);
  const chave_acesso = chM ? (chM[1] ?? chM[2] ?? "") : "";

  const valor_frete     = parseFloat(tv("vTPrest")) || undefined;
  const valor_mercadoria = parseFloat(tv("vMerc"))  || undefined;

  return {
    chave_acesso:      chave_acesso || undefined,
    numero_cte:        tv("nCT")    || undefined,
    serie:             tv("serie")  || undefined,
    data_emissao:      tv("dhEmi").slice(0, 10) || undefined,
    emitente_cnpj:     tagVal(xml.match(/<emit>([\s\S]*?)<\/emit>/)?.[1] ?? "", "CNPJ") || undefined,
    emitente_nome:     tagVal(xml.match(/<emit>([\s\S]*?)<\/emit>/)?.[1] ?? "", "xNome") || undefined,
    remetente_cnpj:    tagVal(xml.match(/<rem>([\s\S]*?)<\/rem>/)?.[1]  ?? "", "CNPJ") || undefined,
    remetente_nome:    tagVal(xml.match(/<rem>([\s\S]*?)<\/rem>/)?.[1]  ?? "", "xNome") || undefined,
    destinatario_cnpj: tagVal(xml.match(/<dest>([\s\S]*?)<\/dest>/)?.[1] ?? "", "CNPJ") || undefined,
    destinatario_nome: tagVal(xml.match(/<dest>([\s\S]*?)<\/dest>/)?.[1] ?? "", "xNome") || undefined,
    municipio_origem:  tagVal(xml.match(/<infMunIni>([\s\S]*?)<\/infMunIni>/)?.[1] ?? "", "xMun") || undefined,
    uf_origem:         tagVal(xml.match(/<infMunIni>([\s\S]*?)<\/infMunIni>/)?.[1] ?? "", "UF")   || undefined,
    municipio_destino: tagVal(xml.match(/<infMunFim>([\s\S]*?)<\/infMunFim>/)?.[1] ?? "", "xMun") || undefined,
    uf_destino:        tagVal(xml.match(/<infMunFim>([\s\S]*?)<\/infMunFim>/)?.[1] ?? "", "UF")   || undefined,
    valor_frete,
    valor_mercadoria,
    produto_descricao: tv("xProd") || undefined,
  };
}

// ── Ponto de entrada principal ─────────────────────────────────────────────────
export async function consultarDFeInteresse(opts: {
  cnpj:    string;
  cUF:     string;
  ambiente: AmbienteDist;
  ultNSU:  string;
  pem:     PemPair;
}): Promise<ResultadoDistribuicao> {
  const tpAmb  = opts.ambiente === "producao" ? "1" : "2";
  const body   = buildEnvelope(opts.cnpj, opts.cUF, tpAmb, opts.ultNSU);
  console.log(`[CT-e Dist] distNSU > ${opts.ultNSU} (${opts.ambiente}, CNPJ ${opts.cnpj})`);
  const soap   = await soapPost(ep(opts.ambiente), body, opts.pem);
  return parseResponse(soap);
}
