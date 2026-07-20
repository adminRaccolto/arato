// Extração de cédulas/contratos financeiros via Claude Haiku
// Usado tanto pela API route (web) quanto pelo webhook WhatsApp
import Anthropic from "@anthropic-ai/sdk";

const claude = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export interface CedulaExtraida {
  // Identificação do instrumento
  descricao: string | null;
  tipo: "custeio" | "investimento" | "cpr" | "egf" | "securitizacao" | "outros" | null;
  linha_credito: string | null;
  numero_documento: string | null;
  data_contrato: string | null;        // YYYY-MM-DD
  data_liberacao: string | null;       // YYYY-MM-DD — quando o banco liberou o dinheiro
  // Credor (banco/instituição financeira)
  credor_nome: string | null;
  credor_cnpj: string | null;          // CNPJ do banco (ex: "00.360.305/5653-90")
  // Emitente/tomador do crédito
  produtor_nome: string | null;
  produtor_cpf: string | null;         // CPF do emitente (ex: "310.206.740-91")
  // Financeiro
  moeda: "BRL" | "USD" | null;
  valor_financiado: number | null;     // Valor total do crédito concedido pelo banco
  valor_liberado: number | null;       // Valor efetivamente liberado (sem recursos próprios)
  taxa_juros_aa: number | null;
  taxa_juros_am: number | null;
  tipo_calculo: "sac" | "price" | "outros" | null;
  carencia_meses: number | null;
  periodicidade_meses: number | null;  // 1=mensal, 3=trim, 6=sem, 12=anual
  num_parcelas: number | null;         // Contagem das linhas do cronograma de reembolso
  iof_pct: number | null;
  tac_valor: number | null;
  // Cronograma de pagamento (todas as parcelas somadas por data)
  parcelas_cronograma: { data_vencimento: string; valor: number }[] | null;
  // Observações e confiança
  observacao: string | null;           // Garantias e informações relevantes
  confianca: "alta" | "media" | "baixa";
}

const PROMPT = `Você é um especialista em leitura de cédulas e contratos de crédito rural brasileiro.

REGRAS OBRIGATÓRIAS:
- Use null para campos não encontrados. NUNCA invente dados que não estão no documento.
- Datas: formato YYYY-MM-DD (ex: 2022-05-11 para 11/05/2022).
- Valores numéricos: sem formatação monetária (ex: 1402500.00, não "R$ 1.402.500,00").
- Taxa de juros: em percentual anual (ex: 10.00 para 10% a.a.).
- NÃO extraia aditivos de contrato — eles não existem na maioria das cédulas e este campo está ausente do JSON.

CAMPOS A EXTRAIR:

1. descricao: Finalidade/objeto do financiamento (ex: "Custeio de Lavoura de Soja — Safra 2022/2023", "Financiamento de Colheitadeira")

2. tipo: "custeio" | "investimento" | "cpr" | "egf" | "securitizacao" | "outros"

3. linha_credito: Linha de crédito EXATA conforme o documento. Procure nos campos "Linha de Crédito", "Finalidade", "Programa", "Modalidade", "SICOR".
   Exemplos: "Recursos Controlados - MCR 6.2", "Obrigatórios - MCR 6.2", "PRONAF Custeio", "FCO Rural", "BNDES Finame"

4. numero_documento: Número da cédula/contrato. Procure em campos como "Nº", "CTR", "OP", "Código", cabeçalho.

5. data_contrato: Data de emissão/assinatura do documento (YYYY-MM-DD).

6. data_liberacao: Data em que o banco liberou/liberará o dinheiro. Procure em "Forma de Utilização", "Cronograma de Liberação", "Data de Liberação".
   IMPORTANTE: Se o campo diz "imediata", "imediato" ou similar, use a mesma data_contrato.

7. credor_nome: Razão social COMPLETA do banco/credor (ex: "CAIXA ECONÔMICA FEDERAL", "BANCO DO BRASIL S.A.").
   Procure em "CREDOR", "FINANCIADOR", "INSTITUIÇÃO FINANCEIRA", cabeçalho do documento.

8. credor_cnpj: CNPJ do banco/credor, exatamente como escrito (ex: "00.360.305/5653-90").

9. produtor_nome: Nome completo do emitente/devedor/mutuário — quem está tomando o crédito.
   Procure em campos "EMITENTE", "DEVEDOR", "MUTUÁRIO", "TOMADOR".

10. produtor_cpf: CPF do emitente, com pontuação (ex: "310.206.740-91").

11. moeda: "BRL" ou "USD"

12. valor_financiado: Valor TOTAL do crédito concedido pelo banco. Campo "Valor do Crédito", "Limite", "Valor Financiado".
    Se houver múltiplos empreendimentos, SOME apenas os valores financiados pelo banco (não recursos próprios).

13. valor_liberado: Valor efetivamente liberado pelo banco nesta cédula.
    ATENÇÃO: Alguns contratos de investimento têm "Recursos Próprios" (contrapartida do produtor) que NÃO são financiados.
    valor_liberado = apenas o que o banco desembolsou.
    Se não houver distinção, use o mesmo valor de valor_financiado.

14. taxa_juros_aa: Taxa de juros anual (%). Se só encontrar taxa mensal, calcule: ((1 + am/100)^12 - 1) * 100.

15. taxa_juros_am: Taxa de juros mensal (%). Se só encontrar taxa anual, calcule: ((1 + aa/100)^(1/12) - 1) * 100.

16. tipo_calculo: "sac" (amortização constante/decrescente), "price" (prestação fixa), "outros"

17. carencia_meses: Meses de carência antes do início dos pagamentos. 0 se não houver.

18. periodicidade_meses: Intervalo entre parcelas em meses. 1=mensal | 3=trimestral | 6=semestral | 12=anual

19. num_parcelas: Número total de parcelas. CONTE as linhas do "Cronograma de Reembolso" ou "Cronograma de Pagamento".
    Se houver múltiplos empreendimentos com cronogramas, use o número de datas ÚNICAS de vencimento.

20. iof_pct: % de IOF, se mencionado. null se não houver.

21. tac_valor: Valor da TAC em R$. null se não houver.

22. parcelas_cronograma: Array com TODAS as parcelas do cronograma.
    - Inclua CADA linha do cronograma como {data_vencimento, valor}.
    - Se houver múltiplos empreendimentos com vencimentos nas mesmas datas, SOME os valores por data.
    - data_vencimento em YYYY-MM-DD. Ordene cronologicamente.
    Exemplo: [{"data_vencimento": "2023-02-01", "valor": 175312.50}, ...]

23. observacao: Garantias (tipo, descrição, valores), finalidade específica e outras informações relevantes.

24. confianca: "alta" (extraiu credor_nome + valor_financiado + data_contrato + num_parcelas) | "media" (2+ desses) | "baixa"

Retorne APENAS o JSON válido, sem texto adicional, sem markdown:
{
  "descricao": null,
  "tipo": null,
  "linha_credito": null,
  "numero_documento": null,
  "data_contrato": null,
  "data_liberacao": null,
  "credor_nome": null,
  "credor_cnpj": null,
  "produtor_nome": null,
  "produtor_cpf": null,
  "moeda": "BRL",
  "valor_financiado": null,
  "valor_liberado": null,
  "taxa_juros_aa": null,
  "taxa_juros_am": null,
  "tipo_calculo": null,
  "carencia_meses": 0,
  "periodicidade_meses": null,
  "num_parcelas": null,
  "iof_pct": null,
  "tac_valor": null,
  "parcelas_cronograma": [],
  "observacao": null,
  "confianca": "baixa"
}`;

