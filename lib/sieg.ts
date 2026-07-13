import AdmZip from "adm-zip";

/**
 * lib/sieg.ts
 * Cliente da API Sieg DFe Monitor v1 — autenticação JWT.
 *
 * Fluxo:
 *   1. POST /api/v1/create-jwt  (X-Secret-Key + X-Client-Id) → Bearer JWT
 *   2. POST /api/v1/baixar-xmls (Bearer + X-API-Key + X-Secret-Key + X-Client-Id)
 *
 * Credenciais (env vars):
 *   SIEG_API_KEY     → X-API-Key
 *   SIEG_SECRET_KEY  → X-Secret-Key
 *   SIEG_CLIENTE_ID  → X-Client-Id
 */

const SIEG_BASE = "https://api.sieg.com/api/v1";

// ─── Credenciais ──────────────────────────────────────────────────────────────

export interface SiegCredentials {
  apiKey:    string;   // X-API-Key
  secretKey: string;   // X-Secret-Key
  clienteId: string;   // X-Client-Id
}

/** Lê as 3 credenciais das variáveis de ambiente globais. */
export function credenciaisEnv(): SiegCredentials {
  return {
    apiKey:    (process.env.SIEG_API_KEY    ?? "").trim(),
    secretKey: (process.env.SIEG_SECRET_KEY ?? "").trim(),
    clienteId: (process.env.SIEG_CLIENTE_ID ?? "").trim(),
  };
}

/** Verifica se as credenciais estão completas. */
export function credenciaisValidas(c: SiegCredentials): boolean {
  return !!(c.apiKey && c.secretKey && c.clienteId);
}

// ─── JWT — cache em memória (warm lambda) ─────────────────────────────────────

let _jwtToken  = "";
let _jwtExpiry = 0;

