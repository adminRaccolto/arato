import { NextRequest, NextResponse } from "next/server";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { enviarTexto } from "../../../../lib/whatsapp-evolution";
import { seedOperacoesGerenciais } from "../../../../lib/seedOperacoesGerenciais";

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

const SYSTEM_PROMPT = `Você é o assistente de implantação do Arato, sistema de gestão agrícola para produtores rurais do Centro-Oeste. Você conversa com o cliente pelo WhatsApp, como uma pessoa da equipe faria: natural, cordial e objetiva.

## Como conversar
- Você já está em uma conversa em andamento. NUNCA repita apresentação, saudação ("Olá", "Bem-vindo") ou lista de passos depois da primeira mensagem. Responda direto ao que foi dito.
- Use o nome da pessoa assim que souber (ex.: "Obrigado, Anderson."). Use com moderação, sem repetir em toda frase.
- Faça UMA pergunta por vez. Respostas curtas, como num chat.
- Lembre do que já foi dito e não pergunte de novo o que o cliente já informou. Quando ele citar algo (ex.: o nome da fazenda), use isso na pergunta seguinte em vez de perguntar outra vez.
- Confirme antes de salvar, em uma frase ("Fazenda Ágape, em Nova Mutum/MT, 1.500 ha — está certo?"). Depois de salvar, confirme em uma frase ("Pronto, fazenda cadastrada.") e siga para o próximo passo.
- Se o cliente errar, corrija sem julgamento. Se ele demorar, retome de onde parou sem reclamar.
- Português do Brasil.

## Etapas (use verificar_etapa no início de cada resposta para saber onde está)

**inicio**: se for a primeira mensagem, cumprimente e diga que vai configurar o Arato em poucos passos. Se o cliente aceitar começar, use avancar_etapa para "responsavel". Se ele já tiver dito o nome da fazenda, não ignore: guarde e avance.

**responsavel**: pergunte o nome da pessoa que está fazendo a configuração. Quando ela responder, use salvar_responsavel e siga para "fazenda".

**fazenda**: colete nome da fazenda (se o cliente já tiver dito, use), município/UF, área total em ha, e CAR e NIRF se ele quiser informar (pode pular). Confirme e use salvar_fazenda. A etapa avança sozinha.

**talhoes**: um por vez, nome, área em ha e cultura (opcional). Pergunte se há mais. Ao terminar, use confirmar_talhoes.

**produtores**: nome, CPF ou CNPJ, e-mail (será o acesso ao sistema — confirme com atenção) e telefone (opcional). Use salvar_produtor para cada um. Ao terminar, avance para "ciclo".

**ciclo**: cultura principal e ano safra (ex.: 2026/2027). Confirme e use salvar_ciclo.

**fiscal**: CPF (produtor) ou CNPJ (empresa) do emitente, inscrição estadual (se houver), série da NF-e (padrão 1) e regime tributário: pergunte se é Simples Nacional (1), Simples com excesso de sublimite (2), Regime Normal (3) ou MEI (4). O regime é obrigatório para emitir NF-e. Diga que o sistema começa em homologação e que a troca para produção é feita depois. Confirme e use salvar_parametros_fiscais.

**usuario**: confirme o e-mail do primeiro produtor e use criar_usuario. Só crie depois da confirmação.

**concluido**: use concluir_onboarding e envie um resumo curto (fazenda, talhões, produtores, safra, fiscal e acesso enviado por e-mail), terminando com o endereço de acesso.

## Regras
- Use verificar_etapa primeiro em cada resposta.
- Nunca avance sem salvar os dados da etapa.
- Nunca crie usuário antes de confirmar o e-mail.
- Se o dado vier com erro óbvio (CPF com menos de 11 dígitos, e-mail sem @), avise e peça de novo.`;
// ─── Tools ───────────────────────────────────────────────────────────────────

