/**
 * POST /api/campo/abastecimento-acao
 * Cria ou edita um abastecimento com service_role_key — imune a JWT expirado
 * e RLS (mesmo padrão de app/api/insumos e app/api/campo/transferencia-acao).
 * Achado real 23/09/2026: "new row violates row-level security policy for
 * table 'abastecimentos'" mesmo com a policy correta — sintoma clássico de
 * JWT expirado na sessão do navegador, não de policy errada.
 *
 * Faz TODAS as escritas relacionadas num só lugar: abastecimentos, baixa de
 * estoque na bomba (só bombas internas), baixa no insumo de combustível
 * correspondente + movimentação de estoque, e Conta a Pagar opcional.
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { validateFazendaAccess } from "../../../../lib/api-auth";

const sb = () =>
  createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );

type BombaRow = {
  id: string; fazenda_id: string; nome: string; combustivel: string;
  consume_estoque: boolean; estoque_atual_l: number;
};

async function resolverOgCombustivel(adm: ReturnType<typeof sb>, fazendaId: string): Promise<string | undefined> {
  const { data: faz } = await adm.from("fazendas").select("conta_id").eq("id", fazendaId).maybeSingle();
  const contaId = (faz?.conta_id as string | null) ?? null;
  const orParts = ["and(fazenda_id.is.null,conta_id.is.null)"];
  if (contaId) orParts.push(`conta_id.eq.${contaId}`);
  orParts.push(`fazenda_id.eq.${fazendaId}`);
  const { data } = await adm.from("operacoes_gerenciais")
    .select("id")
    .or(orParts.join(","))
    .eq("classificacao", "2.01.01.02.099")
    .eq("inativo", false)
    .limit(1)
    .maybeSingle();
  return (data?.id as string | undefined) ?? undefined;
}

function insumoDaBomba(insumos: Array<{ id: string; nome: string; fazenda_id?: string; estoque: number }>, bomba: BombaRow) {
  const combTxt = bomba.combustivel.replace("_", " ").toLowerCase();
  return insumos.find(i => {
    if (bomba.fazenda_id && i.fazenda_id && i.fazenda_id !== bomba.fazenda_id) return false;
    const nomeTxt = i.nome.toLowerCase();
    return nomeTxt.includes(combTxt) || bomba.combustivel.includes(nomeTxt.split(" ")[0]);
  });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as {
      acao: "criar" | "editar";
      fazenda_id: string;
      abastecimento_id?: string;   // obrigatório em "editar"
      bomba_id: string;
      destino_tipo: "maquina" | "funcionario" | "livre";
      maquina_id?: string | null;
      funcionario_id?: string | null;
      destino_livre?: string | null;
      destino_nome?: string;       // pro texto do lançamento CP / movimentação
      quantidade_l: number;
      valor_unitario: number;
      data: string;
      horimetro?: number | null;
      ano_safra_id?: string | null;
      ciclo_id?: string | null;
      observacao?: string | null;
      gerar_cp?: boolean;
      vencimento?: string;
      comb_label?: string;
    };

    if (!body.fazenda_id || !body.bomba_id || !body.quantidade_l || !body.data) {
      return NextResponse.json({ erro: "Campos obrigatórios ausentes" }, { status: 400 });
    }
    if (body.acao === "editar" && !body.abastecimento_id) {
      return NextResponse.json({ erro: "abastecimento_id obrigatório pra editar" }, { status: 400 });
    }

    const acesso = await validateFazendaAccess(body.fazenda_id, req.headers.get("authorization") ?? undefined);
    if (!acesso.ok) return NextResponse.json({ erro: acesso.error }, { status: acesso.status });

    const adm = sb();

    const { data: bomba, error: bombaErr } = await adm
      .from("bombas_combustivel").select("*").eq("id", body.bomba_id).single();
    if (bombaErr || !bomba) return NextResponse.json({ erro: "Bomba não encontrada" }, { status: 404 });

    const fazBomba = (bomba.fazenda_id as string) || body.fazenda_id;
    const total = body.quantidade_l * body.valor_unitario;
    const horimetroVal = body.horimetro ?? null;

    const basePayload = {
      maquina_id:     body.destino_tipo === "maquina"     ? body.maquina_id     || null : null,
      funcionario_id: body.destino_tipo === "funcionario" ? body.funcionario_id || null : null,
      destino_livre:  body.destino_tipo === "livre"       ? body.destino_livre  || null : null,
      quantidade_l:   body.quantidade_l,
      valor_unitario: body.valor_unitario,
      valor_total:    total,
      data:           body.data,
      horimetro:      horimetroVal,
      ano_safra_id:   body.ano_safra_id || null,
      ciclo_id:       body.ciclo_id || null,
      observacao:     body.observacao || null,
    };

    // ── EDITAR ──────────────────────────────────────────────────────────────
    if (body.acao === "editar") {
      const { data: atual, error: atualErr } = await adm
        .from("abastecimentos").select("id, bomba_id, quantidade_l, valor_total, lancamento_id")
        .eq("id", body.abastecimento_id).single();
      if (atualErr || !atual) return NextResponse.json({ erro: "Abastecimento não encontrado" }, { status: 404 });

      const { error: updErr } = await adm.from("abastecimentos").update(basePayload).eq("id", atual.id);
      if (updErr) return NextResponse.json({ erro: updErr.message }, { status: 400 });

      const deltaLitros = body.quantidade_l - Number(atual.quantidade_l ?? 0);
      if (deltaLitros !== 0) {
        const novoEstoqueBomba = Number(bomba.estoque_atual_l ?? 0) - deltaLitros;
        await adm.from("bombas_combustivel").update({ estoque_atual_l: novoEstoqueBomba }).eq("id", atual.bomba_id);
      }

      if (atual.lancamento_id) {
        await adm.from("lancamentos").update({ valor: total, data_lancamento: body.data }).eq("id", atual.lancamento_id);
      }

      return NextResponse.json({ ok: true, id: atual.id });
    }

    // ── CRIAR ────────────────────────────────────────────────────────────────
    if (bomba.consume_estoque && body.quantidade_l > Number(bomba.estoque_atual_l ?? 0)) {
      return NextResponse.json({ erro: `Estoque insuficiente na bomba. Disponível: ${Number(bomba.estoque_atual_l ?? 0)} L` }, { status: 422 });
    }

    const { data: novo, error: insErr } = await adm.from("abastecimentos").insert({
      fazenda_id: fazBomba,
      bomba_id:   body.bomba_id,
      ...basePayload,
      lancamento_id: null,
    }).select("id").single();
    if (insErr || !novo) return NextResponse.json({ erro: insErr?.message ?? "Erro ao criar abastecimento" }, { status: 400 });

    // Bomba interna: baixa estoque da bomba + do insumo de combustível correspondente
    if (bomba.consume_estoque) {
      await adm.from("bombas_combustivel")
        .update({ estoque_atual_l: Number(bomba.estoque_atual_l ?? 0) - body.quantidade_l })
        .eq("id", body.bomba_id);

      const { data: insumosFaz } = await adm
        .from("insumos").select("id, nome, fazenda_id, estoque")
        .eq("categoria", "combustivel").eq("fazenda_id", fazBomba);
      const insumo = insumoDaBomba((insumosFaz ?? []) as Array<{ id: string; nome: string; fazenda_id?: string; estoque: number }>, bomba as BombaRow);
      if (insumo) {
        const novoEstoque = Math.max(0, Number(insumo.estoque ?? 0) - body.quantidade_l);
        await adm.from("insumos").update({ estoque: novoEstoque }).eq("id", insumo.id);
        await adm.from("movimentacoes_estoque").insert({
          fazenda_id:     fazBomba,
          insumo_id:      insumo.id,
          tipo:           "saida",
          motivo:         "abastecimento",
          quantidade:     body.quantidade_l,
          valor_unitario: body.valor_unitario,
          data:           body.data,
          auto:           false,
          observacao:     `Abastecimento — ${body.destino_nome ?? "—"}${body.observacao ? " · " + body.observacao : ""}`.trim(),
        });
      }
    }

    // Conta a Pagar opcional
    if (body.gerar_cp) {
      const ogCombustivel = await resolverOgCombustivel(adm, fazBomba);
      const { data: lanc, error: lancErr } = await adm.from("lancamentos").insert({
        fazenda_id:            fazBomba,
        tipo:                  "pagar",
        descricao:             `Abastecimento ${body.comb_label ?? bomba.combustivel} — ${body.destino_nome ?? "—"}`,
        categoria:             "combustivel",
        operacao_gerencial_id: ogCombustivel ?? null,
        origem_lancamento:     "manual",
        data_lancamento:       body.data,
        data_vencimento:       body.vencimento || body.data,
        valor:                 total,
        moeda:                 "BRL",
        status:                "em_aberto",
        auto:                  false,
      }).select("id").single();
      if (!lancErr && lanc) {
        await adm.from("abastecimentos").update({ lancamento_id: lanc.id }).eq("id", novo.id);
      }
    }

    return NextResponse.json({ ok: true, id: novo.id });
  } catch (e) {
    return NextResponse.json({ erro: String(e) }, { status: 500 });
  }
}
