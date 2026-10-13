// Custos do DRE por ANO SAFRA (com apontamento de ciclo quando existir).
//
// Regra de negócio (definida com o dono em 13/10/2026):
//  • Tudo que GERA ESTOQUE (insumos, peças, combustível de bomba) NÃO entra pelo Contas a Pagar: entra pelo
//    consumo (operações de campo, abastecimento, manutenção), com o custo congelado no momento do consumo.
//  • Apropriação DIRETA (administrativo, serviços, mecanização terceirizada, assessoria, financeiras etc.)
//    entra pelo título (CP) pela operação gerencial, no ano safra indicado (sem indicação: pelo vencimento).
//  • Mão de obra: folha fechada da competência (bruto + complemento + encargos patronais), regime de competência.
//  • Arrendamento: contratos pagos; em sacas, sacas pagas × preço médio ponderado de venda do produto no ano safra.
//  • Sem ciclo apontado → "semCiclo" (a regra de rateio entre ciclos é a próxima tarefa).
import { supabase } from "./supabase";
import { getDreGrupo } from "./seedOperacoesGerenciais";

// Lançamentos sem operação gerencial trazem a categoria como TEXTO — sem este mapa caíam em "outros" e sumiam.
export const GRUPO_POR_CATEGORIA_TEXTO: Record<string, string> = {
  "insumos": "cpv_insumos", "insumos / fertilizantes": "fertilizantes", "insumos / defensivos": "defensivos", "insumos / sementes": "sementes",
  "peças / manutenção": "cpv_manutencao", "manutenção de máquinas": "cpv_manutencao", "manutenção de veículos": "cpv_manutencao",
  "serviços agrícolas": "cpv_agricultura", "fretes e transportes": "cpv_fretes", "combustíveis": "cpv_combustivel", "combustível": "cpv_combustivel",
  "mão de obra": "cpv_rh_faz", "pessoal / salários": "cpv_rh_faz", "pessoal / encargos": "cpv_rh_faz", "pessoal / adiantamentos": "cpv_rh_faz",
  "despesas administrativas": "desp_adm", "impostos": "desp_impostos",
  "arrendamento de terra": "arrendamento",
  "pagamento de custeio": "juros_custeio", "tarifas bancárias": "desp_financeira", "juros e iof": "desp_financeira",
  "prêmio de seguro": "seguro_lavoura", "patrimônio / imobilizado": "investimentos",
};
// Insumos: já contados pelo consumo das operações de campo
export const GRUPOS_INSUMO_JA_CONTADOS = new Set(["cpv_insumos", "sementes", "fertilizantes", "defensivos"]);
const GRUPOS_FORA = new Set([...GRUPOS_INSUMO_JA_CONTADOS, "investimentos", "outros", "receita_bruta", "receita_nao_op", "receita_financeira", "deducoes"]);

export function grupoDoTitulo(categoria: string | null | undefined, ogClass?: string | null): string {
  if (ogClass) {
    if (ogClass.startsWith("2.01.01.09.002")) return "cpv_rh_faz"; // adiantamento a funcionário = mão de obra
    return getDreGrupo(ogClass);
  }
  const cat = (categoria ?? "").trim();
  const t = GRUPO_POR_CATEGORIA_TEXTO[cat.toLowerCase()] ?? (/^pr[êe]mio funcion/i.test(cat) ? "cpv_rh_faz" : undefined);
  if (t) return t;
  if (cat === "operacoes_mecanizadas") return "cpv_agricultura";
  if (cat === "combustivel") return "cpv_combustivel";
  if (cat === "manutencao") return "cpv_manutencao";
  if (cat === "arrendamento") return "arrendamento";
  if (cat === "mao_obra" || cat === "trabalhista") return "cpv_rh_faz";
  if (cat === "administrativo") return "desp_adm";
  if (cat === "seguro") return "seguro_lavoura";
  if (cat === "assistencia_tecnica") return "assistencia_tecnica";
  if (cat === "juros_custeio") return "juros_custeio";
  if (cat === "juros") return "desp_financeira";
  if (cat === "Insumos — Fertilizantes" || cat === "insumos_fertilizantes") return "fertilizantes";
  if (cat === "Insumos — Defensivos" || cat === "insumos_defensivos") return "defensivos";
  if (cat === "Insumos — Sementes" || cat === "insumos_sementes") return "sementes";
  return "outros";
}

