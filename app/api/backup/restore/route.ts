import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const ORDEM_RESTORE: string[] = [
  "fazendas", "produtores", "pessoas",
  "anos_safra", "matriculas_imoveis", "talhoes", "depositos",
  "maquinas", "bombas_combustivel", "funcionarios", "contas_bancarias",
  "grupos_insumo", "subgrupos_insumo", "insumos",
  "ciclos",
  "plantios", "colheitas", "pulverizacoes", "adubacoes_base", "correcoes_solo",
  "contratos", "contrato_itens",
  "lancamentos",
  "estoque_itens", "movimentacoes_estoque",
  "pedidos_compra", "pedidos_compra_itens",
  "nf_entradas", "nf_entrada_itens",
  "romaneios", "cargas_expedicao",
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

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({})) as {
    fazenda_id?: string;
    arquivo?: string;
    confirmacao?: string;
  };

  if (!body.fazenda_id) {
    return NextResponse.json({ error: "fazenda_id é obrigatório" }, { status: 400 });
  }
  if (!body.arquivo) {
    return NextResponse.json({ error: "Nome do arquivo é obrigatório" }, { status: 400 });
  }
  if (body.confirmacao !== "RESTAURAR") {
    return NextResponse.json({ error: "Confirmação incorreta. Digite RESTAURAR para confirmar." }, { status: 400 });
  }

  const fazendaId = body.fazenda_id;
  const admin = adminClient();

  // Baixar o arquivo do Storage
  const { data: fileData, error: downloadError } = await admin.storage
    .from("backups")
    .download(`${fazendaId}/${body.arquivo}`);

  if (downloadError || !fileData) {
    return NextResponse.json(
      { error: `Erro ao baixar backup: ${downloadError?.message ?? "arquivo não encontrado"}` },
      { status: 404 }
    );
  }

  let backup: { metadata: { fazenda_id: string }; dados: Record<string, unknown[]> };
  try {
    backup = JSON.parse(await fileData.text());
  } catch {
    return NextResponse.json({ error: "Arquivo de backup inválido ou corrompido" }, { status: 400 });
  }

  // Garantir que o backup pertence a esta fazenda
  if (backup.metadata?.fazenda_id && backup.metadata.fazenda_id !== fazendaId) {
    return NextResponse.json({ error: "Este backup pertence a outra fazenda" }, { status: 403 });
  }

  // Upsert em cada tabela na ordem correta
  const resultados: Record<string, { restaurados: number; erro?: string }> = {};
  let totalRestaurados = 0;

  for (const tabela of ORDEM_RESTORE) {
    const registros = backup.dados?.[tabela];
    if (!registros || registros.length === 0) {
      resultados[tabela] = { restaurados: 0 };
      continue;
    }
    try {
      const LOTE = 500;
      let restaurados = 0;
      for (let i = 0; i < registros.length; i += LOTE) {
        const { error } = await admin
          .from(tabela)
          .upsert(registros.slice(i, i + LOTE) as object[], { onConflict: "id" });
        if (error) throw new Error(error.message);
        restaurados += LOTE;
      }
      resultados[tabela] = { restaurados };
      totalRestaurados += restaurados;
    } catch (e) {
      resultados[tabela] = { restaurados: 0, erro: String(e) };
    }
  }

  // Log (ignora erro se tabela não existir ainda)
  await admin.from("backup_logs").insert({
    fazenda_id:      fazendaId,
    arquivo:         body.arquivo,
    total_registros: totalRestaurados,
    tamanho_bytes:   0,
    status:          "restaurado",
  }).select().maybeSingle();

  const tabelasComErro = Object.entries(resultados).filter(([, v]) => v.erro).map(([t]) => t);

  return NextResponse.json({
    sucesso:           tabelasComErro.length === 0,
    total_restaurados: totalRestaurados,
    tabelas:           resultados,
    avisos:            tabelasComErro.length > 0
      ? `Falha em: ${tabelasComErro.join(", ")}. Demais tabelas restauradas.`
      : undefined,
  });
}
