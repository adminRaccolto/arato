// Relatório do Apoio Financeiro (24/11/2026), no molde do relatório de CP/CR: janela de filtro, colunas escolhidas,
// agrupamento em vários níveis com subtotal e total geral, PDF ou Excel. Junta os títulos oficiais do CP/CR (com a baixa
// própria do Apoio) e os lançamentos exclusivos do Apoio.
//
// Posição: a situação de cada título é a da data escolhida — baixado se a baixa é até essa data; senão vencido (vencimento
// antes dela) ou a vencer. Assim dá para tirar a posição de um dia passado.

import type { Celula } from "../relatorios/tabela-exportavel";

export type Origem = "oficial" | "exclusivo";
export type Situacao = "a_vencer" | "vencido" | "baixado";

export type LinhaApoio = {
  id: string; origem: Origem; tipo: "pagar" | "receber"; descricao: string; valor: number; moeda: string;
  vencimento: string; dataBaixa: string | null;
  /** Quem baixou: Apoio (baixa própria do Apoio num título oficial), Oficial (baixa do CP/CR) ou o exclusivo do Apoio */
  baixadoPor: "apoio" | "oficial" | "exclusivo" | null;
  pessoa: string; documento: string; produtor: string; safra: string; categoria: string; contaBaixa: string; observacao: string;
};

/** Status do título oficial no contexto do Apoio: a baixa registrada no Apoio vale mais que a do CP/CR. */
export function statusApoioDe(statusOficial: string, temBaixaApoio: boolean): "baixado_oficial" | "baixado_apoio" | "aberto" {
  if (temBaixaApoio) return "baixado_apoio";
  return statusOficial === "baixado" ? "baixado_oficial" : "aberto";
}

/** Títulos do CP/CR que entram no Apoio: cancelado não é conta, e compra no cartão vive na fatura (cp-grid). */
export const entraNoApoio = (status: string) => status !== "cancelado" && status !== "cartao";

export function situacaoNaPosicao(l: LinhaApoio, posicao: string): Situacao {
  if (l.baixadoPor && (!l.dataBaixa || l.dataBaixa.slice(0, 10) <= posicao)) return "baixado";
  return l.vencimento < posicao ? "vencido" : "a_vencer";
}

/** Dias até o vencimento na data da posição (negativo = em atraso); vazio quando baixado. */
export function diasNaPosicao(l: LinhaApoio, posicao: string): number | null {
  if (situacaoNaPosicao(l, posicao) === "baixado") return null;
  return Math.round((Date.parse(`${l.vencimento}T12:00:00Z`) - Date.parse(`${posicao}T12:00:00Z`)) / 86_400_000);
}

export const ROTULO_SITUACAO: Record<Situacao, string> = { a_vencer: "A vencer", vencido: "Vencido", baixado: "Baixado" };
export const ROTULO_ORIGEM: Record<Origem, string> = { oficial: "CP/CR Oficial", exclusivo: "Apoio Exclusivo" };
const ROTULO_BAIXA = { apoio: "Apoio", oficial: "Oficial (CP/CR)", exclusivo: "Apoio" } as const;

/** Chave do fornecedor/cliente: CPF/CNPJ quando há, senão o nome. */
export const chavePessoa = (l: Pick<LinhaApoio, "documento" | "pessoa">) => l.documento ? `d:${l.documento.replace(/\D/g, "")}` : `n:${l.pessoa.trim().toUpperCase()}`;

export type FiltroApoio = {
  periodoPor: "vencimento" | "baixa"; de: string; ate: string; posicao: string;
  tipo: "todos" | "pagar" | "receber";
  origens: Set<Origem>; situacoes: Set<Situacao>; categorias: Set<string>; pessoas: Set<string>; produtores: Set<string>;
};

export function filtrarApoio(linhas: LinhaApoio[], f: FiltroApoio): LinhaApoio[] {
  return linhas.filter(l => {
    if (f.tipo !== "todos" && l.tipo !== f.tipo) return false;
    if (f.origens.size && !f.origens.has(l.origem)) return false;
    if (f.periodoPor === "baixa") {
      const d = l.dataBaixa?.slice(0, 10) ?? "";
      if (!l.baixadoPor || !d) return false;
      if (f.de && d < f.de) return false;
      if (f.ate && d > f.ate) return false;
    } else {
      if (f.de && l.vencimento < f.de) return false;
      if (f.ate && l.vencimento > f.ate) return false;
    }
    if (f.situacoes.size && !f.situacoes.has(situacaoNaPosicao(l, f.posicao))) return false;
    if (f.categorias.size && !f.categorias.has(l.categoria || "Sem categoria")) return false;
    if (f.pessoas.size && !f.pessoas.has(chavePessoa(l))) return false;
    if (f.produtores.size && !f.produtores.has(l.produtor || "Sem produtor")) return false;
    return true;
  });
}

