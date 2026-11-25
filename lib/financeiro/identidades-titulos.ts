import type { SupabaseClient } from "@supabase/supabase-js";

type Linha = Record<string, unknown>;
type Titulo = { id: string; origem_tabela: string; fazenda_id?: string | null };
export type IdentidadeTitulo = {
  produtor_id: string | null; produtor_nome: string | null;
  empresa_id: string | null; empresa_nome: string | null;
  pessoa_id: string | null; pessoa_nome: string | null;
};
const texto = (v: unknown) => typeof v === "string" && v.trim() ? v.trim() : null;
const chave = (tabela: string, id: unknown) => `${tabela}:${id}`;
const unicos = (valores: unknown[]) => [...new Set(valores.map(texto).filter((v): v is string => !!v))];

/** Leituras em blocos e com paginação: nenhum título é consultado individualmente. */
async function ler(db: SupabaseClient, tabela: string, campos: string, coluna: string, valores: unknown[]): Promise<Linha[]> {
  const ids = unicos(valores), tarefas: (() => Promise<Linha[]>)[] = [];
  for (let i = 0; i < ids.length; i += 150) tarefas.push(async () => {
    const resultado: Linha[] = [];
    for (let de = 0; ; de += 1000) {
      const { data, error } = await db.from(tabela).select(campos).in(coluna, ids.slice(i, i + 150)).order("id").range(de, de + 999);
      if (error) throw new Error(`Não foi possível conferir produtor e fornecedor (${tabela}): ${error.message}`);
      resultado.push(...(data ?? []) as unknown as Linha[]);
      if (!data || data.length < 1000) return resultado;
    }
  });
  const resultado: Linha[] = [];
  for (let i = 0; i < tarefas.length; i += 6) resultado.push(...(await Promise.all(tarefas.slice(i, i + 6).map(t => t()))).flat());
  return resultado;
}

/**
 * O espelho rel_lancamentos não é a fonte dos vínculos: origens podem mudar sem
 * atualizar o título. Lê o título atual e, só para campos ausentes, sua origem
 * inequívoca. Não grava dados, não infere pelo nome/descrição nem pelo dono da fazenda.
 */
