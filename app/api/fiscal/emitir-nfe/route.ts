/**
 * POST /api/fiscal/emitir-nfe
 * Recebe os dados da NF-e do frontend, executa build→sign→transmit e retorna resultado.
 */

import { NextRequest, NextResponse } from "next/server";
import { emitirNFe } from "../../../../lib/nfe/index";
import { resolverModuloKey } from "../../../../lib/nfe/resolver-emitente";
import type { NFeInput } from "../../../../lib/nfe/builder";
import { validateFazendaAccess } from "../../../../lib/api-auth";

export const runtime = "nodejs"; // xml-crypto e node-forge precisam de Node

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as {
      fazenda_id: string;
      modulo_key: string;   // "fiscal_pf_xxx" ou "fiscal_emp_yyy" — escolha explícita (ex: seletor de emitente na tela)
      cpf_cnpj_hint?: string; // CPF/CNPJ do titular fiscal real da operação — tem prioridade sobre modulo_key
                              // quando informado (ex: devolução/remessa: o produtor dono da NF de origem, não
                              // "o primeiro módulo fiscal que aparecer", que é arbitrário numa fazenda com vários
                              // emitentes configurados — ver lib/nfe/resolver-emitente.ts).
      emit_ie_override?: string;  // IE específica do produtor (quando tem múltiplas IEs)
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
      fin_nfe?: "1" | "2" | "3" | "4";  // 1=normal, 2=complementar, 3=ajuste, 4=devolução
    };

    if (!body.fazenda_id || !body.itens?.length) {
      return NextResponse.json({ erro: "Campos obrigatórios ausentes" }, { status: 400 });
    }
    // modulo_key é opcional — buscarConfEmitente tem fallback por CPF/cert quando vazio

    const auth = await validateFazendaAccess(body.fazenda_id, req.headers.get("authorization") ?? undefined);
    if (!auth.ok) return NextResponse.json({ erro: auth.error }, { status: auth.status });

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
      finNFe:   body.fin_nfe ?? "1",
    };

    // cpf_cnpj_hint (quando informado) tem prioridade sobre modulo_key — é o titular fiscal real
    // da operação, mais confiável que "o primeiro módulo que a tela encontrou". Sem hint, respeita
    // o modulo_key explícito de quem chamou (ex: seletor de emitente da tela de NF-e); só cai no
    // default da fazenda se nenhum dos dois vier preenchido.
    let moduloKey = body.modulo_key || "";
    if (body.cpf_cnpj_hint) {
      try { moduloKey = await resolverModuloKey(body.fazenda_id, body.cpf_cnpj_hint) || moduloKey; } catch { /* mantém modulo_key */ }
    }
    if (!moduloKey) {
      try { moduloKey = await resolverModuloKey(body.fazenda_id, undefined); } catch { /* buscarConfEmitente ainda tenta o fallback interno dela */ }
    }
    const resultado = await emitirNFe(body.fazenda_id, moduloKey, input, body.emit_ie_override);

    return NextResponse.json(resultado, { status: resultado.sucesso ? 200 : 422 });
  } catch (err) {
    console.error("[emitir-nfe]", err);
    return NextResponse.json({ erro: String(err) }, { status: 500 });
  }
}
