import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

// GET /api/admin/backups-storage
// Lista TODOS os backups no Storage, incluindo de contas já excluídas
export async function GET(req: Request) {
  const cookieStore = await cookies();
  const supabaseUser = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll() } },
  );
  const { data: { user }, error: authErr } = await supabaseUser.auth.getUser();
  if (authErr || !user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const admin = adminClient();
  const { data: perfil } = await admin.from("perfis").select("role").eq("user_id", user.id).single();
  if (perfil?.role !== "raccotlo") return NextResponse.json({ error: "Acesso restrito" }, { status: 403 });

  // Listar pastas raiz do bucket backups (cada pasta = um fazenda_id)
  const { data: pastas, error: listErr } = await admin.storage.from("backups").list("", {
    limit: 200, sortBy: { column: "name", order: "asc" },
  });

  if (listErr) return NextResponse.json({ error: listErr.message }, { status: 500 });

  // Para cada pasta (fazenda_id), listar os arquivos e pegar metadados do último backup
  const resultado: Array<{
    fazenda_id: string;
    fazenda_nome: string | null;
    conta_id: string | null;
    total_backups: number;
    ultimo_backup: string | null;
    ultimo_arquivo: string | null;
    existe_no_banco: boolean;
  }> = [];

  // Buscar fazendas que ainda existem no banco para cruzamento
  const { data: fazendasDB } = await admin.from("fazendas").select("id, nome, conta_id");
  const fazMap: Record<string, { nome: string; conta_id: string }> = {};
  for (const f of fazendasDB ?? []) fazMap[f.id] = { nome: f.nome, conta_id: f.conta_id };

  for (const pasta of pastas ?? []) {
    const fazendaId = pasta.name;
    const { data: arquivos } = await admin.storage.from("backups").list(fazendaId, {
      limit: 1, sortBy: { column: "created_at", order: "desc" },
    });

    const ultimo = arquivos?.[0] ?? null;
    const existeNoBanco = !!fazMap[fazendaId];

    let fazendaNome: string | null = fazMap[fazendaId]?.nome ?? null;
    let contaId: string | null = fazMap[fazendaId]?.conta_id ?? null;

    // Se não existe no banco, tenta ler metadados do último backup para identificar
    if (!existeNoBanco && ultimo) {
      try {
        const { data: fileData } = await admin.storage
          .from("backups")
          .download(`${fazendaId}/${ultimo.name}`);
        if (fileData) {
          const json = JSON.parse(await fileData.text()) as {
            dados?: { fazendas?: Array<{ nome?: string; conta_id?: string }> };
          };
          const primFaz = json.dados?.fazendas?.[0];
          if (primFaz?.nome) fazendaNome = primFaz.nome;
          if (primFaz?.conta_id) contaId = primFaz.conta_id;
        }
      } catch { /* ignora */ }
    }

    const { data: todos } = await admin.storage.from("backups").list(fazendaId, { limit: 200 });

    resultado.push({
      fazenda_id: fazendaId,
      fazenda_nome: fazendaNome,
      conta_id: contaId,
      total_backups: todos?.length ?? 0,
      ultimo_backup: ultimo?.created_at ?? null,
      ultimo_arquivo: ultimo?.name ?? null,
      existe_no_banco: existeNoBanco,
    });
  }

  // Ordenar: deletadas primeiro (para facilitar recuperação)
  resultado.sort((a, b) => {
    if (a.existe_no_banco !== b.existe_no_banco) return a.existe_no_banco ? 1 : -1;
    return (b.ultimo_backup ?? "").localeCompare(a.ultimo_backup ?? "");
  });

  return NextResponse.json({ backups: resultado });
}
