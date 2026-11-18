import { getDreGrupo } from "./grupos";

export const numero = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
export const centavos = (v: number) =>
  Math.round((v + Number.EPSILON) * 100) / 100;
export function emReais(t: {
  valor?: unknown;
  moeda?: unknown;
  cotacao_usd?: unknown;
}): number | null {
  if (t.valor == null || t.valor === "") return null;
  const v = Number(t.valor);
  if (!Number.isFinite(v)) return null;
  if (t.moeda === "USD")
    return numero(t.cotacao_usd) > 0
      ? centavos(v * numero(t.cotacao_usd))
      : null;
  if (t.moeda && !["BRL", "barter"].includes(String(t.moeda))) return null;
  return centavos(v); // Barter já é escriturado em BRL; não reprifica o histórico pela saca atual.
}
export function ultimoDiaMes(mes: string): string {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(mes))
    throw new Error("Competência inválida.");
  const [a, m] = mes.split("-").map(Number);
  return `${mes}-${new Date(Date.UTC(a, m, 0)).getUTCDate()}`;
}
export type CicloResultado = {
  id: string;
  fazenda_id: string;
  ano_safra_id: string;
  descricao?: string | null;
  cultura?: string | null;
  area_plantada_ha?: number | null;
  is_auxiliar?: boolean | null;
  ciclo_pai_id?: string | null;
  absorcao_pct?: number | null;
};
export type ItemResultado = {
  id: string;
  fonte: string;
  descricao: string;
  grupo: string;
  valor: number;
  fazenda_id: string;
  ciclo_id?: string | null;
  centro_custo_id?: string | null;
  ano_safra_id?: string | null;
  escopo?: string | null;
  data?: string;
  previsto?: boolean;
  rateio?: string;
  origem_id?: string;
};
export type RegraResultado = {
  id: string;
  nome: string;
  fazenda_id?: string;
  ano_safra_id?: string;
  ano_safra_label?: string;
  ativo?: boolean;
  tipo?: string;
  centro_custo_id?: string;
  centros_custo_ids?: string[];
  tipos?: string[];
  linhas?: { ciclo_id?: string; percentual: number }[];
  fazendas?: {
    fazenda_id: string;
    percentual: number;
    ciclos?: { ciclo_id: string; percentual: number }[];
  }[];
};
export type PendenciaResultado = {
  descricao: string;
  fonte?: string;
  id?: string;
  valor?: number;
};

