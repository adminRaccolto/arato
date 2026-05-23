// API Route — consulta NF-e na SEFAZ e resolve pendência fiscal
// Suporta também NFS-e (nota de serviço municipal) que não tem chave SEFAZ
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

// Cria ou atualiza pessoa (fornecedor) com os dados extraídos da NF
async function upsertFornecedor(
  fazendaId: string,
  cnpj: string,
  dados: {
    nome?: string;
    ie?: string;
    cnae?: string;
    logradouro?: string;
    numero?: string;
    bairro?: string;
    municipio?: string;
    uf?: string;
    cep?: string;
    telefone?: string;
  }
): Promise<string | null> {
  const supabase = sb();
  const cnpjLimpo = cnpj.replace(/\D/g, "");

  const { data: existente } = await supabase.from("pessoas")
    .select("id, municipio, logradouro, cnae")
    .eq("fazenda_id", fazendaId)
    .eq("cpf_cnpj", cnpjLimpo)
    .maybeSingle();

  if (existente) {
    // Atualiza campos vazios sem sobrescrever dados já preenchidos
    const patch: Record<string, unknown> = {};
    if (!existente.municipio && dados.municipio) patch.municipio = dados.municipio;
    if (!existente.logradouro && dados.logradouro) patch.logradouro = dados.logradouro;
    if (!existente.cnae && dados.cnae) patch.cnae = dados.cnae;
    if (dados.ie) patch.inscricao_est = dados.ie;
    if (dados.bairro) patch.bairro = patch.bairro ?? dados.bairro;
    if (dados.uf) patch.estado = dados.uf;
    if (dados.cep) patch.cep = dados.cep;
    if (dados.numero) patch.numero = dados.numero;
    if (dados.telefone) patch.telefone = patch.telefone ?? dados.telefone;

    if (Object.keys(patch).length > 0) {
      await supabase.from("pessoas").update(patch).eq("id", existente.id);
    }
    return existente.id;
  }

  // Cria novo fornecedor
  const { data: nova } = await supabase.from("pessoas").insert({
    fazenda_id:     fazendaId,
    nome:           dados.nome ?? cnpjLimpo,
    tipo:           cnpjLimpo.length === 11 ? "pf" : "pj",
    fornecedor:     true,
    cliente:        false,
    cpf_cnpj:       cnpjLimpo,
    inscricao_est:  dados.ie,
    cnae:           dados.cnae,
    logradouro:     dados.logradouro,
    numero:         dados.numero,
    bairro:         dados.bairro,
    municipio:      dados.municipio,
    estado:         dados.uf,
    cep:            dados.cep,
    telefone:       dados.telefone,
  }).select("id").single();

  return nova?.id ?? null;
}

