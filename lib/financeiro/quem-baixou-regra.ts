// Regra pura de "quem fez a baixa" (sem React/Supabase, para testar): ver quem-baixou.ts
export type QuemBaixou = { nome: string | null; quando: string };
export type Linha = { registro_id: string; usuario_app: string | null; created_at: string; dados_antes: Record<string, unknown> | null; dados_depois: Record<string, unknown> | null };

const PAGO = new Set(["baixado", "pago", "parcial"]);

/** Última baixa de cada título a partir das linhas do histórico (puro, testável). */
export function ultimaBaixa(linhas: Linha[]): Map<string, QuemBaixou> {
  const out = new Map<string, QuemBaixou>();
  for (const a of [...linhas].sort((x, y) => x.created_at.localeCompare(y.created_at))) {
    const st = String(a.dados_depois?.status ?? "");
    const pagoMudou = Number(a.dados_antes?.valor_pago ?? 0) !== Number(a.dados_depois?.valor_pago ?? 0);
    const virouPago = PAGO.has(st) && a.dados_antes?.status !== st;
    if (PAGO.has(st) && (virouPago || pagoMudou)) out.set(a.registro_id, { nome: a.usuario_app?.trim() || null, quando: a.created_at });
  }
  return out;
}

export function textoQuemBaixou(q: QuemBaixou | undefined): string | undefined {
  if (!q) return undefined;
  const d = new Date(q.quando);
  const quando = `${d.toLocaleDateString("pt-BR")} ${d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`;
  return `Baixado por ${q.nome ?? "processo automático (sem usuário)"} em ${quando}`;
}
