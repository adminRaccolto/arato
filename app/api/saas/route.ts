// API Pública — integração com o site raccolto.com.br
// Permite criar trial, consultar planos e verificar status de contas
// Autenticação: header x-raccolto-key (env RACCOLTO_PUBLIC_API_KEY)
//
// Endpoints (todos via POST com action no body):
//   POST { action: "trial",   ...campos }  → cria trial
//   POST { action: "status",  email }       → verifica status
//   POST { action: "planos" }               → lista planos públicos
//   GET  /api/saas                          → healthcheck

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { PLANOS_DEFAULT, fmtPreco } from "../../../lib/planos";
import type { PlanoId } from "../../../lib/planos";

const ALLOWED_ORIGINS = [
  "https://raccolto.com.br",
  "https://www.raccolto.com.br",
  "https://app.raccolto.com.br",
  "http://localhost:3001", // dev
];

function cors(req: NextRequest) {
  const origin = req.headers.get("origin") ?? "";
  return {
    "Access-Control-Allow-Origin":  ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0],
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, x-raccolto-key",
    "Access-Control-Max-Age":       "86400",
  };
}

function autorizado(req: NextRequest) {
  const key    = process.env.RACCOLTO_PUBLIC_API_KEY;
  const header = req.headers.get("x-raccolto-key");
  if (!key) return true; // dev local sem key configurada
  return header === key;
}

function sb() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

// ── GET — healthcheck ────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  return NextResponse.json({
    ok: true,
    service: "Arato SaaS API",
    version: "1.0",
    planos: Object.keys(PLANOS_DEFAULT),
  }, { headers: cors(req) });
}

export async function OPTIONS(req: NextRequest) {
  return new Response(null, { status: 204, headers: cors(req) });
}

