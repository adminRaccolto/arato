// Relatório do Apoio Financeiro (24/11/2026): a mesma definição gera o PDF e o Excel (lib/relatorios/tabela-exportavel.ts).
// Antes só havia uma planilha crua — datas em formato de banco, sem pessoa, sem totais, ignorando os filtros da tela e com
// o "saldo projetado" somando inclusive o que já tinha sido pago.
import type { Celula, RelatorioExport, TabelaExport } from "../relatorios/tabela-exportavel";

export type StatusApoio = "baixado_oficial" | "baixado_apoio" | "aberto";

export type TituloOficialRel = {
  tipo: "pagar" | "receber"; descricao: string; valor: number; data_vencimento: string; data_baixa: string | null;
  status: string; categoria: string | null; moeda?: string | null;
  pessoa: string; documento: string; statusApoio: StatusApoio; dataBaixaApoio: string | null; contaBaixaApoio: string;
};

export type TituloExclusivoRel = {
  tipo: "pagar" | "receber"; descricao: string; valor: number; data_vencimento: string; data_baixa: string | null;
  baixado: boolean; pessoa: string; documento: string; produtor: string; safra: string; origem: string; categoria: string;
  observacao: string;
};

export const ROTULO_STATUS_APOIO: Record<StatusApoio, string> = {
  aberto: "Aberto", baixado_apoio: "Baixado (Apoio)", baixado_oficial: "Baixado (Oficial)",
};

const rotuloTipo = (t: "pagar" | "receber") => (t === "pagar" ? "Pagar" : "Receber");
const soma = (v: number[]) => Math.round(v.reduce((a, b) => a + b, 0) * 100) / 100;
const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const dataBR = (d: string) => (d ? d.slice(0, 10).split("-").reverse().join("/") : "");

/** Status do título oficial no contexto do Apoio: a baixa registrada no Apoio vale mais que a do CP/CR. */
export function statusApoioDe(statusOficial: string, temBaixaApoio: boolean): StatusApoio {
  if (temBaixaApoio) return "baixado_apoio";
  return statusOficial === "baixado" ? "baixado_oficial" : "aberto";
}

/** Títulos do CP/CR que entram no Apoio: cancelado não é conta, e compra no cartão vive na fatura (cp-grid). */
export const entraNoApoio = (status: string) => status !== "cancelado" && status !== "cartao";

export type FluxoLinha = { data: string; origem: "Oficial" | "Apoio"; tipo: "pagar" | "receber"; descricao: string; pessoa: string; valor: number; saldo: number };

/** Projeção só do que está em aberto, em ordem de vencimento, com saldo acumulado (entradas − saídas). */
export function fluxoEmAberto(oficiais: TituloOficialRel[], exclusivos: TituloExclusivoRel[]): FluxoLinha[] {
  const itens = [
    ...oficiais.filter(o => o.statusApoio === "aberto").map(o => ({ data: o.data_vencimento, origem: "Oficial" as const, tipo: o.tipo, descricao: o.descricao, pessoa: o.pessoa, valor: o.valor })),
    ...exclusivos.filter(e => !e.baixado).map(e => ({ data: e.data_vencimento, origem: "Apoio" as const, tipo: e.tipo, descricao: e.descricao, pessoa: e.pessoa, valor: e.valor })),
  ].sort((a, b) => a.data.localeCompare(b.data) || a.descricao.localeCompare(b.descricao));
  let saldo = 0;
  return itens.map(i => {
    saldo = Math.round((saldo + (i.tipo === "receber" ? i.valor : -i.valor)) * 100) / 100;
    return { ...i, saldo };
  });
}

