import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { Resend } from "resend";
import { seedOperacoesGerenciais } from "./seedOperacoesGerenciais";

export interface CriarClientePayload {
  tipo: "pf" | "pj";
  nome: string;
  cpf_cnpj?: string;
  email_cliente?: string;
  telefone?: string;
  municipio_cliente?: string;
  estado_cliente?: string;
  fazenda_nome: string;
  fazenda_municipio?: string;
  fazenda_estado?: string;
  fazenda_area?: string;
  user_nome: string;
  user_email: string;
  user_senha: string;
  onboarding_ativo?: boolean;
}

export interface CriarClienteResult {
  ok: true;
  fazenda_id: string;
  user_email: string;
  email_enviado: boolean;
}

function adminClient(): SupabaseClient {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

export async function criarClienteCompleto(payload: CriarClientePayload): Promise<CriarClienteResult> {
  const {
    tipo, nome, cpf_cnpj, email_cliente, telefone,
    municipio_cliente, estado_cliente,
    fazenda_nome, fazenda_municipio, fazenda_estado, fazenda_area,
    user_nome, user_email, user_senha,
    onboarding_ativo = true,
  } = payload;

  const supabase = adminClient();

  // ── 0. Criar conta (tenant raiz) ──
  const { data: conta, error: contaErr } = await supabase
    .from("contas")
    .insert({ nome, tipo: tipo === "pj" ? "pj" : "pf" })
    .select("id")
    .single();
  if (contaErr) throw new Error("Conta: " + contaErr.message);
  const contaId = conta.id;

  if (!onboarding_ativo) {
    try {
      await supabase.from("contas").update({ onboarding_ativo: false }).eq("id", contaId);
    } catch { /* coluna pode não existir ainda */ }
  }

  // ── 1. Criar fazenda vinculada à conta ──
  const { data: fazenda, error: fazErr } = await supabase
    .from("fazendas")
    .insert({
      nome:          fazenda_nome,
      municipio:     fazenda_municipio,
      estado:        fazenda_estado,
      area_total_ha: parseFloat(fazenda_area ?? "0") || 0,
      conta_id:      contaId,
    })
    .select("id")
    .single();
  if (fazErr) throw new Error("Fazenda: " + fazErr.message);
  const fazendaId = fazenda.id;

  // ── 2. Criar produtor vinculado à fazenda e conta ──
  const { data: produtor, error: prodErr } = await supabase
    .from("produtores")
    .insert({
      fazenda_id: fazendaId,
      conta_id:   contaId,
      nome,
      tipo:       tipo === "pf" ? "pf" : "pj",
      cpf_cnpj:   cpf_cnpj        || null,
      email:      email_cliente   || null,
      telefone:   telefone        || null,
      municipio:  municipio_cliente || null,
      estado:     estado_cliente  || null,
    })
    .select("id")
    .single();
  if (prodErr) throw new Error("Produtor: " + prodErr.message);

  // ── 3. Atualizar fazenda com produtor_id ──
  await supabase.from("fazendas").update({ produtor_id: produtor.id }).eq("id", fazendaId);

  // ── 4. Criar usuário no Supabase Auth (com fallback para usuário já existente) ──
  let authUserId: string;
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
    const { data: lista, error: listErr } = await supabase.auth.admin.listUsers();
    if (listErr) throw new Error("Busca Auth: " + listErr.message);
    const existente = lista.users.find(u => u.email?.toLowerCase() === user_email.toLowerCase());
    if (!existente) throw new Error("Usuário não encontrado após conflito de e-mail.");
    await supabase.auth.admin.updateUserById(existente.id, {
      password:      user_senha,
      user_metadata: { must_change_password: true, nome: user_nome },
    });
    authUserId = existente.id;
  } else {
    authUserId = authData.user.id;
  }

  // ── 5. Criar/atualizar perfil ──
  const { error: perfErr } = await supabase.from("perfis").upsert({
    user_id:    authUserId,
    fazenda_id: fazendaId,
    conta_id:   contaId,
    nome:       user_nome,
    role:       "client",
  }, { onConflict: "user_id" });
  if (perfErr) throw new Error("Perfil: " + perfErr.message);

  // ── 5b. Vincular owner_user_id na fazenda ──
  await supabase.from("fazendas").update({ owner_user_id: authUserId }).eq("id", fazendaId);

  // ── 6. Buscar grupo "Gerente" ──
  const { data: grupo } = await supabase
    .from("grupos_usuarios").select("id").ilike("nome", "gerente").single();

  // ── 7. Criar registro de usuário ──
  await supabase.from("usuarios").insert({
    fazenda_id:   fazendaId,
    auth_user_id: authUserId,
    nome:         user_nome,
    email:        user_email,
    ativo:        true,
    grupo_id:     grupo?.id ?? null,
  });

  // ── 8. Semear operações gerenciais padrão ──
  try {
    await seedOperacoesGerenciais(fazendaId, supabase);
  } catch { /* não bloqueia o onboarding */ }

  // ── 8b. Semear anos safra padrão (2025/2026 → 2031/2032) ──
  try {
    const SAFRAS = [
      { descricao: "2025/2026", data_inicio: "2025-10-01", data_fim: "2026-09-30" },
      { descricao: "2026/2027", data_inicio: "2026-10-01", data_fim: "2027-09-30" },
      { descricao: "2027/2028", data_inicio: "2027-10-01", data_fim: "2028-09-30" },
      { descricao: "2028/2029", data_inicio: "2028-10-01", data_fim: "2029-09-30" },
      { descricao: "2029/2030", data_inicio: "2029-10-01", data_fim: "2030-09-30" },
      { descricao: "2030/2031", data_inicio: "2030-10-01", data_fim: "2031-09-30" },
      { descricao: "2031/2032", data_inicio: "2031-10-01", data_fim: "2032-09-30" },
    ];
    await supabase.from("anos_safra").insert(SAFRAS.map(s => ({ ...s, fazenda_id: fazendaId })));
  } catch { /* não bloqueia o onboarding */ }

  // ── 9. Enviar e-mail de boas-vindas ──
  const appUrl    = process.env.NEXT_PUBLIC_APP_URL ?? "https://arato.agr.br";
  const resendKey = process.env.RESEND_API_KEY;
  const fromAddr  = process.env.RESEND_FROM ?? "noreply@arato.agr.br";
  let emailEnviado = false;

  if (resendKey) {
    try {
      const resend = new Resend(resendKey);
      await resend.emails.send({
        from:    fromAddr,
        to:      user_email,
        subject: `Seu acesso ao Arato — ${fazenda_nome}`,
        html: `<!DOCTYPE html>
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
              Sua conta no Arato foi criada para a fazenda <strong>${fazenda_nome}</strong>.
              Use as credenciais abaixo para fazer seu primeiro acesso.
            </p>
            <table width="100%" cellpadding="0" cellspacing="0" style="background:#F4F6FA;border-radius:8px;border:0.5px solid #DDE2EE;margin-bottom:24px;">
              <tr>
                <td style="padding:20px 24px;">
                  <div style="font-size:11px;color:#888;font-weight:600;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:12px;">Suas credenciais</div>
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
              Arato · Gestão Agrícola · ${fazenda_municipio} — ${fazenda_estado}
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
    } catch { /* e-mail não bloqueia o cadastro */ }
  }

  return { ok: true, fazenda_id: fazendaId, user_email, email_enviado: emailEnviado };
}
