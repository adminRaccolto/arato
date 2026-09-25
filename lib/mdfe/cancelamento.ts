/**
 * lib/mdfe/cancelamento.ts
 * Evento de Cancelamento de MDF-e (tpEvento 110111) — monta, assina e transmite de verdade.
 * Antes de 25/09/2026 o "Cancelar" da tela era só um UPDATE no banco local: o MDF-e seguia
 * autorizado/aberto na SEFAZ (bloqueando a placa e ainda válido para fiscalização).
 * Regra: só cancela MDF-e não encerrado e dentro do prazo da SEFAZ (24h da autorização).
 */
import { createClient } from "@supabase/supabase-js";
import { assinarXmlPorId, pfxParaPem } from "../nfe/signer";
import { gerarDhEmi } from "../nfe/builder";
import { resolverConfigMDFe } from "./config";
import { transmitirEventoMDFe } from "./transmitter";

export interface CancelamentoMDFeInput { chave: string; protocolo: string; justificativa: string }
export interface ResultadoCancelamentoMDFe { sucesso: boolean; cStat: string; xMotivo: string; protocoloEvento?: string }

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const sb = () => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

export function montarEventoCancelamentoMDFe(input: CancelamentoMDFeInput, doc: string, ambiente: "producao" | "homologacao", ufEmissor: string): { xml: string; id: string } {
  const chave = input.chave.replace(/\D/g, "");
  const tagDoc = doc.length === 14 ? "CNPJ" : "CPF";
  const id = `ID110111${chave}01`;
  const xml =
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<eventoMDFe xmlns="http://www.portalfiscal.inf.br/mdfe" versao="3.00">` +
      `<infEvento Id="${id}">` +
        `<cOrgao>${chave.slice(0, 2)}</cOrgao>` +
        `<tpAmb>${ambiente === "producao" ? "1" : "2"}</tpAmb>` +
        `<${tagDoc}>${doc}</${tagDoc}>` +
        `<chMDFe>${chave}</chMDFe>` +
        `<dhEvento>${gerarDhEmi(ufEmissor)}</dhEvento>` +
        `<tpEvento>110111</tpEvento>` +
        `<nSeqEvento>1</nSeqEvento>` +
        `<detEvento versaoEvento="3.00">` +
          `<evCancMDFe>` +
            `<descEvento>Cancelamento</descEvento>` +
            `<nProt>${input.protocolo.replace(/\D/g, "")}</nProt>` +
            `<xJust>${esc(input.justificativa.trim())}</xJust>` +
          `</evCancMDFe>` +
        `</detEvento>` +
      `</infEvento>` +
    `</eventoMDFe>`;
  return { xml, id };
}

export async function cancelarMDFePorChave(fazendaId: string, input: CancelamentoMDFeInput): Promise<ResultadoCancelamentoMDFe> {
  const chave = input.chave.replace(/\D/g, "");
  if (chave.length !== 44) return { sucesso: false, cStat: "VALIDACAO_LOCAL", xMotivo: "MDF-e sem chave de acesso válida (44 dígitos) — nunca foi autorizado na SEFAZ." };
  if (input.protocolo.replace(/\D/g, "").length !== 15) return { sucesso: false, cStat: "VALIDACAO_LOCAL", xMotivo: "MDF-e sem protocolo de autorização (15 dígitos)." };
  const j = input.justificativa.trim();
  if (j.length < 15 || j.length > 255) return { sucesso: false, cStat: "VALIDACAO_LOCAL", xMotivo: "A justificativa deve ter de 15 a 255 caracteres." };

  const docChave = chave.slice(6, 20);
  const doc = docChave.startsWith("000") ? docChave.slice(3) : docChave;
  const resolved = await resolverConfigMDFe(fazendaId, doc);
  if (!resolved) return { sucesso: false, cStat: "500", xMotivo: "Configuração do emitente não encontrada — configure em Parâmetros → MDF-e." };
  const confg = resolved.mdfeConfig, fc = resolved.fiscalConfig;
  const certPath = confg.cert_a1_path ?? fc.cert_a1_path;
  const certSenha = confg.cert_a1_senha ?? fc.cert_a1_senha;
  if (!certPath || !certSenha) return { sucesso: false, cStat: "501", xMotivo: "Certificado A1 não configurado para o emitente deste MDF-e." };
  const { data: blob, error } = await sb().storage.from("certificados").download(certPath);
  if (error || !blob) return { sucesso: false, cStat: "502", xMotivo: `Certificado não encontrado: ${certPath}` };
  let pem;
  try { pem = pfxParaPem(Buffer.from(await blob.arrayBuffer()), certSenha); }
  catch (e) { return { sucesso: false, cStat: "502b", xMotivo: `Certificado inválido ou senha incorreta: ${e}` }; }

  const ambiente = (confg.ambiente as "producao" | "homologacao") ?? "homologacao";
  const ufEmissor = fc.uf_emitente ?? confg.uf_emitente ?? "MT";
  try {
    const { xml, id } = montarEventoCancelamentoMDFe(input, doc, ambiente, ufEmissor);
    const assinado = assinarXmlPorId(xml, pem, id);
    const resp = await transmitirEventoMDFe(assinado, pem, ufEmissor, ambiente);
    // 135 = evento registrado e vinculado ao MDF-e
    return { sucesso: resp.sucesso, cStat: resp.cStat ?? "", xMotivo: resp.xMotivo, protocoloEvento: resp.protocolo };
  } catch (e) {
    return { sucesso: false, cStat: "505", xMotivo: `Erro ao montar/assinar/transmitir o cancelamento: ${e}` };
  }
}
