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

import { ciotExigido } from "./ciot-regra";
import { createClient } from "@supabase/supabase-js";
import { buildMDFe } from "./builder";
import { assinarMDFe } from "./signer";
import { transmitirMDFe } from "./transmitter";
import { pfxParaPem } from "../nfe/signer";
import { resolverConfigMDFe } from "./config";
import { validarProdutoMDFe } from "./produto";
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

// Número do MDF-e SEM queimar numeração em rejeição (achado 24/09/2026: o 3287 virou 3288 numa
// tentativa rejeitada). Só LÊ o contador; ele avança (avancarNumero) apenas quando a SEFAZ
// autoriza. Um rascunho que já tentou transmitir reaproveita o próprio número — a SEFAZ não
// consome número de documento rejeitado —, salvo se esse número já ficou para trás do contador
// (foi usado por outro MDF-e autorizado).
function numeroParaTentativa(confg: Record<string, string>, m: { numero_mdfe?: unknown; chave_acesso?: unknown }): number {
  const contador = parseInt(String(confg.numero_inicial ?? "1")) || 1;
  const anterior = parseInt(String(m.numero_mdfe ?? ""));
  const jaTentou = !!m.chave_acesso && Number.isFinite(anterior) && anterior > 0;
  return jaTentou && anterior >= contador ? anterior : contador;
}

async function avancarNumero(fazendaId: string, modulo: string, confg: Record<string, string>, usado: number): Promise<void> {
  const contador = parseInt(String(confg.numero_inicial ?? "1")) || 1;
  if (usado < contador) return;
  await sb().from("configuracoes_modulo")
    .update({ config: { ...confg, numero_inicial: String(usado + 1) } })
    .eq("fazenda_id", fazendaId).eq("modulo", modulo);
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
  respostaSefaz?: boolean;
}

