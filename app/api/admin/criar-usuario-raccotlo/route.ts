/**
 * POST /api/admin/criar-usuario-raccotlo
 * Cria usuário da equipe Raccotlo: Auth + perfis (sem fazenda_id, sem usuarios table).
 * Requer role raccotlo ou raccotlo_gestor.
 */
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { Resend } from "resend";

export const dynamic = "force-dynamic";

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

export async function POST(req: Request) {
  try {
    // Verifica autenticação e role
    const cookieStore = await cookies();
    const supabaseUser = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { cookies: { getAll: () => cookieStore.getAll() } },
    );
    const { data: { user }, error: authErr } = await supabaseUser.auth.getUser();
    if (authErr || !user) return NextResponse.json({ ok: false, error: "Não autenticado" }, { status: 401 });

    const admin = adminClient();
    const { data: perfil } = await admin.from("perfis").select("role").eq("user_id", user.id).maybeSingle();
    const isGino = (user.email ?? "").toLowerCase() === "gino@raccolto.com.br";
    if (!isGino && perfil?.role !== "raccotlo" && perfil?.role !== "raccotlo_gestor") {
      return NextResponse.json({ ok: false, error: "Acesso restrito" }, { status: 403 });
    }

    const { user_nome, user_email, user_senha, hub_acesso, whatsapp, enviar_email = true } =
      await req.json() as {
        user_nome: string; user_email: string; user_senha: string;
        hub_acesso?: string; whatsapp?: string | null; enviar_email?: boolean;
      };

    if (!user_nome || !user_email || !user_senha) {
      return NextResponse.json({ ok: false, error: "Campos obrigatórios faltando" }, { status: 400 });
    }

    // ── 1. Criar ou recuperar usuário no Supabase Auth ──
    let authUserId: string;
    const { data: authData, error: authCreateErr } = await admin.auth.admin.createUser({
      email:         user_email,
      password:      user_senha,
      email_confirm: true,
      user_metadata: { must_change_password: true, nome: user_nome },
    });

    if (authCreateErr) {
      if (!authCreateErr.message.includes("already been registered")) {
        return NextResponse.json({ ok: false, error: "Auth: " + authCreateErr.message }, { status: 400 });
      }
      // Usuário já existe — recupera e atualiza senha
      const { data: lista } = await admin.auth.admin.listUsers();
      const existente = lista?.users.find(u => u.email?.toLowerCase() === user_email.toLowerCase());
      if (!existente) return NextResponse.json({ ok: false, error: "Usuário não encontrado" }, { status: 404 });
      authUserId = existente.id;
      await admin.auth.admin.updateUserById(authUserId, {
        password:      user_senha,
        user_metadata: { must_change_password: true, nome: user_nome },
      });
    } else {
      authUserId = authData.user.id;
    }

    // ── 2. Criar/atualizar perfil (sem fazenda_id) ──
    const emailLower  = user_email.toLowerCase();
    const isGinoNew   = emailLower === "gino@raccolto.com.br";
    const roleFinal   = isGinoNew ? "raccotlo" : (hub_acesso ?? "client");
    const { data: perfilExist } = await admin.from("perfis").select("role").eq("user_id", authUserId).maybeSingle();

    const perfilPayload: Record<string, unknown> = {
      user_id: authUserId,
      nome:    user_nome,
      role:    isGinoNew ? "raccotlo" : (perfilExist?.role === "raccotlo" ? "raccotlo" : roleFinal),
    };
    if (whatsapp) perfilPayload.whatsapp = whatsapp;

    const { error: perfErr } = await admin.from("perfis").upsert(perfilPayload, { onConflict: "user_id" });
    if (perfErr) return NextResponse.json({ ok: false, error: "Perfil: " + perfErr.message }, { status: 500 });

    // ── 3. E-mail de boas-vindas (opcional) ──
    let emailEnviado = false;
    if (enviar_email) {
      const appUrl    = process.env.NEXT_PUBLIC_APP_URL ?? "https://web.arato.agr.br";
      const resendKey = process.env.RESEND_API_KEY;
      const fromAddr  = process.env.RESEND_FROM ?? "noreply@agr.com.br";
      if (resendKey) {
        try {
          const resend = new Resend(resendKey);
          await resend.emails.send({
            from:    fromAddr,
            to:      user_email,
            subject: "Seu acesso ao Arato — Equipe Raccotlo",
            html: `
<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#F4F6FA;font-family:system-ui,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#F4F6FA;padding:32px 0;">
    <tr><td align="center">
      <table width="520" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;border:0.5px solid #DDE2EE;overflow:hidden;">
        <tr><td style="background:#1A4870;padding:24px 32px;">
          <div style="font-size:20px;font-weight:700;color:#fff;">Arato</div>
          <div style="font-size:12px;color:rgba(255,255,255,0.65);margin-top:2px;">Painel Raccotlo</div>
        </td></tr>
        <tr><td style="padding:28px 32px;">
          <p style="margin:0 0 6px;font-size:17px;font-weight:700;color:#1a1a1a;">Bem-vindo à equipe, ${user_nome}!</p>
          <p style="margin:0 0 22px;font-size:13px;color:#555;line-height:1.6;">Sua conta no Arato foi criada como membro da equipe Raccotlo.</p>
          <table width="100%" cellpadding="0" cellspacing="0" style="background:#F4F6FA;border-radius:8px;border:0.5px solid #DDE2EE;margin-bottom:22px;">
            <tr><td style="padding:16px 20px;">
              <div style="font-size:10px;color:#888;font-weight:700;text-transform:uppercase;margin-bottom:10px;">Credenciais de acesso</div>
              <div style="font-size:13px;color:#555;margin-bottom:6px;">E-mail: <strong style="color:#1a1a1a;">${user_email}</strong></div>
              <div style="font-size:13px;color:#555;">Senha provisória: <strong style="color:#1A4870;font-family:monospace;">${user_senha}</strong></div>
            </td></tr>
          </table>
          <div style="background:#FBF3E0;border:0.5px solid #C9921B;border-radius:8px;padding:12px 16px;margin-bottom:22px;font-size:12px;color:#7A5A12;">
            <strong>⚠️ Troque a senha no primeiro acesso.</strong>
          </div>
          <a href="${appUrl}/login" style="display:inline-block;padding:11px 24px;background:#1A4870;color:#fff;text-decoration:none;border-radius:8px;font-size:13px;font-weight:600;">
            Acessar o Arato →
          </a>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`,
          });
          emailEnviado = true;
        } catch { /* não bloqueia */ }
      }
    }

    return NextResponse.json({ ok: true, email_enviado: emailEnviado });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
