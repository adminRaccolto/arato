/**
 * POST /api/admin/limpeza — limpeza seletiva de dados de um cliente (equipe Raccolto).
 * Body: { conta_id, fazenda_id: string | "todas", chaves: string[], aplicar: boolean, confirmacao?: "CONFIRMO" }
 * aplicar=false só conta. Cada item roda numa transação: se não der para apagar, nada daquele item é apagado.
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "../../../../lib/supabase-servidor";
import { exigirRaccoltoAdmin } from "../../../../lib/api-auth";
import { itemLimpeza } from "../../../../lib/admin/limpeza";

export const runtime = "nodejs";
export const maxDuration = 300;

const admin = () => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });

const SEM_MIGRACAO = /fn_limpar_dados|schema cache/i;

export async function POST(req: NextRequest) {
  const negado = await exigirRaccoltoAdmin(req);
  if (negado) return negado;
  try {
    const { conta_id, fazenda_id, chaves = [], aplicar = false, confirmacao } = await req.json() as {
      conta_id?: string; fazenda_id?: string; chaves?: string[]; aplicar?: boolean; confirmacao?: string;
    };
    if (!conta_id || !fazenda_id) return NextResponse.json({ ok: false, error: "Escolha o cliente e a fazenda." }, { status: 400 });
    if (aplicar && confirmacao !== "CONFIRMO") return NextResponse.json({ ok: false, error: "Confirmação ausente." }, { status: 400 });

    const sb = admin();
    const { data: fazendas, error: eF } = await sb.from("fazendas").select("id").eq("conta_id", conta_id);
    if (eF) throw eF;
    const todas = fazenda_id === "todas";
    const fazendaIds = todas ? (fazendas ?? []).map(f => f.id as string) : [fazenda_id];
    if (!todas && !(fazendas ?? []).some(f => f.id === fazenda_id)) {
      return NextResponse.json({ ok: false, error: "Fazenda não pertence a este cliente." }, { status: 400 });
    }

    const resultados: { chave: string; label: string; ok: boolean; total: number; contar: number; erro?: string }[] = [];
    for (const chave of chaves) {
      const item = itemLimpeza(chave);
      if (!item) continue;
      const label = `${item.grupo.label} · ${item.sub.label}`;
      if (aplicar && item.sub.tabelas.length === 0) continue;
      // Sem aplicar basta a tabela principal; o item sem tabelas (zeramento) conta a principal só para informar.
      const tabelas = aplicar ? item.sub.tabelas : [item.sub.contar];
      const { data, error } = await sb.rpc("fn_limpar_dados", {
        p_conta: conta_id, p_fazendas: fazendaIds, p_incluir_conta: todas, p_tabelas: tabelas, p_filtro: item.sub.filtro ?? null, p_aplicar: aplicar,
      });
      if (error) {
        if (SEM_MIGRACAO.test(error.message)) return NextResponse.json({ ok: false, error: "Execute a Seção 416 no Supabase para usar a limpeza." }, { status: 503 });
        resultados.push({ chave, label, ok: false, total: 0, contar: 0, erro: error.message });
        continue;
      }
      const r = data as { total: number; tabelas: Record<string, number> };
      resultados.push({ chave, label, ok: true, total: r.total, contar: r.tabelas?.[item.sub.contar] ?? 0 });
    }
    return NextResponse.json({ ok: true, aplicado: aplicar, resultados });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