// ── POST — ações ─────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  if (!autorizado(req)) {
    return NextResponse.json({ ok: false, error: "Chave inválida" }, { status: 401, headers: cors(req) });
  }

  let body: Record<string, unknown>;
  try { body = await req.json(); }
  catch { return NextResponse.json({ ok: false, error: "Body inválido" }, { status: 400, headers: cors(req) }); }

  const { action } = body;

  // ── Listar planos ──────────────────────────────────────────────────────────
  if (action === "planos") {
    const planos = Object.values(PLANOS_DEFAULT).map(p => ({
      id:          p.id,
      nome:        p.nome,
      descricao:   p.descricao,
      preco_mensal: p.preco_mensal,
      preco_fmt:   fmtPreco(p.preco_mensal),
      trial_dias:  p.trial_dias,
      destaque:    p.destaque,
      features:    p.features_marketing,
    }));
    return NextResponse.json({ ok: true, planos }, { headers: cors(req) });
  }

  // ── Verificar status ───────────────────────────────────────────────────────
  if (action === "status") {
    const email = String(body.email ?? "").toLowerCase().trim();
    if (!email) return NextResponse.json({ ok: false, error: "email obrigatório" }, { status: 400, headers: cors(req) });

    const supabase = sb();
    const { data: conta } = await supabase
      .from("contas")
      .select("id, nome, status, pacote, data_vencimento, data_inicio")
      .eq("email_contato", email)
      .maybeSingle();

    if (!conta) return NextResponse.json({ ok: true, encontrado: false }, { headers: cors(req) });

    return NextResponse.json({
      ok: true, encontrado: true,
      status:          conta.status,
      plano:           conta.pacote,
      data_inicio:     conta.data_inicio,
      data_vencimento: conta.data_vencimento,
      ativo:           conta.status === "ativo" || conta.status === "trial",
    }, { headers: cors(req) });
  }

  // ── Criar trial ────────────────────────────────────────────────────────────
  if (action === "trial") {
    const { nome, email, cpf_cnpj, telefone, nome_fazenda, cidade, estado, plano_id, senha, utm_source, utm_medium, utm_campaign } = body as {
      nome: string; email: string; cpf_cnpj: string; telefone?: string;
      nome_fazenda: string; cidade?: string; estado?: string;
      plano_id?: PlanoId; senha?: string;
      utm_source?: string; utm_medium?: string; utm_campaign?: string;
    };

    if (!nome || !email || !cpf_cnpj || !nome_fazenda) {
      return NextResponse.json({ ok: false, error: "nome, email, cpf_cnpj e nome_fazenda são obrigatórios" }, { status: 400, headers: cors(req) });
    }

    const planoId: PlanoId = plano_id ?? "gestao";
    const plano = PLANOS_DEFAULT[planoId];
    if (!plano) return NextResponse.json({ ok: false, error: "Plano inválido" }, { status: 400, headers: cors(req) });

    // Delega para a API de cadastro interna
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://app.arato.agr.br";
    const res = await fetch(`${baseUrl}/api/cadastro`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        nome,
        email: email.toLowerCase().trim(),
        senha: senha ?? Math.random().toString(36).slice(-10) + "Aa1!",
        cpf_cnpj,
        telefone,
        nome_fazenda,
        cidade,
        estado,
        plano_id: planoId,
        origem: utm_source ? `${utm_source}/${utm_medium ?? ""}` : "raccolto-site",
      }),
    });

    const data = await res.json();
    if (!res.ok || !data.ok) {
      console.error("[api/saas trial]", data.error);
      return NextResponse.json({ ok: false, error: data.error ?? "Erro ao criar trial" }, { status: res.status, headers: cors(req) });
    }

    return NextResponse.json({
      ok: true,
      conta_id:   data.conta_id,
      trial_dias: data.trial_dias,
      trial_fim:  data.trial_fim,
      login_url:  `${baseUrl}/login`,
      pagamento_url: data.invoice_url ?? null,
      pix_payload: data.pix_payload ?? null,
      mensagem: `Trial de ${plano.trial_dias} dias criado. Acesse ${baseUrl}/login com o e-mail cadastrado.`,
    }, { headers: cors(req) });
  }

  // ── Cancelar assinatura (solicitação) ─────────────────────────────────────
  if (action === "cancelar") {
    const { email, motivo } = body as { email: string; motivo?: string };
    if (!email) return NextResponse.json({ ok: false, error: "email obrigatório" }, { status: 400, headers: cors(req) });

    const supabase = sb();
    const { data: conta } = await supabase.from("contas").select("id, nome").eq("email_contato", email.toLowerCase().trim()).maybeSingle();
    if (!conta) return NextResponse.json({ ok: false, error: "Conta não encontrada" }, { status: 404, headers: cors(req) });

    await supabase.from("assinaturas").update({ status: "cancelada", cancelamento_motivo: motivo ?? "solicitado_via_api" }).eq("conta_id", conta.id).eq("status", "ativa");
    await supabase.from("contas").update({ status: "cancelado", crm_stage: "churned" }).eq("id", conta.id);

    // Notifica equipe Raccolto
    if (process.env.RESEND_API_KEY) {
      await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.RESEND_API_KEY}` },
        body: JSON.stringify({
          from: process.env.RESEND_FROM ?? "noreply@arato.agr.br",
          to: ["consultor@raccolto.com.br"],
          subject: `⚠️ Cancelamento Arato — ${conta.nome}`,
          html: `<h2>Cancelamento solicitado</h2><p><b>Conta:</b> ${conta.nome}<br><b>E-mail:</b> ${email}<br><b>Motivo:</b> ${motivo ?? "—"}</p>`,
        }),
      }).catch(() => {});
    }

    return NextResponse.json({ ok: true, mensagem: "Cancelamento registrado. Nossa equipe entrará em contato." }, { headers: cors(req) });
  }

  return NextResponse.json({ ok: false, error: `Ação desconhecida: ${action}` }, { status: 400, headers: cors(req) });
}
