// Criar / Editar / Excluir do grupo de usuários valendo nas gravações feitas pelo navegador (fase 3, 16/11/2026).
// A maioria das telas grava direto no banco pelo cliente Supabase do navegador; este filtro fica entre a tela e o banco:
// insert = Criar, update/upsert = Editar (upsert também aceita Criar), delete = Excluir — no módulo da tela aberta
// (lib/rotas-permissao.ts). Sem a ação marcada, a gravação nem sai e a tela recebe o erro "sem permissão".
// Não cobre rotas de servidor (/api/...): essas conferem por conta própria onde já foi feito (ex.: Folha).

import { grupoPermite, type PermissoesGrupo } from "./permissoes-grupo";
import { modulosDaRota } from "./rotas-permissao";

const EQUIPE = ["raccotlo", "raccotlo_gestor", "raccotlo_operacional", "raccotlo_seletor", "bpo"];

// Gravações de manutenção que acontecem em qualquer tela (preferências, leitura de aviso, log, sessão, fazenda ativa).
const TABELAS_LIVRES = new Set([
  "logs_sistema", "audit_log", "backup_logs", "preferencias_grid", "learning_progress", "avisos_ciencia",
  "suporte_conversas", "suporte_mensagens", "sessoes_whatsapp", "perfis",
]);

type Estado = { role: string | null; permissoes: PermissoesGrupo; carregado: boolean };
let estado: Estado = { role: null, permissoes: {}, carregado: false };

/** Chamado pelo AuthProvider sempre que o papel ou o grupo do usuário muda. */
export function definirPermissoesEscrita(novo: Estado): void {
  estado = novo;
}

export type OperacaoEscrita = "insert" | "update" | "upsert" | "delete";

const ACOES: Record<OperacaoEscrita, string[]> = {
  insert: ["criar"],
  update: ["editar"],
  upsert: ["criar", "editar"],
  delete: ["excluir"],
};
const NOME_ACAO: Record<OperacaoEscrita, string> = { insert: "criar", update: "editar", upsert: "gravar", delete: "excluir" };

/** Mensagem de bloqueio, ou null quando a gravação pode seguir. Pura: recebe o endereço e o estado. */
export function bloqueioEscrita(tabela: string, op: OperacaoEscrita, pathname: string, search: string, e: Estado = estado): string | null {
  if (TABELAS_LIVRES.has(tabela)) return null;
  if (!e.carregado || EQUIPE.includes(e.role ?? "")) return null;
  const modulos = modulosDaRota(pathname, search);
  if (!modulos) return null;
  const ok = modulos.some(m => ACOES[op].some(a => grupoPermite(e.permissoes, m, a)));
  return ok ? null : `Seu grupo de usuário não tem permissão para ${NOME_ACAO[op]} nesta tela. Peça para liberar em Configurações → Usuários e Permissões.`;
}

// Resultado no mesmo formato do Supabase, para a tela tratar como qualquer erro de gravação.
function consultaBloqueada(mensagem: string): unknown {
  const erro = { message: mensagem, code: "42501", details: "permissao_grupo", hint: "" };
  const resultado = { data: null, error: erro, count: null, status: 403, statusText: "Forbidden" };
  const alvo: unknown = new Proxy(function () {}, {
    get(_t, prop) {
      if (prop === "then") return (ok: (v: unknown) => unknown, falha?: (e: unknown) => unknown) => Promise.resolve(resultado).then(ok, falha);
      if (prop === "catch") return (falha: (e: unknown) => unknown) => Promise.resolve(resultado).catch(falha);
      if (prop === "finally") return (f: () => void) => Promise.resolve(resultado).finally(f);
      return () => alvo; // .select(), .single(), .eq()… continuam encadeando
    },
    apply() { return alvo; },
  });
  return alvo;
}

/** Envolve o cliente Supabase do navegador: só `from(...).insert/update/upsert/delete` passam pelo filtro. */
export function protegerEscritas<T extends object>(cliente: T): T {
  return new Proxy(cliente, {
    get(alvo, prop, receptor) {
      const valor = Reflect.get(alvo, prop, receptor);
      if (prop !== "from" || typeof valor !== "function") return valor;
      return (tabela: string) => {
        const builder = (valor as (t: string) => object).call(alvo, tabela);
        return new Proxy(builder, {
          get(b, p, r) {
            const v = Reflect.get(b, p, r);
            if (typeof v !== "function" || !["insert", "update", "upsert", "delete"].includes(String(p))) {
              return typeof v === "function" ? v.bind(b) : v;
            }
            return (...args: unknown[]) => {
              const loc = typeof window !== "undefined" ? window.location : null;
              const msg = loc ? bloqueioEscrita(tabela, p as OperacaoEscrita, loc.pathname, loc.search) : null;
              if (msg) return consultaBloqueada(msg);
              return (v as (...a: unknown[]) => unknown).apply(b, args);
            };
          },
        });
      };
    },
  });
}
