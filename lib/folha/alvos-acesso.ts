// Quais registros cada operação de /api/folha/salvar toca, para conferir se são do cliente de quem pede.
// Operação fora desta lista é recusada: operação nova precisa declarar aqui o que toca.

export type AlvosFolha = {
  fazendas: string[]; folhas: string[]; adiantamentos: string[]; premiacoes: string[];
  funcionarios: string[]; empresas: string[]; produtores: string[];
};

type P = Record<string, unknown>;
const ids = (...v: unknown[]) => [...new Set(v.flat().filter((x): x is string => typeof x === "string" && !!x))];
const linhas = (p: P) => (Array.isArray(p.rows) ? p.rows : []) as P[];

export function alvosFolha(operacao: string, p: P): AlvosFolha | null {
  const a: AlvosFolha = { fazendas: [], folhas: [], adiantamentos: [], premiacoes: [], funcionarios: [], empresas: [], produtores: [] };
  switch (operacao) {
    case "listar_folhas":
    case "listar_adi_prem":
    case "listar_controle":
      a.fazendas = ids(p.fazenda_id, p.fazenda_ids); break;
    case "upsert_folha":
      a.fazendas = ids(p.fazenda_id); a.empresas = ids(p.empresa_id); a.produtores = ids(p.produtor_id); break;
    case "conferir_funcionario":
      a.folhas = ids(p.folha_id); a.fazendas = ids(p.fazenda_ids); break;
    case "conferir_folhas":
      a.folhas = ids(p.folha_ids); a.fazendas = ids(p.fazenda_ids); break;
    case "update_folha":
    case "fechar_folha":
    case "reabrir_folha":
    case "delete_folha":
      a.folhas = ids(p.id); a.fazendas = ids(p.fazenda_id); break;
    case "reprocessar_folha":
      a.folhas = ids(p.id); a.funcionarios = ids(linhas(p).map(r => r.funcionario_id)); break;
    case "delete_funcionarios":
    case "listar_funcionarios_folha":
      a.folhas = ids(p.folha_id); break;
    case "insert_funcionarios":
      a.folhas = ids(linhas(p).map(r => r.folha_id)); a.funcionarios = ids(linhas(p).map(r => r.funcionario_id)); break;
    case "salvar_adiantamento":
    case "salvar_premiacao":
      a.fazendas = ids(p.fazenda_id); a.funcionarios = ids(p.funcionario_id); break;
    case "editar_adiantamento":
    case "corrigir_adiantamento":
      a.adiantamentos = ids(p.id); a.funcionarios = ids(p.funcionario_id); break;
    case "cancelar_adiantamento":
      a.adiantamentos = ids(p.id); break;
    case "editar_premiacao":
      a.premiacoes = ids(p.id); a.funcionarios = ids(p.funcionario_id); break;
    case "excluir_premiacao":
    case "lancar_premiacao_cp":
      a.premiacoes = ids(p.id); break;
    default:
      return null;
  }
  return a;
}
