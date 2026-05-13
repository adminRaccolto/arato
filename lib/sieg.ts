/**
 * lib/sieg.ts
 * Cliente da API Sieg DFe Monitor.
 * POST https://api.sieg.com/BaixarXmls?api_key=<KEY>
 * Retorna array de documentos com XML em Base64.
 * Paginação por Skip/Take (max 50 por página). Rate limit: 20 req/min.
 */

const SIEG_BASE = "https://api.sieg.com";

// ─── Tipos internos ───────────────────────────────────────────────────────────

export interface SiegBaixarParams {
  XmlType:           1 | 2 | 3 | 4; // 1=NFe 2=CTe 3=NFSe 4=NFCe
  Take?:             number;          // max 50
  Skip?:             number;
  DataEmissaoInicio: string;          // ISO "YYYY-MM-DD" ou datetime
  DataEmissaoFim?:   string;
  CnpjDest?:         string;          // CNPJ destinatário (filtra documentos recebidos)
  CnpjEmit?:         string;
  Downloadevent?:    boolean;
}

// ─── Extração de tags XML (servidor) ─────────────────────────────────────────

function tagVal(xml: string, tag: string): string {
  const m = xml.match(new RegExp(`<${tag}(?:\\s[^>]*)?>([^<]*)</${tag}>`));
  return m ? m[1].trim() : "";
}

function blockOf(xml: string, tag: string): string {
  const m = xml.match(new RegExp(`<${tag}(?:\\s[^>]*)?>[\\s\\S]*?</${tag}>`));
  return m ? m[0] : "";
}

// ─── Parser NF-e ─────────────────────────────────────────────────────────────

export interface NFeParseResult {
  chave:              string;
  numero:             string;
  serie:              string;
  data_emissao:       string; // YYYY-MM-DD
  natureza:           string;
  cnpj_emitente:      string;
  nome_emitente:      string;
  ie_emitente:        string;
  cnpj_destinatario:  string;
  nome_destinatario:  string;
  valor_total:        number;
  cfop:               string;
  itens:              NFeItemParsed[];
}

export interface NFeItemParsed {
  num:            number;
  codigo:         string;
  descricao:      string;
  ncm:            string;
  cfop:           string;
  unidade:        string;
  quantidade:     number;
  valor_unitario: number;
  valor_total:    number;
}

export function parseNFeXml(xml: string): NFeParseResult | null {
  try {
    // Chave de acesso — 44 dígitos no atributo Id
    const idMatch = xml.match(/Id=["']NFe(\d{44})["']/);
    if (!idMatch) return null;
    const chave = idMatch[1];

    const numero  = tagVal(xml, "nNF");
    const serie   = tagVal(xml, "serie");
    const dhEmi   = tagVal(xml, "dhEmi");
    const data_emissao = dhEmi ? dhEmi.slice(0, 10) : "";
    const natureza = tagVal(xml, "natOp");
    const cfop     = tagVal(xml, "CFOP"); // primeiro CFOP encontrado

    const emitBlock = blockOf(xml, "emit");
    const cnpj_emitente  = tagVal(emitBlock, "CNPJ") || tagVal(emitBlock, "CPF");
    const nome_emitente  = tagVal(emitBlock, "xNome");
    const ie_emitente    = tagVal(emitBlock, "IE");

    const destBlock = blockOf(xml, "dest");
    const cnpj_destinatario = tagVal(destBlock, "CNPJ") || tagVal(destBlock, "CPF");
    const nome_destinatario = tagVal(destBlock, "xNome");

    const valor_total = parseFloat(tagVal(xml, "vNF") || "0");

    // Itens — <det nItem="N">
    const detRe = /<det\s+nItem="(\d+)">([\s\S]*?)<\/det>/g;
    const itens: NFeItemParsed[] = [];
    let m;
    while ((m = detRe.exec(xml)) !== null) {
      const num  = parseInt(m[1]);
      const prod = blockOf(m[2], "prod");
      itens.push({
        num,
        codigo:         tagVal(prod, "cProd"),
        descricao:      tagVal(prod, "xProd"),
        ncm:            tagVal(prod, "NCM"),
        cfop:           tagVal(prod, "CFOP"),
        unidade:        tagVal(prod, "uCom"),
        quantidade:     parseFloat(tagVal(prod, "qCom")  || "0"),
        valor_unitario: parseFloat(tagVal(prod, "vUnCom")|| "0"),
        valor_total:    parseFloat(tagVal(prod, "vProd") || "0"),
      });
    }

    return { chave, numero, serie, data_emissao, natureza, cnpj_emitente, nome_emitente,
             ie_emitente, cnpj_destinatario, nome_destinatario, valor_total, cfop, itens };
  } catch {
    return null;
  }
}

// ─── Busca paginada de XMLs ───────────────────────────────────────────────────

export async function baixarXmlsSieg(
  apiKey:  string,
  params:  Omit<SiegBaixarParams, "Take" | "Skip">
): Promise<string[]> {
  const xmls: string[] = [];
  let skip = 0;
  const take = 50;

  for (let page = 0; page < 100; page++) {    // limite de segurança: 5.000 docs
    const body = { ...params, Take: take, Skip: skip, Downloadevent: false };

    const res = await fetch(`${SIEG_BASE}/BaixarXmls?api_key=${encodeURIComponent(apiKey)}`, {
      method:  "POST",
      headers: { "Content-Type": "application/json", "APIKey": apiKey },
      body:    JSON.stringify(body),
    });

    if (!res.ok) {
      const txt = await res.text();
      throw new Error(`Sieg API HTTP ${res.status}: ${txt.slice(0, 200)}`);
    }

    const data = await res.json() as unknown[];
    if (!Array.isArray(data) || data.length === 0) break;

    for (const item of data) {
      if (typeof item !== "object" || !item) continue;
      const obj = item as Record<string, unknown>;
      // Sieg pode retornar o campo em diferentes capitalizações
      const b64 = String(
        obj.XML ?? obj.xml ?? obj.XmlBase64 ?? obj.xmlBase64 ?? obj.Xml ?? ""
      );
      if (!b64) continue;
      try {
        const decoded = Buffer.from(b64, "base64").toString("utf-8");
        xmls.push(decoded);
      } catch { /* ignora item malformado */ }
    }

    if (data.length < take) break; // última página
    skip += take;
  }

  return xmls;
}
