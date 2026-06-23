import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

export async function POST(req: Request) {
  try {
    // ── 1. Verificar sessão raccotlo ──
    const cookieStore = await cookies();
    const supabaseUser = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { cookies: { getAll: () => cookieStore.getAll() } },
    );
    const { data: { user }, error: authErr } = await supabaseUser.auth.getUser();
    if (authErr || !user) {
      return NextResponse.json({ ok: false, error: "Não autenticado" }, { status: 401 });
    }

    const admin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );

    const { data: perfil } = await admin
      .from("perfis")
      .select("role")
      .eq("user_id", user.id)
      .maybeSingle();

    const isGino = (user.email ?? "").toLowerCase() === "gino@raccolto.com.br";
    if (!isGino && perfil?.role !== "raccotlo" && perfil?.role !== "raccotlo_gestor") {
      return NextResponse.json({ ok: false, error: "Acesso restrito" }, { status: 403 });
    }

    const body = await req.json() as {
      conta_id?: string;
      fazenda_ids?: string[];   // alternativa para clientes sem conta
      acao: "cancelar" | "excluir";
    };

    const { acao } = body;
    if (!acao || !["cancelar", "excluir"].includes(acao)) {
      return NextResponse.json({ ok: false, error: "Parâmetros inválidos" }, { status: 400 });
    }

    // ── 2. Resolver as fazendas do cliente ──
    // Aceita conta_id (clientes com conta) ou fazenda_ids diretos (clientes sem conta)
    let fazendaIds: string[] = [];

    if (body.fazenda_ids && body.fazenda_ids.length > 0) {
      fazendaIds = body.fazenda_ids;
    } else if (body.conta_id) {
      const { data: fazendas } = await admin
        .from("fazendas")
        .select("id")
        .eq("conta_id", body.conta_id);
      fazendaIds = (fazendas ?? []).map((f: { id: string }) => f.id);
    }

    // ── 3. Buscar todos os user_ids vinculados a este cliente ──
    // Procura por conta_id E por fazenda_id (cobre clientes antigos sem conta_id em perfis)
    const perfilQuery = admin.from("perfis").select("user_id");
    let perfilData: { user_id: string }[] = [];

    if (body.conta_id) {
      const { data } = await perfilQuery.eq("conta_id", body.conta_id);
      perfilData = data ?? [];
    }
    // Se não achou por conta_id, tenta por fazenda_id
    if (perfilData.length === 0 && fazendaIds.length > 0) {
      const { data } = await admin.from("perfis").select("user_id").in("fazenda_id", fazendaIds);
      perfilData = data ?? [];
    }

    const userIds: string[] = perfilData.map((p: { user_id: string }) => p.user_id);

    // ── 4. Ação: cancelar ──
    if (acao === "cancelar") {
      await Promise.all(
        userIds.map(uid =>
          admin.auth.admin.updateUserById(uid, { ban_duration: "876600h" })
        )
      );
      if (body.conta_id) {
        await admin
          .from("contas")
          .update({ status: "cancelado", data_vencimento: new Date().toISOString().split("T")[0] })
          .eq("id", body.conta_id);
      }
      // Marca fazendas como sem acesso raccotlo
      if (fazendaIds.length > 0) {
        await admin.from("fazendas").update({ raccolto_acesso: false }).in("id", fazendaIds);
      }
      return NextResponse.json({ ok: true, users_bloqueados: userIds.length });
    }

    // ── 5. Ação: excluir ──
    if (acao === "excluir") {
      // 5a. Deletar auth users
      await Promise.all(userIds.map(uid => admin.auth.admin.deleteUser(uid)));

      // 5b. Deletar dados em cascata por fazenda_id
      const tabelas = [
        "lancamentos", "romaneios", "plantios", "pulverizacoes", "colheitas",
        "correcoes_solo", "adubacoes_base",
        "contratos", "contrato_itens", "cargas_expedicao",
        "estoque_posicao", "movimentacoes_estoque", "estoque_itens",
        "pedidos_compra", "pedidos_compra_itens",
        "nf_entradas", "nf_entrada_itens",
        "arrendamentos", "arrendamento_matriculas", "arrendamento_pagamentos",
        "ciclos", "talhoes", "depositos", "maquinas",
        "produtores", "pessoas",
        "configuracoes_modulo", "regras_rateio",
        "orcamentos", "orcamento_itens",
      ];

      if (fazendaIds.length > 0) {
        for (const tabela of tabelas) {
          try { await admin.from(tabela).delete().in("fazenda_id", fazendaIds); } catch { /* tabela pode não existir */ }
        }
        // Deletar perfis por fazenda_id
        try { await admin.from("perfis").delete().in("fazenda_id", fazendaIds); } catch { /* ignora */ }
        // Deletar as fazendas por último
        await admin.from("fazendas").delete().in("id", fazendaIds);
      }

      // 5c. Deletar perfis por conta_id (se houver)
      if (body.conta_id) {
        try { await admin.from("perfis").delete().eq("conta_id", body.conta_id); } catch { /* ignora */ }
        try { await admin.from("contas").delete().eq("id", body.conta_id); } catch { /* ignora */ }
      }

      return NextResponse.json({ ok: true, excluido: true, users_removidos: userIds.length });
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
