/**
 * Regras do aditivo de contrato de venda. Cada aditivo muda uma coisa só. Volume e preço juntos são um contrato novo,
 * não aditivo: o saldo do contrato original passa para ele. O preço novo vale só para o que ainda não tem NF.
 */

export type TipoAditivo = "quantidade" | "preco" | "prazo_entrega" | "pagamento" | "local_entrega" | "comprador" | "outros" | "novo_contrato";

export const TIPO_ADITIVO_LABEL: Record<TipoAditivo, string> = {
  quantidade: "Quantidade",
  preco: "Preço",
  prazo_entrega: "Prazo de entrega",
  pagamento: "Pagamento",
  local_entrega: "Local de entrega",
  comprador: "Comprador",
  outros: "Outros",
  novo_contrato: "Saldo para contrato novo",
};

export type ContratoAditivavel = {
  status?: string | null; preco?: number | null; quantidade_sc?: number | null; entregue_sc?: number | null; valor_ajuste_aditivo?: number | null;
  a_fixar?: boolean | null; data_entrega?: string | null; data_pagamento?: string | null; pessoa_id?: string | null; comprador?: string | null;
  local_entrega_nome?: string | null;
};

export type EntradaAditivo = {
  tipo: TipoAditivo; descricao?: string; quantidade_sc?: number; preco?: number; data?: string;
  pessoa?: { id: string; nome: string }; local?: { pessoa_id?: string | null; nome: string; cnpj?: string | null; logradouro?: string | null; municipio?: string | null; uf?: string | null; cep?: string | null };
  /** Contrato já tem romaneio ou NF: troca de comprador vira contrato novo. */
  temEntrega?: boolean;
};

export type PlanoAditivo = {
  contrato: Record<string, unknown>;
  antes: Record<string, unknown>;
  depois: Record<string, unknown>;
  /** Quanto muda no título a receber do contrato. */
  deltaCr: number;
  descricao: string;
  item?: { quantidade_sc?: number; preco?: number };
  cr?: { data_vencimento?: string; pessoa_id?: string };
};

const r2 = (n: number) => Math.round(n * 100) / 100;
const fmt = (n: number) => n.toLocaleString("pt-BR", { maximumFractionDigits: 4 });
const dataBr = (d?: string | null) => (d ? d.split("-").reverse().join("/") : "sem data");

export const pisoQuantidade = (c: ContratoAditivavel, faturadoSc: number) => Math.max(Number(c.entregue_sc) || 0, faturadoSc);

function statusPelaQuantidade(atual: string | null | undefined, quantidade: number, entregue: number): string | undefined {
  if (atual === "cancelado") return undefined;
  if (entregue >= quantidade) return "encerrado";
  return entregue > 0 ? "parcial" : "aberto";
}

/** Valor do contrato: preço atual × quantidade, mais o acerto das NFs emitidas a preço anterior. */
export const valorDoContrato = (c: { preco?: number | null; quantidade_sc?: number | null; valor_ajuste_aditivo?: number | null }) =>
  (Number(c.preco) || 0) * (Number(c.quantidade_sc) || 0) + (Number(c.valor_ajuste_aditivo) || 0);

