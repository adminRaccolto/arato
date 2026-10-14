import { hojeLocal } from "../../../../lib/data-local";
import { NextResponse } from "next/server";
import { vencimentoSalario } from "../../../../lib/folha-calculo";
import { createClient } from "@supabase/supabase-js";

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
  const { data: prem, error: e1 } = await sb.from("funcionario_premiacoes").select("valor, mes_referencia").eq("funcionario_id", p.funcionario_id);
  if (e1) return `Não foi possível ler as gratificações do funcionário: ${e1.message}`;
  const lancada = (prem ?? []).filter((x: any) => String(x.mes_referencia).slice(0, 7) === comp).reduce((s: number, x: any) => s + Number(x.valor || 0), 0);
  if (lancada <= 0) return "Não há gratificação lançada para este funcionário nessa competência. Lance antes em Cadastros, Funcionários, aba Premiações.";
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
          .select("folha_id")
          .in("folha_id", folhaIds);
        (counts ?? []).forEach((row: any) => {
          countMap[row.folha_id] = (countMap[row.folha_id] ?? 0) + 1;
        });
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
      const { error } = await sb.from("folha_funcionarios").delete().eq("folha_id", folha_id);
      if (error) throw error;
      return NextResponse.json({ ok: true });
    }

    // ─── insert_funcionarios ──────────────────────────────────────────────────
    if (operacao === "insert_funcionarios") {
      const { rows } = payload as { rows: unknown[] };
      if (rows.length) {
        const { error } = await sb.from("folha_funcionarios").insert(rows);
        if (error) throw error;
      }
      return NextResponse.json({ ok: true });
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
      for (const it of (itens ?? [])) {
        const liq = Math.max(0, Math.round((
          it.salario_bruto - it.inss_trabalhador - it.irrf - it.adiantamento
          - it.outros_descontos + it.vale_transporte + it.vale_refeicao + it.outros_beneficios
          + (it.complemento_salarial ?? 0)
        ) * 100) / 100);

        const { data: lancamento, error: lancErr } = await inserirLancamentoFolha(sb, {
          fazenda_id,
          empresa_id: empresa_id ?? null,
          produtor_id: it.produtor_id ?? null,
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

      if (totalFGTS > 0.005) {
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

      if (empresa_id && totalINSSPat > 0.005) {
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
        await sb.from("lancamentos").delete().in("id", cpIds);
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
        await sb.from("lancamentos").delete().in("id", cpIds);
      }

      const funcIds = (itens ?? []).map((i: any) => i.funcionario_id).filter(Boolean) as string[];
      if (funcIds.length > 0 && fazenda_id && competencia) {
        await sb.from("adiantamentos_salario")
          .update({ status: "pendente" })
          .eq("fazenda_id", fazenda_id).eq("competencia_ref", competencia).eq("status", "descontado")
          .in("funcionario_id", funcIds);
      }

      await sb.from("folha_funcionarios").delete().eq("folha_id", id);
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
      return NextResponse.json({ ok: true });
    }

    // ─── cancelar_adiantamento ────────────────────────────────────────────────
    if (operacao === "cancelar_adiantamento") {
      const { id } = payload as { id: string };
      // Busca lancamento_id vinculado antes de cancelar
      const { data: adi } = await sb
        .from("adiantamentos_salario")
        .select("lancamento_id")
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
        await sb.from("lancamentos").delete().eq("id", adi.lancamento_id);
      }
      const { error } = await sb.from("adiantamentos_salario").update({ status: "cancelado" }).eq("id", id);
      if (error) throw error;
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
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