export type TipoCol = "texto" | "data" | "moeda" | "numero";
export const COLUNAS_APOIO: { key: string; label: string; tipo: TipoCol; peso: number }[] = [
  { key: "vencimento",  label: "Vencimento",          tipo: "data",   peso: 62 },
  { key: "origem",      label: "Origem",              tipo: "texto",  peso: 70 },
  { key: "tipo",        label: "Tipo",                tipo: "texto",  peso: 46 },
  { key: "descricao",   label: "Descrição",           tipo: "texto",  peso: 170 },
  { key: "pessoa",      label: "Fornecedor / Cliente", tipo: "texto", peso: 140 },
  { key: "documento",   label: "CPF/CNPJ",            tipo: "texto",  peso: 90 },
  { key: "produtor",    label: "Produtor",            tipo: "texto",  peso: 100 },
  { key: "safra",       label: "Safra",               tipo: "texto",  peso: 60 },
  { key: "categoria",   label: "Categoria",           tipo: "texto",  peso: 100 },
  { key: "situacao",    label: "Situação",            tipo: "texto",  peso: 56 },
  { key: "dias",        label: "Dias p/ vencer (− = atraso)", tipo: "numero", peso: 50 },
  { key: "data_baixa",  label: "Data da baixa",       tipo: "data",   peso: 62 },
  { key: "baixado_por", label: "Baixado por",         tipo: "texto",  peso: 64 },
  { key: "conta_baixa", label: "Conta (baixa Apoio)", tipo: "texto",  peso: 100 },
  { key: "moeda",       label: "Moeda",               tipo: "texto",  peso: 36 },
  { key: "receber",     label: "A receber (CR)",      tipo: "moeda",  peso: 80 },
  { key: "pagar",       label: "A pagar (CP)",        tipo: "moeda",  peso: 80 },
  { key: "saldo",       label: "Saldo em aberto",     tipo: "moeda",  peso: 80 },
  { key: "observacao",  label: "Observação",          tipo: "texto",  peso: 140 },
];
export const COLUNAS_PADRAO = ["vencimento", "origem", "tipo", "descricao", "pessoa", "categoria", "situacao", "dias", "receber", "pagar", "saldo"];
export const COLUNAS_TOTAL = new Set(["receber", "pagar", "saldo"]);

export const GRUPOS_APOIO: { key: string; label: string }[] = [
  { key: "origem",    label: "Origem (Oficial / Exclusivo)" },
  { key: "tipo",      label: "Tipo (CP/CR)" },
  { key: "mes",       label: "Mês de vencimento" },
  { key: "situacao",  label: "Situação na posição" },
  { key: "pessoa",    label: "Fornecedor / Cliente" },
  { key: "categoria", label: "Categoria" },
  { key: "produtor",  label: "Produtor" },
  { key: "safra",     label: "Safra" },
];

const r2 = (v: number) => Math.round(v * 100) / 100;
const saldoAberto = (l: LinhaApoio, posicao: string) =>
  situacaoNaPosicao(l, posicao) === "baixado" ? 0 : (l.tipo === "receber" ? l.valor : -l.valor);

export function valorColuna(key: string, l: LinhaApoio, posicao: string): Celula {
  switch (key) {
    case "vencimento":  return l.vencimento;
    case "origem":      return ROTULO_ORIGEM[l.origem];
    case "tipo":        return l.tipo === "pagar" ? "Pagar" : "Receber";
    case "descricao":   return l.descricao;
    case "pessoa":      return l.pessoa;
    case "documento":   return l.documento;
    case "produtor":    return l.produtor;
    case "safra":       return l.safra;
    case "categoria":   return l.categoria;
    case "situacao":    return ROTULO_SITUACAO[situacaoNaPosicao(l, posicao)];
    case "dias":        return diasNaPosicao(l, posicao);
    case "data_baixa":  return situacaoNaPosicao(l, posicao) === "baixado" ? (l.dataBaixa?.slice(0, 10) ?? "") : "";
    case "baixado_por": return situacaoNaPosicao(l, posicao) === "baixado" && l.baixadoPor ? ROTULO_BAIXA[l.baixadoPor] : "";
    case "conta_baixa": return l.contaBaixa;
    case "moeda":       return l.moeda;
    case "receber":     return l.tipo === "receber" ? l.valor : null;
    case "pagar":       return l.tipo === "pagar" ? l.valor : null;
    case "saldo":       return r2(saldoAberto(l, posicao));
    case "observacao":  return l.observacao;
    default:            return "";
  }
}

