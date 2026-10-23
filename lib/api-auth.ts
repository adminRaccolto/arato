import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "./supabase-servidor";
import { cookies } from "next/headers";
import { isRaccotloAdmin } from "./raccotlo-auth";
import { createHash } from "crypto";

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

/**
 * Retorna o user autenticado via cookies da sessão do browser.
 * Retorna null se não autenticado ou sessão inválida.
 */
export async function getSessionUser() {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: () => {},
      },
    },
  );
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

/**
 * Usuário da requisição: token Bearer enviado pelo cliente (renovado no navegador — não expira com a aba
 * ociosa) ou, na falta dele, o cookie de sessão. Retorna null se nenhum for válido.
 */
export async function getRequestUser(authHeader?: string | null) {
  const token = (authHeader ?? "").replace(/^Bearer\s+/i, "").trim();
  if (token) {
    const { data: { user } } = await adminClient().auth.getUser(token);
    if (user) return user;
  }
  return getSessionUser();
}

/**
 * Exige uma sessão de administrador interno para operações globais.
 * Endpoints que administram a instância WhatsApp, por exemplo, não podem ser
 * liberados a clientes somente porque eles possuem uma sessão válida.
 */
export async function requireRaccotloAdmin(): Promise<
  | { ok: true; userId: string }
  | { ok: false; status: 401 | 403; error: string }
> {
  const user = await getSessionUser();
  if (!user) return { ok: false, status: 401, error: "Não autenticado" };

  const { data: perfil } = await adminClient()
    .from("perfis")
    .select("role")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!isRaccotloAdmin(perfil?.role, user.email)) {
    return { ok: false, status: 403, error: "Acesso administrativo restrito" };
  }

  return { ok: true, userId: user.id };
}

/**
 * Valida que o usuário autenticado tem acesso à fazenda solicitada.
 * Raccotlo bypassa a verificação.
 * Retorna { ok: true } ou { ok: false, status: 401|403 }
 */
export async function validateFazendaAccess(
  fazenda_id: string,
  authHeader?: string,
): Promise<{ ok: true; userId: string } | { ok: false; status: number; error: string }> {
  // Tenta obter usuário via Authorization header (Bearer token) ou cookies
  let userId: string | null = null;

  if (authHeader) {
    const token = authHeader.replace("Bearer ", "").trim();
    if (token) {
      const { data: { user } } = await adminClient().auth.getUser(token);
      if (user) { userId = user.id; }
    }
  }

  if (!userId) {
    const user = await getSessionUser();
    if (user) { userId = user.id; }
  }

  if (!userId) return { ok: false, status: 401, error: "Não autenticado" };

  const { data: perfil } = await adminClient()
    .from("perfis")
    .select("conta_id, role")
    .eq("user_id", userId)
    .maybeSingle();

  if (perfil?.role?.startsWith("raccotlo")) return { ok: true, userId };

  if (!perfil?.conta_id) return { ok: false, status: 403, error: "Perfil sem conta vinculada" };

  const { data: fazenda } = await adminClient()
    .from("fazendas")
    .select("conta_id")
    .eq("id", fazenda_id)
    .maybeSingle();

  if (!fazenda || fazenda.conta_id !== perfil.conta_id) {
    return { ok: false, status: 403, error: "Acesso negado a esta fazenda" };
  }

  return { ok: true, userId };
}

// ── Guardas curtas para rotas de API (23/10/2026) ───────────────────────────────────────────────────────────────
// Várias rotas de NF/CT-e/MDF-e aceitavam pedidos sem login. Estas funções devolvem a resposta de erro (401/403/404)
// ou null quando o acesso é permitido. Use a verificação pelo REGISTRO (a NF, o CT-e...) sempre que a rota mexer num
// registro: validar só a fazenda informada no corpo deixaria alguém mandar a própria fazenda com o id de outro cliente.

const auth = (req: Request) => req.headers.get("authorization") ?? undefined;

/** Exige login e acesso à fazenda informada. */
export async function exigirAcessoFazenda(req: Request, fazendaId: string | null | undefined): Promise<NextResponse | null> {
  if (!fazendaId) return NextResponse.json({ ok: false, error: "fazenda_id obrigatório" }, { status: 400 });
  const r = await validateFazendaAccess(fazendaId, auth(req));
  return r.ok ? null : NextResponse.json({ ok: false, error: r.error }, { status: r.status });
}

/** Exige login e acesso à fazenda dona do registro (tabela.id → fazenda_id). */
export async function exigirAcessoRegistro(req: Request, tabela: string, id: string | null | undefined): Promise<NextResponse | null> {
  if (!id) return NextResponse.json({ ok: false, error: "id do registro obrigatório" }, { status: 400 });
  const { data } = await adminClient().from(tabela).select("fazenda_id").eq("id", id).maybeSingle();
  if (!data) {
    // registro inexistente: ainda exige login para não revelar nada a quem não está autenticado
    const u = await getRequestUser(auth(req));
    return u ? NextResponse.json({ ok: false, error: "Registro não encontrado" }, { status: 404 }) : NextResponse.json({ ok: false, error: "Não autenticado" }, { status: 401 });
  }
  return exigirAcessoFazenda(req, (data as { fazenda_id: string }).fazenda_id);
}

/** Exige só estar logado (rotas sem registro nem fazenda definidos). */
export async function exigirLogin(req: Request): Promise<NextResponse | null> {
  const u = await getRequestUser(auth(req));
  return u ? null : NextResponse.json({ ok: false, error: "Não autenticado" }, { status: 401 });
}

