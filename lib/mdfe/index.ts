/**
 * lib/mdfe/index.ts
 * Ponto central da emissão de MDF-e:
 *   1. Busca config do emitente (mdfe_emp_{CNPJ} + fiscal_emp_{CNPJ})
 *   2. Carrega certificado A1
 *   3. Resolve veículo/motorista/município de descarga (a partir dos CT-e vinculados)
 *   4. Gera XML → assina → transmite
 *   5. Salva XML autorizado no Storage e retorna resultado
 *
 * O CIOT continua sendo uma rotina separada (gerado via ANTT antes, na tela) — aqui só
 * incorporamos o código já gerado (se houver) no grupo infANTT/infCIOT do XML; a emissão do
 * MDF-e nunca fica bloqueada esperando CIOT (ele é opcional no schema, minOccurs=0).
 */

import { createClient } from "@supabase/supabase-js";
import { buildMDFe } from "./builder";
import { assinarMDFe } from "./signer";
import { transmitirMDFe } from "./transmitter";
import { pfxParaPem } from "../nfe/signer";
import { resolverConfigMDFe } from "./config";
import type { MDFeInput, EmitenteMDFe, MunicipioDescarga } from "./builder";

export type { MDFeInput };

function sb() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

async function carregarPfx(storagePath: string): Promise<Buffer> {
  const { data, error } = await sb().storage.from("certificados").download(storagePath);
  if (error || !data) throw new Error(`Certificado não encontrado: ${storagePath}`);
  return Buffer.from(await data.arrayBuffer());
}

async function proximoNumero(fazendaId: string, modulo: string, confg: Record<string, string>): Promise<number> {
  const atual = parseInt(String(confg.numero_inicial ?? "1"));
  await sb().from("configuracoes_modulo")
    .update({ config: { ...confg, numero_inicial: String(atual + 1) } })
    .eq("fazenda_id", fazendaId).eq("modulo", modulo);
  return atual;
}

const QR_BASE: Record<string, string> = {
  producao:    "https://dfe-portal.svrs.rs.gov.br/mdfe/qrCode",
  homologacao: "https://dfe-portal.svrs.rs.gov.br/mdfe/qrCode",
};

function buildQrCodeMDFe(chave: string, tpAmb: string): string {
  return `${QR_BASE[tpAmb === "1" ? "producao" : "homologacao"]}?chMDFe=${chave}&tpAmb=${tpAmb}`;
}

function inserirInfMDFeSupl(xmlAssinado: string, qrUrl: string): string {
  const qrUrlXml = qrUrl.replace(/&/g, "&amp;");
  const supl = `<infMDFeSupl><qrCodMDFe>${qrUrlXml}</qrCodMDFe></infMDFeSupl>`;
  if (xmlAssinado.includes("</infMDFe><Signature")) {
    return xmlAssinado.replace("</infMDFe><Signature", `</infMDFe>${supl}<Signature`);
  }
  return xmlAssinado.replace("</MDFe>", `${supl}</MDFe>`);
}

async function salvarXml(fazendaId: string, chave: string, xml: string): Promise<string> {
  const path = `${fazendaId}/mdfe_emitidos/${chave}.xml`;
  await sb().storage.from("arquivos").upload(path, new Blob([xml], { type: "application/xml" }), { upsert: true });
  const { data } = sb().storage.from("arquivos").getPublicUrl(path);
  return data.publicUrl;
}

export interface ResultadoEmissaoMDFe {
  sucesso:      boolean;
  chave?:       string;
  numero?:      string;
  protocolo?:   string;
  dhRecbto?:    string;
  xmlUrl?:      string;
  cStat:        string;
  xMotivo:      string;
}

