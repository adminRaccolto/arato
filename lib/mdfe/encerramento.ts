/**
 * lib/mdfe/encerramento.ts
 * Evento de Encerramento de MDF-e (tpEvento 110112) — monta, assina e transmite de verdade.
 *
 * Funciona por CHAVE (não exige registro no banco): o MDF-e pode ter sido emitido por outro
 * sistema/canal e ficado "aberto" na SEFAZ, bloqueando novos MDF-e da mesma placa. O emitente
 * (CNPJ/CPF) e a UF saem da própria chave de acesso; o certificado vem da config do emitente.
 * Antes de 23/09/2026 o "Encerrar" da tela era só um UPDATE local — nunca transmitia à SEFAZ.
 */
import { createClient } from "@supabase/supabase-js";
import { assinarXmlPorId, pfxParaPem } from "../nfe/signer";
import { gerarDhEmi } from "../nfe/builder";
import { resolverConfigMDFe } from "./config";
import { transmitirEventoMDFe } from "./transmitter";

export interface EncerramentoInput {
  chave: string;        // 44 dígitos
  protocolo: string;    // nProt da autorização do MDF-e (15 dígitos)
  dataEnc: string;      // AAAA-MM-DD
  ufEnc: string;        // UF do encerramento
  cMunEnc: string;      // IBGE do município de encerramento (7 dígitos)
}

export interface ResultadoEncerramento {
  sucesso: boolean;
  cStat: string;
  xMotivo: string;
  protocoloEvento?: string;
}

const CUF: Record<string, string> = {
  AC:"12",AL:"27",AM:"13",AP:"16",BA:"29",CE:"23",DF:"53",ES:"32",GO:"52",MA:"21",
  MG:"31",MS:"50",MT:"51",PA:"15",PB:"25",PE:"26",PI:"22",PR:"41",RJ:"33",RN:"24",
  RO:"11",RR:"14",RS:"43",SC:"42",SE:"28",SP:"35",TO:"17",
};

function sb() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

export function montarEventoEncerramento(input: EncerramentoInput, doc: string, ambiente: "producao" | "homologacao", ufEmissor: string): { xml: string; id: string } {
  const chave = input.chave.replace(/\D/g, "");
  const cOrgao = chave.slice(0, 2);
  const tagDoc = doc.length === 14 ? "CNPJ" : "CPF";
  const id = `ID110112${chave}01`;
  const uf = CUF[input.ufEnc.toUpperCase()];
  const xml =
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<eventoMDFe xmlns="http://www.portalfiscal.inf.br/mdfe" versao="3.00">` +
      `<infEvento Id="${id}">` +
        `<cOrgao>${cOrgao}</cOrgao>` +
        `<tpAmb>${ambiente === "producao" ? "1" : "2"}</tpAmb>` +
        `<${tagDoc}>${doc}</${tagDoc}>` +
        `<chMDFe>${chave}</chMDFe>` +
        `<dhEvento>${gerarDhEmi(ufEmissor)}</dhEvento>` +
        `<tpEvento>110112</tpEvento>` +
        `<nSeqEvento>1</nSeqEvento>` +
        `<detEvento versaoEvento="3.00">` +
          `<evEncMDFe>` +
            `<descEvento>Encerramento</descEvento>` +
            `<nProt>${input.protocolo.replace(/\D/g, "")}</nProt>` +
            `<dtEnc>${input.dataEnc}</dtEnc>` +
            `<cUF>${uf}</cUF>` +
            `<cMun>${input.cMunEnc.replace(/\D/g, "")}</cMun>` +
          `</evEncMDFe>` +
        `</detEvento>` +
      `</infEvento>` +
    `</eventoMDFe>`;
  return { xml, id };
}

export async function encerrarMDFePorChave(fazendaId: string, input: EncerramentoInput): Promise<ResultadoEncerramento> {
  const chave = input.chave.replace(/\D/g, "");
  if (chave.length !== 44) return { sucesso: false, cStat: "VALIDACAO_LOCAL", xMotivo: "A chave de acesso precisa ter 44 dígitos." };
  if (input.protocolo.replace(/\D/g, "").length !== 15) return { sucesso: false, cStat: "VALIDACAO_LOCAL", xMotivo: "O protocolo de autorização precisa ter 15 dígitos (vem junto da mensagem da SEFAZ ou do MDF-e original)." };
  if (!CUF[input.ufEnc.toUpperCase()]) return { sucesso: false, cStat: "VALIDACAO_LOCAL", xMotivo: "UF de encerramento inválida." };
  if (input.cMunEnc.replace(/\D/g, "").length !== 7) return { sucesso: false, cStat: "VALIDACAO_LOCAL", xMotivo: "Código IBGE do município de encerramento inválido (7 dígitos)." };

  // Emitente = CNPJ (ou CPF, com zeros à esquerda) embutido nas posições 7–20 da chave
  const docChave = chave.slice(6, 20);
  const doc = docChave.startsWith("000") ? docChave.slice(3) : docChave;

  const resolved = await resolverConfigMDFe(fazendaId, doc);
  if (!resolved) return { sucesso: false, cStat: "500", xMotivo: "Configuração do emitente não encontrada — configure em Parâmetros → MDF-e." };
  const confg = resolved.mdfeConfig;
  const fc = resolved.fiscalConfig;
  const certPath = confg.cert_a1_path ?? fc.cert_a1_path;
  const certSenha = confg.cert_a1_senha ?? fc.cert_a1_senha;
  if (!certPath || !certSenha) return { sucesso: false, cStat: "501", xMotivo: "Certificado A1 não configurado para o emitente dessa chave (Parâmetros → MDF-e / Fiscal)." };

  const { data: blob, error } = await sb().storage.from("certificados").download(certPath);
  if (error || !blob) return { sucesso: false, cStat: "502", xMotivo: `Certificado não encontrado: ${certPath}` };
  let pem;
  try { pem = pfxParaPem(Buffer.from(await blob.arrayBuffer()), certSenha); }
  catch (e) { return { sucesso: false, cStat: "502b", xMotivo: `Certificado inválido ou senha incorreta: ${e}` }; }

  const ambiente = (confg.ambiente as "producao" | "homologacao") ?? "homologacao";
  const ufEmissor = fc.uf_emitente ?? confg.uf_emitente ?? "MT";
  try {
    const { xml, id } = montarEventoEncerramento(input, doc, ambiente, ufEmissor);
    const assinado = assinarXmlPorId(xml, pem, id);
    const resp = await transmitirEventoMDFe(assinado, pem, ufEmissor, ambiente);
    // 135 = evento registrado e vinculado ao MDF-e · 631 = já encerrado (idempotente, tratado como ok)
    const ok = resp.sucesso || resp.cStat === "631";
    return { sucesso: ok, cStat: resp.cStat ?? "", xMotivo: resp.xMotivo, protocoloEvento: resp.protocolo };
  } catch (e) {
    return { sucesso: false, cStat: "505", xMotivo: `Erro ao montar/assinar/transmitir o encerramento: ${e}` };
  }
}
