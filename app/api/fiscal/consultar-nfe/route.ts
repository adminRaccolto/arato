// API Route — consulta NF-e na SEFAZ e resolve pendência fiscal
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { consultarNfePorChave, salvarXmlStorage } from "../../../../lib/sefaz-consulta";
import { lerNotaFiscal } from "../../../../lib/whatsapp-ai";

function sb() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return NextResponse.json({ ok: false, erro: "Body inválido" }, { status: 400 }); }

  const { fazendaId, pendenciaId } = body as { fazendaId: string; pendenciaId?: string; chaveAcesso?: string; fotoBase64?: string };

  if (!fazendaId) return NextResponse.json({ ok: false, erro: "fazendaId obrigatório" }, { status: 400 });

  let chave: string | null = null;

  // ── Modo 1: chave de acesso direta ──────────────────────────────────────────
  if (body.chaveAcesso) {
    chave = String(body.chaveAcesso).replace(/\D/g, "");
  }

  // ── Modo 2: foto — usar Claude Vision para extrair chave ─────────────────
  if (!chave && body.fotoBase64) {
    try {
      const nfDados = await lerNotaFiscal(String(body.fotoBase64), "image/jpeg");
      if (nfDados.chave_acesso) {
        chave = nfDados.chave_acesso.replace(/\D/g, "");
      } else {
        return NextResponse.json({ ok: false, erro: "Não foi possível extrair a chave de acesso da foto. Tente digitar a chave manualmente." });
      }
    } catch {
      return NextResponse.json({ ok: false, erro: "Erro ao processar a imagem. Tente novamente." });
    }
  }

  if (!chave || chave.length !== 44) {
    return NextResponse.json({ ok: false, erro: "Chave de acesso inválida ou não encontrada." });
  }

  // ── Consultar SEFAZ ─────────────────────────────────────────────────────────
  const resultado = await consultarNfePorChave(chave, fazendaId, "producao");

  if (!resultado.ok) {
    return NextResponse.json({ ok: false, erro: resultado.erro ?? resultado.xMotivo });
  }

  // ── Salvar XML no Storage ───────────────────────────────────────────────────
  let xmlPath: string | null = null;
  if (resultado.xmlCompleto) {
    xmlPath = await salvarXmlStorage(fazendaId, chave, resultado.xmlCompleto);
  }

  // ── Atualizar pendência fiscal (se fornecida) ───────────────────────────────
  if (pendenciaId) {
    const patch: Record<string, unknown> = {
      status: "recebida",
      chave_acesso: chave,
    };
    if (xmlPath) patch.xml_storage_path = xmlPath;
    if (resultado.nomeEmitente) patch.fornecedor_nome = resultado.nomeEmitente;
    if (resultado.valorTotal)   patch.valor = resultado.valorTotal;

    await sb().from("pendencias_fiscais").update(patch).eq("id", pendenciaId);

    // Atualizar lançamento vinculado com pessoa (se encontrar fornecedor)
    if (resultado.cnpjEmitente) {
      const { data: pendencia } = await sb().from("pendencias_fiscais")
        .select("lancamento_id").eq("id", pendenciaId).single();

      if (pendencia?.lancamento_id) {
        const { data: pessoa } = await sb().from("pessoas")
          .select("id").eq("fazenda_id", fazendaId)
          .eq("cpf_cnpj", resultado.cnpjEmitente).single();

        if (pessoa) {
          await sb().from("lancamentos")
            .update({ pessoa_id: pessoa.id })
            .eq("id", pendencia.lancamento_id);
        }
      }
    }
  }

  return NextResponse.json({
    ok: true,
    fornecedor: resultado.nomeEmitente,
    valor: resultado.valorTotal,
    dataEmissao: resultado.dataEmissao,
    chaveEncontrada: chave,
    xmlSalvo: !!xmlPath,
  });
}
