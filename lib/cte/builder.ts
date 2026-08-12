/**
 * lib/cte/builder.ts
 * Gera o XML do CT-e 4.00 (modal rodoviário, frota própria).
 * Namespace: http://www.portalfiscal.inf.br/cte
 * Modelo 57 — série/número configuráveis via configuracoes_modulo.
 * CT-e 3.00 foi extinto em 31/01/2024 pela SEFAZ.
 */

export interface EmitenteCTe {
  cpf_cnpj:       string;   // CNPJ ou CPF do transportador
  razao_social:   string;
  ie:             string;
  crt:            "1" | "2" | "3" | "4";
  logradouro:     string;
  numero:         string;
  bairro:         string;
  municipio_ibge: string;
  municipio_nome: string;
  uf:             string;
  cep:            string;
  fone?:          string;
  rntrc:          string;   // Registro Nacional de Transportadores Rodoviários
  ambiente:       "producao" | "homologacao";
  serie:          string;
  numero_cte:     number;
}

export interface ParticipanteCTe {
  nome:           string;
  cpf_cnpj?:      string;
  ie?:            string;
  logradouro?:    string;
  numero?:        string;
  bairro?:        string;
  municipio_ibge?: string;
  municipio_nome?: string;
  uf?:            string;
  cep?:           string;
  fone?:          string;
}

export interface CTeInput {
  emitente:         EmitenteCTe;
  remetente:        ParticipanteCTe;
  destinatario:     ParticipanteCTe;
  municipio_ini_ibge: string;
  municipio_ini_nome: string;
  uf_ini:           string;
  municipio_fim_ibge: string;
  municipio_fim_nome: string;
  uf_fim:           string;
  cfop:             string;   // ex: "6353"
  natureza:         string;
  valor_prestacao:  number;
  valor_receber:    number;
  componentes:      Array<{ nome: string; valor: number }>;
  produto_descricao: string;
  ncm?:             string;
  peso_bruto_kg:    number;
  peso_liquido_kg:  number;
  valor_mercadoria: number;
  aliquota_icms:    number;   // ex: 12
  veiculo_placa:    string;
  veiculo_renavam?: string;
  motorista_nome:   string;
  motorista_cpf:    string;
  nfe_chave?:       string;
  tomador_tipo:     "0" | "1" | "2" | "3";  // 0=rem, 1=exped, 2=receb, 3=dest
  observacao?:      string;
}

export interface CTeBuiltResult {
  xml:   string;
  chave: string;
  numero: string;
}

// ── CUF ───────────────────────────────────────────────────────────────────────
const CUF: Record<string, string> = {
  AC:"12",AL:"27",AM:"13",AP:"16",BA:"29",CE:"23",DF:"53",ES:"32",
  GO:"52",MA:"21",MG:"31",MS:"50",MT:"51",PA:"15",PB:"25",PE:"26",
  PI:"22",PR:"41",RJ:"33",RN:"24",RO:"11",RR:"14",RS:"43",SC:"42",
  SE:"28",SP:"35",TO:"17",
};

// ── Timezone por UF (IANA) ─────────────────────────────────────────────────────
const TZ_UF: Record<string, string> = {
  AC:"America/Rio_Branco",   // UTC-5, sem DST
  AL:"America/Maceio",       // UTC-3, sem DST
  AM:"America/Manaus",       // UTC-4, sem DST
  AP:"America/Belem",        // UTC-3, sem DST
  BA:"America/Bahia",        // UTC-3, sem DST
  CE:"America/Fortaleza",    // UTC-3, sem DST
  DF:"America/Sao_Paulo",    // UTC-3, com DST
  ES:"America/Sao_Paulo",    // UTC-3, com DST
  GO:"America/Sao_Paulo",    // UTC-3, com DST
  MA:"America/Fortaleza",    // UTC-3, sem DST
  MG:"America/Sao_Paulo",    // UTC-3, com DST
  MS:"America/Campo_Grande", // UTC-4, com DST
  MT:"America/Cuiaba",       // UTC-4, sem DST (aboliu DST em 2019)
  PA:"America/Belem",        // UTC-3, sem DST
  PB:"America/Fortaleza",    // UTC-3, sem DST
  PE:"America/Recife",       // UTC-3, sem DST
  PI:"America/Fortaleza",    // UTC-3, sem DST
  PR:"America/Sao_Paulo",    // UTC-3, com DST
  RJ:"America/Sao_Paulo",    // UTC-3, com DST
  RN:"America/Fortaleza",    // UTC-3, sem DST
  RO:"America/Porto_Velho",  // UTC-4, sem DST
  RR:"America/Boa_Vista",    // UTC-4, sem DST
  RS:"America/Sao_Paulo",    // UTC-3, com DST
  SC:"America/Sao_Paulo",    // UTC-3, com DST
  SE:"America/Maceio",       // UTC-3, sem DST
  SP:"America/Sao_Paulo",    // UTC-3, com DST
  TO:"America/Araguaina",    // UTC-3, sem DST
};

