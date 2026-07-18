// Extração de cédulas/contratos financeiros via Claude Haiku
// Usado tanto pela API route (web) quanto pelo webhook WhatsApp
import Anthropic from "@anthropic-ai/sdk";

const claude = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export interface CedulaExtraida {
  descricao: string | null;
  tipo: "custeio" | "investimento" | "cpr" | "egf" | "securitizacao" | "outros" | null;
  linha_credito: string | null;
  credor: string | null;
  numero_documento: string | null;
  data_contrato: string | null;        // YYYY-MM-DD
  moeda: "BRL" | "USD" | null;
  valor_financiado: number | null;
  taxa_juros_aa: number | null;
  taxa_juros_am: number | null;
  tipo_calculo: "sac" | "price" | "outros" | null;
  carencia_meses: number | null;
  periodicidade_meses: number | null;
  iof_pct: number | null;
  tac_valor: number | null;
  observacao: string | null;
  confianca: "alta" | "media" | "baixa";
}

const PROMPT = `Você é um extrator especializado em cédulas e contratos financeiros rurais brasileiros (CCR, CPR, CDA, PRONAMP, FCO, BNDES, Custeio, Investimento, etc.).

Analise o documento e extraia os campos no JSON abaixo.
- Use null para campos não encontrados.
- Datas: formato YYYY-MM-DD.
- Valores numéricos: sem formatação (ex: 480000.00, não "R$ 480.000,00").
- Taxa de juros: em percentual anual (ex: 12.50 para 12,50% a.a.).
- Se encontrar só taxa mensal, calcule a anual: ((1 + am/100)^12 - 1) * 100.
- tipo: custeio, investimento, cpr, egf, securitizacao ou outros.
- tipo_calculo: sac (decrescente), price (constante), ou outros.
- confianca: "alta" se extraiu credor+valor+data; "media" se extraiu ao menos 2 dos 3; "baixa" caso contrário.

Retorne APENAS o JSON válido, sem texto adicional, sem markdown:
{
  "descricao": "Nome do instrumento financeiro ou finalidade",
  "tipo": "custeio|investimento|cpr|egf|securitizacao|outros",
  "linha_credito": "PRONAF|PRONAMP|FCO|BNDES|Livre|...",
  "credor": "Nome do banco ou credor",
  "numero_documento": "Número da cédula/contrato",
  "data_contrato": "YYYY-MM-DD",
  "moeda": "BRL|USD",
  "valor_financiado": 0.00,
  "taxa_juros_aa": 0.0000,
  "taxa_juros_am": 0.0000,
  "tipo_calculo": "sac|price|outros",
  "carencia_meses": 0,
  "periodicidade_meses": 1,
  "iof_pct": 0.0,
  "tac_valor": 0.0,
  "observacao": "Informações adicionais relevantes (garantias, finalidade, etc.)",
  "confianca": "alta|media|baixa"
}`;

export async function extrairCedula(pdfBase64: string): Promise<CedulaExtraida | null> {
  try {
    const response = await claude.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1024,
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

    // Remove possível markdown code fence
    const jsonStr = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
    const data = JSON.parse(jsonStr) as CedulaExtraida;
    return data;
  } catch (err) {
    console.error("[extrair-cedula] erro:", err);
    return null;
  }
}

export function formatarConfirmacaoWhatsApp(d: CedulaExtraida): string {
  const fmtVal = (v: number | null) => v != null
    ? `R$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`
    : "—";
  const fmtData = (s: string | null) => {
    if (!s) return "—";
    const [y, m, dd] = s.split("-");
    return `${dd}/${m}/${y}`;
  };
  const fmtTaxa = (aa: number | null, am: number | null) => {
    if (!aa && !am) return "—";
    const parts = [];
    if (aa) parts.push(`${aa.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 4 })}% a.a.`);
    if (am) parts.push(`${am.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 4 })}% a.m.`);
    return parts.join(" / ");
  };
  const TIPO_LABEL: Record<string, string> = {
    custeio: "Custeio Agrícola", investimento: "Investimento",
    cpr: "CPR", egf: "EGF", securitizacao: "Securitização", outros: "Outros",
  };
  const CALC_LABEL: Record<string, string> = { sac: "SAC (decrescente)", price: "Price (constante)", outros: "Outro" };

  const linhas = [
    `📄 *Cédula identificada!*`,
    ``,
    `• Credor: *${d.credor ?? "—"}*`,
    `• Tipo: *${TIPO_LABEL[d.tipo ?? ""] ?? d.tipo ?? "—"}*`,
    d.linha_credito ? `• Linha: *${d.linha_credito}*` : null,
    `• Nº do Contrato: *${d.numero_documento ?? "não encontrado"}*`,
    `• Data: *${fmtData(d.data_contrato)}*`,
    `• Valor: *${fmtVal(d.valor_financiado)}*`,
    `• Taxa: *${fmtTaxa(d.taxa_juros_aa, d.taxa_juros_am)}*`,
    `• Amortização: *${CALC_LABEL[d.tipo_calculo ?? ""] ?? "—"}*`,
    d.carencia_meses ? `• Carência: *${d.carencia_meses} meses*` : null,
    d.iof_pct ? `• IOF: *${d.iof_pct}%*` : null,
    d.tac_valor ? `• TAC: *${fmtVal(d.tac_valor)}*` : null,
    ``,
    d.confianca === "baixa"
      ? `⚠️ _Confiança baixa — verifique os dados antes de confirmar._`
      : d.confianca === "media"
      ? `⚠️ _Alguns campos podem precisar de revisão no sistema._`
      : `✅ _Extração com alta confiança._`,
    ``,
    `Confirmar lançamento? Responda *SIM* para salvar ou *CORRIGIR* para ajustar no sistema.`,
  ];

  return linhas.filter(l => l !== null).join("\n");
}
