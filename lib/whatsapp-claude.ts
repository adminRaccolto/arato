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
    description: "Registra abastecimento de combustível. Lança CP (já pago ou a vencer) e movimenta estoque. Chame com os dados que tiver — a ferramenta pede o que faltar.",
    input_schema: {
      type: "object" as const,
      properties: {
        produto: { type: "string", description: "diesel s10, gasolina, etanol, arla etc" },
        quantidade: { type: "number", description: "Litros abastecidos" },
        valor: { type: "number", description: "Valor total em R$. Se informado preço/litro, calcule: quantidade × preço" },
        veiculo: { type: "string", description: "Nome, placa ou descrição do veículo/máquina (opcional)" },
        bomba_nome: { type: "string", description: "Nome da bomba ou posto usado. Informe quando o usuário mencionar onde abasteceu (ex: 'Posto', 'Bomba 1', 'Posto Shell'). Isso registra o abastecimento no histórico." },
        tipo_destino: { type: "string", enum: ["estoque", "direto"], description: "'estoque': comprou para repor o tanque interno da fazenda (deduz estoque). 'direto': abasteceu em posto externo ou direto na máquina sem passar pelo estoque — não há dedução de estoque. Padrão: direto." },
        vencimento: { type: "string", description: "Data de vencimento: hoje, amanhã, dd/mm/aaaa ou 'à vista'" },
        ja_pago: { type: "string", enum: ["sim", "nao"], description: "PAGAMENTO já feito (dinheiro transferido). Use 'sim' quando o usuário disser que já pagou, é à vista, pagou em dinheiro, débito ou PIX. IMPORTANTE: 'ja_pago' refere-se ao dinheiro pago, NÃO à nota fiscal — mesmo que a NF chegue depois, se o dinheiro já saiu use 'sim'." },
        forma_pagamento: { type: "string", description: "Forma de pagamento: dinheiro, PIX, débito, boleto etc" },
        conta_bancaria: { type: "string", description: "Nome da conta bancária usada para pagamento (ex: Sicredi, Bradesco, Caixa, Caixa Fazenda). Só preencha quando o usuário mencionar a conta." },
      },
      required: ["produto"],
    },
  },
  {
    name: "registrar_operacao_lavoura",
    description: "Registra uma operação de lavoura: pulverização, adubação, plantio ou correção de solo.",
    input_schema: {
      type: "object" as const,
      properties: {
        tipo_op: { type: "string", enum: ["pulverizacao", "adubacao", "plantio", "correcao_solo"], description: "Tipo de operação" },
        tipo_produto: { type: "string", enum: ["herbicida", "fungicida", "inseticida", "nematicida", "acaricida", "fertilizante_foliar", "regulador", "dessecacao", "outros"], description: "Tipo do produto aplicado (para pulverização)" },
        talhao: { type: "string", description: "Nome ou número do talhão" },
        produto: { type: "string", description: "Nome do insumo/produto aplicado" },
        dose: { type: "number", description: "Dose aplicada numericamente" },
        unidade: { type: "string", description: "L/ha, ml/ha, kg/ha, g/ha, sc/ha, etc" },
        area_ha: { type: "number", description: "Área em hectares onde a operação foi realizada" },
        ciclo: { type: "string", description: "Nome, descrição ou número do ciclo/safra (ex: 'milho safrinha', 'ciclo 2', 'soja 25/26')" },
        data_op: { type: "string", description: "Data da operação: hoje, ontem, ou dd/mm/aaaa" },
      },
      required: ["tipo_op", "talhao", "produto"],
    },
  },
  {
    name: "registrar_conta_pagar",
    description: "Lança uma conta a pagar no financeiro. Use ja_pago=sim quando o usuário diz que já pagou ou é à vista. Chame com os dados disponíveis — a ferramenta pede o que faltar.",
    input_schema: {
      type: "object" as const,
      properties: {
        descricao: { type: "string", description: "Descrição da conta" },
        valor: { type: "number", description: "Valor em R$" },
        vencimento: { type: "string", description: "Data de vencimento: hoje, amanhã, ou dd/mm/aaaa" },
        fornecedor: { type: "string", description: "Nome do fornecedor (opcional)" },
        categoria: { type: "string", description: "combustivel, defensivos, fertilizantes, arrendamento, manutencao, outros (opcional)" },
        ja_pago: { type: "string", enum: ["sim", "nao"], description: "Use 'sim' quando já foi pago, é à vista ou o usuário pede para lançar como pago/baixado" },
        conta_bancaria: { type: "string", description: "Nome da conta bancária usada para pagamento (ex: Sicredi, Bradesco, Caixa). Só preencha quando o usuário mencionar a conta." },
      },
      required: ["descricao"],
    },
  },
  {
    name: "registrar_conta_receber",
    description: "Lança uma conta a receber no financeiro. Chame com os dados disponíveis — a ferramenta pede o que faltar.",
    input_schema: {
      type: "object" as const,
      properties: {
        descricao: { type: "string", description: "Descrição da receita" },
        valor: { type: "number", description: "Valor em R$" },
        vencimento: { type: "string", description: "Data de recebimento: hoje, amanhã, ou dd/mm/aaaa" },
        cliente: { type: "string", description: "Nome do cliente/comprador (opcional)" },
        conta_bancaria: { type: "string", description: "Nome da conta bancária onde o recebimento será creditado (ex: Sicredi, Bradesco). Só preencha quando o usuário mencionar a conta." },
        ja_recebido: { type: "string", enum: ["sim", "nao"], description: "Use 'sim' quando o usuário disser que já recebeu / já caiu na conta. CR será lançado como baixado." },
      },
      required: ["descricao"],
    },
  },
  {
    name: "vincular_nf",
    description: "Vincula uma nota fiscal (NF-e) a um lançamento de Contas a Pagar existente. Use quando o usuário informar que chegou a nota fiscal de uma compra anterior (ex: 'chegou a NF 001234 do abastecimento').",
    input_schema: {
      type: "object" as const,
      properties: {
        nf_numero:   { type: "string", description: "Número da nota fiscal (ex: 001234)" },
        nf_emitente: { type: "string", description: "Nome do emitente/fornecedor (ex: Posto Shell, Agroloja)" },
        busca:       { type: "string", description: "Trecho da descrição do lançamento para localizar o CP correto (ex: 'abastecimento diesel', 'posto')" },
      },
      required: ["nf_numero"],
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
          bomba_nome: input.bomba_nome ?? "",
          tipo_destino: input.tipo_destino ?? "direto",
          vencimento: input.vencimento ?? "hoje",
          ja_pago: input.ja_pago ?? "nao",
          forma_pagamento: input.forma_pagamento ?? "",
          conta_bancaria: input.conta_bancaria ?? "",
          tem_nf: "nao",
        }, fazendaId, usuarioId);
        return res.mensagem;
      }
      case "registrar_operacao_lavoura": {
        const res = await executarInsercao("operacao_lavoura", {
          tipo_op: String(input.tipo_op ?? "pulverizacao"),
          tipo_produto: String(input.tipo_produto ?? "herbicida"),
          talhao: input.talhao,
          produto: input.produto,
          dose: input.dose ?? 0,
          unidade: input.unidade ?? "L/ha",
          area_ha: input.area_ha ?? 0,
          ciclo: input.ciclo ?? "",
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
          ja_pago: input.ja_pago ?? "nao",
          conta_bancaria: input.conta_bancaria ?? "",
        }, fazendaId, usuarioId);
        return res.mensagem;
      }
      case "registrar_conta_receber": {
        const res = await executarInsercao("lancar_cr", {
          descricao: input.descricao,
          valor: input.valor,
          vencimento: input.vencimento,
          cliente: input.cliente ?? "",
          conta_bancaria: input.conta_bancaria ?? "",
          ja_recebido: input.ja_recebido ?? "nao",
        }, fazendaId, usuarioId);
        return res.mensagem;
      }
      case "vincular_nf": {
        const res = await executarInsercao("vincular_nf", {
          nf_numero:   input.nf_numero,
          nf_emitente: input.nf_emitente ?? "",
          busca:       input.busca ?? "",
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

  const systemPrompt = `Você é o *Arato*, assistente de gestão agrícola da fazenda *${fazendaNome}*, operando via WhatsApp.
Hoje é ${hoje}.

Seu papel: ajudar o produtor a consultar informações do ERP e registrar operações do dia a dia.

REGRA #1 — REGISTROS SEMPRE VÃO PELA FERRAMENTA:
Quando o usuário pedir para registrar qualquer coisa (operação de lavoura, abastecimento, conta, estoque):
- Chame a ferramenta IMEDIATAMENTE com os dados que tiver, mesmo que incompletos.
- NÃO faça perguntas antes de chamar a ferramenta. Chame primeiro, a ferramenta pergunta o que falta.
- Se a ferramenta retornar ❓pergunta, repasse a pergunta ao usuário.
- Quando o usuário responder, chame a ferramenta NOVAMENTE com TODOS os dados acumulados (anteriores + novos).
- Só confirme "registrado" quando a ferramenta retornar ✅.

REGRA #2 — COPIE O RESULTADO EXATAMENTE:
- Quando a ferramenta retornar texto, copie-o PALAVRA POR PALAVRA para o usuário.
- NÃO reformate, NÃO crie novas listas, NÃO adicione campos extras como "Tipo:", "Ciclo:", "Área:", "Data:".
- Se a ferramenta retornou "✅ Pulverização registrada!\n• Talhão: X\n• Produto: Y", escreva exatamente isso.
- PROIBIDO: gerar ✅ com bullet list de campos de entrada (Tipo / Talhão / Área / Ciclo / Data) sem que a ferramenta tenha retornado esse formato.

REGRA #3 — ja_pago vs nota fiscal:
- ja_pago="sim" = dinheiro já saiu da conta. "paguei em dinheiro/pix/débito/à vista" → ja_pago="sim".
- Nota fiscal é separada — pode chegar depois. Não afeta ja_pago.

REGRA #4 — CONTEXTO CONTÍNUO:
- Ao responder, leia o histórico completo da conversa.
- Se a ferramenta pediu uma informação e o usuário respondeu, use os dados acumulados na próxima chamada.
- NUNCA peça novamente algo que o usuário já informou.

COMPORTAMENTO GERAL:
- Seu nome é Arato. Responda em português, direto e prático.
- Use formatação WhatsApp: *negrito*, _itálico_, listas com •
- Para consultas (não registros): use as ferramentas de consulta.
- Se o produtor cumprimentar sem intenção clara, apresente-se brevemente (3-4 linhas).
- Nunca invente dados financeiros. Se não souber, use as ferramentas.
- Quando o usuário disser "cancelar" ou "sair", encerre educadamente.`;

  const messages: Anthropic.MessageParam[] = [
    ...historico.map(m => ({ role: m.role, content: m.content })),
    { role: "user", content: texto },
  ];

  // Primeira chamada — Claude pode chamar ferramentas
  let response = await claude.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 1024,
    system: systemPrompt,
    tools: TOOLS,
    messages,
  });

  console.log(`[CLAUDE] stop=${response.stop_reason} blocks=${response.content.length}`);
  if (response.stop_reason !== "tool_use") {
    const txt = response.content.filter(b => b.type === "text").map(b => (b as Anthropic.TextBlock).text).join("").slice(0, 300);
    console.log(`[CLAUDE] texto: ${txt}`);
  }

  // Loop de tool use — Claude pode chamar múltiplas ferramentas
  let ultimosResultados: string[] = [];
  let iteracoes = 0;
  while (response.stop_reason === "tool_use" && iteracoes < 6) {
    iteracoes++;
    const assistantContent = response.content;
    const toolResults: Anthropic.ToolResultBlockParam[] = [];
    ultimosResultados = [];

    for (const block of assistantContent) {
      if (block.type === "tool_use") {
        console.log(`[CLAUDE-TOOL] chamando ${block.name}:`, JSON.stringify(block.input).slice(0, 120));
        const resultado = await executarFerramenta(
          block.name,
          block.input as Record<string, unknown>,
          fazendaId,
          usuarioId,
        );
        toolResults.push({ type: "tool_result", tool_use_id: block.id, content: resultado });
        ultimosResultados.push(resultado);
      }
    }

    // Próxima chamada com os resultados das ferramentas
    response = await claude.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 2048,
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

  // Fallback: se Claude não gerou texto mas executou ferramentas, encaminha o resultado diretamente
  if (!texto_resposta) {
    console.error("[CLAUDE] resposta vazia. stop_reason:", response.stop_reason, "iteracoes:", iteracoes, "ultimo_resultado:", ultimosResultados[0]?.slice(0, 100));
    if (ultimosResultados.length > 0) return ultimosResultados.join("\n\n");
  }

  return texto_resposta || "Não consegui processar. Tente novamente.";
}
