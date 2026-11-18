import type { SupabaseClient } from "@supabase/supabase-js";
import { buscarPaginado } from "../buscar-paginado";
import {
  entraNoCusto,
  ehCompraDeInsumo,
  ehPrevisaoAberta,
} from "../custos/titulos-custo";
import { valorDoContrato } from "../contratos/aditivos";
import {
  centavos,
  classificacaoSemResultado,
  emReais,
  grupoCategoria,
  numero,
  ratearResultados,
  type CicloResultado,
  type ItemResultado,
  type PendenciaResultado,
  type RegraResultado,
} from "./apuracao";

type Registro = Record<string, unknown>;
// Evita trazer XMLs, arquivos e cadastros inteiros nas referências volumosas.
const CAMPOS: Record<string, string> = {
  fazendas: "id,nome",
  anos_safra: "id,descricao,data_inicio,data_fim",
  nf_entradas: "id,status,valor_total",
  nf_servicos:
    "id,fazenda_id,numero_nf,prestador_id,prestador_nome,empresa_id,lancamento_id",
  insumos: "id,nome,categoria,grupo_id,subgrupo",
  operacoes_gerenciais: "id,classificacao,escopo_cc",
};
const texto = (r: Registro, k: string) => (r[k] == null ? "" : String(r[k]));
const chunks = <T>(a: T[], n = 150) =>
  Array.from({ length: Math.ceil(a.length / n) }, (_, i) =>
    a.slice(i * n, i * n + n),
  );
export type ReferenciasResultado = {
  fazendas: { id: string; nome: string }[];
  anos: {
    id: string;
    descricao: string;
    data_inicio?: string;
    data_fim?: string;
  }[];
  ciclos: CicloResultado[];
};
export type ResultadoAgricola = {
  itens: ItemResultado[];
  avisos: PendenciaResultado[];
  ciclos: CicloResultado[];
  producao: Record<
    string,
    {
      area: number;
      sacas: number;
      areaColhida: number;
      precoOrcado: number | null;
      produtividadeOrcada: number | null;
    }
  >;
  inicio: string;
  fim: string;
};
export type BaseReceita = "financeiro" | "contratada" | "estimada";

/** Toda consulta é paginada e falha por inteiro: erro de origem não se transforma em zero. */
export function repositorioResultados(db: SupabaseClient) {
  return async (
    tabela: string,
    configurar: (
      q: ReturnType<ReturnType<SupabaseClient["from"]>["select"]>,
    ) => ReturnType<ReturnType<SupabaseClient["from"]>["select"]>,
  ) => {
    try {
      return await buscarPaginado<Registro>((de, ate) =>
        configurar(db.from(tabela).select(CAMPOS[tabela] ?? "*"))
          .order("id")
          .range(de, ate)
          .returns<Registro[]>(),
      );
    } catch (e) {
      throw new Error(
        `Não foi possível carregar ${tabela}: ${e instanceof Error ? e.message : String((e as { message?: string })?.message ?? e)}`,
      );
    }
  };
}
export async function carregarReferenciasResultados(
  db: SupabaseClient,
  fazendaIds: string[],
  contaId: string | null,
): Promise<ReferenciasResultado> {
  if (!fazendaIds.length) return { fazendas: [], anos: [], ciclos: [] };
  const ler = repositorioResultados(db);
  const [fazendas, anos, ciclos] = await Promise.all([
    ler("fazendas", (q) => q.in("id", fazendaIds)),
    ler("anos_safra", (q) =>
      contaId ? q.eq("conta_id", contaId) : q.in("fazenda_id", fazendaIds),
    ),
    ler("ciclos", (q) => q.in("fazenda_id", fazendaIds)),
  ]);
  return {
    fazendas: fazendas as ReferenciasResultado["fazendas"],
    anos: anos as ReferenciasResultado["anos"],
    ciclos: ciclos as CicloResultado[],
  };
}

