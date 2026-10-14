/**
 * "Hoje" no fuso do usuário, no formato AAAA-MM-DD.
 *
 * `new Date().toISOString().slice(0, 10)` devolve a data em UTC: depois das 21h no Brasil já é "amanhã" —
 * título que vence hoje aparecia como vencido, datas padrão saíam um dia adiantadas e relatórios divergiam
 * conforme a hora em que eram abertos. No navegador usa o fuso do próprio aparelho; no servidor (Vercel roda em
 * UTC) usa o fuso de Mato Grosso, onde estão os clientes.
 */
export function hojeLocal(d: Date = new Date()): string {
  if (typeof window !== "undefined") {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Cuiaba" }).format(d);
}
