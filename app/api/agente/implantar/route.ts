import { NextRequest, NextResponse } from "next/server";
import { createClient, SupabaseClient } from "@supabase/supabase-js";

// ─── Types ────────────────────────────────────────────────────────────────────

interface AnthropicMessage {
  role: "user" | "assistant";
  content: string | AnthropicBlock[];
}

interface AnthropicBlock {
  type: "text" | "tool_use" | "tool_result";
  id?: string;
  text?: string;
  name?: string;
  input?: Record<string, unknown>;
  tool_use_id?: string;
  content?: string;
}

interface OnboardingRecord {
  id: string;
  telefone: string;
  conta_id: string | null;
  fazenda_id: string | null;
  etapa: string;
  dados_coletados: Record<string, unknown>;
  messages: AnthropicMessage[];
  concluido: boolean;
}

// ─── System prompt ────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `Você é o Assistente de Implantação do Arato — sistema de gestão agrícola para produtores rurais do Centro-Oeste brasileiro.

Sua missão: conduzir o onboarding completo de um novo cliente via WhatsApp, coletando dados e configurando o sistema automaticamente, de forma autônoma.

## Comportamento
- Fale sempre em português do Brasil, de forma clara e amigável
- Colete UM dado de cada vez — não sobrecarregue com muitas perguntas simultâneas
- SEMPRE confirme os dados antes de salvar: "Fazenda Boa Vista, 1.500 ha, Nova Mutum/MT — está correto?"
- Só salve e avance após a confirmação do cliente
- Emita confirmação após cada save: "✅ Fazenda cadastrada!"
- Se o cliente errar, corrija sem julgamento
- Seja paciente — o cliente pode responder horas depois e você retoma de onde parou

## Fluxo do onboarding (8 etapas — use verificar_etapa no início de cada resposta)

**Etapa: inicio**
Apresente-se e explique que vai configurar o Arato em 7 passos simples.
Pergunte se está pronto para começar.

**Etapa: fazenda**
Colete:
1. Nome da fazenda
2. Município e estado (ex: Nova Mutum/MT)
3. Área total em hectares
4. CAR (Cadastro Ambiental Rural) — opcional, pode pular
5. NIRF — opcional, pode pular
Confirme todos → use salvar_fazenda → avance automaticamente para talhoes

**Etapa: talhoes**
Colete talhões um por um:
- Nome (ex: Talhão 1, Gleba Norte, etc.)
- Área em ha
- Cultura predominante — opcional
Após cada talhão: "Tem mais talhões para cadastrar?"
Quando terminar → use confirmar_talhoes → avance para produtores

**Etapa: produtores**
Colete os produtores/proprietários (podem ser vários):
- Nome completo
- CPF (PF) ou CNPJ (PJ)
- E-mail (será o acesso ao sistema — peça com atenção)
- Telefone — opcional
"Tem mais produtores para cadastrar?" → use salvar_produtor para cada um
Quando terminar → avance para ciclo

**Etapa: ciclo**
Colete a safra atual:
- Cultura principal (soja, milho safrinha, algodão, etc.)
- Ano safra (ex: 2025/2026)
Confirme → use salvar_ciclo → avance para fiscal

**Etapa: fiscal**
Colete os dados fiscais:
- CNPJ do emitente (da fazenda ou empresa)
- Inscrição Estadual (IE)
- Série da NF-e (padrão: 1)
Informe: "O sistema iniciará em modo Homologação para testes — você altera para Produção quando estiver pronto."
Confirme → use salvar_parametros_fiscais → avance para usuario

**Etapa: usuario**
Use o e-mail do primeiro produtor cadastrado.
Pergunte: "Vou criar o acesso para [email]. Confirma?"
Use criar_usuario → sistema envia e-mail de convite automaticamente
→ avance para concluido

**Etapa: concluido**
Use concluir_onboarding e envie resumo completo:
- Fazenda: [nome] ([área] ha, [município/estado])
- Talhões: [lista com área]
- Produtores: [lista]
- Ciclo: [cultura] [ano safra]
- Parâmetros fiscais: ✅
- Acesso criado: ✅ convite enviado para [email]

Finalize com:
"O Arato está pronto! Acesse https://arato.agr.br e entre com o link enviado por e-mail. Qualquer dúvida, estou aqui. Bom trabalho na lavoura! 🌱"

