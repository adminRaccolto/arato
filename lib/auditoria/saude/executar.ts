// Executor do auditor "Saúde dos dados": carrega a base de TODAS as contas (chave de serviço), roda as regras
// (regras.ts) e grava em auditoria_achados (Seção 361). Chamado pelo cron diário e pelo botão "Rodar agora".
import type { SupabaseClient } from "@supabase/supabase-js";
import { excedeLimiteBaixa } from "../../financeiro/baixa";
import { registrosDoAchado, responsavelDoAchado, type EventoBase } from "./responsaveis";
import { rodarRegras, REGRAS, type Achado, type Base, type Excluido, type Mov, type NfE, type NfS, type Tit, type RegraId } from "./regras";

async function todas<T>(sb: SupabaseClient, tab: string, cols: string, filtro?: (q: any) => any): Promise<T[]> { // eslint-disable-line @typescript-eslint/no-explicit-any
  const out: T[] = [];
  for (let de = 0; ; de += 1000) {
    let q = sb.from(tab).select(cols);
    if (filtro) q = filtro(q);
    const { data, error } = await q.order("id").range(de, de + 999);
    if (error) throw new Error(`${tab}: ${error.message}`);
    out.push(...((data ?? []) as T[]));
    if (!data || data.length < 1000) break;
  }
  return out;
}

async function contar(sb: SupabaseClient, tab: string, filtro?: (q: any) => any): Promise<number> { // eslint-disable-line @typescript-eslint/no-explicit-any
  let q = sb.from(tab).select("id", { count: "exact", head: true });
  if (filtro) q = filtro(q);
  const { count, error } = await q;
  if (error) throw new Error(`${tab}: ${error.message}`);
  return count ?? 0;
}

