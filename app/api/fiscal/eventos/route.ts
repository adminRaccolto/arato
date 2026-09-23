import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { cancelarNFeEmitida, corrigirNFeEmitida } from "../../../../lib/nfe/index";
import { resolverModuloKeyPorCpfCnpj, resolverModuloKeyFiscal } from "../../../../lib/nfe/resolver-emitente";

export const runtime = "nodejs"; // lib/nfe usa node-forge, precisa de Node
export const dynamic = "force-dynamic";

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
      return NextResponse.json({ ok: resultado.sucesso, cStat: resultado.cStat, xMotivo: resultado.xMotivo, protocolo: resultado.protocoloEvento });
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
  const { data, error } = await adm.from("nfe_cartas_correcao").select("*").eq("nota_id", notaId).order("sequencia", { ascending: true });
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, correcoes: data ?? [] });
}
