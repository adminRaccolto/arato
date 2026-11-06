import { assinaturaConferencia, financeirosControle, liquidoGravado, type ControleDados, type FolhaControle, type LinhaControle } from "./controle.ts";

export type LinhaEmpregador = {
  competencia: string;
  chave: string;
  empregador: string;
  linha?: LinhaControle;
};

/** O agrupamento usa o empregador resolvido por CPF/CNPJ, sem mudar o vínculo histórico da folha. */
export function agruparPorEmpregador<T extends LinhaEmpregador>(
  linhas: T[],
  folhas: FolhaControle[],
  empregador: (f: FolhaControle) => { chave: string; nome: string },
) {
  type Grupo = {
    id: string; chave: string; nome: string; competencia: string;
    folhas: FolhaControle[]; funcionarios: T[];
    bruto: number; complemento: number; descontos: number; liquido: number;
    encargos: number; faltantes: number; gerados: number;
  };
  const grupos = new Map<string, Grupo>();
  const obter = (chave: string, nome: string, competencia: string) => {
    const id = JSON.stringify([chave, competencia]);
    let grupo = grupos.get(id);
    if (!grupo) {
      grupo = { id, chave, nome, competencia, folhas: [], funcionarios: [], bruto: 0, complemento: 0, descontos: 0, liquido: 0, encargos: 0, faltantes: 0, gerados: 0 };
      grupos.set(id, grupo);
    }
    return grupo;
  };
  for (const f of folhas) {
    const e = empregador(f);
    obter(e.chave, e.nome, f.competencia).folhas.push(f);
  }
  for (const l of linhas) {
    const g = obter(l.chave, l.empregador, l.competencia);
    g.funcionarios.push(l);
    if (!l.linha) { g.faltantes++; continue; }
    g.gerados++;
    g.bruto += Number(l.linha.salario_bruto ?? 0);
    g.complemento += Number(l.linha.complemento_salarial ?? 0);
    g.descontos += Number(l.linha.inss_trabalhador ?? 0) + Number(l.linha.irrf ?? 0)
      + Number(l.linha.adiantamento ?? 0) + Number(l.linha.outros_descontos ?? 0);
    g.liquido += liquidoGravado(l.linha);
    g.encargos += Number(l.linha.fgts ?? 0) + Number(l.linha.inss_patronal ?? 0);
  }
  return [...grupos.values()].sort((a, b) => b.competencia.localeCompare(a.competencia) || a.nome.localeCompare(b.nome));
}

/** Só revisa o conjunto completo que foi exibido, nunca uma versão antiga ou uma seleção parcial. */
export function prepararConferenciaEmLote(dados: ControleDados, folhaIds: string[], versoes: unknown) {
  const ids = new Set(folhaIds);
  const folhas = dados.folhas.filter(f => ids.has(f.id));
  const linhas = dados.linhas.filter(l => ids.has(l.folha_id));
  if (!ids.size || folhas.length !== ids.size || !linhas.length)
    throw new Error("Folhas ou funcionários não encontrados. Atualize os dados.");
  if (!Array.isArray(versoes) || versoes.length !== linhas.length)
    throw new Error("A composição da folha mudou. Atualize os dados e confira novamente.");
  const assinaturas = new Map<string, string>();
  for (const v of versoes) {
    if (!v || typeof v !== "object" || typeof v.linha_id !== "string" || typeof v.assinatura !== "string" || assinaturas.has(v.linha_id))
      throw new Error("Conferência inválida. Atualize os dados e confira novamente.");
    assinaturas.set(v.linha_id, v.assinatura);
  }
  const financeiros = financeirosControle(dados);
  return linhas.map(l => {
    const assinatura = assinaturaConferencia(l, dados, financeiros);
    if (assinaturas.get(l.id) !== assinatura)
      throw new Error("Os valores da folha mudaram. Atualize os dados e confira novamente.");
    return { fazenda_id: folhas.find(f => f.id === l.folha_id)!.fazenda_id,
      folha_id: l.folha_id, linha_id: l.id, funcionario_id: l.funcionario_id, assinatura };
  });
}