## Regras importantes
- SEMPRE use verificar_etapa como primeira ferramenta de cada resposta
- Nunca avance etapas sem salvar os dados correspondentes
- Nunca crie usuário antes de ter o e-mail do produtor confirmado
- Se o cliente digitar dados com erro óbvio (CPF sem 11 dígitos, e-mail sem @), sinalize`;

// ─── Tools ───────────────────────────────────────────────────────────────────

const TOOLS = [
  {
    name: "verificar_etapa",
    description: "Verifica a etapa atual do onboarding e os dados já coletados. Use SEMPRE no início de cada resposta.",
    input_schema: { type: "object" as const, properties: {}, required: [] },
  },
  {
    name: "salvar_fazenda",
    description: "Salva os dados da fazenda no banco. Só chame após confirmação explícita do cliente.",
    input_schema: {
      type: "object" as const,
      properties: {
        nome: { type: "string" },
        municipio: { type: "string" },
        estado: { type: "string" },
        area_total_ha: { type: "number" },
        car: { type: "string" },
        nirf: { type: "string" },
      },
      required: ["nome", "municipio", "estado", "area_total_ha"],
    },
  },
  {
    name: "salvar_talhao",
    description: "Salva um talhão da fazenda. Chame uma vez para cada talhão confirmado.",
    input_schema: {
      type: "object" as const,
      properties: {
        nome: { type: "string" },
        area_ha: { type: "number" },
        cultura_predominante: { type: "string" },
      },
      required: ["nome", "area_ha"],
    },
  },
  {
    name: "confirmar_talhoes",
    description: "Marca a etapa de talhões como concluída quando o cliente confirmar que não tem mais talhões.",
    input_schema: { type: "object" as const, properties: {}, required: [] },
  },
  {
    name: "salvar_produtor",
    description: "Salva um produtor/proprietário. Chame uma vez para cada produtor confirmado.",
    input_schema: {
      type: "object" as const,
      properties: {
        nome: { type: "string" },
        tipo: { type: "string", enum: ["pf", "pj"] },
        cpf_cnpj: { type: "string" },
        email: { type: "string" },
        telefone: { type: "string" },
      },
      required: ["nome", "tipo", "cpf_cnpj"],
    },
  },
  {
    name: "salvar_ciclo",
    description: "Salva o ciclo agrícola atual (ano safra + cultura). Chame após confirmação.",
    input_schema: {
      type: "object" as const,
      properties: {
        cultura: { type: "string" },
        ano_safra: { type: "string", description: "Ex: 2025/2026" },
      },
      required: ["cultura", "ano_safra"],
    },
  },
  {
    name: "salvar_parametros_fiscais",
    description: "Salva os parâmetros fiscais da fazenda.",
    input_schema: {
      type: "object" as const,
      properties: {
        cnpj_emitente: { type: "string" },
        inscricao_estadual: { type: "string" },
        serie_nfe: { type: "string" },
      },
      required: ["cnpj_emitente"],
    },
  },
  {
    name: "criar_usuario",
    description: "Cria o acesso ao sistema e envia e-mail de convite. Chame após confirmar o e-mail com o cliente.",
    input_schema: {
      type: "object" as const,
      properties: {
        email: { type: "string" },
        nome: { type: "string" },
      },
      required: ["email", "nome"],
    },
  },
  {
    name: "concluir_onboarding",
    description: "Marca o onboarding como concluído. Chame após criar_usuario bem-sucedido.",
    input_schema: { type: "object" as const, properties: {}, required: [] },
  },
];

// ─── Tool executor ────────────────────────────────────────────────────────────

async function executeTool(
  toolName: string,
  input: Record<string, unknown>,
  onboarding: OnboardingRecord,
  db: SupabaseClient
): Promise<{ result: unknown; updates?: Partial<OnboardingRecord> }> {

  const dados = onboarding.dados_coletados;

  switch (toolName) {
    case "verificar_etapa":
      return {
        result: {
          etapa: onboarding.etapa,
          conta_id: onboarding.conta_id,
          fazenda_id: onboarding.fazenda_id,
          dados_coletados: dados,
        },
      };

    case "salvar_fazenda": {
      // Criar conta antes da fazenda
      const { data: conta } = await db
        .from("contas")
        .insert({ nome: input.nome as string, tipo: "pf" })
        .select("id")
        .single();

      if (!conta?.id) return { result: { erro: "Falha ao criar conta" } };

      const { data: fazenda, error } = await db
        .from("fazendas")
        .insert({
          nome: input.nome,
          municipio: input.municipio,
          estado: input.estado,
          area_total_ha: input.area_total_ha,
          car: input.car ?? null,
          nirf: input.nirf ?? null,
          conta_id: conta.id,
        })
        .select("id")
        .single();

      if (error || !fazenda?.id) return { result: { erro: error?.message ?? "Falha ao criar fazenda" } };

      return {
        result: { ok: true, fazenda_id: fazenda.id, conta_id: conta.id },
        updates: {
          conta_id: conta.id,
          fazenda_id: fazenda.id,
          etapa: "talhoes",
          dados_coletados: { ...dados, fazenda: input, fazenda_id: fazenda.id, conta_id: conta.id },
        },
      };
    }

    case "salvar_talhao": {
      if (!onboarding.fazenda_id) return { result: { erro: "Fazenda não cadastrada ainda" } };

      const { data: talhao, error } = await db
        .from("talhoes")
        .insert({
          nome: input.nome,
          fazenda_id: onboarding.fazenda_id,
          area_ha: input.area_ha,
          cultura_predominante: input.cultura_predominante ?? null,
        })
        .select("id")
        .single();

      if (error) return { result: { erro: error.message } };

      const talhoes = (dados.talhoes as unknown[]) ?? [];
      return {
        result: { ok: true, talhao_id: talhao?.id },
        updates: {
          dados_coletados: { ...dados, talhoes: [...talhoes, { ...input, id: talhao?.id }] },
        },
      };
    }

    case "confirmar_talhoes":
      return {
        result: { ok: true },
        updates: { etapa: "produtores" },
      };

    case "salvar_produtor": {
      if (!onboarding.fazenda_id || !onboarding.conta_id)
        return { result: { erro: "Fazenda não cadastrada ainda" } };

      const { data: produtor, error } = await db
        .from("produtores")
        .insert({
          nome: input.nome,
          tipo: input.tipo,
          cpf_cnpj: input.cpf_cnpj ?? null,
          email: input.email ?? null,
          telefone: input.telefone ?? null,
          fazenda_id: onboarding.fazenda_id,
          conta_id: onboarding.conta_id,
        })
        .select("id")
        .single();

      if (error) return { result: { erro: error.message } };

      const produtores = (dados.produtores as unknown[]) ?? [];
      const novoProd = { ...input, id: produtor?.id };
      const updates: Partial<OnboardingRecord> = {
        dados_coletados: { ...dados, produtores: [...produtores, novoProd] },
      };
      // Avança etapa apenas na primeira vez (vai para ciclo quando confirmar)
      if (produtores.length === 0) {
        updates.etapa = "produtores"; // mantém — aguarda "tem mais?"
      }
      return { result: { ok: true, produtor_id: produtor?.id }, updates };
    }

    case "salvar_ciclo": {
      if (!onboarding.fazenda_id) return { result: { erro: "Fazenda não cadastrada ainda" } };

      const anoSafra = input.ano_safra as string;
      const [anoInicio] = anoSafra.split("/");
      const dataInicio = `${anoInicio}-07-01`;
      const dataFim = `${parseInt(anoInicio) + 1}-06-30`;

      // Cria ano_safra
      const { data: anoSafraRec, error: e1 } = await db
        .from("anos_safra")
        .insert({
          fazenda_id: onboarding.fazenda_id,
          descricao: anoSafra,
          data_inicio: dataInicio,
          data_fim: dataFim,
          status: "ativa",
        })
        .select("id")
        .single();

      if (e1 || !anoSafraRec?.id) return { result: { erro: e1?.message ?? "Falha ao criar ano safra" } };

      const cultura = input.cultura as string;
      const { data: ciclo, error: e2 } = await db
        .from("ciclos")
        .insert({
          fazenda_id: onboarding.fazenda_id,
          ano_safra_id: anoSafraRec.id,
          cultura,
          descricao: `${cultura} ${anoSafra}`,
          data_inicio: dataInicio,
          data_fim: dataFim,
        })
        .select("id")
        .single();

      if (e2) return { result: { erro: e2.message } };

      return {
        result: { ok: true, ciclo_id: ciclo?.id, ano_safra_id: anoSafraRec.id },
        updates: {
          etapa: "fiscal",
          dados_coletados: { ...dados, ciclo: input, ciclo_id: ciclo?.id },
        },
      };
    }

    case "salvar_parametros_fiscais": {
      if (!onboarding.fazenda_id) return { result: { erro: "Fazenda não cadastrada ainda" } };

      const config = {
        cnpj_emitente: input.cnpj_emitente,
        ie: input.inscricao_estadual ?? "",
        serie: input.serie_nfe ?? "1",
        ambiente: "homologacao",
      };

      await db
        .from("configuracoes_modulo")
        .upsert({
          fazenda_id: onboarding.fazenda_id,
          modulo: "fiscal",
          configuracao: config,
        }, { onConflict: "fazenda_id,modulo" });

      return {
        result: { ok: true },
        updates: {
          etapa: "usuario",
          dados_coletados: { ...dados, fiscal: config },
        },
      };
    }

    case "criar_usuario": {
      if (!onboarding.conta_id || !onboarding.fazenda_id)
        return { result: { erro: "Dados incompletos para criar usuário" } };

      const email = input.email as string;
      const nome = input.nome as string;

      // Cria usuário via Supabase Auth Admin
      const { data: authUser, error: authErr } = await db.auth.admin.createUser({
        email,
        email_confirm: true,
        user_metadata: { nome },
      });

      if (authErr || !authUser.user?.id) {
        // Se já existe, tenta buscar
        if (authErr?.message?.includes("already")) {
          return { result: { ok: true, aviso: "Usuário já existe — perfil atualizado." } };
        }
        return { result: { erro: authErr?.message ?? "Falha ao criar usuário" } };
      }

      // Cria perfil
      await db.from("perfis").upsert({
        user_id: authUser.user.id,
        conta_id: onboarding.conta_id,
        fazenda_id: onboarding.fazenda_id,
        email,
        nome,
        role: "produtor",
      }, { onConflict: "user_id" });

      // Gera link de convite
      const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://arato.agr.br";
      await db.auth.admin.generateLink({
        type: "invite",
        email,
        options: { redirectTo: `${appUrl}/login` },
      });

      return {
        result: { ok: true, user_id: authUser.user.id },
        updates: {
          dados_coletados: { ...dados, usuario: { email, nome, user_id: authUser.user.id } },
        },
      };
    }

    case "concluir_onboarding":
      return {
        result: { ok: true },
        updates: { etapa: "concluido", concluido: true },
      };

    default:
      return { result: { erro: `Ferramenta desconhecida: ${toolName}` } };
  }
}

// ─── Agent loop ───────────────────────────────────────────────────────────────

async function runAgentLoop(
  messages: AnthropicMessage[],
  onboarding: OnboardingRecord,
  db: SupabaseClient
): Promise<{ resposta: string; updatedOnboarding: OnboardingRecord }> {
  const apiKey = process.env.ANTHROPIC_API_KEY!;
  let current = [...messages];
  let state = { ...onboarding };

  for (let iter = 0; iter < 12; iter++) {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-5",
        max_tokens: 1024,
        system: SYSTEM_PROMPT,
        tools: TOOLS,
        messages: current,
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Anthropic API error: ${err}`);
    }

    const data = await res.json() as {
      stop_reason: string;
      content: AnthropicBlock[];
    };

    if (data.stop_reason === "end_turn") {
      const text = data.content.find(b => b.type === "text")?.text ?? "";
      current.push({ role: "assistant", content: data.content });
      return { resposta: text, updatedOnboarding: { ...state, messages: current } };
    }

    if (data.stop_reason === "tool_use") {
      current.push({ role: "assistant", content: data.content });

      const toolResults: AnthropicBlock[] = [];

      for (const block of data.content) {
        if (block.type !== "tool_use" || !block.name || !block.id) continue;

        const { result, updates } = await executeTool(
          block.name,
          block.input ?? {},
          state,
          db
        );

        // Aplica updates ao estado local antes do próximo loop
        if (updates) {
          state = { ...state, ...updates };
          if (updates.dados_coletados) {
            state.dados_coletados = updates.dados_coletados;
          }
        }

        toolResults.push({
          type: "tool_result",
          tool_use_id: block.id,
          content: JSON.stringify(result),
        });
      }

      current.push({ role: "user", content: toolResults });
      continue;
    }

    // stop_reason desconhecido — encerra
    break;
  }

  return {
    resposta: "Processo em andamento. Por favor, aguarde.",
    updatedOnboarding: { ...state, messages: current },
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

async function upsertOnboarding(
  telefone: string,
  db: SupabaseClient
): Promise<OnboardingRecord> {
  const { data } = await db
    .from("agente_onboarding")
    .upsert({ telefone }, { onConflict: "telefone" })
    .select()
    .single();

  if (data) return data as OnboardingRecord;

  // Fallback: busca se já existia
  const { data: existing } = await db
    .from("agente_onboarding")
    .select()
    .eq("telefone", telefone)
    .single();

  return (existing as OnboardingRecord) ?? {
    id: "",
    telefone,
    conta_id: null,
    fazenda_id: null,
    etapa: "inicio",
    dados_coletados: {},
    messages: [],
    concluido: false,
  };
}

async function saveOnboarding(rec: OnboardingRecord, db: SupabaseClient) {
  if (!rec.id) return;
  await db
    .from("agente_onboarding")
    .update({
      conta_id: rec.conta_id,
      fazenda_id: rec.fazenda_id,
      etapa: rec.etapa,
      dados_coletados: rec.dados_coletados,
      messages: rec.messages,
      concluido: rec.concluido,
      updated_at: new Date().toISOString(),
    })
    .eq("id", rec.id);
}

async function enviarWhatsApp(telefone: string, mensagem: string) {
  const instanceId = process.env.ZAPI_INSTANCE_ID;
  const token = process.env.ZAPI_TOKEN;
  const clientToken = process.env.ZAPI_CLIENT_TOKEN;

  if (!instanceId || !token || telefone === "test") return;

  await fetch(
    `https://api.z-api.io/instances/${instanceId}/token/${token}/send-text`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(clientToken ? { "Client-Token": clientToken } : {}),
      },
      body: JSON.stringify({ phone: telefone, message: mensagem }),
    }
  ).catch(() => {/* ignora erro de envio */});
}

