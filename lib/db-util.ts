/**
 * Exclusão/gravação que NÃO engole erro.
 *
 * Padrão antigo: `await supabase.from("x").delete().eq(...)` — se o banco recusava (chave estrangeira, título já
 * baixado/conciliado, RLS, tabela fora do ar), o erro era descartado e o fluxo seguia como se tivesse dado certo:
 * apagava-se "o antigo" sem apagar e criava-se "o novo" ao lado (títulos duplicados, itens repetidos). Aqui o erro
 * interrompe o fluxo com uma mensagem que diz o que falhou. Tabela inexistente (migration ainda não rodada) segue
 * tolerada, como antes.
 */
type Resultado = { error: { message: string; code?: string } | null };
const TOLERADOS = new Set(["42P01", "PGRST205", "PGRST204", "42703"]);

export async function falharSeErro<T extends Resultado>(consulta: PromiseLike<T>, contexto: string): Promise<T> {
  const r = await consulta;
  if (r.error && !TOLERADOS.has(r.error.code ?? "")) {
    throw new Error(`${contexto}: ${r.error.message}`);
  }
  return r;
}
