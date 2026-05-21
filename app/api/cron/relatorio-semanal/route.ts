/**
 * GET /api/cron/relatorio-semanal
 * Cron toda segunda-feira às 10h UTC (7h BRT)
 *
 * Para cada fazenda ativa envia e-mail com:
 * - CP/CR a vencer na semana corrente
 * - Vencidos em atraso
 * - Saldo projetado da semana
 * - Preços de mercado (via /api/precos interno)
 * - Contratos ativos
 * - Operações de lavoura em andamento
 */

import { createClient } from "@supabase/supabase-js";
import { Resend }        from "resend";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

function sb() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

const fmtMoeda = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fmtData = (iso: string) => {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
};

export async function GET(req: NextRequest) {
  // Segurança: verifica header do Vercel Cron
  const auth = req.headers.get("authorization");
  const secret = process.env.CRON_SECRET;
  if (secret && auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = sb();
  const resendKey = process.env.RESEND_API_KEY;
  const fromAddr  = process.env.RESEND_FROM ?? "noreply@arato.agr.br";
  const appUrl    = process.env.NEXT_PUBLIC_APP_URL ?? "https://web.arato.agr.br";

  if (!resendKey) {
    return NextResponse.json({ ok: false, error: "RESEND_API_KEY não configurada" }, { status: 500 });
  }

  const resend = new Resend(resendKey);

  // Datas da semana corrente (segunda a domingo)
  const hoje   = new Date();
  const diaSemana = hoje.getDay(); // 0=dom, 1=seg ...
  const inicioSemana = new Date(hoje);
  inicioSemana.setDate(hoje.getDate() - (diaSemana === 0 ? 6 : diaSemana - 1));
  inicioSemana.setHours(0, 0, 0, 0);
  const fimSemana = new Date(inicioSemana);
  fimSemana.setDate(inicioSemana.getDate() + 6);
  fimSemana.setHours(23, 59, 59, 999);

  const isoInicio = inicioSemana.toISOString().slice(0, 10);
  const isoFim    = fimSemana.toISOString().slice(0, 10);
  const isoHoje   = hoje.toISOString().slice(0, 10);

  // Busca todas as fazendas ativas
  const { data: fazendas } = await supabase
    .from("fazendas")
    .select("id, nome, municipio, estado");

  if (!fazendas || fazendas.length === 0) {
    return NextResponse.json({ ok: true, enviados: 0, msg: "Nenhuma fazenda encontrada" });
  }

  let enviados = 0;

  for (const fazenda of fazendas) {
    // Destinatários da fazenda
    const { data: perfis } = await supabase
      .from("perfis")
      .select("nome, user_id")
      .eq("fazenda_id", fazenda.id);

    if (!perfis || perfis.length === 0) continue;

    // Busca e-mails reais via auth.users (service role)
    const { data: usersData } = await supabase.auth.admin.listUsers();
    const emailMap: Record<string, string> = {};
    for (const u of usersData?.users ?? []) {
      if (u.email) emailMap[u.id] = u.email;
    }
    const destinatarios = perfis
      .map(p => emailMap[p.user_id])
      .filter(Boolean) as string[];
    if (destinatarios.length === 0) continue;

    // ── CP/CR a vencer na semana ──────────────────────────────
    const { data: lancsSemana } = await supabase
      .from("lancamentos")
      .select("tipo, descricao, valor, data_vencimento, status")
      .eq("fazenda_id", fazenda.id)
      .in("tipo", ["cp", "cr"])
      .gte("data_vencimento", isoInicio)
      .lte("data_vencimento", isoFim)
      .neq("status", "pago")
      .order("data_vencimento");

    // ── Vencidos em atraso ────────────────────────────────────
    const { data: lancsAtraso } = await supabase
      .from("lancamentos")
      .select("tipo, descricao, valor, data_vencimento, status")
      .eq("fazenda_id", fazenda.id)
      .in("tipo", ["cp", "cr"])
      .lt("data_vencimento", isoHoje)
      .neq("status", "pago")
      .order("data_vencimento");

    // ── Saldo projetado ───────────────────────────────────────
    const crSemana = (lancsSemana ?? []).filter(l => l.tipo === "cr").reduce((s, l) => s + (l.valor ?? 0), 0);
    const cpSemana = (lancsSemana ?? []).filter(l => l.tipo === "cp").reduce((s, l) => s + (l.valor ?? 0), 0);
    const saldoProjetado = crSemana - cpSemana;

    // ── Contratos ativos ──────────────────────────────────────
    const { data: contratos } = await supabase
      .from("contratos")
      .select("numero, cultura, quantidade_sc, valor_unitario, status, comprador")
      .eq("fazenda_id", fazenda.id)
      .in("status", ["ativo", "confirmado", "parcialmente_entregue"])
      .limit(5);

    // ── Operações de lavoura em andamento ─────────────────────
    const { data: operacoes } = await supabase
      .from("plantios")
      .select("talhao_id, data_plantio, cultura")
      .eq("fazenda_id", fazenda.id)
      .order("data_plantio", { ascending: false })
      .limit(3);

    // ── Monta HTML do relatório ───────────────────────────────
    const linhaLanc = (l: { tipo: string; descricao: string; valor: number; data_vencimento: string }) => `
      <tr>
        <td style="padding:7px 12px;font-size:12px;color:#333;border-bottom:0.5px solid #eee;">${l.descricao ?? "—"}</td>
        <td style="padding:7px 12px;font-size:12px;text-align:right;font-weight:600;color:${l.tipo === "cr" ? "#16A34A" : "#E24B4A"};border-bottom:0.5px solid #eee;">${fmtMoeda(l.valor ?? 0)}</td>
        <td style="padding:7px 12px;font-size:12px;text-align:center;color:#555;border-bottom:0.5px solid #eee;">${fmtData(l.data_vencimento)}</td>
      </tr>`;

    const tabelaLancamentos = (lista: typeof lancsSemana, titulo: string, corBg: string, corBorda: string) => {
      if (!lista || lista.length === 0) return `<p style="font-size:12px;color:#888;padding:8px 0;">Nenhum lançamento</p>`;
      return `
        <div style="margin-bottom:20px;">
          <div style="font-size:11px;font-weight:700;color:#555;text-transform:uppercase;letter-spacing:0.05em;padding:8px 12px;background:${corBg};border-radius:6px 6px 0 0;border-top:2px solid ${corBorda};">${titulo} (${lista.length})</div>
          <table width="100%" cellpadding="0" cellspacing="0" style="border:0.5px solid #eee;border-top:none;border-radius:0 0 6px 6px;overflow:hidden;">
            <thead><tr style="background:#f9f9f9;">
              <th style="padding:6px 12px;font-size:11px;color:#888;text-align:left;font-weight:600;">Descrição</th>
              <th style="padding:6px 12px;font-size:11px;color:#888;text-align:right;font-weight:600;">Valor</th>
              <th style="padding:6px 12px;font-size:11px;color:#888;text-align:center;font-weight:600;">Vencimento</th>
            </tr></thead>
            <tbody>${lista.map(l => linhaLanc(l)).join("")}</tbody>
          </table>
        </div>`;
    };

    const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#F4F6FA;font-family:system-ui,-apple-system,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#F4F6FA;padding:32px 0;">
    <tr><td align="center">
      <table width="580" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;border:0.5px solid #DDE2EE;overflow:hidden;">

        <!-- Cabeçalho -->
        <tr>
          <td style="background:#1A4870;padding:22px 28px;">
            <div style="font-size:20px;font-weight:700;color:#fff;letter-spacing:-0.3px;">Arato</div>
            <div style="font-size:12px;color:rgba(255,255,255,0.6);margin-top:2px;">Relatório Semanal — ${fazenda.nome}</div>
          </td>
        </tr>

        <tr><td style="padding:24px 28px;">

          <!-- Período -->
          <div style="font-size:12px;color:#888;margin-bottom:18px;">
            Semana de <strong>${fmtData(isoInicio)}</strong> a <strong>${fmtData(isoFim)}</strong> · Gerado em ${new Date().toLocaleString("pt-BR")}
          </div>

          <!-- KPI cards -->
          <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
            <tr>
              <td width="33%" style="padding:0 6px 0 0;">
                <div style="background:#F4F6FA;border-radius:8px;border:0.5px solid #DDE2EE;padding:14px 16px;text-align:center;">
                  <div style="font-size:10px;color:#888;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:6px;">A receber (semana)</div>
                  <div style="font-size:18px;font-weight:700;color:#16A34A;">${fmtMoeda(crSemana)}</div>
                </div>
              </td>
              <td width="33%" style="padding:0 3px;">
                <div style="background:#F4F6FA;border-radius:8px;border:0.5px solid #DDE2EE;padding:14px 16px;text-align:center;">
                  <div style="font-size:10px;color:#888;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:6px;">A pagar (semana)</div>
                  <div style="font-size:18px;font-weight:700;color:#E24B4A;">${fmtMoeda(cpSemana)}</div>
                </div>
              </td>
              <td width="33%" style="padding:0 0 0 6px;">
                <div style="background:#F4F6FA;border-radius:8px;border:0.5px solid #DDE2EE;padding:14px 16px;text-align:center;">
                  <div style="font-size:10px;color:#888;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:6px;">Saldo projetado</div>
                  <div style="font-size:18px;font-weight:700;color:${saldoProjetado >= 0 ? "#16A34A" : "#E24B4A"};">${fmtMoeda(saldoProjetado)}</div>
                </div>
              </td>
            </tr>
          </table>

          <!-- Alertas de atraso -->
          ${(lancsAtraso ?? []).length > 0 ? `
          <div style="background:#FCEBEB;border:0.5px solid #E24B4A50;border-radius:8px;padding:10px 14px;margin-bottom:18px;font-size:12px;color:#791F1F;">
            <strong>⚠ ${lancsAtraso!.length} lançamento(s) em atraso</strong> — total ${fmtMoeda((lancsAtraso ?? []).reduce((s, l) => s + (l.valor ?? 0), 0))}
          </div>` : ""}

          <!-- Vencimentos da semana -->
          ${tabelaLancamentos(
            (lancsSemana ?? []).filter(l => l.tipo === "cr"),
            "Recebimentos da semana",
            "#F0FDF4", "#16A34A"
          )}
          ${tabelaLancamentos(
            (lancsSemana ?? []).filter(l => l.tipo === "cp"),
            "Pagamentos da semana",
            "#FEF2F2", "#E24B4A"
          )}
          ${(lancsAtraso ?? []).length > 0 ? tabelaLancamentos(lancsAtraso, "Em atraso", "#FEF3C7", "#D97706") : ""}

          <!-- Contratos ativos -->
          ${(contratos ?? []).length > 0 ? `
          <div style="margin-bottom:18px;">
            <div style="font-size:11px;font-weight:700;color:#555;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:8px;">Contratos ativos (${contratos!.length})</div>
            ${contratos!.map(c => `
              <div style="display:flex;justify-content:space-between;padding:7px 10px;border-bottom:0.5px solid #eee;font-size:12px;">
                <span style="color:#333;">${c.comprador ?? "—"} · ${c.cultura ?? "—"}</span>
                <span style="color:#1A4870;font-weight:600;">${c.quantidade_sc ? c.quantidade_sc + " sc" : "—"} · ${c.valor_unitario ? fmtMoeda(c.valor_unitario) + "/sc" : "—"}</span>
              </div>`).join("")}
          </div>` : ""}

          <!-- Botão acesso -->
          <table cellpadding="0" cellspacing="0" style="margin-top:24px;">
            <tr>
              <td style="background:#1A4870;border-radius:8px;">
                <a href="${appUrl}" style="display:inline-block;padding:12px 26px;font-size:13px;font-weight:600;color:#fff;text-decoration:none;">
                  Acessar o Arato →
                </a>
              </td>
            </tr>
          </table>

        </td></tr>

        <!-- Footer -->
        <tr>
          <td style="background:#F4F6FA;padding:14px 28px;border-top:0.5px solid #DDE2EE;">
            <p style="margin:0;font-size:11px;color:#aaa;">Arato · Gestão Agrícola · ${fazenda.municipio ?? ""} — ${fazenda.estado ?? ""}</p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;

    try {
      await resend.emails.send({
        from:    fromAddr,
        to:      destinatarios,
        subject: `Relatório Semanal — ${fazenda.nome} (${fmtData(isoInicio)} a ${fmtData(isoFim)})`,
        html,
      });
      enviados++;
    } catch { /* não bloqueia as demais fazendas */ }
  }

  return NextResponse.json({ ok: true, enviados, msg: `${enviados} e-mail(s) enviado(s)` });
}
