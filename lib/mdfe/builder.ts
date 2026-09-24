/**
 * lib/mdfe/builder.ts
 * Gera o XML do MDF-e 3.00 (modal rodoviário, carga fracionada ou lotação).
 * Namespace: http://www.portalfiscal.inf.br/mdfe
 * Modelo 58 — série/número configuráveis via configuracoes_modulo (mdfe_emp_{cnpj}).
 * Validado campo a campo contra o schema oficial (nfephp-org/sped-mdfe, PL_MDFe_300a) em 23/09/2026.
 */

import { validarProdutoMDFe, type ProdutoMDFe } from "./produto";

export interface EmitenteMDFe {
  cpf_cnpj:       string;
  razao_social:   string;
  ie?:            string;
  logradouro:     string;
  numero:         string;
  bairro:         string;
  municipio_ibge: string;
  municipio_nome: string;
  uf:             string;
  cep:            string;
  fone?:          string;
  rntrc?:         string;
  tpEmit:         "1" | "2" | "3"; // 1=prestador de serviço de transporte (cobra frete) · 2=carga própria · 3=CT-e globalizado
  tpTransp?:      "1" | "2" | "3"; // 1=ETC · 2=TAC · 3=CTC — opcional, só informativo pra ANTT
  ambiente:       "producao" | "homologacao";
  serie:          string;
  numero_mdfe:    number;
  // Seguro da Carga (RCTR-C) — SEFAZ rejeita o MDF-e rodoviário sem isso quando o emitente é
  // Prestador de Serviço de Transporte ("Dados do seguro de carga incompletos", achado real
  // 23/09/2026). Apólice fixa da transportadora, configurada em Parâmetros → MDF-e.
  seguradora_nome?:  string;
  seguradora_cnpj?:  string;
  apolice_numero?:   string;
  averbacao_numero?: string;
}

export interface MunicipioDescarga {
  municipio_ibge: string;
  municipio_nome: string;
  cte_chaves:     string[];
  nfe_chaves:     string[];
}

export interface VeiculoMDFe {
  placa:    string;
  renavam?: string;
  tara_kg:  number;
  uf?:      string;
  tpRod?:   string; // default 01 = Truck
  tpCar?:   string; // default 00 = não aplicável
}

export interface CondutorMDFe {
  nome: string;
  cpf:  string;
}

export interface CiotMDFe {
  codigo:   string; // 12 dígitos
  cpf_cnpj: string; // responsável pela geração do CIOT
}

export interface MDFeInput {
  emitente:          EmitenteMDFe;
  uf_ini:            string;
  municipio_ini_ibge: string;
  municipio_ini_nome: string;
  uf_fim:            string;
  percurso_ufs?:     string[];
  municipios_descarga: MunicipioDescarga[];
  veiculo:           VeiculoMDFe;
  condutores:        CondutorMDFe[];
  ciot?:             CiotMDFe | null;
  peso_bruto_kg:     number;
  valor_carga:       number;
  produto_predominante?: ProdutoMDFe | null;
  observacao?:       string;
  // Contratante do transporte (<infContratante>) — obrigatório pra emitente Prestador de
  // Serviço (tpEmit=1) ou CT-e Globalizado (tpEmit=3). CPF ou CNPJ de quem contratou o frete
  // (o Tomador do Serviço do CT-e vinculado). Achado real 23/09/2026.
  contratante_cnpj_cpf?: string;
}

export interface MDFeBuiltResult {
  xml:    string;
  chave:  string;
  numero: string;
}

const CUF: Record<string, string> = {
  AC:"12",AL:"27",AM:"13",AP:"16",BA:"29",CE:"23",DF:"53",ES:"32",
  GO:"52",MA:"21",MG:"31",MS:"50",MT:"51",PA:"15",PB:"25",PE:"26",
  PI:"22",PR:"41",RJ:"33",RN:"24",RO:"11",RR:"14",RS:"43",SC:"42",
  SE:"28",SP:"35",TO:"17",
};

const TZ_UF: Record<string, string> = {
  AC:"America/Rio_Branco", AL:"America/Maceio", AM:"America/Manaus", AP:"America/Belem",
  BA:"America/Bahia", CE:"America/Fortaleza", DF:"America/Sao_Paulo", ES:"America/Sao_Paulo",
  GO:"America/Sao_Paulo", MA:"America/Fortaleza", MG:"America/Sao_Paulo", MS:"America/Campo_Grande",
  MT:"America/Cuiaba", PA:"America/Belem", PB:"America/Fortaleza", PE:"America/Recife",
  PI:"America/Fortaleza", PR:"America/Sao_Paulo", RJ:"America/Sao_Paulo", RN:"America/Fortaleza",
  RO:"America/Porto_Velho", RR:"America/Boa_Vista", RS:"America/Sao_Paulo", SC:"America/Sao_Paulo",
  SE:"America/Maceio", SP:"America/Sao_Paulo", TO:"America/Araguaina",
};

