// Saúde dos dados — regras do auditor automático (só equipe Raccolto). Cada regra é uma verdade que os dados precisam
// respeitar sempre; o executor (executar.ts) carrega a base, roda todas e grava cada violação em auditoria_achados.
// As regras são funções puras sobre a base carregada para poderem ser testadas com os casos reais (regras.test.ts).
// Casos que originaram cada regra: out/2026 (NF 2503 da Muriana, NFS-e 87/88 Posto de Molas, NF 12666 RJT, NF 14673
// Luft, liberação BB custeio do Cleber, transferências do Grupo Ogliari, guias do Odir lançadas como NFS-e).

export type Gravidade = "alta" | "media" | "baixa";
export type RegraId =
  | "nf_sem_titulo" | "nfse_sem_titulo" | "guia_como_nfse" | "baixa_perdida" | "pago_sem_titulo" | "nf_pendente_ja_paga"
  | "liberacao_excluida" | "estoque_negativo" | "nf_chave_repetida" | "nf_processada_2x" | "titulo_duplicado_nf"
  | "baixa_acima_valor" | "titulo_em_nf_pendente" | "espelho_pj_sem_nf" | "espelho_divergente" | "status_inconsistente";

export const REGRAS: Record<RegraId, { nome: string; gravidade: Gravidade; descricao: string; correcao: string }> = {
  nf_sem_titulo: { nome: "NF processada sem título", gravidade: "alta",
    descricao: "NF de Produtos processada que deveria gerar contas a pagar e não tem nenhum título (produtor ou Empresa).",
    correcao: "Confirmar com o cliente se foi paga. Se não, estornar a NF em Documentos Fiscais e processar de novo (recria os títulos)." },
  nfse_sem_titulo: { nome: "NFS-e processada sem título", gravidade: "alta",
    descricao: "NFS-e processada sem título no CP do produtor nem da Empresa.",
    correcao: "Estornar a NFS-e e processar de novo, ou lançar o título se foi pago por fora." },
  guia_como_nfse: { nome: "Guia lançada como NFS-e", gravidade: "media",
    descricao: "Guia (FGTS, DARF, INSS) cadastrada na tela de NFS-e. Não é nota fiscal e não gera CP por esse caminho.",
    correcao: "Lançar a guia direto no Contas a Pagar e excluir o registro de NFS-e." },
  baixa_perdida: { nome: "Pago que voltou a ficar em aberto", gravidade: "alta",
    descricao: "Um título pago foi apagado (reprocessamento, estorno antigo ou exclusão) e hoje existe outro igual em aberto: o CP mostra como dívida algo já pago.",
    correcao: "Baixar o título em aberto com a data e a conta do pagamento original (estão no detalhe)." },
  pago_sem_titulo: { nome: "Pagamento sem título", gravidade: "media",
    descricao: "Título pago foi apagado e não existe nenhum equivalente: o pagamento sumiu do financeiro (caixa e conciliação ficam sem ele).",
    correcao: "Confirmar com o cliente. Se o pagamento existiu, relançar o título já baixado com os dados do detalhe." },
  nf_pendente_ja_paga: { nome: "NF pendente que já foi paga", gravidade: "alta",
    descricao: "A NF voltou para pendente depois de ter título pago. Ao processar de novo, o CP nasce em aberto e pode ser pago em dobro.",
    correcao: "Processar a NF e baixar o título com a data e a conta do pagamento original (não pagar de novo)." },
  liberacao_excluida: { nome: "Liberação de contrato excluída", gravidade: "alta",
    descricao: "Entrada de dinheiro (liberação de contrato financeiro) já recebida foi apagada: o caixa fica sem essa entrada.",
    correcao: "Confirmar com o cliente se foi engano. Se sim, recriar a liberação no contrato financeiro." },
  estoque_negativo: { nome: "Estoque negativo na fazenda/depósito", gravidade: "media",
    descricao: "O saldo do produto ficou negativo numa fazenda dentro de um depósito (saída sem entrada correspondente, ex.: transferência saindo da fazenda errada).",
    correcao: "Verificar de onde o produto saiu de fato: falta NF de entrada, transferência anterior ou saldo inicial nessa fazenda." },
  nf_chave_repetida: { nome: "NF com a mesma chave mais de uma vez", gravidade: "baixa",
    descricao: "A mesma NF (chave de acesso) está cadastrada mais de uma vez, sem processamento duplicado.",
    correcao: "Usar Limpar Duplicatas em Documentos Fiscais." },
  nf_processada_2x: { nome: "NF processada duas vezes", gravidade: "alta",
    descricao: "A mesma NF (chave de acesso) foi processada mais de uma vez: estoque e financeiro em dobro.",
    correcao: "Estornar a cópia e excluí-la, mantendo uma só." },
  titulo_duplicado_nf: { nome: "Título duplicado na mesma NF", gravidade: "alta",
    descricao: "Dois títulos a pagar da mesma NF com mesmo valor e vencimento.",
    correcao: "Conferir qual é o correto e excluir a cópia (estornando a NF se necessário)." },
  baixa_acima_valor: { nome: "Pago acima do valor do título", gravidade: "media",
    descricao: "O valor pago é maior que o valor do título mais juros e multa informados.",
    correcao: "Corrigir a baixa (valor pago ou juros/multa) no Contas a Pagar/Receber." },
  titulo_em_nf_pendente: { nome: "Título ligado a NF pendente", gravidade: "media",
    descricao: "Título ainda ligado a uma NF que voltou para pendente: ao processar a NF de novo nasce outro título ao lado.",
    correcao: "Excluir o título que sobrou (ou processar a NF, que o reaproveita) e conferir se não ficou duplicado." },
  espelho_pj_sem_nf: { nome: "Título PJ sem Nº NF na tela do CP", gravidade: "baixa",
    descricao: "Título de Empresa gerado por nota aparece sem Nº NF no grid (o filtro de Nº NF não o encontra).",
    correcao: "Recalcular o espelho (Seção 360 do supabase_migrations.sql)." },
  status_inconsistente: { nome: "Pago mas com status em aberto", gravidade: "media",
    descricao: "Título com valor pago registrado e status em aberto (ou pago sem valor): a tela não mostra Parcial nem Estornar baixa, e o saldo aparece errado.",
    correcao: "Acertar o status: pago (se pago + desconto cobre o valor) ou parcial; depois, se for o caso, estornar a baixa pela tela." },
  espelho_divergente: { nome: "Tela do CP fora de sincronia", gravidade: "alta",
    descricao: "A quantidade de títulos na tela do CP/CR (rel_lancamentos) difere da origem.",
    correcao: "Recalcular o espelho rel_lancamentos." },
};

