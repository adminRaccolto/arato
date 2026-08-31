import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// Usa service_role_key para contornar JWT expirado / RLS em folha_pagamento.
// Valida o token do usuário antes de executar qualquer operação.
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
    if (operacao === "listar_folhas") {
      const { fazenda_id } = payload as { fazenda_id: string };
      const { data, error } = await sb
        .from("folha_pagamento")
        .select("*")
        .eq("fazenda_id", fazenda_id)
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
    if (operacao === "upsert_folha") {
      const { fazenda_id, empresa_id, competencia, ...dados } = payload as {
        fazenda_id: string; empresa_id: string | null; competencia: string;
        valor_bruto: number; valor_liquido: number; inss_patronal: number; fgts_total: number; obs?: string;
      };
      let q = sb.from("folha_pagamento").select("id").eq("fazenda_id", fazenda_id).eq("competencia", competencia);
      if (empresa_id) q = q.eq("empresa_id", empresa_id); else q = q.is("empresa_id", null);
      const { data: exist } = await q.maybeSingle();

      if (exist?.id) {
        const { error } = await sb.from("folha_pagamento").update(dados).eq("id", exist.id);
        if (error) throw error;
        return NextResponse.json({ ok: true, id: exist.id, criou: false });
      } else {
        const { data, error } = await sb.from("folha_pagamento")
          .insert({ fazenda_id, empresa_id: empresa_id ?? null, competencia, status: "rascunho", ...dados })
          .select("id").single();
        if (error) throw error;
        return NextResponse.json({ ok: true, id: data.id, criou: true });
      }
    }

    // ─── update_folha ─────────────────────────────────────────────────────────
    if (operacao === "update_folha") {
      const { id, ...dados } = payload as { id: string } & Record<string, unknown>;
      const { error } = await sb.from("folha_pagamento").update(dados).eq("id", id);
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

      const hoje = new Date().toISOString().slice(0, 10);
      const vencimento = `${competencia}-05`;
      const nomeMesLabel = (() => {
        const [ano, mes] = competencia.split("-");
        const n = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];
        return `${n[parseInt(mes)-1]}/${ano}`;
      })();

      // Gera CP por funcionário via service_role_key (evita RLS 42501)
      for (const it of (itens ?? [])) {
        const liq = Math.max(0, Math.round((
          it.salario_bruto - it.inss_trabalhador - it.irrf - it.adiantamento
          - it.outros_descontos + it.vale_transporte + it.vale_refeicao + it.outros_beneficios
          + (it.complemento_salarial ?? 0)
        ) * 100) / 100);

        const { data: lancamento, error: lancErr } = await sb.from("lancamentos").insert({
          fazenda_id,
          empresa_id: empresa_id ?? null,
          natureza: "real",
          tipo: "pagar",
          descricao: `Salário ${nomeMesLabel} — ${it.nome_funcionario}`,
          valor: liq,
          moeda: "BRL",
          status: "em_aberto",
          categoria: "Pessoal / Salários",
          data_vencimento: vencimento,
          data_lancamento: hoje,
        }).select("id").single();

        if (lancErr) throw new Error(`CP ${it.nome_funcionario}: ${lancErr.message}`);

        if (lancamento?.id) {
          await sb.from("folha_funcionarios").update({ cp_lancamento_id: lancamento.id }).eq("id", it.id);
        }
      }

      // Marca como "descontado" SOMENTE os adiantamentos cujo funcionário
      // tem adiantamento > 0 na folha — evita marcar adiantamentos não incluídos.
      const funcIdsComAdiantamento = (itens ?? [])
        .filter((it: any) => (it.adiantamento ?? 0) > 0 && it.funcionario_id)
        .map((it: any) => it.funcionario_id as string);

      if (funcIdsComAdiantamento.length > 0) {
        await sb.from("adiantamentos_salario")
          .update({ status: "descontado" })
          .eq("fazenda_id", fazenda_id)
          .eq("competencia_ref", competencia)
          .eq("status", "pendente")
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

      const cpIds = (itens ?? []).map((i: any) => i.cp_lancamento_id).filter(Boolean) as string[];

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
    if (operacao === "delete_folha") {
      const { id } = payload as { id: string };
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
    if (operacao === "listar_adi_prem") {
      const { fazenda_id } = payload as { fazenda_id: string };
      const [{ data: adis, error: adiErr }, { data: prems, error: premErr }] = await Promise.all([
        sb.from("adiantamentos_salario").select("*, funcionarios(nome)").eq("fazenda_id", fazenda_id).order("data", { ascending: false }),
        sb.from("funcionarios_premiacoes").select("*, funcionarios(nome)").eq("fazenda_id", fazenda_id),
      ]);
      if (adiErr) throw adiErr;
      if (premErr) throw premErr;
      return NextResponse.json({ ok: true, adis: adis ?? [], prems: prems ?? [] });
    }

    // ─── salvar_adiantamento ──────────────────────────────────────────────────
    if (operacao === "salvar_adiantamento") {
      const { fazenda_id, funcionario_id, data, valor, competencia_ref, descricao, funcionario_nome } = payload as any;
      const { data: lanc, error: lancErr } = await sb.from("lancamentos").insert({
        fazenda_id, tipo: "pagar", natureza: "real",
        descricao: `Adiantamento — ${funcionario_nome}${descricao ? ` — ${descricao}` : ""}`,
        valor, moeda: "BRL", status: "em_aberto",
        categoria: "Pessoal / Adiantamentos",
        data_vencimento: data, data_lancamento: data,
      }).select("id").single();
      if (lancErr) throw lancErr;
      const { error: adiErr } = await sb.from("adiantamentos_salario").insert({
        fazenda_id, funcionario_id, data, valor,
        competencia_ref: competencia_ref || null,
        descricao: descricao || null,
        lancamento_id: lanc?.id ?? null,
        status: "pendente",
      });
      if (adiErr) throw adiErr;
      return NextResponse.json({ ok: true });
    }

    // ─── editar_adiantamento ──────────────────────────────────────────────────
    if (operacao === "editar_adiantamento") {
      const { id, funcionario_id, data, valor, competencia_ref, descricao, funcionario_nome } = payload as any;
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
