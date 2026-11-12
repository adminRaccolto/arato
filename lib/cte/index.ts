import { abrirOperacaoFiscal, prepararEnvioFiscal, registrarRetornoFiscal, retornoOperacaoExistente } from "../fiscal/operacao";
import { sincronizarDocumentoFiscal } from "../fiscal/persistencia";
/**
 * lib/cte/index.ts
 * Ponto central da emissão de CT-e:
 *   1. Busca config do emitente (cte_emp_{CNPJ} + fiscal_emp_{CNPJ})
 *   2. Carrega certificado A1 (mesmo cert do módulo fiscal referenciado)
 *   3. Gera XML → assina → transmite
 *   4. Salva XML autorizado no Storage e retorna resultado
 */

import { lancarFinanceiroCte, cancelarFinanceiroCte } from "./financeiro";
import { createClient } from "../supabase-servidor";
import { createHash }  from "crypto";
import { buildCTe }     from "./builder";
import { assinarCTe }   from "./signer";
import { transmitirCTe } from "./transmitter";
import { cancelarCTe as registrarCancelamentoCTe, enviarCartaCorrecaoCTe, type CorrecaoCTeItem } from "./evento";
import type { PemPair } from "../nfe/signer";
import { carregarCertificadoEmitente } from "../nfe/certificado-emitente";
import { resolverConfigCTe } from "./config";
import { montarProcAutorizado } from "../fiscal/documento-autorizado";
import { ibgeValido } from "../nfe/identidade-fiscal";
import type { CTeInput, EmitenteCTe } from "./builder";

export type { CTeInput, EmitenteCTe };

function sb() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

// ─── Próximo número do CT-e ───────────────────────────────────────────────────
// Achado real 28/09/2026 (mesma classe corrigida no MDF-e): os parâmetros de CT-e são do CLIENTE
// e podem existir em mais de uma cópia (uma por fazenda em que já foram salvos). Gravar em TODAS
// as cópias do mesmo conta_id+módulo mantém elas sempre idênticas, então a leitura (que já pega
// a MAIOR entre as cópias) nunca vê uma desatualizada.
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
  const { error } = await sb().storage.from("arquivos")
    .upload(path, new Blob([xml], { type: "application/xml" }), { upsert: true });
  if (error) throw error;
  const { data } = sb().storage.from("arquivos").getPublicUrl(path);
  return data.publicUrl;
}

// ─── Resultado ───────────────────────────────────────────────────────────────
export interface ResultadoEmissaoCTe {
  operacao_id?:string;pendente?:boolean;sincronizacao_pendente?:boolean;
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
  requisicao_id?:string;
  emitente_cnpj?: string | null;
  cte_id?:        string | null; // ID do registro em `ctes` — atualizado com service_role após autorização
  /** CT-e substituto: ID do registro original em `ctes` (precisa estar autorizado). */
  cte_substituido_id?: string | null;
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
    const {pem}=await carregarCertificadoEmitente(sb(),fazendaId,resolved.emitenteDigits || fiscal.cpf_cnpj_emitente || '');
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
    // Cancela também o financeiro automático do CT-e (a receber da Empresa / a pagar do produtor)
    let avisoFin = "";
    try {
      const fin = await cancelarFinanceiroCte(options.cte_id);
      console.log("[cancelarCTe] financeiro:", fin.log.join(" | "));
      if (fin.pendenteManual) avisoFin = " ATENÇÃO: há lançamento financeiro deste CT-e já pago/recebido — trate manualmente (estorno).";
    } catch (e) { console.error("[cancelarCTe] financeiro falhou:", e); avisoFin = " Não foi possível cancelar o financeiro automático — confira Contas a Pagar/Empresa."; }

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
    return avisoFin ? { ...resultado, xMotivo: `${resultado.xMotivo ?? "Cancelamento homologado."}${avisoFin}` } : resultado;
  } catch (error) {
    console.error("[cancelarCTe]", error);
    return { sucesso: false, cStat: "ERRO_TECNICO", xMotivo: String(error) };
  }
}

