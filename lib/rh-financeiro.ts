// Rotinas financeiras de RH: férias (valor + CP) e rescisão. Cálculos puros no topo; persistência abaixo.
import { supabase } from "./supabase";
import type { Funcionario, FuncionarioFerias } from "./supabase";
import { criarLancamento, resolverOperacaoGerencialPorClassificacao } from "./db";

const r2 = (v: number) => Math.round(v * 100) / 100;
const iso = (d: Date) => d.toISOString().slice(0, 10);
const addDias = (isoData: string, n: number) => { const d = new Date(isoData + "T12:00:00"); d.setDate(d.getDate() + n); return iso(d); };

export const salarioReferencia = (f: Pick<Funcionario, "salario_base" | "complemento_salarial">) =>
  Number(f.salario_base ?? 0) + Number(f.complemento_salarial ?? 0);

// ── Férias ──────────────────────────────────────────────────────────────────
export function calcularFerias(salario: number, diasGozo: number, abono: boolean, diasAbono: number) {
  const dia = salario / 30;
  const ferias = r2(dia * diasGozo);
  const tercoFerias = r2(ferias / 3);
  const valAbono = abono ? r2(dia * diasAbono) : 0;
  const tercoAbono = abono ? r2(valAbono / 3) : 0;
  return { ferias, tercoFerias, valAbono, tercoAbono, totalFerias: r2(ferias + tercoFerias), totalAbono: r2(valAbono + tercoAbono), total: r2(ferias + tercoFerias + valAbono + tercoAbono) };
}

const ogCodigo = (f: Funcionario, base: "002" | "008" | "013") =>
  f.area_trabalho === "administrativo" ? `2.01.02.01.03.${base}` : `2.01.01.10.${base}`;

async function criarCP(f: Funcionario, fazendaId: string, descricao: string, categoria: string, valor: number, vencimento: string, og: "002" | "008" | "013") {
  const ogId = await resolverOperacaoGerencialPorClassificacao(fazendaId, ogCodigo(f, og));
  const l = await criarLancamento({
    fazenda_id: fazendaId, tipo: "pagar", moeda: "BRL", descricao, categoria, valor,
    data_lancamento: iso(new Date()), data_vencimento: vencimento, status: "em_aberto",
    auto: false, origem_lancamento: "manual", funcionario_id: f.id, operacao_gerencial_id: ogId,
  } as never);
  return l.id as string;
}

async function excluirCPsAbertos(ids: string[]) {
  if (!ids.length) return;
  const { data } = await supabase.from("lancamentos").select("id,status").in("id", ids);
  if ((data ?? []).some(l => l.status !== "em_aberto" && l.status !== "vencido")) {
    throw new Error("Há lançamento já baixado no Contas a Pagar. Reabra a baixa antes de desfazer.");
  }
  const { error } = await supabase.from("lancamentos").delete().in("id", ids);
  if (error) throw error;
}

export async function concederFerias(func: Funcionario, fazendaId: string, fer: FuncionarioFerias, p: {
  inicio: string; fim: string; dias: number; abono: boolean; diasAbono: number; valorFerias: number; valorAbono: number; dataPagamento: string;
}) {
  const ids: string[] = [];
  const nome = func.nome;
  if (p.valorFerias > 0) ids.push(await criarCP(func, fazendaId, `Férias — ${nome} — gozo ${p.inicio.split("-").reverse().join("/")}`, func.area_trabalho === "administrativo" ? "FÉRIAS - ADM" : "FÉRIAS - FAZ", p.valorFerias, p.dataPagamento, "002"));
  if (p.abono && p.valorAbono > 0) ids.push(await criarCP(func, fazendaId, `Abono pecuniário de férias — ${nome}`, func.area_trabalho === "administrativo" ? "FÉRIAS - ADM" : "FÉRIAS - FAZ", p.valorAbono, p.dataPagamento, "002"));
  const dados = {
    data_inicio_gozo: p.inicio, data_fim_gozo: p.fim, dias_gozados: p.dias,
    abono_pecuniario: p.abono, dias_abono: p.abono ? p.diasAbono : 0,
    valor_ferias: p.valorFerias, valor_abono: p.abono ? p.valorAbono : 0,
    lancado_financeiro: ids.length > 0, lancamento_ids: ids, data_pagamento: p.dataPagamento, status: "concedido" as const,
  };
  const { error } = await supabase.from("funcionario_ferias").update(dados).eq("id", fer.id);
  if (error) throw error;
  return { ...fer, ...dados } as FuncionarioFerias;
}

