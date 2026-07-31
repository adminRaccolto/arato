import { NextRequest, NextResponse } from "next/server";
import { criarCiotService, type DeclaracaoCIOT, type AmbienteCiot } from "../../../../lib/antt/ciot";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

type Body =
  | { acao: "declarar";  cnpjContratante: string; dados: DeclaracaoCIOT; ambiente?: AmbienteCiot }
  | { acao: "consultar"; cnpj: string; idOperacao: string; ambiente?: AmbienteCiot }
  | { acao: "encerrar";  cnpj: string; idOperacao: string; codigoVerificador: string; ambiente?: AmbienteCiot }
  | { acao: "cancelar";  cnpj: string; idOperacao: string; codigoVerificador: string; ambiente?: AmbienteCiot }
  | { acao: "consultar_frota"; cnpj: string; cnpjTransportador: string; ambiente?: AmbienteCiot };

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as Body;
    const ambiente = body.ambiente ?? "homologacao";
    const svc = criarCiotService(ambiente);

    switch (body.acao) {
      case "declarar": {
        const resultado = await svc.declarar(body.cnpjContratante, body.dados);

        // Se gerou com sucesso, persiste no banco
        if (resultado.Sucesso && resultado.Dados?.IdOperacaoTransporte) {
          const supabase = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_ROLE_KEY!,
            { auth: { autoRefreshToken: false, persistSession: false } }
          );
          // Salva na tabela ciots para rastreamento
          await supabase.from("ciots").insert({
            id_operacao:        resultado.Dados.IdOperacaoTransporte,
            codigo_verificador: resultado.Dados.CodigoVerificador,
            protocolo:          resultado.Dados.Protocolo,
            cpf_cnpj_contratante: body.cnpjContratante,
            cpf_cnpj_contratado:  body.dados.CpfCnpjContratado,
            valor_frete:          parseFloat(body.dados.ValorFrete),
            data_inicio:          body.dados.DataInicioViagem,
            data_fim:             body.dados.DataFimViagem,
            placa:                body.dados.Veiculos[0]?.Placa,
            ambiente,
            status:               "declarado",
          }).select().single();
        }

        return NextResponse.json(resultado);
      }

      case "consultar":
        return NextResponse.json(await svc.consultar(body.cnpj, body.idOperacao));

      case "encerrar": {
        const res = await svc.encerrar(body.cnpj, body.idOperacao, body.codigoVerificador);
        if (res.Sucesso) {
          const supabase = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_ROLE_KEY!,
            { auth: { autoRefreshToken: false, persistSession: false } }
          );
          await supabase.from("ciots").update({ status: "encerrado" }).eq("id_operacao", body.idOperacao);
        }
        return NextResponse.json(res);
      }

      case "cancelar": {
        const res = await svc.cancelar(body.cnpj, body.idOperacao, body.codigoVerificador);
        if (res.Sucesso) {
          const supabase = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_ROLE_KEY!,
            { auth: { autoRefreshToken: false, persistSession: false } }
          );
          await supabase.from("ciots").update({ status: "cancelado" }).eq("id_operacao", body.idOperacao);
        }
        return NextResponse.json(res);
      }

      case "consultar_frota":
        return NextResponse.json(await svc.consultarFrota(body.cnpj, body.cnpjTransportador));

      default:
        return NextResponse.json({ ok: false, error: "Ação inválida" }, { status: 400 });
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, Sucesso: false, Mensagem: msg, Erros: [msg] }, { status: 500 });
  }
}
