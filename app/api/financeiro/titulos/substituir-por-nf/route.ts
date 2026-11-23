import { NextRequest, NextResponse } from "next/server";
import { exigirAcessoRegistro } from "../../../../../lib/api-auth";
import { createClient } from "../../../../../lib/supabase-servidor";
import { motivoSubstituirPorNf, observacaoSubstituido } from "../../../../../lib/financeiro/substituir-por-nf";

// Processar e Baixar (CP → Vincular Nota Fiscal à Baixa), 23/11/2026: a NF pendente foi processada a partir do título
// lançado à mão; a NF gerou o próprio título no CP (com itens, estoque e classificação), e o título manual é cancelado
// com a referência da NF — sem isso, a mesma conta ficaria duas vezes a pagar. Só para título manual ainda sem pagamento.
export async function POST(req: NextRequest) {
  try {
    const p = await req.json() as { titulo_id?: string; tipo?: "nf" | "nfse"; nf_id?: string };
    if (!p.titulo_id || !p.nf_id || (p.tipo !== "nf" && p.tipo !== "nfse")) return NextResponse.json({ ok: false, error: "Informe o título e a NF." }, { status: 400 });
    const negado = await exigirAcessoRegistro(req, "lancamentos", p.titulo_id);
    if (negado) return negado;
    const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

    const { data: titulo } = await sb.from("lancamentos")
      .select("id, fazenda_id, tipo, status, natureza, valor, valor_pago, lote_id, conciliado, fatura_cartao_id, nf_entrada_id, origem_lancamento, observacao, descricao")
      .eq("id", p.titulo_id).maybeSingle();
    if (!titulo) return NextResponse.json({ ok: false, error: "Título não encontrado." }, { status: 404 });
    const { data: filhos } = await sb.from("lancamentos").select("id, valor_pago, status").eq("titulo_origem_id", p.titulo_id).neq("status", "cancelado");

    const tabelaNf = p.tipo === "nf" ? "nf_entradas" : "nf_servicos";
    const { data: nf } = await sb.from(tabelaNf).select("*").eq("id", p.nf_id).maybeSingle();
    if (!nf) return NextResponse.json({ ok: false, error: "NF não encontrada." }, { status: 404 });
    const nota = nf as { fazenda_id: string; status: string; numero?: string | null; numero_nf?: string | null; lancamento_id?: string | null };
    const { data: fzs } = await sb.from("fazendas").select("id, conta_id").in("id", [titulo.fazenda_id, nota.fazenda_id]);
    const contaDe = new Map((fzs ?? []).map(f => [f.id as string, f.conta_id as string]));

    // Títulos que a NF gerou no CP. NF-e: lancamentos.nf_entrada_id (e nf_entradas.lancamento_id). NFS-e: a nota guarda
    // o 1º título (nf_servicos.lancamento_id) e as demais parcelas têm o mesmo agrupador.
    type T = { id: string; status: string; valor: number; data_vencimento: string | null; agrupador?: string | null };
    const titulosNf = new Map<string, T>();
    if (p.tipo === "nf") {
      const { data } = await sb.from("lancamentos").select("id, status, valor, data_vencimento").eq("nf_entrada_id", p.nf_id).neq("status", "cancelado");
      for (const t of (data ?? []) as T[]) titulosNf.set(t.id, t);
    }
    if (nota.lancamento_id && !titulosNf.has(nota.lancamento_id)) {
      const { data: t } = await sb.from("lancamentos").select("id, status, valor, data_vencimento, agrupador").eq("id", nota.lancamento_id).neq("status", "cancelado").maybeSingle();
      if (t) {
        titulosNf.set(t.id as string, t as T);
        if (p.tipo === "nfse" && t.agrupador) {
          const { data: irmaos } = await sb.from("lancamentos").select("id, status, valor, data_vencimento").eq("agrupador", t.agrupador).neq("status", "cancelado");
          for (const x of (irmaos ?? []) as T[]) titulosNf.set(x.id, x);
        }
      }
    }
    titulosNf.delete(p.titulo_id);

    const motivo = motivoSubstituirPorNf({
      titulo, pagamentosFilhos: (filhos ?? []).map(f => Number(f.valor_pago ?? 0)), statusNf: nota.status,
      mesmoCliente: !!contaDe.get(titulo.fazenda_id) && contaDe.get(titulo.fazenda_id) === contaDe.get(nota.fazenda_id),
      titulosDaNf: titulosNf.size,
    });
    if (motivo) return NextResponse.json({ ok: false, error: motivo }, { status: 422 });

    const numero = String(nota.numero ?? nota.numero_nf ?? "");
    const { data: upd, error } = await sb.from("lancamentos")
      .update({ status: "cancelado", observacao: observacaoSubstituido(titulo.observacao, p.tipo, numero) })
      .eq("id", p.titulo_id).eq("valor_pago", titulo.valor_pago ?? 0).is("lote_id", null).select("id");
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
    if (!upd?.length) return NextResponse.json({ ok: false, error: "O título mudou enquanto a NF era processada (pagamento ou borderô). Confira no CP." }, { status: 409 });
    if (filhos?.length) await sb.from("lancamentos").update({ status: "cancelado" }).in("id", filhos.map(f => f.id as string));

    const titulos = [...titulosNf.values()].sort((a, b) => String(a.data_vencimento ?? "").localeCompare(String(b.data_vencimento ?? "")));
    return NextResponse.json({ ok: true, numero, titulos });
  } catch (e: unknown) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "Erro ao trocar o título pelo da NF." }, { status: 500 });
  }
}
