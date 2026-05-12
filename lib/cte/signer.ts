/**
 * lib/cte/signer.ts
 * Assina o CT-e com o mesmo padrão xmldsig da NF-e.
 * O Id do CT-e tem o formato "CTe{44 dígitos}" (vs "NFe{44}" da NF-e).
 */

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { SignedXml } = require("xml-crypto");
import type { PemPair } from "../nfe/signer";
export type { PemPair };

function pemBody(pem: string): string {
  return pem.split("\n").filter(l => !l.startsWith("-----")).join("").trim();
}

export function assinarCTe(xmlSemAssinatura: string, pem: PemPair): string {
  const match = xmlSemAssinatura.match(/Id="(CTe\d{44})"/);
  if (!match) throw new Error("Id do CT-e não encontrado no XML");
  const id = match[1];

  const sig = new SignedXml({
    privateKey: pem.key,
    signatureAlgorithm: "http://www.w3.org/2000/09/xmldsig#rsa-sha1",
  });

  sig.addReference({
    xpath: `//*[@Id='${id}']`,
    transforms: [
      "http://www.w3.org/2000/09/xmldsig#enveloped-signature",
      "http://www.w3.org/TR/2001/REC-xml-c14n-20010315",
    ],
    digestAlgorithm: "http://www.w3.org/2001/04/xmlenc#sha256",
  });

  sig.computeSignature(xmlSemAssinatura, {
    prefix: "",
    attrs: {},
    location: { reference: `//*[@Id='${id}']`, action: "after" },
    existingPrefixes: { ds: "http://www.w3.org/2000/09/xmldsig#" },
  });

  let signed: string = sig.getSignedXml();
  const certBody = pemBody(pem.cert);
  signed = signed.replace(
    /<X509Certificate>[\s\S]*?<\/X509Certificate>/,
    `<X509Certificate>${certBody}</X509Certificate>`
  );
  return signed;
}
