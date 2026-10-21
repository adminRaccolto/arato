/**
 * GET /api/cron/auditoria-consistencia — roda todo dia (vercel.json) e procura sinais de que o financeiro/fiscal
 * saiu de sincronia, ANTES de o usuário descobrir na tela:
 *   1. NF de entrada com a mesma chave de acesso mais de uma vez;
 *   2. título a pagar duplicado (mesma NF, mesmo valor, mesmo vencimento);
 *   3. baixa com valor pago acima do valor do título (mais juros/multa informados);
 *   4. espelho rel_lancamentos com quantidade diferente da origem (lancamentos / empresa_lancamentos).
 * Só avisa por e-mail quando algum número AUMENTOU em relação à última execução (a última fica em
 * arquivos/auditoria/ultima.json), para o aviso não repetir todo dia o que já é conhecido.
 */
import { NextResponse } from "next/server";
import { type SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "../../../../lib/supabase-servidor";
import { Resend } from "resend";
import { excedeLimiteBaixa } from "../../../../lib/financeiro/baixa";

export const runtime = "nodejs";
export const maxDuration = 120;

function autorizado(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return process.env.NODE_ENV !== "production";
  return req.headers.get("authorization") === `Bearer ${secret}`;
}

async function todas<T>(sb: SupabaseClient, tab: string, cols: string, filtro?: (q: any) => any): Promise<T[]> {
  let out: T[] = [];
  for (let from = 0; ; from += 1000) {
    let q = sb.from(tab).select(cols).order("id").range(from, from + 999);
    if (filtro) q = filtro(q);
    const { data, error } = await q;
    if (error) throw new Error(`${tab}: ${error.message}`);
    out = out.concat((data ?? []) as T[]);
    if (!data || data.length < 1000) break;
  }
  return out;
}

async function contar(sb: SupabaseClient, tab: string, filtro?: (q: any) => any): Promise<number> {
  let q = sb.from(tab).select("id", { count: "exact", head: true });
  if (filtro) q = filtro(q);
  const { count, error } = await q;
  if (error) throw new Error(`${tab}: ${error.message}`);
  return count ?? 0;
}

export async function GET(req: Request) {
  if (!autorizado(req)) return NextResponse.json({ ok: false, error: "não autorizado" }, { status: 401 });
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } });
  try {
    // 1) NF com chave repetida
    const nfs = await todas<{ id: string; chave_acesso: string | null; numero: string; emitente_nome: string | null; status: string }>(
      sb, "nf_entradas", "id,chave_acesso,numero,emitente_nome,status", q => q.not("chave_acesso", "is", null));
    const porChave = new Map<string, typeof nfs>();
    for (const n of nfs) porChave.set(n.chave_acesso!, [...(porChave.get(n.chave_acesso!) ?? []), n]);
    const gruposNf = [...porChave.values()].filter(a => a.length > 1);
    const nfDuplicadaProcessada = gruposNf.filter(a => a.filter(x => x.status === "processada").length > 1);

    // 2) título a pagar duplicado dentro da mesma NF
    const tits = await todas<{ id: string; nf_entrada_id: string; valor: number; data_vencimento: string | null; status: string; descricao: string | null }>(
      sb, "lancamentos", "id,nf_entrada_id,valor,data_vencimento,status,descricao",
      q => q.eq("tipo", "pagar").not("nf_entrada_id", "is", null).neq("status", "cancelado"));
    const porTit = new Map<string, typeof tits>();
    for (const t of tits) {
      const k = `${t.nf_entrada_id}|${Number(t.valor).toFixed(2)}|${t.data_vencimento ?? ""}`;
      porTit.set(k, [...(porTit.get(k) ?? []), t]);
    }
    const titDuplicados = [...porTit.values()].filter(a => a.length > 1);

    // 2b) título ainda ligado a NF PENDENTE (estornada): reprocessar a NF criaria outro título ao lado
    const statusNf = new Map(nfs.map(n => [n.id, n.status]));
    const titulosEmpresaNf = await todas<{ id: string; nf_entrada_id: string; status: string }>(
      sb, "empresa_lancamentos", "id,nf_entrada_id,status", q => q.not("nf_entrada_id", "is", null));
    const titulosOrfaos = tits.filter(t => statusNf.get(t.nf_entrada_id) === "pendente").length
      + titulosEmpresaNf.filter(t => statusNf.get(t.nf_entrada_id) === "pendente" && t.status !== "cancelado").length;

    // 3a) baixa acima do valor do título (pago > valor + multa + juros − desconto)
    const pagos = await todas<{ id: string; valor: number; moeda: string | null; cotacao_usd: number | null; valor_pago: number; valor_multa: number | null; valor_juros: number | null; valor_desconto: number | null }>(
      sb, "lancamentos", "id,valor,moeda,cotacao_usd,valor_pago,valor_multa,valor_juros,valor_desconto", q => q.gt("valor_pago", 0).neq("moeda", "barter"));
    const baixasAcima = pagos.filter(t => excedeLimiteBaixa(t, Number(t.valor_pago)));

    // 3) espelho rel_lancamentos x origem
    const [nLanc, nRelLanc, nEmp, nRelEmp] = await Promise.all([
      contar(sb, "lancamentos"),
      contar(sb, "rel_lancamentos", q => q.eq("origem_tabela", "lancamentos")),
      contar(sb, "empresa_lancamentos"),
      contar(sb, "rel_lancamentos", q => q.eq("origem_tabela", "empresa_lancamentos")),
    ]);

    const resumo = {
      nf_chave_repetida: gruposNf.length,
      nf_chave_repetida_processada_2x: nfDuplicadaProcessada.length,
      titulos_pagar_duplicados: titDuplicados.length,
      baixas_acima_do_valor: baixasAcima.length,
      titulos_ligados_a_nf_pendente: titulosOrfaos,
      espelho_lancamentos_diferenca: Math.abs(nLanc - nRelLanc),
      espelho_empresa_diferenca: Math.abs(nEmp - nRelEmp),
    };

    // compara com a última execução
    const arq = "auditoria/ultima.json";
    let anterior: Record<string, number> | null = null;
    try {
      const { data } = await sb.storage.from("arquivos").download(arq);
      if (data) anterior = JSON.parse(await data.text()).resumo ?? null;
    } catch { /* primeira execução */ }
    const pioraram = (Object.keys(resumo) as (keyof typeof resumo)[]).filter(k => resumo[k] > (anterior?.[k] ?? 0));
    await sb.storage.from("arquivos").upload(arq, Buffer.from(JSON.stringify({ em: new Date().toISOString(), resumo })), { upsert: true, contentType: "application/json" });

    let emailEnviado = false;
    if (anterior && pioraram.length && process.env.RESEND_API_KEY) {
      const linhas = pioraram.map(k => `<li><b>${k}</b>: ${anterior![k] ?? 0} → ${resumo[k]}</li>`).join("");
      await new Resend(process.env.RESEND_API_KEY).emails.send({
        from: process.env.RESEND_FROM ?? "alertas@ractech.com.br",
        to: process.env.AUDITORIA_EMAIL ?? "consultor@raccolto.com.br",
        subject: "Arato — auditoria de consistência: algo piorou",
        html: `<p>A auditoria diária encontrou aumento nestes pontos:</p><ul>${linhas}</ul><p>Detalhe: Financeiro → Conciliação → Verificar divergências, e Documentos Fiscais (NFs com chave repetida).</p>`,
      });
      emailEnviado = true;
    }
    return NextResponse.json({ ok: true, resumo, anterior, pioraram, emailEnviado,
      exemplos: { nf: gruposNf.slice(0, 5).map(a => a.map(x => `${x.numero}/${x.status}`)), titulos: titDuplicados.slice(0, 5).map(a => a[0].descricao) } });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
