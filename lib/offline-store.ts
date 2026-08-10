// Armazenamento offline para o módulo Campo
// Usa localStorage — simples, sem dependência, suficiente para o volume esperado

export type TipoOp = "plantio" | "pulverizacao" | "colheita" | "abastecimento";

export interface OperacaoPendente {
  id: string;           // UUID local (crypto.randomUUID)
  tipo: TipoOp;
  fazenda_id: string;
  criado_em: string;    // ISO
  payload: Record<string, unknown>;
  itens?: Record<string, unknown>[];  // pulverizacao_itens
}

const FILA_KEY = "arato_campo_fila";

// ── Fila de escrita ────────────────────────────────────────────────────────

export function lerFila(): OperacaoPendente[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(FILA_KEY) ?? "[]");
  } catch {
    return [];
  }
}

export function adicionarNaFila(op: Omit<OperacaoPendente, "id" | "criado_em">): string {
  const id = crypto.randomUUID();
  const nova: OperacaoPendente = { ...op, id, criado_em: new Date().toISOString() };
  const fila = lerFila();
  fila.push(nova);
  localStorage.setItem(FILA_KEY, JSON.stringify(fila));
  return id;
}

export function removerDaFila(ids: string[]): void {
  const fila = lerFila().filter((op) => !ids.includes(op.id));
  localStorage.setItem(FILA_KEY, JSON.stringify(fila));
}

export function contarPendentes(): number {
  return lerFila().length;
}

// ── Cache de dados de referência (talhões, ciclos, insumos…) ──────────────

const MAX_IDADE_MS = 12 * 60 * 60 * 1000; // 12 horas

export function salvarCache(chave: string, dados: unknown): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(`arato_cache_${chave}`, JSON.stringify({ ts: Date.now(), dados }));
  } catch {
    // localStorage cheio — ignora silenciosamente
  }
}

export function lerCache<T>(chave: string, maxIdadeMs = MAX_IDADE_MS): T | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(`arato_cache_${chave}`);
    if (!raw) return null;
    const { ts, dados } = JSON.parse(raw) as { ts: number; dados: T };
    if (Date.now() - ts > maxIdadeMs) return null;
    return dados;
  } catch {
    return null;
  }
}
