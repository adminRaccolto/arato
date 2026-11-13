import { createServerClient } from "@supabase/ssr";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { COOKIE_ACESSO_MANUTENCAO, PARAM_ACESSO_MANUTENCAO, decidirManutencao, paginaManutencao } from "./lib/manutencao/modo";

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Modo manutenção (ARATO_MANUTENCAO=1): responde antes de qualquer acesso ao banco. Ver lib/manutencao/modo.ts.
  const manutencao = decidirManutencao({
    ativo: process.env.ARATO_MANUTENCAO,
    chave: process.env.ARATO_MANUTENCAO_CHAVE,
    pathname,
    chaveNaUrl: request.nextUrl.searchParams.get(PARAM_ACESSO_MANUTENCAO),
    cookie: request.cookies.get(COOKIE_ACESSO_MANUTENCAO)?.value,
  });
  if (manutencao.tipo === "estatico") return NextResponse.next();
  if (manutencao.tipo === "liberar_acesso") {
    const destino = request.nextUrl.clone();
    destino.searchParams.delete(PARAM_ACESSO_MANUTENCAO);
    const r = NextResponse.redirect(destino);
    r.cookies.set(COOKIE_ACESSO_MANUTENCAO, process.env.ARATO_MANUTENCAO_CHAVE!, { httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: 12 * 60 * 60 });
    return r;
  }
  if (manutencao.tipo === "bloquear_api") {
    return NextResponse.json({ error: "O Arato está em manutenção programada. Tente novamente em instantes." }, { status: 503, headers: { "Retry-After": "600", "Cache-Control": "no-store" } });
  }
  if (manutencao.tipo === "bloquear_pagina") {
    return new NextResponse(paginaManutencao(process.env.ARATO_MANUTENCAO_PREVISAO), { status: 503, headers: { "Content-Type": "text/html; charset=utf-8", "Retry-After": "600", "Cache-Control": "no-store" } });
  }

  // Rotas públicas — passa direto sem verificar sessão
  if (
    pathname.startsWith("/login") ||
    pathname.startsWith("/auth/") ||
    pathname.startsWith("/alterar-senha") ||
    pathname.startsWith("/planos") ||
    pathname.startsWith("/cadastro") ||
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon") ||
    pathname.startsWith("/api/")
  ) {
    return NextResponse.next();
  }

  // Requests de PREFETCH do next/link (header "next-router-prefetch") não são
  // navegação real — o usuário só passa a depender do resultado se de fato
  // clicar. Menus grandes (ex: Financeiro, com ~20 links) disparam uma rajada
  // de prefetches praticamente simultâneos ao abrir o painel; cada um batendo
  // aqui chamava getUser() (que RENOVA o refresh token) em paralelo pro MESMO
  // token. Supabase invalida o refresh token depois do primeiro uso — as
  // chamadas concorrentes restantes recebem "Already Used" e o cliente no
  // navegador (AuthProvider) interpreta isso como sessão inválida e desloga o
  // usuário. Achado real 08/10/2026: reportado como "abrir Financeiro
  // desloga", mas a causa não é módulo/permissão — é essa corrida de refresh
  // token, mais provável de disparar justo no maior menu do sistema. Prefetch
  // não precisa (e não deve) renovar token nem redirecionar — a página real,
  // se o usuário navegar de verdade, passa por aqui de novo sem esse header.
  if (request.headers.get("next-router-prefetch")) {
    return NextResponse.next();
  }

  let response = NextResponse.next({ request });

  // Renova o token Supabase a cada request para manter auth.uid() válido
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return request.cookies.getAll(); },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // getUser() renova o token se próximo do vencimento e atualiza os cookies
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    // Achado real 08/10/2026 (investigado com logs ao vivo em produção): o
    // logout reportado em Financeiro não era causado por código — era o
    // RELÓGIO DO SISTEMA do computador do usuário estar desacertado (o
    // BannerRelogioDessincronizado agora avisa isso proativamente). Ainda
    // assim, mantém esta tolerância como defesa: só força redirect pra
    // /login quando NÃO existe cookie de sessão nenhum (usuário realmente
    // nunca logado); havendo cookie mas getUser() falhando nesse instante
    // (ex: relógio desacertado, ou uma renovação concorrente genuína),
    // deixa passar — o AuthProvider no navegador decide se desloga de verdade.
    const temCookieDeSessao = request.cookies.getAll().some(c => c.name.startsWith("sb-") && c.name.includes("-auth-token"));
    if (!temCookieDeSessao) {
      return NextResponse.redirect(new URL("/login", request.url));
    }
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