export function montarRelatorioApoio(p: {
  oficiais: TituloOficialRel[]; exclusivos: TituloExclusivoRel[];
  periodo: { de: string; ate: string }; fazenda?: string; filtros?: { rotulo: string; valor: string }[];
}): RelatorioExport {
  const { oficiais, exclusivos } = p;
  const usd = oficiais.some(o => (o.moeda ?? "BRL") !== "BRL");

  const tabOficial: TabelaExport = {
    titulo: "CP/CR Oficial",
    colunas: [
      { rotulo: "Vencimento", tipo: "data" }, { rotulo: "Tipo" }, { rotulo: "Descrição" }, { rotulo: "Pessoa" }, { rotulo: "CPF/CNPJ" },
      { rotulo: "Categoria" }, ...(usd ? [{ rotulo: "Moeda" }] : []), { rotulo: "Valor", tipo: "moeda" as const },
      { rotulo: "Status Apoio" }, { rotulo: "Baixa Apoio", tipo: "data" as const }, { rotulo: "Conta (Apoio)" }, { rotulo: "Baixa Oficial", tipo: "data" as const },
    ],
    linhas: oficiais.map(o => [
      o.data_vencimento, rotuloTipo(o.tipo), o.descricao, o.pessoa, o.documento, o.categoria ?? "",
      ...(usd ? [o.moeda ?? "BRL"] : []), o.valor, ROTULO_STATUS_APOIO[o.statusApoio], o.dataBaixaApoio ?? "", o.contaBaixaApoio,
      o.data_baixa ?? "",
    ] as Celula[]),
  };
  // Total do oficial separado por tipo: pagar e receber não se somam
  const totOfPagar = soma(oficiais.filter(o => o.tipo === "pagar").map(o => o.valor));
  const totOfReceber = soma(oficiais.filter(o => o.tipo === "receber").map(o => o.valor));
  tabOficial.total = tabOficial.colunas.map((c, i) => i === 0 ? `${oficiais.length} título(s)` : c.rotulo === "Descrição" ? `Pagar ${brl(totOfPagar)} · Receber ${brl(totOfReceber)}` : "");

  const totExPagar = soma(exclusivos.filter(e => e.tipo === "pagar").map(e => e.valor));
  const totExReceber = soma(exclusivos.filter(e => e.tipo === "receber").map(e => e.valor));
  const tabExclusivo: TabelaExport = {
    titulo: "Apoio Exclusivo",
    colunas: [
      { rotulo: "Vencimento", tipo: "data" }, { rotulo: "Tipo" }, { rotulo: "Descrição" }, { rotulo: "Pessoa" }, { rotulo: "CPF/CNPJ" },
      { rotulo: "Produtor" }, { rotulo: "Safra" }, { rotulo: "Origem" }, { rotulo: "Categoria" }, { rotulo: "Valor", tipo: "moeda" },
      { rotulo: "Status" }, { rotulo: "Data Baixa", tipo: "data" }, { rotulo: "Observação" },
    ],
    linhas: exclusivos.map(e => [
      e.data_vencimento, rotuloTipo(e.tipo), e.descricao, e.pessoa, e.documento, e.produtor, e.safra, e.origem, e.categoria,
      e.valor, e.baixado ? "Baixado" : "Aberto", e.data_baixa ?? "", e.observacao,
    ]),
    total: [`${exclusivos.length} lançamento(s)`, "", `Pagar ${brl(totExPagar)} · Receber ${brl(totExReceber)}`, "", "", "", "", "", "", null, "", "", ""],
  };

  const fluxo = fluxoEmAberto(oficiais, exclusivos);
  const tabFluxo: TabelaExport = {
    titulo: "Fluxo Projetado — títulos em aberto",
    colunas: [
      { rotulo: "Vencimento", tipo: "data" }, { rotulo: "Origem" }, { rotulo: "Tipo" }, { rotulo: "Descrição" }, { rotulo: "Pessoa" },
      { rotulo: "Entrada", tipo: "moeda" }, { rotulo: "Saída", tipo: "moeda" }, { rotulo: "Saldo Acumulado", tipo: "moeda" },
    ],
    linhas: fluxo.map(f => [f.data, f.origem, rotuloTipo(f.tipo), f.descricao, f.pessoa,
      f.tipo === "receber" ? f.valor : null, f.tipo === "pagar" ? f.valor : null, f.saldo]),
    total: ["Total", "", "", "", "",
      soma(fluxo.filter(f => f.tipo === "receber").map(f => f.valor)), soma(fluxo.filter(f => f.tipo === "pagar").map(f => f.valor)),
      fluxo.at(-1)?.saldo ?? 0],
  };

  const abertoOf = (t: "pagar" | "receber") => soma(oficiais.filter(o => o.tipo === t && o.statusApoio === "aberto").map(o => o.valor));
  const abertoEx = (t: "pagar" | "receber") => soma(exclusivos.filter(e => e.tipo === t && !e.baixado).map(e => e.valor));
  const linhasResumo: [string, number, number][] = [
    ["CP/CR Oficial — Pagar", totOfPagar, abertoOf("pagar")],
    ["CP/CR Oficial — Receber", totOfReceber, abertoOf("receber")],
    ["Apoio Exclusivo — Pagar", totExPagar, abertoEx("pagar")],
    ["Apoio Exclusivo — Receber", totExReceber, abertoEx("receber")],
  ];
  const aReceber = abertoOf("receber") + abertoEx("receber"), aPagar = abertoOf("pagar") + abertoEx("pagar");
  const tabResumo: TabelaExport = {
    titulo: "Resumo",
    colunas: [{ rotulo: "Grupo" }, { rotulo: "Total no período", tipo: "moeda" }, { rotulo: "Em aberto", tipo: "moeda" }],
    linhas: linhasResumo,
    total: ["Saldo em aberto (receber − pagar)", null, Math.round((aReceber - aPagar) * 100) / 100],
  };

  const filtros = [
    { rotulo: "Período (vencimento)", valor: `${dataBR(p.periodo.de)} a ${dataBR(p.periodo.ate)}` },
    ...(p.fazenda ? [{ rotulo: "Fazenda", valor: p.fazenda }] : []),
    ...(p.filtros ?? []).filter(f => f.valor),
  ];
  return {
    titulo: "Apoio Financeiro",
    tipoArquivo: "APOIO FINANCEIRO",
    orientacao: "landscape",
    filtros,
    resumo: [
      { rotulo: "A pagar em aberto", valor: brl(aPagar) },
      { rotulo: "A receber em aberto", valor: brl(aReceber) },
      { rotulo: "Saldo em aberto", valor: brl(aReceber - aPagar) },
    ],
    secoes: [tabResumo, tabOficial, tabExclusivo, tabFluxo],
    planilhas: [
      { ...tabResumo, nome: "Resumo" },
      { ...tabOficial, nome: "CP-CR Oficial" },
      { ...tabExclusivo, nome: "Apoio Exclusivo" },
      { ...tabFluxo, nome: "Fluxo Projetado" },
    ],
  };
}