async function getJwt(creds: SiegCredentials): Promise<string> {
  if (_jwtToken && Date.now() < _jwtExpiry) return _jwtToken;

  const res = await fetch(`${SIEG_BASE}/create-jwt`, {
    method:  "POST",
    headers: {
      "accept":         "application/json",
      "Content-Length": "0",   // SIEG exige Content-Length mesmo com body vazio (HTTP 411 sem ele)
      "X-Secret-Key":   creds.secretKey,
      "X-Client-Id":    creds.clienteId,
    },
    body: "",
  });

  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`SIEG create-jwt HTTP ${res.status}: ${txt.slice(0, 300)}`);
  }

  const data = await res.json() as unknown;
  // A resposta pode ser a string diretamente ou { token: "..." }
  const raw  = typeof data === "string"
    ? data
    : (data as Record<string, string>).token
      ?? (data as Record<string, string>).Token
      ?? JSON.stringify(data);

  _jwtToken  = raw.trim().replace(/^["']|["']$/g, ""); // remove aspas acidentais
  _jwtExpiry = Date.now() + 23 * 60 * 60 * 1000;       // 23 h (JWT válido 24 h)
  return _jwtToken;
}

// ─── Headers padrão para as chamadas autenticadas ────────────────────────────

function authHeaders(creds: SiegCredentials, jwt: string): Record<string, string> {
  return {
    "accept":          "application/json",
    "Content-Type":    "application/json",
    "Authorization":   `Bearer ${jwt}`,
    "X-API-Key":       creds.apiKey,
    "X-Secret-Key":    creds.secretKey,
    "X-Client-Id":     creds.clienteId,
  };
}

// ─── Parâmetros da API v1 ─────────────────────────────────────────────────────

export interface SiegBaixarParams {
  TipoXml:             1 | 2 | 3 | 4; // 1=NF-e 2=CT-e 3=NFS-e 4=NFC-e
  Take?:               number;         // máx 50 por página
  Skip?:               number;
  DataEmissaoInicio?:  string;         // ISO datetime
  DataEmissaoFim?:     string;
  DataUploadInicio?:   string;
  DataUploadFim?:      string;
  CnpjDest?:           string;
  CnpjEmit?:           string;
  CnpjRem?:            string;
  CnpjTom?:            string;
  Tag?:                string;
  BaixarEventos?:      boolean;
  TipoEvento?:         number;
  Valor?:              number;
  IntervaloValorNota?: number;
}

// ─── Extração de tags XML ─────────────────────────────────────────────────────

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
    const idMatch = xml.match(/Id=["']NFe(\d{44})["']/);
    if (!idMatch) return null;
    const chave = idMatch[1];

    const numero       = tagVal(xml, "nNF");
    const serie        = tagVal(xml, "serie");
    const dhEmi        = tagVal(xml, "dhEmi");
    const data_emissao = dhEmi ? dhEmi.slice(0, 10) : "";
    const natureza     = tagVal(xml, "natOp");
    const cfop         = tagVal(xml, "CFOP");

    const emitBlock         = blockOf(xml, "emit");
    const cnpj_emitente     = tagVal(emitBlock, "CNPJ") || tagVal(emitBlock, "CPF");
    const nome_emitente     = tagVal(emitBlock, "xNome");
    const ie_emitente       = tagVal(emitBlock, "IE");

    const destBlock         = blockOf(xml, "dest");
    const cnpj_destinatario = tagVal(destBlock, "CNPJ") || tagVal(destBlock, "CPF");
    const nome_destinatario = tagVal(destBlock, "xNome");

    const valor_total = parseFloat(tagVal(xml, "vNF") || "0");

    const detRe = /<det\s+nItem="(\d+)">([\s\S]*?)<\/det>/g;
    const itens: NFeItemParsed[] = [];
    let m;
    while ((m = detRe.exec(xml)) !== null) {
      const prod = blockOf(m[2], "prod");
      itens.push({
        num:            parseInt(m[1]),
        codigo:         tagVal(prod, "cProd"),
        descricao:      tagVal(prod, "xProd"),
        ncm:            tagVal(prod, "NCM"),
        cfop:           tagVal(prod, "CFOP"),
        unidade:        tagVal(prod, "uCom"),
        quantidade:     parseFloat(tagVal(prod, "qCom")   || "0"),
        valor_unitario: parseFloat(tagVal(prod, "vUnCom") || "0"),
        valor_total:    parseFloat(tagVal(prod, "vProd")  || "0"),
      });
    }

    return { chave, numero, serie, data_emissao, natureza,
             cnpj_emitente, nome_emitente, ie_emitente,
             cnpj_destinatario, nome_destinatario,
             valor_total, cfop, itens };
  } catch {
    return null;
  }
}

// ─── Retry com backoff ───────────────────────────────────────────────────────

const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

/** Faz fetch com retry automático em caso de 429 (Too Many Requests). */
async function fetchComRetry(
  url: string,
  init: RequestInit,
  maxTentativas = 4,
): Promise<Response> {
  const delays = [2000, 5000, 10000, 20000]; // backoff: 2s, 5s, 10s, 20s
  let lastErr: Error | null = null;
  for (let t = 0; t < maxTentativas; t++) {
    const res = await fetch(url, init);
    if (res.status !== 429) return res;
    const retryAfter = Number(res.headers.get("Retry-After") ?? 0);
    const wait = retryAfter > 0 ? retryAfter * 1000 : (delays[t] ?? 20000);
    console.warn(`[sieg] 429 Too Many Requests — aguardando ${wait}ms antes da tentativa ${t + 2}/${maxTentativas}`);
    await sleep(wait);
    lastErr = new Error(`SIEG 429 após ${maxTentativas} tentativas`);
  }
  throw lastErr ?? new Error("SIEG 429 Too Many Requests");
}

// ─── Busca paginada de XMLs (API v1) ─────────────────────────────────────────
// A API v1 do SIEG retorna os XMLs em um arquivo ZIP (magic "PK") ou em JSON
// dependendo da versão. Detectamos o formato pelo primeiro byte da resposta.

export async function baixarXmlsSieg(
  creds:  SiegCredentials,
  params: Omit<SiegBaixarParams, "Take" | "Skip">
): Promise<string[]> {
  const jwt  = await getJwt(creds);
  const xmls: string[] = [];
  let   skip = 0;
  const take = 50;

  for (let page = 0; page < 100; page++) {   // limite: 5.000 docs
    const body = { ...params, Take: take, Skip: skip, BaixarEventos: false };

    const res = await fetchComRetry(`${SIEG_BASE}/baixar-xmls`, {
      method:  "POST",
      headers: authHeaders(creds, jwt),
      body:    JSON.stringify(body),
    });

    if (!res.ok) {
      // 404 = nenhum documento localizado nesse período — encerra paginação normalmente
      if (res.status === 404) break;
      const txt = await res.text();
      throw new Error(`SIEG baixar-xmls HTTP ${res.status}: ${txt.slice(0, 300)}`);
    }

    const buffer  = await res.arrayBuffer();
    const bytes   = new Uint8Array(buffer);
    // Assinatura ZIP: "PK" = 0x50 0x4B
    const isZip   = bytes[0] === 0x50 && bytes[1] === 0x4B;

    if (isZip) {
      // Extrai XMLs do arquivo ZIP retornado pela API v1
      const zip     = new AdmZip(Buffer.from(buffer));
      const entries = zip.getEntries();
      let   countThisPage = 0;
      for (const entry of entries) {
        if (entry.isDirectory) continue;
        if (entry.name.toLowerCase().endsWith(".xml")) {
          xmls.push(entry.getData().toString("utf-8"));
          countThisPage++;
        }
      }
      if (countThisPage < take) break; // última página
    } else {
      // JSON (formato legado ou resposta de controle)
      const text = Buffer.from(buffer).toString("utf-8");
      let raw: unknown;
      try { raw = JSON.parse(text); } catch { break; }

      if (!Array.isArray(raw) || (raw as unknown[]).length === 0) break;

      const data = raw as unknown[];
      for (const item of data) {
        if (typeof item !== "object" || !item) continue;
        const obj = item as Record<string, unknown>;
        const b64 = String(obj.Xml ?? obj.XML ?? obj.xml ?? obj.XmlBase64 ?? obj.xmlBase64 ?? "");
        if (!b64) continue;
        try { xmls.push(Buffer.from(b64, "base64").toString("utf-8")); } catch { /* ignora */ }
      }

      if (data.length < take) break;
    }

    skip += take;
    // Pausa mínima entre páginas para respeitar rate limit da API SIEG
    if (skip > 0) await sleep(300);
  }

  return xmls;
}

// ─── Manifestar por chave de acesso ──────────────────────────────────────────

export type TipoManifestacao = 0 | 1 | 2 | 3;
// 0 = Ciência da Operação
// 1 = Confirmação da Operação
// 2 = Desconhecimento da Operação
// 3 = Operação Não Realizada

export async function manifestarPorChave(
  creds:  SiegCredentials,
  params: {
    Chave:            string;
    CnpjDestinatario: string;
    Manifestacao:     TipoManifestacao;
    Justificativa?:   string;
  }
): Promise<{ ok: boolean; mensagem: string; httpStatus: number }> {
  const jwt = await getJwt(creds);
  const res = await fetch(`${SIEG_BASE}/manifestar-por-chave`, {
    method:  "POST",
    headers: authHeaders(creds, jwt),
    body:    JSON.stringify(params),
  });
  const txt = await res.text();
  let mensagem = txt;
  try {
    const obj = JSON.parse(txt) as Record<string, unknown>;
    mensagem = String(obj.Message ?? obj.message ?? obj.Mensagem ?? obj.mensagem ?? txt);
  } catch { /* usa txt */ }
  return { ok: res.ok, mensagem, httpStatus: res.status };
}

// ─── Contar XMLs disponíveis ──────────────────────────────────────────────────

export async function contarXmlsSieg(
  creds:  SiegCredentials,
  params: { CnpjDest?: string; CnpjEmit?: string; DataUploadInicio?: string; DataUploadFim?: string }
): Promise<number> {
  const jwt = await getJwt(creds);
  const res = await fetch(`${SIEG_BASE}/contar-xmls`, {
    method:  "POST",
    headers: authHeaders(creds, jwt),
    body:    JSON.stringify(params),
  });
  if (!res.ok) return 0;
  const data = await res.json() as unknown;
  if (typeof data === "number") return data;
  const obj = data as Record<string, unknown>;
  return Number(obj.Total ?? obj.total ?? obj.Count ?? obj.count ?? 0);
}

// ─── Chunked download (divide intervalos > 55 dias automaticamente) ──────────

const MAX_CHUNK_DIAS = 55; // SIEG rejeita intervalos > 2 meses; 55 dias é margem segura

/**
 * Mesma interface de baixarXmlsSieg, mas divide automaticamente intervalos longos
 * em janelas de ≤55 dias para respeitar o limite da API SIEG.
 */
export async function baixarXmlsSiegChunked(
  creds:  SiegCredentials,
  params: Omit<SiegBaixarParams, "Take" | "Skip">
): Promise<string[]> {
  const useUpload = !!(params.DataUploadInicio || params.DataUploadFim);
  const iniKey    = useUpload ? "DataUploadInicio" : "DataEmissaoInicio";
  const fimKey    = useUpload ? "DataUploadFim"    : "DataEmissaoFim";

  const iniStr = params[iniKey];
  const fimStr = params[fimKey] ?? new Date().toISOString();

  if (!iniStr) return baixarXmlsSieg(creds, params);

  const iniDate  = new Date(iniStr);
  const fimDate  = new Date(fimStr);
  const diffDias = (fimDate.getTime() - iniDate.getTime()) / 86_400_000;

  if (diffDias <= MAX_CHUNK_DIAS) return baixarXmlsSieg(creds, params);

  console.log(`[sieg] intervalo de ${Math.ceil(diffDias)} dias — particionando em chunks de ${MAX_CHUNK_DIAS} dias`);

  const xmls: string[] = [];
  let cur = new Date(iniDate);

  while (cur < fimDate) {
    const chunkFimTs = Math.min(cur.getTime() + MAX_CHUNK_DIAS * 86_400_000, fimDate.getTime());
    const chunkFim   = new Date(chunkFimTs);

    const chunkXmls = await baixarXmlsSieg(creds, {
      ...params,
      [iniKey]: cur.toISOString(),
      [fimKey]: chunkFim.toISOString(),
    });
    xmls.push(...chunkXmls);
    console.log(`[sieg] chunk ${cur.toISOString().slice(0,10)} → ${chunkFim.toISOString().slice(0,10)}: ${chunkXmls.length} XMLs`);

    cur = new Date(chunkFimTs + 1000); // próximo chunk começa 1s depois
  }

  return xmls;
}

// ─── Normaliza credencial (mantido para compatibilidade) ──────────────────────

/** @deprecated Use SiegCredentials — mantido apenas para backward compat. */
export function normalizarApiKeySieg(raw: string): string {
  let k = raw.trim();
  if (/%[0-9A-Fa-f]{2}/.test(k)) {
    try { k = decodeURIComponent(k); } catch { /* mantém original */ }
  }
  return k;
}
