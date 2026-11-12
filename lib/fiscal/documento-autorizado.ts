// A SEFAZ devolve só o protocolo. O arquivo fiscal a guardar é o documento assinado + o protocolo, no envelope do modelo.
export function montarProcAutorizado(modelo: "nfe" | "cte" | "mdfe", xmlAssinado: string, xmlProt: string, versao: string): string {
  const tag = modelo + "Proc";
  if (xmlProt.includes(`<${tag}`)) return xmlProt; // a resposta já veio completa
  const documento = xmlAssinado.replace(/^<\?xml[^?]*\?>\s*/i, "");
  return `<?xml version="1.0" encoding="UTF-8"?><${tag} xmlns="http://www.portalfiscal.inf.br/${modelo}" versao="${versao}">${documento}${xmlProt}</${tag}>`;
}
