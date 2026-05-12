/**
 * lib/nfe/signer.ts
 * Assina o XML da NF-e com certificado A1 (PFX) usando xmldsig (xml-crypto).
 * Padrão: RSA-SHA1 + C14N + envelope signature — exigido pela SEFAZ.
 */

import forge from "node-forge";
// xml-crypto v6 não tem tipos @types — importamos com require para evitar erro de resolução
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { SignedXml } = require("xml-crypto");

export interface PemPair {
  cert: string; // PEM do certificado
  key: string;  // PEM da chave privada
}

// ─── Extrai PEM do PFX (reusado de sefaz-consulta.ts) ────────────────────────
export function pfxParaPem(pfxBuffer: Buffer, senha: string): PemPair {
  const bytes = pfxBuffer.toString("binary");
  const der = forge.util.createBuffer(bytes, "raw");
  const asn1 = forge.asn1.fromDer(der);
  const p12 = forge.pkcs12.pkcs12FromAsn1(asn1, false, senha);

  const certBags =
    p12.getBags({ bagType: forge.pki.oids.certBag })[
      forge.pki.oids.certBag
    ] ?? [];
  const keyBags =
    p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag })[
      forge.pki.oids.pkcs8ShroudedKeyBag
    ] ?? [];

  if (!certBags.length || !keyBags.length)
    throw new Error("Certificado inválido ou senha incorreta");

  const cert = forge.pki.certificateToPem(certBags[0].cert!);
  const key = forge.pki.privateKeyToPem(
    keyBags[0].key as forge.pki.rsa.PrivateKey
  );
  return { cert, key };
}

// ─── Extrai apenas o corpo base64 do PEM (sem headers) ───────────────────────
function pemBody(pem: string): string {
  return pem
    .split("\n")
    .filter((l) => !l.startsWith("-----"))
    .join("")
    .trim();
}

// ─── Assina o XML da NF-e ────────────────────────────────────────────────────
export function assinarNFe(xmlSemAssinatura: string, pem: PemPair): string {
  // Extrair chave do Id da infNFe (ex: "NFe51...")
  const match = xmlSemAssinatura.match(/Id="(NFe\d{44})"/);
  if (!match) throw new Error("Id da NF-e não encontrado no XML");
  const id = match[1];

  const sig = new SignedXml({
    privateKey: pem.key,
    // Algoritmo de assinatura exigido pela SEFAZ: rsa-sha1
    signatureAlgorithm: "http://www.w3.org/2000/09/xmldsig#rsa-sha1",
  });

  sig.addReference({
    // Aponta para o elemento com Id="NFe..."
    xpath: `//*[@Id='${id}']`,
    transforms: [
      // 1. Remove a própria assinatura do digest
      "http://www.w3.org/2000/09/xmldsig#enveloped-signature",
      // 2. Canonicalização C14N exclusiva (sem comentários)
      "http://www.w3.org/TR/2001/REC-xml-c14n-20010315",
    ],
    digestAlgorithm: "http://www.w3.org/2001/04/xmlenc#sha256",
  });

  // Localiza onde inserir a assinatura: logo após </infNFe>
  sig.computeSignature(xmlSemAssinatura, {
    prefix: "",
    attrs: {},
    location: {
      reference: `//*[@Id='${id}']`,
      action: "after",
    },
    existingPrefixes: { ds: "http://www.w3.org/2000/09/xmldsig#" },
  });

  let signed: string = sig.getSignedXml();

  // SEFAZ exige que o elemento X509Data contenha o certificado sem quebras
  // xml-crypto já insere, mas garantimos o formato correto
  const certBody = pemBody(pem.cert);
  signed = signed.replace(
    /<X509Certificate>[\s\S]*?<\/X509Certificate>/,
    `<X509Certificate>${certBody}</X509Certificate>`
  );

  return signed;
}
