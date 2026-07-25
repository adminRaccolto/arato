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

async function fetchYahoo(symbols: string[]): Promise<Record<string, number>> {
  // Yahoo Finance v7 aceita até ~10 símbolos por chamada
  const syms = symbols.join(",");
  const url  = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${syms}&fields=regularMarketPrice`;
  const r = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0" },
    signal: AbortSignal.timeout(10000),
    cache:  "no-store",
  });
  if (!r.ok) throw new Error(`Yahoo HTTP ${r.status}`);
  const json = await r.json() as { quoteResponse?: { result?: { symbol: string; regularMarketPrice?: number }[] } };
  const result: Record<string, number> = {};
  for (const q of json?.quoteResponse?.result ?? []) {
    if (q.regularMarketPrice && q.regularMarketPrice > 0) result[q.symbol] = q.regularMarketPrice;
  }
  return result;
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

  // Busca em lotes de 10 (Yahoo suporta bem até esse limite)
  let inseridos = 0;
  const semCotacao: string[] = [];
  const erros:      string[] = [];

  const chunks: Simbolo[][] = [];
  for (let i = 0; i < simbolos.length; i += 10) chunks.push(simbolos.slice(i, i + 10));

  for (const chunk of chunks) {
    try {
      const precos = await fetchYahoo(chunk.map(s => s.yahoo));

      for (const sim of chunk) {
        const preco = precos[sim.yahoo];
        if (!preco) { semCotacao.push(sim.yahoo); continue; }

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
    } catch (e) {
      erros.push(`Lote ${chunk.map(s => s.yahoo).join(",")}: ${String(e)}`);
    }
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
