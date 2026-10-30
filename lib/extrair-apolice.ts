// Extração de apólices de seguro via IA (30/10/2026) — mesmo padrão de extrair-consorcio/extrair-cedula.
// Suporta apólice de máquinas/equipamentos, automóvel/caminhão, rural/agrícola (PROAGRO, seguro de produtividade),
// patrimonial, vida e responsabilidade civil. A tela de Seguros preenche o formulário; o usuário confere e salva.
import Anthropic from "@anthropic-ai/sdk";

const claude = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export type RamoApolice = "rural" | "vida" | "patrimonial" | "automovel" | "responsabilidade_civil" | "maquinas" | "outro";

export interface ApoliceExtraida {
  numero_apolice: string | null;
  seguradora_nome: string | null;
  seguradora_cnpj: string | null;
  corretora_nome: string | null;
  corretor_contato: string | null;      // telefone/e-mail do corretor
  segurado_nome: string | null;
  segurado_cpf_cnpj: string | null;
  ramo: RamoApolice | null;
  objeto_segurado: string | null;       // descrição curta do bem/risco
  // bem segurado (para vincular ao cadastro)
  bem_tipo: "maquina" | "veiculo" | "fazenda" | "imovel" | "pessoa" | "outro" | null;
  bem_marca_modelo: string | null;
  bem_ano: string | null;
  bem_chassi: string | null;
  bem_placa: string | null;
  bem_serie: string | null;
  bem_local: string | null;             // fazenda/endereço/município do risco
  // valores e vigência
  importancia_segurada: number | null;  // LMI / IS total
  premio_total: number | null;          // prêmio total a pagar (com IOF)
  premio_liquido: number | null;
  iof: number | null;
  franquia: string | null;
  data_inicio_vigencia: string | null;  // YYYY-MM-DD
  data_fim_vigencia: string | null;     // YYYY-MM-DD
  // pagamento
  forma_pagamento: "avista" | "parcelado" | null;
  parcelas: { data_vencimento: string; valor: number }[] | null;
  // rural
  area_ha: number | null;
  cultura: string | null;
  // vida / coberturas
  coberturas: { descricao: string; capital: number }[] | null;
  confianca: "alta" | "media" | "baixa";
}

