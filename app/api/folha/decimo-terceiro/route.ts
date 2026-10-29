/**
 * POST /api/folha/decimo-terceiro — 13º salário (Seção 386).
 *   lancar:   lança a 1ª ou a 2ª parcela dos funcionários escolhidos como título no Contas a Pagar (no nome do
 *             funcionário, OG 13º Salário FAZ/ADM pela área de trabalho) e grava o controle do ano. Parcela que já tem
 *             título não é lançada de novo.
 *   estornar: apaga o título da parcela (só se ainda não foi pago, conciliado nem posto em borderô) e libera a parcela.
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "../../../../lib/supabase-servidor";
import { exigirAcessoFazendas } from "../../../../lib/api-auth";

export const runtime = "nodejs";
const admin = () => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { autoRefreshToken: false, persistSession: false } });
const erro = (msg: string, status = 400) => NextResponse.json({ ok: false, error: msg }, { status });
const r2 = (n: number) => Math.round(Number(n || 0) * 100) / 100;

type ItemLancar = { funcionario_id: string; avos: number; base: number; bruto: number; inss: number; irrf: number; valor: number };
type Corpo = { acao: "lancar" | "estornar"; ano: number; parcela: 1 | 2; vencimento?: string; itens?: ItemLancar[]; funcionario_id?: string };

/** OG de 13º pela classificação, preferindo a da fazenda e caindo para a de outra fazenda do cliente. */
async function ogDecimo(sb: ReturnType<typeof admin>, fazendaId: string, contaId: string | null, adm: boolean): Promise<string | null> {
  const cls = adm ? "2.01.02.01.03.003" : "2.01.01.10.003";
  const { data: fzs } = contaId ? await sb.from("fazendas").select("id").eq("conta_id", contaId) : { data: [{ id: fazendaId }] };
  const ids = [...new Set([fazendaId, ...(fzs ?? []).map(f => f.id as string)])];
  const { data } = await sb.from("operacoes_gerenciais").select("id, fazenda_id, conta_id")
    .eq("classificacao", cls).eq("inativo", false).or(`fazenda_id.in.(${ids.join(",")}),conta_id.eq.${contaId ?? "00000000-0000-0000-0000-000000000000"},and(fazenda_id.is.null,conta_id.is.null)`).limit(20);
  return ((data ?? []).find(o => o.fazenda_id === fazendaId) ?? (data ?? [])[0])?.id as string ?? null;
}

