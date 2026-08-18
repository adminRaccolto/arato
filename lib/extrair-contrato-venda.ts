import Anthropic from "@anthropic-ai/sdk";

export interface ContratoVendaExtraido {
  // Identificação
  numero_contrato?: string;
  data_contrato?: string;           // YYYY-MM-DD

  // Comprador
  comprador_nome?: string;
  comprador_cnpj?: string;
  comprador_ie?: string;            // inscrição estadual do comprador

  // Vendedor / Produtor
  vendedor_nome?: string;
  vendedor_cpf_cnpj?: string;
  vendedor_ie?: string;             // inscrição estadual do produtor

  // Produto e Safra
  produto?: string;                 // soja | milho | algodao | trigo | sorgo | outro
  safra?: string;                   // ex: "2025/2026"
  tipo_produto?: string;            // grão, semente, farelo, etc.

  // Preço
  moeda?: "BRL" | "USD";
  preco_referencia?: string;        // valor original como aparece no doc (ex: "R$ 120,00/sc")
  preco_por_saca?: number;          // sempre em R$ ou USD por saca de 60kg
  preco_por_tonelada?: number;      // se informado em toneladas
  modalidade?: string;              // FIXO | A_FIXAR | PREMIO | CPR | SPOT

  // Volume
  volume_original?: string;         // valor original como aparece (ex: "1.000 toneladas")
  volume_toneladas?: number;        // sempre converter para toneladas
  volume_sacas?: number;            // calculado: toneladas × 1000 / 60
  unidade_original?: string;        // "toneladas" | "sacas" | "kg" | "arrobas"

  // Logística e Entrega
  data_entrega_inicio?: string;     // YYYY-MM-DD — início do período de entrega
  data_entrega_fim?: string;        // YYYY-MM-DD — fim do período de entrega
  local_entrega?: string;           // porto, armazém, cidade
  frete?: string;                   // FOB | CIF | CIF_PORTO | outro
  destino?: "exportacao" | "mercado_interno";

  // Pagamento
  data_pagamento?: string;          // YYYY-MM-DD ou descrição (ex: "D+2 após entrega")
  prazo_pagamento?: string;         // prazo descritivo quando não tem data exata
  forma_pagamento?: string;         // TED, PIX, etc.

  // Retenções e Impostos
  retencoes: Array<{
    descricao: string;              // "Funrural", "SENAR", "CESSR", "Armazenagem", etc.
    percentual?: number;
    valor_fixo?: number;
    base_calculo?: string;          // "sobre valor bruto", "sobre frete", etc.
  }>;
  funrural_pct?: number;            // % Funrural se mencionado explicitamente
  senar_pct?: number;               // % SENAR se mencionado
  tem_retencao_imposto?: boolean;

  // Referência de mercado (para A Fixar)
  bolsa_referencia?: string;        // "CBOT", "B3", "Chicago", etc.
  mes_referencia?: string;          // mês de cotação para fixação

  // Condições gerais
  observacoes?: string;
  clausulas_especiais?: string[];   // penalidades, bonificações, condições de qualidade
}

const client = new Anthropic();

