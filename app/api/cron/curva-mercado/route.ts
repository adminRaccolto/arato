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
        // Yahoo Finance: ZSX26=F, ZSH27=F …
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

// Yahoo v8/chart — mesmo endpoint que funciona no /api/precos
async function fetchYahooChart(symbol: string): Promise<number> {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1d&range=5d`;
  const r = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0" },
    signal: AbortSignal.timeout(12000),
    cache:  "no-store",
  });
  if (!r.ok) throw new Error(`Yahoo HTTP ${r.status}`);
  const json = await r.json() as { chart?: { result?: { meta?: { regularMarketPrice?: number } }[] } };
  return json?.chart?.result?.[0]?.meta?.regularMarketPrice ?? 0;
}

export async function GET(req: NextRequest) {
  // Autorização (Vercel injeta header automaticamente em produção)
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
  console.log("[curva-mercado] inicio", { hoje, fonte: "YAHOO", total: simbolos.length });

  // Limpa dados globais de hoje antes de reinserir
  await sb.from("curva_mercado")
    .delete()
    .is("fazenda_id", null)
    .eq("data_referencia", hoje)
    .in("fonte", ["YAHOO", "BARCHART"]);

  // Busca todos em paralelo via v8/chart (mesmo endpoint do /api/precos)
  let inseridos = 0;
  const semCotacao: string[] = [];
  const erros:      string[] = [];

  const resultados = await Promise.allSettled(simbolos.map(s => fetchYahooChart(s.yahoo)));

  for (let i = 0; i < simbolos.length; i++) {
    const sim = simbolos[i];
    const res = resultados[i];

    if (res.status === "rejected") {
      erros.push(`${sim.yahoo}: ${String(res.reason)}`);
      continue;
    }

    const preco = res.value;
    if (!preco || preco <= 0) { semCotacao.push(sim.yahoo); continue; }

    const { error } = await sb.from("curva_mercado").insert({
      fazenda_id:      null,
      instrumento:     sim.instrumento,
      vencimento:      sim.vencimento,
      data_referencia: hoje,
      valor:           preco,
      unidade:         "cents_bu",
      fonte:           "YAHOO",
      boletim:         "fechamento",
    });

    if (error) erros.push(`${sim.yahoo}: ${error.message}`);
    else inseridos++;
  }

  const resultado = {
    ok:          erros.length === 0,
    data:        hoje,
    fonte:       "YAHOO",
    inseridos,
    semCotacao,
    erros,
    totalSimbolos: simbolos.length,
    duracaoMs:   Date.now() - inicio,
  };
  console.log("[curva-mercado] fim", resultado);
  return NextResponse.json(resultado);
}
