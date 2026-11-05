import { NextRequest, NextResponse } from "next/server";
import { createClient } from "../../../../lib/supabase-servidor";
import { CONHECIMENTO_OLIVIA } from "../../../../lib/conhecimento-olivia";
import { SYSTEM_PROMPT } from "../../../../lib/olivia/prompt";
import { montarMapaMenu, rotasInvalidas } from "../../../../lib/olivia/mapa-menu";
import { NAV } from "../../../../lib/navigation";
import { exigirAcessoFazenda, exigirLogin } from "../../../../lib/api-auth";

type MensagemChat = { role: "user" | "assistant"; content: string };

async function buscarContextoFazenda(fazenda_id: string): Promise<string> {
  try {
    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const [fazendaRes, ciclosRes, automacoesRes] = await Promise.all([
      supabaseAdmin
        .from("fazendas")
        .select("nome, municipio, estado")
        .eq("id", fazenda_id)
        .maybeSingle(),
      supabaseAdmin
        .from("ciclos")
        .select("cultura, descricao, fazenda_id, ano_safra_id")
        .or(`fazenda_id.eq.${fazenda_id}`)
        .order("created_at", { ascending: false })
        .limit(6),
      supabaseAdmin
        .from("automacoes_fazenda")
        .select("tipo, ativo")
        .eq("fazenda_id", fazenda_id),
    ]);

    let ctx = "\n\n## Contexto desta sessão (dados reais da fazenda do usuário)\n";

    const fazenda = fazendaRes.data;
    if (fazenda) {
      ctx += `- **Fazenda ativa:** ${fazenda.nome}${fazenda.municipio ? ` — ${fazenda.municipio}/${fazenda.estado ?? "MT"}` : ""}\n`;
    }

    const ciclos = ciclosRes.data ?? [];
    if (ciclos.length > 0) {
      const nomes = ciclos.map(c => c.cultura + (c.descricao ? ` (${c.descricao})` : "")).join(", ");
      ctx += `- **Ciclos cadastrados:** ${nomes}\n`;
    } else {
      ctx += `- **Ciclos:** nenhum cadastrado ainda\n`;
    }

    const automacoes = automacoesRes.data ?? [];
    const ativas = automacoes.filter(a => a.ativo).map(a => a.tipo);
    if (ativas.length > 0) {
      ctx += `- **Automações ativas:** ${ativas.join(", ")}\n`;
    } else {
      ctx += `- **Automações:** nenhuma ativada (usuário pode não ter configurado ainda)\n`;
    }

    ctx += "\nUse esses dados para personalizar suas respostas. Por exemplo, mencione o nome da fazenda e os ciclos reais ao explicar fluxos.\n";

    return ctx;
  } catch {
    return "";
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as {
      conversa_id: string;
      fazenda_id: string;
      mensagens: MensagemChat[];
    };

    const { fazenda_id, mensagens } = body;
    const negado = fazenda_id ? await exigirAcessoFazenda(req, fazenda_id) : await exigirLogin(req);
    if (negado) return negado;

    if (!mensagens || mensagens.length === 0) {
      return NextResponse.json({ error: "Nenhuma mensagem fornecida" }, { status: 400 });
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "ANTHROPIC_API_KEY não configurada" }, { status: 500 });
    }

    // Busca contexto dinâmico da fazenda para personalizar respostas
    const contextoDinamico = fazenda_id ? await buscarContextoFazenda(fazenda_id) : "";
    const systemPromptCompleto = SYSTEM_PROMPT + "\n\n---\n\n" + CONHECIMENTO_OLIVIA + contextoDinamico
      + "\n\n---\n\n## Mapa oficial do menu (vale sobre qualquer outro trecho)\n" + montarMapaMenu(NAV);

    const perguntar = (conversa: MensagemChat[]) => fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 2048,
        system: systemPromptCompleto,
        messages: conversa.map(m => ({ role: m.role, content: m.content })),
      }),
    });
    const textoDe = async (r: Response) => {
      const d = await r.json() as { content: Array<{ type: string; text?: string }> };
      // Pode vir bloco "thinking" antes do "text" — busca o primeiro text block
      return d.content?.find(b => b.type === "text")?.text ?? "";
    };

    const response = await perguntar(mensagens);

    if (!response.ok) {
      const err = await response.text();
      console.error("Anthropic API error:", response.status, err);
      return NextResponse.json({ error: `Erro na API de IA (${response.status})` }, { status: 500 });
    }

    let resposta = await textoDe(response) || "Não consegui gerar uma resposta.";

    // Conferência antes de chegar ao cliente: caminho que não existe no menu volta para ser corrigido uma vez
    const erradas = rotasInvalidas(resposta, NAV);
    if (erradas.length) {
      console.warn("[olivia] caminho inexistente na resposta:", erradas.join(" | "));
      const refeita = await perguntar([...mensagens, { role: "assistant", content: resposta }, {
        role: "user",
        content: `Revisão interna, não mencione isto: estes caminhos não existem no menu: ${erradas.join("; ")}. Reescreva a resposta inteira usando só caminhos do Mapa oficial do menu. Se a tela não estiver no Mapa, diga que não encontrou.`,
      }]);
      if (refeita.ok) {
        const texto = await textoDe(refeita);
        if (texto) {
          resposta = texto;
          const seguem = rotasInvalidas(texto, NAV);
          if (seguem.length) console.warn("[olivia] caminho inexistente após revisão:", seguem.join(" | "));
        }
      }
    }

    return NextResponse.json({ resposta });
  } catch (err) {
    console.error("Suporte chat error:", err);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
