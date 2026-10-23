/**
 * GET /api/cron/sieg-auto
 * Sincronização automática com o SIEG: NF-e (entrada) e NFS-e de todas as contas com CPF/CNPJ configurado
 * em Configurações → Integrações → Sieg (configuracoes_modulo, modulo "sieg").
 *
 * Por que existe: a rota antiga (/api/cron/sieg-sync) lê outra tabela (configuracoes_automacao) onde só há
 * 1 registro, desativado — na prática NENHUMA conta sincronizava sozinha; só quando alguém abria a tela e
 * clicava em sincronizar. Esta rota usa a MESMA lógica da sincronização manual (chama as mesmas rotas),
 * então importa como NF de entrada "pendente" (sem estoque nem financeiro até alguém processar).
 *
 * Uma fazenda por conta (a que tem a sincronização mais recente — a que o cliente realmente usa): as
 * rotas já buscam duplicatas em todas as fazendas da conta pela chave de acesso. Contas mais atrasadas
 * primeiro; se o tempo acabar, o resto continua na rodada seguinte.
 */
import { createClient } from "../../../../lib/supabase-servidor";
import { NextRequest, NextResponse } from "next/server";
import { CABECALHO_INTERNO, chaveInterna } from "../../../../lib/api-auth";

export const runtime = "nodejs";
export const maxDuration = 300;

const ORCAMENTO_MS = 250_000;

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ erro: "Não autorizado" }, { status: 401 });
  }
  const inicio = Date.now();
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

  const { data: rows, error } = await db.from("configuracoes_modulo").select("fazenda_id, conta_id, config").eq("modulo", "sieg");
  if (error) return NextResponse.json({ erro: error.message }, { status: 500 });

  type Cfg = { cnpjs_destino?: string[]; cnpj_destino?: string; ultima_sync_ts?: string };
  const porConta = new Map<string, { fazenda_id: string; ts: string }>();
  for (const r of rows ?? []) {
    const c = (r.config ?? {}) as Cfg;
    const temDoc = (Array.isArray(c.cnpjs_destino) && c.cnpjs_destino.length > 0) || !!c.cnpj_destino;
    if (!temDoc) continue;
    const chave = (r.conta_id as string | null) ?? (r.fazenda_id as string);
    const ts = c.ultima_sync_ts ?? "";
    const atual = porConta.get(chave);
    if (!atual || ts > atual.ts) porConta.set(chave, { fazenda_id: r.fazenda_id as string, ts });
  }
  const fila = [...porConta.values()].sort((a, b) => a.ts.localeCompare(b.ts));

  const origem = req.nextUrl.origin;
  const resumo: { fazenda_id: string; nfe?: unknown; nfse?: unknown; erro?: string }[] = [];
  let processadas = 0;
  for (const item of fila) {
    if (Date.now() - inicio > ORCAMENTO_MS) break;
    const linha: (typeof resumo)[number] = { fazenda_id: item.fazenda_id };
    try {
      const r1 = await fetch(`${origem}/api/integracoes/sieg-sync`, {
        method: "POST", headers: { "Content-Type": "application/json", [CABECALHO_INTERNO]: chaveInterna() }, body: JSON.stringify({ fazenda_id: item.fazenda_id }),
      });
      linha.nfe = await r1.json().catch(() => ({ erro: `HTTP ${r1.status}` }));
      if (Date.now() - inicio <= ORCAMENTO_MS) {
        const r2 = await fetch(`${origem}/api/integracoes/sieg-sync-nfse`, {
          method: "POST", headers: { "Content-Type": "application/json", [CABECALHO_INTERNO]: chaveInterna() }, body: JSON.stringify({ fazenda_id: item.fazenda_id }),
        });
        linha.nfse = await r2.json().catch(() => ({ erro: `HTTP ${r2.status}` }));
      }
    } catch (e) {
      linha.erro = e instanceof Error ? e.message : String(e);
    }
    resumo.push(linha);
    processadas++;
  }
  console.log(`[sieg-auto] ${processadas}/${fila.length} contas`, JSON.stringify(resumo).slice(0, 1500));
  return NextResponse.json({ ok: true, contas: fila.length, processadas, pendentes_proxima_rodada: fila.length - processadas, resumo });
}
