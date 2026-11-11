// SIEG — quais CPF/CNPJ consultar e o controle das notas que falharam ao gravar. Regras puras, testadas em
// sieg-monitoramento.test.ts.
//  - Documentos monitorados: a lista de Configurações → Integrações → Sieg MAIS os CPF/CNPJ de todos os produtores e
//    empresas do cliente (nota para um produtor fora da lista nunca chegava).
//  - Nota que falha ao gravar não trava mais a marca de "até onde já buscou": fica numa lista de pendências (com o
//    motivo e o número de tentativas), é tentada de novo nas próximas rodadas e sai da lista quando grava.

const soDig = (v: unknown) => String(v ?? "").replace(/\D/g, "");

/** CPF (11) ou CNPJ (14) válido em tamanho. */
export const docValido = (d: string) => d.length === 11 || d.length === 14;

/** Lista configurada + cadastros do cliente, sem repetir, configurados primeiro. */
export function documentosMonitorados(configurados: unknown[], cadastros: unknown[]): string[] {
  const out: string[] = [];
  for (const v of [...configurados, ...cadastros]) {
    const d = soDig(v);
    if (docValido(d) && !out.includes(d)) out.push(d);
  }
  return out;
}

export type FalhaSieg = {
  chave: string; tipo: "nfe" | "cte"; numero: string; emitente: string; destino: string; emissao: string;
  erro: string; tentativas: number; primeira: string; ultima: string;
};
export type FalhaRodada = Omit<FalhaSieg, "tentativas" | "primeira" | "ultima">;

/** Máximo de pendências guardadas e de tentativas por rodada (cada tentativa é uma consulta ao SIEG). */
export const MAX_FALHAS = 200;
export const MAX_RETENTATIVAS_RODADA = 10;

/**
 * Atualiza a lista de pendências depois de uma rodada: notas que falharam de novo somam uma tentativa, notas novas
 * entram, notas que gravaram (ou já existiam) saem. Mais recentes primeiro, até MAX_FALHAS.
 */
export function atualizarFalhas(anteriores: FalhaSieg[] | null | undefined, falhasRodada: FalhaRodada[], resolvidas: Iterable<string>, agora: string): FalhaSieg[] {
  const ok = new Set(resolvidas);
  const mapa = new Map<string, FalhaSieg>();
  for (const f of anteriores ?? []) if (f?.chave && !ok.has(f.chave)) mapa.set(f.chave, f);
  for (const f of falhasRodada) {
    if (!f.chave || ok.has(f.chave)) continue;
    const ant = mapa.get(f.chave);
    mapa.set(f.chave, { ...f, tentativas: (ant?.tentativas ?? 0) + 1, primeira: ant?.primeira ?? agora, ultima: agora });
  }
  return [...mapa.values()].sort((a, b) => b.ultima.localeCompare(a.ultima)).slice(0, MAX_FALHAS);
}

/** Quais pendências tentar de novo nesta rodada (as com menos tentativas primeiro). */
export function falhasParaTentar(falhas: FalhaSieg[] | null | undefined, tipo: "nfe" | "cte"): FalhaSieg[] {
  return [...(falhas ?? [])].filter(f => f.tipo === tipo && /^\d{44}$/.test(f.chave) && /^\d{4}-\d{2}-\d{2}/.test(f.emissao) && docValido(soDig(f.destino)))
    .sort((a, b) => a.tentativas - b.tentativas).slice(0, MAX_RETENTATIVAS_RODADA);
}

/** Janela de emissão para baixar de novo uma nota pendente: o dia da emissão com um dia de folga de cada lado (fuso). */
export function janelaDaEmissao(emissao: string): { inicio: string; fim: string } {
  const d = new Date(`${emissao.slice(0, 10)}T00:00:00.000Z`).getTime();
  const dia = (ms: number) => new Date(ms).toISOString().slice(0, 10);
  return { inicio: `${dia(d - 86_400_000)}T00:00:00.000Z`, fim: `${dia(d + 86_400_000)}T23:59:59.999Z` };
}
