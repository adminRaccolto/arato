// Extração de extratos de consórcio via IA
// Suporta BB Consórcios, Porto Seguro, Embracon, Rodobens e outros formatos
import Anthropic from "@anthropic-ai/sdk";

const claude = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export interface ParcelaExtraida {
  numero: number;
  data_vencimento: string;     // YYYY-MM-DD
  data_pagamento: string | null; // YYYY-MM-DD — null se não paga
  vl_devido: number;
  vl_pago: number;
  multa: number;
  juros: number;
  seguro: number;
}

export interface ConsorcioExtraido {
  administradora: string | null;
  consorciado_nome: string | null;
  consorciado_cpf: string | null;
  grupo: string | null;
  numero_cota: string | null;
  // Valores atuais (após reajuste)
  valor_credito_atual: number | null;    // Carta de crédito vigente
  valor_parcela_atual: number | null;    // Valor devido na parcela mais recente
  // Contadores
  parcelas_pagas: number | null;         // Quantas parcelas já foram pagas
  total_parcelas: number | null;         // Total de parcelas do contrato
  data_primeira_parcela: string | null;  // YYYY-MM-DD da parcela nº 1
  // Classificação do bem
  tipo_bem: "veiculo" | "imovel" | "maquina" | "caminhao" | "outro" | null;
  descricao_bem: string | null;
  // Resumo financeiro
  total_pago: number | null;
  total_a_pagar: number | null;
  taxa_adm_pct: number | null;           // % taxa de administração
  fundo_reserva_pct: number | null;
  // Histórico de parcelas do extrato
  parcelas: ParcelaExtraida[] | null;
  confianca: "alta" | "media" | "baixa";
}

const PROMPT = `Você é um especialista em leitura de extratos de consórcios brasileiros (BB Consórcios, Itaú, Bradesco, Porto Seguro, Embracon, Rodobens e outros).

REGRAS:
- Use null para campos não encontrados. NUNCA invente dados.
- Datas: YYYY-MM-DD (ex: 2025-08-11 para 11/08/2025).
- Percentuais: em número puro (ex: 6.0 para 6,0000%).
- Para parcelas_pagas: CONTE as linhas com "RECBTO. PARCELA" ou similar no histórico.
- Para total_parcelas: estime a partir de "% Pago" por parcela (% Pago total ÷ % por parcela) + parcelas restantes. Se não for possível, use null.

CONVERSÃO OBRIGATÓRIA DE NÚMEROS — CRÍTICO PARA JSON VÁLIDO:
O PDF usa formato brasileiro com ponto como separador de milhar e vírgula como decimal.
Você DEVE converter TODOS os valores numéricos para o formato JSON padrão (ponto como decimal):
- 2.155,24  → 2155.24   (remove ponto de milhar, vírgula vira ponto)
- 146.716,00 → 146716.00
- 84,90     → 84.90
- 1,2499    → 1.2499
- 0,00      → 0.00
NUNCA escreva vírgulas dentro de números no JSON — isso quebra o parse. Use APENAS ponto decimal.

CAMPOS A EXTRAIR:

1. administradora: Nome da administradora do consórcio (ex: "BB Consórcios", "Porto Seguro Consórcios").
   Procure no cabeçalho, logo, título do documento.

2. consorciado_nome: Nome completo do consorciado/titular.

3. consorciado_cpf: CPF ou CNPJ do consorciado (com formatação original).

4. grupo: Número do grupo do consórcio (campo "Grupo").

5. numero_cota: Número da cota (campo "Cota").

6. valor_credito_atual: Valor da carta de crédito ATUAL (após reajuste).
   Procure na coluna "Vl. Créd." da parcela mais recente (maior número de assembleia).

7. valor_parcela_atual: Valor DEVIDO na parcela mais recente (coluna "Vl. Devido" da última linha).

8. parcelas_pagas: Quantidade de parcelas já pagas. CONTE as linhas do histórico.

9. total_parcelas: Número total de parcelas do contrato.
   COMO CALCULAR: Se cada parcela representa X% e o total pago é Y%:
   - total_pagas = parcelas_pagas
   - % por parcela = Y / total_pagas (ex: 12.8004 / 12 = 1.0667)
   - % restante = percentual dos "Valores a Pagar" (campo "TOTAL" em %)
   - total_parcelas ≈ round((Y + % restante) / % por parcela)
   Se não conseguir calcular com segurança, use null.

10. data_primeira_parcela: Data de VENCIMENTO da assembleia/parcela número 1.
    Procure a linha com "Ass. 1" ou a linha mais antiga do histórico.

11. tipo_bem: "veiculo" | "imovel" | "maquina" | "caminhao" | "outro"
    Infira do contexto se possível (ex: grupos altos normalmente são imóveis).
    Se não houver informação suficiente → "outro".

12. descricao_bem: Descrição do bem, se disponível no extrato.

13. total_pago: Valor total pago até agora (campo "TOTAL" em "Valores / Percentuais Pagos").

14. total_a_pagar: Valor total ainda a pagar (campo "TOTAL" em "Valores / Percentuais a Pagar").

15. taxa_adm_pct: Percentual da taxa de administração (coluna de % ao lado de "Taxa de Administração" nos valores pagos).

16. fundo_reserva_pct: Percentual do fundo de reserva.

17. parcelas: Array com TODAS as parcelas do histórico do extrato.
    Para cada linha de assembleia:
    - numero: número da assembleia (campo "Ass.")
    - data_vencimento: data da coluna "Vencto." (YYYY-MM-DD)
    - data_pagamento: data da coluna "Pagto." (YYYY-MM-DD). null se não houver.
    - vl_devido: valor da coluna "Vl. Devido"
    - vl_pago: valor da coluna "Vl. Pago"
    - multa: valor da coluna "Multa" (0 se não houver)
    - juros: valor da coluna "Juros" (0 se não houver)
    - seguro: valor da coluna "Seguro" (0 se não houver)
    Ordene pelo número da assembleia (crescente).

18. confianca: "alta" (extraiu administradora + grupo + cota + valor_credito_atual + parcelas_pagas) | "media" (3+ desses) | "baixa"

Retorne APENAS o JSON válido, sem markdown:
{
  "administradora": null,
  "consorciado_nome": null,
  "consorciado_cpf": null,
  "grupo": null,
  "numero_cota": null,
  "valor_credito_atual": null,
  "valor_parcela_atual": null,
  "parcelas_pagas": null,
  "total_parcelas": null,
  "data_primeira_parcela": null,
  "tipo_bem": "outro",
  "descricao_bem": null,
  "total_pago": null,
  "total_a_pagar": null,
  "taxa_adm_pct": null,
  "fundo_reserva_pct": null,
  "parcelas": [],
  "confianca": "baixa"
}`;

