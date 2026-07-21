// Testa o fluxo interno do bot sem depender do WhatsApp
// Útil para diagnosticar quando tudo está verde mas o bot não responde
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { processarMensagemIA } from "../../../../lib/whatsapp-claude";
import { enviarTexto } from "../../../../lib/whatsapp-evolution";

function sb() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

export async function POST(req: NextRequest) {
  const { telefone, mensagem = "olá, teste do sistema" } = await req.json() as { telefone?: string; mensagem?: string };

  const log: string[] = [];
  const erro = (msg: string) => { log.push("❌ " + msg); };
  const ok   = (msg: string) => { log.push("✅ " + msg); };
  const info = (msg: string) => { log.push("ℹ️  " + msg); };

  // ── 1. Verificar variáveis ───────────────────────────────────────────────
  info("Verificando variáveis de ambiente…");
  const missingVars = [];
  if (!process.env.ANTHROPIC_API_KEY)   missingVars.push("ANTHROPIC_API_KEY");
  if (!process.env.EVOLUTION_API_URL)   missingVars.push("EVOLUTION_API_URL");
  if (!process.env.EVOLUTION_API_KEY)   missingVars.push("EVOLUTION_API_KEY");
  if (!process.env.EVOLUTION_INSTANCE)  missingVars.push("EVOLUTION_INSTANCE");
  if (missingVars.length > 0) {
    erro(`Variáveis ausentes: ${missingVars.join(", ")}`);
    return NextResponse.json({ ok: false, log });
  }
  ok("Todas as variáveis de ambiente presentes");

  // ── 2. Buscar usuário pelo telefone ──────────────────────────────────────
  if (!telefone) {
    erro("Nenhum telefone informado — informe um número para testar");
    return NextResponse.json({ ok: false, log });
  }

  info(`Buscando usuário com WhatsApp ${telefone}…`);
  const variantes = [telefone];
  if (telefone.startsWith("55") && telefone.length === 12)
    variantes.push(telefone.slice(0, 4) + "9" + telefone.slice(4));
  else if (telefone.startsWith("55") && telefone.length === 13)
    variantes.push(telefone.slice(0, 4) + telefone.slice(5));

  info(`Variantes buscadas: ${variantes.join(", ")}`);

  const { data: rows, error: dbErr } = await sb()
    .from("usuarios")
    .select("id, nome, whatsapp, fazenda_id, ativo, fazendas(nome)")
    .in("whatsapp", variantes)
    .eq("ativo", true)
    .limit(1);

  if (dbErr) {
    erro("Erro ao buscar usuário: " + dbErr.message);
    return NextResponse.json({ ok: false, log });
  }

  const usuario = rows?.[0];
  if (!usuario) {
    erro(`Número ${telefone} NÃO encontrado na tabela usuarios com ativo=true`);
    info("Verifique em Cadastros → Usuários se o número está cadastrado no campo WhatsApp (formato: DDI+DDD+número, ex: 5565999990000)");

    // Listar todos os números cadastrados para comparar
    const { data: todos } = await sb().from("usuarios").select("nome, whatsapp, ativo").not("whatsapp", "is", null).limit(20);
    if (todos && todos.length > 0) {
      info("Números cadastrados: " + todos.map(u => `${u.nome}: ${u.whatsapp} (${u.ativo ? "ativo" : "inativo"})`).join(" | "));
    }
    return NextResponse.json({ ok: false, log });
  }

  ok(`Usuário encontrado: ${usuario.nome} | fazenda_id: ${usuario.fazenda_id}`);

  const fazendaNome = (Array.isArray(usuario.fazendas) ? usuario.fazendas[0] : usuario.fazendas as { nome: string } | null)?.nome ?? "Fazenda";
  info(`Fazenda: ${fazendaNome}`);

  // ── 3. Testar Claude ─────────────────────────────────────────────────────
  info(`Enviando mensagem para Claude: "${mensagem}"`);
  let respostaClaude = "";
  try {
    const result = await processarMensagemIA(
      mensagem,
      { fazendaId: usuario.fazenda_id, fazendaNome, usuarioId: usuario.id, usuarioNome: usuario.nome, usuarioWhatsapp: telefone },
      [],
    );
    respostaClaude = result.texto;
    ok(`Claude respondeu (${respostaClaude.length} chars): "${respostaClaude.slice(0, 100)}${respostaClaude.length > 100 ? "…" : ""}"`);
  } catch (e) {
    erro("Erro ao chamar Claude: " + String(e));
    return NextResponse.json({ ok: false, log, resposta: null });
  }

  // ── 4. Testar envio via Evolution API ────────────────────────────────────
  info(`Enviando resposta via Evolution API para ${telefone}…`);
  try {
    await enviarTexto(telefone, `[TESTE DO SISTEMA] ${respostaClaude}`);
    ok("Mensagem enviada via Evolution API com sucesso");
  } catch (e) {
    erro("Erro ao enviar mensagem pela Evolution API: " + String(e));
    return NextResponse.json({ ok: false, log, resposta: respostaClaude });
  }

  ok("Fluxo completo OK — o bot está funcionando para este número");
  return NextResponse.json({ ok: true, log, resposta: respostaClaude });
}
