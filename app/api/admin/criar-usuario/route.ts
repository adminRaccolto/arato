import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { Resend } from "resend";

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

export async function POST(req: Request) {
  try {
    const {
      fazenda_id,
      conta_id,
      user_nome,
      user_email,
      user_senha,
      grupo_id,
      fazenda_nome,
      fazenda_municipio,
      fazenda_estado,
      enviar_email = true,
      whatsapp = null,
    } = await req.json();

    if (!fazenda_id || !user_nome || !user_email || !user_senha) {
      return NextResponse.json({ ok: false, error: "Campos obrigatórios faltando" }, { status: 400 });
    }

    const supabase = adminClient();

    // ── 1. Criar ou recuperar usuário no Supabase Auth ──
    let authUserId: string;
    let senhaRedefinida = false;

    const { data: authData, error: authErr } = await supabase.auth.admin.createUser({
      email:         user_email,
      password:      user_senha,
      email_confirm: true,
      user_metadata: { must_change_password: true, nome: user_nome },
    });

    if (authErr) {
      if (!authErr.message.includes("already been registered")) {
        throw new Error("Auth: " + authErr.message);
      }
      // Usuário já existe no Auth → buscar pelo email
      const { data: lista, error: listErr } = await supabase.auth.admin.listUsers();
      if (listErr) throw new Error("Busca Auth: " + listErr.message);
      const existente = lista.users.find(u => u.email?.toLowerCase() === user_email.toLowerCase());
      if (!existente) throw new Error("Usuário não encontrado após conflito de e-mail.");
      authUserId = existente.id;
      // Atualiza a senha para a nova senha informada
      await supabase.auth.admin.updateUserById(authUserId, {
        password:      user_senha,
        user_metadata: { must_change_password: true, nome: user_nome },
      });
      senhaRedefinida = true;
    } else {
      authUserId = authData.user.id;
    }

    // ── 2. Criar perfil (upsert — nunca sobrescreve role raccotlo) ──
    const { data: perfilExistente } = await supabase.from("perfis").select("role").eq("user_id", authUserId).maybeSingle();
    const emailLower = (user_email ?? "").toLowerCase();
    const roleFinal = (perfilExistente?.role === "raccotlo" || emailLower.endsWith("@raccolto.com.br"))
      ? "raccotlo" : "client";
    const { error: perfErr } = await supabase.from("perfis").upsert({
      user_id:    authUserId,
      fazenda_id: fazenda_id,
      conta_id:   conta_id ?? null,
      nome:       user_nome,
      role:       roleFinal,
    }, { onConflict: "user_id" });
    if (perfErr) {
      if (!senhaRedefinida) await supabase.auth.admin.deleteUser(authUserId);
      throw new Error("Perfil: " + perfErr.message);
    }

    // ── 3. Criar registro na tabela usuarios (upsert por email+fazenda) ──
    const { data: usuarioRow, error: userErr } = await supabase.from("usuarios").upsert({
      fazenda_id:   fazenda_id,
      auth_user_id: authUserId,
      nome:         user_nome,
      email:        user_email,
      ativo:        true,
      grupo_id:     grupo_id || null,
      whatsapp:     whatsapp || null,
    }, { onConflict: "fazenda_id,email" }).select("id").single();
    if (userErr) throw new Error("Usuario: " + userErr.message);

    // ── 4. Enviar e-mail de boas-vindas (opcional) ──
    let emailEnviado = false;
    if (enviar_email) {
      const appUrl    = process.env.NEXT_PUBLIC_APP_URL ?? "https://arato.agr.br";
      const resendKey = process.env.RESEND_API_KEY;
      const fromAddr  = process.env.RESEND_FROM ?? "noreply@arato.agr.br";
      const nomeFaz   = fazenda_nome ?? "sua fazenda";
      const munFaz    = fazenda_municipio ?? "";
      const estFaz    = fazenda_estado ?? "";

      if (resendKey) {
        try {
          const resend = new Resend(resendKey);
          await resend.emails.send({
            from:    fromAddr,
            to:      user_email,
            subject: `Seu acesso ao Arato — ${nomeFaz}`,
            html: `
<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#F4F6FA;font-family:system-ui,-apple-system,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#F4F6FA;padding:32px 0;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;border:0.5px solid #DDE2EE;overflow:hidden;">

        <tr>
          <td style="background:#1A4870;padding:28px 32px;">
            <div style="font-size:22px;font-weight:700;color:#ffffff;letter-spacing:-0.3px;">Arato</div>
            <div style="font-size:13px;color:rgba(255,255,255,0.65);margin-top:3px;">Gestão Agrícola</div>
          </td>
        </tr>

        <tr>
          <td style="padding:32px;">
            <p style="margin:0 0 8px;font-size:20px;font-weight:700;color:#1a1a1a;">Bem-vindo, ${user_nome}!</p>
            <p style="margin:0 0 24px;font-size:14px;color:#555;line-height:1.6;">
              Sua conta no Arato foi criada para a fazenda <strong>${nomeFaz}</strong>.
              Use as credenciais abaixo para fazer seu primeiro acesso.
            </p>

            <table width="100%" cellpadding="0" cellspacing="0" style="background:#F4F6FA;border-radius:8px;border:0.5px solid #DDE2EE;margin-bottom:24px;">
              <tr>
                <td style="padding:20px 24px;">
                  <div style="font-size:11px;color:#888;font-weight:600;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:12px;">Suas credenciais de acesso</div>
                  <table cellpadding="0" cellspacing="0">
                    <tr>
                      <td style="font-size:13px;color:#555;padding-bottom:8px;padding-right:16px;">E-mail</td>
                      <td style="font-size:13px;color:#1a1a1a;font-weight:600;padding-bottom:8px;">${user_email}</td>
                    </tr>
                    <tr>
                      <td style="font-size:13px;color:#555;padding-right:16px;">Senha provisória</td>
                      <td style="font-size:14px;color:#1A4870;font-weight:700;font-family:monospace,monospace;">${user_senha}</td>
                    </tr>
                  </table>
                </td>
              </tr>
            </table>

            <table width="100%" cellpadding="0" cellspacing="0" style="background:#FBF3E0;border-radius:8px;border:0.5px solid #C9921B;margin-bottom:28px;">
              <tr>
                <td style="padding:14px 18px;font-size:13px;color:#7A5A12;">
                  <strong>⚠️ Troque a senha no primeiro acesso.</strong> O sistema solicitará automaticamente que você crie uma nova senha segura.
                </td>
              </tr>
            </table>

            <table cellpadding="0" cellspacing="0" style="margin-bottom:28px;">
              <tr>
                <td style="background:#1A4870;border-radius:8px;">
                  <a href="${appUrl}/login" style="display:inline-block;padding:13px 28px;font-size:14px;font-weight:600;color:#ffffff;text-decoration:none;">
                    Acessar o Arato →
                  </a>
                </td>
              </tr>
            </table>

            <p style="margin:0;font-size:12px;color:#888;line-height:1.6;">
              Se tiver dúvidas, entre em contato com sua consultoria Raccolto.<br>
              Link direto: <a href="${appUrl}/login" style="color:#1A4870;">${appUrl}/login</a>
            </p>
          </td>
        </tr>

        <tr>
          <td style="background:#F4F6FA;padding:16px 32px;border-top:0.5px solid #DDE2EE;">
            <p style="margin:0;font-size:11px;color:#aaa;">
              Arato · Gestão Agrícola${munFaz ? ` · ${munFaz}${estFaz ? ` — ${estFaz}` : ""}` : ""}
            </p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`,
          });
          emailEnviado = true;
        } catch {
          // Não bloqueia — usuário já foi criado
        }
      }
    }

    return NextResponse.json({ ok: true, usuario_id: usuarioRow?.id, email_enviado: emailEnviado });
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err) }, { status: 400 });
  }
}
