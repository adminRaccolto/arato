import { totaisDoXmlNFe } from "./totais";
import { abrirOperacaoFiscal, prepararEnvioFiscal, registrarRetornoFiscal, retornoOperacaoExistente, type OperacaoFiscal } from "../fiscal/operacao";
import { resolverTributacaoNFe } from "../fiscal/tributacao-nfe";
import { contextoEventoNFe } from "../fiscal/evento-consulta";
/**
 * lib/nfe/index.ts
 * Ponto central da emissão de NF-e:
 *   1. Busca configuração do emitente em configuracoes_modulo
 *   2. Carrega certificado A1 do Supabase Storage
 *   3. Gera XML (builder) → assina (signer) → transmite (transmitter)
 *   4. Salva XML autorizado no Storage e atualiza a nota no banco
 */

import { createClient } from "../supabase-servidor";
import { buildNFe }        from "./builder";
import { assinarNFe } from "./signer";
import { transmitirNFe }   from "./transmitter";
import { cancelarNFe, emitirCartaCorrecao } from "./evento";
import type { NFeInput, EmitenteCfg } from "./builder";
import { somenteDigitos, selecionarInscricaoFiscal, aplicarInscricaoFiscal, mesmoMunicipio, documentoDoModulo } from "./identidade-fiscal";
import { configComIdentidade, buscarTitularCadastro, produtoresDoDocumento } from "./titular-cadastro";
import { maiorNumeroDaSerie, mensagemNumeroEmUso, numeroJaEmUso } from "./numero-em-uso";
import { usaTextosDeVenda } from "./textos-automaticos";
import { carregarCertificadoEmitente, baixarA1Exato, contextoCertificados } from "./certificado-emitente";
import type { PemPair } from "./signer";
import { indexarConfigsEmitentes } from "./configs-emitentes";
const soDig = (v?: string | null) => String(v ?? "").replace(/\D/g, "");

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
  opcoes?: { eventoDeNotaEmitida?: boolean }, // cancelamento e CC-e: a nota já existe, só precisam do certificado e do CPF/CNPJ
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
  const { data: fazRow, error: erroFaz } = await sb().from("fazendas").select("conta_id").eq("id", fazendaId).maybeSingle();
  if(erroFaz)throw erroFaz;
  if(!fazRow)throw new Error("Fazenda da emissão não encontrada.");
  let fazendaIdsConta = [fazendaId];
  if (fazRow?.conta_id) {
    const { data: fzsConta } = await sb().from("fazendas").select("id").eq("conta_id", fazRow.conta_id);
    if (fzsConta && fzsConta.length > 0) fazendaIdsConta = fzsConta.map((f: { id: string }) => f.id);
  }

  // Carrega em paralelo: config do emitente + ambiente global + todos os certs cadastrados
  // Config base do emitente: primeiro tenta na fazenda exata (pode ter dados específicos dela,
  // ex: endereço); moduloKey em si é o titular (CPF/CNPJ), não a fazenda.
  const [emitLocalResult, globalResult] = await Promise.all([
    sb().from("configuracoes_modulo").select("config").eq("fazenda_id", fazendaId).eq("modulo", moduloKey).maybeSingle(),
    // "fiscal_global" (o botão Ambiente SEFAZ — master switch) é do CLIENTE, não da fazenda ativa:
    // achado real 27/09/2026 — cliente com várias fazendas trocava pra Produção vendo a tela conta-wide
    // (já corrigida) e a NF-e continuava saindo em Homologação porque ESTA busca (a que emite de
    // verdade) só olhava a fazenda exata da emissão. Mesma classe de bug de emitData logo abaixo:
    // busca em todas as fazendas da conta e fica com a mais recente (updated_at), igual à tela.
    sb().from("configuracoes_modulo").select("config, updated_at").in("fazenda_id", fazendaIdsConta).eq("modulo", "fiscal_global").order("updated_at", { ascending: false }).limit(1),
  ]);
  if(emitLocalResult.error)throw emitLocalResult.error;if(globalResult.error)throw globalResult.error;
  const globalData=globalResult.data?.[0] ?? null;

  let emitData: { config: unknown } | null = emitLocalResult.data;

  // Não achou (ou achou incompleto) na fazenda exata — o titular fiscal (CPF/CNPJ, certificado)
  // é da CONTA, não da fazenda; busca em qualquer fazenda do mesmo cliente antes de desistir.
  // Achado real 23/09/2026: fazenda sem cadastro fiscal próprio (só o card por-IE, que não carrega
  // CPF nem certificado) nunca achava a config base, mesmo ela existindo certinha noutra fazenda
  // do mesmo cliente — cliente reenviou o certificado 2x sem resolver.
  if (!emitData?.config || !(emitData.config as Record<string,string>).cpf_cnpj_emitente || !(emitData.config as Record<string,string>).razao_social) {
    const { data: cfgConta, error } = await sb()
      .from("configuracoes_modulo").select("modulo, config, fazenda_id, updated_at")
      .in("fazenda_id", fazendaIdsConta).eq("modulo", moduloKey)
      .not("modulo", "like", "%__ie_%");
    if (error) throw error;
    const config = indexarConfigsEmitentes(cfgConta ?? [], fazendaId)[moduloKey];
    if (config) emitData = { config };
  }

  // Um módulo explícito nunca pode ser substituído pelo de outro titular.
  if (!emitData?.config) return null;
  // CPF/CNPJ, nome e endereço vêm do cadastro; a configuração guarda certificado, série, numeração e tributação.
  const documentoModulo = documentoDoModulo(moduloKey);
  const cfg = await configComIdentidade(sb(), fazendaIdsConta, moduloKey, { ...emitData.config } as Record<string, string>);
  if (documentoModulo && !cfg.razao_social) {
    throw new Error(`O titular ${documentoModulo} não está em Cadastros → Produtores nem em Cadastros → Empresas. Cadastre antes de emitir.`);
  }

  // Resolve IE: configs antigas (de antes do modelo "Parâmetros Fiscais por IE")
  // nunca tiveram ie_emitente preenchido na config base — o cadastro de
  // Inscrições Estaduais do produtor é que tem a IE de verdade. Sem isso,
  // emitirNFe falhava com "IE do emitente não configurada" mesmo com o
  // produtor tendo IE(s) cadastrada(s) e a tela de Parâmetros Fiscais
  // mostrando os cards de IE certinhos — a config nunca chegava a consultá-los.
  // Também traz a config granular por-IE (série/número/CRT/IBS-CBS), se
  // existir, sobrepondo os valores da config base.
  if ((moduloKey.startsWith("fiscal_pf_") || moduloKey.startsWith("fiscal_emp_")) && cfg.cpf_cnpj_emitente) {
    const digits = cfg.cpf_cnpj_emitente.replace(/\D/g, "");
    // TODOS os cadastros de produtor com esse CPF — não só o primeiro. O mesmo CPF pode ter mais
    // de um registro em "produtores" (ex.: "FULANO" e "FULANO E OUTROS — CONDOMÍNIO X", mesma
    // pessoa em arranjos de propriedade diferentes), cada um com suas próprias IEs — pegar só o
    // primeiro cadastro escondia as IEs (e a série/número configurados) do(s) outro(s).
    const prodRows = await produtoresDoDocumento(sb(), fazendaIdsConta, digits, "id, nome, cpf_cnpj");
    const produtorIds = (prodRows ?? []).map(p => p.id as string);
    if (produtorIds.length > 0) {
      const { data: ies } = await sb()
        .from("produtor_inscricoes_estaduais")
        .select("id, produtor_id, inscricao_estadual, fazenda_id, ativa, estado, cep, logradouro, numero, complemento, bairro, municipio, municipio_ibge")
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
          .in("modulo", iesAtivas.map(i => `${moduloKey}__ie_${i.id}`))
          .order("updated_at", { ascending: true }); // havendo cópias, vale a mais recente, como em Parâmetros → Fiscal
        for (const row of cfgsIe ?? []) {
          const ieId = (row.modulo as string).split("__ie_")[1];
          if (ieId) configsPorIe.set(ieId, row.config as Record<string, string>);
        }
      }
      const ieAlvo = ieOverride || cfg.ie_emitente || "";
      // Titular com várias IEs não pode ficar sem cancelar: o evento não usa IE (achado 04/11/2026, NF 1/923)
      const ieEscolhida = opcoes?.eventoDeNotaEmitida ? null : selecionarInscricaoFiscal(iesAtivas, ieAlvo, fazendaId);
      if (ieEscolhida) {
        const titular = prodRows?.find(p => p.id === ieEscolhida.produtor_id);
        if (!titular?.nome) throw new Error("Nome do titular da IE não encontrado no cadastro do produtor.");
        const cfgIeConfig = configsPorIe.get(ieEscolhida.id);
        Object.assign(cfg, aplicarInscricaoFiscal(cfg, ieEscolhida, titular, cfgIeConfig));
        if (cfgIeConfig) cfg.__ie_modulo = `${moduloKey}__ie_${ieEscolhida.id}`;
      }
    }
  }

  // Produtor sem inscrição cadastrada na lista: usa a IE do cadastro dele
  if (documentoModulo && !cfg.ie_emitente) {
    const titular = await buscarTitularCadastro(sb(), fazendaIdsConta, documentoModulo);
    if (titular?.inscricao_est) cfg.ie_emitente = titular.inscricao_est;
  }

  if (ieOverride && somenteDigitos(ieOverride) !== somenteDigitos(cfg.ie_emitente)) {
    throw new Error("A IE selecionada não corresponde ao estabelecimento da configuração fiscal.");
  }

  // Ambiente global sobrepõe o ambiente do emitente — é o "master switch"
  const ambienteGlobal = globalData?.config?.ambiente as string | undefined;
  return {
    ...cfg,
    ...(ambienteGlobal ? { ambiente: ambienteGlobal } : {}),
  };
}

