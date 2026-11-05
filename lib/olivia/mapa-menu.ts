// Menu da Olívia: sai do menu real do sistema (lib/navigation.ts), para ela nunca indicar uma tela que mudou de lugar.
// Mudou o menu, o mapa muda junto. O teste e a conferência de cada resposta usam a mesma árvore.

type Filho = { type?: string; label: string; path?: string; moduleId?: string; disabled?: boolean; children?: Filho[] };
type ItemMenu = { type?: string; label: string; path?: string; children?: Filho[] };

const normalizar = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[*`_]/g, "").replace(/\s+/g, " ").trim();
const secao = (topo: string, label: string) => label.replace(new RegExp(`^${topo}\\s*[—-]\\s*`), "");

/** Uma linha por tela. Tela da equipe Raccolto vem marcada, porque o cliente não a vê no menu. */
export function montarMapaMenu(nav: ItemMenu[]): string {
  const linhas: string[] = [];
  for (const topo of nav) {
    if (topo.type !== "group") { linhas.push(`- ${topo.label}`); continue; }
    let s: string | null = null;
    const anda = (filhos: Filho[], prefixo: string[]) => {
      for (const f of filhos) {
        if (f.type === "divider") { s = secao(topo.label, f.label); continue; }
        if (f.type === "subgroup") { anda(f.children ?? [], [...prefixo, f.label]); continue; }
        if (f.disabled) continue;
        const caminho = [topo.label, ...(s ? [s] : []), ...prefixo, f.label].join(" → ");
        linhas.push(`- ${caminho}${f.moduleId === "conf_raccotlo" ? " (só a equipe Raccolto vê)" : ""}`);
      }
    };
    anda(topo.children ?? [], []);
  }
  return [...new Set(linhas)].join("\n");
}

// Nomes de menus que já existiram: citar qualquer um deles como início de caminho é erro
const MENUS_ANTIGOS = ["Compras & Estoque", "Suprimentos", "Lavoura", "Comercial", "Compras", "Estoque", "Relatórios", "Parâmetros", "BI", "Contratos"];

function nomesPorMenu(nav: ItemMenu[]): Map<string, Set<string>> {
  const m = new Map<string, Set<string>>();
  for (const topo of nav) {
    if (topo.type !== "group") continue;
    const nomes = new Set<string>();
    const anda = (filhos: Filho[]) => {
      for (const f of filhos) {
        nomes.add(normalizar(f.type === "divider" ? secao(topo.label, f.label) : f.label));
        if (f.children) anda(f.children);
      }
    };
    anda(topo.children ?? []);
    m.set(topo.label, nomes);
  }
  return m;
}

// Sigla curta só vale exata: "CP" não pode passar por causa de "CP / CR — Contas"
const casa = (trecho: string, nome: string) => nome === trecho || (trecho.length >= 4 && nome.includes(trecho)) || trecho.startsWith(`${nome} `);

/** Caminhos de menu citados no texto que não existem no menu real. */
export function rotasInvalidas(texto: string, nav: ItemMenu[]): string[] {
  const limpo = texto.replace(/[*`_]/g, "");
  const menus = nomesPorMenu(nav);
  const invalidas: string[] = [];
  const escapar = (s: string) => s.replace(/[.*+?^${}()|[\]\\&]/g, "\\$&");
  const procurar = (nome: string, validar: (proximo: string) => boolean) => {
    const re = new RegExp(`(?<![\\wÀ-ÿ])(?<!aba )(?<!→ )${escapar(nome)}\\s*→\\s*([^→\\n.,;:()—]{2,45})`, "g");
    for (const m of limpo.matchAll(re)) if (!validar(normalizar(m[1]))) invalidas.push(`${nome} → ${m[1].trim()}`);
  };
  // "Configurações → Rede" é a tela do RustDesk, programa do suporte remoto, não do Arato
  for (const [nome, nomes] of menus) procurar(nome, proximo => [...nomes].some(n => casa(proximo, n)) || (nome === "Configurações" && proximo.startsWith("rede")));
  for (const nome of MENUS_ANTIGOS) {
    const re = new RegExp(`(?<![\\wÀ-ÿ])(?<!→ )(?<!& )${escapar(nome)}\\s*→\\s*([^→\\n.,;:()—]{2,45})`, "g");
    for (const m of limpo.matchAll(re)) invalidas.push(`${nome} → ${m[1].trim()}`);
  }
  return [...new Set(invalidas)];
}
