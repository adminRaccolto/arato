// Camada de IA: intenção, entidades e leitura de NF por foto
import Anthropic from "@anthropic-ai/sdk";

const claude = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ── Detectar intenção de uma mensagem livre ─────────────────────────────────
export type Intencao =
  | "consulta_cp" | "consulta_cr" | "consulta_saldo" | "consulta_estoque"
  | "consulta_contratos" | "consulta_lavoura" | "consulta_dre" | "consulta_arrendamento"
  | "inserir_operacao_lavoura" | "inserir_abastecimento" | "inserir_saida_estoque"
  | "inserir_entrada_estoque" | "inserir_cp" | "inserir_cr" | "inserir_baixa_cp"
  | "inserir_baixa_cr" | "inserir_romaneio"
  | "desconhecido";

export async function detectarIntencao(texto: string): Promise<{
  intencao: Intencao;
  entidades: Record<string, string | number>;
  confianca: "alta" | "media" | "baixa";
}> {
  const prompt = `Você é um assistente de ERP agrícola brasileiro. Analise a mensagem abaixo e retorne um JSON com:
- intencao: uma das opções abaixo
- entidades: campos extraídos (produto, quantidade, valor, data, talhao, veiculo, cultura, safra, commodity, periodo, moeda)
- confianca: alta | media | baixa

Intenções disponíveis:
CONSULTAS: consulta_cp, consulta_cr, consulta_saldo, consulta_estoque, consulta_contratos, consulta_lavoura, consulta_dre, consulta_arrendamento
INSERÇÕES: inserir_operacao_lavoura, inserir_abastecimento, inserir_saida_estoque, inserir_entrada_estoque, inserir_cp, inserir_cr, inserir_baixa_cp, inserir_baixa_cr, inserir_romaneio
OUTROS: desconhecido

Exemplos:
"quais contas vencem essa semana" → consulta_cp, {}
"comprei 200 litros de diesel por 6 reais" → inserir_abastecimento, {produto:"diesel",quantidade:200,valor:1200}
"pulverizei o talhão 3 com roundup 2 litros por hectare" → inserir_operacao_lavoura, {talhao:"3",produto:"roundup",dose:2,unidade:"L/ha"}
"quantas sacas de soja tenho comprometidas safra 26/27" → consulta_contratos, {commodity:"soja",safra:"2026/2027"}
"qual meu saldo projetado" → consulta_saldo, {}

Mensagem: "${texto}"
Responda APENAS com o JSON, sem explicações.`;

  const msg = await claude.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 300,
    messages: [{ role: "user", content: prompt }],
  });
  try {
    const raw = (msg.content[0] as { type: string; text: string }).text.trim();
    return JSON.parse(raw);
  } catch {
    return { intencao: "desconhecido", entidades: {}, confianca: "baixa" };
  }
}

// ── Extrair entidade específica de uma resposta curta ──────────────────────
export async function extrairEntidade(
  campo: string,
  resposta: string,
  contexto: string
): Promise<string> {
  const prompt = `Extraia o valor do campo "${campo}" da resposta abaixo.
Contexto da conversa: ${contexto}
Resposta do usuário: "${resposta}"
Retorne APENAS o valor extraído, sem explicações. Se não encontrar, retorne "".`;

  const msg = await claude.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 100,
    messages: [{ role: "user", content: prompt }],
  });
  return (msg.content[0] as { type: string; text: string }).text.trim();
}

// ── Transcrever áudio via OpenAI Whisper ───────────────────────────────────
export async function transcreverAudio(audioBuffer: Buffer, mimeType: string): Promise<string> {
  const ext = mimeType.includes("ogg") ? "ogg" : mimeType.includes("mp4") ? "mp4" : "wav";
  const formData = new FormData();
  formData.append("file", new Blob([audioBuffer.buffer as ArrayBuffer], { type: mimeType }), `audio.${ext}`);
  formData.append("model", "whisper-1");
  formData.append("language", "pt");

  const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
    body: formData,
  });
  if (!res.ok) throw new Error("Whisper error: " + await res.text());
  const json = await res.json() as { text: string };
  return json.text;
}

// ── Ler NF por foto (Claude Vision) ───────────────────────────────────────
export async function lerNotaFiscal(imagemBase64: string, mimeType: string): Promise<{
  cnpj_emitente?: string;
  razao_social?: string;
  data_emissao?: string;
  data_vencimento?: string;
  valor_total?: number;
  itens?: { descricao: string; quantidade: number; unidade: string; valor_unitario: number }[];
  numero_nf?: string;
  chave_acesso?: string;
}> {
  const msg = await claude.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 1000,
    messages: [{
      role: "user",
      content: [
        {
          type: "image",
          source: { type: "base64", media_type: mimeType as "image/jpeg" | "image/png" | "image/webp", data: imagemBase64 },
        },
        {
          type: "text",
          text: `Esta é uma foto de nota fiscal ou cupom fiscal brasileiro. Extraia os dados e retorne um JSON com:
cnpj_emitente, razao_social, data_emissao (YYYY-MM-DD), data_vencimento (YYYY-MM-DD se houver),
valor_total (número), numero_nf, chave_acesso (44 dígitos se NF-e),
itens: [{descricao, quantidade, unidade, valor_unitario}]
Retorne APENAS o JSON, sem explicações. Campos não encontrados ficam null.`,
        },
      ],
    }],
  });
  try {
    const raw = (msg.content[0] as { type: string; text: string }).text.trim();
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

// ── Gerar resposta de consulta formatada para WhatsApp ────────────────────
export async function formatarRespostaConsulta(dados: unknown, tipo: string): Promise<string> {
  const prompt = `Você é um assistente agrícola. Formate os dados abaixo em uma resposta curta e clara para WhatsApp (máx 300 chars, sem markdown, use emojis simples).
Tipo de consulta: ${tipo}
Dados: ${JSON.stringify(dados)}`;

  const msg = await claude.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 400,
    messages: [{ role: "user", content: prompt }],
  });
  return (msg.content[0] as { type: string; text: string }).text.trim();
}
