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
import { consultarNfePorChave, baixarXmlNfePorChaveDFe } from "../../../../../lib/sefaz-consulta";
import { parseNFeXml } from "../../../../../lib/sieg";
import { exigirAcessoFazenda } from "../../../../../lib/api-auth";

export async function POST(req: NextRequest) {
  try {
    const { chave, fazenda_id, ambiente } = await req.json() as {
      chave: string; fazenda_id: string; ambiente?: "producao" | "homologacao";
    };
    if (!chave || !fazenda_id) {
      return NextResponse.json({ ok: false, erro: "Informe a chave de acesso e a fazenda." }, { status: 400 });
    }
    const negado = await exigirAcessoFazenda(req, fazenda_id);
    if (negado) return negado;

    const res = await consultarNfePorChave(chave, fazenda_id, ambiente ?? "producao");
    if (!res.ok) {
      return NextResponse.json({ ok: false, erro: res.erro || res.xMotivo || "Não foi possível consultar essa chave na SEFAZ." });
    }
    // A consulta de situação só confirma o protocolo (não traz o XML). O XML completo vem da Distribuição DF-e.
    let xmlCompleto = res.xmlCompleto;
    if (!xmlCompleto) {
      const dfe = await baixarXmlNfePorChaveDFe(chave, fazenda_id, ambiente ?? "producao");
      if (dfe.ok) xmlCompleto = dfe.xml;
    }
    if (!xmlCompleto) {
      // Sem XML: preenche o que a própria chave informa (UF, mês, CNPJ, série, número) e avisa
      const c = chave.replace(/\D/g, "");
      const doc14 = c.substring(6, 20);
      return NextResponse.json({
        ok: true,
        numero: String(parseInt(c.substring(25, 34), 10)),
        serie: String(parseInt(c.substring(22, 25), 10)),
        chave: c,
        cnpj_emitente: doc14.startsWith("000") ? doc14.slice(3) : doc14,
        aviso: `A SEFAZ confirmou: ${res.xMotivo ?? "NF-e autorizada"}. Mas ela não entrega o XML da nota nesta consulta, então só número, série, chave e CNPJ do emitente foram preenchidos (emissão em ${c.substring(4, 6)}/20${c.substring(2, 4)}). Complete data, valor, destinatário e itens, ou use a aba XML com o arquivo da nota.`,
      });
    }
    res.xmlCompleto = xmlCompleto;

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
