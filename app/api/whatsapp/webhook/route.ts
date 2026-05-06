// Webhook principal — Evolution API
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { detectarIntencao, transcreverAudio, lerNotaFiscal } from "../../../../lib/whatsapp-ai";
import { enviarTexto, baixarMidiaBase64 } from "../../../../lib/whatsapp-evolution";
import {
  buscarSessao, salvarSessao, limparSessao,
  iniciarFluxo, avancarFluxo,
  type FluxoNome,
} from "../../../../lib/whatsapp-flows";
import { executarInsercao } from "../../../../lib/whatsapp-inserir";
import {
  consultaContasPagarSemana, consultaContasAtrasadas,
  consultaProximoVencimentoMoeda, consultaContasReceberMes,
  consultaSaldoProjetado, consultaGastoCategoria,
  consultaArrendamentosVencer, consultaSacasComprometidas,
  consultaPrecoMedioVenda, consultaEstoqueProduto,
  consultaEstoqueMinimo, consultaStatusLavoura,
  consultaProdutividade, consultaDRESumario,
} from "../../../../lib/whatsapp-consultas";

function sb() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

// ── Autenticar número ──────────────────────────────────────────────────────
async function autenticarNumero(telefone: string): Promise<{ usuarioId: string; fazendaId: string; fazendaNome: string } | null> {
  // Evolution API remove o 9 de números brasileiros — tenta os dois formatos
  const variantes = [telefone];
  if (telefone.startsWith("55") && telefone.length === 12) {
    // 556596493240 → 5565996493240 (adiciona 9 após 2 dígitos de área)
    variantes.push(telefone.slice(0, 4) + "9" + telefone.slice(4));
  } else if (telefone.startsWith("55") && telefone.length === 13) {
    // 5565996493240 → 556596493240 (remove o 9)
    variantes.push(telefone.slice(0, 4) + telefone.slice(5));
  }

  const { data } = await sb().from("usuarios")
    .select("id, fazenda_id, fazendas(nome)")
    .in("whatsapp", variantes)
    .eq("ativo", true)
    .single();
  if (!data) return null;
  const fazenda = (Array.isArray(data.fazendas) ? data.fazendas[0] : data.fazendas) as { nome: string } | null;
  return { usuarioId: data.id, fazendaId: data.fazenda_id, fazendaNome: fazenda?.nome ?? "" };
}

// ── Mapa intenção → fluxo ──────────────────────────────────────────────────
const INTENCAO_PARA_FLUXO: Record<string, FluxoNome> = {
  inserir_abastecimento:    "abastecimento",
  inserir_operacao_lavoura: "operacao_lavoura",
  inserir_entrada_estoque:  "entrada_estoque",
  inserir_saida_estoque:    "saida_estoque",
  inserir_cp:               "lancar_cp",
  inserir_cr:               "lancar_cr",
  inserir_baixa_cp:         "baixar_cp",
  inserir_baixa_cr:         "baixar_cr",
  inserir_romaneio:         "romaneio",
};

// ── Resolver consulta ──────────────────────────────────────────────────────
async function resolverConsulta(intencao: string, entidades: Record<string, string | number>, fazendaId: string): Promise<string> {
  switch (intencao) {
    case "consulta_cp":
      if (String(entidades.status ?? "").includes("atraso")) return consultaContasAtrasadas(fazendaId);
      if (entidades.moeda) return consultaProximoVencimentoMoeda(fazendaId, String(entidades.moeda));
      if (entidades.categoria) return consultaGastoCategoria(fazendaId, String(entidades.categoria));
      return consultaContasPagarSemana(fazendaId);
    case "consulta_cr":    return consultaContasReceberMes(fazendaId);
    case "consulta_saldo": return consultaSaldoProjetado(fazendaId);
    case "consulta_arrendamento": return consultaArrendamentosVencer(fazendaId);
    case "consulta_contratos":
      return consultaSacasComprometidas(fazendaId, entidades.commodity ? String(entidades.commodity) : undefined, entidades.safra ? String(entidades.safra) : undefined);
    case "consulta_estoque":
      if (entidades.produto) return consultaEstoqueProduto(fazendaId, String(entidades.produto));
      return consultaEstoqueMinimo(fazendaId);
    case "consulta_lavoura":
      if (String(entidades.tipo ?? "").includes("produtividade")) return consultaProdutividade(fazendaId);
      return consultaStatusLavoura(fazendaId);
    case "consulta_dre": return consultaDRESumario(fazendaId);
    default:
      return "🤔 Não entendi. Tente perguntar sobre contas a pagar, estoque, contratos ou lavoura.";
  }
}