export async function cancelarConcessaoFerias(fer: FuncionarioFerias & { lancamento_ids?: string[] }) {
  await excluirCPsAbertos(fer.lancamento_ids ?? []);
  const fim = new Date(fer.periodo_fim + "T12:00:00");
  const dados = {
    data_inicio_gozo: null, data_fim_gozo: null, dias_gozados: null, abono_pecuniario: false, dias_abono: null,
    valor_ferias: null, valor_abono: null, lancado_financeiro: false, lancamento_ids: null, data_pagamento: null,
    status: fim > new Date() ? "aquisindo" : "disponivel",
  };
  const { error } = await supabase.from("funcionario_ferias").update(dados).eq("id", fer.id);
  if (error) throw error;
  return { ...fer, ...dados } as unknown as FuncionarioFerias;
}

export async function marcarFeriasGozada(id: string) {
  const { error } = await supabase.from("funcionario_ferias").update({ status: "gozado" }).eq("id", id);
  if (error) throw error;
}

// ── Rescisão ────────────────────────────────────────────────────────────────
export type TipoDesligamento = "sem_justa_causa" | "pedido_demissao" | "justa_causa" | "acordo" | "termino_contrato";
export type AvisoPrevio = "trabalhado" | "indenizado" | "dispensado";
export type VerbaRescisao = { codigo: string; descricao: string; valor: number; tipo: "provento" | "desconto"; nota?: string };

export const TIPOS_DESLIGAMENTO: Record<TipoDesligamento, string> = {
  sem_justa_causa: "Dispensa sem justa causa",
  pedido_demissao: "Pedido de demissão",
  justa_causa: "Dispensa por justa causa",
  acordo: "Acordo entre as partes (art. 484-A)",
  termino_contrato: "Término de contrato (safra/determinado)",
};

// meses (avos) com 15 dias ou mais trabalhados entre duas datas, dentro do período
function avos(inicio: string, fim: string): number {
  let n = 0;
  const a = new Date(inicio + "T12:00:00"), b = new Date(fim + "T12:00:00");
  const cur = new Date(a.getFullYear(), a.getMonth(), 1, 12);
  while (cur <= b) {
    const iniMes = new Date(cur.getFullYear(), cur.getMonth(), 1, 12);
    const fimMes = new Date(cur.getFullYear(), cur.getMonth() + 1, 0, 12);
    const de = a > iniMes ? a : iniMes, ate = b < fimMes ? b : fimMes;
    const dias = Math.round((ate.getTime() - de.getTime()) / 86400000) + 1;
    if (dias >= 15) n++;
    cur.setMonth(cur.getMonth() + 1);
  }
  return n;
}

