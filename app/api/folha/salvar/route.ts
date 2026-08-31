import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// Usa service_role_key para contornar JWT expirado / RLS em folha_pagamento.
// Valida o token do usuário antes de executar qualquer operação.
export async function POST(req: Request) {
  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!token) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  // Valida o token do usuário
  const { data: { user }, error: authErr } = await sb.auth.getUser(token);
  if (authErr || !user) return NextResponse.json({ error: "Token inválido" }, { status: 401 });

  try {
    const body = await req.json();
    const { operacao, ...payload } = body as { operacao: "upsert_folha" | "delete_funcionarios" | "insert_funcionarios" | "update_folha" | "fechar_folha" | "delete_folha" } & Record<string, unknown>;

    if (operacao === "upsert_folha") {
      // Busca folha existente
      const { fazenda_id, empresa_id, competencia, ...dados } = payload as {
        fazenda_id: string; empresa_id: string | null; competencia: string;
        valor_bruto: number; valor_liquido: number; inss_patronal: number; fgts_total: number; obs?: string;
      };
      let q = sb.from("folha_pagamento").select("id").eq("fazenda_id", fazenda_id).eq("competencia", competencia);
      if (empresa_id) q = q.eq("empresa_id", empresa_id); else q = q.is("empresa_id", null);
      const { data: exist } = await q.maybeSingle();

      if (exist?.id) {
        const { error } = await sb.from("folha_pagamento").update(dados).eq("id", exist.id);
        if (error) throw error;
        return NextResponse.json({ ok: true, id: exist.id, criou: false });
      } else {
        const { data, error } = await sb.from("folha_pagamento")
          .insert({ fazenda_id, empresa_id: empresa_id ?? null, competencia, status: "rascunho", ...dados })
          .select("id").single();
        if (error) throw error;
        return NextResponse.json({ ok: true, id: data.id, criou: true });
      }
    }

    if (operacao === "update_folha") {
      const { id, ...dados } = payload as { id: string } & Record<string, unknown>;
      const { error } = await sb.from("folha_pagamento").update(dados).eq("id", id);
      if (error) throw error;
      return NextResponse.json({ ok: true });
    }

    if (operacao === "delete_funcionarios") {
      const { folha_id } = payload as { folha_id: string };
      const { error } = await sb.from("folha_funcionarios").delete().eq("folha_id", folha_id);
      if (error) throw error;
      return NextResponse.json({ ok: true });
    }

    if (operacao === "insert_funcionarios") {
      const { rows } = payload as { rows: unknown[] };
      if (rows.length) {
        const { error } = await sb.from("folha_funcionarios").insert(rows);
        if (error) throw error;
      }
      return NextResponse.json({ ok: true });
    }

    if (operacao === "fechar_folha") {
      const { id } = payload as { id: string };
      const { error } = await sb.from("folha_pagamento").update({ status: "fechado" }).eq("id", id);
      if (error) throw error;
      return NextResponse.json({ ok: true });
    }

    if (operacao === "delete_folha") {
      const { id } = payload as { id: string };
      await sb.from("folha_funcionarios").delete().eq("folha_id", id);
      const { error } = await sb.from("folha_pagamento").delete().eq("id", id);
      if (error) throw error;
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: "operacao inválida" }, { status: 400 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : JSON.stringify(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