const TOOLS = [
  {
    name: "avancar_etapa",
    description: "Avança o processo para a próxima etapa, quando o cliente confirmou que quer seguir (ex.: aceitou começar). Não use para pular dados.",
    input_schema: {
      type: "object" as const,
      properties: {
        etapa: { type: "string", enum: ["responsavel", "fazenda", "talhoes", "produtores", "ciclo", "fiscal", "usuario"] },
      },
      required: ["etapa"],
    },
  },
  {
    name: "salvar_responsavel",
    description: "Salva o nome de quem está fazendo a configuração (o contato do cliente) e avança para a etapa de fazenda.",
    input_schema: {
      type: "object" as const,
      properties: { nome: { type: "string" } },
      required: ["nome"],
    },
  },
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
        cnpj_emitente: { type: "string", description: "CPF (produtor) ou CNPJ (empresa) do emitente" },
        razao_social: { type: "string" },
        inscricao_estadual: { type: "string" },
        serie_nfe: { type: "string" },
        crt: { type: "string", enum: ["1", "2", "3", "4"], description: "Regime tributário: 1 Simples Nacional, 2 SN excesso de sublimite, 3 Regime Normal, 4 MEI" },
      },
      required: ["cnpj_emitente", "crt"],
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
    case "avancar_etapa":
      return { result: { ok: true, etapa: input.etapa }, updates: { etapa: String(input.etapa) } };

    case "salvar_responsavel":
      return {
        result: { ok: true },
        updates: {
          etapa: "fazenda",
          dados_coletados: { ...dados, responsavel: { nome: String(input.nome ?? "").trim() } },
        },
      };

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
          entidade_contabil: "pf",
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
          conta_id: onboarding.conta_id,
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

      // A emissão de NF-e lê a configuração do módulo fiscal_pf_<CPF> (produtor) ou
      // fiscal_emp_<CNPJ> (empresa), com as chaves do formulário de Parâmetros do Sistema.
      // Qualquer outro nome de módulo é ignorado pela emissão.
      const digitos = String(input.cnpj_emitente ?? "").replace(/\D/g, "");
      if (digitos.length !== 11 && digitos.length !== 14) {
        return { result: { erro: "CPF ou CNPJ do emitente inválido — precisa ter 11 ou 14 dígitos" } };
      }
      const modulo = (digitos.length === 11 ? "fiscal_pf_" : "fiscal_emp_") + digitos;
      const config = {
        cpf_cnpj_emitente: String(input.cnpj_emitente),
        razao_social: String(input.razao_social ?? (dados.responsavel as { nome?: string } | undefined)?.nome ?? ""),
        ie_emitente: String(input.inscricao_estadual ?? ""),
        serie_nfe: String(input.serie_nfe ?? "1"),
        numero_inicial: 1,
        ambiente: "homologacao",
        ...(input.crt ? { crt: String(input.crt) } : {}),
      };

      const { error: cfgErr } = await db
        .from("configuracoes_modulo")
        .upsert({
          fazenda_id: onboarding.fazenda_id,
          modulo,
          config,
        }, { onConflict: "fazenda_id,modulo" });
      if (cfgErr) return { result: { erro: "Falha ao salvar parâmetros fiscais: " + cfgErr.message } };

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

      // Registro em usuarios com o grupo "Gerente Geral" — sem ele o usuário entra sem permissões
      // (mesma regra de lib/criarClienteCompleto.ts).
      const { data: grupoGerente } = await db
        .from("grupos_usuarios")
        .select("id")
        .ilike("nome", "%gerente%")
        .or(`fazenda_id.is.null,fazenda_id.eq.${onboarding.fazenda_id}`)
        .maybeSingle();
      await db.from("usuarios").insert({
        fazenda_id: onboarding.fazenda_id,
        auth_user_id: authUser.user.id,
        nome,
        email,
        ativo: true,
        grupo_id: grupoGerente?.id ?? null,
      });

      // Operações gerenciais padrão — sem elas o lançamento de CP/CR não tem classificação para escolher
      try {
        await seedOperacoesGerenciais(onboarding.fazenda_id, db);
      } catch { /* não bloqueia o acesso; pode ser semeado depois */ }

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
        system: montarSystem(state),
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

