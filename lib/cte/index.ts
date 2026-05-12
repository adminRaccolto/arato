/**
 * lib/cte/index.ts
 * Ponto central da emissão de CT-e:
 *   1. Busca config do emitente (módulo "cte" em configuracoes_modulo)
 *   2. Carrega certificado A1 (mesmo cert do módulo fiscal referenciado)
 *   3. Gera XML → assina → transmite
 *   4. Salva XML autorizado no Storage e retorna resultado
 */

import { createClient } from "@supabase/supabase-js";
import { buildCTe }     from "./builder";
import { assinarCTe }   from "./signer";
import { transmitirCTe } from "./transmitter";
import { pfxParaPem }   from "../nfe/signer";
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
async function proximoNumero(fazendaId: string, confg: Record<string, string>): Promise<number> {
  const atual = parseInt(String(confg.numero_inicial ?? "1"));
  await sb()
    .from("configuracoes_modulo")
    .update({ config: { ...confg, numero_inicial: String(atual + 1) } })
    .eq("fazenda_id", fazendaId)
    .eq("modulo", "cte");
  return atual;
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

// ─── Função principal ────────────────────────────────────────────────────────
export async function emitirCTe(
  fazendaId: string,
  inputBase: Omit<CTeInput, "emitente">
): Promise<ResultadoEmissaoCTe> {

  // 1. Config CT-e
  const { data: cteRow } = await sb()
    .from("configuracoes_modulo")
    .select("config")
    .eq("fazenda_id", fazendaId)
    .eq("modulo", "cte")
    .single();

  const confg = cteRow?.config as Record<string, string> | null;
  if (!confg) return { sucesso: false, cStat: "500", xMotivo: "Configuração CT-e não encontrada — configure em Parâmetros → CT-e" };

  // 2. Config fiscal (para emitter identity + cert)
  const moduloFiscal = confg.modulo_fiscal_ref ?? "fiscal";
  const { data: fiscalRow } = await sb()
    .from("configuracoes_modulo")
    .select("config")
    .eq("fazenda_id", fazendaId)
    .eq("modulo", moduloFiscal)
    .single();

  const fc = fiscalRow?.config as Record<string, string> | null ?? {};
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
  const numero = await proximoNumero(fazendaId, confg);

  const emitente: EmitenteCTe = {
    cpf_cnpj:       fc.cpf_cnpj_emitente ?? confg.cpf_cnpj_emitente ?? "",
    razao_social:   fc.razao_social       ?? confg.razao_social       ?? "",
    ie:             fc.ie_emitente        ?? confg.ie_emitente        ?? "",
    crt:            (fc.crt as EmitenteCTe["crt"]) ?? "3",
    logradouro:     fc.logradouro         ?? confg.logradouro         ?? "",
    numero:         fc.numero             ?? confg.numero             ?? "S/N",
    bairro:         fc.bairro             ?? confg.bairro             ?? "",
    municipio_ibge: fc.municipio_ibge     ?? confg.municipio_ibge     ?? "5106455",
    municipio_nome: fc.municipio_nome     ?? confg.municipio_nome     ?? "Nova Mutum",
    uf:             fc.uf_emitente        ?? confg.uf_emitente        ?? "MT",
    cep:            fc.cep               ?? confg.cep               ?? "00000000",
    fone:           fc.fone              ?? confg.fone,
    rntrc:          confg.rntrc           ?? "",
    ambiente:       (confg.ambiente as "producao" | "homologacao") ?? "homologacao",
    serie:          confg.serie_cte       ?? "001",
    numero_cte:     numero,
  };

  // 5. Construir XML
  const built = buildCTe({ ...inputBase, emitente });

  // 6. Assinar
  let xmlAssinado: string;
  try { xmlAssinado = assinarCTe(built.xml, pem); }
  catch (e) { return { sucesso: false, cStat: "503", xMotivo: `Erro na assinatura: ${e}`, xmlAssinado: built.xml }; }

  // 7. Transmitir
  let resposta;
  try { resposta = await transmitirCTe(xmlAssinado, pem, emitente.uf, emitente.ambiente); }
  catch (e) { return { sucesso: false, cStat: "504", xMotivo: `Falha na comunicação SEFAZ: ${e}`, xmlAssinado }; }

  const autorizado = resposta.cStat === "100";

  // 8. Salvar XML
  let xmlUrl: string | undefined;
  if (autorizado && resposta.xmlProt) {
    try { xmlUrl = await salvarXml(fazendaId, built.chave, resposta.xmlProt); } catch { /* best-effort */ }
  }

  return {
    sucesso:    autorizado,
    chave:      built.chave,
    numero:     built.numero,
    protocolo:  resposta.protocolo,
    dhRecbto:   resposta.dhRecbto,
    xmlUrl,
    cStat:      resposta.cStat,
    xMotivo:    resposta.xMotivo,
    xmlAssinado,
  };
}
