/**
 * lib/nfe/builder.ts
 * Gera o XML de NF-e 4.00 não assinado para produtor rural (MT).
 * Todos os valores monetários são formatados com 2 casas; quantidades com 4.
 */

export interface EmitenteCfg {
  cpf_cnpj: string;       // apenas dígitos
  razao_social: string;
  ie: string;
  im?: string;
  crt: "1" | "2" | "3" | "4";
  logradouro: string;
  numero: string;
  bairro: string;
  municipio_ibge: string; // 7 dígitos IBGE
  municipio_nome: string;
  uf: string;             // ex: "MT"
  cep: string;            // apenas dígitos
  fone?: string;
  ambiente: "producao" | "homologacao";
  serie: string;          // ex: "001"
  numero_nfe: number;     // próximo número a emitir
}

export interface DestinatarioCfg {
  nome: string;
  cpf_cnpj?: string;      // apenas dígitos (opcional para consumidor final)
  ie?: string;
  logradouro?: string;
  numero?: string;
  bairro?: string;
  municipio_ibge?: string;
  municipio_nome?: string;
  uf?: string;
  cep?: string;
  email?: string;
  telefone?: string;
}

export interface ItemNFe {
  codigo: string;
  descricao: string;
  ncm: string;            // ex: "12011000"
  cfop: string;           // ex: "6101"
  unidade: string;        // ex: "SC", "KG", "TON"
  quantidade: number;
  valor_unitario: number;
  valor_desconto?: number;
}

export interface NFeInput {
  emitente: EmitenteCfg;
  destinatario: DestinatarioCfg;
  itens: ItemNFe[];
  natureza: string;
  infCpl?: string;
  frete?: "0" | "1" | "2" | "9"; // 0=emitente, 1=dest, 2=3rd, 9=sem
  nfe_ref?: string;       // chave da NF-e referenciada (devolução/complemento)
  tipo?: "0" | "1";       // 1=saída (padrão), 0=entrada
}