export function calcularRescisao(p: {
  salario: number; admissao: string; desligamento: string; tipo: TipoDesligamento; aviso: AvisoPrevio;
  periodosFerias: Pick<FuncionarioFerias, "periodo_inicio" | "status">[];
}): { verbas: VerbaRescisao[]; avisoDias: number; dataProjetada: string; avisos: string[] } {
  const { salario, admissao, desligamento, tipo, aviso } = p;
  const dia = salario / 30;
  const verbas: VerbaRescisao[] = [];
  const avisos: string[] = [];
  const justa = tipo === "justa_causa";
  const iniciativaEmpregador = tipo === "sem_justa_causa" || tipo === "acordo";

  // tempo de casa em anos completos
  const adm = new Date(admissao + "T12:00:00"), des = new Date(desligamento + "T12:00:00");
  let anos = des.getFullYear() - adm.getFullYear();
  if (des < new Date(des.getFullYear(), adm.getMonth(), adm.getDate(), 12)) anos--;
  anos = Math.max(0, anos);
  const avisoDias = Math.min(90, 30 + 3 * anos);

  // 1. saldo de salário
  const diasMes = Math.min(30, des.getDate());
  verbas.push({ codigo: "saldo", descricao: `Saldo de salário (${diasMes} dias)`, valor: r2(dia * diasMes), tipo: "provento" });

  // 2. aviso prévio
  let dataProjetada = desligamento;
  if (aviso === "indenizado" && iniciativaEmpregador) {
    const dias = tipo === "acordo" ? avisoDias : avisoDias;
    const valor = r2(dia * dias * (tipo === "acordo" ? 0.5 : 1));
    verbas.push({ codigo: "aviso", descricao: `Aviso prévio indenizado (${dias} dias${tipo === "acordo" ? ", 50% — acordo" : ""})`, valor, tipo: "provento" });
    dataProjetada = addDias(desligamento, dias);
  } else if (aviso === "indenizado" && tipo === "pedido_demissao") {
    verbas.push({ codigo: "aviso_desc", descricao: "Desconto de aviso prévio não cumprido (30 dias)", valor: r2(dia * 30), tipo: "desconto" });
  }

  // 3. 13º proporcional
  if (!justa) {
    const ano = new Date(dataProjetada + "T12:00:00").getFullYear();
    const iniAno = adm.getFullYear() === ano ? admissao : `${ano}-01-01`;
    const n = Math.min(12, avos(iniAno, dataProjetada));
    if (n > 0) verbas.push({ codigo: "13", descricao: `13º salário proporcional (${n}/12)`, valor: r2((salario / 12) * n), tipo: "provento" });
  }

  // 4/5. férias — período aquisitivo em curso = último aniversário de admissão ≤ data projetada
  const proj = new Date(dataProjetada + "T12:00:00");
  let inicioCorrente = new Date(adm);
  while (true) {
    const prox = new Date(inicioCorrente); prox.setFullYear(prox.getFullYear() + 1);
    if (prox <= proj) inicioCorrente = prox; else break;
  }
  const inicioCorrenteIso = iso(inicioCorrente);
  const vencidas = p.periodosFerias.filter(f => (f.status === "disponivel" || f.status === "vencido") && f.periodo_inicio.slice(0, 10) < inicioCorrenteIso);
  for (const v of vencidas) {
    verbas.push({ codigo: `fv_${v.periodo_inicio}`, descricao: `Férias vencidas ${v.periodo_inicio.slice(0, 4)}/${Number(v.periodo_inicio.slice(0, 4)) + 1} + 1/3`, valor: r2(salario * 4 / 3), tipo: "provento" });
    if (v.status === "vencido") avisos.push(`O período ${v.periodo_inicio.slice(0, 4)}/${Number(v.periodo_inicio.slice(0, 4)) + 1} está vencido: pode haver pagamento em dobro (art. 137 da CLT). Confira com o contador e ajuste o valor.`);
  }
  if (!justa) {
    const n = Math.min(12, avos(inicioCorrenteIso, dataProjetada));
    if (n > 0) verbas.push({ codigo: "fp", descricao: `Férias proporcionais (${n}/12) + 1/3`, valor: r2((salario / 12) * n * 4 / 3), tipo: "provento" });
  } else if (tipo === "justa_causa") {
    avisos.push("Justa causa: sem 13º proporcional, férias proporcionais, aviso prévio e multa do FGTS.");
  }

  if (tipo === "termino_contrato") avisos.push("Término de contrato determinado: sem aviso prévio; a multa de 40% do FGTS não se aplica (o saque do FGTS é liberado).");
  return { verbas, avisoDias, dataProjetada, avisos };
}