/** Mesma base para DRE, margens, custo/ha, custos totais e produtividade. Não altera registros. */
export async function carregarResultadoAgricola(
  db: SupabaseClient,
  p: {
    referencias: ReferenciasResultado;
    fazendaIds: string[];
    contaId: string | null;
    anoLabel: string;
    receita: BaseReceita;
  },
): Promise<ResultadoAgricola> {
  const { referencias: ref } = p,
    anos = ref.anos.filter((a) => a.descricao === p.anoLabel),
    anoIds = anos.map((a) => a.id);
  const inicio = anos
    .map((a) => a.data_inicio)
    .filter((d): d is string => !!d)
    .sort()[0];
  const fim = anos
    .map((a) => a.data_fim)
    .filter((d): d is string => !!d)
    .sort()
    .at(-1);
  if (!inicio || !fim)
    throw new Error(
      "Cadastre as datas de início e fim do ano safra para gerar o relatório.",
    );
  const ciclos = ref.ciclos
    .filter((c) => anoIds.includes(c.ano_safra_id))
    .map((c) => ({ ...c }));
  const fids = ref.fazendas.map((f) => f.id); // universo do cliente: rateio não é redistribuído ao esconder uma coluna
  if (!fids.length || !anoIds.length)
    throw new Error("Selecione um ano safra e uma fazenda.");
  const ler = repositorioResultados(db);
  type Consulta = Parameters<typeof ler>[1];
  const filtroCiclos = ciclos.length
    ? `ciclo_id.in.(${ciclos.map((c) => c.id).join(",")}),`
    : "";
  const porAno: Consulta = (q) =>
    q
      .in("fazenda_id", fids)
      .or(
        `${filtroCiclos}ano_safra_id.in.(${anoIds.join(",")}),and(ano_safra_id.is.null,data_vencimento.gte.${inicio},data_vencimento.lte.${fim})`,
      );
  const porCiclo: Consulta = (q) =>
    q
      .in("fazenda_id", fids)
      .in(
        "ciclo_id",
        ciclos.length
          ? ciclos.map((c) => c.id)
          : ["00000000-0000-0000-0000-000000000000"],
      );
  const [
    prod,
    emp,
    plantios,
    pulverizacoes,
    adubacoes,
    correcoes,
    colheitas,
    orcamentos,
    contratos,
    abastecimentos,
    manutencoes,
    folhas,
    arrendamentos,
    apoio,
    regras,
    globais,
    centros,
    movimentos,
  ] = await Promise.all([
    ler("lancamentos", porAno),
    // A empresa só integra o resultado agrícola com safra/ciclo explicitamente classificado.
    ler("empresa_lancamentos", (q) =>
      q
        .in("fazenda_id", fids)
        .or(`${filtroCiclos}ano_safra_id.in.(${anoIds.join(",")})`),
    ),
    ...[
      "plantios",
      "pulverizacoes",
      "adubacoes_base",
      "correcoes_solo",
      "colheitas",
      "orcamentos",
    ].map((t) => ler(t, porCiclo)),
    ler("contratos", (q) =>
      q
        .in("fazenda_id", fids)
        .or(`${filtroCiclos}ano_safra_id.in.(${anoIds.join(",")})`),
    ),
    ler("abastecimentos", (q) =>
      q
        .in("fazenda_id", fids)
        .or(
          `${filtroCiclos}ano_safra_id.in.(${anoIds.join(",")}),and(ano_safra_id.is.null,data.gte.${inicio},data.lte.${fim})`,
        ),
    ),
    ler("historico_manutencao", (q) =>
      q.in("fazenda_id", fids).gte("data", inicio).lte("data", fim),
    ),
    ler("folha_pagamento", (q) =>
      q
        .in("fazenda_id", fids)
        .in("status", ["fechado", "pago"])
        .gte("competencia", inicio.slice(0, 7))
        .lte("competencia", fim.slice(0, 7)),
    ),
    ler("arrendamento_pagamentos", (q) =>
      q.in("fazenda_id", fids).in("ano_safra_id", anoIds),
    ),
    ler("apoio_lancamentos", porCiclo),
    ler("regras_rateio", (q) =>
      q.in("fazenda_id", fids).in("ano_safra_id", anoIds),
    ),
    p.contaId
      ? ler("regras_rateio_global", (q) =>
          q.eq("conta_id", p.contaId).eq("ano_safra_label", p.anoLabel),
        )
      : Promise.resolve([] as Registro[]),
    ler("centros_custo", (q) => q.in("fazenda_id", fids)),
    ler("movimentacoes_estoque", (q) =>
      q
        .in("fazenda_id", fids)
        .eq("tipo", "saida")
        .in("motivo", ["baixa_uso", "baixa_perda"])
        .gte("data", inicio)
        .lte("data", fim),
    ),
  ]);
  const porIds = async (tabela: string, campo: string, ids: string[]) =>
    (
      await Promise.all(
        chunks([...new Set(ids.filter(Boolean))]).map((lote) =>
          ler(tabela, (q) => q.in(campo, lote)),
        ),
      )
    ).flat();
  const nfIds = [...prod, ...emp]
    .map((t) => texto(t, "nf_entrada_id"))
    .filter(Boolean);
  const [funcionarios, linhas, farmsGlobais, nfItens] = await Promise.all([
    porIds(
      "folha_funcionarios",
      "folha_id",
      folhas.map((f) => texto(f, "id")),
    ),
    porIds(
      "regras_rateio_linhas",
      "regra_id",
      regras.map((r) => texto(r, "id")),
    ),
    porIds(
      "rateio_global_fazendas",
      "regra_global_id",
      globais.map((r) => texto(r, "id")),
    ),
    porIds("nf_entrada_itens", "nf_entrada_id", nfIds),
  ]);
  const [ciclosGlobais, ogs, devolucoes, insumosMov, servicosMaquina] =
    await Promise.all([
      porIds(
        "rateio_global_ciclos",
        "rateio_fazenda_id",
        farmsGlobais.map((f) => texto(f, "id")),
      ),
      porIds(
        "operacoes_gerenciais",
        "id",
        [...prod, ...emp, ...apoio, ...nfItens].map((t) =>
          texto(t, "operacao_gerencial_id"),
        ),
      ),
      porIds(
        "nf_entrada_itens",
        "origem_item_id",
        nfItens
          .filter((i) => i.tipo_apropiacao === "direto")
          .map((i) => texto(i, "id")),
      ),
      porIds(
        "insumos",
        "id",
        movimentos.map((m) => texto(m, "insumo_id")),
      ),
      porIds(
        "nf_servicos",
        "id",
        manutencoes.map((m) => texto(m, "nf_servico_id")),
      ),
    ]);
  const notasOriginais = await porIds("nf_entradas", "id", nfIds);
  const nfDevolucoes = await porIds(
    "nf_entradas",
    "id",
    devolucoes.map((d) => texto(d, "nf_entrada_id")),
  );
  const ogMap = new Map(ogs.map((o) => [texto(o, "id"), o]));
  const avisos: PendenciaResultado[] = [],
    itens: ItemResultado[] = [];
  const avisar = (r: Registro, fonte: string, descricao: string) =>
    avisos.push({ id: texto(r, "id"), fonte, descricao });
  const adicionar = (
    r: Registro,
    fonte: string,
    grupo: string,
    valor: number,
    extra: Partial<ItemResultado> = {},
  ) => {
    if (!Number.isFinite(valor)) {
      avisar(r, fonte, "Valor inválido; registro não apurado.");
      return;
    }
    const og = ogMap.get(texto(r, "operacao_gerencial_id"));
    itens.push({
      id: `${fonte}:${texto(r, "id")}:${extra.grupo ?? grupo}`,
      origem_id: texto(r, "id"),
      fonte,
      descricao: texto(r, "descricao") || texto(r, "nome_funcionario") || fonte,
      grupo,
      valor: centavos(valor),
      fazenda_id: texto(r, "fazenda_id"),
      ciclo_id: texto(r, "ciclo_id") || null,
      ano_safra_id: texto(r, "ano_safra_id") || anos[0].id,
      centro_custo_id: texto(r, "centro_custo_id") || "",
      escopo: texto(og ?? {}, "escopo_cc"),
      data: texto(r, "data_vencimento") || texto(r, "data"),
      ...extra,
    });
  };
  const convertido = (r: Registro, fonte: string) => {
    const v = emReais(r);
    if (v === null)
      avisar(
        r,
        fonte,
        "Valor ou cotação histórica ausente/inválida; registro não apurado.",
      );
    return v;
  };
  const validados = (rs: Registro[]) =>
    rs.filter((r) => r.status_campo === "aprovado");
  const producao: ResultadoAgricola["producao"] = {};
  for (const c of ciclos) {
    const cols = validados(colheitas).filter((r) => r.ciclo_id === c.id);
    const orcs = orcamentos.filter((r) => r.ciclo_id === c.id);
    const orc = orcs.length === 1 ? orcs[0] : undefined;
    if (orcs.length > 1)
      avisos.push({
        id: c.id,
        descricao:
          "Mais de um orçamento para o ciclo; estimativas não calculadas.",
      });
    let area = numero(c.area_plantada_ha);
    if (area <= 0) {
      // Replantio do mesmo talhão não multiplica a área física.
      const talhoes = new Map<string, number>();
      for (const pl of validados(plantios).filter((r) => r.ciclo_id === c.id)) {
        const tid = texto(pl, "talhao_id");
        if (tid)
          talhoes.set(tid, Math.max(talhoes.get(tid) ?? 0, numero(pl.area_ha)));
      }
      area = [...talhoes.values()].reduce((s, a) => s + a, 0);
    }
    const sacas = cols.reduce(
      (s, r) => s + numero(r.sacas_liquidas ?? r.total_sacas),
      0,
    );
    const areasColhidas = new Map<string, number>();
    for (const r of cols) {
      const chave = texto(r, "talhao_id") || c.id;
      areasColhidas.set(
        chave,
        Math.max(areasColhidas.get(chave) ?? 0, numero(r.area_ha)),
      );
    }
    const semTalhao = cols.filter(
      (r) => !r.talhao_id && numero(r.sacas_liquidas ?? r.total_sacas) > 0,
    );
    const areaColhidaConfiavel =
      semTalhao.length > 0 && cols.length > 1
        ? 0
        : [...areasColhidas.values()].reduce((s, a) => s + a, 0);
    if (semTalhao.length > 0 && cols.length > 1)
      avisos.push({
        id: c.id,
        descricao: `${c.descricao || c.cultura}: colheitas sem talhão identificado; confira a área para calcular a produtividade sem sobreposição.`,
      });
    producao[c.id] = {
      area,
      sacas,
      areaColhida: areaColhidaConfiavel,
      precoOrcado:
        orc?.preco_esperado_sc == null ? null : numero(orc.preco_esperado_sc),
      produtividadeOrcada:
        orc?.produtividade_esperada == null
          ? null
          : numero(orc.produtividade_esperada),
    };
    c.area_plantada_ha = area; // cópia local dos ciclos usada no rateio por área
    if (!area && !c.is_auxiliar)
      avisos.push({
        id: c.id,
        descricao: `${c.descricao || c.cultura}: área física não informada; indicadores por hectare indisponíveis.`,
      });
  }
  for (const [rs, fonte, grupo, campo] of [
    [plantios, "plantios", "sementes", "custo_sementes"],
    [pulverizacoes, "pulverizacoes", "defensivos", "custo_total"],
    [adubacoes, "adubacoes_base", "fertilizantes", "custo_total"],
    [correcoes, "correcoes_solo", "correcao_solo", "custo_total"],
  ] as const) {
    for (const r of validados(rs)) {
      if (r[campo] == null || !Number.isFinite(Number(r[campo])))
        avisar(
          r,
          fonte,
          "Operação aprovada sem custo histórico registrado; custo não estimado pelo preço atual.",
        );
      else adicionar(r, fonte, grupo, Number(r[campo]));
    }
  }
  const primeirosCpServico = await porIds(
    "lancamentos",
    "id",
    servicosMaquina.map((n) => texto(n, "lancamento_id")),
  );
  const idsServico = new Set(
    servicosMaquina.map((n) => texto(n, "lancamento_id")).filter(Boolean),
  );
  const agrupadoresServico = new Set(
    primeirosCpServico.map((c) => texto(c, "agrupador")).filter(Boolean),
  );
  const chavesPrestador = new Set(
    servicosMaquina
      .filter((n) => n.empresa_id && n.prestador_id)
      .map((n) =>
        JSON.stringify([
          texto(n, "empresa_id"),
          texto(n, "numero_nf"),
          texto(n, "prestador_id"),
        ]),
      ),
  );
  const chavesDescricao = new Set(
    servicosMaquina
      .filter((n) => n.empresa_id && !n.prestador_id)
      .map((n) =>
        JSON.stringify([
          texto(n, "empresa_id"),
          texto(n, "numero_nf"),
          `NFS-e ${texto(n, "numero_nf")} — ${texto(n, "prestador_nome")}`,
        ]),
      ),
  );
  const servicoJaApropriado = (r: Registro) =>
    idsServico.has(texto(r, "id")) ||
    agrupadoresServico.has(texto(r, "agrupador")) ||
    (r.origem === "nf_servico" &&
      (chavesPrestador.has(
        JSON.stringify([
          texto(r, "empresa_id"),
          texto(r, "numero_documento"),
          texto(r, "pessoa_id"),
        ]),
      ) ||
        chavesDescricao.has(
          JSON.stringify([
            texto(r, "empresa_id"),
            texto(r, "numero_documento"),
            texto(r, "descricao"),
          ]),
        )));
  const itensPorNf = new Map<string, Registro[]>();
  for (const i of nfItens) {
    const key = texto(i, "nf_entrada_id");
    const itens = itensPorNf.get(key) ?? [];
    itens.push(i);
    itensPorNf.set(key, itens);
  }
  const retornosProcessados = new Set(
    nfDevolucoes
      .filter((n) => n.status === "processada")
      .map((n) => texto(n, "id")),
  );
  const valorDevolvido = new Map<string, number>();
  for (const d of devolucoes)
    if (retornosProcessados.has(texto(d, "nf_entrada_id"))) {
      const key = texto(d, "origem_item_id");
      valorDevolvido.set(
        key,
        (valorDevolvido.get(key) ?? 0) + numero(d.valor_total),
      );
    }
  const titulosPorId = new Map(
    [...prod, ...emp].map((t) => [texto(t, "id"), t]),
  );
  const cpFolha = new Set(
    [
      ...folhas.flatMap((f) => [f.cp_fgts_id, f.cp_inss_patronal_id]),
      ...funcionarios.map((f) => f.cp_lancamento_id),
    ].filter(Boolean),
  );
  const totalNf = new Map<string, number>();
  for (const t of [...prod, ...emp])
    if (
      t.status !== "cancelado" &&
      t.natureza !== "previsao" &&
      t.tipo === "pagar" &&
      t.nf_entrada_id
    )
      totalNf.set(
        texto(t, "nf_entrada_id"),
        (totalNf.get(texto(t, "nf_entrada_id")) ?? 0) + (emReais(t) ?? 0),
      );
  for (const nf of notasOriginais)
    if (numero(nf.valor_total) > 0)
      totalNf.set(texto(nf, "id"), numero(nf.valor_total));
  for (const [rs, fonte] of [
    [prod, "lancamentos"],
    [emp, "empresa_lancamentos"],
    [apoio, "apoio_lancamentos"],
  ] as const) {
    for (const r of rs) {
      if (r.status === "cancelado") continue;
      if (
        r.natureza !== "previsao" &&
        r.origem_lancamento !== "tesouraria" &&
        ["baixado", "pago", "parcial"].includes(texto(r, "status"))
      ) {
        if (numero(r.valor_juros) + numero(r.valor_multa))
          adicionar(
            r,
            fonte,
            r.tipo === "receber" ? "receita_financeira" : "desp_financeira",
            numero(r.valor_juros) + numero(r.valor_multa),
            {
              id: `${fonte}:${r.id}:encargos`,
              descricao: `Juros e multa — ${texto(r, "descricao")}`,
            },
          );
        if (numero(r.valor_desconto))
          adicionar(
            r,
            fonte,
            r.tipo === "receber" ? "deducoes" : "descontos",
            numero(r.valor_desconto),
            {
              id: `${fonte}:${r.id}:desconto`,
              descricao: `Desconto — ${texto(r, "descricao")}`,
            },
          );
      }
      const og = ogMap.get(texto(r, "operacao_gerencial_id")),
        grupo = grupoCategoria(
          texto(r, "categoria"),
          texto(og ?? {}, "classificacao"),
        );
      const previsto = ehPrevisaoAberta(r);
      if (r.tipo === "receber") {
        if (
          p.receita !== "financeiro" ||
          r.natureza === "previsao" ||
          !entraNoCusto(r) ||
          !grupo.startsWith("receita")
        )
          continue;
        const v = convertido(r, fonte);
        if (v !== null) adicionar(r, fonte, grupo, v);
        continue;
      }
      if (r.tipo !== "pagar" || (!previsto && !entraNoCusto(r))) continue;
      if (
        r.origem_lancamento === "pedido_compra" ||
        /^(adiantamento|pagamento de (custeio|financiamento))/i.test(
          texto(r, "categoria"),
        )
      )
        continue;
      if (
        ["folha", "arrendamento", "cartao_fatura"].includes(
          texto(r, "origem_lancamento") || texto(r, "origem"),
        )
      )
        continue;
      if (
        servicoJaApropriado(r) ||
        cpFolha.has(r.id) ||
        classificacaoSemResultado(texto(og ?? {}, "classificacao"))
      )
        continue;
      if (grupo === "outros")
        avisar(
          r,
          fonte,
          `Classificação não reconhecida: ${texto(r, "descricao") || texto(r, "categoria")}. Valor apresentado em Custos sem classificação.`,
        );
      if (
        grupo === "cpv_rh_faz" &&
        folhas.length &&
        fonte !== "apoio_lancamentos"
      )
        avisar(
          r,
          fonte,
          `Lançamento de pessoal fora dos títulos vinculados à folha: confira eventual duplicidade — ${texto(r, "descricao")}.`,
        );
      const valor = convertido(r, fonte);
      if (valor === null) continue;
      if (previsto) {
        adicionar(r, fonte, grupo, valor, { previsto: true });
        continue;
      }
      const is = itensPorNf.get(texto(r, "nf_entrada_id")) ?? [];
      if (is.length) {
        const soma = is.reduce((s, i) => s + numero(i.valor_total), 0);
        if (!soma) {
          avisar(r, fonte, "NF sem composição válida para apropriar o custo.");
          continue;
        }
        for (const i of is) {
          if (
            i.tipo_apropiacao !== "direto" ||
            (i.e_combustivel && (i.maquina_id || i.veiculo_id)) ||
            (Array.isArray(i.maquinas_rateio) && i.maquinas_rateio.length)
          )
            continue;
          const retornos = valorDevolvido.get(texto(i, "id")) ?? 0;
          const ajuste =
            (totalNf.get(texto(r, "nf_entrada_id")) ?? 0) > 0
              ? (retornos * valor) / totalNf.get(texto(r, "nf_entrada_id"))!
              : 0;
          const ogItem = ogMap.get(texto(i, "operacao_gerencial_id"));
          adicionar(
            r,
            fonte,
            grupoCategoria(
              texto(r, "categoria"),
              texto(ogItem ?? og ?? {}, "classificacao"),
            ),
            Math.max(0, (valor * numero(i.valor_total)) / soma - ajuste),
            {
              id: `${fonte}:${r.id}:${i.id}`,
              centro_custo_id:
                texto(i, "centro_custo_id") || texto(r, "centro_custo_id"),
              ciclo_id: texto(i, "ciclo_id") || texto(r, "ciclo_id") || null,
            },
          );
        }
      } else if (
        !ehCompraDeInsumo(texto(r, "categoria")) &&
        !["cpv_insumos", "investimentos"].includes(grupo) &&
        !grupo.startsWith("receita")
      )
        adicionar(r, fonte, grupo, valor);
    }
  }
  for (const r of movimentos) {
    // Operações de campo, combustível e manutenção têm fonte própria; não se somam outra vez.
    if (r.auto === true || r.abastecimento_id) continue;
    const unitario = r.custo_unitario_na_baixa ?? r.valor_unitario;
    if (unitario == null) {
      avisar(
        r,
        "movimentacoes_estoque",
        "Consumo manual sem custo unitário histórico; custo não estimado pelo cadastro atual.",
      );
      continue;
    }
    const ins = insumosMov.find((i) => i.id === r.insumo_id);
    adicionar(
      r,
      "movimentacoes_estoque",
      grupoCategoria(texto(ins ?? {}, "categoria")),
      numero(r.quantidade) * numero(unitario),
      { descricao: `Consumo de estoque — ${texto(ins ?? {}, "nome")}` },
    );
  }
  for (const r of abastecimentos)
    if (!r.status_campo || r.status_campo === "aprovado") {
      if (r.valor_total == null || !Number.isFinite(Number(r.valor_total)))
        avisar(
          r,
          "abastecimentos",
          "Abastecimento sem custo histórico válido; custo não apurado.",
        );
      else
        adicionar(
          r,
          "abastecimentos",
          "cpv_combustivel",
          Number(r.valor_total),
        );
    }
  for (const r of manutencoes) {
    if (r.custo == null || !Number.isFinite(Number(r.custo)))
      avisar(
        r,
        "historico_manutencao",
        "Manutenção sem custo histórico válido; custo não apurado.",
      );
    else
      adicionar(r, "historico_manutencao", "cpv_manutencao", Number(r.custo));
  }
  const folhaMap = new Map(folhas.map((f) => [texto(f, "id"), f]));
  for (const r of funcionarios) {
    const f = folhaMap.get(texto(r, "folha_id"));
    if (!f) continue;
    const cpSalario = titulosPorId.get(texto(r, "cp_lancamento_id"));
    adicionar(
      {
        ...r,
        centro_custo_id: cpSalario?.centro_custo_id ?? r.centro_custo_id,
        ciclo_id: cpSalario?.ciclo_id ?? r.ciclo_id,
        fazenda_id: f.fazenda_id,
        ano_safra_id: anos[0].id,
      },
      "folha_funcionarios",
      "cpv_rh_faz",
      numero(r.salario_bruto) +
        numero(r.complemento_salarial) +
        numero(r.fgts) +
        numero(r.inss_patronal),
      { data: texto(f, "competencia") },
    );
  }
  const precos = new Map<string, { valor: number; sacas: number }>();
  for (const c of contratos) {
    if (
      !c.confirmado ||
      c.tipo === "compra" ||
      ["cancelado", "cancelada"].includes(texto(c, "status"))
    )
      continue;
    const valor = convertido({ ...c, valor: valorDoContrato(c) }, "contratos");
    if (valor === null) continue;
    const chave = texto(c, "produto").toLocaleLowerCase("pt-BR");
    const acumulado = precos.get(chave) ?? { valor: 0, sacas: 0 };
    acumulado.valor += valor;
    acumulado.sacas += numero(c.quantidade_sc);
    precos.set(chave, acumulado);
    if (p.receita === "contratada")
      adicionar(c, "contratos", "receita_bruta", valor, {
        descricao: `Contrato ${texto(c, "numero") || texto(c, "id").slice(0, 8)}`,
      });
  }
  for (const r of arrendamentos) {
    if (["cancelado", "cancelada"].includes(texto(r, "status"))) continue;
    const sc = numero(r.sacas_pagas);
    let valor = numero(r.valor_pago);
    if (sc > 0) {
      const preco = precos.get(
        texto(r, "commodity").toLocaleLowerCase("pt-BR"),
      );
      const unit =
        preco && preco.sacas > 0
          ? preco.valor / preco.sacas
          : numero(r.preco_sc_referencia);
      if (unit <= 0) {
        avisar(
          r,
          "arrendamento_pagamentos",
          "Arrendamento pago em sacas sem preço histórico de referência; custo não apurado.",
        );
        continue;
      }
      valor = sc * unit;
    }
    if (valor > 0)
      adicionar(r, "arrendamento_pagamentos", "arrendamento", valor);
  }
  if (p.receita === "estimada")
    for (const c of ciclos.filter((c) => !c.is_auxiliar)) {
      const pr = producao[c.id];
      if (pr.precoOrcado === null || pr.precoOrcado <= 0) {
        avisos.push({
          id: c.id,
          descricao: `${c.descricao || c.cultura}: informe o preço esperado no orçamento para estimar a receita.`,
        });
        continue;
      }
      adicionar(
        c as unknown as Registro,
        "estimativa",
        "receita_bruta",
        pr.sacas * pr.precoOrcado,
        {
          ciclo_id: c.id,
          descricao: "Receita estimada: colheita aprovada × preço do orçamento",
        },
      );
    }
  const regrasN2 = regras.map((r) => ({
    ...r,
    linhas: linhas.filter((l) => l.regra_id === r.id),
  })) as RegraResultado[];
  const regrasN1 = globais.map((g) => ({
    ...g,
    fazendas: farmsGlobais
      .filter((f) => f.regra_global_id === g.id)
      .map((f) => ({
        ...f,
        ciclos: ciclosGlobais.filter((c) => c.rateio_fazenda_id === f.id),
      })),
  })) as RegraResultado[];
  const pais = new Map(
    centros
      .filter((c) => c.parent_id)
      .map((c) => [texto(c, "id"), texto(c, "parent_id")]),
  );
  const rateado = ratearResultados(
    itens,
    ciclos,
    regrasN2,
    regrasN1,
    pais,
    new Map(anos.map((a) => [a.id, a.descricao])),
    fids,
  );
  return {
    itens: rateado.itens,
    avisos: [...avisos, ...rateado.avisos],
    ciclos,
    producao,
    inicio,
    fim,
  };
}
