// Empregador da folha pelo CNPJ/CPF, e não pelo cadastro.
//
// Achado de 05/11/2026 (Grupo Ogliari): a mesma empresa estava cadastrada como Produtor PJ e como Empresa, e algumas
// empresas duas vezes. A folha separava os funcionários pelo registro (empresa, senão produtor), então o mesmo CNPJ
// gerava duas ou três folhas no mês, e a folha "do produtor" saía sem INSS patronal. Aqui o empregador é o documento:
// cadastros com o mesmo CNPJ/CPF caem na mesma folha, e havendo uma Empresa com aquele CNPJ, ela é o empregador.

export type CadastroDoc = { id: string; cpf_cnpj?: string | null };
export type VinculoFuncionario = { empresa_id?: string | null; produtor_id?: string | null };
export type EmpregadorResolvido = { empresa_id: string | null; produtor_id: string | null; chave: string };

export const soDigitos = (v: unknown) => String(v ?? "").replace(/\D/g, "");

/**
 * Devolve uma função que resolve o empregador de um funcionário (ou de uma folha).
 * Empresas repetidas com o mesmo CNPJ viram uma só: a que tem mais funcionários vinculados (empate: menor id).
 * `chave` identifica o empregador: "doc:<CNPJ/CPF>", ou o registro quando o cadastro não tem documento.
 */
export function criarResolvedorEmpregador(empresas: CadastroDoc[], produtores: CadastroDoc[], vinculos: VinculoFuncionario[] = []) {
  const docEmpresa = new Map(empresas.map(e => [e.id, soDigitos(e.cpf_cnpj)]));
  const docProdutor = new Map(produtores.map(p => [p.id, soDigitos(p.cpf_cnpj)]));
  const uso = new Map<string, number>();
  for (const v of vinculos) if (v.empresa_id) uso.set(v.empresa_id, (uso.get(v.empresa_id) ?? 0) + 1);
  const empresaDoDoc = new Map<string, string>();
  for (const e of [...empresas].sort((a, b) => (uso.get(b.id) ?? 0) - (uso.get(a.id) ?? 0) || a.id.localeCompare(b.id))) {
    const d = docEmpresa.get(e.id);
    if (d && !empresaDoDoc.has(d)) empresaDoDoc.set(d, e.id);
  }

  return (v: VinculoFuncionario): EmpregadorResolvido => {
    const produtor_id = v.produtor_id ?? null;
    if (v.empresa_id) {
      const d = docEmpresa.get(v.empresa_id);
      return d
        ? { empresa_id: empresaDoDoc.get(d) ?? v.empresa_id, produtor_id, chave: `doc:${d}` }
        : { empresa_id: v.empresa_id, produtor_id, chave: `emp:${v.empresa_id}` };
    }
    if (produtor_id) {
      const d = docProdutor.get(produtor_id);
      if (!d) return { empresa_id: null, produtor_id, chave: `prod:${produtor_id}` };
      return { empresa_id: empresaDoDoc.get(d) ?? null, produtor_id, chave: `doc:${d}` };
    }
    return { empresa_id: null, produtor_id: null, chave: "" };
  };
}

export type FuncionarioAtivo = { id: string; ativo?: boolean | null; data_admissao?: string | null; data_demissao?: string | null };

export const mesAnterior = (comp: string) => {
  const [a, m] = comp.split("-").map(Number);
  return m === 1 ? `${a - 1}-12` : `${a}-${String(m - 1).padStart(2, "0")}`;
};

/**
 * Funcionários ativos que ficaram fora da folha do mês: estavam na folha do mês anterior, ou foram admitidos no mês
 * anterior ou neste. Quem nunca entrou em folha (sócio, pró-labore) não gera aviso. Demitido antes do mês fica de fora.
 */
export function funcionariosSemFolha(comp: string, ativos: FuncionarioAtivo[], naFolhaDoMes: Set<string>, naFolhaAnterior: Set<string>) {
  const inicio = `${comp}-01`, fimMes = `${comp}-31`, inicioAnterior = `${mesAnterior(comp)}-01`;
  return ativos.filter(f => {
    if (f.ativo === false || naFolhaDoMes.has(f.id)) return false;
    if (f.data_admissao && f.data_admissao > fimMes) return false;
    if (f.data_demissao && f.data_demissao < inicio) return false;
    return naFolhaAnterior.has(f.id) || (!!f.data_admissao && f.data_admissao >= inicioAnterior);
  });
}
