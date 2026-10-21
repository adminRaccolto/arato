// Monitor de Auditoria: transforma um evento técnico do audit_log numa frase legível e diz se foi AÇÃO do usuário ou
// consequência AUTOMÁTICA do sistema (título gerado pela NF, título do pedido cancelado porque as NFs cobriram o saldo,
// vínculos gravados pelo sistema...). Também agrupa as consequências embaixo da ação que as disparou.

export type EventoAud = {
  id: string; tabela: string; registro_id: string | null; acao: string;
  dados_antes: Record<string, unknown> | null; dados_depois: Record<string, unknown> | null;
  campos_alterados: string[] | null; usuario_app: string | null; created_at: string;
};
export type Tipo = "criou" | "alterou" | "excluiu" | "cancelou" | "baixou" | "estornou" | "conciliou" | "aprovou" | "fechou" | "reabriu" | "vinculou" | "processou" | "recalculou";
export type Descricao = { texto: string; automatico: boolean; tipo: Tipo; objeto: string };

const MARCA_SALDO_ZERADO = "[Saldo do pedido zerado pelas NFs vinculadas]";
export const ORIGEM_TITULO: Record<string, string> = {
  nf_entrada: "NF de Entrada", nf_saida: "NF de Saída", pedido_compra: "Pedido de Compra", arrendamento: "Arrendamento",
  tesouraria: "Tesouraria", contrato_financeiro: "Contrato Financeiro", consorcio: "Consórcio", manual: "lançamento manual",
  compra_terra: "Compra de Terra", nf_servico: "NF de Serviço", seguro: "Seguro", folha: "Folha de Pagamento",
  cartao_fatura: "Fatura de Cartão", cte: "CT-e", previsao: "Previsão de Gastos", apoio_financeiro: "Apoio Financeiro",
  aplicacao_financeira: "Aplicação Financeira", mutuo: "Mútuo",
};
// Campos que o sistema grava sozinho (vínculos, espelhos, classificação herdada): alteração só neles é automática
const CAMPOS_TECNICOS = new Set([
  "lancamento_id", "lancamento_cr_id", "num_lancamento", "cp_lancamento_id", "cp_fgts_id", "cp_inss_patronal_id", "emp_lancamento_id",
  "previsao_gasto_id", "produtor_id", "funcionario_id", "origem_lancamento", "ano_safra_id", "entidade_contabil", "nfe_numero",
  "conta_id", "updated_at", "entregue_sc", "entregue_kg", "saldo_sc", "valor_entregue", "nf_entrada_id", "pedido_compra_id",
]);

