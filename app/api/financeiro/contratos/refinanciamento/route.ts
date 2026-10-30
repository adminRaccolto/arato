// POST /api/financeiro/contratos/refinanciamento — refinanciamento / consolidação 1→1 ou N→1 (30/10/2026)
//   { acao: "saldo", contrato_origem_id, data? }  → saldo devedor sugerido da origem e quantos títulos serão encerrados
//   { acao: "vincular", contrato_novo_id, contrato_origem_id, saldo_incorporado?, data? }
//     → registra o vínculo, encerra os títulos a pagar da origem (abertos cancelados; parciais baixados no que já foi pago)
//       e marca a origem como Refinanciado. O estado anterior dos títulos fica no vínculo.
//   { acao: "desvincular", id } → devolve os títulos como estavam (os que ninguém mexeu depois) e a origem volta a Ativo.
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "../../../../../lib/supabase-servidor";
import { exigirAcessoRegistro } from "../../../../../lib/api-auth";
import { hojeLocal } from "../../../../../lib/data-local";
import {
  notaRefinanciamento, planejarEncerramento, podeRestaurar, saldoDevedorOrigem,
  type TituloAntes, type TituloOrigem,
} from "../../../../../lib/financeiro/refinanciamento";

const admin = () => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { autoRefreshToken: false, persistSession: false } });
const SECAO = "Aplique a Seção 398 do supabase_migrations.sql (refinanciamento guarda os títulos encerrados).";
const fmtBRL = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

type Sb = ReturnType<typeof admin>;
async function titulosDaOrigem(sb: Sb, contratoId: string): Promise<TituloOrigem[]> {
  const { data, error } = await sb.from("lancamentos")
    .select("id, tipo, status, valor, valor_pago, data_vencimento, descricao, observacao, lote_id")
    .eq("contrato_financeiro_id", contratoId).order("id");
  if (error) throw error;
  return (data ?? []) as TituloOrigem[];
}

export async function POST(req: NextRequest) {
  try {
    const b = await req.json() as { acao: "saldo" | "vincular" | "desvincular"; contrato_novo_id?: string; contrato_origem_id?: string;
      saldo_incorporado?: number | null; data?: string; id?: string };
    const sb = admin();
    const data = b.data || hojeLocal();

    if (b.acao === "desvincular") {
      const negado = await exigirAcessoRegistro(req, "contratos_refinanciamento", b.id);
      if (negado) return negado;
      const { data: v, error: eV } = await sb.from("contratos_refinanciamento").select("*").eq("id", b.id!).maybeSingle();
      if (eV) return NextResponse.json({ ok: false, error: eV.message }, { status: 400 });
      if (!v) return NextResponse.json({ ok: false, error: "Vínculo não encontrado." }, { status: 404 });
      let devolvidos = 0, mantidos = 0;
      for (const antes of (v.titulos_encerrados ?? []) as TituloAntes[]) {
        const { data: atual } = await sb.from("lancamentos").select("status, valor, valor_pago").eq("id", antes.id).maybeSingle();
        if (!atual || !podeRestaurar(atual, antes)) { mantidos++; continue; }
        const { error } = await sb.from("lancamentos").update({ status: antes.status, valor: antes.valor, observacao: antes.observacao }).eq("id", antes.id);
        if (error) throw error;
        devolvidos++;
      }
      await sb.from("contratos_refinanciamento").delete().eq("id", v.id);
      await sb.from("contratos_financeiros").update({ status: "ativo", refinanciado_por_id: null }).eq("id", v.contrato_origem_id);
      return NextResponse.json({ ok: true, devolvidos, mantidos });
    }

    const negado = await exigirAcessoRegistro(req, "contratos_financeiros", b.contrato_origem_id);
    if (negado) return negado;
    const titulos = await titulosDaOrigem(sb, b.contrato_origem_id!);
    const plano = planejarEncerramento(titulos);
    const saldo = saldoDevedorOrigem(titulos, data);

    if (b.acao === "saldo") {
      return NextResponse.json({ ok: true, saldo, cancelar: plano.cancelar.length, encerrar_parcial: plano.encerrarParcial.length, em_bordero: plano.emBordero.length });
    }
    if (b.acao !== "vincular") return NextResponse.json({ ok: false, error: "Ação inválida." }, { status: 400 });

    const negadoNovo = await exigirAcessoRegistro(req, "contratos_financeiros", b.contrato_novo_id);
    if (negadoNovo) return negadoNovo;
    if (b.contrato_novo_id === b.contrato_origem_id) return NextResponse.json({ ok: false, error: "Um contrato não pode refinanciar ele mesmo." }, { status: 400 });
    if (plano.emBordero.length) {
      const v = plano.emBordero.reduce((s, t) => s + (Number(t.valor) || 0) - (Number(t.valor_pago) || 0), 0);
      return NextResponse.json({ ok: false, error: `${plano.emBordero.length} título(s) do contrato de origem (${fmtBRL(v)}) estão em borderô ainda não pago. Confirme ou estorne o borderô antes de refinanciar.` }, { status: 400 });
    }
    const { data: novo } = await sb.from("contratos_financeiros").select("id, fazenda_id, numero_documento, descricao").eq("id", b.contrato_novo_id!).maybeSingle();
    if (!novo) return NextResponse.json({ ok: false, error: "Contrato novo não encontrado." }, { status: 404 });
    const cedula = novo.numero_documento || novo.descricao || novo.id.slice(0, 8);

    const antes: TituloAntes[] = [...plano.cancelar, ...plano.encerrarParcial].map(t => ({ id: t.id, status: t.status, valor: t.valor, valor_pago: t.valor_pago, observacao: t.observacao ?? null }));
    const saldoIncorporado = b.saldo_incorporado != null && b.saldo_incorporado > 0 ? b.saldo_incorporado : saldo;
    const { data: vinculo, error: eIns } = await sb.from("contratos_refinanciamento")
      .insert({ contrato_novo_id: novo.id, contrato_origem_id: b.contrato_origem_id, fazenda_id: novo.fazenda_id, saldo_incorporado: saldoIncorporado, titulos_encerrados: antes })
      .select("*, contrato_origem:contratos_financeiros!contrato_origem_id(*)").single();
    if (eIns) return NextResponse.json({ ok: false, error: eIns.code === "42703" || eIns.code === "PGRST204" ? SECAO : eIns.message }, { status: 400 });

    for (const t of plano.cancelar) {
      const { error } = await sb.from("lancamentos").update({ status: "cancelado", observacao: notaRefinanciamento(t.observacao, cedula) }).eq("id", t.id);
      if (error) throw error;
    }
    for (const t of plano.encerrarParcial) {
      const { error } = await sb.from("lancamentos").update({ status: "baixado", valor: t.valor_pago, observacao: notaRefinanciamento(t.observacao, cedula) }).eq("id", t.id);
      if (error) throw error;
    }
    await sb.from("contratos_financeiros").update({ status: "refinanciado", refinanciado_por_id: novo.id }).eq("id", b.contrato_origem_id!);
    return NextResponse.json({ ok: true, vinculo, cancelados: plano.cancelar.length, parciais: plano.encerrarParcial.length, saldo: saldoIncorporado });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
