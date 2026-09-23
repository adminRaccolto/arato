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

/**
 * Evento de Carta de Correção Eletrônica (CC-e), tpEvento 110110.
 *
 * Não corrige valores, tributos, quantidades, nem dados que identifiquem o
 * remetente/destinatário ou a data de emissão/saída — só serve pra regularizar
 * erro em campos que não afetam o cálculo do imposto nem a operação em si (ex:
 * erro de digitação numa descrição, num endereço complementar, numa observação).
 * xCondUso é texto FIXO exigido pelo Manual de Orientação do Contribuinte —
 * não pode ser alterado.
 */
export interface CorrecaoInput {
  chave: string;          // chave de acesso da NF-e, 44 dígitos
  cpfCnpjEmit: string;
  uf: string;
  ambiente: "producao" | "homologacao";
  correcao: string;       // texto da correção — mín. 15, máx. 1000 caracteres
  nSeqEvento: number;     // 1ª CC-e = 1, 2ª = 2, ... (sequencial por chave, nunca reaproveita número)
}

const X_COND_USO_CCE =
  "A Carta de Correcao e disciplinada pelo paragrafo 1o-A do art. 7o do Convenio " +
  "S/N, de 15 de dezembro de 1970 e pode ser utilizada para regularizacao de erro " +
  "ocorrido na emissao de documento fiscal, desde que o erro nao esteja relacionado " +
  "com: I - as variaveis que determinam o valor do imposto tais como: base de " +
  "calculo, aliquota, diferenca de preco, quantidade, valor da operacao ou da " +
  "prestacao; II - a correcao de dados cadastrais que implique mudanca do " +
  "remetente ou do destinatario; III - a data de emissao ou de saida.";

function validarCorrecao(s: string): string {
  const trimmed = s.trim();
  if (trimmed.length < 15) {
    throw new Error("Texto da correção precisa ter pelo menos 15 caracteres (exigência da SEFAZ)");
  }
  if (trimmed.length > 1000) {
    throw new Error("Texto da correção não pode passar de 1000 caracteres");
  }
  // Mesmo motivo do cancelamento: SEFAZ MT rejeita acento com "402 - codificacao
  // diferente de UTF-8" em alguns campos de evento — transliterar evita o risco.
  return escXml(removerAcentos(trimmed));
}

export function montarEnvEventoCorrecao(input: CorrecaoInput): { xml: string; id: string } {
  const chave = soDigitos(input.chave);
  if (chave.length !== 44) throw new Error(`Chave de acesso inválida para CC-e (esperado 44 dígitos, recebido ${chave.length})`);
  if (!Number.isInteger(input.nSeqEvento) || input.nSeqEvento < 1) {
    throw new Error("nSeqEvento da CC-e precisa ser um inteiro ≥ 1");
  }

  const cpfCnpj = soDigitos(input.cpfCnpjEmit);
  const tagDoc = cpfCnpj.length === 14 ? "CNPJ" : "CPF";
  const cOrgao = chave.slice(0, 2);
  const tpAmb = input.ambiente === "producao" ? "1" : "2";
  const dhEvento = gerarDhEmi(input.uf);
  const nSeqEventoId = String(input.nSeqEvento).padStart(2, "0");
  const tpEvento = "110110";
  const id = `ID${tpEvento}${chave}${nSeqEventoId}`;
  const xCorrecao = validarCorrecao(input.correcao);

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
          `<nSeqEvento>${input.nSeqEvento}</nSeqEvento>` +
          `<verEvento>1.00</verEvento>` +
          `<detEvento versao="1.00">` +
            `<descEvento>Carta de Correcao</descEvento>` +
            `<xCorrecao>${xCorrecao}</xCorrecao>` +
            `<xCondUso>${X_COND_USO_CCE}</xCondUso>` +
          `</detEvento>` +
        `</infEvento>` +
      `</evento>` +
    `</envEvento>`;

  return { xml: minifyXml(xml), id };
}

export async function emitirCartaCorrecao(pem: PemPair, input: CorrecaoInput): Promise<ResultadoEvento> {
  const { xml, id } = montarEnvEventoCorrecao(input);
  const assinado = assinarXmlPorId(xml, pem, id);

  const resp = await transmitirEvento(assinado, pem, input.uf, input.ambiente);

  // 135 = evento registrado e vinculado à NF-e (CC-e aceita — mesmo cStat genérico
  // usado pra qualquer evento vinculado, inclusive cancelamento).
  const sucesso = resp.cStat === "135";
  return {
    sucesso,
    cStat: resp.cStat,
    xMotivo: resp.xMotivo,
    protocolo: resp.protocolo,
    xmlAssinado: assinado,
  };
}

