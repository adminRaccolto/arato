/**
 * POST /api/integracoes/sieg-dedup  { fazenda_id, dry_run? }
 * Limpa NFs de entrada duplicadas da conta (qualquer origem: SIEG, XML, manual).
 *
 * Duplicada = mesma chave de acesso OU mesmo número + série + CNPJ do fornecedor (quando as duas têm chave, a chave decide).
 * Cópias que estão em fazenda inexistente (órfã) entram na comparação — é onde estavam quase todas as duplicatas.
 *
 * Regras de segurança:
 *  • NF processada nunca é apagada;
 *  • só se apaga cópia PENDENTE sem nenhum vínculo (título a pagar, título da Empresa, pedido de compra, estoque);
 *  • em cada grupo fica a melhor cópia: processada > com vínculo > em fazenda da conta > a mais antiga.
 * Com dry_run=true só simula e devolve o que seria feito.
 */
import { falharSeErro } from "../../../../lib/db-util";
import { planejarLimpeza } from "../../../../lib/fiscal/dedup-nf";
import { NextRequest, NextResponse } from "next/server";
import { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "../../../../lib/supabase-servidor";

export const runtime = "nodejs";
export const maxDuration = 120;

const sb = () => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const dig = (s: unknown) => String(s ?? "").replace(/\D/g, "");

type Nf = { id: string; numero: string | null; serie: string | null; chave_acesso: string | null; emitente_cnpj: string | null; emitente_nome: string | null;
            fazenda_id: string; created_at: string; status: string; lancamento_id: string | null; emp_lancamento_id: string | null; pedido_compra_id: string | null };

async function todas(db: SupabaseClient, fazIds: string[]): Promise<Nf[]> {
  const out: Nf[] = [];
  for (let i = 0; ; i += 1000) {
    const { data, error } = await db.from("nf_entradas")
      .select("id, numero, serie, chave_acesso, emitente_cnpj, emitente_nome, fazenda_id, created_at, status, lancamento_id, emp_lancamento_id, pedido_compra_id")
      .in("fazenda_id", fazIds).neq("status", "cancelada").order("created_at", { ascending: true }).order("id", { ascending: true }).range(i, i + 999);
    if (error) throw new Error(error.message);
    out.push(...((data ?? []) as Nf[]));
    if (!data || data.length < 1000) break;
  }
  return out;
}

export async function POST(req: NextRequest) {
  try {
    const { fazenda_id, dry_run = false } = await req.json() as { fazenda_id: string; dry_run?: boolean };
    if (!fazenda_id) return NextResponse.json({ erro: "fazenda_id obrigatório" }, { status: 400 });
    const db = sb();

    const { data: fazRow } = await db.from("fazendas").select("conta_id").eq("id", fazenda_id).maybeSingle();
    if (!fazRow?.conta_id) return NextResponse.json({ erro: "Conta não encontrada para esta fazenda" }, { status: 400 });
    const { data: fazRows } = await db.from("fazendas").select("id").eq("conta_id", fazRow.conta_id);
    const fazendaIds = (fazRows ?? []).map(f => f.id as string);
    const naConta = new Set(fazendaIds);

    // 1) NFs da conta; 2) cópias dessas mesmas chaves em QUALQUER fazenda (inclui a órfã)
    const daConta = await todas(db, fazendaIds);
    const chaves = [...new Set(daConta.map(n => dig(n.chave_acesso)).filter(c => c.length === 44))];
    const todasNfs = new Map<string, Nf>(daConta.map(n => [n.id, n]));
    for (let i = 0; i < chaves.length; i += 150) {
      const { data } = await db.from("nf_entradas")
        .select("id, numero, serie, chave_acesso, emitente_cnpj, emitente_nome, fazenda_id, created_at, status, lancamento_id, emp_lancamento_id, pedido_compra_id")
        .in("chave_acesso", chaves.slice(i, i + 150)).neq("status", "cancelada");
      for (const n of (data ?? []) as Nf[]) todasNfs.set(n.id, n);
    }
    const nfs = [...todasNfs.values()].sort((a, b) => a.created_at.localeCompare(b.created_at));

    // Vínculos (título/estoque) das cópias dos grupos repetidos (para não apagar nada que já tenha efeito)
    const comVinculo = new Set<string>();
    const k = (n: Nf) => dig(n.chave_acesso).length === 44 ? `c:${dig(n.chave_acesso)}` : `n:${n.numero}|${n.serie}|${dig(n.emitente_cnpj)}`;
    const contagem = new Map<string, number>(); for (const n of nfs) contagem.set(k(n), (contagem.get(k(n)) ?? 0) + 1);
    const candidatosIds = nfs.filter(n => (contagem.get(k(n)) ?? 0) > 1).map(n => n.id);
    for (let i = 0; i < candidatosIds.length; i += 200) {
      const sl = candidatosIds.slice(i, i + 200);
      for (const tab of ["lancamentos", "empresa_lancamentos", "movimentacoes_estoque"] as const) {
        const { data } = await db.from(tab).select("nf_entrada_id").in("nf_entrada_id", sl);
        for (const r of (data ?? []) as { nf_entrada_id: string }[]) comVinculo.add(r.nf_entrada_id);
      }
    }
    const { remover, gruposDuplicados, mantidasPorVinculo, detalhe } = planejarLimpeza(nfs, comVinculo, naConta);

    if (!dry_run && remover.length > 0) {
      for (let i = 0; i < remover.length; i += 100) {
        const sl = remover.slice(i, i + 100);
        await falharSeErro(db.from("nf_entrada_itens").delete().in("nf_entrada_id", sl), "excluir nf_entrada_itens");
        await falharSeErro(db.from("nf_entradas").delete().in("id", sl), "excluir nf_entradas");
      }
    }
    return NextResponse.json({
      sucesso: true, dry_run,
      grupos_duplicados: gruposDuplicados,
      duplicatas_encontradas: gruposDuplicados,
      registros_removidos: remover.length,
      mantidas_por_vinculo: mantidasPorVinculo,
      detalhe: detalhe.slice(0, 50),
    });
  } catch (err) {
    return NextResponse.json({ erro: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
