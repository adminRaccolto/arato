// Ciclos vistos pelo cliente inteiro: nome com a fazenda e regra de quem entra no DRE quando se filtra uma fazenda.

const normalizar = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

type CicloNomeavel = { fazenda_id?: string | null; descricao?: string | null; cultura?: string | null };

/** "Soja 2026/2027 — Panorama". A fazenda só entra se o cliente tiver ciclos em mais de uma e se o nome ainda não a disser. */
export function rotularCiclos<T extends CicloNomeavel>(ciclos: T[], nomeFazenda: (id: string) => string | null | undefined): (T & { rotulo: string })[] {
  const variasFazendas = new Set(ciclos.map(c => c.fazenda_id)).size > 1;
  return ciclos.map(c => {
    const nome = (c.descricao || c.cultura || "").trim();
    const fazenda = (c.fazenda_id ? nomeFazenda(c.fazenda_id) : null)?.trim();
    if (!variasFazendas || !fazenda) return { ...c, rotulo: nome };
    const curto = fazenda.replace(/^fazenda\s+/i, "");
    return { ...c, rotulo: normalizar(nome).includes(normalizar(curto)) ? nome : `${nome} — ${curto}` };
  });
}

/**
 * O título entra no DRE desta visão? O ciclo apontado manda: conta para o ciclo escolhido mesmo que o título seja de
 * outra fazenda, e título desta fazenda apontado para ciclo de outra sai daqui (senão entraria duas vezes no rateio).
 */
export function tituloEntraNaVisao(
  t: { fazenda_id?: string | null; ciclo_id?: string | null },
  ciclosDaVisao: Set<string>,
  fazendasDaVisao: Set<string>,
  fazendaDoCiclo: Map<string, string>,
): boolean {
  if (t.ciclo_id && ciclosDaVisao.has(t.ciclo_id)) return true;
  if (!t.fazenda_id || !fazendasDaVisao.has(t.fazenda_id)) return false;
  const dona = t.ciclo_id ? fazendaDoCiclo.get(t.ciclo_id) : undefined;
  return !dona || fazendasDaVisao.has(dona);
}
