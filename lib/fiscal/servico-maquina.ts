export type CentroServico = { id: string; nome: string; parent_id?: string | null; manutencao_maquinas?: boolean | null };
/** Reutiliza a marcação de manutenção da NF de produtos, inclusive nos filhos do centro Máquinas. */
export function centroServicoMaquinas(id: string, centros: CentroServico[]): boolean {
  const vistos = new Set<string>();
  let atual = centros.find(c => c.id === id);
  while (atual && !vistos.has(atual.id)) {
    vistos.add(atual.id);
    const nome = atual.nome.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
    if (atual.manutencao_maquinas || /\b(maquinas?|maquinarios?)\b/.test(nome)) return true;
    atual = centros.find(c => c.id === atual?.parent_id);
  }
  return false;
}
export function rotuloPatrimonioServico(m: { nome: string; patrimonio?: string | null; placa?: string | null }): string {
  return [m.patrimonio ? `Patrimônio ${m.patrimonio}` : "Sem nº de patrimônio", m.nome, m.placa].filter(Boolean).join(" · ");
}
