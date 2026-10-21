/**
 * POST /api/suporte/conversa   { fazenda_id, titulo? }
 * Cria uma conversa da Olívia no servidor (service_role). Criar direto do navegador dependia da RLS do usuário:
 * para quem não tem conta vinculada no perfil (equipe Raccolto/BPO atendendo um cliente) ou com sessão vencida
 * a criação falhava em silêncio e o botão de enviar parecia "morto".
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "../../../../lib/supabase-servidor";
import { getRequestUser, validateFazendaAccess } from "../../../../lib/api-auth";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const { fazenda_id, titulo } = await req.json() as { fazenda_id?: string; titulo?: string };
    if (!fazenda_id) return NextResponse.json({ ok: false, error: "fazenda_id obrigatório" }, { status: 400 });
    const user = await getRequestUser(req.headers.get("authorization"));
    if (!user) return NextResponse.json({ ok: false, error: "Não autenticado" }, { status: 401 });
    const acesso = await validateFazendaAccess(fazenda_id, req.headers.get("authorization") ?? undefined);
    if (!acesso.ok) return NextResponse.json({ ok: false, error: acesso.error }, { status: acesso.status });
    const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { autoRefreshToken: false, persistSession: false } });
    const { data, error } = await sb.from("suporte_conversas")
      .insert({ fazenda_id, user_id: user.id, titulo: titulo ?? "Nova conversa", updated_at: new Date().toISOString() })
      .select().single();
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, conversa: data });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
