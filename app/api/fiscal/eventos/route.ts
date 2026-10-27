import { exigirAcessoRegistro } from "../../../../lib/api-auth";
import { type SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "../../../../lib/supabase-servidor";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { cancelarNFeEmitida, corrigirNFeEmitida } from "../../../../lib/nfe/index";
import { resolverModuloKeyPorCpfCnpj, resolverModuloKeyFiscal } from "../../../../lib/nfe/resolver-emitente";

export const runtime = "nodejs"; // lib/nfe usa node-forge, precisa de Node
export const dynamic = "force-dynamic";

/** Desfaz o lançamento de uma NF de devolução de compra cuja NF-e foi cancelada. Devolve a mensagem de aviso, se houver. */
async function reverterDevolucaoCompra(adm: SupabaseClient, nfDevId: string): Promise<string | undefined> {
  const avisos: string[] = [];
  // 1) estoque: a devolução deu SAÍDA; cancelar devolve a quantidade ao insumo
  const { data: movs } = await adm.from("movimentacoes_estoque").select("id, insumo_id, quantidade, tipo").eq("nf_entrada_id", nfDevId);
  for (const m of (movs ?? []) as { id: string; insumo_id: string | null; quantidade: number; tipo: string }[]) {
    if (!m.insumo_id) continue;
    const { data: ins } = await adm.from("insumos").select("estoque").eq("id", m.insumo_id).maybeSingle();
    if (!ins) continue;
    const delta = m.tipo === "saida" ? Number(m.quantidade) : -Number(m.quantidade);
    await adm.from("insumos").update({ estoque: (Number((ins as { estoque: number | null }).estoque) || 0) + delta }).eq("id", m.insumo_id);
  }
  if (movs?.length) await adm.from("movimentacoes_estoque").delete().eq("nf_entrada_id", nfDevId);
  // 2) título a receber do fornecedor — só some se ainda estiver em aberto
  const { data: crs } = await adm.from("lancamentos").select("id, status, valor").eq("nf_entrada_id", nfDevId);
  for (const cr of (crs ?? []) as { id: string; status: string; valor: number }[]) {
    if (["em_aberto", "vencido", "vencendo"].includes(cr.status)) await adm.from("lancamentos").delete().eq("id", cr.id);
    else avisos.push(`o título a receber da devolução (R$ ${Number(cr.valor).toFixed(2)}) já foi baixado: estorne a baixa e exclua-o`);
  }
  // 3) itens da devolução saem (libera o saldo devolvido na NF de origem) e a NF de devolução fica cancelada
  await adm.from("nf_entrada_itens").delete().eq("nf_entrada_id", nfDevId);
  await adm.from("nf_entradas").update({ status: "cancelada" }).eq("id", nfDevId);
  avisos.push("custos de Apropriação Direta ligados a abastecimento ou manutenção de máquina que a devolução tinha reduzido NÃO são restaurados automaticamente — confira se houver");
  return avisos.length ? `Devolução desfeita no sistema; atenção: ${avisos.join("; ")}.` : undefined;
}

// Eventos de NF-e já autorizada (Cancelamento e Carta de Correção) pro Fiscal
// → Monitor de Notas Emitidas — até 23/09/2026 "Cancelar NF-e" nessa tela era
// simulado (só um alert(), nada era transmitido de verdade) e não existia
// opção nenhuma de Carta de Correção. Achado real do dono.
export async function POST(request: NextRequest) {
  const adm = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
  try {
    const body = await request.json() as {
      acao: "cancelar" | "carta_correcao";
      nota_id: string;
      justificativa?: string;
      correcao?: string;
    };
    const { acao, nota_id } = body;
    if (!acao || !nota_id) {
      return NextResponse.json({ ok: false, error: "acao e nota_id são obrigatórios" }, { status: 400 });
    }
    const negado = await exigirAcessoRegistro(request, "notas_fiscais", nota_id);
    if (negado) return negado;

    const { data: nota, error: errNota } = await adm.from("notas_fiscais").select("*").eq("id", nota_id).single();
    if (errNota || !nota) {
      return NextResponse.json({ ok: false, error: "NF-e não encontrada" }, { status: 404 });
    }
    if (!nota.chave_acesso) {
      return NextResponse.json({ ok: false, error: "Esta NF-e não tem chave de acesso (não foi transmitida de verdade à SEFAZ)" }, { status: 422 });
    }

    const fazendaId = nota.fazenda_id as string;
    const dj = (nota.dados_nf_json ?? {}) as Record<string, unknown>;
    const emitCnpj = String(dj.emit_cnpj ?? "").replace(/\D/g, "");

    let moduloKey = emitCnpj ? await resolverModuloKeyPorCpfCnpj(fazendaId, emitCnpj, adm) : null;
    if (!moduloKey) moduloKey = await resolverModuloKeyFiscal(fazendaId, adm);
    if (!moduloKey) {
      return NextResponse.json({ ok: false, error: "Configuração fiscal do emitente não encontrada — confira Parâmetros → Fiscal." }, { status: 422 });
    }

    if (acao === "cancelar") {
      const protocolo = String(dj.protocolo_autorizacao ?? "");
      if (!protocolo) {
        return NextResponse.json({ ok: false, error: "Protocolo de autorização não encontrado nesta NF-e — cancelamento exige o protocolo original." }, { status: 422 });
      }
      const justificativa = (body.justificativa ?? "").trim();
      if (justificativa.length < 15) {
        return NextResponse.json({ ok: false, error: "Justificativa precisa ter pelo menos 15 caracteres (exigência da SEFAZ)." }, { status: 400 });
      }
      const resultado = await cancelarNFeEmitida(fazendaId, moduloKey, nota.chave_acesso, protocolo, justificativa);
      if (resultado.sucesso) {
        await adm.from("notas_fiscais").update({
          status: "cancelada",
          dados_nf_json: { ...dj, cancelamento_protocolo: resultado.protocoloEvento, cancelamento_justificativa: justificativa, cancelamento_data: new Date().toISOString() },
        }).eq("id", nota_id);
      }
      // NF-e de DEVOLUÇÃO de compra cancelada na SEFAZ: desfaz a devolução no sistema (estoque, título a receber do
      // fornecedor e o saldo devolvido dos itens), para o saldo voltar a poder ser devolvido com a NF-e correta.
      let avisoDevolucao: string | undefined;
      const devId = dj.devolucao_nf_entrada_id as string | undefined;
      if (resultado.sucesso && devId) {
        try { avisoDevolucao = await reverterDevolucaoCompra(adm, devId); }
        catch (e) { avisoDevolucao = `A NF-e foi cancelada, mas não consegui desfazer a devolução no sistema (${e instanceof Error ? e.message : String(e)}). Estorne-a manualmente.`; }
      }
      // NF-e de transferência de máquina cancelada: a remessa cancelada cancela a movimentação; o retorno cancelado
      // devolve a movimentação a "emitida" (aguardando novo retorno). Antes a transferência seguia "emitida" com a NF
      // cancelada.
      if (resultado.sucesso && nota.chave_acesso) {
        await adm.from("transferencias_maquinas").update({ status: "cancelada" }).eq("nf_saida_chave", nota.chave_acesso).neq("direcao", "entrada");
        await adm.from("transferencias_maquinas").update({
          status: "emitida", nf_retorno_chave: null, nf_retorno_numero: null, nf_retorno_protocolo: null, nf_retorno_data: null,
        }).eq("nf_retorno_chave", nota.chave_acesso);
      }
      return NextResponse.json({ ok: resultado.sucesso, cStat: resultado.cStat, xMotivo: resultado.xMotivo, protocolo: resultado.protocoloEvento, aviso: avisoDevolucao });
    }

    if (acao === "carta_correcao") {
      const correcao = (body.correcao ?? "").trim();
      if (correcao.length < 15) {
        return NextResponse.json({ ok: false, error: "Texto da correção precisa ter pelo menos 15 caracteres (exigência da SEFAZ)." }, { status: 400 });
      }
      // Sequência: nunca reaproveita número, mesmo que uma tentativa anterior tenha sido rejeitada.
      const { data: anteriores } = await adm.from("nfe_cartas_correcao").select("sequencia")
        .eq("chave_acesso", nota.chave_acesso).order("sequencia", { ascending: false }).limit(1);
      const proximaSeq = ((anteriores?.[0]?.sequencia as number | undefined) ?? 0) + 1;

      const resultado = await corrigirNFeEmitida(fazendaId, moduloKey, nota.chave_acesso, correcao, proximaSeq);
      await adm.from("nfe_cartas_correcao").insert({
        nota_id, fazenda_id: fazendaId, chave_acesso: nota.chave_acesso, sequencia: proximaSeq,
        texto_correcao: correcao, status: resultado.sucesso ? "aceita" : "rejeitada",
        cstat: resultado.cStat, xmotivo: resultado.xMotivo, protocolo_evento: resultado.protocoloEvento,
      });
      return NextResponse.json({ ok: resultado.sucesso, cStat: resultado.cStat, xMotivo: resultado.xMotivo, protocolo: resultado.protocoloEvento, sequencia: proximaSeq });
    }

    return NextResponse.json({ ok: false, error: `Ação '${acao}' desconhecida` }, { status: 400 });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

// Histórico de CC-e's já emitidas pra uma NF-e (pra tela mostrar antes de emitir outra)
export async function GET(request: NextRequest) {
  const adm = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
  const notaId = request.nextUrl.searchParams.get("nota_id");
  if (!notaId) return NextResponse.json({ ok: false, error: "nota_id obrigatório" }, { status: 400 });
  { const negado = await exigirAcessoRegistro(request, "notas_fiscais", notaId); if (negado) return negado; }
  const { data, error } = await adm.from("nfe_cartas_correcao").select("*").eq("nota_id", notaId).order("sequencia", { ascending: true });
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, correcoes: data ?? [] });
}