/** Tenta corrigir números no formato brasileiro dentro de um JSON */
function repairBrazilianNumbers(json: string): string {
  let r = json;
  // 1) X.XXX.XXX,XX → digits.digits (maior para menor)
  r = r.replace(/\b(\d{1,3})\.(\d{3})\.(\d{3}),(\d{1,4})\b/g, "$1$2$3.$4");
  // 2) X.XXX,XX → digits.digits
  r = r.replace(/\b(\d{1,3})\.(\d{3}),(\d{1,4})\b/g, "$1$2.$3");
  // 3) XX,XX em contexto de valor JSON (após : e antes de , } ])
  r = r.replace(/(:\s*)(\d+),(\d{1,4})([\s\r\n]*[,}\]])/g, "$1$2.$3$4");
  return r;
}

export async function extrairConsorcio(pdfBase64: string): Promise<ConsorcioExtraido | null> {
  const response = await claude.beta.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 8192,
    betas: ["pdfs-2024-09-25"],
    messages: [{
      role: "user",
      content: [
        {
          type: "document",
          source: { type: "base64", media_type: "application/pdf", data: pdfBase64 },
        } as unknown as Anthropic.ContentBlockParam,
        { type: "text", text: PROMPT },
      ],
    }],
  });

  const raw = response.content
    .filter(b => b.type === "text")
    .map(b => (b as Anthropic.TextBlock).text)
    .join("")
    .trim();

  // Extrai o primeiro bloco JSON da resposta (mesmo que haja texto ao redor)
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error(`Resposta não contém JSON válido: ${raw.substring(0, 200)}`);

  // Tenta parse direto; se falhar, aplica repair de números brasileiros e tenta novamente
  try {
    return JSON.parse(jsonMatch[0]) as ConsorcioExtraido;
  } catch {
    const repaired = repairBrazilianNumbers(jsonMatch[0]);
    try {
      return JSON.parse(repaired) as ConsorcioExtraido;
    } catch (e2) {
      throw new Error(`JSON inválido mesmo após repair: ${e2 instanceof Error ? e2.message : e2}`);
    }
  }
}
