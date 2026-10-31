// Busca todas as linhas de uma consulta, de 1.000 em 1.000 (limite padrão do Supabase).
// A consulta montada precisa ter .order("id") (ou outra ordem única), senão páginas repetem/pulam linhas.
export async function buscarPaginado<T>(
  montar: (de: number, ate: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
  pagina = 1000,
): Promise<T[]> {
  let todas: T[] = [];
  for (let de = 0; ; de += pagina) {
    const { data, error } = await montar(de, de + pagina - 1);
    if (error) throw error;
    todas = todas.concat(data ?? []);
    if (!data || data.length < pagina) return todas;
  }
}
