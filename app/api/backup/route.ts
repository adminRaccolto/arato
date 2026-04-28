import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";

// ── Tabelas exportadas no backup (em ordem de dependência) ──────
const TABELAS: string[] = [
  "fazendas", "produtores", "pessoas", "matriculas_imoveis",
  "anos_safra", "ciclos", "talhoes", "depositos",
  "maquinas", "bombas_combustivel", "funcionarios", "contas_bancarias",
  "grupos_insumo", "subgrupos_insumo", "insumos",
  "plantios", "colheitas", "pulverizacoes", "adubacoes_base", "correcoes_solo",
  "contratos", "contrato_itens", "romaneios", "cargas_expedicao",
  "lancamentos",
  "estoque_itens", "movimentacoes_estoque",
  "pedidos_compra", "pedidos_compra_itens",
  "nf_entradas", "nf_entrada_itens",
  "arrendamentos", "arrendamento_matriculas", "arrendamento_pagamentos",
  "configuracoes_modulo", "regras_rateio",
  "orcamentos", "orcamento_itens",
];

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

// ── GET /api/backup?fazenda_id=xxx — lista backups ───────────────
export async function GET(req: NextRequest) {
  const fazendaId = req.nextUrl.searchParams.get("fazenda_id");
  if (!fazendaId) return NextResponse.json({ backups: [] });

  const admin = adminClient();
  const { data: arquivos, error } = await admin.storage
    .from("backups")
    .list(fazendaId, { limit: 50, sortBy: { column: "created_at", order: "desc" } });

  if (error) return NextResponse.json({ backups: [], erro: error.message });

  const backups = await Promise.all(
    (arquivos ?? [])
      .filter(f => f.name.endsWith(".json"))
      .map(async (f) => {
        const { data: urlData } = await admin.storage
          .from("backups")
          .createSignedUrl(`${fazendaId}/${f.name}`, 3600);
        return {
          nome: f.name,
          tamanho_bytes: f.metadata?.size ?? 0,
          criado_em: f.created_at,
          download_url: urlData?.signedUrl ?? null,
        };
      })
  );

  return NextResponse.json({ backups });
}

// ── POST /api/backup — cria backup ───────────────────────────────
export async function POST(req: Request) {
  // Aceita cron (Authorization header) ou chamada do cliente (body com fazenda_id)
  const authHeader = req.headers.get("authorization");
  const secret     = process.env.CRON_SECRET;
  const isCron     = secret ? authHeader === `Bearer ${secret}` : false;

  let fazendaId: string;

  if (isCron) {
    const body = await req.json().catch(() => ({})) as { fazenda_id?: string };
    if (!body.fazenda_id) {
      // Backup de todas as fazendas
      const admin = adminClient();
      const { data: fazendas } = await admin.from("fazendas").select("id");
      const resultados = [];
      for (const f of fazendas ?? []) {
        const res = await executarBackup(f.id);
        resultados.push({ fazenda_id: f.id, ...res });
      }
      return NextResponse.json({ resultados });
    }
    fazendaId = body.fazenda_id;
  } else {
    const body = await req.json().catch(() => ({})) as { fazenda_id?: string };
    if (!body.fazenda_id) {
      return NextResponse.json({ sucesso: false, erro: "fazenda_id é obrigatório" }, { status: 400 });
    }
    fazendaId = body.fazenda_id;
  }

  const resultado = await executarBackup(fazendaId);
  return NextResponse.json(resultado, { status: resultado.sucesso ? 200 : 500 });
}

// ── Executa o backup para uma fazenda ────────────────────────────
export async function executarBackup(fazendaId: string): Promise<{
  sucesso: boolean; arquivo: string; tabelas: Record<string, number>; erro?: string;
}> {
  const admin = adminClient();
  const dados: Record<string, unknown[]> = {};
  const contagens: Record<string, number> = {};

  for (const tabela of TABELAS) {
    try {
      let todos: unknown[] = [];
      let from = 0;
      const PAGE = 1000;
      while (true) {
        const { data, error } = await admin
          .from(tabela)
          .select("*")
          .eq("fazenda_id", fazendaId)
          .range(from, from + PAGE - 1);
        if (error) break;
        todos = todos.concat(data ?? []);
        if ((data?.length ?? 0) < PAGE) break;
        from += PAGE;
      }
      dados[tabela]     = todos;
      contagens[tabela] = todos.length;
    } catch {
      dados[tabela]     = [];
      contagens[tabela] = 0;
    }
  }

  const totalRegistros = Object.values(contagens).reduce((s, v) => s + v, 0);
  const backup = {
    metadata: {
      versao: "2.0",
      criado_em: new Date().toISOString(),
      fazenda_id: fazendaId,
      total_registros: totalRegistros,
      tabelas: contagens,
    },
    dados,
  };

  const json    = JSON.stringify(backup);
  const ts      = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const arquivo = `${ts}.json`;
  const caminho = `${fazendaId}/${arquivo}`;

  const { error: uploadError } = await admin.storage
    .from("backups")
    .upload(caminho, new Blob([json], { type: "application/json" }), { upsert: false });

  if (uploadError) {
    return { sucesso: false, arquivo: "", tabelas: contagens, erro: uploadError.message };
  }

  // Log (ignora erro se tabela não existir ainda)
  await admin.from("backup_logs").insert({
    fazenda_id:      fazendaId,
    arquivo,
    total_registros: totalRegistros,
    tamanho_bytes:   json.length,
    status:          "sucesso",
  }).select().maybeSingle();

  return { sucesso: true, arquivo, tabelas: contagens };
}