export type Achado = {
  regra: RegraId; chave: string; conta_id: string | null; fazenda_id: string | null;
  titulo: string; valor: number | null; detalhe: Record<string, unknown>;
};

// ── Base carregada ────────────────────────────────────────────────────────────
export type NfE = { id: string; fazenda_id: string; numero: string; emitente_nome: string | null; emitente_cnpj: string | null; valor_total: number | null; status: string; chave_acesso: string | null; cfop: string | null; nf_origem_id: string | null; pessoa_id: string | null; lancamento_id: string | null; emp_lancamento_id: string | null; processado_por: string | null; data_emissao: string | null; pedido_compra_id: string | null };
export type NfS = { id: string; fazenda_id: string; numero_nf: string; prestador_nome: string | null; prestador_id: string | null; valor_liquido: number | null; valor_servico: number | null; empresa_id: string | null; lancamento_id: string | null; processado_por: string | null; data_prestacao: string | null; status: string };
export type Tit = { id: string; tabela: "lancamentos" | "empresa_lancamentos"; fazenda_id: string; tipo: string; descricao: string | null; valor: number; valor_pago: number | null; status: string; pessoa_id: string | null; nf_entrada_id: string | null; contrato_financeiro_id: string | null; data_vencimento: string | null; numero_documento: string | null; origem: string | null; num_parcela: number | null; moeda: string | null; cotacao_usd: number | null; valor_multa: number | null; valor_juros: number | null; valor_desconto: number | null };
export type Excluido = { audit_id: string; quando: string; quem: string | null; tabela: "lancamentos" | "empresa_lancamentos"; antes: Record<string, unknown> };
export type Mov = { fazenda_id: string; deposito_id: string | null; insumo_id: string; tipo: string; quantidade: number; usuario_nome?: string | null; created_at?: string | null };
export type EspelhoPj = { id: string; nfe_numero: string | null };