export async function carregarBase(sb: SupabaseClient): Promise<Base> {
  const [fazendas, nfs, itens, nfse, lanc, emp, dels, movs, espelhoPj, insumos, depositos] = await Promise.all([
    todas<{ id: string; conta_id: string | null; nome: string }>(sb, "fazendas", "id,conta_id,nome"),
    todas<NfE>(sb, "nf_entradas", "id,fazenda_id,numero,emitente_nome,emitente_cnpj,valor_total,status,chave_acesso,cfop,nf_origem_id,pessoa_id,lancamento_id,emp_lancamento_id,processado_por,data_emissao,pedido_compra_id"),
    todas<{ id: string; nf_entrada_id: string; cfop: string | null }>(sb, "nf_entrada_itens", "id,nf_entrada_id,cfop"),
    todas<NfS>(sb, "nf_servicos", "id,fazenda_id,numero_nf,prestador_nome,prestador_id,valor_liquido,valor_servico,empresa_id,lancamento_id,processado_por,data_prestacao,status", q => q.eq("status", "processada")),
    todas<Omit<Tit, "tabela" | "origem"> & { origem_lancamento: string | null }>(sb, "lancamentos",
      "id,fazenda_id,tipo,descricao,valor,valor_pago,status,pessoa_id,nf_entrada_id,contrato_financeiro_id,data_vencimento,numero_documento,origem_lancamento,num_parcela,moeda,cotacao_usd,valor_multa,valor_juros,valor_desconto"),
    todas<Omit<Tit, "tabela" | "contrato_financeiro_id" | "num_parcela" | "cotacao_usd">>(sb, "empresa_lancamentos",
      "id,fazenda_id,tipo,descricao,valor,valor_pago,status,pessoa_id,nf_entrada_id,data_vencimento,numero_documento,origem,moeda,valor_multa,valor_juros,valor_desconto"),
    todas<{ id: string; created_at: string; usuario_app: string | null; tabela: string; dados_antes: Record<string, unknown> }>(sb, "audit_log", "id,created_at,usuario_app,tabela,dados_antes",
      q => q.in("tabela", ["lancamentos", "empresa_lancamentos"]).eq("acao", "DELETE").in("dados_antes->>status", ["baixado", "parcial", "pago"])),
    todas<Mov & { id: string }>(sb, "movimentacoes_estoque", "id,fazenda_id,deposito_id,insumo_id,tipo,quantidade,usuario_nome,created_at"),
    todas<{ id: string; nfe_numero: string | null }>(sb, "rel_lancamentos", "id,nfe_numero", q => q.eq("origem_tabela", "empresa_lancamentos")),
    todas<{ id: string; nome: string }>(sb, "insumos", "id,nome"),
    todas<{ id: string; nome: string }>(sb, "depositos", "id,nome"),
  ]);
  const delsNf = await todas<{ id: string; created_at: string; usuario_app: string | null; tabela: string; dados_antes: Record<string, unknown> }>(sb, "audit_log", "id,created_at,usuario_app,tabela,dados_antes",
    q => q.in("tabela", ["lancamentos", "empresa_lancamentos"]).eq("acao", "DELETE").not("dados_antes->>nf_entrada_id", "is", null));
  const [nLanc, nRelLanc, nEmp, nRelEmp] = await Promise.all([
    contar(sb, "lancamentos"), contar(sb, "rel_lancamentos", q => q.eq("origem_tabela", "lancamentos")),
    contar(sb, "empresa_lancamentos"), contar(sb, "rel_lancamentos", q => q.eq("origem_tabela", "empresa_lancamentos")),
  ]);
  const contaDe = new Map(fazendas.map(f => [f.id, f.conta_id]));
  const nomeFaz = new Map(fazendas.map(f => [f.id, f.nome]));
  const nomeIns = new Map(insumos.map(i => [i.id, i.nome]));
  const nomeDep = new Map(depositos.map(d => [d.id, d.nome]));
  const cfopsItens = new Map<string, string[]>();
  for (const i of itens) if (i.cfop) cfopsItens.set(i.nf_entrada_id, [...(cfopsItens.get(i.nf_entrada_id) ?? []), String(i.cfop).replace(/\D/g, "")]);
  const titulos: Tit[] = [
    ...lanc.map(l => ({ ...l, tabela: "lancamentos" as const, origem: l.origem_lancamento })),
    ...emp.map(e => ({ ...e, tabela: "empresa_lancamentos" as const, contrato_financeiro_id: null, num_parcela: null, cotacao_usd: null })),
  ];
  const comoExcluido = (d: { id: string; created_at: string; usuario_app: string | null; tabela: string; dados_antes: Record<string, unknown> }): Excluido =>
    ({ audit_id: d.id, quando: d.created_at, quem: d.usuario_app, tabela: d.tabela as Excluido["tabela"], antes: d.dados_antes ?? {} });
  const excluidos = dels.map(comoExcluido);
  return {
    contaDaFazenda: id => (id ? contaDe.get(id) ?? null : null),
    nfs, cfopsItens, nfse, titulos, excluidos, movs, espelhoPj, exclusoesNf: delsNf.map(comoExcluido),
    contagem: { lanc: nLanc, relLanc: nRelLanc, emp: nEmp, relEmp: nRelEmp },
    nomeInsumo: id => nomeIns.get(id) ?? id, nomeDeposito: id => (id ? nomeDep.get(id) ?? id : "sem depósito"), nomeFazenda: id => nomeFaz.get(id) ?? "",
  };
}

type Existente = { id: string; regra: string; chave: string; status: string };

