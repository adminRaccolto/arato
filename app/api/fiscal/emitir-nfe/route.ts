/**
 * POST /api/fiscal/emitir-nfe
 * Recebe os dados da NF-e do frontend, executa build→sign→transmit e retorna resultado.
 */

import { NextRequest, NextResponse } from "next/server";
import { emitirNFe } from "../../../../lib/nfe/index";
import type { NFeInput } from "../../../../lib/nfe/builder";

export const runtime = "nodejs"; // xml-crypto e node-forge precisam de Node

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as {
      fazenda_id: string;
      modulo_key: string;   // "fiscal_pf_xxx" ou "fiscal_emp_yyy"
      destinatario: {
        nome: string;
        cpf_cnpj?: string;
        ie?: string;
        logradouro?: string;
        numero?: string;
        bairro?: string;
        municipio_ibge?: string;
        municipio_nome?: string;
        uf?: string;
        cep?: string;
        email?: string;
        telefone?: string;
      };
      itens: Array<{
        descricao: string;
        ncm: string;
        cfop: string;
        unidade: string;
        quantidade: number;
        valor_unitario: number;
        valor_desconto?: number;
      }>;
      natureza: string;
      inf_cpl?: string;
      frete?: "0" | "1" | "2" | "9";
      nfe_ref?: string;
      tipo?: "0" | "1";
    };

    if (!body.fazenda_id || !body.modulo_key || !body.itens?.length) {
      return NextResponse.json({ erro: "Campos obrigatórios ausentes" }, { status: 400 });
    }

    const input: Omit<NFeInput, "emitente"> = {
      destinatario: body.destinatario,
      itens: body.itens.map((item, i) => ({
        codigo:        String(i + 1).padStart(4, "0"),
        descricao:     item.descricao,
        ncm:           item.ncm.replace(/\D/g, ""),
        cfop:          item.cfop.replace(/\D/g, ""),
        unidade:       item.unidade,
        quantidade:    item.quantidade,
        valor_unitario: item.valor_unitario,
        valor_desconto: item.valor_desconto,
      })),
      natureza: body.natureza,
      infCpl:   body.inf_cpl,
      frete:    body.frete ?? "9",
      nfe_ref:  body.nfe_ref,
      tipo:     body.tipo ?? "1",
    };

    const resultado = await emitirNFe(body.fazenda_id, body.modulo_key, input);

    return NextResponse.json(resultado, { status: resultado.sucesso ? 200 : 422 });
  } catch (err) {
    console.error("[emitir-nfe]", err);
    return NextResponse.json({ erro: String(err) }, { status: 500 });
  }
}
