import { NextResponse } from "next/server";
import { Resend } from "resend";
import { createClient } from "@supabase/supabase-js";

// ─── Segurança: só Vercel Cron pode chamar este endpoint ──────
// A Vercel injeta o header Authorization: Bearer <CRON_SECRET>
function autorizado(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true; // local sem secret → permite
  const auth = req.headers.get("authorization");
  return auth === `Bearer ${secret}`;
}

function resendClient() {
  return new Resend(process.env.RESEND_API_KEY);
}

// Admin Supabase — usa service role para ignorar RLS
function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

// ─── Tipos ────────────────────────────────────────────────────
type Alerta = {
  tipo: "cp" | "cr" | "arrendamento" | "certificado_a1";
  fazenda_id: string;
  fazenda_nome: string;
  email_destinatario: string;
  descricao: string;
  valor?: number;
  vencimento: string; // ISO date
  dias_restantes: number;
  urgencia: "critico" | "alto" | "medio";
};

const fmt = (v: number) => v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtData = (d: string) => new Date(d + "T12:00:00").toLocaleDateString("pt-BR");

function diasRestantes(dataVenc: string): number {
  const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
  const venc  = new Date(dataVenc + "T12:00:00");
  return Math.round((venc.getTime() - hoje.getTime()) / (1000 * 60 * 60 * 24));
}

function urgencia(dias: number): "critico" | "alto" | "medio" {
  if (dias <= 1)  return "critico";
  if (dias <= 3)  return "alto";
  return "medio";
}

// ─── Construtor de e-mail HTML ────────────────────────────────
function montarEmail(alertas: Alerta[], fazendaNome: string): string {
  const criticos = alertas.filter(a => a.urgencia === "critico");
  const altos    = alertas.filter(a => a.urgencia === "alto");
  const medios   = alertas.filter(a => a.urgencia === "medio");

  const corUrgencia = { critico: "#E24B4A", alto: "#EF9F27", medio: "#378ADD" };
  const labelUrgencia = { critico: "CRÍTICO — Vence hoje ou amanhã", alto: "ATENÇÃO — Vence em até 3 dias", medio: "AVISO — Vence em até 7 dias" };
  const labelTipo = { cp: "Conta a Pagar", cr: "Conta a Receber", arrendamento: "Arrendamento", certificado_a1: "Certificado A1" };

  function secao(lista: Alerta[], nivel: "critico" | "alto" | "medio") {
    if (lista.length === 0) return "";
    const cor = corUrgencia[nivel];
    const rows = lista.map(a => `
      <tr style="border-bottom:0.5px solid #EEF1F6;">
        <td style="padding:8px 12px;font-size:13px;color:#333;">${labelTipo[a.tipo]}</td>
        <td style="padding:8px 12px;font-size:13px;color:#1a1a1a;font-weight:600;">${a.descricao}</td>
        <td style="padding:8px 12px;font-size:13px;color:#1a1a1a;text-align:right;">${a.valor != null ? "R$ " + fmt(a.valor) : "—"}</td>
        <td style="padding:8px 12px;font-size:13px;text-align:center;">${fmtData(a.vencimento)}</td>
        <td style="padding:8px 12px;font-size:13px;text-align:center;font-weight:700;color:${cor};">${a.dias_restantes <= 0 ? "VENCIDO" : a.dias_restantes === 1 ? "Hoje" : `${a.dias_restantes} dias`}</td>
      </tr>`).join("");
    return `
      <div style="margin-bottom:20px;">
        <div style="background:${cor};color:#fff;padding:8px 14px;border-radius:8px 8px 0 0;font-size:12px;font-weight:700;letter-spacing:0.05em;">
          ${labelUrgencia[nivel]} (${lista.length})
        </div>
        <table style="width:100%;border-collapse:collapse;background:#fff;border:0.5px solid #DDE2EE;border-top:none;border-radius:0 0 8px 8px;overflow:hidden;">
          <thead>
            <tr style="background:#F3F6F9;">
              <th style="padding:7px 12px;font-size:11px;color:#888;text-align:left;font-weight:600;">Tipo</th>
              <th style="padding:7px 12px;font-size:11px;color:#888;text-align:left;font-weight:600;">Descrição</th>
              <th style="padding:7px 12px;font-size:11px;color:#888;text-align:right;font-weight:600;">Valor</th>
              <th style="padding:7px 12px;font-size:11px;color:#888;text-align:center;font-weight:600;">Vencimento</th>
              <th style="padding:7px 12px;font-size:11px;color:#888;text-align:center;font-weight:600;">Prazo</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>`;
  }

  return `
<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#F4F6FA;font-family:system-ui,sans-serif;">
  <div style="max-width:680px;margin:0 auto;padding:24px 16px;">
    <!-- Header -->
    <div style="background:#1A4870;border-radius:10px;padding:20px 24px;margin-bottom:20px;display:flex;align-items:center;justify-content:space-between;">
      <div>
        <div style="color:#fff;font-size:18px;font-weight:700;">Alertas de Vencimento</div>
        <div style="color:rgba(255,255,255,0.7);font-size:13px;margin-top:2px;">${fazendaNome} · ${new Date().toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long" })}</div>
      </div>
      <div style="background:rgba(255,255,255,0.15);border-radius:8px;padding:8px 14px;color:#fff;font-size:22px;font-weight:700;">${alertas.length}</div>
    </div>

    <!-- Alertas -->
    ${secao(criticos, "critico")}
    ${secao(altos, "alto")}
    ${secao(medios, "medio")}

    <!-- Footer -->
    <div style="text-align:center;color:#aaa;font-size:11px;margin-top:16px;">
      Enviado automaticamente pelo RacTech · Gestão Agrícola<br>
      Para gerenciar alertas, acesse Configurações → Automações
    </div>
  </div>
</body>
</html>`;
}

