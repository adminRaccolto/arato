/**
 * lib/nfe/signer.ts
 * Assina o XML da NF-e com certificado A1 (PFX) usando xmldsig (xml-crypto).
 * Padrão: RSA-SHA1 + C14N + envelope signature — exigido pela SEFAZ.
 */

import forge from "node-forge";
import { SignedXml } from "xml-crypto";

export interface PemPair {
  cert: string;       // PEM do certificado folha (usado no xmldsig)
  key: string;        // PEM da chave privada
  certChain?: string; // PEM completo: folha + intermediárias (usado no mTLS com SEFAZ)
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
  const keyBags = [forge.pki.oids.pkcs8ShroudedKeyBag, forge.pki.oids.keyBag]
    .flatMap(bagType => p12.getBags({bagType})[bagType] ?? []);
  const certificados=certBags.map(b=>b.cert).filter((c): c is forge.pki.Certificate=>!!c);
  // Seleciona o certificado pela chave pública correspondente, sem depender da ordem dos bags.
  for(const bag of keyBags) {
    const chave=bag.key as forge.pki.rsa.PrivateKey | undefined;
    if(!chave?.n || !chave.e) continue;
    const cert=certificados.filter(c=>{
      const publica=c.publicKey as forge.pki.rsa.PublicKey;
      return publica.n?.equals(chave.n) && publica.e?.equals(chave.e) && !(c.getExtension('basicConstraints') as {cA?:boolean}|undefined)?.cA;
    }).sort((a,b)=>{
      const agora=Date.now();
      const valido=(c:forge.pki.Certificate)=>Number(c.validity.notBefore.getTime()<=agora && c.validity.notAfter.getTime()>agora);
      return valido(b)-valido(a)||b.validity.notBefore.getTime()-a.validity.notBefore.getTime();
    })[0];
    if(!cert || (cert.getExtension('basicConstraints') as {cA?:boolean} | null)?.cA) continue;
    const cadeia=[cert];
    let atual=cert;
    while(cadeia.length<=certificados.length) {
      if(atual.isIssuer(atual) && atual.verify(atual)) break;
      const possiveis=certificados.filter(c=>!cadeia.includes(c) && atual.isIssuer(c));
      if(!possiveis.length) break;
      const emissor=possiveis.find(c=>{try{return c.verify(atual);}catch{return false;}});
      if(!emissor) throw new Error("Cadeia do certificado A1 inconsistente.");
      cadeia.push(emissor);atual=emissor;
    }
    return {cert:forge.pki.certificateToPem(cert),key:forge.pki.privateKeyToPem(chave),certChain:cadeia.map(c=>forge.pki.certificateToPem(c)).join("\n")};
  }
  throw new Error("O arquivo A1 não contém certificado e chave privada correspondentes.");
}

// ─── Extrai apenas o corpo base64 do PEM (sem headers) ───────────────────────
function pemBody(pem: string): string {
  return pem
    .split("\n")
    .filter((l) => !l.startsWith("-----"))
    .join("")
    .trim();
}

// ─── Assina qualquer elemento XML pelo seu atributo Id (genérico) ────────────
// Usado tanto pra NF-e (Id="NFe...") quanto pra eventos (Id="ID110111..." —
// cancelamento, carta de correção, etc.) — a lógica de assinatura xmldsig é
// idêntica, só muda qual elemento é referenciado.
export function assinarXmlPorId(xmlSemAssinatura: string, pem: PemPair, id: string): string {
  const sig = new SignedXml({
    privateKey:  pem.key,
    // publicCert garante que xml-crypto gere o bloco <X509Certificate> no KeyInfo
    publicCert:  pem.cert,
    // Algoritmo de assinatura exigido pela SEFAZ: rsa-sha1
    signatureAlgorithm: "http://www.w3.org/2000/09/xmldsig#rsa-sha1",
    // xml-crypto v6 exige canonicalizationAlgorithm explícito (antes era inferido do transform)
    canonicalizationAlgorithm: "http://www.w3.org/TR/2001/REC-xml-c14n-20010315",
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
    // MOC NF-e 4.00 exige SHA-1 para o digest — SHA-256 causa rejeição cStat 215
    digestAlgorithm: "http://www.w3.org/2000/09/xmldsig#sha1",
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

// ─── Assina o XML da NF-e ────────────────────────────────────────────────────
export function assinarNFe(xmlSemAssinatura: string, pem: PemPair): string {
  // Extrair chave do Id da infNFe (ex: "NFe51...")
  const match = xmlSemAssinatura.match(/Id="(NFe\d{44})"/);
  if (!match) throw new Error("Id da NF-e não encontrado no XML");
  return assinarXmlPorId(xmlSemAssinatura, pem, match[1]);
}