/** Exige login de administrador Raccolto (role raccotlo/raccotlo_gestor). Telas e rotas em /admin. */
export async function exigirRaccoltoAdmin(req: Request): Promise<NextResponse | null> {
  const u = await getRequestUser(auth(req));
  if (!u) return NextResponse.json({ ok: false, error: "Não autenticado" }, { status: 401 });
  const { data: perfil } = await adminClient().from("perfis").select("role").eq("user_id", u.id).maybeSingle();
  return isRaccotloAdmin(perfil?.role, u.email) ? null : NextResponse.json({ ok: false, error: "Acesso restrito à equipe Raccolto" }, { status: 403 });
}

/** Exige login e que a conta informada seja a do usuário (Raccolto passa). */
export async function exigirAcessoConta(req: Request, contaId: string | null | undefined): Promise<NextResponse | null> {
  if (!contaId) return NextResponse.json({ ok: false, error: "conta_id obrigatório" }, { status: 400 });
  const u = await getRequestUser(auth(req));
  if (!u) return NextResponse.json({ ok: false, error: "Não autenticado" }, { status: 401 });
  const { data: perfil } = await adminClient().from("perfis").select("conta_id, role").eq("user_id", u.id).maybeSingle();
  if (perfil?.role?.startsWith("raccotlo") || isRaccotloAdmin(perfil?.role, u.email)) return null;
  return perfil?.conta_id === contaId ? null : NextResponse.json({ ok: false, error: "Acesso negado a esta conta" }, { status: 403 });
}

/** Exige login e acesso a TODAS as fazendas da lista. */
export async function exigirAcessoFazendas(req: Request, fazendaIds: (string | null | undefined)[]): Promise<NextResponse | null> {
  const ids = Array.from(new Set(fazendaIds.filter((x): x is string => !!x)));
  if (!ids.length) return exigirLogin(req);
  for (const id of ids) { const r = await exigirAcessoFazenda(req, id); if (r) return r; }
  return null;
}

// Chamada de uma rota do próprio servidor para outra (robô do SIEG, webhook do WhatsApp): sem cookie de usuário,
// identifica-se com esta chave, derivada da service role — nunca sai do servidor nem expõe a chave em si.
export const CABECALHO_INTERNO = "x-arato-interno";
export function chaveInterna(): string {
  return createHash("sha256").update(`arato-interno:${process.env.SUPABASE_SERVICE_ROLE_KEY ?? ""}`).digest("hex");
}
export function ehChamadaInterna(req: Request): boolean {
  const k = req.headers.get(CABECALHO_INTERNO);
  return !!process.env.SUPABASE_SERVICE_ROLE_KEY && !!k && k === chaveInterna();
}

/** Exige login e acesso às fazendas donas de todos os registros (tabela.id → fazenda_id). */
export async function exigirAcessoRegistros(req: Request, tabela: string | string[], ids: (string | null | undefined)[], campo = "id"): Promise<NextResponse | null> {
  const lista = Array.from(new Set(ids.filter((x): x is string => !!x)));
  if (!lista.length) return exigirLogin(req);
  // Várias tabelas: o id pode ser de qualquer uma (ex.: título do produtor ou da empresa).
  const tabelas = Array.isArray(tabela) ? tabela : [tabela];
  const data = (await Promise.all(tabelas.map(t => adminClient().from(t).select("fazenda_id").in(campo, lista))))
    .flatMap(r => (r.data ?? []) as { fazenda_id: string | null }[]);
  if (!data.length) {
    const u = await getRequestUser(auth(req));
    return u ? NextResponse.json({ ok: false, error: "Registro não encontrado" }, { status: 404 }) : NextResponse.json({ ok: false, error: "Não autenticado" }, { status: 401 });
  }
  return exigirAcessoFazendas(req, data.map(d => d.fazenda_id));
}

/** Exige acesso à fazenda de origem da transferência de estoque (e às fazendas informadas no corpo). */
export async function exigirAcessoTransferencia(req: Request, transferenciaId: string | null | undefined, fazendasDoCorpo: (string | null | undefined)[] = []): Promise<NextResponse | null> {
  const fazendas = [...fazendasDoCorpo];
  if (transferenciaId) {
    const { data } = await adminClient().from("transferencias_estoque").select("fazenda_origem_id, fazenda_destino_id").eq("id", transferenciaId).maybeSingle();
    if (!data) {
      const u = await getRequestUser(auth(req));
      return u ? NextResponse.json({ ok: false, error: "Transferência não encontrada" }, { status: 404 }) : NextResponse.json({ ok: false, error: "Não autenticado" }, { status: 401 });
    }
    fazendas.push((data as { fazenda_origem_id: string }).fazenda_origem_id);
  }
  return exigirAcessoFazendas(req, fazendas);
}

/** Token do webhook do WhatsApp (vai no endereço cadastrado na Evolution API por /api/whatsapp/fix-webhook). */
export function tokenWebhookWhatsapp(): string {
  return createHash("sha256").update(`whatsapp-webhook:${process.env.SUPABASE_SERVICE_ROLE_KEY ?? ""}`).digest("hex").slice(0, 40);
}
/** Webhook do WhatsApp legítimo: token no endereço, chamada interna, ou a apikey da Evolution no corpo do evento. */
export function webhookWhatsappAutorizado(req: Request, body: Record<string, unknown>): boolean {
  if (ehChamadaInterna(req)) return true;
  const token = new URL(req.url).searchParams.get("token");
  if (process.env.SUPABASE_SERVICE_ROLE_KEY && token === tokenWebhookWhatsapp()) return true;
  const chaves = [process.env.EVOLUTION_API_KEY, process.env.EVOLUTION_INSTANCE_TOKEN].filter(Boolean);
  return typeof body.apikey === "string" && chaves.includes(body.apikey);
}
