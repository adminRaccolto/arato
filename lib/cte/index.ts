/**
 * lib/cte/index.ts
 * Ponto central da emissão de CT-e:
 *   1. Busca config do emitente (cte_emp_{CNPJ} + fiscal_emp_{CNPJ})
 *   2. Carrega certificado A1 (mesmo cert do módulo fiscal referenciado)
 *   3. Gera XML → assina → transmite
 *   4. Salva XML autorizado no Storage e retorna resultado
 */

import { createClient } from "@supabase/supabase-js";
import { createHash }  from "crypto";
import { buildCTe }     from "./builder";
import { assinarCTe }   from "./signer";
import { transmitirCTe } from "./transmitter";
import { pfxParaPem }   from "../nfe/signer";
import { resolverConfigCTe } from "./config";
import type { CTeInput, EmitenteCTe } from "./builder";

export type { CTeInput, EmitenteCTe };

function sb() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

// ─── Carrega PFX do Supabase Storage ─────────────────────────────────────────
async function carregarPfx(storagePath: string): Promise<Buffer> {
  const { data, error } = await sb().storage.from("certificados").download(storagePath);
  if (error || !data) throw new Error(`Certificado não encontrado: ${storagePath}`);
  return Buffer.from(await data.arrayBuffer());
}

// ─── Próximo número do CT-e ───────────────────────────────────────────────────
async function proximoNumero(fazendaId: string, modulo: string, confg: Record<string, string>): Promise<number> {
  const atual = parseInt(String(confg.numero_inicial ?? "1"));
  await sb()
    .from("configuracoes_modulo")
    .update({ config: { ...confg, numero_inicial: String(atual + 1) } })
    .eq("fazenda_id", fazendaId)
    .eq("modulo", modulo);
  return atual;
}

// ─── QR Code CT-e 4.00 ───────────────────────────────────────────────────────
// infCTeSupl deve aparecer entre </infCte> e <Signature> no XML final.
// A assinatura só cobre infCte, então inserir infCTeSupl depois não quebra o digest.
const QR_BASE: Record<string, Record<string, string>> = {
  MT: {
    producao:    "https://www.sefaz.mt.gov.br/cte/qrcode",
    homologacao: "https://homologacao.sefaz.mt.gov.br/cte/qrcode",
  },
};

function buildQrCodeCTe(
  chave: string,
  tpAmb: string,   // "1" | "2"
  uf:    string,
): string {
  // CT-e 4.00 tpEmis=1: XSD aceita somente chCTe e tpAmb — parâmetros extras causam cStat 215
  const urlBase = QR_BASE[uf]?.[tpAmb === "1" ? "producao" : "homologacao"]
               ?? `https://homologacao.sefaz.mt.gov.br/cte/qrcode`;
  return `${urlBase}?chCTe=${chave}&tpAmb=${tpAmb}`;
}

function inserirInfCTeSupl(xmlAssinado: string, qrUrl: string): string {
  // & na URL deve ser &amp; no XML — sem isso o parser SEFAZ encontra entidades inválidas (ex: &tpAmb;)
  const qrUrlXml = qrUrl.replace(/&/g, "&amp;");
  const supl = `<infCTeSupl><qrCodCTe>${qrUrlXml}</qrCodCTe></infCTeSupl>`;
  // Insere entre </infCte> e <Signature> (ordem exigida pelo schema CT-e 4.00)
  if (xmlAssinado.includes("</infCte><Signature")) {
    return xmlAssinado.replace("</infCte><Signature", `</infCte>${supl}<Signature`);
  }
  // Fallback: insere antes de </CTe>
  return xmlAssinado.replace("</CTe>", `${supl}</CTe>`);
}

// ─── Salva XML no Storage ────────────────────────────────────────────────────
async function salvarXml(fazendaId: string, chave: string, xml: string): Promise<string> {
  const path = `${fazendaId}/cte_emitidos/${chave}.xml`;
  await sb().storage.from("arquivos")
    .upload(path, new Blob([xml], { type: "application/xml" }), { upsert: true });
  const { data } = sb().storage.from("arquivos").getPublicUrl(path);
  return data.publicUrl;
}

// ─── Resultado ───────────────────────────────────────────────────────────────
export interface ResultadoEmissaoCTe {
  sucesso:    boolean;
  chave?:     string;
  numero?:    string;
  protocolo?: string;
  dhRecbto?:  string;
  xmlUrl?:    string;
  cStat:      string;
  xMotivo:    string;
  xmlAssinado?: string;
}

export interface EmitirCTeOptions {
  emitente_cnpj?: string | null;
}

