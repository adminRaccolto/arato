/**
 * lib/cte/index.ts
 * Ponto central da emissão de CT-e:
 *   1. Busca config do emitente (cte_emp_{CNPJ} + fiscal_emp_{CNPJ})
 *   2. Carrega certificado A1 (mesmo cert do módulo fiscal referenciado)
 *   3. Gera XML → assina → transmite
 *   4. Salva XML autorizado no Storage e retorna resultado
 */

import { lancarFinanceiroCte } from "./financeiro";
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
  aviso?:     string;   // aviso não-bloqueante mostrado depois de autorizado (ex: IBS/CBS não destacado)
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
      // A migration de rastreabilidade pode ainda não ter sido aplicada. Como
      // a SEFAZ já homologou o evento, o status local precisa refletir isso
      // mesmo sem as colunas novas; nunca devemos sugerir reenviar o evento.
      const { error: retryError } = await sb()
        .from("ctes")
        .update({ status: "cancelado" })
        .eq("id", options.cte_id);
      if (!retryError) {
        return {
          ...resultado,
          xMotivo: "Cancelamento homologado pela SEFAZ. Os dados de auditoria serão gravados após aplicar a migration pendente.",
        };
      }
      console.error("[cancelarCTe] falha também ao gravar status cancelado:", retryError);
      return { ...resultado, sucesso: false, cStat: "PERSISTENCIA", xMotivo: "SEFAZ confirmou o cancelamento, mas o sistema não conseguiu sincronizar o status local. Não reenvie o evento; contate o suporte com a chave do CT-e." };
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

  if (!["5352", "5353", "6932"].includes(String((inputBase as { cfop?: string }).cfop ?? "")))
    return { sucesso: false, cStat: "503", xMotivo: "CFOP inválido para CT-e — use 5352, 5353 ou 6932." };

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
  // Regra fiscal (dono, 24/09/2026): prestação INTRAESTADUAL sai com CST 51 (diferido);
  // INTERESTADUAL com CST 00 ou 20. Barra aqui — nunca transmite CST fora da regra.
  {
    const intra = inputBase.uf_ini === inputBase.uf_fim;
    const cstUsado = inputBase.cst_icms ?? (inputBase.aliquota_icms > 0 ? "00" : "40");
    if (intra && cstUsado !== "51") {
      return { sucesso: false, cStat: "VALIDACAO_LOCAL", xMotivo: `CT-e intraestadual (${inputBase.uf_ini} → ${inputBase.uf_fim}) precisa sair com CST 51 (ICMS diferido) — está com CST ${cstUsado}. Reabra o rascunho e ajuste a Situação Tributária.` };
    }
    if (!intra && cstUsado !== "00" && cstUsado !== "20") {
      return { sucesso: false, cStat: "VALIDACAO_LOCAL", xMotivo: `CT-e interestadual (${inputBase.uf_ini} → ${inputBase.uf_fim}) precisa sair com CST 00 ou 20 — está com CST ${cstUsado}. Reabra o rascunho e ajuste a Situação Tributária.` };
    }
    if (!intra && !(inputBase.aliquota_icms > 0)) {
      return { sucesso: false, cStat: "VALIDACAO_LOCAL", xMotivo: "CT-e interestadual (CST 00/20) precisa de alíquota de ICMS maior que zero." };
    }
    if (cstUsado === "20" && !(Number(inputBase.pred_bc_icms) > 0)) {
      return { sucesso: false, cStat: "VALIDACAO_LOCAL", xMotivo: "CST 20 (redução de base) precisa do percentual de redução da base de cálculo." };
    }
  }

  // IBS/CBS (Reforma Tributária) — configurado por emitente em Parâmetros → CT-e. Simples/MEI
  // (CRT 1/2/4) são dispensados do grupo. Se "Destacar IBS/CBS" está ativo mas faltam
  // alíquotas/classificação, BLOQUEIA antes de transmitir (nunca chuta valor num documento fiscal).
  let ibscbs: CTeInput["ibscbs"];
  // Padrão do CT-e: frete é prestação de serviço ONEROSA → tributação integral, CST 000 /
  // cClassTrib 000001 (o 410/410999 da NF-e é "não onerosa" e NÃO serve aqui — achado 24/09/2026:
  // CT-e saía com a mesma classificação da NF-e e com alíquotas zeradas). Só um "410" salvo
  // explicitamente em Parâmetros → CT-e mantém o 410. Em 2026 (ano de teste, LC 214/2025 art. 343)
  // as alíquotas são fixas: IBS UF 0,10%, IBS Município 0,00%, CBS 0,90% — valem mesmo que o
  // cadastro esteja vazio/zerado. Simples/MEI seguem dispensados; só "nao" explícito desliga.
  if (confg.ibs_cbs_ativo !== "nao" && !["1", "2", "4"].includes(String(emitente.crt))) {
    const cst = (confg.ibs_cbs_cst === "410" ? "410" : "000") as "000" | "410";
    const cclass = String(confg.ibs_cbs_cclasstrib || (cst === "410" ? "410999" : "000001")).replace(/\D/g, "");
    const num = (v: unknown) => { const n = parseFloat(String(v ?? "").replace(",", ".")); return Number.isFinite(n) ? n : NaN; };
    const ano2026 = new Date().getFullYear() === 2026;
    const ibsUf = ano2026 ? 0.10 : num(confg.ibs_uf_aliq), ibsMun = ano2026 ? 0 : num(confg.ibs_mun_aliq), cbs = ano2026 ? 0.90 : num(confg.cbs_aliq);
    if (cclass.length !== 6 || (cst === "000" && (Number.isNaN(ibsUf) || Number.isNaN(ibsMun) || Number.isNaN(cbs)))) {
      return { sucesso: false, cStat: "VALIDACAO_LOCAL", xMotivo: "IBS/CBS ativo em Parâmetros → CT-e, mas faltam dados: informe cClassTrib (6 dígitos) e as alíquotas de IBS (UF e Município) e CBS — ou desative o destaque. Confirme os valores com o contador." };
    }
    ibscbs = { cst, cclasstrib: cclass, ibsUfAliq: cst === "000" ? ibsUf : 0, ibsMunAliq: cst === "000" ? ibsMun : 0, cbsAliq: cst === "000" ? cbs : 0 };
  }
  // IBS/CBS não destacado por emitente que é obrigado (CRT normal) — a SEFAZ ainda autorizou sem o
  // grupo quando isso foi checado, mas a NT 2025.001 prevê validação desde 05/01/2026: nunca deixar
  // passar em silêncio. Não bloqueia (não trava a operação), mas o aviso aparece pra quem emitiu.
  const avisoIbsCbs = (!ibscbs && !["1", "2", "4"].includes(String(emitente.crt)))
    ? "IBS/CBS NÃO foi destacado neste CT-e. Emitente Lucro Presumido/Real é obrigado desde 05/01/2026 (LC 214/2025, NT 2025.001). Configure em Parâmetros → CT-e → \"Destacar IBS/CBS no CT-e\" (confirme as alíquotas com o contador)."
    : undefined;
  const built = buildCTe({ ...inputBase, emitente, ibscbs });

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

  // Financeiro automático (a receber da transportadora + a pagar do tomador da conta) — nunca
  // derruba a emissão; o resultado vai só pro log do servidor.
  if (resposta.sucesso && options.cte_id) {
    try { console.log("[emitirCTe] financeiro:", (await lancarFinanceiroCte(options.cte_id)).join(" | ")); }
    catch (e) { console.error("[emitirCTe] financeiro falhou:", e); }
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
    aviso:      resposta.sucesso ? avisoIbsCbs : undefined,
  };
}