export async function extrairCedula(pdfBase64: string): Promise<CedulaExtraida | null> {
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
    const data = JSON.parse(jsonStr) as CedulaExtraida;

    // Retrocompatibilidade: campo antigo "credor" → credor_nome
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const d = data as any;
    if (!d.credor_nome && d.credor) d.credor_nome = d.credor;

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

  const nParc = d.num_parcelas;
  const periLabel = d.periodicidade_meses === 12 ? "anuais" : d.periodicidade_meses === 6 ? "semestrais" : d.periodicidade_meses === 1 ? "mensais" : `a cada ${d.periodicidade_meses}m`;
  const primeiraParc = d.parcelas_cronograma?.[0];

  const linhas = [
    `📄 *Cédula identificada!*`,
    ``,
    `• Credor: *${d.credor_nome ?? "—"}*`,
    d.credor_cnpj ? `• CNPJ: ${d.credor_cnpj}` : null,
    d.produtor_nome ? `• Emitente: *${d.produtor_nome}*${d.produtor_cpf ? ` (${d.produtor_cpf})` : ""}` : null,
    `• Tipo: *${TIPO_LABEL[d.tipo ?? ""] ?? d.tipo ?? "—"}*`,
    d.linha_credito ? `• Linha: *${d.linha_credito}*` : null,
    `• Nº do Contrato: *${d.numero_documento ?? "não encontrado"}*`,
    `• Data: *${fmtData(d.data_contrato)}*`,
    d.data_liberacao && d.data_liberacao !== d.data_contrato ? `• Liberação: *${fmtData(d.data_liberacao)}*` : null,
    `• Valor: *${fmtVal(d.valor_financiado)}*`,
    d.valor_liberado != null && d.valor_liberado !== d.valor_financiado ? `• Valor Liberado (banco): *${fmtVal(d.valor_liberado)}*` : null,
    `• Taxa: *${fmtTaxa(d.taxa_juros_aa, d.taxa_juros_am)}*`,
    `• Amortização: *${CALC_LABEL[d.tipo_calculo ?? ""] ?? "—"}*`,
    nParc ? `• Parcelas: *${nParc}x ${periLabel}*${primeiraParc ? ` de *${fmtVal(primeiraParc.valor)}* (1ª em ${fmtData(primeiraParc.data_vencimento)})` : ""}` : null,
    d.carencia_meses ? `• Carência: *${d.carencia_meses} meses*` : null,
    d.iof_pct ? `• IOF: *${d.iof_pct}%*` : null,
    ``,
    d.confianca === "baixa"
      ? `⚠️ _Confiança baixa — verifique todos os dados antes de confirmar._`
      : d.confianca === "media"
      ? `⚠️ _Alguns campos podem precisar de revisão no sistema._`
      : `✅ _Extração com alta confiança._`,
    ``,
    `Confirmar lançamento? Responda *SIM* para salvar ou *CORRIGIR* para ajustar no sistema.`,
  ];

  return linhas.filter(l => l !== null).join("\n");
}
