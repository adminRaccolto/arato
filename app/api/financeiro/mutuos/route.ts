// POST /api/financeiro/mutuos — Lançamento de Mútuo (Tesouraria), 31/10/2026
//   { acao: "listar", fazenda_id }                      → mútuos do cliente com as devoluções
//   { acao: "criar", fazenda_id, credor, devedor, valor, data, vencimento?, taxa_mensal?, conta_credor?, conta_devedor?, observacao? }
//     credor/devedor = { tipo: "produtor" | "empresa" | "pessoa", id, nome }. Para cada lado do cliente (produtor ou empresa)
//     nasce o título já pago: saída de quem empresta, entrada de quem recebe — cada um na sua conta bancária.
//   { acao: "devolver", mutuo_id, valor, data, conta_devedor?, conta_credor?, observacao? }
//     encontro de contas: saída de quem devolve e entrada de quem recebe, abate o saldo e quita o mútuo quando zera.
//   { acao: "desfazer_devolucao", pagamento_id } · { acao: "excluir", mutuo_id }  (só sem conciliação/borderô)
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "../../../../lib/supabase-servidor";
import { exigirAcessoFazenda } from "../../../../lib/api-auth";

const admin = () => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { autoRefreshToken: false, persistSession: false } });
type Sb = ReturnType<typeof admin>;
type Parte = { tipo: "produtor" | "empresa" | "pessoa"; id: string; nome: string };
type Ref = { tabela: "lancamentos" | "empresa_lancamentos"; id: string };
const r2 = (n: number) => Math.round(n * 100) / 100;
const interna = (p: Parte) => p.tipo === "produtor" || p.tipo === "empresa";

/** Título já pago de um lado do cliente (produtor → lancamentos; empresa → empresa_lancamentos). */
async function tituloPago(sb: Sb, lado: Parte, outro: Parte, o: { fazenda_id: string; tipo: "pagar" | "receber"; valor: number; data: string; conta: string; descricao: string; observacao?: string | null }): Promise<Ref> {
  const pessoa_id = outro.tipo === "pessoa" ? outro.id : null;
  if (lado.tipo === "produtor") {
    const { data, error } = await sb.from("lancamentos").insert({
      fazenda_id: o.fazenda_id, tipo: o.tipo, moeda: "BRL", descricao: o.descricao, categoria: "Mútuo", valor: o.valor,
      data_lancamento: o.data, data_vencimento: o.data, status: "baixado", data_baixa: o.data, valor_pago: o.valor,
      conta_bancaria: o.conta, auto: false, origem_lancamento: "tesouraria", produtor_id: lado.id, pessoa_id,
      vinculo_atividade: "nao_tributavel", observacao: o.observacao || null,
    }).select("id").single();
    if (error) throw new Error(`Título do produtor: ${error.message}`);
    return { tabela: "lancamentos", id: data.id };
  }
  const { data: emp } = await sb.from("empresas").select("fazenda_id").eq("id", lado.id).maybeSingle();
  const { data, error } = await sb.from("empresa_lancamentos").insert({
    fazenda_id: emp?.fazenda_id ?? o.fazenda_id, empresa_id: lado.id, tipo: o.tipo, moeda: "BRL", descricao: o.descricao,
    categoria: "Mútuo", valor: o.valor, data_vencimento: o.data, competencia: o.data.slice(0, 7), status: "pago",
    data_pagamento: o.data, valor_pago: o.valor, conta_bancaria: o.conta, origem: "tesouraria", pessoa_id, observacao: o.observacao || null,
  }).select("id").single();
  if (error) throw new Error(`Título da empresa: ${error.message}`);
  return { tabela: "empresa_lancamentos", id: data.id };
}

/** Apaga títulos do mútuo/devolução — recusa se algum estiver conciliado ou em borderô. */
async function apagarTitulos(sb: Sb, refs: Ref[]) {
  for (const r of refs) {
    const { data } = await sb.from(r.tabela).select("conciliado, lote_id").eq("id", r.id).maybeSingle();
    if (data?.conciliado || data?.lote_id) throw new Error("Há título deste mútuo conciliado com o extrato ou em borderô: desfaça a conciliação antes.");
  }
  for (const r of refs) { const { error } = await sb.from(r.tabela).delete().eq("id", r.id); if (error) throw error; }
}

