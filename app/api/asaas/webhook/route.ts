import { NextResponse } from "next/server";
import { createClient } from "../../../../lib/supabase-servidor";
import { statusAsaasParaLocal, buscarPagamento, ErroAsaas } from "../../../../lib/asaas";

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
  } else if (process.env.NODE_ENV === "production") {
    // Sem token configurado, qualquer um poderia avisar pagamento falso
    console.error("[asaas/webhook] ASAAS_WEBHOOK_TOKEN ausente: aviso recusado");
    return NextResponse.json({ ok: false, error: "Webhook não configurado" }, { status: 503 });
  }

  try {
    const body = await req.json();
    const event = body.event as string;
    const payment = body.payment;
    if (!event || !payment?.id) return NextResponse.json({ ok: false, error: "Payload inválido." }, { status: 400 });
    // O estado consultado evita que uma entrega atrasada sobrescreva o estado atual do provedor.
    let atual;
    try { atual = await buscarPagamento(payment.id); }
    catch (e) {
      if (event === "PAYMENT_DELETED" && e instanceof ErroAsaas && e.status === 404) atual = { ...payment, status: "REFUNDED" };
      else throw e;
    }
    const estado = atual as typeof atual & { paymentDate?: string; confirmedDate?: string; clientPaymentDate?: string };
    const statusLocal = event === "PAYMENT_DELETED" ? "cancelado" : statusAsaasParaLocal(estado.status);
    const data = estado.paymentDate ?? estado.confirmedDate ?? estado.clientPaymentDate;
    const { data: resultado, error } = await sb().rpc("asaas_processar_evento", {
      p_evento: { id: body.id ?? null, event, payment_id: payment.id, status_recebido: payment.status ?? null },
      p_status: statusLocal, p_data: typeof data === "string" && /^\d{4}-\d{2}-\d{2}/.test(data) ? data.slice(0,10) : null,
    });
    if (error) throw new Error(error.code === "PGRST202" ? "Execute a Seção 437 do supabase_migrations.sql para processar pagamentos." : error.message);
    if (!resultado?.ok) throw new Error("Evento não confirmado.");
    return NextResponse.json(resultado);
  } catch (err) {
    console.error("[asaas-webhook]", err instanceof Error ? err.message : String(err));
    return NextResponse.json({ ok: false, error: "Evento não confirmado. O provedor deve repetir a entrega." }, { status: 503 });
  }
}
