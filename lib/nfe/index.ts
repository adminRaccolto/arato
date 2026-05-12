/**
 * lib/nfe/index.ts
 * Ponto central da emissão de NF-e:
 *   1. Busca configuração do emitente em configuracoes_modulo
 *   2. Carrega certificado A1 do Supabase Storage
 *   3. Gera XML (builder) → assina (signer) → transmite (transmitter)
 *   4. Salva XML autorizado no Storage e atualiza a nota no banco
 */

import { createClient } from "@supabase/supabase-js";
import { buildNFe }        from "./builder";
import { assinarNFe, pfxParaPem } from "./signer";
import { transmitirNFe }   from "./transmitter";
import type { NFeInput, EmitenteCfg } from "./builder";

export type { NFeInput, EmitenteCfg };

// ─── Supabase (service role — ignora RLS) ────────────────────────────────────
function sb() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

// ─── Busca configuração do emitente ──────────────────────────────────────────
export async function buscarConfEmitente(
  fazendaId: string,
  moduloKey: string   // ex: "fiscal_pf_abc" ou "fiscal_emp_xyz"
): Promise<Record<string, string> | null> {
  const { data } = await sb()
    .from("configuracoes_modulo")
    .select("config")
    .eq("fazenda_id", fazendaId)
    .eq("modulo", moduloKey)
    .single();
  return data?.config ?? null;
}

// ─── Carrega PFX do Supabase Storage ─────────────────────────────────────────
async function carregarPfx(
  storagePath: string
): Promise<Buffer> {
  const { data, error } = await sb()
    .storage
    .from("certificados")
    .download(storagePath);
  if (error || !data) throw new Error(`Certificado não encontrado: ${storagePath}`);
  return Buffer.from(await data.arrayBuffer());
}

// ─── Próximo número da NF-e (atômico via update) ─────────────────────────────
async function proximoNumero(
  fazendaId: string,
  moduloKey: string,
  confg: Record<string, string>
): Promise<number> {
  const atual = parseInt(String(confg.numero_inicial ?? "1"));
  // Incrementa no banco antes de emitir para garantir unicidade
  await sb()
    .from("configuracoes_modulo")
    .update({ config: { ...confg, numero_inicial: String(atual + 1) } })
    .eq("fazenda_id", fazendaId)
    .eq("modulo", moduloKey);
  return atual;
}

// ─── Salva XML no Storage e retorna URL pública ───────────────────────────────
async function salvarXml(
  fazendaId: string,
  chave: string,
  xml: string
): Promise<string> {
  const path = `${fazendaId}/nfe_emitidas/${chave}.xml`;
  await sb()
    .storage
    .from("arquivos")
    .upload(path, new Blob([xml], { type: "application/xml" }), { upsert: true });
  const { data } = sb().storage.from("arquivos").getPublicUrl(path);
  return data.publicUrl;
}

// ─── Resultado completo ───────────────────────────────────────────────────────
export interface ResultadoEmissao {
  sucesso: boolean;
  chave?: string;
  numero?: string;
  protocolo?: string;
  dhRecbto?: string;
  xmlUrl?: string;
  cStat: string;
  xMotivo: string;
  xmlAssinado?: string;   // disponível mesmo em rejeição, para debug
}

// ─── Função principal: emitirNFe ─────────────────────────────────────────────
export async function emitirNFe(
  fazendaId: string,
  moduloKey: string,
  input: Omit<NFeInput, "emitente">   // emitente vem do banco
): Promise<ResultadoEmissao> {

  // 1. Configuração do emitente
  const confg = await buscarConfEmitente(fazendaId, moduloKey);
  if (!confg) return { sucesso: false, cStat: "500", xMotivo: `Configuração fiscal não encontrada para ${moduloKey}` };

  const certPath = confg.cert_a1_path;
  const certSenha = confg.cert_a1_senha;
  if (!certPath || !certSenha)
    return { sucesso: false, cStat: "501", xMotivo: "Certificado A1 não configurado em Parâmetros → Fiscal" };

  // 2. Certificado
  let pfxBuffer: Buffer;
  try {
    pfxBuffer = await carregarPfx(certPath);
  } catch (e) {
    return { sucesso: false, cStat: "502", xMotivo: String(e) };
  }
  const pem = pfxParaPem(pfxBuffer, certSenha);

  // 3. Próximo número (reservado de forma atômica)
  const numero = await proximoNumero(fazendaId, moduloKey, confg);

  const emitente: EmitenteCfg = {
    cpf_cnpj:       confg.cpf_cnpj_emitente ?? "",
    razao_social:   confg.razao_social ?? "",
    ie:             confg.ie_emitente ?? "",
    im:             confg.im_emitente,
    crt:            (confg.crt as EmitenteCfg["crt"]) ?? "3",
    logradouro:     confg.logradouro ?? "",
    numero:         confg.numero ?? "S/N",
    bairro:         confg.bairro ?? "",
    municipio_ibge: confg.municipio_ibge ?? "5106455",
    municipio_nome: confg.municipio_nome ?? "Nova Mutum",
    uf:             confg.uf_emitente ?? "MT",
    cep:            confg.cep ?? "00000000",
    fone:           confg.fone,
    ambiente:       (confg.ambiente as "producao" | "homologacao") ?? "homologacao",
    serie:          confg.serie_nfe ?? "001",
    numero_nfe:     numero,
  };

  // 4. Construir XML
  const built = buildNFe({ ...input, emitente });

  // 5. Assinar
  let xmlAssinado: string;
  try {
    xmlAssinado = assinarNFe(built.xml, pem);
  } catch (e) {
    return { sucesso: false, cStat: "503", xMotivo: `Erro na assinatura: ${e}`, xmlAssinado: built.xml };
  }

  // 6. Transmitir
  let resposta;
  try {
    resposta = await transmitirNFe(xmlAssinado, pem, emitente.uf, emitente.ambiente);
  } catch (e) {
    return { sucesso: false, cStat: "504", xMotivo: `Falha na comunicação SEFAZ: ${e}`, xmlAssinado };
  }

  const autorizada = resposta.cStat === "100";

  // 7. Salvar XML no Storage se autorizada
  let xmlUrl: string | undefined;
  if (autorizada && resposta.xmlProt) {
    try {
      xmlUrl = await salvarXml(fazendaId, built.chave, resposta.xmlProt);
    } catch { /* não bloqueia — salvar é best-effort */ }
  }

  return {
    sucesso: autorizada,
    chave:     built.chave,
    numero:    built.numero,
    protocolo: resposta.protocolo,
    dhRecbto:  resposta.dhRecbto,
    xmlUrl,
    cStat:     resposta.cStat,
    xMotivo:   resposta.xMotivo,
    xmlAssinado,
  };
}
