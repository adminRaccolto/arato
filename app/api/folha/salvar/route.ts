import { falharSeErro } from "../../../../lib/db-util";
import { hojeLocal } from "../../../../lib/data-local";
import { NextResponse } from "next/server";
import { vencimentoSalario } from "../../../../lib/folha-calculo";
import { createClient } from "../../../../lib/supabase-servidor";
import { consumirPrevisao, tabelaPrevisoesAusente } from "../../../../lib/financeiro/previsoes-server";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function resolverOgPorClassificacao(sb: any, fazenda_id: string, classificacao: string): Promise<string | null> {
  const { data: fazendaRow } = await sb.from("fazendas").select("conta_id").eq("id", fazenda_id).maybeSingle();
  const parts = ["and(fazenda_id.is.null,conta_id.is.null)"];
  if (fazendaRow?.conta_id) parts.push(`conta_id.eq.${fazendaRow.conta_id}`);
  parts.push(`fazenda_id.eq.${fazenda_id}`);
  const { data } = await sb.from("operacoes_gerenciais")
    .select("id").or(parts.join(",")).eq("classificacao", classificacao).eq("inativo", false)
    .limit(1).maybeSingle();
  return data?.id ?? null;
}

// Usa service_role_key para contornar JWT expirado / RLS em folha_pagamento.
// Valida o token do usuário antes de executar qualquer operação.
// Enquanto a Seção 338 (CHECK de origem_lancamento com 'folha') não foi aplicada no banco, o insert com
// origem "folha" é rejeitado (23514). Nesse caso grava como "manual" em vez de travar a folha inteira.
/** Adiantamento de gratificação: a soma adiantada na competência não pode passar da gratificação lançada
 *  no cadastro do funcionário. O excedente é tratado fora do sistema (empréstimo a terceiros). */
async function validarAdiantamentoGratificacao(
  sb: any,
  p: { funcionario_id: string; competencia_ref?: string | null; valor: number; ignorarId?: string },
): Promise<string | null> {
  const comp = String(p.competencia_ref ?? "").slice(0, 7);
  if (!/^\d{4}-\d{2}$/.test(comp)) return "Adiantamento de gratificação: informe a competência da gratificação.";
  // A folha (aba Gratificações, e o que a tela mostra como "Gratificação lançada") usa funcionarios_premiacoes; a aba
  // Premiações do cadastro grava em funcionario_premiacoes. Só esta segunda era lida: a tela mostrava R$ 10.000 lançados
  // e o servidor recusava dizendo que não havia gratificação. Vale a da folha; sem ela, a do cadastro.
  const somaComp = (rows: any[] | null) => (rows ?? []).filter((x: any) => String(x.mes_referencia).slice(0, 7) === comp).reduce((s: number, x: any) => s + Number(x.valor || 0), 0);
  const { data: premFolha, error: e1 } = await sb.from("funcionarios_premiacoes").select("valor, mes_referencia").eq("funcionario_id", p.funcionario_id);
  if (e1) return `Não foi possível ler as gratificações do funcionário: ${e1.message}`;
  let lancada = somaComp(premFolha);
  if (lancada <= 0) {
    const { data: premCad } = await sb.from("funcionario_premiacoes").select("valor, mes_referencia").eq("funcionario_id", p.funcionario_id);
    lancada = somaComp(premCad);
  }
  if (lancada <= 0) return "Não há gratificação lançada para este funcionário nessa competência. Lance antes na Folha de Pagamento, aba Gratificações.";
  const { data: adis, error: e2 } = await sb.from("adiantamentos_salario").select("id, valor, competencia_ref, status").eq("funcionario_id", p.funcionario_id).eq("tipo", "gratificacao");
  if (e2) return "Aplique a Seção 344 do supabase_migrations.sql para usar adiantamento de gratificação.";
  const adiantado = (adis ?? []).filter((a: any) => a.status !== "cancelado" && a.id !== p.ignorarId && String(a.competencia_ref ?? "").slice(0, 7) === comp)
    .reduce((s: number, a: any) => s + Number(a.valor || 0), 0);
  const disponivel = Math.round((lancada - adiantado) * 100) / 100;
  if (Number(p.valor) > disponivel + 0.005) {
    return `O valor excede a gratificação disponível na competência (R$ ${disponivel.toFixed(2).replace(".", ",")}). O excedente deve ser lançado manualmente como empréstimo a terceiros.`;
  }
  return null;
}

async function inserirLancamentoFolha(sb: any, row: Record<string, unknown>) {
  let r = await sb.from("lancamentos").insert(row).select("id").single();
  if (r.error?.code === "23514" && String(r.error.message ?? "").includes("origem_lancamento")) {
    r = await sb.from("lancamentos").insert({ ...row, origem_lancamento: "manual" }).select("id").single();
  }
  return r;
}

