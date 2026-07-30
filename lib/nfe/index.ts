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
async function tentarDownload(path: string): Promise<Buffer | null> {
  const { data, error } = await sb().storage.from("certificados").download(path);
  if (!error && data) return Buffer.from(await data.arrayBuffer());
  return null;
}

async function carregarPfx(
  storagePath: string,
  fazendaId: string,
): Promise<Buffer> {
  // 1. Caminho exato registrado no banco
  const r1 = await tentarDownload(storagePath);
  if (r1) return r1;

  // 2. Tenta <fazendaId>/<filename> se o storagePath não inclui o fazendaId
  const filename = storagePath.split("/").pop() ?? "";
  if (filename && !storagePath.startsWith(fazendaId)) {
    const r2 = await tentarDownload(`${fazendaId}/${filename}`);
    if (r2) return r2;
  }

  // 3. Scan RESTRITO à pasta da fazenda — nunca escanear a raiz do bucket,
  //    pois isso expõe certificados de outros tenants.
  const { data: fazFiles } = await sb().storage.from("certificados").list(fazendaId, { limit: 100 });
  for (const f of fazFiles ?? []) {
    if (/\.(pfx|p12)$/i.test(f.name)) {
      const r3 = await tentarDownload(`${fazendaId}/${f.name}`);
      if (r3) return r3;
    }
    // Sub-pasta dentro da fazenda (ex: fazendaId/pf/ ou fazendaId/pj/)
    if (!f.name.includes(".")) {
      const { data: sub } = await sb().storage.from("certificados").list(`${fazendaId}/${f.name}`, { limit: 20 });
      for (const sf of sub ?? []) {
        if (/\.(pfx|p12)$/i.test(sf.name)) {
          const r4 = await tentarDownload(`${fazendaId}/${f.name}/${sf.name}`);
          if (r4) return r4;
        }
      }
    }
  }

  throw new Error(
    `Certificado não encontrado. Acesse Configurações → Parâmetros → Fiscal ` +
    `e faça o upload do .pfx na seção "Certificado Digital" do emitente.`
  );
}