export function planejarAditivo(c: ContratoAditivavel, faturadoSc: number, e: EntradaAditivo): PlanoAditivo | { erro: string } {
  if (c.status === "cancelado") return { erro: "Contrato cancelado não recebe aditivo." };
  const quantidade = Number(c.quantidade_sc) || 0;
  const preco = Number(c.preco) || 0;
  const entregue = Number(c.entregue_sc) || 0;
  const obs = (e.descricao ?? "").trim();
  const texto = (padrao: string) => (obs ? `${padrao}. ${obs}` : padrao);

  switch (e.tipo) {
    case "quantidade": {
      const novo = Number(e.quantidade_sc);
      if (!(novo > 0)) return { erro: "Informe a nova quantidade." };
      if (novo === quantidade) return { erro: "A quantidade é igual à atual." };
      const piso = pisoQuantidade(c, faturadoSc);
      if (novo < piso) return { erro: `A quantidade não pode ficar abaixo do já entregue ou faturado (${fmt(piso)} sc).` };
      const status = statusPelaQuantidade(c.status, novo, entregue);
      return {
        contrato: { quantidade_sc: novo, ...(status ? { status } : {}) },
        antes: { quantidade_sc: quantidade }, depois: { quantidade_sc: novo },
        deltaCr: r2((novo - quantidade) * preco), item: { quantidade_sc: novo },
        descricao: texto(`Quantidade de ${fmt(quantidade)} sc para ${fmt(novo)} sc`),
      };
    }
    case "preco": {
      const novo = Number(e.preco);
      if (!(novo > 0)) return { erro: "Informe o novo preço." };
      if (novo === preco) return { erro: "O preço é igual ao atual." };
      if (c.a_fixar && preco <= 0) return { erro: "Contrato a fixar sem preço: informe o preço na fixação, em Principal." };
      const faturado = Math.min(faturadoSc, quantidade);
      const saldo = Math.max(0, quantidade - faturado);
      if (saldo <= 0) return { erro: "Tudo já foi faturado: não há saldo para o preço novo. Diferença em NF já emitida se resolve com NF complementar." };
      return {
        contrato: { preco: novo, valor_ajuste_aditivo: r2((Number(c.valor_ajuste_aditivo) || 0) + (preco - novo) * faturado) },
        antes: { preco, faturado_sc: faturado }, depois: { preco: novo, saldo_sc: saldo },
        deltaCr: r2((novo - preco) * saldo), item: { preco: novo },
        descricao: texto(`Preço de ${fmt(preco)} para ${fmt(novo)} por saca, sobre o saldo de ${fmt(saldo)} sc`),
      };
    }
    case "prazo_entrega":
      if (!e.data) return { erro: "Informe a nova data de entrega." };
      return {
        contrato: { data_entrega: e.data }, antes: { data_entrega: c.data_entrega ?? null }, depois: { data_entrega: e.data }, deltaCr: 0,
        descricao: texto(`Entrega de ${dataBr(c.data_entrega)} para ${dataBr(e.data)}`),
      };
    case "pagamento":
      if (!e.data) return { erro: "Informe a nova data de pagamento." };
      return {
        contrato: { data_pagamento: e.data }, antes: { data_pagamento: c.data_pagamento ?? null }, depois: { data_pagamento: e.data }, deltaCr: 0,
        cr: { data_vencimento: e.data },
        descricao: texto(`Pagamento de ${dataBr(c.data_pagamento)} para ${dataBr(e.data)}`),
      };
    case "local_entrega":
      if (!e.local?.nome) return { erro: "Escolha o novo local de entrega." };
      return {
        contrato: {
          local_entrega_pessoa_id: e.local.pessoa_id ?? null, local_entrega_nome: e.local.nome, local_entrega_cnpj: e.local.cnpj ?? null,
          local_entrega_logradouro: e.local.logradouro ?? null, local_entrega_municipio: e.local.municipio ?? null, local_entrega_uf: e.local.uf ?? null, local_entrega_cep: e.local.cep ?? null,
        },
        antes: { local_entrega: c.local_entrega_nome ?? null }, depois: { local_entrega: e.local.nome }, deltaCr: 0,
        descricao: texto(`Local de entrega para ${e.local.nome}`),
      };
    case "comprador":
      if (!e.pessoa) return { erro: "Escolha o novo comprador." };
      if (e.pessoa.id === c.pessoa_id) return { erro: "O comprador é o mesmo do contrato." };
      if (e.temEntrega || entregue > 0 || faturadoSc > 0) return { erro: "Este contrato já tem entrega ou NF: passe o saldo para um contrato novo." };
      return {
        contrato: { pessoa_id: e.pessoa.id, comprador: e.pessoa.nome }, antes: { comprador: c.comprador ?? null }, depois: { comprador: e.pessoa.nome }, deltaCr: 0,
        cr: { pessoa_id: e.pessoa.id },
        descricao: texto(`Comprador de ${c.comprador ?? "sem nome"} para ${e.pessoa.nome}`),
      };
    case "outros":
      if (!obs) return { erro: "Descreva o aditivo." };
      return { contrato: {}, antes: {}, depois: {}, deltaCr: 0, descricao: obs };
    default:
      return { erro: "Tipo de aditivo inválido." };
  }
}

/** Saldo passa para um contrato novo: o original fica só com o que já foi entregue ou faturado. */
export function planejarSubstituicao(c: ContratoAditivavel, faturadoSc: number, numeroNovo: string): PlanoAditivo | { erro: string } {
  if (c.status === "cancelado") return { erro: "O contrato original está cancelado." };
  const quantidade = Number(c.quantidade_sc) || 0;
  const piso = pisoQuantidade(c, faturadoSc);
  if (piso >= quantidade) return { erro: "O contrato original não tem saldo para passar ao contrato novo." };
  return {
    contrato: { quantidade_sc: piso, status: piso > 0 ? "encerrado" : "cancelado" },
    antes: { quantidade_sc: quantidade }, depois: { quantidade_sc: piso, contrato_novo: numeroNovo },
    deltaCr: r2((piso - quantidade) * (Number(c.preco) || 0)), item: { quantidade_sc: piso },
    descricao: `Saldo de ${fmt(quantidade - piso)} sc passado para o contrato ${numeroNovo}`,
  };
}

/** Novo valor e situação do título a receber. Título recebido, conciliado ou em borderô não muda sozinho. */
export function ajusteDoTitulo(t: { status?: string | null; valor?: number | null; valor_pago?: number | null; lote_id?: string | null; conciliado?: boolean | null }, delta: number): { valor: number; status?: string } | { aviso: string } {
  const aberto = ["em_aberto", "previsto", "vencido", "vencendo"].includes(String(t.status));
  if (!aberto || Number(t.valor_pago) > 0 || t.lote_id || t.conciliado) {
    return { aviso: "O título a receber já tem recebimento, borderô ou conciliação e não foi alterado: ajuste em Contas a Receber." };
  }
  const valor = Math.max(0, r2((Number(t.valor) || 0) + delta));
  return valor > 0 ? { valor } : { valor: 0, status: "cancelado" };
}
