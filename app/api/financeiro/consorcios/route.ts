import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const admin = () =>
  createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

// GET /api/financeiro/consorcios?fazenda_ids=id1,id2
// Retorna consórcios + parcelas usando service_role_key (imune a JWT expirado).
export async function GET(req: NextRequest) {
  try {
    const ids = req.nextUrl.searchParams.get("fazenda_ids")?.split(",").filter(Boolean) ?? [];
    if (ids.length === 0) return NextResponse.json({ consorcios: [], parcelas: [] });

    const sb = admin();
    const { data: cd, error: ce } = await sb
      .from("consorcios")
      .select("*")
      .in("fazenda_id", ids)
      .order("data_inicio", { ascending: false });
    if (ce) return NextResponse.json({ error: ce.message }, { status: 400 });

    const parcelas: unknown[] = [];
    if (cd && cd.length > 0) {
      const { data: pd } = await sb
        .from("parcelas_consorcio")
        .select("*")
        .in("consorcio_id", cd.map((c: { id: string }) => c.id))
        .order("numero_parcela");
      parcelas.push(...(pd ?? []));
    }

    return NextResponse.json({ consorcios: cd ?? [], parcelas });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

// PATCH /api/financeiro/consorcios
// action: "gerar_parcelas" — apaga e regenera parcelas + CPs de um consórcio existente.
// Usa service_role_key — imune a JWT expirado e RLS.
export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json() as {
      consorcio_id: string;
      fazenda_id: string;
      administradora: string;
      numero_cota: string;
      valor_parcela_mensal: number;
      total_parcelas: number;
      parcelas_pagas: number;
      data_inicio: string;
      status: string;
    };

    if (!body.consorcio_id || !body.fazenda_id) {
      return NextResponse.json({ error: "consorcio_id e fazenda_id obrigatórios" }, { status: 400 });
    }

    const sb = admin();

    // Remove parcelas e CPs existentes (não pagas)
    await sb.from("parcelas_consorcio").delete().eq("consorcio_id", body.consorcio_id);
    await sb.from("lancamentos").delete()
      .eq("consorcio_id", body.consorcio_id)
      .neq("status", "pago");

    // OG correta conforme status
    const classif = body.status === "contemplado" ? "2.03.01.007" : "2.03.01.006";
    const { data: ogRow } = await sb
      .from("operacoes_gerenciais")
      .select("id")
      .eq("fazenda_id", body.fazenda_id)
      .eq("classificacao", classif)
      .maybeSingle();
    const ogId: string | null = ogRow?.id ?? null;

    const novasParc: object[] = [];
    const novasCPs: object[] = [];
    const base = new Date(body.data_inicio + "T12:00:00");
    const descBase = `Consórcio ${body.administradora} — Cota ${body.numero_cota}`;

    for (let i = 1; i <= body.total_parcelas; i++) {
      const d = new Date(base);
      d.setMonth(d.getMonth() + i - 1);
      const dataVenc = d.toISOString().split("T")[0];
      const pago = i <= body.parcelas_pagas;

      novasParc.push({
        consorcio_id:    body.consorcio_id,
        numero_parcela:  i,
        data_vencimento: dataVenc,
        data_pagamento:  null,
        valor:           body.valor_parcela_mensal,
        pago,
        tipo_parcela:    "mensalidade",
      });

      if (!pago && body.valor_parcela_mensal > 0) {
        novasCPs.push({
          fazenda_id:        body.fazenda_id,
          tipo:              "pagar",
          descricao:         `${descBase} — Parcela ${i}/${body.total_parcelas}`,
          valor:             body.valor_parcela_mensal,
          data_lancamento:   dataVenc,
          data_vencimento:   dataVenc,
          status:            "aberto",
          consorcio_id:      body.consorcio_id,
          numero_documento:  String(i),
          origem_lancamento: "consorcio",
          ...(ogId ? { operacao_gerencial_id: ogId } : {}),
        });
      }
    }

    if (novasParc.length > 0) {
      await sb.from("parcelas_consorcio").insert(novasParc);
    }
    for (let k = 0; k < novasCPs.length; k += 100) {
      await sb.from("lancamentos").insert(novasCPs.slice(k, k + 100));
    }

    return NextResponse.json({ ok: true, parcelas: novasParc.length, cps: novasCPs.length });
  } catch (e) {
    console.error("[api/financeiro/consorcios PATCH]", e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

// POST /api/financeiro/consorcios
// Se body.id estiver presente → UPDATE; senão → INSERT + gera parcelas e CPs automaticamente.
// Usa service_role_key — imune a JWT expirado e RLS.
export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as {
      id?: string;
      fazenda_id: string;
      administradora: string;
      numero_cota: string;
      grupo?: string;
      tipo_bem: string;
      descricao_bem?: string;
      valor_credito: number;
      valor_parcela_mensal: number;
      total_parcelas: number;
      parcelas_pagas: number;
      data_inicio: string;
      status: string;
      observacao?: string | null;
    };

    if (!body.fazenda_id) {
      return NextResponse.json({ error: "fazenda_id obrigatório" }, { status: 400 });
    }

    const sb = admin();

    if (body.id) {
      // UPDATE — não regenera parcelas (usuário usa botão Gerar Parcelas)
      const { id, ...payload } = body;
      const { error } = await sb.from("consorcios").update(payload).eq("id", id);
      if (error) return NextResponse.json({ error: error.message }, { status: 400 });
      return NextResponse.json({ ok: true, id });
    }

    // INSERT — cria consórcio e gera parcelas + CPs automaticamente
    const { data: novo, error: insErr } = await sb
      .from("consorcios")
      .insert(body)
      .select("id")
      .single();
    if (insErr) return NextResponse.json({ error: insErr.message }, { status: 400 });

    const consorId = novo.id;

    // Busca OG correta para consórcio (não contemplado = 2.03.01.006)
    const { data: ogRow } = await sb
      .from("operacoes_gerenciais")
      .select("id")
      .eq("fazenda_id", body.fazenda_id)
      .eq("classificacao", "2.03.01.006")
      .maybeSingle();
    const ogId: string | null = ogRow?.id ?? null;

    // Gera parcelas e CPs para parcelas futuras
    if (body.total_parcelas > 0 && body.valor_parcela_mensal > 0) {
      const novasParc: object[] = [];
      const novasCPs:  object[] = [];
      const base = new Date(body.data_inicio + "T12:00:00");
      const descBase = `Consórcio ${body.administradora} — Cota ${body.numero_cota}`;

      for (let i = 1; i <= body.total_parcelas; i++) {
        const d = new Date(base);
        d.setMonth(d.getMonth() + i - 1);
        const dataVenc = d.toISOString().split("T")[0];
        const pago = i <= body.parcelas_pagas;

        novasParc.push({
          consorcio_id:   consorId,
          numero_parcela: i,
          data_vencimento: dataVenc,
          data_pagamento:  null,
          valor:           body.valor_parcela_mensal,
          pago,
          tipo_parcela:   "mensalidade",
        });

        if (!pago) {
          novasCPs.push({
            fazenda_id:        body.fazenda_id,
            tipo:              "pagar",
            descricao:         `${descBase} — Parcela ${i}/${body.total_parcelas}`,
            valor:             body.valor_parcela_mensal,
            data_lancamento:   dataVenc,
            data_vencimento:   dataVenc,
            status:            "aberto",
            consorcio_id:      consorId,
            numero_documento:  String(i),
            origem_lancamento: "consorcio",
            ...(ogId ? { operacao_gerencial_id: ogId } : {}),
          });
        }
      }

      if (novasParc.length > 0) {
        await sb.from("parcelas_consorcio").insert(novasParc);
      }
      for (let k = 0; k < novasCPs.length; k += 100) {
        await sb.from("lancamentos").insert(novasCPs.slice(k, k + 100));
      }
    }

    return NextResponse.json({ ok: true, id: consorId });
  } catch (e) {
    console.error("[api/financeiro/consorcios]", e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
