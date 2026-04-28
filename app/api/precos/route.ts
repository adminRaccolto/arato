import { NextResponse } from "next/server";

// Cache em memória — reduzido para polling quasi-realtime
// Yahoo Finance publica cotações com ~15 min de atraso para futures sem assinatura.
// Com polling de 30s no cliente, captamos cada nova publicação assim que sai.
let cache: { data: PrecosData; ts: number } | null = null;
const CACHE_TTL = 30 * 1000; // 30 segundos

export interface PrecosData {
  usdBrl:       number;          // Dólar Spot (taxa comercial)
  usdPtax:      number | null;   // Dólar PTAX (Banco Central — publicado ~13h em dias úteis)
  soja:         { cbot: number; brl: number; variacao: number; fonte: "CBOT" };
  milho:        { cbot: number; brl: number; variacao: number; fonte: "B3" | "CBOT" };
  algodao:      { cbot: number; brl: number; variacao: number; fonte: "CBOT" };
  atualizadoEm: string;
  erro?:        string;
}

// Conversão CBOT → R$/sc (60 kg)
// Soja:   1 bushel = 60 lbs = 27,2155 kg  → 1 sc = 60/27,2155 = 2,2046 bushels
// Milho:  1 bushel = 56 lbs = 25,4012 kg  → 1 sc = 60/25,4012 = 2,3622 bushels
// Algodão: cotado em cents/lb              → 1 @ (15 kg) = 33,069 lbs
function cbotParaBRL(cbot_cents: number, fator: number, usd: number): number {
  return Math.round((cbot_cents / 100) * fator * usd * 100) / 100;
}

// Ticker B3 milho — contrato ativo mais próximo
// Meses ativos: Março (H), Maio (K), Julho (N), Setembro (U), Novembro (X)
function milhoB3Ticker(): string {
  const now   = new Date();
  const year  = now.getFullYear();
  const month = now.getMonth() + 1; // 1-12
  const contratos = [
    { mes: 3,  cod: "H" },
    { mes: 5,  cod: "K" },
    { mes: 7,  cod: "N" },
    { mes: 9,  cod: "U" },
    { mes: 11, cod: "X" },
  ];
  const ativo = contratos.find(c => c.mes >= month);
  if (ativo) return `CCM${ativo.cod}${String(year).slice(-2)}.SA`;
  // Depois de novembro → março do próximo ano
  return `CCMH${String(year + 1).slice(-2)}.SA`;
}

async function fetchJSON(url: string, timeout = 8000): Promise<unknown> {
  const ctrl = new AbortController();
  const id = setTimeout(() => ctrl.abort(), timeout);
  try {
    const r = await fetch(url, {
      signal: ctrl.signal,
      headers: { "User-Agent": "Mozilla/5.0" },
      next: { revalidate: 0 },
    });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.json();
  } finally {
    clearTimeout(id);
  }
}

function yahooPrice(data: unknown): { last: number; prev: number } {
  const result = (data as { chart?: { result?: unknown[] } })?.chart?.result?.[0];
  if (!result) return { last: 0, prev: 0 };
  const meta = (result as { meta?: { regularMarketPrice?: number; chartPreviousClose?: number } }).meta;
  return {
    last: meta?.regularMarketPrice ?? 0,
    prev: meta?.chartPreviousClose  ?? 0,
  };
}

function variacao(last: number, prev: number): number {
  if (!prev) return 0;
  return Math.round((last - prev) / prev * 1000) / 10; // 1 casa decimal
}

