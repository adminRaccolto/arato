import type { SupabaseClient } from "@supabase/supabase-js";

// Compartilhado entre app/api/admin/campo/operador (Raccolto) e
// app/api/campo/operador-conta (self-service, gestor da fazenda) — extraído
// pra não duplicar a geração de credencial entre as duas rotas (17/set/2026:
// gestão de operador passou a ser self-service, mas o admin Raccolto mantém
// a própria rota como via de suporte/emergência).

export function normalizarParaEmail(nome: string): string {
  return nome
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // remove acentos
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2) // primeiro + último nome, evita e-mails gigantes
    .join(".");
}

// Gera um e-mail sintético único pra esse operador (CLAUDE.md do App Campo,
// decisão 4.2 — nunca é uma caixa de entrada de verdade, só o identificador
// de login). Tenta "nome.sobrenome@campo.raccolto.app"; se já existir,
// acrescenta um sufixo numérico.
export async function gerarEmailUnico(admin: SupabaseClient, nome: string): Promise<string> {
  const base = normalizarParaEmail(nome) || "operador";
  const { data: existentes } = await admin.auth.admin.listUsers({ perPage: 1000 });
  const emailsExistentes = new Set((existentes?.users ?? []).map((u) => (u.email ?? "").toLowerCase()));

  let candidato = `${base}@campo.raccolto.app`;
  let n = 2;
  while (emailsExistentes.has(candidato)) {
    candidato = `${base}${n}@campo.raccolto.app`;
    n++;
  }
  return candidato;
}

export function gerarPin(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}