export async function POST(req: NextRequest) {
  try {
    const b = await req.json() as Record<string, unknown> & { acao: string; fazenda_id?: string };
    const sb = admin();

    if (b.acao === "desfazer_devolucao" || b.acao === "excluir") {
      const pag = b.acao === "desfazer_devolucao" ? (await sb.from("pagamentos_mutuo").select("*").eq("id", String(b.pagamento_id)).maybeSingle()).data : null;
      const mutuoId = pag ? pag.mutuo_id : String(b.mutuo_id);
      const { data: m } = await sb.from("mutuos").select("*").eq("id", mutuoId).maybeSingle();
      if (!m) return NextResponse.json({ ok: false, error: "Mútuo não encontrado." }, { status: 404 });
      const negado = await exigirAcessoFazenda(req, m.fazenda_id);
      if (negado) return negado;
      if (pag) {
        await apagarTitulos(sb, (pag.lancamentos ?? []) as Ref[]);
        await sb.from("pagamentos_mutuo").delete().eq("id", pag.id);
        const saldo = r2(Number(m.saldo_devedor) + Number(pag.valor_principal));
        await sb.from("mutuos").update({ saldo_devedor: saldo, status: "ativo" }).eq("id", m.id);
        return NextResponse.json({ ok: true });
      }
      const { count } = await sb.from("pagamentos_mutuo").select("id", { count: "exact", head: true }).eq("mutuo_id", m.id);
      if (count) return NextResponse.json({ ok: false, error: "Este mútuo tem devolução lançada: desfaça as devoluções antes de excluir." }, { status: 409 });
      await apagarTitulos(sb, (m.lancamentos ?? []) as Ref[]);
      await sb.from("mutuos").delete().eq("id", m.id);
      return NextResponse.json({ ok: true });
    }

    if (b.acao === "devolver") {
      const { data: m } = await sb.from("mutuos").select("*").eq("id", String(b.mutuo_id)).maybeSingle();
      if (!m) return NextResponse.json({ ok: false, error: "Mútuo não encontrado." }, { status: 404 });
      const negado = await exigirAcessoFazenda(req, m.fazenda_id);
      if (negado) return negado;
      const valor = r2(Number(b.valor) || 0), data = String(b.data || "");
      if (valor <= 0 || !data) return NextResponse.json({ ok: false, error: "Informe valor e data da devolução." }, { status: 400 });
      if (valor > Number(m.saldo_devedor) + 0.009) return NextResponse.json({ ok: false, error: `Valor maior que o saldo do mútuo (R$ ${Number(m.saldo_devedor).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}).` }, { status: 400 });
      const credor: Parte = { tipo: m.credor_tipo, id: m.credor_id, nome: m.credor_nome };
      const devedor: Parte = { tipo: m.devedor_tipo, id: m.devedor_id, nome: m.devedor_nome };
      if (interna(devedor) && !b.conta_devedor) return NextResponse.json({ ok: false, error: `Escolha a conta de onde ${devedor.nome} paga a devolução.` }, { status: 400 });
      if (interna(credor) && !b.conta_credor) return NextResponse.json({ ok: false, error: `Escolha a conta em que ${credor.nome} recebe a devolução.` }, { status: 400 });
      const refs: Ref[] = [];
      try {
        if (interna(devedor)) refs.push(await tituloPago(sb, devedor, credor, { fazenda_id: m.fazenda_id, tipo: "pagar", valor, data, conta: String(b.conta_devedor), descricao: `Devolução de mútuo a ${credor.nome}`, observacao: b.observacao as string }));
        if (interna(credor)) refs.push(await tituloPago(sb, credor, devedor, { fazenda_id: m.fazenda_id, tipo: "receber", valor, data, conta: String(b.conta_credor), descricao: `Devolução de mútuo de ${devedor.nome}`, observacao: b.observacao as string }));
      } catch (e) { await apagarTitulos(sb, refs).catch(() => {}); throw e; }
      const { error: eP } = await sb.from("pagamentos_mutuo").insert({ mutuo_id: m.id, data_pagamento: data, valor_principal: valor, valor_juros: 0, valor_total: valor, observacao: (b.observacao as string) || null, lancamentos: refs });
      if (eP) { await apagarTitulos(sb, refs).catch(() => {}); throw eP; }
      const saldo = r2(Number(m.saldo_devedor) - valor);
      await sb.from("mutuos").update({ saldo_devedor: saldo, status: saldo <= 0.009 ? "quitado" : "ativo" }).eq("id", m.id);
      return NextResponse.json({ ok: true, saldo, quitado: saldo <= 0.009 });
    }

    const negado = await exigirAcessoFazenda(req, b.fazenda_id);
    if (negado) return negado;
    const { data: fz } = await sb.from("fazendas").select("conta_id").eq("id", b.fazenda_id!).maybeSingle();
    const contaId = fz?.conta_id as string | undefined;
    if (!contaId) return NextResponse.json({ ok: false, error: "Cliente da fazenda não encontrado." }, { status: 400 });

    if (b.acao === "listar") {
      const { data: ms, error } = await sb.from("mutuos").select("*").eq("conta_id", contaId).order("data_inicio", { ascending: false });
      if (error) return NextResponse.json({ ok: false, error: error.code === "42703" ? "Aplique a Seção 402 do supabase_migrations.sql." : error.message }, { status: 400 });
      const ids = (ms ?? []).map(m => m.id);
      const { data: pg } = ids.length ? await sb.from("pagamentos_mutuo").select("*").in("mutuo_id", ids).order("data_pagamento") : { data: [] };
      return NextResponse.json({ ok: true, mutuos: ms ?? [], pagamentos: pg ?? [] });
    }

    if (b.acao !== "criar") return NextResponse.json({ ok: false, error: "Ação inválida." }, { status: 400 });
    const credor = b.credor as Parte, devedor = b.devedor as Parte;
    const valor = r2(Number(b.valor) || 0), data = String(b.data || "");
    if (!credor?.id || !devedor?.id) return NextResponse.json({ ok: false, error: "Escolha quem empresta e quem recebe." }, { status: 400 });
    if (credor.tipo === devedor.tipo && credor.id === devedor.id) return NextResponse.json({ ok: false, error: "Quem empresta e quem recebe não podem ser o mesmo." }, { status: 400 });
    if (!interna(credor) && !interna(devedor)) return NextResponse.json({ ok: false, error: "Um dos lados precisa ser produtor ou empresa do cliente." }, { status: 400 });
    if (valor <= 0 || !data) return NextResponse.json({ ok: false, error: "Informe valor e data." }, { status: 400 });
    if (interna(credor) && !b.conta_credor) return NextResponse.json({ ok: false, error: `Escolha a conta de onde sai o dinheiro de ${credor.nome}.` }, { status: 400 });
    if (interna(devedor) && !b.conta_devedor) return NextResponse.json({ ok: false, error: `Escolha a conta em que ${devedor.nome} recebe o dinheiro.` }, { status: 400 });

    const refs: Ref[] = [];
    try {
      if (interna(credor)) refs.push(await tituloPago(sb, credor, devedor, { fazenda_id: b.fazenda_id!, tipo: "pagar", valor, data, conta: String(b.conta_credor), descricao: `Mútuo concedido a ${devedor.nome}`, observacao: b.observacao as string }));
      if (interna(devedor)) refs.push(await tituloPago(sb, devedor, credor, { fazenda_id: b.fazenda_id!, tipo: "receber", valor, data, conta: String(b.conta_devedor), descricao: `Mútuo recebido de ${credor.nome}`, observacao: b.observacao as string }));
    } catch (e) { await apagarTitulos(sb, refs).catch(() => {}); throw e; }
    const { data: m, error: eM } = await sb.from("mutuos").insert({
      fazenda_id: b.fazenda_id, conta_id: contaId, tipo: interna(credor) ? "concessao" : "captacao", contraparte: `${credor.nome} → ${devedor.nome}`,
      credor_tipo: credor.tipo, credor_id: credor.id, credor_nome: credor.nome, devedor_tipo: devedor.tipo, devedor_id: devedor.id, devedor_nome: devedor.nome,
      valor_principal: valor, taxa_juros_mensal: Number(b.taxa_mensal) || 0, data_inicio: data, data_vencimento: (b.vencimento as string) || null,
      saldo_devedor: valor, status: "ativo", observacao: (b.observacao as string) || null, lancamentos: refs,
    }).select("id").single();
    if (eM) {
      await apagarTitulos(sb, refs).catch(() => {});
      return NextResponse.json({ ok: false, error: eM.code === "42703" || eM.code === "PGRST204" ? "Aplique a Seção 402 do supabase_migrations.sql." : eM.message }, { status: 400 });
    }
    return NextResponse.json({ ok: true, id: m.id });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