const s = (v: unknown) => (v == null ? "" : String(v));
const n = (v: unknown) => { const x = Number(v); return Number.isFinite(x) ? x : 0; };
const dataBR = (v: unknown) => { const t = s(v).slice(0, 10); return /^\d{4}-\d{2}-\d{2}$/.test(t) ? t.split("-").reverse().join("/") : t; };
export function dinheiro(v: unknown, moeda?: unknown): string {
  const x = n(v);
  return moeda === "USD" ? `US$ ${x.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    : x.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
const curto = (t: string, max = 70) => (t.length > max ? t.slice(0, max - 1) + "…" : t);

function titulo(d: Record<string, unknown>): string {
  const tipo = d.tipo === "receber" ? "conta a receber" : "conta a pagar";
  const prev = d.natureza === "previsao" ? " (previsão)" : "";
  return `${tipo}${prev} "${curto(s(d.descricao) || "sem descrição")}" de ${dinheiro(d.valor, d.moeda)}`;
}
const camposMudados = (e: EventoAud) => (e.campos_alterados ?? []).filter(c => c !== "updated_at");
const soTecnicos = (e: EventoAud) => { const c = camposMudados(e); return c.length > 0 && c.every(x => CAMPOS_TECNICOS.has(x)); };

export function descreverEvento(e: EventoAud): Descricao {
  const a = e.dados_antes ?? {}, d = e.dados_depois ?? e.dados_antes ?? {};
  const mud = camposMudados(e);
  const statusAntes = s(a.status), statusDepois = s((e.dados_depois ?? {}).status);

  // Gravação sem nenhuma mudança: o sistema recalculou o registro (ex.: pedido recalculado ao processar uma NF)
  if (e.acao === "UPDATE" && mud.length === 0) {
    const nome = e.tabela === "pedidos_compra" ? `o pedido de compra nº ${s(d.numero)}${d.nr_pedido_fornecedor ? ` (nº do fornecedor ${s(d.nr_pedido_fornecedor)})` : ""}`
      : e.tabela === "contratos" ? `o contrato ${s(d.numero)}` : e.tabela === "lancamentos" ? `a ${titulo(d)}` : `o registro de ${e.tabela}`;
    return { texto: `Sistema recalculou ${nome} (nada mudou)`, automatico: true, tipo: "recalculou", objeto: nome };
  }

  if (e.tabela === "nf_entradas" || e.tabela === "nf_servicos") {
    const servico = e.tabela === "nf_servicos";
    const numero = s(servico ? d.numero_nf : d.numero);
    const quem = s(servico ? d.prestador_nome : d.emitente_nome);
    const valor = servico ? (d.valor_liquido ?? d.valor_servico) : d.valor_total;
    const obj = `${servico ? "NFS-e" : "NF"} ${numero}${quem ? ` de ${curto(quem, 50)}` : ""} (${dinheiro(valor)})`;
    const viaSieg = s(d.origem) === "sieg" || s(d.origem) === "api";
    if (e.acao === "INSERT") return viaSieg
      ? { texto: `Sistema importou do SIEG a ${obj}`, automatico: true, tipo: "criou", objeto: obj }
      : { texto: `Lançou a ${obj}`, automatico: false, tipo: "criou", objeto: obj };
    if (e.acao === "DELETE") return { texto: `Excluiu a ${obj}`, automatico: false, tipo: "excluiu", objeto: obj };
    if (statusDepois === "processada" && statusAntes !== "processada") return { texto: `Processou a ${obj}${d.processado_por ? ` (processada por ${s(d.processado_por)})` : ""}`, automatico: false, tipo: "processou", objeto: obj };
    if (statusAntes === "processada" && statusDepois && statusDepois !== "processada") return { texto: `Estornou a ${obj} (voltou para ${statusDepois})`, automatico: false, tipo: "estornou", objeto: obj };
    if (statusDepois === "cancelada" && statusAntes !== "cancelada") return { texto: `${servico ? "NFS-e" : "NF"} cancelada: ${obj}${s(d.observacao).toLowerCase().includes("prestador") ? " (cancelada pelo prestador)" : ""}`, automatico: !e.usuario_app, tipo: "cancelou", objeto: obj };
    if (soTecnicos(e) || mud.every(c => CAMPOS_TECNICOS.has(c) || c === "valor_total")) return { texto: `Sistema atualizou a ${obj} (${mud.map(rotuloCampo).join(", ")})`, automatico: true, tipo: "vinculou", objeto: obj };
    return { texto: `Alterou a ${obj}: ${mud.filter(c => !CAMPOS_TECNICOS.has(c)).map(rotuloCampo).join(", ")}`, automatico: false, tipo: "alterou", objeto: obj };
  }

  if (e.tabela === "lancamentos") {
    const obj = titulo(d);
    const origem = s(d.origem_lancamento);
    const origemTxt = ORIGEM_TITULO[origem] ?? origem;
    const geradoPorOutro = !!origem && origem !== "manual";
    if (e.acao === "INSERT") {
      return geradoPorOutro
        ? { texto: `Sistema gerou a ${obj} a partir de ${origemTxt}`, automatico: true, tipo: "criou", objeto: obj }
        : { texto: `Lançou a ${obj}`, automatico: false, tipo: "criou", objeto: obj };
    }
    if (e.acao === "DELETE") return { texto: geradoPorOutro ? `Sistema excluiu a ${obj} (gerada por ${origemTxt})` : `Excluiu a ${obj}`, automatico: geradoPorOutro, tipo: "excluiu", objeto: obj };
    if (statusDepois === "cancelado" && statusAntes !== "cancelado") {
      return s(d.observacao).includes(MARCA_SALDO_ZERADO)
        ? { texto: `Sistema cancelou a ${obj}: as NFs vinculadas ao pedido cobriram o saldo`, automatico: true, tipo: "cancelou", objeto: obj }
        : { texto: `Cancelou a ${obj}`, automatico: false, tipo: "cancelou", objeto: obj };
    }
    if (statusAntes === "cancelado" && statusDepois && statusDepois !== "cancelado") {
      return s(a.observacao).includes(MARCA_SALDO_ZERADO)
        ? { texto: `Sistema reabriu a ${obj}: uma NF do pedido foi estornada e o saldo voltou`, automatico: true, tipo: "reabriu", objeto: obj }
        : { texto: `Reativou a ${obj}`, automatico: false, tipo: "reabriu", objeto: obj };
    }
    if (statusDepois === "baixado" && statusAntes !== "baixado") return { texto: `Baixou a ${obj} — pago ${dinheiro(d.valor_pago ?? d.valor)} em ${dataBR(d.data_baixa)}`, automatico: false, tipo: "baixou", objeto: obj };
    if (statusDepois === "parcial" && statusAntes !== "parcial") return { texto: `Baixa parcial da ${obj} — pago ${dinheiro(d.valor_pago)} até agora`, automatico: false, tipo: "baixou", objeto: obj };
    if (statusAntes === "baixado" && statusDepois && statusDepois !== "baixado") return { texto: `Estornou a baixa da ${obj}`, automatico: false, tipo: "estornou", objeto: obj };
    if (mud.includes("conciliado")) return { texto: d.conciliado ? `Conciliou com o extrato a ${obj}` : `Desfez a conciliação da ${obj}`, automatico: false, tipo: "conciliou", objeto: obj };
    if (mud.includes("lote_id")) return { texto: d.lote_id ? `Incluiu em borderô a ${obj}` : `Retirou do borderô a ${obj}`, automatico: false, tipo: "vinculou", objeto: obj };
    if (mud.includes("natureza") && a.natureza === "previsao" && d.natureza === "real") return { texto: `Efetivou a previsão: ${obj}`, automatico: false, tipo: "alterou", objeto: obj };
    if (soTecnicos(e)) return { texto: `Sistema completou dados da ${obj} (${mud.map(rotuloCampo).join(", ")})`, automatico: true, tipo: "vinculou", objeto: obj };
    const partes: string[] = [];
    if (mud.includes("valor")) partes.push(`valor ${dinheiro(a.valor, a.moeda)} → ${dinheiro(d.valor, d.moeda)}`);
    if (mud.includes("data_vencimento")) partes.push(`vencimento ${dataBR(a.data_vencimento)} → ${dataBR(d.data_vencimento)}`);
    const outros = mud.filter(c => c !== "valor" && c !== "data_vencimento" && !CAMPOS_TECNICOS.has(c));
    if (outros.length) partes.push(outros.map(rotuloCampo).join(", "));
    return { texto: `Alterou a ${obj}${partes.length ? `: ${partes.join("; ")}` : ""}`, automatico: false, tipo: "alterou", objeto: obj };
  }

  if (e.tabela === "pedidos_compra") {
    const obj = `pedido de compra nº ${s(d.numero)}${d.nr_pedido_fornecedor ? ` (nº do fornecedor ${s(d.nr_pedido_fornecedor)})` : ""}${d.valor_total != null ? ` de ${dinheiro(d.valor_total)}` : ""}`;
    if (e.acao === "INSERT") return { texto: `Criou o ${obj}${statusDepois ? ` (${statusDepois})` : ""}`, automatico: false, tipo: "criou", objeto: obj };
    if (e.acao === "DELETE") return { texto: `Excluiu o ${obj}`, automatico: false, tipo: "excluiu", objeto: obj };
    if (mud.includes("status")) {
      if (statusDepois === "aprovado") return { texto: `Aprovou o ${obj}`, automatico: false, tipo: "aprovou", objeto: obj };
      if (statusDepois === "cancelado") return { texto: `Cancelou o ${obj}`, automatico: false, tipo: "cancelou", objeto: obj };
      if (statusDepois === "entregue" || statusDepois === "parcial") return { texto: `Sistema marcou o ${obj} como ${statusDepois === "entregue" ? "entregue" : "entregue em parte"} pelas NFs processadas`, automatico: true, tipo: "alterou", objeto: obj };
      return { texto: `${obj[0].toUpperCase()}${obj.slice(1)} passou de ${statusAntes || "—"} para ${statusDepois}`, automatico: false, tipo: "alterou", objeto: obj };
    }
    if (soTecnicos(e)) return { texto: `Sistema vinculou o título do ${obj} no Contas a Pagar`, automatico: true, tipo: "vinculou", objeto: obj };
    return { texto: `Alterou o ${obj}: ${mud.map(rotuloCampo).join(", ")}`, automatico: false, tipo: "alterou", objeto: obj };
  }

  if (e.tabela === "contratos") {
    const obj = `contrato ${s(d.numero)}${d.produto ? ` · ${s(d.produto)}` : ""}${d.comprador ? ` · ${s(d.comprador)}` : ""}`;
    if (e.acao === "INSERT") return { texto: `Criou o ${obj}`, automatico: false, tipo: "criou", objeto: obj };
    if (e.acao === "DELETE") return { texto: `Excluiu o ${obj}`, automatico: false, tipo: "excluiu", objeto: obj };
    if (mud.includes("confirmado") && d.confirmado && !a.confirmado) return { texto: `Confirmou o ${obj}`, automatico: false, tipo: "aprovou", objeto: obj };
    if (statusDepois && mud.includes("status")) return { texto: statusDepois === "cancelado" ? `Cancelou o ${obj}` : `O ${obj} passou de ${statusAntes || "—"} para ${statusDepois}`, automatico: false, tipo: statusDepois === "cancelado" ? "cancelou" : "alterou", objeto: obj };
    if (soTecnicos(e)) return { texto: `Sistema atualizou o ${obj} (${mud.map(rotuloCampo).join(", ")})`, automatico: true, tipo: "vinculou", objeto: obj };
    return { texto: `Alterou o ${obj}: ${mud.filter(c => !CAMPOS_TECNICOS.has(c)).map(rotuloCampo).join(", ")}`, automatico: false, tipo: "alterou", objeto: obj };
  }

  if (e.tabela === "folha_pagamento") {
    const obj = `folha de ${s(d.competencia)}${d.valor_liquido != null ? ` (líquido ${dinheiro(d.valor_liquido)})` : ""}`;
    if (e.acao === "INSERT") return { texto: `Criou a ${obj}`, automatico: false, tipo: "criou", objeto: obj };
    if (e.acao === "DELETE") return { texto: `Excluiu a ${obj}`, automatico: false, tipo: "excluiu", objeto: obj };
    if (statusDepois === "fechado" && statusAntes !== "fechado") return { texto: `Fechou a ${obj}`, automatico: false, tipo: "fechou", objeto: obj };
    if (statusAntes === "fechado" && statusDepois === "rascunho") return { texto: `Reabriu a ${obj}`, automatico: false, tipo: "reabriu", objeto: obj };
    if (soTecnicos(e)) return { texto: `Sistema vinculou os títulos de encargos da ${obj}`, automatico: true, tipo: "vinculou", objeto: obj };
    return { texto: `Alterou a ${obj}: ${mud.map(rotuloCampo).join(", ")}`, automatico: false, tipo: "alterou", objeto: obj };
  }

  if (e.tabela === "folha_funcionarios") {
    const obj = `linha de ${s(d.nome_funcionario) || "funcionário"} na folha`;
    const acao = e.acao === "INSERT" ? "gravou" : e.acao === "DELETE" ? "apagou" : "atualizou";
    return { texto: `Sistema ${acao} a ${obj}`, automatico: true, tipo: e.acao === "DELETE" ? "excluiu" : e.acao === "INSERT" ? "criou" : "vinculou", objeto: obj };
  }

  if (e.tabela === "contratos_financeiros") {
    const obj = `contrato financeiro "${curto(s(d.descricao))}"${d.valor_financiado != null ? ` de ${dinheiro(d.valor_financiado, d.moeda)}` : ""}`;
    if (e.acao === "INSERT") return { texto: `Criou o ${obj}`, automatico: false, tipo: "criou", objeto: obj };
    if (e.acao === "DELETE") return { texto: `Excluiu o ${obj}`, automatico: false, tipo: "excluiu", objeto: obj };
    if (soTecnicos(e)) return { texto: `Sistema atualizou o ${obj}`, automatico: true, tipo: "vinculou", objeto: obj };
    return { texto: `Alterou o ${obj}: ${mud.map(rotuloCampo).join(", ")}`, automatico: false, tipo: "alterou", objeto: obj };
  }

  const obj = `${e.tabela} ${s(d.numero ?? d.numero_romaneio ?? d.descricao ?? d.nome ?? "")}`.trim();
  const tipo: Tipo = e.acao === "INSERT" ? "criou" : e.acao === "DELETE" ? "excluiu" : "alterou";
  const verbo = tipo === "criou" ? "Criou" : tipo === "excluiu" ? "Excluiu" : "Alterou";
  return { texto: `${verbo} ${obj}${tipo === "alterou" && mud.length ? `: ${mud.map(rotuloCampo).join(", ")}` : ""}`, automatico: soTecnicos(e), tipo, objeto: obj };
}

export function rotuloCampo(campo: string): string {
  const mapa: Record<string, string> = {
    valor: "valor", status: "situação", descricao: "descrição", data_vencimento: "vencimento", data_baixa: "data da baixa",
    valor_pago: "valor pago", categoria: "categoria", pessoa_id: "fornecedor/cliente", fazenda_id: "fazenda", observacao: "observação",
    conta_bancaria: "conta bancária", operacao_gerencial_id: "operação gerencial", ciclo_id: "ciclo", centro_custo_id: "centro de custo",
    produtor_id: "produtor", ano_safra_id: "ano safra", funcionario_id: "funcionário", origem_lancamento: "origem",
    lancamento_id: "título vinculado", lancamento_cr_id: "título a receber vinculado", num_lancamento: "nº do lançamento",
    cp_lancamento_id: "título vinculado", nfe_numero: "nº da NF", numero_documento: "nº do documento", forma_pagamento: "forma de pagamento",
    preco: "preço", quantidade_sc: "quantidade", comprador: "comprador", confirmado: "confirmação", safra: "safra",
  };
  return mapa[campo] ?? campo.replace(/_id$/, "").replace(/_/g, " ");
}

const PESO: Record<Tipo, number> = {
  processou: 9, fechou: 8, aprovou: 8, baixou: 7, estornou: 7, cancelou: 7, conciliou: 6, reabriu: 6, excluiu: 6,
  criou: 4, alterou: 2, vinculou: 1, recalculou: 0,
};

export type GrupoEventos<T extends EventoAud = EventoAud> = { principal: T; descricao: Descricao; consequencias: { e: T; d: Descricao }[] };

/**
 * Agrupa por ação: eventos com até `janelaSeg` segundos de diferença, do mesmo usuário ou automáticos sem usuário,
 * viram um grupo. O principal é a primeira ação do usuário; o resto aparece como consequência dela.
 * A lista chega do mais novo para o mais antigo e sai na mesma ordem.
 */
export function agruparEventos<T extends EventoAud>(eventos: T[], janelaSeg = 4): GrupoEventos<T>[] {
  const grupos: { itens: { e: T; d: Descricao }[]; usuario: string | null; t: number }[] = [];
  for (const e of eventos) {
    const d = descreverEvento(e);
    const t = new Date(e.created_at).getTime();
    const g = grupos[grupos.length - 1];
    const compativel = g && Math.abs(g.t - t) <= janelaSeg * 1000
      && (e.usuario_app === g.usuario || !e.usuario_app || !g.usuario || d.automatico);
    if (compativel) { g.itens.push({ e, d }); g.t = t; if (!g.usuario && e.usuario_app) g.usuario = e.usuario_app; }
    else grupos.push({ itens: [{ e, d }], usuario: e.usuario_app, t });
  }
  return grupos.map(g => {
    // Ação principal: a ação de usuário mais importante (processar NF, baixar, cancelar... antes de "alterou");
    // empate fica com a mais antiga, que é a que disparou as outras. Só automáticos: a mais antiga.
    const ordem = [...g.itens].reverse();
    const doUsuario = ordem.filter(x => !x.d.automatico);
    const p = doUsuario.length
      ? doUsuario.reduce((m, x) => (PESO[x.d.tipo] > PESO[m.d.tipo] ? x : m), doUsuario[0])
      : ordem[0];
    return { principal: p.e, descricao: p.d, consequencias: g.itens.filter(x => x !== p) };
  });
}
