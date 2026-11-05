/**
 * POST /api/admin/zeramento-estoque — zera o saldo dos itens nas fazendas informadas (equipe Raccolto).
 * O saldo do item é a soma das movimentações e o banco ignora gravação direta em insumos.estoque. Por isso o zeramento
 * lança um ajuste por item e depósito, que fica registrado no Kardex.
 * Body: { fazenda_ids: string[], aplicar?: boolean }  (aplicar=false só informa quantos ajustes seriam lançados)
 */
import { NextResponse } from "next/server";
import { createClient } from "../../../../lib/supabase-servidor";
import { exigirRaccoltoAdmin } from "../../../../lib/api-auth";
import { hojeLocal } from "../../../../lib/data-local";

function serviceRole() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

export const maxDuration = 300;

export async function POST(req: Request) {
  const negado = await exigirRaccoltoAdmin(req);
  if (negado) return negado;

  const { fazenda_ids, aplicar = true } = await req.json() as { fazenda_ids: string[]; aplicar?: boolean };
  if (!Array.isArray(fazenda_ids) || fazenda_ids.length === 0) {
    return NextResponse.json({ error: "fazenda_ids obrigatório" }, { status: 400 });
  }

  const sb = serviceRole();
  const saldos: { insumo_id: string; fazenda_id: string; deposito_id: string | null; saldo: number }[] = [];
  for (let de = 0; ; de += 1000) {
    const { data, error } = await sb.from("saldo_insumo_deposito").select("insumo_id, fazenda_id, deposito_id, saldo")
      .in("fazenda_id", fazenda_ids).order("insumo_id").order("fazenda_id").order("deposito_id").range(de, de + 999);
    if (error) return NextResponse.json({ ok: false, total: 0, erros: [error.message] }, { status: 500 });
    saldos.push(...(data ?? []).filter(s => Math.abs(Number(s.saldo)) > 1e-9) as typeof saldos);
    if (!data || data.length < 1000) break;
  }
  if (!aplicar) return NextResponse.json({ ok: true, total: saldos.length, erros: [] });

  const erros: string[] = [];
  let total = 0;
  const hoje = hojeLocal();
  for (let i = 0; i < saldos.length; i += 200) {
    const linhas = saldos.slice(i, i + 200).map(s => ({
      insumo_id: s.insumo_id, fazenda_id: s.fazenda_id, deposito_id: s.deposito_id,
      tipo: "ajuste", motivo: "ajuste_manual", quantidade: -Number(s.saldo), data: hoje,
      observacao: "Zeramento de estoque pela equipe Raccolto", auto: true,
    }));
    const { error } = await sb.from("movimentacoes_estoque").insert(linhas);
    if (error) erros.push(error.message); else total += linhas.length;
  }

  // Saldo por princípio ativo não tem proteção: é zerado direto
  for (const fId of fazenda_ids) {
    const { error } = await sb.from("pa_saldos").update({ saldo_atual: 0 }).eq("fazenda_id", fId);
    if (error && !error.message.includes("does not exist")) erros.push(`pa_saldos (${fId}): ${error.message}`);
  }

  return NextResponse.json({ ok: erros.length === 0, total, erros });
}