/** Resolve município + IBGE de destino a partir dos CT-e/NF-e vinculados ao MDF-e. */
async function resolverMunicipiosDescarga(
  documentos: { tipo: string; chave: string }[],
): Promise<{ municipios: MunicipioDescarga[]; ctesCanceladas: string[] }> {
  const ctesChaves = documentos.filter(d => d.tipo === "cte").map(d => d.chave.replace(/\D/g, ""));
  const nfeChaves  = documentos.filter(d => d.tipo === "nfe").map(d => d.chave.replace(/\D/g, ""));

  const grupos = new Map<string, MunicipioDescarga>();
  const ctesCanceladas: string[] = [];

  if (ctesChaves.length > 0) {
    const { data: ctes } = await sb().from("ctes")
      .select("chave_acesso, municipio_destino, ibge_destino, status")
      .in("chave_acesso", ctesChaves);
    for (const c of ctes ?? []) {
      // CT-e cancelado não pode sustentar um MDF-e — referenciar ele provavelmente também seria
      // rejeitado pela SEFAZ (ou pior, aceito indevidamente referenciando um documento inválido).
      // Acha isso aqui, localmente, em vez de deixar a SEFAZ recusar sem explicação clara.
      if (c.status === "cancelado") { ctesCanceladas.push(c.chave_acesso as string); continue; }
      const ibge = (c as { ibge_destino?: string }).ibge_destino;
      if (!ibge) continue;
      if (!grupos.has(ibge)) grupos.set(ibge, { municipio_ibge: ibge, municipio_nome: c.municipio_destino, cte_chaves: [], nfe_chaves: [] });
      grupos.get(ibge)!.cte_chaves.push(c.chave_acesso as string);
    }
  }

  // NF-e avulsas sem CT-e próprio no mesmo MDF-e: agrupa no primeiro município já resolvido
  // (caso comum — carga com um único destino) em vez de deixar de fora do MDF-e.
  const primeiroGrupo = Array.from(grupos.values())[0];
  for (const chave of nfeChaves) {
    if (primeiroGrupo) primeiroGrupo.nfe_chaves.push(chave);
  }

  return { municipios: Array.from(grupos.values()), ctesCanceladas };
}

