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

// ── Carregar certificado do Supabase Storage ───────────────────────────────
async function carregarCertificado(fazendaId: string): Promise<{ pfxBuffer: Buffer; senha: string } | null> {
  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // Buscar config do certificado
  const { data: configs } = await sb.from("configuracoes_modulo")
    .select("modulo, config")
    .eq("fazenda_id", fazendaId)
    .like("modulo", "certificado_a1%");

  if (!configs?.length) return null;

  // Pegar primeiro certificado válido
  const certConfig = configs[0].config as Record<string, string>;
  const storagePath = certConfig.storage_path;
  const senha = certConfig.cert_senha ?? "";

  if (!storagePath || !senha) return null;

  // Baixar PFX do Storage
  const { data: blob, error } = await sb.storage
    .from("certificados")
    .download(storagePath);

  if (error || !blob) return null;

  const pfxBuffer = Buffer.from(await blob.arrayBuffer());
  return { pfxBuffer, senha };
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
      rejectUnauthorized: true,
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
} {
  const tag = (name: string) => {
    const m = xml.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)<\\/${name}>`));
    return m ? m[1].trim() : "";
  };

  const cStat = tag("cStat");
  const xMotivo = tag("xMotivo");

  // cStat 100 = autorizada, 101 = cancelada, 110 = uso denegado
  const ok = ["100", "101"].includes(cStat);

  if (!ok) return { ok: false, cStat, xMotivo };

  // Extrair XML da NF-e do retorno (está dentro de nfeProc ou retConsSitNFe)
  const nfeXmlMatch = xml.match(/<NFe[\s\S]*?<\/NFe>/);
  const nfeXml = nfeXmlMatch ? nfeXmlMatch[0] : undefined;
  const protMatch = xml.match(/<protNFe[\s\S]*?<\/protNFe>/);
  const protNFe = protMatch ? protMatch[0] : undefined;

  return {
    ok,
    cStat,
    xMotivo,
    nfeXml,
    protNFe,
    cnpjEmitente: tag("CNPJ") || tag("CPF"),
    nomeEmitente: tag("xNome"),
    dataEmissao:  tag("dhEmi").substring(0, 10),
    valorTotal:   parseFloat(tag("vNF")) || undefined,
    chaveAcesso:  tag("chNFe"),
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
}> {
  // Validar chave (44 dígitos)
  const chave = chaveAcesso.replace(/\D/g, "");
  if (chave.length !== 44) return { ok: false, erro: "Chave de acesso inválida (deve ter 44 dígitos)" };

  const cuf = chave.substring(0, 2);
  const tpAmb = ambiente === "producao" ? "1" : "2";
  const endpoint = getEndpoint(cuf, tpAmb);

  // Carregar certificado
  const cert = await carregarCertificado(fazendaId);
  if (!cert) return { ok: false, erro: "Certificado A1 não configurado ou senha não cadastrada. Configure em Parâmetros do Sistema → Fiscal." };

  let pem: { cert: string; key: string };
  try {
    pem = pfxParaPem(cert.pfxBuffer, cert.senha);
  } catch (e) {
    return { ok: false, erro: "Senha do certificado incorreta. Verifique em Parâmetros do Sistema → Fiscal." };
  }

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