// ─── Monta nfeProc (XML final arquivável) ─────────────────────────────────────
// SEFAZ devolve apenas o bloco <protNFe> na resposta de autorização.
// Para arquivamento e contingência, o padrão exige o documento <nfeProc> que
// contém o XML assinado + protNFe em um único envelope.
function montarNfeProc(xmlAssinado: string, protNFe: string): string {
  // Remove declaração XML (<?xml ...?>) — nfeProc tem a sua própria
  const nfeBody = xmlAssinado.replace(/^<\?xml[^?]*\?>\s*/i, "");
  return (
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<nfeProc xmlns="http://www.portalfiscal.inf.br/nfe" versao="4.00">` +
    nfeBody +
    protNFe +
    `</nfeProc>`
  );
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
  // Dados do emitente — para persistir em dados_nf_json e usados no DANFE
  emit_razao?: string;
  emit_cnpj?: string;
  emit_ie?: string;
  emit_endereco?: string;
  emit_numero?: string;
  emit_bairro?: string;
  emit_municipio?: string;
  emit_uf?: string;
  emit_cep?: string;
  emit_fone?: string;
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
    pfxBuffer = await carregarPfx(certPath, fazendaId);
  } catch (e) {
    return { sucesso: false, cStat: "502", xMotivo: String(e) };
  }
  let pem: ReturnType<typeof pfxParaPem>;
  try {
    pem = pfxParaPem(pfxBuffer, certSenha);
  } catch (e) {
    return { sucesso: false, cStat: "502b", xMotivo: `Certificado inválido ou senha incorreta: ${e}` };
  }

  // 3. Próximo número (reservado de forma atômica)
  const numero = await proximoNumero(fazendaId, moduloKey, confg);

  const cpfCnpjEmit = (confg.cpf_cnpj_emitente ?? "").replace(/\D/g, "");
  const isCPFEmit   = cpfCnpjEmit.length === 11;

  // MOC NF-e 7.0 — faixas de série por tipo de emitente:
  //   CNPJ (procEmi 0/1/2/3): 0–889
  //   CPF  (procEmi 0/1/2/3): 920–969
  //   890–899: NF-e avulsa Fisco Estadual   ← NUNCA usar aqui (causa cStat 502)
  //   970–989: NF-e avulsa Fisco Federal    ← NUNCA usar aqui
  //   900–919 / 990–999: reservados
  const serieConfg = parseInt(confg.serie_nfe ?? "0", 10);
  if (isCPFEmit && (isNaN(serieConfg) || serieConfg < 920 || serieConfg > 969)) {
    return {
      sucesso: false,
      cStat: "CFG",
      xMotivo: `Série "${confg.serie_nfe ?? ""}" inválida para emitente CPF. Configure entre 920 e 969 em Parâmetros → Fiscal → Série NF-e.`,
    };
  }
  if (!isCPFEmit && (isNaN(serieConfg) || serieConfg < 0 || serieConfg > 889)) {
    return {
      sucesso: false,
      cStat: "CFG",
      xMotivo: `Série "${confg.serie_nfe ?? ""}" inválida para emitente CNPJ. Configure entre 0 e 889 em Parâmetros → Fiscal → Série NF-e.`,
    };
  }
  const serie = String(serieConfg).padStart(3, "0");

  const emitente: EmitenteCfg = {
    cpf_cnpj:       cpfCnpjEmit,
    razao_social:   confg.razao_social ?? "",
    ie:             emitIeOverride ?? confg.ie_emitente ?? "",
    im:             confg.im_emitente,
    crt:            (confg.crt as EmitenteCfg["crt"]) ?? "3",
    logradouro:     confg.logradouro ?? "",
    numero:         confg.numero ?? "S/N",
    bairro:         confg.bairro ?? "",
    municipio_ibge: confg.municipio_ibge ?? "",
    municipio_nome: confg.municipio_nome ?? "",
    uf:             confg.uf_emitente ?? "MT",
    cep:            confg.cep ?? "00000000",
    fone:           confg.fone,
    ambiente:       (confg.ambiente as "producao" | "homologacao") ?? "homologacao",
    serie,
    numero_nfe:     numero,
  };

  // 4. Validação prévia de campos obrigatórios — retorna CFG antes de tentar construir/transmitir
  if (!emitente.municipio_ibge || !/^\d{7}$/.test(emitente.municipio_ibge)) {
    return {
      sucesso: false,
      cStat: "CFG",
      xMotivo:
        "Código IBGE do município do emitente não configurado (campo obrigatório <cMun>). " +
        "Acesse Parâmetros → Fiscal → emitente e preencha o CEP para auto-completar o IBGE, depois salve.",
    };
  }

  // Constrói XML — qualquer exceção aqui se tornava 500; agora vira cStat 505
  let built: ReturnType<typeof buildNFe>;
  try {
    built = buildNFe({ ...input, emitente });
  } catch (e) {
    return { sucesso: false, cStat: "505", xMotivo: `Erro na construção do XML: ${e}` };
  }

  // 5. Assinar
  let xmlAssinado: string;
  try {
    xmlAssinado = assinarNFe(built.xml, pem);
  } catch (e) {
    return { sucesso: false, cStat: "503", xMotivo: `Erro na assinatura: ${e}`, xmlAssinado: built.xml };
  }

  // Garante que Id="NFe..." (I maiúsculo) sobrevive ao re-serializador do xml-crypto.
  // Alguns parsers DOM normalizam atributos para lowercase; o SEFAZ exige capital I.
  // xml-crypto pode re-serializar atributos com case diferente; garante Id="NFe..." com I maiúsculo
  xmlAssinado = xmlAssinado.replace(/\bid="(NFe\d{44})"/gi, 'Id="$1"');

  // Debug: verifica se o Id da NF-e sobreviveu ao processo de assinatura intacto
  {
    const idNoAssinado = xmlAssinado.match(/Id="(NFe\d{44})"/)?.[1];
    const idEsperado   = "NFe" + built.chave;
    const ok = idNoAssinado === idEsperado;
    console.log("[NF-e debug] serie usada:", emitente.serie);
    console.log("[NF-e debug] chave do builder:", built.chave);
    console.log("[NF-e debug] Id no XML assinado:", idNoAssinado ?? "NÃO ENCONTRADO");
    console.log("[NF-e debug] match?", ok ? "SIM ✓" : "NÃO — MISMATCH ← CAUSA DO cStat 502");
    if (!ok) {
      console.error("[NF-e CRÍTICO] Id no XML assinado != chave do builder. O signing alterou o Id.");
    }
    // Log dos campos do <ide> e <emit> — permite recalcular chave manualmente
    const ideSection  = xmlAssinado.match(/<ide>[\s\S]*?<\/ide>/)?.[0]   ?? "ide não encontrado";
    const emitSection = xmlAssinado.match(/<emit>[\s\S]*?<\/emit>/)?.[0] ?? "emit não encontrado";
    console.log("[NF-e debug] <ide>:", ideSection.slice(0, 600));
    console.log("[NF-e debug] <emit>:", emitSection.slice(0, 800));
    console.log("[NF-e debug] XML assinado (primeiros 3000 chars):", xmlAssinado.slice(0, 3000));
  }

  // 6. Transmitir
  let resposta;
  try {
    resposta = await transmitirNFe(xmlAssinado, pem, emitente.uf, emitente.ambiente);
  } catch (e) {
    return { sucesso: false, cStat: "504", xMotivo: `Falha na comunicação SEFAZ: ${e}`, xmlAssinado };
  }

  const autorizada = resposta.cStat === "100";

  // 7. Salvar nfeProc no Storage se autorizada
  // Formato correto: XML assinado + protNFe dentro de <nfeProc> — padrão SEFAZ para arquivamento
  let xmlUrl: string | undefined;
  if (autorizada && resposta.xmlProt) {
    try {
      const nfeProcXml = montarNfeProc(xmlAssinado, resposta.xmlProt);
      xmlUrl = await salvarXml(fazendaId, built.chave, nfeProcXml);
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
    // Campos do emitente para persistir em dados_nf_json (usados no DANFE)
    emit_razao:      emitente.razao_social,
    emit_cnpj:       emitente.cpf_cnpj,
    emit_ie:         emitente.ie,
    emit_endereco:   emitente.logradouro,
    emit_numero:     emitente.numero,
    emit_bairro:     emitente.bairro,
    emit_municipio:  emitente.municipio_nome,
    emit_uf:         emitente.uf,
    emit_cep:        emitente.cep,
    emit_fone:       emitente.fone,
  };
}