// ─── Função principal ────────────────────────────────────────────────────────
export async function emitirCTe(
  fazendaId: string,
  inputBase: Omit<CTeInput, "emitente">,
  options: EmitirCTeOptions = {},
): Promise<ResultadoEmissaoCTe> {

  // 1. Config CT-e
  const resolved = await resolverConfigCTe(fazendaId, options.emitente_cnpj);
  if (!resolved) return { sucesso: false, cStat: "500", xMotivo: "Configuração CT-e não encontrada — configure em Parâmetros → CT-e" };
  if (!resolved.cteConfigEncontrada) {
    return {
      sucesso: false,
      cStat: "500",
      xMotivo: "Configuração CT-e não encontrada para o emitente selecionado — salve os Parâmetros CT-e desta transportadora.",
    };
  }

  const confg = resolved.cteConfig;
  const fc = resolved.fiscalConfig;
  const certPath  = confg.cert_a1_path  ?? fc.cert_a1_path;
  const certSenha = confg.cert_a1_senha ?? fc.cert_a1_senha;
  if (!certPath || !certSenha)
    return { sucesso: false, cStat: "501", xMotivo: "Certificado A1 não configurado no módulo CT-e nem no Fiscal" };

  // 3. Certificado
  let pfxBuffer: Buffer;
  try { pfxBuffer = await carregarPfx(certPath); }
  catch (e) { return { sucesso: false, cStat: "502", xMotivo: String(e) }; }
  const pem = pfxParaPem(pfxBuffer, certSenha);

  // 4. Número sequencial
  const numero = await proximoNumero(fazendaId, resolved.cteModulo, confg);

  const emitente: EmitenteCTe = {
    cpf_cnpj:       fc.cpf_cnpj_emitente ?? confg.cpf_cnpj_emitente ?? options.emitente_cnpj ?? resolved.emitenteDigits,
    razao_social:   fc.razao_social       ?? confg.razao_social       ?? "",
    ie:             fc.ie_emitente        ?? confg.ie_emitente        ?? "",
    crt:            (fc.crt as EmitenteCTe["crt"]) ?? "3",
    logradouro:     fc.logradouro         ?? confg.logradouro         ?? "",
    numero:         fc.numero             ?? confg.numero             ?? "S/N",
    bairro:         fc.bairro             ?? confg.bairro             ?? "",
    municipio_ibge: fc.municipio_ibge     ?? confg.municipio_ibge     ?? "5106224",
    municipio_nome: fc.municipio_nome     ?? fc.municipio ?? confg.municipio_nome ?? confg.municipio ?? "Nova Mutum",
    uf:             fc.uf_emitente        ?? confg.uf_emitente        ?? "MT",
    cep:            fc.cep               ?? confg.cep               ?? "00000000",
    fone:           fc.fone              ?? confg.fone,
    rntrc:          confg.rntrc           ?? "",
    ambiente:       (confg.ambiente as "producao" | "homologacao") ?? "homologacao",
    serie:          confg.serie_cte       ?? "001",
    numero_cte:     numero,
  };

  // 5. Construir XML
  console.log("[CT-e diagnóstico schema]", {
    remetente: {
      docLength: inputBase.remetente?.cpf_cnpj?.replace(/\D/g, "").length,
      temLogradouro: Boolean(inputBase.remetente?.logradouro),
      temNumero: Boolean(inputBase.remetente?.numero),
      temBairro: Boolean(inputBase.remetente?.bairro),
      temMunicipioIbge: Boolean(inputBase.remetente?.municipio_ibge),
      temMunicipioNome: Boolean(inputBase.remetente?.municipio_nome),
      temUF: Boolean(inputBase.remetente?.uf),
    },
    destinatario: {
      docLength: inputBase.destinatario?.cpf_cnpj?.replace(/\D/g, "").length,
      temLogradouro: Boolean(inputBase.destinatario?.logradouro),
      temNumero: Boolean(inputBase.destinatario?.numero),
      temBairro: Boolean(inputBase.destinatario?.bairro),
      temMunicipioIbge: Boolean(inputBase.destinatario?.municipio_ibge),
      temMunicipioNome: Boolean(inputBase.destinatario?.municipio_nome),
      temUF: Boolean(inputBase.destinatario?.uf),
    },
    aliquotaIcms: inputBase.aliquota_icms,
    nfeChaveLength: inputBase.nfe_chave?.replace(/\D/g, "").length,
    componentes: inputBase.componentes?.map(c => ({
      nome: c.nome,
      tamanhoNome: c.nome.length,
    })),
  });
  const built = buildCTe({ ...inputBase, emitente });

  // 6. Assinar
  let xmlAssinado: string;
  try { xmlAssinado = assinarCTe(built.xml, pem); }
  catch (e) { return { sucesso: false, cStat: "503", xMotivo: `Erro na assinatura: ${e}`, xmlAssinado: built.xml }; }

  // 6b. Inserir infCTeSupl (QR Code) — obrigatório CT-e 4.00
  // tpEmis=1: XSD aceita somente ?chCTe=...&tpAmb=... (parâmetros extras → cStat 215)
  const tpAmb  = emitente.ambiente === "producao" ? "1" : "2";
  const qrUrl  = buildQrCodeCTe(built.chave, tpAmb, emitente.uf);
  xmlAssinado  = inserirInfCTeSupl(xmlAssinado, qrUrl);

  // 7. Transmitir
  let resposta;
  try { resposta = await transmitirCTe(xmlAssinado, pem, emitente.uf, emitente.ambiente); }
  catch (e) { return { sucesso: false, cStat: "504", xMotivo: `Falha na comunicação SEFAZ: ${e}`, xmlAssinado }; }

  // 8. Salvar XML se autorizado
  let xmlUrl: string | undefined;
  if (resposta.sucesso && resposta.xmlProt) {
    try { xmlUrl = await salvarXml(fazendaId, built.chave, resposta.xmlProt); } catch { /* best-effort */ }
  }

  return {
    sucesso:    resposta.sucesso,
    chave:      built.chave,
    numero:     built.numero,
    protocolo:  resposta.protocolo,
    dhRecbto:   resposta.dhRecbto,
    xmlUrl,
    cStat:      resposta.cStat ?? resposta.errorCode ?? "ERR",
    xMotivo:    resposta.xMotivo,
    xmlAssinado,
  };
}