// ── Extrair número limpo do JID da Evolution API ───────────────────────────
// Formato: "5511999999999@s.whatsapp.net" → "5511999999999"
function jidParaTelefone(jid: string): string {
  return jid.replace(/@.*$/, "").replace(/\D/g, "");
}

function ehGrupo(jid: string): boolean {
  return jid.includes("@g.us");
}

// Número válido: 10-15 dígitos (DDI + DDD + número)
function ehNumeroValido(telefone: string): boolean {
  return telefone.length >= 10 && telefone.length <= 15;
}

// ── Handler principal ──────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return NextResponse.json({ ok: true }); }

  // Log para debug
  const event = String(body.event ?? "");
  console.log("[WH] event:", event, "keys:", Object.keys(body));

  if (event !== "messages.upsert") return NextResponse.json({ ok: true });

  const data = body.data as Record<string, unknown> | undefined;
  if (!data) return NextResponse.json({ ok: true });

  const key = data.key as Record<string, unknown> | undefined;
  if (!key) return NextResponse.json({ ok: true });

  // Ignorar mensagens enviadas pelo próprio bot
  if (key.fromMe === true) return NextResponse.json({ ok: true });

  const remoteJid = String(key.remoteJid ?? "");
  if (!remoteJid) return NextResponse.json({ ok: true });

  // Ignorar grupos
  if (ehGrupo(remoteJid)) return NextResponse.json({ ok: true });

  const telefone = jidParaTelefone(remoteJid);
  if (!telefone || !ehNumeroValido(telefone)) return NextResponse.json({ ok: true });

  const messageType = String(data.messageType ?? "");
  const message = data.message as Record<string, unknown> | undefined;
  if (!message) return NextResponse.json({ ok: true });

  let textoMensagem = "";
  let imagemBase64: string | undefined;
  let imagemMime: string | undefined;

  // ── Texto ──────────────────────────────────────────────────────────────
  if (messageType === "conversation" || messageType === "extendedTextMessage") {
    textoMensagem = String(
      message.conversation ??
      (message.extendedTextMessage as Record<string, unknown> | undefined)?.text ??
      ""
    ).trim();

  // ── Áudio — transcrever com Whisper ───────────────────────────────────
  } else if (messageType === "audioMessage" || messageType === "pttMessage") {
    try {
      const { base64, mimetype } = await baixarMidiaBase64({ key, message });
      const buf = Buffer.from(base64, "base64");
      textoMensagem = await transcreverAudio(buf, mimetype || "audio/ogg");
      await enviarTexto(telefone, `🎤 _"${textoMensagem}"_`);
    } catch {
      await enviarTexto(telefone, "❌ Não consegui ouvir o áudio. Pode repetir em texto?");
      return NextResponse.json({ ok: true });
    }

  // ── Imagem — pode ser NF ───────────────────────────────────────────────
  } else if (messageType === "imageMessage") {
    try {
      const { base64, mimetype } = await baixarMidiaBase64({ key, message });
      imagemBase64 = base64;
      imagemMime   = mimetype || "image/jpeg";
    } catch {
      await enviarTexto(telefone, "❌ Não consegui baixar a imagem. Tente novamente.");
      return NextResponse.json({ ok: true });
    }
  } else {
    // Tipo não suportado (sticker, document, etc.)
    return NextResponse.json({ ok: true });
  }

  // ── Autenticar ─────────────────────────────────────────────────────────
  const auth = await autenticarNumero(telefone);
  if (!auth) return NextResponse.json({ ok: true }); // número não cadastrado — ignora silenciosamente
  const { usuarioId, fazendaId, fazendaNome } = auth;

  // ── Sessão ─────────────────────────────────────────────────────────────
  let sessao = await buscarSessao(telefone);
  if (!sessao) {
    await salvarSessao(telefone, { usuario_id: usuarioId, fazenda_id: fazendaId, fazenda_nome: fazendaNome });
    sessao = await buscarSessao(telefone);
  }

  // Comandos globais
  const textLower = textoMensagem.toLowerCase().trim();
  if (["cancelar", "cancel", "sair", "menu"].includes(textLower)) {
    await limparSessao(telefone);
    await enviarTexto(telefone, menuPrincipal(fazendaNome));
    return NextResponse.json({ ok: true });
  }
  if (["ajuda", "help", "?"].includes(textLower)) {
    await enviarTexto(telefone, menuPrincipal(fazendaNome));
    return NextResponse.json({ ok: true });
  }

  // ── Fluxo em andamento ─────────────────────────────────────────────────
  if (sessao?.fluxo) {
    if (sessao.etapa === "aguardando_confirmacao") {
      if (["sim", "s", "yes", "confirmo", "ok"].includes(textLower)) {
        const resultado = await executarInsercao(sessao.fluxo, sessao.dados, fazendaId, usuarioId);
        await limparSessao(telefone);
        await enviarTexto(telefone, resultado.mensagem);
      } else {
        await limparSessao(telefone);
        await enviarTexto(telefone, "❌ Operação cancelada. Digite *ajuda* para ver o menu.");
      }
      return NextResponse.json({ ok: true });
    }

    if (sessao.aguardando_foto && imagemBase64) {
      try {
        await enviarTexto(telefone, "🔍 Lendo a nota fiscal...");
        const nfDados = await lerNotaFiscal(imagemBase64, imagemMime ?? "image/jpeg");
        const { mensagem } = await avancarFluxo(sessao, "", nfDados as Record<string, unknown>);
        await enviarTexto(telefone, mensagem);
      } catch {
        await enviarTexto(telefone, "❌ Não consegui ler a nota. Pode enviar outra foto ou responder *não tenho*.");
      }
      return NextResponse.json({ ok: true });
    }

    const { mensagem } = await avancarFluxo(sessao, textoMensagem);
    await enviarTexto(telefone, mensagem);
    return NextResponse.json({ ok: true });
  }

  // ── Nova mensagem — detectar intenção ──────────────────────────────────
  if (!textoMensagem && !imagemBase64) return NextResponse.json({ ok: true });

  const { intencao, entidades } = await detectarIntencao(textoMensagem);

  if (intencao.startsWith("consulta_")) {
    const resposta = await resolverConsulta(intencao, entidades, fazendaId);
    await enviarTexto(telefone, resposta);
    return NextResponse.json({ ok: true });
  }

  const fluxo = INTENCAO_PARA_FLUXO[intencao];
  if (fluxo) {
    const pergunta = await iniciarFluxo(telefone, fluxo, entidades as Record<string, unknown>);
    await enviarTexto(telefone, pergunta);
    return NextResponse.json({ ok: true });
  }

  await enviarTexto(telefone, `🤔 Não entendi. Digite *ajuda* para ver o que posso fazer.\n\n_Fazenda: ${fazendaNome}_`);
  return NextResponse.json({ ok: true });
}

export async function GET() {
  return NextResponse.json({ status: "Arato WhatsApp IA ativo — Evolution API" });
}

function menuPrincipal(fazenda: string): string {
  return `🌾 *Arato — Assistente IA*
_Fazenda: ${fazenda}_

📋 *Consultas*
• "Quais contas vencem essa semana?"
• "Tenho contas em atraso?"
• "Qual meu próximo vencimento em dólar?"
• "Quanto tenho a receber este mês?"
• "Saldo projetado até fim do mês?"
• "Sacas de soja comprometidas safra 26/27?"
• "Quanto tem de diesel no estoque?"
• "Resultado da safra até agora?"

✏️ *Registros*
• "Abasteci 200L de diesel por R$1.200"
• "Pulverizei o talhão 3 com Roundup 2L/ha"
• "Colheita talhão 2: 450 sacas"
• "Lançar conta a pagar"
• "Baixar pagamento"

Digite *cancelar* a qualquer momento para recomeçar.`;
}