/** Distribuição em centavos. Resíduo nunca se perde em arredondamentos. */
export function distribuir(valor: number, pesos: number[]): number[] {
  const soma = pesos.reduce((s, p) => s + Math.max(0, p), 0);
  if (!soma) return pesos.map(() => 0);
  const total = Math.round(Math.abs(valor) * 100),
    sinal = valor < 0 ? -1 : 1;
  const bruto = pesos.map((p) => (total * Math.max(0, p)) / soma),
    ints = bruto.map(Math.floor);
  const ordem = bruto
    .map((n, i) => ({ i, resto: n - ints[i] }))
    .sort((a, b) => b.resto - a.resto || a.i - b.i);
  for (
    let n = 0, falta = total - ints.reduce((s, x) => s + x, 0);
    n < falta;
    n++
  )
    ints[ordem[n].i]++;
  return ints.map((v) => (v ? (sinal * v) / 100 : 0));
}
export function ratearResultados(
  itens: ItemResultado[],
  ciclos: CicloResultado[],
  regras: RegraResultado[],
  globais: RegraResultado[] = [],
  pais: Map<string, string> = new Map(),
  anos: Map<string, string> = new Map(),
  fazendasPermitidas = [...new Set(ciclos.map((c) => c.fazenda_id))],
) {
  const avisos: PendenciaResultado[] = [],
    saida: ItemResultado[] = [];
  const mesmoAno = (a?: string | null, b?: string | null) =>
    !a || !b || (anos.get(a) ?? a) === (anos.get(b) ?? b);
  const corresponde = (regra: RegraResultado, item: ItemResultado) => {
    if (regra.ativo === false) return false;
    if (
      regra.ano_safra_id &&
      item.ano_safra_id &&
      !mesmoAno(regra.ano_safra_id, item.ano_safra_id)
    )
      return false;
    const centros = regra.centros_custo_ids?.length
      ? regra.centros_custo_ids
      : regra.centro_custo_id
        ? [regra.centro_custo_id]
        : [];
    const caminho = new Set<string>();
    let c = item.centro_custo_id;
    while (c && !caminho.has(c)) {
      caminho.add(c);
      c = pais.get(c);
    }
    return centros.some((id) => caminho.has(id));
  };
  function semRateio(item: ItemResultado, motivo: string) {
    saida.push(item);
    avisos.push({
      descricao: `${item.descricao}: ${motivo}`,
      fonte: item.fonte,
      id: item.origem_id ?? item.id,
      valor: item.valor,
    });
  }
  function nivel2(item: ItemResultado) {
    const candidatas = regras.filter(
      (r) => r.fazenda_id === item.fazenda_id && corresponde(r, item),
    );
    if (candidatas.length !== 1) {
      semRateio(
        item,
        candidatas.length
          ? "mais de uma regra de rateio aplicável"
          : "sem regra de rateio aplicável",
      );
      return;
    }
    const r = candidatas[0];
    const elegiveis = ciclos.filter(
      (c) =>
        c.fazenda_id === item.fazenda_id &&
        (!r.ano_safra_id || mesmoAno(c.ano_safra_id, r.ano_safra_id)) &&
        !c.is_auxiliar,
    );
    const linhas =
      r.tipo === "area_plantada"
        ? elegiveis
            .filter((c) => numero(c.area_plantada_ha) > 0)
            .map((c) => ({
              ciclo_id: c.id,
              percentual: numero(c.area_plantada_ha),
            }))
        : (r.linhas ?? []);
    const soma = linhas.reduce((s, l) => s + numero(l.percentual), 0);
    if (
      !linhas.length ||
      soma <= 0 ||
      linhas.some((l) => numero(l.percentual) < 0) ||
      (r.tipo !== "area_plantada" && Math.abs(soma - 100) > 0.01) ||
      linhas.some(
        (l) => l.ciclo_id && !elegiveis.some((c) => c.id === l.ciclo_id),
      )
    ) {
      semRateio(item, `regra ${r.nome} sem distribuição válida`);
      return;
    }
    const valores = distribuir(
      item.valor,
      linhas.map((l) => l.percentual),
    );
    linhas.forEach((l, i) => {
      if (valores[i])
        saida.push({
          ...item,
          id: `${item.id}:${r.id}:${i}`,
          ciclo_id: l.ciclo_id ?? null,
          valor: valores[i],
          rateio: [item.rateio, r.nome].filter(Boolean).join(" → "),
        });
    });
  }
  for (const item of itens) {
    if (item.ciclo_id) {
      const ciclo = ciclos.find((c) => c.id === item.ciclo_id);
      if (!ciclo) {
        semRateio(
          { ...item, ciclo_id: null },
          "ciclo apontado fora do ano safra; confira a classificação",
        );
        continue;
      }
      if (ciclo.is_auxiliar) {
        const pct = numero(ciclo.absorcao_pct ?? 100);
        if (
          pct < 0 ||
          pct > 100 ||
          !ciclos.some((c) => c.id === ciclo.ciclo_pai_id && !c.is_auxiliar)
        ) {
          semRateio(
            { ...item, ciclo_id: null },
            "absorção do ciclo auxiliar inválida",
          );
          continue;
        }
        const v = distribuir(item.valor, [pct, 100 - pct]);
        if (v[0])
          saida.push({
            ...item,
            ciclo_id: ciclo.ciclo_pai_id,
            valor: v[0],
            rateio: "Absorção de ciclo auxiliar",
          });
        if (v[1])
          semRateio(
            { ...item, id: `${item.id}:residuo`, ciclo_id: null, valor: v[1] },
            "saldo do ciclo auxiliar não absorvido",
          );
      } else saida.push(item);
      continue;
    }
    if (item.escopo !== "global") {
      nivel2(item);
      continue;
    }
    const gs = globais.filter((g) => corresponde(g, item));
    if (gs.length !== 1) {
      semRateio(
        item,
        gs.length
          ? "mais de um rateio global aplicável"
          : "sem rateio global aplicável",
      );
      continue;
    }
    const g = gs[0];
    const fazendas =
      g.tipo === "area_ciclos"
        ? [
            ...new Set(
              ciclos
                .filter(
                  (c) =>
                    !c.is_auxiliar &&
                    (!g.fazendas?.length ||
                      g.fazendas.some((f) => f.fazenda_id === c.fazenda_id)) &&
                    (!item.ano_safra_id ||
                      mesmoAno(c.ano_safra_id, item.ano_safra_id)),
                )
                .map((c) => c.fazenda_id),
            ),
          ].map((id) => ({
            fazenda_id: id,
            percentual: ciclos
              .filter(
                (c) =>
                  c.fazenda_id === id &&
                  !c.is_auxiliar &&
                  (!g.fazendas?.length ||
                    g.fazendas.some((f) => f.fazenda_id === c.fazenda_id)) &&
                  (!item.ano_safra_id ||
                    mesmoAno(c.ano_safra_id, item.ano_safra_id)),
              )
              .reduce((s, c) => s + numero(c.area_plantada_ha), 0),
            ciclos: [] as { ciclo_id: string; percentual: number }[],
          }))
        : (g.fazendas ?? []);
    const soma = fazendas.reduce((s, f) => s + numero(f.percentual), 0);
    if (
      !soma ||
      fazendas.some(
        (f) => f.percentual < 0 || !fazendasPermitidas.includes(f.fazenda_id),
      ) ||
      (g.tipo !== "area_ciclos" && Math.abs(soma - 100) > 0.01)
    ) {
      semRateio(item, "rateio global inválido");
      continue;
    }
    const valores = distribuir(
      item.valor,
      fazendas.map((f) => f.percentual),
    );
    fazendas.forEach((f, i) => {
      if (!valores[i]) return;
      const parte = {
        ...item,
        id: `${item.id}:${g.id}:${i}`,
        fazenda_id: f.fazenda_id,
        valor: valores[i],
        rateio: g.nome,
        escopo: "fazenda",
      };
      if (!f.ciclos?.length) {
        nivel2(parte);
        return;
      }
      const valido =
        f.ciclos.every(
          (l) =>
            l.percentual >= 0 &&
            ciclos.some(
              (c) =>
                c.id === l.ciclo_id &&
                c.fazenda_id === f.fazenda_id &&
                (!item.ano_safra_id ||
                  mesmoAno(c.ano_safra_id, item.ano_safra_id)),
            ),
        ) &&
        Math.abs(f.ciclos.reduce((s, l) => s + l.percentual, 0) - 100) < 0.01;
      if (!valido) {
        semRateio(parte, "ciclos do rateio global inválidos");
        return;
      }
      const vs = distribuir(
        parte.valor,
        f.ciclos.map((c) => c.percentual),
      );
      f.ciclos.forEach((c, j) => {
        if (vs[j])
          saida.push({
            ...parte,
            id: `${parte.id}:${j}`,
            ciclo_id: c.ciclo_id,
            valor: vs[j],
          });
      });
    });
  }
  return { itens: saida, avisos };
}

