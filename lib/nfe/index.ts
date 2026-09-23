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
import { cancelarNFe }     from "./evento";
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
  moduloKey: string,  // ex: "fiscal_pf_abc" ou "fiscal_emp_xyz"
  ieOverride?: string, // IE específica que VAI ser usada na emissão (emitIeOverride do chamador) —
                        // sem isso, o endereço mesclado abaixo podia vir de uma IE DIFERENTE da
                        // impressa na nota (achado real 23/09/2026: NF saiu com a IE certa mas
                        // endereço de outro estabelecimento do mesmo produtor).
): Promise<Record<string, string> | null> {
  // certificado_a1_* precisa ser buscado na conta inteira, não só na fazenda
  // recebida — o upload (Fiscal → Certificado Digital ou o card de emitente
  // em Parâmetros → Fiscal) pode ter acontecido com outra fazenda ativa, e o
  // mesmo titular (CPF/CNPJ) frequentemente emite por mais de uma fazenda do
  // cliente. Achado real 23/09/2026: certificado reenviado 2x pelo usuário e
  // a emissão continuava com "Certificado A1 não enviado para o emitente" —
  // o certificado existia (duplicado, inclusive), só nunca na fazenda exata
  // que estava emitindo. Mesma classe de bug já corrigida em Transportadoras,
  // Parâmetros Fiscais por IE e Ano Safra/Ciclo do DRE.
  const { data: fazRow } = await sb().from("fazendas").select("conta_id").eq("id", fazendaId).maybeSingle();
  let fazendaIdsConta = [fazendaId];
  if (fazRow?.conta_id) {
    const { data: fzsConta } = await sb().from("fazendas").select("id").eq("conta_id", fazRow.conta_id);
    if (fzsConta && fzsConta.length > 0) fazendaIdsConta = fzsConta.map((f: { id: string }) => f.id);
  }

  // Carrega em paralelo: config do emitente + ambiente global + todos os certs cadastrados
  // Config base do emitente: primeiro tenta na fazenda exata (pode ter dados específicos dela,
  // ex: endereço); moduloKey em si é o titular (CPF/CNPJ), não a fazenda.
  const [emitLocalResult, { data: globalData }, { data: certRows }] = await Promise.all([
    sb().from("configuracoes_modulo").select("config").eq("fazenda_id", fazendaId).eq("modulo", moduloKey).maybeSingle(),
    sb().from("configuracoes_modulo").select("config").eq("fazenda_id", fazendaId).eq("modulo", "fiscal_global").single(),
    sb().from("configuracoes_modulo").select("modulo, config").in("fazenda_id", fazendaIdsConta).like("modulo", "certificado_a1_%"),
  ]);

  let emitData: { config: unknown } | null = emitLocalResult.data;

  // Não achou (ou achou incompleto) na fazenda exata — o titular fiscal (CPF/CNPJ, certificado)
  // é da CONTA, não da fazenda; busca em qualquer fazenda do mesmo cliente antes de desistir.
  // Achado real 23/09/2026: fazenda sem cadastro fiscal próprio (só o card por-IE, que não carrega
  // CPF nem certificado) nunca achava a config base, mesmo ela existindo certinha noutra fazenda
  // do mesmo cliente — cliente reenviou o certificado 2x sem resolver.
  if (!emitData?.config || !(emitData.config as Record<string,string>).cpf_cnpj_emitente) {
    const { data: cfgConta } = await sb()
      .from("configuracoes_modulo").select("config")
      .in("fazenda_id", fazendaIdsConta).eq("modulo", moduloKey)
      .not("modulo", "like", "%__ie_%")
      .limit(1);
    if (cfgConta && cfgConta.length > 0) emitData = { config: cfgConta[0].config };
  }

  // Fallback final: se o modulo_key exato não existe em lugar nenhum, busca qualquer módulo
  // fiscal válido (com CPF) da mesma conta — nunca uma chave por-IE (__ie_), que é um detalhe
  // interno mesclado mais abaixo, não uma config completa por si só.
  if (!emitData?.config || !(emitData.config as Record<string,string>).cpf_cnpj_emitente) {
    const { data: allMods } = await sb()
      .from("configuracoes_modulo").select("modulo, config, fazenda_id")
      .in("fazenda_id", fazendaIdsConta)
      .or("modulo.like.fiscal_pf_%,modulo.like.fiscal_emp_%")
      .not("modulo", "like", "%__ie_%");
    // Prefere módulo da própria fazenda com cert_a1_path; senão qualquer um da conta com CPF.
    const comCert = (allMods ?? []).find(r => {
      const c = r.config as Record<string,string>;
      return c?.cpf_cnpj_emitente && c?.cert_a1_path;
    });
    const semCert = (allMods ?? []).find(r => (r.config as Record<string,string>)?.cpf_cnpj_emitente);
    const melhor = comCert ?? semCert;
    if (melhor) emitData = { config: melhor.config };
  }

  if (!emitData?.config) return null;

  const cfg = { ...emitData.config } as Record<string, string>;

  // Resolve cert_a1_path: corrige URL inválida ou tenta achar em certificado_a1_*
  const certPath = cfg.cert_a1_path ?? "";
  const certPathInvalid = !certPath || certPath.startsWith("http") || !/\.(pfx|p12|cer|crt)$/i.test(certPath);
  if (certPathInvalid && certRows?.length) {
    // Busca certificado pelo CPF/CNPJ do emitente nos módulos certificado_a1_*
    const cpfDigits = (cfg.cpf_cnpj_emitente ?? "").replace(/\D/g, "");
    const found = certRows.find(r => {
      const c = r.config as Record<string, string>;
      return (c.cpf_cnpj ?? "").replace(/\D/g, "") === cpfDigits && c.storage_path;
    }) ?? certRows[0]; // último recurso: primeiro cert encontrado
    if (found) {
      const c = found.config as Record<string, string>;
      cfg.cert_a1_path = c.storage_path;
    }
  }

  // Resolve IE: configs antigas (de antes do modelo "Parâmetros Fiscais por IE")
  // nunca tiveram ie_emitente preenchido na config base — o cadastro de
  // Inscrições Estaduais do produtor é que tem a IE de verdade. Sem isso,
  // emitirNFe falhava com "IE do emitente não configurada" mesmo com o
  // produtor tendo IE(s) cadastrada(s) e a tela de Parâmetros Fiscais
  // mostrando os cards de IE certinhos — a config nunca chegava a consultá-los.
  // Também traz a config granular por-IE (série/número/CRT/IBS-CBS), se
  // existir, sobrepondo os valores da config base.
  if (moduloKey.startsWith("fiscal_pf_") && cfg.cpf_cnpj_emitente) {
    const digits = cfg.cpf_cnpj_emitente.replace(/\D/g, "");
    const digitsFmt = digits.length === 11
      ? digits.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, "$1.$2.$3-$4")
      : digits;
    // TODOS os cadastros de produtor com esse CPF — não só o primeiro. O mesmo CPF pode ter mais
    // de um registro em "produtores" (ex.: "FULANO" e "FULANO E OUTROS — CONDOMÍNIO X", mesma
    // pessoa em arranjos de propriedade diferentes), cada um com suas próprias IEs — pegar só o
    // primeiro cadastro escondia as IEs (e a série/número configurados) do(s) outro(s).
    const { data: prodRows } = await sb()
      .from("produtores")
      .select("id")
      .or(`cpf_cnpj.eq.${digits},cpf_cnpj.eq.${digitsFmt}`);
    const produtorIds = (prodRows ?? []).map(p => p.id as string);
    if (produtorIds.length > 0) {
      const { data: ies } = await sb()
        .from("produtor_inscricoes_estaduais")
        .select("id, inscricao_estadual, fazenda_id, ativa, cep, logradouro, numero, complemento, bairro, municipio, municipio_ibge")
        .in("produtor_id", produtorIds)
        .eq("ativa", true);
      const iesAtivas = ies ?? [];
      // Busca a config de cada IE de uma vez, pra escolher a IE certa — não só "a primeira vinculada
      // à fazenda" (que pode não ter nada configurado), e sim a que tem série/número de verdade.
      const configsPorIe = new Map<string, Record<string, string>>();
      if (iesAtivas.length > 0) {
        // Sem filtro de fazenda_id: o nome do módulo já é único por IE (carrega o id dela), e cada
        // IE grava na SUA PRÓPRIA fazenda (ver Parâmetros → Fiscal) — que pode ser diferente de
        // `fazendaId` aqui. Filtrar por fazenda_id só excluía configs válidas de IEs de outras
        // fazendas do mesmo produtor/cliente.
        const { data: cfgsIe } = await sb()
          .from("configuracoes_modulo")
          .select("modulo, config")
          .in("modulo", iesAtivas.map(i => `${moduloKey}__ie_${i.id}`));
        for (const row of cfgsIe ?? []) {
          const ieId = (row.modulo as string).split("__ie_")[1];
          if (ieId) configsPorIe.set(ieId, row.config as Record<string, string>);
        }
      }
      const temSerie = (ie: typeof iesAtivas[number]) => !!configsPorIe.get(ie.id)?.serie_nfe;
      // A IE que VAI ser impressa na nota (ieOverride, ou já fixada em cfg.ie_emitente por uma
      // config anterior) tem prioridade absoluta sobre a heurística de "qualquer IE configurada" —
      // senão o endereço mesclado abaixo podia vir de uma IE diferente da que sai impressa.
      const ieAlvo = ieOverride || cfg.ie_emitente || "";
      const ieEscolhida =
        (ieAlvo && iesAtivas.find(i => i.inscricao_estadual === ieAlvo)) ??
        iesAtivas.find(i => i.fazenda_id === fazendaId && temSerie(i)) ??  // fazenda certa + configurada
        iesAtivas.find(temSerie) ??                                       // qualquer uma configurada
        iesAtivas.find(i => i.fazenda_id === fazendaId) ??                // fazenda certa, sem config ainda
        iesAtivas[0];
      if (ieEscolhida) {
        if (!cfg.ie_emitente) cfg.ie_emitente = ieEscolhida.inscricao_estadual;
        // Endereço da IE é o do imóvel/estabelecimento ESPECÍFICO dessa
        // inscrição — mais confiável que o endereço da config base, que pode
        // estar vazio ou ser de outra propriedade do mesmo produtor. Só
        // sobrescreve quando a IE realmente tem o campo preenchido.
        if (ieEscolhida.municipio_ibge) cfg.municipio_ibge = ieEscolhida.municipio_ibge;
        if (ieEscolhida.municipio)      cfg.municipio_nome = ieEscolhida.municipio;
        if (ieEscolhida.cep)            cfg.cep = ieEscolhida.cep;
        if (ieEscolhida.logradouro)     cfg.logradouro = ieEscolhida.logradouro;
        if (ieEscolhida.numero)         cfg.numero = ieEscolhida.numero;
        if (ieEscolhida.complemento)    cfg.complemento = ieEscolhida.complemento;
        if (ieEscolhida.bairro)         cfg.bairro = ieEscolhida.bairro;
        const cfgIeConfig = configsPorIe.get(ieEscolhida.id);
        if (cfgIeConfig) {
          Object.assign(cfg, cfgIeConfig);
          // Guarda de onde veio a config por-IE: o contador de número da NF-e mora nela e precisa ser
          // incrementado nela também (só incrementar a config base deixava o número repetindo → SEFAZ 539)
          cfg.__ie_modulo = `${moduloKey}__ie_${ieEscolhida.id}`;
        }
      }
    }
  }

  // Senha do certificado ausente nesta cópia da config: procura a MESMA config (mesmo módulo) em outra
  // fazenda do cliente — a config fiscal é do cliente e pode existir em mais de uma fazenda.
  if (!cfg.cert_a1_senha) {
    const { data: faz } = await sb().from("fazendas").select("conta_id").eq("id", fazendaId).maybeSingle();
    if (faz?.conta_id) {
      const { data: fzs } = await sb().from("fazendas").select("id").eq("conta_id", faz.conta_id);
      const { data: copias } = await sb().from("configuracoes_modulo").select("config")
        .in("fazenda_id", (fzs ?? []).map(f => f.id as string)).eq("modulo", moduloKey);
      const comSenha = (copias ?? []).map(c => c.config as Record<string, string>).find(c => c?.cert_a1_senha);
      if (comSenha) {
        cfg.cert_a1_senha = comSenha.cert_a1_senha;
        if (!cfg.cert_a1_path && comSenha.cert_a1_path) cfg.cert_a1_path = comSenha.cert_a1_path;
      }
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

export async function carregarPfx(
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
  const proximo = String(atual + 1);
  // Incrementa no banco antes de emitir. Grava SÓ o contador, em cada linha que o guarda (base e, se
  // existir, a config por-IE que sobrepõe a base na leitura) — sem regravar a config mesclada inteira.
  const modulos = [moduloKey, ...(confg.__ie_modulo ? [confg.__ie_modulo] : [])];
  for (const m of modulos) {
    const { data: linha } = await sb().from("configuracoes_modulo").select("config")
      .eq("fazenda_id", fazendaId).eq("modulo", m).maybeSingle();
    if (!linha) continue;
    await sb().from("configuracoes_modulo")
      .update({ config: { ...(linha.config as Record<string, string>), numero_inicial: proximo } })
      .eq("fazenda_id", fazendaId).eq("modulo", m);
  }
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
  emitIeOverride?: string,            // IE específica do produtor (multi-IE)
  tentativa = 0                       // interno: repetições após SEFAZ 539
): Promise<ResultadoEmissao> {

  // 1. Configuração do emitente
  const confg = await buscarConfEmitente(fazendaId, moduloKey, emitIeOverride);
  if (!confg) return { sucesso: false, cStat: "500", xMotivo: `Configuração fiscal não encontrada para ${moduloKey}` };

  // Fallback 1: destinatário é um PRODUTOR (não uma Pessoa/fornecedor) — típico
  // de transferência entre fazendas/produtores da mesma conta, que nunca chega
  // a ter cadastro em "Pessoas" (essa tabela é pra fornecedores/clientes
  // terceiros). Resolve endereço pela Inscrição Estadual informada em
  // destinatario.ie (mais preciso — é a IE específica usada nessa operação)
  // ou, na falta dela, por qualquer IE ativa do produtor com esse CPF/CNPJ.
  if (!input.destinatario.municipio_ibge && input.destinatario.cpf_cnpj) {
    const digitsProd = input.destinatario.cpf_cnpj.replace(/\D/g, "");
    const digitsProdFmt = digitsProd.length === 11
      ? digitsProd.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, "$1.$2.$3-$4")
      : digitsProd.length === 14 ? digitsProd.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5") : digitsProd;
    const { data: prodRowsDest } = await sb()
      .from("produtores")
      .select("id")
      .or(`cpf_cnpj.eq.${digitsProd},cpf_cnpj.eq.${digitsProdFmt}`)
      .limit(1);
    const produtorIdDest = prodRowsDest?.[0]?.id as string | undefined;
    if (produtorIdDest) {
      const { data: iesDest } = await sb()
        .from("produtor_inscricoes_estaduais")
        .select("inscricao_estadual, municipio, municipio_ibge, cep, logradouro, numero, bairro")
        .eq("produtor_id", produtorIdDest)
        .eq("ativa", true);
      const ieEscolhidaDest = (iesDest ?? []).find(i => i.inscricao_estadual === input.destinatario.ie) ?? (iesDest ?? [])[0];
      if (ieEscolhidaDest?.municipio_ibge) {
        input = {
          ...input,
          destinatario: {
            ...input.destinatario,
            municipio_ibge: ieEscolhidaDest.municipio_ibge,
            municipio_nome: input.destinatario.municipio_nome || ieEscolhidaDest.municipio    || undefined,
            logradouro:     input.destinatario.logradouro     || ieEscolhidaDest.logradouro   || undefined,
            numero:         input.destinatario.numero         || ieEscolhidaDest.numero       || undefined,
            bairro:         input.destinatario.bairro         || ieEscolhidaDest.bairro       || undefined,
            cep:            input.destinatario.cep            || ieEscolhidaDest.cep          || undefined,
          },
        };
      }
    }
  }

  let pessoaSemIbgeId: string | null = null;
  // Fallback 2: destinatário é uma Pessoa/fornecedor — busca no cadastro de
  // Pessoas pelo CPF/CNPJ. Compara raw + formatado, limit(1)+array — cadastros
  // com máscara não batiam no match exato por dígitos (mesma classe de bug da
  // auditoria de duplicatas).
  if (!input.destinatario.municipio_ibge && input.destinatario.cpf_cnpj) {
    const digits = input.destinatario.cpf_cnpj.replace(/\D/g, "");
    const digitsFmt = digits.length === 14
      ? digits.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5")
      : digits.length === 11 ? digits.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, "$1.$2.$3-$4") : digits;
    const { data: pessList } = await sb()
      .from("pessoas")
      .select("id, municipio_ibge, municipio, estado, cep")
      .eq("fazenda_id", fazendaId)
      .or(`cpf_cnpj.eq.${digits},cpf_cnpj.eq.${digitsFmt}`)
      .limit(1);
    const pess = pessList?.[0] ?? null;
    // Cadastro achado mas sem IBGE gravado: guarda o id pra tentar resolver via CEP (fallback 3) e
    // já corrigir o cadastro, em vez de só falhar a emissão com "cMun do destinatário inválido".
    if (pess && !pess.municipio_ibge && pess.cep) pessoaSemIbgeId = pess.id;
    if (pess?.municipio_ibge) {
      input = {
        ...input,
        destinatario: {
          ...input.destinatario,
          municipio_ibge: pess.municipio_ibge,
          municipio_nome: input.destinatario.municipio_nome || pess.municipio || undefined,
          uf:             input.destinatario.uf             || pess.estado    || undefined,
        },
      };
    }
  }

  // Fallback 3: CEP tem o IBGE embutido no CEP do Correios (base ViaCEP) mesmo quando o cadastro
  // (Pessoa/IE) nunca teve o campo preenchido — evita bloquear a emissão por um campo que o
  // sistema pode resolver sozinho. Corrige o cadastro da Pessoa junto, pra não repetir a consulta.
  if (!input.destinatario.municipio_ibge && input.destinatario.cep) {
    try {
      const cepDigits = input.destinatario.cep.replace(/\D/g, "");
      if (cepDigits.length === 8) {
        const r = await fetch(`https://viacep.com.br/ws/${cepDigits}/json/`);
        const via = await r.json() as { ibge?: string; localidade?: string; uf?: string; erro?: boolean };
        if (!via.erro && via.ibge) {
          input = {
            ...input,
            destinatario: {
              ...input.destinatario,
              municipio_ibge: via.ibge,
              municipio_nome: input.destinatario.municipio_nome || via.localidade || undefined,
              uf:             input.destinatario.uf             || via.uf          || undefined,
            },
          };
          if (pessoaSemIbgeId) {
            await sb().from("pessoas").update({ municipio_ibge: via.ibge, municipio: via.localidade, estado: via.uf }).eq("id", pessoaSemIbgeId);
          }
        }
      }
    } catch { /* ViaCEP fora do ar — segue pro próximo fallback */ }
  }

  // Fallback 4: o CEP em si pode não existir na base dos Correios (comum em dados vindos da Receita
  // Federal), mas o nome do município costuma estar certo — resolve pela API oficial do IBGE.
  if (!input.destinatario.municipio_ibge && input.destinatario.municipio_nome) {
    try {
      const ufBusca = (input.destinatario.uf || "MT").toUpperCase();
      const r = await fetch(`https://servicodados.ibge.gov.br/api/v1/localidades/estados/${ufBusca}/municipios`);
      if (r.ok) {
        const lista = await r.json() as { id: number; nome: string }[];
        const norm = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
        const alvo = norm(input.destinatario.municipio_nome);
        const achado = lista.find(m => norm(m.nome) === alvo);
        if (achado) {
          const ibge = String(achado.id);
          input = { ...input, destinatario: { ...input.destinatario, municipio_ibge: ibge } };
          if (pessoaSemIbgeId) await sb().from("pessoas").update({ municipio_ibge: ibge }).eq("id", pessoaSemIbgeId);
        }
      }
    } catch { /* API do IBGE fora do ar — segue sem o fallback, cai no erro CFG normal abaixo */ }
  }

  const certPath = confg.cert_a1_path;
  const certSenha = confg.cert_a1_senha;
  if (!certPath || !certSenha)
    return { sucesso: false, cStat: "501", xMotivo: !certPath
      ? `Certificado A1 (arquivo) não enviado para o emitente ${moduloKey.replace(/^fiscal_(pf|emp)_/, "")} em Parâmetros → Fiscal`
      : `A senha do certificado A1 do emitente ${moduloKey.replace(/^fiscal_(pf|emp)_/, "")} não está salva. Em Parâmetros → Fiscal, envie o certificado de novo informando a senha` };

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

  const cpfCnpjEmit = (confg.cpf_cnpj_emitente ?? "").replace(/\D/g, "");
  const isCPFEmit   = cpfCnpjEmit.length === 11;

  // MOC NF-e 7.0 — faixas de série por tipo de emitente:
  //   CNPJ (procEmi 0/1/2/3): 0–889
  //   CPF  (procEmi 0/1/2/3): 920–969
  //   890–899: NF-e avulsa Fisco Estadual   ← NUNCA usar aqui (causa cStat 502)
  //   970–989: NF-e avulsa Fisco Federal    ← NUNCA usar aqui
  //   900–919 / 990–999: reservados
  // Validado ANTES de reservar o número — reservar primeiro gastava numeração de verdade em
  // tentativas que iam falhar por configuração (achado real: número saltando de 5558 pra 5563 em
  // 5 tentativas que só davam erro de série, nenhuma delas chegando a transmitir).
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

  // 3. Próximo número (reservado de forma atômica) — só depois da configuração validada
  const numero = await proximoNumero(fazendaId, moduloKey, confg);

  const emitente: EmitenteCfg = {
    cpf_cnpj:       cpfCnpjEmit,
    razao_social:   confg.razao_social ?? "",
    ie:             emitIeOverride ?? (() => {
      // Usa IE da UF do destinatário quando há múltiplas IEs cadastradas
      const ufDest = (input.destinatario.uf ?? "").toUpperCase();
      if (ufDest) {
        try {
          const iesPorUf: { uf: string; ie: string }[] = JSON.parse(confg.ies_por_uf ?? "[]");
          const ieMatch = iesPorUf.find(r => r.uf.toUpperCase() === ufDest);
          if (ieMatch?.ie) return ieMatch.ie;
        } catch { /* usa IE principal */ }
      }
      return confg.ie_emitente ?? "";
    })(),
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

  // Auto-compõe infCpl a partir das configurações do emitente (Funrural, ICMS diferido, etc.)
  const cfopPrimario = (input.itens[0]?.cfop ?? "").replace(/\D/g, "");
  const cfopInterno = cfopPrimario.startsWith("5");
  const cfopInterestadual = cfopPrimario.startsWith("6");
  const partesInfCpl: string[] = [];
  if (confg.inf_cpl_padrao) partesInfCpl.push(String(confg.inf_cpl_padrao).trim());
  if (cfopInterno && confg.icms_diferido_ativo === "true") {
    const txt = confg.inf_cpl_icms_diferido?.trim() || "ICMS diferido conforme art. 572 do RICMS/MT, Decreto nº 2.212/2014.";
    partesInfCpl.push(txt);
  } else if (cfopInterestadual && confg.inf_cpl_base_reduzida) {
    partesInfCpl.push(String(confg.inf_cpl_base_reduzida).trim());
  }
  if (confg.funrural_retido === "true") {
    const txt = confg.inf_cpl_funrural?.trim() || "Funrural retido na fonte pelo adquirente conforme art. 25 da Lei 8.212/1991.";
    partesInfCpl.push(txt);
  }
  if (input.infCpl?.trim()) partesInfCpl.push(input.infCpl.trim());
  const infCplFinal = partesInfCpl.filter(Boolean).join(" ") || undefined;

  // IBS/CBS (Reforma Tributária) — só destaca quando "Destacar IBS/CBS na NF-e"
  // está ativo pro emitente (confg já traz o valor certo, resolvido por CNPJ ou
  // por IE do produtor conforme o caso — ver buscarConfEmitente acima) E existe
  // configuração de alíquotas pro NCM do item em Parâmetros → Fiscal → Tabela
  // NCM. Sem isso configurado, o item simplesmente não leva o grupo (como já
  // era antes) — nunca bloqueia a emissão por falta de config de IBS/CBS.
  let itensComIBSCBS = input.itens;
  if (confg.ibs_cbs_ativo === "sim") {
    const ncmsDosItens = Array.from(new Set(input.itens.map(i => i.ncm.replace(/\D/g, ""))));
    const { data: ncmRows } = await sb()
      .from("ncm_tributacoes")
      .select("ncm, ibs_estadual_aliq, ibs_municipal_aliq, cbs_aliq, ibs_cbs_reducao_pct, ibs_cbs_cst, ibs_cbs_cclasstrib")
      .eq("fazenda_id", fazendaId)
      .in("ncm", ncmsDosItens);
    const ncmMap = new Map((ncmRows ?? []).map(r => [String(r.ncm).replace(/\D/g, ""), r]));
    itensComIBSCBS = input.itens.map(item => {
      const ncmCfg = ncmMap.get(item.ncm.replace(/\D/g, ""));
      if (!ncmCfg) return item; // sem config pro NCM — emite sem o grupo, não bloqueia
      return {
        ...item,
        ibsCbs: {
          cst:              ncmCfg.ibs_cbs_cst || "000",
          cclasstrib:       ncmCfg.ibs_cbs_cclasstrib || "000001",
          ibsEstadualAliq:  Number(ncmCfg.ibs_estadual_aliq ?? 0),
          ibsMunicipalAliq: Number(ncmCfg.ibs_municipal_aliq ?? 0),
          cbsAliq:          Number(ncmCfg.cbs_aliq ?? 0),
          reducaoPct:       Number(ncmCfg.ibs_cbs_reducao_pct ?? 0),
        },
      };
    });
  }

  // Constrói XML — qualquer exceção aqui se tornava 500; agora vira cStat 505
  let built: ReturnType<typeof buildNFe>;
  try {
    built = buildNFe({ ...input, itens: itensComIBSCBS, emitente, infCpl: infCplFinal });
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

  // SEFAZ 539 = esse número/série já existe autorizado com OUTRA chave (ex.: nota emitida por outro
  // sistema ou por contador antes do Arato). Rejeição não consome o número, então avança o contador e
  // tenta o próximo, até achar um livre (limite de 30 para não ficar em laço).
  if (resposta.cStat === "539" && tentativa < 30) {
    console.warn(`[NF-e] 539 no número ${numero} (série ${serie}) — tentando o próximo (tentativa ${tentativa + 1})`);
    return emitirNFe(fazendaId, moduloKey, input, emitIeOverride, tentativa + 1);
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

// ─── Resultado do cancelamento ────────────────────────────────────────────────
export interface ResultadoCancelamento {
  sucesso: boolean;
  cStat: string;
  xMotivo: string;
  protocoloEvento?: string; // protocolo do EVENTO de cancelamento (não o da NF-e original)
}

// ─── Cancela uma NF-e já autorizada — envia o evento oficial de cancelamento
// (tpEvento 110111) à SEFAZ. Sem isso, "cancelar" só mudava o status aqui
// dentro do sistema e a nota continuava valendo do lado de fora. Reusa a MESMA
// config/certificado (moduloKey) usada na emissão original — reconstrução
// automática seria arriscada se o CNPJ/CPF Emitente da operação for editado
// depois de emitir.
export async function cancelarNFeEmitida(
  fazendaId: string,
  moduloKey: string,
  chave: string,
  protocoloAutorizacao: string,
  justificativa: string,
): Promise<ResultadoCancelamento> {
  const confg = await buscarConfEmitente(fazendaId, moduloKey);
  if (!confg) return { sucesso: false, cStat: "500", xMotivo: `Configuração fiscal '${moduloKey}' não encontrada para cancelamento` };

  const certPath = confg.cert_a1_path;
  const certSenha = confg.cert_a1_senha;
  if (!certPath || !certSenha)
    return { sucesso: false, cStat: "501", xMotivo: !certPath
      ? `Certificado A1 (arquivo) não enviado para o emitente ${moduloKey.replace(/^fiscal_(pf|emp)_/, "")} em Parâmetros → Fiscal`
      : `A senha do certificado A1 do emitente ${moduloKey.replace(/^fiscal_(pf|emp)_/, "")} não está salva. Em Parâmetros → Fiscal, envie o certificado de novo informando a senha` };

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

  try {
    const resultado = await cancelarNFe(pem, {
      chave,
      protocolo: protocoloAutorizacao,
      cpfCnpjEmit: confg.cpf_cnpj_emitente ?? "",
      uf: confg.uf_emitente ?? "MT",
      ambiente: (confg.ambiente as "producao" | "homologacao") ?? "homologacao",
      justificativa,
    });
    return {
      sucesso: resultado.sucesso,
      cStat: resultado.cStat,
      xMotivo: resultado.xMotivo,
      protocoloEvento: resultado.protocolo,
    };
  } catch (e) {
    return { sucesso: false, cStat: "505", xMotivo: `Erro ao montar/assinar evento de cancelamento: ${e}` };
  }
}
