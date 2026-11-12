import { endpoints,ufPorCodigo } from "./nfe/endpoints";
import { interpretarConsultaEvento } from "./fiscal/evento-consulta";
import { candidatosDoEmitente, baixarA1Exato } from "./nfe/certificado-emitente";
import { validarCertificadoA1 } from "./nfe/certificado-a1";
// Consulta NF-e na SEFAZ por chave de acesso usando certificado A1 (mTLS)
import https from "https";
import { CA_FISCAL } from "./fiscal/ca-icp-brasil";
import type { PemPair } from "./nfe/signer";
import { gunzipSync } from "node:zlib";
import { createClient } from "@supabase/supabase-js";

export function getEndpoint(cuf:string,ambiente:"1"|"2"):string {
 return endpoints(ufPorCodigo[cuf] ?? "",ambiente==="1"?"producao":"homologacao").consulta;
}

// ── SOAP envelope de consulta ──────────────────────────────────────────────
// IMPORTANTE: a SEFAZ rejeita a mensagem ("Nao eh permitida a presenca de
// caracteres de edicao no inicio/fim da mensagem ou entre as tags da
// mensagem") se o XML de negócio (consSitNFe em diante) vier com quebra de
// linha/indentação entre as tags — o schema validator trata esses espaços
// como conteúdo inválido. Por isso o envelope é montado já compacto (sem
// indentação), nunca como template literal "bonito" com espaços entre tags.
function buildSoapEnvelope(chave: string, cuf: string, ambiente: "1" | "2"): string {
  const tpAmb = ambiente;
  const xml = `<?xml version="1.0" encoding="utf-8"?><soap12:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soap12="http://www.w3.org/2003/05/soap-envelope"><soap12:Header><nfeCabecMsg xmlns="http://www.portalfiscal.inf.br/nfe/wsdl/NFeConsultaProtocolo4"><cUF>${cuf}</cUF><versaoDados>4.00</versaoDados></nfeCabecMsg></soap12:Header><soap12:Body><nfeDadosMsg xmlns="http://www.portalfiscal.inf.br/nfe/wsdl/NFeConsultaProtocolo4"><consSitNFe versao="4.00" xmlns="http://www.portalfiscal.inf.br/nfe"><tpAmb>${tpAmb}</tpAmb><xServ>CONSULTAR</xServ><chNFe>${chave}</chNFe></consSitNFe></nfeDadosMsg></soap12:Body></soap12:Envelope>`;
  // Defesa extra: remove qualquer espaço/quebra de linha residual entre tags,
  // mesmo que alguém reintroduza indentação aqui no futuro.
  return xml.replace(/>\s+</g, "><");
}

// ── Carregar certificado(s) do Supabase Storage ────────────────────────────
// Achado real 23/09/2026: a versão antiga pegava o storage_path do PRIMEIRO
// "certificado_a1_*" encontrado (chave = produtor_id, um metadado só com nome
// de arquivo — nunca guarda a senha) e a senha do PRIMEIRO "fiscal_pf_*"/
// "fiscal_emp_*" com cert_a1_senha preenchido — dois "primeiros" resolvidos
// de forma INDEPENDENTE. Numa fazenda/conta com mais de um emitente com
// certificado (comum: produtor + transportadora), isso podia combinar o
// certificado do emitente A com a senha do emitente B — cada senha era
// individualmente correta, mas o PAR estava errado, e node-forge reporta
// isso como "senha incorreta" mesmo com a senha realmente certa cadastrada.
// A fonte confiável já existe: fiscal_pf_*/fiscal_emp_* guarda cert_a1_path
// e cert_a1_senha NO MESMO registro (gravados juntos por app/api/cert-upload),
// mesmo padrão usado por buscarConfEmitente (lib/nfe/index.ts) na emissão.
// Sem saber de antemão qual emitente da conta consultar essa chave específica,
// tenta cada par válido da conta até um decodificar com sucesso.
async function carregarCertificados(fazendaId:string,documentoChave?:string,somenteTitular=false):Promise<{pfxBuffer:Buffer;senha:string;documento:string}[]> {
  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const {ids,candidatos}=await candidatosDoEmitente(sb,fazendaId);
  const vistos=new Set<string>();
  const resultado:{pfxBuffer:Buffer;senha:string;documento:string}[]=[];
  const titular=candidatos.filter(c=>c.documento?.padStart(14,"0")===documentoChave);
  const elegiveis=titular.length?[...titular,...candidatos.filter(c=>!c.documento)]:somenteTitular?candidatos.filter(c=>!c.documento):candidatos;
  for(const c of elegiveis) {
    const chave=JSON.stringify([c.caminho,c.senha]);if(vistos.has(chave)) continue;vistos.add(chave);
    try {
      const buffer=await baixarA1Exato(sb,c.caminho,ids);
      const validado=validarCertificadoA1(buffer,c.senha,{documento:c.documento});
      const documento=c.documento || validado.documento;
      if(!documento || (somenteTitular && documento.padStart(14,"0")!==documentoChave))continue;
      resultado.push({pfxBuffer:buffer,senha:c.senha,documento});
      break;
    } catch { /* A consulta pode usar outro titular válido da mesma conta. */ }
  }

  return resultado;
}

