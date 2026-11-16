// IE do tomador na NFS de terceiro (16/11/2026). A NF de produtos escolhe a IE do produtor — e, por ela, a fazenda — pela
// IE do destinatário no XML; a NFS escolhia a fazenda só pelo CPF do tomador (a fazenda "dona" do produtor) e o município
// pelo cadastro geral do produtor. Produtor com IEs em fazendas de cidades diferentes tinha a NFS processada na fazenda
// errada. Aqui fica a regra única: IE lida da nota → município do tomador na nota → única fazenda possível → nenhuma
// (nesse caso a tela pede a IE antes de processar).

export type IeTomador = {
  id?: string;
  produtor_id?: string;
  fazenda_id?: string | null;
  inscricao_estadual: string;
  municipio?: string | null;
  estado?: string | null;
  municipio_ibge?: string | null;
  ativa?: boolean | null;
};

const dig = (v: unknown) => String(v ?? "").replace(/\D/g, "");

function bloco(xml: string, ...tags: string[]): string {
  for (const tag of tags) {
    const m = xml.match(new RegExp(`<${tag}(?:\\s[^>]*)?>[\\s\\S]*?</${tag}>`, "i"));
    if (m) return m[0];
  }
  return "";
}
function valor(xml: string, ...tags: string[]): string {
  for (const tag of tags) {
    const m = xml.match(new RegExp(`<${tag}(?:\\s[^>]*)?>([^<]*)</${tag}>`, "i"));
    if (m && m[1].trim()) return m[1].trim();
  }
  return "";
}

/** IE e código IBGE do município do tomador, lidos só de dentro do bloco do tomador (nunca do prestador). */
export function tomadorDoXmlNfse(xml: string): { ie: string; ibge: string } {
  const t = bloco(xml, "TomadorServico", "Tomador", "DadosTomador", "tomador", "toma");
  if (!t) return { ie: "", ibge: "" };
  const ie = dig(valor(t, "InscricaoEstadual", "InscEstadual", "inscricao_estadual", "IE", "ie"));
  const end = bloco(t, "Endereco", "EnderecoTomador", "endereco", "end", "endNac") || t;
  const ibge = dig(valor(end, "CodigoMunicipio", "cMun", "codigo_municipio", "CodigoIbge", "codigoMunicipio"));
  // IE "ISENTO" vira vazio; código de município só vale com 7 dígitos (IPM usa o código TOM de 4 dígitos em <cidade>)
  return { ie: ie.length >= 8 ? ie : "", ibge: ibge.length === 7 ? ibge : "" };
}

/**
 * Escolhe a IE do tomador entre as IEs do produtor: a IE informada na nota; senão a única IE do município do tomador
 * na nota; senão a única fazenda possível. Sem como decidir, null — quem chama não chuta.
 */
export function escolherIeTomador(ies: IeTomador[], ieNota?: string | null, ibgeNota?: string | null): IeTomador | null {
  const ativas = ies.filter(i => i.ativa !== false);
  const ie = dig(ieNota);
  if (ie) {
    const achada = ativas.find(i => dig(i.inscricao_estadual) === ie);
    if (achada) return achada;
  }
  const ibge = dig(ibgeNota);
  if (ibge.length === 7) {
    const doMun = ativas.filter(i => dig(i.municipio_ibge) === ibge);
    if (doMun.length && new Set(doMun.map(i => i.fazenda_id ?? "")).size === 1) return doMun[0];
  }
  return ativas.length && new Set(ativas.map(i => i.fazenda_id ?? "")).size === 1 ? ativas[0] : null;
}

/** As IEs ativas do produtor estão em mais de uma fazenda — sem a IE da nota, a fazenda não pode ser adivinhada. */
export function ieObrigatoria(ies: IeTomador[]): boolean {
  return new Set(ies.filter(i => i.ativa !== false && i.fazenda_id).map(i => i.fazenda_id)).size > 1;
}

// A IE lida da nota fica registrada na observação da NFS importada (nf_servicos não tem coluna própria para ela)
const MARCA = "IE tomador:";
export const marcaIeTomador = (ie: string) => (dig(ie) ? ` · ${MARCA} ${dig(ie)}` : "");
export function ieTomadorDaObservacao(obs: string | null | undefined): string {
  return String(obs ?? "").match(/IE tomador:\s*(\d{8,})/i)?.[1] ?? "";
}

/** Texto da opção da IE: "13.877.0001 — MT / Canarana · Fazenda X". */
export function rotuloIe(i: IeTomador, nomeFazenda?: string): string {
  return `${i.inscricao_estadual}${i.estado ? ` — ${i.estado}` : ""}${i.municipio ? ` / ${i.municipio}` : ""}${nomeFazenda ? ` · ${nomeFazenda}` : ""}`;
}