export interface NFeBuiltResult {
  xml: string;
  chave: string;
  cNF: string;
  numero: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function soDigitos(s: string): string {
  return s.replace(/\D/g, "");
}

function pad(n: number | string, len: number): string {
  return String(n).padStart(len, "0");
}

function fmtVal(n: number, casas = 2): string {
  return n.toFixed(casas);
}

// Escapa caracteres proibidos em conteúdo XML.
// Todos os textos visíveis devem passar por aqui para evitar documento malformado.
function escXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

// Remove whitespace entre tags XML — aplicado ao XML completo antes de assinar.
// SEFAZ rejeita (cStat 588) qualquer whitespace entre tags da mensagem.
// IMPORTANTE: deve rodar ANTES da assinatura; pós-sign invalida o digest.
function minifyXml(xml: string): string {
  return xml.replace(/>\s+</g, "><").trim();
}

// Remove/substitui caracteres fora do range U+0020–U+00FF aceito pelo schema NF-e.
// Em dashes/en dashes (U+2014, U+2013) viram " - "; demais chars Unicode altos são removidos.
function sanitizeNFeTxt(s: string): string {
  return s
    .replace(/[–—]/g, " - ")           // en/em dash → " - "
    .replace(/[^\x20-\xFF]/g, "")      // remove qualquer outro char fora do range Latin-1
    .replace(/\s+/g, " ")              // colapsa espaços múltiplos gerados
    .trim();
}

// Módulo 11 para cDV da chave de acesso
function calcCDV(chave43: string): string {
  const pesos = [2, 3, 4, 5, 6, 7, 8, 9];
  let soma = 0;
  for (let i = chave43.length - 1; i >= 0; i--) {
    soma += parseInt(chave43[i]) * pesos[(chave43.length - 1 - i) % pesos.length];
  }
  const resto = soma % 11;
  return String(resto === 0 || resto === 1 ? 0 : 11 - resto);
}

function gerarCNF(): string {
  return pad(Math.floor(Math.random() * 99999999), 8);
}

// Gera dhEmi no formato exigido pelo schema NF-e 4.00:
// "AAAA-MM-DDTHH:MM:SS-HH:MM" (horário local + offset UTC)
// MT, AM, MS, RO, RR = UTC-4 | AC = UTC-5 | demais = UTC-3
// Sem DST desde 2019.
const UF_OFFSET: Record<string, string> = {
  AC: "-05:00",
  AM: "-04:00",
  MS: "-04:00",
  MT: "-04:00",
  RO: "-04:00",
  RR: "-04:00",
};

function gerarDhEmi(uf: string): string {
  const offset = UF_OFFSET[uf] ?? "-03:00";
  const offsetH = parseInt(offset.slice(1, 3), 10) * (offset.startsWith("-") ? -1 : 1);
  // Converte UTC atual para horário local da UF
  const localMs = Date.now() + offsetH * 3600_000;
  const local = new Date(localMs);
  const YYYY = local.getUTCFullYear();
  const MM   = pad(local.getUTCMonth() + 1, 2);
  const DD   = pad(local.getUTCDate(), 2);
  const HH   = pad(local.getUTCHours(), 2);
  const mm   = pad(local.getUTCMinutes(), 2);
  const ss   = pad(local.getUTCSeconds(), 2);
  return `${YYYY}-${MM}-${DD}T${HH}:${mm}:${ss}${offset}`;
}

// cUF por UF
const CUF: Record<string, string> = {
  AC:"12", AL:"27", AM:"13", AP:"16", BA:"29", CE:"23", DF:"53", ES:"32",
  GO:"52", MA:"21", MG:"31", MS:"50", MT:"51", PA:"15", PB:"25", PE:"26",
  PI:"22", PR:"41", RJ:"33", RN:"24", RO:"11", RR:"14", RS:"43", SC:"42",
  SE:"28", SP:"35", TO:"17",
};

// Indicador de destino da operação
function idDest(cfop: string, ufEmit: string, ufDest?: string): "1" | "2" | "3" {
  const c = cfop.replace(/\D/g, "")[0];
  if (c === "7") return "3";
  if (c === "5" || c === "1") return "1";
  if (c === "6" || c === "2") return ufEmit === ufDest ? "1" : "2";
  return "1";
}

// ─── Regras ICMS por CFOP (produtor rural MT) ─────────────────────────────────
//
// ICMS51 — diferimento Decreto 4.540/2004 (operações internas MT):
//   vBC    = vProd do item
//   pICMS  = 12.00 (alíquota nominal)
//   vICMSOp = vBC × pICMS/100  (ICMS que seria exigível sem diferimento)
//   pDif   = 100.00 (diferimento total)
//   vICMSDif = vICMSOp (valor diferido = vICMSOp × pDif/100)
//   vICMS  = 0.00 (nada a pagar agora)
//
// A sequência de tags dentro de <ICMS51> deve obedecer o schema NF-e 4.00:
//   orig, CST, modBC, vBC, pICMS, vICMSOp, pDif, vICMSDif, vICMS
// Nota: vBCDif NÃO existe no schema 4.00; nem pRedBC dentro de ICMS51.

interface ICMSRule {
  cst: string;
  xml: (vBC: number, vProd: number) => string;
}

function icmsRule(cfop: string): ICMSRule {
  const cod = cfop.replace(/\D/g, "");
  const prefix = cod.substring(0, 4);

  if (cod.startsWith("7")) {
    // Exportação direta — imune
    return { cst: "41", xml: () => `<ICMS40><orig>0</orig><CST>41</CST></ICMS40>` };
  }

  if (prefix === "5905" || prefix === "6905") {
    // Remessa p/ armazém — não incide
    return { cst: "41", xml: () => `<ICMS40><orig>0</orig><CST>41</CST></ICMS40>` };
  }

  if (prefix === "5501" || prefix === "6501") {
    // Venda com formação de estoque de exportação — suspenso
    return { cst: "40", xml: () => `<ICMS40><orig>0</orig><CST>40</CST></ICMS40>` };
  }

  if (cod.startsWith("5") || cod.startsWith("1")) {
    // Operação interna MT — ICMS diferido 100% (Decreto 4.540/2004)
    return {
      cst: "51",
      xml: (vBC) => {
        const vICMSOp = fmtVal(vBC * 12 / 100);
        return `<ICMS51><orig>0</orig><CST>51</CST><modBC>3</modBC><vBC>${fmtVal(vBC)}</vBC><pICMS>12.00</pICMS><vICMSOp>${vICMSOp}</vICMSOp><pDif>100.00</pDif><vICMSDif>${vICMSOp}</vICMSDif><vICMS>0.00</vICMS></ICMS51>`;
      },
    };
  }

  // Interestadual (6.xxx) — ICMS 12% (MT→CO/Sul/Sudeste)
  return {
    cst: "00",
    xml: (vBC) => {
      const vICMS = fmtVal(vBC * 12 / 100);
      return `<ICMS00><orig>0</orig><CST>00</CST><modBC>3</modBC><vBC>${fmtVal(vBC)}</vBC><pICMS>12.00</pICMS><vICMS>${vICMS}</vICMS></ICMS00>`;
    },
  };
}

// ─── Builder principal ────────────────────────────────────────────────────────

export function buildNFe(input: NFeInput): NFeBuiltResult {
  const {
    emitente: emit,
    destinatario: dest,
    itens,
    natureza,
    infCpl,
    frete = "9",
    nfe_ref,
    tipo = "1",
  } = input;

  if (!itens.length) throw new Error("NF-e sem itens");
  if (!emit.ie.trim()) throw new Error(
    "IE do emitente não configurada. Acesse Configurações → Parâmetros do Sistema → Fiscal e preencha o campo 'Inscrição Estadual' do emitente selecionado."
  );

  const tpAmb = emit.ambiente === "producao" ? "1" : "2";
  const cuf   = CUF[emit.uf] ?? "51";
  const cnpjCpf = soDigitos(emit.cpf_cnpj);
  const serie = pad(emit.serie, 3);
  const nNF   = pad(emit.numero_nfe, 9);
  const cNF   = gerarCNF();
  const dhEmi = gerarDhEmi(emit.uf);
  const AAMM  = dhEmi.slice(2, 4) + dhEmi.slice(5, 7);

  // Chave: cUF(2)+AAMM(4)+CNPJ/CPF(14)+mod(2)+serie(3)+nNF(9)+tpEmis(1)+cNF(8)
  const cnpjCpf14 = cnpjCpf.padStart(14, "0");
  const chave43 = `${cuf}${AAMM}${cnpjCpf14}55${serie}${nNF}1${cNF}`;
  const cDV = calcCDV(chave43);
  const chave = chave43 + cDV;
  const idNFe = `NFe${chave}`;
  console.log("[buildNFe] cuf:", cuf, "AAMM:", AAMM, "serie:", serie, "nNF:", nNF, "cNF:", cNF, "cDV:", cDV);
  console.log("[buildNFe] chave43 len:", chave43.length, "chave len:", chave.length, "idNFe:", idNFe);

  // ── Identificadores emitente e destinatário ───────────────────────────────

  // NF-e exige CPF (11) ou CNPJ (14) preenchidos — tag vazia é inválida
  const emitIdTag = cnpjCpf.length === 11
    ? `<CPF>${cnpjCpf}</CPF>`
    : `<CNPJ>${cnpjCpf.padStart(14, "0")}</CNPJ>`;

  const destCpfCnpj = dest.cpf_cnpj ? soDigitos(dest.cpf_cnpj) : "";
  let destIdTag: string;
  if (destCpfCnpj.length === 11) {
    destIdTag = `<CPF>${destCpfCnpj}</CPF>`;
  } else if (destCpfCnpj.length === 14) {
    destIdTag = `<CNPJ>${destCpfCnpj}</CNPJ>`;
  } else {
    // Sem CPF/CNPJ — omite a tag (consumidor final sem identificação)
    destIdTag = "";
  }

  const indIEDest = dest.ie ? "1" : "9";
  const destUF    = dest.uf ?? emit.uf;

  // MOC NF-e 7.0: em homologação o xNome do dest DEVE ser exatamente este texto
  // (cStat 598 se o nome real for informado em tpAmb=2)
  const nomeDestinatario = tpAmb === "2"
    ? "NF-E EMITIDA EM AMBIENTE DE HOMOLOGACAO - SEM VALOR FISCAL"
    : dest.nome;

  // ── Referência NF-e anterior ──────────────────────────────────────────────
  const nfeRefTag = nfe_ref ? `<NFref><refNFe>${nfe_ref}</refNFe></NFref>` : "";

  // ── Itens ─────────────────────────────────────────────────────────────────

  // vProd do item = BRUTO (qtde × vUn) — o desconto é declarado separadamente em <vDesc>
  // vNF final = ΣvProd - ΣvDesc
  // Não confundir: o valor líquido (net) é calculado apenas no total, nunca no <vProd> do item.

  let vProdBrutoTotal = 0;
  let vDescTotal      = 0;
  let vICMSTotal      = 0;
  let vBCTotal        = 0;

  const itensXml = itens.map((item, idx) => {
    const vProdBruto = item.quantidade * item.valor_unitario;
    const vDescItem  = item.valor_desconto ?? 0;
    const vProdLiq   = vProdBruto - vDescItem; // usado como BC do ICMS

    vProdBrutoTotal += vProdBruto;
    vDescTotal      += vDescItem;

    const rule = icmsRule(item.cfop);
    // BC = vProd líquido (após desconto) para CST 00/51
    const vBC = (rule.cst === "00" || rule.cst === "51") ? vProdLiq : 0;
    if (rule.cst === "00") {
      vBCTotal    += vBC;
      vICMSTotal  += vBC * 12 / 100;
    }

    const ncm  = soDigitos(item.ncm);
    const cfop = soDigitos(item.cfop);

    // PIS/COFINS CST 07 — operação isenta da contribuição:
    // Deve usar <PISNT>/<COFINSNT>, não <PISAliq>/<COFINSAliq>.
    // PISAliq/COFINSAliq só são válidos para CST 01, 02 e 03.
    const pisXml    = `<PIS><PISNT><CST>07</CST></PISNT></PIS>`;
    const cofinsXml = `<COFINS><COFINSNT><CST>07</CST></COFINSNT></COFINS>`;

    return `<det nItem="${idx + 1}">
      <prod>
        <cProd>${pad(idx + 1, 4)}</cProd>
        <cEAN>SEM GTIN</cEAN>
        <xProd>${escXml(item.descricao.substring(0, 120))}</xProd>
        <NCM>${ncm}</NCM>
        <CFOP>${cfop}</CFOP>
        <uCom>${escXml(item.unidade.toUpperCase())}</uCom>
        <qCom>${fmtVal(item.quantidade, 4)}</qCom>
        <vUnCom>${fmtVal(item.valor_unitario, 10)}</vUnCom>
        <vProd>${fmtVal(vProdBruto)}</vProd>
        <cEANTrib>SEM GTIN</cEANTrib>
        <uTrib>${escXml(item.unidade.toUpperCase())}</uTrib>
        <qTrib>${fmtVal(item.quantidade, 4)}</qTrib>
        <vUnTrib>${fmtVal(item.valor_unitario, 10)}</vUnTrib>
        ${vDescItem > 0 ? `<vDesc>${fmtVal(vDescItem)}</vDesc>` : ""}
        <indTot>1</indTot>
      </prod>
      <imposto>
        <vTotTrib>0.00</vTotTrib>
        <ICMS>${rule.xml(vBC, vProdLiq)}</ICMS>
        ${pisXml}
        ${cofinsXml}
      </imposto>
    </det>`;
  }).join("\n");

  // ── Endereços ─────────────────────────────────────────────────────────────

  const enderEmit = `<enderEmit>
      <xLgr>${escXml(emit.logradouro)}</xLgr>
      <nro>${escXml(emit.numero || "S/N")}</nro>
      <xBairro>${escXml(emit.bairro)}</xBairro>
      <cMun>${emit.municipio_ibge}</cMun>
      <xMun>${escXml(emit.municipio_nome)}</xMun>
      <UF>${emit.uf}</UF>
      <CEP>${soDigitos(emit.cep)}</CEP>
      <cPais>1058</cPais>
      <xPais>Brasil</xPais>
      ${emit.fone ? `<fone>${soDigitos(emit.fone)}</fone>` : ""}
    </enderEmit>`;

  // cMun 9999999 é o código reservado para município genérico (ex: consumidor sem endereço).
  // Sempre preferir o código IBGE real do município do destinatário quando disponível.
  const destCMun = dest.municipio_ibge && dest.municipio_ibge !== "9999999"
    ? dest.municipio_ibge
    : "9999999";

  const enderDest = dest.logradouro
    ? `<enderDest>
      <xLgr>${escXml(dest.logradouro)}</xLgr>
      <nro>${escXml(dest.numero || "S/N")}</nro>
      <xBairro>${escXml(dest.bairro ?? "N/A")}</xBairro>
      <cMun>${destCMun}</cMun>
      <xMun>${escXml(dest.municipio_nome ?? destUF)}</xMun>
      <UF>${destUF}</UF>
      <CEP>${soDigitos(dest.cep ?? "00000000")}</CEP>
      <cPais>1058</cPais>
      <xPais>Brasil</xPais>
      ${dest.telefone ? `<fone>${soDigitos(dest.telefone)}</fone>` : ""}
    </enderDest>`
    : `<enderDest>
      <xLgr>NAO INFORMADO</xLgr>
      <nro>S/N</nro>
      <xBairro>NAO INFORMADO</xBairro>
      <cMun>${destCMun}</cMun>
      <xMun>${escXml(destUF)}</xMun>
      <UF>${destUF}</UF>
      <CEP>00000000</CEP>
      <cPais>1058</cPais>
      <xPais>Brasil</xPais>
    </enderDest>`;

  // ── Totais ────────────────────────────────────────────────────────────────

  const vNF = vProdBrutoTotal - vDescTotal; // valor total da NF-e

  // ── XML completo ──────────────────────────────────────────────────────────

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<NFe xmlns="http://www.portalfiscal.inf.br/nfe">
  <infNFe Id="${idNFe}" versao="4.00">
    <ide>
      <cUF>${cuf}</cUF>
      <cNF>${cNF}</cNF>
      <natOp>${escXml(sanitizeNFeTxt(natureza).substring(0, 60))}</natOp>
      <mod>55</mod>
      <serie>${parseInt(serie)}</serie>
      <nNF>${parseInt(nNF)}</nNF>
      <dhEmi>${dhEmi}</dhEmi>
      <tpNF>${tipo}</tpNF>
      <idDest>${idDest(itens[0].cfop, emit.uf, destUF)}</idDest>
      <cMunFG>${emit.municipio_ibge}</cMunFG>
      <tpImp>1</tpImp>
      <tpEmis>1</tpEmis>
      <cDV>${cDV}</cDV>
      <tpAmb>${tpAmb}</tpAmb>
      <finNFe>1</finNFe>
      <indFinal>0</indFinal>
      <indPres>0</indPres>
      <procEmi>0</procEmi>
      <verProc>RacTech 1.0</verProc>
      ${nfeRefTag}
    </ide>
    <emit>
      ${emitIdTag}
      <xNome>${escXml(emit.razao_social.substring(0, 60))}</xNome>
      ${enderEmit}
      ${emit.ie.trim() ? `<IE>${escXml(emit.ie.trim())}</IE>` : ""}
      ${emit.im ? `<IM>${escXml(emit.im)}</IM>` : ""}
      <CRT>${emit.crt}</CRT>
    </emit>
    <dest>
      ${destIdTag}
      <xNome>${escXml(nomeDestinatario.substring(0, 60))}</xNome>
      ${enderDest}
      <indIEDest>${indIEDest}</indIEDest>
      ${dest.ie ? `<IE>${escXml(dest.ie)}</IE>` : ""}
      ${dest.email ? `<email>${escXml(dest.email)}</email>` : ""}
    </dest>
    ${itensXml}
    <total>
      <ICMSTot>
        <vBC>${fmtVal(vBCTotal)}</vBC>
        <vICMS>${fmtVal(vICMSTotal)}</vICMS>
        <vICMSDeson>0.00</vICMSDeson>
        <vFCPUFDest>0.00</vFCPUFDest>
        <vICMSUFDest>0.00</vICMSUFDest>
        <vICMSUFRemet>0.00</vICMSUFRemet>
        <vFCP>0.00</vFCP>
        <vBCST>0.00</vBCST>
        <vST>0.00</vST>
        <vFCPST>0.00</vFCPST>
        <vFCPSTRet>0.00</vFCPSTRet>
        <qBCMono>0.00</qBCMono>
        <vICMSMono>0.00</vICMSMono>
        <qBCMonoReten>0.00</qBCMonoReten>
        <vICMSMonoReten>0.00</vICMSMonoReten>
        <qBCMonoRet>0.00</qBCMonoRet>
        <vICMSMonoRet>0.00</vICMSMonoRet>
        <vProd>${fmtVal(vProdBrutoTotal)}</vProd>
        <vFrete>0.00</vFrete>
        <vSeg>0.00</vSeg>
        <vDesc>${fmtVal(vDescTotal)}</vDesc>
        <vII>0.00</vII>
        <vIPI>0.00</vIPI>
        <vIPIDevol>0.00</vIPIDevol>
        <vPIS>0.00</vPIS>
        <vCOFINS>0.00</vCOFINS>
        <vOutro>0.00</vOutro>
        <vNF>${fmtVal(vNF)}</vNF>
      </ICMSTot>
    </total>
    <transp>
      <modFrete>${frete}</modFrete>
    </transp>
    <pag>
      <detPag>
        <tPag>90</tPag>
        <vPag>0.00</vPag>
      </detPag>
    </pag>
    <infAdic>
      ${infCpl ? `<infCpl>${escXml(sanitizeNFeTxt(infCpl).substring(0, 5000))}</infCpl>` : ""}
    </infAdic>
  </infNFe>
</NFe>`;

  const xmlMin = minifyXml(xml);

  // Auto-validação: relê os campos do XML gerado e recalcula a chave para garantir consistência.
  // Se falhar, há um bug no builder que impede autorizações mesmo antes do signing.
  {
    const xCuf    = xmlMin.match(/<cUF>(\d+)<\/cUF>/)?.[1] ?? "";
    const xDhEmi  = xmlMin.match(/<dhEmi>([^<]+)<\/dhEmi>/)?.[1] ?? "";
    const xAamm   = xDhEmi.slice(2, 4) + xDhEmi.slice(5, 7);
    const xCpf    = xmlMin.match(/<CPF>(\d+)<\/CPF>/)?.[1];
    const xCnpj   = xmlMin.match(/<CNPJ>(\d+)<\/CNPJ>/)?.[1];
    const xCpf14  = xCpf ? xCpf.padStart(14, "0") : (xCnpj ?? "").padStart(14, "0");
    const xMod    = xmlMin.match(/<mod>(\d+)<\/mod>/)?.[1] ?? "55";
    const xSerie  = String(xmlMin.match(/<serie>(\d+)<\/serie>/)?.[1] ?? "1").padStart(3, "0");
    const xNNF    = String(xmlMin.match(/<nNF>(\d+)<\/nNF>/)?.[1] ?? "1").padStart(9, "0");
    const xTpEmis = xmlMin.match(/<tpEmis>(\d+)<\/tpEmis>/)?.[1] ?? "1";
    const xCNF    = xmlMin.match(/<cNF>(\d+)<\/cNF>/)?.[1] ?? "";
    const xChave43 = xCuf + xAamm + xCpf14 + xMod + xSerie + xNNF + xTpEmis + xCNF;
    const xCDV    = calcCDV(xChave43);
    const xChave  = xChave43 + xCDV;
    const xId     = xmlMin.match(/Id="(NFe\d{44})"/)?.[1] ?? "";
    const idOk    = xId === "NFe" + xChave;
    console.log("[buildNFe] auto-val → chave dos campos XML:", xChave, "| Id no XML:", xId, "| ok?", idOk);
    if (!idOk) {
      console.error("[buildNFe] MISMATCH! serie no xml:", xSerie, "nNF:", xNNF, "cNF:", xCNF, "cuf:", xCuf, "aamm:", xAamm, "cpf14:", xCpf14);
    }
  }

  return { xml: xmlMin, chave, cNF, numero: String(emit.numero_nfe) };
}
