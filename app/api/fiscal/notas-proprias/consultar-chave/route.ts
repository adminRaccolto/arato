// POST /api/fiscal/notas-proprias/consultar-chave
// Consulta uma NF-e na SEFAZ por chave de acesso e devolve os dados pra
// preencher o formulário de Nota Própria de Outro Sistema (Seção 316) —
// documento onde o cliente é o emitente mas foi autorizado fora do Arato.
//
// Reaproveita consultarNfePorChave (lib/sefaz-consulta.ts, mesma usada em
// NF de Produtos) e parseNFeXml (lib/sieg.ts) pra extrair os itens — sem
// nenhum efeito colateral (não cria fornecedor, não grava pendência; essa
// rota só lê e devolve).
import { NextRequest, NextResponse } from "next/server";
import { consultarNfePorChave } from "../../../../../lib/sefaz-consulta";
import { parseNFeXml } from "../../../../../lib/sieg";

export async function POST(req: NextRequest) {
  try {
    const { chave, fazenda_id, ambiente } = await req.json() as {
      chave: string; fazenda_id: string; ambiente?: "producao" | "homologacao";
    };
    if (!chave || !fazenda_id) {
      return NextResponse.json({ ok: false, erro: "Informe a chave de acesso e a fazenda." }, { status: 400 });
    }

    const res = await consultarNfePorChave(chave, fazenda_id, ambiente ?? "producao");
    if (!res.ok || !res.xmlCompleto) {
      return NextResponse.json({ ok: false, erro: res.erro || res.xMotivo || "Não foi possível consultar essa chave na SEFAZ." });
    }

    const parsed = parseNFeXml(res.xmlCompleto);
    if (!parsed) {
      return NextResponse.json({ ok: false, erro: "A SEFAZ respondeu, mas o XML não pôde ser interpretado." });
    }

    return NextResponse.json({
      ok: true,
      numero: parsed.numero,
      serie: parsed.serie,
      chave: parsed.chave,
      data_emissao: parsed.data_emissao,
      natureza: parsed.natureza,
      cnpj_emitente: parsed.cnpj_emitente,
      nome_emitente: parsed.nome_emitente,
      cnpj_destinatario: parsed.cnpj_destinatario,
      nome_destinatario: parsed.nome_destinatario,
      valor_total: parsed.valor_total,
      itens: parsed.itens.map(it => ({
        descricao: it.descricao, unidade: it.unidade, quantidade: it.quantidade,
        valor_unitario: it.valor_unitario, valor_total: it.valor_total,
      })),
      xml_content: res.xmlCompleto,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Erro ao consultar a chave na SEFAZ.";
    return NextResponse.json({ ok: false, erro: msg }, { status: 500 });
  }
}
