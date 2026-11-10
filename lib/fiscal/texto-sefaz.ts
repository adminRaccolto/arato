// Texto livre que vai num evento ou documento da SEFAZ (carta de correção, justificativa de cancelamento, etc.):
// quebra de linha, tabulação e espaço repetido são "caracteres de edição" e a SEFAZ rejeita (588). Vira um espaço só.
export function textoLivreSefaz(s: string | null | undefined): string {
  return String(s ?? "")
    .replace(/[\u0000-\u001F\u007F]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