export interface CartaCorrecaoCTeOptions {
  cte_id: string;
  emitente_cnpj?: string | null;
  chave_acesso: string;
  correcoes: CorrecaoCTeItem[];
}

/** Envia a Carta de Correção (evento 110110) e guarda cada correção aceita em cte_cartas_correcao. */
export async function emitirCartaCorrecaoCTe(fazendaId: string, options: CartaCorrecaoCTeOptions) {
  const chave = options.chave_acesso.replace(/\D/g, "");
  if (chave.length !== 44) return { sucesso: false, cStat: "VALIDACAO_LOCAL", xMotivo: "CT-e não possui uma chave de acesso válida." };

  const { data: cte } = await sb().from("ctes").select("id,status,fazenda_id,chave_acesso").eq("id", options.cte_id).maybeSingle();
  if (!cte || cte.fazenda_id !== fazendaId) return { sucesso: false, cStat: "VALIDACAO_LOCAL", xMotivo: "CT-e não encontrado nesta fazenda." };
  if (cte.status !== "autorizado") return { sucesso: false, cStat: "VALIDACAO_LOCAL", xMotivo: "Só é possível corrigir um CT-e autorizado." };

  const resolved = await resolverConfigCTe(fazendaId, options.emitente_cnpj);
  if (!resolved || !resolved.cteConfigEncontrada) return { sucesso: false, cStat: "CONFIGURACAO", xMotivo: "Configuração CT-e do emitente não encontrada." };
  const confg = resolved.cteConfig;
  const fiscal = resolved.fiscalConfig;


  // Próximo nº de sequência do evento (a SEFAZ rejeita repetido; máximo 20 por CT-e)
  const { data: ult, error: errSeq } = await sb().from("cte_cartas_correcao").select("n_seq").eq("cte_id", options.cte_id).order("n_seq", { ascending: false }).limit(1);
  if (errSeq) return { sucesso: false, cStat: "MIGRATION", xMotivo: "Tabela de cartas de correção ausente — aplique a Seção 343 do supabase_migrations.sql." };
  const nSeq = (ult?.[0]?.n_seq ?? 0) + 1;

  try {
    const {pem}=await carregarCertificadoEmitente(sb(),fazendaId,resolved.emitenteDigits || fiscal.cpf_cnpj_emitente || '');
    const emitente = fiscal.cpf_cnpj_emitente ?? confg.cpf_cnpj_emitente ?? options.emitente_cnpj ?? resolved.emitenteDigits;
    const r = await enviarCartaCorrecaoCTe(pem, {
      chave, cpfCnpjEmitente: emitente,
      uf: fiscal.uf_emitente ?? confg.uf_emitente ?? "MT",
      ambiente: (confg.ambiente as "producao" | "homologacao") ?? "homologacao",
      nSeqEvento: nSeq, correcoes: options.correcoes,
    });
    if (!r.sucesso) return { sucesso: false, cStat: r.cStat, xMotivo: r.xMotivo };
    const { error } = await sb().from("cte_cartas_correcao").insert(options.correcoes.map(c => ({
      fazenda_id: fazendaId, cte_id: options.cte_id, n_seq: nSeq, grupo: c.grupo.trim(), campo: c.campo.trim(),
      valor: c.valor.trim(), item: c.item?.trim() || null, protocolo: r.protocolo ?? null,
      data_registro: r.dataRegistro ?? new Date().toISOString(),
    })));
    if (error) console.error("[cartaCorrecaoCTe] SEFAZ aceitou, mas falhou ao gravar histórico:", error);
    return { sucesso: true, cStat: r.cStat, xMotivo: r.xMotivo, protocolo: r.protocolo, nSeq };
  } catch (error) {
    console.error("[cartaCorrecaoCTe]", error);
    return { sucesso: false, cStat: "ERRO_TECNICO", xMotivo: String(error) };
  }
}