export type CustosAno = {
  porCiclo: Record<string, Record<string, number>>;   // ciclo_id → grupo DRE → R$
  semCiclo: Record<string, number>;                   // custos do ano safra sem ciclo apontado
};

type Tit = {
  id: string; valor: number; moeda?: string | null; cotacao_usd?: number | null; sacas?: number | null; preco_saca_barter?: number | null;
  categoria?: string | null; operacao_gerencial_id?: string | null; ciclo_id?: string | null; ano_safra_id?: string | null;
  data_vencimento?: string | null; status?: string | null; natureza?: string | null; origem_lancamento?: string | null;
  nf_entrada_id?: string | null; fazenda_id?: string;
};

async function paginar<T>(montar: (from: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>): Promise<T[]> {
  let out: T[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await montar(from);
    if (error) throw new Error(error.message);
    out = out.concat(data ?? []);
    if (!data || data.length < 1000) break;
  }
  return out;
}
const lotes = <T,>(arr: T[], n: number) => Array.from({ length: Math.ceil(arr.length / n) }, (_, i) => arr.slice(i * n, i * n + n));
const norm = (s: string | null | undefined) => (s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

export async function carregarCustosAno(p: {
  fazendaIds: string[]; anoIds: string[]; inicio: string; fim: string; cicloIds: string[];
}): Promise<CustosAno> {
  const { fazendaIds, anoIds, inicio, fim, cicloIds } = p;
  const out: CustosAno = { porCiclo: {}, semCiclo: {} };
  const cicloSet = new Set(cicloIds);
  const add = (cicloId: string | null | undefined, grupo: string, valor: number) => {
    if (GRUPOS_FORA.has(grupo) || !valor) return;
    if (cicloId && cicloSet.has(cicloId)) {
      const m = (out.porCiclo[cicloId] ??= {});
      m[grupo] = (m[grupo] ?? 0) + valor;
    } else out.semCiclo[grupo] = (out.semCiclo[grupo] ?? 0) + valor;
  };
  if (!fazendaIds.length) return out;

  // ── 1) Títulos a pagar (produtor + empresa com apontamento explícito) ──────────────────────
  const filtroAno = [
    cicloIds.length ? `ciclo_id.in.(${cicloIds.join(",")})` : "",
    anoIds.length ? `ano_safra_id.in.(${anoIds.join(",")})` : "",
    `and(ano_safra_id.is.null,data_vencimento.gte.${inicio},data_vencimento.lte.${fim})`,
  ].filter(Boolean).join(",");
  const titsProd = await paginar<Tit>(from => supabase.from("lancamentos")
    .select("id,valor,moeda,cotacao_usd,sacas,preco_saca_barter,categoria,operacao_gerencial_id,ciclo_id,ano_safra_id,data_vencimento,status,natureza,origem_lancamento,nf_entrada_id,fazenda_id")
    .in("fazenda_id", fazendaIds).eq("tipo", "pagar").or(filtroAno).order("id").range(from, from + 999));
  const filtroEmp = [cicloIds.length ? `ciclo_id.in.(${cicloIds.join(",")})` : "", anoIds.length ? `ano_safra_id.in.(${anoIds.join(",")})` : ""].filter(Boolean).join(",");
  const titsEmp = filtroEmp ? await paginar<Tit & { origem?: string | null }>(from => supabase.from("empresa_lancamentos")
    .select("id,valor,moeda,cotacao_usd,categoria,operacao_gerencial_id,ciclo_id,ano_safra_id,data_vencimento,status,origem,nf_entrada_id,fazenda_id")
    .in("fazenda_id", fazendaIds).eq("tipo", "pagar").or(filtroEmp).order("id").range(from, from + 999)) : [];
  const tits = [
    ...titsProd.filter(t => t.status !== "cancelado" && t.natureza !== "previsao"),
    ...titsEmp.filter(t => t.status !== "cancelado").map(t => ({ ...t, origem_lancamento: (t as { origem?: string | null }).origem ?? null })),
  ].filter(t => !["folha", "arrendamento", "cartao_fatura"].includes(t.origem_lancamento ?? ""));

  const ogIds = [...new Set(tits.map(t => t.operacao_gerencial_id).filter(Boolean))] as string[];
  const nfIds = [...new Set(tits.map(t => t.nf_entrada_id).filter(Boolean))] as string[];
  type Item = { nf_entrada_id: string; tipo_apropiacao: string; valor_total: number; operacao_gerencial_id: string | null; e_combustivel: boolean | null; maquina_id: string | null; maquinas_rateio: unknown[] | null };
  const itensPorNf = new Map<string, Item[]>();
  for (const l of lotes(nfIds, 100)) {
    const { data } = await supabase.from("nf_entrada_itens").select("nf_entrada_id,tipo_apropiacao,valor_total,operacao_gerencial_id,e_combustivel,maquina_id,maquinas_rateio").in("nf_entrada_id", l);
    for (const it of (data ?? []) as Item[]) { (itensPorNf.get(it.nf_entrada_id) ?? itensPorNf.set(it.nf_entrada_id, []).get(it.nf_entrada_id)!).push(it); ogIds.push(...(it.operacao_gerencial_id ? [it.operacao_gerencial_id] : [])); }
  }
  const ogClass: Record<string, string> = {};
  for (const l of lotes([...new Set(ogIds)], 150)) {
    const { data } = await supabase.from("operacoes_gerenciais").select("id,classificacao").in("id", l);
    for (const o of data ?? []) ogClass[o.id as string] = o.classificacao as string;
  }
  for (const t of tits) {
    let valor = Number(t.valor) || 0;
    if (t.moeda === "barter" && t.sacas && t.preco_saca_barter) valor = Number(t.sacas) * Number(t.preco_saca_barter);
    else if (t.moeda === "USD" && t.cotacao_usd) valor = valor * Number(t.cotacao_usd);
    const itens = t.nf_entrada_id ? itensPorNf.get(t.nf_entrada_id) : undefined;
    if (itens?.length) {
      // CP de NF: só a parte de APROPRIAÇÃO DIRETA entra aqui. Itens de estoque/maquinário e os direto que
      // viram abastecimento ou manutenção de máquina entram pelo consumo (abastecimentos/historico_manutencao).
      const soma = itens.reduce((s, i) => s + Number(i.valor_total || 0), 0) || 1;
      for (const i of itens) {
        const viraConsumo = i.tipo_apropiacao !== "direto" || (i.e_combustivel && i.maquina_id) || (i.maquinas_rateio?.length ?? 0) > 0;
        if (viraConsumo) continue;
        const oc = i.operacao_gerencial_id ? ogClass[i.operacao_gerencial_id] : (t.operacao_gerencial_id ? ogClass[t.operacao_gerencial_id] : undefined);
        add(t.ciclo_id, grupoDoTitulo(t.categoria, oc), valor * (Number(i.valor_total || 0) / soma));
      }
    } else {
      add(t.ciclo_id, grupoDoTitulo(t.categoria, t.operacao_gerencial_id ? ogClass[t.operacao_gerencial_id] : undefined), valor);
    }
  }

  // ── 2) Combustível pela bomba / direto na máquina (consumo, custo congelado no abastecimento) ──
  const abast = await paginar<{ valor_total: number | null; ciclo_id: string | null; status_campo: string | null }>(from => supabase.from("abastecimentos")
    .select("valor_total,ciclo_id,status_campo")
    .in("fazenda_id", fazendaIds)
    .or(`${anoIds.length ? `ano_safra_id.in.(${anoIds.join(",")}),` : ""}and(ano_safra_id.is.null,data.gte.${inicio},data.lte.${fim})`)
    .order("id").range(from, from + 999));
  for (const a of abast) if (!a.status_campo || a.status_campo === "aprovado") add(a.ciclo_id, "cpv_combustivel", Number(a.valor_total) || 0);

  // ── 3) Manutenção de máquinas (consumo de peças / maquinário), sem ciclo ──
  const manut = await paginar<{ custo: number | null }>(from => supabase.from("historico_manutencao")
    .select("custo").in("fazenda_id", fazendaIds).gte("data", inicio).lte("data", fim).order("id").range(from, from + 999));
  for (const m of manut) add(null, "cpv_manutencao", Number(m.custo) || 0);

  // ── 4) Mão de obra: folha FECHADA da competência (bruto + complemento + encargos patronais) ──
  const folhas = await paginar<{ id: string }>(from => supabase.from("folha_pagamento")
    .select("id").in("fazenda_id", fazendaIds).is("empresa_id", null).eq("status", "fechado")
    .gte("competencia", inicio.slice(0, 7)).lte("competencia", fim.slice(0, 7)).order("id").range(from, from + 999));
  for (const l of lotes(folhas.map(f => f.id), 100)) {
    const { data } = await supabase.from("folha_funcionarios").select("salario_bruto,complemento_salarial,inss_patronal,fgts").in("folha_id", l);
    for (const f of data ?? []) add(null, "cpv_rh_faz", Number(f.salario_bruto || 0) + Number(f.complemento_salarial || 0) + Number(f.inss_patronal || 0) + Number(f.fgts || 0));
  }

  // ── 5) Arrendamento: contratos pagos. Sacas × preço médio ponderado de venda do produto no ano safra ──
  if (anoIds.length) {
    const vendas = await paginar<{ produto: string | null; preco: number | null; quantidade_sc: number | null; moeda: string | null; cotacao_usd: number | null }>(from => supabase.from("contratos")
      .select("produto,preco,quantidade_sc,moeda,cotacao_usd").in("fazenda_id", fazendaIds).in("ano_safra_id", anoIds)
      .eq("confirmado", true).neq("tipo", "compra").order("id").range(from, from + 999));
    const acum: Record<string, { v: number; q: number }> = {};
    for (const c of vendas) {
      const q = Number(c.quantidade_sc) || 0, pr = Number(c.preco) || 0;
      if (q <= 0 || pr <= 0) continue;
      const preco = c.moeda === "USD" && c.cotacao_usd ? pr * Number(c.cotacao_usd) : pr;
      const k = norm(c.produto);
      (acum[k] ??= { v: 0, q: 0 }).v += preco * q; acum[k].q += q;
    }
    const precoMedio = (commodity: string | null | undefined): number | null => {
      const alvo = norm(commodity);
      if (!alvo) return null;
      let v = 0, q = 0;
      for (const [k, a] of Object.entries(acum)) if (k.includes(alvo) || alvo.includes(k)) { v += a.v; q += a.q; }
      return q > 0 ? v / q : null;
    };
    const arr = await paginar<{ sacas_pagas: number | null; commodity: string | null; preco_sc_referencia: number | null; valor_pago: number | null }>(from => supabase.from("arrendamento_pagamentos")
      .select("sacas_pagas,commodity,preco_sc_referencia,valor_pago").in("fazenda_id", fazendaIds).in("ano_safra_id", anoIds).order("id").range(from, from + 999));
    for (const a of arr) {
      const sacas = Number(a.sacas_pagas) || 0;
      if (sacas > 0) add(null, "arrendamento", sacas * (precoMedio(a.commodity) ?? Number(a.preco_sc_referencia) ?? 0));
      else add(null, "arrendamento", Number(a.valor_pago) || 0);
    }
  }
  return out;
}
