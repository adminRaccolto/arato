// Previsão de Gastos — regras puras (sem banco), usadas pela API, pela folha e pela tela.
// Seção 352 do supabase_migrations.sql.

export type StatusPrevisao = "aberta" | "pendente_decisao" | "cumprida" | "efetivada" | "cancelada";

export const STATUS_PREVISAO_LABEL: Record<StatusPrevisao, string> = {
  aberta: "Aberta",
  pendente_decisao: "Aguardando gestor",
  cumprida: "Cumprida",
  efetivada: "Efetivada",
  cancelada: "Cancelada",
};

const r2 = (v: number) => Math.round(v * 100) / 100;

/** Datas da recorrência: mesmo dia a cada `freqMeses` meses (dia 31 em mês curto vira o último dia do mês). */
export function datasRecorrencia(inicio: string, qtd: number, freqMeses = 1): string[] {
  const [a, m, d] = inicio.split("-").map(Number);
  const out: string[] = [];
  for (let k = 0; k < Math.max(1, qtd); k++) {
    const total = (m - 1) + k * Math.max(1, freqMeses);
    const ano = a + Math.floor(total / 12);
    const mes = (total % 12) + 1;
    const ultimo = new Date(Date.UTC(ano, mes, 0)).getUTCDate();
    out.push(`${ano}-${String(mes).padStart(2, "0")}-${String(Math.min(d, ultimo)).padStart(2, "0")}`);
  }
  return out;
}

export type Tolerancia = { pct: number; valor: number };

/**
 * Resultado de consumir uma previsão com um gasto real. A previsão fica cumprida; se o valor real for diferente do
 * saldo previsto (acima da tolerância), vai para a Decisão do Gestor.
 * diferenca > 0 = sobrou previsão (gastou menos); diferenca < 0 = gastou mais que o previsto.
 */
export function resultadoConsumo(p: { saldo: number; valorPrevisto: number; consumido: number; tolerancia?: Tolerancia }): {
  status: "cumprida" | "pendente_decisao"; diferenca: number; dentroTolerancia: boolean;
} {
  const diferenca = r2(p.saldo - p.consumido);
  if (Math.abs(diferenca) < 0.005) return { status: "cumprida", diferenca: 0, dentroTolerancia: false };
  const tol = p.tolerancia ?? { pct: 0, valor: 0 };
  const limite = Math.max(tol.valor || 0, r2((tol.pct || 0) / 100 * p.valorPrevisto));
  if (limite > 0 && Math.abs(diferenca) <= limite + 0.005) return { status: "cumprida", diferenca, dentroTolerancia: true };
  return { status: "pendente_decisao", diferenca, dentroTolerancia: false };
}

/** A OG do título casa com a OG da previsão: mesma classificação ou filha dela (previsão em OG de grupo). */
export function ogCasa(classPrevisao: string, classTitulo: string): boolean {
  const p = (classPrevisao ?? "").trim(), t = (classTitulo ?? "").trim();
  if (!p || !t) return false;
  return t === p || t.startsWith(p + ".");
}

/** Previsão vencida: aberta, com saldo e vencimento antes de hoje. */
export function previsaoVencida(p: { status: string; saldo: number; data_vencimento: string }, hoje: string): boolean {
  return p.status === "aberta" && p.saldo > 0.005 && p.data_vencimento < hoje;
}

export type LeituraRealizado = "vencimento" | "competencia" | "caixa";

export type PrevisaoAgg = { og_classificacao: string; data_vencimento: string; valor: number; status: string };
export type TituloRealAgg = {
  og_classificacao: string | null;
  valor: number;            // em R$
  data_vencimento?: string | null;
  data_lancamento?: string | null;
  data_baixa?: string | null;
  valor_pago?: number | null;
};

export type LinhaPxR = { og: string; mes: string; previsto: number; realizado: number; desvio: number; semPrevisao: boolean };

function dataDoTitulo(t: TituloRealAgg, leitura: LeituraRealizado): string | null {
  if (leitura === "caixa") return t.data_baixa ?? null;
  if (leitura === "competencia") return t.data_lancamento ?? t.data_vencimento ?? null;
  return t.data_vencimento ?? null;
}

/**
 * Previsto × Realizado por OG e mês (AAAA-MM). Previsto = previsões não canceladas (valor original). Realizado = todos
 * os títulos reais da OG, tenham vindo de previsão ou não. Título de OG filha conta na previsão de grupo mais
 * específica que existir; sem previsão nenhuma, aparece na própria OG marcado como "sem previsão".
 */
export function previstoRealizado(previsoes: PrevisaoAgg[], titulos: TituloRealAgg[], leitura: LeituraRealizado = "vencimento"): LinhaPxR[] {
  const chaves = [...new Set(previsoes.filter(p => p.status !== "cancelada").map(p => p.og_classificacao))]
    .sort((a, b) => b.length - a.length);
  const mapa = new Map<string, LinhaPxR>();
  const linha = (og: string, mes: string, semPrevisao: boolean) => {
    const k = `${og}|${mes}`;
    let l = mapa.get(k);
    if (!l) { l = { og, mes, previsto: 0, realizado: 0, desvio: 0, semPrevisao }; mapa.set(k, l); }
    return l;
  };
  for (const p of previsoes) {
    if (p.status === "cancelada") continue;
    const l = linha(p.og_classificacao, p.data_vencimento.slice(0, 7), false);
    l.previsto = r2(l.previsto + p.valor);
    l.semPrevisao = false;
  }
  for (const t of titulos) {
    const data = dataDoTitulo(t, leitura);
    if (!data || !t.og_classificacao) continue;
    const valor = leitura === "caixa" && t.valor_pago != null ? Number(t.valor_pago) : t.valor;
    const chave = chaves.find(c => ogCasa(c, t.og_classificacao!));
    const l = linha(chave ?? t.og_classificacao, data.slice(0, 7), !chave);
    l.realizado = r2(l.realizado + valor);
  }
  for (const l of mapa.values()) l.desvio = r2(l.previsto - l.realizado);
  return [...mapa.values()].sort((a, b) => a.og.localeCompare(b.og) || a.mes.localeCompare(b.mes));
}
