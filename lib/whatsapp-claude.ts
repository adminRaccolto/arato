// Motor conversacional — Claude com tool use
// O modelo decide o que perguntar, quais dados buscar e como responder.
// Zero menus fixos, zero classificador de intenção, zero máquina de estados.
import Anthropic from "@anthropic-ai/sdk";
import {
  consultaContasPagarSemana, consultaContasAtrasadas,
  consultaProximoVencimentoMoeda, consultaContasReceberMes,
  consultaSaldoProjetado, consultaGastoCategoria,
  consultaArrendamentosVencer, consultaSacasComprometidas,
  consultaEstoqueProduto, consultaEstoqueMinimo,
  consultaStatusLavoura, consultaProdutividade, consultaDRESumario,
} from "./whatsapp-consultas";
import { executarInsercao } from "./whatsapp-inserir";
import type { FluxoNome } from "./whatsapp-flows";

const claude = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ── Definição das ferramentas expostas ao Claude ────────────────────────────
const TOOLS: Anthropic.Tool[] = [
  {
    name: "consultar_contas_pagar",
    description: "Consulta contas a pagar: vencimentos da semana, contas atrasadas, próximo vencimento por moeda (dólar, euro), ou gasto por categoria (combustivel, defensivos, etc).",
    input_schema: {
      type: "object" as const,
      properties: {
        tipo: {
          type: "string",
          enum: ["semana", "atrasadas", "por_moeda", "por_categoria"],
          description: "Tipo de consulta",
        },
        moeda: { type: "string", description: "USD, EUR etc — só quando tipo=por_moeda" },
        categoria: { type: "string", description: "Ex: combustivel, defensivos, sementes — só quando tipo=por_categoria" },
      },
      required: ["tipo"],
    },
  },
  {
    name: "consultar_contas_receber",
    description: "Consulta contas a receber do mês.",
    input_schema: { type: "object" as const, properties: {}, required: [] },
  },
  {
    name: "consultar_saldo_projetado",
    description: "Mostra o saldo financeiro projetado até o fim do mês.",
    input_schema: { type: "object" as const, properties: {}, required: [] },
  },
  {
    name: "consultar_estoque",
    description: "Consulta estoque de insumos. Sem produto retorna itens abaixo do mínimo. Com produto busca um item específico.",
    input_schema: {
      type: "object" as const,
      properties: {
        produto: { type: "string", description: "Nome do produto/insumo a buscar (opcional)" },
      },
      required: [],
    },
  },
  {
    name: "consultar_contratos",
    description: "Consulta contratos de comercialização de grãos: sacas comprometidas por commodity e safra.",
    input_schema: {
      type: "object" as const,
      properties: {
        commodity: { type: "string", description: "soja, milho, algodao etc (opcional)" },
        safra: { type: "string", description: "Ex: 2024/2025 (opcional)" },
      },
      required: [],
    },
  },
  {
    name: "consultar_lavoura",
    description: "Consulta status das lavouras e talhões em andamento, ou produtividade da safra.",
    input_schema: {
      type: "object" as const,
      properties: {
        tipo: {
          type: "string",
          enum: ["status", "produtividade"],
          description: "status = operações em andamento; produtividade = sacas por ha",
        },
      },
      required: ["tipo"],
    },
  },
  {
    name: "consultar_arrendamentos",
    description: "Lista arrendamentos com vencimentos próximos.",
    input_schema: { type: "object" as const, properties: {}, required: [] },
  },
  {
    name: "consultar_dre",
    description: "Mostra o resultado econômico (DRE) da safra atual: receita, custos, margem.",
    input_schema: { type: "object" as const, properties: {}, required: [] },
  },
  {
    name: "registrar_abastecimento",
    description: "Registra abastecimento de combustível. Lança CP e movimenta estoque.",
    input_schema: {
      type: "object" as const,
      properties: {
        produto: { type: "string", description: "diesel, gasolina, etc" },
        quantidade: { type: "number", description: "Litros abastecidos" },
        valor: { type: "number", description: "Valor total em R$" },
        veiculo: { type: "string", description: "Nome ou placa do veículo (opcional)" },
        tipo_destino: { type: "string", enum: ["estoque", "direto"], description: "Vai para o tanque/estoque ou uso imediato" },
        vencimento: { type: "string", description: "Data de vencimento da conta: hoje, amanhã, ou dd/mm/aaaa" },
      },
      required: ["produto", "quantidade", "valor"],
    },
  },
  {
    name: "registrar_operacao_lavoura",
    description: "Registra uma operação de lavoura: pulverização, adubação, plantio ou correção de solo.",
    input_schema: {
      type: "object" as const,
      properties: {
        tipo_op: { type: "string", enum: ["pulverizacao", "adubacao", "plantio", "correcao_solo"], description: "Tipo de operação" },
        talhao: { type: "string", description: "Nome ou número do talhão" },
        produto: { type: "string", description: "Nome do insumo/produto aplicado" },
        dose: { type: "number", description: "Dose aplicada" },
        unidade: { type: "string", description: "L/ha, kg/ha, sc/ha, etc" },
        data_op: { type: "string", description: "Data da operação: hoje, ontem, ou dd/mm/aaaa" },
      },
      required: ["tipo_op", "talhao", "produto"],
    },
  },
  {
    name: "registrar_conta_pagar",
    description: "Lança uma conta a pagar no financeiro.",
    input_schema: {
      type: "object" as const,
      properties: {
        descricao: { type: "string", description: "Descrição da conta" },
        valor: { type: "number", description: "Valor em R$" },
        vencimento: { type: "string", description: "Data de vencimento: hoje, amanhã, ou dd/mm/aaaa" },
        fornecedor: { type: "string", description: "Nome do fornecedor (opcional)" },
        categoria: { type: "string", description: "combustivel, defensivos, fertilizantes, arrendamento, manutencao, outros (opcional)" },
      },
      required: ["descricao", "valor", "vencimento"],
    },
  },
  {
    name: "registrar_conta_receber",
    description: "Lança uma conta a receber no financeiro.",
    input_schema: {
      type: "object" as const,
      properties: {
        descricao: { type: "string", description: "Descrição da receita" },
        valor: { type: "number", description: "Valor em R$" },
        vencimento: { type: "string", description: "Data de recebimento: hoje, amanhã, ou dd/mm/aaaa" },
        cliente: { type: "string", description: "Nome do cliente/comprador (opcional)" },
      },
      required: ["descricao", "valor", "vencimento"],
    },
  },
];

