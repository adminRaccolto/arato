// Regra única de permissão por grupo de usuários — usada no login (AuthProvider), nas rotas de servidor e na tela de
// grupos. Ver lib/modulos.ts (catálogo) e lib/permissoes-configuracao.ts (telas de configuração).
//
// Dois formatos de grupo convivem:
//  • legado (sem a marca "_v2"): módulo ausente ou com a lista vazia = LIBERADO. Era assim que todos os grupos
//    funcionavam até 16/11/2026 — a tela mostrava a caixa desmarcada, mas o usuário via a tela.
//  • v2 (com "_v2": true, gravado pela Seção 454 e por todo grupo salvo depois dela): vale o que está marcado.
//    Módulo ausente ou sem ações = BLOQUEADO — módulo novo entra bloqueado até o administrador marcar.
// Usuário sem grupo segue vendo tudo (decisão do dono, 16/11/2026: ele vai atribuir um grupo a cada um).

import { ehConfiguracaoPorGrupo, grupoLiberaConfiguracao } from "./permissoes-configuracao";

export const MARCA_V2 = "_v2";

export type PermissoesGrupo = Record<string, unknown> | null | undefined;

export function grupoEhV2(perms: PermissoesGrupo): boolean {
  return !!perms && (perms as Record<string, unknown>)[MARCA_V2] === true;
}

/** O grupo libera esta ação no módulo? `perms` nulo/vazio = usuário sem grupo. */
export function grupoPermite(perms: PermissoesGrupo, modulo: string, acao = "visualizar"): boolean {
  const p = perms ? (perms as Record<string, unknown>)[modulo] : undefined;
  if (ehConfiguracaoPorGrupo(modulo)) {
    // Configuração: não marcado = sem acesso, em qualquer formato (regra que já valia)
    if (acao === "visualizar") return grupoLiberaConfiguracao(p);
    return Array.isArray(p) ? p.includes(acao) : p === "escrita";
  }
  if (grupoEhV2(perms)) return Array.isArray(p) && p.includes(acao);
  // Legado
  if (p === undefined || p === null) return true;
  if (Array.isArray(p)) return p.length === 0 || p.includes(acao);
  if (typeof p === "string") {
    if (p === "nenhum") return false;
    if (acao === "visualizar") return true;
    return p === "escrita" || p === "admin";
  }
  return true;
}

// Áreas que apareciam para todo mundo até 16/11/2026 (o menu não as ligava ao grupo).
const ABERTAS_ATE_V2 = new Set(["cadastros", "propriedades", "lavoura_plan", "lavoura_plantio", "lavoura_pulv", "lavoura_colheita",
  "lavoura_monitoramento", "maquinas", "estoque", "folha", "custos", "balanca", "auditoria"]);

/** Mesma conversão da Seção 454 (fn_permissoes_grupo_v2): grupo antigo → v2, sem tirar nada que o usuário já via.
 *  `acoesPorModulo`: módulos da tela de permissões (exceto conf_*) e todas as ações de cada um. */
export function converterGrupoParaV2(perms: PermissoesGrupo, acoesPorModulo: Record<string, string[]>): Record<string, unknown> {
  const r: Record<string, unknown> = { ...(perms ?? {}) };
  if (r[MARCA_V2] === true) return r;
  for (const [k, todas] of Object.entries(acoesPorModulo)) {
    const v = r[k];
    if (v === undefined || v === null || (Array.isArray(v) && v.length === 0)) r[k] = [...todas];
    else if (typeof v === "string") {
      r[k] = v === "admin" ? [...todas] : v === "escrita" ? ["visualizar", "criar", "editar"] : v === "leitura" ? ["visualizar"]
        : ABERTAS_ATE_V2.has(k) ? ["visualizar"] : [];
    } else if (Array.isArray(v) && !v.includes("visualizar") && ABERTAS_ATE_V2.has(k)) r[k] = ["visualizar", ...v];
  }
  r[MARCA_V2] = true;
  return r;
}
