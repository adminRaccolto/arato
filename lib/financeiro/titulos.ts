/**
 * Regras ÚNICAS de leitura de títulos (CP/CR) usadas pelos relatórios financeiros.
 *
 * Por quê: cada tela refazia seu próprio filtro/status/duplicidade, e um conserto numa não chegava nas outras
 * (títulos repetidos, status "vencido" calculado de jeito diferente, filtro de tipo ignorado...). Aqui ficam
 * as regras em funções puras, com teste automático (titulos.test.ts) — qualquer tela nova usa estas.
 */

import { hojeLocal } from "../data-local.ts";

export type TituloBase = {
  id: string;
  tipo: "pagar" | "receber" | string;
  status: string;
  natureza?: string | null;
  moeda?: string | null;
  data_vencimento?: string | null;
  data_lancamento?: string | null;
  categoria?: string | null;
  produtor_id?: string | null;
  pessoa_id?: string | null;
  descricao?: string | null;
};

/** Um título nunca aparece duas vezes: o último com o mesmo id vence. */
export function dedupeTitulos<T extends { id: string }>(rows: T[]): T[] {
  return Array.from(new Map(rows.map(r => [r.id, r])).values());
}

export { hojeLocal };

/** Status que o usuário enxerga: baixado/parcial valem como estão; previsão não "vence"; o resto depende da data. */
export function statusEfetivo(l: { status: string; natureza?: string | null; data_vencimento?: string | null }, hoje: string = hojeLocal()): string {
  if (l.status === "baixado" || l.status === "parcial") return l.status;
  if (l.natureza === "previsao") return l.status;
  const venc = l.data_vencimento ?? "";
  if (venc && venc < hoje) return "vencido";
  if (venc && venc === hoje) return "vencendo";
  return l.status;
}

export type FiltroTitulos = {
  inicio?: string;
  fim?: string;
  tipo?: "todos" | "pagar" | "receber";
  status?: ReadonlySet<string>;      // vazio = todos
  categorias?: ReadonlySet<string>;  // vazio = todas
  produtores?: ReadonlySet<string>;  // vazio = todos
  fornecedor?: string;               // texto livre
  incluirBarter?: boolean;           // padrão: não
};

/** Filtro único do relatório de CP/CR. `nomeFornecedor` resolve o nome exibido do título (pessoa ou descrição). */
export function filtrarTitulos<T extends TituloBase>(
  titulos: T[],
  f: FiltroTitulos,
  nomeFornecedor: (t: T) => string = t => t.descricao ?? "",
  hoje: string = hojeLocal(),
): T[] {
  const busca = (f.fornecedor ?? "").trim().toLowerCase();
  return titulos.filter(t => {
    if (t.moeda === "barter" && !f.incluirBarter) return false;
    const dt = t.data_vencimento ?? t.data_lancamento ?? "";
    if (f.inicio && dt < f.inicio) return false;
    if (f.fim && dt > f.fim) return false;
    if (f.tipo && f.tipo !== "todos" && t.tipo !== f.tipo) return false;
    if (f.status && f.status.size > 0 && !f.status.has(statusEfetivo(t, hoje))) return false;
    if (f.categorias && f.categorias.size > 0 && !f.categorias.has(t.categoria ?? "")) return false;
    if (f.produtores && f.produtores.size > 0 && !f.produtores.has(t.produtor_id ?? "")) return false;
    if (busca && !nomeFornecedor(t).toLowerCase().includes(busca)) return false;
    return true;
  });
}

/**
 * Status mostrado nas telas de Contas a Pagar/Receber (vindo de rel_lancamentos.status_normalizado, que só vira
 * "vencido" quando o cron das 06h roda). Título em aberto com vencimento anterior a hoje é exibido como vencido
 * na hora — o mesmo critério do relatório e do filtro de status —, para o selo da linha nunca contradizer a data.
 */
export function statusExibido(statusNormalizado: string | null | undefined, vencimento: string | null | undefined, hoje: string = hojeLocal()): string {
  const st = statusNormalizado ?? "";
  if (st === "em_aberto" && vencimento && vencimento < hoje) return "vencido";
  return st;
}
