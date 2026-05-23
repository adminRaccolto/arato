import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { criarCliente, criarCobranca, buscarPixQrCode, proximoVencimento } from "../../../lib/asaas";
import type { PlanoId } from "../../../lib/planos";
import { PLANOS_DEFAULT } from "../../../lib/planos";

// API de cadastro self-service
// POST /api/cadastro
// Body: { nome, email, senha, cpf_cnpj, telefone, nome_fazenda, cidade, estado, plano_id, periodo }

const sb = () =>
  createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { nome, email, senha, cpf_cnpj, telefone, nome_fazenda, cidade, estado, plano_id, periodo } = body as {
      nome: string; email: string; senha: string;
      cpf_cnpj: string; telefone?: string;
      nome_fazenda: string; cidade?: string; estado?: string;
      plano_id: PlanoId; periodo: "mensal" | "anual";
    };

    if (!nome || !email || !senha || !cpf_cnpj || !nome_fazenda || !plano_id) {
      return NextResponse.json({ error: "Campos obrigatórios faltando" }, { status: 400 });
    }

    const plano = PLANOS_DEFAULT[plano_id];
    if (!plano) return NextResponse.json({ error: "Plano inválido" }, { status: 400 });

    const supabase = sb();

    // 1. Verifica se e-mail já existe
    const { data: usuariosExistentes } = await supabase.auth.admin.listUsers();
    const jaExiste = usuariosExistentes?.users?.some(u => u.email === email.toLowerCase().trim());
    if (jaExiste) {
      return NextResponse.json({ error: "E-mail já cadastrado. Faça login ou recupere sua senha." }, { status: 409 });
    }

    // 2. Cria usuário no Supabase Auth
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email: email.toLowerCase().trim(),
      password: senha,
      email_confirm: true,
    });
    if (authError || !authData.user) {
      return NextResponse.json({ error: authError?.message ?? "Erro ao criar usuário" }, { status: 400 });
    }
    const userId = authData.user.id;

    // 3. Cria conta (tenant raiz)
    const { data: conta, error: contaErr } = await supabase
      .from("contas")
      .insert({
        nome: nome_fazenda,
        tipo: cpf_cnpj.replace(/\D/g, "").length === 11 ? "pf" : "pj",
        status: "trial",
        pacote: plano_id,
        email_contato: email,
        telefone: telefone ?? null,
        cpf_cnpj,
        cidade: cidade ?? null,
        estado: estado ?? null,
        nome_fazenda,
        crm_stage: "aguardando_pagamento",
        origem: "site",
        data_inicio: new Date().toISOString().split("T")[0],
        data_vencimento: (() => {
          const d = new Date();
          d.setDate(d.getDate() + plano.trial_dias);
          return d.toISOString().split("T")[0];
        })(),
        onboarding_ativo: true,
      })
      .select()
      .single();
    if (contaErr || !conta) {
      await supabase.auth.admin.deleteUser(userId);
      return NextResponse.json({ error: "Erro ao criar conta" }, { status: 500 });
    }

    // 4. Cria fazenda padrão
    const { data: fazenda } = await supabase
      .from("fazendas")
      .insert({
        nome: nome_fazenda,
        conta_id: conta.id,
        municipio: cidade ?? null,
        estado: estado ?? null,
        owner_user_id: userId,
      })
      .select()
      .single();

    // 5. Cria produtor
    const { data: produtor } = await supabase
      .from("produtores")
      .insert({
        nome,
        cpf: cpf_cnpj.replace(/\D/g, "").length === 11 ? cpf_cnpj : null,
        cnpj: cpf_cnpj.replace(/\D/g, "").length === 14 ? cpf_cnpj : null,
        email,
        telefone: telefone ?? null,
        conta_id: conta.id,
        fazenda_id: fazenda?.id ?? null,
      })
      .select()
      .single();

    // 6. Cria perfil do usuário
    await supabase.from("perfis").insert({
      user_id: userId,
      nome,
      conta_id: conta.id,
      fazenda_id: fazenda?.id ?? null,
      role: "client",
    });

    // 7. Cria assinatura (em trial)
    const trialFim = new Date();
    trialFim.setDate(trialFim.getDate() + plano.trial_dias);
    const preco = plano.preco_mensal;

    const { data: assinatura } = await supabase
      .from("assinaturas")
      .insert({
        conta_id: conta.id,
        plano_id,
        status: "trial",
        periodo,
        preco,
        data_inicio: new Date().toISOString().split("T")[0],
        trial_fim: trialFim.toISOString().split("T")[0],
        data_proximo_pagamento: trialFim.toISOString().split("T")[0],
      })
      .select()
      .single();

    // 8. Cria cliente no Asaas e primeira cobrança (pós-trial)
    let asaasCustomerId: string | null = null;
    let invoiceUrl: string | null = null;
    let pixPayload: string | null = null;
    let asaasError: string | null = null;

    try {
      if (process.env.ASAAS_API_KEY) {
        const customer = await criarCliente({
          name: nome,
          email,
          cpfCnpj: cpf_cnpj.replace(/\D/g, ""),
          mobilePhone: telefone?.replace(/\D/g, ""),
          city: cidade,
          state: estado,
        });
        asaasCustomerId = customer.id;

        // Cobrança PIX vence no fim do trial
        const vencimento = trialFim.toISOString().split("T")[0];
        const pagamento = await criarCobranca({
          customer: customer.id,
          billingType: "PIX",
          value: preco,
          dueDate: vencimento,
          description: `Arato ${plano.nome} — ${periodo === "anual" ? "Anual" : "Mensal"}`,
          externalReference: conta.id,
        });

        // Busca QR code PIX
        try {
          const pix = await buscarPixQrCode(pagamento.id);
          pixPayload = pix.payload;
        } catch { /* QR code pode demorar alguns segundos para gerar */ }

        invoiceUrl = pagamento.invoiceUrl ?? null;

        // Salva IDs Asaas na assinatura
        if (assinatura) {
          await supabase.from("assinaturas").update({
            asaas_customer_id: customer.id,
          }).eq("id", assinatura.id);
        }

        // Salva pagamento no banco
        await supabase.from("pagamentos").insert({
          assinatura_id: assinatura?.id ?? null,
          conta_id: conta.id,
          valor: preco,
          status: "pendente",
          data_vencimento: vencimento,
          metodo_pagamento: "pix",
          asaas_payment_id: pagamento.id,
          asaas_invoice_url: invoiceUrl,
          descricao: `Arato ${plano.nome} — 1ª mensalidade`,
        });
      }
    } catch (err) {
      asaasError = String(err);
      console.error("[cadastro] Asaas error (não fatal):", asaasError);
    }

    // 9. Notifica Raccolto por e-mail (via Resend)
    try {
      if (process.env.RESEND_API_KEY) {
        await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.RESEND_API_KEY}` },
          body: JSON.stringify({
            from: process.env.RESEND_FROM ?? "noreply@arato.agr.br",
            to: ["consultor@raccolto.com.br"],
            subject: `🌱 Novo cliente Arato — ${nome_fazenda} (${plano.nome})`,
            html: `<h2>Novo cadastro no Arato</h2>
<table><tr><td><b>Nome:</b></td><td>${nome}</td></tr>
<tr><td><b>E-mail:</b></td><td>${email}</td></tr>
<tr><td><b>Telefone:</b></td><td>${telefone ?? "—"}</td></tr>
<tr><td><b>Fazenda:</b></td><td>${nome_fazenda}</td></tr>
<tr><td><b>Cidade/UF:</b></td><td>${cidade ?? "—"} / ${estado ?? "—"}</td></tr>
<tr><td><b>Plano:</b></td><td>${plano.nome} — ${periodo}</td></tr>
<tr><td><b>CPF/CNPJ:</b></td><td>${cpf_cnpj}</td></tr>
</table>
<p>Trial de ${plano.trial_dias} dias ativo. Vence em: <b>${trialFim.toLocaleDateString("pt-BR")}</b></p>
<p><a href="${process.env.NEXT_PUBLIC_APP_URL ?? "https://app.arato.agr.br"}/admin">Ver no painel admin →</a></p>`,
          }),
        });
      }
    } catch { /* notificação não é crítica */ }

    return NextResponse.json({
      ok: true,
      conta_id: conta.id,
      fazenda_id: fazenda?.id ?? null,
      trial_dias: plano.trial_dias,
      trial_fim: trialFim.toISOString().split("T")[0],
      invoice_url: invoiceUrl,
      pix_payload: pixPayload,
      asaas_error: asaasError,
    });

  } catch (err) {
    console.error("[cadastro]", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