export const GRUPOS_RESULTADO = [
  ["receita_bruta", "Receitas operacionais"],
  ["receita_nao_op", "Outras receitas"],
  ["receita_financeira", "Receitas financeiras"],
  ["deducoes", "Deduções da receita"],
  ["cpv_insumos", "Outros insumos consumidos"],
  ["sementes", "Sementes e inoculantes"],
  ["fertilizantes", "Fertilizantes"],
  ["defensivos", "Defensivos"],
  ["correcao_solo", "Correção do solo"],
  ["cpv_combustivel", "Combustíveis"],
  ["cpv_manutencao", "Manutenção"],
  ["cpv_agricultura", "Serviços agrícolas"],
  ["cpv_mecanizacao", "Mecanização"],
  ["cpv_fretes", "Fretes"],
  ["cpv_pecuaria", "Pecuária"],
  ["cpv_outros", "Outros custos de produção"],
  ["arrendamento", "Arrendamento"],
  ["cpv_rh_faz", "Mão de obra"],
  ["desp_rh_adm", "RH administrativo"],
  ["desp_adm", "Despesas administrativas"],
  ["desp_impostos", "Impostos e taxas"],
  ["desp_frota", "Frota"],
  ["seguro_lavoura", "Seguro da lavoura"],
  ["assistencia_tecnica", "Assistência técnica"],
  ["outros", "Custos sem classificação"],
  ["depreciacao", "Depreciação"],
  ["juros_custeio", "Juros de custeio"],
  ["desp_financeira", "Despesas financeiras"],
  ["descontos", "Descontos obtidos"],
] as const;
export function grupoCategoria(cat: string, classificacao?: string): string {
  if (classificacao) return getDreGrupo(classificacao);
  const c = cat
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  if (/deduc|funrural|senar/.test(c)) return "deducoes";
  if (/^receita.*financ/.test(c)) return "receita_financeira";
  if (/^(venda|receita)/.test(c)) return "receita_bruta";
  if (/sement|inoculan/.test(c)) return "sementes";
  if (/fertiliz|adub/.test(c)) return "fertilizantes";
  if (/defensiv|pulver/.test(c)) return "defensivos";
  if (/corret|correcao.*solo/.test(c)) return "correcao_solo";
  if (/arrend/.test(c)) return "arrendamento";
  if (/combust/.test(c)) return "cpv_combustivel";
  if (/manut|pecas/.test(c)) return "cpv_manutencao";
  if (/salario|pessoal|mao.*obra|premio funcion/.test(c)) return "cpv_rh_faz";
  if (/frete|transport/.test(c)) return "cpv_fretes";
  if (/juros.*custeio/.test(c)) return "juros_custeio";
  if (/juros|tarifa|iof|encargo.*financ/.test(c)) return "desp_financeira";
  if (/imposto|taxa/.test(c)) return "desp_impostos";
  if (/seguro/.test(c)) return "seguro_lavoura";
  if (/assisten.*tecn/.test(c)) return "assistencia_tecnica";
  if (/servic.*agric|mecaniz/.test(c)) return "cpv_agricultura";
  if (/administr|servic/.test(c)) return "desp_adm";
  return "outros";
}
export function totaisResultado(itens: ItemResultado[]) {
  const grupos: Record<string, number> = {};
  for (const i of itens.filter((i) => !i.previsto))
    grupos[i.grupo] = centavos((grupos[i.grupo] ?? 0) + i.valor);
  const receitas =
    (grupos.receita_bruta ?? 0) +
    (grupos.receita_nao_op ?? 0) +
    (grupos.receita_financeira ?? 0);
  const deducoes = grupos.deducoes ?? 0;
  const cpv = Object.entries(grupos)
    .filter(
      ([g]) =>
        (g.startsWith("cpv_") && g !== "cpv_rh_faz") ||
        ["sementes", "fertilizantes", "defensivos", "correcao_solo"].includes(
          g,
        ),
    )
    .reduce((s, [, v]) => s + v, 0);
  const op = [
    "arrendamento",
    "cpv_rh_faz",
    "desp_rh_adm",
    "desp_adm",
    "desp_impostos",
    "desp_frota",
    "seguro_lavoura",
    "assistencia_tecnica",
    "outros",
  ].reduce((s, k) => s + (grupos[k] ?? 0), 0);
  const bruta = (grupos.receita_bruta ?? 0) - deducoes - cpv,
    ebitda = bruta - op,
    operacional = ebitda - (grupos.depreciacao ?? 0);
  const financeiro =
    (grupos.juros_custeio ?? 0) + (grupos.desp_financeira ?? 0);
  return {
    grupos,
    receitas: centavos(receitas),
    deducoes,
    cpv: centavos(cpv),
    operacional: centavos(operacional),
    ebitda: centavos(ebitda),
    margemBruta: centavos(bruta),
    custo: centavos(
      deducoes +
        cpv +
        op +
        (grupos.depreciacao ?? 0) +
        financeiro -
        (grupos.descontos ?? 0),
    ),
    resultado: centavos(
      operacional -
        financeiro +
        (grupos.receita_nao_op ?? 0) +
        (grupos.receita_financeira ?? 0) +
        (grupos.descontos ?? 0),
    ),
    previsto: centavos(
      itens.filter((i) => i.previsto).reduce((s, i) => s + i.valor, 0),
    ),
  };
}
export function metrica(
  valor: number,
  unidade: "total" | "ha" | "sc" | "percentual",
  area: number,
  sacas: number,
  receita: number,
): number | null {
  const base =
    unidade === "ha"
      ? area
      : unidade === "sc"
        ? sacas
        : unidade === "percentual"
          ? receita / 100
          : 1;
  return base > 0 ? (valor === 0 ? 0 : valor / base) : null;
}

export function classificacaoSemResultado(classificacao?: string): boolean {
  return (
    !!classificacao &&
    /^(2\.01\.01\.09(?:\.|$)|2\.02\.01\.02(?:\.|$)|2\.03\.01(?:\.|$))/.test(
      classificacao,
    )
  );
}
