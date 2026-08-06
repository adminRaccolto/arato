// Extração de pedidos de compra / orçamentos / cotações via Claude
// Usado pela API route web (add-on ia_pedido_compra)
import Anthropic from "@anthropic-ai/sdk";

const claude = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export interface PedidoCompraExtraido {
  // Fornecedor
  fornecedor_nome: string | null;
  fornecedor_cnpj: string | null;
  fornecedor_ie: string | null;
  // Identificação do documento
  tipo_documento: "orcamento" | "cotacao" | "pedido" | "proposta" | "nota_fiscal" | "outros" | null;
  numero_documento: string | null;         // nº do orçamento/pedido/cotação do fornecedor
  data_emissao: string | null;             // YYYY-MM-DD
  data_validade: string | null;            // YYYY-MM-DD — validade do orçamento
  data_entrega: string | null;             // YYYY-MM-DD — previsão de entrega
  // Pagamento
  condicao_pagamento: string | null;       // texto livre: "30/60 DDL", "à vista", etc.
  prazo_pagamento_dias: number | null;     // dias para vencimento a partir da data de emissão
  // Frete
  frete_valor: number | null;
  frete_tipo: string | null;               // "CIF", "FOB", "Pago", "A pagar", "Incluso"
  // Itens
  itens: {
    descricao: string;
    ncm?: string;
    unidade: string;
    quantidade: number;
    valor_unitario: number;
    valor_total: number;
  }[];
  // Totais
  valor_produtos: number | null;
  valor_total: number | null;
  // Observações
  observacao: string | null;
  // Confiança
  confianca: "alta" | "media" | "baixa";
}

const PROMPT = `Você é um especialista em leitura de orçamentos, cotações e pedidos de compra de insumos agrícolas brasileiros.

REGRAS OBRIGATÓRIAS:
- Use null para campos não encontrados. NUNCA invente dados.
- Datas: formato YYYY-MM-DD.
- Valores numéricos: sem formatação monetária (ex: 1500.00, não "R$ 1.500,00").
- Quantidades e preços: use ponto como separador decimal (ex: 1500.50).
- Sempre extraia TODOS os itens do documento.

CAMPOS A EXTRAIR:

1. fornecedor_nome: Razão social COMPLETA de quem emitiu o documento (vendedor/fornecedor).
   Procure em cabeçalho, rodapé, campos "Emitente", "Fornecedor", "Empresa".

2. fornecedor_cnpj: CNPJ do emitente, exatamente como escrito (ex: "00.360.305/0001-04").

3. fornecedor_ie: Inscrição Estadual do emitente, se informada. null se não encontrar.

4. tipo_documento: "orcamento" | "cotacao" | "pedido" | "proposta" | "nota_fiscal" | "outros"
   Identifique pelo título ou cabeçalho do documento.

5. numero_documento: Número do documento. Procure em "Nº", "Orçamento nº", "Pedido nº", "Cotação nº", número da NF, etc.

6. data_emissao: Data de emissão/geração do documento (YYYY-MM-DD).

7. data_validade: Validade do orçamento/cotação, se informada (YYYY-MM-DD). null se não informado.

8. data_entrega: Data prevista de entrega dos produtos, se informada (YYYY-MM-DD). null se não informado.

9. condicao_pagamento: Texto exato da condição de pagamento conforme o documento.
   Exemplos: "30 DDL", "À vista", "28 DDL", "30/60 DDL", "7/28/42 ddl".
   null se não informado.

10. prazo_pagamento_dias: Número de dias para o primeiro vencimento a partir da data de emissão.
    Exemplos: "30 DDL" → 30, "À vista" → 0, "7/28/42 ddl" → 7 (primeiro prazo), "28 ddl" → 28.
    null se não determinável.

11. frete_valor: Valor do frete em R$. 0 se frete grátis/incluso. null se não mencionado.

12. frete_tipo: "CIF" (incluso, entregue), "FOB" (por conta do comprador), "Incluso", "Pago", "A pagar", "Grátis".
    null se não mencionado.

13. itens: Array com TODOS os itens do documento.
    Para cada item extraia:
    - descricao: nome/descrição completa do produto ou serviço
    - ncm: código NCM se informado (string, ex: "31021010"), null se não informado
    - unidade: unidade de medida (ex: "kg", "L", "un", "sc", "t", "cx", "fardo", "ha")
    - quantidade: número (ex: 1000.0)
    - valor_unitario: preço por unidade (ex: 3.50)
    - valor_total: quantidade × valor_unitario (ex: 3500.00)

    IMPORTANTE: extraia TODOS os itens, mesmo que sejam muitos.
    Se o documento listar serviços (aplicação, transporte, etc.), inclua-os também.

14. valor_produtos: Subtotal dos produtos antes de frete/descontos. null se não encontrado.

15. valor_total: Valor total geral do documento. null se não encontrado.

16. observacao: Observações relevantes — condições especiais, garantias, especificações técnicas, validade, ANVISA, etc.
    null se não houver.

17. confianca:
    "alta" = extraiu fornecedor_nome + valor_total + pelo menos 1 item completo
    "media" = extraiu 2 desses critérios
    "baixa" = extraiu menos de 2

Retorne APENAS o JSON válido, sem texto adicional, sem markdown:
{
  "fornecedor_nome": null,
  "fornecedor_cnpj": null,
  "fornecedor_ie": null,
  "tipo_documento": null,
  "numero_documento": null,
  "data_emissao": null,
  "data_validade": null,
  "data_entrega": null,
  "condicao_pagamento": null,
  "prazo_pagamento_dias": null,
  "frete_valor": null,
  "frete_tipo": null,
  "itens": [],
  "valor_produtos": null,
  "valor_total": null,
  "observacao": null,
  "confianca": "baixa"
}`;

export async function extrairPedidoCompra(pdfBase64: string): Promise<PedidoCompraExtraido | null> {
  try {
    const response = await claude.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 4096,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "document",
              source: { type: "base64", media_type: "application/pdf", data: pdfBase64 },
            } as unknown as Anthropic.ContentBlockParam,
            { type: "text", text: PROMPT },
          ],
        },
      ],
    });

    const raw = response.content
      .filter(b => b.type === "text")
      .map(b => (b as Anthropic.TextBlock).text)
      .join("")
      .trim();

    const jsonStr = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
    return JSON.parse(jsonStr) as PedidoCompraExtraido;
  } catch (err) {
    console.error("[extrair-pedido-compra] erro:", err);
    return null;
  }
}
