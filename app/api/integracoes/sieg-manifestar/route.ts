/**
 * POST /api/integracoes/sieg-manifestar
 * Emite manifestação do destinatário via SIEG API v1 e atualiza status no banco.
 *
 * Body: { fazenda_id, nf_id, chave_acesso, cnpj_destinatario, tipo, justificativa? }
 * tipo: 0=Ciência 1=Confirmação 2=Desconhecimento 3=Não Realizada
 */

import { NextRequest, NextResponse }                     from "next/server";
import { createClient }                                   from "@supabase/supabase-js";
import { credenciaisEnv, credenciaisValidas, manifestarPorChave, TipoManifestacao } from "../../../../lib/sieg";

export const runtime = "nodejs";

const STATUS_LABEL: Record<number, string> = {
  0: "ciencia",
  1: "confirmada",
  2: "desconhecimento",
  3: "nao_realizada",
};

function sb() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as {
      fazenda_id:        string;
      nf_id:             string;
      chave_acesso:      string;
      cnpj_destinatario: string;
      tipo:              number;
      justificativa?:    string;
    };

    const { fazenda_id, nf_id, chave_acesso, cnpj_destinatario, tipo } = body;

    if (!fazenda_id || !nf_id || !chave_acesso || !cnpj_destinatario || tipo === undefined) {
      return NextResponse.json({ erro: "Campos obrigatórios ausentes" }, { status: 400 });
    }

    if (![0, 1, 2, 3].includes(tipo)) {
      return NextResponse.json({ erro: "tipo deve ser 0, 1, 2 ou 3" }, { status: 400 });
    }

    const creds = credenciaisEnv();
    if (!credenciaisValidas(creds)) {
      return NextResponse.json(
        { erro: "Credenciais SIEG incompletas. Configure SIEG_API_KEY, SIEG_SECRET_KEY e SIEG_CLIENTE_ID." },
        { status: 500 }
      );
    }

    const result = await manifestarPorChave(creds, {
      Chave:            chave_acesso,
      CnpjDestinatario: cnpj_destinatario.replace(/\D/g, ""),
      Manifestacao:     tipo as TipoManifestacao,
      Justificativa:    body.justificativa || undefined,
    });

    if (!result.ok) {
      return NextResponse.json(
        { erro: `SIEG recusou a manifestação: ${result.mensagem}`, sieg_status: result.httpStatus },
        { status: 502 }
      );
    }

    // Atualiza status no banco
    const novoStatus = STATUS_LABEL[tipo] ?? "manifestada";
    const db = sb();
    await db
      .from("nf_entradas")
      .update({
        status:              novoStatus,
        manifestacao_tipo:   tipo,
        manifestacao_data:   new Date().toISOString().slice(0, 10),
        manifestacao_msg:    result.mensagem,
      })
      .eq("id", nf_id)
      .eq("fazenda_id", fazenda_id);

    return NextResponse.json({
      sucesso:     true,
      status:      novoStatus,
      sieg_msg:    result.mensagem,
    });

  } catch (err) {
    console.error("[sieg-manifestar]", err);
    return NextResponse.json({ erro: String(err) }, { status: 500 });
  }
}
