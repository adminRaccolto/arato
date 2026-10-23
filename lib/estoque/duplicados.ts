// Cadastros duplicados no catálogo de insumos/produtos do CLIENTE (o cadastro é da conta, não da fazenda — o mesmo
// nome em duas fazendas também é duplicado). Usado em Estoque → Possíveis Duplicados.

export const normalizarNome = (nome: string): string =>
  (nome ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ").replace(/\b(de|do|da|dos|das)\b/g, "").replace(/\s+/g, " ").trim();

export type InsumoCadastro = { id: string; nome: string; unidade?: string | null; tipo?: string | null; categoria?: string | null; fazenda_id?: string | null; estoque?: number | null; ativo?: boolean | null };

// ── Cadastros duplicados ───────────────────────────────────────────────────────────────────────────────────────
// Palavras que só abreviam o mesmo produto ("SEM SOJA", "SEMENTE SOJA", "SEM: SOJA") — fora da comparação por semelhança.
const PALAVRAS_NEUTRAS = new Set(["sem", "semente", "sementes", "prod", "produto", "insumo"]);
const chaveSemelhanca = (nome: string) => normalizarNome(nome).split(" ").filter(w => w && !PALAVRAS_NEUTRAS.has(w)).join(" ");
const numerosDe = (nome: string) => (normalizarNome(nome).match(/\d+/g) ?? []).sort().join(",");

function bigramas(s: string): Map<string, number> {
  const t = s.replace(/\s+/g, ""); const m = new Map<string, number>();
  for (let i = 0; i < t.length - 1; i++) { const b = t.slice(i, i + 2); m.set(b, (m.get(b) ?? 0) + 1); }
  return m;
}
/** Semelhança de Dice entre 0 e 1 (bigramas de letras, sem espaços). */
export function semelhanca(a: string, b: string): number {
  const A = bigramas(a), B = bigramas(b);
  let total = 0, comum = 0;
  for (const v of A.values()) total += v;
  for (const v of B.values()) total += v;
  for (const [k, v] of A) comum += Math.min(v, B.get(k) ?? 0);
  return total ? (2 * comum) / total : 0;
}

export const LIMITE_SEMELHANCA = 0.85;

/** Todas as palavras do nome menor (pelo menos 2, uma com 3+ letras) aparecem no maior: "soja 7681" ⊂ "soja cg 7681". */
function contido(a: string, b: string): boolean {
  const [menor, maior] = a.length <= b.length ? [a, b] : [b, a];
  const pm = menor.split(" "), pM = new Set(maior.split(" "));
  return pm.length >= 2 && pm.some(w => /[a-z]{3,}/.test(w)) && pm.every(w => pM.has(w));
}

export type GrupoDuplicado = { chave: string; tipo: string; criterio: "exato" | "semelhanca"; itens: InsumoCadastro[] };

/**
 * Grupos de cadastros duplicados do cliente, separados por tipo (insumo × produto).
 * Exato: mesmo nome normalizado. Semelhança: nomes parecidos (≥ 85% das letras, ou um nome contido no outro) com OS MESMOS números — "CG 7681" e "CG 7682"
 * são variedades diferentes, nunca o mesmo produto. Grupos já revisados (Estoque → Possíveis Duplicados) ficam de fora.
 */
export function gruposDuplicados(insumos: InsumoCadastro[], revisados: Set<string> = new Set()): GrupoDuplicado[] {
  const ativos = insumos.filter(i => i.ativo !== false && (i.nome ?? "").trim());
  const grupos: GrupoDuplicado[] = [];
  const porTipo = new Map<string, InsumoCadastro[]>();
  for (const i of ativos) { const t = i.tipo ?? "insumo"; porTipo.set(t, [...(porTipo.get(t) ?? []), i]); }

  for (const [tipo, lista] of porTipo) {
    // Exatos
    const exatos = new Map<string, InsumoCadastro[]>();
    for (const i of lista) { const k = normalizarNome(i.nome); exatos.set(k, [...(exatos.get(k) ?? []), i]); }
    for (const [k, itens] of exatos) if (itens.length > 1 && !revisados.has(k)) grupos.push({ chave: k, tipo, criterio: "exato", itens });

    // Semelhança: um representante por nome exato, une pares parecidos (union-find)
    const reps = [...exatos.entries()].map(([k, itens]) => ({ k, sim: chaveSemelhanca(itens[0].nome), num: numerosDe(itens[0].nome), itens }));
    const pai = reps.map((_, i) => i);
    const raiz = (i: number): number => (pai[i] === i ? i : (pai[i] = raiz(pai[i])));
    for (let a = 0; a < reps.length; a++) {
      for (let b = a + 1; b < reps.length; b++) {
        if (reps[a].num !== reps[b].num || !reps[a].sim || !reps[b].sim) continue;
        if (reps[a].sim === reps[b].sim || contido(reps[a].sim, reps[b].sim) || semelhanca(reps[a].sim, reps[b].sim) >= LIMITE_SEMELHANCA) pai[raiz(a)] = raiz(b);
      }
    }
    const juntos = new Map<number, typeof reps>();
    reps.forEach((r, i) => juntos.set(raiz(i), [...(juntos.get(raiz(i)) ?? []), r]));
    for (const membros of juntos.values()) {
      if (membros.length < 2) continue;
      const chave = "~" + membros.map(m => m.k).sort().join("|");
      if (revisados.has(chave)) continue;
      grupos.push({ chave, tipo, criterio: "semelhanca", itens: membros.flatMap(m => m.itens) });
    }
  }
  return grupos.sort((x, y) => y.itens.length - x.itens.length || x.chave.localeCompare(y.chave));
}
