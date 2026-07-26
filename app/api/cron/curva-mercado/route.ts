import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

// Meses de vencimento CME por cultura
const SOJA_MESES:  Record<number, string> = { 1:"F", 3:"H", 5:"K", 7:"N", 8:"Q", 9:"U", 11:"X" };
const MILHO_MESES: Record<number, string> = { 3:"H", 5:"K", 7:"N", 9:"U", 12:"Z" };

interface Simbolo { yahoo: string; instrumento: string; vencimento: string; }

function gerarSimbolos(): Simbolo[] {
  const now  = new Date();
  const res: Simbolo[] = [];
  const seen = new Set<string>();

  for (let i = 0; i <= 18; i++) {
    const d   = new Date(now.getFullYear(), now.getMonth() + i, 1);
    const mes = d.getMonth() + 1;
    const yy  = String(d.getFullYear()).slice(-2);

    const letraSoja = SOJA_MESES[mes];
    if (letraSoja) {
      const venc = `${letraSoja}${yy}`;
      if (!seen.has(`S${venc}`)) {
        seen.add(`S${venc}`);
        res.push({ yahoo: `ZS${venc}=F`, instrumento: "CBOT_SOJA", vencimento: venc });
      }
    }

    const letraMilho = MILHO_MESES[mes];
    if (letraMilho) {
      const venc = `${letraMilho}${yy}`;
      if (!seen.has(`C${venc}`)) {
        seen.add(`C${venc}`);
        res.push({ yahoo: `ZC${venc}=F`, instrumento: "CBOT_MILHO", vencimento: venc });
      }
    }
  }

  return res;
}

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

// Obtém crumb + cookie para autenticar no Yahoo Finance v7
async function getYahooCrumb(): Promise<{ crumb: string; cookies: string } | null> {
  try {
    const res1 = await fetch("https://fc.yahoo.com", {
      headers: { "User-Agent": UA },
      redirect: "follow",
      signal: AbortSignal.timeout(8000),
      cache: "no-store",
    });
    const rawCookies: string[] = [];
    // Headers.getSetCookie() retorna array; fallback para get() se não disponível
    const setCookie = res1.headers.get("set-cookie") ?? "";
    if (setCookie) rawCookies.push(...setCookie.split(/,(?=[^;]+=[^;]+)/));
    const cookies = rawCookies.map(c => c.split(";")[0]).join("; ");

    const res2 = await fetch("https://query1.finance.yahoo.com/v1/test/getcrumb", {
      headers: { "User-Agent": UA, "Cookie": cookies },
      signal: AbortSignal.timeout(8000),
      cache: "no-store",
    });
    const crumb = await res2.text();
    if (!crumb || crumb.length > 30 || crumb.includes("<")) return null;
    console.log("[curva-mercado] crumb ok:", crumb.trim().slice(0, 6) + "...");
    return { crumb: crumb.trim(), cookies };
  } catch (e) {
    console.log("[curva-mercado] crumb falhou:", String(e));
    return null;
  }
}

