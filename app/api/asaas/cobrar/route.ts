// POST /api/asaas/cobrar — gera cobrança PIX avulsa para uma conta
// Usado pelo portal /pagamento e pelo painel admin
// Body: { conta_id, valor?, descricao?, metodo? }

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { criarCobranca, buscarPixQrCode } from "../../../../lib/asaas";

function sb() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

function addDias(d: number) {
  const dt = new Date();
  dt.setDate(dt.getDate() + d);
  return dt.toISOString().split("T")[0];
}

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try { body = await req.json(); }
  catch { return NextResponse.json({ ok: false, error: "Body inválido" }, { status: 400 }); }

  const conta_id = String(body.conta_id ?? "").trim();
  if (!conta_id) return NextResponse.json({ ok: false, error: "conta_id obrigatório" }, { status: 400 });

  const supabase = sb();

  // Busca assinatura ativa (ou inadimplente) da conta
  const { data: ass } = await supabase
    .from("assinaturas")
    .select("id, conta_id, plano_id, preco, asaas_customer_id")
    .eq("conta_id", conta_id)
    .in("status", ["ativa", "inadimplente", "trial"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!ass) {
    return NextResponse.json({ ok: false, error: "Nenhuma assinatura encontrada para esta conta" }, { status: 404 });
  }

  if (!ass.asaas_customer_id) {
    return NextResponse.json({ ok: false, error: "Conta sem customer Asaas. Configure a integração primeiro." }, { status: 422 });
  }

  if (!process.env.ASAAS_API_KEY) {
    return NextResponse.json({ ok: false, error: "Integração Asaas não configurada (ASAAS_API_KEY ausente)" }, { status: 503 });
  }

  const valor   = typeof body.valor === "number" ? body.valor : ass.preco;
  const metodo  = (body.metodo === "BOLETO" ? "BOLETO" : "PIX") as "PIX" | "BOLETO";
  const descricao = String(body.descricao ?? "Arato — Mensalidade");
  const venc    = addDias(3);

  try {
    const pag = await criarCobranca({
      customer: ass.asaas_customer_id,
      billingType: metodo,
      value: valor,
      dueDate: venc,
      description: descricao,
      externalReference: conta_id,
    });

    let pixQrCode: string | null = null;
    let pixQrCodeImg: string | null = null;
    if (metodo === "PIX") {
      try {
        const pix = await buscarPixQrCode(pag.id);
        pixQrCode    = pix.payload;
        pixQrCodeImg = pix.encodedImage;
      } catch { /* QR code pode demorar alguns segundos — ok */ }
    }

    // Registra no banco
    const { data: pagDb } = await supabase.from("pagamentos").insert({
      assinatura_id:     ass.id,
      conta_id:          ass.conta_id,
      valor,
      status:            "pendente",
      data_vencimento:   venc,
      metodo_pagamento:  metodo.toLowerCase(),
      asaas_payment_id:  pag.id,
      asaas_invoice_url: pag.invoiceUrl ?? null,
      asaas_pix_qrcode:  pixQrCode,
      descricao,
    }).select("id").single();

    return NextResponse.json({
      ok: true,
      pagamento_id:   pagDb?.id ?? null,
      asaas_id:       pag.id,
      invoice_url:    pag.invoiceUrl ?? null,
      boleto_url:     pag.bankSlipUrl ?? null,
      pix_payload:    pixQrCode,
      pix_qrcode_img: pixQrCodeImg,
      valor,
      data_vencimento: venc,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[api/asaas/cobrar]", msg);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