const MESES_ABREV = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];
function rotuloCompetencia(competencia: string): string {
  const [ano, mes] = competencia.split("-");
  return `${MESES_ABREV[parseInt(mes) - 1]}/${ano}`;
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function liquidoItem(it: any): number {
  return Math.max(0, Math.round((
    it.salario_bruto - it.inss_trabalhador - it.irrf - it.adiantamento
    - it.outros_descontos + it.vale_transporte + it.vale_refeicao + it.outros_beneficios
    + (it.complemento_salarial ?? 0)
  ) * 100) / 100);
}
function vencimentoEncargoFolha(competencia: string): string {
  const [ano, mes] = competencia.split("-").map(Number);
  const prox = mes === 12 ? { a: ano + 1, m: 1 } : { a: ano, m: mes + 1 };
  return `${prox.a}-${String(prox.m).padStart(2, "0")}-20`;
}

/** Registra no módulo Previsão de Gastos (Seção 352) a previsão que a folha acabou de lançar no CP. Sem a tabela
 *  (migration pendente) ou sem OG, o título de previsão continua valendo sozinho, como antes. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function registrarPrevisaoFolha(sb: any, r: {
  conta_id: string | null; fazenda_id: string; produtor_id: string | null; empresa_id: string | null; og_id: string | null;
  descricao: string; valor: number; data_vencimento: string; ano_safra_id: string | null; folha_id: string; titulo_id: string | null;
}): Promise<void> {
  if (!r.conta_id || !r.og_id || !r.titulo_id || !(r.valor > 0)) return;
  const { data: og } = await sb.from("operacoes_gerenciais").select("classificacao").eq("id", r.og_id).maybeSingle();
  if (!og?.classificacao) return;
  const { data, error } = await sb.from("previsoes_gasto").insert({
    conta_id: r.conta_id, fazenda_id: r.fazenda_id, produtor_id: r.produtor_id, empresa_id: r.empresa_id,
    operacao_gerencial_id: r.og_id, og_classificacao: og.classificacao, ano_safra_id: r.ano_safra_id,
    descricao: r.descricao, valor: r.valor, saldo: r.valor, data_vencimento: r.data_vencimento,
    status: "aberta", origem: "folha", folha_id: r.folha_id, lancamento_previsao_id: r.titulo_id,
  }).select("id").single();
  if (error) { if (!tabelaPrevisoesAusente(error)) console.error("[folha] previsão de gastos:", error.message); return; }
  await sb.from("lancamentos").update({ previsao_gasto_id: data.id }).eq("id", r.titulo_id);
}

/** Título da folha virou real: consome a previsão ligada a ele (se houver), com o valor final. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function consumirPrevisaoDoTitulo(sb: any, tituloId: string | null | undefined, valor: number): Promise<void> {
  if (!tituloId || !(valor > 0)) return;
  const { data, error } = await sb.from("lancamentos").select("previsao_gasto_id").eq("id", tituloId).maybeSingle();
  if (error || !data?.previsao_gasto_id) return;
  const { data: prev } = await sb.from("previsoes_gasto").select("status").eq("id", data.previsao_gasto_id).maybeSingle();
  if (prev?.status !== "aberta") return;
  try { await consumirPrevisao(sb, { previsao_id: data.previsao_gasto_id, valor, lancamento_id: tituloId, origem: "folha" }); }
  catch (e) { console.error("[folha] consumir previsão:", e instanceof Error ? e.message : e); }
}

/** Remove as linhas da Previsão de Gastos geradas por esta folha (são refeitas a partir dela). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function apagarPrevisoesDaFolha(sb: any, folhaId: string): Promise<void> {
  const { error } = await sb.from("previsoes_gasto").delete().eq("folha_id", folhaId).eq("origem", "folha");
  if (error && !tabelaPrevisoesAusente(error)) console.error("[folha] apagar previsões:", error.message);
}

// Adiantamento lançado, editado ou cancelado: as folhas em rascunho com o funcionário refazem a previsão do salário no CP
// (senão ela ficava com o valor antigo até alguém salvar a folha de novo). Falha aqui não desfaz o adiantamento.
/* eslint-disable @typescript-eslint/no-explicit-any */
async function ressincronizarFolhasDoFuncionario(sb: any, funcionarioId: string | null | undefined): Promise<void> {
  if (!funcionarioId) return;
  try {
    const { data: linhas } = await sb.from("folha_funcionarios").select("folha_id").eq("funcionario_id", funcionarioId);
    const ids = [...new Set((linhas ?? []).map((l: any) => l.folha_id as string))];
    if (!ids.length) return;
    const { data: rascunhos } = await sb.from("folha_pagamento").select("id").in("id", ids).eq("status", "rascunho");
    for (const f of rascunhos ?? []) await sincronizarPrevisoesFolha(sb, f.id as string);
  } catch (e) {
    console.error("[folha] ressincronizar previsões após adiantamento", e);
  }
}
/* eslint-enable @typescript-eslint/no-explicit-any */

/** Folha em rascunho já aparece no Contas a Pagar e no fluxo de caixa como PREVISÃO (natureza "previsao"):
 *  um título por funcionário + FGTS + INSS Patronal. Ao fechar a folha (ou ao efetivar o título no CP) a
 *  previsão vira título real com o valor que estiver nela. Refaz todas as previsões da folha a partir das
 *  linhas gravadas — chamado ao salvar a folha e ao reabri-la. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function sincronizarPrevisoesFolha(sb: any, folhaId: string): Promise<void> {
  const { data: folha } = await sb.from("folha_pagamento").select("*").eq("id", folhaId).maybeSingle();
  if (!folha || folha.status === "fechado") return;
  const { fazenda_id, empresa_id, competencia } = folha as { fazenda_id: string; empresa_id: string | null; competencia: string };
  const { data: itens } = await sb.from("folha_funcionarios").select("*").eq("folha_id", folhaId);
  const hoje = hojeLocal();
  const vencimento = (folha.data_vencimento as string | null) || vencimentoSalario(competencia);
  const rotulo = rotuloCompetencia(competencia);

  // Adiantamento da linha = soma dos pendentes do funcionário (da competência ou sem competência) — mesma regra do
  // fechamento. Antes valia o que a tela mandava: linha incluída à mão ia com 0 e a previsão do salário entrava cheia no
  // CP (ex.: R$ 3.864,33 em vez de R$ 3.164,33 com adiantamento de R$ 700), mesmo a folha mostrando o desconto.
  const funcIds = (itens ?? []).map((i: any) => i.funcionario_id).filter(Boolean) as string[];
  if (funcIds.length) {
    const { data: adis } = await sb.from("adiantamentos_salario").select("funcionario_id, valor")
      .eq("status", "pendente").in("funcionario_id", funcIds).or(`competencia_ref.eq.${competencia},competencia_ref.is.null`);
    const soma: Record<string, number> = {};
    for (const a of adis ?? []) soma[a.funcionario_id] = (soma[a.funcionario_id] ?? 0) + Number(a.valor ?? 0);
    for (const it of (itens ?? []) as any[]) {
      if (!it.funcionario_id) continue;
      const pend = Math.round((soma[it.funcionario_id] ?? 0) * 100) / 100;
      if (Math.abs(pend - Number(it.adiantamento ?? 0)) > 0.005) {
        await falharSeErro(sb.from("folha_funcionarios").update({ adiantamento: pend }).eq("id", it.id), "adiantamento da folha");
        it.adiantamento = pend;
      }
    }
  }

  // Previsões antigas (salário já ligado às linhas + encargos) saem para entrar as novas; título real nunca é tocado.
  const antigos = [
    ...(itens ?? []).map((i: any) => i.cp_lancamento_id),
    folha.cp_fgts_id, folha.cp_inss_patronal_id,
  ].filter(Boolean) as string[];
  // Título de previsão que já foi pago (conciliação/baixa antes da trava) fica como está e não ganha previsão nova
  const pagos = new Set<string>();
  if (antigos.length) {
    const { data: st } = await sb.from("lancamentos").select("id, status").in("id", antigos);
    for (const t of st ?? []) if (t.status === "baixado" || t.status === "parcial") pagos.add(t.id as string);
  }
  await apagarPrevisoesDaFolha(sb, folhaId);
  if (antigos.length) {
    await falharSeErro(sb.from("lancamentos").delete().in("id", antigos).eq("natureza", "previsao").not("status", "in", "(baixado,parcial)"), "excluir previsões da folha");
  }
  const { data: fazRow } = await sb.from("fazendas").select("conta_id").eq("id", fazenda_id).maybeSingle();
  const contaFolha = (fazRow?.conta_id as string | undefined) ?? null;

  const ogSalario = await resolverOgPorClassificacao(sb, fazenda_id, "2.01.01.10.001");
  let anoSafra: string | null = null;
  try {
    const { data: as1 } = await sb.rpc("fn_ano_safra_da_data", { p_fazenda: fazenda_id, p_data: vencimento });
    if (typeof as1 === "string") anoSafra = as1;
  } catch { /* sem ano safra para a data */ }
  const idsFuncs = (itens ?? []).map((i: any) => i.funcionario_id).filter(Boolean) as string[];
  const vinculo: Record<string, { produtor_id: string | null; empresa_id: string | null }> = {};
  if (idsFuncs.length) {
    const { data: fs } = await sb.from("funcionarios").select("id, produtor_id, empresa_id").in("id", idsFuncs);
    for (const f of fs ?? []) vinculo[f.id as string] = { produtor_id: (f as any).produtor_id ?? null, empresa_id: (f as any).empresa_id ?? null };
  }

  for (const it of (itens ?? []) as any[]) {
    if (it.cp_lancamento_id && pagos.has(it.cp_lancamento_id)) continue;
    const { data: lanc, error } = await inserirLancamentoFolha(sb, {
      fazenda_id,
      empresa_id: empresa_id ?? vinculo[it.funcionario_id]?.empresa_id ?? null,
      produtor_id: it.produtor_id ?? vinculo[it.funcionario_id]?.produtor_id ?? null,
      funcionario_id: it.funcionario_id ?? null,
      ano_safra_id: anoSafra,
      natureza: "previsao", tipo: "pagar",
      descricao: `Salário ${rotulo} — ${it.nome_funcionario}`,
      valor: liquidoItem(it), moeda: "BRL", status: "em_aberto",
      categoria: "Pessoal / Salários", origem_lancamento: "folha",
      operacao_gerencial_id: ogSalario,
      data_vencimento: vencimento, data_lancamento: hoje,
    });
    if (error) throw new Error(`Previsão ${it.nome_funcionario}: ${error.message}`);
    await sb.from("folha_funcionarios").update({ cp_lancamento_id: lanc?.id ?? null }).eq("id", it.id);
    await registrarPrevisaoFolha(sb, {
      conta_id: contaFolha, fazenda_id, produtor_id: it.produtor_id ?? vinculo[it.funcionario_id]?.produtor_id ?? null,
      empresa_id: empresa_id ?? vinculo[it.funcionario_id]?.empresa_id ?? null, og_id: ogSalario,
      descricao: `Salário ${rotulo} — ${it.nome_funcionario}`, valor: liquidoItem(it), data_vencimento: vencimento,
      ano_safra_id: anoSafra, folha_id: folhaId, titulo_id: lanc?.id ?? null,
    });
  }

  const produtorIdFolha = ((itens ?? []) as any[]).find(it => it.produtor_id)?.produtor_id ?? null;
  const totalFGTS = ((itens ?? []) as any[]).reduce((s, it) => s + (it.fgts ?? 0), 0);
  const totalINSSPat = ((itens ?? []) as any[]).reduce((s, it) => s + (it.inss_patronal ?? 0), 0);
  const vencEncargo = vencimentoEncargoFolha(competencia);
  let cpFgts: string | null = folha.cp_fgts_id && pagos.has(folha.cp_fgts_id) ? folha.cp_fgts_id : null;
  let cpInss: string | null = folha.cp_inss_patronal_id && pagos.has(folha.cp_inss_patronal_id) ? folha.cp_inss_patronal_id : null;
  if (totalFGTS > 0.005 && !cpFgts) {
    const og = await resolverOgPorClassificacao(sb, fazenda_id, "2.01.01.10.013");
    const { data: l, error } = await inserirLancamentoFolha(sb, {
      fazenda_id, empresa_id: empresa_id ?? null, produtor_id: produtorIdFolha,
      natureza: "previsao", tipo: "pagar", descricao: `FGTS ${rotulo}`,
      valor: Math.round(totalFGTS * 100) / 100, moeda: "BRL", status: "em_aberto",
      categoria: "Pessoal / Encargos", origem_lancamento: "folha", operacao_gerencial_id: og,
      data_vencimento: vencEncargo, data_lancamento: hoje,
    });
    if (error) throw new Error(`Previsão FGTS: ${error.message}`);
    cpFgts = l?.id ?? null;
    await registrarPrevisaoFolha(sb, { conta_id: contaFolha, fazenda_id, produtor_id: produtorIdFolha, empresa_id: empresa_id ?? null, og_id: og,
      descricao: `FGTS ${rotulo}`, valor: Math.round(totalFGTS * 100) / 100, data_vencimento: vencEncargo, ano_safra_id: null, folha_id: folhaId, titulo_id: cpFgts });
  }
  if (empresa_id && totalINSSPat > 0.005 && !cpInss) {
    const og = await resolverOgPorClassificacao(sb, fazenda_id, "2.01.01.10.014");
    const { data: l, error } = await inserirLancamentoFolha(sb, {
      fazenda_id, empresa_id, produtor_id: null,
      natureza: "previsao", tipo: "pagar", descricao: `INSS Patronal ${rotulo}`,
      valor: Math.round(totalINSSPat * 100) / 100, moeda: "BRL", status: "em_aberto",
      categoria: "Pessoal / Encargos", origem_lancamento: "folha", operacao_gerencial_id: og,
      data_vencimento: vencEncargo, data_lancamento: hoje,
    });
    if (error) throw new Error(`Previsão INSS Patronal: ${error.message}`);
    cpInss = l?.id ?? null;
    await registrarPrevisaoFolha(sb, { conta_id: contaFolha, fazenda_id, produtor_id: null, empresa_id, og_id: og,
      descricao: `INSS Patronal ${rotulo}`, valor: Math.round(totalINSSPat * 100) / 100, data_vencimento: vencEncargo, ano_safra_id: null, folha_id: folhaId, titulo_id: cpInss });
  }
  // Seção 261 ausente: a coluna não existe e a previsão de encargo não fica rastreada (mesmo limite já existente no fechamento)
  await sb.from("folha_pagamento").update({ cp_fgts_id: cpFgts, cp_inss_patronal_id: cpInss }).eq("id", folhaId);
}