// ─── Handler principal ────────────────────────────────────────
export async function GET(req: Request) {
  if (!autorizado(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = adminClient();
  const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
  const em7 = new Date(hoje); em7.setDate(hoje.getDate() + 7);

  const isoHoje = hoje.toISOString().split("T")[0];
  const isoEm7  = em7.toISOString().split("T")[0];

  // ── Buscar fazendas e emails ──
  const { data: perfis } = await supabase
    .from("perfis")
    .select("fazenda_id, email, fazendas(nome)")
    .not("email", "is", null);

  if (!perfis || perfis.length === 0) {
    return NextResponse.json({ ok: true, enviados: 0, msg: "Nenhum perfil com email" });
  }

  // Agrupar por fazenda
  const fazendaMap: Record<string, { email: string; nome: string }[]> = {};
  for (const p of perfis) {
    const fid = p.fazenda_id as string;
    if (!fid) continue;
    if (!fazendaMap[fid]) fazendaMap[fid] = [];
    const nome = (p.fazendas as { nome?: string } | null)?.nome ?? "Fazenda";
    fazendaMap[fid].push({ email: p.email as string, nome });
  }

  let totalEnviados = 0;
  const erros: string[] = [];

  for (const [fazendaId, contatos] of Object.entries(fazendaMap)) {
    const fazendaNome = contatos[0].nome;
    const alertas: Alerta[] = [];

    // ── Contas a Pagar vencendo ──
    const { data: cpRows } = await supabase
      .from("contas_pagar")
      .select("id, descricao, valor, data_vencimento")
      .eq("fazenda_id", fazendaId)
      .eq("status", "aberto")
      .gte("data_vencimento", isoHoje)
      .lte("data_vencimento", isoEm7)
      .order("data_vencimento");

    for (const cp of cpRows ?? []) {
      const dias = diasRestantes(cp.data_vencimento);
      alertas.push({
        tipo: "cp",
        fazenda_id: fazendaId,
        fazenda_nome: fazendaNome,
        email_destinatario: contatos[0].email,
        descricao: cp.descricao ?? "Sem descrição",
        valor: cp.valor ?? 0,
        vencimento: cp.data_vencimento,
        dias_restantes: dias,
        urgencia: urgencia(dias),
      });
    }

    // ── Contas a Receber vencendo ──
    const { data: crRows } = await supabase
      .from("contas_receber")
      .select("id, descricao, valor, data_vencimento")
      .eq("fazenda_id", fazendaId)
      .eq("status", "aberto")
      .gte("data_vencimento", isoHoje)
      .lte("data_vencimento", isoEm7)
      .order("data_vencimento");

    for (const cr of crRows ?? []) {
      const dias = diasRestantes(cr.data_vencimento);
      alertas.push({
        tipo: "cr",
        fazenda_id: fazendaId,
        fazenda_nome: fazendaNome,
        email_destinatario: contatos[0].email,
        descricao: cr.descricao ?? "Sem descrição",
        valor: cr.valor ?? 0,
        vencimento: cr.data_vencimento,
        dias_restantes: dias,
        urgencia: urgencia(dias),
      });
    }

    // ── Arrendamentos vencendo ──
    const { data: arrRows } = await supabase
      .from("arrendamento_pagamentos")
      .select("id, data_vencimento, valor_previsto, sacas_previstas, commodity, arrendamentos(descricao)")
      .eq("fazenda_id", fazendaId)
      .eq("status", "pendente")
      .gte("data_vencimento", isoHoje)
      .lte("data_vencimento", isoEm7)
      .order("data_vencimento");

    for (const arr of arrRows ?? []) {
      const dias = diasRestantes(arr.data_vencimento);
      const arrObj = arr.arrendamentos as { descricao?: string } | null;
      const desc = arrObj?.descricao ?? "Arrendamento";
      const valor = arr.valor_previsto ?? (arr.sacas_previstas != null ? undefined : undefined);
      alertas.push({
        tipo: "arrendamento",
        fazenda_id: fazendaId,
        fazenda_nome: fazendaNome,
        email_destinatario: contatos[0].email,
        descricao: desc,
        valor: valor ?? undefined,
        vencimento: arr.data_vencimento,
        dias_restantes: dias,
        urgencia: urgencia(dias),
      });
    }

    // ── Certificado A1 vencendo (até 30 dias) ──
    const em30 = new Date(hoje); em30.setDate(hoje.getDate() + 30);
    const isoEm30 = em30.toISOString().split("T")[0];

    const { data: certRows } = await supabase
      .from("configuracoes")
      .select("cert_a1_vencimento")
      .eq("fazenda_id", fazendaId)
      .maybeSingle();

    const certVenc = (certRows as { cert_a1_vencimento?: string } | null)?.cert_a1_vencimento;
    if (certVenc && certVenc >= isoHoje && certVenc <= isoEm30) {
      const dias = diasRestantes(certVenc);
      if ([30, 15, 7, 1].some(d => dias <= d + 1 && dias >= d - 1) || dias <= 1) {
        alertas.push({
          tipo: "certificado_a1",
          fazenda_id: fazendaId,
          fazenda_nome: fazendaNome,
          email_destinatario: contatos[0].email,
          descricao: "Certificado Digital A1 — NF-e",
          vencimento: certVenc,
          dias_restantes: dias,
          urgencia: dias <= 7 ? (dias <= 1 ? "critico" : "alto") : "medio",
        });
      }
    }

    // ── Enviar e-mail se houver alertas ──
    if (alertas.length === 0) continue;

    const emails = [...new Set(contatos.map(c => c.email))];
    const html = montarEmail(alertas, fazendaNome);

    const criticos = alertas.filter(a => a.urgencia === "critico").length;
    const assunto = criticos > 0
      ? `🚨 ${criticos} alerta${criticos > 1 ? "s" : ""} crítico${criticos > 1 ? "s" : ""} — ${fazendaNome}`
      : `⚠️ ${alertas.length} alerta${alertas.length > 1 ? "s" : ""} de vencimento — ${fazendaNome}`;

    try {
      await resendClient().emails.send({
        from: process.env.RESEND_FROM ?? "alertas@ractech.com.br",
        to: emails,
        subject: assunto,
        html,
      });
      totalEnviados++;
    } catch (err) {
      erros.push(`Fazenda ${fazendaId}: ${String(err)}`);
    }
  }

  return NextResponse.json({
    ok: true,
    enviados: totalEnviados,
    erros: erros.length > 0 ? erros : undefined,
    ts: new Date().toISOString(),
  });
}
