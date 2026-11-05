import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { consultarCnpj } from "../../../../lib/cadastros/consultar-cnpj";

export const dynamic = "force-dynamic";

/**
 * GET /api/cadastros/consultar-cnpj?cnpj=00000000000000
 *
 * Busca dados públicos de CNPJ pra auto-preencher o cadastro de Pessoas —
 * roda no servidor (não no navegador) por um motivo concreto, achado real
 * 08/10/2026: o fallback pra ReceitaWS, chamado direto do navegador, sempre
 * falhava silenciosamente (capturado pelo catch) porque a ReceitaWS não
 * manda o header Access-Control-Allow-Origin — o navegador bloqueia a
 * resposta por CORS antes do código conseguir lê-la, mesmo a consulta tendo
 * ido bem no servidor deles (confirmado com curl: BrasilAPI respondendo 503,
 * ReceitaWS respondendo 200 com os dados completos, na mesma hora). Rodar as
 * duas tentativas aqui, servidor-a-servidor, não tem essa restrição.
 */
export async function GET(req: NextRequest) {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll() } },
  );
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const cnpj = (req.nextUrl.searchParams.get("cnpj") ?? "").replace(/\D/g, "");
  if (cnpj.length !== 14) {
    return NextResponse.json({ error: "CNPJ inválido — informe 14 dígitos" }, { status: 400 });
  }

  const r = await consultarCnpj(cnpj);
  if (r.situacao === "ok") return NextResponse.json(r.dados);
  const status = r.situacao === "nao_encontrado" ? 404 : r.situacao === "invalido" ? 400 : 503;
  return NextResponse.json({ error: r.erro }, { status });
}
