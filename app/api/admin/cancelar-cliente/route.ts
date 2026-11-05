import { hojeLocal } from "../../../../lib/data-local";
import { gzipSync } from "node:zlib";
import { NextResponse } from "next/server";
import { createClient } from "../../../../lib/supabase-servidor";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

export const maxDuration = 300;

const SEM_MIGRACAO = /fn_excluir_cliente|schema cache/i;

// Cópia dos dados do cliente no bucket de backups, feita antes de apagar. Sem cópia, não exclui.
async function guardarBackup(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: any, contaId: string, conta: unknown, tabelas: string[],
): Promise<string> {
  const dados: Record<string, unknown[]> = {};
  for (const tabela of tabelas) {
    dados[tabela] = [];
    for (let inicio = 0; ; inicio += 1000) {
      const { data, error } = await admin.rpc("fn_cliente_exportar", { p_conta: contaId, p_tabela: tabela, p_inicio: inicio, p_limite: 1000 });
      if (error) throw new Error(`Backup de ${tabela}: ${error.message}`);
      const linhas = (data ?? []) as unknown[];
      dados[tabela].push(...linhas);
      if (linhas.length < 1000) break;
    }
  }
  const { data: fazendas } = await admin.from("fazendas").select("*").eq("conta_id", contaId);
  const { data: perfis } = await admin.from("perfis").select("*").eq("conta_id", contaId);
  const arquivo = gzipSync(JSON.stringify({ gerado_em: new Date().toISOString(), conta, fazendas, perfis, dados }));
  const caminho = `exclusoes/${contaId}/${new Date().toISOString().replace(/[:.]/g, "-")}.json.gz`;
  const { error } = await admin.storage.from("backups").upload(caminho, arquivo, { contentType: "application/gzip" });
  if (error) throw new Error(`Backup não foi salvo: ${error.message}`);
  return caminho;
}

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
      acao: "cancelar" | "previa" | "excluir";
      confirmacao?: string;   // nome do cliente digitado, obrigatório para excluir
    };

    const { acao } = body;
    if (!acao || !["cancelar", "previa", "excluir"].includes(acao)) {
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
          .update({ status: "cancelado", data_vencimento: hojeLocal() })
          .eq("id", body.conta_id);
      }
      // Marca fazendas como sem acesso raccotlo
      if (fazendaIds.length > 0) {
        await admin.from("fazendas").update({ raccolto_acesso: false }).in("id", fazendaIds);
      }
      return NextResponse.json({ ok: true, users_bloqueados: userIds.length });
    }

    // ── 5. Prévia e exclusão ──
    // Tudo passa pelo banco (Seção 416): as tabelas vêm do próprio esquema, tudo roda numa transação e, se sobrar
    // qualquer linha, nada é apagado. Os logins só são removidos depois que os dados saíram.
    if (!body.conta_id) {
      return NextResponse.json({ ok: false, error: "Escolha o cliente." }, { status: 400 });
    }
    const { data: conta } = await admin.from("contas").select("*").eq("id", body.conta_id).maybeSingle();
    if (!conta) return NextResponse.json({ ok: false, error: "Cliente não encontrado." }, { status: 404 });

    const { data: previa, error: ePrevia } = await admin.rpc("fn_excluir_cliente", { p_conta: body.conta_id, p_aplicar: false });
    if (ePrevia) {
      const semMigracao = SEM_MIGRACAO.test(ePrevia.message);
      return NextResponse.json({ ok: false, error: semMigracao ? "Execute a Seção 416 no Supabase para usar a exclusão." : ePrevia.message }, { status: semMigracao ? 503 : 500 });
    }
    const resumo = previa as { tabelas: Record<string, number>; total: number; fazendas: number; usuarios: number };

    if (acao === "previa") return NextResponse.json({ ok: true, status: conta.status, ...resumo });

    if (body.confirmacao !== conta.nome) {
      return NextResponse.json({ ok: false, error: "Nome do cliente não confere." }, { status: 400 });
    }
    // Cliente em uso primeiro é cancelado: evita apagar por engano quem está trabalhando no sistema
    if (!["cancelado", "inativo", "trial"].includes(String(conta.status))) {
      return NextResponse.json({ ok: false, error: "Cancele o acesso deste cliente antes de excluir." }, { status: 409 });
    }

    const backup = await guardarBackup(admin, body.conta_id, conta, Object.keys(resumo.tabelas ?? {}));

    const { data: feito, error: eExcluir } = await admin.rpc("fn_excluir_cliente", { p_conta: body.conta_id, p_aplicar: true });
    if (eExcluir) {
      return NextResponse.json({ ok: false, error: eExcluir.message, backup }, { status: 500 });
    }
    const usuarios = ((feito as { usuarios?: string[] }).usuarios ?? []);
    const falhasLogin: string[] = [];
    for (const uid of usuarios) {
      const { error } = await admin.auth.admin.deleteUser(uid);
      if (error) falhasLogin.push(`${uid}: ${error.message}`);
    }
    return NextResponse.json({ ok: true, excluido: true, users_removidos: usuarios.length - falhasLogin.length, falhas_login: falhasLogin, registros: resumo.total, backup });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
