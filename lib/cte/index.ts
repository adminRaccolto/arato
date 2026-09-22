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
import { cancelarCTe as registrarCancelamentoCTe } from "./evento";
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
  cte_id?:        string | null; // ID do registro em `ctes` — atualizado com service_role após autorização
}

export interface CancelarCTeOptions {
  cte_id: string;
  emitente_cnpj?: string | null;
  chave_acesso: string;
  protocolo_autorizacao?: string | null;
  justificativa: string;
}

async function protocoloDoXmlAutorizado(fazendaId: string, chave: string): Promise<string | null> {
  const path = `${fazendaId}/cte_emitidos/${chave}.xml`;
  const { data, error } = await sb().storage.from("arquivos").download(path);
  if (error || !data) return null;
  const xml = await data.text();
  // O XML autorizado contém <infProt> com o protocolo da autorização. Não
  // usa o primeiro nProt do documento para evitar confundir um evento futuro.
  const infProt = xml.match(/<infProt\b[^>]*>[\s\S]*?<\/infProt>/i)?.[0] ?? "";
  return infProt.match(/<nProt[^>]*>(\d{15})<\/nProt>/i)?.[1] ?? null;
}

/** Registra na SEFAZ o evento 110111 e só então espelha o cancelamento local. */
export async function cancelarCTeEmitido(
  fazendaId: string,
  options: CancelarCTeOptions,
) {
  const chave = options.chave_acesso.replace(/\D/g, "");
  if (chave.length !== 44) {
    return { sucesso: false, cStat: "VALIDACAO_LOCAL", xMotivo: "CT-e não possui uma chave de acesso válida." };
  }
  if (options.justificativa.trim().length < 15) {
    return { sucesso: false, cStat: "VALIDACAO_LOCAL", xMotivo: "A justificativa deve conter pelo menos 15 caracteres." };
  }

  const resolved = await resolverConfigCTe(fazendaId, options.emitente_cnpj);
  if (!resolved || !resolved.cteConfigEncontrada) {
    return { sucesso: false, cStat: "CONFIGURACAO", xMotivo: "Configuração CT-e do emitente não encontrada." };
  }
  const confg = resolved.cteConfig;
  const fiscal = resolved.fiscalConfig;
  const certPath = confg.cert_a1_path ?? fiscal.cert_a1_path;
  const certSenha = confg.cert_a1_senha ?? fiscal.cert_a1_senha;
  if (!certPath || !certSenha) {
    return { sucesso: false, cStat: "CERTIFICADO", xMotivo: "Certificado A1 não configurado para este emitente." };
  }

  // CT-es emitidos antes desta correção não tinham o protocolo persistido;
  // recuperamos do XML autorizado que o próprio sistema arquiva no Storage.
  const protocolo = options.protocolo_autorizacao?.replace(/\D/g, "")
    || await protocoloDoXmlAutorizado(fazendaId, chave);
  if (!protocolo) {
    return {
      sucesso: false,
      cStat: "PROTOCOLO_AUSENTE",
      xMotivo: "Protocolo de autorização não encontrado. Consulte o CT-e no portal SEFAZ e informe/registre o protocolo antes de cancelar.",
    };
  }

  try {
    const pem = pfxParaPem(await carregarPfx(certPath), certSenha);
    const emitente = fiscal.cpf_cnpj_emitente ?? confg.cpf_cnpj_emitente ?? options.emitente_cnpj ?? resolved.emitenteDigits;
    const resultado = await registrarCancelamentoCTe(pem, {
      chave,
      protocolo,
      cpfCnpjEmitente: emitente,
      uf: fiscal.uf_emitente ?? confg.uf_emitente ?? "MT",
      ambiente: (confg.ambiente as "producao" | "homologacao") ?? "homologacao",
      justificativa: options.justificativa,
    });
    if (!resultado.sucesso) return resultado;

    const update = {
      status: "cancelado",
      protocolo_autorizacao: protocolo,
      protocolo_cancelamento: resultado.protocolo ?? null,
      data_cancelamento: resultado.dataRegistro ?? new Date().toISOString(),
      motivo_cancelamento: options.justificativa.trim(),
    };
    const { error } = await sb().from("ctes").update(update).eq("id", options.cte_id);
    if (error) {
      console.error("[cancelarCTe] SEFAZ confirmou, mas falhou ao persistir no banco:", error);
      return { ...resultado, sucesso: false, cStat: "PERSISTENCIA", xMotivo: "SEFAZ confirmou o cancelamento, mas o sistema não conseguiu gravar o retorno. Não reenvie; contate o suporte com a chave do CT-e." };
    }
    return resultado;
  } catch (error) {
    console.error("[cancelarCTe]", error);
    return { sucesso: false, cStat: "ERRO_TECNICO", xMotivo: String(error) };
  }
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
  // Incrementa o número sequencial na fazenda onde o registro cte_emp_* REALMENTE está gravado
  // (resolved.cteFazendaId) — pode ser diferente da fazenda que está emitindo agora, já que os
  // parâmetros do emitente são compartilhados pela conta inteira, não duplicados por fazenda.
  const numero = await proximoNumero(resolved.cteFazendaId, resolved.cteModulo, confg);

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

  // 9. Atualizar registro `ctes` com service_role_key (evita falha silenciosa por JWT expirado no cliente)
  // Achado real 23/09/2026: a coluna xml_url nunca existiu em `ctes` (só em `notas_fiscais`) — o
  // update falhava com PGRST204 SEMPRE, em SILÊNCIO (catch vazio), então TODO CT-e autorizado de
  // verdade na SEFAZ (chave real gerada) nunca gravava "autorizado" aqui — a tela piscava
  // "Autorizado" (update otimista local) e voltava pra "Rascunho" assim que recarregava do banco.
  // Corrigido: tenta com xml_url; se a coluna não existir (schema sem a migration ainda), reenvia
  // sem ela; e loga se mesmo assim falhar, em vez de engolir o erro — um CT-e autorizado na SEFAZ
  // que não vira "autorizado" no banco é risco real de reemissão duplicada.
  if (options.cte_id) {
    const payloadUpdate = {
      status:       resposta.sucesso ? "autorizado" : "rascunho",
      chave_acesso: built.chave,
      protocolo_autorizacao: resposta.protocolo ?? null,
      xml_url:      xmlUrl ?? null,
      numero_cte:   String(built.numero),
    };
    const { error: updErr } = await sb().from("ctes").update(payloadUpdate).eq("id", options.cte_id);
    if (updErr?.code === "PGRST204") {
      const { xml_url: _xu, protocolo_autorizacao: _pa, ...semColunasNovas } = payloadUpdate;
      const retry = await sb().from("ctes").update(semColunasNovas).eq("id", options.cte_id);
      if (retry.error) console.error("[emitirCTe] falha ao gravar status autorizado (retry sem xml_url):", retry.error);
    } else if (updErr) {
      console.error("[emitirCTe] falha ao gravar status autorizado:", updErr);
    }
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
