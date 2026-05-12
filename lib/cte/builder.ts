/**
 * lib/cte/builder.ts
 * Gera o XML do CT-e 3.00 (modal rodoviário, frota própria).
 * Namespace: http://www.portalfiscal.inf.br/cte
 * Modelo 57 — série/número configuráveis via configuracoes_modulo.
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
  componentes:      Array<{ nome: string; valor: number }>;  // ex: [{nome:"Frete Peso", valor:1500}]
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
  nfe_chave?:       string;   // chave da NF-e documentada
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

// ── cDV — módulo 11 (mesmo algoritmo da NF-e) ─────────────────────────────────
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
const p3 = (n: number) => n.toFixed(3);
const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function xmlEndereco(tag: string, p: ParticipanteCTe): string {
  if (!p.logradouro) return "";
  return `<${tag}>
    <xLgr>${esc(p.logradouro)}</xLgr>
    <nro>${esc(p.numero ?? "S/N")}</nro>
    <xBairro>${esc(p.bairro ?? "")}</xBairro>
    <cMun>${p.municipio_ibge ?? "0000000"}</cMun>
    <xMun>${esc(p.municipio_nome ?? "")}</xMun>
    ${p.cep ? `<CEP>${p.cep.replace(/\D/g, "")}</CEP>` : ""}
    <UF>${p.uf ?? ""}</UF>
    ${p.fone ? `<fone>${p.fone.replace(/\D/g, "")}</fone>` : ""}
  </${tag}>`;
}

function xmlParticipante(tag: string, p: ParticipanteCTe, endTag: string): string {
  const cpfcnpj = (p.cpf_cnpj ?? "").replace(/\D/g, "");
  const docTag  = cpfcnpj.length === 14 ? "CNPJ" : "CPF";
  return `<${tag}>
    ${cpfcnpj ? `<${docTag}>${cpfcnpj}</${docTag}>` : "<CNPJ/>"}
    ${p.ie   ? `<IE>${esc(p.ie)}</IE>` : ""}
    <xNome>${esc(p.nome)}</xNome>
    ${p.fone ? `<fone>${p.fone.replace(/\D/g, "")}</fone>` : ""}
    ${xmlEndereco(endTag, p)}
  </${tag}>`;
}

// ── Builder principal ─────────────────────────────────────────────────────────
export function buildCTe(input: CTeInput): CTeBuiltResult {
  const { emitente: e } = input;

  const cuf    = CUF[e.uf] ?? "51";
  const tpAmb  = e.ambiente === "producao" ? "1" : "2";
  const serie  = e.serie.padStart(3, "0");
  const nCT    = String(e.numero_cte).padStart(9, "0");
  const aamm   = new Date().toISOString().slice(2, 4) + new Date().toISOString().slice(5, 7);
  const cpfcnpjE = e.cpf_cnpj.replace(/\D/g, "");
  const docTagE  = cpfcnpjE.length === 14 ? "CNPJ" : "CPF";
  const cCT    = gerarCCT();

  // Chave 44 = cUF(2)+AAMM(4)+CNPJ/CPF(14)+mod(2)+serie(3)+nCT(9)+tpEmis(1)+cCT(8)+cDV(1)
  const key43 = `${cuf}${aamm}${cpfcnpjE.padStart(14,"0")}57${serie}${nCT}1${cCT}`;
  const cdv   = calcCDV(key43);
  const chave = key43 + cdv;

  const dhEmi = new Date().toISOString().replace("Z", "-04:00");
  const baseCalc = p2(input.valor_prestacao);
  const valorICMS = p2(input.valor_prestacao * input.aliquota_icms / 100);

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<CTe xmlns="http://www.portalfiscal.inf.br/cte" versao="3.00">
  <infCte Id="CTe${chave}" versao="3.00">
    <ide>
      <cUF>${cuf}</cUF>
      <cCT>${cCT}</cCT>
      <CFOP>${input.cfop.replace(/\D/g, "")}</CFOP>
      <natOp>${esc(input.natureza)}</natOp>
      <mod>57</mod>
      <serie>${serie}</serie>
      <nCT>${nCT}</nCT>
      <dhEmi>${dhEmi}</dhEmi>
      <tpImp>1</tpImp>
      <tpEmis>1</tpEmis>
      <cDV>${cdv}</cDV>
      <tpAmb>${tpAmb}</tpAmb>
      <tpCTe>0</tpCTe>
      <procEmi>0</procEmi>
      <verProc>3.00</verProc>
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
      <toma3>
        <toma>${input.tomador_tipo}</toma>
      </toma3>
    </ide>
    ${input.observacao ? `<compl><xObs>${esc(input.observacao)}</xObs></compl>` : ""}
    <emit>
      <${docTagE}>${cpfcnpjE}</${docTagE}>
      <IE>${esc(e.ie)}</IE>
      <xNome>${esc(e.razao_social)}</xNome>
      <enderEmit>
        <xLgr>${esc(e.logradouro)}</xLgr>
        <nro>${esc(e.numero)}</nro>
        <xBairro>${esc(e.bairro)}</xBairro>
        <cMun>${e.municipio_ibge}</cMun>
        <xMun>${esc(e.municipio_nome)}</xMun>
        <CEP>${e.cep.replace(/\D/g, "")}</CEP>
        <UF>${e.uf}</UF>
        ${e.fone ? `<fone>${e.fone.replace(/\D/g, "")}</fone>` : ""}
      </enderEmit>
      <CRT>${e.crt}</CRT>
    </emit>
    ${xmlParticipante("rem", input.remetente, "enderReme")}
    ${xmlParticipante("dest", input.destinatario, "enderDest")}
    <vPrest>
      <vTPrest>${p2(input.valor_prestacao)}</vTPrest>
      <vRec>${p2(input.valor_receber)}</vRec>
      ${input.componentes.map(c => `<Comp><xNome>${esc(c.nome)}</xNome><vComp>${p2(c.valor)}</vComp></Comp>`).join("\n      ")}
    </vPrest>
    <imp>
      <ICMS>
        ${input.aliquota_icms > 0 ? `<ICMS00>
          <CST>00</CST>
          <vBC>${baseCalc}</vBC>
          <pICMS>${p2(input.aliquota_icms)}</pICMS>
          <vICMS>${valorICMS}</vICMS>
        </ICMS00>` : `<ICMS45><CST>45</CST></ICMS45>`}
      </ICMS>
      <vTotTrib>0.00</vTotTrib>
    </imp>
    <infCTeNorm>
      <infCarga>
        <vCarga>${p2(input.valor_mercadoria)}</vCarga>
        <proPred>${esc(input.produto_descricao)}</proPred>
        ${input.ncm ? `<xOutCat>${input.ncm}</xOutCat>` : ""}
        <infQ>
          <cUnid>01</cUnid>
          <tpMed>PESO BRUTO</tpMed>
          <qCarga>${p3(input.peso_bruto_kg)}</qCarga>
        </infQ>
        <infQ>
          <cUnid>01</cUnid>
          <tpMed>PESO LIQUIDO</tpMed>
          <qCarga>${p3(input.peso_liquido_kg)}</qCarga>
        </infQ>
      </infCarga>
      ${input.nfe_chave ? `<infDoc>
        <infNFe>
          <chave>${input.nfe_chave.replace(/\D/g, "")}</chave>
        </infNFe>
      </infDoc>` : ""}
      <infModal versaoModal="3.00">
        <rodo>
          <RNTRC>${e.rntrc}</RNTRC>
          <veic>
            <placa>${input.veiculo_placa.replace(/[^A-Z0-9]/gi, "").toUpperCase()}</placa>
            ${input.veiculo_renavam ? `<RENAVAM>${input.veiculo_renavam}</RENAVAM>` : ""}
            <tpVeic>06</tpVeic>
            <tpRod>04</tpRod>
            <tpCar>00</tpCar>
            <UF>${e.uf}</UF>
            <condutor>
              <xNome>${esc(input.motorista_nome)}</xNome>
              <CPF>${input.motorista_cpf.replace(/\D/g, "")}</CPF>
            </condutor>
          </veic>
        </rodo>
      </infModal>
    </infCTeNorm>
  </infCte>
</CTe>`;

  return { xml, chave, numero: nCT };
}
