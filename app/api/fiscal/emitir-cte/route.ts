/**
 * POST /api/fiscal/emitir-cte
 * Recebe os dados do CT-e, executa build → sign → transmit e retorna resultado.
 */

import { NextRequest, NextResponse } from "next/server";
import { emitirCTe } from "../../../../lib/cte/index";
import type { CTeInput } from "../../../../lib/cte/builder";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as {
      fazenda_id:         string;
      remetente:          CTeInput["remetente"];
      destinatario:       CTeInput["destinatario"];
      municipio_ini_ibge: string;
      municipio_ini_nome: string;
      uf_ini:             string;
      municipio_fim_ibge: string;
      municipio_fim_nome: string;
      uf_fim:             string;
      cfop:               string;
      natureza:           string;
      valor_prestacao:    number;
      valor_receber:      number;
      componentes:        CTeInput["componentes"];
      produto_descricao:  string;
      ncm?:               string;
      peso_bruto_kg:      number;
      peso_liquido_kg:    number;
      valor_mercadoria:   number;
      aliquota_icms:      number;
      veiculo_placa:      string;
      veiculo_renavam?:   string;
      motorista_nome:     string;
      motorista_cpf:      string;
      nfe_chave?:         string;
      tomador_tipo:       CTeInput["tomador_tipo"];
      observacao?:        string;
    };

    if (!body.fazenda_id || !body.remetente?.nome || !body.destinatario?.nome) {
      return NextResponse.json({ erro: "Campos obrigatórios ausentes" }, { status: 400 });
    }

    const input: Omit<CTeInput, "emitente"> = {
      remetente:          body.remetente,
      destinatario:       body.destinatario,
      municipio_ini_ibge: body.municipio_ini_ibge,
      municipio_ini_nome: body.municipio_ini_nome,
      uf_ini:             body.uf_ini,
      municipio_fim_ibge: body.municipio_fim_ibge,
      municipio_fim_nome: body.municipio_fim_nome,
      uf_fim:             body.uf_fim,
      cfop:               body.cfop,
      natureza:           body.natureza,
      valor_prestacao:    body.valor_prestacao,
      valor_receber:      body.valor_receber,
      componentes:        body.componentes ?? [{ nome: "Frete Peso", valor: body.valor_prestacao }],
      produto_descricao:  body.produto_descricao,
      ncm:                body.ncm,
      peso_bruto_kg:      body.peso_bruto_kg,
      peso_liquido_kg:    body.peso_liquido_kg,
      valor_mercadoria:   body.valor_mercadoria,
      aliquota_icms:      body.aliquota_icms ?? 12,
      veiculo_placa:      body.veiculo_placa,
      veiculo_renavam:    body.veiculo_renavam,
      motorista_nome:     body.motorista_nome,
      motorista_cpf:      body.motorista_cpf,
      nfe_chave:          body.nfe_chave,
      tomador_tipo:       body.tomador_tipo ?? "3",
      observacao:         body.observacao,
    };

    const resultado = await emitirCTe(body.fazenda_id, input);
    return NextResponse.json(resultado, { status: resultado.sucesso ? 200 : 422 });
  } catch (err) {
    console.error("[emitir-cte]", err);
    return NextResponse.json({ erro: String(err) }, { status: 500 });
  }
}
