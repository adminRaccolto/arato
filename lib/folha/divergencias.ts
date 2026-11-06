export type CadastroAusencia = {
  id: string; fazenda_id: string; empresa_id?: string | null; produtor_id?: string | null;
  ativo?: boolean | null; data_admissao?: string | null; data_demissao?: string | null;
};
export type DecisaoDivergencia = {
  id: string; fazenda_id: string; funcionario_id: string | null; funcionario_nome: string;
  competencia: string; assinatura: string; acao: "confirmar_fora" | "reabrir";
  motivo: string; usuario_nome: string; created_at: string;
};
/** Uma confirmação vale somente para a competência e o vínculo cadastral revisados. */
export function assinaturaAusencia(competencia: string, f: CadastroAusencia): string {
  return JSON.stringify([competencia, f.id, f.fazenda_id, f.empresa_id || null, f.produtor_id || null,
    f.ativo !== false, f.data_admissao || null, f.data_demissao || null]);
}
export function confirmacaoAusencia(competencia: string, f: CadastroAusencia, decisoes: DecisaoDivergencia[]): DecisaoDivergencia | undefined {
  const assinatura = assinaturaAusencia(competencia, f);
  const ultima = decisoes.filter(d => d.funcionario_id === f.id && d.competencia === competencia && d.assinatura === assinatura)
    .sort((a,b) => b.created_at.localeCompare(a.created_at) || b.id.localeCompare(a.id))[0];
  return ultima?.acao === "confirmar_fora" ? ultima : undefined;
}
export function validarDecisaoAusencia(p: { competencia: unknown; acao: unknown; motivo: unknown }): string | null {
  if (typeof p.competencia !== "string" || !/^\d{4}-(0[1-9]|1[0-2])$/.test(p.competencia)) return "Informe uma competência válida.";
  if (p.acao !== "confirmar_fora" && p.acao !== "reabrir") return "Ação inválida.";
  if (p.acao === "confirmar_fora" && (typeof p.motivo !== "string" || p.motivo.trim().length < 3)) return "Informe o motivo para manter o funcionário fora da folha.";
  if (typeof p.motivo === "string" && p.motivo.length > 1000) return "O motivo deve ter no máximo 1.000 caracteres.";
  return null;
}
