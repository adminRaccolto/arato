// Conta bancária gravada no título (lancamentos.conta_bancaria). O padrão é o ID da conta, mas telas antigas (Tesouraria
// até 18/11/2026, títulos copiados de títulos antigos) gravaram o NOME — 2.229 títulos em 16 fazendas nessa data.
// Comparar o nome com o ID da conta do extrato fazia a Conciliação Bancária acusar "baixado em outra conta".

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const norm = (t: unknown) => String(t ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/\s+/g, " ").trim();

export type ContaMin = { id: string; nome?: string | null; banco?: string | null; agencia?: string | null; conta?: string | null };

/** Rótulo usado pela Tesouraria quando a conta não tem nome (banco + agência + conta). */
const rotulo = (c: ContaMin) => c.nome || `${c.banco ?? ""} ${c.agencia ? `Ag. ${c.agencia}` : ""} ${c.conta ? `C/C ${c.conta}` : ""}`.trim();

/**
 * ID da conta do título: o próprio ID; ou a única conta do cliente com esse nome/rótulo. Nome ambíguo (duas contas com
 * o mesmo nome) ou que não bate com nenhuma conta volta null — não dá para saber a conta, e quem chama não deve acusar
 * divergência.
 */
export function idDaContaDoTitulo(valor: string | null | undefined, contas: ContaMin[]): string | null {
  const v = String(valor ?? "").trim();
  if (!v) return null;
  if (UUID.test(v)) return v;
  const alvo = norm(v);
  const achadas = contas.filter(c => norm(c.nome) === alvo || norm(rotulo(c)) === alvo);
  return achadas.length === 1 ? achadas[0].id : null;
}
