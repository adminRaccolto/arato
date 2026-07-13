import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { statusAsaasParaLocal } from "../../../../lib/asaas";

// Webhook do Asaas — recebe notificações de pagamento
// Configura em: Asaas → Configurações → Notificações (URL: https://app.arato.agr.br/api/asaas/webhook)
// Asaas não envia secret; validação via ASAAS_WEBHOOK_TOKEN (query param ou header)

const sb = () =>
  createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

export async function POST(req: Request) {
  const webhookToken = process.env.ASAAS_WEBHOOK_TOKEN;
  if (webhookToken) {
    const received = req.headers.get("asaas-access-token") ?? "";
    if (received !== webhookToken) {
      return NextResponse.json({ ok: false, error: "Token inválido" }, { status: 401 });
    }
  }

  try {
    const body = await req.json();
    const event = body.event as string;
    const payment = body.payment;

    if (!event || !payment) {
      return NextResponse.json({ ok: false, error: "payload inválido" }, { status: 400 });
    }

    const supabase = sb();
    const asaasPaymentId: string = payment.id;
    const externalRef: string | null = payment.externalReference ?? null;

    // Busca pagamento local pelo ID Asaas
    const { data: pagamento } = await supabase
      .from("pagamentos")
      .select("id, conta_id, assinatura_id")
      .eq("asaas_payment_id", asaasPaymentId)
      .maybeSingle();

    const statusLocal = statusAsaasParaLocal(payment.status);

    // Atualiza status do pagamento
    if (pagamento) {
      await supabase
        .from("pagamentos")
        .update({
          status: statusLocal,
          data_pagamento: statusLocal === "pago" ? new Date().toISOString().split("T")[0] : null,
        })
        .eq("id", pagamento.id);
    }

    // Lida com eventos críticos
    if (event === "PAYMENT_CONFIRMED" || event === "PAYMENT_RECEIVED") {
      const contaId = pagamento?.conta_id ?? externalRef;
      if (contaId) {
        // Ativa a conta
        await supabase
          .from("contas")
          .update({ status: "ativo" })
          .eq("id", contaId);

        // Ativa a assinatura
        if (pagamento?.assinatura_id) {
          await supabase
            .from("assinaturas")
            .update({ status: "ativa", updated_at: new Date().toISOString() })
            .eq("id", pagamento.assinatura_id);
        }
      }
    }

    if (event === "PAYMENT_OVERDUE") {
      const contaId = pagamento?.conta_id ?? externalRef;
      if (contaId) {
        // Marca como inadimplente (read-only no app)
        await supabase
          .from("contas")
          .update({ status: "inadimplente" })
          .eq("id", contaId);

        if (pagamento?.assinatura_id) {
          await supabase
            .from("assinaturas")
            .update({ status: "inadimplente", updated_at: new Date().toISOString() })
            .eq("id", pagamento.assinatura_id);
        }
      }
    }

    if (event === "PAYMENT_DELETED" || event === "PAYMENT_REFUNDED") {
      if (pagamento?.assinatura_id) {
        await supabase
          .from("assinaturas")
          .update({ status: "cancelada", updated_at: new Date().toISOString() })
          .eq("id", pagamento.assinatura_id);
      }
    }

    return NextResponse.json({ ok: true, event });
  } catch (err) {
    console.error("[asaas-webhook]", err);
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