export async function POST(req: NextRequest) {
  try {
    const b = await req.json() as Corpo;
    if (!b.ano || ![1, 2].includes(b.parcela)) return erro("Informe o ano e a parcela.");
    const sb = admin();
    const campoLanc = b.parcela === 1 ? "parcela1_lancamento_id" : "parcela2_lancamento_id";

    if (b.acao === "estornar") {
      if (!b.funcionario_id) return erro("funcionario_id obrigatório");
      const { data: reg } = await sb.from("decimo_terceiro").select("*").eq("funcionario_id", b.funcionario_id).eq("ano", b.ano).maybeSingle();
      if (!reg) return erro("Controle do 13º não encontrado.", 404);
      const negado = await exigirAcessoFazendas(req, [reg.fazenda_id as string]);
      if (negado) return negado;
      const lancId = reg[campoLanc] as string | null;
      if (b.parcela === 1 && reg.parcela2_lancamento_id) return erro("Estorne a 2ª parcela antes da 1ª (a 2ª desconta o que foi pago na 1ª).");
      if (lancId) {
        const { data: t } = await sb.from("lancamentos").select("id, status, valor_pago, conciliado, lote_id").eq("id", lancId).maybeSingle();
        if (t) {
          if (!["em_aberto", "vencido", "vencendo"].includes(String(t.status)) || Number(t.valor_pago ?? 0) > 0 || t.conciliado || t.lote_id)
            return erro("O título desta parcela já foi pago, conciliado ou está em borderô. Desfaça isso no Contas a Pagar antes de estornar.", 409);
          const { error } = await sb.from("lancamentos").delete().eq("id", t.id);
          if (error) return erro(error.message, 500);
        }
      }
      const { error: eU } = await sb.from("decimo_terceiro").update({ [campoLanc]: null, updated_at: new Date().toISOString() }).eq("id", reg.id);
      if (eU) return erro(eU.message, 500);
      return NextResponse.json({ ok: true });
    }

    if (b.acao !== "lancar") return erro("Ação inválida");
    const itens = (b.itens ?? []).filter(i => i.funcionario_id && r2(i.valor) > 0);
    if (!itens.length) return erro("Nenhum funcionário com valor a lançar.");
    if (!b.vencimento || !/^\d{4}-\d{2}-\d{2}$/.test(b.vencimento)) return erro("Informe o vencimento.");
    const { data: funcs } = await sb.from("funcionarios").select("id, nome, fazenda_id, area_trabalho, produtor_id, empresa_id").in("id", itens.map(i => i.funcionario_id));
    const negado = await exigirAcessoFazendas(req, (funcs ?? []).map(f => f.fazenda_id as string));
    if (negado) return negado;

    const hoje = new Date().toISOString().slice(0, 10);
    const ogCache = new Map<string, string | null>();
    let lancados = 0;
    const avisos: string[] = [];
    for (const it of itens) {
      const f = (funcs ?? []).find(x => x.id === it.funcionario_id);
      if (!f) { avisos.push(`funcionário ${it.funcionario_id} não encontrado`); continue; }
      const contaId = await (async () => { const { data } = await sb.from("fazendas").select("conta_id").eq("id", f.fazenda_id).maybeSingle(); return (data?.conta_id as string | null) ?? null; })();
      const { data: reg } = await sb.from("decimo_terceiro").select("*").eq("funcionario_id", f.id).eq("ano", b.ano).maybeSingle();
      if (reg?.[campoLanc]) {
        const { data: ja } = await sb.from("lancamentos").select("id").eq("id", reg[campoLanc] as string).maybeSingle();
        if (ja) { avisos.push(`${f.nome}: ${b.parcela}ª parcela já lançada`); continue; }
      }
      if (b.parcela === 2 && !reg?.parcela1_lancamento_id && !(Number(reg?.parcela1_valor ?? 0) > 0)) avisos.push(`${f.nome}: 2ª parcela lançada sem a 1ª (o valor já considera o 13º inteiro)`);
      const adm = f.area_trabalho === "administrativo";
      const k = `${f.fazenda_id}|${adm}`;
      if (!ogCache.has(k)) ogCache.set(k, await ogDecimo(sb, f.fazenda_id as string, contaId, adm));
      const { data: lanc, error } = await sb.from("lancamentos").insert({
        fazenda_id: f.fazenda_id, empresa_id: f.empresa_id ?? null, produtor_id: f.produtor_id ?? null, funcionario_id: f.id,
        tipo: "pagar", moeda: "BRL", natureza: "real", status: "em_aberto", auto: true,
        descricao: `13º Salário ${b.parcela}ª parcela ${b.ano} — ${f.nome}`.slice(0, 200), categoria: "Pessoal / 13º Salário",
        valor: r2(it.valor), data_lancamento: hoje, data_vencimento: b.vencimento, origem_lancamento: "folha",
        operacao_gerencial_id: ogCache.get(k), observacao: `13º ${b.ano}: ${it.avos}/12 avos sobre R$ ${r2(it.base).toFixed(2)}${b.parcela === 2 ? ` · INSS R$ ${r2(it.inss).toFixed(2)} · IRRF R$ ${r2(it.irrf).toFixed(2)}` : " · sem descontos"}`,
      }).select("id").single();
      if (error) { avisos.push(`${f.nome}: ${error.message}`); continue; }
      const dados = {
        conta_id: contaId, fazenda_id: f.fazenda_id, funcionario_id: f.id, ano: b.ano, avos: it.avos, base: r2(it.base), bruto: r2(it.bruto),
        inss: r2(it.inss), irrf: r2(it.irrf), updated_at: new Date().toISOString(),
        ...(b.parcela === 1 ? { parcela1_valor: r2(it.valor), parcela1_vencimento: b.vencimento, parcela1_lancamento_id: lanc.id }
          : { parcela2_valor: r2(it.valor), parcela2_vencimento: b.vencimento, parcela2_lancamento_id: lanc.id }),
      };
      const { error: eR } = reg ? await sb.from("decimo_terceiro").update(dados).eq("id", reg.id) : await sb.from("decimo_terceiro").insert(dados);
      if (eR) {
        await sb.from("lancamentos").delete().eq("id", lanc.id);
        avisos.push(`${f.nome}: ${eR.code === "42P01" || eR.code === "PGRST205" ? "rode a Seção 386 do supabase_migrations.sql" : eR.message}`);
        continue;
      }
      lancados++;
    }
    return NextResponse.json({ ok: true, lancados, avisos });
  } catch (e) {
    return erro(e instanceof Error ? e.message : String(e), 500);
  }
}