export type Base = {
  contaDaFazenda: (fazendaId: string | null | undefined) => string | null;
  nfs: NfE[]; cfopsItens: Map<string, string[]>; nfse: NfS[]; titulos: Tit[]; excluidos: Excluido[]; movs: Mov[];
  espelhoPj: EspelhoPj[]; contagem: { lanc: number; relLanc: number; emp: number; relEmp: number };
  /** Exclusões (qualquer status) de títulos ligados a NF, para dizer quem apagou o título de uma NF sem título. */
  exclusoesNf?: Excluido[];
  nomeInsumo?: (id: string) => string; nomeDeposito?: (id: string | null) => string; nomeFazenda?: (id: string) => string;
};

const norm = (s: unknown) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/\s+/g, " ").trim();
const num = (v: unknown) => Number(v ?? 0) || 0;
const so = (s: unknown) => String(s ?? "").replace(/\D/g, "");

// CFOPs do emitente que não geram pagamento (remessa, retorno, bonificação, demonstração, comodato, transferência,
// conserto, armazenagem, cupom/NF de venda a consumidor referenciada). NF só com esses CFOPs não precisa de título.
export const CFOPS_SEM_FINANCEIRO = new Set(["5910", "6910", "5911", "6911", "5949", "6949", "5905", "6905", "5906", "6906", "5915", "6915",
  "5916", "6916", "5912", "6912", "5913", "6913", "5908", "6908", "5909", "6909", "5152", "6152", "5151", "6151", "5934", "6934", "5923",
  "6923", "5924", "6924", "5925", "6925", "5920", "6920", "5921", "6921", "5901", "6901", "5902", "6902", "5929", "6929"]);

function indicesTitulos(b: Base) {
  const porNf = new Map<string, Tit[]>();
  const porId = new Map<string, Tit>();
  for (const t of b.titulos) {
    porId.set(t.id, t);
    if (t.nf_entrada_id) porNf.set(t.nf_entrada_id, [...(porNf.get(t.nf_entrada_id) ?? []), t]);
  }
  return { porNf, porId };
}

/** Títulos ativos (não cancelados) que pertencem à NF: pelo vínculo, pelo ponteiro da NF ou pela descrição "NF n — ". */
function titulosDaNf(n: NfE, b: Base, ix: ReturnType<typeof indicesTitulos>): Tit[] {
  const conta = b.contaDaFazenda(n.fazenda_id);
  const diretos = [...(ix.porNf.get(n.id) ?? []), ...[n.lancamento_id, n.emp_lancamento_id].map(id => id ? ix.porId.get(id) : undefined).filter((t): t is Tit => !!t)];
  if (diretos.length) return diretos.filter(t => t.status !== "cancelado");
  const tag = norm(`NF ${n.numero}`);
  return b.titulos.filter(t => t.status !== "cancelado" && t.tipo === "pagar" && b.contaDaFazenda(t.fazenda_id) === conta
    && (norm(t.descricao).startsWith(tag + " ") || norm(t.descricao).includes(" " + tag + " ") || String(t.numero_documento ?? "").split(/\D/)[0] === String(n.numero))
    && (!n.pessoa_id || !t.pessoa_id || t.pessoa_id === n.pessoa_id));
}

export function regraNfSemTitulo(b: Base): Achado[] {
  const ix = indicesTitulos(b);
  const out: Achado[] = [];
  for (const n of b.nfs) {
    if (n.status !== "processada" || n.nf_origem_id || num(n.valor_total) <= 0) continue;   // devolução gera CR; valor zero não gera CP
    const cfops = [...(b.cfopsItens.get(n.id) ?? []), so(n.cfop)].filter(Boolean);
    if (cfops.length && cfops.every(c => CFOPS_SEM_FINANCEIRO.has(c))) continue;
    if (titulosDaNf(n, b, ix).length) continue;
    const exclusao = [...(b.exclusoesNf ?? []), ...b.excluidos].find(e => e.antes.nf_entrada_id === n.id);
    out.push({ regra: "nf_sem_titulo", chave: n.id, conta_id: b.contaDaFazenda(n.fazenda_id), fazenda_id: n.fazenda_id,
      titulo: `NF ${n.numero} — ${n.emitente_nome ?? ""}`, valor: num(n.valor_total),
      detalhe: { emissao: n.data_emissao, processado_por: n.processado_por, cfops: [...new Set(cfops)].join(", "), pedido: !!n.pedido_compra_id,
        titulo_excluido: exclusao ? { quando: exclusao.quando, quem: exclusao.quem ?? "rotina do sistema", valor: exclusao.antes.valor, status: exclusao.antes.status } : null } });
  }
  return out;
}