// ── Executor das ferramentas ────────────────────────────────────────────────
async function executarFerramenta(
  nome: string,
  input: Record<string, unknown>,
  fazendaId: string,
  usuarioId: string,
): Promise<string> {
  try {
    switch (nome) {
      case "consultar_contas_pagar": {
        const tipo = String(input.tipo ?? "semana");
        if (tipo === "atrasadas") return consultaContasAtrasadas(fazendaId);
        if (tipo === "por_moeda" && input.moeda) return consultaProximoVencimentoMoeda(fazendaId, String(input.moeda));
        if (tipo === "por_categoria" && input.categoria) return consultaGastoCategoria(fazendaId, String(input.categoria));
        return consultaContasPagarSemana(fazendaId);
      }
      case "consultar_contas_receber":
        return consultaContasReceberMes(fazendaId);
      case "consultar_saldo_projetado":
        return consultaSaldoProjetado(fazendaId);
      case "consultar_estoque":
        if (input.produto) return consultaEstoqueProduto(fazendaId, String(input.produto));
        return consultaEstoqueMinimo(fazendaId);
      case "consultar_contratos":
        return consultaSacasComprometidas(
          fazendaId,
          input.commodity ? String(input.commodity) : undefined,
          input.safra ? String(input.safra) : undefined,
        );
      case "consultar_lavoura":
        if (String(input.tipo ?? "") === "produtividade") return consultaProdutividade(fazendaId);
        return consultaStatusLavoura(fazendaId);
      case "consultar_arrendamentos":
        return consultaArrendamentosVencer(fazendaId);
      case "consultar_dre":
        return consultaDRESumario(fazendaId);

      case "registrar_abastecimento": {
        const res = await executarInsercao("abastecimento", {
          produto: input.produto,
          quantidade: input.quantidade,
          valor: input.valor,
          veiculo: input.veiculo,
          tipo_destino: input.tipo_destino ?? "estoque",
          vencimento: input.vencimento ?? "hoje",
          tem_nf: "nao",
        }, fazendaId, usuarioId);
        return res.mensagem;
      }
      case "registrar_operacao_lavoura": {
        const tipoMap: Record<string, string> = {
          pulverizacao: "1", adubacao: "2", plantio: "3", correcao_solo: "4"
        };
        const res = await executarInsercao("operacao_lavoura", {
          tipo_op: tipoMap[String(input.tipo_op ?? "pulverizacao")] ?? "1",
          talhao: input.talhao,
          produto: input.produto,
          dose: input.dose ?? 0,
          unidade: input.unidade ?? "L/ha",
          data_op: input.data_op ?? "hoje",
        }, fazendaId, usuarioId);
        return res.mensagem;
      }
      case "registrar_conta_pagar": {
        const res = await executarInsercao("lancar_cp", {
          descricao: input.descricao,
          valor: input.valor,
          vencimento: input.vencimento,
          fornecedor: input.fornecedor ?? "",
          categoria: input.categoria ?? "outros",
        }, fazendaId, usuarioId);
        return res.mensagem;
      }
      case "registrar_conta_receber": {
        const res = await executarInsercao("lancar_cr", {
          descricao: input.descricao,
          valor: input.valor,
          vencimento: input.vencimento,
          cliente: input.cliente ?? "",
        }, fazendaId, usuarioId);
        return res.mensagem;
      }
      default:
        return "Ferramenta não reconhecida.";
    }
  } catch (err) {
    console.error(`[CLAUDE-TOOL] erro em ${nome}:`, err);
    return `Erro ao executar ${nome}: ${String(err)}`;
  }
}