// ─── Função principal ────────────────────────────────────────────────────────
export async function emitirCTe(
  fazendaId: string,
  inputBase: Omit<CTeInput, "emitente">,
  options: EmitirCTeOptions = {},
): Promise<ResultadoEmissaoCTe> {
  const dadosOperacao={input:structuredClone(inputBase),substituido_id:options.cte_substituido_id ?? null};

  if (options.cte_id) {
    const { data: documento, error } = await sb().from("ctes").select("id,fazenda_id,status,data_emissao").eq("id", options.cte_id).maybeSingle();
    if (error) throw error;
    if (!documento || documento.fazenda_id !== fazendaId)
      return { sucesso: false, cStat: "ACESSO", xMotivo: "O CT-e não pertence à fazenda autorizada." };
    if(["cancelado","substituido"].includes(documento.status))return {sucesso:false,cStat:"ESTADO_FINAL",xMotivo:"CT-e cancelado/substituído não pode ser reemitido."};
    inputBase={...inputBase,data_emissao:inputBase.data_emissao || documento.data_emissao};
  }

  if (!["5352", "5353", "6932"].includes(String((inputBase as { cfop?: string }).cfop ?? "")))
    return { sucesso: false, cStat: "503", xMotivo: "CFOP inválido para CT-e — use 5352, 5353 ou 6932." };

  // CT-e substituto: o original precisa existir e estar autorizado (a SEFAZ valida o prazo)
  if (inputBase.tp_cte === "3") {
    if (options.cte_substituido_id) {
      const { data: orig } = await sb().from("ctes").select("id,status,chave_acesso,fazenda_id").eq("id", options.cte_substituido_id).maybeSingle();
      if (!orig || orig.fazenda_id !== fazendaId)
        return { sucesso: false, cStat: "504", xMotivo: "CT-e original não encontrado nesta fazenda." };
      if (orig.status !== "autorizado")
        return { sucesso: false, cStat: "504", xMotivo: "Só é possível substituir um CT-e autorizado (o original está como " + orig.status + ")." };
      const chOrig = (orig.chave_acesso ?? "").replace(/\D/g, "");
      if (chOrig.length !== 44)
        return { sucesso: false, cStat: "504", xMotivo: "O CT-e original não tem chave de acesso válida." };
      inputBase = { ...inputBase, cte_substituido_chave: chOrig };
    } else {
      // Original emitido em outro sistema: só a chave informada (a SEFAZ valida o resto)
      const chExt = (inputBase.cte_substituido_chave ?? "").replace(/\D/g, "");
      if (chExt.length !== 44)
        return { sucesso: false, cStat: "504", xMotivo: "CT-e substituto: informe o CT-e a substituir ou a chave de 44 dígitos do original." };
      inputBase = { ...inputBase, cte_substituido_chave: chExt };
    }
  }

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


  let pem: PemPair;
  try {pem=(await carregarCertificadoEmitente(sb(),fazendaId,resolved.emitenteDigits || fc.cpf_cnpj_emitente || '')).pem;}
  catch(e){return {sucesso:false,cStat:"CERTIFICADO_A1",xMotivo:e instanceof Error ? e.message : "Não foi possível validar o certificado A1."};}

  // Antes de reservar o número: sem o código do município a SEFAZ devolve só "Falha no Schema" e o número se perde
  const ibgeEmitente = fc.municipio_ibge || confg.municipio_ibge || "";
  if (!ibgeValido(ibgeEmitente)) {
    return { sucesso: false, cStat: "VALIDACAO_LOCAL", xMotivo: "O município do emitente não foi reconhecido. Confira a cidade e a UF em Cadastros → Empresas, ou informe o Código IBGE em Parâmetros do Sistema → Fiscal, e tente de novo." };
  }

  // 4. Número sequencial
  // Incrementa o número sequencial na fazenda onde o registro cte_emp_* REALMENTE está gravado
  // (resolved.cteFazendaId) — pode ser diferente da fazenda que está emitindo agora, já que os
  // parâmetros do emitente são compartilhados pela conta inteira, não duplicados por fazenda.
  const numero = 1;

  const emitente: EmitenteCTe = {
    cpf_cnpj:       fc.cpf_cnpj_emitente ?? confg.cpf_cnpj_emitente ?? options.emitente_cnpj ?? resolved.emitenteDigits,
    razao_social:   fc.razao_social       ?? confg.razao_social       ?? "",
    ie:             fc.ie_emitente        ?? confg.ie_emitente        ?? "",
    crt:            (fc.crt as EmitenteCTe["crt"]) ?? "3",
    logradouro:     fc.logradouro         ?? confg.logradouro         ?? "",
    numero:         fc.numero             ?? confg.numero             ?? "S/N",
    bairro:         fc.bairro             ?? confg.bairro             ?? "",
    municipio_ibge: ibgeEmitente,
    municipio_nome: fc.municipio_nome || fc.municipio || confg.municipio_nome || confg.municipio || "Nova Mutum",
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
    const ano2026=(inputBase.data_emissao || new Intl.DateTimeFormat("sv-SE",{timeZone:"America/Cuiaba"}).format(new Date())).startsWith("2026-");
    const ibsUf = ano2026 ? 0.10 : num(confg.ibs_uf_aliq), ibsMun = ano2026 ? 0 : num(confg.ibs_mun_aliq), cbs = ano2026 ? 0.90 : num(confg.cbs_aliq);
    if ((cclass.length !== 6 || !cclass.startsWith(cst)) || (cst === "000" && [ibsUf,ibsMun,cbs].some(v=>!Number.isFinite(v)||v<0||v>100))) {
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
  buildCTe({...inputBase,emitente,ibscbs});
  const operacao=await abrirOperacaoFiscal(sb(),{id:options.requisicao_id,fazenda:fazendaId,modelo:57,documento:emitente.cpf_cnpj,serie:emitente.serie,ambiente:emitente.ambiente,
    dados:dadosOperacao,modulo:resolved.cteModulo,proximo:confg.numero_inicial,registro:options.cte_id});
  if(!operacao.executar)return retornoOperacaoExistente(operacao) as ResultadoEmissaoCTe;
  emitente.numero_cte=operacao.numero;
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

  await prepararEnvioFiscal(sb(),operacao,xmlAssinado,built.chave);
  let resposta;
  try{resposta=await transmitirCTe(xmlAssinado,pem,emitente.uf,emitente.ambiente);}
  catch(e){
    const pendente={sucesso:false,cStat:"PROCESSAMENTO_PENDENTE",xMotivo:"Resultado da SEFAZ ainda não confirmado. Consulte Emissões em conferência antes de reenviar. "+String(e),operacao_id:operacao.id,pendente:true,chave:built.chave,numero:built.numero};
    try{await registrarRetornoFiscal(sb(),operacao,"pendente",null,pendente);}catch{}
    return pendente;
  }
  const autorizada=resposta.sucesso&&!!resposta.xmlProt&&!!resposta.protocolo;
  const pendente=!resposta.cStat || ["103","104","105","106","999","108","109","204","539"].includes(resposta.cStat) || (resposta.sucesso&&!autorizada);
  const proc=autorizada?montarProcAutorizado("cte",xmlAssinado,resposta.xmlProt!,"4.00"):undefined;
  const resultado:ResultadoEmissaoCTe={sucesso:autorizada,chave:built.chave,numero:built.numero,protocolo:resposta.protocolo,dhRecbto:resposta.dhRecbto,
    cStat:resposta.cStat ?? resposta.errorCode ?? "ERR",xMotivo:resposta.xMotivo,xmlAssinado,aviso:autorizada?avisoIbsCbs:undefined,
    operacao_id:operacao.id,pendente,sincronizacao_pendente:autorizada};
  const estado=autorizada?"autorizada":pendente?"pendente":"rejeitada";
  try{
    await registrarRetornoFiscal(sb(),operacao,estado,resposta,resultado,proc);
    if(proc){
      const sync=await sincronizarDocumentoFiscal(sb(),{...operacao,chave:built.chave,xml_assinado:xmlAssinado},resultado as unknown as Record<string,unknown>,proc);
      resultado.xmlUrl=sync.xmlUrl;resultado.sincronizacao_pendente=false;
      await registrarRetornoFiscal(sb(),operacao,"sincronizada",resposta,resultado,proc);
    }
  }catch(e){resultado.sincronizacao_pendente=true;resultado.xMotivo="Resultado fiscal recebido; sincronização local pendente: "+(e as Error).message;}
  return resultado;
}