// Mesmo critério do webhook: o número pode chegar com ou sem o 9 depois do DDD.
function variantesTelefone(telefone: string): string[] {
  const v = [telefone];
  if (telefone.startsWith("55") && telefone.length === 12) v.push(telefone.slice(0, 4) + "9" + telefone.slice(4));
  else if (telefone.startsWith("55") && telefone.length === 13) v.push(telefone.slice(0, 4) + telefone.slice(5));
  return v;
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
  if (!telefone || telefone.startsWith("test")) return;
  await enviarTexto(telefone, mensagem).catch(() => {/* ignora erro de envio */});
}

// Contexto da conversa, enviado a cada resposta: o modelo precisa saber o que já aconteceu
// (quem é a pessoa, onde está o processo, o que já foi salvo) para não recomeçar do zero.
function montarSystem(onboarding: OnboardingRecord): string {
  const d = onboarding.dados_coletados as Record<string, unknown>;
  const nome = (d.responsavel as { nome?: string } | undefined)?.nome;
  const fazenda = (d.fazenda as { nome?: string } | undefined)?.nome;
  const ja = onboarding.messages.length > 0;
  return SYSTEM_PROMPT + `

## Estado desta conversa (já aconteceu — não repita)
- Conversa já iniciada: ${ja ? "sim, NÃO se apresente de novo" : "não, é a primeira mensagem"}
- Nome de quem está configurando: ${nome ?? "ainda não informado"}
- Etapa atual: ${onboarding.etapa}
- Fazenda já salva: ${fazenda ?? "não"}
- Dados já coletados: ${JSON.stringify(d).slice(0, 1500)}`;
}

// ─── Main handler ─────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as Record<string, unknown>;

    // Detecta se é webhook Evolution API ou chamada direta do painel admin
    let telefone: string;
    let mensagemTexto: string;
    const modoTeste = !!body.modo_teste;

    if (body.event === "messages.upsert") {
      // Formato Evolution API — mesmo formato do webhook operacional
      const rawData = body.data;
      const data = (Array.isArray(rawData) ? rawData[0] : rawData) as Record<string, unknown> | undefined;
      if (!data) return NextResponse.json({ ok: true });

      const key = data.key as Record<string, unknown> | undefined;
      if (!key || key.fromMe === true) return NextResponse.json({ ok: true });

      const remoteJid = String(key.remoteJid ?? "");
      if (!remoteJid || remoteJid.includes("@g.us")) return NextResponse.json({ ok: true });

      telefone = remoteJid.replace(/@.*$/, "").replace(/\D/g, "");
      if (!telefone || telefone.length < 10) return NextResponse.json({ ok: true });

      const message = data.message as Record<string, unknown> | undefined;
      if (!message) return NextResponse.json({ ok: true });

      const messageType = String(data.messageType ?? "");
      if (messageType === "conversation") {
        mensagemTexto = String(message.conversation ?? "").trim();
      } else if (messageType === "extendedTextMessage") {
        mensagemTexto = String((message.extendedTextMessage as Record<string, unknown> | undefined)?.text ?? "").trim();
      } else {
        return NextResponse.json({ ok: true }); // ignora áudio/imagem no onboarding
      }
    } else {
      // Chamada direta (painel admin ou teste)
      telefone = (body.telefone as string) ?? "test";
      mensagemTexto = (body.mensagem as string) ?? "";
    }

    if (!telefone || !mensagemTexto) {
      return NextResponse.json({ ok: true }); // webhook pode enviar outros tipos — ignorar
    }

    const db = getSupabaseAdmin();
    // Usa o registro já vinculado à conta (o número pode vir com ou sem o 9), senão criaria outro sem conta
    const { data: vinculados } = await db.from("agente_onboarding").select("telefone").in("telefone", variantesTelefone(telefone)).limit(1);
    if (vinculados?.[0]?.telefone) telefone = vinculados[0].telefone as string;
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