// Busca cotações via Yahoo v7/quote com crumb (aceita contratos específicos como ZSX26=F)
async function fetchYahooV7(symbols: string[], crumb: string, cookies: string): Promise<Record<string, number>> {
  const syms = symbols.join(",");
  const url  = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${syms}&crumb=${encodeURIComponent(crumb)}&fields=regularMarketPrice&formatted=false`;
  const r = await fetch(url, {
    headers: {
      "User-Agent": UA,
      "Cookie": cookies,
      "Referer": "https://finance.yahoo.com/",
      "Accept": "application/json",
    },
    signal: AbortSignal.timeout(12000),
    cache: "no-store",
  });
  if (!r.ok) throw new Error(`Yahoo v7 HTTP ${r.status}`);
  const json = await r.json() as { quoteResponse?: { result?: { symbol: string; regularMarketPrice?: number }[] } };
  const result: Record<string, number> = {};
  for (const q of json?.quoteResponse?.result ?? []) {
    if (q.regularMarketPrice && q.regularMarketPrice > 0) result[q.symbol] = q.regularMarketPrice;
  }
  return result;
}

// Fallback: v8/chart (funciona apenas para contratos líquidos com histórico)
async function fetchYahooV8Chart(symbol: string): Promise<number> {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1d&range=1mo`;
  const r = await fetch(url, {
    headers: { "User-Agent": UA },
    signal: AbortSignal.timeout(10000),
    cache: "no-store",
  });
  if (!r.ok) throw new Error(`Yahoo v8 HTTP ${r.status}`);
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

  const hoje     = new Date().toISOString().slice(0, 10);
  const simbolos = gerarSimbolos();
  const inicio   = Date.now();
  console.log("[curva-mercado] inicio", { hoje, total: simbolos.length });

  // Limpa dados globais de hoje antes de reinserir
  await sb.from("curva_mercado")
    .delete()
    .is("fazenda_id", null)
    .eq("data_referencia", hoje)
    .in("fonte", ["YAHOO", "BARCHART"]);

  let inseridos = 0;
  const semCotacao: string[] = [];
  const erros:      string[] = [];
  let fonte = "YAHOO";

  // Tenta crumb para usar v7/quote (suporta contratos específicos)
  const auth = await getYahooCrumb();
  let precos: Record<string, number> = {};

  const isDebug = req.nextUrl.searchParams.get("debug") === "1";

  if (auth) {
    // v7/quote em lotes de 10
    const chunks: Simbolo[][] = [];
    for (let i = 0; i < simbolos.length; i += 10) chunks.push(simbolos.slice(i, i + 10));

    for (const chunk of chunks) {
      try {
        const lote = await fetchYahooV7(chunk.map(s => s.yahoo), auth.crumb, auth.cookies);
        Object.assign(precos, lote);
        if (isDebug && chunk === chunks[0]) {
          // Retorna raw response do primeiro lote para diagnóstico
          const syms = chunk.map(s => s.yahoo).join(",");
          const url  = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${syms}&crumb=${encodeURIComponent(auth.crumb)}&fields=regularMarketPrice,regularMarketTime,marketState&formatted=false`;
          const raw  = await fetch(url, { headers: { "User-Agent": UA, "Cookie": auth.cookies, "Referer": "https://finance.yahoo.com/" }, cache: "no-store" });
          const rawJson = await raw.json();
          console.log("[curva-mercado] debug raw:", JSON.stringify(rawJson).slice(0, 800));
          if (isDebug) return NextResponse.json({ debug: true, crumb: auth.crumb.slice(0,6)+"...", lote0: rawJson });
        }
      } catch (e) {
        erros.push(`v7 lote ${chunk.map(s => s.yahoo).join(",")}: ${String(e)}`);
      }
    }
    console.log("[curva-mercado] v7 precos obtidos:", Object.keys(precos).length);
  } else {
    // Fallback: v8/chart em paralelo (sem crumb; falha para contratos sem histórico)
    console.log("[curva-mercado] sem crumb, tentando v8/chart paralelo");
    fonte = "YAHOO_CHART";
    const resultados = await Promise.allSettled(simbolos.map(s => fetchYahooV8Chart(s.yahoo)));
    for (let i = 0; i < simbolos.length; i++) {
      const res = resultados[i];
      if (res.status === "fulfilled" && res.value > 0) precos[simbolos[i].yahoo] = res.value;
      else if (res.status === "rejected") erros.push(`v8 ${simbolos[i].yahoo}: ${String(res.reason)}`);
    }
    console.log("[curva-mercado] v8/chart precos obtidos:", Object.keys(precos).length);
  }

  // Insere no banco
  for (const sim of simbolos) {
    const preco = precos[sim.yahoo];
    if (!preco || preco <= 0) { semCotacao.push(sim.yahoo); continue; }

    const { error } = await sb.from("curva_mercado").insert({
      fazenda_id:      null,
      instrumento:     sim.instrumento,
      vencimento:      sim.vencimento,
      data_referencia: hoje,
      valor:           preco,
      unidade:         "cents_bu",
      fonte,
      boletim:         "fechamento",
    });

    if (error) erros.push(`${sim.yahoo}: ${error.message}`);
    else inseridos++;
  }

  const resultado = {
    ok:           erros.length === 0 && inseridos > 0,
    data:         hoje,
    fonte,
    inseridos,
    semCotacao,
    erros,
    totalSimbolos: simbolos.length,
    duracaoMs:    Date.now() - inicio,
  };
  console.log("[curva-mercado] fim", resultado);
  return NextResponse.json(resultado);
}