// Gera dhEmi no formato YYYY-MM-DDTHH:MM:SS±HH:MM respeitando o fuso do emitente
function dhEmiParaUF(uf: string): string {
  const tz = TZ_UF[uf] ?? "America/Sao_Paulo";
  const now = new Date();
  const local = new Intl.DateTimeFormat("sv-SE", {
    timeZone: tz,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
  }).format(now).replace(" ", "T");
  // Offset real, considerando DST
  const utcMs  = now.getTime();
  const localMs = new Date(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: tz,
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
    }).format(now).replace(", ", "T")
  ).getTime();
  const diffMin = Math.round((localMs - utcMs) / 60000);
  const sign    = diffMin >= 0 ? "+" : "-";
  const abs     = Math.abs(diffMin);
  const hh      = String(Math.floor(abs / 60)).padStart(2, "0");
  const mm      = String(abs % 60).padStart(2, "0");
  return `${local}${sign}${hh}:${mm}`;
}

// ── cDV — módulo 11 ────────────────────────────────────────────────────────────
function calcCDV(key43: string): string {
  const weights = [2,3,4,5,6,7,8,9];
  let sum = 0;
  for (let i = 0; i < 43; i++) {
    sum += parseInt(key43[42 - i]) * weights[i % 8];
  }
  const rem = sum % 11;
  return String(rem < 2 ? 0 : 11 - rem);
}

function gerarCCT(): string {
  return String(Math.floor(Math.random() * 100000000)).padStart(8, "0");
}

// ── Formatadores ──────────────────────────────────────────────────────────────
const p2 = (n: number) => n.toFixed(2);
// qCarga usa TDec_1204 (4 casas decimais obrigatórias no schema CT-e 4.00)
const p4 = (n: number) => n.toFixed(4);
const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function xmlEndereco(tag: string, p: ParticipanteCTe): string {
  // enderReme/enderDest são obrigatórios no schema CT-e 4.00 — nunca omitir.
  // Usar fallbacks quando o cadastro estiver incompleto.
  const lgr  = p.logradouro    || "Não informado";
  const uf   = p.uf             || "MT";
  const cMun = p.municipio_ibge || "5106224";       // Nova Mutum como fallback de IBGE
  // xMun deve ser o NOME da cidade — nunca usar o código IBGE como nome
  const xMun = p.municipio_nome || "Nova Mutum";
  return `<${tag}>
    <xLgr>${esc(lgr)}</xLgr>
    <nro>${esc(p.numero || "S/N")}</nro>
    <xBairro>${esc(p.bairro || "Centro")}</xBairro>
    <cMun>${cMun}</cMun>
    <xMun>${esc(xMun)}</xMun>
    ${p.cep ? `<CEP>${p.cep.replace(/\D/g, "").padEnd(8, "0").slice(0, 8)}</CEP>` : ""}
    <UF>${uf}</UF>
    <cPais>1058</cPais>
    <xPais>BRASIL</xPais>
  </${tag}>`;
}

const NOME_HOMOLOGACAO = "CTE EMITIDO EM AMBIENTE DE HOMOLOGACAO - SEM VALOR FISCAL";

function xmlParticipante(tag: string, p: ParticipanteCTe, endTag: string, homologacao = false): string {
  const cpfcnpj = (p.cpf_cnpj ?? "").replace(/\D/g, "");
  const docTag  = cpfcnpj.length === 14 ? "CNPJ" : "CPF";
  const xNome   = homologacao ? NOME_HOMOLOGACAO : p.nome;
  return `<${tag}>
    ${cpfcnpj ? `<${docTag}>${cpfcnpj}</${docTag}>` : "<CNPJ/>"}
    ${p.ie   ? `<IE>${esc(p.ie)}</IE>` : ""}
    <xNome>${esc(xNome)}</xNome>
    ${p.fone ? `<fone>${p.fone.replace(/\D/g, "")}</fone>` : ""}
    ${xmlEndereco(endTag, p)}
  </${tag}>`;
}