export async function extrairContratoVenda(pdfBase64: string): Promise<{ extraido: ContratoVendaExtraido; rawText: string }> {
  const prompt = `Você é especialista em contratos brasileiros de compra e venda de grãos agrícolas.
Analise o PDF em anexo e extraia os campos listados abaixo.

REGRA MAIS IMPORTANTE: Retorne SOMENTE um objeto JSON plano (flat), sem seções aninhadas.
Todos os campos devem estar diretamente na raiz do JSON. Nunca agrupe em subobjetos.

Campos a extrair (todos na raiz do JSON):

numero_contrato: número ou código do contrato (string; "Contrato nº", "Nº", "Ref.", "Nro", etc.)
data_contrato: data de assinatura/emissão em YYYY-MM-DD
comprador_nome: razão social completa de quem COMPRA o grão (trading, cerealista, cooperativa)
comprador_cnpj: CNPJ do comprador, só dígitos, sem pontuação
comprador_ie: Inscrição Estadual do comprador (próximo ao CNPJ do comprador)
vendedor_nome: nome/razão social de quem VENDE o grão (produtor rural, fazenda)
vendedor_cpf_cnpj: CPF ou CNPJ do vendedor, só dígitos, sem pontuação
vendedor_ie: Inscrição Estadual do PRODUTOR (separada da IE do comprador)
produto: padronizar como uma dessas opções: "soja", "milho", "algodao", "trigo", "sorgo", "feijao", "outro"
safra: formato "AAAA/AAAA" (ex: "2025/2026") — inferir do contexto se não explícito
tipo_produto: "grao", "semente", "farelo", "oleo", etc.
moeda: "BRL" se R$/reais, "USD" se dólar/US$/USD
preco_referencia: valor exatamente como aparece no documento (ex: "R$ 120,00/sc")
preco_por_saca: número — valor por saca de 60kg (se estiver em toneladas, dividir por 16,667)
preco_por_tonelada: número — valor por tonelada se informado assim
modalidade: "FIXO" se preço definido, "A_FIXAR" se a fixar, "PREMIO" se baseado em prêmio, "SPOT" se pronto, "CPR" se cédula de produto rural
volume_original: exatamente como aparece (ex: "1.500 toneladas", "25.000 sacas")
unidade_original: "toneladas", "sacas", "kg" ou "arrobas"
volume_toneladas: número — SEMPRE converter para toneladas (sacas×60/1000; kg/1000; arrobas×15/1000)
volume_sacas: número — calcular: volume_toneladas × 1000 / 60 (arredondar 2 casas)
data_entrega_inicio: data mais cedo para entrega em YYYY-MM-DD
data_entrega_fim: data limite para entrega em YYYY-MM-DD
local_entrega: porto, armazém ou cidade de destino
frete: "FOB" (produtor entrega), "CIF" (comprador busca) ou descrição
destino: "exportacao" se menciona porto/exportação/embarque, "mercado_interno" nos demais casos
data_pagamento: data exata em YYYY-MM-DD quando especificada
prazo_pagamento: prazo descritivo quando não há data exata (ex: "D+2 após entrega")
forma_pagamento: TED, PIX, depósito, etc.
retencoes: array de objetos {descricao, percentual, valor_fixo, base_calculo} para Funrural, SENAR, CESSR, armazenagem, corretagem — array vazio [] se não houver
funrural_pct: número — % Funrural se citado (PF=1,5%; PJ=1,2%)
senar_pct: número — % SENAR se citado (normalmente 0,2%)
tem_retencao_imposto: true se há qualquer retenção de imposto mencionada
bolsa_referencia: "CBOT", "B3", "Chicago", etc. — apenas para contratos A Fixar
mes_referencia: mês de cotação para fixação (ex: "novembro/2025")
observacoes: condições de qualidade, umidade, impureza, pH, penalidades, descontos
clausulas_especiais: array de strings com outras cláusulas relevantes

Exemplo de JSON correto (PLANO, sem seções):
{
  "numero_contrato": "12345",
  "data_contrato": "2026-07-17",
  "comprador_nome": "NOME DA TRADING LTDA",
  "comprador_cnpj": "12345678000199",
  "produto": "milho",
  "safra": "2025/2026",
  "moeda": "BRL",
  "preco_por_saca": 44.50,
  "volume_sacas": 5000,
  "volume_toneladas": 300,
  "data_entrega_fim": "2026-08-15",
  "frete": "FOB",
  "destino": "mercado_interno",
  "retencoes": [],
  "clausulas_especiais": []
}

Omita campos não encontrados (não inclua null). Retorne apenas o JSON, sem texto adicional.`;

  const response = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 4096,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "document",
            source: {
              type: "base64",
              media_type: "application/pdf",
              data: pdfBase64,
            },
          },
          { type: "text", text: prompt },
        ],
      },
    ],
  });

  const rawText = response.content.find(b => b.type === "text")?.text ?? "";

  // Extrai JSON do texto — tenta bloco entre ``` primeiro, depois busca { }
  let jsonStr = "{}";
  const fenced = rawText.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced) {
    jsonStr = fenced[1].trim();
  } else {
    const braced = rawText.match(/\{[\s\S]*\}/);
    if (braced) jsonStr = braced[0];
  }

  try {
    const rawParsed = JSON.parse(jsonStr) as Record<string, unknown>;

    // Fallback: se o modelo ainda retornou JSON aninhado por seção,
    // achatamos tudo para que o frontend encontre os campos na raiz.
    const knownFields = new Set([
      "numero_contrato","data_contrato","comprador_nome","comprador_cnpj","comprador_ie",
      "vendedor_nome","vendedor_cpf_cnpj","vendedor_ie","produto","safra","tipo_produto",
      "moeda","preco_referencia","preco_por_saca","preco_por_tonelada","modalidade",
      "volume_original","volume_toneladas","volume_sacas","unidade_original",
      "data_entrega_inicio","data_entrega_fim","local_entrega","frete","destino",
      "data_pagamento","prazo_pagamento","forma_pagamento",
      "retencoes","funrural_pct","senar_pct","tem_retencao_imposto",
      "bolsa_referencia","mes_referencia","observacoes","clausulas_especiais",
    ]);

    // Detecta se o root tem campos conhecidos ou apenas sub-objetos com campos conhecidos
    const rootKeys = Object.keys(rawParsed);
    const hasKnownAtRoot = rootKeys.some(k => knownFields.has(k));

    if (!hasKnownAtRoot && rootKeys.length > 0) {
      // Todos os valores são objetos (seções) — achatar
      const flat: Record<string, unknown> = {};
      for (const [, v] of Object.entries(rawParsed)) {
        if (typeof v === "object" && v !== null && !Array.isArray(v)) {
          Object.assign(flat, v);
        }
      }
      // Se ainda não encontrou campos conhecidos, tenta um nível mais fundo
      const flatKeys = Object.keys(flat);
      const hasKnownInFlat = flatKeys.some(k => knownFields.has(k));
      if (!hasKnownInFlat) {
        for (const [, v2] of Object.entries(flat)) {
          if (typeof v2 === "object" && v2 !== null && !Array.isArray(v2)) {
            Object.assign(flat, v2);
          }
        }
      }
      Object.assign(rawParsed, flat);
    }

    const extraido = rawParsed as unknown as ContratoVendaExtraido;
    if (!Array.isArray(extraido.retencoes)) extraido.retencoes = [];
    if (extraido.comprador_cnpj) extraido.comprador_cnpj = String(extraido.comprador_cnpj).replace(/\D/g, "");
    if (extraido.vendedor_cpf_cnpj) extraido.vendedor_cpf_cnpj = String(extraido.vendedor_cpf_cnpj).replace(/\D/g, "");
    return { extraido, rawText };
  } catch {
    return { extraido: { retencoes: [] } as ContratoVendaExtraido, rawText };
  }
}
