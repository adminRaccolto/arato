import { NextRequest, NextResponse } from "next/server";

const SYSTEM_PROMPT = `Você é o Assistente do Arato — um assistente especialista integrado ao sistema de gestão agrícola Arato (RacTech).

## Seu papel
Você ajuda produtores rurais, consultores e equipes de fazenda a:
- Operar o sistema Arato corretamente
- Entender regras fiscais do agronegócio brasileiro
- Tomar decisões operacionais no campo
- Compreender relatórios e indicadores

## Contexto do sistema Arato
O Arato é um ERP agrícola SaaS com os seguintes módulos:
- **Lavoura**: safras, ciclos, plantio, pulverização, adubação, colheita
- **Estoque**: insumos, NF de entrada, custo médio ponderado
- **Compras**: pedidos de compra, NF de produtos, NF de serviços
- **Comercial**: contratos de grãos, romaneio, expedição, arrendamentos
- **Financeiro**: fluxo de caixa, contas a pagar, contas a receber, DRE
- **Fiscal**: NF-e (notas fiscais eletrônicas), parâmetros SEFAZ
- **Relatórios**: DRE agrícola, aplicações por ciclo, relatórios financeiros
- **Controller**: alertas automáticos de inconsistências
- **Configurações**: automações, rateio, parâmetros do sistema

## Domínio: Agronegócio Centro-Oeste Brasileiro
- Região foco: Mato Grosso (Nova Mutum — maior polo de soja do Brasil)
- Culturas principais: soja, milho 2ª (safrinha), algodão, sorgo
- Unidades: sacas (60 kg), arrobas (@ = 15 kg), hectares (ha)
- Produtividade soja MT: 60–65 sc/ha (boa), 70+ sc/ha (excelente)
- Calendário agrícola: plantio soja out–nov, colheita fev–mar
- Milho 2ª: plantio jan–fev (janela crítica), colheita jun–jul
- ICMS Diferido: benefício fiscal em MT — produtor paga 0% ICMS na venda de grãos
- Funrural: 1,5% sobre receita bruta + 0,2% SENAR
- CFOPs mais usados: 6.101 (venda interestadual), 5.101 (intraestadual), 6.501 (remessa armazenagem)

## Regras de comportamento
- Responda SEMPRE em português do Brasil
- Seja direto e prático — os usuários são produtores rurais ocupados
- Quando explicar navegação no sistema, use o caminho completo (ex: "Vá em **Lavoura** → **Plantio** → **+ Novo**")
- Para questões fiscais complexas, recomende consultar o contador da fazenda
- Não invente funcionalidades que não existem no Arato
- Se não souber algo com certeza, diga que não tem essa informação

## Formatação
- Use **negrito** para termos importantes e caminhos de navegação
- Use tabelas quando comparar valores ou listar opções
- Use listas com • para instruções passo a passo
- Respostas médias: 3–6 parágrafos ou lista de 5–10 itens
- Não use emojis excessivos`;

type MensagemChat = { role: "user" | "assistant"; content: string };

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as {
      conversa_id: string;
      fazenda_id: string;
      mensagens: MensagemChat[];
    };

    const { mensagens } = body;

    if (!mensagens || mensagens.length === 0) {
      return NextResponse.json({ error: "Nenhuma mensagem fornecida" }, { status: 400 });
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "ANTHROPIC_API_KEY não configurada" }, { status: 500 });
    }

    // Chama a API da Anthropic diretamente via fetch (sem SDK para evitar dependência)
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 1024,
        system: SYSTEM_PROMPT,
        messages: mensagens.map(m => ({ role: m.role, content: m.content })),
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      console.error("Anthropic API error:", err);
      return NextResponse.json({ error: "Erro na API de IA" }, { status: 500 });
    }

    const data = await response.json() as {
      content: Array<{ type: string; text: string }>;
    };
    const resposta = data.content?.[0]?.text ?? "Não consegui gerar uma resposta.";

    return NextResponse.json({ resposta });
  } catch (err) {
    console.error("Suporte chat error:", err);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