// ── Builder principal ─────────────────────────────────────────────────────────
export function buildCTe(input: CTeInput): CTeBuiltResult {
  const { emitente: e } = input;

  const cuf   = CUF[e.uf] ?? "51";
  const tpAmb = e.ambiente === "producao" ? "1" : "2";

  const serieNum   = Number.parseInt(e.serie, 10);
  const serieXml   = String(serieNum);
  const serieChave = serieXml.padStart(3, "0");

  const nCTXml   = String(e.numero_cte);
  const nCTChave = nCTXml.padStart(9, "0");

  if (!/^(0|[1-9][0-9]{0,2})$/.test(serieXml)) {
    throw new Error(`Série inválida para CT-e: ${serieXml}`);
  }

  if (!/^[1-9][0-9]{0,8}$/.test(nCTXml)) {
    throw new Error(`Número de CT-e inválido: ${nCTXml}`);
  }

  const dhEmi = dhEmiParaUF(e.uf);
  const aamm  = dhEmi.slice(2, 4) + dhEmi.slice(5, 7);

  const cpfcnpjE = e.cpf_cnpj.replace(/\D/g, "");
  const docTagE  = cpfcnpjE.length === 14 ? "CNPJ" : "CPF";
  const cCT      = gerarCCT();

  // Chave 44 = cUF(2)+AAMM(4)+CNPJ/CPF(14)+mod(2)+serie(3)+nCT(9)+tpEmis(1)+cCT(8)+cDV(1)
  const key43 =
    `${cuf}${aamm}${cpfcnpjE.padStart(14, "0")}57` +
    `${serieChave}${nCTChave}1${cCT}`;

  const cdv   = calcCDV(key43);
  const chave = key43 + cdv;

  // ── indIEToma — calculado a partir do participante que é o tomador ──────────
  const tomador =
    input.tomador_tipo === "0"
      ? input.remetente
      : input.tomador_tipo === "3"
        ? input.destinatario
        : undefined;

  if (!tomador) {
    throw new Error(
      "Tomador 1 ou 2 exige os dados do expedidor ou recebedor, ainda não existentes no CTeInput"
    );
  }

  const ieTomador = tomador.ie?.trim().toUpperCase();

  const indIEToma: "1" | "2" | "9" =
    !ieTomador
      ? "9"
      : ieTomador === "ISENTO"
        ? "2"
        : "1";

  const baseCalc  = p2(input.valor_prestacao);
  const valorICMS = p2(input.valor_prestacao * input.aliquota_icms / 100);

  const naturezaOp = input.natureza.trim().slice(0, 60);
  if (!naturezaOp) throw new Error("Natureza da operação não pode ser vazia");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<CTe xmlns="http://www.portalfiscal.inf.br/cte">
  <infCte Id="CTe${chave}" versao="4.00">
    <ide>
      <cUF>${cuf}</cUF>
      <cCT>${cCT}</cCT>
      <CFOP>${input.cfop.replace(/\D/g, "")}</CFOP>
      <natOp>${esc(naturezaOp)}</natOp>
      <mod>57</mod>
      <serie>${serieXml}</serie>
      <nCT>${nCTXml}</nCT>
      <dhEmi>${dhEmi}</dhEmi>
      <tpImp>1</tpImp>
      <tpEmis>1</tpEmis>
      <cDV>${cdv}</cDV>
      <tpAmb>${tpAmb}</tpAmb>
      <tpCTe>0</tpCTe>
      <procEmi>0</procEmi>
      <verProc>4.00</verProc>
      <cMunEnv>${e.municipio_ibge}</cMunEnv>
      <xMunEnv>${esc(e.municipio_nome)}</xMunEnv>
      <UFEnv>${e.uf}</UFEnv>
      <modal>01</modal>
      <tpServ>0</tpServ>
      <cMunIni>${input.municipio_ini_ibge}</cMunIni>
      <xMunIni>${esc(input.municipio_ini_nome)}</xMunIni>
      <UFIni>${input.uf_ini}</UFIni>
      <cMunFim>${input.municipio_fim_ibge}</cMunFim>
      <xMunFim>${esc(input.municipio_fim_nome)}</xMunFim>
      <UFFim>${input.uf_fim}</UFFim>
      <retira>0</retira>
      <indIEToma>${indIEToma}</indIEToma>
      <toma3>
        <toma>${input.tomador_tipo}</toma>
      </toma3>
    </ide>
    ${input.observacao && input.observacao.trim().length >= 15 ? `<compl><xObs>${esc(input.observacao.trim().slice(0, 2000))}</xObs></compl>` : ""}
    <emit>
      <${docTagE}>${cpfcnpjE}</${docTagE}>
      ${e.ie ? `<IE>${esc(e.ie)}</IE>` : "<IE>ISENTO</IE>"}
      <xNome>${esc(e.razao_social)}</xNome>
      <enderEmit>
        <xLgr>${esc(e.logradouro || "Não informado")}</xLgr>
        <nro>${esc(e.numero || "S/N")}</nro>
        <xBairro>${esc(e.bairro || "Centro")}</xBairro>
        <cMun>${e.municipio_ibge || "5106224"}</cMun>
        <xMun>${esc(e.municipio_nome || "Nova Mutum")}</xMun>
        <CEP>${(e.cep || "78450000").replace(/\D/g, "").padEnd(8, "0").slice(0, 8)}</CEP>
        <UF>${e.uf || "MT"}</UF>
        ${e.fone ? `<fone>${e.fone.replace(/\D/g, "")}</fone>` : ""}
      </enderEmit>
      <CRT>${e.crt}</CRT>
    </emit>
    ${xmlParticipante("rem", input.remetente, "enderReme", tpAmb === "2")}
    ${xmlParticipante("dest", input.destinatario, "enderDest", tpAmb === "2")}
    <vPrest>
      <vTPrest>${p2(input.valor_prestacao)}</vTPrest>
      <vRec>${p2(input.valor_receber)}</vRec>
      ${input.componentes.map(c => `<Comp><xNome>${esc(c.nome.slice(0, 15))}</xNome><vComp>${p2(c.valor)}</vComp></Comp>`).join("\n      ")}
    </vPrest>
    <imp>
      <ICMS>
        ${input.aliquota_icms > 0 ? `<ICMS00>
          <CST>00</CST>
          <vBC>${baseCalc}</vBC>
          <pICMS>${p2(input.aliquota_icms)}</pICMS>
          <vICMS>${valorICMS}</vICMS>
        </ICMS00>` : `<ICMS40><CST>40</CST></ICMS40>`}
      </ICMS>
      <vTotTrib>0.00</vTotTrib>
    </imp>
    <infCTeNorm>
      <infCarga>
        <vCarga>${p2(input.valor_mercadoria)}</vCarga>
        <proPred>${esc((input.produto_descricao || "CARGA AGRICOLA").trim().slice(0, 60) || "CARGA AGRICOLA")}</proPred>
        ${input.ncm ? `<xOutCat>${input.ncm}</xOutCat>` : ""}
        <infQ>
          <cUnid>01</cUnid>
          <tpMed>PESO BRUTO</tpMed>
          <qCarga>${p4(input.peso_bruto_kg)}</qCarga>
        </infQ>
        <infQ>
          <cUnid>01</cUnid>
          <tpMed>PESO LIQUIDO</tpMed>
          <qCarga>${p4(input.peso_liquido_kg)}</qCarga>
        </infQ>
      </infCarga>
      ${input.nfe_chave ? `<infDoc>
        <infNFe>
          <chave>${input.nfe_chave.replace(/\D/g, "")}</chave>
        </infNFe>
      </infDoc>` : ""}
      <infModal versaoModal="4.00">
        <rodo>
          <RNTRC>${e.rntrc || "ISENTO"}</RNTRC>
        </rodo>
      </infModal>
    </infCTeNorm>
  </infCte>
</CTe>`;

  // Compacta ANTES de retornar — SEFAZ-MT rejeita whitespace entre tags após descompressão do gzip.
  // Compactar pré-assinatura preserva o digest; pós-assinatura quebraria o canonical form.
  const xmlCompact = xml.replace(/>\s+</g, "><").trim();

  return { xml: xmlCompact, chave, numero: nCTXml };
}
