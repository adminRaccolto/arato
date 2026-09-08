// API route: usa Claude Haiku para sugerir produtor_id para lançamentos CP sem produtor
import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { getSessionUser } from "../../../../../lib/api-auth";

const claude = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export interface LancamentoSemProdutor {
  id: string;
  descricao: string;
  categoria: string;
  data_vencimento: string;
  data_lancamento: string;
  valor: number;
  fornecedor_nome?: string;
  nfe_numero?: string;
}

export interface ProdutorOpcao {
  id: string;
  nome: string;
  cpf_cnpj?: string;
  fazenda_id: string;
  fazenda_nome?: string;
}

export interface Sugestao {
  lancamento_id: string;
  produtor_id: string | null;
  confianca: "alta" | "media" | "baixa" | "indeterminado";
  motivo: string;
}

export async function POST(req: NextRequest) {
  try {
    const user = await getSessionUser();
    if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

    const body = await req.json() as {
      fazenda_nome: string;
      lancamentos: LancamentoSemProdutor[];
      produtores: ProdutorOpcao[];
    };

    const { fazenda_nome, lancamentos, produtores } = body;

    if (!lancamentos?.length || !produtores?.length) {
      return NextResponse.json({ sugestoes: [] });
    }

    const produtoresStr = produtores
      .map(p => `  - ID: ${p.id} | Nome: ${p.nome}${p.cpf_cnpj ? ` | CPF/CNPJ: ${p.cpf_cnpj}` : ""}${p.fazenda_nome ? ` | Fazenda: ${p.fazenda_nome}` : ""}`)
      .join("\n");

    const lancamentosStr = lancamentos
      .map(l =>
        `  - ID: ${l.id} | Data: ${l.data_vencimento} | Valor: R$ ${l.valor.toFixed(2)} | Descrição: ${l.descricao} | Categoria: ${l.categoria}${l.fornecedor_nome ? ` | Fornecedor: ${l.fornecedor_nome}` : ""}${l.nfe_numero ? ` | NF: ${l.nfe_numero}` : ""}`
      )
      .join("\n");

    const prompt = `Você é um assistente especializado em contabilidade rural brasileira.

Tenho lançamentos de Contas a Pagar da fazenda "${fazenda_nome}" que estão sem o campo "produtor" preenchido.
Preciso que você analise cada lançamento e identifique qual produtor é o responsável.

PRODUTORES CADASTRADOS NESTA CONTA:
${produtoresStr}

LANÇAMENTOS SEM PRODUTOR (máx. 50):
${lancamentosStr}

INSTRUÇÕES:
- Analise descrição, categoria, fornecedor e data de cada lançamento
- Identifique o produtor mais provável com base no contexto
- Se o lançamento for de custeio agrícola (insumos, sementes, defensivos), associe ao produtor principal da fazenda
- Se a descrição mencionar explicitamente um nome de produtor ou CPF, use isso
- Se não houver como determinar com segurança, retorne produtor_id: null e confianca: "indeterminado"
- Retorne APENAS o JSON, sem texto adicional

FORMATO DE RESPOSTA (JSON array):
[
  {
    "lancamento_id": "<id do lançamento>",
    "produtor_id": "<id do produtor ou null>",
    "confianca": "alta" | "media" | "baixa" | "indeterminado",
    "motivo": "<explicação curta em português>"
  }
]`;

    const response = await claude.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 4096,
      messages: [{ role: "user", content: prompt }],
    });

    const text = response.content[0].type === "text" ? response.content[0].text : "";

    // Extrai JSON da resposta
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      return NextResponse.json({ error: "IA não retornou JSON válido." }, { status: 422 });
    }

    const sugestoes: Sugestao[] = JSON.parse(jsonMatch[0]);
    return NextResponse.json({ sugestoes });
  } catch (err) {
    console.error("[api/admin/cp-produtor/sugerir]", err);
    return NextResponse.json({ error: "Erro interno ao processar sugestões." }, { status: 500 });
  }
}
