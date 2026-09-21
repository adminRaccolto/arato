/**
 * POST /api/financeiro/conciliacao-regras/aplicar
 * Aplica as regras de conciliação às linhas PENDENTES de uma conta bancária: cada linha cujo
 * histórico casa com uma regra vira um lançamento já baixado (O.G., centro de custo e pessoa da
 * regra) e fica conciliada — ou, na regra de transferência, gera as duas pernas.
 *
 * Idempotente e seguro contra concorrência: a linha é "reivindicada" (conciliado=true só se ainda
 * estava false) antes de criar o lançamento; se qualquer passo falhar, o lançamento criado é
 * apagado e a linha volta a pendente.
 */
import { NextRequest, NextResponse } from "next/server";
import { adminSb, resolverTenant, tabelaAusente } from "../../../../../lib/conciliacao-tenant";
import { escolherRegra } from "../../../../../lib/conciliacao-match";

type Regra = {
  id: string; conta_bancaria_id: string | null; texto: string; tipo: "debito" | "credito"; ativa: boolean;
  acao: "lancar" | "transferencia"; operacao_classificacao: string | null; operacao_descricao: string | null;
  centro_custo_id: string | null; pessoa_id: string | null; conta_destino_id: string | null;
};
type Linha = { id: string; fitid: string; data: string; descricao: string; valor: number; tipo: "credito" | "debito" };

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as { conta_bancaria_id?: string; fitids?: string[]; conta_id?: string };
  const t = await resolverTenant(body.conta_id);
  if (!t.ok) return NextResponse.json({ ok: false, error: t.error }, { status: t.status });
  if (!body.conta_bancaria_id) return NextResponse.json({ ok: false, error: "conta_bancaria_id é obrigatório" }, { status: 400 });

  const sb = adminSb();
  const { data: conta } = await sb.from("contas_bancarias").select("id,nome,fazenda_id,produtor_id").eq("id", body.conta_bancaria_id).maybeSingle();
  if (!conta || !t.fazendaIds.includes(conta.fazenda_id as string)) return NextResponse.json({ ok: false, error: "Conta bancária inválida" }, { status: 403 });

  const { data: regrasAll, error: eReg } = await sb.from("conciliacao_regras").select("*").eq("conta_id", t.contaId).eq("ativa", true);
  if (tabelaAusente(eReg)) return NextResponse.json({ ok: true, aplicadas: 0, migracao: false });
  if (eReg) return NextResponse.json({ ok: false, error: eReg.message }, { status: 500 });
  const regras = (regrasAll ?? []) as Regra[];
  if (!regras.length) return NextResponse.json({ ok: true, aplicadas: 0, migracao: true, semRegras: true });

  // Linhas pendentes da conta (paginado)
  const linhas: Linha[] = [];
  for (let de = 0; de < 5000; de += 1000) {
    let q = sb.from("extrato_transacoes").select("id,fitid,data,descricao,valor,tipo")
      .eq("conta_bancaria_id", conta.id).eq("conciliado", false).order("id").range(de, de + 999);
    if (body.fitids?.length) q = q.in("fitid", body.fitids.slice(0, 500));
    const { data, error } = await q;
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    linhas.push(...((data ?? []) as Linha[]));
    if (!data || data.length < 1000) break;
  }

  // O.G. da regra resolvida na fazenda DA CONTA BANCÁRIA (as O.G. existem duplicadas por fazenda)
  const ogCache = new Map<string, { id: string; descricao: string } | null>();
  const resolverOG = async (classificacao: string) => {
    if (ogCache.has(classificacao)) return ogCache.get(classificacao)!;
    const { data } = await sb.from("operacoes_gerenciais").select("id,descricao")
      .eq("fazenda_id", conta.fazenda_id).eq("classificacao", classificacao).eq("inativo", false).limit(1);
    const og = data?.[0] ? { id: data[0].id as string, descricao: data[0].descricao as string } : null;
    ogCache.set(classificacao, og);
    return og;
  };

  const usos = new Map<string, number>();
  const falhas: string[] = [];
  let aplicadas = 0, semOG = 0;
  const fitidsAplicados: string[] = [];

  for (const linha of linhas) {
    const regra = escolherRegra(linha, regras, conta.id);
    if (!regra) continue;

    // 1) reivindica a linha (só se ainda pendente)
    const { data: claim, error: eClaim } = await sb.from("extrato_transacoes")
      .update({ conciliado: true, origem_vinculo: "regra", confianca: "alta", regra_id: regra.id, sugestao_lancamento_id: null, sugestao_motivo: null, updated_at: new Date().toISOString() })
      .eq("id", linha.id).eq("conciliado", false).select("id");
    if (eClaim) { falhas.push(`${linha.fitid}: ${eClaim.message}`); continue; }
    if (!claim?.length) continue; // outra requisição já pegou

    const soltar = () => sb.from("extrato_transacoes")
      .update({ conciliado: false, origem_vinculo: null, confianca: null, regra_id: null, updated_at: new Date().toISOString() }).eq("id", linha.id);

    const valor = Number(linha.valor);
    const base = {
      moeda: "BRL", valor, valor_pago: valor,
      data_lancamento: linha.data, data_vencimento: linha.data, data_baixa: linha.data,
      status: "baixado", auto: false, conciliado: true, origem_lancamento: "tesouraria",
      observacao: `Conciliação automática — regra "${regra.texto}"`,
    };
    const criados: string[] = [];
    let idDaLinha: string | null = null;
    let descLinha = linha.descricao;

    try {
      if (regra.acao === "lancar") {
        const og = regra.operacao_classificacao ? await resolverOG(regra.operacao_classificacao) : null;
        if (!og) { semOG++; await soltar(); continue; }
        const { data: l, error } = await sb.from("lancamentos").insert({
          ...base, fazenda_id: conta.fazenda_id, produtor_id: conta.produtor_id ?? null,
          tipo: linha.tipo === "credito" ? "receber" : "pagar",
          descricao: linha.descricao, categoria: og.descricao, operacao_gerencial_id: og.id,
          conta_bancaria: conta.id, pessoa_id: regra.pessoa_id, centro_custo_id: regra.centro_custo_id,
        }).select("id").single();
        if (error || !l) throw new Error(error?.message ?? "falha ao criar lançamento");
        criados.push(l.id as string); idDaLinha = l.id as string;
      } else {
        if (!regra.conta_destino_id) { await soltar(); continue; }
        const { data: outra } = await sb.from("contas_bancarias").select("id,nome,fazenda_id,produtor_id").eq("id", regra.conta_destino_id).maybeSingle();
        if (!outra || !t.fazendaIds.includes(outra.fazenda_id as string)) { await soltar(); continue; }
        const debito = linha.tipo === "debito";
        const perna = (c: { id: string; fazenda_id: unknown; produtor_id: unknown }, tipo: "pagar" | "receber", desc: string) => ({
          ...base, fazenda_id: c.fazenda_id, produtor_id: c.produtor_id ?? null, tipo, descricao: desc,
          categoria: "Transferência entre Contas", conta_bancaria: c.id,
        });
        const aqui = perna(conta, debito ? "pagar" : "receber", debito ? `Transferência → ${outra.nome}` : `Transferência ← ${outra.nome}`);
        // a perna da OUTRA conta fica não-conciliada: é ela que o extrato da outra conta vai casar
        const la  = { ...perna(outra, debito ? "receber" : "pagar", debito ? `Transferência ← ${conta.nome}` : `Transferência → ${conta.nome}`), conciliado: false };
        const { data: ls, error } = await sb.from("lancamentos").insert([aqui, la]).select("id,conta_bancaria");
        if (error || !ls?.length) throw new Error(error?.message ?? "falha ao criar transferência");
        for (const x of ls) criados.push(x.id as string);
        idDaLinha = (ls.find(x => x.conta_bancaria === conta.id)?.id ?? ls[0].id) as string;
        descLinha = aqui.descricao;
      }

      // 2) fecha o vínculo da linha
      const { error: eLink } = await sb.from("extrato_transacoes").update({
        lancamento_id: idDaLinha, lancamento_ids: [idDaLinha], lancamento_desc: descLinha, lancamento_valor: valor,
        updated_at: new Date().toISOString(),
      }).eq("id", linha.id);
      if (eLink) throw new Error(eLink.message);
      aplicadas++;
      fitidsAplicados.push(linha.fitid);
      usos.set(regra.id, (usos.get(regra.id) ?? 0) + 1);
    } catch (e) {
      // desfaz: apaga o que foi criado e devolve a linha a pendente
      if (criados.length) await sb.from("lancamentos").delete().in("id", criados);
      await soltar();
      falhas.push(`${linha.fitid}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  for (const [id, n] of usos) {
    const { data: r } = await sb.from("conciliacao_regras").select("usos").eq("id", id).maybeSingle();
    await sb.from("conciliacao_regras").update({ usos: ((r?.usos as number) ?? 0) + n }).eq("id", id);
  }

  return NextResponse.json({ ok: true, migracao: true, analisadas: linhas.length, aplicadas, semOG, fitidsAplicados, falhas: falhas.slice(0, 10), nFalhas: falhas.length });
}