export async function carregarIdentidadesTitulos<T extends Titulo>(db: SupabaseClient, titulos: T[]): Promise<(T & IdentidadeTitulo)[]> {
  if (!titulos.length) return [];
  const fontes = new Map<string, Linha>();
  for (const tabela of ["lancamentos", "empresa_lancamentos"]) {
    const campos = tabela === "lancamentos"
      ? "id,fazenda_id,tipo,produtor_id,empresa_id,pessoa_id,nf_entrada_id,contrato_financeiro_id,contrato_id,consorcio_id,pedido_compra_id,previsao_gasto_id,numero_documento,origem_lancamento,funcionario_id,titulo_origem_id"
      : "id,fazenda_id,tipo,empresa_id,pessoa_id,nf_entrada_id,numero_documento,origem,titulo_origem_id";
    let ids = titulos.filter(t => t.origem_tabela === tabela).map(t => t.id);
    // Partes de pagamentos preservam os vínculos da família. Ciclos são interrompidos pelo conjunto de visitados.
    for (let nivel = 0; ids.length; nivel++) {
      if (nivel >= 32) throw new Error("Família de títulos inconsistente ao conferir produtor e fornecedor.");
      const rows = await ler(db, tabela, campos, "id", ids);
      for (const r of rows) fontes.set(chave(tabela, r.id), r);
      ids = unicos(rows.map(r => r.titulo_origem_id)).filter(id => !fontes.has(chave(tabela, id)) && !ids.includes(id));
    }
  }
  const todas = [...fontes.values()];
  const [fazendas, nfs, servicos, contratos, comerciais, consorcios, premios, apolices, pedidos, previsoes, folhas] = await Promise.all([
    ler(db, "fazendas", "id,conta_id", "id", [...titulos.map(t => t.fazenda_id), ...todas.map(t => t.fazenda_id)]),
    ler(db, "nf_entradas", "id,fazenda_id,produtor_id,pessoa_id,emitente_nome", "id", todas.map(t => t.nf_entrada_id)),
    ler(db, "nf_servicos", "id,fazenda_id,lancamento_id,empresa_id,tomador_id,tomador_tipo,prestador_id,prestador_nome", "lancamento_id", todas.filter(t => (t.origem_lancamento ?? t.origem) === "nf_servico").map(t => t.id)),
    ler(db, "contratos_financeiros", "id,fazenda_id,produtor_id,pessoa_id,credor", "id", todas.map(t => t.contrato_financeiro_id)),
    ler(db, "contratos", "id,fazenda_id,produtor_id,pessoa_id", "id", todas.map(t => t.contrato_id)),
    ler(db, "consorcios", "id,fazenda_id,produtor_id,administradora_pessoa_id,administradora", "id", todas.map(t => t.consorcio_id)),
    ler(db, "pagamentos_premio_seguro", "id,apolice_id,lancamento_id", "lancamento_id", todas.filter(t => t.origem_lancamento === "seguro").map(t => t.id)),
    // * permite ler apólices antigas sem exigir as colunas opcionais das Seções 404/405.
    ler(db, "apolices_seguro", "*", "numero_apolice", todas.filter(t => t.origem_lancamento === "seguro").map(t => t.numero_documento)),
    ler(db, "pedidos_compra", "id,fazenda_id,fornecedor_id", "id", todas.map(t => t.pedido_compra_id)),
    ler(db, "previsoes_gasto", "id,fazenda_id,produtor_id,empresa_id,pessoa_id", "id", todas.map(t => t.previsao_gasto_id)),
    ler(db, "folha_funcionarios", "id,folha_id,cp_lancamento_id,funcionario_id,produtor_id,nome_funcionario", "cp_lancamento_id", todas.filter(t => t.origem_lancamento === "folha").map(t => t.id)),
  ]);
  const porId = (rows: Linha[]) => new Map(rows.map(r => [texto(r.id), r]));
  const apolPorId = porId(apolices);
  const faltantes = await ler(db, "apolices_seguro", "*", "id", premios.map(p => p.apolice_id).filter(id => !apolPorId.has(texto(id))));
  apolices.push(...faltantes);
  const [funcionarios, folhasCab] = await Promise.all([
    ler(db, "funcionarios", "id,fazenda_id,nome,produtor_id,empresa_id", "id", [...todas.map(t => t.funcionario_id), ...folhas.map(f => f.funcionario_id)]),
    ler(db, "folha_pagamento", "id,fazenda_id,produtor_id,empresa_id", "id", folhas.map(f => f.folha_id)),
  ]);
  const referencias = [...nfs, ...servicos, ...contratos, ...comerciais, ...consorcios, ...apolices, ...pedidos, ...previsoes, ...funcionarios, ...folhasCab];
  const [produtores, empresas, pessoas, demaisFazendas] = await Promise.all([
    ler(db, "produtores", "id,nome,fazenda_id,conta_id", "id", [...todas, ...referencias, ...folhas].flatMap(r => [r.produtor_id, r.tomador_tipo === "produtor" ? r.tomador_id : null])),
    ler(db, "empresas", "id,nome,fazenda_id,conta_id", "id", [...todas, ...referencias].flatMap(r => [r.empresa_id, r.tomador_tipo === "empresa" ? r.tomador_id : null])),
    ler(db, "pessoas", "id,nome,fazenda_id,conta_id", "id", [...todas, ...referencias].flatMap(r => [r.pessoa_id, r.prestador_id, r.administradora_pessoa_id, r.seguradora_pessoa_id, r.fornecedor_id])),
    ler(db, "fazendas", "id,conta_id", "id", referencias.map(r => r.fazenda_id)),
  ]);
  const faz = porId([...fazendas, ...demaisFazendas]);
  const fazCadastros = await ler(db, "fazendas", "id,conta_id", "id", [...produtores, ...empresas, ...pessoas].map(r => r.fazenda_id).filter(id => !faz.has(texto(id))));
  for (const f of fazCadastros) faz.set(texto(f.id), f);
  const mesmoCliente = (r: Linha, fazenda: unknown) => {
    const f = texto(fazenda), rf = texto(r.fazenda_id);
    if (!f) return false;
    const conta = texto(faz.get(f)?.conta_id), outra = texto(r.conta_id) ?? texto(faz.get(rf)?.conta_id);
    return conta && outra ? conta === outra : f === rf;
  };
  const unico = (rows: Linha[]) => rows.length === 1 ? rows[0] : undefined;
  const [mNf, mCf, mContrato, mCons, mPed, mPrev, mFunc, mFolha, mApol, mProd, mEmp, mPessoa] =
    [nfs, contratos, comerciais, consorcios, pedidos, previsoes, funcionarios, folhasCab, apolices, produtores, empresas, pessoas].map(porId);
  const resolvidas = new Map<string, IdentidadeTitulo>();
  const espelho = new Map(titulos.map(t => [chave(t.origem_tabela, t.id), t as T & Partial<IdentidadeTitulo>]));
  function resolver(tabela: string, id: string, visitados = new Set<string>()): IdentidadeTitulo | null {
    const k = chave(tabela, id), l = fontes.get(k);
    if (!l || visitados.has(k)) return null;
    if (resolvidas.has(k)) return resolvidas.get(k)!;
    visitados.add(k);
    const origem = l.origem_lancamento ?? l.origem;
    const servico = unico(servicos.filter(s => s.lancamento_id === id && mesmoCliente(s, l.fazenda_id)
      && (tabela === "empresa_lancamentos" ? !!s.empresa_id : !s.empresa_id)));
    const folha = tabela === "lancamentos" ? unico(folhas.filter(f => f.cp_lancamento_id === id)) : undefined;
    const folhaCab = folha && mFolha.get(texto(folha.folha_id));
    const folhaLinha: Linha | undefined = folha && folhaCab && mesmoCliente(folhaCab, l.fazenda_id) ? { ...folha, fazenda_id: folhaCab.fazenda_id } : undefined;
    const funcionario = mFunc.get(texto(l.funcionario_id ?? folha?.funcionario_id));
    const apoliceVinculada = unico(premios.filter(p => p.lancamento_id === id));
    const apolice = origem === "seguro" ? (apoliceVinculada ? mApol.get(texto(apoliceVinculada.apolice_id))
      : unico(apolices.filter(a => a.numero_apolice === l.numero_documento && a.fazenda_id === l.fazenda_id))) : undefined;
    const candidatos = [mNf.get(texto(l.nf_entrada_id)), servico, mCf.get(texto(l.contrato_financeiro_id)),
      mContrato.get(texto(l.contrato_id)), mCons.get(texto(l.consorcio_id)), apolice, mPed.get(texto(l.pedido_compra_id)),
      mPrev.get(texto(l.previsao_gasto_id)), folhaLinha, folhaCab, funcionario]
      .filter((r): r is Linha => !!r && mesmoCliente(r, l.fazenda_id));
    const antigo = texto(l.titulo_origem_id);
    const pai = antigo && fontes.get(chave(tabela, antigo));
    const herdada = pai && mesmoCliente(pai, l.fazenda_id) ? resolver(tabela, antigo!, visitados) : null;
    const obter = (campo: string) => texto(l[campo]) ?? candidatos.map(r => texto(r[campo])).find(Boolean) ?? null;
    const produtor = obter("produtor_id") ?? (servico?.tomador_tipo === "produtor" ? texto(servico.tomador_id) : null) ?? herdada?.produtor_id ?? null;
    const empresa = obter("empresa_id") ?? (servico?.tomador_tipo === "empresa" ? texto(servico.tomador_id) : null) ?? herdada?.empresa_id ?? null;
    const pessoa = texto(l.pessoa_id) ?? candidatos.map(r => texto(r.pessoa_id ?? r.prestador_id ?? r.administradora_pessoa_id ?? r.seguradora_pessoa_id ?? r.fornecedor_id)).find(Boolean) ?? herdada?.pessoa_id ?? null;
    const nome = (mapa: Map<string | null, Linha>, ref: string | null) => {
      const r = mapa.get(ref); return r && mesmoCliente(r, l.fazenda_id) ? texto(r.nome) : null;
    };
    const pessoaNome = nome(mPessoa, pessoa);
    const resultado: IdentidadeTitulo = {
      produtor_id: produtor, produtor_nome: nome(mProd, produtor),
      empresa_id: empresa, empresa_nome: nome(mEmp, empresa),
      pessoa_id: pessoa, pessoa_nome: pessoaNome ?? (!pessoa ? candidatos.map(r => texto(r.emitente_nome ?? r.prestador_nome ?? r.administradora ?? r.seguradora ?? r.credor)).find(Boolean)
        ?? (funcionario && mesmoCliente(funcionario, l.fazenda_id) ? texto(funcionario.nome) : null)
        ?? (folhaLinha ? texto(folhaLinha.nome_funcionario) : null)
        ?? herdada?.pessoa_nome
        // Nomes calculados pelo espelho (ex.: taxa bancária) não têm pessoa_id.
        ?? (!texto(espelho.get(k)?.pessoa_id) ? texto(espelho.get(k)?.pessoa_nome) : null) : null),
    };
    resolvidas.set(k, resultado);
    return resultado;
  }
  return titulos.map(t => {
    const l = fontes.get(chave(t.origem_tabela, t.id));
    const identidade = resolver(t.origem_tabela, t.id);
    // Não troca o cliente de uma linha nem mistura PF/PJ com o mesmo UUID.
    return identidade && l && (!t.fazenda_id || mesmoCliente(l, t.fazenda_id)) ? { ...t, ...identidade } : { ...t } as T & IdentidadeTitulo;
  });
}
