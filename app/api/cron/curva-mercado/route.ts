import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

// Meses de vencimento CME
const SOJA_MESES:  Record<number, string> = { 1:"F", 3:"H", 5:"K", 7:"N", 8:"Q", 9:"U", 11:"X" };
const MILHO_MESES: Record<number, string> = { 3:"H", 5:"K", 7:"N", 9:"U", 12:"Z" };

const MES_NUM: Record<string, number> = {
  JAN:1,FEB:2,MAR:3,APR:4,MAY:5,JUN:6,
  JUL:7,AUG:8,SEP:9,OCT:10,NOV:11,DEC:12,
};

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36";

// CME Group settlement prices — endpoint público sem autenticação
// productId: 5 = Soybeans (ZS), 2 = Corn (ZC)
async function fetchCMESettlement(
  productId: number,
  meses: Record<number, string>
): Promise<Record<string, number>> {
  const url = `https://www.cmegroup.com/CmeWS/mvc/Quotes/Settlement/${productId}/G`;
  const r = await fetch(url, {
    headers: {
      "User-Agent": UA,
      "Accept": "application/json, text/plain, */*",
      "Referer": "https://www.cmegroup.com/",
      "Origin": "https://www.cmegroup.com",
    },
    signal: AbortSignal.timeout(12000),
    cache: "no-store",
  });
  if (!r.ok) throw new Error(`CME HTTP ${r.status}`);
  const json = await r.json() as { quotes?: { expirationMonth?: string; settlement?: string; last?: string }[] };

  const result: Record<string, number> = {};
  for (const q of json?.quotes ?? []) {
    // expirationMonth: "NOV 2026" ou "NOV26" dependendo da versão da API
    const exp = (q.expirationMonth ?? "").trim();
    const rawPrice = q.settlement ?? q.last ?? "";
    const price = parseFloat(rawPrice.replace(/[^0-9.]/g, ""));
    if (!exp || !price || price <= 0) continue;

    // Suporta "NOV 2026" e "NOV26"
    const parts = exp.split(/\s+/);
    const monthStr = parts[0].slice(0, 3).toUpperCase();
    const yearStr  = (parts[1] ?? parts[0].slice(3)).replace(/\D/g, "");
    const monthNum = MES_NUM[monthStr];
    if (!monthNum || yearStr.length < 2) continue;

    const yy   = yearStr.length === 4 ? yearStr.slice(-2) : yearStr.slice(-2);
    const letra = meses[monthNum];
    if (!letra) continue;

    result[`${letra}${yy}`] = price; // e.g. "X26" → 1024.60
  }
  return result;
}

// Fallback: Yahoo Finance v8/chart (funciona para símbolos com histórico recente)
async function fetchYahooChart(symbol: string): Promise<number> {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1d&range=5d`;
  const r = await fetch(url, {
    headers: { "User-Agent": UA },
    signal: AbortSignal.timeout(10000),
    cache: "no-store",
  });
  if (!r.ok) throw new Error(`Yahoo HTTP ${r.status}`);
  const json = await r.json() as { chart?: { result?: { meta?: { regularMarketPrice?: number } }[] } };
  return json?.chart?.result?.[0]?.meta?.regularMarketPrice ?? 0;
}

export async function GET(req: NextRequest) {
  const secret = req.headers.get("authorization")?.replace("Bearer ", "");
  if (process.env.CRON_SECRET && secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const hoje   = new Date().toISOString().slice(0, 10);
  const inicio = Date.now();
  console.log("[curva-mercado] inicio", { hoje });

  // Limpa dados globais de hoje antes de reinserir
  await sb.from("curva_mercado")
    .delete()
    .is("fazenda_id", null)
    .eq("data_referencia", hoje)
    .in("fonte", ["CME", "YAHOO", "BARCHART"]);

  let inseridos = 0;
  const erros:      string[] = [];
  const semCotacao: string[] = [];

  // === Tenta CME Group Settlement (primary) ===
  let sojaPrecos: Record<string, number>  = {};
  let milhoPrecos: Record<string, number> = {};
  let fonte = "CME";

  try {
    [sojaPrecos, milhoPrecos] = await Promise.all([
      fetchCMESettlement(5, SOJA_MESES),
      fetchCMESettlement(2, MILHO_MESES),
    ]);
    console.log("[curva-mercado] CME soja:", Object.keys(sojaPrecos).length, "milho:", Object.keys(milhoPrecos).length);
  } catch (e) {
    console.log("[curva-mercado] CME falhou, tentando Yahoo:", String(e));
    erros.push(`CME: ${String(e)}`);

    // Fallback: Yahoo v8/chart para frente contínua
    fonte = "YAHOO";
    try {
      const [sojaPx, milhoPx] = await Promise.all([
        fetchYahooChart("ZS=F"),
        fetchYahooChart("ZC=F"),
      ]);
      if (sojaPx > 0)  sojaPrecos["ZS"]  = sojaPx;  // vencimento especial para contínuo
      if (milhoPx > 0) milhoPrecos["ZC"] = milhoPx;
    } catch (e2) {
      erros.push(`Yahoo fallback: ${String(e2)}`);
    }
  }

  // Insere soja
  for (const [venc, preco] of Object.entries(sojaPrecos)) {
    const { error } = await sb.from("curva_mercado").insert({
      fazenda_id:      null,
      instrumento:     "CBOT_SOJA",
      vencimento:      venc,
      data_referencia: hoje,
      valor:           preco,
      unidade:         "cents_bu",
      fonte,
      boletim:         "fechamento",
    });
    if (error) erros.push(`SOJA ${venc}: ${error.message}`);
    else inseridos++;
  }

  // Insere milho
  for (const [venc, preco] of Object.entries(milhoPrecos)) {
    const { error } = await sb.from("curva_mercado").insert({
      fazenda_id:      null,
      instrumento:     "CBOT_MILHO",
      vencimento:      venc,
      data_referencia: hoje,
      valor:           preco,
      unidade:         "cents_bu",
      fonte,
      boletim:         "fechamento",
    });
    if (error) erros.push(`MILHO ${venc}: ${error.message}`);
    else inseridos++;
  }

  if (Object.keys(sojaPrecos).length === 0 && Object.keys(milhoPrecos).length === 0) {
    semCotacao.push("todas");
  }

  const resultado = {
    ok:        erros.length === 0 && inseridos > 0,
    data:      hoje,
    fonte,
    inseridos,
    soja:      Object.keys(sojaPrecos).length,
    milho:     Object.keys(milhoPrecos).length,
    semCotacao,
    erros,
    duracaoMs: Date.now() - inicio,
  };
  console.log("[curva-mercado] fim", resultado);
  return NextResponse.json(resultado);
}