const GUIA = /RECEITA FEDERAL|CAIXA (ECONOMICA )?FEDERAL|\bFGTS\b|\bDARF\b|\bINSS\b|\bGPS\b/;
const ehGuia = (s: NfS) => GUIA.test(norm(s.prestador_nome)) || so(s.numero_nf).length >= 15;

export function regraNfseSemTitulo(b: Base): Achado[] {
  const ix = indicesTitulos(b);
  const out: Achado[] = [];
  for (const s of b.nfse) {
    if (s.status !== "processada") continue;
    if (s.lancamento_id && ix.porId.has(s.lancamento_id)) continue;
    const conta = b.contaDaFazenda(s.fazenda_id);
    const desc = norm(`NFS-e ${s.numero_nf} — ${s.prestador_nome ?? ""}`);
    const tem = b.titulos.some(t => t.status !== "cancelado" && b.contaDaFazenda(t.fazenda_id) === conta
      && (norm(t.descricao) === desc || (String(t.numero_documento ?? "") === String(s.numero_nf) && !!s.prestador_id && t.pessoa_id === s.prestador_id)));
    if (tem) continue;
    const valor = num(s.valor_liquido ?? s.valor_servico);
    out.push({ regra: ehGuia(s) ? "guia_como_nfse" : "nfse_sem_titulo", chave: s.id, conta_id: conta, fazenda_id: s.fazenda_id,
      titulo: `NFS-e ${s.numero_nf} — ${s.prestador_nome ?? ""}`, valor,
      detalhe: { prestacao: s.data_prestacao, processado_por: s.processado_por, empresa: !!s.empresa_id } });
  }
  return out;
}

/** Título pago apagado: hoje existe equivalente pago (ok), equivalente em aberto (baixa perdida) ou nada. */
export function regrasPagamentosApagados(b: Base): Achado[] {
  const out: Achado[] = [];
  const nfPorId = new Map(b.nfs.map(n => [n.id, n]));
  const vivos = new Set(b.titulos.map(t => t.id));
  for (const e of b.excluidos) {
    const a = e.antes;
    const tabela = e.tabela;
    const pago = tabela === "lancamentos" ? ["baixado", "parcial"].includes(String(a.status)) : ["pago", "parcial"].includes(String(a.status));
    if (!pago || vivos.has(String(a.id))) continue;
    const origem = String((tabela === "lancamentos" ? a.origem_lancamento : a.origem) ?? "");
    const dataBaixa = (tabela === "lancamentos" ? a.data_baixa : a.data_pagamento) as string | null;
    // Parcela de contrato marcada paga sem data de baixa é resíduo de geração errada de cronograma, não pagamento real
    if (origem === "contrato_financeiro" && !dataBaixa) continue;
    const v = num(a.valor);
    if (origem === "tesouraria" && v < 50) continue;
    const conta = b.contaDaFazenda(String(a.fazenda_id ?? ""));
    const cand = b.titulos.filter(t => t.tabela === tabela && b.contaDaFazenda(t.fazenda_id) === conta && t.tipo === a.tipo && Math.abs(num(t.valor) - v) < 0.02 && (
      (a.nf_entrada_id && t.nf_entrada_id === a.nf_entrada_id) ||
      (a.contrato_financeiro_id && t.contrato_financeiro_id === a.contrato_financeiro_id && (t.data_vencimento === a.data_vencimento || t.num_parcela === a.num_parcela)) ||
      norm(t.descricao) === norm(a.descricao)) && (!a.nf_entrada_id || !t.nf_entrada_id || t.nf_entrada_id === a.nf_entrada_id));
    const pagoHoje = cand.find(t => ["baixado", "parcial", "pago"].includes(t.status));
    if (pagoHoje) continue;
    // NF reprocessada com outro valor e já paga de novo: o pagamento continua registrado
    const nf = a.nf_entrada_id ? nfPorId.get(String(a.nf_entrada_id)) : undefined;
    const titulosNfHoje = a.nf_entrada_id ? b.titulos.filter(t => t.nf_entrada_id === a.nf_entrada_id) : [];
    if (nf?.status === "processada" && titulosNfHoje.length && titulosNfHoje.every(t => ["baixado", "parcial", "pago"].includes(t.status))) continue;
    const aberto = cand.find(t => !["baixado", "parcial", "pago", "cancelado"].includes(t.status))
      ?? (nf?.status === "processada" ? titulosNfHoje.find(t => !["baixado", "parcial", "pago", "cancelado"].includes(t.status)) : undefined);
    const det = { pago_em: dataBaixa, valor_pago: num(a.valor_pago ?? a.valor), conta_bancaria: a.conta_bancaria ?? a.conta_bancaria_id ?? null,
      excluido_em: e.quando, excluido_por: e.quem ?? "rotina do sistema", origem, tabela };
    const base = { conta_id: conta, fazenda_id: String(a.fazenda_id ?? "") || null, titulo: String(a.descricao ?? "(sem descrição)"), valor: num(a.valor_pago ?? a.valor) };
    if (aberto) out.push({ ...base, regra: "baixa_perdida", chave: e.audit_id, detalhe: { ...det, titulo_em_aberto_id: aberto.id, titulo_em_aberto_vencimento: aberto.data_vencimento, titulo_em_aberto_valor: aberto.valor } });
    else if (nf && nf.status === "pendente") out.push({ ...base, regra: "nf_pendente_ja_paga", chave: e.audit_id, detalhe: { ...det, nf: nf.numero } });
    else if (origem === "contrato_financeiro" && a.tipo === "receber") out.push({ ...base, regra: "liberacao_excluida", chave: e.audit_id, detalhe: det });
    else out.push({ ...base, regra: "pago_sem_titulo", chave: e.audit_id, detalhe: det });
  }
  return out;
}