// Vincula pessoa ao lançamento e à pendência
async function vincularPessoa(
  fazendaId: string,
  pendenciaId: string | undefined,
  pessoaId: string,
) {
  const supabase = sb();
  if (!pendenciaId) return;
  const { data: pendencia } = await supabase.from("pendencias_fiscais")
    .select("lancamento_id").eq("id", pendenciaId).single();
  if (pendencia?.lancamento_id) {
    await supabase.from("lancamentos")
      .update({ pessoa_id: pessoaId })
      .eq("id", pendencia.lancamento_id);
  }
}

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return NextResponse.json({ ok: false, erro: "Body inválido" }, { status: 400 }); }

  const { fazendaId, pendenciaId } = body as { fazendaId: string; pendenciaId?: string; chaveAcesso?: string; fotoBase64?: string };

  if (!fazendaId) return NextResponse.json({ ok: false, erro: "fazendaId obrigatório" }, { status: 400 });

  // ── Modo 2: foto — usar Claude Vision para extrair dados ─────────────────
  if (!body.chaveAcesso && body.fotoBase64) {
    try {
      const nfDados = await lerNotaFiscal(String(body.fotoBase64), "image/jpeg");

      // Se é NFS-e ou não tem chave mas tem CNPJ: salva sem consultar SEFAZ
      const ehNFSe = nfDados.tipo_nota === "nfse" || (!nfDados.chave_acesso && nfDados.cnpj_emitente);
      if (ehNFSe && nfDados.cnpj_emitente) {
        const pessoaId = await upsertFornecedor(fazendaId, nfDados.cnpj_emitente, {
          nome:       nfDados.razao_social,
          cnae:       nfDados.cnae ?? undefined,
          logradouro: nfDados.logradouro ?? undefined,
          numero:     nfDados.numero_end ?? undefined,
          bairro:     nfDados.bairro ?? undefined,
          municipio:  nfDados.municipio ?? undefined,
          uf:         nfDados.uf ?? undefined,
          cep:        nfDados.cep ?? undefined,
          telefone:   nfDados.telefone ?? undefined,
        });

        if (pendenciaId) {
          const patch: Record<string, unknown> = { status: "recebida" };
          if (nfDados.razao_social) patch.fornecedor_nome = nfDados.razao_social;
          if (nfDados.valor_total)  patch.valor = nfDados.valor_total;
          if (nfDados.numero_nf)    patch.chave_acesso = `NFSe-${nfDados.numero_nf}`;
          await sb().from("pendencias_fiscais").update(patch).eq("id", pendenciaId);
          if (pessoaId) await vincularPessoa(fazendaId, pendenciaId, pessoaId);
        }

        return NextResponse.json({
          ok: true,
          tipoNota: "nfse",
          fornecedor:     nfDados.razao_social,
          valor:          nfDados.valor_total,
          pessoaCriada:   !!pessoaId,
          cnae:           nfDados.cnae,
          mensagem:       "NFS-e registrada sem consulta SEFAZ (nota de serviço municipal não possui chave de acesso SEFAZ).",
        });
      }

      if (nfDados.chave_acesso) {
        // NF-e: continua para consulta SEFAZ com a chave extraída
        body = { ...body, chaveAcesso: nfDados.chave_acesso, _nfDadosFoto: nfDados };
      } else {
        return NextResponse.json({
          ok: false,
          erro: "Não foi possível extrair a chave de acesso da foto. Para NFS-e (nota de serviço municipal), use a aba Foto da Nota — o sistema salva automaticamente sem precisar da chave SEFAZ.",
        });
      }
    } catch {
      return NextResponse.json({ ok: false, erro: "Erro ao processar a imagem. Tente novamente." });
    }
  }

  let chave: string | null = null;
  if (body.chaveAcesso) {
    chave = String(body.chaveAcesso).replace(/\D/g, "");
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

  // ── Upsert fornecedor com dados completos da NF ─────────────────────────────
  let pessoaId: string | null = null;
  if (resultado.cnpjEmitente) {
    pessoaId = await upsertFornecedor(fazendaId, resultado.cnpjEmitente, {
      nome:       resultado.nomeEmitente,
      ie:         resultado.ieEmitente,
      cnae:       resultado.cnaeEmitente,
      logradouro: resultado.logradouro,
      numero:     resultado.numero,
      bairro:     resultado.bairro,
      municipio:  resultado.municipio,
      uf:         resultado.uf,
      cep:        resultado.cep,
      telefone:   resultado.telefone,
    });
  }

  // ── Atualizar pendência fiscal (se fornecida) ───────────────────────────────
  if (pendenciaId) {
    const patch: Record<string, unknown> = {
      status: "recebida",
      chave_acesso: chave,
    };
    if (xmlPath)                  patch.xml_storage_path = xmlPath;
    if (resultado.nomeEmitente)   patch.fornecedor_nome = resultado.nomeEmitente;
    if (resultado.valorTotal)     patch.valor = resultado.valorTotal;

    await sb().from("pendencias_fiscais").update(patch).eq("id", pendenciaId);

    if (pessoaId) await vincularPessoa(fazendaId, pendenciaId, pessoaId);
  }

  return NextResponse.json({
    ok: true,
    tipoNota: "nfe",
    fornecedor:     resultado.nomeEmitente,
    valor:          resultado.valorTotal,
    dataEmissao:    resultado.dataEmissao,
    chaveEncontrada: chave,
    xmlSalvo:       !!xmlPath,
    pessoaCriada:   !!pessoaId,
    cnae:           resultado.cnaeEmitente,
  });
}
