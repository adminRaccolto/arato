import forge from "node-forge";

/** DOC-ICP-04: otherName 1.3.3 = CNPJ; 1.3.1 = nascimento (8) + CPF (11). */
export function documentoDoCertificado(cert: forge.pki.Certificate): string | null {
  const san = cert.getExtension('subjectAltName') as {value?:string} | undefined;
  const encontrados = new Map<string,string>();
  const texto = (n: forge.asn1.Asn1): string => typeof n.value === "string" ? n.value : n.value.map(texto).join("");
  const percorrer = (n: forge.asn1.Asn1) => {
    if (!Array.isArray(n.value)) return;
    const oid = n.value.find(v=>v.type===forge.asn1.Type.OID && v.tagClass===forge.asn1.Class.UNIVERSAL);
    if(oid && typeof oid.value === "string") {
      const id=forge.asn1.derToOid(oid.value);
      if(id==='2.16.76.1.3.3' || id==='2.16.76.1.3.1') encontrados.set(id,n.value.filter(v=>v!==oid).map(texto).join(''));
    }
    n.value.forEach(percorrer);
  };
  if(san?.value && typeof san.value==='string') percorrer(forge.asn1.fromDer(san.value));
  const cnpj=encontrados.get('2.16.76.1.3.3');
  if(cnpj && /^\d{14}$/.test(cnpj)) return cnpj;
  const cpf=encontrados.get('2.16.76.1.3.1')?.slice(8,19);
  if(cpf && /^\d{11}$/.test(cpf)) return cpf;
  // Alguns A1 antigos repetem o documento no CN assinado. Nunca usa CPF do responsável de um e-CNPJ.
  const cn=String(cert.subject.getField('CN')?.value ?? '');
  return cn.match(/:(\d{14}|\d{11})$/)?.[1] ?? null;
}

export const chaveTitularCertificado=(doc:string) => doc.length===14 ? doc.slice(0,8) : doc;
export function certificadoDoTitular(certificado:string, emitente:string) {
  return [11,14].includes(emitente.length) && certificado.length===emitente.length
    && chaveTitularCertificado(certificado)===chaveTitularCertificado(emitente);
}
