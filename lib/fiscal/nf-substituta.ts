// NF cancelada pelo emitente: ele emitiu outra no lugar (substituta)? Sem substituta, a mercadoria/serviço ficou sem nota
// válida e o fornecedor precisa ser cobrado. Sem acesso a banco: usado pelo relatório de NFs canceladas.

export type NfRef = { id: string; cnpj: string; numero: string; emissao: string; valor: number; status: string; chave?: string | null };
export type Substituta = NfRef & { difValorPct: number };

const dig = (s: string) => String(s ?? "").replace(/\D/g, "");
const dias = (de: string, ate: string) => (new Date(`${ate.slice(0, 10)}T00:00:00Z`).getTime() - new Date(`${de.slice(0, 10)}T00:00:00Z`).getTime()) / 86_400_000;

export const PRAZO_SUBSTITUTA_DIAS = 90;
export const TOLERANCIA_VALOR = 0.1;

/**
 * Substituta = NF válida do mesmo CPF/CNPJ emitente, emitida no mesmo dia da cancelada ou até 90 dias depois, com valor
 * até 10% diferente. Entre as possíveis, a de valor mais próximo (empate: a mais próxima na data). Cada NF substitui uma
 * cancelada só: as canceladas são casadas da mais antiga para a mais nova.
 */
export function casarSubstitutas(canceladas: NfRef[], candidatas: NfRef[]): Map<string, Substituta> {
  const chavesCanceladas = new Set(canceladas.map(c => c.chave).filter(Boolean));
  const idsCancelados = new Set(canceladas.map(c => c.id));
  const validas = candidatas.filter(n => n.status !== "cancelada" && !idsCancelados.has(n.id) && !(n.chave && chavesCanceladas.has(n.chave)));
  const usadas = new Set<string>();
  const out = new Map<string, Substituta>();
  for (const c of [...canceladas].sort((a, b) => a.emissao.localeCompare(b.emissao))) {
    const cnpj = dig(c.cnpj);
    let melhor: Substituta | null = null;
    for (const n of validas) {
      if (usadas.has(n.id) || dig(n.cnpj) !== cnpj || !n.emissao || !c.emissao) continue;
      const d = dias(c.emissao, n.emissao);
      if (d < 0 || d > PRAZO_SUBSTITUTA_DIAS) continue;
      const difValorPct = c.valor > 0 ? Math.abs(n.valor - c.valor) / c.valor : n.valor === 0 ? 0 : 1;
      if (difValorPct > TOLERANCIA_VALOR) continue;
      if (!melhor || difValorPct < melhor.difValorPct - 1e-9
        || (Math.abs(difValorPct - melhor.difValorPct) < 1e-9 && d < dias(c.emissao, melhor.emissao))) melhor = { ...n, difValorPct };
    }
    if (melhor) { usadas.add(melhor.id); out.set(c.id, melhor); }
  }
  return out;
}

/** O emitente cancelou antes ou depois da entrada (processamento) da nota no Arato. null quando falta alguma data. */
export function momentoDoCancelamento(canceladaEm: string | null | undefined, processadaEm: string | null | undefined): "antes" | "depois" | null {
  if (!canceladaEm || !processadaEm) return null;
  return new Date(canceladaEm).getTime() < new Date(processadaEm).getTime() ? "antes" : "depois";
}
