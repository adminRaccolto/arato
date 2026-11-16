// Endereço → módulo de permissão, a partir dos próprios itens do menu (lib/navigation.ts). Usado para bloquear quem
// abre uma tela pelo endereço sem ter o módulo no grupo (o menu já esconde o item; aqui vale o mesmo para a URL).
//
// Regra: o item do menu de caminho mais longo que é prefixo do endereço decide (ex.: /financeiro/folha/relatorios
// casa com "Folha de Pagamento — relatórios", não com a Folha). Vários itens com o mesmo caminho e query diferente
// (ex.: /cadastros?tab=maquinas × ?tab=pessoas): com a query, valem os itens cuja query bate; sem ela, qualquer um deles
// libera. Endereço fora do menu (Início, Ajuda, Gestão Arato, seletor de cliente…) não é bloqueado por aqui.

import { NAV, type NavLink } from "./navigation";

type ItemRota = { caminho: string; query: Record<string, string>; moduleId?: string };

function itens(): ItemRota[] {
  const out: ItemRota[] = [];
  const add = (l: NavLink) => {
    const [caminho, qs = ""] = l.path.split("?");
    out.push({ caminho, query: Object.fromEntries(new URLSearchParams(qs)), moduleId: l.moduleId });
  };
  for (const it of NAV) {
    if (it.type !== "group") { add(it as NavLink); continue; }
    for (const c of it.children) {
      if (c.type === "divider") continue;
      for (const x of c.type === "subgroup" ? c.children : [c as NavLink]) add(x);
    }
  }
  return out;
}

const ITENS = itens();

/** Módulos que liberam o endereço (basta um), ou null quando o endereço não é controlado por módulo. */
export function modulosDaRota(pathname: string, search = ""): string[] | null {
  const caminho = pathname.replace(/\/+$/, "") || "/";
  const casa = (c: string) => c === caminho || (c !== "/" && caminho.startsWith(c + "/"));
  const candidatos = ITENS.filter(i => casa(i.caminho));
  if (!candidatos.length) return null;
  const maior = Math.max(...candidatos.map(i => i.caminho.length));
  let doCaminho = candidatos.filter(i => i.caminho.length === maior);
  const params = new URLSearchParams(search);
  const comQuery = doCaminho.filter(i => Object.keys(i.query).length > 0 && Object.entries(i.query).every(([k, v]) => params.get(k) === v));
  if (search && comQuery.length) doCaminho = comQuery;
  if (doCaminho.some(i => !i.moduleId)) return null;
  return [...new Set(doCaminho.map(i => i.moduleId!))];
}
