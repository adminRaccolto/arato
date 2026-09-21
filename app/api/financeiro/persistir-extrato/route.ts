/**
 * POST /api/financeiro/persistir-extrato
 *
 * Persiste o estado de conciliação do extrato OFX no banco.
 * Usa service_role_key — imune a JWT expirado e RLS.
 *
 * Também baixa lançamentos (status=baixado) via service_role_key para
 * evitar falhas silenciosas por JWT expirado no caso N:1 (bordero).
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getSessionUser, validateFazendaAccess } from "../../../../lib/api-auth";

const admin = () =>
  createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

type BaixarItem = {
  id: string;
  data_baixa: string;
  valor_pago: number;          // valor pago ACUMULADO final do lançamento (não o incremento)
  status?: "baixado" | "parcial";  // padrão "baixado"; "parcial" quando ainda resta saldo
  conta_bancaria?: string;
};

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as {
      id:          string;
      linhas:      unknown[];
      conciliados: number;
      pendentes:   number;
      lancamento_ids_conciliados?:   string[];   // IDs a marcar como conciliado=true
      lancamento_ids_desconciliados?: string[];  // IDs a marcar como conciliado=false
      baixar?: BaixarItem[];  // Lançamentos a baixar (status→baixado) via service_role
      // Lançamentos já baixados que ainda não tinham conta bancária: grava a conta do
      // extrato, senão a Posição Bancária nunca fecha com o extrato.
      definir_conta?: { id: string; conta_bancaria: string }[];
      // Lançamento baixado em OUTRA conta que o usuário confirmou mover para a conta do extrato.
      mover_conta?: { id: string; conta_bancaria: string }[];
    };

    if (!body.id) {
      return NextResponse.json({ ok: false, error: "id é obrigatório" }, { status: 400 });
    }

    const sb = admin();

    // 0. Autorização — esta rota usa service_role (ignora RLS) e o proxy libera /api/*.
    // Sem esta checagem qualquer requisição anônima podia baixar/conciliar lançamentos
    // de qualquer conta. Exige sessão e que TODO lançamento tocado seja de uma fazenda
    // da conta do usuário (raccotlo passa).
    const user = await getSessionUser();
    if (!user) return NextResponse.json({ ok: false, error: "Não autenticado" }, { status: 401 });
    const idsTocados = Array.from(new Set([
      ...(body.baixar ?? []).map(b => b.id),
      ...(body.definir_conta ?? []).map(d => d.id),
      ...(body.mover_conta ?? []).map(d => d.id),
      ...(body.lancamento_ids_conciliados ?? []),
      ...(body.lancamento_ids_desconciliados ?? []),
    ]));
    const fazendasTocadas = new Set<string>();
    for (let i = 0; i < idsTocados.length; i += 200) {
      const { data: ls } = await sb.from("lancamentos").select("fazenda_id").in("id", idsTocados.slice(i, i + 200));
      for (const l of ls ?? []) fazendasTocadas.add(l.fazenda_id as string);
    }
    const { data: extAtual } = await sb.from("extratos_bancarios").select("fazenda_id").eq("id", body.id).maybeSingle();
    if (extAtual?.fazenda_id) fazendasTocadas.add(extAtual.fazenda_id as string);
    for (const fid of fazendasTocadas) {
      const acesso = await validateFazendaAccess(fid, req.headers.get("authorization") ?? undefined);
      if (!acesso.ok) return NextResponse.json({ ok: false, error: acesso.error }, { status: acesso.status });
    }

    const falhas: string[] = [];

    // 1. Atualiza extrato (log do import; id "virtual-…" não existe na tabela — no-op esperado)
    const { error } = await sb
      .from("extratos_bancarios")
      .update({ linhas: body.linhas, conciliados: body.conciliados, pendentes: body.pendentes })
      .eq("id", body.id);

    if (error) {
      console.error("[persistir-extrato] erro ao atualizar extrato:", error.message);
      return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
    }

    // 2. Baixa lançamentos — antes os erros de cada update eram descartados e a rota
    // respondia ok:true mesmo com a baixa não gravada (tela "baixada", banco em aberto).
    // Também sincroniza parcelas_pagamento, como /api/financeiro/baixar já fazia.
    if (body.baixar?.length) {
      const resultados = await Promise.all(
        body.baixar.map(async item => {
          const r = await sb.from("lancamentos").update({
            status:     item.status ?? "baixado",
            data_baixa: item.data_baixa,
            valor_pago: item.valor_pago,
            ...(item.conta_bancaria ? { conta_bancaria: item.conta_bancaria } : {}),
          }).eq("id", item.id);
          if (r.error) return `baixa ${item.id}: ${r.error.message}`;
          await sb.from("parcelas_pagamento")
            .update({ status: item.status === "parcial" ? "parcial" : "pago", data_pagamento: item.data_baixa })
            .eq("lancamento_id", item.id);
          return null;
        })
      );
      falhas.push(...(resultados.filter(Boolean) as string[]));
    }

    // 2b. Conta bancária de lançamentos que já estavam baixados sem conta
    for (const d of body.definir_conta ?? []) {
      const r = await sb.from("lancamentos").update({ conta_bancaria: d.conta_bancaria }).eq("id", d.id).is("conta_bancaria", null);
      if (r.error) falhas.push(`conta ${d.id}: ${r.error.message}`);
    }

    // 2c. Mover a baixa para a conta do extrato (confirmado pelo usuário na tela)
    for (const d of body.mover_conta ?? []) {
      const r = await sb.from("lancamentos").update({ conta_bancaria: d.conta_bancaria }).eq("id", d.id);
      if (r.error) falhas.push(`mover conta ${d.id}: ${r.error.message}`);
    }

    // 3. Marca lancamentos como conciliado=true (quando vinculados)
    if (body.lancamento_ids_conciliados?.length) {
      const r = await sb.from("lancamentos")
        .update({ conciliado: true })
        .in("id", body.lancamento_ids_conciliados);
      if (r.error) falhas.push(`conciliado=true: ${r.error.message}`);
    }

    // 4. Marca lancamentos como conciliado=false (quando desvinculados)
    if (body.lancamento_ids_desconciliados?.length) {
      const r = await sb.from("lancamentos")
        .update({ conciliado: false })
        .in("id", body.lancamento_ids_desconciliados);
      if (r.error) falhas.push(`conciliado=false: ${r.error.message}`);
    }

    if (falhas.length) {
      console.error("[persistir-extrato] falhas parciais:", falhas);
      return NextResponse.json({ ok: false, error: falhas.join(" | ") }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[persistir-extrato]", msg);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

/**
 * DELETE /api/financeiro/persistir-extrato?id=<extrato_id>
 *
 * Exclui um registro de importação de extrato — via service_role_key pelo
 * mesmo motivo do POST (o delete direto do cliente falhava silenciosamente
 * com JWT expirado, achado real 18/09/2026: "não tem mais como excluir").
 */
export async function DELETE(req: NextRequest) {
  try {
    const id = new URL(req.url).searchParams.get("id");
    if (!id) return NextResponse.json({ ok: false, error: "id é obrigatório" }, { status: 400 });

    const sb = admin();
    const { data: ext } = await sb.from("extratos_bancarios").select("ofx_storage_path, fazenda_id").eq("id", id).maybeSingle();
    if (!ext) return NextResponse.json({ ok: false, error: "Extrato não encontrado" }, { status: 404 });
    const acesso = await validateFazendaAccess(ext.fazenda_id as string, req.headers.get("authorization") ?? undefined);
    if (!acesso.ok) return NextResponse.json({ ok: false, error: acesso.error }, { status: acesso.status });

    const { error } = await sb.from("extratos_bancarios").delete().eq("id", id);
    if (error) {
      console.error("[persistir-extrato][DELETE] erro:", error.message);
      return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
    }

    if (ext?.ofx_storage_path) {
      await sb.storage.from("arquivos").remove([ext.ofx_storage_path]).catch(() => {});
    }

    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[persistir-extrato][DELETE]", msg);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
