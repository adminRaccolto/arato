import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const adm = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as {
      acao: "emitir" | "cancelar" | "confirmar_entrada" | "salvar";
      transferencia_id?: string;
      transferencia?: Record<string, unknown>;
      itens?: Array<Record<string, unknown>>;
    };

    // ── CANCELAR ─────────────────────────────────────────────────────────────
    if (body.acao === "cancelar") {
      const { error } = await adm
        .from("transferencias_estoque")
        .update({ status: "cancelada" })
        .eq("id", body.transferencia_id!);
      if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
      return NextResponse.json({ ok: true });
    }

    // ── EMITIR NF (solicitação do campo) ─────────────────────────────────────
    if (body.acao === "emitir") {
      const tid = body.transferencia_id!;

      // Busca a transferência com itens
      const { data: t, error: tErr } = await adm
        .from("transferencias_estoque")
        .select("*, transferencias_estoque_itens(*)")
        .eq("id", tid)
        .single();
      if (tErr) return NextResponse.json({ ok: false, error: tErr.message }, { status: 500 });

      // Atualiza status
      const { error: uErr } = await adm
        .from("transferencias_estoque")
        .update({ status: "emitida", data_emissao: new Date().toISOString() })
        .eq("id", tid);
      if (uErr) return NextResponse.json({ ok: false, error: uErr.message }, { status: 500 });

      // Movimentações de estoque
      const itens = (t.transferencias_estoque_itens ?? []) as Array<Record<string, unknown>>;
      for (const it of itens) {
        await adm.from("movimentacoes_estoque").insert({
          fazenda_id:  t.fazenda_origem_id,
          insumo_id:   it.insumo_id,
          tipo:        "saida",
          motivo:      `Transferência ${t.numero} → destino`,
          quantidade:  it.quantidade,
          data:        t.data_transferencia,
          deposito_id: t.deposito_origem_id || null,
          observacao:  `NF de Transferência — CFOP ${t.cfop}`,
          auto:        true,
        });
        if (t.entrada_automatica) {
          await adm.from("movimentacoes_estoque").insert({
            fazenda_id:  t.fazenda_destino_id,
            insumo_id:   it.insumo_id,
            tipo:        "entrada",
            motivo:      `Transferência ${t.numero} ← origem`,
            quantidade:  it.quantidade,
            data:        t.data_transferencia,
            deposito_id: t.deposito_destino_id || null,
            observacao:  `NF de Transferência — CFOP ${t.cfop}`,
            auto:        true,
          });
        }
      }
      return NextResponse.json({ ok: true });
    }

    // ── CONFIRMAR ENTRADA ─────────────────────────────────────────────────────
    if (body.acao === "confirmar_entrada") {
      const tid = body.transferencia_id!;
      const { data: t, error: tErr } = await adm
        .from("transferencias_estoque")
        .select("*, transferencias_estoque_itens(*)")
        .eq("id", tid)
        .single();
      if (tErr) return NextResponse.json({ ok: false, error: tErr.message }, { status: 500 });

      const itens = (t.transferencias_estoque_itens ?? []) as Array<Record<string, unknown>>;
      for (const it of itens) {
        await adm.from("movimentacoes_estoque").insert({
          fazenda_id:  t.fazenda_destino_id,
          insumo_id:   it.insumo_id,
          tipo:        "entrada",
          motivo:      `Transferência ${t.numero} ← origem`,
          quantidade:  it.quantidade,
          data:        t.data_transferencia,
          deposito_id: t.deposito_destino_id || null,
          auto:        true,
        });
      }
      await adm.from("transferencias_estoque").update({ status: "entrada_confirmada" }).eq("id", tid);
      return NextResponse.json({ ok: true });
    }

    // ── SALVAR (nova transferência pelo desktop) ───────────────────────────────
    if (body.acao === "salvar") {
      const { transferencia, itens } = body;
      if (!transferencia) return NextResponse.json({ ok: false, error: "Dados ausentes" }, { status: 400 });

      const status = transferencia.status as string;

      const { data: transf, error: tErr } = await adm
        .from("transferencias_estoque")
        .insert(transferencia)
        .select()
        .single();
      if (tErr) return NextResponse.json({ ok: false, error: tErr.message }, { status: 500 });

      if (itens && itens.length > 0) {
        const itensCom = itens.map(it => ({ ...it, transferencia_id: transf.id }));
        await adm.from("transferencias_estoque_itens").insert(itensCom);
      }

      // Movimentações automáticas se emitido direto
      if (status === "emitida" && itens) {
        for (const it of itens) {
          await adm.from("movimentacoes_estoque").insert({
            fazenda_id:  transferencia.fazenda_origem_id,
            insumo_id:   it.insumo_id,
            tipo:        "saida",
            motivo:      `Transferência ${transf.numero}`,
            quantidade:  Number(it.quantidade),
            data:        transferencia.data_transferencia,
            deposito_id: transferencia.deposito_origem_id || null,
            observacao:  `NF de Transferência — CFOP ${transferencia.cfop}`,
            auto:        true,
          });
          if (transferencia.entrada_automatica) {
            await adm.from("movimentacoes_estoque").insert({
              fazenda_id:  transferencia.fazenda_destino_id,
              insumo_id:   it.insumo_id,
              tipo:        "entrada",
              motivo:      `Transferência ${transf.numero}`,
              quantidade:  Number(it.quantidade),
              data:        transferencia.data_transferencia,
              deposito_id: transferencia.deposito_destino_id || null,
              observacao:  `NF de Transferência — CFOP ${transferencia.cfop}`,
              auto:        true,
            });
          }
        }
      }

      return NextResponse.json({ ok: true, id: transf.id });
    }

    return NextResponse.json({ ok: false, error: "Ação inválida" }, { status: 400 });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