export async function GET() {
  if (cache && Date.now() - cache.ts < CACHE_TTL) {
    return NextResponse.json(cache.data);
  }

  const FATOR_SOJA    = 60 / 27.2155; // sacas/bushel
  const FATOR_MILHO   = 60 / 25.4012;
  const FATOR_ALGODAO = 15 / 0.453592; // lbs por arroba (@)
  const usdFallback   = 5.90;

  const FALLBACK: PrecosData = {
    usdBrl:       usdFallback,
    usdPtax:      null,
    soja:         { cbot: 1030, brl: cbotParaBRL(1030, FATOR_SOJA,    usdFallback), variacao: 0, fonte: "CBOT" },
    milho:        { cbot: 435,  brl: cbotParaBRL(435,  FATOR_MILHO,   usdFallback), variacao: 0, fonte: "CBOT" },
    algodao:      { cbot: 72,   brl: cbotParaBRL(72,   FATOR_ALGODAO, usdFallback), variacao: 0, fonte: "CBOT" },
    atualizadoEm: new Date().toISOString(),
    erro:         "Usando valores de fallback",
  };

  // PTAX Banco Central — tenta hoje, cai para D-1 se não publicado ainda
  async function fetchPtax(): Promise<number | null> {
    for (let delta = 0; delta <= 3; delta++) {
      const d = new Date(); d.setDate(d.getDate() - delta);
      // BCB usa MM-DD-YYYY
      const mm = String(d.getMonth() + 1).padStart(2, "0");
      const dd = String(d.getDate()).padStart(2, "0");
      const yyyy = d.getFullYear();
      const url = `https://olinda.bcb.gov.br/olinda/servico/PTAX/versao/v1/odata/CotacaoDolarDia(dataCotacao=@d)?@d='${mm}-${dd}-${yyyy}'&$top=1&$format=json&$select=cotacaoVenda`;
      try {
        const res = await fetchJSON(url, 5000);
        const val = (res as { value?: { cotacaoVenda?: number }[] })?.value?.[0]?.cotacaoVenda;
        if (val && val > 0) return Math.round(val * 10000) / 10000;
      } catch { /* try previous day */ }
    }
    return null;
  }

  try {
    const b3MilhoTicker = milhoB3Ticker();

    const [cambioRes, sojaRes, milhoCbotRes, algodaoRes, milhoB3Res, ptaxRes] = await Promise.allSettled([
      fetchJSON("https://economia.awesomeapi.com.br/json/last/USD-BRL"),
      fetchJSON("https://query1.finance.yahoo.com/v8/finance/chart/ZS=F?interval=1d&range=5d"),
      fetchJSON("https://query1.finance.yahoo.com/v8/finance/chart/ZC=F?interval=1d&range=5d"),
      fetchJSON("https://query1.finance.yahoo.com/v8/finance/chart/CT=F?interval=1d&range=5d"),
      fetchJSON(`https://query1.finance.yahoo.com/v8/finance/chart/${b3MilhoTicker}?interval=1d&range=5d`),
      fetchPtax(),
    ]);

    // Dólar Spot (taxa comercial)
    let usdBrl = usdFallback;
    if (cambioRes.status === "fulfilled") {
      const bid = (cambioRes.value as { USDBRL?: { bid?: string } })?.USDBRL?.bid;
      if (bid) usdBrl = Math.round(parseFloat(bid) * 100) / 100;
    }

    // Dólar PTAX (Banco Central)
    const usdPtax: number | null = ptaxRes.status === "fulfilled" ? ptaxRes.value : null;

    // Commodities
    const sojaPrices      = sojaRes.status      === "fulfilled" ? yahooPrice(sojaRes.value)      : { last: 0, prev: 0 };
    const milhoCbotPrices = milhoCbotRes.status  === "fulfilled" ? yahooPrice(milhoCbotRes.value) : { last: 0, prev: 0 };
    const milhoB3Prices   = milhoB3Res.status    === "fulfilled" ? yahooPrice(milhoB3Res.value)   : { last: 0, prev: 0 };
    const algodaoPrices   = algodaoRes.status    === "fulfilled" ? yahooPrice(algodaoRes.value)   : { last: 0, prev: 0 };

    // Milho: usa B3 se disponível e válido; senão cai no CBOT convertido
    const milhoB3Valido = milhoB3Prices.last > 10;
    const milhoFonte: "B3" | "CBOT" = milhoB3Valido ? "B3" : "CBOT";
    const milhoBrl = milhoB3Valido
      ? Math.round(milhoB3Prices.last * 100) / 100
      : cbotParaBRL(milhoCbotPrices.last, FATOR_MILHO, usdBrl);
    const milhoVar = milhoB3Valido
      ? variacao(milhoB3Prices.last, milhoB3Prices.prev)
      : variacao(milhoCbotPrices.last, milhoCbotPrices.prev);

    const data: PrecosData = {
      usdBrl,
      usdPtax,
      soja: {
        cbot:     Math.round(sojaPrices.last * 10) / 10,
        brl:      cbotParaBRL(sojaPrices.last, FATOR_SOJA, usdBrl),
        variacao: variacao(sojaPrices.last, sojaPrices.prev),
        fonte:    "CBOT",
      },
      milho: {
        cbot:     Math.round(milhoCbotPrices.last * 10) / 10,
        brl:      milhoBrl,
        variacao: milhoVar,
        fonte:    milhoFonte,
      },
      algodao: {
        cbot:     Math.round(algodaoPrices.last * 10) / 10,
        brl:      cbotParaBRL(algodaoPrices.last, FATOR_ALGODAO, usdBrl),
        variacao: variacao(algodaoPrices.last, algodaoPrices.prev),
        fonte:    "CBOT",
      },
      atualizadoEm: new Date().toISOString(),
    };

    cache = { data, ts: Date.now() };
    return NextResponse.json(data);
  } catch {
    return NextResponse.json(FALLBACK);
  }
}