/** Resolve município + IBGE de destino a partir dos CT-e/NF-e vinculados ao MDF-e. */
async function resolverMunicipiosDescarga(
  documentos: { tipo: string; chave: string }[],
): Promise<{ municipios: MunicipioDescarga[]; ctesCanceladas: string[]; contratanteCnpjCpf?: string }> {
  const ctesChaves = documentos.filter(d => d.tipo === "cte").map(d => d.chave.replace(/\D/g, ""));
  const nfeChaves  = documentos.filter(d => d.tipo === "nfe").map(d => d.chave.replace(/\D/g, ""));

  const grupos = new Map<string, MunicipioDescarga>();
  const ctesCanceladas: string[] = [];
  let contratanteCnpjCpf: string | undefined;

  if (ctesChaves.length > 0) {
    const { data: ctes } = await sb().from("ctes")
      .select("chave_acesso, municipio_destino, ibge_destino, status, tomador_tipo, remetente_cnpj, destinatario_cnpj, expedidor_cnpj, recebedor_cnpj")
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
      // Contratante do MDF-e (<infContratante>) — a SEFAZ exige o documento de quem contratou o
      // transporte (rejeição 578: "Informações dos tomadores é obrigatória para esta operação")
      // pra emitente Prestador de Serviço. Usa o Tomador do Serviço já indicado no CT-e vinculado
      // (o mesmo campo que já decide se o Remetente ou o Destinatário é quem contratou o frete).
      // Achado real 23/09/2026.
      if (!contratanteCnpjCpf) {
        const tomadorTipo = (c as { tomador_tipo?: string }).tomador_tipo;
        const doc = tomadorTipo === "destinatario" ? c.destinatario_cnpj
          : tomadorTipo === "expedidor" ? (c as { expedidor_cnpj?: string }).expedidor_cnpj
          : tomadorTipo === "recebedor" ? (c as { recebedor_cnpj?: string }).recebedor_cnpj
          : c.remetente_cnpj;
        if (doc) contratanteCnpjCpf = doc as string;
      }
    }
  }

  // NF-e avulsas sem CT-e próprio no mesmo MDF-e: agrupa no primeiro município já resolvido
  // (caso comum — carga com um único destino) em vez de deixar de fora do MDF-e.
  const primeiroGrupo = Array.from(grupos.values())[0];
  for (const chave of nfeChaves) {
    if (primeiroGrupo) primeiroGrupo.nfe_chaves.push(chave);
  }

  return { municipios: Array.from(grupos.values()), ctesCanceladas, contratanteCnpjCpf };
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
  const { data: veic } = await sb().from("veiculos").select("placa, tara_kg, uf, proprietario_tipo").eq("id", m.veiculo_id).maybeSingle();
  if (!veic) return { sucesso: false, cStat: "VALIDACAO_LOCAL", xMotivo: "Veículo selecionado não encontrado no cadastro." };
  if (!veic.tara_kg) return { sucesso: false, cStat: "VALIDACAO_LOCAL", xMotivo: `Veículo ${veic.placa} sem Tara (kg) cadastrada — obrigatório pra montar o MDF-e. Preencha em Cadastros → Veículos.` };

  const condutores: { nome: string; cpf: string }[] = [];
  let motoristaTipo: string | null = null;
  if (m.motorista_id) {
    const { data: mot } = await sb().from("motoristas").select("nome, cpf, tipo").eq("id", m.motorista_id).maybeSingle();
    if (mot?.cpf) condutores.push({ nome: mot.nome, cpf: mot.cpf });
    motoristaTipo = (mot?.tipo as string | null) ?? null;
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
  const { municipios: municipiosDescarga, ctesCanceladas, contratanteCnpjCpf } = await resolverMunicipiosDescarga(documentos ?? []);
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
    // A tela guarda "1 – Autônomo (TAC) · 2 – ETC · 3 – CTC"; o schema usa tpTransp
    // 1=ETC · 2=TAC · 3=CTC — as posições 1 e 2 são invertidas, então traduz aqui. Antes o valor
    // ia direto: uma ETC marcada como "2 – ETC" saía como TAC no XML (achado 24/09/2026).
    tpTransp:       ({ "1": "2", "2": "1", "3": "3" } as Record<string, "1" | "2" | "3">)[String(confg.tpEmit ?? "")] ?? undefined,
    ambiente:       (confg.ambiente as "producao" | "homologacao") ?? "homologacao",
    serie:          confg.serie_mdfe ?? "1",
    numero_mdfe:    0, // preenchido abaixo
    // Dados preenchidos no próprio MDF-e (aba Seguro e Averbação) prevalecem sobre o cadastro
    // do emitente em Parâmetros → MDF-e — a averbação, em especial, é informada por viagem.
    seguradora_nome:  (m.seguradora_nome  as string | null) || confg.seguradora_nome,
    seguradora_cnpj:  (m.seguradora_cnpj  as string | null) || confg.seguradora_cnpj,
    apolice_numero:   (m.apolice_numero   as string | null) || confg.apolice_numero,
    averbacao_numero: (m.averbacao_numero as string | null) || undefined, // por viagem: só a aba do MDF-e (não usa o cadastro)
  };

  // CIOT: exigido em transporte remunerado com TAC / veículo de terceiro (regra em ciot-regra.ts).
  if (!m.ciot && ciotExigido({ tpEmit: emitente.tpEmit, motoristaTipo, veiculoProprietarioTipo: veic.proprietario_tipo as string | null })) {
    return { sucesso: false, cStat: "VALIDACAO_LOCAL", xMotivo: "CIOT obrigatório: o transporte usa motorista TAC ou veículo de terceiro. Gere o CIOT na aba do MDF-e antes de autorizar. (Motorista CLT em veículo próprio da transportadora não exige CIOT.)" };
  }

  // Carga Própria (tpEmit=2) e CT-e vinculado são mutuamente excludentes por definição — um
  // CT-e É um contrato de transporte remunerado, o que já deixa de ser "carga própria". SEFAZ
  // rejeita com "Não deve ser informado Conhecimento de Transporte para tipo de emitente
  // Transporte de Carga Própria" (achado real 23/09/2026). Bloqueia aqui, localmente, com a
  // explicação de fundo — sem isso o usuário fica preso num loop (marca carga própria pra
  // fugir do seguro, mas o MDF-e tem CT-e vinculado, que exige exatamente o oposto).
  if (emitente.tpEmit === "2" && documentos.some(d => d.tipo === "cte")) {
    return {
      sucesso: false, cStat: "VALIDACAO_LOCAL",
      xMotivo: "Este MDF-e tem CT-e vinculado, mas o emitente está configurado como \"Carga Própria\" em Parâmetros → MDF-e — as duas coisas são incompatíveis (um CT-e já é, por definição, um contrato de transporte remunerado). Se este transporte cobra frete de verdade, volte a marcar \"Prestação de serviço\" e preencha o Seguro da Carga (RCTR-C). Se é realmente carga própria, o transporte não deveria ter CT-e nenhum vinculado.",
    };
  }

  // SEFAZ rejeita o MDF-e rodoviário sem os dados de Seguro da Carga completos — mas só quando
  // o emitente presta serviço remunerado (tpEmit=1). Carga própria (tpEmit=2) não tem essa
  // exigência. Bloqueia aqui com um aviso claro em vez de gastar uma tentativa real na SEFAZ.
  if (emitente.tpEmit === "1" && (!emitente.seguradora_nome || !emitente.seguradora_cnpj || !emitente.apolice_numero || !emitente.averbacao_numero)) {
    return {
      sucesso: false, cStat: "VALIDACAO_LOCAL",
      xMotivo: "Dados do Seguro da Carga (RCTR-C) incompletos — preencha Nome/CNPJ da Seguradora, Nº da Apólice e Nº da Averbação (a SEFAZ rejeita com 699 sem a averbação quando o emitente é prestador de serviço). Preencha na aba Seguro e Averbação do MDF-e; a apólice pode vir de Parâmetros → MDF-e. Se este transporte não cobra frete de terceiros, marque \"Este transporte é: Carga própria\" em Parâmetros → MDF-e pra dispensar o seguro.",
    };
  }

  // Contratante do transporte (<infContratante>) — obrigatório pra emitente Prestador de
  // Serviço (tpEmit=1) ou CT-e Globalizado (tpEmit=3): SEFAZ rejeita com "Informações dos
  // tomadores é obrigatória para esta operação" (rejeição 578) sem isso. Resolvido a partir do
  // Tomador do Serviço já indicado no CT-e vinculado — bloqueia localmente se não tiver CT-e
  // nenhum vinculado nesse caso (não tem de onde tirar o contratante). Carga própria (tpEmit=2)
  // não precisa disso. Achado real 23/09/2026.
  if ((emitente.tpEmit === "1" || emitente.tpEmit === "3") && !contratanteCnpjCpf) {
    return {
      sucesso: false, cStat: "VALIDACAO_LOCAL",
      xMotivo: "Não foi possível determinar o Contratante do transporte — vincule pelo menos um CT-e autorizado a este MDF-e (é dali que vem o Tomador do Serviço).",
    };
  }

  const quantidadeDocumentos = municipiosDescarga.reduce((total, mun) => total + mun.cte_chaves.length + mun.nfe_chaves.length, 0);
  const erroProduto = validarProdutoMDFe(m.produto_predominante, emitente.tpEmit !== "2" || !!emitente.tpTransp, quantidadeDocumentos);
  if (erroProduto) return { sucesso: false, cStat: "VALIDACAO_LOCAL", xMotivo: erroProduto };

  // Carga total (qCarga) obrigatória e maior que zero — bloqueia aqui em vez de gastar tentativa.
  if (!(Number(m.peso_total_kg) > 0)) {
    return { sucesso: false, cStat: "VALIDACAO_LOCAL", xMotivo: "Informe o Peso Total (kg) da carga em Dados da Carga — o MDF-e não pode ser transmitido com peso zero ou vazio." };
  }

  const numero = numeroParaTentativa(confg, m);
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
    // infCIOT: CPF/CNPJ do responsável pela geração do CIOT = contratante que declarou (a transportadora), não o motorista.
    ciot: m.ciot ? { codigo: m.ciot, cpf_cnpj: emitente.cpf_cnpj || condutores[0].cpf } : null,
    peso_bruto_kg: m.peso_total_kg || 0,
    valor_carga: m.valor_total_carga || 0,
    produto_predominante: m.produto_predominante,
    observacao: m.observacao ?? undefined,
    contratante_cnpj_cpf: emitente.tpEmit !== "2" ? contratanteCnpjCpf : undefined,
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

  if (resposta.sucesso) await avancarNumero(fazendaId, resolved.mdfeModulo, confg, Number(built.numero));

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
    respostaSefaz: resposta.cStat !== null,
  };
}
