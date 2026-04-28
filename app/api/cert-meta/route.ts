import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

// GET /api/cert-meta?fazenda_id=xxx
// Retorna todos os certificados da fazenda (um por produtor)
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const fazendaId = searchParams.get("fazenda_id");
  if (!fazendaId) return NextResponse.json({ error: "fazenda_id obrigatório" }, { status: 400 });

  const supabase = adminClient();
  const { data, error } = await supabase
    .from("configuracoes_modulo")
    .select("modulo, config")
    .eq("fazenda_id", fazendaId)
    .like("modulo", "certificado_a1%");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Retorna array de certificados
  const certs = (data ?? []).map(row => ({
    modulo: row.modulo as string,
    ...(row.config as Record<string, string | null>),
  }));

  return NextResponse.json({ certs });
}

// POST /api/cert-meta — salva metadados sem arquivo (atualização direta)
export async function POST(req: Request) {
  const body = await req.json() as {
    fazenda_id: string;
    produtor_id?: string | null;
    arquivo_nome: string;
    storage_path: string;
    produtor_nome: string;
    cpf_cnpj: string;
    data_vencimento?: string | null;
  };

  if (!body.fazenda_id) return NextResponse.json({ error: "fazenda_id obrigatório" }, { status: 400 });

  const supabase = adminClient();
  const modulo = `certificado_a1_${body.produtor_id ?? "geral"}`;

  const { error } = await supabase
    .from("configuracoes_modulo")
    .upsert(
      {
        fazenda_id: body.fazenda_id,
        modulo,
        config: {
          arquivo_nome:    body.arquivo_nome,
          storage_path:    body.storage_path,
          produtor_id:     body.produtor_id    ?? null,
          produtor_nome:   body.produtor_nome,
          cpf_cnpj:        body.cpf_cnpj,
          data_vencimento: body.data_vencimento ?? null,
        },
      },
      { onConflict: "fazenda_id,modulo" }
    );

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