/** Reprocessar folha fechada é rotina liberada por grupo de usuário (Configurações → Usuários → grupo → Folha de
 *  Pagamento → Reprocessar). Grupo sem a Folha configurada = liberado (regra geral das permissões do sistema). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function semPermissaoReprocessar(sb: any, userId: string): Promise<string | null> {
  const { data: perfil } = await sb.from("perfis").select("role").eq("user_id", userId).maybeSingle();
  if (String(perfil?.role ?? "").startsWith("raccotlo") || perfil?.role === "bpo") return null;
  const { data: u } = await sb.from("usuarios").select("grupos_usuarios(permissoes)").eq("auth_user_id", userId).maybeSingle();
  const g = Array.isArray(u?.grupos_usuarios) ? u?.grupos_usuarios[0] : u?.grupos_usuarios;
  const p = (g?.permissoes ?? {})["folha"];
  if (Array.isArray(p) && p.length > 0 && !p.includes("reprocessar")) return "Seu grupo de usuário não tem permissão para reprocessar folha fechada (Configurações → Usuários e Permissões).";
  return null;
}

class FolhaFechadaError extends Error {}
/** Folha fechada não aceita alteração: precisa ser reaberta (Reabrir Folha) antes. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function exigirFolhaAberta(sb: any, folhaId: string): Promise<void> {
  const { data } = await sb.from("folha_pagamento").select("status, competencia").eq("id", folhaId).maybeSingle();
  if (data?.status === "fechado") throw new FolhaFechadaError(`A folha de ${String(data.competencia ?? "")} está fechada. Para alterar, reabra a folha primeiro (↩ Reabrir Folha).`);
}

export async function POST(req: Request) {
  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!token) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  // Valida o token do usuário
  const { data: { user }, error: authErr } = await sb.auth.getUser(token);
  if (authErr || !user) return NextResponse.json({ error: "Token inválido" }, { status: 401 });

  try {
    const body = await req.json();
    const { operacao, ...payload } = body as { operacao: string } & Record<string, unknown>;

    // ─── listar_folhas — inclui contagem de funcionários por folha ───────────
    // Escopo por CONTA (todas as fazendas), não só a fazenda ativa no
    // momento — senão uma folha criada com outra fazenda ativa "some" da
    // lista assim que o usuário troca de fazenda no TopNav (Seção 261).
    if (operacao === "listar_folhas") {
      const { fazenda_id, fazenda_ids } = payload as { fazenda_id?: string; fazenda_ids?: string[] };
      const ids = fazenda_ids?.length ? fazenda_ids : fazenda_id ? [fazenda_id] : [];
      if (!ids.length) return NextResponse.json({ ok: true, data: [] });
      const { data, error } = await sb
        .from("folha_pagamento")
        .select("*")
        .in("fazenda_id", ids)
        .order("competencia", { ascending: false });
      if (error) throw error;

      // Conta funcionários por folha em uma única query
      const folhaIds = (data ?? []).map((f: any) => f.id);
      let countMap: Record<string, number> = {};
      if (folhaIds.length > 0) {
        const { data: counts } = await sb
          .from("folha_funcionarios")
          .select("folha_id, cp_lancamento_id")
          .in("folha_id", folhaIds);
        const semPrevisao = new Set<string>();
        (counts ?? []).forEach((row: any) => {
          countMap[row.folha_id] = (countMap[row.folha_id] ?? 0) + 1;
          if (!row.cp_lancamento_id) semPrevisao.add(row.folha_id);
        });
        // Folha em rascunho gerada antes da previsão no CP: lança as previsões na primeira listagem (uma vez só,
        // depois as linhas já ficam ligadas aos títulos). Falha aqui nunca derruba a listagem.
        // Rascunhos lançados antes da Previsão de Gastos (Seção 352): títulos de previsão sem linha no módulo
        const rascunhos = (data ?? []).filter((f: any) => f.status === "rascunho");
        const { error: semTabela } = await sb.from("previsoes_gasto").select("id", { head: true, count: "exact" }).limit(1);
        if (!semTabela && rascunhos.length) {
          const titulosPorFolha = new Map<string, string>();
          (counts ?? []).forEach((row: any) => { if (row.cp_lancamento_id && rascunhos.some((f: any) => f.id === row.folha_id)) titulosPorFolha.set(row.cp_lancamento_id, row.folha_id); });
          const ids = [...titulosPorFolha.keys()];
          const ogOk = new Map<string, boolean>();
          for (let i = 0; i < ids.length; i += 200) {
            const { data: ls } = await sb.from("lancamentos").select("id, previsao_gasto_id").in("id", ids.slice(i, i + 200));
            for (const l of ls ?? []) {
              if (l.previsao_gasto_id) continue;
              const fid = titulosPorFolha.get(l.id)!;
              const faz = rascunhos.find((f: any) => f.id === fid)?.fazenda_id as string;
              if (!ogOk.has(faz)) ogOk.set(faz, !!(await resolverOgPorClassificacao(sb, faz, "2.01.01.10.001")));
              if (ogOk.get(faz)) semPrevisao.add(fid);
            }
          }
        }
        const pendentes = (data ?? []).filter((f: any) => f.status === "rascunho" && semPrevisao.has(f.id)).slice(0, 60);
        for (let i = 0; i < pendentes.length; i += 6) {
          await Promise.all(pendentes.slice(i, i + 6).map((f: any) => sincronizarPrevisoesFolha(sb, f.id).catch(() => undefined)));
        }
      }
      const result = (data ?? []).map((f: any) => ({
        ...f,
        num_funcionarios: countMap[f.id] ?? 0,
      }));
      return NextResponse.json({ ok: true, data: result });
    }

    // ─── upsert_folha ─────────────────────────────────────────────────────────
    // Distingue folhas por produtor_id (produtor rural) além de empresa_id —
    // sem isso, todo funcionário "sem empresa" (a maioria) caía numa única
    // folha por fazenda/competência, misturando produtores diferentes
    // (Seção 261). Se a migration da Seção 261 ainda não rodou (coluna
    // produtor_id não existe em folha_pagamento), cai de volta pro
    // comportamento antigo (só empresa_id) em vez de quebrar a gravação.
    if (operacao === "upsert_folha") {
      const { fazenda_id, empresa_id, produtor_id, competencia, ...dados } = payload as {
        fazenda_id: string; empresa_id: string | null; produtor_id?: string | null; competencia: string;
        valor_bruto: number; valor_liquido: number; inss_patronal: number; fgts_total: number; obs?: string;
      };
      const isMissingProdutorCol = (e: { message?: string } | null) =>
        !!e?.message?.includes("produtor_id");

      let q = sb.from("folha_pagamento").select("id").eq("fazenda_id", fazenda_id).eq("competencia", competencia);
      if (empresa_id) q = q.eq("empresa_id", empresa_id); else q = q.is("empresa_id", null);
      if (!empresa_id) q = produtor_id ? q.eq("produtor_id", produtor_id) : q.is("produtor_id", null);
      let { data: exist, error: findErr } = await q.maybeSingle();
      let colunaProdutorDisponivel = true;
      if (findErr && isMissingProdutorCol(findErr)) {
        colunaProdutorDisponivel = false;
        let q2 = sb.from("folha_pagamento").select("id").eq("fazenda_id", fazenda_id).eq("competencia", competencia);
        if (empresa_id) q2 = q2.eq("empresa_id", empresa_id); else q2 = q2.is("empresa_id", null);
        ({ data: exist } = await q2.maybeSingle());
      } else if (findErr) {
        throw findErr;
      }

      // data_vencimento só existe depois da Seção 341: sem a coluna grava o resto normalmente
      const semDataVenc = (d: Record<string, unknown>) => { const { data_vencimento: _x, ...r } = d; void _x; return r; };
      const colunaAusente = (e: { message?: string } | null) => !!e?.message?.includes("data_vencimento");
      if (exist?.id) {
        await exigirFolhaAberta(sb, exist.id);
        let { error } = await sb.from("folha_pagamento").update(dados).eq("id", exist.id);
        if (error && colunaAusente(error)) ({ error } = await sb.from("folha_pagamento").update(semDataVenc(dados)).eq("id", exist.id));
        if (error) throw error;
        return NextResponse.json({ ok: true, id: exist.id, criou: false });
      } else {
        const insertPayload: Record<string, unknown> = { fazenda_id, empresa_id: empresa_id ?? null, competencia, status: "rascunho", ...dados };
        if (colunaProdutorDisponivel) insertPayload.produtor_id = produtor_id ?? null;
        let { data, error } = await sb.from("folha_pagamento")
          .insert(insertPayload)
          .select("id").single();
        if (error && colunaAusente(error)) ({ data, error } = await sb.from("folha_pagamento").insert(semDataVenc(insertPayload)).select("id").single());
        if (error || !data) throw error ?? new Error("Falha ao criar a folha");
        return NextResponse.json({ ok: true, id: data.id, criou: true });
      }
    }

    // ─── update_folha ─────────────────────────────────────────────────────────
    if (operacao === "update_folha") {
      const { id, ...dados } = payload as { id: string } & Record<string, unknown>;
      await exigirFolhaAberta(sb, id);
      let { error } = await sb.from("folha_pagamento").update(dados).eq("id", id);
      if (error?.message?.includes("data_vencimento")) {
        const { data_vencimento: _x, ...resto } = dados; void _x;
        ({ error } = await sb.from("folha_pagamento").update(resto).eq("id", id));
      }
      if (error) throw error;
      return NextResponse.json({ ok: true });
    }

    // ─── delete_funcionarios ──────────────────────────────────────────────────
    if (operacao === "delete_funcionarios") {
      const { folha_id } = payload as { folha_id: string };
      await exigirFolhaAberta(sb, folha_id);
      // Previsões de salário ligadas às linhas saem junto (título real e baixado ficam intactos)
      const { data: ligadas } = await sb.from("folha_funcionarios").select("cp_lancamento_id").eq("folha_id", folha_id);
      const idsPrev = (ligadas ?? []).map((r: any) => r.cp_lancamento_id).filter(Boolean) as string[];
      if (idsPrev.length) await falharSeErro(sb.from("lancamentos").delete().in("id", idsPrev).eq("natureza", "previsao").neq("status", "baixado"), "excluir previsões da folha");
      const { error } = await sb.from("folha_funcionarios").delete().eq("folha_id", folha_id);
      if (error) throw error;
      return NextResponse.json({ ok: true });
    }

    // ─── insert_funcionarios ──────────────────────────────────────────────────
    if (operacao === "insert_funcionarios") {
      const { rows } = payload as { rows: unknown[] };
      const folhaDasLinhas = [...new Set((rows as { folha_id?: string }[]).map(r => r.folha_id).filter(Boolean))] as string[];
      for (const f of folhaDasLinhas) await exigirFolhaAberta(sb, f);
      if (rows.length) {
        const { error } = await sb.from("folha_funcionarios").insert(rows);
        if (error) throw error;
        const folhaId = (rows[0] as { folha_id?: string }).folha_id;
        if (folhaId) await sincronizarPrevisoesFolha(sb, folhaId);
      }
      return NextResponse.json({ ok: true });
    }

    // ─── reprocessar_folha ────────────────────────────────────────────────────
    // Folha FECHADA ajustada (adiantamento esquecido, gratificação, desconto, funcionário incluído/retirado): recalcula
    // e mexe no Contas a Pagar só onde o valor mudou. Título pago (baixado, parcial, em borderô ou conciliado) nunca é
    // alterado: se o novo valor for MAIOR, vira pendência (reabrir o título no CP); se for MENOR (ou o funcionário saiu),
    // a diferença vira desconto numa folha futura, com valor e competência escolhidos pelo operador.
    // simular=true devolve só o plano, sem gravar nada.
    if (operacao === "reprocessar_folha") {
      const { id, rows, dadosFolha, descontos, simular } = payload as {
        id: string; rows: Record<string, unknown>[]; dadosFolha?: Record<string, unknown>; simular?: boolean;
        descontos?: { funcionario_id: string; valor: number; competencia_ref: string; data?: string }[];
      };
      const negado = await semPermissaoReprocessar(sb, user.id);
      if (negado) return NextResponse.json({ error: negado }, { status: 403 });
      const { data: folha } = await sb.from("folha_pagamento").select("*").eq("id", id).maybeSingle();
      if (!folha) throw new Error("Folha não encontrada.");
      if (folha.status !== "fechado") throw new Error("Só uma folha fechada é reprocessada. Folha em rascunho: use Salvar Folha.");
      const competencia = String(folha.competencia);
      const rotulo = rotuloCompetencia(competencia);
      const hojeStr = hojeLocal();
      const { data: perfil } = await sb.from("perfis").select("nome").eq("user_id", user.id).maybeSingle();
      const quem = (perfil?.nome as string | undefined) ?? user.email ?? "usuário";

      // Linhas atuais (com o título de cada funcionário) e as novas que vieram da tela
      const { data: antigas } = await sb.from("folha_funcionarios").select("*").eq("folha_id", id);
      const chave = (r: any) => String(r.funcionario_id ?? `nome:${r.nome_funcionario}`);
      const antigaPor = new Map<string, any>((antigas ?? []).map((r: any) => [chave(r), r]));
      const novas = (rows ?? []).map(r => ({ ...r, folha_id: id })) as any[];

      // Adiantamentos: o que esta folha já descontou (gravado na linha ao fechar) + os pendentes da competência ou sem
      // competência (inclusive os lançados depois de fechar). Os pendentes passam a "descontado" ao gravar.
      const funcIds = novas.map(r => r.funcionario_id).filter(Boolean) as string[];
      const pendentesUsados: string[] = [];
      {
        const somaPend: Record<string, number> = {};
        if (funcIds.length) {
          const { data: adis } = await sb.from("adiantamentos_salario").select("id, funcionario_id, valor, competencia_ref")
            .in("funcionario_id", funcIds).eq("status", "pendente").or(`competencia_ref.eq.${competencia},competencia_ref.is.null`);
          for (const a of (adis ?? []) as any[]) { somaPend[a.funcionario_id] = (somaPend[a.funcionario_id] ?? 0) + Number(a.valor ?? 0); pendentesUsados.push(a.id); }
        }
        for (const r of novas) {
          const jaDescontado = Number(antigaPor.get(chave(r))?.adiantamento ?? 0);
          r.adiantamento = Math.round((jaDescontado + (r.funcionario_id ? (somaPend[r.funcionario_id] ?? 0) : 0)) * 100) / 100;
        }
      }

      // Títulos atuais
      const idsTitulos = [...(antigas ?? []).map((r: any) => r.cp_lancamento_id), folha.cp_fgts_id, folha.cp_inss_patronal_id].filter(Boolean) as string[];
      const { data: titulos } = idsTitulos.length
        ? await sb.from("lancamentos").select("id, valor, valor_pago, status, natureza, lote_id, conciliado, observacao, descricao").in("id", idsTitulos)
        : { data: [] as any[] };
      const tituloPor = new Map<string, any>((titulos ?? []).map((t: any) => [t.id, t]));
      const pago = (t: any) => !!t && (t.status === "baixado" || t.status === "parcial" || !!t.lote_id || !!t.conciliado || Number(t.valor_pago ?? 0) > 0);
      const r2 = (v: number) => Math.round(v * 100) / 100;

      type Item = { tipo: "atualizar" | "criar" | "cancelar" | "sem_mudanca" | "pendencia_pago_maior" | "desconto"; funcionario_id?: string | null; nome: string; antes: number; depois: number; titulo_id?: string | null; diferenca?: number };
      const plano: Item[] = [];
      for (const r of novas) {
        const liq = liquidoItem(r);
        const velha = antigaPor.get(chave(r));
        const t = velha?.cp_lancamento_id ? tituloPor.get(velha.cp_lancamento_id) : null;
        if (!t) { plano.push({ tipo: liq > 0.005 ? "criar" : "sem_mudanca", funcionario_id: r.funcionario_id, nome: r.nome_funcionario, antes: 0, depois: liq }); continue; }
        const antes = Number(t.valor ?? 0);
        if (Math.abs(antes - liq) < 0.005) { plano.push({ tipo: "sem_mudanca", funcionario_id: r.funcionario_id, nome: r.nome_funcionario, antes, depois: liq, titulo_id: t.id }); continue; }
        if (!pago(t)) { plano.push({ tipo: "atualizar", funcionario_id: r.funcionario_id, nome: r.nome_funcionario, antes, depois: liq, titulo_id: t.id }); continue; }
        plano.push(liq > antes
          ? { tipo: "pendencia_pago_maior", funcionario_id: r.funcionario_id, nome: r.nome_funcionario, antes, depois: liq, titulo_id: t.id, diferenca: r2(liq - antes) }
          : { tipo: "desconto", funcionario_id: r.funcionario_id, nome: r.nome_funcionario, antes, depois: liq, titulo_id: t.id, diferenca: r2(antes - liq) });
      }
      // Funcionários retirados da folha
      const chavesNovas = new Set(novas.map(chave));
      for (const v of (antigas ?? []) as any[]) {
        if (chavesNovas.has(chave(v))) continue;
        const t = v.cp_lancamento_id ? tituloPor.get(v.cp_lancamento_id) : null;
        if (!t || t.status === "cancelado") continue;
        plano.push(pago(t)
          ? { tipo: "desconto", funcionario_id: v.funcionario_id, nome: v.nome_funcionario, antes: Number(t.valor), depois: 0, titulo_id: t.id, diferenca: r2(Number(t.valor_pago ?? t.valor)) }
          : { tipo: "cancelar", funcionario_id: v.funcionario_id, nome: v.nome_funcionario, antes: Number(t.valor), depois: 0, titulo_id: t.id });
      }
      // Encargos (totais da folha)
      const totFGTS = r2(novas.reduce((t, r) => t + Number(r.fgts ?? 0), 0));
      const totINSS = r2(novas.reduce((t, r) => t + Number(r.inss_patronal ?? 0), 0));
      for (const [nome, tid, novo] of [["FGTS", folha.cp_fgts_id, totFGTS], ["INSS Patronal", folha.cp_inss_patronal_id, folha.empresa_id ? totINSS : 0]] as [string, string | null, number][]) {
        let t = tid ? tituloPor.get(tid) : null;
        if (!t && novo > 0.005) {
          // Folha sem o vínculo gravado: o título do encargo pode existir (fechada antes do vínculo) — usa ele, não duplica
          const { data: ex } = await sb.from("lancamentos").select("id, valor, valor_pago, status, natureza, lote_id, conciliado, observacao, descricao")
            .eq("fazenda_id", folha.fazenda_id).eq("descricao", `${nome} ${rotulo}`).neq("status", "cancelado").limit(1);
          if (ex?.[0]) { t = ex[0]; tituloPor.set(t.id, t); await sb.from("folha_pagamento").update(nome === "FGTS" ? { cp_fgts_id: t.id } : { cp_inss_patronal_id: t.id }).eq("id", id); }
        }
        if (!t) { if (novo > 0.005) plano.push({ tipo: "criar", nome, antes: 0, depois: novo }); continue; }
        const antes = Number(t.valor ?? 0);
        if (Math.abs(antes - novo) < 0.005) plano.push({ tipo: "sem_mudanca", nome, antes, depois: novo, titulo_id: t.id });
        else if (!pago(t)) plano.push({ tipo: novo > 0.005 ? "atualizar" : "cancelar", nome, antes, depois: novo, titulo_id: t.id });
        else plano.push({ tipo: "pendencia_pago_maior", nome, antes, depois: novo, titulo_id: t.id, diferenca: r2(novo - antes) });
      }

      if (simular) return NextResponse.json({ ok: true, plano, adiantamentos_novos: pendentesUsados.length });

      // Descontos de quem recebeu a mais: só com valor e competência informados pelo operador
      const descPor = new Map((descontos ?? []).map(d => [String(d.funcionario_id), d]));
      for (const it of plano.filter(p => p.tipo === "desconto")) {
        const d = it.funcionario_id ? descPor.get(String(it.funcionario_id)) : undefined;
        if (!d || !(Number(d.valor) > 0) || !/^\d{4}-\d{2}$/.test(String(d.competencia_ref ?? ""))) {
          throw new Error(`Informe o valor e a competência do desconto de ${it.nome} (recebeu ${it.diferenca?.toFixed(2)} a mais).`);
        }
      }

      const marca = (antes: number, depois: number) => `Ajustado no reprocessamento de ${hojeStr.split("-").reverse().join("/")} por ${quem}: R$ ${antes.toFixed(2)} → R$ ${depois.toFixed(2)}`;
      const ogSalario = await resolverOgPorClassificacao(sb, folha.fazenda_id, "2.01.01.10.001");
      const vencimento = (folha.data_vencimento as string | null) || vencimentoSalario(competencia);
      const vinculo: Record<string, { produtor_id: string | null; empresa_id: string | null }> = {};
      if (funcIds.length) {
        const { data: fs } = await sb.from("funcionarios").select("id, produtor_id, empresa_id").in("id", funcIds);
        for (const f of fs ?? []) vinculo[f.id as string] = { produtor_id: (f as any).produtor_id ?? null, empresa_id: (f as any).empresa_id ?? null };
      }
      const novoTituloPor: Record<string, string> = {};
      for (const it of plano) {
        if (it.tipo === "atualizar" && it.titulo_id) {
          const t = tituloPor.get(it.titulo_id);
          await falharSeErro(sb.from("lancamentos").update({ valor: it.depois, observacao: `${t?.observacao ? t.observacao + " · " : ""}${marca(it.antes, it.depois)}` }).eq("id", it.titulo_id), "atualizar título da folha");
          await consumirPrevisaoDoTitulo(sb, it.titulo_id, it.depois);
        } else if (it.tipo === "cancelar" && it.titulo_id) {
          const t = tituloPor.get(it.titulo_id);
          await falharSeErro(sb.from("lancamentos").update({ status: "cancelado", observacao: `${t?.observacao ? t.observacao + " · " : ""}Cancelado no reprocessamento de ${hojeStr.split("-").reverse().join("/")} por ${quem}` }).eq("id", it.titulo_id), "cancelar título da folha");
        } else if (it.tipo === "criar") {
          const ehEncargo = it.nome === "FGTS" || it.nome === "INSS Patronal";
          const r = ehEncargo ? null : novas.find(x => chave(x) === String(it.funcionario_id ?? `nome:${it.nome}`));
          const og = ehEncargo ? await resolverOgPorClassificacao(sb, folha.fazenda_id, it.nome === "FGTS" ? "2.01.01.10.013" : "2.01.01.10.014") : ogSalario;
          const { data: l, error } = await inserirLancamentoFolha(sb, {
            fazenda_id: folha.fazenda_id,
            empresa_id: ehEncargo ? (folha.empresa_id ?? null) : (folha.empresa_id ?? vinculo[r?.funcionario_id]?.empresa_id ?? null),
            produtor_id: ehEncargo ? (it.nome === "FGTS" ? (novas.find(x => x.produtor_id)?.produtor_id ?? null) : null) : (r?.produtor_id ?? vinculo[r?.funcionario_id]?.produtor_id ?? null),
            funcionario_id: ehEncargo ? null : (r?.funcionario_id ?? null),
            natureza: "real", tipo: "pagar", moeda: "BRL", status: "em_aberto",
            descricao: ehEncargo ? `${it.nome} ${rotulo}` : `Salário ${rotulo} — ${it.nome}`,
            valor: it.depois, categoria: ehEncargo ? "Pessoal / Encargos" : "Pessoal / Salários",
            origem_lancamento: "folha", operacao_gerencial_id: og,
            data_vencimento: ehEncargo ? vencimentoEncargoFolha(competencia) : vencimento, data_lancamento: hojeStr,
            observacao: `Incluído no reprocessamento de ${hojeStr.split("-").reverse().join("/")} por ${quem}`,
          });
          if (error) throw new Error(`Título de ${it.nome}: ${error.message}`);
          if (it.nome === "FGTS") await sb.from("folha_pagamento").update({ cp_fgts_id: l.id }).eq("id", id);
          else if (it.nome === "INSS Patronal") await sb.from("folha_pagamento").update({ cp_inss_patronal_id: l.id }).eq("id", id);
          else novoTituloPor[String(it.funcionario_id ?? `nome:${it.nome}`)] = l.id;
        } else if (it.tipo === "desconto") {
          const d = descPor.get(String(it.funcionario_id))!;
          const { error } = await sb.from("adiantamentos_salario").insert({
            fazenda_id: folha.fazenda_id, funcionario_id: it.funcionario_id, data: d.data || hojeStr, valor: r2(Number(d.valor)),
            competencia_ref: d.competencia_ref, status: "pendente", tipo: "devolucao",
            descricao: `Devolução — recebeu a mais na folha de ${rotulo} (reprocessada em ${hojeStr.split("-").reverse().join("/")} por ${quem})`,
          });
          if (error) throw new Error(`Desconto de ${it.nome}: ${error.message}${error.message.includes("tipo") ? " — aplique a Seção 355 do supabase_migrations.sql." : ""}`);
        }
      }

      // Linhas da folha: substitui mantendo o título de cada funcionário
      await falharSeErro(sb.from("folha_funcionarios").delete().eq("folha_id", id), "regravar linhas da folha");
      const linhas = novas.map(r => ({ ...r, cp_lancamento_id: antigaPor.get(chave(r))?.cp_lancamento_id ?? novoTituloPor[chave(r)] ?? null }));
      if (linhas.length) await falharSeErro(sb.from("folha_funcionarios").insert(linhas), "regravar linhas da folha");
      const totais = {
        valor_bruto: r2(novas.reduce((t, r) => t + Number(r.salario_bruto ?? 0), 0)),
        valor_liquido: r2(novas.reduce((t, r) => t + liquidoItem(r), 0)),
        inss_patronal: totINSS, fgts_total: totFGTS,
      };
      await falharSeErro(sb.from("folha_pagamento").update({ ...totais, ...(dadosFolha?.obs !== undefined ? { obs: dadosFolha.obs } : {}) }).eq("id", id), "atualizar folha");
      if (pendentesUsados.length) await sb.from("adiantamentos_salario").update({ status: "descontado" }).in("id", pendentesUsados).eq("status", "pendente");

      // Histórico do reprocessamento (Seção 355); sem a tabela, o registro fica só na auditoria e nas observações
      const mudou = plano.filter(p => p.tipo !== "sem_mudanca");
      const { error: eh } = await sb.from("folha_historico").insert({ folha_id: id, usuario_id: user.id, usuario_nome: quem, acao: "reprocessar", alteracoes: mudou });
      if (eh && !/folha_historico/.test(eh.message ?? "")) console.error("[folha] histórico:", eh.message);
      return NextResponse.json({ ok: true, plano, alterados: mudou.length });
    }

    // ─── fechar_folha ─────────────────────────────────────────────────────────
    if (operacao === "fechar_folha") {
      const { id, fazenda_id, empresa_id, competencia } = payload as {
        id: string; fazenda_id: string; empresa_id: string | null; competencia: string;
      };

      // Busca funcionários da folha
      const { data: itens, error: itErr } = await sb
        .from("folha_funcionarios").select("*").eq("folha_id", id);
      if (itErr) throw itErr;

      // Adiantamentos pendentes (da competência ou sem competência) entram no desconto mesmo se
      // foram lançados DEPOIS de a folha ser salva — antes o salário saía cheio e o adiantamento
      // ficava "pendente" pra sempre. O desconto vem só da aba Adiantamentos: vale sempre a soma dos pendentes
      // (a coluna manual de adiantamento na folha foi retirada).
      // Líquido como estava ao salvar: serve para saber se o valor da previsão foi editado à mão no CP
      const liqAntes: Record<string, number> = {};
      for (const it of (itens ?? []) as any[]) liqAntes[it.id] = liquidoItem(it);
      const funcIdsFolha = (itens ?? []).map((it: any) => it.funcionario_id).filter(Boolean) as string[];
      if (funcIdsFolha.length > 0) {
        const { data: adisPend } = await sb.from("adiantamentos_salario")
          .select("funcionario_id, valor, competencia_ref")
          .eq("status", "pendente").in("funcionario_id", funcIdsFolha)
          .or(`competencia_ref.eq.${competencia},competencia_ref.is.null`);
        const somaPend: Record<string, number> = {};
        for (const a of adisPend ?? []) somaPend[a.funcionario_id] = (somaPend[a.funcionario_id] ?? 0) + Number(a.valor ?? 0);
        for (const it of (itens ?? []) as any[]) {
          const pend = Math.round((somaPend[it.funcionario_id] ?? 0) * 100) / 100;
          if (it.funcionario_id && Math.abs(pend - (it.adiantamento ?? 0)) > 0.005) {
            await sb.from("folha_funcionarios").update({ adiantamento: pend }).eq("id", it.id);
            it.adiantamento = pend;
          }
        }
      }

      const hoje = hojeLocal();
      // Data de pagamento: a escolhida ao gerar a folha (folha_pagamento.data_vencimento, Seção 341);
      // sem ela, o padrão é dia 05 do mês seguinte à competência.
      const { data: folhaRow } = await sb.from("folha_pagamento").select("*").eq("id", id).maybeSingle();
      const vencimento = ((folhaRow as { data_vencimento?: string | null } | null)?.data_vencimento) || vencimentoSalario(competencia);
      const nomeMesLabel = (() => {
        const [ano, mes] = competencia.split("-");
        const n = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];
        return `${n[parseInt(mes)-1]}/${ano}`;
      })();

      // Gera CP por funcionário via service_role_key (evita RLS 42501)
      const ogSalario = await resolverOgPorClassificacao(sb, fazenda_id, "2.01.01.10.001");
      // Ano Safra do vencimento (regra do sistema: todo título tem ano safra) e vínculo do funcionário (produtor/empresa),
      // para o título nascer completo e a tela de edição abrir preenchida.
      let anoSafraFolha: string | null = null;
      try {
        const { data: as1 } = await sb.rpc("fn_ano_safra_da_data", { p_fazenda: fazenda_id, p_data: vencimento });
        if (typeof as1 === "string") anoSafraFolha = as1;
      } catch { /* sem ano safra para a data */ }
      const idsFuncs = (itens ?? []).map((i: any) => i.funcionario_id).filter(Boolean) as string[];
      const vinculoFunc: Record<string, { produtor_id: string | null; empresa_id: string | null }> = {};
      if (idsFuncs.length) {
        const { data: fs } = await sb.from("funcionarios").select("id, produtor_id, empresa_id").in("id", idsFuncs);
        for (const f of fs ?? []) vinculoFunc[f.id as string] = { produtor_id: (f as any).produtor_id ?? null, empresa_id: (f as any).empresa_id ?? null };
      }
      // Folha salva já deixou uma PREVISÃO por funcionário no CP: aqui ela vira título real. Se o valor da previsão
      // foi editado no CP, vale o editado; se não, vale o líquido recalculado (com adiantamentos lançados depois).
      // Título que o usuário já efetivou no CP fica como está.
      const idsPrevSal = (itens ?? []).map((it: any) => it.cp_lancamento_id).filter(Boolean) as string[];
      const prevSal: Record<string, { natureza: string; valor: number; status: string }> = {};
      if (idsPrevSal.length) {
        const { data: ex } = await sb.from("lancamentos").select("id, natureza, valor, status").in("id", idsPrevSal);
        for (const l of ex ?? []) prevSal[l.id as string] = { natureza: (l as any).natureza, valor: Number((l as any).valor ?? 0), status: (l as any).status };
      }
      for (const it of (itens ?? []) as any[]) {
        const liq = liquidoItem(it);
        const ex = it.cp_lancamento_id ? prevSal[it.cp_lancamento_id] : undefined;
        if (ex) {
          const jaPago = ex.status === "baixado" || ex.status === "parcial";
          if (ex.natureza === "previsao" && jaPago) {
            // Previsão que já foi paga (antes da trava da Seção 356): vira real como está — nunca volta a "em aberto"
            const { error: upErr } = await sb.from("lancamentos").update({ natureza: "real" }).eq("id", it.cp_lancamento_id);
            if (upErr) throw new Error(`CP ${it.nome_funcionario}: ${upErr.message}`);
            await consumirPrevisaoDoTitulo(sb, it.cp_lancamento_id, ex.valor);
          } else if (ex.natureza === "previsao") {
            const editado = Math.abs(ex.valor - (liqAntes[it.id] ?? liq)) > 0.005;
            const valorFinal = editado ? ex.valor : liq;
            const { error: upErr } = await sb.from("lancamentos")
              .update({ natureza: "real", valor: valorFinal, status: "em_aberto" })
              .eq("id", it.cp_lancamento_id);
            if (upErr) throw new Error(`CP ${it.nome_funcionario}: ${upErr.message}`);
            await consumirPrevisaoDoTitulo(sb, it.cp_lancamento_id, valorFinal);
          } else {
            // Já efetivado no CP: se a previsão ainda não foi consumida (efetivado antes desta regra), consome agora
            await consumirPrevisaoDoTitulo(sb, it.cp_lancamento_id, ex.valor);
          }
          continue;
        }

        const { data: lancamento, error: lancErr } = await inserirLancamentoFolha(sb, {
          fazenda_id,
          empresa_id: empresa_id ?? vinculoFunc[it.funcionario_id]?.empresa_id ?? null,
          produtor_id: it.produtor_id ?? vinculoFunc[it.funcionario_id]?.produtor_id ?? null,
          funcionario_id: it.funcionario_id ?? null,
          ano_safra_id: anoSafraFolha,
          natureza: "real",
          tipo: "pagar",
          descricao: `Salário ${nomeMesLabel} — ${it.nome_funcionario}`,
          valor: liq,
          moeda: "BRL",
          status: "em_aberto",
          categoria: "Pessoal / Salários",
          origem_lancamento: "folha",
          operacao_gerencial_id: ogSalario,
          data_vencimento: vencimento,
          data_lancamento: hoje,
        });

        if (lancErr) throw new Error(`CP ${it.nome_funcionario}: ${lancErr.message}`);

        if (lancamento?.id) {
          await sb.from("folha_funcionarios").update({ cp_lancamento_id: lancamento.id }).eq("id", it.id);
        }
      }

      // Encargos patronais — FGTS e INSS Patronal, uma CP cada (não por
      // funcionário) sobre o total da folha. Vencimento unificado dia 20 do
      // mês seguinte (FGTS Digital/eSocial). INSS Patronal só para
      // empregador Empresa (empresa_id) — Produtor Rural (produtor_id)
      // recolhe Funrural em vez disso, calculado fora da folha.
      const produtorIdFolha = (itens ?? []).find((it: any) => it.produtor_id)?.produtor_id ?? null;
      const totalFGTS       = (itens ?? []).reduce((s: number, it: any) => s + (it.fgts ?? 0), 0);
      const totalINSSPat    = (itens ?? []).reduce((s: number, it: any) => s + (it.inss_patronal ?? 0), 0);
      const vencimentoEncargo = (() => {
        const [ano, mes] = competencia.split("-").map(Number);
        const prox = mes === 12 ? { a: ano + 1, m: 1 } : { a: ano, m: mes + 1 };
        return `${prox.a}-${String(prox.m).padStart(2, "0")}-20`;
      })();

      // Previsões de encargos ligadas à folha: viram reais com o valor que tiverem (editado ou não)
      const { data: encPrev } = await sb.from("folha_pagamento").select("cp_fgts_id, cp_inss_patronal_id").eq("id", id).maybeSingle();
      let fgtsConvertido = false, inssConvertido = false;
      for (const [campo, cpId] of [["fgts", (encPrev as any)?.cp_fgts_id], ["inss", (encPrev as any)?.cp_inss_patronal_id]] as const) {
        if (!cpId) continue;
        const { data: ex } = await sb.from("lancamentos").select("id, natureza, valor, status").eq("id", cpId).maybeSingle();
        if (!ex) continue;
        if ((ex as any).natureza === "previsao") {
          const pagoEnc = ["baixado", "parcial"].includes(String((ex as any).status ?? ""));
          await falharSeErro(sb.from("lancamentos").update(pagoEnc ? { natureza: "real" } : { natureza: "real", status: "em_aberto" }).eq("id", cpId), "converter encargo da folha");
        }
        await consumirPrevisaoDoTitulo(sb, cpId, Number((ex as any).valor ?? 0));
        if (campo === "fgts") fgtsConvertido = true; else inssConvertido = true;
      }

      if (totalFGTS > 0.005 && !fgtsConvertido) {
        const ogFgts = await resolverOgPorClassificacao(sb, fazenda_id, "2.01.01.10.013");
        const { data: fgtsLanc, error: fgtsErr } = await inserirLancamentoFolha(sb, {
          fazenda_id, empresa_id: empresa_id ?? null, produtor_id: produtorIdFolha,
          natureza: "real", tipo: "pagar",
          descricao: `FGTS ${nomeMesLabel}`,
          valor: Math.round(totalFGTS * 100) / 100,
          moeda: "BRL", status: "em_aberto",
          categoria: "Pessoal / Encargos",
          origem_lancamento: "folha",
          operacao_gerencial_id: ogFgts,
          data_vencimento: vencimentoEncargo, data_lancamento: hoje,
        });
        if (fgtsErr) throw new Error(`CP FGTS: ${fgtsErr.message}`);
        // Se a Seção 261 (migration) ainda não rodou, folha_pagamento não tem
        // essa coluna — a CP é criada normalmente, só não fica rastreada pra
        // reabrir excluir sozinho depois (precisaria excluir manualmente).
        if (fgtsLanc?.id) await sb.from("folha_pagamento").update({ cp_fgts_id: fgtsLanc.id }).eq("id", id);
      }

      if (empresa_id && totalINSSPat > 0.005 && !inssConvertido) {
        const ogInssPat = await resolverOgPorClassificacao(sb, fazenda_id, "2.01.01.10.014");
        const { data: inssLanc, error: inssErr } = await inserirLancamentoFolha(sb, {
          fazenda_id, empresa_id, produtor_id: null,
          natureza: "real", tipo: "pagar",
          descricao: `INSS Patronal ${nomeMesLabel}`,
          valor: Math.round(totalINSSPat * 100) / 100,
          moeda: "BRL", status: "em_aberto",
          categoria: "Pessoal / Encargos",
          origem_lancamento: "folha",
          operacao_gerencial_id: ogInssPat,
          data_vencimento: vencimentoEncargo, data_lancamento: hoje,
        });
        if (inssErr) throw new Error(`CP INSS Patronal: ${inssErr.message}`);
        if (inssLanc?.id) await sb.from("folha_pagamento").update({ cp_inss_patronal_id: inssLanc.id }).eq("id", id);
      }

      // Marca como "descontado" SOMENTE os adiantamentos cujo funcionário
      // tem adiantamento > 0 na folha — evita marcar adiantamentos não incluídos.
      const funcIdsComAdiantamento = (itens ?? [])
        .filter((it: any) => (it.adiantamento ?? 0) > 0 && it.funcionario_id)
        .map((it: any) => it.funcionario_id as string);

      if (funcIdsComAdiantamento.length > 0) {
        await sb.from("adiantamentos_salario")
          .update({ status: "descontado" })
          .eq("status", "pendente")
          .or(`competencia_ref.eq.${competencia},competencia_ref.is.null`)
          .in("funcionario_id", funcIdsComAdiantamento);
      }

      // Atualiza status da folha
      const { error } = await sb.from("folha_pagamento").update({ status: "fechado" }).eq("id", id);
      if (error) throw error;

      return NextResponse.json({ ok: true });
    }

    // ─── reabrir_folha ────────────────────────────────────────────────────────
    // Reverte em cascata: exclui CPs gerados, restaura adiantamentos, volta para rascunho.
    if (operacao === "reabrir_folha") {
      const { id, fazenda_id, competencia } = payload as {
        id: string; fazenda_id: string; competencia: string;
      };

      // Busca linhas da folha
      const { data: itens, error: itErr } = await sb
        .from("folha_funcionarios")
        .select("id, funcionario_id, cp_lancamento_id")
        .eq("folha_id", id);
      if (itErr) throw itErr;

      // CPs de encargos (FGTS/INSS Patronal) gerados pela folha inteira, não
      // por funcionário — busca defensiva: se a Seção 261 ainda não rodou,
      // essas colunas não existem, e simplesmente não há nada pra reverter
      // aqui (a CP fica órfã, precisa ser excluída manualmente uma vez).
      let cpFgtsId: string | null = null;
      let cpInssPatId: string | null = null;
      const { data: folhaRow, error: folhaRowErr } = await sb
        .from("folha_pagamento").select("cp_fgts_id, cp_inss_patronal_id").eq("id", id).maybeSingle();
      if (!folhaRowErr) {
        cpFgtsId = (folhaRow as any)?.cp_fgts_id ?? null;
        cpInssPatId = (folhaRow as any)?.cp_inss_patronal_id ?? null;
      }

      const cpIds = [
        ...(itens ?? []).map((i: any) => i.cp_lancamento_id).filter(Boolean),
        cpFgtsId, cpInssPatId,
      ].filter(Boolean) as string[];

      // Bloqueia se qualquer CP já foi baixado
      if (cpIds.length > 0) {
        const { data: baixados } = await sb
          .from("lancamentos")
          .select("id, status, descricao")
          .in("id", cpIds)
          .eq("status", "baixado");
        if ((baixados ?? []).length > 0) {
          const nomes = (baixados ?? []).map((l: any) => l.descricao).join("; ");
          throw new Error(`Não é possível reabrir: os seguintes CPs já foram baixados em borderô — ${nomes}. Estorne o borderô primeiro.`);
        }

        // Exclui CPs em aberto / vencidos gerados pela folha
        await falharSeErro(sb.from("lancamentos").delete().in("id", cpIds), "excluir lancamentos");
      }

      // Limpa cp_lancamento_id nas linhas da folha
      await sb.from("folha_funcionarios")
        .update({ cp_lancamento_id: null })
        .eq("folha_id", id);

      if (cpFgtsId || cpInssPatId) {
        await sb.from("folha_pagamento").update({ cp_fgts_id: null, cp_inss_patronal_id: null }).eq("id", id);
      }

      // Reverte adiantamentos "descontado" → "pendente" para os funcionários da folha
      const funcIds = (itens ?? []).map((i: any) => i.funcionario_id).filter(Boolean) as string[];
      if (funcIds.length > 0) {
        await sb.from("adiantamentos_salario")
          .update({ status: "pendente" })
          .eq("fazenda_id", fazenda_id)
          .eq("competencia_ref", competencia)
          .eq("status", "descontado")
          .in("funcionario_id", funcIds);
      }

      // Volta status para rascunho
      const { error } = await sb.from("folha_pagamento")
        .update({ status: "rascunho" })
        .eq("id", id);
      if (error) throw error;

      // Folha aberta de novo volta a ser previsão no CP / fluxo de caixa
      await sincronizarPrevisoesFolha(sb, id);

      return NextResponse.json({ ok: true });
    }

    // ─── delete_folha ─────────────────────────────────────────────────────────
    // Exclui em cascata: mesma segurança do reabrir_folha (bloqueia se algum CP já foi baixado em
    // borderô, exclui os CPs gerados — salário de cada funcionário + FGTS + INSS Patronal — reverte
    // adiantamentos "Descontado" pra "Pendente"), e só então apaga as linhas e o cabeçalho da folha.
    // Achado real 28/09/2026: esta operação já existia, mas fazia só metade — apagava
    // folha_funcionarios/folha_pagamento sem tocar nos CPs gerados nem nos adiantamentos, deixando
    // lançamentos órfãos (CP de salário sem folha nenhuma por trás) e adiantamentos presos em
    // "Descontado" para sempre. Nunca tinha um botão na tela — corrigido e ligado agora.
    if (operacao === "delete_folha") {
      const { id, fazenda_id, competencia } = payload as { id: string; fazenda_id?: string; competencia?: string };

      const { data: itens } = await sb.from("folha_funcionarios").select("id, funcionario_id, cp_lancamento_id").eq("folha_id", id);
      const { data: folhaRow } = await sb.from("folha_pagamento").select("cp_fgts_id, cp_inss_patronal_id").eq("id", id).maybeSingle();
      const cpFgtsId = (folhaRow as any)?.cp_fgts_id ?? null;
      const cpInssPatId = (folhaRow as any)?.cp_inss_patronal_id ?? null;
      const cpIds = [
        ...(itens ?? []).map((i: any) => i.cp_lancamento_id).filter(Boolean),
        cpFgtsId, cpInssPatId,
      ].filter(Boolean) as string[];

      if (cpIds.length > 0) {
        const { data: baixados } = await sb.from("lancamentos").select("id, descricao").in("id", cpIds).eq("status", "baixado");
        if ((baixados ?? []).length > 0) {
          const nomes = (baixados ?? []).map((l: any) => l.descricao).join("; ");
          throw new Error(`Não é possível excluir: os seguintes CPs já foram baixados em borderô — ${nomes}. Estorne o borderô primeiro.`);
        }
        await falharSeErro(sb.from("lancamentos").delete().in("id", cpIds), "excluir lancamentos");
      }

      const funcIds = (itens ?? []).map((i: any) => i.funcionario_id).filter(Boolean) as string[];
      if (funcIds.length > 0 && fazenda_id && competencia) {
        await sb.from("adiantamentos_salario")
          .update({ status: "pendente" })
          .eq("fazenda_id", fazenda_id).eq("competencia_ref", competencia).eq("status", "descontado")
          .in("funcionario_id", funcIds);
      }

      await apagarPrevisoesDaFolha(sb, id);
      await falharSeErro(sb.from("folha_funcionarios").delete().eq("folha_id", id), "excluir folha_funcionarios");
      const { error } = await sb.from("folha_pagamento").delete().eq("id", id);
      if (error) throw error;
      return NextResponse.json({ ok: true });
    }

    // ─── listar_funcionarios_folha — com vínculo atual do funcionário ─────────
    if (operacao === "listar_funcionarios_folha") {
      const { folha_id } = payload as { folha_id: string };
      const { data, error } = await sb
        .from("folha_funcionarios")
        .select("*, funcionarios(empresa_id, produtor_id)")
        .eq("folha_id", folha_id)
        .order("nome_funcionario");
      if (error) throw error;

      // Enriquece: usa vínculo salvo na folha; se NULL (folhas antigas), usa o atual do funcionário
      const enriched = (data ?? []).map((i: any) => ({
        ...i,
        empresa_id:  i.empresa_id  ?? i.funcionarios?.empresa_id  ?? null,
        produtor_id: i.produtor_id ?? i.funcionarios?.produtor_id ?? null,
        funcionarios: undefined,
      }));
      return NextResponse.json({ ok: true, data: enriched });
    }

    // ─── listar_adi_prem ──────────────────────────────────────────────────────
    // Mesmo escopo por conta de listar_folhas — adiantamentos/premiações de
    // funcionários de outras fazendas da conta não podem ficar de fora.
    if (operacao === "listar_adi_prem") {
      const { fazenda_id, fazenda_ids } = payload as { fazenda_id?: string; fazenda_ids?: string[] };
      const ids = fazenda_ids?.length ? fazenda_ids : fazenda_id ? [fazenda_id] : [];
      if (!ids.length) return NextResponse.json({ ok: true, adis: [], prems: [] });
      const [{ data: adis, error: adiErr }, { data: prems, error: premErr }] = await Promise.all([
        sb.from("adiantamentos_salario").select("*, funcionarios(nome)").in("fazenda_id", ids).order("data", { ascending: false }),
        sb.from("funcionarios_premiacoes").select("*, funcionarios(nome)").in("fazenda_id", ids),
      ]);
      if (adiErr) throw adiErr;
      if (premErr) throw premErr;
      return NextResponse.json({ ok: true, adis: adis ?? [], prems: prems ?? [] });
    }

    // ─── salvar_adiantamento ──────────────────────────────────────────────────
    if (operacao === "salvar_adiantamento") {
      const { fazenda_id, funcionario_id, data, valor, competencia_ref, descricao, funcionario_nome } = payload as any;
      const tipoAdi: "salario" | "gratificacao" = (payload as any).tipo === "gratificacao" ? "gratificacao" : "salario";
      if (tipoAdi === "gratificacao") {
        const erroGrat = await validarAdiantamentoGratificacao(sb, { funcionario_id, competencia_ref, valor });
        if (erroGrat) return NextResponse.json({ error: erroGrat }, { status: 422 });
      }
      const ogAdiantFunc = await resolverOgPorClassificacao(sb, fazenda_id, "2.01.01.09.002");
      // CP do adiantamento nasce já ligado ao empregador (empresa ou produtor) do funcionário —
      // sem isso o título ficava "solto" e não aparecia no filtro de origem do Contas a Pagar.
      const { data: funcEmp } = await sb.from("funcionarios").select("empresa_id, produtor_id").eq("id", funcionario_id).maybeSingle();
      const { data: lanc, error: lancErr } = await inserirLancamentoFolha(sb, {
        fazenda_id, empresa_id: funcEmp?.empresa_id ?? null, produtor_id: funcEmp?.produtor_id ?? null,
        tipo: "pagar", natureza: "real",
        descricao: `Adiantamento${tipoAdi === "gratificacao" ? " de gratificação" : ""} — ${funcionario_nome}${descricao ? ` — ${descricao}` : ""}`,
        valor, moeda: "BRL", status: "em_aberto",
        categoria: "Pessoal / Adiantamentos",
        origem_lancamento: "folha",
        operacao_gerencial_id: ogAdiantFunc,
        data_vencimento: data, data_lancamento: data,
      });
      if (lancErr) throw lancErr;
      const linhaAdi: Record<string, unknown> = {
        fazenda_id, funcionario_id, data, valor,
        competencia_ref: competencia_ref || null,
        descricao: descricao || null,
        lancamento_id: lanc?.id ?? null,
        status: "pendente",
      };
      let { error: adiErr } = await sb.from("adiantamentos_salario").insert({ ...linhaAdi, tipo: tipoAdi });
      // Coluna tipo ainda não existe (Seção 344 não rodada): só o adiantamento de salário segue sem ela
      if (adiErr && tipoAdi === "salario" && (adiErr.code === "42703" || adiErr.code === "PGRST204")) {
        ({ error: adiErr } = await sb.from("adiantamentos_salario").insert(linhaAdi));
      }
      if (adiErr) {
        if (lanc?.id) await sb.from("lancamentos").delete().eq("id", lanc.id);
        throw tipoAdi === "gratificacao" && (adiErr.code === "42703" || adiErr.code === "PGRST204")
          ? new Error("Aplique a Seção 344 do supabase_migrations.sql para usar adiantamento de gratificação.")
          : adiErr;
      }
      await ressincronizarFolhasDoFuncionario(sb, funcionario_id);
      return NextResponse.json({ ok: true, lancamento_id: lanc?.id ?? null });
    }

    // ─── editar_adiantamento ──────────────────────────────────────────────────
    if (operacao === "editar_adiantamento") {
      const { id, funcionario_id, data, valor, competencia_ref, descricao, funcionario_nome } = payload as any;
      const tipoAdi: "salario" | "gratificacao" = (payload as any).tipo === "gratificacao" ? "gratificacao" : "salario";
      if (tipoAdi === "gratificacao") {
        const erroGrat = await validarAdiantamentoGratificacao(sb, { funcionario_id, competencia_ref, valor, ignorarId: id });
        if (erroGrat) return NextResponse.json({ error: erroGrat }, { status: 422 });
      }
      // Atualiza o registro de adiantamento
      const { error: adiErr } = await sb.from("adiantamentos_salario").update({
        funcionario_id, data, valor,
        competencia_ref: competencia_ref || null,
        descricao: descricao || null,
      }).eq("id", id);
      if (adiErr) throw adiErr;
      // Atualiza o lançamento vinculado se existir
      const { data: adi } = await sb.from("adiantamentos_salario").select("lancamento_id").eq("id", id).single();
      if (adi?.lancamento_id) {
        await sb.from("lancamentos").update({
          valor,
          descricao: `Adiantamento — ${funcionario_nome}${descricao ? ` — ${descricao}` : ""}`,
          data_vencimento: data,
          data_lancamento: data,
        }).eq("id", adi.lancamento_id);
      }
      await ressincronizarFolhasDoFuncionario(sb, funcionario_id);
      return NextResponse.json({ ok: true });
    }

    // ─── cancelar_adiantamento ────────────────────────────────────────────────
    if (operacao === "cancelar_adiantamento") {
      const { id } = payload as { id: string };
      // Busca lancamento_id vinculado antes de cancelar
      const { data: adi } = await sb
        .from("adiantamentos_salario")
        .select("lancamento_id, funcionario_id")
        .eq("id", id)
        .single();
      // Exclui o CP se não estiver baixado
      if (adi?.lancamento_id) {
        const { data: lanc } = await sb
          .from("lancamentos")
          .select("status")
          .eq("id", adi.lancamento_id)
          .single();
        if (lanc?.status === "baixado") {
          throw new Error("Não é possível cancelar: o CP do adiantamento já foi baixado em borderô. Estorne o borderô primeiro.");
        }
        await falharSeErro(sb.from("lancamentos").delete().eq("id", adi.lancamento_id), "excluir lancamentos");
      }
      const { error } = await sb.from("adiantamentos_salario").update({ status: "cancelado" }).eq("id", id);
      if (error) throw error;
      await ressincronizarFolhasDoFuncionario(sb, adi?.funcionario_id);
      return NextResponse.json({ ok: true });
    }

    // ─── salvar_premiacao ─────────────────────────────────────────────────────
    if (operacao === "salvar_premiacao") {
      const { fazenda_id, funcionario_id, mes_referencia, descricao, valor } = payload as any;
      const { error } = await sb.from("funcionarios_premiacoes").insert({
        fazenda_id, funcionario_id, mes_referencia, descricao,
        valor, lancado_financeiro: false,
      });
      if (error) throw error;
      return NextResponse.json({ ok: true });
    }

    // ─── editar_premiacao ─────────────────────────────────────────────────────
    if (operacao === "editar_premiacao") {
      const { id, funcionario_id, mes_referencia, descricao, valor } = payload as any;
      const { error } = await sb.from("funcionarios_premiacoes").update({
        funcionario_id, mes_referencia, descricao, valor,
      }).eq("id", id);
      if (error) throw error;
      return NextResponse.json({ ok: true });
    }

    // ─── excluir_premiacao ────────────────────────────────────────────────────
    if (operacao === "excluir_premiacao") {
      const { id } = payload as { id: string };
      const { error } = await sb.from("funcionarios_premiacoes").delete().eq("id", id);
      if (error) throw error;
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: "operacao inválida" }, { status: 400 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : JSON.stringify(err);
    return NextResponse.json({ error: msg }, { status: err instanceof FolhaFechadaError ? 409 : 500 });
  }
}
