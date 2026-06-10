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
      .single();

    if (perfil?.role !== "raccotlo") {
      return NextResponse.json({ ok: false, error: "Acesso restrito" }, { status: 403 });
    }

    const { conta_id, acao } = await req.json() as { conta_id: string; acao: "cancelar" | "excluir" };
    if (!conta_id || !["cancelar", "excluir"].includes(acao)) {
      return NextResponse.json({ ok: false, error: "Parâmetros inválidos" }, { status: 400 });
    }

    // ── 2. Buscar todos os user_ids vinculados a esta conta ──
    const { data: perfis } = await admin
      .from("perfis")
      .select("user_id")
      .eq("conta_id", conta_id);

    const userIds: string[] = (perfis ?? []).map((p: { user_id: string }) => p.user_id);

    if (acao === "cancelar") {
      // Bloquear cada usuário no Auth (ban permanente = 876600h ≈ 100 anos)
      await Promise.all(
        userIds.map(uid =>
          admin.auth.admin.updateUserById(uid, { ban_duration: "876600h" })
        )
      );
      // Marcar conta como cancelada e vencimento para hoje
      await admin
        .from("contas")
        .update({
          status: "cancelado",
          data_vencimento: new Date().toISOString().split("T")[0],
        })
        .eq("id", conta_id);

      return NextResponse.json({ ok: true, users_bloqueados: userIds.length });
    }

    if (acao === "excluir") {
      // Excluir usuários do Auth primeiro
      await Promise.all(userIds.map(uid => admin.auth.admin.deleteUser(uid)));

      // Excluir dados em cascata (a ordem importa por FKs)
      const tabelas = [
        "lancamentos", "romaneios", "plantios", "pulverizacoes", "colheitas",
        "contratos", "estoque_posicao", "movimentacoes_estoque",
        "pedidos_compra", "nf_entradas", "nf_entrada_itens",
        "ciclos", "talhoes", "produtores", "fazendas",
        "usuarios", "perfis",
      ];
      for (const tabela of tabelas) {
        // Tenta por fazenda_id (maioria) e depois por conta_id
        const { data: fazendas } = await admin
          .from("fazendas")
          .select("id")
          .eq("conta_id", conta_id);
        const fazendaIds = (fazendas ?? []).map((f: { id: string }) => f.id);
        if (fazendaIds.length > 0 && !["usuarios","perfis"].includes(tabela)) {
          await admin.from(tabela).delete().in("fazenda_id", fazendaIds);
        }
      }
      // Remove perfis e conta
      await admin.from("perfis").delete().eq("conta_id", conta_id);
      await admin.from("contas").delete().eq("id", conta_id);

      return NextResponse.json({ ok: true, excluido: true, users_removidos: userIds.length });
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