// ─── Main handler ─────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as Record<string, unknown>;

    // Detecta se é webhook Z-API ou chamada direta do painel admin
    let telefone: string;
    let mensagemTexto: string;
    const modoTeste = !!body.modo_teste;

    if (body.type === "ReceivedCallback" || body.fromMe === false) {
      // Formato Z-API
      if (body.fromMe === true) return NextResponse.json({ ok: true }); // ignora mensagens próprias
      telefone = (body.phone as string) ?? "";
      mensagemTexto = ((body.text as Record<string, string>)?.message ?? "").trim();
    } else {
      // Chamada direta (painel admin ou teste)
      telefone = (body.telefone as string) ?? "test";
      mensagemTexto = (body.mensagem as string) ?? "";
    }

    if (!telefone || !mensagemTexto) {
      return NextResponse.json({ ok: true }); // webhook pode enviar outros tipos — ignorar
    }

    const db = getSupabaseAdmin();
    let onboarding = await upsertOnboarding(telefone, db);

    // Adiciona mensagem do usuário ao histórico
    const messages: AnthropicMessage[] = [
      ...(onboarding.messages as AnthropicMessage[]),
      { role: "user", content: mensagemTexto },
    ];

    const { resposta, updatedOnboarding } = await runAgentLoop(
      messages,
      onboarding,
      db
    );

    // Persiste estado atualizado
    onboarding = updatedOnboarding;
    await saveOnboarding(onboarding, db);

    // Envia resposta pelo WhatsApp (se não for modo teste)
    if (!modoTeste) {
      await enviarWhatsApp(telefone, resposta);
    }

    return NextResponse.json({ ok: true, resposta, etapa: onboarding.etapa });
  } catch (err) {
    console.error("Agente Implantador error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

// GET para health check do webhook
export async function GET() {
  return NextResponse.json({ status: "Agente Implantador online" });
}