export const multaFgtsPct = (tipo: TipoDesligamento) => tipo === "sem_justa_causa" ? 0.4 : tipo === "acordo" ? 0.2 : 0;

// estimativa do saldo de FGTS: 8% do salário por mês de casa (o dono pode corrigir com o extrato real)
export function estimarSaldoFgts(salario: number, admissao: string, desligamento: string) {
  const a = new Date(admissao + "T12:00:00"), d = new Date(desligamento + "T12:00:00");
  const meses = Math.max(0, (d.getFullYear() - a.getFullYear()) * 12 + d.getMonth() - a.getMonth() + (d.getDate() >= a.getDate() ? 1 : 0));
  return r2(salario * 0.08 * meses);
}

export async function lancarRescisao(func: Funcionario, fazendaId: string, p: {
  desligamento: string; tipo: TipoDesligamento; aviso: AvisoPrevio; salario: number; saldoFgts: number;
  verbas: VerbaRescisao[]; multaFgts: number; dataPagamento: string; obs?: string;
}) {
  const proventos = r2(p.verbas.filter(v => v.tipo === "provento").reduce((s, v) => s + v.valor, 0));
  const descontos = r2(p.verbas.filter(v => v.tipo === "desconto").reduce((s, v) => s + v.valor, 0));
  const liquido = r2(proventos - descontos);
  const adm = func.area_trabalho === "administrativo";
  const ids: string[] = [];
  if (liquido > 0) ids.push(await criarCP(func, fazendaId, `Rescisão — ${func.nome}`, adm ? "RESCISÃO - ADM" : "RESCISÃO - FAZ", liquido, p.dataPagamento, "008"));
  if (p.multaFgts > 0) ids.push(await criarCP(func, fazendaId, `Multa rescisória do FGTS — ${func.nome}`, adm ? "FGTS - ADM" : "FGTS - FAZ", p.multaFgts, p.dataPagamento, "013"));
  const { data, error } = await supabase.from("funcionario_rescisoes").insert({
    funcionario_id: func.id, fazenda_id: fazendaId, data_desligamento: p.desligamento, tipo_desligamento: p.tipo, aviso_previo: p.aviso,
    salario_base: p.salario, saldo_fgts: p.saldoFgts, verbas: p.verbas, total_proventos: proventos, total_descontos: descontos,
    total_liquido: liquido, multa_fgts: p.multaFgts, data_pagamento: p.dataPagamento, lancamento_ids: ids, status: "lancada", obs: p.obs || null,
  }).select().single();
  if (error) throw error;
  const up = await supabase.from("funcionarios").update({ ativo: false, data_demissao: p.desligamento }).eq("id", func.id);
  if (up.error) throw up.error;
  return data as RescisaoRegistro;
}

export type RescisaoRegistro = {
  id: string; funcionario_id: string; fazenda_id: string; data_desligamento: string; tipo_desligamento: TipoDesligamento; aviso_previo: AvisoPrevio;
  salario_base?: number; saldo_fgts?: number; verbas: VerbaRescisao[]; total_proventos: number; total_descontos: number; total_liquido: number;
  multa_fgts: number; data_pagamento?: string; lancamento_ids?: string[]; status: "lancada" | "estornada"; obs?: string;
};

export async function listarRescisoes(funcionarioId: string): Promise<RescisaoRegistro[]> {
  const { data, error } = await supabase.from("funcionario_rescisoes").select("*").eq("funcionario_id", funcionarioId).order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as RescisaoRegistro[];
}

export async function estornarRescisao(r: RescisaoRegistro) {
  await excluirCPsAbertos(r.lancamento_ids ?? []);
  const a = await supabase.from("funcionario_rescisoes").update({ status: "estornada" }).eq("id", r.id);
  if (a.error) throw a.error;
  const b = await supabase.from("funcionarios").update({ ativo: true, data_demissao: null }).eq("id", r.funcionario_id);
  if (b.error) throw b.error;
}