export type Totais = { receber: number; pagar: number; saldo: number; n: number };
export type ItemRel =
  | { t: "grupo"; nivel: number; rot: string; tot: Totais }
  | { t: "linha"; l: LinhaApoio }
  | { t: "sub"; nivel: number; rot: string; tot: Totais };

export function somar(linhas: LinhaApoio[], posicao: string): Totais {
  const t = linhas.reduce((a, l) => {
    if (l.tipo === "receber") a.receber += l.valor; else a.pagar += l.valor;
    a.saldo += saldoAberto(l, posicao); a.n++; return a;
  }, { receber: 0, pagar: 0, saldo: 0, n: 0 });
  return { receber: r2(t.receber), pagar: r2(t.pagar), saldo: r2(t.saldo), n: t.n };
}

const ORDEM_SITUACAO: Record<Situacao, string> = { vencido: "1", a_vencer: "2", baixado: "3" };

function grupoDe(key: string, l: LinhaApoio, posicao: string): { ord: string; rot: string } {
  switch (key) {
    case "origem":   return { ord: l.origem, rot: ROTULO_ORIGEM[l.origem] };
    case "tipo":     return { ord: l.tipo === "receber" ? "1" : "2", rot: l.tipo === "receber" ? "Contas a Receber" : "Contas a Pagar" };
    case "mes":      return { ord: l.vencimento.slice(0, 7), rot: l.vencimento ? `${l.vencimento.slice(5, 7)}/${l.vencimento.slice(0, 4)}` : "Sem data" };
    case "situacao": { const s = situacaoNaPosicao(l, posicao); return { ord: ORDEM_SITUACAO[s], rot: ROTULO_SITUACAO[s] }; }
    case "pessoa":   return { ord: (l.pessoa || "~").toUpperCase(), rot: l.pessoa || "Sem fornecedor/cliente" };
    case "categoria": return { ord: (l.categoria || "~").toUpperCase(), rot: l.categoria || "Sem categoria" };
    case "produtor": return { ord: (l.produtor || "~").toUpperCase(), rot: l.produtor || "Sem produtor" };
    case "safra":    return { ord: l.safra || "~", rot: l.safra || "Sem safra" };
    default:         return { ord: "", rot: "" };
  }
}

/** Itens do relatório na ordem: grupo → (subníveis ou linhas por vencimento) → subtotal; e o total geral. */
export function agruparApoio(linhas: LinhaApoio[], grupos: string[], posicao: string): { itens: ItemRel[]; geral: Totais } {
  const out: ItemRel[] = [];
  const rotGrupo = (k: string) => GRUPOS_APOIO.find(g => g.key === k)?.label.replace(/ \(.*\)$/, "") ?? k;
  const rec = (ls: LinhaApoio[], nivel: number) => {
    if (nivel >= grupos.length) {
      [...ls].sort((a, b) => a.vencimento.localeCompare(b.vencimento) || a.descricao.localeCompare(b.descricao)).forEach(l => out.push({ t: "linha", l }));
      return;
    }
    const key = grupos[nivel];
    const mapa = new Map<string, { rot: string; ls: LinhaApoio[] }>();
    for (const l of ls) {
      const g = grupoDe(key, l, posicao); const k = `${g.ord}|${g.rot}`;
      const e = mapa.get(k); if (e) e.ls.push(l); else mapa.set(k, { rot: g.rot, ls: [l] });
    }
    [...mapa.entries()].sort((a, b) => a[0].localeCompare(b[0], "pt-BR")).forEach(([, g]) => {
      const tot = somar(g.ls, posicao);
      out.push({ t: "grupo", nivel, rot: `${rotGrupo(key)}: ${g.rot}`, tot });
      rec(g.ls, nivel + 1);
      out.push({ t: "sub", nivel, rot: `Subtotal — ${g.rot}`, tot });
    });
  };
  rec(linhas, 0);
  return { itens: out, geral: somar(linhas, posicao) };
}

/** Destaques do relatório na posição: em aberto e vencido, por tipo. */
export function resumoApoio(linhas: LinhaApoio[], posicao: string) {
  const soma = (f: (l: LinhaApoio) => boolean) => r2(linhas.filter(f).reduce((a, l) => a + l.valor, 0));
  const aberto = (l: LinhaApoio) => situacaoNaPosicao(l, posicao) !== "baixado";
  const vencido = (l: LinhaApoio) => situacaoNaPosicao(l, posicao) === "vencido";
  const receberAberto = soma(l => l.tipo === "receber" && aberto(l));
  const pagarAberto = soma(l => l.tipo === "pagar" && aberto(l));
  return {
    receberAberto, pagarAberto, saldo: r2(receberAberto - pagarAberto),
    receberVencido: soma(l => l.tipo === "receber" && vencido(l)), pagarVencido: soma(l => l.tipo === "pagar" && vencido(l)),
  };
}
