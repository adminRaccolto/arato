// Consulta NF-e na SEFAZ por chave de acesso usando certificado A1 (mTLS)
import https from "https";
import forge from "node-forge";
import { createClient } from "@supabase/supabase-js";

// ── Endpoints por cUF ──────────────────────────────────────────────────────
// Produção — SVRS atende MT, GO, MS e outros; SP e RS têm próprios
const ENDPOINTS_PROD: Record<string, string> = {
  "35": "https://nfe.fazenda.sp.gov.br/ws/nfeconsultaprotocolo4.asmx",      // SP
  "43": "https://nfe.svrs.rs.gov.br/ws/NfeConsulta/NfeConsulta4.asmx",      // RS
  "31": "https://nfe.fazenda.mg.gov.br/nfe2/services/NFeConsultaProtocolo4", // MG
  "29": "https://nfe.sefaz.ba.gov.br/webservices/NFeConsultaProtocolo4/NFeConsultaProtocolo4.asmx", // BA
  "26": "https://nfe.sefaz.pe.gov.br/nfe-service/services/NFeConsultaProtocolo4", // PE
  // SVRS (demais UFs incluindo MT=51, GO=52, MS=50)
  "_svrs": "https://nfe.svrs.rs.gov.br/ws/NfeConsulta/NfeConsulta4.asmx",
};

function getEndpoint(cuf: string, ambiente: "1" | "2"): string {
  if (ambiente === "2") {
    // Homologação — SVRS atende tudo em hom
    return "https://nfe.svrs.rs.gov.br/ws/NfeConsulta/NfeConsulta4.asmx";
  }
  return ENDPOINTS_PROD[cuf] ?? ENDPOINTS_PROD["_svrs"];
}

// ── SOAP envelope de consulta ──────────────────────────────────────────────
function buildSoapEnvelope(chave: string, cuf: string, ambiente: "1" | "2"): string {
  const tpAmb = ambiente;
  return `<?xml version="1.0" encoding="utf-8"?>
<soap12:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  xmlns:xsd="http://www.w3.org/2001/XMLSchema"
  xmlns:soap12="http://www.w3.org/2003/05/soap-envelope">
  <soap12:Header>
    <nfeCabecMsg xmlns="http://www.portalfiscal.inf.br/nfe/wsdl/NFeConsultaProtocolo4">
      <cUF>${cuf}</cUF>
      <versaoDados>4.00</versaoDados>
    </nfeCabecMsg>
  </soap12:Header>
  <soap12:Body>
    <nfeDadosMsg xmlns="http://www.portalfiscal.inf.br/nfe/wsdl/NFeConsultaProtocolo4">
      <consSitNFe versao="4.00" xmlns="http://www.portalfiscal.inf.br/nfe">
        <tpAmb>${tpAmb}</tpAmb>
        <xServ>CONSULTAR</xServ>
        <chNFe>${chave}</chNFe>
      </consSitNFe>
    </nfeDadosMsg>
  </soap12:Body>
</soap12:Envelope>`;
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
async function carregarCertificados(fazendaId: string): Promise<{ pfxBuffer: Buffer; senha: string }[]> {
  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  let fazendaIdsConta = [fazendaId];
  const { data: fazAtual } = await sb.from("fazendas").select("conta_id").eq("id", fazendaId).maybeSingle();
  if (fazAtual?.conta_id) {
    const { data: fzsConta } = await sb.from("fazendas").select("id").eq("conta_id", fazAtual.conta_id);
    if (fzsConta && fzsConta.length > 0) fazendaIdsConta = fzsConta.map((f: { id: string }) => f.id);
  }

  const { data: configs } = await sb.from("configuracoes_modulo")
    .select("modulo, config")
    .in("fazenda_id", fazendaIdsConta)
    .or("modulo.like.fiscal_pf_%,modulo.like.fiscal_emp_%");

  const pares = (configs ?? [])
    .map(r => r.config as Record<string, string>)
    .filter(c => c.cert_a1_path && c.cert_a1_senha)
    .reduce((acc, c) => { // dedup por path — vários registros (um por fazenda da conta) apontam pro mesmo PFX
      if (!acc.some(p => p.storage_path === c.cert_a1_path)) acc.push({ storage_path: c.cert_a1_path, senha: c.cert_a1_senha });
      return acc;
    }, [] as { storage_path: string; senha: string }[]);

  const resultado: { pfxBuffer: Buffer; senha: string }[] = [];
  for (const par of pares) {
    const { data: blob, error } = await sb.storage.from("certificados").download(par.storage_path);
    if (error || !blob) continue;
    resultado.push({ pfxBuffer: Buffer.from(await blob.arrayBuffer()), senha: par.senha });
  }
  return resultado;
}

// ── Extrair PEM do PFX via node-forge ─────────────────────────────────────
function pfxParaPem(pfxBuffer: Buffer, senha: string): { cert: string; key: string } {
  const bytes = pfxBuffer.toString("binary");
  const der = forge.util.createBuffer(bytes, "raw");
  const asn1 = forge.asn1.fromDer(der);
  const p12 = forge.pkcs12.pkcs12FromAsn1(asn1, false, senha);

  const certBags = p12.getBags({ bagType: forge.pki.oids.certBag })[forge.pki.oids.certBag] ?? [];
  const keyBags = p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag })[forge.pki.oids.pkcs8ShroudedKeyBag] ?? [];

  if (!certBags.length || !keyBags.length) throw new Error("Certificado inválido ou senha incorreta");

  const cert = forge.pki.certificateToPem(certBags[0].cert!);
  const key = forge.pki.privateKeyToPem(keyBags[0].key as forge.pki.rsa.PrivateKey);
  return { cert, key };
}

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
      // ICP-Brasil CAs não estão no bundle padrão do Node.js — comportamento padrão de todas as libs fiscais brasileiras (ACBr, node-nfe, etc.)
      rejectUnauthorized: false,
    };

    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => { data += chunk; });
      res.on("end", () => resolve(data));
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
  const certs = await carregarCertificados(fazendaId);
  if (!certs.length) return { ok: false, erro: "Nenhum certificado A1 com senha cadastrada encontrado nesta conta. Configure em Parâmetros do Sistema → Fiscal." };

  let pem: { cert: string; key: string } | null = null;
  for (const cert of certs) {
    try {
      pem = pfxParaPem(cert.pfxBuffer, cert.senha);
      break;
    } catch { /* tenta o próximo certificado da conta */ }
  }
  if (!pem) return { ok: false, erro: `Nenhum dos ${certs.length} certificado(s) A1 desta conta abriu com a senha cadastrada. Confira em Parâmetros do Sistema → Fiscal.` };

  // Montar e enviar SOAP
  const soap = buildSoapEnvelope(chave, cuf, tpAmb);
  let responseXml: string;
  try {
    responseXml = await soapRequest(endpoint, soap, pem.cert, pem.key);
  } catch (e) {
    return { ok: false, erro: `Erro ao conectar à SEFAZ: ${(e as Error).message}` };
  }

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
