// Capacidade de pagamento (consultoria Raccolto): quanto cada hectare precisa gerar de caixa para honrar os compromissos
// do período. Visão financeira (DFC), não gerencial: tudo que vence no período sai da geração de caixa operacional,
// inclusive o principal do custeio.

export type TipoPeriodo = "safra" | "civil";
export type Periodo = { de: string; ate: string };

export type ParcelaCap = {
  contrato_id: string; data_vencimento: string; amortizacao: number | null; juros: number | null;
  despesas_acessorios: number | null; valor_parcela: number | null; status: string | null;
};
export type ContratoCap = { id: string; tipo?: string | null; moeda?: string | null; status?: string | null };
export type OutroCompromisso = { grupo: string; data_vencimento: string; valor: number; pago: boolean };
export type LinhaDivida = { grupo: string; principal: number; juros: number; encargos: number; total: number; pago: number };

export type CicloCap = {
  id: string; descricao: string; unidade: string; area_ha: number; produtividade: number;
  preco: number; custo_ha: number; comprometido: number;
};
export type ResultadoCiclo = CicloCap & {
  producao: number; vendavel: number; receita: number; custo: number; caixa: number; parte_divida: number;
  necessario_ha: number; unidades_ha: number | null; produtividade_minima: number | null; preco_minimo: number | null; folga_ha: number;
};
export type Situacao = "folga" | "atencao" | "deficit" | "sem_dados";

const r2 = (n: number) => Math.round(n * 100) / 100;
const num = (n: number | null | undefined) => Number(n) || 0;

export const ROTULO_TIPO: Record<string, string> = {
  custeio: "Custeio", investimento: "Investimento", securitizacao: "Securitização", cpr: "CPR", egf: "EGF", outros: "Outros financiamentos",
};

export const periodoCivil = (ano: number): Periodo => ({ de: `${ano}-01-01`, ate: `${ano}-12-31` });
export const dentroDoPeriodo = (data: string | null | undefined, p: Periodo) => !!data && data >= p.de && data <= p.ate;

// Compromissos do período por tipo. Contrato refinanciado só conta o que já foi pago: o resto virou dívida da cédula nova.
export function compromissosDoPeriodo(parcelas: ParcelaCap[], contratos: ContratoCap[], outros: OutroCompromisso[], p: Periodo, cotacaoUsd: number): LinhaDivida[] {
  const porId = new Map(contratos.map(c => [c.id, c]));
  const linhas = new Map<string, LinhaDivida>();
  const linha = (grupo: string) => {
    let l = linhas.get(grupo);
    if (!l) { l = { grupo, principal: 0, juros: 0, encargos: 0, total: 0, pago: 0 }; linhas.set(grupo, l); }
    return l;
  };
  for (const pc of parcelas) {
    const c = porId.get(pc.contrato_id);
    if (!c || !dentroDoPeriodo(pc.data_vencimento, p)) continue;
    const pago = pc.status === "pago";
    if (c.status === "refinanciado" && !pago) continue;
    const fator = c.moeda === "USD" ? cotacaoUsd : 1;
    const amort = num(pc.amortizacao), juros = num(pc.juros), enc = num(pc.despesas_acessorios);
    const semDetalhe = amort + juros + enc === 0;
    const l = linha(ROTULO_TIPO[c.tipo ?? ""] ?? "Outros financiamentos");
    l.principal += (semDetalhe ? num(pc.valor_parcela) : amort) * fator;
    l.juros += juros * fator;
    l.encargos += enc * fator;
    if (pago) l.pago += (semDetalhe ? num(pc.valor_parcela) : amort + juros + enc) * fator;
  }
  for (const o of outros) {
    if (!dentroDoPeriodo(o.data_vencimento, p)) continue;
    const l = linha(o.grupo);
    l.principal += num(o.valor);
    if (o.pago) l.pago += num(o.valor);
  }
  return [...linhas.values()].map(l => ({
    grupo: l.grupo, principal: r2(l.principal), juros: r2(l.juros), encargos: r2(l.encargos),
    total: r2(l.principal + l.juros + l.encargos), pago: r2(l.pago),
  })).sort((a, b) => b.total - a.total);
}

// A dívida é repartida pela receita projetada de cada ciclo; sem receita em nenhum, pela área.
export function calcularCapacidade(ciclos: CicloCap[], compromissos: number) {
  const base = ciclos.map(c => {
    const producao = num(c.area_ha) * num(c.produtividade);
    const vendavel = Math.max(0, producao - num(c.comprometido));
    const receita = vendavel * num(c.preco);
    const custo = num(c.area_ha) * num(c.custo_ha);
    return { c, producao, vendavel, receita, custo };
  });
  const totalReceita = base.reduce((s, b) => s + b.receita, 0);
  const totalArea = ciclos.reduce((s, c) => s + num(c.area_ha), 0);
  const linhas: ResultadoCiclo[] = base.map(({ c, producao, vendavel, receita, custo }) => {
    const peso = totalReceita > 0 ? receita / totalReceita : totalArea > 0 ? num(c.area_ha) / totalArea : 0;
    const parte = compromissos * peso;
    const area = num(c.area_ha), preco = num(c.preco);
    const necessario = area > 0 ? parte / area : 0;
    return {
      ...c, producao, vendavel, receita: r2(receita), custo: r2(custo), caixa: r2(receita - custo), parte_divida: r2(parte),
      necessario_ha: r2(necessario),
      unidades_ha: preco > 0 ? r2(necessario / preco) : null,
      produtividade_minima: preco > 0 && area > 0 ? r2((custo + parte) / area / preco + num(c.comprometido) / area) : null,
      preco_minimo: vendavel > 0 ? r2((custo + parte) / vendavel) : null,
      folga_ha: area > 0 ? r2((receita - custo - parte) / area) : 0,
    };
  });
  const caixa = r2(totalReceita - base.reduce((s, b) => s + b.custo, 0));
  const cobertura = compromissos > 0 ? Math.round(caixa / compromissos * 100) / 100 : null;
  return {
    linhas, area: r2(totalArea), receita: r2(totalReceita), caixa, compromissos: r2(compromissos), cobertura,
    folga: r2(caixa - compromissos),
    necessario_ha: totalArea > 0 ? r2(compromissos / totalArea) : 0,
    caixa_ha: totalArea > 0 ? r2(caixa / totalArea) : 0,
    situacao: situacaoCobertura(cobertura, totalReceita),
  };
}

export function situacaoCobertura(cobertura: number | null, receita: number): Situacao {
  if (cobertura == null || receita <= 0) return "sem_dados";
  return cobertura >= 1.2 ? "folga" : cobertura >= 1 ? "atencao" : "deficit";
}
