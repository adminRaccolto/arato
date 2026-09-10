import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { validateFazendaAccess } from "../../../lib/api-auth";

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

// GET /api/cert-meta?fazenda_id=xxx           → certificados de uma fazenda
// GET /api/cert-meta?fazenda_ids=xxx,yyy,zzz   → certificados de todas as fazendas informadas
//     (o certificado é do CPF/CNPJ do produtor, não de uma propriedade — a tela deve
//      passar todas as fazendas da conta para não "perder" o certificado ao trocar de fazenda)
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const fazendaId  = searchParams.get("fazenda_id");
  const fazendaIds = searchParams.get("fazenda_ids")?.split(",").filter(Boolean) ?? [];
  const ids = fazendaIds.length > 0 ? fazendaIds : (fazendaId ? [fazendaId] : []);
  if (ids.length === 0) return NextResponse.json({ error: "fazenda_id ou fazenda_ids obrigatório" }, { status: 400 });

  const acessos = await Promise.all(ids.map(id => validateFazendaAccess(id)));
  const negado = acessos.find(a => !a.ok);
  if (negado && !negado.ok) return NextResponse.json({ error: negado.error }, { status: negado.status });

  const supabase = adminClient();
  const { data, error } = await supabase
    .from("configuracoes_modulo")
    .select("modulo, config")
    .in("fazenda_id", ids)
    .like("modulo", "certificado_a1%");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Retorna array de certificados, deduplicado por produtor (mesmo produtor pode ter
  // certificado salvo sob mais de uma fazenda da mesma conta)
  const byProdutor = new Map<string, { modulo: string } & Record<string, string | null>>();
  (data ?? []).forEach(row => {
    const cfg = row.config as Record<string, string | null>;
    const chave = cfg.produtor_id ?? row.modulo;
    if (!byProdutor.has(chave)) byProdutor.set(chave, { modulo: row.modulo as string, ...cfg });
  });

  return NextResponse.json({ certs: Array.from(byProdutor.values()) });
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

  const access = await validateFazendaAccess(body.fazenda_id);
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });

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