const PROMPT = `Você é um especialista em leitura de apólices de seguro brasileiras (Mapfre, Allianz, Porto Seguro, Tokio Marine, Bradesco Seguros, BB Seguros/Brasilseg, Sompo, HDI, Sancor, Fairfax, Essor, Swiss Re e outras), inclusive de máquinas agrícolas, seguro rural, automóvel, patrimonial e vida.

REGRAS:
- Use null para campos não encontrados. NUNCA invente dados.
- Datas: YYYY-MM-DD (ex: 2026-08-11 para 11/08/2026).
- NÚMEROS NO JSON COM PONTO DECIMAL e SEM separador de milhar: 1.250.000,00 → 1250000.00; 84,90 → 84.90. Nunca use vírgula dentro de números.

CAMPOS:
1. numero_apolice: número da apólice (não o da proposta, a menos que não haja apólice). Mantenha pontos/traços como no documento.
2. seguradora_nome / seguradora_cnpj: a companhia seguradora (não a corretora).
3. corretora_nome: corretora de seguros. corretor_contato: telefone ou e-mail do corretor, se houver.
4. segurado_nome / segurado_cpf_cnpj: o segurado (titular). Mantenha a formatação do documento.
5. ramo: um destes —
   "maquinas" (máquinas e equipamentos agrícolas: trator, colheitadeira, pulverizador, plantadeira, implementos),
   "automovel" (automóvel, caminhonete, caminhão — ramo auto),
   "rural" (seguro agrícola/de produtividade/PROAGRO/custeio da lavoura, penhor rural de safra),
   "patrimonial" (sede, armazém, silo, galpão, residência, empresarial),
   "vida" (vida em grupo, acidentes pessoais, prestamista),
   "responsabilidade_civil", ou "outro".
6. objeto_segurado: descrição curta do bem ou risco (ex: "Colheitadeira John Deere S790 2022", "Soja — 1.200 ha — Fazenda Boa Vista").
7. Bem segurado (o principal; se houver vários, o de maior valor):
   bem_tipo: "maquina" | "veiculo" | "fazenda" | "imovel" | "pessoa" | "outro";
   bem_marca_modelo, bem_ano, bem_chassi, bem_placa, bem_serie (nº de série/identificação), bem_local (fazenda, endereço ou município do risco).
8. importancia_segurada: importância segurada / limite máximo de indenização TOTAL da apólice.
9. premio_total: prêmio TOTAL a pagar (com IOF). premio_liquido e iof se vierem separados.
10. franquia: texto da franquia/participação obrigatória, se houver.
11. data_inicio_vigencia / data_fim_vigencia: vigência da apólice.
12. forma_pagamento: "avista" (pagamento único) ou "parcelado".
13. parcelas: TODAS as parcelas do prêmio com vencimento e valor (quadro de parcelas/demonstrativo de pagamento). Se for à vista, uma parcela com o vencimento informado.
14. area_ha e cultura: só para seguro rural/agrícola.
15. coberturas: lista das coberturas com o capital/limite de cada uma (ex: "Morte", "Incêndio", "Danos elétricos").
16. confianca: "alta" (número, seguradora, vigência, prêmio e importância segurada encontrados), "media" (3 ou 4 desses), "baixa".

Retorne APENAS o JSON, sem markdown:
{
  "numero_apolice": null, "seguradora_nome": null, "seguradora_cnpj": null, "corretora_nome": null, "corretor_contato": null,
  "segurado_nome": null, "segurado_cpf_cnpj": null, "ramo": null, "objeto_segurado": null,
  "bem_tipo": null, "bem_marca_modelo": null, "bem_ano": null, "bem_chassi": null, "bem_placa": null, "bem_serie": null, "bem_local": null,
  "importancia_segurada": null, "premio_total": null, "premio_liquido": null, "iof": null, "franquia": null,
  "data_inicio_vigencia": null, "data_fim_vigencia": null, "forma_pagamento": null, "parcelas": [],
  "area_ha": null, "cultura": null, "coberturas": [], "confianca": "baixa"
}`;

/** Corrige números no formato brasileiro que escaparem dentro do JSON */
function repararNumerosBR(json: string): string {
  let r = json;
  r = r.replace(/\b(\d{1,3})\.(\d{3})\.(\d{3}),(\d{1,4})\b/g, "$1$2$3.$4");
  r = r.replace(/\b(\d{1,3})\.(\d{3}),(\d{1,4})\b/g, "$1$2.$3");
  r = r.replace(/(:\s*)(\d+),(\d{1,4})([\s\r\n]*[,}\]])/g, "$1$2.$3$4");
  return r;
}

export async function extrairApolice(pdfBase64: string): Promise<ApoliceExtraida | null> {
  const response = await claude.beta.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 8192,
    betas: ["pdfs-2024-09-25"],
    messages: [{
      role: "user",
      content: [
        { type: "document", source: { type: "base64", media_type: "application/pdf", data: pdfBase64 } } as unknown as Anthropic.ContentBlockParam,
        { type: "text", text: PROMPT },
      ],
    }],
  });
  const raw = response.content.filter(b => b.type === "text").map(b => (b as Anthropic.TextBlock).text).join("").trim();
  const m = raw.match(/\{[\s\S]*\}/);
  if (!m) throw new Error(`Resposta não contém JSON válido: ${raw.substring(0, 200)}`);
  try {
    return JSON.parse(m[0]) as ApoliceExtraida;
  } catch {
    try { return JSON.parse(repararNumerosBR(m[0])) as ApoliceExtraida; }
    catch (e2) { throw new Error(`JSON inválido mesmo após reparo: ${e2 instanceof Error ? e2.message : e2}`); }
  }
}
