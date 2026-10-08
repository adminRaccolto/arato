import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

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

  // 1ª tentativa: BrasilAPI (dados oficiais da Receita, CNAE/porte/IE inclusos)
  try {
    const r = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${cnpj}`);
    if (r.ok) {
      const d = await r.json();
      return NextResponse.json({ fonte: "brasilapi", ...d });
    }
    if (r.status === 404) return NextResponse.json({ error: "CNPJ não encontrado na Receita Federal" }, { status: 404 });
    if (r.status === 400) {
      const corpo = await r.json().catch(() => null) as { message?: string } | null;
      return NextResponse.json({ error: corpo?.message || "CNPJ inválido — confira os dígitos" }, { status: 400 });
    }
    // 429/5xx — tenta a segunda fonte antes de desistir
  } catch { /* segue pro fallback */ }

  // 2ª tentativa: ReceitaWS (campos próprios, reempacotados no formato da BrasilAPI
  // pra o cliente não precisar de dois parsers diferentes)
  try {
    const r2 = await fetch(`https://receitaws.com.br/v1/cnpj/${cnpj}`);
    const d2 = await r2.json().catch(() => null) as Record<string, unknown> | null;
    if (r2.ok && d2 && d2.status !== "ERROR") {
      return NextResponse.json({
        fonte: "receitaws",
        razao_social:        d2.nome,
        logradouro:           d2.logradouro,
        numero:               d2.numero,
        complemento:          d2.complemento,
        bairro:               d2.bairro,
        municipio:            d2.municipio,
        uf:                   d2.uf,
        cep:                  d2.cep,
        email:                d2.email,
        descricao_porte:      d2.porte,
        descricao_situacao_cadastral: d2.situacao,
        cnae_fiscal_descricao: (d2.atividade_principal as { text?: string }[] | undefined)?.[0]?.text,
      });
    }
    if (d2?.status === "ERROR") {
      return NextResponse.json({ error: (d2.message as string) || "CNPJ não encontrado na Receita Federal" }, { status: 404 });
    }
  } catch { /* nenhuma das duas respondeu — cai no erro abaixo */ }

  return NextResponse.json({ error: "Falha ao consultar a Receita Federal — BrasilAPI e ReceitaWS indisponíveis no momento. Tente novamente em instantes." }, { status: 502 });
}