// ─── Carrega PFX do Supabase Storage ─────────────────────────────────────────
export async function carregarPfx(storagePath:string,fazendaId:string):Promise<Buffer> {
  const db=sb();const {ids}=await contextoCertificados(db,fazendaId);
  return baixarA1Exato(db,storagePath,ids);
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

async function salvarXml(fazendaId:string,chave:string,xml:string):Promise<string> {
  const path=fazendaId+"/nfe_emitidas/"+chave+".xml";
  const {error}=await sb().storage.from("arquivos").upload(path,new Blob([xml],{type:"application/xml"}),{upsert:true});
  if(error)throw error;
  return sb().storage.from("arquivos").getPublicUrl(path).data.publicUrl;
}

// ─── Resultado completo ───────────────────────────────────────────────────────
export interface ResultadoEmissao {
  ambiente?:"producao"|"homologacao";
  operacao_id?:string;
  pendente?:boolean;
  sincronizacao_pendente?:boolean;
  totais?:ReturnType<typeof totaisDoXmlNFe>;
  tributacao_itens?:unknown[];
  sucesso: boolean;
  chave?: string;
  numero?: string;
  serie?: string;         // série realmente usada na emissão (de Parâmetros → Fiscal), sem zeros à esquerda
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
  tentativa = 0,
  requisicaoId?:string,
  registroId?:string
): Promise<ResultadoEmissao> {
  const dadosOperacao=structuredClone(input);
  let operacao:OperacaoFiscal;

  // 1. Configuração do emitente
  const confg = await buscarConfEmitente(fazendaId, moduloKey, emitIeOverride);
  if (!confg) return { sucesso: false, cStat: "500", xMotivo: moduloKey ? `Configuração fiscal não encontrada para ${moduloKey}` : "Este cliente tem mais de um emitente. Escolha o emitente da nota." };

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
  // Também completa o ENDEREÇO quando a tela mandou só nome e CPF/CNPJ (achado 10/11/2026: a devolução da NF 27871
  // saiu com "NAO INFORMADO" porque a tela não achou o cadastro na lista dela, embora a Pessoa tivesse endereço).
  if ((!input.destinatario.municipio_ibge || !input.destinatario.logradouro) && input.destinatario.cpf_cnpj) {
    const digits = input.destinatario.cpf_cnpj.replace(/\D/g, "");
    const digitsFmt = digits.length === 14
      ? digits.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5")
      : digits.length === 11 ? digits.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, "$1.$2.$3-$4") : digits;
    // Pessoa é da conta inteira, não só desta fazenda — o destinatário pode
    // ter sido cadastrado a partir de outra fazenda do mesmo cliente.
    const { data: fazRowPes } = await sb().from("fazendas").select("conta_id").eq("id", fazendaId).maybeSingle();
    const { data: pessList } = await sb()
      .from("pessoas")
      .select("id, municipio_ibge, municipio, estado, cep, logradouro, numero, bairro, inscricao_est")
      .eq(fazRowPes?.conta_id ? "conta_id" : "fazenda_id", fazRowPes?.conta_id ?? fazendaId)
      .or(`cpf_cnpj.eq.${digits},cpf_cnpj.eq.${digitsFmt}`)
      .limit(1);
    const pess = pessList?.[0] ?? null;
    // Cadastro achado mas sem IBGE gravado: guarda o id pra tentar resolver via CEP (fallback 3) e
    // já corrigir o cadastro, em vez de só falhar a emissão com "cMun do destinatário inválido".
    if (pess && !pess.municipio_ibge && pess.cep) pessoaSemIbgeId = pess.id;
    // O mesmo CPF pode ter estabelecimentos em municípios diferentes: o IBGE da Pessoa não vale para outro município.
    // Endereço só da Pessoa do mesmo município que a nota já indica (ou quando a tela não mandou município)
    const mesmoLugar = !!pess && (!input.destinatario.municipio_ibge || soDig(input.destinatario.municipio_ibge) === soDig(pess.municipio_ibge))
      && mesmoMunicipio(input.destinatario.municipio_nome, pess.municipio);
    if (pess && mesmoLugar && !input.destinatario.logradouro && pess.logradouro) {
      input = {
        ...input,
        destinatario: {
          ...input.destinatario,
          logradouro: pess.logradouro || undefined,
          numero:     input.destinatario.numero || pess.numero || undefined,
          bairro:     input.destinatario.bairro || pess.bairro || undefined,
          cep:        input.destinatario.cep    || pess.cep    || undefined,
          ie:         input.destinatario.ie     || pess.inscricao_est || undefined,
          municipio_nome: input.destinatario.municipio_nome || pess.municipio || undefined,
          uf:         input.destinatario.uf     || pess.estado || undefined,
        },
      };
    }
    if (!input.destinatario.municipio_ibge && pess?.municipio_ibge && mesmoMunicipio(input.destinatario.municipio_nome, pess.municipio)) {
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

  let pem: PemPair;
  try { pem=(await carregarCertificadoEmitente(sb(),fazendaId,documentoDoModulo(moduloKey) || confg.cpf_cnpj_emitente || '')).pem; }
  catch(e) { return {sucesso:false,cStat:"CERTIFICADO_A1",xMotivo:e instanceof Error ? e.message : "Não foi possível carregar o certificado A1 deste titular."}; }

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
      xMotivo: `Série "${confg.serie_nfe ?? ""}" inválida para emitente CPF${confg.ie_emitente ? ` (IE ${confg.ie_emitente})` : ""}. Configure a série (920 a 969) desta IE em Parâmetros → Fiscal → Inscrições Estaduais, ou escolha na emissão a IE que tem série.`,
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
  // Número só é reservado DEPOIS da validação do emitente (abaixo): reservar antes queimava um
  // número de NF-e a cada tentativa barrada por configuração (ex.: IBGE do município faltando).
  let numero = 0;

  const emitente: EmitenteCfg = {
    cpf_cnpj:       cpfCnpjEmit,
    razao_social:   confg.razao_social ?? "",
    ie:             confg.ie_emitente ?? "",
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
    numero_nfe:     0,
  };

  // 3b. Endereço do emitente incompleto (IBGE/CEP/logradouro): completa pela Inscrição Estadual
  // cadastrada do produtor (produtor_inscricoes_estaduais já guarda município, IBGE, CEP e
  // logradouro por IE) em vez de exigir que o cliente repita tudo em Parâmetros → Fiscal.
  // Achado 25/09/2026: NF de transferência de máquina parou com "IBGE do município não configurado".
  if ((!emitente.municipio_ibge || !/^\d{7}$/.test(emitente.municipio_ibge)) && emitente.ie) {
    try {
      const ieDig = String(emitente.ie).replace(/\D/g, "");
      const { data: fzIe } = await sb().from("fazendas").select("conta_id").eq("id", fazendaId).maybeSingle();
      let fazIdsIe = [fazendaId];
      if (fzIe?.conta_id) {
        const { data: fzsIe } = await sb().from("fazendas").select("id").eq("conta_id", fzIe.conta_id);
        if (fzsIe?.length) fazIdsIe = fzsIe.map(f => f.id as string);
      }
      const { data: ies } = await sb().from("produtor_inscricoes_estaduais")
        .select("inscricao_estadual, municipio, municipio_ibge, cep, logradouro, numero, bairro, estado, fazenda_id").in("fazenda_id", fazIdsIe);
      const ie = (ies ?? []).find(r => String(r.inscricao_estadual ?? "").replace(/\D/g, "") === ieDig && /^\d{7}$/.test(String(r.municipio_ibge ?? "")));
      if (ie) {
        emitente.municipio_ibge = String(ie.municipio_ibge);
        if (!emitente.municipio_nome) emitente.municipio_nome = String(ie.municipio ?? "");
        if (!confg.cep && ie.cep) emitente.cep = String(ie.cep).replace(/\D/g, "");
        if (!emitente.logradouro && ie.logradouro) emitente.logradouro = String(ie.logradouro);
        if ((!emitente.numero || emitente.numero === "S/N") && ie.numero) emitente.numero = String(ie.numero);
        if (!emitente.bairro && ie.bairro) emitente.bairro = String(ie.bairro);
        if (ie.estado) emitente.uf = String(ie.estado);
      }
    } catch { /* best-effort: cai na validação abaixo com mensagem clara */ }
  }

  // 4. Validação prévia de campos obrigatórios — retorna CFG antes de tentar construir/transmitir
  if (!emitente.municipio_ibge || !/^\d{7}$/.test(emitente.municipio_ibge)) {
    return {
      sucesso: false,
      cStat: "CFG",
      xMotivo:
        "Código IBGE do município do emitente não configurado (campo obrigatório <cMun>). " +
        `Emitente ${cpfCnpjEmit} (IE ${emitente.ie || "sem IE"}): acesse Parâmetros → Fiscal → esse emitente e preencha o CEP para auto-completar o IBGE, depois salve — ou cadastre a IE do produtor com município em Cadastros → Produtores.`,
    };
  }


  let itensComIBSCBS;
  try { itensComIBSCBS=await resolverTributacaoNFe(sb(),fazendaId,input,confg,emitente.crt); }
  catch(e){return {sucesso:false,cStat:"TRIBUTACAO",xMotivo:(e as Error).message};}
  // Auto-compõe infCpl a partir das configurações do emitente (Funrural, ICMS diferido, etc.)
  const cfopPrimario = (input.itens[0]?.cfop ?? "").replace(/\D/g, "");
  const cfopInterno = cfopPrimario.startsWith("5");
  const cfopInterestadual = cfopPrimario.startsWith("6");
  const partesInfCpl: string[] = [];
  if (confg.inf_cpl_padrao) partesInfCpl.push(String(confg.inf_cpl_padrao).trim());
  const textosDeVenda = usaTextosDeVenda(input.itens.map(i => i.cfop), input.finNFe);
  if (textosDeVenda && cfopInterno && itensComIBSCBS.every(i=>!i.cst_icms||i.cst_icms.slice(-2)==="51") && confg.icms_diferido_ativo === "true") {
    const txt = confg.inf_cpl_icms_diferido?.trim() || "ICMS diferido conforme art. 572 do RICMS/MT, Decreto nº 2.212/2014.";
    partesInfCpl.push(txt);
  } else if (textosDeVenda && cfopInterestadual && confg.inf_cpl_base_reduzida) {
    partesInfCpl.push(String(confg.inf_cpl_base_reduzida).trim());
  }
  if (textosDeVenda && confg.funrural_retido === "true") {
    const txt = confg.inf_cpl_funrural?.trim() || "Funrural retido na fonte pelo adquirente conforme art. 25 da Lei 8.212/1991.";
    partesInfCpl.push(txt);
  }
  if (input.infCpl?.trim()) partesInfCpl.push(input.infCpl.trim());
  try {
    const variaveis={...(input.variaveis_fiscais ?? {}),...(input.nfe_ref?{NF_ORIGEM:(Array.isArray(input.nfe_ref)?input.nfe_ref:[input.nfe_ref]).map(c=>c.replace(/\D/g,"").slice(25,34).replace(/^0+/,"")).join(", ")}: {})};
    for(const item of itensComIBSCBS){
      const texto=item.regra_fiscal?.texto_legal;
      if(typeof texto!=="string"||!texto.trim())continue;
      partesInfCpl.push(texto.replace(/\[([A-Z_]+)\]/g,(_,nome:string)=>{
        const valor=(variaveis as Record<string,string>)[nome];
        if(!valor?.trim())throw new Error("Preencha "+nome+" nos dados da operação fiscal antes de emitir.");return valor.trim();
      }));
    }
  }catch(e){return {sucesso:false,cStat:"TRIBUTACAO",xMotivo:(e as Error).message};}
  const infCplFinal=[...new Set(partesInfCpl.filter(Boolean))].join(" ") || undefined;


  let built: ReturnType<typeof buildNFe>;
  try {
    // Valida o documento completo antes de reservar a numeração.
    buildNFe({...input,itens:itensComIBSCBS,emitente:{...emitente,numero_nfe:1},infCpl:infCplFinal});
    operacao=await abrirOperacaoFiscal(sb(),{id:requisicaoId,fazenda:fazendaId,modelo:55,documento:emitente.cpf_cnpj,serie:emitente.serie,ambiente:emitente.ambiente,
      dados:dadosOperacao,modulo:confg.__ie_modulo || moduloKey,proximo:confg.numero_inicial,registro:registroId});
    if(!operacao.executar)return retornoOperacaoExistente(operacao) as ResultadoEmissao;
    numero=operacao.numero;emitente.numero_nfe=numero;
    built=buildNFe({...input,itens:itensComIBSCBS,emitente,infCpl:infCplFinal});
  }catch(e){return {sucesso:false,cStat:"VALIDACAO_LOCAL",xMotivo:(e as Error).message};}

  // 5. Assinar
  let xmlAssinado: string;
  try {
    xmlAssinado = assinarNFe(built.xml, pem);
  } catch (e) {
    const falha={sucesso:false,cStat:"ASSINATURA",xMotivo:"Erro na assinatura: "+String(e),operacao_id:operacao.id};
    await registrarRetornoFiscal(sb(),operacao,"cancelada_pre_envio",null,falha);
    return falha;
  }

  // Garante que Id="NFe..." (I maiúsculo) sobrevive ao re-serializador do xml-crypto.
  // Alguns parsers DOM normalizam atributos para lowercase; o SEFAZ exige capital I.
  // xml-crypto pode re-serializar atributos com case diferente; garante Id="NFe..." com I maiúsculo
  xmlAssinado = xmlAssinado.replace(/\bid="(NFe\d{44})"/gi, 'Id="$1"');

  const tributacao=itensComIBSCBS.map(i=>({codigo:i.codigo,cfop:i.cfop,ncm:i.ncm,cst_icms:i.cst_icms,pICMS:i.pICMS,pRedBC:i.pRedBC,pis_cst:i.pis_cst,pis_aliq:i.pis_aliq,cofins_cst:i.cofins_cst,cofins_aliq:i.cofins_aliq,ibsCbs:i.ibsCbs,regra:i.regra_fiscal}));
  await prepararEnvioFiscal(sb(),operacao,xmlAssinado,built.chave,tributacao);
  let resposta;
  try {resposta=await transmitirNFe(xmlAssinado,pem,emitente.uf,emitente.ambiente);}
  catch(e){
    const pendente={sucesso:false,cStat:"PROCESSAMENTO_PENDENTE",xMotivo:"Não foi possível confirmar o resultado da SEFAZ. Consulte a operação antes de reenviar. "+String(e),
      operacao_id:operacao.id,pendente:true,chave:built.chave,numero:built.numero};
    try{await registrarRetornoFiscal(sb(),operacao,"pendente",null,pendente);}catch{ /* XML/chave já estão guardados antes do envio. */ }
    return pendente;
  }
  const autorizada=resposta.cStat==="100" && !!resposta.protocolo && !!resposta.xmlProt;
  const pendente=["103","104","105","106","999","108","109","204","539"].includes(resposta.cStat)|| (resposta.cStat==="100"&&!autorizada);
  const estado=autorizada?"autorizada":pendente?"pendente":"rejeitada";
  const proc=autorizada?montarNfeProc(xmlAssinado,resposta.xmlProt!):undefined;
  const provisoria={ambiente:emitente.ambiente,tributacao_itens:tributacao,totais:totaisDoXmlNFe(xmlAssinado),sucesso:autorizada,cStat:resposta.cStat,xMotivo:resposta.xMotivo,chave:built.chave,numero:built.numero,
    serie:String(serieConfg),protocolo:resposta.protocolo,dhRecbto:resposta.dhRecbto,operacao_id:operacao.id,pendente,sincronizacao_pendente:autorizada};
  try{await registrarRetornoFiscal(sb(),operacao,estado,resposta,provisoria,proc);}
  catch(e){return {...provisoria,sincronizacao_pendente:true,xMotivo:"Resultado recebido; recuperação local pendente. "+(e as Error).message};}
  let xmlUrl:string|undefined;
  let sincronizacaoPendente=false;
  if(proc){try{xmlUrl=await salvarXml(fazendaId,built.chave,proc);}catch{sincronizacaoPendente=true;}}
  const retorno:ResultadoEmissao={
    ambiente:emitente.ambiente,operacao_id:operacao.id,pendente,sincronizacao_pendente:sincronizacaoPendente,
    tributacao_itens:tributacao,totais:totaisDoXmlNFe(xmlAssinado),
    sucesso: autorizada,
    chave:     built.chave,
    numero:    built.numero,
    serie:     String(serieConfg),
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
  try{await registrarRetornoFiscal(sb(),operacao,estado,resposta,retorno,proc);}catch{retorno.sincronizacao_pendente=true;}
  return retorno;
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
  ambienteDocumento?: "producao" | "homologacao",
): Promise<ResultadoCancelamento> {
  const confg = await buscarConfEmitente(fazendaId, moduloKey, undefined, { eventoDeNotaEmitida: true });
  if (!confg) return { sucesso: false, cStat: "500", xMotivo: `Configuração fiscal '${moduloKey}' não encontrada para cancelamento` };
  const contexto=contextoEventoNFe(chave,documentoDoModulo(moduloKey) || confg.cpf_cnpj_emitente || "",ambienteDocumento,confg.ambiente ?? "homologacao");

  let pem: PemPair;
  try { pem=(await carregarCertificadoEmitente(sb(),fazendaId,documentoDoModulo(moduloKey) || confg.cpf_cnpj_emitente || '')).pem; }
  catch(e) { return {sucesso:false,cStat:"CERTIFICADO_A1",xMotivo:e instanceof Error ? e.message : "Não foi possível carregar o certificado A1 deste titular."}; }

  try {
    const resultado = await cancelarNFe(pem, {
      chave,
      protocolo: protocoloAutorizacao,
      ...contexto,
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

export interface ResultadoCorrecao {
  sucesso: boolean;
  cStat: string;
  xMotivo: string;
  protocoloEvento?: string;
  nSeqEvento: number;
  xmlAssinado?: string;
}

// ─── Emite Carta de Correção Eletrônica (CC-e, tpEvento 110110) — não existia
// no sistema até 23/09/2026 (achado real: dono precisou corrigir um dado de
// uma NF-e já autorizada e não tinha como, só "Cancelar" ou "Emitir
// Complementar", nenhum dos dois serve pra esse caso). Mesmo padrão de
// certificado/config do cancelamento — reusa a MESMA config/certificado
// (moduloKey) usada na emissão original.
export async function corrigirNFeEmitida(
  fazendaId: string,
  moduloKey: string,
  chave: string,
  textoCorrecao: string,
  nSeqEvento: number,
  ambienteDocumento?: "producao" | "homologacao",
): Promise<ResultadoCorrecao> {
  const confg = await buscarConfEmitente(fazendaId, moduloKey, undefined, { eventoDeNotaEmitida: true });
  if (!confg) return { sucesso: false, cStat: "500", xMotivo: `Configuração fiscal '${moduloKey}' não encontrada`, nSeqEvento };
  const contexto=contextoEventoNFe(chave,documentoDoModulo(moduloKey) || confg.cpf_cnpj_emitente || "",ambienteDocumento,confg.ambiente ?? "homologacao");

  let pem: PemPair;
  try { pem=(await carregarCertificadoEmitente(sb(),fazendaId,documentoDoModulo(moduloKey) || confg.cpf_cnpj_emitente || '')).pem; }
  catch(e) { return {sucesso:false,cStat:"CERTIFICADO_A1",xMotivo:e instanceof Error ? e.message : "Não foi possível carregar o certificado A1 deste titular.",nSeqEvento}; }

  try {
    const resultado = await emitirCartaCorrecao(pem, {
      chave,
      ...contexto,
      correcao: textoCorrecao,
      nSeqEvento,
    });
    return {
      sucesso: resultado.sucesso,
      cStat: resultado.cStat,
      xMotivo: resultado.xMotivo,
      protocoloEvento: resultado.protocolo,
      nSeqEvento,
    };
  } catch (e) {
    return { sucesso: false, cStat: "505", xMotivo: `Erro ao montar/assinar CC-e: ${e}`, nSeqEvento };
  }
}