function dhEmiParaUF(uf: string): string {
  const tz = TZ_UF[uf] ?? "America/Sao_Paulo";
  const now = new Date();
  const local = new Intl.DateTimeFormat("sv-SE", {
    timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
  }).format(now).replace(" ", "T");
  const utcMs = now.getTime();
  const localMs = new Date(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
    }).format(now).replace(", ", "T")
  ).getTime();
  const diffMin = Math.round((localMs - utcMs) / 60000);
  const sign = diffMin >= 0 ? "+" : "-";
  const abs = Math.abs(diffMin);
  const hh = String(Math.floor(abs / 60)).padStart(2, "0");
  const mm = String(abs % 60).padStart(2, "0");
  return `${local}${sign}${hh}:${mm}`;
}

// cDV — módulo 11 (mesmo algoritmo de NF-e/CT-e)
function calcCDV(key43: string): string {
  const weights = [2,3,4,5,6,7,8,9];
  let sum = 0;
  for (let i = 0; i < 43; i++) sum += parseInt(key43[42 - i]) * weights[i % 8];
  const rem = sum % 11;
  return String(rem < 2 ? 0 : 11 - rem);
}

function gerarCMDF(): string {
  return String(Math.floor(Math.random() * 100000000)).padStart(8, "0");
}

const p2 = (n: number) => n.toFixed(2);
const p4 = (n: number) => n.toFixed(4);