export function regraEstoqueNegativo(b: Base): Achado[] {
  const saldo = new Map<string, { m: Mov; s: number }>();
  for (const m of b.movs) {
    const k = `${m.insumo_id}|${m.fazenda_id}|${m.deposito_id ?? ""}`;
    const cur = saldo.get(k) ?? { m, s: 0 };
    cur.s += (m.tipo === "entrada" ? 1 : m.tipo === "saida" ? -1 : 0) * num(m.quantidade);
    saldo.set(k, cur);
  }
  const saidas = new Map<string, Mov[]>();
  for (const m of b.movs) if (m.tipo === "saida") { const k = `${m.insumo_id}|${m.fazenda_id}|${m.deposito_id ?? ""}`; saidas.set(k, [...(saidas.get(k) ?? []), m]); }
  return [...saldo.entries()].filter(([, v]) => v.s < -0.001).map(([k, v]) => {
    // Quem lançou as saídas dessa fazenda nesse depósito (mais frequente primeiro) — liga o achado ao usuário
    const ss = saidas.get(k) ?? [];
    const freq = new Map<string, number>();
    for (const m of ss) if (m.usuario_nome) freq.set(m.usuario_nome, (freq.get(m.usuario_nome) ?? 0) + 1);
    const usuarios = [...freq.entries()].sort((x, y) => y[1] - x[1]).map(([u]) => u);
    const ultima = ss.map(m => m.created_at ?? "").sort().at(-1) || null;
    return {
      regra: "estoque_negativo" as const, chave: k, conta_id: b.contaDaFazenda(v.m.fazenda_id), fazenda_id: v.m.fazenda_id,
      titulo: `${b.nomeInsumo?.(v.m.insumo_id) ?? v.m.insumo_id} — ${b.nomeFazenda?.(v.m.fazenda_id) ?? ""} · ${b.nomeDeposito?.(v.m.deposito_id) ?? "sem depósito"}`,
      valor: null, detalhe: { saldo: Math.round(v.s * 1000) / 1000, usuarios, ultima_saida: ultima },
    };
  });
}

export function regrasDuplicidade(b: Base): Achado[] {
  const out: Achado[] = [];
  const porChave = new Map<string, NfE[]>();
  for (const n of b.nfs) if (n.chave_acesso && n.status !== "cancelada") porChave.set(n.chave_acesso, [...(porChave.get(n.chave_acesso) ?? []), n]);
  for (const [chave, g] of porChave) {
    if (g.length < 2) continue;
    const proc = g.filter(n => n.status === "processada").length;
    out.push({ regra: proc > 1 ? "nf_processada_2x" : "nf_chave_repetida", chave, conta_id: b.contaDaFazenda(g[0].fazenda_id), fazenda_id: g[0].fazenda_id,
      titulo: `NF ${g[0].numero} — ${g[0].emitente_nome ?? ""} (${g.length} cópias)`, valor: num(g[0].valor_total), detalhe: { copias: g.map(n => n.status), processadas: proc } });
  }
  const porTit = new Map<string, Tit[]>();
  for (const t of b.titulos) if (t.tipo === "pagar" && t.nf_entrada_id && t.status !== "cancelado") {
    const k = `${t.tabela}|${t.nf_entrada_id}|${num(t.valor).toFixed(2)}|${t.data_vencimento ?? ""}`;
    porTit.set(k, [...(porTit.get(k) ?? []), t]);
  }
  for (const [k, g] of porTit) if (g.length > 1) out.push({ regra: "titulo_duplicado_nf", chave: k, conta_id: b.contaDaFazenda(g[0].fazenda_id), fazenda_id: g[0].fazenda_id,
    titulo: `${g[0].descricao ?? ""} (${g.length}×)`, valor: num(g[0].valor), detalhe: { vencimento: g[0].data_vencimento, status: g.map(t => t.status) } });
  return out;
}

