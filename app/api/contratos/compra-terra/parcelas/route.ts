/**
 * POST /api/contratos/compra-terra/parcelas
 * Cria lançamentos CP + cct_pagamentos com service_role_key (imune a JWT/RLS).
 * Vincula automaticamente a OG "COMPRA DE IMÓVEIS" (2.03.01.001).
 *
 * DELETE /api/contratos/compra-terra/parcelas
 * Remove parcelas e lançamentos de um contrato (usado antes de recriar).
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const admin = () =>
  createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

type ParcelaCCT = {
  num_parcela:      number;
  total_parcelas:   number;
  data_vencimento:  string;
  valor:            number;            // BRL equivalente (para CP)
  moeda_parcela:    string;            // 'BRL' | 'saca_soja' | 'saca_milho' | 'saca_algodao'
  quantidade_sacas?: number | null;    // sacas quando moeda_parcela != 'BRL'
  produto?:          string | null;    // 'soja' | 'milho' | 'algodao'
  preco_sc_ref?:     number | null;    // R$/sc de referência usado na conversão
  ano_safra_id?:     string | null;
  ciclo_id?:         string | null;
};

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as {
      contrato_id:   string;
      fazenda_id:    string;
      imovel_nome:   string;
      produtor_id?:  string | null;
      parcelas:      ParcelaCCT[];
    };

    if (!body.contrato_id || !body.fazenda_id || !body.parcelas?.length) {
      return NextResponse.json({ ok: false, error: "Campos obrigatórios ausentes" }, { status: 400 });
    }

    const sb = admin();
    const TODAY = new Date().toISOString().split("T")[0];

    // Busca OG "COMPRA DE IMÓVEIS" (2.03.01.001) para classificar os lançamentos
    const { data: ogRow } = await sb
      .from("operacoes_gerenciais")
      .select("id")
      .eq("classificacao", "2.03.01.001")
      .maybeSingle();
    const ogId: string | null = ogRow?.id ?? null;

    // Cria lançamentos CP um a um para capturar os IDs retornados
    const lancIds: string[] = [];
    for (const p of body.parcelas) {
      const { data: l, error: lErr } = await sb
        .from("lancamentos")
        .insert({
          fazenda_id:            body.fazenda_id,
          tipo:                  "pagar",
          moeda:                 "BRL",
          descricao:             `Parcela ${p.num_parcela}/${p.total_parcelas} — ${body.imovel_nome}`,
          categoria:             "compra_terra",
          data_lancamento:       TODAY,
          data_vencimento:       p.data_vencimento,
          valor:                 p.valor,
          status:                "em_aberto",
          auto:                  true,
          numero_documento:      body.contrato_id,
          produtor_id:           body.produtor_id ?? null,
          num_parcela:           p.num_parcela,
          total_parcelas:        p.total_parcelas,
          operacao_gerencial_id: ogId,
          ano_safra_id:          p.ano_safra_id ?? null,
          ciclo_id:              p.ciclo_id     ?? null,
          observacao:            p.moeda_parcela !== "BRL"
            ? `Pagamento em grãos: ${p.quantidade_sacas?.toFixed(4)} sc ${p.produto ?? ""} @ R$ ${p.preco_sc_ref?.toFixed(2) ?? "?"}/sc`
            : null,
        })
        .select("id")
        .single();

      if (lErr) {
        console.error("[cct/parcelas] Erro ao criar lançamento:", lErr);
        return NextResponse.json({ ok: false, error: lErr.message }, { status: 400 });
      }
      lancIds.push(l.id);
    }

    // Cria cct_pagamentos vinculados
    const pgRows = body.parcelas.map((p, i) => ({
      contrato_id:       body.contrato_id,
      fazenda_id:        body.fazenda_id,
      data_vencimento:   p.data_vencimento,
      valor:             p.valor,
      status:            "pendente" as const,
      lancamento_id:     lancIds[i],
      moeda_parcela:     p.moeda_parcela,
      quantidade_sacas:  p.quantidade_sacas ?? null,
      produto:           p.produto          ?? null,
      preco_sc_ref:      p.preco_sc_ref     ?? null,
      ano_safra_id:      p.ano_safra_id     ?? null,
      ciclo_id:          p.ciclo_id         ?? null,
    }));

    const { error: pgErr } = await sb.from("cct_pagamentos").insert(pgRows);
    if (pgErr) {
      // Faz rollback manual removendo os lançamentos criados
      await sb.from("lancamentos").delete().in("id", lancIds);
      return NextResponse.json({ ok: false, error: pgErr.message }, { status: 400 });
    }

    return NextResponse.json({ ok: true, lancamentos_criados: lancIds.length });
  } catch (e) {
    console.error("[api/contratos/compra-terra/parcelas POST]", e);
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const body = await req.json() as { contrato_id: string };
    if (!body.contrato_id) return NextResponse.json({ ok: false, error: "contrato_id obrigatório" }, { status: 400 });

    const sb = admin();

    // Busca parcelas vinculadas para remover lançamentos junto
    const { data: parcelas } = await sb
      .from("cct_pagamentos")
      .select("id, lancamento_id")
      .eq("contrato_id", body.contrato_id);

    const lancIds = (parcelas ?? []).map(p => p.lancamento_id).filter(Boolean) as string[];
    if (lancIds.length) await sb.from("lancamentos").delete().in("id", lancIds);

    await sb.from("cct_pagamentos").delete().eq("contrato_id", body.contrato_id);

    return NextResponse.json({ ok: true, removidas: parcelas?.length ?? 0 });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
