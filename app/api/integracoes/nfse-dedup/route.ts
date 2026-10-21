/**
 * POST /api/integracoes/nfse-dedup  { fazenda_id, dry_run? }
 * Limpa NFS-e duplicadas da conta (qualquer origem). Regra e segurança em lib/fiscal/dedup-nfse.ts:
 * mesmo número + prestador (sem pontuação), data até 45 dias, em qualquer fazenda da conta; NFS-e processada nunca é
 * apagada; só sai cópia PENDENTE sem título/pedido vinculado. Com dry_run=true só simula.
 */
import { falharSeErro } from "../../../../lib/db-util";
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "../../../../lib/supabase-servidor";
import { planejarLimpezaNfse, type NfseDup } from "../../../../lib/fiscal/dedup-nfse";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(req: NextRequest) {
  try {
    const { fazenda_id, dry_run = false } = await req.json() as { fazenda_id: string; dry_run?: boolean };
    if (!fazenda_id) return NextResponse.json({ erro: "fazenda_id obrigatório" }, { status: 400 });
    const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
    const { data: fazRow } = await db.from("fazendas").select("conta_id").eq("id", fazenda_id).maybeSingle();
    if (!fazRow?.conta_id) return NextResponse.json({ erro: "Conta não encontrada para esta fazenda" }, { status: 400 });
    const { data: fazRows } = await db.from("fazendas").select("id").eq("conta_id", fazRow.conta_id);
    const fazendaIds = (fazRows ?? []).map(f => f.id as string);

    const nfs: NfseDup[] = [];
    for (let i = 0; ; i += 1000) {
      const { data, error } = await db.from("nf_servicos")
        .select("id, fazenda_id, numero_nf, serie, prestador_cnpj, prestador_nome, data_prestacao, chave_nfse, status, created_at, lancamento_id, pedido_compra_id")
        .in("fazenda_id", fazendaIds).order("id", { ascending: true }).range(i, i + 999);
      if (error) throw new Error(error.message);
      nfs.push(...((data ?? []) as NfseDup[]));
      if (!data || data.length < 1000) break;
    }
    const plano = planejarLimpezaNfse(nfs, new Set(fazendaIds));

    if (!dry_run && plano.remover.length > 0) {
      for (let i = 0; i < plano.remover.length; i += 100) {
        await falharSeErro(db.from("nf_servicos").delete().in("id", plano.remover.slice(i, i + 100)), "excluir nf_servicos");
      }
    }
    return NextResponse.json({ sucesso: true, dry_run, grupos_duplicados: plano.gruposDuplicados, registros_removidos: plano.remover.length, mantidas_por_vinculo: plano.mantidasPorVinculo });
  } catch (err) {
    return NextResponse.json({ erro: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