export function regraBaixaAcima(b: Base, excede: (t: Tit, pago: number) => boolean): Achado[] {
  return b.titulos.filter(t => t.tabela === "lancamentos" && num(t.valor_pago) > 0 && t.moeda !== "barter" && excede(t, num(t.valor_pago))).map(t => ({
    regra: "baixa_acima_valor" as const, chave: t.id, conta_id: b.contaDaFazenda(t.fazenda_id), fazenda_id: t.fazenda_id,
    titulo: t.descricao ?? "(sem descrição)", valor: num(t.valor_pago), detalhe: { valor_titulo: t.valor, valor_pago: t.valor_pago, juros: t.valor_juros, multa: t.valor_multa } }));
}

export function regraTituloEmNfPendente(b: Base): Achado[] {
  const st = new Map(b.nfs.map(n => [n.id, n]));
  return b.titulos.filter(t => t.nf_entrada_id && st.get(t.nf_entrada_id)?.status === "pendente" && t.status !== "cancelado").map(t => {
    const n = st.get(t.nf_entrada_id!)!;
    return { regra: "titulo_em_nf_pendente" as const, chave: t.id, conta_id: b.contaDaFazenda(t.fazenda_id), fazenda_id: t.fazenda_id,
      titulo: `${t.descricao ?? ""} (NF ${n.numero} pendente)`, valor: num(t.valor), detalhe: { status_titulo: t.status, tabela: t.tabela } };
  });
}

export function regrasEspelho(b: Base): Achado[] {
  const out: Achado[] = [];
  const empComNf = new Map(b.titulos.filter(t => t.tabela === "empresa_lancamentos" && (t.nf_entrada_id || (t.origem && t.origem !== "manual" && t.numero_documento))).map(t => [t.id, t]));
  for (const e of b.espelhoPj) {
    const t = empComNf.get(e.id);
    if (t && !e.nfe_numero) out.push({ regra: "espelho_pj_sem_nf", chave: e.id, conta_id: b.contaDaFazenda(t.fazenda_id), fazenda_id: t.fazenda_id, titulo: t.descricao ?? "", valor: num(t.valor), detalhe: {} });
  }
  const c = b.contagem;
  if (c.lanc !== c.relLanc || c.emp !== c.relEmp) out.push({ regra: "espelho_divergente", chave: "geral", conta_id: null, fazenda_id: null,
    titulo: "Espelho rel_lancamentos com quantidade diferente da origem", valor: null, detalhe: { ...c } });
  return out;
}

export function regraStatusInconsistente(b: Base): Achado[] {
  return b.titulos.filter(t => {
    const pago = num(t.valor_pago);
    const aberto = t.tabela === "lancamentos" ? ["em_aberto", "vencido", "vencendo"].includes(t.status) : t.status === "pendente";
    return aberto && pago > 0;
  }).map(t => ({ regra: "status_inconsistente" as const, chave: t.id, conta_id: b.contaDaFazenda(t.fazenda_id), fazenda_id: t.fazenda_id,
    titulo: t.descricao ?? "(sem descrição)", valor: num(t.valor), detalhe: { status: t.status, valor_titulo: t.valor, valor_pago: t.valor_pago, desconto: t.valor_desconto, tabela: t.tabela } }));
}

export function rodarRegras(b: Base, excede: (t: Tit, pago: number) => boolean): Achado[] {
  return [
    ...regraNfSemTitulo(b), ...regraNfseSemTitulo(b), ...regrasPagamentosApagados(b), ...regraEstoqueNegativo(b),
    ...regrasDuplicidade(b), ...regraBaixaAcima(b, excede), ...regraTituloEmNfPendente(b), ...regrasEspelho(b), ...regraStatusInconsistente(b),
  ];
}
