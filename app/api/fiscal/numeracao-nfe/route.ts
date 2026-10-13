/**
 * POST /api/fiscal/numeracao-nfe
 * Devolve a série e o próximo número configurados em Parâmetros → Fiscal para o emitente
 * (e IE) que vai emitir — sem reservar nada. Usado pelas telas pra gravar o rascunho da
 * NF-e com a numeração real, e não com um número/série "1" inventado no navegador.
 */
import { NextRequest, NextResponse } from "next/server";
import { buscarConfEmitente } from "../../../../lib/nfe/index";
import { resolverModuloKey } from "../../../../lib/nfe/resolver-emitente";
import { validateFazendaAccess } from "../../../../lib/api-auth";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as {
      fazenda_id: string;
      modulo_key?: string;
      produtor_id_hint?: string;
      cpf_cnpj_hint?: string;
      emit_ie_override?: string;
    };
    if (!body.fazenda_id) return NextResponse.json({ erro: "fazenda_id obrigatório" }, { status: 400 });
    const auth = await validateFazendaAccess(body.fazenda_id, req.headers.get("authorization") ?? undefined);
    if (!auth.ok) return NextResponse.json({ erro: auth.error }, { status: auth.status });

    let moduloKey = body.modulo_key || "";
    if (body.produtor_id_hint || body.cpf_cnpj_hint) {
      try { moduloKey = await resolverModuloKey(body.fazenda_id, body.cpf_cnpj_hint, undefined, body.produtor_id_hint) || moduloKey; } catch { /* mantém modulo_key */ }
    }
    if (!moduloKey) {
      try { moduloKey = await resolverModuloKey(body.fazenda_id, undefined); } catch { /* sem módulo */ }
    }
    if (!moduloKey) return NextResponse.json({ serie: null, numero: null });

    let confg: Record<string, string> | null = null;
    try { confg = await buscarConfEmitente(body.fazenda_id, moduloKey, body.emit_ie_override); } catch { /* ambiguidade de IE etc. */ }
    const serie = parseInt(confg?.serie_nfe ?? "", 10);
    const numero = parseInt(String(confg?.numero_inicial ?? ""), 10);
    return NextResponse.json({
      serie: Number.isNaN(serie) ? null : String(serie),
      numero: Number.isNaN(numero) ? null : numero,
    });
  } catch (err) {
    return NextResponse.json({ erro: String(err) }, { status: 500 });
  }
}
