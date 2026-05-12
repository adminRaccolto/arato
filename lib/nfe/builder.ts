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
  // Tipo da NF-e: 1=saída, 0=entrada
  tipo?: "0" | "1";
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

// Gera cNF: 8 dígitos aleatórios
function gerarCNF(): string {
  return pad(Math.floor(Math.random() * 99999999), 8);
}

// cUF por UF
const CUF: Record<string, string> = {
  AC:"12", AL:"27", AM:"13", AP:"16", BA:"29", CE:"23", DF:"53", ES:"32",
  GO:"52", MA:"21", MG:"31", MS:"50", MT:"51", PA:"15", PB:"25", PE:"26",
  PI:"22", PR:"41", RJ:"33", RN:"24", RO:"11", RR:"14", RS:"43", SC:"42",
  SE:"28", SP:"35", TO:"17",
};

// Determina operação de destino
// 1=interna, 2=interestadual, 3=exterior
function idDest(cfop: string, ufEmit: string, ufDest?: string): "1" | "2" | "3" {
  const c = cfop.replace(/\D/g, "")[0];
  if (c === "7") return "3";
  if (c === "5" || c === "1") return "1";
  if (c === "6" || c === "2") return ufEmit === ufDest ? "1" : "2";
  return "1";
}

// Regras ICMS por CFOP para produtor rural em MT
interface ICMSRule {
  cst: string;
  xml: (vBC: number, vProd: number) => string;
}

function icmsRule(cfop: string): ICMSRule {
  const cod = cfop.replace(/\D/g, "");
  const prefix = cod.substring(0, 4);

  // Exportação direta (7.xxx) — imune
  if (cod.startsWith("7")) {
    return {
      cst: "41",
      xml: () => `<ICMS40><orig>0</orig><CST>41</CST></ICMS40>`,
    };
  }

  // Remessa armazém (5905/6905) — não incide
  if (prefix === "5905" || prefix === "6905") {
    return {
      cst: "41",
      xml: () => `<ICMS40><orig>0</orig><CST>41</CST></ICMS40>`,
    };
  }

  // Venda com FE exportação (5501/6501) — ICMS suspenso
  if (prefix === "5501" || prefix === "6501") {
    return {
      cst: "40",
      xml: () => `<ICMS40><orig>0</orig><CST>40</CST></ICMS40>`,
    };
  }

  // Operação interna (5.xxx) — ICMS diferido MT Decreto 4.540/2004
  if (cod.startsWith("5") || cod.startsWith("1")) {
    return {
      cst: "51",
      xml: (vBC) => `<ICMS51><orig>0</orig><CST>51</CST><modBC>3</modBC><vBC>${fmtVal(vBC)}</vBC><pRedBC>100.00</pRedBC><vBCDif>0.00</vBCDif><vICMSDif>0.00</vICMSDif><vICMS>0.00</vICMS><pICMS>0.00</pICMS></ICMS51>`,
    };
  }

  // Interestadual (6.101, 6.117, 6.119, etc.) — ICMS normal 12% (padrão MT→CO)
  const aliq = 12;
  return {
    cst: "00",
    xml: (vBC) => `<ICMS00><orig>0</orig><CST>00</CST><modBC>3</modBC><vBC>${fmtVal(vBC)}</vBC><pICMS>${fmtVal(aliq)}</pICMS><vICMS>${fmtVal(vBC * aliq / 100)}</vICMS></ICMS00>`,
  };
}

// ─── Builder principal ────────────────────────────────────────────────────────

