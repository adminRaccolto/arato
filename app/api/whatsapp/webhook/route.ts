// Webhook principal — Evolution API
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { transcreverAudio, lerNotaFiscal } from "../../../../lib/whatsapp-ai";
import { enviarTexto, baixarMidiaBase64 } from "../../../../lib/whatsapp-evolution";
import { buscarSessao, salvarSessao, limparSessao } from "../../../../lib/whatsapp-flows";
import { processarMensagemIA, type Mensagem } from "../../../../lib/whatsapp-claude";

function sb() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

// ── Autenticar número ──────────────────────────────────────────────────────
async function autenticarNumero(telefone: string): Promise<{ usuarioId: string; fazendaId: string; fazendaNome: string } | null> {
  const variantes = [telefone];
  if (telefone.startsWith("55") && telefone.length === 12) {
    variantes.push(telefone.slice(0, 4) + "9" + telefone.slice(4));
  } else if (telefone.startsWith("55") && telefone.length === 13) {
    variantes.push(telefone.slice(0, 4) + telefone.slice(5));
  }

  const { data: rows } = await sb().from("usuarios")
    .select("id, fazenda_id, fazendas(nome)")
    .in("whatsapp", variantes)
    .eq("ativo", true)
    .limit(1);
  const data = rows?.[0] ?? null;
  if (!data) return null;
  const fazenda = (Array.isArray(data.fazendas) ? data.fazendas[0] : data.fazendas) as { nome: string } | null;
  return { usuarioId: data.id, fazendaId: data.fazenda_id, fazendaNome: fazenda?.nome ?? "" };
}

// ── Extrair número limpo do JID ────────────────────────────────────────────
function jidParaTelefone(jid: string): string {
  return jid.replace(/@.*$/, "").replace(/\D/g, "");
}

function ehGrupo(jid: string): boolean {
  return jid.includes("@g.us");
}

function ehNumeroValido(telefone: string): boolean {
  return telefone.length >= 10 && telefone.length <= 15;
}

// ── Handler principal ──────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return NextResponse.json({ ok: true }); }

  const event = String(body.event ?? "");
  const eventNorm = event.toLowerCase().replace(/_/g, ".");
  if (eventNorm !== "messages.upsert") return NextResponse.json({ ok: true });

  const rawData = body.data;
  const data = (Array.isArray(rawData) ? rawData[0] : rawData) as Record<string, unknown> | undefined;
  if (!data) return NextResponse.json({ ok: true });

  const key = data.key as Record<string, unknown> | undefined;
  if (!key) return NextResponse.json({ ok: true });

  const remoteJid = String(key.remoteJid ?? "");
  if (key.fromMe === true) return NextResponse.json({ ok: true });
  if (!remoteJid) return NextResponse.json({ ok: true });
  if (ehGrupo(remoteJid)) return NextResponse.json({ ok: true });

  const telefone = jidParaTelefone(remoteJid);
  if (!telefone || !ehNumeroValido(telefone)) return NextResponse.json({ ok: true });

  const messageType = String(data.messageType ?? "");
  const message = data.message as Record<string, unknown> | undefined;
  if (!message) return NextResponse.json({ ok: true });

  let textoMensagem = "";
  let imagemBase64: string | undefined;
  let imagemMime: string | undefined;

  if (messageType === "conversation" || messageType === "extendedTextMessage") {
    textoMensagem = String(
      message.conversation ??
      (message.extendedTextMessage as Record<string, unknown> | undefined)?.text ??
      ""
    ).trim();

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
    return NextResponse.json({ ok: true });
  }

  if (!textoMensagem && !imagemBase64) return NextResponse.json({ ok: true });

  // ── Autenticar ─────────────────────────────────────────────────────────────
  const auth = await autenticarNumero(telefone);
  if (!auth) return NextResponse.json({ ok: true });
  const { usuarioId, fazendaId, fazendaNome } = auth;

  // ── Sessão e histórico ─────────────────────────────────────────────────────
  console.log("[WH] telefone:", telefone, "usuario:", usuarioId, "fazenda:", fazendaId);
  // Lê sessão SEM salvar antes — salvar depois em operação única evita limpar o histórico
  const sessao = await buscarSessao(telefone);
  const historico: Mensagem[] = (sessao?.dados?.historico as Mensagem[] | undefined) ?? [];
  console.log("[WH] sessão:", sessao ? `encontrada (id=${sessao.id})` : "nova", "histórico:", historico.length, "msgs");

  // Comando global de reset
  const textLower = textoMensagem.toLowerCase().trim();
  if (["cancelar", "cancel", "sair", "reiniciar"].includes(textLower)) {
    await limparSessao(telefone);
    await enviarTexto(telefone, `Ok, conversa reiniciada. Como posso ajudar, *${fazendaNome}*?`);
    return NextResponse.json({ ok: true });
  }

  // ── Imagem — tenta ler como nota fiscal e injeta o texto no contexto ────────
  let textoParaIA = textoMensagem;
  if (imagemBase64) {
    try {
      await enviarTexto(telefone, "🔍 Lendo a imagem...");
      const nfDados = await lerNotaFiscal(imagemBase64, imagemMime ?? "image/jpeg");
      textoParaIA = `[Usuário enviou uma imagem. Dados extraídos: ${JSON.stringify(nfDados)}]\n${textoMensagem}`.trim();
    } catch {
      textoParaIA = "[Usuário enviou uma imagem mas não foi possível lê-la.]";
    }
  }

  // ── Claude processa com tool use ────────────────────────────────────────────
  console.log("[WH] processando com Claude:", textoParaIA.slice(0, 80));
  let resposta: string;
  try {
    resposta = await processarMensagemIA(
      textoParaIA,
      { fazendaId, fazendaNome, usuarioId },
      historico,
    );
  } catch (err) {
    console.error("[WH] ERRO Claude:", err);
    resposta = "⚠️ Serviço temporariamente indisponível. Tente novamente em instantes.";
  }

  // Salva histórico ANTES de enviar — elimina race condition
  const novoHistorico: Mensagem[] = [
    ...historico,
    { role: "user" as const, content: textoParaIA },
    { role: "assistant" as const, content: resposta },
  ].slice(-20);
  console.log("[WH] salvando histórico:", novoHistorico.length, "msgs para telefone:", telefone);
  // usuario_id omitido — FK referencia auth.users mas usuarioId vem de usuarios (tabela custom)
  await salvarSessao(telefone, {
    fazenda_id: fazendaId,
    fazenda_nome: fazendaNome,
    dados: { historico: novoHistorico },
  });
  console.log("[WH] histórico salvo OK");

  // Envia resposta após salvar
  await enviarTexto(telefone, resposta);

  return NextResponse.json({ ok: true });
}

export async function GET() {
  return NextResponse.json({ status: "Arato WhatsApp IA ativo — Evolution API" });
}
