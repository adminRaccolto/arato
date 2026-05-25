// Cron diário — controle de assinaturas e inadimplência
// Vercel Cron: 0 11 * * * (8h BRT = 11h UTC)
// Ações:
//   1. Assinaturas trial expiradas → marcar inadimplente na conta
//   2. Pagamentos vencidos há +3 dias → marcar conta inadimplente
//   3. Contas ativas sem assinatura recente → verificar
//   4. Gerar próximas cobranças (D-3 antes do vencimento) via Asaas

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { criarCobranca, buscarPixQrCode } from "../../../../lib/asaas";

const CNPJ_EMITENTE = "49578526000142"; // Raccolto Consultoria — emissora das faturas

function sb() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

function autorizado(req: NextRequest) {
  const auth = req.headers.get("authorization");
  const secret = process.env.CRON_SECRET;
  if (!secret) return true; // dev local
  return auth === `Bearer ${secret}`;
}

function hoje() { return new Date().toISOString().split("T")[0]; }
function addDias(d: number) {
  const dt = new Date();
  dt.setDate(dt.getDate() + d);
  return dt.toISOString().split("T")[0];
}

export async function GET(req: NextRequest) {
  if (!autorizado(req)) return NextResponse.json({ ok: false }, { status: 401 });

  const supabase = sb();
  const log: string[] = [];

  // IDs de contas Pro Bono — nunca cobrar, nunca bloquear
  const { data: contasProBono } = await supabase
    .from("contas")
    .select("id")
    .eq("status", "pro_bono");
  const idsProBono = new Set((contasProBono ?? []).map(c => c.id));

  // ─── 1. Trials expirados → inadimplente ─────────────────────────────────
  const { data: trialsExpirados } = await supabase
    .from("assinaturas")
    .select("id, conta_id, plano_id, preco, asaas_customer_id")
    .eq("status", "trial")
    .lt("trial_fim", hoje());

  for (const ass of trialsExpirados ?? []) {
    if (idsProBono.has(ass.conta_id)) { log.push(`[trial-exp] ${ass.conta_id} → pro bono, ignorado`); continue; }
    // Verifica se já tem pagamento pendente para este período
    const { data: pagExistente } = await supabase
      .from("pagamentos")
      .select("id")
      .eq("assinatura_id", ass.id)
      .in("status", ["pendente", "pago"])
      .gte("data_vencimento", addDias(-7))
      .maybeSingle();

    if (!pagExistente) {
      // Marca assinatura como inadimplente
      await supabase.from("assinaturas").update({ status: "inadimplente" }).eq("id", ass.id);
      await supabase.from("contas").update({ status: "inadimplente" }).eq("id", ass.conta_id);

      // Gera cobrança no Asaas se tiver customer
      if (ass.asaas_customer_id && process.env.ASAAS_API_KEY) {
        try {
          const venc = addDias(3);
          const pag = await criarCobranca({
            customer: ass.asaas_customer_id,
            billingType: "PIX",
            value: ass.preco,
            dueDate: venc,
            description: `Arato — Mensalidade (trial expirado)`,
            externalReference: ass.conta_id,
          });

          let pixQrCode: string | null = null;
          try {
            const pix = await buscarPixQrCode(pag.id);
            pixQrCode = pix.payload;
          } catch { /* QR code pode demorar */ }

          await supabase.from("pagamentos").insert({
            assinatura_id: ass.id,
            conta_id: ass.conta_id,
            valor: ass.preco,
            status: "pendente",
            data_vencimento: venc,
            metodo_pagamento: "pix",
            asaas_payment_id: pag.id,
            asaas_invoice_url: pag.invoiceUrl,
            asaas_pix_qrcode: pixQrCode,
            descricao: `Arato — 1ª mensalidade após trial`,
          });

          log.push(`[trial-exp] ${ass.conta_id} → inadimplente, cobrança ${pag.id}`);
        } catch (e) {
          log.push(`[trial-exp] ${ass.conta_id} → erro Asaas: ${e}`);
        }
      } else {
        log.push(`[trial-exp] ${ass.conta_id} → inadimplente (sem Asaas)`);
      }
    }
  }

  // ─── 2. Pagamentos vencidos há +3 dias → conta inadimplente ──────────────
  const { data: pagsVencidos } = await supabase
    .from("pagamentos")
    .select("id, conta_id, assinatura_id")
    .eq("status", "pendente")
    .lt("data_vencimento", addDias(-3));

  for (const p of pagsVencidos ?? []) {
    if (idsProBono.has(p.conta_id)) { log.push(`[vencido] ${p.conta_id} → pro bono, ignorado`); continue; }
    await supabase.from("pagamentos").update({ status: "vencido" }).eq("id", p.id);
    await supabase.from("contas").update({ status: "inadimplente" }).eq("id", p.conta_id);
    if (p.assinatura_id) {
      await supabase.from("assinaturas").update({ status: "inadimplente" }).eq("id", p.assinatura_id);
    }
    log.push(`[vencido] pagamento ${p.id} → conta ${p.conta_id} inadimplente`);
  }

  // ─── 3. Gerar próximas cobranças (D-3) ───────────────────────────────────
  const emTresDias = addDias(3);
  const { data: assParaCobrar } = await supabase
    .from("assinaturas")
    .select("id, conta_id, plano_id, preco, asaas_customer_id, data_proximo_pagamento")
    .eq("status", "ativa")
    .eq("data_proximo_pagamento", emTresDias);

  for (const ass of assParaCobrar ?? []) {
    if (idsProBono.has(ass.conta_id)) { log.push(`[D-3] ${ass.conta_id} → pro bono, ignorado`); continue; }
    // Verifica se já existe cobrança para este período
    const { data: existe } = await supabase
      .from("pagamentos")
      .select("id")
      .eq("assinatura_id", ass.id)
      .eq("data_vencimento", ass.data_proximo_pagamento!)
      .maybeSingle();

    if (!existe && ass.asaas_customer_id && process.env.ASAAS_API_KEY) {
      try {
        const pag = await criarCobranca({
          customer: ass.asaas_customer_id,
          billingType: "PIX",
          value: ass.preco,
          dueDate: ass.data_proximo_pagamento!,
          description: `Arato — Mensalidade`,
          externalReference: ass.conta_id,
        });

        let pixQrCode: string | null = null;
        try {
          const pix = await buscarPixQrCode(pag.id);
          pixQrCode = pix.payload;
        } catch { /* ok */ }

        await supabase.from("pagamentos").insert({
          assinatura_id: ass.id,
          conta_id: ass.conta_id,
          valor: ass.preco,
          status: "pendente",
          data_vencimento: ass.data_proximo_pagamento!,
          metodo_pagamento: "pix",
          asaas_payment_id: pag.id,
          asaas_invoice_url: pag.invoiceUrl,
          asaas_pix_qrcode: pixQrCode,
          descricao: `Arato — Mensalidade`,
        });

        log.push(`[D-3] ${ass.conta_id} → cobrança ${pag.id} gerada`);
      } catch (e) {
        log.push(`[D-3] ${ass.conta_id} → erro: ${e}`);
      }
    }
  }

  // ─── 4. Enviar alertas de pagamento por e-mail ───────────────────────────
  if (process.env.RESEND_API_KEY) {
    // Pagamentos vencendo HOJE
    const { data: pagHoje } = await supabase
      .from("pagamentos")
      .select("conta_id, valor, asaas_invoice_url, asaas_pix_qrcode, contas(nome, email_contato)")
      .eq("status", "pendente")
      .eq("data_vencimento", hoje());

    for (const p of (pagHoje ?? []) as (typeof pagHoje extends (infer T)[] | null ? T : never)[]) {
      const c = p as unknown as { conta_id: string; valor: number; asaas_invoice_url: string | null; asaas_pix_qrcode: string | null; contas: { nome: string; email_contato: string } | null };
      if (!c.contas?.email_contato) continue;
      try {
        await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.RESEND_API_KEY}` },
          body: JSON.stringify({
            from: process.env.RESEND_FROM ?? "noreply@arato.agr.br",
            to: [c.contas.email_contato],
            subject: `Arato — Mensalidade vence hoje`,
            html: `<h2>Olá, ${c.contas.nome}!</h2>
<p>Sua mensalidade do Arato no valor de <strong>R$ ${c.valor.toFixed(2).replace(".", ",")}</strong> vence <strong>hoje</strong>.</p>
${c.asaas_invoice_url ? `<p><a href="${c.asaas_invoice_url}" style="background:#1A4870;color:#fff;padding:10px 20px;border-radius:8px;text-decoration:none;font-weight:bold;">Pagar agora →</a></p>` : ""}
${c.asaas_pix_qrcode ? `<p>Ou use o PIX copia e cola:<br><code style="background:#f4f4f4;padding:8px;display:block;word-break:break-all">${c.asaas_pix_qrcode}</code></p>` : ""}
<p style="color:#666;font-size:12px;">Emitente: Raccolto Consultoria e Treinamentos LTDA — CNPJ ${CNPJ_EMITENTE.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5")}</p>`,
          }),
        });
      } catch { /* email não é crítico */ }
    }
  }

  if (log.some(l => l.includes("erro"))) {
    console.error("[cron/cobranca] erros encontrados:", log.filter(l => l.includes("erro")));
  }

  // ─── 5. Registrar no log ─────────────────────────────────────────────────
  try {
    await supabase.from("logs_sistema").insert({
      tipo: "cron_cobranca",
      descricao: `Cron cobrança: ${trialsExpirados?.length ?? 0} trials exp, ${pagsVencidos?.length ?? 0} vencidos, ${assParaCobrar?.length ?? 0} D-3`,
      dados: { log, emTresDias, hoje: hoje() },
      created_at: new Date().toISOString(),
    });
  } catch { /* tabela pode não existir */ }

  return NextResponse.json({ ok: true, log, total: log.length });
}