export function buildNFe(input: NFeInput): NFeBuiltResult {
  const { emitente: emit, destinatario: dest, itens, natureza, infCpl, frete = "9", nfe_ref, tipo = "1" } = input;

  const tpAmb = emit.ambiente === "producao" ? "1" : "2";
  const cuf   = CUF[emit.uf] ?? "51";
  const cnpjCpf = soDigitos(emit.cpf_cnpj);
  const serie = pad(emit.serie, 3);
  const nNF   = pad(emit.numero_nfe, 9);
  const cNF   = gerarCNF();
  const agora = new Date();
  const dhEmi = agora.toISOString().replace("Z", "-04:00").slice(0, 22) + ":00";
  const AAMM  = dhEmi.slice(2, 4) + dhEmi.slice(5, 7);

  // Chave: cUF(2)+AAMM(4)+CNPJ/CPF(14)+mod(2)+serie(3)+nNF(9)+tpEmis(1)+cNF(8)
  const cnpjCpf14 = cnpjCpf.padStart(14, "0");
  const chave43 = `${cuf}${AAMM}${cnpjCpf14}55${serie}${nNF}1${cNF}`;
  const cDV = calcCDV(chave43);
  const chave = chave43 + cDV;
  const idNFe = `NFe${chave}`;

  // Totais
  const vProd = itens.reduce((s, i) => s + (i.quantidade * i.valor_unitario - (i.valor_desconto ?? 0)), 0);
  const vDesc = itens.reduce((s, i) => s + (i.valor_desconto ?? 0), 0);

  // ICMS — calculado para cada item separadamente
  const icmsTagsPerItem: string[] = [];
  let vICMSTotal = 0;
  let vBCTotal = 0;
  for (const item of itens) {
    const vProdItem = item.quantidade * item.valor_unitario - (item.valor_desconto ?? 0);
    const rule = icmsRule(item.cfop);
    // Para CST 00 (interestadual), BC = vProd
    const vBC = rule.cst === "00" ? vProdItem : 0;
    if (rule.cst === "00") {
      vBCTotal += vBC;
      vICMSTotal += vBC * 12 / 100;
    }
    icmsTagsPerItem.push(rule.xml(vBC, vProdItem));
  }

  // Tag de identificação do emitente (PF ou PJ)
  const emitIdTag = cnpjCpf.length === 14
    ? `<CNPJ>${cnpjCpf}</CNPJ>`
    : `<CPF>${cnpjCpf}</CPF>`;

  // Tag de identificação do destinatário
  const destCpfCnpj = dest.cpf_cnpj ? soDigitos(dest.cpf_cnpj) : "";
  const destIdTag = destCpfCnpj.length === 14
    ? `<CNPJ>${destCpfCnpj}</CNPJ>`
    : destCpfCnpj.length === 11
    ? `<CPF>${destCpfCnpj}</CPF>`
    : `<CNPJ></CNPJ>`;

  // Indicador IE destinatário: 1=contribuinte, 2=isento, 9=não contribuinte
  const indIEDest = dest.ie ? "1" : "9";

  const destUF = dest.uf ?? emit.uf;

  // Referência a NF-e anterior (devolução/complemento)
  const nfeRefTag = nfe_ref
    ? `<NFref><refNFe>${nfe_ref}</refNFe></NFref>`
    : "";

  // ── Itens ────────────────────────────────────────────────────────────────
  const itensXml = itens.map((item, idx) => {
    const vProdItem = item.quantidade * item.valor_unitario - (item.valor_desconto ?? 0);
    const icmsTag = icmsTagsPerItem[idx];
    const ncm = soDigitos(item.ncm);
    const cfop = soDigitos(item.cfop);

    return `<det nItem="${idx + 1}">
      <prod>
        <cProd>${pad(idx + 1, 4)}</cProd>
        <cEAN>SEM GTIN</cEAN>
        <xProd>${item.descricao.substring(0, 120)}</xProd>
        <NCM>${ncm}</NCM>
        <CFOP>${cfop}</CFOP>
        <uCom>${item.unidade.toUpperCase()}</uCom>
        <qCom>${fmtVal(item.quantidade, 4)}</qCom>
        <vUnCom>${fmtVal(item.valor_unitario, 10)}</vUnCom>
        <vProd>${fmtVal(vProdItem)}</vProd>
        <cEANTrib>SEM GTIN</cEANTrib>
        <uTrib>${item.unidade.toUpperCase()}</uTrib>
        <qTrib>${fmtVal(item.quantidade, 4)}</qTrib>
        <vUnTrib>${fmtVal(item.valor_unitario, 10)}</vUnTrib>
        ${item.valor_desconto ? `<vDesc>${fmtVal(item.valor_desconto)}</vDesc>` : ""}
        <indTot>1</indTot>
      </prod>
      <imposto>
        <vTotTrib>0.00</vTotTrib>
        <ICMS>${icmsTag}</ICMS>
        <PIS><PISAliq><CST>07</CST><vBC>0.00</vBC><pPIS>0.00</pPIS><vPIS>0.00</vPIS></PISAliq></PIS>
        <COFINS><COFINSAliq><CST>07</CST><vBC>0.00</vBC><pCOFINS>0.00</pCOFINS><vCOFINS>0.00</vCOFINS></COFINSAliq></COFINS>
      </imposto>
    </det>`;
  }).join("\n");

  // ── Endereço emitente ─────────────────────────────────────────────────────
  const cepEmit = soDigitos(emit.cep);
  const enderEmit = `<enderEmit>
      <xLgr>${emit.logradouro}</xLgr>
      <nro>${emit.numero || "S/N"}</nro>
      <xBairro>${emit.bairro}</xBairro>
      <cMun>${emit.municipio_ibge}</cMun>
      <xMun>${emit.municipio_nome}</xMun>
      <UF>${emit.uf}</UF>
      <CEP>${cepEmit}</CEP>
      <cPais>1058</cPais>
      <xPais>Brasil</xPais>
      ${emit.fone ? `<fone>${soDigitos(emit.fone)}</fone>` : ""}
    </enderEmit>`;

  // ── Endereço destinatário ─────────────────────────────────────────────────
  const enderDest = dest.logradouro
    ? `<enderDest>
      <xLgr>${dest.logradouro}</xLgr>
      <nro>${dest.numero || "S/N"}</nro>
      <xBairro>${dest.bairro ?? "N/A"}</xBairro>
      <cMun>${dest.municipio_ibge ?? "9999999"}</cMun>
      <xMun>${dest.municipio_nome ?? dest.uf ?? "N/A"}</xMun>
      <UF>${destUF}</UF>
      <CEP>${soDigitos(dest.cep ?? "")}</CEP>
      <cPais>1058</cPais>
      <xPais>Brasil</xPais>
      ${dest.telefone ? `<fone>${soDigitos(dest.telefone)}</fone>` : ""}
    </enderDest>`
    : `<enderDest>
      <xLgr>NAO INFORMADO</xLgr>
      <nro>S/N</nro>
      <xBairro>NAO INFORMADO</xBairro>
      <cMun>9999999</cMun>
      <xMun>${destUF}</xMun>
      <UF>${destUF}</UF>
      <CEP>00000000</CEP>
      <cPais>1058</cPais>
      <xPais>Brasil</xPais>
    </enderDest>`;

  // ── XML completo ──────────────────────────────────────────────────────────
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<NFe xmlns="http://www.portalfiscal.inf.br/nfe">
  <infNFe versao="4.00" Id="${idNFe}">
    <ide>
      <cUF>${cuf}</cUF>
      <cNF>${cNF}</cNF>
      <natOp>${natureza.substring(0, 60)}</natOp>
      <mod>55</mod>
      <serie>${parseInt(serie)}</serie>
      <nNF>${parseInt(nNF)}</nNF>
      <dhEmi>${dhEmi}</dhEmi>
      <tpNF>${tipo}</tpNF>
      <idDest>${idDest(itens[0]?.cfop ?? "6101", emit.uf, destUF)}</idDest>
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
      <xNome>${emit.razao_social.substring(0, 60)}</xNome>
      ${enderEmit}
      <IE>${emit.ie}</IE>
      ${emit.im ? `<IM>${emit.im}</IM>` : ""}
      <CRT>${emit.crt}</CRT>
    </emit>
    <dest>
      ${destIdTag}
      <xNome>${dest.nome.substring(0, 60)}</xNome>
      ${enderDest}
      <indIEDest>${indIEDest}</indIEDest>
      ${dest.ie ? `<IE>${dest.ie}</IE>` : ""}
      ${dest.email ? `<email>${dest.email}</email>` : ""}
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
        <vProd>${fmtVal(vProd + vDesc)}</vProd>
        <vFrete>0.00</vFrete>
        <vSeg>0.00</vSeg>
        <vDesc>${fmtVal(vDesc)}</vDesc>
        <vII>0.00</vII>
        <vIPI>0.00</vIPI>
        <vIPIDevol>0.00</vIPIDevol>
        <vPIS>0.00</vPIS>
        <vCOFINS>0.00</vCOFINS>
        <vOutro>0.00</vOutro>
        <vNF>${fmtVal(vProd)}</vNF>
      </ICMSTot>
    </total>
    <transp>
      <modFrete>${frete}</modFrete>
    </transp>
    <infAdic>
      ${infCpl ? `<infCpl>${infCpl.substring(0, 5000).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")}</infCpl>` : ""}
    </infAdic>
  </infNFe>
</NFe>`;

  return { xml, chave, cNF, numero: String(emit.numero_nfe) };
}