// ── Extrair PEM do PFX via node-forge ─────────────────────────────────────
function pfxParaPem(buffer:Buffer,senha:string) {return validarCertificadoA1(buffer,senha).pem;}

// ── Requisição HTTPS com mTLS ──────────────────────────────────────────────
function soapRequest(url: string, body: string, cert: string, key: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const options: https.RequestOptions = {
      hostname: urlObj.hostname,
      port: 443,
      path: urlObj.pathname,
      method: "POST",
      headers: {
        "Content-Type": "application/soap+xml; charset=utf-8",
        "Content-Length": Buffer.byteLength(body, "utf8"),
      },
      cert,
      key,
      ca: CA_FISCAL,
      rejectUnauthorized: true,
      signal: AbortSignal.timeout(15_000),
    };

    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => { data += chunk; });
      res.on("end", () => {
        if(!res.statusCode || res.statusCode<200 || res.statusCode>=300 || !data.trim()) reject(new Error("SEFAZ retornou resposta HTTP inválida: "+res.statusCode));
        else resolve(data);
      });
    });

    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

// ── Parser do retorno XML ──────────────────────────────────────────────────
function parseRetornoConsulta(xml: string): {
  ok: boolean;
  cStat: string;
  xMotivo: string;
  nfeXml?: string;
  protNFe?: string;
  cnpjEmitente?: string;
  dataEmissao?: string;
  valorTotal?: number;
  nomeEmitente?: string;
  chaveAcesso?: string;
  // Emitente — endereço completo
  ieEmitente?: string;
  cnaeEmitente?: string;
  logradouro?: string;
  numero?: string;
  bairro?: string;
  municipio?: string;
  uf?: string;
  cep?: string;
  telefone?: string;
} {
  const tag = (src: string, name: string) => {
    const m = src.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)<\\/${name}>`));
    return m ? m[1].trim() : "";
  };

  const cStat = tag(xml, "cStat");
  const xMotivo = tag(xml, "xMotivo");

  // cStat 100 = autorizada, 101 = cancelada, 110 = uso denegado
  const ok = ["100", "101"].includes(cStat);

  if (!ok) return { ok: false, cStat, xMotivo };

  // Extrair XML da NF-e do retorno (está dentro de nfeProc ou retConsSitNFe)
  const nfeXmlMatch = xml.match(/<NFe[\s\S]*?<\/NFe>/);
  const nfeXml = nfeXmlMatch ? nfeXmlMatch[0] : undefined;
  const protMatch = xml.match(/<protNFe[\s\S]*?<\/protNFe>/);
  const protNFe = protMatch ? protMatch[0] : undefined;

  // Extrair seção <emit> para evitar pegar dados do destinatário
  const emitMatch = xml.match(/<emit>[\s\S]*?<\/emit>/);
  const emitXml = emitMatch ? emitMatch[0] : xml;
  const enderMatch = emitXml.match(/<enderEmit>[\s\S]*?<\/enderEmit>/);
  const enderXml = enderMatch ? enderMatch[0] : "";

  return {
    ok,
    cStat,
    xMotivo,
    nfeXml,
    protNFe,
    cnpjEmitente: tag(emitXml, "CNPJ") || tag(emitXml, "CPF"),
    nomeEmitente: tag(emitXml, "xNome"),
    dataEmissao:  tag(xml, "dhEmi").substring(0, 10),
    valorTotal:   parseFloat(tag(xml, "vNF")) || undefined,
    chaveAcesso:  tag(xml, "chNFe"),
    ieEmitente:   tag(emitXml, "IE"),
    cnaeEmitente: tag(emitXml, "CNAE"),
    logradouro:   tag(enderXml, "xLgr"),
    numero:       tag(enderXml, "nro"),
    bairro:       tag(enderXml, "xBairro"),
    municipio:    tag(enderXml, "xMun"),
    uf:           tag(enderXml, "UF"),
    cep:          tag(enderXml, "CEP"),
    telefone:     tag(enderXml, "fone"),
  };
}

// ── Função principal exportada ─────────────────────────────────────────────
export async function consultarSituacaoNFe(chave:string,pem:PemPair,ambiente:"producao"|"homologacao") {
  if(!/^\d{44}$/.test(chave))throw new Error("Chave NF-e inválida.");
  const tpAmb=ambiente==="producao"?"1":"2";
  const xml=await soapRequest(getEndpoint(chave.slice(0,2),tpAmb),buildSoapEnvelope(chave,chave.slice(0,2),tpAmb),pem.certChain ?? pem.cert,pem.key);
  const r=parseRetornoConsulta(xml);
  return {sucesso:r.cStat==="100",cStat:r.cStat,xMotivo:r.xMotivo,protocolo:r.protNFe?.match(/<nProt>([^<]+)/)?.[1],xmlProt:r.protNFe};
}

export async function consultarEventoNFe(chave:string,pem:PemPair,ambiente:"producao"|"homologacao",acao:"cancelar"|"carta_correcao",sequencia:number){
  if(!/^\d{44}$/.test(chave))throw new Error("Chave NF-e inválida.");
  const tpAmb=ambiente==="producao"?"1":"2";
  const xml=await soapRequest(getEndpoint(chave.slice(0,2),tpAmb),buildSoapEnvelope(chave,chave.slice(0,2),tpAmb),pem.certChain ?? pem.cert,pem.key);
  return interpretarConsultaEvento(xml,chave,acao,sequencia);
}

export async function consultarNfePorChave(
  chaveAcesso: string,
  fazendaId: string,
  ambiente: "producao" | "homologacao" = "producao"
): Promise<{
  ok: boolean;
  erro?: string;
  cStat?: string;
  xMotivo?: string;
  nfeXml?: string;
  protNFe?: string;
  xmlCompleto?: string;
  cnpjEmitente?: string;
  nomeEmitente?: string;
  dataEmissao?: string;
  valorTotal?: number;
  ieEmitente?: string;
  cnaeEmitente?: string;
  logradouro?: string;
  numero?: string;
  bairro?: string;
  municipio?: string;
  uf?: string;
  cep?: string;
  telefone?: string;
}> {
  // Validar chave (44 dígitos)
  const chave = chaveAcesso.replace(/\D/g, "");
  if (chave.length !== 44) return { ok: false, erro: "Chave de acesso inválida (deve ter 44 dígitos)" };

  const cuf = chave.substring(0, 2);
  const tpAmb = ambiente === "producao" ? "1" : "2";
  const endpoint = getEndpoint(cuf, tpAmb);

  // Carrega todos os certificados válidos da conta e tenta cada um — não dá pra saber de
  // antemão qual emitente é o dono da chave sendo consultada (ver comentário em
  // carregarCertificados). Qualquer um decodificando com sucesso já basta pra autenticar
  // a consulta via mTLS junto à SEFAZ.
  const certs = await carregarCertificados(fazendaId,chave.slice(6,20));
  if (!certs.length) return { ok: false, erro: "Nenhum certificado A1 com senha cadastrada encontrado nesta conta. Configure em Parâmetros do Sistema → Fiscal." };

  const soap = buildSoapEnvelope(chave, cuf, tpAmb);
  let responseXml: string | undefined;
  let ultimoErro="Não foi possível autenticar a consulta com os certificados disponíveis.";
  for (const cert of certs) {
    try {
      const pem = pfxParaPem(cert.pfxBuffer, cert.senha);
      responseXml = await soapRequest(endpoint, soap, pem.certChain ?? pem.cert, pem.key);
      break;
    } catch(e) { ultimoErro=(e as Error).message; }
  }
  if(!responseXml) return {ok:false,erro:"Falha na consulta à SEFAZ: "+ultimoErro};

  // Parsear resposta
  const resultado = parseRetornoConsulta(responseXml);
  if (!resultado.ok) {
    return { ok: false, erro: resultado.xMotivo, cStat: resultado.cStat, xMotivo: resultado.xMotivo };
  }

  // Montar nfeProc (XML completo = NFe + protNFe)
  const xmlCompleto = resultado.nfeXml && resultado.protNFe
    ? `<?xml version="1.0" encoding="UTF-8"?><nfeProc versao="4.00" xmlns="http://www.portalfiscal.inf.br/nfe">${resultado.nfeXml}${resultado.protNFe}</nfeProc>`
    : resultado.nfeXml;

  return {
    ok: true,
    cStat: resultado.cStat,
    xMotivo: resultado.xMotivo,
    nfeXml: resultado.nfeXml,
    protNFe: resultado.protNFe,
    xmlCompleto,
    cnpjEmitente: resultado.cnpjEmitente,
    nomeEmitente: resultado.nomeEmitente,
    dataEmissao:  resultado.dataEmissao,
    valorTotal:   resultado.valorTotal,
    ieEmitente:   resultado.ieEmitente,
    cnaeEmitente: resultado.cnaeEmitente,
    logradouro:   resultado.logradouro,
    numero:       resultado.numero,
    bairro:       resultado.bairro,
    municipio:    resultado.municipio,
    uf:           resultado.uf,
    cep:          resultado.cep,
    telefone:     resultado.telefone,
  };
}

// ── Salvar XML no Supabase Storage ─────────────────────────────────────────
export async function salvarXmlStorage(
  fazendaId: string,
  chave: string,
  xmlCompleto: string
): Promise<string | null> {
  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
  const path = `${fazendaId}/nfe_entradas/${chave}.xml`;
  const { error } = await sb.storage
    .from("arquivos")
    .upload(path, Buffer.from(xmlCompleto, "utf-8"), {
      contentType: "application/xml",
      upsert: true,
    });
  return error ? null : path;
}


// ── Baixa o XML completo da NF-e pela Distribuição DF-e (consulta por chave) ──────────────────────
// A Consulta de Situação (acima) devolve só o protocolo — nunca o XML da nota. O XML vem do Ambiente
// Nacional (NFeDistribuicaoDFe), consultando pela chave com o CNPJ/CPF interessado (o próprio emitente da
// chave) e o certificado A1 dele. Se o CNPJ consultante não for interessado, a SEFAZ responde sem documento.
export async function baixarXmlNfePorChaveDFe(
  chaveAcesso: string,
  fazendaId: string,
  ambiente: "producao" | "homologacao" = "producao",
): Promise<{ ok: boolean; xml?: string; cStat?: string; xMotivo?: string; erro?: string }> {
  const chave = chaveAcesso.replace(/\D/g, "");
  if (chave.length !== 44) return { ok: false, erro: "Chave de acesso inválida (deve ter 44 dígitos)" };
  const doc14 = chave.substring(6, 20);

  const tpAmb = ambiente === "producao" ? "1" : "2";
  const url = ambiente === "producao"
    ? "https://www1.nfe.fazenda.gov.br/NFeDistribuicaoDFe/NFeDistribuicaoDFe.asmx"
    : "https://hom1.nfe.fazenda.gov.br/NFeDistribuicaoDFe/NFeDistribuicaoDFe.asmx";
  const certs=await carregarCertificados(fazendaId,doc14,true);
  if (!certs.length) return { ok: false, erro: "Nenhum certificado A1 com senha cadastrada encontrado nesta conta." };
  const documento=certs[0].documento;
  const tagDoc=documento.length===11?`<CPF>${documento}</CPF>`:`<CNPJ>${documento}</CNPJ>`;
  const dados = `<distDFeInt versao="1.01" xmlns="http://www.portalfiscal.inf.br/nfe"><tpAmb>${tpAmb}</tpAmb><cUFAutor>${chave.substring(0, 2)}</cUFAutor>${tagDoc}<consChNFe><chNFe>${chave}</chNFe></consChNFe></distDFeInt>`;
  const envelope = `<?xml version="1.0" encoding="utf-8"?><soap12:Envelope xmlns:soap12="http://www.w3.org/2003/05/soap-envelope"><soap12:Body><nfeDistDFeInteresse xmlns="http://www.portalfiscal.inf.br/nfe/wsdl/NFeDistribuicaoDFe"><nfeDadosMsg>${dados}</nfeDadosMsg></nfeDistDFeInteresse></soap12:Body></soap12:Envelope>`;
  let ultimo: { cStat?: string; xMotivo?: string } = {};
  for (const cert of certs) {
    let pem: { cert: string; key: string; certChain?: string };
    try { pem = pfxParaPem(cert.pfxBuffer, cert.senha); } catch { continue; }
    let resp: string;
    try { resp = await soapRequest(url, envelope, pem.certChain ?? pem.cert, pem.key); } catch (e) { return { ok: false, erro: `Erro ao conectar à Distribuição DF-e: ${(e as Error).message}` }; }
    const tg = (n: string) => resp.match(new RegExp(`<${n}[^>]*>([\\s\\S]*?)<\\/${n}>`))?.[1]?.trim() ?? "";
    ultimo = { cStat: tg("cStat"), xMotivo: tg("xMotivo") };
    const re = /<docZip\s[^>]*>([\s\S]+?)<\/docZip>/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(resp)) !== null) {
      try {
        const xml = gunzipSync(Buffer.from(m[1].trim(), "base64")).toString("utf-8");
        if (xml.includes("<NFe") && xml.includes(chave)) return { ok: true, xml, ...ultimo };
      } catch { /* tenta o próximo documento */ }
    }
  }
  return { ok: false, ...ultimo };
}
