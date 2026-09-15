import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { enviarTexto } from "@/lib/whatsapp-evolution";

export const dynamic = "force-dynamic";

// Mesmo domínio cross-app de app/api/campo/aprovar-lancamento — ver comentário
// lá pro porquê do allowlist explícito.
function corsHeaders(req: Request) {
  const origin = req.headers.get("origin") ?? "";
  const allowed = ["https://campo.arato.agr.br", "https://arato-campo.vercel.app", "http://localhost:3001"];
  return {
    "Access-Control-Allow-Origin": allowed.includes(origin) ? origin : allowed[0],
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };
}

export async function OPTIONS(req: Request) {
  return new Response(null, { status: 204, headers: corsHeaders(req) });
}

function jsonCors(req: Request, body: unknown, init?: ResponseInit) {
  return NextResponse.json(body, { ...init, headers: { ...init?.headers, ...corsHeaders(req) } });
}

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

type Tabela = "plantios" | "pulverizacoes" | "adubacoes_base" | "correcoes_solo" | "abastecimentos";
const TABELAS_VALIDAS: Tabela[] = ["plantios", "pulverizacoes", "adubacoes_base", "correcoes_solo", "abastecimentos"];
const LABEL_TABELA: Record<Tabela, string> = {
  plantios: "Plantio",
  pulverizacoes: "Pulverização",
  adubacoes_base: "Adubação de Base",
  correcoes_solo: "Correção de Solo",
  abastecimentos: "Abastecimento",
};

// POST /api/campo/notificar-pendente
// Chamada pelo App Campo logo depois de gravar um lançamento com
// status_campo='pendente' — avisa por WhatsApp (Evolution API, já em uso
// pro bot de IA do Arato) todo Gerente Campo com acesso à fazenda, pra quem
// não está com o App Campo aberto saber que tem algo esperando aprovação
// (CLAUDE.md do App Campo, seção 4.3/5 — mecanismo de notificação
// cross-app, decisão 15/set/2026: WhatsApp automático).
// Best-effort: nunca falha a criação do lançamento em si — se ninguém tem
// telefone cadastrado, ou o envio falha, só retorna notificados:0, não erro.
export async function POST(req: NextRequest) {
  const adm = adminClient();

  const authHeader = req.headers.get("authorization") ?? "";
  const token = authHeader.replace("Bearer ", "").trim();
  if (!token) return jsonCors(req, { error: "Não autenticado" }, { status: 401 });

  const {
    data: { user },
    error: authErr,
  } = await adm.auth.getUser(token);
  if (authErr || !user) return jsonCors(req, { error: "Token inválido" }, { status: 401 });

  let body: { tabela: Tabela; id: string };
  try {
    body = await req.json();
  } catch {
    return jsonCors(req, { error: "Corpo inválido" }, { status: 400 });
  }

  const { tabela, id } = body;
  if (!TABELAS_VALIDAS.includes(tabela) || !id) {
    return jsonCors(req, { error: "Parâmetros inválidos" }, { status: 400 });
  }

  const { data: perfilChamador } = await adm.from("perfis").select("id, nome").eq("user_id", user.id).maybeSingle();
  if (!perfilChamador) return jsonCors(req, { error: "Perfil não encontrado" }, { status: 403 });

  const { data: linha } = await adm.from(tabela).select("fazenda_id, status_campo").eq("id", id).maybeSingle();
  if (!linha) return jsonCors(req, { ok: true, notificados: 0 });
  // Já foi aprovado/rejeitado entre a gravação e essa chamada (ou chamada
  // duplicada em retry) — não avisa de novo.
  if (linha.status_campo !== "pendente") return jsonCors(req, { ok: true, notificados: 0 });

  const { data: fazenda } = await adm.from("fazendas").select("nome, conta_id").eq("id", linha.fazenda_id).maybeSingle();
  if (!fazenda) return jsonCors(req, { ok: true, notificados: 0 });

  const { data: gerentes } = await adm
    .from("perfis")
    .select("whatsapp, fazendas_permitidas")
    .eq("conta_id", fazenda.conta_id)
    .eq("produto", "campo")
    .eq("papel", "gerente_campo")
    .not("whatsapp", "is", null);

  const destinatarios = (gerentes ?? []).filter(
    (g) => !g.fazendas_permitidas || g.fazendas_permitidas.includes(linha.fazenda_id)
  );

  const mensagem =
    `📋 Novo lançamento de ${LABEL_TABELA[tabela]} pendente de aprovação\n` +
    `Fazenda: ${fazenda.nome}\n` +
    `Lançado por: ${perfilChamador.nome ?? "um operador"}\n\n` +
    `Abra o App Campo para revisar.`;

  try {
    await Promise.allSettled(destinatarios.map((g) => enviarTexto(g.whatsapp as string, mensagem)));
  } catch {
    // best-effort — falha de envio não é erro da rota
  }

  return jsonCors(req, { ok: true, notificados: destinatarios.length });
}
