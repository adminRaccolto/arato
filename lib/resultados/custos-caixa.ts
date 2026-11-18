import {
  centavos,
  distribuir,
  emReais,
  grupoCategoria,
  GRUPOS_RESULTADO,
} from "./apuracao";

export type RegistroCaixa = Record<string, unknown>;
export type OrigemCaixa = "lancamentos" | "empresa_lancamentos";
export type PagamentoCusto = {
  id: string;
  origem: OrigemCaixa;
  registro: string;
  descricao: string;
  documento: string;
  data: string;
  fazendaId: string;
  cicloId: string | null;
  grupo: string;
  categoria: string;
  operacao: string;
  pago: number;
  encargos: number;
  valor: number;
};
export type ConferenciaCaixa = {
  id: string;
  descricao: string;
  motivo: string;
  valor: number | null;
};
export type CustosCaixa = {
  pagamentos: PagamentoCusto[];
  pendencias: ConferenciaCaixa[];
  excluidos: ConferenciaCaixa[];
};
export type FiltroCaixa = { inicio: string; fim: string; fazendaIds: string[] };
const normalizar = (v: unknown) =>
  String(v ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
const prefixo = (c: string, p: string) => c === p || c.startsWith(p + ".");
const numero = (v: unknown): number | null =>
  v == null || v === "" || !Number.isFinite(Number(v)) ? null : Number(v);
const rotulos: Record<string, string> = Object.fromEntries(GRUPOS_RESULTADO);
rotulos.cpv_insumos = "Insumos";
rotulos.adiantamentos = "Adiantamentos operacionais";
rotulos.deducoes = "Tributos da operação";
export const categoriaCaixa = (grupo: string) => rotulos[grupo] ?? grupo;
const operacionais = new Set([
  "cpv_insumos",
  "sementes",
  "fertilizantes",
  "defensivos",
  "correcao_solo",
  "cpv_combustivel",
  "cpv_manutencao",
  "cpv_agricultura",
  "cpv_mecanizacao",
  "cpv_fretes",
  "cpv_pecuaria",
  "cpv_outros",
  "arrendamento",
  "cpv_rh_faz",
  "desp_rh_adm",
  "desp_adm",
  "desp_impostos",
  "desp_frota",
  "seguro_lavoura",
  "assistencia_tecnica",
  "deducoes",
  "adiantamentos",
]);

/** O valor pago e os encargos da baixa já estão em reais, inclusive em títulos USD. */
export function valorOperacionalPago(
  t: RegistroCaixa,
): { pago: number; encargos: number; valor: number } | string {
  const j = numero(t.valor_juros ?? 0),
    m = numero(t.valor_multa ?? 0),
    d = numero(t.valor_desconto ?? 0);
  if (j === null || m === null || d === null || Math.min(j, m, d) < 0)
    return "Encargos ou descontos da baixa inválidos.";
  let pago = numero(t.valor_pago);
  if (pago === null) {
    if (t.valor_pago != null && t.valor_pago !== "")
      return "Valor pago inválido.";
    if (t.status === "parcial")
      return "Baixa parcial sem valor pago registrado.";
    const nominal = emReais(t);
    if (nominal === null)
      return "Baixa antiga sem valor pago ou cotação histórica válida.";
    pago = centavos(nominal + j + m - d);
  }
  if (pago < 0 || pago + 0.005 < j + m)
    return "O valor pago não cobre os encargos registrados.";
  // O desconto já reduziu o dinheiro que saiu. Não é subtraído uma segunda vez.
  return {
    pago: centavos(pago),
    encargos: centavos(j + m),
    valor: centavos(pago - j - m),
  };
}

/** Somente operação: classificação da OG prevalece; categorias atendem títulos antigos sem OG. */
export function classificarCustoCaixa(
  t: RegistroCaixa,
  og?: RegistroCaixa,
): { grupo: string } | { fora: string } | { pendente: string } {
  const c = String(og?.classificacao ?? "").trim();
  const categoria = normalizar(t.categoria),
    nome = normalizar(og?.descricao);
  const texto = c ? nome : categoria;
  const origem = t.origem_lancamento ?? t.origem;
  if (
    origem === "tesouraria" ||
    /^(transfer|ajuste de saldo|captacao|distribuicao de lucro|retirada de socio|aporte)/.test(
      categoria,
    )
  )
    return { fora: "Transferência ou movimentação patrimonial." };
  if (
    prefixo(c, "2.02") ||
    prefixo(c, "2.03.04") ||
    /\b(juros|iof|tarifas? bancarias?|encargos financeiros?)\b/.test(texto)
  )
    return { fora: "Financiamento ou despesa financeira." };
  if (
    prefixo(c, "2.03.01") ||
    /\b(capex|investimentos?|imobilizado|aquisicao de (maquina|terra|veiculo))\b/.test(
      texto,
    ) ||
    origem === "compra_terra" ||
    origem === "consorcio"
  )
    return { fora: "Investimento ou aquisição de patrimônio." };
  if (prefixo(c, "2.03.02") || /depreciacao|amortizacao|exaustao/.test(texto))
    return { fora: "Depreciação ou amortização." };
  if (
    ["2.01.02.01.04.005", "2.01.02.01.04.013", "2.01.02.01.04.009"].some((p) =>
      prefixo(c, p),
    ) ||
    /\b(irpj|csll|imposto de renda|irpf)\b/.test(texto)
  )
    return { fora: "Tributo sobre resultado ou tarifa financeira." };
  if (
    /^(pagamento (de )?(custeio|financiamento|securitiza|cpr|egf|emprest)|principal de (emprest|financ))/.test(
      categoria,
    )
  )
    return { fora: "Devolução de principal de financiamento." };
  if (
    prefixo(c, "2.01.01.09") ||
    /^adiantamentos?\b.*(fornecedor|salari|gratifica|funcionario|viagem)/.test(
      categoria,
    )
  )
    return { grupo: "adiantamentos" };
  let grupo = grupoCategoria(String(t.categoria ?? ""), c || undefined);
  if (
    !c &&
    /\b(fgts|inss|salarios?|gratifica(?:cao|coes)|ferias|rescis(?:ao|oes)|beneficios?|vale transporte|vale refeicao|13[ºo]?)\b/.test(
      categoria,
    )
  )
    grupo = "cpv_rh_faz";
  if (!c && /^insumos?\b/.test(categoria)) grupo = "cpv_insumos";
  if (operacionais.has(grupo)) return { grupo };
  if (grupo.startsWith("receita") || c.startsWith("1."))
    return { fora: "Classificação de receita." };
  return {
    pendente:
      "Classifique a operação gerencial deste pagamento para identificar sua parcela operacional.",
  };
}

/** Não rateia valores nem ciclos: cada título mantém sua baixa, inclusive títulos de borderô. */
export function apurarCustosCaixa(
  fontes: { origem: OrigemCaixa; linhas: RegistroCaixa[] }[],
  operacoes: RegistroCaixa[],
  filtro: FiltroCaixa,
): CustosCaixa {
  const r: CustosCaixa = { pagamentos: [], pendencias: [], excluidos: [] };
  const ogs = new Map(operacoes.map((o) => [String(o.id), o]));
  const vistos = new Set<string>();
  for (const { origem, linhas } of fontes)
    for (const t of linhas) {
      const id = `${origem}:${t.id}`;
      if (vistos.has(id)) continue;
      vistos.add(id);
      const data = String(
        origem === "lancamentos"
          ? (t.data_baixa ?? "")
          : (t.data_pagamento ?? ""),
      ).slice(0, 10);
      if (
        !filtro.fazendaIds.includes(String(t.fazenda_id)) ||
        !data ||
        data < filtro.inicio ||
        data > filtro.fim ||
        t.tipo !== "pagar" ||
        !["baixado", "pago", "parcial"].includes(String(t.status))
      )
        continue;
      const descricao = String(t.descricao ?? "Pagamento sem descrição");
      const conferir = (
        motivo: string,
        valor: number | null,
      ): ConferenciaCaixa => ({ id, descricao, motivo, valor });
      if (
        t.natureza === "previsao" ||
        t.moeda === "barter" ||
        /compensa|encontro de contas|abatimento.*credito|permuta|dacao|sem movimentacao/.test(
          normalizar(t.forma_pagamento),
        )
      ) {
        r.excluidos.push(
          conferir(
            "Previsão ou liquidação sem desembolso de caixa.",
            numero(t.valor_pago),
          ),
        );
        continue;
      }
      const valor = valorOperacionalPago(t);
      if (typeof valor === "string") {
        r.pendencias.push(conferir(valor, null));
        continue;
      }
      if (t.status === "parcial" && !t.pagamento_parcial) {
        r.pendencias.push(
          conferir(
            "Baixa parcial antiga acumulada: confira as datas e separe as partes pagas antes de apurar por período.",
            valor.pago,
          ),
        );
        continue;
      }
      if (t.origem_lancamento === "cartao_fatura") {
        r.pendencias.push(
          conferir(
            "Fatura sem composição operacional conferida. Confira os itens da fatura.",
            valor.pago,
          ),
        );
        continue;
      }
      const og = ogs.get(String(t.operacao_gerencial_id ?? ""));
      const classificacao = classificarCustoCaixa(t, og);
      if ("fora" in classificacao) {
        r.excluidos.push(conferir(classificacao.fora, valor.pago));
        continue;
      }
      if ("pendente" in classificacao) {
        r.pendencias.push(conferir(classificacao.pendente, valor.pago));
        continue;
      }
      if (valor.valor <= 0) continue;
      r.pagamentos.push({
        id,
        origem,
        registro: String(t.id),
        descricao,
        documento: String(t.numero_documento ?? t.nfe_numero ?? ""),
        data,
        fazendaId: String(t.fazenda_id),
        cicloId: t.ciclo_id ? String(t.ciclo_id) : null,
        grupo: classificacao.grupo,
        categoria: categoriaCaixa(classificacao.grupo),
        operacao: String(og?.descricao ?? t.categoria ?? ""),
        ...valor,
      });
    }
  r.pagamentos.sort(
    (a, b) =>
      a.data.localeCompare(b.data) ||
      a.descricao.localeCompare(b.descricao) ||
      a.id.localeCompare(b.id),
  );
  return r;
}

/** Fatura quitada: atribui o desembolso aos itens originais, sem contar compras e fatura duas vezes.
 * Exige composição e quitação exatas; faturas divergentes ficam para conferência. */
export function comporFaturasCaixa(
  titulos: RegistroCaixa[],
  faturas: RegistroCaixa[],
  itens: RegistroCaixa[],
) {
  return titulos.flatMap((t) => {
    if (t.origem_lancamento !== "cartao_fatura" || t.natureza === "previsao")
      return [t];
    const fs = faturas.filter((f) => f.lancamento_cp_id === t.id);
    const valor = valorOperacionalPago(t);
    if (
      fs.length !== 1 ||
      typeof valor === "string" ||
      !["baixado", "pago"].includes(String(t.status))
    )
      return [t];
    const partes = itens.filter(
      (i) =>
        i.fatura_cartao_id === fs[0].id &&
        i.tipo === "pagar" &&
        i.status === "cartao",
    );
    const valores = partes.map((i) => emReais(i));
    if (!partes.length || valores.some((v) => v === null || v < 0)) return [t];
    const soma = centavos(valores.reduce<number>((s, n) => s + (n ?? 0), 0));
    if (soma <= 0 || soma !== valor.valor) return [t];
    const encargos = distribuir(valor.encargos, valores as number[]);
    return partes.map((p, n) => ({
      ...p,
      id: `${t.id}/${p.id}`,
      status: "baixado",
      data_baixa: t.data_baixa,
      valor_pago: centavos((valores[n] ?? 0) + encargos[n]),
      valor_juros: encargos[n],
      valor_multa: 0,
      valor_desconto: 0,
      origem_lancamento: "cartao_item_pago",
      numero_documento: p.numero_documento ?? t.numero_documento,
      descricao: `${p.descricao ?? "Compra"} — fatura paga`,
    }));
  });
}

export function resumirCustosCaixa(
  pagamentos: PagamentoCusto[],
  campo: "grupo" | "cicloId",
) {
  const mapa = new Map<
    string,
    { id: string; valor: number; quantidade: number }
  >();
  for (const p of pagamentos) {
    const id = p[campo] ?? "__sem_ciclo__";
    const grupo = mapa.get(id) ?? { id, valor: 0, quantidade: 0 };
    grupo.valor = centavos(grupo.valor + p.valor);
    grupo.quantidade++;
    mapa.set(id, grupo);
  }
  return [...mapa.values()].sort(
    (a, b) => b.valor - a.valor || a.id.localeCompare(b.id),
  );
}
export const totalCustosCaixa = (pagamentos: PagamentoCusto[]) =>
  centavos(pagamentos.reduce((s, p) => s + p.valor, 0));