export async function emitirMDFe(
  fazendaId: string,
  mdfeId: string,
): Promise<ResultadoEmissaoMDFe> {
  const { data: m } = await sb().from("mdfes").select("*").eq("id", mdfeId).maybeSingle();
  if (!m) return { sucesso: false, cStat: "500", xMotivo: "MDF-e não encontrado." };

  // 1. Empresa emitente — resolvida do CT-e vinculado quando existir (é ele quem sabe de
  //    verdade qual transportadora está fazendo o frete). SEM isso, achado real 23/09/2026: uma
  //    conta com mais de uma empresa (ex: 2 transportadoras do mesmo grupo) sempre lia
  //    "a primeira empresa cadastrada" (sem ORDER BY nenhum — na prática arbitrário), então a
  //    config de Parâmetros → MDF-e configurada numa empresa (ex: Muriana marcada como Carga
  //    Própria) nunca era lida — a emissão silenciosamente usava outra empresa da conta,
  //    cuja config de Seguro da Carga continuava incompleta. Só cai no fallback "primeira
  //    empresa da conta" quando o MDF-e não tem CT-e nenhum vinculado (NF-e avulsas puras).
  const { data: faz } = await sb().from("fazendas").select("conta_id").eq("id", fazendaId).maybeSingle();
  let empresaCnpj: string | undefined;
  const docs = (typeof m.documentos === "string" ? JSON.parse(m.documentos) : m.documentos) as { tipo: string; chave: string }[] | null;
  const primeiraCteChave = (docs ?? []).find(d => d.tipo === "cte")?.chave?.replace(/\D/g, "");
  if (primeiraCteChave) {
    const { data: cteRow } = await sb().from("ctes").select("emitente_cnpj").eq("chave_acesso", primeiraCteChave).maybeSingle();
    empresaCnpj = (cteRow?.emitente_cnpj as string | undefined) ?? undefined;
  }
  if (!empresaCnpj && faz?.conta_id) {
    const { data: fzs } = await sb().from("fazendas").select("id").eq("conta_id", faz.conta_id);
    const idsConta = (fzs ?? []).map(f => f.id as string);
    const { data: emp } = await sb().from("empresas").select("cpf_cnpj").in("fazenda_id", idsConta).limit(1).maybeSingle();
    empresaCnpj = emp?.cpf_cnpj ?? undefined;
  }

  // 2. Config MDF-e + Fiscal + Certificado
  const resolved = await resolverConfigMDFe(fazendaId, empresaCnpj);
  if (!resolved || !resolved.mdfeConfigEncontrada) {
    return { sucesso: false, cStat: "500", xMotivo: "Configuração MDF-e não encontrada — configure em Parâmetros → MDF-e." };
  }
  const confg = resolved.mdfeConfig;
  const fc = resolved.fiscalConfig;
  const certPath  = confg.cert_a1_path  ?? fc.cert_a1_path;
  const certSenha = confg.cert_a1_senha ?? fc.cert_a1_senha;
  if (!certPath || !certSenha) {
    return { sucesso: false, cStat: "501", xMotivo: "Certificado A1 não configurado para este emitente (Parâmetros → MDF-e / Fiscal)." };
  }

  let pfxBuffer: Buffer;
  try { pfxBuffer = await carregarPfx(certPath); }
  catch (e) { return { sucesso: false, cStat: "502", xMotivo: String(e) }; }
  const pem = pfxParaPem(pfxBuffer, certSenha);

  // 3. Veículo (placa + tara) e motorista(es)
  if (!m.veiculo_id) return { sucesso: false, cStat: "VALIDACAO_LOCAL", xMotivo: "Selecione o Veículo antes de autorizar — a tara é obrigatória no MDF-e." };
  const { data: veic } = await sb().from("veiculos").select("placa, tara_kg, uf").eq("id", m.veiculo_id).maybeSingle();
  if (!veic) return { sucesso: false, cStat: "VALIDACAO_LOCAL", xMotivo: "Veículo selecionado não encontrado no cadastro." };
  if (!veic.tara_kg) return { sucesso: false, cStat: "VALIDACAO_LOCAL", xMotivo: `Veículo ${veic.placa} sem Tara (kg) cadastrada — obrigatório pra montar o MDF-e. Preencha em Cadastros → Veículos.` };

  const condutores: { nome: string; cpf: string }[] = [];
  if (m.motorista_id) {
    const { data: mot } = await sb().from("motoristas").select("nome, cpf").eq("id", m.motorista_id).maybeSingle();
    if (mot?.cpf) condutores.push({ nome: mot.nome, cpf: mot.cpf });
  }
  if (condutores.length === 0 && m.motorista_nome && m.motorista_cpf) {
    condutores.push({ nome: m.motorista_nome, cpf: m.motorista_cpf });
  }
  if (condutores.length === 0) return { sucesso: false, cStat: "VALIDACAO_LOCAL", xMotivo: "Selecione o Motorista antes de autorizar." };

  // 4. Município de início — precisa do código IBGE (Seção 281: ibge_inicio)
  if (!m.ibge_inicio) {
    return {
      sucesso: false, cStat: "VALIDACAO_LOCAL",
      xMotivo: `Falta o Código IBGE do Município de Início (${m.municipio_inicio}/${m.uf_inicio}) — reabra o MDF-e, edite o Município de Início pra disparar a busca automática, e tente autorizar de novo.`,
    };
  }

  // 5. Municípios de descarga — resolvidos a partir dos CT-e/NF-e vinculados
  const documentos = (typeof m.documentos === "string" ? JSON.parse(m.documentos) : m.documentos) as { tipo: string; chave: string }[];
  const { municipios: municipiosDescarga, ctesCanceladas } = await resolverMunicipiosDescarga(documentos ?? []);
  if (ctesCanceladas.length > 0) {
    return {
      sucesso: false, cStat: "VALIDACAO_LOCAL",
      xMotivo: `O(s) CT-e a seguir está(ão) CANCELADO(S) e não pode(m) sustentar este MDF-e: ${ctesCanceladas.join(", ")}. Desmarque-o(s) em "CT-e Vinculados" e marque o CT-e válido (autorizado) que substituiu ele antes de tentar de novo.`,
    };
  }
  if (municipiosDescarga.length === 0) {
    return {
      sucesso: false, cStat: "VALIDACAO_LOCAL",
      xMotivo: "Nenhum município de descarga pôde ser determinado — o(s) CT-e(s) vinculado(s) precisa(m) ter o Código IBGE de Destino preenchido (abra o CT-e e confira o campo \"Cód. IBGE Destino\").",
    };
  }

  const emitente: EmitenteMDFe = {
    cpf_cnpj:       fc.cpf_cnpj_emitente ?? confg.cpf_cnpj_emitente ?? empresaCnpj ?? resolved.emitenteDigits,
    razao_social:   fc.razao_social   ?? confg.razao_social   ?? "",
    ie:             fc.ie_emitente    ?? confg.ie_emitente    ?? "",
    logradouro:     fc.logradouro     ?? confg.logradouro     ?? "",
    numero:         fc.numero         ?? confg.numero         ?? "S/N",
    bairro:         fc.bairro         ?? confg.bairro         ?? "",
    municipio_ibge: fc.municipio_ibge ?? confg.municipio_ibge ?? "5106224",
    municipio_nome: fc.municipio_nome ?? fc.municipio ?? confg.municipio_nome ?? confg.municipio ?? "Nova Mutum",
    uf:             fc.uf_emitente    ?? confg.uf_emitente    ?? "MT",
    cep:            fc.cep            ?? confg.cep            ?? "00000000",
    fone:           fc.fone           ?? confg.fone,
    rntrc:          confg.rntrc       ?? "",
    // tpEmit: 1=Prestador de Serviço de Transporte (cobra frete de terceiros) · 2=Transportador
    // de Carga Própria (não cobra frete — comum em transportadora do mesmo grupo do produtor).
    // Só o "1" exige Seguro da Carga (RCTR-C) — Lei 11.442/07 é sobre quem presta serviço
    // remunerado de transporte, não sobre quem é dono da empresa. Configurável em Parâmetros →
    // MDF-e ("Este transporte é"), campo `carga_propria`. Default "false" (prestador de
    // serviço) preserva o comportamento anterior pra quem não configurou nada. Achado real
    // 23/09/2026 — cliente com transportadora própria (mesmo grupo) sem apólice RCTR-C, que não
    // deveria ser exigida nesse caso.
    //
    // NUNCA ler confg.tpEmit pra isso: esse campo na tela guarda o Tipo de Transportador
    // (TAC/ETC/CTC — tpTransp no schema, conceito diferente).
    tpEmit:         confg.carga_propria === "true" ? "2" : "1",
    tpTransp:       (confg.tpEmit as "1" | "2" | "3" | undefined) ?? undefined,
    ambiente:       (confg.ambiente as "producao" | "homologacao") ?? "homologacao",
    serie:          confg.serie_mdfe ?? "1",
    numero_mdfe:    0, // preenchido abaixo
    seguradora_nome:  confg.seguradora_nome,
    seguradora_cnpj:  confg.seguradora_cnpj,
    apolice_numero:   confg.apolice_numero,
    averbacao_numero: confg.averbacao_numero,
  };

  // SEFAZ rejeita o MDF-e rodoviário sem os dados de Seguro da Carga completos — mas só quando
  // o emitente presta serviço remunerado (tpEmit=1). Carga própria (tpEmit=2) não tem essa
  // exigência. Bloqueia aqui com um aviso claro em vez de gastar uma tentativa real na SEFAZ.
  if (emitente.tpEmit === "1" && (!emitente.seguradora_nome || !emitente.seguradora_cnpj || !emitente.apolice_numero || !emitente.averbacao_numero)) {
    return {
      sucesso: false, cStat: "VALIDACAO_LOCAL",
      xMotivo: "Dados do Seguro da Carga (RCTR-C) incompletos — preencha Nome/CNPJ da Seguradora, Nº da Apólice e Nº da Averbação em Parâmetros → MDF-e, na empresa emitente. Se este transporte não cobra frete de terceiros, marque \"Este transporte é: Carga própria\" em Parâmetros → MDF-e pra dispensar o seguro.",
    };
  }

  const numero = await proximoNumero(fazendaId, resolved.mdfeModulo, confg);
  emitente.numero_mdfe = numero;

  const input: MDFeInput = {
    emitente,
    uf_ini: m.uf_inicio,
    municipio_ini_ibge: m.ibge_inicio,
    municipio_ini_nome: m.municipio_inicio,
    uf_fim: m.uf_fim,
    percurso_ufs: m.percurso_ufs ?? [],
    municipios_descarga: municipiosDescarga,
    veiculo: { placa: veic.placa, tara_kg: veic.tara_kg, uf: veic.uf ?? emitente.uf },
    condutores,
    ciot: m.ciot ? { codigo: m.ciot, cpf_cnpj: condutores[0].cpf } : null,
    peso_bruto_kg: m.peso_total_kg || 0,
    valor_carga: m.valor_total_carga || 0,
    observacao: m.observacao ?? undefined,
  };

  const built = buildMDFe(input);

  let xmlAssinado: string;
  try { xmlAssinado = assinarMDFe(built.xml, pem); }
  catch (e) { return { sucesso: false, cStat: "503", xMotivo: `Erro na assinatura: ${e}` }; }

  const tpAmb = emitente.ambiente === "producao" ? "1" : "2";
  xmlAssinado = inserirInfMDFeSupl(xmlAssinado, buildQrCodeMDFe(built.chave, tpAmb));

  let resposta;
  try { resposta = await transmitirMDFe(xmlAssinado, pem, emitente.ambiente); }
  catch (e) { return { sucesso: false, cStat: "504", xMotivo: `Falha na comunicação SEFAZ: ${e}` }; }

  let xmlUrl: string | undefined;
  if (resposta.sucesso && resposta.xmlProt) {
    try { xmlUrl = await salvarXml(fazendaId, built.chave, resposta.xmlProt); } catch { /* best-effort */ }
  }

  const { error: updErr } = await sb().from("mdfes").update({
    status:       resposta.sucesso ? "autorizado" : "rascunho",
    chave_acesso: built.chave,
    numero_mdfe:  String(built.numero),
    xml_url:      xmlUrl ?? null,
    protocolo_autorizacao: resposta.protocolo ?? null,
  }).eq("id", mdfeId);
  if (updErr) console.error("[emitirMDFe] falha ao gravar status autorizado:", updErr);

  return {
    sucesso: resposta.sucesso,
    chave: built.chave,
    numero: built.numero,
    protocolo: resposta.protocolo,
    dhRecbto: resposta.dhRecbto,
    xmlUrl,
    cStat: resposta.cStat ?? "ERR",
    xMotivo: resposta.xMotivo,
  };
}