export async function executarAuditoria(sb: SupabaseClient, origem: string) {
  const inicio = Date.now();
  try {
    const base = await carregarBase(sb);
    const achados = rodarRegras(base, (t, pago) => excedeLimiteBaixa(t, pago));
    const unicos = new Map<string, Achado>();
    for (const a of achados) unicos.set(`${a.regra}|${a.chave}`, a);
    // Liga cada achado à auditoria: registros que contam a história e o responsável provável
    const regsPorAchado = new Map<string, string[]>();
    for (const [k, a] of unicos) regsPorAchado.set(k, registrosDoAchado(a, base));
    const todosRegs = [...new Set([...regsPorAchado.values()].flat())];
    const eventos: EventoBase[] = [];
    for (let i = 0; i < todosRegs.length; i += 150) {
      const { data, error } = await sb.from("audit_log")
        .select("id,tabela,registro_id,acao,usuario_app,created_at,campos_alterados,antes_status:dados_antes->>status,depois_status:dados_depois->>status,depois_origem:dados_depois->>origem")
        .in("registro_id", todosRegs.slice(i, i + 150));
      if (error) throw new Error(`auditoria dos achados: ${error.message}`);
      eventos.push(...((data ?? []) as EventoBase[]));
    }
    const evPorReg = new Map<string, EventoBase[]>();
    for (const e of eventos) if (e.registro_id) evPorReg.set(e.registro_id, [...(evPorReg.get(e.registro_id) ?? []), e]);
    for (const [k, a] of unicos) {
      const regs = regsPorAchado.get(k) ?? [];
      const resp = responsavelDoAchado(a, base, regs.flatMap(r => evPorReg.get(r) ?? []));
      a.detalhe = { ...a.detalhe, registros: regs, ...(resp ? { responsavel: resp } : {}) };
    }
    const existentes = await todas<Existente>(sb, "auditoria_achados", "id,regra,chave,status");
    const porChave = new Map(existentes.map(e => [`${e.regra}|${e.chave}`, e]));
    const agora = new Date().toISOString();
    let novos = 0;
    const linhas = [...unicos.values()].map(a => {
      const ex = porChave.get(`${a.regra}|${a.chave}`);
      // Resolvido que voltou a acontecer é reaberto; em análise e ignorado mantêm o status dado pela equipe
      const status = !ex ? "novo" : ex.status === "resolvido" ? "novo" : ex.status;
      if (!ex || ex.status === "resolvido") novos++;
      return { regra: a.regra, chave: a.chave, conta_id: a.conta_id, fazenda_id: a.fazenda_id || null, titulo: a.titulo.slice(0, 500), valor: a.valor,
        detalhe: a.detalhe, status, ultimo_em: agora, ...(status === "novo" ? { resolvido_em: null } : {}) };
    });
    for (let i = 0; i < linhas.length; i += 500) {
      const { error } = await sb.from("auditoria_achados").upsert(linhas.slice(i, i + 500), { onConflict: "regra,chave" });
      if (error) throw new Error(`gravar achados: ${error.message}`);
    }
    // Não acontece mais → resolvido automaticamente (ignorados ficam como estão)
    const sumiram = existentes.filter(e => !unicos.has(`${e.regra}|${e.chave}`) && (e.status === "novo" || e.status === "em_analise")).map(e => e.id);
    for (let i = 0; i < sumiram.length; i += 200) {
      const { error } = await sb.from("auditoria_achados").update({ status: "resolvido", resolvido_em: agora, atualizado_por: "auditor (não ocorre mais)" }).in("id", sumiram.slice(i, i + 200));
      if (error) throw new Error(`resolver achados: ${error.message}`);
    }
    const porRegra: Record<string, number> = {};
    for (const l of linhas) if (l.status !== "ignorado") porRegra[l.regra] = (porRegra[l.regra] ?? 0) + 1;
    const abertos = linhas.filter(l => l.status === "novo" || l.status === "em_analise").length;
    const resumo = { abertos, novos, resolvidos: sumiram.length, por_regra: porRegra, duracao_ms: Date.now() - inicio };
    await sb.from("auditoria_execucoes").insert({ origem, ...resumo });
    return { ok: true as const, ...resumo };
  } catch (e) {
    const erro = e instanceof Error ? e.message : String(e);
    await sb.from("auditoria_execucoes").insert({ origem, erro, duracao_ms: Date.now() - inicio });
    return { ok: false as const, erro };
  }
}

export function nomeRegra(regra: string) { return REGRAS[regra as RegraId]?.nome ?? regra; }
