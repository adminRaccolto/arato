// NFS-e cancelada pelo prestador: reconhece o cancelamento no XML que chega do SIEG.
// - ABRASF / maioria das prefeituras: o XML da nota (CompNfse) traz o bloco NfseCancelamento / CancelamentoNfse.
// - Provedores que informam a situação na própria nota: Situacao/SituacaoNfse/StatusNfse = 2 ou "Cancelada".
// - Padrão Nacional (NFS-e nacional): o cancelamento é um EVENTO separado (tpEvento 101101) com a chave da nota.

export type CancelamentoNfse =
  | { tipo: "nenhum" }
  | { tipo: "nota_cancelada" }
  | { tipo: "evento"; chave: string; prestadorCnpj: string | null; numero: string | null };

const tag = (nome: string) => `<(?:[\\w-]+:)?${nome}(?:\\s[^>]*)?`;

function valor(xml: string, ...nomes: string[]): string {
  for (const n of nomes) {
    const m = xml.match(new RegExp(`${tag(n)}>\\s*([^<]*?)\\s*</(?:[\\w-]+:)?${n}>`, "i"));
    if (m && m[1]) return m[1];
  }
  return "";
}

/** Chave da NFS-e nacional (50 posições, com ou sem o prefixo "NFS"): município(7) + ambiente(1) + tipo inscr.(1) + CNPJ/CPF(14) + nº(13) + ... */
export function decomporChaveNacional(chave: string): { prestadorCnpj: string; numero: string } | null {
  const d = chave.replace(/^NFS/i, "").replace(/\D/g, "");
  if (d.length !== 50) return null;
  const insc = d.slice(9, 23);
  const prestadorCnpj = d[8] === "1" ? insc.slice(3) : insc;   // tipo 1 = CPF (11 dígitos à direita)
  const numero = d.slice(23, 36).replace(/^0+(?=\d)/, "");
  return { prestadorCnpj, numero };
}

export function detectarCancelamentoNfse(xml: string): CancelamentoNfse {
  const x = xml ?? "";
  // Evento de cancelamento do padrão nacional
  if (new RegExp(`${tag("e101101")}[\\s/>]`, "i").test(x) || /<(?:[\w-]+:)?(?:tpEvento|TipoEvento)>\s*101101\s*</i.test(x)) {
    const chave = valor(x, "chNFSe", "ChaveNfse", "chaveNFSe") || (x.match(/Id=["']PRE?(\d{50})/i)?.[1] ?? "");
    const dec = chave ? decomporChaveNacional(chave) : null;
    return { tipo: "evento", chave, prestadorCnpj: dec?.prestadorCnpj ?? null, numero: dec?.numero ?? null };
  }
  // Bloco de cancelamento dentro da própria nota (ABRASF)
  if (new RegExp(`${tag("NfseCancelamento")}[\\s/>]`, "i").test(x) && !/<(?:[\w-]+:)?NfseCancelamento\s*\/>/i.test(x)) return { tipo: "nota_cancelada" };
  if (new RegExp(`${tag("CancelamentoNfse")}>`, "i").test(x)) return { tipo: "nota_cancelada" };
  // Situação informada na nota
  const sit = valor(x, "SituacaoNfse", "Situacao", "StatusNfse", "situacaoNfse");
  if (/^(2|c|cancelad[ao].*)$/i.test(sit)) return { tipo: "nota_cancelada" };
  if (/^cancelad/i.test(valor(x, "Status", "status"))) return { tipo: "nota_cancelada" };
  if (valor(x, "DataCancelamento", "DataHoraCancelamento", "dhCancelamento")) return { tipo: "nota_cancelada" };
  return { tipo: "nenhum" };
}
