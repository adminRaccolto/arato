/**
 * GET /api/cron/auditoria-consistencia — roda todo dia (vercel.json, 9h30 UTC = 6h30 BRT) o auditor "Saúde dos dados"
 * (lib/auditoria/saude): todas as regras em todas as contas, achados gravados em auditoria_achados e listados em
 * Admin → Saúde dos dados (só equipe Raccolto). Manda e-mail com o resumo de TUDO em aberto e dos novos do dia —
 * antes só avisava quando um contador aumentava, e o que já existia ficava parado sem ninguém ver.
 */
import { NextResponse } from "next/server";
import { Resend } from "resend";
import { createClient } from "../../../../lib/supabase-servidor";
import { executarAuditoria, nomeRegra } from "../../../../lib/auditoria/saude/executar";

export const runtime = "nodejs";
export const maxDuration = 300;

function autorizado(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return process.env.NODE_ENV !== "production";
  return req.headers.get("authorization") === `Bearer ${secret}`;
}

export async function GET(req: Request) {
  if (!autorizado(req)) return NextResponse.json({ ok: false, error: "não autorizado" }, { status: 401 });
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { autoRefreshToken: false, persistSession: false } });
  const r = await executarAuditoria(sb, "cron diário");
  let emailEnviado = false;
  if (process.env.RESEND_API_KEY) {
    const app = process.env.NEXT_PUBLIC_APP_URL ?? "https://web.arato.agr.br";
    const corpo = r.ok
      ? `<p><b>${r.abertos}</b> problema(s) em aberto · <b>${r.novos}</b> novo(s) hoje · ${r.resolvidos} resolvido(s) sozinho(s).</p>
         <ul>${Object.entries(r.por_regra).sort((a, b) => b[1] - a[1]).map(([k, n]) => `<li>${nomeRegra(k)}: ${n}</li>`).join("")}</ul>
         <p><a href="${app}/admin/saude-dados">Abrir Saúde dos dados</a></p>`
      : `<p>O auditor falhou: ${r.erro}</p>`;
    await new Resend(process.env.RESEND_API_KEY).emails.send({
      from: process.env.RESEND_FROM ?? "alertas@ractech.com.br",
      to: process.env.AUDITORIA_EMAIL ?? "consultor@raccolto.com.br",
      subject: r.ok ? `Arato — Saúde dos dados: ${r.abertos} em aberto${r.novos ? `, ${r.novos} novo(s)` : ""}` : "Arato — Saúde dos dados: falha na auditoria",
      html: corpo,
    }).then(() => { emailEnviado = true; }).catch(() => { /* e-mail é aviso; a auditoria já ficou gravada */ });
  }
  return NextResponse.json({ ...r, emailEnviado }, { status: r.ok ? 200 : 500 });
}
