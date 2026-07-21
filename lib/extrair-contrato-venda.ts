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
  const prompt = `Você é um especialista em contratos de compra e venda de grãos agrícolas brasileiros.
Analise o contrato em anexo e extraia TODOS os campos abaixo com máxima precisão.
Responda APENAS com JSON válido, sem texto adicional.

INSTRUÇÕES POR CAMPO:

IDENTIFICAÇÃO:
- numero_contrato: número ou código do contrato (pode estar como "Contrato nº", "Nº", "Ref.", etc.)
- data_contrato: data de assinatura/emissão — formato YYYY-MM-DD

COMPRADOR (quem COMPRA o grão — geralmente trading, cerealista, cooperativa):
- comprador_nome: razão social completa
- comprador_cnpj: CNPJ sem pontuação (apenas dígitos)
- comprador_ie: Inscrição Estadual do comprador — buscar em "IE", "Insc. Estadual", "I.E." próximo ao CNPJ do comprador

VENDEDOR/PRODUTOR (quem VENDE o grão — produtor rural, fazenda):
- vendedor_nome: nome completo ou razão social
- vendedor_cpf_cnpj: CPF ou CNPJ sem pontuação (apenas dígitos)
- vendedor_ie: Inscrição Estadual do PRODUTOR — buscar separadamente da IE do comprador

PRODUTO:
- produto: padronizar como: "soja", "milho", "algodao", "trigo", "sorgo", "feijao", "outro"
- safra: formato "AAAA/AAAA" (ex: "2025/2026") — inferir do contexto se não explícito
- tipo_produto: "grao", "semente", "farelo", "oleo", etc.

PREÇO:
- moeda: "BRL" se R$/reais, "USD" se dólar/US$/USD
- preco_referencia: valor EXATAMENTE como aparece no documento (ex: "R$ 120,00/sc")
- preco_por_saca: valor numérico por saca de 60kg (converter se necessário — se for por tonelada, dividir por 16,667)
- preco_por_tonelada: valor por tonelada se informado assim
- modalidade: "FIXO" se preço definido, "A_FIXAR" se a fixar/fixação pendente, "PREMIO" se baseado em prêmio sobre bolsa, "SPOT" se pronto, "CPR" se cédula de produto rural

VOLUME — ATENÇÃO:
- volume_original: exatamente como aparece no doc (ex: "1.500 toneladas", "25.000 sacas", "90.000 kg")
- unidade_original: "toneladas", "sacas", "kg" ou "arrobas"
- volume_toneladas: SEMPRE converter para toneladas:
  * se sacas: sacas × 60 / 1000
  * se kg: kg / 1000
  * se arrobas: arrobas × 15 / 1000
- volume_sacas: SEMPRE calcular: volume_toneladas × 1000 / 60 (arredondar para 2 casas)

LOGÍSTICA:
- data_entrega_inicio: data mais cedo para entrega — YYYY-MM-DD
- data_entrega_fim: data limite para entrega — YYYY-MM-DD
- local_entrega: porto, armazém, cidade de destino
- frete: "FOB" (produtor entrega no local do comprador ou porto), "CIF" (comprador busca), ou descrever
- destino: "exportacao" se menciona porto, exportação, FOB porto, embarque; "mercado_interno" nos demais casos

PAGAMENTO:
- data_pagamento: data exata em YYYY-MM-DD se especificada
- prazo_pagamento: descrever prazo quando não há data exata (ex: "D+2 após entrega", "no ato da NF")
- forma_pagamento: TED, PIX, depósito, etc.

RETENÇÕES — CRÍTICO:
- retencoes: array com TODAS as retenções mencionadas (Funrural, SENAR, CESSR, taxa armazenagem, corretagem, etc.)
  Para cada uma: { descricao, percentual (se %), valor_fixo (se R$ fixo), base_calculo }
- funrural_pct: % do Funrural se citado (PF = 1,5% + 0,1% RAT; PJ = 1,2% + 0,1% RAT)
- senar_pct: % do SENAR se citado (normalmente 0,2%)
- tem_retencao_imposto: true se há qualquer retenção de imposto mencionada

REFERÊNCIA DE MERCADO:
- bolsa_referencia: "CBOT", "B3", "Chicago", "CME" etc. se for A Fixar
- mes_referencia: mês de cotação para fixação (ex: "novembro/2025")

GERAL:
- observacoes: condições de qualidade (umidade, impureza, PH mínimo), penalidades, descontos por qualidade
- clausulas_especiais: array com outras cláusulas relevantes não capturadas acima

Retorne JSON com a interface exata. Arrays vazios se não houver dados (nunca null para retencoes).
Se um campo não for encontrado, omita-o do JSON (não inclua null).`;

  const response = await client.messages.create({
    model: "claude-sonnet-4-6",
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

  // Extrai JSON do texto — tenta o bloco entre ``` primeiro, depois busca { }
  let jsonStr = "{}";
  const fenced = rawText.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced) {
    jsonStr = fenced[1].trim();
  } else {
    const braced = rawText.match(/\{[\s\S]*\}/);
    if (braced) jsonStr = braced[0];
  }

  try {
    const extraido = JSON.parse(jsonStr) as ContratoVendaExtraido;
    if (!Array.isArray(extraido.retencoes)) extraido.retencoes = [];
    if (extraido.comprador_cnpj) extraido.comprador_cnpj = extraido.comprador_cnpj.replace(/\D/g, "");
    if (extraido.vendedor_cpf_cnpj) extraido.vendedor_cpf_cnpj = extraido.vendedor_cpf_cnpj.replace(/\D/g, "");
    return { extraido, rawText };
  } catch {
    return { extraido: { retencoes: [] } as ContratoVendaExtraido, rawText };
  }
}
