/**
 * lib/nfe/evento.ts
 * Monta, assina e transmite o Evento de Cancelamento de NF-e (tpEvento 110111).
 *
 * Uma NF-e já autorizada pela SEFAZ não pode simplesmente "sumir" do lado de
 * dentro do sistema — ela precisa ser cancelada oficialmente junto à SEFAZ,
 * senão continua valendo do lado de fora mesmo que o status mude aqui. O
 * cancelamento só é aceito dentro do prazo definido pelo Ajuste SINIEF
 * (em geral 24h contadas da autorização) e exige uma justificativa com pelo
 * menos 15 caracteres.
 */

import { soDigitos, gerarDhEmi } from "./builder";
import { assinarXmlPorId, type PemPair } from "./signer";
import { transmitirEvento } from "./transmitter";

export interface CancelamentoInput {
  chave: string;          // chave de acesso da NF-e, 44 dígitos
  protocolo: string;      // nProt da autorização original (obrigatório no evento)
  cpfCnpjEmit: string;
  uf: string;
  ambiente: "producao" | "homologacao";
  justificativa: string;  // mín. 15 caracteres — exigência da SEFAZ
}

export interface ResultadoEvento {
  sucesso: boolean;
  cStat: string;
  xMotivo: string;
  protocolo?: string;     // protocolo do EVENTO (não confundir com o da NF-e original)
  xmlAssinado?: string;
}

function escXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

const DIACRITICOS = new RegExp("[\u0300-\u036f]", "g");

function removerAcentos(s: string): string {
  // Decompõe em base + diacrítico (NFD, ex: "ç" -> "c" + combining cedilla)
  // e descarta os diacríticos (faixa Unicode U+0300-U+036F, via \u explícito
  // pra não depender de caractere não-ASCII sobreviver intacto no arquivo).
  return s.normalize("NFD").replace(DIACRITICOS, "");
}

function validarJustificativa(s: string): string {
  const trimmed = s.trim();
  if (trimmed.length < 15) {
    throw new Error("Justificativa do cancelamento precisa ter pelo menos 15 caracteres (exigência da SEFAZ)");
  }
  // SEFAZ MT rejeitou (cStat 402 "XML da area de dados com codificacao
  // diferente de UTF-8") uma justificativa com acentos — confirmado testando
  // um cancelamento real: a MESMA frase sem acentos foi aceita. Transliterar
  // pra ASCII evita depender do usuário lembrar de não digitar acento.
  return escXml(removerAcentos(trimmed).slice(0, 255));
}

function minifyXml(xml: string): string {
  return xml.replace(/>\s+</g, "><").trim();
}

// ─── Monta o envEvento de Cancelamento (não assinado) ────────────────────────
export function montarEnvEventoCancelamento(input: CancelamentoInput): { xml: string; id: string } {
  const chave = soDigitos(input.chave);
  if (chave.length !== 44) throw new Error(`Chave de acesso inválida para cancelamento (esperado 44 dígitos, recebido ${chave.length})`);
  const protocolo = soDigitos(input.protocolo);
  if (!protocolo) throw new Error("Protocolo de autorização ausente — obrigatório para montar o evento de cancelamento");

  const cpfCnpj = soDigitos(input.cpfCnpjEmit);
  const tagDoc = cpfCnpj.length === 14 ? "CNPJ" : "CPF";
  const cOrgao = chave.slice(0, 2); // os 2 primeiros dígitos da chave já são o código UF (cUF)
  const tpAmb = input.ambiente === "producao" ? "1" : "2";
  const dhEvento = gerarDhEmi(input.uf);
  // O atributo Id usa nSeqEvento com 2 dígitos (padrão da NT), mas o elemento
  // <nSeqEvento> em si é xs:positiveInteger — schema rejeita zero à esquerda
  // (cStat 215 "valor '01' de nSeqEvento não é válido" — confirmado testando
  // um cancelamento real).
  const nSeqEventoId = "01";
  const nSeqEvento = "1";
  const tpEvento = "110111";
  const id = `ID${tpEvento}${chave}${nSeqEventoId}`;
  const xJust = validarJustificativa(input.justificativa);

  const xml =
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<envEvento xmlns="http://www.portalfiscal.inf.br/nfe" versao="1.00">` +
      `<idLote>${Date.now().toString().slice(-15)}</idLote>` +
      `<evento versao="1.00">` +
        `<infEvento Id="${id}">` +
          `<cOrgao>${cOrgao}</cOrgao>` +
          `<tpAmb>${tpAmb}</tpAmb>` +
          `<${tagDoc}>${cpfCnpj}</${tagDoc}>` +
          `<chNFe>${chave}</chNFe>` +
          `<dhEvento>${dhEvento}</dhEvento>` +
          `<tpEvento>${tpEvento}</tpEvento>` +
          `<nSeqEvento>${nSeqEvento}</nSeqEvento>` +
          `<verEvento>1.00</verEvento>` +
          `<detEvento versao="1.00">` +
            `<descEvento>Cancelamento</descEvento>` +
            `<nProt>${protocolo}</nProt>` +
            `<xJust>${xJust}</xJust>` +
          `</detEvento>` +
        `</infEvento>` +
      `</evento>` +
    `</envEvento>`;

  return { xml: minifyXml(xml), id };
}

// ─── Monta, assina e transmite o cancelamento ────────────────────────────────
export async function cancelarNFe(pem: PemPair, input: CancelamentoInput): Promise<ResultadoEvento> {
  const { xml, id } = montarEnvEventoCancelamento(input);
  const assinado = assinarXmlPorId(xml, pem, id);

  const resp = await transmitirEvento(assinado, pem, input.uf, input.ambiente);

  // 135 = evento registrado e vinculado à NF-e (cancelamento efetivado)
  // 155 = evento registrado e vinculado à NF-e (cancelamento já realizado
  //       anteriormente) — trata como sucesso, é idempotente
  const sucesso = resp.cStat === "135" || resp.cStat === "155";
  return {
    sucesso,
    cStat: resp.cStat,
    xMotivo: resp.xMotivo,
    protocolo: resp.protocolo,
    xmlAssinado: assinado,
  };
}

