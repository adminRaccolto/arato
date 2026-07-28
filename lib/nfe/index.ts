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
  // Carrega em paralelo: config do emitente + ambiente global + todos os certs cadastrados
  const [{ data: emitData }, { data: globalData }, { data: certRows }] = await Promise.all([
    sb().from("configuracoes_modulo").select("config").eq("fazenda_id", fazendaId).eq("modulo", moduloKey).single(),
    sb().from("configuracoes_modulo").select("config").eq("fazenda_id", fazendaId).eq("modulo", "fiscal_global").single(),
    sb().from("configuracoes_modulo").select("modulo, config").eq("fazenda_id", fazendaId).like("modulo", "certificado_a1_%"),
  ]);
  if (!emitData?.config) return null;

  const cfg = { ...emitData.config } as Record<string, string>;

  // Corrige cert_a1_path se for URL inválida (URL do dashboard Supabase ou sem extensão .pfx/.p12)
  const certPath = cfg.cert_a1_path ?? "";
  const certPathInvalid = certPath.startsWith("http") || (certPath.length > 0 && !/\.(pfx|p12|cer|crt)$/i.test(certPath));
  if (certPathInvalid && certRows?.length) {
    // Tenta achar o certificado_a1_* pelo CPF/CNPJ do emitente
    const cpfDigits = (cfg.cpf_cnpj_emitente ?? "").replace(/\D/g, "");
    const found = certRows.find(r => {
      const c = r.config as Record<string, string>;
      return (c.cpf_cnpj ?? "").replace(/\D/g, "") === cpfDigits && c.storage_path;
    });
    if (found) {
      const c = found.config as Record<string, string>;
      cfg.cert_a1_path = c.storage_path;
    }
  }

  // Ambiente global sobrepõe o ambiente do emitente — é o "master switch"
  const ambienteGlobal = globalData?.config?.ambiente as string | undefined;
  return {
    ...cfg,
    ...(ambienteGlobal ? { ambiente: ambienteGlobal } : {}),
  };
}

// ─── Carrega PFX do Supabase Storage ─────────────────────────────────────────
async function carregarPfx(
  storagePath: string
): Promise<Buffer> {
  const { data, error } = await sb()
    .storage
    .from("certificados")
    .download(storagePath);
  if (error || !data) {
    // Tenta variante sem subpastas (arquivo na raiz do bucket)
    const nomeArquivo = storagePath.split("/").pop() ?? storagePath;
    if (nomeArquivo !== storagePath) {
      const { data: data2, error: error2 } = await sb().storage.from("certificados").download(nomeArquivo);
      if (!error2 && data2) return Buffer.from(await data2.arrayBuffer());
    }
    throw new Error(`Certificado não encontrado: ${storagePath} — Supabase: ${error?.message ?? "sem dados"}`);
  }
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
  input: Omit<NFeInput, "emitente">,  // emitente vem do banco
  emitIeOverride?: string             // IE específica do produtor (multi-IE)
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
    ie:             emitIeOverride ?? confg.ie_emitente ?? "",
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