// ── Histórico de conversa (últimas N trocas) ────────────────────────────────
export type Mensagem = { role: "user" | "assistant"; content: string };

// ── Processador principal ───────────────────────────────────────────────────
export async function processarMensagemIA(
  texto: string,
  contexto: { fazendaId: string; fazendaNome: string; usuarioId: string },
  historico: Mensagem[],
): Promise<string> {
  const { fazendaId, fazendaNome, usuarioId } = contexto;
  const hoje = new Date().toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long", year: "numeric" });

  const systemPrompt = `Você é o assistente de gestão agrícola da fazenda *${fazendaNome}*, operando via WhatsApp.
Hoje é ${hoje}.

Seu papel: ajudar o produtor rural a consultar informações do ERP (financeiro, estoque, lavoura, contratos) e registrar operações do dia a dia.

Instruções de comportamento:
- Responda em português, de forma direta e prática. Sem rodeios.
- Use formatação WhatsApp: *negrito*, _itálico_, listas com •
- Se tiver dados suficientes para executar uma ferramenta, execute — não peça confirmação antes de consultar.
- Para registros (inserções), peça apenas os dados que faltam, depois registre diretamente. Seja ágil.
- Se o produtor cumprimentar ou não tiver intenção clara, diga brevemente o que você pode fazer (em 3-4 linhas curtas) e pergunte como pode ajudar.
- Nunca invente dados financeiros. Se não souber, use as ferramentas.
- Quando o usuário disser "cancelar" ou "sair", encerre a conversa educadamente.`;

  const messages: Anthropic.MessageParam[] = [
    ...historico.map(m => ({ role: m.role, content: m.content })),
    { role: "user", content: texto },
  ];

  // Primeira chamada — Claude pode chamar ferramentas
  let response = await claude.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 1024,
    system: systemPrompt,
    tools: TOOLS,
    messages,
  });

  // Loop de tool use — Claude pode chamar múltiplas ferramentas
  while (response.stop_reason === "tool_use") {
    const assistantContent = response.content;
    const toolResults: Anthropic.ToolResultBlockParam[] = [];

    for (const block of assistantContent) {
      if (block.type === "tool_use") {
        console.log(`[CLAUDE-TOOL] chamando ${block.name}:`, JSON.stringify(block.input).slice(0, 100));
        const resultado = await executarFerramenta(
          block.name,
          block.input as Record<string, unknown>,
          fazendaId,
          usuarioId,
        );
        toolResults.push({ type: "tool_result", tool_use_id: block.id, content: resultado });
      }
    }

    // Segunda chamada com os resultados das ferramentas
    response = await claude.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1024,
      system: systemPrompt,
      tools: TOOLS,
      messages: [
        ...messages,
        { role: "assistant", content: assistantContent },
        { role: "user", content: toolResults },
      ],
    });
  }

  const texto_resposta = response.content
    .filter(b => b.type === "text")
    .map(b => (b as Anthropic.TextBlock).text)
    .join("\n")
    .trim();

  return texto_resposta || "Não consegui processar. Tente novamente.";
}
