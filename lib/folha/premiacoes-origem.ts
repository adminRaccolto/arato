export type OrigemPremiacao = "funcionarios_premiacoes" | "funcionario_premiacoes";
/** O mês descrito no título é uma indicação de leitura, não autorização para alterar a competência. */
export function competenciaDoSalario(descricao?: string | null): string | null {
  const meses = ["JAN", "FEV", "MAR", "ABR", "MAI", "JUN", "JUL", "AGO", "SET", "OUT", "NOV", "DEZ"];
  const texto = String(descricao ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();
  const m = /^SALARIO\s+(JAN|FEV|MAR|ABR|MAI|JUN|JUL|AGO|SET|OUT|NOV|DEZ)\/(\d{4})\b/.exec(texto);
  return m ? `${m[2]}-${String(meses.indexOf(m[1]) + 1).padStart(2, "0")}` : null;
}
/** Preserva a origem para não editar a tabela errada nem gerar outro CP para um registro histórico. */
export function unificarPremiacoes<T extends { id: string; lancamento_id?: string | null }>(atuais: T[], historicas: T[]) {
  const vistas = new Set<string>(), titulos = new Set<string>();
  const resultado: (T & { origem_tabela: OrigemPremiacao })[] = [];
  for (const [lista, origem] of [[atuais, "funcionarios_premiacoes"], [historicas, "funcionario_premiacoes"]] as const) {
    for (const p of lista) {
      if (vistas.has(p.id) || (p.lancamento_id && titulos.has(p.lancamento_id))) continue;
      vistas.add(p.id);
      if (p.lancamento_id) titulos.add(p.lancamento_id);
      resultado.push({ ...p, origem_tabela: origem });
    }
  }
  return resultado;
}