function limparTextoSefaz(valor: string): string {
  return String(valor ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/ /g, " ")
    .replace(/[–—]/g, "-")
    .replace(/[""]/g, '"')
    .replace(/['']/g, "'")
    .replace(/[º°]/g, "o")
    .replace(/ª/g, "a")
    .replace(/[^\x20-\x7E]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const esc = (valor: string): string =>
  limparTextoSefaz(valor)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");

function escLimite(valor: string, limite: number): string {
  return limparTextoSefaz(valor).slice(0, limite)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

export function buildMDFe(input: MDFeInput): MDFeBuiltResult {
  const { emitente: e } = input;

  const cuf = CUF[e.uf] ?? "51";
  const tpAmb = e.ambiente === "producao" ? "1" : "2";

  const serieNum = Number.parseInt(e.serie, 10);
  const serieXml = String(serieNum);
  const serieChave = serieXml.padStart(3, "0");

  const nMDFXml = String(e.numero_mdfe);
  const nMDFChave = nMDFXml.padStart(9, "0");

  if (!/^(0|[1-9][0-9]{0,2})$/.test(serieXml)) throw new Error(`Série inválida para MDF-e: ${serieXml}`);
  if (!/^[1-9][0-9]{0,8}$/.test(nMDFXml)) throw new Error(`Número de MDF-e inválido: ${nMDFXml}`);

  const dhEmi = dhEmiParaUF(e.uf);
  const aamm = dhEmi.slice(2, 4) + dhEmi.slice(5, 7);

  const cpfcnpjE = e.cpf_cnpj.replace(/\D/g, "");
  const docTagE = cpfcnpjE.length === 14 ? "CNPJ" : "CPF";
  const cMDF = gerarCMDF();

  // Chave 44 = cUF(2)+AAMM(4)+CNPJ/CPF(14)+mod(2)+serie(3)+nMDF(9)+tpEmis(1)+cMDF(8)+cDV(1)
  const key43 = `${cuf}${aamm}${cpfcnpjE.padStart(14, "0")}58${serieChave}${nMDFChave}1${cMDF}`;
  const cdv = calcCDV(key43);
  const chave = key43 + cdv;

  if (input.municipios_descarga.length === 0) {
    throw new Error("Nenhum município de descarga informado — não é possível montar o MDF-e sem ao menos 1 documento com destino conhecido.");
  }

  const infMunCarrega = `<infMunCarrega><cMunCarrega>${input.municipio_ini_ibge}</cMunCarrega><xMunCarrega>${esc(input.municipio_ini_nome)}</xMunCarrega></infMunCarrega>`;

  const infPercurso = (input.percurso_ufs ?? [])
    .filter(uf => uf && uf !== input.uf_ini && uf !== input.uf_fim)
    .map(uf => `<infPercurso><UFPer>${uf}</UFPer></infPercurso>`).join("");

  const infDoc = input.municipios_descarga.map(m => {
    const ctes = m.cte_chaves.map(ch => `<infCTe><chCTe>${ch}</chCTe></infCTe>`).join("");
    const nfes = m.nfe_chaves.map(ch => `<infNFe><chNFe>${ch}</chNFe></infNFe>`).join("");
    return `<infMunDescarga><cMunDescarga>${m.municipio_ibge}</cMunDescarga><xMunDescarga>${esc(m.municipio_nome)}</xMunDescarga>${ctes}${nfes}</infMunDescarga>`;
  }).join("");

  const qCTe = input.municipios_descarga.reduce((s, m) => s + m.cte_chaves.length, 0);
  const qNFe = input.municipios_descarga.reduce((s, m) => s + m.nfe_chaves.length, 0);
  const produto = input.produto_predominante;
  const erroProduto = validarProdutoMDFe(produto, e.tpEmit !== "2" || !!e.tpTransp, qCTe + qNFe);
  if (erroProduto) throw new Error(erroProduto);
  if (produto && !limparTextoSefaz(produto.descricao)) throw new Error("Descrição do produto predominante inválida.");
  const prodPred = produto
    ? `<prodPred><tpCarga>${produto.tipo_carga}</tpCarga><xProd>${escLimite(produto.descricao, 120)}</xProd>` +
      (produto.ncm ? `<NCM>${produto.ncm}</NCM>` : "") +
      (produto.cep_carregamento && produto.cep_descarregamento
        ? `<infLotacao><infLocalCarrega><CEP>${produto.cep_carregamento}</CEP></infLocalCarrega><infLocalDescarrega><CEP>${produto.cep_descarregamento}</CEP></infLocalDescarrega></infLotacao>` : "") +
      `</prodPred>` : "";

  const rntrc = e.rntrc ? e.rntrc.replace(/\D/g, "") : "";
  const ciotDigits = input.ciot?.codigo?.replace(/\D/g, "") ?? "";
  const ciotDocDigits = input.ciot?.cpf_cnpj?.replace(/\D/g, "") ?? "";
  const infCIOT = ciotDigits.length === 12 && ciotDocDigits
    ? `<infCIOT><CIOT>${ciotDigits}</CIOT>${ciotDocDigits.length === 14 ? `<CNPJ>${ciotDocDigits}</CNPJ>` : `<CPF>${ciotDocDigits}</CPF>`}</infCIOT>`
    : "";
  // Contratante do transporte — obrigatório pra Prestador de Serviço/CT-e Globalizado (rejeição
  // 578: "Informações dos tomadores é obrigatória para esta operação"). Achado real 23/09/2026.
  const contratanteDigits = (input.contratante_cnpj_cpf ?? "").replace(/\D/g, "");
  const infContratante = contratanteDigits
    ? `<infContratante>${contratanteDigits.length === 14 ? `<CNPJ>${contratanteDigits}</CNPJ>` : `<CPF>${contratanteDigits}</CPF>`}</infContratante>`
    : "";
  const infANTT = (rntrc || infCIOT || infContratante)
    ? `<infANTT>${rntrc ? `<RNTRC>${rntrc}</RNTRC>` : ""}${infContratante}${infCIOT}</infANTT>`
    : "";

  const condutores = input.condutores.map(c =>
    `<condutor><xNome>${escLimite(c.nome, 60)}</xNome><CPF>${c.cpf.replace(/\D/g, "")}</CPF></condutor>`
  ).join("");

  const tpRod = input.veiculo.tpRod ?? "01";
  const tpCar = input.veiculo.tpCar ?? "00";

  const rodo =
    `<rodo>${infANTT}` +
    `<veicTracao>` +
      `<placa>${input.veiculo.placa.replace(/[^A-Z0-9]/gi, "").toUpperCase()}</placa>` +
      (input.veiculo.renavam ? `<RENAVAM>${input.veiculo.renavam.replace(/\D/g, "")}</RENAVAM>` : "") +
      `<tara>${Math.round(input.veiculo.tara_kg)}</tara>` +
      condutores +
      `<tpRod>${tpRod}</tpRod><tpCar>${tpCar}</tpCar>` +
      (input.veiculo.uf ? `<UF>${input.veiculo.uf}</UF>` : "") +
    `</veicTracao>` +
    `</rodo>`;

  const xml = `<?xml version="1.0" encoding="UTF-8"?>` +
`<MDFe xmlns="http://www.portalfiscal.inf.br/mdfe">` +
  `<infMDFe Id="MDFe${chave}" versao="3.00">` +
    `<ide>` +
      `<cUF>${cuf}</cUF>` +
      `<tpAmb>${tpAmb}</tpAmb>` +
      `<tpEmit>${e.tpEmit}</tpEmit>` +
      (e.tpTransp ? `<tpTransp>${e.tpTransp}</tpTransp>` : "") +
      `<mod>58</mod>` +
      `<serie>${serieXml}</serie>` +
      `<nMDF>${nMDFXml}</nMDF>` +
      `<cMDF>${cMDF}</cMDF>` +
      `<cDV>${cdv}</cDV>` +
      `<modal>1</modal>` +
      `<dhEmi>${dhEmi}</dhEmi>` +
      `<tpEmis>1</tpEmis>` +
      `<procEmi>0</procEmi>` +
      `<verProc>1.0</verProc>` +
      `<UFIni>${input.uf_ini}</UFIni>` +
      `<UFFim>${input.uf_fim}</UFFim>` +
      infMunCarrega +
      infPercurso +
    `</ide>` +
    `<emit>` +
      `<${docTagE}>${cpfcnpjE}</${docTagE}>` +
      (e.ie ? `<IE>${esc(e.ie)}</IE>` : "") +
      `<xNome>${escLimite(e.razao_social, 60)}</xNome>` +
      `<enderEmit>` +
        `<xLgr>${escLimite(e.logradouro || "Nao informado", 60)}</xLgr>` +
        `<nro>${esc(e.numero || "S/N")}</nro>` +
        `<xBairro>${escLimite(e.bairro || "Centro", 60)}</xBairro>` +
        `<cMun>${e.municipio_ibge || "5106224"}</cMun>` +
        `<xMun>${esc(e.municipio_nome || "Nova Mutum")}</xMun>` +
        `<CEP>${(e.cep || "78450000").replace(/\D/g, "").padEnd(8, "0").slice(0, 8)}</CEP>` +
        `<UF>${e.uf || "MT"}</UF>` +
        (e.fone ? `<fone>${e.fone.replace(/\D/g, "")}</fone>` : "") +
      `</enderEmit>` +
    `</emit>` +
    `<infModal versaoModal="3.00">${rodo}</infModal>` +
    `<infDoc>${infDoc}</infDoc>` +
    // Seguro da Carga (<seg>) — obrigatório no MDF-e 3.00 pro modal rodoviário quando o
    // emitente é Prestador de Serviço de Transporte (tpEmit=1). Primeira tentativa (só
    // respSeg=1) foi rejeitada com "Dados do seguro de carga incompletos" — pra
    // rodoviário/prestador de serviço, CNPJ do responsável + nome/CNPJ da seguradora + nº
    // apólice + nº averbação são TODOS obrigatórios, não só "quem é responsável". Achado real
    // 23/09/2026 (rejeições 698 depois 699). respSeg=1 = o próprio emitente é o responsável;
    // CNPJ dele mesmo repetido aqui (schema exige o documento do responsável dentro de
    // infResp). Carga própria (tpEmit=2, transportadora do mesmo grupo sem cobrar frete de
    // terceiros) não tem essa exigência — omite o grupo inteiro nesse caso.
    (() => {
      if (e.tpEmit !== "1") return "";
      const cnpjResp = e.cpf_cnpj.replace(/\D/g, "");
      const cnpjSeg = (e.seguradora_cnpj ?? "").replace(/\D/g, "");
      return `<seg>` +
        `<infResp><respSeg>1</respSeg>${cnpjResp.length === 14 ? `<CNPJ>${cnpjResp}</CNPJ>` : `<CPF>${cnpjResp}</CPF>`}</infResp>` +
        (e.seguradora_nome || cnpjSeg
          ? `<infSeg>${e.seguradora_nome ? `<xSeg>${escLimite(e.seguradora_nome, 30)}</xSeg>` : ""}${cnpjSeg ? `<CNPJ>${cnpjSeg}</CNPJ>` : ""}</infSeg>`
          : "") +
        (e.apolice_numero ? `<nApol>${esc(e.apolice_numero)}</nApol>` : "") +
        (e.averbacao_numero ? `<nAver>${esc(e.averbacao_numero)}</nAver>` : "") +
      `</seg>`;
    })() +
    prodPred +
    `<tot>` +
      (qCTe > 0 ? `<qCTe>${qCTe}</qCTe>` : "") +
      (qNFe > 0 ? `<qNFe>${qNFe}</qNFe>` : "") +
      `<vCarga>${p2(input.valor_carga)}</vCarga>` +
      `<cUnid>01</cUnid>` +
      `<qCarga>${p4(input.peso_bruto_kg)}</qCarga>` +
    `</tot>` +
  `</infMDFe>` +
`</MDFe>`;

  return { xml, chave, numero: nMDFXml };
}
